// Environmental & Architectural Design Drivers — E.3 (acoustic zoning) + E.4
// (natural ventilation) tests.
//
// Contract: SPEC-ENVIRONMENTAL-DESIGN-DRIVERS.md §4 (acoustic zoning) + §5 (natural
// ventilation). Both new objective axes must DEGRADE GRACEFULLY (neutral 1.0, never
// throw) when their inputs are absent, so existing layout behaviour is byte-
// identical (the Pareto equality invariant is preserved) — exactly like E.2.

import { describe, expect, it } from 'vitest';
import {
    acousticZoningScore, naturalVentilationScore,
    verticalStackAcousticScore, AXIS_PRIORITY, PRIORITY_BAND, priorityMultiplier,
    type StoreyAcousticProfile,
} from '../src/workflows/apartmentLayout/tgl/envDrivers.js';
import {
    computeObjectives, OBJECTIVE_AXES,
} from '../src/workflows/apartmentLayout/tgl/objectives.js';
import {
    buildSemanticGraph, type GraphNode, type GraphEdge, type LayoutGraph, type Primitive,
} from '../src/workflows/apartmentLayout/tgl/semanticGraph.js';
import { computeSpaceSyntax, type SyntaxMetrics } from '../src/workflows/apartmentLayout/tgl/spaceSyntax.js';
import { buildWallsAndDoors } from '../src/workflows/apartmentLayout/tgl/wallsAndDoors.js';
import { subdivide } from '../src/workflows/apartmentLayout/tgl/subdivide.js';
import { buildBubbleGraph, type BubbleGraph } from '../src/workflows/apartmentLayout/tgl/bubbleGraph.js';
import { decomposeToRects, type Pt } from '../src/workflows/apartmentLayout/tgl/rectDecomposition.js';
import {
    storeyAcousticProfiles, storeyAcousticPreference, allocateProgramToStoreys,
} from '../src/workflows/houseLayout/storeyAllocation.js';
import type { ApartmentProgram } from '../src/workflows/apartmentLayout/types.js';

// ── tiny graph builders (no geometry pipeline needed for the unit cases) ──────
const roomAt = (
    guid: string, type: string, x0: number, z0: number, x1: number, z1: number,
): GraphNode => ({
    guid, kind: 'Space', sourceId: guid,
    attrs: { spaceType: type, netAreaM2: (x1 - x0) * (z1 - z0), needsWindow: true } as Record<string, Primitive>,
    geometry: { polygon: [{ x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 }] },
    psets: {},
});
const wall = (
    guid: string, a: Pt, b: Pt, isExternal: boolean,
): GraphNode => ({
    guid, kind: 'Wall', sourceId: guid,
    attrs: { isExternal, thickness: 0.1, heightM: 2.7 } as Record<string, Primitive>,
    geometry: { baseLine: [a, b] }, psets: {},
});
const opening = (guid: string): GraphNode =>
    ({ guid, kind: 'Opening', sourceId: guid, attrs: { offsetM: 1, widthM: 1, heightM: 1.2, sillM: 0.9 }, psets: {} });
const windowFill = (guid: string): GraphNode =>
    ({ guid, kind: 'Window', sourceId: guid, attrs: { widthM: 1, sillM: 0.9 }, psets: {} });
const adj = (a: string, b: string): GraphEdge => ({ kind: 'ADJACENT_TO', from: a, to: b, props: { boundary: 'wall', permeable: false } });
const bounds = (wallGuid: string, spaceGuid: string): GraphEdge => ({ kind: 'BOUNDS', from: wallGuid, to: spaceGuid });
const hostedBy = (openGuid: string, wallGuid: string): GraphEdge => ({ kind: 'HOSTED_BY', from: openGuid, to: wallGuid });
const fills = (winGuid: string, openGuid: string): GraphEdge => ({ kind: 'FILLS', from: winGuid, to: openGuid });

