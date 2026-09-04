// §NL-TOEPASBARE-REGELS-CROSSCHECK (lane ENVELOPE-NLDK, round 3, 2026-09-04) — the DSO's executable
// rules as a SECOND representation to check ours against. Deep audit §6 and §11:
//
//     OUR RULE ENGINE  ↔  DSO TOEPASBARE REGEL  ↔  LEGAL SOURCE      — disagree → REVIEW
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// WHAT WAS PROBED (nl-dso-surface-probe.json, 2026-09-04; no DSO key held)
// ══════════════════════════════════════════════════════════════════════════════════════════════
// The Toepasbare Regels stack is FIVE APIs in the register (developer.omgevingswet.overheid.nl/
// api-register/, read 2026-09-04), all x-api-key gated. Every base URL below is the register's, not a
// guess; the guesses this lane made first (…/uitvoeren/v3, …/catalogus/api/raadplegen/v1) 404'd and
// are recorded as rejected in the probe file. Anonymous readings, verbatim:
//   · Uitvoeren services v3       /publiek/toepasbare-regels/api/toepasbareregelsuitvoerenservices/v3
//                                 /app-info → 401 · its OpenAPI is public on the portal (59 kB).
//   · Toepasbaar opvragen v7      /publiek/omgevingsdocumenten/api/toepasbaaropvragen/v7
//                                 /app-info → 401 · /openapi.json → 200 (62 kB).
//   · RTR raadplegen v2           /publiek/toepasbare-regels/api/rtrgegevens/v2 — /app-info → 404
//                                 (the base is right per the register; that path is not served there).
//   · Toepasbare regels zoeken v2 /publiek/toepasbare-regels/api/zoekinterface/v2 — /app-info → 404.
//   · Catalogus opvragen v3       /publiek/catalogus/api/opvragen/v3 — /app-info → 401 · /openapi.json → 200.
//
// THE CONCLUSION VOCABULARY IS THE DSO'S, VERBATIM. `ConclusieToestemming.code` in the Uitvoeren v3
// spec enumerates SEVEN codes; they are transcribed below unchanged so a DSO answer and our verdict are
// compared in one vocabulary, not through a translation table. The flow the spec describes:
// activiteit (RTR urn) + locatie → POST /conclusie/_bepaal → `vragen` (uitvoeringsregelType: vraag ·
// registerbevraging · geoVerwijzing · uitkomstHerbruikbareBeslissing) → ConclusieToestemming.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// WHAT THE CROSS-CHECK IS — AND IS NOT
// ══════════════════════════════════════════════════════════════════════════════════════════════
// It is a VERIFICATION EVENT over two independently produced verdicts. It never adopts the DSO's
// conclusion as ours (that would make the check circular), never treats a conclusion reached with
// unanswered vragen as final (the vergunningcheck is a question tree; a conclusion with open questions
// is provisional), and never turns `NeemContactOpMet` into a yes or a no. Disagreement is a REVIEW
// trigger, not a defect count: both engines can be wrong, and the legal source is the referee.
//
// PURE (C58 §1.9). Deterministic. No I/O — the DSO call belongs to the adapter; this module consumes
// the transcribed conclusion.

import type { NlVergunningvrijOpaOutcome } from './nlVergunningvrij.js';

// ──────────────────────────────────────────────────────────────────────────────────────────────
// The probed surface — a documented fact, with its readings
// ──────────────────────────────────────────────────────────────────────────────────────────────

