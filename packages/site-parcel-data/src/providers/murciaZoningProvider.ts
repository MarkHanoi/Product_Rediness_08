// ── MURCIA (INE 30030) ZONING → ENVELOPE DISPOSITION. PURE; no I/O. ─────────────────────
//
// WHAT MURCIA ACTUALLY PUBLISHES (live-verified 2026-07-31, exact point-intersect, n = 2
// points with a discriminating control — see MURCIA-DATA-RECON.md)
// ---------------------------------------------------------------------------------------
// Murcia's municipal GeoServer answers a point query with structured planning attributes:
//
//   `Murcia:pgou_alineaciones`  ⚠ MISLEADINGLY NAMED. Despite "alineaciones" it is a
//                               MultiSurface POLYGON layer and it carries the CALIFICACIÓN:
//                               `calificacion` (zone code) + `descripcion` (official
//                               designation) + `uso_global` + `sector` + `url` (the ficha
//                               PDF filename) + `f_inicial`/`f_fin` (temporal validity).
//   `Murcia:pgou_sectores`      the ámbito/sector: `sector`, `clase_suelo`, `categoria`,
//                               `uso_global`, `pedania`, `superficie`, `f_inicial`/`f_fin`.
//
// ⚠ `f_inicial` / `f_fin` ARE THE LEGAL-STATUS ATTRIBUTES. Murcia's answer to the question
// Denmark answers with booleans (`bygkunifelt`/`bygvejledende`) and Portugal with plan
// state (`IDESTADO`/`VALIDADE`) is a VALIDITY INTERVAL: a currently-in-force record carries
// `f_fin = 2999-12-30`. A record whose `f_fin` has passed is superseded and MUST NOT be
// used. Reading the attribute without the interval would silently quote a repealed rule.
//
// THE FINDING THAT DECIDES THE ENVELOPE
// ------------------------------------
// For the whole `TA` / `RR` family the PGOU does **not** set the building conditions — it
// says so itself, in its own articles:
//
//   Art. 6.6.1.1 — suelo urbanizable transitorio comprises sectors "con planeamiento
//       aprobado en desarrollo del Plan anterior … cuya ordenación se mantiene vigente y se
//       incorpora al presente Plan General."
//   Art. 6.6.2  — "Los ámbitos … cuya ordenación anteriormente aprobada **se convalida
//       plenamente** se identifican … con el código TA seguido del **número del expediente
//       del correspondiente instrumento de desarrollo del planeamiento anterior**."
//   Art. 5.24.5.1 — for the generic residential calificación RR, "sus condiciones de
//       edificación son **enteramente concordantes con las definidas en los anteriores
//       instrumentos convalidados**."
//
// ⇒ The governing numbers live in a PRIOR, SEPARATELY-APPROVED development instrument whose
// expediente number is the digits after `TA-`. PRYZM does not hold that instrument.
//
// THIS MAKES THE REFUSAL **LEGALLY GROUNDED**, NOT A COVERAGE GAP. That distinction is the
// whole point: `no-rule-pack` says "PRYZM has not encoded this"; `derived-plan` says "the
// ordinance answers, and its answer is *that document, not this one*". The second is a
// statement we can make with a citation, and it is strictly more useful to the user —
// it names the document they must obtain.
//
// ⚠⚠ AND IT IS WHY NO NUMBER MAY BE SYNTHESISED HERE. A competitor screening report on this
// exact parcel published an edificabilidad of ~262 m² as a "proxy PGOU". Under Art. 6.6.2 a
// general-plan zone table is the WRONG INSTRUMENT for this land, so a proxy drawn from one
// is not merely imprecise — it cites a document that expressly disclaims the question.
//
// PURITY: L2-pure (C58 §1.9). This module maps ALREADY-FETCHED attributes to a disposition.
// The fetch belongs in a proxy/provider above it, exactly as `mapPlandataToZoningRecord.ts`
// separates the DK mapping from the DK fetch.

