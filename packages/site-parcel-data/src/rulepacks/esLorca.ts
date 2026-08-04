// LORCA (INE 30024, Región de Murcia) — §RESEARCH-PENDING, not §L-449. No rulepack and no
// working parcel-level zone resolver exist for Lorca today, though a candidate mechanism was
// LOCATED (not fired end to end) — a meaningfully stronger starting point than Málaga/Granada's
// cold-start research-pending cases, but not yet a working pipeline.
//
// WHAT THE 2026-08-04 CAPABILITY PASS FOUND (full record: `docs/04-reference/jurisdictions/es/
// es-mc/30024-lorca/findings/CAPABILITY-RESEARCH-2026-08-04.md`):
//   • Lorca's PGMO is active and not superseded — Modificación No. 84 is article-text-only (no
//     zoning-geometry change) and is still pre-final-approval (avance stage, June–July 2026).
//   • The legacy viewer `sit.lorca.es/Visor/` returned HTTP 503. The SUCCESSOR viewer
//     `callejero.lorca.es/VisorWebGIS/` IS live, and direct inspection of its production JS bundle
//     found a concrete parcel/point→ordinance query: `{urbr.url}/urbanismoenredWS/
//     FichaUrbanistica?X={x}&Y={y}&SRS=EPSG:4326&idAmbito={ambito}` — the "Urbanismo en Red" ficha
//     urbanística service, functionally Lorca's analogue of Cartagena's `Ficha/MAN` service.
//   • ⚠ THAT SERVICE WAS NEVER FIRED. `widgets.urbr.url` is populated at runtime from a tenant
//     config (`config/webgis.json?token=...`) that requires a session token obtained through
//     normal browser app bootstrap — this research pass's tooling (WebFetch/curl, no headless
//     browser) could not complete that bootstrap, so the endpoint's live base URL/host and its
//     actual response shape remain UNCONFIRMED.
//   • No downloadable vector (SHP/DXF/GML) zoning layer is published on the planning portal.
//     IDERM/SitMurcia's regional layer is explicitly non-authoritative for Lorca (same 1:5000,
//     non-binding ceiling documented region-wide).
//
// ⇒ Building a pack against `urbanismoenredWS/FichaUrbanistica` today would mean shipping a
// resolver against a service PRYZM has never successfully called — indistinguishable from
// guessing whether it even answers the shape the JS bundle implies. So Lorca ships NO resolver
// and NO pack; every parcel gets a cited "identified but not yet reachable" refusal, naming the
// SPECIFIC token-gated blocker rather than speaking generically.
//
// PURITY: L2-pure. No I/O, no THREE, no DOM, no clock.

import type { EnvelopeRefusal } from '@pryzm/schemas';
import { researchPendingRefusal } from './researchPendingRefusal.js';

export const LORCA_JURISDICTION_ID = 'es-30024-lorca';

/**
 * ⛔ `false`, and NOT SIGNABLE AT ALL today — the same THIRD-kind gate `MALAGA_ENVELOPE_VERIFIED`/
 * `GRANADA_ENVELOPE_VERIFIED` carry: no rulepack exists, so there is nothing to sign. Declared
 * here so the L-449 totality scanner and `envelopeAuthorisation.ts`'s fail-closed classifier
 * cannot treat an unresearched jurisdiction as silently authorised.
 */
export const LORCA_ENVELOPE_VERIFIED: boolean = false;

const LORCA_RESEARCH_REF =
    'docs/04-reference/jurisdictions/es/es-mc/30024-lorca/findings/' +
    'CAPABILITY-RESEARCH-2026-08-04.md';

/** A cited "identified, one candidate mechanism located, not yet reachable" refusal for Lorca. */
export function lorcaResearchPendingRefusal(): EnvelopeRefusal {
    return researchPendingRefusal({
        displayName: 'Lorca',
        rootBlocker:
            'A parcel/point→ordinance query mechanism (`urbanismoenredWS/FichaUrbanistica`) was ' +
            "located in the live viewer's own production JavaScript bundle "
            + '(`callejero.lorca.es/VisorWebGIS/`), but it requires a runtime session token ' +
            '(`config/webgis.json?token=...`) obtained through normal browser bootstrap that ' +
            'automated fetch could not complete, so the endpoint was never fired against a real ' +
            'coordinate. No downloadable vector zoning layer is published on the planning portal, ' +
            "and the region's own IDERM/SitMurcia GIS layer is explicitly non-authoritative for " +
            'Lorca (1:5000, non-binding, per the dataset\'s own metadata).',
        auditRef: LORCA_RESEARCH_REF,
    });
}
