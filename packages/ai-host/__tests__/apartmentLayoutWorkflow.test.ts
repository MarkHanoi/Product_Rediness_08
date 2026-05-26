// Apartment Layout Generator — AiPlane workflow impl tests (SPEC §4, A4-wire).
// Injected mocks (relay / shellReader / AIStore setter / emitter) — no live engine.

import { describe, expect, it, vi } from 'vitest';
import {
    createApartmentLayoutImpl,
    apartmentLayoutDescriptor,
    APARTMENT_LAYOUT_COST_USD_ESTIMATE,
} from '../src/workflows/apartmentLayout/workflow.js';
import type { RelayPorter } from '../src/AnthropicRelay.js';
import type { WorkflowExecutionContext } from '../src/types.js';
import type { ShellAnalysis } from '../src/workflows/apartmentLayout/shellAnalysis.js';
import type { ApartmentGenerateLayoutPayload } from '../src/workflows/apartmentLayout/types.js';

const shell: ShellAnalysis = { netAreaM2: 95, widthM: 10.5, depthM: 8.1, perimeter: [], faces: [] };

const payload: ApartmentGenerateLayoutPayload = {
    levelId: 'L0', shellWallIds: ['n', 'e', 's', 'w'], entranceDoorId: 'd0', windowIds: ['win1'],
    program: { bedrooms: 3, bathrooms: 1, masterEnSuite: true, openPlanKitchenDining: true, livingRoom: true, entranceHall: true },
    constraints: { minCorridorWidth: 900, wallThickness: 200, floorToCeiling: 2700, wallTypeId: 'partition' },
    options: { count: 2, scoringWeights: { naturalLight: 1, privacy: 1, kitchenWorkflow: 1, corridorEfficiency: 1 } },
};

function ctx(input: unknown): WorkflowExecutionContext {
    return { runId: 'run-1', projectId: 'p1', actorId: 'a1', plan: 'free', input, bus: null, now: () => 0 } as WorkflowExecutionContext;
}

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

const dataOf = (r: { preview?: unknown }) => (r.preview as { data: { status: string; reason?: string; options: unknown[] } }).data;

describe('apartmentLayoutDescriptor', () => {
    it('is a generative workflow under the SPEC-28 cost ceiling', () => {
        expect(apartmentLayoutDescriptor.kind).toBe('generative');
        expect(APARTMENT_LAYOUT_COST_USD_ESTIMATE).toBeLessThanOrEqual(0.18);
        expect(apartmentLayoutDescriptor.id).toBe('apartment-layout-generate');
    });
});

describe('createApartmentLayoutImpl', () => {
    it('ok: persists to AIStore + emits options-ready + proposes NO commands (read-only)', async () => {
        const setPendingLayouts = vi.fn();
        const emit = vi.fn();
        const impl = createApartmentLayoutImpl({
            relay: mockRelay(JSON.stringify([validOption('A'), validOption('B')])),
            shellReader: () => shell,
            setPendingLayouts, emit,
        });
        const r = await impl(ctx(payload));
        expect(dataOf(r).status).toBe('ok');
        expect(r.proposedCommands).toEqual([]);            // SPEC step 11 — no mutation in Phase A
        expect(setPendingLayouts).toHaveBeenCalledWith('run-1', expect.any(Array));
        expect(emit).toHaveBeenCalledWith('apartment.layout-options-ready', expect.objectContaining({ runId: 'run-1' }));
    });

    it('rejected: relay junk → no persist, no emit, no commands, no throw', async () => {
        const setPendingLayouts = vi.fn();
        const emit = vi.fn();
        const impl = createApartmentLayoutImpl({
            relay: mockRelay('not json'), shellReader: () => shell, setPendingLayouts, emit, maxRetries: 1,
        });
        const r = await impl(ctx(payload));
        expect(dataOf(r).status).toBe('rejected');
        expect(setPendingLayouts).not.toHaveBeenCalled();
        expect(emit).not.toHaveBeenCalled();
        expect(r.proposedCommands).toEqual([]);
    });

    it('rejects missing/invalid input with a reason', async () => {
        const impl = createApartmentLayoutImpl({
            relay: mockRelay('[]'), shellReader: () => shell, setPendingLayouts: vi.fn(),
        });
        const r = await impl(ctx(null));
        expect(dataOf(r).status).toBe('rejected');
        expect(dataOf(r).reason).toMatch(/requires/);
    });
});
