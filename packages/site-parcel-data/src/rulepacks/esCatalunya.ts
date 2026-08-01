// ── CATALONIA (regional) — the CITED-REFUSAL jurisdiction of last resort for 947 municipalities. ──
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// THE GOAL THIS FILE SERVES, STATED HONESTLY
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// Catalonia has **947 municipalities**. The PGM-1976 — the one metropolitan ordinance PRYZM has
// transcribed — governs **27** of them (NNUU Art. 1.1 scopes it to the pre-2011 *Entitat Municipal
// Metropolitana de Barcelona*, Decret llei 5/1974 art. 2.1; see `esAmbPgmScope.ts`, and note that
// membership of today's 36-municipality AMB does NOT imply the PGM governs a municipality). The
// remaining ~920 each have their OWN instrument — a POUM, a PGOU, Normes Subsidiàries, or
// Generalitat-approved Normes de Planejament Urbanístic where a plan was annulled.
//
// ⇒ **"100 % envelope coverage" for Catalonia is NOT REACHABLE**, and this file does not pretend
//   otherwise. There is no shared ordinance to transcribe. What IS reachable — and is the target
//   this file exists to hit — is **100 % ANSWER CORRECTNESS**: every Catalan click resolves a
//   municipality, resolves a planning qualification, and gets either an envelope (where a pack is
//   registered) or a refusal that **names the instrument which actually governs that land**.
//
// Before this registration, a click in Girona, Lleida, Tarragona or any of ~940 other Catalan
// municipalities reached NO registered jurisdiction at all and fell to the generic estimated
// fallback — a fabricated setback triple on land PRYZM had never read a single article about.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// WHAT WAS MEASURED, 2026-07-31 — live probes against the Generalitat's own services, response
// bodies not documentation. Full method + raw counts below each heading.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// ── (1) MUC ZONING COVERAGE: 947 / 947 MUNICIPALITIES. ─────────────────────────────────────────
// One `resultType=hits` WFS query per municipality against `MUC:MUCVW_MUCS_QUAL`, filtered
// `CODI_INE='<ine>'`, over the 947 distinct `CODI_INE` values in the MUC's OWN terme-municipal
// layer (`MUC:MUCVW_MUCS_TM`, 969 polygons / 947 municipalities — the same 947 the Generalitat
// counts):
//
//     qualification (QUAL) polygons present : 947 / 947   (100.0 %)
//     genuine EMPTY  (service answered "0")  :   0
//     FETCH FAILURE  (unknown, NOT empty)    :   0
//     land-classification (CLAS) present     : 947 / 947   (100.0 %)
//     total QUAL polygons statewide          : 546 696
//     total CLAS polygons statewide          :  15 002
//
// ⚠ THE ZERO IN THE THIRD ROW IS THE LOAD-BEARING NUMBER, not the 947. §CONTEXT-DATA-HONESTY
// (L-422/457/467/469): a fetch failure and a genuine empty are DIFFERENT VALUES, and this repo has
// been bitten four times by code that let the first wear the second's clothes. The probe recorded
// them separately and retried three times before recording `null`. Had any municipality failed,
// "947" would have been a masked outage rather than a measurement.
//
// ── (2) THE HARMONISED VOCABULARY: EXACTLY 36 CODES. ───────────────────────────────────────────
// A COMPLETE scan — all 546 696 QUAL rows, attributes only, paged 30 000 at a time, 0 page
// failures — not a sample. See `MUC_HARMONISED_CLASSES` for the table with its measured counts.
// Six families: `R` residencial · `A` activitat econòmica · `M` altres · `D` urbanitzable ·
// `N` no urbanitzable · `S…` sistemes.
//
// ── (3) THE INSTRUMENT REGISTER: 935 / 947 MUNICIPALITIES, WITH A LIVE RPUC LINK. ──────────────
// **This is the find that turns "we don't know what governs here" into a cited refusal.**
// `MUC:MUCVW_AMBIT_PG_INE` — the *àmbit del planejament general* layer — is a machine-readable,
// keyless, per-POLYGON register of general-planning expedients. `DescribeFeatureType` gives its
// schema verbatim:
//
//     EXPEDIENT    the RPUC file number, e.g. '2001 / 001092 / G'
//     TIPUS        the instrument type, e.g. "Pla d'ordenació urbanística municipal"
//     CODI_INE     the municipality the expedient was FILED under  ⚠ see the trap below
//     ACCES_RPUC   a DEEP LINK into the Registre de Planejament Urbanístic de Catalunya:
//                  http://dtes.gencat.cat/rpucportal/AppJava/cercaExpedient.do
//                      ?reqCode=veureExpedient&codiPublic=<EXPEDIENT>
//
//     total expedients                       : 8 396
//     municipalities with ≥1 expedient        : 935 / 947  (98.7 %)
//     expedients carrying an ACCES_RPUC link : 8 396 / 8 396 (100 %)
//     municipalities with NO expedient (12)  : Sant Quirze de Besora (08237), Queralbs (17043),
//         Das (17061), Meranges (17099), Pardines (17125), Toses (17201), Bausen (25045),
//         Canejan (25063), Granyena de Segarra (25104), les Oluges (25152),
//         Sant Guim de la Plana (25197), Riu de Cerdanya (25913)
//
// So the RPUC IS reachable machine-readably — not through an RPUC API (none was located), but
// through the MUC's spatial index INTO the RPUC, which is strictly better for our purpose because
// it is resolved AT A POINT rather than per municipality.
//
// ⚠⚠ THE TRAP, FOUND BY AN INDEPENDENT CHECK AND NOT BY READING THE FIELD NAME. `CODI_INE` on this
// layer is the FILING municipality, **not** the territory the expedient governs. Verified by
// re-fetching the geometries from WFS and measuring their own extents (EPSG:25831):
//
//     '1985 / 000604 / B'  CODI_INE 08015 (Badalona)  →  bbox ≈ 32 × 34 km — the whole
//     '2023 / 080137 / M'  CODI_INE 08077             →  metropolitan area, INCLUDING Barcelona
//     '2018 / 067068 / C'  CODI_INE 43004             →  bbox ≈ 265 × 258 km — ALL OF CATALONIA
//     '2001 / 001092 / G'  CODI_INE 17079 (Girona)    →  bbox ≈ 9.4 × 10 km — genuinely municipal
//
// ⇒ Filtering by `CODI_INE` would have silently attributed metropolitan PGM modifications to
// Badalona alone and dropped them everywhere else. **The only sound filter is point-in-polygon on
// the àmbit geometry** — the identical discipline `mucZoningProxy.js` §MUC-ONE-CONTAINER-OR-REFUSE
// already applies to the qualification layer. `CODI_INE` is kept ONLY as a corroborating signal:
// a containing general-plan expedient whose filing INE equals the point's municipality is a
// CONFIRMED municipal instrument; one whose INE differs is reported as containing-but-unconfirmed
// and is never claimed to govern. See `server/mucInstrumentProxy.js`.
//
// ── (4) WHAT A REAL CLICK RESOLVES TO (measured at each point, same date) ──────────────────────
//     Girona, Barri Vell   → R1 nucli antic (clau 7)  · Revisió PGOU 2001/001092/G  [CONFIRMED]
//     Lleida, centre       → SX1 eix estructurant     · Revisió PGOU 2002/000069/L  [CONFIRMED]
//     Tarragona, centre    → SX1 eix estructurant     · Normes de Planejament Urbanístic
//                                                       2021/075037/T [CONFIRMED] — Tarragona's
//                            POUM having been annulled, the NPU is genuinely what governs
//     Vic (Osona)          → SV espai lliure          · POUM 2016/062086/N          [CONFIRMED]
//     Lladorre (Pirineu)   → N3 protecció reglada     · POUM 2003/006777/L          [CONFIRMED]
//     Barcelona Eixample   → R2 / clau 13a            · NO base instrument in the register —
//                            the PGM-1976 PREDATES it. Honest `null`, never a guess. (Barcelona
//                            routes to its own municipal registration, so this never surfaces.)
//     Mediterranean sea    → 0 features on every layer — a GENUINE empty, correctly distinct
//                            from a failure.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS FILE MAY AND MAY NOT DO
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// MAY: name the municipality · report the harmonised MUC qualification it resolved · name the
// governing instrument the register confirmed · link the user to the RPUC record.
//
// MAY NOT: **publish any number.** The MUC gives a qualification CODE, not parameters. There is no
// height, no edificabilitat, no occupation, no setback anywhere in this file, and `packsByZone`
// for this registration is EMPTY by construction. UNKNOWN ≠ 0 and UNKNOWN ≠ a permissive default
// (L-616).
//
// ⚠ THE HARMONISED CODE IS A WEAKER EVIDENCE TIER THAN A PER-CLAU ORDINANCE TABLE, exactly as
// `esBarcelonaZoneClassification.ts` already states for the same taxonomy, and the refusal copy
// SAYS SO rather than dressing it up as an article citation. `CODI_QUAL_MUC` is coarser than the
// municipal clau by construction (Barcelona's 13a and 13b are BOTH `R2`), so it can answer the
// coarse question "is this land a public system?" and must never answer "what may I build?".
//
// PURITY: L2-pure (C58 §1.9) — frozen data + pure functions. No I/O, no THREE, no DOM, no clock.
// The live resolution happens in `server/mucInstrumentProxy.js` and reaches here as an argument.
//
// Contracts: C60 (coverage) · C58 §1.2/§1.4/§1.11 · C19 · C63 + L-656 · §CONTEXT-DATA-HONESTY.

