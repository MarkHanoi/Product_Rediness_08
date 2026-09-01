// E7-FI — FINLAND (FI) · the source-registry SEAM.
//
// ⚠ THIS IS NOT A SECOND SOURCE REGISTRY (C84 EI-9, one authority per concept). Finland
// already HAS typed source rows: `packages/site-parcel-data/src/sourceRegistry/fi.ts`
// (`FI_SOURCES`), seeded by the registry lane with `fi-mml-kiinteisto-ogcapi` and
// `fi-ryhti-plan-ogcapi`. The EE exemplar minted its own `eeSources.ts` only because it
// predated that registry; copying THAT half of the EE shape today would mint the rival the
// registry exists to prevent. So this module CONSUMES `FI_SOURCES`, asserts the endpoints it
// actually GETs against the registry's own strings, and adds exactly ONE row the registry
// does not yet carry.
//
// THE ONE ADDITIVE ROW: the plan-ATTACHMENT retrieval service
// (`uri.rakennetunymparistontietojarjestelma.fi/planattachmentdocument/<uuid>/file`). It is a
// DIFFERENT host, a different protocol class and a different theme from the plan index, and
// it is the ONLY open route to Finnish plan PROVISIONS (kaavamaaraykset) — the index serves
// none. `FI_SOURCES` has no row for it, so without this one every minted
// `SiteIntelDocument`'s retrieval endpoint would be undocumented and unprobed.
//
// It is defined HERE, in the adapter's own directory, because `sourceRegistry/fi.ts` is a
// SHARED file this lane may not edit (barrel protocol). It is built with the registry's OWN
// loader (`defineSources`) so it gets identical build-time validation, and its migration into
// `sourceRegistry/fi.ts` is queued for the orchestrator in
// audit/europe-site-intel/2026-08-31/impl/barrel-additions-fi.txt. When that lands, delete the
// row from this file and re-export the registry's — do NOT leave two.
//
// ⛔ NOT ADDED HERE, DELIBERATELY: the HSY SeutuRAMAVA remaining-right service
// (`kartta.hsy.fi/geoserver/wfs`). This lane RE-VERIFIED it live (see
// `FI_HSY_SEUTURAMAVA_FINDING` below) but was briefed not to build a second path for it, and
// a source row for an endpoint no code reads is documentation pretending to be a registry.
// The row text is queued in barrel-additions-fi.txt for whoever wires the capacity
// cross-check (control 10: record the discovery, do not expand the scope).

import type { SiteIntelSource } from '@pryzm/schemas';
import { defineSources } from '../../sourceRegistry/defineSources.js';
import { FI_SOURCES } from '../../sourceRegistry/fi.js';
import { FI_RYHTI_ATTACHMENT_BASE, FI_RYHTI_OGCAPI_BASE } from './fiRyhtiClient.js';

/**
 * The Ryhti plan-index source-row id — the `source` every minted FI Plan cites
 * (`SiteIntelPlan.source` -> `SiteIntelSource.id`). ONE constant so the registry row and the
 * minted entities cannot drift apart.
 */
export const FI_RYHTI_PLAN_SOURCE_ID = 'fi-ryhti-plan-ogcapi';

/** The MML cadastre row (registry). Key-gated; this adapter reads no parcel — see index.ts. */
export const FI_MML_PARCEL_SOURCE_ID = 'fi-mml-kiinteisto-ogcapi';

/** The plan-attachment retrieval row added below. */
export const FI_RYHTI_ATTACHMENT_SOURCE_ID = 'fi-ryhti-plan-attachment-documents';

function fiRegistryRow(id: string): SiteIntelSource {
    const row = FI_SOURCES.find((r) => r.id === id);
    if (row === undefined) {
        throw new Error(
            `[fi-adapter] source row '${id}' is not in sourceRegistry/fi.ts — the FI adapter ` +
                'resolves its sources from the registry and mints only what the registry lacks; ' +
                'seed the row there (one authority per source), never re-mint it here.',
        );
    }
    return row;
}

/**
 * Endpoint DRIFT GUARD, executed at module load (the DK `assertEndpoint` shape, adopted
 * deliberately rather than re-invented). The client pins the endpoint it actually GETs; the
 * registry records what the source registry claims. When those disagree, one of them is lying
 * to a reader — so the disagreement is a BUILD error naming both strings, not a comment
 * asserting they match. A comment claiming two strings are equal is exactly the class of claim
 * that rots.
 */
function assertEndpoint(row: SiteIntelSource, pinned: string): SiteIntelSource {
    if (row.endpoint !== pinned) {
        throw new Error(
            `[fi-adapter] endpoint drift on '${row.id}': registry says '${row.endpoint}', the ` +
                `client pins '${pinned}'. One re-pin, both places, or the registry is fiction.`,
        );
    }
    return row;
}

