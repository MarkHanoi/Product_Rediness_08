// layoutRequestPayload — pure generate-payload builder tests (SPEC §3, A5-modal).

import { describe, expect, it } from 'vitest';
import {
    buildLayoutRequestPayload,
    DEFAULT_PROGRAM,
    DEFAULT_CONSTRAINTS,
    DEFAULT_WEIGHTS,
    DEFAULT_OPTION_COUNT,
    type PayloadWall,
} from '../src/ui/apartment-layout/layoutRequestPayload.js';

const walls: PayloadWall[] = [
    { id: 'n', isExterior: true, openings: [{ type: 'window', elementId: 'win-n1' }, { type: 'window', elementId: 'win-n2' }] },
    { id: 'e', isExterior: true, openings: [{ type: 'door', elementId: 'door-e' }] },
    { id: 's', isExterior: true, openings: [] },
    { id: 'interior-1', isExterior: false, openings: [{ type: 'door', elementId: 'door-i' }, { type: 'window', elementId: 'win-i' }] },
];

const base = { levelId: 'L0', walls, program: DEFAULT_PROGRAM, constraints: DEFAULT_CONSTRAINTS };

describe('buildLayoutRequestPayload (A5-modal)', () => {
    it('uses only EXTERIOR walls as the shell', () => {
        const p = buildLayoutRequestPayload(base);
        expect(p.shellWallIds).toEqual(['n', 'e', 's']);     // interior-1 excluded
        expect(p.levelId).toBe('L0');
    });

    it('gathers window ids + the entrance door from exterior walls only', () => {
        const p = buildLayoutRequestPayload(base);
        expect(p.windowIds).toEqual(['win-n1', 'win-n2']);    // interior window excluded
        expect(p.entranceDoorId).toBe('door-e');              // first exterior door; interior door excluded
    });

    it('defaults count + weights + carries program/constraints', () => {
        const p = buildLayoutRequestPayload(base);
        expect(p.options.count).toBe(DEFAULT_OPTION_COUNT);
        expect(p.options.scoringWeights).toEqual(DEFAULT_WEIGHTS);
        expect(p.program).toBe(DEFAULT_PROGRAM);
        expect(p.constraints).toBe(DEFAULT_CONSTRAINTS);
    });

    it('honours explicit count + weights', () => {
        const p = buildLayoutRequestPayload({ ...base, count: 5, scoringWeights: { naturalLight: 2, privacy: 0, kitchenWorkflow: 1, corridorEfficiency: 1 } });
        expect(p.options.count).toBe(5);
        expect(p.options.scoringWeights.naturalLight).toBe(2);
    });

    it('entranceDoorId is "" when no exterior door exists', () => {
        const p = buildLayoutRequestPayload({ ...base, walls: [{ id: 'n', isExterior: true, openings: [{ type: 'window', elementId: 'w' }] }] });
        expect(p.entranceDoorId).toBe('');
    });

    it('skips openings with no elementId', () => {
        const p = buildLayoutRequestPayload({ ...base, walls: [{ id: 'n', isExterior: true, openings: [{ type: 'window' }, { type: 'door' }] }] });
        expect(p.windowIds).toEqual([]);
        expect(p.entranceDoorId).toBe('');
    });

    it('computes windowSpansWorld from window opening offset+width along the wall baseLine', () => {
        // Horizontal south wall from (0,0) → (10,0), one window at 4 m offset, 2 m wide.
        const wallsW: PayloadWall[] = [{
            id: 's', isExterior: true,
            baseLine: [{ x: 0, z: 0 }, { x: 10, z: 0 }],
            openings: [{ type: 'window', elementId: 'win-s', offset: 4, width: 2 }],
        }];
        const p = buildLayoutRequestPayload({ ...base, walls: wallsW });
        expect(p.windowSpansWorld).toBeDefined();
        expect(p.windowSpansWorld!.length).toBe(1);
        const span = p.windowSpansWorld![0]!;
        expect(span.a.x).toBeCloseTo(4, 6);
        expect(span.a.z).toBeCloseTo(0, 6);
        expect(span.b.x).toBeCloseTo(6, 6);
        expect(span.b.z).toBeCloseTo(0, 6);
    });

    it('omits windowSpansWorld when no window has both offset + width + baseLine', () => {
        const wallsW: PayloadWall[] = [{
            id: 's', isExterior: true,
            openings: [{ type: 'window', elementId: 'win-s' }],   // no offset/width
        }];
        const p = buildLayoutRequestPayload({ ...base, walls: wallsW });
        expect(p.windowSpansWorld).toBeUndefined();
    });
});