export const NL_TOEPASBARE_REGELS_SURFACE = Object.freeze({
    probedAt: '2026-09-04',
    apiKeyHeld: false,
    register: 'https://developer.omgevingswet.overheid.nl/api-register/',
    keyRequestForm: 'https://developer.omgevingswet.overheid.nl/formulieren/api-key-aanvragen-0/',
    apis: [
        {
            id: 'uitvoeren-services-v3',
            base: 'https://service.omgevingswet.overheid.nl/publiek/toepasbare-regels/api/toepasbareregelsuitvoerenservices/v3',
            anonymousAppInfo: 401,
            spec: 'https://developer.omgevingswet.overheid.nl/publish/pages/171046/toepasbareregels-uitvoerenservices-v3.json (public)',
            role: 'activiteit + locatie → vragen → ConclusieToestemming (the cross-check oracle)',
        },
        {
            id: 'toepasbaar-opvragen-v7',
            base: 'https://service.omgevingswet.overheid.nl/publiek/omgevingsdocumenten/api/toepasbaaropvragen/v7',
            anonymousAppInfo: 401,
            spec: '<base>/openapi.json (public, 200)',
            role: 'activiteiten and locaties for applicability (Gap 1); /locaties/_zoek with spatialOperator intersects|within',
        },
        {
            id: 'rtr-raadplegen-v2',
            base: 'https://service.omgevingswet.overheid.nl/publiek/toepasbare-regels/api/rtrgegevens/v2',
            anonymousAppInfo: 404,
            spec: 'https://developer.omgevingswet.overheid.nl/publish/pages/167490/toepasbareregels-crud-rtr-gegevens-v2.json',
            role: 'the activity taxonomy (urn) the Uitvoeren call is keyed on',
        },
        {
            id: 'toepasbare-regels-zoeken-v2',
            base: 'https://service.omgevingswet.overheid.nl/publiek/toepasbare-regels/api/zoekinterface/v2',
            anonymousAppInfo: 404,
            spec: 'https://developer.omgevingswet.overheid.nl/publish/pages/235013/toepasbareregels-zoekinterface-v2.json',
            role: 'free-text activity search → functionele structuur references',
        },
        {
            id: 'catalogus-opvragen-v3',
            base: 'https://service.omgevingswet.overheid.nl/publiek/catalogus/api/opvragen/v3',
            anonymousAppInfo: 401,
            spec: '<base>/openapi.json (public, 200; security "Apikey")',
            role: 'begrippen / concepten / waardelijsten — the national definitions (founder §3)',
        },
    ],
    flow: 'RTR activiteit-urn + locatie (geometrie or locatieIdentificatie) → POST /conclusie/_bepaal → vragen → ConclusieToestemming.code',
} as const);

/** `ConclusieToestemming.code` — the Uitvoeren v3 spec's enum, VERBATIM (7 members). */
export const DSO_CONCLUSIE_CODES = Object.freeze([
    'NietVanToepassing',
    'Verbod',
    'Vergunningplicht',
    'Meldingsplicht',
    'Informatieplicht',
    'Toestemmingsvrij',
    'NeemContactOpMet',
] as const);
export type DsoConclusieCode = (typeof DSO_CONCLUSIE_CODES)[number];

// ──────────────────────────────────────────────────────────────────────────────────────────────
// Our side
// ──────────────────────────────────────────────────────────────────────────────────────────────

/** PRYZM's permit verdict for ONE activity at ONE location, in our own closed vocabulary. */
export type NlOurPermitVerdict =
    | 'vergunningvrij'
    | 'vergunningplichtig'
    | 'meldingsplichtig'
    | 'informatieplichtig'
    | 'verboden'
    | 'not-applicable'
    /** we did not reach a verdict — there is nothing to cross-check. */
    | 'undetermined';

/**
 * Lift the round-two vergunningvrij OPA outcome into a permit verdict. The mapping is deliberately
 * conservative: an exclusion by heritage makes the OPA vergunningPLICHTIG (the national floor no
 * longer applies), and every "we do not know yet" arm is `undetermined`, never a guess.
 */
