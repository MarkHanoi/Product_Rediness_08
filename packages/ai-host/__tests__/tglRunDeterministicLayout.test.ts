// TGL wiring — the offline engine bridge (ShellAnalysis → ScoredLayoutOption[])
// and its integration into generateLayoutOptions behind the fallback seam.

import { describe, expect, it } from 'vitest';
import { generateDeterministicLayouts } from '../src/workflows/apartmentLayout/tgl/runDeterministicLayout.js';
import { generateLayoutOptions } from '../src/workflows/apartmentLayout/generate.js';
import type { RelayPorter } from '../src/AnthropicRelay.js';
import type { ShellAnalysis } from '../src/workflows/apartmentLayout/shellAnalysis.js';
import type { ApartmentConstraints, ApartmentProgram, ScoringWeights } from '../src/workflows/apartmentLayout/types.js';

const SHELL: ShellAnalysis = {
    netAreaM2: 120, widthM: 12, depthM: 10,
    perimeter: [{ x: 0, z: 0 }, { x: 12, z: 0 }, { x: 12, z: 10 }, { x: 0, z: 10 }],
    faces: [],
};
const PROGRAM: ApartmentProgram = {
    bedrooms: 2, bathrooms: 1, masterEnSuite: true,
    openPlanKitchenDining: true, livingRoom: true, entranceHall: true,
};
const CONSTRAINTS: ApartmentConstraints = { minCorridorWidth: 900, wallThickness: 100, floorToCeiling: 2700, wallTypeId: '' };
const WEIGHTS: ScoringWeights = { naturalLight: 1, privacy: 1, kitchenWorkflow: 1, corridorEfficiency: 1 };

/** Relay that always fails — simulates no API key / 401 / 500. */
const offlineRelay: RelayPorter = { complete: async () => { throw new Error('offline (no AI upstream)'); } };

describe('generateDeterministicLayouts (TGL wiring)', () => {
    it('produces ranked, scored, real layouts for a shell', () => {
        const out = generateDeterministicLayouts(SHELL, PROGRAM, CONSTRAINTS, WEIGHTS, 3);
        expect(out.length).toBeGreaterThan(0);
        expect(out.length).toBeLessThanOrEqual(3);
        for (const o of out) {
            expect(o.rooms.length).toBeGreaterThan(0);
            expect(o.walls.length).toBeGreaterThan(0);
            expect(o.summary).toContain('D-TGL');
            expect(o.score.overall).toBeGreaterThanOrEqual(0);
            expect(o.score.overall).toBeLessThanOrEqual(100);
        }
    });

    it('is deterministic for the same shell + program', () => {
        const a = generateDeterministicLayouts(SHELL, PROGRAM, CONSTRAINTS, WEIGHTS, 2);
        const b = generateDeterministicLayouts(SHELL, PROGRAM, CONSTRAINTS, WEIGHTS, 2);
        expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
    });

    it('returns [] for a degenerate shell', () => {
        const bad: ShellAnalysis = { ...SHELL, perimeter: [{ x: 0, z: 0 }] };
        expect(generateDeterministicLayouts(bad, PROGRAM, CONSTRAINTS, WEIGHTS, 3)).toEqual([]);
    });

    it('generateLayoutOptions falls back to D-TGL when the relay is offline + fallback opted-in', async () => {
        const res = await generateLayoutOptions(
            { shell: SHELL, program: PROGRAM, constraints: CONSTRAINTS, weights: WEIGHTS, count: 3 },
            offlineRelay,
            { proceduralFallback: true },
        );
        expect(res.status).toBe('ok');
        expect(res.options.length).toBeGreaterThan(0);
        expect(res.reason).toContain('D-TGL');
        expect(res.options[0]!.summary).toContain('D-TGL');
    });

    it('without the fallback flag, an offline relay still rejects honestly', async () => {
        const res = await generateLayoutOptions(
            { shell: SHELL, program: PROGRAM, constraints: CONSTRAINTS, weights: WEIGHTS, count: 3 },
            offlineRelay,
            {},
        );
        expect(res.status).toBe('rejected');
        expect(res.options).toEqual([]);
    });
});
