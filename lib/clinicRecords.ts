/**
 * Clinic records (pure): the two plain columns a clinic desk works with, built from the existing appointment
 * status and payment status. No extra fields: "done" is status completed, the fee is the payment status.
 */
export type ConsultationState = "Done" | "Pending" | "Missed" | "Cancelled";
export type FeeState = "Paid online" | "Paid at clinic" | "Not paid" | "Returned";

export function consultationState(status: string): ConsultationState {
  if (status === "completed") return "Done";
  if (status === "no-show") return "Missed";
  if (status === "cancelled" || status === "expired") return "Cancelled";
  return "Pending";
}

/** `paidOnline`: a settled online payment exists for the booking (otherwise a paid fee was taken at the desk). */
export function feeState(paymentStatus: string, paidOnline: boolean): FeeState {
  if (paymentStatus === "refunded") return "Returned";
  if (paymentStatus === "paid") return paidOnline ? "Paid online" : "Paid at clinic";
  return "Not paid";
}

/** The desk can still mark a consultation done only while it is pending. */
export const canMarkDone = (status: string): boolean => consultationState(status) === "Pending";

/** The fee choices the desk may set by hand. An online payment is already received: it can only be returned, not unpaid. */
export function feeChoices(paymentStatus: string, paidOnline: boolean): { value: "unpaid" | "paid" | "refunded"; label: string }[] {
  const all = [
    { value: "unpaid" as const, label: "Not paid" },
    { value: "paid" as const, label: "Paid at clinic" },
    { value: "refunded" as const, label: "Returned" },
  ];
  if (paidOnline) return [{ value: "paid" as const, label: "Paid online" }, all[2]];
  return paymentStatus === "refunded" ? [all[2], all[1]] : all;
}
