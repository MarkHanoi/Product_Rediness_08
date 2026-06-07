// A.21.D29 #3 — Main-entrance door resolution for the generated house.
//
// The apartment pipeline relies on a HAND-PLACED front door (the user draws it
// before generating; shellReader resolves the entrance wall from it). A generated
// CASA UNIFAMILIAR has no such hand-placed door, so its ground floor came out with
// NO way in from the outside (A.21.D29 #3).
//
// This module decides — PURELY and DETERMINISTICALLY — WHERE the main entrance
// goes: it picks the ground-floor "entrance hall" room (type 'hall'), finds the
// EXTERIOR shell wall that bounds it, and computes a centred, clamped door opening
// on that wall. When no hall touches the perimeter (or there is no hall at all) it
// degrades to the shell wall NEAREST a sensible interior room, so the house always
// gets exactly one external front door connecting the inside to the outside.
//
// It mirrors `windowEmission/shellWallMatch.ts`: same world-metre `ShellWall`
// shape, same plan(mm)→world(m) projector, same width/offset clamp discipline
// (A.21.D28 #5) so the opening never overruns the shell. The editor executor
// dispatches the returned record exactly like a shell-hosted window:
// wall.createOpening (type 'door') + door.batch.create on the EXISTING shell id.
//
// Pure + deterministic — no I/O, no THREE, no DOM, no RNG.

import type { LayoutOption, LayoutRoom, Vec2mm } from '../types.js';
import type { ShellWall } from '../windowEmission/shellWallMatch.js';
import { defaultDoorSystemTypeId } from '../resolvers/defaultElementTypes.js';

/** Standard residential entry-door width (m) — A.21.D29 brief: ~0.9–1.0 m. We use
 *  1.0 m (a generous single leaf) but clamp DOWN to fit a short shell wall. */
export const ENTRANCE_DOOR_WIDTH_M = 1.0;
/** Entry-door leaf height (m) — matches the apartment door default. */
export const ENTRANCE_DOOR_HEIGHT_M = 2.1;
/** Below this an opening isn't a usable door → we skip rather than emit a slot. */
const MIN_DOOR_M = 0.7;
/** Keep the opening clear of each wall end / corner join (A.21.D28 #5 discipline). */
const END_CLEAR_M = 0.15;

export type PlanToWorldXZ = (p: Vec2mm) => { readonly x: number; readonly z: number };
const defaultPlanToWorld: PlanToWorldXZ = (p) => ({ x: p.x / 1000, z: p.y / 1000 });

interface XZ { readonly x: number; readonly z: number }
interface UnitDir { readonly x: number; readonly z: number; readonly len: number }

const segDir = (a: XZ, b: XZ): UnitDir => {
    const dx = b.x - a.x, dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    return len > 1e-9 ? { x: dx / len, z: dz / len, len } : { x: 1, z: 0, len: 0 };
};
/** Signed distance (m) of `p` projected onto the line through `a` along unit `d`. */
const projParam = (p: XZ, a: XZ, d: UnitDir): number =>
    (p.x - a.x) * d.x + (p.z - a.z) * d.z;
/** Perpendicular distance (m) from `p` to the infinite line through `a` dir `d`. */
const perpDist = (p: XZ, a: XZ, d: UnitDir): number =>
    Math.abs((p.x - a.x) * d.z - (p.z - a.z) * d.x);

/** A resolved dispatch record for the main entrance door — the existing shell wall
 *  id to host it on plus the (clamped) offset + width along that wall, in METRES.
 *  Structurally parallel to `ShellWindowDispatch` so the executor handles it the
 *  same way (wall.createOpening + door.batch.create on a pre-existing wall id). */
export interface EntranceDoorDispatch {
    readonly shellWallId: string;
    readonly offsetM:     number;
    readonly widthM:      number;
    readonly heightM:     number;
    /** Per-pair finish — 'hall' ↔ exterior; resolves to the standard entry leaf. */
    readonly systemTypeId?: string;
    readonly name: string;
}

/** Pick the ground-floor entrance-hall room: the first room of type 'hall' (or, as
 *  a fallback, a 'corridor'). Returns null when neither exists. */
function findEntranceHall(rooms: readonly LayoutRoom[]): LayoutRoom | null {
    const hall = rooms.find(r => r.type === 'hall');
    if (hall) return hall;
    const corridor = rooms.find(r => r.type === 'corridor');
    return corridor ?? null;
}

/** Room centre in WORLD metres — prefer the explicit centroid; else polygon mean;
 *  else null (degenerate). */
function roomCentreWorld(room: LayoutRoom, planToWorld: PlanToWorldXZ): XZ | null {
    if (room.centroid) return planToWorld(room.centroid);
    const poly = room.polygon;
    if (poly && poly.length >= 3) {
        let cx = 0, cz = 0;
        for (const p of poly) { const w = planToWorld(p); cx += w.x; cz += w.z; }
        return { x: cx / poly.length, z: cz / poly.length };
    }
    return null;
}

/**
 * Resolve the single main-entrance door for a ground-floor layout.
 *
 * Algorithm (deterministic — no RNG):
 *  1. Find the entrance-hall room (type 'hall', else 'corridor'). If none, fall
 *     back to the geometric centroid of ALL rooms so we still pick a sensible
 *     façade.
 *  2. Compute every shell wall's perpendicular distance to that room centre.
 *  3. Choose the shell wall the room is on / nearest to. TIE-BREAK (within ~0.5 m
 *     of the closest perpendicular distance) by the LONGEST such wall — the
 *     widest, most street-facing façade segment — then by ascending wall id for
 *     a fully stable order.
 *  4. Centre a ~1.0 m door on the chosen wall, clamped to fit (A.21.D28 #5):
 *     width clamps to (wallLen − 2·clearance); offset clamps so the whole leaf
 *     stays strictly inside both ends. Drop (return null) when the wall is too
 *     short to host even a minimal door.
 *
 * Returns null when there is no usable shell wall (e.g. <1 shell wall, or every
 * candidate too short).
 */
