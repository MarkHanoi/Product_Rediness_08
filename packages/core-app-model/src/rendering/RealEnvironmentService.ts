/**
 * @file packages/core-app-model/src/rendering/RealEnvironmentService.ts
 * @description §FEAT-REAL-ENVIRONMENT (ADR-0106) — the orchestrator that makes the
 *   View Properties "Environment & Camera" panel REAL. It wires two existing
 *   subsystem pieces to the live scene and the panel events:
 *
 *     8A  real sun   — a {@link RealSunService} driving the scene's SOLE real
 *                      shadow caster (the Pascal key light) from the true solar
 *                      position at the site lat/lon + time-of-day (same NOAA basis
 *                      as the Cesium/Forma globe and @pryzm/solar-analysis).
 *     8B  ground     — a {@link GroundShadowCatcher}: an invisible L0 plane so
 *                      every element casts a grounded shadow even with no slab.
 *
 * CONTRACT (01-BIM-ENGINE-CORE-CONTRACT §4.3, §5):
 *  - NEVER mutates any ElementStore or semantic state.
 *  - Operates exclusively on the THREE projection layer via the existing services.
 *  - Does NOT import @thatopen/* packages.
 *
 * Why NOT a parallel lighting/shadow subsystem (task mandate + §PERF-HEAVY-SHADOW-OFF):
 *  - The sun REUSES RealSunService and steers the SAME key light the perf gates
 *    suppress — one caster, one lever. No competing DirectionalLight is added.
 *  - The catcher adds ZERO casters (receive-only), so heavy/nav scenes that drop
 *    the shadow pass simply show no ground shadow. Fully reversible, no mid-submit
 *    GPU dispose — the ADR-0111 shadow-freeze paths are untouched.
 *
 * P3 (single rAF): this service performs NO animation and never calls
 * requestAnimationFrame — the sun is re-solved only on discrete input (time /
 * location / offset / level change).
 */

import * as THREE from '@pryzm/renderer-three/three';
// §PRYZM-PERF (INSTR1) — full-scene traversal attribution.
import { bumpPerf, PERF_KEYS } from '@pryzm/frame-scheduler';
import { GroundShadowCatcher } from '@pryzm/renderer-three';
import { RealSunService, type KeyLightHost, type SunMode } from './RealSunService.js';

/** How the RealEnvironmentService reads the current site location (C19). */
export type SiteLatLonReader = () => { lat: number; lon: number } | null;

/** How the RealEnvironmentService reads the L0 (lowest-level) ground elevation. */
export type GroundElevationReader = () => number;

/**
 * §CATCHER-CANNOT-WASH-THE-VIEWPORT (L-1940) — metres of slack added on every side of
 * the caster extent, on top of the computed shadow throw, so a shadow is never clipped
 * by a rounding error at the plane's edge.
 */
const CATCHER_MARGIN_M = 6;

/**
 * §CATCHER-CANNOT-WASH-THE-VIEWPORT (L-1940) — floor on the catcher's edge length, so a
 * single small caster still gets a usable contact-shadow area.
 */
const CATCHER_MIN_SIZE_M = 12;

/**
 * §CATCHER-CANNOT-WASH-THE-VIEWPORT (L-1940) — ceiling on the computed shadow throw.
 * At a low sun the true throw diverges (height / tan(elevation) -> infinity at sunrise);
 * past this it is no longer a contact shadow and re-admitting a viewport-wide plane to
 * chase it would reinstate exactly the defect this bounds.
 */
const CATCHER_MAX_THROW_M = 150;

/**
 * Orchestrates the real sun + ground shadow-catcher for one scene. One instance
 * per editor session, created and wired by `initScene`.
 */
export class RealEnvironmentService {
    private readonly _sun = new RealSunService();
    private readonly _ground = new GroundShadowCatcher();

    private _scene: THREE.Scene | null = null;
    private _readSiteLatLon: SiteLatLonReader = () => null;
    private _readGroundElevation: GroundElevationReader = () => 0;
    private _enabled = false;
    private _groundShadowsEnabled = true;

