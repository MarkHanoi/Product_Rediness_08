// A.8.c.f — Hektar-style 2D top-down boundary-draw map (MapLibre GL JS).
//
// WHAT THIS IS
// ------------
// The founder's spec replaces the Cesium-3D-globe DRAW surface (SiteBoundaryDrawTool)
// with an elegant 2D PLAN-VIEW map for authoring the parcel boundary, while KEEPING
// Cesium 3D-tiles for the rendered/visualised result. This module mounts a full-
// surface MapLibre map (cream/shadow "Hektar" basemap — see siteMap2DStyle.ts),
// centres it on the geocoded site location, lets the user draw a polygon with the
// mouse, and on close reuses the EXISTING projection + dispatch path:
//
//     drawn lat/lon ring → buildBoundaryFromLatLonRing (boundaryProjection.ts)
//                        → dispatchParcelBoundary (siteDispatch.ts)
//                        → site.setParcelBoundary  (same as SiteBoundaryDrawTool)
//
// So drawing on the 2D map sets the SAME C19 parcel boundary the apartment
// generator consumes (`generateApartmentFromBoundary`). After commit the overlay
// closes and the user can switch to the Cesium 3D view for the rendered result.
//
// DRAW UX (hand-rolled, keyless — no terra-draw dependency for the first cut)
// ---------------------------------------------------------------------------
//   - click          → add a vertex
//   - double-click   → close the loop + commit
//   - Enter          → close the loop + commit
//   - Esc            → cancel (close overlay, no boundary)
//   - drag a handle  → move that vertex (live re-project on commit)
// The in-progress ring + vertex handles render in PRYZM violet (#6600FF) via a
// GeoJSON source updated on every edit.
//
// LAYERING (L7 editor UI): imports `maplibre-gl` (the only site of that dependency),
// the pure projection core (boundaryProjection), and the shared dispatch helper
// (siteDispatch). No THREE / Cesium import — the 2D draw surface is fully
// independent of the Cesium viewer.

import maplibregl, {
    Map as MapLibreMap,
    Marker as MapLibreMarker,
    type MapMouseEvent,
    type StyleSpecification,
    type GeoJSONSource,
} from 'maplibre-gl';
// MapLibre control/attribution chrome. Vite bundles this CSS at the import site;
// it is the canvas controls' baseline styling (the Hektar look is layered on top
// via the cream style + our violet GeoJSON layers).
import 'maplibre-gl/dist/maplibre-gl.css';
import type { PryzmRuntime } from '@pryzm/runtime-composer';
import {
    buildBoundaryFromLatLonRing,
    parcelFrameOrigin,
    latLonToSceneXZ,
    sceneXZToLatLon,
    type LatLon,
} from '../site/boundaryProjection.js';
// §MAP2D-ENVELOPE (STR-RESIDENTIAL-DESIGN-ORCHESTRATOR §26.4 / C58 §1.14 / L-1188) — the buildable
// envelope on the 2D site map. Founder: *"the envelope renders great on pryzm view — but on 3d site
// vie not on 2d map view"*. Three surfaces now draw the SAME `MassingSolid[]` the pure L2
// `envelopeToMassing` produced — the Cesium globe (§ENVELOPE-VIA-MASSING), the three.js BIM/plan
// scene (`ParcelBoundarySceneRenderer.buildEnvelopeVolume`) and this map — so none of them can
// re-derive geometry or a height of its own (§1.14.2: the rasteriser never re-derives).
import { applyEnvelopeVisibilityAxes, envelopeDrawMode, type MassingSolid } from '@pryzm/site-parcel-data';
// ⭐ §ENVELOPE-ONE-VISIBILITY (L-1170) / §ENVELOPE-TWO-AXES (C58 §1.17 / L-1188) — the ONE authority
// for "should the envelope be on screen?", read at THIS rasteriser and never at the caller (C84
// EI-1). Same import pair `CesiumViewport` uses.
import { getBuildableEnvelopeAxes, subscribeBuildableEnvelopeVisibility } from '../site/envelopeVisibility.js';
// §ENVELOPE-CONFIDENCE-COLOUR (L-608) / §L-619 — the ONE colour table. A hue is C58 §1.2's
// CONFIDENCE BADGE, so this surface maps `MassingSolid.style.hue` through the same three constants
// the globe and the flat card map it through, and mints no colour of its own.
import {
    CONFIDENT_VIOLET_CSS,
    PROVISIONAL_GREY_CSS,
    SUGGESTED_AMBER_CSS,
} from '../site/envelopeRenderStyle.js';
// §L-430 slice 2b / ADR-0115 — the scene-XZ (PROJECT frame) → ENU (TRUE frame) boundary. THE one
// place authored scene coordinates cross into the world frame; see `sceneEnuFrame.ts`'s header for
// why writing `east = x, north = -z` inline is the bug it exists to prevent.
import { sceneXZToEnu } from './sceneEnuFrame.js';
// §ENVELOPE-DRAW C6 (L-13050) — the envelope-perimeter draw adapter for THIS surface, and the
// registry the create panel's Draw button arms. ⛔ The adapter binds no map event; see its header.
import { SiteEnvelopeDrawMap2D, type EnvelopeDrawMapLike } from '../site/siteEnvelopeDrawMap2D';
import { registerEnvelopeDrawSurface } from '../site/siteEnvelopeDrawArming';
// ⭐ §PARCEL-VISIBLE-EVERYWHERE (L-13016, founder 2026-09-06) — THE SECOND SUBSCRIBER.
//
// Founder: *"When a parcel is selected, the parcel should be HIGHLIGHTED no matter the view
// selected … I went into a single view — 2D site view — and the parcel was NOT highlighted,
// although the data was on the right hand side."* Measured 2026-09-06, `siteGeometryHighlight`
// had exactly ONE subscriber repo-wide (`ParcelBoundarySceneRenderer`, registering as `'BIM 3D'`)
// and `grep -c siteGeometryHighlight` in THIS file returned 0 — so on the surface he was looking
// at, a click on "Area" repainted the row's ◉ and changed nothing. This is that subscription.
//
// ⛔ THE EMPHASIS RULE LIVES IN THAT MODULE, NOT HERE, and it is one-directional: everything that
// is NOT the subject RECEDES; the subject is never brightened and its hue never changes. Boosting
// a provisional envelope to "highlight" it would make an estimate read as a determination — §L-616
// re-introduced by a UI affordance. `SITE_HIGHLIGHT_RECEDE_FACTOR` is a MULTIPLIER on the AUTHORED
// alpha for exactly that reason, so a near-wireframe upper-bound shell can never come out denser
// while receding than it was authored.
import {
    getSiteHighlight,
    subscribeSiteHighlight,
    registerSiteHighlightSurface,
    siteHighlightCue,
    siteHighlightEmphasis,
    SITE_HIGHLIGHT_RECEDE_FACTOR,
    // §26.6 rule 2 (L-13046) — the two cues that answer `Bounding box` and a setback-register edge.
    boundingBoxRingXZ,
    parseEdgeHighlightSubject,
    // §26.6.4 (L-13046) — the cue that answers a rooms-per-level row.
    parseRoomHighlightSubject,
    type SiteHighlightRole,
} from '../site/siteGeometryHighlight.js';
// §ROOMS-ON-THE-VIEWS (§26.6.4) — the ONE read of a room's detected outline, shared with the BIM
// scene and the globe so the three views cannot light three different shapes for one row.
import { resolveRoomOutline } from '../site/roomOutlineSource.js';
// ⭐ §MASSING-ON-THE-SITE-VIEWS (L-13022 · STR §26.6.3, lane DRAW-ON-VIEWS 2026-09-07) — THE MASSING
// CANDIDATE THE FOUNDER PICKED, ON THE VIEW HE IS ON.
//
// Measured gap: `grep -c targetFootprintAreaState SiteBoundaryMap2D.ts` returned **0**. The plate
// drew only in the THREE plan/BIM scene, so on the 2D Site Map — the view a plan comparison
// actually happens in — picking an option changed the card and nothing on the ground.
// [[authored-but-unwired-is-the-bottleneck]]: audit REACHABILITY, not existence.
//
// ⛔ ONE SLOT, SO ONE PLATE. `resolveLiveProposedPlate` reads the SAME single session slot the BIM
// scene and the globe read, through the SAME staleness gate, so "only one massing renders at a
// time" is a property of the data, not a rule this map has to enforce. Never
// `getTargetFootprintProposal()` here — that read skips the gate.
import { resolveLiveProposedPlate } from '../site/liveProposedPlate.js';
import { subscribeTargetFootprintProposal } from '../site/targetFootprintAreaState.js';
// The ONE owner of the to-be-built envelope's colour. ⛔ No second style table, and deliberately
// OUTSIDE the C58 §5.2 confidence family (violet solved / grey estimated / amber unreviewed) and
// outside the study teal: this plate is the user's INTENT, not a claim about what the law permits.
import {
    TO_BE_BUILT_FILL_CSS,
    TO_BE_BUILT_INK_CSS,
    TO_BE_BUILT_GROUND_FILL_ALPHA,
} from '../site/toBeBuiltEnvelopeStyle.js';
// §PARCEL-VISIBLE-EVERYWHERE — the ONE scene-XZ → WGS84 read for the committed C19 ring, shared
// with `GISAreaLayout.getMapInitial` so the picture and the camera cannot be built about different
// origins. Three arms: a ring, an honest `absent`, or a REFUSAL that says why (never an empty).
import { readCommittedParcelRing } from '../site/committedParcelRing.js';
// §ENVELOPE-TOOL-ON-THE-SITE-VIEWS (L-13017 · C58 §1.19) — the tool BUTTON only. The panel it
// opens holds the creation logic, and that panel is the SAME one the Parcel Law tab mounts, so
// this file carries no command string, no id minting and no second authoring path (P6).
import { buildSiteEnvelopeToolButton, closeSiteEnvelopeTool } from '../site/siteEnvelopeTool.js';
// §PARCEL-VISIBLE-EVERYWHERE (b) — "zoom in relatively on it". The ONE site extent both panes
// frame; its FIRST preference is the committed boundary, which is precisely what `getMapInitial`
// was never passing (it framed the ±250 m default about the site anchor — a 500 m box around a
// 107.9 × 44.1 m plot).
import { resolveSiteFramingExtent } from '../site/siteFramingExtent.js';
// §PARCEL-VISIBLE-EVERYWHERE — the frontage cue reads the SAME three-arm determination the card's
// frontage clause and the highlight-availability rule read. Re-deriving "which edges are front"
// here would be a second answer to a question that already has an owner, and the copy that DRAWS
// would win silently.
import {
    determineParcelEdgeClassifications,
    FRONT_EDGE,
} from '../site/parcelEdgeClassificationDetermination.js';
import { getLastBuildableEnvelope } from '../site/siteDispatch.js';
// §SPACE-ENVELOPE-ON-2D-MAP (L-13017) — the ONE appearance authority for an AUTHORED envelope
// (colour · opacity · label), shared with the Cesium and THREE rasterisers. ⛔ Never re-derive a
// hue here: the §TOBE-ENVELOPE ruling deliberately moved the level envelope OFF the confident
// violet C58 §1.2 reserves for a determination, and a second copy would drift from that.
import { resolveSpaceEnvelopeAppearance } from '../../engine/spaceEnvelopeAppearance.js';
import type { DirtySpaceEnvelopeStore } from '../../engine/attachSpaceEnvelopeRender.js';
import { resolveSiteContext, dispatchParcelBoundary, dispatchSiteLocation, dispatchSiteTrueNorth, dispatchClearParcelBoundary, canCommitParcelBoundary } from '../site/siteDispatch.js';
// §L-536-THETA-RESET — the SAME pure derivation `dispatchParcelBoundary` uses, so the θ this
// surface publishes cannot drift from the θ the ring is de-rotated by. See commit() below.
import { deriveProjectNorthAngleFromParcel } from '../site/overlay/projectTrueNorth.js';
import {
    // §MAP2D-PASTEL (L-12938 · STR-2D-SITE-MAP-CARTOGRAPHY §4 Stage M1) — this surface now
    // renders the PASTEL masterplan style. `buildFormaMap2DStyle` (v1) and `FORMA_PALETTE`
    // stay exported for their other callers and their existing pins; only the call moves.
    buildFormaMap2DStyleV2,
    PASTEL_SOURCES,
    buildSatelliteStyle,
    HEKTAR_PALETTE,
    FORMA_PALETTE,
    FORMA_PALETTE_V2,
    FORMA_BOUNDARY_DASH,
    FORMA_BOUNDARY_WIDTH,
    CONTEXT_BUILDINGS_SOURCE,
    CONTEXT_BUILDINGS_FILL_LAYER,
} from './siteMap2DStyle.js';
// MAP-DATA-OVERTURE — keyless OSM/Overture context-building loader.
import { fetchContextBuildings } from './contextBuildings.js';
// §OFFICIAL-FOOTPRINTS (L-12939) — the PURE draw decider shared with the 3D massing. The plan draws
// whole-building OUTLINES; the massing draws the register's PARTS. Drawing parts on a plan would
// show every building's internal divisions as separate structures — a masterplan drawing full of
// seams that do not exist on the ground.
import { shouldDrawInPlan, summariseOfficialFootprints } from './officialFootprint.js';
// §MAP2D-PASTEL (L-12938) — the OTHER baked context collections (roads, water areas +
// waterways, parks, landuse, rail, mapped trees + synthesised canopies) converted to the
// GeoJSON the pastel style's sources expect. It reads the SAME per-bbox memoised caches
// `contextLayerWarm.warmAllContextLayers()` fills for the 3D Site, so the 2D map adds NO
// network reads: one read, two renderers.
import { loadPastelContextGeoJson } from './pastelContextGeoJson.js';
// PW.2 (§DIAG-PARTY-WALL) — capture neighbour footprints for the layout pipeline.
import { setNeighbourFootprints } from '../site/neighbourFootprintStore.js';
// A.21.D60 — pure relative-right-angle (orthogonal-to-previous-edge) draw aid.
import { resolveOrthoSnap } from './orthoSnap.js';
// §RECT-BOUNDARY — pure two-corner → axis-aligned CCW rectangle corner builder.
import { rectCornersFromOpposite } from './rectBoundary.js';
// §CIRCLE-BOUNDARY — pure centre+radius → closed CCW N-gon circle corner builder.
import {
    circleCornersFromCentreRadius,
    circleRadiusMetres,
    fmtRadiusMetres,
    snapRadiusToRound,
} from './circleBoundary.js';
// §ELLIPSE-BOUNDARY — pure centre+two-radii → closed CCW N-gon ellipse corner builder.
// Center → bounding-box corner: the corner's projected X offset = the semi-major
// (East/X) radius, its Y offset = the semi-minor (North/Z) radius. One drag / two
// clicks, mirroring the circle's commit seam (ADR-0082 ellipse stretch).
import {
    ellipseCornersFromCentreRadii,
    ellipseAxisRadiusMetres,
    fmtRadiiMetres,
    snapRadiusToRound as snapEllipseRadiusToRound,
} from './ellipseBoundary.js';
// §SITE-PLAN-OVERLAY — georeferenced client-plan (PDF/image) overlay controller.
import {
    mountSitePlanOverlayController,
    type SitePlanOverlayControllerHandle,
    type EnterCanvasUnderlayParams,
} from '../site/overlay/SitePlanOverlayController.js';
// §FEAT-SITE-OVERLAY-PLAN-UNDERLAY (L-71) — drop the calibrated plan into the editor canvas
// as a live underlay (reuses the FloorPlanUnderlayTool + CREATE_UNDERLAY pipeline).
import { createPlanCanvasUnderlayFromSiteOverlay } from '../../engine/createSiteOverlayUnderlay.js';
// §FIX-SITE-PLAN-OVERLAY-ORDER-AND-ENTER-CANVAS (L-258 B) — the flow's own terminal
// "Finish → 3D + plan split view" transition (previously owned ONLY by the onboarding wizard).
import { onSitePlanPlacementCommitted } from '../site/overlay/enterCanvasWithSitePlan.js';
// §PARCEL-SELECT (L-380 P1 / L-384) — provider-agnostic "select a real cadastral parcel"
// data layer. The selected parcel commits through the SAME buildBoundaryFromLatLonRing →
// dispatchParcelBoundary path a DRAWN boundary uses. When NO provider is supplied the
// select mode renders an honest "connecting to cadastral data" placeholder card (the UI
// is complete + demoable ahead of the data wiring); when a provider IS supplied (Catastro)
// it fetches the real parcel. `dispatchClearParcelBoundary` powers the C19 §1.4-safe redraw.
import type { ParcelFeature, ParcelProvider } from '../site/parcel/index.js';
// §L-1581 (C06 §13.3) — THE ONE parcel-card producer. This file used to build the card
// inline (`showParcelCard` / `showStubParcelCard`, ~160 lines of DOM in a closure), which is
// why the founder's "panel for each parcel with data" lived and died with this modal and was
// reachable from nowhere else. The card now comes from a shared builder that the GIS rail
// panel mounts too, so the two surfaces cannot disagree about whether a ring is a legal
// cadastral parcel — the §GIS-ENVELOPE-REHOST (L-1362) precedent applied to the parcel card.
import {
    buildParcelCard,
    parcelFeatureToCardModel,
    parcelFeatureToProvenance,
} from '../site/parcel/parcelCard.js';
// ⭐ §PARCEL-CARD-DRAGGABLE (L-13091, founder 2026-09-07: *"make this panel movable and
// draggable"*) — THE HELPER THAT ALREADY EXISTS. `makeDraggable` has driven every floating
// panel in this app since S73-WIRE and is offset-parent aware (§L-577b), which is what a
// PANE-ABSOLUTE float needs. It gained ONE option for this lane — `bounds`, so the clamp is the
// PANE and not the window (C59 §2.10.3 clause 4) — rather than gaining a rival: a second drag
// implementation bolted to this card is the shape that produced three disagreeing
// commandManager counters, and there is no version of it that is cheaper than an option.
import { makeDraggable, clampDraggableWithin, DRAG_PINNED_ATTR } from '../makeDraggable.js';
// §L-1580 (C57 §1.9) — the ROUTING table's own row for the click point. `parcelProvider`
// here is the generic registry, whose label is deliberately generic ("Cadastral parcel /
// building footprint"); §1.9 requires the ATTRIBUTION of the provider that actually
// answered, and the jurisdiction row is where that string and its region code live. Pure
// routing — no network, no side effect.
import { resolveParcelAttribution } from '../site/parcel/parcelRegistry.js';
import {
    assessParcelSize,
    parcelSizeReviewText,
    PARCEL_SIZE_REVIEW_TESTID,
} from '../site/parcel/parcelSizeReview.js';
// §L-12912 (lane PT-BELVERDE-LOTS) — when the cadastre's answer is a HOLDING (Belverde: a 766 ha
// prédio under a house) and an OSM footprint exists under the click, the footprint is the primary
// candidate and the holding stays one deliberate click away. Pure decision + the footprint
// provider the registry already falls back to; nothing is substituted silently.
import {
    chooseParcelCandidate,
    PARCEL_CANDIDATE_WHY_TESTID,
    PARCEL_USE_HOLDING_TESTID,
    type ParcelCandidateChoice,
} from '../site/parcel/parcelCandidateChoice.js';
import { footprintParcelProvider } from '../site/parcel/FootprintParcelProvider.js';
// §UPSTREAM-UNREACHABLE-IS-NOT-A-MISS (L-13295) — the honest point lookup, and the provider
// identity that says when it may be used. Imported as a PAIR deliberately: the narrowing at the
// call site is only sound while the two refer to the same provider.
import {
    catastroParcelProvider,
    fetchParcelOutcomeAtPoint,
} from '../site/parcel/CatastroParcelProvider.js';
// §STARTUP-SELECT-IS-NOT-DWELL (L-12931) — the mark that splits the user's dwell on the 2D map
// from the machine cost of turning her click into a 3D render. A MARK, never a gate.
import { markStartupPhase } from '../../engine/startupBudget.js';
import type { ParcelProvenance } from '@pryzm/schemas';

/** §BND-90-DEFAULT-ON — forgiving lock band (deg) for freehand map drawing (was the
 *  8° ORTHO_SNAP_TOLERANCE_DEG, too tight to hit by hand now the lock is default-on). */
const ORTHO_SNAP_WIDE_DEG = 22;

// FORMA.1 — the in-progress + drawn site boundary renders in dashed Forma green
// (SPEC-FORMA-SITE-VIEW §3), replacing the old PRYZM violet so it reads against
// the quiet off-white Forma basemap and matches the eventual 3D site boundary.
// The vertex handles keep PRYZM violet (HEKTAR_PALETTE.violet) for brand
// affordance — the editable handles are UI chrome, not the boundary line itself.
const BOUNDARY_GREEN = FORMA_PALETTE.boundary;
const BOUNDARY_FILL = FORMA_PALETTE.boundaryFill;
const VIOLET = HEKTAR_PALETTE.violet;
const RING_SOURCE = 'pryzm-boundary-ring';
const FILL_LAYER = 'pryzm-boundary-fill';
const LINE_LAYER = 'pryzm-boundary-line';
const VERTEX_LAYER = 'pryzm-boundary-vertices';

// ── A.8.c.g — snap-to-footprint ────────────────────────────────────────────────
// On mousemove during draw we query the rendered building footprints in a small
// box around the cursor and snap the next vertex to the nearest building CORNER
// (vertex) or, failing that, the nearest point on a building EDGE, then fall back
// to closing-the-loop on the in-progress ring's own first vertex. The snap target
// is shown as a tasteful violet ring so the user sees exactly where the click will
// land. Threshold is in screen pixels so it feels constant at every zoom.
const SNAP_SOURCE = 'pryzm-boundary-snap';
const SNAP_LAYER = 'pryzm-boundary-snap-indicator';

// ── §PARCEL-SELECT (L-380 P1) — real-cadastral-parcel highlight ────────────────
// In "Select parcel" mode a map click fetches the REAL parcel under the cursor and
// paints it in PRYZM violet (#6600FF) — an 8% fill + a solid violet outline —
// distinct from the DRAW tool's dashed-green boundary. Its own geojson source so it
// survives a basemap swap (re-added in installRingLayers).
const PARCEL_SELECT_SOURCE = 'pryzm-parcel-select';
const PARCEL_SELECT_FILL_LAYER = 'pryzm-parcel-select-fill';
const PARCEL_SELECT_LINE_LAYER = 'pryzm-parcel-select-line';

// ── §MAP2D-ENVELOPE (STR §26.4) — the C58 buildable-envelope FOOTPRINT ────────
// Its own geojson source + fill/line pair, re-added inside `installRingLayers` so it
// survives the Map|Satellite swap exactly as the parcel highlight does.
//
// ⚠ A FOOTPRINT, NOT A FAKE BOX. This map is pitch-locked (`pitch: 0`,
// `pitchWithRotate: false` unless the caller asks for `extrude`), so a `fill-extrusion`
// would read as a flat fill with a misleading offset rather than as a volume. The honest
// 2D representation of a study solid is the ground polygon it stands on — which is also
// exactly what `envelopeGroundShade` calls the answer to *"what area may I build on?"*.
// The HEIGHT is not dropped silently: the 3D Site view and the PRYZM view draw it, and the
// envelope card prints it.
const ENVELOPE_SOURCE = 'pryzm-buildable-envelope';
const ENVELOPE_FILL_LAYER = 'pryzm-buildable-envelope-fill';
const ENVELOPE_LINE_LAYER = 'pryzm-buildable-envelope-line';

// ── §PARCEL-VISIBLE-EVERYWHERE (L-13016) — the COMMITTED parcel + the highlight cue ──────────
//
// ⚠ THESE ARE NOT `PARCEL_SELECT_*`, AND THE DISTINCTION IS THE BUG. `pryzm-parcel-select` holds
// the parcel the user has clicked but NOT yet committed: `useSelectedParcel()` sets
// `selectedParcel = null` on its way to `commit()`, so the moment the founder's plot becomes his
// SITE that source goes empty by design. From then on the only thing painting his plot was this
// map's own `vertices` array — which is populated ONLY on the mount that performed the commit.
// Open the 2D site view later, or in another pane, and `syncCommittedFromStore()` correctly
// FREEZES the draw surface from the C19 store while nothing at all PAINTS from it. Hence a
// separate source fed from the store: the committed parcel is a fact about the project, not a
// memory of this map instance's session.
//
// Registered in `installSiteHighlightLayers()` (called from the same two places
// `installRingLayers` is) so it survives the Map|Satellite `setStyle` wipe exactly as the
// envelope and the selection highlight do.
// ── §CONTINUE-WITH-THIS-PARCEL (L-13026 · C19 §5.6 clause 4 · C58 §1.20) ─────────────────────
//
// Founder 2026-09-06: *"Also I need to be able to — once selected a parcel — CONTINUE WITH THIS
// PARCEL. Before we had a panel for it, now is not being showed."*
//
// The panel is the one this file already mounts on a parcel click (`showParcelCard` →
// `buildParcelCard`), whose primary action is literally *"Use this parcel  →"*. It was never
// deleted — `freezeDraw()` hid the toggle that arms selection and detached the click that reaches
// it, so on a project that already has a committed boundary the card could not appear at all.
// These four strings are what the restored route SAYS, held here so the chip, the button title
// and the card's lead note cannot drift into three different accounts of one action.
//
// ⛔ NONE OF THEM IS A NEW CONTROL. They are the words on controls that already exist.

// ─────────────────────────────────────────────────────────────────────────────────────────
// §PANE-CENTRED-REDRAW (L-13185 · C59 §2.10.3 clause 4) — the two numbers the top column's
// LEFT inset is built from. Exported so the guard reads them rather than retyping them: a spec
// that keeps its own copy of `12` and `168` stays green against a reverted layout, which is the
// "a fake built from the header cannot falsify the header" defect this repo has already paid for.
// ─────────────────────────────────────────────────────────────────────────────────────────

/**
 * The column's own left inset — the floor its left edge may never fall below, and the same 12px
 * margin every other float on this overlay keeps off the pane edge.
 *
 * ⛔ IT IS ALSO HALF OF `--map2d-top-stack-right`'s `192px` FLOOR (that floor is the 180px
 * readable-banner minimum PLUS this inset), which `map2dTopStackGutter.spec.ts` asserts as an
 * identity. Changing it here without changing the stylesheet breaks that identity, and both halves
 * would still be green on their own.
 */
export const TOP_STACK_LEFT_PX = 12;

/**
 * ⭐ THE WIDTH A PANE MUST BE ABLE TO SPARE BEFORE `↺ Redraw boundary` MAY BE PANE-CENTRED.
 *
 * Founder 2026-09-07, arrow drawn from the pill pointing RIGHT: *"Aligne pane"*. He is right and
 * the arithmetic reproduces his measurement exactly — the column is `left:12px; right:176px`, so
 * `align-items:center` centres its children on `W/2 − 82`, not on `W/2`. At the 948px pane he
 * marked up that is x=392, the pixel he drew from, and the 82px gap is precisely his arrow.
 *
 * ⛔ THE FIX IS A SYMMETRIC RESERVATION, NEVER A PIXEL NUDGE. A hard `+82px` offset is wrong at
 * every other split ratio and re-breaks the moment he drags the splitter or the parcel card
 * changes the right gutter — which is the exact class of defect `--map2d-top-stack-right` was
 * minted to end. Mirroring the right gutter onto the left keeps the centre ON the pane at EVERY
 * width, in pure CSS percentage arithmetic that re-evaluates on every drag with no JS.
 *
 * ⚠ AND THE MIRROR IS AFFORDABLE ONLY WHILE THE PANE IS WIDE ENOUGH. Reserving the gutter on both
 * sides leaves `W − 2G` for the pill; below that the pill overflows the column and lands ON the
 * Map|Satellite toggle it was reserving against — two controls stacked, one of them unclickable.
 * So the left inset gives up exactly as much mirroring as the pane cannot afford and not a pixel
 * more, and this is the number it must keep affording: `↺ Redraw boundary` at `600 13px/1
 * system-ui` (≈122px of text) + `8px 16px` of padding + 2×1px of border ≈ 156px, rounded up to
 * 168px so a wider system font never starts the collision this exists to prevent.
 */
export const REDRAW_PILL_RESERVE_PX = 168;

/** The instruction chip while SELECT is armed on a site that already has a committed boundary. */
export const PARCEL_RESELECT_CHIP =
    'Click a plot to read its cadastral facts — and to continue with it instead of the plot '
    + 'committed to this project.';

/** Why the DRAW segment refuses once a boundary is committed, and what makes it available again. */
export const DRAW_FROZEN_TITLE =
    'This site already has a parcel boundary, and a C19 boundary is a one-shot — it cannot be '
    + 'drawn over. Press “↺ Redraw boundary” to clear it, then draw or select again.';

/**
 * The consequence of "Use this parcel" ON A COMMITTED SITE, stated BEFORE the click.
 *
 * ⛔ It is a REPLACEMENT and it says so. Proceeding runs the same CLEAR-then-recreate route
 * "↺ Redraw boundary" runs — the only legal way to change an immutable C19 §1.4 polygon — so a
 * user who does not want to lose the plot they have must be able to read that here, not discover
 * it afterwards (ASK, never auto-edit).
 */
export const PARCEL_REPLACE_TITLE =
    'Continues with this parcel: it REPLACES the plot currently committed to this project. The '
    + 'committed boundary is cleared first (the same step “↺ Redraw boundary” performs), then '
    + 'this parcel is committed in its place.';

/** The same fact as a card lead note, for a reader who never hovers a button. */
export const PARCEL_REPLACE_NOTE =
    'This project already has a committed plot. Continuing with this parcel replaces it — the '
    + 'committed boundary is cleared, then this one is committed. Nothing else about the project '
    + 'is touched.';

/** `data-testid` on that lead note, so the replacing arm is addressable rather than inferred. */
export const PARCEL_REPLACE_NOTE_TESTID = 'parcel-replace-note';

/**
 * ⭐ §RESELECT-PARCEL (L-13094) — `data-testid` on the card's "choose a different parcel" action.
 *
 * Founder 2026-09-07: *"on the panel where it says use this parcel - add - the optin to
 * re-select parcel to change parcel"*. The card had two ways forward (commit this plot, or
 * abandon selection for the draw tool) and no way BACK to the question it was answering — so a
 * user who clicked the wrong plot could only leave the mode and re-enter it.
 *
 * ⛔ THE BUTTON IS NEW; THE ROUTE IS NOT. It calls `clearParcelSelection`, which is the state
 * this map already returns to when a click lands on no parcel. Exported so a spec can address
 * the action rather than matching its label, which is prose and will be re-worded.
 */
export const PARCEL_RESELECT_BTN_TESTID = 'parcel-reselect-btn';

const COMMITTED_PARCEL_SOURCE = 'pryzm-committed-parcel';
const COMMITTED_PARCEL_FILL_LAYER = 'pryzm-committed-parcel-fill';
const COMMITTED_PARCEL_LINE_LAYER = 'pryzm-committed-parcel-line';
/** The AUTHORED weights. The emphasis pass may only ever multiply these DOWN. */
const COMMITTED_PARCEL_FILL_ALPHA = 0.10;
const COMMITTED_PARCEL_LINE_ALPHA = 1.0;
const COMMITTED_PARCEL_LINE_WIDTH = 2.5;
/**
 * The CUE — geometry that exists ONLY to answer a highlight (`siteHighlightCue`): the classified
 * front edges, or the buildable inset ring. Drawn on its own source so clearing the highlight
 * leaves no residue, and so it can never be mistaken for the parcel itself.
 *
 * ⛔ NO `limit-plane` ARM, DELIBERATELY. This map is pitch-locked, so a horizontal plane at the
 * maximum height projects to EXACTLY the buildable footprint — indistinguishable from the
 * `inset-ring` cue. `siteGeometryHighlight` states the rule for that case: *"A renderer that
 * cannot build the named cue MUST leave the row's click inert rather than falling back to
 * lighting something else — pointing at the wrong geometry is worse than pointing at none,
 * because the user cannot tell."* `buildHighlightCueFC` returns the honest empty and logs why.
 */
const HIGHLIGHT_CUE_SOURCE = 'pryzm-site-highlight-cue';
const HIGHLIGHT_CUE_LINE_LAYER = 'pryzm-site-highlight-cue-line';

// ── §MASSING-ON-THE-SITE-VIEWS (L-13022) — THE TO-BE-BUILT PLATE, ON ITS OWN SOURCE ──────────
// ⛔ ITS OWN SOURCE, NOT A FEATURE ON `ENVELOPE_SOURCE`. The permitted envelope's paint reads
// `['get','hue']` off each feature and its emphasis pass multiplies `['get','fillAlpha']`; sharing
// the source would make the user's INTENT recede and repaint under rules written for a legal
// determination, and one careless `['get','hue']` would hand it a confidence colour. Two objects,
// two sources — the same separation `SPACE_ENVELOPE_SOURCE` already makes one block down.
const PROPOSED_PLATE_SOURCE = 'pryzm-target-footprint-proposal';
const PROPOSED_PLATE_FILL_LAYER = 'pryzm-target-footprint-proposal-fill';
const PROPOSED_PLATE_LINE_LAYER = 'pryzm-target-footprint-proposal-line';

