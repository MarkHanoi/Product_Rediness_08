/**
 * SymbolInjectionGate — §SYMBOL-INJECTORS-VS-INTENT (L-3903)
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * THE ONE PLACE A SYMBOL INJECTOR ASKS "IS THIS FAMILY VISIBLE IN THIS VIEW?"
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE CENSUS THAT MADE THIS NECESSARY (measured 2026-08-22)
 * ─────────────────────────────────────────────────────────────────────────────
 * A plan drawing is NOT only the 3D edge projection. After `EdgeProjectorService`
 * finishes, **fifteen** symbol injectors add authored 2D AEC linework that has no
 * mesh counterpart — door swings, bed/chair/sofa/kitchen/wardrobe/tree plan symbols,
 * window frames, stair walking lines, roof slope arrows, column crosshairs, wall
 * layer boundaries, plumbing fixtures, and the elevation opening symbol.
 *
 * Every one of them was asked the same question:
 *
 *     grep -icE "visibilityIntent|isVisible|categoryVisible|vgOverride" <file>
 *
 * over all fifteen of:
 *   OpeningElevationSymbolBuilder · ColumnPlanSymbolBuilder · DoorPlanSymbolBuilder
 *   BedPlanSymbolBuilder · ChairPlanSymbolBuilder · KitchenPlanSymbolBuilder
 *   SofaPlanSymbolBuilder · TreePlanSymbolBuilder · WardrobePlanSymbolBuilder
 *   PlumbingElevationSymbolBuilder · PlumbingPlanSymbolBuilder · RoofSlopeSymbolBuilder
 *   StairSymbolTechnicalDrawingBridge · WallLayerPlanSymbolBuilder · WindowPlanSymbolBuilder
 *
 * → **0 of 15**. Not one consults visibility intent. Each gates only on `levelId`
 * and its own element store, so every symbol is injected unconditionally.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS DOES AND DOES *NOT* FIX — STATED HONESTLY
 * ─────────────────────────────────────────────────────────────────────────────
 * It does **not** fix "hidden furniture still renders". MEASURED: it does not. The
 * canvas already drops the line twice — VG `resolved.visible`, then the intent's
 * alpha-0 pen — and `visibilityIntentGovernsSymbolInjectors.test.ts` proves hide AND
 * line colour reach `A-FURN` symbol lines at `ctx.strokeStyle`. The founder's
 * "maybe because is symbol elements?" hypothesis is REFUTED at the canvas layer, and
 * this file must not be read as confirming it.
 *
 * What unconditional injection actually costs is everything DOWNSTREAM of the canvas,
 * where no alpha is applied:
 *   • the drawing carries geometry for a category the user switched off, so anything
 *     consuming `drawing.three` rather than the painted canvas sees it;
 *   • `registerSegmentUUID()` indexes it for selection (the pointer half is closed
 *     separately by §HIDDEN-IS-NOT-PICKABLE / L-3902, in `PlanViewCanvas.hitTest`);
 *   • the work is done every re-projection for linework that cannot be seen.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THE GATE IS HERE AND NOT INSIDE THE FIFTEEN BUILDERS
 * ─────────────────────────────────────────────────────────────────────────────
 * Fifteen one-line guards is fifteen chances to drift, and it is the "sixth hand copy"
 * shape this repo keeps paying for (`vgCategoryForLayer` existed twice and the copies
 * DIVERGED; L-1600 was seven copies of "which layer is this line on", one silently
 * wrong). It would also push a DOMAIN concept — P7: visibility intent is not UI state,
 * and it is not geometry either — down into `packages/geometry-*`, which exist to do
 * geometry maths.
 *
 * So the builders stay dumb and the CALLER decides. `EdgeProjectorService` already
 * invokes all fifteen from one contiguous region; it builds one gate per projection
 * and asks it per family. One resolver, one construction site, fifteen questions.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY IT ASKS `resolveIntentStyle` AND NOT `isElementTypeFullyHidden`
 * ─────────────────────────────────────────────────────────────────────────────
 * `isElementTypeFullyHidden(intent, type)` reads the INTENT's element rules only. The
 * founder's per-category toggle (`SetCategoryVisibilityInViewCommand`, L-1894) writes a
 * `visibilityOverride` onto the view's INSTANCE, and `isolateActive` lives there too —
 * neither is visible to that predicate. Using it would leave the panel's own switch
 * unable to gate injection, which is the defect, not the fix. `resolveIntentStyle`
 * takes the instance and therefore honours the intent rules, the view-type profile,
 * the per-view overrides and isolate, through the one ladder.
 *
 * FAIL-OPEN, DELIBERATELY. An unbound view, a missing intent or a resolver throw all
 * return `true` (inject). A gate that fails CLOSED would silently delete authored
 * linework from a drawing whenever intent resolution had a bad day — strictly worse
 * than the unconditional injection it replaces. Absence of a decision is not a hide.
 *
 * Contracts: C09 §4.1/§4.3/§4.5 (intent authority + precedence), C04 (rendering),
 * C84 (element integrity — this gates whole element families).
 *
 * P8: `makeSymbolInjectionGate` is a pure factory over two store reads with no side
 * effects, on the per-projection path. It follows the same "pure classifier, no span"
 * precedent as `ViewScope.resolveViewScope` / `categoryFromFlags`; the side-effecting
 * projection entry points that call it carry the OTel spans.
 */

import { resolveBoundIntentWithInheritance } from './IntentBindingResolver';
import { resolveIntentStyle } from './IntentRuleResolver';
import type { ElementState } from './VisibilityIntentTypes';

/** Every state a symbol's linework could land in. If none is visible, nothing can draw. */
const ALL_STATES: readonly ElementState[] = ['cut', 'projection', 'beyond', 'hidden'];

/**
 * Answers "may a symbol injector emit linework for this element family in this view?"
 *
 * @param elementType the intent element-rule key — `'furniture'`, `'door'`, `'stair'`, …
 * @returns `true` to inject. Fails OPEN (see the header).
 */
export type SymbolInjectionGate = (elementType: string) => boolean;

/**
 * Build the gate for one view. Resolves the bound intent ONCE and memoises per family,
 * so a projection that asks about fifteen families does at most fifteen resolves — not
 * one per element.
 *
 * @param viewId   the view being projected.
 * @param viewType `'plan'` / `'elevation'` / `'section'` / … — selects the view-type
 *                 profile and modifier rows in the resolver ladder.
 */
export function makeSymbolInjectionGate(viewId: string | undefined, viewType: string): SymbolInjectionGate {
    if (!viewId) return () => true;

    let bound: ReturnType<typeof resolveBoundIntentWithInheritance> = null;
    try {
        bound = resolveBoundIntentWithInheritance(viewId);
    } catch {
        return () => true;
    }
    if (!bound) return () => true;

    const { instance, intent } = bound;
    const cache = new Map<string, boolean>();

    return (elementType: string): boolean => {
        if (!elementType) return true;
        const hit = cache.get(elementType);
        if (hit !== undefined) return hit;

        let visible = true;
        try {
            // Visible if ANY state could draw. Conservative on purpose: this skips
            // injection only when the family cannot appear at all, so a family that is
            // merely restyled — or hidden in one zone — still emits its symbol and the
            // canvas applies the pen, exactly as before.
            visible = ALL_STATES.some((state) => {
                const appearance = resolveIntentStyle(
                    instance, intent, elementType, state, viewType,
                    { elementType, category: elementType },
                );
                return appearance.visible !== false && appearance.line.opacity !== 0;
            });
        } catch {
            visible = true; // fail open — see the header.
        }

        cache.set(elementType, visible);
        return visible;
    };
}
