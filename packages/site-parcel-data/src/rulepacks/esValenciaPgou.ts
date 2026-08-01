// ── VALÈNCIA (INE 46250) — PGOU, Normas Urbanísticas, Documento Definitivo, mayo 1991. ─────
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// THE SOURCE, AND ITS AUTHORITY STATUS — read this before trusting one number
// ══════════════════════════════════════════════════════════════════════════════════════════════
// Document : «PLAN GENERAL DE ORDENACION URBANA — NORMAS URBANISTICAS», Ayuntamiento de
//            València, OFICINA MUNICIPAL DEL PLAN. 157 pp, born-digital (full text layer).
//            Colophon: «Valencia, mayo de 1991. Por el Equipo Redactor: Alejandro Escribano
//            Beltrán. Arquitecto Director.»
// Retrieved: https://www.valencia.es/documents/20142/629631/
//              10.+Normas+Urbanísticas.+(Transcripción).pdf/ba78c368-ab86-c719-b9c4-e504111b3863
//            (2026-08-01, HTTP 200, 435 440 bytes, application/pdf).
//
// ⚠ AUTHORITY STATUS, STATED HONESTLY AND NOT OVERSOLD:
//   • Published by the MUNICIPALITY ITSELF on its own domain. It carries NO «sin valor
//     normativo» disclaimer — that was CHECKED, not assumed: the strings «sin valor normativo»
//     and «valor normativo» appear ZERO times in the 157 pp.
//   • ⚠ But the file is titled «(Transcripción)» — by its own label a RE-KEYING, not a scan of
//     the signed original. That is a real caveat and it is not hidden.
//   • A SECOND, STRONGER artefact exists and was also retrieved (HTTP 200, 11 796 297 bytes):
//     the GENERALITAT VALENCIANA's Registro Autonómico de Planeamiento deposit
//     `46250-1001 1991-0010`, at mediambient.gva.es/auto/urbanismo/reg-planeamiento/
//       4 VALENCIA/46250 VALENCIA/1 P. GENERAL/… /46250-1001 1991-0010  NORMAS URB.pdf
//     Note the INE code IN THE FILING PATH — the strongest municipality guarantee available for
//     a Spanish plan. ⚠ It is an IMAGE-ONLY SCAN: `pdftotext` yields ZERO characters. It cannot
//     be quoted from without OCR.
//   ⇒ EVERY QUOTE BELOW COMES FROM THE MUNICIPAL «(Transcripción)». Cross-checking them against
//     the GVA registry scan is a NAMED PRE-SIGNATURE TASK and is NOT done. Do not assume
//     concordance — the identical caveat Murcia carries for its 2017 re-edition.
//
// MUNICIPALITY VERIFIED THREE INDEPENDENT WAYS (the Badalona lesson — *always verify the
// MUNICIPALITY, never the numbers*; it has bitten this project three times):
//   1. Art. 0.1, verbatim: «…la revisión del planeamiento comarcal vigente en el estricto ámbito
//      del TÉRMINO MUNICIPAL DE VALENCIA…»
//   2. Page furniture on all 157 pp: «AYUNTAMIENTO DE VALENCIA / OFICINA MUNICIPAL DEL PLAN».
//   3. The GVA registry deposit path contains «46250 VALENCIA».
//
// Art. 0.3 (verbatim): «El Plan General será inmediatamente ejecutivo desde el día siguiente a su
// publicación en el Boletín Oficial. Su vigencia es indefinida y vincula tanto a los particulares
// como a la Administración.»
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS PACK IS FOR, AND WHY IT PUBLISHES NOTHING
// ══════════════════════════════════════════════════════════════════════════════════════════════
// `ES_VALENCIA_PGOU_PACK.zones` IS EMPTY. That is a FINDING, not an omission, and it is the whole
// point of the file. The ordinance was sourced, read and transcribed successfully — and it still
// yields no envelope, because València's general plan does not put its envelope numbers in its
// TEXT. It puts them on a DRAWING:
//
//   Art. 6.19.1 (ENS) «La altura de cornisa máxima de la edificación se establece en función del
//                      número de plantas GRAFIADO EN EL PLANO C … Hc = 4,80 + 2,90 Np»
//   Art. 6.18.2 (ENS) «La profundidad edificable será la señalada EN EL PLANO C.»
//   Art. 6.25.1 (EDA) «Hc = 5,30 + 2,90 Np» — same shape, DIFFERENT INTERCEPT
//   Art. 6.30.1 (UFA) «en función del número de plantas GRAFIADO EN EL PLANO C»
//
// PRYZM DOES NOT HOLD PLANO C. Checked, not assumed: the 70-layer public catalogue of
// `OPENDATA/UrbanismoEInfraestructuras` contains no plantas / profundidad / altura LAYER.
//
// ⇒ Every residential zone here is `constructed` on an input PRYZM does not hold, exactly like
// Murcia's street-width zones (`RC`, base `RM`, `RN`, `MZ`) — and it gets the same answer:
// A CITED REFUSAL. Packing a "representative" Np would publish one block's answer for the whole
// city, which is the L-526 failure and the L-616 mechanism-A failure at the same time.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// FOUR-STATE CLASSIFICATION — the method is EXTRACTION-PROTOCOL.md, and it is mandatory
// ══════════════════════════════════════════════════════════════════════════════════════════════
// Every parameter below is STATED / CONSTRUCTED / NOT-THE-RULE-KIND / UNKNOWN. The two-state
// "value or unknown" collapse produces wrong engines:
//   • CONSTRUCTED is ENGINEERING, not transcription. València's `Hc = a + 2,90·Np` IS an
//     algorithm, and its input is a graphic. No signature turns it into a number.
//   • NOT-THE-RULE-KIND is a FINDING. ENS and EDA have NO per-parcel FAR and NO ocupación BY
//     DESIGN — the envelope is alineación + profundidad edificable + altura de cornisa. A null
//     FAR here is the ordinance working, not a hole. (Searched: the ENS chapter contains no
//     `edificabilidad` and no `ocupación` figure at all.)
//   • A stated BOUND that is not a per-parcel value lives in `VALENCIA_STATED_BOUNDS` and is
//     NEVER encoded as a scalar (C58 §1.7a; L-616).
//
// PURITY: L2-pure (C58 §1.9) — no I/O, no THREE, no DOM, no clock. OTel spans on the exported
// resolvers (P8 / C58 §1.10).
//
// Strategic context — C58 §1.2/§1.4/§1.7a/§1.11 · C60 · C63 · L-449 · L-616 · L-656 · L-661 ·
// ADR-0270 (rule KIND) · docs/04-reference/jurisdictions/es/es-vc/46250-valencia/sources/.

