// @pryzm/ai-worker — PDF-to-BIM TIER 1 rejection accounting
// (§VEC-REJECT-TALLY 2026-08-11).
//
// WHY THIS FILE EXISTS
// --------------------
// Tier 1 (the deterministic vector path) used to discard evidence with a bare
// `continue`:
//
//   • `stage2-walls.ts`      — a line too short, a pair too thin / too thick /
//                              too briefly overlapping.
//   • `stage2-openings.ts`   — a door arc with no panel line, an arc that never
//                              cleared the template score, an arc with no wall
//                              within the snap tolerance; glazing pairs too
//                              close, wider than the wall, or barely overlapping.
//   • `adapter-floorplan.ts` — an opening whose host wall did not survive.
//
// Every one of those is silent. The consequence is the §CONTEXT-DATA-HONESTY
// failure in its purest form: **"0 doors found" and "12 door arcs rejected"
// are the same value.** A user staring at a plan full of doors and a wizard
// reporting none has no way to tell "this drawing has no door symbols" from
// "your scale is wrong, so every door failed the 550–1500 mm width test".
//
// These tallies make the difference observable. They cost one integer
// increment per rejected candidate and no allocation in the accepted path.
//
// Tier 2 (raster) already did this — `RasterDiagnostics.gapsRejected`. This is
// the same discipline applied to tier 1, deliberately shaped the same way so
// the two tiers read alike in the UI.
//
// PURE — no DOM, no THREE, no native deps. Bake-worker safe.

// ─── Tallies ───────────────────────────────────────────────────────────────

/** What `stage2-walls.detectWallPairs` / `extractLines` threw away, and why. */
export interface WallRejectionTally {
  /** Vector primitives offered to `extractLines`. */
  readonly vectorsSeen: number;
  /** Not a 2-point line (arc, polygon, polyline, malformed). */
  readonly rejectedNotASegment: number;
  /** Shorter than `MIN_LINE_LENGTH_MM` — hatching / detail noise. */
  readonly rejectedTooShort: number;
  /** Lines that survived into the pairing stage. */
  readonly linesEligible: number;
  /** (i, j) line pairs actually evaluated for wall-hood. */
  readonly pairsConsidered: number;
  /** Perpendicular spacing below `WALL_THICKNESS_MIN_MM`. */
  readonly pairsRejectedTooThin: number;
  /** Perpendicular spacing above `WALL_THICKNESS_MAX_MM`. */
  readonly pairsRejectedTooThick: number;
  /** Spacing was plausible but the pair barely runs alongside itself. */
  readonly pairsRejectedShortOverlap: number;
  readonly wallsAccepted: number;
}

/** What `stage2-walls.detectColumns` threw away, and why. */
export interface ColumnRejectionTally {
  readonly candidatesSeen: number;
  readonly rejectedNotClosed: number;
  readonly rejectedVertexCount: number;
  readonly rejectedNotRectangular: number;
  readonly rejectedSizeOutOfRange: number;
  readonly rejectedAspectRatio: number;
  readonly accepted: number;
}

/** What `stage2-openings.matchOpeningSymbols` threw away, and why. */
export interface OpeningRejectionTally {
  /** Arc primitives on the page — the population every door must come from. */
  readonly arcsFound: number;
  /** No line endpoint near the arc centre — no door panel to match. */
  readonly arcsRejectedNoPanelLine: number;
  /** Best template score never cleared `DOOR_MATCH_THRESHOLD`. */
  readonly arcsRejectedBelowMatchThreshold: number;
  /** Matched a template but no wall centreline within `ARC_WALL_SNAP_TOLERANCE_MM`. */
  readonly arcsRejectedNoHostWall: number;
  readonly doorsAccepted: number;
  /** Glazing-line pairs evaluated, summed over host walls. */
  readonly glazingPairsConsidered: number;
  /** Closer together than `WINDOW_GLAZING_MIN_SEPARATION_MM`. */
  readonly glazingRejectedTooClose: number;
  /** Further apart than the host wall is thick (+50 mm). */
  readonly glazingRejectedWiderThanWall: number;
  /** Overlap below `WINDOW_GLAZING_MIN_OVERLAP_MM`. */
  readonly glazingRejectedShortOverlap: number;
  readonly windowsAccepted: number;
}

/** What `adapter-floorplan.vectorResultToFloorPlanAnalysis` threw away. */
export interface AdapterRejectionTally {
  readonly wallsIn: number;
  /** Centre-line with fewer than 2 points — nothing to draw. */
  readonly wallsRejectedDegenerateCentreLine: number;
  readonly wallsOut: number;
  readonly openingsIn: number;
  /** Host wall did not survive into the analysis, and no fallback wall existed. */
  readonly openingsRejectedNoHostWall: number;
  readonly openingsOut: number;
}

