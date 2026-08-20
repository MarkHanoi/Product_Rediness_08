/**
 * @file packages/core-app-model/src/rendering/SceneQualityTierManager.ts
 *
 * SceneQualityTierManager — ADR-0076 Axis 1 (§PERF-WEBGPU-FRAGMENT, 2026-06-24).
 *
 * A PURE decision service: given a live scene mesh count (already produced by
 * FrustumCullingService) it maps to a SceneQualityTier and the render settings
 * that tier implies (SSGI / TRAA / reflection probes / shadow level / decorative
 * furniture shadows / whole-scene PBR re-traverse).
 *
 * It does NOT touch THREE, does NOT call requestAnimationFrame, and does NOT read
 * or mutate any store. The wiring layer (RenderingPipelineCoordinator, which
 * already owns the THREE side and the tested mutators activateSSGI /
 * deactivateSSGI / ShadowQualityUpgrader.setLevel / RenderPerformanceService.
 * setQualityLevel) consults this service and applies the result.
 *
 * Design rationale (ADR-0076):
 *   - On small/normal scenes the mesh count stays in `cinematic`/`balanced`, whose
 *     settings equal TODAY's behaviour — zero change.
 *   - Only scenes that are ALREADY heavy (>6k / >15k meshes) step down post-FX /
 *     shadow cost. Degrading an already-overloaded scene is strictly safer than
 *     leaving it overloaded.
 *
 * Hysteresis: tier boundaries use a symmetric guard band (HYSTERESIS_FRACTION) so
 * a scene hovering at a threshold cannot thrash SSGI/shadow on and off. A step
 * DOWN (toward lower quality) fires at the upper edge of the band; a step UP
 * (toward higher quality) only fires once the count drops below the lower edge.
 *
 * Contract compliance:
 *   P2 — imports no THREE at all.
 *   P3 — no requestAnimationFrame.
 *   P8 — every exported function carries an OpenTelemetry span.
 *   C04 §3.5 / ADR-006 — quality scaling is the sanctioned large-model lever; the
 *                        WebGL2 fallback path stays first-class.
 */

import { trace, SpanStatusCode, type Attributes } from '@opentelemetry/api';

const TRACER = trace.getTracer('@pryzm/core-app-model/scene-quality-tier', '0.1.0');

/** Fire a tiny `pryzm.scene-quality.<verb>` span (no-op until a provider is wired). */
function withTierSpan<T>(verb: string, attrs: Attributes, fn: () => T): T {
    const span = TRACER.startSpan(`pryzm.scene-quality.${verb}`, { attributes: attrs });
    try {
        const out = fn();
        span.setStatus({ code: SpanStatusCode.OK });
        return out;
    } catch (err) {
        span.setStatus({ code: SpanStatusCode.ERROR });
        span.setAttribute('error', true);
        throw err;
    } finally {
        span.end();
    }
}

// ── Tiers ───────────────────────────────────────────────────────────────────

/**
 * Render quality tier, ordered best → cheapest.
 *   cinematic   — full post-FX, ultra probes (small showcase scenes).
 *   balanced    — full post-FX, no probes (TODAY's default for normal scenes).
 *   performance — SSGI off, TRAA on, standard shadows, decorative shadows off.
 *   survival    — all post-FX off; bare scene to keep very large models usable.
 */
export type SceneQualityTier = 'cinematic' | 'balanced' | 'performance' | 'survival';

/** Ordered cheapest→best so a numeric index gives direction-of-change. */
const TIER_ORDER: readonly SceneQualityTier[] = [
    'survival',
    'performance',
    'balanced',
    'cinematic',
];

/**
 * Mesh-count UPPER bound (inclusive) for each tier, at the nominal boundary.
 *
 * §PERF-WEBGPU-FRAGMENT re-tune (2026-06-25): the `balanced` ceiling dropped
 * 6000→2500 so a typical generated building (~4000 meshes — the founder's real
 * case) lands in `performance` (SSGI OFF, shadow=standard, decorative-furniture
 * shadows OFF) for a real frame-time win, instead of `balanced` (which kept the
 * heavy SSGI/TRAA/high-shadow pipeline). Small showcase scenes (≤1500) stay
 * `cinematic` = full quality, unchanged.
 */
const TIER_UPPER_BOUND: Record<SceneQualityTier, number> = {
    cinematic: 1_500,
    balanced: 2_500,
    performance: 15_000,
    survival: Number.POSITIVE_INFINITY,
};

