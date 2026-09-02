// CONTROL 9 AT THE PIPELINE LEVEL — `ran` ≠ `refused` ≠ `failed`, and `ran` with
// ZERO claims is an ANSWER, not a failure.
//
// The brief: *"an extraction that produced NOTHING must be distinguishable from one
// that FAILED."* This is the §CONTEXT-DATA-HONESTY family (L-422/457/467/469) at the
// spine's outermost seam, where it is easiest to collapse and most expensive to get
// wrong:
//
//   `ran`     — the spine worked. Claims MAY be empty and every empty carries a
//               typed reason. A statement about the DOCUMENT.
//   `refused` — a legal gate said no BEFORE extraction. A positive, cited product
//               answer, not an absence.
//   `failed`  — the spine could not run. Says NOTHING about the document.
//
// An empty `ran` and a `failed` are the SAME VALUE to any consumer that only checks
// `claims.length === 0`. These tests exist so that consumer cannot be written by
// accident.

import { describe, expect, it } from 'vitest';
import { buildCanonicalDocument } from '../src/structure/canonicalDocument.js';
import { documentToClaims } from '../src/spine/documentToClaims.js';
import { createTableReader } from '../src/spine/readers.js';
import {
    LUZERN_BZR_ANHANG1,
    SWISS_GERMAN_QUALIFIERS,
} from '../src/adapters/swissZoneTable.js';
import { type PageItems, type PositionedItem } from '../src/structure/types.js';
import { type ZoneContext } from '../src/spine/types.js';

function item(text: string, x: number, y: number): PositionedItem {
    return { text, x, y, width: text.length * 4.5, height: 9 };
}

/** The real Luzern Anhang-1 geometry, trimmed to what the spine needs. */
function luzernPage(): PageItems {
    return {
        pageNumber: 27,
        items: [
            item('Nr.', 31.1, 700),
            item('Zonenart', 59.6, 700),
            item('ÜZ', 177.3, 700),
            item('VG', 300.4, 700),
            item('FH', 348.3, 700),
            item('Weitere Bestimmungen', 476.4, 700),
            item('10', 31.1, 680),
            item('WA', 59.6, 680),
            item('0.15', 177.3, 680),
            item('21', 348.3, 680),
            item('Gestaltungsplanpflicht', 476.4, 680),
            item('11', 31.1, 667),
            item('WA', 59.6, 667),
            item('0.2', 177.3, 667),
            item('3', 300.4, 667),
            item('12', 31.1, 654),
            item('WA', 59.6, 654),
            item('0.2', 177.3, 654),
            item('4', 300.4, 654),
        ],
    };
}

const ZONE: ZoneContext = {
    country: 'CH',
    zoneKey: '10',
    zoneLabel: null,
    authority: 'Stadt Luzern',
    dataset: 'Bau- und Zonenreglement, Anhang 1',
    planId: null,
};

function request(overrides: Record<string, unknown> = {}): never {
    return {
        primary: buildCanonicalDocument('luze_BZR.pdf', [luzernPage()]),
        zone: ZONE,
        readers: [createTableReader(LUZERN_BZR_ANHANG1)],
        lexicon: SWISS_GERMAN_QUALIFIERS,
        locale: 'ch',
        validity: { basis: 'ingestion', from: '2026-09-02', to: null },
        ...overrides,
    } as never;
}

describe('`ran` — the spine worked', () => {
    it('produces tier-4 claims with UNVALIDATED state', async () => {
        const out = await documentToClaims(request());
        expect(out.kind).toBe('ran');
        if (out.kind !== 'ran') return;
        expect(out.claims.length).toBeGreaterThan(0);
        for (const c of out.claims) {
            expect(c.provenance.confidence.tier).toBe(4);
            expect(c.provenance.derivation).toBe('AI_EXTRACTED');
            expect(c.validationState).toBe('not-checked');
            // Every claim is auditable: a verbatim span and a citeable address.
            expect(c.evidence.span.length).toBeGreaterThan(0);
            expect(c.provenance.source.document).toBe('luze_BZR.pdf');
            expect(c.provenance.source.page).toBe(27);
        }
    });

    it('⭐ reads the 21 as a HEIGHT and reports the storey count as ABSENT, not zero', async () => {
        const out = await documentToClaims(request());
        if (out.kind !== 'ran') throw new Error('expected ran');
        const height = out.claims.find((c) => c.field === 'maxHeight_m');
        expect(height?.value).toBe(21);
        expect(height?.evidence.cell).toContain('FH');
        // maxFloors is NOT claimed, and the reason is stated.
        expect(out.claims.find((c) => c.field === 'maxFloors')).toBeUndefined();
        const floors = out.nothingFound.find((n) => n.field === 'maxFloors');
        expect(floors?.reason).toBe('not-in-document');
        expect(floors?.detail).toMatch(/not 0 and it is not unlimited/u);
    });
});