    /**
     * §L-205 caster-visibility gate (re-applied from L-200; the ONLY behaviour kept
     * from the reverted §FIX-GROUND-SHADOW-AT-PERF-TIER / §FIX-WEBGPU-* stack).
     *
     * Whether the scene currently holds any shadow-CASTING geometry. The catcher is a
     * `ShadowMaterial` plane: with NO caster it composites as "fully shadowed" → an
     * opaque grey fill on WebGPU (the founder's empty-project grey square). We suppress
     * that COSMETIC grey by gating only the catcher's VISIBILITY on caster presence —
     * a pure scene-graph boolean. The receiver stays ATTACHED (in the shadow pass) from
     * frame 1 (L-112), so this never drops it from the shadow-sampling set. Updated by
     * {@link updateGroundCatcherVisibility} on the app's debounced geometry cadence.
     *
     * NOTE: this gate performs NO GPU allocation, NO dispose, NO shadow-camera mutation,
     * and NO pipeline/ScenePass rebuild — it flips `mesh.visible` only.
     */
    private _hasCasters = false;

    /**
     * ── §CATCHER-CANNOT-WASH-THE-VIEWPORT (L-1940) ───────────────────────────
     *
     * World-space XZ extent (plus Y range) of the scene's shadow-CASTING meshes, from
     * the SAME traverse that computes {@link _hasCasters} — no second sweep, no extra
     * `bumpPerf` site. `null` until the first sweep finds a caster.
     *
     * THE DEFECT THIS BOUNDS, stated as a mechanism and not as a guess. The catcher is
     * a `THREE.ShadowMaterial` plane **4 km across**. On three r183's node renderer —
     * used by BOTH the 'webgpu' and the 'webgl-fallback' backend the founder is on —
     * that material's alpha is `opacity x (1 - product of every shadow-casting light
     * mask)` (`ShadowMaskModel.finish()`), and `ShadowNode.setupShadowFilter()` returns
     * a mask of 1 (lit, i.e. transparent) ONLY outside the shadow camera's frustum.
     * INSIDE it the mask is a depth-texture compare, and **every** way that compare can
     * fail — a map that was never rendered, one allocated by a rival renderer, a
     * mismatched compare function, a caster set the pass never drew — produces the
     * value 0, which is bit-identical to "this fragment is fully shadowed". The plane
     * then paints a flat 32 % black wash across its whole in-frustum footprint. Over
     * the white viewport background (#ffffff, RenderPipelineManager
     * §VIEWPORT-BG-ONE-AUTHORITY-RUNTIME) that composites to ~#adadad: **the founder's
     * grey, DRAWN, on a background stack that measures white** — which is why five
     * consecutive fixes aimed at `scene.background` / the renderer clear all missed.
     *
     * This field does NOT diagnose which of those failures fires. It CONTAINS all of
     * them: the plane is re-seated over the casters and sized to their extent plus the
     * sun's real shadow throw, so the worst case it can paint is the ground the model
     * actually stands on — never a viewport-wide field. Every real shadow still lands
     * (the throw is what guarantees that), so this is not "turn ground shadows off".
     */
    private _casterBounds: {
        minX: number; maxX: number; minZ: number; maxZ: number; minY: number; maxY: number;
    } | null = null;

    /** Scratch sphere for the caster-bounds accumulation (never allocated per mesh). */
    private readonly _tmpSphere = new THREE.Sphere();

    /**
     * §DIAG-GROUND-SHADOW-FIT (L-205) — the host that owns the scene's sole real shadow
     * caster (the Pascal key light), kept ONLY so the read-only diagnostic can dump the
     * live light + shadow-camera state on the first caster. Never mutated here.
     */
    private _keyLightHost: KeyLightHost | null = null;
    /** §DIAG-GROUND-SHADOW-FIT — ensures the one-line diagnostic logs at most once per project. */
    private _diagLogged = false;

