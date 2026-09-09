/**
 * SiteSurface — the SITE workspace mode's right-hand half.
 *
 * Layer Affected:  UI — Site surface (L7)
 * File:            apps/editor/src/ui/site/SiteSurface.ts
 * CSS:             `#ste-surface` (sheet at styles/panels/siteSurface.ts); the panel's
 *                  INTERNAL chrome deliberately reuses the `anl-` class vocabulary —
 *                  see "WHY THIS FILE DOES NOT MINT A `ste-` CLASS PREFIX" below.
 * ADR:             ADR-0343 §D.1 (a MODE, not a bucket — the argument that put the
 *                  Analysis dashboard in a half-canvas mode, applied again here)
 * Contracts:       C115 (the whole panel) · C06 §6.1 (one chrome band) · C19 §5.6/§5.7
 *                  (the panel is a HOST; the envelope card is a SINGLETON) · C59 §2.10
 *                  (§VIEW-REGION-HAS-ONE-OWNER) · C58 §1.20 (absence is not a gate)
 * Issue log:       §SITE-IS-A-MODE — L-13180
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * ⭐ THIS IS A RELOCATION, NOT A NEW SURFACE. THE PANEL MOVED; IT WAS NOT COPIED.
 * ═════════════════════════════════════════════════════════════════════════════
 * The Parcel Law panel was `AnalysisTabId`'s fifth member (`'parcel-law'`) and the
 * fifth pill of `#anl-surface`'s tab strip. The founder's 2026-09-07 transmission
 * makes it a TOP-LEVEL workspace mode, rendered left of Author, because it is where
 * the work starts: *what is this site · what may I build here* precede authoring a
 * wall. C115 §0.3 records the move; C115 §2.5 `C115-17` requires the surface the block
 * LEFT to carry a machine-readable stamp saying where it went, and `AnalysisSurface`
 * carries it (`data-parcel-rows-merged-into="site-workspace-mode"`).
 *
 * ⛔ THERE IS EXACTLY ONE LIVE `mountParcelLawTab` CALL IN THE SHELL, AND IT IS BELOW.
 * `AnalysisSurface` no longer imports the body at all. Two live parcel panels would be
 * precisely the duplication C115 was opened to remove, and the buildable-envelope card
 * is a SINGLETON (C19 §5.7) — two hosts racing to claim it is a defect that reaches the
 * user's land.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * WHY `canvas: 'half'`, AND WHY THAT IS FORCED RATHER THAN CHOSEN
 * ═════════════════════════════════════════════════════════════════════════════
 * C115 §1.4.1 `C115-113`…`C115-118` (the founder's rule 2) make EVERY figure on this
 * panel a hyperlink that PAINTS its geometry on whichever view is open, and §3.G
 * `C115-27` forbids a dead click. In a `'hidden'` canvas every one of the 27 control
 * rows becomes a dead click — ADR-0343 §D.1 reason 2 in its original words: *a surface
 * in a HIDDEN mode is a selector that has nothing to select in.* The registry row
 * (`workspaceModes.ts`) carries the same reasoning where the decision actually lives.
 *
 * The left half is therefore the SITE VIEW, and the founder's arrangement — 2D Site Map
 * left, this panel right — falls out of C59 §2.10 for free: the mode DECLARES a claim
 * and writes no box, and the region owner places the split pane BESIDE this panel.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * WHY THIS FILE DOES NOT MINT A `ste-` CLASS PREFIX (stated, not hidden)
 * ═════════════════════════════════════════════════════════════════════════════
 * The chrome elements below carry `anl-` classes. That is deliberate and it is the
 * lower-risk half of a real trade:
 *
 *   · C06 §6.1 says Inspect, Data and Analysis *"are one product"* and names
 *     `.aud-header` as the reference implementation. A fourth read-surface that
 *     re-declared 40 chrome rules under a new prefix would be a SECOND palette kept
 *     alive in code — the exact defect `tokens.ts` forbids one level down.
 *   · The body itself is `.anl-parcel-law`, set inside `parcelLawTab.ts`, and
 *     C115 §3.H PR-H-04/PR-H-05 make a rename of any probed class or `data-*` a
 *     SILENT break of ≈96 attributes and ≈156 testids. That file is not this lane's.
 *
 * ⚠ THE COST IS STATED AND LOGGED: the prefix now says `analysis` on a surface that is
 * not Analysis, and `PARCEL_LAW_TAB_TESTID` is still the string `analysis-parcel-law`.
 * That is a MISNOMER, not a bug — L-13181 holds the rename, which must move the testid
 * and every probe of it in one commit or not at all.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * THE TEARDOWN DISCIPLINE IS COPIED VERBATIM, AND ITS REASON IS A PROPERTY OF
 * THIS SURFACE TOO
 * ═════════════════════════════════════════════════════════════════════════════
 * `#ste-surface` is appended to `document.body` at module load and hidden by CLASS —
 * it is never detached. So the envelope-card seam's `document.contains(host)`
 * self-healing does NOT fire for it: a claimed card left inside a `display:none`
 * surface is stranded, present-and-invisible. `_disposeParcelLaw()` therefore runs on
 * HIDE and again BEFORE the host is cleared, and the body's own dispose hands the card
 * back ONLY if it still holds it (C19 §5.7 clause 2 — never evict another host).
 *
 * L7 file. No THREE (P2), no rAF (P3), no `(window as any)` (P4), no store writes (P6).
 * One OTel span per render pass (P8).
 */

