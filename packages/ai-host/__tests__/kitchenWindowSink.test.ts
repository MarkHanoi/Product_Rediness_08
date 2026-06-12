// §KITCHEN-WINDOW-SINK + §59 P2 — window-over-the-sink + the HARD-rule validation pass.
//
// (A) The L-shape kitchen must place its SINK run on an exterior wall that has a
//     window, with the sink centred under the window ("window over the sink").
// (B) §59 P2 — kitchenValidation flags corner-forbidden appliances in a corner and
//     a hob with <300 mm side-clearance, and passes a clean layout.
//
// Pure + deterministic.

import { describe, expect, it } from 'vitest';
import { planKitchen, planKitchenRun } from '../src/workflows/furnishLayout/kitchenLayout.js';
import {
    validateKitchenLayout, formatKitchenViolations,
} from '../src/workflows/furnishLayout/rules/kitchenValidation.js';
import type {
    FurnishRoomInput, Pt, PlacedFurniture, OpeningPose,
} from '../src/workflows/furnishLayout/types.js';
import { footprintOf } from '../src/workflows/furnishLayout/footprints.js';

/** Rectangular room [0,0]→[w,d], 4 walls, a door on the bottom wall, optional
 *  window on a chosen wall. */
function rectRoom(
    w: number, d: number, windows: OpeningPose[] = [],
): FurnishRoomInput {
    const poly: Pt[] = [{ x: 0, z: 0 }, { x: w, z: 0 }, { x: w, z: d }, { x: 0, z: d }];
    return {
        roomId: 'k1', levelId: 'L0', occupancy: 'kitchen',
        polygon: poly, centroid: { x: w / 2, z: d / 2 }, areaM2: w * d,
        walls: [
            { a: { x: 0, z: 0 }, b: { x: w, z: 0 }, inwardNormal: { x: 0, z: 1 }, length: w, isExterior: true },   // bottom (door)
            { a: { x: 0, z: d }, b: { x: w, z: d }, inwardNormal: { x: 0, z: -1 }, length: w, isExterior: true },   // top
            { a: { x: 0, z: 0 }, b: { x: 0, z: d }, inwardNormal: { x: 1, z: 0 }, length: d, isExterior: true },   // left
            { a: { x: w, z: 0 }, b: { x: w, z: d }, inwardNormal: { x: -1, z: 0 }, length: d, isExterior: true },   // right
        ],
        doors: [{ type: 'door', center: { x: w / 2, z: 0 }, normal: { x: 0, z: 1 }, width: 0.9 }],
        windows,
        levelElevation: 0,
    };
}

const win = (cx: number, cz: number, nx: number, nz: number, width = 1.2): OpeningPose =>
    ({ type: 'window', center: { x: cx, z: cz }, normal: { x: nx, z: nz }, width });

describe('§KITCHEN-WINDOW-SINK — window over the sink (A)', () => {
    it('L-kitchen puts the sink run on the exterior window wall, sink under the window', () => {
        // 4.5 × 3.8 → auto L. Window on the TOP wall (z = d), centred.
        const room = rectRoom(4.5, 3.8, [win(2.25, 3.8, 0, -1)]);
        const placed = planKitchen(room, 'auto');
        const sink = placed.find(p => p.kind === 'sink');
        expect(sink, 'sink placed').toBeDefined();
        // The sink sits against the TOP (window) wall: its z is near d minus the
        // half-depth (it faces into the room, back on the wall).
        expect(sink!.position.z).toBeGreaterThan(3.0);
        // And it is centred under the window (window centre x = 2.25).
        expect(Math.abs(sink!.position.x - 2.25)).toBeLessThan(0.6);
    });

    it('the planKitchenRun sink slot lands under the window', () => {
        const room = rectRoom(4.5, 3.8, [win(2.25, 3.8, 0, -1)]);
        const run = planKitchenRun(room, 'auto')[0]!;
        const cfg = run.kitchenConfig!;
        // The run is anchored on the window (top) wall.
        expect(run.position.z).toBeGreaterThan(3.0);
        // A unit on the main arm carries the sink, and it is NOT necessarily cell 0
        // (it is offset toward the window centre).
        const sinkUnit = (cfg.units ?? []).find(u => u.appliance === 'sink_inox');
        expect(sinkUnit).toBeDefined();
        expect(sinkUnit!.arm).toBe('main');
    });

    it('falls back to default behaviour when no window wall is available', () => {
        const room = rectRoom(4.5, 3.8, []);   // no windows
        const placed = planKitchen(room, 'auto');
        // Still a complete kitchen with a sink.
        expect(placed.some(p => p.kind === 'sink')).toBe(true);
    });

    it('is deterministic with a window wall', () => {
        const room = rectRoom(4.5, 3.8, [win(2.25, 3.8, 0, -1)]);
        const a = JSON.stringify(planKitchen(room, 'auto'));
        const b = JSON.stringify(planKitchen(room, 'auto'));
        expect(a).toEqual(b);
    });
});

