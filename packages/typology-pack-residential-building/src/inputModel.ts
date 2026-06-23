// Residential building (multi-family) — Slice 0 / Tracker P1.A.
//
// The pure, validated §5.1 INPUT MODEL for the residential-building typology.
// This is the typed counterpart of the manifest's `briefSchema`: where the brief
// schema declares the UI controls, this schema declares the strongly-typed object
// the building orchestrator will consume (later slices). Keeping it pure (Zod-only,
// no I/O) means it can be unit-tested in isolation and reused by the L2 orchestrator
// without any UI coupling.
//
// Input model (audit/plan §5.1):
//   { minApartmentAreaM2, maxApartmentAreaM2, typologies: {T1,T2,T3,T4: boolean},
//     levels: 1..20, commercialGroundFloor: boolean }
//
// Strategic context: docs/03-execution/plans/RESIDENTIAL-BUILDING-MULTI-FAMILY-AUDIT-AND-PLAN.md §5.1, §6.

import { z } from 'zod';

/** The four supported apartment typologies (≈ 1/2/3/4-bed). */
export const ApartmentTypology = z.enum(['T1', 'T2', 'T3', 'T4']);
export type ApartmentTypology = z.infer<typeof ApartmentTypology>;

/**
 * The residential-building generation input. PURE — no I/O, no THREE, no DOM.
 * Cross-field invariants are enforced by `.refine`: min ≤ max, ≥ 1 typology
 * enabled (a building with no apartment typology is meaningless).
 */
export const ResidentialBuildingInput = z
    .object({
        /** Lower bound of the per-apartment net-area band (m²). */
        minApartmentAreaM2: z.number().positive().default(45),
        /** Upper bound of the per-apartment net-area band (m²). */
        maxApartmentAreaM2: z.number().positive().default(120),
        /** Which typologies are enabled. The building may MIX several on a level. */
        typologies: z
            .object({
                T1: z.boolean().default(false),
                T2: z.boolean().default(true),
                T3: z.boolean().default(true),
                T4: z.boolean().default(false),
            })
            .default({ T1: false, T2: true, T3: true, T4: false }),
        /** Upper residential levels (ground is always core + commercial/lobby). */
        levels: z.number().int().min(1).max(20).default(4),
        /** When ON, the ground perimeter is a commercial (glazed) ring; OFF = lobby only. */
        commercialGroundFloor: z.boolean().default(true),
    })
    .refine((v) => v.minApartmentAreaM2 <= v.maxApartmentAreaM2, {
        message: 'minApartmentAreaM2 must be ≤ maxApartmentAreaM2',
        path: ['minApartmentAreaM2'],
    })
    .refine(
        (v) => v.typologies.T1 || v.typologies.T2 || v.typologies.T3 || v.typologies.T4,
        { message: 'At least one apartment typology must be enabled', path: ['typologies'] },
    );
export type ResidentialBuildingInput = z.infer<typeof ResidentialBuildingInput>;

/**
 * Adapt a free-form RAC/brief `metadata` bag (keyed by the manifest briefSchema
 * field ids) into the typed `ResidentialBuildingInput`. The brief's `typologies`
 * arrives as a string[] (multiselect) and is folded into the {T1..T4} boolean map.
 *
 * Returns the parsed input. Throws (Zod) on an invalid combination — the caller
 * (Stage 1 brief / Stage 4 generative) converts that into a C50 soft-fail.
 */
export function parseResidentialBuildingInput(
    metadata: Record<string, unknown>,
): ResidentialBuildingInput {
    const selected = Array.isArray(metadata.typologies)
        ? (metadata.typologies as unknown[]).map(String)
        : undefined;
    const typologies = selected
        ? {
              T1: selected.includes('T1'),
              T2: selected.includes('T2'),
              T3: selected.includes('T3'),
              T4: selected.includes('T4'),
          }
        : undefined;

    return ResidentialBuildingInput.parse({
        ...(metadata.minApartmentAreaM2 !== undefined
            ? { minApartmentAreaM2: metadata.minApartmentAreaM2 }
            : {}),
        ...(metadata.maxApartmentAreaM2 !== undefined
            ? { maxApartmentAreaM2: metadata.maxApartmentAreaM2 }
            : {}),
        ...(typologies ? { typologies } : {}),
        ...(metadata.levels !== undefined ? { levels: metadata.levels } : {}),
        ...(metadata.commercialGroundFloor !== undefined
            ? { commercialGroundFloor: metadata.commercialGroundFloor }
            : {}),
    });
}

/** The enabled typologies as a list, e.g. ['T2','T3']. */
export function enabledTypologies(input: ResidentialBuildingInput): ApartmentTypology[] {
    const out: ApartmentTypology[] = [];
    if (input.typologies.T1) out.push('T1');
    if (input.typologies.T2) out.push('T2');
    if (input.typologies.T3) out.push('T3');
    if (input.typologies.T4) out.push('T4');
    return out;
}
