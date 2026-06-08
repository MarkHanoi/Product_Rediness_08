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
): { shell: ShellWall; reversed: boolean; exact: boolean } | null {
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
        if (ang > ANGLE_TOL_RAD) continue;                      // not parallel enough
        const perp = perpDist(mid, s.start, sd);
        if (perp > PERP_TOL_M) continue;                        // too far off the shell line
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
): ShellWindowDispatch | null {
    if (win.wallRef < 0 || win.wallRef >= optionWalls.length) return null;
    const host = optionWalls[win.wallRef]!;
    if (host.isExternal !== true) return null;

    const match = matchShellHost(host, shellWalls, planToWorld);
    if (!match) return null;

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
    const END_CLEAR_M = cornerSetbackForWall(shellDir.len);
    const maxWidthM = shellDir.len - 2 * END_CLEAR_M;
    if (maxWidthM < MIN_WINDOW_M) return null;   // shell wall can't host any window
    const widthM = Math.min(win.width / 1000, maxWidthM);

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
    if (centreParam < -OVERLAP_TOL_M || centreParam > shellDir.len + OVERLAP_TOL_M) return null;

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
        if (centreParam < minCentre - EPS_M || centreParam > shellDir.len - minCentre + EPS_M) return null;
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
    const minOffsetM = END_CLEAR_M;
    const maxOffsetClearedM = shellDir.len - widthM - END_CLEAR_M;
    if (maxOffsetClearedM < minOffsetM - EPS_M) return null;   // can't fit with corner clearance

    // Centre the (possibly width-clamped) opening on the projected centre, then clamp
    // the offset so the WHOLE opening sits strictly inside both wall ends WITH the
    // corner clearance. Because the centre is inside [0, len], the width fits
    // (maxWidthM check above), and the clearance band is non-empty (check just above),
    // a feasible in-shell offset always exists.
    const finalOffsetM = Math.min(Math.max(minOffsetM, offsetM), maxOffsetClearedM);

    // §WINDOW-IN-SHELL-FINAL (A.21.D36 → A.21.D40 #1 hardened) — last-line invariant:
    // after every clamp the ACTUAL emitted opening [finalOffsetM, finalOffsetM + widthM]
    // MUST lie within the host shell span WITH the END_CLEAR_M corner margin at BOTH
    // ends — i.e. inside [END_CLEAR_M, shellLen − END_CLEAR_M], not merely [0, shellLen].
    // If a degenerate clamp still left the opening crowding (or past) either corner,
    // DROP the window — a frame at / past the corner must never render. Belt-and-braces
    // over the centre-band + corner-fit guards above.
    if (finalOffsetM < END_CLEAR_M - EPS_M || finalOffsetM + widthM > shellDir.len - END_CLEAR_M + EPS_M) return null;

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
 * Deterministic greedy keep: per shell wall, sort by offset (ties by width desc, then
 * a stable original-index tiebreak); walk in order, keep a window iff its span starts
 * at least `WINDOW_GAP_M` after the previous KEPT window's end; otherwise drop it.
 */
function deOverlapShellWindows(
    resolved: readonly ShellWindowDispatch[],
): ShellWindowDispatch[] {
    // Preserve original order via an index so the result is stable + the kept set is
    // re-assembled in emission order (not grouped) — callers iterate it positionally.
    const indexed = resolved.map((r, i) => ({ r, i }));
    const byWall = new Map<string, { r: ShellWindowDispatch; i: number }[]>();
    for (const e of indexed) {
        (byWall.get(e.r.shellWallId) ?? byWall.set(e.r.shellWallId, []).get(e.r.shellWallId)!).push(e);
    }
    const keptIdx = new Set<number>();
    for (const group of byWall.values()) {
        group.sort((a, b) =>
            (a.r.offsetM - b.r.offsetM) ||
            (b.r.widthM - a.r.widthM) ||
            (a.i - b.i));
        let lastEnd = -Infinity;
        for (const { r, i } of group) {
            if (r.offsetM >= lastEnd + WINDOW_GAP_M - 1e-9) {
                keptIdx.add(i);
                lastEnd = r.offsetM + r.widthM;
            }
            // else: overlaps the previously-kept window on this wall → drop it.
        }
    }
    return indexed.filter(e => keptIdx.has(e.i)).map(e => e.r);
}

/**
 * Resolve all shell-hosted windows in an option. Convenience wrapper —
 * iterates `option.windows`, calls `resolveShellWindow` per item, flattens,
 * and DE-CONFLICTS overlapping spans on a shared shell wall (§WINDOW-DEOVERLAP).
 * Windows that don't match (interior-side or unmatchable externals) are dropped
 * silently here; the wiring layer surfaces them as warnings against the original
 * list.
 */
export function resolveAllShellWindows(
    windows: readonly LayoutWindow[],
    optionWalls: readonly LayoutWall[],
    shellWalls: readonly ShellWall[],
    planToWorld: PlanToWorldXZ = defaultPlanToWorld,
): readonly ShellWindowDispatch[] {
    const out: ShellWindowDispatch[] = [];
    for (const w of windows) {
        const r = resolveShellWindow(w, optionWalls, shellWalls, planToWorld);
        if (r) out.push(r);
    }
    // §WINDOW-DEOVERLAP — ensure no two windows on the SAME shell wall overlap, so the
    // wall.createOpening occupancy check never silently rejects a window (the founder's
    // "CONFLICT … opening skipped" log → dropped window).
    return deOverlapShellWindows(out);
}
