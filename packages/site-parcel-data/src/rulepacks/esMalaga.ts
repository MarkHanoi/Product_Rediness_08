// MÁLAGA (INE 29067) — §RESEARCH-PENDING, not §L-449. Distinct from every other refusal
// jurisdiction in this repo: there is no rulepack to sign, because there is no rulepack.
//
// The municipal GeoServer (`sig.malaga.eu/geoserver/wfs`) is measured LIVE and reachable —
// `GetCapabilities` answers HTTP 200 with 43 feature types, including `muralPGOU:POLCALIF_T`
// (calificación polygons) and `muralPGOU:LINALIN_T` (alignment lines, the only published municipal
// alignment layer found anywhere in Andalucía). But every parameterized attempt to READ a
// `muralPGOU:*` layer (13 combinations across WFS versions/mount paths/CRS, plus WMS
// GetMap/GetFeatureInfo/GetLegendGraphic) fails with `ORA-28000: la cuenta está bloqueada` (Oracle
// account locked) — confirmed by control (3/3 non-muralPGOU layers on the SAME instance serve
// normally, 0/8 muralPGOU layers do). This is an AUTHORITY-SIDE access block, not a missing
// dataset: Título 12's 12 normative PDFs are all HTTP 200 and natively text-extractable, so the
// ordinance TEXT is readable today — only the GEOMETRY needed to identify which zone governs a
// given parcel is locked. Full record:
// docs/04-reference/jurisdictions/es/es-an/29067-malaga/findings/FORENSIC-BLOCKER-AUDIT-2026-08-03.md
//
// PURITY: L2-pure. No I/O, no THREE, no DOM, no clock.

import type { EnvelopeRefusal } from '@pryzm/schemas';
import { researchPendingRefusal } from './researchPendingRefusal.js';

export const MALAGA_JURISDICTION_ID = 'es-29067-malaga';

/**
 * ⛔ `false`, and NOT SIGNABLE AT ALL today — a THIRD kind of gate, the València/Sevilla shape
 * (`envelopeAuthorisation.ts`'s own docstring names it): not awaiting a signature on a
 * transcription PRYZM holds, because PRYZM holds no transcription. There is nothing to sign until
 * the Oracle access block clears and a rulepack is built. Declared here so the L-449 totality
 * scanner and `envelopeAuthorisation.ts`'s fail-closed classifier cannot treat an unresearched
 * jurisdiction as silently authorised.
 */
export const MALAGA_ENVELOPE_VERIFIED: boolean = false;

const MALAGA_AUDIT_REF =
    'docs/04-reference/jurisdictions/es/es-an/29067-malaga/findings/' +
    'FORENSIC-BLOCKER-AUDIT-2026-08-03.md';

/** A cited "not yet researched" refusal, naming the SPECIFIC authority-side access block. */
export function malagaResearchPendingRefusal(): EnvelopeRefusal {
    return researchPendingRefusal({
        displayName: 'Málaga',
        rootBlocker:
            "The municipal GeoServer's zoning layers (`muralPGOU:POLCALIF_T` calificación, " +
            '`muralPGOU:LINALIN_T` alignment) are reachable at the service level but every ' +
            'attempted read fails with an Oracle database access error on the authority\'s own ' +
            'server — confirmed by testing other layers on the same instance, which serve ' +
            'normally. The ordinance text (Título 12, 12 documents) is readable; the geometry ' +
            'needed to identify which zone governs a given parcel is not.',
        auditRef: MALAGA_AUDIT_REF,
    });
}
