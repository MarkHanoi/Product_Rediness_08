// E7-LU — LUXEMBOURG (LU) · the ONE impure seam. Endpoints, measured quirks,
// `FetchOutcome`-classified fetch, pure URL builders. Knows NOTHING about rules
// (E7-FAMILY §6 A).
//
// ══ WHY THIS SEAM LOOKS DIFFERENT FROM ee/lt/pl — MEASURED, NOT ASSUMED ═════════════════════
// EE/LT/PL each talk to a live queryable service (WFS / ArcGIS-REST / GML-over-HTTP).
// **Luxembourg has no such service for the PAG, and that was established by probing, not by a
// page's silence** (the `[[getcapabilities-is-not-an-inventory]]` discipline, inverted — here
// the capabilities document is the evidence of ABSENCE):
//
//   • `wfs.geoportail.lu` — DNS resolves, every request 2026-09-01 returned **000 / 0 bytes**
//     (no TLS answer). Not a WFS.
//   • `https://wms.geoportail.lu/opendata/service?SERVICE=WMS&REQUEST=GetCapabilities` — **200,
//     49,503 bytes, 58 `<Layer>` elements read in full**. It carries orthophotos, topo maps,
//     basemaps, `parcels`, `cadastre`, `addresses`, admin limits and LiDAR. It carries
//     **NO PAG layer of any kind** — no zoning, no NQ-PAP, no degré d'utilisation du sol.
//   • `https://apiv3.geoportail.lu/themes` / `apiv4` / `map.geoportail.lu/themes` — **200**,
//     and every `ogcServers` entry declares **`"wfsSupport": false`**. The portal's own config
//     says no feature service exists behind it.
//
// ⇒ The PAG is served as a **BULK ARTEFACT** — one national GeoPackage — which is exactly the
// `SourceProtocol` value `'bulk'` the frozen REPORT §I enum already carries. No rival transport
// class was minted, and no live endpoint is pretended.
//
// ══ WHAT IS LIVE HERE, AND WHAT IS A PORT ══════════════════════════════════════════════════
// TWO things, deliberately separated so the honest half stays honest:
//
//   1. **`fetchLuPagManifest` — GENUINELY LIVE and cheap.** It reads the data.public.lu dataset
//      record (a ~4.6 KB JSON) and returns the CURRENT artefact URL, byte size, publication
//      timestamp and licence id. This is the freshness + licence + provenance leg, and it is
//      the only network call this adapter makes. Probed live 2026-09-01: HTTP 200,
//      `license: "cc-zero"`, `last_update: "2026-08-31T02:35:29+00:00"`, one resource
//      `pag.gpkg.zip`, `filesize` **259,912,001**.
//
//   2. **`LuPagGpkgReader` — an injected PORT, not an implementation.** Reading a
//      617,377,792-byte SQLite/GeoPackage file needs a SQLite driver. `@pryzm/site-parcel-data`
//      is an L2 pure package (`package.json`: "Deterministic (byte-identical output), no
//      THREE/DOM/I-O/RNG") and adding a native SQLite dependency to it would be a scope
//      expansion this lane has no mandate for (E4 control 10). So the adapter DECLARES the four
//      queries it needs and the row shapes it expects; a host supplies the reader. The queries
//      are named exactly as the GeoPackage's own tables, so there is no translation layer to
//      drift.
//
// ⛔ NO SECOND RETRY LADDER. `src/net/retryWhileUnreachable.ts` exists, is `FetchOutcome`-typed
// and is tested. This module does **not** retry: its one network call is a single small JSON GET
// whose failure is already classified `transient` and is therefore retryable by that shared
// ladder at the call site. Saying so explicitly is the convention (E7-FAMILY §6 B).
//
// ⛔ NO RIVAL OUTCOME TYPE. `FetchOutcome` / `fetchFound` / `fetchAbsent` / `fetchTransient` come
// from `@pryzm/schemas`; refusal prefixes are the L0 vocabulary (`endpoint-unreachable:`,
// `upstream-failed:`, `no-feature:`, `no-parcel:`, `mapper-refused:`).

import {
    fetchAbsent,
    fetchFound,
    fetchTransient,
    type FetchOutcome,
} from '@pryzm/schemas';
import { LU_NATIVE_CRS } from './luJurisdiction.js';

