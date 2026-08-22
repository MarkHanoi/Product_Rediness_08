// §HONEST-PICKER (L-4200 … L-4207, 2026-08-22) — the founder's Room 03-002 report.
//
// He asked, in the AI assistant, for "an apartment with 2 bedrooms and 2 en-suite
// bathrooms and open kitchen and dinning in Room 03-002" and was shown two cards
// reading "Procedural A / Procedural B — 7 rooms (offlin…", every room exactly
// 10.2 m², "7 rooms · 6 doors · 71.5 m²", 90/100, and "4 errors" behind a collapsed
// chip — against a room that is 81.2 m² and NOT a rectangle (three orthogonal sides
// and a faceted-arc east edge).
//
// These tests pin the measured facts and the fixes:
//   L-4200  the D-TGL engine's DECLINE REASON now escapes the engine
//   L-4201  the strip slicer's bands come from `ROOM_RULES`, not `span / n`
//   L-4202  `enSuiteCount` is honoured (it was silently dropped)
//   L-4203  every option states what it approximated, with BOTH numbers
//
// The shell is built the way the live path builds it: `analyseRoomRing`, the exact
// entry `shellReader.ts` takes when `payload.shellRingWorld` is set — so what is
// measured here is what the room-scoped generate feeds the engine.

import { describe, expect, it } from 'vitest';
import { analyseRoomRing } from '../src/workflows/apartmentLayout/shellReader.js';
import { polygonAreaM2, classifyPerimeter } from '../src/workflows/apartmentLayout/shellAnalysis.js';
import {
    generateProceduralLayoutHonest,
    allocateBandWidths,
    largestInscribedAxisRect,
} from '../src/workflows/apartmentLayout/proceduralLayout.js';
import { generateDeterministicLayouts } from '../src/workflows/apartmentLayout/tgl/runDeterministicLayout.js';
import { generateLayoutOptions } from '../src/workflows/apartmentLayout/generate.js';
import type {
    ApartmentProgram, ApartmentConstraints, ScoringWeights, LayoutDeclineDiagnosis, RoomType,
} from '../src/workflows/apartmentLayout/types.js';

const CONSTRAINTS: ApartmentConstraints = {
    minCorridorWidth: 900, wallThickness: 100, floorToCeiling: 2700, wallTypeId: 'partition',
};
const WEIGHTS: ScoringWeights = {
    naturalLight: 1, privacy: 1, kitchenWorkflow: 1, corridorEfficiency: 1,
};
/** The founder's exact ask: 2 bedrooms, 2 en-suites, open kitchen + dining. */
const FOUNDER_PROGRAM: ApartmentProgram = {
    bedrooms: 2, bathrooms: 1, masterEnSuite: true, enSuiteCount: 2,
    openPlanKitchenDining: true, livingRoom: true, entranceHall: true,
};

/**
 * Room 03-002's shape class: three orthogonal sides and an east edge that is a
 * FACETED ARC (a segmented curve bulging outward — the room-boundary polygon
 * carries the arc as tessellated chords, ~16 per fillet, per the `roomScopePayload`
 * header). ~80.6 m² inside a 9.6 × 8.94 m box.
 */
function arcRoomRing(W = 8.0, D = 8.94, bulge = 1.6, facets = 16): Array<{ x: number; z: number }> {
    const pts: Array<{ x: number; z: number }> = [{ x: 0, z: 0 }, { x: W, z: 0 }];
    for (let i = 1; i < facets; i++) {
        const t = i / facets;
        pts.push({ x: W + bulge * Math.sin(Math.PI * t), z: t * D });
    }
    pts.push({ x: W, z: D }, { x: 0, z: D });
    return pts;
}