export function nlVergunningvrijOutcomeToVerdict(o: NlVergunningvrijOpaOutcome): NlOurPermitVerdict {
    switch (o.kind) {
        case 'national-floor-applies':
            return 'vergunningvrij';
        case 'excluded-by-heritage':
            return 'vergunningplichtig';
        case 'heritage-status-unknown':
        case 'municipal-determination-required':
            return 'undetermined';
        case 'municipal-overlay-read':
            switch (o.verdict) {
                case 'national-list-adopted':
                case 'extended':
                    return 'vergunningvrij';
                case 'replaced-by-melding':
                    return 'meldingsplichtig';
                case 'not-vergunningvrij':
                    return 'vergunningplichtig';
                case 'unclear':
                    return 'undetermined';
            }
    }
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
// The DSO side, as transcribed by the adapter
// ──────────────────────────────────────────────────────────────────────────────────────────────

export type NlDsoConclusie =
    | {
          readonly kind: 'conclusie';
          readonly code: DsoConclusieCode;
          /** The RTR activity urn the check was run for. */
          readonly activiteitUrn: string | null;
          /** Vragen the check still had OPEN when this code was read. > 0 ⇒ provisional. */
          readonly openVragen: number;
          /** Regeling/artikel references the DSO returned with the conclusion, verbatim. */
          readonly regelRefs: readonly string[];
      }
    | {
          readonly kind: 'unavailable';
          /** `OntbrekendeData` in the spec: toepasbareRegels | regelbeheerobject; plus our own two. */
          readonly reason: 'no-api-key' | 'api-error' | 'toepasbareRegels-missing' | 'regelbeheerobject-missing';
          readonly detail: string | null;
      };

// ──────────────────────────────────────────────────────────────────────────────────────────────
// The cross-check
// ──────────────────────────────────────────────────────────────────────────────────────────────

export type NlCrossCheckVerdict =
    /** both engines say the same thing. Corroboration, not proof. */
    | 'agree'
    /** they differ — REVIEW against the legal source. Neither is adopted. */
    | 'disagree-review'
    /** we have no verdict to check (ours is `undetermined`). */
    | 'not-comparable'
    /** the DSO could not answer (key, error, no toepasbare regels for the activity). */
    | 'dso-unavailable'
    /** the DSO answered `NeemContactOpMet`, or with open vragen — provisional, not a verdict. */
    | 'dso-inconclusive';

export interface NlCrossCheckResult {
    readonly verdict: NlCrossCheckVerdict;
    readonly ours: NlOurPermitVerdict;
    readonly dsoCode: DsoConclusieCode | null;
    /** Our verdict expressed in the DSO's vocabulary, so the comparison is auditable. */
    readonly oursAsDso: DsoConclusieCode | null;
    readonly why: string;
}

/** Our vocabulary → the DSO's. Total on the comparable members; null for `undetermined`. */
export function nlVerdictToDsoCode(v: NlOurPermitVerdict): DsoConclusieCode | null {
    switch (v) {
        case 'vergunningvrij':
            return 'Toestemmingsvrij';
        case 'vergunningplichtig':
            return 'Vergunningplicht';
        case 'meldingsplichtig':
            return 'Meldingsplicht';
        case 'informatieplichtig':
            return 'Informatieplicht';
        case 'verboden':
            return 'Verbod';
        case 'not-applicable':
            return 'NietVanToepassing';
        case 'undetermined':
            return null;
    }
}

/** Cross-check our permit verdict against the DSO's conclusion. Pure and total. */
export function crossCheckNlPermitVerdict(ours: NlOurPermitVerdict, dso: NlDsoConclusie): NlCrossCheckResult {
    const oursAsDso = nlVerdictToDsoCode(ours);
    if (dso.kind === 'unavailable') {
        return {
            verdict: 'dso-unavailable',
            ours,
            dsoCode: null,
            oursAsDso,
            why:
                `the DSO Toepasbare Regels conclusion is unavailable (${dso.reason}${dso.detail ? ': ' + dso.detail : ''}); ` +
                'our verdict stands UNCHECKED — this is a statement about the check, not about the verdict.',
        };
    }
    if (oursAsDso === null) {
        return {
            verdict: 'not-comparable',
            ours,
            dsoCode: dso.code,
            oursAsDso,
            why: `PRYZM reached no verdict (undetermined); the DSO says ${dso.code}. Nothing to compare — the DSO answer is NOT adopted as ours.`,
        };
    }
    if (dso.code === 'NeemContactOpMet' || dso.openVragen > 0) {
        return {
            verdict: 'dso-inconclusive',
            ours,
            dsoCode: dso.code,
            oursAsDso,
            why:
                dso.code === 'NeemContactOpMet'
                    ? 'the DSO conclusion is "neem contact op met het bevoegd gezag" — a referral, not a yes or a no; our verdict stands unchecked.'
                    : `the DSO conclusion ${dso.code} was read with ${dso.openVragen} vraag/vragen still open; the vergunningcheck is a question tree and a conclusion with open questions is provisional.`,
        };
    }
    if (dso.code === oursAsDso) {
        return {
            verdict: 'agree',
            ours,
            dsoCode: dso.code,
            oursAsDso,
            why:
                `PRYZM (${ours} → ${oursAsDso}) and the DSO toepasbare regel (${dso.code}` +
                (dso.activiteitUrn ? `, ${dso.activiteitUrn}` : '') +
                ') agree. Corroboration by an independent executable representation — not proof; the legal source remains the referee.',
        };
    }
    return {
        verdict: 'disagree-review',
        ours,
        dsoCode: dso.code,
        oursAsDso,
        why:
            `PRYZM says ${ours} (${oursAsDso}); the DSO toepasbare regel says ${dso.code}` +
            (dso.regelRefs.length > 0 ? ` citing ${dso.regelRefs.join('; ')}` : '') +
            '. REVIEW against the legal source. Neither verdict is adopted from the other.',
    };
}