    // ── Getters (diagnostics / tests) ────────────────────────────────────────
    get enabled(): boolean { return this._enabled; }
    get sun(): RealSunService { return this._sun; }
    get ground(): GroundShadowCatcher { return this._ground; }
    get groundShadowsEnabled(): boolean { return this._groundShadowsEnabled; }
    /** §L-205 — true while the scene has a shadow caster (so the catcher is shown). */
    get sceneHasCasters(): boolean { return this._hasCasters; }

    /**
     * Bind the service to the live scene + the host that owns the real shadow
     * caster (the Pascal key light), plus the two site/level readers. Must be
     * called once before {@link enable}.
     */
    bind(
        scene: THREE.Scene,
        keyLightHost: KeyLightHost,
        readSiteLatLon: SiteLatLonReader,
        readGroundElevation: GroundElevationReader,
    ): void {
        this._scene = scene;
        this._readSiteLatLon = readSiteLatLon;
        this._readGroundElevation = readGroundElevation;
        this._keyLightHost = keyLightHost; // §DIAG-GROUND-SHADOW-FIT — read-only handle for the diagnostic.
        this._sun.bind(scene);
        // Steer the scene's existing key light instead of adding a parallel light.
        this._sun.bindKeyLightHost(keyLightHost);
    }

    /**
     * Enable the real environment: solve the sun for the current site + time and
     * drive the key light, and mount the ground shadow-catcher at L0. Idempotent.
     */
    enable(): void {
        if (!this._scene) {
            console.warn('[RealEnvironmentService] Not bound — call bind() first.');
            return;
        }
        const site = this._readSiteLatLon();
        // Default to local MIDDAY (matches the panel's 12h default) so the authoring
        // scene is always well-lit — never dark just because it is night in wall-clock
        // time at the site. The user's time-of-day slider overrides this immediately.
        const noon = new Date();
        noon.setUTCHours(12, 0, 0, 0);
        this._sun.enableRealSun(
            site ? { lat: site.lat, lng: site.lon, date: noon } : { date: noon },
        );

        // §FIX-SHADOW-CATCHER-RESTORE (L-112) — attach the ground shadow-catcher NOW,
        // at enable() time, exactly as the original L-11 §FEAT-REAL-ENVIRONMENT did.
        //
        // WHY (regression post-mortem): L-107 deferred the attach until the first
        // shadow caster arrived (via a debounced scene-caster sweep) to hide the
        // empty-project grey rectangle. On the live WebGPU/TSL renderer that
        // late-attach dropped the receiver out of the shadow-sampling set — the plane
        // rendered its base ShadowMaterial (still a grey rectangle) but NO LONGER
        // received the real building shadow. Attaching the receiver up front — before
        // the pipeline compiles its shadow pass — is what made yesterday's real
        // building shadow render beautifully. So the catcher is ALWAYS present (and in
        // the shadow pass) whenever ground shadows are on; it is only shown/hidden via
        // the user toggle (setGroundShadows), never conditionally detached on caster
        // count. (The cosmetic empty-project grey — ShadowMaterial not fully
        // transparent where unlit on WebGPU — is a SEPARATE follow-up that must NOT
        // touch this receive path.)
        // §L-205 caster-visibility gate — ATTACH the receiver up front (keep L-112: in
        // the shadow pass from frame 1 so it receives the real shadow), but leave its
        // VISIBILITY to the caster gate. On a brand-new empty project there are 0 casters
        // → the plane is attached-but-invisible, so there is no cosmetic opaque grey
        // square; the moment the first caster lands (updateGroundCatcherVisibility fires
        // on the geometry event) it becomes visible and composites the real ground shadow.
        this._ground.setElevation(this._readGroundElevation());
        if (this._groundShadowsEnabled) this._ground.attach(this._scene);

        this._enabled = true;
        // Recompute the caster gate for whatever geometry is already present (project
        // switch / reload). A no-op-safe hide on a fresh empty scene.
        this.updateGroundCatcherVisibility();
        console.log(
            '[RealEnvironmentService] §FEAT-REAL-ENVIRONMENT enabled — ' +
            `site=${site ? `${site.lat.toFixed(3)},${site.lon.toFixed(3)}` : 'default'} ` +
            `ground=${this._groundShadowsEnabled ? `on (catcher attached; ${this._hasCasters ? 'visible — receiving real shadow' : 'hidden until first caster'})` : 'off'}.`,
        );
    }

