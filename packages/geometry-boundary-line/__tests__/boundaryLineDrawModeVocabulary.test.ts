// §FEAT-CONSTRUCTION-BOUNDARY-LINE (L-7909) — THE MODE VOCABULARY IS ONE LIST,
// STATED THREE TIMES, AND THIS FILE IS WHY THAT IS SAFE. C84 EI-8 · C105 §2.1.
//
// The founder asked for the wall's modes: "line, ortho, rectangle, ellipse, curve,
// circle". Three artefacts have to agree on them and NONE of them can import the
// others:
//
//   1. `BoundaryLine.drawMode` — an L0 Zod enum. L0 imports nothing, by P5.
//   2. `BOUNDARY_LINE_DRAW_MODES` — this package (L2), the runtime vocabulary.
//   3. `BoundaryDrawMode` + `BoundaryLoopMode` — `@pryzm/geometry-slab` (L2), the
//      unions whose GENERATOR (`boundaryLoopVertices`) actually produces the shapes.
//
// ⭐ SO THE LISTS ARE COMPARED RATHER THAN SHARED. An import would couple 1→2 in a
// direction P5 forbids and could not check 1 at all. §FIX-STAIR-SHAPE-DESYNC is what
// happens without this file: a strip offering a shape its generator does not
// implement. The comparison is by SET, never by count — a count can be right while a
// member is wrong, which is the defect shape this repo logs most often.
import { describe, expect, it } from 'vitest';
import { BoundaryLine } from '@pryzm/schemas';
import { BOUNDARY_LINE_DRAW_MODES, BOUNDARY_LINE_LOOP_MODES } from '../src/index';

describe('§FEAT-CONSTRUCTION-BOUNDARY-LINE — one mode vocabulary, three declarations', () => {
    it('MV-1: the L0 schema accepts EXACTLY the six this package declares', () => {
        for (const m of BOUNDARY_LINE_DRAW_MODES) {
            expect(
                () => BoundaryLine.parse({ vertices: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }], drawMode: m }),
                `L0 must accept the mode "${m}"`,
            ).not.toThrow();
        }
    });

    it('MV-2: the L0 schema REFUSES a mode this package does not declare', () => {
        // The other direction, and the one a "does it accept mine?" test misses: an
        // enum that quietly admits a seventh member would let a record hold a mode no
        // generator implements.
        expect(() =>
            BoundaryLine.parse({ vertices: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }], drawMode: 'rectangle' }),
        ).toThrow();
        expect(() =>
            BoundaryLine.parse({ vertices: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }], drawMode: 'spiral' }),
        ).toThrow();
    });

    it('MV-3: the LOOP modes are a strict subset, and are the three that close in one gesture', () => {
        for (const m of BOUNDARY_LINE_LOOP_MODES) {
            expect(BOUNDARY_LINE_DRAW_MODES as readonly string[]).toContain(m);
        }
        expect([...BOUNDARY_LINE_LOOP_MODES]).toEqual(['rectangular', 'circular', 'elliptical']);
    });

    it('MV-4: ⛔ `rectangular`, never `rectangle` — the L-1322 spelling, chosen once', () => {
        expect(BOUNDARY_LINE_DRAW_MODES as readonly string[]).toContain('rectangular');
        expect(BOUNDARY_LINE_DRAW_MODES as readonly string[]).not.toContain('rectangle');
    });
});
