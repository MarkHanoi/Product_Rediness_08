/**
 * §REGION-ANNULUS-REACHABLE (ADR-0329) — the arms the probe could not reach.
 *
 * `regionParcelBoundaryAnnulus.probe.test.ts` proves the TRACER produces an
 * annulus. That is not the founder's question. ⭐ COMMITTED ≠ REACHABLE: a fix
 * that returns the right value from a pure function and never reaches the mesh is
 * the failure mode that has cost this repo whole sessions. This file drives the
 * chain the user actually experiences — tracer → sketch → store → dependency
 * tracker → **the shipped fragment builder** — and asserts on the GEOMETRY, not on
 * a return value.
 *
 * ── WHAT IS REAL (C74 §3.4 — a fixture that supplies the value under test proves
 *    nothing) ────────────────────────────────────────────────────────────────────
 *
 * REAL, imported from production and never re-implemented here:
 *   • `traceRegionSketchAtPoint`               — the ONE region entry point
 *   • `SlabFragmentBuilder.createSlabMeshWithEdges` — **the shipped mesh path**,
 *     the same call `_buildSlab` makes. The hole is measured off the triangles it
 *     emits, so a builder that stopped punching would turn this red.
 *   • `WallFaceResolver`                       — the real resolver, reading the
 *     real `window.wallStore` global it reads in production
 *   • `SlabStore`, `SlabDependencyTracker`     — the real store and the real
 *     tracker, constructed as `initTools.ts` constructs them
 *
 * NOT REAL, stated so nothing is overclaimed:
 *   • The wall store is a probe double, for the reason `c79MovePropagation.test.ts`
 *     states: the production `WallStore` is an L2 package `geometry-slab` does not
 *     depend on. It implements the two surfaces the code under test uses and it is
 *     the SUBJECT of the move, never the source of the answer.
 *   • Undo is driven by restoring the wall — the reverse of the same act — not by
 *     a CommandManager, which this package cannot construct. §3 states exactly what
 *     that does and does not prove.
 *
 * ── THE FALSIFIER ────────────────────────────────────────────────────────────────
 * §0 runs the identical mesh measurement over a slab with NO inner loops and shows
 * it reads 1600. A hole-measuring probe that reports 1200 because it never measured
 * anything is worthless; that arm rules it out.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { traceRegionSketchAtPoint, type RegionWallLike } from '../src/SlabRegionTracer';
import { SlabFragmentBuilder } from '../src/SlabFragmentBuilder';
import { SlabStore } from '../src/SlabStore';
import { SlabDependencyTracker } from '../src/SlabDependencyTracker';
import type { SlabSketch } from '../src/SketchTypes';
import type { SlabData } from '../src/SlabTypes';

// ─── the probe's wall store (shape copied from c79MovePropagation.test.ts) ───
type ProbeWall = { id: string; baseLine: { x: number; y: number; z: number }[]; thickness: number };
type WallEvent = 'add' | 'update' | 'remove';

class ProbeWallStore {
    private walls = new Map<string, ProbeWall>();
    private listeners: ((e: WallEvent, w: ProbeWall) => void)[] = [];

    seed(w: ProbeWall): void { this.walls.set(w.id, w); }
    getById(id: string): ProbeWall | undefined { return this.walls.get(id); }
    getAll(): ProbeWall[] { return [...this.walls.values()]; }
    subscribe(cb: (e: WallEvent, w: ProbeWall) => void): () => void {
        this.listeners.push(cb);
        return () => { this.listeners = this.listeners.filter(l => l !== cb); };
    }
    /** THE ACT: set a wall's centreline, then emit the real 'update' event. */
    setBaseLine(id: string, line: { x: number; z: number }[]): void {
        const w = this.walls.get(id);
        if (!w) throw new Error(`probe wall "${id}" not seeded`);
        w.baseLine = line.map(p => ({ x: p.x, y: 0, z: p.z }));
        for (const l of this.listeners) l('update', w);
    }
    asRegionWalls(): RegionWallLike[] {
        return this.getAll().map(w => ({
            id: w.id,
            baseLine: w.baseLine.map(p => ({ x: p.x, z: p.z })),
        }));
    }
}

type TrackerWallStore = ConstructorParameters<typeof SlabDependencyTracker>[1];
const asTrackerWallStore = (s: ProbeWallStore) => s as unknown as TrackerWallStore;

