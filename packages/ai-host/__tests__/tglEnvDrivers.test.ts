// Environmental & Architectural Design Drivers — E.1 + E.2 tests.
//
// Contract: SPEC-ENVIRONMENTAL-DESIGN-DRIVERS.md §1 (priority hierarchy) + §2
// (solar room placement). Both must DEGRADE GRACEFULLY (neutral, never throw) when
// no site orientation is available, so existing layout behaviour is unchanged.

import { describe, expect, it } from 'vitest';
import {
    PRIORITY_BAND, AXIS_PRIORITY, HARD_GATES, priorityMultiplier,
    solarOrientationScore,
} from '../src/workflows/apartmentLayout/tgl/envDrivers.js';
import {
    computeObjectives, OBJECTIVE_AXES,
} from '../src/workflows/apartmentLayout/tgl/objectives.js';
import {
    buildSemanticGraph, type GraphNode, type LayoutGraph, type Primitive,
} from '../src/workflows/apartmentLayout/tgl/semanticGraph.js';
import { computeSpaceSyntax, type SyntaxMetrics } from '../src/workflows/apartmentLayout/tgl/spaceSyntax.js';
import { buildWallsAndDoors } from '../src/workflows/apartmentLayout/tgl/wallsAndDoors.js';
import { subdivide } from '../src/workflows/apartmentLayout/tgl/subdivide.js';
import { buildBubbleGraph, type BubbleGraph } from '../src/workflows/apartmentLayout/tgl/bubbleGraph.js';
import { decomposeToRects, type Pt } from '../src/workflows/apartmentLayout/tgl/rectDecomposition.js';
import type { ApartmentProgram } from '../src/workflows/apartmentLayout/types.js';

// Build a Space node at an explicit rect (world {x,z}); +z = South (sun side in N-hemi).
const roomAt = (
    guid: string, type: string, x0: number, z0: number, x1: number, z1: number,
): GraphNode => ({
    guid, kind: 'Space', sourceId: guid,
    attrs: { spaceType: type, netAreaM2: (x1 - x0) * (z1 - z0), needsWindow: true } as Record<string, Primitive>,
    geometry: { polygon: [{ x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 }] },
    psets: {},
});
const graphOf = (nodes: GraphNode[]): LayoutGraph =>
    ({ nodes, edges: [], meta: { shellAreaM2: 0, levelId: 'L', seed: 's' } });
const metricsOf = (perSpaceDepth: Record<string, number>): SyntaxMetrics =>
    ({ perSpaceDepth, meanDepth: 0, relativeAsymmetry: 0, integration: {}, n: Object.keys(perSpaceDepth).length, connected: true, entryGuid: null });
const emptyBubble: BubbleGraph = { rooms: [], edges: [], corridorId: null, entryId: null };

// ───────────────────────────── §ENV-E1-PRIORITY ──────────────────────────────
describe('§ENV-E1-PRIORITY (E.1) — priority-hierarchy weight model', () => {
    it('bands are strictly ordered Site-fixed > Env-perf > Technical > Form/reg (spec §1)', () => {
        expect(PRIORITY_BAND['site-fixed']).toBeGreaterThan(PRIORITY_BAND['env-performance']);
        expect(PRIORITY_BAND['env-performance']).toBeGreaterThan(PRIORITY_BAND['technical-systems']);
        expect(PRIORITY_BAND['technical-systems']).toBeGreaterThan(PRIORITY_BAND['form-regulation']);
    });

    it('priorityMultiplier returns the band for a driver axis and 1.0 for an unmapped axis', () => {
        // daylight is a site-fixed (orientation/solar) axis → top band.
        expect(priorityMultiplier('daylight')).toBe(PRIORITY_BAND['site-fixed']);
        // efficiency serves circulation/access → technical band.
        expect(priorityMultiplier('efficiency')).toBe(PRIORITY_BAND['technical-systems']);
        // regularity is a pure quality axis with no §1 driver → neutral 1.0.
        expect(priorityMultiplier('regularity')).toBe(1.0);
        expect(priorityMultiplier('shapeQuality')).toBe(1.0);
    });

    it('every mapped axis is a real ObjectiveVector axis (no typos)', () => {
        for (const axis of Object.keys(AXIS_PRIORITY)) {
            expect(OBJECTIVE_AXES).toContain(axis);
        }
    });

    it('the solarOrientation axis is mapped to the site-fixed (driver 1) band', () => {
        expect(AXIS_PRIORITY.solarOrientation).toBe('site-fixed');
        expect(priorityMultiplier('solarOrientation')).toBe(PRIORITY_BAND['site-fixed']);
    });

    it('documents structure (7) + regulation (10/12) as HARD gates, not weights', () => {
        const drivers = HARD_GATES.map(g => g.driver);
        expect(drivers).toContain(7);   // structure & spans
        expect(drivers).toContain(10);  // fire escape
        expect(drivers).toContain(12);  // form compactness
        for (const g of HARD_GATES) expect(g.gate.length).toBeGreaterThan(0);
    });
});

