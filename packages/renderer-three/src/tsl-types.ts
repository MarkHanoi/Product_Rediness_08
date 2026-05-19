// @pryzm/renderer-three — TSL (Three.js Shading Language) type re-exports.
//
// Contract C04 §1.1 (P2): sole authorised re-export of 'three/tsl' types.
// All pipeline files that need TSL node types must import from
// '@pryzm/renderer-three' (barrel) — never directly from 'three/tsl'.
//
// Only type-only re-exports here — no runtime values are imported from
// 'three/tsl' directly; that sub-path is for WebGPU node graph construction
// inside packages/renderer-three/ only.
//
// Wave A15 S119 — Class A2 violation closure (7 pipeline files).
//
// Symbols used across the codebase (scan 2026-05-03):
//   PassNode        — ScenePass, ZonePass, RenderPipelineManager, SSGIPass
//   TSLNode         — OutlinePass, RenderPipelineManager, SSGIPass, TRAAPass
//   UniformNode     — BackgroundUniform
//
// NOTE: 'three/tsl' does not export these symbols in the installed version.
// We provide local ambient stubs so downstream consumers can import the types
// without depending on a specific three release that exposes them.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type PassNode = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type TSLNode = any;
// UniformNode<T> is generic in the real TSL API — the stub must accept the
// type parameter so BackgroundUniform.ts can write UniformNode<THREE.Color>.
// The body remains `any` because 'three/tsl' does not export this symbol in
// the installed three@0.183.x release; we rely on globalThis.__PRYZM_TSL__.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type UniformNode<_T = any> = any;
