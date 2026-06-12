// D-FLE F7 — per-room furnishing entry (SPEC-FURNITURE-LAYOUT-ENGINE §2).
// Picks the archetype for the room's occupancy and runs the placement solver.
// Pure; rooms with no archetype (corridor/unknown) furnish to [].
//
// A.21.D20 (2026-06-06) — kitchen rooms now route to the dedicated I/L/U run
// planner (`planKitchen`) which lays base units + appliances IN the run
// honouring the work-triangle; bedrooms route the wardrobe through the I/L/U
// `planWardrobe` planner. Both are gated by the optional `FurnishOptions`
// (the `kitchenLayout` / `wardrobeLayout` brief fields); default 'auto'.

import { archetypeFor } from './archetypes.js';
import { placeRoom, placeRoomMulti } from './placeSolver.js';
import { planKitchen, planKitchenRun, normaliseKitchenLayout, type KitchenLayout } from './kitchenLayout.js';
import { planWardrobe, normaliseWardrobeLayout, type WardrobeLayout } from './wardrobeLayout.js';
import { placeBedsideLamps } from './bedsideLamps.js';
import {
    chooseBedType, applyBedType, bedHasIntegratedBedside, placeIntegratedBedLamps,
    type BedType,
} from './bedVariety.js';
import { preferCornerSofa, polygonExtent, applyCornerSofa } from './sofaVariety.js';
import {
    validateLivingLayout, formatLivingViolations,
    scoreLivingLayout, formatLivingScore,
} from './rules/livingValidation.js';
import type { FurnishRoomInput, PlacedFurniture } from './types.js';

/** A.21.D20 — per-run furnishing options (sourced from the typology brief).
 *  All optional; absent fields default to 'auto'. */
export interface FurnishOptions {
    /** Kitchen run shape — 'auto' (engine picks by aspect) | 'I' | 'L' | 'U'. */
    readonly kitchenLayout?: KitchenLayout | string;
    /** Wardrobe run shape — 'auto' | 'I' | 'L' | 'U'. */
    readonly wardrobeLayout?: WardrobeLayout | string;
    /** When true, the kitchen run includes a washing machine (no utility room). */
    readonly kitchenWashingMachine?: boolean;
}

export function furnishRoom(input: FurnishRoomInput, options: FurnishOptions = {}): PlacedFurniture[] {
    if (input.occupancy === 'kitchen') {
        // §KITCHEN-PARAMETRIC-RUN (2026-06-10) — emit ONE parametric kitchen run
        // (rendered by the GOOD KitchenCabinetEngine: swappable cabinet units +
        // integrated appliances + unified countertop) instead of the legacy
        // concatenation of individual appliance box proxies. Falls back to the
        // per-item `planKitchen` only if the run planner can't build one (a
        // degenerate room) so a kitchen is never left bare.
        const kl = normaliseKitchenLayout(options.kitchenLayout);
        const run = planKitchenRun(input, kl, { washingMachine: !!options.kitchenWashingMachine });
        if (run.length > 0) return run;
        return planKitchen(input, kl, { washingMachine: !!options.kitchenWashingMachine });
    }
    const baseArchetype = archetypeFor(input.occupancy);
    if (!baseArchetype || baseArchetype.items.length === 0) return [];

    // §67.2 (2026-06-11) — bedroom bed variety: pick a coherent bed set per room
    // (deterministic by room id). §67.3 — living-room L-sofa: swap the straight
    // sofa for a corner sofa when the room is large enough and one fits.
    let archetype = baseArchetype;
    let bedType: BedType | null = null;
    if (input.occupancy === 'bedroom') {
        // §BED-4-TYPES (founder #10) — rotate across the 4 picker bed types by
        // room id. A Japanese variant builds its own bedside surfaces → applyBedType
        // drops the separate bedside_table items (consistency).
        bedType = chooseBedType(input.roomId);
        archetype = applyBedType(baseArchetype, bedType);
    } else if (input.occupancy === 'living-room') {
        const ext = polygonExtent(input.polygon);
        archetype = applyCornerSofa(baseArchetype, preferCornerSofa(input.areaM2, ext.w, ext.d));
    }

    const placed = placeRoom(input, archetype);

    // §LIVING-ROOM-RULE-ENGINE (founder #12) — REPORT the living HARD rules + the
    // 8-axis scorecard on §DIAG lines (mirrors the kitchen reportKitchenRules). The
    // layout is preferred-valid by construction (the TV unit seated opposite the
    // sofa via placeMediaOppositeSofa); any residual HARD violation surfaces for the
    // UI rather than crashing. Pure — no side-effect on `placed`.
    if (input.occupancy === 'living-room') {
        reportLivingRules(input, placed);
    }

    if (input.occupancy === 'bedroom') {
        const withWardrobe = withWardrobePlan(input, placed, normaliseWardrobeLayout(options.wardrobeLayout));
        // §BED-4-TYPES CONSISTENCY GUARD — place lamps from EXACTLY ONE source so a
        // bedroom never gets double bedside lamps:
        //   • plain `bed`             → bedsideLamps.ts (one lamp per separate
        //     bedside_table — the existing default).
        //   • platform / walnut bed   → inline lamps on the bed's integrated
        //     nightstands (placeIntegratedBedLamps; no separate tables to ride).
        //   • float bed               → NO extra lamps (the bed mesh has them).
        const lamps = bedType && bedHasIntegratedBedside(bedType)
            ? placeIntegratedBedLamps(input, withWardrobe)
            : placeBedsideLamps(input, withWardrobe);
        return [...withWardrobe, ...lamps];
    }
    return placed;
}

