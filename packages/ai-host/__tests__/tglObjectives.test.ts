// TGL P7 — objective vector tests.
// Contract (SPEC §7): each axis ∈ [0,1]; a known-good layout outscores a
// known-bad one on the targeted axis.

import { describe, expect, it } from 'vitest';
import { computeObjectives, OBJECTIVE_AXES, scoreFacadeAlignment, measureCorridorInterior, measureCorridorAccess } from '../src/workflows/apartmentLayout/tgl/objectives.js';
import { buildSemanticGraph, type GraphEdge, type GraphNode, type LayoutGraph, type Primitive } from '../src/workflows/apartmentLayout/tgl/semanticGraph.js';
import { computeSpaceSyntax, type SyntaxMetrics } from '../src/workflows/apartmentLayout/tgl/spaceSyntax.js';
import { buildWallsAndDoors } from '../src/workflows/apartmentLayout/tgl/wallsAndDoors.js';
import { subdivide } from '../src/workflows/apartmentLayout/tgl/subdivide.js';
import { buildBubbleGraph, type BubbleGraph } from '../src/workflows/apartmentLayout/tgl/bubbleGraph.js';
import { computeFacadeValueField } from '../src/workflows/apartmentLayout/environment/facadeValueField.js';
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

    // §A.21.D55 — DAYLIGHT IN EVERY ROOM. The `daylightReach` axis rewards a layout
    // that gives MORE windowable rooms (habitable AND wet) exterior frontage so each
    // CAN host a window — the founder's "maximise daylight, a window in every room".
    describe('§A.21.D55 daylightReach', () => {
        it('appears in OBJECTIVE_AXES so Pareto + weighted sums see it', () => {
            expect(OBJECTIVE_AXES).toContain('daylightReach');
        });

        it('a layout fronting MORE rooms on the façade outscores one that buries them', () => {
            const extWall: GraphNode = { guid: 'W', kind: 'Wall', sourceId: 'w', attrs: { isExternal: true }, psets: {} };
            const bed = (): GraphNode => space('Bed', { spaceType: 'bedroom', netAreaM2: 14, isPrivate: true, needsWindow: true });
            const bath = (): GraphNode => space('Bath', { spaceType: 'bathroom', netAreaM2: 5, isPrivate: true, needsWindow: false });
            // GOOD: both the bedroom AND the (wet) bathroom front the façade.
            const good = graphOf([extWall, bed(), bath()],
                [{ kind: 'BOUNDS', from: 'W', to: 'Bed' }, { kind: 'BOUNDS', from: 'W', to: 'Bath' }]);
            // BAD: only the bedroom fronts the façade; the bathroom is buried interior.
            const bad = graphOf([extWall, bed(), bath()],
                [{ kind: 'BOUNDS', from: 'W', to: 'Bed' }]);
            const m = metricsOf({ Bed: 2, Bath: 2 });
            const gv = computeObjectives(good, m, emptyBubble);
            const bv = computeObjectives(bad, m, emptyBubble);
            expect(gv.daylightReach).toBeGreaterThan(bv.daylightReach);
            // The wet room is OUTSIDE the area-weighted `daylight` set (needsWindow=false),
            // so daylightReach is exactly the axis that distinguishes these two layouts.
            expect(gv.daylightReach).toBe(1);
            expect(bv.daylightReach).toBeCloseTo(0.5, 6);
        });

        it('neutral 1.0 (rank-invisible) when there are no external walls — baseline safe', () => {
            const bed = space('Bed', { spaceType: 'bedroom', netAreaM2: 14, isPrivate: true, needsWindow: true });
            const g = graphOf([bed], []);   // no Wall nodes at all
            const v = computeObjectives(g, metricsOf({ Bed: 1 }), emptyBubble);
            expect(v.daylightReach).toBe(1);
        });
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

        it('hall with zero CONNECTS_THROUGH neighbours → 0.3 (blind entry, graph-distance fallback)', () => {
            // §L2-β-2b (2026-05-30): without polygons the engine falls back
            // to graph-distance counting; with NO edges the visible-count is
            // 0 → 0.3. (The raycast path requires polygons for ALL spaces;
            // the production D-TGL pipeline always populates them.)
            const g = graphOf([
                { ...space('H', { spaceType: 'hall', netAreaM2: 4, isPrivate: false, needsWindow: false }), geometry: {} },
                { ...space('L', { spaceType: 'living', netAreaM2: 25, isPrivate: false, needsWindow: true }), geometry: {} },
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

    // §L2-β-3 (2026-05-30) — arrivalSequence: compression-release ratio
    // (largest visible-from-entry area / entry area). Reuses the
    // entrySightline visible-set logic.
    describe('§L2-β-3 arrivalSequence', () => {
        it('small hall releasing into large living (4×) → 1.0 ideal', () => {
            const g = graphOf([
                space('H', { spaceType: 'hall', netAreaM2: 6, isPrivate: false, needsWindow: false }),
                space('L', { spaceType: 'living', netAreaM2: 24, isPrivate: false, needsWindow: true }),
            ], [
                { kind: 'CONNECTS_THROUGH', from: 'H', to: 'L', via: 'a' },
            ]);
            const v = computeObjectives(g, metricsOf({ H: 0, L: 1 }), emptyBubble);
            // ratio = 24 / 6 = 4 → score 1.0
            expect(v.arrivalSequence).toBe(1);
        });

        it('mild release (2×) → 0.5', () => {
            const g = graphOf([
                space('H', { spaceType: 'hall', netAreaM2: 10, isPrivate: false, needsWindow: false }),
                space('L', { spaceType: 'living', netAreaM2: 20, isPrivate: false, needsWindow: true }),
            ], [
                { kind: 'CONNECTS_THROUGH', from: 'H', to: 'L', via: 'a' },
            ]);
            const v = computeObjectives(g, metricsOf({ H: 0, L: 1 }), emptyBubble);
            expect(v.arrivalSequence).toBe(0.5);
        });

        it('no release — entry same size as reveal (1×) → 0.25', () => {
            const g = graphOf([
                space('H', { spaceType: 'hall', netAreaM2: 12, isPrivate: false, needsWindow: false }),
                space('L', { spaceType: 'living', netAreaM2: 12, isPrivate: false, needsWindow: true }),
            ], [
                { kind: 'CONNECTS_THROUGH', from: 'H', to: 'L', via: 'a' },
            ]);
            const v = computeObjectives(g, metricsOf({ H: 0, L: 1 }), emptyBubble);
            expect(v.arrivalSequence).toBe(0.25);
        });

        it('ANTI-PATTERN — entry bigger than reveal → 0', () => {
            const g = graphOf([
                space('H', { spaceType: 'hall', netAreaM2: 24, isPrivate: false, needsWindow: false }),  // huge hall
                space('L', { spaceType: 'living', netAreaM2: 6, isPrivate: false, needsWindow: true }),
            ], [
                { kind: 'CONNECTS_THROUGH', from: 'H', to: 'L', via: 'a' },
            ]);
            const v = computeObjectives(g, metricsOf({ H: 0, L: 1 }), emptyBubble);
            // ratio = 6/24 = 0.25 → score 0.0625
            expect(v.arrivalSequence).toBeLessThan(0.1);
        });

        it('picks the LARGEST visible space when multiple revealed', () => {
            const g = graphOf([
                space('H', { spaceType: 'hall', netAreaM2: 5, isPrivate: false, needsWindow: false }),
                space('L', { spaceType: 'living', netAreaM2: 25, isPrivate: false, needsWindow: true }),
                space('K', { spaceType: 'kitchen', netAreaM2: 10, isPrivate: false, needsWindow: true }),
            ], [
                { kind: 'CONNECTS_THROUGH', from: 'H', to: 'L', via: 'a' },
                { kind: 'CONNECTS_THROUGH', from: 'H', to: 'K', via: 'b' },
            ]);
            const v = computeObjectives(g, metricsOf({ H: 0, L: 1, K: 1 }), emptyBubble);
            // Largest visible = L (25 m²). Ratio = 25/5 = 5 → clamped to 1.
            expect(v.arrivalSequence).toBe(1);
        });

        it('no entry → neutral 1.0', () => {
            const g = graphOf([]);
            const v = computeObjectives(g, metricsOf({}), emptyBubble);
            expect(v.arrivalSequence).toBe(1);
        });
    });

    // §L4-δ-2 (2026-05-30) — wetStackAlignment: per-axis centroid variance
    // among wet rooms. Lower σ on the stack axis = better aligned.
    describe('§L4-δ-2 wetStackAlignment', () => {
        // Helper: room with a centroid at (cx, cz) and 2x2 m footprint.
        const wetRoom = (guid: string, type: string, cx: number, cz: number) => ({
            guid, kind: 'Space' as const, sourceId: guid,
            attrs: { spaceType: type, netAreaM2: 4 },
            geometry: { polygon: [
                { x: cx - 1, z: cz - 1 }, { x: cx + 1, z: cz - 1 },
                { x: cx + 1, z: cz + 1 }, { x: cx - 1, z: cz + 1 },
            ] },
            psets: {},
        });

        it('0 wet rooms → 1.0 (no stack to optimise)', () => {
            const g = graphOf([
                space('L', { spaceType: 'living', netAreaM2: 25, isPrivate: false, needsWindow: true }),
            ]);
            const v = computeObjectives(g, metricsOf({ L: 0 }), emptyBubble);
            expect(v.wetStackAlignment).toBe(1);
        });

        it('1 wet room → 1.0 (no pair to align)', () => {
            const g = graphOf([wetRoom('K', 'kitchen', 0, 0)]);
            const v = computeObjectives(g, metricsOf({ K: 0 }), emptyBubble);
            expect(v.wetStackAlignment).toBe(1);
        });

        it('2 wet rooms stacked on X axis (same X, different Z) → 1.0', () => {
            // Both centroids at x=0; z values differ → varX = 0 → σ_min = 0 → score 1.
            const g = graphOf([
                wetRoom('K', 'kitchen', 0, 0),
                wetRoom('B', 'bathroom', 0, 5),
            ]);
            const v = computeObjectives(g, metricsOf({ K: 0, B: 1 }), emptyBubble);
            expect(v.wetStackAlignment).toBe(1);
        });

        it('2 wet rooms scattered on both axes → score < 1', () => {
            // Centroids at (0,0) + (3, 3) — neither axis is collinear.
            const g = graphOf([
                wetRoom('K', 'kitchen', 0, 0),
                wetRoom('B', 'bathroom', 3, 3),
            ]);
            const v = computeObjectives(g, metricsOf({ K: 0, B: 1 }), emptyBubble);
            // σ_min on each axis = 1.5 → score = 1 - 1.5/2 = 0.25
            expect(v.wetStackAlignment).toBeCloseTo(0.25, 6);
        });

        it('3 wet rooms collinear on Z (same Z, different X) → 1.0', () => {
            const g = graphOf([
                wetRoom('K', 'kitchen', 0, 4),
                wetRoom('B', 'bathroom', 3, 4),
                wetRoom('W', 'wc', 6, 4),
            ]);
            const v = computeObjectives(g, metricsOf({ K: 0, B: 1, W: 2 }), emptyBubble);
            expect(v.wetStackAlignment).toBe(1);
        });

        it('far-scattered wet rooms (σ_min ≥ 2m) → 0', () => {
            const g = graphOf([
                wetRoom('K', 'kitchen', 0, 0),
                wetRoom('B', 'bathroom', 6, 6),
            ]);
            const v = computeObjectives(g, metricsOf({ K: 0, B: 1 }), emptyBubble);
            // σ_min on each axis = 3 → score = 1 - 3/2 = -0.5 → clamp 0
            expect(v.wetStackAlignment).toBe(0);
        });
    });

    // §L4-δ-1 (2026-05-30) — alignmentField: plan-wide shared axis-line
    // detection. Higher = more disciplined axis system.
    describe('§L4-δ-1 alignmentField', () => {
        // Helper: rectangular space with explicit polygon corners.
        const rect = (guid: string, x0: number, z0: number, x1: number, z1: number) => ({
            guid, kind: 'Space' as const, sourceId: guid,
            attrs: { spaceType: 'living', netAreaM2: (x1 - x0) * (z1 - z0) },
            geometry: { polygon: [
                { x: x0, z: z0 }, { x: x1, z: z0 },
                { x: x1, z: z1 }, { x: x0, z: z1 },
            ] },
            psets: {},
        });

        it('< 2 rooms → 1.0 (no axis system to evaluate)', () => {
            const g = graphOf([rect('A', 0, 0, 4, 3)]);
            const v = computeObjectives(g, metricsOf({ A: 0 }), emptyBubble);
            expect(v.alignmentField).toBe(1);
        });

        it('two rooms side-by-side: inner X-edges + matching Z-edges align → 0.75', () => {
            // Two rooms side-by-side (0..4) + (4..8) at z=0..3.
            // X edges: 0, 4, 4, 8 — the two 4s share; 0 + 8 distinct (2 of 4 shared).
            // Z edges: 0, 3, 0, 3 — all 4 share (z=0 twice + z=3 twice).
            // shared = 2 + 4 = 6; total = 8 → 0.75.
            const g = graphOf([
                rect('A', 0, 0, 4, 3),
                rect('B', 4, 0, 8, 3),
            ]);
            const v = computeObjectives(g, metricsOf({ A: 0, B: 1 }), emptyBubble);
            expect(v.alignmentField).toBeCloseTo(0.75, 6);
        });

        it('four-quadrant grid (every edge shared) → 1.0 (full discipline)', () => {
            // 2x2 grid of identical rooms — every X edge appears in two rooms,
            // every Z edge appears in two rooms. Total alignment.
            const g = graphOf([
                rect('A', 0, 0, 4, 3),
                rect('B', 4, 0, 8, 3),
                rect('C', 0, 3, 4, 6),
                rect('D', 4, 3, 8, 6),
            ]);
            const v = computeObjectives(g, metricsOf({ A: 0, B: 1, C: 1, D: 2 }), emptyBubble);
            expect(v.alignmentField).toBe(1);
        });

        it('two rooms with NO edge alignment → 0', () => {
            // Two rooms with all 8 edges at distinct offsets > 50 mm apart.
            const g = graphOf([
                rect('A', 0, 0, 1, 1),
                rect('B', 5, 5, 7, 8),
            ]);
            const v = computeObjectives(g, metricsOf({ A: 0, B: 1 }), emptyBubble);
            expect(v.alignmentField).toBe(0);
        });

        it('partial alignment scores between 0 and 1', () => {
            // Rooms share z=0 (bottom edge) but X edges all distinct.
            const g = graphOf([
                rect('A', 0, 0, 3, 2),
                rect('B', 5, 0, 7, 4),
            ]);
            const v = computeObjectives(g, metricsOf({ A: 0, B: 1 }), emptyBubble);
            // z=0 appears twice in zEdges → 2 shared.
            // Other z edges: A.z1=2, B.z1=4 distinct.
            // X edges: 0, 3, 5, 7 all distinct.
            // shared = 2; total = 8 → score = 0.25
            expect(v.alignmentField).toBeCloseTo(0.25, 6);
        });

        it('tolerant within 50 mm — near-aligned edges count as shared', () => {
            // Two rooms whose right edges sit at x=4.0 and x=4.04 (40 mm apart).
            const g = graphOf([
                rect('A', 0, 0, 4.00, 3),
                rect('B', 0, 4, 4.04, 7),
            ]);
            const v = computeObjectives(g, metricsOf({ A: 0, B: 1 }), emptyBubble);
            // Left edges both at 0 → 2 shared. Right edges 4.00, 4.04 within 50 mm → 2 shared.
            // z=0, 3, 4, 7 distinct.
            // shared = 4; total = 8 → score = 0.5
            expect(v.alignmentField).toBeCloseTo(0.5, 6);
        });
    });

    // §L1-α-4 (2026-05-31) — facadeAlignment: habitable rooms anchored on
    // high-value shell edges. Uses bubble.facadeField (L1-α-1) when present;
    // falls back to a degraded "fraction of habitable rooms touching the
    // façade" proxy otherwise.
    describe('§L1-α-4 facadeAlignment', () => {
        // Helpers shared by the slice.
        const extWall = (guid: string, a: Pt, b: Pt): GraphNode => ({
            guid, kind: 'Wall', sourceId: guid,
            attrs: { isExternal: true },
            geometry: { baseLine: [a, b] },
            psets: {},
        });
        const room = (guid: string, type: string, needsWindow: boolean, x0: number, z0: number, x1: number, z1: number): GraphNode => ({
            guid, kind: 'Space', sourceId: guid,
            attrs: { spaceType: type, netAreaM2: (x1 - x0) * (z1 - z0), isPrivate: false, needsWindow },
            geometry: { polygon: [{ x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 }] },
            psets: {},
        });
        // 12 × 10 shell, south façade at z = 0.
        const SHELL: Pt[] = [{ x: 0, z: 0 }, { x: 12, z: 0 }, { x: 12, z: 10 }, { x: 0, z: 10 }];
        const FIELD = computeFacadeValueField(SHELL);
        const bubbleWithField: BubbleGraph = { rooms: [], edges: [], corridorId: null, entryId: null, facadeField: FIELD };

        it('empty plan (no spaces) → 0', () => {
            const g = graphOf([]);
            expect(scoreFacadeAlignment(g, bubbleWithField)).toBe(0);
        });

        it('no habitable spaces (all corridors / bathrooms) → 0', () => {
            const g = graphOf([
                room('C', 'corridor', false, 0, 0, 4, 2),
                room('B', 'bathroom', false, 4, 0, 7, 2),
            ]);
            expect(scoreFacadeAlignment(g, bubbleWithField)).toBe(0);
        });

        it('all-interior plan (no façade-touching habitable room) → 0', () => {
            // Bedroom polygon NOT touching any external wall edge — but more
            // importantly, no BOUNDS edge to an external wall in the graph.
            const g = graphOf([
                room('B', 'bedroom', true, 3, 3, 7, 6),
            ]);
            expect(scoreFacadeAlignment(g, bubbleWithField)).toBe(0);
        });

        it('single habitable room on the SOUTH (best) edge → near 1.0', () => {
            // Living room rect (0..12, 0..4); south wall baseLine (0,0)→(12,0)
            // sits ON the south shell edge (sunlight 1.0, corner-exposure
            // pushes overallValue ≈ 1.0).
            const g = graphOf([
                extWall('W', { x: 0, z: 0 }, { x: 12, z: 0 }),
                room('L', 'living', true, 0, 0, 12, 4),
            ], [{ kind: 'BOUNDS', from: 'W', to: 'L' }]);
            const s = scoreFacadeAlignment(g, bubbleWithField);
            // South facade overallValue ≈ 0.6*1.0 + 0.4*0.5 ≈ 0.8 (right-angle
            // corner score 0.5 per end). Score = 1 * 0.8 / 1 = 0.8.
            expect(s).toBeGreaterThan(0.7);
        });

        it('single habitable room on the NORTH (poor) edge → low score', () => {
            // Bedroom rect (0..12, 6..10); north wall baseLine (12,10)→(0,10)
            // sits ON the north shell edge (sunlight 0.25 → overallValue ≈ 0.35).
            const g = graphOf([
                extWall('W', { x: 12, z: 10 }, { x: 0, z: 10 }),
                room('B', 'bedroom', true, 0, 6, 12, 10),
            ], [{ kind: 'BOUNDS', from: 'W', to: 'B' }]);
            const s = scoreFacadeAlignment(g, bubbleWithField);
            // North facade overallValue ≈ 0.6*0.25 + 0.4*0.5 ≈ 0.35.
            expect(s).toBeLessThan(0.45);
            expect(s).toBeGreaterThan(0.2);
        });

        it('south-anchored room outscores north-anchored room (orientation matters)', () => {
            const south = graphOf([
                extWall('W', { x: 0, z: 0 }, { x: 12, z: 0 }),
                room('L', 'living', true, 0, 0, 12, 4),
            ], [{ kind: 'BOUNDS', from: 'W', to: 'L' }]);
            const north = graphOf([
                extWall('W', { x: 12, z: 10 }, { x: 0, z: 10 }),
                room('B', 'bedroom', true, 0, 6, 12, 10),
            ], [{ kind: 'BOUNDS', from: 'W', to: 'B' }]);
            expect(scoreFacadeAlignment(south, bubbleWithField))
                .toBeGreaterThan(scoreFacadeAlignment(north, bubbleWithField));
        });

        it('non-habitable rooms (bathroom / corridor) are excluded from numerator', () => {
            // Bathroom (needsWindow=false) on the prime south façade should
            // NOT count — the axis only ranks HABITABLE-on-prime placements.
            const g = graphOf([
                extWall('W', { x: 0, z: 0 }, { x: 12, z: 0 }),
                room('Bath', 'bathroom', false, 0, 0, 4, 3),
                room('B', 'bedroom', true, 4, 6, 12, 10),    // no external wall touch
            ], [{ kind: 'BOUNDS', from: 'W', to: 'Bath' }]);
            // Bedroom is habitable but doesn't touch the facade → totalLen = 0 → 0.
            expect(scoreFacadeAlignment(g, bubbleWithField)).toBe(0);
        });

        it('no external walls in graph → 0', () => {
            const g = graphOf([
                room('L', 'living', true, 0, 0, 4, 4),
            ]);
            expect(scoreFacadeAlignment(g, bubbleWithField)).toBe(0);
        });

        it('back-compat: bubble without facadeField → degraded fraction-touching score', () => {
            const emptyB: BubbleGraph = { rooms: [], edges: [], corridorId: null, entryId: null };
            const g = graphOf([
                extWall('W', { x: 0, z: 0 }, { x: 12, z: 0 }),
                room('L', 'living', true, 0, 0, 6, 4),    // touches facade
                room('B', 'bedroom', true, 6, 6, 10, 10),  // does NOT touch
            ], [{ kind: 'BOUNDS', from: 'W', to: 'L' }]);
            // 1 of 2 habitable rooms touches → 0.5.
            expect(scoreFacadeAlignment(g, emptyB)).toBeCloseTo(0.5, 6);
        });

        it('axis surfaces on the full computeObjectives vector in [0, 1]', () => {
            const g = graphOf([
                extWall('W', { x: 0, z: 0 }, { x: 12, z: 0 }),
                room('L', 'living', true, 0, 0, 12, 4),
            ], [{ kind: 'BOUNDS', from: 'W', to: 'L' }]);
            const v = computeObjectives(g, metricsOf({ L: 0 }), bubbleWithField);
            expect(v.facadeAlignment).toBeGreaterThanOrEqual(0);
            expect(v.facadeAlignment).toBeLessThanOrEqual(1);
            expect(v.facadeAlignment).toBeGreaterThan(0.5);   // south-anchored → strong
        });

        it('appears in OBJECTIVE_AXES so Pareto + weighted sums see it', () => {
            expect(OBJECTIVE_AXES).toContain('facadeAlignment');
        });
    });

    // §A.21.D5 (2026-06-12, founder D5.b) — the two corridor-quality axes. A corridor
    // has no window requirement, so it should sit INTERIOR (off the façade) and every
    // private room should door DIRECTLY onto it (not be served through another room).
    describe('§A.21.D5 corridorInterior + corridorAccess', () => {
        // Helper: external wall with a baseLine of the given length on X.
        const extWall = (guid: string, x0: number, x1: number, z = 0, external = true): GraphNode => ({
            guid, kind: 'Wall', sourceId: guid,
            attrs: { isExternal: external },
            geometry: { baseLine: [{ x: x0, z }, { x: x1, z }] },
            psets: {},
        });

        it('both axes appear in OBJECTIVE_AXES so Pareto + weighted sums see them', () => {
            expect(OBJECTIVE_AXES).toContain('corridorInterior');
            expect(OBJECTIVE_AXES).toContain('corridorAccess');
        });

        it('neutral 1.0 (rank-invisible) when there is no corridor / hall', () => {
            const g = graphOf([
                space('L', { spaceType: 'living', netAreaM2: 25, isPrivate: false, needsWindow: true }),
                space('B', { spaceType: 'bedroom', netAreaM2: 15, isPrivate: true, needsWindow: true }),
            ]);
            const v = computeObjectives(g, metricsOf({ L: 0, B: 1 }), emptyBubble);
            expect(v.corridorInterior).toBe(1);
            expect(v.corridorAccess).toBe(1);
        });

        // ── corridorInterior: the founder repro. The OLD scorer was indifferent to
        //    WHERE the corridor sat; this axis prefers the interior-corridor candidate.
        it('REPRO: interior corridor outscores a façade-abutting corridor (corridorInterior)', () => {
            // FAÇADE candidate: the corridor is bounded by an EXTERNAL shell wall
            // (it steals exterior frontage from the rooms that need a window).
            const facade = graphOf([
                extWall('Wext', 0, 6, 0, true),                // shell wall, 6 m
                space('C', { spaceType: 'corridor', netAreaM2: 6, isPrivate: false, needsWindow: false }),
            ], [{ kind: 'BOUNDS', from: 'Wext', to: 'C' }]);
            // INTERIOR candidate: the corridor is bounded only by an INTERNAL wall
            // (it sits inside, leaving the façade for the habitable rooms).
            const interior = graphOf([
                extWall('Wint', 0, 6, 0, false),               // interior wall, 6 m
                space('C', { spaceType: 'corridor', netAreaM2: 6, isPrivate: false, needsWindow: false }),
            ], [{ kind: 'BOUNDS', from: 'Wint', to: 'C' }]);
            const m = metricsOf({ C: 1 });
            const fv = computeObjectives(facade, m, emptyBubble);
            const iv = computeObjectives(interior, m, emptyBubble);
            expect(iv.corridorInterior).toBeGreaterThan(fv.corridorInterior);
            expect(fv.corridorInterior).toBe(0);   // every corridor wall on the shell
            expect(iv.corridorInterior).toBe(1);   // no corridor wall on the shell
        });

        it('corridorInterior is fractional when the corridor partly abuts the shell', () => {
            // Corridor bounded by one 6 m external wall + one 6 m interior wall →
            // half its perimeter is on the shell → score 0.5.
            const g = graphOf([
                extWall('Wext', 0, 6, 0, true),
                extWall('Wint', 0, 6, 3, false),
                space('C', { spaceType: 'corridor', netAreaM2: 6, isPrivate: false, needsWindow: false }),
            ], [
                { kind: 'BOUNDS', from: 'Wext', to: 'C' },
                { kind: 'BOUNDS', from: 'Wint', to: 'C' },
            ]);
            const detail = measureCorridorInterior(g);
            expect(detail.corridorExtWallLenM).toBeCloseTo(6, 6);
            expect(detail.corridorWallLenM).toBeCloseTo(12, 6);
            expect(detail.score).toBeCloseTo(0.5, 6);
        });

        // ── corridorAccess: direct-corridor-access ranks above served-through.
        it('REPRO: every-private-room-doors-onto-corridor outscores a served-through layout (corridorAccess)', () => {
            const nodes = (): GraphNode[] => [
                space('C', { spaceType: 'corridor', netAreaM2: 6, isPrivate: false, needsWindow: false }),
                space('B1', { spaceType: 'bedroom', netAreaM2: 14, isPrivate: true, needsWindow: true }),
                space('B2', { spaceType: 'bedroom', netAreaM2: 12, isPrivate: true, needsWindow: true }),
            ];
            // CLEAN: both bedrooms door directly onto the corridor.
            const clean = graphOf(nodes(), [
                { kind: 'CONNECTS_THROUGH', from: 'C', to: 'B1', via: 'd1' },
                { kind: 'CONNECTS_THROUGH', from: 'C', to: 'B2', via: 'd2' },
            ]);
            // SERVED-THROUGH: B1 doors onto the corridor; B2 is reached THROUGH B1.
            const servedThrough = graphOf(nodes(), [
                { kind: 'CONNECTS_THROUGH', from: 'C', to: 'B1', via: 'd1' },
                { kind: 'CONNECTS_THROUGH', from: 'B1', to: 'B2', via: 'd2' },
            ]);
            const m = metricsOf({ C: 0, B1: 1, B2: 2 });
            const cv = computeObjectives(clean, m, emptyBubble);
            const sv = computeObjectives(servedThrough, m, emptyBubble);
            expect(cv.corridorAccess).toBeGreaterThan(sv.corridorAccess);
            expect(cv.corridorAccess).toBe(1);     // 2/2 direct
            expect(sv.corridorAccess).toBe(0.5);   // 1/2 direct (B2 served-through)
        });

        it('measureCorridorAccess reports the direct vs served-through split', () => {
            const g = graphOf([
                space('C', { spaceType: 'corridor', netAreaM2: 6, isPrivate: false, needsWindow: false }),
                space('B1', { spaceType: 'bedroom', netAreaM2: 14, isPrivate: true, needsWindow: true }),
                space('Ens', { spaceType: 'ensuite', netAreaM2: 4, isPrivate: true, needsWindow: false }),
            ], [
                { kind: 'CONNECTS_THROUGH', from: 'C', to: 'B1', via: 'd1' },
                { kind: 'CONNECTS_THROUGH', from: 'B1', to: 'Ens', via: 'd2' },   // ensuite via the bedroom
            ]);
            const d = measureCorridorAccess(g);
            expect(d.privateRooms).toBe(2);
            expect(d.directAccess).toBe(1);
            expect(d.servedThrough).toBe(1);
            // §CORRIDOR-CONNECTOR (founder #1, 2026-06-12) — the score is now PRIORITY-WEIGHTED:
            // the bedroom (weight 1.0) doors onto the corridor; the ensuite (weight 0.3, reached
            // via its master by design) does not. Score = wServed/wTotal = 1.0/(1.0+0.3) ≈ 0.769.
            // The high-priority bedroom IS directly served, so the layout rightly scores ABOVE the
            // old unweighted 1/2 — the ensuite's missing corridor door is expected, not a defect.
            expect(d.score).toBeCloseTo(1.0 / 1.3, 6);
        });

        it('every axis stays in [0, 1] on the real pipeline graph (with the two new axes)', () => {
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
            expect(v.corridorInterior).toBeGreaterThanOrEqual(0);
            expect(v.corridorInterior).toBeLessThanOrEqual(1);
            expect(v.corridorAccess).toBeGreaterThanOrEqual(0);
            expect(v.corridorAccess).toBeLessThanOrEqual(1);
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
