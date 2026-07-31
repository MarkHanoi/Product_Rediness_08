// WP5 — REGRESSION TESTS FROM REAL PLANNING DOCUMENTS.
//
// Every sentence in this file was read out of an actual Berlin Begründung PDF on
// 2026-07-31 by the ingestion stack (WFS → grund_www → download → pdf.js →
// normalize). None of it is invented. The synthetic suites still run and still
// encode real reasoning, but THIS is the file that speaks for the corpus.
//
// The headline case is the instrument-attribution defect documented in
// docs/04-reference/jurisdictions/de/findings/GERMANY-PDF-INGESTION-WP1-WP6.md §4:
// one 209-page document states GRZ 0,3 · 0,39 · 0,4 · 0,8, every one a correct
// reading of its own sentence, and only 0,4 the plan's binding Festsetzung.

import { describe, expect, it } from 'vitest';
import { extractRules } from '../src/textExtract/extractor.js';
import { GERMAN_GRAMMAR } from '../src/grammars/german.js';
import { toEnvelopeParameters, findParameter } from '../src/envelope/mapper.js';
import { type EnvelopeExtraction } from '../src/envelope/types.js';
import { normalizeOrdinanceText } from '../src/ingest/normalize.js';
import { joinPdfTextItems, type PdfTextItemLike } from '../src/ingest/pdfItems.js';
import {
    BERLIN_8_30_ACTUAL_FESTSETZUNG,
    BERLIN_8_30_LEGACY_INSTRUMENT_SENTENCE,
    BERLIN_8_30_SOURCE,
    BERLIN_8_30_UEBERSCHREITUNG_SENTENCE,
} from './fixtures/berlin-8-30.js';

function envelopeOf(text: string): EnvelopeExtraction {
    const env = toEnvelopeParameters(extractRules(text, GERMAN_GRAMMAR, BERLIN_8_30_SOURCE));
    if (!env.ok) throw new Error(`expected an envelope, got refusal: ${env.reason}`);
    return env;
}

describe('REAL 8-30 p56 — the plan’s actual binding Festsetzung', () => {
    it('reads GRZ 0,4 and GFZ 1,2 from the real §19/§20 BauNVO sentence', () => {
        const env = envelopeOf(BERLIN_8_30_ACTUAL_FESTSETZUNG);
        const grz = findParameter(env, 'maxCoverage');
        const gfz = findParameter(env, 'maxFAR');
        if (grz?.status !== 'resolved') throw new Error(`GRZ was ${grz?.status}`);
        if (gfz?.status !== 'resolved') throw new Error(`GFZ was ${gfz?.status}`);
        expect(grz.value).toBeCloseTo(0.4, 10);
        expect(gfz.value).toBeCloseTo(1.2, 10);
    });

    it('is NOT rejected — "begrenzt" is a binding Festsetzung verb', () => {
        // The sentence contains "Grundfläche" and area figures that a clumsier
        // reject set could trip over. It must survive.
        const env = envelopeOf(BERLIN_8_30_ACTUAL_FESTSETZUNG);
        expect(env.summary.resolved).toBeGreaterThanOrEqual(2);
    });

    it('does not mistake the m² area figures (35.020 / 14.010) for ratios', () => {
        // German thousands-dot: "35.020 m²" must never parse as 35.02.
        const env = envelopeOf(BERLIN_8_30_ACTUAL_FESTSETZUNG);
        const grz = findParameter(env, 'maxCoverage');
        if (grz?.status !== 'resolved') throw new Error('expected resolved');
        expect(grz.value).toBeLessThan(1); // a coverage ratio, not an area
    });
});

describe('REAL 8-30 p8 — the legacy instrument’s depiction must NOT become the plan’s value', () => {
    it('REJECTS GRZ 0,3 / GFZ 0,9 because the verb is "dargestellt", not "festgesetzt"', () => {
        const env = envelopeOf(BERLIN_8_30_LEGACY_INSTRUMENT_SENTENCE);
        // §5 BauGB "darstellen" = a preparatory instrument DEPICTS. Not this plan.
        expect(findParameter(env, 'maxCoverage')?.status).toBe('unknown');
        expect(findParameter(env, 'maxFAR')?.status).toBe('unknown');
    });

    it('records the drop on the audit trail rather than dropping it silently', () => {
        const env = envelopeOf(BERLIN_8_30_LEGACY_INSTRUMENT_SENTENCE);
        expect(env.rejected.length).toBeGreaterThan(0);
        expect(env.rejected.some((r) => r.rejectId === 'de-dargestellt-not-festgesetzt')).toBe(
            true,
        );
    });

    it('explains WHY, in a sentence a human reviewer can act on', () => {
        const env = envelopeOf(BERLIN_8_30_LEGACY_INSTRUMENT_SENTENCE);
        const grz = findParameter(env, 'maxCoverage');
        if (grz?.status !== 'unknown') throw new Error('expected unknown');
        expect(grz.reason).toBe('rejected-not-parcel-rule');
    });
});

