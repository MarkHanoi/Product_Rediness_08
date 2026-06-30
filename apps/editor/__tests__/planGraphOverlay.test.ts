// §GRAPH-OVER-PLAN (2026-06-16) — the living graph OVERLAID ON the plan thumbnail.
// Pure SVG builder tests (node env, no DOM): the connectivity graph (nodes on room
// centroids + adjacency edges) is composited into the SAME SVG as the plan, on the
// IDENTICAL coordinate transform, in PRYZM brand purple (#6600FF) + white.
//
// NEXT-GEN VISUAL (2026-06-17): nodes are radial-gradient violet discs whose
// RADIUS SCALES WITH DEGREE, with a soft halo + thin white inner ring; edges are
// thin smooth #6600FF (~0.55 opacity, thicker for hub↔hub); labels only on hubs.
// <defs> are uniquely id'd per overlay. Tests assert the gradient id / degree
// sizing / purple stroke — never blue.

import { describe, expect, it } from 'vitest';
import {
    buildPlanGraphOverlaySvg, computeCirculationReachability,
} from '../src/ui/apartment-layout/layoutBubbleGraph.js';
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

    it('draws one radial-gradient violet node per named room ON its polygon centroid (same transform as the plan)', () => {
        const opts = { width: 320, height: 240 } as const;
        const svg = buildPlanGraphOverlaySvg(twoRoomOpt(), opts);
        const tf = computePlanTransform(twoRoomOpt(), opts);
        // Two radial-gradient-filled, white-inner-ring node circles.
        const nodes = svg.match(/<circle [^>]*fill="url\(#almNodeGrad-[a-z0-9]+\)" stroke="#ffffff"/g) ?? [];
        expect(nodes.length).toBe(2);
        // The radial node gradient is defined (uniquely id'd) and runs #7C3AED→#6600FF.
        expect(svg).toMatch(/<radialGradient id="almNodeGrad-[a-z0-9]+"/);
        expect(svg).toContain('stop-color="#7C3AED"');
        expect(svg).toContain(`stop-color="${PRYZM_PURPLE}"`);
        // Living Room centroid (2500, 2000) mm → svg px under the plan transform.
        const cx = tf.mapX(2500), cy = tf.mapY(2000);
        const cxStr = (Math.round(cx * 10) / 10).toString();
        const cyStr = (Math.round(cy * 10) / 10).toString();
        expect(svg).toContain(`cx="${cxStr}" cy="${cyStr}"`);
    });

    it('scales node radius by DEGREE — a hub (more connections) is larger than a leaf', () => {
        // Star: Corridor connects to 3 rooms; each leaf connects only to Corridor.
        const star = twoRoomOpt({
            rooms: [
                { name: 'Corridor', type: 'corridor', area: 6, windowCount: 0, hasDirectAccess: true,
                  adjacentTo: ['A', 'B', 'C'],
                  polygon: [{ x: 4000, y: 0 }, { x: 6000, y: 0 }, { x: 6000, y: 4000 }, { x: 4000, y: 4000 }],
                  occupancy: 'corridor' },
                { name: 'A', type: 'bedroom', area: 12, windowCount: 1, hasDirectAccess: true,
                  adjacentTo: ['Corridor'],
                  polygon: [{ x: 0, y: 0 }, { x: 4000, y: 0 }, { x: 4000, y: 2000 }, { x: 0, y: 2000 }],
                  occupancy: 'bedroom' },
                { name: 'B', type: 'bedroom', area: 12, windowCount: 1, hasDirectAccess: true,
                  adjacentTo: ['Corridor'],
                  polygon: [{ x: 0, y: 2000 }, { x: 4000, y: 2000 }, { x: 4000, y: 4000 }, { x: 0, y: 4000 }],
                  occupancy: 'bedroom' },
                { name: 'C', type: 'kitchen', area: 10, windowCount: 1, hasDirectAccess: true,
                  adjacentTo: ['Corridor'],
                  polygon: [{ x: 6000, y: 0 }, { x: 9000, y: 0 }, { x: 9000, y: 4000 }, { x: 6000, y: 4000 }],
                  occupancy: 'kitchen' },
            ] as never,
        });
        const svg = buildPlanGraphOverlaySvg(star, { width: 320, height: 240 });
        // Collect every NODE radius (gradient-filled circles only — excludes halos).
        const radii = [...svg.matchAll(/<circle [^>]*r="([\d.]+)"[^>]*fill="url\(#almNodeGrad-[a-z0-9]+\)"/g)]
            .map((m) => parseFloat(m[1]!));
        expect(radii.length).toBe(4);
        // The degree-3 hub must be strictly larger than every degree-1 leaf.
        const maxR = Math.max(...radii);
        const others = radii.filter((r) => r !== maxR);
        expect(others.length).toBeGreaterThanOrEqual(1);
        expect(maxR).toBeGreaterThan(Math.max(...others));
    });

    it('draws one purple semi-transparent edge per (deduped) adjacency', () => {
        const svg = buildPlanGraphOverlaySvg(twoRoomOpt(), { width: 320, height: 240 });
        // Living↔Kitchen is symmetric → exactly ONE overlay edge line, thin + violet.
        const edges = svg.match(/<line [^>]*stroke="#6600FF" stroke-width="1.5" stroke-opacity="0.55"/g) ?? [];
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

    it('§GRAPH-GREY-BASE: desaturates the plan BENEATH the overlay (saturate=0) without greying the standalone plan', () => {
        const opts = { width: 320, height: 240 } as const;
        const overlaySvg = buildPlanGraphOverlaySvg(twoRoomOpt(), opts);
        // The plan body is wrapped in a desaturating group driven by an feColorMatrix saturate=0 filter.
        expect(overlaySvg).toMatch(/<filter id="almPlanGrey-[a-z0-9]+"/);
        expect(overlaySvg).toContain('<feColorMatrix type="saturate" values="0"/>');
        expect(overlaySvg).toMatch(/<g class="alm-plan-grey-base" filter="url\(#almPlanGrey-[a-z0-9]+\)" opacity="0\.62">/);
        // The grey filter is applied to the plan body, BEFORE the overlay group.
        expect(overlaySvg.indexOf('alm-plan-grey-base')).toBeLessThan(overlaySvg.indexOf('alm-plan-graph-overlay'));
        // The overlay (violet graph) is OUTSIDE the grey group → keeps full colour.
        const overlay = overlaySvg.slice(overlaySvg.indexOf('alm-plan-graph-overlay'));
        expect(overlay).not.toContain('alm-plan-grey-base');
        // The standalone coloured plan panel is NOT greyed (no grey filter at all).
        const planSvg = buildLayoutThumbnailSvg(twoRoomOpt(), opts);
        expect(planSvg).not.toContain('alm-plan-grey-base');
        expect(planSvg).not.toContain('feColorMatrix');
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
        // One node disc (gradient-filled), zero overlay edges.
        expect((svg.match(/<circle [^>]*fill="url\(#almNodeGrad-[a-z0-9]+\)"/g) ?? []).length).toBe(1);
        expect((svg.match(/<line [^>]*stroke="#6600FF"/g) ?? []).length).toBe(0);
    });
});

