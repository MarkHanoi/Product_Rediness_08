/**
 * @file landscapeCreateItems.ts — §LANDSCAPE-CATALOGUE (L-1380)
 *
 * The LANDSCAPE panel's rows, built ONCE and consumed by BOTH create surfaces.
 *
 * ## Why this file exists rather than a second hand-written list
 *
 * There are two live create panels in this app —
 * `tools-panel/panels/CreateRailPanel.ts` (mounted by `ToolsPanelController`)
 * and `layout/CreatePanelLayout.ts` (mounted by `Layout.ts` → `mountCreatePanel`)
 * — and until this commit BOTH carried their own hand-typed copy of the same
 * eight `Plant 0N` rows. Two rival surfaces maintained by hand is precisely how
 * the two GIS surfaces in this repo diverged, one of them silently no-op.
 *
 * ⛔ So the rows are NOT re-authored here either. They are derived from
 * `LANDSCAPE_CATALOGUE` in `@pryzm/geometry-furniture`, which is itself derived
 * from `TREE_SPECIES_TABLE`. A species added to the species table appears in
 * both panels, with its real specification, without anyone remembering to.
 *
 * ## What the user sees change
 *
 * BEFORE: `Plant 01` … `Plant 08` — eight identical droplet icons, no species,
 *         no size, no distinction of any kind, and NONE of the 25-species
 *         parametric outdoor tree library the app has shipped for months.
 * AFTER:  **Trees** — 25 real species with mature height, canopy diameter and
 *         clear height beneath the crown; **Potted Plants** — the eight
 *         container plantings, named for what they actually are.
 *
 * ## Reach, not reimplementation
 *
 * ⭐ Every row activates the SAME creation route the furniture carousel already
 * uses — `service.activateFurnitureTool(type)` → `ToolManager.activateFurniture`
 * → `FurniturePlanToolHandler` / `FurnitureTool`. No second placement path is
 * minted here; the panel is a new *door* onto the existing route.
 */

import {
    LANDSCAPE_TREE_ENTRIES,
    LANDSCAPE_POTTED_ENTRIES,
    formatLandscapeSpec,
    formatLandscapeLabel,
    type LandscapeEntry,
    type PlantingTypeClass,
} from '@pryzm/geometry-furniture';

/** The minimal row shape BOTH create panels consume (`CreateItem`). */
export interface LandscapeCreateItem {
    label:  string;
    icon:   string;
    action: () => void;
}

/**
 * Icon per botanical class — TOTAL by construction, so a new
 * `PlantingTypeClass` is a compile error until it has an icon.
 *
 * This is the direct fix for "eight identical droplet icons": the glyph now
 * carries information (a columnar conifer no longer looks like a table vase).
 */
const ICON_FOR_CLASS: Readonly<Record<PlantingTypeClass, string>> = {
    'deciduous':            'material-symbols:park',
    'evergreen-broadleaf':  'material-symbols:nature',
    'conifer':              'material-symbols:forest',
    'palm':                 'material-symbols:eco',
    'ornamental-flowering': 'material-symbols:local-florist',
    'hedge-screen':         'material-symbols:fence',
    'potted':               'material-symbols:potted-plant',
};

/**
 * `CreateItem` has no sub-label slot, so the specification rides in the label
 * after an em-dash. That is deliberate: the two numbers that decide whether a
 * tree fits (mature height and canopy diameter) must be visible AT THE MOMENT
 * OF CHOICE, not one panel deeper. `Plant 03` was unchoosable precisely because
 * it carried none.
 */
function toItem(e: LandscapeEntry, activate: (t: string) => void): LandscapeCreateItem {
    return {
        label:  `${formatLandscapeLabel(e)} — ${formatLandscapeSpec(e)}`,
        icon:   ICON_FOR_CLASS[e.typeClass],
        action: () => activate(e.furnitureType),
    };
}

/** 25 ground-planted species, in species-table order. */
export function buildTreeCreateItems(activate: (t: string) => void): LandscapeCreateItem[] {
    return LANDSCAPE_TREE_ENTRIES.map(e => toItem(e, activate));
}

/** 8 container plantings. Separate group — see `LandscapeGroup`. */
export function buildPottedPlantCreateItems(activate: (t: string) => void): LandscapeCreateItem[] {
    return LANDSCAPE_POTTED_ENTRIES.map(e => toItem(e, activate));
}
