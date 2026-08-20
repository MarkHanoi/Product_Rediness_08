/**
 * shapeVocabulary.test — §FIX-SHAPE-VOCABULARY (L-1322). C84 **EI-8a**.
 *
 * ⭐ WHY THIS FILE READS PRODUCTION SOURCES INSTEAD OF LISTING THE SPELLINGS.
 *
 * EI-8a: *"a licensed copy is pinned by a TEST, never by a comment"* — and the
 * contract records that the comment mechanism **"has already failed twice, measured"**
 * (colour names drifted; style aliases drifted). A test that hand-listed the five
 * spellings would be a SIXTH copy, and it would go green while the thing it exists to
 * police drifted underneath it — which is exactly the tautology
 * `lightingParamsRoundTrip.test.ts` had to correct in itself (it was asserting against
 * its own hand-copy of the key list rather than the production one).
 *
 * So every arm below derives its population from the code that ships:
 *   • `HANDRAIL_LOOP_MODES`  — READ from handrail's source (an L2 sibling this
 *     package must not import; see `handrailLoopModes` for why reading, not importing)
 *   • `elementCreationMatrix.ts` — read from disk, because it is an L7 app file this
 *     L2 package must not import (the layer rule is not suspended for tests)
 *
 * A sixth spelling added anywhere in those sources fails this file.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
    canonicalBoundaryShape,
    KNOWN_SHAPE_SPELLINGS,
    BOUNDARY_LOOP_MODES,
    isBoundaryLoopMode,
} from '../src/boundaryLoops';

const REPO = join(__dirname, '..', '..', '..');
const MATRIX = join(REPO, 'apps/editor/src/engine/views/plantools/elementCreationMatrix.ts');
const HANDRAIL = join(REPO, 'packages/geometry-handrail/src/handrailRunGenerators.ts');

/**
 * Handrail's shipped loop modes, READ FROM ITS SOURCE.
 *
 * ⚠ Deliberately not an import: `@pryzm/geometry-handrail` is an L2 SIBLING of this
 * package and is not a declared dependency of it. Adding one just to read three string
 * literals would mint a real package edge (and a lockfile change) for a test — so the
 * population is derived by reading, which keeps the layer rule intact while still
 * failing if handrail's list changes.
 */
