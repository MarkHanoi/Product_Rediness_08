/**
 * @file elementMove.ts
 *
 * §FIX-PLAN-MOVE-PARITY (Gate G7) — the SINGLE canonical definition of
 * "what does it mean to TRANSLATE a placed element by (dx, dz) in the world XZ plane".
 *
 * Sibling of `elementYawRotate.ts` (§FIX-PLAN-ROTATE-PARITY / L-267) and built to the
 * same rule: the plan-view Move tool does NOT re-implement translation — it calls this
 * module, and this module emits **the exact same bus command, with the exact same
 * payload shape, that the 3-D transform gizmo already dispatches on drag-end**
 * (`registerTransformDragHandler`). One definition of "move element X", two gestures.
 *
 * ## Why this module exists (the signature disease)
 *
 * This project has a NINE-times-repeated defect (L-239/240/243/246/251/255/260A/266/267):
 * *one element, TWO paths, and the plan path silently drops what the 3-D path resolves*.
 * Move was already carrying three live instances of it before this module landed:
 *
 *   • STAIR    — moves with the 3-D gizmo (`stair.move`), but `MovePlanToolHandler`
 *                had NO stair branch: it fell to `default:` and logged
 *                "No move implementation for element type: stair". The Move button is
 *                capability-gated ON for stairs (RAIL_OPS), so it was present, enabled,
 *                and silently did nothing — the exact L-267 shape.
 *   • PLUMBING — same: `plumbing.moveFixture` works from the 3-D gizmo, no plan branch.
 *   • UNDO     — every 3-D drag-end opts into the unified ring-buffer undo timeline
 *                (`_recordUndo` + the pre-gesture `_prev*` pose, §FIX-UNDO-CAPTURE-SYSTEMIC
 *                / L-72). The plan Move tool did NOT, for ANY type — so a plan move and a
 *                3-D move of the same element produced DIFFERENT undo behaviour. C16 says
 *                one gesture = one undo entry; it must be the SAME entry on both surfaces.
 *
 * Every payload below therefore carries the `_recordUndo` / `_prev*` fields the 3-D path
 * carries, so a plan move and a 3-D move of the same element by the same delta produce a
 * byte-identical record mutation AND a byte-identical undo entry. That equivalence is
 * pinned by `views/plantools/__tests__/planMoveParity.spec.ts`.
 *
 * ## NO NEW REPRESENTATION (C11)
 *
 * A move is a position delta on the record — nothing else. Point-anchored families
 * translate their `position`; line families translate both baseline/endpoint vertices;
 * area families translate every polygon vertex (and the centroid where the record
 * carries one). No second notion of "where the element is" is introduced anywhere.
 *
 * ## Families NOT handled here, with reasons (tracked under G7 — not silently dropped)
 *
 *   • wall        — a translate must CARRY endpoint-coincident neighbours or
 *                   WallJoinResolver re-snaps the corner and visually reverts the move
 *                   (§WALL-MOVE-CARRY-NEIGHBOURS). That cascade is wall-specific and
 *                   stays in `MovePlanToolHandler`, which dispatches the same
 *                   `wall.updateBaseline` / `wall.cascadeBaseline` the 3-D gizmo uses.
 *   • door/window — hosted: the delta is PROJECTED onto the host wall and committed as an
 *                   `offset` (C15). It needs the host wall record, not just the element,
 *                   so it stays in the handler (`door.setOffset` / `window.setOffset` —
 *                   the same commands `HostedElementDragController` commits).
 *   • slab        — MOVE IS DEAD ON BOTH SURFACES. `slab.updatePolygon` is claimed by the
 *                   plugin `UpdateSlabPolygonHandler`, which `produceCommand`s against the
 *                   DETACHED plugin DTO store (`ctx.stores.slab`) — a different object from
 *                   the geometry `window.slabStore` that the builders, the plan projector
 *                   and persistence read, and no committer is registered in production to
 *                   bridge it. The 3-D gizmo has no slab branch at all. Making slab move
 *                   requires a legacy bus bridge to `UpdateSlabPolygonCommand` (the
 *                   §FIX-TRANSFORM-DRAG-PAYLOAD-AUDIT / L-220 `plumbing.moveFixture`
 *                   pattern: a DISTINCT type that the plugin handler cannot shadow).
 *                   Until that bridge lands, the Move tool must SAY SO rather than
 *                   dispatch into the void.
 *   • handrail /  — `UpdateHandrailCommand` carries no positional payload (the geometry is
 *     railing       path points) and no handrail command is registered on the bus at all.
 *                   The 3-D gizmo already refuses the drag and tells the user to
 *                   "use the Plan View move tool" — a tool which never implemented it.
 *   • lighting    — no move command exists on any surface (and `ElementCapabilities` does
 *                   not declare 'move' for it, so at least no button lies).
 *
 * Layer: L5 (`apps/editor`). Pure: no DOM, no `window`, no THREE. Spans are emitted by
 * the bus at dispatch (P8), exactly as for `buildYawRotateCommand`.
 */

