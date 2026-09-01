// LANE E7-SE — SWEDEN (SE) · the source-registry SEAM.
//
// ⚠ THIS IS NOT A SECOND SOURCE REGISTRY (C84 EI-9, one authority per concept). The difference
// from LT/DK is that Sweden has **no `sourceRegistry/se.ts` at all**: the registry lane
// DELIBERATELY seeded none, and said why — `sourceRegistry/index.ts:124` records
//   *"L5 sweep SE: graded GREEN (HVD cadastre 2025 CC BY 4.0 + NGP detaljplan API, 236/290
//    kommuner) but no API endpoint URL captured in the prose registries (OAuth2/org-onboarding
//    gate; heightSources.mjs lidar_se endpoint is prose, not a URL) — rows deferred until the
//    endpoint is probed."*
// The endpoints are now probed. All three rows below are therefore ADDITIVE, and every one of them
// is built with the registry's OWN loader (`defineSources`), so a malformed row is a BUILD error
// naming the row exactly as every registry row is. Their migration into a new
// `sourceRegistry/se.ts` — and the correction of that absence line, which is now half wrong — is
// queued for the orchestrator in audit/europe-site-intel/2026-08-31/impl/barrel-additions-se.txt.
// When that lands, delete these rows and re-export the registry's; do NOT leave two.
//
// ⛔ THE ENDPOINT DRIFT GUARD IS COPIED FROM DK (`dk/dkSources.ts:60`, E7-family conventions §6.C):
// a comment claiming the client and the registry pin the same string is exactly the class of
// claim that rots, so it is a module-load throw naming BOTH strings instead.

import type { SiteIntelSource } from '@pryzm/schemas';
import { defineSources } from '../../sourceRegistry/defineSources.js';
import {
    SE_PBK_BASE,
    SE_PBK_PINNED_RELEASE_ID,
    SE_PBK_PINNED_RELEASE_NAME,
    SE_PBK_PINNED_RELEASE_TYPE,
    SE_PBK_PORTAL_CATALOGUE_URL,
} from './seBoverketClient.js';
import { SE_NGP_GATED_ENDPOINTS, SE_NGP_GATE_CODE, SE_NGP_GATE_MESSAGE } from './seNgpGate.js';

/** The Boverket catalogue source-row id — the `source` every minted SE Regulation/Rule cites. */
export const SE_PBK_SOURCE_ID = 'se-boverket-planbestammelsekatalogen-v2';

/** The NGP detaljplan row id (DEFERRED — nothing cites it yet, by design). */
export const SE_NGP_DETALJPLAN_SOURCE_ID = 'se-lantmateriet-ngp-detaljplan';

/** The Lantmäteriet cadastre row id (DEFERRED). */
export const SE_FASTIGHETSINDELNING_SOURCE_ID = 'se-lantmateriet-fastighetsindelning';

/**
 * The Boverket licence, read on the page that publishes the API (2026-09-01):
 * *"Genom öppna data kan alla som vill fritt använda innehållet i databasen. Du har tillstånd att
 * kopiera och distribuera våra öppna data samt göra bearbetningar. Du ska ange Boverket och
 * Planbestämmelsekatalogen som källa."* — a custom national attribution licence, NOT a CC one:
 * free use, copy, redistribute and adapt, attribution to "Boverket och Planbestämmelsekatalogen"
 * required, no share-alike clause present. GREEN.
 */
const SE_BOVERKET_LICENCE = {
    id: 'Boverket öppna data — attribution ("Ange Boverket och Planbestämmelsekatalogen som källa")',
    colour: 'GREEN',
    // The licence TEXT was fetched and read this lane, on the boverket.se open-data page.
    verifiedDate: '2026-09-01',
    textRef: null,
} as const;

/**
 * The Lantmäteriet licence. The 2025 HVD opening is recorded as CC BY 4.0 by the L5 sweep, from
 * Lantmäteriet's own press material — but this lane did NOT fetch and read the licence text
 * (the 401 stopped at the service, not the terms). `verifiedDate: null` is the honest encoding of
 * "recorded from a lane file, not read here", matching the LT rows' discipline.
 */
