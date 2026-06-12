// §DIAG-ENTRANCE-FIX (ADR-0066 editor-seam, 2026-06-10) — re-seat the main-entrance
// door onto the shell wall that ACTUALLY bounds the entrance hall.
//
// THE DEFECT (founder, repeated + emphatic): the entrance hall must ALWAYS be
// adjacent to a PERIMETER (shell) wall, and the door must sit on the portion of THAT
// shell wall belonging to the hall's own boundary. The live log showed:
//   §DIAG-ENTRANCE door wall=wall_… boundsHall=⚠ hall=Entrance Hall …
// i.e. the resolver (`resolveEntranceDoor` in @pryzm/ai-host) fell back to its
// centroid-nearest wall because its STRICT vertex-on-wall bounding test
// (`wallBoundsRoom`, tolM = 0.2 m) found NO shell wall the hall touches. On a
// WELD-FALLBACK / rotated / drifted plate the user's PRE-DRAWN shell walls have moved
// off the engine footprint ring by more than 0.2 m, so a hall whose polygon edge runs
// ALONG a shell wall no longer registers as "bounded" — and the door lands on a
// neighbour's façade (the founder's defect).
//
// THE EDITOR-SEAM FIX (the package resolver is owned by another agent — we do NOT edit
// it): after the resolver returns, VERIFY the chosen wall against the hall using an
// EDGE-OVERLAP test (does a stretch of the hall's boundary run collinear-and-alongside
// the shell wall?) with a tolerance generous enough to survive the plate drift. If the
// chosen wall fails, RE-SELECT the shell wall with the longest hall-boundary overlap and
// re-place a door centred in that overlap span. If the hall is genuinely NOT perimeter-
// adjacent (no shell wall overlaps its boundary at all) we log it LOUDLY (an engine-side
// failure another agent owns) and keep the resolver's closest-shell-wall pick.
//
// PURE + DETERMINISTIC — no stores, no THREE, no DOM. World METRES throughout; the hall
// polygon is projected plan-mm → world-m with the SAME default projector the resolver
// used (p.x/1000, p.y/1000) so the two share a frame. Governance: C53 (generation
// engine→editor execution boundary), ADR-0061 determinism.

export interface XZ { readonly x: number; readonly z: number }
export interface SeamShellWall { readonly id: string; readonly start: XZ; readonly end: XZ }

/** The entrance-door dispatch shape (structurally === EntranceDoorDispatch). */
export interface SeamEntranceDoor {
    readonly shellWallId: string;
    readonly offsetM: number;
    readonly widthM: number;
    readonly heightM: number;
    readonly systemTypeId?: string;
    readonly name: string;
}

/** A LayoutRoom subset — the hall, with its plan-mm polygon ({x,y}, mm). */
export interface SeamRoom {
    readonly type?: string;
    readonly name?: string;
    readonly polygon?: ReadonlyArray<{ x: number; y: number }>;
}

const MIN_DOOR_M = 0.7;
const END_CLEAR_M = 0.15;
const ENTRANCE_WIDTH_M = 1.0;
/** Perpendicular distance (m) within which a hall boundary edge is "alongside" a shell
 *  wall. Generous (vs the resolver's strict 0.2 m vertex test) to survive the pre-drawn
 *  shell's post-miter / rotated-plate drift off the engine footprint ring — but still far
 *  below any room dimension so a parallel INTERIOR wall a metre away never qualifies. */
const OVERLAP_PERP_TOL_M = 0.65;
/** Below this much collinear overlap a hall edge is not meaningfully "on" the shell wall. */
const MIN_OVERLAP_M = 0.6;

interface Unit { readonly ax: number; readonly az: number; readonly ux: number; readonly uz: number; readonly len: number }
function unit(a: XZ, b: XZ): Unit {
    const dx = b.x - a.x, dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    if (len < 1e-9) return { ax: a.x, az: a.z, ux: 1, uz: 0, len: 0 };
    return { ax: a.x, az: a.z, ux: dx / len, uz: dz / len, len };
}
/** Param of `p` projected onto the line through `a` along unit `u` (m from a). */
const proj = (p: XZ, u: Unit): number => (p.x - u.ax) * u.ux + (p.z - u.az) * u.uz;
/** Perpendicular distance (m) of `p` from the infinite line through `a` dir `u`. */
const perp = (p: XZ, u: Unit): number => Math.abs((p.x - u.ax) * u.uz - (p.z - u.az) * u.ux);