/** A plain 3D point (world metres). */
export interface Vec3Like {
    readonly x: number;
    readonly y: number;
    readonly z: number;
}

/**
 * The ONE table of "which bus command moves element type X".
 *
 * Both surfaces read it: `MovePlanToolHandler` dispatches what it returns, and
 * `planMoveParity.spec.ts` asserts that every command `registerTransformDragHandler`
 * dispatches on a drag-end is the command named here for that family. A 3-D-only move
 * command (or a plan-only one) is therefore a RED TEST, not a shipped divergence.
 */
export const MOVE_COMMAND_BY_TYPE = {
    wall:          'wall.updateBaseline',      // + 'wall.cascadeBaseline' when neighbours carry
    'curtain-wall':'wall.updateCurtainWall',
    curtainwall:   'wall.updateCurtainWall',
    door:          'door.setOffset',
    window:        'window.setOffset',
    column:        'column.update',
    beam:          'beam.update',
    floor:         'floor.update',
    ceiling:       'ceiling.update',
    roof:          'roof.update',
    furniture:     'furniture.updateParameters',
    plumbing:      'plumbing.moveFixture',
    plumbingfixture:'plumbing.moveFixture',
    stair:         'stair.move',
    stairs:        'stair.move',
    room:          'room.updateBoundary',
} as const satisfies Readonly<Record<string, string>>;

export type MovableType = keyof typeof MOVE_COMMAND_BY_TYPE;

/**
 * Types whose Move button is capability-gated ON but whose move CANNOT be committed
 * today, with the reason surfaced to the user instead of a silent no-op. Keeping this
 * list explicit (rather than letting them fall into a `default:` console.warn) is the
 * whole point: a button that is enabled and does nothing is worse than a missing button.
 */
export const MOVE_UNSUPPORTED_REASON: Readonly<Record<string, string>> = {
    slab:     'Slab move needs a geometry-store bridge for its polygon update (the bus command is claimed by a detached plugin store) — tracked under Gate G7.',
    handrail: 'Handrail geometry is defined by path points and no positional command is registered — tracked under Gate G7.',
    railing:  'Railing geometry is defined by path points and no positional command is registered — tracked under Gate G7.',
    lighting: 'Lighting fixtures have no move command on any surface yet — tracked under Gate G7.',
};

/** Canonicalise a raw `userData.elementType` (any case, with aliases). */
export function normaliseMoveType(elementType: string | null | undefined): string {
    return (elementType ?? '').toLowerCase().trim();
}

/** The bus command that moves this element type, or `null` when it has none. */
export function moveCommandFor(elementType: string | null | undefined): string | null {
    const key = normaliseMoveType(elementType);
    return (MOVE_COMMAND_BY_TYPE as Readonly<Record<string, string>>)[key] ?? null;
}

/** True when a translate of this type can be committed today. */
export function canMove(elementType: string | null | undefined): boolean {
    return moveCommandFor(elementType) !== null;
}