// ── §SPACE-ENVELOPE-ON-2D-MAP (L-13017) — the AUTHORED prism, not the permitted study ────────
// ⛔ `pryzm-buildable-envelope` above is the SOLVED legal ceiling; this is what the user AUTHORS
// (`spaceEnvelope.batch.create`, `standing: 'design-intent'`). Two different objects, two
// different sources, two different palettes — see the block comment on
// `spaceEnvelopeFeatureCollection` before merging them.
const SPACE_ENVELOPE_SOURCE = 'pryzm-space-envelope';
const SPACE_ENVELOPE_FILL_LAYER = 'pryzm-space-envelope-fill';
const SPACE_ENVELOPE_LINE_LAYER = 'pryzm-space-envelope-line';
/** Snap activation radius in screen pixels (founder: "snap in corners"). */
const SNAP_PX = 12;
/** Half-size (px) of the queryRenderedFeatures box around the cursor — cheap. */
const SNAP_QUERY_HALF_PX = 14;
/** The building fill layer ids we probe for footprint geometry (flat + 3D +
 *  the MAP-DATA-OVERTURE richer OSM/Overture context overlay). */
const BUILDING_QUERY_LAYERS = ['buildings-fill', 'buildings-3d', CONTEXT_BUILDINGS_FILL_LAYER];

// ── A.21.D9 — live edge-dimension labels ─────────────────────────────────────
// Founder ask ("when defining the boundaries could add dimensions?"): show each
// edge's length in metres at its midpoint AS the user draws, including a live
// label on the in-progress segment from the last placed vertex to the cursor.
// Lengths reuse the SAME local-equirectangular projection the area readout uses
// (latLonToSceneXZ): project both endpoints about a per-edge origin and take the
// Euclidean XZ distance — invariant to the origin choice at parcel scale.
const VIOLET_TEXT = '#6600FF';

/** Euclidean length (metres) of a lat/lon segment via the boundary projection. */
function edgeMetres(a: LatLon, b: LatLon): number {
    // Project both endpoints about `a` (any common origin gives the same length).
    const pa = latLonToSceneXZ(a, a.lat, a.lon); // → {0,0}
    const pb = latLonToSceneXZ(b, a.lat, a.lon);
    return Math.hypot(pb.x - pa.x, pb.z - pa.z);
}

/** Geographic midpoint (good enough at parcel scale) of two lat/lon points. */
function midLatLon(a: LatLon, b: LatLon): [number, number] {
    return [(a.lon + b.lon) / 2, (a.lat + b.lat) / 2];
}

/** Format a length in metres to a sensible precision (1 decimal). */
function fmtMetres(m: number): string {
    return `${m.toFixed(1)} m`;
}

/** Build a brand-styled dimension chip element (white bg, violet text, no black). */
function makeDimChip(): HTMLDivElement {
    const el = document.createElement('div');
    Object.assign(el.style, {
        background: 'rgba(255,255,255,0.95)',
        border: `1px solid ${VIOLET_TEXT}`,
        borderRadius: '6px',
        padding: '2px 7px',
        font: '600 12px/1.2 system-ui, sans-serif',
        color: VIOLET_TEXT,
        whiteSpace: 'nowrap',
        boxShadow: '0 1px 4px rgba(60,52,40,0.22)',
        pointerEvents: 'none',
        userSelect: 'none',
    } satisfies Partial<CSSStyleDeclaration>);
    return el;
}

/** A resolved snap target: the lng/lat to commit + what kind of feature it is. */
interface SnapTarget {
    readonly lon: number;
    readonly lat: number;
    // A.21.D60 — `'ortho'` = the relative right-angle lock (orthogonal to the
    // previous edge), distinct from the building corner/edge/loop snaps.
    readonly kind: 'corner' | 'edge' | 'loop' | 'ortho';
}

export interface SiteBoundaryMap2DOptions {
    /** Where to mount the overlay (the editor #container, same as the geocode box). */
    readonly parent: HTMLElement;
    /** The runtime (for dispatch + toasts). */
    readonly runtime: PryzmRuntime | null;
    /**
     * Initial map centre + frame. Supplied from the geocoded site (geocodeAddress).
     * `bbox` is `[w,s,e,n]` (lon/lat) when available → the map fits it; otherwise it
     * centres on `[lon,lat]` at `zoom`. Falls back to a world view if absent.
     */
    readonly initial?: {
        readonly lat: number;
        readonly lon: number;
        readonly bbox?: [number, number, number, number];
        readonly zoom?: number;
    };
    /**
     * The projection origin for the drawn ring. Defaults to the Site location; if
     * the Site has none yet, the first drawn vertex is used (and recorded as the
     * Site location) — mirrors SiteBoundaryDrawTool.getOrigin.
     */
    readonly getOrigin: () => { lat: number; lon: number } | null;
    /**
     * Render building footprints as a gentle `fill-extrusion` (the founder's "see
     * the building in 3D") instead of the flat near-white plan fill. Off by
     * default — the plan-view look is the tasteful default.
     */
    readonly extrude?: boolean;
    /**
     * Called after CANCEL (Esc / ×), so the host can drop its handle. NOT called on
     * commit — O.7.2.b keeps the cream map + boundary alive after commit; teardown
     * then happens only at generate-time via the returned `dispose()`.
     */
    readonly onClose?: () => void;
    /**
     * O.7.2.b — called after a successful boundary COMMIT (Enter / double-click).
     * The map is NOT disposed: it stays mounted showing the drawn boundary while the
     * onboarding "Generate with AI?" confirm step renders OVER it. The host uses this
     * to advance the flow; it must dispose the map ONLY at generate-time (via the
     * handle's `dispose()` or `window.pryzmCloseBoundaryMap2D`).
     */
    readonly onCommit?: () => void;
    /**
     * §FIX-SITE-OVERLAY-IMPORT-TERMINAL (L-70) — OVERLAY-ONLY mode: the map is opened purely
     * to place + calibrate a site-plan overlay (the PDF/image import use case), NOT to trace a
     * parcel. When true the boundary DRAW tool is DISARMED (map clicks add no vertices / never
     * commit a boundary) and the draw-mode strip + instruction chip are hidden — the site-plan
     * overlay panel + its 2-point calibration are the only interactions. This is how the
     * founder's "just place the image + go straight to the canvas" path avoids the boundary /
     * generate coupling entirely. The other branches (draw-plot) are unaffected (default false).
     */
    readonly overlayOnly?: boolean;
    /**
     * §PARCEL-SELECT (L-380 P1) — the parcel data source for the "Select parcel"
     * map mode. Defaults to `defaultParcelProvider` (Barcelona / Catastro). Injectable
     * so tests / future jurisdictions (ÖREB, Plandata) swap the source without
     * touching this component. The "Select parcel" mode is OPT-IN this phase; DRAW
     * stays the default mode (the default-mode question is a founder decision).
     */
    readonly parcelProvider?: ParcelProvider;
}

/**
 * Mount the 2D Hektar boundary-draw overlay. Returns a handle with `dispose()`.
 * The overlay covers `parent`, captures pointer events, and renders a close (×)
 * button + a short instruction chip.
 *
 * O.7.2.b — `commit()` FREEZES (not disposes): it sets the boundary, detaches the
 * draw handlers, and leaves the cream map + violet boundary rendered so the
 * "Generate with AI?" confirm step appears over a live plan map. Call `dispose()`
 * (or `window.pryzmCloseBoundaryMap2D`) at generate-time to tear it down.
 */
/**
 * §VIEW-PANEL-PER-PANE (founder 2026-09-06) — the map's handle, NAMED so the basemap
 * swap can leave this file without being re-implemented.
 *
 * ⭐ `setBasemap` is NOT a new capability. It is `swapBasemap`, the A.8.c.f.4 function the
 * corner `Map | Satellite` chip has driven since 2026-06-03, exposed on the handle. The
 * founder's *"the 2d map satellite and non-satellite option is MASKED FOR ANOTHER PANEL"*
 * is a REACHABILITY complaint, not a missing feature: the capability existed and only the
 * chip inside the map could reach it. The corner chip is UNCHANGED and still works — a
 * route is added here, never removed (C19 §5.6 clause 4).
 */
export interface SiteBoundaryMap2DHandle {
    readonly element: HTMLElement;
    dispose(): void;
    rearm(): void;
    /** Swap the MapLibre style (cream vector ⇄ ESRI satellite raster). Idempotent. */
    setBasemap(next: 'map' | 'satellite'): void;
    /** Which basemap is live right now — a READING off this map, not a remembered command. */
    getBasemap(): 'map' | 'satellite';
    /**
     * §MAP-IS-A-SINGLETON-TOO (L-12992, founder 2026-09-06) — RE-TARGET this ONE map into
     * another host element, keeping it alive. The exact counterpart of
     * `CesiumViewport.reparentContainerTo` (§L-412), and it exists because the two view
     * surfaces were ASYMMETRIC: Cesium could move between panes and MapLibre could not, so
     * *"if i clicked 2d map view it would render on the left hand side"* — the map stayed
     * wherever it first mounted and the pane that asked for it went black.
     *
     * ⛔ NEVER a second map. `appendChild` MOVES an already-parented node; the overlay is
     * `position:absolute; inset:0`, so it fills whatever POSITIONED host it lands in (the
     * caller must give the host `position:relative|absolute` — `PaneHost` already does).
     * `map.resize()` afterwards is what makes MapLibre re-measure: its own `trackResize`
     * observer fires on the container's box, and a re-parent between two equally sized
     * panes need not change that box at all.
     */
    reparentTo(host: HTMLElement): void;
    /** Is this map's overlay actually inside `host` right now? A reading, not a memory. */
    isPlacedIn(host: HTMLElement): boolean;
    /** Re-measure after the host box changed (pane divider drag / mode switch). */
    resize(): void;
    /**
     * §MAP2D-ENVELOPE (STR-RESIDENTIAL-DESIGN-ORCHESTRATOR §26.4) — hand this map the C58
     * buildable-envelope solids to draw as a FOOTPRINT. `null` / `[]` clears it.
     *
     * ⭐ THE PAYLOAD, NEVER THE DECISION. The caller passes whatever `envelopeToMassing` produced
     * (`resolveFormaEnvelope()?.solids`) and does NOT consult the user's Envelope ON/OFF choice —
     * this map asks the ONE authority itself, on every repaint, exactly as `renderFormaMassing`
     * does (§ENVELOPE-ONE-VISIBILITY / L-1170, C84 EI-1). Gating at the caller is what produced
     * four disagreeing answers to one question, and a payload handed over here is by definition a
     * snapshot: the payload may be stale, the ANSWER never is.
     */
    setBuildableEnvelope(solids: ReadonlyArray<MassingSolid> | null): void;
}