/**
 * Furnish a single room polygon with MULTIPLE archetypes in sequence — the
 * apartment-layout open-plan case: hall + living + kitchen + dining merge into
 * ONE detected room, but each sub-program still needs its own furniture. The
 * archetypes share an obstacle set so placements don't collide; archetypes are
 * placed in the given order (living-room first → sofa claims the longest wall →
 * kitchen run yields to a different wall, etc.). Skips unknown occupancies.
 *
 * A.21.D20 — when the compound includes 'kitchen', the kitchen sub-program is
 * served by `planKitchen` (run + appliances) AFTER the other archetypes have
 * claimed their walls, so the run lands clear of the sofa / dining table.
 */
export function furnishRoomCompound(
    input: FurnishRoomInput, occupancies: readonly string[], options: FurnishOptions = {},
): PlacedFurniture[] {
    const nonKitchen = occupancies.filter(o => o !== 'kitchen');
    const hasKitchen = occupancies.includes('kitchen');
    const archetypes = nonKitchen
        .map(o => archetypeFor(o))
        .filter((a): a is NonNullable<ReturnType<typeof archetypeFor>> => a !== null && a.items.length > 0);

    const placed: PlacedFurniture[] = [];
    if (archetypes.length > 0) placed.push(...placeRoomMulti(input, archetypes));
    if (hasKitchen) {
        // §KITCHEN-PARAMETRIC-RUN — run the parametric run planner in a fresh
        // pass; it re-derives its run walls. (The open-plan polygon is large; the
        // kitchen claims the longest clear wall, which the sofa/dining archetypes
        // left for it.) Falls back to per-item placement on a degenerate room.
        const kl = normaliseKitchenLayout(options.kitchenLayout);
        const wm = !!options.kitchenWashingMachine;
        const run = planKitchenRun(input, kl, { washingMachine: wm });
        placed.push(...(run.length > 0 ? run : planKitchen(input, kl, { washingMachine: wm })));
    }
    return placed;
}

/** §LIVING-ROOM-RULE-ENGINE — run the living HARD-rule validation + scorecard over
 *  the placed living-room furniture and emit the §DIAG-LIVING-RULES / -SCORE lines.
 *  Pure apart from the always-on diagnostic logs (mirrors reportKitchenRules).
 *  Returns the validation result so callers/tests can assert on it. */
function reportLivingRules(
    input: FurnishRoomInput, placed: readonly PlacedFurniture[],
): ReturnType<typeof validateLivingLayout> {
    const res = validateLivingLayout(placed, input);
    const score = scoreLivingLayout(placed, input, {
        valid: res.valid,
        hardFailures: res.violations.map(v => v.rule),
    });
    // eslint-disable-next-line no-console
    console.log(formatLivingViolations(input.roomId, res));
    // eslint-disable-next-line no-console
    console.log(formatLivingScore(input.roomId, 'placed', score));
    return res;
}

/** Replace the generic single `wardrobe` placement with the I/L/U wardrobe run
 *  when the planner can build one; otherwise keep the archetype's wardrobe. */
function withWardrobePlan(
    input: FurnishRoomInput, placed: PlacedFurniture[], layout: WardrobeLayout,
): PlacedFurniture[] {
    const wardrobeIdx = placed.findIndex(p => p.kind === 'wardrobe');
    if (wardrobeIdx < 0) return placed;
    const run = planWardrobe(input, placed, layout);
    if (run.length === 0) return placed;                 // planner couldn't fit → keep original
    const out = placed.filter(p => p.kind !== 'wardrobe');
    out.push(...run);
    return out;
}
