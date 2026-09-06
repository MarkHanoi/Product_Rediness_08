// A.8.x (IP-A2) — render the committed parcel boundary as an in-scene ground
// outline.
//
// WHY THIS EXISTS
// ---------------
// The GIS boundary-draw tool (A.8.c) projects the drawn lat/lon ring → scene-XZ
// and commits it to the C19 SiteModelStore via `site.setParcelBoundary`
// (siteDispatch.ts → `site.parcel-boundary-set`). Until now that polygon lived
// ONLY in the store: after authoring a plot the user saw nothing on the ground.
// The founder asked for the boundary to STAY visible as site context — a subtle
// footprint distinct from generated walls.
//
// WHAT IT DRAWS
// -------------
// A closed violet (#6600FF, the unified PRYZM preview colour — see
// preview-color-unified-pryzm-purple) `LineLoop` along the parcel vertices at
// y ≈ 0 (slight +y offset to avoid z-fighting with the ground grid), plus a very
// faint translucent fill so the lot reads as a footprint. It uses the SAME
// scene-XZ projection the apartment generator consumes (it reads the polygon
// straight from `runtime.siteModelStore.getParcelBoundary()` — already in
// scene-XZ metres, NOT lat/lon — so the outline aligns with generated walls).
//
// P2 (single THREE owner) — HOW WE STAY COMPLIANT
// -----------------------------------------------
// `THREE` is imported from the `@pryzm/renderer-three/three` re-export facade,
// NOT bare `'three'`. The P2 tripwire (`tools/ga-gate/check-three-imports.ts`
// §15-17) explicitly allows the `@pryzm/renderer-three/three` sub-path as a
// "P2-compliant path through the owner" — 67 editor files already use it. We
// add NO new THREE primitive to renderer-three; the LineLoop / mesh are built
// from the namespace the owner re-exports.
//
// NON-PICKABLE OVERLAY MECHANISM (reused, not invented)
// -----------------------------------------------------
// The outline group is placed on `EDITOR_LAYER` (scene-committer SceneLayers
// §14/§67) — the SAME mechanism the OBC SimpleGrid + tool-preview ghosts use.
// The SelectionManager raycaster targets only `BIM_LAYER` (0), so the boundary
// is rendered by the camera (which enables all layers) but is never selectable
// or intercepted by modelling tools. We also set `raycast = () => {}` on the
// objects as belt-and-braces.
//
// LIFECYCLE + PROJECT-SCOPING
// ---------------------------
// - Created once per engine init (`initScene`), subscribes to
//   `runtime.events.on('site.parcel-boundary-set')` and redraws.
// - `refresh()` reads the current store snapshot and rebuilds, so it is also
//   called once at init (project-load with a pre-existing boundary) and after a
//   project switch.
// - Registered with `projectScopeRegistry` so the C13 project-switch reset
//   (alongside the stores) clears the outline — a Project A parcel never lingers
//   into Project B. `dispose()` is idempotent and frees geometry/material.

import * as THREE from '@pryzm/renderer-three/three';
import { safeDisposeObject3D } from '@pryzm/renderer-three';
import { EDITOR_LAYER } from '@pryzm/scene-committer';
import { projectScopeRegistry } from '@pryzm/core-app-model';
import type { PryzmRuntime } from '@pryzm/runtime-composer';
import { getLastBuildableEnvelope, isLastEnvelopeSuggestedPreview } from './siteDispatch';
// C58 §1.14 (lane E2a) — the hue HEX constants only: the honesty CLASSIFICATION now arrives on
// each `MassingSolid.style` (decided in L2 by `envelopeToMassing`); this surface just maps the
// seam's hue vocabulary to the same three colours the flat card uses.
import { CONFIDENT_VIOLET_HEX, PROVISIONAL_GREY_HEX, SUGGESTED_AMBER_HEX } from './envelopeRenderStyle';
// §ENV3D164 (L-12700) — the STUDY MASSING (§MANUALENV159 / §ENVAMS148): a context-derived or
// user-typed massing, computed ONLY when no normative buildable envelope resolves at all. See
// `buildContextStudyVolume` below for why it routes through this SAME renderer instead of a new one
// (C84 EI-9 — one renderer, two input sources) and why its material treatment must differ from the
// plan-backed envelope above.
import {
    getContextDerivedStudyEnvelope,
    subscribeContextDerivedStudyEnvelope,
} from './contextDerivedStudyEnvelopeState';
// ⭐ §ENVELOPE-ONE-VISIBILITY (L-1170) — the SINGLE authority for "is the buildable envelope on
// screen?". THIS RENDERER WAS THE SURFACE THAT NEVER ASKED: it drew the study volume into the
// BIM + plan scene straight off `getLastBuildableEnvelope()`, so the GIS card's `Envelope: OFF`
// had literally no effect here: once an envelope solved, this volume was unhideable by any control
// in the product. ⚠ It was NOT the box in the founder's 2026-08-19 report — his log shows
// `getLastBuildableEnvelope()` returning null-or-not-`ok` (that is why the re-inset path ran), and
// this renderer reads the same function, so it drew nothing that session. Same family, different
// instance; fixed on its own merits, not credited with his symptom.
import {
    getBuildableEnvelopeAxes,
    subscribeBuildableEnvelopeVisibility,
} from './envelopeVisibility';
// ⭐ §ENVELOPE-TWO-AXES (C58 §1.17 / L-1188) — the PURE rule for what the user's two visibility axes
// mean as geometry. Read HERE rather than re-implemented, so this surface and the Cesium §1.14
// rasteriser cannot read one preference two different ways (which is the L-1170 shape one level down).
// C58 §1.14 / STRUCTURAL-SEAM-1 (lane E2a, 2026-09-01) — the ENGINE emits the solids; this
// renderer only rasterises them. `envelopeToMassing` + `envelopeGroundShade` are the SAME two
// pure functions the Cesium globe consumes, so the BIM/plan scene and the 3D Site can no
// longer drift on tiers / FAR split / upper-bound weight / open-top posture.
import {
    envelopeToMassing,
    envelopeGroundShade,
    GROUND_SHADE_HEIGHT_M,
    type MassingSolid,
    envelopeDrawMode,
    type EnvelopeDrawMode,
} from '@pryzm/site-parcel-data';
// §CESIUMENV167 (L-12760) — the study's hue/fill-alpha constants moved to this shared,
// dependency-free module so `CesiumViewport.ts` (the globe / 3D Site) can read the IDENTICAL
// numbers rather than a hand-copied second literal. Pure hoist — same values, same names, no
// behaviour change here. See that module's header for the full reasoning (unit-independent
// colour/opacity live there; unit-dependent dash sizing stays local to each renderer, below).
import {
    STUDY_MASSING_TEAL,
    STUDY_MASSING_FILL_ALPHA,
    STUDY_GROUND_SHADE_FILL_ALPHA,
} from './contextStudyMassingStyle';
// ⭐ §RESI-ORCH-HIGHLIGHT (STR-RESIDENTIAL-DESIGN-ORCHESTRATOR §3, lane RESI-ORCH 2026-09-04) —
// THE SUBSCRIBER. The envelope card names a NUMBER; this renderer owns the GEOMETRY that number
// describes; `siteGeometryHighlight` is the vocabulary between them. Until this commit that module
// had ZERO subscribers repo-wide, so every clickable row on the card toggled a store and changed
// NOTHING on screen — a binding that exists is not an interaction that works
// (§COMMITTED-IS-NOT-REACHABLE). Same PUSH-not-poll contract as the two subscriptions above.
//
// ⛔ THE EMPHASIS RULE LIVES IN THAT MODULE, NOT HERE, and it is one-directional: everything that
// is NOT the subject RECEDES; the subject is never brightened and its hue never changes. Boosting
// a provisional solid to "highlight" it would make an estimate read as a determination — §L-616
// re-introduced by a UI affordance. See `SITE_HIGHLIGHT_RECEDE_FACTOR` for why it is a MULTIPLIER
// on the authored alpha rather than a target value.
import {
    getSiteHighlight,
    subscribeSiteHighlight,
    // §SITE-HIGHLIGHT-REACH — see the registration beside the subscription below.
    registerSiteHighlightSurface,
    siteHighlightCue,
    siteHighlightEmphasis,
    SITE_HIGHLIGHT_RECEDE_FACTOR,
    type SiteHighlightSubject,
    type SiteHighlightRole,
} from './siteGeometryHighlight';
// §RESI-ORCH-HIGHLIGHT — the frontage cue reads the SAME determination the card's frontage clause
// and the highlight-availability rule read (three arms: unrecorded / landlocked / n > 0).
// Re-deriving "which edges are front" here would be a second answer to a question that already has
// an owner, and the copy that DRAWS would win silently.
import {
    determineParcelEdgeClassifications,
    FRONT_EDGE,
} from './parcelEdgeClassificationDetermination';
// §RESI-ORCH-TARGET-AREA (STR §5, lane RESI-ORCH 2026-09-04) — the user's proposed ground-floor
// plate. The card solves it; this renderer puts it on the ground. Asked through the STALENESS GATE
// (`resolveLiveTargetFootprintProposal`), never `getTargetFootprintProposal`, so the scene and the
// card cannot disagree about whether the plate still describes the current permitted footprint.
import {
    resolveLiveTargetFootprintProposal,
    subscribeTargetFootprintProposal,
} from './targetFootprintAreaState';
// §TOBE-ENVELOPE (STR §25.2, lane PL-TOBE-ENVELOPE 2026-09-06) — the TO-BE-BUILT envelope's ONE
// colour, shared with `spaceEnvelopeAppearance` (the adopted C114 level prism) and the card legend.
// The proposed plate and the element it becomes are THE SAME THING at two moments of its life, so
// they must be the same colour; before this import the plate was study-teal and the adopted prism
// was violet, and the user watched it change identity twice on one click.
import {
    TO_BE_BUILT_ROSE,
    TO_BE_BUILT_GROUND_FILL_ALPHA,
} from './toBeBuiltEnvelopeStyle';

