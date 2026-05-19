import { z } from 'zod';
import { defineElement } from '../base/BaseNode.js';
import { Vec3 } from '../base/primitives.js';

/**
 * One representation of a furniture catalog item — the per-LOD geometry
 * the producer reads.  Triangle list (positions × 3 → indices flat-3).
 *
 * Plain `z.array(z.number())` (not `Float32Array`) so the DTO survives
 * JSON round-trip across the sync server (ADR-0019) and undo serialisation.
 *
 * Unconventional: this is the first element schema where the DTO carries
 * geometry directly.  Bounded to furniture per ADR-0024 §2.
 */
export const FurnitureRepresentation = z.object({
  /** Tightly-packed positions (x, y, z, …).  Length must be a multiple of 3. */
  positions: z.array(z.number().finite()).default([]),
  /** Optional vertex normals; if omitted the producer leaves them zeroed. */
  normals: z.array(z.number().finite()).optional(),
  /** Triangle indices into `positions`.  Length must be a multiple of 3. */
  indices: z.array(z.number().int().nonnegative()).default([]),
  /** Per-vertex UVs; pairs (u, v).  Optional. */
  uvs: z.array(z.number().finite()).optional(),
}).refine(
  (r) => r.positions.length % 3 === 0,
  { message: 'FurnitureRepresentation.positions must have length divisible by 3.' },
).refine(
  (r) => r.indices.length % 3 === 0,
  { message: 'FurnitureRepresentation.indices must have length divisible by 3 (triangle list).' },
);
export type FurnitureRepresentation = z.infer<typeof FurnitureRepresentation>;

/** The five canonical LOD levels (ADR-0024 §1).  Lower numbers ≈ less detail. */
export const FurnitureLod = z.union([
  z.literal(0), z.literal(1), z.literal(2), z.literal(3), z.literal(4),
]);
export type FurnitureLod = z.infer<typeof FurnitureLod>;

/**
 * Furniture — catalog instance positioned and rotated in a level.
 *
 * Multi-representation per ADR-0024:
 *   - `activeLod` selects which entry of `representations` the producer renders
 *   - `representations` holds 0..5 entries keyed by stringified LOD (`'0'..'4'`)
 *   - producer fallback ladder handles the missing-LOD case (R2 → R3 → R1 → R4 → R0 → empty)
 */
export const Furniture = defineElement('furniture', {
  levelId: z.string().default(''),
  /** Catalog item identifier (e.g. "ikea/sofa-malm-3s"). */
  catalogId: z.string().default(''),
  /** Insertion point in world coordinates. */
  origin: Vec3.default({ x: 0, y: 0, z: 0 }),
  /** Rotation about Y in radians. */
  rotation: z.number().default(0),
  /** Uniform scale multiplier; positive only. */
  scale: z.number().positive().default(1),
  /** Optional bounding-box override in metres (width, height, depth). */
  size: Vec3.optional(),
  /**
   * Active LOD — the producer reads `representations[String(activeLod)]`
   * (or walks the fallback ladder if absent).  Default `2` (= simplified)
   * matches the typical-case scene density target.
   */
  activeLod: FurnitureLod.default(2),
  /**
   * Per-LOD representations.  Keys are the stringified LOD numbers
   * (`'0'..'4'`) so the record JSON-round-trips cleanly.  All entries
   * optional; an empty record is allowed (default-parsed instances are
   * empty until a `furniture.setRepresentation` command populates them
   * from the catalogue at create-time per ADR-0024 §2).
   */
  representations: z.partialRecord(
    z.enum(['0', '1', '2', '3', '4']),
    FurnitureRepresentation,
  ).default({}),
  /**
   * Named material slots → `materialId`.  Empty record by default.
   * The producer's material key incorporates the slot named `'primary'`
   * if present; future renderers may consult additional slots.
   */
  materialSlots: z.record(z.string(), z.string()).default({}),
  /** Legacy single-material fallback (back-compat with PRYZM 1 fixtures). */
  materialId: z.string().optional(),
}).refine(
  (f) => f.size === undefined || (f.size.x > 0 && f.size.y > 0 && f.size.z > 0),
  { message: 'Furniture size override (when present) must have all positive components.' },
);

export type Furniture = z.infer<typeof Furniture>;
