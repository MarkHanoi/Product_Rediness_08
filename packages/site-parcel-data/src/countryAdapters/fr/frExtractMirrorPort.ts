// LANE FR-STEP4 — FRANCE (FR) · THE SOURCE SEAM (mirror doctrine, brief §4.1).
//
// THE BRIEF'S ARCHITECTURAL REQUIREMENT, VERBATIM: "Mirror the weekly extract as your
// runtime source; use the API for freshness checks and cache misses only. Implement a direct
// `data.geopf.fr/wfs/ows` fallback using the layer names above."
//
// WHAT THIS MODULE DOES ABOUT IT — AND DELIBERATELY DOES NOT. The weekly-extract mirror is a
// SERVER-INFRASTRUCTURE decision (the national extract is ≈28.6 GB across 31 layers — Phase 0
// measured the manifest; no PostGIS/spatial DB is provisioned anywhere in this deployment).
// That decision belongs to the founder, not to a lane. So the runtime source is built as a
// PORT: `FrExtractSourcePort` is the seam every step-4 read goes through;
// `frApiCartoExtractSource` (API Carto + the direct-WFS fallback) is TODAY'S provider; the
// weekly-extract mirror is the NAMED future implementation of the same port
// (`FR_EXTRACT_MIRROR_DECISION` records its status: FOUNDER-PENDING). Nothing in the chain
// knows which implementation answered — when the mirror lands it is a new adapter behind
// this interface, not a refactor. Silently shipping the API as the permanent architecture
// would contradict the brief; this file is where that non-decision is made explicit.

import type { FetchOutcome } from '@pryzm/schemas';
import {
    frGpuFeaturesAtPointWithFallback,
    frWfsDocUrbaByIdurba,
    type FrFetchDeps,
    type FrGpuFeature,
    type FrGpuPointModule,
} from './frGpuClient.js';

/** The implementations the port names — today's, and the brief-mandated future one. */
export type FrExtractSourceImplementation =
    | 'apicarto-live-with-wfs-fallback'
    | 'weekly-extract-mirror';

/**
 * The ONE seam the no-extraction product reads GPU data through. Both methods classify to
 * `FetchOutcome` — empty and failure stay different values on every implementation.
 */
export interface FrExtractSourcePort {
    /** Which implementation this port instance is (travels into provenance/debugging). */
    readonly implementation: FrExtractSourceImplementation;
    /** All features of one GPU point-queryable module at a WGS84 point. */
    readonly featuresAtPoint: (
        module: FrGpuPointModule,
        lat: number,
        lon: number,
    ) => Promise<FetchOutcome<readonly FrGpuFeature[]>>;
    /** The doc_urba attribute row(s) for one instrument id (ETAT/DATAPPRO home). */
    readonly docUrbaByIdurba: (idurba: string) => Promise<FetchOutcome<readonly FrGpuFeature[]>>;
}

/**
 * TODAY'S provider: API Carto per-point queries with the direct data.geopf.fr WFS fallback
 * (brief §4.1's fallback requirement — layer names in `FR_GPU_WFS_LAYERS`).
 */
export function frApiCartoExtractSource(deps: FrFetchDeps = {}): FrExtractSourcePort {
    return {
        implementation: 'apicarto-live-with-wfs-fallback',
        featuresAtPoint: (module, lat, lon) =>
            frGpuFeaturesAtPointWithFallback(module, lat, lon, deps),
        docUrbaByIdurba: (idurba) => frWfsDocUrbaByIdurba(idurba, deps),
    };
}

/**
 * The mirror decision, recorded as DATA so no reader mistakes today's provider for the
 * architecture. There is deliberately NO runtime `weekly-extract-mirror` implementation in
 * this file — a stub that fabricated outcomes would be worse than an honest absence.
 */
export const FR_EXTRACT_MIRROR_DECISION = {
    status: 'FOUNDER-PENDING' as const,
    requiredBy: 'FR-MODULE-BUILD-BRIEF.md §4.1 (mirror the weekly extract as the runtime source)',
    blockedOn:
        'server infrastructure: the GPU national extract is ≈28.6 GB across 31 layers ' +
        '(ATOM manifest, Phase 0 measured 2026-09-02) and no PostGIS/spatial database is ' +
        'provisioned in this deployment. Provisioning one is a founder infra/cost decision.',
    interim:
        'frApiCartoExtractSource — API Carto live per-point queries with the direct ' +
        'data.geopf.fr WFS fallback. The brief itself names this transport as the ' +
        'freshness/cache-miss path; running it as the ONLY path is the temporary state.',
    futureImplementation: 'weekly-extract-mirror' as const satisfies FrExtractSourceImplementation,
    recordedIn: 'audit/demo-esfrpt/2026-09-02/lane-fr-step4.md (findings §FOUNDER-PENDING)',
} as const;
