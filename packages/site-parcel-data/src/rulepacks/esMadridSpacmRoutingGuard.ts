// ⭐ THE ROUTING GUARD — the point of this adapter.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// THE PROBLEM, STATED EXACTLY
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// Madrid HAS the parameters and CANNOT SAY WHICH OF 179 CORPORA GOVERNS. Measured on the full
// census (`tools/madrid-spacm-probe/out/06-r-layer.log`, `05-analyse.log`):
//
//   • `DS_FIG_DES` — the instrument's CLASS — is published on **47.16 %** of `VPLA_V_AMBITO` and
//     **60.58 %** of `VPLA_V_AMBITO_MODIF`. On the rest, the corpus names an instrument whose
//     legal regime it does not state.
//   • **30.66 % of `(municipality, name)` keys in `AMBITO_MODIF` are NOT UNIQUE** (619 of 2,019).
//     ⛔ A selector that returns two instruments HAS NOT SELECTED.
//   • The development override ratio is **37.11 % by area region-wide, 48.43 % in the capital**,
//     and **47 municipalities sit at exactly 0 %**.
//   • `AMBITO_MODIF` is not a superset of `AMBITO`: **54.83 % of its keys are absent from
//     `AMBITO`**, so the two layers are different populations and neither is authoritative alone.
//   • There are **235 distinct (municipality, general plan, document type) corpora** across 179
//     municipalities; **34 municipalities carry MORE THAN ONE.**
//
// ⛔ **THIS IS NOT FIXABLE FROM THIS CORPUS, AND THE GUARD DOES NOT TRY.** It refuses, with a named
// reason, wherever routing is ambiguous. Being right about when NOT to draw is the deliverable.
//
// ⚠⚠ THE FAILURE MODE THIS EXISTS TO PREVENT is not a wrong number — it is a RIGHT number applied
// under the WRONG instrument. The `spacm_*` parameters are frequently excellent; a Plan Parcial
// simply supersedes them on the parcel in question. Publishing the base-plan envelope there is a
// confident, well-cited, precisely-wrong answer, and it is indistinguishable from a correct one
// until someone applies for a licence.
//
// PURE. No I/O, no clock. Total, never throws.

// §MADRID-SPACM-PORT (L-681) — ported VERBATIM from `tools/madrid-envelope-engine/routingGuard.ts`.
// The move added OTel spans (P8). No refusal, no vocabulary and no regex changed — a guard that
// drifted in a move would be the one defect nothing downstream could see.

import { trace } from '@opentelemetry/api';
import type { Refusal } from './esMadridSpacmSchema.js';

const _tracer = trace.getTracer('pryzm.zoning');

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 1 · THE ROUTING TOKEN VOCABULARY
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * A Norma-Zonal / base-ordinance code: `4`, `1.3`, `3.1.a`, `8.2.b`, `9.4.a`.
 * Digits and dots, optionally ending in a single lower-case *nivel* letter.
 */
const NORMA_ZONAL_CODE = /^\d+(\.\d+)*(\.[a-z])?$/;

