// TGL P9 — geometry emission tests.
// Contract (SPEC §7): every Space/Wall/Door in the graph appears in the
// LayoutOption; mm conversion exact (×1000); door GUID is index-aligned (C15).

import { describe, expect, it } from 'vitest';
import { emitGeometry } from '../src/workflows/apartmentLayout/tgl/emitGeometry.js';
import { enumerateLayouts } from '../src/workflows/apartmentLayout/tgl/enumerate.js';
import { buildSemanticGraph, type GraphNode, type LayoutGraph } from '../src/workflows/apartmentLayout/tgl/semanticGraph.js';
import { buildWallsAndDoors } from '../src/workflows/apartmentLayout/tgl/wallsAndDoors.js';
import { subdivide } from '../src/workflows/apartmentLayout/tgl/subdivide.js';
import { buildBubbleGraph } from '../src/workflows/apartmentLayout/tgl/bubbleGraph.js';
import { decomposeToRects, type Pt } from '../src/workflows/apartmentLayout/tgl/rectDecomposition.js';
import { buildLayoutCommands } from '../src/workflows/apartmentLayout/executePlan.js';
import type { ApartmentProgram, ScoringWeights } from '../src/workflows/apartmentLayout/types.js';

const PROGRAM: ApartmentProgram = {
    bedrooms: 2, bathrooms: 1, masterEnSuite: true,
    openPlanKitchenDining: true, livingRoom: true, entranceHall: true,
};
const WEIGHTS: ScoringWeights = { naturalLight: 1, privacy: 1, kitchenWorkflow: 1, corridorEfficiency: 1 };
const RECT: Pt[] = [{ x: 0, z: 0 }, { x: 12, z: 0 }, { x: 12, z: 10 }, { x: 0, z: 10 }];

function fixtureGraph() {
    const bubble = buildBubbleGraph(PROGRAM, 120);
    const placements = subdivide(decomposeToRects(RECT), bubble);
    const { segments, openings } = buildWallsAndDoors(placements, bubble);
    return buildSemanticGraph(placements, segments, openings, bubble, { levelId: 'L1', seed: 'seed', shellAreaM2: 120 });
}

