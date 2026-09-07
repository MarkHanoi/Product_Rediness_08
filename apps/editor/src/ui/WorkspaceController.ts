/**
 * WorkspaceController — Phase 1 of PRYZM UI Architecture V2
 *
 * CSS prefix: wsc-   (claimed here per §05 §3)
 * localStorage key: pryzm-workspace-mode
 * Event dispatched: pryzm-workspace-mode  { detail: { mode: WorkspaceMode } }
 *
 * ⚠ THE MODE LIST NO LONGER LIVES HERE — §WORKSPACE-MODE-REGISTRY (L-3000).
 * `ui/platform/workspaceModes.ts` is the ONE table: id, label, shortcut, and the
 * canvas layout (`full | half | hidden`). This file consumes it. Before ADR-0343
 * §D.1 the list was written out THREE times — a union literal here, an array
 * literal inside `WorkspaceModeBar._build()`, and three `if (e.key === 'F…')`
 * statements below — so a fourth mode was five hand-edits, not a registration.
 * ⛔ Do NOT reintroduce a mode name as a literal in this file.
 *
 * The modes, as the registry declares them:
 *   site     (—)  — 50/50 split: site view left, SiteSurface right (#ste-surface).
 *                   ⛔ NO SHORTCUT, by decision: F1–F4 are taken and F5 is the
 *                   browser's RELOAD, which `_keyListener` would swallow via
 *                   preventDefault(). See the `site` row in workspaceModes.ts.
 *   author   (F1) — full 3D canvas; DataWorkbench hidden
 *   inspect  (F2) — 50/50 split: 3D left (+ Z-Slicer + Lens Bar HUDs), AuditStack right
 *   analysis (F4) — 50/50 split: 3D left, Analysis surface right (ADR-0343)
 *   data     (F3) — DataWorkbench full width; Three.js canvas display:none
 *                   (canvas is hidden, NOT destroyed — avoids costly re-init)
 *
 * Contract compliance:
 *   §05 §3  — CSS prefix wsc- claimed in this file
 *   §05 §8  — layout changes via class/style on existing containers only
 *   §06 §1  — no BIM engine imports; accesses DataWorkbench, DMM, scene via window globals
 *   §01 §2  — no direct store mutations
 *
 * Inspect-mode additions (Phase 1.1):
 *   - Z-Slicer HUD      (.ins-zslicer range input injected over canvas)
 *   - Lens Selector Bar (.ins-lens-bar pill buttons injected over canvas)
 *   - Space key handler — toggles lens picker radial (in inspect mode only)
 *   - pryzm-delta-updated listener — lens bar health indicator refresh
 *   - Lens events dispatched via 'pryzm-set-inspect-lens' { lens }
 *     (InspectModeCoordinator receives these and calls DiagnosticMaterialManager)
 */

import { getFrameScheduler } from '@pryzm/frame-scheduler';
import { triggerWindowResize } from '../engine/triggerWindowResize'; // F.events.16
// §WORKSPACE-MODE-REGISTRY (L-3000 · ADR-0343 §D.1) — the ONE mode table.
import {
  getWorkspaceMode, WORKSPACE_MODES,
  isWorkspaceMode,
  workspaceModeForShortcut,
  type WorkspaceCanvasLayout,
  type WorkspaceMode,
} from './platform/workspaceModes';
// §SHELL-FLOAT-BUDGET (L-4010..L-4016) — the ONE writer of the canvas region.
import { publishShellCanvasRegion } from './layout/shellCanvasBudget';
// §VIEW-REGION-HAS-ONE-OWNER (C59 §2 invariant 10 / §2.10 · STR §26.1.2 · L-13030) — the
// mode SIZES the view region and does not write its box. This file DECLARES a claim; the
// region owner derives `#container`'s width, the split pane's width AND its offset from it.
//
// ⛔ `decideSplitViewForCanvas` (`platform/halfCanvasSplitViewPolicy.ts`) WAS IMPORTED HERE
// AND IS DELETED, not disabled. It closed the split pane on entering a half-canvas mode and
// reopened it on leaving — the source of the unrequested `Split view activated` /
// `Split view deactivated` pairs the founder caught on tape (L-13030), and a direct
// contradiction of C59 §2.10.3 ("split state is orthogonal to workspace mode and survives a
// mode change"). Its premise was that `.svp-pane` (z-index 1, `right: 0`) renders BEHIND
// `#anl-surface` (z-index 50, `right: 0`); the region owner now places the pane at
// `right: <the claim>`, beside the panel, so there is nothing left to close.
import {
  CLAIM_ALL,
  CLAIM_NONE,
  fractionClaim,
  setViewRegionClaim,
  type RegionClaim,
} from './layout/viewRegionGeometry';
// §ONBOARDING-IS-FULL-BLEED (L-13000) — the SAME phase predicate the launcher rail
// already asks (`panelAbsent('launcher-rail')` → §UX1-PANEL-DEFAULTS D6). This file
// asks it too rather than minting a second "are we in onboarding?" signal.
import { appPhase, onAppPhaseChanged, type AppPhase } from './layout/panelDefaults';

export type { WorkspaceMode };

const LS_KEY = 'pryzm-workspace-mode';