export function mountSiteBoundaryMap2D(
    opts: SiteBoundaryMap2DOptions,
): SiteBoundaryMap2DHandle {
    const { parent, runtime, getOrigin, onClose, onCommit } = opts;
    // §PARCEL-SELECT (L-380 P1 / L-384) — the parcel data source for the "Select parcel"
    // mode. NULL = data not wired for this deployment → the select UI is fully built but
    // renders an honest "connecting to cadastral data" placeholder card (draw still works).
    const parcelProvider: ParcelProvider | null = opts.parcelProvider ?? null;

    // ── Overlay shell ─────────────────────────────────────────────────────────
    const overlay = document.createElement('div');
    overlay.className = 'pryzm-gis-map2d';
    Object.assign(overlay.style, {
        position: 'absolute',
        inset: '0',
        // §DRAW-MAP-ABOVE-CESIUM (2026-06-03): 20 → 40 so the draw surface is
        // unambiguously above the Cesium globe canvas during the draw step.
        zIndex: '40',
        // §MAP2D-PASTEL (L-12938) — the v2 warm-paper land, so the chrome behind and
        // during load matches the pastel basemap rather than v1's cooler off-white.
        background: FORMA_PALETTE_V2.land,
    } satisfies Partial<CSSStyleDeclaration>);

    const mapEl = document.createElement('div');
    Object.assign(mapEl.style, {
        position: 'absolute',
        inset: '0',
    } satisfies Partial<CSSStyleDeclaration>);
    overlay.appendChild(mapEl);

    // ── §TOP-STACK (L-13090 · C59 §2.10.3 clause 4) — ONE top-centre COLUMN ─────────────────
    //
    // Founder 2026-09-07, arrow drawn at the pane's own `2D Site Map ▾` dropdown:
    // *"On those panels - please add the message further up (first arrow)"*. In his screenshots
    // the instruction banner is also CLIPPED — its right edge disappears under the parcel card.
    //
    // ⭐ THE CLIP AND THE HEIGHT ARE ONE DEFECT, AND IT IS A LAYOUT DEFECT, NOT A `top` VALUE.
    // The banner sat at `top:92px; left:50%` and the parcel card at `top:92px; right:12px` —
    // two absolutely-positioned floats given the SAME row and no knowledge of each other, so
    // whichever was wider won and the other was covered. Moving the banner up without fixing
    // that would re-collide the moment the text grew by a line, which is exactly how it got
    // here (`§DRAW-TOOLBAR-OFFSET` already bumped it 12 → 92 for the same class of reason).
    //
    // So the fix is a COLUMN that owns the top-centre band, with two properties:
    //   1. its children FLOW, so `↺ Redraw boundary` and the banner can never overlap each
    //      other however long either gets — the previous `top:12px` redraw button also
    //      overlapped the PANE's own centred view dropdown, which this retires as a side effect;
    //   2. its right edge stops short of the card column by `--map2d-top-stack-right`, the
    //      SAME token that sizes the card. One number, two readers, so the reservation cannot
    //      drift from the thing it reserves for.
    //
    // ⛔ IT DOES NOT COVER THE PANE'S OWN DROPDOWN. `PaneViewPicker` occupies y ∈ [10, ~42] of
    // the pane at z-index 60; this column starts at 52px, which is as far up as a MAP float may
    // go without painting over a PANE control. That boundary is C59 §2.10.3 clause 4, not taste.
    const topStack = document.createElement('div');
    topStack.className = 'pryzm-gis-map2d-topstack';
    topStack.setAttribute('data-testid', 'map2d-top-stack');
    Object.assign(topStack.style, {
        position: 'absolute',
        top: '52px',
        // ⭐ BOTH insets are re-written by `refreshTopStack()` — it is the ONE writer of this box,
        // and since §PANE-CENTRED-REDRAW (below) the LEFT one carries meaning too: the column is
        // asymmetric while it holds a sentence and symmetric while it holds only the pill, so a
        // literal here would be a second opinion about a value that has two regimes.
        left: `${TOP_STACK_LEFT_PX}px`,
        right: '176px',
        zIndex: '23',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '8px',
        // The column is a LAYOUT box, not a surface: clicks fall through to the map, and each
        // child re-enables pointer events for itself if it needs them (the redraw button does).
        pointerEvents: 'none',
    } satisfies Partial<CSSStyleDeclaration>);
    overlay.appendChild(topStack);

    // Instruction chip. Text is mode-dependent (see refreshChip below): the
    // §RECT-BOUNDARY rectangle mode shows "Click two opposite corners"; the legacy
    // polygon mode keeps the vertex-by-vertex instruction.
    const chip = document.createElement('div');
    chip.setAttribute('data-testid', 'map2d-instruction-chip');
    chip.textContent = 'Click two opposite corners · Esc to cancel';
    Object.assign(chip.style, {
        // §TOP-STACK — a FLOW child of `topStack`. No `position`, no `left:50%`, no
        // `transform: translateX(-50%)`: the column centres it, and a centring transform inside
        // a centring flex box is the shape that let it hang off its own container.
        maxWidth: '100%',
        background: 'rgba(255,255,255,0.92)',
        border: `1px solid ${VIOLET}`,
        borderRadius: '20px',
        padding: '6px 16px',
        font: '13px/1.4 system-ui, sans-serif',
        color: '#2a2438',
        textAlign: 'center',
        // ⛔ WRAPS, NEVER TRUNCATES. Every string this pill carries is an instruction or a
        // consequence (`PARCEL_RESELECT_CHIP` is two clauses long), and a truncated disclosure
        // is worse than none — the rule `.pb-parcel-intro` states for the same reason.
        whiteSpace: 'normal',
        overflowWrap: 'anywhere',
        boxShadow: '0 2px 10px rgba(60,52,40,0.18)',
        pointerEvents: 'none',
    } satisfies Partial<CSSStyleDeclaration>);
    // §FIX-SITE-OVERLAY-IMPORT-TERMINAL (L-70) — no boundary to trace in overlay-only mode,
    // so the "click two corners" instruction would be misleading. Hide it.
    if (opts.overlayOnly) chip.style.display = 'none';
    topStack.appendChild(chip);

    // Close (×) button.
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.textContent = '✕';
    closeBtn.setAttribute('aria-label', 'Close boundary map');
    Object.assign(closeBtn.style, {
        position: 'absolute',
        top: '12px',
        right: '12px',
        zIndex: '21',
        width: '32px',
        height: '32px',
        borderRadius: '8px',
        border: `1px solid ${VIOLET}`,
        background: 'rgba(255,255,255,0.92)',
        color: '#2a2438',
        cursor: 'pointer',
        font: '16px/1 system-ui, sans-serif',
        boxShadow: '0 2px 10px rgba(60,52,40,0.18)',
    } satisfies Partial<CSSStyleDeclaration>);
    // §FIX-ONBOARDING-OVERLAY-SINGLE-PANEL-NO-BOUNDARY-SPLIT3D (L-194) — in overlay-only import
    // mode the map's own ✕ is redundant chrome (and closing via it would orphan the onboarding
    // wizard banner). The onboarding "← Back" is the single cancel path; hide the map ✕.
    if (opts.overlayOnly) closeBtn.style.display = 'none';
    overlay.appendChild(closeBtn);

    // ── A.8.c.f.4 — Map ↔ Satellite basemap toggle (top-right, under the × ) ────
    // On-brand white + #6600FF segmented control. Clicking a segment swaps the
    // MapLibre style (cream vector ↔ ESRI satellite raster) via map.setStyle below.
    const toggle = document.createElement('div');
    toggle.className = 'pryzm-gis-basemap-toggle';
    Object.assign(toggle.style, {
        position: 'absolute',
        top: '52px',
        right: '12px',
        zIndex: '21',
        display: 'flex',
        gap: '0',
        borderRadius: '8px',
        overflow: 'hidden',
        border: `1px solid ${VIOLET}`,
        background: 'rgba(255,255,255,0.92)',
        boxShadow: '0 2px 10px rgba(60,52,40,0.18)',
        font: '12px/1 system-ui, sans-serif',
    } satisfies Partial<CSSStyleDeclaration>);

    function makeSegBtn(label: string, mode: 'map' | 'satellite'): HTMLButtonElement {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = label;
        b.dataset['mode'] = mode;
        b.setAttribute('aria-label', `${label} basemap`);
        Object.assign(b.style, {
            border: 'none',
            padding: '7px 12px',
            cursor: 'pointer',
            background: 'transparent',
            color: '#2a2438',
            font: 'inherit',
            fontWeight: '600',
        } satisfies Partial<CSSStyleDeclaration>);
        return b;
    }
    const mapBtn = makeSegBtn('Map', 'map');
    const satBtn = makeSegBtn('Satellite', 'satellite');
    toggle.appendChild(mapBtn);
    toggle.appendChild(satBtn);
    overlay.appendChild(toggle);

    // ── §PARCEL-SELECT (L-380 P1) — "Select parcel / Draw boundary" mode toggle ──
    // Top-left segmented control (brand white + #6600FF). DRAW is the DEFAULT mode
    // (the select mode is OPT-IN this phase — the default-mode question is a founder
    // decision, not silently changed here). In SELECT mode a map click fetches the
    // REAL cadastral parcel; in DRAW mode the existing Rectangle/Linear/… tools run.
    const interToggle = document.createElement('div');
    interToggle.className = 'pryzm-gis-interaction-toggle';
    Object.assign(interToggle.style, {
        position: 'absolute',
        // §FIX-PARCEL-TOGGLE-BOTTOM-RIGHT (2026-08-05, founder request) — moved off the top-left
        // corner (previously top:64px/left:64px, itself a fix for an EARLIER clip-behind-the-logo
        // bug, §FIX-PARCEL-TOGGLE-CLIP/L-384 — the top-left placement is preserved in git history,
        // not lost) down to bottom-right, decluttering the map's top edge. Kept clear of the
        // manual-admin-zone panel (`ManualAdminZonePanel.ts`, `right:16px; bottom:16px`, ~260px
        // wide) by sitting well above it rather than beside/under it — this toggle is short
        // (~140px wide, one row tall), so stacking vertically avoids ever needing to reason about
        // two floating elements' horizontal widths colliding.
        bottom: '340px',
        right: '16px',
        zIndex: '22',
        display: 'flex',
        gap: '0',
        borderRadius: '8px',
        overflow: 'hidden',
        border: `1px solid ${VIOLET}`,
        background: 'rgba(255,255,255,0.92)',
        boxShadow: '0 2px 10px rgba(60,52,40,0.18)',
        font: '12px/1 system-ui, sans-serif',
    } satisfies Partial<CSSStyleDeclaration>);
    function makeInterBtn(label: string, mode: 'select' | 'draw'): HTMLButtonElement {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = label;
        b.dataset['inter'] = mode;
        b.setAttribute('data-testid', `parcel-${mode}-mode-btn`);
        b.setAttribute('aria-label', `${label} mode`);
        Object.assign(b.style, {
            border: 'none',
            padding: '7px 12px',
            cursor: 'pointer',
            background: 'transparent',
            color: '#2a2438',
            font: 'inherit',
            fontWeight: '600',
        } satisfies Partial<CSSStyleDeclaration>);
        b.addEventListener('click', () => setInteractionMode(mode));
        return b;
    }
    const selectModeBtn = makeInterBtn('Select parcel', 'select');
    const drawModeBtn = makeInterBtn('Draw boundary', 'draw');
    interToggle.appendChild(selectModeBtn);
    interToggle.appendChild(drawModeBtn);
    // Not applicable in overlay-only mode (no boundary/parcel there).
    if (opts.overlayOnly) interToggle.style.display = 'none';
    overlay.appendChild(interToggle);

    // ⭐ §ENVELOPE-TOOL-ON-THE-SITE-VIEWS (L-13017 · C58 §1.19) — THE MISSING ENTRY POINT.
    //
    // Founder: *"I am not able yet to create the envelope on the 2D site view / 3D site — it should
    // OPEN A PANEL LIKE WHEN YOU CREATE A WALL OR SLAB WITH THE TOOLS."* The command
    // (`spaceEnvelope.batch.create`) has never been view-gated and the panel that dispatches it
    // reads the runtime itself — it was simply only ever mounted inside the Parcel Law TAB. So this
    // is a ROUTE being added, not a pipeline: the button opens the SAME panel, which builds the
    // SAME plan and dispatches the SAME command (P6 — one command path, two input surfaces).
    //
    // ⛔ NOT A SECOND FLOATING BAR. The founder photographed three view switchers over one pane the
    // same day (L-13015); this is one button inside the strip that already exists, and the panel it
    // opens is a singleton that re-targets rather than stacking.
    //
    // ⚠ NOT gated on `committed`, and not gated on an envelope existing (C58 §1.20 clause 1): the
    // panel it opens is precisely where a user with no solved envelope is told what is missing and
    // what would supply it. Hidden only in overlay-only mode, which authors nothing at all.
    const envelopeToolBar = document.createElement('div');
    Object.assign(envelopeToolBar.style, {
        position: 'absolute',
        // Directly above the select/draw strip, sharing its right edge — one column of chrome, not
        // a second cluster to collide with `ManualAdminZonePanel` (right:16px, bottom:16px).
        bottom: '380px',
        right: '16px',
        zIndex: '22',
        display: 'flex',
        gap: '6px',
    } satisfies Partial<CSSStyleDeclaration>);
    envelopeToolBar.appendChild(buildSiteEnvelopeToolButton(() => overlay));
    if (opts.overlayOnly) envelopeToolBar.style.display = 'none';
    overlay.appendChild(envelopeToolBar);

    // ── §PARCEL-SELECT — the parcel info card (ref / address / area + actions) ────
    // Hidden until a parcel is selected. Brand white + #6600FF. Shows the factual
    // cadastral data (L-373: factual PARCEL geometry — no estimated-data badge needed
    // yet; the zoning/envelope estimate arrives in P2/P3) + a source attribution, and
    // commits the ring through the EXISTING draw→commit path via "Use this parcel".
    //
    // §L-1581 — this element is now a HOST, not the card. It carries only the overlay
    // GEOMETRY (where the floating card sits on the map); every fact row, every honesty
    // label and every string inside it is produced by `buildParcelCard`, which the GIS rail
    // panel mounts as well. The `data-testid` moved onto the produced card so both surfaces
    // are addressed by the same selector.
    //
    // §PARCEL-CARD-PANE-SIZED (L-13092) / §PARCEL-CARD-DRAGGABLE (L-13091) — the host's box and
    // its drag both live in `.pryzm-gis-parcel-host` + `makeDraggable`, NOT here. The width is
    // `clamp(232px, 20%, 360px)` of the PANE (the founder's *"20% of the space ocapy"*, floored
    // where 20% stops being able to hold a fact row — the derivation is in the stylesheet), and
    // the drag grip is the card's own title row, which only THIS host makes draggable.
    const parcelCard = document.createElement('div');
    parcelCard.className = 'pryzm-gis-parcel-card pryzm-gis-parcel-host';
    parcelCard.style.display = 'none';
    overlay.appendChild(parcelCard);
    // ⛔ THE BOUNDS ARE A THUNK RETURNING THE OVERLAY, NEVER A CAPTURED RECT. `overlay` is
    // `position:absolute; inset:0` inside the pane, so its box IS the pane's box — and that box
    // changes on every splitter drag (the founder's console: canvas 459 → 742 → 812 → 841 →
    // 1023 px in one session). A rect captured at mount would clamp into a pane that no longer
    // exists. The excludes keep a click on a card BUTTON from starting a drag.
    const disposeParcelDrag = makeDraggable(
        parcelCard,
        '.pryzm-parcel-card-title',
        ['.pryzm-parcel-card-btn'],
        null,
        { bounds: () => overlay },
    );
    // ⛔ THE CLAMP MUST ALSO RUN ON RESIZE, NOT ONLY WHILE A POINTER IS DOWN. `makeDraggable`'s
    // own clamp fires during a drag; nothing re-checks the card when the PANE changes underneath
    // it. A card parked at the right edge of a 1023 px pane is outside a 459 px one, and the
    // founder re-splits constantly (his console: 459 → 742 → 812 → 841 → 1023 px in one session).
    // The failure is not cosmetic and not recoverable by the user: once the card's TITLE ROW is
    // off-pane there is no grip left to drag it back, so the card is gone until reload.
    // `clampDraggableWithin` returns early unless the card carries DRAG_PINNED_ATTR, so a card the
    // user has never moved keeps its stylesheet position and this observer costs it nothing.
    const parcelCardBoundsObserver = new ResizeObserver(() => {
        try { clampDraggableWithin(parcelCard, () => overlay); } catch { /* pane detached mid-observe */ }
    });
    try { parcelCardBoundsObserver.observe(overlay); } catch { /* host without ResizeObserver */ }

    // ── ⭐ §SITE-PLAN-OVERLAY-OFF-THE-MAP (L-13093) — THE DOCK, and why it is not a `display:none`
    //
    // Founder 2026-09-07: *"exclude site overlay plan for now - or add it in the panel on the
    // left hand side or parcel - but not there on main view"*. What he is looking at is this
    // controller's COLLAPSED header row — `Site plan overlay · no plan added` — floating at
    // `top:92px; right:12px`, i.e. the exact coordinates of the parcel card, over his map.
    //
    // ⭐ RELOCATED, NOT DELETED. He offered both; relocation is the reversible one, and there is
    // a container that fits: the Parcel rail panel, which already re-homes the SINGLETON
    // buildable-envelope card through `window.pryzmMountEnvelopeCard` (§GIS-ENVELOPE-REHOST,
    // L-1362). This is that seam a second time, deliberately — the same shape, the same
    // move-don't-clone discipline, the same `isConnected` self-healing.
    //
    // ⛔ WHY A WRAPPER AND NOT `panel.style.display='none'`: the controller's `renderPanel()`
    // sets `panel.style.display = ''` on EVERY render, so a hide written on the panel is undone
    // the next time anything about the overlay changes. Hiding the CONTAINER is a fact the
    // producer cannot overwrite — and it also gives the panel a home to return to when the rail
    // releases it, so a released panel is hidden rather than stranded on a detached node.
    //
    // ⚠ IN OVERLAY-ONLY MODE THE DOCK STAYS VISIBLE ON THE MAP, AND THAT IS NOT AN EXCEPTION
    // BEING SMUGGLED IN. `overlayOnly` is the onboarding "Overlay a plan/PDF" branch: the map is
    // mounted for no other purpose, there is no parcel card and no rail beside it, and
    // `OnboardingStepController` tells the user in so many words to *"press 'Overlay plan / PDF'"*
    // — a control that would then be in a panel he has not been sent to. Hiding it there would
    // not declutter a main view; it would break the import flow at its only step.
    const sitePlanDock = document.createElement('div');
    sitePlanDock.className = 'pryzm-gis-siteplan-dock';
    sitePlanDock.setAttribute('data-testid', 'map2d-siteplan-dock');
    if (!opts.overlayOnly) sitePlanDock.style.display = 'none';
    overlay.appendChild(sitePlanDock);

    // ── §L-384 — undo / redo vertex affordance (bottom-left pill) ────────────────
    // Ctrl+Z / Ctrl+Y also drive these (keyListener). Shown only for the vertex-by-
    // vertex polygon modes (rectangle/circle/ellipse commit in two clicks). Disabled
    // states mirror availability so the affordance is never a dead button.
    const editBar = document.createElement('div');
    editBar.className = 'pryzm-gis-undo-redo';
    Object.assign(editBar.style, {
        position: 'absolute', bottom: '18px', left: '12px', zIndex: '22',
        display: 'none', gap: '0', borderRadius: '8px', overflow: 'hidden',
        border: `1px solid ${VIOLET}`, background: 'rgba(255,255,255,0.92)',
        boxShadow: '0 2px 10px rgba(60,52,40,0.18)', font: '14px/1 system-ui, sans-serif',
    } satisfies Partial<CSSStyleDeclaration>);
    function makeEditBtn(glyph: string, label: string, testid: string): HTMLButtonElement {
        const b = document.createElement('button');
        b.type = 'button'; b.textContent = glyph; b.title = label;
        b.setAttribute('aria-label', label); b.setAttribute('data-testid', testid);
        Object.assign(b.style, {
            border: 'none', padding: '7px 12px', cursor: 'pointer', background: 'transparent',
            color: VIOLET, font: 'inherit', fontWeight: '700',
        } satisfies Partial<CSSStyleDeclaration>);
        return b;
    }
    const undoBtn = makeEditBtn('↶', 'Undo last corner (Ctrl+Z)', 'boundary-undo-btn');
    const redoBtn = makeEditBtn('↷', 'Redo corner (Ctrl+Y)', 'boundary-redo-btn');
    undoBtn.addEventListener('click', () => undoVertex());
    redoBtn.addEventListener('click', () => redoVertex());
    editBar.appendChild(undoBtn);
    editBar.appendChild(redoBtn);
    if (opts.overlayOnly) editBar.style.display = 'none';
    overlay.appendChild(editBar);

    // ── §L-384 — "Redraw boundary" (shown after a committed boundary) ────────────
    // The C19 §1.4 boundary is an immutable one-shot; this triggers the CLEAR-then-
    // recreate path (dispatchClearParcelBoundary → re-arm the draw), NOT a mutation.
    const redrawBtn = document.createElement('button');
    redrawBtn.type = 'button';
    redrawBtn.textContent = '↺ Redraw boundary';
    redrawBtn.setAttribute('data-testid', 'boundary-redraw-btn');
    Object.assign(redrawBtn.style, {
        // §TOP-STACK (L-13090) — was `position:absolute; top:12px; left:50%`, which put it in
        // the PANE's own band and squarely under `PaneViewPicker`'s centred `2D Site Map ▾`
        // dropdown (also centred, also at the top, z-index 60): on a committed site the pane's
        // view switcher and this button were drawn on top of one another. It is now a flow child
        // of the top column, above the banner, so the two can only ever stack.
        display: 'none', padding: '8px 16px', borderRadius: '20px', maxWidth: '100%',
        border: `1px solid ${VIOLET}`, background: VIOLET, color: '#ffffff', cursor: 'pointer',
        font: '600 13px/1 system-ui, sans-serif', boxShadow: '0 2px 10px rgba(60,52,40,0.22)',
        // The column itself is click-through; a real control inside it is not.
        pointerEvents: 'auto',
    } satisfies Partial<CSSStyleDeclaration>);
    redrawBtn.addEventListener('click', () => rearmDraw());
    if (opts.overlayOnly) redrawBtn.style.display = 'none';
    // First in the column: the action leads, the instruction that qualifies it follows.
    topStack.insertBefore(redrawBtn, topStack.firstChild);

    // ── §SITE-PLAN-OVERLAY — "Overlay plan/PDF" entry ────────────────────────────
    // §FIX-DUPLICATE-OVERLAY-ENTRY (2026-08-05, founder request) — this used to be a SEPARATE
    // floating top-left button duplicating the "Upload plan / PDF" action the Site plan overlay
    // panel itself already shows (`SitePlanOverlayController.ts renderPanel()`'s `locating` state,
    // top-right card) — two buttons for one action, cluttering the top-left corner. Removed the
    // standalone button entirely; the panel (already visible/mounted) is now the single entry
    // point. `overlayController` itself is untouched — still declared/used below for the
    // boundary-commit re-entry path (`enterCanvasWithSitePlan.ts`), unaffected by this UI-only
    // removal.

    // ── §BND-MODE-STRIP — boundary-draw MODE toolbar (mirrors WallDrawingHUD) ────
    // The founder's spec: present the boundary draw modes as a floating wall-style
    // pill strip — `MODE: [R Rectangle] [L Linear] [O Orthogonal] [C Curved] · ESC`
    // — with single-key shortcuts, exactly like the wall-creation HUD. We REUSE the
    // global `.wdh-*` CSS (drawingHuds.ts, injected via AppTheme) so the pill shape,
    // active-state violet (#6600FF), keyboard badge, and ESC hint match 1:1 — no new
    // styling. Each pill maps to the EXISTING boundary-draw plumbing:
    //   R Rectangle  → drawMode='rectangle' (§RECT-BOUNDARY two-corner; the default
    //                  + most-finished mode the residential/house generators expect)
    //   L Linear     → drawMode='polygon', orthoEnabled=false (free polyline)
    //   O Orthogonal → drawMode='polygon', orthoEnabled=true  (A.21.D60 90°-lock)
    //   C Curved     → no spline/arc boundary geometry exists yet → graceful
    //                  fallback to Linear polygon + a toast (pill still shown, marked).
    //   I Circle     → §CIRCLE-BOUNDARY two-point (centre + circumference); emits a
    //                  closed 64-gon polygon down the SAME commit path as Rectangle.
    //   E Ellipse    → §ELLIPSE-BOUNDARY two-point (centre + bounding-box corner): the
    //                  corner's projected X offset = semi-major (East) radius, Y offset
    //                  = semi-minor (North) radius; emits a closed 64-gon down the SAME
    //                  commit path (ADR-0082 ellipse stretch — tower massing).
    //
    // §FILLET-BOUNDARY — TODO (ADR-0082 arc/fillet stretch): a "Fillet" pill that lets
    // the user round an EXISTING boundary corner into a tangent arc WITHOUT redrawing.
    // The PURE engine is already shipped + unit-tested (`filletBoundary.ts`:
    // `filletCornerArc(prev, corner, next, radiusMetres, segments)` → arc vertices to
    // splice in place of the corner, with `maxFilletRadiusMetres` clamping the radius so
    // the arc fits within the two edges). What remains is the corner-pick INTERACTION:
    // (1) require a committed parcel boundary (read it back from the C19 SiteModelStore
    // or re-draw it into `vertices`); (2) hit-test the cursor against the boundary
    // vertices to pick a corner; (3) drag a fillet radius with a live `fmtFilletRadiusMetres`
    // readout; (4) splice `filletCornerArc(...).arc` into the ring at the corner index and
    // re-commit via the SAME `buildBoundaryFromLatLonRing → dispatchParcelBoundary` path.
    // Deferred (not half-built) because the corner-pick + boundary-readback UI is a
    // distinct interaction from the two-click draw modes here.
    //
    // The bar is `position:absolute` inside the overlay (the overlay is the editor
    // #container, also absolute) so it floats at the top-centre of the draw surface.
    // ⚠ §FIX-SHAPE-VOCABULARY (L-1322) — RENAMED from `SiteBoundaryGesture`, which is
    // the EXPORTED name of a DIFFERENT type in `@pryzm/geometry-slab` carrying
    // DIFFERENT members (`linear | ortho | curved` — note `ortho`, not `orthogonal`).
    // Two types, one name, one concept, no relation: a reader who greps the name found
    // two answers and no way to tell which governed. C84 EI-8 names *shape* explicitly.
    //
    // ⚠ This is the SITE-BOUNDARY tool's own gesture list and is deliberately NOT
    // unified with the element vocabulary: it draws a PARCEL on a map in lat/lon, not a
    // plate boundary in model space, and its `circle`/`ellipse` are map-projected. The
    // fix here is the NAME, not a merge — merging two things because they share three
    // words is how the five spellings happened.
    type SiteBoundaryGesture = 'rectangle' | 'linear' | 'orthogonal' | 'curved' | 'circle' | 'ellipse';
    const modeBar = document.createElement('div');
    modeBar.className = 'wdh-bar';
    modeBar.setAttribute('data-bnd-mode-bar', '1');
    // Override the global `.wdh-bar` fixed positioning so the strip is anchored to
    // THIS overlay (which may not cover the full window), not the viewport.
    // §DRAW-TOOLBAR-OFFSET (2026-06-24) — top bumped 12px → 52px so this
    // top-centre strip clears the Author/Inspect/Data mode-tab row (the
    // `.wmb-toplevel-wrapper` at top:6px, ~34px tall) instead of overlapping it.
    Object.assign(modeBar.style, {
        position: 'absolute',
        top: '52px',
        zIndex: '21',
    } satisfies Partial<CSSStyleDeclaration>);

    const modeLbl = document.createElement('span');
    modeLbl.className = 'wdh-mode-lbl';
    modeLbl.textContent = 'Mode:';
    modeBar.appendChild(modeLbl);

    const MODE_DEFS: ReadonlyArray<{ key: string; label: string; mode: SiteBoundaryGesture }> = [
        { key: 'R', label: 'Rectangle',  mode: 'rectangle'  },
        { key: 'L', label: 'Linear',     mode: 'linear'     },
        { key: 'O', label: 'Orthogonal', mode: 'orthogonal' },
        { key: 'C', label: 'Curved',     mode: 'curved'     },
        // §CIRCLE-BOUNDARY — key 'I' (C is taken by Curved); two-point circle.
        { key: 'I', label: 'Circle',     mode: 'circle'     },
        // §ELLIPSE-BOUNDARY — key 'E'; two-point centre + bounding-box corner.
        { key: 'E', label: 'Ellipse',    mode: 'ellipse'    },
    ];
    const modeBtns = new Map<SiteBoundaryGesture, HTMLButtonElement>();
    for (const d of MODE_DEFS) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'wdh-btn';
        btn.dataset['bndmode'] = d.mode;
        btn.innerHTML = `<span class="wdh-key">${d.key}</span><span class="wdh-lbl">${d.label}</span>`;
        btn.title = `Switch to ${d.label} draw mode (${d.key})`;
        btn.addEventListener('click', () => setDrawMode(d.mode));
        modeBar.appendChild(btn);
        modeBtns.set(d.mode, btn);
    }

    const escHint = document.createElement('span');
    escHint.className = 'wdh-esc';
    escHint.textContent = 'ESC to cancel';
    modeBar.appendChild(escHint);
    // §FIX-SITE-OVERLAY-IMPORT-TERMINAL (L-70) — the Rectangle/Linear/Ortho/Curved draw
    // strip has no purpose in overlay-only mode (drawing is disarmed). Hide it.
    if (opts.overlayOnly) modeBar.style.display = 'none';
    overlay.appendChild(modeBar);

    // A.8.c.f.4 — active basemap. Default = the Hektar cream vector look; the corner
    // toggle swaps to keyless ESRI satellite raster to fill OSM coverage gaps.
    // §TDZ-FIX (2026-06-03): MUST be declared BEFORE paintToggle() is called below —
    // it was declared further down, so paintToggle()'s read of `basemap` threw
    // `ReferenceError: Cannot access 'basemap' before initialization` synchronously
    // inside mountSiteBoundaryMap2D → the cream 2D map never attached and the Cesium
    // globe showed underneath during the draw step (founder-flagged regression).
    let basemap: 'map' | 'satellite' = 'map';

    /** Paint the active segment in violet, the inactive one white. */
    function paintToggle(): void {
        for (const b of [mapBtn, satBtn]) {
            const active = b.dataset['mode'] === basemap;
            b.style.background = active ? VIOLET : 'transparent';
            b.style.color = active ? '#ffffff' : '#2a2438';
            b.setAttribute('aria-pressed', String(active));
        }
    }
    paintToggle();

    parent.appendChild(overlay);

    // ── State ─────────────────────────────────────────────────────────────────
    const vertices: LatLon[] = [];
    // §BND-MODE-STRIP — the user-facing draw mode (4 pills). Rectangle is the DEFAULT
    // (founder "for now" + most-finished): first click records corner A, the second
    // commits an axis-aligned rectangle. `linear`/`orthogonal`/`curved` are all the
    // legacy vertex-by-vertex polygon draw (Enter / dbl-click to close), differing
    // only in the 90°-lock + the curved fallback note (see setDrawMode).
    let uiMode: SiteBoundaryGesture = 'rectangle';
    // §RECT-BOUNDARY / §CIRCLE-BOUNDARY / §ELLIPSE-BOUNDARY — the INTERNAL geometry mode
    // the draw handlers branch on. Four shapes exist: a two-corner axis-aligned
    // rectangle, a two-point circle (centre + circumference → N-gon), a two-point
    // ellipse (centre + bounding-box corner → N-gon), or a vertex-by-vertex polygon.
    // The six UI pills collapse onto these (+ the ortho flag below).
    let drawMode: 'rectangle' | 'polygon' | 'circle' | 'ellipse' = 'rectangle';
    // §RECT-BOUNDARY — the first clicked corner in rectangle mode (null = awaiting
    // the first click). The live rubber-band rectangle previews from here to the
    // cursor; the second click commits.
    let rectCornerA: LatLon | null = null;
    // §CIRCLE-BOUNDARY — the clicked circle CENTRE (null = awaiting the first click).
    // Once set, the live circle previews from this centre out to the cursor radius;
    // the second click commits the closed N-gon. The radius readout chip tracks it.
    let circleCentre: LatLon | null = null;
    // §ELLIPSE-BOUNDARY — the clicked ellipse CENTRE (null = awaiting the first click).
    // Once set, the live ellipse previews from this centre out to the cursor
    // (bounding-box corner: |Δx| = semi-major / East radius, |Δz| = semi-minor /
    // North radius); the second click commits the closed N-gon. The radii readout
    // chip tracks it.
    let ellipseCentre: LatLon | null = null;
    let draggingIdx: number | null = null;
    let disposed = false;
    // §SITE-PLAN-OVERLAY — the georeferenced client-plan overlay controller, mounted on
    // map load (so the MapLibre map handle exists). Null until then / after dispose.
    let overlayController: SitePlanOverlayControllerHandle | null = null;
    // O.7.2.b — set true by commit(). The map + boundary stay rendered, but draw
    // handlers are detached and the instruction/Esc/close affordances are frozen so
    // no further vertices can be added. The map is disposed ONLY later, at
    // generate-time, via dispose().
    let committed = false;
    // §FIX-MAP2D-EXTERNAL-BOUNDARY-SYNC — true only for the duration of THIS map's own
    // `commit()`. `dispatchParcelBoundary` emits `site.parcel-boundary-set` synchronously, so
    // without this re-entrancy guard our own commit would trip the external-boundary listener
    // and log a "committed WITHOUT going through this map" warning about ourselves.
    let committingLocally = false;
    // A.8.c.g — the live snap target under the cursor (null = no snap; click uses
    // the raw lngLat). Updated on every mousemove while drawing.
    let snapTarget: SnapTarget | null = null;
    // A.21.D60 / §BND-90 — relative right-angle lock: when ON (user OPT-IN), the
    // SECOND+ edges snap to the nearest 90 degrees off the PREVIOUS edge's direction
    // (any base rotation), so the user draws a clean rectilinear plot. The corner snap
    // (above) always takes priority; this engages only when no corner snap is in range.
    // §BND-90-DEFAULT-ON (founder 2026-06-08): the FIRST edge is ALWAYS free (the snap
    // guard requires ≥2 vertices — see resolveOrthoSnapTarget); the 90° lock is now ON by
    // DEFAULT so the user draws the first line at any site rotation, then every subsequent
    // edge auto-snaps orthogonal → a clean rectilinear plot. This is the critical upstream
    // fix: a non-rectangular plot (drawn freehand) classifies as T-U-SHAPE (§DIAG-SHAPE),
    // which fragments the stair carve and forces room drops (§FEASIBILITY-ALLOC). The user
    // can uncheck the toggle for a genuinely non-rectilinear site.
    let orthoEnabled = true;

    // §PARCEL-SELECT (L-380 P1) — interaction mode. In 'select', map clicks fetch the real
    // cadastral parcel instead of adding draw vertices.
    //
    // §UX-PARCEL-SELECT-DEFAULT (founder 2026-08-06: "select PARCEL SELECTION by default instead
    // of DRAW — although the user could select DRAW later if wanted") — SELECT IS NOW THE DEFAULT.
    // It was `'draw'` because select was opt-in while the cadastral providers were being built;
    // that phase is over (`parcelProvider: defaultParcelProvider` is wired at the mount site, and
    // `showParcelCard` renders REAL parcels for every connected region). Selecting a legal parcel
    // is also the better default on the merits: it yields a surveyed boundary instead of a
    // hand-traced approximation, which is what every downstream envelope/edificabilitat
    // computation is actually entitled to reason about.
    //
    // ⚠ THE USER IS NEVER TRAPPED BY THIS, which is the only reason it is safe to default to a
    // path that depends on third-party coverage. Where no provider answers, `showStubParcelCard`
    // states plainly that cadastral data is not connected, disables "Use this parcel", and offers
    // "Draw instead" (§L-384) — and the mode toggle itself is always present. That honest-degrade
    // path already existed; this change only decides which mode is armed first.
    //
    // ⚠ EXCEPT for `overlayOnly` (the PDF / site-plan import flow), where there is no parcel to
    // pick and the draw tool is the entire point of the surface.
    let interactionMode: 'draw' | 'select' = opts.overlayOnly ? 'draw' : 'select';
    // The currently highlighted parcel (null = none selected). Committed via "Use this parcel".
    let selectedParcel: ParcelFeature | null = null;
    /**
     * §L-12912 (PT-BELVERDE-LOTS) — the OVERSIZE cadastral answer displaced from `selectedParcel`
     * by a footprint candidate (Belverde: the 766 ha prédio, while the house outline is what the
     * card leads with). Kept so "Use the 766 ha holding anyway" can still commit it through the
     * one commit path. Cleared wherever `selectedParcel` is — a later click or a drawn boundary
     * can never inherit a previous click's holding.
     */
    let oversizeHolding: ParcelFeature | null = null;
    /**
     * §L-1580 (C57 §1.4) — the provenance of the parcel being committed, captured at the
     * moment "Use this parcel" is pressed.
     *
     * WHY A SEPARATE VARIABLE. `useSelectedParcel()` clears `selectedParcel` BEFORE it calls
     * `commit()` (it drops the violet highlight so the committed ring renders through the
     * normal green path). By the time `commit()` reaches `dispatchParcelBoundary` the feature
     * is already gone — so reading it there would silently record NOTHING on exactly the path
     * that has provenance to record. It is cleared again after the commit so a later DRAWN
     * boundary can never inherit a previous selection's attribution.
     */
    let pendingParcelProvenance: ParcelProvenance | null = null;
    // Guards against overlapping fetches while one click's parcel is still loading.
    let parcelFetchInFlight = false;

    /**
     * §MAP2D-ENVELOPE (STR §26.4 / C58 §1.14) — the buildable-envelope solids this map was last
     * handed, in SCENE-XZ METRES (the parcel/wall frame), NOT lon/lat. `setBuildableEnvelope`
     * writes it; `envelopeFeatureCollection()` projects it. Empty until the host hands one over,
     * which is the honest resting state: no envelope has been solved for this site yet.
     *
     * ⛔ NOT a second visibility flag. Whether these are DRAWN — and as a volume footprint or as
     * the flat ground shade — is re-asked of `getBuildableEnvelopeAxes()` on every repaint.
     */
    let envelopeSolids: ReadonlyArray<MassingSolid> = [];

    // §L-384 — vertex redo stack (polygon draw): vertices removed by undo, restored by
    // redo. Any NEW vertex placement clears it (standard undo/redo semantics).
    const redoStack: LatLon[] = [];

    // A.21.D9 — pooled HTML markers for the edge-dimension labels. Index 0..n-1
    // are the PLACED edges (vertex i → i+1, wrapping); the last marker (when a
    // cursor position is known) is the LIVE segment (last vertex → cursor). We
    // grow the pool as needed and hide the surplus rather than re-creating chips
    // on every pointermove.
    const dimMarkers: MapLibreMarker[] = [];
    // The current cursor lng/lat (raw or snapped) for the live in-progress edge.
    let cursorLL: LatLon | null = null;
    // §CIRCLE-BOUNDARY — a single pooled chip showing the LIVE radius (centre→cursor)
    // while drawing a circle, mirroring the line tool's length labels. Created lazily
    // on the first circle draw; positioned at the circumference point under the cursor.
    let radiusMarker: MapLibreMarker | null = null;

    // MAP-DATA-OVERTURE — context-building fetch state. We fetch the richer OSM
    // footprints for the current map centre and feed them into the geojson source
    // (CONTEXT_BUILDINGS_SOURCE). `ctxAbort` cancels an in-flight fetch on a new
    // request / dispose; `ctxDebounce` coalesces moveend bursts; `ctxLastKey`
    // avoids refetching the same ~tile. Fully guarded — failure leaves the source
    // empty (today's behaviour).
    let ctxAbort: AbortController | null = null;
    let ctxDebounce: ReturnType<typeof setTimeout> | null = null;
    let ctxLastKey = '';

    // §MAP2D-PASTEL (L-12938) — the pastel context push (roads / water / parks / landuse /
    // rail / trees). Its own abort + debounce + key, deliberately NOT shared with the
    // buildings fetch above: one cancelling the other would silently blank whole layers.
    let pastelAbort: AbortController | null = null;
    let pastelDebounce: ReturnType<typeof setTimeout> | null = null;
    let pastelLastKey = '';

    function toast(message: string, severity: 'info' | 'success' | 'error'): void {
        runtime?.events?.emit('pryzm:toast', { message, severity });
    }

    // ── Map ───────────────────────────────────────────────────────────────────
    // FORMA.1 — DEFAULT to the Autodesk-Forma minimal-vector basemap (off-white
    // land, light-grey roads, pale blue-grey water, abstract building fills). The
    // satellite raster style stays available via the corner toggle.
    const style = buildFormaMap2DStyleV2({
        extrude: opts.extrude ?? false,
    }) as unknown as StyleSpecification;

    // Centre + initial zoom. When a geocoded location is supplied we open AT the
    // plot (zoom ~16-17), never the world view — the fitBounds on 'load' below
    // then frames the exact bbox when one is available.
    const center: [number, number] = opts.initial
        ? [opts.initial.lon, opts.initial.lat]
        : [0, 0];
    const initialZoom = opts.initial
        ? (opts.initial.zoom ?? 16)
        : 1;
    const map = new MapLibreMap({
        container: mapEl,
        style,
        center,
        zoom: initialZoom,
        attributionControl: { compact: true },
        // Plan view: keep it flat + north-up (no pitch/rotate) for the draw,
        // unless 3D extrusion was requested (then allow a gentle pitch/rotate).
        pitchWithRotate: opts.extrude ?? false,
        dragRotate: opts.extrude ?? false,
        pitch: opts.extrude ? 45 : 0,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');

    // ── Ring rendering (violet GeoJSON: fill + line + vertex handles) ──────────
    function ringFeatureCollection(): GeoJSON.FeatureCollection {
        const coords = vertices.map((v) => [v.lon, v.lat] as [number, number]);
        const features: GeoJSON.Feature[] = [];
        if (coords.length >= 2) {
            features.push({
                type: 'Feature',
                geometry: { type: 'LineString', coordinates: [...coords, coords[0]!] },
                properties: {},
            });
        }
        if (coords.length >= 3) {
            features.push({
                type: 'Feature',
                geometry: { type: 'Polygon', coordinates: [[...coords, coords[0]!]] },
                properties: { kind: 'fill' },
            });
        }
        for (let i = 0; i < coords.length; i++) {
            features.push({
                type: 'Feature',
                geometry: { type: 'Point', coordinates: coords[i]! },
                properties: { kind: 'vertex', idx: i },
            });
        }
        return { type: 'FeatureCollection', features };
    }

    function refreshRing(): void {
        const src = map.getSource(RING_SOURCE) as GeoJSONSource | undefined;
        if (src) src.setData(ringFeatureCollection());
        refreshDimLabels();
    }

    /**
     * A.21.D9 — render the live edge-dimension labels. One violet chip at the
     * midpoint of every PLACED edge, plus (while drawing, with a known cursor) a
     * chip on the in-progress segment from the last vertex to the cursor. Pooled
     * markers are reused; surplus chips are detached. Once committed (frozen) only
     * the placed edges are shown — no live cursor segment.
     */
    function refreshDimLabels(): void {
        if (disposed) return;
        // Build the list of segments to label: placed edges + the live segment.
        const segs: Array<{ a: LatLon; b: LatLon }> = [];
        // §CIRCLE-BOUNDARY / §ELLIPSE-BOUNDARY — a circle/ellipse is a 64-gon; labelling
        // all 64 chords is noise. The radius readout chip (refreshRadiusLabel) is the
        // affordance, so suppress per-edge dimensions in those modes (segs empty → hidden).
        const n = drawMode === 'circle' || drawMode === 'ellipse' ? 0 : vertices.length;
        // Placed edges. When the ring is "closed" (≥3 vertices) we label the
        // closing edge (last → first) too so every drawn edge has a dimension.
        const placedEdges = n >= 3 ? n : Math.max(0, n - 1);
        for (let i = 0; i < placedEdges; i++) {
            segs.push({ a: vertices[i]!, b: vertices[(i + 1) % n]! });
        }
        // Live in-progress segment: last placed vertex → cursor (draw mode only).
        if (!committed && n >= 1 && cursorLL) {
            segs.push({ a: vertices[n - 1]!, b: cursorLL });
        }

        // Grow the marker pool to cover every segment.
        while (dimMarkers.length < segs.length) {
            const m = new MapLibreMarker({ element: makeDimChip(), anchor: 'center' });
            m.setLngLat([0, 0]).addTo(map);
            dimMarkers.push(m);
        }
        // Position + fill the chips we need; hide the surplus.
        for (let i = 0; i < dimMarkers.length; i++) {
            const marker = dimMarkers[i]!;
            const el = marker.getElement();
            const seg = segs[i];
            if (!seg) { el.style.display = 'none'; continue; }
            const metres = edgeMetres(seg.a, seg.b);
            // Skip a zero-length live segment (cursor sitting on the last vertex).
            if (metres < 0.05) { el.style.display = 'none'; continue; }
            el.style.display = '';
            el.textContent = fmtMetres(metres);
            marker.setLngLat(midLatLon(seg.a, seg.b));
        }
    }

    function installRingLayers(): void {
        // Idempotent: setStyle() wipes all added sources/layers, so after a
        // basemap swap this re-adds them. Guard against the (load-time) case where
        // they are already present.
        if (map.getSource(RING_SOURCE)) {
            refreshRing();
            return;
        }
        map.addSource(RING_SOURCE, { type: 'geojson', data: ringFeatureCollection() });
        map.addLayer({
            id: FILL_LAYER,
            type: 'fill',
            source: RING_SOURCE,
            filter: ['==', ['get', 'kind'], 'fill'],
            // FORMA.1 — faint green fill rgba(45,106,79,0.08) (SPEC §3).
            paint: { 'fill-color': BOUNDARY_FILL },
        });
        map.addLayer({
            id: LINE_LAYER,
            type: 'line',
            source: RING_SOURCE,
            filter: ['==', ['geometry-type'], 'LineString'],
            // FORMA.1 — dashed green boundary, 8px on / 6px off, 2px (SPEC §3).
            paint: {
                'line-color': BOUNDARY_GREEN,
                'line-width': FORMA_BOUNDARY_WIDTH,
                'line-dasharray': [...FORMA_BOUNDARY_DASH],
            },
        });
        map.addLayer({
            id: VERTEX_LAYER,
            type: 'circle',
            source: RING_SOURCE,
            filter: ['==', ['get', 'kind'], 'vertex'],
            paint: {
                'circle-radius': 6,
                'circle-color': VIOLET,
                'circle-stroke-color': '#ffffff',
                'circle-stroke-width': 2,
            },
        });
        // A.8.c.g — snap indicator: a hollow violet ring drawn at the live snap
        // target. Empty until a snap is active (refreshSnapIndicator sets the data).
        map.addSource(SNAP_SOURCE, { type: 'geojson', data: emptyFC() });
        map.addLayer({
            id: SNAP_LAYER,
            type: 'circle',
            source: SNAP_SOURCE,
            paint: {
                'circle-radius': 9,
                'circle-color': 'rgba(102,0,255,0.18)',
                'circle-stroke-color': VIOLET,
                'circle-stroke-width': 2.5,
            },
        });
        // §PARCEL-SELECT (L-380 P1) — the selected real-parcel highlight (violet fill
        // + solid violet outline). Empty until a parcel is selected; re-added here so
        // it survives a basemap swap, then repainted from `selectedParcel`.
        map.addSource(PARCEL_SELECT_SOURCE, { type: 'geojson', data: emptyFC() });
        map.addLayer({
            id: PARCEL_SELECT_FILL_LAYER,
            type: 'fill',
            source: PARCEL_SELECT_SOURCE,
            paint: { 'fill-color': VIOLET, 'fill-opacity': 0.10 },
        });
        map.addLayer({
            id: PARCEL_SELECT_LINE_LAYER,
            type: 'line',
            source: PARCEL_SELECT_SOURCE,
            paint: { 'line-color': VIOLET, 'line-width': 2.5 },
        });
        // §MAP2D-ENVELOPE (STR §26.4) — the C58 buildable-envelope footprint. ⭐ REGISTERED HERE
        // ON PURPOSE: the basemap swap re-styles this map with `diff:false`, which WIPES every
        // added source and layer, and this function is what the `style.load` handler re-runs. A
        // layer added anywhere else silently vanishes the first time the user presses Satellite.
        //
        // ⚠ THE SWAP CALL ITSELF IS NAMED ONLY IN `swapBasemap`, AND MUST STAY THE ONLY ONE —
        // §L-412's "ONE MapLibre map, re-targeted" depends on nothing else re-styling it. Do NOT
        // write that call's literal form in a comment anywhere in this file:
        // `siteViewQuickToggle.spec.ts` counts it with a raw regex over the whole source and does
        // not strip comments (though its own `codeOnly()` helper, applied to GISAreaLayout one
        // line below, would), so a prose mention reads as a second call site — the
        // §RAF-GATE-COMMENT-BLIND (P3, 2026-08-10) shape, where a gate counted three doc comments
        // asserting compliance as three violations.
        installEnvelopeLayers();
        refreshParcelHighlight();
    }

    /** An empty FeatureCollection (the snap indicator's resting state). */
    function emptyFC(): GeoJSON.FeatureCollection {
        return { type: 'FeatureCollection', features: [] };
    }

    // ── §PARCEL-SELECT (L-380 P1) — real-parcel selection ──────────────────────

    /** Push the selected parcel's ring (or nothing) into the violet highlight source. */
    function refreshParcelHighlight(): void {
        const src = map.getSource(PARCEL_SELECT_SOURCE) as GeoJSONSource | undefined;
        if (!src) return;
        if (!selectedParcel || selectedParcel.ring.length < 3) { src.setData(emptyFC()); return; }
        const coords = selectedParcel.ring.map((p) => [p.lon, p.lat] as [number, number]);
        src.setData({
            type: 'FeatureCollection',
            features: [{
                type: 'Feature',
                geometry: { type: 'Polygon', coordinates: [[...coords, coords[0]!]] },
                properties: {},
            }],
        });
    }

    // ── §MAP2D-ENVELOPE (STR §26.4 · C58 §1.14 / §1.17) — the buildable envelope ──────────────
    //
    // THE FOUNDER'S REPORT (STR-RESIDENTIAL-DESIGN-ORCHESTRATOR §26.4, 2026-09-06):
    //   "the envelope renders great on pryzm view — but on 3d site vie not on 2d map view"
    //
    // That is a REACHABILITY complaint, not a missing computation. The very same `MassingSolid[]`
    // already reaches the Cesium globe (§ENVELOPE-VIA-MASSING) and the three.js BIM/plan scene
    // (`ParcelBoundarySceneRenderer.buildEnvelopeVolume`); this surface simply never asked for it.
    // So nothing is re-derived here — C58 §1.14.2: the rasteriser extrudes/draws what the pure L2
    // `envelopeToMassing` decided and never re-derives geometry or a height from a scalar.
    //
    // ⭐ THE FRAME IS THE WHOLE PROBLEM, AND IT IS NOT NEGOTIABLE. `MassingSolid.ring` is scene-XZ
    // METRES in the PROJECT-north frame (`envelopeToMassing.ts` §MassingSolid) — the frame the
    // parcel ring and the walls are baked in. It is NOT lon/lat. The two conversions below are the
    // SAME PAIR the globe uses, in the same order:
    //
    //     scene-XZ (PROJECT frame)  --sceneXZToEnu(x, z, θ)-->        ENU east/north (TRUE frame)
    //     ENU east/north            --sceneXZToLatLon({x: east, z: -north}, lat0, lon0)--> WGS84
    //
    // ⛔ DO NOT INVENT A THIRD PROJECTION. Both helpers already exist, are pure and are unit-tested.
    // A hand-rolled `lon = lon0 + x/…` here would be correct at θ = 0 and silently WRONG at
    // Barcelona's θ ≈ 45° — and a wrong-signed θ lands the footprint MIRRORED across the frame
    // origin, which is §PARCEL-SHADE-NOT-MIRRORED (L-10740): a defect whose own success criterion
    // had no term for it and therefore reported CONSISTENT forever.

    /** §ENVELOPE-CONFIDENCE-COLOUR (L-608) — hue → CSS, from the ONE table. No colour is minted here. */
    function envelopeHueCss(hue: MassingSolid['style']['hue']): string {
        return hue === 'confident'
            ? CONFIDENT_VIOLET_CSS
            : hue === 'suggested-preview'
                ? SUGGESTED_AMBER_CSS
                : PROVISIONAL_GREY_CSS;
    }

    /**
     * Project the live envelope payload into map-frame GeoJSON polygons — or into an HONEST EMPTY.
     *
     * ⚠ C57 §1.5 — A FAILURE IS NEVER DRESSED AS AN EMPTY. There are four different reasons this
     * can return no features, and each one says which it is in the log:
     *   1. no envelope has been handed over (the resting state — not a failure);
     *   2. the user has hidden it (the ONE authority answered `none`);
     *   3. the projection ORIGIN is unavailable — we refuse rather than draw at a guessed origin,
     *      because a footprint at the wrong origin is a legal claim about the wrong land;
     *   4. θ is unavailable because the site store could not be reached — likewise a refusal,
     *      since "θ is 0" and "θ could not be read" are the §L-446 ambiguity that cost a whole
     *      deploy-test cycle on the globe. A REACHABLE store with `trueNorth: 0` is a definite
     *      answer (the schema defaults it) and draws normally.
     */
    function envelopeFeatureCollection(): GeoJSON.FeatureCollection {
        if (envelopeSolids.length === 0) return emptyFC();

        // ⭐ THE CHOKEPOINT, ASKED HERE AND NOT AT THE CALLER (C84 EI-1 / §ENVELOPE-ONE-VISIBILITY).
        // `applyEnvelopeVisibilityAxes` is the pure L2 rule BOTH other rasterisers read, so the map,
        // the globe and the BIM scene cannot read one preference three different ways. When the
        // VOLUME is off it returns the flat ground shade — which on a pitch-locked plan map is
        // visually the same footprint, correctly, since the shade IS a projection of these solids.
        const axes = getBuildableEnvelopeAxes();
        const drawn = applyEnvelopeVisibilityAxes(envelopeSolids, axes);
        if (drawn.length === 0) {
            console.log(
                `[gis][c58] map2d §MAP2D-ENVELOPE — ${envelopeSolids.length} envelope solid(s) held, ` +
                `drawing NONE: mode=${envelopeDrawMode(axes)} (the user has the envelope hidden). ` +
                'Not a failure and not an absence of constraint.',
            );
            return emptyFC();
        }

        const origin = getOrigin();
        if (!origin) {
            console.warn(
                '[gis][c58] map2d §MAP2D-ENVELOPE — REFUSING to draw the buildable envelope: no site ' +
                'frame ORIGIN is resolvable yet (resolveSiteFrameOrigin found no LTP-ENU origin, no ' +
                'geocoded site location and no geocode frame). A footprint drawn about a guessed ' +
                'origin is a legal claim about the wrong land (C57 §1.5), so nothing is drawn.',
            );
            return emptyFC();
        }

        // θ — read the SAME `SiteLocation.trueNorth` `CesiumViewport.readProjectNorthRad` reads.
        // `resolveSiteContext` is used rather than `runtime?.siteModelStore` because the LIVE boot
        // path hands `mountGISArea` a NULL runtime (`createMainLayout(props, null)`, initUI.ts) and
        // this map is constructed with it — the §L-412 root cause. That resolver already owns the
        // `window.runtime` fallback, so this file needs no cast of its own (P4 / L-845).
        const store = resolveSiteContext(runtime ?? null)?.store ?? null;
        const location = store?.getSite()?.location ?? null;
        if (!location) {
            console.warn(
                '[gis][c58] map2d §MAP2D-ENVELOPE — REFUSING to draw the buildable envelope: the site ' +
                'store is unreachable, so θ (SiteLocation.trueNorth) could not be READ. ⚠ This is NOT ' +
                'the same as θ = 0: assuming 0 here would draw a correctly-shaped footprint at the ' +
                'wrong BEARING on any rotated site (Barcelona θ ≈ 45°) — the §L-446 ambiguity. ' +
                `${drawn.length} solid(s) withheld.`,
            );
            return emptyFC();
        }
        const thetaRad = Number.isFinite(location.trueNorth) ? location.trueNorth : 0;

        // Largest first, so a smaller upper tier paints ON TOP of the ground tier it sits inside.
        // ⚠ EVERY solid is drawn. A §L-616 envelope is a FAR-realistic mass inside a translucent
        // legal-ceiling shell, and a tiered one is several distinct legal statements (§1.7b.6);
        // silently picking one would publish a different envelope than the globe shows.
        const ordered = [...drawn].sort((a, b) => b.areaM2 - a.areaM2);
        const features: GeoJSON.Feature[] = [];
        for (const solid of ordered) {
            if (!solid.ring || solid.ring.length < 3) continue;
            const coords: Array<[number, number]> = solid.ring.map((p) => {
                const { east, north } = sceneXZToEnu(p.x, p.z, thetaRad);
                const ll = sceneXZToLatLon({ x: east, z: -north }, origin.lat, origin.lon);
                return [ll.lon, ll.lat];
            });
            features.push({
                type: 'Feature',
                geometry: { type: 'Polygon', coordinates: [[...coords, coords[0]!]] },
                properties: {
                    id: solid.id,
                    role: solid.role,
                    // ⭐ The colour travels ON THE FEATURE, straight off the solid's own style, so the
                    // paint below is a dumb `['get', …]` and this file holds no envelope knowledge.
                    hue: envelopeHueCss(solid.style.hue),
                    fillAlpha: solid.style.fillAlpha,
                },
            });
        }
        console.log(
            `[gis][c58] map2d §MAP2D-ENVELOPE — drawing ${features.length} envelope footprint(s) ` +
            `(mode=${envelopeDrawMode(axes)}, θ=${(thetaRad * 180 / Math.PI).toFixed(2)}°, ` +
            `origin ${origin.lat.toFixed(6)},${origin.lon.toFixed(6)}).`,
        );
        return { type: 'FeatureCollection', features };
    }

    /** Push the current envelope footprint(s) — or the honest empty — into the map source. */
    function refreshEnvelope(): void {
        const src = map.getSource(ENVELOPE_SOURCE) as GeoJSONSource | undefined;
        if (!src) return; // style is mid-swap; `installRingLayers` re-adds + repaints.
        src.setData(envelopeFeatureCollection());
    }

    /**
     * Register the envelope source + its fill/line pair. Called from `installRingLayers`, which is
     * what `map.on('load')` and the post-`setStyle` `style.load` handler both run — so the envelope
     * survives the Map|Satellite toggle exactly as the parcel highlight does. Idempotent.
     *
     * ⚠ `beforeId: FILL_LAYER` is deliberate: the envelope is a constraint the parcel boundary is
     * read AGAINST, so the dashed green boundary line and its violet vertex handles must stay
     * legible ON TOP of it. Inserted below them, above every basemap layer.
     */
    function installEnvelopeLayers(): void {
        if (map.getSource(ENVELOPE_SOURCE)) { refreshEnvelope(); return; }
        map.addSource(ENVELOPE_SOURCE, { type: 'geojson', data: emptyFC() });
        map.addLayer({
            id: ENVELOPE_FILL_LAYER,
            type: 'fill',
            source: ENVELOPE_SOURCE,
            paint: {
                'fill-color': ['get', 'hue'],
                'fill-opacity': ['get', 'fillAlpha'],
            },
        }, FILL_LAYER);
        map.addLayer({
            id: ENVELOPE_LINE_LAYER,
            type: 'line',
            source: ENVELOPE_SOURCE,
            paint: {
                'line-color': ['get', 'hue'],
                'line-width': 1.75,
            },
        }, FILL_LAYER);
        refreshEnvelope();
    }


    // ── §PARCEL-VISIBLE-EVERYWHERE (L-13016 · STR §26.4 · C19 §2.3) — THE COMMITTED PARCEL ─────
    //
    // Founder: *"When a parcel is selected, the parcel should be HIGHLIGHTED no matter the view
    // selected … the parcel was NOT highlighted, although the data was on the right hand side."*
    //
    // ⭐ NOTHING IS RE-DERIVED HERE. The ring comes from the C19 store through the ONE
    // scene-XZ → WGS84 read (`readCommittedParcelRing`) that `GISAreaLayout.getMapInitial` also
    // uses, so the picture and the camera cannot be built about different origins — and a
    // hand-rolled projection here would be right at θ = 0 and MIRRORED at Barcelona's θ ≈ 45°
    // (§PARCEL-SHADE-NOT-MIRRORED, L-10740).
    //
    // ⚠ A REFUSAL IS LOGGED AS A REFUSAL. `absent` (no parcel committed — the resting state) and
    // `refused` (a real ring PRYZM cannot honestly place) both draw nothing, and they must not
    // print the same sentence: the first is a fact about the project, the second is a gap in
    // PRYZM. Collapsing them is the §CONTEXT-DATA-HONESTY defect this repo treats as first-class.

    /** The committed C19 ring in WGS84, or null — asked through the ONE reader. */
    function committedParcelLatLonRing(): readonly LatLon[] | null {
        const store = resolveSiteContext(runtime ?? null)?.store ?? null;
        const res = readCommittedParcelRing(store, getOrigin());
        if (res.kind === 'ring') return res.ring;
        if (res.kind === 'refused') {
            console.warn(`[gis] map2d §PARCEL-VISIBLE-EVERYWHERE — parcel NOT drawn: ${res.reason}`);
        }
        return null;
    }

    /** Push the committed parcel outline (or the honest empty) into its own source. */
    function refreshCommittedParcel(): void {
        const src = map.getSource(COMMITTED_PARCEL_SOURCE) as GeoJSONSource | undefined;
        if (!src) return; // style is mid-swap; `installSiteHighlightLayers` re-adds + repaints.
        const ring = committedParcelLatLonRing();
        if (!ring) { src.setData(emptyFC()); return; }
        const coords = ring.map((p) => [p.lon, p.lat] as [number, number]);
        src.setData({
            type: 'FeatureCollection',
            features: [{
                type: 'Feature',
                geometry: { type: 'Polygon', coordinates: [[...coords, coords[0]!]] },
                properties: { role: 'committed-parcel' },
            }],
        });
    }

    /**
     * §PARCEL-VISIBLE-EVERYWHERE — the CUE for the active highlight subject, or the honest empty.
     *
     * ⛔ RETURNING AN EMPTY IS AN HONEST ANSWER AND MUST STAY ONE. A cue that cannot be built
     * draws NOTHING — it never falls back to lighting the parcel instead. Which cue a subject
     * needs is decided by `siteHighlightCue`, never here.
     */
    function buildHighlightCueFC(): GeoJSON.FeatureCollection {
        const subject = getSiteHighlight();
        if (subject === null) return emptyFC();
        const cue = siteHighlightCue(subject);
        if (cue === null) return emptyFC(); // parcel / boundary / GFA are already on screen.

        if (cue === 'limit-plane') {
            // See HIGHLIGHT_CUE_SOURCE: on a pitch-locked plan a height plane IS the footprint.
            console.log(
                '[gis] map2d §PARCEL-VISIBLE-EVERYWHERE — "Max height" has no honest cue on a '
                + 'pitch-locked plan: a horizontal plane at the limit projects to exactly the '
                + 'buildable footprint, so drawing it would point at the wrong geometry. The 3D '
                + 'views draw this one; nothing is drawn here.',
            );
            return emptyFC();
        }

        const origin = getOrigin();
        const store = resolveSiteContext(runtime ?? null)?.store ?? null;
        const site = store?.getSite() ?? null;
        const thetaRad = Number.isFinite(site?.location?.trueNorth) ? site!.location!.trueNorth : null;
        if (!origin || thetaRad === null) {
            console.warn(
                '[gis] map2d §PARCEL-VISIBLE-EVERYWHERE — REFUSING to draw the highlight cue: the '
                + 'site frame ORIGIN or θ could not be read. ⚠ Assuming θ = 0 would draw the right '
                + 'shape at the wrong bearing (§L-446). Nothing is drawn.',
            );
            return emptyFC();
        }
        const toLonLat = (p: { x: number; z: number }): [number, number] => {
            const { east, north } = sceneXZToEnu(p.x, p.z, thetaRad);
            const ll = sceneXZToLatLon({ x: east, z: -north }, origin.lat, origin.lon);
            return [ll.lon, ll.lat];
        };

        // ── ⭐ §26.6.4 / §ROOMS-ON-THE-VIEWS (L-13046) — ONE ROOM'S DETECTED OUTLINE ───────────
        //
        // Founder: *"THAT SHOULD BE THERE — AND SHALL RENDER ON THE VIEWS."* Following a room row
        // in the Parcel Law tab's rooms-per-level list lights that room's outline here.
        //
        // ⛔ THE RING COMES FROM THE ONE READER (`resolveRoomOutline`), shared with the BIM scene
        // and the globe, and it is projected through the SAME `toLonLat` the parcel cue uses — a
        // room polygon is in the SAME scene-XZ frame as the committed ring (`RoomDetectionEngine`
        // builds it from WallGraph world positions), so no second projection is minted.
        //
        // ⚠ HEIGHT IS NOT A QUESTION ON A PITCH-LOCKED PLAN, so unlike the two 3D views this arm
        // needs no `worldY` branch: a first-floor room and a ground-floor room project to the same
        // place here, correctly, because a plan IS that projection. (Contrast `limit-plane` above,
        // which is refused for precisely the reason that its projection would be a DIFFERENT
        // subject's shape.) The room's storey is stated on its row in the panel, in words.
        if (cue === 'room-outline') {
            const roomId = parseRoomHighlightSubject(subject);
            if (roomId === null) return emptyFC();
            const outline = resolveRoomOutline(runtime ?? null, roomId);
            if (outline === null) {
                console.log(
                    `[gis] map2d §ROOMS-ON-THE-VIEWS cue 'room-outline' — NOT drawn: no drawable `
                    + `outline resolved for room "${roomId}". Nothing is drawn rather than the parcel `
                    + 'lit instead.',
                );
                return emptyFC();
            }
            const coords = outline.ring.map(toLonLat);
            console.log(
                `[gis] map2d §ROOMS-ON-THE-VIEWS cue 'room-outline' — ${outline.ring.length}-corner `
                + `outline for "${outline.name ?? outline.id}"`
                + (outline.levelId === null ? ' (its storey is not recorded).' : ` on storey ${outline.levelId}.`),
            );
            return {
                type: 'FeatureCollection',
                features: [{
                    type: 'Feature',
                    geometry: { type: 'LineString', coordinates: [...coords, coords[0]!] },
                    properties: { cue, roomId: outline.id },
                }],
            };
        }

        // ── §26.6 rule 2 (L-13046) — the two cues that need ONLY the committed ring. ──────────
        // 'bbox' — the axis-aligned extent the `Bounding box` row's two numbers describe, from the
        // ONE producer (`boundingBoxRingXZ`) the 3D views draw from, so the three views light the
        // same box. 'boundary-edge' — ONE segment of the ring, the edge a setback-register row
        // names; an index outside the ring yields the honest empty, never the nearest edge.
        if (cue === 'bbox' || cue === 'boundary-edge') {
            const ring = (store?.getParcelBoundary?.()?.polygon ?? []) as ReadonlyArray<{ x: number; z: number }>;
            if (ring.length < 3) return emptyFC();
            if (cue === 'bbox') {
                const box = boundingBoxRingXZ(ring).map(toLonLat);
                return {
                    type: 'FeatureCollection',
                    features: [{
                        type: 'Feature',
                        geometry: { type: 'LineString', coordinates: [...box, box[0]!] },
                        properties: { cue },
                    }],
                };
            }
            const index = parseEdgeHighlightSubject(subject);
            if (index === null || index >= ring.length) return emptyFC();
            return {
                type: 'FeatureCollection',
                features: [{
                    type: 'Feature',
                    geometry: {
                        type: 'LineString',
                        coordinates: [toLonLat(ring[index]!), toLonLat(ring[(index + 1) % ring.length]!)],
                    },
                    properties: { cue, edgeIndex: index },
                }],
            };
        }

        if (cue === 'inset-ring') {
            // ⚠ ONE RING, THE PRINCIPAL TIER'S — exactly what the card's footprint number is
            // measured inside (`permittedStudyFigures`), so outline and number cannot disagree.
            // Empty whenever the envelope is not `ok`: a refusal has no buildable ring.
            const inset = getLastBuildableEnvelope()?.insetPolygon ?? [];
            if (inset.length < 3) return emptyFC();
            const coords = inset.map(toLonLat);
            return {
                type: 'FeatureCollection',
                features: [{
                    type: 'Feature',
                    geometry: { type: 'LineString', coordinates: [...coords, coords[0]!] },
                    properties: { cue },
                }],
            };
        }

        // 'front-edges' — the THREE-ARM determination is NOT re-derived here. "nobody classified
        // these edges" (undetermined) and "classified, none faces a street" (landlocked) both
        // yield nothing, for DIFFERENT reasons the card has already printed in words. A `?? []`
        // here would silently assert the landlocked finding about an unmeasured plot.
        const boundary = store?.getParcelBoundary?.() ?? null;
        const polygon = (boundary?.polygon ?? []) as ReadonlyArray<{ x: number; z: number }>;
        if (polygon.length < 3) return emptyFC();
        const determination = determineParcelEdgeClassifications(
            boundary?.edgeClassifications,
            'parcel edge classifications',
            polygon.length,
        );
        if (determination.kind !== 'determined') return emptyFC();
        const labels = determination.elements;
        const features: GeoJSON.Feature[] = [];
        for (let i = 0; i < polygon.length; i++) {
            if (labels[i] !== FRONT_EDGE) continue;
            // Each front edge is its OWN feature, so a ring with two non-adjacent frontages never
            // draws a false connecting segment between them.
            features.push({
                type: 'Feature',
                geometry: {
                    type: 'LineString',
                    coordinates: [toLonLat(polygon[i]!), toLonLat(polygon[(i + 1) % polygon.length]!)],
                },
                properties: { cue },
            });
        }
        return { type: 'FeatureCollection', features };
    }

    /**
     * ⭐ §MASSING-ON-THE-SITE-VIEWS (L-13022) — the LIVE massing candidate as a ground plate, or the
     * honest empty.
     *
     * ⛔ THE EMPTY IS HOW A WITHDRAWN PLATE COMES OFF THE MAP. `resolveLiveProposedPlate` returns
     * null when the user withdrew the proposal AND when the staleness gate withdrew it for them (the
     * envelope was re-solved, so a plate solved inside the old permitted footprint is a drawing of a
     * claim that no longer stands). Both cases push an empty FeatureCollection into this source, so
     * there is no path on which a stale plate survives a parcel or determination change.
     *
     * ⚠ REFUSES AT THE SAME FRAME GATE THE CUE AND THE ENVELOPE USE. No origin or no θ ⇒ nothing is
     * drawn: a correctly-shaped plate at a guessed bearing is the §L-446 defect, and on a rotated
     * site (Barcelona θ ≈ 45°) it would be a picture of the user's massing on the wrong land.
     */
    function buildProposedPlateFC(): GeoJSON.FeatureCollection {
        const plate = resolveLiveProposedPlate();
        if (plate === null) return emptyFC();
        const origin = getOrigin();
        const store = resolveSiteContext(runtime ?? null)?.store ?? null;
        const site = store?.getSite() ?? null;
        const thetaRad = Number.isFinite(site?.location?.trueNorth) ? site!.location!.trueNorth : null;
        if (!origin || thetaRad === null) {
            console.warn(
                '[gis] map2d §MASSING-ON-THE-SITE-VIEWS — REFUSING to draw the massing candidate: the '
                + 'site frame ORIGIN or θ could not be read. ⚠ Assuming θ = 0 would draw the right '
                + 'shape at the wrong bearing (§L-446). Nothing is drawn.',
            );
            return emptyFC();
        }
        const coords = plate.ring.map((p) => {
            const { east, north } = sceneXZToEnu(p.x, p.z, thetaRad);
            const ll = sceneXZToLatLon({ x: east, z: -north }, origin.lat, origin.lon);
            return [ll.lon, ll.lat] as [number, number];
        });
        console.log(
            `[gis] map2d §MASSING-ON-THE-SITE-VIEWS — drawing the to-be-built plate: `
            + `${plate.achievedAreaM2.toFixed(1)} m² achieved against ${plate.targetAreaM2.toFixed(1)} m² `
            + `asked (inset ${plate.insetM.toFixed(2)} m, ${plate.ring.length} corners). ORIENTATIVE — `
            + 'an intent, not what the ordinance permits and not a permit.',
        );
        return {
            type: 'FeatureCollection',
            features: [{
                type: 'Feature',
                geometry: { type: 'Polygon', coordinates: [[...coords, coords[0]!]] },
                properties: {
                    role: 'to-be-built',
                    achievedAreaM2: plate.achievedAreaM2,
                    targetAreaM2: plate.targetAreaM2,
                },
            }],
        };
    }

    /** Push the live plate (or the honest empty) into its own source. */
    function refreshProposedPlate(): void {
        const src = map.getSource(PROPOSED_PLATE_SOURCE) as GeoJSONSource | undefined;
        if (!src) return; // style is mid-swap; `installSiteHighlightLayers` re-adds + repaints.
        try {
            src.setData(buildProposedPlateFC());
        } catch (e) {
            console.warn('[gis] map2d §MASSING-ON-THE-SITE-VIEWS plate refresh failed (non-fatal):', e);
        }
    }

    /** Push the cue (or the honest empty) into its source. */
    function refreshHighlightCue(): void {
        const src = map.getSource(HIGHLIGHT_CUE_SOURCE) as GeoJSONSource | undefined;
        if (!src) return;
        src.setData(buildHighlightCueFC());
    }

    /**
     * §PARCEL-VISIBLE-EVERYWHERE — THE EMPHASIS PASS.
     *
     * ⛔ EMPHASIS MAY NEVER STRENGTHEN A CLAIM. `siteHighlightEmphasis` decides which of this
     * map's four painted roles is the SUBJECT of the clicked number; everything else RECEDES by
     * `SITE_HIGHLIGHT_RECEDE_FACTOR`. The subject is left at EXACTLY its authored weight — its
     * alpha is not raised and its hue is not touched — because the envelope's hue and fill alpha
     * ARE its honesty signal (`envelopeRenderStyle.ts`), and boosting a provisional solid to
     * "highlight" it would make an estimate read as a determination (§L-616).
     *
     * ⚠ THE ENVELOPE'S FILL IS A DATA EXPRESSION, so its recede is `['*', ['get','fillAlpha'], k]`
     * rather than a constant: each solid keeps its OWN authored alpha, multiplied. Writing a flat
     * number here would let a near-wireframe upper-bound shell come out DENSER while receding
     * than it was authored — the honesty regression the multiplier exists to make impossible.
     *
     * Never throws — a highlight is a reading aid, and the map must survive its failure.
     */
    function applySiteHighlightEmphasis(): void {
        const subject = getSiteHighlight();
        const set = (layer: string, prop: string, value: unknown): void => {
            if (!map.getLayer(layer)) return;
            map.setPaintProperty(layer, prop, value as never);
        };
        try {
            // The resting state — every layer exactly as authored. This is what makes "clear the
            // highlight" fully reversible without remembering anything.
            const k = (role: SiteHighlightRole): number =>
                subject === null || siteHighlightEmphasis(subject, role) === 'subject'
                    ? 1
                    : SITE_HIGHLIGHT_RECEDE_FACTOR;

            const parcelFill = k('parcel-fill');
            const parcelLine = k('parcel-line');
            const volume = k('envelope-volume');

            set(COMMITTED_PARCEL_FILL_LAYER, 'fill-opacity', COMMITTED_PARCEL_FILL_ALPHA * parcelFill);
            set(COMMITTED_PARCEL_LINE_LAYER, 'line-opacity', COMMITTED_PARCEL_LINE_ALPHA * parcelLine);
            // The in-flight SELECTION highlight shares the parcel's roles — it is the same plot,
            // one gesture earlier — so it recedes with it rather than staying bright behind a
            // receded committed outline.
            set(PARCEL_SELECT_FILL_LAYER, 'fill-opacity', 0.10 * parcelFill);
            set(PARCEL_SELECT_LINE_LAYER, 'line-opacity', parcelLine);
            // The DRAWN boundary ring is the same line the committed outline is, mid-authoring.
            set(LINE_LAYER, 'line-opacity', parcelLine);
            set(FILL_LAYER, 'fill-opacity', parcelFill);
            set(ENVELOPE_FILL_LAYER, 'fill-opacity',
                volume === 1 ? ['get', 'fillAlpha'] : ['*', ['get', 'fillAlpha'], volume]);
            set(ENVELOPE_LINE_LAYER, 'line-opacity', volume);
            // §MASSING-ON-THE-SITE-VIEWS (L-13022) — the to-be-built plate is the `proposal` role.
            // ⛔ It is NEVER the subject of one of the card's figures (`siteHighlightEmphasis`
            // returns 'recede' for it unconditionally): every one of those numbers is a fact about
            // the PARCEL or the ORDINANCE, and lighting the user's own plate when they click "Max
            // footprint" would answer a question about the law with a picture of a wish. Painted
            // here so it recedes WITH the rest instead of staying bright over receded surfaces.
            const proposal = k('proposal');
            set(PROPOSED_PLATE_FILL_LAYER, 'fill-opacity', TO_BE_BUILT_GROUND_FILL_ALPHA * proposal);
            set(PROPOSED_PLATE_LINE_LAYER, 'line-opacity', 0.95 * proposal);
        } catch (e) {
            console.warn('[gis] map2d §PARCEL-VISIBLE-EVERYWHERE emphasis failed (non-fatal):', e);
        }
    }

    /**
     * Register the committed-parcel + cue sources and their layers. Called from the SAME two
     * places `installRingLayers` is (`map.on('load')` and the post-`setStyle` `style.load`), for
     * the same reason: `setStyle(…, { diff:false })` wipes every added source and layer, so a
     * layer added anywhere else silently vanishes the first time the user presses Satellite.
     * Idempotent.
     *
     * ⚠ `beforeId: FILL_LAYER` — the committed parcel is the ground the drawn boundary and its
     * violet vertex handles are read against, so it is inserted BELOW them and above every
     * basemap layer. The CUE goes on top of everything: it exists only to be looked at.
     */
    function installSiteHighlightLayers(): void {
        if (!map.getSource(COMMITTED_PARCEL_SOURCE)) {
            map.addSource(COMMITTED_PARCEL_SOURCE, { type: 'geojson', data: emptyFC() });
            map.addLayer({
                id: COMMITTED_PARCEL_FILL_LAYER,
                type: 'fill',
                source: COMMITTED_PARCEL_SOURCE,
                paint: { 'fill-color': VIOLET, 'fill-opacity': COMMITTED_PARCEL_FILL_ALPHA },
            }, map.getLayer(FILL_LAYER) ? FILL_LAYER : undefined);
            map.addLayer({
                id: COMMITTED_PARCEL_LINE_LAYER,
                type: 'line',
                source: COMMITTED_PARCEL_SOURCE,
                paint: {
                    'line-color': VIOLET,
                    'line-width': COMMITTED_PARCEL_LINE_WIDTH,
                    'line-opacity': COMMITTED_PARCEL_LINE_ALPHA,
                },
            }, map.getLayer(FILL_LAYER) ? FILL_LAYER : undefined);
        }
        // §SPACE-ENVELOPE-ON-2D-MAP (L-13017) — the AUTHORED prisms, as ground footprints. Above
        // the permitted study (design intent is read AGAINST the legal ceiling, so it must be
        // legible on top of it) and still below the boundary line + its vertex handles.
        if (!map.getSource(SPACE_ENVELOPE_SOURCE)) {
            map.addSource(SPACE_ENVELOPE_SOURCE, { type: 'geojson', data: emptyFC() });
            map.addLayer({
                id: SPACE_ENVELOPE_FILL_LAYER,
                type: 'fill',
                source: SPACE_ENVELOPE_SOURCE,
                paint: { 'fill-color': ['get', 'hue'], 'fill-opacity': ['get', 'fillAlpha'] },
            }, map.getLayer(FILL_LAYER) ? FILL_LAYER : undefined);
            map.addLayer({
                id: SPACE_ENVELOPE_LINE_LAYER,
                type: 'line',
                source: SPACE_ENVELOPE_SOURCE,
                paint: { 'line-color': ['get', 'hue'], 'line-width': 2 },
            }, map.getLayer(FILL_LAYER) ? FILL_LAYER : undefined);
        }
        // §MASSING-ON-THE-SITE-VIEWS (L-13022) — the to-be-built plate, ABOVE the permitted study
        // (an intent is read AGAINST the legal ceiling, so it must be legible on top of it) and
        // still below the boundary line and its vertex handles, exactly like the authored prisms.
        if (!map.getSource(PROPOSED_PLATE_SOURCE)) {
            map.addSource(PROPOSED_PLATE_SOURCE, { type: 'geojson', data: emptyFC() });
            map.addLayer({
                id: PROPOSED_PLATE_FILL_LAYER,
                type: 'fill',
                source: PROPOSED_PLATE_SOURCE,
                // ⛔ CONSTANTS FROM THE ONE OWNER, never `['get','hue']`: a plate whose colour came
                // off its own feature could be handed a confidence hue by a future producer, and
                // this envelope carries no confidence at all (STR §25.2 — it is an INTENT).
                paint: {
                    'fill-color': TO_BE_BUILT_FILL_CSS,
                    'fill-opacity': TO_BE_BUILT_GROUND_FILL_ALPHA,
                },
            }, map.getLayer(FILL_LAYER) ? FILL_LAYER : undefined);
            map.addLayer({
                id: PROPOSED_PLATE_LINE_LAYER,
                type: 'line',
                source: PROPOSED_PLATE_SOURCE,
                // The INK: a near-white fill has no silhouette on a light basemap, and colour must
                // never be the only channel that distinguishes the three envelopes.
                paint: { 'line-color': TO_BE_BUILT_INK_CSS, 'line-width': 2, 'line-opacity': 0.95 },
            }, map.getLayer(FILL_LAYER) ? FILL_LAYER : undefined);
        }
        if (!map.getSource(HIGHLIGHT_CUE_SOURCE)) {
            map.addSource(HIGHLIGHT_CUE_SOURCE, { type: 'geojson', data: emptyFC() });
            map.addLayer({
                id: HIGHLIGHT_CUE_LINE_LAYER,
                type: 'line',
                source: HIGHLIGHT_CUE_SOURCE,
                paint: { 'line-color': VIOLET, 'line-width': 4, 'line-opacity': 0.95 },
            });
        }
        refreshCommittedParcel();
        refreshSpaceEnvelopes();
        refreshProposedPlate();
        refreshHighlightCue();
        applySiteHighlightEmphasis();
    }

    /**
     * §PARCEL-VISIBLE-EVERYWHERE (b) — *"and ZOOM IN relatively on it"*.
     *
     * ⛔ THE PARCEL'S OWN BOUNDS, NOT A CONSTANT. `getMapInitial` framed the SITE — a FIXED
     * ±250 m box about the site anchor (`source=default`), i.e. a 500 m square around a
     * 107.9 × 44.1 m plot, which is why the founder could not pick his parcel out. This asks the
     * ONE extent authority (`resolveSiteFramingExtent`), whose FIRST preference is the committed
     * boundary, and whose floor/ceiling (`SITE_FRAMING_MIN/MAX_HALF_M`) keep a tiny plot legible
     * and a large holding on screen.
     *
     * ⚠ NO COMMITTED PARCEL ⇒ NO RE-FRAME. The ±250 m site framing is still the right answer with
     * nothing committed, and this must not yank a camera the user is panning during a draw.
     */
    function frameCommittedParcel(cause: string): void {
        if (disposed) return;
        const ring = committedParcelLatLonRing();
        if (!ring) return;
        try {
            const anchor = getOrigin() ?? { lat: ring[0]!.lat, lon: ring[0]!.lon };
            const extent = resolveSiteFramingExtent({ anchor, boundary: ring });
            const [w, s, e, n] = extent.bbox;
            map.fitBounds([[w, s], [e, n]], { padding: 60, maxZoom: 19, duration: 350 });
            console.log(
                `[gis] map2d §PARCEL-VISIBLE-EVERYWHERE frame → the committed PARCEL `
                + `(cause="${cause}", source=${extent.source}, ±${Math.round(extent.halfSpanM)} m, `
                + `${ring.length} corners).`,
            );
        } catch (err) {
            console.warn('[gis] map2d §PARCEL-VISIBLE-EVERYWHERE frame failed (non-fatal):', err);
        }
    }


    // ── §SPACE-ENVELOPE-ON-2D-MAP (L-13017 · STR §26.4 · C114 / ADR-0380) — THE AUTHORED PRISM ──
    //
    // Founder, from the live build: *"I can see now the envelope on the 3D SITE view although NOT
    // on the 2D SITE VIEW."*
    //
    // ⛔ THIS IS A DIFFERENT OBJECT FROM `§MAP2D-ENVELOPE` ABOVE, AND CONFLATING THE TWO HAS
    // ALREADY COST ONE WRONG DIAGNOSIS. The L0 schema says so in its own header
    // (`packages/schemas/src/elements/SpaceEnvelope.ts`): *"⛔ IT IS NOT `BuildableEnvelope`. That
    // is the SOLVED legal ceiling … produced by the zoning engine and never authored."*
    //   · `§MAP2D-ENVELOPE` (above) draws the PERMITTED STUDY — the solved legal ceiling, with a
    //     confidence, a derivation trace and a refusal vocabulary. This map already drew it, which
    //     is exactly why the founder's console could log `drawing N envelope footprint(s)` in the
    //     same session he reports seeing no envelope.
    //   · THIS block draws what he AUTHORS: `role: 'level'` prisms minted by
    //     `spaceEnvelope.batch.create`, `standing: 'design-intent'`.
    //
    // ⭐ ONE MODEL, THREE RASTERISERS — the shape `§SPACE-ENVELOPE-IN-CESIUM` established. The road
    // is `Store.subscribeDirty()`, which `applyPatch()` notifies on EXECUTE, UNDO and REDO alike,
    // so this needs no bus subscriber and no second render channel to disagree with the first.
    // ⛔ Do not "improve" it into a bus-event subscriber without changing `performUndoRedo.ts`'s
    // generic `spaceEnvelope` row in the same commit.
    //
    // ⛔ AND IT MINTS NO SECOND PALETTE. `resolveSpaceEnvelopeAppearance` is the one authority for
    // the colour and the opacity — including the §TOBE-ENVELOPE ruling that moved the level
    // envelope OFF `#6600FF` so an intent volume stops wearing the confident-violet CONFIDENCE
    // BADGE that C58 §1.2 reserves for a determination. Re-deriving a hue here would put the
    // surfaces one commit away from disagreeing about what a colour means.
    //
    // ⚠ A FOOTPRINT, NOT A FAKE BOX — the same argument `§MAP2D-ENVELOPE` makes for the study
    // solid: this map is pitch-locked, so a `fill-extrusion` reads as a flat fill with a
    // misleading offset. The honest 2D representation of a prism is the ground polygon it stands
    // on. The HEIGHT is not dropped silently — the 3D Site and the PRYZM view draw it.

    /** The one shape this map reads off a space-envelope record. Structural, never a cast. */
    interface Map2DSpaceEnvelopeRecord {
        readonly role?: string;
        readonly name?: string;
        readonly occupancy?: string;
        readonly materialColor?: string;
        readonly footprintAreaM2?: number;
        readonly footprint?: ReadonlyArray<{ readonly x: number; readonly z: number }>;
        readonly baseOffset?: number;
        readonly height?: number;
    }

    /**
     * Project every AUTHORED space envelope into map-frame GeoJSON — or into an HONEST EMPTY.
     *
     * ⚠ C57 §1.5 — A FAILURE IS NEVER DRESSED AS AN EMPTY. Four different reasons yield no
     * features and each says which it is: nothing authored (the resting state); the store is
     * unreachable; the projection ORIGIN is unavailable (a prism at a guessed origin is a
     * confidently wrong answer about where someone intends to build); θ could not be READ, which
     * is NOT θ = 0 (§L-446 — the right shape at the wrong bearing on any rotated site).
     */
    function spaceEnvelopeFeatureCollection(): GeoJSON.FeatureCollection {
        const store = runtime?.stores?.spaceEnvelope as
            { getState?: () => ReadonlyMap<string, unknown> } | undefined;
        if (!store || typeof store.getState !== 'function') return emptyFC();
        let records: ReadonlyMap<string, unknown>;
        try { records = store.getState(); } catch { return emptyFC(); }
        if (records.size === 0) return emptyFC();

        const origin = getOrigin();
        if (!origin) {
            console.warn(
                `[gis] map2d §SPACE-ENVELOPE-ON-2D-MAP — ${records.size} authored envelope(s) exist `
                + 'but NO site frame ORIGIN is resolvable, and they are authored in scene-XZ metres '
                + 'ABOUT that origin. Drawing nothing rather than placing design intent at a guessed '
                + 'point on the Earth (C57 §1.5). They appear as soon as the site frame seats.',
            );
            return emptyFC();
        }
        const site = resolveSiteContext(runtime ?? null)?.store?.getSite() ?? null;
        const location = site?.location ?? null;
        if (!location) {
            console.warn(
                '[gis] map2d §SPACE-ENVELOPE-ON-2D-MAP — REFUSING to draw the authored envelope(s): '
                + 'the site store is unreachable, so θ (SiteLocation.trueNorth) could not be READ. '
                + '⚠ This is NOT the same as θ = 0 — assuming 0 draws a correctly-shaped footprint at '
                + `the wrong BEARING on any rotated site. ${records.size} withheld.`,
            );
            return emptyFC();
        }
        const thetaRad = Number.isFinite(location.trueNorth) ? location.trueNorth : 0;

        const features: GeoJSON.Feature[] = [];
        let skipped = 0;
        for (const [id, raw] of records) {
            const rec = raw as Map2DSpaceEnvelopeRecord | null | undefined;
            const ring = rec?.footprint;
            // A malformed row is SKIPPED and COUNTED, never guessed at and never fatal — one bad
            // record must not take the map down.
            if (!Array.isArray(ring) || ring.length < 3) { skipped += 1; continue; }
            try {
                const appearance = resolveSpaceEnvelopeAppearance({
                    id,
                    role: rec?.role,
                    name: rec?.name,
                    occupancy: rec?.occupancy,
                    materialColor: rec?.materialColor,
                    footprintAreaM2: rec?.footprintAreaM2,
                    height: rec?.height,
                });
                const coords = ring.map((p) => {
                    const { east, north } = sceneXZToEnu(p.x, p.z, thetaRad);
                    const ll = sceneXZToLatLon({ x: east, z: -north }, origin.lat, origin.lon);
                    return [ll.lon, ll.lat] as [number, number];
                });
                features.push({
                    type: 'Feature',
                    geometry: { type: 'Polygon', coordinates: [[...coords, coords[0]!]] },
                    properties: {
                        id,
                        role: rec?.role ?? 'room',
                        // ⭐ The colour travels ON THE FEATURE, straight off the one appearance
                        // authority, so the paint below is a dumb `['get', …]` and this file holds
                        // no space-envelope knowledge.
                        hue: appearance.colour,
                        fillAlpha: appearance.opacity,
                    },
                });
            } catch (e) {
                skipped += 1;
                console.warn(`[gis] map2d §SPACE-ENVELOPE-ON-2D-MAP envelope "${id}" failed — skipped:`, e);
            }
        }
        console.log(
            `[gis] map2d §SPACE-ENVELOPE-ON-2D-MAP — drew ${features.length}/${records.size} AUTHORED `
            + `envelope footprint(s)${skipped > 0 ? ` · ${skipped} skipped as unreadable` : ''} · `
            + `standing='design-intent' (NOT the permitted study — that is §MAP2D-ENVELOPE) · `
            + `θ=${(thetaRad * 180 / Math.PI).toFixed(2)}°.`,
        );
        return { type: 'FeatureCollection', features };
    }

    /** Push the authored envelope footprint(s) — or the honest empty — into the map source. */
    function refreshSpaceEnvelopes(): void {
        const src = map.getSource(SPACE_ENVELOPE_SOURCE) as GeoJSONSource | undefined;
        if (!src) return; // style is mid-swap; `installSiteHighlightLayers` re-adds + repaints.
        src.setData(spaceEnvelopeFeatureCollection());
    }

    /**
     * §TOP-STACK (L-13090) — the ONE writer of the instruction column's box.
     *
     * ⭐ EVERY INPUT IS A READING, NEVER A REMEMBERED FLAG. `modeBar.style.display` and
     * `parcelCard.style.display` are the facts; a mirrored boolean beside them is how two
     * pieces of chrome come to disagree about which of them is on screen, and this file has
     * already paid for that once (`§UX-PARCEL-SELECT-DEFAULT`, where the opening chrome and the
     * opening mode disagreed). Idempotent, so it may be called from every state change.
     */
    function refreshTopStack(): void {
        // The draw-mode strip is a top-centre float this column does not own (it is the shared
        // `.wdh-bar`), so the column starts below it whenever it is up.
        const modeBarUp = modeBar.style.display !== 'none';
        topStack.style.top = modeBarUp ? '96px' : '52px';

        // The right gutter. Three states, and the third is why this is a function:
        //   'on'    — the card is in its default right slot, so the column stops short of it by
        //             `--map2d-top-stack-right`, the SAME token that sizes the card.
        //   'moved' — the user has DRAGGED the card. Its column no longer means anything, so the
        //             reservation is dropped and the banner takes the width back. The column sits
        //             at z-index 23 against the card's 22, so if he parks the card under the
        //             banner the banner still reads (and is `pointer-events:none`, so his clicks
        //             still reach the card underneath).
        //   'off'   — no card. 176px clears the Map|Satellite toggle (top:52px; right:12px,
        //             ~152px wide) and nothing else is out there.
        const cardUp = parcelCard.style.display !== 'none';
        const cardMoved = parcelCard.getAttribute(DRAG_PINNED_ATTR) === '1';
        const state = !cardUp ? 'off' : (cardMoved ? 'moved' : 'on');
        overlay.setAttribute('data-parcel-card', state);
        const gutter = state === 'on' ? 'var(--map2d-top-stack-right)' : '176px';
        topStack.style.right = gutter;

        // ⭐ §PANE-CENTRED-REDRAW (L-13185) — THE LEFT INSET MIRRORS THE RIGHT ONE, SO THE COLUMN'S
        // CENTRE IS THE PANE'S CENTRE. `align-items: center` centres on the COLUMN; an asymmetric
        // column therefore centres nothing on the pane, and that is the whole of the founder's
        // *"Aligne pane"* arrow (see `REDRAW_PILL_RESERVE_PX` for the arithmetic that reproduces
        // his measured 392px). Mirroring is pure percentage CSS, so it re-centres on every splitter
        // drag and in all three gutter states above, with nothing to re-measure in JS.
        //
        // ⛔ TEXT WIDTH BEATS CENTRING, AND THAT PRIORITY IS WHY THIS IS A CONDITIONAL. Mirroring
        // costs the column the same width on the left that the card costs it on the right, which a
        // 150px pill does not notice and a two-clause SENTENCE cannot survive — it is exactly the
        // shredded ribbon §BANNER-NEVER-STARVES exists to prevent, arriving by the other side. So
        // while the banner is up the column keeps today's asymmetric box and its measured
        // clearance arithmetic UNCHANGED; only a column carrying nothing but pills is centred.
        // The two never contend in practice — `freezeDraw` hides the banner and shows the pill,
        // `rearmDraw` does the reverse — but the rule is stated rather than assumed, because "they
        // cannot both be up" is exactly the kind of invariant that quietly stops being true.
        //
        // ⚠ AND THE MIRROR IS CLAMPED. `clamp(12px, <what the pane can spare>, <the full gutter>)`
        // hands the left side the full mirror whenever `W − 2G ≥ 168px`, and gives up exactly the
        // shortfall below that — degrading toward today's left-biased placement rather than
        // shoving the pill onto the Map|Satellite toggle it is reserving against.
        const bannerUp = chip.style.display !== 'none';
        topStack.style.left = bannerUp
            ? `${TOP_STACK_LEFT_PX}px`
            : `clamp(${TOP_STACK_LEFT_PX}px, calc(100% - ${gutter} - ${REDRAW_PILL_RESERVE_PX}px), ${gutter})`;
    }

    /**
     * ⭐ §COMMITTED-MAP-IS-ONE-ACTION (L-13186) — the ONE writer of the banner's TEXT **and** of
     * its visibility, because after 2026-09-07 those are one decision rather than two.
     *
     * Founder, red cross drawn straight through the banner in the committed split view:
     * *"we dont need: 'click a plot....'"*. That sentence is `PARCEL_RESELECT_CHIP` and it is the
     * ONLY thing this pill ever says on a committed site — every other string it carries is either
     * a live DRAWING instruction (impossible while committed) or TRANSIENT PROGRESS
     * (*"Fetching parcel…"*, *"Large holding — looking for the building outline…"*, the
     * no-cadastral-source notice), which he did not cross out and which would be a real loss.
     *
     * So the rule is stated as what it is — *hide the sentence he crossed out, keep the rest* —
     * and it is DERIVED FROM THE SENTENCE ITSELF rather than from a `committed` flag mirrored
     * beside it. `refreshTopStack`'s own header records why this file works that way: a mirrored
     * boolean is how two pieces of chrome come to disagree about which of them is on screen.
     *
     * ⛔ NO CAPABILITY IS ATTACHED TO THIS NODE. It arms nothing and dispatches nothing; the
     * plot-clicking it described is armed by `interactionMode === 'select'`, which `freezeDraw`
     * sets unconditionally, and the route it named is still stated on the parcel card itself by
     * `PARCEL_LAW_PLOT_ROUTE_NOTE` (§SELECT-PARCEL-IS-A-VIEW-ACTION).
     */
    function setChip(text: string): void {
        chip.textContent = text;
        // §FIX-SITE-OVERLAY-IMPORT-TERMINAL (L-70) — overlay-only mode has no boundary to trace,
        // so the pill is hidden there whatever it is carrying.
        chip.style.display = opts.overlayOnly || text === PARCEL_RESELECT_CHIP ? 'none' : '';
        // The column's box reads the banner's visibility (§PANE-CENTRED-REDRAW), so changing one
        // without re-reading the other is how the pill would stay off-centre after the banner went.
        refreshTopStack();
    }

    /** Hide + empty the parcel info card. */
    function hideParcelCard(): void {
        parcelCard.style.display = 'none';
        parcelCard.replaceChildren();
        refreshTopStack();
    }

    /**
     * ⭐ §RESELECT-PARCEL (L-13094 · C19 §5.6 clause 4) — CLEAR THE SELECTION AND RE-ARM PICKING.
     *
     * Founder 2026-09-07: *"on the panel where it says use this parcel - add - the optin to
     * re-select parcel to change parcel"*.
     *
     * ⛔ THIS MINTS NO MECHANISM. Every line below already existed, inline, in
     * `handleParcelSelectClick`'s no-parcel branch — the state this map ALREADY returns to when
     * a click finds nothing. It is extracted here so the founder's new action and that branch
     * are the same code rather than two routines that can drift into two different ideas of
     * what "no parcel selected" means. A second re-select path beside this one would be the
     * rival-solver defect this repo keeps re-paying for (rival commandManager counters, rival
     * compose roots), and it would be a defect with a legal surface attached: two ways to clear
     * a selection is two ways to leave a highlight painted over land the user is no longer
     * looking at.
     *
     * SELECT mode is asserted rather than assumed: the card is only reachable from SELECT
     * today, but `setInteractionMode` early-returns when the mode already matches, so asserting
     * it costs nothing and stops the action becoming a no-op if a future host mounts the card
     * from anywhere else.
     */
    function clearParcelSelection(reason: 'user-reselect' | 'no-parcel-here'): void {
        if (disposed) return;
        if (interactionMode !== 'select') setInteractionMode('select');
        selectedParcel = null;
        oversizeHolding = null;
        try { refreshParcelHighlight(); } catch { /* style may be swapping */ }
        hideParcelCard();
        setChip(committed
            ? PARCEL_RESELECT_CHIP
            : 'Click a plot to select its real cadastral parcel · Esc to cancel');
        try { map.getCanvas().style.cursor = 'crosshair'; } catch { /* ignore */ }
        console.log(`[gis] §RESELECT-PARCEL (L-13094): selection cleared, picking re-armed — ${reason}.`);
    }

    /**
     * §L-1581 — render the parcel info card by MOUNTING the one producer.
     *
     * This function used to build ~90 lines of DOM inline. Everything it decided — which
     * rows exist, whether a footprint gets a warning, which area basis is shown, how the
     * source is attributed — now lives in `parcelCard.ts`, which the GIS rail panel also
     * mounts. The map contributes only its two ACTIONS, because those are genuinely
     * map-specific (they drive this modal's commit and its draw mode); the FACTS are not.
     */
    function showParcelCard(parcel: ParcelFeature, footprint: ParcelFeature | null = null): ParcelCandidateChoice {
        parcelCard.replaceChildren();
        // §L-12912 — the label is the cadastre that ACTUALLY answered (resolved from the parcel's
        // own `source`), not this host's generic registry label "Cadastral parcel / building
        // footprint" — which is what the Belverde card printed. Same resolver as the commit.
        const labelOf = (f: ParcelFeature): string | null =>
            resolveParcelAttribution(f, parcelProvider?.label ?? null).label;
        const cadastralModel = parcelFeatureToCardModel(parcel, labelOf(parcel));
        // §L-12912 — a fetched ring above the review ceiling (a 766 ha prédio under a house) is a
        // CANDIDATE, not "your parcel". Lane PT-BELVERDE-LOTS: when an OSM footprint exists under
        // the click, THAT is the primary candidate (titled as a house outline, never as a parcel —
        // C57 §1.5 / §1.9); otherwise Draw is primary. Either way the holding stays one deliberate
        // click away with both numbers in view (C83 §1.2) — it is never disabled and never hidden.
        const size = assessParcelSize(cadastralModel);
        const choice = chooseParcelCandidate({ cadastral: parcel, size, footprint });
        selectedParcel = choice.shown;
        oversizeHolding = choice.holding;
        try { refreshParcelHighlight(); } catch { /* style may be swapping */ }

        const shownModel = choice.shown === parcel ? cadastralModel : parcelFeatureToCardModel(choice.shown, labelOf(choice.shown));
        const draw = {
            label: choice.primary === 'cadastral' ? 'Draw instead' : 'Draw my lot instead  →',
            testId: 'parcel-draw-btn',
            variant: choice.primary === 'draw' ? 'primary' as const : 'secondary' as const,
            onClick: () => setInteractionMode('draw'),
        };
        // ⭐ §RESELECT-PARCEL (L-13094) — the founder's third path off this card. It is the
        // SAME state the map returns to when a click finds no parcel (`clearParcelSelection`);
        // the card contributes a label, not a mechanism. Always last: the two commits and the
        // draw escape are decisions about THIS plot, and this one un-asks the question.
        const reselect = {
            label: '↺ Choose a different parcel',
            testId: PARCEL_RESELECT_BTN_TESTID,
            variant: 'secondary' as const,
            title: 'Clears this selection and re-arms picking — click another plot on the map. '
                + 'Nothing is committed and nothing about the project changes.',
            onClick: () => clearParcelSelection('user-reselect'),
        };
        const holdingHa = size.areaM2 !== null ? Math.round(size.areaM2 / 10_000) : null;
        const holdingTitle = holdingHa !== null
            ? `Commits the whole ${holdingHa} ha parcel as your site. `
              + 'If you clicked a house, its lot is not in the published cadastre — draw it instead.'
            : undefined;
        // §CONTINUE-WITH-THIS-PARCEL (L-13026) — the card is now reachable in TWO states, and they
        // demand different words. Pre-commit, "Use this parcel" ADDS the project's first plot;
        // post-commit it REPLACES one. Same producer, same button, one honest sentence apart —
        // and the note rides the existing `leadNotes` channel rather than a second banner.
        const replacing = committed;
        const useTitle = (fallback?: string): string | undefined =>
            replacing ? PARCEL_REPLACE_TITLE : fallback;
        const replaceNotes = replacing
            ? [{ text: PARCEL_REPLACE_NOTE, testId: PARCEL_REPLACE_NOTE_TESTID, tone: 'note' as const }]
            : [];

        if (choice.primary === 'footprint') {
            // The house outline leads; the holding is a NAMED secondary commit through the same path.
            const useFootprint = {
                label: 'Use my house outline  →',
                testId: 'parcel-use-btn',
                variant: 'primary' as const,
                title: useTitle('Commits the OSM building outline as a STARTING boundary. It is the building, '
                    + 'not the land: adjust it or draw your lot for the legal line.'),
                onClick: () => useSelectedParcel(),
            };
            const useHolding = {
                label: choice.useHoldingLabel ?? 'Use the holding anyway',
                testId: PARCEL_USE_HOLDING_TESTID,
                variant: 'secondary' as const,
                title: useTitle(holdingTitle),
                onClick: () => {
                    if (!oversizeHolding) return;
                    selectedParcel = oversizeHolding;
                    useSelectedParcel();
                },
            };
            const holdingBanner = parcelSizeReviewText(size, cadastralModel);
            parcelCard.appendChild(buildParcelCard(shownModel, {
                title: choice.cardTitle ?? undefined,
                leadNotes: [
                    ...replaceNotes,
                    ...(choice.why ? [{ text: choice.why, testId: PARCEL_CANDIDATE_WHY_TESTID }] : []),
                    // Keep the displaced holding's own size-review banner in view: the footprint on
                    // the card is `within`, and the warning must not vanish with the ring it judged.
                    ...(holdingBanner ? [{ text: holdingBanner, testId: PARCEL_SIZE_REVIEW_TESTID }] : []),
                ],
                actions: [useFootprint, useHolding, draw, reselect],
            }));
        } else {
            const use = {
                label: choice.primary === 'draw'
                    ? (choice.useHoldingLabel ?? 'Use this large parcel anyway')
                    : 'Use this parcel  →',
                testId: 'parcel-use-btn',
                variant: choice.primary === 'draw' ? 'secondary' as const : 'primary' as const,
                title: useTitle(choice.primary === 'draw' ? holdingTitle : undefined),
                onClick: () => useSelectedParcel(),
            };
            parcelCard.appendChild(buildParcelCard(shownModel, {
                leadNotes: [
                    ...replaceNotes,
                    ...(choice.why ? [{ text: choice.why, testId: PARCEL_CANDIDATE_WHY_TESTID, tone: 'note' as const }] : []),
                ],
                actions: choice.primary === 'draw' ? [draw, use, reselect] : [use, draw, reselect],
            }));
        }
        parcelCard.style.display = 'block';
        refreshTopStack();
        return choice;
    }

    /**
     * §L-384 — the honest "cadastral data not wired yet" card, shown when this map was
     * constructed with NO parcel provider at all.
     *
     * §L-1581 REWROTE THIS. It used to render SAMPLE VALUES — a placeholder referencia, a
     * placeholder half-a-thousand-square-metre area and a placeholder zone — behind a
     * "connecting to cadastral data" banner. That is a fabricated fact wearing a warning
     * label, and it is the shape C84 EI-1b forbids: a reader who skims past the banner
     * reads the placeholder area as this plot's area. (The literal strings are deliberately
     * NOT quoted here — a source-scanning test asserts they are gone from this file.)
     * The honest card for "we have no provider" is a STATED ABSENCE with no numbers in it
     * at all, and the escape hatch ("Draw instead") intact so the user is never trapped.
     */
    function showStubParcelCard(): void {
        parcelCard.replaceChildren();
        parcelCard.appendChild(buildParcelCard(null, {
            absentText:
                'No cadastral data source is connected for this location, so nothing about this '
                + 'plot has been looked up. No reference, address or area is shown because none '
                + 'is known — not because they are zero. Draw the boundary instead; you can '
                + 'select a real parcel wherever a cadastre is reachable.',
            actions: [
                {
                    label: 'Use this parcel  →',
                    testId: 'parcel-use-btn',
                    variant: 'primary',
                    disabled: true,
                    title: 'Nothing has been looked up here — there is no parcel to commit. Draw instead.',
                    onClick: () => { /* disabled — see title */ },
                },
                {
                    label: 'Draw instead',
                    variant: 'secondary',
                    onClick: () => setInteractionMode('draw'),
                },
            ],
        }));
        parcelCard.style.display = 'block';
        refreshTopStack();
        setChip('No cadastral source is connected here — draw the boundary instead · Esc to cancel');
    }

    /** Highlight the active interaction-mode segment (violet). */
    function paintInteractionToggle(): void {
        for (const b of [selectModeBtn, drawModeBtn]) {
            const active = b.dataset['inter'] === interactionMode;
            b.style.background = active ? VIOLET : 'transparent';
            b.style.color = active ? '#ffffff' : '#2a2438';
            b.setAttribute('aria-pressed', String(active));
            // §CONTINUE-WITH-THIS-PARCEL (L-13026) — a REFUSING segment reads as refusing.
            // `disabled` is set by `freezeDraw` (draw) / cleared by `rearmDraw`; the opacity is
            // derived from it here rather than written beside every flip, so the two can never
            // disagree about whether a segment is available.
            b.style.opacity = b.disabled ? '0.45' : '1';
        }
    }

    /**
     * Switch between DRAW and SELECT interaction modes. DRAW restores the draw-mode
     * strip + instruction; SELECT hides them, clears any in-progress draw, and arms
     * the parcel picker. Clears the parcel highlight/card when leaving SELECT.
     */
    function setInteractionMode(next: 'draw' | 'select'): void {
        if (disposed || next === interactionMode) return;
        // §CONTINUE-WITH-THIS-PARCEL (L-13026) — this guard used to read `|| committed ||`, which
        // froze BOTH modes on commit. Only DRAW is genuinely impossible then (the C19 §1.4 polygon
        // is a one-shot; "↺ Redraw boundary" is the route that clears it). SELECT stays open, and
        // that is the founder's "continue with this parcel" route on the view.
        if (committed && next === 'draw') {
            toast('This site already has a parcel boundary. Press “↺ Redraw boundary” to clear it first.', 'info');
            return;
        }
        interactionMode = next;
        // Clear any in-progress draw so the two modes never bleed.
        rectCornerA = null; circleCentre = null; ellipseCentre = null;
        vertices.length = 0; snapTarget = null; cursorLL = null;
        try { refreshRing(); } catch { /* style may be swapping */ }
        try { refreshSnapIndicator(); } catch { /* ignore */ }
        try { refreshDimLabels(); } catch { /* ignore */ }
        try { refreshRadiusLabel(); } catch { /* ignore */ }

        if (next === 'select') {
            modeBar.style.display = 'none';
            // §CONTINUE-WITH-THIS-PARCEL — after a commit there is nothing to "cancel", and the
            // consequence of proceeding is different. Say which state the reader is in.
            setChip(committed
                ? PARCEL_RESELECT_CHIP
                : 'Click a plot to select its real cadastral parcel · Esc to cancel');
        } else {
            // Back to DRAW — drop the parcel highlight + card (+ any displaced holding, §L-12912).
            selectedParcel = null;
            oversizeHolding = null;
            try { refreshParcelHighlight(); } catch { /* ignore */ }
            hideParcelCard();
            if (!opts.overlayOnly) modeBar.style.display = '';
            refreshModeChrome();
        }
        paintInteractionToggle();
        refreshEditBar();
        try { map.getCanvas().style.cursor = next === 'select' ? 'crosshair' : ''; } catch { /* ignore */ }
        console.log(`[gis] map2d: interaction mode → ${next}`);
    }

    /**
     * §PARCEL-SELECT — on a click in SELECT mode, fetch the real parcel under the
     * cursor via the provider (same-origin proxy) and render its violet highlight +
     * info card. A miss shows a clean "no parcel here" toast and does NOT break the
     * draw path. Guarded against overlapping fetches + teardown.
     */
    function handleParcelSelectClick(e: MapMouseEvent): void {
        // §CONTINUE-WITH-THIS-PARCEL (L-13026) — `committed` is NOT a reason to ignore a parcel
        // click. See `freezeDraw` for why selection outlives the commit and drawing does not.
        if (disposed || parcelFetchInFlight) return;
        const { lng, lat } = e.lngLat;
        // §L-384 — DATA NOT WIRED for this deployment: render the honest placeholder card
        // (the full select UI is present + demoable; the real fetch lands with the parcel
        // provider, L-380 P0/P1). Never a silent no-op — the user sees exactly what's pending.
        if (!parcelProvider) { showStubParcelCard(); return; }
        parcelFetchInFlight = true;
        setChip('Fetching parcel…');
        try { map.getCanvas().style.cursor = 'progress'; } catch { /* ignore */ }
        // ⭐ §UPSTREAM-UNREACHABLE-IS-NOT-A-MISS (L-13295) — ask the HONEST lookup when we can.
        // `parcelProvider.fetchParcelAtPoint` narrows three outcomes to `ParcelFeature | null`,
        // and this handler then reads `null` as "there is no parcel here". For the Catastro
        // provider we can do better: `fetchParcelOutcomeAtPoint` keeps miss and unreachable
        // apart, and the `!parcel` branch below refuses to erase the user's selection on the
        // latter. Any other provider keeps exactly today's behaviour — the narrowing is explicit
        // and local, never a silent widening of someone else's contract.
        const lookup: Promise<{ parcel: ParcelFeature | null; unreachable: string | null }> =
            parcelProvider === catastroParcelProvider
                ? fetchParcelOutcomeAtPoint(lng, lat).then((o) => (
                    o.status === 'ok'
                        ? { parcel: o.parcel, unreachable: null }
                        : { parcel: null, unreachable: o.status === 'unreachable' ? o.reason : null }
                ))
                : parcelProvider.fetchParcelAtPoint(lng, lat).then((pf) => ({ parcel: pf, unreachable: null }));
        void lookup.then(({ parcel, unreachable }) => {
            // §L-12912 — the in-flight guard is released in the FINAL `.then` below, after the
            // optional footprint lookup, so a second click cannot race a half-rendered card.
            if (disposed || interactionMode !== 'select') { parcelFetchInFlight = false; return; }
            try { map.getCanvas().style.cursor = 'crosshair'; } catch { /* ignore */ }
            // ⛔⛔ §UPSTREAM-UNREACHABLE-IS-NOT-A-MISS (founder 2026-09-09 · L-13295) — AN
            //     OUTAGE MUST NOT ERASE HIS SELECTION, AND MUST NOT BLAME HIS LAND.
            //
            // FOUNDER: *"why all the parcels i have selected say: envelope temporarily not
            // available - many of those were created proper envelopes before - now nothing?"*
            //
            // This branch used to run for BOTH outcomes, because everything upstream returned
            // `null` for both. So a degraded Catastro — after up to 15 s per leg, retried, across
            // a point→refcat→geometry walk — called `clearParcelSelection()`, wiped the highlight
            // he had just made, and told him "No parcel found here". His land was fine; the
            // source was down. That is the founder's "doesn't get highlighted" and his "took
            // really long to fetch" as ONE defect, and this is the arm where it was visible.
            //
            // ⛔ NOTHING IS CLEARED ON AN OUTAGE. A selection is the user's, not the source's;
            // discarding it because a server did not answer destroys work over a transient. The
            // sentence names the source, says it is temporary, and says what to do — the shape
            // §CONTEXT-DATA-HONESTY requires of every refusal.
            if (unreachable !== null) {
                parcelFetchInFlight = false;
                console.warn(`[gis] §UPSTREAM-UNREACHABLE-IS-NOT-A-MISS the cadastral source did `
                    + `not answer at ${lat.toFixed(6)}, ${lng.toFixed(6)} — ${unreachable}. The `
                    + `selection is KEPT: this says nothing about whether a parcel exists here.`);
                setChip('Cadastre unavailable');
                toast('The cadastral service did not answer — this is a source outage, not a '
                    + 'finding about your plot. Your selection is kept; try again in a moment.', 'info');
                return;
            }
            if (!parcel) {
                parcelFetchInFlight = false;
                // §RESELECT-PARCEL (L-13094) — these six lines WERE this branch, inline. They are
                // now the one routine the founder's "choose a different parcel" action calls too,
                // so the two cannot drift into two ideas of "nothing is selected".
                // ⭐ REACHED ONLY ON A VERIFIED MISS NOW: the source answered and holds nothing
                // here. That is a real finding about the land and clearing is the right act.
                clearParcelSelection('no-parcel-here');
                toast('No parcel found here — try again or draw manually.', 'info');
                return;
            }
            // §L-12912 (PT-BELVERDE-LOTS) — an OVERSIZE cadastral answer earns one more lookup: the
            // OSM footprint under the same click, so the card can lead with the house outline
            // instead of a village-sized holding. `within` answers render immediately as before;
            // the footprint provider never throws and a null is the honest "nothing smaller here".
            const preview = assessParcelSize(parcelFeatureToCardModel(parcel));
            const footprintP: Promise<ParcelFeature | null> = preview.status === 'oversize'
                ? footprintParcelProvider.fetchParcelAtPoint(lng, lat).catch((err: unknown) => {
                    console.warn('[gis] §L-12912 footprint lookup for an oversize holding failed (non-fatal):', err);
                    return null;
                })
                : Promise.resolve(null);
            if (preview.status === 'oversize') setChip('Large holding — looking for the building outline under your click…');
            return footprintP.then((footprint) => {
                parcelFetchInFlight = false;
                if (disposed || interactionMode !== 'select') return;
                const choice = showParcelCard(parcel, footprint);
                setChip(choice.chip);
                console.log(
                    `[gis] §L-12912 parcel candidate: primary=${choice.primary}` +
                    (choice.holding ? ` holding=${choice.holding.refcat} (${Math.round(choice.holding.areaM2)} m²)` : '') +
                    (choice.primary === 'footprint' ? ` footprint=${choice.shown.refcat}` : ''),
                );
            });
        }).catch((err) => {
            parcelFetchInFlight = false;
            console.warn('[gis] parcel fetch failed (non-fatal):', err);
            if (!disposed) toast('Parcel lookup failed — try again or draw manually.', 'error');
        });
    }

    /**
     * §PARCEL-SELECT — commit the selected parcel as the site boundary through the
     * EXACT path a DRAWN boundary uses: load the ring into `vertices` and call
     * `commit()` (buildBoundaryFromLatLonRing → dispatchSiteLocation? → dispatchParcelBoundary
     * → site.parcel-boundary-set). No one-off path — generation consumes it unchanged.
     */
    function useSelectedParcel(): void {
        if (disposed || !selectedParcel) return;
        const ring = selectedParcel.ring;
        if (ring.length < 3) { toast('Selected parcel has no usable boundary.', 'error'); return; }
        // ⭐ §CONTINUE-WITH-THIS-PARCEL (L-13026 · C19 §1.4) — PROCEEDING FROM A COMMITTED SITE
        // TRAVELS THE ONE LEGAL ROUTE, IT DOES NOT MINT A SECOND ONE.
        //
        // The C19 parcel polygon is an IMMUTABLE one-shot, so `commit()` below would refuse
        // (§FIX-BOUNDARY-COMMIT-REFUSE / ADR-0299) — correctly. The only legal way to change it
        // is CLEAR-then-recreate, and that route already exists and is already reachable: it is
        // exactly what "↺ Redraw boundary" runs. So this composes the two shipped calls in the
        // shipped order rather than writing a third path: `rearmDraw()` (site.replace → empty
        // boundary, un-freeze) and then the same commit every other arm of this function uses.
        //
        // ⛔ THE GESTURE IS THE CONSENT, AND THE CARD SAYS SO BEFORE IT IS MADE. The button that
        // reaches here on this arm carries `PARCEL_REPLACE_TITLE` and the card carries
        // `PARCEL_REPLACE_NOTE`, both naming the replacement in advance — this must never be a
        // silent re-write of a plot the user still believes they have (ASK, never auto-edit).
        if (committed) {
            // `rearmDraw()` clears `selectedParcel` on its way through; hold it across the clear
            // so the parcel the user actually clicked is the one that gets committed.
            const keep = selectedParcel;
            console.log('[gis] map2d §CONTINUE-WITH-THIS-PARCEL — replacing the committed boundary '
                + `with ${keep.refcat ?? 'the selected parcel'} through the CLEAR-then-recreate route.`);
            rearmDraw();
            if (disposed || committed) {
                // The clear did not take (no site context, or a dispatch refusal that left the
                // freeze in place). Change nothing else and say so — never fall through into a
                // commit that would be refused with the boundary already gone.
                console.warn('[gis] map2d §CONTINUE-WITH-THIS-PARCEL — the boundary was not cleared; '
                    + 'the committed plot is unchanged. Use "↺ Redraw boundary" and select again.');
                toast('Could not release the committed boundary — press “↺ Redraw boundary”, then select again.', 'error');
                return;
            }
            selectedParcel = keep;
        }
        // §STARTUP-SELECT-IS-NOT-DWELL (L-12931) — THE GESTURE. Everything before this line is the
        // user dwelling on the 2D map; `parcel:selected → parcel:committed → envelope:dispatched`
        // is the machine leg the founder times as "selection on 2d to render on 3d". The full
        // reading (why `parcel:committed +159845ms` is NOT 160 s of work) is in `startupBudget.ts`.
        markStartupPhase('parcel:selected'); // §STARTUP-BUDGET
        // §L-1580 — capture the attribution BEFORE `selectedParcel` is dropped two lines below.
        //
        // The per-jurisdiction row is resolved at the parcel's OWN first vertex and its OWN
        // `source`, not at the map centre: a click near a national border routes by point, and
        // attributing the parcel to the country the viewport happens to be centred on would be a
        // wrong attribution that still looks well-formed. §L-12912: the SAME resolver the card
        // used before the commit (`resolveParcelAttribution`), so what was shown and what is
        // stored cannot differ; a footprint fallback never inherits a cadastre's label.
        const attribution = resolveParcelAttribution(selectedParcel, parcelProvider?.label ?? null);
        pendingParcelProvenance = parcelFeatureToProvenance(selectedParcel, {
            providerLabel: attribution.label,
            jurisdictionId: attribution.regionCode,
        });
        vertices.length = 0;
        for (const p of ring) vertices.push({ lat: p.lat, lon: p.lon });
        // Drop the violet parcel highlight — the committed boundary now renders through
        // the normal green ring path, identical to a drawn boundary.
        selectedParcel = null;
        oversizeHolding = null; // §L-12912 — a later draw never inherits this click's holding
        try { refreshParcelHighlight(); } catch { /* ignore */ }
        hideParcelCard();
        refreshRing();
        commit();
        // ⭐⭐ §PARCEL-OPENS-THE-SITE-TAB (L-13255) — FOUNDER: *"when the user select the parcel the
        // site tab (top) shall open to start the first iteration of reviewing the parcel data"*.
        //
        // ⛔ GATED ON `committed`, NEVER ON REACHING THIS LINE. `commit()` has four refusal arms
        // above it — fewer than three corners, no site context, the C19 §1.4 one-shot already
        // authored elsewhere, a rejected boundary dispatch — and it sets `committed` only on the
        // path that actually landed. Navigating unconditionally would take him to a tab to review
        // a parcel that was never committed, which is worse than staying put: the Site tab would
        // be showing the PREVIOUS plot's data under a gesture that appeared to succeed.
        //
        // ⛔ AND IT IS A TAB SWITCH, NOT A LAYOUT DECISION. `setMode` runs its own `_applyLayout()`
        // (see `landInBimAfterCreateHouse.ts`, the precedent this follows) — this deliberately does
        // NOT also arrange panes. The founder asked to be TAKEN to the review surface, not to have
        // his split rearranged underneath him.
        if (committed) {
            try {
                const w = window as unknown as {
                    workspaceController?: { setMode?(mode: string): void };
                };
                if (typeof w.workspaceController?.setMode === 'function') {
                    w.workspaceController.setMode('site');
                    console.log('[gis] map2d §PARCEL-OPENS-THE-SITE-TAB — parcel committed; '
                        + 'opening the Site tab for the first review pass.');
                } else {
                    // ⛔ NAMED, NEVER SILENT. A missing controller means the founder stays on the
                    // tab he was on with no explanation, and the next reader needs to know why.
                    console.warn('[gis] map2d §PARCEL-OPENS-THE-SITE-TAB — the parcel committed but '
                        + '`window.workspaceController.setMode` is not registered in this '
                        + 'workspace, so the Site tab was not opened. The commit itself stands.');
                }
            } catch (e) {
                // A navigation convenience must never be able to break the commit it follows.
                console.warn('[gis] map2d §PARCEL-OPENS-THE-SITE-TAB — opening the Site tab threw '
                    + '(non-fatal; the parcel is committed):', e);
            }
        }
    }

    // ── MAP-DATA-OVERTURE — load richer OSM/Overture footprints for the centre. ──
    // Fetches around the current map centre and pushes the result into the geojson
    // source so the plan shows dense surrounding buildings. Debounced + keyed so a
    // pan within the same area doesn't refetch. Never throws (loader degrades to an
    // empty collection on failure). No-op on the satellite raster style (the source
    // doesn't exist there).
    function loadContextBuildings(immediate = false): void {
        if (disposed) return;
        const run = (): void => {
            if (disposed) return;
            const src = map.getSource(CONTEXT_BUILDINGS_SOURCE) as GeoJSONSource | undefined;
            if (!src) return; // satellite style has no context source — skip.
            const c = map.getCenter();
            // Key on the centre rounded to ~0.005° (the fetch grid) — same area = skip.
            const key = `${c.lat.toFixed(3)},${c.lng.toFixed(3)}`;
            if (key === ctxLastKey) return;
            ctxLastKey = key;
            // Cancel any in-flight fetch; start a fresh one.
            ctxAbort?.abort();
            ctxAbort = new AbortController();
            const signal = ctxAbort.signal;
            void fetchContextBuildings(c.lat, c.lng, signal).then((collection) => {
                if (disposed || signal.aborted) return;
                // PW.2 (§DIAG-PARTY-WALL) — capture neighbour footprints for the
                // layout pipeline (resolveBlindFacades → party/blind-wall detection).
                // The 2D draw map is often the FIRST surface to fetch (onboarding
                // draw, before Cesium mounts), so capturing here primes the store.
                setNeighbourFootprints(c.lat, c.lng, collection);
                const live = map.getSource(CONTEXT_BUILDINGS_SOURCE) as GeoJSONSource | undefined;
                if (live) {
                    // §OFFICIAL-FOOTPRINTS (L-12939) — drop the register's PARTS from the PLAN
                    // only. Filtered here rather than with a maplibre layer `filter` because
                    // `official` is a nested object on the feature, so a style expression reaching
                    // into it would be a second, silently-divergent copy of the same rule.
                    const planFeatures = collection.features.filter((f) => shouldDrawInPlan(f.properties.official));
                    const official = summariseOfficialFootprints(
                        collection.features.map((f) => ({ official: f.properties.official })),
                    );
                    live.setData({ type: 'FeatureCollection', features: planFeatures } as unknown as GeoJSON.FeatureCollection);
                    // Counts SEPARATED BY SOURCE (C57 §1.9) — a single total cannot tell "the
                    // register landed" from "we are still drawing OSM", which is exactly the
                    // question being asked when a 2020 house is missing from the map.
                    console.log(`[gis] map2d: context buildings → ${planFeatures.length} footprint(s) drawn`
                        + (official.parts > 0 || official.buildings > 0 ? ` · ${official.line}` : ''));
                }
            });
        };
        if (immediate) { run(); return; }
        if (ctxDebounce) clearTimeout(ctxDebounce);
        ctxDebounce = setTimeout(run, 350);
    }

    // ── §MAP2D-PASTEL (L-12938) — fill the pastel style's baked-context sources. ──
    // STR-2D-SITE-MAP-CARTOGRAPHY §4 Stage M1. The style declares seven EMPTY GeoJSON
    // sources; this fills them from the same memoised readers the 3D Site uses. Debounced
    // and centre-keyed exactly like `loadContextBuildings`, and a no-op on the satellite
    // raster style (which declares none of these sources).
    //
    // ⛔ PRESENTATION ONLY. It adds no map handler, mutates no `vertices`, and touches
    // neither the parcel click path nor the boundary-draw/commit path. A failure leaves
    // every source at its empty resting state and the OpenFreeMap base layers alone carry
    // the map — the picture degrades to today's, never to a hole.
    function loadPastelContext(immediate = false): void {
        if (disposed) return;
        const run = (): void => {
            if (disposed) return;
            if (!map.getSource(PASTEL_SOURCES.roads)) return; // satellite style — skip.
            const c = map.getCenter();
            // Same ~0.005° centre key as the buildings fetch: same area ⇒ no re-push.
            const key = `${c.lat.toFixed(3)},${c.lng.toFixed(3)}`;
            if (key === pastelLastKey) return;
            pastelLastKey = key;
            pastelAbort?.abort();
            pastelAbort = new AbortController();
            const signal = pastelAbort.signal;
            void loadPastelContextGeoJson(c.lat, c.lng, signal)
                .then((push) => {
                    if (disposed || signal.aborted) return;
                    let pushed = 0;
                    for (const [sourceId, fc] of Object.entries(push.bySource)) {
                        const src = map.getSource(sourceId) as GeoJSONSource | undefined;
                        if (!src) continue;
                        src.setData(fc);
                        pushed++;
                    }
                    // C57 §1.5 — the summary separates MAPPED trees from SYNTHESISED canopies
                    // and names a failed read as a failure, never as an empty neighbourhood.
                    console.log(
                        `[gis] map2d §MAP2D-PASTEL: ${pushed}/7 baked context source(s) pushed — ${push.summary}`,
                    );
                })
                .catch((e) => {
                    console.warn(
                        '[gis] map2d §MAP2D-PASTEL: context push FAILED (non-fatal) — the sources stay ' +
                            'empty because the read failed, not because the area is empty:',
                        e,
                    );
                });
        };
        if (immediate) { run(); return; }
        if (pastelDebounce) clearTimeout(pastelDebounce);
        pastelDebounce = setTimeout(run, 350);
    }

    /** Push the current snap target (or nothing) into the indicator source. */
    function refreshSnapIndicator(): void {
        const src = map.getSource(SNAP_SOURCE) as GeoJSONSource | undefined;
        if (!src) return;
        if (!snapTarget) { src.setData(emptyFC()); return; }
        src.setData({
            type: 'FeatureCollection',
            features: [{
                type: 'Feature',
                geometry: { type: 'Point', coordinates: [snapTarget.lon, snapTarget.lat] },
                properties: { kind: snapTarget.kind },
            }],
        });
    }

    // ── A.8.c.g — snap resolution ─────────────────────────────────────────────
    // Squared pixel distance between two screen points.
    function pxDist2(ax: number, ay: number, bx: number, by: number): number {
        const dx = ax - bx, dy = ay - by;
        return dx * dx + dy * dy;
    }

    /**
     * Flatten any (Multi)Polygon / (Multi)LineString feature geometry into a list
     * of rings, each an array of [lon,lat] positions. Points are ignored.
     */
    function ringsOf(geom: GeoJSON.Geometry): number[][][] {
        switch (geom.type) {
            case 'Polygon': return geom.coordinates as number[][][];
            case 'MultiPolygon': return (geom.coordinates as number[][][][]).flat();
            case 'LineString': return [geom.coordinates as number[][]];
            case 'MultiLineString': return geom.coordinates as number[][][];
            default: return [];
        }
    }

    /**
     * Resolve the best snap target for a cursor at screen point `pt`. Priority:
     *   1. building CORNER (a footprint vertex within SNAP_PX)
     *   2. building EDGE (nearest point on a footprint segment within SNAP_PX)
     *   3. closing-the-loop on our OWN first vertex within SNAP_PX (always works,
     *      and the documented fallback when the footprint geometry isn't queryable)
     * Returns null when nothing is within range (the click then uses raw lngLat).
     */
    function resolveSnap(pt: { x: number; y: number }): SnapTarget | null {
        const thr2 = SNAP_PX * SNAP_PX;
        let bestCorner: { lon: number; lat: number; d2: number } | null = null;
        let bestEdge: { lon: number; lat: number; d2: number } | null = null;

        let feats: GeoJSON.Feature[] = [];
        try {
            // Only probe the layers that actually exist in the active style (the
            // satellite raster style has neither building layer → empty result).
            const layers = BUILDING_QUERY_LAYERS.filter((l) => map.getLayer(l));
            if (layers.length > 0) {
                const box: [[number, number], [number, number]] = [
                    [pt.x - SNAP_QUERY_HALF_PX, pt.y - SNAP_QUERY_HALF_PX],
                    [pt.x + SNAP_QUERY_HALF_PX, pt.y + SNAP_QUERY_HALF_PX],
                ];
                feats = map.queryRenderedFeatures(box, { layers });
            }
        } catch { feats = []; /* defensive: never let snapping break draw */ }

        for (const f of feats) {
            for (const ring of ringsOf(f.geometry)) {
                for (let i = 0; i < ring.length; i++) {
                    const a = ring[i]!;
                    const ap = map.project([a[0]!, a[1]!]);
                    // Corner candidate.
                    const cd2 = pxDist2(pt.x, pt.y, ap.x, ap.y);
                    if (cd2 <= thr2 && (!bestCorner || cd2 < bestCorner.d2)) {
                        bestCorner = { lon: a[0]!, lat: a[1]!, d2: cd2 };
                    }
                    // Edge candidate (segment a→b, in screen space).
                    const b = ring[(i + 1) % ring.length]!;
                    const bp = map.project([b[0]!, b[1]!]);
                    const vx = bp.x - ap.x, vy = bp.y - ap.y;
                    const len2 = vx * vx + vy * vy;
                    if (len2 > 0) {
                        let t = ((pt.x - ap.x) * vx + (pt.y - ap.y) * vy) / len2;
                        t = Math.max(0, Math.min(1, t));
                        const ex = ap.x + t * vx, ey = ap.y + t * vy;
                        const ed2 = pxDist2(pt.x, pt.y, ex, ey);
                        if (ed2 <= thr2 && (!bestEdge || ed2 < bestEdge.d2)) {
                            // Unproject the nearest screen point back to lng/lat.
                            const ll = map.unproject([ex, ey]);
                            bestEdge = { lon: ll.lng, lat: ll.lat, d2: ed2 };
                        }
                    }
                }
            }
        }

        if (bestCorner) return { lon: bestCorner.lon, lat: bestCorner.lat, kind: 'corner' };
        if (bestEdge) return { lon: bestEdge.lon, lat: bestEdge.lat, kind: 'edge' };

        // Fallback — close-the-loop snap to our own first vertex (polygon mode only;
        // in rectangle mode `vertices` holds the 4 live preview corners, so this
        // would wrongly snap corner B back onto corner A).
        if (drawMode === 'polygon' && vertices.length >= 3) {
            const first = vertices[0]!;
            const fp = map.project([first.lon, first.lat]);
            if (pxDist2(pt.x, pt.y, fp.x, fp.y) <= thr2) {
                return { lon: first.lon, lat: first.lat, kind: 'loop' };
            }
        }
        return null;
    }

    /**
     * A.21.D60 — resolve the relative right-angle snap for the cursor at screen
     * point `pt`, using the previous committed edge (vertex n-2 → n-1) as the
     * reference axis. Projects those vertices to screen, runs the PURE
     * `resolveOrthoSnap`, then unprojects the snapped screen point back to lng/lat.
     * Returns null when ortho is OFF, fewer than 2 vertices are placed (no previous
     * edge), the cursor is outside the angular tolerance, or the input is
     * degenerate. NEVER throws — defensive against project/unproject during a style
     * swap. The building corner/edge/loop snap (resolveSnap) takes priority; this is
     * only consulted when that returns null.
     */
    function resolveOrthoSnapTarget(pt: { x: number; y: number }): SnapTarget | null {
        if (!orthoEnabled || vertices.length < 2) return null;
        try {
            const prevStart = vertices[vertices.length - 2]!;
            const prevEnd = vertices[vertices.length - 1]!;
            const ps = map.project([prevStart.lon, prevStart.lat]);
            const pe = map.project([prevEnd.lon, prevEnd.lat]);
            const snapped = resolveOrthoSnap(
                { x: ps.x, y: ps.y },
                { x: pe.x, y: pe.y },
                { x: pt.x, y: pt.y },
                // §BND-90-DEFAULT-ON — widen the lock band from 8° to 22° so freehand
                // mouse-drawing on the map reliably snaps each edge orthogonal (8° is too
                // tight to hit by hand). A deliberate non-rectilinear edge (>22° off square)
                // still draws free; the user can also uncheck the ⟂ toggle entirely.
                ORTHO_SNAP_WIDE_DEG,
            );
            if (!snapped) return null;
            const ll = map.unproject([snapped.x, snapped.y]);
            if (!Number.isFinite(ll.lng) || !Number.isFinite(ll.lat)) return null;
            return { lon: ll.lng, lat: ll.lat, kind: 'ortho' };
        } catch {
            return null; // never let the draw break.
        }
    }

    // ── Draw interactions ─────────────────────────────────────────────────────

    /**
     * §RECT-BOUNDARY — build the live 4-corner axis-aligned rectangle from corner A
     * to the given second corner and write it into `vertices` (reusing the polygon
     * render path: fill + line + handles). Returns false when the two corners are
     * degenerate (same lat OR lon → zero area), leaving `vertices` as just [A].
     */
    function setRectVertices(a: LatLon, b: LatLon): boolean {
        const corners = rectCornersFromOpposite(a, b);
        vertices.length = 0;
        if (!corners) {
            vertices.push({ lat: a.lat, lon: a.lon });
            return false;
        }
        vertices.push(...corners);
        return true;
    }

    /**
     * §CIRCLE-BOUNDARY — build the live closed N-gon circle from `centre` out to a
     * circumference point (`edge`, the cursor) and write it into `vertices` (reusing
     * the polygon fill/line/handle render path). The radius is the projected metric
     * distance centre→edge, snapped to round numbers (0.5 m) when close. Returns
     * false for a degenerate (≈ zero) radius, leaving `vertices` as just [centre].
     */
    function setCircleVertices(centre: LatLon, edge: LatLon): boolean {
        const rawR = circleRadiusMetres(centre, edge);
        const r = snapRadiusToRound(rawR);
        vertices.length = 0;
        const corners = r > 0.05 ? circleCornersFromCentreRadius(centre, r) : null;
        if (!corners) {
            vertices.push({ lat: centre.lat, lon: centre.lon });
            return false;
        }
        vertices.push(...corners);
        return true;
    }

    /**
     * §ELLIPSE-BOUNDARY — build the live closed N-gon ellipse from `centre` out to a
     * bounding-box corner (`corner`, the cursor) and write it into `vertices` (reusing
     * the polygon fill/line/handle render path). The semi-major (East/X) radius is the
     * projected |Δx| centre→corner, the semi-minor (North/Z) is |Δz|, each snapped to
     * round numbers (0.5 m) when close. Returns false for a degenerate (≈ zero) radius
     * on either axis, leaving `vertices` as just [centre].
     */
    function setEllipseVertices(centre: LatLon, corner: LatLon): boolean {
        const rawRx = ellipseAxisRadiusMetres(centre, corner, 'x');
        const rawRy = ellipseAxisRadiusMetres(centre, corner, 'z');
        const rx = snapEllipseRadiusToRound(rawRx);
        const ry = snapEllipseRadiusToRound(rawRy);
        vertices.length = 0;
        const corners = rx > 0.05 && ry > 0.05 ? ellipseCornersFromCentreRadii(centre, rx, ry) : null;
        if (!corners) {
            vertices.push({ lat: centre.lat, lon: centre.lon });
            return false;
        }
        vertices.push(...corners);
        return true;
    }

    /**
     * §CIRCLE-BOUNDARY / §ELLIPSE-BOUNDARY — show/refresh the live radius readout chip
     * at the point under the cursor while drawing a circle (`R 12.5 m`) or an ellipse
     * (`Rx 20.0 × Ry 12.5 m`). Hidden when no circle/ellipse is in progress (no centre
     * / wrong mode / frozen). The chip reuses the SAME pooled `radiusMarker` (only one
     * radial mode is active at a time).
     */
    function refreshRadiusLabel(): void {
        if (disposed) return;
        // §ELLIPSE-BOUNDARY — two-axis readout while dragging the bounding-box corner.
        if (!committed && drawMode === 'ellipse' && ellipseCentre && cursorLL) {
            const rx = snapEllipseRadiusToRound(ellipseAxisRadiusMetres(ellipseCentre, cursorLL, 'x'));
            const ry = snapEllipseRadiusToRound(ellipseAxisRadiusMetres(ellipseCentre, cursorLL, 'z'));
            if (!radiusMarker) {
                radiusMarker = new MapLibreMarker({ element: makeDimChip(), anchor: 'center' });
                radiusMarker.setLngLat([0, 0]).addTo(map);
            }
            const el = radiusMarker.getElement();
            if (rx < 0.05 || ry < 0.05) { el.style.display = 'none'; return; }
            el.style.display = '';
            el.textContent = fmtRadiiMetres(rx, ry);
            radiusMarker.setLngLat([cursorLL.lon, cursorLL.lat]);
            return;
        }
        const active = !committed && drawMode === 'circle' && circleCentre && cursorLL;
        if (!active) {
            if (radiusMarker) radiusMarker.getElement().style.display = 'none';
            return;
        }
        const rawR = circleRadiusMetres(circleCentre!, cursorLL!);
        const r = snapRadiusToRound(rawR);
        if (!radiusMarker) {
            radiusMarker = new MapLibreMarker({ element: makeDimChip(), anchor: 'center' });
            radiusMarker.setLngLat([0, 0]).addTo(map);
        }
        const el = radiusMarker.getElement();
        if (r < 0.05) { el.style.display = 'none'; return; }
        el.style.display = '';
        el.textContent = fmtRadiusMetres(r);
        // Position at the circumference point (the cursor) so the readout tracks the
        // dragged radius like the line tool's length label tracks the segment end.
        radiusMarker.setLngLat([cursorLL!.lon, cursorLL!.lat]);
    }

    function onClick(e: MapMouseEvent): void {
        // §CONTINUE-WITH-THIS-PARCEL (L-13026) — this guard used to read `disposed || committed`.
        // A committed site still refuses every DRAW path below — the `committed` return simply
        // moves to sit AFTER the select dispatch instead of in front of it, so parcel SELECTION
        // survives the commit and the founder's "Use this parcel" card is reachable again. The
        // overlay-only and calibration yields keep their existing precedence over both.
        if (disposed) return;
        // §FIX-SITE-OVERLAY-IMPORT-TERMINAL (L-70) — OVERLAY-ONLY mode: the boundary draw
        // tool is disarmed. Map clicks never add a vertex / commit a boundary; only the
        // site-plan overlay panel + its 2-point calibration (which listens on its OWN map
        // handler) respond. This is the founder's "place the plan → straight to canvas,
        // no boundary, no generate" path.
        if (opts.overlayOnly) return;
        // §FIX-SITE-OVERLAY-CALIBRATION-EXCLUSIVE (L-69) — while the site-plan overlay is
        // capturing its two 2-point-calibration clicks, the DRAW tool must YIELD: otherwise
        // this handler consumed the two clicks as parcel vertices (rectangle/circle mode
        // even COMMITTED a boundary → forced the generate flow), so the calibration never
        // captured its points. The overlay's own map-click listener still fires and records
        // the points; we simply don't add vertices / commit here for the duration.
        if (overlayController?.isCalibrating?.()) return;
        // §PARCEL-SELECT (L-380 P1) — in SELECT mode a click fetches the real parcel
        // instead of adding a draw vertex. The draw tools below never run in this mode.
        if (interactionMode === 'select') { handleParcelSelectClick(e); return; }
        // §CONTINUE-WITH-THIS-PARCEL (L-13026) — every DRAW path is below this line, and a
        // committed C19 §1.4 boundary forbids all of them until "↺ Redraw boundary" clears it.
        if (committed) return;
        // Ignore the click that ends a vertex-drag.
        if (draggingIdx !== null) return;
        // A.8.c.g — commit the snapped position when a snap is active, else raw.
        const snap = snapTarget;
        const lat = snap ? snap.lat : e.lngLat.lat;
        const lon = snap ? snap.lon : e.lngLat.lng;

        // §RECT-BOUNDARY — rectangle mode: first click = corner A; second = corner B
        // → IMMEDIATE commit of the axis-aligned rectangle.
        if (drawMode === 'rectangle') {
            if (!rectCornerA) {
                rectCornerA = { lat, lon };
                vertices.length = 0;
                vertices.push({ lat, lon }); // show a handle at corner A
                snapTarget = null;
                refreshSnapIndicator();
                refreshRing();
                console.log(`[gis] map2d rect corner A @ ${lat.toFixed(6)}, ${lon.toFixed(6)}`);
                return;
            }
            const ok = setRectVertices(rectCornerA, { lat, lon });
            snapTarget = null;
            refreshSnapIndicator();
            refreshRing();
            if (!ok) {
                console.warn('[gis] map2d rect: degenerate second corner (zero-area) — pick a corner with both lat and lon offset');
                toast('Pick the OPPOSITE corner (not on the same line).', 'error');
                return;
            }
            console.log(
                `[gis] map2d rect corner B @ ${lat.toFixed(6)}, ${lon.toFixed(6)} → 4-corner axis-aligned rectangle, committing`,
            );
            commit();
            return;
        }

        // §CIRCLE-BOUNDARY — circle mode: first click = CENTRE; second = a point on
        // the circumference → IMMEDIATE commit of the closed N-gon polygon.
        if (drawMode === 'circle') {
            if (!circleCentre) {
                circleCentre = { lat, lon };
                vertices.length = 0;
                vertices.push({ lat, lon }); // show a handle at the centre
                snapTarget = null;
                refreshSnapIndicator();
                refreshRing();
                refreshRadiusLabel();
                console.log(`[gis] map2d circle centre @ ${lat.toFixed(6)}, ${lon.toFixed(6)}`);
                return;
            }
            const ok = setCircleVertices(circleCentre, { lat, lon });
            snapTarget = null;
            refreshSnapIndicator();
            refreshRing();
            if (!ok) {
                console.warn('[gis] map2d circle: zero-radius — click further from the centre');
                toast('Click further from the centre to set a radius.', 'error');
                return;
            }
            const r = snapRadiusToRound(circleRadiusMetres(circleCentre, { lat, lon }));
            console.log(
                `[gis] map2d circle radius ${r.toFixed(2)} m @ ${lat.toFixed(6)}, ${lon.toFixed(6)} → ${vertices.length}-gon, committing`,
            );
            commit();
            return;
        }

        // §ELLIPSE-BOUNDARY — ellipse mode: first click = CENTRE; second = a
        // bounding-box corner (|Δx| = East radius, |Δz| = North radius) → IMMEDIATE
        // commit of the closed N-gon polygon.
        if (drawMode === 'ellipse') {
            if (!ellipseCentre) {
                ellipseCentre = { lat, lon };
                vertices.length = 0;
                vertices.push({ lat, lon }); // show a handle at the centre
                snapTarget = null;
                refreshSnapIndicator();
                refreshRing();
                refreshRadiusLabel();
                console.log(`[gis] map2d ellipse centre @ ${lat.toFixed(6)}, ${lon.toFixed(6)}`);
                return;
            }
            const ok = setEllipseVertices(ellipseCentre, { lat, lon });
            snapTarget = null;
            refreshSnapIndicator();
            refreshRing();
            if (!ok) {
                console.warn('[gis] map2d ellipse: zero-radius on an axis — pick a corner offset on BOTH axes');
                toast('Pick a corner offset from the centre on BOTH axes.', 'error');
                return;
            }
            const rx = snapEllipseRadiusToRound(ellipseAxisRadiusMetres(ellipseCentre, { lat, lon }, 'x'));
            const ry = snapEllipseRadiusToRound(ellipseAxisRadiusMetres(ellipseCentre, { lat, lon }, 'z'));
            console.log(
                `[gis] map2d ellipse Rx ${rx.toFixed(2)} × Ry ${ry.toFixed(2)} m @ ${lat.toFixed(6)}, ${lon.toFixed(6)} → ${vertices.length}-gon, committing`,
            );
            commit();
            return;
        }

        // Polygon mode (legacy): each click adds a vertex.
        vertices.push({ lat, lon });
        // §L-384 — a new vertex invalidates the redo stack; refresh the undo/redo pill.
        redoStack.length = 0;
        refreshEditBar();
        // Clear the snap so it doesn't linger over the just-placed vertex.
        snapTarget = null;
        refreshSnapIndicator();
        refreshRing();
        console.log(
            `[gis] map2d vertex ${vertices.length} @ ${lat.toFixed(6)}, ${lon.toFixed(6)}` +
            (snap ? ` (snapped: ${snap.kind})` : ''),
        );
    }

    function onDblClick(e: MapMouseEvent): void {
        if (disposed || committed) return;
        // §RECT-BOUNDARY / §CIRCLE-BOUNDARY / §ELLIPSE-BOUNDARY — rectangle + circle +
        // ellipse modes commit on the second single click; the close-the-loop
        // double-click is a polygon-only affordance.
        if (drawMode === 'rectangle' || drawMode === 'circle' || drawMode === 'ellipse') { e.preventDefault(); return; }
        e.preventDefault();
        // The dblclick fires after two single clicks already added two vertices;
        // they are the intended last corner (duplicated) — drop one before commit.
        if (vertices.length >= 2) vertices.pop();
        refreshRing();
        commit();
    }

    // Vertex drag-to-edit.
    function onMouseDownVertex(e: MapMouseEvent & { features?: GeoJSON.Feature[] }): void {
        if (disposed || committed) return;
        const f = e.features?.[0];
        const idx = f?.properties?.['idx'];
        if (typeof idx !== 'number') return;
        e.preventDefault();
        draggingIdx = idx;
        map.dragPan.disable();
        map.getCanvas().style.cursor = 'grabbing';
    }
    function onMouseMove(e: MapMouseEvent): void {
        if (disposed || committed) return;
        if (draggingIdx !== null) {
            vertices[draggingIdx] = { lat: e.lngLat.lat, lon: e.lngLat.lng };
            refreshRing();
            return;
        }
        // A.8.c.g — not dragging: resolve a snap target under the cursor and show
        // (or hide) the violet snap indicator. Lightweight — one small box query.
        // A.21.D60 — the building corner/edge/loop snap takes PRIORITY; only when it
        // finds nothing do we fall back to the relative right-angle (ortho) lock, so
        // the user can still land exactly on a real corner when one is in range.
        // §RECT-BOUNDARY — rectangle mode is axis-aligned by construction, so the
        // relative-right-angle (ortho) snap doesn't apply (and would make the live
        // rect jitter, since it'd read the preview rect's own edges). Keep the
        // building corner/edge snap so corner B can land on a real footprint corner.
        // §CIRCLE-BOUNDARY / §ELLIPSE-BOUNDARY — circle + ellipse modes (like rectangle)
        // are radial/box-defined by construction, so the relative-right-angle (ortho)
        // snap doesn't apply. Keep the building corner/edge snap so the centre /
        // circumference / box corner can land on a real footprint.
        const next =
            drawMode === 'rectangle' || drawMode === 'circle' || drawMode === 'ellipse'
                ? resolveSnap(e.point)
                : (resolveSnap(e.point) ?? resolveOrthoSnapTarget(e.point));
        // A.21.D9 — track the cursor (snapped position when a snap is active, else
        // the raw lngLat) so the live in-progress edge label follows the pointer.
        cursorLL = next
            ? { lat: next.lat, lon: next.lon }
            : { lat: e.lngLat.lat, lon: e.lngLat.lng };
        // §RECT-BOUNDARY — live rubber-band rectangle: once corner A is placed,
        // preview the axis-aligned rectangle from A to the cursor via the SAME
        // fill/line/vertex render path the committed boundary uses.
        if (drawMode === 'rectangle' && rectCornerA) {
            setRectVertices(rectCornerA, cursorLL);
            refreshRing();
        }
        // §CIRCLE-BOUNDARY — live rubber-band circle: once the centre is placed,
        // preview the N-gon from the centre out to the cursor radius via the SAME
        // render path. The radius readout chip follows the circumference point.
        if (drawMode === 'circle' && circleCentre) {
            setCircleVertices(circleCentre, cursorLL);
            refreshRing();
        }
        // §ELLIPSE-BOUNDARY — live rubber-band ellipse: once the centre is placed,
        // preview the N-gon from the centre out to the cursor (bounding-box corner)
        // via the SAME render path. The two-axis radii readout follows the cursor.
        if (drawMode === 'ellipse' && ellipseCentre) {
            setEllipseVertices(ellipseCentre, cursorLL);
            refreshRing();
        }
        refreshDimLabels();
        refreshRadiusLabel();
        const changed =
            (next === null) !== (snapTarget === null) ||
            (next !== null && snapTarget !== null &&
                (next.lon !== snapTarget.lon || next.lat !== snapTarget.lat));
        if (changed) {
            snapTarget = next;
            refreshSnapIndicator();
            // Only assert the snap cursor; leave the default/grab cursor (managed by
            // the vertex hover handlers) untouched when there is no snap.
            if (next) map.getCanvas().style.cursor = 'crosshair';
            else if (map.getCanvas().style.cursor === 'crosshair') {
                map.getCanvas().style.cursor = '';
            }
        }
    }
    function onMouseUp(): void {
        if (draggingIdx === null) return;
        draggingIdx = null;
        map.dragPan.enable();
        map.getCanvas().style.cursor = '';
        // Swallow the trailing click that the drag would otherwise register.
        setTimeout(() => { /* draggingIdx already cleared; click guard handled above */ }, 0);
    }

    const keyListener = (ev: KeyboardEvent): void => {
        if (disposed) return;
        // Ignore shortcuts while typing in a field (e.g. the geocode box).
        const t = ev.target as HTMLElement | null;
        if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;

        // §L-384 — after a COMMITTED boundary the map is frozen (O.7.2.b) but still
        // mounted; ESC = RE-DRAW (clear-then-recreate of the immutable C19 §1.4 boundary)
        // so a mis-drawn plot is never a dead end. All other keys are inert while frozen.
        if (committed) {
            if (ev.key === 'Escape') { ev.preventDefault(); rearmDraw(); }
            return;
        }

        // §FIX-ONBOARDING-OVERLAY-SINGLE-PANEL-NO-BOUNDARY-SPLIT3D (L-194) — OVERLAY-ONLY
        // mode: the boundary draw tool is disarmed, so Enter (commit-loop), undo/redo and
        // the R/L/O/C/I/E mode-switch keys must be inert. Escape still tears the map down.
        if (opts.overlayOnly && ev.key !== 'Escape') return;

        // §L-384 — Ctrl/Cmd+Z undoes the last polygon vertex; Ctrl/Cmd+Y (or Ctrl+Shift+Z)
        // redoes it. Reuses the editor's undo/redo key convention (initUI.ts:2914+).
        if ((ev.ctrlKey || ev.metaKey) && !ev.altKey) {
            const k = ev.key.toLowerCase();
            if (k === 'z' && !ev.shiftKey) { ev.preventDefault(); undoVertex(); return; }
            if (k === 'y' || (k === 'z' && ev.shiftKey)) { ev.preventDefault(); redoVertex(); return; }
        }

        if (ev.key === 'Enter') {
            ev.preventDefault();
            // §RECT-BOUNDARY / §CIRCLE-BOUNDARY / §ELLIPSE-BOUNDARY — Enter is a
            // polygon-only close. Rectangle + circle + ellipse commit on the second
            // click; a stray Enter must not commit the live preview shape.
            if (drawMode === 'rectangle' || drawMode === 'circle' || drawMode === 'ellipse') return;
            commit();
        } else if (ev.key === 'Escape') {
            ev.preventDefault();
            // §L-384 — ESC first CLEARS an in-progress draw (stay on the map so the user
            // can restart cleanly); a second ESC with nothing drawn cancels the surface.
            if (clearInProgressDraw()) {
                toast('Draw cleared — click to start again.', 'info');
            } else {
                cancel();
            }
            return;
        }
        // §BND-MODE-STRIP — single-key mode shortcuts (R/L/O/C), mirroring the wall
        // HUD. Plain keys only (no modifier) so they don't clash with browser combos.
        if (ev.altKey || ev.ctrlKey || ev.metaKey) return;
        // §PARCEL-SELECT — the draw-mode letter shortcuts don't apply in SELECT mode.
        if (interactionMode === 'select') return;
        const mode: SiteBoundaryGesture | undefined = {
            r: 'rectangle', l: 'linear', o: 'orthogonal', c: 'curved', i: 'circle', e: 'ellipse',
        }[ev.key.toLowerCase()] as SiteBoundaryGesture | undefined;
        if (mode) {
            ev.preventDefault();
            setDrawMode(mode);
        }
    };

    // ── A.8.c.f.4 — basemap swap (preserves the draw across setStyle) ──────────
    // setStyle() tears down EVERY source + layer + re-fires 'style.load' /
    // 'styledata'. We re-add the violet boundary source + draw layers in that
    // event (installRingLayers, idempotent — it reads the live `vertices` array,
    // so in-progress + committed vertices survive) and re-apply the camera. The
    // draw→commit path is untouched: it operates on `vertices` + map-overlay
    // layers only; the commit (boundaryProjection → dispatchParcelBoundary) never
    // reads the basemap. So toggling mid-draw loses nothing.
    function swapBasemap(next: 'map' | 'satellite'): void {
        if (disposed || next === basemap) return;
        basemap = next;
        paintToggle();
        // Capture the current camera so the swap doesn't snap the view.
        const center = map.getCenter();
        const zoom = map.getZoom();
        const bearing = map.getBearing();
        const pitch = map.getPitch();
        const style =
            next === 'satellite'
                ? (buildSatelliteStyle() as unknown as StyleSpecification)
                : (buildFormaMap2DStyleV2({ extrude: opts.extrude ?? false }) as unknown as StyleSpecification);
        // diff:false forces a full reload so the new source set replaces cleanly.
        map.setStyle(style, { diff: false });
        // Re-add the boundary draw + restore the camera once the new style loads.
        map.once('style.load', () => {
            if (disposed) return;
            installRingLayers();
            // §PARCEL-VISIBLE-EVERYWHERE (L-13016) — the swap wiped the committed-parcel + cue
            // sources with everything else. Re-added HERE (and in `map.on('load')`) rather than
            // inside `installRingLayers` so the pinned parcel/boundary path stays byte-identical.
            installSiteHighlightLayers();
            map.jumpTo({ center, zoom, bearing, pitch });
            // MAP-DATA-OVERTURE — the swap recreates an EMPTY context source (map
            // style) or none (satellite). Force a refetch so the footprints come
            // back after switching back to the Forma vector basemap.
            if (next === 'map') {
                ctxLastKey = ''; loadContextBuildings(true);
                // §MAP2D-PASTEL (L-12938) — the swap recreated empty pastel sources too.
                pastelLastKey = ''; loadPastelContext(true);
            }
            console.log(`[gis] map2d: basemap → ${next}; boundary draw re-added (${vertices.length} vertices)`);
        });
    }
    mapBtn.addEventListener('click', () => swapBasemap('map'));
    satBtn.addEventListener('click', () => swapBasemap('satellite'));

    // ── §BND-MODE-STRIP — boundary-draw mode strip (Rectangle/Linear/Ortho/Curved) ─
    /** Highlight the active mode pill (the `.wdh-btn--active` violet state). */
    function paintModeStrip(): void {
        for (const [mode, btn] of modeBtns) {
            const active = mode === uiMode;
            btn.classList.toggle('wdh-btn--active', active);
            btn.setAttribute('aria-pressed', String(active));
        }
    }
    /** Update the instruction chip text for the active UI mode. */
    function refreshModeChrome(): void {
        // §TOP-STACK (L-13090) — every caller of this function has just changed which top-centre
        // floats are up, so the column re-reads its box here rather than at each call site.
        try { refreshTopStack(); } catch { /* pre-mount — the initial paint below runs it again */ }
        switch (uiMode) {
            case 'rectangle':
                setChip('Click two opposite corners · Esc to cancel');
                break;
            case 'linear':
                setChip('Click each corner (free angles) · double-click or Enter to close · Esc to cancel');
                break;
            case 'orthogonal':
                setChip('⟂ 90°-locked · click each corner · double-click or Enter to close · Esc to cancel');
                break;
            case 'curved':
                // §BND-MODE-STRIP — no curved/arc boundary geometry yet → falls back to
                // a straight polyline; tell the user so the result isn't a surprise.
                setChip('Curved not available yet — drawing straight segments · double-click or Enter to close · Esc');
                break;
            case 'circle':
                // §CIRCLE-BOUNDARY — click centre, then a point on the circumference.
                setChip('Click the centre, then a point on the edge (radius shown) · Esc to cancel');
                break;
            case 'ellipse':
                // §ELLIPSE-BOUNDARY — click centre, then a bounding-box corner (two radii shown).
                setChip('Click the centre, then a corner of the bounding box (Rx × Ry shown) · Esc to cancel');
                break;
        }
    }
    /**
     * Switch the user-facing draw mode (one of the four pills) and resolve it onto
     * the two internal geometry modes (+ the ortho flag), resetting any in-progress
     * draw so the modes don't bleed.
     *   rectangle  → geometry 'rectangle'
     *   linear     → geometry 'polygon', orthoEnabled=false
     *   orthogonal → geometry 'polygon', orthoEnabled=true
     *   curved     → geometry 'polygon' (straight fallback) + one-time toast; no
     *                spline/arc boundary builder exists yet (reported as missing).
     */
    function setDrawMode(next: SiteBoundaryGesture): void {
        if (disposed || committed || next === uiMode) return;
        uiMode = next;
        switch (next) {
            case 'rectangle':
                drawMode = 'rectangle';
                break;
            case 'linear':
                drawMode = 'polygon';
                orthoEnabled = false;
                break;
            case 'orthogonal':
                drawMode = 'polygon';
                orthoEnabled = true;
                break;
            case 'curved':
                // Graceful fallback: behave as a free polyline until a spline/arc
                // boundary builder lands. The downstream contract is unchanged.
                drawMode = 'polygon';
                orthoEnabled = false;
                toast('Curved boundaries aren’t available yet — drawing straight segments.', 'info');
                break;
            case 'circle':
                // §CIRCLE-BOUNDARY — two-point centre+radius → closed 64-gon polygon.
                drawMode = 'circle';
                break;
            case 'ellipse':
                // §ELLIPSE-BOUNDARY — two-point centre + bounding-box corner → 64-gon.
                drawMode = 'ellipse';
                break;
        }
        // Reset the in-progress draw (clears corner A / circle+ellipse centre / partial polygon).
        rectCornerA = null;
        circleCentre = null;
        ellipseCentre = null;
        vertices.length = 0;
        snapTarget = null;
        cursorLL = null;
        try { refreshRing(); } catch { /* style may be swapping */ }
        try { refreshSnapIndicator(); } catch { /* ignore */ }
        try { refreshDimLabels(); } catch { /* ignore */ }
        try { refreshRadiusLabel(); } catch { /* ignore */ }
        paintModeStrip();
        refreshModeChrome();
        redoStack.length = 0;
        refreshEditBar();
        console.log(`[gis] map2d: draw mode → ${next} (geometry=${drawMode}, ortho=${orthoEnabled})`);
    }
    // Initial paint — Rectangle is the default (founder "for now"); the strip's key
    // shortcuts (R/L/O/C) are handled by the overlay key listener (keyListener).
    paintModeStrip();
    refreshModeChrome();
    // §UX-PARCEL-SELECT-DEFAULT — the initial CHROME must agree with the initial MODE. Both the
    // geometry strip and the instruction chip above were written when 'draw' was the only possible
    // opening state; with SELECT as the default they would otherwise open showing the rectangle
    // draw tool while clicks silently went to the parcel picker. `setInteractionMode` cannot do
    // this for us — it early-returns when the requested mode is already current — so the select
    // branch's chrome is applied here explicitly, in the same order it applies it.
    if (interactionMode === 'select') {
        modeBar.style.display = 'none';
        setChip('Click a plot to select its real cadastral parcel · Esc to cancel');
        try { map.getCanvas().style.cursor = 'crosshair'; } catch { /* map style may still be loading */ }
    }
    // §TOP-STACK (L-13090) — the column's box must agree with the opening chrome for the same
    // reason the chip text must (§UX-PARCEL-SELECT-DEFAULT): an opening state assembled by two
    // rules that never met is how this file shipped a rectangle strip over a parcel picker.
    refreshTopStack();
    paintInteractionToggle();

    // ── Commit / cancel ───────────────────────────────────────────────────────

    /**
     * O.7.2.b — FREEZE the draw without disposing the map. Detach every draw
     * interaction (so no further vertices/drags), drop the keyboard listener, and
     * make the overlay non-interactive for drawing (hide the instruction chip; turn
     * the × into a no-op visually — the host owns teardown now). The map + violet
     * boundary stay rendered so the "Generate with AI?" confirm step appears over a
     * live cream plan map. Idempotent.
     */
    // ── §L-384 — vertex undo/redo + ESC-clear + re-draw after commit ─────────────

    /** Show/enable the undo/redo pill for the vertex-by-vertex (polygon) draw modes. */
    function refreshEditBar(): void {
        const usable = !committed && !opts.overlayOnly && interactionMode === 'draw' && drawMode === 'polygon';
        editBar.style.display = usable ? 'flex' : 'none';
        const setEnabled = (b: HTMLButtonElement, on: boolean): void => {
            b.disabled = !on;
            b.style.opacity = on ? '1' : '0.35';
            b.style.cursor = on ? 'pointer' : 'not-allowed';
        };
        setEnabled(undoBtn, usable && vertices.length > 0);
        setEnabled(redoBtn, usable && redoStack.length > 0);
    }

    /** Undo the last placed polygon vertex (onto the redo stack). */
    function undoVertex(): void {
        if (committed || drawMode !== 'polygon' || vertices.length === 0) return;
        const v = vertices.pop()!;
        redoStack.push(v);
        snapTarget = null;
        try { refreshSnapIndicator(); } catch { /* ignore */ }
        refreshRing();
        refreshEditBar();
        console.log(`[gis] §L-384 undo vertex → ${vertices.length} left`);
    }

    /** Redo the last undone polygon vertex. */
    function redoVertex(): void {
        if (committed || drawMode !== 'polygon' || redoStack.length === 0) return;
        vertices.push(redoStack.pop()!);
        refreshRing();
        refreshEditBar();
        console.log(`[gis] §L-384 redo vertex → ${vertices.length} placed`);
    }

    /**
     * §L-384 — ESC while drawing: clear the IN-PROGRESS draw (all placed vertices +
     * any rectangle/circle/ellipse anchor) WITHOUT tearing down the map, so the user
     * can restart cleanly. Returns true when there was something to clear.
     */
    function clearInProgressDraw(): boolean {
        const had = vertices.length > 0 || rectCornerA !== null || circleCentre !== null || ellipseCentre !== null;
        vertices.length = 0;
        rectCornerA = null; circleCentre = null; ellipseCentre = null;
        redoStack.length = 0;
        snapTarget = null; cursorLL = null;
        try { refreshRing(); } catch { /* ignore */ }
        try { refreshSnapIndicator(); } catch { /* ignore */ }
        try { refreshDimLabels(); } catch { /* ignore */ }
        try { refreshRadiusLabel(); } catch { /* ignore */ }
        refreshEditBar();
        return had;
    }

    /** Attach the map draw interaction handlers (idempotent-ish; used at load + re-arm). */
    function attachDrawHandlers(): void {
        map.on('click', onClick);
        map.on('dblclick', onDblClick);
        map.on('mousedown', VERTEX_LAYER, onMouseDownVertex);
        map.on('mousemove', onMouseMove);
        map.on('mouseup', onMouseUp);
        map.on('mouseenter', VERTEX_LAYER, () => { map.getCanvas().style.cursor = 'grab'; });
        map.on('mouseleave', VERTEX_LAYER, () => { if (draggingIdx === null) map.getCanvas().style.cursor = ''; });
    }

    /**
     * §L-384 — RE-DRAW after a committed boundary. The C19 §1.4 parcel polygon is an
     * IMMUTABLE one-shot, so this does a clean CLEAR-then-recreate: it dispatches
     * `site.replace` (via dispatchClearParcelBoundary) to empty the committed boundary,
     * then un-freezes THIS live map (O.7.2.b kept it mounted) — re-attaching the draw
     * handlers + restoring the chrome so a fresh boundary can be authored + committed.
     * NEVER mutates the immutable polygon. Idempotent-safe.
     */
    function rearmDraw(): void {
        if (disposed) return;
        // 1) Clear the committed C19 boundary through the canonical site.replace path.
        try {
            const ctx = resolveSiteContext(runtime);
            if (ctx) dispatchClearParcelBoundary(ctx);
        } catch (e) { console.warn('[gis] §L-384 rearmDraw: clear failed (non-fatal):', e); }

        // 2) Un-freeze the map + reset all draw state.
        committed = false;
        vertices.length = 0;
        rectCornerA = null; circleCentre = null; ellipseCentre = null;
        redoStack.length = 0;
        snapTarget = null; cursorLL = null;
        selectedParcel = null;

        // 3) Restore chrome.
        redrawBtn.style.display = 'none';
        // §COMMITTED-MAP-IS-ONE-ACTION — the banner comes back through `setChip`, its single
        // owner, when `refreshModeChrome()` below writes the draw instruction. Restoring
        // `chip.style.display` here as well would be a second opinion about the same pixel.
        closeBtn.style.display = '';
        if (!opts.overlayOnly && interactionMode === 'draw') modeBar.style.display = '';
        // ⭐ §COMMITTED-MAP-IS-ONE-ACTION (L-13186 · L-13187) — EVERYTHING `freezeDraw` HID COMES
        // BACK HERE, in the one function that clears the boundary those removals were justified by.
        // The select/draw strip is the only on-screen route into DRAW mode before a commit, so its
        // restoration is not cosmetic; and the envelope button is un-gated again the moment the
        // site stops being a committed one, exactly as it was before (C58 §1.20 clause 1: the panel
        // is where a user with NO solved envelope is told what is missing).
        //
        // ⚠ `'flex'`, NOT `''` — a defect found while writing this (L-13188). Both strips declare
        // `display:flex` INLINE, so clearing the property does not restore that value, it falls
        // back to `block`: the two segments would come back stacked one above the other rather
        // than as a segmented control. Restoring the value the strip was built with is the only
        // reading that survives.
        if (!opts.overlayOnly) interToggle.style.display = 'flex';
        if (!opts.overlayOnly) envelopeToolBar.style.display = 'flex';
        // §CONTINUE-WITH-THIS-PARCEL (L-13026) — the draw segment `freezeDraw` refused is
        // available again the instant the boundary it refused for is cleared. Undoing the
        // refusal HERE, in the one function that clears the boundary, is what stops the two
        // states drifting apart.
        drawModeBtn.disabled = false;
        drawModeBtn.style.cursor = 'pointer';
        drawModeBtn.removeAttribute('title');
        paintInteractionToggle();
        try { refreshRing(); } catch { /* ignore */ }
        try { refreshSnapIndicator(); } catch { /* ignore */ }
        try { refreshParcelHighlight(); } catch { /* ignore */ }
        try { refreshDimLabels(); } catch { /* ignore */ }
        hideParcelCard();
        refreshModeChrome();
        refreshEditBar();

        // 4) Re-attach the draw interaction + key listener (freezeDraw detached them).
        if (!opts.overlayOnly) attachDrawHandlers();
        window.removeEventListener('keydown', keyListener); // avoid a double bind
        window.addEventListener('keydown', keyListener);
        console.log('[gis] §L-384 draw re-armed after clear — ready to author a new boundary.');
    }

    /**
     * §FIX-MAP2D-EXTERNAL-BOUNDARY-SYNC (ADR-0299 §Decision 4) — THE STORE IS THE TRUTH.
     *
     * `committed` is a LOCAL flag that only this map's own `commit()` used to set. Any boundary
     * authored elsewhere while this map is live — the onboarding draw watchdog, "Skip drawing",
     * `createSiteFromRect`, a collaborator's sync — left the surface ARMED and LYING: the chip
     * still read "Click two opposite corners", the select/draw toggle was still up, and the ONE
     * affordance that can recover ("↺ Redraw boundary") was still hidden. That is the founder's
     * screenshot — a surface in two states at once, with no way forward.
     *
     * This re-derives the local state from the C19 store and freezes if a boundary is committed,
     * so the surface can never advertise an interaction it cannot honour. Idempotent (freezeDraw
     * early-returns when already frozen) and safe to call from an event, from a refusal, or at
     * mount time.
     */
    function syncCommittedFromStore(cause: string): void {
        if (disposed || committed || committingLocally) return;
        let committedVertices = 0;
        try {
            const ctx = resolveSiteContext(runtime ?? null);
            committedVertices = ctx?.store.getSite()?.parcel?.boundary?.polygon?.length ?? 0;
        } catch (e) {
            console.warn('[gis] map2d §FIX-MAP2D-EXTERNAL-BOUNDARY-SYNC: store read failed (non-fatal):', e);
            return;
        }
        if (committedVertices < 1) return;
        console.warn(
            `[gis] map2d §FIX-MAP2D-EXTERNAL-BOUNDARY-SYNC — a parcel boundary (${committedVertices} corners) was ` +
            `committed WITHOUT going through this map (cause="${cause}"). Freezing the draw/select surface so it ` +
            'stops offering an interaction C19 §1.4 will reject, and revealing "↺ Redraw boundary" as the way out.',
        );
        freezeDraw();
    }

    function freezeDraw(): void {
        if (committed) return;
        committed = true;
        // Detach map DRAW handlers (handlers also early-return on `committed`, so this
        // is belt-and-braces against any in-flight event).
        //
        // ⛔ §CONTINUE-WITH-THIS-PARCEL (L-13026) — `click` IS DELIBERATELY NOT DETACHED.
        // `onClick` routes to `handleParcelSelectClick` in SELECT mode and early-returns from
        // every DRAW path while `committed`, so keeping it bound freezes drawing exactly as
        // before while leaving parcel SELECTION alive. Detaching it here is what made the
        // founder's "continue with this parcel" card unreachable on a committed project.
        try {
            map.off('dblclick', onDblClick);
            map.off('mousedown', VERTEX_LAYER, onMouseDownVertex);
            map.off('mousemove', onMouseMove);
            map.off('mouseup', onMouseUp);
        } catch { /* map may be mid-teardown — defensive */ }
        // Drop the global key listener (Enter/Esc) — the confirm step owns input now.
        window.removeEventListener('keydown', keyListener);
        // Clear any lingering snap indicator + draw cursor.
        snapTarget = null;
        // A.21.D9 — drop the live in-progress edge label; keep the placed-edge
        // dimensions so the committed boundary still reads its lengths.
        cursorLL = null;
        try { refreshSnapIndicator(); } catch { /* style may be swapping */ }
        try { refreshDimLabels(); } catch { /* style may be swapping */ }
        // §CIRCLE-BOUNDARY — drop the live radius readout (the circle is committed).
        try { refreshRadiusLabel(); } catch { /* style may be swapping */ }
        // Freeze the chrome: the instruction chip + close (×) no longer apply (the
        // overlay is now a passive backdrop for the confirm step). Hide them so the
        // user isn't tempted to keep drawing/cancelling.
        closeBtn.style.display = 'none';
        // §BND-MODE-STRIP — the mode toolbar is a draw-only affordance; remove it on commit.
        modeBar.style.display = 'none';
        hideParcelCard();
        // ⭐ §CONTINUE-WITH-THIS-PARCEL (L-13026 · C19 §5.6 clause 4) — SELECT SURVIVES THE
        // COMMIT; DRAW DOES NOT. Founder 2026-09-06: *"once selected a parcel — CONTINUE WITH
        // THIS PARCEL. Before we had a panel for it, now is not being showed."*
        //
        // The panel he means is the ONE this map already mounts on a parcel click —
        // `showParcelCard` → `buildParcelCard`, whose primary action is literally
        // *"Use this parcel →"*. It was never deleted; this function made it unreachable by
        // treating parcel SELECTION as a draw-only affordance and hiding the toggle that arms
        // it. Drawing a second C19 §1.4 boundary really is impossible until the first is
        // cleared, but SELECTING a parcel is not drawing — reading a plot's cadastral facts and
        // choosing to proceed with it is exactly what the founder asks for after commit, and it
        // is what `PARCEL_LAW_PLOT_ROUTE_NOTE` (§SELECT-PARCEL-IS-A-VIEW-ACTION, L-13004) now
        // tells him to come here and do. A panel that names a route the view refuses to honour
        // is the L-942 shape wearing a founder quote.
        //
        // ⛔ THE DRAW SEGMENT IS DISABLED, NOT REMOVED — it states WHY, and "↺ Redraw boundary"
        // beside it is the route that makes it available again. A control that vanishes teaches
        // nothing; one that refuses with its reason teaches the way out.
        if (opts.overlayOnly) {
            chip.style.display = 'none';
            interToggle.style.display = 'none';
        } else {
            // ⭐⭐ §COMMITTED-MAP-IS-ONE-ACTION (L-13186 · L-13187) — ON A COMMITTED SITE THE 2D MAP
            // CARRIES EXACTLY ONE ACTION: `↺ Redraw boundary`. Founder 2026-09-07, red crosses over
            // the floating cluster: *"exclude - remove 'Envelope/Select a parce....'"*.
            //
            // ⛔ REMOVING A CONTROL REMOVES WHAT IT DOES, SO EACH ONE IS ANSWERED BEFORE IT GOES,
            // AND THE ANSWER IS WHY THIS IS GATED ON `committed` RATHER THAN DONE AT BUILD TIME:
            //
            //   · `Select parcel` — a NO-OP in this state, provably. `setInteractionMode`
            //     early-returns when the mode already matches, and the line below forces `select`
            //     unconditionally. The capability it names — clicking a plot to read its cadastral
            //     facts and continue with it — is armed by that assignment plus the `click`
            //     handler this function DELIBERATELY leaves bound (see the note above), not by the
            //     segment. It survives the segment's removal intact, and `PARCEL_LAW_PLOT_ROUTE_NOTE`
            //     on the parcel card still names the true route (the pane's view bar, then a click).
            //
            //   · `Draw boundary` — already `disabled` here, and C19 §1.4 is why: the boundary is a
            //     one-shot and `↺ Redraw boundary`, which stays, is the only route that clears it.
            //     The segment kept its refusal REASON in `title` (set below) so nothing is lost if
            //     it is ever shown again; `rearmDraw` brings the whole strip back the instant the
            //     boundary it refused for is gone.
            //
            //   · `Envelope` — the panel it toggles is a RE-TARGETING SINGLETON, and the same
            //     singleton is opened by `Create Envelope` in the Project Browser
            //     (`gisActionRegistry` row `site.create-envelope` → `window.pryzmOpenSiteEnvelopeTool`,
            //     registered in `GISAreaLayout` over `#container`) and by the Parcel Law tab. The
            //     `#container` host spans BOTH site views, so the surviving route covers strictly
            //     more ground than this strip did. Nothing here is the only way to reach it.
            //
            // ⛔ AND IT IS GATED ON `committed` FOR A MEASURED REASON, NOT FROM CAUTION. PRE-commit
            // the `Draw boundary` segment is the ONLY route into DRAW mode that is on screen
            // unconditionally: the default mode is `select`, and a click that MISSES a parcel shows
            // a toast and no card at all, so the card's own "Draw instead" is not reachable from
            // there. Removing the strip globally would strand a user in any location whose cadastre
            // answers but whose click missed — a silent capability regression wearing a tidier view.
            interToggle.style.display = 'none';
            envelopeToolBar.style.display = 'none';
            drawModeBtn.disabled = true;
            drawModeBtn.style.cursor = 'not-allowed';
            drawModeBtn.title = DRAW_FROZEN_TITLE;
            interactionMode = 'select';
            setChip(PARCEL_RESELECT_CHIP);
            paintInteractionToggle();
        }
        refreshTopStack();
        try { map.getCanvas().style.cursor = opts.overlayOnly ? '' : 'crosshair'; } catch { /* ignore */ }
        // §L-384 — the undo/redo pill is a draw affordance; drop it. Offer RE-DRAW instead
        // (clear-then-recreate of the immutable C19 boundary) so a mis-drawn plot isn't a trap.
        editBar.style.display = 'none';
        if (!opts.overlayOnly) redrawBtn.style.display = 'block';
        console.log('[gis] map2d: boundary committed — draw frozen, cream map + boundary kept alive (dispose deferred to generate-time); Redraw available (§L-384).');
    }

    function commit(): void {
        if (disposed || committed) return;
        if (vertices.length < 3) {
            toast(`Need at least 3 corners (have ${vertices.length}).`, 'error');
            console.warn('[gis] map2d: <3 vertices, not closing');
            return;
        }

        const ctx = resolveSiteContext(runtime);
        // No site context = a genuine failure; we can't set a boundary, so tear down.
        if (!ctx) { dispose(); return; }

        // §FIX-BOUNDARY-COMMIT-REFUSE (ADR-0299 §Decision 1 + 2) — REFUSE BEFORE MUTATING.
        // The C19 §1.4 parcel polygon is a one-shot. If something ELSE authored a boundary
        // while this map was live (the onboarding draw watchdog's default plot, "Skip
        // drawing", `createSiteFromRect`), this commit is impossible by construction — and
        // everything below it mutates: `dispatchSiteLocation` REBASES the LTP-ENU origin onto
        // the new ring and SUCCEEDS, `dispatchParcelBoundary` is then rejected, and the old
        // code froze the surface + fired `onCommit()` anyway. That combination is the wedge
        // the founder hit: the drawn parcel silently discarded, the frame moved out from under
        // the boundary still committed, and the draw frozen on a commit that never happened.
        //
        // Refuse loudly, change NOTHING, stay armed, and surface the one legal route
        // (CLEAR-then-recreate). `syncCommittedFromStore()` has normally already frozen this
        // surface the moment the external boundary landed, so reaching here means the event
        // never arrived — hence the console.error, not a quiet return.
        const verdict = canCommitParcelBoundary(ctx);
        if (!verdict.ok) {
            console.error(
                '[gis] map2d §FIX-BOUNDARY-COMMIT-REFUSE — REFUSING this commit: ' + verdict.message +
                ' Nothing was mutated (no origin rebase, no boundary write). Reason=' + verdict.reason,
            );
            toast(
                'This site already has a parcel boundary. Press “↺ Redraw boundary” to clear it, then draw or select again.',
                'error',
            );
            // Make the way out visible — the external author never showed it (§L-384 normally
            // reveals it in freezeDraw()). Without this the user has no affordance at all.
            syncCommittedFromStore('refused-commit');
            return;
        }
        // From here on the mutations are ours — suppress the external-boundary listener so it
        // does not report our own synchronous `site.parcel-boundary-set` as somebody else's.
        committingLocally = true;

        // §L-635 (C57 §1.3 / §4, C19 §1.3, C12 §1.5) — ORIGIN-ON-PARCEL. Anchor the LTP-ENU frame
        // origin to the PARCEL's own location (its first vertex, `parcelFrameOrigin`) and project the
        // ring about that SAME point, so the boundary lands at world origin and the always-on
        // project-origin datum sphere sits ON the boundary. C57 §1.3 / §4 REQUIRE dispatchSiteLocation
        // to set the origin BEFORE the ring projects; the old `fromSite ?? firstVertex` precedence
        // projected about a possibly-STALE / far-away geocoded anchor and set the location only after,
        // so a parcel selected or drawn away from the initial geocode landed dist(anchor, parcel) —
        // up to hundreds of km — from origin, off the datum (the founder-reported regression). Set at
        // commit time, before any boundary exists (C19 §1.4 — never a retroactive recentre); the
        // render frame (getFormaOrigin) then reads this SAME origin, so ring and ENU frame cannot
        // diverge (C12 §1.5 / SEAM-2, L-604). Any geocoded street address (C22 PII) is preserved.
        const priorAnchor = getOrigin();
        const origin = parcelFrameOrigin(vertices) ?? { lat: vertices[0]!.lat, lon: vertices[0]!.lon };
        if (priorAnchor) {
            console.log('[gis] map2d: §L-635 anchoring origin to parcel first vertex', origin,
                '— prior site anchor', priorAnchor, 'no longer used for the ring projection.');
        }
        const existingAddress = ctx.store.getSite()?.location?.siteAddress ?? null;
        dispatchSiteLocation(ctx, { latitude: origin.lat, longitude: origin.lon, siteAddress: existingAddress });

        const built = buildBoundaryFromLatLonRing(vertices, origin.lat, origin.lon);
        console.log(`[gis] map2d: ${built.polygon.length} XZ pts`, built.polygon, built.edgeClassifications);

        // §L-536-THETA-RESET — θ MUST be written on EVERY parcel commit, INCLUDING θ = 0.
        //
        // MEASURED, not assumed (probe: scratchpad/probe-l536-frames.mts + probe-l536-zero.mts,
        // 800 real Catastro parcels). The frame chain itself is exact: map lat/lon →
        // buildBoundaryFromLatLonRing → θ de-rotation (dispatchParcelBoundary) → θ re-application
        // (CesiumViewport.toCartesian) round-trips to 1e-14 m with identical vertex counts. So the
        // 2D map and the 3D Site CANNOT disagree — **provided the θ written at commit is the θ read
        // at render.**
        //
        // `dispatchParcelBoundary` guards BOTH the de-rotation AND the θ write behind
        // `if (projectNorthRad !== 0)`. On the θ = 0 branch it therefore leaves the ring in the TRUE
        // frame *and leaves `SiteLocation.trueNorth` at whatever it already was*. On a FRESH site
        // that is harmless (trueNorth defaults to 0). After §L-384 "Redraw" — or any re-selection —
        // it is not: `dispatchClearParcelBoundary` clears the boundary but NOT θ, so a previously
        // selected parcel's θ (±45° everywhere in the Cerdà grid) survives and is then re-applied
        // by the 3D Site to a ring that was never de-rotated. Same origin, same vertex count,
        // bearing off by ~45° — which on a 17–43 vertex cadastral outline does not read as "rotated",
        // it reads as A DIFFERENT SHAPE. That is L-536's signature.
        //
        // θ = 0 exactly is not exotic in Barcelona: 9 of 800 probed parcels (1.1%), because the
        // Eixample *xamfrà* (the 45° chamfered corner) is the LONGEST edge of a corner parcel and
        // is axis-aligned to true north — so `deriveProjectNorthAngleFromParcel` folds it to 0.
        // Rare per-parcel, certain to recur across sessions: exactly an intermittent, thrice-reported
        // defect.
        //
        // FIX HERE, NOT IN THE ENGINE: θ is DERIVED FROM the parcel, so committing a parcel must
        // publish that parcel's θ unconditionally. We call the SAME pure derivation on the SAME
        // input `dispatchParcelBoundary` is about to use, and fill only the branch it skips — so
        // when θ ≠ 0 nothing changes at all (it writes the identical value a line later). The
        // structural fix (making the write unconditional inside `dispatchParcelBoundary`, and
        // checking its currently-ignored return value) belongs in `siteDispatch.ts`, which is owned
        // by another agent this session — see the L-536 audit row.
        const thetaForCommit = deriveProjectNorthAngleFromParcel(built.polygon);
        if (thetaForCommit === 0 && ctx.store.getSite()) {
            console.log(
                '[gis] §L-536-THETA-RESET — this parcel squares to true north (θ = 0), so ' +
                    'dispatchParcelBoundary will skip the θ write. Publishing θ = 0 explicitly so a ' +
                    'PREVIOUS parcel’s project north cannot survive a redraw and rotate this ring on ' +
                    'the 3D Site.',
            );
            dispatchSiteTrueNorth(ctx, 0);
        }

        // §L-1580 (C57 §1.4) — the ring and its attribution commit in ONE command. A DRAWN
        // boundary passes `null`: it has no cadastral source, and stamping one would be a
        // fabricated fact. The variable is consumed here and cleared immediately, so a
        // subsequent draw cannot inherit a previous selection's provenance.
        const provenanceForCommit = pendingParcelProvenance;
        pendingParcelProvenance = null;
        const ok = dispatchParcelBoundary(ctx, {
            polygon: built.polygon,
            edgeClassifications: built.edgeClassifications,
        }, provenanceForCommit);
        // §FIX-BOUNDARY-COMMIT-REFUSE (ADR-0299 §Decision 2 — "callers MUST NOT log a recovery
        // they did not perform"). `freezeDraw()` + `onCommit()` used to run UNCONDITIONALLY, so a
        // rejected dispatch still froze the surface and advanced the onboarding flow to the
        // "Generate with AI?" confirm — reporting a commit that did not happen. A failed dispatch
        // now leaves the draw ARMED so the user can retry, and does NOT advance the host.
        committingLocally = false;
        if (!ok) {
            console.error(
                '[gis] map2d §FIX-BOUNDARY-COMMIT-REFUSE — site.setParcelBoundary dispatch FAILED. ' +
                'NOT freezing the draw and NOT signalling onCommit: the boundary on screen is not ' +
                'the committed one. The draw stays armed so the user can retry.',
            );
            // The store is the truth — if something else did land a boundary, freeze honestly.
            syncCommittedFromStore('failed-dispatch');
            return;
        }
        const area = signedAreaAbs(built.polygon);
        ctx.toast(
            `Site boundary set — ${built.polygon.length} corners (~${area.toFixed(0)} m²).`,
            'success',
        );
        // O.7.2.b — FREEZE, don't dispose: keep the cream map + boundary alive so the
        // "Generate with AI?" confirm step renders over a live plan map. The host
        // (onboarding flow) disposes the map only when the user picks "Generate".
        freezeDraw();
        onCommit?.();
    }

    function cancel(): void {
        if (disposed) return;
        console.log('[gis] map2d: boundary draw cancelled');
        toast('Boundary draw cancelled.', 'info');
        dispose();
    }

    function dispose(): void {
        if (disposed) return;
        disposed = true;
        window.removeEventListener('keydown', keyListener);
        // §FIX-MAP2D-EXTERNAL-BOUNDARY-SYNC — drop the boundary listener (leak-free teardown).
        try { boundarySub?.dispose(); } catch { /* ignore */ }
        boundarySub = null;
        // §MAP2D-ENVELOPE — drop the envelope-visibility listener. A listener left behind would
        // hold this whole closure (and its dead map) alive and repaint into a removed source.
        try { envelopeVisibilitySub?.(); } catch { /* ignore */ }
        envelopeVisibilitySub = null;
        // §PARCEL-VISIBLE-EVERYWHERE (L-13016) — drop the highlight subscription AND the surface
        // registration together. A registration that outlived its subscription would name a view
        // that no longer repaints, which is exactly the claim the registry exists to prevent.
        try { siteHighlightSub?.(); } catch { /* ignore */ }
        siteHighlightSub = null;
        try { siteHighlightSurfaceReg?.(); } catch { /* ignore */ }
        siteHighlightSurfaceReg = null;
        // §ENVELOPE-DRAW C6 — disarm BEFORE unregistering: an armed adapter on a disposed map
        // would still hold capture listeners on a container the map is about to drop, and the
        // gesture above would still believe this surface could finish it (L-7801).
        try { envelopeDrawSurface?.disarm(); } catch { /* ignore */ }
        try { envelopeDrawSurfaceReg?.(); } catch { /* ignore */ }
        envelopeDrawSurfaceReg = null;
        envelopeDrawSurface = null;
        // §MASSING-ON-THE-SITE-VIEWS (L-13022) — drop the massing-slot listener. One left behind
        // would hold this whole closure (and its dead map) alive and repaint into a removed source
        // the next time the user picked an option.
        try { proposedPlateSub?.(); } catch { /* ignore */ }
        proposedPlateSub = null;
        // §SPACE-ENVELOPE-ON-2D-MAP — drop the store's dirty listener. One left behind would hold
        // this whole closure (and its dead map) alive and repaint into a removed source.
        try { spaceEnvelopeSub?.(); } catch { /* ignore */ }
        spaceEnvelopeSub = null;
        // §ENVELOPE-TOOL-ON-THE-SITE-VIEWS — the panel lives INSIDE this overlay, so a dispose that
        // left it open would take its DOM away while the singleton still believed it was mounted,
        // and the next open would re-target a detached node instead of building a fresh panel.
        try { closeSiteEnvelopeTool(); } catch { /* ignore */ }
        // §FIX-DRAW-WATCHDOG-MUST-NOT-AUTHOR — a disposed map is not a drawable surface.
        try { delete (window as unknown as { pryzmBoundaryDrawSurfaceReadyAt?: number }).pryzmBoundaryDrawSurfaceReadyAt; } catch { /* ignore */ }
        // A.21.D9 — remove all pooled dimension-label markers.
        for (const m of dimMarkers) { try { m.remove(); } catch { /* ignore */ } }
        dimMarkers.length = 0;
        // §CIRCLE-BOUNDARY — remove the live radius readout marker.
        if (radiusMarker) { try { radiusMarker.remove(); } catch { /* ignore */ } radiusMarker = null; }
        // MAP-DATA-OVERTURE — cancel any in-flight context fetch + pending debounce.
        try { ctxAbort?.abort(); } catch { /* ignore */ }
        if (ctxDebounce) { clearTimeout(ctxDebounce); ctxDebounce = null; }
        // §MAP2D-PASTEL (L-12938) — cancel the pastel push + its pending debounce.
        try { pastelAbort?.abort(); } catch { /* ignore */ }
        if (pastelDebounce) { clearTimeout(pastelDebounce); pastelDebounce = null; }
        // §SITE-PLAN-OVERLAY — tear down the overlay panel + raster (persistence kept).
        try { overlayController?.dispose(); } catch { /* ignore */ }
        overlayController = null;
        try { delete (window as unknown as { pryzmOpenSitePlanOverlay?: () => void }).pryzmOpenSitePlanOverlay; } catch { /* ignore */ }
        // §SITE-PLAN-OVERLAY-OFF-THE-MAP (L-13093) — a seam that outlives its controller would
        // hand a rail panel a claim on a disposed element and silently answer `false` forever.
        try {
            delete (window as unknown as {
                pryzmMountSitePlanOverlayPanel?: (host: HTMLElement | null) => boolean;
            }).pryzmMountSitePlanOverlayPanel;
        } catch { /* ignore */ }
        // §PARCEL-CARD-DRAGGABLE (L-13091) — the drag binds `document` listeners; leaving them
        // attached keeps this whole closure (and its dead map) alive on every mouse move.
        try { disposeParcelDrag(); } catch { /* ignore */ }
        // The bounds observer holds `overlay` and this closure; an un-disconnected ResizeObserver
        // keeps a disposed map's whole graph reachable, which is the same leak as the drag
        // listeners above and is not caught by removing the node.
        try { parcelCardBoundsObserver.disconnect(); } catch { /* ignore */ }
        try { map.remove(); } catch { /* map may already be torn down */ }
        if (overlay.parentElement) overlay.parentElement.removeChild(overlay);
        console.log('[gis] map2d: disposed');
        onClose?.();
    }

    // ── Wiring ────────────────────────────────────────────────────────────────
    closeBtn.addEventListener('click', () => cancel());
    window.addEventListener('keydown', keyListener);

    // §FIX-MAP2D-EXTERNAL-BOUNDARY-SYNC — watch for a boundary committed by ANY other path
    // while this surface is live, and freeze honestly the moment it lands. This is what
    // stops the founder's "two states at once" screenshot from ever being reachable: the
    // draw/select chrome comes down and "↺ Redraw boundary" comes up as soon as the C19
    // one-shot is spent, whoever spent it. `committingLocally` suppresses our own commit.
    // Also run ONCE at mount: the split can be re-mounted over an already-committed site.
    let boundarySub: { dispose: () => void } | null = null;
    try {
        boundarySub = (runtime ?? null)?.events?.on(
            'site.parcel-boundary-set',
            () => {
                syncCommittedFromStore('external-commit-event');
                // §PARCEL-VISIBLE-EVERYWHERE (L-13016) — PAINT it, and FRAME it. `syncCommitted-
                // FromStore` freezes the draw surface from the store but has never drawn from it;
                // that asymmetry is why a 2D site view opened after a commit showed nothing.
                try { refreshCommittedParcel(); } catch { /* style may be swapping */ }
                try { applySiteHighlightEmphasis(); } catch { /* ignore */ }
                frameCommittedParcel('parcel-committed');
            },
        ) ?? null;
    } catch (e) {
        console.warn('[gis] map2d §FIX-MAP2D-EXTERNAL-BOUNDARY-SYNC: could not subscribe (non-fatal):', e);
    }
    syncCommittedFromStore('mount');

    // ⭐ §ENVELOPE-ONE-VISIBILITY (L-1170) / §ENVELOPE-TWO-AXES (L-1188) — SUBSCRIBE, don't poll and
    // don't be told. The `Envelope: ON/OFF` control writes the one authority and pokes no renderer;
    // every surface repaints itself from this notification, which is what makes "the toggle changed
    // the flag but the map never heard" structurally impossible instead of a branch someone has to
    // remember. The listener takes NO argument by design — it says "it changed; re-ask" — so
    // `refreshEnvelope` re-reads both axes rather than caching a snapshot of the answer.
    // Mirrors `CesiumViewport.envelopeVisibilitySub` and `ParcelBoundarySceneRenderer`.
    let envelopeVisibilitySub: (() => void) | null = null;
    try {
        envelopeVisibilitySub = subscribeBuildableEnvelopeVisibility(() => {
            if (disposed) return;
            try { refreshEnvelope(); } catch { /* style may be mid-swap; installRingLayers repaints */ }
        });
    } catch (e) {
        console.warn('[gis][c58] map2d §MAP2D-ENVELOPE: could not subscribe to the envelope visibility authority (non-fatal):', e);
    }

    // ⭐ §PARCEL-VISIBLE-EVERYWHERE (L-13016) — THE SUBSCRIPTION, AND THE DECLARATION.
    //
    // Same PUSH-not-poll contract as the two subscriptions above: the envelope card's row handler
    // writes ONE store and pokes no renderer, and every surface repaints itself from this
    // notification. Until this commit `siteGeometryHighlight` had exactly one subscriber
    // (`ParcelBoundarySceneRenderer`, `'BIM 3D'`), so on three of the Parcel Law tab's four views
    // a click on a number repainted the row's ◉ and changed nothing on screen.
    //
    // §SITE-HIGHLIGHT-REACH — and DECLARE that this surface draws it, in the founder's own word
    // for the view (matching the view switcher's label). The row's tooltip derives *"where will
    // this show?"* from who registered, so the sentence can never out-run the wiring. Registered
    // BESIDE the subscription and disposed WITH it.
    let siteHighlightSub: (() => void) | null = null;
    let siteHighlightSurfaceReg: (() => void) | null = null;
    try {
        siteHighlightSub = subscribeSiteHighlight(() => {
            if (disposed) return;
            try { refreshHighlightCue(); } catch { /* style may be mid-swap */ }
            try { applySiteHighlightEmphasis(); } catch { /* ignore */ }
        });
        siteHighlightSurfaceReg = registerSiteHighlightSurface('siteBoundaryMap2d', '2D Site Map');
    } catch (e) {
        console.warn('[gis] map2d §PARCEL-VISIBLE-EVERYWHERE: could not subscribe to the site-highlight store (non-fatal):', e);
    }

    // ── ⭐ §ENVELOPE-DRAW C6 (L-13050) — THIS MAP BECOMES A DRAW SURFACE ────────────────────
    //
    // The founder's top-priority sentence names BOTH views: *"THE CAPACITY TO CREATE — DRAW —
    // DESIGN BUILDABLE ENVELOPES IN THE 2D SITE VIEW AND 3D SITE VIEW — SAME PRINCIPLE."* This
    // registration is what makes the create panel's Draw button arm THIS surface as well as 3D Site.
    //
    // ⛔ IT ADDS NO MAP EVENT BINDING, AND THIS COMMENT DELIBERATELY DOES NOT SPELL THE ONE THAT
    // EXISTS — `siteMap2DStyleV2.spec.ts` counts that literal by GREP, so a comment quoting it reads
    // as a second binding. That is §RAF-GATE-COMMENT-BLIND (P3, 2026-08-10), where a gate counted
    // three doc comments asserting compliance as three violations; it fired on this very edit and is
    // recorded here rather than quietly worked around. The single click binding this file holds, and
    // its precedence ladder, are both UNTOUCHED — the adapter consumes its clicks with CAPTURE-phase DOM
    // listeners on `getCanvasContainer()`, so an event it takes never becomes a MapLibre click and
    // never reaches the precedence ladder. L-69 is structurally absent here rather than out-ranked.
    // That is also why `freezeDraw()` having detached dblclick/mousemove/key after a parcel commit
    // does not matter: the adapter never borrowed those handlers.
    //
    // ⚠ HEIGHT IS NOT DRAWN ON A PLAN MAP (L-13045) — there is no screen direction meaning "up".
    // The adapter yields a RING; the storey count on the create panel supplies the height.
    let envelopeDrawSurface: SiteEnvelopeDrawMap2D | null = null;
    let envelopeDrawSurfaceReg: (() => void) | null = null;
    try {
        envelopeDrawSurface = new SiteEnvelopeDrawMap2D({
            map: map as unknown as EnvelopeDrawMapLike,
            // ⛔ THE ONE ORIGIN (R6) — the same `getOrigin` every other projection on this map uses,
            // never a re-read geocode.
            getOrigin,
            // θ — the SAME `SiteLocation.trueNorth` this file's own envelope rasteriser reads, through
            // the same `resolveSiteContext` (which owns the window.runtime fallback, so no cast is
            // minted here — P4 / L-845). `null` is a REFUSAL, never θ = 0 (the §L-446 ambiguity).
            getSiteLocation: () => {
                try { return resolveSiteContext(runtime ?? null)?.store?.getSite()?.location ?? null; }
                catch { return null; }
            },
        });
        envelopeDrawSurfaceReg = registerEnvelopeDrawSurface(envelopeDrawSurface);
        console.log('[gis] map2d §ENVELOPE-DRAW registered as an envelope-perimeter draw surface.');
    } catch (e) {
        console.warn('[gis] map2d §ENVELOPE-DRAW: could not register the draw surface (non-fatal) — '
            + 'the Draw button on the envelope panel will SAY SO rather than doing nothing:', e);
    }

    // ⭐ §MASSING-ON-THE-SITE-VIEWS (L-13022) — SUBSCRIBE TO THE ONE MASSING SLOT.
    //
    // Same PUSH-not-poll contract as the two subscriptions above, and the same shape: the card
    // writes ONE session slot when the user picks an option and pokes no renderer. This is also the
    // TEARDOWN path — the notification that carries a withdrawal is the notification that takes the
    // plate off the map, so a plate cannot outlive the proposal it draws.
    let proposedPlateSub: (() => void) | null = null;
    try {
        proposedPlateSub = subscribeTargetFootprintProposal(() => {
            if (disposed) return;
            try { refreshProposedPlate(); } catch { /* style may be mid-swap; installSiteHighlightLayers repaints */ }
            try { applySiteHighlightEmphasis(); } catch { /* ignore */ }
        });
    } catch (e) {
        console.warn('[gis] map2d §MASSING-ON-THE-SITE-VIEWS: could not subscribe to the massing slot (non-fatal):', e);
    }

    // ⭐ §SPACE-ENVELOPE-ON-2D-MAP (L-13017) — SUBSCRIBE TO THE STORE'S DIRTY CHANNEL, not to a bus
    // event. `applyPatch()` notifies `subscribeDirty` on EXECUTE, UNDO and REDO alike, which is why
    // the Cesium arm needs no bus subscriber either — and why `performUndoRedo.ts`'s generic
    // `spaceEnvelope` row stays honest. The listener redraws from the STORE, never from the diff:
    // a partial redraw would need its own feature index and would become a second answer to "what
    // is on screen" (C84 EI-9).
    //
    // ⚠ The runtime is late-injected on the live boot path (`createMainLayout(props, null)`), so a
    // null store here is the ordinary early case, not a failure — the mount-time
    // `installSiteHighlightLayers()` paint covers a map opened over an already-authored project.
    let spaceEnvelopeSub: (() => void) | null = null;
    try {
        const seStore = runtime?.stores?.spaceEnvelope as DirtySpaceEnvelopeStore | undefined;
        // The same STRUCTURAL narrowing `initTools` and `CesiumViewport` perform, and for the same
        // reason: `PluginDtoStoreHandle` declares only `getState()` while the live store also
        // carries `subscribeDirty`. Never a cast through `any` (P4), and never an assumption.
        if (seStore && typeof seStore.subscribeDirty === 'function') {
            spaceEnvelopeSub = seStore.subscribeDirty(() => {
                if (disposed) return;
                try { refreshSpaceEnvelopes(); } catch { /* style may be mid-swap */ }
            });
            console.log(
                '[gis] map2d §SPACE-ENVELOPE-ON-2D-MAP subscribed to the ONE space-envelope store '
                + '(subscribeDirty — execute, undo and redo alike). STR §26.4.',
            );
        }
    } catch (e) {
        console.warn('[gis] map2d §SPACE-ENVELOPE-ON-2D-MAP: could not subscribe to the space-envelope store (non-fatal):', e);
    }

    map.on('load', () => {
        installRingLayers();
        // §PARCEL-VISIBLE-EVERYWHERE (L-13016) — the committed parcel + the highlight cue. Added
        // here rather than inside `installRingLayers` so the pinned parcel/boundary path stays
        // byte-identical (`siteMap2DStyleV2.spec.ts` ARM 2).
        installSiteHighlightLayers();
        // Defect 1 — land on THEIR plot, not the world. Prefer the geocode bbox
        // (frames the whole feature); fall back to a centred zoom on the point.
        const bbox = opts.initial?.bbox;
        const valid =
            bbox && bbox[2] > bbox[0] && bbox[3] > bbox[1] &&
            Number.isFinite(bbox[0]) && Number.isFinite(bbox[1]) &&
            Number.isFinite(bbox[2]) && Number.isFinite(bbox[3]);
        if (valid && bbox) {
            const [w, s, e, n] = bbox;
            // maxZoom 18 so a tiny single-building bbox still shows context.
            map.fitBounds([[w, s], [e, n]], { padding: 80, maxZoom: 18, duration: 0 });
            console.log('[gis] map2d: fit to geocode bbox', bbox);
        } else if (opts.initial) {
            map.jumpTo({ center: [opts.initial.lon, opts.initial.lat], zoom: opts.initial.zoom ?? 16 });
            console.log('[gis] map2d: centred on point', opts.initial.lat, opts.initial.lon);
        }
        // §PARCEL-VISIBLE-EVERYWHERE (b) (L-13016) — *"we should have the parcel highlighted and
        // ZOOM IN relatively on it"*. LAST, so it overrides the opening frame when — and only
        // when — a parcel is actually committed. With nothing committed this is a no-op and the
        // geocode/site framing above stands, which is still the right answer there.
        frameCommittedParcel('mount');
        // §FIX-ONBOARDING-OVERLAY-SINGLE-PANEL-NO-BOUNDARY-SPLIT3D (L-194) — OVERLAY-ONLY mode:
        // do NOT attach ANY boundary-draw interaction. The map exists solely to place + calibrate
        // the site-plan overlay (whose controller binds its OWN map 'click' handler for the
        // 2-point calibration, mounted below). Never attaching the draw handlers is the definitive
        // "disarm": no vertex can ever be added, no boundary can ever be committed, and no
        // "Generate with AI?" confirm can ever be triggered from this map. (onClick also
        // early-returns on overlayOnly as belt-and-braces.) The draw-plot branch attaches as before.
        // §FIX-MAP2D-EXTERNAL-BOUNDARY-SYNC — `!committed` added: mounting over a site that
        // ALREADY has a committed C19 boundary must not arm a draw the store will reject.
        if (!opts.overlayOnly && !committed) {
            // §L-384 — factored so the RE-DRAW path (rearmDraw) can re-attach after a freeze.
            attachDrawHandlers();
        }
        // §L-384 — reflect the initial undo/redo affordance state (draw + polygon mode).
        refreshEditBar();
        // MAP-DATA-OVERTURE — populate context footprints now + on every pan/zoom.
        loadContextBuildings(true);
        map.on('moveend', () => loadContextBuildings(false));
        // §MAP2D-PASTEL (L-12938) — the baked context layers on the same cadence.
        loadPastelContext(true);
        map.on('moveend', () => loadPastelContext(false));

        // §SITE-PLAN-OVERLAY — mount the client-plan overlay controller now the map is
        // ready. It renders the calibrated raster UNDER the violet draw layers and owns
        // the upload + move/scale/rotate/opacity/calibrate panel. The boundary tracing
        // itself stays the existing draw tool — the overlay only sits beneath it.
        try {
            const ctx = resolveSiteContext(runtime ?? null);
            overlayController = mountSitePlanOverlayController({
                map,
                // §SITE-PLAN-OVERLAY-OFF-THE-MAP (L-13093) — the DOCK, not the overlay. In
                // normal boundary-draw mode the dock is `display:none`, so the panel is off the
                // main view until a host claims it through the seam below; in overlay-only mode
                // the dock is visible and this is byte-for-byte the previous behaviour.
                parent: sitePlanDock,
                getOrigin,
                projectId: ctx?.projectId ?? null,
                toast: (message, severity) => {
                    (runtime ?? null)?.events?.emit('pryzm:toast', { message, severity });
                },
                // §FEAT-PROJECT-TRUE-NORTH (ADR-0114) — commit the underlay placement as
                // Project North: mirror θ onto SiteLocation.trueNorth via the P6 command
                // path so the 3D globe/site view sits the model at true north.
                onCommitProjectNorth: (thetaRad: number) => {
                    const c = resolveSiteContext(runtime ?? null);
                    if (c) dispatchSiteTrueNorth(c, thetaRad);
                },
                // §FIX-SITE-OVERLAY-RENDER-AND-FLOW (L-58) — the placement commit is the
                // wizard's "proceed" action. Emit an event the onboarding listens for to
                // advance Step 2 → the boundary-trace / plot step (L-38: a geolocated plan
                // is a valid located plot — no mandatory boundary trace to move forward).
                // §FIX-SITE-PLAN-OVERLAY-ORDER-AND-ENTER-CANVAS (L-258 B) — THE FLOW OWNS ITS OWN
                // TERMINAL TRANSITION. Emitting the event alone was the bug: its ONLY subscriber
                // was an ephemeral listener inside the onboarding wizard's overlay branch, so
                // every other entry into this panel (the always-on Plan + Site (GIS) launcher —
                // C06 §7 — the map's "Overlay plan / PDF" button, or a re-entry on an already
                // onboarded project) pressed "✓ Finish", created the underlay… and fired the
                // event into an EMPTY BUS. The user stayed on the map. We still emit (the
                // onboarding wizard listens so it can dispose itself), and then we perform the
                // landing ourselves — idempotent, so the two callers land ONCE.
                onPlacementCommitted: () => {
                    void onSitePlanPlacementCommitted(runtime ?? null);
                },
                // §FEAT-SITE-OVERLAY-PLAN-UNDERLAY (L-71) — drop the calibrated plan into the
                // editor canvas as a live underlay (correct location + size, axis-aligned to
                // project north for orthogonal plan-view tracing). Reuses the existing
                // FloorPlanUnderlayTool + CREATE_UNDERLAY pipeline. §FIX-SITE-OVERLAY-ENTER-CANVAS
                // (L-78) — RETURN the promise so the controller AWAITS it before the host frames
                // the canvas on the (now-existing) underlay.
                onEnterCanvas: (params: EnterCanvasUnderlayParams) =>
                    createPlanCanvasUnderlayFromSiteOverlay(params).then(() => undefined),
            });
            // §SITE-PLAN-OVERLAY — window hook so the onboarding "Overlay a plan/PDF"
            // choice can open the upload picker after the draw map mounts.
            (window as unknown as { pryzmOpenSitePlanOverlay?: () => void }).pryzmOpenSitePlanOverlay =
                () => overlayController?.promptUpload();
            // ⭐ §SITE-PLAN-OVERLAY-OFF-THE-MAP (L-13093) — THE RE-HOST SEAM, modelled on
            // `pryzmMountEnvelopeCard` down to the return value: a host CLAIMS the panel, and
            // `null` releases it back to this map's (hidden, in normal mode) dock.
            //
            // ⛔ IT MOVES ONE ELEMENT. `appendChild` re-parents; there is no clone and no second
            // controller, so the calibration state machine, the MapLibre raster it drives and the
            // `isCalibrating()` the draw tool yields to are all the same objects wherever the
            // panel is rendered. Cloning it would give this app two panels that can disagree
            // about whether a plan is placed — the C06 §13.3 shape.
            //
            // A host that is not connected is refused rather than accommodated: the seam returns
            // false and the panel stays where it is (the same `document.contains` self-healing
            // `getForma3dHostEl` applies, and for the same reason — a claim honoured onto a
            // detached node strands the panel where nothing can reach it).
            (window as unknown as {
                pryzmMountSitePlanOverlayPanel?: (host: HTMLElement | null) => boolean;
            }).pryzmMountSitePlanOverlayPanel = (host: HTMLElement | null): boolean => {
                const el = overlayController?.element;
                if (!el) return false;
                const target = host && host.isConnected ? host : sitePlanDock;
                if (el.parentElement !== target) target.appendChild(el);
                return target !== sitePlanDock;
            };
        } catch (err) {
            console.warn('[site-overlay] controller mount failed (non-fatal):', err);
        }

        // §FIX-DRAW-WATCHDOG-MUST-NOT-AUTHOR (ADR-0299) — stamp the moment the draw surface
        // became genuinely usable. The onboarding idle timer starts its clock from THIS, never
        // from when its step rendered: charging our own load time (the observed 25 s tiles stall)
        // to the user's patience is what made the old watchdog fire on people who had not yet
        // been shown a map. Cleared in dispose() so a torn-down map never reads as ready.
        if (!opts.overlayOnly) {
            (window as unknown as { pryzmBoundaryDrawSurfaceReadyAt?: number }).pryzmBoundaryDrawSurfaceReadyAt = Date.now();
        }
        console.log('[gis] map2d: ready — Forma minimal-vector boundary-draw map mounted');
    });

    // §VIEW-PANEL-PER-PANE — the SAME `swapBasemap` the corner chip calls (it is the click
    // handler two lines below its definition), handed out rather than copied. There is one
    // basemap implementation in this app and this is it.
    return {
        element: overlay,
        dispose,
        rearm: rearmDraw,
        setBasemap: (next) => swapBasemap(next),
        getBasemap: () => basemap,
        // §MAP-IS-A-SINGLETON-TOO (L-12992) — see the interface for why this exists.
        reparentTo: (host: HTMLElement): void => {
            if (disposed) return;
            if (overlay.parentElement !== host) {
                host.appendChild(overlay); // MOVES the one node — no clone, no second map.
                console.log(
                    '[gis] map2d: §L-12992 reparentTo #' + (host.id || '(no-id)') +
                    ' — the single map re-targeted into a pane (no new map, no tile refetch).',
                );
            }
            try { map.resize(); } catch { /* torn down mid-move */ }
            // §PARCEL-VISIBLE-EVERYWHERE (b) (L-13016) — THE FOUNDER'S EXACT GESTURE. He was in
            // split view (2D satellite + 3D), then switched to a single 2D site view; §L-12992
            // RE-TARGETS this one map rather than re-mounting it, so nothing re-ran the opening
            // frame and the camera stayed wherever the split had left it. Re-frame the committed
            // parcel on every re-target, so *"no matter the view selected"* holds across a view
            // switch and not only across a fresh mount. No-op when nothing is committed.
            frameCommittedParcel('reparent');
        },
        isPlacedIn: (host: HTMLElement): boolean => !disposed && overlay.parentElement === host,
        resize: (): void => { if (!disposed) { try { map.resize(); } catch { /* torn down */ } } },
        // §MAP2D-ENVELOPE (STR §26.4) — see the interface for why the caller passes the PAYLOAD and
        // never the decision. Safe before `map.on('load')`: the solids are stored and the very
        // first `installEnvelopeLayers()` paints them.
        setBuildableEnvelope: (solids: ReadonlyArray<MassingSolid> | null): void => {
            if (disposed) return;
            envelopeSolids = solids ?? [];
            try { refreshEnvelope(); } catch (e) {
                console.warn('[gis][c58] map2d §MAP2D-ENVELOPE: repaint failed (non-fatal):', e);
            }
        },
    };
}

/** Absolute shoelace area of an XZ ring (m²) — for the commit toast. */
function signedAreaAbs(ring: ReadonlyArray<{ x: number; z: number }>): number {
    let a = 0;
    for (let i = 0; i < ring.length; i++) {
        const p = ring[i]!;
        const q = ring[(i + 1) % ring.length]!;
        a += p.x * q.z - q.x * p.z;
    }
    return Math.abs(a / 2);
}
