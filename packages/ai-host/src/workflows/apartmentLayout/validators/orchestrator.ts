// Apartment-layout VALIDATOR ORCHESTRATOR.
//
// Runs the 16 shipped validator slices in ONE pass on a single
// `ApartmentLayoutForValidation`:
//
//   Dimensional (G-class):
//     G-1 area-max         · G-2 width-max     · G-3 aspect-ratio
//     G-5 wall-usability   · G-6 circulation-width · G-7 frontage
//     G-8 hierarchy        · G-10 lighting
//
//   Topology (A-class):
//     A-1 mandatory adjacency   · A-2 preferred adjacency
//     A-3 forbidden adjacency   · A-4 privacy gradient
//     A-5 acoustic separation   · A-6 wet-cluster
//     A-7 frontage-topology     · A-8 sequencing
//
// Returns ONE aggregated, FROZEN report (`AggregatedViolationReport`) — two
// parallel violation arrays + three aggregate counts + a per-class tally.
//
// Architectural contract:
//   • PURE — no I/O, no closures over mutable state, no DOM, no THREE.
//   • POJO inputs/outputs — consistent with the validators themselves.
//   • NO `@pryzm/schemas` dep, NO mutation of inputs.
//   • Per-validator order is fixed (G-1 → G-2 → ... → G-10 → A-1 → ... → A-8)
//     so the report surfaces violations in a stable, test-pinnable sequence.
//   • The same edge can fire MULTIPLE classes (e.g. kitchen↔bedroom is BOTH
//     A-3 error AND A-5 warning by design — see `acousticSeparation.ts`
//     header). The orchestrator preserves this co-firing — both entries
//     appear in `topology`, and both contribute to the per-class tally.

import type { DimensionalViolation } from './dimensional/types.js';
import type { TopologyViolation } from './topology/types.js';
import {
    validateAreaMax,
    validateAspect,
    validateCirculationWidth,
    validateFrontage,
    validateHierarchy,
    validateLighting,
    validateWallUsability,
    validateWidthMax,
} from './dimensional/index.js';
import {
    validateAcousticSeparation,
    validateForbiddenAdjacency,
    validateFrontageTopology,
    validateMandatoryAdjacency,
    validatePreferredAdjacency,
    validatePrivacyGradient,
    validateSequencing,
    validateWetCluster,
} from './topology/index.js';
import type {
    AggregatedViolationReport,
    ApartmentLayoutForValidation,
} from './orchestrator-types.js';

/**
 * Run the 16 shipped validators on a single apartment layout.
 *
 * Returns a FROZEN `AggregatedViolationReport`. The two violation arrays
 * (`dimensional`, `topology`) are themselves frozen — calling `.push()` on
 * either throws in strict mode and silently no-ops in sloppy mode.
 *
 * Determinism: same `(rooms, edges)` ⇒ same report. The per-validator
 * ordering inside each array follows the underlying validator's emit order
 * (rooms-array order or edges-array order, per the validator's contract).
 */
export function validateApartmentLayout(
    input: ApartmentLayoutForValidation,
): AggregatedViolationReport {
    // ── Dimensional (G-class) — 8 validators, fixed order ───────────────────
    // Each validator reads only the fields it cares about from
    // ApartmentLayoutRoom; the superset shape feeds all eight unchanged.
    // `glazedAreaM2` (G-10) and the apartment-level relational rule (G-8)
    // are read from the same ApartmentLayoutRoom superset — no projection.
    const dimensional: DimensionalViolation[] = [
        ...validateAreaMax(input.rooms),
        ...validateWidthMax(input.rooms),
        ...validateAspect(input.rooms),
        ...validateWallUsability(input.rooms),
        ...validateCirculationWidth(input.rooms),
        ...validateFrontage(input.rooms),
        ...validateHierarchy(input.rooms),
        ...validateLighting(input.rooms),
    ];

    // ── Topology (A-class) — 8 validators, fixed order ──────────────────────
    // Topology validators take rooms as `{ id, type }` (A-7 additionally
    // reads `hasExteriorEdge`). Our richer rooms satisfy those shapes
    // structurally, so we pass input.rooms through directly — no projection.
    // A-8 (sequencing) requires the apartment's entrance vertex id; the
    // orchestrator SKIPS the validator when `entranceRoomId` is undefined
    // (sequencing without an entrance is meaningless).
    const topology: TopologyViolation[] = [
        ...validateMandatoryAdjacency(input.rooms, input.edges),
        ...validatePreferredAdjacency(input.rooms, input.edges),
        ...validateForbiddenAdjacency(input.rooms, input.edges),
        ...validatePrivacyGradient(input.rooms, input.edges),
        ...validateAcousticSeparation(input.rooms, input.edges),
        ...validateWetCluster(input.rooms, input.edges),
        ...validateFrontageTopology(input.rooms),
        // A-8 requires entranceRoomId — SKIP if not provided.
        ...(input.entranceRoomId !== undefined
            ? validateSequencing({
                rooms: input.rooms,
                edges: input.edges,
                entranceRoomId: input.entranceRoomId,
            })
            : []),
    ];

    // ── Aggregate counts + per-class tally ──────────────────────────────────
    let errors = 0;
    let warnings = 0;
    const byClass: Record<string, number> = Object.create(null);
    for (const v of dimensional) {
        if (v.severity === 'error') errors++; else warnings++;
        byClass[v.classId] = (byClass[v.classId] ?? 0) + 1;
    }
    for (const v of topology) {
        if (v.severity === 'error') errors++; else warnings++;
        byClass[v.classId] = (byClass[v.classId] ?? 0) + 1;
    }

    return Object.freeze({
        dimensional: Object.freeze(dimensional) as ReadonlyArray<DimensionalViolation>,
        topology: Object.freeze(topology) as ReadonlyArray<TopologyViolation>,
        errors,
        warnings,
        total: dimensional.length + topology.length,
        violationsByClass: Object.freeze(byClass) as Readonly<Record<string, number>>,
    });
}

/**
 * Convenience predicate — TRUE when the layout has zero ERRORS (warnings are
 * allowed). Mirrors the framework's admissibility-gate contract: hard rejects
 * are errors only; warnings are Pareto-soft penalties.
 */
export function passesLegality(report: AggregatedViolationReport): boolean {
    return report.errors === 0;
}

/**
 * One-line human-readable summary of the report (suitable for console /
 * telemetry — the modal renders the full violations list separately).
 *
 * Example: `"3 violations: 2 errors, 1 warning (G-1×1, G-2×1, A-3×1)"`.
 * Empty report: `"0 violations"`.
 */
export function summarise(report: AggregatedViolationReport): string {
    if (report.total === 0) return '0 violations';
    const classKeys = Object.keys(report.violationsByClass).sort();
    const tally = classKeys
        .map(k => `${k}×${report.violationsByClass[k]}`)
        .join(', ');
    const errorWord = report.errors === 1 ? 'error' : 'errors';
    const warnWord = report.warnings === 1 ? 'warning' : 'warnings';
    return `${report.total} violations: ${report.errors} ${errorWord}, ` +
        `${report.warnings} ${warnWord} (${tally})`;
}
