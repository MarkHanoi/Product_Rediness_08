/**
 * loadingProgress.ts — PURE progress maths for the ONE loading overlay.
 *
 * §FEAT-VIEW-ACTIVATION-LOADING-OVERLAY (L-270). The overlay surface renders an
 * ABSOLUTE ratio; each PRODUCER owns how that ratio is derived from ITS OWN real
 * signal. Those derivations live here — pure, no DOM, unit-testable:
 *
 *   • BATCH EXECUTION     — the fragment-builder drain frames (`built` this frame /
 *                           `remaining` still queued) accumulate into a cumulative
 *                           built / peak-total ratio. (§LOADING-REAL-PROGRESS — moved
 *                           here verbatim from BatchLoadingIndicator; the semantics
 *                           are the BATCH's, not the overlay's.)
 *   • VIEW ACTIVATION     — a weighted STAGE plan (viewer → tiles → content → anchor)
 *                           where the tiles stage carries a REAL streaming ratio from
 *                           Cesium's own tile counters, so the bar advances on data,
 *                           never on a timer.
 *   • STALL WATCHDOG      — the §LOAD-TIMEOUT-PROGRESS discipline: we do NOT race a
 *                           fixed deadline; we fail only when progress STOPS ADVANCING
 *                           for a sustained window. A slow-but-advancing stream is not
 *                           a failure; a frozen one is.
 *
 * No I/O, no DOM, no THREE. Deterministic in, deterministic out.
 */

// ─── BATCH producer ────────────────────────────────────────────────────────────

/** Cumulative state of one visible batch generation (spans back-to-back sub-batches). */
export interface BatchProgressState {
    /** Elements built since the overlay was last shown from hidden. */
    cumBuilt: number;
    /** Peak `built + remaining` ever seen — the honest, monotonic total estimate. */
    total: number;
    /** True once at least one real drain frame has arrived this session. */
    hasRealProgress: boolean;
}

export function createBatchProgressState(seedTotal = 0): BatchProgressState {
    return {
        cumBuilt: 0,
        total: Math.max(0, Math.floor(seedTotal)),
        hasRealProgress: false,
    };
}

/**
 * Fold one fragment-builder drain frame into the cumulative state.
 * `built` = elements built in the frame that just completed; `remaining` = still queued.
 * The total is the PEAK of (built-so-far + still-queued) → monotonic, so the bar never
 * jumps backwards as new sub-batches enqueue.
 */
export function accumulateBatchProgress(
    state: BatchProgressState,
    built: number,
    remaining: number,
): BatchProgressState {
    const b = Math.max(0, Math.floor(built));
    const r = Math.max(0, Math.floor(remaining));
    const cumBuilt = state.cumBuilt + b;
    return {
        cumBuilt,
        total: Math.max(state.total, cumBuilt + r),
        hasRealProgress: true,
    };
}

