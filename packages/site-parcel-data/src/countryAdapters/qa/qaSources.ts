// LANE ME-OPEN — QATAR · source discovery: the typed `SiteIntelSource` rows for the QA adapter,
// validated through `SiteIntelSourceSchema` at module load — same shape as `eeSources.ts`.
//
// ⚠ LICENCE = YELLOW (UNREAD), DELIBERATELY. The CadastrePlots REST endpoint carries NO licence
// statement, and keyless ≠ licensed (me-sweep §4). Per the brief ("several licences UNREAD — flag,
// do not assume open"), the row is YELLOW with verifiedDate null and the exact unread-gate named;
// flipping it GREEN requires reading the gisqatar.org.qa terms + the MME open-data policy.

import { SiteIntelSourceSchema, type SiteIntelSource } from '@pryzm/schemas';
import { QA_CADASTRE_PLOTS_QUERY_ENDPOINT } from './qaCadastreClient.js';

/** The CadastrePlots source id — the id a minted QA plot record would cite. */
export const QA_CADASTRE_PLOTS_SOURCE_ID = 'qa-gisqatar-cadastre-plots';

const QA_LICENCE_UNREAD = {
    id: 'gisqatar.org.qa terms + MME open-data policy (UNREAD)',
    colour: 'YELLOW',
    verifiedDate: null,
    textRef: null,
} as const;

/**
 * The QA source registry — the keyless CadastrePlots channel and the (also keyless, geometry-only)
 * Zoning channel, each with its dated 2026-09-02 live probe. Zoning is recorded because zone-geometry
 * is NATIONAL-NOW while the numeric rules behind RULEID are document-only (F-work) — two different
 * facts a reader must not collapse.
 */
export const QA_ADAPTER_SOURCES: readonly SiteIntelSource[] = [
    {
        id: QA_CADASTRE_PLOTS_SOURCE_ID,
        country: 'QA',
        authority: 'GIS Center Qatar (gisqatar.org.qa)',
        dataset: 'Vector/CadastrePlots MapServer layer 0 — plots (PIN/CDST_KEY/PD_NO/PDAREA), wkid 4326',
        endpoint: QA_CADASTRE_PLOTS_QUERY_ENDPOINT,
        protocol: 'REST',
        licence: QA_LICENCE_UNREAD,
        accessOption: 1, // live query, keyless
        gate: null,
        theme: 'cadastre',
        coverage: 'national (point query)',
        updateFrequency: null,
        adapterStatus: 'live',
        probes: [
            {
                date: '2026-09-02',
                note: 'ME-OPEN: query @ (51.531,25.286) → HTTP 200, PIN 1010028 / CDST_KEY 1010028 / PD_NO "PD/4693/2019" / PDAREA 183494 / GFCODE PDGVCDST, 137-vertex WGS84 ring; keyless from a foreign IP. Layer HIDDEN from the Vector folder listing — enumerate the qmap webmap, not the folder.',
            },
        ],
    },
    {
        id: 'qa-gisqatar-zoning',
        country: 'QA',
        authority: 'GIS Center Qatar (gisqatar.org.qa) / Ministry of Municipality (MME)',
        dataset: 'Vector/Zoning MapServer layer 0 — zone code + RULEID (numbers doc-only behind RULEID)',
        endpoint: 'https://services.gisqatar.org.qa/server/rest/services/Vector/Zoning/MapServer/0/query',
        protocol: 'REST',
        licence: QA_LICENCE_UNREAD,
        accessOption: 1,
        gate: null,
        theme: 'planning',
        coverage: 'national (zone geometry); numeric rules document-only (F)',
        updateFrequency: null,
        adapterStatus: 'documented',
        probes: [
            {
                date: '2026-09-02',
                note: 'me-sweep §4: query @ (51.531,25.286) → features:1 ZONING "MUC" / CODE 59 / RULEID 28 / STARTDATE 1716681600000. Zone code + rule id are served; the FAR/height/setback tables behind RULEID are PDF/LEGAL-TEXT in the MME zoning regulations (Europe-class F, same shape as Vienna). NOT wired by this lane.',
            },
        ],
    },
].map((row) => SiteIntelSourceSchema.parse(row));