import type { EnvelopeRefusal, ZoningRule } from '@pryzm/schemas';
import {
    MURCIA_ENVELOPE_VERIFIED,
    MURCIA_ROADMAP_LINE,
    type DerivedPlanMarker,
} from '../rulepacks/esMurciaEnvelope.js';
import {
    resolveMurciaPgouZone,
    type MurciaCalificacionClassification,
} from '../rulepacks/esMurciaPgou2012.js';

/** Attributes of `Murcia:pgou_alineaciones` — the calificación polygon. Field names verbatim. */
export interface MurciaCalificacionFeature {
    readonly calificacion: string | null;
    readonly descripcion: string | null;
    readonly uso_global: string | null;
    readonly sector: string | null;
    /** Ficha filename, e.g. `RR.pdf`, served under `/infourb/normas/`. */
    readonly url: string | null;
    /** ISO date the record took effect. */
    readonly f_inicial: string | null;
    /** ISO date the record ceases. `2999-12-30` is Murcia's "still in force" sentinel. */
    readonly f_fin: string | null;
}

/** Attributes of `Murcia:pgou_sectores` — the ámbito/sector polygon. Field names verbatim. */
export interface MurciaSectorFeature {
    readonly sector: string | null;
    readonly clase_suelo: string | null;
    readonly categoria: string | null;
    readonly uso_global: string | null;
    readonly pedania: string | null;
    readonly superficie: number | null;
    readonly f_inicial: string | null;
    readonly f_fin: string | null;
}

/** Base URL the calificación ficha PDFs are served from (verified live 2026-07-31). */
export const MURCIA_FICHA_BASE = 'http://urbanismo.murcia.es/infourb/normas/';

/**
 * Is a Murcia planning record currently in force?
 *
 * ⚠ THREE-VALUED ON PURPOSE. `null` means the record carries no usable interval, which is
 * NOT the same as "in force" and must never default to `true`. A record we cannot date is
 * a record we cannot safely quote.
 *
 * @param asOf ISO date to test against. Injected, never `Date.now()` — this module is pure.
 */
export function isInForce(
    f_inicial: string | null | undefined,
    f_fin: string | null | undefined,
    asOf: string,
): boolean | null {
    const norm = (s: string | null | undefined): string | null => {
        if (!s) return null;
        const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
        return m && m[1] ? m[1] : null;
    };
    const start = norm(f_inicial);
    const end = norm(f_fin);
    const now = norm(asOf);
    if (!now) return null;
    if (!start && !end) return null;
    if (start && now < start) return false;
    if (end && now >= end) return false;
    return true;
}

/**
 * Ámbito-code prefixes whose ordering the PGOU remits to a PRIOR instrument.
 *
 * `TA` / `TM` — Título 6 Capítulo 6 (*suelo urbanizable transitorio*), Arts. 6.6.1–6.6.3.
 * `UA` / `UH` / `UM` — Título 5 Capítulo 24, *"ORDENACIÓN REMITIDA AL PLANEAMIENTO
 * ANTERIOR"*, the chapter that contains Art. 5.24.5 (the RR calificación).
 *
 * Both chapter headings say the same thing in the plan's own words, which is why this is a
 * legal classification and not a heuristic.
 */
export const REMITTED_AMBITO_PREFIXES: readonly string[] = ['TA', 'TM', 'UA', 'UH', 'UM'];

// ─────────────────────────────────────────────────────────────────────────────
// §R-7-DELEGATION-PARITY — the PGOU delegates on FOUR grounds; this file used to test ONE.
//
// `REMITTED_AMBITO_PREFIXES` above is the *ordenación remitida* chapter only. Measured against the
// live layers (`tools/murcia-coverage-crosstab/`, `out-crosstab.json`), testing only that prefix set
// would have published a general-plan number on **13.09 pp** of buildable land the general plan
// expressly declines to order — taking rendered coverage to 36.59 %, ABOVE the 33.00 % the PGOU
// orders directly. That is the *«proxy PGOU»* error this dossier exists to prevent, and it was
// latent in our own dispatch (RISK-REGISTER §R-7).
//
// These two predicates close it. They mirror `delegationGround()` in the crosstab tool's
// `classify.mjs`, which is the reviewed legal classification; the crosstab test pins the two
// together so the measurement and the shipping behaviour cannot silently drift apart.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Ámbito prefixes that delegate WITHOUT being *ordenación remitida*:
 * `UE` — Unidad de Actuación (Art. 5.25.1) · `UD` — Estudio de Detalle (Art. 5.25.2).
 * Kept separate from `REMITTED_AMBITO_PREFIXES` because the citation differs: these delegate
 * FORWARD to an instrument still to be approved, not BACK to a convalidated prior one.
 */
