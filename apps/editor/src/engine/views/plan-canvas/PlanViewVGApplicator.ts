import type { ViewDefinition } from '@pryzm/core-app-model';
import type { PenStyle } from '@pryzm/core-app-model/drawing';
import { graphicsRulesEngine } from '@pryzm/core-app-model/drawing';
import { vgGovernanceStore } from '@pryzm/core-app-model';
import { ISO_CUT_LAYER_TO_POCHE_FILL } from '@pryzm/core-app-model/drawing';

export const ISO_LAYER_TO_VG_CATEGORY: Readonly<Record<string, string>> = {
    'A-WALL': 'wall',
    'A-FLOR': 'slab',
    'A-COLS': 'column',
    'A-BEAM': 'beam',
    'A-DOOR': 'door',
    'A-GLAZ': 'window',
    'A-STRS': 'stair',
    'A-ROOF': 'roof',
    'A-FURN': 'furniture',
    'A-PLMB': 'plumbing',
    'A-CEIL': 'ceiling',
    'A-GRID': 'grid',
    'A-LEVL': 'level',
};

export class PlanViewVGApplicator {
    vgCategoryForLayer(layerTag: string): string | null {
        const tag = layerTag.trim();
        for (const [prefix, category] of Object.entries(ISO_LAYER_TO_VG_CATEGORY)) {
            // §DOOR-WINDOW-PLAN-FRAME (2026-05-22): also match the hyphenated ISO
            // sub-layer convention (`A-DOOR-CUT`, `A-GLAZ-PROJ`, …) emitted by the
            // hosted-element symbol builders. Previously only the exact tag, the
            // `prefix:` colon form, and the space-delimited form matched, so the
            // `-CUT`/`-PROJ` sub-layers resolved to a null VG category — orphaning
            // them from per-category visibility + graphic overrides.
            if (
                tag === prefix ||
                tag.startsWith(`${prefix}:`) ||
                tag.startsWith(`${prefix}-`) ||
                tag.includes(` ${prefix}`)
            ) return category;
        }
        return null;
    }

    vgCategoryFromZoneCategory(layerTag: string): string | null {
        return this.vgCategoryForLayer(layerTag);
    }

    baseIsoLayer(layerTag: string): string | null {
        const tag = layerTag.trim();
        for (const prefix of Object.keys(ISO_CUT_LAYER_TO_POCHE_FILL)) {
            if (tag === prefix || tag.startsWith(`${prefix}:`) || tag.includes(` ${prefix}`)) return prefix;
        }
        return null;
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
