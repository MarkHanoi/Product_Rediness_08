/**
 * parcelLawTab — the PARCEL LAW tab body of the Analysis surface.
 *
 * Layer Affected:  UI — Analysis surface (L7)
 * File:            apps/editor/src/ui/analysis/parcelLawTab.ts
 * Strategy:        STR-RESIDENTIAL-DESIGN-ORCHESTRATOR §21 · §24.1 items 1–2
 * Plan:            RESI-ORCHESTRATOR-PLAN §8.3 (Stage J)
 * Contracts:       C19 §5.6 (the panel is a HOST; producers are the authorities) ·
 *                  C19 §5.7 (singleton vs mount-per-host) · C06 §13.3 · C08 §3.1
 * Issue log:       L-12915
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ THIS TAB IS NOT A WIDGET GRID. IT IS A HOST OF THREE PRODUCERS.
 * ─────────────────────────────────────────────────────────────────────────────
 * Founder 2026-09-05: *"WE NEED TO HAVE A PARCEL LAW / OR SIMILAR NAME TAB WITH:
 * ALL THE Parcel data. + to be intention. On the right (as analysis works) and
 * the 3d view on the left (with option to switch to 3d site or 3d globe or plan
 * view)."*
 *
 * Every figure on this tab is produced elsewhere and only PLACED here:
 *
 *   1. the cadastral half — `mountParcelSection` over `parcelCard.ts`, the ONE
 *      card producer (C57 §1.9 attribution and the §2.4 two-area rule inherited
 *      by construction);
 *   2. the envelope / law / massing / intent half — the SINGLETON buildable-
 *      envelope card, claimed through `window.pryzmMountEnvelopeCard(host)`
 *      (§GIS-ENVELOPE-REHOST, L-1362); every fold the founder listed is a fold
 *      of that one element;
 *   3. the design-stage strip — markup inside that card, wired by
 *      `wireDesignStageStrip` (Stage A);
 *
 * plus the view switcher (`viewSegmentSwitcher.ts`), itself a host of DECLARED
 * `GIS_ACTIONS`. ⭐ CORRECTED 2026-09-06 (§VIEW-SWITCHER-ON-THE-VIEW, L-12985):
 * that switcher is NO LONGER INSIDE THIS BODY. The founder boxed the four stacked
 * full-width buttons in blue and said *"we DON'T need the plan view / 3D view etc.
 * on the panel — that … SHOULD BE CENTRED ON THE VIEW"*, so this tab now mounts
 * `mountViewSwitcherOnView`, a body-level bar centred over the canvas region, and
 * disposes it with the tab. The control, its six options and its dispatches are
 * unchanged — only where it hangs.
 *
 * ⛔ NOTHING IS RE-DERIVED HERE — C19 §5.6 clause 1 is binding and it carries a
 * LEGAL consequence: these are setbacks, heights and FAR cited to ordinance
 * articles, and two surfaces that can disagree about a setback is a defect that
 * reaches the user's land.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ THE WHOLE PARCEL ANSWER IS ALREADY ONE FUNCTION — `buildParcelRailPanel`
 * ─────────────────────────────────────────────────────────────────────────────
 * §PARCEL-ALL-INFO (L-6905) made the left-rail PARCEL panel host BOTH halves,
 * with the singleton discipline C19 §5.7 demands already in it: it removes only
 * its own chrome from the envelope slot (never `replaceChildren`), it holds its
 * own `mountParcelSection` handle, it re-claims on every site-store notification
 * while its slot is connected, it prints one of five NAMED sentences when the
 * card is absent, and it offers the recompute escape hatch on the arms that
 * honestly can. Writing a second copy of that host logic here would be the
 * third copy in the app (GIS section · rail panel · this tab) of chrome whose
 * one job is to not disagree. So this tab MOUNTS THE RAIL PANEL'S BUILDER into
 * its own body. The rail keeps its route (C19 §5.6 clause 4); this adds one.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠ THE SINGLETON, HOSTED BY A SURFACE THAT NEVER LEAVES THE DOCUMENT
 * ─────────────────────────────────────────────────────────────────────────────
 * `#anl-surface` is appended to `document.body` at module load and is HIDDEN by
 * class, never detached. The seam's self-healing (`getForma3dHostEl` prefers the
 * claimed host only while `document.contains(host)`) therefore does NOT fire
 * for this host on its own: a slot inside a `display:none` surface is still
 * "in the document". A card left in it after the reader switches tab would be
 * stranded — present, claimed, invisible — which is the exact failure the
 * `document.contains` rule was written to prevent for the rail.
 *
 * So this tab does two things the rail panel does not need to:
 *   · it mounts its body ONLY while the Parcel Law tab is the active tab of a
 *     VISIBLE surface, and tears the body down (out of the DOM) on any tab
 *     change or hide — so every claim is made by a host the reader can see;
 *   · it renders the §PARCEL-LAW-MODEL fact section from the SHARED model (STR §25.11
 *     clauses 1–3), so the migrated parcel/ordinance/massing/per-storey data is on THIS tab
 *     even when the singleton card is held by another host — the two-hosts case named below.
 *     ⛔ It is a second RENDERING of one model, never a second model and never a copied
 *     renderer (C19 §5.7 clause 1). `parcelLawFacts.ts` carries the reasoning;
 *   · on teardown it hands the card back to the viewport ONLY IF THE CARD IS
 *     STILL INSIDE THIS BODY. If another host (the rail PARCEL panel, the GIS
 *     section) has claimed it since, this tab does not touch it — which is the
 *     whole rationale of C19 §5.7 clause 2 (*"would evict the card from
 *     whichever OTHER host had claimed it since"*). The clause's letter says
 *     "never release on dispose"; its reason is "never evict another host". A
 *     conditional hand-back honours the reason and avoids the stranding the
 *     letter would cause on this one always-mounted surface. Stated here so the
 *     next reader sees a decision, not a lapse — and the spec pins BOTH arms.
 *
 * ⚠ TWO HOSTS OPEN AT ONCE is now possible — the rail PARCEL panel beside this
 * tab, which is precisely the founder's screenshot. The singleton has one
 * parent; the last claimer holds it, and the other host's slot shows neither
 * the card nor a sentence until its own next store notification re-renders it.
 * That is a pre-existing property of the re-homed-singleton design that C19
 * §5.7 clause 1 flagged (*"if the rail ever gains a two-panel-open mode, this
 * clause is what breaks"*). It is NOT fixed here; it is named, and the fix the
 * contract prescribes is a host arbiter or a second card instance, never a
 * copied renderer.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Every dependency is INJECTABLE and defaults to the production one, so a spec
 * can drive this body with fakes for the producers without stubbing modules —
 * and so the fakes are fakes of the SEAM (a builder, a claim function), not of
 * a header. P4 — no `(window as any)`: the capability host is typed. P6 — this
 * file writes no store. P8 — one span per exported function.
 */