/** Symmetric hysteresis band as a fraction of the boundary (±10%). */
const HYSTERESIS_FRACTION = 0.1;

/**
 * §PERF-LARGE-SCENE-TIER-CAP (ADR-0094) — hard mesh-count ceiling above which the
 * render tier is CAPPED at `performance` (SSGI OFF, TRAA OFF, shadow ≤ standard, no
 * decorative-furniture shadows), regardless of the nominal cinematic/balanced band.
 *
 * Evidence: a generated office tower logged
 *   `[SceneQualityTier] 1211 meshes → tier=cinematic (SSGI/TRAA/shadow=high)`
 * and was terrible to interact with — the heavy cinematic post-FX pipeline
 * (SSGI + TRAA + high shadows) is unaffordable on a 1200+-mesh building. The
 * nominal `cinematic` ceiling (1500) and `balanced` ceiling (2500) both keep
 * SSGI/TRAA/high-shadow ON, so a ~1211-mesh tower stayed cinematic.
 *
 * Set to 1200 — just below the observed 1211-mesh tower — so:
 *   - genuinely small / normal scenes (< 1200 meshes: single showcase rooms, a
 *     house, one apartment) keep cinematic/balanced EXACTLY as before (zero change);
 *   - any scene at/above ~1200 meshes (multi-storey towers, generated buildings) is
 *     capped at `performance` for a real interaction win.
 *
 * This is a one-directional CAP: it can only LOWER the tier a large scene would
 * otherwise get, never raise a small scene's tier. The `performance`/`survival`
 * step-down at 15k meshes is unaffected (those are already ≤ performance).
 */
const LARGE_SCENE_PERFORMANCE_CAP_MESH_COUNT = 1_200;

/**
 * The richest tier permitted at/above {@link LARGE_SCENE_PERFORMANCE_CAP_MESH_COUNT}.
 * `performance` = SSGI off, TRAA off, shadow=standard, decorative shadows off.
 */
const LARGE_SCENE_CAP_TIER: SceneQualityTier = 'performance';

// ── Settings ────────────────────────────────────────────────────────────────

/** A 'high' or 'ultra' or 'standard' shadow level, matching ShadowQualityUpgrader. */
export type TierShadowLevel = 'standard' | 'high' | 'ultra';

/** The render settings a tier implies. Consumed by the wiring layer. */
export interface SceneQualitySettings {
    /** Screen-space GI (SSGINode) — expensive per-frame compute. */
    readonly ssgi: boolean;
    /** Temporal AA colour filter. */
    readonly traa: boolean;
    /** Per-room CubeCamera reflection probes (ultra only). */
    readonly reflectionProbes: boolean;
    /** Shadow-map quality level. */
    readonly shadowLevel: TierShadowLevel;
    /**
     * §SHADOW-DEVICE-LOSS-FIX (Fix 2) — whether the shadow map is enabled AT ALL.
     *
     * True on cinematic/balanced/performance (shadows work as before). FALSE only on
     * `survival` (enormous scenes — the 40-storey office logged 14283 shadow-flagged
     * meshes): allocating a shadow pass over that many casters is what churns the
     * ShadowDepthTexture and loses the WebGPU device ("Destroyed texture used in a
     * submit"). Turning the shadow map OFF removes the pass entirely — the trigger AND
     * a large perf win. Only the very-heavy survival path changes; every normal scene
     * keeps shadows exactly as today.
     */
    readonly shadows: boolean;
    /**
     * Whether decorative furniture (plants, lamps, rugs, wall decor, curtains)
     * should cast shadows. False at performance+ to cut shadow-caster count.
     */
    readonly decorativeFurnitureShadows: boolean;
    /**
     * Whether the expensive whole-scene/post-batch PBR upgrade is permitted.
     *
     * Measured cost (founder, real 785-element / 4073-mesh building):
     *   post-batch PBRSceneUpgrader = 38.7 SECONDS wall-clock (materials look
     *   unfinished for ~38s as 4073 meshes trickle through needsUpdate → WebGPU
     *   PSO recompiles). This is THE project-open bottleneck, not negligible.
     *
     * So this is true ONLY at `cinematic` (≤1500 meshes — small showcase scenes
     * where the cosmetic envMapIntensity/toneMapped tuning is affordable). At
     * `balanced` and above the upgrade is SKIPPED: the base MeshStandardMaterial
     * is already PBR-capable and renders correctly without the tuning pass.
     */
    readonly fullScenePbrTraverse: boolean;
}

