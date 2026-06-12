// §LIVING-ROOM-RULE-ENGINE (founder #12, 2026-06-12) — the living-room rule module
// + the TV-in-front-of-sofa placement.
//
// (A) livingValidation: the sofa↔TV HARD rules (TV faces the sofa, TV opposite the
//     sofa across the coffee table, viewing-distance band, focal-wall facing,
//     circulation aisle) + the 8-axis scorecard.
// (B) furnishRoom: the living-room archetype seats the media unit (tv_unit) IN
//     FRONT OF the sofa (on the wall the sofa faces, on the sofa axis, facing back).
//
// Pure + deterministic.

import { describe, expect, it } from 'vitest';
import {
    validateLivingLayout, scoreLivingLayout, resolveLivingItems,
    formatLivingViolations, formatLivingScore,
    LIVING_SCORECARD_WEIGHTS, VIEW_DIST_LO, VIEW_DIST_HI,
} from '../src/workflows/furnishLayout/rules/livingValidation.js';
import { furnishRoom } from '../src/workflows/furnishLayout/furnishRoom.js';
import { footprintOf } from '../src/workflows/furnishLayout/footprints.js';
import type {
    FurnishRoomInput, Pt, PlacedFurniture, OpeningPose,
} from '../src/workflows/furnishLayout/types.js';

/** Rectangular living room [0,0]→[w,d], 4 walls, a door on the bottom wall,
 *  optional windows. The bottom wall (z=0) carries the door; the sofa anchors the
 *  longest free wall and faces into the room toward the opposite wall. */
