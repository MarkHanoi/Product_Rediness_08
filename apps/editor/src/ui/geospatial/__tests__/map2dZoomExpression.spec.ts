// §MAP2D-ZOOM-AT-TOP-LEVEL (L-12950) — a `zoom` expression may ONLY be the input of a TOP-LEVEL
// `step` / `interpolate`. Nest it anywhere else and MapLibre rejects THE WHOLE STYLE, not the one
// layer: the founder's 2D map rendered NOTHING at Vienna and Oslo on the first deploy that carried
// the pastel style, with one console line naming it —
//   "layers[7].paint.line-width: 'zoom' expression may only be used as input to a top-level
//    'step' or 'interpolate' expression"
// — followed by "surface-not-ready" and a 45 s draw-phase timeout, because the map never loaded.
//
// This walks every pastel layer's paint and layout and fails on ANY nested zoom, so the next such
// expression is caught here rather than by a blank map in production.
import { describe, it, expect } from 'vitest';
import {
    buildPastelBackgroundLayer, buildPastelWorldBaseLayers, buildPastelLanduseLayers, buildPastelParkLayers, buildPastelWaterLayers,
    buildPastelRailLayer, buildPastelRoadLayers, buildPastelBuildingLayers, buildPastelTreeLayer,
    buildPastelLabelLayers,
    FORMA_PALETTE_V2,
} from '../siteMap2DStyle';

type Json = unknown;

/** Every (path, expression) pair where `['zoom']` appears, with whether it is a legal top-level input. */
function findZoomUses(expr: Json, path: string, topLevelOk: boolean, out: Array<{ path: string; ok: boolean }>): void {
    if (!Array.isArray(expr)) return;
    const [op, ...rest] = expr as unknown[];
    if (op === 'zoom' && expr.length === 1) { out.push({ path, ok: topLevelOk }); return; }
    const isRamp = op === 'step' || op === 'interpolate' || op === 'interpolate-hcl' || op === 'interpolate-lab';
    rest.forEach((child, i) => {
        // For a ramp, ONLY the input slot may carry `zoom`, and only if the ramp itself is top-level.
        // interpolate: ['interpolate', interpolation, input, ...stops] → input is rest[1]
        // step:        ['step', input, default, ...stops]              → input is rest[0]
        const inputSlot = op === 'interpolate' || op === 'interpolate-hcl' || op === 'interpolate-lab' ? 1 : 0;
        const childIsInput = isRamp && i === inputSlot;
        findZoomUses(child, `${path}[${i + 1}]`, topLevelOk && childIsInput, out);
    });
}

function layerZoomUses(layer: Record<string, unknown>): Array<{ path: string; ok: boolean }> {
    const out: Array<{ path: string; ok: boolean }> = [];
    for (const bag of ['paint', 'layout'] as const) {
        const props = layer[bag] as Record<string, Json> | undefined;
        if (!props) continue;
        for (const [prop, value] of Object.entries(props)) {
            // A property's value is the top level; a ramp sitting THERE may take `zoom`.
            findZoomUses(value, `${String(layer.id)}.${bag}.${prop}`, true, out);
        }
    }
    return out;
}

const allLayers = (): Array<Record<string, unknown>> => [
    buildPastelBackgroundLayer(),
    ...buildPastelWorldBaseLayers(),
    ...buildPastelLanduseLayers(),
    ...buildPastelParkLayers(),
    ...buildPastelWaterLayers(),
    buildPastelRailLayer(),
    ...buildPastelRoadLayers(),
    ...buildPastelBuildingLayers(),
    buildPastelTreeLayer(),
    ...buildPastelLabelLayers(),
].filter(Boolean) as Array<Record<string, unknown>>;

describe('§MAP2D-ZOOM-AT-TOP-LEVEL (L-12950)', () => {
    it('THE BUG: no pastel layer nests a zoom expression inside another expression', () => {
        const offenders = allLayers()
            .flatMap(layerZoomUses)
            .filter((u) => !u.ok)
            .map((u) => u.path);
        expect(offenders).toEqual([]);
    });

    it('the walker itself catches the exact shape that broke production', () => {
        // ['*', <match>, ['interpolate', ['linear'], ['zoom'], …]] — the waterway width as first shipped.
        const bad = {
            id: 'probe', paint: {
                'line-width': ['*', ['match', ['get', 'kind'], 'river', 3, 1],
                    ['interpolate', ['linear'], ['zoom'], 12, 0.6, 19, 6]],
            },
        };
        expect(layerZoomUses(bad).filter((u) => !u.ok).map((u) => u.path)).toEqual(['probe.paint.line-width[2][2]']);
    });

    it('a plain top-level ramp is accepted', () => {
        const good = { id: 'probe', paint: { 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 1, 19, 6] } };
        expect(layerZoomUses(good).filter((u) => !u.ok)).toEqual([]);
        const step = { id: 'probe', layout: { visibility: ['step', ['zoom'], 'none', 14, 'visible'] } };
        expect(layerZoomUses(step).filter((u) => !u.ok)).toEqual([]);
    });

    // §MAP2D-WORLD-AT-LOW-ZOOM (L-12951) — zooming out must show the world, not a flat colour.
    it('THE BUG: something real is drawn at every zoom from 0, not just the background fill', () => {
        const world = buildPastelWorldBaseLayers();
        expect(world.length).toBeGreaterThan(0);
        for (const layer of world) {
            // No minzoom at all, or one at the very bottom — these are the far-out layers.
            const min = (layer as { minzoom?: number }).minzoom ?? 0;
            expect(min).toBe(0);
            // Each must stop where its detailed pastel counterpart starts, so nothing double-draws.
            expect(typeof (layer as { maxzoom?: number }).maxzoom).toBe('number');
        }
    });

    it('the world layers sit UNDER the detailed ones and use the pastel palette', () => {
        const ids = buildPastelWorldBaseLayers().map((l) => String(l.id));
        expect(ids).toContain('pastel-world-water');
        expect(ids).toContain('pastel-world-places');
        const water = buildPastelWorldBaseLayers().find((l) => l.id === 'pastel-world-water')!;
        expect((water.paint as Record<string, unknown>)['fill-color']).toBe(FORMA_PALETTE_V2.water);
    });
});