/**
 * §ONBOARDING-IS-FULL-BLEED (L-13000) — the mode the guided onboarding globe runs in.
 *
 * The globe is a FULL-BLEED surface parented into `#container`, so any mode whose
 * `canvas` is `'half'` slices it in two and hands the other half to a dashboard about
 * a project that has no parcel, no boundary and no elements. `'author'` is the one
 * mode that declares `canvas: 'full'` AND keeps the authoring affordances the founder
 * asked for by name (*"THE VIEW IS ALWAYS IN 'AUTHOR' FULL VIEW WITH THE EARTH"*).
 *
 * Named once, and `_mode` initialises FROM it, so the boot default and the onboarding
 * default cannot drift apart — this replaces a literal rather than adding one
 * (§WORKSPACE-MODE-REGISTRY's ⛔ above).
 */
const ONBOARDING_GLOBE_MODE: WorkspaceMode = 'author';
// F.events.6 — dispatch migrated to runtime.events; EVENT const retired.

/**
 * §VIEW-REGION-HAS-ONE-OWNER (C59 §2.10.3 item 2) — the registry's canvas layout, as a
 * CLAIM on the shell. This is the entirety of what a workspace mode may say about
 * geometry: how much of the shell its panel takes. It says nothing about panes, nothing
 * about the split, and it writes no style.
 *
 *   'full'   → nothing claimed; the region is the whole shell.
 *   'half'   → the mode's right-hand surface (`#anl-surface` / `#aud-stack`, both
 *              `position: fixed; right: 0; width: 50%`) takes half.
 *   'hidden' → the whole shell; the region collapses and `#container` is `display:none`.
 */
function claimForCanvas(canvas: WorkspaceCanvasLayout): RegionClaim {
    switch (canvas) {
        case 'full': return CLAIM_NONE;
        case 'half': return fractionClaim(0.5);
        case 'hidden': return CLAIM_ALL;
    }
}

type LevelExplodeMode = 'stacked' | 'exploded' | 'solo';
const LEVEL_MODE_ORDER: LevelExplodeMode[] = ['stacked', 'exploded', 'solo'];

const LENS_DEFS = [
  { id: 'ghost',    label: 'Ghost',    icon: '◌' },
  { id: 'spatial',  label: 'Area',     icon: '⊞' },
  { id: 'openings', label: 'Openings', icon: '⊡' },
  { id: 'finishes', label: 'Finishes', icon: '◫' },
  { id: 'xray',     label: 'X-Ray',    icon: '◎' },
  { id: 'assets',   label: 'Assets',   icon: '⊕' },
] as const;

type LensId = typeof LENS_DEFS[number]['id'];

export class WorkspaceController {
  private _mode: WorkspaceMode = ONBOARDING_GLOBE_MODE;
  /**
   * §ONBOARDING-IS-FULL-BLEED (L-13000) — the persisted mode, HELD because the
   * guided onboarding globe owns the screen. `null` when nothing is held.
   *
   * ⛔ HELD, NEVER DISCARDED. Removing mode persistence would be the wrong fix:
   * restoring the last mode on a project that HAS content is correct and wanted.
   * The defect is applying it to a project that is still being located — so the
   * value waits here and is applied the moment the canvas phase is declared
   * (`OnboardingStepController.dispose()` / `declarePhaseForProjectOpen()`).
   */
  private _modeHeldForOnboarding: WorkspaceMode | null = null;
  /** Disposer for the phase subscription opened in the constructor. */
  private _unsubPhase: (() => void) | null = null;
  /*
   * ⛔ `_splitViewClosedByShell` WAS HERE AND IS GONE (L-13030 · C59 §2.10.3).
   * It remembered that the shell had closed the split pane so a later full-canvas mode
   * could reopen it. Under §2.10.3 the split is ORTHOGONAL to the workspace mode and
   * survives a mode change untouched, so there is nothing to remember: this controller
   * no longer opens or closes the split at all. The claim it now declares
   * (`claimForCanvas`) is the ONLY thing a mode says about geometry.
   */
  private _activeLens: LensId = 'ghost';
  private _levelExplodeMode: LevelExplodeMode = 'stacked';
  private _soloLevelId: string | undefined;
  private _keyListener:    ((e: KeyboardEvent) => void) | null = null;
  private _spaceListener:  ((e: KeyboardEvent) => void) | null = null;
  private _unsubDelta: (() => void) | null = null;
  private _lensBarEl:      HTMLElement | null = null;
  private _zSlicerEl:      HTMLElement | null = null;
  private _lensPickerEl:   HTMLElement | null = null;
  private _explodeBarEl:   HTMLElement | null = null;

