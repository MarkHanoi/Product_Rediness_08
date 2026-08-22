// §PARCEL-ALL-INFO (L-6900..L-6906 · C19 · C58 §1.4 / §1.16 · C84 EI-1b) — THE FOURTH STATE.
//
// Founder 2026-08-22: *"On parcel selection I want to have all information directly
// showing up: it is still on GIS."*
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⭐ "DIRECTLY" IS A TIMING CLAIM, AND THE TIMING IS MEASURED — IT IS NOT INSTANT
// ═══════════════════════════════════════════════════════════════════════════════
// From the founder's own console, one Barcelona parcel (CL ROGER DE FLOR 168):
//
//   [gis] catastro: parcel 1035716DF3813E (~2234 m², 32 pts)
//   [gis][c58] §BCN-REAL-ENVELOPE §BCN-ENVELOPE-TIMING block fetch — residual await
//              6395 ms (total since parcel-fetch start 11441 ms)
//   [gis][c58] buildable envelope computed → confidence=block-constructed status=ok
//
// So there is a SIX-TO-ELEVEN SECOND window in which the parcel is known and the
// jurisdiction's real determination is not. "All information directly showing up"
// cannot mean "block until it resolves" — a panel that renders nothing for eleven
// seconds is the L-553 defect (a blank surface reads as a crash, not as "working").
//
// ── WHY THIS IS ITS OWN STATE AND NOT A REUSE OF AN EXISTING ONE ──────────────
//
// The surrounding vocabulary already models THREE dispositions and refuses to
// collapse them, because they call for opposite responses:
//
//   NOT CHECKED   — we did not measure it (capacityPanelSection.ts)
//   NO LIMIT SET  — the ordinance published no limit
//   OVER          — measured, and it exceeds the limit
//
// None of them is true during the window. "NOT CHECKED" is the closest and it is
// still wrong: it says a check was declined, when in fact a check is RUNNING and an
// answer is coming. Folding "in flight" into "declined" is the same conflation
// [[context-data-honesty-family]] names — failure and emptiness rendered as one
// value — with a third member added. So the window gets its own word: RESOLVING.
//
// ⛔ AND IT MUST BE ABLE TO END. §L-716 ([[unsatisfiable-gate-decomposition-is-the-fix]]):
// a flag that is only ever cleared on the SUCCESS path is a spinner that can spin
// forever, and "resolving" shown for ten minutes is a lie of a different shape. The
// per-city async chains in `siteDispatch.ts` have ~15 guard/catch exits, and not
// every one of them reaches `dispatchEnvelope`. So this module does NOT trust a
// clear() to arrive: RESOLVING is time-bounded by construction, and on expiry it
// becomes STALLED — a fourth, differently-worded state carrying an escape hatch,
// never a silent revert to "nothing here".
//
// ── NO DOM, NO STORE, NO FETCH ────────────────────────────────────────────────
// Deliberately dependency-free so `siteDispatch.ts` (512 KB) and the parcel rail
// panel can both use it without the panel importing the dispatcher, and so every
// arm is unit-testable against an injected clock rather than a real one.

/** Which of the four dispositions the envelope determination is currently in. */
export type EnvelopeResolutionPhase =
    /** Nothing has been asked for — no parcel committed, or the last answer already landed. */
    | 'idle'
    /** A determination was launched and is inside its deadline. An answer is expected. */
    | 'resolving'
    /** A determination was launched, the deadline passed, and no answer ever arrived. */
    | 'stalled';

/**
 * How long a determination may run before `resolving` becomes `stalled`.
 *
 * ⚠ CHOSEN FROM THE MEASUREMENT, NOT FROM TASTE. The founder's Barcelona parcel took
 * **11441 ms** end-to-end (6395 ms of it residual await on the manzana block fetch).
 * A deadline near that number would flip a HEALTHY resolve to "stalled" on a slower
 * link and turn a working feature into an apparent failure — the §L-553 trade this
 * codebase has already made once and regretted. 45 s is ~4x the measured worst case:
 * long enough that a real answer is never mislabelled, short enough that a chain
 * which died in a catch does not leave a spinner on screen for the session.
 */
