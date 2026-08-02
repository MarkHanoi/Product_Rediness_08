// ── CANARIAS (ES-CN) — the SIPU 2.6.A adapter machinery. ────────────────────────────────────
//
// ⚠⚠ THIS FILE ADDS A **ROUTE**, NOT A PERMISSION. `CANARIAS_ENVELOPE_VERIFIED` is `false` and
// its `signature` is `null`. Under §UNSIGNED-GATE-DEFAULTS-SHUT and ADR-0283 that is the honest
// default: L-449 reserves certification to a human, and a model that opens its own publication
// gate is the `MADRID_NZ1_CERTIFIED` defect. Every Canarias parcel therefore resolves to a CITED
// REFUSAL today. The pack, the provider and the test exist so that a signature is the ONLY thing
// standing between the repo and a drawn envelope — which is exactly where the decision belongs.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// WHAT CANARIAS PUBLISHES, AND WHY IT IS DIFFERENT FROM EVERY OTHER SPANISH REGION HERE
// ══════════════════════════════════════════════════════════════════════════════════════════════
// The Gobierno de Canarias publishes every municipal planning instrument as a **SIPU** package on
// `opendata.sitcan.es` (CKAN, `format:SIPU`, 1 169 resources, all 88 municipalities). Inside each
// package, `EDIF.mdb` is the *Archivo de Zonas de Edificación*: ONE ROW PER BUILT-FORM ZONE with
// NAMED NUMERIC COLUMNS for the envelope parameters, plus `EDIF.shp`/`EDIF.dbf` carrying the
// polygons that cite each zone code (`ETIQUETA`) in WGS84-UTM-28N.
//
// ⭐ THAT IS THE THING NO OTHER REGION IN THIS PROGRAMME HAS: a machine-readable, regionally
// HARMONISED built-form schema. València puts its envelope on the Plano C sheets; Madrid's
// Norma Zonal needs a per-ficha reading; Córdoba's came out of an OCR pipeline. Canarias
// publishes the parameters as COLUMNS, under one schema, for the whole region.
//
// ⭐⭐ AND IT NAMES **BOTH** GRAMMARS PRYZM ALREADY IMPLEMENTS, in the same table:
//     `SepMinFr` / `SepMinPs` / `SepMinLt`  → a per-edge SETBACK inset      (`kind:'setback'`)
//     `DispObl` + `FonMaxEd(m)`             → ALIGNMENT + BUILDABLE DEPTH   (`kind:'alignment'`)
//     `PMaxOcup`                            → footprint by COVERAGE ratio
// ⛔ SO NO NEW GEOMETRY ENGINE IS REQUIRED, AND NONE IS ADDED. The `esBarcelona20aAillada` inset
// path and the Art. 242.2 alignment machinery are untouched; Canarias is wired INTO them.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// THE MEASUREMENT THIS ADAPTER RESTS ON (87-municipality base-plan corpus, 2026-08-02)
// ══════════════════════════════════════════════════════════════════════════════════════════════
// Reproduced and extended in `tools/canarias-envelope-max/`. Numbers are ZONE-weighted over the
// EDIF rule rows unless stated; the LAND-weighted figure is always different and is stated
// separately, because in this corpus the top 1 % of rule rows govern a double-digit share of the
// polygon land (the Balears lesson: land-weighting is not decorative).
//
// Corpus: 73 archives with a readable EDIF table, 10 052 zone rows, 636.1 km² of polygon land.
//
//   columns only                              15.6 % any-drawable  (24.2 % land-weighted)
//   + the memo channel (`otrasDet`/`detUso`)  17.8 %               (30.8 % land-weighted)
//   + private-developable denominator         17.8 %               (25.5 % land-weighted)
//   + routable municipalities only            18.1 %               (31.4 % land-weighted)
//
// Of that, COMPLETE rule (setbacks AND coverage AND height AND FAR) is only 3.2 %; the rest is
// PARTIAL — a footprint rule plus a height, which DRAWS. ⭐ Requiring completeness would have
// discarded ~15 of the ~18 points. 12.9 % of the routable rows are Obs*-CONDITIONED.
//
// ⚠⚠ **THE BALEARS DENOMINATOR LEVER DOES NOT REPRODUCE HERE, AND THAT IS A FINDING, NOT A
// FAILURE TO APPLY IT.** In Balears, excluding road / public open space / infrastructure moved
// complete-rule 41.6 % → 61.4 %, because that land carried no parameters. In Canarias the
// excluded classes are as drawable as the corpus average or more so (EQUIPMENT 21.4 %,
// PROTECTED_RUSTIC 22.2 %, PUBLIC_SYSTEM 13.1 %, against a 15.6 % corpus average), so excluding
// them moves the zone-weighted rate by +0.1 pt and the LAND-weighted rate DOWN by 5.3 pts. The
// non-circularity audit in `04_maximum.py` is what surfaced this: classification is made purely
// on the LAND CLASS NAMED IN THE RECORD, never on whether the row carries parameters, so the
// rate cannot be true by construction. The reason is structural: `EDIF.mdb` is already the ARCHIVE OF BUILDING
// ZONES — roads and open space mostly live in other SIPU families (`RUS`, `USOS`, `ZUSO`) and
// were never in this denominator to begin with. Reporting a rise here would have meant
// inventing one.
//
// ⚠ THE DOMINANT CELL VALUE IN EVERY PARAMETER COLUMN IS THE SENTINEL `'I'` (~5 500–6 000 of
// ~7 400 rows per column). PRYZM does NOT hold the SIPU 2.6.A codebook, so what `'I'` MEANS is
// **UNKNOWN** — and UNKNOWN is not zero and not absence. See `SIPU_SENTINELS` below.
//
// PURITY: L2-pure (C58 §1.1/§1.9) — no I/O, no THREE, no DOM, no clock, no RNG.
//
// Strategic context — ADR-0283, ADR-0270/0271 (GeometricRule), C58 §1.4/§1.6/§1.11/§1.13,
// C63 §1.6, L-449, L-616, L-656, L-677.