/** Thousands-separated integer (locale-independent grouping). */
export function formatCount(n: number): string {
    return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** The "1,240 / 2,355 elements" note line. Empty while only a bogus seed count is known. */
export function batchProgressNote(state: BatchProgressState): string {
    if (!state.hasRealProgress && state.total <= 1) return '';
    const built = formatCount(state.cumBuilt);
    if (state.total > state.cumBuilt) return `${built} / ${formatCount(state.total)} elements`;
    return `${built} element${state.cumBuilt === 1 ? '' : 's'}`;
}

const BATCH_PHASE_LABELS: Readonly<Record<string, string>> = {
    structure: 'Building structure…',
    facade: 'Glazing façade…',
    openings: 'Placing windows & doors…',
    furnish: 'Furnishing…',
    lighting: 'Placing lighting…',
};

export function batchPhaseLabel(phaseHint?: string): string {
    if (!phaseHint) return 'Building elements…';
    return BATCH_PHASE_LABELS[phaseHint] ?? 'Building elements…';
}

// ─── VIEW-ACTIVATION producer ──────────────────────────────────────────────────

/**
 * The stages of a Cesium view activation, in order, with the share of the bar each
 * owns. These are REAL milestones with REAL signals behind them — not a decorative
 * sequence:
 *   viewer  — CesiumViewport.whenReady() (the viewer is mounted).
 *   tiles   — the tile/terrain streams report zero pending + zero processing work.
 *   content — the building content placement (massing + the GLB real-model overlay)
 *             issued by GISAreaLayout has landed.
 *   anchor  — §FIX-CESIUM-GLOBE-ELEVATION-AND-GEOREF (L-259) seat-and-reveal: the
 *             ground datum SETTLED, so the model is anchored on real ground (or the
 *             viewport has explicitly given up and said so). THIS is the signal that
 *             made the globe show a buried building when it was not awaited.
 */
export type ViewActivationStage = 'viewer' | 'tiles' | 'content' | 'anchor' | 'ready';

interface StagePlanEntry {
    readonly stage: ViewActivationStage;
    readonly weight: number;
    readonly label: string;
}

export const VIEW_ACTIVATION_PLAN: readonly StagePlanEntry[] = [
    { stage: 'viewer', weight: 0.15, label: 'Starting the globe…' },
    { stage: 'tiles', weight: 0.45, label: 'Streaming terrain & 3D tiles…' },
    { stage: 'content', weight: 0.25, label: 'Placing your building…' },
    { stage: 'anchor', weight: 0.15, label: 'Anchoring to the ground…' },
];

/** Scale used for the absolute {completed,total} the surface consumes. */
export const VIEW_ACTIVATION_TOTAL = 1000;

/**
 * The user-facing label for a stage, INCLUDING ITS POSITION IN THE SEQUENCE.
 *
 * §STAGE-LABEL-CARRIES-ITS-SCOPE (founder 2026-08-07) — the founder saw
 * `"Streaming terrain & 3D tiles… 45 / 45 tiles"` above a bar reading **60 %** and reasonably read
 * it as broken.
 *
 * ⚠ NEITHER NUMBER WAS WRONG. `viewActivationProgress('tiles', 1)` is `0.15 + 0.45 = 0.60`, which
 * is exactly right: tiles are done, and `content` (0.25) and `anchor` (0.15) have not started. The
 * defect is that TWO DIFFERENT DENOMINATORS were shown side by side with nothing to say they
 * measure different things — "45 / 45" is STAGE-local, "60 %" is WHOLE-ACTIVATION. Read together
 * they look like a contradiction, and a progress indicator that appears to contradict itself is
 * worse than one that says less.
 *
 * Naming the step ("step 2 of 4") gives the stage-local counter a visible scope, so the two
 * readings compose instead of competing. ⚠ Fixing this by rescaling the bar to the stage would be
 * the wrong repair — the bar's job is the whole activation, and a bar that hit 100 % three times
 * before finishing would be the worse lie.
 */
export function viewActivationStageLabel(stage: ViewActivationStage): string {
    const index = VIEW_ACTIVATION_PLAN.findIndex((s) => s.stage === stage);
    if (index < 0) return 'Ready';
    return `${VIEW_ACTIVATION_PLAN[index]!.label} (step ${index + 1} of ${VIEW_ACTIVATION_PLAN.length})`;
}

/**
 * The stage's bare label, with no step counter — for embedding in PROSE.
 *
 * ⚠ Exists so the step counter cannot leak into a sentence. The stall message reads
 * `…stopped responding while ${…}`, and interpolating the UI label there would produce
 * "stopped responding while placing your building… (step 3 of 4)". The step counter is a property
 * of the PROGRESS SURFACE, not of the stage's name.
 */
export function viewActivationStageText(stage: ViewActivationStage): string {
    return VIEW_ACTIVATION_PLAN.find((s) => s.stage === stage)?.label ?? 'Ready';
}

/**
 * Absolute progress for `stage` at `stageFraction` (0..1) of that stage's own work.
 * Every earlier stage counts as complete. `ready` is 100 %.
 */
export function viewActivationProgress(
    stage: ViewActivationStage,
    stageFraction = 0,
): { completed: number; total: number } {
    if (stage === 'ready') return { completed: VIEW_ACTIVATION_TOTAL, total: VIEW_ACTIVATION_TOTAL };
    let base = 0;
    for (const entry of VIEW_ACTIVATION_PLAN) {
        if (entry.stage === stage) {
            const f = Math.max(0, Math.min(1, stageFraction));
            return {
                completed: Math.round((base + entry.weight * f) * VIEW_ACTIVATION_TOTAL),
                total: VIEW_ACTIVATION_TOTAL,
            };
        }
        base += entry.weight;
    }
    return { completed: 0, total: VIEW_ACTIVATION_TOTAL };
}

/** A snapshot of Cesium's own tile streaming counters. */
export interface TileStreamSnapshot {
    /** Tile requests in flight (network). */
    readonly pending: number;
    /** Tiles downloaded but not yet processed/uploaded. */
    readonly processing: number;
    /** Cesium's own "everything for this view is loaded" flag. */
    readonly tilesLoaded: boolean;
    /**
     * §TILES-PROVIDER-READY (L-714) — the PROVIDER's verdict alone (`globe.tilesLoaded &&
     * tileset.tilesLoaded`), independent of `pending`/`processing`. Optional so a caller that
     * cannot supply it degrades to the strict counter behaviour rather than silently settling.
     */
    readonly providerLoaded?: boolean;
    /**
     * §READINESS-TERMS-ARE-SEPARABLE (L-716) — the SEPARATE terms behind `providerLoaded`, each
     * with its own applicability. Optional: a producer that cannot decompose degrades to the
     * aggregate exactly as before.
     */
    readonly terms?: readonly TileReadinessTermSnapshot[];
    /** §FRAMES-REQUESTED-ARE-NOT-FRAMES-RENDERED (L-716) — `scene.frameState.frameNumber`. */
    readonly frameNumber?: number;
}

/** One named, separately-applicable term of the tile-readiness conjunction. */
export interface TileReadinessTermSnapshot {
    readonly name: string;
    readonly applicable: boolean;
    readonly value: boolean;
    readonly why: string;
}

/**
 * §READINESS-MUST-BE-SATISFIABLE (L-716) — how long a COMPLETELY FROZEN snapshot (nothing
 * outstanding, no field changing) may persist, while frames are demonstrably being drawn, before
 * the gate concludes its remaining term is UNSATISFIABLE rather than slow.
 *
 * ⚠ WHY A GATE MAY CONCLUDE THIS AT ALL. With `pending === 0 && processing === 0` every tile the
 * scene asked for has arrived. If a readiness term is STILL false after that, and frames are being
 * drawn (so the term has had every opportunity to update), the term is not lagging — it cannot
 * move. Continuing to hold the user behind a spinner then asserts "still loading" about work that
 * has finished, which is the same overstatement §CONTEXT-DATA-HONESTY forbids. The gate stops
 * waiting and SAYS SO, naming the term; it does not silently pretend the term went true.
 *
 * ⚠ AND WHY IT MAY NOT CONCLUDE IT WHEN FRAMES ARE NOT BEING DRAWN. A frozen snapshot with no
 * frames rendered is STARVED, not unsatisfiable — the terms never got a chance. Those two must
 * never collapse into one verdict; collapsing them is exactly what cost the first five rounds.
 */
export const UNSATISFIABLE_TERM_MS = 8_000;

/**
 * The gate's verdict on the tiles stage — the ONE place "complete", "stuck", "starved" and
 * "unsatisfiable" are told apart. PURE: every input is a value, so all four branches are testable
 * without a browser, a viewer or a clock.
 */
export type TileReadinessVerdict =
    /** Work is genuinely in flight (or too early to judge) — keep waiting. */
    | { readonly kind: 'streaming' }
    /** Complete. The tiles stage may settle. */
    | { readonly kind: 'settled' }
    /**
     * Nothing outstanding, frames ARE being drawn, and an applicable term is still false and
     * frozen — it cannot become true in this configuration. Settle the stage WITH DISCLOSURE.
     */
    | { readonly kind: 'unsatisfiable'; readonly terms: readonly string[] }
    /**
     * Nothing has changed and NOTHING IS BEING DRAWN despite the gate requesting frames. The
     * terms never had a chance to update. This is not a tile failure and must never be reported
     * as one.
     */
    | { readonly kind: 'starved' };

export interface TileReadinessEvidence {
    /** How long the whole snapshot has been byte-for-byte unchanged. */
    readonly msSinceSnapshotChange: number;
    /** Frames the gate REQUESTED via the L-715 pump. */
    readonly framesPumped: number;
    /** Frames the scene actually DREW (frameNumber advances). Undefined → not observable. */
    readonly framesRendered: number | undefined;
    /** How long the provider has continuously reported loaded (drives the L-713 grace period). */
    readonly providerLoadedForMs: number;
}

/**
 * §READINESS-MUST-BE-SATISFIABLE (L-716) — classify the tiles stage from evidence alone.
 *
 * ⚠ THE ORDER OF THESE BRANCHES IS THE CONTRACT. Success first (never call a finished load
 * anything else); then genuine in-flight work; then STARVED before UNSATISFIABLE, because a term
 * that was never given a frame has not been shown to be unsatisfiable — only unobserved.
 */
export function tileReadinessVerdict(
    snapshot: TileStreamSnapshot,
    evidence: TileReadinessEvidence,
    unsatisfiableMs: number = UNSATISFIABLE_TERM_MS,
): TileReadinessVerdict {
    if (tileStreamSettled(snapshot, evidence.providerLoadedForMs)) return { kind: 'settled' };
    const outstanding = Math.max(0, snapshot.pending) + Math.max(0, snapshot.processing);
    // Real work in flight — nothing to diagnose, the load is simply not finished.
    if (outstanding > 0) return { kind: 'streaming' };
    // Nothing outstanding, yet not settled. Give the snapshot a chance to move before judging.
    if (evidence.msSinceSnapshotChange < unsatisfiableMs) return { kind: 'streaming' };
    // Frozen. Was the scene even being drawn? Requested frames are not rendered frames.
    if (evidence.framesPumped > 0 && evidence.framesRendered === 0) return { kind: 'starved' };
    // Frozen, drawn, nothing outstanding → name the applicable terms that refuse to move.
    const stuck = (snapshot.terms ?? [])
        .filter((t) => t.applicable && !t.value)
        .map((t) => `${t.name} (${t.why})`);
    if (stuck.length > 0) return { kind: 'unsatisfiable', terms: stuck };
    // No decomposed terms available (older producer) — the aggregate alone is frozen-false.
    return { kind: 'unsatisfiable', terms: ['providerLoaded (no decomposed terms reported)'] };
}

/**
 * §TILES-SETTLED-IS-NOT-STALLED (L-713, founder 2026-08-07) — how long Cesium's own
 * `tilesLoaded` flag must hold true, with a residual counter that is NOT draining, before we
 * believe the flag over the counter.
 *
 * ⚠ WHY THIS CONSTANT HAS TO EXIST. The completion test was `tilesLoaded && outstanding === 0` —
 * Cesium's authoritative "everything for this view is loaded" flag ANDed with a secondary counter,
 * so a counter that never reaches zero vetoes a definitive completion signal. The founder's log is
 * the proof: `tilesLoaded=true renderedTerrainTiles=7 camH=663m` WHILE the gate reported
 * `no progress for 25000 ms`. Terrain had demonstrably loaded and was rendering; the gate could not
 * see it, and the 25 s watchdog fired a "map tiles have stopped streaming" error over a working view.
 *
 * ⚠ AND THE WATCHDOG COULD NOT TELL THE DIFFERENCE, WHICH IS THE DEEPER FAULT. `advance()` only
 * refreshes `lastAdvanceAt` when the fraction STRICTLY INCREASES, so a fraction that has stopped
 * rising because streaming FINISHED is indistinguishable from one that stopped because streaming
 * STUCK. A "no progress for 25 s" test fails identically for *finished* and *stalled* — the same
 * failure-and-success-are-the-same-value shape as the §CONTEXT-DATA-HONESTY family (L-422/457/467).
 *
 * ⚠ THE NAIVE FIX — "just trust `tilesLoaded`" — IS WRONG, and the AND was not arbitrary.
 * `tilesLoaded` is transiently TRUE before streaming begins, so trusting it unconditionally
 * dismisses the overlay instantly and re-opens L-259 (the building placed before terrain loaded,
 * ending up ~50 m underground). The flag is only meaningful once it has HELD. Hence a grace period
 * rather than a straight swap: unambiguous completion (`outstanding === 0`) still settles
 * immediately; a stuck residual counter settles only after the flag has been continuously true for
 * this long, which a genuinely still-streaming view will not do.
 */
export const TILE_SETTLE_GRACE_MS = 3_000;

/**
 * Has tile streaming SETTLED? `tilesLoadedForMs` is how long `snapshot.tilesLoaded` has been
 * continuously true (0 when it is false). PURE + testable.
 *
 * Returns true on either of two honest answers:
 *   • `tilesLoaded` AND nothing outstanding — unambiguous, settles at once;
 *   • `tilesLoaded` sustained for `TILE_SETTLE_GRACE_MS` while a residual counter refuses to
 *     drain — believe Cesium's own flag rather than fail a view that is visibly rendering.
 */
export function tileStreamSettled(
    snapshot: TileStreamSnapshot,
    tilesLoadedForMs: number,
    graceMs: number = TILE_SETTLE_GRACE_MS,
): boolean {
    const outstanding = Math.max(0, snapshot.pending) + Math.max(0, snapshot.processing);
    // Unambiguous: our counters agree with the provider. Unchanged, and still the common path.
    if (snapshot.tilesLoaded && outstanding === 0) return true;
    // §TILES-PROVIDER-READY (L-714) — ⚠ GATE ON THE PROVIDER'S VERDICT, NOT ON OUR COUNTER.
    //
    // The founder's screenshot read `19 / 20 tiles` — outstanding === 1, forever. One queue entry
    // that will never resolve is enough to hold the whole view hostage, because "every requested
    // tile has arrived" was the readiness condition.
    //
    // ⚠ THAT WAS THE WRONG CONDITION, and this is the architectural answer rather than a patch to
    // the count. `globe.tilesLoaded` ALREADY means "everything for the CURRENT VIEW is loaded" —
    // Cesium computes coverage of the active frustum itself, which is exactly the readiness
    // question worth asking. We were overriding a correct, provider-computed answer with a
    // stricter one of our own that a single stuck request could falsify. A 3D site view is usable
    // at full frustum coverage with stragglers still streaming; nobody's workflow is auditing tile
    // completeness.
    //
    // The grace period stays, and is now REACHABLE (it could not fire before — see
    // `TileLoadProgress.providerLoaded`): `providerLoaded` is transiently true before streaming
    // begins, so believing it instantly would re-open L-259, the building placed on unmeasured
    // ground ~50 m under the terrain. It must HOLD first, which a genuinely streaming view will
    // not do.
    if (snapshot.providerLoaded === true) return tilesLoadedForMs >= graceMs;
    return false;
}

/**
 * REAL tile-streaming ratio. `peakOutstanding` is the highest outstanding count seen so
 * far this activation — the honest denominator (Cesium never tells you the total up
 * front). Returns null when nothing has ever been outstanding AND tiles are not loaded
 * (no data yet → the caller shows an indeterminate creep rather than a fake 0 %).
 */
export function tileStreamFraction(
    snapshot: TileStreamSnapshot,
    peakOutstanding: number,
): number | null {
    const outstanding = Math.max(0, snapshot.pending) + Math.max(0, snapshot.processing);
    if (snapshot.tilesLoaded && outstanding === 0) return 1;
    if (peakOutstanding <= 0) return null;
    const done = Math.max(0, peakOutstanding - outstanding);
    // Never report 1 from the ratio alone — only `tilesLoaded` proves completion.
    return Math.min(0.99, done / peakOutstanding);
}

/** The note under the label: "412 / 1,205 tiles". Empty when there is nothing honest to say. */
export function tileStreamNote(snapshot: TileStreamSnapshot, peakOutstanding: number): string {
    const outstanding = Math.max(0, snapshot.pending) + Math.max(0, snapshot.processing);
    if (peakOutstanding <= 0) return '';
    const done = Math.max(0, peakOutstanding - outstanding);
    // §TILES-PROVIDER-READY (L-714) — ⚠ WHEN WE REVEAL EARLY, SAY SO. Gating on the provider's
    // coverage instead of on every requested tile means the view can open with stragglers still in
    // flight. That is the right trade for usability, but presenting partial context as complete is
    // the overstatement §ENVELOPE-SOLID-OVERSTATES and the L-513b honesty contract both forbid —
    // on real land a missing neighbour is not an absent neighbour. The disclosure moves, it does
    // not disappear.
    if (snapshot.providerLoaded === true && outstanding > 0) {
        return `${formatCount(done)} / ${formatCount(peakOutstanding)} tiles — still filling in`;
    }
    return `${formatCount(done)} / ${formatCount(peakOutstanding)} tiles`;
}

// ─── STALL WATCHDOG ────────────────────────────────────────────────────────────

/**
 * §LOAD-TIMEOUT-PROGRESS discipline (G2/0.3a): NEVER race a fixed deadline against a
 * live stream — a 30 s cap fails a slow-but-healthy load and passes a frozen one. Fail
 * ONLY when nothing has advanced for `stallMs`. `lastAdvanceAt` must be bumped on every
 * stage transition AND every increase in the progress ratio.
 */
export function isStalled(now: number, lastAdvanceAt: number, stallMs: number): boolean {
    return now - lastAdvanceAt >= stallMs;
}

/** Default stall window: generous enough for a cold tile cache on a slow link. */
export const VIEW_ACTIVATION_STALL_MS = 25_000;
