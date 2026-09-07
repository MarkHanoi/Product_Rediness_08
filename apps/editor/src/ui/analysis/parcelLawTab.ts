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
  type ParcelRailPanelOptions,
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
// ⭐ §26.6 rule 2 (L-13046) — EVERY FIGURE IS A HYPERLINK, and following it PAINTS the geometry on
// whichever view is open. The rows are built as highlight controls by their producers (the
// cadastral card via `parcelRingMeasuredFacts`, the setback register, the envelope card's fold);
// this tab does two things and only two: it WIRES every such control under its root, and it keeps
// their pressed state PAINTED from the ONE store every view subscribes to. ⛔ No second highlight
// path (C58 §1.19 clause 2, §26.6.6) — these are the same two functions `GISAreaLayout` calls.
import { keepSiteHighlightRowsPainted, wireSiteHighlightRows } from '../site/siteHighlightRowControl';
// ⭐ §26.6.2 (L-13046) — THE SETBACK REGISTER, the largest single addition in the spec: per
// perimeter edge, the setback applied, the rule that produced it (C58 §1.3 per edge) and a link
// that lights THAT edge. A pure model over the ONE `ParcelLawModel` (never a second read) and a
// DOM renderer; this tab places it in question 2 and re-renders it on the same store signal the
// facts re-render on.
import { buildSetbackRegister } from '../site/setbackRegisterModel';
import { buildSetbackRegisterSection, SETBACK_REGISTER_TESTID } from '../site/setbackRegisterSection';
// §PARCEL-LAW-MODEL (STR §25.11) — the ONE parcel/ordinance/massing model, and this tab's
// rendering of it. NOT a second computation and NOT a copied renderer: `GISAreaLayout`'s card
// renders the SAME model, which is what makes "the rail panel and the tab agree datum for datum"
// true by construction rather than by review. See `parcelLawFacts.ts`'s header for why the tab
// needs its own rendering at all — the singleton card can only ever be in ONE host.
import { resolveParcelLawModel } from '../site/parcel/resolveParcelLawModel';
// §SELECT-PARCEL-IS-A-VIEW-ACTION (L-13004) — the DECLARED `site.map-2d` action, resolved by the
// ONE producer of that button. This tab decides WHETHER question 1 carries it; it never writes a
// rival handler, and `buildOpenMapAction` remains the only place the label and the dispatch live.
import { buildOpenMapAction } from '../site/parcel/parcelPanelSection';
import type { ParcelLawModel } from '../site/parcel/parcelLawModel';
import {
  buildParcelLawFacts,
  parcelRingMeasuredFacts,
  type ParcelLawFactsOptions,
} from './parcelLawFacts';
// §PL-IA-Q (STR §26.3, L-12998) — THE PERSONA QUESTIONS, as containers. SIX at mint; SEVEN
// since §STAGE-05-SECTION split the room programme out of question 3 (C115-06). The founder:
// *"thing as a persona architect of land developer how it would go thoutght the workflow."*
// ⛔ This module computes NOTHING and this tab still computes nothing; the groups only decide
// WHERE an already-produced section lands, and each group's collapsed digest is a MIRROR of a
// row inside its own body (C58 §1.2 — a hidden confidence is a broken figure).
import {
  buildQuestionGroup,
  questionGroupFoldIsOpen,
  setQuestionGroupFoldOpen,
  PARCEL_LAW_QUESTION_GROUPS,
  type QuestionGroupHandle,
} from './parcelLawQuestionGroup';
// ⭐ §PLOT-DISPLAY-CONTROLS-HOST (C115 §1.4 `C115-151`, founder 2026-09-07: the SHOW ON THE PLOT
// switches belong in section ①). The control is the ONE producer's, rendered as DOM because this
// file has no HTML sink (C08 §3.1); the writes are the ONE authority's setters, exactly the pair
// `GISAreaLayout` calls; and the claim is what stops the envelope card — which this tab re-parents
// into question 2 — from drawing a second, un-subscribed copy one screen further down.
//
// ⚠ THIS IS THE ONE PLACE THIS TAB WRITES ANYTHING, and it is not a store and not a command (P6
// is untouched): it is a persisted VIEW preference about what is drawn on the plot, owned by
// `envelopeVisibility.ts`, whose subscribers repaint themselves. This file renders the switches
// and reports the click; it decides nothing and pokes no renderer (L-1170).
import {
  buildEnvelopeAxesControlEl,
  wireEnvelopeAxesControl,
} from '../site/envelopeVisibilityControl';
import {
  getBuildableEnvelopeAxes,
  isBuildableEnvelopeFootprintVisible,
  isBuildableEnvelopeVisible,
  setBuildableEnvelopeFootprintVisible,
  setBuildableEnvelopeVisible,
  subscribeBuildableEnvelopeVisibility,
} from '../site/envelopeVisibility';
import {
  claimPlotDisplayControls,
  releasePlotDisplayControls,
} from '../site/plotDisplayControlsHost';
// §PL-LIVE-QUANTITIES (STR §25.7) — the live room/level/total figures and the adjustable cost
// per m². It owns its own LIVE subscription to the space-envelope store's dirty channel — the
// same channel the 3D scene renders from — so the panel and the scene cannot show different
// vintages of one envelope. See that module's header for the measured liveness defect it fixes.
import {
  defaultParcelLawQuantitiesDeps,
  mountParcelLawQuantities,
  type ParcelLawQuantitiesHandle,
} from './parcelLawQuantities';
// §PL-ENVELOPE-AUTHORING (STR §25.2 / §25.6) — CREATE the envelope, extrude it over a chosen
// number of floor levels, and check it LIVE against the law. It is a consumer of C114's ONE
// create verb and of `brutAreaAllocation.ts`'s arithmetic; it computes nothing itself.
import {
  defaultParcelLawEnvelopeAuthoringDeps,
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
// §PL-CHAT (STR §25.4) — the chat surface, ON this panel. ⛔ NOT a second chat client: it resolves
// the parcel-law asks the general ladder correctly refuses for want of a footprint, drives the SAME
// fields the manual path drives (so "typed" and "asked" cannot disagree), and hands everything else
// to the SHIPPED `tryHandleZeroToken`. See that module's header for why it types into a field
// instead of dispatching a command of its own.
import {
  mountParcelLawChat,
  defaultParcelLawChatDeps,
  type ParcelLawChatHandle,
} from './parcelLawChat';
// §26.6 rule 3 (L-13046) — EVERY INTENT SITS BESIDE ITS CEILING, AND CAN NEVER EXCEED IT. The
// declared level envelopes (levels · heights · areas) beside Maximum levels · Maximum height ·
// Maximum implantation area · Maximum buildable area, live on the store's dirty channel; an
// intent that exceeds its ceiling is REFUSED with both numbers, never clamped. Hosted in question
// 3, directly after the control that declares the intent.
import {
  defaultParcelLawIntentDeps,
  mountParcelLawIntentAgainstCeiling,
  type ParcelLawIntentHandle,
} from './parcelLawIntentAgainstCeiling';
// §PL-ROOM-PROGRAMME (L-13024 clause 3, STR §25.5) — the ROOM PROGRAMME panel, RE-HOSTED into
// question 3. ⛔ THE SAME MODULE THE RAIL USED TO MOUNT, not a copy of it: the rail's PROGRAMME
// section was removed in the same commit, so there is exactly one live mount of this surface.
import {
  mountRoomProgrammePanel,
  defaultRoomProgrammePanelDeps,
  type RoomProgrammePanelHandle,
  type RoomProgrammeHostRuntime,
} from '../room-programme/roomProgrammePanel';
// §ROOMS-PER-LEVEL (L-13039, STR §25.5 / §26.6.4) — the project's rooms PER STOREY, each with the
// level envelope of that storey. Pure model + small section, both next to the massing options.
import {
  defaultRoomsPerLevelDeps,
  mountRoomsPerLevelSection,
  type RoomsPerLevelHandle,
} from '../site/roomsPerLevelSection';

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
/**
 * ⛔ RETIRED 2026-09-06 (§PL-IA-Q, L-12998) — NOTHING IN THIS BODY CARRIES THIS ID ANY MORE.
 *
 * The shared model used to render into ONE slot, because one builder produced all of it. It now
 * renders into TWO, because its halves answer two different persona questions (STR §26.3): the
 * PARCEL group is *"what is this plot?"* and the ordinance / massing / per-storey / capacity
 * groups are *"what may I build here, and who says so?"*. A single wrapper spanning both would
 * have to live in one group or the other, which is the flatness this lane removed.
 *
 * The constant is KEPT exported rather than deleted, on the same reasoning that kept
 * `PARCEL_LAW_SWITCHER_SLOT_TESTID`: an in-flight import in a sibling lane's working tree still
 * compiles, and the next reader finds the removal STATED instead of finding a testid that
 * silently matches nothing. Use `PARCEL_LAW_FACTS_PLOT_SLOT_TESTID` and
 * `PARCEL_LAW_FACTS_LAW_SLOT_TESTID`.
 */
export const PARCEL_LAW_FACTS_SLOT_TESTID = 'analysis-parcel-law-facts-slot';
/** `data-testid` on the slot the envelope-authoring section is mounted into. */
export const PARCEL_LAW_AUTHORING_HOST_TESTID = 'analysis-parcel-law-authoring-slot';
/** §26.6 rule 3 — `data-testid` on the slot the intent-beside-ceiling section is mounted into. */
export const PARCEL_LAW_INTENT_HOST_TESTID = 'analysis-parcel-law-intent-slot';
/** `data-testid` on the slot the live-quantities + indicative-cost section is mounted into. */
export const PARCEL_LAW_QUANTITIES_HOST_TESTID = 'analysis-parcel-law-quantities-slot';
/** `data-testid` on the slot the "Create house" section is mounted into. */
export const PARCEL_LAW_CREATE_HOUSE_HOST_TESTID = 'analysis-parcel-law-create-house-slot';
/** `data-testid` on the slot the STR §25.4 chat surface is mounted into. */
export const PARCEL_LAW_CHAT_HOST_TESTID = 'analysis-parcel-law-chat-slot';
/** §PL-ROOM-PROGRAMME — `data-testid` on the slot the ROOM PROGRAMME panel is re-hosted into. */
export const PARCEL_LAW_ROOM_PROGRAMME_HOST_TESTID = 'analysis-parcel-law-room-programme-slot';
/** §PL-IA-Q — `data-testid` on the ladder that holds the seven question groups, in order. */
export const PARCEL_LAW_LADDER_TESTID = 'analysis-parcel-law-ladder';
/** §PL-IA-Q — `data-testid` on the slot question 1 renders the plot half of the model into. */
export const PARCEL_LAW_FACTS_PLOT_SLOT_TESTID = 'analysis-parcel-law-facts-plot';
/** §PL-IA-Q — `data-testid` on the slot question 2 renders the law half of the model into. */
export const PARCEL_LAW_FACTS_LAW_SLOT_TESTID = 'analysis-parcel-law-facts-law';
/** §PL-IA-Q — `data-testid` on the slot question 4 hosts the BRUT/NET allowance ledger in. */
export const PARCEL_LAW_ALLOWANCE_HOST_TESTID = 'analysis-parcel-law-allowance-slot';
/** §PL-IA-Q — `data-testid` on the slot question 5 hosts the rate entry and the estimate in. */
export const PARCEL_LAW_COST_HOST_TESTID = 'analysis-parcel-law-cost-slot';
/**
 * §SELECT-PARCEL-IS-A-VIEW-ACTION (L-13004) — `data-testid` on question 1's one-line pointer to
 * where plot selection actually happens, shown in place of the button once a plot IS committed.
 */
export const PARCEL_LAW_PLOT_ROUTE_TESTID = 'analysis-parcel-law-plot-route';

/**
 * ⭐ §PLOT-DISPLAY-CONTROLS-HOST (C115 §1.4 `C115-151`) — `data-testid` on question 1's slot for
 * the SHOW ON THE PLOT switches.
 *
 * Founder 2026-09-07: the group belongs in section ① — *"What is this plot?"* — not beside the
 * Stage-02 determination. He is right about the model as well as the screen: the two axes are
 * VIEW CHROME about the plot (`envelopeVisibility.ts`'s own header refuses `projectScopeRegistry`
 * for exactly that reason), and §1.4.1 already makes Stage 01 the panel's view-painting stage —
 * every figure in it is a hyperlink that paints on the site view. A control that decides what is
 * DRAWN on the plot sits with the controls that decide what is HIGHLIGHTED on it.
 */
export const PARCEL_LAW_PLOT_DISPLAY_TESTID = 'analysis-parcel-law-plot-display';

/**
 * §STAGE-01-DENSITY (C115 §1.4 `C115-111` · §11 `C115-93`) — the summary of question 1's
 * *"View full parcel data"* disclosure. `C115-93` names the affordance in these words; they are
 * reproduced verbatim rather than paraphrased.
 */
export const PARCEL_LAW_DETAIL_FOLD_SUMMARY = 'View full parcel data';

/**
 * `C115-92` — the second, muted summary line. A collapsed fold MUST state what is inside, so the
 * reader can tell whether the row they want is behind it without opening it to find out.
 */
export const PARCEL_LAW_DETAIL_FOLD_CONTENTS =
  'Perimeter · bounding box · boundary edges · zone pack · source CRS · retrieval date · how the '
  + 'ring was measured · where plot selection happens.';

/**
 * §STAGE-01-DENSITY — the disclosure's key in the panel's ONE session-scoped open-state map
 * (`parcelLawQuestionGroup.ts`). ⛔ It is the fold's own `data-testid`, not a position: `C115-92`
 * and PR-H-07 — an untagged `<details>` is not a disclosure, because it cannot remember, and this
 * card is rebuilt whole on every site-store notification.
 */
export const PARCEL_LAW_DETAIL_FOLD_TESTID = 'parcel-full-technical-detail';

/**
 * §SELECT-PARCEL-IS-A-VIEW-ACTION (L-13004) — what question 1 says instead of carrying the
 * `Select parcel on the 2D map` button, once a plot with recorded provenance is committed.
 *
 * Founder 2026-09-06: *"once i select a parcel — even if it has a real constructed envelope — WE
 * DON'T NEED 'Select parcel on the 2D map' in the analysis parcel law tab. THIS SHOULD BE ON THE
 * LEFT HAND SIDE."* It names the route rather than merely removing the control, because a panel
 * that drops an affordance and says nothing has moved the user's problem, not solved it.
 */
export const PARCEL_LAW_PLOT_ROUTE_NOTE =
  'This plot is committed. Selecting or changing it is done ON THE VIEW — switch to 2D Site Map '
  + 'from the bar centred on the view and click another plot. Nothing on this tab changes which '
  + 'parcel you are looking at.';
/** The `data-testid` the singleton card carries (GISAreaLayout `ensureEnvelopePanel`). */
export const ENVELOPE_CARD_TESTID = 'buildable-envelope-card';
/** Carries how many stage pills were wired on the last pass — read by the spec. */
export const PARCEL_LAW_STRIP_WIRED_ATTR = 'data-parcel-law-strip-wired';
/** §26.6 rule 2 — carries how many highlight controls were wired on the last pass. Read by the spec. */
export const PARCEL_LAW_HIGHLIGHT_WIRED_ATTR = 'data-parcel-law-highlight-wired';
/**
 * §26.6 rule 1 (L-13046) — stamped on question 2's tab-owned slot to STATE that the
 * ORDINANCE LIMITS · MASSING POTENTIAL · PER STOREY · CAPACITY rendering that used to live there
 * was removed as a DUPLICATE of the envelope card's *Full site & massing data* fold — so a reader
 * (or a spec) can tell "the block moved to its owner" from "the block is gone".
 */
export const PARCEL_LAW_DUPLICATE_REMOVED_ATTR = 'data-duplicate-removed';

/**
 * ⭐ §ENVELOPE-CREATION-IS-A-STAGE-02-VERB (L-13202 · C115 §2.5 `C115-17`) — the RELOCATION STAMP.
 *
 * `C115-17` makes it mandatory: every block this refactor relocates leaves a machine-readable
 * stamp on the surface it LEFT, naming where it went. Its value is the id of the question that now
 * hosts the block, so a reader — and a spec — can tell *"the block moved"* from *"the block is
 * gone"*, which are opposite facts that an empty element alone conflates.
 *
 * ⛔ It is distinct from `PARCEL_LAW_DUPLICATE_REMOVED_ATTR` deliberately, and the difference is
 * the whole point of having two. That one says *"this rendering was DELETED because another
 * surface already owned the figure"*; this one says *"this rendering still exists and is now over
 * there"*. Collapsing them would make *"we removed a duplicate"* and *"we moved a control"*
 * indistinguishable — the same conflation C115 §2.5 exists to prevent.
 */
export const PARCEL_LAW_RELOCATED_TO_ATTR = 'data-relocated-to';

/**
 * `data-testid` on the sentence question 3 renders where the create controls used to be.
 *
 * ⛔ A CONTROL THAT VANISHES WITHOUT A POINTER HAS MOVED THE USER'S PROBLEM, NOT SOLVED IT — the
 * rule `PARCEL_LAW_PLOT_ROUTE_NOTE` above already applies to the *Select parcel* button, reused
 * here rather than re-invented. A machine-readable attribute alone would satisfy a spec and tell
 * the founder nothing, so the stamp and the sentence ship together.
 */
export const PARCEL_LAW_AUTHORING_MOVED_TESTID = 'parcel-law-authoring-moved-note';

/**
 * ⭐ The sentence itself. Founder 2026-09-07: *"SECTION 3 SHALL HAVE ONLY THIS SCOPE"* — the
 * intent-vs-ceiling ledger, 3.1 and 3.2 — and, on the create block, *"THIS HAS BEEN DONE ALREADY
 * ON SECTION 2."*
 *
 * It names the DESTINATION and the REASON, because a pointer that only says "moved" makes the
 * reader hunt. The reason is the IA rule this lane wrote into `C115-12`: question 2 is where you
 * ACT on the parcel, question 3 is the ledger that READS what you declared against what you are
 * allowed.
 */
export const PARCEL_LAW_AUTHORING_MOVED_NOTE =
  'Creating the envelope moved to ② What can I build here? — it now sits directly under the '
  + 'buildable envelope it is measured against, beside Massing options and Fit this on the ground '
  + 'floor. Nothing was removed: the footprint ladder, the storey count, Create envelope, Discard '
  + 'the drawn perimeter and the per-storey Edit perimeter rows are all there. This section is the '
  + 'ledger of what you declared, beside what you are allowed.';

/**
 * The lede sentence. It names the ROUTE (the switcher and the producers) rather than the
 * data, because the tab's empty state is the common one for existing projects.
 *
 * ⚠ IT SAID *"Six"* UNTIL 2026-09-07. `C115-08` makes rewriting it MANDATORY in the same PR that
 * changes the count, precisely so the tab cannot tell the reader there are six ladder rungs
 * while rendering seven. §STAGE-05-SECTION split the room programme out of question 3 into its
 * own question 4 (`C115-06`), so the count is now **seven**.
 */
export const PARCEL_LAW_NOTE =
  'Seven questions, in the order an architect asks them. Every figure below is produced elsewhere '
  + 'and only placed here — nothing on this tab is re-derived, and each one still states its own '
  + 'source and confidence. Switch the view, or split it, from the bar centred on the view itself.';

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
  /**
   * Production: `buildParcelRailPanel` — the ONE host of both parcel halves.
   *
   * ⚠ THE SECOND PARAMETER IS OPTIONAL AND EVERY EXISTING FAKE IGNORES IT. Six specs in this
   * repo build this seam as `() => ({ element, dispose })`; a `(runtime) => handle` still
   * satisfies `(runtime, opts?) => handle`, so §ONE-PARCEL-BLOCK cost none of them a line. A
   * fake that ignores `opts` renders the card without the ring measurements, which is exactly
   * what a fake with no model to measure should render.
   */
  readonly buildParcelPanel: (
    runtime: PryzmRuntime | null | undefined,
    opts?: ParcelRailPanelOptions,
  ) => ParcelRailPanelHandle;
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
  readonly renderParcelLawFacts?: (model: ParcelLawModel, opts?: ParcelLawFactsOptions) => HTMLElement;
  /**
   * §26.6.2 — Production: `buildSetbackRegisterSection(buildSetbackRegister(model), { open })`.
   * A RENDERING of the same model read, never a second read. ⚠ OPTIONAL for the same reason as
   * its siblings: older spec literals are complete and must keep compiling; omitting it yields
   * the production pair.
   */
  readonly renderSetbackRegister?: (model: ParcelLawModel, opts: { readonly open: boolean }) => HTMLElement;
  /**
   * Production: `mountParcelLawQuantities` — STR §25.7's live figures and adjustable rate.
   *
   * ⚠ OPTIONAL for the same reason as the pair above: a spec written before this seam existed
   * constructs `ParcelLawTabDeps` as a complete literal. Omitting it yields the production mount,
   * which on a runtime with no `spaceEnvelope` store renders the channel's own honest sentence
   * rather than throwing — so an old spec keeps passing and keeps meaning what it meant.
   */
  readonly mountQuantities?: (
    host: HTMLElement,
    /**
     * §PL-IA-Q — where the rate entry and the estimate go: question 5's body, while the
     * quantities themselves answer question 4. A fake that ignores this argument still
     * compiles and still means what it meant; it simply leaves question 5 empty.
     */
    costHost: HTMLElement,
  ) => ParcelLawQuantitiesHandle;
  /**
   * Production: `mountParcelLawEnvelopeAuthoring` — STR §25.2/§25.6's create-and-check section.
   *
   * ⚠ OPTIONAL for the same reason as its siblings: a spec written before this seam existed
   * constructs `ParcelLawTabDeps` as a complete literal, and making it required would break every
   * such literal in a file another lane owns. Omitting it yields the production mount, which on a
   * runtime with no space-envelope store renders its own honest sentences rather than throwing.
   */
  readonly mountAuthoring?: (
    host: HTMLElement,
    /** §PL-IA-Q — where the BRUT/NET allowance ledger goes: question 4's body. */
    lawCheckHost: HTMLElement,
  ) => ParcelLawEnvelopeAuthoringHandle;
  /**
   * Production: `mountParcelLawCreateHouse` with its production deps — STR §25.8.
   *
   * ⚠ OPTIONAL for the same reason as the three above: older spec literals are complete and
   * must keep compiling. Omitting it yields the production control, which on a runtime with no
   * space-envelope store renders a DISABLED button and the reason — never a dead click.
   */
  readonly mountCreateHouse?: (host: HTMLElement) => ParcelLawCreateHouseHandle;
  /**
   * Production: `mountParcelLawChat` scoped to THIS tab body — STR §25.4.
   *
   * ⚠ OPTIONAL for the same reason as its four siblings: spec literals written before this seam
   * existed are complete and must keep compiling. Omitting it yields the production mount, whose
   * every arm reports what it could not find rather than throwing.
   *
   * ⛔ The `scope` it is given is the tab ROOT, not `document`. The chat drives controls by
   * pressing them, so a wider scope could press a control on a surface the reader is not looking
   * at — the rail PARCEL panel holds the same card when it, not this tab, claimed it last.
   */
  readonly mountChat?: (host: HTMLElement, scope: () => ParentNode | null) => ParcelLawChatHandle;
  /**
   * §PL-ROOM-PROGRAMME (L-13024 clause 3, STR §25.5) — the ROOM PROGRAMME panel, RE-HOSTED
   * into question 3.
   *
   * Founder: *"the ROOM PROGRAMME is the one I want to bring into the Parcel Law panel"*,
   * and *"when we click Create at the end, we might want to use the ROOM GENERATOR
   * beforehand — to add rooms beforehand"*. Question 3 is *"What do I want to build?"* and
   * question 6 is *"Take me into BIM."* — so mounting it here puts the programme in front
   * of Create house, in the reader's own sequence, which is the whole of that ask.
   *
   * ⛔ RE-HOSTED, NOT DUPLICATED. `mountRoomProgrammePanel` is the ONE panel; the rail's
   * PROGRAMME section no longer mounts a second copy of it (see `ProjectBrowserPanel.ts`).
   * A second programme surface would be the rival this session has already refused for the
   * Cesium viewer, the MapLibre map, the basemap and the view switcher.
   *
   * ⚠ OPTIONAL for the same reason as its five siblings: spec literals written before this
   * seam existed are complete and must keep compiling. Omitting it yields the production
   * mount, which resolves the live runtime itself and renders its own honest sentences on a
   * runtime with no stores rather than throwing.
   */
  readonly mountRoomProgramme?: (host: HTMLElement) => RoomProgrammePanelHandle;
  /**
   * §26.6 rule 3 — Production: `mountParcelLawIntentAgainstCeiling` with its production deps.
   * ⚠ OPTIONAL for the same reason as its siblings: spec literals written before this seam
   * existed are complete and must keep compiling. Omitting it yields the production mount, which
   * on a runtime with no space-envelope store renders its own admission rather than throwing.
   */
  readonly mountIntent?: (host: HTMLElement) => ParcelLawIntentHandle;
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
    renderSetbackRegister: (model, opts) => buildSetbackRegisterSection(buildSetbackRegister(model), opts),
    mountQuantities: (h, costHost) =>
      mountParcelLawQuantities(h, defaultParcelLawQuantitiesDeps(), { costHost }),
    mountAuthoring: (h, lawCheckHost) =>
      mountParcelLawEnvelopeAuthoring(h, defaultParcelLawEnvelopeAuthoringDeps(), { lawCheckHost }),
    mountCreateHouse: (h) => mountParcelLawCreateHouse(h, defaultParcelLawCreateHouseDeps()),
    mountChat: (h, scope) => mountParcelLawChat(h, defaultParcelLawChatDeps(scope)),
    // §PL-ROOM-PROGRAMME — the panel resolves the LIVE runtime itself (`runtime ??
    // window.runtime`), so the null-by-design boot prop cannot make it print "unavailable"
    // (§L-12916). `w.runtime` is handed in as the PREFERRED source, never the only one.
    mountIntent: (h) => mountParcelLawIntentAgainstCeiling(h, defaultParcelLawIntentDeps()),
    mountRoomProgramme: (h) => mountRoomProgrammePanel(
      h, defaultRoomProgrammePanelDeps(w.runtime as unknown as RoomProgrammeHostRuntime | null)),
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
  /** §26.6 rule 3 — the intent-beside-ceiling section's handle. */
  let intent: ParcelLawIntentHandle | null = null;
  let quantities: ParcelLawQuantitiesHandle | null = null;
  let createHouse: ParcelLawCreateHouseHandle | null = null;
  let chat: ParcelLawChatHandle | null = null;
  /** §PL-ROOM-PROGRAMME — the re-hosted ROOM PROGRAMME panel's handle. */
  let roomProgramme: RoomProgrammePanelHandle | null = null;
  /** §ROOMS-PER-LEVEL — the per-storey rooms section's handle. */
  let roomsPerLevel: RoomsPerLevelHandle | null = null;
  let unsub: (() => void) | null = null;
  /** §26.6 rule 2 — the highlight-store subscription that keeps every row's ◉ honest. */
  let unsubHighlight: (() => void) | null = null;
  let disposed = false;
  /** §SELECT-PARCEL-IS-A-VIEW-ACTION (L-13004) — question 1's pointer, shown only when the
   *  button it replaces is suppressed. Assigned on the successful build arm. */
  let plotRouteNote: HTMLParagraphElement | null = null;
  /** §PLOT-DISPLAY-CONTROLS-HOST (C115 §1.4 C115-151) — question 1's SHOW ON THE PLOT slot. */
  let plotDisplaySlot: HTMLDivElement | null = null;
  /** The visibility-authority subscription that keeps those switches honest. Released on dispose. */
  let unsubPlotDisplay: (() => void) | null = null;
  /** §PL-IA-Q — the seven question groups, by id, in the order STR §26.3 (+ C115-06) states them. */
  const groups = new Map<string, QuestionGroupHandle>();

  const holdsEnvelopeCard = (): boolean =>
    root.querySelector(`[data-testid="${ENVELOPE_CARD_TESTID}"]`) !== null;

  // §PARCEL-LAW-MODEL — its OWN slot, so re-rendering the facts never touches the panel slot
  // the singleton card lives in. `replaceChildren` is safe HERE and only here: this slot holds
  // nothing shared (the rule the rail panel states for its envelope slot is about the CARD).
  //
  // ⭐ §PL-IA-Q (STR §26.3) — ONE MODEL, ONE READ, TWO PLACES. The shared model answers two
  // different persona questions: its PARCEL group is *"what is this plot?"* and its ordinance,
  // massing, per-storey and capacity groups are *"what may I build here, and who says so?"*.
  // They were one block because one builder produced them, not because a reader wants them
  // together — which is exactly the flatness §26.2 names. `buildParcelLawFacts` now takes a
  // scope, so the SAME model object is rendered into the two groups that ask for it.
  //
  // ⛔ STILL NOT A SECOND DERIVATION. `readModel` is called ONCE per pass and its result is
  // handed to both renderings, so the two halves cannot be different vintages of one parcel.
  const factsPlotSlot = document.createElement('div');
  factsPlotSlot.className = 'anl-parcel-law-facts-plot';
  factsPlotSlot.setAttribute('data-testid', PARCEL_LAW_FACTS_PLOT_SLOT_TESTID);
  const factsLawSlot = document.createElement('div');
  factsLawSlot.className = 'anl-parcel-law-facts-law';
  factsLawSlot.setAttribute('data-testid', PARCEL_LAW_FACTS_LAW_SLOT_TESTID);
  /**
   * The ONE model, read through the ONE reader (§25.11 clause 1) — never a second derivation and
   * never a cached value. Three callers read it: the two fact renderings, the card's ring
   * measurements, and question 1's route predicate. They must all see the same vintage, and a
   * cache would be the one way they could not.
   */
  const readModelNow = (): ParcelLawModel =>
    (deps.readParcelLawModel ?? resolveParcelLawModel)(deps.runtime);

  /**
   * §SELECT-PARCEL-IS-A-VIEW-ACTION (L-13004) — is a plot COMMITTED with its provenance recorded?
   *
   * ⛔ THE PREDICATE IS THE FOUNDER'S OWN CONDITION, NOT A CONVENIENCE. He wrote *"once i select a
   * parcel"*; `identityAbsence === 'none'` is exactly that state, and it is the value
   * `buildParcelSectionBody` already keys its three sentences off, carried on the model rather
   * than re-decided here (§L-1582). The two other values — `no-boundary` and
   * `provenance-not-recorded` — are the arms where the button is the ONLY route to a parcel and
   * therefore must survive (§L-1585 · L-942).
   *
   * A read that throws answers `false`: the failure mode of "we could not tell" must be KEEPING
   * the escape hatch, never removing it.
   */
  const plotIsCommitted = (): boolean => {
    try {
      return readModelNow().identityAbsence === 'none';
    } catch (e) {
      console.warn('[analysis][parcel-law] plot-state read failed — keeping the map route:', e);
      return false;
    }
  };

  /**
   * Re-read the model and re-render the PLOT half. Cheap, and never throws into the tab.
   *
   * ⛔ §26.6 rule 1 (L-13046, founder 2026-09-07): *"ALL THIS DATA IS DUPLICATED … IMAGE 6 SHOULD
   * NOT BE DUPLICATED … NOT DUPLICATED NOT THERE."* The LAW half — ORDINANCE LIMITS · MASSING
   * POTENTIAL · PER STOREY · CAPACITY — is NO LONGER RENDERED HERE. It was a second rendering of
   * the one model, justified by the two-hosts case (`parcelLawFacts.ts` header); the founder has
   * ruled the duplication out, and its OWNER is the singleton envelope card's *Full site & massing
   * data* fold, which sits in this same question and whose rows are the hyperlinks (rule 2).
   * ⚠ Nothing is re-derived and no refusal was deleted: the card's own refusal / absence arms
   * (C58 §1.13 · L-13048) state those on the card, in this question. Question 2's tab-owned slot
   * now carries the SETBACK REGISTER (§26.6.2) — a figure the card does not have — and is stamped
   * with `PARCEL_LAW_DUPLICATE_REMOVED_ATTR` so the move is readable rather than inferable.
   */
  const renderFacts = (): void => {
    if (disposed) return;
    try {
      const renderModel = deps.renderParcelLawFacts ?? buildParcelLawFacts;
      const model = readModelNow();
      factsPlotSlot.replaceChildren(renderModel(model, { scope: 'plot' }));
      factsLawSlot.setAttribute(PARCEL_LAW_DUPLICATE_REMOVED_ATTR, 'envelope-card-site-data-fold');
      // §26.6.2 — the SETBACK REGISTER, from the SAME model read as the plot half (one read,
      // two renderings — never two vintages of one parcel). The reader's disclosure state is
      // carried across re-renders: a dropdown that snaps shut on every store notification is an
      // obstacle, not a dropdown.
      const previous = factsLawSlot.querySelector<HTMLDetailsElement>(`[data-testid="${SETBACK_REGISTER_TESTID}"]`);
      const open = previous?.open === true;
      const renderRegister = deps.renderSetbackRegister
        ?? ((m: ParcelLawModel, o: { readonly open: boolean }) => buildSetbackRegisterSection(buildSetbackRegister(m), o));
      factsLawSlot.replaceChildren(renderRegister(model, { open }));
      // §SELECT-PARCEL-IS-A-VIEW-ACTION — the pointer appears exactly when the button it replaces
      // is suppressed, from the SAME model read, so the two can never contradict each other on
      // screen (a panel showing both the button and "selection happens elsewhere" is worse than
      // either alone).
      if (plotRouteNote) plotRouteNote.hidden = model.identityAbsence !== 'none';
      // §STAGE-01-DENSITY — the cadastral card rebuilt on the SAME store signal a moment ago and
      // only its full arm carries the disclosure, so the sentence's home may have just changed.
      placeRouteNote();
    } catch (e) {
      console.warn('[analysis][parcel-law] fact section render failed (non-fatal):', e);
    }
  };

  /**
   * ⭐ §PLOT-DISPLAY-CONTROLS-HOST (C115 §1.4 C115-151) — paint question 1's SHOW ON THE PLOT
   * switches from the ONE authority, and bind them to the ONE pair of setters.
   *
   * ⛔ IT RENDERS THE AXES IT READS, IT DOES NOT REMEMBER THEM. The producer is pure and is handed
   * `getBuildableEnvelopeAxes()` on every pass, so this surface can never display a state the
   * viewports disagree with — the L-1170 rule ("the control only writes the answer"), which is
   * also why the two handlers below do nothing except call a setter. No renderer is poked from
   * here: `envelopeVisibility.ts` notifies, and every subscribed view repaints itself.
   *
   * Idempotent: `wireEnvelopeAxesControl` assigns `onclick` rather than adding a listener, and the
   * markup is rebuilt each pass, so no handler can stack and no click can toggle twice.
   */
  const renderPlotDisplay = (): void => {
    if (disposed || !plotDisplaySlot) return;
    try {
      const control = buildEnvelopeAxesControlEl(getBuildableEnvelopeAxes());
      plotDisplaySlot.replaceChildren(control);
      wireEnvelopeAxesControl(plotDisplaySlot, {
        onToggleVolume: () => setBuildableEnvelopeVisible(!isBuildableEnvelopeVisible()),
        onToggleFootprint: () => setBuildableEnvelopeFootprintVisible(!isBuildableEnvelopeFootprintVisible()),
      });
    } catch (e) {
      console.warn('[analysis][parcel-law] plot-display control render failed (non-fatal):', e);
    }
  };

  /**
   * §STAGE-01-DENSITY — keep `PARCEL_LAW_PLOT_ROUTE_NOTE` inside question 1, wherever the card's
   * current arm leaves room for it.
   *
   * ⚠ THIS IS A RE-ASSERTION, NOT A SECOND PLACEMENT RULE, AND IT IS NEEDED FOR ONE REASON: the
   * cadastral card is rebuilt WHOLE on every site-store notification, and only its full arm builds
   * the disclosure. On the two absence arms there is no fold at all, so a node the previous render
   * had placed inside one would be discarded with the card it lived in — present in memory, gone
   * from the screen. That is the stranded-chrome failure this file's own teardown exists to
   * prevent, arriving from the other direction.
   *
   * ⛔ IT MOVES ONE DECLARED NODE AND NOTHING ELSE. The card DECLARES the fold as a host slot
   * (`ParcelCardDetailFold.hostNodes`), so this is not a host reaching into a producer's private
   * DOM; it is the host re-asserting the placement the producer offered it, idempotently, after a
   * rebuild it does not control. Never into `panelSlot` — see the append site.
   */
  const placeRouteNote = (): void => {
    const note = plotRouteNote;
    if (!note) return;
    try {
      const foldBody = root.querySelector(
        `[data-testid="${PARCEL_LAW_DETAIL_FOLD_TESTID}"] .pryzm-parcel-card-fold-body`,
      );
      // The fallback is question 1's own body — the same slot the append site used before the
      // fold existed. `groups` is read live rather than captured, so a rebuild cannot strand it.
      const q1 = groups.get('plot')?.body ?? root;
      const target: HTMLElement = foldBody instanceof HTMLElement ? foldBody : q1;
      if (note.parentElement !== target) target.appendChild(note);
    } catch (e) {
      console.warn('[analysis][parcel-law] route-note placement failed (non-fatal):', e);
    }
  };

  /** Re-mirror every group's collapsed digest from what its body ALREADY says. Derives nothing. */
  const refreshDigests = (): void => {
    if (disposed) return;
    for (const g of groups.values()) {
      try { g.refreshDigest(); } catch { /* a digest that cannot mirror keeps its last honest text */ }
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

  /**
   * §26.6 rule 2 — wire every highlight control under this body. Idempotent (`onclick` is
   * assigned, never added), so it is safe to run after every producer re-render: the cadastral
   * card rebuilds on its own site-store notification, the envelope card on its determination, the
   * setback register on this tab's own pass — and a control rebuilt by any of them is a control
   * that has lost its handler until this runs again.
   */
  const wireHighlights = (): void => {
    if (disposed) return;
    try {
      const n = wireSiteHighlightRows(root);
      root.setAttribute(PARCEL_LAW_HIGHLIGHT_WIRED_ATTR, String(n));
    } catch (e) {
      console.warn('[analysis][parcel-law] highlight wiring failed (non-fatal):', e);
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
      // §PANE-DEFAULT-IS-PLAN-LEFT (L-12988, founder 2026-09-06): *"it should initially the
      // plan view to the left and 3d site to right — and the user should be able to customise
      // which view to have in each of the splitted views — but this doesn't occur."*
      //
      // ⭐ THE SECOND HALF OF THAT SENTENCE ALREADY SHIPPED; ONLY THE FIRST WAS MISSING. Every
      // pane carries its own picker and its own view panel (§VIEW-PANEL-PER-PANE, da5a8d97), so
      // "customise which view is in each" has been true since that lane landed. What was
      // missing is that THIS host never said what its split should OPEN as, so it inherited
      // onboarding's 2D-map-left — and reading "no default of mine" as "doesn't occur" is
      // exactly right from where he sits.
      //
      // ⛔ NOT a changed default: onboarding's opening is unchanged and must be, because the
      // 2D map on its left is the surface its guided flow makes you draw the plot on. Two
      // hosts, two declared openings, one algebra (`paneLayoutForPreset`).
      splitLayout: 'parcel-law',
    });

    // ── 2. The note: the questions, in the order the persona asks them. ───────────
    const note = document.createElement('p');
    note.className = 'anl-parcel-law-note';
    note.setAttribute('data-testid', PARCEL_LAW_NOTE_TESTID);
    note.style.cssText = 'margin:0 0 4px;font-size:10px;line-height:1.5;color:#8a83a0;';
    note.textContent = PARCEL_LAW_NOTE; // textContent — no HTML sink in this file (C08 §3.1)
    root.appendChild(note);

    // ══════════════════════════════════════════════════════════════════════════
    // ⭐ §PL-IA-Q (STR §26.3, L-12998) — THE LADDER. THIS IS THE WHOLE OF DELIVERABLE 2.
    // ══════════════════════════════════════════════════════════════════════════
    // Founder 2026-09-06: *"honestly a lot is done — i can see most of the pieces working and i
    // am impressed — is just that is not well organize."*
    //
    // ⛔ NOT ONE NEW FIGURE IS ADDED BELOW, AND NOT ONE IS REMOVED. Every producer this tab
    // mounted before it still mounts, with the same deps, the same subscriptions and the same
    // refusal sentences. What changed is the ORDER and the WEIGHT: the flat stack of peer-level
    // sections becomes groups named after the questions §26.3 states — six at mint, seven since
    // the programme became its own question 4 — and each group is
    // a `<details>` whose COLLAPSED summary still carries the headline AND its confidence
    // (C58 §1.2 — a disclosure that hides whether a figure is solved, estimated or an
    // unreviewed suggestion has broken the contract even though it deleted nothing).
    const ladder = document.createElement('div');
    ladder.className = 'anl-parcel-law-ladder';
    ladder.setAttribute('data-testid', PARCEL_LAW_LADDER_TESTID);
    root.appendChild(ladder);
    for (const spec of PARCEL_LAW_QUESTION_GROUPS) {
      const g = buildQuestionGroup(spec);
      groups.set(spec.id, g);
      ladder.appendChild(g.element);
    }
    const bodyOf = (id: string): HTMLElement => {
      const g = groups.get(id);
      // A missing group can only mean the spec table lost a row, and losing a section silently is
      // the failure mode this lane exists to avoid — so fall back to the ladder itself, where the
      // reader still sees the section, rather than dropping it on the floor.
      return g ? g.body : ladder;
    };

    // ── Q1 · "What is this plot?" — ⭐ ONE BLOCK, ONE TYPOGRAPHY, BOTH AREAS ────────
    //
    // §ONE-PARCEL-BLOCK (L-13005). Founder 2026-09-06, red-boxing the second of two: *"the data
    // of the parcel is incorrect format."* This question used to render the parcel TWICE — the
    // cadastral card, then immediately a right-aligned figure list also headed PARCEL, carrying
    // an area of its own. The §26 lane named the duplication and left it for *"a host-arbiter
    // decision, not a lane"*; the founder has now made it.
    //
    // ⭐ THE RESULT IS A MERGE AND A RE-TYPESETTING, NOT A DELETION. `Ref · Addr ·
    // Area (registry) · Area (from ring) · Perimeter · Bounding box · Boundary edges ·
    // Zone pack · Match · Source · Licence · Retrieved` are all in ONE card now. The two areas
    // SURVIVE and stay labelled with their bases — 801 m² is what the cadastre publishes and
    // 803 m² is a shoelace over the ring it published, and collapsing them would be the C57
    // §1.9 / §2.4 attribution loss this merge was forbidden to cause.
    //
    // ⛔ THE MEASUREMENTS TRAVEL TO THE CARD, NOT THE IDENTITY TO THE FACT RENDERER, and the
    // direction is forced: `parcelCard.ts` is the ONE producer of the cadastral card (C06 §13.3,
    // with a legal consequence attached to a second one), so re-rendering Ref / Addr / the areas
    // inside the analysis fact renderer would have minted exactly the rival this repo has twice
    // paid for. `parcelRingMeasuredFacts` projects the model's geometry onto the card's row
    // shape; the card typesets it. One producer each, no rival.
    const panelSlot = document.createElement('div');
    panelSlot.className = 'anl-parcel-law-panel';
    panelSlot.setAttribute('data-testid', PARCEL_LAW_PANEL_SLOT_TESTID);
    bodyOf('plot').appendChild(panelSlot);
    // The pointer that replaces the map button once a plot IS committed. Created BEFORE the panel,
    // because the extras thunk below hands this very node to the card's disclosure and the thunk
    // runs during `buildParcelPanel` — a note created afterwards would miss the first render.
    plotRouteNote = document.createElement('p');
    plotRouteNote.className = 'anl-parcel-law-note';
    plotRouteNote.setAttribute('data-testid', PARCEL_LAW_PLOT_ROUTE_TESTID);
    plotRouteNote.style.cssText = 'margin:4px 0 0;font-size:10px;line-height:1.5;color:#8a83a0;';
    // textContent — no HTML sink in this file (C08 §3.1)
    plotRouteNote.textContent = PARCEL_LAW_PLOT_ROUTE_NOTE;
    plotRouteNote.hidden = true;

    panel = deps.buildParcelPanel(deps.runtime, {
      // ⚠ A THUNK, READ ON EVERY CARD RENDER — never a snapshot taken here. The card re-renders
      // on its own site-store notification, and a captured array would leave the measured rows
      // frozen while the identity rows beside them refreshed: one block showing two vintages of
      // one parcel, which is a worse defect than the two blocks this merge removed.
      //
      // ⛔ NOT A SECOND DERIVATION. It calls the SAME `readParcelLawModel` this tab's
      // `renderFacts` calls, on the same inputs — one reader, read twice, never two readers
      // (§25.11 clause 1). A fresh read rather than a cached one because the two subscriptions
      // fire in an order nothing guarantees, and a stale measurement is exactly the failure.
      extraFacts: () => {
        try {
          const measured = parcelRingMeasuredFacts(readModelNow());
          if (!measured) return null;
          // ── §STAGE-01-DENSITY (C115 §1.4 C115-111 / C115-152) ─────────────────────────────
          //
          // Founder 2026-09-07: section ① is too tall. C115-111 had already prescribed the
          // answer and recorded it as unbuilt — the technical detail sits behind *"View full
          // parcel data"* — and C115-95 states the rule the build has to honour: this is
          // progressive disclosure, NOT data removal, and nothing shrinks on the way.
          //
          // ⭐ ONE PRIMITIVE, NOT A SIXTH. The `<details>` is produced by the ONE card producer
          // and its open state is remembered by the SAME session map the question groups
          // use, through the accessor `parcelLawQuestionGroup.ts` exports for exactly this
          // (C115-90 / C115-91; the shape `envelopeCardFoldIsOpen` established for the card's
          // string-built folds). The card holds no state of its own — it is handed `open` and
          // reports the toggle back — so a fold cannot snap shut on a store notification.
          //
          // ⛔ AND THE ROUTE SENTENCE GOES WITH IT. `PARCEL_LAW_PLOT_ROUTE_NOTE` is the largest
          // single block of prose in this section (~5 wrapped lines) and it is a POINTER, not a
          // control: the route it names lives on the view, and §4.4 clause 4 protects the
          // section that carries *the only route*, which this is not — the map button itself
          // still renders, unfolded, on both parcel-less arms. The node is MOVED, never copied,
          // so `renderFacts` keeps toggling the one element and no second sentence can drift.
          return {
            ...measured,
            detailFold: {
              testId: PARCEL_LAW_DETAIL_FOLD_TESTID,
              summary: PARCEL_LAW_DETAIL_FOLD_SUMMARY,
              contents: PARCEL_LAW_DETAIL_FOLD_CONTENTS,
              open: questionGroupFoldIsOpen(PARCEL_LAW_DETAIL_FOLD_TESTID, false),
              onToggle: (open: boolean) => setQuestionGroupFoldOpen(PARCEL_LAW_DETAIL_FOLD_TESTID, open),
              hostNodes: plotRouteNote ? [plotRouteNote] : [],
            },
          };
        } catch (e) {
          console.warn('[analysis][parcel-law] ring-measurement projection failed (non-fatal):', e);
          return null;
        }
      },
      // ── §SELECT-PARCEL-IS-A-VIEW-ACTION (L-13004) ─────────────────────────────────────
      //
      // Founder 2026-09-06, red arrow on the full-width purple button inside question 1:
      // *"once i select a parcel — even if it has a real constructed envelope — WE DON'T NEED
      // 'Select parcel on the 2D map' in the analysis parcel law tab. THIS SHOULD BE ON THE
      // LEFT HAND SIDE."* He is right on the principle and this tab's own lede already commits
      // to it — *"nothing on this tab is computed here"* — so a PRIMARY ACTION in a read-out
      // panel contradicts the panel's stated role.
      //
      // ⭐ READ THE FIRST THREE WORDS: **"ONCE I SELECT A PARCEL"**. That is the condition, and
      // honouring it exactly is what makes this change safe. In the committed state the button
      // is redundant chrome over a plot he already has. In the two ABSENT states it is the ONLY
      // route to a parcel at all — §L-1585 exists because he asked for it, §L-942 is the rule
      // that a refusal must carry its escape hatch, and `parcelProvenanceRehost.test.ts` pins
      // the button on both of those arms by name.
      //
      // ⛔ SO THE ROUTE IS NOT REMOVED — C19 §5.6 clause 4, a route is added, never removed.
      // Three routes to parcel selection remain in every state (the PARCEL rail panel, the GIS
      // panel section, and the view's own 2D-map entry); what is removed is ONE redundant COPY
      // from the one surface the founder pointed at, in the one state where it is redundant.
      // When the view side gains its own control this arm becomes unconditional; until then a
      // panel that dropped the affordance on a parcel-less project would be the L-942 shape
      // wearing a founder quote.
      actions: (host) =>
        plotIsCommitted() ? [] : [buildOpenMapAction(host)],
    });
    panelSlot.appendChild(panel.element);
    // ⛔ NEVER INTO `panelSlot`. That slot holds the producer's element and nothing else —
    // `parcelLawTab.spec.ts` ARM A asserts its text is exactly the panel's, which is the
    // assertion that keeps a host from smuggling its own chrome into a producer's slot. The
    // sentence is the TAB's: it lives inside the card's *"View full parcel data"* disclosure when
    // the card built one, and directly in question 1's body when it did not. `placeRouteNote`
    // below owns that decision and re-asserts it after every render.
    placeRouteNote();

    // ── ⭐ SHOW ON THE PLOT — §PLOT-DISPLAY-CONTROLS-HOST (C115 §1.4 C115-151) ──────────────
    //
    // Founder 2026-09-07: these two switches belong in section ①. They were never in this tab at
    // all — they are string-concatenated into the singleton buildable-envelope card, which this
    // tab re-parents into QUESTION 2, so what he was looking at was a Stage-02 control and what
    // he asked for was a Stage-01 one.
    //
    // ⭐ IT IS THE SAME CONTROL AND THE SAME AUTHORITY, MOVED — not a second one. The markup is
    // the ONE producer's (`buildEnvelopeAxesControlEl` parses `buildEnvelopeAxesControlHtml`), the
    // writes are the ONE authority's setters — the very pair `GISAreaLayout` calls — and while
    // this slot is claimed the card renders none, so there is exactly one pair of switches on the
    // panel. Two would have been worse than the placement complaint: the card does not subscribe
    // to the authority, so its copy would have gone on reading ON after a write made here.
    plotDisplaySlot = document.createElement('div');
    plotDisplaySlot.className = 'anl-parcel-law-plot-display';
    plotDisplaySlot.setAttribute('data-testid', PARCEL_LAW_PLOT_DISPLAY_TESTID);
    bodyOf('plot').appendChild(plotDisplaySlot);
    renderPlotDisplay();
    // ⛔ THE CLAIM IS NOT MADE HERE, AND THE REASON IS THE SELF-HEALING RULE ITSELF. This body is
    // still DETACHED at this point — `host.appendChild(root)` is several sections below — and a
    // claim held by an element that is not in the document is, by that rule, not a claim: the
    // very next `plotDisplayControlsClaimed()` would drop it and nothing would re-make it. So the
    // claim is taken at the bottom of this build, immediately after the body is in the DOM and
    // BEFORE the microtask on which the envelope card's own claim lands — which is what makes the
    // card's FIRST render already see the job as taken, with no flash of a second control.
    // The authority notifies on every write from every surface, so the switches here can never
    // show a state a viewport disagrees with — the subscription the envelope card never had.
    unsubPlotDisplay = subscribeBuildableEnvelopeVisibility(() => {
      if (disposed) return;
      renderPlotDisplay();
    });
    // §ONE-PARCEL-BLOCK — this slot now carries only what a CARD ROW cannot say: the sentence
    // for a ring that could not be read. When the ring reads, the rendering is empty and stamps
    // `data-parcel-rows-merged-into="card"`, so "the rows moved" is distinguishable from "the
    // rows are gone" — opposite facts that an empty element alone would conflate.
    bodyOf('plot').appendChild(factsPlotSlot);

    // ── Q2 · "What may I build here — and who says so?" ─────────────────────────
    //
    // ⭐ THE ENVELOPE CARD MOVES HERE — AS A SLOT, NOT AS A SECOND BUILD. `buildParcelRailPanel`
    // still owns its envelope slot, still claims the singleton into it through
    // `window.pryzmMountEnvelopeCard`, still re-claims on every site-store notification while
    // that slot is CONNECTED, and still prints one of five named sentences when the card is
    // absent. All this tab does is re-parent that slot into the question it answers — the same
    // move §L-412 makes with the ONE Cesium container. Nothing about C19 §5.7's singleton
    // discipline changes, because the card's parent is still that one envelope slot.
    //
    // ⛔ The slot stays inside THIS body, so `holdsEnvelopeCard()` and the conditional hand-back
    // on dispose keep working exactly as this file's header describes them.
    const envelopeSlot = panel.envelopeSlot;
    if (envelopeSlot) bodyOf('law').appendChild(envelopeSlot);
    bodyOf('law').appendChild(factsLawSlot);

    // ════════════════════════════════════════════════════════════════════════════════════════
    // ⭐⭐ §ENVELOPE-CREATION-IS-A-STAGE-02-VERB (L-13202) — THE CREATE BLOCK MOVES INTO QUESTION 2
    // ════════════════════════════════════════════════════════════════════════════════════════
    // §PL-ENVELOPE-AUTHORING (STR §25.2 / §25.6) — the ONE create verb C114 §6a declares, the
    // storey count, and the per-storey `Edit perimeter` controls.
    //
    // ⭐ THE FOUNDER RULED THIS, TWICE, ON 2026-09-07. Over a shot of this block inside question 3:
    // *"REVIEW THIS SECTION — THIS HAS BEEN DONE ALREADY ON SECTION 2 — AND KEEP THE SECTION 02
    // INTACT AFTER HAVING CREATED THE MASSING ENVELOPE."* And over a shot of question 3 holding
    // only the ledger: *"SECTION 3 SHALL HAVE ONLY THIS SCOPE."*
    //
    // ⛔ THIS OVERRIDES THE READING C115 §1's STAGE TABLE INVITES, AND THE CONTRACT WAS AMENDED
    // RATHER THAN QUIETLY DISOBEYED. §1 puts *"draw your own · drag/edit the envelope · add/remove
    // levels"* under Stage 03, on which reading origination would belong here. `C115-12`'s
    // canonical-home table now carries the ruling with its reasoning (C115 §2.2, §6) so nobody
    // re-opens it: **question 2 is where you ACT on the parcel; question 3 READS what you declared
    // against what you are allowed.**
    //
    // ⭐ AND THE COMPLAINT WAS STRUCTURAL, NOT AESTHETIC — two measurements, either of which alone
    // settles it:
    //   1. Question 2's *"Create it myself"* sends the user to DRAW on the view
    //      (`massingAuthoredOptionSection.ts` → `window.pryzmOpenSiteEnvelopeTool`), and the ONLY
    //      control that consumes the drawn ring — and the ONLY *Discard the drawn perimeter* —
    //      was in question 3. A gesture BEGUN in 2 could only be FINISHED in 3.
    //   2. `data-stage-control="massing"` is set on three envelope-card elements and on NOTHING in
    //      this block, so the design-stage strip's own "do this next" pill already jumped into
    //      question 2 and could never reach `Create envelope`.
    //
    // ⛔ IT IS A RE-PARENT, NOT A REBUILD. One `mountParcelLawEnvelopeAuthoring`, one subscription
    // set, one plan producer, every testid unchanged — `parcelLawChat.ts` drives both creation
    // routes BY TESTID (PR-H-03), so relocating is safe and renaming would break it silently.
    const authoringSlot = document.createElement('div');
    authoringSlot.className = 'anl-parcel-law-authoring-host';
    authoringSlot.setAttribute('data-testid', PARCEL_LAW_AUTHORING_HOST_TESTID);
    bodyOf('law').appendChild(authoringSlot);

    // ── Q3 · "What do I want to build?" ─────────────────────────────────────
    //
    // ⛔ §C115-17 — THE RELOCATION STAMP AND ITS SENTENCE. A control that disappears with no
    // pointer has moved the reader's problem, not solved it (the rule this file already applies to
    // the *Select parcel on the 2D map* button). The stamp is for a spec; the sentence is for the
    // founder; neither substitutes for the other.
    //
    // ⛔ AND IT IS NOT A GATE. `C115-130` forbids Stage 02 gating Stage 03: this question renders
    // its ledger's own §4.1 states whether or not an envelope exists, and a null envelope is a
    // state to render, not a branch to skip (C58 §1.20). The note below is additive.
    const authoringMovedNote = document.createElement('p');
    authoringMovedNote.className = 'anl-parcel-law-note';
    authoringMovedNote.setAttribute('data-testid', PARCEL_LAW_AUTHORING_MOVED_TESTID);
    authoringMovedNote.setAttribute(PARCEL_LAW_RELOCATED_TO_ATTR, 'law');
    authoringMovedNote.style.cssText =
      'margin:2px 0 6px;font-size:10px;line-height:1.5;color:#8a83a0;';
    // textContent — no HTML sink in this file (C08 §3.1)
    authoringMovedNote.textContent = PARCEL_LAW_AUTHORING_MOVED_NOTE;
    bodyOf('intent').appendChild(authoringMovedNote);

    // §26.6 rule 3 / §26.6.3 — 3.1 levels and heights · 3.2 areas, each BESIDE its ceiling,
    // directly after the control that declares them. ⛔ Nothing here is derived: the intent is
    // `collectIntendedAreas`, the ceilings are the ONE model, the refusal is the ONE sentence.
    const intentSlot = document.createElement('div');
    intentSlot.className = 'anl-parcel-law-intent-host';
    intentSlot.setAttribute('data-testid', PARCEL_LAW_INTENT_HOST_TESTID);
    bodyOf('intent').appendChild(intentSlot);

    // ── Q4 · "What can I fit inside it?" ──────────────────────────────────────
    //
    // §PL-ROOM-PROGRAMME (L-13024 clause 3, STR §25.5) — the ROOM PROGRAMME.
    // §STAGE-05-SECTION (C115 §8.1 `C115-170`, L-13176) — and it is now its OWN question.
    //
    // ⭐ IT WAS IN QUESTION 3 AND IT IS NOW QUESTION 4 — a SPLIT, not a move between panels.
    // Founder 2026-09-07: *"THE ROOMS SHOULD BE THE NEW SECTION 4."* `C115-06` requires exactly
    // this shape (*"the refactor MUST SPLIT group 3, not build two groups from nothing"*), and
    // `C115-07` says stage 05 must not be orphaned by the split — question 4 is the question it
    // acquires. The slot moves one parent; the panel instance, its producers, its subscriptions
    // and every sentence in it are untouched.
    //
    // ⭐ THE ORDERING CLAIM SURVIVES THE MOVE. Q4 is *"What can I fit inside it?"* and Q7 is
    // *"Take me into BIM."*; the founder asked for the programme to be usable *"beforehand — to
    // add rooms beforehand"* rather than generating a house and then correcting it. Declaring
    // rooms still comes THREE questions before Create house — the §25.5 contract that *"the graph
    // drives the initial layout generation"*, in the ladder's own order.
    //
    // ⛔ IT IS THE ONE INSTANCE, MOVED. The rail's PROGRAMME section used to mount it and no
    // longer does. Two live mounts would share one session model and still be two rival
    // surfaces for one job — the rule this session has already applied to the Cesium viewer,
    // the MapLibre map, the basemap and the view switcher.
    //
    // ⭐ AND IT IS THE HONEST ANSWER TO L-13023. A programme the USER declared cannot be
    // inflated by an enricher: §BRIEF-IS-AUTHORITATIVE stops the generator inventing rooms,
    // and this puts the user's own declaration in front of the generator in the first place.
    const roomProgrammeSlot = document.createElement('div');
    roomProgrammeSlot.className = 'anl-parcel-law-room-programme-host';
    roomProgrammeSlot.setAttribute('data-testid', PARCEL_LAW_ROOM_PROGRAMME_HOST_TESTID);
    bodyOf('rooms').appendChild(roomProgrammeSlot);

    // ── Q5 · "How much of my allowance have I used?" ───────────────────────────
    //
    // ⭐ THE LEDGER LEAVES THE AUTHORING SECTION AND BECOMES ITS OWN ANSWER.
    // `buildBrutAllocationHtml` is headed *"How much of the allowance have you used?"* — which is
    // §26.3 item 4 almost verbatim — and it sat six rows below a Create button because ONE MOUNT
    // produced both. It is placed here, and the live quantities that measure what has actually
    // been drawn are placed with it.
    //
    // ⛔ ONE MOUNT, ONE SUBSCRIPTION, ONE ARITHMETIC. Both halves are still produced by the single
    // `mountParcelLawEnvelopeAuthoring` / `mountParcelLawQuantities` pass below, so the ledger and
    // the create controls cannot show different vintages of one envelope.
    const allowanceSlot = document.createElement('div');
    allowanceSlot.className = 'anl-parcel-law-allowance-host';
    allowanceSlot.setAttribute('data-testid', PARCEL_LAW_ALLOWANCE_HOST_TESTID);
    bodyOf('allowance').appendChild(allowanceSlot);

    // §PL-LIVE-QUANTITIES (STR §25.7) — ROOM NAMES · NET · BRUT PER LEVEL · TOTAL.
    //
    // ⭐ ITS OWN LIVE CHANNEL, and that is the point of it. The figures also render on the
    // singleton envelope card, but that card only repaints on a fixed event list carrying NO
    // space-envelope signal — so a face drag or a new room envelope moved the 3D scene and left
    // every number stale. This control subscribes to `Store.subscribeDirty`, the SAME channel
    // `attachSpaceEnvelopeRender` renders from, which covers execute, undo and redo alike.
    // RESI-ORCHESTRATOR-PLAN §3: honour the existing synchronisation contract, do not invent a
    // fourth update path.
    const quantitiesSlot = document.createElement('div');
    quantitiesSlot.className = 'anl-parcel-law-quantities-host';
    quantitiesSlot.setAttribute('data-testid', PARCEL_LAW_QUANTITIES_HOST_TESTID);
    bodyOf('allowance').appendChild(quantitiesSlot);

    // ── Q5 · "What does it cost?" ──────────────────────────────────────────
    // The rate the user supplies — explicitly THEIR assumption, never a published figure, with a
    // currency they choose and PRYZM never infers from a locale (C38 §1.2) — and the estimate it
    // produces, or the estimator's own refusal sentence with its reason on `data-arm`.
    const costSlot = document.createElement('div');
    costSlot.className = 'anl-parcel-law-cost-host';
    costSlot.setAttribute('data-testid', PARCEL_LAW_COST_HOST_TESTID);
    bodyOf('cost').appendChild(costSlot);

    // ── Q6 · "Take me into BIM." ────────────────────────────────────────────
    // §PL-CREATE-HOUSE (STR §25.8). LAST, and that ordering is the founder's own ladder: a user
    // reads the parcel, then the law, then what they intend and what it costs, and only then
    // decides to build it. The control refuses — visibly, with numbers — whenever the level it
    // would build on already carries authored walls (C80: a generator may not destroy what it
    // cannot account for).
    const createHouseSlot = document.createElement('div');
    createHouseSlot.className = 'anl-parcel-law-create-house-host';
    createHouseSlot.setAttribute('data-testid', PARCEL_LAW_CREATE_HOUSE_HOST_TESTID);
    bodyOf('bim').appendChild(createHouseSlot);

    // ── §PL-CHAT (STR §25.4) — "A CHAT BOT ON THE PARCEL LAW PANEL". ──────────────────
    //
    // ⭐ DELIBERATELY OUTSIDE THE NUMBERED LADDER, and this is the one placement §26.3 does not
    // decide for us. The chat answers NONE of the questions by itself — it answers WHICHEVER
    // of them you ask, by typing into the sections above and reading their status lines back.
    // §26.3 says *"any section that answers none of them is in the wrong place or belongs behind a
    // disclosure"*; putting the chat behind a disclosure would hide the only control that spans
    // every question, so it is PINNED below the ladder instead — always reachable, and never
    // competing with a question for the reader's place in the sequence.
    //
    // Founder: *"WE NEED A CHAT BOT ON THE PARCEL LAW PANEL – SO USER CAN CHAT VIA RAC OR DEFINE
    // VIA DATA MANUALLY INPUT."* Both paths are first-class and must AGREE, so the chat does not
    // dispatch: it types into the fields above and presses their buttons, then reads THEIR status
    // lines back as its reply. One plan builder, one dispatcher, one refusal.
    const chatSlot = document.createElement('div');
    chatSlot.className = 'anl-parcel-law-chat-host';
    chatSlot.setAttribute('data-testid', PARCEL_LAW_CHAT_HOST_TESTID);
    root.appendChild(chatSlot);

    host.appendChild(root);
    // ⭐ §PLOT-DISPLAY-CONTROLS-HOST (C115 §1.4 C115-151) — CLAIMED THE INSTANT THE BODY IS IN THE
    // DOM. Held by ELEMENT, so it goes stale on its own the moment this body leaves the document
    // (`plotDisplayControlsClaimed`): a teardown that never reached `dispose()` costs the envelope
    // card ONE render, never the control. Synchronous, and therefore ahead of the microtask the
    // envelope card's own claim is scheduled on — so the card's first render already yields.
    if (plotDisplaySlot) claimPlotDisplayControls(plotDisplaySlot, 'analysis:parcel-law:question-1');
    renderFacts();
    // §26.6 rule 2 — the cadastral card and the plot facts are in the DOM; wire their controls
    // now, and keep every control under this body painted from the ONE store from here on, so a
    // click on the envelope card's fold (wired by GISAreaLayout on ITS root) repaints question 1's
    // ◉ too, and vice versa. Disposed with the tab.
    wireHighlights();
    unsubHighlight = keepSiteHighlightRowsPainted(root);

    // ── The producers, mounted AFTER the body is in the DOM ────────────────────────
    // Every one of these guards its repaints on `isConnected`; mounting after the append is what
    // makes those guards true from the very first store event.
    try {
      const mount = deps.mountQuantities
        ?? ((h: HTMLElement, costHost: HTMLElement) => mountParcelLawQuantities(
          h, defaultParcelLawQuantitiesDeps(), { costHost }));
      quantities = mount(quantitiesSlot, costSlot);
    } catch (e) {
      console.warn('[analysis][parcel-law] live-quantities mount failed (non-fatal):', e);
    }
    try {
      const mountAuth = deps.mountAuthoring
        ?? ((h: HTMLElement, lawCheckHost: HTMLElement) => mountParcelLawEnvelopeAuthoring(
          h, defaultParcelLawEnvelopeAuthoringDeps(), { lawCheckHost }));
      authoring = mountAuth(authoringSlot, allowanceSlot);
    } catch (e) {
      console.warn('[analysis][parcel-law] envelope-authoring mount failed (non-fatal):', e);
    }
    try {
      const mountIntent = deps.mountIntent
        ?? ((h: HTMLElement) => mountParcelLawIntentAgainstCeiling(h, defaultParcelLawIntentDeps()));
      intent = mountIntent(intentSlot);
    } catch (e) {
      console.warn('[analysis][parcel-law] intent-beside-ceiling mount failed (non-fatal):', e);
    }
    try {
      const mountCH = deps.mountCreateHouse
        ?? ((h: HTMLElement) => mountParcelLawCreateHouse(h, defaultParcelLawCreateHouseDeps()));
      createHouse = mountCH(createHouseSlot);
    } catch (e) {
      console.warn('[analysis][parcel-law] create-house mount failed (non-fatal):', e);
    }
    try {
      const mountRP = deps.mountRoomProgramme
        ?? ((h: HTMLElement) => mountRoomProgrammePanel(
          h, defaultRoomProgrammePanelDeps(
            (deps.runtime ?? null) as unknown as RoomProgrammeHostRuntime | null)));
      roomProgramme = mountRP(roomProgrammeSlot);
      // §ROOMS-PER-LEVEL (L-13039) — directly beneath the programme, in the same question: the same
      // rooms, grouped by the storey they sit on. Mounted here, computed nowhere near here.
      try {
        roomsPerLevel = mountRoomsPerLevelSection(roomProgrammeSlot, defaultRoomsPerLevelDeps(deps.runtime ?? null));
      } catch (e) {
        console.warn('[analysis][parcel-law] rooms-per-level mount failed (non-fatal):', e);
      }
    } catch (e) {
      console.warn('[analysis][parcel-law] room-programme mount failed (non-fatal):', e);
    }
    // ⭐ MOUNTED LAST, and scoped to `root`. Last because the controls it drives must already be in
    // the DOM when a turn runs; scoped to this body because pressing a button is a real gesture and
    // a document-wide scope could press one on a surface the reader is not looking at.
    try {
      const mountChat = deps.mountChat
        ?? ((h: HTMLElement, scope: () => ParentNode | null) => mountParcelLawChat(h, defaultParcelLawChatDeps(scope)));
      chat = mountChat(chatSlot, () => root);
    } catch (e) {
      console.warn('[analysis][parcel-law] chat mount failed (non-fatal):', e);
    }
    // The digests mirror what the mounts above have just rendered. Each group also watches its own
    // body from here on, so this is the FIRST reading, never the only one.
    refreshDigests();

    // ── 5. The design-stage strip — after the claim lands (it is scheduled on a microtask). ──
    // §26.6 rule 2 — and the highlight controls the claimed card brought with it, on the same tick.
    queueMicrotask(() => { wireStrip(); wireHighlights(); placeRouteNote(); });
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
          refreshDigests();
          // The cadastral card has ALREADY rebuilt by now (its subscription predates this one), so
          // its fresh controls are wired on this microtask together with the strip.
          queueMicrotask(() => { wireStrip(); wireHighlights(); placeRouteNote(); });
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
      try { intent?.repaint(); } catch { /* same */ }
      try { quantities?.repaint(); } catch { /* same — a section that cannot repaint keeps its last honest render */ }
      try { createHouse?.repaint(); } catch { /* same */ }
      // §PL-ROOM-PROGRAMME — the panel re-reads the project's rooms and the envelope store
      // on refresh, so a house generated while this tab was open shows up on the next repaint.
      try { roomProgramme?.refresh(); } catch { /* same */ }
      try { roomsPerLevel?.refresh(); } catch { /* same */ }
      wireStrip();
      wireHighlights();
      // §PLOT-DISPLAY-CONTROLS-HOST / §STAGE-01-DENSITY — the two pieces of question-1 chrome this
      // tab owns. Re-asserted here for the same reason the strip is: a producer re-render between
      // repaints can have replaced the DOM they hang on.
      // Idempotent for the same element, and the insurance that matters: a body detached and
      // re-attached (a tab switch away and back) would have let its claim go stale, and nothing
      // else would re-take it.
      if (plotDisplaySlot) claimPlotDisplayControls(plotDisplaySlot, 'analysis:parcel-law:question-1');
      renderPlotDisplay();
      placeRouteNote();
      refreshDigests();
    },
    holdsEnvelopeCard,
    dispose(): void {
      if (disposed) return;
      disposed = true;
      const held = holdsEnvelopeCard();
      try { unsub?.(); } catch { /* teardown is best-effort */ }
      unsub = null;
      // ⭐ §PLOT-DISPLAY-CONTROLS-HOST (C115 §1.4 C115-151/C115-153) — RELEASED FIRST, AND BEFORE
      // THE HAND-BACK BELOW. The release notifies the card's host, which re-renders the card with
      // the SHOW ON THE PLOT switches back on it; doing it after the hand-back would re-render the
      // card once with no control on it and leave that state until some later repaint. The
      // release is guarded on identity inside the arbiter, so a tab disposing after another
      // surface has claimed the job cannot evict it (C19 §5.7 clause 2, by its reason).
      try { unsubPlotDisplay?.(); } catch { /* teardown is best-effort */ }
      unsubPlotDisplay = null;
      if (plotDisplaySlot) {
        try { releasePlotDisplayControls(plotDisplaySlot); } catch { /* teardown is best-effort */ }
      }
      plotDisplaySlot = null;
      // §26.6 rule 2 — a highlight listener that outlived this body would repaint a detached tree.
      try { unsubHighlight?.(); } catch { /* teardown is best-effort */ }
      unsubHighlight = null;
      // Before the panel, so the store subscription is released while the DOM it guards on is
      // still attached — a listener that fires against a detached root is harmless but noisy.
      try { authoring?.dispose(); } catch { /* teardown is best-effort */ }
      authoring = null;
      try { quantities?.dispose(); } catch { /* teardown is best-effort */ }
      quantities = null;
      // §26.6 rule 3 — the section holds a dirty-channel subscription; release it with the body.
      try { intent?.dispose(); } catch { /* teardown is best-effort */ }
      intent = null;
      try { chat?.dispose(); } catch { /* teardown is best-effort */ }
      chat = null;
      try { createHouse?.dispose(); } catch { /* teardown is best-effort */ }
      createHouse = null;
      // §PL-ROOM-PROGRAMME — the panel holds a programme subscription and an envelope-store
      // subscription; leaving either connected to a detached body is a listener that outlives
      // the surface that put it up.
      try { roomsPerLevel?.dispose(); } catch { /* teardown is best-effort */ }
      roomsPerLevel = null;
      try { roomProgramme?.dispose(); } catch { /* teardown is best-effort */ }
      roomProgramme = null;
      try { panel?.dispose(); } catch { /* teardown is best-effort */ }
      panel = null;
      // The on-view bar owns the switcher handle, so disposing it disposes both — and it
      // MUST happen here: the bar is body-level chrome, and a tab that vanished while leaving
      // its bar over the canvas is the stranded-chrome failure this body's teardown exists for.
      try { onView?.dispose(); } catch { /* teardown is best-effort */ }
      onView = null;
      // §PL-IA-Q — the groups own MutationObservers on their own bodies; leaving one connected
      // to a detached tree is a listener that outlives the surface that put it up.
      for (const g of groups.values()) {
        try { g.dispose(); } catch { /* teardown is best-effort */ }
      }
      groups.clear();
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
