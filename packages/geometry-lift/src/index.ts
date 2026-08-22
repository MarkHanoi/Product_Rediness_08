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

// ── LOD-300 compound system ──────────────────────────────────────────────── §FEAT-LIFT-COMPOUND-SYSTEM
// The lift as a COMPOUND (C104, extending C103): the pure dimension chain, the
// cabin sub-element family, and the assembly that turns ONE lift record into its
// enclosure + one landing door per served level + the five cabin parts + the slab
// voids. All pure — no THREE, no DOM, no store. `plugins/lift` is the command
// surface over it, exactly as `plugins/pool` is over `@pryzm/geometry-pool`.
export {
    LIFT_DIMENSION_DEFAULTS,
    resolveLiftDimensions,
} from './LiftDimensions';
export type { ResolvedLiftDimensions, LiftDimensionInput } from './LiftDimensions';
export {
    LiftEnclosureTypeSchema,
    LIFT_ENCLOSURE_TYPE_LABELS,
    LiftCompoundSchema,
} from './LiftCompoundTypes';
export type {
    LiftCompound,
    LiftCompoundsState,
    LiftEnclosureTypeName,
} from './LiftCompoundTypes';
export {
    LIFT_PART_KINDS,
    LIFT_PART_LABELS,
    LIFT_PART_CYCLE_ORDER,
    LiftPartKind,
    LiftPartSchema,
} from './LiftPartTypes';
export type { LiftPart, LiftPartsState } from './LiftPartTypes';
export {
    buildLiftAssembly,
    ENCLOSURE_SIDE_COUNT,
} from './LiftAssembly';
export type {
    LiftAssembly,
    LiftAssemblyInput,
    LiftEnclosureType,
    LiftEnclosureSide,
    LiftPartIds,
    LiftSlabVoid,
    ServedLevel,
} from './LiftAssembly';

// ── Stores ───────────────────────────────────────────────────────────────────
export { LiftStore } from './LiftStore';
export { LiftTypeStore } from './LiftTypeStore';

// ── Builder ──────────────────────────────────────────────────────────────────
export { LiftMeshBuilder } from './LiftMeshBuilder';
export type { LiftLevelProvider } from './LiftMeshBuilder';

// ── Tool ───────────────────────────────────────────────────────────────────── §LIFT-CREATE-TOOL
// Interactive single-click lift placement tool; mirrors @pryzm/geometry-column's
// ColumnTool. Drives the EXISTING CreateVerticalCirculationCommand (injected via
// LiftToolDeps.createCommand to avoid a static command-registry import cycle).
export { LiftTool } from './LiftTool';
export type { LiftToolDeps, LiftToolCommand } from './LiftTool';
export {
    resolveLiftSpan,
    buildLiftCommandInput,
    DEFAULT_TYPE_ID,
    DEFAULT_KIND,
} from './LiftToolPlacement';
export type { LiftToolLevel, LiftCommandInput } from './LiftToolPlacement';