import { trace } from '@opentelemetry/api';
import type { PryzmRuntime } from '@pryzm/runtime-composer/types';
import type { GisCapabilityHost } from '../gis/gisActionRegistry';
import {
  buildParcelRailPanel,
  type ParcelRailPanelHandle,
} from '../site/parcel/parcelRailPanel';
import {
  mountViewSegmentSwitcher,
  type ViewSegmentSwitcherHandle,
} from '../site/viewSegmentSwitcher';
// §VIEW-SWITCHER-ON-THE-VIEW (L-12985, founder 2026-09-06: *"we DON'T need the plan view /
// 3D view etc. on the panel — that ... SHOULD BE CENTRED ON THE VIEW"*, with the four stacked
// buttons boxed in blue on his screenshot). The switcher itself is UNCHANGED and still the
// one host of `viewPanelOptions()`; only its PLACEMENT moved, and the split-layout choice —
// which is not a view — was added beside it. See that module's header.
import {
  mountViewSwitcherOnView,
  type ViewSwitcherOnViewHandle,
  type ViewSwitcherOnViewHost,
  type ViewSwitcherOnViewOptions,
} from '../site/viewSwitcherOnView';
import { wireDesignStageStrip } from '../site/designStageStripControl';
// §PARCEL-LAW-MODEL (STR §25.11) — the ONE parcel/ordinance/massing model, and this tab's
// rendering of it. NOT a second computation and NOT a copied renderer: `GISAreaLayout`'s card
// renders the SAME model, which is what makes "the rail panel and the tab agree datum for datum"
// true by construction rather than by review. See `parcelLawFacts.ts`'s header for why the tab
// needs its own rendering at all — the singleton card can only ever be in ONE host.
import { resolveParcelLawModel } from '../site/parcel/resolveParcelLawModel';
import type { ParcelLawModel } from '../site/parcel/parcelLawModel';
import { buildParcelLawFacts } from './parcelLawFacts';
// §PL-LIVE-QUANTITIES (STR §25.7) — the live room/level/total figures and the adjustable cost
// per m². It owns its own LIVE subscription to the space-envelope store's dirty channel — the
// same channel the 3D scene renders from — so the panel and the scene cannot show different
// vintages of one envelope. See that module's header for the measured liveness defect it fixes.
import {
  mountParcelLawQuantities,
  type ParcelLawQuantitiesHandle,
} from './parcelLawQuantities';
// §PL-ENVELOPE-AUTHORING (STR §25.2 / §25.6) — CREATE the envelope, extrude it over a chosen
// number of floor levels, and check it LIVE against the law. It is a consumer of C114's ONE
// create verb and of `brutAreaAllocation.ts`'s arithmetic; it computes nothing itself.
import {
  mountParcelLawEnvelopeAuthoring,
  type ParcelLawEnvelopeAuthoringHandle,
} from './parcelLawEnvelopeAuthoring';
// §PL-CREATE-HOUSE (STR §25.8) — the explicit step out of the envelope stage into BIM. It is a
// JOIN over the PROVEN house pipeline (`generateHouseFromBoundary` → `HouseLayoutExecutor`, one
// `runBatch` so undo removes the whole house in one step), plus C80's "may this pass replace
// this?" asked with numbers before every run. No generator lives in this tab.
import {
  mountParcelLawCreateHouse,
  defaultParcelLawCreateHouseDeps,
  type ParcelLawCreateHouseHandle,
} from './parcelLawCreateHouse';