import { trace, SpanStatusCode } from '@opentelemetry/api';
import {
    JurisdictionZoningContractSchema,
    type JurisdictionZoningContract,
} from '@pryzm/schemas';
import { VALENCIA_JURISDICTION_ID } from './esValenciaEnvelope.js';

const tracer = trace.getTracer('pryzm.zoning');

/** The one citation stem every value in this pack hangs from. */
export const VALENCIA_PGOU_SOURCE =
    'PGOU de València — Normas Urbanísticas, Documento Definitivo, mayo 1991 ' +
    '(Ayuntamiento de València, Oficina Municipal del Plan; valencia.es, ' +
    'archivo «10. Normas Urbanísticas. (Transcripción).pdf»)';

/**
 * The Generalitat's registry deposit id for the same instrument.
 *
 * Recorded separately because it is the artefact that PROVES the municipality (the INE code is
 * in the filing path) while being the artefact we CANNOT quote (image-only scan).
 */
export const VALENCIA_PGOU_GVA_DEPOSIT = '46250-1001 1991-0010' as const;

/**
 * ⚠ `unverified` — NEVER `none`.
 *
 * `none` is forbidden absent positive proof, and here there is positive evidence AGAINST it: a
 * *modificación-adaptación* of these Normas was approved 14-XII-1993 and published in **DOGV of
 * 7-II-1994**, bound into the same PDF after the 1991 colophon.
 *
 * ⚠ That modification DOES touch Art. 6.18 — but only as a *parcelación-licence clarification*
 * about segregation where a side-boundary angle is out of tolerance. It does NOT alter the
 * profundidad edificable or the alignment rule. **Checked, not assumed.**
 *
 * That closes ONE modification. The plan is 35 years old and the municipal GIS's own `origen`
 * field enumerates 494 distinct instruments, ~140 of them `MP` (Modificación Puntual). No
 * modification census was performed. ⇒ `unverified`.
 */
export const VALENCIA_PGOU_LATER_MODIFICATIONS = 'unverified' as const;

/**
 * The honesty tier for every reading here.
 *
 * `ordinance-pdf` — a human read the article in the municipality's own born-digital normative
 * PDF and quoted it verbatim. Strictly ABOVE machine-extracted `pipeline-extracted`, strictly
 * BELOW an official determination.
 */
export const VALENCIA_FIELD_PROVENANCE = 'ordinance-pdf' as const;

/** The four legal situations a parameter can be in. Never two. */
export type ValenciaParameterState =
    /** A scalar written in the text. Quote it and ship it. */
    | 'stated'
    /** The ordinance gives a PROCEDURE or a graphic-dependent formula, not a figure. */
    | 'constructed'
    /** The land is regulated by a different mechanism, so the field has no value BY DESIGN. */
    | 'not-the-rule-kind'
    /** Genuinely not held — including "the chapter has not been read". */
    | 'unknown';

/** At what spatial unit a parameter is fixed. A block figure shown as a parcel figure is a category error. */
export type ValenciaGranularity = 'parcel' | 'block' | 'sector' | 'municipality';

/** One calificación's classification record — the machine-readable form of the dossier table. */
export interface ValenciaCalificacionClassification {
    /** The code as València publishes it in `MapServer/231.califi` (+ `tipoca` grade). */
    readonly code: string;
    /** Official designation, verbatim from the article. */
    readonly label: string;
    /** The governing chapter/article of the Normas Urbanísticas. */
    readonly article: string;
    /** ADR-0270 / C58 §2.2 — the wrong KIND is a wrong SHAPE, not a wrong number. */
    readonly ruleKind:
        | 'alignment'
        | 'open-block-alignment'
        | 'setback'
        | 'existing-building-derived'
        | 'not-read';
    readonly granularity: ValenciaGranularity;
    readonly height: ValenciaParameterState;
    readonly depthOrSetback: ValenciaParameterState;
    readonly far: ValenciaParameterState;
    readonly coverage: ValenciaParameterState;
    /** Does this pack publish an envelope for the code, or a cited refusal? */
    readonly packed: boolean;
    /** Why, in one line, with the article that decides it. */
    readonly note: string;
}

/**
 * THE CALIFICACIÓN TABLE.
 *
 * ⚠ EVERY ROW IS `packed: false`, AND EVERY ROW NAMES THE ARTICLE THAT MAKES THE REFUSAL
 * CORRECT RATHER THAN LAZY. Three of the six residential rows refuse for the SAME reason
 * (Plano C); the CHP / TER / IND rows refuse because their chapters were NOT READ this turn,
 * which is a different claim and is labelled as such.
 *
 * ⚠⚠ THE ZONE VOCABULARY IS MUCH LARGER THAN THIS TABLE. The live layer publishes **109 base
 * `califi` codes and 551 code+grade combinations** (measured 2026-07-31,
 * `../findings/VALENCIA-DATA-RECON.md` §2.2). This table covers the SIX suelo-urbano
 * residential subzones of Título VI Caps. 3–5 plus three unread siblings — it is a start on the
 * vocabulary, NOT a census of it. Any code absent here resolves to no classification, which is
 * "we have not read this one", NOT "unregulated".
 */
