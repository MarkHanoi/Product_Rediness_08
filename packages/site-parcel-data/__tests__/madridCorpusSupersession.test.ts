// §MADRID-CORPUS-SUPERSESSION (L-679) — the R4 trigger for SIG-M1.
//
// WHY A TEST AND NOT A SAMPLE
// ---------------------------
// The founder named four residual risks in the `esMadridPgoum97.ts` transcription and called them
// STRUCTURAL rather than statistical. Three of them (segmentation, unmodelled text, normalization)
// are properties of the text as it stands TODAY, so they are sampleable and are exhaustively
// tabulated in `extracted/SIG-M1-REVIEW-SAMPLE.md`.
//
// The fourth — *"future divergence if the Compendio is updated"* — cannot be sampled at all. No
// amount of reading today's edition tells you whether tomorrow's consolidation moves an article.
// A signature given against one edition silently becomes a signature against another the moment
// the PDF is replaced, and NOTHING would notice. That is the same failure shape as
// `MADRID_NZ1_CERTIFIED`: an authority claim that outlived the thing it was claimed against.
//
// So R4 is discharged by a MECHANISM: pin the corpus, and pin the per-article amendment baseline
// that the review was conducted against. If either moves, this test goes red and the signature is
// re-opened FOR THE AFFECTED ARTICLES ONLY — which keeps re-certification proportionate instead of
// forcing a whole-pack re-read for one changed footnote.
//
// ⚠ THIS TEST DOES NOT VALIDATE THE TRANSCRIPTION. It validates that the DOCUMENT the transcription
// was checked against is still the document in the repo. Those are different claims and collapsing
// them would be the §CONTEXT-DATA-HONESTY error at the custody layer.
//
// Authority: L-449 · ADR-0283 · ADR-0286 · C63 §1.6 · SIG-M1 (`sources/VERIFICATION.md`).

import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const DOSSIER = fileURLToPath(
    new URL('../../../docs/04-reference/jurisdictions/es/es-md/28079-madrid/', import.meta.url),
);
const CORPUS = `${DOSSIER}corpus/pdf/COMPENDIO_MPG_NNUU_24-09-2025_PGOUM-97.pdf`;
const REVIEW = `${DOSSIER}extracted/sig-m1-review-sample.json`;

/**
 * The edition SIG-M1's review was conducted against — Compendio 2025, consolidated 24-09-2025,
 * verified from the document's own PDF `title` metadata and cover page (VERIFICATION.md V19).
 * ⚠ DO NOT "fix" a failure here by updating this constant. A new hash means a new edition, and a
 * new edition means the review must be RE-RUN (`tools/madrid-extract/build_sig_m1_review.py`).
 */
const CORPUS_SHA256 = '1A3AA172B7ABE092F03E58FB2AFC26C87020B907887F919CEE20002E5FC4D0B5';
const CORPUS_BYTES = 25_735_355;
const CORPUS_PAGES = 626;

interface ReviewFile {
    readonly summary: { readonly shippedZones: number; readonly articlesCited: number };
    readonly supersessionTrigger: {
        readonly corpusSha256: string;
        readonly corpusPages: number;
        readonly articles: Record<string, { readonly pages: number[]; readonly amendments: string[] }>;
    };
}

describe('§MADRID-CORPUS-SUPERSESSION — R4, the risk that cannot be sampled', () => {
    it('the filed Compendio is byte-identical to the edition the review was run against', () => {
        expect(existsSync(CORPUS), `primary source missing: ${CORPUS}`).toBe(true);
        const bytes = readFileSync(CORPUS);
        expect(bytes.length).toBe(CORPUS_BYTES);
        expect(createHash('sha256').update(bytes).digest('hex').toUpperCase()).toBe(CORPUS_SHA256);
    });

    it('the review artefact exists and pins the SAME corpus', () => {
        expect(existsSync(REVIEW), `review artefact missing: ${REVIEW}`).toBe(true);
        const review = JSON.parse(readFileSync(REVIEW, 'utf8')) as ReviewFile;
        // The review must not be able to drift from the document it reviewed.
        expect(review.supersessionTrigger.corpusSha256).toBe(CORPUS_SHA256);
        expect(review.supersessionTrigger.corpusPages).toBe(CORPUS_PAGES);
        expect(review.summary.shippedZones).toBe(23);
    });

    it('the per-article amendment baseline is RECORDED — a changed footnote re-opens that article', () => {
        const review = JSON.parse(readFileSync(REVIEW, 'utf8')) as ReviewFile;
        const arts = review.supersessionTrigger.articles;
        const cited = Object.keys(arts);
        expect(cited.length).toBe(review.summary.articlesCited);
        expect(cited.length).toBeGreaterThanOrEqual(30);

        // ⚠ THE BASELINE IS NOT ZERO, AND THAT IS THE FINDING. A majority of the articles the pack
        // cites were ALREADY amended in this consolidation — so "the Compendio might change one day"
        // is not hypothetical for Madrid, it is the normal state of Título 8.
        const amended = cited.filter((a) => arts[a]!.amendments.length > 0);
        expect(amended.length).toBeGreaterThanOrEqual(15);

        // Every recorded amendment must name a real instrument + its BOCM publication, so a future
        // diff compares like with like rather than free text.
        for (const a of amended) {
            for (const note of arts[a]!.amendments) {
                expect(note, `${a}: unparseable amendment note`).toMatch(
                    /(MPG|PE)\s*\d+\/\d+\s*\(aprobación definitiva\s*[\d.]+\s*BOCM\s*[\d.]+\)/,
                );
            }
        }
    });

    it('every article in the baseline cites at least one page in the filed corpus', () => {
        const review = JSON.parse(readFileSync(REVIEW, 'utf8')) as ReviewFile;
        for (const [art, info] of Object.entries(review.supersessionTrigger.articles)) {
            expect(info.pages.length, `${art} names no page`).toBeGreaterThan(0);
            for (const p of info.pages) {
                expect(p, `${art}: page ${p} outside the ${CORPUS_PAGES}-page corpus`).toBeLessThanOrEqual(
                    CORPUS_PAGES,
                );
                expect(p).toBeGreaterThan(0);
            }
        }
    });
});
