/**
 * materialUsageRegistry — the DERIVED element-family axis of the Material Schedule.
 *
 * Layer Affected: UI — Data Workbench › Data Schedules › Material Schedule
 * Contract:       C100 §6.1 (every surface that displays a material is populated
 *                 from the master), C100 §8.2 S11 (the schedule).
 * Issues:         L-8600 .. L-8606 (lane MAT50, 2026-08-23)
 *
 * ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────
 *
 * `DataSchedulesBucket.mountMaterialSchedule()` used to carry the element axis as
 * a HAND-TYPED six-string array:
 *
 *     const ELEMENT_CATS = ['Wall', 'Floor', 'Slab', 'Ceiling', 'Door', 'Window'];
 *
 * beside five hand-written marker calls. A hand-copied list beside the thing it is
 * supposed to describe is the defect shape this repository has been bitten by
 * repeatedly (§BARREL-FORWARDS-THE-SET-NOT-A-COPY, L-5250; the contract-index
 * count/range recurrence in CLAUDE.md). It had already failed in BOTH directions
 * at the time of writing, measured 2026-08-23:
 *
 *   • 'Ceiling' was a column with NO marker — 329 dashes, forever (L-8600).
 *   • `handrailTypeStore` carries 44 types and 26 distinct materialIds and had
 *     NO column at all — real data the founder owns, invisible (L-8601).
 *
 * So the axis is DERIVED here instead: one row per family, the collector is
 * generic, and `materialUsageRegistry.test.ts` asserts the registry covers every
 * exported type-store singleton in the repository — a SET equality in both
 * directions, never a count. A count can be right while the membership is wrong,
 * which is exactly how the six-string array survived.
 *
 * ── THE THIRD STATE, AND WHY A DASH WAS A LIE ───────────────────────────────
 *
 * A cell used to have two renderings and THREE meanings. '—' meant both:
 *
 *   (a) "this family is wired, and does not happen to use this material"  and
 *   (b) "this family cannot carry a material reference at all"
 *
 * which is §CONTEXT-DATA-HONESTY exactly — *failure and empty are the same
 * value*. Three of the nine families measured below are in state (b), so a user
 * reading a Ceiling dash concluded "no ceiling uses concrete" when the truth is
 * "no ceiling can name any material". Those are opposite facts with opposite
 * fixes (C01 §6 rule 6).
 *
 * `FamilyMaterialState` splits them. `'unseeded'` renders as its own glyph with
 * its own legend, so the gap is NAMED rather than dressed as an absence.
 *
 * ⛔ NOTHING IS DELETED to achieve this. The Ceiling column stays; it just stops
 * claiming to be an answer. Ceiling / CurtainWall / Plumbing are UNSEEDED, not
 * unreachable and not absent: each store is exported, each type declares a
 * material slot, and zero built-ins fill one. See L-8602 for why seeding them is
 * a separate, graphics-affecting decision rather than a tidy-up.
 */

import { wallSystemTypeStore }   from '@pryzm/geometry-wall';
import { doorSystemTypeStore }   from '@pryzm/geometry-door';
import { windowSystemTypeStore } from '@pryzm/geometry-window';
import { slabSystemTypeStore }   from '@pryzm/geometry-slab';
import {
    floorSystemTypeStore,
    ceilingSystemTypeStore,
    handrailTypeStore,
    curtainWallTypeStore,
} from '@pryzm/core-app-model/stores';

// ── Generic collection ───────────────────────────────────────────────────────

/** Guard against a pathological or cyclic type graph. Deepest real shape
 *  measured is handrail at 4 (type → parts → layers → materialId). */
const MAX_DEPTH = 8;

/**
 * Collect every `materialId` reachable inside an arbitrary type record.
 *
 * ⭐ DELIBERATELY STRUCTURAL, not per-family. The code this replaces used six
 * bespoke accessors — `t.layers[].materialId` for wall, `t.frameFinish` +
 * `t.leafFinish` for door, `t.frameFinish` + `t.sillFinish` for window — each of
 * which silently under-reports the moment its family gains a seventh finish slot.
 * A walk cannot miss a slot that exists, so a family that gains one is counted
 * the day it lands rather than the day somebody remembers this file.
 */
export function collectMaterialIds(
    value: unknown,
    out: Set<string> = new Set<string>(),
    depth = 0,
): Set<string> {
    if (depth > MAX_DEPTH || value === null || typeof value !== 'object') return out;
    if (Array.isArray(value)) {
        for (const entry of value) collectMaterialIds(entry, out, depth + 1);
        return out;
    }
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
        if (key === 'materialId') {
            if (typeof val === 'string' && val.length > 0) out.add(val);
            continue;
        }
        collectMaterialIds(val, out, depth + 1);
    }
    return out;
}

// ── Family declaration ───────────────────────────────────────────────────────

/**
 * Whether this family's built-in types can produce a tick AT ALL.
 *
 *  • `seeded`   — at least one built-in type names at least one master material.
 *  • `unseeded` — the family declares a material slot and NO built-in fills it,
 *                 so every cell in its column is structurally empty. Rendering
 *                 that as '—' asserts "not used"; it is really "cannot say".
 */
export type FamilyMaterialState = 'seeded' | 'unseeded';

/** The minimal shape this module needs from a type store. */
export interface TypeStoreLike {
    getAll(): readonly unknown[];
}

