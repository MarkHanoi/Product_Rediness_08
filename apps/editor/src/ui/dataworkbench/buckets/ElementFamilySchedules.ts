/**
 * ElementFamilySchedules — the DATA bucket's tab list, DERIVED FROM THE ELEMENT
 * REGISTRY rather than hand-written.
 *
 * Layer Affected: UI — Data Workbench › DATA bucket (L7)
 * Contract:       C84 EI-1 (one authority per family) · C84 EI-13 (an emitter
 *                 with no consumer is a DECLARED gap, not a silent one) ·
 *                 C66 §1.1 by analogy.
 * §ELEMENT-FAMILY-CENSUS (L-4850), lane MEDI14, 2026-08-22.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * ⭐ WHY A TABLE AND NOT AN ARRAY — THE DEFECT THIS FILE EXISTS TO PREVENT
 * ═════════════════════════════════════════════════════════════════════════════
 * The DATA bucket listed nine tabs: Materials, Walls, Doors, Windows, Floors,
 * Slabs, Columns, Beams, Stairs. Founder, 2026-08-22: *"I would like to have all
 * the elements, all of them."*
 *
 * The nine were a HAND-WRITTEN ARRAY in `DataWorkbench.ts`, and a hand-written
 * array of families is precisely how nine families went missing from the
 * double-click zoom earlier the same day. An array cannot tell you what it
 * omits — it has no relationship to the vocabulary it is supposed to enumerate.
 *
 * ⛔ SO THIS IS A `Record<StoreType, …>`, KEYED ON THE ELEMENT REGISTRY'S OWN
 * UNION. `StoreType` in `@pryzm/core-app-model/ElementRegistry` is the single
 * authoritative id→store routing vocabulary for all PRYZM data. Because this is
 * a total Record over it, **`tsc` FAILS THE BUILD the moment a family is added
 * to the registry and not given a decision here.** The list cannot silently fall
 * behind the model; that is the whole architectural point, and it is why the
 * cost of this file is a compile error rather than a missing tab nobody notices.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * ⛔ A FAMILY WITH NO TYPE REGISTRY GETS A TAB THAT SAYS SO
 * ═════════════════════════════════════════════════════════════════════════════
 * Roofs, handrails and curtain walls are real, placeable, MEASURED elements with
 * **no system-type registry at all** — there is nothing to tabulate. The wrong
 * answer is to leave them out: an absent tab and a tab reading "no types exist
 * for this family" are different claims, and only the second is true. This is
 * the take-off's own coverage-table rule applied to the DATA bucket.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * ⚠ A REAL FINDING, RECORDED HERE BECAUSE THIS IS WHERE IT SURFACED
 * ═════════════════════════════════════════════════════════════════════════════
 * **`lighting` IS NOT A MEMBER OF `StoreType`.** Measured 2026-08-22:
 *   grep -n "export type StoreType" packages/core-app-model/src/ElementRegistry.ts
 * lists 26 members and lighting is not among them — yet `window.lightingStore`
 * exists (`BrowserDataHelpers.ts` documents it), `packages/geometry-lighting`
 * exists, and `BUILT_IN_LIGHTING_TYPES` exists. So a placed light is routed by
 * the registry under some OTHER member or not at all.
 *
 * ⛔ THIS FILE DOES NOT "FIX" THAT BY ADDING A LIGHTING TAB OFF-REGISTRY. Doing
 * so would re-create the exact hand-list defect one row lower down, and it would
 * paper over a routing question that belongs to C84 EI-1 and to whoever owns the
 * lighting family. It is logged (ISSUE-LOG L-4851) and left visible.
 */

import type { StoreType } from '@pryzm/core-app-model';
import { wallSystemTypeStore } from '@pryzm/geometry-wall';
import { plumbingSystemTypeStore } from '@pryzm/geometry-plumbing';
import { ceilingSystemTypeStore } from '@pryzm/core-app-model/stores';
import {
    wallTypeRows, doorTypeRows, windowTypeRows, floorTypeRows,
    slabTypeRows, columnTypeRows, beamTypeRows, stairTypeRows,
} from './DataSchedulesBucket';
import { formatMetres } from './DWHelpers';

