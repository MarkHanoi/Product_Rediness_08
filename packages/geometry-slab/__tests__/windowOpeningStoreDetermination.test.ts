// §GR-10/GR-14 — the SlabFragmentBuilder ARM B row, drained.
//
// THE ROW: `check-no-empty-means-unknown` ARM B,
// `packages/geometry-slab/src/SlabFragmentBuilder.ts` — one site, one arm:
//     window.openingStore.getByHostId?.(data.id) ?? []
//
// The branch it guards exists ONLY to warn "DEPS NOT INJECTED". Because the read
// collapses "no openings" with "no such method" and "it threw", the warning was
// suppressed by precisely the conditions it was written to report. Every arm
// below is DIFFERENTIATING: it fails if `[]` and unknown are conflated.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readWindowOpeningsForDiagnostic } from '../src/windowOpeningStoreDetermination';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

describe('readWindowOpeningsForDiagnostic — the three cases the old `?.() ?? []` merged', () => {
    it('DETERMINED and EMPTY — a slab with no openings is a real answer, not a refusal', () => {
        const d = readWindowOpeningsForDiagnostic({ getByHostId: () => [] }, 'slab-1');
        expect(d.kind).toBe('determined');
        expect(d.kind === 'determined' && d.openings).toEqual([]);
    });

    it('DETERMINED and non-empty — the legacy-bootstrap warning still has its trigger', () => {
        const d = readWindowOpeningsForDiagnostic({ getByHostId: () => [{ id: 'o1' }] }, 'slab-1');
        expect(d.kind === 'determined' && d.openings).toHaveLength(1);
    });

    it('UNDETERMINED — no `getByHostId`: the wrong-shape store the `?.` silenced', () => {
        const d = readWindowOpeningsForDiagnostic({}, 'slab-1');
        expect(d.kind).toBe('undetermined');
        expect(d.kind === 'undetermined' && d.reason).toBe('RELATIONSHIP_NOT_READABLE');
    });

    it('UNDETERMINED — the call threw', () => {
        const d = readWindowOpeningsForDiagnostic(
            { getByHostId: () => { throw new Error('store disposed'); } }, 'slab-1');
        expect(d.kind === 'undetermined' && d.detail).toContain('store disposed');
    });

    it('UNDETERMINED — a non-array return, which the old `?? []` absorbed', () => {
        expect(readWindowOpeningsForDiagnostic({ getByHostId: () => undefined }, 's').kind)
            .toBe('undetermined');
        expect(readWindowOpeningsForDiagnostic({ getByHostId: () => ({}) }, 's').kind)
            .toBe('undetermined');
    });

    it('THE DIFFERENTIATOR — "no openings" and "could not ask" are no longer the same value', () => {
        const empty = readWindowOpeningsForDiagnostic({ getByHostId: () => [] }, 's');
        const blind = readWindowOpeningsForDiagnostic({}, 's');
        expect(empty.kind).not.toBe(blind.kind);
        // And the OLD expression cannot tell them apart — asserted, so the claim
        // that this change was necessary is measured rather than narrated.
        const oldEmpty = ({ getByHostId: () => [] } as { getByHostId?: (id: string) => unknown[] })
            .getByHostId?.('s') ?? [];
        const oldBlind = ({} as { getByHostId?: (id: string) => unknown[] }).getByHostId?.('s') ?? [];
        expect(oldEmpty).toEqual(oldBlind);
    });

    it('the host id is actually forwarded — the reader is not answering a different question', () => {
        let seen = '';
        readWindowOpeningsForDiagnostic({ getByHostId: (id: string) => { seen = id; return []; } }, 'slab-77');
        expect(seen).toBe('slab-77');
    });

    it('TOTAL — no input makes it throw, so no caller needs the try/catch that rebuilt the defect', () => {
        for (const bad of [undefined, null, 0, '', [], { getByHostId: 7 }]) {
            expect(() => readWindowOpeningsForDiagnostic(bad, 's')).not.toThrow();
        }
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// UNION PIN — no rival vocabulary (C78 §8.1, CLOSED at eleven)
// ═════════════════════════════════════════════════════════════════════════════

describe('the reason is command-bus vocabulary, not a fork', () => {
    const union = (): string => {
        const s = readFileSync(resolve(REPO, 'packages/command-bus/src/consequence.ts'), 'utf8');
        const start = s.indexOf('export type UndeterminedReason');
        expect(start, 'UndeterminedReason not found — command-bus moved').toBeGreaterThan(-1);
        return s.slice(start, s.indexOf(';', start));
    };

    it('the member this module produces exists in the closed union', () => {
        expect(union()).toContain("'RELATIONSHIP_NOT_READABLE'");
    });

    it('the union is still closed at ELEVEN — extending it here would fail HERE', () => {
        expect(union().match(/\|\s*'[A-Z_]+'/g)).toHaveLength(11);
    });
});