/**
 * Development-instrument prefixes.
 *
 * ⚠⚠ **THIS LIST WAS BUILT FROM THE DATA, NOT FROM THE LITERATURE, AND THE FIRST VERSION WAS
 * WRONG.** It originally carried only the capital's own `AMB_TX_ETI` vocabulary — `APR.16.04`,
 * `UZP.2.01`, `UZPp.03.01-RP`. Running the adapter over the captured periphery showed
 * `routing-token-unrecognised` at **78.98 % in Valdemorillo** and **77.41 % in Moralzarzal**,
 * which sent us to look at the actual values:
 *
 *   MADRID        `API-02.14 PASILLO VERDE FERROVIARIO` · `APE-05.25` · `APR-11.01`  (HYPHEN, not dot)
 *   VALDEMORILLO  `UA CERRO ALARCÓN` · `UA EL PARAÍSO`      — *Unidad de Actuación*
 *   BOADILLA      `AH-31 CORTIJO SUR` · `AU-2 …` · `UE-2 …` · `AD-3 …`
 *   MORALZARZAL   `API-10.S1/2/3-A9 LOS LINARES` **and** `Z24-P1`, `Z18-P3`, `Z15-P9`
 *
 * ⇒ `UA` (Unidad de Actuación), `UE` (Unidad de Ejecución), `AH` (Área Homogénea), `AD`, `AU` are
 * all real development/management instruments and are now recognised.
 *
 * ⛔⛔ **BUT THE PREFIX LIST IS NOT THE AUTHORITY, AND MUST NEVER BE TREATED AS ONE.** Moralzarzal's
 * `Z24-P1` / `Z18-P3` match nothing here and ARE development ámbitos: the `VPLA_V_AMBITO` name join
 * resolves **817 of 817** of them (`ambitoJoin.ts`). An intermediate version of this file asserted
 * the opposite — that they were *"demonstrably NOT development instruments"* because Moralzarzal's
 * measured override ratio is 1.2 % against 99.8 % of rows carrying a name. **That was wrong**: the
 * override ratio is measured **by AREA over urban+urbanizable land**, so many small ámbitos give a
 * high ROW share and a low AREA share simultaneously. Quoting a ratio without its denominator
 * produced a confident, exactly-backwards conclusion (L-656).
 *
 * ⇒ **The vocabulary is MUNICIPAL and there is no regional standard** — 208 distinct `DS_NOM_AMB`
 * values in Moralzarzal alone. The prefix decides how an instrument is DESCRIBED; the REGISTER
 * decides whether one EXISTS, and it is carried by `RoutingFacts.ambitoResolvesInRegister`.
 *
 * ⚠ Anchored and followed by a separator so `APROVECHAMIENTO` cannot match `APR`.
 */
const DEVELOPMENT_PREFIX =
    /^(APR|APE|API|APIR|UZP|UZPp|UZI|UNP|UNC|AOE|SG|PAU|PP|PE|PERI|ED|UA|UE|AH|AD|AU|SUP|SUNP)[.\s_-]/i;

/** What a routing token turned out to be. */
export type RouteClass =
    /** The base general plan orders this land directly. The only class that may proceed. */
    | 'norma-zonal'
    /** ⛔ A development instrument orders it — a per-site plan PRYZM does not hold. */
    | 'development'
    /** ⛔ Not in any recognised vocabulary. UNKNOWN — and it must never fall through to the base plan. */
    | 'unrecognised';

/**
 * Classify a routing token.
 *
 * ⚠⚠ **`unrecognised` MUST NEVER DEGRADE TO `norma-zonal`.** Falling through would silently assert
 * *"no development plan governs here"* — a claim about the world we have not established, and the
 * exact L-526 error. An unreadable token means we do not know what orders the land, and "we do not
 * know" is a valid product state (ADR-0283).
 */
export function classifyRoute(token: string | null | undefined): RouteClass {
    // P8 — emits `pryzm.zoning.madridSpacm.classifyRoute`.
    const span = _tracer.startSpan('pryzm.zoning.madridSpacm.classifyRoute');
    try {
        const cls = classifyRouteImpl(token);
        span.setAttribute('routeClass', cls);
        return cls;
    } finally {
        span.end();
    }
}

