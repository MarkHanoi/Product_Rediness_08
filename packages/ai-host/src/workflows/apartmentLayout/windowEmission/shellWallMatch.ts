// T1.W-C — Shell-wall host resolution for engine-emitted windows.
//
// The window-emission engine (T1.W-A) places windows on EXTERNAL walls. Those
// walls represent the SHELL — they already exist in the editor's wall store
// with their own ids. The default executePlan path skips externals (the
// shell can't be rebuilt) and the windows filter out with them.
//
// This module bridges the gap: given the option's plan-frame external walls
// + the editor's world-frame shell walls (carried via LayoutExecuteOptions),
// match each option external to its source shell wall (by endpoint
// proximity) and return a dispatch-ready { shellWallId, offsetM, widthM,
// ... } record. The wiring layer (buildLayoutCommands) then emits
// wall.createOpening hosted on the existing shell wall id rather than on a
// freshly-minted partition id.
//
// Pure + deterministic — no I/O, no THREE, no DOM.

import type { LayoutWall, LayoutWindow, RoomType, Vec2mm } from '../types.js';
import { windowMandatoryFor, windowDesiredFor } from '../rules/programRules.js';

/** A shell wall already present in the editor's wall store. World METRES. */
export interface ShellWall {
    readonly id:    string;
    readonly start: { readonly x: number; readonly z: number };
    readonly end:   { readonly x: number; readonly z: number };
}

/**
 * A resolved dispatch record for one engine-emitted window: the existing
 * shell wall id to host it on plus the (possibly direction-flipped) offset
 * + width along that wall, in METRES.
 *
 * Returned by `resolveShellWindow` when the window's host external wall
 * matches a shell wall; returns null when no match is found (in which case
 * the window is dropped by the wiring layer with a warning).
 */
export interface ShellWindowDispatch {
    readonly shellWallId: string;
    readonly offsetM:     number;
    readonly widthM:      number;
    readonly heightM:     number;
    readonly sillM:       number;
    readonly roomType?:   RoomType;
    readonly name?:       string;
}

/** Tolerance for endpoint matching, in METRES. The shell can have walls
 *  whose endpoints don't EXACTLY equal the option's external-wall endpoints
 *  (the bubble-graph reconciliation re-derives them) — a generous 1 cm
 *  tolerance catches the small float drift without false positives. */
const ENDPOINT_TOL_M = 0.01;

/** Default plan-mm → world-m projection — matches executePlan's default
 *  (plan-x → world-x; plan-y → world-z; divide by 1000). The caller can
 *  pass a custom projector via `resolveShellWindow` for testing /
 *  non-standard frames. */
export type PlanToWorldXZ = (p: Vec2mm) => { readonly x: number; readonly z: number };

const defaultPlanToWorld: PlanToWorldXZ = (p) => ({ x: p.x / 1000, z: p.y / 1000 });

const dist = (a: { x: number; z: number }, b: { x: number; z: number }): number =>
    Math.hypot(a.x - b.x, a.z - b.z);

// ── §SHELL-MATCH-TOLERANT (2026-06-05) — non-orthogonal window hosting ────────
//
// The D-TGL decomposes the shell into AXIS-ALIGNED rectangles (+ one
// `principalAxisAngle` skew). On a NON-ORTHOGONAL drawn parcel the engine's
// external (perimeter) walls do NOT coincide with the drawn shell wall endpoints,
// so the exact 1 cm endpoint match always failed → every window was dropped
// (the founder's "windows never created" on an angled plot). The tolerant
// fallback hosts a window on the nearest near-PARALLEL, near-COLLINEAR,
// OVERLAPPING shell wall and PROJECTS the window's centre onto it, so windows
// land on the real drawn shell even when the generated perimeter is off-axis.
const ANGLE_TOL_RAD = (30 * Math.PI) / 180; // max direction difference (either way)
const PERP_TOL_M = 1.0;                       // max perpendicular distance to the shell line

// ── §WINDOW-MANDATORY-RESCUE (A.21.D60, 2026-06-09) — last-resort match widening ──
//
// When a window-MANDATORY room (bedroom/master/living/kitchen) would otherwise keep
// ZERO windows, the rescue pass re-resolves its windows with WIDER match tolerances so
// a near-parallel shell wall that just missed the normal angle/perp gate can still host
// the room's one rescue window. Applied ONLY on the rescue path — the normal path uses
// the tight tolerances above and is byte-identical.
const RESCUE_ANGLE_TOL_RAD = (45 * Math.PI) / 180;
const RESCUE_PERP_TOL_M = 1.6;
/** A.21.D34(b) — slack (m) allowed when requiring the option wall's midpoint to
 *  project within the matched shell segment span. A small float-drift tolerance; the
 *  midpoint must be essentially inside the wall it is hosted on. */
const OVERLAP_TOL_M = 0.05;
/** §WINDOW-IN-SHELL-FINAL (A.21.D36) — float-dust tolerance (m) for the final
 *  "opening strictly inside the shell span" invariant. 1 mm: smaller than any
 *  real clearance so it never admits a genuinely-off-wall frame, large enough to
 *  absorb projection/rounding noise so a valid centred window is not spuriously
 *  dropped. */
const EPS_M = 0.001;

// ── §WINDOW-CORNER-SETBACK (A.21.D45, 2026-06-08) — real masonry pier ─────────
//
// Founder, recurring (FINALLY): "windows placed on the EDGE of the perimeter
// wall". The live log proved it — shell windows landed at `offset=0.100m` from
// the wall start, i.e. flush against the corner with only the cosmetic 0.1 m
// `END_CLEAR_M` corner-clearance constant as a "pier". That 0.1 m reads as a
// window ON the edge, not a window WITH a return. It was NOT happening originally
// because T1.W-A placed ONE centred window (offset = (len−width)/2 ≈ mid-wall);
// the D5.c multi-window rework (`98e02342`) distributes the FIRST window at the
// bare end margin and the resolver then honoured that 0.1 m floor straight
// through. ROOT FIX: replace the cosmetic 0.1 m corner clearance with a REAL,
// architecturally-meaningful corner setback — a minimum masonry pier/return at
// each corner that NO window (first, last, or middle) may encroach.
//
// The setback is wall-length-scaled with a hard architectural floor + cap so a
// long façade gets a generous return and a short wall still hosts a window:
//   target  = clamp(WALL_FRACTION·len, MIN_CORNER_SETBACK_M, MAX_CORNER_SETBACK_M)
//   capped  = min(target, (len − MIN_WINDOW_M)/2)   — never starve a hostable wall
// If even the floor can't leave room for a minimal opening the window is DROPPED
// (per the full-span-or-drop doctrine), never slammed to the corner.

/** Hard floor (m) for the corner setback — a real visible pier, never the old
 *  cosmetic 0.1 m. ≈ a half-brick + reveal return; the architectural minimum
 *  that reads as a window set INTO a wall, not floating on its edge. */
const MIN_CORNER_SETBACK_M = 0.5;
/** Cap (m) so a very long façade doesn't push the glazing into an over-narrow
 *  central band — keeps windows distributed, not bunched at mid-wall. */
const MAX_CORNER_SETBACK_M = 1.2;
/** Fraction of wall length used to scale the setback between the floor + cap, so
 *  a longer wall earns a proportionally larger return. */
const CORNER_SETBACK_WALL_FRACTION = 0.10;
/** Below this an opening isn't a usable window (shared with §WINDOW-SHELL-CLAMP). */
const MIN_WINDOW_M = 0.4;

// ── §WINDOW-MANDATORY-RESCUE (A.21.D60, 2026-06-09) — relaxed corner pier ─────────
//
// On the rescue path the corner setback is reduced toward the BARE no-touch
// clearance (NOT slammed to the exact corner — a window flush on the corner reads
// worse than a windowless wall). This is the architectural minimum that still keeps
// a visible reveal: it lets the room's ONE rescue window fit on a short external wall
// (or near a corner) that the full 0.5 m masonry pier would have starved. Normal
// path is untouched (full `cornerSetbackForWall`).
const RESCUE_CORNER_SETBACK_M = 0.1;

/** Per-window relaxation toggles for the §WINDOW-MANDATORY-RESCUE path. All flags
 *  default OFF (the normal path passes no relax object → byte-identical). */
