// §NL-REGELING-IDENTITY (lane ENVELOPE-NLDK, 2026-09-04) — "as at the tijdelijk deel, overrides
// not checked", as a VALUE rather than a sentence. Founder review §1, §9.1, §11.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// THE REFRAME THIS MODULE ENCODES
// ══════════════════════════════════════════════════════════════════════════════════════════════
// Since 2024-01-01 every gemeente's omgevingsplan is a TIJDELIJK DEEL (the old bestemmingsplannen
// plus the bruidsschat) that can only lapse AS A WHOLE, transition to 2032-01-01. So the ONLY legal
// way to change anything in it is to adopt VOORRANGSREGELS, published as wijzigingsbesluiten via the
// LVBB — and the regeling is the PRODUCT of the tijdelijk deel and ALL successive wijzigingsbesluiten.
//
// PRYZM reads the tijdelijk deel (ruimtelijkeplannen.nl, keyless). The overrides live in the
// wijzigingsbesluiten (DSO / Ozon, key-gated: Presenteren v8 → HTTP 401 "Inloggegevens ontbreken",
// re-probed 2026-09-04). ⛔ That is a CORRECTNESS RISK on every parcel we answer CONFIDENTLY, and it
// grows to 2032. Until precedence is built, the honest state of every recovered NL parameter is
// "as at the tijdelijk deel, overrides not checked" — and this module makes that state travel WITH
// the answer, so no consumer can drop it.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// THE `not-verified` QUESTION, ANSWERED — AND REFINED BY AN INDEPENDENT SOURCE (founder §11)
// ══════════════════════════════════════════════════════════════════════════════════════════════
// "Is the tijdelijk deel served through Ozon/Presenteren, or only through ruimtelijkeplannen.nl?"
// ROUND TWO (documentation read, IPLO 2026-09-04): *"Regels op de kaart toont ook geldige documenten
// die via ruimtelijkeplannen.nl gepubliceerd zijn"* ⇒ "not served through Ozon".
// ROUND THREE (the same day, from a SECOND SYSTEM — the DSO's own public OpenAPI documents, which
// need no key even though the data paths do): that verdict was right for the IMRO half and WRONG
// for the bruidsschat half. The tijdelijk deel is SPLIT:
//   · the bruidsschat IS an Ozon object — Presenteren v8 models a `Regeling` with `tijdelijkDelen` /
//     `tijdelijkDeelVan` / `ontwerpTijdelijkDelen` links and a `conditie` ("de verhouding … tussen dit
//     tijdelijk deel en de hoofdregeling"); Ontsluiten v2 returns it under
//     `gerelateerdeTijdelijkeRegelingdelen`;
//   · the bestemmingsplannen are NOT — Presenteren mentions IMRO exactly twice, both as
//     `Omgevingsvergunning.iMROPlanidentificatie` ("het IMRO-plan-ID waar deze vergunning bij hoort"),
//     a FOREIGN KEY; the register says the Ruimtelijke Plannen API "kunnen bestaande ruimtelijke plannen
//     worden opgevraagd uit Ruimtelijkeplannen.nl".
// ⛔ So moves 1 and 2 do NOT collapse into one API — but they DO collapse into ONE credential (both
// are x-api-key APIs of the same ontwikkelaarsportaal) and ONE discovery call: Ontsluiten v2
// `POST /documenten/_zoek` takes a `geometrie` and returns OW documents AND IMRO documents together.
// Precedence still needs both sources, and the join key between them is the LOCATION, not a
// document id. (`NL_TIJDELIJK_DEEL_SERVING` below carries the refined verdict with its citations;
// the raw readings are in `findings/nl-phase0/nl-dso-surface-probe.json`.)
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// B1 IS ONE REGELING PER GEMEENTE, NOT N PLANS (founder §9.1)
// ══════════════════════════════════════════════════════════════════════════════════════════════
// The citable, versionable object is the AKN identifier of the gemeente's omgevingsplan regeling
// (`/akn/nl/act/gm0363/2024/omgevingsplan/nld@2024-01-01;1`), not a ruimtelijkeplannen plan id.
// ⚠ The AKN grammar below is transcribed from the founder's example and the STOP identifier
// convention as this lane knows it; the STOP schema page could not be fetched (koop.gitlab.io →
// 404 on the guessed path, 2026-09-04) so it is `not-re-verified`. The parser is permissive on the
// middle segments for that reason and strict only on the frame.
//
// PURE (C58 §1.9). Deterministic. Emits the shared `RuleState` vocabulary against **B1**.

