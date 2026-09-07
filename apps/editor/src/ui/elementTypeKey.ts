/**
 * @file apps/editor/src/ui/elementTypeKey.ts
 *
 * ⭐ §FIX-ELEMENT-TYPE-KEY-CASING (L-13045) — element-type keys, their NORMAL FORM, and the
 * two tables `ContextualEditBar` reads with them.
 *
 * WHY THIS MODULE EXISTS, AND WHY IT IMPORTS NOTHING
 * ─────────────────────────────────────────────────
 * `ContextualEditBar.ts` cannot be imported by a unit test — its transitive graph is most of
 * the editor and a bare `await import()` of it TIMES OUT at 10 s (measured, 2026-09-07).
 * That is precisely why the tests around it (`gridContextualEditBarWiring.spec.ts`,
 * `spaceEnvelopeProfileEditWire.spec.ts`) read its SOURCE with regexes instead of running it.
 * And a source regex proves a row EXISTS; it cannot prove the row is ever FOUND.
 *
 * That distinction is not academic — it is the defect this file was extracted to close.
 * `spaceEnvelopeProfileEditWire.spec.ts` asserted `spaceEnvelope: w.spaceEnvelopeTool` was
 * present in the resolver, went green, and the row was DEAD ON ARRIVAL: the bar lowercases
 * the incoming element type (`_elementType = (…).toLowerCase()`) while the producer stamps
 * camelCase (`SpaceEnvelopeMeshBuilder.ts:200` → `'spaceEnvelope'`) and `SelectionManager`
 * forwards it verbatim. So the read was `candidates['spaceenvelope']` → `undefined` → the
 * "Edit Profile" button was HIDDEN, on every selection, with no warning on any channel. A
 * repo-wide grep for the lowercase literal `spaceenvelope` returns ZERO hits, which is the
 * shortest proof that nothing in the tree ever spoke the key the lookup asked for.
 *
 * Everything here is a pure string/table function with NO imports, so the round-trip in
 * `__tests__/elementTypeKeyCasing.spec.ts` exercises the ACTUAL production lookup over the
 * ACTUAL production tables, rather than a regex over their source text.
 *
 * ⛔ ADD NO IMPORTS TO THIS FILE. The moment it reaches for a store, a tool or the DOM, the
 *    test that protects it goes back to being a regex.
 */

/**
 * THE normal form for an element-type key.
 *
 * `ElementCapabilities.canDo` already had this shape — it normalises at the lookup AND keeps
 * its keys lowercase — which is the only reason the OPERATION buttons escaped the defect
 * above. These helpers give that same property to every other type-keyed table, so a future
 * camelCase row cannot repeat it by being written in the natural casing.
 */
export function normaliseElementTypeKey(type: string | null | undefined): string {
    return (type ?? '').toLowerCase().trim();
}

/**
 * Case-INSENSITIVE read of an element-type-keyed table. The table may be written in whatever
 * casing its producer stamps; the lookup normalises BOTH sides, so the two cannot disagree.
 */
export function lookupByElementType<T>(
    table: Readonly<Record<string, T>>,
    type: string | null | undefined,
): T | undefined {
    const key = normaliseElementTypeKey(type);
    if (!key) return undefined;
    for (const tableKey of Object.keys(table)) {
        if (normaliseElementTypeKey(tableKey) === key) return table[tableKey];
    }
    return undefined;
}

/** Human-facing name for a selected element type, shown as the bar's title. */
export const TYPE_DISPLAY: Readonly<Record<string, string>> = {
    wall:           'Wall',
    slab:           'Slab',
    floor:          'Floor',
    ceiling:        'Ceiling',
    column:         'Column',
    beam:           'Beam',
    door:           'Door',
    window:         'Window',
    furniture:      'Furniture',
    roof:           'Roof',
    stair:          'Stair',
    stairs:         'Stair',
    railing:        'Railing',
    'curtain-wall':       'Curtain Wall',
    curtainwall:          'Curtain Wall',
    plumbing:             'Plumbing',
    floor_plan_underlay:  'Import Overlay',
    // §FIX-ELEMENT-TYPE-KEY-CASING (L-13045) — the envelope had NO row here at all, so a
    // selected envelope titled itself "Element". Written in the casing the producer actually
    // stamps; the lookup is case-insensitive, so that casing can no longer decide whether it
    // is found.
    spaceEnvelope:        'Space Envelope',
};