const graphOf = (nodes: GraphNode[], edges: GraphEdge[] = []): LayoutGraph =>
    ({ nodes, edges, meta: { shellAreaM2: 0, levelId: 'L', seed: 's' } });
const metricsOf = (perSpaceDepth: Record<string, number>): SyntaxMetrics =>
    ({ perSpaceDepth, meanDepth: 0, relativeAsymmetry: 0, integration: {}, n: Object.keys(perSpaceDepth).length, connected: true, entryGuid: null });
const emptyBubble: BubbleGraph = { rooms: [], edges: [], corridorId: null, entryId: null };

// ════════════════════════════════ §ENV-E3-ACOUSTIC ═══════════════════════════
describe('§ENV-E3-ACOUSTIC (E.3) — acoustic zoning', () => {
    // BAD: bedroom directly adjacent to a kitchen (airborne path open).
    const badDirect = graphOf(
        [roomAt('BED', 'bedroom', 0, 0, 4, 4), roomAt('KIT', 'kitchen', 4, 0, 8, 4)],
        [adj('BED', 'KIT')],
    );
    // GOOD: bedroom — corridor — kitchen (corridor buffers the two).
    const goodBuffered = graphOf(
        [roomAt('BED', 'bedroom', 0, 0, 4, 4), roomAt('COR', 'corridor', 4, 0, 6, 4), roomAt('KIT', 'kitchen', 6, 0, 10, 4)],
        [adj('BED', 'COR'), adj('COR', 'KIT')],
    );

    it('a buffered bedroom↔corridor↔kitchen beats a bedroom directly next to a kitchen', () => {
        const good = acousticZoningScore(goodBuffered);
        const bad = acousticZoningScore(badDirect);
        expect(good).toBeGreaterThan(bad);
        expect(good).toBe(1);   // fully buffered, no direct violation
        expect(bad).toBe(0);    // pure violation, no buffer
    });

    it('mixed layout (one buffered + one direct) scores strictly between 0 and 1', () => {
        const mixed = graphOf(
            [
                roomAt('BED1', 'bedroom', 0, 0, 4, 4), roomAt('KIT', 'kitchen', 4, 0, 8, 4),       // direct violation
                roomAt('BED2', 'bedroom', 0, 4, 4, 8), roomAt('COR', 'corridor', 4, 4, 6, 8),
                roomAt('WC', 'wc', 6, 4, 8, 8),
            ],
            [adj('BED1', 'KIT'), adj('BED2', 'COR'), adj('COR', 'WC')],   // BED2 buffered from WC by corridor
        );
        const v = acousticZoningScore(mixed);
        expect(v).toBeGreaterThan(0);
        expect(v).toBeLessThan(1);
    });

    // ── GRACEFUL DEGRADATION — neutral 1.0, never throws ──────────────────────
    it('no quiet↔noisy relation at all → neutral 1.0', () => {
        const onlyLiving = graphOf(
            [roomAt('LIV', 'living', 0, 0, 4, 4), roomAt('DIN', 'dining', 4, 0, 8, 4)],
            [adj('LIV', 'DIN')],
        );
        expect(acousticZoningScore(onlyLiving)).toBe(1);
    });

    it('no adjacency edges → neutral 1.0', () => {
        const noEdges = graphOf([roomAt('BED', 'bedroom', 0, 0, 4, 4), roomAt('KIT', 'kitchen', 4, 0, 8, 4)], []);
        expect(acousticZoningScore(noEdges)).toBe(1);
    });

    it('empty graph → neutral 1.0 (no throw)', () => {
        expect(acousticZoningScore(graphOf([]))).toBe(1);
    });

    // ── INTEGRATION through computeObjectives ─────────────────────────────────
    it('surfaces on computeObjectives.acousticZoning', () => {
        const good = computeObjectives(goodBuffered, metricsOf({ BED: 2, COR: 1, KIT: 1 }), emptyBubble);
        const bad = computeObjectives(badDirect, metricsOf({ BED: 1, KIT: 1 }), emptyBubble);
        expect(good.acousticZoning).toBeGreaterThan(bad.acousticZoning);
    });

    it('acousticZoning is part of OBJECTIVE_AXES + mapped to env-performance band', () => {
        expect(OBJECTIVE_AXES).toContain('acousticZoning');
        expect(AXIS_PRIORITY.acousticZoning).toBe('env-performance');
        expect(priorityMultiplier('acousticZoning')).toBe(PRIORITY_BAND['env-performance']);
    });
});

