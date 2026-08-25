/**
 * ElementTypeAuthoringRegistry — §FEAT-ELEMENT-TYPE-AUTHORING
 * ===========================================================
 *
 * The AUTHORING sibling of `ElementTypeCatalogRegistry`. That registry answers
 * "which types may this element be CHANGED TO?"; this one answers "may the user
 * CREATE or DUPLICATE a type for this family, and what does the editor need?".
 *
 * ── WHY A SECOND REGISTRY AND NOT A FLAG ON THE FIRST ────────────────────────
 *
 * Reading a catalogue and authoring into one are different capabilities with
 * different failure modes, and the repo already paid for conflating them. Every
 * family in `ElementTypeCatalogRegistry` can be READ (a list is a list). Almost none
 * can be WRITTEN: the store inventory (2026-08-09) found five different mutating
 * vocabularies across the families that have a store at all —
 *
 *     wall / slab / handrail  →  add / update / remove / clearCustomTypes
 *     floor                   →  addCustomType / updateCustomType / removeCustomType
 *     ceiling                 →  addCustomType / updateCustomType / deleteCustomType
 *     door / window           →  add / update / remove / duplicate  (isBuiltIn is a FIELD)
 *     stair / lift            →  add / remove ONLY — no update, no clearCustomTypes
 *     room                    →  a store class that is NEVER INSTANTIATED
 *     plumbing                →  read-only by construction
 *     lighting/roof/column/beam → no store at all
 *
 * — and three of those (stair, lift, room) are not registered with
 * `ProjectScopeRegistry` at all, so a type authored into them LEAKS ACROSS PROJECTS
 * (C13) and is not written to the snapshot (C05). Offering "New type…" for those
 * families would ship a control that appears to work and quietly loses the user's
 * work at the next save — the exact defect class this codebase keeps paying for.
 *
 * So authoring is DECLARED, never inferred, and a family that does not declare it
 * gets NO "New type…" entry. `authoringUnavailableReason` makes the absence a
 * sentence the product says on purpose rather than a control that is missing for
 * reasons the user cannot see.
 *
 * ── CONTRACT ────────────────────────────────────────────────────────────────
 *
 *  - **C03 / P6** — this module DECLARES; it performs no store writes. A type is
 *    project STATE, so it is created through the `elementType.*` command surface on
 *    the bus, exactly as an element is. `ElementTypeCatalogRegistry`'s header makes
 *    the same promise for reads.
 *  - **C16 §3 "Semantic / non-geometry"** — a type carries no geometry and no level,
 *    so its commands take CA-1/3/8/11/14/15 and NOT CA-4/6/7/9 (no level resolution,
 *    no BimManager, no ViewDependencyTracker, no frame-deferred build).
 *  - **C05** — a family may declare authoring ONLY if its custom types round-trip
 *    `ProjectSerializer` → `ProjectLoader`. `persisted` records that proof, and it is
 *    the gate: authoring without persistence is founder complaint #2 by construction.
 *  - **C13** — a family may declare authoring ONLY if its store is registered with
 *    `ProjectScopeRegistry`, or a type authored in project A follows the user into
 *    project B.
 *
 * ── ADDING THE NEXT FAMILY (the extension cost, stated plainly) ──────────────
 *
 *   1. Confirm its store is registered with `projectScopeRegistry` (C13). If not,
 *      register it — that is the fix, not a reason to skip the check.
 *   2. Confirm its custom types are encoded by `ProjectSerializer` AND decoded by
 *      `ProjectLoader` through a SHARED codec (see `wallSystemTypeCodec.ts`; a
 *      hand-written field list on one side is how `function` was silently dropped).
 *   3. Add an `ElementTypeAuthoring` entry here with its store adapter.
 *   4. Add a family branch to the `elementType.*` bus handler.
 *   5. Point `editorKind` at an editor. `'layer-stack'` already serves any family
 *      whose type IS a layer stack — slab, floor and ceiling all qualify and need no
 *      new editor, only steps 1-4.
 *
 * Steps 1 and 2 are the real work and they are per-family. Step 5 is free for the
 * layer-stack families and a new editor for the rest.
 */

