// A.23.a (Phase A · Sprint 2) — Apartment aggregate schema (C20 §2.3).
//
// Composes the EXISTING `ApartmentParameters` Zod record (in
// `packages/schemas/src/apartment/ApartmentParameters.ts`) with the
// aggregate identity. Per [C20 §1.3] today an Apartment lives on a
// SINGLE Level (multi-Level apartments deferred to C20.2). The L3
// store enforces `Apartment.levelId === parameters.levelId` (the
// parameters record is parameterised too).
//
// Per the contract note: `parameters.id` is the SAME value as
// `Apartment.id` — composition keeps a single canonical id surface.
// The L3 store enforces this on every `applyPatch` per [C20 §1.5].

import { z } from 'zod';
import {
    ApartmentIdSchema,
    BuildingIdSchema,
    LevelIdSchema,
} from './types.js';
import { ApartmentParameters } from '../apartment/ApartmentParameters.js';

/**
 * Per [C20 §2.3] fields. `parameters` is the user-editable record
 * (bedrooms · bathrooms · masterEnSuite · openPlanKitchenDining ·
 * livingRoom · entranceHall · typology · shellAreaM2 envelope) —
 * see ApartmentParameters.ts for the full shape.
 */
export const ApartmentSchema = z.object({
    id: ApartmentIdSchema,
    buildingId: BuildingIdSchema,
    levelId: LevelIdSchema,
    name: z.string().min(1).max(120),
    /** Unit number as shown in the inspect tree — `"1A"`, `"203"`,
     *  `"Penthouse"`, etc. Free-form; unique within Building per
     *  [C20 §1.3]. */
    unitNumber: z.string().min(1).max(20),
    /** Composes the existing user-editable parameter record. The
     *  L3 store enforces `parameters.id === id`. */
    parameters: ApartmentParameters,
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
});
export type Apartment = z.infer<typeof ApartmentSchema>;