    /** Re-solve the sun after the site location changes (onboarding / relocate). */
    refreshSiteLocation(): void {
        const site = this._readSiteLatLon();
        if (site) this._sun.setLocation(site.lat, site.lon);
    }

    /** Re-place the ground catcher after the active level / levels change. */
    refreshGroundElevation(): void {
        this._ground.setElevation(this._readGroundElevation());
    }

    /**
     * §L-205 caster-visibility gate — apply the catcher's attach + visibility from the
     * current ground-shadow toggle and caster gate.
     *
     * Keeps the receiver ATTACHED whenever ground shadows are on (L-112 — never dropped
     * from the shadow-sampling set), and shows it (`setEnabled(true)` → `mesh.visible`)
     * ONLY when there is a caster (no cosmetic grey on an empty scene). No GPU dispose,
     * no shadow-camera mutation, no graph churn — ADR-0111 safe.
     */
    private _applyCatcher(): void {
        if (!this._scene) return;
        if (this._groundShadowsEnabled) {
            this._ground.setElevation(this._readGroundElevation());
            this._applyCatcherFootprint();
            this._ground.attach(this._scene);
            this._ground.setEnabled(this._hasCasters && this._shadowMaskCanBeReal());
        } else {
            this._ground.setEnabled(false);
        }
    }

    /**
     * §CATCHER-GATED-ON-A-LIVE-CASTING-LIGHT (L-1941) — is there a light that could
     * produce a MEANINGFUL shadow mask right now?
     *
     * §L-205 gates the catcher on MESH casters. It never gated on the other half of the
     * product: `ShadowMaskModel` multiplies the mask of every shadow-casting LIGHT, and
     * this scene has exactly one (`pascal-key-light`, measured in the founder's session
     * via §DIAG-GROUND-SHADOW-CASTING-LIGHTS: `castingLights=1`). §PERF-HEAVY-SHADOW-OFF
     * clears that light's `castShadow` on a heavy scene (`PascalSceneLighting
     * .setShadowsSuppressed`, fired at >= 8000 meshes by
     * `RenderingPipelineCoordinator.applyTierForMeshCount`) — and the catcher stayed
     * VISIBLE right through it, because nothing joined the two levers up. In that state
     * no shadow pass runs at all, so whatever the plane paints is definitionally not a
     * shadow. Hide it.
     *
     * `null` key light is UNKNOWN, not false: `enable()` can run before
     * `PascalSceneLighting.apply()` has minted the light, and answering "no" there would
     * regress the empty-to-first-caster path this class already pins. Unknown keeps the
     * pre-existing behaviour (a scene with no casting light composites `mask = 1` -> the
     * plane is transparent anyway, so nothing is painted either way).
     *
     * Pure boolean read. No GPU work, no light mutation.
     */
    private _shadowMaskCanBeReal(): boolean {
        const key = this._keyLightHost?.keyLight ?? null;
        if (!key) return true;
        return key.castShadow === true;
    }

