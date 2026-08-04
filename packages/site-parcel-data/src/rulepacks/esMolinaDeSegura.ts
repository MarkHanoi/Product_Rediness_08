// MOLINA DE SEGURA (INE 30027, Región de Murcia) — §RESEARCH-PENDING, not §L-449. No rulepack
// and no working parcel-level zone resolver exist for Molina de Segura today.
//
// WHAT THE 2026-08-04 CAPABILITY PASS FOUND (full record: `docs/04-reference/jurisdictions/es/
// es-mc/30027-molina-de-segura/findings/CAPABILITY-RESEARCH-2026-08-04.md`):
//   • The PGMO texto refundido (approved 25-March-2013) is stable, non-annulled, currently in
//     force; recent modifications (83, 86) are narrow alignment adjustments, not framework
//     replacements.
//   • The municipality operates a real internal GIS stack (Oracle 11g + GeoServer + QGIS, per a
//     2017 procurement document) and exposes a live, public, no-auth "P.G.M.O. Información
//     territorial" viewer that explicitly supports cadastral-reference search and displays zoning
//     classification.
//   • ⚠ THAT VIEWER IS A THIRD-PARTY SAAS SPA. It is white-labelled on `citymap.tecnogeows.com`
//     ("Citymap" by Tecnogeo), not a `molinadesegura.es`-hosted GeoServer/ArcGIS endpoint. Static
//     WebFetch renders only the page shell; no XHR/API call pattern could be recovered. A direct
//     guess at a co-located GeoServer path (`citymap.tecnogeows.com/geoserver/wms?...
//     GetCapabilities`) returned HTTP 404 — that specific guess is ruled out, not the existence of
//     a differently-routed backend. Reverse-engineering it requires a real/headless browser
//     session with network-tab capture, which this research pass's tooling did not have.
//   • The two ordinance source PDFs (Normas Urbanísticas del PGMO; Fichas Urbanísticas del
//     Refundido PGMO) were downloaded successfully (both real, reachable, correctly sized) but
//     their per-zone parameter tables are image/vector-drawn, not text-selectable — an OCR task,
//     not evidence the data is absent.
//
// ⇒ Building a pack today would mean guessing at a proprietary SPA's backend contract AND at
// zone-parameter values behind an un-OCR'd table — two independent guesses stacked on each other.
// Molina de Segura ships NO resolver and NO pack; every parcel gets a cited "identified, real
// infrastructure confirmed, not yet reachable" refusal.
//
// PURITY: L2-pure. No I/O, no THREE, no DOM, no clock.

import type { EnvelopeRefusal } from '@pryzm/schemas';
import { researchPendingRefusal } from './researchPendingRefusal.js';

export const MOLINA_DE_SEGURA_JURISDICTION_ID = 'es-30027-molina-de-segura';

/**
 * ⛔ `false`, and NOT SIGNABLE AT ALL today — the same THIRD-kind gate `MALAGA_ENVELOPE_VERIFIED`/
 * `GRANADA_ENVELOPE_VERIFIED` carry: no rulepack exists, so there is nothing to sign.
 */
export const MOLINA_DE_SEGURA_ENVELOPE_VERIFIED: boolean = false;

const MOLINA_DE_SEGURA_RESEARCH_REF =
    'docs/04-reference/jurisdictions/es/es-mc/30027-molina-de-segura/findings/' +
    'CAPABILITY-RESEARCH-2026-08-04.md';

/** A cited "identified, real GIS infrastructure confirmed, not yet reachable" refusal. */
export function molinaDeSeguraResearchPendingRefusal(): EnvelopeRefusal {
    return researchPendingRefusal({
        displayName: 'Molina de Segura',
        rootBlocker:
            'The public parcel/cadastral-reference→zoning viewer ("P.G.M.O. Información ' +
            'territorial") is white-labelled on a third-party SaaS platform ' +
            '(citymap.tecnogeows.com "Citymap"), not a molinadesegura.es-hosted GeoServer or ' +
            'ArcGIS endpoint — its backend API could not be enumerated by static fetch (a direct ' +
            'GeoServer-path guess returned HTTP 404), and reverse-engineering the SPA requires a ' +
            'real/headless browser session this research pass did not have. Separately, the two ' +
            'ordinance source PDFs (Normas Urbanísticas, Fichas Urbanísticas del Refundido PGMO) ' +
            'are real and downloadable, but their per-zone parameter tables are image/vector-drawn ' +
            'and not text-extractable — an OCR pass has not yet been done.',
        auditRef: MOLINA_DE_SEGURA_RESEARCH_REF,
    });
}
