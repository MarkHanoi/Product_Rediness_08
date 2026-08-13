// ─── roomDaylightAssembly — the PURE per-room daylight-input assembly ─────────
//
// Extracted from daylightConsole.ts (GR-10, the `[]`-means-unknown ledger) so
// the honest openings read is node-testable without the store layer. The old
// shape iterated `wall.openings ?? []`: a wall whose opening set was NEVER
// RECORDED contributed zero window apertures, so the room scored DARKER than
// anyone measured — a positive, wrong daylight verdict computed from absence
// (the FacadeOrientationService shape, C79 §5.2.0). A room touching such a
// wall is now returned as UNDETERMINED (C78 §8.1 RELATIONSHIP_NOT_RECORDED)
// and the caller EXCLUDES it, visibly, instead of scoring a guess. A PRESENT
// empty opening set is a real windowless answer and still scores (C71 §4.4).
//
// PURE: no store access, no I/O, no DOM. ai-host imports are type-only.

import type { RoomDaylightInput, WindowAperture } from '@pryzm/ai-host';
import type { UndeterminedReason } from '@pryzm/command-bus';
import { relationshipArrayOrUnknown } from '../relationshipDetermination.js';

export interface Pt { x: number; z: number }

export interface RoomLike {
    id: string;
    levelId: string;
    name?: string;
    occupancyType?: string;
    boundary?: { polygon?: ReadonlyArray<{ x: number; z: number }> };
    computed?: { centroid?: { x: number; z: number } };
}
export interface OpeningLike {
    type: 'door' | 'window';
    offset?: number;     // m along baseLine[0] → baseLine[1]
    width?: number;      // m
    height?: number;     // m
    sillHeight?: number; // m
}
export interface WallLike {
    id: string;
    levelId: string;
    baseLine?: ReadonlyArray<{ x: number; y?: number; z: number }>;
    openings?: ReadonlyArray<OpeningLike>;
}

const EPS = 1e-6;

export function dist(a: Pt, b: Pt): number { return Math.hypot(a.x - b.x, a.z - b.z); }
function sub(a: Pt, b: Pt): Pt { return { x: a.x - b.x, z: a.z - b.z }; }
function dot(a: Pt, b: Pt): number { return a.x * b.x + a.z * b.z; }
function unit(a: Pt): Pt { const L = Math.hypot(a.x, a.z) || 1; return { x: a.x / L, z: a.z / L }; }
function leftPerp(a: Pt): Pt { return { x: -a.z, z: a.x }; }
function add(a: Pt, b: Pt): Pt { return { x: a.x + b.x, z: a.z + b.z }; }
function mul(a: Pt, k: number): Pt { return { x: a.x * k, z: a.z * k }; }

/** Centroid of a polygon (shoelace; falls back to vertex mean). */
export function centroidOf(poly: readonly Pt[]): Pt {
    let cx = 0, cz = 0, A = 0;
    for (let i = 0; i < poly.length; i++) {
        const p = poly[i]!, q = poly[(i + 1) % poly.length]!;
        const cr = p.x * q.z - q.x * p.z;
        A += cr; cx += (p.x + q.x) * cr; cz += (p.z + q.z) * cr;
    }
    A *= 0.5;
    if (Math.abs(A) < EPS) {
        let sx = 0, sz = 0;
        for (const p of poly) { sx += p.x; sz += p.z; }
        return { x: sx / poly.length, z: sz / poly.length };
    }
    return { x: cx / (6 * A), z: cz / (6 * A) };
}

/** Find the wall whose centreline lies along the polygon edge a→b (mirrors
 *  FurnishLayoutExecutor.matchWallToEdge). */
export function matchWallToEdge(a: Pt, b: Pt, walls: readonly WallLike[], tol: number): WallLike | undefined {
    for (const w of walls) {
        const bl = w.baseLine;
        if (!bl || bl.length < 2) continue;
        const wa: Pt = { x: bl[0]!.x, z: bl[0]!.z };
        const wb: Pt = { x: bl[1]!.x, z: bl[1]!.z };
        if ((dist(a, wa) < tol && dist(b, wb) < tol) ||
            (dist(a, wb) < tol && dist(b, wa) < tol)) return w;
        const wd = sub(wb, wa);
        const wlen = Math.hypot(wd.x, wd.z) || 1;
        const u: Pt = { x: wd.x / wlen, z: wd.z / wlen };
        const projA = dot(sub(a, wa), u), projB = dot(sub(b, wa), u);
        const perpA = Math.abs(dot(sub(a, wa), leftPerp(u)));
        const perpB = Math.abs(dot(sub(b, wa), leftPerp(u)));
        if (perpA < tol && perpB < tol &&
            projA > -tol && projA < wlen + tol &&
            projB > -tol && projB < wlen + tol) return w;
    }
    return undefined;
}

