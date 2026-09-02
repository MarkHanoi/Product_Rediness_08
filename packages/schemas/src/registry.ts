import type { z } from 'zod';
import { Wall } from './elements/Wall.js';
import { Slab } from './elements/Slab.js';
import { Door } from './elements/Door.js';
import { Window } from './elements/Window.js';
import { Roof } from './elements/Roof.js';
import { CurtainWall } from './elements/CurtainWall.js';
import { Grid } from './elements/Grid.js';
import { Column } from './elements/Column.js';
import { Beam } from './elements/Beam.js';
import { Stair } from './elements/Stair.js';
import { VerticalCirculation } from './elements/VerticalCirculation.js';
import { Handrail } from './elements/Handrail.js';
import { Ceiling } from './elements/Ceiling.js';
// PV-08 / C75 §5 — the applied floor finish. See `elements/Floor.ts` for why the
// kind is IN scope rather than argued out on the coverage gate's ledger.
import { Floor } from './elements/Floor.js';
import { Room } from './elements/Room.js';
import { Furniture } from './elements/Furniture.js';
import { Annotation } from './elements/Annotation.js';
import { Dimension } from './elements/Dimension.js';
import { Sheet } from './elements/Sheet.js';
import { Schedule } from './elements/Schedule.js';
import { View } from './elements/View.js';
import { Project } from './elements/Project.js';
import { Structural } from './elements/Structural.js';
import { Lighting } from './elements/Lighting.js';
import { Plumbing } from './elements/Plumbing.js';
import { ProjectOrigin } from './elements/ProjectOrigin.js';
// §FEAT-SWIMMING-POOL-ELEMENT (L-292) — the pool ASSEMBLY parent + its water. ADR-0124.
import { Pool } from './elements/Pool.js';
import { Water } from './elements/Water.js';
// §COMPONENT-PLACE (audit §12 Phase 4C) · ADR-0376 D9 — the PLACED OCCURRENCE of a
// component definition. Registered here IN THE SAME COMMIT as the kind itself,
// because the audit's own T9 measured this file drifting from `src/elements/`:
// *"`SCHEMA_REGISTRY` is not a census of element kinds. 28 registry entries, 32
// files in `src/elements/`. `Balcony`, `BoundaryLine`, `Section` and
// `CurtainPanelVocabulary` define schemas the registry omits — and `Balcony` /
// `BoundaryLine` are governed by real contracts (C103, C106)."* That is the
// row-and-range rule one level down, and D9 makes moving the row a BINDING
// CONDITION of minting the kind rather than a tidiness preference.
// ⛔ Adding `component` here does NOT close T9 for the other four; they are still
// omitted, and this comment is not a claim that they are not.
import { Component } from './elements/Component.js';

/**
 * The element schemas, addressable by element-type discriminator.
 * Used by the round-trip test, the protocol barrel, and any code that needs
 * to dispatch on element type.
 */
export const SCHEMA_REGISTRY = {
  wall: Wall,
  slab: Slab,
  door: Door,
  window: Window,
  roof: Roof,
  curtainwall: CurtainWall,
  grid: Grid,
  column: Column,
  beam: Beam,
  stair: Stair,
  verticalCirculation: VerticalCirculation,
  handrail: Handrail,
  ceiling: Ceiling,
  floor: Floor,
  room: Room,
  furniture: Furniture,
  annotation: Annotation,
  dimension: Dimension,
  sheet: Sheet,
  schedule: Schedule,
  view: View,
  project: Project,
  structural: Structural,
  lighting: Lighting,
  plumbing: Plumbing,
  projectOrigin: ProjectOrigin,
  pool: Pool,
  water: Water,
  // §COMPONENT-PLACE · ADR-0376 D9 — THE JOIN. See the import above for why the row
  // and the kind moved together.
  component: Component,
} as const;

export type SchemaRegistry = typeof SCHEMA_REGISTRY;
export type ElementSchema = SchemaRegistry[keyof SchemaRegistry] & z.ZodTypeAny;
