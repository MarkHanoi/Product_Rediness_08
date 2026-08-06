// §FIX-SEATING-ONE-AUTHORITY / §FIX-SEATING-DYNAMIC-REDATUM / §FIX-SEATING-LAYERS-FFL.
//
// Three claims are pinned here, because each one was broken in a different way:
//
//   1. THE AUTHORITY  — `resolve*SeatingDatumFrom` answers "what surface does a thing
//      resting here sit on?" from plain data, including the fallback and tie-break
//      rules. "No finish" must be reported as `slab-top`, never as a silent 0.
//
//   2. THE CONVENTIONS — furniture / plumbing / lighting store `position.y` with
//      DIFFERENT meanings. `ReseatLevelElementsCommand` must match each family's own
//      create path; getting this wrong reintroduces the A.21.D15 double-offset bug.
//
//   3. THE DYNAMIC CASE — seating resolved once at create time is not enough. Change
//      a finish AFTERWARDS and everything standing on it must follow, and one undo
//      must put both back.
//
// DATA/COMMAND tests: faithful in-memory store stubs, no THREE, no DOM.

import { describe, it, expect } from 'vitest';
import {
    resolveFloorSeatingDatumFrom,
    resolveCeilingSeatingDatumFrom,
} from '../src/seating/SeatingDatumResolver';
import { ReseatLevelElementsCommand } from '../src/seating/ReseatLevelElementsCommand';
import { UpdateFloorLayersCommand } from '../src/floors/UpdateFloorLayersCommand';
import type { CommandContext } from '../src/types';

const LEVEL_ID = 'L1';
const ELEV = 3.0;          // storey elevation (structural slab top)
const FINISH = 0.015;      // 15 mm finish → FFL 15 mm above the slab top

/** A square finish/ceiling boundary centred on the origin. */
function square(half: number) {
    return [
        { x: -half, z: -half }, { x: half, z: -half },
        { x: half, z: half }, { x: -half, z: half },
    ];
}

function floor(over: Record<string, any> = {}): any {
    return {
        id: 'floor-1', type: 'floor', levelId: LEVEL_ID, visible: true,
        boundary: {
            polygon: square(50), baseOffset: FINISH, thickness: FINISH,
            detectionMethod: 'from-room',
        },
        ...over,
    };
}

function ceiling(over: Record<string, any> = {}): any {
    return {
        id: 'ceil-1', type: 'ceiling', levelId: LEVEL_ID, visible: true,
        // soffit = baseOffset + height - thickness = 0 + 2.7 - 0.05 = 2.65
        boundary: { polygon: square(50), baseOffset: 0, height: 2.7, thickness: 0.05 },
        ...over,
    };
}

const LEVEL = { id: LEVEL_ID, name: 'Level 1', elevation: ELEV, height: 3.0 };
const ORIGIN = { x: 0, z: 0 };

// ── 1. THE AUTHORITY ─────────────────────────────────────────────────────────

describe('§FIX-SEATING-ONE-AUTHORITY — the floor datum', () => {
    it('reports slab-top (not a silent 0) when no finish covers the point', () => {
        const d = resolveFloorSeatingDatumFrom(LEVEL, [], ORIGIN);
        expect(d.source).toBe('slab-top');
        expect(d.offsetAboveLevel).toBe(0);
        expect(d.y).toBeCloseTo(ELEV, 9);
    });

    it('seats on the finish top face (FFL) when a finish covers the point', () => {
        const d = resolveFloorSeatingDatumFrom(LEVEL, [floor()], ORIGIN);
        expect(d.source).toBe('floor-finish');
        expect(d.y).toBeCloseTo(ELEV + FINISH, 9);
    });

    it('falls back to slab-top for a point OUTSIDE the finish — never a foreign room FFL', () => {
        const small = floor({ boundary: { ...floor().boundary, polygon: square(1) } });
        const d = resolveFloorSeatingDatumFrom(LEVEL, [small], { x: 40, z: 40 });
        expect(d.source).toBe('slab-top');
        expect(d.y).toBeCloseTo(ELEV, 9);
    });

    it('takes the HIGHEST finish when several cover the point (rest ON, never buried)', () => {
        const thick = floor({ id: 'floor-2', boundary: { ...floor().boundary, baseOffset: 0.06 } });
        const d = resolveFloorSeatingDatumFrom(LEVEL, [floor(), thick], ORIGIN);
        expect(d.y).toBeCloseTo(ELEV + 0.06, 9);
    });

    it('ignores an invisible finish', () => {
        const d = resolveFloorSeatingDatumFrom(LEVEL, [floor({ visible: false })], ORIGIN);
        expect(d.source).toBe('slab-top');
    });
});