export const DELEGATING_AMBITO_PREFIXES: readonly string[] = ['UE', 'UD'];

/**
 * Planes Especiales / Parciales (Art. 5.26.2) — `PERI`, `PU`, `PM`, `PI`, `PC`, `PP`, `PE`…
 * ⚠ `PAR` is excluded: it is a *parcela* code, not a plan ámbito.
 */
export function isPlanEspecialPrefix(prefix: string | null | undefined): boolean {
    const p = String(prefix ?? '');
    return /^P[A-Z]*$/.test(p) && p !== 'PAR';
}

/**
 * Art. 6.2.2.3 — *suelo urbanizable* is ordered by its Plan Parcial, never by the general plan.
 *
 * ⚠ The negative guard is load-bearing: «suelo NO urbanizable» contains the word *urbanizable* and
 * would match a naive test, wrongly delegating protected rural land (which the PGOU DOES order
 * directly). Measured on the live layer, `clase_suelo` carries both strings.
 */
export function isUrbanizableClase(claseSuelo: string | null | undefined): boolean {
    const s = String(claseSuelo ?? '');
    if (/^\s*no\s+urbanizable/i.test(s)) return false;
    return /urbanizable/i.test(s);
}

/** The generic calificación the remitted chapters use for residential land. */
export const REMITTED_RESIDENTIAL_CALIFICACION = 'RR';

/**
 * Split a Murcia sector code into its prefix and the expediente number that follows.
 * `TA-379` → `{ prefix: 'TA', expediente: '379' }`.
 *
 * Art. 6.6.2 is explicit that the digits ARE the expediente of the prior instrument, which
 * is what makes this parse a legal fact rather than string-mangling.
 */
export function parseSectorCode(
    sector: string | null | undefined,
): { prefix: string; expediente: string | null } | null {
    if (!sector) return null;
    const m = sector.trim().toUpperCase().match(/^([A-Z]+)(?:-(\w+))?/);
    if (!m || !m[1]) return null;
    return { prefix: m[1], expediente: m[2] ?? null };
}

/** Does the PGOU remit this ámbito's ordering to an earlier instrument? */
export function isRemittedAmbito(sector: string | null | undefined): boolean {
    const p = parseSectorCode(sector);
    return p != null && REMITTED_AMBITO_PREFIXES.includes(p.prefix);
}

export type MurciaEnvelopeDisposition =
    | { readonly kind: 'refusal'; readonly refusal: EnvelopeRefusal }
    /**
     * ⚠ REACHABLE ONLY AFTER SIGN-OFF. Emitted when the live calificación resolves to a zone
     * transcribed from the PGOU Normas Urbanísticas **and** `envelopeVerified` is true. While
     * `MURCIA_ENVELOPE_VERIFIED` is false — which it is — this branch is unreachable in
     * production and every packed zone returns the `awaiting-verification` refusal below.
     */
    | {
          readonly kind: 'envelope';
          readonly zone: ZoningRule;
          readonly classification: MurciaCalificacionClassification | null;
          /**
           * The code the pack actually MATCHED, which is not always the live calificación string:
           * `RF1` resolves to `RF` and `IXT` to `IX` via the two allow-listed `PACKED_VARIANTS`.
           *
           * ⚠ LOAD-BEARING FOR THE RENDER PATH. `computeBuildableEnvelope` looks the zone up with
           * `findZone(rulePack, zoning.zoneCode)`, so handing it the raw live string would silently
           * find NO zone for a variant and fall through to a whole-parcel answer. Passing the
           * matched code keeps the rendered envelope and the cited article the SAME zone.
           */
          readonly matchedCode: string;
          /**
           * ⚠ PRESENT ON PURPOSE, AND IT IS A SAFETY INTERLOCK, NOT A CONVENIENCE.
           *
           * The L5 dispatcher (`applyMurciaZoningThenFallback`) branches on `kind === 'refusal'`
           * and treats EVERYTHING else as the `unresolved` case, reading `.reason` and falling
           * through to the coverage refusal. It has not been taught this branch.
           *
           * Carrying `reason` here means that if the verification gate is opened BEFORE the
           * dispatcher learns to consume an envelope, Murcia degrades to a cited refusal and logs
           * why — instead of failing to compile, or worse, silently rendering nothing on a
           * compliance surface. Remove this field only in the same change that teaches L5 the
           * branch, and never before.
           */
          readonly reason: string;
      }
    | { readonly kind: 'unresolved'; readonly reason: string };