const TIER_SETTINGS: Record<SceneQualityTier, SceneQualitySettings> = {
    cinematic: {
        // §FIX-SSGI-DEFAULT-OFF-TRAA-SELECT-FLASH (founder L-59) — SSGI + TRAA now
        // default OFF on WebGPU even at the richest tier. SSGINode's per-frame
        // denoise temporal accumulation flickers ALL elements every frame, and the
        // TRAA colour-filter is applied via a pipeline REBUILD (activateTRAA →
        // _rebuildPipelineWithCurrentState → WebGPU shader recompile) that presents a
        // ~1s BLACK frame whenever the tier hook toggles it (e.g. a tier transition on
        // selection/scene edit). Both are now purely USER-OPT-IN via the RenderRail
        // toggles (rpm.activateSSGI/activateTRAA), never auto-enabled by tier escalation.
        // Turning them off here means the tier's SSGI/TRAA hooks are never driven ON, so
        // no tier-driven rebuild-to-black. Everything else (probes, high shadows, full
        // PBR on small scenes) is unchanged — the shadow-device-loss fixes are untouched.
        ssgi: false,
        traa: false,
        reflectionProbes: true,
        shadowLevel: 'high',
        shadows: true,
        decorativeFurnitureShadows: true,
        fullScenePbrTraverse: true,
    },
    balanced: {
        // §FIX-SSGI-DEFAULT-OFF-TRAA-SELECT-FLASH (founder L-59) — see cinematic above.
        ssgi: false,
        traa: false,
        reflectionProbes: false,
        shadowLevel: 'high',
        shadows: true,
        decorativeFurnitureShadows: true,
        // Skip the 38.7s post-batch PBR upgrade on anything beyond a small showcase
        // scene — base MeshStandardMaterial already renders correctly without it.
        fullScenePbrTraverse: false,
    },
    performance: {
        ssgi: false,
        // §PERF-WEBGPU-FRAGMENT re-tune — TRAA OFF at performance too, to shed the
        // per-frame temporal-reprojection cost on heavy generated buildings. The
        // goal of this tier is a real frame-time win, so all the heavy post-FX go.
        traa: false,
        reflectionProbes: false,
        shadowLevel: 'standard',
        shadows: true,
        decorativeFurnitureShadows: false,
        fullScenePbrTraverse: false,
    },
    survival: {
        ssgi: false,
        traa: false,
        reflectionProbes: false,
        shadowLevel: 'standard',
        // §SHADOW-DEVICE-LOSS-FIX (Fix 2) — shadows OFF on survival. On the 40-storey
        // office (15009 meshes → survival; 14283 shadow-flagged) the shadow pass churns
        // the ShadowDepthTexture and loses the WebGPU device. Dropping the shadow map
        // removes the crash trigger and is a big frame-time win.
        shadows: false,
        decorativeFurnitureShadows: false,
        fullScenePbrTraverse: false,
    },
};

// ── Pure decision functions ───────────────────────────────────────────────────

/**
 * Returns the immutable settings for a tier. Pure.
 *
 * P8: `pryzm.scene-quality.settings` span.
 */
export function settingsForTier(tier: SceneQualityTier): SceneQualitySettings {
    return withTierSpan('settings', { 'pryzm.scene_quality.tier': tier }, () => TIER_SETTINGS[tier]);
}