export const ENVELOPE_RESOLUTION_DEADLINE_MS = 45_000;

interface ResolutionRecord {
    /** `Date.now()` at launch. */
    readonly startedAtMs: number;
    /**
     * Vertex count of the boundary the determination was launched for. NOT an identity
     * — it is a cheap DIFFERENCE detector, and it is used only to notice that a NEWER
     * parcel superseded an older in-flight one. See `beginEnvelopeResolution`.
     */
    readonly boundaryVertexCount: number;
}

let _record: ResolutionRecord | null = null;

/** Injectable clock — production passes nothing; tests pass a fake. */
type Clock = () => number;
const systemClock: Clock = () => Date.now();

/**
 * Record that a buildable-envelope determination has been LAUNCHED for a parcel with
 * `boundaryVertexCount` vertices.
 *
 * Called at `applyZoning`, the ONE synchronous chokepoint every jurisdiction branch
 * passes through before it forks into its own async chain — the same argument
 * `_lastParcelQueryPoint` makes for living there rather than being threaded through
 * fifteen call sites: a guard that must be added at every exit is a guard that will be
 * omitted at the sixteenth.
 *
 * Re-entrant on purpose: a second commit while the first is in flight simply REPLACES
 * the record. The older chain's late arrival is already discarded upstream by
 * `isZoningResponseStale` (§L-644), so the phase must follow the NEWEST parcel, not the
 * oldest outstanding request.
 */
export function beginEnvelopeResolution(
    boundaryVertexCount: number,
    now: Clock = systemClock,
): void {
    _record = { startedAtMs: now(), boundaryVertexCount };
}

/**
 * Record that the determination SETTLED — with an answer, a cited refusal, or a
 * suppression. All three are settlements: each is a stated disposition, and none of
 * them should keep saying "resolving".
 *
 * Called from `dispatchEnvelope`, which every path that produces a `BuildableEnvelope`
 * funnels through (the real solve, the estimated fallback, and `buildRefusedEnvelope`).
 */
export function noteEnvelopeResolutionSettled(): void {
    _record = null;
}

/**
 * C13 §4 — drop the record on project teardown. A resolution belonging to project A
 * must not describe project B's blank parcel panel.
 */
export function resetEnvelopeResolutionState(): void {
    _record = null;
}

/** The current phase, evaluated against the deadline. Never throws. */
export function getEnvelopeResolutionPhase(now: Clock = systemClock): EnvelopeResolutionPhase {
    if (!_record) return 'idle';
    const elapsed = now() - _record.startedAtMs;
    // A clock that ran BACKWARDS (system time change, a test clock reset) yields a
    // negative elapsed. Treat it as "still resolving" rather than as an expiry: the
    // resolve genuinely has not been observed to finish, and inventing a stall from a
    // clock artefact would report a failure that did not happen.
    if (elapsed >= ENVELOPE_RESOLUTION_DEADLINE_MS) return 'stalled';
    return 'resolving';
}

/**
 * Milliseconds until `resolving` expires into `stalled`, or `null` when not resolving.
 *
 * The panel uses this to schedule ONE `setTimeout` rather than polling: the SUCCESS
 * transition already arrives for free (the settle writes through `site.updateZoning`,
 * which notifies the `SiteModelStore` the panel is subscribed to), so the only
 * transition without a natural signal is the expiry — and it needs exactly one timer.
 */
export function msUntilEnvelopeResolutionDeadline(now: Clock = systemClock): number | null {
    if (!_record) return null;
    const remaining = ENVELOPE_RESOLUTION_DEADLINE_MS - (now() - _record.startedAtMs);
    return remaining > 0 ? remaining : 0;
}

/** Diagnostics for the C13 leak report / tests. Never throws. */
export function describeEnvelopeResolutionState(now: Clock = systemClock): Record<string, unknown> {
    return {
        phase: getEnvelopeResolutionPhase(now),
        startedAtMs: _record?.startedAtMs ?? null,
        boundaryVertexCount: _record?.boundaryVertexCount ?? null,
        deadlineMs: ENVELOPE_RESOLUTION_DEADLINE_MS,
    };
}