// ─── the fixture: a 40 x 40 parcel with a 20 x 20 building centred in it ─────
const PARCEL = [{ x: 0, z: 0 }, { x: 40, z: 0 }, { x: 40, z: 40 }, { x: 0, z: 40 }];
const BUILDING = [{ x: 10, z: 10 }, { x: 30, z: 10 }, { x: 30, z: 30 }, { x: 10, z: 30 }];
const GARDEN_CLICK = { x: 5, z: 20 };
const BUILDING_CENTRE = { x: 20, z: 20 };

const PARCEL_AREA = 1600;
const BUILDING_AREA = 400;
const GARDEN_AREA = 1200;   // the correct answer, in MODEL terms

/**
 * ⚠ THE MESH IS NOT THE MODEL, and this constant is the difference.
 *
 * `SlabFragmentBuilder` outsets the OUTER ring by `SLAB_WALL_OUTSET = 0.05 m`
 * (`SlabFragmentBuilder.ts:1191`) *"so that the slab geometry seats under adjacent
 * walls, eliminating visible gaps"*, and its own comment states the other half:
 * *"Only the outer boundary is outset — holes are voids and must NOT be expanded."*
 *
 * So a 40 x 40 parcel is DRAWN at 40.1 x 40.1 = 1608.01 m², and a hole is drawn at
 * its exact traced size. This is a pre-existing, deliberate construction decision;
 * ADR-0329 does not change it and this file does not assert it away.
 *
 * MEASURED, not assumed: 1608.00993887201 against a predicted 1608.01 — the residual
 * is the mitre solver's, not a modelling error. That the reading is NOT exactly
 * 1600.000 is itself evidence the number came off the triangles rather than out of
 * the fixture (C74 §3.4).
 *
 * The load-bearing assertion in every arm below is therefore the DIFFERENCE — the
 * hole removes exactly `BUILDING_AREA` — which is invariant to the outset and is the
 * founder's "1200, not 1600" stated in a form the geometry can actually answer.
 */
const OUTSET_M = 0.05;
const drawnOuter = (w: number, d: number) => (w + 2 * OUTSET_M) * (d + 2 * OUTSET_M);
const PARCEL_DRAWN = drawnOuter(40, 40);        // 1608.01
const BUILDING_DRAWN = drawnOuter(20, 20);      // 404.01
const CAP_TOL = 0.02;                           // mitre residual, measured at ~0.010

function seedSite(store: ProbeWallStore): void {
    const ring = (pts: { x: number; z: number }[], prefix: string) => {
        for (let i = 0; i < pts.length; i++) {
            const a = pts[i]!, b = pts[(i + 1) % pts.length]!;
            store.seed({
                id: `${prefix}-${i}`,
                baseLine: [{ x: a.x, y: 0, z: a.z }, { x: b.x, y: 0, z: b.z }],
                thickness: 0.2,
            });
        }
    };
    ring(PARCEL, 'parcel');
    ring(BUILDING, 'bldg');
}

function regionSlab(id: string, sketch: SlabSketch, ring: { x: number; y: number }[]): SlabData {
    return {
        id, type: 'slab', levelId: 'L0', thickness: 0.2,
        position: { x: 0, y: 0, z: 0 },
        polygon: ring, sketch,
        ifcData: { guid: `guid-${id}`, ifcClass: 'IfcSlab' },
    } as unknown as SlabData;
}

// ════════════════════════════════════════════════════════════════════════════
// THE MEASUREMENT: read the slab's TOP CAP straight off the shipped geometry.
// ════════════════════════════════════════════════════════════════════════════
/**
 * Sum the XZ area of every triangle lying in the slab's top plane.
 *
 * This is deliberately taken from `mesh.geometry` rather than from any polygon the
 * test could have computed itself: the founder's question is "what does the slab
 * COVER", and the only honest subject for that is the triangles that get drawn.
 * `buildSlabGeometry` triangulates outer + holes through
 * `THREE.ShapeUtils.triangulateShape`, so a hole that was not punched shows up here
 * as 400 m² of extra cap and nowhere else.
 *
 * Note the deliberate absence of an even-odd ray cast: containment below is decided
 * by triangle barycentric sign, a different construction from C73 §3.1's
 * point-in-polygon family, so this file adds nothing to that census.
 */