/** The command a translate produces: a bus type + its payload. */
export interface MoveCommand {
    readonly type: string;
    readonly payload: Readonly<Record<string, unknown>>;
}

/** Polygon vertices arrive as `{x,z}` OR (legacy, XZ-in-XY) as `{x,y}`. Read defensively. */
interface PolyPt { readonly x: number; readonly y?: number; readonly z?: number }

function translatePolygon(poly: readonly PolyPt[], dx: number, dz: number): PolyPt[] {
    return poly.map((p) =>
        p.z !== undefined
            ? { x: p.x + dx, z: p.z + dz }
            : { x: p.x + dx, y: (p.y ?? 0) + dz },
    );
}

function clonePolygon(poly: readonly PolyPt[]): PolyPt[] {
    return poly.map((p) => ({ ...p }));
}

function isFiniteVec(v: unknown): v is Vec3Like {
    const p = v as Vec3Like | undefined;
    return !!p && Number.isFinite(p.x) && Number.isFinite(p.z);
}

/**
 * Build the canonical command that translates `record` (an element of type
 * `elementType`) by `(dx, dz)` metres in the world XZ plane.
 *
 * Returns `null` when the type has no shared move definition (wall / door / window keep
 * their surface-shared but element-specific paths in `MovePlanToolHandler`; slab /
 * handrail / lighting have no committable move at all — see `MOVE_UNSUPPORTED_REASON`),
 * or when the record is unusable. The caller SURFACES that; it never falls back to a
 * bespoke mutation.
 *
 * Every payload is the SAME SHAPE the 3-D gizmo dispatches in
 * `registerTransformDragHandler` — including `_recordUndo` + the pre-gesture `_prev*`
 * pose, so the undo bridge emits an invertible PatchPair and ONE gesture = ONE undo
 * entry (C16) on BOTH surfaces.
 */
