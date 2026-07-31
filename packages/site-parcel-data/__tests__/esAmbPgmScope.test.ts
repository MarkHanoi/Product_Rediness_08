// §AMB-PGM-SCOPE — the transcribed scope map, PINNED.
//
// WHAT THESE TESTS GUARD
// ----------------------
// The scope map is a TRANSCRIPTION of the PGM NNUU's own per-article footnotes
// (`NN. Veure modificació per al Municipi de <X> a la pàg. <P>`). Three failures would be silent
// and each would produce a wrong-jurisdiction legal answer:
//
//   1. **A municipality quietly dropped from an article's list.** The first extraction pass lost
//      "Santa Coloma de Gramenet" from Arts. 323/325 because the name WRAPPED across two lines and
//      a line-at-a-time regex never saw it. A dropped entry reads as "no modification here" — i.e.
//      it converts a KNOWN local rewrite into a false metropolitan claim. §4 pins the counts.
//   2. **`'metropolitan-no-recorded-modification'` drifting into meaning "verified unmodified".**
//      The compendium says of itself that it is non-official and NOT exhaustive; the verdict name
//      and the caveats are the only thing holding that line. §5 pins the caveats' presence.
//   3. **Badalona treated like its neighbours.** Badalona rewrote almost every envelope article;
//      L'Hospitalet / Cornellà / Sant Boi rewrote none. Collapsing the two cases is exactly the
//      mis-citation the four refusals exist to prevent. §2/§3 pin the asymmetry.
//
// Plus §6: a ROUTING proof that each AMB municipality resolves to ITS OWN jurisdiction, never to
// Barcelona — the defect `24d324bd` fixed, re-asserted from the shipped boxes.

import { describe, it, expect } from 'vitest';
import {
    AMB_PGM_ARTICLE_SCOPE,
    AMB_PGM_SCOPE_CAVEATS,
    AMB_PGM_METROPOLITAN_INSTRUMENT,
    ambArticleScopeFor,
    ambModifiedArticlesFor,
} from '../src/rulepacks/esAmbPgmScope.js';
import { resolveRegisteredJurisdictionAt, BCN_JURISDICTION_ID } from '../src/rulepacks/registry.js';
import { LHOSPITALET_JURISDICTION_ID } from '../src/rulepacks/esLHospitalet.js';
import { BADALONA_JURISDICTION_ID } from '../src/rulepacks/esBadalona.js';
import { SANT_BOI_JURISDICTION_ID } from '../src/rulepacks/esSantBoi.js';
import { CORNELLA_JURISDICTION_ID } from '../src/rulepacks/esCornella.js';

/** The articles PRYZM's Barcelona packs actually depend on. */
const ENVELOPE_ARTICLES = [
    306, 314, 316, 320, 322, 323, 326, 327, 328, 330, 342, 343, 345, 350, 355, 356, 357, 358, 359,
    360, 361, 362, 363, 364, 365, 366, 367, 368,
] as const;

describe('§AMB-PGM-SCOPE §1 — the map is a transcription, not a guess', () => {
    it('every row carries the article it claims, and printed+1 === pdfPage throughout', () => {
        expect(AMB_PGM_ARTICLE_SCOPE.size).toBeGreaterThan(25);
        for (const [key, scope] of AMB_PGM_ARTICLE_SCOPE) {
            expect(scope.article).toBe(key);
            expect(scope.subject.trim().length).toBeGreaterThan(0);
            for (const m of scope.modifiedBy) {
                // The footnote cites the PRINTED page; the repo PDF is offset by exactly one.
                expect(m.pdfPage).toBe(m.printedPage + 1);
                expect(m.printedPage).toBeGreaterThan(123); // inside the Modificacions annex
            }
        }
    });

    it('an article with modifications always has a footnote marker, and vice versa', () => {
        for (const scope of AMB_PGM_ARTICLE_SCOPE.values()) {
            if (scope.modifiedBy.length > 0) expect(scope.footnote).not.toBeNull();
            if (scope.footnote === null) expect(scope.modifiedBy).toHaveLength(0);
        }
    });
});

