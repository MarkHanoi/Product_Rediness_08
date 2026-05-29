// D1.1 — Pre-furnishing dimensional-validator types
// (APARTMENT-DIMENSIONAL-CONSTRAINTS-AND-SPATIAL-PROPORTION-FRAMEWORK-2026-05-29 §9.1).
//
// Pure data + types only — ZERO imports beyond the existing RoomType union, so
// the validators in D2.x can unit-test in plain Node. The values themselves live
// in `roomDimensions.ts` (D1.2); this file just declares the shape.
//
// The framework's 10 constraint classes (G1–G10) split across two structures:
//   • `RoomDimensions`        — per-room hard/soft envelopes (G1–G4 + G6 walls).
//   • `ApartmentDimensions`   — apartment-level gross sanity (§3.1 by bedroom count).
// Furniture-fit (G5) + circulation (G7) + frontage (G8) + hierarchy (G9) + kitchen
// triangle (G10) are runtime-computed against the existing furniture catalogue +
// space-syntax / facade data — they don't need their own data table.

import type { RoomType } from '../types.js';

/**
 * Per-room dimensional envelopes — the data side of validateRoomShape (D2.1).
 * Every field is optional with a sensible undefined → "no constraint" semantics
 * so adding a field to one room doesn't require updating every other.
 *
 * Units: metres (linear), m² (area). `Infinity` ⇒ uncapped.
 */
export interface RoomDimensions {
    readonly type: RoomType;

    // ── G1 Area constraints ───────────────────────────────────────────────────
    /** Hard minimum area (m²) — below this the room is HARD-REJECTED. */
    readonly areaMin: number;
    /** Soft minimum — comfortable lower bound; below penalises. */
    readonly areaComfortableMin: number;
    /** Soft maximum — comfortable upper bound; above penalises. */
    readonly areaComfortableMax: number;
    /** Hard maximum (m²). Above this the room is HARD-REJECTED (no 20 m² bathrooms). */
    readonly areaHardMax: number;

    // ── G2 Width constraints (clear width = smallest navigable dimension) ─────
    /** Hard minimum short side (m). */
    readonly widthMin: number;
    /** Preferred short side range — lower bound; below penalises. */
    readonly widthPreferredMin: number;
    /** Preferred short side range — upper bound; above penalises. */
    readonly widthPreferredMax: number;
    /**
     * Hard maximum short side (m). Only relevant for circulation rooms (corridor
     * never > 1.4 m); Infinity for habitable rooms.
     */
    readonly widthHardMax: number;

    // ── G3 Length constraints ─────────────────────────────────────────────────
    /** Soft maximum long side (m); above penalises. */
    readonly lengthSoftMax: number;
    /** Hard maximum long side (m); above HARD-REJECT. Mainly corridor 12 m cap. */
    readonly lengthHardMax: number;

    // ── G4 Aspect-ratio constraints (long / short) ────────────────────────────
    /** Soft max aspect ratio. Above this penalises (penalty escalates nonlinearly). */
    readonly aspectSoftMax: number;
    /** Hard max aspect ratio (tunnel threshold). Above this HARD-REJECT. */
    readonly aspectHardMax: number;

    // ── G6 Wall usability (minimum uninterrupted wall for furnishing) ─────────
    /**
     * Minimum uninterrupted wall segment length (m). The room must have at least
     * one wall this long that is free of door / window / opening / shaft. Without
     * this, REQUIRED furniture (bed / sofa / wardrobe / vanity / desk) can't anchor.
     */
    readonly usableWallMin: number;
}

/**
 * Apartment-level gross-area sanity (framework §3.1).
 * Indexed by bedroom count. Studio = 0 bedrooms.
 */
export interface ApartmentDimensions {
    readonly bedrooms: number;
    /** Hard minimum gross m² for an apartment of this bedroom count. */
    readonly grossMin: number;
    /** Architectural target. */
    readonly grossTarget: number;
    /** Hard maximum gross m². */
    readonly grossMax: number;
}

/**
 * The two severity tiers a validator returns.
 *
 * HARD-REJECT triggers cause the enumerate.ts pool to drop the candidate BEFORE
 * Pareto. SOFT penalties subtract from the relevant objective axis (D3.4 wires
 * `shapeQuality` / `fitQuality` / `topologyQuality` axes).
 */
export type ValidationSeverity = 'hard' | 'soft';

/**
 * One validation finding. The validators (D2.x) produce arrays of these.
 *
 * `metric` is a machine-readable key ("areaHardMax" / "aspectHardMax" / "usableWallMin" / etc.)
 * the modal D4.x consumes to render per-violation badges (D4.2). `delta` is the
 * fractional penalty applied to the relevant axis when severity = soft.
 */
export interface ValidationFinding {
    readonly roomId: string;
    readonly severity: ValidationSeverity;
    readonly metric: string;
    readonly reason: string;
    /** Penalty contribution in [0, 1]. Only used for soft findings. */
    readonly delta: number;
}

/**
 * The shape returned by every D2 validator.
 *
 * `admissible: false` ⇒ at least one hard finding ⇒ enumerate.ts drops the
 * candidate from the pool BEFORE Pareto.
 */
export interface DimensionalValidation {
    readonly admissible: boolean;
    readonly hardFindings: readonly ValidationFinding[];
    readonly softFindings: readonly ValidationFinding[];
}
