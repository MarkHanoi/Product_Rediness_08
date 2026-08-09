/**
 * @file LiveLightBudget.ts
 * §FEAT-FIXTURE-PHOTOMETRY / §FIX-LIGHT-NIGHT-CONTRIBUTION (2026-08-06)
 *
 * A bounded budget of LIVE (real THREE) fixture lights, with deterministic
 * importance ordering and tier-driven degradation.
 *
 * ── Why a budget ───────────────────────────────────────────────────────────
 * "Every fixture emits light" is the product requirement; "every fixture owns a
 * real point light forever" is a crash. A residential plate can hold 200+
 * fixtures, and this project already has documented WebGPU heavy-scene device
 * losses. THREE compiles per-light uniforms into every material's shader, so
 * unbounded lights cost O(meshes × lights) in the fragment shader and force a
 * program recompile whenever the count changes.
 *
 * The resolution is a two-tier emission model, NOT a cull:
 *   1. EVERY fixture always keeps its EMISSIVE LENS mesh, whose intensity comes
 *      from the same photometry. A fixture outside the budget still visibly
 *      reads as switched-on — it just stops illuminating its neighbours.
 *   2. The N most important fixtures additionally get a real point light.
 *
 * Importance = distance from the focus point (the camera), ascending. The lights
 * you can see are the lights that are live. Ties break on `id` so the selection
 * is deterministic and testable.
 *
 * ── Layer / principle compliance ───────────────────────────────────────────
 *   P2 — no THREE. Operates on plain `{ id, x, y, z }` candidates.
 *   P3 — no rAF; the caller re-evaluates on add/remove/day-night, not per frame.
 *   P8 — every exported function carries an OpenTelemetry span.
 *   C04 §3.5 / ADR-006 — quality scaling is the sanctioned large-model lever.
 */

import { trace, SpanStatusCode, type Attributes } from '@opentelemetry/api';
import type { SceneQualityTier } from '../rendering/SceneQualityTierManager.js';

const TRACER = trace.getTracer('@pryzm/core-app-model/live-light-budget', '0.1.0');

