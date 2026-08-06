/**
 * @file LightingFragmentBuilder.ts
 *
 * THREE.js geometry builder for parametric lighting fixtures.
 *
 * Ceiling-mounted:
 *  downlight          — cylindrical canister (black body, gold inner reflector)
 *  pendant            — slim cylinder hanging from a cable
 *  linear_led         — rectangular bar with emissive LED strip on underside
 *  pendant_pebble     — flat disc/pebble pendant (cream, wide)
 *  pendant_ceramic_bell — ceramic bell pendant (dark-red glaze)
 *  pendant_conical    — conical/UFO wide-brim pendant (cream)
 *
 * Floor-standing:
 *  floor_wood_post    — wooden cross-base post + drum shade
 *  floor_arc_brass    — arched brass rod + marble disc base + dome shade
 *  floor_tripod_black — 3-leg tripod + drum shade (all black)
 *
 * Table/surface:
 *  table_terracotta   — terracotta column body + conical shade
 *
 * Emission (§FEAT-FIXTURE-PHOTOMETRY / §FIX-LIGHT-NIGHT-CONTRIBUTION, 2026-08-06):
 *  Every fixture emits in BOTH day and night. Intensity, colour and reach come
 *  from `@pryzm/core-app-model`'s photometric table — real LUMENS and KELVIN per
 *  fixture family, converted to this scene's candela convention — not from a
 *  single shared magic scalar. Night applies FIXTURE_NIGHT_MULTIPLIER so the
 *  fixtures become the room's key light while the sun/ambient is dimmed.
 *
 *  PREVIOUSLY: a PointLight was added ONLY in night mode, at a flat 1.5 candela
 *  for every family. THREE r165+ removed legacy lighting, so 1.5 cd falls off as
 *  1/d² to an irradiance of 0.24 at 2.5 m — BELOW the scene's own ambient floor
 *  (0.5 ambient + 0.35 hemisphere). A room full of fixtures therefore rendered
 *  black: the fixtures were physically dimmer than the ambient they had to beat.
 *
 *  Cost is bounded by a live-light budget (LiveLightBudget.ts): the N fixtures
 *  nearest the camera get a real PointLight, everything else keeps only its
 *  emissive lens, and N degrades with the SceneQualityTier. Fixture PointLights
 *  never cast shadows — see §NIGHT-ALL-LIGHTS-ON below.
 *
 * Contract compliance:
 *  §01 §4   — builders never mutate stores.
 *  §01 §4.3 — builders called only from initBuilders/engine layer.
 *  §01 §4.5 — geometry disposed on remove().
 *  §03 §1.1 — no `any` in public API.
 */

import * as THREE from '@pryzm/renderer-three/three';
// §FIX-LIGHT-NIGHT-CONTRIBUTION (2026-08-06) — these consts used to come from the
// `@pryzm/core-app-model` ROOT barrel, which reaches them only by a long chain
// (index → stores/index → stores/LightingTypes.js) while this package owns an
// IDENTICAL local copy and `core-app-model/lighting/LightingTypes.ts` owns a
// THIRD. Three divergent copies of the same table is a latent trap, so the
// builder now reads the copy it lives next to. Emission is no longer taken from
// any of them — it comes from the photometric model below.
import {
    LightingData,
    DOWNLIGHT_DEFAULTS,
    PENDANT_DEFAULTS,
    LINEAR_LED_DEFAULTS,
    PENDANT_PEBBLE_DEFAULTS,
    PENDANT_CERAMIC_BELL_DEFAULTS,
    PENDANT_CONICAL_DEFAULTS,
    FLOOR_WOOD_POST_DEFAULTS,
    FLOOR_ARC_BRASS_DEFAULTS,
    TABLE_TERRACOTTA_DEFAULTS,
    FLOOR_TRIPOD_BLACK_DEFAULTS,
    MIRROR_LIGHT_DEFAULTS,
    PENDANT_CLUSTER_DEFAULTS,
} from './LightingTypes.js';
// §FEAT-FIXTURE-PHOTOMETRY — real lumens/kelvin per fixture family, the scene
// candela scale, day/night multipliers, and the bounded live-light budget.
import {
    photometryForFixture,
    sceneIntensityFor,
    lensEmissiveFor,
    kelvinToHex,
    FIXTURE_LIGHT_ROLE,
    selectLiveLights,
    liveLightBudgetForTier,
    type SceneQualityTier,
} from '@pryzm/core-app-model';
import { elementRegistry } from '@pryzm/core-app-model/element-registry';

// ── Shared materials (one per builder instance) ───────────────────────────────

const _matCache = new Map<string, THREE.MeshStandardMaterial>();

function sharedMat(hex: string, opts: Partial<THREE.MeshStandardMaterialParameters> = {}): THREE.MeshStandardMaterial {
    const key = hex + JSON.stringify(opts);
    if (!_matCache.has(key)) {
        _matCache.set(key, new THREE.MeshStandardMaterial({ color: new THREE.Color(hex), ...opts }));
    }
    return _matCache.get(key)!;
}

// ── §LIGHT-LOD-IMPROVE (2026-06-26) — tessellation budget ──────────────────────
//
// Lights are numerous (≥1 ceiling fixture per room + corner floor lamps), so the
// segment counts are tiered rather than maximal. A flat 32–40 everywhere wastes
// triangles on parts no one looks at (thin cables, sockets), while the visible
// bodies and the emissive lenses are where fidelity reads.
//
//   SEG_BODY  (24) — main visible bodies: shade cylinders, cones, canisters,
//                    drum shades. 24 reads round at room distance; the eye can't
//                    pick out facets past ~20 on a 0.1–0.25 m radius part.
//   SEG_LENS  (32) — the emissive lens/diffuser. This is the part the founder
//                    actually looks at ("does it read as a light?"), so it earns
//                    a few more segments + a gentle dome instead of a flat disc.
//   SEG_TRIM  (28) — bezel/trim rings (torus). A faceted ring is the most
//                    obvious "crude" tell, so trims get a notch above bodies.
//   SEG_THIN  (10) — sockets, collars, canopy roses: small but on-axis, so 10
//                    (was 8) kills the visible hexagon without real cost.
//   SEG_CABLE (6)  — hanging cables: ~4–8 mm radius, read as a line; 6 is plenty.
//
// All bodies are capped at 32 — a building with hundreds of fixtures stays light.
// NOTE(future): identical downlights repeat heavily across a plate and are a
// strong GPU-instancing candidate; a later instancing pass (owned by another
// track) can collapse them. Do NOT wire instancing here.
const SEG_BODY  = 24;
const SEG_LENS  = 32;
const SEG_TRIM  = 28;
const SEG_THIN  = 10;
const SEG_CABLE = 6;

/** Warm-white lens tint shared by every fixture's emissive diffuser. */
const LENS_WARM = '#fff8e0';

/**
 * §LIGHT-LOD-IMPROVE — a gently domed emissive lens (spherical cap) that reads
 * as a lit diffuser from any angle, replacing the old flat `CircleGeometry`
 * glow disc. The cap bulges `bulge`× its radius toward the room so it catches a
 * highlight and never looks like a printed sticker.
 *
 * @param radius   lens radius (m)
 * @param tint     hex emissive/diffuse colour (warm/neutral — never brand purple)
 * @param emissive emissive intensity (fixture-tuned)
 * @param bulge    cap depth as a fraction of radius (0 = flat, 0.25 ≈ shallow dome)
 */
/**
 * §FEAT-FIXTURE-PHOTOMETRY — shared emissive-lens materials.
 *
 * `emissiveLens` used to `new THREE.MeshStandardMaterial(...)` on EVERY call, so
 * a plate with 200 fixtures carried 200 unique materials — 200 shader programs
 * and zero instancing potential (this project has already lost instancing that
 * way once). The lens material is now pooled on `tint × quantised emissive`, so
 * all fixtures of a given family share exactly one, and the day/night refresh
 * swaps the material reference rather than mutating a per-element copy.
 */
const _lensMatCache = new Map<string, THREE.MeshStandardMaterial>();