const _tracer = trace.getTracer('pryzm.analysis.parcelLawTab');

/** `data-testid` on the tab body root. */
export const PARCEL_LAW_TAB_TESTID = 'analysis-parcel-law';
/**
 * ⛔ RETIRED 2026-09-06 (§VIEW-SWITCHER-ON-THE-VIEW, L-12985) — NOTHING IN THIS BODY
 * CARRIES THIS ID ANY MORE, and that is the founder's instruction, not an accident:
 * *"we DON'T need the plan view / 3D view etc. on the panel — that … SHOULD BE CENTRED ON
 * THE VIEW"*, with the four stacked full-width buttons boxed in blue on his screenshot.
 *
 * The constant is KEPT exported rather than deleted so an in-flight import in a sibling
 * lane's working tree still compiles, and so the next reader finds the removal STATED
 * instead of finding a testid that silently matches nothing. The switcher now lives on
 * `mountViewSwitcherOnView`'s bar (`VIEW_SWITCHER_ON_VIEW_TESTID`), which is body-level
 * shell chrome over the canvas region — not a descendant of this tab body.
 */
export const PARCEL_LAW_SWITCHER_SLOT_TESTID = 'analysis-parcel-law-switcher';
/** `data-testid` on the slot the parcel panel (both halves) is mounted into. */
export const PARCEL_LAW_PANEL_SLOT_TESTID = 'analysis-parcel-law-panel';
/** `data-testid` on the one-line note that says what this tab is and is not. */
export const PARCEL_LAW_NOTE_TESTID = 'analysis-parcel-law-note';
/** `data-testid` on the slot the shared-model fact section is rendered into. */
export const PARCEL_LAW_FACTS_SLOT_TESTID = 'analysis-parcel-law-facts-slot';
/** `data-testid` on the slot the envelope-authoring section is mounted into. */
export const PARCEL_LAW_AUTHORING_HOST_TESTID = 'analysis-parcel-law-authoring-slot';
/** `data-testid` on the slot the live-quantities + indicative-cost section is mounted into. */
export const PARCEL_LAW_QUANTITIES_HOST_TESTID = 'analysis-parcel-law-quantities-slot';
/** `data-testid` on the slot the "Create house" section is mounted into. */
export const PARCEL_LAW_CREATE_HOUSE_HOST_TESTID = 'analysis-parcel-law-create-house-slot';
/** The `data-testid` the singleton card carries (GISAreaLayout `ensureEnvelopePanel`). */
export const ENVELOPE_CARD_TESTID = 'buildable-envelope-card';
/** Carries how many stage pills were wired on the last pass — read by the spec. */
export const PARCEL_LAW_STRIP_WIRED_ATTR = 'data-parcel-law-strip-wired';