export const VALENCIA_CALIFICACION_CLASSIFICATION: readonly ValenciaCalificacionClassification[] = [
    // ── ENSANCHE — Título VI, Capítulo Tercero. Arts. 6.15–6.21. ─────────────────────────────
    //
    // ⚠ THE BARE `ENS` ROW EXISTS BECAUSE THE LIVE LAYER PUBLISHES BARE `ENS`, AND BECAUSE
    // `tipoca` IS DIRTY. Art. 6.16 defines exactly two subzones (ENS-1 Ensanche, ENS-2 Ensanche
    // protegido), but the service returns `califi='ENS'` with a `tipoca` that may be `1`, `2`,
    // `2A`, `2ABC`, `2BL`, `B1`, `PTRX` — or `#`, `##`, `*`, `_`, `----` or whitespace. Without
    // this row a parcel whose grade is junk would resolve to NO classification, which reads as
    // *"we have not read this zone"* when in fact the chapter HAS been read and its answer is the
    // same refusal for every grade. Barcelona's bare-`20a` precedent (§BARE-20A-EXHAUSTED) is the
    // opposite case and the contrast is the point: there the subzones carry DIFFERENT numbers, so
    // a bare code must refuse for want of a SELECTOR. Here every ENS grade reduces to the same
    // Plano C dependency, so naming the zone costs nothing and tells the user more.
    {
        code: 'ENS', label: 'Ensanche (subzona no determinada)', article: 'Arts. 6.15 · 6.16 · 6.18 · 6.19',
        ruleKind: 'alignment', granularity: 'parcel',
        height: 'constructed', depthOrSetback: 'constructed',
        far: 'not-the-rule-kind', coverage: 'not-the-rule-kind',
        packed: false,
        note: 'The grade was absent or unreadable, so the ENS-1/ENS-2 distinction is not made. ' +
            '⚠ IT DOES NOT MATTER FOR THE ANSWER, AND THAT IS WHY THIS ROW IS SAFE: both subzones ' +
            'take their height from Art. 6.19.1 and their depth from Art. 6.18.2, and both are ' +
            'therefore CONSTRUCTED on Plano C. The refusal is identical either way. ⚠ It WOULD ' +
            'matter for anything else: Art. 6.19.3.c grants ENS-2 infill one extra storey and ' +
            'Art. 6.21 adds a protection regime, so this row must never be used as a stand-in for ' +
            'ENS-2 in any future computation.',
    },
    {
        code: 'ENS-1', label: 'Ensanche', article: 'Arts. 6.16.1.a · 6.18 · 6.19',
        ruleKind: 'alignment', granularity: 'parcel',
        height: 'constructed', depthOrSetback: 'constructed',
        far: 'not-the-rule-kind', coverage: 'not-the-rule-kind',
        packed: false,
        note: 'The alignment KIND is STATED and unambiguous — «La edificación no podrá retranquearse ' +
            'de la alineación exterior» (Art. 6.18.2) — and there is NO edificabilidad and NO ocupación ' +
            'anywhere in the chapter, so FAR and coverage are not-the-rule-kind BY DESIGN, not gaps. ' +
            'But BOTH remaining parameters are CONSTRUCTED on Plano C: height «en función del número ' +
            'de plantas grafiado en el Plano C» (6.19.1) and depth «la señalada en el Plano C» (6.18.2). ' +
            '⚠ The 20 m depth fallback does NOT rescue this — see VALENCIA_STATED_BOUNDS.',
    },
    {
        code: 'ENS-2', label: 'Ensanche protegido', article: 'Arts. 6.16.1.b · 6.16.2 · 6.21',
        ruleKind: 'alignment', granularity: 'parcel',
        height: 'constructed', depthOrSetback: 'constructed',
        far: 'not-the-rule-kind', coverage: 'not-the-rule-kind',
        packed: false,
        note: 'Same Plano C dependency as ENS-1, PLUS a protection regime with its own Art. 6.21 ' +
            'conditions that were not exhaustively read. ⚠ Art. 6.19.3.c additionally allows ENS-2 ' +
            'infill between two protected buildings to take ONE EXTRA STOREY beyond the Plano C count ' +
            'where the frontage is ≤32 m — so even a known Np would not be a ceiling here. ' +
            '⚠ Art. 6.16.2 delimits ENS-2 by STREET-NAME PERIMETERS (Primer Ensanche, Ensanche de Mora, ' +
            'Russafa, Grao, Quart, Padre Jofré, Convento Jerusalén); PRYZM must take the subzone from ' +
            'the GIS `tipoca` grade, never by parsing those lists.',
    },

    // ── EDIFICACIÓN ABIERTA — Título VI, Capítulo Cuarto. Arts. 6.22–6.25. ───────────────────
    {
        code: 'EDA', label: 'Edificación Abierta', article: 'Arts. 6.24 · 6.25',
        ruleKind: 'open-block-alignment', granularity: 'block',
        height: 'constructed', depthOrSetback: 'constructed',
        far: 'not-the-rule-kind', coverage: 'not-the-rule-kind',
        packed: false,
        note: '⚠⚠ THE MOST DANGEROUS ROW IN THE TABLE, AND THE REASON IT IS SPELLED OUT. EDA\'s formula ' +
            'is «Hc = 5,30 + 2,90 Np» (Art. 6.25.1) — IDENTICAL IN SHAPE to ENS\'s but with a DIFFERENT ' +
            'INTERCEPT (5,30, not 4,80). Two formulas that look the same at a glance and are not. ' +
            'Anyone copying ENS\'s constant here would publish every EDA building 0,50 m short, silently, ' +
            'forever. Granularity is `block`, not `parcel`: Art. 6.24.2 orders the occupation to the ' +
            'alineaciones of a GRAPHED BLOCK («bloques exentos … grafiados en el Plano C»).',
    },

    // ── VIVIENDA UNIFAMILIAR — Título VI, Capítulo Quinto. Arts. 6.26–6.41. ──────────────────
    //
    // ⚠ THE BARE `UFA` ROW IS WEAKER THAN THE BARE `ENS` ROW, AND IT SAYS SO. The three UFA types
    // share Art. 6.30's height table, so HEIGHT is grade-independent — but their parcel and
    // volume conditions live in three DIFFERENT secciones (6.36/6.37 for hilera, 6.39/6.40 for
    // aislada), which were not read. So this row can classify the height mechanism and must NOT
    // be read as classifying the setbacks.
    {
        code: 'UFA', label: 'Vivienda unifamiliar (tipo no determinado)', article: 'Arts. 6.26 · 6.27 · 6.30',
        ruleKind: 'not-read', granularity: 'parcel',
        height: 'constructed', depthOrSetback: 'unknown',
        far: 'not-the-rule-kind', coverage: 'unknown',
        packed: false,
        note: 'The type (agrupada / hilera / aislada, Art. 6.27.a–c) was not determined from the ' +
            'grade. Height is shared and CONSTRUCTED on Plano C via Art. 6.30\'s closed table ' +
            '(2→7 m, 3→10 m), so that much is classified. ⚠ The setbacks are NOT: `ruleKind` is ' +
            '`not-read` rather than `setback` or `alignment` precisely because UFA-1 is an ' +
            'ALIGNMENT typology and UFA-2/UFA-3 are SETBACK typologies — a bare UFA row that ' +
            'claimed either KIND would be asserting a shape it cannot know (ADR-0270).',
    },
    {
        code: 'UFA-1', label: 'Vivienda unifamiliar agrupada del tipo «Cases de Poble»', article: 'Arts. 6.27.a · 6.30',
        ruleKind: 'alignment', granularity: 'parcel',
        height: 'constructed', depthOrSetback: 'unknown',
        far: 'not-the-rule-kind', coverage: 'unknown',
        packed: false,
        note: 'Height is a CLOSED TABLE (2→7 m, 3→10 m) selected by the Plano C storey count — so it is ' +
            'CONSTRUCTED, but on a BOUNDED domain. ⚠ Art. 6.30.1 carries the one graphic-independent ' +
            'fallback in the whole chapter: «Caso de no grafiarse no se podrá edificar más de dos ' +
            'plantas sobre rasante.» That is a real STATED bound (VALENCIA_STATED_BOUNDS) and the most ' +
            'promising partial unlock in this city — it is NOT used here, because publishing the bound ' +
            'as a per-parcel value would overstate every parcel graphed at 2 plantas. Parcel conditions ' +
            'are remitted by Art. 6.29.1 to Secciones 3–5, which were not exhaustively read.',
    },
    {
        code: 'UFA-2', label: 'Vivienda unifamiliar en hilera', article: 'Arts. 6.27.b · 6.30 · 6.36 · 6.37',
        ruleKind: 'setback', granularity: 'parcel',
        height: 'constructed', depthOrSetback: 'unknown',
        far: 'not-the-rule-kind', coverage: 'unknown',
        packed: false,
        note: 'Shares Art. 6.30\'s Plano C table with UFA-1. Its own parcel and volume conditions live ' +
            'in Arts. 6.36/6.37 (Sección Cuarta), which were NOT READ this turn — so its setbacks are ' +
            'UNKNOWN, which is a different and weaker claim than not-the-rule-kind. Recorded as such.',
    },
    {
        code: 'UFA-3', label: 'Vivienda unifamiliar aislada', article: 'Arts. 6.27.c · 6.30 · 6.39 · 6.40',
        ruleKind: 'setback', granularity: 'parcel',
        height: 'constructed', depthOrSetback: 'unknown',
        far: 'not-the-rule-kind', coverage: 'unknown',
        packed: false,
        note: 'As UFA-2, with its own conditions in Arts. 6.39/6.40 (Sección Quinta) — NOT READ. ' +
            'UFA-3 is the detached typology and is the one most likely to carry real setback numbers; ' +
            'reading Sección Quinta is the cheapest next transcription task in this city.',
    },

    // ── SIBLING SUELO-URBANO ZONES — NAMED, NOT READ. A different claim, labelled differently. ─
    {
        code: 'CHP', label: 'Conjunto Histórico Protegido', article: 'Art. 6.3.1 · Título VI Cap. 2',
        ruleKind: 'not-read', granularity: 'parcel',
        height: 'unknown', depthOrSetback: 'unknown', far: 'unknown', coverage: 'unknown',
        packed: false,
        note: '⚠ NOT READ. Listed so its ABSENCE from the packed set is explicit rather than silent. ' +
            'Expected to be largely existing-building-derived (a protection regime), but that is a ' +
            'HYPOTHESIS and is recorded as `unknown`, never as a finding.',
    },
    {
        code: 'TER', label: 'Terciario', article: 'Art. 6.3.1 · Título VI Cap. 6 (Arts. 6.42–6.49)',
        ruleKind: 'not-read', granularity: 'parcel',
        height: 'unknown', depthOrSetback: 'unknown', far: 'unknown', coverage: 'unknown',
        packed: false,
        note: '⚠ NOT READ. Four subzones (TER-1…TER-4) with per-subzone articles; TER-2 grado A is ' +
            'expressly remitted to a «Plan Especial de Ordenación del Paseo…», i.e. at least partly ' +
            'delegated. Not classified.',
    },
    {
        code: 'IND', label: 'Industrias y Almacenes', article: 'Art. 6.3.1 · Título VI Cap. 7',
        ruleKind: 'not-read', granularity: 'parcel',
        height: 'unknown', depthOrSetback: 'unknown', far: 'unknown', coverage: 'unknown',
        packed: false,
        note: '⚠ NOT READ. Not classified.',
    },
] as const;

