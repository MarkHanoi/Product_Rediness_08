/**
 * §FIX-VISIBILITY-INTENT-AUTHORITY — B0 regression oracle.
 *
 * Captures, for a reference set of category × zone × viewType cells, the
 * per-line (width-px, colour) that the plan/elevation/section canvas resolves
 * TODAY (VG-authoritative — the `vgEdge ?? _pen.color` + `vgLineWeight * hairline`
 * override at PlanViewCanvas.ts:321-329) vs AFTER (intent-authoritative — the
 * bare `_pen` from GraphicsRulesEngine.resolveStyle()).
 *
 * This is the proof artifact for the founder's constraint "change the AUTHORITY,
 * not the PIXELS." A non-empty divergence set means B2a WOULD shift appearance.
 *
 * NOTE: this test only MEASURES + prints; it does not assert convergence, so it
 * can run before any render-path change. The assertions merely lock the shape of
 * the comparison so the numbers are reproducible.
 */
import { describe, it, expect } from 'vitest';
import { graphicsRulesEngine } from './GraphicsRulesEngine';
import { SCREEN_PX_PER_MM } from './DrawingConstants';
import type { PenZone } from './PenWeightTable';
import { vgGovernanceStore } from '../presentation/VGGovernanceStore';

const CATEGORIES = ['wall', 'slab', 'column', 'beam', 'door', 'window', 'stair', 'roof', 'ceiling', 'furniture', 'plumbing', 'grid'] as const;
const ZONES: PenZone[] = ['CUT', 'PROJECTION', 'BEYOND'];
const VIEW_TYPES = ['plan', 'elevation', 'section'] as const;

// dpr = 1 → hairline = max(0.5, 1/1) = 1.0 (PlanViewCanvas.ts:250)
const HAIRLINE = 1.0;

/** Reproduce PlanViewManager.ts:669-686 styleResolver for a given zone. */
function vgResolve(category: string, zone: PenZone) {
    const { style } = vgGovernanceStore.resolveStyle('model-default', category, undefined);
    const isCut = zone === 'CUT';
    const isBeyond = zone === 'BEYOND';
    const edgeColor = isBeyond ? ((style as any).beyondEdgeColor ?? style.edgeColor) : style.edgeColor;
    const lineWeight = isCut
        ? ((style as any).cutLineWeight ?? style.lineWeight)
        : isBeyond
            ? ((style as any).beyondLineWeight ?? Math.max(1, style.lineWeight - 1))
            : ((style as any).projectionLineWeight ?? style.lineWeight);
    const visible = isBeyond ? ((style as any).beyondVisible ?? style.visible) : style.visible;
    return { edgeColor, lineWeight, visible };
}

function round(n: number): number {
    return Math.round(n * 1000) / 1000;
}

describe('§FIX-VISIBILITY-INTENT-AUTHORITY — B0 oracle (VG-today vs intent-after)', () => {
    it('measures width+colour divergence per category × zone × viewType', () => {
        const rows: Array<Record<string, unknown>> = [];
        const diverged: string[] = [];

        for (const viewType of VIEW_TYPES) {
            for (const category of CATEGORIES) {
                for (const zone of ZONES) {
                    // TODAY (VG-authoritative)
                    const vg = vgResolve(category, zone);
                    const todayWidthPx = Math.max(HAIRLINE, vg.lineWeight * HAIRLINE);
                    const todayColour = vg.edgeColor; // vgEdge ?? _pen.color → vgEdge wins

                    // AFTER (intent-authoritative — the bare _pen)
                    const pen = graphicsRulesEngine.resolveStyle(zone, category, { viewType });
                    const afterWidthPx = Math.max(HAIRLINE, pen.widthMm * SCREEN_PX_PER_MM);
                    const afterColour = pen.color;

                    const widthDelta = round(afterWidthPx - todayWidthPx);
                    const colourChanged = todayColour.toLowerCase() !== afterColour.toLowerCase();
                    const widthChanged = Math.abs(widthDelta) > 0.05; // sub-0.05px = visually identical

                    if (widthChanged || colourChanged) {
                        diverged.push(
                            `${viewType}/${category}/${zone}: ` +
                            `width ${round(todayWidthPx)}→${round(afterWidthPx)} (Δ${widthDelta}) ` +
                            `colour ${todayColour}→${afterColour}` +
                            (widthChanged ? ' [W]' : '') + (colourChanged ? ' [C]' : ''),
                        );
                    }
                    rows.push({
                        cell: `${viewType}/${category}/${zone}`,
                        todayW: round(todayWidthPx), afterW: round(afterWidthPx), dW: widthDelta,
                        todayC: todayColour, afterC: afterColour,
                    });
                }
            }
        }

        // eslint-disable-next-line no-console
        console.log('\n===== B0 ORACLE: VG-today vs intent-after (dpr=1, hairline=1.0, PX_PER_MM=' + round(SCREEN_PX_PER_MM) + ') =====');
        // eslint-disable-next-line no-console
        console.log(`Total cells: ${rows.length}   Diverged: ${diverged.length}`);
        // eslint-disable-next-line no-console
        console.log(diverged.join('\n'));

        expect(rows.length).toBe(VIEW_TYPES.length * CATEGORIES.length * ZONES.length);
    });
});