function classifyRouteImpl(token: string | null | undefined): RouteClass {
    const v = (token ?? '').trim();
    if (v === '') return 'unrecognised';
    if (DEVELOPMENT_PREFIX.test(v)) return 'development';
    if (NORMA_ZONAL_CODE.test(v)) return 'norma-zonal';
    return 'unrecognised';
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 2 · THE GUARD INPUT
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/** Everything the guard needs. Each field is separately optional; absent ≠ clear. */
export interface RoutingFacts {
    /** `AMB_TX_ETI` (capital) or `DS_NOM_AMB` (regional) — the ámbito this row belongs to. */
    readonly ambitoToken: string | null | undefined;
    /**
     * `DS_FIG_DES` — the instrument's CLASS. ⚠ `null` on 52.84 % of `AMBITO` rows, and a null here
     * is NOT "no instrument": the row names an ámbito whose regime the corpus does not state.
     */
    readonly instrumentFigure: string | null | undefined;
    /**
     * ⭐ **DID THE NAME RESOLVE IN THE ÁMBITO REGISTER?** This — not the prefix — is the authority
     * on whether a development instrument exists. Measured 100 % resolution in four of the five
     * captured municipalities and **86.0 % in Majadahonda** (`ambitoJoin.ts`), including tokens no
     * prefix recognises. The census's region-wide figure is 95.77 % of named rows.
     *
     * ⚠ `false` is AMBIGUOUS BY DESIGN and the caller must not over-read it: it means either
     * *"the name did not resolve"* or *"no join was run"*. The guard therefore never uses `false`
     * to CLEAR a parcel — only a `true` can upgrade an unrecognised token to a named delegation.
     */
    readonly ambitoResolvesInRegister?: boolean;
    /**
     * How many instruments the `(municipality, name)` key resolved to.
     * ⛔ `> 1` is an AMBIGUITY, not a list to pick from. `0` when no join was attempted.
     */
    readonly instrumentKeyMatches: number;
    /** `DS_CLAS_SUE` — the soil classification, for the not-urban-land refusal. */
    readonly soilClass: string | null | undefined;
    /** Does the ordinance designation mark a public system? Decided by `grammar.ts`. */
    readonly isPublicSystem: boolean;
}

/**
 * ⚠⚠ **`NO URBANIZABLE` CONTAINS `URBANIZABLE`, AND THAT ALMOST SHIPPED AS A BUG.**
 *
 * A first cut tested a positive `/urbanizable/` and suppressed the refusal whenever it matched.
 * *«Suelo No Urbanizable Protegido»* matches it, so protected countryside was being cleared as
 * buildable — the direction of error that INVENTS an envelope on land the plan forbids building
 * on. Caught by `routingGuard.test.ts > refuses non-urban soil`, which is why that test asserts
 * BOTH directions on the real `DS_CLAS_SUE` vocabulary rather than only the negative.
 *
 * ⇒ The NEGATIVE is tested first and wins outright. `\bno\s+urbanizable\b` is anchored on a word
 * boundary so it cannot match inside a longer token, and `rústico` / `protegido` are independent.
 *
 * The `DS_CLAS_SUE` vocabulary is the census's own, `05-analyse.log` §2c: 39 distinct values, of
 * which the non-urban families are *Suelo No Urbanizable Protegido* (4,359 km²), *Suelo No
 * Urbanizable Común* (1,183 km²) and *Suelo Rústico* (429 km²) — **the majority of the region**.
 */
const NON_URBAN_SOIL = /\bno\s+urbanizable\b|r[úu]stico|protegid/i;
const URBAN_SOIL = /suelo\s+urbano|\burbanizable\b|apto\s+para\s+urbanizar|reserva\s+urbana/i;

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 3 · THE GUARD
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * Run every routing check and return EVERY refusal that fires.
 *
 * ⚠ **NOT SHORT-CIRCUITED, AND THAT IS DELIBERATE.** A parcel can sit in a development ámbito AND
 * carry an ambiguous key AND be on protected soil. A guard that returns the first reason makes the
 * other two invisible, and a user who resolves the first one then hits a second wall they were
 * never told about. Every reason that is true is reported.
 *
 * Returns `[]` when routing is clean — which is a POSITIVE finding, not the absence of a negative.
 */
export function routingRefusals(facts: RoutingFacts): readonly Refusal[] {
    // P8 — emits `pryzm.zoning.madridSpacm.routingRefusals`. Wraps the untouched port; the guard
    // body below is byte-for-byte the tool's, because a guard that drifts in a move is invisible.
    const span = _tracer.startSpan('pryzm.zoning.madridSpacm.routingRefusals');
    try {
        const out = routingRefusalsImpl(facts);
        span.setAttribute('refusalCount', out.length);
        span.setAttribute('reasons', out.map((r) => r.reason).join(','));
        return out;
    } finally {
        span.end();
    }
}

function routingRefusalsImpl(facts: RoutingFacts): readonly Refusal[] {
    const out: Refusal[] = [];

    // ── LAND CLASS FIRST: these are statements about the LAW, and they are the strongest. ────
    if (facts.isPublicSystem) {
        out.push({
            reason: 'public-system',
            legallyGrounded: true,
            headline: 'The general plan reserves this land for a public system — road, green space, '
                + 'facility or urban service. No private buildable envelope applies here.',
            ordinanceRef: 'Plan General / Normas Subsidiarias — ordinance designation (DS_NOMB_ORD)',
            retryable: false,
        });
    }

    const soil = (facts.soilClass ?? '').trim();
    // ⚠ The NEGATIVE is decisive. `URBAN_SOIL` is consulted only to rescue a classification that
    // is urban AND happens to carry a `protegid*` qualifier — never to override `no urbanizable`.
    if (soil !== '' && NON_URBAN_SOIL.test(soil)
        && !(URBAN_SOIL.test(soil) && !/\bno\s+urbanizable\b|r[úu]stico/i.test(soil))) {
        out.push({
            reason: 'not-urban-land',
            legallyGrounded: true,
            headline: `This land is classified «${soil}». The general plan grants no urban `
                + 'buildability on it, so there is no envelope to compute.',
            ordinanceRef: 'Plan General — clasificación del suelo (DS_CLAS_SUE)',
            retryable: false,
        });
    }

    // ── ROUTING: statements about PRYZM's ability to select, never about the law. ────────────
    const tokenRoute = classifyRoute(facts.ambitoToken);

    // ⭐ THE REGISTER OVERRIDES THE PREFIX. A name that resolves in `VPLA_V_AMBITO` IS a
    // development ámbito however local its code looks — Moralzarzal's `Z24-P1` resolves 817/817.
    // ⚠ Strictly one-directional: a resolution can only ever ADD the delegation, never remove it.
    const route: RouteClass =
        tokenRoute === 'unrecognised' && facts.ambitoResolvesInRegister === true
            ? 'development'
            : tokenRoute;

    if (route === 'development') {
        out.push({
            reason: 'development-ambito-governs',
            legallyGrounded: true,
            headline: `A development instrument «${(facts.ambitoToken ?? '').trim()}» governs this `
                + 'parcel, not the base general plan. That instrument sets its own buildability, '
                + 'and PRYZM does not hold it.',
            // ⚠ `legallyGrounded: true` — this IS a fact about the law: the general plan itself
            // DELEGATES here. It is not a coverage gap, and presenting it as one would understate
            // how well we understand the parcel.
            ordinanceRef: 'Plan General — delegación a planeamiento de desarrollo (ámbito '
                + `${(facts.ambitoToken ?? '').trim()})`,
            retryable: false,
        });
    }

    if (route === 'unrecognised' && (facts.ambitoToken ?? '').trim() !== '') {
        out.push({
            reason: 'routing-token-unrecognised',
            legallyGrounded: false,
            headline: `PRYZM cannot classify the planning reference «${(facts.ambitoToken ?? '').trim()}» `
                + 'on this parcel, so it cannot establish which document governs it.',
            // ⛔ NO FALLBACK TO THE BASE PLAN. Proceeding would assert "no development plan applies",
            // which is precisely the fact we have just said we cannot establish.
            ordinanceRef: null,
            retryable: false,
        });
    }

    // ⚠⚠ **A BLANK `DS_NOM_AMB` IS NOT AN UNPUBLISHED INSTRUMENT CLASS — IT IS NO INSTRUMENT.**
    // A first cut fired this refusal whenever `instrumentFigure` was blank, which meant every
    // ordinary base-plan row (Boadilla publishes `DS_NOM_AMB: null` on almost all of its 1,958)
    // was refused for the class of an instrument that does not exist. That is the OPPOSITE error
    // to the one this guard is for: it refuses land the general plan orders directly. Caught by
    // `routingGuard.test.ts > returns NO refusals when the base plan governs`.
    //
    // ⇒ The refusal fires only when an ámbito is actually NAMED and its class is not published —
    // which is the measured 52.84 % of `VPLA_V_AMBITO` rows.
    const ambitoNamed = (facts.ambitoToken ?? '').trim() !== '';
    const figure = (facts.instrumentFigure ?? '').trim();
    if (ambitoNamed && route !== 'norma-zonal' && figure === '') {
        out.push({
            reason: 'instrument-class-unpublished',
            legallyGrounded: false,
            headline: 'A planning instrument is recorded for this parcel, but the source does not '
                + 'publish what CLASS of instrument it is — so PRYZM cannot know which legal '
                + 'regime applies.',
            ordinanceRef: null,
            retryable: false,
        });
    }

    if (facts.instrumentKeyMatches > 1) {
        out.push({
            reason: 'instrument-key-ambiguous',
            legallyGrounded: false,
            headline: `The planning reference on this parcel matches ${facts.instrumentKeyMatches} `
                + 'different instruments in the regional register. PRYZM will not pick one.',
            // ⛔ A SELECTOR RETURNING TWO INSTRUMENTS HAS NOT SELECTED. Choosing the newest, the
            // largest or the first would be PRYZM legislating. Measured: 30.66 % of AMBITO_MODIF
            // (municipality, name) keys are non-unique.
            ordinanceRef: null,
            retryable: false,
        });
    }

    return out;
}

/**
 * The `missing_constraints` every Madrid envelope carries, whatever else is true.
 *
 * ⚠⚠ **EVERY MADRID ENVELOPE IS AN OPEN TOP WITH A STATED REASON (ADR-0293).** All three of these
 * constrain buildability DOWNWARD, and a solid that ignores a downward constraint OVER-states —
 * L-616's ratified rule that a SOLID must intersect ALL derived constraints, and the exact error
 * Córdoba spent a day un-fabricating.
 *
 * ⭐ **THE AERONAUTICAL ONE IS NOW A LEAD, NOT ONLY A CAVEAT.** The 2026-08-02 municipal sweep
 * found `URBANISMO/SERVIDUMBRES_AERONAUTICAS_FISICAS` and
 * `URBANISMO/SERVIDUMBRES_AERONAUTICAS_DEFENSA` live on `sigma.madrid.es`, each a polygon layer
 * with `Shape.STArea()`. ⚠ Their EXISTENCE is confirmed; their obstacle-surface HEIGHTS are not —
 * the layers publish `FolderPath` (a denomination) and geometry, no elevation attribute. So they
 * can say WHERE a surface applies and not YET how low it sits. That is a genuine step and it is
 * not a closure, and it is listed here as neither.
 */
export const MADRID_MISSING_CONSTRAINTS: readonly string[] = [
    'AESA aeronautical obstacle surfaces (Barajas) — the servidumbres layers are published on '
        + 'sigma.madrid.es (URBANISMO/SERVIDUMBRES_AERONAUTICAS_FISICAS, verified live 2026-08-02) '
        + 'but carry NO elevation attribute, so the surface HEIGHT that would cap this envelope is '
        + 'not held. Constrains DOWNWARD.',
    'Heritage — catálogos de edificios protegidos, BIC/BRL and protection special plans. '
        + 'Published as geometry (PGOUM97/PG_EDIFICIOS_PROTEGIDOS, DESARROLLO_URBANO_ACTUALIZADO/BIC) '
        + 'and not yet intersected by this adapter. Constrains DOWNWARD.',
    'Flood — zonas inundables / dominio público hidráulico (CHT). Not held. Constrains DOWNWARD.',
];