export interface RescueRelax {
    /** (a) Reduce the corner setback toward the bare clearance so a short / near-corner
     *  external wall can still host the room's one window. */
    readonly relaxCorner: boolean;
    /** (c) Widen the shell-match angle/perp tolerance so a near-parallel shell wall that
     *  just missed the normal gate can host this rescue window. */
    readonly widenMatch: boolean;
    /** (d) Accept a smaller window variant (shrink the requested width toward
     *  MIN_WINDOW_M) so an over-wide spec that couldn't fit still keeps ONE window. */
    readonly shrinkWidth: boolean;
}

/**
 * The corner setback (m) for a shell wall of `shellLenM`: a real masonry pier at
 * EACH corner that no window may encroach. Wall-length-scaled between the floor
 * and the cap, then reduced (never below 0) on a short wall so the wall can still
 * host a minimal opening rather than being starved to nothing. Pure + deterministic.
 */
export function cornerSetbackForWall(shellLenM: number): number {
    if (!Number.isFinite(shellLenM) || shellLenM <= 0) return MIN_CORNER_SETBACK_M;
    const scaled = Math.min(
        MAX_CORNER_SETBACK_M,
        Math.max(MIN_CORNER_SETBACK_M, CORNER_SETBACK_WALL_FRACTION * shellLenM),
    );
    // Don't starve a wall that can host a minimal window: keep ≥ MIN_WINDOW_M of
    // usable span between the two setbacks when physically possible.
    const maxAffordable = Math.max(0, (shellLenM - MIN_WINDOW_M) / 2);
    return Math.min(scaled, maxAffordable);
}

// ── §WINDOW-ROOM-INTERVAL-CLAMP (#3, founder full-house 2026-06-12) ───────────
//
// THE residual "window shared by two rooms" defect lives HERE, not in the engine.
// The engine (emitWindows.ts) ALREADY confines each window to its room's junction-
// bounded band on the (possibly shared) shell wall — so `option.windows` (what the
// MODAL renders) is correct ("in the modal preview it was correct"). But the BUILD
// path re-projects the window centre onto the matched SHELL wall and re-clamps the
// offset to the WHOLE shell wall's corner-pier band [END_CLEAR_M, shellLen−END_CLEAR_M]
// (see §WINDOW-CORNER-SPAN below) — with NO knowledge of the partition junctions that
// split that shell wall into per-room portions. So a window correctly placed inside its
// room's portion by the engine can, at dispatch, be (a) carried verbatim past a junction
// when the engine band ≠ the matched shell span (house case: each room fronts the WHOLE
// shell wall, the engine band is a sub-interval, and the resolver's whole-wall clamp is a
// no-op that LEAVES it correct — but the mandatory-RESCUE path below re-resolves with
// relaxed corner clamps against the WHOLE wall, dropping the band entirely), or (b) the
// width-clamp/centre re-projection drift can nudge it across a junction.
//
// HARDEN (founder's exact spec #3): the FULL window span [offset, offset+width] —
// centred on its MIDPOINT — must lie strictly inside the room's OWNED interval on the
// shell wall, bounded by the partition T-junctions / corners that delimit that room on
// that wall, with a corner setback at each end. We recompute the junctions on the matched
// shell wall directly from the option walls (the interior partitions whose endpoint lands
// on it), pick the interval CONTAINING the window's projected midpoint, and clamp the
// offset strictly inside [intervalStart + setback, intervalEnd − width − setback]; drop
// when even a minimal opening can't fit; then assert the span crosses NO junction.

/** A junction position on a shell wall, in METRES ALONG the shell from its `start`,
 *  carrying the meeting partition's half-thickness band (m) the window must clear. */
export interface ShellJunctionM {
    /** mm-along projected to metres from the shell `start`. */
    readonly atM: number;
    /** Half the clear band kept either side of the junction (m): partitionThickness/2 +
     *  a small clearance. The owned interval edge sits at `atM ± halfBandM`. */
    readonly halfBandM: number;
}

/** Perp tolerance (m) for deciding an interior partition endpoint LANDS on a shell wall
 *  (mirrors emitGeometry's ON_WALL_PERP_TOL_MM = 200 mm — half a thick shell + weld). */
const JUNCTION_PERP_TOL_M = 0.20;
/** Along tolerance (m) the endpoint must project within the shell span (60 mm). */
const JUNCTION_ALONG_TOL_M = 0.06;
/** ≥ ~20° off the shell direction → a genuine T-stem, not a parallel-grazing partition. */
const JUNCTION_MIN_TJOIN_SIN = Math.sin((20 * Math.PI) / 180);
/** Default clearance (m) added either side of a junction band (matches WINDOW_GAP_M). */
const JUNCTION_CLEARANCE_M = 0.10;
/** Two junctions closer than this (m) collapse to one cut (mirrors JUNCTION_CUT_MERGE_MM). */
const JUNCTION_MERGE_M = 0.08;

/**
 * Compute the interior-partition junctions on `shell` (the matched shell wall), in metres
 * ALONG the shell from its `start`. A junction is recorded for every interior (non-
 * external) option wall whose endpoint lands ON the shell line (perp ≤ tol, along within
 * the span) and whose direction is sufficiently NON-collinear with the shell (a real
 * T-stem). Mirrors the emitGeometry §WINDOW-ROOM-PORTION-DETECT pass, in shell coords, so
 * the dispatch-side room-interval clamp uses the SAME junction set the engine band used.
 * Pure + deterministic.
 */
export function shellJunctionsFromOptionWalls(
    shell: ShellWall,
    optionWalls: readonly LayoutWall[],
    planToWorld: PlanToWorldXZ = defaultPlanToWorld,
): ShellJunctionM[] {
    const sd = segDir(shell.start, shell.end);
    if (sd.len < 1e-6) return [];
    const out: ShellJunctionM[] = [];
    for (const w of optionWalls) {
        if (w.isExternal === true) continue;                  // only INTERIOR partitions
        const a = planToWorld(w.start);
        const b = planToWorld(w.end);
        const wd = segDir(a, b);
        if (wd.len < 1e-9) continue;
        // Non-collinearity (sine of the angle to the shell): a parallel-ish wall is not a stem.
        const sinToShell = Math.abs(wd.x * sd.z - wd.z * sd.x);   // |cross| of unit dirs
        if (sinToShell < JUNCTION_MIN_TJOIN_SIN) continue;
        // Carry HALF the partition thickness when known; the option wall has no thickness
        // field, so use the default-clearance-only band (matches PARTITION_HALF_BAND in the
        // engine: a window edge never lands within the partition footprint nor against it).
        const halfBandM = JUNCTION_CLEARANCE_M;
        for (const ep of [a, b] as const) {
            const along = projParam(ep, shell.start, sd);
            const perp = perpDist(ep, shell.start, sd);
            if (perp > JUNCTION_PERP_TOL_M) continue;
            if (along < -JUNCTION_ALONG_TOL_M || along > sd.len + JUNCTION_ALONG_TOL_M) continue;
            out.push({ atM: Math.min(Math.max(along, 0), sd.len), halfBandM });
        }
    }
    return out;
}

/**
 * The room's OWNED interval `[lo, hi]` (m along the shell) — the junction-bounded portion
 * of `shellLenM` that CONTAINS `centreParam` (the window's projected midpoint). The
 * junctions split the shell into intervals; the room owns exactly the one its window's
 * midpoint sits in. De-duplicates near-coincident cuts. When `centreParam` lands in no
 * interval (numerical edge) it picks the nearest. Junction-free shells return the full
 * span. Pure + deterministic.
 */
