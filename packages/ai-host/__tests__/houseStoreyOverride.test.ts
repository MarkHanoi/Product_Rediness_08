// §PER-STOREY-PROGRAM (founder 2026-06-18) — per-level program override tests.
//
// The founder's "a slider per level of bathrooms and bedroom and all the rooms / with
// boolean — to decide what we want in each level — but dynamic" feature: the modal's
// per-storey tabs emit a `PerStoreyProgramOverride[]` (indexed by storeyIndex) that
// `allocateProgramToStoreys` MERGES over the auto-split. These tests pin the four
// guarantees from the brief:
//   (a) NO override ⇒ byte-identical to today's allocation (the gate that protects the
//       2749 ai-host tests);
//   (b) an override of a storey's bedrooms/bathrooms is reflected in that storey's
//       program AND flows through the orchestrator into the result;
//   (c) determinism (same input → identical output);
//   (d) invariants preserved — the hall stays ground-only, the override never mints a
//       second hall nor strips the ground one.

import { describe, expect, it } from 'vitest';
import {
    allocateProgramToStoreys, generateHouseLayoutOptions,
} from '../src/workflows/houseLayout/index.js';
import type { PerStoreyProgramOverride } from '../src/workflows/houseLayout/index.js';
import type { ShellAnalysis } from '../src/workflows/apartmentLayout/shellAnalysis.js';
import type {
    ApartmentConstraints, ApartmentProgram, ScoringWeights,
} from '../src/workflows/apartmentLayout/types.js';

const SHELL: ShellAnalysis = {
    netAreaM2: 120, widthM: 12, depthM: 10,
    perimeter: [{ x: 0, z: 0 }, { x: 12, z: 0 }, { x: 12, z: 10 }, { x: 0, z: 10 }],
    faces: [],
};
const PROGRAM: ApartmentProgram = {
    bedrooms: 3, bathrooms: 2, masterEnSuite: true,
    openPlanKitchenDining: true, livingRoom: true, entranceHall: true,
};
const CONSTRAINTS: ApartmentConstraints = { minCorridorWidth: 900, wallThickness: 100, floorToCeiling: 2700, wallTypeId: '' };
const WEIGHTS: ScoringWeights = { naturalLight: 0.5, privacy: 0.5, kitchenWorkflow: 0.5, corridorEfficiency: 0.5 };

// ───────────────────────── (a) BYTE-IDENTICAL default ─────────────────────────

describe('allocateProgramToStoreys — per-storey override gate (byte-identical default)', () => {
    it('NO override arg ⇒ identical to the legacy single-arg call', () => {
        const baseline = allocateProgramToStoreys(PROGRAM, 2);
        expect(JSON.stringify(allocateProgramToStoreys(PROGRAM, 2, undefined))).toEqual(JSON.stringify(baseline));
    });

    it('an EMPTY override array ⇒ byte-identical baseline', () => {
        const baseline = allocateProgramToStoreys(PROGRAM, 3);
        expect(JSON.stringify(allocateProgramToStoreys(PROGRAM, 3, []))).toEqual(JSON.stringify(baseline));
    });

    it('an all-undefined / all-empty override array ⇒ byte-identical baseline (the gate)', () => {
        const baseline = allocateProgramToStoreys(PROGRAM, 3);
        expect(JSON.stringify(allocateProgramToStoreys(PROGRAM, 3, [undefined, undefined, undefined]))).toEqual(JSON.stringify(baseline));
        expect(JSON.stringify(allocateProgramToStoreys(PROGRAM, 3, [{}, {}, {}]))).toEqual(JSON.stringify(baseline));
    });
});

// ─────────────── (b) override reflected in the storey program ─────────────────

