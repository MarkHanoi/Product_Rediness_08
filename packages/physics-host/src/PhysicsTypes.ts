/**
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    Physics — Type Definitions (NEW FILE)
 * Phase:             Phase H — H-1 (Multi-Physics Foundation)
 * Files Modified:    src/physics/types/PhysicsTypes.ts (new)
 * Classification:    A
 *
 * Contract:
 *   docs/00_PRZYM/PRYZM_WORLD_MODEL_MASTER_PLAN_2026.md § H-1
 *
 * All physics types are pure data — no imports, no side effects.
 * Three result types (Thermal, Acoustic, Daylight) + a composite RoomPhysicsResult.
 */

/**
 * MIGRATION NOTE (S92-WIRE, 2026-05-01):
 *   Moved from `src/physics/types/PhysicsTypes.ts` → `src/engine/subsystems/physics/types/PhysicsTypes.ts`
 *   Reason: Intra-src consolidation: physics type definitions → engine subsystems
 *   Per `02-ARCHITECTURE.md §8` convergence boolean row 1 (`legacy_src_folders == 1`).
 *   Package promotion deferred to Wave 11 (`15-PACKAGE-POPULATION-GAP.md §3`).
 */

// ── Thermal ────────────────────────────────────────────────────────────────────

export type ThermalClass = 'cold' | 'cool' | 'comfortable' | 'warm' | 'hot';

export interface ThermalResult {
    /** Estimated peak solar/internal heat gain in W/m². */
    thermalLoad_Wm2: number;
    /** Qualitative thermal class derived from thermalLoad_Wm2. */
    thermalClass: ThermalClass;
    /** Estimated glazing ratio (window area / floor area). 0–1. */
    glazingRatio: number;
    /** Estimated number of windows contributing to glazing ratio. */
    windowCount: number;
}

// ── Acoustic ───────────────────────────────────────────────────────────────────

export type AcousticClass = 'excellent' | 'good' | 'acceptable' | 'poor' | 'reverberant';

export interface AcousticResult {
    /** Sabine reverberation time in seconds (T60). */
    rt60_s: number;
    /** Qualitative acoustic class derived from rt60_s and occupancy. */
    acousticClass: AcousticClass;
    /** Room volume used in the Sabine calculation (m³). */
    volume_m3: number;
    /** Total acoustic absorption area used (Sabine, m²). */
    totalAbsorption_m2: number;
}

// ── Daylight ───────────────────────────────────────────────────────────────────

export type DaylightClass = 'excellent' | 'good' | 'marginal' | 'poor';

export interface DaylightResult {
    /** Daylight factor as a percentage (window area / floor area × 0.8 × transmission × 100). */
    daylightFactor_percent: number;
    /** Qualitative daylight class derived from daylightFactor_percent. */
    daylightClass: DaylightClass;
    /** Estimated glazing area used (m²). */
    glazingArea_m2: number;
    /** Floor area used in calculation (m²). */
    floorArea_m2: number;
}

// ── Composite ─────────────────────────────────────────────────────────────────

export interface RoomPhysicsResult {
    roomId:    string;
    computedAt: number;
    thermal:  ThermalResult  | null;
    acoustic: AcousticResult | null;
    daylight: DaylightResult | null;
}

// ── Cache map ─────────────────────────────────────────────────────────────────

export type PhysicsResultCache = Map<string, RoomPhysicsResult>;

// ── Overlay mode ──────────────────────────────────────────────────────────────

export type PhysicsOverlayMode = 'off' | 'thermal' | 'acoustic' | 'daylight';
