// TGL P7 — objective vector tests.
// Contract (SPEC §7): each axis ∈ [0,1]; a known-good layout outscores a
// known-bad one on the targeted axis.

import { describe, expect, it } from 'vitest';
import { computeObjectives, OBJECTIVE_AXES } from '../src/workflows/apartmentLayout/tgl/objectives.js';
import { buildSemanticGraph, type GraphEdge, type GraphNode, type LayoutGraph, type Primitive } from '../src/workflows/apartmentLayout/tgl/semanticGraph.js';
import { computeSpaceSyntax, type SyntaxMetrics } from '../src/workflows/apartmentLayout/tgl/spaceSyntax.js';
import { buildWallsAndDoors } from '../src/workflows/apartmentLayout/tgl/wallsAndDoors.js';
import { subdivide } from '../src/workflows/apartmentLayout/tgl/subdivide.js';
import { buildBubbleGraph, type BubbleGraph } from '../src/workflows/apartmentLayout/tgl/bubbleGraph.js';
import { decomposeToRects, type Pt } from '../src/workflows/apartmentLayout/tgl/rectDecomposition.js';
import type { ApartmentProgram } from '../src/workflows/apartmentLayout/types.js';

const space = (guid: string, attrs: Record<string, Primitive>, w = 4, h = 4): GraphNode =>
    ({ guid, kind: 'Space', sourceId: guid, attrs, geometry: { polygon: [{ x: 0, z: 0 }, { x: w, z: 0 }, { x: w, z: h }, { x: 0, z: h }] }, psets: {} });
const graphOf = (nodes: GraphNode[], edges: GraphEdge[] = []): LayoutGraph =>
    ({ nodes, edges, meta: { shellAreaM2: 0, levelId: 'L', seed: 's' } });
const metricsOf = (perSpaceDepth: Record<string, number>): SyntaxMetrics =>
    ({ perSpaceDepth, meanDepth: 0, relativeAsymmetry: 0, integration: {}, n: Object.keys(perSpaceDepth).length, connected: true, entryGuid: null });
const emptyBubble: BubbleGraph = { rooms: [], edges: [], corridorId: null, entryId: null };