function topCapTriangles(mesh: { geometry: any }): { a: number[]; b: number[]; c: number[] }[] {
    const pos = mesh.geometry.getAttribute('position');
    const idx = mesh.geometry.getIndex();
    let maxY = -Infinity;
    for (let i = 0; i < pos.count; i++) maxY = Math.max(maxY, pos.getY(i));

    const tris: { a: number[]; b: number[]; c: number[] }[] = [];
    const at = (i: number) => [pos.getX(i), pos.getY(i), pos.getZ(i)];
    const count = idx ? idx.count : pos.count;
    for (let t = 0; t < count; t += 3) {
        const i0 = idx ? idx.getX(t) : t;
        const i1 = idx ? idx.getX(t + 1) : t + 1;
        const i2 = idx ? idx.getX(t + 2) : t + 2;
        const a = at(i0), b = at(i1), c = at(i2);
        if (Math.abs(a[1]! - maxY) > 1e-6) continue;
        if (Math.abs(b[1]! - maxY) > 1e-6) continue;
        if (Math.abs(c[1]! - maxY) > 1e-6) continue;
        tris.push({ a, b, c });
    }
    return tris;
}

function topCapArea(mesh: { geometry: any }): number {
    let sum = 0;
    for (const { a, b, c } of topCapTriangles(mesh)) {
        sum += Math.abs(
            (b[0]! - a[0]!) * (c[2]! - a[2]!) - (c[0]! - a[0]!) * (b[2]! - a[2]!),
        ) / 2;
    }
    return sum;
}

/** Is `p` covered by any top-cap triangle? Barycentric sign test, no ray cast. */
function capCovers(mesh: { geometry: any }, p: { x: number; z: number }): boolean {
    const sign = (ax: number, az: number, bx: number, bz: number, cx: number, cz: number) =>
        (ax - cx) * (bz - cz) - (bx - cx) * (az - cz);
    for (const { a, b, c } of topCapTriangles(mesh)) {
        const d1 = sign(p.x, p.z, a[0]!, a[2]!, b[0]!, b[2]!);
        const d2 = sign(p.x, p.z, b[0]!, b[2]!, c[0]!, c[2]!);
        const d3 = sign(p.x, p.z, c[0]!, c[2]!, a[0]!, a[2]!);
        const hasNeg = d1 < -1e-9 || d2 < -1e-9 || d3 < -1e-9;
        const hasPos = d1 > 1e-9 || d2 > 1e-9 || d3 > 1e-9;
        if (!(hasNeg && hasPos)) return true;
    }
    return false;
}

let walls: ProbeWallStore;

beforeEach(() => {
    walls = new ProbeWallStore();
    seedSite(walls);
    // The resolver reads this global in production (`WallFaceResolver.ts:37`).
    // Setting it wires the probe to the production read path, not around it.
    Object.assign(window, { wallStore: walls });
});

afterEach(() => {
    Object.assign(window, { wallStore: undefined });
});

// ════════════════════════════════════════════════════════════════════════════
// §0 — THE FALSIFIER
// ════════════════════════════════════════════════════════════════════════════

describe('§0 — the mesh measurement DETECTS a slab with no hole', () => {
    it('the same slab with its inner loops removed reads 1600 and BURIES the building', () => {
        const traced = traceRegionSketchAtPoint(walls.asRegionWalls(), GARDEN_CLICK.x, GARDEN_CLICK.z)!;
        expect(traced.sketch.innerLoops).toBeDefined();

        // The pre-ADR-0329 record: the same outer ring, holes discarded.
        const holeless: SlabSketch = { outerLoop: traced.sketch.outerLoop };
        const { mesh } = SlabFragmentBuilder.createSlabMeshWithEdges(
            regionSlab('sb-holeless', holeless, traced.ring), {}, {},
        );

        expect(topCapArea(mesh)).toBeGreaterThan(PARCEL_DRAWN - CAP_TOL);
        expect(topCapArea(mesh)).toBeLessThan(PARCEL_DRAWN + CAP_TOL);
        expect(capCovers(mesh, BUILDING_CENTRE)).toBe(true);   // the building is buried
    });
});

// ════════════════════════════════════════════════════════════════════════════
// §1 — REACHABILITY: the hole reaches the SHIPPED MESH
// ════════════════════════════════════════════════════════════════════════════

