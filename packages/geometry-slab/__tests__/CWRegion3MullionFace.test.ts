/**
 * §FEAT-REGION-CURTAIN-WALL-ATTRIBUTED (L-1182) · C87 CW-Region-3
 *
 * ⭐ THE FOUNDER'S DECISION, 2026-08-19: **"to the mullion always."**
 *
 * A curtain wall's face for region resolution is the MULLION face — `mullionSize`
 * (0.08 default), the frame's outer envelope — NEVER `panelThickness` (0.02, the
 * glazing line). The two differ by 4x, and C87 CW-Region-3 says why that matters:
 *
 *   "A floor plate that stops at the glass and one that stops at the mullion are
 *    not the same drawing, and picking silently is the [confident-register-rows]
 *    shape."
 *
 * That is why CW-Region-3 BLOCKED this arm until the founder answered, and why the
 * central assertion here is not merely "0.04 landed" but "0.01 did NOT". A test
 * that only checks the right number cannot tell a correct implementation from one
 * that reads the wrong field and happens to agree.
 *
 * ── WHAT WAS ANONYMOUS, AND WHY ───────────────────────────────────────────────
 * L-1125 contributed curtain-wall spines to the region edge set WITHOUT an id. That
 * was correct at the time: `HostReferenceEdge.hostType` could only say `'wall'`, so
 * an attributed curtain-wall edge would have sent `WallFaceResolver` to the WALL
 * store, missed, degraded to its authoring-time fallback, and reported `preserved`
 * while following nothing (C79 §5.2.1). An anonymous edge that is COUNTED beats an
 * attributed edge that lies. These tests pin the upgrade AND that honest fallback.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { WallFaceResolver } from '../src/WallFaceResolver';
import { assembleRegionBoundary } from '../src/RegionBoundarySources';
import { wallsToAttributedSegments, traceRegionSketchAtPoint } from '../src/SlabRegionTracer';
import type { HostReferenceEdge } from '../src/SketchTypes';

const MULLION = 0.08;        // CreateCurtainWallCommand.ts:162 — the real default
const PANEL_THICKNESS = 0.02; // the glazing line — MUST NOT be the region face

/** A curtain wall along +X, so the face normal is ±Z and the offset reads directly. */
const CW = {
    id: 'cw-1',
    baseLine: [{ x: 0, y: 0, z: 0 }, { x: 6, y: 0, z: 0 }],
    mullionSize: MULLION,
    panelThickness: PANEL_THICKNESS,
};

function withCurtainWallStore(record: unknown) {
    (globalThis as any).window = (globalThis as any).window ?? {};
    (window as any).curtainWallStore = { getById: (id: string) => (id === 'cw-1' ? record : undefined) };
}

function edge(reference: HostReferenceEdge['reference']): HostReferenceEdge {
    return {
        type: 'hostReference',
        hostId: 'cw-1',
        hostType: 'curtain-wall',
        reference,
        offset: 0,
    };
}

afterEach(() => {
    if ((globalThis as any).window) {
        delete (window as any).curtainWallStore;
        delete (window as any).wallStore;
    }
});

