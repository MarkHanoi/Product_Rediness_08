/**
 * DwPanelChrome — §OPENING-PANEL-PARITY (L-7740 … L-7745)
 * ========================================================
 *
 * The shared chrome primitives for the `dw-` parametric inspector sections, so
 * the door panel and the window panel are the same SHAPE by construction.
 *
 * ── WHY IT LIVES IN THE DOOR PACKAGE ────────────────────────────────────────
 *
 * `geometry-window` already imports `injectDwStyles` and `buildFinishMaterialSelect`
 * from `@pryzm/geometry-door`; the reverse edge does not exist and must not, or the
 * two packages become a cycle. So the shared half of the door/window inspector
 * lives on the door side and the window imports it — the same arrangement, and
 * for the same reason, as the finish picker.
 *
 * ⚠ It is deliberately TINY and deliberately stateless. A group that remembered
 * whether it was collapsed would be a per-user chrome preference stored inside an
 * element inspector, which is a different concern with a different owner (C06).
 */

/**
 * Append a group heading to a `.dw-section-body` grid.
 *
 * Eighteen controls in one flat list is not a panel, it is a dump: the founder's
 * screenshot shows `Splay all sides` and `Frame Color` rendered as visual peers
 * when one is a geometric constraint and the other is a finish. The group names
 * are the CONSTRUCTION vocabulary — what the thing is, where it sits, how light
 * gets through it — never an alphabetisation.
 */
export function appendDwGroup(body: HTMLElement, title: string): void {
    const g = document.createElement('div');
    g.className = 'dw-group';
    g.textContent = title;
    body.appendChild(g);
}

/**
 * Append an explanatory note that spans both grid columns and WRAPS.
 *
 * ⛔ Do NOT reach for `className = 'dw-label'` here, which is what the Reveal
 * Direction note used to do. `.dw-label` carries `text-overflow: ellipsis` for a
 * 108px track, so a two-sentence note was clipped mid-word — and the clipped half
 * was the half that said the value is the user's CHOICE rather than a detected
 * fact (L-7741). A note that cannot be finished is worse than no note.
 */
export function appendDwNote(body: HTMLElement, text: string): HTMLElement {
    const n = document.createElement('div');
    n.className = 'dw-note';
    n.textContent = text;
    body.appendChild(n);
    return n;
}
