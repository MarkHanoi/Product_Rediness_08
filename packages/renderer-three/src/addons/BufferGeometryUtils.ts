// @pryzm/renderer-three — addon re-export: BufferGeometryUtils
//
// Contract C04 §1.1 (P2): sole authorised re-export of three/examples addons.
// Consumers must import from '@pryzm/renderer-three' (barrel) — never directly
// from 'three/examples/jsm/utils/BufferGeometryUtils.js'.
//
// Wave A15 S119 — Class A1 violation closure.
export { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