describe('C87 CW-Region-3 — a curtain wall\'s region face is the MULLION, always', () => {
    it('⭐ exteriorFace resolves at mullionSize/2 — and NOT at panelThickness/2', () => {
        withCurtainWallStore(CW);
        const seg = WallFaceResolver.resolve(edge('exteriorFace'));

        expect(seg).not.toBeNull();
        // Baseline runs +X, so the right-hand normal is +Z: offset = +mullionSize/2.
        expect(Math.abs(seg!.start.y)).toBeCloseTo(MULLION / 2, 9);   // 0.04
        expect(Math.abs(seg!.end.y)).toBeCloseTo(MULLION / 2, 9);

        // ⛔ THE INVERSE, PINNED. C87 CW-Region-3 forbids panelThickness from
        // entering region resolution at all. Without this the test would pass for
        // an implementation that read the wrong field and got lucky.
        expect(Math.abs(seg!.start.y)).not.toBeCloseTo(PANEL_THICKNESS / 2, 4); // not 0.01
    });

    it('interiorFace mirrors it, and centerLine is the baseline itself', () => {
        withCurtainWallStore(CW);
        const ext = WallFaceResolver.resolve(edge('exteriorFace'))!;
        const int = WallFaceResolver.resolve(edge('interiorFace'))!;
        const mid = WallFaceResolver.resolve(edge('centerLine'))!;

        expect(int.start.y).toBeCloseTo(-ext.start.y, 9);
        expect(mid.start.y).toBeCloseTo(0, 9);
        // The full frame depth between the two faces is exactly one mullion.
        expect(Math.abs(ext.start.y - int.start.y)).toBeCloseTo(MULLION, 9);
    });

    it('coreExterior / coreInterior mirror exterior / interior — WallFaceResolver\'s own stated simplification', () => {
        withCurtainWallStore(CW);
        const ext = WallFaceResolver.resolve(edge('exteriorFace'))!;
        const int = WallFaceResolver.resolve(edge('interiorFace'))!;
        const coreExt = WallFaceResolver.resolve(edge('coreExterior'))!;
        const coreInt = WallFaceResolver.resolve(edge('coreInterior'))!;

        expect(coreExt.start.y).toBeCloseTo(ext.start.y, 9);
        expect(coreInt.start.y).toBeCloseTo(int.start.y, 9);
    });

    it('a record predating `mullionSize` falls back to the 0.08 the command mints — never to panelThickness', () => {
        withCurtainWallStore({ ...CW, mullionSize: undefined });
        const seg = WallFaceResolver.resolve(edge('exteriorFace'))!;
        expect(Math.abs(seg.start.y)).toBeCloseTo(0.08 / 2, 9);
        expect(Math.abs(seg.start.y)).not.toBeCloseTo(PANEL_THICKNESS / 2, 4);
    });

    it('the host kind picks the STORE — a curtain-wall edge never reads the wall store', () => {
        // A wall store that would answer for this id, and MUST NOT be consulted.
        (globalThis as any).window = (globalThis as any).window ?? {};
        (window as any).wallStore = {
            getById: () => ({ baseLine: [{ x: 0, z: 50 }, { x: 6, z: 50 }], thickness: 1.0 }),
        };
        withCurtainWallStore(CW);

        const seg = WallFaceResolver.resolve(edge('centerLine'))!;
        // z=0 (the curtain wall), not z=50 (the impostor wall).
        expect(seg.start.y).toBeCloseTo(0, 9);
        expect(seg.start.y).not.toBeCloseTo(50, 1);
    });

    it('an UNRESOLVABLE curtain wall degrades honestly, and names the curtain-wall store', () => {
        (globalThis as any).window = (globalThis as any).window ?? {};
        (window as any).curtainWallStore = undefined;
        const res = WallFaceResolver.resolveWithProvenance(edge('exteriorFace'));

        expect(res.source).toBe('unresolvable');
        expect(res.reason).toBe('ENGINE_NOT_AVAILABLE');
        // The diagnosis must name the store that was actually missing.
        expect(res.subReason).toContain('curtain-wall store');
    });
});

describe('C87 CW-Region-3 — the region assembler ATTRIBUTES the curtain wall (L-1125 upgrade)', () => {
    it('a curtain-wall spine is contributed WITH its id and kind, so the slab can follow it', () => {
        const set = assembleRegionBoundary({ curtainWalls: [CW] });

        expect(set.counts.curtainWallEdges).toBe(1);
        const seg = set.segments.find(s => (s as any).hostType === 'curtain-wall');
        expect(seg).toBeDefined();
        expect((seg as any).id).toBe('cw-1');
    });

    it('the kind survives into the ATTRIBUTED segment the tracer builds', () => {
        const set = assembleRegionBoundary({ curtainWalls: [CW] });
        const attributed = wallsToAttributedSegments(set.segments);
        const cw = attributed.find(a => a.hostId === 'cw-1');

        expect(cw).toBeDefined();
        expect(cw!.hostType).toBe('curtain-wall');
    });

    it('a curtain wall with NO id stays anonymous and is still COUNTED — L-1125\'s honest degradation', () => {
        const set = assembleRegionBoundary({ curtainWalls: [{ baseLine: CW.baseLine }] });

        expect(set.counts.curtainWallEdges).toBe(1);
        const attributed = wallsToAttributedSegments(set.segments);
        // No id ⇒ no host of any kind; it becomes a FreeLineEdge downstream.
        expect(attributed.every(a => a.hostId === null)).toBe(true);
    });

    it('a plain WALL is untouched — it still resolves as `wall`, with no kind invented for it', () => {
        const attributed = wallsToAttributedSegments([
            { id: 'w-1', baseLine: [{ x: 0, z: 0 }, { x: 4, z: 0 }] },
        ]);
        expect(attributed[0]!.hostId).toBe('w-1');
        expect(attributed[0]!.hostType).toBe('wall');
    });
});

