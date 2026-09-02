// LANE S1 / ADR-0377 — the height-datum routing verdict (first resolver consumer of the seat).
//
// The silent failures targeted:
//   • an UNKNOWN datum resolving to anything at all (it must refuse — never default a plane);
//   • the façade-rasant arm carrying strings instead of the REAL Art. 240 machinery (a wired
//     claim that wires nothing — the authored-but-unwired class);
//   • an absolute altitude coming back as if it were resolvable into a relative height.

import { describe, it, expect } from 'vitest';
import { resolveHeightDatumStrategy } from '../src/rulepacks/declarative/heightDatumResolver';
import {
    resolveParcelRasantDatum,
    resolveFacadeRasantDatum,
    facadeSamplePoints,
    assertPostingResolves,
} from '../src/geometry/facadeRasantDatum';

describe('ADR-0377 — resolveHeightDatumStrategy', () => {
    it('facade-rasant is WIRED to the real Art. 240 machinery (function identity, not strings)', () => {
        const v = resolveHeightDatumStrategy({ kind: 'facade-rasant' });
        expect(v.kind).toBe('wired');
        if (v.kind === 'wired') {
            expect(v.resolve).toBe(resolveParcelRasantDatum);
            expect(v.resolveSingleFacade).toBe(resolveFacadeRasantDatum);
            expect(v.samplePoints).toBe(facadeSamplePoints);
            expect(v.postingGuard).toBe(assertPostingResolves);
        }
    });

    it('the wired arm still inherits the machinery’s own refusal ladder (no-front-edge)', () => {
        const v = resolveHeightDatumStrategy({ kind: 'facade-rasant' });
        if (v.kind !== 'wired') throw new Error('expected wired');
        const r = v.resolve([], { provenance: 'dtm-bare-earth', postingSpacing_m: 5 });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.refusal.code).toBe('no-front-edge');
    });

    it('absolute-national is FLAGGED, never resolved as a building height, and names its frame', () => {
        const v = resolveHeightDatumStrategy({ kind: 'absolute-national', frame: 'NHN' });
        expect(v.kind).toBe('absolute-flagged');
        if (v.kind === 'absolute-flagged') {
            expect(v.frame).toBe('NHN');
            expect(v.detail).toMatch(/NOT a building height/);
        }
    });

    it('unknown REFUSES — and so does an ABSENT datum (heightDatumOf totality)', () => {
        for (const input of [{ kind: 'unknown' } as const, undefined, null]) {
            const v = resolveHeightDatumStrategy(input);
            expect(v.kind).toBe('refusal');
            if (v.kind === 'refusal') expect(v.code).toBe('datum-unresolved');
        }
    });

    it('representable-but-unwired members refuse naming the gap as OURS, not the law’s', () => {
        for (const kind of [
            'street-level',
            'mean-ground-at-facade',
            'terrain-highest',
            'terrain-lowest',
        ] as const) {
            const v = resolveHeightDatumStrategy({ kind });
            expect(v.kind).toBe('refusal');
            if (v.kind === 'refusal') {
                expect(v.code).toBe('no-resolver-wired');
                expect(v.detail).toMatch(/gap in PRYZM/);
            }
        }
    });
});