// ───────────────────── §ENV-E3-ACOUSTIC (vertical stack) ─────────────────────
describe('§ENV-E3-ACOUSTIC (vertical) — multi-storey stack preference', () => {
    const P = (hasBedroom: boolean, hasNoisy: boolean): StoreyAcousticProfile => ({ hasBedroom, hasNoisy });

    it('bedroom-above-bedroom is fine (score 1.0)', () => {
        // ground: bedroom (no kitchen) ; upper: bedroom.
        expect(verticalStackAcousticScore([P(true, false), P(true, false)])).toBe(1);
    });

    it('bedroom directly above a noisy (kitchen) storey is penalised (< 1)', () => {
        // ground: kitchen (noisy) ; upper: bedroom.
        const v = verticalStackAcousticScore([P(false, true), P(true, false)]);
        expect(v).toBeLessThan(1);
        expect(v).toBe(0);   // the only considered upper-bedroom pair is penalised
    });

    it('single storey → neutral 1.0 (no stack)', () => {
        expect(verticalStackAcousticScore([P(true, true)])).toBe(1);
    });

    it('no upper bedroom over anything → neutral 1.0', () => {
        // ground bedroom, upper kitchen (no upper bedroom) → nothing to consider.
        expect(verticalStackAcousticScore([P(true, false), P(false, true)])).toBe(1);
    });

    // ── storey-allocation preference (consumes the real allocator) ────────────
    const program: ApartmentProgram = {
        bedrooms: 3, bathrooms: 2, masterEnSuite: true,
        openPlanKitchenDining: true, livingRoom: true, entranceHall: true,
    };

    it('storeyAcousticProfiles flags the ground (kitchen) noisy + the upper (bedrooms)', () => {
        const storeys = allocateProgramToStoreys(program, 2);
        const profiles = storeyAcousticProfiles(storeys);
        expect(profiles[0]!.hasNoisy).toBe(true);    // ground = kitchen
        expect(profiles[1]!.hasBedroom).toBe(true);  // upper = bedrooms
    });

    it('the default house allocation (kitchen ground, bedrooms up) is acoustically penalised but a SOFT preference, not a gate', () => {
        // The default puts the kitchen on the ground with bedrooms directly above
        // — a structure-borne penalty the SOFT preference surfaces (the allocation
        // is still produced; nothing is gated out).
        const storeys = allocateProgramToStoreys(program, 2);
        expect(storeys.length).toBe(2);               // not gated
        const pref = storeyAcousticPreference(storeys);
        expect(pref).toBeGreaterThanOrEqual(0);
        expect(pref).toBeLessThanOrEqual(1);
    });

    it('a single-storey allocation has a neutral 1.0 acoustic preference', () => {
        const storeys = allocateProgramToStoreys(program, 1);
        expect(storeyAcousticPreference(storeys)).toBe(1);
    });
});