// ─── §DOOR-GRAPH-NODES — doors as first-class graph entities ─────────────────────

/** Three rooms: corridor doors onto a bedroom; living merely SHARES A WALL with the
 *  corridor (no door). Door graph present (doorAdjacentTo on every room). */
function doorGraphOpt(): LayoutOption {
    return {
        summary: '', corridorWidthMin: 0, doors: [], walls: [],
        rooms: [
            { name: 'Corridor', type: 'corridor', area: 6, windowCount: 0, hasDirectAccess: true,
              adjacentTo: ['Bedroom', 'Living'], doorAdjacentTo: ['Bedroom'],
              polygon: [{ x: 4000, y: 0 }, { x: 6000, y: 0 }, { x: 6000, y: 4000 }, { x: 4000, y: 4000 }],
              occupancy: 'corridor' },
            { name: 'Bedroom', type: 'bedroom', area: 12, windowCount: 1, hasDirectAccess: true,
              adjacentTo: ['Corridor'], doorAdjacentTo: ['Corridor'],
              polygon: [{ x: 0, y: 0 }, { x: 4000, y: 0 }, { x: 4000, y: 4000 }, { x: 0, y: 4000 }],
              occupancy: 'bedroom' },
            { name: 'Living', type: 'living', area: 16, windowCount: 1, hasDirectAccess: true,
              adjacentTo: ['Corridor'], doorAdjacentTo: [],   // SHARES A WALL, no door
              polygon: [{ x: 6000, y: 0 }, { x: 10000, y: 0 }, { x: 10000, y: 4000 }, { x: 6000, y: 4000 }],
              occupancy: 'living-room' },
        ] as never,
    };
}