/**
 * The height formula for a zone, transcribed as DATA rather than as a magic number in code.
 *
 * ⚠ `Hc = intercept + 2,90 · Np`, where **Np is the graphed storey count MINUS ONE**. The
 * per-zone `intercept` is the whole difference between ENS and EDA and it is why this is a
 * table and not a constant.
 */
export interface ValenciaCorniceFormula {
    readonly zone: string;
    readonly article: string;
    /** Metres. ENS 4,80 · EDA 5,30. */
    readonly intercept_m: number;
    /** Metres per storey above the ground floor. 2,90 in both zones. */
    readonly perStorey_m: number;
    /** Verbatim, so a reader can check the transcription against the source. */
    readonly quote: string;
}

/**
 * THE TWO CORNICE FORMULAS, VERBATIM.
 *
 * ⚠ ENS 4,80 vs EDA 5,30. Recorded side by side precisely so the difference is impossible to
 * miss. See the `EDA` row of the classification table for why this is the most dangerous
 * near-collision in the València transcription.
 */
export const VALENCIA_CORNICE_FORMULAS: readonly ValenciaCorniceFormula[] = [
    {
        zone: 'ENS', article: 'Art. 6.19.1', intercept_m: 4.8, perStorey_m: 2.9,
        quote: 'La altura de cornisa máxima de la edificación se establece en función del número de ' +
            'plantas grafiado en el Plano C, con arreglo a la siguiente fórmula: Hc = 4,80 + 2,90 Np. ' +
            'Siendo Hc la altura de cornisa máxima expresada en metros y Np el número de plantas a ' +
            'edificar sobre la baja (es decir el señalado en los planos menos uno).',
    },
    {
        zone: 'EDA', article: 'Art. 6.25.1', intercept_m: 5.3, perStorey_m: 2.9,
        quote: 'La máxima altura de cornisa de la edificación se establece en función del número de ' +
            'plantas grafiado en el Plano C, con arreglo a la siguiente fórmula (salvo lo dispuesto en ' +
            'el párrafo 2): Hc = 5,30 + 2,90 Np. Siendo Hc la altura de cornisa máxima expresada en ' +
            'metros, y Np el número de plantas a edificar sobre la baja (es decir el señalado en los ' +
            'planos menos uno).',
    },
] as const;

