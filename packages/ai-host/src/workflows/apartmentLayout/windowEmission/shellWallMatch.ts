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
): { shell: ShellWall; reversed: boolean } | null {
    const a = planToWorld(optionWall.start);
    const b = planToWorld(optionWall.end);
    // 1) EXACT endpoint match (cheap; preserves the orthogonal behaviour + tests).
    for (const s of shellWalls) {
        // Same-direction match: shell.start ≈ option.start AND shell.end ≈ option.end
        if (dist(s.start, a) <= ENDPOINT_TOL_M && dist(s.end, b) <= ENDPOINT_TOL_M) {
            return { shell: s, reversed: false };
        }
        // Reverse-direction match: shell.start ≈ option.end AND shell.end ≈ option.start
        if (dist(s.start, b) <= ENDPOINT_TOL_M && dist(s.end, a) <= ENDPOINT_TOL_M) {
            return { shell: s, reversed: true };
        }
    }
    // 2) §SHELL-MATCH-TOLERANT — no exact match (the non-orthogonal case): fall
    //    back to the nearest near-parallel, near-collinear, overlapping shell wall.
    //    Score = weighted(angle) + perpendicular distance; lowest wins.
    const od = segDir(a, b);
    if (od.len < 1e-6) return null;
    const mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
    let best: { shell: ShellWall; reversed: boolean } | null = null;
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
            best = { shell: s, reversed: (od.x * sd.x + od.z * sd.z) < 0 };
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
    const MIN_WINDOW_M = 0.4;          // below this it isn't a usable window
    const END_CLEAR_M = 0.1;           // keep clear of each wall end / corner join
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
    // §WINDOW-SHELL-CLAMP — the offset must keep the WHOLE opening on the wall,
    // strictly inside both ends: offset ∈ [END_CLEAR, shellLen − width − END_CLEAR].
    const maxOffsetM = Math.max(END_CLEAR_M, shellDir.len - widthM - END_CLEAR_M);

    // §WINDOW-IN-SHELL-SPAN (A.21.D34(b)) — on a SKEWED plot the tolerant matcher can
    // host a window on a near-parallel shell wall whose span the window's CENTRE does
    // NOT actually project onto (the option's external wall, in the rotated frame, can
    // extend past the true shell wall, or the room fronts a DIFFERENT segment of the
    // skewed shell). The offset clamp below would then DRAG the whole opening to a wall
    // end — landing it outside the room's real façade / poking past the shell corner
    // (the founder's "window still outside the shell on a rotated plot"). Reject the
    // match when the window centre falls outside the matched shell segment by more than
    // half the opening width (i.e. less than half the opening would lie within the
    // span) → the window is DROPPED rather than clamped onto a wall it doesn't belong
    // on. An EXACT endpoint match always projects the centre inside [0, len], so this
    // guard never fires on the orthogonal path (no regression).
    if (centreParam < -widthM / 2 || centreParam > shellDir.len + widthM / 2) return null;

    return {
        shellWallId: match.shell.id,
        offsetM:     Math.min(Math.max(END_CLEAR_M, offsetM), maxOffsetM),
        widthM,
        heightM:     win.height / 1000,
        sillM:       win.sillHeight / 1000,
        ...(win.roomType ? { roomType: win.roomType } : {}),
        ...(win.name ? { name: win.name } : {}),
    };
}

/**
 * Resolve all shell-hosted windows in an option. Convenience wrapper —
 * iterates `option.windows`, calls `resolveShellWindow` per item, and
 * flattens. Windows that don't match (interior-side or unmatchable
 * externals) are dropped silently here; the wiring layer surfaces them as
 * warnings against the original list.
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
    return out;
}
