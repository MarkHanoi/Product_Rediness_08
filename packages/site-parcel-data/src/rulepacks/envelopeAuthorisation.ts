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
// FAIL-OPEN BY ABSENCE, MADE SAFE BY A TOTALITY TEST
// --------------------------------------------------
// A jurisdiction absent from this table is AUTHORISED. That is the right default — Barcelona,
// Denmark, Paris and the Netherlands declare no gate because none is owed; making absence mean
// "refused" would silence every jurisdiction that has actually shipped.
//
// The danger of a fail-open default is a gate that exists but was never listed here. That is
// closed NOT by a convention but by `envelopeAuthorisation.test.ts` §TOTALITY, which scans
// `src/rulepacks/*.ts` for every exported `*_ENVELOPE_VERIFIED` constant and fails if one is
// missing from `ENVELOPE_PUBLICATION_GATES`. A future gated city therefore CANNOT re-open this
// hole: adding the gate without registering it here is a red test, not a silent over-claim. Same
// technique as `packPublishedConfidenceUnchanged.test.ts`'s frozen manifest.
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
    // ── NOT waiting on a signature: there is nothing to sign (no Catalonia-wide instrument
    //    exists). Listed because the gate EXISTS and totality demands it — never because a
    //    signature would open it. See `esCatalunya.ts`: do not "fix" this by flipping it.
    [CATALUNYA_JURISDICTION_ID, CATALUNYA_ENVELOPE_VERIFIED],
]);

/**
 * Whether PRYZM is authorised to PUBLISH A NUMERIC ENVELOPE for this jurisdiction.
 *
 * `true` for any jurisdiction that declares no gate — see the fail-open argument in the header,
 * and the §TOTALITY test that makes an unlisted gate impossible.
 *
 * ⚠ THIS IS NOT "DO WE COVER IT" AND NOT "IS THIS ZONE BUILDABLE". It is exclusively the
 * signature question. A `false` here says PRYZM's own verification is unfinished; it says nothing
 * whatsoever about the land or the ordinance, and a caller that renders it as a legal statement
 * has committed the §CONTEXT-DATA-HONESTY collapse this package keeps hitting (L-553).
 *
 * P8 — emits `pryzm.zoning.isEnvelopePublicationAuthorised`.
 */
export function isEnvelopePublicationAuthorised(jurisdictionId: string): boolean {
    const span = tracer.startSpan('pryzm.zoning.isEnvelopePublicationAuthorised');
    try {
        const gated = ENVELOPE_PUBLICATION_GATES.has(jurisdictionId);
        const authorised = ENVELOPE_PUBLICATION_GATES.get(jurisdictionId) ?? true;
        span.setAttribute('jurisdictionId', jurisdictionId);
        span.setAttribute('gated', gated);
        span.setAttribute('authorised', authorised);
        return authorised;
    } finally {
        span.end();
    }
}
