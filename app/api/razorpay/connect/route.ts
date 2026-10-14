import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  createRouteLinkedAccount,
  createRouteStakeholder,
  requestRouteProduct,
  configureRouteSettlement,
  fetchRouteAccountStatus,
} from "@/lib/razorpay";

export const dynamic = "force-dynamic";

const REQUIRED_FIELDS = [
  "email",
  "phone",
  "legalBusinessName",
  "rzpBusinessType",
  "rzpCategory",
  "rzpSubcategory",
  "panNumber",
  "addressStreet",
  "addressCity",
  "addressState",
  "addressPostalCode",
  "bankAccountName",
  "bankAccountNumber",
  "bankRoutingNumber",
] as const;

function rzpError(err: unknown): string {
  if (err && typeof err === "object") {
    // razorpay SDK errors carry { error: { description } } or { statusCode }
    const e = err as { error?: { description?: string }; message?: string };
    if (e.error?.description) return e.error.description;
    if (e.message) return e.message;
  }
  return "Razorpay request failed";
}

// GET — current onboarding status
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.businessId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const business = await prisma.business.findUnique({
    where: { id: session.user.businessId },
    select: {
      routeStatus: true,
      razorpayConnectAccountId: true,
      razorpayStakeholderId: true,
      razorpayRouteProductId: true,
    },
  });
  if (!business) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // If we have an account but it isn't activated yet, refresh live status.
  let status = business.routeStatus;
  if (business.razorpayConnectAccountId && status !== "activated") {
    try {
      const live = await fetchRouteAccountStatus(business.razorpayConnectAccountId);
      if (live === "activated" && status !== "activated") {
        await prisma.business.update({
          where: { id: session.user.businessId },
          data: { routeStatus: "activated" },
        });
        status = "activated";
      }
    } catch {
      // non-fatal — keep stored status
    }
  }

  return NextResponse.json({
    routeStatus: status,
    connected: !!business.razorpayConnectAccountId,
  });
}

// POST — create/continue the Route linked-account onboarding chain (idempotent)
export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.businessId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const business = await prisma.business.findUnique({ where: { id: session.user.businessId } });
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const missing = REQUIRED_FIELDS.filter((f) => {
    const v = (business as Record<string, unknown>)[f];
    return !v || (typeof v === "string" && !v.trim());
  });
  if (missing.length > 0) {
    return NextResponse.json(
      { error: `Complete these fields first: ${missing.join(", ")}` },
      { status: 400 },
    );
  }

  try {
    let accountId = business.razorpayConnectAccountId;
    let stakeholderId = business.razorpayStakeholderId;
    let productId = business.razorpayRouteProductId;

    // 1. Linked account
    if (!accountId) {
      accountId = await createRouteLinkedAccount({
        email: business.email!,
        phone: business.phone!,
        legalBusinessName: business.legalBusinessName!,
        customerFacingName: business.name,
        businessType: business.rzpBusinessType!,
        category: business.rzpCategory!,
        subcategory: business.rzpSubcategory!,
        pan: business.panNumber!,
        gst: business.gstNumber,
        address: {
          street: business.addressStreet!,
          city: business.addressCity!,
          state: business.addressState!,
          postalCode: business.addressPostalCode!,
          country: "IN",
        },
      });
      await prisma.business.update({
        where: { id: business.id },
        data: { razorpayConnectAccountId: accountId, routeStatus: "created" },
      });
    }

    // 2. Stakeholder
    if (!stakeholderId) {
      stakeholderId = await createRouteStakeholder(accountId, {
        name: business.bankAccountName!,
        email: business.email!,
        pan: business.panNumber!,
      });
      await prisma.business.update({
        where: { id: business.id },
        data: { razorpayStakeholderId: stakeholderId },
      });
    }

    // 3. Request route product
    if (!productId) {
      productId = await requestRouteProduct(accountId);
      await prisma.business.update({
        where: { id: business.id },
        data: { razorpayRouteProductId: productId },
      });
    }

    // 4. Submit settlement (bank) details
    const { status } = await configureRouteSettlement(accountId, productId, {
      beneficiaryName: business.bankAccountName!,
      accountNumber: business.bankAccountNumber!,
      ifsc: business.bankRoutingNumber!,
    });

    const routeStatus = status === "activated" ? "activated" : "needs_clarification";
    await prisma.business.update({
      where: { id: business.id },
      data: { routeStatus },
    });

    return NextResponse.json({ routeStatus, connected: true, productStatus: status });
  } catch (err) {
    console.error("Route onboarding error:", rzpError(err));
    return NextResponse.json({ error: rzpError(err) }, { status: 502 });
  }
}
