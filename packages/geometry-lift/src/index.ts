/**
 * @pryzm/geometry-lift — public API barrel.
 *
 * Residential-building (multi-family) — Slice A / P2. The vertical-circulation
 * (lift / elevator) geometry subsystem, a peer of `@pryzm/geometry-stair`:
 * types + data store + system-type store + (placeholder) mesh builder.
 *
 * Mirrors geometry-stair's barrel shape. THREE is touched only inside
 * LiftMeshBuilder via `@pryzm/renderer-three/three` (P2 single-THREE-owner).
 */

// ── Types ────────────────────────────────────────────────────────────────────
export * from './LiftTypes';
export * from './LiftTypeDefinitions';

// ── Stores ───────────────────────────────────────────────────────────────────
export { LiftStore } from './LiftStore';
export { LiftTypeStore } from './LiftTypeStore';

// ── Builder ──────────────────────────────────────────────────────────────────
export { LiftMeshBuilder } from './LiftMeshBuilder';
export type { LiftLevelProvider } from './LiftMeshBuilder';
