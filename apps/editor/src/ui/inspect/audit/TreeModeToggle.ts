/**
 * TreeModeToggle — §ROOMTREE139 (L-12260+), 2026-08-26.
 *
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    L7 UI — Inspect panel, mini project browser tree header.
 * Architectural Classification: A (view-only). No store reads, no store writes.
 *
 * Founder: *"In Inspect, within the PRYZM tree, I want another mode option — BY
 * ROOM."*
 *
 * ⭐ MIRRORS AN EXISTING AFFORDANCE ON PURPOSE, RATHER THAN INVENTING A THIRD
 * ONE. The Inspect panel already offers a tree-source mode switch — the
 * "PRYZM tree | IFC tree" pill toggle mounted by `IfcTreeAttachment.ts`,
 * built by `createTreeToggle()` in `@pryzm/plugin-ifc-inspector`
 * (`plugins/ifc-inspector/src/tree/ifc-tree-view.ts:116`). This module is the
 * SAME shape — `(initial, onChange) => { element, setMode }`, a `role="tablist"`
 * of `role="tab"` buttons, one active at a time — reimplemented here rather than
 * imported, for two reasons:
 *   1. `createTreeToggle`'s `TreeMode` is a closed `'pryzm' | 'ifc'` union — it
 *      is the PANEL's tree-SOURCE switch, a different axis from this one (which
 *      tree GROUPING the PRYZM tree itself uses). Widening that union would
 *      make the IFC-attachment module answer a question about a mode it does
 *      not participate in.
 *   2. `apps/editor/src/ui/inspect/**` is this contract's own CSS surface
 *      (05-BIM-UI-ARCHITECTURE-CONTRACT §3, prefix `aud-`); importing a sibling
 *      plugin's `ifct-*` class names here would mean two prefixes governing one
 *      panel's chrome for no reason beyond saving a dozen lines.
 *
 * The CSS below is a same-shape, `aud-`-prefixed twin of `.ifct-toggle` /
 * `.ifct-toggle-btn` (rounded pill, small pill buttons, one active), declared in
 * `apps/editor/src/ui/styles/panels/autonomous-auditor/auditStack.ts` — CONTRACT
 * §05 §3 keeps all CSS out of this file (it is logic, not styling).
 */

export type TreeViewMode = 'level' | 'room';

export interface TreeModeToggleHandle {
  readonly element: HTMLElement;
  setMode(mode: TreeViewMode): void;
}

const LABELS: Readonly<Record<TreeViewMode, string>> = {
  level: 'By Level',
  room:  'By Room',
};

const TITLES: Readonly<Record<TreeViewMode, string>> = {
  level: 'Group the project tree by storey (level → family → element)',
  room:  'Group the project tree by room (room → family → element)',
};

/**
 * Build the level/room pill toggle. Same signature shape as
 * `createTreeToggle()` in `@pryzm/plugin-ifc-inspector` — see the module header
 * for why this is a twin rather than a shared import.
 */
export function createTreeModeToggle(
  initial:  TreeViewMode,
  onChange: (mode: TreeViewMode) => void,
): TreeModeToggleHandle {
  const root = document.createElement('div');
  root.className = 'aud-tree-mode-toggle';
  root.setAttribute('role', 'tablist');
  root.setAttribute('aria-label', 'Project tree grouping');

  const modes: readonly TreeViewMode[] = ['level', 'room'];
  const buttons = modes.map((mode) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'aud-tree-mode-btn';
    b.textContent = LABELS[mode];
    b.title = TITLES[mode];
    b.dataset.mode = mode;
    b.setAttribute('role', 'tab');
    b.addEventListener('click', () => {
      setMode(mode);
      onChange(mode);
    });
    root.appendChild(b);
    return b;
  });

  function setMode(mode: TreeViewMode): void {
    for (const btn of buttons) {
      const on = btn.dataset.mode === mode;
      btn.classList.toggle('aud-tree-mode-btn--active', on);
      btn.setAttribute('aria-selected', String(on));
    }
  }
  setMode(initial);

  return { element: root, setMode };
}