describe('§HONEST-PICKER L-4200 — the D-TGL decline reason escapes the engine', () => {
    it('names WHY the engine produced nothing, instead of an undifferentiated empty array', () => {
        const shell = analyseRoomRing(arcRoomRing(), [], []);
        let decline: LayoutDeclineDiagnosis | undefined;
        const out = generateDeterministicLayouts(
            shell, FOUNDER_PROGRAM, CONSTRAINTS, WEIGHTS, 3,
            undefined, undefined, undefined, undefined, undefined, undefined,
            undefined, undefined, undefined, undefined, undefined, undefined, undefined,
            d => { decline = d; },
        );
        // MEASURED, not assumed: the engine really does decline this programme here.
        expect(out.length).toBe(0);
        expect(decline).toBeDefined();
        expect(decline!.kind).toBe('program-does-not-fit');
        // BOTH numbers per room (C73 §4.4) — "too small" is an adjective, not a fact.
        expect((decline!.underMinAreaRooms ?? []).length).toBeGreaterThan(0);
        for (const r of decline!.underMinAreaRooms ?? []) {
            expect(r.areaM2).toBeLessThan(r.minAreaM2);
            expect(r.minAreaM2).toBeGreaterThan(0);
        }
        expect(decline!.shellAreaM2).toBeGreaterThan(70);
    });

    it('carries the reason onto the shipped options (the OK arm), not only the reject arm', async () => {
        const shell = analyseRoomRing(arcRoomRing(), [], []);
        const offlineRelay = { complete: async () => { throw new Error('offline'); } } as never;
        const warn = console.warn; console.warn = (): void => {};
        const res = await generateLayoutOptions(
            { shell, program: FOUNDER_PROGRAM, constraints: CONSTRAINTS, weights: WEIGHTS, count: 3, lockBedroomCount: true },
            offlineRelay, { proceduralFallback: true, maxRetries: 1 },
        );
        console.warn = warn;
        expect(res.status).toBe('ok');                    // the user still gets options…
        expect(res.declineDiagnosis).toBeDefined();       // …and is TOLD the engine refused.
        expect(res.options.length).toBeGreaterThan(0);
        for (const o of res.options) {
            const codes = (o.limitations ?? []).map(l => l.code);
            expect(codes).toContain('engine-fallback');
        }
        // The reason must reach the RESULT-level reason string too, so a chat caller
        // can put the real sentence on the transcript.
        expect(res.reason).toMatch(/D-TGL declined:/);
    });
});

describe('§HONEST-PICKER L-4201 — band widths come from the program-rules database', () => {
    it('does NOT give every room the same area (the founder saw seven rooms at 10.2 m² each)', () => {
        const shell = analyseRoomRing(arcRoomRing(), [], []);
        const { options } = generateProceduralLayoutHonest(shell, FOUNDER_PROGRAM, CONSTRAINTS, WEIGHTS, 2);
        expect(options.length).toBeGreaterThan(0);
        const areas = options[0]!.rooms.map(r => Math.round(r.area * 10) / 10);
        expect(new Set(areas).size).toBeGreaterThan(1);
        // A living room is bigger than a bathroom in any real apartment.
        const living = options[0]!.rooms.find(r => r.type === 'living')!;
        const bath = options[0]!.rooms.find(r => r.type === 'bathroom')!;
        expect(living.area).toBeGreaterThan(bath.area);
    });

    it('reserves each room its ROOM_RULES minimum first, then splits the surplus by weight', () => {
        const types: RoomType[] = ['living', 'kitchen', 'bedroom', 'bathroom'];
        // 20 m of span at 5 m deep = 100 m² — comfortably above every minimum.
        const { widths, shortfalls } = allocateBandWidths(types, 20, 5);
        expect(shortfalls).toEqual([]);
        expect(widths.reduce((a, b) => a + b, 0)).toBeCloseTo(20, 6);
        // living (areaWeight 1.7) claims more span than bathroom.
        expect(widths[0]!).toBeGreaterThan(widths[3]!);
    });

    it('REPORTS the shortfall rather than silently shrinking a room, when the minima do not fit', () => {
        const types: RoomType[] = ['living', 'kitchen', 'bedroom', 'bathroom'];
        // 6 m × 2 m = 12 m² total — no allocation can satisfy these four minima.
        const { widths, shortfalls } = allocateBandWidths(types, 6, 2);
        expect(widths.reduce((a, b) => a + b, 0)).toBeCloseTo(6, 6);
        expect(shortfalls.length).toBeGreaterThan(0);
        for (const sf of shortfalls) expect(sf.areaM2).toBeLessThan(sf.minAreaM2);
    });
});

