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
});
