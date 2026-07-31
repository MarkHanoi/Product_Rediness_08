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

import type { EnvelopeRefusal } from '@pryzm/schemas';
import { MURCIA_ROADMAP_LINE, type DerivedPlanMarker } from '../rulepacks/esMurciaEnvelope.js';

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
    | { readonly kind: 'unresolved'; readonly reason: string };

/**
 * THE DISPOSITION. Given the live attributes at a point, decide what PRYZM may say.
 *
 * ⚠ THERE IS DELIBERATELY NO `'envelope'` BRANCH. Murcia publishes zone IDENTITY, official
 * DESIGNATION, land CLASS and temporal validity — and publishes **no numeric buildable
 * parameter** as an attribute (no altura, no edificabilidad, no ocupación, no retranqueo;
 * verified against the WFS `DescribeFeatureType` schemas, not merely against one response).
 * Adding an envelope branch would require inventing those numbers. When a signed
 * transcription of a specific instrument exists, it belongs in a rule pack behind the
 * `MURCIA_ENVELOPE_VERIFIED` gate — never here.
 *
 * @param asOf ISO date used for the validity test. Injected; this module has no clock.
 */
export function murciaEnvelopeDisposition(
    calificacion: MurciaCalificacionFeature | null,
    sectorFeature: MurciaSectorFeature | null,
    asOf: string,
    derivedPlans: readonly DerivedPlanMarker[] = [],
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