/** What kind of editor surface a family's type needs. */
export type ElementTypeEditorKind =
    /** An ordered stack of named, thickness-bearing, material-bearing layers, drawn in
     *  section. Serves wall today; slab / floor / ceiling are the same shape. */
    | 'layer-stack'
    /** A set of NAMED FINISH SLOTS (frame / leaf / sill …) plus a glazing opacity —
     *  the shape of the hosted-opening families. Serves door and window; the slots
     *  are declared per family in `finishEditor`, so the editor stays generic
     *  (C65 §3.5: specialise in the declaration, never with a family branch). */
    | 'finish-set';

/** One finish slot a 'finish-set' family's type carries. */
export interface ElementTypeFinishSlot {
    /** The record field the finish lives at (e.g. 'frameFinish', 'leafFinish'). */
    key: string;
    /** UI label: "Frame", "Leaf", "Sill". */
    label: string;
}

/**
 * §OPENING-PANEL-PARITY (L-7746) — one numeric attribute of a TYPE.
 *
 * ⚠ EVERY FIELD HERE IS TYPE-LEVEL BY MEASUREMENT, NOT BY GUESS. The test applied
 * to each was: *does the family's store record already carry it, and is it shared by
 * every instance placed from the type?* Only the values living under
 * `WindowSystemType.dimensions` / `DoorSystemType.dimensions` qualified — those are
 * exactly what `resolveWindowDimensions` / `resolveDoorDimensions` read from the TYPE
 * when the instance does not override them. The store already answered the question,
 * so the declaration follows the store rather than a preference.
 *
 * ⛔ GETTING THIS SPLIT WRONG IS WORSE THAN THE GAP IT CLOSES. A per-instance field
 * promoted to the type would make every window on the project move together the next
 * time the type is edited. So the splay angles and `revealProjection` are NOT here:
 * they are instance state and the resolver reads the instance first.
 *
 * ⚠ `sillHeight` is the closest call and is DELIBERATELY EXCLUDED even though
 * `WindowTypeDimensions` declares it: a sill height is a property of the ROOM, not of
 * the window product — a kitchen sill and a bedroom sill differ in one building using
 * one window type. Authoring it on the type would invite exactly the project-wide
 * move this paragraph warns about.
 */
export interface ElementTypeNumericField {
    /** The key under the record's `dimensions` object. */
    key: string;
    label: string;
    min: number;
    max: number;
    step: number;
    /** Short hint under the control. Say what the number DOES, not what it is called. */
    hint?: string;
}

/** A family's authoring declaration. */
export interface ElementTypeAuthoring {
    /** `normalizeType()` output, matching `ElementTypeCatalogRegistry.family`. */
    family: string;
    /** Singular noun for UI copy: "New Wall Type", "Duplicate Wall Type". */
    noun: string;
    /** The editor surface this family's type is authored in. */
    editorKind: ElementTypeEditorKind;
    /**
     * REQUIRED when `editorKind === 'finish-set'` — the finish slots this family's
     * type carries, in display order. The generic finish editor renders exactly
     * these; the family adapter validates exactly these.
     */
    finishEditor?: {
        slots: ElementTypeFinishSlot[];
        /** Whether the family carries a `glazingOpacity` (0 = clear … 1 = opaque). */
        glazingOpacity: boolean;
        /**
         * §OPENING-PANEL-PARITY (L-7746) — the TYPE's own dimensions, written to
         * `draft.dimensions[key]`. Declared per family so the editor stays generic
         * (C65 §3.5: specialise in the DECLARATION, never with a family branch in the
         * editor). Adding a family's dimensions is a table entry, not a code path.
         */
        dimensions?: ElementTypeNumericField[];
        /**
         * The subdivision grid. `undefined` for a family whose subdivision is not a
         * rows × columns grid.
         *
         * ⛔ DOOR DECLARES NOTHING HERE ON PURPOSE, and the reason is NAMED rather than
         * left as an absence for someone to "fix": a door's subdivision is
         * `defaultSegments`, an ORDERED LIST of typed bands (`panel` / `glass` / `empty`,
         * each with a height ratio) plus an optional sidelight. That is a list editor,
         * not two sliders — and two sliders laid over it would silently flatten a
         * half-light door into equal bands, DISCARDING the segment types the user chose.
         * Left to a lane that builds the list editor properly (L-7747).
         */
        grid?: {
            columnsKey: string;
            rowsKey: string;
            maxColumns: number;
            maxRows: number;
        };
        /**
         * §OUTLINE81 (SPEC-WINDOW-CUSTOM-OUTLINE D7, C86 §10.6) — the "Elevation outline"
         * section: the family's type may carry a free-form `customOutline` shape TEMPLATE,
         * authored on the reused wall-profile editor surface. A CAPABILITY DECLARATION,
         * never a family branch in the modal (C65 §3.5). `undefined` for a family whose
         * void shape is not free-form authorable — DOOR declares nothing here ON PURPOSE
         * (D12: a door is a floor notch; `notchWalk` assumes two feet at the base, which a
         * free-form ring does not guarantee), and that absence is a decision, not a gap.
         */
        outline?: {
            /** The draft key the section writes — `'customOutline'`. */
            key: string;
        };
    };
    /**
     * PROOF, not intent (C05). The serializer field its custom types are written to,
     * and which round-trips through a shared codec. A family cannot be listed here
     * without one — see the header.
     */
    persisted: { snapshotField: string; codec: string };
    /**
     * PROOF, not intent (C13). The `ProjectScopeRegistry` scope name whose `clear()`
     * wipes this family's custom types on project switch.
     */
    projectScope: string;
    /**
     * Revit semantics decision, surfaced in the editor so the user is never guessing.
     *
     * `'instance-owned'` — placed elements carry their OWN copy of the assembly, so
     * editing the TYPE does not restyle walls already placed. That is the honest
     * description of wall today (ADR-0299: a placed wall's layer stack is the user's
     * work and re-stamping it silently would discard it). The editor says so, and
     * offers an EXPLICIT "apply to placed" action rather than doing it invisibly.
     */
    instanceLinkage: 'instance-owned';
}

