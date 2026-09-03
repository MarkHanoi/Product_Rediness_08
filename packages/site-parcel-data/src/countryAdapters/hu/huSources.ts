// LANE HU — HUNGARY (HU) · the source-registry SEAM. Two rows, because Hungary genuinely splits
// its cadastral parcels across TWO authorities-of-delivery (one keyless-but-sample, one national-
// but-paid), and collapsing them would misstate one of them.
//
// ⚠ THIS IS NOT A SECOND SOURCE REGISTRY (C84 EI-9, one authority per concept). Like `lu/luSources.ts`
// it MINTS rows through the registry's OWN `defineSources` loader so they get identical build-time
// validation, and — because the barrel protocol forbids this lane from editing `sourceRegistry/*` —
// their migration into a new `sourceRegistry/hu.ts` (plus the `SOURCE_REGISTRY` key) is queued for
// the orchestrator in `audit/europe-adapters-2/2026-09-02/barrel-additions-hu.txt`. When that lands,
// delete these rows and re-export the registry's — do NOT leave two.
//
// ⛔ THE LICENCE WAS NOT INHERITED. The keyless WFS declares `ows:Fees` NONE and
// `ows:AccessConstraints` NONE on its GetCapabilities (read live 2026-09-03), so the SERVICE ACCESS
// is free; the broader data-REUSE licence for the INSPIRE sample was NOT separately read from a
// licence page (the [[capture-founder-research-to-repo]] / LU discipline forbids claiming CC0/CC-BY
// without reading it), so the colour is YELLOW and `verifiedDate` records the service-access read,
// with the reuse caveat stated in the probe note. The national TAKARNET/Geoshop delivery is PAID per
// the rest-of-europe sweep §HU + envelope-geometry census row 26 (search-verified), not a byte-level
// price observation of my own — stated honestly rather than dressed up.

import type { SiteIntelSource } from '@pryzm/schemas';
import { defineSources } from '../../sourceRegistry/defineSources.js';
import { HU_INSPIRE_CP_OWS } from './huInspireCpClient.js';

/** The keyless INSPIRE CP WFS row id — the `source` every minted HU sample Parcel cites. */
export const HU_INSPIRE_CP_SOURCE_ID = 'hu-lechner-inspire-cp-wfs';
/** The national fee-gated cadastre row id — the retirement target of the parcel deferral. */
export const HU_NATIONAL_CADASTRE_SOURCE_ID = 'hu-lechner-takarnet-geoshop';

/** The national fee-gated delivery shop endpoint, pinned for the registry row (SPA shell, HTTP 200). */
export const HU_GEOSHOP_ENDPOINT = 'https://geoshop.hu/';