import { trace } from '@opentelemetry/api';
import type { EnvelopeRefusal } from '@pryzm/schemas';

const tracer = trace.getTracer('pryzm.zoning.canarias');

/** The jurisdiction id Canarias records and registrations use. One constant, not a literal. */
export const CANARIAS_JURISDICTION_ID = 'es-cn-canarias';

/** Telde (INE 35026, Gran Canaria) — the pilot municipality. */
export const TELDE_JURISDICTION_ID = 'es-35026-telde';

/**
 * ⛔ **SHUT, AND `signature: null`.**
 *
 * This gate authorises publishing a computed envelope for Canarias. It is `false` because **no
 * human has signed the transcription**, and under L-449 transcribing an ordinance is a legal act
 * that a pack cannot perform on its own behalf. The adapter below is complete and tested; what is
 * missing is a signature, and a signature is not something this file may manufacture.
 *
 * WHAT A SIGNATORY WOULD BE SIGNING, stated plainly so the decision is informed:
 *  - that `EDIF.mdb`'s named columns ARE the governing built-form parameters for the zone code
 *    the polygon layer cites — verified against the instrument's own *Normas Urbanísticas*, which
 *    PRYZM has NOT retrieved for any municipality (the SIPU package ships the PDF, unread);
 *  - that the sentinel `'I'` means "no determination in this table" rather than "see the general
 *    ordinance". ⚠ **THIS IS THE MATERIAL UNKNOWN.** If `'I'` is a POINTER, then ~80 % of rows
 *    are not empty at all and both the coverage figure AND the refusals below are wrong in the
 *    conservative direction. PRYZM does not hold the SIPU 2.6.A codebook and did not guess;
 *  - that the height DATUM is read correctly per row (see `SIPU_HEIGHT_DATUM`).
 *
 * ⚠ AND A CEILING NO SIGNATURE LIFTS: the **PLANES INSULARES** (island plans) sit ABOVE municipal
 * determinations in the Canarian hierarchy and are UNMEASURED here. They can only ever OVER-grant
 * relative to what this pack computes, so under ADR-0283 a Canarias envelope must render as an
 * **OPEN TOP WITH A STATED REASON**, never as a closed maximum. The same holds for the unmodelled
 * heritage / coastal (*Ley de Costas*) / airport-servitude / flood / environmental constraints.
 */
export const CANARIAS_ENVELOPE_VERIFIED = false as const;

