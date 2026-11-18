import { getCustomerData } from "@/lib/customerData";
import { BookingsList } from "@/components/my/BookingsList";
import { PageHeader } from "@/components/my/PageHeader";
import { VerifyNotice } from "../MyClient";

export const dynamic = "force-dynamic";

export default async function MyBookingsPage() {
  const data = await getCustomerData();
  if (!data) return null;
  if (!data.verified) {
    return (
      <>
        <PageHeader title="Bookings" />
        <VerifyNotice email={data.me.email} />
      </>
    );
  }
  return (
    <>
      <PageHeader title="Bookings" subtitle="Change a time or cancel. The business is told straight away and you get an email." />
      <BookingsList upcoming={data.upcoming} past={data.past} />
    </>
  );
}
