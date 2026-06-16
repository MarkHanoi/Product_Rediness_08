// §GRAPH-OVER-PLAN (2026-06-16) — the living graph OVERLAID ON the plan thumbnail.
// Pure SVG builder tests (node env, no DOM): the connectivity graph (nodes on room
// centroids + adjacency edges) is composited into the SAME SVG as the plan, on the
// IDENTICAL coordinate transform, in PRYZM brand purple (#6600FF) + white.

import { describe, expect, it } from 'vitest';
import { buildPlanGraphOverlaySvg } from '../src/ui/apartment-layout/layoutBubbleGraph.js';
import {
    buildLayoutThumbnailSvg, computePlanTransform, PRYZM_PURPLE,
} from '../src/ui/apartment-layout/layoutThumbnail.js';
import type { LayoutOption } from '@pryzm/ai-host';

/** Two adjacent rooms with polygons + a symmetric adjacency. */
function twoRoomOpt(over: Partial<LayoutOption> = {}): LayoutOption {
    return {
        summary: '', corridorWidthMin: 0, doors: [], walls: [],
        rooms: [
            {
                name: 'Living Room', type: 'living', area: 18, windowCount: 1,
                hasDirectAccess: true, adjacentTo: ['Kitchen'],
                polygon: [
                    { x: 0, y: 0 }, { x: 5000, y: 0 },
                    { x: 5000, y: 4000 }, { x: 0, y: 4000 },
                ],
                occupancy: 'living-room',
            },
            {
                name: 'Kitchen', type: 'kitchen', area: 12, windowCount: 1,
                hasDirectAccess: true, adjacentTo: ['Living Room'],
                polygon: [
                    { x: 5000, y: 0 }, { x: 9000, y: 0 },
                    { x: 9000, y: 4000 }, { x: 5000, y: 4000 },
                ],
                occupancy: 'kitchen',
            },
        ] as never,
        ...over,
    };
}

describe('buildPlanGraphOverlaySvg (§GRAPH-OVER-PLAN)', () => {
    it('emits ONE SVG that still contains the plan (rooms drawn beneath the overlay)', () => {
        const svg = buildPlanGraphOverlaySvg(twoRoomOpt(), { width: 320, height: 240 });
        expect((svg.match(/<svg/g) ?? []).length).toBe(1);
        expect((svg.match(/<\/svg>/g) ?? []).length).toBe(1);
        // The plan's room polygons (occupancy fills) are present beneath the overlay.
        expect(svg).toContain('fill="#bfdbfe"');     // living-room
        expect(svg).toContain('fill="#fef3c7"');     // kitchen
        // The overlay group exists and sits AFTER the plan content (drawn on top).
        expect(svg).toContain('class="alm-plan-graph-overlay"');
        expect(svg.indexOf('alm-plan-graph-overlay')).toBeGreaterThan(svg.indexOf('fill="#bfdbfe"'));
    });

    it('draws one purple node per named room ON its polygon centroid (same transform as the plan)', () => {
        const opts = { width: 320, height: 240 } as const;
        const svg = buildPlanGraphOverlaySvg(twoRoomOpt(), opts);
        const tf = computePlanTransform(twoRoomOpt(), opts);
        // Two purple-filled, white-stroked node circles.
        const nodes = svg.match(/<circle [^>]*fill="#6600FF" stroke="#ffffff"/g) ?? [];
        expect(nodes.length).toBe(2);
        // Living Room centroid (2500, 2000) mm → svg px under the plan transform.
        const cx = tf.mapX(2500), cy = tf.mapY(2000);
        const cxStr = (Math.round(cx * 10) / 10).toString();
        const cyStr = (Math.round(cy * 10) / 10).toString();
        expect(svg).toContain(`cx="${cxStr}" cy="${cyStr}"`);
    });

    it('draws one purple semi-transparent edge per (deduped) adjacency', () => {
        const svg = buildPlanGraphOverlaySvg(twoRoomOpt(), { width: 320, height: 240 });
        // Living↔Kitchen is symmetric → exactly ONE overlay edge line.
        const edges = svg.match(/<line [^>]*stroke="#6600FF" stroke-width="1.6" stroke-opacity="0.4"/g) ?? [];
        expect(edges.length).toBe(1);
    });

    it('uses ONLY brand colours in the overlay layer (purple + white, no black)', () => {
        const svg = buildPlanGraphOverlaySvg(twoRoomOpt(), { width: 320, height: 240 });
        const overlay = svg.slice(svg.indexOf('alm-plan-graph-overlay'), svg.lastIndexOf('</svg>'));
        expect(overlay).toContain(PRYZM_PURPLE);
        expect(overlay).toContain('stroke="#ffffff"');
        // No black fills/strokes in the overlay group.
        expect(overlay).not.toMatch(/#000\b|#000000|"black"/i);
    });

    it('interactiveNodes:true stamps data-room-name + alm-graph-node + role/tabindex', () => {
        const svg = buildPlanGraphOverlaySvg(twoRoomOpt(), { interactiveNodes: true });
        expect(svg).toContain('class="alm-graph-node"');
        expect(svg).toContain('data-room-name="Living Room"');
        expect(svg).toContain('data-room-name="Kitchen"');
        expect(svg).toContain('pointer-events="auto"');
        expect(svg).toContain('role="button"');
    });

    it('default nodes are inert (no data-room-name, pointer-events:none)', () => {
        const svg = buildPlanGraphOverlaySvg(twoRoomOpt());
        const overlay = svg.slice(svg.indexOf('alm-plan-graph-overlay'));
        expect(overlay).not.toContain('data-room-name');
        expect(overlay).not.toContain('alm-graph-node');
        expect(overlay).toContain('pointer-events="none"');
    });

    it('falls back to the plain plan when no rooms are named (overlay is a no-op)', () => {
        const unnamed = twoRoomOpt({
            rooms: [{
                name: '', type: 'living', area: 0, windowCount: 0,
                hasDirectAccess: true, adjacentTo: [],
                polygon: [{ x: 0, y: 0 }, { x: 5000, y: 0 }, { x: 5000, y: 4000 }, { x: 0, y: 4000 }],
                occupancy: 'living-room',
            }] as never,
        });
        const overlaySvg = buildPlanGraphOverlaySvg(unnamed, { width: 320, height: 240 });
        const planSvg = buildLayoutThumbnailSvg(unnamed, { width: 320, height: 240 });
        expect(overlaySvg).toBe(planSvg);
    });

    it('skips an edge to a dangling adjacency name (no throw, no edge)', () => {
        const svg = buildPlanGraphOverlaySvg(twoRoomOpt({
            rooms: [{
                name: 'Living Room', type: 'living', area: 18, windowCount: 1,
                hasDirectAccess: true, adjacentTo: ['Ghost Room'],
                polygon: [{ x: 0, y: 0 }, { x: 5000, y: 0 }, { x: 5000, y: 4000 }, { x: 0, y: 4000 }],
                occupancy: 'living-room',
            }] as never,
        }), { width: 320, height: 240 });
        // One node, zero overlay edges.
        expect((svg.match(/<circle [^>]*fill="#6600FF"/g) ?? []).length).toBe(1);
        expect((svg.match(/stroke="#6600FF" stroke-width="1.6"/g) ?? []).length).toBe(0);
    });
});