    /**
     * §CATCHER-CANNOT-WASH-THE-VIEWPORT (L-1940) — seat + size the catcher from the
     * measured caster extent, so the surface can only ever darken the ground the model
     * actually stands on.
     *
     * Two independent defects close here:
     *
     *  1. **Size.** 4 km of `ShadowMaterial` is 4 km of "any shadow-map failure reads as
     *     32 % black" (see {@link _casterBounds}). The live footprint becomes the caster
     *     extent + the sun's real shadow throw + a margin, clamped to the constructed
     *     size — it can only ever SHRINK.
     *  2. **Position.** The plane was hard-centred on the WORLD ORIGIN and never moved.
     *     A model seated off-origin (every geolocated PRYZM site) had its contact
     *     shadows land on a plane that was not under it. It now follows the casters.
     *
     * The throw is derived from the key light's ACTUAL direction rather than from a solar
     * API, so it stays correct in `manual` sun mode and needs no second source of truth.
     */
    private _applyCatcherFootprint(): void {
        const b = this._casterBounds;
        if (!b) return; // no caster measured yet — leave the constructed footprint alone
        const groundY = this._readGroundElevation();
        const height = Math.max(0, b.maxY - Math.min(b.minY, groundY));
        const throwM = this._shadowThrowForHeight(height);
        const span = Math.max(b.maxX - b.minX, b.maxZ - b.minZ);
        const size = Math.max(CATCHER_MIN_SIZE_M, span + 2 * (throwM + CATCHER_MARGIN_M));
        this._ground.setFootprint((b.minX + b.maxX) / 2, (b.minZ + b.maxZ) / 2, size);
    }

    /**
     * §CATCHER-CANNOT-WASH-THE-VIEWPORT (L-1940) — how far a caster of `height` metres
     * throws its shadow along the ground, from the key light's live world direction
     * (`height * horizontal / vertical`). Clamped to {@link CATCHER_MAX_THROW_M}; falls
     * back to that clamp when there is no light or the light is at/below the horizon,
     * which is the conservative direction (a larger plane, never a clipped shadow).
     */
    private _shadowThrowForHeight(height: number): number {
        if (!(height > 0)) return 0;
        const key = this._keyLightHost?.keyLight ?? null;
        if (!key) return CATCHER_MAX_THROW_M;
        const dx = key.position.x - key.target.position.x;
        const dy = key.position.y - key.target.position.y;
        const dz = key.position.z - key.target.position.z;
        if (!(dy > 1e-3)) return CATCHER_MAX_THROW_M;
        const throwM = height * (Math.hypot(dx, dz) / dy);
        return Number.isFinite(throwM) ? Math.min(CATCHER_MAX_THROW_M, throwM) : CATCHER_MAX_THROW_M;
    }