/**
 * The Ryhti plan-index row — keyless (`gate: null`), CC BY 4.0. The registry pins the
 * `/collections` document; the client pins the base it builds `/collections/<id>/items` from,
 * so the guard compares `${base}/collections` against the registry string.
 */
export const FI_RYHTI_PLAN_SOURCE: SiteIntelSource = assertEndpoint(
    fiRegistryRow(FI_RYHTI_PLAN_SOURCE_ID),
    `${FI_RYHTI_OGCAPI_BASE}/collections`,
);

/** The MML cadastre row, verbatim from the registry. Carried for `sources()` completeness. */
export const FI_MML_PARCEL_SOURCE: SiteIntelSource = fiRegistryRow(FI_MML_PARCEL_SOURCE_ID);

/**
 * The single additive row (see the header). Validated through the registry's own loader, so a
 * malformed row is a BUILD error naming the row exactly as every other registry row is.
 */
export const FI_RYHTI_ATTACHMENT_SOURCES: readonly SiteIntelSource[] = defineSources('FI', [
    {
        id: FI_RYHTI_ATTACHMENT_SOURCE_ID,
        country: 'FI',
        authority: 'SYKE (Ryhti — rakennetun ympariston tietojarjestelma)',
        dataset:
            'plan attachment documents — /planattachmentdocument/<uuid>/file, the PDFs the plan ' +
            'index cites in its `documents` field. THE ONLY OPEN ROUTE TO FINNISH PLAN ' +
            'PROVISIONS: measured over all 6,282 valid-plan features, 7,294 attachments, 100% ' +
            'application/pdf, typed by RY_AsiakirjanLaji_YKAK — 5,144 are code 05 "Kaavakartta ' +
            'ja kaavamaaraykset" (plan map AND provisions) and 1,394 are code 04 ' +
            '"Kaavamaaraykset" (provisions alone), i.e. 6,538 of 7,294 (89.6%) carry the ' +
            'kaavamaaraykset. The remainder: 03 Kaavakartta 297 · 06 Kaavaselostus 308 · ' +
            '14 OAS 139 · 99 Muu 11 · 16 Poytakirja 1.',
        endpoint: FI_RYHTI_ATTACHMENT_BASE,
        // REST is the REPORT section-I coarse transport class for a plain HTTP file GET; the
        // exact dialect is named verbatim above, so no fact is lost and no frozen enum is bent.
        protocol: 'REST',
        licence: {
            id: 'CC-BY-4.0 (SYKE avoimet aineistot — same licence as the plan index it is cited from)',
            colour: 'GREEN',
            // The CKAN package text was read verbatim on 2026-09-01 ("Aineisto kuuluu SYKEn
            // avoimiin aineistoihin (CC BY 4.0) avoimen tietosisallon osalta"); the standalone
            // licence PAGE was not opened, so this stays null to match the sibling FI rows.
            verifiedDate: null,
            textRef: null,
        },
        accessOption: 6, // metadata + on-demand retrieval by the uuid the index already serves
        gate: null,
        probes: [
            {
                date: '2026-09-01',
                note:
                    'E7-FI PROBED LIVE, KEYLESS: GET .../planattachmentdocument/' +
                    '54f4e444-b9ab-4547-b458-709b9a6c4747/file (the Kuopio AK-000480 attachment ' +
                    'the index cites as "Kaavakartta ja kaavamaaraykset, 297-31-05-669-1.pdf") ' +
                    '-> HTTP 200, 11,738,411 bytes, content-type application/pdf, magic %PDF-1.4, ' +
                    'no redirect. Coverage measured the same day: 5,375 of 6,282 valid-plan ' +
                    'features (85.6%) carry at least one attachment; 907 carry none, which is ' +
                    'the case-1 emptiness this adapter emits as a tier-6 UNKNOWN rule.',
            },
        ],
        theme: 'planning',
        coverage:
            'follows the plan index — 39 of 308 municipalities (12.66%, vs Tilastokeskus ' +
            'kunta_1_20260101, measured 2026-09-01); 5,375 of 6,282 valid-plan features carry ' +
            '>=1 attachment',
        updateFrequency: null,
        // The URIs are surfaced verbatim on every minted Document and on the provisions rule's
        // source.document; nothing in this wave PARSES a PDF, so the row is not 'live'.
        adapterStatus: 'documented',
    },
]);

/**
 * Every source this adapter knows: the registry's FI rows plus the one additive attachment
 * row. Consumers should read THIS, not either half — after the orchestrator migrates the row
 * into `sourceRegistry/fi.ts`, this constant keeps its meaning while the additive array
 * empties.
 */
export const FI_ADAPTER_SOURCES: readonly SiteIntelSource[] = Object.freeze([
    ...FI_SOURCES,
    ...FI_RYHTI_ATTACHMENT_SOURCES,
]);