/**
 * The ordinance's OWN derived table for ENS, transcribed verbatim from Art. 6.19.1.
 *
 * ⚠ THIS IS THE PROOF OBJECT FOR THE `−1` CORRECTION, and that is why it is here rather than
 * only in a test. The founder-supplied research read Np as "the number of storeys"; the article
 * defines it as *«el número de plantas a edificar sobre la baja (es decir el señalado en los
 * planos menos uno)»*. These eight rows discriminate the two readings decisively — at 5 plantas
 * the article says 16,40 m, which is `4,80 + 2,90·4`, not `4,80 + 2,90·5` = 19,30 m.
 *
 * Reading Np as the graphed count OVERSTATES every band by 2,90 m. L-616 mechanism-A.
 */
export const VALENCIA_ENS_HEIGHT_TABLE: readonly { graphedFloors: number; corniceHeight_m: number }[] = [
    { graphedFloors: 2, corniceHeight_m: 7.7 },
    { graphedFloors: 3, corniceHeight_m: 10.6 },
    { graphedFloors: 4, corniceHeight_m: 13.5 },
    { graphedFloors: 5, corniceHeight_m: 16.4 },
    { graphedFloors: 6, corniceHeight_m: 19.3 },
    { graphedFloors: 7, corniceHeight_m: 22.2 },
    { graphedFloors: 8, corniceHeight_m: 25.1 },
    { graphedFloors: 9, corniceHeight_m: 28.0 },
] as const;

/**
 * STATED BOUNDS — real, quotable limits that are NOT per-parcel values.
 *
 * ⚠ RECORDED SEPARATELY AND NEVER ENCODED AS A SCALAR. Each of these is a true statement of the
 * ordinance that a careless author would be tempted to pack as `maxHeight_m` or
 * `buildableDepth_m`. Packing any of them would publish a bound as though it were a
 * determination — overstating every parcel that sits below it (L-616 mechanism-A).
 */
