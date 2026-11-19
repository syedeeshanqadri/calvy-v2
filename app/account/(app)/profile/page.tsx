import { getCustomerData } from "@/lib/customerData";
import { PageHeader } from "@/components/my/PageHeader";
import { ProfileCard, VerifyNotice, DeleteAccountCard } from "../MyClient";
import { prisma } from "@/lib/prisma";
import { LinkGoogle } from "@/components/settings/LinkGoogle";

export const dynamic = "force-dynamic";

export default async function MyProfilePage() {
  const data = await getCustomerData();
  if (!data) return null;
  const req = await prisma.customerDeletionRequest.findUnique({ where: { customerId: data.me.id }, select: { status: true, executeAfter: true } });
  return (
    <>
      <PageHeader title="Profile" subtitle="Your name, password, Google sign-in and account." />
      <div className="max-w-xl space-y-6">
        {!data.verified && <VerifyNotice email={data.me.email} />}
        <ProfileCard name={data.me.name} email={data.me.email} />
        <LinkGoogle endpoint="/api/customer/google" provider="google-customer" callbackUrl="/account/profile" className="p-5" />
        <DeleteAccountCard email={data.me.email} pendingUntil={req?.status === "PENDING" ? req.executeAfter.toISOString() : null} />
      </div>
    </>
  );
}
