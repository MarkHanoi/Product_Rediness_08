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
import { envelopeRenderStyle } from './envelopeRenderStyle';
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
import {
    envelopeDrawMode,
    GROUND_SHADE_HEIGHT_M,
    GROUND_SHADE_FILL_ALPHA,
    type EnvelopeDrawMode,
} from '@pryzm/site-parcel-data';

/** The unified PRYZM preview / site-context violet. */
const PRYZM_VIOLET = 0x6600ff;

/** Slight +y lift (metres) so the outline never z-fights the ground grid. */
const GROUND_Y_OFFSET = 0.02;

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

/** Teal — deliberately outside the confident-violet / provisional-grey / suggested-amber family
 *  `envelopeRenderStyle.ts` already owns, so a study massing cannot be mistaken for any of them. */
const STUDY_MASSING_TEAL = 0x00a99a;

/** Near-wireframe fill — well below the plan-backed envelope's normal 0.16, matching the weight
 *  this file already uses for an upper-bound / open-top plan envelope (0.05), so a study reads at
 *  least as tentative as PRYZM's own least-confident plan-backed rendering, never more solid. */
const STUDY_MASSING_FILL_ALPHA = 0.05;

/** The study's own ground-shade weight — lighter than the real envelope's `GROUND_SHADE_FILL_ALPHA`
 *  (0.22): the shade underneath an indicative study must read as the LESSER claim of the two. */
const STUDY_GROUND_SHADE_FILL_ALPHA = 0.12;

/** Dashed-rim tuning (metres) — small relative to a typical building footprint so the dashes read
 *  as a texture, not as a countable set of segments. */
const STUDY_DASH_SIZE_M = 0.6;
const STUDY_DASH_GAP_M = 0.4;

/** §ENVELOPE-VIA-MASSING (L-402d) — the fallback envelope height (m) when the C58
 *  envelope has no `maxHeight_m` resolved. Mirrors the Cesium side's fallback. */
const ENVELOPE_FALLBACK_HEIGHT_M = 9;

/** A 2D point on the scene ground plane (metres). Matches C19 `Pt`. */
interface XZPoint {
    readonly x: number;
    readonly z: number;
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