function sharedLensMat(tint: string, emissive: number): THREE.MeshStandardMaterial {
    // Quantise to 0.05 so continuous photometric values collapse onto a small,
    // bounded set of materials instead of one per fixture.
    const q = Math.round(Math.max(0, emissive) * 20) / 20;
    const key = `${tint}|${q}`;
    let mat = _lensMatCache.get(key);
    if (!mat) {
        mat = new THREE.MeshStandardMaterial({
            color: new THREE.Color(tint),
            emissive: new THREE.Color(tint),
            emissiveIntensity: q,
            roughness: 1,
            metalness: 0,
        });
        _lensMatCache.set(key, mat);
    }
    return mat;
}

function emissiveLens(
    radius: number,
    tint: string,
    emissive: number,
    bulge = 0.18,
): THREE.Mesh {
    // Spherical-cap geometry: a sphere of radius R sliced to a shallow dome whose
    // base radius == `radius`. phiLength chosen so sin(phi)*R == radius.
    const depth = Math.max(0.0001, radius * bulge);
    const sphereR = (radius * radius + depth * depth) / (2 * depth);
    const phi = Math.asin(Math.min(1, radius / sphereR));
    const geo = new THREE.SphereGeometry(sphereR, SEG_LENS, Math.max(6, Math.round(SEG_LENS / 3)), 0, Math.PI * 2, 0, phi);
    const mat = sharedLensMat(tint, emissive);
    // The default cap apex is at +Y; lights face DOWN into the room, so flip it
    // so the dome bulges toward −Y. After the flip the apex sits at −depth and
    // the base ring at local Y=0 (the fixture mouth), matching the old flat-disc
    // placement the callers already use.
    geo.rotateX(Math.PI);
    geo.translate(0, sphereR - depth, 0);
    const mesh = new THREE.Mesh(geo, mat);
    tagLens(mesh, tint, emissive);
    return mesh;
}

/**
 * §FEAT-FIXTURE-PHOTOMETRY — mark a mesh as the fixture's LENS and remember the
 * AUTHORED (shape-relative) emissive so `_syncLens` can re-scale it by the
 * fixture's photometric lens factor and the day/night state.
 *
 * The lens is what makes a fixture read as switched-on, and it is what a fixture
 * that loses the live-light budget still has — so every family must have one.
 */
export const LENS_ROLE = 'lighting.lens';

function tagLens(mesh: THREE.Mesh, tint: string, authoredEmissive: number): void {
    mesh.userData.role      = LENS_ROLE;
    mesh.userData.lensTint  = tint;
    mesh.userData.lensBase  = authoredEmissive;
}

// ── Builder ───────────────────────────────────────────────────────────────────

export class LightingFragmentBuilder {

    /** scene root → fixture group */
    private readonly _roots = new Map<string, THREE.Group>();

    /** id → point/spot light node (set only in night mode) */
    private readonly _lights = new Map<string, THREE.Light>();

    private _scene: THREE.Object3D | null = null;
    private _isNight = false;

    /**
     * §FEAT-FIXTURE-PHOTOMETRY — current render tier, driving the live-light
     * budget. `undefined` until the pipeline reports one (cold start uses
     * DEFAULT_LIVE_LIGHT_BUDGET).
     */
    private _tier: SceneQualityTier | undefined;

    /**
     * §FEAT-FIXTURE-PHOTOMETRY — importance origin for the live-light budget.
     * Normally the camera position. Defaults to the world origin, which still
     * yields a deterministic (if arbitrary) ordering, so the budget is never
     * undefined behaviour.
     */
    private _focusProvider: (() => { x: number; y: number; z: number }) | null = null;

    /** F.events.14 — unsub handle for bam:day-night-changed runtime.events listener. */
    private _unsubDayNight: (() => void) | undefined;

    constructor() {
        // F.events.14 — bam:day-night-changed migrated from DOM CustomEvent to runtime.events.
        // §P4 — `window.runtime` is a TYPED global (src/global-window.d.ts); the old
        // `(window as any).runtime` cast was a P4 violation and hid the null case.
        this._unsubDayNight = window.runtime?.events?.on(
            'bam:day-night-changed',
            ({ mode }: { mode: 'day' | 'night' }) => {
                this.setDayNight(mode);
            },
        );
    }

    // ── §FIX-LIGHT-NIGHT-CONTRIBUTION — day/night + budget control surface ─────

    /**
     * Set day or night. Fixtures emit in BOTH modes — night only makes them
     * brighter (FIXTURE_NIGHT_MULTIPLIER) while the scene's sun/ambient is dimmed
     * elsewhere, so a fixture reads as ON at noon and DOMINANT after dark.
     *
     * Idempotent, and safe to call before `setScene`.
     */
    setDayNight(mode: 'day' | 'night'): void {
        const next = mode === 'night';
        if (next === this._isNight && this._lights.size > 0) return;
        this._isNight = next;
        this._syncAllLights();
    }

    /** True when the builder is emitting night-mode intensities. */
    get isNight(): boolean { return this._isNight; }

    /**
     * §FEAT-FIXTURE-PHOTOMETRY — report the current render tier so the live-light
     * budget degrades with scene weight (C04 §3.5 / ADR-006).
     */
    setQualityTier(tier: SceneQualityTier): void {
        if (tier === this._tier) return;
        this._tier = tier;
        this._syncAllLights();
    }

    /**
     * §FEAT-FIXTURE-PHOTOMETRY — supply the importance origin (normally the
     * camera). Fixtures nearest this point win the live-light budget.
     */
    setFocusProvider(fn: () => { x: number; y: number; z: number }): void {
        this._focusProvider = fn;
    }

    /** The live-light budget currently in force. */
    get liveLightBudget(): number { return liveLightBudgetForTier(this._tier); }

    /** Number of fixtures that currently own a real THREE light. */
    get liveLightCount(): number { return this._lights.size; }

    /** Call once after THREE.Scene is available. */
    setScene(scene: THREE.Object3D): void {
        this._scene = scene;
    }

    // ── Public API ────────────────────────────────────────────────────────────

    add(data: LightingData): void {
        // §57 Day 5 (DAILY-USE 2026-05-21, Round 34) — capture _priorVersion
        // BEFORE remove() nukes the _roots-map entry. Same Round 19 column
        // capture-then-stamp pattern. Defaults to 0 for the first add.
        const _priorVersion: number =
            (this._roots.get(data.id)?.userData?.version as number | undefined) ?? 0;

        if (this._roots.has(data.id)) this.remove(data.id);

        const group = this._buildFixture(data);

        // §FEAT-ELEMENT-TYPE-PICKER-REGISTRY — `enumerable: true` is LOad-BEARING.
        //
        // `Object.defineProperties` defaults `enumerable` to FALSE. These three keys
        // were therefore non-enumerable own properties of `userData`, and the property
        // panel copies the selection with a SPREAD (`{ ...rawData }`, see
        // PropertyPanelStoreEnricher) — which copies enumerable properties only. So
        // `id`, `elementType` and `fixtureType` were silently dropped on the way into
        // the panel: the IDENTITY section rendered "Element ID —" and "Element Type —"
        // (the founder's lighting screenshot), the descriptor generator fell back to
        // the unknown-element schema, and a type picker could not have dispatched a
        // valid `element.changeType` because `elementData.id` was undefined.
        //
        // Every other fragment builder avoids this either by passing `enumerable: true`
        // explicitly (RoofFragmentBuilder, WallFragmentBuilder) or by freezing keys that
        // were already ASSIGNED (Beam/Column/Slab/Furniture), which keeps them
        // enumerable. Lighting was the only builder creating them fresh without the
        // flag. `writable: false` — the actual intent, protecting identity from later
        // mutation — is unaffected.
        Object.defineProperties(group.userData, {
            id:          { value: data.id,            writable: false, configurable: false, enumerable: true },
            elementType: { value: 'Lighting',          writable: false, configurable: false, enumerable: true },
            fixtureType: { value: data.fixtureType,    writable: false, configurable: false, enumerable: true },
        });
        group.userData.selectable = true;
        group.userData.levelId    = data.levelId;
        group.userData.layerName  = 'A-LGHT';
        // §57 Day 5 — monotonic per-build counter for NMEexporter cache
        // invalidation. Writable so subsequent calls bump it.
        group.userData.version    = _priorVersion + 1;

        const { x, y, z } = data.position;
        group.position.set(x, y, z);
        if (data.rotation) {
            group.rotation.set(data.rotation.x, data.rotation.y, data.rotation.z, data.rotation.order as THREE.EulerOrder ?? 'XYZ');
        }

        // Mark every child mesh as a sub-element so selection can traverse up to the root
        group.traverse((child: THREE.Object3D) => {
            if (child === group) return;
            if ((child as THREE.Mesh).isMesh || (child as THREE.Light).isLight) {
                child.userData.isSubElement = true;
                child.userData.parentId     = data.id;
                child.userData.elementType  = 'Lighting';
            }
        });

        this._roots.set(data.id, group);
        if (this._scene) this._scene.add(group);

        elementRegistry.registerRoot(data.id, group);

        // §FIX-LIGHT-NIGHT-CONTRIBUTION — fixtures emit in BOTH day and night
        // (they were night-only, so a lit room at noon was impossible). Re-run
        // the whole budget rather than blindly attaching: adding the 65th fixture
        // must be able to displace a farther one, not overflow the budget.
        this._requestSync();
    }

