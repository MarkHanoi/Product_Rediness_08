// PHASE 2 — HeightProfile (L0, pure Zod). See
// docs/04-reference/CONTEXT-SCENE-COMPILER-AND-TERRAIN-NORTH-STAR.md §6.2 + §6.6 (C-CONTEXT draft).
//
// WHY A PROFILE, NEVER A BARE `height_m`
// --------------------------------------
// Jurisdictions define "building height" differently — to the ridge, to the parapet, to the eaves,
// or to an averaged roof plane. A single scalar cannot serve a regulation-aware envelope solver
// (C58): it silently commits to ONE definition and is wrong everywhere that definition does not
// apply. The HeightProfile stores the family of measurements a LiDAR nDSM run (§6.4) — or a lesser
// source — can produce, so the consumer picks the field its jurisdiction actually regulates on.
//
// THE HONESTY GATE (the load-bearing invariant — §6.6 C-CONTEXT §3, mirrors C57 §1.4 / C58 §1.6):
//   • `provenance` and `confidence` are MANDATORY. A height with no stated origin and no stated
//     confidence MUST NOT ship — a guess that cannot be told apart from a measurement is the exact
//     failure this schema exists to prevent (see §CONTEXT-DATA-HONESTY; contextBuildings.ts L-459).
//   • Robust statistics only. `roof_p90_m` / `roof_median_m` are the canonical roof heights;
//     `roof_peak_m` is retained for diagnostics but is NEVER the building height (chimneys/antennae).
//   • The measurements are `.nullable()` because a low-tier source (an OSM tag, a floor count) simply
//     does not know them — null is the honest "not measured", distinct from a fabricated number.
//   • `provenance`/`source`/`confidence`/`algorithm_version` are ALWAYS present: every derived value
//     is traceable and versioned, never overwritten (bump `algorithm_version`, append — §6.0).
//
// L0 PURITY: this file imports only `zod`. No I/O, no THREE, no DOM (P5 / L0). It is the canonical
// height datum; per §6.6 invariant 1 no downstream consumer stores a bare `height_m`.

import { z } from 'zod';

/**
 * Roof form, coarse enough to be recoverable from an nDSM roof-plane RANSAC (§6.4 stage 10) or a
 * national LoD2 `roofType`, and rich enough to drive the procedural LoD200 mesh generators (§6.5).
 * `unknown` is a first-class honest value — an OSM tag or a floor count says nothing about the roof.
 */
export const RoofTypeSchema = z.enum([
    'flat',
    'gable',
    'hip',
    'shed',
    'complex',
    'unknown',
]);
export type RoofType = z.infer<typeof RoofTypeSchema>;

/**
 * How the height was obtained — the honesty tier, strongest first. Aligns with the confidence
 * hierarchy in CONTEXT-LOD-BUILD-PLAN.md §0 and the shipped `heightProvenance`
 * (`tagged`/`derived-levels`/`assumed`) in `apps/editor/src/ui/geospatial/contextBuildings.ts`.
 *
 *   'lidar_ndsm'    — measured from a DSM−DTM run under the eroded footprint (§6.4). Top tier.
 *   'national_lod2' — a national LoD2 measured height (3DBAG roof, LoD2-DE measuredHeight, CH solid).
 *   'national_lod1' — a national LoD1 measured height (BD TOPO `hauteur`, GRB ridge, nDSM P90).
 *   'osm_tag'       — an explicit OSM `height`/`building:height` tag. A surveyed-ish number.
 *   'levels_x_h'    — a real floor COUNT × an assumed storey height. Count is real; height is ours.
 *   'assumed'       — nothing usable; a default (e.g. 9 m). A FABRICATED number — lowest confidence.
 */
export const HeightProvenanceSchema = z.enum([
    'lidar_ndsm',
    'national_lod2',
    'national_lod1',
    'osm_tag',
    'levels_x_h',
    'assumed',
]);
export type HeightProvenance = z.infer<typeof HeightProvenanceSchema>;

/**
 * The regulation-aware height datum (North Star §6.2). One per context building, keyed externally on
 * the footprint's stable id (Overture building id / OSM id / cadastral ref — held by the caller).
 *
 * Field families:
 *   ground / roof        — the raw surface measurements (nDSM), all nullable = "not measured".
 *   building_height_m    — the canonical scalar: P90 roof − ground (the value a legacy scalar wanted).
 *   height_to_{...}      — the jurisdiction-specific definitions C58 reads per its rule pack.
 *   roof_type / pitch    — roof form for LoD2 mesh generation + pitch-aware height reasoning.
 *   floors_est           — best floor-count estimate (from a tag, a register, or height ÷ storey).
 *   confidence/provenance/source/epoch/algorithm_version — the MANDATORY honesty + reproducibility block.
 */
