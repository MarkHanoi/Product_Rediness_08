// A.23.a (Phase A · Sprint 2) — Level aggregate schema (C20 §2.2).
//
// Per [C20 §1.2] — within a single Building:
//   - `levelNumber` is UNIQUE
//   - `elevation` is UNIQUE
//   - `elevation` is monotonically increasing with `levelNumber`
//     (ground floor = level 0 at elevation 0; basement floors have
//      negative levelNumber + elevation; upper floors positive)
//   - exactly ZERO or ONE Level may have `isActive=true` at any
//     quiescent point (enforced by the L3 store)
//
// These cross-row invariants are L3 store-side checks — the L0 schema
// only validates per-row field shape.

import { z } from 'zod';
import { LevelIdSchema, BuildingIdSchema } from './types.js';

/**
 * Per [C20 §2.2] fields.
 *
 * - `levelNumber` is a signed integer: ground = 0, basement = -1, -2…,
 *   upper floors = 1, 2…
 * - `elevation` is metres above the project Y-origin (project floor
 *   plane). Same sign convention as levelNumber: 0 at ground, negative
 *   below.
 * - `height` is floor-to-floor height in metres. Residential typical
 *   2.4-3.2m; we hard-cap at 20m (industrial shells go higher but are
 *   out of scope for the apartment typology).
 */
export const LevelSchema = z.object({
    id: LevelIdSchema,
    buildingId: BuildingIdSchema,
    name: z.string().min(1).max(80),
    /** Signed int. Ground = 0, basement = -1, -2…, upper = 1, 2… */
    levelNumber: z.number().int(),
    /** Metres above the project Y-origin (project floor plane). */
    elevation: z.number().finite(),
    /** Floor-to-floor height in metres. Cap at 20m per [C20 §2.2]. */
    height: z.number().positive().max(20),
    /** Per [C20 §1.2] zero-or-one Level has isActive=true per Building. */
    isActive: z.boolean().default(false),
    /** Reference planes (ceiling, roof) carry no Apartments or Rooms. */
    isReference: z.boolean().default(false),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
});
export type Level = z.infer<typeof LevelSchema>;