/**
 * §PERF-WEBGL2-NO-SSGI — backend gate. The mesh-count tier above is backend-AGNOSTIC,
 * but the heavy post-FX it can enable (SSGI / TRAA) are only affordable on a real
 * WebGPU backend. On the WebGL2 fallback backend (a `THREE.WebGPURenderer` created
 * with `forceWebGL: true`, or a plain WebGLRenderer) the legacy multi-pass denoised
 * `SSGIService` runs on the main GL thread and makes each frame take ~seconds on a
 * heavy scene — the viewport renders but cannot orbit (the freeze this fixes).
 *
 * §PERF-WEBGL2-NO-TSL already gates the renderer-three TSL pipeline (SSGI/outlines/
 * post-FX) on the same authoritative `backend.isWebGPUBackend === true` signal, but
 * the tier's `ssgi` flag drives a SECOND, independent activation path
 * (`RenderingPipelineCoordinator._onTierSsgi → window.enableSSGI → SSGIService`).
 * This gate closes that path: on a non-real-WebGPU backend it forces SSGI and TRAA
 * OFF and caps shadows to the lightweight `standard` level (no decorative-furniture
 * shadows, no reflection probes) REGARDLESS of the mesh-count tier — so the WebGL2
 * path is genuinely lightweight (standard PBR + basic shadows → smooth orbit).
 *
 * Authoritative input: `isWebGPU` = `RenderPipelineManager.isRealWebGPUBackend()`
 * (i.e. `backend.isWebGPUBackend === true`). On real WebGPU the settings are returned
 * UNCHANGED — WebGPU behaviour is exactly as today (SSGI/TRAA still by tier).
 *
 * `isWebGPU === undefined` (unknown / not yet wired) is treated as "leave unchanged"
 * so cold-start behaviour for small scenes is preserved; callers that know the
 * backend (the coordinator) always pass the real flag.
 *
 * Pure. P8: `pryzm.scene-quality.backend-gate` span.
 */
export function applyBackendGate(
    settings: SceneQualitySettings,
    isWebGPU: boolean | undefined,
): SceneQualitySettings {
    return withTierSpan(
        'backend-gate',
        { 'pryzm.scene_quality.is_webgpu': isWebGPU ?? 'unknown' },
        () => {
            // Real WebGPU (or unknown) → no change: WebGPU runs SSGI/TRAA by tier.
            if (isWebGPU !== false) return settings;
            // Non-real-WebGPU (forced-WebGL2 / WebGL) → force the lightweight path.
            if (!settings.ssgi && !settings.traa
                && settings.shadowLevel === 'standard'
                && !settings.decorativeFurnitureShadows
                && !settings.reflectionProbes) {
                return settings; // already lightweight — avoid a needless clone
            }
            return {
                ...settings,
                ssgi: false,
                traa: false,
                reflectionProbes: false,
                decorativeFurnitureShadows: false,
                // Cap to the lightweight shadow level (basic shadows on WebGL2).
                shadowLevel: 'standard',
            };
        },
    );
}

/**
 * Map a raw mesh count to a tier WITHOUT hysteresis (the nominal mapping).
 * Used as the baseline; `computeTier` layers hysteresis on top.
 *
 * P8: `pryzm.scene-quality.nominal` span.
 */
export function nominalTierForMeshCount(meshCount: number): SceneQualityTier {
    return withTierSpan(
        'nominal',
        { 'pryzm.scene_quality.mesh_count': meshCount },
        () => {
            const n = Number.isFinite(meshCount) ? Math.max(0, meshCount) : 0;
            const base: SceneQualityTier =
                n <= TIER_UPPER_BOUND.cinematic ? 'cinematic'
                : n <= TIER_UPPER_BOUND.balanced ? 'balanced'
                : n <= TIER_UPPER_BOUND.performance ? 'performance'
                : 'survival';
            // §PERF-LARGE-SCENE-TIER-CAP (ADR-0094) — one-directional cap: a large
            // scene (≥ 1200 meshes, the 1211-tower evidence) can be no richer than
            // `performance`. Returns whichever of {base, cap} is CHEAPER, so it only
            // ever lowers quality for heavy scenes and never raises a small scene's tier.
            if (n >= LARGE_SCENE_PERFORMANCE_CAP_MESH_COUNT) {
                return cheaperTier(base, LARGE_SCENE_CAP_TIER);
            }
            return base;
        },
    );
}

/** Return whichever of the two tiers is CHEAPER (lower in TIER_ORDER). Pure helper. */
function cheaperTier(a: SceneQualityTier, b: SceneQualityTier): SceneQualityTier {
    return TIER_ORDER.indexOf(a) <= TIER_ORDER.indexOf(b) ? a : b;
}

/**
 * Compute the tier for `meshCount`, applying hysteresis relative to `prevTier`.
 *
 * Behaviour:
 *   - If `prevTier` is undefined, returns the nominal tier (cold start).
 *   - A step DOWN (lower quality) only fires once the count exceeds the boundary
 *     by +HYSTERESIS_FRACTION (i.e. clearly over).
 *   - A step UP (higher quality) only fires once the count drops below the lower
 *     boundary by −HYSTERESIS_FRACTION (i.e. clearly under).
 *   - Within the band, the previous tier is held — no thrash.
 *
 * Pure. P8: `pryzm.scene-quality.compute` span.
 */
