// TGL P6 — Space Syntax tests.
// Contract (SPEC §7): depths finite + monotone from entry; MD/RA match
// hand-computed values on a fixture; disconnected graph → flagged (not NaN).

import { describe, expect, it } from 'vitest';
import { computeSpaceSyntax } from '../src/workflows/apartmentLayout/tgl/spaceSyntax.js';
import { buildSemanticGraph, type GraphEdge, type GraphNode, type LayoutGraph } from '../src/workflows/apartmentLayout/tgl/semanticGraph.js';
import { buildWallsAndDoors } from '../src/workflows/apartmentLayout/tgl/wallsAndDoors.js';
import { subdivide } from '../src/workflows/apartmentLayout/tgl/subdivide.js';
import { buildBubbleGraph } from '../src/workflows/apartmentLayout/tgl/bubbleGraph.js';
import { decomposeToRects, type Pt } from '../src/workflows/apartmentLayout/tgl/rectDecomposition.js';
import type { ApartmentProgram } from '../src/workflows/apartmentLayout/types.js';

const space = (guid: string): GraphNode => ({ guid, kind: 'Space', sourceId: guid, attrs: {}, psets: {} });
const open = (a: string, b: string): GraphEdge => ({ kind: 'ADJACENT_TO', from: a, to: b, props: { boundary: 'open', permeable: true } });
const graphOf = (nodes: GraphNode[], edges: GraphEdge[]): LayoutGraph =>
    ({ nodes, edges, meta: { shellAreaM2: 0, levelId: 'L', seed: 's' } });

describe('computeSpaceSyntax (TGL P6)', () => {
    it('matches hand-computed depth/MD/RA/integration on a 4-space path', () => {
        // path: s0 — s1 — s2 — s3, rooted at s0.
        const g = graphOf(['s0', 's1', 's2', 's3'].map(space), [open('s0', 's1'), open('s1', 's2'), open('s2', 's3')]);
        const m = computeSpaceSyntax(g, 's0');
        expect(m.perSpaceDepth).toEqual({ s0: 0, s1: 1, s2: 2, s3: 3 });
        expect(m.meanDepth).toBeCloseTo(2, 6);                 // (1+2+3)/3
        expect(m.relativeAsymmetry).toBeCloseTo(1, 6);         // 2(2-1)/(4-2)
        expect(m.connected).toBe(true);
        // D_4 = 1/3 ⇒ integration(s0) = D_4/RA = 1/3
        expect(m.integration.s0).toBeCloseTo(1 / 3, 4);
        // the middle of a path is more integrated than its end
        expect(m.integration.s1!).toBeGreaterThan(m.integration.s0!);
    });

    it('depth is monotone (neighbours differ by exactly 1) from the entry', () => {
        const g = graphOf(['s0', 's1', 's2', 's3'].map(space), [open('s0', 's1'), open('s1', 's2'), open('s2', 's3')]);
        const m = computeSpaceSyntax(g, 's0');
        for (const e of g.edges) {
            const da = m.perSpaceDepth[e.from]!, db = m.perSpaceDepth[e.to]!;
            expect(Math.abs(da - db)).toBe(1);
        }
    });

    it('flags a disconnected graph (Infinity depths) without producing NaN', () => {
        // two components: s0—s1 and s2—s3 (no link between).
        const g = graphOf(['s0', 's1', 's2', 's3'].map(space), [open('s0', 's1'), open('s2', 's3')]);
        const m = computeSpaceSyntax(g, 's0');
        expect(m.connected).toBe(false);
        expect(m.perSpaceDepth.s2).toBe(Infinity);
        expect(Number.isNaN(m.meanDepth)).toBe(false);
        for (const v of Object.values(m.integration)) expect(Number.isNaN(v)).toBe(false);
    });

    it('handles trivial graphs (0 and 1 spaces) without crashing', () => {
        expect(computeSpaceSyntax(graphOf([], []), null).n).toBe(0);
        const one = computeSpaceSyntax(graphOf([space('only')], []), 'only');
        expect(one.meanDepth).toBe(0);
        expect(Number.isNaN(one.relativeAsymmetry)).toBe(false);
    });

    it('runs on the real pipeline graph: n matches space count, no NaN, deterministic', () => {
        const program: ApartmentProgram = {
            bedrooms: 2, bathrooms: 1, masterEnSuite: true,
            openPlanKitchenDining: true, livingRoom: true, entranceHall: true,
        };
        const poly: Pt[] = [{ x: 0, z: 0 }, { x: 12, z: 0 }, { x: 12, z: 10 }, { x: 0, z: 10 }];
        const shell = decomposeToRects(poly);
        const bubble = buildBubbleGraph(program, 120);
        const placements = subdivide(shell, bubble);
        const { segments, openings } = buildWallsAndDoors(placements, bubble);
        const lg = buildSemanticGraph(placements, segments, openings, bubble, { levelId: 'L1', seed: 'seed', shellAreaM2: 120 });
        const entryGuid = lg.nodes.find(n => n.kind === 'Space' && n.sourceId === bubble.entryId)!.guid;

        const m1 = computeSpaceSyntax(lg, entryGuid);
        expect(m1.n).toBe(lg.nodes.filter(n => n.kind === 'Space').length);
        for (const v of Object.values(m1.integration)) expect(Number.isNaN(v)).toBe(false);
        const m2 = computeSpaceSyntax(lg, entryGuid);
        expect(JSON.stringify(m1)).toEqual(JSON.stringify(m2));
    });
});
