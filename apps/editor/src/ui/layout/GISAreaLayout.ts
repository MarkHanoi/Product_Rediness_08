import {
    getCesium,
    storeRegistry,
    // §L-676-B (C13 §3.10) — this file owns per-project closure state and had NO
    // lifecycle wiring at all; see the owner block at the end of mountGISArea().
    projectScopeRegistry,
    registerProjectScopeProbe,
    // §RESI-ORCH-COST — the L2 cost engine. The SAME two functions the 5D tab calls, so the
    // envelope card and the Data Workbench cannot state two different €/m² for one building.
    resolveBuildingCostModels,
    estimateBuildingCost,
} from '@pryzm/core-app-model';
import type { CesiumThreeBridge } from '@pryzm/plugin-geospatial';
import type { UIProps } from '../Layout';
// §FIX-UI-LAYERING-ZINDEX-CONTRACT (L-149, C06 §7) — the single z-index source of
// truth + the no-overlap launcher-rail layout policy. Replaces the hand-picked
// `position:absolute … zIndex:'20'`-inside-#container anchoring that buried these
// always-on pills under root-level chrome (toolbar 9000, nav rail 9999).
// §GIS-ACTION-REGISTRY (L-1360) — this file mounted six launcher-rail pills and now
// mounts none of THOSE: the rail policy stays in `zLayers.ts` and the site actions moved
// to the GIS panel. ⚠ L-13001 RE-ADDS EXACTLY ONE, and re-imports the rail helpers for
// it: the SITE-phase split pill, which occupies the same declared slot 0 the canvas
// phase's `#svp-toggle-button` occupies — so it must come from the same slot authority,
// never from a hand-picked `bottom:` (that is the L-159 defect verbatim).
import { zCss, launcherRailStyle, LAUNCHER_PILL_COSMETICS } from './zLayers';
// §UX1-PANEL-DEFAULTS — the ONE table that says which chrome is open on start-up, plus
// the `Reset panel layout` verb. C82 §1.1: a panel closed by default keeps a visible
// route back, and that route is the launcher pill mounted below.
import {
    panelDefaultOpen,
    setPanelOpen,
    isPanelOpen,
    panelAbsent,
    setAppPhase,
    appPhase,
    resetPanelLayout,
    onPanelLayoutReset,
    onAppPhaseChanged,
} from './panelDefaults';
// §UX1-PHASE-CHROME — the one module that turns the phase decision into
// `style.display`. Installed here because `mountGISArea` is on the editor's boot
// path and this file already owns the launcher rail the phase governs.
import { installPhaseChrome } from './phaseChrome';
import { installViewPropertiesLauncher } from './ViewPropertiesLauncher';
import type { PryzmRuntime } from '@pryzm/runtime-composer/types';
// §STARTUP-EAGER-GLOBE (founder 2026-08-10) — the one-shot onboarding→engine-boot seam that asks
// this layout to start the Cesium init in parallel with the rest of the boot, plus the startup
// budget marks the eager path reports on.
// §STARTUP-GLOBE-PREWARM (L-10560) — `consumePrewarmedGlobe` is the ADOPTION half: the viewport
// may already have been constructed + mounted (warm-hidden) by `PlatformRouter.showOnboarding`,
// BEFORE this engine boot began. `null` means "construct it cold", which is the untouched path.
import { consumeEagerGlobeStart, consumePrewarmedGlobe } from '../../engine/eagerGlobeStart';
import { markStartupPhase } from '../../engine/startupBudget';
// L-445 — `getLastBuildableEnvelope` is the FULL envelope incl. the derivation trace (facts
// card only; legitimately null after a reload, and shown as such rather than fabricated).
// `resolveRenderableBuildableEnvelope` is the GEOMETRY read for renderers — it falls back to
// the persisted `Parcel.buildableRing` (C58 §1.7a), so the study volume survives re-entry.
import {
    getCurrentSiteOrigin,
    getLastBuildableEnvelope,
    isLastEnvelopeSuggestedPreview,
    // L-1587 - the RE-DERIVE pair. `_lastEnvelope` is a MODULE-LOCAL written only on parcel
    // commit and never persisted, so after any reload the facts card cannot be built and the
    // GIS panel's slot renders its empty sentence forever. `reapplyZoningForActiveSite` is the
    // safe re-run: it resolves zoning against the ALREADY-COMMITTED boundary and deliberately
    // does NOT touch geometry, so it cannot re-derive/re-apply project north the way a second
    // `dispatchParcelBoundary` would (see its own header).
    reapplyZoningForActiveSite,
    resolveRenderableBuildableEnvelope,
    // §GIS-ENVELOPE-DETERMINATION-PERSIST (L-1654) — the FULL persisted determination (dated).
    // The load-path answer the L-445 reduced card existed to refuse to fabricate: now that the
    // whole record is persisted at commit time, the card can render it — WITH its date.
    resolveStoredBuildableDetermination,
    resolveActiveProjectId,
    resolveSiteContext,
    // §MANUALENV159 (L-12640) — the "type a height for a study massing" action: builds + persists
    // a user-supplied study, reusing the SAME `ContextDerivedStudyEnvelope` schema/status/badge
    // the context-derived study already uses. Deliberately UNGATED — see its own header.
    applyUserSuppliedStudyHeight,
} from '../site/siteDispatch';
// §CONTEXT-DERIVED-STUDY-ENVELOPE (§ENVAMS148) / §MANUALENV159 (L-12640) — the session-only read
// point for the last computed study (derived OR user-supplied — one slot, one card renderer) and
// the project-persisted RAW user-supplied decision (to prefill the entry form on re-open).
import { getContextDerivedStudyEnvelope } from '../site/contextDerivedStudyEnvelopeState';
import { getUserSuppliedStudyHeight } from '../site/userSuppliedStudyHeightState';
// ⭐ §ENVELOPE-ONE-VISIBILITY (L-1170) — the SINGLE authority for "is the buildable envelope
// on screen?". This file used to BE that authority (a `let` nobody else could see) and three
// other surfaces drew the envelope without it. It now only reads + writes.
import {
    isBuildableEnvelopeVisible,
    setBuildableEnvelopeVisible,
    // §ENVELOPE-AXES-CONTROL (L-6910) — the SECOND axis. `envelopeVisibility.ts` has carried
    // it since L-1188 and its header says outright that "a future control has exactly one
    // place to write". This is that control; the authority is unchanged.
    isBuildableEnvelopeFootprintVisible,
    setBuildableEnvelopeFootprintVisible,
    getBuildableEnvelopeAxes,
} from '../site/envelopeVisibility';
// §ENVELOPE-AXES-CONTROL (L-6910..L-6916) — the two-switch control, extracted PURE so all four
// axis combinations are pinned by a spec instead of asserted in a comment. It renders the axes
// it is handed and writes nothing itself; the authority above owns the write.
import {
    buildEnvelopeAxesControlHtml,
    wireEnvelopeAxesControl,
    ENVELOPE_AXES_DRAG_EXCLUDE,
} from '../site/envelopeVisibilityControl';

/** §L-676-B — scope name + audit-probe key for this file's per-project closure state. */
const GIS_LAYOUT_SCOPE = 'gis.areaLayout';

// ── ADR-0298 §2 (amended) — MODULE-SCOPE PRESENCE via a delegate ─────────────
//
// The C13 owner + audit probe used to be registered as the LAST statement of
// `mountGISArea()` — a ~4500-line function. Any earlier `return` or throw skipped
// the registration while the closure state (`lastGeocodeFrame`, the placement
// caches) stayed live and kept driving the returned callbacks. Absence therefore
// meant either "the GIS area was never mounted" (clean) or "it was mounted and
// registration was skipped" (the L-694a leak, unowned again) — the same value.
//
// The owner of this state is the MODULE. It registers once, HERE, at import time,
// and delegates to whatever `mountGISArea` most recently installed. A `null`
// delegate is an EARNED "I hold nothing": the module is loaded, it was asked, and no
// layout has been mounted. Hoisting the closure state itself out of `mountGISArea`
// would be the deeper fix and is a much larger change to a live file; the delegate
// gets the PRESENCE guarantee without touching a line of the layout's behaviour.
interface GisLayoutScopeDelegate {
    clear(): void;
    owningProjectId(): string | null;
    describe(): Record<string, unknown>;
}
let _gisLayoutDelegate: GisLayoutScopeDelegate | null = null;

projectScopeRegistry.register({
    scopeName: GIS_LAYOUT_SCOPE,
    // No delegate ⇒ no mounted layout ⇒ nothing to clear. Not an error.
    clear: () => { _gisLayoutDelegate?.clear(); },
});
registerProjectScopeProbe({
    scope: GIS_LAYOUT_SCOPE,
    owningProjectId: () => _gisLayoutDelegate?.owningProjectId() ?? null,
    describe: () => (
        _gisLayoutDelegate?.describe() ?? { mounted: false }
    ),
});
// §SEAM-2 INCREMENT 2 (L-604 / C12 §1.5) — the SINGLE origin authority shared by the parcel-ring
// projection (`getSiteOrigin`) and the 3D-Site render frame (`getFormaOrigin`), so the ring and the
// ENU frame are always built about ONE origin (closes the residual translation shift).
// §PARCEL-LAW-UNRESOLVED (STR §25.1 block B) — the WORDS a citation slot carries, decided by a
// pure module so both honest arms ("we never looked" vs "a figure with no source") are pinned by a
// test. This file keeps the markup and the §L-402-XSS escaping, which must have exactly one home.
import {
    citationFoldHasContent,
    describeCitationFoldCaveats,
    describeCitationSlot,
    describeUnresolvedSlot,
} from '../site/complianceCitationSlots';
import { resolveSiteFrameOrigin } from '../site/boundaryProjection';
import { resolveSiteFramingExtent } from '../site/siteFramingExtent';
// §PARCEL-SELECT (L-380 P1 → L-613) — the real cadastral parcel data source for the map's
// "Select parcel" mode. `defaultParcelProvider` is now the PER-JURISDICTION REGISTRY
// (`parcelRegistry.ts`): a click routes to the right OPEN national cadastre — Catastro (ES),
// IGN (FR), PDOK (NL), Kartverket (NO), ALKIS-NRW (DE-NW) — and to an honest OSM building
// FOOTPRINT everywhere else (labelled `footprint (OSM)`, never a legal parcel; C58 §1.4). So the
// select mode fetches REAL geometry globally, with Spain-parity "click to select" in every country;
// adding a country is a data addition in `@pryzm/site-parcel-data`, not an edit to this L5 file.
import { defaultParcelProvider } from '../site/parcel';
// §GR-10/GR-14 — "nobody classified the edges" ≠ "no edge is street frontage".
import {
    parcelEdgeClassificationsOrUnknown,
    frontageClause,
} from '../site/parcelEdgeClassificationDetermination';
import { makeDraggable } from '../makeDraggable';
// FORMA.6 — pure geometry signature for the real-building GLB re-export cache.
// §VIEW-PANEL-PER-PANE — TYPE ONLY. The module itself stays lazy-imported below (it pulls
// the MapLibre chunk); a `import type` is erased at build time and adds nothing to the bundle.
import type { SiteBoundaryMap2DHandle } from '../geospatial/SiteBoundaryMap2D';
import { buildingGeometrySignature } from '../geospatial/formaBuildingFidelity';
// §MASSING-FOLLOWS-THE-ARC (L-11172) — the pure wall-record → massing-wall mapper (curve-aware).
import { formaWallFromRecord, type FormaMassingWall, type FormaWallRecordLike } from '../geospatial/formaWallCurve';
// §FIX-GISLAYOUT-PLACE-REAL-MODEL-FORMA-AND-GLOBE-REENTRY (L-193) — PURE view-switch
// decision helpers (no Cesium/DOM/THREE): the Forma real-model cache reuse decision +
// its invalidation when the photoreal globe destroys the Forma primitive (Symptom A),
// and the toggleGIS re-activation branch action (Symptom B).
import {
    decideGlobeReactivationAction,
    decideFormaRealPlacement,
    invalidateFormaRealCacheOnPhotorealGlobeEntry,
} from '../geospatial/globePlacementDecisions';
// §FEAT-PLAN-VIEW-GIS (L-104, ADR-0115) — the PLAN-VIEW analogue of the 3D site view:
// composite the real-world GIS/aerial context (buildSiteGisContextRaster) as a plan-canvas
// underlay BENEATH the authored building via the EXISTING L-71 underlay pipeline
// (createPlanCanvasUnderlayFromSiteOverlay), rotated onto PROJECT NORTH by θ
// (computeGisContextUnderlayRotationZ). No new engine / no parallel projector.
import { buildSiteGisContextRaster } from '../../engine/buildSiteGisContextRaster';
import { createPlanCanvasUnderlayFromSiteOverlay } from '../../engine/createSiteOverlayUnderlay';
import { computeGisContextUnderlayRotationZ } from '../site/overlay/siteGisContextGeometry';
// §FEAT-VIEW-ACTIVATION-LOADING-OVERLAY (L-270) — the "3D globe" / "3D Site" activations are
// now PRODUCERS of the SAME loading overlay the batch coordinator uses (one overlay, N
// producers — LoadingOverlayController). The overlay dismisses on the REAL readiness chain
// (viewer → tiles → content placed → L-259 ground seat-and-reveal), gates scene input until
// then, and fails visibly (never hangs) if a signal never arrives.
import { beginViewActivationLoading, containViewActivation, type ViewActivationHandle, type ViewActivationTarget } from '../geospatial/viewActivationLoading';
import { getLoadingOverlay } from '../overlays/LoadingOverlayController';
// §FEAT-MULTI-PANE-VIEW-SYSTEM (L-412, C59 Phase 1b) — the renderer-agnostic pane
// host: the site-authoring default lands the 2D map (LEFT) + the live 3D Site (RIGHT)
// through the pure `assignViewToPane` model, NOT a hard-coded toggle. The single
// Cesium viewer is RE-TARGETED into the right pane element (never cloned).
import { mountSiteAuthoringPaneShell, type SiteAuthoringPaneShell } from '../../engine/views/SiteAuthoringPaneShell';
import {
    paneLayoutForPreset,
    RIGHT_PANE,
    type PaneLayoutPreset,
} from '../../engine/views/paneViewModel';
// §PANE-PLACEMENT-AFTER-MODE-SWITCH (L-12988) — the deferred subscription helper. Used here
// rather than a bare `runtime?.events?.on(...)` because the LIVE boot path constructs this
// layout with `runtime === null` (`createMainLayout(props, null)` in initUI.ts), which is the
// same seam `resolveLiveUpdateEventBus` exists for: a direct subscription would silently
// no-op and the placement pass would never run in production while passing in a spec.
import { onRuntimeEvent } from '../../engine/runtimeEventBridge';
import type { PaneRendererMounter } from '../../engine/views/PaneHost';
import {
    createSvpPlanPaneMounter,
    type SplitViewManagerLike,
} from '../../engine/views/svpPlanPaneMounter';
// §L-412 (C59) — PURE decision: should a paned 3D-Site live-update FRAME the plot
// (first parcel commit) or re-render in place (no re-fly)? Keeps the no-jitter
// guarantee unit-testable without a live Cesium viewer.
import {
    shouldFramePanedSiteOnUpdate,
    shouldMountSiteAuthoringSplit,
    shouldMountSiteSplitLauncher,
    describeSplitToggle,
    isSiteCommittedInModel,
    ringCentroidXZ,
    resolveLiveUpdateEventBus,
    type LiveUpdateEventBus,
    type SiteStoreHolder,
} from '../../engine/views/siteAuthoringPaneDecisions';
// L-402 — the PURE explain-why report model (C58 §1.3 derivation → presentable rows).
import {
    buildComplianceReport,
    // STRUCTURAL-SEAM-3 (C58 §5.4) — the pure L2 authority for the HEADLINE confidence chip: it
    // resolves to the WEAKEST per-field provenance, so the header can never out-rank its own rows,
    // and it flags the L-630 NL case (real published fields under an `estimated-ruleset` scalar
    // reduced for a zone-extent footprint, NOT a default pack).
    resolveHeadlineProvenance,
    // §PARCEL-LAW-MODEL — BCN_ART323_DWELLING_MODULE_M2 is imported by `parcelLawModel.ts` now:
    // the Art. 323 module and the ⌈GFA ÷ module⌉ count are ONE derivation, not one here and one
    // there. This file renders `law.capacity`.
    // C58 §1.14 / STRUCTURAL-SEAM-1 — the pure L2 function that turns a WHOLE `BuildableEnvelope`
    // into the solids the 3D massing draws. `resolveFormaEnvelope` no longer narrows the envelope to
    // four fields; it passes the full contract here so no honesty field is discarded at the render.
    envelopeToMassing,
    type MassingSolid,
    type BuildableEnvelopeMassingInput,
    // L-456 — the pure L2 capacity comparison (designed vs permitted). It judges; it measures
    // nothing and renders nothing. See the §L-456 block in `refreshEnvelopePanel`.
    buildCapacityComparison,
    // §PARCEL-LAW-UNRESOLVED (STR §25.1 block B) — the promised-but-unfilled citation slots. The
    // MODEL decides which rows the card owes a citation to and why each is empty; this file only
    // renders that decision, so the two arms ("we never looked" vs "a number with no source") are
    // pinned by a pure test rather than by an `if` written at the render site.
    type ComplianceUnresolvedRow,
} from '@pryzm/site-parcel-data';
// §PARCEL-LAW-MODEL (STR-RESIDENTIAL-DESIGN-ORCHESTRATOR §25.11 clause 1) — the ONE
// parcel/ordinance/massing/per-storey model. This card RENDERS it; it no longer derives it, so
// the Parcel Law tab can state the same figures without a second computation. See the module
// header for what was actually shared before this and what was not.
import {
    buildParcelLawModel,
    permittedStudyFiguresOf,
    polygonBboxXZ,
    polygonPerimeterXZ,
    resolveDepthTerm,
} from '../site/parcel/parcelLawModel.js';
import { polygonAreaXZ } from '../site/siteInspectorData.js';
// L-456 — the L5 halves of the comparison: the authored-model MEASUREMENT adapter and the pure
// section RENDERER. Both live beside the envelope they are compared against (see the layering
// argument at the head of `designMeasurement.ts`).
import { collectAuthoredModelSnapshot, measureAuthoredDesign } from '../site/designMeasurement';
// §GIS-ENVELOPE-FULL-SECTIONS (L-1650..L-1653) — the card's rich sections as FIRST-CLASS,
// default-collapsed folds (Designed vs permitted · How these were measured), extracted pure so
// every arm of every state is pinned by envelopeCardSections.spec.ts instead of asserted in a
// comment. They wrap `buildCapacitySectionHtml` — ONE producer (C06 §13.3), not a rival.
import {
    buildDesignedVsPermittedFold,
    buildHowMeasuredFold,
    // §RESI-ORCH-PERLEVEL (STR §13/§14) — the per-storey built-area fold. The plates were already
    // summed storey by storey inside `measureAuthoredDesign`; only the TOTAL used to survive.
    buildPerLevelBuiltAreaFold,
    // §RESI-ORCH-DESIGN-STAGE (STR §1/§19/§21) — "where am I, and what can I do from here?" on the
    // far side of the parcel hand-off. Rendered on BOTH card arms: a refusal card is a place a user
    // can be just as much as a determination is, and it is the arm where "what now?" is loudest.
    buildDesignStageStripHtml,
    // §GIS-LEGACY-DETERMINATION-ESCAPE (L-1970..L-1974) — the REDUCED card's notice AND its
    // escape hatch. The reduced card was honest and unactionable; this carries the route out.
    buildLegacyDeterminationNoticeHtml,
    LEGACY_NOTICE_TESTID,
    LEGACY_RECOMPUTE_BTN_TESTID,
    // §OLDPROJ168 (L-12780..) — the "Stored determination" notice's OWN refresh escape hatch,
    // shared by the refusal-card AND the full-determination templates below (C06 §13.3 — ONE
    // producer). See `envelopeCardSections.ts`'s own header for why this is an EXPLICIT button
    // rather than an automatic re-derive on load.
    buildStoredDeterminationNoticeHtml,
    STORED_DETERMINATION_TESTID,
    REFRESH_DETERMINATION_BTN_TESTID,
    // §BCN-OV-CITATION (L-1656) — which article a `block-constructed` envelope cites,
    // decided by the engine's own derivation row rather than a hard-coded string.
    resolveBlockConstructedSourceText,
    // §MANUALENV159 (L-12640) — the context-derived/user-supplied study massing section + its
    // entry form. See `envelopeCardSections.ts`'s own header for why one renderer serves both
    // source arms.
    buildContextStudySectionHtml,
    buildStudyHeightEntryHtml,
    STUDY_HEIGHT_INPUT_TESTID,
    STUDY_HEIGHT_SETBACK_INPUT_TESTID,
    STUDY_HEIGHT_SAVE_BTN_TESTID,
    STUDY_HEIGHT_STATUS_TESTID,
} from '../site/envelopeCardSections';
// §RESI-ORCH-COST (lane RESI-ORCHESTRATOR, 2026-09-03) — THE MOUNT. `envelopeCostSection.ts`
// and `buildingTypologyChoice.ts` landed in 875775bc together with the `permittedStudyFigures`
// helper below, and the commit message + the plan both recorded the fold as "mounted and its
// typology select wired". ⛔ IT WAS NOT: the helper was dead code and NOTHING in this file
// referenced the builder, so §15's indicative cost was EXISTS-BUT-UNWIRED — the exact
// `committed ≠ reachable` shape this repo keeps re-learning. This import block, the
// `safeCostSection` const in `refreshEnvelopePanel` and `wireEnvelopeCostSelects` below are the
// wire that makes the claim true.
import {
    buildIndicativeCostFold,
    envelopeStudyBuiltArea,
    ENVELOPE_COST_GROUP_SELECT_TESTID,
    ENVELOPE_COST_CORRECTION_SELECT_TESTID,
} from '../site/envelopeCostSection';
import {
    loadBuildingChoice,
    saveBuildingChoice,
} from '../dataworkbench/buckets/buildingTypologyChoice';
// The SAME jurisdiction binding + ladder the 5D tab uses (C06 §13.3 — one producer of the
// answer, two renderers). A second resolver here is how one product states two costs.
import { currentCostJurisdiction } from '../dataworkbench/buckets/resolveCostJurisdiction';
// §RESI-ORCH-HIGHLIGHT (STR §3) — the SUBJECT vocabulary shared by the card that names a number
// and the scene that owns the geometry. This file only names subjects and writes the store;
// `ParcelBoundarySceneRenderer` subscribes and draws. See that module's header for why a new
// six-member union is used rather than the element-id `pryzm-highlight-elements` channel.
import {
    describeSiteHighlightAvailability,
    getSiteHighlight,
    type SiteHighlightSubject,
} from '../site/siteGeometryHighlight';
// §RESI-ORCH-HIGHLIGHT-DOM — the label markup and the click wire live in ONE module so a test can
// mount the REAL button and click it (`siteHighlightRowControl.spec.ts`). This file only calls
// them; it keeps no private copy of either. See that module's header for why.
import { buildSiteHighlightLabelHtml, wireSiteHighlightRows } from '../site/siteHighlightRowControl';
// §RESI-ORCH-TARGET-AREA (STR §5, lane RESI-ORCH 2026-09-04) — *"I want ~120 m² on the ground
// floor."* The solver is pure and lives next door; this file owns only the control, the wire and
// the statement it renders. See `targetFootprintAreaSolver.ts` for why this is a PROPOSAL inside a
// determination rather than a rival envelope, and why it never touches `BuildableEnvelope`.
import { solveTargetFootprintArea } from '../site/targetFootprintAreaSolver';
import {
    resolveLiveTargetFootprintProposal,
    setTargetFootprintProposal,
    clearTargetFootprintProposal,
} from '../site/targetFootprintAreaState';
import { describeDesignStages } from '../site/designStageModel';
import {
    buildTargetAreaEntryHtml,
    TARGET_AREA_INPUT_TESTID,
    TARGET_AREA_SOLVE_BTN_TESTID,
    TARGET_AREA_CLEAR_BTN_TESTID,
    // §RESI-ORCH-ADOPT (STR §5/§20) — the CONFIRM step: the session study becomes a real,
    // undoable level envelope. A separate gesture on purpose; see the builder's own comment.
    TARGET_AREA_ADOPT_BTN_TESTID,
    // §RESI-ORCH-STAGE-WIRE (STR §21) — the card's sections ORDERED and GATED by the stage, and
    // the third area channel (INTENDED) beside BUILT.
    buildStagedSectionsHtml,
    buildIntendedAreaFold,
    // §RESI-ORCH-MASSING-OPTIONS (STR §7) — N massings of the permitted footprint, each with its
    // reason. The enumerator is pure and lives next door; this file owns the button and the pick.
    buildMassingOptionsFold,
    MASSING_OPTIONS_GENERATE_BTN_TESTID,
    MASSING_OPTIONS_CLEAR_BTN_TESTID,
    MASSING_PICK_ATTR,
} from '../site/envelopeCardSections';
import {
    enumerateMassingOptions,
    type MassingOptionSet,
} from '../site/massingOptionModel';
// §RESI-ORCH-STAGE-WIRE (STR §21) — *"the right panel exposes the controls relevant to the current
// stage."* The DECISION (which section leads, which is gated, and why) is pure and lives next
// door; this file renders it and wires the jump. ⛔ Nothing is HIDDEN by the stage — see
// `designStagePanel.ts`'s header for why a vanishing section is the wrong fix.
import {
    describeEnvelopeCardSections,
    type EnvelopeCardSection,
} from '../site/designStagePanel';
import { wireDesignStageStrip } from '../site/designStageStripControl';
import type { DesignStageStatus } from '../site/designStageModel';
// §RESI-ORCH-INTENDED (C114 §3a) — *"three questions, three authorities, never summed into one
// number."* BUILT is `measureAuthoredDesign`; PERMITTED is the `BuildableEnvelope`; INTENDED is
// the space-envelope family, read here through its own reader so ADR-0380 D5's separation holds.
import { collectIntendedAreas } from '../site/intendedAreaChannel';
// §RESI-ORCH-ADOPT — the payload builder is pure and refuses (no proposal / no levels / no ground
// level) rather than inventing a storey. This file mints the id (C16 CA-2 — never the handler)
// and speaks the ONE create verb, `spaceEnvelope.batch.create` (C114 §6a: the batch verb even for
// one envelope, so one gesture is one undo entry).
import {
    buildAdoptProposalPlan,
    readLevelCandidates,
} from '../site/adoptProposalAsEnvelope';
import { createId } from '@pryzm/schemas';

/**
 * §SITE-VIEWPOINT-CONSISTENT (L-532) — THE ONE default camera preset for entering a 3D view of
 * the parcel. Founder, twice: *"I requested the camera always in the same position towards the
 * parcel and angle — but it is not yet implemented, for all 3D views."*
 *
 * THE CAUSE was two different defaults for the same intent: "3D Site" mounted in **`'plan'`**
 * (plan-oblique, heading 0°, pitch −68°) while the "3D globe" framed with the NW oblique
 * (`FORMA_FLY_*`, heading 325°, pitch −45°). Same parcel, same click-depth, two camera
 * orientations — so the view appeared to change angle depending on which door you came through.
 *
 * `'3d'` is the default because it is the one the globe already uses, so the two now agree and a
 * user moving between them keeps their bearings. **`'plan'` remains a first-class, explicitly
 * user-selected mode** — it is a deliberate near-top-down preset, not an accident, and this does
 * not remove it.
 *
 * Change THIS ONE LINE to move every 3D-view entry together; that single-source-of-truth is the
 * actual fix, more than the particular value chosen. The angles themselves live in
 * `CesiumViewport.ts` (`FORMA_FLY_HEADING_DEG` / `FORMA_FLY_PITCH_DEG`).
 */
const DEFAULT_3D_SITE_VIEW: 'plan' | '3d' = '3d';

/** §L-402-XSS — escape text before it enters an innerHTML template. The compliance rows
 *  carry EXTERNAL provider strings (zoneCode / source / ordinanceRef come from Plandata.dk
 *  and other zoning providers), so they are untrusted input and MUST NOT be interpolated raw. */
function escHtml(value: unknown): string {
    return String(value ?? '').replace(/[&<>"']/g, (c) => (
        c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;'
    ));
}

/** §L-402-XSS — only allow http(s) citation links. `ordinanceRef` is provider-supplied, so a
 *  `javascript:`/`data:` URL would otherwise execute from an anchor href. Returns null when the
 *  value is not a safe absolute http(s) URL (caller then renders it as plain text, not a link). */
function safeHttpUrl(value: unknown): string | null {
    const raw = typeof value === 'string' ? value.trim() : '';
    if (!raw) return null;
    try {
        const u = new URL(raw);
        return (u.protocol === 'http:' || u.protocol === 'https:') ? u.toString() : null;
    } catch { return null; }
}

export interface GISCallbacks {
    toggleGIS: (active: boolean) => void;
    flyToCremornePoint: () => Promise<void>;
    placeBimOnEarth: () => Promise<void>;
    activateView: (mode: '3D' | 'Top' | 'Front' | 'Back' | 'Left' | 'Right') => Promise<void>;
    /** §CESIUM-GIZMO-REMOVED — retained as a no-op (the move-on-globe gizmo + its
     *  origin axis lines were removed); kept so the GIS API shape is stable. */
    gizmoMode: (mode: string) => void;
    /** A.8.c — start the site-boundary polygon-draw tool (no-op until GIS mounted). */
    startBoundaryDraw: () => void;
    /** A.8.c — cancel an in-progress boundary draw. */
    cancelBoundaryDraw: () => void;
}

export function mountGISArea(props: UIProps, runtime: PryzmRuntime | null): GISCallbacks {
    // §L-12916 (2026-09-05) — THE LIVE RUNTIME, RESOLVED ONE WAY. On the live boot path this
    // function is handed `runtime = null` BY DESIGN (`createMainLayout(props, null)`, see the note
    // at §L-1580 below) and the composed runtime lives at `window.runtime`. The commit path already
    // resolves `runtime ?? window.runtime`; two reads on the envelope card did not — the intended-
    // area fold read `runtime?.stores?.spaceEnvelope` (→ its `no-store` arm, "Intended area —
    // unavailable", on EVERY production session) and the adopt-as-envelope dispatch read
    // `runtime?.bus` (→ "This surface has no command bus", so the level envelope was NEVER created
    // and there was nothing for the 3-D leg to draw). One resolver, so a third read cannot fork.
    const liveRuntime = (): PryzmRuntime | null =>
        runtime ?? ((typeof window !== 'undefined')
            ? (window.runtime as unknown as PryzmRuntime | undefined) ?? null
            : null);
    let cesiumViewport: any = null;
    let bridge: CesiumThreeBridge | null = null;
    let isGisInitialized = false;
    // §SITE-ENTRY-GLOBE-READY (PRD PRYZM-EARTH-ONBOARDING-PRD-2026-08-06.md §16) — a real
    // readiness gate for `window.pryzmGetSiteEntryCameraHost()`, closing the race where a
    // caller (`GlobeHeroSearch.mount()`) resolves the host BEFORE `cesiumViewport` even
    // exists (it is constructed inside the lazy `Promise.all` import below) and BEFORE its
    // own async `mount()` has finished (which is when `CesiumViewport` sets its camera —
    // see `CesiumViewport.ts`'s Sydney-default fallback). Starts pre-resolved (`active`
    // starting `false` needs no gate); re-armed only for the FIRST activation, since every
    // later re-activation reuses the already-mounted, already-ready `cesiumViewport`.
    let _cameraHostReady: Promise<void> = Promise.resolve();
    let _resolveCameraHostReady: (() => void) | null = null;
    let isBimPlacedOnEarth = false;
    let _gisActive = false;
    // §STARTUP-EAGER-GLOBE (founder 2026-08-10) — the ONE in-flight/settled first-init promise.
    // Both entry points (an eager boot-parallel start requested by onboarding, and the classic
    // `toggleGIS(true)` first activation) funnel through `ensureGisInitialized()`, so the viewer
    // is constructed at most once no matter how the two race.
    let gisInitPromise: Promise<void> | null = null;
    // §STARTUP-EAGER-GLOBE — TRUE once the first `toggleGIS(true)` visibility flip has run.
    // Distinguishes "initialized eagerly but never yet shown" (a plain visibility flip — the
    // behaviour the classic first activation had) from a genuine RE-activation (which re-runs
    // the §L-193 placement restore). Without this, an eager init would make the hero's very
    // first `toggleGIS(true)` take the re-entry branch and run a placement restore the classic
    // first activation never ran.
    let gisEverActivated = false;
    // §FIX-GISLAYOUT-PLACE-REAL-MODEL-FORMA-AND-GLOBE-REENTRY (L-193, Symptom B) — set true
    // by an orchestrator (applyResultView('3D') globe entry / engageFormaCesium Forma entry)
    // around its own `toggleGIS(true)` call so the re-activation branch does NOT ALSO place
    // (avoids a double-place / fighting Forma mode). Direct entries (nav-rail GIS button,
    // onboarding pryzmToggleGIS) leave it false → the branch restores the modern real model.
    let gisReactivationSelfPlaceSuppressed = false;
    // §FEAT-VIEW-ACTIVATION-LOADING-OVERLAY (L-270) — the in-flight "3D globe" / "3D Site"
    // activation (at most one). Holds the shared loading overlay open + the scene input gated
    // until its readiness chain completes; cancelled when the user leaves for another view.
    let activeViewActivation: ViewActivationHandle | null = null;
    // A.8.a/A.8.c — GIS site-authoring surfaces, created when Cesium mounts.
    let geocodeBox: import('../site/siteGeocodeSearchBox').SiteGeocodeSearchBox | null = null;
    let boundaryTool: import('../geospatial/SiteBoundaryDrawTool').SiteBoundaryDrawTool | null = null;
    // A.8.c.f — the Hektar-style 2D cream/shadow boundary-draw map. This REPLACES
    // the Cesium-3D draw surface for the DRAW step (Cesium stays for 3D render):
    // startBoundaryDraw() opens THIS 2D map; the legacy Cesium `boundaryTool` is
    // retained for the console fallback (pryzmStartBoundaryDraw3D) only.
    let map2dHandle: SiteBoundaryMap2DHandle | null = null;
    // §VIEW-PANEL-PER-PANE (founder 2026-09-06) — the basemap the user has ASKED for.
    //
    // ⚠ It is a REQUEST, not a reading, and the two are different facts. The map is
    // lazy-imported, so `pryzmSetSiteBasemap('satellite')` can arrive before any map
    // exists; dropping it there is the silent-no-op defect (L-1187) — the founder presses
    // "2D Satellite", the map opens, and it is cream. So the request is REMEMBERED here and
    // applied at mount. `pryzmGetSiteBasemap` prefers the LIVE map's own reading and falls
    // back to this only when there is no map to read.
    let requestedBasemap: 'map' | 'satellite' = 'map';
    // §FEAT-MULTI-PANE-VIEW-SYSTEM (L-412, C59 Phase 1b) — the live site-authoring
    // split (2D map LEFT · 3D Site RIGHT). Non-null while the paned layout is active;
    // consulted by the Forma live-update gate (a paned 3D Site is NOT `map2d`) and by
    // the envelope facts-card host resolution so the card renders on the RIGHT pane.
    let siteAuthoringPanes: SiteAuthoringPaneShell | null = null;
    // §L-412 / §L-416 (C59, Req 2) — the plot CENTROID (scene-XZ) the paned 3D Site was
    // last FRAMED to this mount, or null if never framed. The pane opens zoomed out
    // (whole-city scale); the FIRST parcel-boundary commit frames it (renderFormaMassing(true)
    // → §GLOBE-FIT-BUILDING flyToBoundingSphere) so the user sees THEIR plot + envelope. L-416:
    // a LATER commit whose plot moved to a NEW location (a fresh parcel outside the framed
    // area — "a point not in the original circle") re-frames; an in-place re-commit / zoning /
    // layout edit falls back to the no-re-fly path (no jitter). Reset to null on every (re)mount.
    let siteAuthoringPaneLastFramedCentroid: { x: number; z: number } | null = null;
    // A.8.c.f.2 (defect 1) — remember the LAST geocoded result so the 2D map can
    // fit its exact bbox (the Site location store keeps only lat/lon — the bbox is
    // otherwise lost, leaving the 2D map at a coarse point zoom). Set in the
    // geocode `onFlyTo` callback below; consumed by getMapInitial().
    let lastGeocodeFrame: { lat: number; lon: number; bbox?: [number, number, number, number] } | null = null;

    // §SEAM-2 INCREMENT 2 (L-604 / C12 §1.5) — THE parcel-ring projection origin, resolved through
    // the SINGLE origin authority `resolveSiteFrameOrigin` that the 3D-Site render frame
    // (`getFormaOrigin`) ALSO reads. This is the residual-shift fix: the ring used to be projected
    // about the geocoded store location while the render framed about the LTP-ENU origin — two
    // authorities that diverge once `setLtpOriginIfSafe` freezes the LTP origin under a committed
    // boundary while the store location keeps moving (see resolveSiteFrameOrigin's header). Reading
    // the LTP-ENU origin FIRST here (the frame every authored coordinate is baked in, C12 §1.5) makes
    // the ring project about EXACTLY the origin the render frames at, so the parcel can no longer
    // slide by dist(store, LTP). Falls back to null so the draw tool uses its first clicked vertex.
    // θ-independent (translation origin only); identical pre-boundary, where the two sources coincide.
    const getSiteOrigin = (): { lat: number; lon: number } | null => {
        const loc = (runtime?.siteModelStore as { getSite?: () => { location?: { latitude: number; longitude: number } } | null } | undefined)?.getSite?.()?.location;
        return resolveSiteFrameOrigin(getCurrentSiteOrigin(), loc, lastGeocodeFrame);
    };

    // A.8.c.f — read the geocoded Site location to centre the 2D map. The geocode
    // search box (A.8.a) sets this via site.updateLocation. Returns null if unset
    // (the 2D map then opens at a world view; drawing still works).
    const getMapInitial = (): { lat: number; lon: number; bbox?: [number, number, number, number]; zoom?: number } | undefined => {
        // Prefer the last geocoded frame (carries the bbox → the 2D map fits the
        // exact plot, not a coarse point). Fall back to the Site location point.
        // §SITE-FRAMING-EXTENT (founder 2026-08-07: "2D GIS view is TOO ZOOMED OUT — and the 3D
        // Site is TOO ZOOMED IN. They need to be COHERENT") — ⚠ FIT THE SITE, NOT THE GEOCODE BBOX.
        //
        // This returned the RAW Nominatim bbox, and `fitBounds` did exactly what it was told with
        // it. For a city-level result ("Barcelona") that bbox is the MUNICIPALITY, so the left pane
        // opened on the whole metropolitan area — Sant Cugat to El Prat — while the right pane sat
        // at 20 m range on the placed building. Two panes, two different objects, three orders of
        // magnitude apart. `fitBounds` caps `maxZoom: 18` so a tiny bbox cannot over-zoom, but
        // there was no FLOOR, which is the half that was missing.
        //
        // `resolveSiteFramingExtent` is now the ONE authority: it keeps a geocode bbox that is
        // already site-scale, rejects one that is administrative, prefers a committed boundary over
        // both, and always yields a usable extent. The 3D camera derives from the same value via
        // `altitudeForHalfSpan`, so the panes cannot drift apart again without the extent itself
        // being wrong — one thing to reason about instead of two.
        const anchor = lastGeocodeFrame ?? getSiteOrigin();
        if (!anchor) return undefined;
        const extent = resolveSiteFramingExtent({
            anchor: { lat: anchor.lat, lon: anchor.lon },
            geocodeBbox: lastGeocodeFrame?.bbox ?? null,
        });
        console.log(
            `[gis] §SITE-FRAMING-EXTENT getMapInitial: framing the SITE (source=${extent.source}, ` +
            `±${Math.round(extent.halfSpanM)} m); fitBounds target =`, extent.bbox,
        );
        return {
            lat: extent.centreLat,
            lon: extent.centreLon,
            bbox: extent.bbox as [number, number, number, number],
            zoom: 17,
        };
    };

    // A.8.c.f — open the Hektar-style 2D cream/shadow boundary-draw map overlay
    // (NOT the Cesium 3D draw). Mounts on #container; on commit/cancel it disposes
    // + closes. Lazy-imports the MapLibre chunk so it is not in the main bundle.
    const startBoundaryDraw = (drawOpts?: { overlayOnly?: boolean; parent?: HTMLElement }): void => {
        if (map2dHandle) {
            // §MAP-IS-A-SINGLETON-TOO (L-12992, founder 2026-09-06: *"if i clicked 2d map view
            // it would render on the left hand side"*, with the pane that asked for it BLACK).
            //
            // ⛔ THIS USED TO BE A BARE `return`, AND THE BARE RETURN WAS THE BUG. `parent` was
            // honoured on the FIRST mount only (the `viewport` line below); every later request
            // for the map in a DIFFERENT pane hit this guard, logged "already open" and did
            // nothing — so the ONE map stayed wherever it first landed while the requesting
            // pane held a view with no surface. The asymmetry is the whole finding: the Cesium
            // container had been pane-aware since §L-412 (`reparentContainerTo`) and the
            // MapLibre map had not, so one of the two hostable surfaces could move and the
            // other could not.
            //
            // ⭐ RE-TARGET, NEVER RE-MOUNT. A dispose-and-remount would refetch every tile AND
            // clear `window.pryzmBoundaryDrawSurfaceReadyAt` — which is precisely the trace the
            // founder captured: `map2d: disposed`, then §DRAW-SURFACE-IS-RECOVERABLE, then 47
            // `draw idle tick — waiting (surface-not-ready)` retries that never settle. Moving
            // the node keeps the map, the boundary in progress and the readiness stamp.
            const nextHost = drawOpts?.parent ?? null;
            if (nextHost && !map2dHandle.isPlacedIn(nextHost)) {
                map2dHandle.reparentTo(nextHost);
                return;
            }
            console.log('[gis] map2d already open');
            return;
        }
        // §L-412 (C59 Phase 1b) — the MapLibre 2D map mounts into its assigned PANE
        // element (LEFT pane) when the site-authoring split is active, instead of the
        // `inset:0` `#container` overlay. Falls back to `#container` for the classic
        // single-pane launchers (unchanged behaviour).
        const viewport = drawOpts?.parent ?? document.getElementById('container');
        if (!viewport) {
            console.error('[gis] map2d: #container not found');
            return;
        }
        void import('../geospatial/SiteBoundaryMap2D').then(({ mountSiteBoundaryMap2D }) => {
            map2dHandle = mountSiteBoundaryMap2D({
                parent: viewport,
                runtime: runtime ?? null,
                initial: getMapInitial(),
                getOrigin: getSiteOrigin,
                // §FIX-SITE-OVERLAY-IMPORT-TERMINAL (L-70) — open the map in overlay-only mode
                // for the PDF/image import path: the draw tool is disarmed (no boundary, no
                // generate), only the site-plan overlay panel + calibration are live.
                overlayOnly: drawOpts?.overlayOnly ?? false,
                // §PARCEL-SELECT (L-380 P1 → L-613) — wire the per-jurisdiction parcel REGISTRY so
                // the map's "Select parcel" mode fetches REAL geometry in EVERY country: the open
                // national cadastre where one exists (ES/FR/NL/NO/DE-NW), else an honest OSM
                // footprint. Outside any footprint the map degrades to "no parcel — draw".
                parcelProvider: defaultParcelProvider,
                // O.7.2.b — CANCEL (Esc / ×) disposes the map → drop the handle.
                onClose: () => { map2dHandle = null; },
                // O.7.2.b — COMMIT does NOT dispose: the cream map + boundary stay
                // alive so the onboarding "Generate with AI?" confirm renders over a
                // live plan map. Keep `map2dHandle` so closeBoundaryMap2D() (called at
                // generate-time) can tear it down.
                onCommit: () => {
                    console.log('[gis] map2d: boundary committed — keeping cream plan map alive (teardown deferred to generate).');
                },
            });
            // §VIEW-PANEL-PER-PANE — apply the basemap the user already asked for. Without
            // this, pressing "2D Satellite" from the view panel BEFORE the map exists opens
            // the cream map and silently loses the request.
            if (requestedBasemap !== 'map') map2dHandle.setBasemap(requestedBasemap);
            // §MAP2D-ENVELOPE (STR-RESIDENTIAL-DESIGN-ORCHESTRATOR §26.4) — ONE-SHOT at mount, so a
            // map opened over an ALREADY-SOLVED site shows the envelope immediately instead of
            // waiting for the next `site.*` event that may never come (the re-entry / reload case
            // L-445 documents for the globe). The live path is the subscription in
            // `subscribeFormaLiveUpdate`. We pass the PAYLOAD only — the map asks the one
            // visibility authority itself (§ENVELOPE-ONE-VISIBILITY / C84 EI-1).
            try {
                map2dHandle.setBuildableEnvelope(resolveFormaEnvelope()?.solids ?? null);
            } catch (e) {
                console.warn('[gis][c58] §MAP2D-ENVELOPE one-shot at map mount failed (non-fatal):', e);
            }
            console.log('[gis] map2d: Hektar 2D boundary-draw map opened');
        }).catch((err: unknown) => {
            console.error('[gis] map2d: failed to open', err);
            runtime?.events?.emit('pryzm:toast', { message: 'Could not open the 2D boundary map — see console.', severity: 'error' });
        });
    };
    const cancelBoundaryDraw = (): void => {
        if (map2dHandle) {
            map2dHandle.dispose();
            map2dHandle = null;
        }
        boundaryTool?.cancel();
    };

    // O.7.2.b — explicit teardown of the (possibly committed-but-still-live) 2D
    // Hektar map. After a boundary COMMIT the map stays mounted showing the drawn
    // boundary (so the "Generate with AI?" confirm renders over a live cream plan
    // map); it is disposed ONLY here, at generate-time. Idempotent + double-dispose
    // safe (the handle's dispose() guards on `disposed`, and we null the handle).
    const closeBoundaryMap2D = (): void => {
        // §L-412 — when the site-authoring SPLIT is live, the 2D map lives in the left
        // pane; tearing down at generate-time means dismissing the whole split (which
        // unmounts the map AND re-homes the single Cesium viewer back to #container).
        if (siteAuthoringPanes && !siteAuthoringPanes.isDisposed) {
            console.log('[gis] §L-412 closeBoundaryMap2D() — dismissing the site-authoring split at generate-time.');
            unmountSiteAuthoringPanes();
            return;
        }
        if (map2dHandle) {
            console.log('[gis] map2d: closeBoundaryMap2D() — tearing down the cream plan map at generate-time.');
            map2dHandle.dispose();
            map2dHandle = null;
        }
    };

    // §L-384 — RE-DRAW after a committed boundary. The 2D map stays mounted post-commit
    // (O.7.2.b); this asks it to CLEAR the immutable C19 §1.4 boundary (via site.replace)
    // and re-arm the draw so the user can author a new plot. No-op if the map isn't open.
    const rearmBoundaryDraw = (): void => {
        if (map2dHandle) {
            console.log('[gis] §L-384 rearmBoundaryDraw() — clear committed boundary + re-arm draw.');
            map2dHandle.rearm();
        }
    };

    // F.11.4 Wave 14 — runtime.geospatial.isConfigured wiring.
    // Phase F stub always returns false; Phase F.11.4 wires the real adapter
    // once the geographic origin is set by the user.
    const _geoConfigured = runtime?.geospatial.isConfigured() ?? false;
    console.debug('[GIS] geospatial configured:', _geoConfigured);

    // PERF-FIX-#1: Made async so we can await the lazy Cesium load.
    // Cesium is already loaded by the time this is called (GIS must be active first),
    // so getCesium() resolves from cache instantly with zero network cost.
    const flyToCremornePoint = async () => {
        if (!cesiumViewport) return;
        const viewer = cesiumViewport.getViewer();
        if (!viewer) return;

        const Cesium = await getCesium();
        viewer.camera.flyTo({
            destination: Cesium.Cartesian3.fromDegrees(151.21809, -33.84495, 400),
            duration: 3.5
        });
    };

    // §CESIUM-GIZMO-DETACH (founder 2026-06-19) — the BIM TransformControls gizmo's
    // stock three.js "helper" axis lines (scaled ~1e6, recolored to PRYZM violet in
    // initTransformControllers: X→#6600FF, Z→#7B3FF2) are the near-infinite
    // green/purple lines at the building corner that composite through into the
    // Cesium view when a wall is selected. Detach the gizmo on GIS entry so no helper
    // lines are live; it reattaches on reselect back in the BIM view (real geometry +
    // in-editor snapping untouched). Carrier-independent: kills the lines whether or
    // not the BIM canvas is fully hidden. (§STARTUP-EAGER-GLOBE — hoisted to mount
    // scope so the shared first-activation flip below can use it too.)
    const detachBimGizmoForGis = () => {
        try {
            (globalThis as unknown as { transformControls?: { detach?: () => void } }).transformControls?.detach?.();
        } catch { /* noop */ }
    };

    /**
     * §STARTUP-EAGER-GLOBE (founder 2026-08-10, 3× project-launch globe) — THE first-init body
     * `toggleGIS(true)` always ran, extracted so it can ALSO start EAGERLY, in parallel with the
     * rest of the engine boot (consumed from `requestEagerGlobeStart()` below). Everything here
     * is the exact work the old first-activation branch did — construct + mount the ONE
     * CesiumViewport, wire the bridge and the site-authoring surfaces — EXCEPT visibility:
     * the viewer mounts HIDDEN (warm-hidden in eager mode so the canvas has real dimensions and
     * tiles stream; plain display:none in activation mode, as before) and the visibility flip
     * lives in `finishFirstGisActivation()`, which the activation path runs the moment the init
     * settles. Idempotent: one promise, shared by both entry points, however they race.
     */
    const ensureGisInitialized = (mode: 'activation' | 'eager'): Promise<void> => {
        if (gisInitPromise) return gisInitPromise;
        const viewport = document.getElementById('container');
        if (!viewport) {
            console.error("GIS: Viewport container not found");
            return Promise.resolve();
        }
        // §SITE-ENTRY-GLOBE-READY — arm the gate for this first init; resolved once
        // `cesiumViewport.mount()` (and its post-mount camera placement) settles, whichever way
        // (success or failure — a failed mount must not hang a caller awaiting readiness forever).
        _cameraHostReady = new Promise<void>((resolve) => { _resolveCameraHostReady = resolve; });
        // PERF-FIX-#1: Load Cesium and CesiumThreeBridge dynamically here,
        // co-located with the CesiumViewport import that already fires on first use.
        // Both imports are batched in Promise.all so they download in parallel.
        gisInitPromise = Promise.all([
            import('../geospatial/CesiumViewport'),
            getCesium(),
            import('@pryzm/plugin-geospatial'),
            // A.8.a/A.8.c — GIS site-authoring surfaces (lazy-loaded with Cesium).
            import('../site/siteGeocodeSearchBox'),
            import('../geospatial/SiteBoundaryDrawTool'),
        ]).then(async ([{ CesiumViewport }, Cesium, { CesiumThreeBridge }, { mountSiteGeocodeSearchBox }, { SiteBoundaryDrawTool }]) => {
            if (!cesiumViewport) {
                // §L-446 — resolve CAPTURED-THEN-WINDOW, the pattern §L-412 already established
                // here and `getFormaBoundary` uses for the store. The captured `runtime` is NULL
                // on the live boot path by DESIGN (`createMainLayout(props, null)`); `window.runtime`
                // IS published at bootstrap() start, BEFORE initUI, so it is populated by the time
                // this lazy import resolves. setRuntime() is idempotent and never downgrades a
                // live runtime to null.
                const resolvedRuntime =
                    runtime ??
                    (typeof window !== 'undefined'
                        ? ((window as { runtime?: unknown }).runtime as
                            | import('@pryzm/runtime-composer/types').PryzmRuntime
                            | undefined) ?? null
                        : null);

                // §STARTUP-GLOBE-PREWARM (L-10560) — ADOPT a viewport that was already constructed
                // AND mounted (warm-hidden) at the onboarding seam, BEFORE this engine boot began.
                //
                // ⚠ THE ADOPTION REPLACES EXACTLY TWO STEPS — construction and `mount()`. Every
                // line below it (the readiness resolve, the bridge, the geocode box, the boundary
                // tool, the console hooks) still runs, on BOTH arms. An `if (prewarmed) { … }` that
                // skipped past them would be the "deferral that never fires" defect wearing a perf
                // fix's name, so the two arms MERGE here rather than branching around the wiring.
                //
                // ⛔ `null` is the NORMAL answer on every path that is not a globe-first onboarding
                // (a hub click, a deep link, a reopen-after-reload), and on a prewarm that failed.
                // It means "construct cold" — the `else` arm, byte for byte what this code did
                // before the prewarm existed. There is no path on which a globe fails to appear
                // because the prewarm did not fire.
                //
                // ⛔ A prewarm still IN FLIGHT is AWAITED, never raced: `consumePrewarmedGlobe()`
                // returns the one shared promise, so at most ONE CesiumViewport is ever built.
                const prewarmed = await consumePrewarmedGlobe();
                if (prewarmed) {
                    cesiumViewport = prewarmed;
                    cesiumViewport.setRuntime(resolvedRuntime);
                    console.log(
                        `[gis] §STARTUP-GLOBE-PREWARM — ADOPTED the prewarmed Cesium viewport ` +
                        `(${mode} init): construction + mount already ran in parallel with the ` +
                        'engine boot, so this path pays nothing for them.',
                    );
                } else {
                    cesiumViewport = new CesiumViewport(viewport, runtime ?? null /* B-runtime-thread CesiumViewport */);
                    cesiumViewport.setRuntime(resolvedRuntime);
                    // §STARTUP-EAGER-GLOBE — in eager mode the container lays out INVISIBLY so the
                    // viewer is created at real dimensions and base-imagery tiles stream during the
                    // engine boot, instead of starting 0×0 and waiting for the visibility flip.
                    if (mode === 'eager') cesiumViewport.enterWarmHiddenState();
                    await cesiumViewport.mount();
                    console.log(`GIS: Cesium viewer mounted successfully (${mode} init)`);
                }
                // §SITE-ENTRY-GLOBE-READY — the viewer is genuinely live now (mount() above
                // already awaited `resolveReady()`); a camera command issued from here on lands
                // on the real viewer, not a dropped no-op. (Visibility is a separate flip —
                // Cesium camera state is independent of it.)
                _resolveCameraHostReady?.();
                _resolveCameraHostReady = null;
                const viewer = cesiumViewport.getViewer();
                if (viewer) {
                    // §FIX-GLOBE-ACTIVATE-STALE-VIEWER (L-313) — wire the bridge to the
                    // OWNER via a provider, not a captured viewer.
                    bridge = new CesiumThreeBridge(() => cesiumViewport?.getViewer() ?? null, props.world);
                    bridge.activate();

                    // Set anchor for Sydney Opera House (Default)
                    const lon = 151.2153;
                    const lat = -33.8568;
                    const height = 0;
                    const cartesian = Cesium.Cartesian3.fromDegrees(lon, lat, height);
                    bridge.setAnchor(cartesian);

                    isGisInitialized = true;

                    // A.8.a — mount the address-search box. Mounted HIDDEN — the first
                    // activation flip (or the re-activation branch) shows it, so an EAGER init
                    // never floats a search box over the boot/hub surface.
                    geocodeBox = mountSiteGeocodeSearchBox({
                        parent: viewport,
                        runtime: runtime ?? null,
                        onFlyTo: (result) => {
                            // A.8.c.f.2 — capture the bbox so the 2D Hektar
                            // map can fit the exact plot when opened.
                            lastGeocodeFrame = { lat: result.lat, lon: result.lon, bbox: result.bbox };
                            noteLayoutOwner(); // §L-676-B — this frame belongs to THIS project.
                            // §SITE-FRAME-ON-TERRAIN (L-635) — DO NOT fly here at a raw ellipsoid
                            // altitude; the geocode box dispatches site.updateLocation →
                            // CesiumViewport's terrain-aware frameSiteLocation samples the REAL
                            // ground height and frames the §SITE-VIEWPOINT-CONSISTENT preset
                            // above it — correct on every city.
                            console.log('[gis] camera → terrain-aware site framing for', result.displayName);
                        },
                    });
                    geocodeBox.element.style.display = 'none';

                    // A.8.c — construct the polygon-draw tool (started on demand
                    // via startBoundaryDraw()).
                    boundaryTool = new SiteBoundaryDrawTool({
                        viewer,
                        Cesium,
                        runtime: runtime ?? null,
                        getOrigin: getSiteOrigin,
                    });
                    // A.8.c.f — DevTools console entry points. The default
                    // pryzmStartBoundaryDraw() now opens the Hektar 2D map
                    // (the draw surface); pryzmStartBoundaryDraw3D() keeps the
                    // legacy Cesium-globe draw as a fallback.
                    window.pryzmStartBoundaryDraw = () => startBoundaryDraw();
                    window.pryzmStartBoundaryDraw3D = () => boundaryTool?.start();
                    window.pryzmCancelBoundaryDraw = () => cancelBoundaryDraw();
                    console.log('[gis] site-authoring surfaces ready (geocode search + 2D Hektar boundary map). Run pryzmStartBoundaryDraw() for the 2D draw, pryzmStartBoundaryDraw3D() for the Cesium draw.');
                }
            }
        }).catch((err: any) => {
            console.error("GIS: Error mounting Cesium viewer:", err);
            // §SITE-ENTRY-GLOBE-READY — a failed mount must not hang a caller awaiting
            // readiness forever; resolve (not reject) so `frameCurrent()` still runs its
            // best-effort attempt against whatever `getCameraHost()` returns.
            _resolveCameraHostReady?.();
            _resolveCameraHostReady = null;
            // Allow the next activation to retry cold — same best-effort recovery as before.
            gisInitPromise = null;
        });
        return gisInitPromise;
    };

    /** §STARTUP-EAGER-GLOBE — the FIRST activation's visibility flip (the only part of the old
     *  first-activation branch that `ensureGisInitialized` deliberately does not do). Guarded on
     *  `_gisActive` so an init that settles AFTER the user already left GIS stays hidden. */
    const finishFirstGisActivation = (): void => {
        if (!_gisActive || !cesiumViewport) return;
        gisEverActivated = true;
        detachBimGizmoForGis();
        cesiumViewport.setVisible(true);
        if (geocodeBox) geocodeBox.element.style.display = '';
    };

    const toggleGIS = (active: boolean) => {
        _gisActive = active;
        console.log("GIS toggle activated:", active);
        const viewport = document.getElementById('container');
        if (!viewport) {
            console.error("GIS: Viewport container not found");
            return;
        }

        if (active) {
            console.log("GIS: Activating geospatial view...");
            viewport.style.position = 'relative';
            viewport.style.overflow = 'hidden';

            // 🎮 DISABLE THREE.JS CAMERA CONTROLS - Let Cesium handle navigation
            if (props.world.camera && props.world.camera.controls) {
                props.world.camera.controls.enabled = false;
                console.log("GIS: Three.js camera controls disabled");
            }

            if (!isGisInitialized) {
                // §STARTUP-EAGER-GLOBE — the classic first activation. If an eager boot-parallel
                // init is already in flight this JOINS it (one shared promise); otherwise it
                // starts the same init cold, exactly as before. The visibility flip runs the
                // moment the init settles (guarded on _gisActive, so a user who left GIS while
                // the mount was in flight never gets a surprise globe).
                void ensureGisInitialized('activation').then(() => finishFirstGisActivation());
            } else if (!gisEverActivated) {
                // §STARTUP-EAGER-GLOBE — the eager init finished BEFORE the first activation:
                // the viewer is live and warm-hidden with its first frustum already streamed.
                // A plain visibility flip is the WHOLE cost of entering the globe now — and it
                // deliberately does NOT run the §L-193 re-entry placement restore, because this
                // is the FIRST activation, which never ran one.
                console.log("GIS: first activation of the eagerly-initialized Cesium viewer — visibility flip only.");
                finishFirstGisActivation();
            } else {
                console.log("GIS: Re-activating existing Cesium viewer");
                // A.8.a — re-show the geocode search box overlay with the GIS view.
                if (geocodeBox) geocodeBox.element.style.display = '';
                // §FIX-GLOBE-CLICK-NAVIGATES-OUT (L-318) — the DIRECT re-entry path (nav-rail GIS
                // button / window.pryzmToggleGIS) has no orchestrator try/catch around it, so a
                // synchronous throw here (setVisible / restorePhotorealGlobeContent) would escape as
                // an uncaught error the ViewportCrashGuard does not net → router navigate-out/reload.
                // Contain the whole re-entry placement: log + surface in-editor retry, never propagate.
                try {
                if (cesiumViewport) {
                    detachBimGizmoForGis();
                    cesiumViewport.setVisible(true);

                    // §FIX-GISLAYOUT-PLACE-REAL-MODEL-FORMA-AND-GLOBE-REENTRY (L-193/L-186,
                    // Symptom B) — decide how to restore the building on a Cesium RE-entry.
                    // `setVisible(false)` (on GIS exit) preserved the Cesium primitives, but a
                    // view round-trip (esp. globe→forma→globe) DESTROYS the globe real-model
                    // primitive (CesiumViewport.clearRealModelOnGlobe). The old branch only
                    // re-synced the LEGACY loadBimGltf model (gated on isBimPlacedOnEarth) and
                    // never re-ran the modern real-model placement + reframe — so a building
                    // placed via the real-model path vanished on a direct re-entry (nav-rail
                    // GIS button / onboarding). The pure decision preserves the legacy re-sync
                    // exactly and ADDS the modern restore for the direct (non-suppressed) path;
                    // applyResultView/engageFormaCesium suppress it (they self-place).
                    const reactivation = decideGlobeReactivationAction({
                        isBimPlacedOnEarth,
                        selfPlaceSuppressed: gisReactivationSelfPlaceSuppressed,
                    });
                    if (reactivation === 'legacy-gltf-resync') {
                        // 🔄 SYNC UPDATE (legacy placeBimOnEarth path) — no camera fly.
                        // §FIX-GLOBE-CLICK-NAVIGATES-OUT (L-318) — this detached promise had NO .catch;
                        // a rejected GLB export / loadBimGltf became an unhandled rejection. Contain it.
                        import('@pryzm/file-format').then(async ({ exportFragmentsToGLB }) => {
                            const url = await exportFragmentsToGLB(props.world.scene.three as any);
                            await cesiumViewport.loadBimGltf(url, {}, 1.0, false);
                            console.log("GIS: Sync update completed (no camera fly)");
                        }).catch((err: unknown) => {
                            console.error('[gis] §FIX-GLOBE-CLICK-NAVIGATES-OUT legacy GLB re-sync failed — contained (globe stays open):', err);
                        });
                    } else if (reactivation === 'restore-real-model') {
                        console.log('[gis] §FIX-GISLAYOUT-…-GLOBE-REENTRY: direct globe re-entry — re-placing the real model + reframing (idempotent).');
                        restorePhotorealGlobeContent();
                    } else {
                        console.log('[gis] §FIX-GISLAYOUT-…-GLOBE-REENTRY: re-activation placement suppressed (orchestrator self-places).');
                    }
                }
                } catch (err) {
                    console.error('[gis] §FIX-GLOBE-CLICK-NAVIGATES-OUT re-entry placement threw — contained (kept in-editor):', err);
                    activeViewActivation?.fail(`The 3D globe failed to reopen: ${String((err as Error)?.message ?? err)}`);
                }
                if (bridge) {
                    // §FIX-GLOBE-ACTIVATE-STALE-VIEWER (L-313) — after a device-loss recovery the
                    // bridge re-acquires the CURRENT viewer; if none is live (viewer missing /
                    // mid-recreate) activate() throws by design. SURFACE that to the loading
                    // overlay's "Try again" instead of letting the unhandled throw hang the
                    // overlay for 25s at stage "content".
                    try {
                        bridge.activate();
                    } catch (err) {
                        console.error('[gis] §FIX-GLOBE-ACTIVATE-STALE-VIEWER re-activation could not bind the bridge to a live viewer:', err);
                        activeViewActivation?.fail(
                            `The 3D globe could not reopen after a graphics reset: ${String((err as Error)?.message ?? err)}`,
                        );
                    }
                }
            }
        } else {
            console.log("GIS: Deactivating geospatial view (preserving state)");

            // §FEAT-VIEW-ACTIVATION-LOADING-OVERLAY (L-270) — the user left the Cesium view
            // while it was still loading. Cancel the activation so the overlay comes down and
            // the input gate lifts; never leave a dismissed view holding the screen hostage.
            activeViewActivation?.cancel('GIS deactivated');

            // A.8.c — abort any in-progress boundary draw when leaving GIS.
            boundaryTool?.cancel();
            // A.8.a — hide the geocode search box overlay so it doesn't float over
            // the BIM view (it shares the #container parent, not the Cesium canvas).
            if (geocodeBox) geocodeBox.element.style.display = 'none';

            if (bridge) {
                bridge.deactivate();
            }

            if (cesiumViewport) {
                cesiumViewport.setVisible(false);
            }

            // 🎮 RE-ENABLE THREE.JS CAMERA CONTROLS - Return control to BIM mode
            if (props.world.camera && props.world.camera.controls) {
                props.world.camera.controls.enabled = true;
                console.log("GIS: Three.js camera controls re-enabled");
            }

            // Reset Three world transform to identity when leaving GIS
            const threeScene = props.world.scene.three;
            threeScene.matrixAutoUpdate = true;
            threeScene.matrix.identity();
            threeScene.position.set(0, 0, 0);
            threeScene.quaternion.set(0, 0, 0, 1);
            threeScene.scale.set(1, 1, 1);
            threeScene.updateMatrixWorld(true);
        }
    };

    // Extract Place-BIM-on-Earth into a named closure so GISRailPanel can call
    // props.gisPlaceBim() — keeps the complex GLB export + Cesium wiring inside
    // GISAreaLayout where cesiumViewport, bridge, and getCesium() are in scope.
    const placeBimOnEarth = async () => {
        const lat = parseFloat(prompt('Latitude:', '-33.8568') || '');
        const lon = parseFloat(prompt('Longitude:', '151.2153') || '');
        const alt = parseFloat(prompt('Altitude (m):', '0.0') || '0.0');
        if (isNaN(lat) || isNaN(lon)) return;
        const bimManagerGlb = window.bimManager; // TODO(D.4): legacy bimManager — replace with runtime.scene.renderer once EngineBootstrap split lands
        if (!bimManagerGlb?.scene) return;
        const glbModule = await import('@pryzm/file-format');
        const blobUrl = await glbModule.exportFragmentsToGLB(bimManagerGlb.scene);
        console.log('[GIS] Loading GLB in Cesium:', blobUrl);
        if (cesiumViewport) {
            await cesiumViewport.loadBimGltf(blobUrl, { lat, lon, height: alt }, 1.0, true);
            isBimPlacedOnEarth = true;
            noteLayoutOwner(); // §L-676-B
            if (bridge) {
                const Cesium = await getCesium();
                const cartesian = Cesium.Cartesian3.fromDegrees(lon, lat, alt);
                bridge.setAnchor(cartesian);
            }
        }
    };

    const activateView = async (mode: '3D' | 'Top' | 'Front' | 'Back' | 'Left' | 'Right') => {
        // If GIS is active, deactivate it before switching back to BIM views
        if (_gisActive) {
            toggleGIS(false);
        }

        // Route ALL view switches through ViewController.activate() — the single
        // authority that dispatches 'view-activated', triggering
        // RenderPipelineManager.updateCamera() so the TSL pipeline rebuilds
        // against the new camera object (perspective ↔ orthographic switch).
        //
        // Before this fix the call went directly to navManager.setViewMode(),
        // which switched the OBC camera projection but never dispatched
        // 'view-activated'.  The WebGPU TSL pipeline then held a stale camera
        // reference; the first rp.render() threw, _hasPipelineError latched
        // true, and the scene appeared frozen.
        if (props._viewController) {
            // §UX1-PANEL-DEFAULTS D6 — activating a BIM view means the white canvas has
            // been reached, which is the founder's own boundary ("until we arrive to the
            // PRYZM canvas"). The phase is a ONE-WAY LATCH, so a later trip back to the
            // globe does not undo this and the user keeps their rail — see setAppPhase.
            setAppPhase('canvas');
            await props._viewController.activate(mode);
        } else if (props.navManager) {
            // Fallback: pre-ViewController callers; grid.fade must be set manually.
            props.grid.fade = mode === '3D';
            await props.navManager.setViewMode(mode as any);
        }
    };

    // §CESIUM-GIZMO-REMOVED (2026-06-19) — the move-on-globe transform gizmo (the
    // green/purple origin axis lines) was removed from the Cesium viewer; this stays
    // as a no-op so the GIS API shape is unchanged for any caller.
    const gizmoMode = (_mode: string) => { /* gizmo removed — no-op */ };

    // O.7.2 — re-frame the Cesium camera to the authored Site plot. Used by the
    // post-generate 3D toggle: when the user opts into the 3D globe AFTER generate,
    // the Cesium viewer may be sitting at a stale/default view (it was mounted for
    // the DRAW step and never re-framed once the boundary committed). Re-flying to
    // the Site lat/lon lands the user looking straight at their plot instead of the
    // washed-out globe limb. Best-effort + public API only (no CesiumViewport edit).
    const reframeSiteIn3D = async (): Promise<void> => {
        if (!cesiumViewport) return;
        const viewer = cesiumViewport.getViewer?.();
        if (!viewer) return;
        // §GLOBE-CAMERA-FOLLOWS-BUILDING (2026-06-17) — PRIMARY framing path. The
        // building was just placed by placeBuildingOnGlobe() → renderBuildingOnGlobe,
        // which seats `formaMassingOrigin` (the centroid of the ACTUAL placed massing
        // in the LTP-ENU scene frame) even on the photoreal globe (it runs before the
        // frameCentroid:false guard). flyToFormaSite() frames the camera to THAT
        // building centroid — so the view follows the building to its correct
        // geocoded location. This fixes the founder's "building in the WRONG location
        // / camera looks at the wrong place": the old path below read getSiteOrigin()
        // (siteModelStore.getSite()?.location), a DIFFERENT and often-empty source
        // than the getFormaOrigin() (LTP scene-frame) that actually anchors the
        // building — when empty it logged "no Site location yet — leaving camera
        // as-is", stranding the camera at a stale view while the building sat correctly
        // elsewhere. flyToFormaSite() is public, Cesium-only, and no-ops cleanly when
        // no massing has been placed (then we fall through to the Site-location flyTo).
        if (typeof cesiumViewport.flyToFormaSite === 'function' && cesiumViewport.hasFormaMassingPlaced?.()) {
            try {
                cesiumViewport.flyToFormaSite();
                console.log('[gis] reframeSiteIn3D: framed camera to the placed building (formaMassingOrigin).');
                return;
            } catch (err) {
                console.warn('[gis] reframeSiteIn3D: building-anchored flyTo failed, falling back to Site location:', err);
            }
        }
        const o = getSiteOrigin();
        if (!o) {
            console.log('[gis] reframeSiteIn3D: no Site location yet — leaving camera as-is.');
            return;
        }
        // §SITE-FRAME-ON-TERRAIN (L-635) — DO NOT fly to a raw ellipsoid 600 m here: on a high city
        // (Madrid ~700 m) that lands the camera UNDER the terrain → blank until the user zooms out
        // (Barcelona's ~63 m ground stays below 600 m, which is why it always looked fine). CTX-DIAG
        // confirmed ALL geometry (buildings/roads/parks/water) already seats at the real ground on both
        // cities — ONLY this camera altitude was ellipsoid-relative. Delegate to the CesiumViewport's
        // terrain-aware frame: it attaches the baked terrain, samples the REAL ground and frames the
        // §SITE-VIEWPOINT-CONSISTENT preset ABOVE it — correct on every city. Keep the raw fly as a
        // fallback only if the terrain-aware method is somehow unavailable.
        try {
            if (typeof cesiumViewport.frameSiteLocationOnTerrain === 'function') {
                cesiumViewport.frameSiteLocationOnTerrain(o.lat, o.lon);
                console.log('[gis] reframeSiteIn3D: framed plot (terrain-aware) at', o);
            } else {
                const Cesium = await getCesium();
                viewer.camera.flyTo({
                    destination: Cesium.Cartesian3.fromDegrees(o.lon, o.lat, 600),
                    orientation: { heading: 0, pitch: Cesium.Math.toRadians(-55), roll: 0 },
                    duration: 1.5,
                });
                viewer.scene.requestRender();
                console.log('[gis] reframeSiteIn3D: framed plot (ellipsoid fallback) at', o);
            }
        } catch (err) {
            console.warn('[gis] reframeSiteIn3D failed (non-fatal):', err);
        }
    };

    // O.7.2 / O.7.2.b — the post-generate DUAL-VIEW toggle. Founder-tested twice:
    // after "Generate apartment" the LEFT pane went BLANK. ORIGINAL root cause: the
    // cream 2D Hektar map disposed itself on boundary-COMMIT and the onboarding flow
    // then force-activated the BIM 3D view WITHOUT turning GIS off — leaving the
    // orphaned Cesium overlay over the BIM canvas. O.7.2.b ALSO fixes the upstream
    // half: commit() now FREEZES (keeps the cream map + boundary alive) so the
    // confirm renders over a live plan map; the map is disposed ONLY here, at
    // generate-time (showSiteResultView → closeBoundaryMap2D).
    //
    // The result landing: DEFAULT to the BIM DUAL-PANE (GIS off → LEFT 3D viewport ·
    // RIGHT 2D plan via SplitViewManager — the user sees their generated apartment,
    // not white) and give an explicit, on-brand control to flip to the Cesium-3D
    // globe (the building on the globe, re-framed to the plot) and back. Reuses the
    // existing toggleGIS + view-switch + split-view plumbing.
    let resultToggle: HTMLElement | null = null;
    let resultViewMode: '2D' | '3D' = '2D';
    // §FIX-VIEWMODE-BAR-CONSOLIDATE (L-166) — the ONE view-mode control is the
    // segmented result bar (◧ 3D + plan · ◉ 3D globe · ◉ 3D Site). `activeSegment`
    // is the tri-state truth of which of the THREE top-level modes is active — it
    // paints all three segments (so the user ALWAYS knows which view they're in)
    // and gates the globe-only sub-controls. The Forma ("3D Site") view is no longer
    // a rival bar that REPLACES this one: it mounts a SECONDARY contextual sub-bar
    // beneath it while `activeSegment === 'forma'` keeps ◉ 3D Site lit here.
    let activeSegment: '2D' | '3D' | 'forma' = '2D';
    let btn2dRef: HTMLButtonElement | null = null;
    let btn3dRef: HTMLButtonElement | null = null;
    let formaBtnRef: HTMLButtonElement | null = null;

    // §GLOBE-FIDELITY (founder) — mirror the Forma view's [Real][Massing] toggle on
    // the photoreal "3D globe" result view. 'real' (the default — matches today's
    // behaviour where the globe overlays the full PRYZM model on the tiles) shows the
    // authored building; 'massing' shows the abstract Forma massing blocks ON the
    // tiles instead. The fidelity buttons live in the result-view bar and are shown
    // ONLY while the "3D globe" mode is active (scoped exactly like the Forma toggle's
    // own fidelity buttons are scoped to the Forma canvas).
    let globeBuildingFidelity: 'massing' | 'real' = 'real';
    let globeFidelityWrap: HTMLElement | null = null;
    let refreshGlobeFidelityButtons: () => void = () => { /* bar not mounted yet */ };
    // §CESIUM-PERF-GLOBE-GLB-CACHE (2026-07-01) — signature cache for the REAL-model
    // GLB export on the PHOTOREAL globe path (mirrors the Forma path's formaReal* set).
    // The globe path previously re-exported the ~22 MB GLB on EVERY entry; these let it
    // export ONCE per geometry-version and reuse the placed model across view switches.
    // `computeBuildingSignature()` (defined below) folds element counts + coarse geom.
    let globeRealLastSig: string | null = null;
    let globeRealExporting = false;
    let globeRealPlaced = false;
    // §GLOBE-ZOOM-DEFAULT (founder, 2026-06-17) — the "Zoom to Site" affordance used
    // to live ONLY on the Forma toggle bar (mounted exclusively by "Site 3D (Forma)"),
    // so on the photoreal "3D globe" path the user had no way to reframe to the house.
    // We mount it in the RESULT bar too, shown whenever the 3D-globe mode is active
    // (same gating as the fidelity group), so it is visible BY DEFAULT once the globe
    // view is entered.
    let globeZoomBtn: HTMLButtonElement | null = null;
    // §FLY-TOUR (founder, 2026-06-17) — "▶ Fly tour" cinematic flythrough button,
    // mounted next to "Zoom to Site" on the 3D-globe result bar. Enabled only once
    // a building is placed (hasFormaMassingPlaced); disabled while a tour runs.
    let globeTourBtn: HTMLButtonElement | null = null;

    const removeResultToggle = (): void => {
        if (resultToggle?.parentElement) resultToggle.parentElement.removeChild(resultToggle);
        resultToggle = null;
        btn2dRef = null;
        btn3dRef = null;
        formaBtnRef = null;
        globeFidelityWrap = null;
        globeZoomBtn = null;
        globeTourBtn = null;
        refreshGlobeFidelityButtons = () => { /* bar gone */ };
    };

    // Active-state styling for the toggle buttons (no <style> injection — inline,
    // on-brand white / #6600FF).
    const styleResultBtn = (el: HTMLButtonElement | null, active: boolean): void => {
        if (!el) return;
        el.style.background = active ? '#6600FF' : 'transparent';
        el.style.color = active ? '#ffffff' : '#6600FF';
    };
    const refreshResultButtons = (): void => {
        // §FIX-VIEWMODE-BAR-CONSOLIDATE (L-166) — paint all THREE top-level segments
        // from the single `activeSegment` truth so the active view is ALWAYS visible
        // (the founder's "I don't know which view I'm in"). ◉ 3D Site (forma) is now a
        // first-class lit segment, not an unpainted launch button.
        styleResultBtn(btn2dRef, activeSegment === '2D');
        styleResultBtn(btn3dRef, activeSegment === '3D');
        styleResultBtn(formaBtnRef, activeSegment === 'forma');
        const globeActive = activeSegment === '3D';
        // §GLOBE-FIDELITY — the [Real][Massing] group is only meaningful on the
        // photoreal "3D globe" view; hide it on the BIM dual-pane + Forma modes.
        if (globeFidelityWrap) globeFidelityWrap.style.display = globeActive ? 'flex' : 'none';
        // §GLOBE-ZOOM-DEFAULT — "Zoom to Site" is only meaningful on the 3D globe
        // (it reframes the Cesium camera to the placed building); hide otherwise.
        if (globeZoomBtn) globeZoomBtn.style.display = globeActive ? 'inline-block' : 'none';
        // §FLY-TOUR — same gating as Zoom to Site; also disabled (greyed) until a
        // building is placed, since the tour orbits the placed massing centroid.
        if (globeTourBtn) {
            globeTourBtn.style.display = globeActive ? 'inline-block' : 'none';
            const canTour = cesiumViewport?.hasFormaMassingPlaced?.() ?? false;
            globeTourBtn.disabled = !canTour;
            globeTourBtn.style.opacity = canTour ? '1' : '0.45';
            globeTourBtn.style.cursor = canTour ? 'pointer' : 'not-allowed';
        }
    };

    // O.7.2.b — land the generated result on the FIXED DUAL-PANE: LEFT = 3D
    // viewport, RIGHT = 2D plan (the editor's SplitViewManager secondary pane). GIS
    // off reveals the BIM canvas; activating the 3D view + opening the split-view
    // gives the founder-specified "LEFT 3D · RIGHT plan" without the Cesium globe.
    const applyBimDualPane = async (): Promise<void> => {
        if (_gisActive) toggleGIS(false);
        try {
            if (props._viewController) await props._viewController.activate('3D');
            else if (props.navManager) { props.grid.fade = true; await props.navManager.setViewMode('3D' as any); }
        } catch (err) {
            console.warn('[gis] applyBimDualPane: 3D activation failed (non-fatal):', err);
        }
        // Open the secondary plan pane (RIGHT). Idempotent — activate() is a no-op
        // when already active; auto-open on project-load may already have run.
        try {
            const svp = window.splitViewManager as { isActive?: boolean; activate?: () => void } | undefined;
            if (svp?.activate && !svp.isActive) svp.activate();
        } catch (err) {
            console.warn('[gis] applyBimDualPane: split-view activate failed (non-fatal):', err);
        }
    };

    /**
     * §FEAT-VIEW-ACTIVATION-LOADING-OVERLAY (L-270) — open a loading session on the SHARED
     * overlay for a Cesium view activation and GATE the scene until it is genuinely ready.
     *
     * The signals port is bound LATE (each closure reads the live `cesiumViewport`), because
     * `toggleGIS(true)` constructs the viewport asynchronously — the producer subscribes to the
     * tile counters only after `whenViewerReady()` resolves.
     *
     * Everything the producer waits on is a REAL signal that already existed:
     *   • whenReady()            — the viewer is mounted (already used by awaitCesiumReady).
     *   • onTileLoadProgress()   — Cesium's own pending/processing tile counters.
     *   • whenGroundSettled()    — the L-259 (§FIX-CESIUM-GLOBE-ELEVATION-AND-GEOREF) ground
     *                              seat-and-reveal terminal: the building is anchored on ground
     *                              that has been MEASURED. That is the whole point — L-259 was
     *                              caused by acting BEFORE that signal.
     */
    const startViewActivationLoading = (
        target: ViewActivationTarget,
        retry: () => void,
    ): ViewActivationHandle => {
        // Rapid view switching must never stack overlays — supersede the previous activation.
        activeViewActivation?.cancel('superseded by a new view activation');
        const handle = beginViewActivationLoading({
            target,
            overlay: getLoadingOverlay(),
            onRetry: retry,
            signals: {
                whenViewerReady: () => awaitCesiumReady(),
                // §SS-FIX-FORMA-TILES-READINESS-KEYLESS-GATE (L-327) — tell the (Cesium-free)
                // readiness state machine whether tiles will EVER stream. A keyless flat-ground
                // Forma study has no provider → the tiles gate is skipped instead of stalling for
                // 25 s. Bound late like the other closures (reads the live viewport). Null viewport
                // → false (skip): there is no viewer to stream tiles, so gating would only hang.
                hasRealTileProvider: () => cesiumViewport?.hasRealTileProvider?.() ?? false,
                onTileLoadProgress: (cb) =>
                    (cesiumViewport?.onTileLoadProgress?.(cb) as (() => void) | undefined) ??
                    (() => { /* old build / no viewer — the poll below still drives the bar */ }),
                sampleTileLoadProgress: () =>
                    cesiumViewport?.sampleTileLoadProgress?.() ??
                    { pending: 0, processing: 0, tilesLoaded: true },
                whenGroundSettled: () =>
                    cesiumViewport?.whenGroundSettled?.() ??
                    Promise.resolve({ settled: true, source: 'no-viewport', baseHeightM: 0 }),
                setNavigationEnabled: (on: boolean) => { cesiumViewport?.setNavigationEnabled?.(on); },
                // §TILES-NEED-A-FRAME (L-715) — let the readiness gate DRIVE the scene it is
                // waiting on. Under `requestRenderMode: true` tile work is only retired during a
                // render, so once the entry flight parks the camera the scene goes quiescent and
                // any outstanding tile freezes — the founder's 19/20, on every new project.
                requestRender: () => { cesiumViewport?.requestSceneRender?.(); },
            },
        });
        activeViewActivation = handle;
        void handle.done.then(() => {
            if (activeViewActivation === handle) activeViewActivation = null;
        });
        return handle;
    };

    /**
     * L-270 — register an in-flight content placement (the GLB export + Cesium primitive load)
     * with the active view activation, so the overlay stays up until the building has ACTUALLY
     * landed on the globe/site — not merely until the massing call returned.
     */
    const trackViewActivationPlacement = (p: Promise<unknown>): void => {
        activeViewActivation?.trackPlacement(p);
    };

    const applyResultView = async (mode: '2D' | '3D'): Promise<void> => {
        // §FIX-VIEWMODE-BAR-CONSOLIDATE (L-166) — choosing a top-level 2D/3D segment
        // leaves the Forma "3D Site" view, so tear down its secondary sub-bar (no-op
        // when it isn't mounted). Keeps exactly ONE contextual sub-bar at a time.
        removeFormaViewToggle();
        resultViewMode = mode;
        activeSegment = mode;
        if (mode === '3D') {
            // §FEAT-VIEW-ACTIVATION-LOADING-OVERLAY (L-270) — the founder's "3D globe" takes
            // seconds (Cesium mount → photoreal tile streaming → GLB export → the L-259 ground
            // clamp) and used to show NOTHING while the user could already fly a half-assembled
            // scene. Put the SHARED overlay up NOW (synchronously, before any await) and gate
            // input until the readiness chain completes.
            const activation = startViewActivationLoading('globe', () => {
                // §FIX-GLOBE-CLICK-NAVIGATES-OUT (L-318) — the retry re-runs the globe activation;
                // contain any throw/rejection so a failing retry never escapes as an unhandled
                // rejection (which the ViewportCrashGuard does NOT catch → ejects the user to /projects).
                void containViewActivation(() => applyResultView('3D'), (m) => activeViewActivation?.fail(m), 'The 3D globe failed to open');
            });
            // Show the Cesium globe with the site context and frame the plot.
            // §FIX-GISLAYOUT-…-GLOBE-REENTRY (L-193, Symptom B) — this orchestrator drives its
            // OWN placement below (restorePhotorealGlobeContent), so suppress the synchronous
            // re-activation-branch placement to avoid a double-place. toggleGIS runs the
            // re-activation branch SYNCHRONOUSLY, so the flag is only live for that tick.
            gisReactivationSelfPlaceSuppressed = true;
            try {
                toggleGIS(true);
            } catch (err) {
                // §FIX-GLOBE-CLICK-NAVIGATES-OUT (L-318) — a SYNCHRONOUS throw from toggleGIS must NOT
                // escape this void-ed async call as an unhandled rejection. The ViewportCrashGuard only
                // swallows GPU/render-keyword unhandled errors; a Cesium/GIS activation error slips its
                // net and propagates to the router/global handler that navigates to /projects (or hard-
                // reloads) — ejecting the founder from the editor. Keep it IN-editor: surface L-313 retry.
                console.error('[gis] §FIX-GLOBE-CLICK-NAVIGATES-OUT globe toggleGIS threw — contained (in-editor retry):', err);
                activation.fail(`The 3D globe failed to open: ${String((err as Error)?.message ?? err)}`);
            } finally {
                gisReactivationSelfPlaceSuppressed = false;
            }
            // toggleGIS mounts Cesium async on first use. L-270 — await the viewer's REAL ready
            // signal (awaitCesiumReady) instead of the old fixed 350 ms guess, which on a cold
            // mount fired BEFORE the viewport existed → renderBuildingOnGlobe no-oped and the
            // globe opened empty. On FIRST mount the re-activation branch does NOT run, so this
            // is the sole placement path there; on a re-entry the branch was suppressed above.
            void awaitCesiumReady()
                .then(() => {
                    restorePhotorealGlobeContent();
                    // The ground clamp is now armed → it is safe to await whenGroundSettled().
                    activation.contentIssued();
                })
                .catch((err: unknown) => {
                    activation.fail(`The 3D globe failed to open: ${String((err as Error)?.message ?? err)}`);
                });
        } else {
            // O.7.2.b — '2D' now means the BIM DUAL-PANE (LEFT 3D · RIGHT plan), the
            // founder-specified post-generate landing, not the Cesium globe.
            await applyBimDualPane();
        }
        refreshResultButtons();
    };

    /**
     * §FIX-VIEWMODE-BAR-CONSOLIDATE (L-166) — build the ONE segmented view-mode bar
     * (◧ 3D + plan · ◉ 3D globe · ◉ 3D Site + the globe sub-controls). IDEMPOTENT:
     * a no-op when the bar already exists, so it can be called from EVERY entry path
     * (onboarding generate, the always-on "3D Site / Globe" launcher, the GIS rail)
     * without duplicating or replacing the bar. It only builds DOM — it does NOT pick
     * a landing view (callers drive that via applyResultView / mountFormaViewToggle).
     */
    const mountResultToggleBar = (): void => {
        if (resultToggle) return; // the single bar is already mounted.
        const viewport = document.getElementById('container');
        if (!viewport) {
            console.error('[gis] mountResultToggleBar: #container not found');
            return;
        }
        if (viewport.style.position !== 'absolute' && viewport.style.position !== 'relative') {
            viewport.style.position = 'relative';
        }
        // (Re)build the floating control so it sits ABOVE the Cesium overlay (z 20).
        removeResultToggle();
        const bar = document.createElement('div');
        bar.className = 'pryzm-result-toggle';
        bar.setAttribute('data-testid', 'gis-result-view-toggle');
        Object.assign(bar.style, {
            // §A.10.h (founder) — CENTRED over the 3D view (was left:12px, clipped
            // behind the left icon rail / "not visible"). Absolute within the
            // position:relative viewport + left:50% + translateX(-50%) → the bar
            // stays centred and DYNAMICALLY adapts when the viewport width changes
            // (e.g. a side panel resizes the 3D view). Sits just below the top
            // save/Author/Inspect/Data toolbar.
            position: 'absolute', top: '64px', left: '50%', transform: 'translateX(-50%)',
            zIndex: '30', display: 'flex', gap: '4px', padding: '4px',
            background: '#ffffff', borderRadius: '10px',
            boxShadow: '0 4px 18px rgba(20,10,60,0.18)', border: '1px solid #ece7fb',
            font: '600 12px/1 system-ui, sans-serif',
            whiteSpace: 'nowrap',
        } satisfies Partial<CSSStyleDeclaration>);

        const mkBtn = (mode: '2D' | '3D', label: string): HTMLButtonElement => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'pryzm-result-toggle-btn';
            b.setAttribute('data-result-mode', mode);
            b.textContent = label;
            Object.assign(b.style, {
                appearance: 'none', border: 'none', cursor: 'pointer',
                padding: '7px 14px', borderRadius: '7px', color: '#6600FF',
                background: 'transparent', font: 'inherit',
            } satisfies Partial<CSSStyleDeclaration>);
            b.addEventListener('mouseenter', () => { if (activeSegment !== mode) b.style.background = '#f4f0ff'; });
            b.addEventListener('mouseleave', () => { if (activeSegment !== mode) b.style.background = 'transparent'; });
            // §FIX-GLOBE-CLICK-NAVIGATES-OUT (L-318) — the "3D globe" segment click. Contain any
            // throw/rejection so a globe-activation failure surfaces the in-editor retry overlay and
            // NEVER escapes as an unhandled rejection to the crash-guard-blind router navigate-out.
            b.addEventListener('click', () => {
                void containViewActivation(() => applyResultView(mode), (m) => activeViewActivation?.fail(m), 'The 3D view failed to open');
            });
            return b;
        };
        btn2dRef = mkBtn('2D', '◧ 3D + plan');
        btn3dRef = mkBtn('3D', '◉ 3D globe');
        bar.appendChild(btn2dRef);
        bar.appendChild(btn3dRef);

        // FORMA.3 — a third, prominent entry to the Cesium "massing study" view,
        // right where the founder lands after Generate. Distinct from the BIM
        // "3D + plan" dual-pane and the photoreal "3D globe": this mounts the
        // [2D Map][Plan][3D] Forma toggle and lands on the Forma PLAN-oblique
        // (the Forma signature look — white shadowed massing, near-top-down).
        const formaBtn = document.createElement('button');
        formaBtn.type = 'button';
        formaBtn.className = 'pryzm-result-toggle-btn';
        formaBtn.setAttribute('data-result-mode', 'forma');
        formaBtn.setAttribute('data-testid', 'gis-result-forma');
        formaBtn.textContent = '◉ 3D Site';
        formaBtn.title = 'Open the Cesium massing study — white extruded buildings on your real-world plot';
        Object.assign(formaBtn.style, {
            appearance: 'none', border: 'none', cursor: 'pointer',
            padding: '7px 14px', borderRadius: '7px', color: '#6600FF',
            background: 'transparent', font: 'inherit', borderLeft: '1px solid #ece7fb',
        } satisfies Partial<CSSStyleDeclaration>);
        formaBtn.addEventListener('mouseenter', () => { if (activeSegment !== 'forma') formaBtn.style.background = '#f4f0ff'; });
        formaBtn.addEventListener('mouseleave', () => { if (activeSegment !== 'forma') formaBtn.style.background = 'transparent'; });
        formaBtn.addEventListener('click', () => {
            console.log(
                `[gis][forma] result-toggle: launching Forma "3D Site" view ` +
                    `(§SITE-VIEWPOINT-CONSISTENT default "${DEFAULT_3D_SITE_VIEW}").`,
            );
            // §FIX-VIEWMODE-BAR-CONSOLIDATE (L-166) — mountFormaViewToggle sets
            // activeSegment='forma' + repaints, so this segment lights up and the
            // Forma sub-bar mounts BELOW (never replacing) this segmented switch.
            mountFormaViewToggle(DEFAULT_3D_SITE_VIEW);
        });
        bar.appendChild(formaBtn);
        formaBtnRef = formaBtn;

        // §GLOBE-FIDELITY — [ ◉ Real ] [ ▢ Massing ] for the photoreal "3D globe".
        // Mirrors the Forma view's fidelity toggle (same labels, same #6600FF brand,
        // same active-paint). Wrapped in a group that is shown ONLY while the 3D globe
        // is the active result view (refreshResultButtons toggles its display) — the
        // BIM dual-pane (2D) has no globe to switch. Defaults to 'real' (today's
        // behaviour); 'massing' shows the abstract blocks on the tiles instead.
        const fidelityWrap = document.createElement('span');
        Object.assign(fidelityWrap.style, {
            display: resultViewMode === '3D' ? 'flex' : 'none',
            gap: '4px', alignItems: 'center', borderLeft: '1px solid #ece7fb',
            paddingLeft: '4px', marginLeft: '2px',
        } satisfies Partial<CSSStyleDeclaration>);
        const mkGlobeFidelityBtn = (
            fidelity: 'real' | 'massing',
            label: string,
            title: string,
        ): HTMLButtonElement => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'pryzm-globe-fidelity-btn';
            b.setAttribute('data-globe-fidelity', fidelity);
            b.setAttribute('data-testid', `globe-fidelity-${fidelity}`);
            b.textContent = label;
            b.title = title;
            Object.assign(b.style, {
                appearance: 'none', border: 'none', cursor: 'pointer',
                padding: '7px 12px', borderRadius: '7px', color: '#6600FF',
                background: 'transparent', font: 'inherit',
            } satisfies Partial<CSSStyleDeclaration>);
            b.addEventListener('mouseenter', () => { if (globeBuildingFidelity !== fidelity) b.style.background = '#f4f0ff'; });
            b.addEventListener('mouseleave', () => { refreshGlobeFidelityButtons(); });
            b.addEventListener('click', () => { setGlobeBuildingFidelity(fidelity); });
            return b;
        };
        const globeRealBtn = mkGlobeFidelityBtn('real', '◉ Real', 'Show the real PRYZM building on the globe (full elements: windows · doors · roof · furniture)');
        const globeMassingBtn = mkGlobeFidelityBtn('massing', '▢ Massing', 'Show the abstract massing study (white/pastel volumes) on the globe tiles');
        refreshGlobeFidelityButtons = (): void => {
            for (const [b, f] of [[globeRealBtn, 'real'], [globeMassingBtn, 'massing']] as const) {
                const on = globeBuildingFidelity === f;
                b.style.background = on ? '#6600FF' : 'transparent';
                b.style.color = on ? '#ffffff' : '#6600FF';
            }
        };
        refreshGlobeFidelityButtons();
        fidelityWrap.appendChild(globeRealBtn);
        fidelityWrap.appendChild(globeMassingBtn);
        bar.appendChild(fidelityWrap);
        globeFidelityWrap = fidelityWrap;

        // §GLOBE-ZOOM-DEFAULT — "Zoom to Site" on the 3D-globe result bar. Reframes
        // the Cesium camera to the PLACED BUILDING (flyToFormaSite via reframeSiteIn3D)
        // — the same building-anchored framing the Forma toggle's Zoom button uses.
        // Shown only while the 3D globe is the active result view (refreshResultButtons
        // toggles display). Brand-styled (white + #6600FF, no black) like the rest.
        const zoomToSiteBtn = document.createElement('button');
        zoomToSiteBtn.type = 'button';
        zoomToSiteBtn.className = 'pryzm-globe-zoom-btn';
        zoomToSiteBtn.setAttribute('data-testid', 'globe-zoom-to-site');
        zoomToSiteBtn.title = 'Zoom to site — reframe the camera to the placed building on the globe';
        zoomToSiteBtn.textContent = '⤢ Zoom to Site';
        Object.assign(zoomToSiteBtn.style, {
            appearance: 'none', border: 'none', cursor: 'pointer',
            padding: '7px 12px', borderRadius: '7px', color: '#6600FF',
            background: 'transparent', font: 'inherit', borderLeft: '1px solid #ece7fb',
            display: resultViewMode === '3D' ? 'inline-block' : 'none',
        } satisfies Partial<CSSStyleDeclaration>);
        zoomToSiteBtn.addEventListener('mouseenter', () => { zoomToSiteBtn.style.background = '#f4f0ff'; });
        zoomToSiteBtn.addEventListener('mouseleave', () => { zoomToSiteBtn.style.background = 'transparent'; });
        zoomToSiteBtn.addEventListener('click', () => { void reframeSiteIn3D(); });
        bar.appendChild(zoomToSiteBtn);
        globeZoomBtn = zoomToSiteBtn;

        // §FLY-TOUR (founder, 2026-06-17) — "▶ Fly tour" cinematic flythrough.
        // Runs CesiumViewport.flyTour() (overview → approach → close-up → pull-back
        // around the placed building). Brand-styled (white + #6600FF, no black);
        // disabled until a building is placed + while a tour is mid-flight.
        const tourBtn = document.createElement('button');
        tourBtn.type = 'button';
        tourBtn.className = 'pryzm-globe-tour-btn';
        tourBtn.setAttribute('data-testid', 'globe-fly-tour');
        tourBtn.title = 'Fly tour — cinematic flythrough around the placed building';
        tourBtn.textContent = '▶ Fly tour';
        Object.assign(tourBtn.style, {
            appearance: 'none', border: 'none', cursor: 'pointer',
            padding: '7px 12px', borderRadius: '7px', color: '#6600FF',
            background: 'transparent', font: 'inherit', borderLeft: '1px solid #ece7fb',
            display: resultViewMode === '3D' ? 'inline-block' : 'none',
        } satisfies Partial<CSSStyleDeclaration>);
        tourBtn.addEventListener('mouseenter', () => { if (!tourBtn.disabled) tourBtn.style.background = '#f4f0ff'; });
        tourBtn.addEventListener('mouseleave', () => { tourBtn.style.background = 'transparent'; });
        tourBtn.addEventListener('click', () => {
            if (tourBtn.disabled) return;
            const vp = cesiumViewport;
            if (!vp?.flyTour || !(vp.hasFormaMassingPlaced?.() ?? false)) {
                console.warn('[gis][forma] Fly tour: no building placed — ignored.');
                return;
            }
            if (vp.isFlyTourRunning?.()) return; // re-entrancy guard (viewport also guards)
            console.log('[gis][forma] Fly tour: launching cinematic flythrough.');
            void Promise.resolve(vp.flyTour()).finally(() => { refreshResultButtons(); });
            refreshResultButtons();
        });
        bar.appendChild(tourBtn);
        globeTourBtn = tourBtn;

        viewport.appendChild(bar);
        resultToggle = bar;
        refreshResultButtons(); // paint the current activeSegment on the fresh bar.
        console.log('[gis] mountResultToggleBar: segmented view-mode switch mounted.');
    };

    // §FIX-VIEWMODE-BAR-CONSOLIDATE (L-166) — guarantee the ONE segmented switch is
    // present. Called by every site/globe/forma entry so the top-level view switch is
    // ALWAYS visible (fixes the launcher path that used to open the Forma bar alone,
    // leaving the user unable to tell which view they were in or swap out of it).
    const ensureResultToggle = (): void => { mountResultToggleBar(); };

    /**
     * O.7.2 — mount the post-generate view switch + land on the chosen view. Called
     * by the onboarding generate-finish handoff (window.pryzmShowSiteResultView).
     * `initial` is the view to land on first ('2D' plan by default — the no-blank fix).
     */
    const showSiteResultView = (initial: '2D' | '3D' = '2D'): void => {
        // O.7.2.b — GENERATE-TIME teardown of the cream 2D plan map. After the
        // boundary commit the map stayed alive (so the confirm step rendered over a
        // live plan map); this is the ONLY place it is disposed — reached exclusively
        // via the onboarding "Generate" action's pryzmShowSiteResultView() handoff.
        closeBoundaryMap2D();
        mountResultToggleBar();
        console.log(`[gis] showSiteResultView: landing on "${initial}".`);
        // §FIX-GLOBE-CLICK-NAVIGATES-OUT (L-318) — onboarding "Generate" landing; contain any
        // activation failure so it surfaces in-editor retry rather than ejecting the user to /projects.
        void containViewActivation(() => applyResultView(initial), (m) => activeViewActivation?.fail(m), 'The 3D view failed to open');
    };

    // O.7.2 — window-hook handoff for the onboarding generate-finish step (same idiom
    // as pryzmToggleGIS / pryzmStartBoundaryDraw). OnboardingStepController calls this
    // INSTEAD of force-activating the BIM 3D view over an orphaned Cesium overlay.
    window.pryzmShowSiteResultView = (initial?: '2D' | '3D') => showSiteResultView(initial ?? '2D');
    window.pryzmHideSiteResultToggle = () => removeResultToggle();
    // O.7.2.b — explicit generate-time teardown of the cream 2D plan map. The
    // onboarding "Generate" handler may call this directly; showSiteResultView()
    // also calls closeBoundaryMap2D() so the map is gone before the result view
    // mounts. Idempotent + double-dispose safe.
    window.pryzmCloseBoundaryMap2D = () => closeBoundaryMap2D();
    // §L-384 — RE-DRAW hook: the onboarding "← Back to drawing" action clears the
    // committed (immutable) boundary + re-arms the live 2D map for a fresh draw.
    window.pryzmRearmBoundaryDraw = () => rearmBoundaryDraw();

    // O.2 — onboarding step-controller GIS-activation handoff. The guided
    // first-run flow (OnboardingStepController) has no clean runtime hook to
    // toggle GIS, so expose the SAME window-hook idiom A.8.c established for
    // pryzmStartBoundaryDraw. Registered here (not inside the async Cesium mount)
    // so it works BEFORE Cesium has mounted — calling it kicks off the mount.
    window.pryzmToggleGIS = (active: boolean) => toggleGIS(active);

    // §STARTUP-EAGER-GLOBE (founder 2026-08-10, 3× project-launch globe) — onboarding announced
    // a globe-first flow BEFORE this engine boot started (`PlatformRouter.showOnboarding` →
    // `requestEagerGlobeStart()`). Start the Cesium init NOW, in parallel with the remaining
    // boot (stores/bridges/tools/UI still to come), into a WARM-HIDDEN container so the base
    // imagery streams while the user is still watching the loading overlay. One-shot + scoped:
    // a hub project open (no onboarding) never consumes the flag, so nothing eager-mounts there.
    if (consumeEagerGlobeStart()) {
        markStartupPhase('globe:eager-init-start'); // §STARTUP-BUDGET
        void ensureGisInitialized('eager').then(() => {
            markStartupPhase('globe:eager-init-done'); // §STARTUP-BUDGET
        });
    }

    // PRYZM-EARTH-ONBOARDING PRD Milestone 2 (§9/§10) — resolve the ONE Cesium viewport as a
    // `GlobeCameraHost` for `GlobeHeroSearch`/`SiteEntryStore`. A resolver over the closure
    // variable (not a captured reference) so it always returns the CURRENT viewport, including
    // across a device-loss dispose+recreate, and returns `null` before `toggleGIS(true)` has
    // mounted one yet — mirrors the `pryzmToggleGIS` idiom directly above.
    window.pryzmGetSiteEntryCameraHost = () => cesiumViewport;
    // §SITE-ENTRY-GLOBE-READY — the real readiness signal `GlobeHeroSearch.mount()` awaits
    // before its first `frameCurrent()` call, closing the "no globe mounted — camera target
    // dropped" race (PRD §16). Resolves once `toggleGIS(true)`'s FIRST activation has finished
    // `cesiumViewport.mount()` (or failed it — see the `.catch` above); pre-resolved before any
    // activation, and never re-armed by later re-activations (the viewport stays ready).
    window.pryzmGetSiteEntryCameraHostReady = () => _cameraHostReady;

    // O.2 (zoom-to-address defect) — let the onboarding location step seed the SAME
    // `lastGeocodeFrame` the GIS-rail search box populates via onFlyTo. The
    // onboarding flow geocodes through its OWN path (OnboardingStepController.
    // handleGeocode), so without this the bbox is lost and getMapInitial() can only
    // return a coarse point — the 2D map opened at a flat point/world zoom and the
    // user had to zoom manually. Calling this BEFORE pryzmStartBoundaryDraw() makes
    // getMapInitial() carry the bbox → SiteBoundaryMap2D fitBounds to the plot.
    window.pryzmSetGeocodeFrame = (frame) => {
        if (!frame || !Number.isFinite(frame.lat) || !Number.isFinite(frame.lon)) {
            console.warn('[gis] pryzmSetGeocodeFrame: ignoring invalid frame', frame);
            return;
        }
        lastGeocodeFrame = { lat: frame.lat, lon: frame.lon, bbox: frame.bbox };
        noteLayoutOwner(); // §L-676-B — this frame belongs to THIS project.
        console.log('[gis] pryzmSetGeocodeFrame: geocode frame set for 2D map fitBounds →', lastGeocodeFrame);
    };

    // A.8.c.f — register the 2D Hektar boundary-draw console hook HERE (not inside
    // the Cesium mount) so the 2D draw surface is independent of the Cesium viewer:
    // the user can draw a parcel on the clean cream plan-view map without first
    // mounting the 3D globe. (Re-registered inside the mount too, harmlessly.)
    window.pryzmStartBoundaryDraw = () => startBoundaryDraw();
    window.pryzmCancelBoundaryDraw = () => cancelBoundaryDraw();
    // §FIX-SITE-OVERLAY-IMPORT-TERMINAL (L-70) — open the 2D map in OVERLAY-ONLY mode (draw
    // disarmed) for the PDF/image import path. The onboarding overlay branch calls this
    // instead of pryzmStartBoundaryDraw so no boundary can be traced + no generate is armed.
    window.pryzmStartSitePlanOverlayImport = () => startBoundaryDraw({ overlayOnly: true });
    // §FIX-SITE-OVERLAY-ENTER-CANVAS (L-78) — land the user in a BIM editor view (activateView
    // EXITS GIS first, then routes through ViewController) so the site-plan underlay they just
    // imported is actually on screen. The overlay-import "✓ Finish" calls this with 'Top' (plan
    // view). Returns the activateView promise so the caller can await the GIS-exit + switch,
    // then zoom-to-fit onto the underlay.
    window.pryzmActivateBimView = (mode) =>
        activateView((mode ?? 'Top') as 'Top' | '3D' | 'Front' | 'Back' | 'Left' | 'Right');

    // ════════════════════════════════════════════════════════════════════════
    // FORMA.3 — 3D Forma massing view + [Plan View][3D View] toggle (SPEC §3–§5)
    // ════════════════════════════════════════════════════════════════════════
    //
    // READ SOURCE (SPEC §4, NON-GOALS §8.2/§8.4 — read-only consumer):
    //   • Parcel boundary  ← runtime.siteModelStore.getParcelBoundary().polygon
    //                        (already scene-XZ metres, the SAME frame the
    //                        ParcelBoundarySceneRenderer + apartment generator use).
    //   • Authored massing ← storeRegistry.getStoreForType('wall').getAll()
    //                        each wall's baseLine (scene-XZ) + height + thickness.
    //   • ENU origin       ← siteModelStore.getLocation() lat/lon (the scene origin).
    //
    // The Cesium-side ENU bridge (eastNorthUpToFixedFrame at the site origin) +
    // the white extrusions + the NW oblique flyTo all live in CesiumViewport
    // (FORMA.3 methods). This layer only READS PRYZM domain state and forwards it.

    type XZ = { x: number; z: number };

    /** Read the site geographic origin (= the scene-XZ ENU anchor). null when 0,0.
     *
     * §FORMA-ORIGIN-IS-SCENE-FRAME (2026-06-05) — the parcel boundary AND the
     * authored walls are projected in the LTP-ENU frame: `boundaryProjection`
     * bakes the boundary XZ relative to the LTP origin, which the boundary commit
     * pins to the FIRST DRAWN VERTEX (`siteDispatch.setLtpOriginIfSafe` →
     * "LTPENURebase.setOrigin … from first vertex"). The Forma ENU frame MUST be
     * anchored at that SAME origin, or the boundary + massing render OFFSET from
     * where the user drew them (the founder-reported "placed slightly in a
     * different location"). `getCurrentSiteOrigin()` IS that scene-frame origin;
     * `siteModelStore.getLocation()` is the geocoded ADDRESS — a DIFFERENT point
     * once a boundary is committed (~10-15 m away). So resolve the LTP origin
     * FIRST and use the address only as a pre-boundary fallback. */
    // §SEAM-2 INCREMENT 2 (L-604 / C12 §1.5) — the 3D-Site render frame reads the SAME single origin
    // authority (`resolveSiteFrameOrigin`) as the parcel-ring projection (`getSiteOrigin`), so the
    // ring and the ENU frame are built about ONE origin and cannot diverge (the residual Seam-2 shift
    // fix — see resolveSiteFrameOrigin's header). Precedence: LTP-ENU origin (the scene frame, C12
    // §1.5) → geocoded store location → last geocode frame.
    const getFormaOrigin = (): { lat: number; lon: number } | null => {
        const loc = (runtime?.siteModelStore as
            | { getLocation?: () => { latitude: number; longitude: number } | null }
            | undefined)?.getLocation?.();
        return resolveSiteFrameOrigin(getCurrentSiteOrigin(), loc, lastGeocodeFrame);
    };

    /** Read the committed parcel boundary ring (scene-XZ), or null.
     *
     * §L-412 Bug-2 (boundary→3D-render handoff) — resolve the C19 `SiteModelStore`
     * the SAME way the draw/select commit does (`resolveSiteContext`:
     * `runtime ?? window.runtime`). The boundary is committed through `siteDispatch`
     * against `window.runtime`'s store whenever GISAreaLayout was handed a null/stale
     * `runtime` (the `createMainLayout(props, runtime=null)` legacy boot path,
     * Layout.ts:86/92). Reading ONLY the captured `runtime` here diverged from the
     * store the boundary actually landed in: the ORIGIN and ENVELOPE survived (they
     * read the `siteDispatch` module globals `getCurrentSiteOrigin` /
     * `getLastBuildableEnvelope`, populated on the same commit), but the boundary —
     * read straight off `runtime.siteModelStore` — came back null, so the 3D Site
     * logged "no parcel boundary yet" even though the plot committed and the envelope
     * computed. Resolving the store identically to the commit makes the ONE committed
     * boundary (drawn OR selected) reach the Forma render — same C19 spine, no second
     * store. */
    const getFormaBoundary = (): XZ[] | null => {
        const b = getCommittedParcelBoundary();
        return b && b.polygon.length >= 3 ? b.polygon.map((p) => ({ x: p.x, z: p.z })) : null;
    };

    /**
     * §L-412 Bug-2, SECOND SITE (§MURCIA-CARD-PARCEL-RING, L-676) — the ONE committed C19
     * boundary, resolved the way the COMMIT resolves it (`runtime ?? window.runtime`).
     *
     * ⚠ WHY THIS IS EXTRACTED RATHER THAN COPIED. `getFormaBoundary` above already carried this
     * resolution, but the site-data card (`buildSiteDataBlock`) read `runtime?.siteModelStore`
     * DIRECTLY and had no `window.runtime` fallback. On the legacy boot path
     * (`createMainLayout(props, runtime = null)`, Layout.ts:86/92) the boundary is committed
     * against `window.runtime`'s store, so the card's read returned `undefined` → `parcelRing = []`
     * → the whole PARCEL group AND the `Footprint / parcel` row rendered as the EMPTY STRING.
     * The envelope rows survived because they come from the `siteDispatch` module globals, so the
     * card showed massing numbers with nothing to check them against — the founder could not judge
     * whether an RM1 footprint made sense because the plot it sits in was silently absent.
     * Two readers of one committed value must not resolve it two ways; hence one resolver.
     */
    const getCommittedParcelBoundary = (): {
        polygon: ReadonlyArray<XZ>;
        /**
         * §GR-10/GR-14 — `null` means NOBODY CLASSIFIED THE EDGES, which is not
         * the same fact as "no edge is street frontage". The old `?? []` merged
         * the two and the card then printed the negative one. See
         * `parcelEdgeClassificationDetermination.ts`.
         */
        edgeClassifications: ReadonlyArray<string> | null;
    } | null => {
        type BoundaryStore = {
            getParcelBoundary?: () => {
                polygon?: ReadonlyArray<XZ>;
                edgeClassifications?: ReadonlyArray<string>;
            } | null;
        };
        const captured = runtime?.siteModelStore as BoundaryStore | undefined;
        const store: BoundaryStore | undefined =
            (captured?.getParcelBoundary ? captured : undefined) ??
            (typeof window !== 'undefined'
                ? (window.runtime as unknown as { siteModelStore?: BoundaryStore } | undefined)?.siteModelStore
                : undefined);
        const b = store?.getParcelBoundary?.();
        const poly = b?.polygon;
        if (!poly || poly.length < 3) return null;
        return {
            polygon: poly,
            // Length-aware: the schema DEFAULTS this array to `[]`, so a committed
            // but never-classified parcel carries `[]` against a real polygon —
            // that is the unrecorded state, not a landlocked finding (C19 §2.7).
            edgeClassifications: parcelEdgeClassificationsOrUnknown(b?.edgeClassifications, poly.length),
        };
    };

    /**
     * §A.21.D24 — read authored walls (the massing) from the wall store:
     * baseLine + h + t + the STOREY BASE ELEVATION.
     *
     * Per `packages/schemas/src/elements/Wall.ts`, a wall's `baseLine` is a pair
     * of Vec3 whose `y` carries the LEVEL ELEVATION (the §WALL-AUDIT-2026-M7
     * convention), and `baseOffset` is an extra vertical offset from the level
     * base. The earlier reader dropped `y`/`baseOffset` entirely → every storey
     * collapsed onto the ground and renderFormaMassing only ever showed one
     * ground-floor block. We now carry `baseElevation = baseLine[0].y +
     * baseOffset` (+ `levelId` for grouping) so the Cesium overlay can STACK each
     * storey at its true elevation. Single-storey / apartment models have y=0 on
     * every wall, so this is a no-op for them.
     */
    const getFormaWalls = (): FormaMassingWall[] => {
        // §MASSING-FOLLOWS-THE-ARC (L-11172) — the record → massing-wall mapping is the pure
        // `formaWallFromRecord` (geospatial/formaWallCurve.ts). Its straight branch is the
        // object this closure built before, key for key; a record with `Wall.curve` now ALSO
        // carries the Bézier (control + segments + the archived pre-trim baseline), so the
        // globe massing follows the arc instead of cutting the corner across its chord.
        // §A.21.D-GLOBE3's `materialColor` — the SAME per-wall finish hex the three.js BIM
        // scene renders (WallFragmentBuilder: `wall.materialColor ?? '#d4c5b0'`) — still rides
        // along, so the house on the photoreal globe reads in its real app-scene colours.
        const wallStore = storeRegistry.getStoreForType('wall') as unknown as
            | { getAll?: () => FormaWallRecordLike[] }
            | undefined;
        const all = wallStore?.getAll?.() ?? [];
        const out: FormaMassingWall[] = [];
        for (const w of all) {
            const mapped = formaWallFromRecord(w);
            if (mapped) out.push(mapped);
        }
        return out;
    };

    // ════════════════════════════════════════════════════════════════════════
    // §A.21.D25 — read the building's OTHER elements so the Forma globe view is
    // not WALLS-ONLY. Slabs/floors + the roof give the building its solidity and
    // a closed top (it reads as a real building, not floating wall blocks).
    // Furniture is an OPTIONAL coarse representation, hard-capped so it never
    // adds thousands of Cesium entities (perf). All three are READ-ONLY pulls
    // from the element stores (same idiom as getFormaWalls) and feed the SAME
    // massing path (footprint + elevation + height per band). Each reader is
    // tolerant of an absent store / empty model → returns [] (single-storey +
    // apartment models without slabs/roof simply contribute nothing extra).
    // ════════════════════════════════════════════════════════════════════════

    /**
     * §A.21.D25 — build a `levelId → baseElevation` map from the (working) wall
     * reader. The runtime slab/roof records do NOT carry their world elevation
     * (slab `position.y` is always 0 — world Y is resolved at projection time
     * from the level; roof elevation lives on the level too), so we borrow the
     * per-storey elevation the walls already resolve correctly. This is exactly
     * the elevation the wall massing stacks each storey at, so slabs/roofs line
     * up with their storey.
     *
     * §ROOF-FORMA (2026-06-09) — the house generator now mints a DEDICATED "Roof"
     * level ABOVE the top storey (§ROOF-LEVEL in HouseLayoutExecutor) and creates
     * the roof there with `baseOffset: 0`; the level's OWN `elevation` already
     * encodes the top-storey wall head. That roof level has NO WALLS, so the
     * walls-only map never contained it → the roof resolved to elevation 0 and
     * rendered buried at ground level (the founder's "roof disappeared from the
     * FORMA view"). FIX: SEED the map from the authoritative level store
     * (`bimManager.getLevels()`, elevation in metres — same unit + convention the
     * walls resolve to, see AddLevelCommand) so EVERY level — wall-less roof
     * levels included — has its true world elevation. Walls then OVERRIDE per
     * level (they take precedence, preserving the prior storey behaviour exactly
     * for levels that DO have walls). Levels still unknown fall back to ground (0).
     */
    const levelElevationFromWalls = (): Map<string, number> => {
        const map = new Map<string, number>();
        // Seed from the level store first (covers wall-less levels like the roof
        // level); units are metres, the same as the wall-derived elevations below.
        try {
            const levels: Array<{ id?: string; elevation?: number }> =
                (window.bimManager as { getLevels?: () => Array<{ id?: string; elevation?: number }> } | undefined)
                    ?.getLevels?.() ?? [];
            for (const l of levels) {
                if (typeof l.id === 'string' && l.id && typeof l.elevation === 'number' && Number.isFinite(l.elevation)) {
                    map.set(l.id, l.elevation);
                }
            }
        } catch { /* no level store yet → walls-only, prior behaviour */ }
        // Walls take precedence (unchanged behaviour for wall-bearing storeys).
        for (const w of getFormaWalls()) {
            if (w.levelId) map.set(w.levelId, w.baseElevation);
        }
        return map;
    };

    /**
     * §A.21.D25 (FIX A.21.D28#1) — read authored floor SLABS from the slab store.
     *
     * ROOT CAUSE of "0 slab(s)": the earlier reader looked for `s.boundary` as a
     * Vec3[] of {x, y, z} with y carrying the elevation — a shape NO slab store
     * actually uses → every slab was skipped. There are two slab record shapes in
     * play and this reader handles BOTH (whichever store is registered as 'slab'):
     *   • legacy `SlabData` (packages/geometry-slab/src/SlabTypes.ts): outer ring
     *     in `polygon: {x, y}[]` (2D, y === world Z); world elevation NOT on the
     *     record (`position.y` is always 0, resolved from the level at projection).
     *   • C11 plugin `SlabData` (= Zod Slab schema): outer ring in
     *     `boundary: {x, y, z}[]` where (per CreateSlab) x === worldX, y === worldZ,
     *     z === 0 — so the plan mapping is identical (second coord → scene Z).
     * In both cases the plan ring's two coords map to scene-XZ as {x, z: secondCoord}
     * and the storey elevation is resolved from the level (via the working walls)
     * plus the slab's `baseOffset` + `thickness`.
     */
    const getFormaSlabs = (): Array<{
        ring: XZ[];
        topElevation: number;
        thickness: number;
        levelId?: string;
        materialColor?: string;
    }> => {
        type SlabRecord = {
            // legacy SlabData: outer ring is `polygon` of 2D {x,y} where y === world Z.
            polygon?: ReadonlyArray<{ x: number; y: number }>;
            // C11 SlabData (Zod Slab): outer ring is `boundary` of {x,y,z} where y === world Z.
            boundary?: ReadonlyArray<{ x: number; y: number; z?: number }>;
            thickness?: number;
            baseOffset?: number;
            levelId?: string;
            // §A.21.D-GLOBE3 — the SAME slab finish the three.js BIM scene renders
            // (SlabFragmentBuilder: `data.materialColor || '#808080'`).
            materialColor?: string;
        };
        const slabStore = storeRegistry.getStoreForType('slab') as unknown as
            | { getAll?: () => SlabRecord[] }
            | undefined;
        const all = slabStore?.getAll?.() ?? [];
        const levelElev = levelElevationFromWalls();
        const out: Array<{ ring: XZ[]; topElevation: number; thickness: number; levelId?: string; materialColor?: string }> = [];
        for (const s of all) {
            // Accept legacy `polygon` or C11 `boundary`; both carry the plan ring
            // as {x, y} pairs where the SECOND coordinate is world Z.
            const poly = s.polygon ?? s.boundary;
            if (!poly || poly.length < 3) continue;
            const baseElev =
                typeof s.levelId === 'string' && levelElev.has(s.levelId) ? levelElev.get(s.levelId)! : 0;
            const baseOffset =
                typeof s.baseOffset === 'number' && Number.isFinite(s.baseOffset) ? s.baseOffset : 0;
            out.push({
                // Plan ring {x, y} → scene-XZ is {x, z: y}.
                ring: poly.map((p) => ({ x: p.x, z: p.y })),
                topElevation: baseElev + baseOffset,
                thickness: typeof s.thickness === 'number' && s.thickness > 0 ? s.thickness : 0.2,
                levelId: typeof s.levelId === 'string' && s.levelId ? s.levelId : undefined,
                materialColor:
                    typeof s.materialColor === 'string' && s.materialColor ? s.materialColor : undefined,
            });
        }
        return out;
    };

    /**
     * §A.21.D25 (FIX A.21.D28#1) — read authored ROOFS from the roof store.
     *
     * ROOT CAUSE of "0 roof(s)": the earlier reader looked for `r.boundary` (Vec3[]
     * with y = elevation) + `r.pitch` (radians). The registered runtime store holds
     * the legacy `RoofData` (packages/geometry-roof/src/RoofTypes.ts), which has
     * NEITHER — it carries the plan footprint in `footprint.polygon` as
     * `[number, number][]` (each `[x, z]`), the eave elevation in `baseOffset`, and
     * the slope as `slope` = rise/run (NOT radians) → every roof was skipped.
     * This reader handles BOTH shapes (whichever store is registered as 'roof'):
     *   • legacy RoofData: `footprint.polygon` ([x,z] pairs) + `slope` + `baseOffset`.
     *   • C11 plugin / Zod Roof schema: `boundary` (Vec3 {x,y,z}; plan = x,z) + `pitch`.
     */
    const getFormaRoofs = (): Array<{
        ring: XZ[];
        baseElevation: number;
        thickness: number;
        pitch: number;
        levelId?: string;
        materialColor?: string;
    }> => {
        type RoofRecord = {
            // legacy RoofData: plan footprint ring as [x, z] pairs. CRITICAL — per
            // RoofTool._normalisePolygon + HouseLayoutExecutor._createRoof, `polygon`
            // is CENTROID-LOCAL (each vertex relative to `centroid`) and `centroid`
            // carries the WORLD anchor. The RoofFragmentBuilder reconstructs the
            // world ring as centroid + local.
            footprint?: {
                polygon?: ReadonlyArray<readonly [number, number]>;
                centroid?: readonly [number, number];
            };
            // C11 RoofData (Zod Roof): plan ring as Vec3 {x,y,z}; plan coords are x,z.
            boundary?: ReadonlyArray<{ x: number; y?: number; z: number }>;
            thickness?: number;
            slope?: number;      // legacy: rise/run ratio (NOT radians)
            pitch?: number;      // C11: radians
            baseOffset?: number; // legacy: eave elevation relative to the level
            levelId?: string;
            // §A.21.D-GLOBE3 — the SAME roof finish the three.js BIM scene renders
            // (RoofFragmentBuilder: `data.materialColor || '#c8a46e'`).
            materialColor?: string;
        };
        const roofStore = storeRegistry.getStoreForType('roof') as unknown as
            | { getAll?: () => RoofRecord[] }
            | undefined;
        const all = roofStore?.getAll?.() ?? [];
        const levelElev = levelElevationFromWalls();
        const out: Array<{ ring: XZ[]; baseElevation: number; thickness: number; pitch: number; levelId?: string; materialColor?: string }> = [];
        for (const r of all) {
            // §A.21.D33(e) — ROOF FOOTPRINT ROOT CAUSE + FIX. The earlier reader read
            // the legacy `footprint.polygon` directly as if it were WORLD-XZ. It is
            // not: it is CENTROID-LOCAL (vertices relative to `footprint.centroid`,
            // the world anchor). Dropping the centroid rendered the roof centred on
            // the scene origin (0,0) — offset from the building by (cx, cz) and
            // reading as a small floating shape next to the house. We now ADD the
            // world centroid back, so world vertex = centroid + local (exactly what
            // the BIM RoofFragmentBuilder does). The C11 `boundary` Vec3 ring is
            // already world-XZ → no centroid offset for that branch.
            const fp = r.footprint;
            const centroid = fp?.centroid;
            const cx = Array.isArray(centroid) && typeof centroid[0] === 'number' ? centroid[0] : 0;
            const cz = Array.isArray(centroid) && typeof centroid[1] === 'number' ? centroid[1] : 0;
            const ring: XZ[] | null = fp?.polygon && fp.polygon.length >= 3
                ? fp.polygon.map((p) => ({ x: p[0] + cx, z: p[1] + cz }))
                : r.boundary && r.boundary.length >= 3
                    ? r.boundary.map((p) => ({ x: p.x, z: p.z }))
                    : null;
            if (!ring) continue;
            const baseElev =
                typeof r.levelId === 'string' && levelElev.has(r.levelId) ? levelElev.get(r.levelId)! : 0;
            // §ROOF-FORMA (2026-06-09) — roof inclusion decision. The roof now
            // lives on its own wall-less "Roof" level (§ROOF-LEVEL); its elevation
            // is resolved from the level store (seeded into levelElev above), NOT
            // from walls. Log whether the level resolved so a buried-roof
            // regression is diagnosable from the console.
            console.log(
                `[gis][forma] §ROOF-FORMA include roof: levelId=${r.levelId ?? '(none)'} ` +
                `resolved=${typeof r.levelId === 'string' && levelElev.has(r.levelId)} ` +
                `levelElev=${baseElev}m`,
            );
            const baseOffset =
                typeof r.baseOffset === 'number' && Number.isFinite(r.baseOffset) ? r.baseOffset : 0;
            // pitch radians: prefer the C11 `pitch`; else convert legacy `slope` (rise/run).
            const slope = typeof r.slope === 'number' && Number.isFinite(r.slope) && r.slope > 0 ? r.slope : 0;
            const pitch = typeof r.pitch === 'number' && Number.isFinite(r.pitch) && r.pitch > 0
                ? r.pitch
                : slope > 0 ? Math.atan(slope) : 0;
            out.push({
                ring,
                baseElevation: baseElev + baseOffset,
                thickness: typeof r.thickness === 'number' && r.thickness > 0 ? r.thickness : 0.2,
                pitch,
                levelId: typeof r.levelId === 'string' && r.levelId ? r.levelId : undefined,
                materialColor:
                    typeof r.materialColor === 'string' && r.materialColor ? r.materialColor : undefined,
            });
        }
        return out;
    };

    /**
     * §A.21.D25 (FIX A.21.D28#1) — read authored FURNITURE as a COARSE
     * representation (small boxes at each item's origin). OPTIONAL + HARD-CAPPED
     * (FORMA_FURNITURE_CAP) so a heavily-furnished model never floods the globe
     * with thousands of Cesium entities (perf). Each item carries its origin
     * (scene-XZ from `position`), a base elevation (levelElevation + baseOffset,
     * falling back to position.y), a coarse footprint (width × length), height,
     * and heading (rotation.y). At the massing scale furniture is a minor read.
     */
    const FORMA_FURNITURE_CAP = 400;
    const getFormaFurniture = (): Array<{
        origin: XZ;
        baseElevation: number;
        width: number;
        depth: number;
        height: number;
        rotation: number;
    }> => {
        // Runtime FurnitureData (packages/geometry-furniture/src/FurnitureTypes.ts):
        //   • position : Point3D  {x,y,z}  (scene-XZ origin; y = world Y when set)
        //   • rotation : EulerDTO {x,y,z}  (y = heading about the up axis)
        //   • width / length / height (metres) — NOT a `size` bbox
        //   • levelElevation + baseOffset — the world base elevation
        // ROOT CAUSE of "0 furniture": the earlier reader looked for `f.origin`,
        // `f.size`, `f.scale` and a numeric `f.rotation` — none of which exist on
        // FurnitureData → every item was skipped.
        type FurnitureRecord = {
            position?: { x: number; y?: number; z: number };
            rotation?: { x?: number; y?: number; z?: number };
            width?: number;
            length?: number;
            height?: number;
            levelElevation?: number;
            baseOffset?: number;
        };
        // §A.21.D33(e) — read the legacy FurnitureStore (the canonical read the
        // ProjectSerializer / schedules / every plan-symbol builder use). It is the
        // store the §FT-FURNITURE bus→legacy bridge mirrors generated furniture into.
        // Resolve via the registry, then DEFENSIVELY fall back to window.furnitureStore
        // (same instance in normal boot, but this guards a registry-vs-window divergence
        // and an early call before registration). Whichever yields the most records wins.
        const regStore = storeRegistry.getStoreForType('furniture') as unknown as
            | { getAll?: () => FurnitureRecord[] }
            | undefined;
        const winStore = (window as unknown as { furnitureStore?: { getAll?: () => FurnitureRecord[] } }).furnitureStore;
        const regAll = regStore?.getAll?.() ?? [];
        const winAll = winStore?.getAll?.() ?? [];
        const all = winAll.length > regAll.length ? winAll : regAll;
        const out: Array<{ origin: XZ; baseElevation: number; width: number; depth: number; height: number; rotation: number }> = [];
        for (const f of all) {
            if (out.length >= FORMA_FURNITURE_CAP) break;
            const p = f.position;
            if (!p || typeof p.x !== 'number' || typeof p.z !== 'number') continue;
            const width = typeof f.width === 'number' && f.width > 0 ? f.width : 0.6;
            const depth = typeof f.length === 'number' && f.length > 0 ? f.length : 0.6;
            const height = typeof f.height === 'number' && f.height > 0 ? f.height : 0.7;
            // §A.21.D33(e) — MULTI-STOREY ELEVATION FIX. `position.y` is the
            // authoritative WORLD Y (the furnish pipeline + the §FT-FURNITURE bridge
            // both bake the storey elevation into it). The bridge ZEROES
            // `levelElevation` when mirroring, so the prior "levelElevation+baseOffset
            // first" path collapsed every upper-storey item onto the ground floor.
            // Prefer a finite, non-ground `position.y`; only fall back to the
            // level fields (then ground) when world Y is absent/zero.
            const worldY = typeof p.y === 'number' && Number.isFinite(p.y) ? p.y : undefined;
            const levelElev =
                typeof f.levelElevation === 'number' && Number.isFinite(f.levelElevation) ? f.levelElevation : undefined;
            const baseOffset =
                typeof f.baseOffset === 'number' && Number.isFinite(f.baseOffset) ? f.baseOffset : 0;
            const baseElevation =
                worldY !== undefined && Math.abs(worldY) > 1e-6
                    ? worldY
                    : levelElev !== undefined
                        ? levelElev + baseOffset
                        : worldY ?? 0;
            out.push({
                origin: { x: p.x, z: p.z },
                baseElevation,
                width,
                depth,
                height,
                // EulerDTO.y is the heading (rotation about the up axis).
                rotation: typeof f.rotation?.y === 'number' && Number.isFinite(f.rotation.y) ? f.rotation.y : 0,
            });
        }
        if (all.length > FORMA_FURNITURE_CAP) {
            console.log(`[gis][forma] furniture capped at ${FORMA_FURNITURE_CAP} of ${all.length} items (perf).`);
        }
        return out;
    };

    /**
     * §A.21.D34(d) — read WINDOW + DOOR openings as coarse massing insets.
     *
     * SOURCE: the openings are carried DIRECTLY on each wall record
     * (`Wall.openings[]` per packages/schemas/src/elements/Wall.ts +
     * geometry-wall WallTypes.Opening) — the SAME opening data the BIM uses to
     * cut the wall + host the door/window element. Reading them off the walls (not
     * the separate window/door stores) means the offset/width/height/sill are
     * already resolved against the wall they pierce, so we can place each inset on
     * the shell at its true world position with no store-join.
     *
     * Each opening is projected to a world-XZ inset RECTANGLE on the wall plane:
     *   • along the wall baseline:  start = offset, end = offset + width
     *   • the inset's centreline runs along the baseline at those two points
     *   • `sill` + `height` give the vertical band (baseElevation + sill →
     *     baseElevation + sill + height)
     *   • `normal` is the wall's unit normal (so the Cesium side can recess the
     *     panel slightly into the façade for a darker reveal).
     * Walls with no openings contribute nothing. Fully guarded — a bad opening or
     * degenerate wall is skipped, never thrown.
     */
    const getFormaOpenings = (): Array<{
        kind: 'window' | 'door';
        /** Opening start point on the wall baseline (scene-XZ). */
        a: XZ;
        /** Opening end point on the wall baseline (scene-XZ). */
        b: XZ;
        /** Unit wall normal (scene-XZ) — the recess direction. */
        normal: XZ;
        thickness: number;
        /** World base elevation of the wall (storey floor). */
        baseElevation: number;
        sill: number;
        height: number;
    }> => {
        type OpeningRecord = {
            type?: 'window' | 'door';
            offset?: number;
            width?: number;
            height?: number;
            sillHeight?: number;
        };
        type WallRecord = {
            baseLine?: ReadonlyArray<{ x: number; y?: number; z: number }>;
            thickness?: number;
            baseOffset?: number;
            openings?: ReadonlyArray<OpeningRecord>;
        };
        const wallStore = storeRegistry.getStoreForType('wall') as unknown as
            | { getAll?: () => WallRecord[] }
            | undefined;
        const all = wallStore?.getAll?.() ?? [];
        const out: Array<{
            kind: 'window' | 'door';
            a: XZ;
            b: XZ;
            normal: XZ;
            thickness: number;
            baseElevation: number;
            sill: number;
            height: number;
        }> = [];
        for (const w of all) {
            try {
                const ops = w.openings;
                if (!ops || ops.length === 0) continue;
                const bl = w.baseLine;
                if (!bl || bl.length < 2 || !bl[0] || !bl[1]) continue;
                const ax = bl[0].x, az = bl[0].z;
                const bx = bl[1].x, bz = bl[1].z;
                const dx = bx - ax, dz = bz - az;
                const len = Math.hypot(dx, dz);
                if (len < 1e-3) continue;
                const ux = dx / len, uz = dz / len; // unit along the baseline
                // Wall normal (perpendicular in XZ).
                const nx = -uz, nz = ux;
                const yElev = typeof bl[0].y === 'number' && Number.isFinite(bl[0].y) ? bl[0].y : 0;
                const baseOffset =
                    typeof w.baseOffset === 'number' && Number.isFinite(w.baseOffset) ? w.baseOffset : 0;
                const thickness =
                    typeof w.thickness === 'number' && w.thickness > 0 ? w.thickness : 0.1;
                for (const o of ops) {
                    const kind = o.type === 'door' ? 'door' : 'window';
                    const offset = typeof o.offset === 'number' && o.offset >= 0 ? o.offset : 0;
                    const width = typeof o.width === 'number' && o.width > 0 ? o.width : 0.9;
                    // Clamp the opening span to the wall so we never read past the end.
                    const start = Math.min(offset, len);
                    const end = Math.min(offset + width, len);
                    if (end - start < 1e-3) continue;
                    const height = typeof o.height === 'number' && o.height > 0 ? o.height : 1.2;
                    const sill =
                        kind === 'door'
                            ? 0
                            : typeof o.sillHeight === 'number' && o.sillHeight >= 0
                                ? o.sillHeight
                                : 0.9;
                    out.push({
                        kind,
                        a: { x: ax + ux * start, z: az + uz * start },
                        b: { x: ax + ux * end, z: az + uz * end },
                        normal: { x: nx, z: nz },
                        thickness,
                        baseElevation: yElev + baseOffset,
                        sill,
                        height,
                    });
                }
            } catch (e) {
                console.warn('[gis][forma] opening read failed for a wall — skipped:', e);
            }
        }
        return out;
    };

    /**
     * §A.21.D34(d) — read STAIRS as a coarse extruded volume so the stairwell
     * reads in the massing. SOURCE: the stair store (geometry-stair StairData):
     *   • startPosition : Vec3 (scene-XZ origin of the first flight)
     *   • flights[0].direction : Vec3 (run direction; XZ)
     *   • riserCount · treadDepth : total run length along the direction
     *   • riserCount · riserHeight : total rise (the storey band height)
     *   • width : flight width
     *   • baseOffset : world base elevation
     * We emit a rotated footprint rectangle (run × width) + a base elevation +
     * a total rise — the Cesium side extrudes it as a simple block. Coarse by
     * design (the true treads live in the BIM view). Guarded — a degenerate
     * stair is skipped.
     */
    const getFormaStairs = (): Array<{
        origin: XZ;
        /** Run direction unit vector (scene-XZ). */
        dir: XZ;
        run: number;
        width: number;
        baseElevation: number;
        rise: number;
    }> => {
        type Vec3Rec = { x?: number; y?: number; z?: number };
        type StairRecord = {
            startPosition?: Vec3Rec;
            flights?: ReadonlyArray<{ direction?: Vec3Rec; riserCount?: number; treadDepth?: number }>;
            width?: number;
            riserHeight?: number;
            treadDepth?: number;
            riserCount?: number;
            baseOffset?: number;
        };
        const stairStore = storeRegistry.getStoreForType('stair') as unknown as
            | { getAll?: () => StairRecord[] }
            | undefined;
        const all = stairStore?.getAll?.() ?? [];
        const out: Array<{ origin: XZ; dir: XZ; run: number; width: number; baseElevation: number; rise: number }> = [];
        for (const s of all) {
            try {
                const sp = s.startPosition;
                if (!sp || typeof sp.x !== 'number' || typeof sp.z !== 'number') continue;
                const f0 = s.flights && s.flights.length ? s.flights[0] : undefined;
                const d = f0?.direction;
                let dx = typeof d?.x === 'number' ? d.x : 1;
                let dz = typeof d?.z === 'number' ? d.z : 0;
                const dlen = Math.hypot(dx, dz);
                if (dlen < 1e-6) { dx = 1; dz = 0; }
                else { dx /= dlen; dz /= dlen; }
                const tread = typeof s.treadDepth === 'number' && s.treadDepth > 0 ? s.treadDepth : 0.27;
                const risers =
                    typeof s.riserCount === 'number' && s.riserCount > 0
                        ? s.riserCount
                        : typeof f0?.riserCount === 'number' && f0.riserCount > 0
                            ? f0.riserCount
                            : 16;
                const riserH = typeof s.riserHeight === 'number' && s.riserHeight > 0 ? s.riserHeight : 0.18;
                const width = typeof s.width === 'number' && s.width > 0 ? s.width : 1.0;
                const run = Math.max(0.5, risers * tread);
                const rise = Math.max(0.3, risers * riserH);
                const baseOffset =
                    typeof s.baseOffset === 'number' && Number.isFinite(s.baseOffset) ? s.baseOffset : 0;
                out.push({
                    origin: { x: sp.x, z: sp.z },
                    dir: { x: dx, z: dz },
                    run,
                    width,
                    baseElevation: baseOffset,
                    rise,
                });
            } catch (e) {
                console.warn('[gis][forma] stair read failed — skipped:', e);
            }
        }
        return out;
    };

    // ════════════════════════════════════════════════════════════════════════
    // C58 (L-402b) — buildable-envelope render + facts card + on/off toggle.
    // The envelope is computed on `site.parcel-boundary-set` (siteDispatch) and
    // cached; here we (a) feed its inset ring + max height into the SAME Forma
    // render path as the parcel (SPEC §4), and (b) draw a compact "Estimated"
    // facts card + a show/hide toggle (SPEC §2 steps 4–5). Default ON post-commit.
    // ════════════════════════════════════════════════════════════════════════
    // ⭐ §ENVELOPE-ONE-VISIBILITY (L-1170) — THE LOCAL `let formaEnvelopeVisible = true` IS GONE.
    //
    // It was a `let` inside this ~4800-line closure, written by the card's ON/OFF button and
    // read by EXACTLY ONE function (`resolveFormaEnvelope`, below). Three other surfaces drew
    // the envelope and none of them could even SEE it: the Cesium floor-selector replay
    // (`setVisibleFormaLevels` re-rendering `formaLastMassingInput`, which carries a SNAPSHOT
    // of an earlier answer — ⭐ the founder's "selected Level 15 and an ENVELOPE showed up"),
    // the §SITE-OVERLAY-NOT-BUILDING survival set, and the BIM/plan three.js volume in
    // `ParcelBoundarySceneRenderer`. Four answers to one question = C84 EI-1.
    //
    // This file no longer HOLDS the answer; it reads and writes the one authority. The scene
    // repaints from the authority's subscription, not from this handler reaching into a
    // viewport — see `apps/editor/src/ui/site/envelopeVisibility.ts`.
    let envelopePanel: HTMLDivElement | null = null;
    /** §GIS-ENVELOPE-REHOST (L-1362) — where the buildability card should render, when a
     *  surface has claimed it. Set through `window.pryzmMountEnvelopeCard`; ignored the
     *  moment the element leaves the document, so a closed panel cannot strand the card. */
    let envelopeCardPreferredHost: HTMLElement | null = null;
    // §L-621b — user-dismissed state for the Buildable-Envelope CARD (chrome), distinct
    // from the massing GEOMETRY on/off, which lives in the ONE authority
    // (`envelopeVisibility.ts`, §ENVELOPE-ONE-VISIBILITY / L-1170). Mirrors the
    // `FormaSiteAnalysisControls._userHidden` pattern so a ✕ / launcher-toggle hide
    // survives the card's re-render + re-home cycles. The launcher pill re-opens it.
    // §UX1-PANEL-DEFAULTS — this literal WAS `false` ("the card is open on every start").
    // It now reads the ONE table; 'buildable-envelope' is declared CLOSED there, and the
    // `envelope-card-launcher` pill (mounted in `mountSiteViewLauncher`) is its declared
    // route back. Do not re-hardcode this — the table is what makes the start-up state
    // countable rather than the sum of three unrelated initialisers.
    let envelopeCardHidden = !panelDefaultOpen('buildable-envelope');
    /** §L-621b — apply the hidden flag to the live card node (no-op when not built). */
    const applyEnvelopeCardVisibility = (): void => {
        if (envelopePanel) envelopePanel.style.display = envelopeCardHidden ? 'none' : '';
    };
    /** §L-621b — toggle the Buildable-Envelope card; returns the new visible state. */
    const toggleEnvelopeCard = (): boolean => {
        envelopeCardHidden = !envelopeCardHidden;
        // §UX1-PANEL-DEFAULTS — mirror into the shared table so the reopen pill's paint,
        // `Reset panel layout`, and this local flag can never disagree about one panel.
        setPanelOpen('buildable-envelope', !envelopeCardHidden);
        applyEnvelopeCardVisibility();
        return !envelopeCardHidden;
    };

    /**
     * Feed the envelope's inset ring + height to the render, when ON.
     *
     * L-445 — was `getLastBuildableEnvelope()`, a module global written only on the COMMIT
     * path, so it was null on every re-entry after a reload and the 3D Site drew no envelope
     * while the toggle still said "Envelope: ON". Now routes through
     * `resolveRenderableBuildableEnvelope()`, which prefers this session's solved envelope and
     * falls back to the PERSISTED `Parcel.buildableRing` (C58 §1.7a / ADR-0270 option A).
     */
    const resolveFormaEnvelope = (): { solids: MassingSolid[] } | null => {
        // §ENVELOPE-RESOLVE-DIAG (L-445) — say WHY, every time. The previous diagnostic reported
        // only `present=n`, which is a symptom with four possible causes (toggle off / no cached
        // envelope / no persisted ring / degenerate re-inset). That ambiguity cost a full
        // deploy-test cycle: the wiring was statically correct, so reading the code could not
        // distinguish them — exactly the L-446 lesson that a correct read chain plus wrong
        // behaviour means runtime STATE, and only a probe names it.
        // ⛔ §ENVELOPE-TWO-AXES (C58 §1.17 / L-1188) — THE EARLY RETURN THAT USED TO BE HERE IS GONE.
        //
        // It read `if (!isBuildableEnvelopeVisible()) return null;` — a CALLER-side gate, which
        // §1.15.2 already forbids (the gate belongs at the rasteriser, because a replayed payload is
        // a caller nobody re-asked). Harmless while "off" meant "draw nothing"; actively wrong now
        // that "off" means "draw the GROUND FOOTPRINT instead of the volume": starving the payload
        // of solids here would leave the chokepoint with nothing to project, and the founder's ground
        // shade could never appear however correct the rasteriser was.
        //
        // ⭐ This function's job is to choose the SOURCE envelope. Whether — and as what — it is
        // DRAWN is the rasteriser's, via the one authority. Do not re-add a visibility branch here.
        if (!isBuildableEnvelopeVisible()) {
            console.log(
                '[gis][c58] §ENVELOPE-RESOLVE-DIAG — envelope VOLUME is OFF (user toggle); still ' +
                    'resolving the envelope so the §1.14 rasteriser can draw the GROUND FOOTPRINT ' +
                    'shade (§ENVELOPE-TWO-AXES). The rasteriser, not this resolver, decides.',
            );
        }
        // C58 §1.14 / STRUCTURAL-SEAM-1 — the 4-field narrowing is GONE. When this session solved a
        // full envelope we pass the WHOLE `BuildableEnvelope` to the pure `envelopeToMassing`, so
        // `tiers[]`, `maxVolumeM3`, `maxCoverage` and `footprintIsUpperBound` all reach the render
        // that used to discard them. `envelopeToMassing` is the single place massing geometry is
        // derived; this file only chooses the SOURCE envelope and forwards it.
        const full = getLastBuildableEnvelope();
        if (full && full.status === 'ok' && full.insetPolygon.length >= 3) {
            // §NEARBY-HEIGHT-SUGGESTION — an admin-only, not-yet-reviewed height-based auto-preview
            // (`previewSuggestedZoneEnvelope`) sets this side-channel flag; forwarding it here is
            // what turns the solid(s) amber instead of the normal confident/provisional colours.
            const suggestedPreview = isLastEnvelopeSuggestedPreview();
            const solids = envelopeToMassing({ ...full, suggestedPreview });
            console.log(
                `[gis][c58] §ENVELOPE-RESOLVE-DIAG — SOLVED envelope → ${solids.length} solid(s) ` +
                    `(source=solved, confidence=${full.confidence}, tiers=${full.tiers.length}, ` +
                    `upperBound=${full.footprintIsUpperBound}, maxHeight=${full.maxHeight_m ?? 'n/a'} m` +
                    `${suggestedPreview ? ', SUGGESTED-PREVIEW (unreviewed, amber)' : ''}).`,
            );
            return solids.length > 0 ? { solids } : null;
        }
        // L-445 fallback — this session did NOT solve (reload / open-from-hub). Recover the persisted
        // ring (C58 §1.7a) via the geometry-only resolver and pass a MINIMAL envelope through the SAME
        // pure function, so there is ONE render path. The minimal envelope carries only what was
        // honestly re-derived — the ring + `Parcel.maxHeight` — with confidence null (⇒ provisional
        // grey) and no tiers/FAR/upper-bound, exactly the §1.7a honesty rule: we do not re-synthesise
        // provenance we did not re-derive.
        const geo = resolveRenderableBuildableEnvelope(runtime ?? null);
        if (!geo || geo.ring.length < 3) {
            console.log(
                '[gis][c58] §ENVELOPE-RESOLVE-DIAG — NO ring available: no envelope solved this ' +
                    'session, no persisted buildableRing, and no re-inset from persisted setbacks ' +
                    `(resolver returned ${geo ? `${geo.ring.length}-pt ring` : 'null'}). ` +
                    'Re-commit the parcel to solve one.',
            );
            return null;
        }
        const minimal: BuildableEnvelopeMassingInput = {
            insetPolygon: geo.ring.map((p) => ({ x: p.x, z: p.z })),
            maxHeight_m: geo.maxHeightM,
            farLimitedHeight_m: geo.farLimitedHeightM,
            confidence: geo.confidence,
            footprintIsUpperBound: false,
            status: 'ok',
            tiers: [],
        };
        const solids = envelopeToMassing(minimal);
        console.log(
            `[gis][c58] §ENVELOPE-RESOLVE-DIAG — ring OK (source=${geo.source}) → ${solids.length} solid(s), ` +
                `maxHeight=${geo.maxHeightM ?? 'n/a'} m (provenance not re-derived → provisional grey).`,
        );
        return solids.length > 0 ? { solids } : null;
    };

    /** §L-412 (C59 Phase 1b) — the DOM host for the 3D-Site chrome (envelope card).
     *  When the site-authoring split is live the 3D Site lives in the RIGHT pane, so
     *  the "Estimated" facts card + toggle must render ON THAT PANE (C59 §1.3 — chrome
     *  is scoped to its own pane), not floated over the whole `#container`. Falls back
     *  to `#container` for the classic single-view Forma. */
    const getForma3dHostEl = (): HTMLElement | null => {
        // §GIS-ENVELOPE-REHOST (L-1362, C06 §13.3) — the GIS panel wins when it is on screen.
        //
        // Founder 2026-08-20: "we had a panel with the BUILDABILITY etc — this should go also
        // to the GIS panel." This ONE line is the whole re-host, and that is the point.
        //
        // The buildability read-out is not a set of numbers to reproduce: it is four render
        // templates carrying a REFUSAL DOCTRINE (a full determination, a REDUCED card when only
        // the ring was persisted and provenance was not re-derived, a coverage-gap card, and a
        // refusal card for `status:'none'` WITH a refusal object — plus the branch that removes
        // the card entirely when there is genuinely no envelope). Re-implementing any of that in
        // the panel would be the C06 §13.3 breach that produced two disagreeing GIS surfaces in
        // the first place, and here it would disagree about whether land is buildable.
        //
        // So nothing is copied. The card's own `ensureEnvelopePanel` already re-homes the SAME
        // element whenever its host changes; pointing that host at the GIS panel's slot moves the
        // real surface, with every refusal branch intact and still owned by C58.
        //
        // `document.contains` is the self-healing part: when the GIS section is closed or
        // rebuilt its slot leaves the document, and the card falls back to the viewport host
        // rather than being stranded on a detached node.
        if (envelopeCardPreferredHost && document.contains(envelopeCardPreferredHost)) {
            return envelopeCardPreferredHost;
        }
        if (siteAuthoringPanes && !siteAuthoringPanes.isDisposed) {
            const right = siteAuthoringPanes.getPaneElement(RIGHT_PANE);
            if (right) return right;
        }
        return document.getElementById('container');
    };

    /** The card's shell — created once, re-homed if the pane host changed. */
    const ensureEnvelopePanel = (viewport: HTMLElement): HTMLDivElement => {
        if (!envelopePanel) {
            envelopePanel = document.createElement('div');
            envelopePanel.setAttribute('data-testid', 'buildable-envelope-card');
            Object.assign(envelopePanel.style, {
                // §UX1-PANEL-CHROME / §UX1-PANEL-COLUMN (C06 §6, §7.2, §7.3) — three
                // changes, all of them removing a local opinion:
                //   · the density literals (300/272px wide, 12px 14px padding, 12px radius,
                //     the 18%-alpha 18px-blur drop shadow, 12px type) now read the shared
                //     `--pryzm-panel-*` tokens, so this card and the Site-analysis panel are
                //     one design instead of two, and the §UI-DENSITY-SCALE lever reaches
                //     both (it cannot see inline literals);
                //   · `top`/`maxHeight` take the TOP slot of the declared right-edge column
                //     so this card can no longer sit on top of Site analysis — that overlap
                //     is the founder's "one panel's close button over another's content";
                //   · `zIndex: '32'` was a raw literal, forbidden for edited chrome by
                //     C06 §7.3; it is the named `panel` band now.
                position: 'absolute',
                top: 'var(--pryzm-panel-col-top)', right: '16px',
                zIndex: zCss('panel'),
                width: 'var(--pryzm-panel-width-wide)',
                minWidth: 'var(--pryzm-panel-min-width)', maxWidth: '92vw',
                padding: 'var(--pryzm-panel-pad)',
                background: 'var(--pryzm-panel-surface)',
                borderRadius: 'var(--pryzm-panel-radius)',
                border: 'var(--pryzm-panel-border)',
                boxShadow: 'var(--pryzm-panel-shadow)',
                font: '500 var(--pryzm-panel-font-size-body)/1.45 system-ui, sans-serif',
                color: 'var(--pryzm-panel-ink)',
                // §L-508b — FIX the real-data layout (founder: "data is terrible, stuck in a
                // minimum-width strip on the right"). Three faults, all fixed here + in the
                // "Why?" rows below: (1) the card was only 232px — too narrow for the real
                // PGM Art. 242.2 citation, so it went to 300px w/ a HARD minWidth so it can
                // never collapse to a sliver; (2) `overflowWrap:anywhere` broke values ONE
                // CHARACTER PER LINE — replaced with `break-word` (breaks only long unbreakable
                // tokens, never mid-value); (3) the two-column "Why?" rows starved the value
                // column — those rows are now STACKED (see whyBlock). maxHeight+scroll keep the
                // long determination on-screen; resize:both + makeDraggable keep it user-movable.
                maxHeight: 'var(--pryzm-panel-col-max-height-top)', overflowY: 'auto',
                overflowWrap: 'break-word', wordBreak: 'normal',
                boxSizing: 'border-box', resize: 'both',
            } satisfies Partial<CSSStyleDeclaration>);
            viewport.appendChild(envelopePanel);
            // §L-508 — MOVABLE (the second half of the founder's ask; resize shipped above). The
            // drag handle is the panel HEADER (`[data-envelope-drag]`, present in BOTH render
            // templates); makeDraggable resolves it lazily at mousedown, so it survives the
            // panel's innerHTML re-renders. Exclude the ON/OFF toggle so a click there never
            // starts a drag. Wired ONCE (inside the create block); the returned disposer is not
            // needed — the panel lives for the GIS session.
            try {
                // §ENVELOPE-AXES-CONTROL (L-6912) — the exclusion list is now the control's OWN
                // export, not a literal repeated here. There are TWO switches as of L-6910, and a
                // hand-copied selector list is exactly how the second one would have kept starting
                // a drag on every click while the first did not.
                makeDraggable(envelopePanel, '[data-envelope-drag]', [...ENVELOPE_AXES_DRAG_EXCLUDE]);
            } catch { /* non-fatal — drag is a convenience, the panel still works without it */ }
        } else if (envelopePanel.parentElement !== viewport) {
            viewport.appendChild(envelopePanel);
        }
        // §L-621b — honour a prior ✕ / launcher-toggle dismissal across re-render + re-home.
        applyEnvelopeCardVisibility();
        return envelopePanel;
    };

    /** The ON/OFF toggle markup + handler, shared by the full and reduced cards.
     *
     *  §ENVELOPE-ONE-VISIBILITY (L-1170) — the label READS the authority (never a local
     *  mirror of it), so the control can never display a state the renderers disagree with. */
    const envelopeToggleHtml = (): string => {
        // ⭐ §ENVELOPE-AXES-CONTROL (L-6910, founder 2026-08-22: "There is a bug on 'envelope off'
        // — the shade goes back.") — THIS IS NOW TWO SWITCHES, and the reason is that the MODEL
        // has had two axes since L-1188 while this control had one button.
        //
        // The old markup lived here: a single `Envelope: ON/OFF` button writing the VOLUME axis,
        // plus a caption shown only when it was off, describing the surviving ground shade as a
        // feature. Both halves were honest and neither was sufficient — the caption never said
        // the shade could be turned off, so the state the founder wanted ("hide everything") was
        // representable in the model (`envelopeDrawMode({volume:false,footprint:false})` →
        // `'none'`) and UNREACHABLE from any surface. A control labelled OFF that leaves a visible
        // artefact on the plot is misleading however good the reasoning behind the artefact is.
        //
        // ⛔ IT WAS NOT FIXED BY MAKING THE ONE BUTTON WRITE BOTH AXES. That would delete the
        // distinction L-1188 exists to introduce and re-open the founder's 2026-08-19 report in
        // the opposite direction ("When the envelope is OFF we should see this shade on the
        // GROUND"). Two asks, opposite directions: the control grows, it does not pick a side.
        //
        // The markup is now produced by the PURE `buildEnvelopeAxesControlHtml`, so every one of
        // the four axis combinations is pinned by `envelopeVisibilityControl.spec.ts` rather than
        // asserted in a comment here — the §GIS-ENVELOPE-FULL-SECTIONS lesson applied to chrome.
        // This closure reads the authority ONCE and hands it over; the producer reads no global.
        return buildEnvelopeAxesControlHtml(getBuildableEnvelopeAxes());
    };

    const wireEnvelopeToggle = (panel: HTMLDivElement): void => {
        // §ENVELOPE-AXES-CONTROL (L-6911) — bind BOTH switches. The wiring lives in the pure
        // module so the selectors and the markup cannot drift apart; the writes stay here,
        // because the authority's setters are this file's to call and the control's job ends at
        // reporting the click (L-1170: a surface that renders AND writes AND decides is how one
        // question came to have four answers).
        wireEnvelopeAxesControl(panel, {
            onToggleVolume: () => {
                setBuildableEnvelopeVisible(!isBuildableEnvelopeVisible());
                refreshEnvelopePanel();
            },
            // ⭐ THE WRITE THAT DID NOT EXIST. `setBuildableEnvelopeFootprintVisible` has been
            // exported since L-1188 with NO caller — [[authored-but-unwired-is-the-bottleneck]]
            // in one line. Everything downstream (the persisted key, the notification, the L2
            // `applyEnvelopeVisibilityAxes` projection, both rasterisers' `'none'` arm) was
            // already built and already correct.
            onToggleFootprint: () => {
                setBuildableEnvelopeFootprintVisible(!isBuildableEnvelopeFootprintVisible());
                refreshEnvelopePanel();
            },
        });
        // ⭐ §ENVELOPE-ONE-VISIBILITY (L-1170) — THE CONTROL ONLY WRITES THE ANSWER, and that
        // rule is UNCHANGED by L-6910; only the number of axes it writes has grown.
        //
        // The two handlers above do exactly what the single one did: call the authority's setter
        // and repaint the CARD's own label. Neither reaches into a viewport and neither decides
        // which renderer to poke. That was the L-1170 defect — this handler used to be a
        // THREE-WAY RENDERER PICKER whose third branch (`else { refreshEnvelopePanel(); }`)
        // repainted the card and touched NO SCENE AT ALL, so on a 2D result view clicking OFF
        // flipped a flag and left the box exactly where it was.
        //
        // Every surface repaints from the authority's own subscription instead:
        //   · CesiumViewport re-renders `formaLastMassingInput` (no re-fly, no re-clamp, and it
        //     carries the cached `keepPhotoreal`, so §FIX-ENVELOPE-TOGGLE-VIEW-SWITCH is honoured
        //     BY CONSTRUCTION rather than by this handler branching correctly);
        //   · ParcelBoundarySceneRenderer rebuilds the BIM/plan volume.
        // Both read the L2 `applyEnvelopeVisibilityAxes`, whose `'none'` arm — unreachable from
        // the UI until L-6910 — is what actually clears the founder's shade.
    };

    // §L-621b follow-up (2026-08-05, founder: "already movable, just not closable") — the
    // `envelopeCardHidden` / `toggleEnvelopeCard` mechanism has existed since L-621b, but no
    // actual ✕ button was ever added to any of the card's THREE render templates to trigger it —
    // only the re-open launcher pill (`envelope-card-launcher`, ~line 4129) existed, so the card
    // could be re-shown but never actually dismissed from itself. This is that missing ✕.
    const envelopeCloseButtonHtml = (): string =>
        `<button data-testid="envelope-close" title="Close (re-open via the launcher pill)"
                 style="flex:none;appearance:none;border:none;background:transparent;color:#8a5a00;
                        cursor:pointer;font-size:14px;line-height:1;padding:2px 4px;margin-left:6px;">✕</button>`;
    /**
     * §UX1-PROSE-ALTITUDE — collapse a block of jurisdiction prose to ONE summary line
     * with the full text one click behind it.
     *
     * The founder's report was that this card carries "multiple paragraphs of
     * jurisdiction prose" and is the tallest thing on screen. Every one of those
     * paragraphs is CORRECT and several are load-bearing honesty statements (C58 §1.4:
     * an upper-bound footprint must say so in words). So none of it is deleted — it is
     * moved to the right altitude. The `summary` line must still carry the FACT, never
     * a bare "details": a user who never opens the disclosure must not be able to
     * mistake an upper bound for a solved envelope.
     *
     * Both arguments are already-escaped markup by this file's `safe*` convention
     * (§XSS-SINK-SCAN, C08 §3.1) — this helper introduces no new interpolation.
     */
    const envelopeDisclosureHtml = (safeSummary: string, safeBody: string, tone: 'warn' | 'plain' = 'plain'): string => {
        if (!safeBody) return '';
        const summaryColour = tone === 'warn' ? '#8a5a00' : 'var(--pryzm-panel-ink-muted)';
        return `<details style="margin-top:8px;border-top:1px solid var(--pryzm-panel-rule);padding-top:6px;">
                  <summary style="cursor:pointer;list-style:none;color:${summaryColour};font-size:var(--pryzm-panel-font-size-meta);line-height:1.45;">${safeSummary}</summary>
                  <div style="margin-top:6px;">${safeBody}</div>
                </details>`;
    };

    const wireEnvelopeClose = (panel: HTMLDivElement): void => {
        const btn = panel.querySelector('[data-testid="envelope-close"]') as HTMLButtonElement | null;
        if (!btn) return;
        btn.onclick = (ev) => {
            ev.stopPropagation(); // never let this bubble into the header's own drag-start handler
            toggleEnvelopeCard();
        };
    };

    // §COR-MANUAL-ADMIN-ZONE (2026-08-05) — wires the "Set zone manually (admin)" button that
    // `renderCoverageGapEnvelopePanel`'s isGap branch renders into the card itself (a no-op query
    // on the other two render templates, which never emit this button). Mirrors the exact
    // dynamic-import + no-op-for-non-admin contract already used at every other entry point for
    // this panel (`GISRailPanel.ts`, `pryzmEnterSiteView`/`pryzmShowFormaView` above).
    const wireManualZoneButton = (panel: HTMLDivElement): void => {
        const btn = panel.querySelector('[data-testid="envelope-manual-zone-btn"]') as HTMLButtonElement | null;
        if (!btn) return;
        btn.onclick = (ev) => {
            ev.stopPropagation();
            void import('../site/ManualAdminZonePanel')
                .then((m) => m.openManualAdminZonePanelIfAdmin(runtime))
                .catch((e) => console.warn('[gis][envelope-card] manual admin zone panel open failed (non-fatal):', e));
        };
    };

    /**
     * §MANUALENV159 (L-12640) — wires the "type a height for a study massing" entry the founder
     * asked for directly. A no-op when the form is not present in this render (the entry is only
     * built on the `isAbsent`/`isGap` refusal arms — see `refreshEnvelopePanel`'s own comment at
     * the call site). Synchronous (no network — `applyUserSuppliedStudyHeight` is pure geometry),
     * so there is no loading state to manage: a click either updates the status line in place (a
     * bounds/geometry refusal, so the user's typed value is never discarded under them) or calls
     * `refreshEnvelopePanel()` on success — the ONE producer re-renders the whole card, including
     * the study section above this form and the form's own prefill, from the state this save just
     * wrote.
     */
    const wireStudyHeightEntry = (panel: HTMLDivElement): void => {
        const input = panel.querySelector(`[data-testid="${STUDY_HEIGHT_INPUT_TESTID}"]`) as HTMLInputElement | null;
        const setbackInput = panel.querySelector(`[data-testid="${STUDY_HEIGHT_SETBACK_INPUT_TESTID}"]`) as HTMLInputElement | null;
        const btn = panel.querySelector(`[data-testid="${STUDY_HEIGHT_SAVE_BTN_TESTID}"]`) as HTMLButtonElement | null;
        const status = panel.querySelector(`[data-testid="${STUDY_HEIGHT_STATUS_TESTID}"]`) as HTMLElement | null;
        if (!input || !btn) return;
        btn.onclick = (ev) => {
            ev.stopPropagation();
            const heightM = Number(input.value);
            if (!Number.isFinite(heightM) || input.value.trim() === '') {
                if (status) status.textContent = 'Enter a height in metres first.';
                return;
            }
            const rawSetback = Number(setbackInput?.value ?? '0');
            const setbackM = Number.isFinite(rawSetback) ? rawSetback : 0;
            const ctx = resolveSiteContext(runtime ?? null);
            if (!ctx) {
                if (status) status.textContent = 'No active project — open or create one first.';
                return;
            }
            const result = applyUserSuppliedStudyHeight(ctx, heightM, setbackM);
            if (result === null) {
                if (status) status.textContent = 'No committed parcel boundary to build a study from yet.';
                return;
            }
            if (!result.ok) {
                if (status) {
                    status.textContent = result.reason === 'height-out-of-bounds'
                        ? `Height must be between ${result.minM} and ${result.maxM} m.`
                        : 'That setback leaves no buildable area inside the parcel — try a smaller one.';
                }
                return;
            }
            if (status) status.textContent = `Saved — study built at ${heightM.toFixed(1)} m.`;
            refreshEnvelopePanel();
        };
    };

    /**
     * §RESI-ORCH-TARGET-AREA (STR §5) — the LAST ANSWER, so a re-render does not blank the user's
     * entry or, worse, drop a refusal they have not read yet.
     *
     * ⛔ THE REFUSAL FLAG IS CARRIED, NOT DERIVED FROM THE PROSE. Sniffing "did this fail?" out of
     * a sentence is how a refusal comes to render in the success colour — the solver already
     * decided, and its `ok` is the only thing entitled to answer.
     *
     * Not persisted, and not in a store: this is the transcript of one conversation with the card.
     * The PROPOSAL itself (the geometry) lives in `targetFootprintAreaState`, which the scene
     * subscribes to; these three are only what the panel needs to redraw its own text.
     */
    let targetAreaStatement: string | null = null;
    let targetAreaRefused = false;
    let targetAreaTyped: number | null = null;
    /**
     * §RESI-ORCH-ADOPT — the transcript of the KEEP step, carried the same way and for the same
     * reason as the three above: a refusal the user has not read yet must survive a re-render, and
     * whether it WAS a refusal is carried, never sniffed out of the sentence.
     */
    let adoptStatement: string | null = null;
    let adoptFailed = false;

    /**
     * §RESI-ORCH-TARGET-AREA (STR §5) — the entry's two buttons.
     *
     * ⭐ THE WHOLE FEATURE IS THE REFUSAL, so read that branch first. A target larger than the
     * permitted footprint does NOT get quietly clipped to what fits: the solver refuses with BOTH
     * numbers and the difference between them, and the plate on the ground is REMOVED rather than
     * left showing a previous answer next to a fresh "no". Leaving stale geometry beside a refusal
     * is how a user comes to believe the refusal was advisory.
     *
     * `stopPropagation` because the card header is a drag handle.
     */
    const wireTargetAreaEntry = (panel: HTMLDivElement): void => {
        const input = panel.querySelector(
            `[data-testid="${TARGET_AREA_INPUT_TESTID}"]`,
        ) as HTMLInputElement | null;
        const solveBtn = panel.querySelector(
            `[data-testid="${TARGET_AREA_SOLVE_BTN_TESTID}"]`,
        ) as HTMLButtonElement | null;
        const clearBtn = panel.querySelector(
            `[data-testid="${TARGET_AREA_CLEAR_BTN_TESTID}"]`,
        ) as HTMLButtonElement | null;
        if (clearBtn) {
            clearBtn.onclick = (ev) => {
                ev.stopPropagation();
                clearTargetFootprintProposal();
                targetAreaStatement = null;
                targetAreaRefused = false;
                targetAreaTyped = null;
                // The adopt transcript describes a plate that no longer exists — drop it with the
                // plate, or the card narrates a proposal that is off the ground.
                adoptStatement = null;
                adoptFailed = false;
                refreshEnvelopePanel();
            };
        }
        if (!input || !solveBtn) return;
        const solve = (ev: Event): void => {
            ev.stopPropagation();
            const env = getLastBuildableEnvelope();
            const figures = env ? permittedStudyFigures(env) : null;
            const raw = input.value.trim();
            const result = solveTargetFootprintArea({
                permittedRing: env?.insetPolygon ?? [],
                // The card's ONE producer of this number, so a refusal cannot cite a figure that
                // differs from the "Buildable footprint" row above it (C06 §13.3).
                permittedAreaM2: figures?.footprintM2 ?? 0,
                targetAreaM2: raw === '' ? null : Number(raw),
            });
            targetAreaTyped = raw === '' ? null : Number(raw);
            targetAreaStatement = result.statement;
            targetAreaRefused = !result.ok;
            // ⛔ A REFUSAL WITHDRAWS THE GEOMETRY. Never leave the previous plate on the ground
            // beside a fresh "no" — the picture would keep asserting what the words just denied.
            setTargetFootprintProposal(result.ok ? result : null);
            // A NEW answer supersedes whatever the last adopt attempt said about the old one.
            adoptStatement = null;
            adoptFailed = false;
            refreshEnvelopePanel();
        };
        solveBtn.onclick = solve;
        // Enter in the field does what the button does — this is a one-field question, and making
        // a user reach for the mouse to ask it is friction with no purpose.
        input.onkeydown = (ev) => {
            if ((ev as KeyboardEvent).key === 'Enter') solve(ev);
        };
    };

    /**
     * §RESI-ORCH-ADOPT (STR §5/§20, C114 §6a) — the CONFIRM step: the session STUDY plate becomes
     * a real, undoable, persisted LEVEL ENVELOPE element.
     *
     * ⭐ WHY THIS IS A SECOND, DELIBERATE GESTURE AND NOT PART OF "Fit this on the ground floor".
     * The founder's §20 loop is Generate → Explain → Compare → Edit → Recompute → **Confirm**, and
     * *"do not over-automate"* is the standing instruction. A solve that silently minted an element
     * would have skipped every step after the first, and it would put an undo entry on the ring for
     * a question the user was still asking. So the solve draws a study and the adopt commits it.
     *
     * ⛔ ONE GESTURE = ONE UNDO, and the only way to buy it is ONE `*.batch.create` (C16 §8.6 B-6).
     * `batchCoordinator.runBatch` is undo-NEUTRAL — N commands inside it are N ring entries — so
     * this dispatches the plugin's single batch verb with a one-element array, which is exactly
     * what C114 §6a says the batch verb is FOR ("no caller can reach for the wrong one").
     *
     * ⛔ THE ID IS MINTED HERE, NEVER IN THE HANDLER (C16 CA-2): `execute()` runs again on REDO, so
     * an id minted inside the handler would differ the second time and orphan every `withinId`
     * pointing at the first.
     *
     * ⛔ EVERY FAILURE ARM PRINTS. No proposal, no storeys, no ground storey, no bus, or a throw
     * from the bus — each states what happened and that nothing was created. A create button whose
     * click evaporates is the dead click this whole lane exists to remove.
     */
    const wireTargetAreaAdopt = (panel: HTMLDivElement): void => {
        const btn = panel.querySelector(
            `[data-testid="${TARGET_AREA_ADOPT_BTN_TESTID}"]`,
        ) as HTMLButtonElement | null;
        if (!btn) return;
        btn.onclick = (ev) => {
            ev.stopPropagation();
            ev.preventDefault();
            const env = getLastBuildableEnvelope();
            const figures = env ? permittedStudyFigures(env) : null;
            // The SAME staleness gate the card and the scene ask, so all three agree about whether
            // the plate on the ground is still a live answer to a live envelope.
            const live = resolveLiveTargetFootprintProposal(
                figures && figures.footprintM2 > 0 ? figures.footprintM2 : null,
            );
            let levels: ReturnType<typeof readLevelCandidates> = [];
            try {
                levels = readLevelCandidates(
                    (window.bimManager as { getLevels?: () => unknown[] } | undefined)?.getLevels?.() ?? [],
                );
            } catch (err) {
                console.warn('[gis][envelope-card] level read failed during adopt (non-fatal):', err);
            }
            const plan = buildAdoptProposalPlan(
                live,
                levels,
                { maxHeightM: env?.maxHeight_m ?? null, maxFloors: env?.maxFloors ?? null },
                createId('spaceEnvelope'),
            );
            if (!plan.ok) {
                adoptStatement = plan.statement;
                adoptFailed = true;
                refreshEnvelopePanel();
                return;
            }
            const bus = liveRuntime()?.bus;   // §L-12916 — never the null prop alone
            if (!bus || typeof bus.executeCommand !== 'function') {
                // An admission about PRYZM's wiring, never a statement about the user's project.
                adoptStatement =
                    'This surface has no command bus, so PRYZM cannot create the element. Nothing was '
                    + 'created and nothing changed — this is a gap in the wiring, not a refusal about '
                    + 'your design.';
                adoptFailed = true;
                refreshEnvelopePanel();
                return;
            }
            try {
                bus.executeCommand(plan.command, plan.payload);
                adoptStatement = `Created — one undo removes it. ${plan.statement}`;
                adoptFailed = false;
            } catch (err) {
                adoptStatement =
                    `PRYZM could not create the level envelope: ${String((err as Error)?.message ?? err)}. `
                    + 'Nothing was created and nothing changed.';
                adoptFailed = true;
            }
            refreshEnvelopePanel();
        };
    };

    /**
     * §RESI-ORCH-MASSING-OPTIONS (STR §7) — the generated option set, held for this card only.
     *
     * ⛔ NOT A STORE, AND NOT PERSISTED. A set of options is the transcript of one question the
     * user asked; restoring it on next load would present four alternatives nobody asked for as
     * though the product had decided something. It is dropped whenever the envelope is re-solved,
     * for the same reason the target-area plate is: options measured against a 92 m² footprint are
     * not options about a re-solved 61 m² one.
     */
    let massingOptions: MassingOptionSet | null = null;
    /**
     * The permitted footprint the set above was enumerated against.
     *
     * ⛔ THE STALENESS GATE, AND IT IS THE SAME ONE `resolveLiveTargetFootprintProposal` APPLIES TO
     * THE PLATE. Four options measured against a 92 m² footprint are not options about a re-solved
     * 61 m² one, and leaving them on the card would let a user pick a plate whose stated coverage,
     * storeys and floor area are all about a determination that no longer exists. Dropped, never
     * re-scaled: re-scaling would produce numbers nobody computed.
     */
    let massingOptionsForFootprintM2: number | null = null;

    /**
     * §RESI-ORCH-MASSING-OPTIONS — GENERATE, PICK, HIDE.
     *
     * ⭐ GENERATE IS AN ACT THE USER PERFORMS. The fold renders idle with a button; nothing is
     * enumerated on a card render. *"Do not over-automate"* — and each option runs a bisection over
     * the repo erosion, so generating on every `refreshEnvelopePanel` would also be wasteful.
     *
     * ⛔ PICK REUSES THE §5 CHANNEL AND MINTS NOTHING. An option's plate IS a
     * `TargetFootprintProposal`, so choosing one writes the same session slot a typed target
     * writes — the same scene draws it, the same staleness gate governs it, and the same adopt
     * button commits it. A second proposal channel here is how a card and a scene come to disagree
     * about which plate is on the ground.
     */
    const wireMassingOptions = (panel: HTMLDivElement): void => {
        const genBtn = panel.querySelector(
            `[data-testid="${MASSING_OPTIONS_GENERATE_BTN_TESTID}"]`,
        ) as HTMLButtonElement | null;
        if (genBtn) {
            genBtn.onclick = (ev) => {
                ev.stopPropagation();
                ev.preventDefault();
                const env = getLastBuildableEnvelope();
                const figures = env ? permittedStudyFigures(env) : null;
                const committed = getCommittedParcelBoundary();
                const parcelRing = committed?.polygon ?? [];
                try {
                    massingOptions = enumerateMassingOptions({
                        permittedRing: env?.insetPolygon ?? [],
                        // The card's ONE producer of both figures (C06 §13.3) — an option can never
                        // cite a footprint or a GFA that differs from the rows above it.
                        permittedFootprintM2: figures?.footprintM2 ?? 0,
                        permittedGfaM2: figures?.gfaM2 ?? null,
                        maxFloors: env?.maxFloors ?? null,
                        maxHeightM: env?.maxHeight_m ?? null,
                        parcelAreaM2: parcelRing.length >= 3 ? polyAreaM2(parcelRing) : null,
                    });
                } catch (err) {
                    console.warn('[gis][envelope-card] massing enumeration failed (non-fatal):', err);
                    massingOptions = null;
                }
                massingOptionsForFootprintM2 = figures?.footprintM2 ?? null;
                refreshEnvelopePanel();
            };
        }
        const clearBtn = panel.querySelector(
            `[data-testid="${MASSING_OPTIONS_CLEAR_BTN_TESTID}"]`,
        ) as HTMLButtonElement | null;
        if (clearBtn) {
            clearBtn.onclick = (ev) => {
                ev.stopPropagation();
                ev.preventDefault();
                massingOptions = null;
                massingOptionsForFootprintM2 = null;
                refreshEnvelopePanel();
            };
        }
        panel.querySelectorAll<HTMLButtonElement>(`[${MASSING_PICK_ATTR}]`).forEach((btn) => {
            btn.onclick = (ev) => {
                ev.stopPropagation();
                ev.preventDefault();
                const id = btn.getAttribute(MASSING_PICK_ATTR);
                const set = massingOptions;
                if (id === null || set === null || !set.ok) return;
                const option = set.options.find((o) => o.id === id) ?? null;
                if (option === null || option.proposal === null) return;
                // ⛔ ONE PROPOSAL CHANNEL. The picked plate becomes THE §5 proposal, so the card's
                // target-area section, the scene and the adopt step all read one answer.
                setTargetFootprintProposal(option.proposal);
                targetAreaTyped = Math.round(option.proposal.achievedAreaM2);
                targetAreaStatement =
                    `${option.label} — ${option.proposal.statement} `
                    + 'Chosen from the generated options; edit the area above to move away from it.';
                targetAreaRefused = false;
                // A newly picked plate supersedes anything the last adopt attempt said.
                adoptStatement = null;
                adoptFailed = false;
                refreshEnvelopePanel();
            };
        });
    };

    /**
     * §RESI-ORCH-COST (2026-09-03) — the two selects on the indicative-cost fold.
     *
     * A no-op when the fold is not on this render (it is built only on the full-determination
     * arm — a refusal card has no permitted GFA to price, and offering a cost input there would
     * imply buildability the ordinance has just denied).
     *
     * ⛔ AN EMPTY VALUE CLEARS THE CHOICE BACK TO "not chosen", which REMOVES the figure rather
     * than falling back to a default group. There is no default group and there must not be one:
     * Barcelona's own published table spans a factor of nine between its cheapest and dearest
     * rows, so a default would turn `estimateBuildingCost`'s honest `null` into a guess wearing a
     * BOPB citation. Same store as the 5D tab (`buildingTypologyChoice.ts`), so a user who
     * answers here sees their answer there and vice versa.
     */
    const wireEnvelopeCostSelects = (panel: HTMLDivElement): void => {
        const groupSel = panel.querySelector(
            `[data-testid="${ENVELOPE_COST_GROUP_SELECT_TESTID}"]`,
        ) as HTMLSelectElement | null;
        const corrSel = panel.querySelector(
            `[data-testid="${ENVELOPE_COST_CORRECTION_SELECT_TESTID}"]`,
        ) as HTMLSelectElement | null;
        if (groupSel) {
            groupSel.onchange = (ev) => {
                ev.stopPropagation();
                const v = groupSel.value;
                saveBuildingChoice(runtime, { ...loadBuildingChoice(runtime), groupId: v || null });
                refreshEnvelopePanel();
            };
        }
        if (corrSel) {
            corrSel.onchange = (ev) => {
                ev.stopPropagation();
                const v = corrSel.value;
                saveBuildingChoice(runtime, { ...loadBuildingChoice(runtime), correctionId: v || null });
                refreshEnvelopePanel();
            };
        }
    };

    /**
     * L-445 — the REDUCED card, shown when the buildable ring was read back from persistence
     * (C58 §1.7a) but this session never re-solved the envelope.
     *
     * ⚠ IT DELIBERATELY SHOWS LESS THAN THE FULL CARD. No confidence badge, no setback triple,
     * no FAR, no "Why these numbers?" — none of that provenance was re-derived on load, and
     * rendering a stale-looking badge or an empty derivation would present unverified data as a
     * determination (C58 §1.4). What IS persisted (the ring, and `Parcel.maxHeight`) is shown;
     * everything else says so plainly. The toggle is present so a visible envelope is always
     * controllable.
     */
    /**
     * §GIS-LEGACY-DETERMINATION-ESCAPE (L-1972) — THE ONE RECOMPUTE. Hoisted out of
     * `window.pryzmRecomputeEnvelopeCard` (§L-1587) so the reduced card and the empty state
     * share it instead of growing a second, drifting copy — the C06 §13.3 rule this whole
     * card has already been re-hosted twice to honour.
     *
     * Re-runs the SAME C58 determination against the SAME committed boundary via
     * `reapplyZoningForActiveSite`, which touches ZONING ONLY and never geometry (its own
     * header explains why a second `dispatchParcelBoundary` would silently re-rotate a
     * hand-drawn ring). Since §L-1654 that write also persists the full
     * `BuildableDeterminationRecord`, so a success RETIRES the legacy reduced arm for the
     * project rather than merely repainting this session.
     *
     * Returns TRUE only if a card is on screen afterwards. Every refusal branch survives: a
     * parcel that genuinely has no envelope still refuses, and the caller must say so.
     */
    const recomputeEnvelopeDetermination = (): boolean => {
        try {
            const ctx = resolveSiteContext(runtime ?? null);
            if (!ctx || !reapplyZoningForActiveSite(ctx)) return false;
            refreshEnvelopePanel();
            const present = !!envelopePanel && !!envelopePanel.parentElement;
            console.log(
                `[gis][envelope-card] §L-1587-RECOMPUTE re-derived from the committed parcel → `
                + `card ${present ? 'PRESENT' : 'ABSENT (C58 determined there is nothing to show)'}.`,
            );
            return present;
        } catch (e) {
            console.warn('[gis][envelope-card] §L-1587-RECOMPUTE failed (non-fatal):', e);
            return false;
        }
    };

    /**
     * §GIS-LEGACY-DETERMINATION-ESCAPE (L-1973) — can the recompute actually run here?
     *
     * Asked so the button renders DISABLED-WITH-REASON rather than live-and-inert when it
     * cannot (the L-1187 honest-unavailability rule). The predicate is the same one
     * `reapplyZoningForActiveSite` itself applies — an active site context with a committed
     * ≥3-point boundary — read rather than duplicated in spirit only.
     */
    const legacyRecomputeUnavailableReason = (): string | null => {
        try {
            const ctx = resolveSiteContext(runtime ?? null);
            if (!ctx) {
                return 'No active site in this session, so there is no committed boundary to '
                    + 're-solve against. Open the project’s site view first.';
            }
            const poly = ctx.store.getSite()?.parcel?.boundary?.polygon;
            if (!Array.isArray(poly) || poly.length < 3) {
                return 'This project has no committed parcel boundary to re-solve against — '
                    + 'select or draw a plot on the 2D map first.';
            }
            return null;
        } catch {
            return 'The site store could not be read in this session, so the re-solve cannot be '
                + 'offered. Nothing is wrong with the saved envelope above.';
        }
    };

    /**
     * §GIS-LEGACY-DETERMINATION-ESCAPE (L-1974) — wire the reduced card's escape hatch.
     *
     * A no-op query on every other render template (none of them emit this button), exactly
     * like `wireManualZoneButton` above. On failure the notice is REPLACED by its stated-failure
     * arm rather than the button silently re-enabling: "I pressed it and nothing happened" is
     * the defect this button exists to end, not one it may reintroduce.
     */
    const wireLegacyRecompute = (panel: HTMLDivElement): void => {
        const btn = panel.querySelector(
            `[data-testid="${LEGACY_RECOMPUTE_BTN_TESTID}"]`,
        ) as HTMLButtonElement | null;
        if (!btn || btn.disabled) return;
        btn.onclick = (ev) => {
            ev.stopPropagation(); // never bubble into the header's drag-start handler
            btn.disabled = true;
            btn.textContent = 'Solving…';
            // The recompute repaints the card itself on success (refreshEnvelopePanel), which
            // REPLACES this whole panel body with the full determination. So there is nothing
            // to clean up on the success path — only the failure path has to speak.
            if (recomputeEnvelopeDetermination()) return;
            // By the EXPORTED constant, never a copied literal: the failure arm is the one
            // branch a user only reaches when something already went wrong, so a renamed
            // testid must break the build here rather than silently swallow the message.
            const notice = panel.querySelector(
                `[data-testid="${LEGACY_NOTICE_TESTID}"]`,
            ) as HTMLElement | null;
            if (!notice) return;
            notice.outerHTML = buildLegacyDeterminationNoticeHtml({
                recomputeAvailable: false,
                failedReason:
                    'The determination engine could not resolve a site context for this project '
                    + 'in this session — this is a PRYZM-side failure, not a fact about your '
                    + 'land, and it says nothing about whether the plot is buildable.',
            });
        };
    };

    /**
     * §OLDPROJ168 (L-12780..) — build the "Stored determination" notice for a HYDRATED card
     * (a determination read back from persistence, never re-derived on load — see
     * `refreshEnvelopePanel`'s `hydratedAtIso`). Reuses `legacyRecomputeUnavailableReason`'s
     * predicate: it asks nothing "legacy"-specific, only whether there is an active site with a
     * committed ≥3-point boundary to re-check against — the exact precondition
     * `reapplyZoningForActiveSite` itself applies.
     */
    const buildHydratedDeterminationLine = (determinedAtIso: string): string => {
        const unavailableReason = legacyRecomputeUnavailableReason();
        return buildStoredDeterminationNoticeHtml(determinedAtIso, {
            refreshAvailable: unavailableReason === null,
            unavailableReason,
        });
    };

    /**
     * §OLDPROJ168 (L-12780..) — wire the "Stored determination" notice's OWN refresh button.
     * Shared by both card templates (refusal + full determination) since both render the SAME
     * `buildStoredDeterminationNoticeHtml` output whenever `hydratedAtIso` is non-null.
     *
     * Reuses `recomputeEnvelopeDetermination` — the SAME re-solve `wireLegacyRecompute` already
     * calls: re-runs the C58 determination against the boundary already committed to this
     * project (never redraws it) and PERSISTS whatever the source answers today, dated today.
     * That write is what lets the study massing + "type your own height" section reach a
     * restored parcel: a genuine NL absence answer triggers `attachNlContextDerivedStudy` from
     * inside the SAME `applyZoning` chain a fresh commit uses (§MANUALENV159 requirement 3) —
     * there is no separate wiring to add for that; re-solving IS what reaches it.
     *
     * On failure the notice is REPLACED by its stated-failure arm — never a live-looking button
     * that silently re-enables (the L-1187 rule `wireLegacyRecompute` above already follows).
     */
    const wireStoredDeterminationRefresh = (panel: HTMLDivElement, determinedAtIso: string): void => {
        const btn = panel.querySelector(
            `[data-testid="${REFRESH_DETERMINATION_BTN_TESTID}"]`,
        ) as HTMLButtonElement | null;
        if (!btn || btn.disabled) return;
        btn.onclick = (ev) => {
            ev.stopPropagation(); // never bubble into the header's drag-start handler
            btn.disabled = true;
            btn.textContent = 'Checking…';
            // Same success contract as `wireLegacyRecompute`: a successful recompute repaints
            // the WHOLE card via `refreshEnvelopePanel`, so there is nothing to clean up here —
            // only the failure path has to speak.
            if (recomputeEnvelopeDetermination()) return;
            const notice = panel.querySelector(
                `[data-testid="${STORED_DETERMINATION_TESTID}"]`,
            ) as HTMLElement | null;
            if (!notice) return;
            notice.outerHTML = buildStoredDeterminationNoticeHtml(determinedAtIso, {
                refreshAvailable: false,
                failedReason:
                    'The determination engine could not resolve a site context for this project '
                    + 'in this session — this is a PRYZM-side failure, not a fact about your '
                    + 'land, and it says nothing about whether the plot is buildable.',
            });
        };
    };

    const renderReducedEnvelopePanel = (viewport: HTMLElement, maxHeightM: number | null): void => {
        const panel = ensureEnvelopePanel(viewport);
        const heightTxt = maxHeightM !== null ? `${maxHeightM.toFixed(1)} m` : '—';
        // §XSS-SINK-SCAN (C08 §3.1) — `safe*` = escaped-before-assignment convention. Both
        // builders emit static author-written markup (zero runtime interpolation beyond a
        // boolean-selected literal); `heightTxt` is an internally-formatted number, escaped
        // anyway for consistency.
        const safeCloseBtn = envelopeCloseButtonHtml();
        const safeEnvToggle = envelopeToggleHtml();
        // §GIS-LEGACY-DETERMINATION-ESCAPE (L-1971) — the notice is now built by the PURE
        // module beside the other card sections, so both of its arms (route available /
        // route unavailable-with-reason) are pinned by envelopeCardSections.spec.ts rather
        // than asserted in a comment. It escapes its own interpolations (C08 §3.1).
        const unavailableReason = legacyRecomputeUnavailableReason();
        const safeLegacyNotice = buildLegacyDeterminationNoticeHtml({
            recomputeAvailable: unavailableReason === null,
            unavailableReason,
        });
        panel.innerHTML =
            `<div data-envelope-drag="1" title="Drag to move" style="display:flex;align-items:center;justify-content:space-between;margin-bottom:9px;cursor:grab;">
               <span style="font-weight:700;font-size:12.5px;color:#6600FF;">Buildable envelope</span>
               <span style="display:flex;align-items:center;">
                 <span style="flex:none;white-space:nowrap;display:inline-block;padding:2px 8px;border-radius:999px;background:#f4f2f8;color:#6b6480;font-weight:700;font-size:10px;letter-spacing:.03em;text-transform:uppercase;">Saved</span>
                 ${safeCloseBtn}
               </span>
             </div>
             <div style="display:flex;justify-content:space-between;"><span style="color:#6b6480;">Max height</span><span style="font-weight:600;">${escHtml(heightTxt)}</span></div>
             ${safeLegacyNotice}
             ${safeEnvToggle}`;
        wireEnvelopeToggle(panel);
        wireEnvelopeClose(panel);
        // §GIS-LEGACY-DETERMINATION-ESCAPE (L-1974) — the route OUT of this arm, which is the
        // half L-1652 did not build: naming the withheld sections told the founder what he was
        // missing without telling him how to get it, and the only route the copy did name
        // ("re-commit the parcel") is a GEOMETRY-touching action offered for a PROVENANCE gap.
        wireLegacyRecompute(panel);
    };

    // ── §ENVELOPE-SITE-DATA (L-586) — the full parcel + massing read-out ─────────────────────
    //
    // Founder 2026-07-22: *"I want as much data as possible in the panel about the parcel — depth,
    // site boundary dims, perimeter, levels, height, max buildable surface — with sources."*
    //
    // WHY THIS IS AN HONESTY FEATURE AND NOT DECORATION. The card previously showed four numbers.
    // A feasibility figure a user acts on is only as trustworthy as its provenance (C58 §1.3), and
    // the derivation trace already carried far more than we rendered — so the data existed and was
    // simply not surfaced. Everything below is COMPUTED FROM GEOMETRY WE HOLD or read from the
    // derivation trace; each group states where it came from.
    //
    // ⚠⚠ THE RULE THAT GOVERNS EVERY ROW: **NEVER SYNTHESISE A MISSING VALUE.** Storeys are shown
    // only when the rule pack actually derived `maxFloors`; they are NOT back-computed from
    // `height ÷ 3 m`, and max GFA is shown only when the storey count is real. An invented storey
    // count would look identical to a derived one and would silently propagate into every area and
    // yield figure on this card — the L-459 pattern, and the exact failure C58 §1.4 forbids. A
    // dash that says "not derived" is worth more than a plausible number.
    // §PARCEL-LAW-MODEL (STR §25.11 clause 1) — THE THREE RING HELPERS ARE NO LONGER LOCAL.
    //
    // They were `const`s inside this closure, so nothing outside `mountGISArea` could reach them
    // — which is why the Parcel Law tab had no route to "parcel area" or "footprint perimeter"
    // except its own arithmetic, the second-independently-computed model §25.11 clause 1 forbids.
    // ⚠ `polyAreaM2` was ALSO the THIRD copy of a shoelace this repo already had: the shared one
    // is `polygonAreaXZ` (`siteInspectorData.ts`, A.8.f, unit-tested), and a fourth lives in
    // `HouseLayoutController.ts:709`. Aliased rather than renamed at ~10 call sites, so the
    // migration is one reviewable hunk and every existing reader is unchanged.
    const polyPerimeterM = polygonPerimeterXZ;
    const polyAreaM2 = polygonAreaXZ;
    const polyBboxM = polygonBboxXZ;
    const num = (v: number, unit: string, dp = 1): string =>
        `${v.toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp })} ${unit}`;
    // §PARCEL-LAW-UNRESOLVED (L-616 / C58 §1.4) — the sentence now REFUSES THE COMPLETION the reader
    // would otherwise make. "not derived" alone is read as "unbounded", and an unbounded constraint
    // drawn on real land is an overstatement, not a blank. It also names where the empty slot is
    // accounted for, because the fold below now keeps a row for it instead of dropping it.
    const NOT_DERIVED =
        '<span style="color:#a49dbb;font-style:italic;" title="The rule pack did not derive this for this zone, and PRYZM does not infer it — an inferred value would be indistinguishable from a derived one. This is a MISSING LOOKUP, NOT a finding that the zone sets no limit. The row keeps its slot in &quot;Why these numbers?&quot; below.">not derived</span>';

    /**
     * §RESI-ORCH-COST (2026-09-03) — THE ONE PLACE THE CARD DERIVES ITS PERMITTED FOOTPRINT AND
     * GFA. Extracted, unchanged, out of `buildSiteDataBlock` because the indicative-cost fold now
     * needs the same two numbers and a second copy of `footprint × storeys` is exactly how a card
     * and the section beneath it come to state different areas for one parcel (C06 §13.3 — one
     * producer, many renderers).
     *
     * ⚠ THE `null` IS THE WHOLE POINT AND IS NOT AN OVERSIGHT. GFA is withheld whenever the rule
     * pack did not derive a storey count, because footprint × a GUESSED storey count is
     * indistinguishable from footprint × a derived one — and it would now propagate into money.
     */
    // §PARCEL-LAW-MODEL (STR §25.11 clause 1) — the BODY moved to `permittedStudyFiguresOf` in
    // `parcel/parcelLawModel.ts`, unchanged, so the Parcel Law tab states the SAME footprint and
    // the SAME GFA as this card instead of computing `footprint × storeys` a second time. The
    // local name is kept because eleven call sites in this file read it.
    const permittedStudyFigures = (
        e: NonNullable<ReturnType<typeof getLastBuildableEnvelope>>,
    ): { footprintM2: number; gfaM2: number | null } => permittedStudyFiguresOf(e);

    /**
     * §CARD-DEPTH-TERM (L-676) — the LOCAL-LANGUAGE name of the buildable-depth rule, taken from
     * the ordinance the card is already citing.
     *
     * ⚠ WHY NOT A HARD-CODED STRING. The card previously printed the Catalan *«profunditat
     * edificable»* for EVERY alignment zone in every country. On a Murcia card — whose own
     * `ordinanceRef` says *«fondo máximo edificable»* and whose plan is written in Castilian —
     * that is a credibility defect on the one surface whose entire proposition is that it quotes
     * the law correctly. It is read from the CITATION rather than from a jurisdiction table so a
     * new city inherits its own term the moment its pack quotes its own ordinance; Barcelona keeps
     * the Catalan because Barcelona's own quote is Catalan.
     */
    // §PARCEL-LAW-MODEL — moved to `resolveDepthTerm` so the tab prints the SAME local term.
    const depthTermFor = resolveDepthTerm;

    const buildSiteDataBlock = (env: ReturnType<typeof getLastBuildableEnvelope>): string => {
        if (!env) return '';
        // §MURCIA-CARD-PARCEL-RING (L-676) — read the ONE committed boundary through the SHARED
        // resolver, not `runtime?.siteModelStore` directly. See `getCommittedParcelBoundary`.
        const committed = getCommittedParcelBoundary();
        const parcelRing = committed?.polygon ?? [];
        const inset = env.insetPolygon ?? [];
        // ── §PARCEL-LAW-MODEL (STR §25.11 clause 1 · C06 §13.3) — ONE MODEL, BOTH SURFACES. ────
        //
        // Every figure this block used to derive inline — parcel area/perimeter/bbox, the frontage
        // clause, the ordinance rows, footprint, coverage, GFA, the storey bands, the Art. 323
        // count — is now produced ONCE by `buildParcelLawModel` and RENDERED here. The Parcel Law
        // tab builds the same model from the same two inputs, so the two surfaces cannot state
        // different setbacks, heights or FAR for one parcel — a disagreement that reaches the
        // user's land, which is why §25.11 clause 1 forbids a second model rather than merely
        // discouraging one.
        //
        // ⛔ THE RAW `edgeClassifications` IS PASSED THROUGH UNDEFAULTED, here as before: `?? []`
        // would tell the frontage rule "examined, landlocked" about a parcel nobody measured.
        const law = buildParcelLawModel({
            parcelRing,
            edgeClassifications: committed === null ? undefined : committed.edgeClassifications,
            identity: null,
            envelope: env,
        });
        // §GR-10/GR-14 — THREE outcomes, not two: never-classified, classified-
        // and-landlocked, and classified-with-N-frontages. `frontageClause`
        // prints a non-empty sentence for each; the old `?? []` + `> 0` test
        // printed the SAME empty string for the first two, so a card about an
        // unmeasured plot read exactly like a card about a landlocked one.
        // (Now read off the model's `geometry`, which calls the same rule; the fallback covers
        // the ring-absent arm, where the model has no geometry to carry a clause on.)
        const frontage = law.geometry?.frontageClause
            ?? frontageClause(committed === null ? undefined : committed.edgeClassifications);

        // §RESI-ORCH-COST / §RESI-ORCH-HIGHLIGHT — hoisted above `row` because BOTH the
        // massing rows below and the highlight-availability rule need them, and a second
        // `footprint × storeys` here is precisely how a card comes to disagree with the fold
        // beneath it (C06 §13.3). `permittedStudyFigures` is the ONE producer.
        const { footprintM2: footprint, gfaM2: gfa } = permittedStudyFigures(env);
        // §PARCEL-LAW-MODEL — read, not recomputed. `law.massing` is null on a refusal, and this
        // block is only reached on the full-determination arm, so `?? null` is the honest default
        // rather than a branch that could print a coverage for a parcel with no footprint.
        const coverPct = law.massing?.coveragePct ?? null;

        // ── §RESI-ORCH-HIGHLIGHT (STR §3) — WHICH ROWS MAY BE CLICKED, AND WHY THE REST MAY NOT.
        //
        // Decided ONCE per render by the pure rule in `siteGeometryHighlight.ts`, never inline:
        // the interesting arms (frontage-not-recorded vs frontage-is-zero; no derived height vs
        // no footprint) are exactly the ones that would be collapsed by an `if (x) {}` written at
        // the call site, and they are the ones a test has to be able to reach.
        //
        // ⛔ THE RAW `edgeClassifications` IS PASSED THROUGH UNDEFAULTED. `?? []` here would tell
        // the rule "examined, landlocked" about a parcel nobody measured — the exact conflation
        // `parcelEdgeClassificationDetermination.ts` was written to end.
        const highlightAvail = describeSiteHighlightAvailability({
            parcelRingLength: parcelRing.length,
            edgeClassifications: committed === null ? undefined : committed.edgeClassifications,
            footprintRingLength: inset.length,
            maxHeightM: env.maxHeight_m,
            gfaM2: gfa,
        });
        const activeHighlight = getSiteHighlight();

        /**
         * One read-out row. `highlight` opts the row into §3's click-a-number-light-the-geometry
         * binding.
         *
         * ⛔ THREE VISUAL STATES, NEVER TWO. A row whose geometry exists renders as a real,
         * focusable control; a row whose geometry does NOT exist renders as ordinary text with a
         * dimmed ◎ carrying the REASON in its title — never as a control that swallows a click.
         * A dead click is indistinguishable from a broken product AND from "we looked and found
         * nothing", which is the §CONTEXT-DATA-HONESTY conflation wearing an affordance.
         */
        const row = (
            label: string,
            value: string,
            hint?: string,
            highlight?: SiteHighlightSubject,
        ): string => {
            const avail = highlight ? highlightAvail[highlight] : null;
            const isOn = highlight !== undefined && activeHighlight === highlight;
            // The label is a button, or text-with-reason, or plain text — and the first two are
            // rendered by the module the spec clicks, never by a copy kept here.
            const labelHtml = highlight && avail
                ? buildSiteHighlightLabelHtml(label, highlight, avail, isOn)
                : `<span style="color:#6b6480;">${escHtml(label)}</span>`;
            return `<div style="display:flex;justify-content:space-between;gap:10px;padding:2.5px 0;">
               <span>${labelHtml}${hint ? `<span title="${escHtml(hint)}" style="color:#c3bdd6;cursor:help;"> ⓘ</span>` : ''}</span>
               <span style="font-weight:600;text-align:right;">${value}</span>
             </div>`;
        };
        const group = (title: string, source: string, body: string): string =>
            `<div style="margin-top:9px;">
               <div style="font-weight:700;font-size:10px;letter-spacing:.04em;text-transform:uppercase;color:#6600FF;">${escHtml(title)}</div>
               ${body}
               <div style="color:#a49dbb;font-size:9.5px;margin-top:3px;">${escHtml(source)}</div>
             </div>`;

        // ── PARCEL — pure geometry off the committed boundary. ──
        const parcelBlock = parcelRing.length >= 3
            ? group('Parcel', 'Cadastral boundary as committed to this project (Catastro / drawn), measured in scene metres.',
                // §RESI-ORCH-HIGHLIGHT — STR §3's first three rows of its own table:
                // Area → the parcel · Perimeter → the boundary · frontage → the relevant edges.
                row('Area', num(polyAreaM2(parcelRing), 'm²', 0), undefined, 'parcel')
                + row('Perimeter', num(polyPerimeterM(parcelRing), 'm'), undefined, 'boundary')
                + row('Bounding box', `${num(polyBboxM(parcelRing).w, '', 1)} × ${num(polyBboxM(parcelRing).d, 'm', 1)}`,
                    'Axis-aligned extent. A non-rectangular parcel has no single width × depth, so this is deliberately labelled a bounding box.')
                + row('Boundary edges', `${parcelRing.length}${frontage}`,
                    'Street frontage is the edge buildable depth insets FROM. "Not recorded" means '
                    + 'nobody classified this parcel\'s edges — it is NOT a finding that the plot has none.',
                    'frontage'))
            // §CONTEXT-DATA-HONESTY (L-422/457/467/469) — an ABSENT ring must SAY it is absent.
            // Rendering '' made the card jump from the header straight to ORDINANCE LIMITS, which
            // reads as "there is no parcel constraint" rather than "we could not read the parcel".
            // Failure and empty are the same value only if nobody prints the difference.
            : group('Parcel', 'The committed C19 parcel boundary could not be read from this session.',
                `<div style="color:#8a5a00;background:#fff6e8;border-radius:6px;padding:6px 8px;font-size:10px;line-height:1.5;">
                   <b>Parcel outline unavailable.</b> The massing figures below were solved against the
                   committed boundary, but this card could not re-read it, so <b>Area</b>, <b>Perimeter</b>
                   and <b>Footprint / parcel</b> are withheld rather than guessed. Re-commit the plot
                   (draw or select) to restore them. This is a missing READ, not a missing constraint.
                 </div>`);

        // ── ORDINANCE — every value read from the derivation trace, with its citation. ──
        const dRow = (c: string) => env.derivation.find((d) => d.constraint === c);
        const depthRow = dRow('alignment.depth');
        const ordBody =
            // §CARD-DEPTH-GRANULARITY (L-676) — the "Art. 242.2 / whole manzana" hint is BARCELONA's
            // construction (ADR-0271) and is true only for a BLOCK-DERIVED depth. The engine emits
            // `alignment.depthBinding` on exactly that path and on no other, so gate the hint on it.
            // Murcia's Art. 5.5.3 states 15 m at PARCEL granularity; telling a Murcia user their
            // neighbours share a block-derived figure would misstate the rule's own scope.
            (typeof depthRow?.value === 'number' ? row('Buildable depth', num(depthRow.value as number, 'm'),
                dRow('alignment.depthBinding') !== undefined
                    ? 'Block-granularity: PGM Art. 242.2 derives this from the whole manzana, so neighbouring parcels on the same block share it.'
                    : 'Parcel-granularity: the ordinance states this depth directly for the zone — see the citation below.') : '')
            // §RESI-ORCH-HIGHLIGHT — "Max height → the vertical limit". The plane is drawn only
            // from a DERIVED height; when the pack derived none the row is un-clickable and says so.
            + row('Max height', env.maxHeight_m !== null ? num(env.maxHeight_m, 'm') : NOT_DERIVED,
                undefined, 'height')
            + row('Storeys', env.maxFloors !== null ? String(env.maxFloors) : NOT_DERIVED,
                'Shown only when the rule pack derived it. We do NOT back-compute storeys from height ÷ a floor-to-floor guess.')
            + row('Max FAR', env.maxFAR !== null ? env.maxFAR.toFixed(2) : NOT_DERIVED,
                'Floor-area ratio — buildable floor area per m² of parcel. A blank here is a gap in our '
                + 'rule pack for this zone, never a statement that the zone caps no floor area.')
            + row('Max site coverage', env.maxCoverage !== null ? `${(env.maxCoverage * 100).toFixed(0)} %` : NOT_DERIVED,
                'Share of the PARCEL the building may occupy. A blank here is a gap in our rule pack '
                + 'for this zone, never a statement that the zone caps no coverage.');
        const ordCite = env.derivation.find((d) => typeof d.ordinanceRef === 'string' && d.ordinanceRef)?.ordinanceRef;
        const ordBlock = group('Ordinance limits',
            ordCite ? `Zone ${env.zoneCode ?? 'n/a'} · ${ordCite}` : `Zone ${env.zoneCode ?? 'n/a'} · citation held per row in "Why these numbers?"`,
            ordBody);

        // ── MASSING — what the limits actually buy. ──
        // ⚠ `footprint`, `coverPct` and `gfa` are HOISTED above `row` (see §RESI-ORCH-COST there).
        // GFA is `null` whenever the storey count was not derived — the "never synthesise storeys"
        // rule, because a guessed storey count would silently become a guessed sellable area,
        // which is the number a developer actually decides on.
        const massBody =
            // §RESI-ORCH-HIGHLIGHT — "Max footprint → the buildable envelope" and
            // "Max GFA → the resulting potential", the last two rows of STR §3's own table.
            row('Buildable footprint', footprint > 0 ? num(footprint, 'm²', 0) : NOT_DERIVED,
                undefined, 'footprint')
            + (coverPct !== null ? row('Footprint / parcel', `${coverPct.toFixed(0)} %`) : '')
            + (inset.length >= 3 ? row('Footprint perimeter', num(polyPerimeterM(inset), 'm')) : '')
            + row('Max buildable area (GFA)',
                // §PARCEL-LAW-MODEL — read from the MODEL, not from the raw `gfa` local, for one
                // narrow but real reason: with a zero footprint `permittedStudyFigures` returns
                // `0 × storeys = 0`, and this row printed "0 m²" directly under a "not derived"
                // footprint — two spellings of one absence, the numeric one being a claim about the
                // user's land (C58 §1.4). `law.massing.gfaM2` is null whenever the footprint is,
                // so the card and the Parcel Law tab state the same thing on that arm.
                law.massing?.gfaM2 != null ? num(law.massing.gfaM2, 'm²', 0) : NOT_DERIVED,
                'Footprint × storeys. Deliberately blank when the storey count was not derived — a guessed storey count would become a guessed sellable area.',
                'gfa')
            + row('Study volume', env.maxVolumeM3 !== null ? num(env.maxVolumeM3, 'm³', 0) : NOT_DERIVED,
                'Footprint × max height. A massing study volume, not a permitted volume.');
        const massBlock = group('Massing potential',
            'Computed from the inset footprint this card solved. A STUDY, not a permit.', massBody);

        // ── PER-STOREY — only when storeys are real. ──
        const perLevel = (() => {
            // §PARCEL-LAW-MODEL — the BANDS come from the model (`law.perStorey`), which applies the
            // same two rules: no storey table without a derived storey count and a real footprint,
            // and no vertical band without a derived max height (an equal division for study, never
            // an invented floor-to-floor). This block now only formats them.
            const ps = law.perStorey;
            if (ps === null) return '';
            const ftf = ps.floorToFloorM;
            const cells = ps.storeys.map((st) => {
                const band = st.bandFromM !== null && st.bandToM !== null
                    ? `${st.bandFromM.toFixed(1)}–${st.bandToM.toFixed(1)} m` : '—';
                return `<div style="display:flex;justify-content:space-between;gap:8px;padding:1.5px 0;">
                          <span style="color:#6b6480;">${escHtml(st.label)}</span>
                          <span style="color:#8a83a0;">${band}</span>
                          <span style="font-weight:600;">${num(st.areaM2, 'm²', 0)}</span>
                        </div>`;
            }).join('');
            const truncated = ps.truncatedCount > 0 ? `<div style="color:#a49dbb;font-size:9.5px;">…${ps.truncatedCount} further storeys not listed.</div>` : '';
            return group('Per storey', ftf !== null
                ? 'Even floor-to-floor from max height ÷ storeys — an EQUAL DIVISION for study, not a regulated storey height.'
                : 'No max height derived, so no vertical band is shown rather than an invented one.',
                cells + truncated);
        })();

        // ── §ENVELOPE-CAPACITY-DOMAIN (L-588) — CAPACITY IS NOT GEOMETRY. ────────────────────
        //
        // ⚠ THE DESIGN DECISION, AND IT IS A LEGAL ONE, NOT A UI ONE. PGM Art. 323 caps clau 13b at
        // 250 *habitatges* per hectare. The tempting shortcut is a yellow warning on the envelope —
        // and that would be WRONG TWICE OVER:
        //
        //   1. **A warning implies something is wrong. Nothing is wrong.** The geometric envelope is
        //      a COMPLETE and CORRECT answer to the geometric question. It is not defective; the
        //      PANEL is merely incomplete.
        //   2. **Density is ORTHOGONAL to geometry.** Two parcels can share an identical envelope —
        //      same height, depth, setbacks, occupation — and have entirely different legal
        //      capacity. "How large may the building be?" and "how many dwellings may exist inside
        //      it?" are different questions with different articles. Merging them into one object
        //      would make the envelope mean two things at once, and no later un-merging is cheap.
        //
        // So capacity gets its OWN SECTION with its own status, and the envelope keeps its ✓. The
        // long-term shape this anticipates is `ParcelAssessment { geometry, capacity, use, parking,
        // heritage, planning }` — at which point a future "Art. 412 hotel beds" drops into
        // `capacity` with no redesign. This section is that architecture's first tenant.
        //
        // ⚠ `status: Not yet evaluated` is deliberate and honest: we hold the CAP but do not compute
        // the parcel's dwelling count, so we can neither confirm nor deny compliance. Saying so is
        // the C58 §1.4 answer; implying the envelope already accounts for it would not be.
        // §L-590 — ⚠ THIS SECTION SHIPPED WITH THE WRONG RULE FOR ABOUT TWO HOURS. It read
        // "250 habitatges/ha", which is what our pack recorded for Art. 323. Barcelona's OWN
        // Art. 323 — recovered from the primary text, and marked *"d'aplicació exclusiva al
        // municipi de Barcelona"* (DOGC 4277, 10-12-2004) — states a per-parcel DWELLING COUNT
        // derived from BUILT AREA, not a density per hectare. A different SHAPE of quantity, not a
        // different number, which is the L-526 failure class.
        //
        // ⇒ And the corrected rule is COMPUTABLE from what this card already holds, so Capacity now
        // states a figure instead of deferring.
        //
        // ⚠ IT SAYS WHICH AREA IT USED. Art. 323.2 defines `superfície construïda` precisely
        // (between exterior enclosures, INCLUDING celoberts and ventilation courts, EXCLUDING
        // cossos sortints and ground-floor area beyond the upper storeys' fondària). **Our envelope
        // GFA approximates that and is not identical to it**, so this is labelled an indication,
        // never a determination — and it inherits the GFA's own honesty: when storeys were not
        // derived, GFA is null and this reads "not derived" rather than inventing a count.
        // §PARCEL-LAW-MODEL — `law.capacity` is non-null for exactly the zones Art. 323 governs and
        // carries the module, the count (which INHERITS GFA's null rather than inventing one) and
        // the citation. The zone test and the arithmetic are no longer written twice.
        const cap = law.capacity;
        const capacityBlock = cap !== null
            ? group('Capacity',
                'A SEPARATE legal question from the envelope above — the geometry is complete, and this is not a defect in it.',
                row('Dwelling module', `${cap.moduleM2} m² per dwelling`)
                + row('Max dwellings', cap.maxDwellings !== null ? `≈ ${cap.maxDwellings}` : NOT_DERIVED,
                    'Art. 323: superfície construïda ÷ 80 m², rounded up. Computed from the envelope GFA above, which APPROXIMATES the ordinance\'s superfície construïda rather than equalling it — an indication, not a determination.')
                + row('Source', cap.citation))
            : '';

        // §GIS-ENVELOPE-FULL-SECTIONS (L-1651) — a first-class fold of the card (no longer
        // nested inside a "Site data & capacity" wrapper); min/max-width contain it in the
        // narrow GIS rail.
        return `<details data-testid="envelope-section-site-data" style="margin-top:9px;border-top:1px solid #efecf7;padding-top:7px;min-width:0;max-width:100%;overflow-wrap:break-word;">
                  <summary style="cursor:pointer;font-weight:700;font-size:10.5px;color:#6600FF;list-style:none;">Full site &amp; massing data</summary>
                  <div style="font-size:10.5px;margin-top:4px;min-width:0;max-width:100%;">
                    ${parcelBlock}${ordBlock}${massBlock}${perLevel}${capacityBlock}
                    <div style="margin-top:9px;color:#8a5a00;background:#fff6e5;border-radius:6px;padding:5px 7px;font-size:9.5px;line-height:1.45;">
                      Values marked <i>not derived</i> were not produced by the rule pack for this zone.
                      PRYZM does not infer them — an inferred value would be indistinguishable from a
                      derived one on this card.
                    </div>
                  </div>
                </details>`;
    };

    /** Mount/refresh the "Estimated" facts card + on/off toggle (SPEC §2). */
    const refreshEnvelopePanel = (): void => {
        const viewport = getForma3dHostEl();
        const live = getLastBuildableEnvelope();
        // §L-574 — `status: 'none'` NO LONGER IMPLIES "nothing to say". The construction-
        // incomplete refusal carries that status (attempted, no data) together with a `refusal`
        // object, and BOTH fallback branches below would have destroyed it: one would paint a
        // reduced card from a stale persisted ring, the other would remove the panel outright.
        // A refusal rendered as an empty screen is the failure L-553 exists to prevent — a blank
        // panel reads as a crash, not as "we could not complete this". So a `'none'` carrying a
        // refusal skips both and falls through to the refusal card below.
        const isNoneWithoutRefusal = (e: typeof live): boolean =>
            !!e && e.status === 'none' && !e.refusal;
        // §GIS-ENVELOPE-DETERMINATION-PERSIST (L-1654, founder 2026-08-21) — HYDRATE, never
        // re-derive. When this session holds no solved envelope, read the FULL determination
        // persisted at parcel-commit time and render the SAME complete card from it — in the
        // main scene as much as the site view. The session-solved envelope always wins when
        // present (it IS this session's answer). Nothing is re-derived on load: the stored
        // record is a dated snapshot, the date is rendered on the card, and re-committing the
        // parcel is the one refresh.
        const hydrated = (!live || isNoneWithoutRefusal(live))
            ? resolveStoredBuildableDetermination(runtime ?? null)
            : null;
        const env = hydrated ? hydrated.envelope : live;
        const hydratedAtIso = hydrated?.determinedAtIso ?? null;
        // L-445 — the LEGACY reduced card. Reachable only for projects saved BEFORE the
        // determination record shipped (ring persisted, record null): the card must not vanish
        // while the VOLUME is on screen, but that provenance was never persisted and inventing
        // it is precisely the C58 §1.4 violation the reduced card exists to prevent.
        // Re-committing the parcel re-solves, persists the full record, and retires this arm
        // for the project.
        if (viewport && (!env || isNoneWithoutRefusal(env))) {
            const persisted = resolveRenderableBuildableEnvelope(runtime ?? null);
            if (persisted && persisted.source === 'persisted') {
                renderReducedEnvelopePanel(viewport, persisted.maxHeightM);
                return;
            }
        }
        // No envelope (no parcel / cleared) → drop the card entirely.
        if (!viewport || !env || isNoneWithoutRefusal(env)) {
            if (envelopePanel?.parentElement) envelopePanel.parentElement.removeChild(envelopePanel);
            envelopePanel = null;
            return;
        }
        // (shell creation + re-homing is shared with the reduced card — see ensureEnvelopePanel)
        const panel = ensureEnvelopePanel(viewport);

        // ── §L-456 — THE COMPLIANCE COMPARISON SECTION (designed vs permitted). ───────────────
        //
        // The envelope card states a LIMIT. The question a *proyecto de ejecución* has to answer
        // is "how much have I used, how much is left, am I over?" — a COMPARISON, and until now
        // the user did that arithmetic in their head.
        //
        // THREE SEPARATE PIECES, deliberately: the L5 adapter MEASURES the authored model
        // (`designMeasurement.ts` — never inferring a value it cannot measure), the pure L2 model
        // JUDGES it against the envelope (`buildCapacityComparison`), and the pure L5 builder
        // RENDERS it (`capacityPanelSection.ts`). This file only joins them, which is the only
        // thing it is entitled to do: the BIM authored model and the site/zoning model are peers
        // that may not import each other, so their join belongs at the composition layer.
        //
        // Computed BEFORE the refusal branch on purpose. When no envelope applies, the permitted
        // side is legitimately unknown — every row reads "not checked" — but the DESIGNED side is
        // still the area schedule the founder asked for, and it is honest to show it.
        //
        // The `safe*` name is the repo's escaped-before-assignment convention (C08 §3.1): the
        // builders escape every runtime string they interpolate via their own local `escHtml`.
        //
        // §GIS-ENVELOPE-FULL-SECTIONS (L-1652) — the catch used to `return ''`, which rendered a
        // MEASUREMENT FAILURE and "nothing to compare" as the same absent section — the
        // §CONTEXT-DATA-HONESTY conflation, at the exact surface whose job is honesty. The join
        // still never takes the card down, but a failure now reaches the fold builders as a
        // stated fact (`joinFailed`), and they render it in words — never as zeros, never as a
        // pass, never as silence.
        const capacityJoin = ((): {
            comparison: ReturnType<typeof buildCapacityComparison>;
            measurement: ReturnType<typeof measureAuthoredDesign> | null;
            joinFailed: boolean;
        } => {
            try {
                const measurement = measureAuthoredDesign(collectAuthoredModelSnapshot({
                    // The authoritative storey datums for the AUTHORED model (BimKernel levels).
                    // A declared global, not `(window as any)` — P4 holds.
                    levels: (window.bimManager as { getLevels?: () => unknown[] } | undefined) ?? null,
                    slabs: storeRegistry.getStoreForType('slab') ?? null,
                    rooms: storeRegistry.getStoreForType('room') ?? null,
                    walls: storeRegistry.getStoreForType('wall') ?? null,
                }));
                const comparison = buildCapacityComparison(env, measurement.design, {
                    maxFloors: env.maxFloors ?? null,
                });
                return { comparison, measurement, joinFailed: false };
            } catch {
                return { comparison: null, measurement: null, joinFailed: true };
            }
        })();
        const safeCapacitySection = buildDesignedVsPermittedFold(
            capacityJoin.comparison, capacityJoin.measurement, { joinFailed: capacityJoin.joinFailed });
        // §GIS-ENVELOPE-FULL-SECTIONS (L-1650 root cause 2) — "How these were measured" is a
        // first-class fold with arms for the states the old `caveats.length > 0` gate could
        // never reach: nothing-authored, authored-but-unmeasurable, and measure-failed.
        const safePerLevelSection = buildPerLevelBuiltAreaFold(
            capacityJoin.measurement, { joinFailed: capacityJoin.joinFailed });
        const safeMeasuredSection = buildHowMeasuredFold(
            capacityJoin.measurement, { joinFailed: capacityJoin.joinFailed });

        // ── §RESI-ORCH-INTENDED (C114 §3a) — THE THIRD AREA CHANNEL. ──────────────────────────
        //
        // ⛔ *"Three questions, three authorities, never summed into one number."* BUILT is
        // `measureAuthoredDesign` (real floor plates, the fold above). PERMITTED is the
        // `BuildableEnvelope` (the rows at the top of this card). INTENDED is the space-envelope
        // family — and ADR-0380 D5 forbids the measurement from consuming it, so it is read HERE,
        // through its own reader, and rendered under its own label. PRYZM never adds them.
        //
        // ⚠ THE STORE IS ALLOWED TO BE ABSENT, and `collectIntendedAreas` says so in words rather
        // than reporting an empty project: a runtime with no `spaceEnvelope` slot is a gap in
        // PRYZM's wiring, not a finding that nothing is intended. That distinction is the whole
        // reason this is a reader with a `readable` discriminant instead of a `?? []`.
        const levelRecords = ((): unknown => {
            try {
                return (window.bimManager as { getLevels?: () => unknown[] } | undefined)?.getLevels?.() ?? [];
            } catch {
                return [];
            }
        })();
        const safeIntendedSection = ((): string => {
            try {
                return buildIntendedAreaFold(collectIntendedAreas(
                    liveRuntime()?.stores?.spaceEnvelope ?? null,   // §L-12916
                    readLevelCandidates(levelRecords).map((l) => ({
                        id: l.id, name: l.name, elevation: l.elevation,
                    })),
                ));
            } catch (err) {
                console.warn('[gis][envelope-card] intended-area fold failed (non-fatal):', err);
                return '';
            }
        })();

        // ── §RESI-ORCH-DESIGN-STAGE (STR §1/§19/§21) — "where am I, and what can I do?" ──
        //
        // Computed HERE, beside the capacity join and BEFORE the refusal branch, for the same
        // reason that join is: a refusal card is a place a user can be, and it is the arm where
        // "what now?" is loudest. The strip renders on both templates.
        //
        // ⛔ EVERY INPUT IS EVIDENCE THIS SURFACE CAN ACTUALLY SEE. The stage is DERIVED, never
        // stored, so it cannot claim "you are at BIM" about a project with no authored storey —
        // and where this panel genuinely cannot see something, it passes the honest `null` rather
        // than a `false` that would print a finding about the user's project out of a gap in
        // PRYZM's own wiring. `hasProgramme` is exactly that case today (the programme table lives
        // in the Data Workbench and is not joined here), and the model prints the difference.
        const designStages: readonly DesignStageStatus[] = ((): readonly DesignStageStatus[] => {
            try {
                const committedRing = getCommittedParcelBoundary()?.polygon ?? [];
                const figures = permittedStudyFigures(env);
                const m = capacityJoin.measurement;
                return describeDesignStages({
                    hasCommittedParcel: committedRing.length >= 3,
                    // A REFUSAL reaching this point has no inset ring, so this is false on the
                    // refusal arm by measurement rather than by a branch someone remembered.
                    hasResolvedEnvelope: figures.footprintM2 > 0,
                    hasMassingProposal:
                        resolveLiveTargetFootprintProposal(
                            figures.footprintM2 > 0 ? figures.footprintM2 : null,
                        ) !== null,
                    // ⛔ null, NOT false — see the block comment above.
                    hasProgramme: null,
                    designedStoreyCount: m?.designedStoreyCount ?? 0,
                    // Net area is measured ONLY from real room boundaries, so a non-null value is
                    // exactly "rooms exist". Derived from the ONE measurement rather than a second
                    // read of the room store (C06 §13.3).
                    hasRooms: m?.design.netFloorAreaM2 != null,
                    measurementFailed: capacityJoin.joinFailed,
                });
            } catch (err) {
                console.warn('[gis][envelope-card] design-stage strip failed (non-fatal):', err);
                // ⛔ EMPTY, NOT A FABRICATED LADDER. `describeEnvelopeCardSections([])` renders the
                // canonical order with NOTHING gated, which is the honest plan when PRYZM could
                // not compute a stage: gating a section on a stage it does not know would print a
                // reason it does not have.
                return [];
            }
        })();
        const safeDesignStageStrip = buildDesignStageStripHtml(designStages);
        // ── §RESI-ORCH-STAGE-WIRE (STR §21) — *"the panel EVOLVES with the stage."* ──
        // The plan decides ORDER and RELEVANCE only. Nothing is hidden, no fold is opened, no
        // number changes — see `designStagePanel.ts` for why a vanishing section is the wrong fix.
        const sectionPlan = describeEnvelopeCardSections(designStages);

        // §GIS-ENVELOPE-DETERMINATION-PERSIST (L-1654) — a HYDRATED card must wear its date,
        // prominently (mirroring the parcel section's "Retrieved:" line): a stored snapshot
        // presented as freshly derived would fabricate recency, which is provenance (C58 §1.4).
        // Rendered on BOTH the full and refusal templates; '' for a session-solved envelope.
        //
        // §OLDPROJ168 (L-12780..) — "Re-commit the parcel to refresh it" is GONE from this line.
        // It was the ONLY stated route forward and it asked the user to redraw geometry to fix a
        // provenance gap — see `buildStoredDeterminationNoticeHtml`'s own header for why. The
        // notice now carries its own "Re-check this parcel" button (wired below, both templates)
        // that re-asks the source without touching the boundary.
        const safeHydratedLine = hydratedAtIso ? buildHydratedDeterminationLine(hydratedAtIso) : '';

        // ── §L-550 PHASE-1B — THE REFUSAL CARD. ──────────────────────────────────────────────
        // `status: 'not-applicable'` means the ORDINANCE answered and its answer is "no private
        // buildable envelope applies here" (a public system, protected soil, or a zone the
        // general plan delegates to a per-site derived plan — clau 18 alone is 22.5 % of
        // Barcelona's private buildable land). That is a POSITIVE result and it gets its own
        // rendering, deliberately unlike BOTH the estimated card and the degenerate one:
        //
        //   • NO "Estimated" badge — nothing was estimated. The chip says "No envelope applies".
        //   • NO setback/height/FAR rows — there are no numbers, and three dashes would read as
        //     "not filled in yet", which is exactly the ambiguity this whole slice removes.
        //   • The reason + its citation are the CONTENT, not a footnote.
        //
        // Returning early is what guarantees no estimated row can leak in underneath.
        // §L-574 — `'none'` joins `'not-applicable'` here. A refusal is identified by its
        // refusal OBJECT; the status says which KIND (see `isRefusedEnvelope`, whose allow-list
        // this mirrors). Omitting `'none'` was the bug that would have made the third card
        // unreachable — the envelope would have fallen through to the numeric rows below and
        // rendered as an empty determination.
        if ((env.status === 'not-applicable' || env.status === 'none') && env.refusal) {
            const r = env.refusal;
            // ── §L-553 — TWO VISUALLY DISTINCT CARDS, and the split is load-bearing. ─────────
            //
            // `legallyGrounded: true`  → THE ORDINANCE says no envelope applies here (a park, a
            //                            motorway, a clau-18 plot). A settled, cited answer.
            // `legallyGrounded: false` → PRYZM has not encoded THIS zone's rules yet. A coverage
            //                            gap on a roadmap, and a statement about US, not the law.
            //
            // Since the founder switched on the coverage-gap refusal, HALF OF BARCELONA'S
            // BUILDABLE LAND lands on the second card. If it reads as "broken" rather than "not
            // yet", we have traded a labelled wrong answer for an apparent product failure —
            // strictly worse. The lesson is a day old: fabricated context heights were rendered
            // translucent so a guess could not look surveyed, and the founder asked "why are some
            // buildings WIREFRAME?" — not "why don't we know those heights?". An honest signal
            // that is not LEGIBLE is not honest in effect.
            //
            // So the coverage-gap card leads with a NEUTRAL, forward-looking chip (never red,
            // never a warning triangle — this is not an error state), names the user's zone
            // first, and shows the facts we DO hold so the panel is never blank.
            // ── §L-574 — A THIRD CARD, and it MUST be branched before `legallyGrounded`. ──────
            //
            // `source-data-unavailable` is ALSO `legallyGrounded: false`, so the two-way split
            // above would have handed it the "Zone rules coming" chip — telling an Eixample owner
            // we have not encoded 13a, which is false and is precisely the kind of confident,
            // plausible-sounding wrong statement this family of work exists to remove.
            //
            // It is the only TRANSIENT refusal: the rule is encoded and applies, and an INPUT was
            // missing for this parcel. So it is the only one that says "try again", and the only
            // one whose chip implies motion rather than a settled state.
            const isTransient = r.code === 'source-data-unavailable';
            // STRUCTURAL-SEAM-4 (C58 §1.13.8) — a GENUINE data-absence: the source ANSWERED and there
            // is no plan published at this point. Distinct from `isTransient` (a fetch that FAILED and
            // is retried) and from `isGap` (a zone PRYZM has not encoded). It gets its own honest card:
            // "no plan published here", and — crucially — NO retry affordance, because re-asking a
            // source that already said "nothing here" would loop for ever (the failure≠empty conflation
            // this whole seam removes, L-422/457/467/469).
            const isAbsent = r.code === 'no-plan-at-point';
            const isGap = !isTransient && !isAbsent && !r.legallyGrounded;
            // §MANUALENV159 (L-12640) — TASK A: surface the study/refusal that was previously
            // computed (SIG-NL2 gate open) but written only to a state slot "for a future rail
            // panel to read" — no rail panel ever read it, which is why the founder's console
            // proving a SECOND refusal (`insufficient-neighbour-sample`) never reached him. Read
            // the SAME session slot the context-derived study writes AND a user-supplied save
            // writes (one slot, one renderer — see `envelopeCardSections.ts`). Also read the
            // project-persisted raw decision to prefill the entry form on re-open.
            //
            // TASK B: the "type a height" entry is offered on a GENUINE data-absence (`isAbsent`)
            // or a coverage gap (`isGap`) — states where PRYZM itself has no answer. NOT on
            // `isTransient` (a retry may still resolve this) and NOT on the base "no envelope
            // applies" card below (a SETTLED legal answer — offering a massing input there would
            // misleadingly imply buildability where the ordinance says there is none).
            const studyCtx = resolveSiteContext(runtime ?? null);
            const studySite = studyCtx?.store.getSite() ?? null;
            const studyResult = studySite ? getContextDerivedStudyEnvelope(studySite.id) : null;
            const savedStudyHeight = studySite ? getUserSuppliedStudyHeight(studySite.id) : null;
            // §DVP170 (L-12820) — feed the SAME `capacityJoin.measurement` this branch already
            // computed above (before the refusal check, precisely so the designed side is never
            // lost when the zoning envelope refuses) into the study section, so it can add its
            // one factual "designed vs this study" line. Never a second measurement pass.
            const safeContextStudySection = buildContextStudySectionHtml(studyResult, capacityJoin.measurement);
            const safeStudyHeightEntry = (isAbsent || isGap)
                ? buildStudyHeightEntryHtml(savedStudyHeight)
                : '';
            // §L-577a — THE CHIP MUST NOT SHRINK. It rendered as `COULDN'T COMPL…` because it is a
            // flex item in the header row and flex items default to `flex-shrink: 1`, so the pill
            // was compressed below its own text and clipped. Two fixes, both needed: `flex:none`
            // stops the pill shrinking, and the header row is allowed to WRAP (below) so on a
            // narrow panel the chip drops to a second line instead of either text being cut.
            //
            // ⚠ Deliberately NOT fixed by shortening the wording. The whole point of this card is
            // that a refusal reads as honest rather than broken, and a clipped word reads as a
            // broken widget — the L-527/L-553 rule that an honest signal which is not LEGIBLE is
            // not honest in effect. Truncation was a layout defect, so it is fixed in the layout.
            // §XSS-SINK-SCAN (C08 §3.1) — every `safe*` const below is the escaped-before-
            // assignment convention: static author-written markup, or a builder that routes
            // every runtime string (r.knownFacts / r.ordinanceRef / r.code / env.zoneCode —
            // PROVIDER-SUPPLIED planning data) through the local `escHtml` at build time.
            const safeChip = isTransient
                ? '<span title="We hold this zone\'s rules; the data source needed to apply them did not answer for this parcel. Temporary — it has been retried automatically." style="flex:none;white-space:nowrap;display:inline-block;padding:2px 8px;border-radius:999px;background:#fff6e8;color:#9a6414;font-weight:700;font-size:10px;letter-spacing:.03em;text-transform:uppercase;">Temporarily unavailable</span>'
                : isAbsent
                ? '<span title="The planning source answered and there is no adopted plan / buildable footprint published at this point. Not an error, and not a limit on your land." style="flex:none;white-space:nowrap;display:inline-block;padding:2px 8px;border-radius:999px;background:#eef2f7;color:#3d4a5c;font-weight:700;font-size:10px;letter-spacing:.03em;text-transform:uppercase;">No plan published here</span>'
                : isGap
                ? '<span title="PRYZM has not encoded this zone\'s rules yet — a coverage gap, not a legal finding and not an error" style="flex:none;white-space:nowrap;display:inline-block;padding:2px 8px;border-radius:999px;background:#f3eeff;color:#6600FF;font-weight:700;font-size:10px;letter-spacing:.03em;text-transform:uppercase;">Zone rules coming</span>'
                : '<span title="The governing ordinance provides no private buildable envelope for this zone" style="flex:none;white-space:nowrap;display:inline-block;padding:2px 8px;border-radius:999px;background:#eef2f7;color:#3d4a5c;font-weight:700;font-size:10px;letter-spacing:.03em;text-transform:uppercase;">No envelope applies</span>';
            // "What we DO know" — the single strongest signal that the parcel was identified
            // correctly and nothing crashed. Rendered as facts, never as constraints.
            const safeFacts = Array.isArray(r.knownFacts) && r.knownFacts.length > 0
                ? `<div style="margin-top:9px;padding:7px 8px;background:#faf9fd;border-radius:6px;">
                     <div style="color:#6b6480;font-size:10px;font-weight:700;letter-spacing:.03em;text-transform:uppercase;margin-bottom:4px;">What PRYZM found for this parcel</div>
                     ${r.knownFacts.map((f) => `<div style="color:#3d4a5c;font-size:10.5px;line-height:1.5;">${escHtml(f)}</div>`).join('')}
                   </div>`
                : '';
            // A coverage gap has NO ordinance citation by design — citing one would be an
            // authoritative-looking reference for a claim the document does not make (L-526). So
            // the "no citation" line is shown only on the LEGAL card, where its absence would be
            // a real omission.
            // §L-574 — the transient card joins the coverage gap in showing NO "missing citation"
            // note. Neither is an article-sourced classification, so flagging an absent citation
            // would invite the reader to look for a legal basis that was never claimed — and on
            // this card it would actively mislead, since Art. 242.2 IS the governing rule and is
            // not the reason we failed. Our data path is (L-526).
            const safeCite = r.ordinanceRef
                ? `<div style="margin-top:8px;color:#8a83a0;font-size:10px;line-height:1.45;">${escHtml(r.ordinanceRef)}</div>`
                : isGap || isTransient || isAbsent
                ? ''
                : '<div style="margin-top:8px;color:#a49dbb;font-size:10px;">No citation held for this classification.</div>';
            const safeReasonLine = isTransient
                // STRUCTURAL-SEAM-4 (RECONCILED) — the transient failure has ALREADY been auto-retried
                // with backoff at the fetch seam before this card was shown (C57 §1.5 / C58 §1.13.8), so
                // the old "this usually clears on a second attempt" was no longer honest — the machine
                // already tried. Say what is true: the source was briefly unavailable, it was retried,
                // and re-selecting re-runs the resolve. Removed the fictional-retry framing (the
                // §CONTEXT-DATA-HONESTY point: an honest signal that overstates is not honest in effect).
                ? `<div style="margin-top:8px;color:#9a6414;font-size:10.5px;line-height:1.5;">The planning source was temporarily unavailable and has been retried automatically. Re-select the parcel to try again.</div>
                   <div style="margin-top:4px;color:#a49dbb;font-size:10px;">Status <code style="font-size:10px;">${escHtml(r.code)}</code> — a temporary source outage, not an error, and not a limit on your land. Your parcel, boundary and area are unaffected.</div>`
                : isAbsent
                // STRUCTURAL-SEAM-4 — a GENUINE absence: NO retry hint (the source already answered
                // "nothing here"; re-asking returns the same empty — offering a retry would loop for
                // ever). State it as the source's answer, and reassure that the land is unaffected.
                ? `<div style="margin-top:8px;color:#3d4a5c;font-size:10.5px;line-height:1.5;">No adopted plan or buildable footprint is published at this point — this is the planning source’s answer, not an error, and it will not change on a retry.</div>
                   <div style="margin-top:4px;color:#a49dbb;font-size:10px;">Status <code style="font-size:10px;">${escHtml(r.code)}</code> — not a limit on your land. Your parcel, boundary and area are unaffected.</div>`
                : isGap
                ? `<div style="margin-top:8px;color:#a49dbb;font-size:10px;">Coverage status <code style="font-size:10px;">${escHtml(r.code)}</code> — not an error. Your parcel, boundary and area are unaffected.</div>`
                : `<div style="margin-top:8px;color:#8a83a0;font-size:10.5px;">Zone ${escHtml(env.zoneCode ?? 'n/a')} · reason <code style="font-size:10px;">${escHtml(r.code)}</code></div>`;
            // §COR-MANUAL-ADMIN-ZONE (2026-08-05, founder: "I thought this would be in the
            // buildable envelope panel") — a coverage-gap card is EXACTLY where an allowlisted
            // admin wants to type a zone code, so the affordance belongs here, not only on a
            // separate floating panel the user has to already know exists. Rendered unconditionally
            // (isGap only — the state this whole feature targets); the click handler itself asks
            // `GET /api/session/whoami` and is a documented no-op for any non-admin session, so a
            // non-admin who clicks it simply sees nothing happen, same contract as every other
            // admin-only entry point in this codebase.
            const safeManualZoneBtn = isGap
                ? `<button data-testid="envelope-manual-zone-btn" type="button"
                           style="margin-top:8px;width:100%;appearance:none;border:1px dashed #6600FF;
                                  cursor:pointer;padding:6px 10px;border-radius:8px;font:600 11px system-ui;
                                  background:#faf9fd;color:#6600FF;">
                     🛠️ Set zone manually (admin)
                   </button>`
                : '';
            const safeCloseBtn = envelopeCloseButtonHtml();
            const safeEnvToggle = envelopeToggleHtml();
            panel.innerHTML =
                `<div data-envelope-drag="1" title="Drag to move" style="display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:6px 8px;margin-bottom:9px;cursor:grab;">
                   <span style="font-weight:700;font-size:12.5px;color:#6600FF;">Buildable envelope</span>${safeChip}${safeCloseBtn}
                 </div>
                 ${safeHydratedLine}
                 <div style="font-weight:600;font-size:11.5px;color:#3d4a5c;line-height:1.4;">${escHtml(r.headline)}</div>
                 <div style="margin-top:6px;color:#6b6480;font-size:11px;line-height:1.5;">${escHtml(r.detail)}</div>
                 ${safeFacts}
                 ${safeReasonLine}
                 ${safeCite}
                 ${safeManualZoneBtn}
                 ${safeContextStudySection}
                 ${safeStudyHeightEntry}
                 ${buildStagedSectionsHtml(sectionPlan, {
                     'designed-vs-permitted': safeCapacitySection,
                     'how-measured': safeMeasuredSection,
                     'intended-area': safeIntendedSection,
                 })}
                 ${safeDesignStageStrip}
                 ${safeEnvToggle}`;
            wireEnvelopeToggle(panel);
            wireEnvelopeClose(panel);
            wireManualZoneButton(panel);
            wireStudyHeightEntry(panel);
            // §RESI-ORCH-STAGE-WIRE — the "do this next" pill. On THIS arm the massing control is
            // the study-height entry, which carries `data-stage-control="massing"`; when the arm
            // does not host it the jump prints WHERE the control is rather than doing nothing.
            wireDesignStageStrip(panel);
            // §OLDPROJ168 — the REFUSAL-card arm. A stored determination is a dated snapshot, so
            // the notice it renders needs its button live here too: this is the arm the founder
            // actually lands on with an old project (a stored `source-data-unavailable` from a
            // past session), and it was the one route out that the copy named but never wired.
            if (hydratedAtIso) wireStoredDeterminationRefresh(panel, hydratedAtIso);
            return;
        }
        const setback = (c: 'setback.front' | 'setback.side' | 'setback.rear'): string => {
            const e = env.derivation.find((d) => d.constraint === c);
            return typeof e?.value === 'number' ? `${e.value.toFixed(1)} m` : '—';
        };
        // §L-518 — the `block-constructed` tier (Barcelona PGM Art. 242.2) is REAL data, so it must
        // NOT wear the ESTIMATED badge — but it is a CONSTRUCTED determination, not an official
        // certificate, so the badge says "Real · constructed" (not a bare "verified"), per the
        // RISK-REGISTER R1 wording condition. Green (real) with the honest qualifier.
        // §L-619 / §CONTEXT-DATA-HONESTY — when the FOOTPRINT is a whole-parcel UPPER BOUND (the
        // ordinance publishes no setbacks, so the inset could not be shaped — the Copenhagen case),
        // the confidence badge must NOT read "STRUCTURED": the height/FAR are structured, but the
        // FOOTPRINT is a maximum extent, and a "STRUCTURED" chip over a full-parcel ring is exactly
        // the confident-solid overstatement L-616/L-619 exist to remove. Show an honest amber "Max
        // extent" chip instead; the per-field provenance stays intact in the "Why these numbers?"
        // rows (height/FAR are still badged PUB/EST there). Same signal the §1.14 rasteriser uses to
        // draw the near-wireframe max-extent solid — one honesty decision, two surfaces.
        const isUpperBound = env.footprintIsUpperBound === true;
        // STRUCTURAL-SEAM-3 (C58 §5.4a, L-630) — the headline chip is a pure derivation over the
        // SAME per-field provenance the "Why these numbers?" rows carry, so it can never out-rank
        // its own rows. `report` is built once here and reused by the explain-why block below.
        const report = buildComplianceReport(env);
        const headline = resolveHeadlineProvenance(report);
        // §PACK-CONFIDENCE-CEILING (L-665) — THE MACHINE-EXTRACTED TIER IS THE LOUDEST ARM AND MUST
        // BE TESTED FIRST, from EITHER direction:
        //   • the scalar tier (`pipeline-extracted-unverified` — now reachable, since
        //     `ZoningRulesEngine` clamps a solve to its pack's declared `defaultConfidence`), OR
        //   • the WEAKEST ROW (`pipeline-extracted`), per C58 §5.4a — the header may never read
        //     stronger than its own rows.
        // It was previously the SECOND-TO-LAST arm, below `headline.hasEstimatedField`. So a
        // machine-extracted pack carrying even ONE `estimated` field would have been badged violet
        // "Estimated" — the very silent promotion this change exists to stop — because
        // `pipeline-extracted-unverified` ranks STRICTLY BELOW `estimated-ruleset` on
        // `ENVELOPE_CONFIDENCE_ORDER`, so "weakest wins" has to put red above violet.
        // §XSS-SINK-SCAN (C08 §3.1) — `safe*` renames below are the escaped-before-assignment
        // convention: each builder is static author-written markup or escapes its runtime
        // strings via the local `escHtml` / `safeHttpUrl` where it builds them.
        const safeBadge = (env.confidence === 'pipeline-extracted-unverified' ||
            headline.weakestField === 'pipeline-extracted')
            ? '<span title="This value was MACHINE-EXTRACTED from an ordinance by PRYZM’s pipeline and has NOT been human-verified — it must not be relied on until a person signs it off. NOT an official determination." style="flex:none;white-space:nowrap;display:inline-block;padding:2px 8px;border-radius:999px;background:#fdecea;color:#b3261e;border:1px solid #f3b9b3;font-weight:800;font-size:10px;letter-spacing:.03em;text-transform:uppercase;">⚠ Unverified · machine-extracted</span>'
            : isUpperBound
            ? '<span title="The footprint shown is the whole parcel because this ordinance publishes no setbacks — a MAXIMUM extent, not a solved buildable area. The height and FAR are real; only the footprint is an upper bound." style="flex:none;white-space:nowrap;display:inline-block;padding:2px 8px;border-radius:999px;background:#fff6e8;color:#9a6414;font-weight:700;font-size:10px;letter-spacing:.03em;text-transform:uppercase;">Max extent — setbacks unpublished</span>'
            // C58 §5.4a — ANY estimated field forces "Estimated", EVEN when `env.confidence` claims
            // `structured` / `block-constructed`: the header must not read stronger than its weakest
            // row. This is the primary seam fix (the old code reached "Estimated" only via the scalar
            // `confidence === 'estimated-ruleset'`, so a `structured` envelope with an estimated
            // setback silently badged STRUCTURED).
            : headline.hasEstimatedField
                ? '<span title="At least one value in this determination is an ESTIMATE — the headline reflects the weakest field, never stronger than its own rows (see Why these numbers?)." style="flex:none;white-space:nowrap;display:inline-block;padding:2px 8px;border-radius:999px;background:#f3eeff;color:#6600FF;font-weight:700;font-size:10px;letter-spacing:.03em;text-transform:uppercase;">Estimated</span>'
            // L-630 (NL) — `estimated-ruleset` scalar over REAL published fields: the confidence was
            // reduced by the FOOTPRINT (a zone/bestemmingsvlak extent — an upper bound), NOT by field
            // provenance. Badging "Estimated" here is the exact mislabel L-630 caught. Say what is
            // true: the fields are real; the footprint is an upper bound.
            : headline.confidenceUnderRatesFields
                ? '<span title="The height and other fields shown are REAL, published values. The footprint shown is the ZONE extent (bestemmingsvlak) — an UPPER BOUND, not a precise per-building buildable area — so overall confidence is reduced. This is not a default rule pack." style="flex:none;white-space:nowrap;display:inline-block;padding:2px 8px;border-radius:999px;background:#fff6e8;color:#9a6414;font-weight:700;font-size:10px;letter-spacing:.03em;text-transform:uppercase;">Zone extent — upper bound</span>'
            : env.confidence === 'estimated-ruleset'
                ? '<span style="flex:none;white-space:nowrap;display:inline-block;padding:2px 8px;border-radius:999px;background:#f3eeff;color:#6600FF;font-weight:700;font-size:10px;letter-spacing:.03em;text-transform:uppercase;">Estimated</span>'
                : env.confidence === 'block-constructed'
                ? '<span title="Real inputs + accepted rule + constructed geometry — not an official municipal certificate" style="flex:none;white-space:nowrap;display:inline-block;padding:2px 8px;border-radius:999px;background:#eef7ee;color:#2e7d32;font-weight:700;font-size:10px;letter-spacing:.03em;text-transform:uppercase;">Real · constructed</span>'
            // C58 §1.6 / §6 / ADR-0279 BLOCKER-1 (the zoning fidelity-label gate) — the
            // MACHINE-EXTRACTED arm USED TO SIT HERE, second-to-last, and that position was the bug:
            // `headline.hasEstimatedField` above it would have caught a machine-extracted pack with
            // any single `estimated` field and badged it violet "Estimated". It is now the FIRST arm
            // of this ladder (see the §PACK-CONFIDENCE-CEILING note above `const badge =`), because
            // `pipeline-extracted-unverified` ranks BELOW `estimated-ruleset` and the header must
            // read its weakest input. Red, never the green certificate pill, and permanent until a
            // human signs off (the tier graduates only via a recorded verification event).
                : `<span style="flex:none;white-space:nowrap;display:inline-block;padding:2px 8px;border-radius:999px;background:#eef7ee;color:#2e7d32;font-weight:700;font-size:10px;text-transform:uppercase;">${escHtml(env.confidence)}</span>`;
        const heightTxt = env.maxHeight_m !== null ? `${env.maxHeight_m.toFixed(1)} m` : '—';
        const farTxt = env.maxFAR !== null ? env.maxFAR.toFixed(2) : '—';
        const gfaTxt =
            env.maxVolumeM3 !== null
                ? `${Math.round(env.insetAreaM2).toLocaleString()} m² footprint`
                : env.status === 'degenerate'
                ? 'no buildable area'
                : '—';
        // L-399a — cite the source. An estimated envelope keeps the "default rule
        // pack" note; a real (structured) DK envelope cites Plandata.dk + its plan
        // document (C58 §1.3 explain-why). `ordinanceRef` is the plan `doklink`.
        const ordRef =
            env.derivation.find((d) => typeof d.ordinanceRef === 'string' && d.ordinanceRef)?.ordinanceRef ?? null;
        const sourceId = env.derivation[0]?.source ?? '';
        // §L-402-XSS — `ordRef` + `sourceId` are PROVIDER-SUPPLIED (Plandata.dk et al.), so the
        // link is protocol-validated and all interpolated text is escaped. A non-http(s) ref is
        // rendered as plain text, never as an anchor href.
        const ordHref = safeHttpUrl(ordRef);
        const safeSourceLine =
            // L-630 — a real published envelope whose `estimated-ruleset` scalar came from the
            // zone-extent footprint (NOT a default pack) must NEVER show the "Default rule pack"
            // line. State the true reason: the fields are real; the footprint is an upper bound.
            // §PACK-CONFIDENCE-CEILING (L-665) — matched FIRST, mirroring the badge ladder. Without
            // it a machine-extracted envelope fell to the generic `Source: <id>` line, which names
            // the PUBLISHER and so implies the publisher stands behind the number. It does not: we
            // read it, and we have not checked our reading. The caption must say whose error a
            // wrong value would be.
            env.confidence === 'pipeline-extracted-unverified' ||
            headline.weakestField === 'pipeline-extracted'
                ? '<span style="color:#b3261e;font-size:10.5px;">Machine-extracted by PRYZM from the published ordinance and <b>not yet human-verified</b> — a wrong value here is our error, not the publisher’s. Awaiting sign-off.</span>'
                : headline.confidenceUnderRatesFields
                ? '<span style="color:#8a83a0;font-size:10.5px;">Real published fields (e.g. height); the footprint is the zone extent — an upper bound — so overall confidence is reduced. Not a default rule pack.</span>'
                : env.confidence === 'estimated-ruleset'
                ? '<span style="color:#8a83a0;font-size:10.5px;">Default rule pack — real DK/ES zoning coming</span>'
                : env.confidence === 'block-constructed'
                // §BCN-OV-CITATION (L-1656) — the article is READ FROM THE DERIVATION, never
                // hard-coded: the clau-18 OV arm (L-1660) constructs from the published
                // per-site volumetric ordering, not Art. 242.2, and citing 242.2 there is an
                // L-583-class mis-citation on a real determination. See the builder's header.
                ? `<span style="color:#8a83a0;font-size:10.5px;">${escHtml(resolveBlockConstructedSourceText(env.derivation))}</span>`
                : sourceId === 'plandata-dk'
                ? `<span style="color:#8a83a0;font-size:10.5px;">Source: Plandata.dk${ordHref ? ` · <a href="${escHtml(ordHref)}" target="_blank" rel="noopener noreferrer" style="color:#6600FF;text-decoration:underline;">plan document</a>` : ''}</span>`
                : `<span style="color:#8a83a0;font-size:10.5px;">Source: ${escHtml(sourceId || 'zoning provider')}</span>`;

        // ── L-402 slice 2 — the EXPLAIN-WHY report ────────────────────────────
        // Every number above is only trustworthy if the user can see WHERE it came from
        // (C58 §1.3). `buildComplianceReport` is the PURE model (site-parcel-data, 11 tests);
        // this renders it as a collapsed <details> so the card stays compact but the full
        // determination — value · zone · source · provenance · citation — is one click away.
        // HONESTY (C58 §1.4): estimated rows are badged individually; a row with no citation
        // reads "no citation" rather than silently looking authoritative.
        // (`report` is built above the badge — STRUCTURAL-SEAM-3 — and reused here.)
        //
        // §PARCEL-LAW-UNRESOLVED (STR §25.1 block B · C58 §1.3/§1.4 · L-616) — A PROMISED ROW KEEPS
        // ITS SLOT. Block B above prints Max height / Storeys / Max FAR / Max site coverage on
        // EVERY parcel, falling to `not derived`. This fold used to `continue` past any constraint
        // the derivation did not carry, so those rows VANISHED here — and the reader could not tell
        // "we did not look up FAR" (a hole in OUR data) from "this zone states no FAR limit" (a
        // finding about the ordinance). A reader completes the missing row as "unbounded", which is
        // an OVERSTATEMENT on real land. `report.unresolvedRows` is the pure model's answer and the
        // WORDS come from `complianceCitationSlots`, so both arms are pinned by a test rather than
        // by a ternary written here.
        const safeWhyBlock = (() => {
            if (!citationFoldHasContent(report)) return '';
            const rpt = report!;
            const pillHtml = (slot: { pill: string; tone: string; title: string }): string => {
                // Tone → colour lives HERE and nowhere else; the module decides meaning, not paint.
                const paint = slot.tone === 'machine'
                    ? 'color:#b3261e;background:#fdecea;border:1px solid #f3b9b3;font-weight:800;'
                    : slot.tone === 'uncited'
                    ? 'color:#b3261e;background:#fdecea;border:1px solid #f3b9b3;font-weight:800;'
                    : slot.tone === 'estimated'
                    ? 'color:#6600FF;background:#f3eeff;font-weight:700;'
                    : slot.tone === 'published'
                    ? 'color:#2e7d32;background:#eef7ee;font-weight:700;'
                    // `stated-empty` and `unfilled` are DELIBERATELY the same neutral grey: both
                    // mean "no figure here", and colouring one of them like a determination is the
                    // very confusion this section exists to end.
                    : 'color:#6b6480;background:#f2f0f7;border:1px solid #e3dff0;font-weight:700;';
                return `<span title="${escHtml(slot.title)}" style="${paint}border-radius:999px;padding:1px 6px;font-size:9.5px;">${escHtml(slot.pill)}</span>`;
            };
            const rowsHtml = rpt.rows.map((r) => {
                const slot = describeCitationSlot(r);
                const href = safeHttpUrl(r.ordinanceRef);
                const cite = href
                    ? `<a href="${escHtml(href)}" target="_blank" rel="noopener noreferrer" style="color:#6600FF;text-decoration:underline;">citation</a>`
                    : r.ordinanceRef
                    ? escHtml(r.ordinanceRef)
                    : '<span style="color:#a49dbb;">no citation</span>';
                // §PACK-CONFIDENCE-CEILING (L-665) — THE PER-ROW BADGE COULD NOT EXPRESS THE
                // MACHINE-EXTRACTED TIER, and defaulted to the WRONG side of the ladder.
                // `ComplianceReportRow.isEstimate` is `fieldProvenance === 'estimated'` ONLY, so a
                // `pipeline-extracted` row — a value OUR OCR pipeline read and no human checked —
                // was falsy and fell to the green "PUB" (published) pill: the strongest per-field
                // affordance the card has, on the weakest real provenance there is (C58 §1.6:
                // `pipeline-extracted` ranks STRICTLY BELOW `ordinance-pdf`). Fixing the headline
                // chip alone would have left every row underneath it still reading "PUB".
                // Branched FIRST, and red to match the headline chip — the two must agree.
                // ⚠ THE LADDER MOVED INTO `describeCitationSlot`, ORDER PRESERVED, PLUS ONE ARM:
                // a row whose entry resolved to NO VALUE now reads "STATES NONE" instead of a bare
                // em-dash under a green PUB pill — badging "published" over nothing asserts that a
                // figure was published. See that function's header for why the order is load-bearing.
                const prov = pillHtml(slot);
                // §L-508b — STACKED, not two-column. The old side-by-side flex let a long label
                // ("Buildable depth (profunditat edificable)") take the whole width and starve the
                // value to a per-character strip. Label on its own line, then the bold value + PUB/
                // EST badge, then the zone·source·citation line — reads top-to-bottom, never starves.
                return `<div style="padding:5px 0;border-top:1px solid #efecf7;">
                          <div style="color:#6b6480;margin-bottom:2px;">${escHtml(r.label)}</div>
                          <div><b>${escHtml(r.valueText)}</b> ${prov}</div>
                          <div style="color:#8a83a0;font-size:10px;margin-top:1px;">zone ${escHtml(r.zoneCode)} · ${escHtml(r.source)} · ${cite}</div>
                        </div>`;
            }).join('');
            // §PARCEL-LAW-UNRESOLVED — THE SLOTS THE CARD PROMISED AND THE PACK DID NOT FILL.
            // They are rendered as REAL ROWS, in block B's own reading order, carrying the label the
            // card used and a sentence in place of the citation. They are NOT interleaved with the
            // resolved rows: a reader scanning the fold must be able to see, in one glance, which
            // part of this determination is sourced and which part is a hole in it.
            const unresolvedHtml = rpt.unresolvedRows.length === 0 ? '' : (() => {
                const items = rpt.unresolvedRows.map((u: ComplianceUnresolvedRow) => {
                    const slot = describeUnresolvedSlot(u);
                    return `<div style="padding:5px 0;border-top:1px solid #efecf7;">
                              <div style="color:#6b6480;margin-bottom:2px;">${escHtml(u.label)}</div>
                              <div>${pillHtml(slot)}</div>
                              <div style="color:#8a83a0;font-size:10px;margin-top:1px;line-height:1.4;">${escHtml(slot.note ?? '')}</div>
                            </div>`;
                }).join('');
                return `<div style="margin-top:7px;">
                          <div style="font-weight:700;font-size:10px;letter-spacing:.04em;text-transform:uppercase;color:#6b6480;">Rows with no citation</div>
                          ${items}
                        </div>`;
            })();
            const gfa = rpt.maxGrossFloorAreaM2 !== null
                ? `<div style="display:flex;justify-content:space-between;padding:4px 0;border-top:1px solid #efecf7;">
                     <span style="color:#6b6480;">Max gross floor area</span>
                     <span style="font-weight:600;">${Math.round(rpt.maxGrossFloorAreaM2).toLocaleString()} m²</span>
                   </div>
                   <div style="color:#a49dbb;font-size:9.5px;margin-top:2px;">Zoning ceiling = buildable footprint × FAR (indicative).</div>`
                : '';
            // ⚠ THE ESTIMATE FRACTION KEEPS ITS OWN DENOMINATOR. `describeCitationFoldCaveats`
            // counts unresolved slots in a SEPARATE sentence rather than growing `rows.length`;
            // quietly widening an existing fraction restates a published quantity as a different
            // one, which is the L-526 failure class.
            const caveats = describeCitationFoldCaveats(rpt);
            const caveat = caveats.length === 0 ? '' : caveats.map((line) =>
                `<div style="margin-top:6px;color:#8a5a00;background:#fff6e5;border-radius:6px;padding:5px 7px;font-size:10px;line-height:1.45;">${escHtml(line)}</div>`).join('');
            // §GIS-ENVELOPE-FULL-SECTIONS (L-1651) — first-class fold; contained for the
            // narrow GIS rail like its three sibling sections.
            return `<details data-testid="envelope-section-why" style="margin-top:9px;min-width:0;max-width:100%;overflow-wrap:break-word;">
                      <summary style="cursor:pointer;color:#6600FF;font-size:11px;font-weight:600;list-style:none;">Why these numbers?</summary>
                      <div style="margin-top:5px;font-size:11px;min-width:0;max-width:100%;">${rowsHtml}${unresolvedHtml}${gfa}${caveat}</div>
                    </details>`;
        })();
        // §L-518c — an ALIGNMENT zone (Barcelona 13a) has NULL setbacks/height/FAR BY DESIGN (the
        // "rear setback" IS the profunditat edificable), so the setback-triple summary read as
        // "empty / not filled in" (founder). When the envelope is alignment-governed (an
        // `alignment.depth` derivation row is present), surface the fields that ACTUALLY govern —
        // buildable DEPTH + alignment offset + area — instead of three dashes.
        const alignDepthRow = env.derivation.find((d) => d.constraint === 'alignment.depth');
        const alignOffsetRow = env.derivation.find((d) => d.constraint === 'alignment.offset');
        const isAlignmentZone = typeof alignDepthRow?.value === 'number';
        const depthSummaryTxt = isAlignmentZone ? `${(alignDepthRow!.value as number).toFixed(1)} m` : '—';
        const offsetSummaryTxt =
            typeof alignOffsetRow?.value === 'number' ? `${(alignOffsetRow!.value as number).toFixed(1)} m` : '—';
        const safeRows =
            env.status === 'degenerate'
                ? `<div style="color:#b23b3b;font-weight:600;">Setbacks consume the whole parcel — no buildable envelope.</div>`
                : isAlignmentZone
                ? `<div style="display:flex;justify-content:space-between;gap:8px;"><span style="color:#6b6480;">Buildable depth</span><span style="font-weight:600;text-align:right;">${depthSummaryTxt}</span></div>
                   <div style="display:flex;justify-content:space-between;margin-top:3px;"><span style="color:#6b6480;">Alignment offset</span><span style="font-weight:600;">${offsetSummaryTxt}</span></div>
                   <div style="display:flex;justify-content:space-between;margin-top:3px;"><span style="color:#6b6480;">Buildable</span><span style="font-weight:600;">${gfaTxt}</span></div>
                   <div style="color:#a49dbb;font-size:9.5px;margin-top:3px;">Alignment zone — setbacks/height/FAR set by the ${escHtml(depthTermFor(alignDepthRow?.ordinanceRef))}, not a numeric triple.</div>`
                : `<div style="display:flex;justify-content:space-between;"><span style="color:#6b6480;">Setbacks (F/S/R)</span><span style="font-weight:600;">${setback('setback.front')} / ${setback('setback.side')} / ${setback('setback.rear')}</span></div>
                   <div style="display:flex;justify-content:space-between;margin-top:3px;"><span style="color:#6b6480;">Max height</span><span style="font-weight:600;">${heightTxt}</span></div>
                   <div style="display:flex;justify-content:space-between;margin-top:3px;"><span style="color:#6b6480;">Max FAR</span><span style="font-weight:600;">${farTxt}</span></div>
                   <div style="display:flex;justify-content:space-between;margin-top:3px;"><span style="color:#6b6480;">Buildable</span><span style="font-weight:600;">${gfaTxt}</span></div>`;
        // §L-619 / §CONTEXT-DATA-HONESTY — the honest caveat for an upper-bound footprint. States,
        // in words, that the footprint == the whole parcel BECAUSE the ordinance publishes no
        // setbacks (so it could not be reduced), that a real building will therefore be smaller, and
        // that this is a MAXIMUM extent, not a buildable solid. Height/FAR are untouched — they are
        // structured; only the FOOTPRINT is the upper bound.
        const safeUpperBoundCaveat = isUpperBound
            ? `<div style="margin-top:8px;padding:6px 8px;background:#fff6e8;border-radius:6px;color:#8a5a00;font-size:10px;line-height:1.5;">
                 <b>Footprint = whole parcel.</b> This ordinance publishes no setbacks (e.g. byggelinjer),
                 so the buildable area could not be reduced from the lot outline — the shape shown is a
                 <b>maximum extent</b>, not a buildable solid. A real building will be smaller (neighbouring
                 blocks here keep a rear-yard setback). Height and FAR are real; only the footprint is an upper bound.
               </div>`
            : '';
        // STRUCTURAL-SEAM-3 / L-630 — the honest caveat for the NL zone-extent case: `confidence`
        // is `estimated-ruleset` but every field is REAL/published; the reduction is the FOOTPRINT
        // (a bestemmingsvlak zone extent — an upper bound), not the fields. `footprintIsUpperBound`
        // is NOT set on this explicit-area path (that flag is the setback-inset / whole-parcel case
        // above), so this is a sibling caveat, shown only when `upperBoundCaveat` is not.
        const safeZoneExtentCaveat = !isUpperBound && headline.confidenceUnderRatesFields
            ? `<div style="margin-top:8px;padding:6px 8px;background:#fff6e8;border-radius:6px;color:#8a5a00;font-size:10px;line-height:1.5;">
                 <b>Footprint = zone extent.</b> No separate buildable footprint (bouwvlak) was published for
                 this parcel, so the shape shown is the ZONE (bestemmingsvlak) extent — an <b>upper bound</b> on
                 where you may build, not a precise per-building buildable area. The height and other fields are
                 real, published values; only the footprint is an upper bound. A real building will be smaller.
               </div>`
            : '';
        // §XSS-SINK-SCAN — `buildSiteDataBlock` escapes every runtime string it interpolates
        // via the local `escHtml` (its `row`/`group` helpers); close/toggle are static markup.
        const safeSiteDataBlock = buildSiteDataBlock(env);
        // ── §RESI-ORCH-COST (2026-09-03) — THE INDICATIVE COST FOLD, at the ENVELOPE stage. ──
        //
        // STR §15 wants an approximate €/m² figure *before* anything is drawn. The engine for it
        // has shipped since L-9100 and was reachable only from the 5D tab, whose area comes from
        // a TAKE-OFF — i.e. only once slabs exist, which is exactly when an indicative number has
        // stopped being the question. This is the join, and it is deliberately three lines of
        // plumbing over four existing pure functions rather than a second estimator:
        //
        //   `permittedStudyFigures` (this card's ONE producer of footprint + GFA)
        //     → `envelopeStudyBuiltArea`  (the named `'envelope-study-gfa'` proxy + its caveat)
        //       → `estimateBuildingCost`  (the SAME estimator the 5D tab uses; `null`, never 0)
        //         → `buildIndicativeCostFold` (five `data-state` arms, one per refusal)
        //
        // ⚠ EVERY REFUSAL SURVIVES. No module for this location ⇒ the resolver's own sentence.
        // No derived storey count ⇒ no GFA ⇒ no figure, stated in words. No typology ⇒ no figure,
        // and the fold ASKS. A `try` guard wraps only the store/geography reads, and its catch
        // yields `''` — the one arm that renders nothing — because a cost fold that cannot even
        // resolve a jurisdiction has no fact to state, and the card must never be taken down by
        // an optional section.
        const safeCostSection = ((): string => {
            try {
                const figures = permittedStudyFigures(env);
                const area = envelopeStudyBuiltArea(figures.gfaM2, env.maxFloors, figures.footprintM2);
                const resolved = resolveBuildingCostModels(currentCostJurisdiction());
                const choice = loadBuildingChoice(runtime);
                const model = resolved.models[0];
                const estimate = model
                    ? estimateBuildingCost(model, choice.groupId, area, choice.correctionId)
                    : null;
                return buildIndicativeCostFold(resolved, area, choice, estimate);
            } catch (e) {
                console.warn('[gis][envelope-card] indicative cost fold failed (non-fatal):', e);
                return '';
            }
        })();
        // ── §RESI-ORCH-TARGET-AREA (STR §5) — the target GROUND-FLOOR AREA entry. ──
        //
        // Only on THIS arm (a full determination), never on the refusal card: §5's ask is
        // *"refuse with BOTH numbers when it exceeds the permitted footprint"*, and a card with no
        // permitted footprint has only one number to state. The height entry above is the mirror
        // image — it lives on the refusal card because a typed height stands in for a measurement
        // that is missing.
        //
        // ⚠ THE STALENESS GATE IS ASKED HERE, NOT `getTargetFootprintProposal`. A plate solved
        // inside a 92 m² footprint is not a proposal about a re-solved 61 m² one; see
        // `resolveLiveTargetFootprintProposal`. Both this card and the scene ask the same gate, so
        // they cannot disagree about whether the plate is still live.
        const safeTargetAreaSection = ((): string => {
            try {
                const figures = permittedStudyFigures(env);
                const live = resolveLiveTargetFootprintProposal(figures.footprintM2);
                if (live === null && !targetAreaRefused) {
                    // The gate dropped a stale plate — drop the sentence that described it too,
                    // or the card would narrate geometry that is no longer on the ground.
                    if (targetAreaStatement !== null && !targetAreaRefused) targetAreaStatement = null;
                }
                return buildTargetAreaEntryHtml(
                    figures.footprintM2 > 0 ? figures.footprintM2 : null,
                    targetAreaStatement,
                    targetAreaRefused,
                    targetAreaTyped,
                    // ⛔ THE KEEP BUTTON EXISTS ONLY WHEN THERE IS SOMETHING LIVE TO KEEP. `null`
                    // withholds the affordance rather than rendering a disabled control that could
                    // only ever refuse — see the builder's own `@param adopt`.
                    live === null ? null : { statement: adoptStatement, failed: adoptFailed },
                );
            } catch (err) {
                console.warn('[gis][envelope-card] target-area entry failed (non-fatal):', err);
                return '';
            }
        })();
        const safeMassingOptionsSection = ((): string => {
            try {
                // The staleness gate — see `massingOptionsForFootprintM2`. 0.5 m² is the same band
                // `resolveLiveTargetFootprintProposal` uses, so the plate and the options it came
                // from cannot go stale at different moments.
                const nowFootprintM2 = permittedStudyFigures(env).footprintM2;
                if (
                    massingOptions !== null
                    && (massingOptionsForFootprintM2 === null
                        || Math.abs(massingOptionsForFootprintM2 - nowFootprintM2) > 0.5)
                ) {
                    massingOptions = null;
                    massingOptionsForFootprintM2 = null;
                }
                return buildMassingOptionsFold(
                    massingOptions === null ? { kind: 'idle' } : { kind: 'computed', set: massingOptions },
                );
            } catch (err) {
                console.warn('[gis][envelope-card] massing options fold failed (non-fatal):', err);
                return '';
            }
        })();
        const safeCloseBtn = envelopeCloseButtonHtml();
        const safeEnvToggle = envelopeToggleHtml();
        // §UX1-PROSE-ALTITUDE — the three prose bodies on this card are collapsed behind
        // summary lines that still state the fact. NOTHING is dropped: the upper-bound and
        // zone-extent caveats are C58 §1.4 honesty statements, so their summaries carry the
        // claim ("Footprint = whole parcel — a MAXIMUM extent") and the paragraph explaining
        // why is one click away. The card's HEADLINE numbers, its confidence badge and its
        // source line stay unconditionally visible — those are the answer, not the footnotes.
        const safeUpperBoundBlock = envelopeDisclosureHtml(
            '<b>Footprint = whole parcel</b> — a maximum extent, not a buildable solid. Why?',
            safeUpperBoundCaveat, 'warn',
        );
        const safeZoneExtentBlock = envelopeDisclosureHtml(
            '<b>Footprint = zone extent</b> — an upper bound on where you may build. Why?',
            safeZoneExtentCaveat, 'warn',
        );
        // §GIS-ENVELOPE-FULL-SECTIONS (L-1651, founder 2026-08-21) — the one-fold
        // `'Site data & capacity'` wrapper is GONE. It nested the capacity comparison AND the
        // full-site block (itself another <details>) behind a single disclosure, so on the
        // GIS-hosted card the founder's sections sat two folds deep and did not read as
        // sections at all. The card now carries FOUR first-class, default-collapsed folds:
        // Designed vs permitted · How these were measured · Full site & massing data · Why
        // these numbers? — each summary carrying its fact (§UX1-PROSE-ALTITUDE).
        panel.innerHTML =
            `<div data-envelope-drag="1" title="Drag to move" style="display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:6px 8px;margin-bottom:8px;cursor:grab;">
               <span style="font-weight:600;font-size:var(--pryzm-panel-font-size-title);color:#6600FF;">Buildable envelope</span>${safeBadge}${safeCloseBtn}
             </div>
             ${safeHydratedLine}
             ${safeRows}
             ${safeUpperBoundBlock}
             ${safeZoneExtentBlock}
             <div style="margin-top:8px;display:flex;align-items:center;justify-content:space-between;">
               ${safeSourceLine}
             </div>
             ${buildStagedSectionsHtml(sectionPlan, {
                 'designed-vs-permitted': safeCapacitySection,
                 'how-measured': safeMeasuredSection,
                 'per-level': safePerLevelSection,
                 'intended-area': safeIntendedSection,
                 'site-data': safeSiteDataBlock,
                 'massing-options': safeMassingOptionsSection,
                 'target-area': safeTargetAreaSection,
                 'cost': safeCostSection,
                 'why': safeWhyBlock,
             } satisfies Partial<Record<EnvelopeCardSection, string>>)}
             ${safeDesignStageStrip}
             ${safeEnvToggle}`;
        wireEnvelopeToggle(panel);
        wireEnvelopeClose(panel);
        wireEnvelopeCostSelects(panel);
        wireSiteHighlightRows(panel);
        wireTargetAreaEntry(panel);
        // §RESI-ORCH-ADOPT — the CONFIRM step. Only ever wired when the button was rendered, and
        // it is rendered only when a LIVE proposal exists (`resolveLiveTargetFootprintProposal`).
        wireTargetAreaAdopt(panel);
        // §RESI-ORCH-MASSING-OPTIONS — generate / pick / hide. Full-determination arm only: every
        // option is a fraction of a PERMITTED footprint, and a refusal card has none.
        wireMassingOptions(panel);
        // §RESI-ORCH-STAGE-WIRE — the "do this next" pill jumps to `data-stage-control="massing"`,
        // which is the target-area entry on this arm.
        wireDesignStageStrip(panel);
        // §OLDPROJ168 — the FULL-card arm. Same reasoning as the refusal arm above: whenever the
        // card is showing a HYDRATED (stored, dated) determination rather than a live one, the
        // "Re-check this parcel" route must be live. Guarded on `hydratedAtIso` so a freshly
        // solved card — which has nothing stale to re-check — never renders a live button.
        if (hydratedAtIso) wireStoredDeterminationRefresh(panel, hydratedAtIso);
    };

    /**
     * FORMA.3 — read PRYZM's authored geometry + boundary and render the white
     * massing into Cesium at the real-world site. `frame` flies the camera; the
     * optional `preset` chooses the NW '3D' oblique (default) or the near-top-
     * down 'plan' plan-oblique (FORMA-PLAN-OBLIQUE). Best-effort + public
     * CesiumViewport API only.
     */
    const renderFormaMassing = (frame: boolean, preset: 'oblique' | 'plan' = 'oblique'): void => {
        if (!cesiumViewport?.renderFormaMassing) {
            console.warn('[gis][forma] renderFormaMassing unavailable (Cesium not mounted yet).');
            return;
        }
        const origin = getFormaOrigin();
        if (!origin) {
            console.log('[gis][forma] no site location yet — cannot place massing.');
            runtime?.events?.emit('pryzm:toast', {
                message: 'Set a site location first, then switch to 3D View.',
                severity: 'info',
            });
            return;
        }
        const boundary = getFormaBoundary();
        const walls = getFormaWalls();
        // §A.21.D25 — the building's OTHER elements (floors + roof + coarse
        // furniture) so the globe reads as a real building, not walls-only.
        const slabs = getFormaSlabs();
        const roofs = getFormaRoofs();
        const furniture = getFormaFurniture();
        // §A.21.D34(d) — windows + doors (façade insets) + stairs (coarse
        // stairwell volume) so the building reads COMPLETE, not blank-white.
        const openings = getFormaOpenings();
        const stairs = getFormaStairs();
        if (walls.length === 0 && !boundary) {
            // Nothing authored yet — still render the (empty) Forma scene so the
            // flat warm-grey ground + Forma look is visibly engaged, and the user
            // sees they're in the massing study even with nothing built.
            console.log(
                `[gis][forma] no authored walls and no parcel boundary yet — showing the empty Forma scene ` +
                    `(flat ground, no massing) at origin LAT ${origin.lat} LON ${origin.lon}.`
            );
        } else {
            console.log(
                `[gis][forma] rendering massing: ${walls.length} wall(s), ${slabs.length} slab(s), ` +
                    `${roofs.length} roof(s), ${furniture.length} furniture, ${openings.length} opening(s), ` +
                    `${stairs.length} stair(s), boundary=${boundary ? 'yes' : 'no'}, ` +
                    `origin LAT ${origin.lat} LON ${origin.lon}.`
            );
        }
        // §FORMA-FULL-HEIGHT-EXPLICIT (founder 2026-07-01) — resolve the TRUE building
        // height and pass it so the Cesium massing tiles the shell + façade across the
        // WHOLE tower. ROOT CAUSE of "only the ground level gets façade colours": the
        // office's authored walls arrive at baseElevation 0 (all storeys collapsed), so
        // groupWallsIntoStoreyBands makes ONE 4 m band and the slab-derived height lift
        // never fires → the massing + façade rendered a single ground ring. Derive the
        // height here from the levels (max elevation + a storey height, or level COUNT ×
        // storey height when elevations aren't stamped — the office case) and the slabs'
        // topElevation, and take the max. When the authored bands already reach this
        // height (real multi-storey walls), the Cesium side no-ops (harmless).
        let fullBuildingHeightM = 0;
        try {
            const levels =
                (window.bimManager as { getLevels?: () => Array<{ elevation?: number }> } | undefined)
                    ?.getLevels?.() ?? [];
            let maxLevelElev = 0;
            for (const l of levels) {
                if (typeof l.elevation === 'number' && Number.isFinite(l.elevation) && l.elevation > maxLevelElev) {
                    maxLevelElev = l.elevation;
                }
            }
            let storeyH = 0;
            for (const w of walls) { if (w.height > storeyH) storeyH = w.height; }
            if (!(storeyH > 0.5)) storeyH = 4;
            // Accurate when levels carry elevations; else fall back to COUNT × storey
            // height (a 40-level office → ~40×4 = 160 m even with unstamped elevations).
            const fromLevels = maxLevelElev > 0.5 ? maxLevelElev + storeyH : levels.length * storeyH;
            let fromSlabs = 0;
            for (const s of slabs) { if (s.topElevation > fromSlabs) fromSlabs = s.topElevation; }
            fullBuildingHeightM = Math.max(fromLevels, fromSlabs);
        } catch { /* best-effort — Cesium still resolves height from its own signals */ }

        cesiumViewport.renderFormaMassing({
            originLat: origin.lat,
            originLon: origin.lon,
            boundary,
            walls,
            // §A.21.D25 — floors/roof/furniture alongside the wall massing (all
            // optional on the Cesium side → back-compat for older callers).
            slabs,
            roofs,
            furniture,
            // §A.21.D34(d) — façade window/door insets + coarse stair volumes.
            openings,
            stairs,
            // §FORMA-FULL-HEIGHT-EXPLICIT — the resolved true tower height (see above).
            ...(fullBuildingHeightM > 0 ? { fullBuildingHeightM } : {}),
            // C58 (L-402b) — the buildable-envelope study volume, when computed +
            // toggled ON. Reuses the SAME ENU projection as `boundary` above.
            envelope: resolveFormaEnvelope(),
            frameCentroid: frame,
            framePreset: preset,
        });
        // C58 — refresh the envelope facts card + toggle to match this render.
        refreshEnvelopePanel();
        // §A.21.D24 — rebuild the Floors selector from the storeys just placed.
        refreshFormaFloorSelector();

        // FORMA.6 — overlay the REAL full-fidelity PRYZM model (live BIM scene →
        // glTF) on the Forma study, replacing the abstract massing blocks. The
        // massing above is the SAFE FALLBACK + does the real work this depends on
        // (establishes the terrain clamp + storey-band floor selector). Best-effort,
        // off the critical path (deferred), cache-gated by geometry signature.
        if (formaBuildingFidelity === 'real') {
            // §FEAT-VIEW-ACTIVATION-LOADING-OVERLAY (L-270) — the GLB export + primitive load is
            // part of "everything is loaded": register it with the in-flight activation so the
            // overlay does not lift while the real house is still being serialised.
            trackViewActivationPlacement(placeRealModelOnForma({ lat: origin.lat, lon: origin.lon }));
        }
    };

    // §A.21.D39#5 — place the SAME authored building massing on the PHOTOREAL globe
    // (real imagery + Google 3D tiles + sky), used by the "3D globe" result toggle.
    // Reuses every Forma input reader (walls/slabs/roof/openings/stairs/furniture/
    // boundary) but routes through renderBuildingOnGlobe (keepPhotoreal) so the
    // scene stays photoreal — the user's house sits inside the real-world city.
    // Best-effort + guarded; the camera is framed separately by reframeSiteIn3D.
    const placeBuildingOnGlobe = (): void => {
        if (!cesiumViewport?.renderBuildingOnGlobe) {
            console.warn('[gis][globe] renderBuildingOnGlobe unavailable (Cesium not mounted / old build).');
            return;
        }
        const origin = getFormaOrigin();
        if (!origin) {
            console.log('[gis][globe] no site location yet — cannot place building on the globe.');
            return;
        }
        const boundary = getFormaBoundary();
        const walls = getFormaWalls();
        const slabs = getFormaSlabs();
        const roofs = getFormaRoofs();
        const furniture = getFormaFurniture();
        const openings = getFormaOpenings();
        const stairs = getFormaStairs();
        if (walls.length === 0 && !boundary) {
            console.log('[gis][globe] nothing authored yet — no building to place on the photoreal globe.');
            return;
        }
        console.log(
            `[gis][globe] placing building on the PHOTOREAL globe: ${walls.length} wall(s), ` +
                `${slabs.length} slab(s), ${roofs.length} roof(s), ${openings.length} opening(s), ` +
                `${stairs.length} stair(s) at LAT ${origin.lat} LON ${origin.lon}.`
        );
        try {
            // STEP 1 — render the Forma massing on the photoreal globe. This is the
            // SAFE FALLBACK and ALSO does the real work the real-model path depends
            // on: it establishes the v50 tile clamp (`formaTerrainBaseHeight`) and
            // populates the storey-band floor selector. If the real-model overlay
            // (step 2) fails for any reason, this massing stays as the result.
            cesiumViewport.renderBuildingOnGlobe({
                originLat: origin.lat,
                originLon: origin.lon,
                boundary,
                walls,
                slabs,
                roofs,
                furniture,
                openings,
                stairs,
                // L-445 (SECOND, INDEPENDENT DEFECT) — this payload never carried `envelope`,
                // so the PHOTOREAL GLOBE could not draw the C58 study volume under ANY
                // conditions, even immediately after a commit with the envelope fully solved.
                // `renderBuildingOnGlobe` forwards the whole payload to `renderFormaMassing`,
                // which has always accepted `envelope` — the key was simply never passed.
                // Same reader as the 3D-Site path, so the toggle governs both surfaces.
                envelope: resolveFormaEnvelope(),
                // The camera is framed by reframeSiteIn3D() — don't double-fly here.
                frameCentroid: false,
            });
            refreshFormaFloorSelector();

            // §GLOBE-FIDELITY — when the user has chosen the abstract MASSING study on
            // the globe, STOP here: the massing blocks rendered above ARE the result.
            // Drop any previously-placed real model so the two don't double-render.
            if (globeBuildingFidelity === 'massing') {
                cesiumViewport.clearRealModelOnGlobe?.();
                // §CESIUM-PERF-GLOBE-GLB-CACHE — the real model is gone; the next flip to
                // 'real' must re-place it (don't let the cache short-circuit an empty globe).
                globeRealPlaced = false;
                console.log('[gis][globe] §GLOBE-FIDELITY fidelity="massing" — showing massing blocks on the tiles (no real-model overlay).');
                return;
            }

            // STEP 2 — §A.21.D49: overlay the REAL, FULL-FIDELITY PRYZM model (the
            // live BIM THREE scene serialised to glTF — real walls with their CSG
            // openings, windows, doors, roof, slabs, in the app's real materials) on
            // the tiles, replacing the pastel massing blocks. The detailed model is
            // the renderer-agnostic glTF bridge across the WebGPU(BIM)↔WebGL(Cesium)
            // split. Best-effort + deferred slightly so the async tile clamp has a
            // chance to seat `formaTerrainBaseHeight` before we read it for the model.
            // §FEAT-VIEW-ACTIVATION-LOADING-OVERLAY (L-270) — registered with the in-flight
            // globe activation: the overlay stays up until the real model has actually landed.
            trackViewActivationPlacement(placeRealModelOnGlobe(origin));
        } catch (err) {
            console.warn('[gis][globe] renderBuildingOnGlobe failed (non-fatal):', err);
        }
    };

    // §FIX-GISLAYOUT-PLACE-REAL-MODEL-FORMA-AND-GLOBE-REENTRY (L-193) — the SINGLE routine
    // that (re)establishes the photoreal "3D globe" content. Shared by the result-toggle
    // globe entry (applyResultView('3D')) AND the direct-toggle re-entry branch (Symptom B),
    // so every globe entry seats + frames identically + idempotently.
    //   1. EXIT Forma (setFormaMode(false)) so the real-world imagery shows (§GLOBE-EXIT-FORMA).
    //      This ALSO destroys the Forma study real-model primitive (restorePhotorealMode →
    //      clearRealModelOnForma) — so we INVALIDATE the GISAreaLayout Forma real-model cache
    //      (Symptom A): the next Forma "3D Site" entry must re-export + re-place the real house
    //      instead of reusing a destroyed model (which left the massing prism on screen).
    //   2. Arm the one-shot corrective re-frame that fires once the async tile-height clamp
    //      settles the real Google-tile ground (§FIX-GLOBE-AUTOFRAME-AND-SEAT, L-184).
    //   3. Place the building on the photoreal globe (renderBuildingOnGlobe → real-model
    //      overlay; L-186 liveness cache re-exports when the primitive was cleared, reuses
    //      when still live; L-179 clamp-to-photoreal-tiles preserved inside the viewport).
    //   4. Frame the camera to the placed building now (reframeSiteIn3D).
    const restorePhotorealGlobeContent = (): void => {
        try { cesiumViewport?.setFormaMode?.(false); }
        catch (e) { console.warn('[gis] 3D globe: setFormaMode(false) failed (non-fatal):', e); }
        // Symptom A — entering the photoreal globe destroyed any Forma study real model.
        const invalidated = invalidateFormaRealCacheOnPhotorealGlobeEntry();
        formaRealLastSig = invalidated.lastSig;
        formaRealPlaced = invalidated.placed;
        try { cesiumViewport?.armGlobeReframeOnBaseSettle?.('oblique'); }
        catch (e) { console.warn('[gis] 3D globe: armGlobeReframeOnBaseSettle failed (non-fatal):', e); }
        placeBuildingOnGlobe();
        // §FIX-GLOBE-CLICK-NAVIGATES-OUT (L-318) — reframeSiteIn3D is a DETACHED promise; without a
        // .catch a rejected camera fly / getCesium becomes an unhandled rejection that can eject the
        // user. Contain it (the camera framing is best-effort — the globe stays open regardless).
        void reframeSiteIn3D().catch((err: unknown) => {
            console.error('[gis] §FIX-GLOBE-CLICK-NAVIGATES-OUT reframeSiteIn3D failed — contained (globe stays open):', err);
        });
    };

    // §A.21.D49 — export the live BIM scene to GLB and place it as the REAL detailed
    // model on the photoreal tiles. On success, hide the abstract Forma massing
    // blocks so only the real model shows. Any failure leaves the massing in place
    // (the fallback) — this never throws.
    const placeRealModelOnGlobe = async (origin: { lat: number; lon: number }): Promise<void> => {
        try {
            if (globeBuildingFidelity !== 'real') return; // §GLOBE-FIDELITY — massing study chosen.
            if (!cesiumViewport?.renderRealModelOnGlobe) {
                console.warn('[gis][globe] renderRealModelOnGlobe unavailable (old build) — keeping massing.');
                return;
            }
            // §CESIUM-PERF-GLOBE-GLB-CACHE (2026-07-01) — the 22 MB GLB was re-serialised
            // + re-uploaded on EVERY globe entry (every view switch re-ran this path),
            // even when nothing about the building changed — the single biggest cost of
            // entering the 3D globe. Mirror the Forma path's signature cache: skip the
            // whole export when the geometry signature is unchanged AND a real model is
            // ALREADY placed on the globe. The camera/metric/view-toggle no longer force
            // a re-export; only a real geometry edit (which bumps the signature) does.
            if (globeRealExporting) return;                          // an export is already in flight.
            const sig = computeBuildingSignature();
            // §FIX-GLOBE-REENTRY-MODEL-LOST (L-186) — reuse ONLY when the model is STILL LIVE on
            // the globe. Mirrors CesiumViewport.shouldReuseGlobeRealModel (the tested SSOT). The
            // Forma "3D Site" study path destroys the globe model (clearRealModelOnGlobe), so on
            // a globe→forma→globe round-trip `globeRealPlaced` is stale-true while the primitive
            // is GONE — the old cache short-circuited to an EMPTY globe (house lost). Gating on
            // the live presence check forces a re-place (re-export) when the model was cleared;
            // plain view/camera/metric switches (model still alive) still skip the re-export.
            const modelStillLive = (cesiumViewport.hasRealModelOnGlobe?.() ?? false) as boolean;
            if (sig === globeRealLastSig && globeRealPlaced && globeRealLastSig !== null && modelStillLive) {
                console.log('[gis][globe] §CESIUM-PERF-GLOBE-GLB-CACHE geometry unchanged + model still live — reusing placed real model (no re-export).');
                cesiumViewport.clearFormaMassingEntitiesOnly?.();
                return;
            }
            if (!modelStillLive && globeRealPlaced) {
                // The model was destroyed by a Forma round-trip; the perf flag was stale.
                // Reset it so the re-place path below runs cleanly.
                globeRealPlaced = false;
                console.log('[gis][globe] §FIX-GLOBE-REENTRY-MODEL-LOST real model was cleared (forma round-trip) — re-placing on globe re-entry.');
            }
            const scene = props.world?.scene?.three;
            if (!scene) {
                console.warn('[gis][globe] no BIM scene to serialise — keeping massing.');
                return;
            }
            globeRealExporting = true;
            const { exportFragmentsToGLB } = await import('@pryzm/file-format');
            // §FIX-GLOBE-REAL-GLAZING (L-1422) — C12 §11.4 recorded the globe/site export
            // asymmetry as an OPEN founder decision: the 3D Site study exports
            // `{ formaWhite: true }` (windows → translucent glass) while the globe exported
            // with no option at all, so windows kept whatever raw BIM material they carried
            // and read as opaque rectangles. The founder made the decision (2026-08-19,
            // "not rendering realistically"): glazing MUST read as glass on the globe too.
            // ⚠ NOT `formaWhite: true` — that would ALSO repaint every wall/slab near-white,
            // i.e. hand the photoreal globe the Forma STUDY look. That is strictly LESS
            // realistic and the exact opposite of what was asked. `glazingOverride` applies
            // the glass half ONLY; opaque elements keep their real BIM materials.
            // §GLB-EXPORT-STRIP-ANNOTATION-OVERLAYS (L-1421) — and edge/outline wireframes are
            // drafting annotation, not architecture; they do not belong over photoreal tiles.
            const glbUrl = await exportFragmentsToGLB(scene as any, {
                glazingOverride: true,
                stripAnnotationOverlays: true,
            });
            if (!glbUrl) {
                console.warn('[gis][globe] GLB export returned no url — keeping massing.');
                return;
            }
            const placed = await cesiumViewport.renderRealModelOnGlobe({
                glbUrl,
                originLat: origin.lat,
                originLon: origin.lon,
            });
            if (placed) {
                // Real model is on the tiles — hide the abstract massing blocks so the
                // two don't double-render (keep storey-band metadata + selector).
                cesiumViewport.clearFormaMassingEntitiesOnly?.();
                // §CESIUM-PERF-GLOBE-GLB-CACHE — remember the signature so a re-entry with
                // unchanged geometry short-circuits above (no re-export).
                globeRealLastSig = sig;
                globeRealPlaced = true;
                noteLayoutOwner(); // §L-676-B
                console.log('[gis][globe] §A.21.D49 REAL detailed model placed on tiles — massing blocks hidden.');
            } else {
                // Declined (fidelity flipped mid-export / load failed) — revoke the unused
                // blob so it doesn't leak, keep the massing fallback, clear the cache flag.
                try { URL.revokeObjectURL(glbUrl); } catch { /* not a blob */ }
                globeRealPlaced = false;
                console.log('[gis][globe] §A.21.D49 real-model placement declined — massing fallback kept.');
            }
        } catch (err) {
            console.warn('[gis][globe] §A.21.D49 real-model overlay failed (keeping massing fallback):', err);
        } finally {
            globeRealExporting = false;
        }
    };

    // §GLOBE-FIDELITY (founder) — flip the photoreal "3D globe" between the REAL
    // authored building (the full PRYZM model overlaid on the tiles) and the abstract
    // MASSING study (white/pastel volumes on the tiles). Mirrors the Forma view's
    // setFormaBuildingFidelity: switching to 'massing' drops the real-model primitive
    // and re-renders the massing blocks; switching to 'real' re-places the model. The
    // re-render is in place — the camera never re-flies. No-op unless the 3D globe is
    // the active result view.
    const setGlobeBuildingFidelity = (fidelity: 'massing' | 'real'): void => {
        if (fidelity !== 'massing' && fidelity !== 'real') {
            console.warn(`[gis][globe] setGlobeBuildingFidelity: bad value ${String(fidelity)} — ignored.`);
            return;
        }
        if (globeBuildingFidelity === fidelity) return;
        globeBuildingFidelity = fidelity;
        refreshGlobeFidelityButtons();
        console.log(`[gis][globe] §GLOBE-FIDELITY building fidelity → ${fidelity}.`);
        if (fidelity === 'massing') {
            // Drop the real model so only the (about-to-be-re-rendered) massing shows.
            cesiumViewport?.clearRealModelOnGlobe?.();
            // §CESIUM-PERF-GLOBE-GLB-CACHE — model dropped; a later flip to 'real' must
            // re-place it, so clear the "already placed" flag (keep the signature so an
            // UNCHANGED building still recognises the geometry and re-exports at most once).
            globeRealPlaced = false;
        }
        // Re-run the globe placement in place (no re-fly): renders the massing, then
        // — when fidelity is 'real' — overlays the real model + hides the blocks.
        // Only meaningful while the 3D globe is the active result view.
        if (resultViewMode === '3D') placeBuildingOnGlobe();
    };
    window.pryzmSetGlobeBuildingFidelity = setGlobeBuildingFidelity;

    // ════════════════════════════════════════════════════════════════════════
    // FORMA.6 — REAL full-fidelity building on the FORMA flat-ground study view
    // ════════════════════════════════════════════════════════════════════════
    //
    // The founder asked for "in Forma view the same as the 3D globe tiles view —
    // the building/elements coming from the PRYZM WebGPU scene", with FULL element
    // fidelity. We reuse the SAME glTF bridge the globe path uses: serialise the
    // live BIM THREE scene to GLB (`exportFragmentsToGLB`, @pryzm/file-format —
    // owns the THREE access, so apps/editor never imports THREE → P2-safe) and hand
    // the blob URL to `CesiumViewport.renderRealModelOnForma`, which places it as a
    // native Cesium.Model at the SAME ENU origin + terrain clamp the massing uses.
    //
    // Default fidelity is 'real' (the founder's ask). The abstract massing remains
    // reachable via setFormaBuildingFidelity('massing') (+ the console command).

    // Default 'real' per the founder; the toggle / console command flips it.
    let formaBuildingFidelity: 'massing' | 'real' = 'real';
    // Repaints the [Real][Massing] toggle buttons; assigned when the bar mounts,
    // no-op before then (e.g. a console-driven fidelity flip with no toggle bar).
    let refreshFormaFidelityButtons: () => void = () => { /* bar not mounted yet */ };

    // PERF (task #4) — cache the exported GLB keyed by a cheap geometry signature so
    // an unchanged building isn't re-serialised on every live-update re-place. The
    // signature folds element counts + a coarse hash of wall endpoints/openings; any
    // edit (move/add/remove) changes it. The blob URL is owned by the viewport once
    // placed (it revokes on replace/dispose), so we only cache the SIGNATURE here to
    // decide whether a re-export is needed — we do NOT hold a stale blob.
    let formaRealLastSig: string | null = null;
    let formaRealExporting = false;
    // True once a real model is actually placed on the Forma study (so the cache can
    // skip re-export only when something IS on screen). Reset on fidelity→massing.
    let formaRealPlaced = false;

    // §FIX-IFC-IN-CESIUM (L-696) — an IMPORTED IFC is authored building geometry
    // too, but it lives ONLY in the THREE scene (IfcGeometryRenderer adds a group
    // with `userData.source === 'ifc-import'`); it is never registered in the
    // wall/slab/roof/stair stores that every getForma* reader queries. Without
    // this reader an IFC-only project reports "no authored building", so the REAL
    // GLB is never exported and the model is invisible on 3D Site and 3D Globe —
    // the founder's reported symptom. Counting meshes (not groups) also gives the
    // signature something that changes when a second model is imported.
    const countIfcSceneMeshes = (): number => {
        try {
            const scene = props.world?.scene?.three as { children?: unknown[] } | undefined;
            if (!scene?.children) return 0;
            let meshes = 0;
            for (const obj of scene.children as Array<{
                userData?: { source?: string };
                traverse?: (cb: (o: { type?: string }) => void) => void;
            }>) {
                if (obj?.userData?.source !== 'ifc-import') continue;
                obj.traverse?.((child) => {
                    if ((child as { isMesh?: boolean }).isMesh) meshes++;
                });
            }
            return meshes;
        } catch {
            return 0;
        }
    };

    // §CW90 item 7 — the curtain-wall reader the signature (and the
    // authored-building gate) was missing. Same read-only idiom as
    // getFormaWalls; tolerant of an absent store → [].
    const getFormaCurtainWalls = (): Array<{
        a: { x: number; z: number }; b: { x: number; z: number }; height: number;
    }> => {
        const cwStore = storeRegistry.getStoreForType('curtainwall') as unknown as
            | { getAll?: () => Array<{
                  baseLine?: Array<{ x: number; z: number }>;
                  height?: number;
              }> }
            | undefined;
        const all = cwStore?.getAll?.() ?? [];
        const out: Array<{ a: { x: number; z: number }; b: { x: number; z: number }; height: number }> = [];
        for (const cw of all) {
            const a = cw?.baseLine?.[0];
            const b = cw?.baseLine?.[cw.baseLine.length - 1];
            if (!a || !b) continue;
            out.push({ a: { x: a.x, z: a.z }, b: { x: b.x, z: b.z }, height: cw.height ?? 3 });
        }
        return out;
    };

    const computeBuildingSignature = (): string => {
        try {
            return `${countIfcSceneMeshes()}|` + buildingGeometrySignature({
                walls: getFormaWalls(),
                curtainWalls: getFormaCurtainWalls(),
                openings: getFormaOpenings(),
                slabCount: getFormaSlabs().length,
                roofCount: getFormaRoofs().length,
                stairCount: getFormaStairs().length,
                furnitureCount: getFormaFurniture().length,
            });
        } catch {
            // Any reader failure → a unique signature so we always re-export (safe).
            return `err-${Date.now()}`;
        }
    };

    // FORMA.6 — export the live BIM scene to GLB and place it as the REAL detailed
    // model on the FORMA flat-ground study. On success the viewport hides the
    // abstract massing blocks so only the real model shows. Any failure leaves the
    // massing in place (the fallback) — this never throws. Off the critical path
    // (the massing is already rendered when this runs) + skips the re-export when
    // the geometry signature is unchanged (task #4 perf).
    const placeRealModelOnForma = async (origin: { lat: number; lon: number }): Promise<void> => {
        try {
            // §FIX-EMPTY-REALMODEL-HIDES-ENVELOPE (L-423, founder live-traced) — when NOTHING
            // is authored yet (a committed parcel + buildable envelope, but no generated/drawn
            // building), do NOT export + place a real model. `renderRealModelOnForma` HIDES the
            // massing study (`clearFormaMassingEntitiesOnly`), and the buildable-envelope prism
            // lives among those massing entities — so an EMPTY real-model swap (0 walls → a
            // 180-byte GLB with 0 roots) blanks the 3D Site: the envelope draws (`present=y`)
            // then instantly vanishes. Keep the massing + envelope study on screen until a real
            // building actually exists; the swap resumes automatically once walls/slabs/roofs/
            // stairs are authored (this reader path is the SAME one the massing render uses).
            // §FIX-IFC-IN-CESIUM (L-696) — an imported IFC counts as an authored
            // building even when no NATIVE element exists (see countIfcSceneMeshes).
            const hasAuthoredBuilding =
                getFormaWalls().length > 0 ||
                // §CW90 item 7 — a curtain-wall-only building IS an authored
                // building; without this term it reported "no authored building"
                // and real-model placement was skipped entirely.
                getFormaCurtainWalls().length > 0 ||
                getFormaSlabs().length > 0 ||
                getFormaRoofs().length > 0 ||
                getFormaStairs().length > 0 ||
                countIfcSceneMeshes() > 0;
            if (!hasAuthoredBuilding) {
                console.log(
                    '[gis][forma6] no authored building yet — keeping the massing + buildable-envelope ' +
                        'study visible (skipping empty real-model placement that would hide the envelope).',
                );
                return;
            }
            const sig = computeBuildingSignature();
            // §FIX-GISLAYOUT-PLACE-REAL-MODEL-FORMA-AND-GLOBE-REENTRY (L-193, Symptom A) — the
            // reuse-vs-re-export decision. The cache flags (formaRealPlaced / formaRealLastSig)
            // are INVALIDATED when the photoreal globe destroys the Forma real-model primitive
            // (restorePhotorealGlobeContent → invalidateFormaRealCacheOnPhotorealGlobeEntry), so
            // after a globe→forma round-trip this returns 'export-and-place' (re-places the real
            // house) instead of a stale 'reuse-placed' (which left the massing prism on screen).
            const action = decideFormaRealPlacement({
                fidelity: formaBuildingFidelity,
                hasViewportApi: typeof cesiumViewport?.renderRealModelOnForma === 'function',
                exporting: formaRealExporting,
                currentSig: sig,
                cache: { lastSig: formaRealLastSig, placed: formaRealPlaced },
            });
            if (action === 'skip-massing-fidelity') return;           // massing study chosen.
            if (action === 'skip-no-viewport-api') {
                console.warn('[gis][forma6] renderRealModelOnForma unavailable (old build) — keeping massing.');
                return;
            }
            if (action === 'skip-export-in-flight') return;           // an export is already in flight.
            if (action === 'reuse-placed') {
                // Geometry unchanged AND the model is still placed — reuse it, no re-export.
                console.log('[gis][forma6] geometry unchanged — reusing placed real model (no re-export).');
                return;
            }
            // action === 'export-and-place'
            const scene = props.world?.scene?.three;
            if (!scene) {
                console.warn('[gis][forma6] no BIM scene to serialise — keeping massing.');
                return;
            }
            formaRealExporting = true;
            const { exportFragmentsToGLB } = await import('@pryzm/file-format');
            // §FORMA-WHITE-MATERIAL (ADR-0093) — on the Forma 3D-site STUDY view the
            // building reads as a clean WHITE architectural model (Spacio/Forma
            // reference): every element near-white, windows translucent glass. This
            // is Forma-VIEW-ONLY — the editor's WebGPU BIM view keeps real materials,
            // and the normal GLB download/export path (no option) is unchanged.
            // §GLB-EXPORT-STRIP-ANNOTATION-OVERLAYS (L-1421) — the white study is a clean
            // massing read; edge-outline wireframes baked into the GLB are drafting
            // annotation and were the whole population behind the L-1206 unsupported-material
            // census. Stripped here too, so both Cesium REAL paths agree.
            const glbUrl = await exportFragmentsToGLB(scene as any, {
                formaWhite: true,
                stripAnnotationOverlays: true,
            });
            if (!glbUrl) {
                console.warn('[gis][forma6] GLB export returned no url — keeping massing.');
                return;
            }
            const placed = await cesiumViewport.renderRealModelOnForma({
                glbUrl,
                originLat: origin.lat,
                originLon: origin.lon,
            });
            if (placed) {
                formaRealLastSig = sig;
                formaRealPlaced = true;
                noteLayoutOwner(); // §L-676-B
                console.log('[gis][forma6] REAL full-fidelity model placed on the Forma study — massing blocks hidden.');
            } else {
                // Declined (fidelity flipped mid-export, or load failed) — revoke the
                // blob we won't use so it doesn't leak, keep the massing fallback.
                try { URL.revokeObjectURL(glbUrl); } catch { /* not a blob */ }
                formaRealPlaced = false;
                console.log('[gis][forma6] real-model placement declined — massing fallback kept.');
            }
        } catch (err) {
            console.warn('[gis][forma6] real-model overlay failed (keeping massing fallback):', err);
        } finally {
            formaRealExporting = false;
        }
    };

    /**
     * §A.21.D24 — (re)populate the Floors <select> from the REAL storeys of the
     * placed massing. Shows "All floors" + one entry per storey (Ground, 1st, 2nd
     * …). Hidden when there's 0/1 storey (nothing to choose). Preserves the
     * current selection where possible. Safe before the selector is mounted.
     */
    const refreshFormaFloorSelector = (): void => {
        const sel = formaFloorSelect;
        if (!sel) return;
        const bands = cesiumViewport?.getFormaStoreyBands?.() ?? [];
        if (bands.length < 2) {
            sel.style.display = 'none';
            sel.innerHTML = '';
            return;
        }
        const prev = sel.value;
        const floorLabel = (i: number): string =>
            i === 0 ? '0 · Ground' : `${i} · ${i === 1 ? '1st' : i === 2 ? '2nd' : i === 3 ? '3rd' : `${i}th`} floor`;
        // §XSS-SINK-SCAN (C08 §3.1) — `safe*` = escaped-before-assignment: `b.index` is an
        // internally-computed storey index and `floorLabel` a pure formatter, but both are
        // escaped at build time anyway — consistency over cleverness.
        const safeOpts: string[] = ['<option value="all">▤ All floors</option>'];
        for (const b of bands) safeOpts.push(`<option value="${escHtml(String(b.index))}">${escHtml(floorLabel(b.index))}</option>`);
        sel.innerHTML = safeOpts.join('');
        // Restore prior choice if it still exists, else default to "all".
        sel.value = Array.from(sel.options).some((o) => o.value === prev) ? prev : 'all';
        sel.style.display = 'inline-block';
        console.log(`[gis][forma] floor selector rebuilt: ${bands.length} storeys.`);
    };

    // ── The floating [ 2D Map ][ Plan ][ 3D ] toggle (top-right; white + #6600FF) ──
    // FORMA-PLAN-OBLIQUE — a clean 3-way group. All three modes stay reachable:
    //   • 'map2d' — the MapLibre cream draw map (drop Cesium) for drawing/editing
    //               the boundary (the OLD "Plan View" behaviour, renamed "2D Map").
    //   • 'plan'  — Cesium plan-oblique (near-top-down, pitch −68°, heading N) —
    //               the Autodesk-Forma signature "plan" look (shadowed massing).
    //   • '3d'    — Cesium NW oblique (pitch −45°, heading 325°) — depth view.
    // 'plan' + '3d' are BOTH the Cesium-Forma canvas at different pitches; only
    // the camera angle differs (same setFormaMode + context + massing + shadows).
    type FormaViewMode = 'map2d' | 'plan' | '3d';
    let formaToggle: HTMLElement | null = null;
    let formaViewMode: FormaViewMode = 'map2d';
    let formaMap2dBtn: HTMLButtonElement | null = null;
    let formaPlanBtn: HTMLButtonElement | null = null;
    let formaThreeBtn: HTMLButtonElement | null = null;
    // §A.21.D24 — the multi-floor "Floors" selector (built lazily; hidden until
    // the placed massing has ≥2 storeys).
    let formaFloorSelect: HTMLSelectElement | null = null;

    // ── FORMA.5 — site-analysis chrome (sun scrubber + climate card + wind rose).
    // Mounted only while the 3D Forma view is active; disposed on view exit so
    // the controls never linger in the 2D plan view (SPEC §6 cleanup rule).
    let formaAnalysis: import('../geospatial/FormaSiteAnalysisControls').FormaSiteAnalysisControls | null = null;

    const mountFormaAnalysis = (): void => {
        if (!cesiumViewport?.setFormaSunTime) return; // Cesium not mounted / no FORMA.5 API.
        const viewportEl = document.getElementById('container');
        if (!viewportEl) return;
        // A.10.f — populate the ClimateStore for the site's lat/lon so the
        // FORMA.5 climate card + ClimatePanel show REAL data (offline bundled
        // normals by default; the controls re-render via their climateStore
        // subscription once this resolves). Fire-and-forget; never blocks.
        import('../climate/ensureSiteClimate')
            .then(({ ensureSiteClimate }) => ensureSiteClimate(runtime ?? null))
            .catch((e) => console.warn('[gis][forma] ensureSiteClimate failed:', e));
        import('../geospatial/FormaSiteAnalysisControls')
            .then(({ FormaSiteAnalysisControls }) => {
                // Re-check: the user may have flipped to the 2D map before this resolved.
                // The analysis chrome belongs to BOTH Cesium-Forma modes (plan + 3d).
                if (formaViewMode === 'map2d' || !cesiumViewport?.setFormaSunTime) return;
                formaAnalysis?.dispose();
                formaAnalysis = new FormaSiteAnalysisControls(cesiumViewport, runtime ?? null, viewportEl);
                formaAnalysis.mount();
            })
            .catch((e) => console.warn('[gis][forma] analysis controls load failed:', e));
    };
    const disposeFormaAnalysis = (): void => {
        try { formaAnalysis?.dispose(); } catch (e) { console.warn('[gis][forma] analysis dispose failed:', e); }
        formaAnalysis = null;
    };

    const styleFormaBtn = (el: HTMLButtonElement | null, active: boolean): void => {
        if (!el) return;
        el.style.background = active ? '#6600FF' : 'transparent';
        el.style.color = active ? '#ffffff' : '#6600FF';
    };
    const refreshFormaButtons = (): void => {
        styleFormaBtn(formaMap2dBtn, formaViewMode === 'map2d');
        styleFormaBtn(formaPlanBtn, formaViewMode === 'plan');
        styleFormaBtn(formaThreeBtn, formaViewMode === '3d');
    };

    // Await the Cesium viewer's real mount/ready signal (CesiumViewport.whenReady())
    // instead of guessing with a fixed setTimeout. toggleGIS(true) constructs the
    // viewport asynchronously, so `cesiumViewport` may still be null for a tick — we
    // poll briefly for the instance to exist, then await its ready promise. Falls
    // back to a longer timeout only if no ready signal is reachable. This fixes the
    // "Cesium not mounted yet → setFormaMode/renderFormaMassing no-op" race.
    const awaitCesiumReady = async (): Promise<void> => {
        // Wait for the CesiumViewport instance to be constructed (toggleGIS kicks
        // off the async mount; the closure var is assigned synchronously inside it
        // but the import()/mount() is async). Poll up to ~6s.
        const tStart = Date.now();
        while (!cesiumViewport && Date.now() - tStart < 6000) {
            await new Promise((r) => setTimeout(r, 50));
        }
        if (!cesiumViewport) {
            console.warn('[gis][forma] awaitCesiumReady: CesiumViewport never constructed (6s) — proceeding best-effort.');
            return;
        }
        if (typeof cesiumViewport.whenReady === 'function') {
            try {
                await cesiumViewport.whenReady();
                console.log('[gis][forma] Cesium viewer ready (awaited whenReady, no fixed timer).');
                return;
            } catch (err) {
                console.warn('[gis][forma] whenReady rejected — falling back to timeout:', err);
            }
        }
        // Fallback: no ready signal reachable → wait a generous beat.
        console.warn('[gis][forma] no whenReady() on CesiumViewport — falling back to 800ms timeout.');
        await new Promise((r) => setTimeout(r, 800));
    };

    // FORMA-PLAN-OBLIQUE — engage the Cesium-Forma canvas at the requested camera
    // preset. Shared by BOTH Cesium modes ('plan' = near-top-down plan-oblique,
    // '3d' = NW oblique): the ONLY difference is the fly preset passed to
    // renderFormaMassing. Cesium mounts async on first use, so we await its real
    // ready signal (whenReady) before forcing Forma + placing massing (no race).
    const engageFormaCesium = (preset: 'oblique' | 'plan'): void => {
        const targetMode: FormaViewMode = preset === 'plan' ? 'plan' : '3d';
        console.log(`[gis][forma] activating ${targetMode === 'plan' ? 'Plan (plan-oblique)' : '3D (NW oblique)'} → forcing Forma massing mode.`);
        // §FEAT-VIEW-ACTIVATION-LOADING-OVERLAY (L-270) — the SHARED overlay goes up NOW
        // (synchronously, before the async mount), and the scene input stays gated until the
        // massing + real model are placed AND the terrain clamp has settled.
        const activation = startViewActivationLoading('site', () => engageFormaCesium(preset));
        // §FIX-GISLAYOUT-…-GLOBE-REENTRY (L-193, Symptom B) — entering the Forma "3D Site"
        // study self-places via renderFormaMassing (after awaitCesiumReady); suppress the
        // synchronous re-activation-branch globe placement so it never fights Forma mode.
        gisReactivationSelfPlaceSuppressed = true;
        try {
            toggleGIS(true);
        } catch (err) {
            // §FIX-GLOBE-CLICK-NAVIGATES-OUT (L-318) — contain a synchronous toggleGIS throw so a
            // "3D Site" activation failure stays IN-editor with retry, never escaping to the crash
            // guard's blind spot → router navigate-out / reload.
            console.error('[gis][forma] §FIX-GLOBE-CLICK-NAVIGATES-OUT Forma toggleGIS threw — contained (in-editor retry):', err);
            activation.fail(`The 3D Site view failed to open: ${String((err as Error)?.message ?? err)}`);
        } finally {
            gisReactivationSelfPlaceSuppressed = false;
        }
        // Force Forma look NOW (idempotent) so even an already-mounted viewer
        // (with a Cesium token → otherwise photoreal) flips to the massing study.
        window.pryzmSetCesiumFormaMode?.(true);
        void awaitCesiumReady().then(() => {
            // Re-check: the user may have flipped to another mode while we waited.
            if (formaViewMode !== targetMode) {
                console.log('[gis][forma] Cesium activation aborted — user switched mode while Cesium mounted.');
                activation.cancel('user switched mode while Cesium mounted');
                return;
            }
            // FORCE Forma mode even when a Cesium token IS present: these buttons
            // mean "Forma massing study", never photoreal. (Idempotent.)
            cesiumViewport?.setFormaMode?.(true);
            window.pryzmSetCesiumFormaMode?.(true);
            console.log('[gis][forma] Forma mode engaged on the live viewer.');
            renderFormaMassing(true, preset);
            // FORMA.5 — bring up the sun/shadow/climate/wind analysis chrome.
            mountFormaAnalysis();
            // L-270 — the placement is issued and the terrain clamp is armed; the overlay may
            // now await the ground-settle signal (and any real-model export it registered).
            activation.contentIssued();
        }).catch((err: unknown) => {
            console.error('[gis][forma] Cesium activation failed:', err);
            activation.fail(`The 3D Site view failed to open: ${String((err as Error)?.message ?? err)}`);
        });
    };

    /**
     * FORMA-PLAN-OBLIQUE — switch between the three Forma view modes. Layers
     * persist — the drawn boundary + authored massing stay placed; only
     * visibility + camera change.
     *   • 'map2d' — drop Cesium, reveal the MapLibre cream draw map (boundary
     *               drawing/editing). The old "Plan View" exit behaviour.
     *   • 'plan'  — Cesium plan-oblique (near-top-down, shadows = depth cue).
     *   • '3d'    — Cesium NW oblique (the depth view).
     */
    const applyFormaView = (mode: FormaViewMode): void => {
        formaViewMode = mode;
        if (mode === '3d') {
            engageFormaCesium('oblique');
        } else if (mode === 'plan') {
            engageFormaCesium('plan');
        } else {
            // 2D Map — drop the Cesium globe, reveal the 2D cream map. If the
            // committed cream map is still alive it stays; otherwise (re)open it.
            console.log('[gis][forma] switching to 2D Map (MapLibre cream draw map).');
            disposeFormaAnalysis(); // FORMA.5 — clean up analysis chrome on exit.
            if (_gisActive) toggleGIS(false);
            if (!map2dHandle) startBoundaryDraw();
        }
        refreshFormaButtons();
    };

    const mountFormaViewToggle = (initial: FormaViewMode = 'plan'): void => {
        const viewport = document.getElementById('container');
        if (!viewport) {
            console.error('[gis][forma] mountFormaViewToggle: #container not found');
            return;
        }
        if (viewport.style.position !== 'absolute' && viewport.style.position !== 'relative') {
            viewport.style.position = 'relative';
        }
        if (formaToggle?.parentElement) formaToggle.parentElement.removeChild(formaToggle);
        // §FIX-VIEWMODE-BAR-CONSOLIDATE (L-166) — the Forma view is NO LONGER a rival
        // bar that hides/replaces the segmented switch. Guarantee the ONE top-level
        // switch (◧ 3D + plan · ◉ 3D globe · ◉ 3D Site) is present + light up the
        // "3D Site" segment, then mount THIS bar as a SECONDARY contextual sub-bar
        // BELOW it. So the user always sees which of the three views is active AND can
        // swap freely from the switch above — no "‹ Views" dead-end, no covering.
        // (Supersedes §FORMA-TOGGLE-EXCLUSIVE, which hid the switch + added a back
        // button that vanished the whole panel when the switch had never been mounted
        // — the launcher path; that was the L-166 "clicking Views hides the panel" bug.)
        ensureResultToggle();
        activeSegment = 'forma';
        refreshResultButtons();

        const bar = document.createElement('div');
        bar.className = 'pryzm-forma-view-toggle';
        bar.setAttribute('data-testid', 'forma-view-toggle');
        Object.assign(bar.style, {
            // §A.10.h (founder) — CENTRED over the 3D view + width-adaptive (left:50%
            // + translateX(-50%)). §FIX-VIEWMODE-BAR-CONSOLIDATE — sits at top:108px, a
            // row BELOW the always-visible segmented switch (top:64px), as its secondary
            // contextual actions (no overlap, C06 §7 no-overlap intent). zIndex 31 keeps
            // it above the Cesium canvas, matching the switch's own stacking.
            position: 'absolute', top: '108px', left: '50%', transform: 'translateX(-50%)',
            zIndex: '31', display: 'flex', gap: '4px', padding: '4px',
            background: '#ffffff', borderRadius: '10px',
            boxShadow: '0 4px 18px rgba(20,10,60,0.18)', border: '1px solid #ece7fb',
            font: '600 12px/1 system-ui, sans-serif',
            whiteSpace: 'nowrap',
        } satisfies Partial<CSSStyleDeclaration>);

        const mkBtn = (mode: FormaViewMode, label: string, title: string): HTMLButtonElement => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'pryzm-forma-view-btn';
            b.setAttribute('data-forma-mode', mode);
            b.textContent = label;
            b.title = title;
            Object.assign(b.style, {
                appearance: 'none', border: 'none', cursor: 'pointer',
                padding: '7px 14px', borderRadius: '7px', color: '#6600FF',
                background: 'transparent', font: 'inherit',
            } satisfies Partial<CSSStyleDeclaration>);
            b.addEventListener('mouseenter', () => { if (formaViewMode !== mode) b.style.background = '#f4f0ff'; });
            b.addEventListener('mouseleave', () => { if (formaViewMode !== mode) b.style.background = 'transparent'; });
            b.addEventListener('click', () => applyFormaView(mode));
            return b;
        };
        // §GIS-ACTION-REGISTRY (L-1187, C06 §13) — REMOVED: the "3D Site" context caption.
        //
        // §FIX-VIEWMODE-BAR-CONSOLIDATE (L-166) added a muted, non-interactive <span>
        // reading "3D Site" at the head of this bar, so the sub-bar would read as the
        // 3D-Site view's own contextual actions. Reasonable intent, but the segmented
        // switch directly above ALSO carries a control spelled "3D Site" — so the founder
        // saw the same words twice, one row apart, one of them a button and one of them a
        // caption, and reported "3D Site appears TWICE. Are they one action or two?".
        //
        // Neither: one is an action, the other is not a control at all. That is worse than
        // a duplicate, because there is no click that reveals the difference. The caption
        // is deleted rather than renamed — the active segment on the switch above already
        // shows which view you are in, so it was restating a fact that was on screen.
        //
        // C06 §13.7 verdict (a): a surviving control (the "3D Site" segment, now spelled
        // "PRYZM Earth" in the declared registry) already carries this meaning.

        // FORMA-PLAN-OBLIQUE — 3-way group: [ 2D Map ] [ Plan ] [ 3D ]. "2D Map"
        // is the MapLibre exit (boundary drawing); "Plan" + "3D" are the Cesium-
        // Forma canvas at different pitches (plan-oblique vs NW oblique).
        formaMap2dBtn = mkBtn('map2d', '▦ 2D Map', 'Drop to the 2D draw map (MapLibre) to draw or edit the boundary');
        formaPlanBtn = mkBtn('plan', '◳ Plan', 'Forma plan-oblique — near-top-down shadowed massing (the Forma signature look)');
        formaThreeBtn = mkBtn('3d', '◉ 3D', 'Forma 3D — NW oblique massing study (depth view)');
        bar.appendChild(formaMap2dBtn);
        bar.appendChild(formaPlanBtn);
        bar.appendChild(formaThreeBtn);

        // "Zoom to Site" / reset affordance — repeats the flyTo for the active
        // Cesium preset (plan-oblique while in Plan, NW oblique while in 3D).
        const zoomBtn = document.createElement('button');
        zoomBtn.type = 'button';
        zoomBtn.className = 'pryzm-forma-zoom-btn';
        zoomBtn.setAttribute('data-testid', 'forma-zoom-to-site');
        zoomBtn.title = 'Zoom to site (re-frames the active Forma preset)';
        zoomBtn.textContent = '⤢ Zoom to Site';
        Object.assign(zoomBtn.style, {
            appearance: 'none', border: 'none', cursor: 'pointer',
            padding: '7px 12px', borderRadius: '7px', color: '#6600FF',
            background: 'transparent', font: 'inherit', borderLeft: '1px solid #ece7fb',
        } satisfies Partial<CSSStyleDeclaration>);
        zoomBtn.addEventListener('mouseenter', () => { zoomBtn.style.background = '#f4f0ff'; });
        zoomBtn.addEventListener('mouseleave', () => { zoomBtn.style.background = 'transparent'; });
        zoomBtn.addEventListener('click', () => {
            if (formaViewMode === 'plan') cesiumViewport?.flyToFormaPlan?.();
            else cesiumViewport?.flyToFormaSite?.();
        });
        bar.appendChild(zoomBtn);

        // SITE-PANEL-UI — toggle the FORMA.5 site-analysis panel (sun/shadow ·
        // weather · wind rose · 3D overlays) open/closed. The panel is mounted by
        // mountFormaAnalysis() on Forma Plan/3D entry; this button + the panel's own
        // ✕ are the user show/hide controls. State persists across view re-mounts via
        // FormaSiteAnalysisControls._userHidden.
        const analysisBtn = document.createElement('button');
        analysisBtn.type = 'button';
        analysisBtn.className = 'pryzm-forma-analysis-toggle';
        analysisBtn.setAttribute('data-testid', 'forma-analysis-toggle');
        analysisBtn.title = 'Show / hide the site-analysis panel (sun · weather · wind)';
        analysisBtn.textContent = '☀ Analysis';
        Object.assign(analysisBtn.style, {
            appearance: 'none', border: 'none', cursor: 'pointer',
            padding: '7px 12px', borderRadius: '7px', color: '#6600FF',
            background: 'transparent', font: 'inherit', borderLeft: '1px solid #ece7fb',
        } satisfies Partial<CSSStyleDeclaration>);
        const paintAnalysisBtn = (): void => {
            const on = !!formaAnalysis?.isVisible();
            analysisBtn.style.background = on ? '#6600FF' : 'transparent';
            analysisBtn.style.color = on ? '#ffffff' : '#6600FF';
        };
        analysisBtn.addEventListener('mouseenter', () => { if (!formaAnalysis?.isVisible()) analysisBtn.style.background = '#f4f0ff'; });
        analysisBtn.addEventListener('mouseleave', () => { paintAnalysisBtn(); });
        analysisBtn.addEventListener('click', () => {
            // The panel only exists in Forma Plan/3D. If it isn't mounted (e.g. on
            // 2D Map), bring up the Forma view first, which mounts it.
            if (!formaAnalysis) { applyFormaView('plan'); }
            else { formaAnalysis.toggle(); }
            paintAnalysisBtn();
        });
        bar.appendChild(analysisBtn);

        // FORMA.6 — building-fidelity toggle: [ ◉ Real ] [ ▢ Massing ]. "Real" (the
        // default, founder's ask) places the live PRYZM model (full elements:
        // windows/doors/roof/furniture/stairs) via the glTF bridge; "Massing" shows
        // the abstract pastel volume study. Flipping it re-renders in place (no
        // re-fly). Repainted by refreshFormaFidelityButton() when state changes.
        const mkFidelityBtn = (
            fidelity: 'real' | 'massing',
            label: string,
            title: string,
            leftBorder: boolean,
        ): HTMLButtonElement => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'pryzm-forma-fidelity-btn';
            b.setAttribute('data-forma-fidelity', fidelity);
            b.setAttribute('data-testid', `forma-fidelity-${fidelity}`);
            b.textContent = label;
            b.title = title;
            Object.assign(b.style, {
                appearance: 'none', border: 'none', cursor: 'pointer',
                padding: '7px 12px', borderRadius: '7px', color: '#6600FF',
                background: 'transparent', font: 'inherit',
                borderLeft: leftBorder ? '1px solid #ece7fb' : 'none',
            } satisfies Partial<CSSStyleDeclaration>);
            b.addEventListener('mouseenter', () => { if (formaBuildingFidelity !== fidelity) b.style.background = '#f4f0ff'; });
            b.addEventListener('mouseleave', () => { refreshFormaFidelityButtons(); });
            b.addEventListener('click', () => { setFormaBuildingFidelity(fidelity); refreshFormaFidelityButtons(); });
            return b;
        };
        const realBtn = mkFidelityBtn('real', '◉ Real', 'Show the real PRYZM building with full elements (windows · doors · roof · furniture)', true);
        const massingBtn = mkFidelityBtn('massing', '▢ Massing', 'Show the abstract Forma massing study (white/pastel volumes)', false);
        refreshFormaFidelityButtons = (): void => {
            for (const [b, f] of [[realBtn, 'real'], [massingBtn, 'massing']] as const) {
                const on = formaBuildingFidelity === f;
                b.style.background = on ? '#6600FF' : 'transparent';
                b.style.color = on ? '#ffffff' : '#6600FF';
            }
        };
        refreshFormaFidelityButtons();
        bar.appendChild(realBtn);
        bar.appendChild(massingBtn);

        // §A.21.D24 — Floors selector. A compact <select> populated from the REAL
        // storeys of the placed massing (CesiumViewport.getFormaStoreyBands()).
        // "All floors" (default) shows every storey stacked at its true elevation;
        // picking a single floor isolates it. Hidden until ≥2 storeys exist (a
        // single-storey house / apartment has nothing to choose). Rebuilt after
        // each massing render via refreshFormaFloorSelector().
        const floorSel = document.createElement('select');
        floorSel.className = 'pryzm-forma-floor-select';
        floorSel.setAttribute('data-testid', 'forma-floor-select');
        floorSel.title = 'Choose which floor(s) to show on the globe';
        Object.assign(floorSel.style, {
            appearance: 'none', border: 'none', cursor: 'pointer',
            padding: '7px 12px', borderRadius: '7px', color: '#6600FF',
            background: 'transparent', font: 'inherit', borderLeft: '1px solid #ece7fb',
            display: 'none', // shown by refreshFormaFloorSelector when ≥2 storeys.
        } satisfies Partial<CSSStyleDeclaration>);
        floorSel.addEventListener('change', () => {
            const v = floorSel.value;
            if (v === 'all') cesiumViewport?.setVisibleFormaLevels?.(null);
            else cesiumViewport?.setVisibleFormaLevels?.([Number(v)]);
            console.log(`[gis][forma] floor selector → ${v === 'all' ? 'ALL floors' : `floor ${v}`}.`);
        });
        bar.appendChild(floorSel);
        formaFloorSelect = floorSel;

        viewport.appendChild(bar);
        formaToggle = bar;
        console.log(`[gis][forma] view toggle mounted (initial "${initial}").`);
        applyFormaView(initial);
    };

    const removeFormaViewToggle = (): void => {
        const wasMounted = formaToggle !== null;
        disposeFormaAnalysis(); // FORMA.5 — tear down analysis chrome with the toggle.
        if (formaToggle?.parentElement) formaToggle.parentElement.removeChild(formaToggle);
        formaToggle = null;
        // §FIX-VIEWMODE-BAR-CONSOLIDATE (L-166) — the segmented switch stays mounted
        // (it was never hidden), so there is nothing to "restore". If we were on the
        // "3D Site" segment, drop back to the underlying 2D/3D segment so the switch
        // no longer shows a Forma sub-bar as active. Guard on wasMounted so calling
        // this while already on a 2D/3D segment doesn't clobber that paint.
        if (wasMounted && activeSegment === 'forma') {
            activeSegment = resultViewMode;
            refreshResultButtons();
        }
        formaMap2dBtn = null;
        formaPlanBtn = null;
        formaThreeBtn = null;
        formaFloorSelect = null;
    };

    // ════════════════════════════════════════════════════════════════════════
    // FORMA.4 — live-update: re-place the massing on boundary/layout edits (§4.6)
    // ════════════════════════════════════════════════════════════════════════
    //
    // The drawn boundary AND the authored apartment massing change AFTER the 3D
    // view is up: the user commits a parcel (`site.parcel-boundary-set`) or the
    // generator authors walls/doors (`apartment.layout-executed`). On either, we
    // clear + re-place the Cesium entities from fresh PRYZM domain state.
    //
    // NO-RE-FLY GUARANTEE (task #2): live updates call renderFormaMassing(FALSE)
    // — the camera never moves. Only the explicit 3D-activation (applyFormaView
    // '3d') and the "Zoom to Site" button fly. The user stays at their current
    // viewpoint and watches the massing update in place. Terrain is re-sampled
    // by CesiumViewport ONLY when the centroid moves.
    //
    // Guard: only re-render when Cesium is mounted + a Cesium-Forma view (plan
    // OR 3d) is the active mode (no point rebuilding entities the user isn't
    // looking at; they get rebuilt on the next Cesium activation anyway, which
    // reads live state). The 2D-map mode is skipped.
    // §GEN-VIEW-COALESCE (audit §3 / P1-1) — TRUE when a Forma re-place was requested while
    // a building generation was in flight; the one catch-up re-place runs at generation end.
    let formaMassingPendingAfterGen = false;
    const liveUpdateFormaMassing = (source: string): void => {
        // §GEN-VIEW-COALESCE — during a building generation the four chained
        // `*.layout-executed` events each triggered a FULL clear + re-place of the Cesium
        // massing (3 of 4 redundant — the audit's 4-rebuilds-per-chain finding). While the
        // generation lease's flag is up we DEFER: remember that a re-place is owed and run
        // it ONCE on the lease's 'pryzm-building-generation-ended' event (whose dispatch is
        // guaranteed by the lease's settle / explicit-end / hard-cap release paths, so the
        // massing can never stay stale — L-716 class). Zero behavior change outside
        // generation: the flag is only ever true inside a lease.
        if ((globalThis as unknown as { __pryzmBuildingGenActive?: boolean }).__pryzmBuildingGenActive === true) {
            formaMassingPendingAfterGen = true;
            console.log(`[gis][forma] live-update (${source}) deferred — building generation in flight (one re-place at generation end).`);
            return;
        }
        if (!cesiumViewport?.renderFormaMassing) return; // Cesium not mounted yet.
        // §L-412 (C59 Phase 1b) — pane-aware gate. In the single-view world the guard
        // skips the re-render when the user is on the 2D map (`formaViewMode==='map2d'`)
        // because Cesium isn't visible. But in the site-authoring SPLIT the 2D map is in
        // the LEFT pane while the 3D Site (Cesium) is LIVE in its OWN right pane — so a
        // draw/select on the left MUST re-render the boundary + envelope on the right
        // (the founder's live side-by-side). When the 3D Site is hosted in a pane the
        // gate therefore fires regardless of `formaViewMode` (the paned 3D Site is NOT
        // map2d — the pure model owns which view each pane holds).
        const site3dPaned =
            !!siteAuthoringPanes &&
            !siteAuthoringPanes.isDisposed &&
            siteAuthoringPanes.controller.hostsView('site-3d');
        if (formaViewMode === 'map2d' && !site3dPaned) return; // not looking at Cesium.
        // §L-412 (Req 2) — the FIRST parcel-boundary commit into the paned 3D Site frames
        // the plot ONCE (the pane opens at whole-city scale). Use the existing framing
        // primitive (renderFormaMassing(true) → §GLOBE-FIT-BUILDING flyToBoundingSphere);
        // every subsequent update (zoning recompute, layout edits) falls back to the
        // no-re-fly path below so continuous edits never yank the camera.
        // §L-416 — derive the just-committed plot centroid so the decision can tell a
        // NEW-location parcel (re-frame) from an in-place edit of the SAME plot (no re-fly).
        const newCentroid = ringCentroidXZ(getFormaBoundary());
        if (
            shouldFramePanedSiteOnUpdate({
                source,
                site3dPaned,
                newCentroid,
                lastFramedCentroid: siteAuthoringPaneLastFramedCentroid,
            })
        ) {
            siteAuthoringPaneLastFramedCentroid = newCentroid ?? siteAuthoringPaneLastFramedCentroid;
            console.log(
                `[gis][forma] live-update (${source}) → paned commit at a ` +
                `${siteAuthoringPaneLastFramedCentroid ? 'NEW plot location' : 'plot'}: ` +
                `framing the 3D Site to the plot (one-shot fly).`,
            );
            renderFormaMassing(true);
            return;
        }
        console.log(
            `[gis][forma] live-update (${source}) → re-placing massing (no re-fly)` +
            `${site3dPaned ? ' [paned 3D Site]' : ''}.`,
        );
        renderFormaMassing(false);
    };

    const formaLiveUpdateDisposers: Array<() => void> = [];
    // §L-412 (root-cause) — resolve the event bus the Forma live-update listens on.
    // The LIVE boot path hands `mountGISArea` a NULL runtime (`createMainLayout(props,
    // null)`, initUI.ts), so `runtime?.events` is undefined and the subscription below
    // silently never armed — a plot drawn AFTER the 3D-Site pane mounted (the onboarding
    // draw flow) never framed the plot or rendered the buildable envelope. `window.runtime`
    // IS published at bootstrap() start (before initUI), so fall back to it — the SAME
    // captured-then-window resolution `getFormaBoundary` uses for the store (Bug-2).
    const resolveFormaEvents = (): LiveUpdateEventBus | null => {
        const captured = runtime?.events as unknown as LiveUpdateEventBus | undefined;
        const windowBus =
            typeof window !== 'undefined'
                ? (window.runtime as unknown as { events?: LiveUpdateEventBus } | undefined)?.events
                : undefined;
        return resolveLiveUpdateEventBus(captured, windowBus);
    };
    const subscribeFormaLiveUpdate = (): void => {
        const events = resolveFormaEvents();
        if (!events || formaLiveUpdateDisposers.length > 0) return;
        // §A.21.D34(d) — FURNITURE-0 TIMING FIX. The generation chain is
        // apartment → CEIL → furnish → light (see runtime types.ts +
        // MEMORY d-ce-deterministic-ceiling-engine). The Forma massing previously
        // only re-rendered on `apartment.layout-executed`, which fires BEFORE the
        // furnish/ceiling/lighting passes — so when the Forma reader pulled the
        // furniture store at that moment it was STILL EMPTY → "0 furniture again".
        // Subscribe to the DOWNSTREAM completion events too so the massing
        // re-renders (reading the stores FRESH each time — getFormaFurniture pulls
        // live) once furniture/ceilings/lights actually exist. renderFormaMassing
        // is idempotent (clearFormaMassing first), so the extra re-renders are safe.
        // §DVP170 (L-12820) — THE DESIGNED-VS-PERMITTED CARD HAD NO LIVE TRIGGER OF ITS OWN.
        //
        // MEASURED (not guessed): `refreshEnvelopePanel`'s `capacityJoin` re-reads the authored
        // model FRESH on every call — `measureAuthoredDesign`/`collectAuthoredModelSnapshot` are
        // pure and correct against live stores (pinned by `designMeasurement.spec.ts`). The
        // founder's card nonetheless read "Nothing has been authored on this site yet" against a
        // 462-element / 7-level / 56-wall / 10-slab project, because `refreshEnvelopePanel` was
        // never CALLED AGAIN after the parcel was committed: its only triggers were envelope-
        // visibility toggles, a recompute button, `pryzmMountEnvelopeCard` re-hosting, and — via
        // `renderFormaMassing`'s OWN tail call at its very end — this exact event list. But that
        // tail call is reached only through `liveUpdateFormaMassing`, which returns EARLY at
        // `if (!cesiumViewport?.renderFormaMassing) return;` whenever the Cesium/3D-Site view was
        // never opened. So a project authored (or AI-generated — `apartment.layout-executed` →
        // `furnish.layout-executed` is exactly the D-TGL/D-FLE chain a 95-furniture project runs)
        // without ever opening 3D Site got a card frozen at whatever it showed at parcel-commit
        // time — usually nothing, since nothing was authored yet. `refreshEnvelopePanel` itself
        // needs no Cesium (`getForma3dHostEl()` is a plain DOM host resolver), so it does not
        // belong behind that gate. Called directly, unconditionally, on the SAME event list the
        // massing already trusts — a second call when Cesium IS open is a harmless idempotent
        // re-render (same convention `renderFormaMassing` itself already relies on).
        for (const evt of [
            'site.parcel-boundary-set',
            // C58 (L-402b) — re-render once the buildable envelope is computed +
            // cached (dispatched just AFTER parcel-boundary-set). renderFormaMassing
            // is idempotent (clearFormaMassing first), so this extra pass is safe
            // and mirrors the furniture-timing fix below.
            'site.zoning-updated',
            'apartment.layout-executed',
            'ceiling.layout-executed',
            'furnish.layout-executed',
            'lighting.layout-executed',
        ] as const) {
            try {
                const sub = events.on(evt, () => {
                    liveUpdateFormaMassing(evt);
                    // §DVP170 — independent of the Cesium-mount gate above; see the block header.
                    try { refreshEnvelopePanel(); } catch (e) {
                        console.warn(`[gis][envelope-card] §DVP170 live-update refresh on ${evt} failed (non-fatal):`, e);
                    }
                    // ⭐ §MAP2D-ENVELOPE (STR §26.4) — the 2D MAP's envelope, and it belongs HERE,
                    // OUTSIDE the Cesium gate, for exactly the reason §DVP170 above records.
                    // `liveUpdateFormaMassing` returns early at `if (!cesiumViewport?.renderFormaMassing)
                    // return;` and again at `if (formaViewMode === 'map2d' && !site3dPaned) return;` —
                    // i.e. it refuses to run PRECISELY when the 2D map is the only thing on screen,
                    // which is the founder's case ("on 2d map view" it never rendered). Hanging the
                    // map's repaint off that function would therefore reproduce the reported defect
                    // with a live-looking wire behind it. The map is a THIRD rasteriser of the same
                    // payload, not a Cesium accessory.
                    try {
                        map2dHandle?.setBuildableEnvelope(resolveFormaEnvelope()?.solids ?? null);
                    } catch (e) {
                        console.warn(`[gis][c58] §MAP2D-ENVELOPE live-update on ${evt} failed (non-fatal):`, e);
                    }
                });
                // EventSubscription is callable-as-disposer.
                formaLiveUpdateDisposers.push(() => { try { sub(); } catch { /* gone */ } });
            } catch (e) {
                console.warn(`[gis][forma] live-update subscribe to ${evt} failed:`, e);
            }
        }
        console.log('[gis][forma] live-update subscribed: site.parcel-boundary-set + apartment/ceiling/furnish/lighting.layout-executed (furniture-timing fix + §DVP170 capacity-card refresh).');
        // §GEN-VIEW-COALESCE — the one catch-up re-place at generation end. The lease
        // dispatches 'pryzm-building-generation-ended' AFTER clearing
        // __pryzmBuildingGenActive, so the call below is not re-deferred by the gate.
        const onGenerationEnded = (): void => {
            // §DVP170 — refresh the capacity card on EVERY generation end, not only when a
            // Cesium re-place was pending: `formaMassingPendingAfterGen` tracks the MASSING'S
            // own coalescing, and gating this card's refresh on it would reintroduce the exact
            // Cesium-mount coupling this fix removes above.
            try { refreshEnvelopePanel(); } catch (e) {
                console.warn('[gis][envelope-card] §DVP170 generation-end refresh failed (non-fatal):', e);
            }
            if (!formaMassingPendingAfterGen) return;
            formaMassingPendingAfterGen = false;
            liveUpdateFormaMassing('generation-ended');
        };
        window.addEventListener('pryzm-building-generation-ended', onGenerationEnded);
        formaLiveUpdateDisposers.push(() => {
            try { window.removeEventListener('pryzm-building-generation-ended', onGenerationEnded); } catch { /* gone */ }
        });
    };
    // Subscribe eagerly so an edit made before the user ever opens 3D is still
    // reflected the next time 3D is shown (the guard short-circuits when not 3D).
    subscribeFormaLiveUpdate();

    // §A.10.g (2026-06-05) — AUTO-LOAD climate the moment a site location is set,
    // NOT only when the Forma view opens. The bundled regional default ingests
    // instantly (offline), so the climate card + wind rose are populated by the
    // time the user opens the climate card. Live measured normals upgrade in the
    // background. once-guarded (the first location set per session is enough; the
    // command is idempotent / skipIfPresent anyway).
    let _climateAutoLoaded = false;
    const ensureClimateNow = (): void => {
        if (_climateAutoLoaded) return;
        _climateAutoLoaded = true;
        import('../climate/ensureSiteClimate')
            .then(({ ensureSiteClimate }) => ensureSiteClimate(runtime ?? null))
            .catch((e) => console.warn('[gis] auto climate-load failed:', e));
    };
    try {
        // §L-412 (root-cause) — resolve via the window fallback too (the captured runtime
        // is null on the live boot path), else the climate auto-load never armed either.
        const csub = resolveFormaEvents()?.on('site.location-changed', () => ensureClimateNow());
        if (csub) formaLiveUpdateDisposers.push(() => { try { csub(); } catch { /* gone */ } });
        // If a location is already set (e.g. returning to an existing project), load now.
        const existing = getFormaOrigin();
        if (existing && (existing.lat !== 0 || existing.lon !== 0)) ensureClimateNow();
    } catch (e) {
        console.warn('[gis] climate auto-load subscribe failed:', e);
    }
    window.pryzmDisposeFormaLiveUpdate = () => {
        for (const d of formaLiveUpdateDisposers.splice(0)) d();
    };

    // FORMA.4 — on-demand re-render hook (console + programmatic). `frame` flies
    // the NW oblique camera; live-update callers pass false (no re-fly).
    window.pryzmRenderFormaMassing = (frame?: boolean) => renderFormaMassing(frame ?? false);
    // FORMA.6 — toggle the Forma study building fidelity. 'real' (default) re-exports
    // the live BIM scene → glTF and places it; 'massing' drops the model + re-shows
    // the abstract pastel volumes. Syncs both the local flag AND the viewport flag,
    // then re-renders (no re-fly) so the switch is immediate.
    const setFormaBuildingFidelity = (fidelity: 'massing' | 'real'): void => {
        if (fidelity !== 'massing' && fidelity !== 'real') {
            console.warn(`[gis][forma6] setFormaBuildingFidelity: bad value ${String(fidelity)} — ignored.`);
            return;
        }
        formaBuildingFidelity = fidelity;
        if (fidelity === 'real') {
            formaRealLastSig = null; // force a re-export on next place.
        } else {
            formaRealPlaced = false; // model is dropped by the viewport on 'massing'.
        }
        cesiumViewport?.setFormaBuildingFidelity?.(fidelity);
        refreshFormaFidelityButtons();
        console.log(`[gis][forma6] Forma building fidelity → ${fidelity}.`);
        // Re-render the current massing (no re-fly); when 'real' this re-places the
        // model, when 'massing' the viewport already re-showed the blocks.
        if (cesiumViewport?.renderFormaMassing && formaViewMode !== 'map2d') {
            renderFormaMassing(false);
        }
    };
    window.pryzmSetFormaBuildingFidelity = setFormaBuildingFidelity;

    // ── §GIS-ACTION-REGISTRY (L-1187, C06 §13) — entry points for the consolidated panel ──
    //
    // Three site controls existed ONLY as closures in this function, so the only way to
    // invoke them was to click one of the floating pills or sub-bar buttons that close
    // over them. That is why the GIS panel could not host them and why the founder had
    // to hunt three separate chrome surfaces for one job.
    //
    // These are registrations, not new behaviour: each one calls the SAME closure the
    // legacy control calls. C06 §13.3 — a consolidated surface RE-HOSTS the dispatch;
    // it never copies the handler. Registering the entry point is what makes re-hosting
    // possible at all.

    /** §GIS-ACTION-REGISTRY — toggle the FORMA.5 site-analysis panel (sun · weather · wind).
     *  The panel only exists in the Forma Plan/3D views, so bring that view up when it
     *  isn't mounted — identical to what both legacy controls do. */
    window.pryzmToggleSiteAnalysis = () => {
        if (!formaAnalysis) { applyFormaView('plan'); }
        else { formaAnalysis.toggle(); }
    };

    /** §GIS-ACTION-REGISTRY — show / hide the buildable-envelope facts card. Same
     *  not-built-yet branch as the launcher pill: the card is rendered by the Forma
     *  view, so bring that up rather than dead-ending. */
    window.pryzmToggleEnvelopeCard = () => {
        if (envelopePanel) { toggleEnvelopeCard(); return; }
        envelopeCardHidden = false;
        // L-1587 - RE-DERIVE BEFORE LEAVING. This branch used to go straight to
        // `applyFormaView('plan')`, which is a dead end wearing a helpful face: the card is
        // absent because `_lastEnvelope` is null after a reload, and switching view does not
        // make it non-null. The user arrived at a button labelled "Buildable Envelope" and was
        // moved somewhere else with still no numbers.
        if (window.pryzmRecomputeEnvelopeCard?.()) return;
        applyFormaView('plan');
    };

    /** L-1587 - re-derive the buildability determination for the committed parcel.
     *
     *  Returns TRUE only if a card is on screen afterwards. This is the escape hatch the
     *  L-1362 re-host was missing: it moved WHERE the card renders without giving any surface
     *  a way to bring the determination BACK, and the determination is session state.
     *
     *  It re-runs the SAME C58 computation against the SAME committed boundary - it does not
     *  persist, reconstruct or infer an envelope, so every refusal branch still applies and a
     *  parcel that legitimately has no envelope still refuses to draw one. */
    //  §GIS-LEGACY-DETERMINATION-ESCAPE (L-1972) — this hook is now a SEAM over the one
    //  `recomputeEnvelopeDetermination` closure (declared beside the reduced card), not a
    //  second implementation of it. It used to be the only place the recompute existed, which
    //  is why the reduced card — the arm that actually fires for pre-L-1654 projects — had no
    //  way to reach it. One producer, two callers.
    window.pryzmRecomputeEnvelopeCard = (): boolean => recomputeEnvelopeDetermination();

    /** §GIS-ENVELOPE-REHOST (L-1362, C06 §13.3) — claim the buildability read-out for a host.
     *
     *  Pass the element it should render into; pass `null` to release it back to the viewport.
     *  Returns whether a card is actually present afterwards.
     *
     *  ⚠ THE RETURN VALUE IS LOAD-BEARING AND MUST NOT BE IGNORED. `false` does not mean
     *  "failed to mount" — it means the C58 render decided there is NOTHING HONEST TO SHOW
     *  (no parcel, no solved envelope, no persisted ring). A caller that renders an empty
     *  container on `false` produces a blank panel, and a blank panel reads as a crash rather
     *  than as "we could not determine this" — the L-553 defect. The caller must say so in
     *  words instead.
     *
     *  ⛔ It must NEVER be turned into "show zeros". A 0/0/0 envelope REFUSES to draw rather
     *  than overstate on real land (§L-616 / C58 §1.16), and an UNKNOWN constraint rendered as
     *  a zero is the EI-1b defect where failure and emptiness become the same value. This hook
     *  moves the existing card; it does not get to soften what the card refuses to say. */
    window.pryzmMountEnvelopeCard = (host: HTMLElement | null): boolean => {
        envelopeCardPreferredHost = host;
        try {
            // The card's own render decides which of its four templates applies — or that none
            // does and the element should be removed. This call does not pre-empt that choice.
            refreshEnvelopePanel();
        } catch (e) {
            console.warn('[gis][envelope-card] re-host refresh failed (non-fatal):', e);
        }
        const present = !!envelopePanel && !!envelopePanel.parentElement;
        // The card is closable (its own ✕ sets `envelopeCardHidden`). A host that just claimed
        // it is asking to SEE it, so honour that the same way the old launcher pill did rather
        // than silently handing back a hidden element.
        if (present && host && envelopeCardHidden) {
            envelopeCardHidden = false;
            applyEnvelopeCardVisibility();
        }
        console.log(
            `[gis][envelope-card] §GIS-ENVELOPE-REHOST host=${host ? (host.className || host.id || 'element') : 'viewport'} ` +
                `→ card ${present ? 'PRESENT' : 'ABSENT (nothing determinable — caller must say so in words)'}.`,
        );
        return present;
    };

    // §VIEW-PANEL-PER-PANE (founder 2026-09-06: *"the 2d map satellite and non-satellite
    // option is MASKED FOR ANOTHER PANEL — add those options to the main panel"*).
    //
    // ⭐ RE-HOSTED, NOT RE-IMPLEMENTED. This forwards to `SiteBoundaryMap2D`'s own
    // `swapBasemap` — the A.8.c.f.4 function the corner `Map | Satellite` chip has always
    // driven. There is exactly one basemap implementation and this is not a second one.
    // With no map mounted the request is REMEMBERED (see `requestedBasemap`) rather than
    // dropped, so the panel's button is never a silent no-op.
    window.pryzmSetSiteBasemap = (next: 'map' | 'satellite') => {
        requestedBasemap = next;
        map2dHandle?.setBasemap(next);
    };
    // ⚠ THE LIVE MAP WINS. The corner chip writes the map's own `basemap` and knows nothing
    // about `requestedBasemap`, so reading our own memory while a map is on screen would
    // report a swap the user made from the chip as not having happened — failure and
    // emptiness collapsing into one value (C84 EI-1b). Ask the map; fall back only when
    // there is no map to ask.
    window.pryzmGetSiteBasemap = () => map2dHandle?.getBasemap() ?? requestedBasemap;

    /** §GIS-ACTION-REGISTRY (L-1361, C06 §13) — report which site view / fidelity is CURRENT.
     *
     *  The GIS panel needs to paint an active state, and there are exactly two ways to get
     *  one: mirror the state into the panel, or ask the authority. Mirroring is how the
     *  legacy chrome ended up with `Real` lit on one bar and not on the other — two copies
     *  of one fact, drifting. So this READS the live closures and returns a snapshot; the
     *  panel derives its highlight from the snapshot and holds no state of its own.
     *
     *  ⚠ It is a SNAPSHOT, not a subscription. A caller that renders from it repaints when
     *  it asks again — this file does not notify. That is stated so nobody builds a
     *  live-updating surface on top of a value that only moves when you pull it. */
    window.pryzmGetSiteViewState = () => ({
        segment: activeSegment,
        formaMode: formaViewMode,
        // §VIEW-PANEL-PER-PANE — WHICH 2D basemap, so a panel can tell "2D Site Map" from
        // "2D Satellite" instead of lighting both or neither. Read off the live map.
        basemap: map2dHandle?.getBasemap() ?? requestedBasemap,
        // FORMA.6 vs §GLOBE-FIDELITY — two variables, and which one the user is actually
        // looking at depends on the active segment. Reporting the one that governs the
        // visible surface is the same de-duplication `pryzmZoomToSite` makes: the user has
        // ONE notion of "am I seeing the real building?", so the snapshot answers it once.
        buildingFidelity: activeSegment === 'forma' ? formaBuildingFidelity : globeBuildingFidelity,
    });

    /** §GIS-ACTION-REGISTRY (L-1360) — restore every optional panel to its declared
     *  default state, size and position.
     *
     *  APP-WIDE, not GIS: `resetPanelLayout()` walks the whole `PANEL_REGISTRY`, so this
     *  also re-seats `view-properties`, `level-stepper` and `site-plan-overlay`. The GIS
     *  panel hosts it because the floating rail it used to live in is gone, and it is
     *  labelled in the panel as the app-wide action it is (C06 §13.7 verdict (d) — say
     *  where a control really belongs rather than let its host imply a false scope).
     *
     *  Honest feedback: "already at defaults" and "3 panels restored" are different facts
     *  and must not print the same sentence. */
    window.pryzmResetPanelLayout = () => {
        const changed = resetPanelLayout();
        runtime?.events?.emit('pryzm:toast', {
            message: changed.length === 0
                ? 'Panel layout is already at its defaults.'
                : `Panel layout reset — ${changed.length} panel(s) restored to default.`,
            severity: 'info',
        });
    };

    /** §GIS-ACTION-REGISTRY — reframe the camera on the site.
     *
     *  ⭐ This is the de-duplication, not a third copy. There were TWO "Zoom to Site"
     *  buttons wearing the same label against different targets: the Forma sub-bar's
     *  reframed the active Forma preset, the globe segment's reframed the placed
     *  building on the photoreal tiles. One label, two behaviours, decided by which bar
     *  the user happened to reach for. Here the ACTIVE SURFACE decides — which is what
     *  the user meant by "zoom to site" in both cases. Composed entirely of the existing
     *  dispatches; no framing logic is authored here. */
    window.pryzmZoomToSite = () => {
        if (activeSegment === 'forma') {
            if (formaViewMode === 'plan') cesiumViewport?.flyToFormaPlan?.();
            else cesiumViewport?.flyToFormaSite?.();
            return;
        }
        void reframeSiteIn3D();
    };

    // FORMA.3 / FORMA-PLAN-OBLIQUE — mount the [2D Map][Plan][3D] toggle. Defaults
    // to the Forma PLAN-oblique (the signature look — near-top-down shadowed
    // massing) so the demo lands straight on the Forma "plan view". Mirrors
    // pryzmShowSiteResultView. Accepts 'map2d' | 'plan' | '3d'.
    window.pryzmShowFormaView = (initial?: 'map2d' | 'plan' | '3d') => {
        mountFormaViewToggle(initial ?? 'plan');
        // §COR-MANUAL-ADMIN-ZONE (2026-08-05, follow-up fix) — same auto-open as
        // `pryzmEnterSiteView` below; this is a sibling site-view entry point, and the call is a
        // documented no-op for any non-admin session, so duplicating it here is harmless.
        void import('../site/ManualAdminZonePanel')
            .then((m) => m.openManualAdminZonePanelIfAdmin(runtime))
            .catch((e) => console.warn('[gis][site-view] manual admin zone panel auto-open failed (non-fatal):', e));
    };
    window.pryzmHideFormaView = () => removeFormaViewToggle();

    // §FEAT-SITE-VIEW-ALWAYS-ON (L-40, ADR-0114) — the 3D globe / 3D site view must be
    // reachable from ANY 3D view, at all times. Root cause of the founder's report: the
    // ONLY UI entry was the buried GIS-rail "3D Site" button, whose handler dead-ended
    // ("GIS area not mounted yet") when `pryzmShowFormaView` wasn't defined. This global
    // is a stable, self-bootstrapping entry (mountFormaViewToggle → applyFormaView →
    // engageFormaCesium → toggleGIS(true) mounts Cesium on demand, centred on a sensible
    // default even with NO site), plus an always-present floating launcher on the 3D
    // viewport so the user never has to hunt for it.
    window.pryzmEnterSiteView = (initial?: 'map2d' | 'plan' | '3d') => {
        try {
            mountFormaViewToggle(initial ?? 'plan');
        } catch (e) {
            console.error('[gis][site-view] pryzmEnterSiteView failed:', e);
        }
        // §COR-MANUAL-ADMIN-ZONE (2026-08-05, follow-up fix) — the panel's only launcher was a
        // button on `GISRailPanel.ts`, a class that (per the same "buried, unreachable button" bug
        // class §FEAT-SITE-VIEW-ALWAYS-ON was written to fix, above) is never actually instantiated
        // anywhere in this app. Auto-attempt to open it here instead, every time site view is
        // entered — `openManualAdminZonePanelIfAdmin` itself asks the server and is a documented
        // no-op for any non-admin session, so this is safe to call unconditionally.
        void import('../site/ManualAdminZonePanel')
            .then((m) => m.openManualAdminZonePanelIfAdmin(runtime))
            .catch((e) => console.warn('[gis][site-view] manual admin zone panel auto-open failed (non-fatal):', e));
    };
    // §FEAT-PLAN-VIEW-GIS (L-104, ADR-0115) — the PLAN-VIEW analogue of pryzmEnterSiteView.
    // Switch to the orthographic Top (plan) view and composite the real-world GIS/aerial
    // context UNDER the authored building, rotated onto PROJECT NORTH. REUSE (no new engine):
    //   • the building "projected to plan" IS the BIM Top view (activateView('Top') →
    //     ViewController orthographic camera, C04);
    //   • the GIS context is a plan-canvas underlay built from ESRI World Imagery tiles
    //     (buildSiteGisContextRaster) placed via the EXISTING L-71 pipeline
    //     (createPlanCanvasUnderlayFromSiteOverlay), centred on the site origin;
    //   • project north is applied as the underlay mesh rotationZ = θ
    //     (computeGisContextUnderlayRotationZ, from SiteLocation.trueNorth — ADR-0115 dual
    //     north; θ = 0 ⇒ identity, so a north-aligned site is byte-identical to today).
    // Degrades gracefully: no site origin ⇒ just the plan view (building only, no context);
    // imagery/canvas failure ⇒ toast + building only. Never throws into the caller.
    const enterPlanViewGis = async (): Promise<void> => {
        try {
            const origin = getFormaOrigin();
            // θ = project→true-north (radians) from the model; 0 (identity) when unset.
            let theta = 0;
            const loc = (runtime?.siteModelStore as
                | { getSite?: () => { location?: { trueNorth?: number } } | null }
                | undefined)?.getSite?.()?.location;
            if (loc && typeof loc.trueNorth === 'number' && Number.isFinite(loc.trueNorth)) {
                theta = loc.trueNorth;
            }

            // Orthographic plan view — activateView exits GIS first, then routes through the
            // ViewController so the TSL pipeline rebuilds against the orthographic camera.
            await activateView('Top');

            if (!origin) {
                runtime?.events?.emit('pryzm:toast', {
                    message: 'Plan view ready. Set a site location to show the real-world context underneath.',
                    severity: 'info',
                });
                console.log('[gis][plan-gis] no site origin — plan view without GIS context underlay.');
                return;
            }

            runtime?.events?.emit('pryzm:toast', { message: 'Loading site GIS context…', severity: 'info' });
            const raster = await buildSiteGisContextRaster({ centerLat: origin.lat, centerLon: origin.lon });
            if (!raster) {
                runtime?.events?.emit('pryzm:toast', {
                    message: 'Could not load the GIS context imagery — showing the building only.',
                    severity: 'error',
                });
                return;
            }

            const ok = await createPlanCanvasUnderlayFromSiteOverlay({
                dataUrl: raster.dataUrl,
                fileName: 'Site GIS context',
                widthPx: raster.widthPx,
                heightPx: raster.heightPx,
                pxPerMeter: raster.pxPerMeter,
                // Composite is centred on the site origin (= scene origin) → E/N = 0.
                positionEast: 0,
                positionNorth: 0,
                // True-north imagery → project frame: rotationZ = θ (ADR-0115 dual north).
                rotationZ: computeGisContextUnderlayRotationZ(theta),
                // §UND-VIEW-SCOPE (L-1197) — THE FOUNDER'S "Plan Site … even my 3D view has
                // this image attached". This raster is a MACHINE-GENERATED plan basemap, not
                // a user import the user is going to trace in 3-D. It belongs to the PLAN
                // view this control just activated and to nothing else; before this line the
                // underlay had no view scope at all and every view rendered it.
                viewScope: 'plan',
            });

            // Frame the plan on the building + context (best-effort).
            try { await props._viewController?.zoomToFit?.(); } catch { /* non-fatal */ }

            if (ok) {
                runtime?.events?.emit('pryzm:toast', {
                    message: 'Plan view on real-world GIS context (project north).',
                    severity: 'success',
                });
                console.log('[gis][plan-gis] plan-view GIS context underlay placed on project north (§FEAT-PLAN-VIEW-GIS).');
            }
        } catch (e) {
            console.error('[gis][plan-gis] enterPlanViewGis failed:', e);
        }
    };
    // Stable typed global entry (mirrors pryzmEnterSiteView) so any 3D/plan surface can open
    // the plan-view GIS context, registered at boot regardless of geospatial activation state.
    window.pryzmEnterPlanViewGis = () => { void enterPlanViewGis(); };

    const mountSiteViewLauncher = (): void => {
        try {
            // §UX1-PANEL-DEFAULTS D6 — SKIP-MOUNT, not hide. While the user is on the
            // PRYZM Earth globe during onboarding the whole rail is `absent`, so none
            // of these pills is created, styled or wired at all. This is the strong
            // form of absence (see `phaseChrome.ts` — the two enforcement levels are
            // deliberately different words). It is sound ONLY because every panel the
            // rail re-opens is also `absent` in that phase; `panelDefaults.spec.ts`
            // asserts exactly that pairing, so this early return can never silently
            // strand a capability.
            //
            // `installPhaseChrome()` re-runs on the phase change and this function is
            // idempotent, so the rail appears the moment the canvas is reached.
            if (panelAbsent('launcher-rail')) {
                console.log('[gis][panels] launcher rail not mounted — phase is the onboarding globe (§UX1-PANEL-DEFAULTS).');
                return;
            }
            // ══════════════════════════════════════════════════════════════════
            // §GIS-ACTION-REGISTRY (L-1360, C06 §13.7) — THE SIX SITE PILLS ARE GONE
            // ══════════════════════════════════════════════════════════════════
            //
            // Founder, 2026-08-20, with a screenshot of the consolidated GIS panel and
            // the floating stack rendering ON TOP OF it: "Can you then EXCLUDE THE
            // BUTTONS FROM THE MAIN SCENE?" — the same six actions were on screen
            // twice, one set obscuring the other.
            //
            // REMOVED (all verdict (a), C06 §13.7 — a surviving control dispatches the
            // same action, and the survivor is a REGISTRY action rendered by the GIS
            // panel, not another hand-written pill):
            //
            //   pryzm-site-view-launcher      "PRYZM Earth"        -> site.earth
            //   pryzm-plan-gis-launcher       "Plan + Site"        -> site.plan-gis
            //   pryzm-site-analysis-launcher  "Site Analysis"      -> site.analysis
            //   pryzm-envelope-card-launcher  "Buildable Envelope" -> site.buildable-envelope
            //   pryzm-graph-launcher          "Graph"              -> graph.building
            //   pryzm-living-graph-launcher   "Living Graph"       -> graph.living
            //
            // (the last two are deleted in `ui/graph/index.ts` and
            // `ui/living-graph/index.ts` — those pills lived beside their overlays.)
            //
            // ⛔ WHAT MADE THIS SAFE, AND IT IS NOT THAT THE PANEL LOOKS RIGHT.
            //
            // Earlier in this lane it was proved that a surface can be 100% unreachable
            // and still hold the ONLY route to a live capability: `GISRailPanel.ts` had
            // zero importers and was the sole caller of `openSiteInspectorPanel`.
            // Deleting a surface because its replacement APPEARS to cover it is exactly
            // how a capability disappears without anyone noticing.
            //
            // So this removal is not justified by inspection. Each of the six dispatched
            // a `window.pryzm*` entry point that the GIS panel's registry action ALSO
            // dispatches — and `gisActionRegistry.test.ts` now asserts, by scanning
            // production source, that EVERY entry point the registry declares is still
            // REGISTERED somewhere. Deleting a pill can no longer strand a capability;
            // deleting a registration fails the build. That is the difference between
            // "cleaned" and "lucky".
            //
            // What still mounts here is the `Reset panel layout` reset LISTENERS below —
            // they re-apply the reset to real DOM and are not controls. The ⟲ button
            // itself moved into the GIS panel as the `panel.reset-layout` registry
            // action; see `window.pryzmResetPanelLayout` below.
            const viewport = document.getElementById('container');
            if (!viewport) return;
            if (viewport.style.position !== 'absolute' && viewport.style.position !== 'relative') {
                viewport.style.position = 'relative';
            }

            // ── §UX1-PANEL-DEFAULTS — `Reset panel layout` ────────────────────────
            // D2's obligation: whatever the persistence rule is, the user must be able to
            // get back to the declared defaults. Ours is SESSION-scoped (see
            // `panelDefaults.ts` header), so this control is not a "forget my
            // preferences" button — it is the recovery route when a panel has been
            // dragged half off-screen or resized to a sliver (all of these panels are
            // `makeDraggable` + `resize: both`), which is unrecoverable otherwise.
            //
            // It lives in this column because this column is the panel surface, and it
            // is icon-only so adding it does not undo the decluttering it exists to
            // serve. Slot 7 — appended, so no existing slot index moves (C06 §7.2).
            //
            // The listeners registered here are what make the reset REAL rather than a
            // table update nothing reads: `resetPanelLayout()` mutates the shared state
            // and then calls every listener, and these two re-apply it to the actual DOM
            // (visibility AND geometry). A reset that changed the table but left the
            // panels where they were would be the "committed ≠ reachable" defect.
            onPanelLayoutReset(() => {
                envelopeCardHidden = !isPanelOpen('buildable-envelope');
                applyEnvelopeCardVisibility();
                if (envelopePanel) {
                    envelopePanel.style.left = '';
                    envelopePanel.style.top = '';
                    envelopePanel.style.width = '';
                    envelopePanel.style.height = '';
                }
            });
            onPanelLayoutReset(() => {
                void import('../geospatial/FormaSiteAnalysisControls')
                    .then((m) => m.FormaSiteAnalysisControls.applyPanelLayoutReset(formaAnalysis))
                    .catch((e) => console.warn('[gis][panels] analysis reset failed (non-fatal):', e));
            });

            // §GIS-ACTION-REGISTRY (L-1360, C06 §13.7) — the floating ⟲ button is GONE.
            //
            // It was the last control in the bottom-left stack, and the founder boxed it
            // with the other six. But it is verdict (d), NOT (a): `resetPanelLayout()`
            // restores EVERY non-essential panel in `PANEL_REGISTRY` — view-properties,
            // level-stepper, site-plan-overlay — not just the site ones. It is app-wide
            // panel recovery that merely happened to live in the site rail.
            //
            // So it is neither deleted (that orphans the only route to recovering a panel
            // dragged half off-screen — the exact reason §UX1-PANEL-DEFAULTS D2 required
            // it) nor left floating. It is registered as an entry point and rendered by
            // the GIS panel as `panel.reset-layout`, in its own UTILITY group, labelled
            // as the app-wide action it actually is rather than implied to be a GIS one.
            //
            // The two `onPanelLayoutReset` listeners above stay exactly where they are:
            // they are what make the reset REAL rather than a table update nothing reads,
            // and they must live beside the DOM they re-apply it to.

            console.log('[gis][panels] §GIS-ACTION-REGISTRY (L-1360) — launcher-rail site pills removed; the GIS panel is the one host. Reset listeners armed.');
        } catch (e) {
            console.warn('[gis][site-view] launcher mount failed (non-fatal):', e);
        }
    };
    mountSiteViewLauncher();
    // §UX1-PHASE-CHROME — install the phase→DOM applier once, and re-try the rail
    // mount when the phase flips (the skip-mount above returns early on the globe,
    // so something has to ask again once the canvas is reached; `installPhaseChrome`
    // only shows/hides what already exists, it cannot create the rail).
    try {
        installPhaseChrome();
        onAppPhaseChanged(() => mountSiteViewLauncher());
        // L-13001 — on the canvas the launcher rail returns and `#svp-toggle-button` takes
        // slot 0 back, so the site-phase pill must go. One slot, one occupant (C06 §7.2).
        onAppPhaseChanged(() => refreshSiteSplitLauncher());
        // §UX1-VP-DEFAULT-CLOSED — the reopen route for `view-properties`, mounted at
        // the SAME site as the phase applier so the two cannot be wired apart. The
        // registry row may only say `closed` because this line exists; an authored-
        // but-unmounted launcher would make the panel unreachable, which is the exact
        // C82 §1.1 failure the row's previous `open` default was avoiding.
        installViewPropertiesLauncher();
    } catch (e) {
        console.warn('[gis][panels] phase-chrome install failed (non-fatal):', e);
    }

    // ════════════════════════════════════════════════════════════════════════
    // §FEAT-MULTI-PANE-VIEW-SYSTEM (L-412, C59 Phase 1b) — the site-authoring split.
    //
    // Lands the founder default directly: LEFT pane = the 2D site map (draw/select),
    // RIGHT pane = the LIVE 3D Site (boundary + buildable envelope), assigned through
    // the pure `assignViewToPane` model (`siteAuthoringDefaultLayout()`), NOT a
    // hard-coded toggle. The SINGLE Cesium viewer is RE-TARGETED into the right pane
    // element (`reparentContainerTo` — never cloned / never a second device); the
    // MapLibre 2D map mounts into the left pane element. A draw/select on the LEFT
    // re-renders the boundary + envelope LIVE on the RIGHT via the pane-aware
    // `renderFormaMassing(false)` no-re-fly path — no "Not now → hunt the 3D button"
    // dance. Single rAF (P3): neither renderer spins a new loop — Cesium keeps its
    // request-render mode, the map its own; the host only re-parents + reflows.
    // ════════════════════════════════════════════════════════════════════════
    /** §22 — set by `mountSiteAuthoringPanes()` to the CURRENT shell's one-shot fade-in.
     *  A no-op before any mount (and after an unmount) so the window hook is always safe. */
    let fadeInSiteAuthoringPanes: () => void = () => { /* nothing mounted */ };

    /**
     * §ONBOARDING-IS-FULL-BLEED (L-13000) — has the model COMMITTED a Site yet? The
     * `siteCommitted` input to `shouldMountSiteAuthoringSplit`, which carries the
     * reasoning for why EXISTENCE (and not a real lat/lon) is the right question.
     *
     * Reads `siteModelStore` rather than `getSiteOrigin()`, which also falls back to
     * `lastGeocodeFrame` and to the frozen LTP origin — neither of which is a statement
     * about the model.
     *
     * ⛔ §SITE-CHECK-RUNS-BEFORE-THE-SITE-IS-ANCHORED (L-13002) — THIS LINE READ THE BARE
     * CAPTURED `runtime` AND SO ANSWERED `false` ON EVERY PRODUCTION SESSION. The live
     * boot path hands this layout `runtime = null` by design, and the Site is committed
     * against `window.runtime`'s store. The result was a 45-second wait for a draw surface
     * that could never arrive (§UX1-DRAW-PHASE-GATE) because the split never mounted and
     * so the 2D map never mounted. The resolution now lives in the pure
     * `isSiteCommittedInModel`, beside the gate it feeds, where it is asserted without a
     * live runtime.
     */
    const siteCommittedInModel = (): boolean => isSiteCommittedInModel(
        runtime as unknown as SiteStoreHolder | null,
        (typeof window !== 'undefined')
            ? ((window as { runtime?: unknown }).runtime as SiteStoreHolder | undefined) ?? null
            : null,
    );

    // §SITE-CHECK-RUNS-BEFORE-THE-SITE-IS-ANCHORED (L-13002) — RETURNS WHETHER THE SPLIT IS
    // UP AFTER THIS CALL. It used to return `void`, so every early return above was
    // indistinguishable from success to the caller: the §22 reveal logged *"split mounted in
    // order"* while nothing had mounted, and the only evidence left was a 45-second wait.
    // A refusal that the caller cannot observe is not a refusal, it is a silent failure.
    const mountSiteAuthoringPanes = (preset: PaneLayoutPreset = 'site-authoring'): boolean => {
        // ════════════════════════════════════════════════════════════════════
        // §ONBOARDING-IS-FULL-BLEED (L-13000, founder 2026-09-06 with two screenshots)
        // — THE SPLIT MAY NOT EXIST WHILE THE ONBOARDING GLOBE STILL OWNS THE SCREEN.
        //
        // THE DEFECT. His console, in order: `starting guided flow (location →
        // draw-or-skip → generate)` → `location-step:open` → … → `§L-412
        // site-authoring split mounted — LEFT 2D map · RIGHT live 3D Site` →
        // `reparentContainerTo #pryzm-pane-right` → `resize — canvas 277x976`. The
        // split reserved the right half for a 3D Site pane with nothing to paint,
        // while the onboarding globe — a FULL-BLEED surface, not a pane — kept the
        // left. One session's canvas walked `1019 → 557 → 277 → 280 → 346 → 374` and
        // twice reached `canvas 0x0, container 0x0`.
        //
        // ⛔ WHY THIS IS A SKIP-MOUNT AND NOT A `display: none`. A mounted shell still
        // re-targets the SINGLE Cesium container (§L-412 `reparentContainerTo`) and
        // still drives the resize cascade, so a paint-only fix would leave every
        // measurement above exactly where it was. The pane must not EXIST at this
        // phase — the same strong form of absence `mountSiteViewLauncher()` already
        // uses for the launcher rail (§UX1-PANEL-DEFAULTS D6).
        //
        // ⭐ THE PREDICATE IS THE EXISTING ONE (`appPhase()` — the same question the
        // launcher rail asks before declining to mount, §UX1-PANEL-DEFAULTS D6, and
        // the 2D-map pin asks below, §ONBOARDING-STEP-PINS-ITS-SURFACE / L-10720),
        // NARROWED BY THE FOUNDER'S OWN WORDING: *"the split mounts when the flow
        // reaches the step that actually needs it — a committed location"*. The RULE
        // is pure and lives in `shouldMountSiteAuthoringSplit`, beside its sibling
        // `shouldAutoOpenSplitView`, so it is asserted without a Cesium viewer; read
        // that function for why the phase ALONE would delete the §22 reveal.
        // ════════════════════════════════════════════════════════════════════
        if (!shouldMountSiteAuthoringSplit({
            onboardingGlobePhase: appPhase() === 'onboarding-globe',
            siteCommitted: siteCommittedInModel(),
        })) {
            console.log(
                '[gis][panes] §L-412 site-authoring split NOT mounted — the phase is the onboarding '
                + 'globe and the model has no Site yet, so the globe keeps the FULL screen '
                + '(§ONBOARDING-IS-FULL-BLEED, L-13000). The split mounts at the §22 reveal / the '
                + 'draw step, both of which commit the Site first.',
            );
            return false;
        }
        if (siteAuthoringPanes && !siteAuthoringPanes.isDisposed) {
            // §PANE-DEFAULT-IS-PLAN-LEFT (L-12988) — already up. Do NOT re-mount (that would
            // tear down a live Cesium + map to rebuild the same two), and do NOT silently
            // ignore the preset either: a host that asks for its own opening while the split
            // happens to be up would otherwise get whatever the previous host left behind.
            // Seed through the STORE, the one write path (C59 §2 invariant 3).
            console.log(`[gis][panes] §L-412 site-authoring split already mounted — re-seeding '${preset}'.`);
            const already = siteAuthoringPanes.store.dispatch({
                type: 'view.pane.set-layout',
                layout: paneLayoutForPreset(preset),
            });
            if (!already.ok) {
                console.warn('[gis][panes] re-seed rejected (the existing layout stands):', already.rejected);
            }
            already.pending?.catch((err) => console.error('[gis][panes] re-seed apply (async) failed:', err));
            return true; // already up — the caller's postcondition ("the split is on screen") holds.
        }
        const container = document.getElementById('container');
        if (!container) {
            console.error('[gis][panes] §L-412 #container not found — cannot mount the split.');
            return false;
        }
        // Close any single-pane 2D-map overlay first — it re-opens INTO the left pane.
        if (map2dHandle) { try { map2dHandle.dispose(); } catch { /* gone */ } map2dHandle = null; }

        // §L-412 (Req 1) — the site-authoring split OWNS the screen: EXACTLY two panes
        // (2D map LEFT · 3D Site RIGHT). Suppress the legacy SplitViewManager Canvas2D
        // plan pane's project-load AUTO-open (and deactivate it if the idle callback
        // already opened it) so the redundant plan pane is NOT shown before any walls
        // exist. `suppressAutoOpen()` gates only the auto-open — the plan pane re-opens
        // for the BIM authoring stage via applyBimDualPane once site authoring ends.
        try {
            const svp = window.splitViewManager as
                | { suppressAutoOpen?: () => void } | undefined;
            svp?.suppressAutoOpen?.();
        } catch (e) {
            console.warn('[gis][panes] §L-412 SVP suppressAutoOpen failed (non-fatal):', e);
        }
        // §L-412 (Req 2) — fresh mount → the pane has not been framed yet; the first
        // parcel commit (or an already-committed boundary below) will frame it once.
        siteAuthoringPaneLastFramedCentroid = null;

        const shell = mountSiteAuthoringPaneShell({ parent: container, initialLeftFraction: 0.5 });
        siteAuthoringPanes = shell;

        // §22 (PRYZM-EARTH-ONBOARDING PRD §17.4 "Split-screen FADES in") — the split must not
        // hard-cut over the full-screen globe the user has just been flown across. Mount it
        // transparent and let a CSS opacity transition bring it in. Deliberately the cheapest
        // possible "nice transition": a CSS transition on ONE element — NOT camera-synchronised
        // animation machinery, and NOT a new rAF loop (P3: `requestAnimationFrame` is the frame
        // scheduler's alone; a CSS transition is the compositor's own, not ours).
        //
        // The opacity flip is scheduled on a single macrotask so the browser has painted the
        // transparent frame first (setting it in the same task would skip the transition). A
        // caller that never invokes `pryzmFadeInSiteAuthoringPanes` still gets a visible split —
        // the same one-shot schedules itself here as a safety net, so a wiring gap can never
        // leave an invisible pane shell on screen.
        try {
            shell.root.style.opacity = '0';
            shell.root.style.transition = 'opacity 420ms ease';
            const revealNow = (): void => {
                try {
                    if (siteAuthoringPanes === shell && !shell.isDisposed) shell.root.style.opacity = '1';
                } catch { /* shell torn down mid-fade — nothing to reveal */ }
            };
            fadeInSiteAuthoringPanes = () => { setTimeout(revealNow, 0); };
            fadeInSiteAuthoringPanes();
        } catch (e) {
            console.warn('[gis][panes] §22 fade-in setup failed (non-fatal, split still mounts):', e);
        }

        // ── MapLibre mounter (LEFT pane) — the 2D draw/select surface ──
        const mapMounter: PaneRendererMounter = {
            rendererKind: 'maplibre',
            mount: (paneEl) => { startBoundaryDraw({ parent: paneEl }); },
            // §MAP-IS-A-SINGLETON-TOO (L-12992) — a pane-to-pane MOVE is not a departure.
            // `unmount` below DISPOSES (that is how the map goes away at generate-time), so
            // without this a move destroyed the map and rebuilt it in the other pane: tiles
            // refetched, the in-progress boundary lost, and the draw watchdog left spinning on
            // a readiness stamp the disposer had cleared. `PaneHost` calls this instead.
            relocate: (paneEl) => {
                if (map2dHandle) map2dHandle.reparentTo(paneEl);
                else startBoundaryDraw({ parent: paneEl }); // never opened / already disposed.
            },
            isPlacedIn: (paneEl) => map2dHandle?.isPlacedIn(paneEl) ?? false,
            unmount: () => { if (map2dHandle) { try { map2dHandle.dispose(); } catch { /* gone */ } map2dHandle = null; } },
            // MapLibre auto-reflows via its own ResizeObserver (trackResize:true) — but that
            // observer only fires when the BOX changes, and a re-parent between two equally
            // sized panes does not change it. One explicit `map.resize()` costs nothing and
            // removes the case where it would not have fired at all.
            resize: () => { try { map2dHandle?.resize(); } catch { /* gone */ } },
        };

        // ── Cesium mounter (RIGHT pane) — the ONE 3D Site viewer, RE-TARGETED ──
        const cesiumMounter: PaneRendererMounter = {
            rendererKind: 'cesium',
            mount: async (paneEl) => {
                // §L-433 (founder 2026-07-20: "the Forma 3D-Site view takes too long to trigger")
                // — put the SHARED loading overlay up SYNCHRONOUSLY, before any await.
                //
                // ROOT CAUSE this fixes: `engageFormaCesium` opens a loading session via
                // `startViewActivationLoading('site', …)`, but THIS pane mounter — the path the
                // onboarding site-authoring split actually takes — constructed Cesium directly
                // (toggleGIS + awaitCesiumReady) and so bypassed the overlay producer entirely.
                // The result was a dead BLACK pane for the whole viewer-construct + tile-stream
                // window, with no spinner, no progress and no explanation. A black pane with no
                // affordance reads as a crash, which is why this was reported as "too long"
                // rather than "still loading": the wait was invisible, not merely slow.
                //
                // Reuses the EXISTING readiness chain (viewer ready → tiles → placement →
                // ground settled) and the ONE shared overlay — no new component, no timer, and
                // the L-270 stall watchdog still guarantees it can never spin forever.
                const paneActivation = startViewActivationLoading('site', () => {
                    // Retry = re-run this mount against the same pane element.
                    void containViewActivation(
                        () => { void cesiumMounter.mount?.(paneEl); },
                        (m) => activeViewActivation?.fail(m),
                        'The 3D Site pane failed to open',
                    );
                });
                // Ensure the single Cesium viewer is constructed + visible. toggleGIS
                // mounts it lazily into #container on first use; we then MOVE its one
                // container node into the right pane (no second viewer). Suppress the
                // re-activation self-place (we render our own massing below).
                gisReactivationSelfPlaceSuppressed = true;
                try { toggleGIS(true); }
                catch (e) {
                    console.error('[gis][panes] toggleGIS threw:', e);
                    // Never leave the overlay spinning on a hard failure — surface it with the
                    // retry/continue escape actions instead of a permanent spinner.
                    paneActivation.fail(`The 3D Site failed to open: ${String((e as Error)?.message ?? e)}`);
                }
                finally { gisReactivationSelfPlaceSuppressed = false; }
                await awaitCesiumReady();
                if (!cesiumViewport) {
                    console.warn('[gis][panes] Cesium never constructed — right pane empty.');
                    paneActivation.fail('The 3D Site viewer could not be constructed.');
                    return;
                }
                // RE-TARGET the single #cesium-viewport-container into the RIGHT pane.
                cesiumViewport.reparentContainerTo?.(paneEl);
                cesiumViewport.setVisible?.(true);
                cesiumViewport.reparentContainerTo?.(paneEl); // reflow now it is visible.
                // Force the Forma massing-study look + render the boundary/envelope in
                // place (no re-fly). The pane-aware live-update keeps it fresh on draw.
                cesiumViewport.setFormaMode?.(true);
                window.pryzmSetCesiumFormaMode?.(true);
                formaViewMode = '3d';
                // §L-412 (Req 2) — if a boundary is ALREADY committed (re-entering site
                // authoring with an existing plot), FRAME the pane to it ONCE now so the
                // user lands on THEIR plot, not the whole city; otherwise render the
                // (empty) scene in place and let the first parcel commit frame it. Either
                // way exactly one frame — subsequent live-updates use the no-re-fly path.
                const committedCentroid = ringCentroidXZ(getFormaBoundary());
                if (siteAuthoringPaneLastFramedCentroid === null && committedCentroid) {
                    siteAuthoringPaneLastFramedCentroid = committedCentroid;
                    renderFormaMassing(true);
                } else {
                    renderFormaMassing(false);
                }
                mountFormaAnalysis();
                // §L-433 — the placement has been ISSUED, so the readiness chain may now await
                // the ground clamp. Without this the overlay would wait on a signal that is
                // never armed and only the stall watchdog would end it — turning a slow load
                // into a visible error. This is the same handshake `engageFormaCesium` makes.
                paneActivation.contentIssued();
            },
            // §PANE-PLACEMENT-AFTER-MODE-SWITCH (L-12988) — MOVE the ONE viewer between panes
            // without re-running the whole activation. `reparentContainerTo` is already the
            // §L-412 re-target primitive ("single Cesium re-targeted; no new viewer"); this
            // just names it as the relocation verb so a pane-to-pane move never goes through
            // unmount (which hides the viewer and restores the BIM canvases) and back.
            relocate: (paneEl) => {
                if (!cesiumViewport) { void cesiumMounter.mount?.(paneEl); return; }
                cesiumViewport.reparentContainerTo?.(paneEl);
                cesiumViewport.setVisible?.(true);
                cesiumViewport.reparentContainerTo?.(paneEl); // reflow now it is visible.
            },
            // A READING off the document, never a memory — see `CesiumViewport.isContainerIn`.
            isPlacedIn: (paneEl) => cesiumViewport?.isContainerIn?.(paneEl) ?? false,
            unmount: () => {
                // §L-433 — leaving the pane mid-load must not strand the overlay over an empty
                // right pane; cancel restores input and dismisses it.
                try { activeViewActivation?.cancel('site-authoring pane unmounted'); }
                catch { /* advisory */ }
                // Re-home the single viewer back to #container + hide it (never disposed).
                const host = document.getElementById('container');
                if (host) { try { cesiumViewport?.reparentContainerTo?.(host); } catch { /* gone */ } }
                try { cesiumViewport?.setVisible?.(false); } catch { /* gone */ }
            },
            resize: () => { try { cesiumViewport?.reflowContainer?.(); } catch { /* gone */ } },
        };

        shell.controller.registerMounter(mapMounter);
        shell.controller.registerMounter(cesiumMounter);

        // ── Canvas2D plan mounter (EITHER pane) — §C59 Phase 2 ──
        // Makes `bim-plan-2d` a real pane view, so the per-pane picker can put the plan
        // next to (or instead of) the 3D Site: the founder's "3D Site available from plan
        // view and vice versa". It DRIVES the existing SplitViewManager plan renderer and
        // re-parents its pane node — no second plan surface (C59 §0/§3).
        shell.controller.registerMounter(
            createSvpPlanPaneMounter(
                () => (window.splitViewManager as SplitViewManagerLike | null | undefined) ?? null,
            ),
        );

        // Apply the founder default THROUGH the view-state store (left=2d-map,
        // right=3d-site). §C59 Phase 2 invariant 3: the STORE is the single write path —
        // calling `controller.applyLayout` here would land the layout on the renderers but
        // leave the store (and therefore every pane's view picker) showing something else.
        // ════════════════════════════════════════════════════════════════════
        // §ONBOARDING-STEP-PINS-ITS-SURFACE (L-10720) — the 2D map may not be evicted
        // while the guided setup flow is what the user is doing.
        //
        // THE DEFECT (founder 2026-08-24, at "STEP 2 OF 4 · DRAW YOUR PLOT"): one click
        // on `◉ 3D Site` soloed the right pane, `mapMounter.unmount()` below disposed
        // the MapLibre map he was drawing on — `[gis] map2d: disposed` — and the wizard
        // sat on `draw idle tick — waiting` forever, because its readiness stamp
        // (`window.pryzmBoundaryDrawSurfaceReadyAt`) is deleted by that disposer and
        // nothing in the flow could ask for the map back. A DEAD END, one click deep,
        // in the primary onboarding path. See `PaneLayoutStore.pinView` for the full
        // finding and for why the rule is "may not be VACATED" rather than either
        // "keep it hidden" or "disable the view controls".
        //
        // ⭐ THE PHASE IS THE DRIVER, NOT A NEW FLAG. `AppPhase` already means exactly
        // "is there a BIM canvas yet, or is the user still in the guided globe flow"
        // (`panelDefaults.ts`), it is already declared at the open gesture (§L-1186),
        // and it already gates panel defaults and element authoring. C06 §10.7 records
        // that it gates the engine boot nowhere; this extends the SAME concept to the
        // pane layout rather than minting a second onboarding state.
        //
        // ⚠ The pin only refuses a DISPATCH. Shell teardown (`unmountSiteAuthoringPanes`
        // at generate-time, project close) does not dispatch, so the normal end of the
        // flow is untouched — verified in `onboardingDrawSurfaceNotEvictable.spec.ts`.
        try {
            if (appPhase() === 'onboarding-globe') {
                const release = shell.store.pinView(
                    'site-map-2d',
                    'The 2D site map is where you draw your plot — it stays on screen until you '
                    + 'have drawn one or skipped drawing. The 3D Site is live beside it.',
                );
                // Released the moment the guided flow ends (the wizard's `dispose()` is
                // the ONE place that sets `'canvas'`), so nothing about the editor's
                // normal pane behaviour is changed by this.
                const unsubPhase = onAppPhaseChanged(() => {
                    if (appPhase() !== 'onboarding-globe') { release(); unsubPhase(); }
                });
            }
        } catch (e) {
            console.warn('[gis][panes] §ONBOARDING-STEP-PINS-ITS-SURFACE pin failed (non-fatal — the split still mounts):', e);
        }

        // §PANE-DEFAULT-IS-PLAN-LEFT (L-12988, founder: *"it should initially the plan view to
        // the left and 3d site to right"*). The OPENING is the caller's — onboarding needs the
        // 2D draw map on the left, the Parcel Law tab needs the plan — and both are declared in
        // the pure model rather than spelled out here (`paneLayoutForPreset`).
        const layout = paneLayoutForPreset(preset);
        const applied = shell.store.dispatch({ type: 'view.pane.set-layout', layout });
        if (!applied.ok) {
            console.error('[gis][panes] default layout rejected — tearing the split down:', applied.rejected);
            unmountSiteAuthoringPanes();
            return false;
        }
        applied.pending?.catch((err) => console.error('[gis][panes] layout apply (async) failed:', err));
        console.log(
            `[gis][panes] §L-412 site-authoring split mounted ('${preset}') — LEFT ` +
            `${layout.left ?? 'empty'} · RIGHT ${layout.right ?? 'empty'} ` +
            '(single Cesium re-targeted; envelope live on draw/select).',
        );
        refreshSiteSplitLauncher(); // L-13001 — the corner control follows the split.
        return true;
    };

    // ══════════════════════════════════════════════════════════════════════════
    // §AFTER-LOCATION-LAND-ON-THE-PASTEL-MAP (L-13001) — THE SPLIT ICON, BOTTOM-LEFT,
    // AT THE SITE PHASE.
    //
    // Founder 2026-09-06, about the step right after a location resolves: *"i want to have
    // the split view icon (as we have in pryzm view interface, on the bottom left corner,
    // to activate split view)"*.
    //
    // ⭐ WHY A SECOND CONTROL IS NOT A RIVAL HERE, and this is the part to read before
    // "consolidating" it with `#svp-toggle-button`:
    //   · `#svp-toggle-button` (initUI) toggles the LEGACY `splitViewManager` — BIM 3D +
    //     floor plan. During site authoring that pane has no walls to draw, which is why
    //     `mountSiteAuthoringPanes` calls `suppressAutoOpen()` on it (§L-412 Req 1). Wiring
    //     the founder's corner to it at this phase would hand him the blank right-hand pane
    //     L-13000 was raised about.
    //   · THEY ARE NEVER ON SCREEN TOGETHER. That button belongs to the `launcher-rail`
    //     row, which is `absent` on the globe and `open` on the canvas; this pill exists
    //     only while that row is absent. Slot 0 (§FIX-LAUNCHER-COVERS-SPLITVIEW / L-159,
    //     C06 §7.2) is therefore never double-booked — by construction, not by placement.
    //   · NO SECOND OPTION TABLE AND NO SECOND LAYOUT OWNER: it dispatches the two DECLARED
    //     entry points (`pryzmMountSiteAuthoringPanes` / `pryzmUnmountSiteAuthoringPanes`),
    //     the same pair the on-view bar's `.vsw-split` and onboarding both drive, and it
    //     renders the SAME pure `describeSplitToggle` they do.
    //   · IT READS, IT DOES NOT REMEMBER. "Is the split up?" is answered from
    //     `siteAuthoringPanes`, the live handle — never from a snapshot, which is the
    //     C84 EI-1b failure this repo pays for most.
    // ══════════════════════════════════════════════════════════════════════════
    const SITE_SPLIT_LAUNCHER_ID = 'pryzm-site-split-launcher';
    let siteSplitLauncher: HTMLButtonElement | null = null;

    const paintSiteSplitLauncher = (): void => {
        if (!siteSplitLauncher) return;
        const shown = describeSplitToggle({
            open: !!siteAuthoringPanes && !siteAuthoringPanes.isDisposed,
            canOpen: typeof window.pryzmMountSiteAuthoringPanes === 'function',
            canClose: typeof window.pryzmUnmountSiteAuthoringPanes === 'function',
        });
        siteSplitLauncher.disabled = !shown.enabled;
        siteSplitLauncher.title = shown.title;
        siteSplitLauncher.setAttribute('aria-pressed', shown.pressed ? 'true' : 'false');
        siteSplitLauncher.style.opacity = shown.enabled ? '1' : '0.42';
        siteSplitLauncher.style.background = shown.pressed ? '#6600FF' : '#ffffff';
        siteSplitLauncher.style.color = shown.pressed ? '#ffffff' : '#6600FF';
    };

    /** Remove the pill. Idempotent — the canvas phase and a dispose both call it. */
    const removeSiteSplitLauncher = (): void => {
        siteSplitLauncher?.remove();
        siteSplitLauncher = null;
    };

    const refreshSiteSplitLauncher = (): void => {
        try {
            if (!shouldMountSiteSplitLauncher({
                onboardingGlobePhase: appPhase() === 'onboarding-globe',
                siteCommitted: siteCommittedInModel(),
            })) {
                removeSiteSplitLauncher();
                return;
            }
            if (siteSplitLauncher?.isConnected) { paintSiteSplitLauncher(); return; }
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.id = SITE_SPLIT_LAUNCHER_ID;
            btn.setAttribute('data-testid', SITE_SPLIT_LAUNCHER_ID);
            btn.setAttribute('aria-label', 'Toggle split view');
            // The same two-panel mark as `#svp-toggle-button` — one chrome language
            // (C06 §6.1); the founder recognises the corner by its icon.
            btn.innerHTML = '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" aria-hidden="true">'
                + '<rect x="1" y="1" width="5.5" height="14" rx="1" fill="currentColor" opacity="0.55"/>'
                + '<rect x="9.5" y="1" width="5.5" height="14" rx="1" fill="currentColor" opacity="0.9"/>'
                + '<line x1="8" y1="1" x2="8" y2="15" stroke="currentColor" stroke-width="1" stroke-dasharray="2 1"/>'
                + '</svg>';
            Object.assign(btn.style, {
                ...launcherRailStyle('splitView'),
                ...LAUNCHER_PILL_COSMETICS,
                pointerEvents: 'auto',
            } satisfies Partial<CSSStyleDeclaration>);
            btn.addEventListener('click', () => {
                if (btn.disabled) return;
                try {
                    if (siteAuthoringPanes && !siteAuthoringPanes.isDisposed) {
                        window.pryzmUnmountSiteAuthoringPanes?.();
                    } else {
                        window.pryzmMountSiteAuthoringPanes?.({ layout: 'site-authoring' });
                    }
                } catch (e) {
                    console.warn('[gis][panes] site split pill dispatch failed (non-fatal):', e);
                }
                // Re-observe rather than assume: a control that PAINTED its own click would
                // be asserting a layout it never checked (the L-13002 lesson, one layer up).
                paintSiteSplitLauncher();
            });
            document.body.appendChild(btn);
            siteSplitLauncher = btn;
            paintSiteSplitLauncher();
            console.log(
                '[gis][panes] §AFTER-LOCATION-LAND-ON-THE-PASTEL-MAP (L-13001) — bottom-left split '
                + 'pill mounted for the SITE phase (launcher-rail slot 0; the legacy '
                + '#svp-toggle-button owns that slot on the canvas and the two are never both up).',
            );
        } catch (e) {
            console.warn('[gis][panes] site split pill refresh failed (non-fatal):', e);
        }
    };

    /** Tear the split down: unmounts both renderers (Cesium re-homes to #container +
     *  hides; the map disposes) and removes the pane DOM. Idempotent. */
    const unmountSiteAuthoringPanes = (): void => {
        if (!siteAuthoringPanes) return;
        fadeInSiteAuthoringPanes = () => { /* nothing mounted */ };
        try { siteAuthoringPanes.dispose(); } catch (e) { console.warn('[gis][panes] dispose failed:', e); }
        siteAuthoringPanes = null;
        siteAuthoringPaneLastFramedCentroid = null;
        // §L-412 (Req 1) — site authoring ended: re-allow the legacy plan pane's
        // project-load auto-open for the BIM authoring stage (applyBimDualPane also
        // explicitly re-activates the plan pane at generate-time). We do NOT re-open it
        // here — only lift the suppression so the normal editor layout can return.
        try {
            const svp = window.splitViewManager as
                | { allowAutoOpen?: () => void } | undefined;
            svp?.allowAutoOpen?.();
        } catch (e) {
            console.warn('[gis][panes] §L-412 SVP allowAutoOpen failed (non-fatal):', e);
        }
        // Re-home the envelope card onto #container (getForma3dHostEl now returns it).
        try { refreshEnvelopePanel(); } catch { /* best-effort */ }
        // L-13001 — the pill STAYS (it is the route BACK to split; removing it here would
        // be L-6804's one-way door), but it must repaint to the unpressed state.
        refreshSiteSplitLauncher();
    };

    // O.2 / §L-412 — programmatic entry to the site-authoring split. The onboarding
    // site step + the GIS-rail launcher call this so entering the site lands directly
    // in 2D-left / 3D-right (the "Generate house?" confirm stays a SEPARATE choice,
    // never a blocker to seeing the site). Registered globally (typed in globals.d.ts).
    window.pryzmMountSiteAuthoringPanes = (opts) => {
        // §SITE-CHECK-RUNS-BEFORE-THE-SITE-IS-ANCHORED (L-13002) — FORWARD THE OUTCOME. The
        // §22 reveal reports what it actually did from this value; a swallowed `void` is how
        // a refused mount got logged as a successful one for a whole release.
        try { return mountSiteAuthoringPanes(opts?.layout ?? 'site-authoring'); }
        catch (e) {
            console.error('[gis][panes] pryzmMountSiteAuthoringPanes failed:', e);
            return false;
        }
    };
    // §22 (PRD §17.4) — bring the just-mounted split in with a CSS opacity transition. Called by
    // the onboarding reveal sequence as its LAST step (presentation only — it never gates
    // anything, and the mount schedules the same one-shot itself as a safety net).
    window.pryzmFadeInSiteAuthoringPanes = () => {
        try { fadeInSiteAuthoringPanes(); }
        catch (e) { console.warn('[gis][panes] §22 pryzmFadeInSiteAuthoringPanes failed (non-fatal):', e); }
    };
    window.pryzmUnmountSiteAuthoringPanes = () => {
        try { unmountSiteAuthoringPanes(); }
        catch (e) { console.error('[gis][panes] pryzmUnmountSiteAuthoringPanes failed:', e); }
    };

    // ════════════════════════════════════════════════════════════════════════
    // §PANE-PLACEMENT-AFTER-MODE-SWITCH (L-12988, founder 2026-09-06: *"after selecting
    // analyse → parcel law → then author the right hand side gets corrupted"*, with the 3D
    // Site filling the LEFT half and the RIGHT half blank white).
    //
    // ⭐ WHY THE MODE SWITCH IS THE TRIGGER, AND WHY THIS IS ONE PASS AND NOT A LISTENER
    // THAT DOES WORK. A workspace mode change re-writes `#container`'s box — three writers,
    // no protocol between them (`WorkspaceController._applyLayout`'s `'50%'`/`''`,
    // `SplitViewManager._buildDOM`'s `'60%'`, and `halfCanvasResizer`'s dragged fraction;
    // see that file's header for the measurement). The split shell lives INSIDE that box, so
    // every pane's geometry moves underneath whatever mount happened to be in flight — and a
    // Cesium mount is async, so one routinely is. The founder's trace is that exact shape:
    // `reparentContainerTo #container` … then, 4.8 s later, `reparentContainerTo
    // #pryzm-pane-right` — a mount resolving into a layout that had already changed, with
    // nothing to look again afterwards.
    //
    // So this asks ONE question at the END of the transition: is each renderer in the pane
    // the STORE says owns it? It corrects only a positively-reported mismatch, through
    // `relocate` where the mounter has one — never a re-mount, never a second viewer
    // (§L-412's constraint is unchanged and is what makes this safe to run on every switch).
    // The pass is coalesced onto one frame by the shell, so a burst of mode/resize events in
    // one transition costs one pass.
    // ════════════════════════════════════════════════════════════════════════
    try {
        onRuntimeEvent('pryzm-workspace-mode', () => {
            if (!siteAuthoringPanes || siteAuthoringPanes.isDisposed) return;
            siteAuthoringPanes.reassertPlacement();
        });
    } catch (e) {
        console.warn('[gis][panes] §PANE-PLACEMENT-AFTER-MODE-SWITCH subscribe failed (non-fatal):', e);
    }

    // ── §L-676-B (C13 §3.10) — THE MISSING OWNER ────────────────────────────────
    //
    // ROOT CAUSE OF THE SURVIVING SESSION. L-676 gave the GIS half three owners
    // (`site.model`, `site.dispatch`, `site.neighbourFootprints`) plus a fourth
    // inside `CesiumViewport` (`gis.cesiumViewport`). It gave NONE to THIS file —
    // and a grep for `projectScopeRegistry` / `pryzm-project-switch` /
    // `bim-project-cleared` across `GISAreaLayout.ts` returned zero before this
    // block. Every `let` above is closure state of a function called ONCE per tab,
    // so all of it outlives a project switch, unowned and unaudited:
    //
    //   • `lastGeocodeFrame` — THE stale lat/lon the founder saw. `getSiteOrigin()`
    //     resolves `resolveSiteFrameOrigin(getCurrentSiteOrigin(), storeLoc,
    //     lastGeocodeFrame)`. On the new project the first two are correctly null
    //     (`siteDispatch` IS reset, `site=NULL` in the loader diag) — so the ONLY
    //     surviving source of `lat=41.38258 lon=2.17707` was this variable, and
    //     `reframeSiteIn3D()` then flew the camera straight back to Barcelona
    //     AFTER the C13 teardown had correctly cleared the viewport.
    //   • `isGisInitialized` — why the log says "Re-activating existing Cesium
    //     viewer" instead of mounting fresh.
    //   • `isBimPlacedOnEarth`, `globeRealPlaced/LastSig`, `formaRealPlaced/LastSig`
    //     — Project A's placement caches, which make Project B's placement path
    //     short-circuit ("geometry unchanged — reusing placed real model").
    //   • `siteAuthoringPaneLastFramedCentroid`, `gisReactivationSelfPlaceSuppressed`
    //     — per-project framing/placement latches.
    //
    // The viewer itself is deliberately NOT destroyed here (that stays
    // `CesiumViewport`'s decision, and its `resetProjectScopedState('project-switch')`
    // now also re-homes the camera and resets the render mode). What this owner
    // guarantees is that nothing in THIS file can re-seed it with Project A's data.
    let _layoutOwningProjectId: string | null = null;
    const noteLayoutOwner = (): void => {
        try {
            const rt = runtime ?? ((typeof window !== 'undefined')
                ? (window.runtime as unknown as PryzmRuntime | undefined) ?? null : null);
            const pid = rt ? resolveActiveProjectId(rt) : null;
            if (typeof pid === 'string' && pid.length > 0) _layoutOwningProjectId = pid;
        } catch { /* ownership stamping must never break the GIS layout */ }
    };

    /** The per-project closure state this layout holds, or null when it holds none. */
    const describeLayoutProjectState = (): Record<string, unknown> => ({
        lastGeocodeFrame: lastGeocodeFrame ? { ...lastGeocodeFrame } : null,
        isGisInitialized,
        isBimPlacedOnEarth,
        globeRealPlaced,
        formaRealPlaced,
        siteAuthoringPaneLastFramedCentroid: siteAuthoringPaneLastFramedCentroid
            ? { ...siteAuthoringPaneLastFramedCentroid } : null,
        gisActive: _gisActive,
    });

    const layoutHoldsProjectState = (): boolean => (
        lastGeocodeFrame !== null ||
        isBimPlacedOnEarth ||
        globeRealPlaced ||
        formaRealPlaced ||
        globeRealLastSig !== null ||
        formaRealLastSig !== null ||
        siteAuthoringPaneLastFramedCentroid !== null
    );

    const clearLayoutProjectState = (): void => {
        // THE fix for the founder's stale lat/lon: no project may inherit another
        // project's geocode frame.
        lastGeocodeFrame = null;
        isBimPlacedOnEarth = false;
        gisReactivationSelfPlaceSuppressed = false;
        globeRealLastSig = null;
        globeRealPlaced = false;
        formaRealLastSig = null;
        formaRealPlaced = false;
        siteAuthoringPaneLastFramedCentroid = null;
        // A 2D boundary-draw map authored against Project A must not survive into B.
        // Independently guarded: a throwing map teardown must not skip the rest.
        try { closeBoundaryMap2D(); }
        catch (e) { console.warn('[gis] §L-676-B closeBoundaryMap2D during project teardown failed (non-fatal):', e); }
        try { boundaryTool?.cancel(); }
        catch (e) { console.warn('[gis] §L-676-B boundaryTool.cancel during project teardown failed (non-fatal):', e); }
        _layoutOwningProjectId = null;
        console.log('[gis] §L-676-B GIS layout project scope cleared (geocode frame + placement caches dropped).');
    };

    // ADR-0298 §2 — hand this mount's closure state to the MODULE-SCOPE owner + probe
    // registered at the top of this file. Registration itself no longer happens here,
    // so it can no longer be skipped by an early return: the module registered at
    // import time, and what changes here is only WHICH closure it speaks for.
    //
    // A second `mountGISArea` replaces the delegate, exactly as the second
    // `register()` used to replace the first — but now the replacement is visible as a
    // single assignment rather than buried in registry key semantics.
    _gisLayoutDelegate = {
        clear: clearLayoutProjectState,
        owningProjectId: () => (layoutHoldsProjectState() ? _layoutOwningProjectId : null),
        describe: describeLayoutProjectState,
    };

    return { toggleGIS, flyToCremornePoint, placeBimOnEarth, activateView, gizmoMode, startBoundaryDraw, cancelBoundaryDraw };
}