/**
 * The non-numeric vocabulary observed in SIPU `EDIF` parameter columns, MEASURED across the
 * 87-municipality base-plan corpus — never assumed.
 *
 * ⚠ THE BALEARS `AT` LESSON: an ASSUMED code dictionary reported metric height as 0/80 when the
 * truth was 49/80, because `AT` turned out to be *Allotjament turístic* — a USE, not a null. So
 * every token here was read off the tables, and the ones whose MEANING is still unknown say so.
 *
 * ⛔ NONE OF THESE IS ZERO. A cell holding a sentinel is UNKNOWN. Treating `'I'` as 0 in
 * `PMaxOcup` would publish "nothing may be built"; treating it as 0 in `SepMinFr` would publish
 * "build to the boundary". Both are fabricated determinations (L-616 mechanism-A).
 */
export const SIPU_SENTINELS: Readonly<Record<string, string>> = Object.freeze({
    // ⚠ THE DOMINANT ONE, AND ITS MEANING IS **UNKNOWN**. ~75-80 % of every parameter column.
    I:
        'UNKNOWN — the single most common cell value in every parameter column. Plausibly ' +
        '"Indiferente"/"Indefinido" (no determination) or a POINTER to the general ordinance. ' +
        'PRYZM does not hold the SIPU 2.6.A codebook and does NOT guess. Treated as UNKNOWN.',
    COM:
        'UNKNOWN — plausibly "Común" (determined by the common/general ordinance). Treated as ' +
        'UNKNOWN, i.e. the parameter is not readable FROM THIS TABLE.',
    NP: 'UNKNOWN — plausibly "No procede" (not applicable to this zone).',
    T: 'UNKNOWN.',
    GRF:
        '"Gráfico" — THE DETERMINATION IS ON A PLAN SHEET. This is the València Plano C ' +
        'situation exactly: the rule exists, is published, and is NOT data PRYZM holds. It is a ' +
        'REFUSAL WITH A NAMED CAUSE, which is strictly better than an absence.',
    AV:
        '"Alineación a vial" — the façade sits ON the street line. A GRAMMAR SIGNAL, not a null: ' +
        'it selects the alignment+depth geometric rule.',
    'AV+GRF': 'Aligned to the street AND graphed. Grammar known, line not held.',
    F:
        'UNKNOWN — observed alongside a metric `DispOblm`, i.e. a mandatory façade line at a ' +
        'stated distance. Read as an alignment signal ONLY when `DispOblm` is itself numeric.',
});

/**
 * Which datum a SIPU height is measured from. ⚠ RECORDING THIS IS NOT OPTIONAL.
 *
 * Madrid's `NM_ALTURA` is uninterpretable precisely because its datum is unstated, and §terrain-
 * rasant (L-584) is the same defect one level down: an ordinance measures height from the
 * *rasante* AT THE FAÇADE, and sampling one point at a block centroid is a LEGAL error, not a
 * rounding error. Canarias is unusual in disambiguating BY SCHEMA — two different columns.
 *
 * Measured distribution over the corpus (share of all EDIF rows):
 *   no height published                 74.4 %
 *   `AltMaxPl` floors only, NO datum    14.9 %   ⚠ a storey count is not a metric height
 *   `AltMaxMV` from the STREET           6.3 %
 *   `AltMaxMP` from the PARCEL           2.2 %
 *   memo metres, datum NOT NAMED         2.0 %   ⚠ UNKNOWN datum — never silently street
 *   both, datum explicit                 0.2 %
 */
export type SipuHeightDatum =
    | 'street' //      AltMaxMV      — from the rasante of the street
    | 'parcel' //      AltMaxMP      — from the parcel
    | 'cornice' //     AltMaxCornis  — altura de CORNISA (eaves)
    | 'crown' //       AltMaxCoron   — altura de CORONACIÓN (top of the built mass)
    | 'unspecified' // AltMaxMt      — metres, datum NOT stated by the schema
    | 'floors-only' // AltMaxPl      — a storey count, not a metric height
    | 'unknown';

/**
 * ⛔ THESE ARE NOT SYNONYMS — THEY ARE DIFFERENT HEIGHTS ON THE SAME BUILDING. Cornice and crown
 * differ by the whole roof/parapet zone; street and parcel differ by the ground fall. Merging
 * them into one "height" coverage rate is precisely the `NM_ALTURA` ambiguity that makes Madrid
 * legally uninterpretable, and Canarias is the region that DISAMBIGUATES BY SCHEMA. So every
 * column keeps its own datum and every envelope records which one it used.
 */
