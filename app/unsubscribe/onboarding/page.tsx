import AuthShell from "@/components/auth/AuthShell";
import { isValidLeadUnsubscribe } from "@/lib/onboardingReminders";
import StopRemindersClient from "./StopRemindersClient";

export const dynamic = "force-dynamic";

export default async function StopRemindersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams;
  const l = typeof raw.l === "string" ? raw.l : "", s = typeof raw.s === "string" ? raw.s : "";
  const valid = !!l && !!s && isValidLeadUnsubscribe(l, s);
  return (
    <AuthShell>
      {valid ? <StopRemindersClient query={new URLSearchParams({ l, s }).toString()} /> : (
        <div className="text-center">
          <h1 className="font-syne font-bold text-xl text-[#0f0f1a] mb-2">This link is not valid</h1>
          <p className="text-sm text-[#6b6b80]">Open the link from the email again, or reply to the email and we will stop them for you.</p>
        </div>
      )}
    </AuthShell>
  );
}
