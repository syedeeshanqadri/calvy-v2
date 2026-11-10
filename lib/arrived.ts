/** Who may stamp "arrived", and when (pure). A token must be the one being served: there is no second "arrived" state beside the queue's own. */
export function arrivedProblem(
  a: { status: string; tokenNumber: number | null; queueState: string | null },
  who: { isOwner: boolean; write: boolean; queue: boolean },
): { status: number; message: string } | null {
  if (a.tokenNumber !== null) {
    if (!(who.isOwner || who.queue)) return { status: 403, message: "Only people who run the queue can mark a token present." };
    if (a.queueState !== "SERVING") return { status: 409, message: "Call this token first (Next), then mark it present. Use Not present if they are not there." };
    return null;
  }
  if (!(who.isOwner || who.write)) return { status: 403, message: "You may not change appointments." };
  if (!["confirmed", "pending"].includes(a.status)) return { status: 409, message: "Only an open booking can be marked as arrived." };
  return null;
}