export const SIPU_HEIGHT_DATUM: Readonly<Record<string, SipuHeightDatum>> = Object.freeze({
    AltMaxMV: 'street',
    AltMaxMP: 'parcel',
    AltMaxCornis: 'cornice',
    AltMaxCoron: 'crown',
    AltMaxMt: 'unspecified',
    AltMaxPl: 'floors-only',
});

/**
 * ⭐ MEASURED 2026-08-02, AFTER a national sweep reported `AltMaxMt` in 70 tables — second only
 * to `AltMaxPl` — and flagged that no Canarias probe had ever had it in its dictionary. That was
 * correct, and the resolution is a REALLOCATION rather than a correction:
 *
 *   `AltMaxMt` DOES NOT EXIST IN `EDIF.mdb` AT ALL — **0 of 73** readable EDIF tables.
 *   It lives in **`RUS.mdb`, table `SRAR`** (*Suelo Rústico de Asentamiento Rural*), i.e. a
 *   DIFFERENT POPULATION: rural settlements, not the urban building zones EDIF governs. 69 of
 *   87 packages ship a `RUS.mdb`, which is where the "70 tables" comes from.
 *
 * ⇒ The EDIF-based coverage figures above were NOT computed without a column that belonged in
 *   them. But this DOES name a whole archive PRYZM had not opened, so it was opened:
 *
 *   `AltMaxMt` in RUS/SRAR — 14 archives, 82 tables, 8 719 rows:
 *      VALID **45 / 8 719 = 0.5 %**, 11 distinct values,
 *      ladder {2,3 · 2,4 · 2,5 · 4,0 · 4,5 · 5,0 · 6,5 · 7,0 · 7,5 · 8,0 · 9,0} m
 *   ⭐ A PLAUSIBLE METRE LADDER, so it is a REAL height column and NOT a `DFIVIGEN` null
 *   substitute — and it is EMPTY 99.5 % of the time. Its companions in SRAR are no better
 *   (`SepMinFr` 0.5 %, `SupMin` 0.3 %, `PMaxOcup` 0.1 %, `EdifMax` 0.0 %).
 *   ⇒ Adding it moves the region's drawability by ~45 rows. It changes no conclusion.
 *
 *   `AltMaxCornis` / `AltMaxCoron` — NAMED by the sweep, now RATED: present in exactly **1 of
 *   73** EDIF archives (San Cristóbal de La Laguna, a bespoke schema extension carrying two
 *   further columns nobody has named either, `AltMaxBRas` and `AltMinSRas`). In that archive
 *   **both are 0.0 % VALID**. ⚠ `AltMaxCornis` is `'I'` in all 112 rows — 100 % populated, ONE
 *   distinct value, carrying nothing: THE `DFIVIGEN` SIGNATURE EXACTLY.
 *   ⚠⚠ And most of La Laguna's remaining cells are NOT text — they are `access_parser`
 *   variable-length GARBAGE (`'ã䀀᠁'`, `'V@ w'`). That archive is **BLOCKED BY A PARSER DEFECT,
 *   NOT EMPTY**, and is counted UNKNOWN.
 *
 * ⚠ SAMPLING LIMIT, STATED NOT HIDDEN: the RUS measurement capped archives at 6 MB to protect a
 * nearly-full disk. **22 archives were over the cap and were NOT sampled**, and Teguise's
 * `RUS.mdb` failed to parse. Those are `blocked` WITH A NAMED CAUSE — never counted as zero.
 */
export const SIPU_RUSTIC_HEIGHT_NOTE =
    'AltMaxMt is a RUS.mdb/SRAR column (rural settlements), not an EDIF one: 0/73 EDIF tables, ' +
    'and 45/8719 = 0.5% VALID in RUS with a plausible 11-value metre ladder (2,3–9,0 m).';

