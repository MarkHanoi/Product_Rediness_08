// §DK-HONEST-REFUSAL (context-data-honesty family) — the Denmark (Plandata.dk) REFUSAL vocabulary.
//
// WHAT THIS EXISTS TO FIX
// -----------------------
// Denmark is a PACKED, real-data jurisdiction (C58 §1.2 fidelity 1 — `structured`). But the DK
// dispatch path had exactly two outcomes: a solved STRUCTURED envelope, or — on ANY miss —
// `applyEstimatedZoning`, the generic `estimated-default` triple (3/1.5/3, 12 m, FAR 2). That
// generic estimate was therefore rendered, in the same purple volume and the same card, over a
// Copenhagen parcel whose lokalplan Plandata DID resolve but whose height/FAR simply are not
// published in the WFS structured fields (they live in the plan PDF). A fabricated triple on a
// jurisdiction that HAS a real pack is the exact §CONTEXT-DATA-HONESTY failure this family of work
// exists to remove: a REFUSAL and a FAILURE collapsing to the same value (L-422/L-457/L-467/L-469),
// and a constructed number rendering as a surveyed one (L-459).
//
// The honest answer, when Plandata resolves a plan but not enough structured numbers to draw a
// study volume — or resolves no plan at all — is a REASONED, CITED refusal that names the zone,
// links the governing plan document, and says WHY (the numbers are in the PDF, not the queryable
// fields). Never the generic estimate. Same discipline as `madridNZ1Refusal` (explicit-area zone
// with an unresolved footprint) and the Riyadh `needs-street-width` refusal — a missing INPUT, not
// a legal "no", so `legallyGrounded: false` and `code: 'source-data-unavailable'` (the transient,
// retry-honest class: PRYZM HOLDS the rule path, it is a specific parcel's data that is absent).
//
// PURITY: L2-pure (C58 §1.9) — no I/O, no THREE, no DOM, no clock. A refusal is data.
//
// Strategic context — C58 §1.2/§1.3/§1.4, the context-data-honesty MEMORY family,
// docs/04-reference/DENMARK-GEOSPATIAL-REFERENCE-ARCHITECTURE.md §2.3.

import type { EnvelopeRefusal } from '@pryzm/schemas';

/**
 * Plandata resolved a plan at this parcel (we hold its zone identity + plan-document link), but it
 * does NOT publish enough STRUCTURED dimensional fields for PRYZM to draw a 3D study volume — the
 * governing maximum building height in particular is stated only in the plan PDF, not in the WFS
 * feature attributes PRYZM can query.
 *
 * ⚠ This is NOT the generic estimated triple and it is NOT "no plan". It names the exact plan and
 * cites its document (`ordinanceRef = doklink`) so the user can read the height off the PDF. Any
 * numbers Plandata DID publish (e.g. a plot ratio / storey count) ride in `knownFacts` as FACTS —
 * never as an allowance or a fabricated volume (C58 §1.13.3 — the numeric envelope fields stay
 * null via `buildRefusedEnvelope`).
 */
export function dkPlandataNoNumbersRefusal(opts: {
    readonly zoneLabel: string | null;
    readonly doklink: string | null;
    readonly knownFacts?: readonly string[];
}): EnvelopeRefusal {
    const zone = opts.zoneLabel ? `“${opts.zoneLabel}”` : 'the applicable plan';
    return {
        code: 'source-data-unavailable',
        headline:
            'Plandata.dk resolved this parcel’s plan, but not the numbers needed to draw a ' +
            'buildable envelope.',
        detail:
            `PRYZM found ${zone} at this parcel in Plandata.dk (the Danish national plan ` +
            'register), but this plan does not publish a maximum building height (and/or plot ' +
            'ratio) in Plandata’s structured WFS fields — those figures are stated only in the ' +
            'plan document (PDF). Rather than fabricate a height or a setback triple, PRYZM ' +
            'declines to draw a buildable envelope: no number is shown because none can be cited ' +
            'from the structured feed. Open the linked plan document to read the governing height.',
        // The plan document IS the citation (C58 §1.3). Null only if Plandata carried no doklink.
        ordinanceRef: opts.doklink,
        legallyGrounded: false,
        knownFacts: opts.knownFacts ? [...opts.knownFacts] : [],
    };
}

/**
 * STRUCTURAL-SEAM-4 (RECONCILED 2026-07-27) — Plandata ANSWERED and returned NO adopted plan at this
 * point: no lokalplan, no delområde, no byggefelt, no kommuneplan framework. On a Danish parcel this
 * is an HONEST refusal, never the generic estimated triple: Denmark is a packed jurisdiction, so the
 * absence of a plan is a real finding about this parcel, not a licence to fabricate 3/1.5/3.
 *
 * ⚠ This is now the GENUINE-ABSENCE case ONLY. It previously used `source-data-unavailable` (transient)
 * AND folded in "or Plandata was momentarily unreachable" — the exact failure≠empty conflation
 * seam-4 removes. Now that the plandata proxy returns 502 on a real upstream failure (→ the DK
 * provider's `unreachable` result → `dkPlandataUnreachableRefusal`), this builder is reached ONLY
 * when the WFS answered cleanly with zero features. So `code: 'no-plan-at-point'` (durable, no retry
 * affordance): re-asking returns the same empty.
 */
export function dkPlandataNoPlanRefusal(opts: {
    readonly knownFacts?: readonly string[];
} = {}): EnvelopeRefusal {
    return {
        code: 'no-plan-at-point',
        headline: 'No adopted plan is published for this parcel in Plandata.dk.',
        detail:
            'PRYZM queried Plandata.dk (the Danish national plan register) at this parcel and it ' +
            'answered with no adopted plan — no lokalplan, sub-area (delområde), building field ' +
            '(byggefelt) or kommuneplan framework covers this point. This is Plandata’s answer, not ' +
            'a failed fetch: it will not change on a retry. Rather than fall back to a generic ' +
            'estimate, PRYZM declines to draw a buildable envelope: on a Danish parcel the honest ' +
            'answer is the cited absence, not a fabricated setback triple.',
        ordinanceRef: null,
        legallyGrounded: false,
        knownFacts: opts.knownFacts ? [...opts.knownFacts] : [],
    };
}

/**
 * STRUCTURAL-SEAM-4 — Plandata.dk did NOT answer (network error / non-OK / timeout — the proxy
 * returned 502, or the WFS layers all errored). This is a TRANSIENT failure, distinct from a clean
 * "no plan here": `code: 'source-data-unavailable'`, and the card says "temporarily unavailable,
 * retrying" (reached only after the bounded auto-retry still failed). Never the generic estimate.
 */
export function dkPlandataUnreachableRefusal(opts: {
    readonly knownFacts?: readonly string[];
} = {}): EnvelopeRefusal {
    return {
        code: 'source-data-unavailable',
        headline: 'Plandata.dk was temporarily unreachable for this parcel.',
        detail:
            'PRYZM queried Plandata.dk (the Danish national plan register) at this parcel and the ' +
            'service did not answer (it has been retried automatically). This is a temporary outage ' +
            'of the source, NOT a statement that no plan is published here. Rather than fall back to ' +
            'a generic estimate, PRYZM declines to draw a buildable envelope until the plan can be ' +
            'read. Re-select the parcel to try again.',
        ordinanceRef: null,
        legallyGrounded: false,
        knownFacts: opts.knownFacts ? [...opts.knownFacts] : [],
    };
}
