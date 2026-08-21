/**
 * workspaceModes.ts — §WORKSPACE-MODE-REGISTRY (L-3000 · ADR-0343 §D.1)
 *
 * The ONE declaration of the workspace modes. Everything that used to hand-edit
 * a mode in three or four places now reads this table.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS FILE EXISTS — the ADR made it a binding precondition
 * ─────────────────────────────────────────────────────────────────────────────
 * ADR-0343 §D.1 records the honest counter-argument to adding a fourth mode:
 *
 *   • `WorkspaceMode` was a hand-written union literal (`WorkspaceController.ts:32`),
 *   • the pill bar held its modes as a hard-coded local array inside `_build()`
 *     (`WorkspaceModeBar.ts:48-78`),
 *   • the keyboard handler was three `if (e.key === 'F1'…)` statements
 *     (`WorkspaceController.ts:517-519`).
 *
 * So a fourth mode was FIVE hand-edited sites, not a registration — and the ADR
 * states: *"Binding consequence: the first commit of this programme converts the
 * mode list to a registry. If that conversion is not done, this decision has made
 * the shell worse."* This is that commit.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT A ROW MEANS
 * ─────────────────────────────────────────────────────────────────────────────
 * `canvas` is the 3-D viewport's fate in that mode, and it is the field that
 * decides whether a surface can point at the model:
 *
 *   'full'   — canvas at 100%.
 *   'half'   — canvas at 50%, a fixed right-hand surface takes the other half.
 *              A dashboard in a HALF mode can highlight what it describes.
 *   'hidden' — `display:none`. A surface in a HIDDEN mode is a selector that has
 *              nothing to select in (ADR-0343 §D.1 reason 2).
 *
 * This is a LEAF module on purpose: `WorkspaceController` and `WorkspaceModeBar`
 * both import it, and neither imports the other's barrel. (MEMORY
 * §scc-no-barrel-access-at-module-load — a circular barrel read at module load
 * yields `undefined` and white-screens the app.)
 *
 * L7 file. No THREE (P2), no rAF (P3), no `(window as any)` (P4), no store
 * writes (P6) — a frozen table and two pure lookups.
 */

/** How the 3-D canvas is laid out in a given mode. */
export type WorkspaceCanvasLayout = 'full' | 'half' | 'hidden';

export interface WorkspaceModeDef {
  /** Stable id. Persisted to localStorage and emitted on `pryzm-workspace-mode`. */
  readonly id: string;
  /** Pill label. */
  readonly label: string;
  /** Tooltip / aria-label. Carries the shortcut, because the pill is small. */
  readonly title: string;
  /** `KeyboardEvent.key` that activates this mode, or `null` for no shortcut. */
  readonly shortcut: string | null;
  /** The 3-D canvas's fate — see the file header. */
  readonly canvas: WorkspaceCanvasLayout;
  /** Inline SVG for the pill. 13×13, `currentColor`, no fill. */
  readonly icon: string;
}

const ICON = (paths: string): string =>
  `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;

/**
 * The modes, in pill order.
 *
 * ⚠ Order is the rendered order AND the tab order. `analysis` sits after
 * `inspect` because it is the second half-mode; `data` stays last because it is
 * the only mode that removes the canvas.
 */
export const WORKSPACE_MODES: readonly WorkspaceModeDef[] = Object.freeze([
  {
    id: 'author',
    label: 'Author',
    title: 'Author mode — full 3D canvas (F1)',
    shortcut: 'F1',
    canvas: 'full',
    icon: ICON('<path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>'),
  },
  {
    id: 'inspect',
    label: 'Inspect',
    title: 'Inspect mode — 3D + data side-by-side (F2)',
    shortcut: 'F2',
    canvas: 'half',
    icon: ICON('<rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/>'),
  },
  {
    id: 'analysis',
    label: 'Analysis',
    title: 'Analysis mode — 3D + dashboards side-by-side (F4)',
    shortcut: 'F4',
    canvas: 'half',
    icon: ICON('<line x1="4" y1="20" x2="4" y2="12"/><line x1="10" y1="20" x2="10" y2="4"/><line x1="16" y1="20" x2="16" y2="9"/><line x1="22" y1="20" x2="22" y2="15"/>'),
  },
  {
    id: 'data',
    label: 'Data',
    title: 'Data mode — full data workbench (F3)',
    shortcut: 'F3',
    canvas: 'hidden',
    icon: ICON('<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v4c0 1.66 4.03 3 9 3s9-1.34 9-3V5"/><path d="M3 9v4c0 1.66 4.03 3 9 3s9-1.34 9-3V9"/>'),
  },
]);

/**
 * The mode id union, DERIVED from the table rather than restated beside it.
 * Adding a row above adds the member; there is no second place to edit.
 */
export type WorkspaceMode = (typeof WORKSPACE_MODES)[number]['id'];

/** Look a mode up by id. Returns `undefined` for an unknown id — callers decide. */
export function getWorkspaceMode(id: string): WorkspaceModeDef | undefined {
  return WORKSPACE_MODES.find((m) => m.id === id);
}

/** The mode a keyboard shortcut activates, or `undefined`. */
export function workspaceModeForShortcut(key: string): WorkspaceModeDef | undefined {
  return WORKSPACE_MODES.find((m) => m.shortcut === key);
}

/** True if `id` names a mode in the table. The localStorage-restore guard. */
export function isWorkspaceMode(id: string | null | undefined): id is WorkspaceMode {
  return typeof id === 'string' && WORKSPACE_MODES.some((m) => m.id === id);
}
