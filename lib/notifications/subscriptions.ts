import type { NotificationInput } from "@/lib/notifications/enqueue";
import type { SubscriptionNoticeKind } from "@/emails/templates";

/**
 * Plan-billing emails to the business owner. `version` separates real repeats (a second upgrade, dunning step 2) so a retried webhook
 * or cron run never sends the same message twice.
 */
export interface SubscriptionNotice {
  kind: SubscriptionNoticeKind;
  subscriptionId: string;
  businessId: string;
  to: string;
  name: string;
  businessName: string;
  planName: string;
  intervalLabel: string;
  amountLabel?: string;
  dateLabel?: string;
  creditLabel?: string;
  invoiceNumber?: string;
  /** Makes the key unique for events that can legitimately happen again (invoice number, charge id). */
  version?: string;
}

const appUrl = () => (process.env.NEXT_PUBLIC_APP_URL ?? "https://calvy.io").replace(/\/+$/, "");

export function subscriptionNotice(n: SubscriptionNotice): NotificationInput {
  return {
    event: `subscription.${n.kind}`,
    audience: "BUSINESS",
    subjectId: n.subscriptionId,
    version: n.version ?? n.kind,
    businessId: n.businessId,
    recipient: n.to,
    template: "subscription_notice",
    payload: {
      kind: n.kind, name: n.name, businessName: n.businessName, planName: n.planName, intervalLabel: n.intervalLabel,
      ...(n.amountLabel ? { amountLabel: n.amountLabel } : {}), ...(n.dateLabel ? { dateLabel: n.dateLabel } : {}),
      ...(n.creditLabel ? { creditLabel: n.creditLabel } : {}), ...(n.invoiceNumber ? { invoiceNumber: n.invoiceNumber } : {}),
      billingUrl: `${appUrl()}/dashboard/billing`,
    },
  };
}
