// @pryzm/renderer-three — addon re-export: GTAOPass
//
// Contract C04 §1.1 (P2): sole authorised re-export of three/examples addons.
// Consumers must import from '@pryzm/renderer-three' (barrel) — never directly
// from 'three/examples/jsm/postprocessing/GTAOPass.js'.
//
// Wave A15 S119 — Class A1 violation closure.
export { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