export const VALENCIA_STATED_BOUNDS: readonly {
    code: string; article: string; bound: string; whyNotPacked: string; quote: string;
}[] = [
    {
        code: 'ENS', article: 'Art. 6.18.2',
        bound: 'buildable depth 20 m where Plano C graphs none',
        whyNotPacked:
            'THE FALLBACK IS CONDITIONAL, and this was the specific hypothesis tested. It applies only ' +
            '«Caso de no indicarse ésta» — where Plano C does NOT graph a depth — and PRYZM cannot ' +
            'observe whether it does. Packing 20 m would silently assert "Plano C graphs no depth here", ' +
            'a claim about a document we have not read, and it errs in BOTH directions: it overstates ' +
            'where the graphed depth is 15 m and understates where it is 24 m. ⚠ Even the fallback ' +
            'branch is not a clean 20 m — the luces-rectas rider makes parts of the resulting patio de ' +
            'manzana buildable BEYOND it.',
        quote: 'La profundidad edificable será la señalada en el Plano C. Caso de no indicarse ésta, no ' +
            'se podrá rebasar los 20 metros. No obstante, en este último caso, las porciones del ' +
            'hipotético patio de manzana resultante en las que las luces rectas hubieren de resultar ' +
            'menores de 8 metros se considerarán edificables con el número de plantas asignado por el ' +
            'Plan. En el resto del patio de manzana se podrá construir en planta baja.',
    },
    {
        code: 'UFA', article: 'Art. 6.30.1',
        bound: 'max 2 plantas sobre rasante where Plano C graphs nothing; table closed at 3 plantas / 10 m',
        whyNotPacked:
            '⚠ THIS IS THE STRONGEST PARTIAL-UNLOCK CANDIDATE IN VALÈNCIA AND IT IS STILL NOT PACKED. ' +
            'Unlike the ENS depth fallback, this one is genuinely graphic-independent in the ungraphed ' +
            'case, AND the table is CLOSED at 3 plantas — so no UFA parcel may exceed 10 m whatever ' +
            'Plano C says. That is a true ceiling. It is not a per-parcel value: publishing 10 m on a ' +
            'parcel graphed at 2 plantas overstates it by 3 m. A bound is not a determination. ' +
            'Converting this into a shippable conservative envelope is a separate, signable piece of ' +
            'work and is named in the dossier, not performed here.',
        quote: 'La altura de cornisa máxima de la edificación se establece en función del número de ' +
            'plantas grafiado en el Plano C, con arreglo al cuadro siguiente: 2 → 7; 3 → 10. Caso de no ' +
            'grafiarse no se podrá edificar más de dos plantas sobre rasante.',
    },
    {
        code: 'ENS', article: 'Art. 6.19.3',
        bound: 'enrase de cornisas may EXCEED the computed maximum',
        whyNotPacked:
            'A cautionary bound in the OPPOSITE direction, recorded so nobody treats a computed Hc as ' +
            'an absolute cap. Art. 6.19.3 can REQUIRE a building to align with a neighbour «aún ' +
            'superando las máximas indicadas», within a band E = 1,10 + 0,10·Np; and Art. 6.19.3.c ' +
            'allows one EXTRA storey for ENS-2 infill between two protected buildings on frontages ' +
            '≤32 m. So even a correct Np does not yield a hard ceiling for ENS.',
        quote: 'Cuando fuere necesario por razones de adecuación al entorno urbano, se exigirá que la ' +
            'altura de cornisa del edificio, o la del ático en su caso, aún superando las máximas ' +
            'indicadas, se enrase con la de cualesquiera de los edificios colindantes, protegidos o no.',
    },
] as const;

/**
 * §DELEGATION-MEASURED — the València equivalent of Murcia's 67 % ceiling. **MEASURED
 * 2026-08-01, and it is the CONTRARY result: València delegates LESS, not more.**
 *
 * València publishes the governing plan instrument as a COLUMN on the zoning layer
 * (`MapServer/231.origen`) rather than as a separate layer — architecturally better than Madrid,
 * because a parcel's instrument needs no second spatial join. The live vocabulary is **496
 * distinct instruments**, of which only ~12 are `PGOU*`; the rest are `PE` / `PEPRI` / `PRI` /
 * `RI` / `PP` / `ED` / `MP` / `CE` / `CU` / `UE` — individual documents PRYZM does not hold.
 *
 * ⚠⚠ **AN INSTRUMENT COUNT IS NOT A LAND SHARE, AND THE TWO DISAGREE BY A FACTOR OF FIVE HERE.**
 * "~482 of 496 instruments are not the PGOU" reads as 97 % delegated. **The measured LAND share
 * is 36,40 %.** Fourteen `PGOU*` rows cover more ground than 482 derived plans combined. Reading
 * the count as the share would have been a category error of exactly the kind ADR-0270 names.
 *
 * **HOW IT WAS MEASURED** (method recorded so it can be re-run and disputed):
 * all 21 210 polygons of `MapServer/231` downloaded with geometry in the native **EPSG:25830**
 * (metres), 2 000 per page, 11 pages, `geometryPrecision=2`; per-feature area by signed shoelace
 * over the ArcGIS rings (holes are counter-wound, so the signs cancel). The **unfiltered count
 * was asserted FIRST** (`where=1=1&returnCountOnly=true` → `{"count":21210}`) precisely because a
 * rejected `where` also returns `{"count":0}` and the two are indistinguishable by shape.
 *
 * **THE L-656 DENOMINATOR IS PRIVATE BUILDABLE LAND, NOT ALL LAND** — that distinction is the
 * whole point of L-656, and it moves the answer a long way:
 *
 * | denominator | delegated share |
 * |---|---|
 * | all 21 210 polygons (144,20 km²) | 20,58 % |
 * | `clase = SU` — suelo urbano (4 010,7 ha) | 40,20 % |
 * | **`clase = SU` ∧ Art. 6.3.1's six zones (1 874,9 ha)** ⟵ **the L-656 figure** | **36,40 %** |
 *
 * ⚠ `MP` (Modificación Puntual, 6,38 pp) is counted as DELEGATED here, and that is the
 * CONSERVATIVE reading rather than the obvious one: an `MP` amends the PGOU rather than replacing
 * it, so some `MP` land is arguably still PGOU-ordered — but PRYZM does not hold the amending
 * documents, so it cannot tell which. Counting it as ordered would claim coverage we lack.
 * ⇒ **30,02 % is the floor of the delegated share and 36,40 % the ceiling.** The pack uses the
 * ceiling, i.e. it under-claims its own reach.
 *
 * ⚠ Shares are of the LAYER's own total. The 21 210 polygons sum to **144,20 km²** against an
 * official municipal term of ≈134,65 km² — about 7 % more — so some polygons overlap (`PA`, `PM`
 * and `GIS` are large ámbito-shaped rows). **No claim is made about the municipal term's area**;
 * every percentage here is layer-relative and is stated as such.
 *
 * ⇒ Parcels whose `origen` is not `PGOU*` earn the `derived-plan` refusal
 * (`legallyGrounded: true`, a claim about the LAW). ⚠ **That routing is NOT yet wired** — it needs
 * the live `origen` read at the parcel — so every València parcel still gets `no-rule-pack`
 * (`legallyGrounded: false`, a claim about PRYZM), which is the WEAKER and therefore safer of the
 * two. Wiring it is the single largest closure step available (see `CLOSURE-REGISTER.md` #3).
 */
export const VALENCIA_DELEGATION_SHARE = 'measured' as const;