import { trace } from '@opentelemetry/api';
import type { EnvelopeRefusal } from '@pryzm/schemas';
import { isCatalanIneCode } from '../providers/catalunyaBbox.js';

const tracer = trace.getTracer('pryzm.zoning.es.catalunya');

/** The jurisdiction id Catalonia records and the registry registration use. One constant. */
export const CATALUNYA_JURISDICTION_ID = 'es-ct-catalunya';

/** The date every measurement quoted in this file was taken. Stated so a reader can re-run it. */
export const CATALUNYA_MEASURED_ON = '2026-07-31' as const;

/**
 * Is a signed, transcribed Catalonia-wide envelope rule pack available?
 *
 * ⚠ HARD-FALSE, AND UNLIKE EVERY OTHER `*_ENVELOPE_VERIFIED` GATE IN THIS PACKAGE IT IS NOT
 * WAITING ON A SIGNATURE — it is false because **there is nothing to sign**. A regional pack would
 * require one ordinance governing 947 municipalities and no such instrument exists. Catalonia's
 * envelope coverage grows ONLY by registering municipalities one at a time, each of which
 * out-ranks this registration automatically under §JURISDICTION-SPECIFICITY. Do not "fix" this by
 * flipping it.
 */
export const CATALUNYA_ENVELOPE_VERIFIED = false as const;