export function roomIntervalOnShell(
    shellLenM: number,
    junctions: readonly ShellJunctionM[],
    centreParam: number,
): { lo: number; hi: number } {
    const raw = junctions
        .map(j => j.atM)
        .filter(c => c > 1e-6 && c < shellLenM - 1e-6)
        .sort((a, b) => a - b);
    const cuts: number[] = [];
    for (const c of raw) {
        const prev = cuts[cuts.length - 1];
        if (prev === undefined || c - prev > JUNCTION_MERGE_M) cuts.push(c);
    }
    if (cuts.length === 0) return { lo: 0, hi: shellLenM };
    const bounds = [0, ...cuts, shellLenM];
    const intervals: Array<{ lo: number; hi: number }> = [];
    for (let i = 1; i < bounds.length; i++) intervals.push({ lo: bounds[i - 1]!, hi: bounds[i]! });
    const c = Math.min(Math.max(centreParam, 0), shellLenM);
    const owned = intervals.find(iv => c >= iv.lo - 1e-6 && c <= iv.hi + 1e-6);
    if (owned) return owned;
    let nearest = intervals[0]!;
    let nearestDist = Infinity;
    for (const iv of intervals) {
        const d = c < iv.lo ? iv.lo - c : c > iv.hi ? c - iv.hi : 0;
        if (d < nearestDist - 1e-6) { nearest = iv; nearestDist = d; }
    }
    return nearest;
}

interface UnitDir { readonly x: number; readonly z: number; readonly len: number }

const segDir = (a: { x: number; z: number }, b: { x: number; z: number }): UnitDir => {
    const dx = b.x - a.x, dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    return len > 1e-9 ? { x: dx / len, z: dz / len, len } : { x: 1, z: 0, len: 0 };
};

/** Signed distance (metres) of `p` projected onto the line through `a` along `d`. */
const projParam = (p: { x: number; z: number }, a: { x: number; z: number }, d: UnitDir): number =>
    (p.x - a.x) * d.x + (p.z - a.z) * d.z;

/** Perpendicular distance from `p` to the infinite line through `a` with unit dir `d`. */
const perpDist = (p: { x: number; z: number }, a: { x: number; z: number }, d: UnitDir): number =>
    Math.abs((p.x - a.x) * d.z - (p.z - a.z) * d.x);

/**
 * Find the shell wall that matches the given option external wall, plus a
 * flag indicating whether its endpoint orientation is REVERSED relative to
 * the option wall's (start→end) direction.
 *
 * Endpoint matching is unordered: a shell wall and an option wall match if
 * their endpoint sets are within `ENDPOINT_TOL_M`. The `reversed` flag is
 * true when shell.start matches option.end (and shell.end matches
 * option.start), i.e. the shell wall is drawn the other way round; in that
 * case the wiring layer flips the window's offset along the shell.
 *
 * Returns null when no shell wall matches.
 */
export function matchShellHost(
    optionWall: LayoutWall,
    shellWalls: readonly ShellWall[],
    planToWorld: PlanToWorldXZ = defaultPlanToWorld,
    // §WINDOW-MANDATORY-RESCUE — optional widened tolerances for the rescue path.
    // Omitted on the normal path → tight defaults → byte-identical behaviour.
    tol?: { readonly angleTolRad: number; readonly perpTolM: number },
): { shell: ShellWall; reversed: boolean; exact: boolean } | null {
    const angleTol = tol?.angleTolRad ?? ANGLE_TOL_RAD;
    const perpTol = tol?.perpTolM ?? PERP_TOL_M;
    const a = planToWorld(optionWall.start);
    const b = planToWorld(optionWall.end);
    // 1) EXACT endpoint match (cheap; preserves the orthogonal behaviour + tests).
    //    `exact: true` — the room fronts the WHOLE shell wall, so a window may be
    //    SLID inward to a corner pier (A.21.D45) rather than dropped when it lands
    //    near a corner. (The tolerant/skewed branch sets `exact: false`.)
    for (const s of shellWalls) {
        // Same-direction match: shell.start ≈ option.start AND shell.end ≈ option.end
        if (dist(s.start, a) <= ENDPOINT_TOL_M && dist(s.end, b) <= ENDPOINT_TOL_M) {
            return { shell: s, reversed: false, exact: true };
        }
        // Reverse-direction match: shell.start ≈ option.end AND shell.end ≈ option.start
        if (dist(s.start, b) <= ENDPOINT_TOL_M && dist(s.end, a) <= ENDPOINT_TOL_M) {
            return { shell: s, reversed: true, exact: true };
        }
    }
    // 2) §SHELL-MATCH-TOLERANT — no exact match (the non-orthogonal case): fall
    //    back to the nearest near-parallel, near-collinear, overlapping shell wall.
    //    Score = weighted(angle) + perpendicular distance; lowest wins.
    const od = segDir(a, b);
    if (od.len < 1e-6) return null;
    const mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
    let best: { shell: ShellWall; reversed: boolean; exact: boolean } | null = null;
    let bestScore = Infinity;
    for (const s of shellWalls) {
        const sd = segDir(s.start, s.end);
        if (sd.len < 1e-6) continue;
        const cos = Math.abs(od.x * sd.x + od.z * sd.z);        // 1 = parallel
        const ang = Math.acos(Math.min(1, cos));
        if (ang > angleTol) continue;                           // not parallel enough
        const perp = perpDist(mid, s.start, sd);
        if (perp > perpTol) continue;                           // too far off the shell line
        // The option wall must project onto the shell segment's span (overlap).
        const t0 = projParam(a, s.start, sd);
        const t1 = projParam(b, s.start, sd);
        if (Math.max(t0, t1) < 0 || Math.min(t0, t1) > sd.len) continue; // no overlap
        // §WINDOW-IN-SHELL-SPAN (A.21.D34(b)) — the option wall's MIDPOINT must project
        // WITHIN the shell segment span. On a skewed plot the loose "any overlap" test
        // above can pick a near-parallel shell wall the room only grazes at a corner,
        // hosting (then end-clamping) the window onto a wall it doesn't front → the
        // window pokes outside the real façade/shell. Requiring the midpoint inside
        // [0, len] keeps the host the wall the room actually fronts. Orthogonal layouts
        // resolve via the exact match (step 1) above → this never fires (no regression).
        const tMid = projParam(mid, s.start, sd);
        if (tMid < -OVERLAP_TOL_M || tMid > sd.len + OVERLAP_TOL_M) continue;
        const score = ang * 2 + perp;
        if (score < bestScore) {
            bestScore = score;
            best = { shell: s, reversed: (od.x * sd.x + od.z * sd.z) < 0, exact: false };
        }
    }
    return best;
}

/**
 * Resolve a single engine-emitted window into a ShellWindowDispatch record.
 * Returns null when:
 *   • the window's wallRef is out of range; or
 *   • the host wall is NOT external (no need to bridge — the normal
 *     wallRef → newly-built wall id path handles it); or
 *   • no shell wall matches the host's endpoints.
 *
 * Offset arithmetic mirrors the existing `reversedVsMerged` logic in
 * buildLayoutPlan: when the shell wall is reversed relative to the option
 * wall, the window's offset becomes (wallLen − offset − width) along the
 * shell.
 */
