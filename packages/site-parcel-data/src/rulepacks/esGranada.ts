// GRANADA (INE 18087) — §RESEARCH-PENDING, not §L-449. Distinct from every other refusal
// jurisdiction in this repo: there is no rulepack to sign, because there is no rulepack, and
// unlike Málaga there isn't even an identified GIS endpoint to be blocked by.
//
// ZERO investigation has happened for Granada: no planning source identified, no geometry
// endpoint found, no zone-classification method known. The doc folder holds only the C63 Phase-1
// scaffold, never modified since its original scaffold commit. Granada contains the
// Alhambra/Conjunto Histórico, so a heritage overlay is near-certain once real research starts —
// flagged here so it is never silently dropped from the research scope. Full record:
// docs/04-reference/jurisdictions/es/es-an/18087-granada/findings/FORENSIC-BLOCKER-AUDIT-2026-08-03.md
//
// PURITY: L2-pure. No I/O, no THREE, no DOM, no clock.

import type { EnvelopeRefusal } from '@pryzm/schemas';
import { researchPendingRefusal } from './researchPendingRefusal.js';

export const GRANADA_JURISDICTION_ID = 'es-18087-granada';

/**
 * ⛔ `false`, and NOT SIGNABLE AT ALL today — the same THIRD-kind gate `MALAGA_ENVELOPE_VERIFIED`
 * carries: no research has been done, so there is no transcription to sign. Declared here so the
 * L-449 totality scanner and `envelopeAuthorisation.ts`'s fail-closed classifier cannot treat an
 * unresearched jurisdiction as silently authorised.
 */
export const GRANADA_ENVELOPE_VERIFIED: boolean = false;

const GRANADA_AUDIT_REF =
    'docs/04-reference/jurisdictions/es/es-an/18087-granada/findings/' +
    'FORENSIC-BLOCKER-AUDIT-2026-08-03.md';

/** A cited "not yet researched" refusal — the honest, cold-start case. */
export function granadaResearchPendingRefusal(): EnvelopeRefusal {
    return researchPendingRefusal({
        displayName: 'Granada',
        rootBlocker:
            'No planning source, GIS endpoint or zone-classification method has been identified ' +
            'for Granada yet — this is a research starting point, not a partial result. Granada ' +
            'contains the Alhambra / Conjunto Histórico, so a heritage overlay is expected to be ' +
            'part of any future determination.',
        auditRef: GRANADA_AUDIT_REF,
    });
}
