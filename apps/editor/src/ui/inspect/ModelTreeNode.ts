// C27 INS-α-4 — Model Tree node renderer (pure DOM construction).
//
// One <li> element per node.  No runtime closures, no event wiring — the
// parent `ModelTreeComponent` attaches click / keyboard handlers via
// delegation.  Pure-DOM construction keeps this unit-testable in isolation
// (the test mounts the returned element under a container and asserts on
// class / data attributes).
//
// CONTRACT: C27 §2 (master-tree hierarchy 0..6).  Slice INS-α-4 ships
// L0..L4 (project / building / level / apartment / room).  L5 / L6
// (elementType / elementInstance) are α-5.
//
// L7 component file — no THREE, no `requestAnimationFrame`, no
// `(window as any)`.  Defensive against missing optional metadata.

import type { InspectSelection, InspectNodeKind } from '@pryzm/schemas';

/** Public inputs — purely descriptive, no callbacks. */
export interface ModelTreeNodeInputs {
    readonly selection: InspectSelection;
    readonly label: string;
    readonly isExpanded: boolean;
    readonly hasChildren: boolean;
    readonly childCount: number;
    readonly isSelected: boolean;
}

/** Per-kind glyph.  Plain ASCII keeps the bundle ASCII-clean + ensures
 *  consistent rendering across operating systems.  When the design system
 *  introduces a real icon set the swap is one-line. */
const KIND_ICON: Readonly<Record<InspectNodeKind, string>> = Object.freeze({
    project:         'P',
    building:        'B',
    level:           'L',
    apartment:       'A',
    room:            'R',
    // Reserved for INS-α-5 — listed for exhaustive `Record` type.
    elementType:     'T',
    elementInstance: 'E',
});

/** Render a single tree row.  Returns a detached `<li>` — the caller
 *  appends it to the live tree.  The element carries the data-* attributes
 *  the parent component uses for event delegation. */
export function renderModelTreeNode(inputs: ModelTreeNodeInputs): HTMLLIElement {
    const li = document.createElement('li');
    li.className = 'pmt-node';
    li.dataset.kind = inputs.selection.kind;
    li.dataset.level = String(inputs.selection.level);
    li.dataset.id = inputs.selection.id;
    li.tabIndex = 0;
    li.setAttribute('role', 'treeitem');
    li.setAttribute('aria-level', String(inputs.selection.level + 1));
    li.setAttribute('aria-expanded', inputs.hasChildren ? String(inputs.isExpanded) : 'false');
    if (inputs.isSelected) {
        li.classList.add('pmt-node--selected');
        li.setAttribute('aria-selected', 'true');
    }

    // ── Toggle (▶ / ▼ / blank for leaves) ────────────────────────────────────
    const toggle = document.createElement('span');
    toggle.className = inputs.hasChildren ? 'pmt-toggle' : 'pmt-toggle pmt-toggle--leaf';
    toggle.dataset.role = 'toggle';
    toggle.textContent = inputs.hasChildren ? (inputs.isExpanded ? '▼' : '▶') : '';
    toggle.setAttribute('aria-hidden', 'true');
    li.appendChild(toggle);

    // ── Per-kind icon ────────────────────────────────────────────────────────
    const icon = document.createElement('span');
    icon.className = 'pmt-icon';
    icon.textContent = KIND_ICON[inputs.selection.kind] ?? '?';
    icon.setAttribute('aria-hidden', 'true');
    li.appendChild(icon);

    // ── Label (text-only — caller has already resolved the breadcrumb) ───────
    const label = document.createElement('span');
    label.className = 'pmt-label';
    label.textContent = inputs.label;
    label.title = inputs.label;
    li.appendChild(label);

    // ── Child-count badge ────────────────────────────────────────────────────
    if (inputs.hasChildren && inputs.childCount > 0) {
        const count = document.createElement('span');
        count.className = 'pmt-count';
        count.textContent = String(inputs.childCount);
        li.appendChild(count);
    }

    return li;
}
