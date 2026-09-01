// E7-LU — LUXEMBOURG (LU) · the source-registry SEAM.
//
// ⚠ THIS IS NOT A SECOND SOURCE REGISTRY (C84 EI-9, one authority per concept). The pattern is
// `lt/ltSourceRefs.ts`: CONSUME `sourceRegistry/<cc>.ts` and mint only what it lacks, through
// the registry's OWN loader so the rows get identical build-time validation.
//
// ⛔ THE DIFFERENCE FOR LU, STATED RATHER THAN GLOSSED: **`sourceRegistry/lu.ts` DOES NOT EXIST.**
// Read 2026-09-01, `sourceRegistry/` holds be · ch · de · dk · es · fi · fr · gb · it · lt · nl ·
// no · pl · pt (+ EE, which the index re-exports from the adapter). Luxembourg instead sits in
// `SOURCE_ABSENCE_REASONS` with the reason *"L5 sweep LU: all PAGs in ONE national GML model
// (cheapest structured pilot) — no dated endpoint probe row in the prose registries yet."*
//
// **THE PROBE IS NOW DATED AND EXECUTED** (this lane, 2026-09-01: manifest fetched, artefact
// downloaded in full, sha256 computed, 27 tables enumerated, national fill re-censused), so the
// absence is replaced by REAL rows rather than edited away — exactly the bookkeeping E5 §
// registry note anticipated. Because the barrel protocol forbids this lane from editing
// `sourceRegistry/*`, the rows are defined HERE and their migration into a new
// `sourceRegistry/lu.ts` (plus the `SOURCE_REGISTRY` key and the deletion of the LU
// `SOURCE_ABSENCE_REASONS` entry) is queued for the orchestrator in
// `audit/europe-site-intel/2026-08-31/impl/barrel-additions-lu.txt`. When that lands, delete
// these rows and re-export the registry's — do NOT leave two.
//
// ⛔ THE LICENCE WAS CONFIRMED FROM THE LICENCE PAGE, NOT INHERITED (the lane brief's explicit
// instruction). Three independent reads, all 2026-09-01:
//   1. the dataset API record → `"license": "cc-zero"`;
//   2. `https://data.public.lu/api/1/datasets/licenses/` → the `cc-zero` entry resolves to
//      title **"Creative Commons Zero (CC0)"**, maintainer "Creative Commons",
//      url `https://creativecommons.org/publicdomain/zero/1.0/`;
//   3. the dataset's own HTML page (`.../fr/datasets/pag-geometries-.../`, 200, 183,127 bytes)
//      carries the visible string **"Creative Commons Zero (CC0)"** hyperlinked to that deed,
//      and the deed itself returns 200 / 30,476 bytes titled *"CC0 1.0 Universal - Creative
//      Commons"* with "No Copyright". CC0 is CONFIRMED, not assumed. `verifiedDate` is set.

import type { SiteIntelSource } from '@pryzm/schemas';
import { defineSources } from '../../sourceRegistry/defineSources.js';
import {
    LU_PAG_ARTEFACT_BYTES_2026_08_31,
    LU_PAG_ARTEFACT_SHA256_2026_08_31,
    LU_PAG_ARTEFACT_URL_2026_08_31,
    LU_PAG_DATASET_SLUG,
    buildLuPagDatasetUrl,
} from './luPagGpkgClient.js';

/** The PAG source-row id — the `source` every minted LU Plan / Zone / Rule cites. */
export const LU_PAG_SOURCE_ID = 'lu-maint-pag-national-gpkg';

/**
 * The additive rows. Validated through the registry's own loader, so a malformed row is a BUILD
 * error naming the row exactly as every other registry row is.
 *
 * ONE row, deliberately: the artefact is one file carrying zones, coefficients, overlays,
 * alignments AND the cadastral plan base. Splitting it into per-layer rows would invent a
 * source multiplicity the state does not have.
 */