        return group;
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
            return mesh;
        } catch (e) {
            console.warn('[ParcelBoundarySceneRenderer] fill triangulation failed:', e);
            return null;
        }
    }

    /**
     * §ENVELOPE-VIA-MASSING (L-402d) — build the buildable-envelope study volume: a
     * translucent extruded #6600FF prism from the cached C58 `BuildableEnvelope`
     * inset ring (scene-XZ metres) up to its max height. Returns null when there is
     * no `ok` envelope (no parcel / degenerate setbacks / no envelope computed yet),
     * or on any triangulation failure — never throws.
     *
     * Geometry alignment: the inset ring is in the SAME scene-XZ frame as the parcel
     * polygon + generated walls. We build the 2D shape in (x, −z) and rotate it flat
     * onto the XZ ground plane extruding UP (+Y) so scene coords land at (p.x, y, p.z)
     * — aligned with the parcel line + walls.
     *
     * @param drawMode §ENV3D164 — now read ONCE by the caller (`buildOutline`) and passed in, so
     *        the plan-backed volume and the study-massing volume below can never disagree about
     *        what the user's two toggles mean (previously this method read the authority itself).
     */
    private buildEnvelopeVolume(drawMode: EnvelopeDrawMode): THREE.Mesh | null {
        try {
            // ⭐ §ENVELOPE-ONE-VISIBILITY (L-1170) — ask the ONE authority, first, before any
            // geometry exists. Returning null here is what makes the user's "hide" reach the
            // BIM/plan scene at all; `refresh()` is re-driven by the subscription in the
            // constructor, so this is re-evaluated the moment the answer changes.
            // ⭐ §ENVELOPE-TWO-AXES (C58 §1.17 / L-1188) — TWO AXES, ONE RULE. "Envelope: OFF" hides
            // the VOLUME ("what mass may I build?"); it does not answer "what AREA may I build on?",
            // and the flat ground shade is useful precisely then because it occludes nothing.
            // `envelopeDrawMode` is the SAME pure L2 decision the globe rasteriser makes — this
            // surface must not have its own idea of what "off" means.
            if (drawMode === 'none') return null;
            const env = getLastBuildableEnvelope();
            if (!env || env.status !== 'ok') return null;
            const ring = env.insetPolygon;
            if (!Array.isArray(ring) || ring.length < 3) return null;
            const hasRealHeight =
                typeof env.maxHeight_m === 'number' && env.maxHeight_m > 0;
            // §ENVELOPE-TWO-AXES — a ground shade is the SAME ring at a sub-visual thickness. It is a
            // PROJECTION of a volume that already passed every §1.4/§1.16 honesty gate above (an
            // envelope that refused returns `status !== 'ok'` and we are already gone), so it can
            // never assert ground the volume would not have.
            const groundShade = drawMode === 'ground-shade';
            const height = groundShade
                ? GROUND_SHADE_HEIGHT_M
                : hasRealHeight
                  ? env.maxHeight_m!
                  : ENVELOPE_FALLBACK_HEIGHT_M;
            // §ENVELOPE-CONFIDENCE-COLOUR (L-608) — a confident, complete determination renders in the
            // unified violet; an estimate or a flat (no-confirmed-height) envelope renders in a muted
            // grey so a "couldn't complete" fallback can never look like a surveyed answer.
            // §L-619 — an upper-bound footprint (no published setbacks) forces the provisional grey +
            // the near-transparent fill below, so the plan/BIM view stays consistent with the globe's
            // §1.14 rasteriser. Same shared classifier as `envelopeToMassing` — one honesty decision.
            // §OPEN-TOP-INDICATIVE (ADR-0293) — the publication posture rides on the envelope itself
            // (the §1.14 carrier), so this surface reads the SAME honesty decision the globe does.
            // `null` (every envelope shipped before the posture, and every persisted ring) means NOT
            // STATED and classifies exactly as it always did.
            const style = envelopeRenderStyle(
                env.confidence,
                hasRealHeight,
                env.footprintIsUpperBound === true,
                env.publicationPosture ?? null,
                // §NEARBY-HEIGHT-SUGGESTION — the admin-only, not-yet-reviewed auto-preview flag;
                // forces the warning amber here too, so the flat/BIM overlay agrees with the globe.
                isLastEnvelopeSuggestedPreview(),
            );

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
            // ring aligns in X/Z and the volume rises from the ground to `height`.
            geo.rotateX(-Math.PI / 2);
            geo.translate(0, GROUND_Y_OFFSET, 0);

            const mat = new THREE.MeshBasicMaterial({
                color: style.hex,
                transparent: true,
                // §L-619 — a MAXIMUM-extent footprint (no published setbacks) renders near-wireframe so
                // it reads as a provisional upper bound, not a solved study fill.
                // §OPEN-TOP-INDICATIVE — an indicative volume takes the SAME near-wireframe weight:
                // both are study extents, and giving the posture its own opacity would let the two
                // drift until one read as confident.
                // §ENVELOPE-TWO-AXES — the ground shade is the ONLY thing on screen for this
                // envelope, so it carries its own (heavier) alpha; an upper-bound / open-top
                // envelope keeps the near-wireframe weight in BOTH modes — the doubt does not
                // become less doubtful because the volume was hidden.
                opacity: style.footprintUpperBound || style.openTop
                    ? 0.05
                    : groundShade
                      ? GROUND_SHADE_FILL_ALPHA
                      : 0.16,
                depthWrite: false,
                side: THREE.DoubleSide,
            });
            // §OPEN-TOP-INDICATIVE (ADR-0293) — ⭐ DRAW IT WITHOUT ITS LIDS. `ExtrudeGeometry` emits
            // two groups: materialIndex 0 = the caps (lids), 1 = the side walls. Handing it a
            // material array whose CAP slot is fully transparent leaves an open shell — the literal
            // open top the ADR requires, and the one channel that survives a greyscale screenshot
            // (the hue is already provisional grey; an indicative envelope is never `complete`).
            // ⚠ Guarded on the group count rather than assumed: if a future THREE emits a single
            // group we fall back to the closed prism, which is merely the pre-existing look, never a
            // wrong claim — the grey hue and the card's caveats still carry the disclosure.
            // §OPEN-TOP-INDICATIVE × §ENVELOPE-TWO-AXES — a FLAT SHADE HAS NO TOP TO LEAVE OPEN.
            // Stripping the cap off a 0.12 m slab would delete the only face anyone can see and
            // draw nothing at all, turning a disclosure into a disappearance.
            const capMat = style.openTop && !groundShade
                ? new THREE.MeshBasicMaterial({
                      color: style.hex,
                      transparent: true,
                      opacity: 0,
                      depthWrite: false,
                      side: THREE.DoubleSide,
                  })
                : null;
            const useOpenTop = capMat !== null && geo.groups.length >= 2;
            const mesh = new THREE.Mesh(geo, useOpenTop ? [capMat!, mat] : mat);
            if (capMat !== null && !useOpenTop) capMat.dispose();
            mesh.name = groundShade
                ? 'pryzm-buildable-envelope-ground-shade'
                : 'pryzm-buildable-envelope-volume';
            // §ENVELOPE-TWO-AXES — which of the two representations this mesh IS, readable by a
            // screenshot test / a11y layer without re-deriving it from the height.
            mesh.userData.envelopeGroundShade = groundShade;
            mesh.userData.envelopeConfidenceComplete = style.complete;
            // §OPEN-TOP-INDICATIVE — the posture on the mesh, so a screenshot test / a11y layer can
            // assert "this volume claims no buildable right" without re-deriving it.
            mesh.userData.envelopeOpenTop = style.openTop;
            mesh.userData.envelopeOpenTopExpressed = useOpenTop;
            // Distinct flag (NOT the parcel hide flags) — visible in the BIM 3D + plan
            // design scene; a future view gate can target this without touching the parcel.
            mesh.userData.isBuildableEnvelopeVolume = true;
            return mesh;
        } catch (e) {
            console.warn('[ParcelBoundarySceneRenderer] envelope volume build failed:', e);
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
     */
    private buildDashedRim(ring: ReadonlyArray<XZPoint>, y: number): THREE.Line | null {
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
                color: STUDY_MASSING_TEAL,
                transparent: true,
                opacity: 0.85,
                dashSize: STUDY_DASH_SIZE_M,
                gapSize: STUDY_DASH_GAP_M,
                depthWrite: false,
            });
            const line = new THREE.Line(geo, mat);
            line.computeLineDistances();
            line.name = 'pryzm-context-study-massing-rim';
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