import { withHandlerSpan } from '@pryzm/plugin-sdk';

import { onRuntimeEvent } from '../../engine/runtimeEventBridge';
// §PARCEL-LAW-TAB (L-12915) — THE BODY. Host-agnostic by construction:
// `mountParcelLawTab(host, deps = defaultParcelLawTabDeps())`. Nothing about it knew
// it was inside Analysis, which is why this relocation is a host swap and not a rewrite.
import { mountParcelLawTab, type ParcelLawTabHandle } from '../analysis/parcelLawTab';
// §DEMO141 (L-12301) — the founder's pitch-demo toggle. ⛔ REUSED, NEVER RE-MINTED.
// "Is the founder pitching?" has ONE authority (C84 EI-9); a second flag keyed on this
// surface would let the two disagree while both looked right.
import { presentationMode, setPresentationMode } from '../analysis/analysisLayout';
// §SHELL-SPLIT-DRAG (L-12983) — the same drag handle Analysis and Inspect use. Keyed on
// `surface.id`, so `#ste-surface` gets its OWN remembered width for free.
import {
  mountHalfCanvasResizer,
  type HalfCanvasResizerHandle,
} from '../layout/halfCanvasResizer';
import { publishShellCanvasRegion } from '../layout/shellCanvasBudget';

/** The mode id this surface answers to. Mirrors the `site` row in `workspaceModes.ts`. */
const SITE_MODE_ID = 'site';

/** `id` on the surface root. Read by `halfCanvasResizer`'s per-surface width memory. */
export const SITE_SURFACE_ID = 'ste-surface';

/**
 * §SITE-PANEL-IS-A-QUARTER (L-13285) — the Site panel opens at a QUARTER of the shell, not
 * the shared half. A reading surface beside the drawing should not take half the screen.
 * Overridden by any width the user has dragged this session; see `_mountResizer`.
 */
export const SITE_PANEL_DEFAULT_FRACTION = 0.25;

/** The class that makes it visible. Hidden by class; the element is never detached. */
export const SITE_SURFACE_VISIBLE_CLASS = 'ste-surface--visible';

/**
 * ⭐ PRESERVED VERBATIM FROM `ANALYSIS_TABS`' RETIRED `'parcel-law'` ROW.
 *
 * This string was the tab's `lede` and was rendered on the Analysis status strip. C115
 * `C115-01` — *"a block that disappears is a contract violation"* — so it moves with the
 * panel rather than being dropped as tab furniture. Not a word is changed.
 */
export const SITE_SURFACE_LEDE =
  'What may be built on this plot — the cadastral facts, the buildable envelope with its '
  + 'citations, designed vs permitted, and the design stage you are at — beside a 3D view '
  + 'you can switch.';

/**
 * ⚠ AMENDED WORDING, STATED RATHER THAN SLIPPED IN (C115 §3.E `C115-22`: a named
 * user-facing sentence *"MUST survive verbatim or be amended by a PR that states the new
 * wording"*).
 *
 * On Analysis this read *"…nothing on this **tab** is computed here…"*. There is no tab
 * any more; the surface has one chrome band and no navigation row. The word "tab" is the
 * ONLY change — the claim, and the instruction to read each card's own face instead of
 * this line, are untouched. That claim is C19 §5.6 clause 1 spoken at the status line:
 * the panel is a HOST, and re-deriving anything here is what would make two surfaces able
 * to disagree about a setback.
 */
const HOSTED_STATUS_SENTENCE =
  'nothing on this panel is computed here. Each card states its own source, confidence '
  + 'and citations on its face; read those, not this line.';

/** Model-commit → repaint. Same debounce Analysis uses, for the same reason. */
const REFRESH_DEBOUNCE_MS = 350;

