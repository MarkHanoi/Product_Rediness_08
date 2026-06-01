// A.7.a (Phase A · Sprint 1) — SiteLocation schema (C19 §2.2).
//
// Mirrors today's `ProjectLocation` but lives on the Site, not the
// Project. Carries the lat/lon + true-north + CRS + PII fields.

import { z } from 'zod';
// A.7.a — `Vec3` is the monorepo's canonical 3D-vector schema. Per the
// C19 §2.2 type table `basePoint` is `Vec3`. We import from the existing
// `base/primitives.ts` rather than re-defining (would collide at the
// root barrel).
import { Vec3 as Vec3SchemaCanonical } from '../base/primitives.js';

/**
 * The Site's geographic origin. Per C19 §1.3, mutating this MUST trigger
 * a `LTPENURebase.setOrigin(lat, lon, elev)` synchronously before any
 * `site.location-changed` event emits.
 *
 * Per C19 §2.2 fields:
 *   - latitude / longitude       WGS84 decimal degrees
 *   - elevationAsl               metres above sea level
 *   - trueNorth                  radians (C12 convention)
 *   - crs                        EPSG code or Proj4 string; null = local UTM zone
 *   - basePoint                  scene-space origin (LTP-ENU)
 *   - siteAddress                free-form postal address — PII per C22
 *   - landTitleNumber            jurisdictional legal id — PII per C22
 */
export const SiteLocationSchema = z.object({
    latitude: z.number().min(-90).max(90).default(0),
    longitude: z.number().min(-180).max(180).default(0),
    // Range guidance per C19 §2.2; not a hard cap but a soft validation.
    elevationAsl: z.number().min(-500).max(9000).default(0),
    // Radians per C12 — full circle is [-π, π].
    trueNorth: z.number().min(-Math.PI).max(Math.PI).default(0),
    crs: z.string().min(1).nullable().default(null),
    basePoint: Vec3SchemaCanonical.default({ x: 0, y: 0, z: 0 }),
    // PII per C22; free-form, no validation pattern.
    siteAddress: z.string().min(1).nullable().default(null),
    landTitleNumber: z.string().min(1).nullable().default(null),
});
export type SiteLocation = z.infer<typeof SiteLocationSchema>;
