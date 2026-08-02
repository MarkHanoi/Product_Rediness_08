// §ENVELOPE-PUBLICATION-AUTHORISATION (L-665) — the ONE machine-readable statement of
// "may PRYZM publish a buildable envelope for this jurisdiction yet?"
//
// WHAT THIS IS, AND WHY IT IS NOT THE REGISTRY
// --------------------------------------------
// Two different questions were being answered by ONE table, and only one of them was ever asked:
//
//   • `registry.ts` `REGISTRATIONS` answers **ROUTING** — which pack, refusal vocabulary and
//     extent apply to a (jurisdiction, zone) pair. Registering a pack is a WIRING act.
//   • This module answers **AUTHORISATION** — whether a human has signed the transcription those
//     packs encode. Signing is a LEGAL act, and it is deliberately NOT a code change (each
//     `*_ENVELOPE_VERIFIED` constant lives beside the pack it governs, and flipping it is the
//     signature event recorded in that city's `sources/VERIFICATION.md`).
//
// "Registration wires routing; it does not authorise output" is written into three cities'
// `VERIFICATION.md` files. Until now it was true only of the L5 DISPATCHER, which checks the gate
// before it computes anything. Every OTHER consumer of the registry — starting with the
// answerability classifier — read `packsByZone` and concluded "we can answer here". That is how
// `classifyAnswerability('es-14021-cordoba', 'PAS-1')` came to return `full-envelope`: a claim no
// Córdoba parcel can honour, and one Córdoba has carried since the day it was registered.
//
// ⚠ THE FIX IS NEVER TO DE-REGISTER A PACK. De-registration would fix one city and re-open the
// same hole for the next gated one, and it would ALSO put out the C60 coverage globe (we DO answer
// in Córdoba — with an honest, cited refusal, which is an answer). The gate has to become
// something the ontology can READ.
//
// ⛔⛔ FAIL-CLOSED BY ABSENCE — CHANGED 2026-08-02. READ THIS BEFORE TOUCHING THE DEFAULT.
// ------------------------------------------------------------------------------------------
// THIS MODULE USED TO FAIL **OPEN**: `ENVELOPE_PUBLICATION_GATES.get(id) ?? true`. The reasoning
// was sound for the world it was written in — Barcelona, Denmark, Paris and the Netherlands owe no
// gate, and making absence mean "refused" would have silenced every jurisdiction that had shipped.
// The §TOTALITY test closed the obvious hole (a gate that exists but was never listed here).
//
// ⚠ WHAT THE TOTALITY TEST NEVER COVERED, AND WHY THE DEFAULT HAD TO INVERT. Totality scans for
// `*_ENVELOPE_VERIFIED` CONSTANTS. It therefore protects against *an unlisted gate*. It says
// nothing about *an unlisted JURISDICTION* — an id that reaches this function having never been
// considered by anyone. Under `?? true` such an id PUBLISHED.
//
// That was harmless only while the set of reachable jurisdiction ids was closed and hand-written.
// The moment the Barcelona hardcodes are parameterised on the INE code, the AMB layer's **36
// municipalities** become reachable, and 26 of them have no entry anywhere in this package. Under
// the old default they would not have been "unlocked" — they would have **PUBLISHED WITHOUT A
// GATE**. Of the nine confident-and-wrong patterns measured this week this is the ONLY one whose
// failure direction is OVER-GRANTING; every other has been safe-side.
//
// ⇒ THE DEFAULT IS NOW `false`. Authorisation requires the jurisdiction to be EXPLICITLY KNOWN,
//   in exactly one of two ways:
//     1. `ENVELOPE_PUBLICATION_GATES` — it declares a human-verification gate; the gate's own
//        constant decides. (Unchanged.)
//     2. `UNGATED_AUTHORISED_JURISDICTIONS` — it owes no gate, and the REASON is written down.
//   Anything else refuses with a named reason (`unknown-jurisdiction`), which is the honest answer
//   to "we have never assessed this place".
//
// ⚠ MEASURED BEFORE AND AFTER: **no shipped jurisdiction loses coverage.** All 16 registered
// jurisdictions are in one of the two tables, so every id that could reach this function before
// the change returns exactly what it returned before. The only behaviour that changes is for ids
// nobody had assessed — which never had authorisation to lose.
//
// ⚠ ADDING A JURISDICTION TO `UNGATED_AUTHORISED_JURISDICTIONS` IS A PUBLICATION DECISION. It is
// not a wiring convenience. The reason string is not decoration: it is the record of why no human
// signature is owed, and `envelopeAuthorisation.test.ts` asserts the set is exactly this list, so
// adding one is a stated act rather than an absorbed one.
//
// PURITY: L2-pure (C58 §1.1/§1.9) — no I/O, no clock, no RNG. It reads compile-time constants.
//
// Strategic context — C58 §1.4/§1.13, C60 §2, L-449 (the human-verification gate), L-665.