export function resolveShellWindow(
    win: LayoutWindow,
    optionWalls: readonly LayoutWall[],
    shellWalls: readonly ShellWall[],
    planToWorld: PlanToWorldXZ = defaultPlanToWorld,
    // §DIAG-WIN-UNMATCHED (2026-06-08) — optional reason tally so the wiring layer can
    // report WHY each window failed to host (notExternal vs noShellMatch vs a corner/span
    // guard drop). Pure: incrementing a caller-owned counter, no behaviour change.
    reasonTally?: Record<string, number>,
    // §WINDOW-MANDATORY-RESCUE (A.21.D60, 2026-06-09) — optional per-window guard
    // relaxation. Omitted on the normal path (undefined) → all guards at full strength →
    // byte-identical behaviour. Set ONLY by the rescue pass for a window-mandatory room
    // that would otherwise keep ZERO windows.
    relax?: RescueRelax,
    // §WINDOW-ROOM-INTERVAL-CLAMP (#3, founder 2026-06-12) — the interior-partition
    // junctions on the matched SHELL wall (m along the shell from its `start`). When
    // supplied, the FINAL window span is clamped strictly inside the room's OWNED interval
    // (the junction-bounded portion that CONTAINS the window's projected midpoint) WITH the
    // corner setback at each interval end — so a window can NEVER cross a partition junction
    // onto a neighbouring room, even when the resolver hosts it on the WHOLE shell wall.
    // Keyed PER shell wall id by the caller (resolveAllShellWindows) and recomputed from the
    // option's interior partitions; this fn looks up the matched shell's entry. Omitted /
    // empty ⇒ byte-identical to the pre-#3 behaviour (the engine band still confines the
    // modal preview; this hardens the BUILT result).
    junctionsByShell?: ReadonlyMap<string, readonly ShellJunctionM[]>,
): ShellWindowDispatch | null {
    const fail = (reason: string): null => { if (reasonTally) reasonTally[reason] = (reasonTally[reason] ?? 0) + 1; return null; };
    if (win.wallRef < 0 || win.wallRef >= optionWalls.length) return fail('wallRefOutOfRange');
    const host = optionWalls[win.wallRef]!;
    if (host.isExternal !== true) return fail('hostNotExternal');

    const match = matchShellHost(
        host, shellWalls, planToWorld,
        relax?.widenMatch ? { angleTolRad: RESCUE_ANGLE_TOL_RAD, perpTolM: RESCUE_PERP_TOL_M } : undefined,
    );
    if (!match) return fail('noShellMatch');
    const shellJunctionsM = junctionsByShell?.get(match.shell.id);

    const hostStartW = planToWorld(host.start);
    const hostEndW   = planToWorld(host.end);
    const hostDir = segDir(hostStartW, hostEndW);
    const offsetM_local = win.offset / 1000;
    const shellDir = segDir(match.shell.start, match.shell.end);

    // §WINDOW-SHELL-CLAMP (A.21.D28 #5) — the matched shell wall can be SHORTER
    // than the emitted window width: the engine sizes a window against the option's
    // EXTERNAL wall segment (which bounds one room and may be longer than, or skewed
    // vs, the drawn shell wall the tolerant matcher hosts it on), and the climate
    // glazing widener (A.21.D6.3) can grow it further. Hosting an over-wide opening
    // on a short shell wall pushes the opening PAST the wall end → the founder's
    // "window placed outside / crossing the exterior shell line". Clamp the width to
    // fit the host shell wall (leaving a small clearance at each end so the opening
    // never reaches the very corner where two walls join), and DROP the window when
    // the shell wall is too short to host even a minimal opening.
    // §WINDOW-CORNER-SETBACK (A.21.D45) — the corner clearance is now a REAL
    // wall-length-scaled masonry pier (≥ 0.5 m), not the old cosmetic 0.1 m. Both
    // the width clamp and the offset clamps below use it, so NO window — first,
    // last, or middle — lands within the setback of a corner.
    // §WINDOW-MANDATORY-RESCUE (a) — on the rescue path reduce the corner pier toward the
    // bare clearance (but never to the exact corner) so a short / near-corner wall can
    // still host the room's one window. Normal path uses the full masonry pier.
    const END_CLEAR_M = relax?.relaxCorner
        ? Math.min(cornerSetbackForWall(shellDir.len), RESCUE_CORNER_SETBACK_M)
        : cornerSetbackForWall(shellDir.len);
    const maxWidthM = shellDir.len - 2 * END_CLEAR_M;
    if (maxWidthM < MIN_WINDOW_M) return fail('shellWallTooShort');   // shell wall can't host any window
    // §WINDOW-MANDATORY-RESCUE (d) — accept a smaller window so an over-wide spec that
    // couldn't fit the host still keeps ONE window: shrink the REQUESTED width toward the
    // largest that fits (down to MIN_WINDOW_M). The normal path requests win.width and is
    // width-clamped by §WINDOW-SHELL-CLAMP below exactly as before.
    const requestedWidthM = relax?.shrinkWidth
        ? Math.max(MIN_WINDOW_M, Math.min(win.width / 1000, maxWidthM))
        : win.width / 1000;
    const widthM = Math.min(requestedWidthM, maxWidthM);

    // §SHELL-MATCH-TOLERANT — project the window's CENTRE onto the matched shell
    // wall so the offset is correct even when the shell wall has different
    // endpoints/length than the option wall (the non-orthogonal tolerant case).
    // For an EXACT endpoint match this reduces to the old arithmetic, and the
    // reversed case falls out of the projection direction automatically (no
    // separate `wallLen − offset − width` branch needed). The centre projection
    // uses the (possibly clamped) widthM so a clamped window stays centred on the
    // engine's intended position rather than drifting toward the wall start.
    const centreW = {
        x: hostStartW.x + hostDir.x * (offsetM_local + (win.width / 1000) / 2),
        z: hostStartW.z + hostDir.z * (offsetM_local + (win.width / 1000) / 2),
    };
    const centreParam = projParam(centreW, match.shell.start, shellDir);
    const offsetM = centreParam - widthM / 2;

    // §WINDOW-IN-SHELL-SPAN (A.21.D34(b) + A.21.D36 hardening, 2026-06-07) — on a
    // SKEWED plot the tolerant matcher can host a window on a near-parallel shell wall
    // whose span the window's CENTRE does NOT actually project onto (the option's
    // external wall, in the rotated frame, can extend past the true shell wall, or the
    // room fronts a DIFFERENT segment of the skewed shell). The offset clamp below
    // would then DRAG the whole opening to a wall end — landing it outside the room's
    // real façade / poking past the shell corner (the founder's recurring "window
    // still outside the shell").
    //
    // The guard rejects a host whose span the window's CENTRE does not project onto:
    // the centre must lie strictly inside the shell segment [0, len]. This is the
    // wrong-wall test — a window the room only grazes at a corner of a near-parallel
    // shell wall projects its centre OUTSIDE [0, len] and is dropped rather than
    // clamped onto a wall it doesn't front. A legitimately OVER-WIDE but correctly-
    // centred window (its centre is inside the span; only its half-width spills past
    // an end) is NOT dropped here — the width clamp + offset clamp below pull the
    // whole opening back onto the wall, and the §WINDOW-IN-SHELL-FINAL invariant
    // proves the emitted opening sits on the wall. An EXACT endpoint match always
    // projects the centre well inside [0, len] (no regression).
    if (centreParam < -OVERLAP_TOL_M || centreParam > shellDir.len + OVERLAP_TOL_M) return fail('centreOutOfShellSpan');

    // §WINDOW-CORNER-FIT (A.21.D39, 2026-06-07) — a SKEWED corner recurrence: even with
    // the centre-band guard above, a window whose projected centre is inside [0, len]
    // but TOO CLOSE to an end requires the offset clamp below to DRAG the whole opening
    // toward that corner — landing its edge flush against (or, after the perpendicular
    // neighbour's own thickness, past) the corner where two shell walls join, so the
    // frame reads as poking OUT of the shell at the corner. ROOT FIX: a window must fit
    // on its host segment with the END_CLEAR margin from BOTH corners WITHOUT being
    // dragged — i.e. its projected centre must already be ≥ widthM/2 + END_CLEAR_M from
    // each end. If the room only fronts the host near a corner (the centre is closer
    // than that), the window CANNOT sit fully inside its façade between the two corners
    // → DROP it rather than render it overrunning the corner.
    //
    // SCOPE: this corner guard applies ONLY to windows that were NOT width-clamped —
    // i.e. the engine's requested width already fits the host shell wall. An OVER-WIDE
    // window (whose width was clamped to fit the wall, §WINDOW-SHELL-CLAMP) is a
    // different intent: it is centred mid-wall and intentionally drag-fitted — the
    // pre-existing behaviour the A.21.D28 test pins. Only an un-clamped window crowding
    // a corner is the off-shell escape this guard closes.
    //
    // A.21.D45 SCOPE NARROWING: the DROP only fires on a TOLERANT (skewed) match —
    // where the room merely GRAZES the host near a corner and sliding the window inward
    // would misrepresent the frontage (the original D39 intent). On an EXACT endpoint
    // match the room fronts the WHOLE shell wall, so a window that lands near a corner
    // is legitimately SLID inward to the corner pier by the §WINDOW-CORNER-SPAN clamp
    // below (the founder's "evenly distributed, real pier" intent) rather than dropped.
    // This is what keeps the live-log corner-hugging window — and ALL distributed shell
    // windows on a long orthogonal façade — instead of silently dropping them.
    const wasWidthClamped = widthM < (win.width / 1000) - EPS_M;
    if (!wasWidthClamped && !match.exact) {
        const minCentre = widthM / 2 + END_CLEAR_M;
        if (centreParam < minCentre - EPS_M || centreParam > shellDir.len - minCentre + EPS_M) return fail('cornerFitDrop');
    }

    // §WINDOW-CORNER-SPAN (A.21.D40 #1, 2026-06-07) — the founder's recurring "window
    // STILL overruns the corner". The §WINDOW-CORNER-FIT guard above only fires for
    // UN-clamped windows; an over-wide (width-clamped) window was still drag-fitted by
    // the offset clamp, which — with the old [0, shellLen] final invariant — could land
    // the opening flush against a corner (offset < END_CLEAR_M, or offset+width >
    // shellLen − END_CLEAR_M). After the perpendicular neighbour wall's own thickness
    // that frame reads as poking OUT of the shell at the corner. ROOT FIX (founder's
    // spec): the FULL span [offset, offset+width] must sit inside
    // [END_CLEAR_M, shellLen − END_CLEAR_M] for EVERY window (clamped or not). If no
    // clearance-respecting position exists (the wall is too short to host the opening
    // WITH the end clearance), DROP it. No window may extend past a wall end / corner.
    let minOffsetM = END_CLEAR_M;
    let maxOffsetClearedM = shellDir.len - widthM - END_CLEAR_M;
    if (maxOffsetClearedM < minOffsetM - EPS_M) return fail('cornerClearanceUnfittable');   // can't fit with corner clearance

    // ── §WINDOW-ROOM-INTERVAL-CLAMP (#3, founder 2026-06-12) — NEVER cross a junction ──
    // Restrict the allowed offset band to the room's OWNED interval on the shell wall (the
    // junction-bounded portion containing the window's projected MIDPOINT) WITH the corner
    // setback at each interval end. This is the founder's exact spec #3: the FULL length of
    // the window, centred on its midpoint, must lie within the room's boundary line shared
    // with the exterior wall — never straddling the partition T-junction onto a neighbour.
    // The engine band already confines the modal preview; this re-asserts it on the BUILT
    // side after the centre re-projection + every rescue/relax path. Pure + deterministic.
    if (shellJunctionsM && shellJunctionsM.length > 0) {
        const owned = roomIntervalOnShell(shellDir.len, shellJunctionsM, centreParam);
        // Set the interval END at the junction band edge (atM ± halfBand collapses inward),
        // then add the corner setback. We approximate the band edge by pulling each interior
        // (non-corner) interval end inward by the largest junction half-band at that cut.
        const halfAtCut = (cut: number): number => {
            let h = 0;
            for (const j of shellJunctionsM) if (Math.abs(j.atM - cut) <= JUNCTION_MERGE_M) h = Math.max(h, j.halfBandM);
            return h;
        };
        // Interior interval ends (not the shell corners 0 / len) get the partition half-band
        // pulled inward so the window edge never lands inside the partition footprint.
        const loIsCorner = owned.lo <= EPS_M;
        const hiIsCorner = owned.hi >= shellDir.len - EPS_M;
        const ivLo = owned.lo + (loIsCorner ? END_CLEAR_M : halfAtCut(owned.lo) + JUNCTION_CLEARANCE_M);
        const ivHi = owned.hi - (hiIsCorner ? END_CLEAR_M : halfAtCut(owned.hi) + JUNCTION_CLEARANCE_M);
        const ivMin = ivLo;
        const ivMax = ivHi - widthM;
        // Intersect the room interval with the whole-wall corner-pier band.
        minOffsetM = Math.max(minOffsetM, ivMin);
        maxOffsetClearedM = Math.min(maxOffsetClearedM, ivMax);
        if (maxOffsetClearedM < minOffsetM - EPS_M) {
            // The window can't fit inside its OWN room portion (even minimal) → drop rather
            // than emit it crossing the junction onto a neighbour.
            return fail('roomIntervalUnfittable');
        }
    }

    // Centre the (possibly width-clamped) opening on the projected centre, then clamp
    // the offset so the WHOLE opening sits strictly inside both wall ends WITH the
    // corner clearance AND inside the room's owned junction-bounded interval. Because the
    // centre is inside [0, len], the width fits (maxWidthM check above), and the clamped
    // band is non-empty (checks above), a feasible in-shell offset always exists.
    const finalOffsetM = Math.min(Math.max(minOffsetM, offsetM), maxOffsetClearedM);

    // §WINDOW-IN-SHELL-FINAL (A.21.D36 → A.21.D40 #1 hardened) — last-line invariant:
    // after every clamp the ACTUAL emitted opening [finalOffsetM, finalOffsetM + widthM]
    // MUST lie within the host shell span WITH the END_CLEAR_M corner margin at BOTH
    // ends — i.e. inside [END_CLEAR_M, shellLen − END_CLEAR_M], not merely [0, shellLen].
    // If a degenerate clamp still left the opening crowding (or past) either corner,
    // DROP the window — a frame at / past the corner must never render. Belt-and-braces
    // over the centre-band + corner-fit guards above.
    if (finalOffsetM < END_CLEAR_M - EPS_M || finalOffsetM + widthM > shellDir.len - END_CLEAR_M + EPS_M) return fail('finalInvariantDrop');

    // §WINDOW-ROOM-INTERVAL-CLAMP post-condition — the emitted span must cross NO junction
    // (founder #3: "a window must NEVER cross a partition junction onto a neighbouring
    // room"). Belt-and-braces over the interval clamp: if any junction's clear band falls
    // strictly WITHIN the emitted span, drop the window rather than render it spanning two
    // rooms. (With the interval clamp above this is unreachable in practice; it makes the
    // guarantee total + self-checking against any future drift.)
    if (shellJunctionsM && shellJunctionsM.length > 0) {
        const lo = finalOffsetM, hi = finalOffsetM + widthM;
        for (const j of shellJunctionsM) {
            if (j.atM > lo + EPS_M && j.atM < hi - EPS_M) return fail('crossesJunction');
        }
    }

    return {
        shellWallId: match.shell.id,
        offsetM:     finalOffsetM,
        widthM,
        heightM:     win.height / 1000,
        sillM:       win.sillHeight / 1000,
        ...(win.roomType ? { roomType: win.roomType } : {}),
        ...(win.name ? { name: win.name } : {}),
    };
}