/**
 * The measured land shares, as data rather than as prose — so a test can pin them and a future
 * reader can tell a re-measurement from a re-typing.
 *
 * ⚠ EVERY FIGURE IS A SHARE OF `privateBuildableHa`, THE L-656 DENOMINATOR, unless its name says
 * otherwise. Measured 2026-08-01 against the live service; method in §DELEGATION-MEASURED.
 */
export const VALENCIA_LAND_SHARE_MEASURED_2026_08_01 = {
    /** Every polygon in `MapServer/231`. ⚠ Layer-relative; exceeds the municipal term by ~7 %. */
    layerTotalHa: 14419.8,
    /** `clase = SU` — suelo urbano. */
    suelourbanoHa: 4010.7,
    /**
     * `clase = SU` ∧ `califi` ∈ Art. 6.3.1's six suelo-urbano zones (CHP · ENS · EDA · UFA · TER ·
     * IND). Everything else inside SU is *sistemas* (`G*`/`P*`/`RV`) or another regime, and the
     * PGOU grants no private envelope on it. **THIS IS THE L-656 DENOMINATOR.**
     */
    privateBuildableHa: 1874.9,
    /** Of the L-656 denominator, the share the PGOU orders ITSELF (`origen` begins `PGOU`). */
    pgouOrderedPct: 63.6,
    /** Of the L-656 denominator, the share delegated to a derived instrument. ⚠ Includes `MP`. */
    delegatedPct: 36.4,
    /** The same share EXCLUDING `MP` — the floor of the delegated range. */
    delegatedExcludingMpPct: 30.02,
    /** Per-zone shares of the L-656 denominator, all instruments. */
    byZonePct: { ENS: 41.33, EDA: 29.94, CHP: 10.06, UFA: 8.15, IND: 5.53, TER: 4.99 },
    /**
     * Per-zone shares of the L-656 denominator, **PGOU-ordered land only** — i.e. the land a
     * transcription of the PGOU text could ever answer for.
     *
     * ⚠ `CHP` collapses from 10,06 % to 0,81 %: **92 % of València's protected historic fabric is
     * governed by a derived plan**, not by the general plan. Anyone who "closed" València by
     * reading Título VI Capítulo 2 would have covered 0,81 % of the city and believed it was 10 %.
     */
    pgouOrderedByZonePct: { ENS: 32.97, EDA: 21.4, UFA: 5.87, IND: 1.61, TER: 0.93, CHP: 0.81 },
} as const;

/**
 * THE PACK — DELIBERATELY EMPTY.
 *
 * ⚠⚠ `zones: []` IS THE RESULT, NOT A TODO. Do not "finish" this by adding a zone with a
 * representative Np or a 20 m depth. Every residential zone in Título VI Caps. 3–5 is
 * CONSTRUCTED on Plano C (see the classification table), and Plano C is not held. An empty
 * `zones` array is what "the ordinance was read and it does not answer without a drawing we do
 * not have" looks like in data.
 *
 * The pack object exists anyway — rather than being omitted — so that:
 *   • the source citation, CRS and review date are carried in the same shape as every other
 *     city, and the C60 coverage probe sees a jurisdiction that is PRESENT with zero zones
 *     rather than a jurisdiction that is ABSENT (failure ≠ empty, §CONTEXT-DATA-HONESTY);
 *   • adding Plano C later is a data change here, not a new file.
 *
 * `source:'manual'` — a curated artefact read from the normative PDF. València publishes no
 * numeric buildable parameter as a zoning attribute (verified against the layer's field schema,
 * not against one response: `MapServer/231` carries clase / califi / tipoca / uso / tipouso /
 * origen / categoria / uso_califi and housekeeping — no altura, no edificabilidad, no ocupación).
 *
 * `crs:'EPSG:25830'` — the native CRS of the municipal planning layers.
 *
 * `defaultConfidence: 'estimated-ruleset'` — the floor tier. It describes nothing today, since
 * there are no zones; it is set so that a future zone cannot inherit a flattering default.
 */
export const ES_VALENCIA_PGOU_PACK: JurisdictionZoningContract =
    JurisdictionZoningContractSchema.parse({
        jurisdictionId: VALENCIA_JURISDICTION_ID,
        displayName: 'València — PGOU Normas Urbanísticas (Documento Definitivo, mayo 1991)',
        source: 'manual',
        crs: 'EPSG:25830',
        lastReviewed: '2026-08-01',
        defaultConfidence: 'estimated-ruleset',
        zones: [],
    });

/**
 * The zone codes this pack answers for.
 *
 * ⚠ DERIVED from `ES_VALENCIA_PGOU_PACK.zones`, never re-typed — a hand-written list is a second
 * source of truth that can silently disagree with the pack it claims to describe. Today it is
 * necessarily EMPTY, and a test pins that it stays empty while `VALENCIA_ENVELOPE_VERIFIED` is
 * `false`.
 */
export const VALENCIA_PGOU_ZONE_CODES: readonly string[] = ES_VALENCIA_PGOU_PACK.zones
    .map((z) => z.code.toUpperCase())
    .sort();

/** Classification lookup, built once. */
const CLASS_BY_CODE: ReadonlyMap<string, ValenciaCalificacionClassification> = new Map(
    VALENCIA_CALIFICACION_CLASSIFICATION.map((c) => [c.code.toUpperCase(), c]),
);

/** Formula lookup, built once. */
const FORMULA_BY_ZONE: ReadonlyMap<string, ValenciaCorniceFormula> = new Map(
    VALENCIA_CORNICE_FORMULAS.map((f) => [f.zone.toUpperCase(), f]),
);

/** What a València calificación resolves to under the transcribed PGOU. */
export type ValenciaPgouResolution =
    | {
          readonly ok: false;
          readonly reason: 'no-calificacion' | 'not-packed';
          readonly classification: ValenciaCalificacionClassification | null;
      };