/** The whole tier-1 rejection picture for one page. */
export interface VectorRejectionReport {
  readonly walls: WallRejectionTally;
  readonly columns: ColumnRejectionTally;
  readonly openings: OpeningRejectionTally;
  readonly adapter: AdapterRejectionTally;
}

// ─── Empty constructors (mutable, for the classifiers to fill) ──────────────

/** Mutable twin of {@link WallRejectionTally} used inside the classifier. */
export type MutableWallTally = { -readonly [K in keyof WallRejectionTally]: number };
/** Mutable twin of {@link ColumnRejectionTally}. */
export type MutableColumnTally = { -readonly [K in keyof ColumnRejectionTally]: number };
/** Mutable twin of {@link OpeningRejectionTally}. */
export type MutableOpeningTally = { -readonly [K in keyof OpeningRejectionTally]: number };
/** Mutable twin of {@link AdapterRejectionTally}. */
export type MutableAdapterTally = { -readonly [K in keyof AdapterRejectionTally]: number };

export function emptyWallTally(): MutableWallTally {
  return {
    vectorsSeen: 0,
    rejectedNotASegment: 0,
    rejectedTooShort: 0,
    linesEligible: 0,
    pairsConsidered: 0,
    pairsRejectedTooThin: 0,
    pairsRejectedTooThick: 0,
    pairsRejectedShortOverlap: 0,
    wallsAccepted: 0,
  };
}

export function emptyColumnTally(): MutableColumnTally {
  return {
    candidatesSeen: 0,
    rejectedNotClosed: 0,
    rejectedVertexCount: 0,
    rejectedNotRectangular: 0,
    rejectedSizeOutOfRange: 0,
    rejectedAspectRatio: 0,
    accepted: 0,
  };
}

export function emptyOpeningTally(): MutableOpeningTally {
  return {
    arcsFound: 0,
    arcsRejectedNoPanelLine: 0,
    arcsRejectedBelowMatchThreshold: 0,
    arcsRejectedNoHostWall: 0,
    doorsAccepted: 0,
    glazingPairsConsidered: 0,
    glazingRejectedTooClose: 0,
    glazingRejectedWiderThanWall: 0,
    glazingRejectedShortOverlap: 0,
    windowsAccepted: 0,
  };
}

export function emptyAdapterTally(): MutableAdapterTally {
  return {
    wallsIn: 0,
    wallsRejectedDegenerateCentreLine: 0,
    wallsOut: 0,
    openingsIn: 0,
    openingsRejectedNoHostWall: 0,
    openingsOut: 0,
  };
}

// ─── Totals ────────────────────────────────────────────────────────────────

/** Door-arc candidates that were seen and discarded. */
export function totalDoorArcsRejected(t: OpeningRejectionTally): number {
  return (
    t.arcsRejectedNoPanelLine +
    t.arcsRejectedBelowMatchThreshold +
    t.arcsRejectedNoHostWall
  );
}

/** Glazing pairs that were seen and discarded. */
export function totalGlazingPairsRejected(t: OpeningRejectionTally): number {
  return (
    t.glazingRejectedTooClose +
    t.glazingRejectedWiderThanWall +
    t.glazingRejectedShortOverlap
  );
}

/** Line pairs that were seen and discarded by the wall classifier. */
export function totalWallPairsRejected(t: WallRejectionTally): number {
  return (
    t.pairsRejectedTooThin + t.pairsRejectedTooThick + t.pairsRejectedShortOverlap
  );
}

/** True when SOMETHING was measured and thrown away. The single question the
 *  UI needs answered before it may say "this plan has no doors". */
export function hasAnyRejection(r: VectorRejectionReport): boolean {
  return (
    r.walls.rejectedTooShort > 0 ||
    totalWallPairsRejected(r.walls) > 0 ||
    totalDoorArcsRejected(r.openings) > 0 ||
    totalGlazingPairsRejected(r.openings) > 0 ||
    r.adapter.wallsRejectedDegenerateCentreLine > 0 ||
    r.adapter.openingsRejectedNoHostWall > 0
  );
}

// ─── Human-readable descriptions ───────────────────────────────────────────
//
// The load-bearing property of every sentence below: a count of ZERO ACCEPTED
// with ZERO REJECTED and a count of ZERO ACCEPTED with N REJECTED must produce
// DIFFERENT text. That is the whole point of the tally.

function plural(n: number, one: string, many = `${one}s`): string {
  return n === 1 ? one : many;
}

