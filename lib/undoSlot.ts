// "Do it now on screen, really do it in a few seconds unless the person taps Undo." Used for Arrived / Completed / No-show / Next.
// The server is only called when the grace window ends (or the page is hidden or closed), so an undone action never happens at all:
// no email or WhatsApp is sent for it. One action can be pending at a time: starting another commits the first at once.
export interface PendingAction { label: string; commit: () => Promise<unknown>; revert: () => void }

export class UndoSlot {
  private pending: (PendingAction & { timer: ReturnType<typeof setTimeout> }) | null = null;

  constructor(private readonly windowMs: number, private readonly onChange: (label: string | null) => void) {}

  get active(): string | null { return this.pending?.label ?? null; }

  async schedule(action: PendingAction): Promise<void> {
    await this.flush();
    const timer = setTimeout(() => { void this.flush(); }, this.windowMs);
    this.pending = { ...action, timer };
    this.onChange(action.label);
  }

  /** The person tapped Undo: nothing was sent, put the screen back. */
  undo(): boolean {
    const p = this.pending;
    if (!p) return false;
    clearTimeout(p.timer);
    this.pending = null;
    this.onChange(null);
    p.revert();
    return true;
  }

  /** Send it now (window over, another action started, or the page is being hidden). */
  async flush(): Promise<void> {
    const p = this.pending;
    if (!p) return;
    clearTimeout(p.timer);
    this.pending = null;
    this.onChange(null);
    await p.commit();
  }
}
