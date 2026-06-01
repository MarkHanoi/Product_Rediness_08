// A.7.d (Phase A · Sprint 2) — @pryzm/site-validators public surface.
//
// L2 pure-geometry helpers for the C19 Site substrate cross-schema
// validations + the polygon-immutability tamper-detector.
//
// Imported by:
//   - @pryzm/stores site-commands (containment check before
//     site.setFootprint commit; polygon fingerprint set at site.create)
//   - apps/editor Site Inspector UI (renders violation messages)
//   - plugins/ifc-export (hard-fails at export time per C19 §1.6 + C25 §1.4)
//   - L4 renderer (visualises setback-violation overlays per A.8.e)
//
// Strategic context:
//   - docs/02-decisions/contracts/C19-SITE-MODEL-AND-PARCEL.md §1.4 + §1.6 + §2.7
//   - docs/03-execution/plans/master-execution-tracker.md A.7.d

// ── Pure polygon geometry ────────────────────────────────────────────────
export {
    polygonArea,
    polygonSignedArea,
    pointInPolygon,
    pointSegmentDistance,
    pointPolygonEdgeDistance,
    polygonContains,
    polygonFingerprint,
} from './polygonGeometry.js';

// ── C19 §1.6 containment + setback compliance ────────────────────────────
export {
    checkFootprintContainment,
    checkFAR,
    type EdgeClassification,
    type SetbackSpec,
    type ContainmentViolation,
    type ContainmentReport,
    type FARReport,
} from './containment.js';

// ── C19 §2.7 invariant 3 — edge classifications length check ─────────────
export {
    checkEdgeClassifications,
    type EdgeClassificationsCheck,
} from './edgeClassifications.js';