/**
 * Length (m), along the shell wall, of the hall's boundary that runs ALONGSIDE the
 * shell wall (within OVERLAP_PERP_TOL_M), expressed as the projected [lo,hi] span on
 * the wall (clamped to the wall). Returns null when no boundary edge runs alongside.
 *
 * We test every hall polygon EDGE: the edge "runs along" the wall when BOTH its
 * endpoints are within the perpendicular tolerance of the wall line. We then take the
 * union extent of those endpoints' projections — the hall frontage on this wall.
 */
function hallOverlapSpanOnWall(
    wall: SeamShellWall,
    hallPolyWorld: readonly XZ[],
): { lo: number; hi: number } | null {
    const u = unit(wall.start, wall.end);
    if (u.len < 1e-6 || hallPolyWorld.length < 3) return null;
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < hallPolyWorld.length; i++) {
        const a = hallPolyWorld[i]!;
        const b = hallPolyWorld[(i + 1) % hallPolyWorld.length]!;
        // §ENTRANCE-DRIFT-TOL (A.21.D29 #2, 2026-06-12) — on a ROTATED / drifted plate the
        // engine hall polygon (projected naively x/1000) lands a few cm off — AND slightly
        // ROTATED relative to — the user-drawn (world-frame) shell wall. The old per-ENDPOINT
        // band rejected such an edge whenever ONE endpoint drifted past the tolerance, so the
        // hall registered as "not perimeter-adjacent" and the door fell back to a neighbour's
        // façade (the founder's defect). Match on the edge's MIDPOINT perpendicular distance
        // PLUS a parallelism gate (the edge must run roughly ALONG the wall): this survives the
        // rotated-plate drift while still rejecting a parallel INTERIOR wall a metre away (its
        // midpoint is far) and a perpendicular edge (fails parallelism). Pure + deterministic.
        const elen = Math.hypot(b.x - a.x, b.z - a.z);
        if (elen < 1e-6) continue;
        const ex = (b.x - a.x) / elen, ez = (b.z - a.z) / elen;
        const parallel = Math.abs(ex * u.ux + ez * u.uz);   // |cos θ| between edge + wall dir
        if (parallel < 0.94) continue;                       // > ~20° off the wall → not alongside
        const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
        if (perp({ x: mx, z: mz }, u) > OVERLAP_PERP_TOL_M) continue;
        const ta = Math.max(0, Math.min(u.len, proj(a, u)));
        const tb = Math.max(0, Math.min(u.len, proj(b, u)));
        lo = Math.min(lo, ta, tb);
        hi = Math.max(hi, ta, tb);
    }
    if (!Number.isFinite(lo) || hi - lo < MIN_OVERLAP_M) return null;
    return { lo, hi };
}

/** §ENTRANCE-NEAREST-FALLBACK (A.21.D29 #2) — when NO hall edge runs alongside any shell
 *  wall (a badly-drifted / rotated plate), pick the shell wall whose BODY is nearest the
 *  hall CENTROID and onto which the centroid projects WITHIN the wall span. This still lands
 *  the entrance on a wall the hall actually fronts (closest perimeter), never a far neighbour
 *  façade. Returns the chosen wall + a centred door span, or null when the hall projects onto
 *  no shell wall at all (genuinely interior hall — the caller keeps the resolver pick + LOGS).
 *  Pure + deterministic (nearest distance, tie-break ascending id). */
function nearestShellWallToHall(
    hallPolyWorld: readonly XZ[],
    shellWalls: readonly SeamShellWall[],
): { wall: SeamShellWall; lo: number; hi: number } | null {
    let cx = 0, cz = 0;
    for (const p of hallPolyWorld) { cx += p.x; cz += p.z; }
    const c: XZ = { x: cx / hallPolyWorld.length, z: cz / hallPolyWorld.length };
    let best: { wall: SeamShellWall; dist: number } | null = null;
    for (const w of shellWalls) {
        const u = unit(w.start, w.end);
        if (u.len < MIN_DOOR_M) continue;
        const t = proj(c, u);
        if (t < -OVERLAP_PERP_TOL_M || t > u.len + OVERLAP_PERP_TOL_M) continue;  // not in front of this wall
        const dist = perp(c, u);
        if (!best || dist < best.dist - 1e-9
            || (Math.abs(dist - best.dist) <= 1e-9 && w.id < best.wall.id)) {
            best = { wall: w, dist };
        }
    }
    if (!best) return null;
    const u = unit(best.wall.start, best.wall.end);
    return { wall: best.wall, lo: 0, hi: u.len };
}