// ────────────────────────────── §ENV-E2-SOLAR ────────────────────────────────
describe('§ENV-E2-SOLAR (E.2) — solar room-placement bias', () => {
    // 12×10 plan. +z is South (equator side in the N-hemisphere). A "good" layout
    // (daytime rooms south, buffer rooms north) must outscore the inverted one.
    const goodLayout = graphOf([
        roomAt('LIV', 'living', 0, 5, 12, 10),    // living on the SOUTH (sun) half
        roomAt('BATH', 'bathroom', 0, 0, 12, 5),  // bathroom on the NORTH (cold) half
    ]);
    const badLayout = graphOf([
        roomAt('LIV', 'living', 0, 0, 12, 5),     // living on the NORTH (cold) half
        roomAt('BATH', 'bathroom', 0, 5, 12, 10), // bathroom on the SOUTH (sun) half
    ]);

    it('N-hemisphere: daytime-south + buffer-north beats the inversion', () => {
        const good = solarOrientationScore(goodLayout, 51.5);   // London latitude
        const bad = solarOrientationScore(badLayout, 51.5);
        expect(good).toBeGreaterThan(bad);
        expect(good).toBeGreaterThan(0.8);   // strongly compliant
        expect(bad).toBeLessThan(0.2);       // strongly non-compliant
    });

    it('S-hemisphere flips the preference (daytime rooms toward NORTH / equator)', () => {
        // At a southern latitude the equator is to the NORTH (−z), so the SAME
        // good-for-north layout should now score LOWER than the inverted one.
        const goodForNorth = solarOrientationScore(goodLayout, -33.9);  // Sydney
        const goodForSouth = solarOrientationScore(badLayout, -33.9);
        expect(goodForSouth).toBeGreaterThan(goodForNorth);
    });

    it('returns the score within [0, 1] always', () => {
        for (const lat of [51.5, -33.9, 23, -45, 60]) {
            const v = solarOrientationScore(goodLayout, lat);
            expect(v).toBeGreaterThanOrEqual(0);
            expect(v).toBeLessThanOrEqual(1);
        }
    });

    // ── GRACEFUL DEGRADATION — neutral 1.0, never throws ──────────────────────
    it('no latitude → neutral 1.0 (graceful degradation)', () => {
        expect(solarOrientationScore(goodLayout, undefined)).toBe(1);
        expect(solarOrientationScore(badLayout, undefined)).toBe(1);
    });

    it('near-equatorial latitude (no sun-side preference) → neutral 1.0', () => {
        // |lat| < 10° → equatorFacingDir returns null → neutral.
        expect(solarOrientationScore(goodLayout, 5)).toBe(1);
        expect(solarOrientationScore(goodLayout, -3)).toBe(1);
    });

    it('non-finite latitude → neutral 1.0 (never throws)', () => {
        expect(solarOrientationScore(goodLayout, NaN)).toBe(1);
        expect(solarOrientationScore(goodLayout, Infinity)).toBe(1);
    });

    it('no daytime/buffer rooms to bias → neutral 1.0', () => {
        const onlyCorridors = graphOf([
            roomAt('C', 'corridor', 0, 0, 4, 4),
            roomAt('H', 'hall', 4, 0, 8, 4),
        ]);
        expect(solarOrientationScore(onlyCorridors, 51.5)).toBe(1);
    });

    it('empty graph → neutral 1.0 (no throw)', () => {
        expect(solarOrientationScore(graphOf([]), 51.5)).toBe(1);
    });

    // ── INTEGRATION through computeObjectives ─────────────────────────────────
    it('surfaces on computeObjectives.solarOrientation when latDeg supplied', () => {
        const v = computeObjectives(goodLayout, metricsOf({ LIV: 1, BATH: 0 }), emptyBubble, 1, 1, 51.5);
        const w = computeObjectives(badLayout, metricsOf({ LIV: 0, BATH: 1 }), emptyBubble, 1, 1, 51.5);
        expect(v.solarOrientation).toBeGreaterThan(w.solarOrientation);
    });

    it('computeObjectives without latDeg → solarOrientation is neutral 1.0 (no regression)', () => {
        const v = computeObjectives(goodLayout, metricsOf({ LIV: 1, BATH: 0 }), emptyBubble);
        const w = computeObjectives(badLayout, metricsOf({ LIV: 0, BATH: 1 }), emptyBubble);
        // Both neutral → axis cannot reorder existing candidates.
        expect(v.solarOrientation).toBe(1);
        expect(w.solarOrientation).toBe(1);
    });

    it('solarOrientation is part of OBJECTIVE_AXES (Pareto + weighted sums see it)', () => {
        expect(OBJECTIVE_AXES).toContain('solarOrientation');
    });

    // ── Real pipeline graph: every axis stays in band, solar is finite ────────
    it('on the real D-TGL pipeline graph the axis is a finite [0,1] value', () => {
        const program: ApartmentProgram = {
            bedrooms: 2, bathrooms: 1, masterEnSuite: true,
            openPlanKitchenDining: true, livingRoom: true, entranceHall: true,
        };
        const poly: Pt[] = [{ x: 0, z: 0 }, { x: 12, z: 0 }, { x: 12, z: 10 }, { x: 0, z: 10 }];
        const bubble = buildBubbleGraph(program, 120);
        const placements = subdivide(decomposeToRects(poly), bubble);
        const { segments, openings } = buildWallsAndDoors(placements, bubble);
        const lg = buildSemanticGraph(placements, segments, openings, bubble, { levelId: 'L1', seed: 'seed', shellAreaM2: 120 });
        const entry = lg.nodes.find(n => n.kind === 'Space' && n.sourceId === bubble.entryId)!.guid;
        const v = computeObjectives(lg, computeSpaceSyntax(lg, entry), bubble, 1, 1, 51.5);
        expect(Number.isFinite(v.solarOrientation)).toBe(true);
        expect(v.solarOrientation).toBeGreaterThanOrEqual(0);
        expect(v.solarOrientation).toBeLessThanOrEqual(1);
    });
});
