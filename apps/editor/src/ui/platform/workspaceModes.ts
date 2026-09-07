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
 * writes (P6) — a frozen table and five pure lookups.
 */

/** How the 3-D canvas is laid out in a given mode. */
export type WorkspaceCanvasLayout = 'full' | 'half' | 'hidden';

export interface WorkspaceModeDef {
  /** Stable id. Persisted to localStorage and emitted on `pryzm-workspace-mode`. */
  readonly id: string;
  /** Pill label. */
  readonly label: string;
  /**
   * Tooltip / aria-label. Carries the shortcut, because the pill is small.
   *
   * ⛔ A ROW WITH `shortcut: null` MUST NOT NAME A KEY HERE. A tooltip that
   * advertises a binding the key handler does not hold is a dead affordance
   * with a label on it — the `site` row below is the live example.
   */
  readonly title: string;
  /** `KeyboardEvent.key` that activates this mode, or `null` for no shortcut. */
  readonly shortcut: string | null;
  /** The 3-D canvas's fate — see the file header. */
  readonly canvas: WorkspaceCanvasLayout;
  /**
   * §PANEL-MODE-GATE (L-12080) — may the element PROPERTIES panel show itself
   * in this mode? A COLUMN, not a second list: the whole point of this registry
   * is that a mode is a ROW and not five hand-edits, and "which modes show the
   * properties panel" is exactly the kind of fact that forks into a private
   * `mode !== 'author'` literal at every call site if it is not written here.
   *
   * ⚠ THIS GOVERNS THE PANEL, NEVER THE SELECTION. `'suppressed'` removes the
   * panel's pixels and nothing else — selection, 3-D highlighting, the multi-
   * select count and every downstream consumer keep running unchanged, because
   * Inspect's isolation pipeline and Analysis's "every figure traceable to
   * elements — click any of them" are BUILT on selection. A gate that reached
   * the selection itself would be a regression wearing a fix's commit message.
   */
  readonly propertiesPanel: 'shown' | 'suppressed';
  /**
   * §TOOLBAR-MODE-GATE (L-12220) — may the element EDITING toolbar (the
   * `.ceb-bar` round-icon strip: undo/redo, move/rotate/copy, delete,
   * join/cut/mirror/scale/align/offset/reference-edit) show itself in this
   * mode? A COLUMN beside `propertiesPanel`, for the identical reason that one
   * was written as a column instead of a second hand-kept list — see
   * §WORKSPACE-MODE-REGISTRY above.
   *
   * ⚠ THIS GOVERNS THE TOOLBAR, NEVER THE SELECTION — same split as
   * `propertiesPanel`. `'suppressed'` removes the bar's pixels and cancels any
   * armed operation; it does not touch `selectionBus`, 3-D highlighting, or any
   * selection-driven read surface. Inspect and Analysis are BUILT on selection
   * remaining live while the AUTHORING affordance is what disappears.
   */
  readonly editingToolbar: 'shown' | 'suppressed';
  /** Inline SVG for the pill. 13×13, `currentColor`, no fill. */
  readonly icon: string;
}

