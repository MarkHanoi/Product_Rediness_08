// §ENVELOPE-DRAW-LIVE-DIMS (L-13308) — the live dimension chips of the envelope perimeter draw.
//
// The founder: *"while defining the points that define the profile of the massing envelope - i want
// to see the preview dims - as we have while creating slabs + walls on pryzm views"*.
//
// ⭐ WHAT THIS SUITE PINS, AND WHY EACH ARM GOES RED IF THE FIX IS REVERTED
//   1. FORMATTER PARITY with the slab + wall tools. Their shared live widget is `DimensionPreview`
//      (`${distance.toFixed(3)} m`); the chip text is `formatDimension(d, 'm')`, the canonical
//      annotation formatter, which is that string byte for byte. A drift on EITHER side fails here.
//   2. THE REAL DRIVER hands every preview its chips. The surface below is a fake of the PORT — it
//      converts nothing — and the arms read the `dims` argument `armEnvelopeDraw`'s gesture passed.
//      Before this lane the driver called `drawPreview` with three arguments and there was nothing
//      to read, so every arm in that block fails on a revert.
//   3. ONE chip per arc (not 16), width/depth for a rectangle, the radius for a circle, and a spine
//      never given a closing edge it does not have.
//
// ⛔ WHAT IT DOES NOT ESTABLISH: that the chips land on the right pixels. That is the adapters' paint
// and is pinned against their real render models in `envelopeRosterPaintSurfaces.spec.ts` /
// `siteEnvelopeDrawMap2D.spec.ts`; the camera maths itself is browser-only.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { formatDimension } from '@pryzm/core-app-model';
import type { ArcVertex2D } from '@pryzm/geometry-slab/boundary-path';
import type {
    EnvelopeDrawDimLabel,
    EnvelopeDrawSink,
    EnvelopeDrawSurface,
    SceneXZPoint,
} from '../envelopeDrawSurface';
import {
    ENVELOPE_DRAW_DIM_UNIT,
    formatEnvelopeDrawLength,
    loopPreviewDims,
    pathPreviewDims,
} from '../envelopeDrawDims';
import {
    __resetEnvelopeDrawArmingForTests,
    armEnvelopeDraw,
    registerEnvelopeDrawSurface,
    setEnvelopeDrawMode,
} from '../siteEnvelopeDrawArming';
import { __resetDrawnEnvelopeFootprintForTests } from '../drawnEnvelopeFootprintState';

const repoRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
const read = (rel: string): string => readFileSync(join(repoRoot, rel), 'utf8');

/** A fake of the PORT that records the chips the driver handed each preview. Converts nothing. */
class RecordingSurface implements EnvelopeDrawSurface {
    readonly surfaceId = 'site-map-2d' as const;
    sink: EnvelopeDrawSink | null = null;
    frames: Array<{ committed: ArcVertex2D[]; closeRing: boolean; dims: EnvelopeDrawDimLabel[] | undefined }> = [];
    groundPointFromPointer(): SceneXZPoint | null { return null; }
    drawPreview(
        committed: readonly ArcVertex2D[],
        _tail: readonly ArcVertex2D[],
        closeRing: boolean,
        dims?: readonly EnvelopeDrawDimLabel[],
    ): void {
        this.frames.push({ committed: [...committed], closeRing, dims: dims ? [...dims] : undefined });
    }
    clearPreview(): void { /* not under test */ }
    arm(s: EnvelopeDrawSink): boolean { this.sink = s; return true; }
    disarm(): void { this.sink = null; }
    get lastDims(): EnvelopeDrawDimLabel[] {
        const f = this.frames[this.frames.length - 1];
        expect(f, 'the driver never asked this surface for a preview').toBeDefined();
        expect(f!.dims, 'the driver drew a preview WITHOUT chips — the L-13308 gap').toBeDefined();
        return f!.dims!;
    }
}

let s: RecordingSurface;
const pt = (x: number, z: number): void => { s.sink!.onPoint({ x, z }); };
const mv = (x: number, z: number): void => { s.sink!.onMove({ x, z }); };
const texts = (d: readonly EnvelopeDrawDimLabel[]): string[] => d.map((l) => l.text);