export class SiteSurface {
  private _el!: HTMLElement;
  /** Where the parcel-law body mounts. A grid, so `.anl-parcel-law`'s
   *  `grid-column: 1 / -1` resolves exactly as it did inside `#anl-surface`. */
  private _host!: HTMLElement;
  private _status!: HTMLElement;
  private _presentBtn!: HTMLButtonElement;
  private _visible = false;
  private _debounce: ReturnType<typeof setTimeout> | null = null;
  /** The live body, or null when this surface is not on screen. Exactly one at a time. */
  private _parcelLaw: ParcelLawTabHandle | null = null;
  /** §SHELL-SPLIT-DRAG — the view/panel drag handle. Live only while visible. */
  private _resizer: HalfCanvasResizerHandle | null = null;

  constructor() {
    this._buildDOM();
    this._bindEvents();
    console.log('[SiteSurface] mounted — the SITE workspace mode, C115 §0.3');
  }

  get element(): HTMLElement {
    return this._el;
  }

  /** Whether the surface is on screen. Read by the spec, not by the UI. */
  get visible(): boolean {
    return this._visible;
  }

  // ── DOM ─────────────────────────────────────────────────────────────────────

  private _buildDOM(): void {
    this._el = document.createElement('div');
    this._el.id = SITE_SURFACE_ID;
    this._el.setAttribute('role', 'region');
    this._el.setAttribute('aria-label', 'Site');

    const panel = document.createElement('div');
    panel.className = 'anl-panel';

    // ── Header — ONE chrome band, no navigation row (C06 §6.1) ──────────────
    //
    // ⛔ NO TAB STRIP AND NO FACET BAR, and both omissions are decisions.
    // The tab strip had one tab and would render an empty row that teaches the
    // reader to stop looking at that band. The facet bar belongs to the Analysis
    // cross-filter (`selectionFacets`), whose chips can only be created by clicking
    // an Analysis WIDGET — there are none here, so the bar could never be non-empty.
    const header = document.createElement('div');
    header.className = 'anl-header';

    const titleWrap = document.createElement('div');
    titleWrap.className = 'anl-title-wrap';
    const title = document.createElement('span');
    title.className = 'anl-title';
    title.textContent = 'SITE';
    const sub = document.createElement('span');
    sub.className = 'anl-title-sub';
    sub.textContent = 'What may be built on this plot — every figure carries its own source';
    titleWrap.append(title, sub);

    const actions = document.createElement('div');
    actions.className = 'anl-header-actions';
    this._presentBtn = this._headerButton(
      'ste-present',
      'Present',
      'Presentation mode: hide diagnostic and provenance text for a pitch. The figures, '
        + 'their confidence badges and every refusal stay.',
    );
    actions.append(this._presentBtn);

    header.append(titleWrap, actions);
    panel.appendChild(header);

    // ── Status strip ────────────────────────────────────────────────────────
    this._status = document.createElement('div');
    this._status.className = 'anl-status';
    panel.appendChild(this._status);

    // ── Body host ───────────────────────────────────────────────────────────
    const viewport = document.createElement('div');
    viewport.className = 'anl-grid-viewport';
    this._host = document.createElement('div');
    this._host.className = 'anl-grid';
    viewport.appendChild(this._host);
    panel.appendChild(viewport);

    this._el.appendChild(panel);
    document.body.appendChild(this._el);

    this._paintPresentButton();
    this._presentBtn.addEventListener('click', () => {
      setPresentationMode(!presentationMode());
      this._paintPresentButton();
      this.refresh();
    });
  }

