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
 *
 * 🔴 CRITICAL — WHAT THESE NUMBERS ARE **NOT**.
 * On 2026-07-31 the full 209-page Begründung was downloaded and parsed end-to-end
 * (see `de/findings/GERMANY-PDF-INGESTION-WP1-WP6.md` §4). In context this clause
 * reads:
 *
 *   "Der [Baunutzungsplan], DER WEITER GILT, hat für den Geltungsbereich folgende
 *    Ausweisungen: … wird ein Allgemeines Wohngebiet mit einer zulässigen
 *    Grundflächenzahl (GRZ) von 0,3 sowie einer Geschossflächenzahl (GFZ) von 0,9
 *    DARGESTELLT."
 *
 * The verb is `dargestellt` (§5 BauGB — a preparatory instrument DEPICTS) and the
 * subject is the superseded 1958/60 Baunutzungsplan. **These are NOT B-Plan 8-30's
 * Festsetzungen.** 8-30's own binding values, stated on p56 with `begrenzt` and
 * §19 Abs. 2 / §20 Abs. 2 BauNVO, are **GRZ 0,4 / GFZ 1,2**.
 *
 * So this constant is a valid fixture for "can the pipeline READ this sentence",
 * and must NEVER be used as ground truth for what plan 8-30 permits.
 */
export const BERLIN_8_30_VERBATIM =
    '(GRZ) von 0,3 sowie einer Geschossflächenzahl (GFZ) von 0,9';

/**
 * ✅ VERBATIM, from the full-document run of 2026-07-31 — B-Plan 8-30's ACTUAL
 * binding Festsetzung (p56). This, not the constant above, is what the plan permits.
 */
export const BERLIN_8_30_ACTUAL_FESTSETZUNG =
    'Für das ca. 35.020 m² große Allgemeine Wohngebiet wird die zulässige Grundfläche gemäß § 19 Abs. 2 BauNVO auf eine Grundflächenzahl GRZ von 0,4 (dies entspricht ca. 14.010 m²) und die zulässige Geschossflächenzahl GFZ gemäß § 20 Abs. 2 BauNVO auf 1,2 (dies entspricht ca. 42.020 m²) begrenzt.';

/**
 * ✅ VERBATIM, from the same run (p8 context) — the legacy-instrument sentence in
 * full, so the `dargestellt` attribution reject can be tested against real text.
 */
export const BERLIN_8_30_LEGACY_INSTRUMENT_SENTENCE =
    'Für die im Plangebiet gelegenen Grundstücksflächen entlang der Buschkrugallee wird ein Allgemeines Wohngebiet mit einer zulässigen Grundflächenzahl (GRZ) von 0,3 sowie einer Geschossflächenzahl (GFZ) von 0,9 dargestellt.';

/**
 * ✅ VERBATIM, from the same run (p47) — a §19(4) BauNVO OVERRUN ceiling. Reading
 * this 0,8 as the GRZ overstates buildable footprint 2×.
 */
export const BERLIN_8_30_UEBERSCHREITUNG_SENTENCE =
    'Die Grundflächenzahl darf durch die Flächen für Stellplätze und Nebenanlagen überschritten werden, das einer GRZ von 0,8 entspricht.';

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