describe('§FIX-SEATING-ONE-AUTHORITY — the ceiling datum', () => {
    it('falls back to the level head height (bare structure) when no ceiling covers', () => {
        const d = resolveCeilingSeatingDatumFrom(LEVEL, [], ORIGIN);
        expect(d.source).toBe('level-head');
        expect(d.y).toBeCloseTo(ELEV + 3.0, 9);
    });

    it('hangs from the FINISHED soffit (baseOffset + height - thickness)', () => {
        const d = resolveCeilingSeatingDatumFrom(LEVEL, [ceiling()], ORIGIN);
        expect(d.source).toBe('ceiling-finish');
        expect(d.y).toBeCloseTo(ELEV + 2.65, 9);
    });

    it('takes the LOWEST soffit when several cover — the plane the room actually sees', () => {
        const dropped = ceiling({
            id: 'ceil-2',
            boundary: { ...ceiling().boundary, height: 2.4 }, // soffit 2.35
        });
        const d = resolveCeilingSeatingDatumFrom(LEVEL, [ceiling(), dropped], ORIGIN);
        expect(d.y).toBeCloseTo(ELEV + 2.35, 9);
    });
});

// ── 2 + 3. CONVENTIONS AND THE DYNAMIC CASE ──────────────────────────────────

/**
 * Build a context holding one item of each seated family, all at the origin, all
 * created against a level whose finish is `fflOffset` (null = bare slab).
 */
function makeCtx(opts: { fflOffset: number | null; ceilings?: any[] }) {
    const floors = opts.fflOffset === null
        ? []
        : [floor({ boundary: { ...floor().boundary, baseOffset: opts.fflOffset } })];
    const floorsById = new Map(floors.map(f => [f.id, f]));

    const seat = opts.fflOffset === null ? ELEV : ELEV + opts.fflOffset;

    // furniture: position.y is the FLOOR DATUM only (builder adds baseOffset once).
    const furniture = new Map<string, any>([['f1', {
        id: 'f1', levelId: LEVEL_ID, baseOffset: 1.2,   // wall-mounted TV
        position: { x: 0, y: seat, z: 0 },
    }]]);
    // plumbing: position.y is ABSOLUTE — the mount offset is baked in.
    const plumbing = new Map<string, any>([['p1', {
        id: 'p1', levelId: LEVEL_ID, baseOffset: 0.2,
        position: { x: 0, y: seat + 0.2, z: 0 },
    }]]);
    // lighting: position.y is ABSOLUTE, no mount offset on the record.
    const lighting = new Map<string, any>([
        ['l-floor', { id: 'l-floor', levelId: LEVEL_ID, fixtureType: 'floor_wood_post', position: { x: 0, y: seat, z: 0 } }],
        ['l-ceil', { id: 'l-ceil', levelId: LEVEL_ID, fixtureType: 'downlight', position: { x: 0, y: ELEV + 3.0, z: 0 } }],
    ]);

    const mapStore = (m: Map<string, any>) => ({
        getAll: () => Array.from(m.values()),
        get: (id: string) => m.get(id),
        update: (id: string, d: any) => { m.set(id, d); },
    });

    const floorStore = {
        getByLevel: (lvl: string) => (lvl === LEVEL_ID ? Array.from(floorsById.values()) : []),
        getById: (id: string) => floorsById.get(id),
        has: (id: string) => floorsById.has(id),
        update: (id: string, patch: any) => {
            const cur = floorsById.get(id);
            if (!cur) return undefined;
            const next = { ...cur, ...patch, boundary: { ...cur.boundary, ...(patch.boundary ?? {}) } };
            floorsById.set(id, next);
            return next;
        },
        restoreSnapshot: (snap: any) => { floorsById.set(snap.id, snap); },
    };

    const ctx = {
        bimManager: {
            getLevelById: (id: string) => (id === LEVEL_ID ? LEVEL : undefined),
            registerElement: () => {},
        },
        stores: {
            floorStore,
            ceilingStore: { getByLevel: () => opts.ceilings ?? [] },
            furnitureStore: mapStore(furniture),
            plumbingStore: mapStore(plumbing),
            lightingStore: mapStore(lighting),
        },
    } as unknown as CommandContext;

    return { ctx, furniture, plumbing, lighting, floorStore };
}

