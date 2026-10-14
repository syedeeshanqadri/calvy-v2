import Link from "next/link";
import { Check } from "lucide-react";
import { razorpay } from "@/lib/razorpay";
import { prisma } from "@/lib/prisma";
import { sendBookingConfirmation } from "@/lib/email";

export const dynamic = 'force-dynamic';

export default async function BookingSuccessPage({
  searchParams,
}: {
  searchParams: {
    razorpay_payment_link_id?: string;
    razorpay_payment_link_status?: string;
  };
}) {
  let meta: Record<string, string> = {};
  let paymentVerified = false;
  let businessName = "";

  const { razorpay_payment_link_id: paymentLinkId, razorpay_payment_link_status: status } = searchParams;

  if (paymentLinkId && status === "paid" && process.env.RAZORPAY_KEY_ID) {
    try {
      const link = await (razorpay.paymentLink.fetch as any)(paymentLinkId) as any;
      paymentVerified = link.status === "paid";
      meta = link.notes ?? {};

      if (paymentVerified && meta.businessSlug && meta.clientEmail) {
        // Fallback appointment creation in case webhook hasn't fired yet
        const existing = await prisma.appointment.findFirst({ where: { razorpayPaymentId: paymentLinkId } });

        if (!existing) {
          const business = await prisma.business.findUnique({ where: { slug: meta.businessSlug } });
          businessName = business?.name ?? "";

          let serviceIds: string[] = [];
          if (meta.serviceIds) {
            try { serviceIds = JSON.parse(meta.serviceIds); } catch { serviceIds = [meta.serviceIds]; }
          } else if (meta.serviceId) {
            serviceIds = [meta.serviceId];
          }

          if (business && serviceIds.length > 0) {
            const services = await prisma.service.findMany({ where: { id: { in: serviceIds } } });
            const servicesMap = new Map(services.map(s => [s.id, s]));
            const orderedServices = serviceIds.map(id => servicesMap.get(id)).filter(Boolean) as typeof services;

            if (orderedServices.length > 0) {
              const totalPrice = orderedServices.reduce((sum, s) => sum + s.price, 0);
              const totalDuration = orderedServices.reduce((sum, s) => sum + s.duration, 0);
              const serviceNamesLabel = orderedServices.map(s => s.name).join(" & ");

              const combinedNotes = (() => {
                const prefix = orderedServices.length > 1
                  ? `__services__:${orderedServices.slice(1).map(s => s.name).join("|")}` : "";
                if (prefix && meta.notes) return `${prefix}\n${meta.notes}`;
                if (prefix) return prefix;
                return meta.notes || null;
              })();

              let client = await prisma.client.findUnique({
                where: { businessId_email: { businessId: business.id, email: meta.clientEmail } },
              });
              if (!client) {
                client = await prisma.client.create({
                  data: {
                    businessId: business.id,
                    name: meta.clientName,
                    email: meta.clientEmail,
                    phone: meta.clientPhone || null,
                  },
                });
              }

              const appointmentDate = new Date(`${meta.date}T${meta.time}:00`);

              await prisma.appointment.create({
                data: {
                  businessId: business.id,
                  clientId: client.id,
                  staffId: meta.staffId || null,
                  serviceId: orderedServices[0].id,
                  date: appointmentDate,
                  duration: totalDuration,
                  price: totalPrice,
                  status: "confirmed",
                  notes: combinedNotes,
                  razorpayPaymentId: paymentLinkId,
                  paymentStatus: "paid",
                  paymentMode: "prepaid",
                },
              });

              await prisma.client.update({
                where: { id: client.id },
                data: {
                  totalAppointments: { increment: 1 },
                  totalSpent: { increment: totalPrice },
                  lastVisit: appointmentDate,
                },
              });

              const dateLabel = appointmentDate.toLocaleDateString("en-US", {
                weekday: "long", month: "long", day: "numeric",
              });

              try {
                await sendBookingConfirmation({
                  to: meta.clientEmail,
                  clientName: meta.clientName,
                  businessName: business.name,
                  serviceName: serviceNamesLabel,
                  staffName: meta.staffId ? "Your provider" : "Any available",
                  date: dateLabel,
                  time: meta.time,
                  duration: totalDuration,
                  price: totalPrice,
                  currency: business.currency ?? "INR",
                  appointmentDate,
                });
              } catch (err) {
                console.error("[Email] Failed:", err);
              }
            }
          }
        } else {
          const biz = await prisma.business.findUnique({
            where: { slug: meta.businessSlug },
            select: { name: true },
          });
          businessName = biz?.name ?? "";
        }
      }
    } catch (err) {
      console.error("[Success page] Error:", err);
    }
  }

  return (
    <div className="min-h-screen bg-[#f8f7f4] flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl p-10 max-w-md w-full text-center shadow-xl border border-[#e8e6e0]">
        <div className="w-16 h-16 rounded-full bg-green-50 flex items-center justify-center mx-auto mb-6">
          <Check size={28} className="text-green-600" />
        </div>

        <h1 className="font-syne font-bold text-2xl mb-2">You&apos;re booked! 🎉</h1>
        {businessName && <p className="text-accent font-semibold text-sm mb-2">{businessName}</p>}
        <p className="text-[#6b6b80] mb-6">
          {meta.clientEmail
            ? <>A confirmation has been sent to <strong>{meta.clientEmail}</strong>.</>
            : "Your appointment has been confirmed. Check your email for details."}
        </p>

        {(meta.date || meta.time) && (
          <div className="bg-[#f8f7f4] rounded-2xl p-5 text-left mb-6 space-y-2">
            {meta.date && (
              <div className="flex justify-between text-sm">
                <span className="text-[#6b6b80]">Date</span>
                <span className="font-medium">{meta.date}</span>
              </div>
            )}
            {meta.time && (
              <div className="flex justify-between text-sm">
                <span className="text-[#6b6b80]">Time</span>
                <span className="font-medium">{meta.time}</span>
              </div>
            )}
            {paymentVerified && (
              <div className="flex justify-between text-sm border-t border-[#f0ede8] pt-2 mt-2">
                <span className="font-semibold">Payment</span>
                <span className="font-bold text-green-600">Paid ✓</span>
              </div>
            )}
          </div>
        )}

        <Link
          href="/"
          className="block w-full bg-[#0f0f1a] text-white font-semibold rounded-xl py-3 text-sm text-center hover:bg-[#1a1a2e] transition-colors"
        >
          Back to home
        </Link>
      </div>
    </div>
  );
}
