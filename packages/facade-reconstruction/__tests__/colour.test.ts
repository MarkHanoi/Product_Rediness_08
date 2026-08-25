// S17 COLOUR (§L-11128) — the wall between the openings, measured; the openings, measured;
// and UNKNOWN when there is no plane.
//
// A synthetic RGBA facade with a KNOWN wall colour and KNOWN dark-red openings, so
// the assertion is against ground truth the test drew (C108 §9), not against a
// number that happened to come out.

import { describe, it, expect } from 'vitest';
import { measureColour, COLOUR_UNIFORMITY_TOLERANCE } from '../src/reconstruction/surface/colour.js';
import type { RasterImage, Rect } from '../src/contracts/RasterImage.js';

const WALL = [0xa8, 0xc4, 0xb0];      // pale glazed-tile green
const OPENING = [0x5a, 0x22, 0x1e];   // dark red joinery

function drawFacade(width: number, height: number, boxes: Rect[]): RasterImage {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4;
            const inside = boxes.some((b) => x >= b.x0 && x < b.x1 && y >= b.y0 && y < b.y1);
            const c = inside ? OPENING : WALL;
            // A little deterministic texture on the wall so the share is < 1 but high.
            const t = inside ? 0 : ((x * 7 + y * 13) % 5) - 2;
            data[i] = c[0]! + t; data[i + 1] = c[1]! + t; data[i + 2] = c[2]! + t; data[i + 3] = 255;
        }
    }
    return { width, height, data };
}

const BOXES: Rect[] = [
    { x0: 20, y0: 20, x1: 60, y1: 80 },
    { x0: 100, y0: 20, x1: 140, y1: 80 },
    { x0: 20, y0: 120, x1: 60, y1: 180 },
    { x0: 100, y0: 120, x1: 140, y1: 180 },
];

describe('S17 colour (§L-11128)', () => {
    it('reads the wall colour and the opening colour, each to within the tolerance', () => {
        const img = drawFacade(200, 220, BOXES);
        const m = measureColour(img, BOXES.map((bbox) => ({ bbox, matched: true })), true);
        expect(m.wall).not.toBeNull();
        expect(m.openings).not.toBeNull();
        const hexToRgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
        const w = hexToRgb(m.wall!.hex);
        const o = hexToRgb(m.openings!.hex);
        for (let c = 0; c < 3; c++) {
            expect(Math.abs(w[c]! - WALL[c]!)).toBeLessThanOrEqual(3);
            expect(Math.abs(o[c]! - OPENING[c]!)).toBeLessThanOrEqual(3);
        }
        // A textured but uniform wall: high share, and the confidence IS the share.
        expect(m.wall!.share).toBeGreaterThan(0.9);
        expect(m.confidence).toBe(m.wall!.share);
        expect(m.notes.some((n) => n.startsWith('colour: wall #'))).toBe(true);
    });

    it('the wall sample EXCLUDES the openings — masking is what keeps red out of green', () => {
        const img = drawFacade(200, 220, BOXES);
        const masked = measureColour(img, BOXES.map((bbox) => ({ bbox, matched: true })), true);
        const unmasked = measureColour(img, [], true);
        // With no masks the openings pollute the wall's share; with masks they do not.
        expect(masked.wall!.share).toBeGreaterThan(unmasked.wall!.share);
        expect(masked.openings).not.toBeNull();
        expect(unmasked.openings).toBeNull(); // nothing matched ⇒ nothing to read inside
    });

    it('no plane ⇒ the hex is still reported but confidence is UNKNOWN (C108 §4.3)', () => {
        const img = drawFacade(200, 220, BOXES);
        const m = measureColour(img, BOXES.map((bbox) => ({ bbox, matched: true })), false);
        expect(m.wall).not.toBeNull();
        expect(m.confidence).toBeNull();
        expect(m.notes[0]).toContain('plane UNKNOWN');
    });

    it('no rectified image ⇒ nothing measured, and it says so', () => {
        const m = measureColour(null, [], true);
        expect(m.wall).toBeNull();
        expect(m.confidence).toBeNull();
        expect(m.notes[0]).toContain('not measured');
    });

    it('the tolerance is a named reporting scale, not a hidden gate', () => {
        expect(COLOUR_UNIFORMITY_TOLERANCE).toBe(32);
    });
});