/**
 * §FEAT-WALL-PROFILE-EDIT-MATRIX — what a tool must expose to have "Edit Profile" offered.
 *
 * `enterProfileEditMode` is the FLOOR: without it the button is not shown at all, which is
 * the §FIX-DEAD-EDIT-PROFILE-BUTTON rule and is unchanged. `profileEditAvailability` is
 * OPTIONAL and is the per-variant refinement (L-1065): a tool that has it gets its button
 * enabled or disabled per element, a tool that lacks it keeps the old all-or-nothing
 * behaviour. Optional rather than required so slab — whose editor has no variant axes —
 * needs no change to keep working.
 */
export interface ProfileEditCapableTool {
    enterProfileEditMode?: (id: string) => unknown;
    profileEditAvailability?: (id: string) => { ok: boolean; reason?: string };
}

/**
 * The window globals the profile-edit resolver reads. Declared as its own shape rather than
 * leaning on `globals.d.ts`, which types `floorTool`/`ceilingTool` as `unknown` and
 * `slabTool` with an `(slab: object)` signature — a local shape keeps the call site clean
 * without touching the global declaration, and lets a test pass a plain object.
 */
export interface ProfileEditToolBag {
    slabTool?:           ProfileEditCapableTool;
    floorTool?:          ProfileEditCapableTool;
    ceilingTool?:        ProfileEditCapableTool;
    wallTool?:           ProfileEditCapableTool;
    spaceEnvelopeTool?:  ProfileEditCapableTool;
}

/**
 * §FIX-DEAD-EDIT-PROFILE-BUTTON — THE dispatch table for "Edit Profile", expressed as a
 * function of the window bag so a test can enumerate it with stubs.
 *
 * Both the button's VISIBILITY and its CLICK HANDLER consult `resolveProfileEditTool` below,
 * so the offered affordance and the implemented action cannot drift apart — which is exactly
 * how floor and ceiling once came to show a button that did nothing.
 *
 * ⚠ WALL WAS deliberately ABSENT, and is now PRESENT — §FEAT-WALL-PROFILE-EDIT, 2026-08-19.
 * The rule is unchanged and still binding: a type is listed here IF AND ONLY IF its tool
 * implements `enterProfileEditMode` — which the `typeof … === 'function'` guard in the
 * resolver enforces at runtime regardless of this map, so a wrong entry DISABLES the button
 * rather than resurrecting a dead one.
 */
export function profileEditCandidates(
    w: ProfileEditToolBag,
): Record<string, ProfileEditCapableTool | undefined> {
    return {
        slab:    w.slabTool,
        floor:   w.floorTool,
        ceiling: w.ceilingTool,
        wall:    w.wallTool,
        // ⭐ §RESI-STAGE-G (2026-09-06) — THE ROW C114 §10b ASKS FOR, and the whole of what
        // that section permits: *"The envelope adds a row to that resolver. ⛔ A new outline
        // surface is forbidden."* `SpaceEnvelopeProfileEditTool` implements BOTH methods, so
        // the button is shown, and is enabled or disabled per element by its
        // `profileEditAvailability` — a degenerate footprint or a `maximumBuildable` study
        // disables it with the reason as the tooltip rather than opening nothing.
        //
        // ⛔ THIS ROW WAS DEAD FROM THE DAY IT LANDED and the kill was one character of
        // casing (L-13045, see the file header). The key stays camelCase because that is what
        // the producer stamps; the lookup normalises, so it no longer decides anything.
        spaceEnvelope: w.spaceEnvelopeTool,
    };
}

/**
 * Resolve the tool that owns "Edit Profile" for an element type, or `null` when none does.
 *
 * ⭐ The lookup is case-INSENSITIVE. Callers hand it an already-lowercased `_elementType`;
 * the table is written in each producer's own casing. Normalising both sides is what stops
 * the two from ever silently disagreeing again.
 */
export function resolveProfileEditTool(
    type: string | null | undefined,
    w: ProfileEditToolBag,
): ProfileEditCapableTool | null {
    if (!type) return null;
    const tool = lookupByElementType(profileEditCandidates(w), type);
    return tool && typeof tool.enterProfileEditMode === 'function' ? tool : null;
}
