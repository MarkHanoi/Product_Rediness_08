// LANE DK (E1 verdict §G DK-parallel · plan E6) · source discovery: the §J
// `sources(): SourceDescriptor[]` leg for Denmark.
//
// ── NO SECOND REGISTRY (C84 EI-9 · the non-rivalry register) ─────────────────────────────
// An earlier draft of this file MINTED its own `SiteIntelSource` rows here, including a row
// whose id was `dk-plandata-wfs` — the SAME id `sourceRegistry/dk.ts` already carries, with
// different dataset text and a different probe log. Two definitions of one source id, only
// one of them reachable through `SOURCE_REGISTRY`, is precisely how one concept grows two
// names. This file therefore RESOLVES rows out of the registry and mints nothing: the DK
// rows (and this lane's dated 2026-09-01 probes) live in `sourceRegistry/dk.ts`, exactly as
// EE's rows live in `countryAdapters/ee/eeSources.ts` and are consumed by the registry —
// one authority per country, whichever side it sits on.
//
// THE KEYLESS RE-PIN (lane 2 §DK-1 correction, live re-probed 2026-09-01): the DK critical
// path is KEYLESS end-to-end — the GEOGRAPHIC-ROLLOUT-MASTER-TRACKER §5 row's "Keyed — the
// template for every keyed source" is half-stale. Plandata's GeoServer WFS
// (`geoserver.plandata.dk`) needs no registration and no token, and the parcel step runs
// keyless via DAWA (`api.dataforsyningen.dk/jordstykker`). Only Datafordeler services
// (BBR / Matriklen / GeoDanmark / DHM) sit behind the free self-service key — those rows are
// in the same registry module and are NOT part of this adapter's critical path.

import type { SiteIntelSource } from '@pryzm/schemas';
import { DK_SOURCES } from '../../sourceRegistry/dk.js';
import { DK_DAWA_BASE, DK_PLANDATA_WFS_ENDPOINT } from './dkPlandataClient.js';

/**
 * The Plandata source-row id — the `source` every minted DK Plan cites
 * (`SiteIntelPlan.source` → `SiteIntelSource.id`). ONE spelling, resolved out of the
 * registry below; a second spelling would be a rival identity.
 */
export const DK_PLANDATA_SOURCE_ID = 'dk-plandata-wfs';

/** The DAWA keyless parcel side-door row id. */
export const DK_DAWA_SOURCE_ID = 'dk-dawa-jordstykker';

/**
 * Resolve one registry row by id, failing BY NAME at module load if the registry no longer
 * carries it — an adapter that cites a source id nothing serves is the dangling-reference
 * defect the R1 referent contract exists to stop, and a build error is where it belongs.
 */
function dkRegistryRow(id: string): SiteIntelSource {
    const row = DK_SOURCES.find((r) => r.id === id);
    if (!row) {
        throw new Error(
            `[dk-adapter] source row '${id}' is not in sourceRegistry/dk.ts — the DK adapter ` +
                'resolves its sources from the registry and mints none; seed the row there ' +
                '(one authority per source), never re-mint it here.',
        );
    }
    return row;
}

/**
 * Endpoint DRIFT GUARD, executed at module load. The client pins the endpoints it actually
 * GETs; the registry records what the source registry claims. When those two disagree, one
 * of them is lying to a reader — so the disagreement is a build error naming both strings,
 * not a comment asserting they match (the "SAME endpoint the proxy pins" class of claim is
 * exactly what rots).
 */
function assertEndpoint(row: SiteIntelSource, pinned: string): SiteIntelSource {
    if (row.endpoint !== pinned) {
        throw new Error(
            `[dk-adapter] endpoint drift on '${row.id}': registry says '${row.endpoint}', the ` +
                `client pins '${pinned}'. One re-pin, both places, or the registry is fiction.`,
        );
    }
    return row;
}

/** The Plandata WFS row — keyless (`gate: null`), with this lane's dated live probes. */
export const DK_PLANDATA_SOURCE: SiteIntelSource = assertEndpoint(
    dkRegistryRow(DK_PLANDATA_SOURCE_ID),
    DK_PLANDATA_WFS_ENDPOINT,
);

/** The DAWA keyless parcel row. */
export const DK_DAWA_SOURCE: SiteIntelSource = assertEndpoint(
    dkRegistryRow(DK_DAWA_SOURCE_ID),
    `${DK_DAWA_BASE}/jordstykker`,
);

/**
 * The §J `sources()` answer for Denmark: the two rows of the KEYLESS critical path, in chain
 * order (parcel, then plan). Both are the registry's own row objects — same identity, same
 * probe log, no copy that can drift.
 */
export const DK_ADAPTER_SOURCES: readonly SiteIntelSource[] = Object.freeze([
    DK_DAWA_SOURCE,
    DK_PLANDATA_SOURCE,
]);
