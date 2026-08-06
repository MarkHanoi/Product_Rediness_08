/**
 * §FIX-STAIR-PANEL-ENUM-DRIFT — the published option lists ARE the schema.
 *
 * The property panel used to restate the stair enums as string literals and had
 * drifted: it offered `'wood'` as a Material, which `StairMaterialSchema` rejects,
 * while `'timber'` / `'glass'` / `'composite'` were unreachable, and `'rounded'`
 * nosing was unreachable. A UI that can produce a value the Zod schema refuses is a
 * defect the type system cannot catch on its own, because the panel typed its options
 * as plain `string[]`.
 *
 * `STAIR_MATERIALS` / `STAIR_NOSING_TYPES` / `STAIR_STRINGER_TYPES` are typed as the
 * unions, so `tsc` catches a value that is not a union member. This spec closes the
 * other direction — a union member (or a Zod enum member) that the list FORGOT.
 */

import { describe, it, expect } from 'vitest';
import {
    STAIR_MATERIALS,
    STAIR_NOSING_TYPES,
    STAIR_STRINGER_TYPES,
} from '../StairTypes';
import {
    StairMaterialSchema,
    StairNosingTypeSchema,
    StairStringerTypeSchema,
} from '../StairDataSchema';

describe('stair enum parity — published lists vs Zod schema', () => {
    it('STAIR_MATERIALS matches StairMaterialSchema exactly', () => {
        expect([...STAIR_MATERIALS].sort()).toEqual([...StairMaterialSchema.options].sort());
    });

    it('STAIR_NOSING_TYPES matches StairNosingTypeSchema exactly', () => {
        expect([...STAIR_NOSING_TYPES].sort()).toEqual([...StairNosingTypeSchema.options].sort());
    });

    it('STAIR_STRINGER_TYPES matches StairStringerTypeSchema exactly', () => {
        expect([...STAIR_STRINGER_TYPES].sort()).toEqual([...StairStringerTypeSchema.options].sort());
    });

    it('every published material is ACCEPTED by the schema (the drift that shipped)', () => {
        for (const m of STAIR_MATERIALS) {
            expect(StairMaterialSchema.safeParse(m).success).toBe(true);
        }
    });

    it("'wood' — the option the panel used to offer — is NOT a valid material", () => {
        // Pinned deliberately: this is the exact value the old hard-coded panel list
        // put in front of the architect. StairTypeDefinitions still uses it for two
        // built-in types (its `defaults.material` is typed `string`, so nothing caught
        // it); StairMaterialResolver keeps a 'wood' preset so those render, but the
        // canonical member is 'timber'.
        expect(StairMaterialSchema.safeParse('wood').success).toBe(false);
        expect(STAIR_MATERIALS).not.toContain('wood' as never);
        expect(STAIR_MATERIALS).toContain('timber');
    });
});
