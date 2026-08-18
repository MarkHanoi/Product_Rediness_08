/**
 * ElementTypeCatalogRegistry — §FEAT-ELEMENT-TYPE-PICKER-REGISTRY
 * ===============================================================
 *
 * ── WHY THIS EXISTS: THE ROOT CAUSE OF THE MISSING PICKERS ───────────────────
 *
 * `_buildTypeSelector` (PropertyPanelTypeSelector.ts) is a hand-written if-ladder,
 * one `if (elType === 'x')` branch per family, each importing a bespoke widget and
 * hand-writing its own `element.changeType` dispatch. The ladder is not derived from
 * anything — it IS the answer to "which families have a type picker?".
 *
 * That is exactly why the previous generalisation pass (§FEAT-ELEMENT-CHANGE-TYPE
 * ADR-0105, then §FIX-HOSTED-TYPE-CHANGE L-620, §FIX-CEILING-TYPE-SWAP L-621,
 * §FIX-PLUMBING-TYPE-SWAP L-622, §FIX-TYPE-SWAP-ALL-FAMILIES L-623) fixed EVERY
 * family that already had a picker and reached NONE that did not: it audited the
 * ladder's branches, and a family with no branch has no branch to audit. It is
 * structurally invisible to a review of the thing it is missing from. Lighting,
 * roof, stair-railing, room and lift were each absent for that one reason.
 *
 * The cure is not more branches. It is to make the question ANSWERABLE FROM DATA:
 * a family declares a type catalogue HERE, and the panel derives the picker from the
 * declaration. A new element family that ships a catalogue gets a picker without
 * touching the panel; one that ships WITHOUT a catalogue is declared here too, with
 * the reason, so the panel can say so honestly instead of rendering nothing (which
 * is indistinguishable from a bug — the founder's "Element Type —").
 *
 * ── CONTRACT ────────────────────────────────────────────────────────────────
 *
 *  - §01 CORE / P6: this module READS catalogues. It performs no store writes and
 *    dispatches nothing; the panel dispatches `element.changeType` on the caller's
 *    behalf, the one uniform mutation surface (ADR-0105).
 *  - The bespoke widgets keep precedence: families whose picker carries extra
 *    affordances (a wall's layer stack, a column's steel-profile sub-list) are still
 *    served by their own widget, and the registry serves everything else. This
 *    registry is the FLOOR, not a replacement.
 *  - `family` keys are `normalizeType()` output, so the panel looks up exactly what
 *    it computed.
 */

import { BUILT_IN_LIGHTING_TYPES } from '@pryzm/geometry-lighting';
import { curtainWallTypeStore } from '@pryzm/core-app-model/stores';

/** One selectable entry in a family's type dropdown. */
export interface TypeChoice {
    id: string;
    name: string;
    /** Optional metadata line ("1100 mm · Glass", "Ceiling"), shown after the name. */
    detail?: string;
}

/**
 * A family's declaration. EITHER it publishes a catalogue (`listTypes`), OR it
 * declares honestly why it has none (`unavailableReason`) — never neither, and the
 * coverage spec asserts that.
 */