/** The unified PRYZM preview / site-context violet. */
const PRYZM_VIOLET = 0x6600ff;

/** Slight +y lift (metres) so the outline never z-fights the ground grid. */
const GROUND_Y_OFFSET = 0.02;

/** §RESI-ORCH-HIGHLIGHT — ground-level cues sit just ABOVE the parcel ring and fill so a
 *  highlighted subset of the boundary is not z-fought by the boundary it is a subset of. */
const HIGHLIGHT_CUE_Y = GROUND_Y_OFFSET * 3;

// ════════════════════════════════════════════════════════════════════════════════════════════
// §ENV3D164 (L-12700) — STUDY MASSING render treatment. ⛔ NON-NEGOTIABLE: this must NEVER read
// as the plan-backed envelope above, on any single channel, because a study massing carries NO
// ordinance behind it at all — not even the "estimate" tier `PROVISIONAL_GREY` names. If a viewer
// cannot tell the two apart, an indicative number reads as a legal one — the exact §L-616
// overstatement this repo has burned itself on before (see `envelopeRenderStyle.ts`'s own header).
// So THREE independent channels differ from the plan-backed volume, not one:
//   1. HUE       — teal, a colour used nowhere else in this file's honesty vocabulary (confident
//                  violet / provisional grey / suggested amber are all spoken for).
//   2. SILHOUETTE — always open-top (no cap), the SAME disclosure device §OPEN-TOP-INDICATIVE uses
//                  for "PRYZM claims no buildable right here" — true of a study in a stronger sense
//                  (it is not tied to any ordinance at all, not even an estimated one).
//   3. OUTLINE   — a DASHED rim (not solid), so even a greyscale screenshot with the fill washed
//                  out still reads "sketch", never "surveyed solid". No dashed line appears
//                  anywhere else in this file.
// ════════════════════════════════════════════════════════════════════════════════════════════

// STUDY_MASSING_TEAL / STUDY_MASSING_FILL_ALPHA / STUDY_GROUND_SHADE_FILL_ALPHA — imported above
// from `./contextStudyMassingStyle` (§CESIUMENV167). Used exactly as before this file's own hue/
// fill-alpha constants; only their DEFINITION moved, so `CesiumViewport.ts` reads the same values.

/** Dashed-rim tuning (metres) — small relative to a typical building footprint so the dashes read
 *  as a texture, not as a countable set of segments. */
const STUDY_DASH_SIZE_M = 0.6;
const STUDY_DASH_GAP_M = 0.4;


/** A 2D point on the scene ground plane (metres). Matches C19 `Pt`. */
interface XZPoint {
    readonly x: number;
    readonly z: number;
}

/**
 * Shoelace area (m²) of a scene-XZ ring, sign-independent.
 *
 * ⚠ USED FOR EXACTLY ONE THING: the §RESI-ORCH-TARGET-AREA staleness read, and only as the FALLBACK
 * when `insetAreaM2` is absent — the envelope's own field is preferred so this renderer and the
 * card compare the same number. It is deliberately NOT a general measurement helper: the card's
 * `permittedStudyFigures` is the ONE producer of the footprint figure the user sees (C06 §13.3).
 */
function ringAreaM2XZ(ring: ReadonlyArray<XZPoint>): number {
    if (ring.length < 3) return 0;
    let twice = 0;
    for (let i = 0; i < ring.length; i++) {
        const a = ring[i]!;
        const b = ring[(i + 1) % ring.length]!;
        twice += a.x * b.z - b.x * a.z;
    }
    return Math.abs(twice) / 2;
}

/**
 * Draws (and keeps in sync) the committed C19 parcel boundary as a subtle
 * ground outline. One instance per engine session; wired from `initScene`.
 */
export class ParcelBoundarySceneRenderer {
    private readonly scene: THREE.Scene;
    private readonly runtime: PryzmRuntime;

    /** The live overlay group (line loop + faint fill), or null when none. */
    private group: THREE.Group | null = null;

    private readonly disposers: Array<() => void> = [];
    private disposed = false;

    constructor(scene: THREE.Scene, runtime: PryzmRuntime) {
        this.scene = scene;
        this.runtime = runtime;

        // Redraw whenever a boundary is committed (one-shot per C19 §1.4, but a
        // project switch + re-author can fire it again on a fresh Site).
        const sub = runtime.events.on('site.parcel-boundary-set', () => {
            this.refresh();
        });
        // `EventSubscription` is callable as its own unsubscribe.
        this.disposers.push(() => sub());

        // §L-384 — a `site.replace` (e.g. CLEAR-then-redraw of the immutable C19 §1.4
        // boundary) empties the store WITHOUT a `site.parcel-boundary-set` event (which
        // would advance the onboarding flow). Subscribe to the store's own coarse
        // mutation notification so the outline re-reads the now-empty store + clears.
        // Idempotent: refresh() rebuilds only when the polygon is present + ≥3 vertices.
        const storeSub = runtime.siteModelStore?.subscribe?.(() => this.refresh());
        if (storeSub) this.disposers.push(storeSub);

        // ⭐ §ENVELOPE-ONE-VISIBILITY (L-1170) — repaint when the user's answer changes. PUSH,
        // not poll, and deliberately NOT the GIS card calling into this renderer: the card is
        // mounted only while the GIS area exists, and this scene outlives it. Subscribing to the
        // authority is what makes the two surfaces agree without knowing about each other.
        this.disposers.push(subscribeBuildableEnvelopeVisibility(() => this.refresh()));

        // §ENV3D164 (L-12700) — repaint when the STUDY massing changes: computed for the first
        // time, replaced by a user-typed height, or cleared by a project switch. Same PUSH
        // discipline as the subscription above — this renderer never polls, so a study saved
        // while the scene is idle still reaches the ground the moment it is saved.
        this.disposers.push(subscribeContextDerivedStudyEnvelope(() => this.refresh()));

        // ⭐ §RESI-ORCH-HIGHLIGHT (STR §3) — repaint when the user clicks a NUMBER on the envelope
        // card. A full `refresh()` rather than an in-place material poke, deliberately: the cue
        // geometry (front edges / inset ring / limit plane) EXISTS ONLY while its subject is
        // active, so a rebuild is what makes "clear the highlight" leave no residue. Rebuilds are
        // already the norm here — every boundary commit and every visibility flip does one.
        this.disposers.push(subscribeSiteHighlight(() => this.refresh()));
        // §SITE-HIGHLIGHT-REACH — and DECLARE that this scene draws it, in the founder's own word
        // for the view. The card's row affordance derives "where will this show?" from who
        // registered, so the sentence it prints can never out-run the wiring: a lane that later
        // subscribes Cesium adds its row here and the affordance updates itself, while a session
        // in which this scene never initialised makes the row say so instead of naming a view the
        // user cannot reach. Registered BESIDE the subscription and disposed WITH it — a
        // registration that outlived its subscription would name a view that no longer repaints.
        this.disposers.push(registerSiteHighlightSurface('parcelBoundaryScene', 'BIM 3D'));

        // §RESI-ORCH-TARGET-AREA (STR §5) — repaint when the user proposes (or withdraws) a
        // ground-floor plate. Same PUSH discipline: the card writes the store and stops; it never
        // reaches into this scene.
        this.disposers.push(subscribeTargetFootprintProposal(() => this.refresh()));

        // Project-switch reset — clear the outline alongside the stores so a
        // Project A parcel never renders against Project B (C19 §1.13).
        projectScopeRegistry.register({
            scopeName: 'parcelBoundaryOutline',
            clear: () => this.clear(),
        });

        // Initial paint — covers project-load when a boundary already exists.
        this.refresh();
    }

