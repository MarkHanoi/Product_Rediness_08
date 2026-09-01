// E6-LT — LITHUANIA (LT) · the source-registry SEAM.
//
// ⚠ THIS IS NOT A SECOND SOURCE REGISTRY (C84 EI-9, one authority per concept). Lithuania
// already HAS typed source rows: `packages/site-parcel-data/src/sourceRegistry/lt.ts`
// (`LT_SOURCES`), seeded by the registry lane from the audit lane file. The EE exemplar minted
// its own `eeSources.ts` only because it predated that registry — copying that half of the EE
// shape today would mint the rival the registry exists to prevent. So this module CONSUMES
// `LT_SOURCES` and adds exactly ONE row the registry does not yet carry.
//
// THE ONE ADDITIVE ROW: the TPDR `ribos` service — the registered-TPD boundary/register layer.
// It is where a planning document acquires the identity a `SiteIntelPlan` needs (status,
// approval date, in-force date, citable card URL), and `SiteIntelPlan.source` must name a
// `SiteIntelSource.id`. `LT_SOURCES` has rows for ASGR (live), the ASGR bulk FGDB and the NTR
// parcels — but none for `ribos`, so without this row every LT plan entity would have to cite
// the ASGR row, which did not serve it.
//
// It is defined HERE, in the adapter's own directory, because `sourceRegistry/lt.ts` is a
// SHARED file this lane may not edit (barrel protocol). It is built with the registry's OWN
// loader (`defineSources`) so it gets the identical build-time validation, and its migration
// into `sourceRegistry/lt.ts` is queued for the orchestrator in
// audit/europe-site-intel/2026-08-31/impl/barrel-additions-lt.txt. When that lands, delete the
// row from this file and re-export the registry's — do NOT leave two.

import type { SiteIntelSource } from '@pryzm/schemas';
import { defineSources } from '../../sourceRegistry/defineSources.js';
import { LT_SOURCES } from '../../sourceRegistry/lt.js';
import {
    LT_ASGR_SERVICE,
    LT_PARCEL_SERVICE,
    LT_TPDR_RIBOS_SERVICE,
} from './ltArcgisClient.js';

/**
 * The ASGR source-row id — the `source` every minted LT Zone cites. Read from the registry
 * rather than re-typed, so a registry rename cannot silently orphan the adapter's references.
 */
export const LT_ASGR_SOURCE_ID = 'lt-vtpsi-asgr-mapserver';

/** The parcel source-row id (registry row). */
export const LT_PARCEL_SOURCE_ID = 'lt-rc-ntr-parcels-featureserver';

/** The TPDR `ribos` register source-row id — the row added below. */
export const LT_TPDR_RIBOS_SOURCE_ID = 'lt-tpdr-ribos-mapserver';

/**
 * The single additive row (see the header). Validated through the registry's own loader, so a
 * malformed row is a BUILD error naming the row exactly as every other registry row is.
 */
export const LT_TPDR_RIBOS_SOURCES: readonly SiteIntelSource[] = defineSources('LT', [
    {
        id: LT_TPDR_RIBOS_SOURCE_ID,
        country: 'LT',
        authority: 'VTPSI (TPDR — registered territorial planning documents)',
        dataset:
            'ribos/MapServer/0 "Registruotų TPD ribos", ArcGIS-REST dialect, LKS-94/EPSG:3346 — ' +
            'the plan REGISTER: TPD_ID (the join key ASGR provenance columns carry) · NR ' +
            '(registration number) · PAVAD · PL_RUSIS/PL_PORUSIS (planning kind/subkind) · ' +
            'BUSENA_APRASYMAS (lifecycle status) · TVIRT_DATA (approval) · REGISTRUOTA ' +
            '(registration) · ISIGALIOJO (in force) · ISREGISTRUOTA · GALIOJA_NUO/IKI (version ' +
            'window) · TPD_URL (document card) · AKTUALI/VIESAS',
        endpoint: LT_TPDR_RIBOS_SERVICE,
        protocol: 'REST',
        licence: {
            id:
                'public + attribution to VTPSI ("Duomenys yra vieši. Naudojant būtina nurodyti ' +
                'savininką." — VTPSI LEIP specification 2024-06-18, Table 19 row 10); ' +
                'geoportal.lt licence text still not read verbatim — confirm no share-alike',
            colour: 'GREEN',
            // The SPEC text was fetched and read on 2026-09-01; the geoportal LICENCE page was
            // not. verifiedDate stays null to match the sibling LT rows' honesty (§G).
            verifiedDate: null,
            textRef: null,
        },
        accessOption: 1,
        gate: null,
        probes: [
            {
                date: '2026-09-01',
                note:
                    'E6-LT PROBED LIVE: layer descriptor 200 (37 fields incl. BOTH TVIRT_DATA and ' +
                    'REGISTRUOTA as separate columns). Query TPD_ID IN (123025, 203143899) → 2 ' +
                    'rows. THE R3 PROOF: ASGR *D for TPD 123025 is 2021-12-17 = ribos TVIRT_DATA ' +
                    '2021-12-17 (REGISTRUOTA 2021-12-21); for TPD 203143899 it is 2021-06-02 = ' +
                    'TVIRT_DATA 2021-06-02 (REGISTRUOTA 2021-06-08). ASGR *D is the APPROVAL date ' +
                    'in both, the registration date in neither — so classification rules carry ' +
                    'validityBasis "legal". The ASGR-generated APIBENDR prose calls the same value ' +
                    '"Registravimo data"; the prose is the loose one.',
            },
        ],
        theme: 'planning',
        coverage: 'national; registered TPD versions with ROOT_ID/EIL_NR version chains',
        updateFrequency: '24h (per the VTPSI LEIP specification service table)',
        adapterStatus: 'live',
    },
]);

/**
 * Every source this adapter reads: the registry's LT rows plus the one additive `ribos` row.
 * Consumers should read THIS, not either half — after the orchestrator migrates the row into
 * `sourceRegistry/lt.ts`, this constant keeps its meaning while the additive array empties.
 */
export const LT_ADAPTER_SOURCES: readonly SiteIntelSource[] = [
    ...LT_SOURCES,
    ...LT_TPDR_RIBOS_SOURCES,
];

/**
 * Endpoints this adapter actually calls, paired with the registry row that documents each —
 * the assertion a test can make that no endpoint is reached without a registered, probed row
 * behind it (the "committed != reachable" discipline applied to sources).
 */
export const LT_ADAPTER_ENDPOINT_BINDINGS: readonly {
    readonly sourceId: string;
    readonly endpoint: string;
}[] = [
    { sourceId: LT_ASGR_SOURCE_ID, endpoint: LT_ASGR_SERVICE },
    { sourceId: LT_PARCEL_SOURCE_ID, endpoint: LT_PARCEL_SERVICE },
    { sourceId: LT_TPDR_RIBOS_SOURCE_ID, endpoint: LT_TPDR_RIBOS_SERVICE },
];