  constructor() {
    this._attachKeyboardShortcuts();
    // §ONBOARDING-IS-FULL-BLEED (L-13000) — subscribe ONCE, at construction, because
    // the phase can flip in either direction after `restoreFromStorage()` has run:
    // `resetAppPhaseForNewProject()` re-arms the globe for a SECOND project created in
    // the same session, and `dispose()`/`declarePhaseForProjectOpen()` declare the
    // canvas. A controller that read the phase only at restore time would be correct
    // only if it happened to be built after the phase settled — the null-at-mount race
    // this codebase has already paid for (`panelDefaults.ts` → `onAppPhaseChanged`).
    // `panelDefaults` is a leaf module with no imports, so this cannot cycle.
    this._unsubPhase = onAppPhaseChanged((phase) => this._onAppPhaseChanged(phase));
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  getMode(): WorkspaceMode {
    return this._mode;
  }

  setMode(mode: WorkspaceMode): void {
    if (this._mode === mode) return;
    const previous = this._mode;
    this._mode = mode;
    localStorage.setItem(LS_KEY, mode);

    if (previous === 'inspect' && mode !== 'inspect') {
      this._teardownInspectHUDs();
    }

    this._applyLayout();
    window.runtime?.events?.emit('pryzm-workspace-mode', { mode }); // F.events.6
    console.log(`[WorkspaceController] Mode → ${mode}`);
  }

  /** Restore the last saved mode from localStorage. Safe to call multiple times. */
  restoreFromStorage(): void {
    // §WORKSPACE-MODE-REGISTRY — validate against the table rather than casting.
    // A stale localStorage value from a build that had a mode this build does not
    // would otherwise put the shell into a mode nothing lays out.
    const raw = localStorage.getItem(LS_KEY);
    const saved = isWorkspaceMode(raw) ? raw : null;
    if (!saved) return;
    // ══════════════════════════════════════════════════════════════════════════
    // §ONBOARDING-IS-FULL-BLEED (L-13000) — DO NOT RESTORE A MODE OVER THE
    // ONBOARDING GLOBE.
    //
    // THE DEFECT (founder 2026-09-06, two screenshots): at "STEP 1 OF 4 ·
    // LOCATION" this line logged `Restored mode → analysis` on a BRAND-NEW empty
    // project and `_applyLayout()` set `#container.style.width = '50%'` — so the
    // full-bleed onboarding globe was squeezed into the left half and an Analysis
    // dashboard about a project with no parcel, no boundary and no elements took
    // the right. His own words: *"pLEASE MAKE SURE AT THIS STAGE THE VIEW IS
    // ALWAYS IN 'AUTHOR' FULL VIEW WITH THE EARTH"*.
    //
    // ⚠ THE SECOND CONSEQUENCE IS NOW STRUCTURALLY GONE, recorded because the FIX
    // changed, not the history. `decideSplitViewForCanvas` used to CLAIM the split-view
    // pane on the way in and reopen it on the next full-canvas mode — the blank
    // light-lavender rectangle of the SECOND screenshot (*"eVEN IN AUTHOR - THE RIGHT
    // HAND SIDE IS CORRUPTED"*): an empty `.svp-pane` reopened by a claim that was only
    // ever taken because a stale mode was restored. That policy is DELETED under C59
    // §2.10 (L-13030): a workspace mode no longer opens or closes the split at all. The
    // hold below still matters for the FIRST consequence — the globe cut in half.
    //
    // ⭐ THE PREDICATE IS NOT NEW. `panelDefaults`' `AppPhase` already means exactly
    // "is there a BIM canvas yet, or is the user still in the guided globe flow",
    // it is already declared by the flow's own brackets (`start()` →
    // `resetAppPhaseForNewProject()`, `dispose()` → `setAppPhase('canvas')`), and
    // it is what the launcher rail already asks before it declines to mount
    // (§UX1-PANEL-DEFAULTS D6). This asks the SAME question rather than minting a
    // second onboarding state, exactly as §ONBOARDING-STEP-PINS-ITS-SURFACE
    // (L-10720) did for the pane layout.
    //
    // ⛔ HELD, NOT DROPPED. Persistence is correct and wanted for a project that
    // has content; `_onAppPhaseChanged` applies the held value the moment the
    // canvas is declared, so the feature survives intact.
    // ══════════════════════════════════════════════════════════════════════════
    if (appPhase() === 'onboarding-globe') {
      this._modeHeldForOnboarding = saved;
      console.log(
        `[WorkspaceController] §ONBOARDING-IS-FULL-BLEED — mode "${saved}" HELD, not restored: `
        + 'the phase is the onboarding globe, which owns the whole screen. It is applied when '
        + 'the canvas phase is declared (L-13000).',
      );
      this._applyOnboardingFullBleed();
      return;
    }
    this._applyRestoredMode(saved);
  }

  /**
   * Apply a mode that came from STORAGE (not from a user gesture), without
   * re-persisting it. Shared by `restoreFromStorage()` and the held-mode release in
   * `_onAppPhaseChanged()` so the two cannot drift.
   */
  private _applyRestoredMode(mode: WorkspaceMode): void {
    if (mode === this._mode) return;
    const previous = this._mode;
    this._mode = mode;
    if (previous === 'inspect') this._teardownInspectHUDs();
    this._applyLayout();
    window.runtime?.events?.emit('pryzm-workspace-mode', { mode: this._mode }); // F.events.6
    console.log(`[WorkspaceController] Restored mode → ${this._mode}`);
  }

  /**
   * §ONBOARDING-IS-FULL-BLEED (L-13000) — put the shell into the full-bleed author
   * layout for the onboarding globe.
   *
   * ⛔ DELIBERATELY NOT `setMode()`: that writes `localStorage`, which would DESTROY
   * the very preference this lane exists to preserve. The user's saved mode is only
   * ever written by a user gesture.
   */
  private _applyOnboardingFullBleed(): void {
    if (this._mode === ONBOARDING_GLOBE_MODE) return;
    const previous = this._mode;
    this._mode = ONBOARDING_GLOBE_MODE;
    if (previous === 'inspect') this._teardownInspectHUDs();
    this._applyLayout();
    window.runtime?.events?.emit('pryzm-workspace-mode', { mode: this._mode }); // F.events.6
    console.log(
      `[WorkspaceController] §ONBOARDING-IS-FULL-BLEED — "${previous}" → "${this._mode}" for the `
      + 'onboarding globe (full-bleed). The saved mode is untouched and returns with the canvas.',
    );
  }

  /**
   * §ONBOARDING-IS-FULL-BLEED (L-13000) — the phase is the driver, in BOTH directions.
   *
   *   · `'canvas'`          — the guided flow is over (or an existing project was
   *                           opened): release whatever was held.
   *   · `'onboarding-globe'`— a NEW guided setup started in a session that had already
   *                           reached the canvas (`resetAppPhaseForNewProject()`).
   *                           Without this arm the second project of a session would
   *                           run its onboarding in whatever mode the first ended in —
   *                           the identical defect, reached from the other side.
   */
  private _onAppPhaseChanged(phase: AppPhase): void {
    if (phase === 'canvas') {
      const held = this._modeHeldForOnboarding;
      this._modeHeldForOnboarding = null;
      if (!held) return;
      console.log(`[WorkspaceController] canvas phase declared — releasing the held mode → ${held}.`);
      this._applyRestoredMode(held);
      return;
    }
    // Re-armed for a new guided setup. Hold the mode we are leaving (falling back to
    // the persisted value) so the user's choice still comes back at `dispose()`.
    const raw = localStorage.getItem(LS_KEY);
    this._modeHeldForOnboarding = isWorkspaceMode(raw) ? raw : this._mode;
    this._applyOnboardingFullBleed();
  }

  dispose(): void {
    if (this._keyListener) {
      document.removeEventListener('keydown', this._keyListener);
      this._keyListener = null;
    }
    if (this._unsubPhase) {
      try { this._unsubPhase(); } catch { /* listener set already gone */ }
      this._unsubPhase = null;
    }
    this._teardownInspectHUDs();
  }

  // ── Layout application ─────────────────────────────────────────────────────

  private _applyLayout(): void {
    const canvas    = document.getElementById('container');
    const dw        = window.dataWorkbench as { setMode: (m: string) => void } | undefined; // TODO(F.6.5): legacy dataWorkbench — replace with runtime.panelHost.get('dataWorkbench')

    // §PANEL-MODE-GATE (L-12080) — the `.gpp-panel` querySelector and its four
    // per-mode `style.display` writes USED TO LIVE HERE, and they were the wrong
    // half of the mechanism twice over.
    //
    //   1. They were a SECOND authority over another component's visibility
    //      (C84 EI-9). `PropertyPanel` decides when it is visible; this file
    //      reached past it into its DOM node.
    //   2. They LOST. A display poke fires once, at the mode switch. The panel's
    //      own `_makeVisible()` then set `display:block` again on the very next
    //      selection — and in Inspect and Analysis, selection is the entire
    //      interaction. That is the founder's report: the MULTI-SELECTION panel
    //      appearing over the Analysis widgets he had selected 68 elements to read.
    //
    // The rule now lives as a COLUMN on the mode registry
    // (`workspaceModes.ts` → `propertiesPanel` / `propertiesPanelAllowedIn`), and
    // the panel reads it at both moments that matter: when it is asked to become
    // visible, and when the `pryzm-workspace-mode` emit below tells it the mode
    // changed under an already-open panel. Nothing needs doing here.
    //
    // ⛔ Do not reintroduce a `.gpp-panel` write in this file. Restoring one
    // reinstates the losing race AND the second authority in the same line.

    // §MODE-BODY-CLASS-FOR-EVERY-MODE (L-3601) — was a single hand-written line
    // toggling ONLY `pryzm-mode-inspect`, and that asymmetry was a real defect,
    // not a tidiness point.
    //
    // ⭐ MEASURED (lane ANLZ3): `.wmb-toplevel-wrapper` is `position: fixed;
    // left: 50%` — and in a half-canvas mode `left: 50%` IS the panel's own left
    // edge, so the mode bar draws ON TOP of the panel header. Inspect escapes it
    // with `body.pryzm-mode-inspect .wmb-toplevel-wrapper { left: 25% }`
    // (inspectModeShell.ts:202). Analysis is ALSO a half-canvas mode and had no
    // such rule available, because there was no body class to hang one on — which
    // is the founder's sliced "Every figure traceable to elements" subtitle.
    //
    // Derived from the registry rather than extended by hand: §WORKSPACE-MODE-REGISTRY
    // (L-3000) collapsed a five-times-duplicated mode list into one table
    // precisely so a new mode is a row, not five edits. A second hand-written
    // toggle here would have been the sixth copy.
    //
    // ⛔ ADDITIVE ONLY. `pryzm-mode-inspect` is emitted exactly as before, so
    // every existing Inspect rule is untouched; the loop only ADDS classes for
    // the other modes. It does not, on its own, re-centre anything — a mode still
    // needs its own `left` rule (Analysis's now ships in analysisSurface.ts).
    for (const m of WORKSPACE_MODES) {
      document.body.classList.toggle(`pryzm-mode-${m.id}`, this._mode === m.id);
    }

    // §WORKSPACE-MODE-REGISTRY (L-3000) — the CANVAS half of the layout is now a
    // table lookup, not a per-mode branch. An unknown id cannot reach here
    // (restoreFromStorage validates), but if it ever did, treating it as 'full'
    // leaves the user with a working viewport rather than a blank screen.
    const def = getWorkspaceMode(this._mode);

    // §SHELL-FLOAT-BUDGET (L-4010..L-4016) — PUBLISH THE CANVAS REGION, and it is
    // the ONE place a half-canvas mode is accounted for by the floating chrome.
    //
    // ⛔ WHAT THIS REPLACES. Every canvas-anchored bar in the shell is
    // `position: fixed; left: 50%; translateX(-50%)`, and in a half-canvas mode
    // `left: 50%` IS the right-hand panel's left edge — so each one drew its
    // right half onto the panel. The escape had been hand-written once per
    // (mode × bar): FOUR rules in `inspectModeShell.ts` and ONE in
    // `analysisSurface.ts` (L-3601), covering 5 of the 8 cells those two modes
    // and four bars make. The bar the founder actually reported — `.ceb-bar`,
    // the editor toolbar — was in NEITHER list, which is why the ANALYSIS header
    // was still occluded after L-3601 moved the mode bar out of the way.
    //
    // ⭐ DERIVED FROM THE REGISTRY, so a new half-canvas mode is a ROW and not a
    // sixth CSS rule (ADR-0343 §D.1 — the same reason §WORKSPACE-MODE-REGISTRY
    // collapsed the mode LIST into a table). The bars consume
    // `var(--shell-canvas-cx)`; none of them names a mode, and none of them
    // needs editing when a mode is added.
    //
    // `canvas: 'hidden'` (Data) keeps the viewport centre ON PURPOSE: there is no
    // canvas to centre on, and the mode bar must stay reachable over the
    // full-width workbench or the mode cannot be left. Stated here rather than
    // left as a silent `else`, because it is a decision, not a default.
    // ⛔ CORRECTED 2026-08-22, SAME DAY, BY THE FOUNDER'S NEXT SCREENSHOT.
    // This block first read:
    //     const half = def?.canvas === 'half';
    //     setProperty('--shell-canvas-cx', half ? '25%' : '50%');
    // Correct for the two half-canvas MODES and wrong for everything else that
    // narrows the canvas. `#container` is ALSO `width: 60%` under `.svp-active`
    // (splitView.ts:23, toggled from three call sites), and the remaining 40% is
    // `.svp-pane` with its own header bar — so a mode-derived budget left this
    // opaque fixed row at 50% of the VIEWPORT, on top of that pane's header.
    // Enumerating the causes of a narrow canvas is a CENSUS, and this lane's
    // whole finding is that censuses rot. The region is measured instead.
    // The registry still DECIDES the width just below; the publisher READS it.
    // ⭐ §VIEW-REGION-HAS-ONE-OWNER (C59 §2 invariant 10 / §2.10 · L-13030) — THE MODE
    // DECLARES ITS CLAIM AND WRITES NOTHING.
    //
    // ⛔ WHAT THIS REPLACED, AND WHY IT WAS NOT A TIMING BUG. This block used to (a) ask
    // `decideSplitViewForCanvas` whether to CLOSE or REOPEN the split pane and (b) write
    // `canvas.style.width` itself — `''` for a full mode, `'50%'` for a half one. Both
    // halves were defects under §2.10.3:
    //
    //   · The close/reopen made the split a FUNCTION of the workspace mode. §2.10.3 says
    //     the split is orthogonal to it and survives it, and the founder's console
    //     (L-13030) caught the consequence: `Split view activated` / `deactivated` pairs
    //     repeating SIX times for zero user input, each cycle resizing the Cesium canvas
    //     836→501→836 and re-framing the camera.
    //   · The width write made this the second of SEVEN writers of one property. And it
    //     never even bound: `#container` is `flex: 1 1 0`, so a `width` with no
    //     `max-width` and no `flex-grow: 0` is overridden by the flex line. The mode has
    //     been *declaring* a half canvas and *rendering* a full one, with the panel simply
    //     covering the right half of a full-width viewport.
    //
    // Now: one claim, one owner, one derivation. The owner writes `#container`'s box AND
    // places the split pane at `right: <the claim>` — beside the panel rather than behind
    // it, which is what dissolves the L-12915 occlusion the close/reopen existed to dodge.
    setViewRegionClaim('workspace-mode', claimForCanvas(def?.canvas ?? 'full'));

    // §SHELL-FLOAT-BUDGET — `setViewRegionClaim` republishes the budget as part of its
    // apply, so the bars move in the same frame as the region. This second call covers the
    // no-`#container` case (a test DOM, a pre-mount frame), where the owner has nothing to
    // write but the budget must still fall back to its declared defaults. Both are
    // idempotent writes of two custom properties; neither computes a value.
    if (canvas) publishShellCanvasRegion();

    // The WORKBENCH half stays a per-mode decision: it is not derivable from the
    // canvas layout, and §L-847 below is a founder ruling that must stay visible.
    switch (this._mode) {
      case 'site':
        // §SITE-IS-A-MODE (L-13180 · C115 §0.3) — 50/50: the site view keeps the left
        // half, `#ste-surface` (the Parcel Law panel) takes the right. DataWorkbench
        // hidden, like every other half-canvas mode.
        //
        // ⛔ THIS ARM IS NOT OPTIONAL AND THE SWITCH HAS NO `default`. A mode missing
        // from here leaves the workbench in whatever state the PREVIOUS mode left it —
        // so Data → Site would render a full-width workbench on top of this panel.
        // `analysisHonesty.spec.ts` pins the identical hazard for Analysis; the site
        // arm is pinned by `siteSurfaceMount.spec.ts`.
        if (dw) dw.setMode('hidden');
        break;

      case 'author':
        if (dw) dw.setMode('hidden');
        break;

      case 'inspect':
        // 50/50: canvas takes left half; AuditStack panel takes right half (fixed)
        // DataWorkbench hidden — AuditStack replaces it in inspect mode
        if (dw) dw.setMode('hidden');
        this._setupInspectHUDs();
        break;

      case 'analysis':
        // ADR-0343 §D.1 — 50/50: canvas left, AnalysisSurface right (fixed,
        // #anl-surface, structurally identical to how inspect mounts AuditStack).
        // The canvas stays VISIBLE because every widget is a selector: a
        // dashboard that cannot highlight what it describes is the thing this
        // mode exists to not be.
        if (dw) dw.setMode('hidden');
        break;

      case 'data':
        // §L-847 (2026-08-13, founder decision): DataWorkbench IS the shipped F3
        // Data surface, full width — exactly what this file's own header always
        // said ("data (F3) — DataWorkbench full width"). The line below used to
        // read `dw.setMode('hidden')`, which benched the only surface with the
        // Hierarchy (model-tree) sub-tab while the DataCommandCenter overlay
        // (AuditBucket delta grid, no sub-tab bar) claimed the mode event and
        // covered the screen. DataCommandCenter is now PARKED, not deleted —
        // see DataCommandCenter._bindEvents.
        if (dw) dw.setMode('full');
        break;
    }

    // Tell Three.js renderer to resize after layout shift.
    // D.7.5: routed through getFrameScheduler() instead of raw rAF.
    // Registry-driven: a hidden canvas has nothing to resize.
    if ((def?.canvas ?? 'full') !== 'hidden') {
      getFrameScheduler().scheduleOnce('workspace-controller-resize', () => triggerWindowResize()); // F.events.16
    }
  }

  // ── Inspect HUDs ──────────────────────────────────────────────────────────

  private _setupInspectHUDs(): void {
    const canvas = document.getElementById('container');
    if (!canvas) return;

    // Ensure container is positioned
    if (getComputedStyle(canvas).position === 'static') {
      canvas.style.position = 'relative';
    }

    this._buildLensBar(canvas);
    this._buildZSlicer(canvas);
    this._buildLevelExplodeBar(canvas);
    this._attachSpaceKey();
    this._attachDeltaListener();
  }

  private _teardownInspectHUDs(): void {
    this._lensBarEl?.remove();
    this._lensBarEl = null;

    this._zSlicerEl?.remove();
    this._zSlicerEl = null;

    this._lensPickerEl?.remove();
    this._lensPickerEl = null;

    this._explodeBarEl?.remove();
    this._explodeBarEl = null;

    if (this._spaceListener) {
      document.removeEventListener('keydown', this._spaceListener);
      this._spaceListener = null;
    }
    // F.events.6 — pryzm-delta-updated migrated to runtime.events.
    this._unsubDelta?.();
    this._unsubDelta = null;
  }

  // ── Lens Bar ───────────────────────────────────────────────────────────────

  private _buildLensBar(container: HTMLElement): void {
    if (this._lensBarEl) this._lensBarEl.remove();

    const bar = document.createElement('div');
    bar.className = 'ins-lens-bar';

    for (const lens of LENS_DEFS) {
      const pill = document.createElement('button');
      pill.className = `ins-lens-pill ${lens.id === this._activeLens ? 'ins-lens-active' : ''}`;
      pill.dataset.lens = lens.id;
      pill.innerHTML = `<span>${lens.icon}</span>${lens.label}`;
      pill.addEventListener('click', () => this._activateLens(lens.id));
      bar.appendChild(pill);
    }

    container.appendChild(bar);
    this._lensBarEl = bar;
  }

  private _activateLens(lens: LensId): void {
    this._activeLens = lens;

    // Update pill active state
    this._lensBarEl?.querySelectorAll('.ins-lens-pill').forEach(el => {
      const btn = el as HTMLButtonElement;
      btn.classList.toggle('ins-lens-active', btn.dataset.lens === lens);
    });

    // Close lens picker if open
    this._lensPickerEl?.remove();
    this._lensPickerEl = null;

    // Dispatch event → InspectModeCoordinator will apply the lens via DMM
    window.runtime?.events?.emit('pryzm-set-inspect-lens', { lens }); // F.events.2d — DOM dispatch removed; all listeners now on runtime.events
    console.log(`[WorkspaceController] Lens → ${lens}`);
  }

  // ── Z-Slicer ──────────────────────────────────────────────────────────────

  private _buildZSlicer(container: HTMLElement): void {
    if (this._zSlicerEl) this._zSlicerEl.remove();

    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:absolute;left:8px;top:50%;transform:translateY(-50%) rotate(-90deg);z-index:120;display:flex;align-items:center;gap:6px;';

    const label = document.createElement('span');
    label.className = 'ins-zslicer-label';
    label.textContent = 'Z SLICE';

    const slider = document.createElement('input');
    slider.type       = 'range';
    slider.className  = 'ins-zslicer';
    slider.min        = '0';
    slider.max        = '100';
    slider.value      = '100';
    slider.title      = 'Clip plane elevation';
    slider.style.cssText = 'width:120px;';

    slider.addEventListener('input', () => {
      const pct = parseInt(slider.value, 10) / 100;
      window.runtime?.events?.emit('pryzm-zslicer-change', { pct }); // F.events.2d — DOM dispatch removed; all listeners now on runtime.events
    });

    wrap.appendChild(label);
    wrap.appendChild(slider);
    container.appendChild(wrap);
    this._zSlicerEl = wrap;
  }

  // ── Level Explode HUD ─────────────────────────────────────────────────────

  /**
   * Level explode bar — positioned above the lens bar at the bottom-centre of the canvas.
   * Three mode buttons: Stacked | Exploded | Solo.
   * When Solo is active a level <select> is shown to isolate a single floor.
   *
   * Dispatches:  pryzm-inspect-level-explode  { mode, soloLevelId? }
   * Consumed by: LevelExplodeController (engine Builder layer)
   *
   * CSS prefix: ins-explode-  (extension of the ins- inspect prefix claimed in §05 §3)
   */
  private _buildLevelExplodeBar(container: HTMLElement): void {
    if (this._explodeBarEl) this._explodeBarEl.remove();

    // Sync with LevelExplodeController which resets to stacked on activate()
    this._levelExplodeMode = 'stacked';
    this._soloLevelId = undefined;

    const bar = document.createElement('div');
    bar.className = 'ins-explode-bar';

    const modeLabels: Record<LevelExplodeMode, string> = {
      stacked:  '≡ Stacked',
      exploded: '⬆ Explode',
      solo:     '◉ Solo',
    };

    const render = () => {
      bar.innerHTML = '';

      // Mode buttons
      for (const m of LEVEL_MODE_ORDER) {
        const btn = document.createElement('button');
        btn.className = `ins-explode-btn${this._levelExplodeMode === m ? ' ins-explode-active' : ''}`;
        btn.textContent = modeLabels[m];
        btn.title = m === 'stacked'
          ? 'All floors stacked (normal view)'
          : m === 'exploded'
          ? 'Separate floors vertically for inspection'
          : 'Isolate a single floor';
        btn.addEventListener('click', () => {
          this._setExplodeMode(m, render);
        });
        bar.appendChild(btn);
      }

      // Level selector for Solo mode
      if (this._levelExplodeMode === 'solo') {
        const sep = document.createElement('span');
        sep.className = 'ins-explode-sep';
        sep.textContent = '|';
        bar.appendChild(sep);

        const sel = document.createElement('select');
        sel.className = 'ins-explode-select';
        sel.title = 'Select the floor to isolate';

        const bm = window.bimManager as { getLevels(): Array<{ id: string; name?: string; elevation: number }> } | undefined; // TODO(D.4): legacy bimManager — replace with runtime.scene.renderer / runtime.tools
        const levels = (bm?.getLevels() ?? []).sort((a, b) => a.elevation - b.elevation);

        if (levels.length === 0) {
          const opt = document.createElement('option');
          opt.textContent = 'No levels';
          sel.appendChild(opt);
          sel.disabled = true;
        } else {
          for (let i = 0; i < levels.length; i++) {
            const lv = levels[i];
            const opt = document.createElement('option');
            opt.value = lv.id;
            opt.textContent = lv.name ?? `Level ${i + 1}`;
            if (lv.id === this._soloLevelId) opt.selected = true;
            sel.appendChild(opt);
          }
          // Default to first level if none selected
          if (!this._soloLevelId && levels.length > 0) {
            this._soloLevelId = levels[0].id;
            sel.value = levels[0].id;
            this._setActiveLevel(levels[0].id);
            this._dispatchExplode();
          }
        }

        sel.addEventListener('change', () => {
          this._soloLevelId = sel.value;
          // A.21.D28 #9 — the bottom-bar level selector previously only soloed
          // visibility; the ACTIVE creation level was left untouched, so picking
          // a floor here appeared to "do nothing" (new elements still landed on
          // the old level). Set the active level the way the top-bar HUD does so
          // selecting a floor here changes the creation context too.
          this._setActiveLevel(sel.value);
          this._dispatchExplode();
          console.log(`[WorkspaceController] Solo level: ${sel.value}`);
        });

        bar.appendChild(sel);
      }
    };

    render();
    container.appendChild(bar);
    this._explodeBarEl = bar;
  }

  private _setExplodeMode(mode: LevelExplodeMode, rerender: () => void): void {
    if (this._levelExplodeMode === mode) return;
    this._levelExplodeMode = mode;
    if (mode !== 'solo') this._soloLevelId = undefined;
    rerender();
    this._dispatchExplode();
    console.log(`[WorkspaceController] Level explode mode: ${mode}`);
  }

  private _dispatchExplode(): void {
    // F.events.2d — DOM dispatch removed; all listeners now on runtime.events
    window.runtime?.events?.emit('pryzm-inspect-level-explode', {
      mode:        this._levelExplodeMode,
      soloLevelId: this._soloLevelId,
    });
  }

  /**
   * A.21.D28 #9 — set the ACTIVE creation level the way the top-bar level HUD,
   * LevelManagerPanel, and LeftNavRail do: `projectContext.activeLevelId` is the
   * single source of truth every creation tool reads. Its setter fires
   * 'activeLevelChanged', which drives the canonical visual update chain (and
   * BottomActionMenu's level filters). Falls back to bimManager when the project
   * context isn't on window yet. §02 §1.6 — active level is session state, no
   * command needed (P6 is unaffected: this is not a model mutation).
   */
  private _setActiveLevel(levelId: string): void {
    if (!levelId) return;
    const pc = window.projectContext; // TODO(C.3.x): replace with runtime.persistence.projectContext
    if (pc) {
      pc.activeLevelId = levelId;
    } else {
      (window.bimManager as { setActiveLevel?: (id: string) => void } | undefined)?.setActiveLevel?.(levelId); // TODO(D.4): legacy bimManager
    }
    window.runtime?.events?.emit('pryzm-active-level-changed', { levelId }); // mirrors LeftNavRail
  }

  // ── Space key lens picker ─────────────────────────────────────────────────

  private _attachSpaceKey(): void {
    if (this._spaceListener) return;

    this._spaceListener = (e: KeyboardEvent) => {
      if (this._mode !== 'inspect') return;
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable) return;
      if (e.code !== 'Space') return;
      e.preventDefault();
      this._toggleLensPicker();
    };

    document.addEventListener('keydown', this._spaceListener);
  }