export function resolveEntranceDoor(
    option: LayoutOption,
    shellWalls: readonly ShellWall[],
    planToWorld: PlanToWorldXZ = defaultPlanToWorld,
): EntranceDoorDispatch | null {
    if (!shellWalls || shellWalls.length === 0) return null;

    // 1. Target room centre (entrance hall → corridor → all-rooms centroid).
    const hall = findEntranceHall(option.rooms ?? []);
    let target: XZ | null = hall ? roomCentreWorld(hall, planToWorld) : null;
    if (!target) {
        const centres = (option.rooms ?? [])
            .map(r => roomCentreWorld(r, planToWorld))
            .filter((c): c is XZ => c !== null);
        if (centres.length > 0) {
            const cx = centres.reduce((s, c) => s + c.x, 0) / centres.length;
            const cz = centres.reduce((s, c) => s + c.z, 0) / centres.length;
            target = { x: cx, z: cz };
        }
    }
    // No rooms at all → centre the entrance on the longest shell wall (still a
    // sensible street façade) so the house never ends up sealed.
    if (!target) {
        const longest = [...shellWalls].sort(
            (a, b) => segDir(b.start, b.end).len - segDir(a.start, a.end).len
              || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
        )[0]!;
        return makeDoorOnWall(longest, hall?.type);
    }

    // 2-3. Rank shell walls: perpendicular distance to the target, tie-break by
    //      longest then id. We only consider the perpendicular distance to the
    //      wall's infinite line where the target projects WITHIN (or near) the
    //      wall span — otherwise a far-off collinear wall could win spuriously.
    interface Cand { wall: ShellWall; perp: number; len: number }
    const cands: Cand[] = [];
    for (const w of shellWalls) {
        const d = segDir(w.start, w.end);
        if (d.len < MIN_DOOR_M) continue;             // too short to ever host a door
        const t = projParam(target, w.start, d);
        // Distance from target to the SEGMENT (not the infinite line): clamp t to
        // the span, so a wall the room isn't beside scores by its true distance.
        const tc = Math.max(0, Math.min(d.len, t));
        const foot = { x: w.start.x + d.x * tc, z: w.start.z + d.z * tc };
        const segDistVal = Math.hypot(target!.x - foot.x, target!.z - foot.z);
        // Blend: prefer walls the room genuinely fronts (low perpendicular dist to
        // the line) but penalise walls whose nearest point is past an end.
        const perpVal = perpDist(target!, w.start, d);
        const score = Math.max(perpVal, segDistVal);
        cands.push({ wall: w, perp: score, len: d.len });
    }
    if (cands.length === 0) return null;

    cands.sort((a, b) => a.perp - b.perp);
    const best = cands[0]!;
    // Tie tolerance: only walls GENUINELY equidistant from the target (e.g. a
    // corner room fronting two walls) tie — then we pick the longer façade. A
    // wide window (0.5 m) wrongly pulled in long side walls a fronted-but-short
    // wall beats, letting an 8 m side wall steal the entrance from the 1.2 m wall
    // the hall actually touches. Keep it tight so the genuinely-fronted wall wins.
    const TIE_M = 0.1;
    const tied = cands.filter(c => c.perp <= best.perp + TIE_M);
    // Tie-break: longest façade first, then ascending id (stable + deterministic).
    tied.sort((a, b) => b.len - a.len || (a.wall.id < b.wall.id ? -1 : a.wall.id > b.wall.id ? 1 : 0));
    const chosen = tied[0]!.wall;

    return makeDoorOnWall(chosen, hall?.type);
}

/** Build a centred, clamped entrance-door dispatch on the given shell wall, or
 *  null when the wall is too short to host even a minimal door. */
function makeDoorOnWall(wall: ShellWall, hallType?: LayoutRoom['type']): EntranceDoorDispatch | null {
    const d = segDir(wall.start, wall.end);
    const maxWidthM = d.len - 2 * END_CLEAR_M;
    if (maxWidthM < MIN_DOOR_M) return null;          // can't host any door
    const widthM = Math.min(ENTRANCE_DOOR_WIDTH_M, maxWidthM);
    // Centre on the wall, then clamp so the whole leaf stays inside both ends.
    const centreOffset = (d.len - widthM) / 2;
    const maxOffsetM = Math.max(END_CLEAR_M, d.len - widthM - END_CLEAR_M);
    const offsetM = Math.min(Math.max(END_CLEAR_M, centreOffset), maxOffsetM);
    // Per-pair finish — the entrance connects the hall (or corridor) to the
    // EXTERIOR. We reuse the apartment door resolver's hall↔hall pairing as a
    // proxy for "circulation-grade leaf" (a solid timber entry); the resolver is
    // total over RoomType so any hallType resolves to a real system-type id.
    const sysType = hallType ? defaultDoorSystemTypeId(hallType, hallType) : undefined;
    return {
        shellWallId: wall.id,
        offsetM,
        widthM,
        heightM: ENTRANCE_DOOR_HEIGHT_M,
        ...(sysType ? { systemTypeId: sysType } : {}),
        name: 'Main Entrance Door',
    };
}