describe('REAL 8-30 p47 — a §19(4) overrun ceiling is not the base GRZ', () => {
    it('REJECTS the 0,8 overrun value (taking it as GRZ overstates footprint 2×)', () => {
        const env = envelopeOf(BERLIN_8_30_UEBERSCHREITUNG_SENTENCE);
        expect(findParameter(env, 'maxCoverage')?.status).toBe('unknown');
        expect(env.rejected.some((r) => r.rejectId === 'de-ueberschreitung-19-4')).toBe(true);
    });
});

describe('REAL 8-30 p58 — one sentence doing two jobs (the `unless` escape)', () => {
    // Verbatim shape from the real document: cites the §19(4) overrun rule AND
    // states the binding value. A blanket §19(4) reject would discard 0,4.
    const BOTH =
        'Zusätzlich wird mit der ausschließlichen Beschränkung der Überschreitung der GRZ auf den § 19 Abs. 4 BauNVO sichergestellt, dass die Hauptanlagen weiterhin entsprechend der festgesetzten GRZ von 0,4 zu errichten sind.';

    it('still yields GRZ 0,4 despite the §19(4) reference in the same sentence', () => {
        const grz = findParameter(envelopeOf(BOTH), 'maxCoverage');
        if (grz?.status !== 'resolved') throw new Error(`GRZ was ${grz?.status}`);
        expect(grz.value).toBeCloseTo(0.4, 10);
    });
});

describe('REAL pdf.js item geometry — the double-newline defect (Layer 2)', () => {
    // The fix belongs in the ITEM JOINER, not the normalizer: a blank line is a
    // legitimate paragraph boundary, so the normalizer must keep honouring it. The
    // defect was that pdf.js emitted a blank line for every ORDINARY line break.
    const line = (str: string, y: number, hasEOL: boolean): PdfTextItemLike => ({
        str,
        width: str.length * 5,
        transform: [1, 0, 0, 1, 0, y],
        hasEOL,
    });

    it('emits ONE newline per line break even when hasEOL and the baseline both move', () => {
        const text = joinPdfTextItems([
            line('… GRZ von 0,3 sowie einer', 700, true),
            line('Geschossflächenzahl (GFZ) von 0,9 dargestellt.', 680, true),
        ]);
        expect(text).not.toContain('\n\n');
        expect(text.split('\n').filter((l) => l !== '')).toHaveLength(2);
    });

    it('the joined output then MERGES into one sentence, so "dargestellt" is reachable', () => {
        const joined = joinPdfTextItems([
            line('Allgemeines Wohngebiet mit einer zulässigen Grundflächenzahl (GRZ) von 0,3 sowie einer', 700, true),
            line('Geschossflächenzahl (GFZ) von 0,9 dargestellt. Für den Blockinnenbereich gilt der Baunut-', 680, true),
            line('zungsplan dagegen nicht.', 660, true),
        ]);
        const { text } = normalizeOrdinanceText(joined);
        expect(text).toContain(
            'GRZ von 0,3 sowie einer Geschossflächenzahl GFZ von 0,9 dargestellt.',
        );
        // …and the German compound broken across lines is rejoined.
        expect(text).toContain('Baunutzungsplan');
    });

    it('END TO END: the repaired text is now REJECTED as another instrument’s value', () => {
        // This is the whole chain the defect defeated: geometry → text → normalize
        // → grammar → envelope. With the double newline, 0,3 leaked through as if
        // it were the plan's GRZ.
        const joined = joinPdfTextItems([
            line('Allgemeines Wohngebiet mit einer zulässigen Grundflächenzahl (GRZ) von 0,3 sowie einer', 700, true),
            line('Geschossflächenzahl (GFZ) von 0,9 dargestellt.', 680, true),
        ]);
        const env = envelopeOf(normalizeOrdinanceText(joined).text);
        expect(findParameter(env, 'maxCoverage')?.status).toBe('unknown');
    });

    it('restores word gaps the PDF encoded as horizontal jumps, not spaces', () => {
        // "Begründunggemäß" — observed verbatim on Berlin plan 1-14 p1.
        const text = joinPdfTextItems([
            { str: 'Begründung', width: 50, transform: [1, 0, 0, 1, 0, 700] },
            { str: 'gemäß', width: 25, transform: [1, 0, 0, 1, 60, 700] },
        ]);
        expect(text).toBe('Begründung gemäß');
    });
});

describe('REAL normalization shapes', () => {

    it('handles the bare mid-sentence fragment shape structurally (no KEYWORD_TAIL needed)', () => {
        // The original real-corpus failure: an excerpt starting at "(GRZ)".
        const { text } = normalizeOrdinanceText('(GRZ) von 0,3 sowie einer Geschossflächenzahl (GFZ) von 0,9');
        expect(text).toBe('GRZ von 0,3 sowie einer Geschossflächenzahl GFZ von 0,9');
    });

    it('drops an orphan closing bracket — the "…) WR" shape', () => {
        const { text, stats } = normalizeOrdinanceText('…) WR mit einer GRZ von 0,4');
        expect(text).not.toContain(')');
        expect(stats.orphanBracketsDropped).toBe(1);
    });
});