export interface TypeScheduleData { columns: string[]; rows: string[][] }

/**
 * One element family's place in the DATA bucket.
 *
 * ⭐ `rows: null` + a `reason` is a FIRST-CLASS STATE, not a hole. It renders a
 * real tab that says what the family is and why it has no type schedule.
 */
export interface FamilyScheduleDef {
    /** The tab label. */
    readonly label: string;
    readonly icon: string;
    /** Panel title. */
    readonly title: string;
    /** The type rows, or `null` when this family has no type registry. */
    readonly rows: (() => TypeScheduleData) | null;
    /** Why there is no schedule. REQUIRED whenever `rows` is null. */
    readonly reason: string | null;
    /**
     * `false` ⇒ deliberately not its own tab. Used ONLY for the three
     * `*SystemType` PRESET namespaces, whose types are already the content of
     * another family's tab — showing `slabSystemType` beside `slab` would be the
     * same table twice under two names (C84 EI-8, one vocabulary per concept).
     * A `false` here still requires a `reason`, so the omission is stated.
     */
    readonly showAsTab: boolean;
}

// ── Small schedules for families whose registry is not already tabulated ──────

function ceilingTypeRows(): TypeScheduleData {
    const types = ceilingSystemTypeStore.getAll();
    return {
        columns: ['Name', 'Total Thickness', '# Layers', 'Layer Breakdown', 'Category', 'Description'],
        rows: types.map((t) => {
            const anyT = t as unknown as Record<string, unknown>;
            const layers = (anyT.layers as Array<Record<string, unknown>> | undefined) ?? [];
            return [
                String(anyT.name ?? anyT.id ?? '—'),
                formatMetres(Number(anyT.totalThickness ?? 0)),
                String(layers.length),
                layers.length === 0
                    ? '—'
                    : layers.map((l) => `${String(l.name)} (${String(l.function)}, ${Math.round(Number(l.thickness ?? 0) * 1000)}mm)`).join(' | '),
                String(anyT.category ?? '—'),
                String(anyT.description ?? '—'),
            ];
        }),
    };
}

function plumbingTypeRows(): TypeScheduleData {
    const types = plumbingSystemTypeStore.getAll();
    return {
        columns: ['Name', 'ID', 'Fixture', 'Category', 'Type'],
        rows: types.map((t) => {
            const anyT = t as unknown as Record<string, unknown>;
            return [
                String(anyT.name ?? anyT.id ?? '—'),
                String(anyT.id ?? '—'),
                String(anyT.fixtureType ?? anyT.kind ?? '—'),
                String(anyT.category ?? '—'),
                anyT.isBuiltIn ? 'Built-in' : 'Custom',
            ];
        }),
    };
}

/** Wall types again, but for the OPENING family: an opening is cut by its host. */
function openingHostRows(): TypeScheduleData {
    const types = wallSystemTypeStore.getAll();
    return {
        columns: ['Host wall type', 'Total Thickness', 'Reveal depth an opening inherits'],
        rows: types.map((t) => [t.name, formatMetres(t.totalThickness), formatMetres(t.totalThickness)]),
    };
}

// ── THE TABLE. Total over StoreType — tsc enforces it. ────────────────────────

const NO_REGISTRY = (family: string, extra: string): string =>
    `PRYZM has NO system-type registry for ${family}. This tab exists and is empty ON PURPOSE: `
    + `an absent tab and a tab saying "this category has no types" are different claims, and only the `
    + `second one is true. ${extra}`;

