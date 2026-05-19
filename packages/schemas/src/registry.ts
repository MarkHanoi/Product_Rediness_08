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
import { Handrail } from './elements/Handrail.js';
import { Ceiling } from './elements/Ceiling.js';
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

/**
 * The 23 element schemas, addressable by element-type discriminator.
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
  handrail: Handrail,
  ceiling: Ceiling,
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
} as const;

export type SchemaRegistry = typeof SCHEMA_REGISTRY;
export type ElementSchema = SchemaRegistry[keyof SchemaRegistry] & z.ZodTypeAny;