export function computeTier(meshCount: number, prevTier?: SceneQualityTier): SceneQualityTier {
    return withTierSpan(
        'compute',
        {
            'pryzm.scene_quality.mesh_count': Number.isFinite(meshCount) ? meshCount : -1,
            'pryzm.scene_quality.prev_tier': prevTier ?? 'none',
        },
        () => {
            const n = Number.isFinite(meshCount) ? Math.max(0, meshCount) : 0;
            const nominal = nominalTierForMeshCount(n);
            if (prevTier === undefined) return nominal;
            if (nominal === prevTier) return prevTier;

            // §PERF-LARGE-SCENE-TIER-CAP (ADR-0094) — the large-scene cap is DECISIVE,
            // not subject to the ±10% hysteresis hold. Otherwise a scene that GREW
            // through cinematic up to ~1211 meshes would be held at cinematic by the
            // step-down band (cinematic bound 1500 × 1.1 = 1650 > 1211) and never take
            // the cap — exactly the 1211-mesh tower freeze. So once the scene is at/above
            // the cap threshold, snap straight to the capped tier if it is richer than
            // the cap; the ±10% band applies only BELOW the threshold (see hysteresis
            // below for stepping back up as the scene shrinks under the cap).
            if (n >= LARGE_SCENE_PERFORMANCE_CAP_MESH_COUNT) {
                if (TIER_ORDER.indexOf(prevTier) > TIER_ORDER.indexOf(LARGE_SCENE_CAP_TIER)) {
                    return nominal; // already capped by nominalTierForMeshCount
                }
                // prevTier is already ≤ cap — fall through to normal hysteresis so the
                // performance/survival boundary at 15k still gets its guard band.
            }

            const prevIdx = TIER_ORDER.indexOf(prevTier);
            const nomIdx = TIER_ORDER.indexOf(nominal);

            // Direction of the proposed change.
            const steppingDown = nomIdx < prevIdx; // toward cheaper
            const steppingUp = nomIdx > prevIdx;   // toward richer

            if (steppingDown) {
                // Only step down once we are clearly OVER the prevTier's upper bound.
                const bound = TIER_UPPER_BOUND[prevTier];
                const threshold = bound * (1 + HYSTERESIS_FRACTION);
                return n > threshold ? nominal : prevTier;
            }

            if (steppingUp) {
                // §PERF-LARGE-SCENE-TIER-CAP (ADR-0094) — when stepping UP OUT of the
                // capped `performance` tier back toward cinematic/balanced, the binding
                // boundary is the large-scene cap (1200), not the balanced boundary
                // (2500). Apply the cap's own ±10% band so a scene wobbling around 1200
                // meshes does not thrash cinematic↔performance: only release the cap once
                // the count drops clearly below 1200 − band (≈1080).
                if (prevTier === LARGE_SCENE_CAP_TIER) {
                    const capRelease = LARGE_SCENE_PERFORMANCE_CAP_MESH_COUNT * (1 - HYSTERESIS_FRACTION);
                    return n < capRelease ? nominal : prevTier;
                }
                // To step UP (toward richer quality) we must drop clearly BELOW the
                // boundary that separates prevTier from the next-richer tier. That
                // boundary is the UPPER BOUND of the tier exactly one step richer
                // than prevTier in quality order (TIER_ORDER[prevIdx + 1]). e.g.
                // leaving `performance` upward, the performance/balanced boundary is
                // TIER_UPPER_BOUND.balanced (6000); we only step up below 6000 − band.
                const richerNeighbour = TIER_ORDER[prevIdx + 1];
                const bound = richerNeighbour !== undefined
                    ? TIER_UPPER_BOUND[richerNeighbour]
                    : 0;
                const threshold = bound * (1 - HYSTERESIS_FRACTION);
                return n < threshold ? nominal : prevTier;
            }

            return prevTier;
        },
    );
}

// ── Stateful convenience wrapper ───────────────────────────────────────────────

/**
 * §RENDER-QUALITY-USER-PIN (L-1512) — what one `update()` decided, and WHY.
 *
 * `tier` / `changed` / `settings` are the original shape and mean exactly what they
 * always did, so every existing caller is unaffected. The two new fields exist so the
 * UI can be HONEST rather than merely obedient: a user who pins `cinematic` on a
 * 4,102-mesh building is overriding the ADR-0094 cap, and a stutter that follows must be
 * attributable to that choice rather than mysterious. A control that silently outranks a
 * documented cap and says nothing is how a "the renderer got worse" report arrives six
 * weeks later with no cause attached.
 */
