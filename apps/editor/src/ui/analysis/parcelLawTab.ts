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
 * plus the four-view switcher for the LEFT pane (`viewSegmentSwitcher.ts`),
 * which is itself a host of four DECLARED `GIS_ACTIONS`.
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
import { wireDesignStageStrip } from '../site/designStageStripControl';

const _tracer = trace.getTracer('pryzm.analysis.parcelLawTab');

/** `data-testid` on the tab body root. */
export const PARCEL_LAW_TAB_TESTID = 'analysis-parcel-law';
/** `data-testid` on the slot the four-view switcher is mounted into. */
export const PARCEL_LAW_SWITCHER_SLOT_TESTID = 'analysis-parcel-law-switcher';
/** `data-testid` on the slot the parcel panel (both halves) is mounted into. */
export const PARCEL_LAW_PANEL_SLOT_TESTID = 'analysis-parcel-law-panel';
/** `data-testid` on the one-line note that says what this tab is and is not. */
export const PARCEL_LAW_NOTE_TESTID = 'analysis-parcel-law-note';
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
  + 'rail panel shows, placed here beside the 3D view. Switch the left pane above; nothing on this '
  + 'tab is re-derived.';

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
  /** Production: `mountViewSegmentSwitcher`. */
  readonly mountSwitcher: (host: GisCapabilityHost) => ViewSegmentSwitcherHandle;
  /** Production: `wireDesignStageStrip`. Returns the number of pills wired. */
  readonly wireStrip: (root: ParentNode) => number;
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
    wireStrip: wireDesignStageStrip,
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

  let switcher: ViewSegmentSwitcherHandle | null = null;
  let panel: ParcelRailPanelHandle | null = null;
  let unsub: (() => void) | null = null;
  let disposed = false;

  const holdsEnvelopeCard = (): boolean =>
    root.querySelector(`[data-testid="${ENVELOPE_CARD_TESTID}"]`) !== null;

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
    // ── 1. The left-pane switcher — FIRST, because it is the control the founder named. ──
    const switcherSlot = document.createElement('div');
    switcherSlot.className = 'anl-parcel-law-switcher';
    switcherSlot.setAttribute('data-testid', PARCEL_LAW_SWITCHER_SLOT_TESTID);
    root.appendChild(switcherSlot);
    switcher = deps.mountSwitcher(deps.capabilityHost);
    switcherSlot.appendChild(switcher.element);

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
    host.appendChild(root);

    // ── 4. The design-stage strip — after the claim lands (it is scheduled on a microtask). ──
    queueMicrotask(wireStrip);
    // …and again whenever the site store moves, because the rail panel rebuilds the card's
    // host chrome on the same signal and the card itself re-renders on a determination.
    const store = resolveSiteStore(deps.runtime);
    if (store?.subscribe) {
      try {
        unsub = store.subscribe(() => {
          if (disposed || !root.isConnected) return;
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
      try { switcher?.repaint(); } catch { /* a repaint that throws is a repaint we do not have */ }
      wireStrip();
    },
    holdsEnvelopeCard,
    dispose(): void {
      if (disposed) return;
      disposed = true;
      const held = holdsEnvelopeCard();
      try { unsub?.(); } catch { /* teardown is best-effort */ }
      unsub = null;
      try { panel?.dispose(); } catch { /* teardown is best-effort */ }
      panel = null;
      try { switcher?.dispose(); } catch { /* teardown is best-effort */ }
      switcher = null;
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
