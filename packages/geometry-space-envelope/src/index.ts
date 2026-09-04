// @pryzm/geometry-space-envelope — the space-envelope geometry subsystem.
//
// §FEAT-SPACE-ENVELOPE (L-12900) · **C114** · ADR-0380 · founder directive
// `STR-ENVELOPE-AS-FIRST-CLASS-ELEMENT`.
//
// ═══════════════════════════════════════════════════════════════════════════════
// WHAT THIS PACKAGE IS
// ═══════════════════════════════════════════════════════════════════════════════
//
// The pure solver behind an AUTHORED spatial volume — the founder's *"basic and
// initial representation of spaces as living entities, aware of their surroundings"*.
// It owns four things and deliberately owns nothing else:
//
//   1. THE PRISM and its derived metrics — and it is the ONE writer of
//      `footprintAreaM2` / `volumeM3` (C114 §2b).
//   2. THE FACE-MOVE PLANNER — move one face along its own normal; the connected
//      faces adapt; a move that would invert the solid REFUSES by name with both
//      numbers. ⭐ AND ITS DRAG HALF (`SpaceEnvelopeFaceDrag`): the projection of a
//      world-space pointer movement onto ONE face's own outward axis. The same
//      function feeds the live preview and the committed edit, which is what stops a
//      preview promising a move the commit then refuses.
//   3. THE AWARENESS RELATIONS — containment, adjacency, stacking, boundary
//      distance — computed ON DEMAND and never stored.
//   4. THE SOLAR JOIN — per-face exposure through `@pryzm/solar-analysis`.
//
// ⛔ IT DOES NOT OWN: the element record (that is `@pryzm/schemas`), the store, the
// commands, or any drawing. A planner that also mutated would make the live drag
// preview and the committed edit two different code paths, and the preview could
// then promise something the commit refuses.
//
// ─── LAYER / PURITY (L2) ────────────────────────────────────────────────────────
// Imports `@opentelemetry/api`, `@pryzm/schemas` (L0), `@pryzm/solar-analysis` (L1)
// and `@pryzm/site-parcel-data` (L2). ⛔ NO THREE (P2), NO DOM, and NO
// `@pryzm/spatial-index` — that package imports THREE, and depending on it would
// cost this one the `node` test environment that makes its verdicts provable.
//
// P8: every exported FUNCTION below carries an OpenTelemetry span, except the small
// pure predicates in `SpaceEnvelopeGeometry` that are called inside spans already
// open — wrapping those would produce a span per polygon vertex and drown the trace.

export {
    describeFaceRef,
    assertNeverSpaceEnvelope,
    MIN_FOOTPRINT_AREA_M2,
    MIN_HEIGHT_M,
    PARALLEL_CROSS_EPSILON,
    SPACE_ENVELOPE_REFUSAL_CODES,
    SPACE_ENVELOPE_REFUSAL_SENTENCE,
    type SpaceEnvelopeCensus,
    type SpaceEnvelopeFaceRef,
    type SpaceEnvelopePrism,
    type SpaceEnvelopeRefusal,
    type SpaceEnvelopeRefusalCode,
    type SpaceEnvelopeRefusalGround,
} from './SpaceEnvelopeTypes.js';

export {
    footprintAreaM2,
    outwardNormal,
    prismVerticalExtent,
    recomputeSpaceEnvelopeMetrics,
    ringCentroid,
    ringIsDegenerate,
    ringIsOnLevelPlane,
    ringSelfIntersects,
    signedFootprintAreaM2,
    spaceEnvelopeFaces,
    type EnvelopePoint,
    type SpaceEnvelopeMetrics,
} from './SpaceEnvelopeGeometry.js';

export {
    computeSpaceEnvelopeFaceMoveCensus,
    planSpaceEnvelopeFaceMove,
    type SpaceEnvelopeFaceMoveCensus,
    type SpaceEnvelopeFaceMoveEntry,
    type SpaceEnvelopeFaceMoveRequest,
} from './SpaceEnvelopeFaceMove.js';

export {
    closestPointOnFaceAxis,
    prismOfSpaceEnvelopeRecord,
    readSpaceEnvelopeFaceDrag,
    spaceEnvelopeFaceAxis,
    spaceEnvelopeFaceCentre,
    type DragVec3,
    type SpaceEnvelopeFaceDragReading,
} from './SpaceEnvelopeFaceDrag.js';

export {
    adjacency,
    assessSpaceEnvelopeContainment,
    boundaryDistance,
    stackRelation,
    type BoundaryDistanceFinding,
    type SpaceEnvelopeAdjacency,
    type SpaceEnvelopeContainmentFinding,
    type SpaceEnvelopeStackRelation,
} from './SpaceEnvelopeRelations.js';

export {
    assertFaceSurfaceCoverage,
    buildSpaceEnvelopeFaceSurfaces,
    spaceEnvelopeFaceSurfaceId,
    spaceEnvelopeGlazing,
    spaceEnvelopeHeatGain,
    SPACE_ENVELOPE_DEFAULT_GLAZED_FRACTION,
    SPACE_ENVELOPE_SOLAR_FRAME_CAVEAT,
    type SpaceEnvelopeFaceSurface,
    type SpaceEnvelopeGlazingAssumption,
} from './SpaceEnvelopeSolar.js';
