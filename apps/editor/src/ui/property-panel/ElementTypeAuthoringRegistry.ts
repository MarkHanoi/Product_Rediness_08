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
    | 'layer-stack';

/** A family's authoring declaration. */
export interface ElementTypeAuthoring {
    /** `normalizeType()` output, matching `ElementTypeCatalogRegistry.family`. */
    family: string;
    /** Singular noun for UI copy: "New Wall Type", "Duplicate Wall Type". */
    noun: string;
    /** The editor surface this family's type is authored in. */
    editorKind: ElementTypeEditorKind;
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
    // Persisted + project-scoped, but a door/window type is not a layer stack: it
    // needs a panel/frame/leaf editor that does not exist.
    ['door',    'Door types are not yet user-authorable — a door type needs a panel and frame editor.'],
    ['window',  'Window types are not yet user-authorable — a window type needs a frame and glazing editor.'],
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