/* ═══════════════════════════════ endpoints ══════════════════════════════════ */

/** data.public.lu — the national open-data portal API root (udata). */
export const LU_DATA_PUBLIC_API = 'https://data.public.lu/api/1';

/**
 * The national PAG dataset slug on data.public.lu. Stable since 2016; the RESOURCE url under it
 * is date-stamped and changes on every refresh, which is exactly why the manifest is fetched
 * rather than a download URL hard-coded (a directory listing is not a download URL — the DE
 * lesson in E5 §E.5, applied).
 */
export const LU_PAG_DATASET_SLUG = 'pag-geometries-de-tous-les-pag-version-2011-en-vigueur';

/** The dataset record URL. Pure builder. */
export function buildLuPagDatasetUrl(slug: string = LU_PAG_DATASET_SLUG): string {
    return `${LU_DATA_PUBLIC_API}/datasets/${encodeURIComponent(slug)}/`;
}

/**
 * The artefact URL observed on 2026-09-01. Recorded for the drift guard in `luSources.ts`
 * ONLY — never fetched directly: it is date-stamped and WILL rot. Resolve through
 * `fetchLuPagManifest`.
 */
export const LU_PAG_ARTEFACT_URL_2026_08_31 =
    'https://download.data.public.lu/resources/pag-geometries-de-tous-les-pag-version-2011-en-vigueur/20260831-023526/pag.gpkg.zip';

/** sha256 of that artefact, computed 2026-09-01 over all 259,912,001 downloaded bytes. */
export const LU_PAG_ARTEFACT_SHA256_2026_08_31 =
    '6d53fda3ce17be37344c23c93fa1d51a7855bf0e05e9f0d275d1ee990c9c15f1';

/** Byte length of that artefact, measured (zipped). The unzipped GeoPackage is 617,377,792 B. */
export const LU_PAG_ARTEFACT_BYTES_2026_08_31 = 259_912_001;

/* ═══════════════════════════ the GeoPackage tables ══════════════════════════ */

/**
 * The 27 feature classes were enumerated from `gpkg_contents` on 2026-09-01. These four are the
 * ones this adapter reads; the names are the GeoPackage's own, verbatim.
 */
export const LU_PAG_TABLES = {
    /** 3,017 rows — the "nouveau quartier"/PAP zones carrying COS/CUS/CSS/DL. */
    nqPap: 'PAG_PAG_NQ_PAP',
    /** 46,191 rows — base zoning, nationally coded `CATEGORIE`. No numerics. */
    zonage: 'PAG_PAG_ZONAGE',
    /** 653,315 rows — the cadastral plan base, `NUM_CADAST`. */
    fondDePlan: 'PAG_PAG_FOND_DE_PLAN',
    /** 18,743 rows — existing-quarter zones. Zero numerics, document-bound. */
    zonesQe: 'PAG_PAG_ZONES_QE',
} as const;

/* ═════════════════════════════ served row shapes ════════════════════════════ */

/** A GeoJSON-shaped geometry exactly as the GeoPackage serves it, in LUREF. Uninterpreted. */
export interface LuServedGeometry {
    readonly type: 'Polygon' | 'MultiPolygon';
    /** GeoJSON coordinates for the type — never reprojected, never re-wound. */
    readonly coordinates: unknown;
}

/**
 * One `PAG_PAG_NQ_PAP` row, columns verbatim (schema read 2026-09-01). `REAL` columns arrive as
 * `number | null`; `TEXT` as `string | null`. Nothing is coerced here — the UNKNOWN
 * discipline lives in the mapper, where its measurement can be cited.
 */