describe('§1 — the annulus reaches the geometry the user sees', () => {
    it('the shipped builder draws 1200 m², not 1600, and does NOT cover the building', () => {
        const traced = traceRegionSketchAtPoint(walls.asRegionWalls(), GARDEN_CLICK.x, GARDEN_CLICK.z)!;
        const { mesh } = SlabFragmentBuilder.createSlabMeshWithEdges(
            regionSlab('sb-annulus', traced.sketch, traced.ring), {}, {},
        );
        const holeless = SlabFragmentBuilder.createSlabMeshWithEdges(
            regionSlab('sb-cmp', { outerLoop: traced.sketch.outerLoop }, traced.ring), {}, {},
        ).mesh;

        // ⭐ THE NUMBER THE FOUNDER ASKED FOR, taken off the triangles: the hole
        // removes EXACTLY the building's 400 m². Stated as a difference because the
        // outer ring is drawn outset (see OUTSET_M) and the difference is not.
        expect(topCapArea(holeless) - topCapArea(mesh)).toBeCloseTo(BUILDING_AREA, 3);
        expect(topCapArea(mesh)).toBeGreaterThan(PARCEL_DRAWN - BUILDING_AREA - CAP_TOL);
        expect(topCapArea(mesh)).toBeLessThan(PARCEL_DRAWN - BUILDING_AREA + CAP_TOL);
        // 1208.01 is the drawn answer to a modelled 1200. It is NOT 1608.01.
        expect(topCapArea(mesh)).toBeLessThan(PARCEL_DRAWN - 300);

        // ⭐ and the building is not buried.
        expect(capCovers(mesh, BUILDING_CENTRE)).toBe(false);
        // while the garden itself IS covered — otherwise "not covered" would pass
        // for a slab that failed to build at all.
        expect(capCovers(mesh, GARDEN_CLICK)).toBe(true);
    });

    it('NON-REGRESSION — a click inside the building still builds the ordinary room slab', () => {
        const traced = traceRegionSketchAtPoint(walls.asRegionWalls(), BUILDING_CENTRE.x, BUILDING_CENTRE.z)!;
        expect(traced.sketch.innerLoops).toBeUndefined();
        const { mesh } = SlabFragmentBuilder.createSlabMeshWithEdges(
            regionSlab('sb-room', traced.sketch, traced.ring), {}, {},
        );
        expect(topCapArea(mesh)).toBeGreaterThan(BUILDING_DRAWN - CAP_TOL);
        expect(topCapArea(mesh)).toBeLessThan(BUILDING_DRAWN + CAP_TOL);
        expect(capCovers(mesh, BUILDING_CENTRE)).toBe(true);
    });

    it('NON-REGRESSION — a static `data.holes` slab with no sketch is untouched', () => {
        // The HOLLOW_SLAB path. ADR-0329 D4's rule is a REPLACEMENT that only fires
        // when a sketch carries inner loops; with no sketch, `data.holes` must still
        // be the hole source exactly as before.
        const solid = {
            id: 'sb-static', type: 'slab', levelId: 'L0', thickness: 0.2,
            position: { x: 0, y: 0, z: 0 },
            polygon: PARCEL.map(p => ({ x: p.x, y: p.z })),
            holes: [BUILDING.map(p => ({ x: p.x, y: p.z }))],
            ifcData: { guid: 'guid-static', ifcClass: 'IfcSlab' },
        } as unknown as SlabData;
        const { mesh } = SlabFragmentBuilder.createSlabMeshWithEdges(solid, {}, {});
        expect(topCapArea(mesh)).toBeGreaterThan(PARCEL_DRAWN - BUILDING_AREA - CAP_TOL);
        expect(topCapArea(mesh)).toBeLessThan(PARCEL_DRAWN - BUILDING_AREA + CAP_TOL);
        expect(capCovers(mesh, BUILDING_CENTRE)).toBe(false);
    });
});

// ════════════════════════════════════════════════════════════════════════════
// §2 — THE FOLLOW: move a building wall, the hole moves
// ════════════════════════════════════════════════════════════════════════════

