/**
 * reflowGate — §REFLOW-NO-OP-IS-NOT-WORK (L-13205 · C59 §2.10.5)
 *
 * ⭐ THE DEFECT THIS REMOVES, from the founder's own console (2026-09-07). Dragging the
 * multi-pane divider printed dozens of
 * `[gis][cesium] resize (external-reflow (multi-pane host)) — canvas NxM` lines — many of them
 * at the SAME size, logged 2× and 4×:
 *
 *     701 → 702 → 704 → 709 → 722 → 728 → 754 → … → 447 → 338
 *
 * Cesium ALREADY guards itself: `CesiumWidget.resize()` early-returns without re-allocating
 * when canvas clientWidth / clientHeight / devicePixelRatio are all unchanged. PRYZM defeated
 * that guard — `forceResizeAndRender` called `viewer.resize()` (which correctly no-ops) and then
 * `scene.requestRender()` UNCONDITIONALLY, plus a scheduled SECOND unconditional
 * `resize()+requestRender()`. The viewer runs with `requestRenderMode: true`, so
 * `requestRender()` is precisely the call that forces Cesium to draw a frame it had already
 * decided it did not need: **two full frames of a 3-D-tiles city per reflow request, on every
 * mousemove of a drag.** That is not a cosmetic log line; it is the founder's frame budget.
 *
 * Why the same size repeats at all: `SiteAuthoringPaneShell` writes the pane box as a 3-decimal
 * float percentage (`flex: 0 0 49.372%`) while `clientWidth` is an INTEGER, so consecutive drag
 * frames genuinely land on the same pixel width.
 *
 * ⛔ THIS IS NOT A DEBOUNCE, A THROTTLE, OR AN `if (alreadyApplied) return` LATCH, and
 * C59 §2.10.2's forbidden-fix list does not reach it. Read that list precisely: it forbids a
 * TIMER or a latch used to settle a FEEDBACK LOOP between two rival writers of one property —
 * such a fix makes the oscillation settle faster while leaving the two writers disagreeing, so
 * it returns the moment a transition is slower than the guard window. **There is no rival writer
 * here and nothing oscillates.** This is ONE renderer being asked to re-measure a box that has
 * not moved, and the answer is a pure function of the box the DOM reports RIGHT NOW — §2.10's
 * own template: *"termination is a PROPERTY OF THE SHAPE: the boxes are a pure function of the
 * state, so re-applying writes identical strings, which move no box…"*. It holds no timer,
 * delays nothing, and cannot go stale: the instant the box moves, the very next call does the
 * full work.
 *
 * The gate is separated from `CesiumViewport` for one reason: so the decision can be tested at
 * CALL-COUNT level against the REAL code path rather than against a re-implementation of it
 * (§FAKE-MORE-CAPABLE-THAN-REAL). `CesiumViewport.forceResizeAndRender` builds a
 * {@link ReflowPort} over the live viewer and calls {@link runReflow}; the spec builds a
 * counting port and calls the same function.
 */

/** The three quantities Cesium's own `CesiumWidget.resize()` compares. */
export interface MeasuredBox {
    readonly w: number;
    readonly h: number;
    readonly dpr: number;
}

/**
 * `'force'` — always resize + render. The "the container was hidden, 0-size, or has just been
 * MOVED in the DOM, make it paint" primitive that mount / setVisible(true) / warm-hidden /
 * re-parent depend on. Never skipped.
 *
 * `'if-changed'` — a pure re-measure request from a layout host. Does nothing when the measured
 * box is identical to the last EFFECTIVE reflow.
 */
export type ReflowMode = 'force' | 'if-changed';

/**
 * Two boxes are the same box. `null` NEVER compares equal to anything, including another
 * `null` — an unmeasurable viewer must take the full path, never be silently skipped.
 */
export function sameBox(a: MeasuredBox | null, b: MeasuredBox | null): boolean {
    return !!a && !!b && a.w === b.w && a.h === b.h && a.dpr === b.dpr;
}

/**
 * The seam between the decision and the live Cesium viewer. Everything that touches the viewer,
 * the console or the frame bus lives here; nothing else does.
 */
