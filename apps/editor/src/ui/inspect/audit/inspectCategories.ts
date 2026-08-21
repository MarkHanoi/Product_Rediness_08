/**
 * inspectCategories — §INSPECT-EVERY-CATEGORY (L-2032), 2026-08-21.
 *
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    L7 UI — Inspect panel. PURE declaration: no DOM, no THREE
 *                    (P2), no rAF (P3), no `(window as any)` (P4), no store
 *                    writes (P6). Reading a store global happens in the ZONE
 *                    files, never here.
 * Architectural Classification: A (view-only).
 * Contract:          C84 (element integrity — every element family is a first
 *                    class citizen of every element-facing surface) ·
 *                    C09/P7 (Inspect colouring is VIEW presentation, never
 *                    element state).
 *
 * ── ⛔ THE DEFECT THIS CLOSES, measured 2026-08-21 ──────────────────────────
 *
 * Founder: *"in Inspect mode all categories should be mapped."*
 *
 * MEASURED before this file existed:
 *   • `ELEMENT_TYPE_LABELS` in `ElementTypeSelectorZone.ts` declared SIX
 *     categories — rooms, walls, doors, windows, slabs, columns.
 *   • `apps/editor/src/engine/init*.ts` publishes TWENTY element-family stores
 *     on `window` (`grep -n '^\s*window\.\w*Store\s*=' src/engine/init*.ts`).
 *   • So FOURTEEN families — floors, ceilings, roofs, beams, openings, curtain
 *     walls, curtain panels, stairs, handrails, stair railings, lifts,
 *     furniture, lighting, plumbing — existed in the model and could not be
 *     inspected at all. Not "declared but broken": absent from the dropdown.
 *
 * ⭐ AND THE OMISSION WAS SILENT, WHICH IS THE PART THAT MATTERS. A hand-written
 * category list degrades every time a family is added, and nothing anywhere
 * says so. `__tests__/InspectCategoryCoverage.test.ts` now reads the SAME
 * `window.<x>Store =` assignments out of the engine bootstrap and fails when one
 * has neither a category here nor an explicit, reasoned entry in
 * `NON_ELEMENT_STORE_GLOBALS`. A new element family cannot reach `main` without
 * either being inspectable or being deliberately excluded in writing.
 *
 * ⚠ THIS TABLE IS A CURATION LAYER, NOT THE AUTHORITY ON ATTRIBUTES. The
 * attributes a category can be MAPPED by are derived from the records the panel
 * actually reads (`deriveNumericAttributes` in `ElementTypeSelectorZone.ts`);
 * the hand-written descriptors only add nice labels and units on top of the
 * fields we know. That ordering is deliberate: deriving from the L0 Zod schema
 * instead would derive from a DIFFERENT authority than the one rendered, which
 * is the "two ladders that disagree" defect this repo keeps re-finding.
 */

/** One inspectable element category. */
export interface InspectCategoryDef {
    /** Stable id — the dropdown value and the `pryzm-inspect-element-type` payload. */
    readonly id: string;
    /** Human label, plural, as shown in the dropdown. */
    readonly label: string;
    /** Single glyph shown beside the label. */
    readonly icon: string;
    /**
     * The `window.<key>` global the panel reads records from.
     * TODO(E.<family>.S): replace with `runtime.stores.<family>` when the family
     * stores are exposed on the runtime — the indirection is why this is ONE
     * string per category rather than a `window` reach in four files.
     */
    readonly storeKey: string;
    /**
     * The `userData.elementType` value the BUILDER stamps on this family's meshes.
     *
     * ⚠ NOT derivable from `id`. `DiagnosticMaterialManager.applyGhostWithFocus()`
     * used to guess it by stripping a trailing 's' from the UI label, which works
     * for `walls → wall` and fails for every hyphenated or irregular family
     * (`curtainWalls`, `furniture`, `lighting`, `stairRailings`). Stating it is the
     * difference between "focus that family in 3D" and "focus nothing, silently".
     */
    readonly meshType: string;
}

/**
 * ⭐ THE ONE DECLARATION. Adding an element family to PRYZM means adding a row
 * here (or naming it in `NON_ELEMENT_STORE_GLOBALS` with a reason). The coverage
 * test enforces exactly that.
 *
 * Order is the dropdown order: spatial → structure → openings → circulation →
 * fittings, i.e. the order an architect reads a model in.
 */