/**
 * Endpoints this adapter actually CALLS, paired with the registry row documenting each — the
 * assertion a test can make that no endpoint is reached without a registered, probed row
 * behind it ("committed != reachable", applied to sources).
 *
 * ⚠ `fi-mml-kiinteisto-ogcapi` is deliberately NOT in this list. The FI adapter reads no
 * parcel: `parcelProviders/mmlParcelProvider.ts` is the existing authority for Finnish
 * cadastral parcels and it is key-gated on a self-service `MML_API_KEY` that is unset in this
 * environment. Minting a second FI parcel provider here would be the rival the standing review
 * rule rejects. The row rides `FI_ADAPTER_SOURCES` because `sources()` answers "what does this
 * country have", not "what did this module GET".
 */
export const FI_ADAPTER_ENDPOINT_BINDINGS: readonly {
    readonly sourceId: string;
    readonly endpoint: string;
}[] = Object.freeze([
    { sourceId: FI_RYHTI_PLAN_SOURCE_ID, endpoint: `${FI_RYHTI_OGCAPI_BASE}/collections` },
    { sourceId: FI_RYHTI_ATTACHMENT_SOURCE_ID, endpoint: FI_RYHTI_ATTACHMENT_BASE },
]);

/**
 * HSY SeutuRAMAVA — RE-VERIFIED REACHABLE 2026-09-01, RECORDED, NOT WIRED.
 *
 * The E5 data-reuse report (impl/e5-devpotential-categories.md, section A-1) flagged the
 * Helsinki Region Environmental Services authority's twice-yearly remaining-building-right
 * dataset as the one European artefact that publishes the number PRYZM computes
 * (reserve = rakennusoikeus - kaytetty kerrosala, per block, per use). This lane was briefed
 * to check reachability and NOT to build a second path. Reachability, re-verified live and
 * independently of the E5 probe:
 *
 *   GET https://kartta.hsy.fi/geoserver/wfs?service=WFS&version=2.0.0&request=GetCapabilities
 *     -> HTTP 200, 349,217 bytes, KEYLESS. 26 distinct SeutuRAMAVA layer names, versioned per
 *        half-year, newest `asuminen_ja_maankaytto:SeutuRAMAVA_kortteli_12026`.
 *   GetFeature (count=1, GeoJSON) on that layer -> block `0490100001` (Espoo, kunta 049):
 *        kala 137777 (building right, m2) · karayht 116900 (used floor area) ·
 *        laskvar_yh 27659 (CALCULATED RESERVE) split per use — laskvar_ak 20850 ·
 *        laskvar_y 6809 · laskvar_ap/k/t/nn 0 · rakerayht 8092 (under construction) ·
 *        rekpvm 20251219. Byte-for-byte the payload E5 recorded, from an independent request.
 *
 * ⭐ AND THE FINDING THAT MATTERS MORE THAN REACHABILITY: **the HSY dataset and the Ryhti
 * plan index have an EMPTY INTERSECTION for detail plans.** Measured 2026-09-01 with
 * per-municipality CQL counts against both valid indexes:
 *        Helsinki 091 — detail 0, master 14
 *        Espoo    049 — detail 0, master 15
 *        Vantaa   092 — detail 0, master 0
 *        Kauniainen 235 — detail 0, master 0
 * Not one asemakaava — the instrument that carries rakennusoikeus — exists in the open Ryhti
 * index for any of HSY's four municipalities. So HSY cannot be used to validate a
 * Ryhti-derived Finnish capacity number today: the two datasets do not overlap on a single
 * parcel. Consuming HSY would be a SECOND, INDEPENDENT path (its own service, its own block
 * geometry, its own vocabulary), which is exactly what this lane was told not to build.
 */
export const FI_HSY_SEUTURAMAVA_FINDING = Object.freeze({
    endpoint: 'https://kartta.hsy.fi/geoserver/wfs',
    newestLayer: 'asuminen_ja_maankaytto:SeutuRAMAVA_kortteli_12026',
    reachable: true,
    keyless: true,
    probedDate: '2026-09-01',
    /** Ryhti valid-DETAIL-plan features in each HSY municipality — measured, all zero. */
    ryhtiDetailPlanOverlap: Object.freeze({ '091': 0, '049': 0, '092': 0, '235': 0 }),
    /** Ryhti valid-MASTER-plan features in each HSY municipality — measured. */
    ryhtiMasterPlanOverlap: Object.freeze({ '091': 14, '049': 15, '092': 0, '235': 0 }),
    wired: false,
    reason:
        'briefed as reachability-check only; and the cross-check it would enable is not ' +
        'available anyway — zero detail-plan overlap with the Ryhti index in all four HSY ' +
        'municipalities (measured 2026-09-01)',
} as const);