describe('§2 — the hole FOLLOWS when a building wall moves', () => {
    it('pushing the building`s west wall out grows the building and shrinks the garden', () => {
        const traced = traceRegionSketchAtPoint(walls.asRegionWalls(), GARDEN_CLICK.x, GARDEN_CLICK.z)!;
        const slabStore = new SlabStore();
        const tracker = new SlabDependencyTracker(
            slabStore, asTrackerWallStore(walls), { current: undefined },
        );
        slabStore.add(regionSlab('sb-follow', traced.sketch, traced.ring));
        tracker.bootstrap?.();

        const meshBefore = SlabFragmentBuilder.createSlabMeshWithEdges(
            slabStore.getById('sb-follow')!, {}, {},
        ).mesh;
        expect(topCapArea(meshBefore)).toBeLessThan(PARCEL_DRAWN - BUILDING_AREA + CAP_TOL);
        expect(topCapArea(meshBefore)).toBeGreaterThan(PARCEL_DRAWN - BUILDING_AREA - CAP_TOL);

        // THE ACT — the building's west wall (x=10) moves out to x=5. The building
        // becomes 25 x 20 = 500 m²; the garden becomes 1600 - 500 = 1100.
        // `bldg-3` is the segment (10,30)→(10,10) — the west side.
        walls.setBaseLine('bldg-3', [{ x: 5, z: 30 }, { x: 5, z: 10 }]);
        // Its two neighbours share the moved corner, so they move with it — this is
        // the same co-move a real wall-join produces, applied explicitly because the
        // probe wall store has no join resolver.
        walls.setBaseLine('bldg-2', [{ x: 30, z: 30 }, { x: 5, z: 30 }]);
        walls.setBaseLine('bldg-0', [{ x: 5, z: 10 }, { x: 30, z: 10 }]);

        const meshAfter = SlabFragmentBuilder.createSlabMeshWithEdges(
            slabStore.getById('sb-follow')!, {}, {},
        ).mesh;

        // The hole is now 25 x 20 = 500, so the drawn cap loses another 100 m².
        expect(topCapArea(meshAfter)).toBeGreaterThan(PARCEL_DRAWN - 500 - CAP_TOL);
        expect(topCapArea(meshAfter)).toBeLessThan(PARCEL_DRAWN - 500 + CAP_TOL);
        expect(topCapArea(meshBefore) - topCapArea(meshAfter)).toBeCloseTo(100, 3);
        // The strip the building just took is no longer garden.
        expect(capCovers(meshAfter, { x: 7, z: 20 })).toBe(false);
        // and the outer boundary did not move with it.
        expect(capCovers(meshAfter, { x: 2, z: 20 })).toBe(true);
    });

    it('the RECORD follows too — `holes` is written back, so it cannot claim 1600', () => {
        // §FIX-SLAB-POLYGON-WRITEBACK's property, extended to holes (ADR-0329 D5).
        // Without this the record over-reports the slab by the whole building
        // footprint to schedules, area take-off and IFC/DXF export.
        const traced = traceRegionSketchAtPoint(walls.asRegionWalls(), GARDEN_CLICK.x, GARDEN_CLICK.z)!;
        const slabStore = new SlabStore();
        const tracker = new SlabDependencyTracker(
            slabStore, asTrackerWallStore(walls), { current: undefined },
        );
        slabStore.add(regionSlab('sb-record', traced.sketch, traced.ring));
        tracker.bootstrap?.();

        walls.setBaseLine('bldg-3', [{ x: 5, z: 30 }, { x: 5, z: 10 }]);
        walls.setBaseLine('bldg-2', [{ x: 30, z: 30 }, { x: 5, z: 30 }]);
        walls.setBaseLine('bldg-0', [{ x: 5, z: 10 }, { x: 30, z: 10 }]);

        const rec = slabStore.getById('sb-record')!;
        expect(rec.holes).toBeDefined();
        expect(rec.holes).toHaveLength(1);
        const holeArea = Math.abs(
            rec.holes![0]!.reduce((a, p, i, r) => {
                const q = r[(i + 1) % r.length]!;
                return a + (p.x * q.y - q.x * p.y);
            }, 0) / 2,
        );
        expect(holeArea).toBeCloseTo(25 * 20, 3);   // the MOVED building, 500
    });
});

// ════════════════════════════════════════════════════════════════════════════
// §3 — UNDO RESTORES; IT DOES NOT RE-DERIVE  (L-943)
// ════════════════════════════════════════════════════════════════════════════

