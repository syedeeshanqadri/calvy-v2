import { getCustomerData } from "@/lib/customerData";
import { PageHeader } from "@/components/my/PageHeader";
import { ProfileCard, VerifyNotice } from "../MyClient";

export const dynamic = "force-dynamic";

export default async function MyProfilePage() {
  const data = await getCustomerData();
  if (!data) return null;
  return (
    <>
      <PageHeader title="Profile" subtitle="Your name and password." />
      <div className="max-w-xl space-y-6">
        {!data.verified && <VerifyNotice email={data.me.email} />}
        <ProfileCard name={data.me.name} email={data.me.email} />
      </div>
    </>
  );
}
