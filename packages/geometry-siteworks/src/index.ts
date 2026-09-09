// @pryzm/geometry-siteworks — L2, pure. C116 §10 · ADR-0384.
//
// The SITEWORKS geometry authority: the centreline sweep, the form-hiding footprint
// resolver, the one area answer, and the datum rule inherited from Slab.
//
// ⛔ No THREE (P2), no DOM, no I/O. Imports @pryzm/schemas (L0) and
//    @pryzm/geometry-kernel (L2 anchor) and nothing above.
export {
    sweepCentrelineToRing,
    siteworksFootprintRing,
    siteworksAreaM2,
    siteworksDatum,
    type SweepResult,
    type AreaResult,
    type GroundPoint,
} from './SiteworksGeometry.js';
