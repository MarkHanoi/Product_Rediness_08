// A.23.a (Phase A · Sprint 2) — Room aggregate schema (C20 §2.4).
//
// Composes the EXISTING `RoomParameters` Zod record with the aggregate
// identity. Per [C20 §1.4]:
//   - When `apartmentId` is non-null, `Room.levelId` MUST equal
//     `Apartment(apartmentId).levelId` (enforced by L3 store).
//   - `apartmentId` may be null for Rooms that are NOT part of any
//     Apartment (public corridor, lift lobby, plant room, …).
//
// Per the contract note: `parameters.id` and `parameters.apartmentId`
// MUST match `Room.id` and `Room.apartmentId` respectively. L3
// store-side check.

import { z } from 'zod';
import {
    RoomIdSchema,
    LevelIdSchema,
    ApartmentIdSchema,
} from './types.js';
import { RoomParameters } from '../apartment/ApartmentParameters.js';

/**
 * Per [C20 §2.4] fields.
 *
 * NOTE — divergence from C20 §2.4:
 * The contract specifies `apartmentId: ApartmentId | null` for the
 * public-corridor / plant-room / lift-lobby case. The EXISTING
 * `RoomParameters.apartmentId` schema (in
 * `packages/schemas/src/apartment/ApartmentParameters.ts`) is
 * NON-NULLABLE. To keep this slice (A.23.a) compatibility-preserving
 * we mirror the existing schema — `apartmentId` is required. The
 * nullable-widening (for public-corridor support per the contract)
 * will ship together in A.23.b when the L3 RoomStore lands; the
 * RoomParameters update + this Room schema update happen atomically
 * there. Until then, public corridors live as `apartmentId: '<sentinel>'`
 * the L5 layer interprets — see A.23.b TODO.
 */
export const RoomSchema = z.object({
    id: RoomIdSchema,
    levelId: LevelIdSchema,
    apartmentId: ApartmentIdSchema,
    name: z.string().min(1).max(120),
    /** Composes the user-editable parameters (type · areaM2 envelope ·
     *  widthM/depthM envelopes · daylightRequired · privacyTier ·
     *  acousticIsolation). */
    parameters: RoomParameters,
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
});
export type Room = z.infer<typeof RoomSchema>;