export interface SceneQualityDecision {
    /** The tier that was APPLIED — the pin when one is set, otherwise the automatic tier. */
    readonly tier: SceneQualityTier;
    /** True when the APPLIED tier differs from the previously applied one. */
    readonly changed: boolean;
    /** The settings for `tier`, always after {@link applyBackendGate}. */
    readonly settings: SceneQualitySettings;
    /**
     * What the automatic mesh-count policy (hysteresis + the ADR-0094 large-scene cap)
     * would have chosen. Equals `tier` whenever no pin is set.
     */
    readonly automaticTier: SceneQualityTier;
    /** True when `tier` came from {@link SceneQualityTierManager.setTierOverride}. */
    readonly pinned: boolean;
}

/**
 * A tiny stateful holder for the wiring layer: remembers the last applied tier
 * so `update(meshCount)` can apply hysteresis across calls and report whether the
 * tier actually changed (so the caller debounces / only re-applies on change).
 *
 * Holds NO THREE state — purely the last tier. Reversible: `reset()` clears it.
 */
export class SceneQualityTierManager {
    private _tier: SceneQualityTier | undefined = undefined;

    /**
     * §RENDER-QUALITY-USER-PIN (L-1512) — an EXPLICIT user choice that outranks the
     * automatic mesh-count policy, or `null` for "Auto".
     *
     * THE FOUNDER'S REPORT: *"Lately the quality WebGPU has decreased — probably to remove
     * some performance error — however I would like to ad-hoc be able to have a sound
     * rendering shadow quality."* He is right about the cause:
     * {@link LARGE_SCENE_PERFORMANCE_CAP_MESH_COUNT} caps ANY scene at/above 1,200 meshes
     * to `performance` (shadowLevel `standard`, no decorative-furniture shadows), and his
     * real building is ~4,100 meshes. No amount of scene editing can reach `balanced` or
     * `cinematic` from there — the cap is decisive and deliberately not subject to
     * hysteresis. That cap is CORRECT as an automatic default; what was missing is a way
     * for a user to say "I accept the frame cost on this scene".
     *
     * ⚠ THE PIN IS NOT A CAPABILITY CLAIM. It is applied BEFORE {@link applyBackendGate},
     * never instead of it. WebGL2 physically cannot run the TSL SSGI/TRAA pipeline — that
     * is a property of the backend, not a preference — so a pin to `cinematic` on WebGL2
     * still comes back with `ssgi: false`, `traa: false` and `shadowLevel: 'standard'`. A
     * preference may overrule a POLICY; it may never overrule a CAPABILITY. (The
     * mesh-count shadow ceiling the wiring layer applies on top — shadows OFF at ≥ 8,000
     * meshes, §SHADOW-DEVICE-LOSS-FIX — is likewise a crash guard, not a policy, and a pin
     * does not reach it.)
     *
     * The pin does NOT participate in hysteresis: {@link _tier} keeps tracking the
     * AUTOMATIC tier underneath, so clearing the pin returns byte-identical automatic
     * behaviour rather than resuming from wherever the pin left the state machine. That
     * property is pinned by a test.
     */
    private _override: SceneQualityTier | null = null;

    /** The last `meshCount` passed to {@link update} — `undefined` before the first call. */
    private _lastMeshCount: number | undefined = undefined;
    /** The last `isWebGPU` passed to {@link update}. */
    private _lastIsWebGPU: boolean | undefined = undefined;
    /** The last tier actually APPLIED (pin-aware) — drives `changed`. */
    private _lastAppliedTier: SceneQualityTier | undefined = undefined;

    /**
     * The tier currently in force — the pin when one is set, otherwise the held automatic
     * tier. `undefined` only before the first update() with no pin set.
     */
    get currentTier(): SceneQualityTier | undefined {
        return this._override ?? this._tier;
    }

    /** The held AUTOMATIC tier, ignoring any pin. `undefined` before the first update(). */
    get automaticTier(): SceneQualityTier | undefined {
        return this._tier;
    }

    /** The explicit user pin, or `null` for "Auto". */
    get tierOverride(): SceneQualityTier | null {
        return this._override;
    }

    /** The mesh count the last {@link update} was given, so a caller can re-apply with it. */
    get lastMeshCount(): number | undefined {
        return this._lastMeshCount;
    }