describe('emitGeometry (TGL P9)', () => {
    it('emits every Space, Wall and Door from the graph', () => {
        const g = fixtureGraph();
        const { option, wallGuids, doorGuids, spaceGuids } = emitGeometry(g);
        expect(option.rooms.length).toBe(g.nodes.filter(n => n.kind === 'Space').length);
        expect(option.walls.length).toBe(g.nodes.filter(n => n.kind === 'Wall').length);
        expect(option.doors.length).toBe(g.nodes.filter(n => n.kind === 'Door').length);
        expect(spaceGuids.length).toBe(option.rooms.length);
        expect(wallGuids.length).toBe(option.walls.length);
        expect(doorGuids.length).toBe(option.doors.length);
    });

    it('names every room + door, carries room centroids, and flags perimeter walls', () => {
        const g = fixtureGraph();
        const { option } = emitGeometry(g);
        // rooms: semantic names + centroids + use-occupancy
        for (const r of option.rooms) {
            expect(r.name.length).toBeGreaterThan(0);
            expect(r.centroid).toBeDefined();
            expect(r.occupancy).toBeTruthy();
            expect(r.occupancy).not.toBe('unclassified');
        }
        expect(option.rooms.some(r => /living/i.test(r.name))).toBe(true);
        expect(option.rooms.some(r => /bedroom|master/i.test(r.name))).toBe(true);
        // occupancy mapped to editor RoomOccupancyType strings
        expect(option.rooms.some(r => r.occupancy === 'living-room')).toBe(true);
        expect(option.rooms.some(r => r.occupancy === 'bedroom')).toBe(true);
        // doors: named by the rooms they connect
        for (const d of option.doors) expect(d.name && d.name.length).toBeGreaterThan(0);
        // walls: both perimeter (isExternal) and interior present
        expect(option.walls.some(w => w.isExternal === true)).toBe(true);
        expect(option.walls.some(w => !w.isExternal)).toBe(true);
    });

    it('every room carries its polygon (mm) so D-FLE can sub-zone open-plan layouts', () => {
        const g = fixtureGraph();
        const { option } = emitGeometry(g);
        const spaceNodes = g.nodes.filter(n => n.kind === 'Space');
        expect(option.rooms.length).toBe(spaceNodes.length);
        for (let i = 0; i < option.rooms.length; i++) {
            const r = option.rooms[i]!;
            const n = spaceNodes[i]!;
            const polyM = n.geometry?.polygon ?? [];
            expect(r.polygon, `${r.name} polygon`).toBeDefined();
            expect(r.polygon!.length).toBe(polyM.length);
            // mm = round(m * 1000 * 1e6) / 1e6 — assert vertices match in mm.
            for (let j = 0; j < polyM.length; j++) {
                expect(r.polygon![j]!.x).toBeCloseTo(polyM[j]!.x * 1000, 6);
                expect(r.polygon![j]!.y).toBeCloseTo(polyM[j]!.z * 1000, 6);
            }
        }
    });

    it('converts metres → millimetres exactly (×1000)', () => {
        const g = fixtureGraph();
        const wallNodes = g.nodes.filter(n => n.kind === 'Wall');
        const { option } = emitGeometry(g);
        option.walls.forEach((w, i) => {
            const bl = wallNodes[i]!.geometry!.baseLine!;
            expect(w.start.x).toBeCloseTo(bl[0].x * 1000, 6);
            expect(w.start.y).toBeCloseTo(bl[0].z * 1000, 6);    // plan-y = world-z
            expect(w.end.x).toBeCloseTo(bl[1].x * 1000, 6);
            expect(w.end.y).toBeCloseTo(bl[1].z * 1000, 6);
        });
    });

    it('door GUIDs are index-aligned and each resolves a valid host wall (C15)', () => {
        const g = fixtureGraph();
        const { option, doorGuids } = emitGeometry(g);
        const doorNodeGuids = g.nodes.filter(n => n.kind === 'Door').map(n => n.guid);
        expect(doorGuids).toEqual(doorNodeGuids);
        for (const d of option.doors) {
            expect(d.wallRef).toBeGreaterThanOrEqual(0);
            expect(d.wallRef).toBeLessThan(option.walls.length);
            expect(d.width).toBeGreaterThan(0);
        }
    });

    it('feeds the existing buildLayoutCommands without dropping walls/doors', () => {
        const g = fixtureGraph();
        const { option } = emitGeometry(g);
        let n = 0;
        const mint = (p: string) => `${p}-${n++}`;
        const set = buildLayoutCommands(option, { levelId: 'L1' }, mint);
        // §COLLINEAR-MERGE folds collinear adjacent segments into passthrough
        // walls — wallIds.length ≤ option.walls.length, but every option wall
        // is REPRESENTED (no segment dropped for being too short). The merge
        // emits an informational warning; no `dropped` warning is allowed.
        expect(set.wallIds.length).toBeGreaterThan(0);
        expect(set.wallIds.length).toBeLessThanOrEqual(option.walls.length);
        expect(set.doorIds.length).toBe(option.doors.length);     // no door dropped (all fit)
        expect(set.warnings.filter(w => w.includes('dropped'))).toEqual([]);
    });

    // T1.W-B (quality wishlist #1) — engine-emitted windows on habitable-room
    // exterior walls. The fixture is a 12×10 m two-bedroom shell, so several
    // habitable rooms front the perimeter and must receive a window.
    describe('window emission (T1.W-B)', () => {
        const HABITABLE = new Set(['living', 'kitchen', 'dining', 'master', 'bedroom', 'study']);
        const INTERIOR_ONLY = new Set(['corridor', 'hall', 'utility']);

        it('a habitable room with an exterior wall gets ≥1 window', () => {
            const g = fixtureGraph();
            const { option } = emitGeometry(g);
            expect(option.windows).toBeDefined();
            expect(option.windows!.length).toBeGreaterThan(0);
            // every emitted window belongs to a windowable (habitable or wet) room
            for (const w of option.windows!) {
                expect(w.roomType).toBeDefined();
                expect(INTERIOR_ONLY.has(w.roomType as string)).toBe(false);
            }
            // at least one HABITABLE (non-wet) room got a window
            expect(option.windows!.some(w => HABITABLE.has(w.roomType as string))).toBe(true);
        });

        it('windows host on EXTERNAL walls only — never an interior/party wall', () => {
            const g = fixtureGraph();
            const { option } = emitGeometry(g);
            for (const w of option.windows ?? []) {
                const host = option.walls[w.wallRef];
                expect(host, `window host wall ${w.wallRef} exists`).toBeDefined();
                expect(host!.isExternal, `window on wall ${w.wallRef} is external`).toBe(true);
            }
        });

        it('no emitted window overlaps a door on the SAME wall', () => {
            const g = fixtureGraph();
            const { option } = emitGeometry(g);
            for (const w of option.windows ?? []) {
                const wLo = w.offset, wHi = w.offset + w.width;
                for (const d of option.doors) {
                    if (d.wallRef !== w.wallRef) continue;
                    const dLo = d.offset, dHi = d.offset + d.width;
                    const overlap = wLo < dHi && wHi > dLo;
                    expect(overlap, `window [${wLo},${wHi}] vs door [${dLo},${dHi}] on wall ${w.wallRef}`).toBe(false);
                }
            }
        });

        it('every emitted window fits inside its host wall', () => {
            const g = fixtureGraph();
            const { option } = emitGeometry(g);
            for (const w of option.windows ?? []) {
                const host = option.walls[w.wallRef]!;
                const lenMm = Math.hypot(host.end.x - host.start.x, host.end.y - host.start.y);
                expect(w.offset).toBeGreaterThanOrEqual(0);
                expect(w.offset + w.width).toBeLessThanOrEqual(lenMm + 1e-3);
            }
        });

        it('windows dispatch to wall.createOpening (type window) + window.batch.create', () => {
            const g = fixtureGraph();
            const { option } = emitGeometry(g);
            let n = 0;
            const mint = (p: string) => `${p}-${n++}`;
            // Provide shell walls so the engine's EXTERNAL-hosted windows resolve
            // to existing shell ids (the production path). Build shellWalls from
            // the option's external walls (plan-mm → world-m via the default map).
            const shellWalls = option.walls
                .map((w, i) => ({ w, i }))
                .filter(x => x.w.isExternal === true)
                .map(x => ({
                    id: `shell-${x.i}`,
                    start: { x: x.w.start.x / 1000, z: x.w.start.y / 1000 },
                    end:   { x: x.w.end.x / 1000,   z: x.w.end.y / 1000 },
                }));
            const set = buildLayoutCommands(option, { levelId: 'L1', shellWalls }, mint);
            const shellOps = set.shellWindowOpeningCommands;
            const normalOps = set.windowOpeningCommands;
            expect(shellOps.length + normalOps.length).toBeGreaterThan(0);
            const total = (set.shellWindowBatch?.payload as { windows: unknown[] } | undefined)?.windows.length ?? 0;
            const totalNormal = (set.windowBatch?.payload as { windows: unknown[] } | undefined)?.windows.length ?? 0;
            expect(total + totalNormal).toBeGreaterThan(0);
            for (const op of [...shellOps, ...normalOps]) {
                const p = op.payload as { opening: { type: string } };
                expect(p.opening.type).toBe('window');
            }
        });

        // §A.21.D55 — DAYLIGHT IN EVERY ROOM. A WET room (bathroom / ensuite / wc)
        // that fronts an external wall must ALSO get a window — previously the
        // emission gated on `needsWindow === true`, which is FALSE for wet rooms, so
        // a bathroom with external frontage emitted ZERO windows. The wet-room window
        // uses the privacy spec (raised 1400 mm sill) from WINDOW_SPECS.
        it('a WET room (bathroom) with an exterior wall gets a window (raised sill)', () => {
            // Minimal graph: one external wall (long enough for the 600 mm wet window)
            // BOUNDS a bathroom space. spaceType=bathroom, needsWindow=false (the gate
            // that previously suppressed it).
            const wall: GraphNode = {
                guid: 'EW', kind: 'Wall', sourceId: 'ew',
                attrs: { isExternal: true, thickness: 0.1 },
                geometry: { baseLine: [{ x: 0, z: 0 }, { x: 4, z: 0 }] },
                psets: {},
            };
            const bath: GraphNode = {
                guid: 'BATH', kind: 'Space', sourceId: 'bath',
                attrs: { name: 'Bathroom', spaceType: 'bathroom', netAreaM2: 6, isPrivate: true, needsWindow: false },
                geometry: { polygon: [{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 2 }, { x: 0, z: 2 }] },
                psets: {},
            };
            const g: LayoutGraph = {
                nodes: [wall, bath],
                edges: [{ kind: 'BOUNDS', from: 'EW', to: 'BATH' }],
                meta: { shellAreaM2: 8, levelId: 'L1', seed: 'seed' },
            };
            const { option } = emitGeometry(g);
            const bathWindows = (option.windows ?? []).filter(w => w.roomType === 'bathroom');
            expect(bathWindows.length).toBeGreaterThan(0);
            // Wet-room privacy: raised sill (1400 mm per WINDOW_SPECS.bathroom, §68.16).
            expect(bathWindows[0]!.sillHeight).toBe(1400);
        });

        it('an INTERIOR-only room type (corridor) never gets a window even with frontage', () => {
            const wall: GraphNode = {
                guid: 'EW', kind: 'Wall', sourceId: 'ew',
                attrs: { isExternal: true, thickness: 0.1 },
                geometry: { baseLine: [{ x: 0, z: 0 }, { x: 6, z: 0 }] },
                psets: {},
            };
            const cor: GraphNode = {
                guid: 'COR', kind: 'Space', sourceId: 'cor',
                attrs: { name: 'Corridor', spaceType: 'corridor', netAreaM2: 6, isPrivate: false, needsWindow: false },
                geometry: { polygon: [{ x: 0, z: 0 }, { x: 6, z: 0 }, { x: 6, z: 1.2 }, { x: 0, z: 1.2 }] },
                psets: {},
            };
            const g: LayoutGraph = {
                nodes: [wall, cor],
                edges: [{ kind: 'BOUNDS', from: 'EW', to: 'COR' }],
                meta: { shellAreaM2: 8, levelId: 'L1', seed: 'seed' },
            };
            const { option } = emitGeometry(g);
            expect((option.windows ?? []).length).toBe(0);
        });
    });

    it('round-trips from the P8 enumerator and is deterministic', () => {
        const out = enumerateLayouts({ shellPolygon: RECT, program: PROGRAM, levelId: 'L1', seed: 'seed', weights: WEIGHTS, count: 1 });
        const a = emitGeometry(out[0]!.graph);
        const b = emitGeometry(out[0]!.graph);
        expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
        expect(a.option.rooms.length).toBeGreaterThan(0);
        expect(a.option.walls.length).toBeGreaterThan(0);
    });
});
