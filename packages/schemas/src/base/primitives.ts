import { z } from 'zod';

/** 2D point in metres on a level's local XZ plane. */
export const Vec2 = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
});
export type Vec2 = z.infer<typeof Vec2>;

/** 3D point in metres in world coordinates. */
export const Vec3 = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  z: z.number().finite(),
});
export type Vec3 = z.infer<typeof Vec3>;

/** RGB triple in 0..1. */
export const ColorRgb = z.tuple([
  z.number().min(0).max(1),
  z.number().min(0).max(1),
  z.number().min(0).max(1),
]);
export type ColorRgb = z.infer<typeof ColorRgb>;

/** Axis-aligned bounding box. */
export const Aabb = z.object({
  min: Vec3,
  max: Vec3,
});
export type Aabb = z.infer<typeof Aabb>;

/**
 * Mandatory metadata block stamped by stores on every node. Callers MUST NOT
 * supply these fields directly; the store owns them.
 *
 * `version` increments on every semantic change; stores compare it to skip
 * geometry rebuilds.
 */
export const Metadata = z.object({
  createdAt: z.number().int().nonnegative().default(0),
  modifiedAt: z.number().int().nonnegative().default(0),
  createdBy: z.string().default('system'),
  version: z.number().int().nonnegative().default(0),
  tags: z.array(z.string()).optional(),
  description: z.string().optional(),
});
export type Metadata = z.infer<typeof Metadata>;

/** Optional IFC interoperability metadata. */
export const IfcData = z.object({
  guid: z.string().min(1),
  ifcClass: z.string().min(1),
});
export type IfcData = z.infer<typeof IfcData>;
