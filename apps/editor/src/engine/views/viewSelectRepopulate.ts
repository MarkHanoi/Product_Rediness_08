// §DOC-VIEWS-IN-DROPDOWN (2026-06-24) — pure helper for the SplitViewManager
// view-type dropdown so it can be unit-tested without instantiating the
// THREE-importing SplitViewManager class.
//
// The split-view header dropdown groups ViewDefinitions by category (Floor Plans,
// Reflected Ceiling Plans, Sections, Elevations, …). It is populated once at header
// build and must be RE-populated when ViewDefinitions are created/deleted/loaded
// while the pane is open — otherwise batch-created documentation views (per-level
// plans, building elevations) never appear in the dropdown. This helper rebuilds the
// <select> via the supplied populate fn and restores the prior selection (falling
// back to `fallbackId`) so the displayed pane does not jump.

/**
 * Re-populate a view-type <select> while preserving the user's current selection.
 *
 * @param sel        The dropdown element to rebuild.
 * @param populate   Repopulates `sel` from the live view store (clears + re-adds option groups).
 * @param fallbackId The view id to select if the previous selection no longer exists
 *                   (typically the active plan view id, which `populate` always lists).
 */
export function repopulateViewSelectPreservingSelection(
    sel: HTMLSelectElement,
    populate: (sel: HTMLSelectElement) => void,
    fallbackId: string,
): void {
    const prev = sel.value;
    populate(sel);
    const stillPresent = Array.from(sel.options).some(o => o.value === prev && !o.disabled);
    sel.value = stillPresent ? prev : fallbackId;
}