describe('computeObjectives (TGL P7)', () => {
    it('every axis ∈ [0,1] on the real pipeline graph', () => {
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
        for (const axis of OBJECTIVE_AXES) {
            expect(v[axis]).toBeGreaterThanOrEqual(0);
            expect(v[axis]).toBeLessThanOrEqual(1);
        }
    });

    it('circulation: bedrooms-deep beats bedrooms-shallow', () => {
        const g = graphOf([
            space('L', { spaceType: 'living', netAreaM2: 25, isPrivate: false, needsWindow: true }),
            space('B', { spaceType: 'bedroom', netAreaM2: 15, isPrivate: true, needsWindow: true }),
        ]);
        const good = computeObjectives(g, metricsOf({ L: 1, B: 3 }), emptyBubble); // living shallow, bed deep
        const bad = computeObjectives(g, metricsOf({ L: 3, B: 1 }), emptyBubble);  // living deep, bed shallow
        expect(good.circulation).toBeGreaterThan(bad.circulation);
    });

    // §PRIVACY-DEPTH (L2-β-1, 2026-05-29) — discrete-tier hierarchy gradient
    // complements the smooth `circulation` axis.
    describe('hierarchy (§PRIVACY-DEPTH)', () => {
        it('rewards layouts with private rooms at depth ≥ 3 + public rooms at depth ≤ 2', () => {
            const g = graphOf([
                space('L', { spaceType: 'living', netAreaM2: 25, isPrivate: false, needsWindow: true }),
                space('B', { spaceType: 'bedroom', netAreaM2: 15, isPrivate: true, needsWindow: true }),
            ]);
            const ideal = computeObjectives(g, metricsOf({ L: 1, B: 3 }), emptyBubble);
            expect(ideal.hierarchy).toBe(1); // both rooms in their correct tier
        });

        it('penalises private-shallow + public-deep inversion', () => {
            const g = graphOf([
                space('L', { spaceType: 'living', netAreaM2: 25, isPrivate: false, needsWindow: true }),
                space('B', { spaceType: 'bedroom', netAreaM2: 15, isPrivate: true, needsWindow: true }),
            ]);
            const inverted = computeObjectives(g, metricsOf({ L: 3, B: 1 }), emptyBubble);
            expect(inverted.hierarchy).toBe(0); // both rooms in WRONG tier
        });

        it('exempts circulation rooms (corridor / hall) from the gradient', () => {
            // Corridor at any depth must not pull the score down.
            const g = graphOf([
                space('L', { spaceType: 'living', netAreaM2: 25, isPrivate: false, needsWindow: true }),
                space('C', { spaceType: 'corridor', netAreaM2: 8, isPrivate: false, needsWindow: false }),
                space('B', { spaceType: 'bedroom', netAreaM2: 15, isPrivate: true, needsWindow: true }),
            ]);
            const v = computeObjectives(g, metricsOf({ L: 1, C: 4, B: 3 }), emptyBubble);
            expect(v.hierarchy).toBe(1); // corridor is exempt; living + bedroom both correct-tier
        });

        it('returns a value in [0, 1] like every other axis', () => {
            const g = graphOf([
                space('L', { spaceType: 'living', netAreaM2: 25, isPrivate: false, needsWindow: true }),
                space('B', { spaceType: 'bedroom', netAreaM2: 15, isPrivate: true, needsWindow: true }),
            ]);
            for (const m of [
                metricsOf({ L: 1, B: 3 }),
                metricsOf({ L: 2, B: 2 }),
                metricsOf({ L: 3, B: 1 }),
            ]) {
                const v = computeObjectives(g, m, emptyBubble).hierarchy;
                expect(v).toBeGreaterThanOrEqual(0);
                expect(v).toBeLessThanOrEqual(1);
            }
        });
    });

    // §SHAPE-QUALITY (D3.4 + D3.1, 2026-05-29) — the shape gate's soft penalties
    // feed an objective axis the Pareto rank considers.
    describe('shapeQuality (§SHAPE-QUALITY)', () => {
        it('defaults to 1 when no shape-quality argument is provided', () => {
            const g = graphOf([
                space('L', { spaceType: 'living', netAreaM2: 25, isPrivate: false, needsWindow: true }),
            ]);
            const v = computeObjectives(g, metricsOf({ L: 1 }), emptyBubble);
            expect(v.shapeQuality).toBe(1);
        });

        it('honours an injected shapeQuality value clamped to [0, 1]', () => {
            const g = graphOf([
                space('L', { spaceType: 'living', netAreaM2: 25, isPrivate: false, needsWindow: true }),
            ]);
            expect(computeObjectives(g, metricsOf({ L: 1 }), emptyBubble, 0.4).shapeQuality).toBeCloseTo(0.4);
            expect(computeObjectives(g, metricsOf({ L: 1 }), emptyBubble, 0).shapeQuality).toBe(0);
            expect(computeObjectives(g, metricsOf({ L: 1 }), emptyBubble, 1.5).shapeQuality).toBe(1); // clamped
            expect(computeObjectives(g, metricsOf({ L: 1 }), emptyBubble, -0.1).shapeQuality).toBe(0); // clamped
        });
    });

    it('efficiency: a small corridor beats a large corridor', () => {
        const lean = graphOf([
            space('K', { spaceType: 'kitchen', netAreaM2: 40, isPrivate: false, needsWindow: true }),
            space('C', { spaceType: 'corridor', netAreaM2: 5, isPrivate: false, needsWindow: false }),
        ]);
        const fat = graphOf([
            space('K', { spaceType: 'kitchen', netAreaM2: 25, isPrivate: false, needsWindow: true }),
            space('C', { spaceType: 'corridor', netAreaM2: 20, isPrivate: false, needsWindow: false }),
        ]);
        const m = metricsOf({ K: 1, C: 0 });
        expect(computeObjectives(lean, m, emptyBubble).efficiency).toBeGreaterThan(computeObjectives(fat, m, emptyBubble).efficiency);
    });

    it('adjacency: realised door edge scores higher than an unrealised one', () => {
        const nodes = [
            space('A', { spaceType: 'living', netAreaM2: 20, isPrivate: false, needsWindow: true }),
            space('B', { spaceType: 'bedroom', netAreaM2: 15, isPrivate: true, needsWindow: true }),
        ];
        const bubble: BubbleGraph = {
            rooms: [
                { id: 'A', type: 'living', name: 'A', targetAreaM2: 20, isPrivate: false, needsWindow: true },
                { id: 'B', type: 'bedroom', name: 'B', targetAreaM2: 15, isPrivate: true, needsWindow: true },
            ],
            edges: [{ a: 'A', b: 'B', via: 'door' }], corridorId: null, entryId: 'A',
        };
        const realised = graphOf(nodes, [{ kind: 'CONNECTS_THROUGH', from: 'A', to: 'B', via: 'door-guid' }]);
        const missing = graphOf(nodes, []);
        const m = metricsOf({ A: 0, B: 1 });
        expect(computeObjectives(realised, m, bubble).adjacency).toBeGreaterThan(computeObjectives(missing, m, bubble).adjacency);
        expect(computeObjectives(realised, m, bubble).adjacency).toBe(1);
        expect(computeObjectives(missing, m, bubble).adjacency).toBe(0);
    });

    it('daylight: a habitable room fronting the façade beats one buried inside', () => {
        const extWall: GraphNode = { guid: 'W', kind: 'Wall', sourceId: 'w', attrs: { isExternal: true }, psets: {} };
        const lit = graphOf([extWall, space('B', { spaceType: 'bedroom', netAreaM2: 15, isPrivate: true, needsWindow: true })],
            [{ kind: 'BOUNDS', from: 'W', to: 'B' }]);
        const dark = graphOf([extWall, space('B', { spaceType: 'bedroom', netAreaM2: 15, isPrivate: true, needsWindow: true })], []);
        const m = metricsOf({ B: 1 });
        expect(computeObjectives(lit, m, emptyBubble).daylight).toBeGreaterThan(computeObjectives(dark, m, emptyBubble).daylight);
    });
});