/**
 * THE DISPOSITION. Given the live attributes at a point, decide what PRYZM may say.
 *
 * ── WHAT CHANGED, AND WHY THE OLD COMMENT HERE WAS WRONG ────────────────────────────────
 * This header used to state that there was "deliberately no `'envelope'` branch" because
 * PRYZM held no Murcia ordinance. The first half is still true of the WFS — Murcia publishes
 * zone IDENTITY, official DESIGNATION, land CLASS and temporal validity, and **no numeric
 * buildable parameter** as an attribute (verified against the `DescribeFeatureType` schemas,
 * not merely against one response). The second half is no longer true: the PGOU *Normas
 * Urbanísticas* (Texto Refundido diciembre 2012) HAS now been sourced and transcribed, and
 * `esMurciaPgou2012.ts` holds 14 zones whose every envelope-determining parameter is STATED
 * at parcel granularity, each carrying its article and a verbatim quote.
 *
 * So the numbers exist. What does NOT exist is a SIGNATURE. Transcription is a legal act, and
 * `MURCIA_ENVELOPE_VERIFIED` is the gate for it. Until it flips, a packed zone yields a
 * refusal that NAMES its governing article — strictly more useful than the old
 * "PRYZM holds no Murcia ordinance" line, which would now be a false statement about our own
 * coverage — but publishes NO number.
 *
 * ⚠ Two thirds of Murcia's private buildable land (measured: 67.0 % of 75.145 km²) never
 * reaches the pack at all, because the PGOU delegates it. Those branches are unchanged and
 * remain the legally-grounded `derived-plan` refusal.
 *
 * @param asOf ISO date used for the validity test. Injected; this module has no clock.
 * @param envelopeVerified INJECTED so a test can exercise the post-signature shape without
 *        flipping the production constant. Defaults to `MURCIA_ENVELOPE_VERIFIED` (false).
 */
