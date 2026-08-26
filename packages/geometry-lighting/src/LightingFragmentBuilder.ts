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
// §MESH110-FIXTURE-MERGE (L-11567 #1) — mergeGeometries via the ONE authorised
// re-export (C04 §1.1), the same import shape WallFragmentBuilder uses.
import { scheduleGpuRelease, mergeGeometries } from '@pryzm/renderer-three';
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
// §FEAT-LOD200-LUMINAIRES (L-1330, 2026-08-19) — the twenty LOD-200 families. The
// builder reads the MATRIX (one row per family) instead of gaining twenty bespoke
// build methods, so a twenty-first family is drawn correctly on its first build
// rather than silently falling through to `_buildDownlight`.
// ⛔ §SCC-NO-BARREL-AT-MODULE-LOAD — the defining module by subpath, not the root
// barrel. These three are only read at CALL time so they would have survived a
// barrel import, but "it happens to be late enough" is not a property worth
// depending on when the acyclic import is the same length.
import {
    lod200Row,
    lod200BodyAppearance,
    type Lod200FixtureRow,
} from '@pryzm/core-app-model/lod200-fixtures';

// ── §LIGHT-BUDGET-HONESTY (L-11420) ───────────────────────────────────────────

/**
 * Why one fixture is, or is not, contributing real illumination.
 *
 * ⭐ Every field is a NUMBER THE USER CAN ACT ON, not a boolean verdict. "Not
 * lit" on its own is the silent refusal C16 CA-18 forbids; "not lit, rank 5 of
 * 12, budget 3, tier performance" tells the user both what happened and which
 * lever moves it. See `_syncAllLights` for why this had to exist.
 */
export interface LiveLightState {
    /** Element id. Present on `liveLightDiagnostics()` rows; absent on the stamp. */
    readonly id?: string;
    /** True when this fixture owns a real THREE light and illuminates the room. */
    readonly lit: boolean;
    /** 1-based position in the distance-to-focus ranking. 1 = nearest the camera. */
    readonly rank: number;
    /** How many fixtures competed. */
    readonly total: number;
    /** How many of them could win — `LIVE_LIGHT_BUDGET_BY_TIER[tier]`. */
    readonly budget: number;
    /** The render tier in force, or `null` if none has been reported yet. */
    readonly tier: SceneQualityTier | null;
    /**
     * True when a real focus provider (the camera) is wired. FALSE means the
     * ranking fell back to distance-from-ORIGIN — still deterministic, but no
     * longer "nearest the camera", and that distinction is exactly the kind of
     * silent degradation this struct exists to stop hiding.
     */
    readonly focused: boolean;
    /** The whole explanation as one sentence, or `null` when lit. */
    readonly reason: string | null;
}

// ── Shared materials (one per builder instance) ───────────────────────────────

const _matCache = new Map<string, THREE.MeshStandardMaterial>();

/**
 * C100 §5 — magenta, on purpose. A `materialId` naming nothing in the master
 * catalogue must render as OBVIOUSLY LOST, never as a plausible grey: a silent
 * fallback is how a wrong material ships looking correct. Same convention the
 * lighting / door / window material bridges already use.
 */
const UNRESOLVED_MATERIAL_COLOR = '#ff00ff';

/**
 * §FEAT-LOD200-LUMINAIRES — the authored (shape-relative) lens emissive every
 * LOD-200 family starts from. `_syncLens` re-scales it by the fixture's
 * photometric lens factor and the day/night state, so this is a SHAPE constant,
 * NOT a brightness — brightness comes from the row's lumens, via
 * `lensEmissiveFor(photometryForFixture(...))`.
 */
const LOD200_LENS_BASE = 1.0;

/**
 * §LIGHT102 (L-11500) — the `capsule` archetype's mouth, as SHARED constants.
 *
 * ⭐ These live at module scope, not inside `_lod200Capsule`, because TWO places
 * need them: the builder (which seats the lens) and `_lod200EmitterOffset` (which
 * seats the LIGHT). Those two disagreeing is precisely the `mirror_light` defect —
 * a fixture drawn emitting from one point while illuminating from another — so the
 * arithmetic is written once and read twice.
 *
 * The lower cap is cut at 150° of arc rather than a full 180°: it still READS as a
 * hemispherical end, while leaving a real aperture (radius `sin 150° · r` = r/2) at
 * `|cos 150°| · r` below the sphere centre for the lens to sit INSIDE. That recess
 * is what makes the row's 60° beam a description of the geometry rather than a claim.
 */
const CAPSULE_MOUTH_PHI  = (150 * Math.PI) / 180;
const CAPSULE_MOUTH_R    = Math.sin(CAPSULE_MOUTH_PHI);
const CAPSULE_MOUTH_DROP = Math.abs(Math.cos(CAPSULE_MOUTH_PHI));

/**
 * §LIGHT102 (L-11500) — the `dome` archetype's EXPOSED GLOBE radius, derived from
 * the bowl and clamped to the 55–110 mm band a real G95–G200 decorative globe lamp
 * occupies. Shared by the builder and the emitter offset for the same reason as
 * the capsule constants above.
 */
function domeGlobeRadius(bowlRadius: number): number {
    return Math.min(0.11, Math.max(0.055, bowlRadius * 0.28));
}

// ── §OUTDOOR112 (2026-08-26) — the three SITE archetypes' layouts, SHARED ─────
//
// Same discipline as the capsule constants and `domeGlobeRadius` above: each
// archetype's luminous-body position is written ONCE and read TWICE — by the
// builder that draws it and by `_lod200EmitterOffset` that lights from it. Two
// copies disagreeing is the `mirror_light` defect (drawn emitting from one
// point, illuminating from another).

/**
 * `bollard` — the head band under the cap. `h` is the row's `dMm` (HEIGHT, as
 * for `post`). Cap and band are clamped to real bollard proportions (a 35 mm
 * cap, a <=160 mm band) so a 1 m bollard and a 0.6 m one read as the same family.
 */
function bollardHeadLayout(h: number): { capH: number; bandH: number; bandCentreY: number } {
    const capH  = Math.min(0.035, h * 0.06);
    const bandH = Math.min(0.16,  h * 0.22);
    return { capH, bandH, bandCentreY: h - capH - bandH / 2 };
}

/**
 * `globe_post` — the globe atop the pole. `poleH` is `dMm` (the pole/post
 * height to the globe's underside); the globe diameter is the row's `headMm`,
 * falling back to 2.2x the pole diameter (>= 160 mm) when a row omits it. The
 * centre sits at 0.85 r above the pole top so the pole visibly ENTERS the
 * globe rather than balancing a tangent sphere on a point.
 */
function globePostHead(poleH: number, headMm: number | undefined, poleR: number): { r: number; centreY: number } {
    const r = headMm !== undefined && headMm > 0 ? (headMm / 1000) / 2 : Math.max(0.08, poleR * 2.2);
    return { r, centreY: poleH + r * 0.85 };
}

/**
 * `street_arm` — pole, cantilever arm and raked head. `poleH` is `dMm`, the
 * arm reach is the row's `stemMm` (the same "projection off the mount" meaning
 * `yoke` gives it), `headLenM` is `lMm` — the head's long axis runs ALONG the
 * arm, over the road. The pole radius DERIVES from height (a 5 m pole is a
 * 110 mm section, a 4 m one 90 mm — taller, thicker, as the structure demands),
 * clamped to the 90–180 mm band real street columns occupy. The head is raked
 * +6° (far end up) — the modern flat-head look; `lod200Params.tiltDeg` adds.
 */
function streetArmLayout(poleH: number, armMm: number | undefined, headLenM: number): {
    poleR: number; armY: number; headThk: number;
    headCentreY: number; headCentreZ: number; rakeRad: number;
} {
    const poleR   = Math.min(0.09, Math.max(0.045, poleH * 0.011));
    const armM    = Math.max(0.2, (armMm ?? 600) / 1000);
    const headThk = 0.075;
    const armY    = poleH - poleR;                 // the arm springs just under the pole top
    return {
        poleR, armY, headThk,
        headCentreY: armY + headThk * 0.2,
        headCentreZ: armM + headLenM * 0.25,       // the head runs past the arm's end
        rakeRad: (6 * Math.PI) / 180,
    };
}

/**
 * §FEAT-LOD200-LUMINAIRES — one fixture's resolved build context: its matrix row,
 * its per-instance overrides applied, dimensions converted to metres, and the
 * POOLED body material (plus the raw appearance, so an archetype needing a
 * variant — e.g. the double-sided high-bay shell — can re-pool rather than clone).
 */
interface Lod200Ctx {
    readonly row: Lod200FixtureRow;
    /** Length, or diameter for round archetypes, metres. */
    readonly L: number;
    /** Width across the emitting face, metres. */
    readonly W: number;
    /** Body depth, or HEIGHT for the `post` archetype, metres. */
    readonly D: number;
    /** Suspension drop below the mount plane, metres. */
    readonly drop: number;
    /** Aim off the default axis, RADIANS. */
    readonly tilt: number;
    /** Radial arm count (`arms` archetype). */
    readonly arms: number;
    /** §LIGHT102 — visible ceiling-rose depth, metres. 0 = none drawn. */
    readonly canopy: number;
    /** §LIGHT102 — `bar` end-chamfer depth, metres. 0 = square-cut ends. */
    readonly endChamfer: number;
    readonly bodyMat: THREE.MeshStandardMaterial;
    readonly bodyColor: string;
    readonly bodyMetalness: number;
    readonly bodyRoughness: number;
    /**
     * §LIGHT102 — the master material's own opacity/transparency, carried so an
     * archetype that must re-pool a variant (the double-sided high-bay shell, the
     * glass tube) keeps the finish instead of silently dropping to opaque.
     */
    readonly bodyOpacity: number;
    readonly bodyTransparent: boolean;
    /** Lens tint, DERIVED from the row's kelvin — never authored. */
    readonly lensTint: string;
}

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

/**
 * §OUTDOOR112 — `opacity` / `transparent` are part of the POOL KEY.
 *
 * A GLOWING TRANSLUCENT GLOBE (the founder's globe bollard and globe post
 * light) is a lens that is also see-through: its emission is kelvin-derived
 * like every lens, and its translucency is the `glass-frosted` master row's own
 * `opacity`/`transparent`, carried through `lod200BodyAppearance` (the L-11501
 * carriage). Both facts must survive `_syncLens`, which re-pools the material
 * on every day/night pass — so they ride the key, and `tagLens` remembers them
 * per mesh. Defaults (1 / false) leave every pre-existing lens on the SAME
 * opaque material it always had (a new key string, the same object per key).
 */