    /**
     * Coalesce budget reconciliation to one pass per microtask.
     *
     * `_syncAllLights` is O(n log n) over every placed fixture, and the AI
     * layout executors add fixtures in tight loops (see the `*.batch.create`
     * pattern) — calling it per `add()` would be O(n² log n) on a 200-fixture
     * plate. P3-safe: a microtask, never a rAF.
     */
    private _syncQueued = false;
    private _requestSync(): void {
        if (this._syncQueued) return;
        this._syncQueued = true;
        queueMicrotask(() => {
            this._syncQueued = false;
            this._syncAllLights();
        });
    }

    remove(id: string): void {
        const group = this._roots.get(id);
        if (!group) return;
        this._detachLight(id, group);
        if (this._scene) this._scene.remove(group);
        group.traverse((obj: THREE.Object3D) => {
            if ((obj as THREE.Mesh).isMesh) {
                const mesh = obj as THREE.Mesh;
                if (!Array.isArray(mesh.geometry)) mesh.geometry.dispose();
            }
        });
        elementRegistry.unregisterRoot(id);
        this._roots.delete(id);
        // A freed budget slot must be reclaimed by the next-nearest dark fixture.
        this._requestSync();
    }

    /**
     * §FEAT-FIXTURE-PHOTOMETRY — flush the coalesced budget reconciliation now.
     * Called by tests and by any caller that needs the scene graph settled
     * synchronously (e.g. an export or a screenshot pass).
     */
    syncLights(): void {
        this._syncQueued = false;
        this._syncAllLights();
    }

    update(data: LightingData): void {
        this.remove(data.id);
        this.add(data);
    }

    // ── Geometry builders ─────────────────────────────────────────────────────

    private _buildFixture(data: LightingData): THREE.Group {
        switch (data.fixtureType) {
            case 'downlight':            return this._buildDownlight(data);
            case 'pendant':              return this._buildPendant(data);
            case 'linear_led':           return this._buildLinearLed(data);
            case 'pendant_pebble':       return this._buildPendantPebble(data);
            case 'pendant_ceramic_bell': return this._buildPendantCeramicBell(data);
            case 'pendant_conical':      return this._buildPendantConical(data);
            case 'floor_wood_post':      return this._buildFloorWoodPost(data);
            case 'floor_arc_brass':      return this._buildFloorArcBrass(data);
            case 'table_terracotta':     return this._buildTableTerracotta(data);
            case 'floor_tripod_black':   return this._buildFloorTripodBlack(data);
            case 'mirror_light':         return this._buildMirrorLight(data);
            case 'pendant_cluster':      return this._buildPendantCluster(data);
            default:                     return this._buildDownlight(data);
        }
    }

    /**
     * F1.15 (2026-05-30) — Pendant cluster: central canopy disc at the
     * ceiling carrying N slim cylindrical pendants on staggered cables.
     *
     * Geometry layout (Y=0 is the ceiling underside, descending into the
     * room with negative Y):
     *   - canopy disc at Y ≈ -canopyHeight/2 (top face flush with ceiling)
     *   - N pendants on a horizontal circle of radius clusterRadius,
     *     each on a cable interpolated minCableLen…maxCableLen
     *   - each pendant: short cylinder body + emissive bottom glow disc
     *
     * Cable lengths sweep linearly across the count so the cluster reads
     * 3D from any angle; the staggering is deterministic in pendant order.
     */
    private _buildPendantCluster(data: LightingData): THREE.Group {
        const p = { ...PENDANT_CLUSTER_DEFAULTS, ...data.pendantClusterParams };
        const group = new THREE.Group();

        const count = Math.max(2, Math.min(7, Math.round(p.count)));

        // Central canopy disc at the ceiling.
        const canopyMat = sharedMat(p.canopyColor, { roughness: 0.55, metalness: 0.4 });
        const canopyGeo = new THREE.CylinderGeometry(p.canopyRadius, p.canopyRadius, p.canopyHeight, SEG_TRIM);
        const canopy = new THREE.Mesh(canopyGeo, canopyMat);
        canopy.position.y = -(p.canopyHeight / 2);
        canopy.castShadow = true;
        group.add(canopy);

        const cableMat = sharedMat('#222222', { roughness: 0.9, metalness: 0.1 });
        const bodyMat  = sharedMat(p.pendantColor, { roughness: 0.30, metalness: 0.75 });

        // N pendants on a circle, with cable lengths interpolated linearly.
        for (let i = 0; i < count; i++) {
            const angle = (i / count) * Math.PI * 2;
            const px = Math.cos(angle) * p.clusterRadius;
            const pz = Math.sin(angle) * p.clusterRadius;

            // Cable length: linear sweep min → max across the ring.
            const t        = count === 1 ? 0 : i / (count - 1);
            const cableLen = p.minCableLen + (p.maxCableLen - p.minCableLen) * t;

            // Cable (thin black cylinder hanging straight down).
            const cableGeo = new THREE.CylinderGeometry(0.004, 0.004, cableLen, SEG_CABLE);
            const cable = new THREE.Mesh(cableGeo, cableMat);
            cable.position.set(px, -p.canopyHeight - cableLen / 2, pz);
            group.add(cable);

            // Sub-pendant body — slim brass cylinder.
            const bodyY = -p.canopyHeight - cableLen - p.pendantHeight / 2;
            const bodyGeo = new THREE.CylinderGeometry(p.pendantRadius, p.pendantRadius, p.pendantHeight, SEG_BODY, 1, true);
            const body = new THREE.Mesh(bodyGeo, bodyMat);
            body.position.set(px, bodyY, pz);
            body.castShadow = true;
            group.add(body);

            // Top cap so the cylinder reads as closed at the top.
            const topGeo = new THREE.CircleGeometry(p.pendantRadius, SEG_BODY);
            const topMesh = new THREE.Mesh(topGeo, bodyMat);
            topMesh.rotation.x = -Math.PI / 2;
            topMesh.position.set(px, bodyY + p.pendantHeight / 2, pz);
            group.add(topMesh);

            // §LIGHT-LOD-IMPROVE — domed warm lens at each sub-pendant (was flat disc).
            const glow = emissiveLens(p.pendantRadius * 0.85, LENS_WARM, 0.7, 0.2);
            glow.position.set(px, bodyY - p.pendantHeight / 2 + 0.002, pz);
            group.add(glow);
        }

        return group;
    }