import { trace } from '@opentelemetry/api';
import { BADALONA_ENVELOPE_VERIFIED, BADALONA_JURISDICTION_ID } from './esBadalona.js';
import { CATALUNYA_ENVELOPE_VERIFIED, CATALUNYA_JURISDICTION_ID } from './esCatalunya.js';
import { CORDOBA_ENVELOPE_VERIFIED } from './esCordobaZoneClassification.js';
import { CORDOBA_JURISDICTION_ID } from './esCordobaPGOU2001.js';
import { CORNELLA_ENVELOPE_VERIFIED, CORNELLA_JURISDICTION_ID } from './esCornella.js';
import { LHOSPITALET_ENVELOPE_VERIFIED, LHOSPITALET_JURISDICTION_ID } from './esLHospitalet.js';
import { MADRID_ENVELOPE_VERIFIED } from './esMadridPgoum97.js';
import { MADRID_JURISDICTION_ID } from './esMadridNZ1.js';
import { MURCIA_ENVELOPE_VERIFIED, MURCIA_JURISDICTION_ID } from './esMurciaEnvelope.js';
import { SANT_BOI_ENVELOPE_VERIFIED, SANT_BOI_JURISDICTION_ID } from './esSantBoi.js';
// ⚠ VALÈNCIA — a gate of a THIRD kind. See the third group in the table below.
import { VALENCIA_ENVELOPE_VERIFIED, VALENCIA_JURISDICTION_ID } from './esValenciaEnvelope.js';
// ── The UNGATED-BY-RECORD allowlist. Ids only; these packs declare no `*_ENVELOPE_VERIFIED`. ──
import { BCN_JURISDICTION_ID } from './esBarcelonaVolumetria18.js';
import { CH_JURISDICTION_ID } from './chZoning.js';
import { CORDOBA_MUNICIPAL_JURISDICTION_ID } from './esCordobaZoneClassification.js';
import { DK_PLANDATA_JURISDICTION_ID } from './dkPlandataEnvelope.js';
import { NL_JURISDICTION_ID } from './nlBestemmingsplan.js';
import { PARIS_JURISDICTION_ID } from './frParisPluBioclimatique.js';
import { SA_RIYADH_JURISDICTION_ID } from './saRiyadhDemo.js';

const tracer = trace.getTracer('pryzm.zoning.authorisation');

/**
 * Every jurisdiction that declares a human-verification gate, mapped to the gate's CURRENT state.
 *
 * ⚠ THE VALUES ARE READ FROM THE GATE CONSTANTS, NEVER RESTATED. Writing `false` here would create
 * a second statement of the signature that could drift from the one the dispatcher checks — the
 * L-422/457/467/469 failure family, restated at the authorisation seam. Signing a city means
 * flipping ITS constant, in ITS own file, next to the pack it governs; this table then follows with
 * no edit.
 *
 * ⚠ THE KEY IS THE JURISDICTION ID CONSTANT, not a literal, for the same reason.
 */