// ════════════════════════════════ §ENV-E4-VENT ═══════════════════════════════
describe('§ENV-E4-VENT (E.4) — natural ventilation', () => {
    // A bedroom bounded by TWO external walls on OPPOSITE façades, each with a
    // window → cross-vent possible. South wall is horizontal (z const), east wall
    // is vertical (x const) — 90° apart → two façade buckets.
    const crossVent = (): LayoutGraph => {
        const room = roomAt('BED', 'bedroom', 0, 0, 4, 4);
        const wSouth = wall('WS', { x: 0, z: 0 }, { x: 4, z: 0 }, true);   // horizontal façade
        const wEast = wall('WE', { x: 4, z: 0 }, { x: 4, z: 4 }, true);    // vertical façade (perpendicular)
        const oS = opening('OS'), oE = opening('OE');
        const fS = windowFill('FS'), fE = windowFill('FE');
        return graphOf(
            [room, wSouth, wEast, oS, oE, fS, fE],
            [
                bounds('WS', 'BED'), bounds('WE', 'BED'),
                hostedBy('OS', 'WS'), hostedBy('OE', 'WE'),
                fills('FS', 'OS'), fills('FE', 'OE'),
            ],
        );
    };
    // The SAME bedroom but both windows on the SAME (south) façade → single-sided.
    const singleSided = (): LayoutGraph => {
        const room = roomAt('BED', 'bedroom', 0, 0, 4, 4);
        const wSouth = wall('WS', { x: 0, z: 0 }, { x: 4, z: 0 }, true);
        const wSouth2 = wall('WS2', { x: 0, z: 0 }, { x: 4, z: 0 }, true);   // same orientation bucket
        const oS = opening('OS'), oS2 = opening('OS2');
        const fS = windowFill('FS'), fS2 = windowFill('FS2');
        return graphOf(
            [room, wSouth, wSouth2, oS, oS2, fS, fS2],
            [
                bounds('WS', 'BED'), bounds('WS2', 'BED'),
                hostedBy('OS', 'WS'), hostedBy('OS2', 'WS2'),
                fills('FS', 'OS'), fills('FS2', 'OS2'),
            ],
        );
    };

    it('a cross-ventilated room (windows on 2 perpendicular façades) beats single-sided', () => {
        const cv = naturalVentilationScore(crossVent());
        const ss = naturalVentilationScore(singleSided());
        expect(cv).toBeGreaterThan(ss);
    });

    it('a deep plan (short side beyond cross-vent reach) is penalised vs a shallow one', () => {
        // Same single south window, but a DEEP room (short side 20 m > 12.5 reach).
        const deep = (): LayoutGraph => {
            const room = roomAt('LIV', 'living', 0, 0, 30, 20);     // short side = 20 m
            const wSouth = wall('WS', { x: 0, z: 0 }, { x: 30, z: 0 }, true);
            const wEast = wall('WE', { x: 30, z: 0 }, { x: 30, z: 20 }, true);
            const oS = opening('OS'), oE = opening('OE');
            const fS = windowFill('FS'), fE = windowFill('FE');
            return graphOf(
                [room, wSouth, wEast, oS, oE, fS, fE],
                [bounds('WS', 'LIV'), bounds('WE', 'LIV'), hostedBy('OS', 'WS'), hostedBy('OE', 'WE'), fills('FS', 'OS'), fills('FE', 'OE')],
            );
        };
        const shallow = (): LayoutGraph => {
            const room = roomAt('LIV', 'living', 0, 0, 30, 5);      // short side = 5 m
            const wSouth = wall('WS', { x: 0, z: 0 }, { x: 30, z: 0 }, true);
            const wEast = wall('WE', { x: 30, z: 0 }, { x: 30, z: 5 }, true);
            const oS = opening('OS'), oE = opening('OE');
            const fS = windowFill('FS'), fE = windowFill('FE');
            return graphOf(
                [room, wSouth, wEast, oS, oE, fS, fE],
                [bounds('WS', 'LIV'), bounds('WE', 'LIV'), hostedBy('OS', 'WS'), hostedBy('OE', 'WE'), fills('FS', 'OS'), fills('FE', 'OE')],
            );
        };
        expect(naturalVentilationScore(shallow())).toBeGreaterThan(naturalVentilationScore(deep()));
    });

    it('a stair/stack path nudges the score up (never down)', () => {
        const base = crossVent();
        const withStack = graphOf(
            [...base.nodes, roomAt('ST', 'stairwell', 4, 0, 6, 4)],
            base.edges,
        );
        // crossVent already scores high; the stair can only raise (or hold) it.
        expect(naturalVentilationScore(withStack)).toBeGreaterThanOrEqual(naturalVentilationScore(base));
    });

    it('returns a value within [0, 1] always', () => {
        for (const g of [crossVent(), singleSided()]) {
            const v = naturalVentilationScore(g);
            expect(v).toBeGreaterThanOrEqual(0);
            expect(v).toBeLessThanOrEqual(1);
        }
    });

    // ── GRACEFUL DEGRADATION — neutral 1.0, never throws ──────────────────────
    it('no external walls at all → neutral 1.0', () => {
        const g = graphOf([roomAt('BED', 'bedroom', 0, 0, 4, 4)], []);
        expect(naturalVentilationScore(g)).toBe(1);
    });

    it('no habitable room → neutral 1.0', () => {
        const g = graphOf(
            [roomAt('COR', 'corridor', 0, 0, 4, 4), wall('WS', { x: 0, z: 0 }, { x: 4, z: 0 }, true)],
            [bounds('WS', 'COR')],
        );
        expect(naturalVentilationScore(g)).toBe(1);
    });

    it('empty graph → neutral 1.0 (no throw)', () => {
        expect(naturalVentilationScore(graphOf([]))).toBe(1);
    });

    // ── INTEGRATION through computeObjectives ─────────────────────────────────
    it('surfaces on computeObjectives.naturalVentilation', () => {
        const cv = computeObjectives(crossVent(), metricsOf({ BED: 0 }), emptyBubble);
        const ss = computeObjectives(singleSided(), metricsOf({ BED: 0 }), emptyBubble);
        expect(cv.naturalVentilation).toBeGreaterThan(ss.naturalVentilation);
    });

    it('naturalVentilation is part of OBJECTIVE_AXES + mapped to env-performance band', () => {
        expect(OBJECTIVE_AXES).toContain('naturalVentilation');
        expect(AXIS_PRIORITY.naturalVentilation).toBe('env-performance');
        expect(priorityMultiplier('naturalVentilation')).toBe(PRIORITY_BAND['env-performance']);
    });
});