import type { RuleState } from '@pryzm/schemas';

// ──────────────────────────────────────────────────────────────────────────────────────────────
// The documented answer to the not-verified question
// ──────────────────────────────────────────────────────────────────────────────────────────────

export const NL_TIJDELIJK_DEEL_SERVING = Object.freeze({
    question: 'Is the tijdelijk deel of the omgevingsplan served through Ozon / the Presenteren API?',
    verdict: 'split-bruidsschat-in-ozon-imro-on-ruimtelijkeplannen',
    roundTwoVerdict:
        'not-served-through-ozon (documentation read, 2026-09-04) — right for the IMRO half, wrong for the ' +
        'bruidsschat half; refined the same day from the public OpenAPI documents below',
    consequence:
        'moves 1 (DSO key) and 2 (voorrangsregels) do NOT collapse into one API: the bestemmingsplannen of the ' +
        'tijdelijk deel are served by ruimtelijkeplannen.nl / the Ruimtelijke Plannen API v4 ' +
        '(ruimte.omgevingswet.overheid.nl); the bruidsschat (a tijdelijk regelingdeel) and every wijzigingsbesluit ' +
        'by Ozon (Presenteren v8). But they DO collapse into ONE credential — both are x-api-key APIs of the same ' +
        'ontwikkelaarsportaal — and ONE discovery call: Omgevingsinformatie Ontsluiten v2 POST /documenten/_zoek ' +
        'takes a geometrie and returns OW documents and IMRO documents together. Precedence needs both sources, ' +
        'joined on location.',
    evidence: [
        'iplo.nl/digitaal-stelsel/omgevingsloket/regels-kaart/ (read 2026-09-04): "Regels op de kaart ' +
            'toont ook geldige documenten die via ruimtelijkeplannen.nl gepubliceerd zijn. De ruimtelijke ' +
            'plannen komen automatisch beschikbaar vanuit ruimtelijkeplannen.nl."',
        'iplo.nl/regelgeving/instrumenten/omgevingsplan/tijdelijk-deel-omgevingsplan/ (read 2026-09-04): ' +
            'Wro instruments appear in Regels op de kaart as "apart document"; "Gemeenten hebben tot eind ' +
            '2031 de tijd om de inhoud van het tijdelijke deel … om te zetten".',
        'Presenteren v8 /openapi.json (PUBLIC, HTTP 200, 273 kB, "Omgevingsdocumenten Presenteren" 8.5.2, read ' +
            '2026-09-04): Regeling._links carries `tijdelijkDeelVan`, `tijdelijkDelen`, `ontwerpTijdelijkDelen`; ' +
            'Regeling.conditie = "De verhouding is tussen dit tijdelijk deel en de hoofdregeling"; ' +
            'getRegelingVoorkomens links "tijdelijke regelingdelen" — the DSO MODELS the tijdelijk regelingdeel. ' +
            '"IMRO" occurs twice, both as Omgevingsvergunning.iMROPlanidentificatie ("het IMRO-plan-ID waar deze ' +
            'vergunning bij hoort/van afwijkt") — a foreign key, not served content; "bestemmingsplan" and ' +
            '"ruimtelijke" occur zero times.',
        'API register api/rp-opvragen/ (read 2026-09-04): "Met deze REST API kunnen bestaande ruimtelijke plannen ' +
            'worden opgevraagd uit Ruimtelijkeplannen.nl." Ruimtelijke Plannen API 4.5.2 /openapi.json (PUBLIC, ' +
            '181 kB): X-Api-Key; /plannen/{planId}/bouwvlakken, /maatvoeringen, /teksten, /artikelen/_zoek; ' +
            'anonymous /plannen → HTTP 401.',
        'Omgevingsinformatie ontsluiten API 2.13.1 /openapi.json (PUBLIC, 57 kB): "zoeken naar zowel ' +
            'omgevingsdocumenten in het kader van de Omgevingswet (OW), als IMRO-documenten (bestemmingsplannen en ' +
            'dergelijke) in het kader van de Wet op de Ruimtelijke Ordening (Wro)"; getDocument: "als het een ' +
            'tijdelijk deel is met api_object = Regeling … te vinden in de gerelateerdeTijdelijkeRegelingdelen"; ' +
            'document attributes imroVersie, isTamPlan, heeftPlankaart; anonymous /app-info → HTTP 401.',
        'Presenteren v8 anonymous probe 2026-09-04: /app-info HTTP 401 {"title":"Inloggegevens ontbreken"} — the ' +
            'data plane is key-gated; the key is freely requestable via the ontwikkelaarsportaal.',
    ],
    verifiedBy:
        'lane ENVELOPE-NLDK round 3 — three public OpenAPI documents + the API register, independent of the IPLO ' +
        'prose read in round 2; not a live Ozon query (no key held). Artefact: ' +
        'docs/04-reference/jurisdictions/nl/findings/nl-phase0/nl-dso-surface-probe.json',
} as const);