/**
 * The lede sentence. It names the ROUTE (the switcher and the producers) rather than the
 * data, because the tab's empty state is the common one for existing projects.
 */
export const PARCEL_LAW_NOTE =
  'Hosted, not computed: the cadastral card, the buildable envelope, the designed-vs-permitted '
  + 'comparison, massing options and the intended-area channel are the same elements the PARCEL '
  + 'rail panel shows, placed here beside the view. Switch the view — or split it — from the bar '
  + 'centred on the view itself; drag the edge between them to set how much room each gets. '
  + 'Nothing on this tab is re-derived.';

/** The minimal store surface this tab subscribes to for re-wiring the strip. Structural. */
interface SiteStoreLike {
  subscribe?(listener: () => void): () => void;
}

/** The capability host this tab reads: the GIS entry points PLUS the envelope-card claim. */
export type ParcelLawCapabilityHost = GisCapabilityHost & {
  pryzmMountEnvelopeCard?: (host: HTMLElement | null) => boolean;
};

export interface ParcelLawTabDeps {
  /** Production: `window`. */
  readonly capabilityHost: ParcelLawCapabilityHost;
  /** Production: `window.runtime` — resolved at MOUNT time, never at module load (§L-545). */
  readonly runtime: PryzmRuntime | null | undefined;
  /** Production: `buildParcelRailPanel` — the ONE host of both parcel halves. */
  readonly buildParcelPanel: (runtime: PryzmRuntime | null | undefined) => ParcelRailPanelHandle;
  /**
   * Production: `mountViewSegmentSwitcher`.
   *
   * ⚠ STILL A DEP, AND STILL CALLED WITH THE SAME HOST — but its element is no longer
   * appended into this body. It is handed to `mountOnViewSwitcher` below, which places it
   * centred over the canvas (§VIEW-SWITCHER-ON-THE-VIEW, L-12985). Kept in this shape so
   * every spec literal that already fakes this seam keeps compiling and keeps meaning what
   * it meant: "the switcher is built once, with THE capability host".
   */
  readonly mountSwitcher: (host: GisCapabilityHost) => ViewSegmentSwitcherHandle;
  /**
   * Production: `mountViewSwitcherOnView` — the centred-on-the-view host of the switcher
   * plus the split-layout choice.
   *
   * ⚠ OPTIONAL, for the same reason the three below are: a spec written before this seam
   * existed constructs `ParcelLawTabDeps` as a complete literal. Omitting it yields the
   * production host, which mounts to `document.body` and refuses the split control with a
   * printed reason when the entry points are not registered — never a dead click.
   */
  readonly mountOnViewSwitcher?: (opts: ViewSwitcherOnViewOptions) => ViewSwitcherOnViewHandle;
  /** Production: `wireDesignStageStrip`. Returns the number of pills wired. */
  readonly wireStrip: (root: ParentNode) => number;
  /**
   * Production: `resolveParcelLawModel` — the ONE reader of the ONE model (§25.11 clause 1).
   *
   * ⚠ OPTIONAL, unlike the four above, and deliberately so: a spec written before this seam
   * existed constructs `ParcelLawTabDeps` as a complete literal, and making these required
   * would break every such literal in a file another lane owns. Omitting them yields the
   * production pair, which on a test runtime resolves to the ABSENT model — a state the
   * renderer handles with a sentence, so an old spec keeps passing and keeps meaning what it
   * meant.
   */
  readonly readParcelLawModel?: (runtime: PryzmRuntime | null | undefined) => ParcelLawModel;
  /** Production: `buildParcelLawFacts` — a RENDERING of that model, never a second derivation. */
  readonly renderParcelLawFacts?: (model: ParcelLawModel) => HTMLElement;
  /**
   * Production: `mountParcelLawQuantities` — STR §25.7's live figures and adjustable rate.
   *
   * ⚠ OPTIONAL for the same reason as the pair above: a spec written before this seam existed
   * constructs `ParcelLawTabDeps` as a complete literal. Omitting it yields the production mount,
   * which on a runtime with no `spaceEnvelope` store renders the channel's own honest sentence
   * rather than throwing — so an old spec keeps passing and keeps meaning what it meant.
   */
  readonly mountQuantities?: (host: HTMLElement) => ParcelLawQuantitiesHandle;
  /**
   * Production: `mountParcelLawEnvelopeAuthoring` — STR §25.2/§25.6's create-and-check section.
   *
   * ⚠ OPTIONAL for the same reason as its siblings: a spec written before this seam existed
   * constructs `ParcelLawTabDeps` as a complete literal, and making it required would break every
   * such literal in a file another lane owns. Omitting it yields the production mount, which on a
   * runtime with no space-envelope store renders its own honest sentences rather than throwing.
   */
  readonly mountAuthoring?: (host: HTMLElement) => ParcelLawEnvelopeAuthoringHandle;
  /**
   * Production: `mountParcelLawCreateHouse` with its production deps — STR §25.8.
   *
   * ⚠ OPTIONAL for the same reason as the three above: older spec literals are complete and
   * must keep compiling. Omitting it yields the production control, which on a runtime with no
   * space-envelope store renders a DISABLED button and the reason — never a dead click.
   */
  readonly mountCreateHouse?: (host: HTMLElement) => ParcelLawCreateHouseHandle;
}

