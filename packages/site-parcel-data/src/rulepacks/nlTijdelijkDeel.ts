// §NL-TIJDELIJK-DEEL (lane ENVELOPE-NLDK, round 4, 2026-09-04) — WHICH API SERVES WHICH HALF, and
// what a half we did NOT read does to the answer.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// THE QUESTION THIS CLOSES
// ══════════════════════════════════════════════════════════════════════════════════════════════
// Founder review §11, marked `not-verified` by the founder himself: *"Is the tijdelijk deel served
// through Ozon/Presenteren, or only through ruimtelijkeplannen.nl? If the DSO serves the consolidated
// regeling including the tijdelijk deel, moves 1 and 2 collapse into one integration."*
//
// ⭐ THE ANSWER IS **SPLIT**, and the full argument with every quote is in
// `docs/04-reference/jurisdictions/nl/NL-DSO-TIJDELIJK-DEEL-VERDICT.md`:
//   · the BRUIDSSCHAT half is a *tijdelijk regelingdeel* under STOP/IMOW and IS served by Ozon
//     (Presenteren v8, `Regeling._links.tijdelijkDelen`);
//   · the OLD BESTEMMINGSPLANNEN half is IMRO/Wro and is served by ruimtelijkeplannen.nl (RP API v4).
//     In the whole Presenteren v8 spec the word `bestemmingsplan` occurs ZERO times.
// ⭐ But the plan still gets cheaper, for a reason the founder's framing did not have: ONE credential
// (both are `x-api-key` APIs of the same ontwikkelaarsportaal) and ONE DISCOVERY CALL —
// `POST /documenten/_zoek` on Omgevingsinformatie Ontsluiten v2 takes a GeoJSON geometry and a date
// and returns OW documents and IMRO documents IN ONE LIST, each carrying the metadata block that says
// which world it belongs to. Only RETRIEVAL is split.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS MODULE IS, AND IS NOT
// ══════════════════════════════════════════════════════════════════════════════════════════════
// It is the ROUTING and HONESTY layer for that shape, written so it can be tested with no key: given
// a discovery record, which content API serves it, and what does an unread half do to the answer.
// It is NOT a transport — nothing here performs I/O (C58 §1.9, PURE).
//
// ⛔ IT INVENTS NO CLASSIFICATION. `Regeling.conditie` — *"De verhouding is tussen dit tijdelijk deel
// en de hoofdregeling"* — is a FREE-TEXT STRING in the DSO's own schema, and no corpus of those
// strings has been read, because every DSO data plane answers 401 without a key. So
// `NL_CONDITIE_PATTERNS` is **deliberately EMPTY**, every entry it may ever hold REQUIRES a citation,
// and `classifyNlConditie` returns `unclassified` for every non-empty string. That is the honest
// state, and `__tests__/nlTijdelijkDeel.test.ts` FAILS the day someone adds a guessed pattern — which
// is the point: a plausible Dutch phrase invented by the author of the classifier is exactly the 10×
// `peil` error in a new costume.
//
// PURE (C58 §1.9) — no I/O, no THREE, no DOM, no RNG, no clock. Deterministic (C58 §1.1).
// Contracts: C58 (zoning data), C63 (completion scoring). Emits the shared `RuleState` vocabulary.

import type { RuleState } from '@pryzm/schemas';
import {
    NL_OVERRIDES_NOT_CHECKED_CAVEAT,
    type NlPrecedenceCheck,
} from './nlRegelingIdentity.js';

// ──────────────────────────────────────────────────────────────────────────────────────────────
// The verified integration shape
// ──────────────────────────────────────────────────────────────────────────────────────────────

/**
 * The three DSO surfaces this shape uses, with the quote that establishes each. Every string is
 * copied out of an OpenAPI document the DSO serves ANONYMOUSLY (HTTP 200) — the data planes are all
 * 401 — so the shape is verifiable without a credential and was verified twice, independently, by
 * lane rounds 3 and 4.
 */