describe('door nodes (§DOOR-GRAPH-NODES)', () => {
    it('renders a door NODE (white disc, purple ring) on each real-door edge', () => {
        const svg = buildPlanGraphOverlaySvg(doorGraphOpt(), { width: 320, height: 240 });
        const doorNodes = svg.match(/<circle class="alm-graph-door-node"[^>]*fill="#ffffff" stroke="#6600FF"/g) ?? [];
        // Exactly ONE real door (Corridor↔Bedroom). Living has no door → no door node.
        expect(doorNodes.length).toBe(1);
    });

    it('draws the no-door (wall-only) edge as a faint DASHED line, with NO door node on it', () => {
        const svg = buildPlanGraphOverlaySvg(doorGraphOpt(), { width: 320, height: 240 });
        // Corridor↔Living shares a wall but has no door → dashed edge.
        expect(svg).toMatch(/<line [^>]*stroke="#6600FF"[^>]*stroke-dasharray="2 3"/);
        // Solid door edges carry no dash array.
        const solidDoorEdges = svg.match(/<line [^>]*stroke="#6600FF"[^>]*stroke-width="1.5"/g) ?? [];
        expect(solidDoorEdges.length).toBe(1);   // Corridor↔Bedroom only
    });

    it('pre-deploy build (no doorAdjacentTo) treats every wall edge as a door (parity)', () => {
        // Reuse the two-room option from the main suite (no doorAdjacentTo anywhere).
        const svg = buildPlanGraphOverlaySvg(twoRoomOpt(), { width: 320, height: 240 });
        // The single wall edge gets a door node (every wall edge is a door pre-deploy).
        const doorNodes = svg.match(/<circle class="alm-graph-door-node"/g) ?? [];
        expect(doorNodes.length).toBe(1);
        // No dashed (no-door) edges in the pre-deploy parity case.
        expect(svg).not.toMatch(/stroke-dasharray/);
    });

    it('door nodes use ONLY brand colours (white + purple, no black)', () => {
        const svg = buildPlanGraphOverlaySvg(doorGraphOpt(), { width: 320, height: 240 });
        const doorNode = svg.slice(svg.indexOf('alm-graph-door-node'));
        const oneNode = doorNode.slice(0, doorNode.indexOf('</circle>'));
        expect(oneNode).toContain('fill="#ffffff"');
        expect(oneNode).toContain('stroke="#6600FF"');
        expect(oneNode).not.toMatch(/#000\b|#000000|"black"/i);
    });
});

describe('computeCirculationReachability (§CIRCULATION-REACH)', () => {
    it('reaches a bedroom that DOORS onto the corridor; NOT the living that only shares a wall', () => {
        const r = computeCirculationReachability(doorGraphOpt());
        expect(r.hasDoorGraph).toBe(true);
        // Habitable = Bedroom + Living (corridor is the spine, excluded). Living has no
        // door onto circulation → unreached. Bedroom doors onto corridor → reached.
        expect(r.total).toBe(2);
        expect(r.reached).toBe(1);
        expect(r.unreachedRoomNames).toEqual(['Living']);
        expect(r.fraction).toBeCloseTo(0.5, 5);
    });

    it('returns fraction 1.0 (MAX circulation) when every habitable room doors onto circulation', () => {
        const opt = doorGraphOpt();
        // Give Living a real door onto the corridor too.
        (opt.rooms[0] as { doorAdjacentTo: string[] }).doorAdjacentTo = ['Bedroom', 'Living'];
        (opt.rooms[2] as { doorAdjacentTo: string[] }).doorAdjacentTo = ['Corridor'];
        const r = computeCirculationReachability(opt);
        expect(r.reached).toBe(2);
        expect(r.total).toBe(2);
        expect(r.fraction).toBe(1);
        expect(r.unreachedRoomNames).toEqual([]);
    });

    it('a room reachable only THROUGH another private room (no corridor door) is unreached', () => {
        // Bedroom 2 doors only to Bedroom 1, which doors to the corridor. The
        // walk-through-a-bedroom case: Bedroom 2 IS reachable over the door graph
        // (door path exists) — so it counts as reached. This asserts the door-PATH
        // semantics (transitive over doors), distinct from "direct door onto corridor".
        const opt: LayoutOption = {
            summary: '', corridorWidthMin: 0, doors: [], walls: [],
            rooms: [
                { name: 'Corridor', type: 'corridor', area: 5, windowCount: 0, hasDirectAccess: true,
                  adjacentTo: ['Bed1'], doorAdjacentTo: ['Bed1'],
                  polygon: [{ x: 0, y: 0 }, { x: 2000, y: 0 }, { x: 2000, y: 4000 }, { x: 0, y: 4000 }] },
                { name: 'Bed1', type: 'bedroom', area: 12, windowCount: 1, hasDirectAccess: true,
                  adjacentTo: ['Corridor', 'Bed2'], doorAdjacentTo: ['Corridor', 'Bed2'],
                  polygon: [{ x: 2000, y: 0 }, { x: 5000, y: 0 }, { x: 5000, y: 4000 }, { x: 2000, y: 4000 }] },
                { name: 'Bed2', type: 'bedroom', area: 12, windowCount: 1, hasDirectAccess: false,
                  adjacentTo: ['Bed1'], doorAdjacentTo: ['Bed1'],
                  polygon: [{ x: 5000, y: 0 }, { x: 8000, y: 0 }, { x: 8000, y: 4000 }, { x: 5000, y: 4000 }] },
            ] as never,
        };
        const r = computeCirculationReachability(opt);
        expect(r.reached).toBe(2);          // both bedrooms reachable over the door path
        expect(r.fraction).toBe(1);
    });

    it('a sealed room (no door at all) is unreached → fraction < 1', () => {
        const opt = doorGraphOpt();
        // Seal the bedroom: remove its door onto the corridor.
        (opt.rooms[0] as { doorAdjacentTo: string[] }).doorAdjacentTo = [];
        (opt.rooms[1] as { doorAdjacentTo: string[] }).doorAdjacentTo = [];
        const r = computeCirculationReachability(opt);
        expect(r.unreachedRoomNames).toContain('Bedroom');
        expect(r.fraction).toBeLessThan(1);
    });
});