describe('allocateProgramToStoreys — per-storey override merge', () => {
    it('overrides storey 1 bedrooms + bathrooms (present fields WIN; others auto)', () => {
        const baseline = allocateProgramToStoreys(PROGRAM, 2);
        const overrides: PerStoreyProgramOverride[] = [];
        overrides[1] = { bedrooms: 4, bathrooms: 3 };
        const out = allocateProgramToStoreys(PROGRAM, 2, overrides);
        // Storey 1 (first upper) takes the explicit counts…
        expect(out[1]!.program.bedrooms).toBe(4);
        expect(out[1]!.program.bathrooms).toBe(3);
        // …while every other field on storey 1 keeps its auto value (e.g. en-suite/kitchen).
        expect(out[1]!.program.masterEnSuite).toBe(baseline[1]!.program.masterEnSuite);
        expect(out[1]!.program.includeKitchen).toBe(baseline[1]!.program.includeKitchen);
        // …and storey 0 is untouched (no override entry for it).
        expect(JSON.stringify(out[0])).toEqual(JSON.stringify(baseline[0]));
    });

    // §PER-STOREY-COUNT-AUTHORITATIVE — an EXPLICIT per-level bedroom count flags the storey
    // so the orchestrator's plate-fill grow is disabled (founder: "I said 2 bedrooms but it
    // keeps 3"). The flag rides ONLY when bedrooms is the overridden field.
    it('sets bedroomsExplicit when (and only when) bedrooms is overridden', () => {
        const obeds: PerStoreyProgramOverride[] = [];
        obeds[1] = { bedrooms: 2 };
        const withBeds = allocateProgramToStoreys(PROGRAM, 2, obeds);
        expect(withBeds[1]!.program.bedrooms).toBe(2);
        expect(withBeds[1]!.bedroomsExplicit).toBe(true);
        // storey 0 has no override → flag absent (default plate-fill behaviour preserved).
        expect(withBeds[0]!.bedroomsExplicit).toBeUndefined();

        // A bathrooms/boolean-only override does NOT set the bedroom flag.
        const obath: PerStoreyProgramOverride[] = [];
        obath[1] = { bathrooms: 2, includeKitchen: true };
        const noBeds = allocateProgramToStoreys(PROGRAM, 2, obath);
        expect(noBeds[1]!.bedroomsExplicit).toBeUndefined();
    });

    it('per-level booleans win — an upper storey CAN opt a kitchen/living IN explicitly', () => {
        const overrides: PerStoreyProgramOverride[] = [];
        overrides[1] = { includeKitchen: true, livingRoom: true, openPlanKitchenDining: true };
        const out = allocateProgramToStoreys(PROGRAM, 2, overrides);
        // The auto upper storey is kitchen-OFF; the explicit override flips it ON.
        expect(out[1]!.program.includeKitchen).toBe(true);
        expect(out[1]!.program.livingRoom).toBe(true);
        expect(out[1]!.program.openPlanKitchenDining).toBe(true);
    });

    it('clamps an override count to a ≥0 integer', () => {
        const overrides: PerStoreyProgramOverride[] = [];
        overrides[0] = { bedrooms: -2, bathrooms: 2.9 };
        const out = allocateProgramToStoreys(PROGRAM, 2, overrides);
        expect(out[0]!.program.bedrooms).toBe(0);
        expect(out[0]!.program.bathrooms).toBe(2);
    });

    it('a non-finite / type-mismatched field is ignored (auto value kept)', () => {
        const baseline = allocateProgramToStoreys(PROGRAM, 2);
        const overrides = [undefined, { bedrooms: Number.NaN }] as PerStoreyProgramOverride[];
        const out = allocateProgramToStoreys(PROGRAM, 2, overrides);
        expect(out[1]!.program.bedrooms).toBe(baseline[1]!.program.bedrooms);
    });

    it('merges per-storey roomAreas over the whole-house roomAreas', () => {
        const withArea: ApartmentProgram = { ...PROGRAM, roomAreas: { bedroom: 12 } };
        const overrides: PerStoreyProgramOverride[] = [];
        overrides[1] = { roomAreas: { bedroom: 18 } };
        const out = allocateProgramToStoreys(withArea, 2, overrides);
        // Storey 1's bedroom override wins; ground keeps the whole-house value.
        expect(out[1]!.program.roomAreas?.bedroom).toBe(18);
        expect(out[0]!.program.roomAreas?.bedroom).toBe(12);
    });

    it('single-storey house honours a storey-0 override (full program on the ground plate)', () => {
        const overrides: PerStoreyProgramOverride[] = [{ bedrooms: 2, bathrooms: 1 }];
        const out = allocateProgramToStoreys(PROGRAM, 1, overrides);
        expect(out).toHaveLength(1);
        expect(out[0]!.program.bedrooms).toBe(2);
        expect(out[0]!.program.bathrooms).toBe(1);
        // §HALL-SINGLETON — the single ground plate still carries the one hall.
        expect(out[0]!.program.entranceHall).toBe(true);
    });
});

// ─────────────────────────── (c) determinism ─────────────────────────────────