export const HeightProfileSchema = z.object({
    // ── raw surface measurements (nDSM; null when the source cannot measure them) ────────────────
    /** Terrain datum (m ASL) under the footprint — the perimeter-DTM plane fit (§6.4 stage 11 / Phase 3). */
    ground_elevation_m: z.number().nullable(),
    /** Trimmed-median roof height (m ASL). Robust; never the max. */
    roof_median_m: z.number().nullable(),
    /** 90th-percentile roof height (m ASL). The canonical robust roof statistic. */
    roof_p90_m: z.number().nullable(),
    /** Absolute highest roof return (m ASL). DIAGNOSTIC ONLY — chimneys/antennae live here; never the height. */
    roof_peak_m: z.number().nullable(),

    // ── the canonical height + the jurisdiction-specific definitions ─────────────────────────────
    /** The "canonical" building height (m): typically `roof_p90_m − ground_elevation_m`. */
    building_height_m: z.number().nullable(),
    /** Height to the parapet/top-of-wall (m) — flat-roof jurisdictions regulate on this. */
    height_to_parapet_m: z.number().nullable(),
    /** Height to the ridge (m) — pitched-roof jurisdictions regulate on this. */
    height_to_ridge_m: z.number().nullable(),
    /** Height to the eaves/cornice (m) — many `alçada reguladora`-style rules regulate on this. */
    height_to_eaves_m: z.number().nullable(),

    // ── roof form ────────────────────────────────────────────────────────────────────────────────
    roof_type: RoofTypeSchema,
    /** Dominant roof pitch (degrees) from the RANSAC plane fit; null when flat/unknown. */
    roof_pitch_deg: z.number().min(0).max(90).nullable(),

    // ── floors ─────────────────────────────────────────────────────────────────────────────────
    /** Best estimate of storeys above ground; null when unknown. */
    floors_est: z.number().int().min(0).nullable(),

    // ── THE HONESTY + REPRODUCIBILITY BLOCK (all mandatory) ──────────────────────────────────────
    /** 0..1 — REQUIRED. A profile with no confidence cannot ship (§6.6 C-CONTEXT §3). */
    confidence: z.number().min(0).max(1),
    /** REQUIRED — how the height was obtained. The honesty tier. */
    provenance: HeightProvenanceSchema,
    /** REQUIRED — the dataset id, e.g. 'PNOA_2025' / '3DBAG' / 'BDTOPO_V3' / 'OSM'. */
    source: z.string().min(1),
    /** Acquisition/epoch of the source data (e.g. '2025-04'); null when the source states none. */
    epoch: z.string().nullable(),
    /** REQUIRED — the compiler/algorithm version that produced this profile. Version-stamp, never overwrite. */
    algorithm_version: z.string().min(1),
});
export type HeightProfile = z.infer<typeof HeightProfileSchema>;

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// MAPPING HELPERS (pure; L0). Bridge the shipped `heightProvenance` tri-state and the raw bake fields
// into a minimal, honestly-labelled HeightProfile. These do NOT invent measurements — a scalar height
// maps to `building_height_m` only, with every nDSM field left null.
// ─────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Map the client's shipped `heightProvenance` tri-state (contextBuildings.ts) onto the richer
 * HeightProfile `provenance` enum. `tagged` collapses to `osm_tag` here because that tri-state does
 * NOT distinguish a national measured source from an OSM tag — a national ingest that KNOWS it is
 * 3DBAG/BD TOPO should pass `national_lod1`/`national_lod2` explicitly instead of going through this.
 */
export function heightProvenanceToProfile(
    hp: 'tagged' | 'derived-levels' | 'assumed',
): HeightProvenance {
    switch (hp) {
        case 'tagged':
            return 'osm_tag';
        case 'derived-levels':
            return 'levels_x_h';
        default:
            return 'assumed';
    }
}

/** Nominal confidence per provenance tier — CONTEXT-LOD-BUILD-PLAN.md §0 (a floor, not a measurement). */
export const NOMINAL_CONFIDENCE: Readonly<Record<HeightProvenance, number>> = Object.freeze({
    lidar_ndsm: 0.9,
    national_lod2: 0.9,
    national_lod1: 0.85,
    osm_tag: 0.7,
    levels_x_h: 0.4,
    assumed: 0.1,
});

/**
 * Backfill a MINIMAL, honest HeightProfile from the current bake's scalar fields (a resolved
 * `height` + its `heightProvenance` + optional floor count). Every nDSM measurement is left `null`
 * — this records what we actually have (a single scalar), never fabricates roof geometry, and stamps
 * a mandatory provenance + confidence so the value is legible downstream.
 */
export function minimalProfileFromScalar(input: {
    height_m: number | null;
    heightProvenance: 'tagged' | 'derived-levels' | 'assumed';
    floors?: number | null;
    source: string;
    algorithm_version: string;
    epoch?: string | null;
    confidence?: number;
}): HeightProfile {
    const provenance = heightProvenanceToProfile(input.heightProvenance);
    return {
        ground_elevation_m: null,
        roof_median_m: null,
        roof_p90_m: null,
        roof_peak_m: null,
        building_height_m: input.height_m,
        height_to_parapet_m: null,
        height_to_ridge_m: null,
        height_to_eaves_m: null,
        roof_type: 'unknown',
        roof_pitch_deg: null,
        floors_est: input.floors ?? null,
        confidence: input.confidence ?? NOMINAL_CONFIDENCE[provenance],
        provenance,
        source: input.source,
        epoch: input.epoch ?? null,
        algorithm_version: input.algorithm_version,
    };
}
