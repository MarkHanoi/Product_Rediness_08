/**
 * @file packages/geometry-furniture/src/furnitureShadowBudget.ts
 *
 * Furniture shadow budget — ADR-0076 Axis 2 (§PERF-WEBGPU-FRAGMENT, 2026-06-24).
 *
 * Each furniture piece is a multi-mesh THREE.Group and every sub-mesh sets
 * castShadow=true (FurnitureFragmentBuilder). With ~676 furniture pieces this is
 * the dominant shadow-caster population, and under WebGPU the shadow pass
 * re-renders all of them on every shadow-map update.
 *
 * This module holds a process-wide budget that, when raised above the default,
 * lets DECORATIVE furniture (plants, lamps, rugs/carpets, wall decor, curtains —
 * items whose cast shadow contributes nothing to reading the space) build with
 * castShadow=false. Architectural pieces (sofas, beds, kitchens, wardrobes,
 * tables) keep casting shadows at every budget.
 *
 * SAFETY: the default budget is 'full', which preserves TODAY's exact behaviour
 * (every furniture sub-mesh casts shadows). Nothing changes until the render
 * tier wiring (RenderingPipelineCoordinator, ADR-0076 Axis 1) calls
 * setFurnitureShadowBudget('decorative-off') at the `performance`+ tier.
 *
 * Pure module: no THREE, no DOM, no rAF. Imported by FurnitureFragmentBuilder
 * (which owns the THREE side) and unit-testable in isolation.
 */

import { trace, SpanStatusCode } from '@opentelemetry/api';

const TRACER = trace.getTracer('@pryzm/geometry-furniture/shadow-budget', '0.1.0');

/**
 * Shadow budget level.
 *   'full'          — every furniture sub-mesh casts shadows (default / today).
 *   'decorative-off'— decorative furniture stops casting shadows; architectural
 *                     furniture is unchanged.
 */
export type FurnitureShadowBudget = 'full' | 'decorative-off';

/**
 * Furniture types classified as DECORATIVE — their cast shadow is visually
 * negligible. Matched by prefix so the 25-species `arbol_t_*` tree library and
 * the `plant_0N` set are covered without enumerating every variant.
 *
 * Kept deliberately conservative: anything not clearly decorative stays a
 * shadow caster so the spatial reading of the room is never degraded.
 */
const DECORATIVE_EXACT = new Set<string>([
    'lamp',
    'wall_art',
    'wall_mirror',
    'wall_tapestry',
    'curtain_rod',
    'curtain_panel',
    'rug',
    'parametric_chevron_carpet',
    'parametric_patchwork_carpet',
    'parametric_stripe_carpet',
    // §CARPET97 (2026-08-25) — the ten new procedural carpets. A rug is 4 mm
    // thick and lies ON the floor: its cast shadow is a 4 mm sliver that
    // contributes nothing to reading the space, which is precisely the test the
    // three carpets above already passed. Listed by exact name rather than by a
    // `parametric_` prefix so this set stays as conservative as its doc claims.
    'parametric_staggered_stripe_carpet',
    'parametric_checkerboard_carpet',
    'parametric_bordered_jute_carpet',
    'parametric_braided_jute_carpet',
    'parametric_colour_block_carpet',
    'parametric_moons_carpet',
    'parametric_round_braided_carpet',
    'parametric_line_art_carpet',
    'parametric_fine_stripe_carpet',
    'parametric_diamond_trellis_carpet',
]);

const DECORATIVE_PREFIXES: readonly string[] = ['plant_', 'arbol_t_'];

/**
 * Process-wide current budget. Module-level so a single furniture builder
 * instance and the render-tier wiring share one value.
 */
let _budget: FurnitureShadowBudget = 'full';

/**
 * Returns true if the given furnitureType is decorative (shadow-negligible).
 * Pure — exported for unit tests + the render-tier wiring.
 */
export function isDecorativeFurniture(furnitureType: string | undefined): boolean {
    if (!furnitureType) return false;
    if (DECORATIVE_EXACT.has(furnitureType)) return true;
    return DECORATIVE_PREFIXES.some((p) => furnitureType.startsWith(p));
}

/**
 * Set the process-wide furniture shadow budget. Reversible — pass 'full' to
 * restore today's behaviour.
 *
 * P8: `pryzm.furniture-shadow.set-budget` span.
 */
export function setFurnitureShadowBudget(budget: FurnitureShadowBudget): void {
    const span = TRACER.startSpan('pryzm.furniture-shadow.set-budget', {
        attributes: { 'pryzm.furniture_shadow.budget': budget },
    });
    try {
        _budget = budget;
        span.setStatus({ code: SpanStatusCode.OK });
    } finally {
        span.end();
    }
}

/** Current furniture shadow budget. */
export function getFurnitureShadowBudget(): FurnitureShadowBudget {
    return _budget;
}

/**
 * Whether a furniture piece of `furnitureType` should cast shadows under the
 * CURRENT budget.
 *
 * - 'full' budget          → always true (today's behaviour).
 * - 'decorative-off' budget→ false for decorative types, true otherwise.
 *
 * Pure read of module state. P8: `pryzm.furniture-shadow.casts` span.
 */
export function furnitureCastsShadowUnderBudget(furnitureType: string | undefined): boolean {
    const span = TRACER.startSpan('pryzm.furniture-shadow.casts', {
        attributes: {
            'pryzm.furniture_shadow.budget': _budget,
            'pryzm.furniture_shadow.type': furnitureType ?? 'unknown',
        },
    });
    try {
        const casts = _budget === 'full' ? true : !isDecorativeFurniture(furnitureType);
        span.setAttribute('pryzm.furniture_shadow.casts', casts);
        span.setStatus({ code: SpanStatusCode.OK });
        return casts;
    } finally {
        span.end();
    }
}