const SE_LANTMATERIET_LICENCE = {
    id: 'CC-BY-4.0 (Lantmäteriet open/HVD geodata, per L5 sweep 2026-08-31 — text NOT read this lane)',
    colour: 'GREEN',
    verifiedDate: null,
    textRef: null,
} as const;

/** The Lantmäteriet gate string, built from the MEASURED response rather than from prose. */
const SE_NGP_GATE = `Lantmäteriet API-portal client registration + per-product geodata subscription (OAuth2 client-credentials or Basic; apimanager.lantmateriet.se). MEASURED 2026-09-01: HTTP 401 code ${SE_NGP_GATE_CODE} "${SE_NGP_GATE_MESSAGE}"`;

/**
 * The SE rows. Validated through the registry's own loader at module load.
 *
 * ⚠ `protocol` is the REPORT §I CLOSED set {WFS2|OGCAPI|REST|ATOM|bulk} and is FROZEN — it is the
 * coarse transport class, not the dialect. Boverket's Azure-APIM JSON API is `REST`; NGP's
 * OGC API Features services are `OGCAPI`, and the WMS visning door is named verbatim in `dataset`
 * so no fact is lost and no frozen enum is extended (defineSources.ts's own protocol policy).
 */
export const SE_ADAPTER_SOURCES_RAW: readonly SiteIntelSource[] = defineSources('SE', [
    {
        id: SE_PBK_SOURCE_ID,
        country: 'SE',
        authority: 'Boverket',
        dataset:
            `Planbestämmelsekatalogen v2 — the NATIONAL PLANNING-PROVISION CATALOGUE (controlled ` +
            `vocabulary). Release ${SE_PBK_PINNED_RELEASE_ID} "${SE_PBK_PINNED_RELEASE_NAME}", typ ` +
            `"${SE_PBK_PINNED_RELEASE_TYPE}", 3,707 bestämmelser back to 1949, 908 in force. Endpoints: ` +
            `/release/full/platt/{id} (whole catalogue, flat) · /bestammelse/platt/{release}/{uuid} ` +
            `(one provision) · /vd/{bestammelsetyp|anvandningsform|geometrityp|huvudmannaskap|lagstod|` +
            `releasetyp|farg|hilucs|kategori|underkategori|ursprungskategori|symbol|webblank} (closed ` +
            `värdedomäner) · /faltbeskrivning · /changelog/{release}. Serves the DENOMINATOR and the ` +
            `HEIGHT MEASUREMENT BASIS inside bestammelsekod (…AreaProc_BruttoEgen vs …BruttoAnv vs ` +
            `…BruttoFastigh; …_Nockhojd vs …_NockhojdNollplan) — the C63 and L-584 distinctions, ` +
            `served natively as codes.`,
        endpoint: SE_PBK_BASE,
        protocol: 'REST',
        licence: SE_BOVERKET_LICENCE,
        // Option 3 — the 83 in-force numeric provisions are MIRRORED into the adapter as data
        // (sePlanProvisionCatalogue.ts); the live endpoint is kept for the per-provision drift check.
        accessOption: 3,
        gate: null,
        probes: [
            {
                date: '2026-09-01',
                note:
                    `E7-SE DISCOVERY — the E5 finding "no API endpoint URL captured, OAuth2 gate" is ` +
                    `FALSE for the rules vocabulary. ${SE_PBK_PORTAL_CATALOGUE_URL} answers ` +
                    `unauthenticated and lists planbestammelsekatalogenv2 with "subscriptionRequired": ` +
                    `false. GET /release/full/platt/aktuell → HTTP 200, 13,176,663 bytes, NO credentials: ` +
                    `release 7 / 20251201 / typ Juridisk / 3,707 bestämmelser. Census: 908 in force, of ` +
                    `which 83 carry a [x:decimaltal] slot (imported), 825 do not. Five värdedomäner ` +
                    `verified id↔namn against all 3,707 rows: ZERO mismatches.`,
            },
            {
                date: '2026-09-01',
                note:
                    `E7-SE ERROR-SHAPE PROBE (the failure≠absence discriminator this adapter is built ` +
                    `on): a nonexistent uuid → HTTP 404 with a JSON STRING body "Bestämmelse med id … ` +
                    `saknas i aktuell publicerad release." = GENUINE ABSENCE; a wrong path → HTTP 404 ` +
                    `with the APIM object { "statusCode": 404, "message": "Resource not found" }; a ` +
                    `malformed uuid → HTTP 404 with an EMPTY body and no content-type. The last two are ` +
                    `OUR misconfiguration and classify TRANSIENT. Reading !res.ok as transient would ` +
                    `have inverted the first case.`,
            },
            {
                date: '2026-09-01',
                note:
                    `E7-SE DATA-QUALITY: uttrycktvarde has NO /vd/ endpoint and is NOT a closed ` +
                    `codelist — across all 3,707 rows 46 of 271 non-null values (17.0%) are dirt: '00' ` +
                    `×10, '0,0' ×29, '00-00' ×2, 'Mellan' ×2, '0,0/0,0/…' ×1, and 'MIn' ×2 (a casing ` +
                    `typo of 'Min'). Restricted to the 908 in-force rows it is CLEAN {null 824, Min 34, ` +
                    `Max 28, Exakt 22}. Carried verbatim; nothing keys off it.`,
            },
        ],
        theme: 'planning-rule-vocabulary',
        coverage:
            'national, complete — the controlled vocabulary for every Swedish detaljplan; 3,707 ' +
            'provisions 1949→, 908 in force, 83 of those carrying a numeric slot',
        updateFrequency:
            'release-versioned, irregular — 7 releases published 2018-08-01 → 2025-12-01 ' +
            '(20180801, 20201001, 20211014, 20221101, 20240502, 20251201)',
        adapterStatus: 'live',
    },
    {
        id: SE_NGP_DETALJPLAN_SOURCE_ID,
        country: 'SE',
        authority: 'Lantmäteriet (Nationella geodataplattformen)',
        dataset:
            `Detaljplan — the national digital detail-plan dataset: Sökning (OGC API Features, ` +
            `/sokning/v1/detaljplan/v1/search), Visning (WMS, ${SE_NGP_GATED_ENDPOINTS.detaljplanWms}) ` +
            `and Nedladdning. 11,662 plans across 236 of 290 kommuner as of 2025-04; digital form ` +
            `mandated since 2022-01-01 by BFS 2020:5, with bestämmelser keyed to Boverket's ` +
            `Planbestämmelsekatalog. THIS IS WHERE EVERY SWEDISH NUMBER LIVES.`,
        endpoint: SE_NGP_GATED_ENDPOINTS.detaljplanSearch,
        protocol: 'OGCAPI',
        licence: SE_LANTMATERIET_LICENCE,
        accessOption: 1,
        gate: SE_NGP_GATE,
        probes: [
            {
                date: '2026-09-01',
                note:
                    `E7-SE: GET search → HTTP 401 {"code":"900902","message":"Missing Credentials",…}; ` +
                    `GET the WMS GetCapabilities → HTTP 401, BYTE-IDENTICAL body (sha256 ` +
                    `9aed6cff90dc8048401d3b4e88f36394e6a8ee1c3391211ba0b9daff3e1a42e9). Both bodies are ` +
                    `committed at __tests__/fixtures/se-lantmateriet-ngp-2026-09-01/. The gate is ` +
                    `CLIENT REGISTRATION, not licence and not absence: the data is open and CC BY 4.0. ` +
                    `DEFERRED per the brief — a fake client would be worse than none.`,
            },
        ],
        theme: 'planning',
        coverage: '11,662 plans · 236 of 290 kommuner (2025-04); pre-2022 stock stays scanned PDF',
        updateFrequency: 'continuous as kommuner publish; NGP is the single national front door',
        adapterStatus: 'deferred-stub',
    },
    {
        id: SE_FASTIGHETSINDELNING_SOURCE_ID,
        country: 'SE',
        authority: 'Lantmäteriet',
        dataset:
            `Fastighetsindelning — the national cadastre (fastighetsbeteckning + registerkarta ` +
            `geometry), an open HVD dataset since early 2025. Sökning at ` +
            `${SE_NGP_GATED_ENDPOINTS.fastighetsindelningSearch}.`,
        endpoint: SE_NGP_GATED_ENDPOINTS.fastighetsindelningSearch,
        protocol: 'OGCAPI',
        licence: SE_LANTMATERIET_LICENCE,
        accessOption: 1,
        gate: SE_NGP_GATE,
        probes: [
            {
                date: '2026-09-01',
                note:
                    `E7-SE: GET search → HTTP 401 code 900902, body byte-identical to the two detaljplan ` +
                    `doors (same sha256) — ONE gate, three doors. Fixture committed. SEPARATELY, and ` +
                    `NOT a gate: opendata.lantmateriet.se has AAAA only (2001:67c:268c:f110::2063) and ` +
                    `is unreachable from an IPv4-only egress — that is a PRYZM network limitation, ` +
                    `never a Swedish coverage fact, and it is deliberately not encoded as one.`,
            },
        ],
        theme: 'cadastre',
        coverage: 'national, complete',
        updateFrequency: 'continuous (register); HVD bulk + API since 2025',
        adapterStatus: 'deferred-stub',
    },
]);