export const NL_DSO_INTEGRATION = Object.freeze({
    discovery: Object.freeze({
        api: 'Omgevingsinformatie ontsluiten API 2.13.1',
        endpoint: 'POST https://service.omgevingswet.overheid.nl/publiek/omgevingsinformatie/api/ontsluiten/v2/documenten/_zoek',
        takes: 'GeoJsonGeometry + geldigOp / beschikbaarOp / inclusiefToekomstigGeldig',
        quote:
            'De Omgevingsinformatie ontsluiten API ontsluit omgevingsinformatie uit meerdere bronnen in samenhang. ' +
            'Bijvoorbeeld om te kunnen zoeken naar zowel omgevingsdocumenten in het kader van de Omgevingswet (OW), ' +
            'als IMRO-documenten (bestemmingsplannen en dergelijke) in het kader van de Wet op de Ruimtelijke Ordening (Wro).',
    }),
    owContent: Object.freeze({
        api: 'Omgevingsdocumenten Presenteren 8.5.2',
        endpoint: 'https://service.omgevingswet.overheid.nl/publiek/omgevingsdocumenten/api/presenteren/v8',
        quote:
            'Regeling._links carries tijdelijkDeelVan, tijdelijkDelen and ontwerpTijdelijkDelen; ' +
            'Regeling.conditie = "De verhouding is tussen dit tijdelijk deel en de hoofdregeling".',
    }),
    imroContent: Object.freeze({
        api: 'Ruimtelijke Plannen API 4.5.2',
        endpoint: 'https://ruimte.omgevingswet.overheid.nl/ruimtelijke-plannen/api/opvragen/v4',
        quote: 'Met deze REST API kunnen bestaande ruimtelijke plannen worden opgevraagd uit Ruimtelijkeplannen.nl.',
    }),
    credential: Object.freeze({
        header: 'x-api-key',
        heldInThisEnvironment: false,
        obtainedBy: 'a free registration a HUMAN must complete at developer.omgevingswet.overheid.nl (ontwikkelaarsportaal)',
        quote:
            'De API-key die je hebt gekregen dient bij elke request naar de API via de `x-api-key` request header ' +
            'meegestuurd te worden.',
    }),
    verifiedBy:
        'lane ENVELOPE-NLDK rounds 3 and 4, from the public OpenAPI documents; NOT from a live query — no key held. ' +
        'Artefacts: docs/04-reference/jurisdictions/nl/findings/nl-phase0/nl-dso-surface-probe.json and ' +
        'nl-tijdelijkdeel-probe.json. Verdict: NL-DSO-TIJDELIJK-DEEL-VERDICT.md',
} as const);

// ──────────────────────────────────────────────────────────────────────────────────────────────
// Discovery → routing
// ──────────────────────────────────────────────────────────────────────────────────────────────

/**
 * The fields of an Ontsluiten v2 `Document` this module needs, named as the API names them.
 *
 * ⚠ Only the two metadata blocks decide the routing, and the DSO's own description of the record is
 * *"Document metadata van een omgevingsdocument of IMR0-document"* — "of", not "en". A record
 * carrying BOTH is outside what the API describes, so it is REFUSED rather than routed by a
 * preference order this lane would have invented.
 */
export interface NlDsoDocumentRecord {
    readonly uriIdentificatie: string;
    readonly titel?: string | null;
    /** `Document.type` verbatim, when supplied. Never the routing key — the metadata blocks are. */
    readonly type?: string | null;
    /** Present ⇒ this is an Omgevingswet document (OW). */
    readonly omgevingsdocumentMetadata?: {
        readonly expressionId?: string | null;
        /** "Tijdelijke regelingdelen die van toepassing zijn op dit omgevingsdocument." */
        readonly gerelateerdeTijdelijkeRegelingdelen?: readonly string[];
        readonly gerelateerdeTijdelijkeOntwerpRegelingdelen?: readonly string[];
        readonly isOntwerp?: boolean;
    } | null;
    /** Present ⇒ this is an IMRO/Wro document (a bestemmingsplan and the like). */
    readonly imroDocumentMetadata?: {
        readonly imroVersie?: string | null;
        /** TAM-IMRO: the escape hatch that CLOSED 2026-01-01 (founder §2). Published per document. */
        readonly isTamPlan?: boolean;
        readonly isHistorisch?: boolean;
        readonly heeftPlankaart?: boolean;
        readonly regelStatus?: string | null;
        readonly eindeRechtsgeldigheid?: string | null;
        readonly verwijderdOp?: string | null;
    } | null;
}