export interface LuNqPapRow {
    readonly id: number;
    /** The INTERLIS transfer id — a UUID, and the ONLY key measured unique (3,017/3,017). */
    readonly xtfId: string;
    /** Commune code, e.g. `'C116'`. 94 distinct across the layer. */
    readonly codeCom: string | null;
    /** The zone's name. NOT a key: 2,845 distinct values over 3,017 rows. */
    readonly denomination: string | null;
    readonly cosMin: number | null;
    readonly cosMax: number | null;
    readonly cusMin: number | null;
    readonly cusMax: number | null;
    readonly cssMax: number | null;
    readonly dlMin: number | null;
    readonly dlMax: number | null;
    /** Written-part (partie écrite) filename, e.g. `'116_PE_PAP_NQ'`. 0 nulls measured. */
    readonly nomFichierEc: string | null;
    /** Schéma directeur — partie écrite filename, or null (367 nulls measured). */
    readonly nomFichierSdEc: string | null;
    /** Schéma directeur — partie graphique filename, or null (1,511 nulls measured). */
    readonly nomFichierSdGr: string | null;
    /** EPSG code the GeoPackage declares for this row (2169 on every row measured). */
    readonly srs: number;
    readonly geometry: LuServedGeometry | null;
}

/** One `PAG_PAG_FOND_DE_PLAN` row — the cadastral plan base. */
export interface LuFondDePlanRow {
    readonly id: number;
    /** UUID; measured unique 653,315/653,315. */
    readonly xtfId: string;
    /**
     * The cadastral number, e.g. `'621/2554'`.
     * ⚠ TWO measured traps, both handled in `luPagProvider.ts`, neither inferred:
     *   • the literal string `'N/A'` appears on 31,777 rows (4.9%) — a SENTINEL, not an id;
     *   • it is NOT unique, even within a commune: 15,110 duplicate `(CODE_COM, NUM_CADAST)`
     *     groups, and `'0'` occurs as a value (16x in C064 alone). The cadastral section that
     *     would disambiguate it is not served by this layer.
     */
    readonly numCadast: string | null;
    readonly codeCom: string | null;
    readonly srs: number;
    readonly geometry: LuServedGeometry | null;
}

/** One `PAG_PAG_ZONAGE` row — the base zone. Carries a national code, never a number. */
export interface LuZonageRow {
    readonly id: number;
    readonly xtfId: string;
    /** National zone category, verbatim (`'HAB_1'`, `'MIX_v'`, `'BEP'`, `'AGR'`…). */
    readonly categorie: string | null;
    /** Sub-genre where the commune sets one; blank/absent on 44,037 of 46,191 rows. */
    readonly genre: string | null;
    readonly nomFichier: string | null;
    readonly codeCom: string | null;
    readonly srs: number;
    readonly geometry: LuServedGeometry | null;
}

/** An axis-aligned envelope in LUREF / EPSG:2169 metres. */
export interface LuLurefEnvelope {
    readonly minX: number;
    readonly minY: number;
    readonly maxX: number;
    readonly maxY: number;
}

/* ═════════════════════════════ the reader PORT ══════════════════════════════ */

/**
 * The four queries this adapter needs against the downloaded GeoPackage. A host implements it
 * over whatever SQLite binding it already has; the adapter never opens a file.
 *
 * Every method returns rows or throws. Throwing is fine — the providers catch and classify to
 * `FetchOutcome` at the seam, exactly once, so a reader author never has to know the vocabulary.
 */
export interface LuPagGpkgReader {
    /** `PAG_PAG_NQ_PAP` by its transfer id (the unique key). */
    nqPapByXtfId(xtfId: string): Promise<LuNqPapRow | null>;
    /**
     * `PAG_PAG_FOND_DE_PLAN` rows matching a commune code + cadastral number.
     * Returns ALL matches — the caller decides what a multi-match means; collapsing it here
     * would hide the measured 15,110 duplicate groups.
     */
    fondDePlanByNumCadast(codeCom: string, numCadast: string): Promise<readonly LuFondDePlanRow[]>;
    /**
     * `PAG_PAG_NQ_PAP` rows whose GeoPackage R-tree bbox overlaps the given LUREF envelope.
     * ⚠ BBOX, NOT INTERSECTION — see `luPagProvider.ts`; the honesty of that distinction is
     * enforced there, not left to the reader.
     */
    nqPapByBbox(env: LuLurefEnvelope): Promise<readonly LuNqPapRow[]>;
    /** `PAG_PAG_ZONAGE` rows whose R-tree bbox overlaps the envelope. Same bbox caveat. */
    zonageByBbox(env: LuLurefEnvelope): Promise<readonly LuZonageRow[]>;
}