export interface MaterialUsageFamily {
    /** Stable key, also the usage-map value. */
    readonly id: string;
    /** Column header shown in the Material Schedule. */
    readonly label: string;
    /** The type store whose built-ins are scanned. */
    readonly store: TypeStoreLike;
}

/**
 * ⭐ THE SET. Every exported `*TypeStore` / `*SystemTypeStore` singleton in the
 * repository appears here — asserted in both directions by
 * `materialUsageRegistry.test.ts`, which fails if a new singleton appears and is
 * not listed, so a family that ships next week cannot silently miss a column.
 *
 * Ordering is presentation only: construction families, then openings, then the
 * families that cannot yet answer — so the honest gaps read together at the end
 * instead of being scattered through the middle of the table.
 */
export const MATERIAL_USAGE_FAMILIES: readonly MaterialUsageFamily[] = [
    { id: 'wall',       label: 'Wall',        store: wallSystemTypeStore     as TypeStoreLike },
    { id: 'floor',      label: 'Floor',       store: floorSystemTypeStore    as TypeStoreLike },
    { id: 'slab',       label: 'Slab',        store: slabSystemTypeStore     as TypeStoreLike },
    { id: 'handrail',   label: 'Handrail',    store: handrailTypeStore       as TypeStoreLike },
    { id: 'door',       label: 'Door',        store: doorSystemTypeStore     as TypeStoreLike },
    { id: 'window',     label: 'Window',      store: windowSystemTypeStore   as TypeStoreLike },
    // The three measured UNSEEDED at 2026-08-23. Present so the gap is VISIBLE
    // and named; see L-8602 before seeding any of them.
    { id: 'ceiling',    label: 'Ceiling',     store: ceilingSystemTypeStore  as TypeStoreLike },
    { id: 'curtainWall', label: 'Curtain Wall', store: curtainWallTypeStore  as TypeStoreLike },
];

/**
 * Type-store singletons deliberately NOT on the axis, each with the reason.
 *
 * ⭐ This list is the POINT of the gate, not an apology for it: the test asserts
 * `registry ∪ excluded == every exported singleton`, so the only way to add a
 * store to the repository without touching this file is to make the test red.
 * "Silently missing" is converted into "explicitly decided".
 */
export const EXCLUDED_TYPE_STORES: ReadonlyArray<{ store: string; reason: string }> = [
    {
        store: 'PlumbingSystemTypeStore',
        reason:
            'Measured 2026-08-23: 19 built-in types, ZERO materialIds — it could only ever add a ' +
            'third un-tickable column. It is also NOT a declared dependency of apps/editor, so ' +
            'importing it would add a package.json + pnpm-lock change (frozen-lockfile risk with ' +
            'concurrent lanes) to buy a column that cannot answer. Add it WITH its seeding, not before.',
    },
    {
        store: 'StairTypeStore',
        reason:
            'Exported as a CLASS with no module-level singleton; stair built-ins are the ' +
            'BUILT_IN_STAIR_TYPES array, whose `defaults.material` is a PROSE string ' +
            '(C100 §4.5 / §8.2 S9), not a master id. Migrating it is S9, not this lane.',
    },
    {
        store: 'LiftTypeStore',
        reason: 'Exported as a class with no singleton; lift shipped 2026-08-22 and has no built-in material slot yet.',
    },
    {
        store: 'RoomSystemTypeStore',
        reason:
            'Rooms carry FINISHES that reference other families rather than a material of their own; ' +
            'room.setMaterial is the legacy stack (L-842, "a reader with no write").',
    },
];

// ── The index ────────────────────────────────────────────────────────────────

export interface MaterialUsageIndex {
    /** materialId → set of family ids that reference it. */
    readonly usageByMaterial: ReadonlyMap<string, ReadonlySet<string>>;
    /** family id → whether that family can produce a tick at all. */
    readonly familyStates: ReadonlyMap<string, FamilyMaterialState>;
    /** The families, in column order. */
    readonly families: readonly MaterialUsageFamily[];
}

/**
 * Build the usage cross-reference by scanning every family's type store.
 *
 * ⚠ SCOPE: this indexes the TYPE CATALOGUE ("which built-in types name this
 * material"), which is what the panel's own legend claims. It is NOT a count of
 * placed elements in the open project — a different question, and one that needs
 * the element stores rather than the type stores. Stated so the number is not
 * read as something it is not.
 *
 * A store that throws is contained, not fatal: one broken family must not blank
 * the whole schedule (§CONTEXT-DATA-HONESTY — it degrades to `unseeded`, the
 * state that says "cannot say", rather than to a silent empty column).
 */
export function buildMaterialUsageIndex(
    families: readonly MaterialUsageFamily[] = MATERIAL_USAGE_FAMILIES,
): MaterialUsageIndex {
    const usageByMaterial = new Map<string, Set<string>>();
    const familyStates    = new Map<string, FamilyMaterialState>();

    for (const family of families) {
        let ids: ReadonlySet<string>;
        try {
            ids = collectMaterialIds(family.store.getAll());
        } catch {
            familyStates.set(family.id, 'unseeded');
            continue;
        }
        familyStates.set(family.id, ids.size > 0 ? 'seeded' : 'unseeded');
        for (const id of ids) {
            let bucket = usageByMaterial.get(id);
            if (bucket === undefined) {
                bucket = new Set<string>();
                usageByMaterial.set(id, bucket);
            }
            bucket.add(family.id);
        }
    }

    return { usageByMaterial, familyStates, families };
}