  private _headerButton(id: string, label: string, title: string): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.id = id;
    b.className = 'anl-header-btn';
    b.textContent = label;
    b.title = title;
    b.setAttribute('aria-label', title);
    return b;
  }

  /**
   * §DEMO141 (L-12301) — reflect the stored flag on the toggle, read FRESH each time.
   * A project switch must not leave yesterday's project's choice painted on the button.
   */
  private _paintPresentButton(): void {
    const on = presentationMode();
    this._presentBtn.setAttribute('aria-pressed', String(on));
    this._presentBtn.classList.toggle('anl-header-btn--on', on);
    const t = on
      ? 'Presentation mode is ON — diagnostic and provenance text is hidden. Click to bring it back.'
      : 'Presentation mode: hide diagnostic and provenance text for a pitch. The figures, '
        + 'their confidence badges and every refusal stay.';
    this._presentBtn.title = t;
    this._presentBtn.setAttribute('aria-label', t);
  }

  // ── Events ──────────────────────────────────────────────────────────────────

  private _bindEvents(): void {
    // This class is a module-load singleton constructed BEFORE composeRuntime() runs, so a
    // raw `window.runtime?.events?.on()` here would silently no-op (§INSPECT-DATA-TAB-WIRE,
    // and MEMORY §null-at-mount-runtime-event-race). Route through the deferred bridge so
    // the subscription QUEUES and applies at `flushRuntimeEventListeners()`.
    //
    // ⚠ THAT FLUSH MUST RUN BEFORE `workspaceController.restoreFromStorage()` in
    // `engineLauncher.ts`, or a user whose saved mode is `site` lands with a 50 % canvas and
    // no panel beside it — the whole feature, silently absent, with every unit test green.
    // `siteSurfaceMount.spec.ts` pins that ordering.
    onRuntimeEvent('pryzm-workspace-mode', (payload: unknown) => {
      const mode = (payload as { mode?: string })?.mode;
      if (mode === SITE_MODE_ID) this._show();
      else this._hide();
    });

    // Model mutations REPAINT the body — they never remount it (see `refresh()`).
    // ⛔ Debounced AND gated on visibility: an invisible panel that re-reads the site model
    // on every wall move is background work nobody asked for.
    //
    // ⛔ NOT routed through `invalidateAnalysisReadModel()`. That cache belongs to the
    // Analysis census, which this surface computes none of; touching it from here would make
    // this file a second writer of another surface's state (C84 EI-9).
    const invalidate = (): void => {
      if (!this._visible) return;
      if (this._debounce) clearTimeout(this._debounce);
      this._debounce = setTimeout(() => { this.refresh(); }, REFRESH_DEBOUNCE_MS);
    };
    onRuntimeEvent('model-updated', invalidate);
    onRuntimeEvent('pryzm-delta-updated', invalidate);
    window.addEventListener('wall:walls-changed', invalidate);
    window.addEventListener('bim-room-added', invalidate);
    window.addEventListener('bim-room-updated', invalidate);
    window.addEventListener('bim-room-removed', invalidate);
    window.addEventListener('level-changed', invalidate);
  }

  // ── Show / hide ─────────────────────────────────────────────────────────────

  private _show(): void {
    if (this._visible) { this.refresh(); return; }
    this._visible = true;
    this._el.classList.add(SITE_SURFACE_VISIBLE_CLASS);
    this._paintPresentButton(); // §DEMO141 — a different project may hold a different choice
    this._mountResizer();
    this.refresh();
  }

  private _hide(): void {
    if (!this._visible) return;
    this._visible = false;
    this._el.classList.remove(SITE_SURFACE_VISIBLE_CLASS);
    if (this._debounce) { clearTimeout(this._debounce); this._debounce = null; }
    // ⛔ TEAR THE BODY DOWN ON HIDE. See the file header: this element is hidden by class and
    // never detached, so a claimed envelope card left inside it is stranded in an invisible
    // host — the seam's `document.contains()` self-healing cannot see the difference.
    this._disposeParcelLaw();
    // §SHELL-SPLIT-DRAG (L-12983) — drop the handle and the widths it wrote. `dispose()`
    // clears ONLY the strings this handle itself last wrote, so a split pane that reopened
    // keeps its own fraction and the next mode keeps its own width.
    this._disposeResizer();
  }

  /** §SHELL-SPLIT-DRAG — mount the drag handle. Idempotent; never throws into `_show`. */
  private _mountResizer(): void {
    if (this._resizer) { this._resizer.reapply(); return; }
    try {
      this._resizer = mountHalfCanvasResizer({
        surface: this._el,
        onCommit: publishShellCanvasRegion,
        // §SITE-PANEL-IS-A-QUARTER (founder 2026-09-09 · L-13285)
        //
        // *"Site panel shall occupy 1/4 of the width of the screen when the parcel is
        //   selected"*
        //
        // The shared default is `SHELL_SPLIT_DEFAULT_RIGHT` = 0.5, which is right for
        // Analysis and Inspect — those surfaces ARE the work. The Site panel is a READING
        // surface beside the drawing: the parcel, the map and the 3D are the work, and a
        // half-screen reading panel takes the room they need.
        //
        // ⚠ THIS IS AN INITIAL FRACTION, NOT A LOCK. `mountHalfCanvasResizer` prefers the
        // fraction this session remembers for `#ste-surface`, so a width the user has
        // DRAGGED still wins — which is the behaviour they expect and the reason this is
        // passed as `initialFraction` rather than written to the shared constant. Changing
        // `SHELL_SPLIT_DEFAULT_RIGHT` would have moved Analysis and Inspect too.
        //
        // 0.25 sits inside the existing clamp (`SHELL_SPLIT_MIN_RIGHT` 0.20 … MAX 0.65), so
        // no bound moves and the drag range is unchanged.
        initialFraction: SITE_PANEL_DEFAULT_FRACTION,
      });
    } catch (e) {
      // A shell that cannot be resized is still a shell. C06 §14.2 — degrade, never unmount.
      console.warn('[SiteSurface] §SHELL-SPLIT-DRAG resizer mount failed (non-fatal):', e);
      this._resizer = null;
    }
  }

  private _disposeResizer(): void {
    if (!this._resizer) return;
    const r = this._resizer;
    this._resizer = null;
    try { r.dispose(); } catch { /* §SWALLOW-TEARDOWN — the handle is being discarded */ }
  }

  /** Drop the host body, if any. Idempotent. */
  private _disposeParcelLaw(): void {
    if (!this._parcelLaw) return;
    const h = this._parcelLaw;
    this._parcelLaw = null;
    try { h.dispose(); } catch { /* §SWALLOW-TEARDOWN — the body is being discarded */ }
  }

  // ── Rendering ───────────────────────────────────────────────────────────────

  /**
   * Mount the body, or repaint the one already mounted.
   *
   * ⭐ ALREADY HOSTED → REPAINT, NEVER REMOUNT. Every model commit lands here through the
   * 350 ms debounce. A remount would hand the singleton envelope card back to the viewport
   * and re-claim it a microtask later, and re-mount the parcel section with a fresh
   * subscription — a visible bounce of a legally-loaded card on every wall move, for a panel
   * whose figures no BIM commit changes. Keyed on `parentElement === this._host`, not on the
   * handle alone: a handle whose body has left the host is a stale handle, and stale means
   * rebuild.
   */
  refresh(): void {
    if (!this._visible) return;

    if (this._parcelLaw && this._parcelLaw.element.parentElement === this._host) {
      const t0 = Date.now();
      this._parcelLaw.repaint();
      this._setHostStatus(Date.now() - t0, 'repainted');
      return;
    }

    // BEFORE the host is cleared, so the body's conditional hand-back of the singleton card
    // sees it while still attached.
    this._disposeParcelLaw();
    this._host.replaceChildren();

    const t0 = Date.now();
    // P8 — one span per render pass. The attribute set is bounded by constants, never by a
    // model value.
    withHandlerSpan(
      'pryzm.site.surface.render',
      { 'pryzm.surface': 'site', 'pryzm.site.host': 'parcel-law' },
      () => {
        this._parcelLaw = mountParcelLawTab(this._host);
      },
    );
    this._setHostStatus(Date.now() - t0, 'mounted');
  }

  /** Whether the singleton envelope card is inside this surface. Read by the spec. */
  holdsEnvelopeCard(): boolean {
    return this._parcelLaw?.holdsEnvelopeCard() ?? false;
  }

  // ── Status ──────────────────────────────────────────────────────────────────

  /**
   * The HOSTED status line, carried across from `AnalysisSurface._setHostStatus`.
   *
   * ⭐ IT IS NOT DECORATION AND IT IS NOT OPTIONAL. Analysis's other status sentence says
   * *"every declared source read"* / *"totals are LOWER BOUNDS"* — both are claims about a
   * census. This surface runs none: the cadastral card carries its own C57 §1.9 attribution,
   * the envelope card its own confidence badge and citations. Saying so, rather than
   * borrowing a census sentence, is C19 §5.6 clause 1 at the status line, and deleting it in
   * the move would have been the `C115-01` violation the whole relocation exists to avoid.
   *
   * §DEMO141 — under Presentation the diagnostic half is withheld and the LEDE remains, so a
   * pitch keeps the sentence that says what the reader is looking at.
   */
  private _setHostStatus(ms: number, how: 'mounted' | 'repainted'): void {
    this._status.replaceChildren();
    const present = presentationMode();
    const lede = document.createElement('span');
    lede.className = 'anl-status-lede';
    lede.textContent = present ? SITE_SURFACE_LEDE : `${SITE_SURFACE_LEDE}  ·  `;
    this._status.appendChild(lede);
    if (present) return;
    const text = document.createElement('span');
    text.textContent = `${how === 'mounted' ? 'Mounted' : 'Repainted'} in ${ms} ms — ${HOSTED_STATUS_SENTENCE}`;
    this._status.appendChild(text);
  }
}

// ── Singleton ─────────────────────────────────────────────────────────────────
//
// Constructed at module evaluation, like `AnalysisSurface` and `AuditStack`, and
// self-appended to document.body. Side-effect imported from `engineLauncher.ts` — without
// that import nothing ever constructs it and the mode is a pill that opens an empty half.
export const siteSurface = new SiteSurface();
