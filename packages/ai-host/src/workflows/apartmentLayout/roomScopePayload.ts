// §RAC-APARTMENT-IN-ROOM (L-1644, 2026-08-21) — the room-scoped generate
// payload, PURE.
//
// "Create an apartment … on room 00-001": the target ROOM's boundary polygon is
// the shell, not the level's exterior walls. Design decision (stated, measured
// against the alternative):
//
//   (a) scope the gather to the room's `boundingWallIds` — REJECTED. A bounding
//       wall may extend past the room and bound OTHER rooms (one long wall
//       bounds three rooms), so chaining full wall baseLines reconstructs the
//       WRONG perimeter; and the level gather's exterior-filter would drop the
//       interior bounding walls entirely.
//   (b) synthesise the shell from the room's boundary polygon edges — CHOSEN.
//       The polygon is already closed / CCW / chained (the RoomData contract),
//       so `analyseShell`'s 50 mm chaining walk is trivially satisfied, and the
//       ring is exactly the room's shape, arcs entering as their tessellated
//       chords (~16 per fillet — no arc representation exists in the engine).
//
// RING CHOICE — CENTRELINE, not inner face. `boundary.polygon` is the wall
// CENTRELINE ring, and `analyseShell`'s contract is wall baseLines — which ARE
// centrelines — so the engine's own net-area / partition-inset semantics land
// interior partitions inside the room's inner face by the same rule they use on
// a whole-level shell. Feeding `resolveRoomFinishBoundary`'s inner-face ring
// would make the engine inset TWICE (its header itself warns "never feed it an
// already-inset ring" in the other direction).
//
// OPENINGS on the room's REAL bounding walls still inform the layout: their
// WORLD spans are computed exactly as the level payload computes them, then
// kept only when they actually lie ON this room's ring (≤ SPAN_ON_RING_M of
// it) — a shared wall's opening serving a NEIGHBOUR room must not steer this
// room's entrance pick or partition avoidance. The room's existing bounding
// walls are NEVER re-created (the executor's `skipExteriorWalls` skips the
// ring walls, which carry `isExternal` from the engine), and openings are
// never punched into them by this path — synthesised `room-ring-N` ids have no
// store identity, which is precisely why the ring travels as GEOMETRY.
//
// FAILURE ≠ EMPTY (C84 EI-1b): a ring that yields fewer than 3 usable edges is
// a REFUSAL naming the shape, never a null the caller renders as "no walls".

import type {
    ApartmentGenerateLayoutPayload,
    ApartmentProgram,
    ApartmentConstraints,
    ScoringWeights,
} from './types.js';
import { roomRingEdges, pointToSegment } from './shellReader.js';

/** How close (m) an opening span's midpoint must be to the ring polyline to be
 *  treated as an opening OF THIS ROOM. Centrelines coincide with the ring, so a
 *  real opening sits at ~0; the slack covers arc tessellation + join wobble. */
export const SPAN_ON_RING_M = 0.6;

/** A bounding wall as the builder needs it — openings already DETERMINED (the
 *  GR-10 unrecorded-set refusal is the store glue's job, before this call). */
export interface RoomScopeWall {
    readonly id: string;
    readonly baseLine?: readonly [{ x: number; z: number }, { x: number; z: number }];
    readonly openings: ReadonlyArray<{
        type: 'window' | 'door';
        elementId?: string;
        /** Offset along the wall (metres) from baseLine[0]. */
        offset?: number;
        /** Opening width (metres). */
        width?: number;
    }>;
}

export interface BuildRoomScopedPayloadInput {
    readonly levelId: string;
    /** The room's boundary polygon (closed CCW world-XZ centreline ring). */
    readonly roomPolygon: ReadonlyArray<{ x: number; z: number }>;
    /** The room's REAL bounding walls (for opening spans — never re-created). */
    readonly boundingWalls: ReadonlyArray<RoomScopeWall>;
    readonly program: ApartmentProgram;
    readonly constraints: ApartmentConstraints;
    readonly count: number;
    readonly scoringWeights: ScoringWeights;
    /** L-911 — the user stated the bedroom count; it is exact. */
    readonly lockBedroomCount?: boolean;
}

export type RoomScopedPayloadResult =
    | { readonly kind: 'payload'; readonly payload: ApartmentGenerateLayoutPayload }
    | { readonly kind: 'refusal'; readonly reason: string };

/** Build the room-scoped generate payload. Pure + deterministic. */
export function buildRoomScopedLayoutPayload(
    input: BuildRoomScopedPayloadInput,
): RoomScopedPayloadResult {
    const ring = input.roomPolygon.map(p => ({ x: p.x, z: p.z }));
    const edges = roomRingEdges(ring);
    if (edges.length < 3) {
        return {
            kind: 'refusal',
            reason:
                `this room's boundary yields only ${edges.length} usable edge(s) after dropping ` +
                `degenerate segments — the layout engine needs a closed polygon of at least 3. ` +
                `Nothing was changed.`,
        };
    }

    const onRing = (p: { x: number; z: number }): boolean =>
        edges.some(e => pointToSegment(p, e.baseLine[0], e.baseLine[1]) <= SPAN_ON_RING_M);

    const windowIds: string[] = [];
    const doorIds: string[] = [];
    const windowSpansWorld: Array<{ a: { x: number; z: number }; b: { x: number; z: number } }> = [];
    const doorSpansWorld: Array<{ a: { x: number; z: number }; b: { x: number; z: number } }> = [];
    for (const w of input.boundingWalls) {
        for (const o of w.openings) {
            // The SAME span math as buildLayoutRequestPayload — offset + width
            // along the baseLine — then the on-ring filter this scope adds.
            if (!w.baseLine || typeof o.offset !== 'number' || typeof o.width !== 'number') continue;
            const [s, e] = w.baseLine;
            const dx = e.x - s.x;
            const dz = e.z - s.z;
            const L = Math.hypot(dx, dz);
            if (L <= 1e-6) continue;
            const ux = dx / L, uz = dz / L;
            const a = { x: s.x + ux * o.offset, z: s.z + uz * o.offset };
            const b = { x: s.x + ux * (o.offset + o.width), z: s.z + uz * (o.offset + o.width) };
            const midpoint = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
            if (!onRing(midpoint)) continue;      // a neighbour room's opening
            if (o.type === 'window') {
                windowSpansWorld.push({ a, b });
                if (o.elementId) windowIds.push(o.elementId);
            } else if (o.type === 'door') {
                doorSpansWorld.push({ a, b });
                if (o.elementId) doorIds.push(o.elementId);
            }
        }
    }

    return {
        kind: 'payload',
        payload: {
            levelId: input.levelId,
            // Synthetic ids — the ring reader derives the same set from the SAME
            // helper, so the ≥3-shell-walls validations hold without weakening.
            shellWallIds: edges.map(e => e.id),
            entranceDoorId: doorIds[0] ?? '',
            windowIds,
            ...(windowSpansWorld.length > 0 ? { windowSpansWorld } : {}),
            ...(doorSpansWorld.length > 0 ? { doorSpansWorld } : {}),
            shellRingWorld: ring,
            ...(input.lockBedroomCount === true ? { lockBedroomCount: true } : {}),
            program: input.program,
            constraints: input.constraints,
            options: { count: input.count, scoringWeights: input.scoringWeights },
        },
    };
}