function rectRoom(w: number, d: number, windows: OpeningPose[] = []): FurnishRoomInput {
    const poly: Pt[] = [{ x: 0, z: 0 }, { x: w, z: 0 }, { x: w, z: d }, { x: 0, z: d }];
    return {
        roomId: 'lr1', levelId: 'L0', occupancy: 'living-room',
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

// A sofa backed on the bottom wall (z≈0) facing into the room (+z), and a tv
// opposite it on the top wall (z≈d) facing back (−z). Viewing distance ≈ d.
function facingPair(d = 3.4): { sofa: PlacedFurniture; tv: PlacedFurniture; unit: PlacedFurniture } {
    const sofaFp = footprintOf('sofa');
    const tvFp = footprintOf('tv');
    const unitFp = footprintOf('tv_unit');
    const sofa: PlacedFurniture = {
        kind: 'sofa', position: { x: 2.5, y: 0, z: sofaFp.l / 2 + 0.02 }, rotationY: 0,   // faces +z
        footprint: sofaFp, hostedSpaceId: 'lr1',
    };
    const tv: PlacedFurniture = {
        kind: 'tv', position: { x: 2.5, y: 1.2, z: d - 0.04 }, rotationY: Math.PI,   // faces −z
        footprint: tvFp, hostedSpaceId: 'lr1',
    };
    const unit: PlacedFurniture = {
        kind: 'tv_unit', position: { x: 2.5, y: 0, z: d - unitFp.l / 2 - 0.02 }, rotationY: Math.PI,
        footprint: unitFp, hostedSpaceId: 'lr1',
    };
    return { sofa, tv, unit };
}

describe('§LIVING — livingValidation HARD rules (A)', () => {
    const room = rectRoom(5, 3.4);

    it('a TV facing + opposite the sofa within the viewing band is VALID', () => {
        const { sofa, tv, unit } = facingPair(3.4);
        const res = validateLivingLayout([sofa, unit, tv], room);
        expect(res.valid, JSON.stringify(res.violations)).toBe(true);
        expect(formatLivingViolations('lr1', res)).toContain('valid');
    });

    it('flags a TV that does NOT face the sofa (TV-FACE)', () => {
        const { sofa, tv, unit } = facingPair(3.4);
        // rotate the tv 90° so it faces sideways, not back at the sofa.
        const sideTv: PlacedFurniture = { ...tv, rotationY: Math.PI / 2 };
        const res = validateLivingLayout([sofa, unit, sideTv], room);
        expect(res.violations.some(v => v.rule === 'TV-FACE')).toBe(true);
    });

    it('flags a TV not OPPOSITE the sofa across the table (TV-OPP)', () => {
        const { sofa } = facingPair(3.4);
        // a tv off to the SIDE of the sofa (same wall direction), not in front.
        const unitFp = footprintOf('tv_unit');
        const sideUnit: PlacedFurniture = {
            kind: 'tv_unit', position: { x: 4.6, y: 0, z: sofa.position.z }, rotationY: -Math.PI / 2,
            footprint: unitFp, hostedSpaceId: 'lr1',
        };
        const res = validateLivingLayout([sofa, sideUnit], room);
        expect(res.violations.some(v => v.rule === 'TV-OPP')).toBe(true);
    });

    it('flags a viewing distance outside the comfort band (TV-DIST)', () => {
        // a SHORT room (d = 1.8 m) → sofa↔tv < VIEW_DIST_LO.
        const tightRoom = rectRoom(5, 1.8);
        const { sofa, tv, unit } = facingPair(1.8);
        const res = validateLivingLayout([sofa, unit, tv], tightRoom);
        expect(res.violations.some(v => v.rule === 'TV-DIST')).toBe(true);
        expect(VIEW_DIST_LO).toBeLessThan(VIEW_DIST_HI);
    });

    it('flags a sofa NOT facing the focal wall (SOFA-FOCAL)', () => {
        const { tv, unit } = facingPair(3.4);
        const sofaFp = footprintOf('sofa');
        // sofa rotated 180° → it faces AWAY from the tv (toward the door wall).
        const awaySofa: PlacedFurniture = {
            kind: 'sofa', position: { x: 2.5, y: 0, z: 3.4 - sofaFp.l / 2 - 0.02 }, rotationY: Math.PI,
            footprint: sofaFp, hostedSpaceId: 'lr1',
        };
        const res = validateLivingLayout([awaySofa, unit, tv], room);
        expect(res.violations.some(v => v.rule === 'SOFA-FOCAL' || v.rule === 'TV-OPP')).toBe(true);
    });

    it('is vacuously valid with no sofa + no TV', () => {
        const res = validateLivingLayout([], room);
        expect(res.valid).toBe(true);
        expect(res.violations.length).toBe(0);
    });

    it('resolveLivingItems prefers the wall-mounted tv as the facing reference', () => {
        const { sofa, tv, unit } = facingPair(3.4);
        const items = resolveLivingItems([sofa, unit, tv]);
        expect(items.tv?.kind).toBe('tv');          // panel preferred for facing/distance
        expect(items.mediaUnit?.kind).toBe('tv_unit');
        expect(items.sofa?.kind).toBe('sofa');
    });

    it('is deterministic', () => {
        const { sofa, tv, unit } = facingPair(3.4);
        const a = JSON.stringify(validateLivingLayout([sofa, unit, tv], room));
        const b = JSON.stringify(validateLivingLayout([sofa, unit, tv], room));
        expect(a).toEqual(b);
    });
});

describe('§LIVING — the 8-axis scorecard (A)', () => {
    const room = rectRoom(5, 3.4);

    it('a well-aligned layout scores higher than a misaligned one', () => {
        const { sofa, tv, unit } = facingPair(3.4);
        const good = scoreLivingLayout([sofa, unit, tv], room, { valid: true });
        // misaligned: tv off to the side facing sideways.
        const badTv: PlacedFurniture = { ...tv, rotationY: Math.PI / 2, position: { ...tv.position, x: 4.6 } };
        const bad = scoreLivingLayout([sofa, badTv], room, { valid: false });
        expect(good.total).toBeGreaterThan(bad.total);
    });

    it('the scorecard weights sum to 100', () => {
        const w = LIVING_SCORECARD_WEIGHTS;
        const sum = w.workflow + w.circulation + w.storage + w.mep +
            w.naturalLight + w.buildability + w.cost + w.aesthetics;
        expect(sum).toBe(100);
    });

    it('the alignment axis (workflow) is high for a facing pair', () => {
        const { sofa, tv, unit } = facingPair(3.4);
        const s = scoreLivingLayout([sofa, unit, tv], room, { valid: true });
        expect(s.axes.workflow).toBeGreaterThan(80);
        expect(s.axes.buildability).toBe(100);   // viewing distance inside the band
    });

    it('penalises a tall media piece blocking a window (naturalLight)', () => {
        const winRoom = rectRoom(5, 3.4, [win(2.5, 3.4, 0, -1)]);
        const { sofa, tv, unit } = facingPair(3.4);
        // tv sits across the window aperture on the top wall.
        const s = scoreLivingLayout([sofa, unit, tv], winRoom, { valid: true });
        expect(s.axes.naturalLight).toBeLessThan(100);
    });

    it('formatLivingScore produces a §DIAG line', () => {
        const { sofa, tv, unit } = facingPair(3.4);
        const s = scoreLivingLayout([sofa, unit, tv], room, { valid: true });
        expect(formatLivingScore('lr1', 'placed', s)).toContain('§DIAG-LIVING-SCORE');
    });
});

describe('§LIVING-TV-FACES-SOFA — TV placed in front of the sofa (B)', () => {
    it('seats the media unit OPPOSITE the sofa, facing back at it, in the band', () => {
        const room = rectRoom(5, 3.6);
        const placed = furnishRoom(room);
        const sofa = placed.find(p => p.kind === 'sofa' || p.kind === 'corner_sofa');
        const unit = placed.find(p => p.kind === 'tv_unit');
        expect(sofa, 'sofa placed').toBeDefined();
        expect(unit, 'tv_unit placed').toBeDefined();

        // The validator (the canonical statement of the founder rule) passes for
        // the produced layout — the TV faces + is opposite the sofa within the band.
        const res = validateLivingLayout(placed, room);
        const facingViolations = res.violations.filter(v =>
            v.rule === 'TV-FACE' || v.rule === 'TV-OPP' || v.rule === 'SOFA-FOCAL');
        expect(facingViolations, JSON.stringify(res.violations)).toEqual([]);

        // Geometrically: the unit's forward (into-room normal) points back toward
        // the sofa (the screen faces the seating).
        const unitFwd = { x: Math.sin(unit!.rotationY), z: Math.cos(unit!.rotationY) };
        const toSofa = {
            x: sofa!.position.x - unit!.position.x,
            z: sofa!.position.z - unit!.position.z,
        };
        const dot = unitFwd.x * toSofa.x + unitFwd.z * toSofa.z;
        expect(dot).toBeGreaterThan(0);   // unit faces toward the sofa

        // The sofa↔unit viewing distance is a sane lounge span (the unit is on the
        // OPPOSITE wall, not crammed beside the sofa).
        const viewDist = Math.hypot(toSofa.x, toSofa.z);
        expect(viewDist).toBeGreaterThan(2.0);
    });

    it('the tv panel mounts on the media-unit wall (above the unit)', () => {
        const room = rectRoom(5, 3.6);
        const placed = furnishRoom(room);
        const unit = placed.find(p => p.kind === 'tv_unit');
        const tv = placed.find(p => p.kind === 'tv');
        if (unit && tv) {
            // same yaw (both face the sofa) + near the same XZ (tv hangs over unit).
            expect(Math.abs(tv.rotationY - unit.rotationY)).toBeLessThan(1e-6);
            expect(Math.hypot(tv.position.x - unit.position.x, tv.position.z - unit.position.z))
                .toBeLessThan(0.6);
            expect(tv.position.y).toBeGreaterThan(1.0);   // wall-mounted at eye level
        }
    });

    it('the unit centres on the sofa axis (as front as possible)', () => {
        const room = rectRoom(5, 3.6);
        const placed = furnishRoom(room);
        const sofa = placed.find(p => p.kind === 'sofa');
        const unit = placed.find(p => p.kind === 'tv_unit');
        if (sofa && unit) {
            // both on the same forward axis → small lateral offset along the wall.
            const lateral = Math.abs(sofa.position.x - unit.position.x);
            expect(lateral).toBeLessThan(0.8);
        }
    });

    it('is deterministic', () => {
        const room = rectRoom(5, 3.6);
        const a = JSON.stringify(furnishRoom(room));
        const b = JSON.stringify(furnishRoom(room));
        expect(a).toEqual(b);
    });
});