describe('§FIX-SEATING-DYNAMIC-REDATUM — ReseatLevelElementsCommand', () => {
    it('re-seats each family by ITS OWN convention when a finish appears', () => {
        // Items were created on BARE SLAB, then a 15 mm finish is added underneath them.
        const { ctx, furniture, plumbing, lighting } = makeCtx({ fflOffset: null });
        // Now the level HAS a finish — swap it in before re-seating.
        (ctx.stores as any).floorStore.getByLevel = () => [floor()];

        const cmd = new ReseatLevelElementsCommand(LEVEL_ID);
        const r = cmd.execute(ctx);
        expect(r.success).toBe(true);

        const ffl = ELEV + FINISH;
        // furniture — datum ONLY; baseOffset must NOT be baked in (A.21.D15).
        expect(furniture.get('f1').position.y).toBeCloseTo(ffl, 9);
        // plumbing — absolute, so the mount offset IS re-added.
        expect(plumbing.get('p1').position.y).toBeCloseTo(ffl + 0.2, 9);
        // lighting — a floor lamp rises with the floor.
        expect(lighting.get('l-floor').position.y).toBeCloseTo(ffl, 9);
    });

    it('re-hangs ceiling fixtures from the finished soffit, leaving floor items alone', () => {
        const { ctx, lighting } = makeCtx({ fflOffset: FINISH, ceilings: [ceiling()] });
        new ReseatLevelElementsCommand(LEVEL_ID).execute(ctx);
        // downlight moves from the bare head height (ELEV+3.0) to the soffit.
        expect(lighting.get('l-ceil').position.y).toBeCloseTo(ELEV + 2.65, 9);
        // the floor lamp was already correct and must not move.
        expect(lighting.get('l-floor').position.y).toBeCloseTo(ELEV + FINISH, 9);
    });

    it('is idempotent — a second run moves nothing and records nothing', () => {
        const { ctx } = makeCtx({ fflOffset: null });
        (ctx.stores as any).floorStore.getByLevel = () => [floor()];
        const first = new ReseatLevelElementsCommand(LEVEL_ID).execute(ctx);
        expect(first.affectedElementIds.length).toBeGreaterThan(0);
        const second = new ReseatLevelElementsCommand(LEVEL_ID).execute(ctx);
        expect(second.affectedElementIds).toHaveLength(0);
    });

    it('undo restores every element to its exact prior Y', () => {
        const { ctx, furniture, plumbing } = makeCtx({ fflOffset: null });
        const beforeF = furniture.get('f1').position.y;
        const beforeP = plumbing.get('p1').position.y;

        (ctx.stores as any).floorStore.getByLevel = () => [floor()];
        const cmd = new ReseatLevelElementsCommand(LEVEL_ID);
        cmd.execute(ctx);
        expect(furniture.get('f1').position.y).not.toBeCloseTo(beforeF, 9);

        cmd.undo(ctx);
        expect(furniture.get('f1').position.y).toBeCloseTo(beforeF, 9);
        expect(plumbing.get('p1').position.y).toBeCloseTo(beforeP, 9);
    });

    it('leaves elements on OTHER levels untouched', () => {
        const { ctx, furniture } = makeCtx({ fflOffset: null });
        furniture.set('other', { id: 'other', levelId: 'L2', baseOffset: 0, position: { x: 0, y: 99, z: 0 } });
        (ctx.stores as any).floorStore.getByLevel = () => [floor()];
        new ReseatLevelElementsCommand(LEVEL_ID).execute(ctx);
        expect(furniture.get('other').position.y).toBe(99);
    });
});

// ── The layers path: thickness must move the FFL, and the FFL must move the items ──

describe('§FIX-SEATING-LAYERS-FFL — UpdateFloorLayersCommand', () => {
    function layersCmd(thickness: number) {
        return new UpdateFloorLayersCommand({
            floorId: 'floor-1',
            layers: [{ id: 'ly1', name: 'tile', thickness, material: 'tile' } as any],
            thickness,
        });
    }

    it('moves the FFL up by the thickness delta, keeping the finish bottom on the slab', () => {
        const { ctx, floorStore } = makeCtx({ fflOffset: FINISH });
        // start: thickness 15 mm, baseOffset 15 mm  ⇒ slab-top reference = 0
        layersCmd(0.06).execute(ctx);
        const after = floorStore.getById('floor-1');
        expect(after.boundary.thickness).toBeCloseTo(0.06, 9);
        // bottom stays on the slab top (0), so the FFL rises to 60 mm.
        expect(after.boundary.baseOffset).toBeCloseTo(0.06, 9);
    });

    it('re-seats the level so nothing is left buried in the thicker build-up', () => {
        const { ctx, furniture, plumbing } = makeCtx({ fflOffset: FINISH });
        layersCmd(0.06).execute(ctx);
        expect(furniture.get('f1').position.y).toBeCloseTo(ELEV + 0.06, 9);
        expect(plumbing.get('p1').position.y).toBeCloseTo(ELEV + 0.06 + 0.2, 9);
    });

    it('one undo restores BOTH the build-up and everything standing on it', () => {
        const { ctx, furniture, floorStore } = makeCtx({ fflOffset: FINISH });
        const beforeY = furniture.get('f1').position.y;
        const cmd = layersCmd(0.06);
        cmd.execute(ctx);
        cmd.undo(ctx);
        expect(floorStore.getById('floor-1').boundary.baseOffset).toBeCloseTo(FINISH, 9);
        expect(furniture.get('f1').position.y).toBeCloseTo(beforeY, 9);
    });
});
