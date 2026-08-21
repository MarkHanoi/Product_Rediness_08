import type { ViewDefinition } from '@pryzm/core-app-model';
import type { PenStyle } from '@pryzm/core-app-model/drawing';
import { graphicsRulesEngine } from '@pryzm/core-app-model/drawing';
import { vgGovernanceStore } from '@pryzm/core-app-model';
import { ISO_CUT_LAYER_TO_POCHE_FILL, vgCategoryForLayer, baseIsoLayerForTag } from '@pryzm/core-app-model/drawing';

/**
 * §VG-LAYER-IDENTITY-IS-THE-ONLY-SURVIVOR (L-1600) — THE DRIFTED DUPLICATE, RETIRED.
 *
 * This module used to own a SECOND copy of `ISO_LAYER_TO_VG_CATEGORY` and a SECOND
 * `vgCategoryForLayer()`. The two copies had already diverged, and in the worst
 * possible direction: on 2026-05-22 §DOOR-WINDOW-PLAN-FRAME added the ISO hyphen
 * sub-layer arm (`A-DOOR-CUT`, `A-GLAZ-PROJ`) to THIS copy — the one nothing on the
 * render path calls — and never to `PlanViewCanvas`'s copy, which is the one that
 * paints. The fix was authored, committed, and reached no user: for three months the
 * renderer could not classify a single door, window or furniture plan symbol.
 *
 * `ISO_LAYER_TO_VG_CATEGORY` is re-exported here ONLY so existing importers keep
 * resolving; it is the one from `@pryzm/core-app-model/drawing`, not a copy.
 */
export { ISO_LAYER_TO_VG_CATEGORY } from '@pryzm/core-app-model/drawing';

export class PlanViewVGApplicator {
    /** §VG-LAYER-IDENTITY-IS-THE-ONLY-SURVIVOR (L-1600) — delegates to the ONE producer. */
    vgCategoryForLayer(layerTag: string): string | null {
        return vgCategoryForLayer(layerTag);
    }

    vgCategoryFromZoneCategory(layerTag: string): string | null {
        return this.vgCategoryForLayer(layerTag);
    }

    /** §VG-LAYER-IDENTITY-IS-THE-ONLY-SURVIVOR (L-1600) — delegates to the ONE producer. */
    baseIsoLayer(layerTag: string): string | null {
        return baseIsoLayerForTag(layerTag, Object.keys(ISO_CUT_LAYER_TO_POCHE_FILL));
    }

    syncViewOverrides(viewDef: ViewDefinition): void {
        const viewId = viewDef.id;

        graphicsRulesEngine.removeViewOverrides(viewId);

        const viewRecord = vgGovernanceStore.getView(viewId);
        if (!viewRecord || Object.keys(viewRecord.categoryOverrides).length === 0) return;

        for (const [vgCategory, partial] of Object.entries(viewRecord.categoryOverrides)) {
            if (!partial || Object.keys(partial).length === 0) continue;

            const cutPen:    Partial<PenStyle> = {};
            const projPen:   Partial<PenStyle> = {};
            const beyondPen: Partial<PenStyle> = {};

            const lw = (partial as any).lineWeight;
            if (typeof lw === 'number' && lw > 0) {
                cutPen.widthMm    = lw;
                projPen.widthMm   = lw;
                beyondPen.widthMm = lw;
            }
            const cutLw = (partial as any).cutLineWeight;
            if (typeof cutLw === 'number' && cutLw > 0) cutPen.widthMm = cutLw;
            const projLw = (partial as any).projectionLineWeight;
            if (typeof projLw === 'number' && projLw > 0) projPen.widthMm = projLw;
            const beyondLw = (partial as any).beyondLineWeight;
            if (typeof beyondLw === 'number' && beyondLw > 0) beyondPen.widthMm = beyondLw;

            const edgeColor = (partial as any).edgeColor;
            if (typeof edgeColor === 'string' && edgeColor) {
                cutPen.color  = edgeColor;
                projPen.color = edgeColor;
            }
            const beyondColor = (partial as any).beyondEdgeColor;
            if (typeof beyondColor === 'string' && beyondColor) {
                beyondPen.color = beyondColor;
            } else if (edgeColor) {
                beyondPen.color = edgeColor;
            }

            const trans = (partial as any).transparency;
            if (typeof trans === 'number') {
                const opacity = Math.max(0, Math.min(1, 1 - trans / 100));
                cutPen.opacity    = opacity;
                projPen.opacity   = opacity;
                beyondPen.opacity = opacity;
            }

            if (Object.keys(cutPen).length    > 0) graphicsRulesEngine.addViewOverride(viewId, 'CUT',        vgCategory, cutPen);
            if (Object.keys(projPen).length   > 0) graphicsRulesEngine.addViewOverride(viewId, 'PROJECTION', vgCategory, projPen);
            if (Object.keys(beyondPen).length > 0) graphicsRulesEngine.addViewOverride(viewId, 'BEYOND',     vgCategory, beyondPen);
        }
    }
}

export const planViewVGApplicator = new PlanViewVGApplicator();
