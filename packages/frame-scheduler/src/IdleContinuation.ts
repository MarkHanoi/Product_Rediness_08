// IdleContinuation — 30-frame post-motion grace per ADR-006 / spec §S03-T2
// (line 350).  While the scene has dirty flags or interaction frame-requests
// the budget is held at the maximum (`reset()`).  Once both clear, the
// budget decrements once per tick (`consume()`).  When it hits zero, the
// FrameScheduler stops the rAF loop ("0 fps idle"); the next `markDirty()`
// or `requestFrame()` call resumes it.
//
// Distinct from `FrameCoordinator`'s 6-frame per-pass grace in PRYZM 1
// (`src/core/rendering/FrameCoordinator.ts`) — that lives in the future
// committer and gates per-pass post-FX dispatch.  IdleContinuation is the
// scheduler-level "should we keep pumping?" gate.

export const IDLE_CONTINUATION_FRAMES = 30;

export class IdleContinuation {
  private remaining: number = IDLE_CONTINUATION_FRAMES;

  /** Reset to the maximum (called whenever the scene becomes dirty again). */
  reset(): void {
    this.remaining = IDLE_CONTINUATION_FRAMES;
  }

  /**
   * Decrement the budget by one and return the remaining value.  A return of
   * `0` is the signal that the scheduler should stop the rAF loop.
   */
  consume(): number {
    if (this.remaining > 0) this.remaining--;
    return this.remaining;
  }

  /** Read-only view — useful for OTel attributes and tests. */
  get budget(): number {
    return this.remaining;
  }

  get exhausted(): boolean {
    return this.remaining === 0;
  }
}