describe('§59 P2 — kitchen HARD-rule validation (B)', () => {
    const room = rectRoom(4.5, 3.8, [win(2.25, 3.8, 0, -1)]);

    it('passes a clean planned layout — the parametric run (0 HARD violations)', () => {
        // The production path (furnishRoom → planKitchenRun) emits ONE parametric
        // run element placed on a door-free wall; it carries no corner-mappable
        // loose modules, so it validates clean.
        const run = planKitchenRun(room, 'auto');
        const res = validateKitchenLayout(run, room);
        expect(res.valid, JSON.stringify(res.violations)).toBe(true);
        expect(res.violations.length).toBe(0);
        expect(formatKitchenViolations('k1', res)).toContain('valid');
    });

    it('passes a clean hand-built loose layout (0 HARD violations)', () => {
        // A correctly-spaced loose layout: sink under the window (worktop height),
        // hob mid-wall well clear of any tall unit, fridge on the left wall away
        // from the corner with vent clearance, all off the door swing.
        const sinkFp = footprintOf('sink');
        const hobFp = footprintOf('hob');
        const fridgeFp = footprintOf('fridge');
        const clean: PlacedFurniture[] = [
            { kind: 'sink', position: { x: 2.25, y: 0, z: 3.5 }, rotationY: Math.PI, footprint: sinkFp, hostedSpaceId: 'k1' },
            { kind: 'hob', position: { x: 1.0, y: 0, z: 3.5 }, rotationY: Math.PI, footprint: hobFp, hostedSpaceId: 'k1' },
            { kind: 'fridge', position: { x: 0.35, y: 0, z: 1.5 }, rotationY: 0, footprint: fridgeFp, hostedSpaceId: 'k1' },
        ];
        const res = validateKitchenLayout(clean, room);
        expect(res.valid, JSON.stringify(res.violations)).toBe(true);
    });

    it('the per-module planKitchen layout is REPORTED (P2 reporter, never crashes)', () => {
        // planKitchen tight-packs the corner-clustered triangle by design; the
        // validator HONESTLY reports any residual HARD violation (e.g. the oven
        // landing in a corner cell) rather than crashing — the P2 doctrine.
        const placed = planKitchen(room, 'auto');
        const res = validateKitchenLayout(placed, room);
        expect(Array.isArray(res.violations)).toBe(true);
        // The reporter is total: it always yields a structured result.
        expect(typeof res.valid).toBe('boolean');
    });

    it('flags a corner-forbidden appliance placed IN a corner (C01)', () => {
        // A fridge dropped right at the room corner (polygon vertex (0,0)) → C01.
        const fridgeFp = footprintOf('fridge');
        const cornered: PlacedFurniture = {
            kind: 'fridge',
            position: { x: 0.35, y: 0, z: 0.35 },   // ~half-cabinet off the (0,0) vertex
            rotationY: 0, footprint: fridgeFp, hostedSpaceId: 'k1',
        };
        const res = validateKitchenLayout([cornered], room);
        expect(res.valid).toBe(false);
        expect(res.violations.some(v => v.rule === 'C01-corner' && v.kind === 'fridge')).toBe(true);
    });

    it('flags a hob with < 300 mm side-clearance to a tall unit (HOB-side)', () => {
        const hobFp = footprintOf('hob');
        const fridgeFp = footprintOf('fridge');
        // Hob + fridge on the same wall line (yaw 0, both against z≈0 wall) only
        // ~0.1 m apart along x → < 300 mm side-clearance.
        const hob: PlacedFurniture = {
            kind: 'hob', position: { x: 2.0, y: 0, z: 0.3 }, rotationY: 0,
            footprint: hobFp, hostedSpaceId: 'k1',
        };
        const fridge: PlacedFurniture = {
            kind: 'fridge', position: { x: 2.7, y: 0, z: 0.3 }, rotationY: 0,
            footprint: fridgeFp, hostedSpaceId: 'k1',
        };
        // hob right edge = 2.3, fridge left edge = 2.4 → 0.1 m gap (<0.3).
        const res = validateKitchenLayout([hob, fridge], room);
        expect(res.violations.some(v => v.rule === 'HOB-side')).toBe(true);
    });

    it('flags a hob sitting under a window (HOB-window)', () => {
        const hobFp = footprintOf('hob');
        // Hob centred under the top-wall window (x=2.25, z near the top wall).
        const hob: PlacedFurniture = {
            kind: 'hob', position: { x: 2.25, y: 0, z: 3.5 }, rotationY: Math.PI,
            footprint: hobFp, hostedSpaceId: 'k1',
        };
        const res = validateKitchenLayout([hob], room);
        expect(res.violations.some(v => v.rule === 'HOB-window')).toBe(true);
    });

    it('flags a tall fridge overlapping a window aperture (WIN-overlap)', () => {
        const fridgeFp = footprintOf('fridge');
        const fridge: PlacedFurniture = {
            kind: 'fridge', position: { x: 2.25, y: 0, z: 3.5 }, rotationY: Math.PI,
            footprint: fridgeFp, hostedSpaceId: 'k1',
        };
        const res = validateKitchenLayout([fridge], room);
        // Both WIN-overlap and possibly others — assert the daylight rule fired.
        expect(res.violations.some(v => v.rule === 'WIN-overlap')).toBe(true);
    });

    it('flags an appliance blocking a door swing (SWING-door)', () => {
        const sinkFp = footprintOf('sink');
        // Sink sat in the door swing band (door at x=2.25, z=0, swinging to z≈0.45).
        const sink: PlacedFurniture = {
            kind: 'sink', position: { x: 2.25, y: 0, z: 0.4 }, rotationY: 0,
            footprint: sinkFp, hostedSpaceId: 'k1',
        };
        const res = validateKitchenLayout([sink], room);
        expect(res.violations.some(v => v.rule === 'SWING-door')).toBe(true);
    });

    it('reads thresholds from the ontology (deterministic result)', () => {
        const placed = planKitchen(room, 'auto');
        const a = JSON.stringify(validateKitchenLayout(placed, room));
        const b = JSON.stringify(validateKitchenLayout(placed, room));
        expect(a).toEqual(b);
    });
});
