// Apartment Layout Generator — generation orchestrator tests (SPEC §4/§6/§7/§10, A4).
// Uses an injected Mock relay (no live AI). Validates the prompt → parse → validate
// → retry → score → rank loop.

import { describe, expect, it, vi } from 'vitest';
import {
    generateLayoutOptions,
    parseLayoutOptions,
    buildLayoutPrompt,
    type GenerateLayoutInput,
} from '../src/workflows/apartmentLayout/generate.js';
import type { RelayPorter } from '../src/AnthropicRelay.js';
import type { ShellAnalysis } from '../src/workflows/apartmentLayout/shellAnalysis.js';

const shell: ShellAnalysis = {
    netAreaM2: 95, widthM: 10.5, depthM: 8.1, perimeter: [],
    faces: [
        { wallId: 'n', class: 'entrance-side', windowCount: 0, orientation: 'N' },
        { wallId: 's', class: 'best-light', windowCount: 2, orientation: 'S' },
    ],
};
const input: GenerateLayoutInput = {
    shell,
    program: { bedrooms: 3, bathrooms: 1, masterEnSuite: true, openPlanKitchenDining: true, livingRoom: true, entranceHall: true },
    constraints: { minCorridorWidth: 900, wallThickness: 200, floorToCeiling: 2700, wallTypeId: 'partition' },
    weights: { naturalLight: 1, privacy: 1, kitchenWorkflow: 1, corridorEfficiency: 1 },
    count: 2,
};

function validOption(summary: string) {
    return {
        summary, corridorWidthMin: 1000,
        walls: [{ start: { x: 0, y: 0 }, end: { x: 1000, y: 0 } }],
        doors: [{ wallRef: 0, offset: 300, width: 900 }],
        rooms: [
            { name: 'Hall', type: 'hall', area: 5, windowCount: 0, hasDirectAccess: true, adjacentTo: ['Living', 'Corridor'] },
            { name: 'Living', type: 'living', area: 22, windowCount: 2, hasDirectAccess: true, adjacentTo: ['Hall', 'Dining'] },
            { name: 'Dining', type: 'dining', area: 11, windowCount: 1, hasDirectAccess: true, adjacentTo: ['Living', 'Kitchen'] },
            { name: 'Kitchen', type: 'kitchen', area: 10, windowCount: 1, hasDirectAccess: true, adjacentTo: ['Dining'] },
            { name: 'Corridor', type: 'corridor', area: 4, windowCount: 0, hasDirectAccess: true, adjacentTo: ['Hall', 'Master', 'Bed2', 'Bed3', 'Bath'] },
            { name: 'Master', type: 'master', area: 14, windowCount: 1, hasDirectAccess: true, adjacentTo: ['Corridor', 'Ensuite'] },
            { name: 'Ensuite', type: 'ensuite', area: 4.2, windowCount: 0, hasDirectAccess: false, adjacentTo: ['Master'] },
            { name: 'Bed2', type: 'bedroom', area: 12, windowCount: 1, hasDirectAccess: true, adjacentTo: ['Corridor'] },
            { name: 'Bed3', type: 'bedroom', area: 11.5, windowCount: 1, hasDirectAccess: true, adjacentTo: ['Corridor'] },
            { name: 'Bath', type: 'bathroom', area: 5, windowCount: 0, hasDirectAccess: true, adjacentTo: ['Corridor'] },
        ],
    };
}

const mockRelay = (text: string): RelayPorter =>
    ({ complete: vi.fn(async () => ({ text, costUsd: 0.01, model: 'mock' })) } as unknown as RelayPorter);

describe('parseLayoutOptions (loud-fail-soft)', () => {
    it('parses a JSON array', () => {
        expect(parseLayoutOptions(JSON.stringify([validOption('A'), validOption('B')]))).toHaveLength(2);
    });
    it('parses a single object and an {options:[]} wrapper', () => {
        expect(parseLayoutOptions(JSON.stringify(validOption('A')))).toHaveLength(1);
        expect(parseLayoutOptions(JSON.stringify({ options: [validOption('A')] }))).toHaveLength(1);
    });
    it('returns [] for non-JSON without throwing', () => {
        expect(parseLayoutOptions('sorry, here is your layout')).toEqual([]);
    });
});

describe('buildLayoutPrompt', () => {
    it('includes shell, faces, program, constraints; appends prior failures on retry', () => {
        const p0 = buildLayoutPrompt(shell, input.program, input.constraints);
        expect(p0).toMatch(/95.0 m²/);
        expect(p0).toMatch(/best-light/);
        expect(p0).not.toMatch(/PREVIOUS ATTEMPT/);
        const p1 = buildLayoutPrompt(shell, input.program, input.constraints, ['Bed3 too small']);
        expect(p1).toMatch(/PREVIOUS ATTEMPT FAILED.*Bed3 too small/);
    });
});

describe('generateLayoutOptions', () => {
    it('returns `count` scored options ranked desc on first try', async () => {
        const relay = mockRelay(JSON.stringify([validOption('A'), validOption('B'), validOption('C')]));
        const r = await generateLayoutOptions(input, relay, { maxRetries: 3 });
        expect(r.status).toBe('ok');
        expect(r.options).toHaveLength(2);          // truncated to count
        expect(r.attempts).toBe(1);                  // first-try success
        expect(r.options[0]!.score.overall).toBeGreaterThanOrEqual(r.options[1]!.score.overall);
        expect(r.options[0]!.score.overall).toBeGreaterThan(0);
    });

    it('retries when the first response is invalid, then succeeds (§10)', async () => {
        let call = 0;
        const relay = {
            complete: vi.fn(async () => {
                call++;
                // 1st call: a bedroom too small (V1 fails) → no valid option; then valid.
                const bad = validOption('bad'); bad.rooms.find(r => r.name === 'Bed3')!.area = 5;
                return { text: JSON.stringify([call === 1 ? bad : validOption('good')]), costUsd: 0.01, model: 'mock' };
            }),
        } as unknown as RelayPorter;
        const r = await generateLayoutOptions({ ...input, count: 1 }, relay, { maxRetries: 3 });
        expect(r.status).toBe('ok');
        expect(r.options).toHaveLength(1);
        expect(r.attempts).toBeGreaterThanOrEqual(2);
    });

    it('rejects (status) when no valid option after retries — never throws', async () => {
        const relay = mockRelay('not json at all');
        const r = await generateLayoutOptions(input, relay, { maxRetries: 2 });
        expect(r.status).toBe('rejected');
        expect(r.options).toHaveLength(0);
        expect(r.attempts).toBe(2);
    });
});