/** Project a plan-mm polygon to world-m with the resolver's default projector. */
function toWorld(poly: ReadonlyArray<{ x: number; y: number }>): XZ[] {
    return poly.map(p => ({ x: p.x / 1000, z: p.y / 1000 }));
}

/** A claimed span [startM, endM] along a wall (e.g. an already-placed shell window). */
type Span = readonly [number, number];

/**
 * Place a door of up to ENTRANCE_WIDTH_M inside the free interval [lo,hi] that avoids the
 * `occupied` spans (± a small gap). Returns the {offsetM,widthM} centred in the largest
 * free sub-interval, or null when none ≥ MIN_DOOR_M. Pure + deterministic.
 */
function placeInClearGap(
    lo: number,
    hi: number,
    occupied: readonly Span[],
): { offsetM: number; widthM: number } | null {
    if (hi - lo < MIN_DOOR_M) return null;
    const GAP = 0.1;
    const blocked: [number, number][] = occupied
        .map(([s, e]): [number, number] => [Math.min(s, e) - GAP, Math.max(s, e) + GAP])
        .map(([s, e]): [number, number] => [Math.max(lo, s), Math.min(hi, e)])
        .filter(([s, e]) => e > s)
        .sort((a, b) => a[0] - b[0]);
    const merged: [number, number][] = [];
    for (const b of blocked) {
        const last = merged[merged.length - 1];
        if (last && b[0] <= last[1]) last[1] = Math.max(last[1], b[1]);
        else merged.push([b[0], b[1]]);
    }
    const free: [number, number][] = [];
    let cur = lo;
    for (const [s, e] of merged) { if (s > cur) free.push([cur, s]); cur = Math.max(cur, e); }
    if (cur < hi) free.push([cur, hi]);
    // Largest free interval wins (the entrance wants the widest clear stretch).
    let best: [number, number] | null = null;
    for (const iv of free) if (iv[1] - iv[0] >= MIN_DOOR_M && (!best || iv[1] - iv[0] > best[1] - best[0])) best = iv;
    if (!best) return null;
    const ivLen = best[1] - best[0];
    const widthM = Math.min(ENTRANCE_WIDTH_M, ivLen);
    return { offsetM: best[0] + (ivLen - widthM) / 2, widthM };
}

/**
 * §DIAG-ENTRANCE-FIX — given the resolver's entrance door (or null) plus the hall room
 * and the shell walls, return the FINAL entrance door re-seated onto the shell wall the
 * hall actually fronts, or the input door unchanged when it is already on a hall-fronting
 * wall (or no better wall exists). LOGS the verdict so a single console paste shows the
 * before→after wall + whether the hall is perimeter-adjacent at all.
 *
 * @param door    the resolver's entrance door (may be null → nothing to do).
 * @param hall    the engine entrance-hall room (type 'hall'|'corridor'), plan-mm polygon.
 * @param shellWalls the ground shell walls (world-m).
 * @param logTag  console prefix.
 */