const ICON = (paths: string): string =>
  `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;

/**
 * The modes, in pill order.
 *
 * ⚠ Order is the rendered order AND the tab order. `site` sits FIRST because it
 * is where the work STARTS — the founder's 2026-09-07 transmission puts the
 * parcel-law surface *"left of Author"*, and the reason is the workflow, not
 * taste: an architect answers *what is this site · what may I build here* before
 * a wall exists to author. `analysis` sits after `inspect` because it is the
 * third half-mode; `data` stays last because it is the only mode that removes
 * the canvas.
 */
export const WORKSPACE_MODES: readonly WorkspaceModeDef[] = Object.freeze([
  {
    // §SITE-IS-A-MODE (L-13180 · C115 §0.3). ⭐ THE PARCEL LAW PANEL'S HOST.
    //
    // It was the FIFTH TAB OF ANALYSIS until 2026-09-07 and is now a top-level
    // mode. This is a RELOCATION, not a copy: `AnalysisTabId` lost its
    // `'parcel-law'` member in the same commit, and `#anl-surface` carries the
    // §2.5 relocation stamp naming this mode as the new home. Two live parcel
    // panels would be exactly the duplication C115 was opened to remove.
    id: 'site',
    label: 'Site',
    // ⛔ NO KEY IN THIS STRING — see `title` on the interface above. F1–F4 are
    // taken by the four rows below, and every remaining function key is claimed
    // by the browser: F5 is RELOAD, and `WorkspaceController._keyListener` calls
    // `preventDefault()` on any matched key, so binding it would swallow
    // hard-refresh app-wide — which is this project's own documented recovery
    // from a stale service-worker cache. `shortcut: null` is a supported row
    // value, not a gap. L-13180 holds the chord-map proposal for all five modes.
    title: 'Site mode — the parcel, its law and your envelope, beside the site view',
    shortcut: null,
    // ⛔ FORCED, NOT CHOSEN. C115 §1.4.1 `C115-113`…`C115-118` (founder rule 2)
    // make EVERY figure on this panel a hyperlink that PAINTS its geometry on
    // whichever view is open, and §3.G `C115-27` forbids a dead click. `'hidden'`
    // (Data's value) would turn all 27 control rows into dead clicks —
    // ADR-0343 §D.1 reason 2: a surface in a HIDDEN mode is a selector with
    // nothing to select in. `'full'` is impossible: the panel is
    // `position: fixed; right: 0; width: 50%`, so a `CLAIM_NONE` would centre the
    // shell's chrome on a canvas the panel covers.
    canvas: 'half',
    // §PANEL-MODE-GATE (L-12080). ⚠ NOT A NEW DECISION — the panel lives in
    // `analysis` today, which declares both columns suppressed, so this row
    // PRESERVES shipped behaviour rather than changing it. The reasoning carries
    // over unchanged: the multi-selection panel popping over the very figures the
    // selection was made to read.
    propertiesPanel: 'suppressed',
    // §TOOLBAR-MODE-GATE (L-12220). Same carry-over, and Site is the stronger
    // case: its left half shows the SITE (globe / 2D site map / plan), and a
    // floating move/rotate/delete/join strip there would offer BIM edits from a
    // mode whose subject is land. No C115 §3.G register row is a shell-toolbar
    // affordance — all 27 are panel-internal — so suppression drops nothing.
    editingToolbar: 'suppressed',
    // A parcel outline with its plot lines — the "map" glyph, not a globe: this
    // mode is about ONE plot, and the globe already means "3D Site" on the view.
    icon: ICON('<path d="M9 20l-5.447-2.724A1 1 0 0 1 3 16.382V5.618a1 1 0 0 1 1.447-.894L9 7"/><path d="M9 20l6-3"/><path d="M9 20V7"/><path d="M15 17l4.553 2.276A1 1 0 0 0 21 18.382V7.618a1 1 0 0 0-.553-.894L15 4"/><path d="M15 17V4"/><path d="M15 4L9 7"/>'),
  },
  {
    id: 'author',
    label: 'Author',
    title: 'Author mode — full 3D canvas (F1)',
    shortcut: 'F1',
    canvas: 'full',
    // The ONE mode that authors elements, so the ONE mode with the properties panel.
    propertiesPanel: 'shown',
    // The ONE mode elements are AUTHORED in, so the ONE mode with the editing toolbar.
    editingToolbar: 'shown',
    icon: ICON('<path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>'),
  },
  {
    id: 'inspect',
    label: 'Inspect',
    title: 'Inspect mode — 3D + data side-by-side (F2)',
    shortcut: 'F2',
    canvas: 'half',
    // The right half IS the read surface (AuditStack). A floating property panel
    // over the canvas half competes with it and with the isolation HUDs.
    propertiesPanel: 'suppressed',
    // §TOOLBAR-MODE-GATE (L-12220) — founder: "exclude the mode tools on the top
    // (cut, move, rotate…) — this should be omitted on Analysis and Inspect mode
    // views." Inspect reads the model; a floating move/rotate/delete strip over
    // that reading surface invites an edit from a mode built to not make one.
    editingToolbar: 'suppressed',
    icon: ICON('<rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/>'),
  },
  {
    id: 'analysis',
    label: 'Analysis',
    title: 'Analysis mode — 3D + dashboards side-by-side (F4)',
    shortcut: 'F4',
    canvas: 'half',
    // §PANEL-MODE-GATE (L-12080) — the founder's report: selecting a storey's 68
    // elements popped the MULTI-SELECTION panel straight over the Analysis widgets
    // the selection was made to read. The selection is the POINT of this mode; the
    // panel is what covered its answer.
    propertiesPanel: 'suppressed',
    // §TOOLBAR-MODE-GATE (L-12220) — the founder named THIS mode by name, and his
    // screenshot's two arrows cover the whole strip: undo/redo on the left, the
    // tool cluster on the right. Analysis's widgets are read surfaces over a
    // selection; the authoring strip is exactly the noise/hazard he flagged.
    editingToolbar: 'suppressed',
    icon: ICON('<line x1="4" y1="20" x2="4" y2="12"/><line x1="10" y1="20" x2="10" y2="4"/><line x1="16" y1="20" x2="16" y2="9"/><line x1="22" y1="20" x2="22" y2="15"/>'),
  },
  {
    id: 'data',
    label: 'Data',
    title: 'Data mode — full data workbench (F3)',
    shortcut: 'F3',
    canvas: 'hidden',
    // No canvas at all — a panel anchored to a viewport that is `display:none`
    // would float over the full-width workbench with nothing behind it.
    propertiesPanel: 'suppressed',
    // §TOOLBAR-MODE-GATE (L-12220) — SCOPE DECISION, not an assumption: the founder
    // named only Analysis and Inspect, but Data's canvas is `'hidden'` — there is no
    // 3-D viewport for move/rotate/mirror/align/offset to act ON. An editing
    // toolbar with nothing under it to edit is a worse dead affordance than one
    // merely out of place, and Data already suppresses the properties panel for
    // this identical reason two lines above. Consistency argues the same verdict
    // here; if a future Data view regains a live 3-D pane this row is the one
    // place to flip.
    editingToolbar: 'suppressed',
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

/**
 * §PANEL-MODE-GATE (L-12080) — ⭐ THE ONE GATE for the element properties panel.
 *
 * `PropertyPanel` reads this in exactly two places and nowhere else does: at the
 * single choke point where the panel becomes visible (`_makeVisible`), and on the
 * workspace-mode event so an ALREADY-OPEN panel closes when the mode changes
 * under it. Nothing else in the shell decides this — in particular
 * `WorkspaceController` no longer pokes `.gpp-panel`'s `display` per mode, which
 * was a second authority over one component's visibility (C84 EI-9) and which
 * lost every race against the next selection anyway: `_makeVisible()` set
 * `display:block` again the moment an element was clicked, which IS the defect
 * the founder reported.
 *
 * ⚠ FAIL-OPEN ON AN UNKNOWN ID, and that direction is deliberate. The properties
 * panel is the primary editing surface; a mode id this build does not know — a
 * stale localStorage value, a mode added by a newer build — must not silently
 * remove the ability to edit an element. `isWorkspaceMode` already rejects
 * unknown ids at the restore boundary, so this branch is the belt to that braces,
 * and it errs toward "the user can still work".
 *
 * `null` means "no mode has been observed yet" — the pre-boot state — and is
 * likewise allowed: `WorkspaceController` starts in `author` and only emits when
 * the mode actually differs, so silence means Author.
 */
export function propertiesPanelAllowedIn(id: string | null | undefined): boolean {
  if (id == null) return true;
  const def = getWorkspaceMode(id);
  return def ? def.propertiesPanel === 'shown' : true;
}

/**
 * §TOOLBAR-MODE-GATE (L-12220) — ⭐ THE ONE GATE for the element editing toolbar
 * (`ContextualEditBar`, `.ceb-bar`).
 *
 * Same shape as `propertiesPanelAllowedIn` immediately above, extending the
 * SAME registry rather than minting a rival mechanism: `ContextualEditBar`
 * reads this at its own single choke point (`setVisible`) and on the
 * `pryzm-workspace-mode` event, so a bar already showing when the mode changes
 * under it is force-hidden and any armed operation is cancelled rather than
 * left stranded with no visible affordance.
 *
 * ⚠ FAIL-OPEN ON AN UNKNOWN ID, for the same reason as its sibling: the editing
 * toolbar is a primary authoring surface, and a mode id this build does not
 * know must not silently remove the ability to move, rotate or delete an
 * element. `isWorkspaceMode` already rejects unknown ids at the restore
 * boundary; this is the belt to that braces.
 *
 * `null` means "no mode observed yet" (pre-boot) and is likewise allowed —
 * `WorkspaceController` starts in `author` and only emits when the mode
 * actually differs, so silence means Author.
 */
export function editingToolbarAllowedIn(id: string | null | undefined): boolean {
  if (id == null) return true;
  const def = getWorkspaceMode(id);
  return def ? def.editingToolbar === 'shown' : true;
}