    /**
     * F1.5' (2026-05-30) — Mirror light: wall-mounted slim bar above the
     * bathroom mirror. Horizontal slab oriented along +X (the wall), with
     * an emissive front face that lights the user at the vanity. The
     * archetype places it above the bathroom_mirror; the rotation is
     * applied at the group level so the front face points into the room.
     *
     * Body is matte brushed steel; the front face inset (LED strip)
     * carries the emissive material for soft front lighting.
     */
    private _buildMirrorLight(data: LightingData): THREE.Group {
        const p = { ...MIRROR_LIGHT_DEFAULTS, ...data.mirrorLightParams };
        const group = new THREE.Group();

        // Bar body — brushed steel.
        const bodyGeo = new THREE.BoxGeometry(p.width, p.height, p.depth);
        const bodyMat = sharedMat(p.bodyColor, { roughness: 0.45, metalness: 0.6 });
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        body.position.set(0, 0, p.depth / 2);     // back face flush with the wall plane
        body.castShadow = true;
        group.add(body);

        // Emissive LED strip on the front face.
        const ledW = p.width * 0.92;
        const ledH = p.height * 0.55;
        const ledGeo = new THREE.BoxGeometry(ledW, ledH, p.depth * 0.4);
        // §FEAT-FIXTURE-PHOTOMETRY — pooled + lens-tagged so the vanity bar
        // brightens at night like every other family (was a unique material at a
        // fixed 1.0, and mirror_light had no point light at all).
        const led = new THREE.Mesh(ledGeo, sharedLensMat(p.ledColor, 1.0));
        tagLens(led, p.ledColor, 1.0);
        led.position.set(0, 0, p.depth + p.depth * 0.2 - p.depth * 0.4 / 2);
        group.add(led);

        return group;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Existing ceiling-mounted fixtures
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Downlight — surface-mounted cylindrical canister.
     * Body: dark matte cylinder. Interior: gold metallic reflector cap.
     * Positioned with top face at Y=0 (flush with ceiling underside).
     */
    private _buildDownlight(data: LightingData): THREE.Group {
        const p = { ...DOWNLIGHT_DEFAULTS, ...data.downlightParams };
        const group = new THREE.Group();

        // §LIGHT-LOD-IMPROVE — a real surface-downlight reads as: canister body +
        // a recessed reflector cone + a bright domed lens behind a slim outer
        // trim bezel. Previously this was just a black can + a flat emissive
        // disc, which is the crudest of the lot since it is also the most placed.
        const bodyGeo = new THREE.CylinderGeometry(p.radius, p.radius * 0.96, p.height, SEG_BODY, 1, false);
        const bodyMat = sharedMat(p.color, { roughness: 0.7, metalness: 0.2 });
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        body.position.y = -(p.height / 2);
        body.castShadow = true;
        group.add(body);

        // Recessed gold reflector cone (open downward) — gives the bezel depth.
        const reflR = p.radius * 0.78;
        const reflGeo = new THREE.CylinderGeometry(reflR, reflR * 0.55, p.height * 0.6, SEG_BODY, 1, true);
        const reflMat = sharedMat(p.goldColor, { roughness: 0.12, metalness: 0.9, side: THREE.BackSide });
        const refl = new THREE.Mesh(reflGeo, reflMat);
        refl.position.y = -p.height + p.height * 0.3 + 0.004;
        group.add(refl);

        // Outer trim bezel — a thin torus ring at the mouth. A faceted ring is
        // the most obvious "low-poly" tell, so it gets SEG_TRIM.
        const bezelGeo = new THREE.TorusGeometry(p.radius * 0.92, p.radius * 0.10, 8, SEG_TRIM);
        const bezelMat = sharedMat('#3a3a3a', { roughness: 0.55, metalness: 0.5 });
        const bezel = new THREE.Mesh(bezelGeo, bezelMat);
        bezel.rotation.x = Math.PI / 2;
        bezel.position.y = -p.height + 0.002;
        group.add(bezel);

        // Domed emissive lens behind the bezel.
        const lens = emissiveLens(reflR * 0.62, LENS_WARM, 0.7, 0.22);
        lens.position.y = -p.height + p.height * 0.10;
        group.add(lens);

        return group;
    }

    /**
     * Pendant — slim cylinder hanging from a braided cable.
     */
    private _buildPendant(data: LightingData): THREE.Group {
        const p = { ...PENDANT_DEFAULTS, ...data.pendantParams };
        const group = new THREE.Group();

        const cableGeo = new THREE.CylinderGeometry(0.004, 0.004, p.cableLen, SEG_CABLE);
        const cableMat = sharedMat('#888888', { roughness: 0.8, metalness: 0.3 });
        const cable = new THREE.Mesh(cableGeo, cableMat);
        cable.position.y = -(p.cableLen / 2);
        group.add(cable);

        const roseGeo = new THREE.CylinderGeometry(0.018, 0.018, 0.012, SEG_THIN);
        const roseMat = sharedMat('#cccccc', { roughness: 0.4, metalness: 0.5 });
        const rose = new THREE.Mesh(roseGeo, roseMat);
        rose.position.y = -0.006;
        group.add(rose);

        const bodyY = -(p.cableLen + p.height / 2);
        const bodyGeo = new THREE.CylinderGeometry(p.radius, p.radius, p.height, SEG_BODY, 1, true);
        const bodyMat = sharedMat(p.color, { roughness: 0.6, metalness: 0.1, side: THREE.FrontSide });
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        body.position.y = bodyY;
        body.castShadow = true;
        group.add(body);

        const topGeo = new THREE.CircleGeometry(p.radius, SEG_BODY);
        const topMesh = new THREE.Mesh(topGeo, bodyMat);
        topMesh.rotation.x = -Math.PI / 2;
        topMesh.position.y = bodyY + p.height / 2;
        group.add(topMesh);

        const innerR = p.radius * 0.8;
        const innerGeo = new THREE.RingGeometry(innerR * 0.7, innerR, SEG_BODY);
        const innerMat = new THREE.MeshStandardMaterial({
            color: new THREE.Color('#c8a000'),
            emissive: new THREE.Color('#c8a000'),
            emissiveIntensity: 0.3,
            roughness: 0.2, metalness: 0.8,
            side: THREE.DoubleSide,
        });
        const inner = new THREE.Mesh(innerGeo, innerMat);
        inner.rotation.x = Math.PI / 2;
        inner.position.y = bodyY - p.height / 2 + 0.01;
        group.add(inner);

        // §LIGHT-LOD-IMPROVE — domed warm lens at the mouth (was a flat disc).
        const glow = emissiveLens(p.radius * 0.5, LENS_WARM, 0.5, 0.2);
        glow.position.y = bodyY - p.height / 2 + 0.002;
        group.add(glow);

        return group;
    }

    /**
     * Linear LED — rectangular bar pendant hanging from two cables.
     */
    private _buildLinearLed(data: LightingData): THREE.Group {
        const p = { ...LINEAR_LED_DEFAULTS, ...data.linearLedParams };
        const group = new THREE.Group();

        const barY = -(p.cableLen + p.height / 2);

        const cableGeo = new THREE.CylinderGeometry(0.003, 0.003, p.cableLen, 8);
        const cableMat = sharedMat('#555555', { roughness: 0.8, metalness: 0.4 });
        const cableL = new THREE.Mesh(cableGeo, cableMat);
        cableL.position.set(-p.length / 2 + 0.04, -(p.cableLen / 2), 0);
        group.add(cableL);

        const cableR = new THREE.Mesh(cableGeo, cableMat);
        cableR.position.set( p.length / 2 - 0.04, -(p.cableLen / 2), 0);
        group.add(cableR);

        const roseGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.010, 12);
        const roseMat = sharedMat('#333333', { roughness: 0.5, metalness: 0.6 });

        const roseL = new THREE.Mesh(roseGeo, roseMat);
        roseL.position.set(-p.length / 2 + 0.04, -0.005, 0);
        group.add(roseL);

        const roseR = new THREE.Mesh(roseGeo, roseMat);
        roseR.position.set( p.length / 2 - 0.04, -0.005, 0);
        group.add(roseR);

        const barGeo = new THREE.BoxGeometry(p.length, p.height, p.width);
        const barMat = sharedMat(p.color, { roughness: 0.4, metalness: 0.5 });
        const bar = new THREE.Mesh(barGeo, barMat);
        bar.position.y = barY;
        bar.castShadow = true;
        group.add(bar);

        const ledGeo = new THREE.PlaneGeometry(p.length - 0.01, p.width * 0.6);
        // §FEAT-FIXTURE-PHOTOMETRY — pooled + lens-tagged (was a unique material).
        const led = new THREE.Mesh(ledGeo, sharedLensMat(p.ledColor, 1.0));
        tagLens(led, p.ledColor, 1.0);
        led.rotation.x = Math.PI / 2;
        led.position.y = barY - p.height / 2 - 0.001;
        group.add(led);

        return group;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // New pendant types (ceiling-hung)
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Pendant Pebble — wide flat disc/pebble shape in cream/beige.
     * Mimics a squashed cushion pendant. Ceiling attachment at Y=0.
     */
    private _buildPendantPebble(data: LightingData): THREE.Group {
        const p = { ...PENDANT_PEBBLE_DEFAULTS, ...data.pendantPebbleParams };
        const group = new THREE.Group();

        // Cable (single black cord)
        const cableGeo = new THREE.CylinderGeometry(0.005, 0.005, p.cableLen, 8);
        const cableMat = sharedMat('#222222', { roughness: 0.9, metalness: 0.1 });
        const cable = new THREE.Mesh(cableGeo, cableMat);
        cable.position.y = -(p.cableLen / 2);
        group.add(cable);

        // Canopy rose at ceiling
        const roseGeo = new THREE.CylinderGeometry(0.022, 0.022, 0.014, 20);
        const roseMat = sharedMat('#333333', { roughness: 0.5, metalness: 0.6 });
        const rose = new THREE.Mesh(roseGeo, roseMat);
        rose.position.y = -0.007;
        group.add(rose);

        // Socket/connector between cable and shade
        const sockY = -(p.cableLen);
        const sockGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.035, 16);
        const sockMat = sharedMat('#333333', { roughness: 0.5, metalness: 0.7 });
        const sock = new THREE.Mesh(sockGeo, sockMat);
        sock.position.y = sockY - 0.0175;
        group.add(sock);

        // Pebble shade body — use a lathed disc profile for the squashed shape
        const shadeY = -(p.cableLen + 0.035 + p.height / 2);
        const shadeMat = sharedMat(p.color, { roughness: 0.55, metalness: 0.0 });

        // Top rounded cap
        const topGeo = new THREE.SphereGeometry(p.radius, SEG_BODY, 12, 0, Math.PI * 2, 0, Math.PI / 2);
        const top = new THREE.Mesh(topGeo, shadeMat);
        top.position.y = shadeY + p.height * 0.1;
        top.scale.set(1, p.height / (p.radius * 0.8), 1);
        top.castShadow = true;
        group.add(top);

        // Bottom rounded cap (inverted)
        const botGeo = new THREE.SphereGeometry(p.radius, SEG_BODY, 12, 0, Math.PI * 2, 0, Math.PI / 2);
        const bot = new THREE.Mesh(botGeo, shadeMat);
        bot.rotation.x = Math.PI;
        bot.position.y = shadeY - p.height * 0.1;
        bot.scale.set(1, p.height / (p.radius * 0.8), 1);
        bot.castShadow = true;
        group.add(bot);

        // §LIGHT-LOD-IMPROVE — domed warm lens at bottom opening (was flat disc).
        const glow = emissiveLens(p.radius * 0.45, LENS_WARM, 0.55, 0.16);
        glow.position.y = shadeY - p.height * 0.1 - 0.002;
        group.add(glow);

        return group;
    }