/** The production wiring. Resolved when CALLED, so a runtime composed after boot is seen. */
export function defaultParcelLawTabDeps(): ParcelLawTabDeps {
  const w = (typeof window !== 'undefined' ? window : {}) as unknown as
    ParcelLawCapabilityHost & { runtime?: PryzmRuntime | null };
  return {
    capabilityHost: w,
    runtime: w.runtime ?? null,
    buildParcelPanel: buildParcelRailPanel,
    mountSwitcher: mountViewSegmentSwitcher,
    mountOnViewSwitcher: mountViewSwitcherOnView,
    wireStrip: wireDesignStageStrip,
    readParcelLawModel: resolveParcelLawModel,
    renderParcelLawFacts: buildParcelLawFacts,
    mountQuantities: (h) => mountParcelLawQuantities(h),
    mountAuthoring: (h) => mountParcelLawEnvelopeAuthoring(h),
    mountCreateHouse: (h) => mountParcelLawCreateHouse(h, defaultParcelLawCreateHouseDeps()),
  };
}

export interface ParcelLawTabHandle {
  readonly element: HTMLElement;
  /** Re-derive the switcher's highlight and re-wire the strip. Cheap. */
  repaint(): void;
  /** Whether the singleton card is inside THIS body right now. Read by the spec. */
  holdsEnvelopeCard(): boolean;
  dispose(): void;
}

function resolveSiteStore(runtime: PryzmRuntime | null | undefined): SiteStoreLike | null {
  const s = (runtime as unknown as { siteModelStore?: SiteStoreLike } | null | undefined)?.siteModelStore;
  return s && typeof s.subscribe === 'function' ? s : null;
}

/**
 * Mount the Parcel Law tab body into `host`. Never throws into the surface: a tab that cannot
 * build is a tab the founder cannot open, and reachability is the entire point of L-12915.
 */
