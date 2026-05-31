// L5-ε-1 — SightlineGraph (Cognition L5 Perceptual Simulation P1) pure tests.

import { describe, expect, it } from 'vitest';
import { buildSightlineGraph } from '../src/workflows/apartmentLayout/tgl/sightlineGraph.js';
import type { GraphEdge, GraphNode, LayoutGraph, Pt } from '../src/workflows/apartmentLayout/tgl/semanticGraph.js';

// ── Building blocks ────────────────────────────────────────────────────────

const space = (guid: string, polygon: ReadonlyArray<Pt>): GraphNode => ({
    guid, kind: 'Space', sourceId: guid,
    attrs: { spaceType: 'living', netAreaM2: 10 },
    geometry: { polygon },
    psets: {},
});
const wall = (guid: string, a: Pt, b: Pt): GraphNode => ({
    guid, kind: 'Wall', sourceId: guid,
    attrs: { thickness: 0.1, heightM: 2.7, isExternal: false },
    geometry: { baseLine: [a, b] },
    psets: {},
});
const opening = (guid: string, offsetM: number, widthM: number): GraphNode => ({
    guid, kind: 'Opening', sourceId: guid,
    attrs: { offsetM, widthM, heightM: 2.1, sillM: 0 },
    psets: {},
});
const hostedBy = (openGuid: string, wallGuid: string): GraphEdge =>
    ({ kind: 'HOSTED_BY', from: openGuid, to: wallGuid });

const graphOf = (nodes: GraphNode[], edges: GraphEdge[] = []): LayoutGraph => ({
    nodes,
    edges,
    // `meta` is required by the type but not consumed by buildSightlineGraph.
    meta: { shellAreaM2: 0, levelId: 'L0', seed: 't' },
} as unknown as LayoutGraph);

const rect = (x0: number, z0: number, x1: number, z1: number): Pt[] =>
    [{ x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 }];

// ── §1 — Two-room, no wall ─────────────────────────────────────────────────

describe('buildSightlineGraph — two-room no-wall', () => {
    it('returns the corner-to-corner diagonal as the longest sight', () => {
        // A spans x∈[0,4], z∈[0,4]; B spans x∈[4,8], z∈[0,4]. No wall in graph.
        const g = graphOf([
            space('A_space', rect(0, 0, 4, 4)),
            space('B_space', rect(4, 0, 8, 4)),
        ]);
        const sg = buildSightlineGraph(g);
        expect(sg.edges).toHaveLength(1);
        const e = sg.edges[0]!;
        // Longest corner-to-corner = (0,0)→(8,4) = √(64+16) = √80 ≈ 8.944.
        expect(e.lengthM).toBeCloseTo(Math.hypot(8, 4), 6);
        // Centroid-to-centroid (2,2)→(6,2) = 4 m — strictly less than the
        // corner-to-corner diagonal, which the sampler must beat.
        expect(e.lengthM).toBeGreaterThan(4);
    });
});

// ── §2 — Solid wall blocks sight ───────────────────────────────────────────

describe('buildSightlineGraph — solid wall blocks every sample', () => {
    it('returns lengthM === 0 when a solid wall separates the rooms', () => {
        // A: x∈[0,4], z∈[0,4]. B: x∈[5,9], z∈[0,4]. Wall at x=4.5, z∈[-5,9]
        // — extended past both rooms so corner-to-corner sights are blocked.
        const g = graphOf([
            space('A_space', rect(0, 0, 4, 4)),
            space('B_space', rect(5, 0, 9, 4)),
            wall('W1', { x: 4.5, z: -5 }, { x: 4.5, z: 9 }),
        ]);
        const sg = buildSightlineGraph(g);
        expect(sg.edges).toHaveLength(1);
        expect(sg.edges[0]!.lengthM).toBe(0);
        // Pair is still emitted — existence is informational.
        expect(sg.edges[0]!.a).toBe('A_space');
        expect(sg.edges[0]!.b).toBe('B_space');
    });
});

// ── §3 — Door opens the corner sightline ───────────────────────────────────

describe('buildSightlineGraph — door doesn\'t block corner-to-corner sight', () => {
    it('finds an unobstructed sight when a wide opening covers the crossing', () => {
        // Same shells as §2; wall length z∈[-5,9] = 14 m. Open a wide window
        // along its full middle (offset 0, width 14 → entire wall is opening).
        // Every sample-to-sample segment now crosses an OPENING, never a
        // closed wall section.
        const g = graphOf([
            space('A_space', rect(0, 0, 4, 4)),
            space('B_space', rect(5, 0, 9, 4)),
            wall('W1', { x: 4.5, z: -5 }, { x: 4.5, z: 9 }),
            opening('O1', 0, 14),
        ], [
            hostedBy('O1', 'W1'),
        ]);
        const sg = buildSightlineGraph(g);
        expect(sg.edges).toHaveLength(1);
        expect(sg.edges[0]!.lengthM).toBeGreaterThan(0);
        // Should reach close to the corner-to-corner diagonal (0,0)→(9,4).
        expect(sg.edges[0]!.lengthM).toBeCloseTo(Math.hypot(9, 4), 6);
    });
});