describe('⛔ `ran` WITH ZERO CLAIMS IS NOT `failed`', () => {
    it('a zone absent from the document RAN and reports zone-not-in-document', async () => {
        const out = await documentToClaims(request({ zone: { ...ZONE, zoneKey: '999' } }));
        // THE ASSERTION THE BRIEF DEMANDS.
        expect(out.kind).toBe('ran');
        expect(out.ok).toBe(true);
        if (out.kind !== 'ran') return;
        expect(out.claims).toEqual([]);
        expect(out.nothingFound.length).toBeGreaterThan(0);
        for (const n of out.nothingFound) expect(n.reason).toBe('zone-not-in-document');
    });

    it('every empty carries a TYPED reason — never a bare silence', async () => {
        const out = await documentToClaims(request({ zone: { ...ZONE, zoneKey: '999' } }));
        if (out.kind !== 'ran') return;
        for (const n of out.nothingFound) {
            expect(n.reason).toBeTruthy();
            expect(n.detail.length).toBeGreaterThan(10);
        }
    });
});

describe('`failed` — the spine could not run, and says NOTHING about the document', () => {
    it('no pages', async () => {
        const out = await documentToClaims(
            request({ primary: buildCanonicalDocument('luze_BZR.pdf', []) }),
        );
        expect(out.kind).toBe('failed');
        if (out.kind !== 'failed') return;
        expect(out.reason).toBe('no-pages');
    });

    it('no document id — a value with no address is never emitted', async () => {
        const out = await documentToClaims(
            request({ primary: buildCanonicalDocument('', [luzernPage()]) }),
        );
        expect(out.kind).toBe('failed');
        if (out.kind !== 'failed') return;
        expect(out.reason).toBe('no-document-id');
    });

    it('no zone context — a document must be read FOR a zone', async () => {
        const out = await documentToClaims(request({ zone: { ...ZONE, zoneKey: '  ' } }));
        expect(out.kind).toBe('failed');
        if (out.kind !== 'failed') return;
        expect(out.reason).toBe('invalid-zone-context');
    });

    it('⭐ a SCAN fails with no-text-layer — an OCR input, not evidence of silence', async () => {
        const empty: PageItems = { pageNumber: 1, items: [] };
        const out = await documentToClaims(
            request({ primary: buildCanonicalDocument('scan.pdf', [empty]) }),
        );
        expect(out.kind).toBe('failed');
        if (out.kind !== 'failed') return;
        expect(out.reason).toBe('no-text-layer');
        expect(out.detail).toMatch(/not evidence that the ordinance is silent/u);
    });
});

describe('`refused` — a cited legal answer, neither an empty nor a failure', () => {
    it('a regime that defines no numeric envelope REFUSES before reading', async () => {
        const out = await documentToClaims(
            request({
                regime: {
                    regime: null,
                    shouldExtract: false,
                    gate: {
                        gate: 'regime',
                        verdict: 'flag',
                        detail: 'x',
                        token: 'regime:no-numbers',
                    },
                    refusal:
                        '§ 34 BauGB defines no numeric envelope: the measure is the surrounding built form.',
                    caveat: null,
                    forbiddenTiers: [],
                },
            }),
        );
        expect(out.kind).toBe('refused');
        expect(out.ok).toBe(false);
        if (out.kind !== 'refused') return;
        expect(out.refusedBy).toBe('regime');
        expect(out.detail).toContain('§ 34 BauGB');
    });
});

describe('the three outcomes are MUTUALLY DISTINGUISHABLE', () => {
    it('a consumer branching on `kind` sees three different answers for three different worlds', async () => {
        const ran = await documentToClaims(request({ zone: { ...ZONE, zoneKey: '999' } }));
        const failed = await documentToClaims(
            request({ primary: buildCanonicalDocument('luze_BZR.pdf', []) }),
        );
        const refused = await documentToClaims(
            request({
                regime: {
                    regime: null,
                    shouldExtract: false,
                    gate: { gate: 'regime', verdict: 'flag', detail: 'x', token: 'regime:no' },
                    refusal: 'cited refusal',
                    caveat: null,
                    forbiddenTiers: [],
                },
            }),
        );
        expect(new Set([ran.kind, failed.kind, refused.kind]).size).toBe(3);
        // ⛔ And the naive consumer test — "did I get any claims?" — cannot tell
        // them apart, which is precisely why `kind` exists.
        const claimsOf = (o: typeof ran): number => (o.kind === 'ran' ? o.claims.length : 0);
        expect(claimsOf(ran)).toBe(0);
        expect(claimsOf(failed)).toBe(0);
        expect(claimsOf(refused)).toBe(0);
    });
});

describe('⭐ a run that sought NOTHING is not a run that found nothing', () => {
    // Measured on the REAL Marseille PLUi règlement (34,584,817 bytes, fetched
    // live 2026-09-02): with no FR reader configured the spine returned
    // `ran · claims 0 · nothingFound 0`. A consumer reads that as "the ordinance
    // is silent". The truth was "PRYZM has no reader and never looked".
    it('fails with no-reader-configured rather than reporting a clean empty run', async () => {
        const out = await documentToClaims(request({ readers: [] }));
        expect(out.kind).toBe('failed');
        if (out.kind !== 'failed') return;
        expect(out.reason).toBe('no-reader-configured');
        expect(out.detail).toMatch(/GAP IN PRYZM, not a\s+statement about the document/u);
    });

    it('CONTROL — the same document WITH a reader still runs, so the guard discriminates', async () => {
        const out = await documentToClaims(request());
        expect(out.kind).toBe('ran');
    });
});