export const LU_ADAPTER_SOURCES: readonly SiteIntelSource[] = defineSources('LU', [
    {
        id: LU_PAG_SOURCE_ID,
        country: 'LU',
        authority: 'Ministère des Affaires intérieures (Aménagement communal), Grand-Duché de Luxembourg',
        dataset:
            'PAG — "Géométries de tous les PAG «version 2011» en vigueur", one national ' +
            'GeoPackage (27 feature classes, LUREF/EPSG:2169), published on data.public.lu ' +
            '(udata). The layers this adapter reads: PAG_PAG_NQ_PAP (3,017 rows — COS_MIN/MAX, ' +
            'CUS_MIN/MAX, CSS_MAX, DL_MIN/MAX as typed REAL columns + DENOMINATION + the ' +
            'partie-écrite filenames) · PAG_PAG_ZONAGE (46,191 — nationally coded CATEGORIE, no ' +
            'numerics) · PAG_PAG_FOND_DE_PLAN (653,315 — cadastral plan base, NUM_CADAST) · ' +
            'PAG_PAG_ZONES_QE (18,743 existing-quarter zones — ZERO numerics, document-bound). ' +
            'NOT SERVED ANYWHERE IN THE MODEL: max height, setbacks, storey count, and any date ' +
            'axis on the zone layers.',
        // The DATASET record, not the date-stamped artefact: the artefact URL rotates on every
        // refresh and a rotating URL in a registry row is a row that rots by construction.
        endpoint: buildLuPagDatasetUrl(LU_PAG_DATASET_SLUG),
        // REPORT §I closed enum. This is a bulk artefact, and 'bulk' is its exact class — no
        // frozen enum extended, no live service pretended (defineSources PROTOCOL POLICY).
        protocol: 'bulk',
        licence: {
            id: 'CC0 1.0 Universal (data.public.lu licence id "cc-zero")',
            colour: 'GREEN',
            // Confirmed from the licence page itself — see the module header, reads 1-3.
            verifiedDate: '2026-09-01',
            textRef: 'https://creativecommons.org/publicdomain/zero/1.0/',
        },
        accessOption: 1,
        gate: null,
        probes: [
            {
                date: '2026-09-01',
                note:
                    'E7-LU PROBED LIVE AND DOWNLOADED IN FULL (not a capabilities sniff). ' +
                    'Dataset record 200, license "cc-zero", last_update 2026-08-31T02:35:29+00:00, ' +
                    'frequency "continuous", one resource. Artefact ' +
                    `${LU_PAG_ARTEFACT_URL_2026_08_31} → 200, ` +
                    `${LU_PAG_ARTEFACT_BYTES_2026_08_31} bytes, sha256 ` +
                    `${LU_PAG_ARTEFACT_SHA256_2026_08_31}; unzipped 617,377,792 B GeoPackage, ` +
                    'read with sqlite3. 27 feature classes; gpkg_contents srs_id 2169 on all. ' +
                    'INDEPENDENT NATIONAL CENSUS of PAG_PAG_NQ_PAP (n=3,017, 94 communes): ' +
                    'COS_MAX/CUS_MAX/CSS_MAX non-null 3,010 (99.8%), DL_MAX 2,950 (97.8%); all ' +
                    'four maxima non-null 2,950 (97.8%); all four strictly positive 2,826 ' +
                    '(93.7%); minima COS_MIN 46.0% / CUS_MIN 51.6% / DL_MIN 52.5%. Ranges ' +
                    'COS 0–1, CUS 0–10, CSS 0–1, DL 0–500. Zero domain breaches (no negatives, ' +
                    'no COS/CSS > 1, no min > max). ' +
                    'CORRECTION TO E5-B §A-13: the 12 COS_MAX=0 rows are NOT "all ZAD" — 3 name ' +
                    'ZAD, 5 name "voirie", 1 "(Partie SPEC)", 3 neither. ' +
                    'CORRECTION TO THE PARCEL-JOIN CLAIM: FOND_DE_PLAN.NUM_CADAST is the literal ' +
                    'string "N/A" on 31,777 rows (4.9%) and is NOT unique — 15,110 duplicate ' +
                    '(CODE_COM, NUM_CADAST) groups over 621,538 real ids; the cadastral SECTION ' +
                    'that would disambiguate it is not served. xtf_id IS unique ' +
                    '(653,315/653,315 and 3,017/3,017). ' +
                    'NO LIVE QUERY SERVICE EXISTS: wfs.geoportail.lu returns 000/0 bytes; the ' +
                    'opendata WMS GetCapabilities (200, 49,503 B, 58 layers) carries no PAG ' +
                    'layer; every geoportail ogcServers entry declares wfsSupport false.',
            },
        ],
        theme: 'planning',
        coverage:
            'national, 94 communes in the numeric layer. SPATIALLY PARTIAL BY DESIGN: the ' +
            'coefficients exist for the 3,017 "nouveau quartier" PAP zones only; the 18,743 ' +
            'existing-quarter zones carry none.',
        updateFrequency: 'continuous (portal-declared); observed refresh 2026-08-31',
        adapterStatus: 'live',
    },
]);

/**
 * Endpoints this adapter actually calls, paired with the registry row that documents each — the
 * assertion a test can make that no endpoint is reached without a registered, probed row behind
 * it ("committed ≠ reachable" applied to sources).
 */
export const LU_ADAPTER_ENDPOINT_BINDINGS: readonly {
    readonly sourceId: string;
    readonly endpoint: string;
}[] = [{ sourceId: LU_PAG_SOURCE_ID, endpoint: buildLuPagDatasetUrl(LU_PAG_DATASET_SLUG) }];

/**
 * DK's `assertEndpoint()` drift guard, copied (E7-FAMILY §6 C): a comment claiming the client
 * and the registry pin the same endpoint is exactly the class of claim that rots, so it is a
 * MODULE-LOAD throw naming BOTH strings.
 */
function assertLuEndpoint(sourceId: string, clientEndpoint: string): void {
    const row = LU_ADAPTER_SOURCES.find((s) => s.id === sourceId);
    if (row === undefined) {
        throw new Error(
            `[lu-sources] endpoint drift: no registry row '${sourceId}' exists to pin ` +
                `'${clientEndpoint}' against`,
        );
    }
    if (row.endpoint !== clientEndpoint) {
        throw new Error(
            `[lu-sources] endpoint drift: row '${sourceId}' pins '${String(row.endpoint)}' but ` +
                `the client calls '${clientEndpoint}' — one of the two moved without the other`,
        );
    }
}

for (const binding of LU_ADAPTER_ENDPOINT_BINDINGS) {
    assertLuEndpoint(binding.sourceId, binding.endpoint);
}