export function reseatEntranceOnHallWall(
    door: SeamEntranceDoor | null,
    hall: SeamRoom | null,
    shellWalls: readonly SeamShellWall[],
    logTag = '[house-layout]',
    // §ENTRANCE-DOOR-CLEAR parity — already-claimed shell-window spans per wall id, so a
    // re-seated door lands in a CLEAR gap of the hall frontage (never colliding with a
    // window → the CreateWallOpenings batch would skip it). Absent ⇒ centred placement.
    occupiedSpansByWall?: ReadonlyMap<string, readonly Span[]>,
): SeamEntranceDoor | null {
    if (!door) return null;
    if (!hall || !hall.polygon || hall.polygon.length < 3 || shellWalls.length === 0) return door;

    const hallPolyWorld = toWorld(hall.polygon);

    // Compute every shell wall's hall-frontage overlap span; rank by longest frontage.
    interface Cand { wall: SeamShellWall; lo: number; hi: number; overlap: number }
    const cands: Cand[] = [];
    for (const w of shellWalls) {
        const span = hallOverlapSpanOnWall(w, hallPolyWorld);
        if (!span) continue;
        cands.push({ wall: w, lo: span.lo, hi: span.hi, overlap: span.hi - span.lo });
    }

    // No shell wall runs ALONGSIDE the hall boundary. Before declaring the hall interior,
    // try the §ENTRANCE-NEAREST-FALLBACK — the shell wall the hall CENTROID fronts (nearest
    // perimeter the centroid projects onto). This rescues a badly-drifted / rotated plate
    // where the alongside-edge test still missed but the hall genuinely fronts a shell wall.
    if (cands.length === 0) {
        const near = nearestShellWallToHall(hallPolyWorld, shellWalls);
        if (near && near.wall.id !== door.shellWallId) {
            const wallLen = unit(near.wall.start, near.wall.end).len;
            const spanLo = Math.max(END_CLEAR_M, near.lo);
            const spanHi = Math.min(wallLen - END_CLEAR_M, near.hi);
            const occupied = occupiedSpansByWall?.get(near.wall.id) ?? [];
            const placed = spanHi - spanLo >= MIN_DOOR_M ? placeInClearGap(spanLo, spanHi, occupied) : null;
            if (placed) {
                console.log(
                    `${logTag} §DIAG-ENTRANCE-FIX RE-SEAT (nearest-shell fallback) door from wall=${door.shellWallId} ` +
                    `→ wall=${near.wall.id} offset=${placed.offsetM.toFixed(2)}m width=${placed.widthM.toFixed(2)}m ` +
                    `boundsHall≈✓ hall='${hall.name ?? hall.type}' (no edge ran alongside; hall centroid fronts this wall).`,
                );
                return { ...door, shellWallId: near.wall.id, offsetM: placed.offsetM, widthM: placed.widthM };
            }
        }
        // Genuinely interior hall (no shell wall fronts it at all) → ENGINE-SIDE failure
        // (another agent owns it); log LOUDLY but keep the resolver's closest-shell pick so
        // the house still gets a front door.
        console.warn(
            `${logTag} §DIAG-ENTRANCE-FIX hall='${hall.name ?? hall.type}' is NOT perimeter-adjacent ` +
            '(no shell wall runs alongside OR fronts its boundary) — ENGINE-SIDE failure; keeping the resolver ' +
            `pick wall=${door.shellWallId} (closest shell wall to the hall).`,
        );
        return door;
    }

    // Does the resolver's chosen wall already front the hall? If so, keep it (byte-stable).
    const chosenFronts = cands.some(c => c.wall.id === door.shellWallId);
    if (chosenFronts) {
        console.log(
            `${logTag} §DIAG-ENTRANCE-FIX OK door wall=${door.shellWallId} already bounds the hall ` +
            `'${hall.name ?? hall.type}' (no re-seat).`,
        );
        return door;
    }

    // Re-seat: pick the LONGEST hall-frontage wall (tie-break by ascending id → stable).
    cands.sort((a, b) => b.overlap - a.overlap || (a.wall.id < b.wall.id ? -1 : a.wall.id > b.wall.id ? 1 : 0));
    const best = cands[0]!;
    const wallLen = unit(best.wall.start, best.wall.end).len;
    // Centre the door inside the hall's frontage span, clamped to the wall ends.
    const spanLo = Math.max(END_CLEAR_M, best.lo);
    const spanHi = Math.min(wallLen - END_CLEAR_M, best.hi);
    const spanLen = spanHi - spanLo;
    if (spanLen < MIN_DOOR_M) {
        console.warn(
            `${logTag} §DIAG-ENTRANCE-FIX hall frontage on wall=${best.wall.id} too short ` +
            `(${spanLen.toFixed(2)}m < ${MIN_DOOR_M}m) — keeping the resolver pick wall=${door.shellWallId}.`,
        );
        return door;
    }
    // Place inside the hall frontage, avoiding any window already claimed on this wall.
    const occupied = occupiedSpansByWall?.get(best.wall.id) ?? [];
    const placed = placeInClearGap(spanLo, spanHi, occupied);
    if (!placed) {
        console.warn(
            `${logTag} §DIAG-ENTRANCE-FIX hall frontage on wall=${best.wall.id} has no clear gap ` +
            `(${occupied.length} window span(s)) — keeping the resolver pick wall=${door.shellWallId}.`,
        );
        return door;
    }
    const { offsetM, widthM } = placed;
    console.log(
        `${logTag} §DIAG-ENTRANCE-FIX RE-SEAT door from wall=${door.shellWallId} → wall=${best.wall.id} ` +
        `(longest hall frontage ${best.overlap.toFixed(2)}m) offset=${offsetM.toFixed(2)}m width=${widthM.toFixed(2)}m ` +
        `boundsHall=✓ hall='${hall.name ?? hall.type}'`,
    );
    return { ...door, shellWallId: best.wall.id, offsetM, widthM };
}
