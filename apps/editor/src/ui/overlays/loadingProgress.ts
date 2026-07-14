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

export function viewActivationStageLabel(stage: ViewActivationStage): string {
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