// ─────────────────────────────────────────────────────────────────────────────────────────────
// THE HARMONISED MUC TAXONOMY — all 36 codes, measured, with their statewide polygon counts.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * What a harmonised class means for a PRIVATE buildable envelope.
 *
 * Deliberately three values and not two. "The law grants no private envelope here" (`system`,
 * `non-urbanisable`) and "PRYZM has not encoded this municipality's ordinance" (`zone`) are
 * OPPOSITE claims, and collapsing them is the defect `registry.ts`'s three-outcome
 * `ZoneDisposition` exists to prevent — restated here because this table is what decides which
 * one a Catalan parcel gets.
 */
export type MucHarmonisedDisposition =
    /** Public domain — road, rail, port, open space, facility, hydraulic, technical service. */
    | 'system'
    /** *Sòl no urbanitzable* — outside the regime from which an urban envelope is derived. */
    | 'non-urbanisable'
    /** *Sòl urbanitzable* — designated for development THROUGH a separately-approved derived plan. */
    | 'development'
    /** A privately-buildable zone. The ordinance grants an envelope; PRYZM has not transcribed it. */
    | 'zone';

/** One row of the harmonised `CODI_QUAL_MUC` vocabulary. */
export interface MucHarmonisedClass {
    /** The harmonised code exactly as `CODI_QUAL_MUC` publishes it. */
    readonly code: string;
    /** `DESC_QUAL_MUC`, verbatim in Catalan — the service's own words, not a translation. */
    readonly label: string;
    readonly disposition: MucHarmonisedDisposition;
    /** Polygons carrying this code statewide, measured over the complete 546 696-row scan. */
    readonly measuredPolygons: number;
}

function cls(
    code: string,
    label: string,
    disposition: MucHarmonisedDisposition,
    measuredPolygons: number,
): MucHarmonisedClass {
    return Object.freeze({ code, label, disposition, measuredPolygons });
}

/**
 * **THE COMPLETE `CODI_QUAL_MUC` VOCABULARY** — 36 codes, 546 696 polygons, 947 municipalities,
 * measured `CATALUNYA_MEASURED_ON` by a full paged scan of `MUC:MUCVW_MUCS_QUAL` with zero page
 * failures. Not a sample and not a documentation transcription.
 *
 * ⚠ THE COUNTS ARE EVIDENCE, NOT PARAMETERS. They record how much of Catalonia each class covers
 * so a future reader can judge what a change to this table would move. Nothing computes with them.
 */
export const MUC_HARMONISED_CLASSES: readonly MucHarmonisedClass[] = Object.freeze([
    // ── Residencial — privately buildable. 157 434 polygons (28.8 % of Catalonia's qualification
    //    polygons). Every one of these needs its municipality's own ordinance to answer.
    cls('R1', 'Residencial, Nucli antic', 'zone', 32796),
    cls('R2', 'Residencial, Urbà tradicional', 'zone', 33400),
    cls('R3', 'Residencial, Ordenació tancada', 'zone', 9611),
    cls('R4', 'Residencial, Ordenació oberta', 'zone', 19700),
    cls('R5', 'Residencial, Habitatges en filera', 'zone', 10851),
    cls('R6', 'Residencial, Habitatges aïllats o adossats', 'zone', 51076),
    // ── Activitat econòmica — privately buildable. 12 076 polygons.
    cls('A1', 'Activitat econòmica, Industrial', 'zone', 9049),
    cls('A2', 'Activitat econòmica, Serveis', 'zone', 2948),
    cls('A3', 'Activitat econòmica, Logística', 'zone', 79),
    // ── Altres — privately buildable. 13 351 polygons.
    cls('M1', 'Altres, Reforma urbana', 'zone', 3802),
    cls('M2', 'Altres, Conservació', 'zone', 8660),
    cls('M3', 'Altres, Mixtes', 'zone', 889),
    // ── Urbanitzable — land designated for development, whose detailed parameters come from a
    //    SEPARATELY-APPROVED derived plan (a pla parcial). 21 776 polygons.
    cls('D1', "Urbanitzable, Desenvolupament per a ús d'habitatge", 'development', 14065),
    cls('D2', 'Urbanitzable, Desenvolupament per a activitat econòmica', 'development', 4401),
    cls('D3', 'Urbanitzable, Desenvolupament per a usos mixtos', 'development', 1574),
    cls('D4', 'Urbanitzable, Altres desenvolupaments', 'development', 89),
    cls('D5', 'Urbanitzable, Urbanitzable no delimitat', 'development', 1647),
    // ── No urbanitzable — 145 009 polygons, 26.5 % of Catalonia. ⚠ N4 is deliberately NOT
    //    `non-urbanisable`: "Activitat autoritzada" is land carrying an AUTHORISED activity, whose
    //    conditions live in that authorisation — a document PRYZM does not hold. Refusing it as a
    //    legal "no" would deny an authorisation that may well exist. It gets the coverage refusal.
    cls('N1', 'No urbanitzable, Ordinari', 'non-urbanisable', 50318),
    cls('N2', 'No urbanitzable, Protecció local', 'non-urbanisable', 65575),
    cls('N3', 'No urbanitzable, Protecció reglada', 'non-urbanisable', 27475),
    cls('N4', 'No urbanitzable, Activitat autoritzada', 'zone', 1641),
    // ── Sistemes — public domain, no private buildable envelope. 197 050 polygons, 36.0 % of
    //    Catalonia and the single largest family. This is where the harmonised code earns its keep:
    //    one coarse test answers correctly for more than a third of all Catalan land.
    cls('SA', 'Sistemes, Aeroportuari', 'system', 203),
    cls('SC', 'Sistemes, Costaner', 'system', 1022),
    cls('SD', 'Sistemes, Habitatge dotacional públic', 'system', 460),
    cls('SE', 'Sistemes, Equipaments', 'system', 29023),
    cls('SF', 'Sistemes, Ferroviari', 'system', 2556),
    cls('SH', 'Sistemes, Hidràulic', 'system', 20178),
    cls('SH0', 'Altre hidrogràfic', 'system', 6),
    cls('SP', 'Sistemes, Portuari', 'system', 177),
    cls('SS', 'Sistemes, Protecció', 'system', 5406),
    cls('ST', 'Sistemes, Serveis tècnics', 'system', 9866),
    cls('SV', 'Sistemes, Espais lliures públics', 'system', 59093),
    cls('SX0', 'Sistemes, Viari', 'system', 625),
    cls('SX1', 'Sistemes, Viari, Eixos estructurants', 'system', 16221),
    cls('SX2', 'Sistemes, Viari, Altre viari en sòl urbà', 'system', 36658),
    cls('SX3', 'Sistemes, Viari, Altre viari en sòl no urbanitzable', 'system', 15556),
]);

