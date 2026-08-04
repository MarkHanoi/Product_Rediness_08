// §RESEARCH-PENDING-REFUSAL — the shared "PRYZM has not researched this jurisdiction's ordinance
// yet" refusal, for a municipality that has NO rulepack, NO zone-identity resolver, and NO
// registry entry AT ALL — the earliest, coldest point on the pipeline, one step before even a
// zone-named coverage-gap refusal (Sevilla/Murcia's shape) can be written.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// WHY THIS EXISTS — THE DEFECT IT CLOSES
// ══════════════════════════════════════════════════════════════════════════════════════════════
// Before this module, an unregistered municipality had no `isInX` branch in `applyZoning` at all,
// so a click there fell straight through to `applyEstimatedZoning` — a REAL envelope with real
// setbacks, FAR and coverage, computed from nothing (§L-663's fabricated generic default). That is
// the same class of defect `refuseEstimateInsideRegisteredJurisdiction` exists to prevent for
// REGISTERED jurisdictions; this module extends the same honesty property to jurisdictions PRYZM
// has ONLY IDENTIFIED (a bbox, sourced from Catastro INSPIRE) but has not yet researched at all.
//
// ⚠ THIS IS NOT A ZONE-NAMED REFUSAL. Unlike `sevillaNoRulePackRefusal` /
// `canariasNoRulePackRefusal`, there is no zone-identity resolver to name a real zone code with —
// the refusal states plainly that research has not started, never implies a zone was looked up.
//
// PURITY: L2-pure (C58 §1.1/§1.9). No I/O, no clock, no RNG.

import type { EnvelopeRefusal } from '@pryzm/schemas';

/** One municipality's research-pending facts — every field required, so a caller cannot construct
 *  a refusal that discloses less than it should. */
export interface ResearchPendingRecord {
    /** Human display name, e.g. "Málaga". */
    readonly displayName: string;
    /**
     * WHY no rulepack exists yet — a specific, honest sentence, never generic boilerplate. E.g.
     * "the municipal GIS service exists but every zoning layer returns a database access error"
     * (Málaga) vs "no planning source has been identified for this municipality yet" (Granada).
     */
    readonly rootBlocker: string;
    /** Repo-relative path to the forensic audit this refusal's facts are drawn from. */
    readonly auditRef: string;
}

/**
 * A cited "PRYZM has not researched this jurisdiction yet" refusal. Never a fabricated estimate,
 * never implies a zone lookup that did not happen.
 */
export function researchPendingRefusal(record: ResearchPendingRecord): EnvelopeRefusal {
    return {
        code: 'no-rule-pack',
        headline:
            `${record.displayName} — PRYZM has identified this municipality but has not yet ` +
            'researched its zoning ordinance, so it will not publish a buildable figure.',
        detail:
            `PRYZM has not transcribed a buildable-envelope ruleset for ${record.displayName}. ` +
            record.rootBlocker +
            ' No height, buildability, occupation or setback is published here — never an ' +
            'estimate, never a proxy figure — until that research is done, an ordinance ' +
            'transcribed, and a human signs off per PRYZM\'s L-449 discipline. ' +
            `See ${record.auditRef} for the full forensic record.`,
        ordinanceRef: null,
        legallyGrounded: false,
        knownFacts: [],
    };
}