export const ENVELOPE_PUBLICATION_GATES: ReadonlyMap<string, boolean> = new Map<string, boolean>([
    // ── Awaiting a signature on a transcription PRYZM already holds. ──
    [MADRID_JURISDICTION_ID, MADRID_ENVELOPE_VERIFIED],
    [CORDOBA_JURISDICTION_ID, CORDOBA_ENVELOPE_VERIFIED],
    [MURCIA_JURISDICTION_ID, MURCIA_ENVELOPE_VERIFIED],
    // ── Awaiting a per-clau confirmation that Barcelona's numbers transfer (Envelope Phase 2). ──
    [LHOSPITALET_JURISDICTION_ID, LHOSPITALET_ENVELOPE_VERIFIED],
    [BADALONA_JURISDICTION_ID, BADALONA_ENVELOPE_VERIFIED],
    [SANT_BOI_JURISDICTION_ID, SANT_BOI_ENVELOPE_VERIFIED],
    [CORNELLA_JURISDICTION_ID, CORNELLA_ENVELOPE_VERIFIED],
    // ── ⚠ A THIRD KIND OF GATE: NOT awaiting a signature, and NOT signable at all. ──
    // Madrid/Córdoba/Murcia are `false` because a human has not yet signed a transcription PRYZM
    // HOLDS. València is `false` because there is NO NUMBER TO SIGN: the PGOU *Normas Urbanísticas*
    // (mayo 1991) were sourced, read and transcribed in full, and Arts. 6.18.2 / 6.19.1 / 6.25.1 /
    // 6.30.1 define the envelope as a function of a storey count and a depth graphed on **Plano C**,
    // which the city does not publish as data. `ES_VALENCIA_PGOU_PACK.zones` is EMPTY by
    // construction, so flipping this constant would authorise nothing — it would merely remove the
    // interlock that stops a later author packing a guessed Np and shipping it (L-616 mechanism-A).
    // ⇒ It is registered here so the classifier cannot FAIL OPEN on València, not so it can be signed.
    [VALENCIA_JURISDICTION_ID, VALENCIA_ENVELOPE_VERIFIED],
    // ── NOT waiting on a signature: there is nothing to sign (no Catalonia-wide instrument
    //    exists). Listed because the gate EXISTS and totality demands it — never because a
    //    signature would open it. See `esCatalunya.ts`: do not "fix" this by flipping it.
    [CATALUNYA_JURISDICTION_ID, CATALUNYA_ENVELOPE_VERIFIED],
]);

/**
 * Jurisdictions that publish WITHOUT a human-verification gate, each with the reason none is owed.
 *
 * ⚠ THIS IS THE OTHER HALF OF THE FAIL-CLOSED DEFAULT. Before 2026-08-02 these were authorised by
 * ABSENCE, which is indistinguishable from "nobody has looked at this place". Making the reason
 * explicit is what lets the default invert without silencing anything that had shipped.
 *
 * ⚠ A jurisdiction belongs here ONLY when the authority publishes the governing determination as
 * DATA, so PRYZM transcribes no ordinance and there is nothing for a human to sign (the SIG-M2 /
 * ADR-0283 argument). If PRYZM transcribes a number, it owes a gate — put it in
 * `ENVELOPE_PUBLICATION_GATES` instead.
 */
export const UNGATED_AUTHORISED_JURISDICTIONS: ReadonlyMap<string, string> = new Map<string, string>([
    [
        BCN_JURISDICTION_ID,
        'Barcelona is the reference city. Its packs ship at `estimated-ruleset` under SIG-1/SIG-2/SIG-3/SIG-4 ' +
            '(docs/04-reference/jurisdictions/es/es-ct/08019-barcelona/sources/VERIFICATION.md); the route-level ' +
            'gates it does owe are enforced at their own dispatch sites (e.g. BCN_REFOS_OV_CERTIFIED for clau 18), ' +
            'not at jurisdiction granularity.',
    ],
    [
        DK_PLANDATA_JURISDICTION_ID,
        'Denmark publishes the envelope determination itself through Plandata.dk as machine-readable data ' +
            '(maksbebyggelsesprocent / maks. bygningshoejde per plan). PRYZM transcribes no ordinance, so no ' +
            'signature is owed (L-449 SIGNED vs BR18).',
    ],
    [
        PARIS_JURISDICTION_ID,
        'Paris PLU bioclimatique: the route gate is FR_PARIS_PLU_CERTIFIED, enforced at its own dispatch site. ' +
            '⚠ That gate is currently OPEN AND UNSIGNED and is quarantined in `UNSIGNED_OPEN_GATES` ' +
            '(l449CertificationGates.ts). This entry authorises the JURISDICTION; it does not resolve that quarantine.',
    ],
    [
        NL_JURISDICTION_ID,
        'Netherlands bestemmingsplan: the route gate is NL_BESTEMMINGSPLAN_CERTIFIED, enforced at its own ' +
            'dispatch site. ⚠ Also OPEN AND UNSIGNED and quarantined in `UNSIGNED_OPEN_GATES`.',
    ],
    [
        CH_JURISDICTION_ID,
        'Switzerland national Grundnutzung: the route gate is CH_FAR_CERTIFIED, SIGNED 2026-07-26 by the repo ' +
            'owner (docs/04-reference/jurisdictions/ch/sources/VERIFICATION.md) and enforced at its own dispatch site.',
    ],
    [
        CORDOBA_MUNICIPAL_JURISDICTION_ID,
        'The Cordoba MUNICIPAL classification jurisdiction publishes refusals only — it carries no numeric ' +
            'envelope to authorise. The numeric pack is `es-14021-cordoba`, which IS gated and is `false`.',
    ],
    [
        SA_RIYADH_JURISDICTION_ID,
        'Riyadh is an explicit DEMO jurisdiction (saRiyadhDemo.ts), not a determination surface. It is listed ' +
            'so it cannot reach the unknown-jurisdiction refusal by accident, and it must never be cited as coverage.',
    ],
]);