describe('§AMB-PGM-SCOPE §2 — Badalona rewrote the envelope; its neighbours did not', () => {
    it('Badalona modifies every envelope article PRYZM relies on', () => {
        // Verbatim from the base text's footnotes 13/15/46/47/49/50/52/55/56/59.
        expect(ambModifiedArticlesFor(BADALONA_JURISDICTION_ID)).toEqual([
            238, 242, 320, 323, 327, 328, 330, 342, 343, 363,
        ]);
    });

    it('Arts. 327 and 328 — the alçada tables — are Badalona-modified, cited to pp.137/138', () => {
        for (const art of [327, 328] as const) {
            const a = ambArticleScopeFor(art, BADALONA_JURISDICTION_ID);
            expect(a.verdict).toBe('municipally-modified');
            expect(a.modification?.printedPage).toBe(137);
            expect(a.modification?.pdfPage).toBe(138);
            expect(a.reason).toContain('Veure modificació per al Municipi de Badalona');
        }
    });

    it('Art. 242 — the ADR-0271 depth construction — is Badalona-modified (fn 15, p.135)', () => {
        const a = ambArticleScopeFor(242, BADALONA_JURISDICTION_ID);
        expect(a.verdict).toBe('municipally-modified');
        expect(a.scope?.footnote).toBe(15);
        expect(a.modification?.printedPage).toBe(135);
    });

    it('L’Hospitalet, Cornellà and Sant Boi modify NO envelope article', () => {
        for (const j of [
            LHOSPITALET_JURISDICTION_ID,
            CORNELLA_JURISDICTION_ID,
            SANT_BOI_JURISDICTION_ID,
        ]) {
            expect(ambModifiedArticlesFor(j)).toEqual([]);
            for (const art of ENVELOPE_ARTICLES) {
                expect(ambArticleScopeFor(art, j).verdict).toBe(
                    'metropolitan-no-recorded-modification',
                );
            }
        }
    });
});

describe('§AMB-PGM-SCOPE §3 — Barcelona is NOT privileged in the base text', () => {
    it('Barcelona itself rewrote Arts. 327 and 328 (fn 49/50 → printed pp.276/277)', () => {
        // ⚠ This is the finding that corrects `bcnAlcadaReguladora.ts`'s old claim that the
        // consolidated PGM "carries none on this article". It carries two, and one is Barcelona.
        const a327 = ambArticleScopeFor(327, BCN_JURISDICTION_ID);
        expect(a327.verdict).toBe('municipally-modified');
        expect(a327.scope?.footnote).toBe(49);
        expect(a327.modification?.printedPage).toBe(276);
        expect(a327.modification?.pdfPage).toBe(277);

        const a328 = ambArticleScopeFor(328, BCN_JURISDICTION_ID);
        expect(a328.verdict).toBe('municipally-modified');
        expect(a328.scope?.footnote).toBe(50);
        expect(a328.modification?.printedPage).toBe(277);
    });

    it('Arts. 322 and 326 carry NO footnote at all — nobody rewrote them', () => {
        // 326 routes 13a/13b to the Art. 242 depth construction; 322 is NOT-THE-RULE-KIND
        // (edificabilitat is the volume envelope, so there is no per-parcel FAR). Both matter to
        // the packs, and both stand metropolitan everywhere in this compendium.
        for (const art of [322, 326] as const) {
            const scope = AMB_PGM_ARTICLE_SCOPE.get(art);
            expect(scope?.footnote).toBeNull();
            expect(scope?.modifiedBy).toHaveLength(0);
        }
    });

    it('Art. 323 keeps all THREE municipalities — the wrapped-name regression pin', () => {
        // "Santa Coloma de Gramenet" wraps across two lines in footnote 47. The first extraction
        // dropped it, which would have read as "Santa Coloma did not modify Art. 323" — a false
        // metropolitan claim on another municipality's land. Count-pinned so it cannot re-drop.
        const names = AMB_PGM_ARTICLE_SCOPE.get(323)?.modifiedBy.map((m) => m.municipalityInSource);
        expect(names).toEqual(['Barcelona', 'Badalona', 'Santa Coloma de Gramenet']);
    });

    it('Art. 342 keeps all FOUR municipalities (fn 55)', () => {
        const names = AMB_PGM_ARTICLE_SCOPE.get(342)?.modifiedBy.map((m) => m.municipalityInSource);
        expect(names).toEqual([
            'Barcelona',
            'Cerdanyola del Vallès',
            'Badalona',
            'Santa Coloma de Gramenet',
        ]);
    });
});