    /**
     * Pendant Ceramic Bell — dark-red glazed ceramic bell.
     * Bell widens toward the open bottom, open at base.
     * Ceiling attachment at Y=0.
     */
    private _buildPendantCeramicBell(data: LightingData): THREE.Group {
        const p = { ...PENDANT_CERAMIC_BELL_DEFAULTS, ...data.pendantCeramicBellParams };
        const group = new THREE.Group();

        // Single black cord cable
        const cableGeo = new THREE.CylinderGeometry(0.004, 0.004, p.cableLen, 8);
        const cableMat = sharedMat('#1a1a1a', { roughness: 0.9, metalness: 0.1 });
        const cable = new THREE.Mesh(cableGeo, cableMat);
        cable.position.y = -(p.cableLen / 2);
        group.add(cable);

        // Small socket/ferrule connecting cable to ceramic
        const sockGeo = new THREE.CylinderGeometry(0.020, 0.020, 0.025, 14);
        const sockMat = sharedMat('#1a1a1a', { roughness: 0.5, metalness: 0.8 });
        const sock = new THREE.Mesh(sockGeo, sockMat);
        sock.position.y = -(p.cableLen) - 0.0125;
        group.add(sock);

        // Bell body — open-bottom cone/cylinder with organic profile
        const bellY = -(p.cableLen + 0.025 + p.height / 2);
        const bellGeo = new THREE.CylinderGeometry(p.botRadius, p.topRadius, p.height, SEG_BODY, 2, true);
        const bellMat = sharedMat(p.color, { roughness: 0.15, metalness: 0.05 });
        const bell = new THREE.Mesh(bellGeo, bellMat);
        bell.position.y = bellY;
        bell.castShadow = true;
        group.add(bell);

        // Top cap (closed at top)
        const topGeo = new THREE.CircleGeometry(p.topRadius, 24);
        const topMesh = new THREE.Mesh(topGeo, bellMat);
        topMesh.rotation.x = -Math.PI / 2;
        topMesh.position.y = bellY + p.height / 2;
        group.add(topMesh);

        // Rim detail at bottom — thin white inner lip
        const rimGeo = new THREE.TorusGeometry(p.botRadius, 0.006, 8, SEG_TRIM);
        const rimMat = sharedMat(p.innerColor, { roughness: 0.4, metalness: 0.1 });
        const rim = new THREE.Mesh(rimGeo, rimMat);
        rim.position.y = bellY - p.height / 2;
        group.add(rim);

        // Exposed bulb visible through opening
        const bulbGeo = new THREE.SphereGeometry(0.038, 16, 12);
        // §FEAT-FIXTURE-PHOTOMETRY — pooled + lens-tagged (was a unique material).
        const bulb = new THREE.Mesh(bulbGeo, sharedLensMat(LENS_WARM, 0.8));
        tagLens(bulb, LENS_WARM, 0.8);
        bulb.position.y = bellY - p.height / 2 + 0.005;
        group.add(bulb);

        return group;
    }