function handrailLoopModes(): string[] {
    const s = readFileSync(HANDRAIL, 'utf8');
    const at = s.indexOf('HANDRAIL_LOOP_MODES');
    expect(at, 'handrail no longer exports HANDRAIL_LOOP_MODES').toBeGreaterThan(-1);
    const line = s.slice(at, s.indexOf(';', at));
    return [...line.matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

/** Mode ids declared for one tool row in the production matrix. */
function matrixModeIds(tool: string): string[] {
    const s = readFileSync(MATRIX, 'utf8');
    const at = s.indexOf(`tool: '${tool}'`);
    expect(at, `tool '${tool}' is missing from the matrix`).toBeGreaterThan(-1);
    const block = s.slice(at, s.indexOf('autoIn:', at));
    return [...block.matchAll(/id:\s*'([^']+)'/g)].map((m) => m[1]);
}

describe('L-1322 — the canonical set', () => {
    it('is C86’s ratified adjective set', () => {
        expect(BOUNDARY_LOOP_MODES).toEqual(['rectangular', 'circular', 'elliptical']);
    });

    it('every canonical id maps to itself — the table cannot rename the canon', () => {
        for (const m of BOUNDARY_LOOP_MODES) expect(canonicalBoundaryShape(m)).toBe(m);
    });

    it('⛔ an unknown id resolves to NULL, never to a default', () => {
        // A defaulting resolver would silently turn a typo — or the founder's
        // "eclipse" — into a rectangle. That is the silent narrowing this whole
        // feature refuses (C84 EI-2, §L955).
        for (const junk of ['eclipse', 'oval', 'blob', '', 'RECTANGULARISH', null, undefined, 7]) {
            expect(canonicalBoundaryShape(junk as never)).toBeNull();
        }
    });

    it('every alias resolves to a real member of the canonical set', () => {
        for (const spelling of KNOWN_SHAPE_SPELLINGS) {
            const c = canonicalBoundaryShape(spelling);
            expect(c, spelling).not.toBeNull();
            expect(isBoundaryLoopMode(c)).toBe(true);
        }
    });
});

// ⭐ THE PINNING ARMS. Populations come from production, so drift fails here.
describe('L-1322 — EI-8a: every SHIPPED spelling is mapped, and the population is derived', () => {
    it('HANDRAIL’s loop modes are all mapped (square | circular | ellipse)', () => {
        const modes = handrailLoopModes();
        expect(modes.length).toBeGreaterThan(0);
        for (const m of modes) {
            expect(canonicalBoundaryShape(m), `handrail mode '${m}' is unmapped`).not.toBeNull();
        }
    });

    it('handrail’s divergence is REAL and is recorded, not pretended away', () => {
        // If someone ever unifies handrail onto the adjective set, this arm fails and
        // the reconciliation gets noticed rather than silently completed.
        const modes = handrailLoopModes();
        expect(modes).toContain('square');
        expect(modes).toContain('ellipse');
        expect(canonicalBoundaryShape('square')).toBe('rectangular');
        expect(canonicalBoundaryShape('ellipse')).toBe('elliptical');
    });

    it('FLOOR and CEILING shape ids are mapped', () => {
        for (const tool of ['floor', 'ceiling']) {
            const shapeIds = matrixModeIds(tool).filter((id) => canonicalBoundaryShape(id));
            expect(shapeIds, `${tool} declares no shape modes`).not.toHaveLength(0);
            expect(shapeIds).toContain('rectangle');
            expect(shapeIds).toContain('circular');
            expect(shapeIds).toContain('elliptical');
        }
    });

    it('SLAB’s ids are mapped, including its historic ‘2point’ rectangle', () => {
        const ids = matrixModeIds('slab');
        expect(ids).toContain('2point');
        expect(canonicalBoundaryShape('2point')).toBe('rectangular');
        expect(ids).toContain('circular');
        expect(ids).toContain('elliptical');
    });

    it('WALL’s closed-loop run ids are the canonical set outright', () => {
        const ids = matrixModeIds('wall').filter((id) => canonicalBoundaryShape(id));
        expect(ids).toEqual(['rectangular', 'circular', 'elliptical']);
    });

    it('COLUMN’s section ids (rect | round) are mapped', () => {
        const ids = matrixModeIds('column');
        expect(ids).toContain('rect');
        expect(ids).toContain('round');
        expect(canonicalBoundaryShape('rect')).toBe('rectangular');
        expect(canonicalBoundaryShape('round')).toBe('circular');
    });

    // ⭐ THE DRIFT DETECTOR. Not "are the ones I listed mapped" but "is anything the
    // matrix calls a shape unmapped" — so a SIXTH spelling fails this file.
    it('⛔ NO tool in the matrix declares a shape-like id this table cannot resolve', () => {
        const s = readFileSync(MATRIX, 'utf8');
        const SHAPE_WORDS = /^(square|rect|rectangle|rectangular|circle|circular|round|ellipse|elliptical|oval)$/i;
        const unmapped = [...s.matchAll(/id:\s*'([^']+)'/g)]
            .map((m) => m[1])
            .filter((id) => SHAPE_WORDS.test(id) && !canonicalBoundaryShape(id));
        expect(unmapped, `unmapped shape spellings in the matrix: ${unmapped.join(', ')}`).toEqual([]);
    });
});

describe('L-1322 — the NAME COLLISION is gone', () => {
    it('⛔ SiteBoundaryMap2D no longer declares a rival type called BoundaryDrawMode', () => {
        // Two types, one name, DIFFERENT members ('orthogonal' vs 'ortho'): a reader
        // who grepped the name found two answers and no way to tell which governed.
        const s = readFileSync(join(REPO, 'apps/editor/src/ui/geospatial/SiteBoundaryMap2D.ts'), 'utf8');
        expect(s).not.toMatch(/type\s+BoundaryDrawMode\s*=/);
        expect(s).toMatch(/type\s+SiteBoundaryGesture\s*=/);
    });

    it('the ONE exported BoundaryDrawMode still means the CONSTRAINT axis, not a shape', () => {
        // ⛔ C92 SL-Voc-3 — two orthogonal concepts must not share one word. If a shape
        // ever lands on that union, `curved × circular` becomes unexpressible.
        const s = readFileSync(join(__dirname, '..', 'src', 'boundaryPath.ts'), 'utf8');
        const decl = s.slice(s.indexOf('export type BoundaryDrawMode'));
        const line = decl.slice(0, decl.indexOf(';') + 1);
        expect(line).toBe("export type BoundaryDrawMode = 'linear' | 'ortho' | 'curved';");
        for (const shape of BOUNDARY_LOOP_MODES) expect(line).not.toContain(shape);
    });
});