    /**
     * Read the current parcel polygon from the SiteModelStore and rebuild the
     * outline. No-op (and clears any stale outline) when there is no boundary
     * or the polygon is degenerate (< 3 vertices).
     */
    refresh(): void {
        if (this.disposed) return;

        const store = this.runtime.siteModelStore;
        const boundary = store?.getParcelBoundary?.() ?? null;
        const polygon = (boundary?.polygon ?? []) as XZPoint[];

        // Guard — no boundary or degenerate ring ⇒ no outline.
        if (polygon.length < 3) {
            this.clear();
            return;
        }

        this.clear();
        this.group = this.buildOutline(polygon);
        this.scene.add(this.group);
    }

    /** Remove + dispose the current outline group (idempotent). */
    private clear(): void {
        const group = this.group;
        if (!group) return;
        // §L-676-B — DETACH FIRST, and drop the handle in `finally`. Detaching before
        // disposal means a throwing dispose can never leave a stale Project-A outline
        // in Project B's scene, and nulling in `finally` means a throw cannot leave
        // this renderer permanently convinced it still owns a group it no longer does.
        try {
            this.scene.remove(group);
            this.disposeGroup(group);
        } finally {
            this.group = null;
        }
    }

    /**
     * Build the overlay group: a closed violet LineLoop along the vertices plus
     * a faint translucent fill, both on EDITOR_LAYER + non-pickable.
     */
    private buildOutline(polygon: XZPoint[]): THREE.Group {
        const group = new THREE.Group();
        group.name = 'pryzm-parcel-boundary-outline';

        // ── Closed violet line ───────────────────────────────────────────────
        // §LINELOOP-WEBGPU-FIX (2026-06-03): THREE.LineLoop is NOT supported by the
        // WebGPU renderer — it spammed "Objects of type THREE.LineLoop are not
        // supported" errors EVERY frame (A.8.x regression). Use THREE.Line and close
        // the ring explicitly by repeating the first vertex at the end.
        const ringLen = polygon.length + 1;
        const positions = new Float32Array(ringLen * 3);
        for (let i = 0; i < polygon.length; i++) {
            const p = polygon[i]!;
            positions[i * 3 + 0] = p.x;
            positions[i * 3 + 1] = GROUND_Y_OFFSET;
            positions[i * 3 + 2] = p.z;
        }
        const first = polygon[0]!;
        positions[polygon.length * 3 + 0] = first.x;
        positions[polygon.length * 3 + 1] = GROUND_Y_OFFSET;
        positions[polygon.length * 3 + 2] = first.z;
        const lineGeo = new THREE.BufferGeometry();
        lineGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const lineMat = new THREE.LineBasicMaterial({
            color: PRYZM_VIOLET,
            transparent: true,
            opacity: 0.9,
            depthWrite: false,
        });
        const loop = new THREE.Line(lineGeo, lineMat);
        loop.name = 'pryzm-parcel-boundary-loop';
        // §PARCEL-OUTLINE-SHOW-IN-3D (L-425, founder 2026-07-18) — REVERSES the earlier
        // §PARCEL-OUTLINE-3D-HIDE. In the buildable-envelope (Pipeline B) flow the user
        // lands in the BIM canvas with the parcel outline + envelope as CADASTRAL DESIGN
        // REFERENCES they author within — so the founder explicitly wants the violet ring
        // visible in the PRYZM 3D + plan views ("we need the boundaries in the pryzm
        // views"), not just the site/GIS surface. So the LINE carries ONLY the semantic
        // `isParcelBoundaryLine` marker and NO `isParcelBoundaryFill` hide flag → it is
        // visible in every view. The faint translucent FILL slab keeps its own
        // `isParcelBoundaryFill` flag (buildFill) and stays hidden in pure-3D (it read as
        // a "grey shade beside the house", A.21.D44) — only the crisp outline shows in 3D.
        loop.userData.isParcelBoundaryLine = true;
        // §RESI-ORCH-HIGHLIGHT — WHAT THIS IS, not what it means. The renderer tags the geometry
        // it drew; `siteHighlightEmphasis` decides which tag is the subject of which number.
        loop.userData.siteHighlightRole = 'parcel-line' satisfies SiteHighlightRole;
        group.add(loop);

        // ── Faint translucent fill ───────────────────────────────────────────
        // Triangulate the ring via ShapeGeometry (the parcel polygon is simple).
        const fillMesh = this.buildFill(polygon);
        if (fillMesh) group.add(fillMesh);

        // ── §ENVELOPE-VIA-MASSING (L-402d) — buildable-envelope study volume ──
        // Render the C58 buildable envelope in the BIM 3D + plan scene as a
        // translucent extruded #6600FF volume, through the SAME three.js scene path
        // the walls/slabs use (an ExtrudeGeometry mesh in this same non-pickable
        // EDITOR_LAYER group). ONE geometry SOURCE — the cached `BuildableEnvelope`
        // from `siteDispatch` (getLastBuildableEnvelope) — is consumed by BOTH this
        // renderer AND the Cesium Forma Site (resolveFormaEnvelope), so the design
        // scene and the context view show the identical envelope. UNLIKE the parcel
        // ring/fill (hidden in the pure-3D BIM view), the envelope volume is site
        // intelligence the founder wants visible IN the design scene, so it carries
        // NO `isParcelBoundaryFill`/`isParcelBoundaryLine` hide flag.
        // §ENV3D164 — read the user's two axes ONCE and share the answer with the study-massing
        // builder below, so "reuse the existing Volume/Footprint toggles" is structural: whichever
        // solid ends up drawn (plan-backed or study), it is gated by the SAME `envelopeDrawMode`
        // this file already reads for the real envelope, never a second toggle.
        const drawMode = envelopeDrawMode(getBuildableEnvelopeAxes());
        const envelopeMesh = this.buildEnvelopeVolume(drawMode);
        if (envelopeMesh) {
            group.add(envelopeMesh);
        } else {
            // No plan-backed envelope to draw (no parcel, refused, or not yet resolved) — offer the
            // INDICATIVE study massing in its place, honouring the same two axes. §CONTEXT-DERIVED-
            // STUDY-ENVELOPE's own schema header: a study is only ever surfaced "where no normative
            // buildable envelope resolves at all", so the two are mutually exclusive by construction,
            // never drawn one inside the other.
            const studyGroup = this.buildContextStudyVolume(drawMode);
            if (studyGroup) group.add(studyGroup);
        }

        // EDITOR_LAYER + non-pickable for the whole group.
        group.traverse((obj) => {
            obj.layers.set(EDITOR_LAYER);
            // Belt-and-braces: even if a raycaster enables EDITOR_LAYER, these
            // objects never report an intersection.
            (obj as unknown as { raycast: () => void }).raycast = () => {};
            obj.renderOrder = 0;
        });

        // §RESI-ORCH-TARGET-AREA (STR §5) — the user's proposed ground-floor plate, drawn BEFORE
        // the emphasis pass so it inherits the layer/pick traverse above like every other overlay.
        const proposal = this.buildProposedPlate();
        if (proposal) {
            proposal.traverse((obj) => {
                obj.layers.set(EDITOR_LAYER);
                (obj as unknown as { raycast: () => void }).raycast = () => {};
            });
            group.add(proposal);
        }

        // ⭐ §RESI-ORCH-HIGHLIGHT (STR §3) — LAST, and deliberately AFTER the layer/pick traverse
        // above so any cue it adds inherits EDITOR_LAYER + non-pickability from the same single
        // place every other overlay in this group gets them, rather than from a second copy of
        // that rule which could drift.
        this.applyHighlightEmphasis(group, polygon);

        return group;
    }