const BY_CODE: ReadonlyMap<string, MucHarmonisedClass> = new Map(
    MUC_HARMONISED_CLASSES.map((c) => [c.code, c]),
);

/**
 * The citation any claim made from this taxonomy must carry. It names the TAXONOMY, never an
 * article — an unsourced article number attached to a refusal is still an unsourced claim about
 * the law (L-526), and this classification is genuinely not article-derived.
 */
export const MUC_HARMONISED_TAXONOMY_REF =
    'Harmonised qualification code CODI_QUAL_MUC, layer MUC:MUCVW_MUCS_QUAL of the Mapa ' +
    'Urbanístic de Catalunya (Generalitat de Catalunya, sig.gencat.cat/ows/MUC) — the ' +
    'cross-municipal taxonomy the Generalitat itself publishes alongside each municipality’s own ' +
    'clau. It is a CLASSIFICATION, not an article: it is coarser than the municipal ordinance ' +
    'table by construction and is cited here as the weaker evidence tier it is.';

/**
 * Classify a harmonised `CODI_QUAL_MUC` value. Returns `null` when the code is absent or is not one
 * this table knows — `null` means "this module makes NO claim", and it never means "buildable".
 *
 * ⚠ THE PREFIX FALLBACK IS DELIBERATE AND NARROW. The 36-code table is the complete vocabulary as
 * measured, but the MUC is a living dataset and a 37th code could appear. Rather than let a new
 * code fall through to "unknown" — which on a road or a park would hand a fabricated setback
 * triple to public domain — an unrecognised code beginning `S` is classified `'system'`, exactly
 * the discriminator `esBarcelonaZoneClassification.ts` measured across all of Barcelona (`S*` was
 * a system in 100 % of 1 014 resolved points, with zero buildable claus). No other prefix gets a
 * fallback: `R`/`A`/`M`/`D`/`N` fallbacks would each risk asserting a legal "no" on land that
 * genuinely carries an envelope, which is the worse error.
 *
 * P8 span: `pryzm.zoning.es.catalunya.classifyMucHarmonisedCode`.
 */