    /**
     * §L-205 caster-visibility gate — recompute whether the scene holds any shadow-CASTING
     * geometry and drive the catcher's visibility from it: hidden on an empty scene (no
     * cosmetic grey square), shown + receiving once a caster exists. The receiver stays
     * ATTACHED throughout (L-112 receive preserved); only `mesh.visible` flips.
     *
     * This is a PURE scene-graph sweep + boolean. It performs NO frustum fit, NO light
     * re-home, NO shadow-map / mapSize write, NO pipeline rebuild — the deliberate scope
     * after the §REVERT-SHADOW-TO-KNOWN-GOOD reset. The wider shadow improvements
     * (frustum fit, first-caster rebuild, forced shadow refresh) are re-earned later, one
     * at a time, each verified on prod.
     *
     * Cheap enough to call on a debounced geometry-change; a no-op on an empty scene.
     */
    updateGroundCatcherVisibility(): void {
        if (!this._enabled || !this._scene) return;
        const catcher = this._ground.mesh;
        // §PRYZM-PERF (INSTR1) — full-scene walk, attributed to this call site.
        bumpPerf(PERF_KEYS.TRAVERSE_REAL_ENV);
        let hasCaster = false;
        // §CATCHER-CANNOT-WASH-THE-VIEWPORT (L-1940) — accumulate the caster EXTENT in
        // the same walk. The `if (hasCaster) return` short-circuit that used to sit here
        // is gone deliberately: it answered "is there >= 1 caster" and stopped, which is
        // why the plane could never be sized to them. The added per-mesh work is one
        // cached bounding-sphere read + one `applyMatrix4` + six comparisons; the walk
        // itself is unchanged and still attributed to PERF_KEYS.TRAVERSE_REAL_ENV.
        let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
        let minY = Infinity, maxY = -Infinity;
        this._scene.traverse((obj) => {
            if (obj === catcher) return;
            const mesh = obj as THREE.Mesh;
            if (!mesh.isMesh) return;
            if (mesh.visible === false) return; // skip hidden far-level (massing) geometry
            const role = (obj.userData?.role as string | undefined) ?? '';
            if (role === 'edges' || role === 'edge-overlay' || role === 'ground-shadow-catcher') return;
            const name = (obj.name ?? '').toLowerCase();
            if (name.includes('edge') || name.includes('grid') ||
                name.includes('collision') || name.includes('helper')) return;
            // A real, shadow-CASTING mesh is what the catcher needs to show a shadow.
            // Pascal flags every element castShadow, so "has caster" == "has real
            // geometry" in practice, but check castShadow explicitly for intent.
            if (!mesh.castShadow) return;
            hasCaster = true;

            // Bounds. An InstancedMesh's own boundingSphere covers its INSTANCES; the
            // geometry's covers only the prototype, so an aggregate would otherwise
            // measure as one element at the origin. Both are local-space, so both take
            // matrixWorld. Cached by three for frustum culling — computed here only if
            // absent, and never fatal.
            const inst = obj as THREE.Object3D & {
                isInstancedMesh?: boolean;
                boundingSphere?: THREE.Sphere | null;
                computeBoundingSphere?: () => void;
            };
            let sphere: THREE.Sphere | null = null;
            try {
                if (inst.isInstancedMesh === true) {
                    if (!inst.boundingSphere) inst.computeBoundingSphere?.();
                    sphere = inst.boundingSphere ?? null;
                } else {
                    const geom = mesh.geometry as THREE.BufferGeometry | undefined;
                    if (geom) {
                        if (!geom.boundingSphere) geom.computeBoundingSphere();
                        sphere = geom.boundingSphere ?? null;
                    }
                }
            } catch { sphere = null; }
            if (!sphere) return;
            const s = this._tmpSphere.copy(sphere).applyMatrix4(mesh.matrixWorld);
            if (!Number.isFinite(s.radius)) return;
            if (s.center.x - s.radius < minX) minX = s.center.x - s.radius;
            if (s.center.x + s.radius > maxX) maxX = s.center.x + s.radius;
            if (s.center.z - s.radius < minZ) minZ = s.center.z - s.radius;
            if (s.center.z + s.radius > maxZ) maxZ = s.center.z + s.radius;
            if (s.center.y - s.radius < minY) minY = s.center.y - s.radius;
            if (s.center.y + s.radius > maxY) maxY = s.center.y + s.radius;
        });
        const hadCasters = this._hasCasters;
        this._hasCasters = hasCaster;
        this._casterBounds = Number.isFinite(minX) && Number.isFinite(maxX)
            ? { minX, maxX, minZ, maxZ, minY, maxY }
            : null;
        this._applyCatcher();
        // §DIAG-GROUND-SHADOW-FIT (L-205) — one read-only line on the first caster (0→≥1),
        // dumping the live light + shadow-camera + catcher state so the next shadow bug is
        // diagnosed from real numbers, not another hypothesis. Mutates NOTHING.
        if (!hadCasters && hasCaster && !this._diagLogged) {
            this._diagLogged = true;
            this._logGroundShadowDiagnostic();
        }
        // Re-arm the one-shot diagnostic when the scene empties (project switch / clear),
        // so the next project logs its own first-caster numbers.
        if (hadCasters && !hasCaster) this._diagLogged = false;
    }

