// @pryzm/renderer-three — addon re-export: BufferGeometryUtils
//
// Contract C04 §1.1 (P2): sole authorised re-export of three/examples addons.
// Consumers must import from '@pryzm/renderer-three' (barrel) — never directly
// from 'three/examples/jsm/utils/BufferGeometryUtils.js'.
//
// Wave A15 S119 — Class A1 violation closure.
export {
    mergeGeometries,
    // §96 WALL-SINGLE-VOLUME-CSG — toCreasedNormals welds coincident vertices and
    // assigns one shared normal per coplanar region (hard only at >= crease-angle
    // edges). Used to remove the boolean's flat-face triangulation shading seams
    // on the single-volume wall while keeping the opening reveal crisp.
    toCreasedNormals,
    mergeVertices,
} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