describe('§AMB-PGM-SCOPE §4 — the map refuses to guess', () => {
    it('an untranscribed article answers "unknown", never a verdict', () => {
        const a = ambArticleScopeFor(999, BCN_JURISDICTION_ID);
        expect(a.verdict).toBe('unknown');
        expect(a.scope).toBeNull();
        expect(a.modification).toBeNull();
    });

    it('a municipality the map cannot speak for answers "unknown", not "unmodified"', () => {
        // Membership of the AMB does NOT imply the PGM governs a municipality: Art. 1.1 scopes the
        // plan to the pre-2011 27-municipality EMMB, while today's AMB has 36. Answering
        // 'metropolitan-no-recorded-modification' here would assert PGM force over land the plan
        // may not reach at all.
        const a = ambArticleScopeFor(327, 'es-08123-not-a-pgm-municipality');
        expect(a.verdict).toBe('unknown');
        expect(a.reason).toContain('Entitat Municipal Metropolitana');
    });

    it('never throws, for any article/jurisdiction pair', () => {
        for (const art of [0, -1, 1.5, 238, 999, Number.NaN]) {
            for (const j of ['', BCN_JURISDICTION_ID, 'nonsense']) {
                expect(() => ambArticleScopeFor(art, j)).not.toThrow();
            }
        }
    });
});

describe('§AMB-PGM-SCOPE §5 — the caveats are load-bearing and must ship', () => {
    it('carries the non-exhaustive, non-official and stale/narrow caveats', () => {
        expect(AMB_PGM_SCOPE_CAVEATS).toHaveLength(3);
        const blob = AMB_PGM_SCOPE_CAVEATS.join(' ');
        // The publisher's own words — the reason an empty list is not proof of anything.
        expect(blob).toContain('NO HI FIGUREN TOTES LES MODIFICACIONS');
        expect(blob).toContain('merament divulgativa');
        expect(blob).toContain('31-12-2009');
        expect(blob).toContain('Entitat Municipal Metropolitana');
    });

    it('the "no recorded modification" verdict always says so in its own reason', () => {
        const a = ambArticleScopeFor(327, LHOSPITALET_JURISDICTION_ID);
        expect(a.verdict).toBe('metropolitan-no-recorded-modification');
        expect(a.reason).toContain('NO modification');
        expect(a.reason).toContain('NOT exhaustive');
    });

    it('the instrument string is METROPOLITAN and never cites Barcelona as the authority', () => {
        expect(AMB_PGM_METROPOLITAN_INSTRUMENT).toContain('Pla General Metropolità');
        expect(AMB_PGM_METROPOLITAN_INSTRUMENT).toContain('Entitat Municipal Metropolitana');
        expect(AMB_PGM_METROPOLITAN_INSTRUMENT).toContain('non-exhaustive');
        expect(AMB_PGM_METROPOLITAN_INSTRUMENT).not.toContain('es-08019');
    });
});

describe('§AMB-PGM-SCOPE §6 — each AMB municipality still routes to ITS OWN jurisdiction', () => {
    // The wrong-jurisdiction defect `24d324bd` fixed: Barcelona's box is a ~44 × 42 km proximity
    // gate that fully contains all four, so without the specificity ladder every one of these
    // points would answer `es-08019-barcelona` and be handed Barcelona's citations.
    const POINTS: ReadonlyArray<readonly [string, number, number, string]> = [
        ["L'Hospitalet centre", 41.3593, 2.1004, LHOSPITALET_JURISDICTION_ID],
        ['Badalona centre', 41.4469, 2.2456, BADALONA_JURISDICTION_ID],
        ['Sant Boi centre', 41.3436, 2.0378, SANT_BOI_JURISDICTION_ID],
        ['Cornellà centre', 41.3559, 2.0705, CORNELLA_JURISDICTION_ID],
        ['Barcelona Eixample', 41.3916, 2.165, BCN_JURISDICTION_ID],
    ];

    for (const [name, lat, lon, expected] of POINTS) {
        it(`${name} resolves to ${expected}`, () => {
            const r = resolveRegisteredJurisdictionAt(lat, lon);
            expect(r.kind).toBe('resolved');
            if (r.kind !== 'resolved') return;
            expect(r.jurisdiction.jurisdictionId).toBe(expected);
        });
    }

    it('the four AMB municipalities never resolve to Barcelona', () => {
        for (const [name, lat, lon, expected] of POINTS) {
            if (expected === BCN_JURISDICTION_ID) continue;
            const r = resolveRegisteredJurisdictionAt(lat, lon);
            expect(r.kind, name).toBe('resolved');
            if (r.kind !== 'resolved') continue;
            expect(r.jurisdiction.jurisdictionId, name).not.toBe(BCN_JURISDICTION_ID);
        }
    });
});