export const ELEMENT_FAMILY_SCHEDULES: Record<StoreType, FamilyScheduleDef> = {
    wall: {
        label: 'Walls', icon: '▬', title: 'Wall Types',
        rows: wallTypeRows, reason: null, showAsTab: true,
    },
    slab: {
        label: 'Slabs', icon: '▤', title: 'Slab Types',
        rows: slabTypeRows, reason: null, showAsTab: true,
    },
    ceiling: {
        label: 'Ceilings', icon: '▢', title: 'Ceiling Types',
        rows: ceilingTypeRows, reason: null, showAsTab: true,
    },
    floor: {
        label: 'Floors', icon: '▦', title: 'Floor Types',
        rows: floorTypeRows, reason: null, showAsTab: true,
    },
    column: {
        label: 'Columns', icon: '│', title: 'Column Types (UC)',
        rows: columnTypeRows, reason: null, showAsTab: true,
    },
    beam: {
        label: 'Beams', icon: '─', title: 'Beam Types (UB)',
        rows: beamTypeRows, reason: null, showAsTab: true,
    },
    stair: {
        label: 'Stairs', icon: '⋮', title: 'Stair Types',
        rows: stairTypeRows, reason: null, showAsTab: true,
    },
    window: {
        label: 'Windows', icon: '▪', title: 'Window Types',
        rows: windowTypeRows, reason: null, showAsTab: true,
    },
    door: {
        label: 'Doors', icon: '▭', title: 'Door Types',
        rows: doorTypeRows, reason: null, showAsTab: true,
    },
    plumbing: {
        label: 'Plumbing', icon: '⚲', title: 'Plumbing Fixture Types',
        rows: plumbingTypeRows, reason: null, showAsTab: true,
    },
    opening: {
        label: 'Openings', icon: '◫', title: 'Opening Hosts',
        rows: openingHostRows,
        reason: null,
        showAsTab: true,
    },
    roof: {
        label: 'Roofs', icon: '◭', title: 'Roof Types',
        rows: null,
        reason: NO_REGISTRY('roofs',
            'A roof carries a free-text `roofType` on the instance and no shared build-up, which is '
            + 'also why the take-off measures roofs in PLAN area with no material attribution: there is '
            + 'no layer stack to split a volume across.'),
        showAsTab: true,
    },
    handrail: {
        label: 'Handrails', icon: '≡', title: 'Handrail Types',
        rows: null,
        reason: NO_REGISTRY('handrails / balustrades',
            'A handrail carries a `fillType` on the instance. It is also why the take-off can measure '
            + 'handrails in linear metres but never in volume — no rail SECTION is modelled anywhere.'),
        showAsTab: true,
    },
    curtainwall: {
        label: 'Curtain walls', icon: '▥', title: 'Curtain Wall Types',
        rows: null,
        reason: NO_REGISTRY('curtain walls',
            'The system is described per instance by its grid and panel assignment. The take-off '
            + 'therefore reports gross elevation m² and breaks out neither mullion metres nor pane areas.'),
        showAsTab: true,
    },
    'curtain-panel': {
        label: 'Curtain panels', icon: '▧', title: 'Curtain Panel Types',
        rows: null,
        reason: NO_REGISTRY('curtain panels',
            'Panels carry a validated `panelType` enum (`VALID_PANEL_TYPES` in @pryzm/geometry-curtain-wall) '
            + 'but no type RECORDS with properties, so there is nothing to tabulate beyond the enum itself.'),
        showAsTab: true,
    },
    furniture: {
        label: 'Furniture', icon: '⌸', title: 'Furniture Types',
        rows: null,
        reason: NO_REGISTRY('furniture',
            'Furniture is placed from a catalogue of GLB assets rather than from parametric system types. '
            + 'A furniture SCHEDULE (what is placed, where) is a different artefact from a TYPE schedule '
            + 'and is not built.'),
        showAsTab: true,
    },
    room: {
        label: 'Rooms', icon: '◻', title: 'Room Types',
        rows: null,
        reason: NO_REGISTRY('rooms in this bucket',
            '⚠ NOT THE SAME AS "no room types exist": `RoomSystemTypeStore` DOES exist in '
            + '@pryzm/room-topology, and room occupancy types are validated by `RoomOccupancyTypeSchema`. '
            + 'Wiring it here is a real, small, buildable gap — it is stated rather than quietly omitted, '
            + 'which is the whole reason this row is present.'),
        showAsTab: true,
    },
    level: {
        label: 'Levels', icon: '═', title: 'Levels',
        rows: null,
        reason:
            'A LEVEL is not a typed element — it is a datum, and every level is unique to its project. '
            + 'There is nothing a "level type" would mean. The levels of THIS project are listed in the '
            + 'Project Browser and in the AUDIT › Hierarchy tab, which is the right home for an instance list.',
        showAsTab: true,
    },
    grid: {
        label: 'Grids', icon: '╬', title: 'Grids',
        rows: null,
        reason:
            'A GRID is a per-project datum like a level, not a typed element. Its instances belong in the '
            + 'Project Browser rather than in a type schedule.',
        showAsTab: true,
    },
    verticalCirculation: {
        label: 'Lifts', icon: '⇅', title: 'Lift Types',
        rows: null,
        reason: NO_REGISTRY('lifts in this bucket',
            '⚠ AGAIN NOT THE SAME AS "none exist": `BUILT_IN_LIFT_TYPES` and `LiftTypeStore` DO exist in '
            + '@pryzm/geometry-lift. Wiring them here is a buildable gap, stated rather than hidden. '
            + 'NOTE ALSO that a lift is NOT measured by the take-off at all — it is a peer of `stair` in the '
            + 'registry and has no measurer.'),
        showAsTab: true,
    },
    'stair-landing': {
        label: 'Stair landings', icon: '⌷', title: 'Stair Landings',
        rows: null,
        reason:
            'A landing is a PART of a stair, not an independently typed element: it is routed separately by '
            + 'the registry so it can be selected and deleted, and its properties come from its parent stair. '
            + 'Landing AREA is measured — see MEDICIONES › Take-off, on the stair line.',
        showAsTab: false,
    },
    'stair-railing': {
        label: 'Stair railings', icon: '⌗', title: 'Stair Railings',
        rows: null,
        reason:
            'A stair railing is a PART of a stair with a `RailingType` on its parent, not an independently '
            + 'typed element. Free-standing balustrades are the `handrail` family and have their own row.',
        showAsTab: false,
    },
    annotation: {
        label: 'Annotations', icon: '✎', title: 'Annotations',
        rows: null,
        reason:
            'Annotations are drawing content, not building elements. They carry no types and appear in no '
            + 'take-off — a dimension string is not a quantity of anything.',
        showAsTab: false,
    },
    // ── The three PRESET namespaces. Registered in `StoreType` so their ids
    // route, but they are not element families: their content IS the type table
    // shown on the corresponding element's own tab. Two tabs over one table
    // would be C84 EI-8 (one vocabulary per concept) violated in the UI.
    slabSystemType: {
        label: 'Slab types (preset)', icon: '▤', title: 'Slab System Types',
        rows: null,
        reason: 'A PRESET namespace, not an element family. Its content is the Slabs tab.',
        showAsTab: false,
    },
    ceilingSystemType: {
        label: 'Ceiling types (preset)', icon: '▢', title: 'Ceiling System Types',
        rows: null,
        reason: 'A PRESET namespace, not an element family. Its content is the Ceilings tab.',
        showAsTab: false,
    },
    floorSystemType: {
        label: 'Floor types (preset)', icon: '▦', title: 'Floor System Types',
        rows: null,
        reason: 'A PRESET namespace, not an element family. Its content is the Floors tab.',
        showAsTab: false,
    },
};

/** The tab id for one family. Stable and derived — never hand-written. */
export function familyTabId(family: StoreType): string {
    return `data-${family}-types`;
}

/** The families that get their own DATA tab, in a stable, readable order. */
export const DATA_TAB_FAMILIES: readonly StoreType[] = (
    Object.keys(ELEMENT_FAMILY_SCHEDULES) as StoreType[]
).filter((f) => ELEMENT_FAMILY_SCHEDULES[f].showAsTab);

/**
 * ⛔ THE GATE THAT MAKES THE HEADER TRUE. Returns every family that declares no
 * schedule AND no reason. Must always be empty: a blank reads as "fine", and a
 * family with neither a table nor an explanation is exactly the silent omission
 * this file was written to make impossible.
 */
export function familiesWithNeitherScheduleNorReason(): readonly StoreType[] {
    return (Object.keys(ELEMENT_FAMILY_SCHEDULES) as StoreType[])
        .filter((f) => {
            const d = ELEMENT_FAMILY_SCHEDULES[f];
            return d.rows === null && (!d.reason || d.reason.trim().length < 20);
        });
}