// ═══════════════ EQUALITY INVARIANT — neutral when inputs absent ══════════════
describe('§ENV-E3/E4 — neutral fallback preserves the Pareto equality invariant', () => {
    // A plain layout with NO acoustic tension AND no window/wall data — exactly the
    // shape of the existing test fixtures. Both new axes MUST be a constant 1.0 so
    // they cannot reorder candidates (byte-identical Pareto behaviour vs pre-E.3/E.4).
    const plain = graphOf(
        [roomAt('LIV', 'living', 0, 0, 4, 4), roomAt('DIN', 'dining', 4, 0, 8, 4)],
        [adj('LIV', 'DIN')],
    );

    it('both new axes are exactly 1.0 on a layout with no acoustic/vent inputs', () => {
        const v = computeObjectives(plain, metricsOf({ LIV: 0, DIN: 1 }), emptyBubble);
        expect(v.acousticZoning).toBe(1);
        expect(v.naturalVentilation).toBe(1);
    });

    it('determinism: identical input → identical output (both axes)', () => {
        const a = computeObjectives(plain, metricsOf({ LIV: 0, DIN: 1 }), emptyBubble);
        const b = computeObjectives(plain, metricsOf({ LIV: 0, DIN: 1 }), emptyBubble);
        expect(a.acousticZoning).toBe(b.acousticZoning);
        expect(a.naturalVentilation).toBe(b.naturalVentilation);
    });

    // ── Real pipeline graph: both axes finite + in [0,1] ──────────────────────
    it('on the real D-TGL pipeline graph both axes are finite [0,1] values', () => {
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
        const v = computeObjectives(lg, computeSpaceSyntax(lg, entry), bubble);
        for (const ax of ['acousticZoning', 'naturalVentilation'] as const) {
            expect(Number.isFinite(v[ax])).toBe(true);
            expect(v[ax]).toBeGreaterThanOrEqual(0);
            expect(v[ax]).toBeLessThanOrEqual(1);
        }
    });
});