/**
 * ⭐ `FonMaxEd` IS A ROUTING HINT, NOT A VALUE — and recording that is worth more than the
 * column's ~0 % numeric rate suggests.
 *
 * Depth in Canarias is genuinely near-absent, confirmed by a WIDER method than the original
 * `fondo`-lexeme search (`FonMaxEdm` ~3 %, `FondoMax` one non-sentinel cell in 8 415 rows, and
 * the memo's *fondo de parcela* is PLOT depth carrying no number). Canarias is the only Spanish
 * region measured where this is so: Madrid serves depth at 12 % with a real ladder, Balears at
 * 6,5 %, Barcelona CONSTRUCTS it and ships on 43 %.
 *
 * ⇒ **NO DEPTH ROUTE IS BUILT.** Setback and occupation are built; depth refuses.
 *
 * But `FonMaxEd`'s non-numeric content is not noise — it is a POINTER INTO THE ORDINANCE, e.g.
 * *"Remitido a Plan Especial"*. That names the document a user needs for exactly the parcels
 * where depth is missing. ⛔ It is surfaced as a citation on the refusal and NEVER as a value.
 *
 * ⚠ Also observed in this column: `"Edificabilidad Total: 7922,45 m²"` — a FLOOR AREA sitting in
 * a DEPTH column. One more quantity confusion, and one more reason the numeric gates matter.
 */
export function fonMaxEdRoutingHint(raw: string | null | undefined): string | null {
    const s = (raw ?? '').trim();
    if (s === '') return null;
    if (/^[-+]?[\d.,]+$/.test(s)) return null; // a number is a value, not a hint
    if (SIPU_SENTINELS[s.toUpperCase()] !== undefined) return null;
    // ⚠ access_parser garbage must never be surfaced to a user as an ordinance reference.
    const garbled = [...s].some((ch) => {
        const c = ch.codePointAt(0) ?? 0;
        return c < 0x09 || (c >= 0x0b && c <= 0x1f) || (c >= 0x2e80 && c <= 0xfffd);
    });
    if (garbled) return null;
    return s;
}

/**
 * The three geometric grammars SIPU names, mapped to the engine PRYZM ALREADY HAS.
 * ⛔ There is no fourth mapping and no new engine.
 */
export type SipuGrammar =
    | 'setback' //             SepMinFr/Ps/Lt      → GeometricRule kind 'setback'
    | 'alignment-depth' //     DispObl + FonMaxEd  → GeometricRule kind 'alignment'
    | 'occupation' //          PMaxOcup            → footprint by coverage ratio
    | 'graphed-refusal' //     GRF                 → the rule is on a plan sheet
    | 'depth-without-datum' // depth, no align tok → the datum EDGE is unknown
    | 'none';

export interface SipuGrammarInput {
    readonly dispObl: string | null;
    readonly hasNumericDepth: boolean;
    readonly hasSetback: boolean;
    readonly hasCoverage: boolean;
}

/**
 * Detect the grammar FROM THE DATA. Grammar detection, not field extraction: which geometric
 * OPERATION the ordinance describes is a property of WHICH COLUMNS SPEAK, not of their values.
 *
 * Order is most-specific-first and is load-bearing:
 *  1. a GRAPHED alignment with no numeric depth REFUSES — it must not fall through to a setback
 *     inset, which would silently draw a different building on the same parcel;
 *  2. an alignment token WITH a numeric depth selects the alignment rule even when setbacks also
 *     speak, because on that fabric the depth band is the binding constraint;
 *  3. setbacks; 4. coverage; 5. a depth with no datum edge is UNSOLVABLE and says so.
 */
export function detectSipuGrammar(input: SipuGrammarInput): SipuGrammar {
    return tracer.startActiveSpan('canarias.detectSipuGrammar', (span) => {
        try {
            const tok = (input.dispObl ?? '').trim().toUpperCase();
            const graphed = tok === 'GRF' || tok === 'AV+GRF';
            const aligned = tok === 'AV' || tok === 'AV+GRF' || tok === 'F';
            let out: SipuGrammar;
            if (graphed && !input.hasNumericDepth) out = 'graphed-refusal';
            else if (aligned && input.hasNumericDepth) out = 'alignment-depth';
            else if (input.hasSetback) out = 'setback';
            else if (input.hasCoverage) out = 'occupation';
            else if (input.hasNumericDepth) out = 'depth-without-datum';
            else out = 'none';
            span.setAttribute('pryzm.canarias.grammar', out);
            return out;
        } finally {
            span.end();
        }
    });
}