/** §WINDOW-DEOVERLAP (A.21.D40 #2) — minimum gap (m) kept BETWEEN two windows on the
 *  SAME shell wall. Matches WINDOW_CLEARANCE_MM (0.1 m) in emitWindows.ts so the
 *  de-conflict band reads as the same deliberate façade rhythm. Two windows whose
 *  spans (padded by this gap) overlap can't both be hosted — the later one is dropped
 *  here rather than being SILENTLY rejected by the wall.createOpening occupancy check
 *  (the founder's `CONFLICT … opening skipped` log). */
const WINDOW_GAP_M = 0.1;

/** Internal de-overlap candidate: a resolved dispatch plus the metadata the priority-
 *  aware greedy needs (room identity, mandatory flag, rescue flag). Not exported — the
 *  public surface still returns plain `ShellWindowDispatch`s. */
interface DeOverlapItem {
    readonly r: ShellWindowDispatch;
    readonly i: number;            // stable original index (deterministic tiebreak)
    readonly roomKey: string;      // groups one room's windows (name, else type+wallRef bucket)
    readonly mandatory: boolean;   // window-mandatory room (rescue protects these)
    readonly rescued: boolean;     // a §WINDOW-MANDATORY-RESCUE window (pre-empts conflicters)
}

const HABITABLE_WIN = new Set(['living', 'kitchen', 'dining', 'master', 'bedroom', 'study']);

/**
 * De-conflict a set of resolved shell-window dispatches so that NO two windows on the
 * SAME shell wall have overlapping spans. Windows on DIFFERENT walls never interact.
 *
 * On a multi-room façade the engine emits windows PER ROOM (`emitWindowsForRoom` only
 * de-overlaps within one room's own walls), so two rooms fronting the SAME shell wall
 * can resolve to overlapping spans on it. Hosting both would make the second
 * wall.createOpening fail its occupancy check and silently vanish — the founder's
 * "windows dropped" symptom. Here we instead drop the conflicting window DELIBERATELY,
 * up front, so the dispatched set is conflict-free by construction.
 *
 * Priority order (highest first), then offset / width / stable index:
 *   1. §WINDOW-MANDATORY-RESCUE — a rescued mandatory window claims the wall first, so a
 *      bedroom whose ONLY span was lost to de-overlap pre-empts the lower-priority
 *      conflicter (task 2b) rather than yielding.
 *   2. §WINDOW-HABITABLE-PRIORITY (F3 / ADR-0062) — habitable rooms (living/kitchen/
 *      dining/master/bedroom/study) claim the wall before wet/service rooms.
 * Byte-identical when no rescue + no cross-priority conflict exists on a wall (same-
 * priority groups still resolve by offset, exactly as before). Deterministic.
 *
 * Returns the kept items (so callers can inspect which rooms survived).
 */