describe('allocateProgramToStoreys — per-storey override determinism (ADR-0061)', () => {
    it('same input → identical output', () => {
        const overrides: PerStoreyProgramOverride[] = [{ bathrooms: 1 }, { bedrooms: 4, includeKitchen: true }];
        const a = allocateProgramToStoreys(PROGRAM, 2, overrides);
        const b = allocateProgramToStoreys(PROGRAM, 2, overrides);
        expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
    });
});

// ───────────────── (d) §HALL-SINGLETON / §LANDING-NOT-HALL preserved ──────────

describe('allocateProgramToStoreys — per-storey override preserves invariants', () => {
    it('§HALL-SINGLETON: exactly one ground hall, none upper, regardless of overrides', () => {
        const overrides: PerStoreyProgramOverride[] = [
            { bedrooms: 1, includeKitchen: false },
            { bedrooms: 4, includeKitchen: true, livingRoom: true },
        ];
        const out = allocateProgramToStoreys(PROGRAM, 2, overrides);
        const groundHalls = out.filter(s => s.role === 'ground' && s.program.entranceHall === true).length;
        const upperHalls = out.filter(s => s.role !== 'ground' && s.program.entranceHall === true).length;
        expect(groundHalls).toBe(1);
        expect(upperHalls).toBe(0);
    });

    it('a brief WITHOUT a ground hall STILL gets exactly one ground hall after override merge', () => {
        const noHall: ApartmentProgram = { ...PROGRAM, entranceHall: false };
        const overrides: PerStoreyProgramOverride[] = [{ bedrooms: 1 }, { bedrooms: 5 }];
        const out = allocateProgramToStoreys(noHall, 2, overrides);
        expect(out[0]!.program.entranceHall).toBe(true);
        expect(out[1]!.program.entranceHall).toBe(false);
    });
});

// ───────────── orchestrator: override flows end-to-end into the result ────────

describe('generateHouseLayoutOptions — per-storey override threads to the result', () => {
    it('NO perStoreyOverrides ⇒ byte-identical to the no-override options call', () => {
        const baseline = generateHouseLayoutOptions(SHELL, PROGRAM, CONSTRAINTS, WEIGHTS, { storeyCount: 2 }, 3);
        const same = generateHouseLayoutOptions(
            SHELL, PROGRAM, CONSTRAINTS, WEIGHTS, { storeyCount: 2, perStoreyOverrides: undefined }, 3,
        );
        expect(JSON.stringify(same)).toEqual(JSON.stringify(baseline));
        // An all-empty override array is also a no-op (the gate).
        const empty = generateHouseLayoutOptions(
            SHELL, PROGRAM, CONSTRAINTS, WEIGHTS, { storeyCount: 2, perStoreyOverrides: [{}, {}] }, 3,
        );
        expect(JSON.stringify(empty)).toEqual(JSON.stringify(baseline));
    });

    it('an upper-storey override CHANGES the produced layout (the feature is live)', () => {
        const baseline = generateHouseLayoutOptions(SHELL, PROGRAM, CONSTRAINTS, WEIGHTS, { storeyCount: 2 }, 3);
        const overrides: PerStoreyProgramOverride[] = [];
        overrides[1] = { bedrooms: 4, bathrooms: 2 };
        const withOverride = generateHouseLayoutOptions(
            SHELL, PROGRAM, CONSTRAINTS, WEIGHTS, { storeyCount: 2, perStoreyOverrides: overrides }, 3,
        );
        // Both still produce variants…
        expect(baseline.length).toBeGreaterThan(0);
        expect(withOverride.length).toBeGreaterThan(0);
        // …and the override's effect is observable (a different upper-storey layout).
        expect(JSON.stringify(withOverride)).not.toEqual(JSON.stringify(baseline));
    });

    it('is deterministic with an override (same input → identical result)', () => {
        const overrides: PerStoreyProgramOverride[] = [{ bathrooms: 1 }, { bedrooms: 3 }];
        const a = generateHouseLayoutOptions(SHELL, PROGRAM, CONSTRAINTS, WEIGHTS, { storeyCount: 2, perStoreyOverrides: overrides }, 3);
        const b = generateHouseLayoutOptions(SHELL, PROGRAM, CONSTRAINTS, WEIGHTS, { storeyCount: 2, perStoreyOverrides: overrides }, 3);
        expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
    });
});