// ── §4 — Pair commutativity ────────────────────────────────────────────────

describe('buildSightlineGraph — pair commutativity', () => {
    it('emits exactly one edge per unordered pair (a < b lexicographically)', () => {
        const g = graphOf([
            space('Z_space', rect(0, 0, 4, 4)),
            space('A_space', rect(6, 0, 10, 4)),
        ]);
        const sg = buildSightlineGraph(g);
        expect(sg.edges).toHaveLength(1);
        const e = sg.edges[0]!;
        // Lexicographic ordering of guids: 'A_space' < 'Z_space'.
        expect(e.a).toBe('A_space');
        expect(e.b).toBe('Z_space');
    });

    it('length is symmetric across input order of spaces', () => {
        const g1 = graphOf([
            space('A', rect(0, 0, 4, 4)),
            space('B', rect(6, 0, 10, 4)),
        ]);
        const g2 = graphOf([
            space('B', rect(6, 0, 10, 4)),
            space('A', rect(0, 0, 4, 4)),
        ]);
        expect(buildSightlineGraph(g1).edges[0]!.lengthM)
            .toBeCloseTo(buildSightlineGraph(g2).edges[0]!.lengthM, 9);
    });
});

// ── §5 — Single-space graph + empty input ──────────────────────────────────

describe('buildSightlineGraph — degenerate input', () => {
    it('single-room graph returns no edges', () => {
        const g = graphOf([space('only', rect(0, 0, 4, 4))]);
        expect(buildSightlineGraph(g).edges).toEqual([]);
    });

    it('no spaces at all returns no edges', () => {
        expect(buildSightlineGraph(graphOf([])).edges).toEqual([]);
    });

    it('skips spaces with < 3 vertex polygons (degenerate)', () => {
        const g = graphOf([
            space('good', rect(0, 0, 4, 4)),
            // Two-vertex polygon — engine should ignore.
            space('bad', [{ x: 10, z: 10 }, { x: 11, z: 11 }]),
            // Empty polygon — engine should ignore.
            space('empty', []),
        ]);
        // Only one VALID space → no pairs → no edges.
        expect(buildSightlineGraph(g).edges).toEqual([]);
    });
});

// ── §6 — samplesPerEdge override ───────────────────────────────────────────

describe('buildSightlineGraph — samplesPerEdge override', () => {
    it('samplesPerEdge respects the cap (only corners when cap <= vertex count)', () => {
        // For a rectangle (4 vertices), samplesPerEdge in {1,2,3,4} all emit
        // exactly the 4 corners as the sample set (corners are always the
        // baseline — long-diagonal sights would otherwise be lost). samples
        // >= 5 starts adding edge midpoints, which can only equal or exceed
        // the all-corners longest sight.
        const g = graphOf([
            space('A', rect(0, 0, 4, 4)),
            space('B', rect(6, 0, 10, 4)),
        ]);
        const s1 = buildSightlineGraph(g, { samplesPerEdge: 1 }).edges[0]!.lengthM;
        const s4 = buildSightlineGraph(g, { samplesPerEdge: 4 }).edges[0]!.lengthM;
        // samples 1..4 all collapse to the corner set → identical answer.
        expect(s1).toBeCloseTo(s4, 9);
        // The longest unobstructed corner-to-corner sight is (0,0)→(10,4).
        expect(s4).toBeCloseTo(Math.hypot(10, 4), 6);
    });

    it('samplesPerEdge above vertex count adds edge midpoints (>= corner result)', () => {
        const g = graphOf([
            space('A', rect(0, 0, 4, 4)),
            space('B', rect(6, 0, 10, 4)),
        ]);
        const small = buildSightlineGraph(g, { samplesPerEdge: 4 }).edges[0]!.lengthM;
        const big   = buildSightlineGraph(g, { samplesPerEdge: 8 }).edges[0]!.lengthM;
        // More samples can only equal or improve the longest unobstructed sight.
        expect(big).toBeGreaterThanOrEqual(small);
    });
});

// ── §7 — Deterministic edge ordering ───────────────────────────────────────

describe('buildSightlineGraph — deterministic edge ordering (snapshot-stable)', () => {
    it('emits edges in lexicographic (a, b) order regardless of node order', () => {
        const g = graphOf([
            space('C', rect(0, 0, 2, 2)),
            space('A', rect(10, 0, 12, 2)),
            space('B', rect(20, 0, 22, 2)),
        ]);
        const sg = buildSightlineGraph(g);
        // 3 spaces → C(3,2) = 3 pairs, sorted (A,B), (A,C), (B,C).
        expect(sg.edges.map(e => `${e.a}|${e.b}`)).toEqual([
            'A|B', 'A|C', 'B|C',
        ]);
    });

    it('two builds of the same graph produce identical output (snapshot-stable)', () => {
        const g = graphOf([
            space('room1', rect(0, 0, 4, 4)),
            space('room2', rect(5, 0, 9, 4)),
            space('room3', rect(0, 5, 4, 9)),
        ]);
        const first  = buildSightlineGraph(g);
        const second = buildSightlineGraph(g);
        expect(second).toEqual(first);
    });
});