function sharedLensMat(
    tint: string,
    emissive: number,
    opacity = 1,
    transparent = false,
): THREE.MeshStandardMaterial {
    // Quantise to 0.05 so continuous photometric values collapse onto a small,
    // bounded set of materials instead of one per fixture.
    const q = Math.round(Math.max(0, emissive) * 20) / 20;
    const key = `${tint}|${q}|${opacity}|${transparent ? 1 : 0}`;
    let mat = _lensMatCache.get(key);
    if (!mat) {
        mat = new THREE.MeshStandardMaterial({
            color: new THREE.Color(tint),
            emissive: new THREE.Color(tint),
            emissiveIntensity: q,
            roughness: 1,
            metalness: 0,
            ...(transparent ? { transparent: true, opacity } : {}),
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

function tagLens(
    mesh: THREE.Mesh,
    tint: string,
    authoredEmissive: number,
    opacity = 1,
    transparent = false,
): void {
    mesh.userData.role      = LENS_ROLE;
    mesh.userData.lensTint  = tint;
    mesh.userData.lensBase  = authoredEmissive;
    // §OUTDOOR112 — a translucent lens (frosted globe) stays translucent through
    // every `_syncLens` re-pool; absent on every pre-existing lens (= opaque).
    mesh.userData.lensOpacity     = opacity;
    mesh.userData.lensTransparent = transparent;
}

// ── Builder ───────────────────────────────────────────────────────────────────

export class LightingFragmentBuilder {

    /** scene root → fixture group */
    private readonly _roots = new Map<string, THREE.Group>();

    /** id → point/spot light node (set only in night mode) */
    private readonly _lights = new Map<string, THREE.Light>();

    /**
     * ⭐ §FIX-LIGHT-PLACE-FREEZE (L-10080, founder 2026-08-23: *"why does placing a
     * lighting freeze the scene?"*) — RETIRED PointLight OBJECTS, KEPT FOR REUSE.
     *
     * ── THE MEASUREMENT THAT FORCED THIS ────────────────────────────────────
     * At the `performance` tier the live-light budget is 3. Placing 8 fixtures one at
     * a time minted **8 distinct `THREE.PointLight` objects** — one per placement,
     * forever — even though the live COUNT stops changing after the third. The budget
     * pass displaced the farthest fixture (`_detachLight` dropped its light on the
     * floor) and minted a brand-new light for the newcomer (`_attachLight`).
     *
     * ── WHY A NEW OBJECT COSTS A FULL SHADER REBUILD ────────────────────────
     * `LiveLightBudget.ts` §PERF-LIGHT-COST-MODEL (2) states the rule this repo
     * already ratified: `numPointLights` is part of THREE's WebGL program cache key,
     * and **on the WebGPU/TSL path C04 §SHADOW rule 8 is normative that
     * `LightsNode.customCacheKey()` hashes per LIGHT**. Per LIGHT — not per count. So
     * swapping in a different light OBJECT invalidates the lights-node cache key and
     * rebuilds every material program in the scene *even when the count is unchanged*.
     * That is why the freeze was not confined to the first three fixtures: it fired on
     * EVERY placement.
     *
     * ⚠ MEASURED vs ASSUMED, stated plainly: the object churn (8 lights for 8
     * placements) is MEASURED — `lightingLivePoolStable.test.ts` pins it. The
     * millisecond cost of one program rebuild is NOT measured here; it rests on the
     * cost model above and on the PSO-compile storms `BatchCoordinator`
     * §FIX-POST-GEOMETRY-COMPILE-V2 already records. Do not quote a ms figure from
     * this comment.
     *
     * ── WHAT THE POOL CHANGES, AND WHAT IT DOES NOT ─────────────────────────
     * A displaced fixture's light is PARKED here instead of discarded, and the next
     * fixture to win a budget slot RE-POINTS it (new parent, colour, intensity,
     * distance, decay, position, `userData.elementId`). Object identity is therefore
     * stable across the steady state, so the cache key is stable and the rebuild stops.
     * ⛔ Nothing about the LOOK changes: same photometry, same budget, same ladder, same
     * `castShadow = false`. Only the ALLOCATION is reused.
     *
     * Bounded at the current budget — a parked light past that is simply dropped for GC.
     * Fixture lights own no GPU resource of their own (no shadow map, see
     * §NIGHT-ALL-LIGHTS-ON), so parking a handful is free.
     */
    private readonly _lightPool: THREE.PointLight[] = [];

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
    private _focusProvider: (() => { x: number; y: number; z: number } | null) | null = null;

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
     *
     * ⭐ §LIGHT102 (L-11427, 2026-08-26) — the provider may now return `null`,
     * meaning *"I have no focus point right now"*.
     *
     * WHY: `initBuilders.ts` used to read `window.world.camera.three` ONCE, at
     * init, and wire the provider only `if (cam?.position)`. The camera is not
     * always there yet at that moment, and when it was not, nothing was wired —
     * ever — and the whole scene silently ranked its fixtures by distance from the
     * WORLD ORIGIN for the rest of the session. `focused: false` reported it (that
     * is L-11420's honesty stamp doing its job), but nothing fixed it.
     *
     * A provider that can say `null` lets the caller wire ONCE, UNCONDITIONALLY,
     * and resolve the camera LATE — at each sync — so a camera that arrives after
     * `initBuilders` is picked up on the next add/remove/tier change instead of
     * never. `focused` then means *"the provider returned a real point on this
     * pass"* rather than *"a function was installed at boot"*, which is the
     * stronger and more honest claim.
     */
    setFocusProvider(fn: () => { x: number; y: number; z: number } | null): void {
        this._focusProvider = fn;
    }

    /** The live-light budget currently in force. */
    get liveLightBudget(): number { return liveLightBudgetForTier(this._tier); }

    /** Number of fixtures that currently own a real THREE light. */
    get liveLightCount(): number { return this._lights.size; }

    /**
     * §LIGHT-BUDGET-HONESTY (L-11420) — why each fixture is, or is not, emitting.
     *
     * The founder's question was *"why do some lighting products produce light
     * depending on random factors?"*. Nothing was random; nothing was VISIBLE
     * either, which is the actual defect. This is the read side of the per-fixture
     * verdict stamped by `_syncAllLights` — ordered nearest-focus first, so the
     * caller sees the same ranking the budget applied.
     *
     * Returns an EMPTY array before the first sync, never a fabricated ranking.
     */
    liveLightDiagnostics(): readonly LiveLightState[] {
        const out: LiveLightState[] = [];
        for (const [id, group] of this._roots) {
            const s = group.userData.liveLight as LiveLightState | undefined;
            if (s) out.push({ ...s, id });
        }
        return out.sort((a, b) => a.rank - b.rank);
    }

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
        // §MESH110-FIXTURE-MERGE (L-11567 #1) — collapse same-material sibling
        // parts into one mesh per (parent, material, shadow-intent) bucket
        // BEFORE stamping/scene-add, so a 4-8 mesh fixture submits ~2-4 draws.
        // Lenses are never touched (see the method's contract).
        this._consolidateFixtureMeshes(group);

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
        // §C13-LIGHTING-DETACH-BY-PARENT (L-8820) — `removeFromParent()`, NOT
        // `this._scene.remove(group)`.
        //
        // `Object3D.remove` is a SILENT NO-OP when the object is not a direct child of
        // the container it is called on. This method then went on to `_roots.delete(id)`
        // regardless, so any fixture that was ever re-parented — or built while
        // `_scene` was still unset, since the whole detach sat behind `if (this._scene)`
        // — was dropped from the builder's index while staying live in the scene:
        // permanently unreachable by `remove()`, by `clearProjectGeometry()` and by
        // `dispose()`, and therefore ADDITIVE across project switches. That is the
        // founder's "lighting fixtures from previous projects coming".
        //
        // `RoomBoundaryBuilder.removeRoom` already documents this exact hazard and
        // already guards it this way; lighting did not. Behaviour is IDENTICAL for the
        // normal case (a group parented directly to the scene), so no correct
        // single-project session can lose a fixture by this change — it only closes the
        // case where the old call did nothing at all.
        //
        // ⚠ NARROWED, NOT PROVEN AS THE FOUNDER'S ROOT: a repo grep found no site that
        // re-parents a lighting root, so this is a latent-class repair, not a
        // demonstrated reproduction. See L-8820 for what is still open.
        group.removeFromParent();
        // §GPU-RESOURCE-LIFETIME L2 / C04 §3.1.2a rule 7 (L-10500) — RELEASE AT THE
        // FRAME BOUNDARY, never in place.
        //
        // This used to traverse the subtree and free each mesh's geometry in place,
        // right here, on the mutation tick. Two defects in one line, and the second is
        // the one that kills the viewport:
        //   (a) ADR-0297 L2 directly — the buffers are freed while a command buffer
        //       encoded from THIS frame may still reference them, which is the
        //       "Destroyed buffer … used in a submit" / "setIndexBuffer … not of type
        //       'GPUBuffer'" family; and
        //   (b) it BYPASSED the release funnel, so §GPU-CASTER-RELEASE-CHOKEPOINT's
        //       observer was never notified. Every fixture body here is `castShadow =
        //       true`, so this is precisely a shadow-CASTER teardown — the one event
        //       the chokepoint exists to open a submit-pause + shadow-freeze window
        //       across. C04 §3.1.2a rule 6 ("the window is DERIVED from the RELEASE")
        //       is only true while rule 2 is universal; a bypass does not merely leak,
        //       it silently invalidates the derivation.
        //
        // `clearProjectGeometry()` calls this for EVERY fixture, so on a project switch
        // the whole fixture caster set was torn down on one tick with submits live.
        //
        // disposeMaterials = FALSE: fixture materials come from the builder-owned
        // `_matCache` / `_lensMatCache` pools and are shared across fixtures; they are
        // freed by `dispose()` (terminal) only. Passing true here would free a pooled
        // material still bound by every other fixture — ADR-0297 L1.
        scheduleGpuRelease(group, false);
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

    /**
     * §MESH110-FIXTURE-MERGE (L-11567 #1) — collapse a built fixture's
     * same-material sibling parts into ONE mesh per bucket.
     *
     * THE MEASUREMENT (§PERF105): a fixture is 4-8 meshes (a chandelier ~21, a
     * 7-pendant cluster ~29) with NO merge in the package, on a heavy-scene
     * guard that swaps the renderer backend at 1000 scene meshes — the founder
     * crossed it with ONE door create. Every one of those parts is a separate
     * draw submission for identical material state.
     *
     * THE BUCKET KEY is (direct parent, material uuid, castShadow,
     * receiveShadow, role) — and each term is load-bearing:
     *   · direct parent — parts inside a posed sub-group (`_lod200Can`'s
     *     tilting `head`, `_lod200Yoke`'s aim) merge only with siblings, so
     *     per-instance aim transforms survive untouched;
     *   · material uuid — every material here is POOLED (`sharedMat` /
     *     `sharedLensMat`, L-11421), so the merged mesh binds the same pooled
     *     object and `remove()`'s `scheduleGpuRelease(group, false)` contract
     *     (never dispose pooled materials) is unchanged;
     *   · castShadow — the builder's deliberate per-part shadow intent (bodies
     *     cast, cables/glass never — §NIGHT-ALL-LIGHTS-ON's mesh analog) is
     *     preserved EXACTLY: a caster never merges with a non-caster;
     *   · role — `LENS_ROLE` meshes are EXCLUDED OUTRIGHT (skipped, not
     *     bucketed): `_syncLens` re-assigns `.material` per lens mesh and
     *     tests pin per-lens position/rotation (the `updown` bar's π-rotated
     *     up-lens, the dome's below-mouth globe), so a lens is never merged —
     *     with a body or with another lens.
     *
     * Each member's LOCAL matrix is baked into a geometry clone so the merged
     * mesh sits at the parent origin with identical world geometry. Buckets of
     * ONE are left completely untouched (original geometry object, parameters,
     * position — the single-part assertions in the suite keep meaning).
     * A failed merge declines that bucket and keeps the originals — behaviour
     * over beauty, never a dropped part.
     */
    private _consolidateFixtureMeshes(group: THREE.Group): void {
        // Collect meshes by DIRECT parent first — never re-parent anything.
        const byParent = new Map<THREE.Object3D, THREE.Mesh[]>();
        group.traverse((child) => {
            if (!(child as THREE.Mesh).isMesh) return;
            const m = child as THREE.Mesh;
            if (m.userData?.role === LENS_ROLE) return;      // lenses: never touched
            if (Array.isArray(m.material)) return;           // multi-material: decline
            const parent = m.parent;
            if (!parent) return;
            const list = byParent.get(parent);
            if (list) list.push(m);
            else byParent.set(parent, [m]);
        });

        for (const [parent, meshes] of byParent) {
            // Bucket within this parent. Insertion order (traversal order) keeps
            // the merged geometry deterministic build-to-build.
            const buckets = new Map<string, THREE.Mesh[]>();
            for (const m of meshes) {
                const mat = m.material as THREE.Material;
                const key = `${mat.uuid}|${m.castShadow ? 1 : 0}|${m.receiveShadow ? 1 : 0}|${m.userData?.role ?? ''}`;
                const b = buckets.get(key);
                if (b) b.push(m);
                else buckets.set(key, [m]);
            }

            for (const bucket of buckets.values()) {
                if (bucket.length < 2) continue;             // singles stay untouched

                const baked: THREE.BufferGeometry[] = [];
                for (const m of bucket) {
                    m.updateMatrix();
                    const g = m.geometry.clone();
                    g.applyMatrix4(m.matrix);
                    baked.push(g);
                }

                let merged: THREE.BufferGeometry | null;
                try {
                    merged = mergeGeometries(baked, false);
                } catch {
                    merged = null;
                }
                if (!merged) {
                    // Decline this bucket — keep the originals, drop nothing.
                    for (const g of baked) g.dispose();
                    continue;
                }
                for (const g of baked) g.dispose();          // mergeGeometries copied

                const proto = bucket[0]!;
                const mergedMesh = new THREE.Mesh(merged, proto.material as THREE.Material);
                mergedMesh.castShadow    = proto.castShadow;
                mergedMesh.receiveShadow = proto.receiveShadow;
                mergedMesh.name          = 'fixture-merged';

                for (const m of bucket) {
                    parent.remove(m);
                    // Per-fixture geometry, never pooled — safe to free now, the
                    // mesh was never rendered (we are pre-scene-add). Materials
                    // are pooled and stay untouched (L-11421 / remove() contract).
                    m.geometry.dispose();
                }
                parent.add(mergedMesh);
            }
        }
    }

    private _buildFixture(data: LightingData): THREE.Group {
        // §FEAT-LOD200-LUMINAIRES (L-1330) — a LOD-200 family is drawn from its matrix
        // row's ARCHETYPE. Checked FIRST and by LOOKUP, not by adding twenty `case`
        // labels: the `default:` arm below silently draws a downlight, so a family
        // that forgot its case would render the WRONG FIXTURE while every schedule,
        // export and photometry read reported the right one.
        if (lod200Row(data.fixtureType)) return this._buildLod200(data);

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
        // §LIGHT-BUDGET-HONESTY (L-11421) — POOLED, was `new MeshStandardMaterial`.
        // MEASURED: this was the ONE per-instance material left in the whole builder
        // (32 families probed; `pendant` alone leaked 1 material per fixture, every
        // other family shared cleanly). `pendant` is the most-placed decorative
        // fixture there is, so a kitchen of twelve of them minted twelve identical
        // gold rings — twelve shader programs where one would do, and the exact
        // per-instance-material defect that has already cost this project its
        // instancing once (see `_lod200Cone`'s note on the same trap).
        const innerMat = sharedMat('#c8a000', {
            emissive: '#c8a000',
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
        // §LIGHT102 (L-11427) — `focused` is now "the provider RETURNED a point on
        // this pass", not "a provider was installed at boot". A late-arriving camera
        // therefore starts being used the moment it exists, and a genuinely absent
        // one still reports the distance-from-ORIGIN fallback honestly.
        const focusPoint = this._focusProvider?.() ?? null;
        const focus = focusPoint ?? { x: 0, y: 0, z: 0 };
        const focused = focusPoint !== null;

        const candidates = [...this._roots.entries()].map(([id, group]) => ({
            id,
            x: group.position.x,
            y: group.position.y,
            z: group.position.z,
        }));

        const { live, dark, budget } = selectLiveLights(candidates, this.liveLightBudget, focus);
        const liveSet = new Set(live);

        // ⭐ §LIGHT-BUDGET-HONESTY (L-11420, founder: "WHY DO SOME LIGHTING PRODUCTS
        // PRODUCE LIGHT DEPENDING ON RANDOM FACTORS?").
        //
        // The budget is not random — it is `selectLiveLights`, which ranks by distance
        // to the focus point (the camera) and takes the top N, ties broken on `id`. It
        // is fully deterministic GIVEN a focus. What made it look random is that BOTH
        // of its inputs are invisible: the tier (which sets N — 3 on `performance`, and
        // a RESTORED USER PIN can hold a scene there forever) and the camera position
        // at the moment of the last add/remove. A fixture placed 4th simply never lit,
        // and nothing anywhere said why.
        //
        // C16 CA-18 / C74 — refuse BY NAME, WITH THE NUMBERS, never silently. So every
        // fixture now carries its own verdict and the arithmetic behind it. This is a
        // STAMP on render-side `userData`, not a store write (P6): the builder owns the
        // THREE group, and `liveLightDiagnostics()` is the read side for any UI.
        //
        // `enumerable: true` by plain assignment — the property panel copies the
        // selection with a SPREAD, which takes enumerable own properties only. That is
        // the same trap that silently dropped `id`/`elementType` in `add()`.
        const rank = new Map<string, number>();
        live.forEach((id, i) => rank.set(id, i + 1));
        dark.forEach((id, i) => rank.set(id, live.length + i + 1));
        for (const [id, group] of this._roots) {
            const lit = liveSet.has(id);
            group.userData.liveLight = {
                lit,
                rank: rank.get(id) ?? 1,
                total: candidates.length,
                budget,
                tier: this._tier ?? null,
                focused,
                // The whole sentence, pre-composed, so a caller cannot render a
                // half-truth by picking two of the five numbers.
                reason: lit
                    ? null
                    : `Not lit: this scene's "${this._tier ?? 'default (no tier reported)'}" render tier allows `
                      + `${budget} live fixture light${budget === 1 ? '' : 's'}, and this fixture ranks `
                      + `${rank.get(id) ?? '?'} of ${candidates.length} by distance from the camera. `
                      + `It still shows its lit lens, but it does not illuminate the room. `
                      + `Raise the render quality tier, or move the camera nearer, to light it.`,
            } satisfies LiveLightState;
        }

        // ⭐ §FIX-LIGHT-PLACE-FREEZE (L-10080) — DETACH BEFORE ATTACH, IN TWO PASSES.
        //
        // This used to be ONE pass over `_roots` in insertion order, interleaving
        // attach and detach. The newcomer is inserted LAST, so on every placement past
        // the budget the pass attached the newcomer (pool empty → mint a new
        // `THREE.PointLight`) and only afterwards detached the fixture it displaced —
        // whose light was then discarded. MEASURED: 8 placements at budget 3 produced 8
        // distinct light objects. Running every detach first means the displaced light
        // is already parked in `_lightPool` when the newcomer asks for one, so the
        // steady state recycles identities and the WebGPU lights-node cache key
        // (C04 §SHADOW rule 8 — hashed per LIGHT) stops changing.
        //
        // Also strictly more correct on its own terms: the live-light count can no
        // longer transiently EXCEED the budget mid-pass.
        //
        // The lens sync stays unconditional and runs for every fixture in the first
        // pass — every fixture reads as switched-on in both modes, whether or not it
        // won the live-light budget.
        const resolved = new Map<string, LightingData>();
        for (const [id, group] of this._roots) {
            const data = byId.get(id) ?? this._synthesizeData(id, group);
            resolved.set(id, data);
            this._syncLens(data, group);
            if (!liveSet.has(id)) this._detachLight(id, group);
        }
        for (const [id, group] of this._roots) {
            if (!liveSet.has(id)) continue;
            this._attachLight(resolved.get(id) ?? this._synthesizeData(id, group), group);
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
            // §OUTDOOR112 — carry the lens's own translucency into the re-pool,
            // or a frosted globe would turn opaque on the first day/night pass.
            const opacity     = (child.userData.lensOpacity as number | undefined) ?? 1;
            const transparent = (child.userData.lensTransparent as boolean | undefined) ?? false;
            (child as THREE.Mesh).material = sharedLensMat(tint, base * factor, opacity, transparent);
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

        // §FIX-LIGHT-PLACE-FREEZE (L-10080) — REUSE a parked light object before minting
        // a new one. A different light OBJECT rebuilds every material program on the
        // WebGPU/TSL path (C04 §SHADOW rule 8 — `LightsNode.customCacheKey()` hashes per
        // LIGHT), so the steady state must recycle identities, not allocate them. Every
        // field below is (re)assigned unconditionally, so a recycled light is
        // indistinguishable from a fresh one — including `position`, which the archetype
        // switch further down overwrites for every family (the `set(0,0,0)` here is the
        // floor for the families that fall through that switch untouched).
        const pooled = this._lightPool.pop();
        const light = pooled ?? new THREE.PointLight();
        light.color = data.emission?.color ? new THREE.Color(data.emission.color) : new THREE.Color(colorHex);
        light.intensity = intensity;
        light.distance  = distance;
        light.decay     = decay;
        light.position.set(0, 0, 0);

        // §FIX-LIGHT-NIGHT-CONTRIBUTION — stamp the role so scene-wide dimmers
        // (BottomActionMenu's day/night traversal) leave fixture lights alone.
        // Without this the traversal multiplied every fixture by 0.38 at night —
        // the exact opposite of what night mode must do to artificial light.
        light.userData.role      = FIXTURE_LIGHT_ROLE;
        light.userData.elementId = data.id;

        // Position light at the fixture's emitter anchor (approximate bulb location).
        // §FEAT-LOD200-LUMINAIRES (L-1330) — derived per ARCHETYPE. The named switch
        // below is per FAMILY, which is how `mirror_light` came to have no case at all
        // and sat emitting from inside the wall plane (see its case).
        const lodOffset = this._lod200EmitterOffset(data);
        if (lodOffset) {
            light.position.set(lodOffset.x, lodOffset.y, lodOffset.z);
        } else
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


    // ── §FEAT-LOD200-LUMINAIRES (L-1330, 2026-08-19) ──────────────────────────
    //
    // Twenty families, EIGHT masses. Each `Lod200FixtureRow` names an archetype and
    // a few millimetre dimensions, and the builders below draw that generic mass.
    //
    // ⭐ Why not twenty `_buildX` methods: the twelve named families above have one
    // bespoke builder each, which is exactly the enumerated-list shape this lane was
    // asked to stop repeating — a twenty-first family added that way arrives with no
    // geometry and falls through to `_buildDownlight`, rendering a downlight while
    // the schedule says "bollard". Here a new row picks an EXISTING archetype and is
    // drawn correctly on its first build.
    //
    // ⚠ LOD 200 is the CEILING, not a shortcut. "Generic geometry with approximate
    // size, shape, location and orientation" is the definition, so these are
    // recognisable masses at real dimensions — a 600 × 600 troffer, a 900 mm bollard,
    // a 400 mm high-bay cone. They are NOT manufacturer models and must not be
    // described as such.
    //
    // ⭐ MATERIALS: every body colour AND its metalness/roughness are resolved from
    // the C100 master catalogue by `materialId`. Zero materials are minted, zero body
    // hex colours are typed, and all meshes share the module-level `sharedMat` /
    // `sharedLensMat` pools — twenty new families add ZERO per-instance materials.

    /** Millimetres → metres. */
    private _mm(v: number): number { return v / 1000; }

    /**
     * Resolve one fixture's LOD-200 build context: the catalogue row, the
     * per-instance overrides, dimensions in metres, and the pooled body material.
     *
     * Returns `null` when `fixtureType` is not a LOD-200 family, so every caller
     * falls through to the twelve named builders unchanged.
     */
    private _lod200Ctx(data: LightingData): Lod200Ctx | null {
        const row = lod200Row(data.fixtureType);
        if (!row) return null;
        const o = data.lod200Params ?? {};

        // ⭐ The override may name a DIFFERENT catalogue material — still an id, never
        // a colour. An id that resolves to nothing renders the C100 §5 magenta marker
        // rather than a plausible grey: a lost material must never look like a finish.
        const matId = o.bodyMaterialId ?? row.bodyMaterialId;
        const look = lod200BodyAppearance(matId)
            ?? { color: UNRESOLVED_MATERIAL_COLOR, metalness: 0, roughness: 0.6, opacity: 1, transparent: false };

        // ⭐ §LIGHT102 (L-11500) — a TRANSPARENT master material renders transparent.
        //
        // `glass-clear` carries `opacity: 0.3, transparent: true` in the C100 master
        // catalogue, and `lod200BodyAppearance` used to project only colour/metalness/
        // roughness — so a glass shade would have drawn as an OPAQUE pale-blue tube:
        // the material correctly resolved and incorrectly applied, with the UI still
        // reporting it as applied (C100 §2.1). `DoubleSide` because you see the far
        // wall of an open glass cylinder through the near one.
        //
        // ⚠ The opaque branch is spelled SEPARATELY on purpose: passing
        // `{transparent:false, opacity:1}` would be visually identical but would
        // change the `sharedMat` cache KEY for all twenty pre-existing families,
        // re-minting their materials for no reason. Opaque rows keep their exact key.
        const bodyMat = look.transparent
            ? sharedMat(look.color, {
                metalness: look.metalness, roughness: look.roughness,
                transparent: true, opacity: look.opacity, side: THREE.DoubleSide,
            })
            : sharedMat(look.color, { metalness: look.metalness, roughness: look.roughness });

        // The lens tint is DERIVED from the fixture's CCT, not typed: a 6500 K exit
        // sign must not glow the same colour as a 2700 K chandelier. This is an
        // EMITTED colour, not a material finish — the "never a hand-typed hex" rule
        // is about body materials, and this value is computed, not authored.
        const lensTint = '#' + kelvinToHex(row.kelvin).toString(16).padStart(6, '0');

        return {
            row,
            L: this._mm(o.lengthMm ?? row.lMm),
            W: this._mm(o.widthMm ?? row.wMm),
            D: this._mm(o.depthMm ?? row.dMm),
            drop: this._mm(o.dropMm ?? row.dropMm ?? 0),
            tilt: (o.tiltDeg ?? 0) * (Math.PI / 180),
            arms: Math.max(2, Math.min(12, Math.round(o.armCount ?? row.arms ?? 6))),
            // §LIGHT102 — a canopy the user set to 0 must STAY 0, so `??` (not `||`):
            // an explicit "no canopy" is a real answer, not a missing one.
            canopy: Math.max(0, this._mm(o.canopyMm ?? row.canopyMm ?? 0)),
            endChamfer: Math.max(0, this._mm(row.endChamferMm ?? 0)),
            bodyMat,
            bodyColor: look.color,
            bodyMetalness: look.metalness,
            bodyRoughness: look.roughness,
            bodyOpacity: look.opacity,
            bodyTransparent: look.transparent,
            lensTint,
        };
    }

    /**
     * Build any LOD-200 family. Dispatches on the row's ARCHETYPE, so the twenty
     * families need no per-family code path at all.
     */
    private _buildLod200(data: LightingData): THREE.Group {
        const ctx = this._lod200Ctx(data);
        const g = new THREE.Group();
        if (!ctx) return g;
        switch (ctx.row.archetype) {
            case 'can': this._lod200Can(g, ctx); break;
            case 'bar': this._lod200Bar(g, ctx); break;
            case 'disc': this._lod200Disc(g, ctx); break;
            case 'cone': this._lod200Cone(g, ctx); break;
            case 'post': this._lod200Post(g, ctx); break;
            case 'arms': this._lod200Arms(g, ctx); break;
            case 'yoke': this._lod200Yoke(g, ctx); break;
            case 'sign': this._lod200Sign(g, ctx); break;
            // §LIGHT102 (L-11500) — the three decorative masses.
            case 'dome': this._lod200Dome(g, ctx); break;
            case 'capsule': this._lod200Capsule(g, ctx); break;
            case 'tube': this._lod200Tube(g, ctx); break;
            // §OUTDOOR112 — the three site masses.
            case 'bollard': this._lod200Bollard(g, ctx); break;
            case 'globe_post': this._lod200GlobePost(g, ctx); break;
            case 'street_arm': this._lod200StreetArm(g, ctx); break;
        }
        return g;
    }

    /**
     * §LIGHT102 (L-11500) — the visible CEILING ROSE, shared by every suspended
     * archetype that authors one.
     *
     * ⭐ This is the founder's seventh reference fixture, and it is a HELPER rather
     * than a family: a canopy is where a pendant meets its ceiling, so it belongs
     * to whichever pendant is hanging, not to a luminaire of its own (C84 EI-9).
     * Guarded on `canopy > 0`, so every pre-existing row — none of which authors
     * one — draws exactly what it drew before.
     *
     * Radius is DERIVED from the body, clamped to the 50–110 mm band real ceiling
     * roses occupy: a 500 mm disc pendant must not arrive wearing a 70 mm-radius
     * dinner plate on the soffit.
     */
    private _lod200Canopy(g: THREE.Group, c: Lod200Ctx): void {
        if (c.canopy <= 0) return;
        const r = Math.min(0.11, Math.max(0.05, c.L * 0.14));
        const rose = new THREE.Mesh(
            new THREE.CylinderGeometry(r, r * 0.92, c.canopy, SEG_TRIM),
            c.bodyMat,
        );
        rose.position.y = -c.canopy / 2;
        rose.castShadow = true;
        g.add(rose);
    }

    /**
     * §LIGHT102 (L-11500) — a single suspension cable from the canopy to the body.
     *
     * Spans from the underside of the canopy to `-drop`, so a fixture with a
     * canopy has no gap and one without still hangs from the mount plane.
     */
    private _lod200Cable(g: THREE.Group, c: Lod200Ctx, radius = 0.005): void {
        const top = -c.canopy;
        const len = Math.max(0, c.drop - c.canopy);
        if (len <= 0) return;
        const cable = new THREE.Mesh(
            new THREE.CylinderGeometry(radius, radius, len, SEG_CABLE),
            c.bodyMat,
        );
        cable.position.y = top - len / 2;
        g.add(cable);
    }

    /**
     * DOME — §LIGHT102 (L-11500), founder reference #1: a wide SPHERICAL-CAP bowl
     * with an EXPOSED GLOBE hanging beneath its mouth.
     *
     * ⛔ Not a `cone`. A truncated cone and a spherical cap are different surfaces,
     * and the difference is the entire read of the fixture — a bowl curves away
     * from the eye, a cone runs straight to its rim. `_lod200Cone` already draws
     * the cone for the high bay; reusing it here would have shipped the founder a
     * high-bay reflector with a bulb under it.
     *
     * The globe is the LENS: the fixture's luminous body is genuinely the visible
     * sphere, which is what makes the row's 300° beam angle a description rather
     * than a decoration.
     */
    private _lod200Dome(g: THREE.Group, c: Lod200Ctx): void {
        this._lod200Canopy(g, c);
        this._lod200Cable(g, c, 0.006);

        const r = c.L / 2;
        const mouthY = -c.drop;

        // The bowl: a sphere sliced so its OPEN rim has radius `r` and its crown
        // sits `c.D` above that rim. Same construction as `emissiveLens`'s cap,
        // solved for the authored depth instead of a bulge fraction, and left
        // OPEN-ENDED (no cap) so the globe is seen inside it.
        const depth = Math.max(0.02, c.D * 0.55);
        const sphereR = (r * r + depth * depth) / (2 * depth);
        const phi = Math.asin(Math.min(1, r / sphereR));
        const bowlGeo = new THREE.SphereGeometry(
            sphereR, SEG_BODY, Math.max(8, Math.round(SEG_BODY / 2)), 0, Math.PI * 2, 0, phi,
        );
        // As built, the crown sits at local y = sphereR and the open rim at
        // y = sphereR·cos φ, which is exactly sphereR − depth (that identity is what
        // choosing sphereR from (r, depth) buys). So translating by
        // `mouthY − (sphereR − depth)` lands the RIM on the mouth plane and the crown
        // `depth` above it — the bowl opens downward into the room.
        bowlGeo.translate(0, mouthY - (sphereR - depth), 0);
        const bowl = new THREE.Mesh(
            bowlGeo,
            sharedMat(c.bodyColor, {
                metalness: c.bodyMetalness, roughness: c.bodyRoughness, side: THREE.DoubleSide,
            }),
        );
        bowl.castShadow = true;
        g.add(bowl);

        // The exposed globe, hanging BELOW the bowl's mouth — the whole point of
        // the fixture. Radius via the SHARED `domeGlobeRadius` so the emitter offset
        // anchors on the same sphere (see §LIGHT102 on that function).
        const globeR = domeGlobeRadius(r);
        const globe = new THREE.Mesh(
            new THREE.SphereGeometry(globeR, SEG_LENS, Math.max(8, Math.round(SEG_LENS / 2))),
            sharedLensMat(c.lensTint, LOD200_LENS_BASE),
        );
        globe.position.y = mouthY - globeR * 0.55;
        tagLens(globe, c.lensTint, LOD200_LENS_BASE);
        g.add(globe);
    }

    /**
     * CAPSULE — §LIGHT102 (L-11500), founder reference #3: a slim opaque PILL with
     * hemispherical ends and a RECESSED lens.
     *
     * The recessed mouth is the optic. A `can` draws its lens flush at the body
     * mouth, which would have given a wide throw and made the row's 60° beam a
     * claim the geometry contradicts; here the lower hemisphere is cut short of
     * its pole, leaving a mouth the lens sits INSIDE.
     */
    private _lod200Capsule(g: THREE.Group, c: Lod200Ctx): void {
        this._lod200Canopy(g, c);
        this._lod200Cable(g, c, 0.005);

        const r = c.L / 2;
        const topY = -c.drop;
        // The straight middle, with a hemisphere's worth of height reserved at each
        // end. Clamped at 0 so a squat capsule degrades to two hemispheres rather
        // than a negative-height cylinder (which THREE draws inside-out).
        const barrel = Math.max(0, c.D - 2 * r);

        if (barrel > 0) {
            const body = new THREE.Mesh(
                new THREE.CylinderGeometry(r, r, barrel, SEG_BODY),
                c.bodyMat,
            );
            body.position.y = topY - r - barrel / 2;
            body.castShadow = true;
            g.add(body);
        }

        // Upper shoulder — a full hemisphere.
        const shoulder = new THREE.Mesh(
            new THREE.SphereGeometry(r, SEG_BODY, Math.max(6, Math.round(SEG_BODY / 3)), 0, Math.PI * 2, 0, Math.PI / 2),
            c.bodyMat,
        );
        shoulder.position.y = topY - r;
        g.add(shoulder);

        // Lower end — a hemisphere cut at 150° of arc, so it still READS as
        // hemispherical while leaving a real aperture at the bottom.
        const base = new THREE.Mesh(
            new THREE.SphereGeometry(r, SEG_BODY, Math.max(6, Math.round(SEG_BODY / 3)), 0, Math.PI * 2, Math.PI / 2, CAPSULE_MOUTH_PHI - Math.PI / 2),
            sharedMat(c.bodyColor, {
                metalness: c.bodyMetalness, roughness: c.bodyRoughness, side: THREE.DoubleSide,
            }),
        );
        base.position.y = topY - r - barrel;
        base.castShadow = true;
        g.add(base);

        // The lens sits INSIDE the mouth, not across it. ⚠ `_lod200EmitterOffset`
        // reproduces this exact expression for the `capsule` case — keep them equal.
        const mouthR = r * CAPSULE_MOUTH_R;
        g.add(this._lod200Lens(mouthR * 0.9, c, topY - r - barrel - CAPSULE_MOUTH_DROP * r * 0.55, 0, 0, 0.12));
    }

    /**
     * TUBE — §LIGHT102 (L-11500), founder reference #4: an open CLEAR-GLASS
     * cylinder with the lamp visible inside.
     *
     * ⭐ The first TRANSPARENT shade in the matrix. Its transparency is not
     * authored here — it is the `glass-clear` master row's own `opacity` /
     * `transparent`, carried through `lod200BodyAppearance` and pooled by
     * `sharedMat` (which keys on its options, so all glass tubes share ONE
     * material — a `.clone()` here would be the per-instance leak LIGHT99 removed).
     */
    private _lod200Tube(g: THREE.Group, c: Lod200Ctx): void {
        this._lod200Canopy(g, c);
        this._lod200Cable(g, c, 0.004);

        const r = c.L / 2;
        const topY = -c.drop;

        // A metal collar at the top, so the fixture has a body and the cable does
        // not appear to enter the glass. It is the CANOPY's material, not the
        // shade's — a glass collar would be invisible.
        const collarMat = sharedMat(c.bodyColor, {
            metalness: c.bodyMetalness, roughness: c.bodyRoughness,
        });
        const collar = new THREE.Mesh(
            new THREE.CylinderGeometry(r * 1.02, r * 1.02, Math.min(0.03, c.D * 0.12), SEG_TRIM),
            collarMat,
        );
        collar.position.y = topY - Math.min(0.03, c.D * 0.12) / 2;
        g.add(collar);

        // The glass: open-ended, so both faces are seen. ⛔ No `castShadow` — a
        // clear shade that cast an opaque shadow would contradict its own material.
        const glass = new THREE.Mesh(
            new THREE.CylinderGeometry(r, r, c.D, SEG_BODY, 1, true),
            c.bodyMat,
        );
        glass.position.y = topY - c.D / 2;
        g.add(glass);

        // The lamp INSIDE the glass — this is what a clear shade is for, and what
        // makes the row's 340° beam angle describe the fixture rather than decorate it.
        const lampR = Math.max(0.028, r * 0.45);
        const lamp = new THREE.Mesh(
            new THREE.SphereGeometry(lampR, SEG_LENS, Math.max(8, Math.round(SEG_LENS / 2))),
            sharedLensMat(c.lensTint, LOD200_LENS_BASE),
        );
        lamp.position.y = topY - c.D * 0.55;
        tagLens(lamp, c.lensTint, LOD200_LENS_BASE);
        g.add(lamp);
    }

    // ── §OUTDOOR112 (2026-08-26) — the founder's five OUTDOOR SITE fixtures ──
    //
    // ⭐ BORN WITHIN THE MESH BUDGET, through ONE road. Every body part below is
    // drawn in the pooled `c.bodyMat` with `castShadow = true`, so
    // `_consolidateFixtureMeshes` (§MESH110-FIXTURE-MERGE) collapses them into
    // ONE body mesh per fixture; the luminous parts are `LENS_ROLE` and stay
    // separate by that method's contract. Result: bollard = 2 meshes, globe post
    // = 2–3, street luminaire = 2 — a path of twenty bollards is forty draws,
    // not two hundred. No second merge authority is minted here.
    //
    // All three stand UP from the floor plane (+Y from the group origin), like
    // `post`: the seating datum is the ground, and the fixture rises from it.

    /**
     * BOLLARD — §OUTDOOR112, founder outdoor #2 (louvred) and #3 (diffuser band):
     * a cylinder whose head is a LATERAL luminous band under a flat cap, sliced
     * by `row.louvres` horizontal slats (0 = the clean diffuser band).
     *
     * ⛔ Not `post`. `_lod200Post` conceals its lens UNDER the cap, facing down —
     * a full-cut-off optic that lights the path and never the eye (the legacy
     * `bollard_light`, untouched). The founder's bollards show a side-emitting
     * band: the luminous body is visible from across the path, which is a
     * different fixture and a different distribution, not a parameter.
     *
     * The band is recessed (0.90 r) behind slats at 1.03 r, so the louvres read
     * IN FRONT of the diffuser exactly as in his reference — and the emitter
     * anchor sits at the band's centre via the shared `bollardHeadLayout`.
     */
    private _lod200Bollard(g: THREE.Group, c: Lod200Ctx): void {
        const r = c.L / 2;
        const h = c.D;                                   // for a bollard, `dMm` is the HEIGHT
        const { capH, bandH, bandCentreY } = bollardHeadLayout(h);
        const louvres = Math.max(0, Math.min(12, Math.round(c.row.louvres ?? 0)));

        const shaftH = h - capH - bandH;
        const shaft = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.04, shaftH, SEG_BODY), c.bodyMat);
        shaft.position.y = shaftH / 2;
        shaft.castShadow = true;
        g.add(shaft);

        const cap = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.05, r * 1.05, capH, SEG_BODY), c.bodyMat);
        cap.position.y = h - capH / 2;
        cap.castShadow = true;
        g.add(cap);

        // Louvre slats, evenly across the band. Same material and shadow intent
        // as the shaft, so the consolidation pass folds them into the body.
        const slatH = Math.min(0.012, bandH * 0.12);
        for (let i = 0; i < louvres; i++) {
            const slat = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.03, r * 1.03, slatH, SEG_BODY), c.bodyMat);
            slat.position.y = shaftH + bandH * ((i + 0.5) / louvres);
            slat.castShadow = true;
            g.add(slat);
        }

        // The luminous band — the fixture's actual emitting body. Open-ended, so
        // it is a surface not a solid, and recessed behind the slats.
        const band = new THREE.Mesh(
            new THREE.CylinderGeometry(r * 0.90, r * 0.90, bandH * 0.96, SEG_LENS, 1, true),
            sharedLensMat(c.lensTint, LOD200_LENS_BASE),
        );
        band.position.y = bandCentreY;
        tagLens(band, c.lensTint, LOD200_LENS_BASE);
        g.add(band);
    }

    /**
     * GLOBE POST — §OUTDOOR112, founder outdoor #1 (globe mini-bollard) and #4
     * (globe post light): base + post/pole + a GLOWING TRANSLUCENT SPHERE.
     *
     * ⭐ The globe is a LENS that is also SEE-THROUGH. Its emission is the row's
     * kelvin (like every lens); its translucency is `row.headMaterialId`'s
     * master-row `opacity`/`transparent` — `glass-frosted` for both rows —
     * carried through `lod200BodyAppearance` (L-11501) into the lens pool and
     * remembered by `tagLens`, so it SURVIVES `_syncLens`. ⛔ No `castShadow`
     * on the globe: a translucent shade casting an opaque shadow would
     * contradict its own material (the `tube` rule).
     *
     * `louvres > 0` (the mini-bollard): the founder's louvre stack sits INSIDE
     * the globe with a flat cap on top. `louvres` absent (the post light): a
     * visible lamp sits inside instead — what a frosted globe is for.
     */
    private _lod200GlobePost(g: THREE.Group, c: Lod200Ctx): void {
        const poleR = c.L / 2;
        const poleH = c.D;                               // `dMm` is the pole/post height
        const head  = globePostHead(poleH, c.row.headMm, poleR);
        const louvres = Math.max(0, Math.min(12, Math.round(c.row.louvres ?? 0)));

        const baseR = Math.max(poleR * 1.7, 0.06);
        const baseH = Math.min(0.05, poleH * 0.1);
        const base = new THREE.Mesh(new THREE.CylinderGeometry(baseR, baseR * 1.05, baseH, SEG_BODY), c.bodyMat);
        base.position.y = baseH / 2;
        base.castShadow = true;
        g.add(base);

        const poleLen = Math.max(0.01, poleH - baseH);
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(poleR, poleR * 1.06, poleLen, SEG_BODY), c.bodyMat);
        pole.position.y = baseH + poleLen / 2;
        pole.castShadow = true;
        g.add(pole);

        // The globe — translucent from the head master material, glowing from the
        // row's kelvin. Unresolved head id → opaque lens (never an invented alpha).
        const headLook = c.row.headMaterialId ? lod200BodyAppearance(c.row.headMaterialId) : null;
        const opacity     = headLook?.opacity ?? 1;
        const transparent = headLook?.transparent ?? false;
        const globe = new THREE.Mesh(
            new THREE.SphereGeometry(head.r, SEG_LENS, Math.max(8, Math.round(SEG_LENS / 2))),
            sharedLensMat(c.lensTint, LOD200_LENS_BASE, opacity, transparent),
        );
        globe.position.y = head.centreY;
        tagLens(globe, c.lensTint, LOD200_LENS_BASE, opacity, transparent);
        g.add(globe);

        if (louvres > 0) {
            // The founder's louvre stack inside the globe, and its flat cap on top.
            const stackH = head.r;
            const slatH  = Math.min(0.01, stackH * 0.12);
            for (let i = 0; i < louvres; i++) {
                const slat = new THREE.Mesh(
                    new THREE.CylinderGeometry(head.r * 0.58, head.r * 0.58, slatH, SEG_BODY), c.bodyMat,
                );
                slat.position.y = head.centreY - stackH / 2 + stackH * ((i + 0.5) / louvres);
                slat.castShadow = true;
                g.add(slat);
            }
            const capH = 0.018;
            const cap = new THREE.Mesh(
                new THREE.CylinderGeometry(head.r * 0.42, head.r * 0.42, capH, SEG_BODY), c.bodyMat,
            );
            cap.position.y = head.centreY + head.r * 0.96 + capH / 2;
            cap.castShadow = true;
            g.add(cap);
        } else {
            // The lamp INSIDE the globe — visible through the frosted shade, and
            // the reason the row's 320° beam describes the fixture.
            const lampR = Math.max(0.03, head.r * 0.28);
            const lamp = new THREE.Mesh(
                new THREE.SphereGeometry(lampR, SEG_LENS, Math.max(8, Math.round(SEG_LENS / 2))),
                sharedLensMat(c.lensTint, LOD200_LENS_BASE),
            );
            lamp.position.y = head.centreY;
            tagLens(lamp, c.lensTint, LOD200_LENS_BASE);
            g.add(lamp);
        }
    }

    /**
     * STREET ARM — §OUTDOOR112, founder outdoor #5: a pole, a CANTILEVERED arm
     * along +Z, and a flat, slightly-raked rectangular LED head with a
     * down-facing lens. The head's long axis (`lMm`) runs along the arm — over
     * the road; `wMm` is across it; `dMm` is the pole height; `stemMm` the reach.
     *
     * Nothing existing cantilevers: `yoke` is a wall bracket. The rake is the
     * shared `streetArmLayout` (+6°), plus the instance `tiltDeg` override, and
     * the lens tilts WITH the head so the drawn emission and the light agree.
     */
    private _lod200StreetArm(g: THREE.Group, c: Lod200Ctx): void {
        const s = streetArmLayout(c.D, c.row.stemMm, c.L);

        // A tapered street column: full section at the ground, 85% at the top.
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(s.poleR * 0.85, s.poleR, c.D, SEG_BODY), c.bodyMat);
        pole.position.y = c.D / 2;
        pole.castShadow = true;
        g.add(pole);

        // The cantilever, from the pole axis to the head centre, along +Z.
        const arm = new THREE.Mesh(
            new THREE.CylinderGeometry(s.poleR * 0.5, s.poleR * 0.5, s.headCentreZ, SEG_THIN), c.bodyMat,
        );
        arm.rotation.x = Math.PI / 2;
        arm.position.set(0, s.armY, s.headCentreZ / 2);
        arm.castShadow = true;
        g.add(arm);

        const rake = s.rakeRad + c.tilt;
        const head = new THREE.Mesh(new THREE.BoxGeometry(c.W, s.headThk, c.L), c.bodyMat);
        head.rotation.x = rake;
        head.position.set(0, s.headCentreY, s.headCentreZ);
        head.castShadow = true;
        g.add(head);

        // The LED face under the head — the same rake, so it aims where the head does.
        const lens = this._lod200Lens(0, c, 0, c.W * 0.86, c.L * 0.80);
        lens.rotation.x = rake;
        lens.position.set(0, s.headCentreY - s.headThk / 2 - 0.004, s.headCentreZ);
        g.add(lens);
    }

    /** CAN — cylindrical body ± trim ring ± stem. Recessed downlights, adjustable
     *  downlights, wall washers, emergency downlights, track heads. */
    private _lod200Can(g: THREE.Group, c: Lod200Ctx): void {
        const r = c.L / 2;
        // §LIGHT102 (L-11500) — the suspension length is the stem PLUS the drop.
        //
        // `pendant_cylinder_spot` is a `can` on a 900 mm rod, and it authors that as
        // `dropMm` rather than `stemMm` deliberately: `suspended` is DERIVED from the
        // drop and `constructionFormFor` reads `suspended`, so a pendant authored on a
        // stem would have been classified as a flush DOWNLIGHT in every schedule.
        // ⚠ `track_head` (stem 90, drop 0) and every recessed row (drop 0) are
        // arithmetically untouched by this line.
        const stem = this._mm(c.row.stemMm ?? 0) + c.drop;
        this._lod200Canopy(g, c);

        // A tiltable head is its own sub-group so the aim rotates the BODY and its
        // lens together — tilting only the lens would light a direction the fixture
        // is not pointing, which is the failure an adjustable downlight exists to avoid.
        const head = new THREE.Group();

        if (c.row.recessed) {
            // Body sits INSIDE the ceiling void (+Y, above the soffit); only the trim
            // ring and the lens are visible in the room. That is the whole visual
            // difference between a recessed fixture and a surface one.
            const body = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.92, r * 0.92, c.D, SEG_BODY), c.bodyMat);
            body.position.y = c.D / 2;
            head.add(body);
            const trim = new THREE.Mesh(new THREE.TorusGeometry(r, r * 0.08, 8, SEG_TRIM), c.bodyMat);
            trim.rotation.x = Math.PI / 2;
            head.add(trim);
            head.add(this._lod200Lens(r * 0.82, c, -0.005));
        } else {
            // Surface / track: a stem drops the head clear of the ceiling plane.
            if (stem > 0) {
                const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, stem, SEG_CABLE), c.bodyMat);
                rod.position.y = -stem / 2;
                g.add(rod);
            }
            const body = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.92, c.D, SEG_BODY), c.bodyMat);
            body.position.y = -(c.D / 2);
            body.castShadow = true;
            head.add(body);
            head.add(this._lod200Lens(r * 0.88, c, -c.D));
        }

        head.position.y = -stem;
        head.rotation.x = c.tilt;
        g.add(head);
    }

    /** BAR — rectangular body with a lens face. The workhorse: recessed slots,
     *  troffers, surface battens, coves (face up), under-cabinet strips, suspended
     *  linears, up/down sconces, wall packs and step markers. */
    private _lod200Bar(g: THREE.Group, c: Lod200Ctx): void {
        const body = this._lod200BarBody(c);
        // ⚠ `castShadow` does not propagate to a Group's children, and a chamfered
        // body IS a group of three. `traverse` covers both shapes — on a plain Mesh
        // it visits only itself, so the square-cut rows are unaffected.
        const setBodyShadow = (v: boolean): void => {
            body.traverse((n) => { if ((n as THREE.Mesh).isMesh) n.castShadow = v; });
        };

        if (c.row.mount === 'wall') {
            // Wall frame convention, matching `_buildMirrorLight`: the fixture
            // projects along +Z out of the wall face. A recessed marker sinks INTO
            // the wall instead (−Z), leaving only its lens proud.
            body.position.set(0, 0, c.row.recessed ? -c.W / 2 : c.W / 2);
            g.add(body);
            const face = this._lod200Lens(0, c, 0, c.L * 0.9, c.D * 0.55);
            face.position.set(0, c.row.recessed ? 0 : -c.D / 2, c.row.recessed ? 0.004 : c.W * 0.98);
            g.add(face);
            if (c.row.face === 'updown') {
                const up = this._lod200Lens(0, c, 0, c.L * 0.9, c.D * 0.55);
                up.position.set(0, c.D / 2, c.W * 0.98);
                up.rotation.x = Math.PI;
                g.add(up);
            }
            return;
        }

        // Ceiling frame: +Y is into the void, −Y is into the room.
        if (c.drop > 0) {
            // Two suspension cables at the quarter points — what makes a suspended
            // linear read as suspended rather than a surface batten in mid-air.
            for (const sx of [-c.L * 0.35, c.L * 0.35]) {
                const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, c.drop, SEG_CABLE), c.bodyMat);
                cable.position.set(sx, -c.drop / 2, 0);
                g.add(cable);
            }
        }
        // Recessed: body above the soffit, lens flush at the mount plane.
        // Surface/suspended: the body hangs below its mount plane.
        const topY = -c.drop;
        body.position.y = c.row.recessed ? topY + c.D / 2 : topY - c.D / 2;
        setBodyShadow(!c.row.recessed);
        g.add(body);

        if (c.row.face === 'down' || c.row.face === 'updown') {
            const lensY = c.row.recessed ? topY - 0.004 : topY - c.D;
            g.add(this._lod200Lens(0, c, lensY, c.L * 0.92, c.W * 0.92));
        }
        if (c.row.face === 'up' || c.row.face === 'updown') {
            // Face UP is what makes a cove INDIRECT: the lens points at the ceiling
            // and the room sees only the wash, never the source.
            const up = this._lod200Lens(0, c, topY + 0.004, c.L * 0.92, c.W * 0.92);
            up.rotation.x = Math.PI;
            g.add(up);
        }
    }

    /**
     * §LIGHT102 (L-11500) — the `bar` body, with CHAMFERED ENDS when the row
     * authors them.
     *
     * ⭐ Founder reference #2 is the existing `linear_pendant` row (already
     * `face: 'updown'` with a real up-lens, already two cables, already a 700 mm
     * drop). Lane LIGHT99 mapped it as REUSE and named the ONE missing thing: the
     * chamfered end profile. This is that one thing.
     *
     * ⚠ BUILT AS THREE PIECES, and the first draft that did NOT is worth recording
     * because it was silently wrong: it took ONE `BoxGeometry(L, D, W)` and pulled
     * every vertex at |x| = L/2 toward the mid-plane, on the assumption that only
     * the two end faces sit there. **Every vertex of a box is a corner**, so all 24
     * matched and the whole bar was scaled — `linear_pendant`'s body became 20 mm
     * deep instead of 70 mm, uniformly, with no chamfer anywhere. It rendered as a
     * plausible thinner bar, which is exactly why the probe had to measure the
     * geometry rather than trust the edit.
     *
     * So the taper is expressed where a taper can actually live: a CORE of length
     * `L − 2·ch` at full depth, plus one wedge per end of length `ch` whose OUTER
     * half (selected by the SIGN of x, not its magnitude — that distinction is the
     * whole fix) runs out to a thin lip, exactly as a mitred aluminium end cap does.
     *
     * ⛔ Guarded on `endChamferMm > 0`, which ONLY `linear_pendant` authors. The
     * other nine `bar` rows — a 600 × 600 troffer, a plaster-in slot, a step marker
     * — are square-cut by construction and get back the identical single
     * `BoxGeometry` mesh they always did, not a group of one. Chamfering the
     * ARCHETYPE instead of the ROW would have re-shaped every one of them.
     */
    private _lod200BarBody(c: Lod200Ctx): THREE.Object3D {
        const ch = Math.min(c.endChamfer, c.L * 0.2);
        if (ch <= 0) return new THREE.Mesh(new THREE.BoxGeometry(c.L, c.D, c.W), c.bodyMat);

        // How much of the end face survives, as a fraction of the body depth. A
        // chamfer of `ch` on a body of depth `D` leaves a lip of `D − 2·ch`, floored
        // at 25% so a deep chamfer narrows the end rather than collapsing it to a
        // zero-area knife edge (which would produce degenerate normals).
        const lip = Math.max(0.25, (c.D - 2 * ch) / c.D);
        const g = new THREE.Group();

        const core = new THREE.Mesh(new THREE.BoxGeometry(c.L - 2 * ch, c.D, c.W), c.bodyMat);
        g.add(core);

        for (const sign of [1, -1]) {
            const geo = new THREE.BoxGeometry(ch, c.D, c.W);
            const pos = geo.attributes.position as THREE.BufferAttribute;
            for (let i = 0; i < pos.count; i++) {
                // SIGN, not magnitude: this selects the twelve vertices on the OUTER
                // half of the wedge — including the shared corners the top, bottom,
                // front and back faces contribute — so the piece stays watertight.
                if (pos.getX(i) > 0) pos.setY(i, pos.getY(i) * lip);
            }
            pos.needsUpdate = true;
            geo.computeVertexNormals();
            const wedge = new THREE.Mesh(geo, c.bodyMat);
            wedge.position.x = sign * (c.L / 2 - ch / 2);
            if (sign < 0) wedge.rotation.y = Math.PI;   // taper points outward at both ends
            g.add(wedge);
        }
        return g;
    }

    /**
     * DISC — flush circular oyster with a domed lens, or (§LIGHT102, L-11500) the
     * same disc SUSPENDED on a canopy and cables.
     *
     * ⭐ Founder references #6 AND #7 are this one archetype and this one row:
     * `pendant_disc` with `canopyMm: 80` is "flat disc with a visible canopy", and
     * `lod200Params.canopyMm = 0` is the bare disc. A canopy is a mounting detail
     * (C84 EI-9); it does not earn a family.
     *
     * ⚠ `disc` previously ignored `drop` entirely — its only row was a flush
     * oyster, so nothing noticed. The suspension is guarded on `drop > 0`, which
     * means `surface_ceiling_disc` (no drop, no canopy) renders byte-for-byte what
     * it rendered before.
     */
    private _lod200Disc(g: THREE.Group, c: Lod200Ctx): void {
        const r = c.L / 2;
        const topY = -c.drop;
        if (c.drop > 0) {
            this._lod200Canopy(g, c);
            // TWO cables at opposite quarter points — what makes a wide disc read as
            // hanging level rather than balanced on a single stalk. Same reasoning as
            // the suspended linear in `_lod200Bar`.
            const span = Math.min(r * 0.6, 0.18);
            const len = Math.max(0, c.drop - c.canopy);
            if (len > 0) {
                for (const sx of [-span, span]) {
                    const cable = new THREE.Mesh(
                        new THREE.CylinderGeometry(0.004, 0.004, len, SEG_CABLE), c.bodyMat,
                    );
                    cable.position.set(sx, -c.canopy - len / 2, 0);
                    g.add(cable);
                }
            }
        }
        const body = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.96, c.D, SEG_BODY), c.bodyMat);
        body.position.y = topY - c.D / 2;
        body.castShadow = true;
        g.add(body);
        g.add(this._lod200Lens(r * 0.9, c, topY - c.D, 0, 0, 0.3));
    }

    /** CONE — industrial high-bay reflector on a drop rod. */
    private _lod200Cone(g: THREE.Group, c: Lod200Ctx): void {
        if (c.drop > 0) {
            const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, c.drop, SEG_CABLE), c.bodyMat);
            rod.position.y = -c.drop / 2;
            g.add(rod);
        }
        const r = c.L / 2;
        // Open-ended cone, so BOTH faces must shade or the reflector reads inside-out.
        // Taken from the pool with `side` in the key rather than cloned per fixture —
        // a `.copy()` here would mint one material per high bay, which is precisely
        // the per-instance-material defect this builder was cleaned up to remove.
        const body = new THREE.Mesh(
            new THREE.CylinderGeometry(r * 0.35, r, c.D, SEG_BODY, 1, true),
            sharedMat(c.bodyColor, { metalness: c.bodyMetalness, roughness: c.bodyRoughness, side: THREE.DoubleSide }),
        );
        body.position.y = -(c.drop + c.D / 2);
        body.castShadow = true;
        g.add(body);
        g.add(this._lod200Lens(r * 0.9, c, -(c.drop + c.D), 0, 0, 0.12));
    }

    /** POST — free-standing bollard. Stands UP from the floor plane (+Y). */
    private _lod200Post(g: THREE.Group, c: Lod200Ctx): void {
        const r = c.L / 2;
        const h = c.D;                       // for a post, `dMm` is the HEIGHT
        const shaft = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.05, h * 0.88, SEG_BODY), c.bodyMat);
        shaft.position.y = (h * 0.88) / 2;
        shaft.castShadow = true;
        g.add(shaft);
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.06, r * 1.06, h * 0.05, SEG_TRIM), c.bodyMat);
        cap.position.y = h - h * 0.025;
        g.add(cap);
        // The luminous band sits UNDER the cap and faces DOWN — a bollard lights the
        // path, not the sky. Drawing it as an up-facing globe would be the wrong
        // fixture and the wrong lighting design.
        g.add(this._lod200Lens(r * 0.92, c, h * 0.9));
    }

    /** ARMS — canopy, stem, and N radial arms with small lenses (chandelier). */
    private _lod200Arms(g: THREE.Group, c: Lod200Ctx): void {
        const canopy = new THREE.Mesh(new THREE.CylinderGeometry(c.L * 0.12, c.L * 0.12, 0.03, SEG_TRIM), c.bodyMat);
        canopy.position.y = -0.015;
        g.add(canopy);
        if (c.drop > 0) {
            const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, c.drop, SEG_CABLE), c.bodyMat);
            stem.position.y = -(c.drop / 2);
            g.add(stem);
        }

        const hubY = -c.drop;
        const hub = new THREE.Mesh(new THREE.SphereGeometry(c.L * 0.07, SEG_BODY, SEG_THIN), c.bodyMat);
        hub.position.y = hubY;
        g.add(hub);

        const reach = c.L / 2;
        for (let i = 0; i < c.arms; i++) {
            const a = (i / c.arms) * Math.PI * 2;
            // Arms sweep slightly UPWARD from the hub, which is what makes a
            // chandelier read as a chandelier rather than as a spider.
            const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, reach, SEG_CABLE), c.bodyMat);
            arm.rotation.z = Math.PI / 2 - 0.35;
            arm.rotation.y = -a;
            arm.position.set(Math.cos(a) * reach / 2, hubY + reach * 0.17, Math.sin(a) * reach / 2);
            g.add(arm);

            const cupY = hubY + reach * 0.34;
            const cup = new THREE.Mesh(new THREE.CylinderGeometry(c.L * 0.05, c.L * 0.04, c.D * 0.14, SEG_THIN), c.bodyMat);
            cup.position.set(Math.cos(a) * reach, cupY, Math.sin(a) * reach);
            g.add(cup);

            const lens = this._lod200Lens(c.L * 0.045, c, cupY - c.D * 0.07);
            lens.position.x = Math.cos(a) * reach;
            lens.position.z = Math.sin(a) * reach;
            g.add(lens);
        }
    }

    /** YOKE — wall-mounted floodlight on a U-bracket, aimed along +Z. */
    private _lod200Yoke(g: THREE.Group, c: Lod200Ctx): void {
        const stem = this._mm(c.row.stemMm ?? 60);
        const base = new THREE.Mesh(new THREE.BoxGeometry(c.W * 0.5, c.W * 0.5, 0.02), c.bodyMat);
        base.position.z = 0.01;
        g.add(base);
        const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, stem, SEG_CABLE), c.bodyMat);
        arm.rotation.x = Math.PI / 2;
        arm.position.z = 0.02 + stem / 2;
        g.add(arm);

        // The barrel and its lens tilt TOGETHER, so the aim the user sets is the aim
        // the light actually has.
        const head = new THREE.Group();
        head.position.z = 0.02 + stem;
        head.rotation.x = c.tilt;
        const barrel = new THREE.Mesh(new THREE.BoxGeometry(c.L, c.W, c.D), c.bodyMat);
        barrel.position.z = c.D / 2;
        barrel.castShadow = true;
        head.add(barrel);
        const lens = this._lod200Lens(0, c, 0, c.L * 0.86, c.W * 0.86);
        lens.position.z = c.D + 0.004;
        lens.rotation.x = -Math.PI / 2;
        head.add(lens);
        g.add(head);
    }

    /** SIGN — internally illuminated escape-route sign on a drop rod. */
    private _lod200Sign(g: THREE.Group, c: Lod200Ctx): void {
        if (c.drop > 0) {
            const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, c.drop, SEG_CABLE), c.bodyMat);
            rod.position.y = -c.drop / 2;
            g.add(rod);
        }
        const y = -(c.drop + c.W / 2);
        const panel = new THREE.Mesh(new THREE.BoxGeometry(c.L, c.W, c.D), c.bodyMat);
        panel.position.y = y;
        g.add(panel);
        // Legible from BOTH sides — a single-sided exit sign is invisible to half the
        // escape route. LOD 200 draws the luminous PANEL, not the ISO 7010 pictogram:
        // there is no texture/decal path for fixtures in this builder, and a blank
        // panel is honest where a fake glyph would not be.
        for (const s of [1, -1]) {
            const f = this._lod200Lens(0, c, y, c.L * 0.9, c.W * 0.86);
            f.position.z = s * (c.D / 2 + 0.003);
            f.rotation.x = s > 0 ? -Math.PI / 2 : Math.PI / 2;
            g.add(f);
        }
    }

    /**
     * The luminous face for a LOD-200 fixture.
     *
     * `radius > 0` gives the domed circular lens `emissiveLens()` already builds
     * (round archetypes); otherwise a flat rectangular face `planeL × planeW` is
     * used, because a troffer's lens IS a rectangle and forcing it into a disc
     * would misdraw the most-specified office fixture there is.
     *
     * Both share the module-level `sharedLensMat` pool, so twenty families add ZERO
     * per-instance materials — the defect that cost this project its instancing once.
     */
    private _lod200Lens(
        radius: number,
        c: Lod200Ctx,
        y: number,
        planeL = 0,
        planeW = 0,
        bulge = 0.18,
    ): THREE.Mesh {
        if (radius > 0) {
            const m = emissiveLens(radius, c.lensTint, LOD200_LENS_BASE, bulge);
            m.position.y = y;
            return m;
        }
        const geo = new THREE.PlaneGeometry(Math.max(0.01, planeL), Math.max(0.01, planeW));
        geo.rotateX(Math.PI / 2);   // face −Y (down into the room) by default
        const mesh = new THREE.Mesh(geo, sharedLensMat(c.lensTint, LOD200_LENS_BASE));
        mesh.position.y = y;
        tagLens(mesh, c.lensTint, LOD200_LENS_BASE);
        return mesh;
    }

    /**
     * Where a LOD-200 fixture's emitter sits, in the fixture's own frame.
     *
     * ⚠ This is the half that was MISSING for `mirror_light`, which left its light
     * inside the wall plane contributing almost nothing (see that case below).
     * Deriving the anchor from the ARCHETYPE rather than per family means a
     * twenty-first row cannot repeat it: the row inherits its archetype's anchor.
     *
     * ⛔ §LIGHT102 (L-11500) — THIS SWITCH IS THE TRAP. It RETURNS from every arm
     * and carries no `default`, so a new `Lod200Archetype` member makes the
     * function return `undefined`, the emitter silently falls back to the group
     * origin (inside the ceiling), and the ROOT `tsc` gate fails. Lane LIGHT99
     * started widening the union, hit exactly this, and reverted. The three
     * §LIGHT102 archetypes are handled below. ⛔ Do NOT add a `default` to "fix"
     * it — the exhaustiveness is the guard rail, and a default would turn a build
     * failure into a fixture that lights from inside its own housing.
     */
    private _lod200EmitterOffset(data: LightingData): { x: number; y: number; z: number } | null {
        const c = this._lod200Ctx(data);
        if (!c) return null;
        // §LIGHT102 — stem AND drop, matching `_lod200Can`'s suspension length.
        const stem = this._mm(c.row.stemMm ?? 0) + c.drop;
        switch (c.row.archetype) {
            case 'can':
                return { x: 0, y: c.row.recessed ? -0.02 : -(stem + c.D + 0.02), z: 0 };
            case 'bar':
                if (c.row.mount === 'wall') {
                    // Just PROUD of the wall face, never inside it.
                    return { x: 0, y: -c.D * 0.5, z: (c.row.recessed ? 0.02 : c.W) + 0.02 };
                }
                // Face 'up' emits toward the ceiling from just above the body.
                return c.row.face === 'up'
                    ? { x: 0, y: -c.drop + c.D + 0.05, z: 0 }
                    : { x: 0, y: -(c.drop + (c.row.recessed ? 0.02 : c.D + 0.02)), z: 0 };
            // §LIGHT102 — `disc` now honours its drop (it had only a flush row).
            case 'disc': return { x: 0, y: -(c.drop + c.D + 0.03), z: 0 };
            case 'cone': return { x: 0, y: -(c.drop + c.D + 0.05), z: 0 };
            case 'post': return { x: 0, y: c.D * 0.85, z: 0 };
            case 'arms': return { x: 0, y: -(c.drop + c.D * 0.1), z: 0 };
            case 'yoke': return { x: 0, y: 0, z: this._mm(c.row.stemMm ?? 60) + c.D + 0.05 };
            case 'sign': return { x: 0, y: -(c.drop + c.W / 2), z: 0 };

            // ── §LIGHT102 (L-11500) — the three decorative masses ────────────
            // Each anchor is the fixture's ACTUAL luminous body, not a guess:
            // getting this wrong is what left `mirror_light` emitting from inside
            // a wall, which is the defect this whole function exists to prevent.
            case 'dome':
                // The EXPOSED GLOBE, which hangs just below the bowl's mouth. The
                // emitter must be under the bowl or the bowl occludes its own lamp.
                return { x: 0, y: -(c.drop + domeGlobeRadius(c.L / 2) * 0.55), z: 0 };
            case 'capsule': {
                // Inside the recessed mouth at the bottom of the lower hemisphere —
                // the SAME arithmetic `_lod200Capsule` seats its lens with, so the
                // beam leaves exactly where the fixture is drawn to emit.
                const r = c.L / 2;
                const barrel = Math.max(0, c.D - 2 * r);
                return { x: 0, y: -(c.drop + r + barrel + CAPSULE_MOUTH_DROP * r * 0.55), z: 0 };
            }
            case 'tube':
                // The lamp INSIDE the glass, at 55% of the shade height — a clear
                // shade does not occlude, so the emitter belongs where the lamp is.
                return { x: 0, y: -(c.drop + c.D * 0.55), z: 0 };

            // ── §OUTDOOR112 (2026-08-26) — the three site masses ──────────────
            // Each anchor is the SAME arithmetic the builder draws with (the
            // shared layout functions at module scope), never a second guess.
            case 'bollard':
                // The centre of the luminous band under the cap.
                return { x: 0, y: bollardHeadLayout(c.D).bandCentreY, z: 0 };
            case 'globe_post':
                // The centre of the glowing globe atop the pole.
                return { x: 0, y: globePostHead(c.D, c.row.headMm, c.L / 2).centreY, z: 0 };
            case 'street_arm': {
                // Just under the LED face at the end of the arm — over the road,
                // not at the pole.
                const s = streetArmLayout(c.D, c.row.stemMm, c.L);
                return { x: 0, y: s.headCentreY - s.headThk / 2 - 0.05, z: s.headCentreZ };
            }
        }
    }

    private _detachLight(id: string, group: THREE.Group): void {
        const light = this._lights.get(id);
        if (!light) return;
        group.remove(light);
        this._lights.delete(id);
        // §FIX-LIGHT-PLACE-FREEZE (L-10080) — PARK, don't discard. See `_lightPool`.
        // Bounded at the live budget: a parked light beyond that is dropped for GC.
        if ((light as THREE.PointLight).isPointLight && this._lightPool.length < this.liveLightBudget) {
            light.userData.elementId = undefined;
            this._lightPool.push(light as THREE.PointLight);
        }
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

    /**
     * §C13-BUILDER-SCENE-CLEAR — detach EVERY fixture root from the scene, without
     * tearing the builder down.
     *
     * `dispose()` above is TERMINAL: it drops the day/night subscription and frees the
     * shared material pools. Calling it at a project switch would leave the incoming
     * project's fixtures unlit and unsubscribed (the L-224 dead-listener class of bug),
     * which is why the C13 sweep must call this instead (C13 §3.8/§3.10).
     * Invoked by the `bim-project-cleared` sweep in `initBuilders.ts`.
     */
    clearProjectGeometry(): void {
        for (const id of [...this._roots.keys()]) this.remove(id);
    }
}