export type NlDocumentHalf = 'ow-omgevingswet' | 'imro-wro' | 'indeterminate';

export interface NlDocumentRoute {
    readonly half: NlDocumentHalf;
    /** The API that serves this document's CONTENT, or null when the half is indeterminate. */
    readonly contentApi: 'presenteren-v8' | 'ruimtelijke-plannen-v4' | null;
    readonly uriIdentificatie: string;
    /** Tijdelijke regelingdelen this OW document declares. Empty for IMRO and for indeterminate. */
    readonly tijdelijkeRegelingdelen: readonly string[];
    /** Draft ones — founder §9.2's free forward view. */
    readonly ontwerpTijdelijkeRegelingdelen: readonly string[];
    /**
     * TRUE only when the document says so. ⚠ `undefined` (the field was not supplied) is NOT `false`:
     * `tamPlanKnown` distinguishes them, because "not a TAM plan" and "we were not told" have
     * different remedies and collapsing them is the §CONTEXT-DATA-HONESTY failure.
     */
    readonly isTamPlan: boolean;
    readonly tamPlanKnown: boolean;
    /** Why the route is what it is — a sentence a human can act on. */
    readonly reason: string;
}

/**
 * Route one discovery record to the API that serves its content. Pure and total.
 *
 * ⛔ REFUSES rather than guesses in the two ambiguous cases: both metadata blocks present, or
 * neither. A guess here silently sends an IMRO plan id to Presenteren (404, looks like "no rules
 * here") or an AKN uri to RP.nl — and "no rules found" is exactly the wrong answer to render as an
 * empty envelope.
 */