export function murciaEnvelopeDisposition(
    calificacion: MurciaCalificacionFeature | null,
    sectorFeature: MurciaSectorFeature | null,
    asOf: string,
    derivedPlans: readonly DerivedPlanMarker[] = [],
    envelopeVerified: boolean = MURCIA_ENVELOPE_VERIFIED,
): MurciaEnvelopeDisposition {
    if (!calificacion && !sectorFeature) {
        return {
            kind: 'unresolved',
            reason:
                'No Murcia calificación or sector polygon covers this point. That is not "no rules" — ' +
                'it is no answer, and it must not be rendered as an absence of constraint.',
        };
    }

    const sector = sectorFeature?.sector ?? calificacion?.sector ?? null;
    const parsed = parseSectorCode(sector);
    const calForce = calificacion
        ? isInForce(calificacion.f_inicial, calificacion.f_fin, asOf)
        : null;
    const secForce = sectorFeature
        ? isInForce(sectorFeature.f_inicial, sectorFeature.f_fin, asOf)
        : null;

    const knownFacts: string[] = [];
    if (sector) knownFacts.push(`Ámbito / sector: ${sector}`);
    if (calificacion?.calificacion) {
        knownFacts.push(
            `Calificación: ${calificacion.calificacion}` +
                (calificacion.descripcion ? ` — ${calificacion.descripcion}` : ''),
        );
    }
    if (sectorFeature?.clase_suelo) {
        knownFacts.push(
            `Clase de suelo: ${sectorFeature.clase_suelo}` +
                (sectorFeature.categoria ? ` (${sectorFeature.categoria})` : ''),
        );
    }
    if (sectorFeature?.uso_global ?? calificacion?.uso_global) {
        knownFacts.push(`Uso global: ${sectorFeature?.uso_global ?? calificacion?.uso_global}`);
    }
    if (sectorFeature?.pedania) knownFacts.push(`Pedanía: ${sectorFeature.pedania}`);
    if (calForce === false || secForce === false) {
        knownFacts.push('⚠ At least one planning record at this point is outside its validity interval.');
    }

    // ── The legally-grounded case: the PGOU remits the ordering to a prior instrument. ──
    if (parsed && REMITTED_AMBITO_PREFIXES.includes(parsed.prefix)) {
        const expediente = parsed.expediente;
        const named = derivedPlans
            .map((d) => `${d.family}${d.ref ? ` ${d.ref}` : ''}`)
            .join(' · ');

        const article =
            parsed.prefix === 'TA' || parsed.prefix === 'TM'
                ? 'PGOU Murcia, Normas Urbanísticas, Título 6 Cap. 6 — Arts. 6.6.1 y 6.6.2 (suelo urbanizable transitorio; ordenación anterior convalidada plenamente)'
                : 'PGOU Murcia, Normas Urbanísticas, Título 5 Cap. 24 — «Ordenación remitida al planeamiento anterior» (ámbitos UA, UH, UM)';

        const ordinanceRef =
            calificacion?.calificacion === REMITTED_RESIDENTIAL_CALIFICACION
                ? `${article}; y Art. 5.24.5.1 (calificación genérica residencial RR: «sus condiciones de edificación son enteramente concordantes con las definidas en los anteriores instrumentos convalidados»)`
                : article;

        return {
            kind: 'refusal',
            refusal: {
                code: 'derived-plan',
                headline:
                    `${sector ?? 'This ámbito'} — the PGOU does not set this parcel's building ` +
                    'conditions. It expressly adopts those of an earlier, separately-approved plan.',
                detail:
                    'PRYZM has identified the land and read the governing planning records live from ' +
                    "Murcia's own municipal planning service. Those records say the general plan is not " +
                    'the instrument that fixes what may be built here: Art. 6.6.2 states that an ámbito ' +
                    'coded TA carries the ordering of the previous plan **convalidada plenamente** (fully ' +
                    'validated), identified by the code TA followed by the *expediente* number of that ' +
                    'earlier development instrument' +
                    (expediente ? ` — here, expediente ${expediente}` : '') +
                    '. Art. 6.6.1.4 further records that those ámbitos and their *fichas de ordenación* ' +
                    'are listed in the Anexo al Volumen 2 de la Memoria, which links the general-plan code ' +
                    'to the name under which the plan was actually approved.' +
                    (named
                        ? ` The cadastral address for this parcel independently names that instrument: ${named}.`
                        : '') +
                    ' PRYZM does not hold that instrument, so it publishes no height, buildability, ' +
                    'occupation or setback for this parcel. ⚠ A figure taken from a general-plan zone ' +
                    'table would cite a document that expressly declines to answer the question. ' +
                    MURCIA_ROADMAP_LINE,
                ordinanceRef,
                // ⚠ TRUE, and this is the substantive claim: the ordinance ANSWERED, and its
                // answer was "that other document". It is not a statement about our coverage.
                legallyGrounded: true,
                knownFacts,
            },
        };
    }

    // ── §R-7-DELEGATION-PARITY — the OTHER three delegation grounds. ──
    //
    // ⚠ THIS BLOCK MUST STAY ABOVE THE PGOU-DIRECT BLOCK, for exactly the reason stated there:
    // Arts. 5.25.3.3 / 5.26.3.3 reduce a zonal code's scope inside a delegating ámbito to use and
    // typology, «pero no a los parámetros definitorios de la altura o edificabilidad». A packed
    // calificación (RD, IX, RF…) sitting on urbanizable soil or inside a UE/UD/P* ámbito must
    // therefore NOT be answered from its ordinance — and before this block existed, it was:
    // `resolveMurciaPgouZone` matched the code and returned an `envelope` disposition.
    //
    // Ordered clase-first to match `delegationGround()` in the crosstab's `classify.mjs`, so the
    // article this cites is the same one the measurement attributes the land to.
    const claseSuelo = sectorFeature?.clase_suelo ?? null;
    const delegated: { article: string; ground: string } | null =
        isUrbanizableClase(claseSuelo)
            ? {
                  ground: 'clase-urbanizable',
                  article:
                      'PGOU de Murcia, Normas Urbanísticas, Art. 6.2.2.3 — el suelo urbanizable ' +
                      'sectorizado se ordena mediante su Plan Parcial, no por el plan general',
              }
            : parsed &&
                (DELEGATING_AMBITO_PREFIXES.includes(parsed.prefix) || isPlanEspecialPrefix(parsed.prefix))
              ? {
                    ground: 'ambito-delegante',
                    article:
                        'PGOU de Murcia, Normas Urbanísticas, ' +
                        (parsed.prefix === 'UE'
                            ? 'Art. 5.25.1 (Unidad de Actuación)'
                            : parsed.prefix === 'UD'
                              ? 'Art. 5.25.2 (Estudio de Detalle)'
                              : 'Art. 5.26.2 (Planes Especiales / Parciales)') +
                        '; y Arts. 5.25.3.3 / 5.26.3.3 — dentro del ámbito el código zonal alcanza ' +
                        'sólo uso y tipología, «pero no a los parámetros definitorios de la altura o ' +
                        'edificabilidad»',
                }
              : null;

    if (delegated) {
        return {
            kind: 'refusal',
            refusal: {
                code: 'derived-plan',
                headline:
                    `${sector ? `Ámbito ${sector}` : 'This parcel'} — the PGOU does not set this ` +
                    "parcel's height or buildability. It delegates them to a separate plan.",
                detail:
                    'PRYZM has identified the land and read the governing planning records live from ' +
                    "Murcia's own municipal planning service. " +
                    (delegated.ground === 'clase-urbanizable'
                        ? 'This parcel is classified *suelo urbanizable*: Art. 6.2.2.3 orders it through ' +
                          'the Plan Parcial of its sector, which is a separate instrument PRYZM does not hold. '
                        : 'This parcel sits inside a delegating ámbito, whose conditions are fixed by an ' +
                          'instrument developed under the general plan rather than by the general plan itself. ') +
                    '⚠ A calificación code IS shown on the municipal plan for this land, and PRYZM has ' +
                    'transcribed that code\'s ordinance — but Arts. 5.25.3.3 / 5.26.3.3 state that inside ' +
                    'such an ámbito the code governs only use and typology, NOT height or buildability. ' +
                    'Publishing this zone\'s general-plan figures here would cite a document that ' +
                    'expressly declines to answer the question. ' +
                    MURCIA_ROADMAP_LINE,
                ordinanceRef: delegated.article,
                // TRUE: the ordinance ANSWERED, and its answer was "that other document".
                legallyGrounded: true,
                knownFacts,
            },
        };
    }

    // ── The PGOU-DIRECT case: Título 5 Caps. 2–23 fix this zone's conditions itself. ──
    //
    // ⚠ ORDER MATTERS AND IS LOAD-BEARING. This sits BELOW the remitted-ámbito gate on purpose:
    // Arts. 5.25.3.3 / 5.26.3.3 say that inside a delegating ámbito a zonal code's scope "se
    // reduce a las condiciones de uso y tipología … pero no a los parámetros definitorios de la
    // altura o edificabilidad". So an RM1 polygon inside a PERI ámbito must NOT be answered from
    // the RM1 ordinance. Moving this block above the remitted gate would publish a general-plan
    // number for land the general plan expressly declines to order — the exact error the
    // competitor's "proxy PGOU" made on the founder's own parcel.
    const pgou = resolveMurciaPgouZone(calificacion?.calificacion);
    if (pgou.ok) {
        const cls = pgou.classification;
        const article = cls
            ? `PGOU de Murcia, Normas Urbanísticas, Texto Refundido diciembre 2012, ${cls.article}`
            : null;

        if (envelopeVerified) {
            return {
                kind: 'envelope',
                zone: pgou.zone,
                classification: cls,
                matchedCode: pgou.matchedCode,
                reason:
                    `A signed PGOU envelope is available for calificación ${pgou.matchedCode}` +
                    `${cls ? ` (${cls.article})` : ''}, but the L5 dispatcher does not yet consume ` +
                    'an envelope disposition for Murcia — falling back to the cited refusal.',
            };
        }

        return {
            kind: 'refusal',
            refusal: {
                code: 'no-rule-pack',
                headline:
                    `${calificacion?.calificacion ?? pgou.matchedCode}${cls ? ` — ${cls.label}` : ''}: the PGOU ` +
                    'DOES set this parcel\'s building conditions directly, and PRYZM has transcribed them — ' +
                    'but they are withheld until a human verifies the transcription.',
                detail:
                    'This land is NOT delegated to a partial plan. Its calificación is governed by an ' +
                    'ordinance of the general plan itself' +
                    (cls ? ` (${cls.article}, rule kind: ${cls.ruleKind}, granularity: ${cls.granularity})` : '') +
                    ', and that ordinance has been read from the municipality\'s own normative text — the ' +
                    'PGOU Normas Urbanísticas, Texto Refundido diciembre 2012 — and transcribed article by ' +
                    'article with verbatim quotes. ⚠ What is missing is not the law and not the data: it is ' +
                    'the SIGNATURE. Publishing a compliance figure is a legal act, so PRYZM will not render ' +
                    'one until a human has checked the transcription against the source and signed ' +
                    '`sources/VERIFICATION.md`. Until then this refusal names the governing article so you ' +
                    'can read it yourself, which an invented number never could. ' +
                    // ⚠ `cls.note` is DELIBERATELY NOT INTERPOLATED HERE. The notes carry the
                    // transcribed scalars ("FAR 1,3 m²/m², 2 plantas/7 m…") for the dossier and for
                    // developers. Putting them in a user-facing refusal would publish, in prose,
                    // exactly the figures the verification gate exists to withhold — a gate you can
                    // read around is not a gate. A test pins this.
                    MURCIA_ROADMAP_LINE,
                ordinanceRef: article,
                // FALSE, and precisely: the ordinance ANSWERS here. What is unverified is PRYZM's
                // reading of it. Claiming `legallyGrounded: true` would attribute our own
                // unverified state to the law.
                legallyGrounded: false,
                knownFacts,
            },
        };
    }

    // ── Everything else in Murcia: a coverage gap, not a legal "no". ──
    return {
        kind: 'refusal',
        refusal: {
            code: 'no-rule-pack',
            headline:
                `${sector ? `Ámbito ${sector}` : 'This Murcia parcel'} — PRYZM has identified your land ` +
                'and its calificación, but holds no transcribed rule for it, so it will not publish a figure.',
            detail:
                "Murcia's municipal planning service publishes the zone identity, its official " +
                'designation, the land class and the record\'s validity interval — but it publishes no ' +
                'numeric buildable parameter as an attribute: there is no height, buildability, ' +
                'occupation or setback field in the schema. Those numbers live in the Normas ' +
                'Urbanísticas text, which PRYZM has not yet transcribed and human-verified for this ' +
                'calificación. Rather than estimate one, PRYZM shows none. ' +
                MURCIA_ROADMAP_LINE,
            ordinanceRef: null,
            legallyGrounded: false,
            knownFacts,
        },
    };
}