    /**
     * §RESI-ORCH-TARGET-AREA (STR §5) — draw the plate the user asked for: *"I want ~120 m² on the
     * ground floor."* A FLAT footprint with a dashed teal rim, laid inside the permitted footprint
     * it was eroded from.
     *
     * ⛔ FLAT, NEVER EXTRUDED. The user asked for a ground-floor AREA and PRYZM has been told
     * nothing about a storey height. Extruding this to a "typical" 3 m would put a solid on the
     * ground carrying a dimension nobody supplied — the same class of invention the limit-plane cue
     * refuses (§ENVELOPE-SITE-DATA: never synthesise a missing value), and worse in three dimensions
     * because a reader can see that a NUMBER is a number and cannot see that a SOLID is a guess.
     *
     * ⛔ ROSE AND DASHED, i.e. the SKETCH vocabulary in the TO-BE-BUILT hue — never the plan-backed
     * violet. This plate is compliant-by-construction on ONE axis only (it is an erosion of the
     * permitted footprint, so its area cannot exceed it). PRYZM has checked it against nothing else
     * — no setback shaping, no frontage rule, no party wall. Drawing it in the determination hue
     * would claim all of that.
     *
     * ⭐ RE-HUED 2026-09-06 (§TOBE-ENVELOPE, STR §25.2). This drew in `STUDY_MASSING_TEAL`, which
     * was a correct choice against violet and a wrong one against ITSELF: teal is the
     * CONTEXT-DERIVED STUDY's colour (a median of neighbour heights, no user in it), and this plate
     * is the opposite — the user's own stated intent, with no context in it. Worse, one click of
     * "Keep this as a level envelope" turned the teal plate into a rose prism, so the same decision
     * changed colour at the moment it became durable. Both now read `toBeBuiltEnvelopeStyle.ts`, so
     * the founder's "ANOTHER COLOUR OF ENVELOPE" is one colour across the whole life of the thing.
     *
     * ⚠ AND IT IS NO LONGER NEAR-INVISIBLE. The fill was `STUDY_GROUND_SHADE_FILL_ALPHA` (0.12), a
     * weight chosen for a volume PRYZM is UNSURE about. PRYZM is not unsure what the user asked for
     * — §24.1 item 3: *"the honesty must survive, the invisibility must not."*
     *
     * ⚠ IT CAN NEVER COLLIDE WITH THE CONTEXT-STUDY MASSING, by construction rather than by luck:
     * a study massing is only ever surfaced where NO normative envelope resolves, and this plate
     * only exists where one DID (the card offers the control only on the full-determination arm).
     *
     * Returns null when nothing is proposed or the proposal has gone stale. Never throws.
     */
    private buildProposedPlate(): THREE.Object3D | null {
        try {
            const env = getLastBuildableEnvelope();
            const permittedRing = (env?.insetPolygon ?? []) as XZPoint[];
            const permittedAreaM2 = env
                ? (env.insetAreaM2 || ringAreaM2XZ(permittedRing))
                : null;
            const live = resolveLiveTargetFootprintProposal(permittedAreaM2);
            if (live === null) return null;
            const ring = live.ring as ReadonlyArray<XZPoint>;
            if (ring.length < 3) return null;

            const group = new THREE.Group();
            group.name = 'pryzm-target-footprint-proposal';
            // Lift above the parcel fill AND above the ground-level highlight cues, so the plate a
            // user just asked for is never hidden under the surfaces it was derived from.
            const y = HIGHLIGHT_CUE_Y + GROUND_Y_OFFSET;

            try {
                const shape = new THREE.Shape();
                shape.moveTo(ring[0]!.x, -ring[0]!.z);
                for (let i = 1; i < ring.length; i++) shape.lineTo(ring[i]!.x, -ring[i]!.z);
                shape.closePath();
                const geo = new THREE.ShapeGeometry(shape);
                // The ONE (x, −z) → XZ convention in this file (§PARCEL-SHADE-NOT-MIRRORED).
                geo.rotateX(-Math.PI / 2);
                geo.translate(0, y, 0);
                const mesh = new THREE.Mesh(
                    geo,
                    new THREE.MeshBasicMaterial({
                        color: TO_BE_BUILT_ROSE,
                        transparent: true,
                        opacity: TO_BE_BUILT_GROUND_FILL_ALPHA,
                        depthWrite: false,
                        side: THREE.DoubleSide,
                    }),
                );
                mesh.name = 'pryzm-target-footprint-proposal-fill';
                mesh.userData.siteHighlightRole = 'proposal' satisfies SiteHighlightRole;
                mesh.userData.isTargetFootprintProposal = true;
                // The numbers a screenshot test / a11y layer can assert without re-deriving them.
                mesh.userData.targetFootprintAchievedM2 = live.achievedAreaM2;
                mesh.userData.targetFootprintTargetM2 = live.targetAreaM2;
                mesh.userData.targetFootprintInsetM = live.insetM;
                group.add(mesh);
            } catch (err) {
                console.warn('[ParcelBoundarySceneRenderer] proposed-plate triangulation failed:', err);
            }

            const rim = this.buildDashedRim(ring, y, TO_BE_BUILT_ROSE);
            if (rim) {
                rim.name = 'pryzm-target-footprint-proposal-rim';
                rim.userData.siteHighlightRole = 'proposal' satisfies SiteHighlightRole;
                group.add(rim);
            }
            if (group.children.length === 0) return null;
            group.userData.isTargetFootprintProposal = true;
            return group;
        } catch (err) {
            console.warn('[ParcelBoundarySceneRenderer] §RESI-ORCH-TARGET-AREA plate build failed:', err);
            return null;
        }
    }

    /**
     * §RESI-ORCH-HIGHLIGHT (STR §3) — "the user must ALWAYS understand: what does this number
     * mean PHYSICALLY?". A row on the envelope card was clicked; this makes the geometry it names
     * legible, and everything else recede.
     *
     * ⛔ ONE DIRECTION ONLY. Non-subjects have their AUTHORED opacity multiplied DOWN; the subject
     * is never brightened and its hue is never changed. The envelope's hue and fill alpha ARE its
     * honesty signal (`envelopeRenderStyle.ts`: confident violet · provisional grey · suggested
     * amber · study teal; near-wireframe for an upper bound). Boosting a provisional solid to
     * "highlight" it would make an estimate read as a determination — the §L-616 overstatement,
     * re-introduced by an affordance. Contrast carries the emphasis instead, so no solid ever
     * renders stronger than it has earned.
     *
     * ⚠ SAFE TO MUTATE MATERIALS IN PLACE: every material under this group is constructed fresh by
     * this same `buildOutline` pass (nothing here is a shared or cached material), and a highlight
     * change re-drives `refresh()`, which disposes and rebuilds the group. A receded alpha can
     * therefore never accumulate across clicks.
     *
     * Never throws — a highlight is a reading aid, and the outline must survive its failure.
     */
    private applyHighlightEmphasis(group: THREE.Group, polygon: XZPoint[]): void {
        const subject = getSiteHighlight();
        // The resting state. Every surface renders exactly as authored — this method is a no-op,
        // which is what makes "clear the highlight" fully reversible.
        if (subject === null) return;
        try {
            const cue = this.buildHighlightCue(subject, polygon);
            if (cue) {
                cue.traverse((obj) => {
                    obj.layers.set(EDITOR_LAYER);
                    (obj as unknown as { raycast: () => void }).raycast = () => {};
                });
                group.add(cue);
            }
            group.traverse((obj) => {
                const role = obj.userData?.siteHighlightRole as SiteHighlightRole | undefined;
                if (!role) return;
                if (siteHighlightEmphasis(subject, role) === 'subject') {
                    // Draw the subject after the receded surfaces so a translucent volume cannot
                    // wash it out. NOT a strengthening of the claim: render order changes nothing
                    // about hue or alpha.
                    obj.renderOrder = 1;
                    return;
                }
                const mat = (obj as THREE.Mesh).material as
                    | THREE.Material
                    | THREE.Material[]
                    | undefined;
                if (!mat) return;
                for (const m of Array.isArray(mat) ? mat : [mat]) {
                    const tm = m as THREE.Material & { opacity?: number };
                    if (typeof tm.opacity !== 'number') continue;
                    tm.transparent = true;
                    tm.opacity = tm.opacity * SITE_HIGHLIGHT_RECEDE_FACTOR;
                    tm.needsUpdate = true;
                }
            });
        } catch (err) {
            console.warn('[ParcelBoundarySceneRenderer] §RESI-ORCH-HIGHLIGHT emphasis failed (non-fatal):', err);
        }
    }

