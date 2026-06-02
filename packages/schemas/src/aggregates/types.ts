// A.23.a (Phase A · Sprint 2) — Branded ids for the C20 aggregate
// hierarchy: Building → Level → Apartment → Room.
//
// L0-pure: Zod-only. No I/O, no THREE, no DOM.
//
// BuildingId is re-imported from `../site/types.js` (it was first
// defined there for `SiteModel.buildingRef`; the brand is the same
// string regardless of which schema "owns" it). Single source of truth.
//
// Strategic context — see:
//   - docs/02-decisions/contracts/C20-BUILDING-AND-APARTMENT-AGGREGATES.md §2
//   - docs/03-execution/plans/master-execution-tracker.md A.23

import { z } from 'zod';

// Re-export BuildingId from the site substrate where it was first
// authored. Aggregate consumers can import it from `@pryzm/schemas`
// (root barrel) without caring about the physical file.
export {
    BuildingIdSchema,
    type BuildingId,
} from '../site/types.js';

/** LevelId — branded slug for `Level.id`. Format: `lvl_<ulid>`. */
export type LevelId = string & { readonly __brand: 'LevelId' };
/** ApartmentId — branded slug for `Apartment.id`. Format: `apt_<ulid>`. */
export type ApartmentId = string & { readonly __brand: 'ApartmentId' };
/** RoomId — branded slug for `Room.id`. Format: `rm_<ulid>`. */
export type RoomId = string & { readonly __brand: 'RoomId' };

// Permissive slug — alphanumeric + dash + underscore, 3-64 chars.
// Same pattern as SiteId. The actual identity discipline (uuid7 vs
// `<prefix>_<ulid>`) is enforced at the command-handler layer.
const AGGREGATE_ID_PATTERN = /^[A-Za-z0-9_-]{3,64}$/;

export const LevelIdSchema = z
    .string()
    .regex(
        AGGREGATE_ID_PATTERN,
        'LevelId must match `[A-Za-z0-9_-]{3,64}`',
    );

export const ApartmentIdSchema = z
    .string()
    .regex(
        AGGREGATE_ID_PATTERN,
        'ApartmentId must match `[A-Za-z0-9_-]{3,64}`',
    );

export const RoomIdSchema = z
    .string()
    .regex(
        AGGREGATE_ID_PATTERN,
        'RoomId must match `[A-Za-z0-9_-]{3,64}`',
    );