beforeEach(() => {
    __resetEnvelopeDrawArmingForTests();
    __resetDrawnEnvelopeFootprintForTests();
    s = new RecordingSurface();
    registerEnvelopeDrawSurface(s);
});
afterEach(() => {
    __resetEnvelopeDrawArmingForTests();
    __resetDrawnEnvelopeFootprintForTests();
});

describe('§ENVELOPE-DRAW-LIVE-DIMS — the chip text is the slab + wall tools\' own formatter', () => {
    it('is `formatDimension(d, "m")` — metres to the millimetre', () => {
        expect(ENVELOPE_DRAW_DIM_UNIT).toBe('m');
        for (const d of [0.5, 3, 12.3456, 23.45, 104.0004]) {
            expect(formatEnvelopeDrawLength(d)).toBe(formatDimension(d, 'm'));
            expect(formatEnvelopeDrawLength(d)).toBe(`${d.toFixed(3)} m`);
        }
        // The arc and radius affixes go through the SAME function, never a second template.
        expect(formatEnvelopeDrawLength(10, '~', ' (arc)')).toBe(formatDimension(10, 'm', '~', ' (arc)'));
    });

    it('⭐ is byte-identical to `DimensionPreview` — the ONE live-dim widget SlabTool and WallTool mount', () => {
        const preview = read('packages/geometry-wall/src/DimensionPreview.ts');
        // If this literal moves, the slab/wall chips changed format and ours no longer match them.
        expect(preview).toContain('this.label.textContent = `${distance.toFixed(3)} m`;');
        expect(read('packages/geometry-slab/src/SlabTool.ts'))
            .toContain("import { DimensionPreview } from '@pryzm/geometry-wall';");
        expect(read('packages/geometry-wall/src/WallTool.ts')).toMatch(/\bDimensionPreview\b/);
        // …and the envelope module reaches the canonical formatter, not a private template.
        const dims = read('apps/editor/src/ui/site/envelopeDrawDims.ts');
        expect(dims).toContain("import { formatDimension } from '@pryzm/core-app-model';");
        // ⚠ CODE ONLY — the module's header QUOTES DimensionPreview's `toFixed(3)` template to explain
        // the parity, and a comment is not a private formatter (§RAF-GATE-COMMENT-BLIND).
        const codeOnly = (src: string): string => src.split('\n')
            .filter((l) => { const t = l.trimStart(); return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*'); })
            .join('\n');
        expect(codeOnly(dims)).not.toMatch(/toFixed\(/);
    });
});

describe('§ENVELOPE-DRAW-LIVE-DIMS — the REAL driver hands every preview its chips', () => {
    it('⭐ linear: the rubber-band from the first click', () => {
        armEnvelopeDraw();
        pt(0, 0);
        mv(10, 0);
        const d = s.lastDims;
        expect(d).toHaveLength(1);
        expect(d[0]).toMatchObject({ kind: 'live', text: '10.000 m', at: { x: 5, z: 0 } });
    });

    it('⭐ every placed edge, the rubber-band AND the closing edge — in the one formatter', () => {
        armEnvelopeDraw();
        pt(0, 0); pt(10, 0); pt(10, 20);
        mv(0, 20);
        const d = s.lastDims;
        expect(d.map((l) => l.kind)).toEqual(['placed', 'placed', 'live', 'closing']);
        expect(texts(d)).toEqual(['10.000 m', '20.000 m', '10.000 m', '20.000 m']);
        for (const l of d) expect(l.text).toBe(formatDimension(l.lengthM, 'm'));
        // The closing chip sits on the closing edge the preview draws: (0,20) → (0,0).
        expect(d[3]!.at).toEqual({ x: 0, z: 10 });
    });

    it('a cursor parked on the last corner shows no "0.000 m" chip (DimensionPreview\'s own 0.01 m floor)', () => {
        armEnvelopeDraw();
        pt(0, 0);
        mv(0, 0);
        expect(s.lastDims).toEqual([]);
    });

    it('⭐ curved: ONE chip for a 16-chord arc, marked the way the wall tool marks its arc', () => {
        setEnvelopeDrawMode('curved');
        armEnvelopeDraw();
        pt(0, 0); pt(5, 3); pt(10, 0);                    // vertex · arc midpoint · arc END
        mv(10, 10);
        const f = s.frames[s.frames.length - 1]!;
        expect(f.committed.length, 'the arc is tessellated into many committed vertices').toBeGreaterThan(8);
        const placed = s.lastDims.filter((l) => l.kind === 'placed');
        expect(placed, 'sixteen chord chips on one arc is noise, not a dimension').toHaveLength(1);
        expect(placed[0]!.text).toBe('~10.000 m (arc)');
        expect(placed[0]!.text).toBe(formatDimension(10, 'm', '~', ' (arc)'));
    });

    it('curved with a midpoint pending: the LIVE chip is the arc\'s chord, marked as an arc', () => {
        setEnvelopeDrawMode('curved');
        armEnvelopeDraw();
        pt(0, 0); pt(5, 3); pt(10, 0);
        pt(20, 5);                                         // the next arc's midpoint
        mv(30, 0);
        const live = s.lastDims.filter((l) => l.kind === 'live');
        expect(live).toHaveLength(1);
        expect(live[0]!.text).toBe('~20.000 m (arc)');
    });

    it('Backspace inside an arc trims the run — the one chip follows what is left, never a stale chord', () => {
        setEnvelopeDrawMode('curved');
        armEnvelopeDraw();
        pt(0, 0); pt(5, 3); pt(10, 0);
        s.sink!.onUndo();                                   // pops ONE tessellated chord
        const f = s.frames[s.frames.length - 1]!;
        const c = f.committed;
        const placed = s.lastDims.filter((l) => l.kind === 'placed');
        expect(placed).toHaveLength(1);
        const chord = Math.hypot(c[c.length - 1]!.x - c[0]!.x, c[c.length - 1]!.z - c[0]!.z);
        expect(placed[0]!.lengthM).toBeCloseTo(chord, 9);
        expect(placed[0]!.lengthM).toBeLessThan(10);
    });

    it('⭐ rectangle: width and depth while the opposite corner is dragged', () => {
        setEnvelopeDrawMode('rectangular');
        armEnvelopeDraw();
        pt(0, 0);
        mv(10, 20);
        expect(texts(s.lastDims)).toEqual(['10.000 m', '20.000 m']);
    });

    it('circle: the radius, R-prefixed — not 48 chord chips', () => {
        setEnvelopeDrawMode('circular');
        armEnvelopeDraw();
        pt(0, 0);
        mv(3, 4);
        expect(texts(s.lastDims)).toEqual(['R 5.000 m']);
    });

    it('⛔ a SPINE is never given a closing chip — it is an open run, and its preview never closes', () => {
        armEnvelopeDraw('array-path');
        pt(0, 0); pt(10, 0); pt(10, 10);
        mv(20, 10);
        const d = s.lastDims;
        expect(d.some((l) => l.kind === 'closing')).toBe(false);
        expect(texts(d)).toEqual(['10.000 m', '10.000 m', '10.000 m']);
    });
});

describe('§ENVELOPE-DRAW-LIVE-DIMS — the pure producers', () => {
    it('an arc run the committed list no longer reaches is ignored, not honoured', () => {
        const committed = [{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 3 }];
        const d = pathPreviewDims({ committed, tail: [], closeRing: false, arcRuns: [{ start: 1, end: 9 }] });
        expect(texts(d)).toEqual(['4.000 m', '3.000 m']);
    });

    it('a degenerate loop (below the generator\'s minimum) yields no chips', () => {
        expect(loopPreviewDims('rectangular', { x: 0, z: 0 }, { x: 0.01, z: 0.01 }, [])).toEqual([]);
    });

    it('ellipse: the two semi-axes, each on its own axis', () => {
        const ring = [{ x: 6, z: 0 }, { x: 0, z: 4 }, { x: -6, z: 0 }, { x: 0, z: -4 }];
        const d = loopPreviewDims('elliptical', { x: 0, z: 0 }, { x: 6, z: 4 }, ring);
        expect(texts(d)).toEqual(['R 6.000 m', 'R 4.000 m']);
        expect(d[0]!.at).toEqual({ x: 3, z: 0 });
        expect(d[1]!.at).toEqual({ x: 0, z: 2 });
    });
});