export const HU_ADAPTER_SOURCES: readonly SiteIntelSource[] = defineSources('HU', [
    {
        id: HU_INSPIRE_CP_SOURCE_ID,
        country: 'HU',
        authority: 'Lechner Tudásközpont (Lechner Knowledge Centre)',
        dataset:
            'INSPIRE Annex I — Cadastral Parcels, GeoServer WFS 2.0 (FeatureType ' +
            'CP:CP.CadastralParcels, DefaultCRS EPSG:23700 / HD72 EOV). SAMPLE ONLY: the served ' +
            'data is the Mesterszállás sampling municipality — 1774 features, every one ' +
            'administrativeunit="Mesterszállás"; the ATOM download service is literally titled ' +
            '"Cadastral Parcels of Mesterszállás". Real parcel attributes present ' +
            '(nationalcadastralreference / label = helyrajzi szám, inspireid, areavalue m², ' +
            'beginlifespanversion). This is INSPIRE minimum-compliance sample coverage, NOT the ' +
            'national cadastre.',
        endpoint: HU_INSPIRE_CP_OWS,
        protocol: 'WFS2',
        licence: {
            id: 'INSPIRE view/download — ows:Fees NONE / ows:AccessConstraints NONE (service access)',
            colour: 'YELLOW',
            verifiedDate: '2026-09-03',
            textRef: null,
        },
        accessOption: 1,
        gate: null,
        probes: [
            {
                date: '2026-09-03',
                note:
                    'PROBED LIVE from this machine. GetCapabilities → HTTP 200, 90,332 B, ' +
                    'FeatureType CP:CP.CadastralParcels, DefaultCRS urn:ogc:def:crs:EPSG::23700, ' +
                    'ows:Fees NONE, ows:AccessConstraints NONE, provider "Lechner Knowledge Centre". ' +
                    'GetFeature resultType=hits → numberMatched=1774. Full collection reprojected to ' +
                    'WGS84 → all 1774 features administrativeunit="Mesterszállás", extent ' +
                    'lon[20.399654,20.500223] × lat[46.891381,46.984411]. Budapest capital click ' +
                    '(47.4979,19.0402) → numberMatched=0 (fixture budapest-capital-empty.json, ' +
                    'sha256 c103102050ecc455d7548abbd2c45658191a6cd03db6e212328cc0c195e8e3c1). ' +
                    'Mesterszállás click → real parcel nationalcadastralreference=015, areavalue=455 m². ' +
                    'Reuse licence beyond free service access NOT separately read from a licence page ' +
                    '(YELLOW). Transcript: audit/europe-adapters-2/2026-09-02/lane-hu-transcripts/' +
                    '01-inspire-cp-probe.md.',
            },
        ],
        theme: 'cadastre',
        coverage:
            'Mesterszállás sampling municipality ONLY (1774 parcels, ~7.7×10.3 km). NOT national — ' +
            'a Budapest / anywhere-else click returns an empty FeatureCollection.',
        updateFrequency: 'INSPIRE sample; beginlifespanversion 2019-05-01 (static sample)',
        adapterStatus: 'live-sample-only',
    },
    {
        id: HU_NATIONAL_CADASTRE_SOURCE_ID,
        country: 'HU',
        authority: 'Lechner Tudásközpont (state monopolist for cadastre delivery)',
        dataset:
            'National cadastre — állami ingatlan-nyilvántartási alaptérkép (state real-estate ' +
            'registry base map), delivered via TAKARNET / Lechner Geoshop as PAID SHP/DXF/WMS, ' +
            'quarterly updates. This is the source that WOULD answer a Budapest parcel click; it is ' +
            'fee-gated, so the HU parcel leg is a DECLARED DEFERRAL (huParcelProvider.ts ' +
            'HU_CADASTRE_DEFERRAL). The E-ING electronic land-registry transition is troubled ' +
            '(rest-of-europe sweep §HU).',
        endpoint: HU_GEOSHOP_ENDPOINT,
        // Bulk paid downloads (SHP/DXF) + WMS — 'bulk' is the closest closed-enum class; no live
        // keyless query service is pretended (defineSources PROTOCOL POLICY).
        protocol: 'bulk',
        licence: {
            id: 'Lechner / TAKARNET commercial terms (PAID) — not read from a licence page this pass',
            colour: 'RED',
            verifiedDate: null,
            textRef: null,
        },
        accessOption: 6,
        gate: 'paid — Lechner Geoshop / TAKARNET commercial account',
        probes: [
            {
                date: '2026-09-03',
                note:
                    'REACHABILITY probe only: https://www.geoshop.hu/ → 301 → https://geoshop.hu/ ' +
                    '→ HTTP 200 (3,490 B SPA shell, title "geoshop"); Lechner product article ' +
                    '(lechnerkozpont.hu/cikk/meg-tobb-formaban-erheto-el-az-ingatlan-nyilvantartasi-terkep) ' +
                    '→ HTTP 200. The PAID / quarterly / SHP-DXF-WMS characterisation is from the ' +
                    'rest-of-europe sweep §HU + envelope-geometry census row 26 (search-verified), ' +
                    'NOT a byte-level price observation of my own — the shop is a JS SPA that serves ' +
                    'no price in its static HTML. No keyless national parcel query was found.',
            },
        ],
        theme: 'cadastre',
        coverage: 'national (fee-gated; not fetched)',
        updateFrequency: 'quarterly (sweep-declared)',
        adapterStatus: 'deferred-stub',
    },
]);

/**
 * Endpoints this adapter actually calls, paired with the registry row that documents each — the
 * "committed ≠ reachable" drift guard applied to sources (LU `assertLuEndpoint` pattern). Only the
 * keyless WFS is CALLED; the national row is documentation of the deferral target, so it is not
 * bound to a client call here.
 */
export const HU_ADAPTER_ENDPOINT_BINDINGS: readonly {
    readonly sourceId: string;
    readonly endpoint: string;
}[] = [{ sourceId: HU_INSPIRE_CP_SOURCE_ID, endpoint: HU_INSPIRE_CP_OWS }];

function assertHuEndpoint(sourceId: string, clientEndpoint: string): void {
    const row = HU_ADAPTER_SOURCES.find((s) => s.id === sourceId);
    if (row === undefined) {
        throw new Error(
            `[hu-sources] endpoint drift: no registry row '${sourceId}' exists to pin ` +
                `'${clientEndpoint}' against`,
        );
    }
    if (row.endpoint !== clientEndpoint) {
        throw new Error(
            `[hu-sources] endpoint drift: row '${sourceId}' pins '${String(row.endpoint)}' but ` +
                `the client calls '${clientEndpoint}' — one of the two moved without the other`,
        );
    }
}

for (const binding of HU_ADAPTER_ENDPOINT_BINDINGS) {
    assertHuEndpoint(binding.sourceId, binding.endpoint);
}