export const INSPECT_CATEGORIES = [
    { id: 'rooms',         label: 'Rooms',          icon: '▪', storeKey: 'roomStore',         meshType: 'room' },
    { id: 'walls',         label: 'Walls',          icon: '▬', storeKey: 'wallStore',         meshType: 'wall' },
    { id: 'curtainWalls',  label: 'Curtain Walls',  icon: '▦', storeKey: 'curtainWallStore',  meshType: 'curtain-wall' },
    { id: 'curtainPanels', label: 'Curtain Panels', icon: '◫', storeKey: 'curtainPanelStore', meshType: 'curtain-panel' },
    { id: 'slabs',         label: 'Slabs',          icon: '▭', storeKey: 'slabStore',         meshType: 'slab' },
    { id: 'floors',        label: 'Floors',         icon: '▤', storeKey: 'floorStore',        meshType: 'floor' },
    { id: 'ceilings',      label: 'Ceilings',       icon: '▥', storeKey: 'ceilingStore',      meshType: 'ceiling' },
    { id: 'roofs',         label: 'Roofs',          icon: '⌂', storeKey: 'roofStore',         meshType: 'roof' },
    { id: 'columns',       label: 'Columns',        icon: '▮', storeKey: 'columnStore',       meshType: 'column' },
    { id: 'beams',         label: 'Beams',          icon: '▰', storeKey: 'beamStore',         meshType: 'beam' },
    { id: 'doors',         label: 'Doors',          icon: '🚪', storeKey: 'doorStore',         meshType: 'door' },
    { id: 'windows',       label: 'Windows',        icon: '⬜', storeKey: 'windowStore',       meshType: 'window' },
    { id: 'openings',      label: 'Openings',       icon: '▢', storeKey: 'openingStore',      meshType: 'opening' },
    { id: 'stairs',        label: 'Stairs',         icon: '⌁', storeKey: 'stairStore',        meshType: 'stair' },
    { id: 'stairRailings', label: 'Stair Railings', icon: '⌐', storeKey: 'stairRailingStore', meshType: 'stair-railing' },
    { id: 'handrails',     label: 'Handrails',      icon: '⌐', storeKey: 'handrailStore',     meshType: 'handrail' },
    { id: 'lifts',         label: 'Lifts',          icon: '⇅', storeKey: 'liftStore',         meshType: 'lift' },
    { id: 'furniture',     label: 'Furniture',      icon: '▣', storeKey: 'furnitureStore',    meshType: 'furniture' },
    { id: 'lighting',      label: 'Lighting',       icon: '☀', storeKey: 'lightingStore',     meshType: 'lighting' },
    { id: 'plumbing',      label: 'Plumbing',       icon: '⚲', storeKey: 'plumbingStore',     meshType: 'plumbing' },
] as const satisfies readonly InspectCategoryDef[];

/** The dropdown value / event payload id for an inspectable category. */
export type InspectElementType = typeof INSPECT_CATEGORIES[number]['id'];

/**
 * `window.<x>Store` globals the engine publishes that are DELIBERATELY not
 * inspectable element categories, each with the reason. The coverage test reads
 * this list, so an omission is a decision on the record rather than an oversight.
 */
export const NON_ELEMENT_STORE_GLOBALS: Readonly<Record<string, string>> = Object.freeze({
    // ── Datum / annotation, not building elements ──────────────────────────
    gridStore:              'Datum geometry (C25a grid), not a building element.',
    roomBoundingLineStore:  'Derived boundary lines — a projection of rooms, not a family.',
    annotationStore:        'Sheet annotation, not model geometry.',
    projectOriginStore:     'A single survey datum, not a family.',
    constraintStore:        'Constraints between elements, not elements.',

    // ── System TYPE catalogues (the library, not the instances) ────────────
    wallSystemTypeStore:    'Type catalogue; instances are inspected via `walls`.',
    slabSystemTypeStore:    'Type catalogue; instances are inspected via `slabs`.',
    ceilingSystemTypeStore: 'Type catalogue; instances are inspected via `ceilings`.',
    floorSystemTypeStore:   'Type catalogue; instances are inspected via `floors`.',

    // ── Documents / platform / view state ──────────────────────────────────
    hierarchyStore:              'Project hierarchy, not geometry.',
    templateStore:               'Authoring templates.',
    templateAssignmentStore:     'Authoring templates.',
    elementCodeStore:            'Classification codes attached to elements.',
    decisionRecordStore:         'Design decision log.',
    sheetStore:                  'Documentation sheets.',
    titleBlockStore:             'Documentation title blocks.',
    scheduleStore:               'Schedules — a different reporting surface.',
    viewTemplateStore:           'View state (C09).',
    phaseFilterStore:            'View state (C09).',
    vgGovernanceStore:           'Visibility/graphics governance (P7 intent).',
    viewDefinitionStore:         'View state (C09).',
    visibilityIntentStore:       'Visibility intent (P7) — intent, not elements.',
    viewIntentInstanceStore:     'Visibility intent (P7) — intent, not elements.',
    ifcConversionReportStore:    'Import diagnostics.',
    ifcModelStore:               'Imported IFC federation, inspected via its own tool.',
    programmeStore:              'Brief/programme data (Data Workbench).',
});

// ── Derived lookups (kept as the shapes the zone files already consume) ──────

const _byId = new Map<string, InspectCategoryDef>(
    INSPECT_CATEGORIES.map(c => [c.id, c] as [string, InspectCategoryDef]),
);

/** Category definition for an id, or `null` when the id is not a category. */
export function inspectCategory(id: string): InspectCategoryDef | null {
    return _byId.get(id) ?? null;
}

/** All category ids, in dropdown order. */
export const INSPECT_CATEGORY_IDS: readonly InspectElementType[] =
    INSPECT_CATEGORIES.map(c => c.id);

function _record<V>(pick: (c: InspectCategoryDef) => V): Record<InspectElementType, V> {
    const out = {} as Record<InspectElementType, V>;
    for (const c of INSPECT_CATEGORIES) out[c.id] = pick(c as InspectCategoryDef);
    return out;
}

export const ELEMENT_TYPE_LABELS: Record<InspectElementType, string> = _record(c => c.label);
export const ELEMENT_TYPE_ICONS:  Record<InspectElementType, string> = _record(c => c.icon);
export const ELEMENT_TYPE_STORE_KEYS: Record<InspectElementType, string> = _record(c => c.storeKey);

/**
 * The `userData.elementType` the builders stamp for this category — what the 3D
 * ghost-with-focus lens must match on. Falls back to the id so an unknown id
 * behaves exactly as the old de-pluralising guess did rather than throwing.
 */
export function meshTypeForCategory(id: string): string {
    return _byId.get(id)?.meshType ?? id.toLowerCase().replace(/s$/, '');
}
