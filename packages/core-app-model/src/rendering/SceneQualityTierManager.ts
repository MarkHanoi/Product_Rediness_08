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

/** Mesh-count UPPER bound (inclusive) for each tier, at the nominal boundary. */
const TIER_UPPER_BOUND: Record<SceneQualityTier, number> = {
    cinematic: 1_500,
    balanced: 6_000,
    performance: 15_000,
    survival: Number.POSITIVE_INFINITY,
};

/** Symmetric hysteresis band as a fraction of the boundary (±10%). */
const HYSTERESIS_FRACTION = 0.1;

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
        ssgi: true,
        traa: true,
        reflectionProbes: true,
        shadowLevel: 'high',
        decorativeFurnitureShadows: true,
        fullScenePbrTraverse: true,
    },
    balanced: {
        ssgi: true,
        traa: true,
        reflectionProbes: false,
        shadowLevel: 'high',
        decorativeFurnitureShadows: true,
        // Skip the 38.7s post-batch PBR upgrade on anything beyond a small showcase
        // scene — base MeshStandardMaterial already renders correctly without it.
        fullScenePbrTraverse: false,
    },
    performance: {
        ssgi: false,
        traa: true,
        reflectionProbes: false,
        shadowLevel: 'standard',
        decorativeFurnitureShadows: false,
        fullScenePbrTraverse: false,
    },
    survival: {
        ssgi: false,
        traa: false,
        reflectionProbes: false,
        shadowLevel: 'standard',
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
            if (n <= TIER_UPPER_BOUND.cinematic) return 'cinematic';
            if (n <= TIER_UPPER_BOUND.balanced) return 'balanced';
            if (n <= TIER_UPPER_BOUND.performance) return 'performance';
            return 'survival';
        },
    );
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
 * A tiny stateful holder for the wiring layer: remembers the last applied tier
 * so `update(meshCount)` can apply hysteresis across calls and report whether the
 * tier actually changed (so the caller debounces / only re-applies on change).
 *
 * Holds NO THREE state — purely the last tier. Reversible: `reset()` clears it.
 */
export class SceneQualityTierManager {
    private _tier: SceneQualityTier | undefined = undefined;

    /** The currently held tier, or undefined before the first update(). */
    get currentTier(): SceneQualityTier | undefined {
        return this._tier;
    }

    /**
     * Recompute the tier from the latest mesh count (with hysteresis vs the held
     * tier) and store it. Returns `{ tier, changed, settings }`.
     *
     * `changed` is true only when the tier transitioned, so the caller can skip
     * re-applying identical settings every frame.
     *
     * P8: `pryzm.scene-quality.update` span.
     */
    update(meshCount: number): { tier: SceneQualityTier; changed: boolean; settings: SceneQualitySettings } {
        return withTierSpan(
            'update',
            { 'pryzm.scene_quality.mesh_count': Number.isFinite(meshCount) ? meshCount : -1 },
            () => {
                const next = computeTier(meshCount, this._tier);
                const changed = next !== this._tier;
                this._tier = next;
                return { tier: next, changed, settings: settingsForTier(next) };
            },
        );
    }

    /** Forget the held tier (e.g. on project close). The next update() is a cold start. */
    reset(): void {
        withTierSpan('reset', {}, () => {
            this._tier = undefined;
        });
    }
}

/** Module-level singleton for the wiring layer to share one hysteresis state. */
export const sceneQualityTierManager = new SceneQualityTierManager();