const AUTHORING: ElementTypeAuthoring[] = [
    {
        family: 'wall',
        noun: 'Wall Type',
        editorKind: 'layer-stack',
        persisted: {
            snapshotField: 'wallSystemTypes',
            codec: 'apps/editor/src/engine/persistence/wallSystemTypeCodec.ts',
        },
        projectScope: 'wallSystemTypeStore',
        instanceLinkage: 'instance-owned',
    },
    // §FEAT-HOSTED-TYPE-AUTHORING (C65, founder 2026-08-09: door/window parity with
    // wall). Both families already satisfied the two gates when they were declared:
    //   C05 — custom types round-trip `ProjectSerializer` ⇄ `ProjectLoader` through
    //         the shared `hostedSystemTypeCodec.ts` (snapshot fields below, §M-H4).
    //   C13 — both stores register with `projectScopeRegistry` at module scope
    //         (see the bottom of each store file), clearing custom types on switch.
    // `instance-owned` is the honest linkage for both: placing a door/window STAMPS
    // the type's finishes onto the opening record (CreateWallOpeningCommand), so a
    // later type edit does not restyle placed elements.
    {
        family: 'door',
        noun: 'Door Type',
        editorKind: 'finish-set',
        finishEditor: {
            slots: [
                { key: 'frameFinish', label: 'Frame' },
                { key: 'leafFinish',  label: 'Leaf' },
            ],
            glazingOpacity: true,
            // Exactly the six `DoorSystemType.dimensions` fields — no more. Each is read
            // by `resolveDoorDimensions` when the door instance does not carry its own,
            // which is what makes it a property of the TYPE.
            dimensions: [
                { key: 'width',          label: 'Leaf width',     min: 0.4,  max: 2.0,  step: 0.005, hint: 'Structural opening for a single leaf.' },
                { key: 'doubleWidth',    label: 'Double width',   min: 0.8,  max: 4.0,  step: 0.01,  hint: 'Used when the door is placed as a double.' },
                { key: 'height',         label: 'Height',         min: 1.6,  max: 3.2,  step: 0.005 },
                { key: 'frameThickness', label: 'Frame face',     min: 0.02, max: 0.20, step: 0.005, hint: 'How far the frame reaches into the opening.' },
                { key: 'frameDepth',     label: 'Frame depth',    min: 0.02, max: 0.30, step: 0.005, hint: 'Across the wall reveal.' },
                { key: 'leafThickness',  label: 'Leaf thickness', min: 0.02, max: 0.12, step: 0.002 },
            ],
        },
        persisted: {
            snapshotField: 'doorSystemTypes',
            codec: 'apps/editor/src/engine/persistence/hostedSystemTypeCodec.ts',
        },
        projectScope: 'doorSystemTypeStore',
        instanceLinkage: 'instance-owned',
    },
    {
        family: 'window',
        noun: 'Window Type',
        editorKind: 'finish-set',
        finishEditor: {
            slots: [
                { key: 'frameFinish', label: 'Frame' },
                { key: 'sillFinish',  label: 'Sill' },
            ],
            glazingOpacity: true,
            // §FIX-WINDOW-TYPE-DIMS-DRIFT (L-10070, founder 2026-08-23) — the founder:
            // *"please check the window type creator — it doesn't have all window
            // properties"*. He was right, and the drift is measurable as a SET rather
            // than as an opinion.
            //
            // ⭐ MEASURED BOTH DIRECTIONS, 2026-08-23, against `WindowTypeDimensions`
            // (packages/geometry-window/src/WindowSystemTypeStore.ts:51-108):
            //   · ARM A (model \ dialog) = **7 MISSING** — sillHeight, sashThickness,
            //     sashDepth, glazingThickness, rebateDepth, sillThickness, sillOverhang.
            //     All seven are read by `resolveWindowDimensions()` when the instance
            //     does not carry its own, which is exactly what makes them properties
            //     of the TYPE — and a catalogue author could not state any of them.
            //   · ARM B (dialog \ model) = **0.** Every row named a real field.
            // The DOOR declaration below has both arms EMPTY and says so in its own
            // comment — *"Exactly the six `DoorSystemType.dimensions` fields — no more"*.
            // Window carried no such sentence, and that is precisely where it drifted.
            //
            // ⛔ THE FOUNDER'S TWO NAMED FIELDS ARE **NOT** IN THIS LIST, AND THAT IS NOT
            // AN OVERSIGHT. `Projection (m)` and `Splay all sides (°)` are
            // `revealProjection` / `revealSplay{Head,Sill,JambLeft,JambRight}`, declared
            // on the window **INSTANCE** schema (packages/schemas/src/elements/Window.ts:129-134)
            // and **absent from `WindowTypeDimensions` entirely**. A row here would
            // render a control writing a key the type record cannot hold, which is a
            // worse defect than the missing control: the dialog would accept the value
            // and the type would silently not carry it. Giving a TYPE a reveal needs the
            // field on `WindowSystemType.dimensions`, the codec
            // (`hostedSystemTypeCodec.ts`) and the `resolveWindowDimensions` chain — a
            // model change in `packages/geometry-window` with persistence implications,
            // logged as L-10071 rather than faked here.
            dimensions: [
                { key: 'width',                  label: 'Width',           min: 0.3,   max: 6.0,  step: 0.01 },
                { key: 'doubleWidth',            label: 'Double width',    min: 0.6,   max: 8.0,  step: 0.01,  hint: 'Used when the window is placed as a double.' },
                { key: 'height',                 label: 'Height',          min: 0.3,   max: 4.0,  step: 0.01 },
                { key: 'sillHeight',             label: 'Sill height',     min: 0,     max: 2.0,  step: 0.01,  hint: 'How high the sill sits above the floor.' },
                { key: 'frameThickness',         label: 'Frame face',      min: 0.015, max: 0.20, step: 0.002, hint: 'The number that separates a slim steel frame from a fat uPVC one.' },
                { key: 'frameDepth',             label: 'Frame depth',     min: 0.02,  max: 0.30, step: 0.005, hint: 'Across the wall reveal.' },
                { key: 'sashThickness',          label: 'Sash face',       min: 0.01,  max: 0.15, step: 0.002, hint: 'The openable leaf frame captured inside the outer frame.' },
                { key: 'sashDepth',              label: 'Sash depth',      min: 0.01,  max: 0.15, step: 0.002, hint: 'How far the sash stands proud of the glazing plane.' },
                { key: 'glazingThickness',       label: 'Glazing unit',    min: 0.004, max: 0.06, step: 0.001, hint: 'Total thickness of the sealed unit — 0.024 for a 4-16-4.' },
                { key: 'rebateDepth',            label: 'Rebate depth',    min: 0.002, max: 0.05, step: 0.001, hint: 'The pocket in the jamb that captures the glazing.' },
                { key: 'columnDividerThickness', label: 'Mullion',         min: 0.01,  max: 0.15, step: 0.002, hint: 'The centre post between panes.' },
                { key: 'rowDividerThickness',    label: 'Transom',         min: 0.01,  max: 0.15, step: 0.002, hint: 'The horizontal bar between rows.' },
                { key: 'sillDepth',              label: 'Sill projection', min: 0,     max: 0.40, step: 0.005, hint: 'How far the sill board stands proud of the wall.' },
                { key: 'sillThickness',          label: 'Sill thickness',  min: 0.01,  max: 0.10, step: 0.005, hint: 'Vertical thickness of the sill board.' },
                { key: 'sillOverhang',           label: 'Sill overhang',   min: 0,     max: 0.20, step: 0.005, hint: 'How far the sill runs past each jamb.' },
            ],
            grid: {
                columnsKey: 'defaultColumnRatios',
                rowsKey:    'defaultRowRatios',
                maxColumns: 4,
                maxRows:    3,
            },
            // §OUTLINE81 (D6/D7) — the window type may carry a free-form outline TEMPLATE.
            // A window created while this type is active adopts a COPY of the ring; the
            // instance owns it from then on (C86 §10.5.b amendment — type change never
            // reshapes; "Apply shape from type" is the explicit route).
            outline: { key: 'customOutline' },
        },
        persisted: {
            snapshotField: 'windowSystemTypes',
            codec: 'apps/editor/src/engine/persistence/hostedSystemTypeCodec.ts',
        },
        projectScope: 'windowSystemTypeStore',
        instanceLinkage: 'instance-owned',
    },
];