    /**
     * §DIAG-GROUND-SHADOW-FIT (L-205) — read-only dump of the exact numbers that decide
     * whether the sun→ground shadow reaches the catcher. Logs the key light's world pose,
     * its ortho shadow-camera bounds + near/far, mapSize, castShadow, whether the shadow
     * map is allocated, and the catcher's visible/material/opacity + the scene caster
     * count. Never mutates anything (pure reads); guarded so a null light is a no-op.
     */
    private _logGroundShadowDiagnostic(): void {
        try {
            const key = this._keyLightHost?.keyLight ?? null;
            const cam = key?.shadow?.camera as THREE.OrthographicCamera | undefined;
            const mat = this._ground.mesh.material as THREE.ShadowMaterial | undefined;
            const p = key?.position;
            const t = key?.target?.position;
            let casterCount = 0;
            this._scene?.traverse((o) => { if ((o as THREE.Mesh).isMesh && (o as THREE.Mesh).castShadow) casterCount++; });

            // §DIAG-GROUND-SHADOW-CASTING-LIGHTS (L-1353) — THE MEASUREMENT THIS DUMP WAS
            // MISSING, and the one the "attempt 9" note above needs to be decidable.
            //
            // The catcher's alpha is not a property of the key light. In three r183 the
            // node renderer (used by BOTH 'webgpu' and 'webgl-fallback') maps
            // THREE.ShadowMaterial -> ShadowNodeMaterial -> ShadowMaskModel, whose whole
            // body is:
            //     constructor: shadowMask = 1
            //     direct({ lightNode }): if (lightNode.shadowNode !== null)
            //                                shadowMask *= lightNode.shadowNode
            //     finish():   diffuseColor.a *= shadowMask.oneMinus()
            // (three/src/nodes/functions/ShadowMaskModel.js, read 2026-08-20.)
            //
            // So the plane's opacity is `material.opacity * (1 - PRODUCT over EVERY
            // shadow-casting direct light)`. It is transparent only while EVERY such light
            // reports "lit" at that fragment. ONE extra casting light whose depth map this
            // renderer never wrote contributes ~0, the product collapses, and the catcher
            // paints a flat `opacity` wash of black over its whole in-frustum footprint -
            // a grey field with the real shadow darker inside it, i.e. the founder's
            // recurring "the viewport background is grey" on a background stack that
            // measures pure white (initScene §VIEWPORT-BG-PROBE).
            //
            // The dump already printed the KEY light's map. It printed nothing about the
            // other terms in the product, so a reader could not tell a broken key light
            // from a healthy key light multiplied by a stranger. Count them.
            let castingLights = 0;
            const castingLightNames: string[] = [];
            this._scene?.traverse((o) => {
                const l = o as THREE.Object3D & { isLight?: boolean; castShadow?: boolean };
                if (l.isLight !== true || l.castShadow !== true) return;
                castingLights++;
                if (castingLightNames.length < 6) castingLightNames.push(`${l.type}:${l.name || '(unnamed)'}`);
            });
            // §DIAG-GROUND-SHADOW-MAPTYPE (L-205 attempt 9) — the grey rectangle is the
            // shadow camera's ground footprint reading "fully shadowed" everywhere, which
            // points at a WebGPU depth map that is never written. Print the shadow MAP's
            // and TEXTURE's constructor names (a live WebGPU `RenderTarget`/`Texture` vs a
            // foreign OBC `WebGLRenderTarget` the WebGPU pass never wrote), the per-light
            // `shadow.autoUpdate` (three's node ShadowNode gates the depth redraw on THIS,
            // not on `renderer.shadowMap.autoUpdate`), and `metresPerTexel` (C04 §SHADOW.2.2).
            const sh = key?.shadow as (THREE.DirectionalLightShadow & { map?: { constructor?: { name?: string }; texture?: { constructor?: { name?: string } } } | null; autoUpdate?: boolean }) | undefined;
            const shMap = sh?.map;
            const camWidth = cam ? cam.right - cam.left : NaN;
            const mapW = sh?.mapSize?.width ?? 0;
            const metresPerTexel = Number.isFinite(camWidth) && mapW > 0 ? camWidth / mapW : NaN;
            console.log(
                '[RealEnvironmentService] §DIAG-GROUND-SHADOW-FIT — ' +
                `keyLightPos=${p ? `(${p.x.toFixed(1)},${p.y.toFixed(1)},${p.z.toFixed(1)})` : 'none'} ` +
                `target=${t ? `(${t.x.toFixed(1)},${t.y.toFixed(1)},${t.z.toFixed(1)})` : 'none'} ` +
                `shadowCam=${cam ? `[L${cam.left.toFixed(1)} R${cam.right.toFixed(1)} T${cam.top.toFixed(1)} B${cam.bottom.toFixed(1)} n${cam.near.toFixed(1)} f${cam.far.toFixed(1)}]` : 'none'} ` +
                `mapSize=${key?.shadow ? `${key.shadow.mapSize.x}x${key.shadow.mapSize.y}` : 'none'} ` +
                `metresPerTexel=${Number.isFinite(metresPerTexel) ? metresPerTexel.toFixed(3) : '?'} ` +
                `castShadow=${key?.castShadow ?? 'none'} shadowMapAllocated=${shMap != null} ` +
                `shadowMapType=${shMap?.constructor?.name ?? 'none'} shadowTexType=${shMap?.texture?.constructor?.name ?? 'none'} ` +
                `lightAutoUpdate=${sh?.autoUpdate} ` +
                `catcher{visible=${this._ground.mesh.visible},mat=${mat?.type ?? 'none'},opacity=${mat?.opacity ?? 'none'}} ` +
                // §CATCHER-CANNOT-WASH-THE-VIEWPORT (L-1940) — the LIVE footprint. A
                // reader can now compute the worst-case painted area directly instead of
                // assuming the constructed 4 km. `size` >> the shadow camera width means
                // the plane still extends past where any shadow information exists.
                `catcherFootprint={cx=${this._ground.footprint.centreX.toFixed(1)},cz=${this._ground.footprint.centreZ.toFixed(1)},` +
                `size=${this._ground.footprint.size.toFixed(1)}m,base=${this._ground.footprint.baseSize}m} ` +
                `casters=${casterCount} ` +
                // §DIAG-GROUND-SHADOW-CASTING-LIGHTS (L-1353) — >1 here means the catcher's
                // transparency is a PRODUCT of that many shadow masks; see the block above.
                `castingLights=${castingLights}[${castingLightNames.join(', ')}]`,
            );
        } catch { /* diagnostics are advisory — never break the caster gate */ }
    }