    /**
     * Pendant Conical — wide UFO/conical form with flat top and wide brim.
     * Cream/beige matte ceramic appearance. Ceiling attachment at Y=0.
     */
    private _buildPendantConical(data: LightingData): THREE.Group {
        const p = { ...PENDANT_CONICAL_DEFAULTS, ...data.pendantConicalParams };
        const group = new THREE.Group();

        // Single cable
        const cableGeo = new THREE.CylinderGeometry(0.004, 0.004, p.cableLen, 8);
        const cableMat = sharedMat('#1a1a1a', { roughness: 0.9, metalness: 0.1 });
        const cable = new THREE.Mesh(cableGeo, cableMat);
        cable.position.y = -(p.cableLen / 2);
        group.add(cable);

        // Small hardware connector
        const connGeo = new THREE.CylinderGeometry(0.030, 0.030, 0.030, 16);
        const connMat = sharedMat('#888888', { roughness: 0.4, metalness: 0.7 });
        const conn = new THREE.Mesh(connGeo, connMat);
        conn.position.y = -(p.cableLen) - 0.015;
        group.add(conn);

        // Conical shade body
        const shadeY = -(p.cableLen + 0.030 + p.height / 2);
        const shadeMat = sharedMat(p.color, { roughness: 0.65, metalness: 0.0 });

        // Main cone — wide at bottom, narrow at top
        const coneGeo = new THREE.CylinderGeometry(p.topRadius, p.botRadius, p.height, SEG_BODY, 1, true);
        const cone = new THREE.Mesh(coneGeo, shadeMat);
        cone.position.y = shadeY;
        cone.castShadow = true;
        group.add(cone);

        // Flat top cap
        const topGeo = new THREE.CircleGeometry(p.topRadius, SEG_BODY);
        const topCap = new THREE.Mesh(topGeo, shadeMat);
        topCap.rotation.x = -Math.PI / 2;
        topCap.position.y = shadeY + p.height / 2;
        group.add(topCap);

        // Inner shadow at top near connector
        const innerTopGeo = new THREE.CylinderGeometry(p.topRadius * 0.85, p.topRadius * 0.85, 0.015, 20);
        const innerTopMat = sharedMat('#888880', { roughness: 0.8, metalness: 0.3 });
        const innerTop = new THREE.Mesh(innerTopGeo, innerTopMat);
        innerTop.position.y = shadeY + p.height / 2 - 0.008;
        group.add(innerTop);

        // Bottom rim ring (slight thickness detail)
        const rimGeo = new THREE.TorusGeometry(p.botRadius, 0.007, 8, SEG_TRIM);
        const rim = new THREE.Mesh(rimGeo, shadeMat);
        rim.position.y = shadeY - p.height / 2;
        group.add(rim);

        // §LIGHT-LOD-IMPROVE — domed warm lens inside the brim (was flat disc).
        const glow = emissiveLens(p.botRadius * 0.55, LENS_WARM, 0.5, 0.14);
        glow.position.y = shadeY - p.height / 2 + 0.002;
        group.add(glow);

        return group;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Floor-standing fixtures (Y=0 is floor level; lamp rises upward)
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Floor Wood Post — wooden post with cross base, drum shade at top.
     * Y=0 is floor surface. Post rises to postHeight.
     */
    private _buildFloorWoodPost(data: LightingData): THREE.Group {
        const p = { ...FLOOR_WOOD_POST_DEFAULTS, ...data.floorWoodPostParams };
        const group = new THREE.Group();

        const woodMat = sharedMat(p.postColor, { roughness: 0.8, metalness: 0.0 });

        // Cross base — two planks perpendicular
        const baseGeo = new THREE.BoxGeometry(0.55, 0.04, 0.08);
        const baseA = new THREE.Mesh(baseGeo, woodMat);
        baseA.position.y = 0.02;
        group.add(baseA);

        const baseB = new THREE.Mesh(baseGeo, woodMat);
        baseB.rotation.y = Math.PI / 2;
        baseB.position.y = 0.02;
        group.add(baseB);

        // Central vertical post (two-plank cross-section)
        const postW = 0.048;
        const postD = 0.022;
        const postGeoA = new THREE.BoxGeometry(postW, p.postHeight, postD);
        const postA = new THREE.Mesh(postGeoA, woodMat);
        postA.position.y = p.postHeight / 2 + 0.04;
        postA.castShadow = true;
        group.add(postA);

        const postGeoB = new THREE.BoxGeometry(postD, p.postHeight, postW);
        const postB = new THREE.Mesh(postGeoB, woodMat);
        postB.position.y = p.postHeight / 2 + 0.04;
        postB.castShadow = true;
        group.add(postB);

        // Mid-height band / joiner
        const bandGeo = new THREE.BoxGeometry(0.06, 0.02, 0.06);
        const band = new THREE.Mesh(bandGeo, sharedMat('#c0a080', { roughness: 0.6, metalness: 0.2 }));
        band.position.y = p.postHeight * 0.5 + 0.04;
        group.add(band);

        // Drum shade
        const shadeY = p.postHeight + 0.04 + p.shadeHeight / 2;
        const shadeMat = sharedMat(p.shadeColor, { roughness: 0.8, metalness: 0.0, side: THREE.DoubleSide });

        const outerGeo = new THREE.CylinderGeometry(p.shadeRadius, p.shadeRadius, p.shadeHeight, SEG_BODY, 1, true);
        const outer = new THREE.Mesh(outerGeo, shadeMat);
        outer.position.y = shadeY;
        outer.castShadow = true;
        group.add(outer);

        const topCapGeo = new THREE.CircleGeometry(p.shadeRadius, SEG_BODY);
        const topCap = new THREE.Mesh(topCapGeo, shadeMat);
        topCap.rotation.x = -Math.PI / 2;
        topCap.position.y = shadeY + p.shadeHeight / 2;
        group.add(topCap);

        // §LIGHT-LOD-IMPROVE — domed warm lens at the shade opening (was flat disc).
        const glow = emissiveLens(p.shadeRadius * 0.6, LENS_WARM, 0.45, 0.12);
        glow.position.y = shadeY - p.shadeHeight / 2 + 0.005;
        group.add(glow);

        return group;
    }

    /**
     * Floor Arc Brass — tall arc lamp with brass rod, marble disc base, dome shade.
     * Y=0 is floor. The vertical stem rises then arcs horizontally.
     */
    private _buildFloorArcBrass(data: LightingData): THREE.Group {
        const p = { ...FLOOR_ARC_BRASS_DEFAULTS, ...data.floorArcBrassParams };
        const group = new THREE.Group();

        const brassMat = sharedMat(p.color, { roughness: 0.25, metalness: 0.85 });

        // Marble disc base
        const baseGeo = new THREE.CylinderGeometry(p.baseRadius, p.baseRadius, 0.055, 40);
        const baseMat = sharedMat('#f0eeea', { roughness: 0.4, metalness: 0.0 });
        const base = new THREE.Mesh(baseGeo, baseMat);
        base.position.y = 0.0275;
        group.add(base);

        // Thin vertical rod from base up to arc apex
        const rodGeo = new THREE.CylinderGeometry(0.012, 0.012, p.postHeight, 12);
        const rod = new THREE.Mesh(rodGeo, brassMat);
        rod.position.y = p.postHeight / 2 + 0.055;
        rod.castShadow = true;
        group.add(rod);

        // Horizontal arm at top (arc approximated as a tilted thin cylinder)
        const armLen = p.arcRadius;
        const armGeo = new THREE.CylinderGeometry(0.009, 0.009, armLen, 10);
        const arm = new THREE.Mesh(armGeo, brassMat);
        // Rotate 90° to make horizontal, offset to extend outward
        arm.rotation.z = Math.PI / 2;
        arm.position.set(armLen / 2, p.postHeight + 0.055, 0);
        group.add(arm);

        // Shade dome — hemisphere facing downward at end of arm
        const shadeY = p.postHeight + 0.055;
        const domeGeo = new THREE.SphereGeometry(p.shadeRadius, SEG_BODY, 16, 0, Math.PI * 2, 0, Math.PI / 2);
        const domeMat = sharedMat(p.color, { roughness: 0.2, metalness: 0.9, side: THREE.DoubleSide });
        const dome = new THREE.Mesh(domeGeo, domeMat);
        dome.rotation.x = Math.PI; // open face downward
        dome.position.set(armLen, shadeY, 0);
        dome.castShadow = true;
        group.add(dome);

        // Small brass collar joining rod to arm
        const collarGeo = new THREE.CylinderGeometry(0.020, 0.020, 0.025, 14);
        const collar = new THREE.Mesh(collarGeo, brassMat);
        collar.position.y = p.postHeight + 0.055;
        group.add(collar);

        // §LIGHT-LOD-IMPROVE — domed warm lens under the dome (was flat disc).
        const glow = emissiveLens(p.shadeRadius * 0.65, '#fff3d0', 0.5, 0.15);
        glow.position.set(armLen, shadeY - p.shadeRadius * 0.1, 0);
        group.add(glow);

        return group;
    }

    /**
     * Table Terracotta — terracotta bullet/column body + cream conical shade.
     * Y=0 is the tabletop surface. Lamp rises upward.
     */
    private _buildTableTerracotta(data: LightingData): THREE.Group {
        const p = { ...TABLE_TERRACOTTA_DEFAULTS, ...data.tableTerracottaParams };
        const group = new THREE.Group();

        const bodyMat = sharedMat(p.bodyColor, { roughness: 0.80, metalness: 0.0 });

        // Base disc
        const baseGeo = new THREE.CylinderGeometry(p.bodyRadius * 1.6, p.bodyRadius * 1.6, 0.018, 28);
        const base = new THREE.Mesh(baseGeo, bodyMat);
        base.position.y = 0.009;
        group.add(base);

        // Tall column body — slightly tapered (bullet shape)
        const colGeo = new THREE.CylinderGeometry(p.bodyRadius * 0.88, p.bodyRadius, p.bodyHeight, 28, 2);
        const col = new THREE.Mesh(colGeo, bodyMat);
        col.position.y = 0.018 + p.bodyHeight / 2;
        col.castShadow = true;
        group.add(col);

        // Small socket ring at top of column
        const sockY = 0.018 + p.bodyHeight;
        const sockGeo = new THREE.CylinderGeometry(0.022, 0.022, 0.025, 16);
        const sockMat = sharedMat('#888888', { roughness: 0.5, metalness: 0.6 });
        const sock = new THREE.Mesh(sockGeo, sockMat);
        sock.position.y = sockY + 0.0125;
        group.add(sock);

        // Conical shade
        const shadeMat = sharedMat(p.shadeColor, { roughness: 0.75, metalness: 0.0, side: THREE.DoubleSide });
        const shadeY = sockY + 0.025 + p.shadeHeight / 2;

        const shadeGeo = new THREE.CylinderGeometry(p.shadeTopR, p.shadeBotR, p.shadeHeight, SEG_BODY, 1, true);
        const shade = new THREE.Mesh(shadeGeo, shadeMat);
        shade.position.y = shadeY;
        shade.castShadow = true;
        group.add(shade);

        // Top cap of shade
        const topCapGeo = new THREE.CircleGeometry(p.shadeTopR, 24);
        const topCap = new THREE.Mesh(topCapGeo, shadeMat);
        topCap.rotation.x = -Math.PI / 2;
        topCap.position.y = shadeY + p.shadeHeight / 2;
        group.add(topCap);

        // §LIGHT-LOD-IMPROVE — domed warm lens at the cone opening (was flat disc).
        const glow = emissiveLens(p.shadeBotR * 0.55, LENS_WARM, 0.50, 0.13);
        glow.position.y = shadeY - p.shadeHeight / 2 + 0.003;
        group.add(glow);

        return group;
    }

    /**
     * Floor Tripod Black — three angled black legs + central hub + drum shade.
     * Y=0 is floor. Legs splay outward and downward.
     */
    private _buildFloorTripodBlack(data: LightingData): THREE.Group {
        const p = { ...FLOOR_TRIPOD_BLACK_DEFAULTS, ...data.floorTripodBlackParams };
        const group = new THREE.Group();

        const blackMat = sharedMat(p.color, { roughness: 0.7, metalness: 0.2 });

        // Hub where legs meet
        const hubH = p.legHeight * 0.82; // hub sits at ~82% of leg height
        const hubGeo = new THREE.CylinderGeometry(0.028, 0.028, 0.035, 16);
        const hubMat = sharedMat('#2a2a2a', { roughness: 0.5, metalness: 0.5 });
        const hub = new THREE.Mesh(hubGeo, hubMat);
        hub.position.y = hubH;
        group.add(hub);

        // Three legs — each is a thin box rotated outward and angled down
        const legLen = Math.sqrt(hubH * hubH + (0.36) * (0.36)); // hypotenuse
        const legAngle = Math.atan2(0.36, hubH); // tilt from vertical

        for (let i = 0; i < 3; i++) {
            const angle = (i / 3) * Math.PI * 2;
            const legGeo = new THREE.BoxGeometry(0.016, legLen, 0.016);
            const leg = new THREE.Mesh(legGeo, blackMat);
            leg.castShadow = true;

            // Position midpoint of leg
            leg.position.set(
                Math.sin(angle) * 0.18,
                hubH / 2,
                Math.cos(angle) * 0.18,
            );

            // Tilt outward
            leg.rotation.set(
                Math.cos(angle) * legAngle,
                0,
                -Math.sin(angle) * legAngle,
            );

            group.add(leg);

            // Small foot pad at floor contact
            const footGeo = new THREE.CylinderGeometry(0.014, 0.016, 0.012, 10);
            const foot = new THREE.Mesh(footGeo, blackMat);
            foot.position.set(Math.sin(angle) * 0.36, 0.006, Math.cos(angle) * 0.36);
            group.add(foot);
        }

        // Short rod from hub up to shade
        const rodH = p.legHeight - hubH;
        const rodGeo = new THREE.CylinderGeometry(0.012, 0.012, rodH + 0.04, 10);
        const rod = new THREE.Mesh(rodGeo, blackMat);
        rod.position.y = hubH + (rodH + 0.04) / 2;
        group.add(rod);

        // Drum shade
        const shadeY = p.legHeight + p.shadeHeight / 2 + 0.01;
        const shadeMat = sharedMat(p.shadeColor, { roughness: 0.85, metalness: 0.0, side: THREE.DoubleSide });

        const outerGeo = new THREE.CylinderGeometry(p.shadeRadius, p.shadeRadius, p.shadeHeight, SEG_BODY, 1, true);
        const outer = new THREE.Mesh(outerGeo, shadeMat);
        outer.position.y = shadeY;
        outer.castShadow = true;
        group.add(outer);

        // Top cap
        const topCapGeo = new THREE.CircleGeometry(p.shadeRadius, SEG_BODY);
        const topCap = new THREE.Mesh(topCapGeo, shadeMat);
        topCap.rotation.x = -Math.PI / 2;
        topCap.position.y = shadeY + p.shadeHeight / 2;
        group.add(topCap);

        // §LIGHT-LOD-IMPROVE — domed warm lens at the drum opening (was flat disc).
        const glow = emissiveLens(p.shadeRadius * 0.55, '#fff3d0', 0.4, 0.12);
        glow.position.y = shadeY - p.shadeHeight / 2 + 0.005;
        group.add(glow);

        return group;
    }

    // ── Night-mode light management ───────────────────────────────────────────

    /**
     * §NIGHT-ALL-LIGHTS-ON (2026-06-11) + §FEAT-FIXTURE-PHOTOMETRY (2026-08-06).
     *
     * Reconciles the whole fixture set against the live-light budget in ONE pass:
     *   1. read the store once (not per-root); synthesise minimal data for any
     *      root whose store record is missing so no fixture is left dark;
     *   2. rank fixtures by distance to the focus point and take the top N,
     *      where N = the budget for the current render tier;
     *   3. attach/refresh a photometrically-driven PointLight on the winners and
     *      detach it from the losers — the losers keep their emissive lens, so
     *      they still READ as switched-on.
     *
     * Runs on add/remove, on the day-night toggle, and on a tier change. Never
     * per-frame (P3 — this builder owns no rAF).
     */
    private _syncAllLights(): void {
        const byId = new Map(this._getAllData().map(d => [d.id, d]));
        const focus = this._focusProvider?.() ?? { x: 0, y: 0, z: 0 };

        const candidates = [...this._roots.entries()].map(([id, group]) => ({
            id,
            x: group.position.x,
            y: group.position.y,
            z: group.position.z,
        }));

        const { live } = selectLiveLights(candidates, this.liveLightBudget, focus);
        const liveSet = new Set(live);

        for (const [id, group] of this._roots) {
            const data = byId.get(id) ?? this._synthesizeData(id, group);
            // The LENS is unconditional — every fixture reads as switched-on in
            // both modes, whether or not it won the live-light budget.
            this._syncLens(data, group);
            if (liveSet.has(id)) this._attachLight(data, group);
            else                 this._detachLight(id, group);
        }
    }

    /**
     * §FEAT-FIXTURE-PHOTOMETRY — re-point every lens mesh in `group` at the
     * pooled material for `authored × lensEmissiveFor(photometry, isNight)`.
     *
     * Materials are POOLED, never mutated per element: mutating a shared material
     * would change every fixture that borrows it. Swapping the reference keeps
     * fixtures of the same family on one material and preserves instancing.
     */
    private _syncLens(data: LightingData, group: THREE.Group): void {
        const factor = lensEmissiveFor(photometryForFixture(data.fixtureType), this._isNight);
        group.traverse((child: THREE.Object3D) => {
            if (child.userData?.role !== LENS_ROLE) return;
            const tint = child.userData.lensTint as string | undefined;
            const base = child.userData.lensBase as number | undefined;
            if (tint === undefined || base === undefined) return;
            (child as THREE.Mesh).material = sharedLensMat(tint, base * factor);
        });
    }

    /**
     * §NIGHT-ALL-LIGHTS-ON — fallback LightingData for a root that has a built
     * fixture group but no store record. Uses the immutable userData stamped in
     * add() (id + fixtureType) and the group's world-independent local position.
     */
    private _synthesizeData(id: string, group: THREE.Group): LightingData {
        const ft = (group.userData.fixtureType as LightingData['fixtureType']) ?? 'downlight';
        return {
            id,
            type: 'lighting',
            levelId: (group.userData.levelId as string) ?? '',
            fixtureType: ft,
            position: { x: group.position.x, y: group.position.y, z: group.position.z },
        } as LightingData;
    }

    /** Stored data accessor — builder doesn't own store; use window ref. */
    private _getAllData(): LightingData[] {
        const store = window.lightingStore; // TODO(TASK-08)
        return store ? store.getAll() : [];
    }

    /**
     * §FEAT-FIXTURE-PHOTOMETRY — create or REFRESH the fixture's point light.
     *
     * Intensity/colour/reach come from {@link photometryForFixture}: real lumens
     * and kelvin per family, converted to this scene's candela convention by
     * `sceneIntensityFor` and scaled by the day/night multiplier. `data.emission`
     * remains an explicit per-element override for all four values.
     *
     * Re-entrant: called again on a day/night toggle, it UPDATES the existing
     * light in place rather than bailing out — the old early-return meant a
     * fixture attached in day mode never brightened at night.
     */
    private _attachLight(data: LightingData, group: THREE.Group): void {
        const photo = photometryForFixture(data.fixtureType);

        // Photometric baseline, then the element-level override (if any).
        const intensity = data.emission?.intensity ?? sceneIntensityFor(photo, this._isNight);
        const distance  = data.emission?.distance  ?? photo.reachM;
        const decay     = data.emission?.decay     ?? 2;   // inverse-square; physical.
        const colorHex  = kelvinToHex(photo.kelvin);

        const existing = this._lights.get(data.id) as THREE.PointLight | undefined;
        if (existing) {
            existing.intensity = intensity;
            existing.distance  = distance;
            existing.decay     = decay;
            if (data.emission?.color) existing.color.set(data.emission.color);
            else                      existing.color.setHex(colorHex);
            return;
        }

        const light = new THREE.PointLight(
            data.emission?.color ? new THREE.Color(data.emission.color) : new THREE.Color(colorHex),
            intensity,
            distance,
            decay,
        );

        // §FIX-LIGHT-NIGHT-CONTRIBUTION — stamp the role so scene-wide dimmers
        // (BottomActionMenu's day/night traversal) leave fixture lights alone.
        // Without this the traversal multiplied every fixture by 0.38 at night —
        // the exact opposite of what night mode must do to artificial light.
        light.userData.role      = FIXTURE_LIGHT_ROLE;
        light.userData.elementId = data.id;

        // Position light at the fixture's emitter anchor (approximate bulb location).
        switch (data.fixtureType) {
            case 'downlight':
                light.position.set(0, -0.10, 0);
                break;
            case 'pendant': {
                const pp = { ...PENDANT_DEFAULTS, ...data.pendantParams };
                light.position.set(0, -(pp.cableLen + pp.height), 0);
                break;
            }
            case 'linear_led': {
                const lp = { ...LINEAR_LED_DEFAULTS, ...data.linearLedParams };
                light.position.set(0, -(lp.cableLen + lp.height), 0);
                break;
            }
            case 'pendant_pebble': {
                const pbl = { ...PENDANT_PEBBLE_DEFAULTS, ...data.pendantPebbleParams };
                light.position.set(0, -(pbl.cableLen + pbl.height + 0.04), 0);
                break;
            }
            case 'pendant_ceramic_bell': {
                const pcb = { ...PENDANT_CERAMIC_BELL_DEFAULTS, ...data.pendantCeramicBellParams };
                light.position.set(0, -(pcb.cableLen + pcb.height + 0.02), 0);
                break;
            }
            case 'pendant_conical': {
                const pc = { ...PENDANT_CONICAL_DEFAULTS, ...data.pendantConicalParams };
                light.position.set(0, -(pc.cableLen + pc.height + 0.03), 0);
                break;
            }
            case 'floor_wood_post': {
                const fwp = { ...FLOOR_WOOD_POST_DEFAULTS, ...data.floorWoodPostParams };
                light.position.set(0, fwp.postHeight + fwp.shadeHeight * 0.5 + 0.04, 0);
                break;
            }
            case 'floor_arc_brass': {
                const fab = { ...FLOOR_ARC_BRASS_DEFAULTS, ...data.floorArcBrassParams };
                light.position.set(fab.arcRadius, fab.postHeight + 0.055, 0);
                break;
            }
            case 'table_terracotta': {
                const tt = { ...TABLE_TERRACOTTA_DEFAULTS, ...data.tableTerracottaParams };
                light.position.set(0, tt.bodyHeight + 0.025 + tt.shadeHeight * 0.5 + 0.018, 0);
                break;
            }
            case 'floor_tripod_black': {
                const ftb = { ...FLOOR_TRIPOD_BLACK_DEFAULTS, ...data.floorTripodBlackParams };
                light.position.set(0, ftb.legHeight + ftb.shadeHeight * 0.5, 0);
                break;
            }
            case 'pendant_cluster': {
                // Position the single emission point at the average pendant
                // bottom height — read as the cluster's centroid glow.
                const pcl = { ...PENDANT_CLUSTER_DEFAULTS, ...data.pendantClusterParams };
                const avgCable = (pcl.minCableLen + pcl.maxCableLen) / 2;
                light.position.set(0, -(pcl.canopyHeight + avgCable + pcl.pendantHeight), 0);
                break;
            }
            case 'mirror_light': {
                // §FEAT-FIXTURE-PHOTOMETRY — `mirror_light` had NO case here, so its
                // light sat at the group origin: INSIDE the wall plane, where the
                // wall mesh occluded most of its contribution. The bar's emissive
                // LED face is at +Z (see _buildMirrorLight), so the emitter sits
                // just in front of it, projecting into the room.
                const ml = { ...MIRROR_LIGHT_DEFAULTS, ...data.mirrorLightParams };
                light.position.set(0, -ml.height * 0.5, ml.depth * 1.6);
                break;
            }
        }

        // §NIGHT-ALL-LIGHTS-ON (2026-06-11) — every placed fixture must illuminate
        // in night mode, not just a few. The previous code set `castShadow = true`
        // on EVERY fixture PointLight. A shadow-casting PointLight needs a cube
        // shadow map (6 faces) and a texture-unit slot; WebGL/WebGPU has a hard
        // cap (MAX_TEXTURE_IMAGE_UNITS, commonly 16). Once enough fixtures are
        // placed the renderer silently drops the shadow lights past the cap, so
        // only the first few fixtures appeared to "switch on".
        //
        // Fix: fixture PointLights no longer cast shadows. They still illuminate
        // (diffuse/specular) from every fixture without consuming a shadow-map
        // slot, so ALL fixtures light up. Room geometry still receives shadows
        // from the Pascal sun/main lights, which is where the cap budget belongs.
        // A small shadow-casting budget can be reintroduced later if desired, but
        // illumination from all fixtures is the founder's requirement.
        light.castShadow = false;

        group.add(light);
        this._lights.set(data.id, light);
    }

    private _detachLight(id: string, group: THREE.Group): void {
        const light = this._lights.get(id);
        if (!light) return;
        group.remove(light);
        this._lights.delete(id);
    }

    dispose(): void {
        this._unsubDayNight?.(); // F.events.14 — was window.removeEventListener('bam:day-night-changed')
        for (const id of [...this._roots.keys()]) this.remove(id);
        _matCache.forEach(m => m.dispose());
        _matCache.clear();
        // §FEAT-FIXTURE-PHOTOMETRY — the pooled lens materials are builder-owned too.
        _lensMatCache.forEach(m => m.dispose());
        _lensMatCache.clear();
    }
}