/** Why `isEnvelopePublicationAuthorised` answered as it did — for refusal copy and for the span. */
export type EnvelopeAuthorisationReason =
    /** The jurisdiction declares a gate and it is OPEN. */
    | 'gate-open'
    /** The jurisdiction declares a gate and it is SHUT — a human signature is outstanding. */
    | 'gate-shut'
    /** The jurisdiction owes no gate, and the reason is recorded in `UNGATED_AUTHORISED_JURISDICTIONS`. */
    | 'ungated-by-record'
    /**
     * ⛔ THE FAIL-CLOSED PATH. This jurisdiction id appears in NEITHER table — nobody has assessed
     * it. It refuses. This is the honest answer, and before 2026-08-02 it silently PUBLISHED.
     */
    | 'unknown-jurisdiction';

/**
 * Whether PRYZM is authorised to PUBLISH A NUMERIC ENVELOPE for this jurisdiction, with the reason.
 *
 * ⛔ FAILS CLOSED. An id in neither table returns `authorised: false` / `unknown-jurisdiction`.
 *
 * ⚠ THIS IS NOT "DO WE COVER IT" AND NOT "IS THIS ZONE BUILDABLE". It is exclusively the
 * signature question. A `false` here says PRYZM's own verification is unfinished; it says nothing
 * whatsoever about the land or the ordinance, and a caller that renders it as a legal statement
 * has committed the §CONTEXT-DATA-HONESTY collapse this package keeps hitting (L-553).
 *
 * P8 — emits `pryzm.zoning.envelopePublicationAuthorisation`.
 */
export function envelopePublicationAuthorisation(jurisdictionId: string): {
    readonly authorised: boolean;
    readonly reason: EnvelopeAuthorisationReason;
} {
    const span = tracer.startSpan('pryzm.zoning.envelopePublicationAuthorisation');
    try {
        let result: { authorised: boolean; reason: EnvelopeAuthorisationReason };
        if (ENVELOPE_PUBLICATION_GATES.has(jurisdictionId)) {
            const open = ENVELOPE_PUBLICATION_GATES.get(jurisdictionId) === true;
            result = { authorised: open, reason: open ? 'gate-open' : 'gate-shut' };
        } else if (UNGATED_AUTHORISED_JURISDICTIONS.has(jurisdictionId)) {
            result = { authorised: true, reason: 'ungated-by-record' };
        } else {
            // ⛔ The inverted default. Never `true`.
            result = { authorised: false, reason: 'unknown-jurisdiction' };
        }
        span.setAttribute('jurisdictionId', jurisdictionId);
        span.setAttribute('authorised', result.authorised);
        span.setAttribute('reason', result.reason);
        return result;
    } finally {
        span.end();
    }
}

/**
 * Whether PRYZM is authorised to PUBLISH A NUMERIC ENVELOPE for this jurisdiction.
 *
 * ⛔ FAILS CLOSED as of 2026-08-02 — see the header. An unrecognised jurisdiction id REFUSES.
 * Use `envelopePublicationAuthorisation()` when you need the reason (e.g. for refusal copy).
 *
 * P8 — emits `pryzm.zoning.isEnvelopePublicationAuthorised`.
 */
export function isEnvelopePublicationAuthorised(jurisdictionId: string): boolean {
    const span = tracer.startSpan('pryzm.zoning.isEnvelopePublicationAuthorised');
    try {
        const { authorised, reason } = envelopePublicationAuthorisation(jurisdictionId);
        span.setAttribute('jurisdictionId', jurisdictionId);
        span.setAttribute('gated', ENVELOPE_PUBLICATION_GATES.has(jurisdictionId));
        span.setAttribute('authorised', authorised);
        span.setAttribute('reason', reason);
        return authorised;
    } finally {
        span.end();
    }
}