/** Injected dependencies. `fetchImpl` is the ONLY network seam; `reader` the only file seam. */
export interface LuPagDeps {
    readonly fetchImpl?: typeof fetch;
    readonly reader?: LuPagGpkgReader;
}

/* ═══════════════════════════════ the manifest ═══════════════════════════════ */

/** What the live data.public.lu record tells us about the current artefact. */
export interface LuPagManifest {
    readonly datasetSlug: string;
    readonly datasetPage: string;
    /** The licence id data.public.lu serves. Measured `'cc-zero'` 2026-09-01. */
    readonly licenceId: string;
    /** ISO timestamp of the last dataset refresh, verbatim (`'2026-08-31T02:35:29+00:00'`). */
    readonly lastUpdate: string;
    readonly artefactUrl: string;
    readonly artefactBytes: number | null;
    readonly artefactFormat: string | null;
}

/**
 * LIVE: read the dataset record and resolve the current artefact. `FetchOutcome`-classified —
 * a network failure is `transient` and a dataset that serves no gpkg resource is `absent`
 * (failure is not emptiness, §CONTEXT-DATA-HONESTY).
 */
export async function fetchLuPagManifest(
    deps: LuPagDeps = {},
    slug: string = LU_PAG_DATASET_SLUG,
): Promise<FetchOutcome<LuPagManifest>> {
    const url = buildLuPagDatasetUrl(slug);
    const doFetch = deps.fetchImpl ?? fetch;
    let res: Response;
    try {
        res = await doFetch(url, { headers: { accept: 'application/json' } });
    } catch (e) {
        return fetchTransient(
            `endpoint-unreachable: ${url} — ${e instanceof Error ? e.message : String(e)}`,
        );
    }
    if (!res.ok) return fetchTransient(`upstream-failed: ${url} — HTTP ${res.status}`);
    let body: unknown;
    try {
        body = (await res.json()) as unknown;
    } catch (e) {
        return fetchTransient(
            `upstream-failed: ${url} — unparseable JSON: ${e instanceof Error ? e.message : String(e)}`,
        );
    }
    return parseLuPagManifest(body, slug, url);
}

/** PURE: the udata dataset record → a manifest, or a classified refusal. Total; never throws. */
export function parseLuPagManifest(
    body: unknown,
    slug: string,
    url: string,
): FetchOutcome<LuPagManifest> {
    if (body === null || typeof body !== 'object') {
        return fetchAbsent(`no-feature: ${url} — dataset record is not an object`);
    }
    const o = body as Record<string, unknown>;
    const licenceId = typeof o['license'] === 'string' ? o['license'] : null;
    const lastUpdate = typeof o['last_update'] === 'string' ? o['last_update'] : null;
    const page = typeof o['page'] === 'string' ? o['page'] : url;
    if (licenceId === null || lastUpdate === null) {
        return fetchAbsent(
            `no-feature: ${url} — dataset record carries no license/last_update; a source row ` +
                'without a licence colour is exactly the unverified claim the registry forbids',
        );
    }
    const resources = Array.isArray(o['resources']) ? (o['resources'] as unknown[]) : [];
    for (const r of resources) {
        if (r === null || typeof r !== 'object') continue;
        const rr = r as Record<string, unknown>;
        const rUrl = typeof rr['url'] === 'string' ? rr['url'] : null;
        const fmt = typeof rr['format'] === 'string' ? rr['format'] : null;
        if (rUrl === null) continue;
        if (!rUrl.endsWith('.gpkg.zip') && fmt !== 'gpkg.zip' && fmt !== 'gpkg') continue;
        return fetchFound({
            datasetSlug: slug,
            datasetPage: page,
            licenceId,
            lastUpdate,
            artefactUrl: rUrl,
            artefactBytes: typeof rr['filesize'] === 'number' ? rr['filesize'] : null,
            artefactFormat: fmt,
        });
    }
    return fetchAbsent(
        `no-feature: ${url} — dataset serves ${resources.length} resource(s), none of them a ` +
            'GeoPackage. This is an ABSENCE (the publisher changed the artefact), not a failure.',
    );
}

/** The CRS every row of this artefact declares, re-exported so providers need one import. */
export { LU_NATIVE_CRS };
