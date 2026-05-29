// T1.1 — Pre-furnishing topology-validator types
// (APARTMENT-DIMENSIONAL-CONSTRAINTS-AND-SPATIAL-PROPORTION-FRAMEWORK-2026-05-29
// Part B §13–§17, §19.1).
//
// Pure data + types only — ZERO imports beyond the existing RoomType union.
// Mirrors Part A's `DimensionalValidation` so the two pre-furnishing layers
// produce structurally identical results and the modal D4 surfacing code can
// render both with one renderer.
//
// The framework's 8 adjacency categories (A1–A8) collapse into THREE
// validators today:
//   • A1 mandatory + A3 forbidden  →  T2.1 / T2.2 (this commit)
//   • A5 acoustic + A6 wet-cluster →  T2.3 / T2.4 (later commits)
//   • A7 frontage + A8 sequence    →  T2.5 / T2.6 (later, shared with Tier 3)
// A2 preferred is already shipped as `programRules.adjacencyPreference`
// (commit `587f7b0`) and feeds the existing `adjacency` objective axis — no
// new validator needed.

import type { RoomType } from '../types.js';

/**
 * The 8 adjacency categories of the framework §13.
 * Used to classify every finding so the modal can group violations.
 */
export type AdjacencyCategory =
    | 'mandatory'       // A1
    | 'preferred'       // A2 (shipped via §ADJACENCY-PREFERENCE)
    | 'forbidden'       // A3
    | 'privacyGradient' // A4
    | 'acoustic'        // A5
    | 'wetCluster'      // A6
    | 'frontage'        // A7
    | 'sequence';       // A8

/**
 * Severity tiers — IDENTICAL to Part A so a single modal-surfacing component
 * renders both dimensional + topology findings.
 */
export type TopologySeverity = 'hard' | 'soft';

/**
 * One topology validation finding.
 *
 * `roomIdA` + `roomIdB` are the two rooms whose RELATIONSHIP failed. For
 * single-room findings (e.g. dead-end corridor serving 1 room) `roomIdB` is
 * omitted. `metric` is the machine-readable key the modal D4.x consumes for
 * per-violation badges + filtering.
 */
export interface TopologyFinding {
    readonly category: AdjacencyCategory;
    readonly severity: TopologySeverity;
    readonly metric: string;
    readonly roomIdA: string;
    readonly roomIdB?: string;
    readonly reason: string;
    /** Penalty contribution in [0, 1]. Only used for soft findings. */
    readonly delta: number;
}

/**
 * The shape returned by every T2 validator. Mirrors `DimensionalValidation`.
 *
 * `admissible: false` ⇒ at least one hard finding ⇒ enumerate.ts drops the
 * candidate from the pool BEFORE Pareto (just like the shape gate).
 */
export interface TopologyValidation {
    readonly admissible: boolean;
    readonly hardFindings: readonly TopologyFinding[];
    readonly softFindings: readonly TopologyFinding[];
}

/**
 * A declared mandatory adjacency — produced by `mandatoryAdjacenciesFor(program)`
 * given the program. Example: `{ a: 'master', b: 'ensuite' }` when
 * `program.masterEnSuite === true`. The validator (T2.1) checks every entry
 * against the realised wall-bounding + door set.
 *
 * The pair is UNORDERED — `a ↔ b` is treated identically to `b ↔ a`.
 */
export interface MandatoryAdjacency {
    readonly a: RoomType;
    readonly b: RoomType;
    /** Required link kind: `'door'` ⇒ a doorway between the two rooms;
     *  `'adjacent'` ⇒ shared wall but not necessarily a door (e.g. corridor
     *  spine constraints). For today's master↔ensuite + spine↔bedroom path,
     *  `'door'`. */
    readonly via: 'door' | 'adjacent';
    /** Stable identifier for tests + modal badge text. */
    readonly id: string;
}
