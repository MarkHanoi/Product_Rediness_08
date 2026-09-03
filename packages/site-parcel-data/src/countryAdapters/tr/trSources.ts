// LANE ME-OPEN — TURKEY · source discovery: the typed `SiteIntelSource` rows for the TR adapter,
// validated through `SiteIntelSourceSchema` at module load — same shape as `eeSources.ts`.
//
// ⚠ LICENCE = YELLOW (UNREAD), DELIBERATELY. `parselsorgu.tkgm.gov.tr` serves no static terms text,
// and TKGM's bulk/WMS products are normally priced+protocol-gated — the QUERY endpoint being keyless
// is the bulk-vs-query-endpoint distinction, NOT a licence grant. Per the brief ("several licences
// UNREAD — flag, do not assume open"), the row is YELLOW with verifiedDate null and the unread-gate
// named; flipping it GREEN requires reading the app's usage-terms modal / TKGM protocol terms.

import { SiteIntelSourceSchema, type SiteIntelSource } from '@pryzm/schemas';
import { TR_TKGM_PARSEL_BASE } from './trTkgmClient.js';

/** The TKGM parcel-query source id — the id a minted TR parcel record would cite. */
export const TR_TKGM_PARSEL_SOURCE_ID = 'tr-tkgm-parsel';

const TR_LICENCE_UNREAD = {
    id: 'TKGM parselsorgu usage terms (UNREAD)',
    colour: 'YELLOW',
    verifiedDate: null,
    textRef: null,
} as const;

/**
 * The TR source registry — the keyless TKGM parcel-query channel, with its dated 2026-09-02 live
 * probe. (Envelope rules for TR are document-only + municipal e-Devlet-gated, me-sweep §10 — no
 * served-as-data national channel exists, so no rules source row is minted.)
 */
export const TR_ADAPTER_SOURCES: readonly SiteIntelSource[] = [
    {
        id: TR_TKGM_PARSEL_SOURCE_ID,
        country: 'TR',
        authority: 'Tapu ve Kadastro Genel Müdürlüğü (TKGM)',
        dataset: 'megsiswebapi.v3 parsel point→parcel GeoJSON (adaNo/parselNo/alan/nitelik), WGS84',
        endpoint: TR_TKGM_PARSEL_BASE,
        protocol: 'REST',
        licence: TR_LICENCE_UNREAD,
        accessOption: 1, // live query, keyless
        gate: null,
        theme: 'cadastre',
        coverage: 'national (point query)',
        updateFrequency: null,
        adapterStatus: 'live',
        probes: [
            {
                date: '2026-09-02',
                note: 'ME-OPEN: GET /parsel/40.9819/29.0576 → HTTP 200, GeoJSON Feature ada 3106 / parsel 258, İstanbul/Kadıköy, alan "816.27", nitelik "11 Katli Betonarme Mesken…" (storey signal), WGS84 Polygon; keyless from a foreign IP. A no-parcel point answers HTTP 404 "Parsel Bulunamadı" (semantic miss, classified absent).',
            },
        ],
    },
].map((row) => SiteIntelSourceSchema.parse(row));