describe('§CW90 item 3 — a rectangle of FOUR curtain walls yields a traceable region', () => {
    // The founder's acceptance case, pinned end-to-end at the assembler+tracer seam:
    // four curtain walls (no plain wall anywhere) enclose a 6x4 plate; a click inside
    // must trace ONE region whose every edge FOLLOWS its curtain-wall host.
    const RECT_CWS = [
        { id: 'cw-a', baseLine: [{ x: 0, y: 0, z: 0 }, { x: 6, y: 0, z: 0 }] },
        { id: 'cw-b', baseLine: [{ x: 6, y: 0, z: 0 }, { x: 6, y: 0, z: 4 }] },
        { id: 'cw-c', baseLine: [{ x: 6, y: 0, z: 4 }, { x: 0, y: 0, z: 4 }] },
        { id: 'cw-d', baseLine: [{ x: 0, y: 0, z: 4 }, { x: 0, y: 0, z: 0 }] },
    ];

    it('⭐ traces a closed region from curtain walls ALONE — no plain wall in the edge set', () => {
        const set = assembleRegionBoundary({ curtainWalls: RECT_CWS });
        expect(set.counts.curtainWallEdges).toBe(4);
        expect(set.counts.walls).toBe(0);

        const res = traceRegionSketchAtPoint(set.segments, 3, 2);
        expect(res).not.toBeNull();
        expect(res!.ring.length).toBeGreaterThanOrEqual(4);

        // Every traced edge is a hostReference edge carrying the curtain-wall KIND,
        // so the plate FOLLOWS the glazing (C87 CW-Region-3) instead of freezing.
        const hostEdges = res!.sketch.outerLoop.edges.filter(
            (e: any) => e.type === 'hostReference' && e.hostType === 'curtain-wall',
        );
        expect(hostEdges.length).toBe(4);
        const hostIds = hostEdges.map((e: any) => e.hostId).sort();
        expect(hostIds).toEqual(['cw-a', 'cw-b', 'cw-c', 'cw-d']);
    });

    it('a MIXED rectangle (2 walls + 2 curtain walls) traces, each edge naming its own kind', () => {
        const set = assembleRegionBoundary({
            walls: [
                { id: 'w-1', baseLine: [{ x: 0, z: 0 }, { x: 6, z: 0 }] },
                { id: 'w-2', baseLine: [{ x: 6, z: 4 }, { x: 0, z: 4 }] },
            ],
            curtainWalls: [
                { id: 'cw-e', baseLine: [{ x: 6, y: 0, z: 0 }, { x: 6, y: 0, z: 4 }] },
                { id: 'cw-f', baseLine: [{ x: 0, y: 0, z: 4 }, { x: 0, y: 0, z: 0 }] },
            ],
        });
        const res = traceRegionSketchAtPoint(set.segments, 3, 2);
        expect(res).not.toBeNull();

        const kinds = res!.sketch.outerLoop.edges
            .filter((e: any) => e.type === 'hostReference')
            .map((e: any) => `${e.hostType}:${e.hostId}`)
            .sort();
        expect(kinds).toEqual(['curtain-wall:cw-e', 'curtain-wall:cw-f', 'wall:w-1', 'wall:w-2']);
    });

    it('a click OUTSIDE the curtain-wall rectangle refuses (null), not a phantom region', () => {
        const set = assembleRegionBoundary({ curtainWalls: RECT_CWS });
        expect(traceRegionSketchAtPoint(set.segments, 50, 50)).toBeNull();
    });
});
