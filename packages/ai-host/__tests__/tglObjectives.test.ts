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

    // §TOPOLOGY-QUALITY (T3.3, 2026-05-29) — Part B validators feed this axis.
    describe('topologyQuality (§TOPOLOGY-QUALITY)', () => {
        it('defaults to 1 when no topology-quality argument is provided', () => {
            const g = graphOf([
                space('L', { spaceType: 'living', netAreaM2: 25, isPrivate: false, needsWindow: true }),
            ]);
            const v = computeObjectives(g, metricsOf({ L: 1 }), emptyBubble);
            expect(v.topologyQuality).toBe(1);
        });

        it('honours an injected topologyQuality value clamped to [0, 1]', () => {
            const g = graphOf([
                space('L', { spaceType: 'living', netAreaM2: 25, isPrivate: false, needsWindow: true }),
            ]);
            expect(computeObjectives(g, metricsOf({ L: 1 }), emptyBubble, 1, 0).topologyQuality).toBe(0);
            expect(computeObjectives(g, metricsOf({ L: 1 }), emptyBubble, 1, 0.6).topologyQuality).toBeCloseTo(0.6);
            expect(computeObjectives(g, metricsOf({ L: 1 }), emptyBubble, 1, 2).topologyQuality).toBe(1); // clamped
            expect(computeObjectives(g, metricsOf({ L: 1 }), emptyBubble, 1, -1).topologyQuality).toBe(0); // clamped
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

    // §L1-α-2 ENHANCEMENT (2026-05-29) — when bubble.daylightField is present,
    // the `daylight` axis weights each fronting room's contribution by the
    // depth-field score, so a shallow lit room out-scores a deep-but-lit room.
    it('daylight (with field): shallow lit room scores higher than deep lit room', () => {
        // 12 × 10 shell with south façade at z = 0. South sunlight = 1.0.
        // Two rooms BOTH formally fronting the façade (the BOUNDS edge says so),
        // but one is at the south edge (depth = 0 → score ≈ 1) and one is at
        // the north end (depth ≈ 7 → score ≈ 0).
        const program: ApartmentProgram = {
            bedrooms: 2, bathrooms: 1, masterEnSuite: true,
            openPlanKitchenDining: true, livingRoom: true, entranceHall: true,
        };
        const poly: Pt[] = [{ x: 0, z: 0 }, { x: 12, z: 0 }, { x: 12, z: 10 }, { x: 0, z: 10 }];
        const bubble = buildBubbleGraph(program, 120, poly);
        expect(bubble.daylightField).toBeDefined();

        const extWall: GraphNode = { guid: 'W', kind: 'Wall', sourceId: 'w', attrs: { isExternal: true }, psets: {} };
        // Shallow room: rect (0..4, 0..3) — flush with south façade.
        const shallow: GraphNode = {
            guid: 'S', kind: 'Space', sourceId: 'S',
            attrs: { spaceType: 'bedroom', netAreaM2: 12, isPrivate: true, needsWindow: true },
            geometry: { polygon: [{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 3 }, { x: 0, z: 3 }] },
            psets: {},
        };
        // Deep room: rect (0..4, 7..10) — at the north end, 7 m deep.
        const deep: GraphNode = {
            guid: 'D', kind: 'Space', sourceId: 'D',
            attrs: { spaceType: 'bedroom', netAreaM2: 12, isPrivate: true, needsWindow: true },
            geometry: { polygon: [{ x: 0, z: 7 }, { x: 4, z: 7 }, { x: 4, z: 10 }, { x: 0, z: 10 }] },
            psets: {},
        };
        const shallowGraph = graphOf([extWall, shallow], [{ kind: 'BOUNDS', from: 'W', to: 'S' }]);
        const deepGraph = graphOf([extWall, deep], [{ kind: 'BOUNDS', from: 'W', to: 'D' }]);
        const m = metricsOf({ S: 1 });
        const m2 = metricsOf({ D: 1 });
        const shallowScore = computeObjectives(shallowGraph, m, bubble).daylight;
        const deepScore = computeObjectives(deepGraph, m2, bubble).daylight;
        expect(shallowScore).toBeGreaterThan(deepScore);
        // The deep room still gets SOME daylight from the WEST façade (room is
        // 0–4 m off the west wall), but materially less than the south-flush
        // shallow room. The ratio must be ≥ 1.7×.
        expect(shallowScore / Math.max(deepScore, 1e-9)).toBeGreaterThan(1.7);
        // And the shallow room near 1 (flush with south façade).
        expect(shallowScore).toBeGreaterThan(0.7);
    });

    // §L3-γ-4 (2026-05-30) — edgeRealisation axis: SOFT-scores how each
    // bubble edge's via matches its semantic kind. Makes the L3-γ-1/2
    // EdgeType data load-bearing in scoring.
    describe('§L3-γ-4 edgeRealisation', () => {
        it('legacy bubble (no edges) → axis 1.0 (no opinion, back-compat)', () => {
            const g = graphOf([
                space('L', { spaceType: 'living', netAreaM2: 25, isPrivate: false, needsWindow: true }),
            ]);
            const v = computeObjectives(g, metricsOf({ L: 1 }), emptyBubble);
            expect(v.edgeRealisation).toBe(1);
        });

        it('all-door edges with semantic kinds → axis 1.0', () => {
            const g = graphOf([
                space('L', { spaceType: 'living', netAreaM2: 25, isPrivate: false, needsWindow: true }),
            ]);
            const bubble: BubbleGraph = {
                rooms: [], edges: [
                    { a: 'r0', b: 'r1', via: 'door', kind: 'CEREMONIAL_THRESHOLD' },
                    { a: 'r1', b: 'r2', via: 'door', kind: 'INTIMATE_ACCESS' },
                    { a: 'r2', b: 'r3', via: 'door', kind: 'BUFFER' },
                    { a: 'r3', b: 'r4', via: 'door', kind: 'SERVICE_ACCESS' },
                    { a: 'r4', b: 'r5', via: 'door', kind: 'SOCIAL_FLOW' },
                ],
                corridorId: null, entryId: null,
            };
            const v = computeObjectives(g, metricsOf({ L: 1 }), bubble);
            expect(v.edgeRealisation).toBe(1);
        });

        it('INTIMATE_ACCESS realised as open → axis 0.0 (privacy defeated, heavy penalty)', () => {
            const g = graphOf([
                space('L', { spaceType: 'living', netAreaM2: 25, isPrivate: false, needsWindow: true }),
            ]);
            const bubble: BubbleGraph = {
                rooms: [], edges: [
                    { a: 'r0', b: 'r1', via: 'open', kind: 'INTIMATE_ACCESS' },
                ],
                corridorId: null, entryId: null,
            };
            const v = computeObjectives(g, metricsOf({ L: 1 }), bubble);
            expect(v.edgeRealisation).toBe(0);
        });

        it('VISUAL_CONNECTION realised as open → 1.0; as door → 0.5', () => {
            const g = graphOf([
                space('L', { spaceType: 'living', netAreaM2: 25, isPrivate: false, needsWindow: true }),
            ]);
            const openBubble: BubbleGraph = {
                rooms: [], edges: [{ a: 'r0', b: 'r1', via: 'open', kind: 'VISUAL_CONNECTION' }],
                corridorId: null, entryId: null,
            };
            const doorBubble: BubbleGraph = {
                rooms: [], edges: [{ a: 'r0', b: 'r1', via: 'door', kind: 'VISUAL_CONNECTION' }],
                corridorId: null, entryId: null,
            };
            expect(computeObjectives(g, metricsOf({ L: 1 }), openBubble).edgeRealisation).toBe(1);
            expect(computeObjectives(g, metricsOf({ L: 1 }), doorBubble).edgeRealisation).toBe(0.5);
        });

        it('mixed kinds + back-compat (some edges have no kind) → averages correctly', () => {
            const g = graphOf([
                space('L', { spaceType: 'living', netAreaM2: 25, isPrivate: false, needsWindow: true }),
            ]);
            const bubble: BubbleGraph = {
                rooms: [], edges: [
                    { a: 'r0', b: 'r1', via: 'door', kind: 'INTIMATE_ACCESS' },  // 1.0
                    { a: 'r1', b: 'r2', via: 'open', kind: 'BUFFER' },           // 0.3
                    { a: 'r2', b: 'r3', via: 'door' },                            // 1.0 (no kind, neutral)
                ],
                corridorId: null, entryId: null,
            };
            const v = computeObjectives(g, metricsOf({ L: 1 }), bubble);
            // (1.0 + 0.3 + 1.0) / 3 = 0.7666…
            expect(v.edgeRealisation).toBeCloseTo(2.3 / 3, 6);
        });
    });

    // §L4-δ-3 (2026-05-30) — openingCadence axis: SOFT-scores per-wall opening
    // rhythm. Score per wall = 1 − CV(gaps including wall-end virtual openings).
    describe('§L4-δ-3 openingCadence', () => {
        it('no walls / no openings → axis 1.0 (neutral)', () => {
            const g = graphOf([
                space('L', { spaceType: 'living', netAreaM2: 25, isPrivate: false, needsWindow: true }),
            ]);
            const v = computeObjectives(g, metricsOf({ L: 1 }), emptyBubble);
            expect(v.openingCadence).toBe(1);
        });

        it('a wall with no openings does not contribute to the axis', () => {
            const wall: GraphNode = {
                guid: 'W1', kind: 'Wall', sourceId: 'w1',
                attrs: { isExternal: false },
                geometry: { baseLine: [{ x: 0, z: 0 }, { x: 6, z: 0 }] },
                psets: {},
            };
            const g = graphOf([
                space('L', { spaceType: 'living', netAreaM2: 25, isPrivate: false, needsWindow: true }),
                wall,
            ]);
            const v = computeObjectives(g, metricsOf({ L: 1 }), emptyBubble);
            // Wall has 0 openings ⇒ no contribution ⇒ axis falls back to 1.0.
            expect(v.openingCadence).toBe(1);
        });

        it('symmetric single opening (centred on a 6 m wall) scores 1.0', () => {
            const wall: GraphNode = {
                guid: 'W1', kind: 'Wall', sourceId: 'w1',
                attrs: { isExternal: false },
                geometry: { baseLine: [{ x: 0, z: 0 }, { x: 6, z: 0 }] },
                psets: {},
            };
            const opening: GraphNode = {
                guid: 'O1', kind: 'Opening', sourceId: 'o1',
                attrs: { offsetM: 3.0, widthM: 0.9 },
                psets: {},
            };
            const g = graphOf(
                [space('L', { spaceType: 'living', netAreaM2: 25, isPrivate: false, needsWindow: true }), wall, opening],
                [{ kind: 'HOSTED_BY', from: 'O1', to: 'W1' }],
            );
            const v = computeObjectives(g, metricsOf({ L: 1 }), emptyBubble);
            // Gaps: [3, 3] — perfectly symmetric, CV = 0, score = 1.
            expect(v.openingCadence).toBeCloseTo(1, 6);
        });

        it('off-centre single opening scores BELOW 1.0', () => {
            const wall: GraphNode = {
                guid: 'W1', kind: 'Wall', sourceId: 'w1',
                attrs: { isExternal: false },
                geometry: { baseLine: [{ x: 0, z: 0 }, { x: 6, z: 0 }] },
                psets: {},
            };
            const opening: GraphNode = {
                guid: 'O1', kind: 'Opening', sourceId: 'o1',
                attrs: { offsetM: 1.0, widthM: 0.9 },        // way off-centre
                psets: {},
            };
            const g = graphOf(
                [space('L', { spaceType: 'living', netAreaM2: 25, isPrivate: false, needsWindow: true }), wall, opening],
                [{ kind: 'HOSTED_BY', from: 'O1', to: 'W1' }],
            );
            const v = computeObjectives(g, metricsOf({ L: 1 }), emptyBubble);
            // Gaps: [1, 5], mean = 3, stddev = 2, CV = 2/3 ⇒ score ≈ 0.333.
            expect(v.openingCadence).toBeLessThan(0.5);
            expect(v.openingCadence).toBeGreaterThan(0.2);
        });

        it('two evenly-spaced openings (rhythmic) score HIGHER than two bunched', () => {
            const evenWall: GraphNode = {
                guid: 'W1', kind: 'Wall', sourceId: 'w1',
                attrs: { isExternal: false },
                geometry: { baseLine: [{ x: 0, z: 0 }, { x: 9, z: 0 }] },
                psets: {},
            };
            const evenA: GraphNode = { guid: 'OA', kind: 'Opening', sourceId: 'oa', attrs: { offsetM: 3.0, widthM: 0.9 }, psets: {} };
            const evenB: GraphNode = { guid: 'OB', kind: 'Opening', sourceId: 'ob', attrs: { offsetM: 6.0, widthM: 0.9 }, psets: {} };
            const even = graphOf(
                [space('L', { spaceType: 'living', netAreaM2: 25, isPrivate: false, needsWindow: true }), evenWall, evenA, evenB],
                [{ kind: 'HOSTED_BY', from: 'OA', to: 'W1' }, { kind: 'HOSTED_BY', from: 'OB', to: 'W1' }],
            );
            const bunchA: GraphNode = { guid: 'PA', kind: 'Opening', sourceId: 'pa', attrs: { offsetM: 0.5, widthM: 0.9 }, psets: {} };
            const bunchB: GraphNode = { guid: 'PB', kind: 'Opening', sourceId: 'pb', attrs: { offsetM: 1.5, widthM: 0.9 }, psets: {} };
            const bunch = graphOf(
                [space('L', { spaceType: 'living', netAreaM2: 25, isPrivate: false, needsWindow: true }), evenWall, bunchA, bunchB],
                [{ kind: 'HOSTED_BY', from: 'PA', to: 'W1' }, { kind: 'HOSTED_BY', from: 'PB', to: 'W1' }],
            );
            const evenScore = computeObjectives(even, metricsOf({ L: 1 }), emptyBubble).openingCadence;
            const bunchScore = computeObjectives(bunch, metricsOf({ L: 1 }), emptyBubble).openingCadence;
            expect(evenScore).toBeGreaterThan(bunchScore);
            // Even gaps [3,3,3] are uniform → score ≈ 1.0.
            expect(evenScore).toBeCloseTo(1, 1);
        });
    });

    // §L4-δ-4 (2026-05-30) — proportionalElegance axis: per-room aspect
    // comfort plateau. Soft gradient on top of D2.1's HARD aspect bounds.
    describe('§L4-δ-4 proportionalElegance', () => {
        it('no spaces → axis 1.0 (early-return path)', () => {
            const g = graphOf([]);
            const v = computeObjectives(g, metricsOf({}), emptyBubble);
            expect(v.proportionalElegance).toBe(1);
        });

        it('square room (1:1 aspect) scores 1.0 (within comfort plateau)', () => {
            const g = graphOf([
                space('S', { spaceType: 'living', netAreaM2: 16, isPrivate: false, needsWindow: true }, 4, 4),
            ]);
            const v = computeObjectives(g, metricsOf({ S: 1 }), emptyBubble);
            expect(v.proportionalElegance).toBe(1);
        });

        it('golden-ratio room (1:φ ≈ 1.618) scores 1.0 (top of plateau)', () => {
            const g = graphOf([
                space('G', { spaceType: 'living', netAreaM2: 16, isPrivate: false, needsWindow: true }, 4, 4 * 1.618),
            ]);
            const v = computeObjectives(g, metricsOf({ G: 1 }), emptyBubble);
            expect(v.proportionalElegance).toBeCloseTo(1, 6);
        });

        it('long-thin room (1:3 aspect) decays from the plateau', () => {
            const g = graphOf([
                space('L', { spaceType: 'living', netAreaM2: 12, isPrivate: false, needsWindow: true }, 2, 6),
            ]);
            const v = computeObjectives(g, metricsOf({ L: 1 }), emptyBubble);
            // aspect 3.0 sits in the (2.5, 4.0] decay band → score 0.7 - 0.5*(3-2.5)/(4-2.5) ≈ 0.533
            expect(v.proportionalElegance).toBeGreaterThan(0.4);
            expect(v.proportionalElegance).toBeLessThan(0.7);
        });

        it('corridor-like room (1:5 aspect) collapses to 0.1', () => {
            const g = graphOf([
                space('C', { spaceType: 'living', netAreaM2: 10, isPrivate: false, needsWindow: true }, 1, 5),
            ]);
            const v = computeObjectives(g, metricsOf({ C: 1 }), emptyBubble);
            expect(v.proportionalElegance).toBeCloseTo(0.1, 6);
        });

        it('aggregates area-weighted: one elegant + one corridor → between extremes', () => {
            const g = graphOf([
                space('A', { spaceType: 'living', netAreaM2: 16, isPrivate: false, needsWindow: true }, 4, 4),  // 1:1 → 1.0
                space('B', { spaceType: 'corridor', netAreaM2: 4, isPrivate: false, needsWindow: false }, 0.8, 5), // 1:6.25 → 0.1
            ]);
            const v = computeObjectives(g, metricsOf({ A: 1, B: 2 }), emptyBubble);
            // Area-weighted: (16*1.0 + 4*0.1) / 20 = 16.4 / 20 = 0.82
            expect(v.proportionalElegance).toBeCloseTo(0.82, 2);
        });
    });

    // §L2-β-4 (2026-05-30) — spatialClimax: dominant non-circulation space's
    // arrival-depth scoring. Compression-release ideal at depth ∈ [2, 4].
    describe('§L2-β-4 spatialClimax', () => {
        it('dominant living at depth 1 (immediate access) → 0.6 (too direct)', () => {
            const g = graphOf([
                space('H', { spaceType: 'hall', netAreaM2: 4, isPrivate: false, needsWindow: false }),
                space('L', { spaceType: 'living', netAreaM2: 25, isPrivate: false, needsWindow: true }),
            ]);
            const v = computeObjectives(g, metricsOf({ H: 0, L: 1 }), emptyBubble);
            expect(v.spatialClimax).toBeCloseTo(0.6, 6);
        });

        it('dominant living at depth 0 (climax IS entry) → 0.2 (no sequence)', () => {
            const g = graphOf([
                space('L', { spaceType: 'living', netAreaM2: 25, isPrivate: false, needsWindow: true }),
            ]);
            const v = computeObjectives(g, metricsOf({ L: 0 }), emptyBubble);
            expect(v.spatialClimax).toBeCloseTo(0.2, 6);
        });

        it('dominant living at depth 2 (entry → corridor → living) → 1.0 (ideal)', () => {
            const g = graphOf([
                space('H', { spaceType: 'hall', netAreaM2: 4, isPrivate: false, needsWindow: false }),
                space('C', { spaceType: 'corridor', netAreaM2: 3, isPrivate: false, needsWindow: false }),
                space('L', { spaceType: 'living', netAreaM2: 25, isPrivate: false, needsWindow: true }),
            ]);
            const v = computeObjectives(g, metricsOf({ H: 0, C: 1, L: 2 }), emptyBubble);
            expect(v.spatialClimax).toBe(1.0);
        });

        it('dominant living at depth 6 (too deep) → decay below 1.0', () => {
            const g = graphOf([
                space('L', { spaceType: 'living', netAreaM2: 25, isPrivate: false, needsWindow: true }),
            ]);
            const v = computeObjectives(g, metricsOf({ L: 6 }), emptyBubble);
            // 1.0 - 0.6 * (6-4)/4 = 0.7
            expect(v.spatialClimax).toBeCloseTo(0.7, 6);
        });

        it('hall/corridor are EXEMPT from climax identification', () => {
            // The hall is the largest by area but should NOT count as the
            // climax — circulation rooms are bridges, not destinations.
            // Living is the climax even though it's smaller.
            const g = graphOf([
                space('H', { spaceType: 'hall', netAreaM2: 50, isPrivate: false, needsWindow: false }),    // biggest BUT circulation
                space('L', { spaceType: 'living', netAreaM2: 10, isPrivate: false, needsWindow: true }),
            ]);
            const v = computeObjectives(g, metricsOf({ H: 0, L: 2 }), emptyBubble);
            // If climax were the hall, depth 0 → score 0.2. If living, depth 2 → 1.0.
            expect(v.spatialClimax).toBe(1.0);
        });

        it('no non-circulation rooms → neutral 1.0', () => {
            const g = graphOf([
                space('H', { spaceType: 'hall', netAreaM2: 4, isPrivate: false, needsWindow: false }),
                space('C', { spaceType: 'corridor', netAreaM2: 3, isPrivate: false, needsWindow: false }),
            ]);
            const v = computeObjectives(g, metricsOf({ H: 0, C: 1 }), emptyBubble);
            expect(v.spatialClimax).toBe(1);
        });
    });

    // §L2-β-2 (2026-05-30) — entrySightline: graph-distance proxy for
    // "how many spaces does the entry visually reveal at one threshold?"
    // Counts CONNECTS_THROUGH (door) + permeable ADJACENT_TO edges.
    describe('§L2-β-2 entrySightline', () => {
        it('no entry / no graph → 1.0 (neutral)', () => {
            const g = graphOf([]);
            const v = computeObjectives(g, metricsOf({}), emptyBubble);
            expect(v.entrySightline).toBe(1);
        });

        it('hall with one CONNECTS_THROUGH neighbour → 1.0 (architectural ideal)', () => {
            const g = graphOf([
                space('H', { spaceType: 'hall', netAreaM2: 4, isPrivate: false, needsWindow: false }),
                space('L', { spaceType: 'living', netAreaM2: 25, isPrivate: false, needsWindow: true }),
            ], [
                { kind: 'CONNECTS_THROUGH', from: 'H', to: 'L', via: 'doorA' },
            ]);
            const v = computeObjectives(g, metricsOf({ H: 0, L: 1 }), emptyBubble);
            expect(v.entrySightline).toBe(1);
        });

        it('hall with FIVE neighbours → 0.3 (over-exposed entry)', () => {
            const g = graphOf([
                space('H', { spaceType: 'hall', netAreaM2: 4, isPrivate: false, needsWindow: false }),
                space('A', { spaceType: 'living', netAreaM2: 20, isPrivate: false, needsWindow: true }),
                space('B', { spaceType: 'kitchen', netAreaM2: 10, isPrivate: false, needsWindow: true }),
                space('C', { spaceType: 'dining', netAreaM2: 10, isPrivate: false, needsWindow: true }),
                space('D', { spaceType: 'bedroom', netAreaM2: 12, isPrivate: true, needsWindow: true }),
                space('E', { spaceType: 'bathroom', netAreaM2: 5, isPrivate: true, needsWindow: false }),
            ], [
                { kind: 'CONNECTS_THROUGH', from: 'H', to: 'A', via: 'a' },
                { kind: 'CONNECTS_THROUGH', from: 'H', to: 'B', via: 'b' },
                { kind: 'CONNECTS_THROUGH', from: 'H', to: 'C', via: 'c' },
                { kind: 'CONNECTS_THROUGH', from: 'H', to: 'D', via: 'd' },
                { kind: 'CONNECTS_THROUGH', from: 'H', to: 'E', via: 'e' },
            ]);
            const v = computeObjectives(g, metricsOf({ H: 0, A: 1, B: 1, C: 1, D: 1, E: 1 }), emptyBubble);
            expect(v.entrySightline).toBeCloseTo(0.3, 6);
        });

        it('hall with zero CONNECTS_THROUGH neighbours → 0.3 (blind entry)', () => {
            const g = graphOf([
                space('H', { spaceType: 'hall', netAreaM2: 4, isPrivate: false, needsWindow: false }),
                space('L', { spaceType: 'living', netAreaM2: 25, isPrivate: false, needsWindow: true }),
            ], []);
            const v = computeObjectives(g, metricsOf({ H: 0, L: 1 }), emptyBubble);
            expect(v.entrySightline).toBeCloseTo(0.3, 6);
        });

        it('hall with permeable ADJACENT_TO (open-plan threshold) counts as visible', () => {
            const g = graphOf([
                space('H', { spaceType: 'hall', netAreaM2: 4, isPrivate: false, needsWindow: false }),
                space('L', { spaceType: 'living', netAreaM2: 25, isPrivate: false, needsWindow: true }),
            ], [
                { kind: 'ADJACENT_TO', from: 'H', to: 'L', props: { boundary: 'open', permeable: true } },
            ]);
            const v = computeObjectives(g, metricsOf({ H: 0, L: 1 }), emptyBubble);
            // 1 visible via open threshold → score 1.0
            expect(v.entrySightline).toBe(1);
        });

        it('fallback: no hall → uses depth-0 space as entry', () => {
            const g = graphOf([
                space('E', { spaceType: 'living', netAreaM2: 25, isPrivate: false, needsWindow: true }),
                space('B', { spaceType: 'bedroom', netAreaM2: 12, isPrivate: true, needsWindow: true }),
            ], [
                { kind: 'CONNECTS_THROUGH', from: 'E', to: 'B', via: 'a' },
            ]);
            const v = computeObjectives(g, metricsOf({ E: 0, B: 1 }), emptyBubble);
            // No hall; E is depth 0 → entry; has 1 visible neighbour → 1.0
            expect(v.entrySightline).toBe(1);
        });
    });

    it('daylight (no field): behaviour unchanged (back-compat)', () => {
        // emptyBubble has no daylightField → the prior binary fronts-facade
        // computation must produce the same number for both rooms regardless
        // of their position in world space.
        const extWall: GraphNode = { guid: 'W', kind: 'Wall', sourceId: 'w', attrs: { isExternal: true }, psets: {} };
        const shallow: GraphNode = {
            guid: 'S', kind: 'Space', sourceId: 'S',
            attrs: { spaceType: 'bedroom', netAreaM2: 12, isPrivate: true, needsWindow: true },
            geometry: { polygon: [{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 3 }, { x: 0, z: 3 }] },
            psets: {},
        };
        const deep: GraphNode = {
            guid: 'D', kind: 'Space', sourceId: 'D',
            attrs: { spaceType: 'bedroom', netAreaM2: 12, isPrivate: true, needsWindow: true },
            geometry: { polygon: [{ x: 0, z: 7 }, { x: 4, z: 7 }, { x: 4, z: 10 }, { x: 0, z: 10 }] },
            psets: {},
        };
        const shallowGraph = graphOf([extWall, shallow], [{ kind: 'BOUNDS', from: 'W', to: 'S' }]);
        const deepGraph = graphOf([extWall, deep], [{ kind: 'BOUNDS', from: 'W', to: 'D' }]);
        const m = metricsOf({ S: 1 });
        const m2 = metricsOf({ D: 1 });
        const shallowScore = computeObjectives(shallowGraph, m, emptyBubble).daylight;
        const deepScore = computeObjectives(deepGraph, m2, emptyBubble).daylight;
        // Both score the same: each room fronts the façade ⇒ ratio = 1.
        expect(shallowScore).toBe(deepScore);
        expect(shallowScore).toBe(1);
    });
});
