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
 * Maximum simultaneously-live fixture point lights, per render tier.
 *
 * Sized against the shader cost, not a guess: a non-shadow-casting PointLight
 * adds ~1 uniform block + ~10 ALU ops per fragment. 64 of them is roughly the
 * cost of one extra full-screen post pass on the cinematic budget, which is what
 * that tier is already paying for SSGI-class effects. `survival` keeps 8 so a
 * scene that has already fallen over still shows the room's primary fixtures.
 *
 * NOTE: fixture point lights NEVER cast shadows (see §NIGHT-ALL-LIGHTS-ON in
 * LightingFragmentBuilder) — the cube-shadow-map texture-unit cap is the
 * separate, much tighter limit and belongs to the sun/key light.
 */
export const LIVE_LIGHT_BUDGET_BY_TIER: Readonly<Record<SceneQualityTier, number>> = {
    cinematic:   64,
    balanced:    48,
    performance: 24,
    survival:     8,
};

/** The budget used when no tier has been reported yet (cold start). */
export const DEFAULT_LIVE_LIGHT_BUDGET = LIVE_LIGHT_BUDGET_BY_TIER.balanced;

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