    /** True while the catcher mesh is attached to the scene (for diagnostics/tests). */
    isGroundCatcherAttached(scene: THREE.Scene | null = this._scene): boolean {
        return !!scene && scene.children.includes(this._ground.mesh);
    }

    // ── Panel bridge (ViewPropertiesSection → runtime.events → here) ──────────

    /** REAL (ephemeris + offset) vs MANUAL (absolute) sun. */
    setSunMode(mode: SunMode): void { this._sun.setMode(mode); }

    /** Azimuth/elevation offsets + intensity multiplier from the panel sliders. */
    setSunOffsets(o: { azimuthDeg?: number; elevationDeg?: number; intensity?: number }): void {
        this._sun.setOffsets(o);
    }

    /** Time-of-day (decimal hours) the sun is solved for. */
    setSunTime(hours: number): void { this._sun.setTime(hours); }

    /**
     * Toggle the invisible L0 ground shadow-catcher (user control). Reversible with
     * NO GPU dispose (ADR-0111 safe). The receiver is attached up front so it stays in
     * the shadow pass and receives the real building shadow (§FIX-SHADOW-CATCHER-RESTORE,
     * L-112); §L-205 gates only its VISIBILITY on caster presence — enabling with an
     * EMPTY scene must NOT paint a cosmetic grey plane, so it shows only once a caster
     * exists; disabling hides it.
     */
    setGroundShadows(enabled: boolean): void {
        this._groundShadowsEnabled = enabled;
        if (!this._scene) return;
        this._applyCatcher();
    }

    /** Tear down: restore the key light, remove + free the catcher. */
    dispose(): void {
        this._sun.dispose();
        this._ground.dispose();
        this._scene = null;
        this._enabled = false;
    }
}