/** One sentence about doors: what was found, and what was thrown away. */
export function describeDoorOutcome(t: OpeningRejectionTally): string {
  const rejected = totalDoorArcsRejected(t);
  if (t.doorsAccepted > 0 && rejected === 0) {
    return `${t.doorsAccepted} ${plural(t.doorsAccepted, 'door')} matched; no door arc was rejected.`;
  }
  if (rejected === 0) {
    return t.arcsFound === 0
      ? '0 doors: the page contains no arc primitives at all, so no door symbol could be matched.'
      : `0 doors: ${t.arcsFound} ${plural(t.arcsFound, 'arc')} on the page, none rejected and none matched.`;
  }
  const why: string[] = [];
  if (t.arcsRejectedNoPanelLine > 0) why.push(`${t.arcsRejectedNoPanelLine} with no door-panel line at the hinge`);
  if (t.arcsRejectedBelowMatchThreshold > 0) why.push(`${t.arcsRejectedBelowMatchThreshold} below the door-template match score`);
  if (t.arcsRejectedNoHostWall > 0) why.push(`${t.arcsRejectedNoHostWall} with no wall close enough to host them`);
  return (
    `${t.doorsAccepted} ${plural(t.doorsAccepted, 'door')} matched out of ${t.arcsFound} ` +
    `${plural(t.arcsFound, 'arc')} — ${rejected} REJECTED (${why.join(', ')}).`
  );
}

/** One sentence about windows: what was found, and what was thrown away. */
export function describeWindowOutcome(t: OpeningRejectionTally): string {
  const rejected = totalGlazingPairsRejected(t);
  if (t.windowsAccepted > 0 && rejected === 0) {
    return `${t.windowsAccepted} ${plural(t.windowsAccepted, 'window')} matched; no glazing pair was rejected.`;
  }
  if (rejected === 0) {
    return t.glazingPairsConsidered === 0
      ? '0 windows: no pair of parallel glazing lines was found inside any wall.'
      : `0 windows: ${t.glazingPairsConsidered} glazing ${plural(t.glazingPairsConsidered, 'pair')} considered, none rejected and none matched.`;
  }
  const why: string[] = [];
  if (t.glazingRejectedTooClose > 0) why.push(`${t.glazingRejectedTooClose} too close together`);
  if (t.glazingRejectedWiderThanWall > 0) why.push(`${t.glazingRejectedWiderThanWall} further apart than the host wall is thick`);
  if (t.glazingRejectedShortOverlap > 0) why.push(`${t.glazingRejectedShortOverlap} with too little overlap`);
  return (
    `${t.windowsAccepted} ${plural(t.windowsAccepted, 'window')} matched out of ` +
    `${t.glazingPairsConsidered} glazing ${plural(t.glazingPairsConsidered, 'pair')} — ` +
    `${rejected} REJECTED (${why.join(', ')}).`
  );
}

/** One sentence about walls: what was found, and what was thrown away. */
export function describeWallOutcome(t: WallRejectionTally, a?: AdapterRejectionTally): string {
  const rejected = totalWallPairsRejected(t);
  const head = `${t.wallsAccepted} wall ${plural(t.wallsAccepted, 'pair')} from ${t.linesEligible} eligible ${plural(t.linesEligible, 'line')}`;
  const why: string[] = [];
  if (t.rejectedTooShort > 0) why.push(`${t.rejectedTooShort} ${plural(t.rejectedTooShort, 'line')} shorter than the hatching cut-off`);
  if (t.pairsRejectedTooThin > 0) why.push(`${t.pairsRejectedTooThin} ${plural(t.pairsRejectedTooThin, 'pair')} thinner than the wall range`);
  if (t.pairsRejectedTooThick > 0) why.push(`${t.pairsRejectedTooThick} ${plural(t.pairsRejectedTooThick, 'pair')} thicker than the wall range`);
  if (t.pairsRejectedShortOverlap > 0) why.push(`${t.pairsRejectedShortOverlap} ${plural(t.pairsRejectedShortOverlap, 'pair')} with too little overlap`);
  if (a && a.wallsRejectedDegenerateCentreLine > 0) why.push(`${a.wallsRejectedDegenerateCentreLine} with a degenerate centre-line`);
  if (why.length === 0 && rejected === 0 && t.rejectedTooShort === 0) {
    return `${head}; nothing was rejected.`;
  }
  return `${head} — REJECTED: ${why.join(', ')}.`;
}

/**
 * The full tier-1 accounting as one human-readable block.
 *
 * Contract: two runs that accepted the same number of elements but rejected
 * different numbers of candidates MUST produce different strings.
 */
export function describeVectorRejections(r: VectorRejectionReport): string {
  const parts = [
    describeWallOutcome(r.walls, r.adapter),
    describeDoorOutcome(r.openings),
    describeWindowOutcome(r.openings),
  ];
  if (r.adapter.openingsRejectedNoHostWall > 0) {
    parts.push(
      `${r.adapter.openingsRejectedNoHostWall} matched ${plural(r.adapter.openingsRejectedNoHostWall, 'opening')} ` +
      'could not be attached to any surviving wall and were dropped.',
    );
  }
  return parts.join(' ');
}