/**
 * ROUTING — the 41 municipalities whose GOVERNING INSTRUMENT IS DETERMINABLE.
 *
 * Measured from the CKAN catalogue census (all 88 municipalities, 1 169 SIPU resources): a
 * municipality is routable when exactly ONE municipality-wide base instrument (Plan General de
 * Ordenación / Normas Subsidiarias, excluding Modificaciones / Estudios de Detalle / Planes
 * Parciales / Sentencias) is published for it. Then there is no vigencia question to answer.
 *
 * ⛔ THE OTHER 46 ARE `blocked` WITH A NAMED BLOCKER, NOT `untested` AND NOT SILENTLY ABSENT:
 * they publish 2+ base instruments and **Canarias publishes no vigencia field anywhere**
 * (`PLAN.mdb` does not exist in ANY of the 87 packages; `IDENTIF.TXT` carries a free-text
 * `Modifica=` naming WHICH plan is amended but never WHICH VERSION is current). Choosing among
 * them would be guessing which law applies — the one guess that is never conservative.
 *
 * ⚠ `R` (does a parcel resolve to a unique governing instrument through a LIVE service?) is
 * separately BLOCKED: the IDECanarias WFS is administratively disabled and `idecan2` WMS serves
 * byte-identical blank PNGs and zero GetFeatureInfo records everywhere INCLUDING an ocean
 * negative control — a uniform failure, i.e. the SERVICE, not the query. The parcel→zone join
 * below is made LOCALLY from the SIPU polygon layer, which is why it works at all.
 */
export const CANARIAS_ROUTABLE_MUNICIPALITIES: readonly string[] = Object.freeze([
    'Agaete',
    'Agulo',
    'Alajero',
    'Antigua',
    'Arafo',
    'Artenara',
    'Barlovento',
    'Betancuria',
    'Buenavista del Norte',
    'El Pinar',
    'El Sauzal',
    'El Tanque',
    'Fasnia',
    'Firgas',
    'Frontera',
    'Fuencaliente de La Palma',
    'Garafia',
    'Hermigua',
    'La Guancha',
    'La Matanza de Acentejo',
    'La Victoria de Acentejo',
    'Los Silos',
    'Moya',
    'Puntagorda',
    'Puntallana',
    'San Andres y Sauces',
    'San Juan de La Rambla',
    'Santa Brigida',
    'Santiago del Teide',
    'Tazacorte',
    'Tegueste',
    'Tejeda',
    'Tijarafe',
    'Tinajo',
    'Valle Gran Rey',
    'Vallehermoso',
    'Valleseco',
    'Valsequillo de Gran Canaria',
    'Vega de San Mateo',
    'Vilaflor',
    'Villa de Mazo',
]);

/** The named blocker the other 46 carry. A blocker is an ANSWER; `untested` is not. */
export const CANARIAS_MULTI_INSTRUMENT_BLOCKER =
    'MULTI-INSTRUMENT, NO VIGENCIA SOURCE — this municipality publishes more than one ' +
    'municipality-wide base instrument on opendata.sitcan.es, and Canarias publishes no ' +
    'currency/validity field in ANY SIPU family: PLAN.mdb does not exist in a single one of the ' +
    '87 packages examined, and IDENTIF.TXT records only a free-text `Modifica=` naming WHICH ' +
    'plan is amended, never WHICH VERSION governs today. Selecting one would be a guess about ' +
    'which law applies.';

/**
 * ⚠ TELDE IS **NOT** IN `CANARIAS_ROUTABLE_MUNICIPALITIES`, AND IT IS THE PILOT ANYWAY.
 *
 * Stating this rather than hiding it: Telde publishes several base-instrument resources, so by
 * the conservative census rule above it is multi-instrument. It was chosen as the pilot because
 * it is a large, normal urban fabric with LESS tourism distortion than Arona and because it
 * exercises BOTH grammars in ONE table — the engineering question. Its routing rests on a
 * different, stronger fact than the census: the chosen resource is the **adaptación PLENA**
 * (fully adapted) PGO, which supersedes the partially-adapted instruments it replaces, and
 * SITCAN publishes it as such.
 *
 * ⛔ THAT IS AN ARGUMENT, NOT A MEASUREMENT, so it is recorded as an ASSERTED-UNVERIFIED routing
 * claim and it is one of the things a signatory would be signing. It does NOT widen
 * `CANARIAS_ROUTABLE_MUNICIPALITIES`.
 */