export function routeNlDocument(doc: NlDsoDocumentRecord): NlDocumentRoute {
    const ow = doc.omgevingsdocumentMetadata ?? null;
    const imro = doc.imroDocumentMetadata ?? null;
    const base = {
        uriIdentificatie: doc.uriIdentificatie,
        tijdelijkeRegelingdelen: [] as readonly string[],
        ontwerpTijdelijkeRegelingdelen: [] as readonly string[],
        isTamPlan: false,
        tamPlanKnown: false,
    };
    if (ow !== null && imro !== null) {
        return {
            ...base,
            half: 'indeterminate',
            contentApi: null,
            reason:
                'the record carries BOTH omgevingsdocumentMetadata and imroDocumentMetadata; the DSO describes a ' +
                'Document as metadata of "een omgevingsdocument OF een IMRO-document", so this is outside the ' +
                'published contract and is refused rather than routed by an invented preference order',
        };
    }
    if (ow !== null) {
        return {
            ...base,
            half: 'ow-omgevingswet',
            contentApi: 'presenteren-v8',
            tijdelijkeRegelingdelen: [...(ow.gerelateerdeTijdelijkeRegelingdelen ?? [])],
            ontwerpTijdelijkeRegelingdelen: [...(ow.gerelateerdeTijdelijkeOntwerpRegelingdelen ?? [])],
            reason: 'omgevingsdocumentMetadata is present — an Omgevingswet document, served by Presenteren v8',
        };
    }
    if (imro !== null) {
        return {
            ...base,
            half: 'imro-wro',
            contentApi: 'ruimtelijke-plannen-v4',
            isTamPlan: imro.isTamPlan === true,
            tamPlanKnown: typeof imro.isTamPlan === 'boolean',
            reason:
                'imroDocumentMetadata is present — a Wro/IMRO instrument of the tijdelijk deel, served by ' +
                'ruimtelijkeplannen.nl (Ruimtelijke Plannen API v4), NOT by Presenteren',
        };
    }
    return {
        ...base,
        half: 'indeterminate',
        contentApi: null,
        reason:
            'neither metadata block is present; the half cannot be named from this record, and guessing would send ' +
            'the identifier to an API that will answer 404 — which reads downstream as "no rules here"',
    };
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
// ⚠ The aliasing trap
// ──────────────────────────────────────────────────────────────────────────────────────────────

export type NlDocumentAliasing =
    /** The document returned is the one asked for. */
    | 'same-document'
    /** ⛔ A tijdelijk deel was asked for and the HOOFDREGELING came back. Documented DSO behaviour. */
    | 'hoofdregeling-returned-for-tijdelijk-deel'
    /** The returned record does not match and the reason is not the documented one. */
    | 'unexpected-document';

/**
 * ⚠ ASKING FOR A TIJDELIJK DEEL CAN RETURN THE HOOFDREGELING. Ontsluiten v2's own words on
 * `GET /documenten/{uriIdentificatie}`:
 *
 *   *"Indien een `uriIdentificatie` van een tijdelijk deel wordt gebruikt: — als het een tijdelijk
 *   deel is met api_object = 'Regeling', dan bepaalt de `beschikbaarVanaf`-waarde van dat tijdelijke
 *   deel welke versie van de hoofdregeling wordt teruggeleverd. In dit geval is het tijdelijke deel te
 *   vinden in de `gerelateerdeTijdelijkeRegelingdelen`. — als het een tijdelijk deel is met api_object
 *   van 'OntwerpRegeling' of 'Besluitversie', dan wordt het tijdelijke deel als hoofddocument
 *   geretourneerd."*
 *
 * A consumer that assumes "the URI I asked for is the document I got" will attribute the
 * hoofdregeling's rules to the tijdelijk deel, or the reverse. This names the case instead. PURE.
 */
export function checkNlDocumentAliasing(requestedUriIdentificatie: string, returned: NlDsoDocumentRecord): NlDocumentAliasing {
    if (returned.uriIdentificatie === requestedUriIdentificatie) return 'same-document';
    const related = returned.omgevingsdocumentMetadata?.gerelateerdeTijdelijkeRegelingdelen ?? [];
    if (related.includes(requestedUriIdentificatie)) return 'hoofdregeling-returned-for-tijdelijk-deel';
    return 'unexpected-document';
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
// `conditie` — a classification with NO invented classes
// ──────────────────────────────────────────────────────────────────────────────────────────────

export type NlConditieClass =
    /** The field was absent or blank — the DSO said nothing about the relation. */
    | 'absent'
    /** ⛔ Text present, no cited pattern matches. THE ONLY OUTCOME AVAILABLE TODAY. */
    | 'unclassified';

/**
 * A `conditie` pattern MAY only enter this table with a CITATION — the corpus reading, with a date,
 * that observed the phrase. The field exists so a pattern cannot be added by someone who merely
 * finds it plausible.
 */
export interface NlConditiePattern {
    readonly klass: Exclude<NlConditieClass, 'absent' | 'unclassified'>;
    readonly pattern: RegExp;
    /** e.g. "Ozon corpus read 2026-1x-xx, N=… , observed on gm0363 omgevingsplan". NEVER a guess. */
    readonly citation: string;
}

/**
 * ⛔ DELIBERATELY EMPTY, and it must stay empty until a corpus is read WITH A KEY.
 *
 * `Regeling.conditie` is free text in the DSO's own schema. No corpus of those strings has been read
 * — every DSO data plane answered 401 on 2026-09-04 and no `DSO_API_KEY` exists in this environment.
 * Writing plausible Dutch phrases here would produce a classifier that agrees with its author and
 * with nothing else, which is precisely the failure the lane's fixture rule exists to prevent.
 */
export const NL_CONDITIE_PATTERNS: readonly NlConditiePattern[] = Object.freeze([]);

export interface NlConditieClassification {
    readonly klass: NlConditieClass;
    /** The text as given, trimmed — carried so a human reviewer can classify what we could not. */
    readonly verbatim: string | null;
    readonly reason: string;
}

/**
 * Classify a `conditie`. Today this returns `absent` or `unclassified` and NOTHING ELSE, by design.
 *
 * ⚠ `unclassified` MUST NOT be read as "subordinate to the hoofdregeling". The relation is unknown;
 * an unknown relation drawn as "the hoofdregeling wins" is the L-616 shape — an UNKNOWN constraint
 * rendered as a definite one.
 */
export function classifyNlConditie(conditie: string | null | undefined): NlConditieClassification {
    const text = typeof conditie === 'string' ? conditie.trim() : '';
    if (text.length === 0) {
        return { klass: 'absent', verbatim: null, reason: 'the regeling carries no conditie' };
    }
    for (const p of NL_CONDITIE_PATTERNS) {
        if (p.pattern.test(text)) {
            return { klass: p.klass, verbatim: text, reason: `matched a cited pattern: ${p.citation}` };
        }
    }
    return {
        klass: 'unclassified',
        verbatim: text,
        reason:
            'conditie is free text in the DSO schema and no cited pattern table exists yet (no corpus has been read ' +
            '— DSO data planes are key-gated). ⛔ unclassified is NOT "subordinate": the relation is unknown',
    };
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
// What an UNREAD half does to an answer
// ──────────────────────────────────────────────────────────────────────────────────────────────

/** Which halves of the tijdelijk deel were actually read for this location. */
export interface NlTijdelijkDeelRead {
    /** The OW half (bruidsschat + wijzigingsbesluiten) via Presenteren v8. */
    readonly owRead: boolean;
    /** The IMRO half (the old bestemmingsplannen) via RP API v4. */
    readonly imroRead: boolean;
    /** TRUE when a wijzigingsbesluit / voorrangsregel was found AND applied before answering. */
    readonly overrideApplied?: boolean;
}

export interface NlTijdelijkDeelCoverage {
    readonly precedence: NlPrecedenceCheck;
    /** The halves NOT read, named. Empty only when both were. */
    readonly unreadHalves: readonly NlDocumentHalf[];
    readonly caveat: string | null;
}

/**
 * Map "which halves were read" onto the precedence vocabulary every NL answer must carry.
 *
 * ⚠ THE ASYMMETRY IS DELIBERATE. Reading ONE half is not half-checked, it is NOT CHECKED: a
 * voorrangsregel in the OW half can invert a number recovered from the IMRO half and vice versa, so
 * a partial read gives no more assurance than none. Only `owRead && imroRead` may leave
 * `overrides-not-checked`.
 */
export function nlTijdelijkDeelCoverage(read: NlTijdelijkDeelRead): NlTijdelijkDeelCoverage {
    const unread: NlDocumentHalf[] = [];
    if (!read.owRead) unread.push('ow-omgevingswet');
    if (!read.imroRead) unread.push('imro-wro');
    if (unread.length > 0) {
        return {
            precedence: 'overrides-not-checked',
            unreadHalves: unread,
            caveat: `${NL_OVERRIDES_NOT_CHECKED_CAVEAT} (unread: ${unread.join(', ')})`,
        };
    }
    return {
        precedence: read.overrideApplied === true ? 'overrides-checked-applied' : 'overrides-checked-none-apply',
        unreadHalves: [],
        caveat: null,
    };
}

/**
 * The **B1** rule state for the tijdelijk-deel read itself — "which instrument governs, and did we
 * read all of it".
 *
 *   both halves read              → `resolved`, `source-complete`, value = the precedence state
 *   one or neither half read      → `unrecovered` / `inaccessible` / mechanism `present`
 *
 * ⚠ `inaccessible`, not `not-built`: the mechanism exists and is published (§NL_DSO_INTEGRATION); it
 * is a CREDENTIAL that is missing, and the remedy is a human registration, not engineering. Calling
 * it `not-built` would put a free registration on the roadmap as a build.
 */
export function nlTijdelijkDeelToRuleState(read: NlTijdelijkDeelRead, ref: RuleState['ref']): RuleState {
    const cov = nlTijdelijkDeelCoverage(read);
    if (cov.unreadHalves.length === 0) {
        return {
            rule: 'B1',
            status: 'resolved',
            reachability: 'source-complete',
            value: cov.precedence,
            unit: null,
            datum: null,
            provenance: 'pipeline-extracted',
            ref,
        };
    }
    return {
        rule: 'B1',
        status: 'unrecovered',
        // `source-complete`: the sources exist and WOULD answer — see NL_DSO_INTEGRATION. What is
        // missing is a credential, not a dataset, so the ladder rung is not the thing that is short.
        reachability: 'source-complete',
        failure: 'inaccessible',
        mechanism: 'present',
        stoppedAt: `unread half of the tijdelijk deel: ${cov.unreadHalves.join(', ')} (x-api-key required, no DSO_API_KEY held)`,
        ref,
        partial: {
            value: `read: ${read.owRead ? 'OW' : '—'} / ${read.imroRead ? 'IMRO' : '—'}`,
            unit: null,
            verbatim: cov.caveat ?? NL_OVERRIDES_NOT_CHECKED_CAVEAT,
        },
    };
}