    /**
     * §RESI-ORCH-HIGHLIGHT — build the geometry a subject needs before it can be pointed at, or
     * null when the subject is already on screen (Area / Perimeter / GFA) and emphasis alone
     * answers it. WHICH cue a subject needs is decided by `siteHighlightCue`, never here.
     *
     * ⛔ RETURNING null IS AN HONEST ANSWER AND MUST STAY ONE. A cue builder that cannot find its
     * geometry draws NOTHING — it never falls back to lighting the parcel instead. Pointing at the
     * wrong geometry is worse than pointing at none, because the reader cannot tell the difference.
     * (The card has already refused to make such a row clickable —
     * `describeSiteHighlightAvailability` — so reaching a null here means the store moved between
     * render and draw, not that a user clicked something dead.)
     */
    private buildHighlightCue(
        subject: SiteHighlightSubject,
        polygon: XZPoint[],
    ): THREE.Object3D | null {
        switch (siteHighlightCue(subject)) {
            case 'front-edges': return this.buildFrontEdgesCue(polygon);
            case 'inset-ring': return this.buildInsetRingCue();
            case 'limit-plane': return this.buildLimitPlaneCue();
            case null: return null;
        }
    }

    /**
     * "Street frontage → the relevant edges." The classified front edges of the committed ring,
     * drawn as a heavier violet overlay on top of the (now receded) boundary, so they read as a
     * SUBSET of the ring rather than as a second, unrelated outline.
     *
     * ⛔ THE THREE-ARM DETERMINATION IS NOT RE-DERIVED HERE. `determineParcelEdgeClassifications`
     * is asked, with the polygon length, so "nobody classified these edges" (undetermined) and
     * "classified, none faces a street" (determined, zero front labels) both yield null — and they
     * yield it for DIFFERENT reasons the card has already printed in words. A `?? []` here would
     * silently assert the landlocked finding about an unmeasured plot.
     */
    private buildFrontEdgesCue(polygon: XZPoint[]): THREE.Object3D | null {
        const boundary = this.runtime.siteModelStore?.getParcelBoundary?.() ?? null;
        const determination = determineParcelEdgeClassifications(
            boundary?.edgeClassifications,
            'parcel edge classifications',
            polygon.length,
        );
        if (determination.kind !== 'determined') return null;
        const labels = determination.elements;
        const coords: number[] = [];
        for (let i = 0; i < polygon.length; i++) {
            if (labels[i] !== FRONT_EDGE) continue;
            const a = polygon[i]!;
            const b = polygon[(i + 1) % polygon.length]!;
            coords.push(a.x, HIGHLIGHT_CUE_Y, a.z, b.x, HIGHLIGHT_CUE_Y, b.z);
        }
        // Determined AND zero front edges — a real finding about a landlocked plot, already stated
        // on the card. Nothing to draw, and nothing invented.
        if (coords.length === 0) return null;
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(coords), 3));
        // §LINELOOP-WEBGPU-FIX applies to LineLOOP only; LineSegments is a plain line-list and is
        // supported by both backends. Each front edge is its own vertex pair, so a ring with two
        // non-adjacent frontages draws two separate segments, never a false connecting edge.
        const line = new THREE.LineSegments(
            geo,
            new THREE.LineBasicMaterial({
                color: PRYZM_VIOLET,
                transparent: true,
                opacity: 0.95,
                depthWrite: false,
            }),
        );
        line.name = 'pryzm-site-highlight-front-edges';
        line.userData.siteHighlightRole = 'cue' satisfies SiteHighlightRole;
        line.userData.siteHighlightSubject = 'frontage';
        line.userData.siteHighlightFrontEdgeCount = coords.length / 6;
        return line;
    }

    /**
     * "Max footprint → the buildable envelope." The inset ring at ground — the polygon the card's
     * footprint area is literally measured inside, which is otherwise only ever seen as the hidden
     * BASE of a solid.
     *
     * ⚠ ONE RING, THE PRINCIPAL TIER'S. `insetPolygon` is exactly what `permittedStudyFigures`
     * (the card's single producer of the footprint number) measures, so the outline and the number
     * cannot disagree. A tiered envelope's upper tiers are NOT drawn here: they are not what that
     * number describes, and adding them would make the footprint row point at more than it claims.
     */
    private buildInsetRingCue(): THREE.Object3D | null {
        const env = getLastBuildableEnvelope();
        const ring = (env?.insetPolygon ?? []) as XZPoint[];
        // Empty whenever the envelope is not `ok` (see BuildableEnvelopeSchema) — a refusal has no
        // buildable ring, and this is where that stays true in geometry.
        if (ring.length < 3) return null;
        return this.buildClosedCueLine(ring, HIGHLIGHT_CUE_Y, 'pryzm-site-highlight-inset-ring');
    }

    /**
     * "Max height → the vertical limit." A translucent plane at the derived maximum height over
     * the buildable footprint, with its own rim — the construction that turns a NUMBER into
     * something physical, which is the whole of STR §3's ask for this row.
     *
     * ⛔ DRAWN ONLY FROM A DERIVED HEIGHT. There is no `storeys × 3 m` fallback and there must not
     * be one: a plane at an invented height is visually identical to one at a published limit, and
     * a reader can at least see that a NUMBER is a number — they cannot see that a SOLID is a guess.
     */
    private buildLimitPlaneCue(): THREE.Object3D | null {
        const env = getLastBuildableEnvelope();
        if (!env) return null;
        const ring = (env.insetPolygon ?? []) as XZPoint[];
        const height = env.maxHeight_m;
        if (ring.length < 3 || height === null || !(height > 0)) return null;
        const y = height + GROUND_Y_OFFSET;
        const group = new THREE.Group();
        group.name = 'pryzm-site-highlight-limit-plane';
        try {
            const shape = new THREE.Shape();
            // The ONE (x, −z) → XZ convention used by `buildFill` / `buildEnvelopeVolume` /
            // `buildContextStudyVolume` in this file. Keep them identical — the sign disagreement
            // between two such builders WAS the §PARCEL-SHADE-NOT-MIRRORED defect (L-10740).
            shape.moveTo(ring[0]!.x, -ring[0]!.z);
            for (let i = 1; i < ring.length; i++) shape.lineTo(ring[i]!.x, -ring[i]!.z);
            shape.closePath();
            const geo = new THREE.ShapeGeometry(shape);
            geo.rotateX(-Math.PI / 2);
            geo.translate(0, y, 0);
            const mesh = new THREE.Mesh(
                geo,
                new THREE.MeshBasicMaterial({
                    color: PRYZM_VIOLET,
                    transparent: true,
                    // Faint on purpose: this is a LIMIT — a ceiling nothing may pass through — not
                    // a buildable volume. A dense plate would read as a roof slab.
                    opacity: 0.14,
                    depthWrite: false,
                    side: THREE.DoubleSide,
                }),
            );
            mesh.name = 'pryzm-site-highlight-limit-plane-fill';
            mesh.userData.siteHighlightRole = 'cue' satisfies SiteHighlightRole;
            mesh.userData.siteHighlightLimitHeightM = height;
            group.add(mesh);
        } catch (err) {
            console.warn('[ParcelBoundarySceneRenderer] limit-plane triangulation failed:', err);
        }
        // The rim goes on even when the fill failed to triangulate: a ring at the limit height is
        // still a truthful, legible answer to "how high is that?".
        const rim = this.buildClosedCueLine(ring, y, 'pryzm-site-highlight-limit-plane-rim');
        if (rim) group.add(rim);
        if (group.children.length === 0) return null;
        group.userData.siteHighlightRole = 'cue' satisfies SiteHighlightRole;
        return group;
    }

    /**
     * A closed violet cue line along `ring` at height `y`. §LINELOOP-WEBGPU-FIX — a `THREE.Line`
     * with the first vertex repeated, never a `LineLoop` (unsupported by the WebGPU backend; it
     * spammed a per-frame error the last time this file used one).
     */
    private buildClosedCueLine(
        ring: ReadonlyArray<XZPoint>,
        y: number,
        name: string,
    ): THREE.Line | null {
        try {
            if (ring.length < 3) return null;
            const positions = new Float32Array((ring.length + 1) * 3);
            for (let i = 0; i < ring.length; i++) {
                const p = ring[i]!;
                positions[i * 3 + 0] = p.x;
                positions[i * 3 + 1] = y;
                positions[i * 3 + 2] = p.z;
            }
            const first = ring[0]!;
            positions[ring.length * 3 + 0] = first.x;
            positions[ring.length * 3 + 1] = y;
            positions[ring.length * 3 + 2] = first.z;
            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            const line = new THREE.Line(
                geo,
                new THREE.LineBasicMaterial({
                    color: PRYZM_VIOLET,
                    transparent: true,
                    opacity: 0.95,
                    depthWrite: false,
                }),
            );
            line.name = name;
            line.userData.siteHighlightRole = 'cue' satisfies SiteHighlightRole;
            return line;
        } catch (err) {
            console.warn('[ParcelBoundarySceneRenderer] cue line build failed:', err);
            return null;
        }
    }

    /**
     * Faint flat fill so the lot reads as a footprint. Uses a Shape triangulated
     * by THREE.ShapeGeometry (handles convex + simple-concave parcels) laid flat
     * on the XZ plane at the ground offset. Returns null if triangulation fails.
     */
    private buildFill(polygon: XZPoint[]): THREE.Mesh | null {
        try {
            const shape = new THREE.Shape();
            // Build the 2D shape in (x, -z): ShapeGeometry lives in XY, we rotate
            // it onto XZ below, mapping shape-Y → scene-(-Z) so winding is kept.
            shape.moveTo(polygon[0]!.x, -polygon[0]!.z);
            for (let i = 1; i < polygon.length; i++) {
                shape.lineTo(polygon[i]!.x, -polygon[i]!.z);
            }
            shape.closePath();

            const geo = new THREE.ShapeGeometry(shape);
            // §PARCEL-SHADE-NOT-MIRRORED (L-10740) — ⛔ THE SIGN HERE WAS `+Math.PI / 2`, AND THAT
            // WAS THE FOUNDER'S MIRROR. The comment above it already described the CORRECT
            // behaviour ("the shape's +Y maps to scene -Z"); the call did the opposite.
            // `Matrix4.makeRotationX(θ)` is [[1,0,0],[0,cos,−sin],[0,sin,cos]], so at θ = +π/2 a
            // shape point (u, v, 0) lands at (u, 0, **+v**) — and this shape is built at
            // v = −p.z, so every vertex landed at scene z = −p.z: the fill REFLECTED about the
            // scene X axis relative to the outline it exists to fill. Because the frame origin is
            // the parcel's FIRST VERTEX (`parcelFrameOrigin`), that mirror line runs through a
            // CORNER of the plot, so the reflected copy lands wholly on the far side of it —
            // exactly the founder's "it sort of MIRRORS to one side outwards".
            //
            // ⚠ WHY IT SURVIVED SO LONG: `side: THREE.DoubleSide` hides the flipped normals, and
            // an axis-aligned rectangle is its OWN mirror — so every symmetric test plot passed.
            // Only a CHIRAL parcel can falsify this, which is what the L-shaped fixture in
            // `apps/editor/__tests__/parcelShadeIsNotMirrored.test.ts` exists to be.
            //
            // ⭐ `buildEnvelopeVolume` below has ALWAYS used `-Math.PI / 2` and spells the algebra
            // out correctly. The two builders sat 100 lines apart in this file with identical
            // shape construction and OPPOSITE rotation signs; that disagreement IS the defect the
            // founder photographed. Keep them identical.
            geo.rotateX(-Math.PI / 2);
            geo.translate(0, GROUND_Y_OFFSET, 0);

            const mat = new THREE.MeshBasicMaterial({
                color: PRYZM_VIOLET,
                transparent: true,
                opacity: 0.06,
                depthWrite: false,
                side: THREE.DoubleSide,
            });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.name = 'pryzm-parcel-boundary-fill';
            // A.21.D44: tag the flat parcel FILL so the 3-D model-view gate in
            // initScene (`_applyParcelFillVisibilityForView`) can hide it. The fill
            // is a large flat XZ plane spanning the whole drawn lot — in the pure 3-D
            // BIM model view it floats beside/below the generated house (the parcel
            // extends past the footprint and is usually offset/angled vs the building)
            // and reads as a light-grey slab over the white viewport. It is SITE
            // context, valid in the site / GIS / plan views, so we gate (not delete)
            // it: hidden in '3D', shown everywhere else. §PARCEL-OUTLINE-3D-HIDE — the
            // violet boundary LINE now carries the SAME flag (see buildOutline), so both
            // the ring and the fill are hidden in the pure-3D BIM view and kept only in
            // the site / plan views (founder: the ring floated under the tower as a
            // confusing stray circle).
            mesh.userData.isParcelBoundaryFill = true;
            mesh.userData.siteHighlightRole = 'parcel-fill' satisfies SiteHighlightRole;
            return mesh;
        } catch (e) {
            console.warn('[ParcelBoundarySceneRenderer] fill triangulation failed:', e);
            return null;
        }
    }

    /**
     * §ENVELOPE-VIA-MASSING (L-402d) → C58 §1.14 / STRUCTURAL-SEAM-1 (lane E2a, 2026-09-01) —
     * build the buildable-envelope volume by RASTERISING THE SEAM, exactly as the Cesium globe
     * does. This method used to be the LAST unadopted 4-field projection: it read
     * `insetPolygon` / `maxHeight_m` / `confidence` / `footprintIsUpperBound` off the cached
     * envelope and re-derived ONE prism (`ring × maxHeight`, or a 9 m FALLBACK height), which
     * meant this surface — alone — still discarded `tiers[]` (a multi-tier envelope drew as one
     * full-ring prism at the principal height: over-statement, C58 §1.7b.4), discarded
     * `farLimitedHeight_m` (a FAR-capped zone drew the full height shell as the solid:
     * over-statement, §L-616) and invented a height where none was published (§1.12.6).
     *
     * NOW: the pure L2 `envelopeToMassing` is the single place massing geometry is derived —
     * the ENGINE emits the solids, this method only extrudes each `[baseHeightM, topHeightM]`
     * through the same shape/rotate algebra the parcel fill uses, and reads `style` for
     * hue/fill/open-top. It holds NO per-field knowledge of the envelope. The ground-shade
     * axis routes through the same seam (`envelopeGroundShade` — a projection of solids that
     * already exist, so hiding the volume can never mint a new claim, §ENVELOPE-TWO-AXES).
     *
     * Returns null when there is nothing to draw (no `ok` envelope, refused, degenerate ring,
     * both axes off), or on any triangulation failure — never throws.
     *
     * Geometry alignment: each solid's ring is in the SAME scene-XZ frame as the parcel polygon
     * + generated walls. We build the 2D shape in (x, −z) and rotate it flat onto the XZ ground
     * plane extruding UP (+Y) so scene coords land at (p.x, y, p.z) — aligned with the parcel
     * line + walls (see `buildFill`; the algebra is byte-identical to the pre-seam method).
     *
     * @param drawMode §ENV3D164 — read ONCE by the caller (`buildOutline`) and passed in, so
     *        the plan-backed volume and the study-massing volume below can never disagree about
     *        what the user's two toggles mean (previously this method read the authority itself).
     */
    private buildEnvelopeVolume(drawMode: EnvelopeDrawMode): THREE.Object3D | null {
        try {
            // ⭐ §ENVELOPE-ONE-VISIBILITY (L-1170) — ask the ONE authority, first, before any
            // geometry exists. Returning null here is what makes the user's "hide" reach the
            // BIM/plan scene at all; `refresh()` is re-driven by the subscription in the
            // constructor, so this is re-evaluated the moment the answer changes.
            if (drawMode === 'none') return null;
            const env = getLastBuildableEnvelope();
            if (!env) return null;

            // C58 §1.14 — the WHOLE envelope goes through the ONE pure function. Every honesty
            // decision — how many solids, each ring/base/top, hue, fill, upper-bound study
            // weight, FAR shell-vs-solid split, tiers, flat no-height slab, open-top posture —
            // is made in L2 and arrives as `MassingSolid[]`. A refused / degenerate envelope
            // yields `[]` (§1.13.3), which is the `null` the study-massing fallback keys on.
            // §NEARBY-HEIGHT-SUGGESTION — the admin-only, not-yet-reviewed auto-preview flag
            // rides the input, exactly as `resolveFormaEnvelope` forwards it to the globe.
            const volumeSolids = envelopeToMassing({
                ...env,
                suggestedPreview: isLastEnvelopeSuggestedPreview(),
            });
            // §ENVELOPE-TWO-AXES — "Volume: OFF, Footprint: ON" projects the SAME solids onto
            // the ground through the seam's own rule, never a locally re-derived slab.
            const groundShade = drawMode === 'ground-shade';
            const solids = groundShade ? envelopeGroundShade(volumeSolids) : volumeSolids;
            if (solids.length === 0) return null;

            const group = new THREE.Group();
            group.name = groundShade
                ? 'pryzm-buildable-envelope-ground-shade'
                : 'pryzm-buildable-envelope-volume';
            for (const solid of solids) {
                const mesh = this.rasteriseMassingSolid(solid);
                if (mesh) group.add(mesh);
            }
            if (group.children.length === 0) return null;

            const lead = solids[0]!;
            // §ENVELOPE-TWO-AXES — which of the two representations this group IS, readable by a
            // screenshot test / a11y layer without re-deriving it from the height.
            group.userData.envelopeGroundShade = groundShade;
            group.userData.envelopeConfidenceComplete = lead.style.complete;
            // §OPEN-TOP-INDICATIVE — the posture on the group, so a screenshot test / a11y layer
            // can assert "this volume claims no buildable right" without re-deriving it.
            group.userData.envelopeOpenTop = lead.style.openTop;
            // Distinct flag (NOT the parcel hide flags) — visible in the BIM 3D + plan
            // design scene; a future view gate can target this without touching the parcel.
            group.userData.isBuildableEnvelopeVolume = true;
            return group;
        } catch (e) {
            console.warn('[ParcelBoundarySceneRenderer] envelope volume build failed:', e);
            return null;
        }
    }

    /**
     * C58 §1.14 — extrude ONE `MassingSolid` exactly as the seam instructs: `[baseHeightM,
     * topHeightM]` on the solid's own ring, `style.fillAlpha` for the fill, `style.hue` mapped
     * to the SAME three colour constants the flat card uses (`envelopeRenderStyle.ts` — one hue
     * vocabulary), and `style.openTop` drawn as a literally uncapped shell (the ADR-0293
     * disclosure channel that survives a greyscale screenshot). NO envelope knowledge here —
     * a dumb rasteriser, the render-side dual of the engine's §466–507 refinement.
     */
    private rasteriseMassingSolid(solid: MassingSolid): THREE.Mesh | null {
        try {
            const ring = solid.ring;
            if (!Array.isArray(ring) || ring.length < 3) return null;
            const height = solid.topHeightM - solid.baseHeightM;
            if (!(height > 0)) return null;

            const shape = new THREE.Shape();
            shape.moveTo(ring[0]!.x, -ring[0]!.z);
            for (let i = 1; i < ring.length; i++) {
                shape.lineTo(ring[i]!.x, -ring[i]!.z);
            }
            shape.closePath();

            const geo = new THREE.ExtrudeGeometry(shape, {
                depth: height,
                bevelEnabled: false,
                steps: 1,
            });
            // Lay the extruded shape (XY plane, extruded along +Z) flat onto XZ with the
            // extrusion pointing UP: rotateX(−90°) maps a local (sx, sy, sz) → (sx, sz, −sy),
            // so with the shape built in (x, −z) the scene point is (x, sz∈[0,h], z) — the
            // ring aligns in X/Z and the volume rises from `baseHeightM` to `topHeightM`.
            geo.rotateX(-Math.PI / 2);
            geo.translate(0, solid.baseHeightM + GROUND_Y_OFFSET, 0);

            // The SINGLE colour authority — the same three constants the flat card + globe use.
            const colorHex =
                solid.style.hue === 'confident'
                    ? CONFIDENT_VIOLET_HEX
                    : solid.style.hue === 'suggested-preview'
                      ? SUGGESTED_AMBER_HEX
                      : PROVISIONAL_GREY_HEX;
            const mat = new THREE.MeshBasicMaterial({
                color: colorHex,
                transparent: true,
                // §1.14 — the fill weight is the SEAM's decision (`SOLID_FILL_ALPHA`,
                // `UPPER_BOUND_FILL_ALPHA`, `SHELL_FILL_ALPHA`, `GROUND_SHADE_FILL_ALPHA` — one
                // knob set), never a per-surface literal that can drift from the globe's.
                opacity: solid.style.fillAlpha,
                depthWrite: false,
                side: THREE.DoubleSide,
            });
            // §OPEN-TOP-INDICATIVE (ADR-0293) — ⭐ DRAW IT WITHOUT ITS LIDS. `ExtrudeGeometry`
            // emits two groups: materialIndex 0 = the caps (lids), 1 = the side walls. A material
            // array whose CAP slot is fully transparent leaves an open shell — the literal open
            // top the ADR requires. Guarded on the group count rather than assumed: if a future
            // THREE emits a single group we fall back to the closed prism, which is merely the
            // pre-existing look, never a wrong claim — the provisional hue still carries the
            // disclosure. (A flat ground shade never sets `openTop` on its geometry — the seam's
            // `envelopeGroundShade` carries the flag but the 0.12 m slab keeps its only visible
            // face; see §OPEN-TOP-INDICATIVE × §ENVELOPE-TWO-AXES in `envelopeToMassing.ts`.)
            const wantsOpenTop = solid.style.openTop && solid.role !== 'footprint-slab';
            const capMat = wantsOpenTop
                ? new THREE.MeshBasicMaterial({
                      color: colorHex,
                      transparent: true,
                      opacity: 0,
                      depthWrite: false,
                      side: THREE.DoubleSide,
                  })
                : null;
            const useOpenTop = capMat !== null && geo.groups.length >= 2;
            const mesh = new THREE.Mesh(geo, useOpenTop ? [capMat!, mat] : mat);
            if (capMat !== null && !useOpenTop) capMat.dispose();
            // The seam's stable solid id → the mesh name, exactly as the Cesium rasteriser names
            // its entities, so a name-based consumer reads ONE vocabulary across both surfaces.
            mesh.name = solid.id;
            mesh.userData.isBuildableEnvelopeVolume = true;
            mesh.userData.siteHighlightRole = 'envelope-volume' satisfies SiteHighlightRole;
            mesh.userData.massingSolidRole = solid.role;
            mesh.userData.envelopeGroundShade = solid.id === 'pryzm-forma-envelope-ground-shade';
            mesh.userData.envelopeConfidenceComplete = solid.style.complete;
            mesh.userData.envelopeOpenTop = solid.style.openTop;
            mesh.userData.envelopeOpenTopExpressed = useOpenTop;
            return mesh;
        } catch (e) {
            console.warn('[ParcelBoundarySceneRenderer] massing solid rasterise failed:', e);
            return null;
        }
    }

    /**
     * §ENV3D164 (L-12700) — build the STUDY MASSING volume: a context-derived (median of real
     * neighbour heights) or user-typed (§MANUALENV159, "24.5 m") `ContextDerivedStudyEnvelope`,
     * rendered through the SAME three.js scene path as the plan-backed envelope above — an
     * `ExtrudeGeometry` mesh in this same non-pickable `EDITOR_LAYER` group (C84 EI-9: one
     * renderer, two input sources, not a second volume renderer built alongside this one).
     *
     * Returns null when there is no study for the current site (nothing computed, a typed refusal,
     * both toggles off, or no active site) — never throws.
     *
     * ⛔ NON-NEGOTIABLE (see the STUDY MASSING constants above this class): the returned group must
     * never be visually confusable with `buildEnvelopeVolume`'s plan-backed solid. Three channels
     * differ — hue (teal, not violet/grey/amber), silhouette (always open-top), outline (dashed,
     * not solid) — so no single screenshot or colour-blind viewer can mistake an indicative study
     * for a determination.
     *
     * @param drawMode the SAME axes-derived mode `buildEnvelopeVolume` used (shared by the caller),
     *        so "Volume: ON/OFF" and "Footprint: ON/OFF" govern the study exactly as they govern a
     *        real envelope — no third, study-only control (the founder's own instruction).
     */
    private buildContextStudyVolume(drawMode: EnvelopeDrawMode): THREE.Group | null {
        try {
            if (drawMode === 'none') return null;
            const site = this.runtime.siteModelStore?.getSite?.() ?? null;
            if (!site) return null;
            const result = getContextDerivedStudyEnvelope(site.id);
            // Absent (nothing computed yet) or a typed refusal (too few real neighbours / a
            // degenerate setback) — either way there is no solid to draw. The refusal itself is
            // already surfaced in words by `buildContextStudySectionHtml` on the card; this
            // renderer draws geometry only, never a placeholder for a refusal.
            if (!result || !result.ok) return null;
            const study = result.study;
            const ring = study.footprintPolygon;
            if (!Array.isArray(ring) || ring.length < 3) return null;

            const groundShade = drawMode === 'ground-shade';
            const height = groundShade ? GROUND_SHADE_HEIGHT_M : study.maxHeight_m;

            const shape = new THREE.Shape();
            shape.moveTo(ring[0]!.x, -ring[0]!.z);
            for (let i = 1; i < ring.length; i++) {
                shape.lineTo(ring[i]!.x, -ring[i]!.z);
            }
            shape.closePath();

            // Same (x, −z) → XZ-ground construction as `buildEnvelopeVolume` / `buildFill` above —
            // ONE convention in this file, so the study aligns with the parcel + walls exactly like
            // every other overlay here.
            const geo = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false, steps: 1 });
            geo.rotateX(-Math.PI / 2);
            geo.translate(0, GROUND_Y_OFFSET, 0);

            const sideMat = new THREE.MeshBasicMaterial({
                color: STUDY_MASSING_TEAL,
                transparent: true,
                opacity: groundShade ? STUDY_GROUND_SHADE_FILL_ALPHA : STUDY_MASSING_FILL_ALPHA,
                depthWrite: false,
                side: THREE.DoubleSide,
            });
            // ⭐ ALWAYS open-top when a volume is drawn (never for the flat ground shade — a
            // 0.12 m slab has no top to leave open, exactly `buildEnvelopeVolume`'s own reasoning).
            // A study massing NEVER claims a buildable ceiling, so unlike the plan-backed envelope
            // (open-top only under the `open-top-indicative` posture) this is unconditional.
            const capMat = !groundShade
                ? new THREE.MeshBasicMaterial({
                      color: STUDY_MASSING_TEAL,
                      transparent: true,
                      opacity: 0,
                      depthWrite: false,
                      side: THREE.DoubleSide,
                  })
                : null;
            const useOpenTop = capMat !== null && geo.groups.length >= 2;
            const mesh = new THREE.Mesh(geo, useOpenTop ? [capMat!, sideMat] : sideMat);
            if (capMat !== null && !useOpenTop) capMat.dispose();
            mesh.name = groundShade
                ? 'pryzm-context-study-massing-ground-shade'
                : 'pryzm-context-study-massing-volume';
            mesh.userData.isContextStudyMassingVolume = true;
            mesh.userData.siteHighlightRole = 'study-volume' satisfies SiteHighlightRole;
            mesh.userData.contextStudyHeightBasisMethod = study.heightBasis.method;
            mesh.userData.contextStudyGroundShade = groundShade;
            mesh.userData.contextStudyOpenTopExpressed = useOpenTop;

            const group = new THREE.Group();
            group.name = 'pryzm-context-study-massing';
            group.add(mesh);

            // ── Dashed rim — the outline channel of the three-channel distinction. ───────────────
            // Traced along the SAME ring at the TOP of whatever we just built (`height` is already
            // the volume's top, or the ground shade's own thin top), so it reads as this solid's
            // edge, not the parcel's.
            const rim = this.buildDashedRim(ring, height);
            if (rim) group.add(rim);

            return group;
        } catch (e) {
            console.warn('[ParcelBoundarySceneRenderer] context-study massing build failed:', e);
            return null;
        }
    }

    /**
     * §ENV3D164 — a closed DASHED line loop along `ring` at height `y` above the ground datum.
     * `THREE.LineDashedMaterial` requires `computeLineDistances()` before it can dash correctly
     * (already the vetted pattern in this codebase — see `WallAlignmentGuide.ts`). Returns null on
     * any failure; the fill mesh alone is still a valid (if less legible) study indicator.
     *
     * ⚠ §TOBE-ENVELOPE (2026-09-06) — `colour` IS A PARAMETER, DEFAULTED TO THE STUDY TEAL. Two
     * different things use this rim: the CONTEXT-DERIVED STUDY (teal) and the user's TO-BE-BUILT
     * plate (rose). Until this parameter existed the second one drew a rose fill inside a teal
     * outline, so the plate carried the study's colour on the one channel that survives a
     * washed-out screenshot — the exact confusion the dashed rim exists to prevent. DASHED stays
     * unconditional: both are sketches, and that is what dashed means here.
     */
    private buildDashedRim(
        ring: ReadonlyArray<XZPoint>,
        y: number,
        colour: number = STUDY_MASSING_TEAL,
    ): THREE.Line | null {
        try {
            const ringLen = ring.length + 1;
            const positions = new Float32Array(ringLen * 3);
            for (let i = 0; i < ring.length; i++) {
                const p = ring[i]!;
                positions[i * 3 + 0] = p.x;
                positions[i * 3 + 1] = y;
                positions[i * 3 + 2] = p.z;
            }
            const first = ring[0]!;
            positions[ring.length * 3 + 0] = first.x;
            positions[ring.length * 3 + 1] = y;
            positions[ring.length * 3 + 2] = first.z;
            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            const mat = new THREE.LineDashedMaterial({
                color: colour,
                transparent: true,
                opacity: 0.85,
                dashSize: STUDY_DASH_SIZE_M,
                gapSize: STUDY_DASH_GAP_M,
                depthWrite: false,
            });
            const line = new THREE.Line(geo, mat);
            line.computeLineDistances();
            line.name = 'pryzm-context-study-massing-rim';
            line.userData.siteHighlightRole = 'study-volume' satisfies SiteHighlightRole;
            return line;
        } catch (e) {
            console.warn('[ParcelBoundarySceneRenderer] context-study dashed rim build failed:', e);
            return null;
        }
    }

    /**
     * Dispose every geometry + material under a group.
     *
     * §I2 / §L-676-B — MUST go through `safeDisposeObject3D`, never a raw
     * `traverse(… material.dispose())`. This method is reached from a
     * `SiteModelStore.subscribe` listener (`refresh()` → `clear()`), which is the
     * FIRST thing the C13 GIS/site teardown triggers (`site.model` scope →
     * `siteModelStore.reset()`). On the WebGPU backend a raw `material.dispose()`
     * throws `Cannot read properties of undefined (reading 'usedTimes')` out of
     * THREE's `Nodes.delete()` when the node-builder cache has no entry for the
     * material — and that throw escaped this listener, was caught+logged by the
     * store as `[SiteModelStore] listener threw:` and ABORTED the rest of this
     * renderer's clear. The founder's production log carries exactly that stack
     * (`UH.disposeGroup` → `X5.onMaterialDispose` → `tq.delete`). The guard is the
     * repo's existing single owner of this hazard (`packages/renderer-three/src/
     * safeDispose.ts`), so it swallows ONLY the `usedTimes` TypeError and re-throws
     * every genuine disposal bug.
     */
    private disposeGroup(group: THREE.Group): void {
        safeDisposeObject3D(group);
    }

    /** Idempotent teardown — removes the outline + releases subscriptions. */
    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.clear();
        for (const d of this.disposers) {
            try {
                d();
            } catch (e) {
                console.warn('[ParcelBoundarySceneRenderer] disposer threw:', e);
            }
        }
        this.disposers.length = 0;
    }
}

/**
 * Wire the parcel-boundary outline into the live scene. Called once from
 * `initScene` after the world + runtime are ready. No-ops (and warns soft) when
 * the scene or runtime is missing so a half-initialised engine never throws.
 *
 * @returns the renderer instance (for HMR disposal) or null if preconditions
 *          were unmet.
 */
export function initParcelBoundarySceneRenderer(
    scene: THREE.Scene | null | undefined,
    runtime: PryzmRuntime | null | undefined,
): ParcelBoundarySceneRenderer | null {
    if (!scene) {
        console.warn('[ParcelBoundarySceneRenderer] no scene — skipping boundary overlay.');
        return null;
    }
    if (!runtime) {
        console.warn('[ParcelBoundarySceneRenderer] no runtime — skipping boundary overlay.');
        return null;
    }
    return new ParcelBoundarySceneRenderer(scene, runtime);
}