export const TELDE_ROUTING_BASIS =
    'ASSERTED-UNVERIFIED: adaptación PLENA supersedes partially-adapted instruments. Resource ' +
    '030319-pgo-ad-itpu-150323-210504-sipu (Aprobación Definitiva, adaptación PLENA, 2003), ' +
    'opendata.sitcan.es.';

/**
 * The coverage-gap refusal: a statement about PRYZM, never about the law.
 *
 * ⚠ Deliberately NOT `legallyGrounded` — PRYZM has not read Telde's *Normas Urbanísticas*, so it
 * cannot assert what the ordinance requires. Compare `esValenciaEnvelope`, where the plan itself
 * WAS read and the refusal IS legally grounded because the plan puts the number on a drawing.
 */
export function canariasNoRulePackRefusal(
    zoneCode: string | null,
    zoneLabel: string | null,
    knownFacts: readonly string[],
): EnvelopeRefusal {
    return tracer.startActiveSpan('canarias.noRulePackRefusal', (span) => {
        try {
            span.setAttribute('pryzm.canarias.zoneCode', zoneCode ?? 'none');
            const refusal: EnvelopeRefusal = {
                // ⚠ `no-rule-pack`, NOT a legal code: this is a statement about PRYZM's coverage.
                code: 'no-rule-pack',
                headline: 'Canarias — no signed envelope transcription.',
                detail:
                    'PRYZM holds no SIGNED Canarias envelope transcription. The Gobierno de ' +
                    "Canarias publishes this municipality's built-form parameters as named " +
                    'columns in the SIPU `EDIF.mdb` archive, and PRYZM can read them — but ' +
                    'nobody has signed that reading (L-449), so no number is published. ' +
                    (zoneCode
                        ? `The zone code resolved for this parcel is ${zoneCode}` +
                          (zoneLabel ? ` (${zoneLabel}).` : '.')
                        : 'No zone code was resolved for this parcel.'),
                // ⚠ null, and that is honest: PRYZM has not read the Normas Urbanísticas, so it
                // holds no article to cite. An invented citation is worse than none.
                ordinanceRef: null,
                knownFacts: [...knownFacts],
                legallyGrounded: false,
            };
            return refusal;
        } finally {
            span.end();
        }
    });
}

/**
 * The GRAPHED refusal — a *stronger*, structural one, and the reason it is worth separating.
 *
 * When `DispObl` is `GRF` the ordinance HAS a determination and has published it AS A DRAWING.
 * That is not a coverage gap PRYZM can close by reading harder; it is the València Plano C
 * situation, and naming it tells a user exactly which sheet to go and look at.
 */
export function canariasGraphedRefusal(
    zoneCode: string,
    zoneLabel: string | null,
    knownFacts: readonly string[],
): EnvelopeRefusal {
    return tracer.startActiveSpan('canarias.graphedRefusal', (span) => {
        try {
            span.setAttribute('pryzm.canarias.zoneCode', zoneCode);
            const refusal: EnvelopeRefusal = {
                // ⚠ `regime-undetermined`: the ordinance HAS a determination, PRYZM cannot say
                // WHICH line it is. ⛔ Deliberately NOT `source-data-unavailable` — that is the
                // only transient code and the only one that earns a RETRY affordance, and no
                // number of retries turns a plan sheet into data (§L-590c / ADR-0274).
                code: 'regime-undetermined',
                headline: 'The building line is on a plan sheet, not in the data.',
                detail:
                    `Zone ${zoneCode}${zoneLabel ? ` (${zoneLabel})` : ''} is governed by an ` +
                    'alignment the plan publishes as a DRAWING: the SIPU `EDIF` record sets ' +
                    '`DispObl = GRF` ("gráfico"), i.e. the mandatory building line is on a plan ' +
                    'sheet and not in the data. The rule exists and is not held. PRYZM does not ' +
                    'substitute the cadastral edge for a graphed alignment — that would draw a ' +
                    'different building on the same parcel.',
                ordinanceRef:
                    'SIPU 2.6.A, tabla EDIF, campo DispObl = GRF (Gobierno de Canarias).',
                knownFacts: [...knownFacts],
                legallyGrounded: true,
            };
            return refusal;
        } finally {
            span.end();
        }
    });
}
