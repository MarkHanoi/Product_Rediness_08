// Apartment Layout Generator — registration-root tests (SPEC §16, A5.3).
//
// Drives createApartmentLayoutRegistration against a REAL AiPlane: asserts it
// narrows the plane off a host, composes the store-backed shellReader from
// injected accessors, registers idempotently, and is defensive when no plane
// exists. Then proves a subsequent plane.submit() runs end-to-end.

import { describe, expect, it, vi } from 'vitest';
import { AiPlane } from '../src/AiPlane.js';
import { WorkflowRegistry } from '../src/WorkflowRegistry.js';
import {
    createApartmentLayoutRegistration,
    APARTMENT_LAYOUT_WORKFLOW_ID,
} from '../src/workflows/apartmentLayout/register.js';
import type { ShellWallRecord } from '../src/workflows/apartmentLayout/shellReader.js';
import type { ApartmentGenerateLayoutPayload } from '../src/workflows/apartmentLayout/types.js';
import type { AiApprovalQueueLike, AiPendingAction } from '../src/types.js';

// ── A 10×8 rectangle shell, read via the injected getWall accessor ───────────
const RECT: Record<string, ShellWallRecord> = {
    n: { id: 'n', levelId: 'L0', baseLine: [{ x: 0, z: 0 }, { x: 10, z: 0 }], openings: [{ type: 'window' }, { type: 'window' }] },
    e: { id: 'e', levelId: 'L0', baseLine: [{ x: 10, z: 0 }, { x: 10, z: 8 }], openings: [{ type: 'window' }] },
    s: { id: 's', levelId: 'L0', baseLine: [{ x: 10, z: 8 }, { x: 0, z: 8 }], openings: [{ type: 'door', elementId: 'd0' }] },
    w: { id: 'w', levelId: 'L0', baseLine: [{ x: 0, z: 8 }, { x: 0, z: 0 }], openings: [] },
};

const payload: ApartmentGenerateLayoutPayload = {
    levelId: 'L0', shellWallIds: ['n', 'e', 's', 'w'], entranceDoorId: 'd0', windowIds: [],
    program: { bedrooms: 3, bathrooms: 1, masterEnSuite: true, openPlanKitchenDining: true, livingRoom: true, entranceHall: true },
    constraints: { minCorridorWidth: 900, wallThickness: 200, floorToCeiling: 2700, wallTypeId: 'partition' },
    options: { count: 2, scoringWeights: { naturalLight: 1, privacy: 1, kitchenWorkflow: 1, corridorEfficiency: 1 } },
};

class CollectingQueue implements AiApprovalQueueLike {
    readonly actions: AiPendingAction[] = [];
    enqueue(a: AiPendingAction): void { this.actions.push(a); }
}
class StubCostMeter {
    recorded = 0;
    async preCheckBudget() { return { ok: true as const }; }
    async recordCall() { this.recorded++; }
}

function makeHostWithPlane() {
    const queue = new CollectingQueue();
    const registry = new WorkflowRegistry();
    const plane = new AiPlane({ approvalQueue: queue, costMeter: new StubCostMeter() as never, workflowRegistry: registry });
    return { host: { plane }, plane, queue, registry };
}

const getWall = (id: string): ShellWallRecord | undefined => RECT[id];
const dataOf = (a: AiPendingAction) => (a.preview as { data: { status: string } }).data;

describe('createApartmentLayoutRegistration (A5.3 root)', () => {
    it('registers onto the host plane + composes the shellReader from accessors', async () => {
        const { host, registry, plane } = makeHostWithPlane();
        const setPendingLayouts = vi.fn();
        const emit = vi.fn();

        const res = createApartmentLayoutRegistration({
            host, getWall, getOrientation: () => 'N', setPendingLayouts, emit,
        });
        expect(res.registered).toBe(true);
        expect(res.workflowId).toBe(APARTMENT_LAYOUT_WORKFLOW_ID);
        expect(registry.has(APARTMENT_LAYOUT_WORKFLOW_ID)).toBe(true);

        // The wired workflow runs end-to-end (mock relay → ok → persist + emit).
        const action = await plane.submit({
            workflow: APARTMENT_LAYOUT_WORKFLOW_ID, projectId: 'P1', actorId: 'U', plan: 'team', input: payload,
        });
        expect(dataOf(action).status).toBe('ok');
        expect(setPendingLayouts).toHaveBeenCalledWith(action.runId, expect.any(Array));
        expect(emit).toHaveBeenCalledWith('apartment.layout-options-ready', expect.objectContaining({ runId: action.runId }));
        expect(action.proposedCommands).toEqual([]);
    });

    it('is idempotent — a second call does not throw / re-register', () => {
        const { host, registry } = makeHostWithPlane();
        const first = createApartmentLayoutRegistration({ host, getWall, setPendingLayouts: vi.fn() });
        const second = createApartmentLayoutRegistration({ host, getWall, setPendingLayouts: vi.fn() });
        expect(first.registered).toBe(true);
        expect(second.registered).toBe(false);
        expect(second.reason).toMatch(/already registered/);
        expect(registry.list()).toHaveLength(1);
    });

    it('is defensive when the host has no plane (approvalQueue not wired)', () => {
        const res = createApartmentLayoutRegistration({ host: { plane: undefined }, getWall, setPendingLayouts: vi.fn() });
        expect(res.registered).toBe(false);
        expect(res.workflowId).toBeNull();
        expect(res.reason).toMatch(/no AiPlane/);
    });

    it('is defensive when host is null/undefined', () => {
        expect(createApartmentLayoutRegistration({ host: null, getWall, setPendingLayouts: vi.fn() }).registered).toBe(false);
        expect(createApartmentLayoutRegistration({ host: undefined, getWall, setPendingLayouts: vi.fn() }).registered).toBe(false);
    });
});