export interface ReflowPort {
    /** The canvas box as the DOM reports it RIGHT NOW, or `null` if it cannot be measured. */
    measure(): MeasuredBox | null;
    /** `viewer.resize()` + `scene.requestRender()`. May throw if the viewer is being torn down. */
    resizeAndRender(): void;
    /** Emit the one console line for an EFFECTIVE reflow. `skipped` is the no-op count folded in. */
    log(reason: string, skipped: number): void;
    /** Report a throw from {@link resizeAndRender}. */
    warn(error: unknown): void;
    /** Run `fn` on the next frame (frame scheduler in production). */
    scheduleSecondPass(fn: () => void): void;
    /** Is the viewer still alive at second-pass time? (It can be disposed in between.) */
    isLive(): boolean;
}

/**
 * The remembered state: the box at which the last EFFECTIVE reflow ran, and how many reflow
 * REQUESTS have been dropped as no-ops since.
 *
 * ⭐ SKIPPED IS NEVER SILENT (§CONTEXT-DATA-HONESTY). The skip count is not swallowed — the next
 * effective reflow prints it, so the console shows ONE line per genuine size with the number of
 * redundant writers attached, instead of one line per writer. "No reflow happened" and "twelve
 * reflows were dropped" must not print the same value.
 */
export class ReflowGate {
    private lastEffectiveBox: MeasuredBox | null = null;
    private skippedSinceEffective = 0;

    /** For assertions and diagnostics — the box the last effective reflow ran at. */
    get lastBox(): MeasuredBox | null {
        return this.lastEffectiveBox;
    }

    /** How many no-op reflow requests have been dropped since the last effective one. */
    get pendingSkipCount(): number {
        return this.skippedSinceEffective;
    }

    /** Would a request in `mode`, measuring `box`, be dropped as a no-op? */
    shouldSkip(mode: ReflowMode, box: MeasuredBox | null): boolean {
        return mode === 'if-changed' && sameBox(box, this.lastEffectiveBox);
    }

    /** Count a dropped request. */
    noteSkipped(): void {
        this.skippedSinceEffective++;
    }

    /** Record an effective reflow, and hand back the skip count it should print. */
    noteEffective(box: MeasuredBox | null): number {
        const skipped = this.skippedSinceEffective;
        this.skippedSinceEffective = 0;
        this.lastEffectiveBox = box;
        return skipped;
    }

    /**
     * A reflow attempt threw. Forget the box entirely rather than record a size we never
     * actually rendered at — a poisoned cache would let a later `'if-changed'` skip.
     */
    noteFailed(): void {
        this.lastEffectiveBox = null;
    }
}

/**
 * ONE reflow request: the whole decision, exactly as `CesiumViewport.forceResizeAndRender` runs it.
 *
 * 1. Measure. 2. In `'if-changed'`, drop the request when the box has not moved (count it).
 * 3. Otherwise resize + render + log once, and remember the box. 4. Schedule a second pass —
 * which itself does work ONLY if the box moved since step 3.
 *
 * ⭐ WHY THE SECOND PASS IS NOW CONDITIONAL IN BOTH MODES. It exists because a container often
 * acquires its real size a frame after `display` flips none → block. If the box has NOT moved
 * since the first pass measured it, the first pass already rendered at exactly this size and the
 * second is a forced frame for nothing. That holds under `'force'` too: force means *"do not
 * trust the cache from BEFORE this call"* — by second-pass time the first pass has established
 * the state itself.
 */
export function runReflow(
    port: ReflowPort,
    gate: ReflowGate,
    reason: string,
    mode: ReflowMode = 'force',
): void {
    const before = port.measure();
    if (gate.shouldSkip(mode, before)) {
        gate.noteSkipped();
        return;
    }

    let firstPassBox: MeasuredBox | null = null;
    try {
        port.resizeAndRender();
        firstPassBox = port.measure();
        const skipped = gate.noteEffective(firstPassBox);
        port.log(reason, skipped);
    } catch (e) {
        gate.noteFailed();
        port.warn(e);
    }

    const anchor = firstPassBox;
    port.scheduleSecondPass(() => {
        // §GLOBE-CRASH-GUARD — the viewport can be disposed between this being scheduled and
        // firing.
        if (!port.isLive()) return;
        const now = port.measure();
        if (sameBox(now, anchor)) return;
        try {
            port.resizeAndRender();
            gate.noteEffective(port.measure());
        } catch {
            /* viewer torn down mid-frame */
        }
    });
}
