// "Your turn is coming up" for token customers (pure rules; the DB side is in lib/queueDb.ts).
//
// A customer is "N tokens away" when N open tokens are in front of them (the one being served counts). They are told
// once per "epoch": epoch = how many times they were moved back. So a customer is told once; if they are moved back
// and N is reached again they are told once more; never a third time (MAX_NEAR_SENDS per booking).

export const MAX_NEAR_SENDS = 2;

/** Tokens in front of `id` in the open queue (head first), or -1 when it is not in the queue. */
export const tokensAhead = (order: string[], id: string): number => order.indexOf(id);

/** Waiting tokens with between 1 and `n` open tokens ahead of them. The head (being served) is never "coming up". */
export function nearTokens(order: string[], n: number): { id: string; ahead: number }[] {
  return order.slice(1, n + 1).map((id, i) => ({ id, ahead: i + 1 }));
}

/** May a message for this epoch (moves back so far) still go out? Epochs 0 and 1 only. */
export const epochAllowed = (epoch: number): boolean => Number.isInteger(epoch) && epoch >= 0 && epoch < MAX_NEAR_SENDS;

export interface NearPlanInput {
  /** Open queue after the action, head first. */
  order: string[];
  n: number;
  /** Per token: still waiting (not being served) and its move-back count after the action. */
  info: Record<string, { waiting: boolean; notPresentCount: number }>;
  /** The token the action moved back, if any: it just got the moved-back message. */
  movedBackId?: string;
}

export interface NearDecision { id: string; ahead: number; epoch: number; /** Record the epoch as used without sending. */ markOnly?: string }

/** Who gets "your turn is coming up" after this queue action, and which epochs to burn without sending. */
export function planNear(i: NearPlanInput): NearDecision[] {
  const out: NearDecision[] = [];
  for (const { id, ahead } of nearTokens(i.order, i.n)) {
    const info = i.info[id];
    if (!info?.waiting || !epochAllowed(info.notPresentCount)) continue;
    if (id === i.movedBackId) {
      // Moved back but still within N: they never left the zone, so this epoch is spent (no second message for it).
      out.push({ id, ahead, epoch: info.notPresentCount, markOnly: "still near after being moved back" });
    } else {
      out.push({ id, ahead, epoch: info.notPresentCount });
    }
  }
  return out;
}