// ──────────────────────────────────────────────────────────────────────────────────────────────
// AKN identifiers
// ──────────────────────────────────────────────────────────────────────────────────────────────

export interface NlAknIdentifier {
    /** The Work: `/akn/nl/act/<bevoegdgezag>/<jaar>/<naam>`. */
    readonly work: string;
    /** The Expression: work + `/<taal>@<datum>;<versie>`, or null when only a Work was given. */
    readonly expression: string | null;
    /** `gm0363`, `pv27`, `ws0651`, `mnre1034` … verbatim. */
    readonly bevoegdGezag: string;
    /** The four-digit gemeente code when `bevoegdGezag` is a gemeente (`gm####`), else null. */
    readonly gemeenteCode: string | null;
    readonly jaar: string;
    readonly naam: string;
    readonly taal: string | null;
    /** ISO date of the consolidated expression, or null. */
    readonly consolidatedAt: string | null;
    readonly versie: string | null;
}

const AKN_RE =
    /^\/akn\/nl\/act\/((gm)(\d{4})|pv\d{2}|ws\d{3,4}|mn(?:re)?\d*|[a-z]{2,4}\d*)\/(\d{4})\/([A-Za-z0-9_.-]+)(?:\/([a-z]{3})@(\d{4}-\d{2}-\d{2});(\d+))?$/;