export function mountParcelLawTab(
  host: HTMLElement,
  deps: ParcelLawTabDeps = defaultParcelLawTabDeps(),
): ParcelLawTabHandle {
  const span = _tracer.startSpan('pryzm.analysis.mountParcelLawTab');
  const root = document.createElement('div');
  root.className = 'anl-parcel-law';
  root.setAttribute('data-testid', PARCEL_LAW_TAB_TESTID);

  /** §VIEW-SWITCHER-ON-THE-VIEW (L-12985) — the centred bar OVER the canvas, not in here. */
  let onView: ViewSwitcherOnViewHandle | null = null;
  let panel: ParcelRailPanelHandle | null = null;
  let authoring: ParcelLawEnvelopeAuthoringHandle | null = null;
  let quantities: ParcelLawQuantitiesHandle | null = null;
  let createHouse: ParcelLawCreateHouseHandle | null = null;
  let unsub: (() => void) | null = null;
  let disposed = false;

  const holdsEnvelopeCard = (): boolean =>
    root.querySelector(`[data-testid="${ENVELOPE_CARD_TESTID}"]`) !== null;

  // §PARCEL-LAW-MODEL — its OWN slot, so re-rendering the facts never touches the panel slot
  // the singleton card lives in. `replaceChildren` is safe HERE and only here: this slot holds
  // nothing shared (the rule the rail panel states for its envelope slot is about the CARD).
  const factsSlot = document.createElement('div');
  factsSlot.className = 'anl-parcel-law-facts';
  factsSlot.setAttribute('data-testid', PARCEL_LAW_FACTS_SLOT_TESTID);

  /** Re-read the model and re-render the fact section. Cheap, and never throws into the tab. */
  const renderFacts = (): void => {
    if (disposed) return;
    try {
      const readModel = deps.readParcelLawModel ?? resolveParcelLawModel;
      const renderModel = deps.renderParcelLawFacts ?? buildParcelLawFacts;
      factsSlot.replaceChildren(renderModel(readModel(deps.runtime)));
    } catch (e) {
      console.warn('[analysis][parcel-law] fact section render failed (non-fatal):', e);
    }
  };

  /** Wire the strip's pills under this body. Idempotent — `wireDesignStageStrip` assigns `onclick`. */
  const wireStrip = (): void => {
    if (disposed) return;
    try {
      const n = deps.wireStrip(root);
      root.setAttribute(PARCEL_LAW_STRIP_WIRED_ATTR, String(n));
    } catch (e) {
      console.warn('[analysis][parcel-law] strip wiring failed (non-fatal):', e);
    }
  };

  try {
    // ── 1. The view switcher — ON THE VIEW, CENTRED. Not in this panel. ───────────────
    //
    // Founder 2026-09-06, boxing the four stacked full-width buttons in blue:
    // *"we DON'T need the plan view / 3D view etc. on the panel — that … SHOULD BE CENTRED
    // ON THE VIEW — and the user can decide to have only the 2D Site Plan view, 2D
    // Satellite, 3D Site, 3D PRYZM, or 3D Globe — OR SPLIT."*
    //
    // ⭐ SAME CONTROL, DIFFERENT PLACE. `deps.mountSwitcher` is still called ONCE with the
    // SAME capability host; its element is handed to the on-view bar instead of being
    // appended here. Nothing about the six options changed and nothing was re-implemented —
    // they are `viewPanelOptions()`'s rows, owned by lane VIEW-PANEL-PER-PANE.
    //
    // ⚠ THE BAR IS BODY-LEVEL, NOT A DESCENDANT OF THIS BODY, and it has to be: the canvas
    // it centres over is `#container`, which is not inside `#anl-surface`. The handle is
    // disposed with this tab, so it can never outlive the surface that put it up.
    onView = (deps.mountOnViewSwitcher ?? mountViewSwitcherOnView)({
      host: deps.capabilityHost as ViewSwitcherOnViewHost,
      mountSwitcher: deps.mountSwitcher,
    });

    // ── 2. The note: what this tab is (a host) and is not (a calculator). ──────────────
    const note = document.createElement('p');
    note.className = 'anl-parcel-law-note';
    note.setAttribute('data-testid', PARCEL_LAW_NOTE_TESTID);
    note.textContent = PARCEL_LAW_NOTE; // textContent — no HTML sink in this file (C08 §3.1)
    root.appendChild(note);

    // ── 3. Both parcel halves, through the ONE existing host of both. ──────────────────
    // `buildParcelRailPanel` mounts `mountParcelSection` into its own slot (its own handle —
    // C19 §5.7 clause 4) and claims the envelope card into its own envelope slot on a
    // microtask, then re-claims on every site-store notification while that slot is
    // connected. Claiming only while connected is what makes "claim only while this tab is
    // active" true: the surface removes this body from the DOM on tab change and on hide.
    const panelSlot = document.createElement('div');
    panelSlot.className = 'anl-parcel-law-panel';
    panelSlot.setAttribute('data-testid', PARCEL_LAW_PANEL_SLOT_TESTID);
    root.appendChild(panelSlot);
    panel = deps.buildParcelPanel(deps.runtime);
    panelSlot.appendChild(panel.element);

    // ── 4. §PARCEL-LAW-MODEL (STR §25.11 clauses 2–3) — THE MIGRATED DATA, ON THE TAB. ────
    //
    // The card above is a SINGLETON with ONE parent. With the rail PARCEL panel open beside
    // this tab — the founder's own screenshot — whichever host claimed it last holds it, and
    // the other shows nothing. This section renders the SAME model the card renders, so the
    // figures are on this tab whether or not the card is, and they cannot disagree with it.
    //
    // ⛔ It is not a copied renderer (C19 §5.7 clause 1 forbids that); it is a second rendering
    // of ONE model. Every number is derived once, in `buildParcelLawModel`.
    root.appendChild(factsSlot);

    // ── 4a-bis. §PL-ENVELOPE-AUTHORING (STR §25.2 / §25.6) — CREATE THE ENVELOPE, CHECK IT LIVE. ──
    //
    // ⭐ PLACED BETWEEN THE FACTS AND THE QUANTITIES, and that ordering IS the founder's stage
    // ladder: read the parcel and its law, then AUTHOR what you intend to build against it, then
    // read what that costs, then decide to build it. It hosts the ONE create verb C114 §6a
    // declares and the BRUT/NET arithmetic §25.2 specifies; every number on it is produced by a
    // module this tab already depends on.
    const authoringSlot = document.createElement('div');
    authoringSlot.className = 'anl-parcel-law-authoring-host';
    authoringSlot.setAttribute('data-testid', PARCEL_LAW_AUTHORING_HOST_TESTID);
    root.appendChild(authoringSlot);

    // ── 4b. §PL-LIVE-QUANTITIES (STR §25.7) — ROOM NAMES · NET · BRUT PER LEVEL · TOTAL · COST. ──
    //
    // ⭐ ITS OWN SLOT AND ITS OWN LIVE CHANNEL, and that is the point of it. The figures already
    // render on the singleton envelope card, but that card only repaints on a fixed event list
    // that carries NO space-envelope signal (`GISAreaLayout.ts:5600`) — so a face drag or a new
    // room envelope moved the 3D scene and left every number stale. This control subscribes to
    // `Store.subscribeDirty`, the SAME channel `attachSpaceEnvelopeRender` renders from, which
    // covers execute, undo and redo alike. RESI-ORCHESTRATOR-PLAN §3: honour the existing
    // synchronisation contract, do not invent a fourth update path.
    const quantitiesSlot = document.createElement('div');
    quantitiesSlot.className = 'anl-parcel-law-quantities-host';
    quantitiesSlot.setAttribute('data-testid', PARCEL_LAW_QUANTITIES_HOST_TESTID);
    root.appendChild(quantitiesSlot);

    host.appendChild(root);
    renderFacts();
    // Mounted AFTER `host.appendChild(root)` so the control's `root.isConnected` guards — which
    // are what stop a torn-down tab from repainting — are true from its very first store event.
    try {
      const mount = deps.mountQuantities ?? ((h: HTMLElement) => mountParcelLawQuantities(h));
      quantities = mount(quantitiesSlot);
    } catch (e) {
      console.warn('[analysis][parcel-law] live-quantities mount failed (non-fatal):', e);
    }
    // Same ordering rule as the quantities control above: mounted after the body is in the DOM so
    // its `isConnected` guards are true from its very first store event.
    try {
      const mountAuth = deps.mountAuthoring ?? ((h: HTMLElement) => mountParcelLawEnvelopeAuthoring(h));
      authoring = mountAuth(authoringSlot);
    } catch (e) {
      console.warn('[analysis][parcel-law] envelope-authoring mount failed (non-fatal):', e);
    }

    // ── 4c. §PL-CREATE-HOUSE (STR §25.8) — THE EXPLICIT STEP INTO BIM. ─────────────────────
    //
    // LAST on the tab, and that ordering is the stage ladder: a user reads the parcel, then the
    // law, then what they intend and what it costs, and only then decides to build it. The
    // control refuses — visibly, with numbers — whenever the level it would build on already
    // carries authored walls (C80: a generator may not destroy what it cannot account for).
    const createHouseSlot = document.createElement('div');
    createHouseSlot.className = 'anl-parcel-law-create-house-host';
    createHouseSlot.setAttribute('data-testid', PARCEL_LAW_CREATE_HOUSE_HOST_TESTID);
    root.appendChild(createHouseSlot);
    try {
      const mountCH = deps.mountCreateHouse
        ?? ((h: HTMLElement) => mountParcelLawCreateHouse(h, defaultParcelLawCreateHouseDeps()));
      createHouse = mountCH(createHouseSlot);
    } catch (e) {
      console.warn('[analysis][parcel-law] create-house mount failed (non-fatal):', e);
    }

    // ── 5. The design-stage strip — after the claim lands (it is scheduled on a microtask). ──
    queueMicrotask(wireStrip);
    // …and again whenever the site store moves, because the rail panel rebuilds the card's
    // host chrome on the same signal and the card itself re-renders on a determination.
    const store = resolveSiteStore(deps.runtime);
    if (store?.subscribe) {
      try {
        unsub = store.subscribe(() => {
          if (disposed || !root.isConnected) return;
          // §PARCEL-LAW-MODEL — the SAME signal the card re-renders on (`dispatchEnvelope` →
          // `siteUpdateZoning` → the store notifies), so the two never show different vintages
          // of one parcel. A determination that lands while this tab is open reaches it.
          renderFacts();
          queueMicrotask(wireStrip);
        });
      } catch (e) {
        console.warn('[analysis][parcel-law] site-store subscribe failed — the strip is wired once, at mount:', e);
      }
    }
    span.setAttribute('pryzm.analysis.parcelLaw.mounted', true);
  } catch (e) {
    span.setAttribute('pryzm.analysis.parcelLaw.mounted', false);
    console.warn('[analysis][parcel-law] build failed (non-fatal):', e);
    if (!root.isConnected) host.appendChild(root);
    const fail = document.createElement('p');
    fail.className = 'anl-parcel-law-note';
    fail.textContent =
      'The Parcel Law tab could not build its body — the parcel producers threw while mounting. '
      + 'The PARCEL rail panel and the GIS panel still carry the same data; this tab shows nothing '
      + 'in place of it rather than a partial card.';
    root.appendChild(fail);
  } finally {
    span.end();
  }

  return {
    element: root,
    repaint(): void {
      if (disposed) return;
      try { onView?.repaint(); } catch { /* a repaint that throws is a repaint we do not have */ }
      renderFacts();
      try { authoring?.repaint(); } catch { /* same */ }
      try { quantities?.repaint(); } catch { /* same — a section that cannot repaint keeps its last honest render */ }
      try { createHouse?.repaint(); } catch { /* same */ }
      wireStrip();
    },
    holdsEnvelopeCard,
    dispose(): void {
      if (disposed) return;
      disposed = true;
      const held = holdsEnvelopeCard();
      try { unsub?.(); } catch { /* teardown is best-effort */ }
      unsub = null;
      // Before the panel, so the store subscription is released while the DOM it guards on is
      // still attached — a listener that fires against a detached root is harmless but noisy.
      try { authoring?.dispose(); } catch { /* teardown is best-effort */ }
      authoring = null;
      try { quantities?.dispose(); } catch { /* teardown is best-effort */ }
      quantities = null;
      try { createHouse?.dispose(); } catch { /* teardown is best-effort */ }
      createHouse = null;
      try { panel?.dispose(); } catch { /* teardown is best-effort */ }
      panel = null;
      // The on-view bar owns the switcher handle, so disposing it disposes both — and it
      // MUST happen here: the bar is body-level chrome, and a tab that vanished while leaving
      // its bar over the canvas is the stranded-chrome failure this body's teardown exists for.
      try { onView?.dispose(); } catch { /* teardown is best-effort */ }
      onView = null;
      // See the header: hand the card back to the viewport ONLY if it is still in this body.
      // If another host has claimed it since, it is theirs and this tab does not reach into
      // their state (C19 §5.7 clause 2, by its reason).
      if (held) {
        try {
          deps.capabilityHost.pryzmMountEnvelopeCard?.(null);
        } catch (e) {
          console.warn('[analysis][parcel-law] hand-back to the viewport failed (non-fatal):', e);
        }
      }
      root.remove();
    },
  };
}
