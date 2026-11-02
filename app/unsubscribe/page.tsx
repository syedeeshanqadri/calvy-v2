import AuthShell from "@/components/auth/AuthShell";
import { prisma } from "@/lib/prisma";
import { isValidUnsubscribe } from "@/lib/notifications/prefs";
import { parseUnsubscribeParams } from "@/lib/notifications/unsubscribe";
import UnsubscribeClient from "./UnsubscribeClient";

export const dynamic = "force-dynamic";

export default async function UnsubscribePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams;
  const params = new URLSearchParams(Object.entries(raw).flatMap(([k, v]) => (typeof v === "string" ? [[k, v] as [string, string]] : [])));
  const link = parseUnsubscribeParams(params, isValidUnsubscribe);
  const business = link ? await prisma.business.findUnique({ where: { id: link.businessId }, select: { name: true } }) : null;

  return (
    <AuthShell>
      {link && business ? (
        <UnsubscribeClient businessName={business.name} query={params.toString()} />
      ) : (
        <div className="text-center">
          <h1 className="font-syne font-bold text-xl text-[#0f0f1a] mb-2">This link is not valid</h1>
          <p className="text-sm text-[#6b6b80]">Open the link from the email again, or contact the business directly.</p>
        </div>
      )}
    </AuthShell>
  );
}
