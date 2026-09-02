// E8-TRIAL — THE GOLD SET.
//
// ⛔⛔ THIS SET IS **UNCONFIRMED BY HUMAN**. ⛔⛔
// Every value in it was derived by ONE AGENT reading the source documents on
// 2026-09-01. No planner, no lawyer and no reviewer has signed it. Until a named
// human confirms or corrects it, any precision figure computed against it is a
// SELF-ASSESSMENT and must be reported as one. It is built to be checkable —
// every row cites a page and either a verbatim sentence or a pdf.js column
// coordinate — precisely so that confirming it is cheap.
//
// WHAT IT IS FOR. The plan requires precision to be measured against a
// human-labelled sample BEFORE any bulk run. A human cannot be recruited by this
// lane, so this is the honest half: the HARNESS and a GOLD SET a human can later
// confirm or correct in place, with the provenance of every value recorded.
//
// ⛔ THE TRAP THIS SET AVOIDS. A gold set derived from the extractor's own output
// measures nothing (§fake-more-capable-than-real). No row below was produced by
// running `extractRules`. The CH table values come from POSITIONED PDF ITEMS read
// by column x; the prose values come from reading the normalized page text. The
// extractor was not run until the set was closed.

import type { GoldSet, Stratum } from './types.js';
import { CH_TABLE_ROWS } from './ch-table.js';
import { CH_PROSE_ROWS } from './ch-prose.js';
import { DE_PROSE_ROWS } from './de-prose.js';

const STRATA: readonly Stratum[] = [
    {
        id: 'CH-TABLE',
        label: 'Luzern BZR — Anhang 1 Zonen- und Dichtebestimmungen (table cells)',
        documentUrl: 'https://geoshop.lu.ch/pdf/luze_BZR.pdf',
        sha256: '26945c0f1a1d95d67a0c9a4d5a05c47c1fff517f2ea2196d97bda43547e3de67',
        pages: [26, 31],
        selectionRule:
            'Anhang 1 spans PDF pages 26–36. Page 26 = its FIRST page; page 31 = its SIXTH. Both chosen by POSITION in the annex, before any value was read, and neither because it parsed or was rich. Every zone row on both pages is in the set — none was dropped.',
        declaredBias: [
            'Two of eleven annex pages, so the stratum is not a random draw from the annex.',
            'A single canton and a single municipality; nothing here supports a claim about Swiss corpora generally.',
            'The ÜZ → maxCoverage mapping is an INTERPRETATION (the reglement never defines Überbauungsziffer); a Swiss planner must confirm it.',
        ],
        valueShape: 'table-cell',
        ingestionPath: 'born-digital-text',
        country: 'CH',
        sample: 'out-of-sample',
    },
    {
        id: 'CH-PROSE',
        label: 'Luzern BZR — body articles Art. 7–13 and Art. 26–28 (prose)',
        documentUrl: 'https://geoshop.lu.ch/pdf/luze_BZR.pdf',
        sha256: '26945c0f1a1d95d67a0c9a4d5a05c47c1fff517f2ea2196d97bda43547e3de67',
        pages: [5, 6, 7, 15],
        selectionRule:
            'The body pages carrying the zone articles (Art. 7–13) and the height article (Art. 26–28). A CONTENT-DIRECTED selection, declared as such.',
        declaredBias: [
            'Selected because these pages carry rules. Supports precision and failure-shape statements; does NOT support a document-level recall figure.',
            'Swiss German legal vocabulary against a grammar authored for German (DE) Festsetzungen — the mismatch is the measurement, not a defect of the corpus.',
        ],
        valueShape: 'prose',
        ingestionPath: 'born-digital-text',
        country: 'CH',
        sample: 'out-of-sample',
    },
    {
        id: 'DE-PROSE',
        label: 'Berlin B-Plan 1-19 (Begründung) — §II.4.3 Maß der baulichen Nutzung + Höhenfestsetzungen',
        documentUrl: 'https://fbinter.stadt-berlin.de/ScansBPlan/Begruendungen/0100019_1-19.pdf',
        sha256: '449b9a213876bd5d12da9ac8fe828b87ef4f5ffd291db8872b28ff8e38a5e86a',
        pages: [71, 72, 73, 74, 75],
        selectionRule:
            'The plan was drawn by a stated, outcome-independent rule: the first `.pdf` grund_www in Berlin WFS order (bplan:b_bp_fs, STARTINDEX=0, COUNT=300) after the two plans the German grammar was authored against (1-14, 8-30) that classified born-digital-text. The pages are the span of the document\'s OWN section heading "II.4.3. Maß der baulichen Nutzung" through the end of "Höhenfestsetzungen".',
        declaredBias: [
            'One plan, one city. A Begründung is argumentative prose, so it carries far more non-binding numbers than a Festsetzungstext would — this stratum is harder than average, deliberately.',
            'The section is rule-bearing by construction, so it measures precision and failure shape, not document-level recall.',
        ],
        valueShape: 'prose',
        ingestionPath: 'born-digital-text',
        country: 'DE',
        sample: 'out-of-sample',
    },
];

export const E8_GOLD_SET: GoldSet = {
    version: 'e8-trial-1',
    authoredOn: '2026-09-01',
    authoredBy:
        'lane E8-TRIAL (agent). ⛔ UNCONFIRMED BY HUMAN — no planner, lawyer or reviewer has signed any row.',
    humanConfirmed: false,
    strata: STRATA,
    rows: [...CH_TABLE_ROWS, ...CH_PROSE_ROWS, ...DE_PROSE_ROWS],
};