function deOverlapShellWindowItems(
    items: readonly DeOverlapItem[],
    // §DIAG-WINDOW-OVERLAP (2026-06-10) — optional per-wall telemetry sink. When
    // supplied, records for each host shell wall how many windows it RECEIVED and how
    // many were DROPPED here because their span (padded by WINDOW_GAP_M) overlapped an
    // already-kept window. Pure: writing to a caller-owned map; no behaviour change.
    overlapStats?: Map<string, { received: number; dropped: number }>,
): DeOverlapItem[] {
    const byWall = new Map<string, DeOverlapItem[]>();
    for (const e of items) {
        (byWall.get(e.r.shellWallId) ?? byWall.set(e.r.shellWallId, []).get(e.r.shellWallId)!).push(e);
    }
    // Priority: 0 = rescued HABITABLE/mandatory (claims first), 1 = habitable,
    // 2 = wet/service. §WINDOW-DESIRED (A.21.D61) — a rescued WET/SERVICE window
    // (bathroom/ensuite/wc, NOT habitable) must NOT pre-empt a habitable room's
    // window: it claims at the normal wet/service priority (2), so it only ever
    // displaces another wet/service conflicter, never a bedroom/living. A rescued
    // HABITABLE window keeps the top priority (0) so a bedroom whose only span was
    // lost still pre-empts a lower-priority conflicter (the original task-2b intent).
    const winPriority = (e: DeOverlapItem): number =>
        e.rescued
            ? (HABITABLE_WIN.has(e.r.roomType ?? '') ? 0 : 2)
            : (HABITABLE_WIN.has(e.r.roomType ?? '') ? 1 : 2);
    const keptIdx = new Set<number>();
    for (const [wallId, group] of byWall.entries()) {
        const sorted = group.slice().sort((a, b) =>
            (winPriority(a) - winPriority(b)) ||       // rescued, then habitable, claim first
            (a.r.offsetM - b.r.offsetM) ||
            (b.r.widthM - a.r.widthM) ||
            (a.i - b.i));
        const keptSpans: Array<readonly [number, number]> = [];
        let droppedHere = 0;
        for (const e of sorted) {
            const s = e.r.offsetM, end = e.r.offsetM + e.r.widthM;
            // Conflicts with a kept span when neither sits clear of the other by WINDOW_GAP_M.
            const overlaps = keptSpans.some(([ks, ke]) => s < ke + WINDOW_GAP_M - 1e-9 && ks < end + WINDOW_GAP_M - 1e-9);
            if (!overlaps) { keptIdx.add(e.i); keptSpans.push([s, end]); }
            else droppedHere++;   // overlaps an already-kept (higher-priority / earlier) window → drop it.
        }
        if (overlapStats) overlapStats.set(wallId, { received: group.length, dropped: droppedHere });
    }
    // Re-assemble in emission order (stable) so callers iterate positionally.
    return items.filter(e => keptIdx.has(e.i)).slice().sort((a, b) => a.i - b.i);
}

/** Room identity for grouping a room's windows: the stamped `name` (all of one room's
 *  windows share `"<RoomName> Window"`); falls back to `type@wallRef` when unnamed (unit-
 *  test / legacy callers) so a room still groups deterministically. */
const roomKeyOf = (w: LayoutWindow): string =>
    w.name ?? `${w.roomType ?? '?'}@${w.wallRef}`;

/** The escalating relaxation ladder the §WINDOW-MANDATORY-RESCUE pass tries, in order.
 *  Each step ADDS a relaxation; the first that yields a hostable window wins. Pure data. */
const RESCUE_LADDER: ReadonlyArray<{ readonly label: string; readonly relax: RescueRelax }> = [
    { label: 'relaxCorner',                 relax: { relaxCorner: true,  widenMatch: false, shrinkWidth: false } },
    { label: 'relaxCorner+shrinkWidth',     relax: { relaxCorner: true,  widenMatch: false, shrinkWidth: true  } },
    { label: 'relaxCorner+widenMatch',      relax: { relaxCorner: true,  widenMatch: true,  shrinkWidth: false } },
    { label: 'relaxCorner+widenMatch+shrinkWidth', relax: { relaxCorner: true, widenMatch: true, shrinkWidth: true } },
];

/**
 * Resolve all shell-hosted windows in an option. Convenience wrapper —
 * iterates `option.windows`, calls `resolveShellWindow` per item, flattens,
 * and DE-CONFLICTS overlapping spans on a shared shell wall (§WINDOW-DEOVERLAP).
 * Windows that don't match (interior-side or unmatchable externals) are dropped
 * silently here; the wiring layer surfaces them as warnings against the original
 * list.
 *
 * §WINDOW-MANDATORY-RESCUE (A.21.D60, 2026-06-09): after the normal pass, any
 * window-mandatory room (bedroom/master/living/kitchen) that kept ZERO windows is
 * retried with relaxed drop guards — as a LAST RESORT to retain ONE window — so a
 * habitable room with ANY external frontage is never left windowless. The normal path
 * is byte-identical: the rescue only runs when a mandatory room would otherwise be 0.
 */