export function classifyMucHarmonisedCode(
    harmonisedCode: string | null | undefined,
): MucHarmonisedClass | null {
    const span = tracer.startSpan('pryzm.zoning.es.catalunya.classifyMucHarmonisedCode');
    try {
        if (typeof harmonisedCode !== 'string') return null;
        const code = harmonisedCode.trim().toUpperCase();
        if (code.length === 0) return null;
        span.setAttribute('pryzm.zoning.harmonisedCode', code);
        const exact = BY_CODE.get(code);
        if (exact) {
            span.setAttribute('pryzm.zoning.disposition', exact.disposition);
            span.setAttribute('pryzm.zoning.match', 'exact');
            return exact;
        }
        if (code.startsWith('S')) {
            span.setAttribute('pryzm.zoning.disposition', 'system');
            span.setAttribute('pryzm.zoning.match', 'prefix-fallback');
            return cls(code, 'Sistemes (classe no enumerada)', 'system', 0);
        }
        span.setAttribute('pryzm.zoning.match', 'none');
        return null;
    } finally {
        span.end();
    }
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// THE GOVERNING INSTRUMENT — the shape `server/mucInstrumentProxy.js` resolves and hands over.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * One general-planning instrument the MUC's `MUCVW_AMBIT_PG_INE` register reports at a point.
 *
 * ⚠ `confirmed` IS THE FIELD THAT KEEPS THIS HONEST. It is `true` only when the containing
 * expedient's filing `CODI_INE` equals the INE of the municipality the point actually falls in.
 * When it is `false` the register still says an instrument of this type contains the point, but
 * PRYZM cannot show it is that MUNICIPALITY'S general plan — because `CODI_INE` is the filing
 * municipality, and metropolitan PGM modifications are filed under one member's code while
 * covering the whole conurbation (measured; see the header). An unconfirmed instrument is REPORTED
 * and never CLAIMED to govern. Naming the wrong instrument is a wrong-jurisdiction answer, which
 * is worse than admitting we do not know.
 */
export interface CatalanGoverningInstrument {
    /** `EXPEDIENT` — the RPUC file number, e.g. `2001 / 001092 / G`. */
    readonly expedient: string;
    /** `TIPUS` — the instrument type in the register's own Catalan words. ⚠ 40-char truncated. */
    readonly tipus: string;
    /** The filing municipality's INE code (see the warning above — NOT the governed territory). */
    readonly filedUnderIne: string | null;
    /** `ACCES_RPUC` — the deep link to the Registre de Planejament Urbanístic record. */
    readonly rpucUrl: string | null;
    /** Does the filing INE match the municipality the point falls in? See the warning above. */
    readonly confirmed: boolean;
}

/**
 * How the instrument lookup ENDED. Three values because a failure, a genuine absence and a success
 * are three different facts (§CONTEXT-DATA-HONESTY) and the refusal copy differs for each.
 */
export type CatalanInstrumentLookupOutcome =
    /** The register answered and a containing general-plan instrument was identified. */
    | 'resolved'
    /** The register answered and lists NO base general-plan instrument containing this point.
     *  A real, durable fact — e.g. Barcelona, whose PGM-1976 predates the register. */
    | 'no-base-instrument-registered'
    /** The lookup RAN and FAILED. NOT an absence. Never render this as "no instrument". */
    | 'unresolved'
    /**
     * ⚠ THE LOOKUP WAS NEVER PERFORMED — a FOURTH value, not a synonym for `'unresolved'`.
     *
     * The registry path (`resolveZoneDisposition`) holds only a zone code; no fetch happens there.
     * Reporting that as `'unresolved'` would make the refusal say *"PRYZM could not reach the
     * Generalitat's register"* — asserting a query PRYZM never made. `registry.ts` records Paris
     * and the Netherlands declining to declare a `noRulePackRefusal` for exactly this reason;
     * Catalonia needs one (its whole purpose is to answer where nothing else does), so it carries
     * the honest fourth value instead. §CONTEXT-DATA-HONESTY generalised: *didn't ask*, *asked and
     * failed*, and *asked and got nothing* are THREE facts.
     */
    | 'not-attempted';

/** How the MUC qualification lookup ended. Same four-way discipline as above. */
export type CatalanZoningLookupOutcome =
    | 'resolved'
    /** The service answered and no single qualification polygon contains the point (e.g. at sea). */
    | 'no-qualification-at-point'
    /** The lookup RAN and FAILED. */
    | 'unresolved'
    /** The lookup was never performed on this path. See the note on the instrument union. */
    | 'not-attempted';

/** Everything the refusal builder may cite. Every field is a FACT PRYZM resolved, or an honest null. */
export interface CatalunyaRefusalInput {
    /** 5-digit INE code from Catastro. ⚠ The EXACT jurisdiction gate — see `isCatalanIneCode`. */
    readonly ineCode: string | null;
    /** Municipality name, from the MUC's own `MUCVW_MUCS_TM` or from Catastro. */
    readonly municipalityName: string | null;
    /** `CODI_QUAL_MUC` — the harmonised class. */
    readonly harmonisedCode: string | null;
    /** `DESC_QUAL_MUC` — the harmonised label, verbatim Catalan. */
    readonly harmonisedLabel: string | null;
    /** `CODI_QUAL_AJUNT` — the MUNICIPAL clau. Reported; never used to select anything here. */
    readonly municipalClau: string | null;
    /** `DESC_QUAL_AJUNT` — the municipal clau's label, verbatim Catalan. */
    readonly municipalClauLabel: string | null;
    readonly zoningLookup: CatalanZoningLookupOutcome;
    readonly instrumentLookup: CatalanInstrumentLookupOutcome;
    /** The confirmed or reported instrument, or null. See `CatalanGoverningInstrument.confirmed`. */
    readonly governingInstrument: CatalanGoverningInstrument | null;
    /** Short "label: value" parcel facts the caller already holds. Facts only, never a constraint. */
    readonly knownFacts: readonly string[];
}

/**
 * The roadmap line, stated once. Same role as `MURCIA_ROADMAP_LINE`: a refusal card must say what
 * would change the answer, or a user cannot tell a coverage gap from a crash.
 */
export const CATALUNYA_ROADMAP_LINE =
    'Catalonia coverage today: the PARCEL half is complete and live everywhere — the national ' +
    'Catastro path resolves the referencia cadastral, the official boundary and the registered ' +
    'area. The ZONING IDENTITY half is complete too: the Generalitat’s Mapa Urbanístic de ' +
    'Catalunya answers for all 947 Catalan municipalities (measured ' +
    CATALUNYA_MEASURED_ON +
    '), so PRYZM can always tell you your land’s planning qualification. The ENVELOPE half is ' +
    'municipality-by-municipality and always will be: Catalonia has 947 municipalities and no ' +
    'single ordinance governs them — the metropolitan PGM-1976 reaches 27, and each of the rest ' +
    'has its own POUM, PGOU or Normes Subsidiàries. What would change the answer for THIS parcel ' +
    'is a sourced, human-signed transcription of the instrument named above — after which this ' +
    'municipality registers in its own right and outranks this regional answer automatically.';

function instrumentSentence(input: CatalunyaRefusalInput): string {
    const inst = input.governingInstrument;
    if (input.instrumentLookup === 'not-attempted') {
        return (
            ' PRYZM has NOT resolved which planning instrument governs here, and on this path it ' +
            'did not look: this answer was reached without a live query to the Generalitat’s ' +
            'planning register. That register does publish the answer for 935 of Catalonia’s 947 ' +
            'municipalities, so the gap is PRYZM’s wiring and not the data’s. PRYZM will not guess ' +
            'a plan name — naming the wrong instrument is a worse answer than naming none.'
        );
    }
    if (input.instrumentLookup === 'unresolved') {
        return (
            ' PRYZM queried the Generalitat’s planning register for this point and the query ' +
            'FAILED, so it has not resolved which instrument governs here. That is a statement ' +
            'about a failed lookup, not a statement that no instrument exists — and PRYZM will not ' +
            'guess a plan name, because naming the wrong instrument is a worse answer than naming ' +
            'none.'
        );
    }
    if (input.instrumentLookup === 'no-base-instrument-registered' || !inst) {
        return (
            ' The Generalitat’s planning register answered for this point and lists no BASE ' +
            'general-planning instrument containing it — which happens legitimately where the ' +
            'governing plan predates the register. PRYZM has therefore not resolved the governing ' +
            'instrument, and will not guess one.'
        );
    }
    // ⚠ The link goes LAST in whatever sentence carries it and is never followed by more prose: a
    // URL with a full stop or a word butted against it is a URL users cannot click or copy
    // cleanly. An honest signal that is not LEGIBLE is not honest in effect (the schema's own note
    // on `knownFacts` records the day that lesson was paid for).
    const link = inst.rpucUrl ? ` You can read the record yourself: ${inst.rpucUrl}` : '';
    if (!inst.confirmed) {
        return (
            ` The Generalitat’s planning register reports a general-planning instrument whose ` +
            `àmbit contains this point — ${inst.tipus.trim()}, expedient ${inst.expedient.trim()} ` +
            `— but it is filed under a different municipality’s code` +
            (inst.filedUnderIne ? ` (INE ${inst.filedUnderIne})` : '') +
            `, so PRYZM reports it WITHOUT claiming it is this municipality’s general plan. ` +
            `Supra-municipal and metropolitan instruments are filed this way, so the difference is ` +
            `not evidence of an error — it is evidence PRYZM has not established the link.` +
            link
        );
    }
    return (
        ` The instrument that governs this land is ${inst.tipus.trim()}, expedient ` +
        `${inst.expedient.trim()}, registered in the Registre de Planejament Urbanístic de ` +
        `Catalunya. PRYZM resolved that from the Generalitat’s own àmbit-del-planejament-general ` +
        `layer by testing which plan boundary actually contains your parcel — not by looking up a ` +
        `municipality name. PRYZM has NOT read that document, which is exactly why it publishes ` +
        `no figure from it.${link}`
    );
}

function zoneSentence(input: CatalunyaRefusalInput): string {
    if (input.zoningLookup === 'not-attempted') {
        return (
            'PRYZM has not resolved your land’s planning qualification, and on this path it did ' +
            'not look — no live query to the Generalitat’s qualification layer was made. That is ' +
            'not a finding that the land is unzoned.'
        );
    }
    if (input.zoningLookup === 'unresolved') {
        return (
            'PRYZM queried the Generalitat’s qualification layer for this point and the query ' +
            'FAILED, so it has not resolved your land’s planning qualification. That is a failed ' +
            'lookup, not a finding that the land is unzoned.'
        );
    }
    if (input.zoningLookup === 'no-qualification-at-point') {
        return (
            'The Generalitat’s qualification layer answered for this point and no single ' +
            'qualification polygon contains it. That is a genuine absence — not a failure — and it ' +
            'is what a point on a zone boundary, or outside the mapped territory, returns.'
        );
    }
    const parts: string[] = [];
    if (input.municipalClau) {
        parts.push(
            `the municipal clau is ${input.municipalClau}` +
                (input.municipalClauLabel ? ` (${input.municipalClauLabel})` : ''),
        );
    }
    if (input.harmonisedCode) {
        parts.push(
            `the harmonised Catalan qualification is ${input.harmonisedCode}` +
                (input.harmonisedLabel ? ` — ${input.harmonisedLabel}` : ''),
        );
    }
    if (parts.length === 0) return 'PRYZM resolved no qualification code for this point.';
    return (
        `PRYZM resolved your land’s planning qualification live from the Mapa Urbanístic de ` +
        `Catalunya: ${parts.join(', and ')}. That is a real, citable fact about your parcel — but ` +
        `it is an IDENTITY, not a set of parameters: the MUC publishes no height, no ` +
        `edificabilitat, no occupation and no setback, for any municipality.`
    );
}

function municipalityPhrase(input: CatalunyaRefusalInput): string {
    if (input.municipalityName && input.municipalityName.trim()) {
        return (
            input.municipalityName.trim() + (input.ineCode ? ` (INE ${input.ineCode})` : '')
        );
    }
    if (input.ineCode) return `the Catalan municipality with INE code ${input.ineCode}`;
    return 'this Catalan municipality';
}

/**
 * **The Catalonia-wide cited refusal.** Returned for every Catalan parcel that reaches this
 * registration — i.e. every parcel in the ~920 municipalities PRYZM has not registered in its own
 * right, plus any land inside a registered municipality that its own packs decline.
 *
 * WHAT CODE IT PICKS AND WHY — the mapping is the whole safety property of this file:
 *
 *   `system`          → `public-system`,   legallyGrounded **true**.  The harmonised class IS the
 *                       legal statement: a *sistema* is public domain and carries no private
 *                       envelope. 36.0 % of Catalonia's qualification polygons. Same tier and same
 *                       honesty caveat as `esBarcelonaZoneClassification.ts`'s shipped
 *                       `HARMONISED_SYSTEM_REFUSAL`.
 *   `non-urbanisable` → `protected-soil`,  legallyGrounded **true**.  N1–N3. The land is outside
 *                       the urban/urbanisable regime from which a buildable envelope is derived.
 *                       ⚠ The copy is careful NOT to say "you cannot build": Catalan SNU permits
 *                       exceptional, use-specific and procedure-gated construction. It says no
 *                       URBAN ENVELOPE is derivable, which is the true and narrower claim.
 *   `development`     → `no-rule-pack`,    legallyGrounded **false**. D1–D5. The parameters live in
 *                       a separately-approved derived plan (a *pla parcial*) PRYZM does not hold.
 *                       ⚠ NOT the `derived-plan` code, which is a legallyGrounded=true code
 *                       reserved for where the governing ordinance ITSELF says so in a transcribed
 *                       article (Murcia's PGOU Arts. 6.6.2 / 5.24.5.1). PRYZM has transcribed no
 *                       Catalan article saying it, so claiming that tier would be an unsourced
 *                       legal claim — the L-526 error.
 *   `zone` / unknown  → `no-rule-pack`,    legallyGrounded **false**. A statement about PRYZM's
 *                       COVERAGE, never about the law. The ordinance almost certainly DOES grant
 *                       an envelope on this land; claiming a legal "no" would tell the owner of a
 *                       perfectly buildable plot that the law forbids building on it, which is the
 *                       opposite error and the worse one.
 *   any `unresolved`  → `source-data-unavailable`, legallyGrounded **false**, and it is the ONLY
 *                       branch that earns a retry affordance (L-574). §CONTEXT-DATA-HONESTY: an
 *                       outage degrades to a WEAKER CITED refusal — never to silence, and never to
 *                       a number.
 *
 * ⚠⚠ AND IT REFUSES TO ANSWER AT ALL OUTSIDE CATALONIA. If `ineCode` is present and is not one of
 * the four Catalan provinces (08/17/25/43), this returns a refusal that cites NOTHING and says so.
 * `CATALUNYA_BBOX` is a rectangle and rectangles over-claim into Aragó, the Comunitat Valenciana,
 * Andorra and France (§CATALUNYA-SPILL); this check is where that over-claim is stopped, because
 * the citation path is the only place a wrong jurisdiction can actually harm anyone.
 *
 * P8 span: `pryzm.zoning.es.catalunya.catalunyaNoRulePackRefusal`.
 */
export function catalunyaNoRulePackRefusal(input: CatalunyaRefusalInput): EnvelopeRefusal {
    const span = tracer.startSpan('pryzm.zoning.es.catalunya.catalunyaNoRulePackRefusal');
    try {
        const knownFacts = [...input.knownFacts];

        // ── §CATALUNYA-SPILL — the exact gate. A non-Catalan INE never gets a Catalan citation. ──
        if (input.ineCode !== null && !isCatalanIneCode(input.ineCode)) {
            span.setAttribute('pryzm.zoning.outcome', 'out-of-jurisdiction');
            return {
                code: 'no-rule-pack',
                headline:
                    'This parcel is not in Catalonia — PRYZM will not answer it with Catalan planning law.',
                detail:
                    `The Spanish INE municipality code for this parcel is ${input.ineCode}, whose ` +
                    'province prefix is not one of the four that compose Catalonia (08 Barcelona, ' +
                    '17 Girona, 25 Lleida, 43 Tarragona). PRYZM reached this answer through a ' +
                    'COARSE rectangular proximity gate, and a rectangle cannot follow a border — ' +
                    'Catalonia’s box also covers parts of Aragó, the Comunitat Valenciana, Andorra ' +
                    'and southern France. Rather than cite a Catalan instrument on land Catalan ' +
                    'planning law does not govern, PRYZM cites nothing. A confident answer under ' +
                    'the wrong ordinance is worse than no answer.',
                ordinanceRef: null,
                legallyGrounded: false,
                knownFacts,
            };
        }

        const where = municipalityPhrase(input);
        const cls_ = classifyMucHarmonisedCode(input.harmonisedCode);
        span.setAttribute('pryzm.zoning.zoningLookup', input.zoningLookup);
        span.setAttribute('pryzm.zoning.instrumentLookup', input.instrumentLookup);
        span.setAttribute('pryzm.zoning.disposition', cls_?.disposition ?? 'unknown');

        // ── The OUTAGE branch: a weaker CITED refusal, never silence and never a number. ──
        if (input.zoningLookup === 'unresolved' && input.instrumentLookup === 'unresolved') {
            span.setAttribute('pryzm.zoning.outcome', 'source-data-unavailable');
            return {
                code: 'source-data-unavailable',
                headline: `${where} — the Generalitat’s planning services did not answer, so PRYZM is showing you nothing rather than a guess.`,
                detail:
                    'PRYZM identified your parcel from the Spanish Catastro, but both live lookups ' +
                    'it needs to say anything about planning here — the Mapa Urbanístic de ' +
                    'Catalunya qualification layer and the àmbit-del-planejament-general register ' +
                    '— failed to answer. This is a TRANSIENT FAILURE and not a finding: it is not ' +
                    'a statement that your land is unzoned, and it is not a statement that no plan ' +
                    'governs it. Both services are public and keyless, and a retry usually clears ' +
                    'it. ' +
                    CATALUNYA_ROADMAP_LINE,
                ordinanceRef: null,
                legallyGrounded: false,
                knownFacts,
            };
        }

        const body = zoneSentence(input) + instrumentSentence(input);

        if (cls_?.disposition === 'system') {
            span.setAttribute('pryzm.zoning.outcome', 'public-system');
            return {
                code: 'public-system',
                headline: 'Public system — no private buildable envelope applies to this land.',
                detail:
                    `${body} The harmonised class this parcel carries is a *sistema* — public ` +
                    'domain: road, rail, port, airport, coastal, hydraulic, technical service, ' +
                    'public open space, community facility or public dotational housing. Systems ' +
                    'carry no private buildable envelope, so the absence of a figure here is the ' +
                    'answer rather than a gap. ⚠ This classification comes from the harmonised MUC ' +
                    'taxonomy rather than from a named article of your municipality’s ordinance, ' +
                    'which is a WEAKER EVIDENCE TIER than a per-clau ordinance table — it is ' +
                    'stated here plainly rather than dressed up as an article citation.',
                ordinanceRef: MUC_HARMONISED_TAXONOMY_REF,
                legallyGrounded: true,
                knownFacts,
            };
        }

        if (cls_?.disposition === 'non-urbanisable') {
            span.setAttribute('pryzm.zoning.outcome', 'protected-soil');
            return {
                code: 'protected-soil',
                headline:
                    'Sòl no urbanitzable — no urban buildable envelope is derivable for this land.',
                detail:
                    `${body} The harmonised class this parcel carries is *sòl no urbanitzable* ` +
                    `(${cls_.label}) — land outside the urban and urbanisable regimes from which a ` +
                    'buildable envelope is derived, so PRYZM has nothing to compute an envelope ' +
                    'from. ⚠ READ THIS PRECISELY: it does NOT mean nothing may ever be built here. ' +
                    'Catalan non-urbanisable soil admits exceptional, use-specific construction ' +
                    '(rural dwellings, agricultural and livestock buildings, works of public ' +
                    'interest) through a separate authorisation procedure that PRYZM does not ' +
                    'model and cannot pre-judge. What PRYZM is declining is the URBAN envelope, ' +
                    'which is a narrower and different claim. ⚠ This classification comes from the ' +
                    'harmonised MUC taxonomy rather than from a named article of your ' +
                    'municipality’s ordinance — a weaker evidence tier than a per-clau ordinance ' +
                    'table, stated here rather than dressed up as an article citation.',
                ordinanceRef: MUC_HARMONISED_TAXONOMY_REF,
                legallyGrounded: true,
                knownFacts,
            };
        }

        const developmentSentence =
            cls_?.disposition === 'development'
                ? ' ⚠ The harmonised class this parcel carries is *urbanitzable* — land designated ' +
                  'for development. In Catalan practice the detailed buildable parameters for such ' +
                  'land are set by a separately-approved DERIVED plan (a pla parcial) rather than ' +
                  'by the general plan’s base zone table, so a figure quoted from a general-plan ' +
                  'table alone would be citing the wrong instrument. PRYZM has resolved the class, ' +
                  'which is why it can tell you this; it has not read the derived plan, which is ' +
                  'why it publishes no number from it.'
                : '';

        span.setAttribute('pryzm.zoning.outcome', 'no-rule-pack');
        return {
            code: 'no-rule-pack',
            headline: `${where} — PRYZM has identified your land and its planning qualification precisely, but holds no transcribed ordinance for this municipality, so it will not publish a buildable figure.`,
            detail:
                body +
                developmentSentence +
                ' Rather than show an estimated or proxied number that would look like a ' +
                'determination, PRYZM shows none. UNKNOWN is not zero and it is not a permissive ' +
                'default. ' +
                CATALUNYA_ROADMAP_LINE,
            ordinanceRef: null,
            legallyGrounded: false,
            knownFacts,
        };
    } finally {
        span.end();
    }
}

/**
 * The registry-path refusal: the same answer, for a caller that holds only a zone code.
 *
 * The registry's `noRulePackRefusal` hook is called with `(zoneCode, zoneLabel, knownFacts)` and no
 * live lookup has happened on that path — so this adapter states BOTH lookups as `'unresolved'`
 * only when it genuinely has nothing, and otherwise reports the zone it was handed. It never
 * asserts a fetch PRYZM did not perform, which is the mistake `registry.ts` records Paris and the
 * Netherlands deliberately avoiding.
 *
 * P8 span: `pryzm.zoning.es.catalunya.catalunyaRegistryRefusal`.
 */
export function catalunyaRegistryRefusal(
    zoneCode: string | null,
    zoneLabel: string | null,
    knownFacts: readonly string[],
): EnvelopeRefusal {
    const span = tracer.startSpan('pryzm.zoning.es.catalunya.catalunyaRegistryRefusal');
    try {
        const hasZone = typeof zoneCode === 'string' && zoneCode.trim().length > 0;
        span.setAttribute('pryzm.zoning.hasZone', hasZone);
        return catalunyaNoRulePackRefusal({
            ineCode: null,
            municipalityName: null,
            // ⚠ The registry hands the MUNICIPAL clau, not the harmonised code — they are different
            // vocabularies and conflating them is exactly what `mucZoningProxy.js` warns against.
            harmonisedCode: null,
            harmonisedLabel: null,
            municipalClau: hasZone ? zoneCode!.trim() : null,
            municipalClauLabel: zoneLabel && zoneLabel.trim() ? zoneLabel.trim() : null,
            // A zone code the caller HANDED US is resolved; nothing was fetched to obtain it here,
            // but it is a real value and reporting it is honest. With no zone code, the truthful
            // value is `'not-attempted'` — NOT `'unresolved'`, which would claim a failed fetch.
            zoningLookup: hasZone ? 'resolved' : 'not-attempted',
            // No fetch happened on this path, and saying otherwise would assert a query PRYZM never
            // made — the mistake `registry.ts` records Paris and the NL deliberately avoiding.
            instrumentLookup: 'not-attempted',
            governingInstrument: null,
            knownFacts,
        });
    } finally {
        span.end();
    }
}