/** The per-room assembly outcome, with unknowns as VALUES (C75 §1.4). */
export type RoomDaylightAssembly =
    | { readonly kind: 'input'; readonly input: RoomDaylightInput }
    /** Degenerate boundary (< 3 points) — nothing to score; the legacy skip. */
    | { readonly kind: 'skipped-degenerate'; readonly roomId: string }
    | {
          readonly kind: 'undetermined';
          readonly roomId: string;
          readonly name: string;
          readonly scope: string;
          readonly reason: UndeterminedReason;
          readonly detail: string;
          /** The walls whose opening sets were never recorded. */
          readonly unrecordedWallIds: readonly string[];
      };

/**
 * Assemble one room's RoomDaylightInput from its polygon + the level's walls.
 * External-wall WINDOW openings become WindowAperture rects; non-window or
 * interior-wall openings are ignored (no sky behind them). A wall whose
 * opening set was never recorded makes the ROOM undetermined — its daylight
 * cannot be scored, only guessed, and this module does not guess.
 */
export function assembleRoomDaylightInput(
    r: RoomLike,
    allWalls: readonly WallLike[],
    facades: Map<string, { isExterior?: boolean }> | undefined,
): RoomDaylightAssembly {
    const poly = (r.boundary?.polygon ?? []) as readonly Pt[];
    if (poly.length < 3) return { kind: 'skipped-degenerate', roomId: r.id };
    const centroid = r.computed?.centroid ?? centroidOf(poly);
    const windows: WindowAperture[] = [];
    const unrecordedWallIds: string[] = [];

    for (let i = 0; i < poly.length; i++) {
        const a = poly[i]!;
        const b = poly[(i + 1) % poly.length]!;
        if (dist(a, b) < EPS) continue;
        const wall = matchWallToEdge(a, b, allWalls, 0.2);
        if (!wall || !wall.baseLine || wall.baseLine.length < 2) continue;

        // Host gate: prefer the façade service; fall back to "has a window".
        const isExterior = facades?.get(wall.id)?.isExterior;
        if (isExterior === false) continue; // known interior wall — skip

        const ws: Pt = { x: wall.baseLine[0]!.x, z: wall.baseLine[0]!.z };
        const we: Pt = { x: wall.baseLine[1]!.x, z: wall.baseLine[1]!.z };
        const wdir = unit(sub(we, ws));
        // Outward normal = the edge perpendicular pointing AWAY from the room
        // centroid (away from the interior).
        const perp = leftPerp(wdir);
        const mid = mul(add(a, b), 0.5);
        const toCent = sub(centroid, mid);
        const outward = dot(perp, toCent) > 0 ? mul(perp, -1) : perp;

        // GR-10 — the honest openings read. Absent ⇒ this wall's openings were
        // never recorded ⇒ the room's window set is UNKNOWN, not zero.
        const openings = relationshipArrayOrUnknown<OpeningLike>(wall.openings);
        if (openings === null) {
            if (!unrecordedWallIds.includes(wall.id)) unrecordedWallIds.push(wall.id);
            continue;
        }
        for (const op of openings) {
            if (op.type !== 'window') continue;
            if (typeof op.offset !== 'number' || typeof op.width !== 'number') continue;
            const sill = typeof op.sillHeight === 'number' ? op.sillHeight : 0.9;
            const head = sill + (typeof op.height === 'number' ? op.height : 1.2);
            const startPt = add(ws, mul(wdir, op.offset));
            const endPt = add(ws, mul(wdir, op.offset + op.width));
            windows.push({
                a: startPt, b: endPt, sillM: sill, headM: head, outwardNormal: outward,
                label: `${r.name ?? r.id}#${windows.length}`,
            });
        }
    }

    if (unrecordedWallIds.length > 0) {
        return {
            kind: 'undetermined',
            roomId: r.id,
            name: r.name ?? r.id,
            scope: `daylight of room ${r.name ?? r.id}`,
            reason: 'RELATIONSHIP_NOT_RECORDED',
            detail:
                `the opening set of ${unrecordedWallIds.length} bounding wall(s) ` +
                `[${unrecordedWallIds.join(', ')}] was never recorded — a daylight score would ` +
                `treat unknown windows as none and report the room darker than anyone measured.`,
            unrecordedWallIds,
        };
    }

    return {
        kind: 'input',
        input: {
            roomId: r.id,
            name: r.name ?? r.id,
            polygon: poly,
            windows,
        },
    };
}