export interface ElementTypeCatalog {
    /** `normalizeType()` output this declaration serves. */
    family: string;
    /** Row label, e.g. 'Lighting Type'. */
    label: string;
    /** The selectable types, newest state each time (catalogues are mutable stores). */
    listTypes?(): TypeChoice[];
    /** The element's current type id, read from its record — never guessed. */
    currentTypeId?(elementData: Record<string, any>): string | undefined;
    /**
     * Set INSTEAD of `listTypes` when the family genuinely has no catalogue yet.
     * The panel renders this sentence in place of a dropdown, so "this element has
     * no types to choose from" is a statement the product makes on purpose rather
     * than an empty space the user has to interpret.
     */
    unavailableReason?: string;
    /**
     * Set when the family has a catalogue but no `element.changeType` route yet, so
     * the picker would be a dead control. Rendered like `unavailableReason`, but it
     * names a different debt and the coverage spec counts them separately.
     */
    readOnlyReason?: string;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * The declarations. Families served by a BESPOKE widget (wall, slab, ceiling, floor,
 * door, window, column, beam, stair, stair-railing, railing/handrail, plumbing,
 * furniture) are intentionally absent — see the precedence note in the header.
 */
const CATALOGS: ElementTypeCatalog[] = [
    // ── LIGHTING — the founder's second reported instance ────────────────────
    // A catalogue existed nowhere: `LightingFixtureType` is a string-literal union
    // (not enumerable at runtime) and the only per-type tables were keyed lookups,
    // not lists. `BUILT_IN_LIGHTING_TYPES` is the enumerable naming layer added for
    // this; what each fixture EMITS stays in LIGHTING_FIXTURE_PHOTOMETRY.
    // The `element.changeType` route already existed (initBusHandlers, lighting →
    // UpdateLightingParametersCommand) and had no UI call site at all.
    {
        family: 'lighting',
        label: 'Lighting Type',
        listTypes: () => BUILT_IN_LIGHTING_TYPES.map(t => ({
            id: t.id,
            name: t.name,
            detail: cap(t.mount),
        })),
        currentTypeId: (d) => d.fixtureType,
    },

    // ── ROOF — a picker that was never built for a route that already worked ──
    // Roof's type is `RoofData.roofType`, a closed union with no catalogue store;
    // §FIX-TYPE-SWAP-ALL-FAMILIES added its `element.changeType` branch but no
    // widget, so the route has been reachable by the AI plane and unreachable by
    // the user ever since. The union IS the catalogue here — declared inline
    // because there is no store to read, and pinned by the coverage spec.
    {
        family: 'roof',
        label: 'Roof Type',
        listTypes: () => ([
            { id: 'flat',    name: 'Flat' },
            { id: 'shed',    name: 'Shed (Mono-pitch)' },
            { id: 'gable',   name: 'Gable' },
            { id: 'hip',     name: 'Hip' },
            { id: 'dutch',   name: 'Dutch (Hip-Gable)' },
            { id: 'gambrel', name: 'Gambrel' },
            { id: 'mansard', name: 'Mansard' },
            { id: 'barrel',  name: 'Barrel Vault' },
        ]),
        currentTypeId: (d) => d.roofType,
    },

    // ── Families with a catalogue but NO change-type route ───────────────────
    // Declared so the panel states the limit rather than showing nothing. Wiring a
    // route for these is real work (a room's type carries occupancy + area rules; a
    // lift's carries car dimensions and a shaft), not a dropdown, and shipping the
    // dropdown first would be a dead control — the exact defect class this pass
    // exists to remove.
    {
        family: 'room',
        label: 'Room Type',
        readOnlyReason: 'Room types are set from the Room panel — changing one here is not wired yet.',
    },
    {
        family: 'lift',
        label: 'Lift Type',
        readOnlyReason: 'Lift types are chosen at placement — in-place type change is not wired yet.',
    },

    // ── CURTAIN WALL — the founder's reported instance (L-958) ───────────────
    // This entry replaced an `unavailableReason` reading "Curtain walls have no
    // published type catalogue — edit the grid and panels directly." That sentence
    // was TRUE and it was the wrong side of the fork: the catalogue mechanism has
    // shipped for every other family, and curtain wall had simply never published
    // one. `CurtainWallTypeStore` is that publication (see its header).
    //
    // ⚠ WHY EVERY TYPE HERE IS GLAZED, AND NONE NAMES A PANEL MATERIAL.
    // The founder asked for twelve, eight of which vary by PANEL material. Those
    // eight are NOT published yet, and the omission is deliberate and measured:
    // `CurtainWallInstanceManager._getPanelMaterial(panelType)` derives a panel's
    // appearance from `PANEL_TYPE_DEFAULTS[panelType]` alone, and its caller
    // `buildInstancedMeshes(cells, panels, mullionSize, panelThickness)` is not
    // even PASSED the curtain wall — so no wall-level material id can reach a
    // panel, whatever the create bridge forwards. Listing "Copper" or "Mirror
    // Green" here before that path exists would put twelve names in a dropdown
    // that render as four appearances: an affordance with no implementation
    // behind it (`WallRake.ts:50-62`), discoverable by the founder in seconds.
    // The pitch axis DOES cross intact, so the pitch types ship and the rest wait.
    {
        family: 'curtainwall',
        label: 'Curtain Wall Type',
        listTypes: () => curtainWallTypeStore.getAll().map(t => {
            const grid = t.transomCourse === undefined
                ? `${t.mullionPitch.toFixed(2)} m pitch · no transom`
                : `${t.mullionPitch.toFixed(2)} m pitch · ${t.transomCourse.toFixed(2)} m course`;
            // §FEAT-CURTAIN-WALL-PANEL-MATERIAL (L-958) — the substitution is shown to the
            // USER, not buried in a commit message. Three of the founder's twelve name a
            // material the master catalogue does not carry yet, and the ruling was to use
            // the nearest existing row FOR NOW. A type called "Mirror glass, green" that
            // quietly renders as plain reflective glass is the silent-substitution defect;
            // one that says so is a stand-in the user can make an informed choice about.
            return {
                id: t.id,
                name: t.name,
                detail: t.substitutionNote ? `${grid} · ⚠ ${t.substitutionNote}` : grid,
            };
        }),
        currentTypeId: (d) => d.systemTypeId,
    },
    {
        family: 'curtain-panel',
        label: 'Panel Type',
        unavailableReason: 'Curtain panels have no published type catalogue — edit the panel directly.',
    },
    {
        family: 'curtain-mullion',
        label: 'Mullion Type',
        unavailableReason: 'Mullions have no published type catalogue — edit the profile directly.',
    },
    {
        family: 'grid',
        label: 'Grid Type',
        unavailableReason: 'Grids are datums, not typed elements.',
    },
    {
        family: 'annotation',
        label: 'Annotation Type',
        unavailableReason: 'Annotations are typed by the tool that created them.',
    },
    {
        family: 'opening',
        label: 'Opening Type',
        unavailableReason: 'An opening takes its type from the door or window that hosts it.',
    },
];

const BY_FAMILY: ReadonlyMap<string, ElementTypeCatalog> =
    new Map(CATALOGS.map(c => [c.family, c]));

/** Every declaration, for the coverage spec and for tooling. */
export function allElementTypeCatalogs(): readonly ElementTypeCatalog[] {
    return CATALOGS;
}

/**
 * The declaration for a `normalizeType()` family, or null when the family is served
 * by a bespoke widget (or is not an element the panel types at all).
 */
export function resolveElementTypeCatalog(family: string): ElementTypeCatalog | null {
    return BY_FAMILY.get(family) ?? null;
}