/**
 * Endpoint DRIFT GUARD, executed at module load — DK's shape (`dk/dkSources.ts:60`). The client
 * pins the endpoints this adapter actually GETs; the rows above record what the registry claims.
 * When those disagree, one of them is lying to a reader, so it is a build error naming BOTH.
 */
function assertEndpoint(row: SiteIntelSource | undefined, id: string, pinned: string): SiteIntelSource {
    if (row === undefined) {
        throw new Error(
            `[se-adapter] source row '${id}' is missing from SE_ADAPTER_SOURCES_RAW — every endpoint ` +
                'this adapter names must have a probed row behind it',
        );
    }
    if (row.endpoint !== pinned) {
        throw new Error(
            `[se-adapter] endpoint drift on '${row.id}': the source row says '${row.endpoint}', the ` +
                `client pins '${pinned}'. One re-pin, both places, or the registry is fiction.`,
        );
    }
    return row;
}

const rowById = (id: string): SiteIntelSource | undefined =>
    SE_ADAPTER_SOURCES_RAW.find((r) => r.id === id);

/** The Boverket catalogue row — the ONE row anything in this adapter currently cites. */
export const SE_PBK_SOURCE: SiteIntelSource = assertEndpoint(
    rowById(SE_PBK_SOURCE_ID),
    SE_PBK_SOURCE_ID,
    SE_PBK_BASE,
);

