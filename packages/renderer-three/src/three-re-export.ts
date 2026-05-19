// @pryzm/renderer-three — THREE re-export barrel.
//
// Contract C04 §1.1 (P2 — Single THREE owner):
//   `import * as THREE from 'three'` is ONLY permitted in
//   `packages/renderer-three/`.  Every other package that needs a THREE
//   type MUST import it via this re-export:
//
//     import * as THREE from '@pryzm/renderer-three/three';
//
// This file is the sole point of contact with the `three` package for the
// entire monorepo.  The CI gate `tools/ga-gate/check-three-imports.ts`
// hard-fails if any file outside this package imports directly from 'three'.
//
// Wave 7+8 (P2 implementation): codemod landed 2026-05-03.
// Metric #12: direct THREE importers 467 → 1 (this file).

export * from 'three';