/**
 * Resolve a live València `califi` (+ optional `tipoca` grade) to a transcribed PGOU zone, or
 * say why not.
 *
 * ⚠ THE RETURN TYPE HAS NO `ok: true` VARIANT, AND THAT IS DELIBERATE. It is not a stub: it is
 * the type-level statement that this pack cannot currently produce a zone for ANY València
 * code. A future author who adds a packed zone must widen the type, which forces them past this
 * comment and past `VALENCIA_ENVELOPE_VERIFIED`.
 *
 * PURE (given the same input the answer is byte-identical); never throws. OTel span
 * `pryzm.zoning.resolveValenciaPgouZone` (P8 / C58 §1.10).
 *
 * ⚠ IT NEVER FALLS BACK TO A NEIGHBOURING ZONE. An unrecognised code returns `not-packed` with a
 * `null` classification, which the caller renders as a cited refusal.
 *
 * @param califi the `califi` attribute from `MapServer/231`.
 * @param tipoca the `tipoca` grade. ⚠ The live layer's `tipoca` contains junk (`#`, `##`, `*`,
 *        `_`, `-`, `----`, whitespace); anything non-alphanumeric is treated as ABSENT, never as
 *        a grade.
 */
export function resolveValenciaPgouZone(
    califi: string | null | undefined,
    tipoca?: string | null,
): ValenciaPgouResolution {
    const span = tracer.startSpan('pryzm.zoning.resolveValenciaPgouZone');
    try {
        const base = (califi ?? '').trim().toUpperCase();
        if (base === '') {
            span.setAttribute('resultFields', 'no-calificacion');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'no-calificacion', classification: null };
        }
        const grade = (tipoca ?? '').trim();
        const gradeOk = /^[A-Za-z0-9]+$/.test(grade);
        const code = gradeOk ? `${base}-${grade.toUpperCase()}` : base;

        // Try `ENS-2` first, then bare `ENS` — a graded code is more specific, and falling back
        // to the base row is correct because the base row's refusal is the same refusal.
        const classification = CLASS_BY_CODE.get(code) ?? CLASS_BY_CODE.get(base) ?? null;

        span.setAttribute('califi', base);
        span.setAttribute('resolvedCode', code);
        span.setAttribute('gradeUsable', gradeOk);
        span.setAttribute('resultFields', 'not-packed');
        span.setStatus({ code: SpanStatusCode.OK });
        return { ok: false, reason: 'not-packed', classification };
    } finally {
        span.end();
    }
}

/**
 * The classification record for a calificación, if a human has read and reasoned about it.
 *
 * Returns `null` for a code nobody has classified — which is NOT "the code is unregulated". It
 * is "we have not read this one", and callers must render it as such. With 109 base codes live
 * and 9 classified here, `null` is the COMMON case for València.
 *
 * PURE; never throws. OTel span `pryzm.zoning.valenciaCalificacionClassification` (P8).
 */
export function valenciaCalificacionClassification(
    califi: string | null | undefined,
    tipoca?: string | null,
): ValenciaCalificacionClassification | null {
    const span = tracer.startSpan('pryzm.zoning.valenciaCalificacionClassification');
    try {
        const r = resolveValenciaPgouZone(califi, tipoca);
        span.setStatus({ code: SpanStatusCode.OK });
        return r.classification;
    } finally {
        span.end();
    }
}

/**
 * Evaluate `Hc = intercept + 2,90 · (graphedFloors − 1)` for a zone.
 *
 * ⚠⚠ **THIS IS A TRANSCRIPTION ARTEFACT, NOT AN ENVELOPE PATH, AND THE PARAMETER NAME IS THE
 * CONTRACT.** `graphedFloors` means *the number actually read off Plano C for this parcel*.
 * PRYZM DOES NOT HOLD PLANO C. There is no production caller and there must not be one until
 * Plano C (or a validated `altura` parse — see §VALENCIA-ALTURA-LEAD) is a real input.
 *
 * Calling this with a guessed, typical or averaged storey count produces a FABRICATED
 * DETERMINATION, not an estimate (L-616 mechanism-A). The function exists so the formula and
 * its `−1` convention are pinned by tests against the ordinance's own eight-row table — which
 * is exactly how the founder-supplied "Np = number of storeys" reading was caught.
 *
 * Returns `null` rather than guessing for an unknown zone or a non-integer / sub-1 storey count.
 * OTel span `pryzm.zoning.valenciaCorniceHeightFromGraphedFloors` (P8 / C58 §1.10).
 *
 * @param zone `'ENS'` or `'EDA'` — ⚠ the intercepts DIFFER (4,80 vs 5,30).
 * @param graphedFloors the storey count graphed on Plano C, INCLUDING the planta baja.
 */
export function valenciaCorniceHeightFromGraphedFloors(
    zone: string,
    graphedFloors: number,
): number | null {
    const span = tracer.startSpan('pryzm.zoning.valenciaCorniceHeightFromGraphedFloors');
    try {
        const f = FORMULA_BY_ZONE.get((zone ?? '').trim().toUpperCase());
        if (!f) {
            span.setAttribute('resultFields', 'unknown-zone');
            span.setStatus({ code: SpanStatusCode.OK });
            return null;
        }
        if (!Number.isInteger(graphedFloors) || graphedFloors < 1) {
            span.setAttribute('resultFields', 'invalid-floors');
            span.setStatus({ code: SpanStatusCode.OK });
            return null;
        }
        // Np = graphed floors MINUS ONE — «el número de plantas a edificar sobre la baja».
        const np = graphedFloors - 1;
        // Round to 2 dp: the article's own table is stated to the centimetre, and binary float
        // would otherwise render 16,400000000000002 for the 5-planta band.
        const hc = Math.round((f.intercept_m + f.perStorey_m * np) * 100) / 100;
        span.setAttribute('zone', f.zone);
        span.setAttribute('graphedFloors', graphedFloors);
        span.setAttribute('resultFields', 'corniceHeight_m');
        span.setStatus({ code: SpanStatusCode.OK });
        return hc;
    } finally {
        span.end();
    }
}