  private _toggleLensPicker(): void {
    if (this._lensPickerEl) {
      this._lensPickerEl.remove();
      this._lensPickerEl = null;
      return;
    }

    const picker = document.createElement('div');
    picker.style.cssText = [
      'position:fixed',
      'top:50%',
      'left:25%',
      'transform:translate(-50%,-50%)',
      'background:rgba(10,10,12,0.95)',
      'border:1px solid var(--app-border,#2a2a2e)',
      'border-radius:12px',
      'padding:10px 12px',
      'z-index:500',
      'display:flex',
      'flex-direction:column',
      'gap:4px',
      'min-width:160px',
      'backdrop-filter:blur(12px)',
    ].join(';');

    const title = document.createElement('div');
    title.style.cssText = 'font-size:9px;font-weight:700;letter-spacing:0.1em;color:var(--app-text-muted,#888);text-transform:uppercase;padding-bottom:6px;border-bottom:1px solid var(--app-border,#2a2a2e);margin-bottom:2px;';
    title.textContent = 'SELECT LENS  (Space)';
    picker.appendChild(title);

    for (const lens of LENS_DEFS) {
      const btn = document.createElement('button');
      btn.style.cssText = [
        'display:flex',
        'align-items:center',
        'gap:8px',
        'padding:6px 8px',
        'border-radius:6px',
        'border:none',
        'background:' + (lens.id === this._activeLens ? 'rgba(124,58,237,0.25)' : 'transparent'),
        'color:' + (lens.id === this._activeLens ? 'var(--app-accent-light,#a78bfa)' : 'var(--app-text,#e8e8e8)'),
        'font-size:12px',
        'cursor:pointer',
        'text-align:left',
        'width:100%',
      ].join(';');
      btn.innerHTML = `<span style="font-size:14px;width:18px;text-align:center;">${lens.icon}</span>${lens.label}`;
      btn.addEventListener('click', () => {
        this._activateLens(lens.id);
      });
      picker.appendChild(btn);
    }

    document.body.appendChild(picker);
    this._lensPickerEl = picker;

    // Dismiss on click-outside
    const dismiss = (e: MouseEvent) => {
      if (!picker.contains(e.target as Node)) {
        picker.remove();
        this._lensPickerEl = null;
        document.removeEventListener('mousedown', dismiss);
      }
    };
    setTimeout(() => document.addEventListener('mousedown', dismiss), 50);
  }

  // ── Delta listener ────────────────────────────────────────────────────────

  private _attachDeltaListener(): void {
    if (this._unsubDelta) return;
    // F.events.6 — migrated from DOM CustomEvent to runtime.events typed bus.
    // Handler is intentionally a no-op: InspectModeCoordinator re-applies the lens
    // independently; AuditStack also listens independently. Nothing extra needed here.
    this._unsubDelta = window.runtime?.events?.on('pryzm-delta-updated', () => {
      // no-op — see comment above
    }) ?? null;
  }

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────

  private _attachKeyboardShortcuts(): void {
    this._keyListener = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable) return;

      // §WORKSPACE-MODE-REGISTRY (L-3000) — was three `if (e.key === 'F…')`
      // statements, which is why a fourth mode used to mean a fourth `if`.
      const def = workspaceModeForShortcut(e.key);
      if (def) { e.preventDefault(); this.setMode(def.id); }
    };
    document.addEventListener('keydown', this._keyListener);
  }
}

/** Singleton — import this wherever you need to read or change the workspace mode. */
export const workspaceController = new WorkspaceController();