describe('§HONEST-PICKER L-4202 — enSuiteCount is honoured', () => {
    it('mints one en-suite per requested count, each immediately after its host bedroom', () => {
        const shell = analyseRoomRing(arcRoomRing(), [], []);
        const { options } = generateProceduralLayoutHonest(shell, FOUNDER_PROGRAM, CONSTRAINTS, WEIGHTS, 1);
        const types = options[0]!.rooms.map(r => r.type);
        expect(types.filter(t => t === 'ensuite').length).toBe(2);
        // Each en-suite directly follows a sleeping room, so the chain's door lands
        // between the two (§ENSUITE-1TO1).
        types.forEach((t, i) => {
            if (t !== 'ensuite') return;
            expect(['master', 'bedroom']).toContain(types[i - 1]);
        });
    });

    it('clamps en-suites to the bedroom count — more en-suites than bedrooms is not expressible', () => {
        const shell = analyseRoomRing(arcRoomRing(), [], []);
        const { options } = generateProceduralLayoutHonest(
            shell, { ...FOUNDER_PROGRAM, bedrooms: 1, enSuiteCount: 4 }, CONSTRAINTS, WEIGHTS, 1,
        );
        expect(options[0]!.rooms.filter(r => r.type === 'ensuite').length).toBe(1);
    });
});

describe('§HONEST-PICKER L-4203 — every option states what it approximated', () => {
    it('names the uncovered area in m² AND as a percentage, not just "non-rectangular"', () => {
        const ring = arcRoomRing();
        const shell = analyseRoomRing(ring, [], []);
        const polyArea = polygonAreaM2(ring);
        const rect = largestInscribedAxisRect(ring)!;
        const { options } = generateProceduralLayoutHonest(shell, FOUNDER_PROGRAM, CONSTRAINTS, WEIGHTS, 2);

        // The measured premise: this room really is not a rectangle, and the
        // inscribed rectangle really is materially smaller than the room.
        expect(classifyPerimeter(ring).class).not.toBe('CONVEX-RECT');
        const uncovered = polyArea - rect.w * rect.d;
        expect(uncovered).toBeGreaterThan(5);

        for (const o of options) {
            const shape = (o.limitations ?? []).find(l => l.code === 'shape-approximated');
            expect(shape).toBeDefined();
            expect(shape!.text).toContain(`${uncovered.toFixed(1)} m²`);
            expect(shape!.text).toContain(polyArea.toFixed(1));
            expect(shape!.text).toMatch(/is NOT covered/);
        }
    });

    it('says nothing on a genuinely rectangular shell — no invented caveat', () => {
        const rectRing = [{ x: 0, z: 0 }, { x: 12, z: 0 }, { x: 12, z: 9 }, { x: 0, z: 9 }];
        const shell = analyseRoomRing(rectRing, [], []);
        const { options } = generateProceduralLayoutHonest(shell, FOUNDER_PROGRAM, CONSTRAINTS, WEIGHTS, 1);
        const codes = (options[0]!.limitations ?? []).map(l => l.code);
        expect(codes).not.toContain('shape-approximated');
    });

    it('flags private rooms that a single line of rooms can only reach through another room', () => {
        const shell = analyseRoomRing(arcRoomRing(), [], []);
        const { options } = generateProceduralLayoutHonest(shell, FOUNDER_PROGRAM, CONSTRAINTS, WEIGHTS, 1);
        const passage = (options[0]!.limitations ?? []).find(l => l.code === 'private-room-is-passage');
        expect(passage).toBeDefined();
        expect(passage!.severity).toBe('error');
    });
});

describe('§HONEST-PICKER — the engine RECEIVES the polygon (refuting "it only ever sees a bbox")', () => {
    it('analyseRoomRing keeps every arc chord and reports the TRUE shoelace area', () => {
        const ring = arcRoomRing();
        const shell = analyseRoomRing(ring, [], []);
        // One synthetic ring wall per polygon edge — the curve is not flattened away.
        expect(shell.faces.length).toBe(ring.length);
        expect(shell.perimeter.length).toBe(ring.length);
        // netAreaM2 is the POLYGON area, not width × depth.
        expect(shell.netAreaM2).toBeCloseTo(polygonAreaM2(ring), 3);
        expect(shell.netAreaM2).toBeLessThan(shell.widthM * shell.depthM);
    });
});
