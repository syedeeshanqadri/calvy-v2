import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCustomer } from "@/lib/customerSession";
import AuthShell from "@/components/auth/AuthShell";
import SocialAuthButtons from "@/components/auth/SocialAuthButtons";

export const dynamic = "force-dynamic";

/**
 * Checkout's "Continue with Google": a verified customer goes straight back to the business's booking page (with the signed ticket that
 * carries the member price); anyone else is offered Google here and returns to this same page. The destination is built from a business
 * that exists, never from the address, so this cannot be used as an open redirect.
 */
export default async function MemberSignInPage(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await props.searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const slug = one(sp.business).slice(0, 100);
  const service = one(sp.service).slice(0, 64);
  const business = slug ? await prisma.business.findUnique({ where: { slug }, select: { slug: true, name: true } }) : null;
  if (!business) redirect("/account/login");

  const me = await getCustomer();
  const q = `business=${encodeURIComponent(business.slug)}${service ? `&service=${encodeURIComponent(service)}` : ""}`;
  if (me?.verified) redirect(`/api/customer/book-again?${q}`);

  return (
    <AuthShell>
      <h1 className="font-syne font-bold text-2xl text-[#0f0f1a] mb-1">Pay your member price</h1>
      <p className="text-[#6b6b80] text-sm mb-2">Sign in with the Google account for the email you booked with, and we will take you back to {business.name}.</p>
      <SocialAuthButtons googleProvider="google-customer" callbackUrl={`/account/member?${q}`} />
    </AuthShell>
  );
}