/**
 * Families that DELIBERATELY do not offer authoring yet, with the blocking reason.
 *
 * These are the honest half of the declaration. Each names what is missing, so the
 * next person extends the right thing instead of adding a dropdown entry over a hole.
 * A family absent from BOTH lists is simply not an element the panel types.
 */
export const AUTHORING_UNAVAILABLE: ReadonlyMap<string, string> = new Map([
    // Persisted + project-scoped, so these are step-3/4/5 work only — the cheapest
    // next families, and all three reuse the 'layer-stack' editor unchanged.
    ['slab',    'Slab types are not yet user-authorable — the editor is not wired for this family.'],
    ['floor',   'Floor types are not yet user-authorable — the editor is not wired for this family.'],
    ['ceiling', 'Ceiling types are not yet user-authorable — the editor is not wired for this family.'],
    // door / window moved OUT of this list 2026-08-10 (§FEAT-HOSTED-TYPE-AUTHORING):
    // the finish-set editor now exists and both families were already persisted +
    // project-scoped, so all five extension steps are complete.
    // BLOCKED ON PERSISTENCE + ISOLATION, not on UI. Authoring these today would
    // create types that are silently lost on save and leak into the next project.
    ['stair',   'Stair types cannot be saved with the project yet, so creating one would lose it on reload.'],
    ['lift',    'Lift types cannot be saved with the project yet, so creating one would lose it on reload.'],
    ['room',    'Room types cannot be saved with the project yet, so creating one would lose it on reload.'],
    // No store to author INTO.
    ['railing',  'Railing types are not yet user-authorable — the type catalogue is read-only.'],
    ['lighting', 'Lighting fixtures have no editable type catalogue — the built-in fixtures are fixed.'],
    ['roof',     'Roof shapes are a fixed set, not an editable type catalogue.'],
    ['column',   'Columns have no type catalogue — set the profile and dimensions directly.'],
    ['beam',     'Beams have no type catalogue — set the section and dimensions directly.'],
    ['plumbing', 'Plumbing fixture types are a fixed catalogue.'],
    ['furniture','Furniture types come from the asset catalogue, not a project type list.'],
]);

const BY_FAMILY: ReadonlyMap<string, ElementTypeAuthoring> =
    new Map(AUTHORING.map(a => [a.family, a]));

/** Every authoring declaration, for the coverage spec and for tooling. */
export function allElementTypeAuthoring(): readonly ElementTypeAuthoring[] {
    return AUTHORING;
}

/**
 * The authoring declaration for a family, or `null` when it may NOT be authored.
 *
 * A `null` return is the instruction to render NO "New type…" / "Duplicate type…"
 * entry — never a disabled one, and never one that opens an editor whose result
 * cannot be saved.
 */
export function resolveElementTypeAuthoring(family: string): ElementTypeAuthoring | null {
    return BY_FAMILY.get(family) ?? null;
}

/**
 * Why a family cannot be authored, when it cannot. `undefined` for families that CAN
 * be authored, and for anything that is not a typed element at all.
 */
export function authoringUnavailableReason(family: string): string | undefined {
    if (BY_FAMILY.has(family)) return undefined;
    return AUTHORING_UNAVAILABLE.get(family);
}