    /** The backend flag the last {@link update} was given, so a caller can re-apply with it. */
    get lastIsWebGPU(): boolean | undefined {
        return this._lastIsWebGPU;
    }

    /**
     * §RENDER-QUALITY-USER-PIN (L-1512) — pin the render tier explicitly, or pass `null`
     * to return to the automatic mesh-count policy.
     *
     * Setting a pin does NOT itself re-apply anything — this class is a decision service
     * and owns no THREE state (P2/P3). The caller re-drives the wiring layer, which is why
     * {@link lastMeshCount} / {@link lastIsWebGPU} are exposed: re-applying with the SAME
     * inputs is what makes the pin take effect immediately instead of at the next
     * geometry event.
     *
     * P8: `pryzm.scene-quality.set-override` span.
     */
    setTierOverride(tier: SceneQualityTier | null): void {
        withTierSpan(
            'set-override',
            { 'pryzm.scene_quality.override': tier ?? 'auto' },
            () => {
                this._override = tier;
            },
        );
    }

    /**
     * Recompute the tier from the latest mesh count (with hysteresis vs the held
     * tier) and store it. Returns `{ tier, changed, settings }`.
     *
     * `changed` is true only when the tier transitioned, so the caller can skip
     * re-applying identical settings every frame.
     *
     * §PERF-WEBGL2-NO-SSGI — `isWebGPU` is the authoritative backend flag
     * (`RenderPipelineManager.isRealWebGPUBackend()`). When `false` the returned
     * settings are run through {@link applyBackendGate} so SSGI / TRAA are forced
     * OFF (and shadows capped to `standard`) regardless of the mesh-count tier —
     * the heavy `SSGIService` never activates on the WebGL2 fallback backend. The
     * held tier is the backend-AGNOSTIC mesh-count tier (so hysteresis is identical
     * across backends); only the SETTINGS are gated. `undefined` / `true` leave the
     * settings unchanged (real-WebGPU behaviour is exactly as today).
     *
     * P8: `pryzm.scene-quality.update` span.
     */
    update(
        meshCount: number,
        isWebGPU?: boolean,
    ): SceneQualityDecision {
        return withTierSpan(
            'update',
            {
                'pryzm.scene_quality.mesh_count': Number.isFinite(meshCount) ? meshCount : -1,
                'pryzm.scene_quality.is_webgpu': isWebGPU ?? 'unknown',
            },
            () => {
                // §RENDER-QUALITY-USER-PIN (L-1512) — the AUTOMATIC tier advances on every
                // update whether or not a pin is set. Feeding the pin back into the
                // hysteresis state would make "clear the pin" resume from the pin rather
                // than from where the scene actually is; keeping the two separate is what
                // makes the unpinned path byte-identical to the pre-pin behaviour.
                const automaticTier = computeTier(meshCount, this._tier);
                this._tier = automaticTier;
                this._lastMeshCount = meshCount;
                this._lastIsWebGPU = isWebGPU;

                const next = this._override ?? automaticTier;
                const changed = next !== this._lastAppliedTier;
                this._lastAppliedTier = next;

                // The backend gate runs on the PINNED tier too, and last — SSGI/TRAA on
                // WebGL2 are a capability the machine does not have, not a preference the
                // user may express. See the `_override` docblock.
                const settings = applyBackendGate(settingsForTier(next), isWebGPU);
                return { tier: next, changed, settings, automaticTier, pinned: this._override !== null };
            },
        );
    }

    /**
     * Forget the held tier (e.g. on project close). The next update() is a cold start.
     *
     * §RENDER-QUALITY-USER-PIN (L-1512) — this deliberately does NOT clear the user's pin.
     * The pin is a statement of intent by a person; the hysteresis state is a derived
     * cache. Dropping the first because we are dropping the second is the same defect
     * §HEURISTIC-MAY-OVERRIDE-A-PIN-BUT-NEVER-OVERWRITE-IT (L-1483) records for the
     * renderer-backend preference. Use `setTierOverride(null)` to clear a pin.
     */
    reset(): void {
        withTierSpan('reset', {}, () => {
            this._tier = undefined;
            this._lastAppliedTier = undefined;
            this._lastMeshCount = undefined;
            this._lastIsWebGPU = undefined;
        });
    }
}

/** Module-level singleton for the wiring layer to share one hysteresis state. */
export const sceneQualityTierManager = new SceneQualityTierManager();