function withBudgetSpan<T>(verb: string, attrs: Attributes, fn: () => T): T {
    const span = TRACER.startSpan(`pryzm.live-light-budget.${verb}`, { attributes: attrs });
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

/**
 * §PERF-LIGHT-COST-MODEL (2026-08-09, founder "true luminance makes the scene slow")
 * — the lighting cost model, stated once so nobody re-derives it.
 *
 * ── The two costs a live fixture light actually carries ─────────────────────
 *
 * (1) PER-FRAGMENT SHADING. THREE is a FORWARD renderer with NO light culling:
 *     `lights_fragment_begin.glsl.js` (three 0.183.2) unrolls
 *
 *         #pragma unroll_loop_start
 *         for ( int i = 0; i < NUM_POINT_LIGHTS; i ++ ) {
 *             getPointLightInfo( pointLight, geometryPosition, directLight );
 *             RE_Direct( directLight, …, material, reflectedLight );
 *         }
 *
 *     over EVERY point light for EVERY fragment of EVERY lit mesh. On a
 *     MeshStandardMaterial `RE_Direct` is `RE_Direct_Physical` — the full
 *     physical BRDF (BRDF_GGX = D_GGX + V_GGX_SmithCorrelated + F_Schlick, plus
 *     BRDF_Lambert and the multi-scatter energy terms), on the order of 70–90
 *     ALU, NOT the "~10 ALU" the previous derivation assumed. `PointLight.
 *     distance` bounds the ATTENUATION, not the loop: a fixture 40 m away that
 *     contributes exactly zero light still pays the full BRDF on every fragment.
 *
 *     Cost is therefore O(shaded_fragments × live_lights), a MULTIPLIER on the
 *     whole scene's shading — not the additive "one extra full-screen pass" the
 *     old comment claimed. The Pascal base scene runs 3 directional `RE_Direct`
 *     evaluations, so N live fixture lights multiply direct shading by (N+3)/3.
 *
 * (2) SHADER PERMUTATION CHURN. `numPointLights` is part of THREE's program
 *     cache key (`WebGLPrograms.getProgramCacheKeyParameters`), and on the
 *     WebGPU/TSL path the same fact is normative in C04 §SHADOW rule 8
 *     (`LightsNode.customCacheKey()` hashes per LIGHT). So EVERY change in the
 *     number of live fixture lights recompiles EVERY material program in the
 *     scene — the founder's "Finishing up — Compiling GPU shaders" tail and the
 *     documented PSO-compile storm that TDRs the device (ADR-0267). The budget
 *     must therefore be small AND stable, not merely bounded.
 *
 * ── Re-derived ladder ───────────────────────────────────────────────────────
 * Holding the ORIGINAL author's own ALU allowance constant and correcting only
 * the per-light cost (10 → ~80 ALU) divides the whole ladder by ~8:
 *
 *     cinematic 64 → 8   balanced 48 → 6   performance 24 → 3   survival 8 → 1
 *
 * At `cinematic` that is a (8+3)/3 ≈ 3.7× direct-shading multiplier, which is
 * the ceiling this tier already accepts for SSGI-class effects; at `survival`
 * it is 1.3×.
 *
 * This is a REDUCTION derived from a verified shader cost, not a taste knob. It
 * does NOT remove true luminance: EVERY fixture keeps its photometry-driven
 * emissive lens in both modes (see LightingFragmentBuilder._syncLens), so a
 * fixture outside the budget still reads as switched on — it just stops
 * illuminating its neighbours. The lens is the whole reason a budget is
 * acceptable at all.
 *
 * ── How to validate these numbers (they are NOT GPU-measured) ───────────────
 * `apps/bench` cannot measure GPU wall-time (no GL context in headless Node —
 * see render-pass-cost.bench.ts). Validating this ladder requires an in-browser
 * orbit-FPS capture on a scene with ≥ 64 fixtures, sweeping the budget and
 * reading frame time against C10 NFT-4 (16.6 ms p95). Until that bench exists,
 * treat these as the DERIVED-BUT-UNMEASURED values they are.
 *
 * NOTE: fixture point lights NEVER cast shadows (see §NIGHT-ALL-LIGHTS-ON in
 * LightingFragmentBuilder) — the cube-shadow-map texture-unit cap is the
 * separate, much tighter limit and belongs to the sun/key light.
 */
export const LIVE_LIGHT_BUDGET_BY_TIER: Readonly<Record<SceneQualityTier, number>> = {
    cinematic:   8,
    balanced:    6,
    performance: 3,
    survival:    1,
};

/**
 * The budget used when no tier has been reported yet (cold start).
 *
 * §FIX-LIGHT-TIER-UNWIRED — this used to be the `balanced` rung, on the
 * assumption that a tier would be reported promptly. Nothing in production ever
 * called `LightingFragmentBuilder.setQualityTier`, so this value was not a cold
 * start at all: it was the PERMANENT budget for every scene on every backend.
 * The tier is now wired (initScene's tier pass), but a cold start must still
 * open at the SAFE end of the ladder, not the middle — an unknown scene on an
 * unknown backend is the case with the least information, not the most.
 */
export const DEFAULT_LIVE_LIGHT_BUDGET = LIVE_LIGHT_BUDGET_BY_TIER.performance;

/** A fixture competing for the budget. Renderer-agnostic. */
export interface LightBudgetCandidate {
    readonly id: string;
    readonly x: number;
    readonly y: number;
    readonly z: number;
    /**
     * Optional importance boost, 0..1, added to the normalised score. Reserved
     * for "this fixture is the room's only light" style promotions. Defaults 0.
     */
    readonly boost?: number;
}

export interface LightBudgetSelection {
    /** Fixtures that get a real THREE light, nearest-first. */
    readonly live: readonly string[];
    /** Fixtures that keep only their emissive lens. */
    readonly dark: readonly string[];
    /** The budget that was applied. */
    readonly budget: number;
}

/** Resolve the live-light budget for a render tier. Never returns 0. */
export function liveLightBudgetForTier(tier: SceneQualityTier | undefined): number {
    return withBudgetSpan('for-tier', { 'pryzm.scene_quality.tier': tier ?? 'none' }, () =>
        (tier ? LIVE_LIGHT_BUDGET_BY_TIER[tier] : undefined) ?? DEFAULT_LIVE_LIGHT_BUDGET);
}

/**
 * Choose which fixtures get a real light.
 *
 * Deterministic: sorts by squared distance to `focus` ascending, then by `id`
 * ascending. `boost` subtracts from the effective distance so a promoted fixture
 * outranks an equidistant plain one.
 *
 * Guarantees (asserted by tests):
 *   • `live.length <= budget`
 *   • `live` ∪ `dark` == the input set, disjoint
 *   • the NEAREST candidate is always in `live` when `budget >= 1`
 *   • degrading the budget never drops a nearer fixture while keeping a farther one
 */
export function selectLiveLights(
    candidates: readonly LightBudgetCandidate[],
    budget: number,
    focus: { readonly x: number; readonly y: number; readonly z: number } = { x: 0, y: 0, z: 0 },
): LightBudgetSelection {
    return withBudgetSpan('select', {
        'pryzm.live_lights.candidates': candidates.length,
        'pryzm.live_lights.budget': budget,
    }, () => {
        const cap = Math.max(0, Math.floor(budget));
        if (candidates.length <= cap) {
            return { live: candidates.map((c) => c.id), dark: [], budget: cap };
        }

        const scored = candidates.map((c) => {
            const dx = c.x - focus.x, dy = c.y - focus.y, dz = c.z - focus.z;
            const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
            // `boost` (0..1) shortens the effective distance by up to 50%.
            const boost = Math.max(0, Math.min(1, c.boost ?? 0));
            return { id: c.id, score: d * (1 - 0.5 * boost) };
        });

        scored.sort((a, b) => (a.score - b.score) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

        return {
            live: scored.slice(0, cap).map((s) => s.id),
            dark: scored.slice(cap).map((s) => s.id),
            budget: cap,
        };
    });
}
