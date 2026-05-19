// @pryzm/renderer-three — addon re-export: GLTFExporter
//
// Contract C04 §1.1 (P2): sole authorised re-export of three/examples addons.
// Consumers must import from '@pryzm/renderer-three' (barrel) — never directly
// from 'three/examples/jsm/exporters/GLTFExporter.js'.
//
// Wave A15 S119 — Class A1 violation closure.
export { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
export type { GLTFExporterOptions } from 'three/examples/jsm/exporters/GLTFExporter.js';
