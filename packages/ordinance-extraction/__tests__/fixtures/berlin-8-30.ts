// TEST FIXTURE — Berlin B-Plan 8-30 (Neukölln), Begründung.
//
// ⚠ READ THE PROVENANCE LABELS. This file mixes ONE verbatim primary-source string
// with SYNTHETIC German prose, and which is which is load-bearing. A test that
// passes on invented text proves the parser handles the text we imagined, not the
// text Berlin publishes. Every export below states its own status.
//
// SOURCE OF TRUTH:
//   docs/04-reference/jurisdictions/de/de-be/11000-berlin/PROBE-VERDICT-2026-07-31.md
//   §4 — "DECISIVE: the 8-30 Begründung is a TEXT-LAYER (born-digital) PDF".
//   The 2026-07-31 founder live probe pulled 637,988 characters of clean German
//   text out of the 215-page Begründung's Flate content streams and quoted the
//   planning parameters verbatim.
//
// WHAT WE DO **NOT** HAVE HERE: the 637,988-character extraction itself. This
// repository holds the probe's REPORT, not its output. So the verbatim material
// available to a test is exactly the one fragment §4 quotes — and that fragment is
// used below, unedited, precisely because it is the only text with real provenance.
//
// The 8-30 row is deliberately held at `pending-L449` (verdict §"Corrections
// applied"): the probe SAW GRZ 0,3 / GFZ 0,9 in the primary source, but formal
// extraction plus human sign-off into a served row has not happened. Nothing in
// this fixture may be read as a verified Berlin planning value.

/**
 * ✅ VERBATIM PRIMARY SOURCE. Quoted character-for-character from
 * PROBE-VERDICT-2026-07-31.md §4, which quotes it from the born-digital text of
 * the 8-30 Begründung.
 *
 * Note it begins mid-sentence, at an opening parenthesis — that is how the probe
 * reported it, and it is left exactly so. Real extracted text is ragged; a parser
 * that only works on tidy full sentences is a parser that works on our imagination.
 */
export const BERLIN_8_30_VERBATIM =
    '(GRZ) von 0,3 sowie einer Geschossflächenzahl (GFZ) von 0,9';

/**
 * ⚠ RECONSTRUCTED, NOT VERBATIM. The verbatim fragment above with a plausible
 * German sentence frame added around it, so the § finder and sentence segmentation
 * have something to bite on. The FRAME is invented; only the inner clause is real.
 * Used to test locator resolution, never to assert a Berlin value that the frame
 * itself supplies.
 */
export const BERLIN_8_30_RECONSTRUCTED_SENTENCE =
    `Gemäß § 13a BauGB wird für das Plangebiet eine Grundflächenzahl ${BERLIN_8_30_VERBATIM} festgesetzt.`;

/**
 * ⚠ FULLY SYNTHETIC. Written for this test suite in the house style of a German
 * Begründung to exercise paths the one real fragment cannot reach: the §17 BauNVO
 * Orientierungswerte reject, a Planzeichnung delegation, a Traufhöhe/Firsthöhe
 * pair, and a Vollgeschosse count.
 *
 * ⛔ NO planning value in this string describes any real Berlin parcel. It is a
 * parser exercise, not data.
 */
export const BERLIN_STYLE_SYNTHETIC_PROSE = [
    'Gemäß § 13a BauGB wird für das allgemeine Wohngebiet eine Grundflächenzahl (GRZ) von 0,4 festgesetzt.',
    'Die Zahl der Vollgeschosse beträgt III.',
    'Die Traufhöhe (TH) beträgt maximal 12,5 m.',
    'Die Firsthöhe (FH) darf 16,0 m nicht überschreiten.',
    'Die Lage der Baugrenzen ergibt sich aus der Planzeichnung.',
    'Die Orientierungswerte des § 17 BauNVO nennen für das allgemeine Wohngebiet eine GFZ von 1,2.',
].join('\n');

/** The document the fixture text is cited to (the real `grund_www` file name). */
export const BERLIN_8_30_SOURCE = {
    /** From PROBE-VERDICT §3: grund_www → …/begruendung/begruendung-8-30.pdf */
    document: 'begruendung-8-30.pdf',
    /**
     * `null`, not a number. The probe reported a page COUNT (215) but no page index
     * for the quoted fragment, and inventing one would fabricate the very locator a
     * human reviewer is meant to check (L-449).
     */
    page: null,
} as const;