/** Parse an AKN work or expression identifier. Null when the frame does not match. Pure. */
export function parseNlAknIdentifier(id: string | null | undefined): NlAknIdentifier | null {
    if (typeof id !== 'string') return null;
    const m = AKN_RE.exec(id.trim());
    if (!m) return null;
    const bevoegdGezag = m[1]!;
    const gemeenteCode = m[2] === 'gm' ? m[3]! : null;
    const jaar = m[4]!;
    const naam = m[5]!;
    const work = `/akn/nl/act/${bevoegdGezag}/${jaar}/${naam}`;
    const hasExpr = m[6] !== undefined;
    return {
        work,
        expression: hasExpr ? `${work}/${m[6]}@${m[7]};${m[8]}` : null,
        bevoegdGezag,
        gemeenteCode,
        jaar,
        naam,
        taal: hasExpr ? m[6]! : null,
        consolidatedAt: hasExpr ? m[7]! : null,
        versie: hasExpr ? m[8]! : null,
    };
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
// Precedence state — the field every NL answer must carry
// ──────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Whether the wijzigingsbesluiten (voorrangsregels) that may override the tijdelijk deel at this
 * location were consulted. THREE states, never a boolean: "not checked" and "checked, none apply"
 * are different facts with different remedies, and collapsing them is how a correctness risk gets
 * reported as a clean answer.
 */
export type NlPrecedenceCheck =
    /** ⛔ the honest state of every NL answer today. The answer is AT RISK, not wrong. */
    | 'overrides-not-checked'
    /** the LVBB wijzigingsbesluiten for this gemeente were read and none touches this location/rule. */
    | 'overrides-checked-none-apply'
    /** a wijzigingsbesluit applies and its voorrangsregel was applied BEFORE answering. */
    | 'overrides-checked-applied';

export const NL_OVERRIDES_NOT_CHECKED_CAVEAT =
    'as at the tijdelijk deel, overrides not checked — a wijzigingsbesluit adopted via the LVBB since ' +
    '2024-01-01 may take precedence over this rule; the DSO/Ozon layer that carries such besluiten was ' +
    'not read (key-gated, HTTP 401 2026-09-04)';

export interface NlRegelingRef {
    /** Which layer the value was read from. */
    readonly readFrom: 'ruimtelijkeplannen-tijdelijk-deel' | 'dso-lvbb-omgevingsplan';
    /** The ruimtelijkeplannen plan id (`NL.IMRO.…`) the value came from, when it did. */
    readonly planId: string | null;
    /** The gemeente's omgevingsplan REGELING identity, when known. The citable object (founder §9.1). */
    readonly akn: NlAknIdentifier | null;
    readonly precedence: NlPrecedenceCheck;
    /** AKN expression ids of the wijzigingsbesluiten consulted (empty when not checked). */
    readonly wijzigingsbesluitenConsulted: readonly string[];
}

/** A `RuleState` that cannot be separated from its precedence state. */
export interface NlRuleStateWithPrecedence {
    readonly state: RuleState;
    readonly regeling: NlRegelingRef;
    /** TRUE when a legally-grounded answer was given and the overrides were NOT checked. */
    readonly correctnessRisk: boolean;
    readonly caveat: string | null;
}

/**
 * Stamp a rule state with its precedence context. Pure.
 *
 * `correctnessRisk` is TRUE for every arm that is a statement about the LAW (`resolved`,
 * `qualitative`, `alternative`, `refused`) when overrides were not checked — because those are the
 * answers a wijzigingsbesluit can silently invert. `unrecovered` is about us and carries no risk of
 * that kind (it already says "we do not know").
 */
export function stampNlPrecedence(state: RuleState, regeling: NlRegelingRef): NlRuleStateWithPrecedence {
    const notChecked = regeling.precedence === 'overrides-not-checked';
    const legallyGrounded = state.status !== 'unrecovered';
    return {
        state,
        regeling,
        correctnessRisk: notChecked && legallyGrounded,
        caveat: notChecked ? NL_OVERRIDES_NOT_CHECKED_CAVEAT : null,
    };
}

/** Count the at-risk answers in a set — the founder's "correctness risk on parcels we answer confidently". */
export function nlPrecedenceRiskCount(items: readonly NlRuleStateWithPrecedence[]): number {
    return items.reduce((n, i) => n + (i.correctnessRisk ? 1 : 0), 0);
}

/**
 * The **B1** (governing instrument + version + in-force date) rule state for a regeling ref.
 *
 *   akn known AND precedence checked   → `resolved` (value = expression ?? work), `source-complete`
 *   akn known, overrides not checked   → `unrecovered` / `semantic` / mechanism `present`:
 *                                        the instrument is identified, its CURRENT version is not
 *   only a ruimtelijkeplannen plan id  → `unrecovered` / `semantic` / mechanism `present`:
 *                                        we cite a component of the regeling, not the regeling
 *   nothing                            → `unrecovered` / `missing-source` / mechanism `unknown`
 *
 * ⚠ B1 is deliberately NOT `resolved` on a plan id alone. "Which instrument governs" is not settled
 * until "which version of the regeling, with which overrides" is — that is the founder's §9.1 point.
 */
export function nlRegelingToRuleState(regeling: NlRegelingRef, ref: RuleState['ref']): RuleState {
    const checked = regeling.precedence !== 'overrides-not-checked';
    if (regeling.akn !== null && checked) {
        return {
            rule: 'B1',
            status: 'resolved',
            reachability: 'source-complete',
            value: regeling.akn.expression ?? regeling.akn.work,
            unit: null,
            datum: null,
            provenance: 'pipeline-extracted',
            ref,
        };
    }
    if (regeling.akn !== null) {
        return {
            rule: 'B1',
            status: 'unrecovered',
            partial: null,
            reachability: 'source-complete',
            failure: 'semantic',
            mechanism: 'present',
            stoppedAt:
                `regeling ${regeling.akn.work} identified; its CURRENT expression (tijdelijk deel + all ` +
                'wijzigingsbesluiten) not established — overrides not checked',
            ref,
        };
    }
    if (regeling.planId !== null) {
        return {
            rule: 'B1',
            status: 'unrecovered',
            partial: null,
            reachability: 'source-complete',
            failure: 'semantic',
            mechanism: 'present',
            stoppedAt:
                `only the tijdelijk-deel component ${regeling.planId} is cited; the gemeente's omgevingsplan ` +
                'regeling (AKN work + expression) and its wijzigingsbesluiten were not read',
            ref,
        };
    }
    return {
        rule: 'B1',
        status: 'unrecovered',
        partial: null,
        reachability: 'source-complete',
        failure: 'missing-source',
        mechanism: 'unknown',
        stoppedAt: 'no governing instrument identified at this location',
        ref,
    };
}