describe('§3 — undo RESTORES the hole (L-943)', () => {
    /**
     * L-943: a floor follow that RECONSTRUCTED on the reverse pass turned a
     * 75.171 m² boundary into 138.262 m². The ledger's rule is C71's — *undo
     * restores, it does not reconstruct*.
     *
     * THE ASSERTION SUBJECT IS THE STORED SKETCH, BYTE FOR BYTE, copying
     * `floorFollowUndoRestore.test.ts:209-211` — never a reported m². A reported
     * area is exactly what let L-943 read green while the record diverged.
     *
     * WHAT THIS PROVES: the annulus is structurally immune to L-943's mechanism,
     * because the forward pass never writes the authored value. `sketch` — which
     * holds every reference, outer AND inner — is not touched by
     * `reprojectStoredPolygon`, so there is no authored value for a reverse pass to
     * reconstruct differently.
     * WHAT IT DOES NOT PROVE: that a CommandManager-driven Ctrl+Z behaves this way.
     * This package cannot construct one. The arm that owns that is
     * `packages/command-registry/__tests__/floorFollowUndoRestore.test.ts`.
     */
    it('the stored SKETCH is byte-identical across move and un-move', () => {
        const traced = traceRegionSketchAtPoint(walls.asRegionWalls(), GARDEN_CLICK.x, GARDEN_CLICK.z)!;
        const slabStore = new SlabStore();
        const tracker = new SlabDependencyTracker(
            slabStore, asTrackerWallStore(walls), { current: undefined },
        );
        slabStore.add(regionSlab('sb-undo', traced.sketch, traced.ring));
        tracker.bootstrap?.();

        const snap = () => JSON.stringify(slabStore.getById('sb-undo')!.sketch);
        const sketchAtRest = snap();

        walls.setBaseLine('bldg-3', [{ x: 5, z: 30 }, { x: 5, z: 10 }]);
        walls.setBaseLine('bldg-2', [{ x: 30, z: 30 }, { x: 5, z: 30 }]);
        walls.setBaseLine('bldg-0', [{ x: 5, z: 10 }, { x: 30, z: 10 }]);

        // THE FORWARD PASS DOES NOT WRITE THE AUTHORED VALUE. This is the property.
        expect(snap()).toBe(sketchAtRest);

        // THE REVERSE PASS — the wall goes back exactly where it was.
        walls.setBaseLine('bldg-3', [{ x: 10, z: 30 }, { x: 10, z: 10 }]);
        walls.setBaseLine('bldg-2', [{ x: 30, z: 30 }, { x: 10, z: 30 }]);
        walls.setBaseLine('bldg-0', [{ x: 10, z: 10 }, { x: 30, z: 10 }]);

        expect(snap()).toBe(sketchAtRest);
    });

    it('the HOLE returns to exactly where it was — 1200, and no invented area', () => {
        const traced = traceRegionSketchAtPoint(walls.asRegionWalls(), GARDEN_CLICK.x, GARDEN_CLICK.z)!;
        const slabStore = new SlabStore();
        const tracker = new SlabDependencyTracker(
            slabStore, asTrackerWallStore(walls), { current: undefined },
        );
        slabStore.add(regionSlab('sb-undo2', traced.sketch, traced.ring));
        tracker.bootstrap?.();

        const capNow = () => SlabFragmentBuilder.createSlabMeshWithEdges(
            slabStore.getById('sb-undo2')!, {}, {},
        ).mesh;
        const holesNow = () => JSON.stringify(slabStore.getById('sb-undo2')!.holes ?? null);

        const areaAtRest = topCapArea(capNow());
        expect(areaAtRest).toBeGreaterThan(PARCEL_DRAWN - BUILDING_AREA - CAP_TOL);

        walls.setBaseLine('bldg-3', [{ x: 5, z: 30 }, { x: 5, z: 10 }]);
        walls.setBaseLine('bldg-2', [{ x: 30, z: 30 }, { x: 5, z: 30 }]);
        walls.setBaseLine('bldg-0', [{ x: 5, z: 10 }, { x: 30, z: 10 }]);
        const holesMoved = holesNow();
        const areaMoved = topCapArea(capNow());
        expect(areaAtRest - areaMoved).toBeCloseTo(100, 3);   // the building grew by 100

        walls.setBaseLine('bldg-3', [{ x: 10, z: 30 }, { x: 10, z: 10 }]);
        walls.setBaseLine('bldg-2', [{ x: 30, z: 30 }, { x: 10, z: 30 }]);
        walls.setBaseLine('bldg-0', [{ x: 10, z: 10 }, { x: 30, z: 10 }]);

        // ⭐ BYTE-EXACT, not merely close: the restored cap is the SAME number the
        // slab had at rest — not 1608 (the hole lost), not the moved value (the move
        // stuck), and not a third number (an invented area, L-943's actual
        // signature, which read 138.262 where 75.171 was owed).
        expect(topCapArea(capNow())).toBe(areaAtRest);
        expect(capCovers(capNow(), BUILDING_CENTRE)).toBe(false);
        expect(capCovers(capNow(), { x: 7, z: 20 })).toBe(true);   // garden again
        // and the record moved with it, in both directions.
        expect(holesNow()).not.toBe(holesMoved);
    });
});