export function buildMoveCommand(
    elementType: string,
    record:      unknown,
    dx:          number,
    dz:          number,
): MoveCommand | null {
    if (!Number.isFinite(dx) || !Number.isFinite(dz)) return null;
    if (dx === 0 && dz === 0) return null;
    if (!record || typeof record !== 'object') return null;

    const type = normaliseMoveType(elementType);
    const r = record as {
        id?: string;
        position?: Vec3Like;
        startPoint?: Vec3Like;
        endPoint?: Vec3Like;
        baseLine?: [Vec3Like, Vec3Like];
        boundary?: { polygon?: PolyPt[]; centroid?: { x: number; z: number } };
        polygon?: PolyPt[];
        footprint?: { polygon?: [number, number][]; centroid?: [number, number] };
        boundingWallIds?: string[];
    };
    const id = r.id;
    if (!id) return null;

    // ── Point-anchored families — translate `position` ────────────────────────────
    if (type === 'column') {
        if (!isFiniteVec(r.position)) return null;
        const p = r.position;
        return {
            type: 'column.update',
            payload: {
                id,
                updates:     { position: { x: p.x + dx, y: p.y, z: p.z + dz } },
                _recordUndo: true,
                _prev:       { position: { x: p.x, y: p.y, z: p.z } },
            },
        };
    }

    if (type === 'furniture') {
        if (!isFiniteVec(r.position)) return null;
        const p = r.position;
        return {
            type: 'furniture.updateParameters',
            payload: {
                id,
                position:      { x: p.x + dx, y: p.y, z: p.z + dz },
                _recordUndo:   true,
                _prevPosition: { x: p.x, y: p.y, z: p.z },
            },
        };
    }

    if (type === 'plumbing' || type === 'plumbingfixture') {
        if (!isFiniteVec(r.position)) return null;
        const p = r.position;
        // §FIX-TRANSFORM-DRAG-PAYLOAD-AUDIT (L-220) — `plumbing.moveFixture` { id, to } is
        // the UN-SHADOWED legacy bridge (→ MovePlumbingCommand → geometry plumbingStore →
        // bim-plumbing-updated → 3D rebuild + 2D re-projection). NOT `plumbing.move`, which
        // the plugin handler claims, wants a different payload, and writes to a detached
        // store. This is the exact command the 3-D gizmo commits.
        return {
            type: 'plumbing.moveFixture',
            payload: { id, to: { x: p.x + dx, y: p.y, z: p.z + dz } },
        };
    }

    if (type === 'stair' || type === 'stairs') {
        // §STAIR-3D-MOVE — the stair mesh bakes WORLD coordinates, so the move is expressed
        // as a DELTA (MoveStairCommand shifts startPosition + flight overrides + landing
        // centres together). Y is level-locked, so only XZ travels. Identical payload to the
        // 3-D gizmo's drag-end dispatch.
        return {
            type: 'stair.move',
            payload: { stairId: id, delta: { x: dx, y: 0, z: dz } },
        };
    }

    // ── Line families — translate both endpoints ─────────────────────────────────
    if (type === 'beam') {
        const sp = r.startPoint;
        const ep = r.endPoint;
        if (!isFiniteVec(sp) || !isFiniteVec(ep)) return null;
        return {
            type: 'beam.update',
            payload: {
                beamId:  id,
                updates: {
                    startPoint: { x: sp.x + dx, y: sp.y, z: sp.z + dz },
                    endPoint:   { x: ep.x + dx, y: ep.y, z: ep.z + dz },
                },
                _recordUndo: true,
                _prev: {
                    startPoint: { x: sp.x, y: sp.y, z: sp.z },
                    endPoint:   { x: ep.x, y: ep.y, z: ep.z },
                },
            },
        };
    }

    if (type === 'curtain-wall' || type === 'curtainwall') {
        const bl = r.baseLine;
        if (!bl?.[0] || !bl?.[1]) return null;
        return {
            type: 'wall.updateCurtainWall',
            payload: {
                id,
                updates: {
                    baseLine: [
                        { x: bl[0].x + dx, y: bl[0].y, z: bl[0].z + dz },
                        { x: bl[1].x + dx, y: bl[1].y, z: bl[1].z + dz },
                    ],
                },
            },
        };
    }

    // ── Area families — translate every polygon vertex ───────────────────────────
    if (type === 'floor' || type === 'ceiling') {
        const poly = (r.boundary?.polygon ?? r.polygon ?? []) as PolyPt[];
        if (poly.length < 3) return null;
        const next = translatePolygon(poly, dx, dz);
        const prev = clonePolygon(poly);
        if (type === 'floor') {
            return {
                type: 'floor.update',
                payload: {
                    floorId:     id,
                    updates:     { boundary: { ...r.boundary, polygon: next } },
                    _recordUndo: true,
                    _prev:       { boundary: { ...r.boundary, polygon: prev } },
                },
            };
        }
        return {
            type: 'ceiling.update',
            payload: {
                ceilingId: id,
                updates:   { boundary: { ...r.boundary, polygon: next } },
            },
        };
    }

    if (type === 'roof') {
        // RoofFootprint uses [number, number] tuples, NOT {x,z} objects.
        const fp = r.footprint;
        if (!fp?.polygon?.length) return null;
        const polygon: [number, number][] = fp.polygon.map(
            (pt) => [pt[0] + dx, pt[1] + dz] as [number, number],
        );
        const centroid: [number, number] = [
            (fp.centroid?.[0] ?? 0) + dx,
            (fp.centroid?.[1] ?? 0) + dz,
        ];
        return {
            type: 'roof.update',
            payload: { id, updates: { footprint: { polygon, centroid } } },
        };
    }

    if (type === 'room') {
        const b = r.boundary;
        if (!b?.polygon?.length) return null;
        return {
            type: 'room.updateBoundary',
            payload: {
                id,
                boundary: {
                    ...b,
                    polygon:  translatePolygon(b.polygon, dx, dz),
                    centroid: { x: (b.centroid?.x ?? 0) + dx, z: (b.centroid?.z ?? 0) + dz },
                },
                boundingWallIds: r.boundingWallIds ?? [],
            },
        };
    }

    return null;
}