/** The deferred NGP detaljplan row. */
export const SE_NGP_DETALJPLAN_SOURCE: SiteIntelSource = assertEndpoint(
    rowById(SE_NGP_DETALJPLAN_SOURCE_ID),
    SE_NGP_DETALJPLAN_SOURCE_ID,
    SE_NGP_GATED_ENDPOINTS.detaljplanSearch,
);

/** The deferred cadastre row. */
export const SE_FASTIGHETSINDELNING_SOURCE: SiteIntelSource = assertEndpoint(
    rowById(SE_FASTIGHETSINDELNING_SOURCE_ID),
    SE_FASTIGHETSINDELNING_SOURCE_ID,
    SE_NGP_GATED_ENDPOINTS.fastighetsindelningSearch,
);

/** The §J `sources()` answer for Sweden — the live row first, then the two declared deferrals. */
export const SE_ADAPTER_SOURCES: readonly SiteIntelSource[] = Object.freeze([
    SE_PBK_SOURCE,
    SE_NGP_DETALJPLAN_SOURCE,
    SE_FASTIGHETSINDELNING_SOURCE,
]);

/**
 * Endpoints this adapter names, paired with the row that documents each — the assertion a test can
 * make that no endpoint is reachable without a registered, probed row behind it ("committed ≠
 * reachable", applied to sources).
 */
export const SE_ADAPTER_ENDPOINT_BINDINGS: readonly {
    readonly sourceId: string;
    readonly endpoint: string;
}[] = [
    { sourceId: SE_PBK_SOURCE_ID, endpoint: SE_PBK_BASE },
    { sourceId: SE_NGP_DETALJPLAN_SOURCE_ID, endpoint: SE_NGP_GATED_ENDPOINTS.detaljplanSearch },
    {
        sourceId: SE_FASTIGHETSINDELNING_SOURCE_ID,
        endpoint: SE_NGP_GATED_ENDPOINTS.fastighetsindelningSearch,
    },
];