export function resolveAllShellWindows(
    windows: readonly LayoutWindow[],
    optionWalls: readonly LayoutWall[],
    shellWalls: readonly ShellWall[],
    planToWorld: PlanToWorldXZ = defaultPlanToWorld,
    // §DIAG-PARTY-WALL (PW.1, 2026-06-09) — the set of BLIND shell-wall ids: shell
    // (perimeter) walls that ABUT a neighbouring building within the setback (a
    // party/blind wall). NO window is hosted on a blind shell wall — the façade is
    // a solid blind wall by construction. Optional + ADDITIVE: omitted / empty ⇒
    // byte-identical to the pre-PW.1 behaviour (apartment + house unaffected),
    // deterministic per ADR-0061. The producer that computes this set from
    // neighbour footprints is the PW.2 follow-up (see SPEC-PARTY-WALL-AWARENESS).
    blindFacadeWallIds?: ReadonlySet<string> | readonly string[],
    // §DIAG-WINDOW-RULE (founder rule #1, 2026-06-10) — the GENERAL perimeter rule:
    // "EVERY room that has a PERIMETER (shell) wall as part of its boundary MUST have
    // ≥1 window" (except blind party-wall façades). The caller (emitGeometry) knows the
    // full set of WINDOW-DESIRED rooms that actually FRONT a façade — including rooms
    // whose emitted window candidates were ALL dropped (walls too short / corner-fit /
    // de-overlap) and so never appear in `windows`. Passing that set here lets
    // §DIAG-WINDOW-RULE flag ANY perimeter-touching room that ends WINDOWLESS as a ⚠
    // violation, not just rooms that emitted at least one candidate. Each entry is a
    // `roomKey` (matching `roomKeyOf`) mapped to its room-type label. Optional +
    // ADDITIVE: omitted ⇒ the diagnostic falls back to the emitted-window key set
    // (pre-rule-#1 behaviour), so apartment/house output is byte-identical.
    perimeterRoomKeys?: ReadonlyMap<string, string> | ReadonlyArray<readonly [string, string]>,
): readonly ShellWindowDispatch[] {
    const blind: ReadonlySet<string> =
        blindFacadeWallIds instanceof Set
            ? blindFacadeWallIds
            : new Set(blindFacadeWallIds ?? []);
    const perimeterRooms: ReadonlyMap<string, string> =
        perimeterRoomKeys instanceof Map
            ? perimeterRoomKeys
            : new Map(perimeterRoomKeys as ReadonlyArray<readonly [string, string]> ?? []);
    // §WINDOW-ROOM-INTERVAL-CLAMP (#3, founder 2026-06-12) — precompute, ONCE per shell
    // wall, the interior-partition junctions that split it into per-room portions (m along
    // the shell). Every resolveShellWindow call below clamps its window strictly inside the
    // room's OWNED junction-bounded interval so a window can never cross a partition onto a
    // neighbour — the BUILT-side hardening of the founder's "window shared by two rooms".
    const junctionsByShell = new Map<string, readonly ShellJunctionM[]>();
    for (const s of shellWalls) {
        const js = shellJunctionsFromOptionWalls(s, optionWalls, planToWorld);
        if (js.length > 0) junctionsByShell.set(s.id, js);
    }
    const out: DeOverlapItem[] = [];
    let unmatched = 0;
    let blindSuppressed = 0;
    // §DIAG-WIN-UNMATCHED — tally WHY each window failed to host (see resolveShellWindow).
    const reasonTally: Record<string, number> = {};
    let idx = 0;
    for (const w of windows) {
        const r = resolveShellWindow(w, optionWalls, shellWalls, planToWorld, reasonTally, undefined, junctionsByShell);
        if (r && blind.size > 0 && blind.has(r.shellWallId)) {
            // §DIAG-PARTY-WALL — the window resolved onto a BLIND façade → suppress it.
            // It is NOT counted as `unmatched` (a layout/tolerance failure) — it is a
            // DELIBERATE party-wall suppression, tallied separately.
            blindSuppressed++;
            continue;
        }
        if (r) {
            out.push({
                r, i: idx++,
                roomKey:   roomKeyOf(w),
                // `mandatory` here drives the de-overlap collateral protection +
                // the "already keeps a window" short-circuit. §WINDOW-DESIRED widens
                // it to every window-DESIRED room (incl. wet rooms) so a bathroom that
                // already kept a window is not re-rescued, and a kept desired window is
                // protected from rescue collateral exactly like a mandatory one.
                mandatory: windowDesiredFor(w.roomType ?? ''),
                rescued:   false,
            });
        } else unmatched++;
    }
    // §WINDOW-DEOVERLAP — ensure no two windows on the SAME shell wall overlap, so the
    // wall.createOpening occupancy check never silently rejects a window (the founder's
    // "CONFLICT … opening skipped" log → dropped window).
    // §DIAG-WINDOW-OVERLAP — capture per-wall received/dropped counts for the diagnostic.
    const overlapStats = new Map<string, { received: number; dropped: number }>();
    let keptItems = deOverlapShellWindowItems(out, overlapStats);

    // ── §WINDOW-MANDATORY-RESCUE (A.21.D60) + §WINDOW-DESIRED (A.21.D61, 2026-06-09) ────
    // Which window-DESIRED rooms ended up with ZERO kept windows? The founder's rule is
    // "EVERY room has a window" — so the rescue protects the WHOLE windowable set, not
    // just the legally-mandatory living/kitchen/master/bedroom. The extra rooms
    // (dining/study + the wet rooms bathroom/ensuite/wc) keep ≥1 window WHEN they have
    // external frontage; a room with literally NO external wall reports NO-FRONTAGE (a
    // frontage limitation surfaced in the log, never a silent windowless drop). For each
    // zero-window desired room, run the relaxed rescue ladder (corner-setback → width →
    // match tolerance) to retain ONE window.
    //
    // Order: LEGALLY-MANDATORY rooms first (they must never yield frontage to a wet-room
    // rescue), then the wider desired set. A rescued wet room claims at the normal
    // wet-priority in the de-overlap, so it can only ever displace another wet conflicter.
    const mandatoryRooms = new Map<string, LayoutWindow[]>();
    const orderedWindows = [...windows].sort((a, b) => {
        const ma = windowMandatoryFor(a.roomType ?? '') ? 0 : 1;
        const mb = windowMandatoryFor(b.roomType ?? '') ? 0 : 1;
        return ma - mb;
    });
    for (const w of orderedWindows) {
        if (!windowDesiredFor(w.roomType ?? '')) continue;
        const key = roomKeyOf(w);
        (mandatoryRooms.get(key) ?? mandatoryRooms.set(key, []).get(key)!).push(w);
    }
    // A room is "protected" from rescue collateral when it ALREADY keeps a window AND is
    // HABITABLE (living/kitchen/dining/master/bedroom/study) — a rescued window must
    // never displace another habitable room's only window. §WINDOW-DESIRED (A.21.D61):
    // protection is keyed on HABITABLE_WIN (NOT the wider `mandatory`/desired flag, which
    // now includes wet rooms): a rescued window — habitable OR a wet-room rescue — may
    // still pre-empt a lower-priority WET/SERVICE conflicter (the task-2b behaviour the
    // tests pin), but never a habitable one.
    const protectedKeys = (its: readonly DeOverlapItem[]): Set<string> =>
        new Set(its.filter(e => !e.rescued && HABITABLE_WIN.has(e.r.roomType ?? '')).map(e => e.roomKey));
    const keptKeys = new Set(keptItems.filter(e => e.mandatory).map(e => e.roomKey));
    const rescueLog: string[] = [];
    for (const [key, roomWindows] of mandatoryRooms) {
        if (keptKeys.has(key)) continue;                              // already keeps ≥1 — no rescue
        // Try the engine's emitted windows for THIS room, escalating the relaxation ladder.
        // Accept the FIRST (relaxation, window) pair that resolves AND, after a priority-
        // aware de-overlap, both (i) survives itself and (ii) does NOT cost any previously-
        // kept habitable/mandatory room its window. Such a rescue only ever drops a lower-
        // priority WET/SERVICE conflicter (task 2b).
        const protectedBefore = protectedKeys(keptItems);
        let chosen: { items: DeOverlapItem[]; label: string } | null = null;
        outer: for (const step of RESCUE_LADDER) {
            for (const w of roomWindows) {
                const r = resolveShellWindow(w, optionWalls, shellWalls, planToWorld, undefined, step.relax, junctionsByShell);
                if (!r) continue;
                // §DIAG-PARTY-WALL (PW.1) — the rescue MUST honour blind façades too:
                // never rescue a mandatory room's window onto a party/blind wall. Skip
                // this candidate so the ladder tries another (non-blind) frontage.
                if (blind.size > 0 && blind.has(r.shellWallId)) { blindSuppressed++; continue; }
                const candidate: DeOverlapItem = { r, i: idx, roomKey: key, mandatory: true, rescued: true };
                const after = deOverlapShellWindowItems([...keptItems, candidate]);
                const survived = after.some(e => e.i === candidate.i);
                const protectedAfter = new Set(after.filter(e => !e.rescued).map(e => e.roomKey));
                const noCollateral = [...protectedBefore].every(k => protectedAfter.has(k));
                if (survived && noCollateral) { chosen = { items: after, label: step.label }; idx++; break outer; }
            }
        }
        if (!chosen) {
            // Genuinely no external frontage with a glazable run (or only conflicts that
            // would cost a higher-priority room) — surfaced, not silently shipped windowless.
            rescueLog.push(`${key}:NO-FRONTAGE`);
            continue;
        }
        keptItems = chosen.items;
        rescueLog.push(`${key}:${chosen.label}`);
    }
    const kept = keptItems.map(e => e.r);

    // §DIAG-WIN-DIST — façade window distribution (logging only; no behaviour change).
    // Bucket the FINAL kept windows by the compass orientation of their host shell
    // wall's OUTWARD normal so a single line shows how many windows landed on each
    // façade — the founder's "no windows / all on one side" symptom is visible here.
    const shellById = new Map(shellWalls.map(s => [s.id, s]));
    const compassOf = (id: string): string => {
        const s = shellById.get(id);
        if (!s) return '?';
        // Wall direction → outward normal (perpendicular). Either normal labels the
        // SAME axis (N/S vs E/W), which is all this distribution summary needs.
        const dx = s.end.x - s.start.x, dz = s.end.z - s.start.z;
        return Math.abs(dx) >= Math.abs(dz) ? 'N/S' : 'E/W';
    };
    const buckets: Record<string, number> = {};
    for (const k of kept) buckets[compassOf(k.shellWallId)] = (buckets[compassOf(k.shellWallId)] ?? 0) + 1;
    const dist = Object.entries(buckets).map(([f, n]) => `${f}:${n}`).join(' ') || 'none';
    const rescuedKept = keptItems.filter(e => e.rescued).length;
    console.log(
        `[D-TGL] §DIAG-WIN-DIST resolved=${out.length} kept=${kept.length} ` +
        `droppedByDeOverlap=${out.length - (kept.length - rescuedKept)} unmatchedToShell=${unmatched} ` +
        `rescued=${rescuedKept} façadeAxisDist={${dist}}`,
    );
    // ── §DIAG-WINDOW-OVERLAP (founder rule #2, 2026-06-10) ────────────────────────
    // Founder: "two windows can NEVER overlap" — the image showed two windows on the
    // same wall span. The §WINDOW-DEOVERLAP pass guarantees a conflict-free dispatched
    // set; this diagnostic PROVES it. Per host wall it reports the window count kept +
    // how many overlapping windows were removed, then asserts (logging only) that NO
    // two FINAL kept windows on the same wall overlap. Only logs the per-wall detail
    // when at least one overlap was actually removed; the roll-up line always prints.
    const finalByWall = new Map<string, ShellWindowDispatch[]>();
    for (const k of kept) (finalByWall.get(k.shellWallId) ?? finalByWall.set(k.shellWallId, []).get(k.shellWallId)!).push(k);
    let totalRemovedByOverlap = 0;
    let residualOverlaps = 0;
    for (const [wallId, ws] of finalByWall.entries()) {
        const removed = overlapStats.get(wallId)?.dropped ?? 0;
        totalRemovedByOverlap += removed;
        // Verify the FINAL kept set on this wall is genuinely disjoint (belt-and-braces).
        const spans = ws.map(w => [w.offsetM, w.offsetM + w.widthM] as const).sort((a, b) => a[0] - b[0]);
        let wallResidual = 0;
        for (let i = 1; i < spans.length; i++) {
            if (spans[i]![0] < spans[i - 1]![1] + WINDOW_GAP_M - 1e-9) wallResidual++;
        }
        residualOverlaps += wallResidual;
        if (removed > 0 || wallResidual > 0) {
            console.log(
                `[D-TGL] §DIAG-WINDOW-OVERLAP wall=${wallId} windows=${ws.length} ` +
                `overlapsRemoved=${removed}${wallResidual > 0 ? ` ⚠ RESIDUAL-OVERLAP=${wallResidual}` : ''}`,
            );
        }
    }
    console.log(
        `[D-TGL] §DIAG-WINDOW-OVERLAP wallsWithWindows=${finalByWall.size} ` +
        `overlapsRemoved=${totalRemovedByOverlap} residualOverlaps=${residualOverlaps}` +
        `${residualOverlaps > 0 ? ' ⚠ DE-OVERLAP INVARIANT VIOLATED' : ' ✓ all disjoint'}`,
    );
    // §DIAG-PARTY-WALL (PW.1, 2026-06-09) — which shell walls are BLIND (party walls
    // abutting a neighbour within setback) + how many windows were suppressed there.
    // Only logs when a blind set was actually supplied, so the default path is silent.
    if (blind.size > 0) {
        console.log(
            `[D-TGL] §DIAG-PARTY-WALL blindFacades=${blind.size} [${[...blind].join(',')}] ` +
            `windowsSuppressed=${blindSuppressed}`,
        );
    }
    // §DIAG-WIN-UNMATCHED — the unmatched count, broken down by CAUSE, so the next prod
    // test says exactly which gate eats the windows (hostNotExternal = engine emitted on
    // an interior wall → a LAYOUT issue; noShellMatch = matcher tolerance; *Drop = a
    // corner/span guard too aggressive). Only logs when something failed.
    if (unmatched > 0) {
        const breakdown = Object.entries(reasonTally).map(([r, n]) => `${r}:${n}`).join(' ') || 'none';
        console.log(`[D-TGL] §DIAG-WIN-UNMATCHED total=${unmatched} → ${breakdown}`);
    }
    // §WINDOW-MANDATORY-RESCUE (A.21.D60) — state when the rescue fired + which relaxation
    // it used for each window-mandatory room that would otherwise have been windowless. A
    // `NO-FRONTAGE` entry means the room has no external wall with a glazable run at all (a
    // LAYOUT/frontage issue, surfaced rather than silently shipped windowless).
    if (rescueLog.length > 0) {
        console.log(`[D-TGL] §WINDOW-MANDATORY-RESCUE fired for ${rescueLog.length} room(s) → ${rescueLog.join(' ')}`);
    }

    // ── §DIAG-WINDOW-RULE (A.21.D61 → founder rule #1 GENERAL, 2026-06-10) ─────────
    // The founder's GENERAL perimeter rule: "EVERY room that has a PERIMETER (shell)
    // wall as part of its room boundary MUST have ≥1 window" (except blind party-wall
    // façades). Print one line per perimeter-touching WINDOW-DESIRED room: has-window
    // ✓/✗, and when ✗ a ⚠ VIOLATION with the REASON. Then a one-line roll-up.
    //
    // The room domain is the UNION of:
    //   (a) the caller-supplied `perimeterRooms` — every window-desired room that
    //       actually FRONTS a façade, INCLUDING rooms whose every emitted candidate was
    //       dropped (walls too short / corner-fit / de-overlap) and so never appears in
    //       `windows`. This is what makes the rule GENERAL: such a room is now flagged
    //       as a ⚠ perimeter-room violation instead of silently vanishing; and
    //   (b) the window-desired rooms the engine emitted ANY candidate for (back-compat
    //       fallback when the caller passes no perimeter set — pre-rule-#1 behaviour).
    // Pure logging — no behaviour change. `keptKeysFinal` is the FINAL kept set
    // (post-rescue); a room is satisfied iff it kept ≥1 window.
    const keptKeysFinal = new Set(keptItems.map(e => e.roomKey));
    const desiredRoomKeys = new Map<string, string>();   // key → roomType label
    for (const w of windows) {
        if (!windowDesiredFor(w.roomType ?? '')) continue;
        desiredRoomKeys.set(roomKeyOf(w), w.roomType ?? '?');
    }
    // (a) Union in the caller's perimeter-room set — the GENERAL rule's true domain.
    //     A perimeter room here that kept NO window is a ⚠ violation even if it emitted
    //     zero candidates (so a glazable room touching the outside is never silently
    //     left windowless). Only glazable types are admitted (defensive — the caller
    //     already filters, but the rule never applies to circulation/utility/stair).
    for (const [key, type] of perimeterRooms) {
        if (!windowDesiredFor(type)) continue;
        desiredRoomKeys.set(key, type);
    }
    const rescueByKey = new Map(rescueLog.map(s => {
        const i = s.lastIndexOf(':');
        return [s.slice(0, i), s.slice(i + 1)] as const;
    }));
    let winYes = 0;
    const winNo: string[] = [];
    for (const [key, type] of [...desiredRoomKeys.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
        const has = keptKeysFinal.has(key);
        // A room the caller declared as PERIMETER-touching MUST have a window — a miss is
        // a rule VIOLATION (⚠). A room only in the emitted-fallback set (no perimeter
        // declaration) that ends windowless is reported but not asserted as a violation
        // (it may be a genuinely interior room whose stray candidate was dropped).
        const isPerimeter = perimeterRooms.has(key);
        if (has) { winYes++; console.log(`[D-TGL] §DIAG-WINDOW-RULE ${key}(${type}) → window ✓`); }
        else {
            const reason = rescueByKey.get(key) === 'NO-FRONTAGE'
                ? 'NO-FRONTAGE (no external wall)'
                : 'all candidates dropped (see §DIAG-WIN-UNMATCHED)';
            winNo.push(`${key}(${type})`);
            const flag = isPerimeter ? '⚠ PERIMETER-ROOM WINDOWLESS — RULE VIOLATION' : 'window ✗';
            console.log(`[D-TGL] §DIAG-WINDOW-RULE ${key}(${type}) → ${flag} — ${reason}`);
        }
    }
    const perimViolations = winNo.filter(k => perimeterRooms.has(k.slice(0, k.lastIndexOf('('))));
    console.log(
        `[D-TGL] §DIAG-WINDOW-RULE roomsWithWindow=${winYes}/${desiredRoomKeys.size} ` +
        `roomsWithoutWindow=[${winNo.join(',') || 'none'}] ` +
        `perimeterRoomViolations=${perimViolations.length}` +
        `${perimViolations.length > 0 ? ` ⚠ [${perimViolations.join(',')}]` : ' ✓'}`,
    );

    return kept;
}
