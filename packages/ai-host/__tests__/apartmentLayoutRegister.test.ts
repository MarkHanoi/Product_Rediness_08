// Apartment Layout Generator — A4-register binding tests (SPEC §16).
//
// Drives the FULL binding through a REAL AiPlane (real WorkflowRegistry, real
// submit pipeline: budget gate → impl run → cost record → enqueue). Only the
// approval queue + cost meter are the canonical test stubs (same as
// Generate3Options.test.ts) and the relay is the shared MockAnthropicRelay
// (SPEC-47 §7) — proving the in-process path produces scored options with NO
// live AI, NO DOM, NO editor stores.

import { describe, expect, it, vi } from 'vitest';
import { AiPlane } from '../src/AiPlane.js';
import { WorkflowRegistry } from '../src/WorkflowRegistry.js';
import { MockAnthropicRelay } from '../src/AnthropicRelay.js';
import {
    registerApartmentLayoutWorkflow,
    APARTMENT_LAYOUT_WORKFLOW_ID,
} from '../src/workflows/apartmentLayout/register.js';
import type { ShellAnalysis } from '../src/workflows/apartmentLayout/shellAnalysis.js';
import type { ApartmentGenerateLayoutPayload } from '../src/workflows/apartmentLayout/types.js';
import type { AiApprovalQueueLike, AiPendingAction } from '../src/types.js';

// ─── Canonical SPEC worked-example shell + program ───────────────────────────
const shell: ShellAnalysis = { netAreaM2: 95, widthM: 10.5, depthM: 8.1, perimeter: [], faces: [] };

const payload: ApartmentGenerateLayoutPayload = {
    levelId: 'L0', shellWallIds: ['n', 'e', 's', 'w'], entranceDoorId: 'd0', windowIds: ['win1'],
    program: { bedrooms: 3, bathrooms: 1, masterEnSuite: true, openPlanKitchenDining: true, livingRoom: true, entranceHall: true },
    constraints: { minCorridorWidth: 900, wallThickness: 200, floorToCeiling: 2700, wallTypeId: 'partition' },
    options: { count: 2, scoringWeights: { naturalLight: 1, privacy: 1, kitchenWorkflow: 1, corridorEfficiency: 1 } },
};

// ─── Canonical e2e harness (mirrors Generate3Options.test.ts) ────────────────
class CollectingQueue implements AiApprovalQueueLike {
    readonly actions: AiPendingAction[] = [];
    enqueue(action: AiPendingAction): void { this.actions.push(action); }
}
class StubCostMeter {
    preChecks: Array<{ projectId: string; estimatedCostUsd: number }> = [];
    recorded: Array<{ workflow: string; projectId: string; costUsd: number; latencyMs: number }> = [];
    // Widened return so DenyingCostMeter's deny-result is an assignable override.
    async preCheckBudget(
        projectId: string,
        estimatedCostUsd: number,
    ): Promise<{ ok: true } | { ok: false; reason: string }> {
        this.preChecks.push({ projectId, estimatedCostUsd });
        return { ok: true };
    }
    async recordCall(workflow: string, projectId: string, costUsd: number, latencyMs: number) {
        this.recorded.push({ workflow, projectId, costUsd, latencyMs });
    }
}
class DenyingCostMeter extends StubCostMeter {
    override async preCheckBudget(
        projectId: string,
        estimatedCostUsd: number,
    ): Promise<{ ok: false; reason: string }> {
        this.preChecks.push({ projectId, estimatedCostUsd });
        return { ok: false, reason: 'monthly budget exhausted' };
    }
}

function makePlane(meter: StubCostMeter = new StubCostMeter()) {
    const queue = new CollectingQueue();
    const registry = new WorkflowRegistry();
    const plane = new AiPlane({ approvalQueue: queue, costMeter: meter as never, workflowRegistry: registry });
    return { plane, queue, registry, meter };
}

const dataOf = (a: AiPendingAction) =>
    (a.preview as { data: { status: string; reason?: string; options: unknown[] } }).data;

describe('registerApartmentLayoutWorkflow (A4-register)', () => {
    it('registers the descriptor onto the live plane registry', () => {
        const { plane, registry } = makePlane();
        const id = registerApartmentLayoutWorkflow(plane, {
            shellReader: () => shell, setPendingLayouts: vi.fn(),
        });
        expect(id).toBe(APARTMENT_LAYOUT_WORKFLOW_ID);
        expect(registry.has(APARTMENT_LAYOUT_WORKFLOW_ID)).toBe(true);
        expect(registry.list()).toHaveLength(1);
    });

    it('e2e via plane.submit: default mock relay → scored options, AIStore persist, event, read-only', async () => {
        const { plane, queue, meter } = makePlane();
        const setPendingLayouts = vi.fn();
        const emit = vi.fn();
        registerApartmentLayoutWorkflow(plane, { shellReader: () => shell, setPendingLayouts, emit });

        const action = await plane.submit({
            workflow: APARTMENT_LAYOUT_WORKFLOW_ID,
            projectId: 'PRJ-A1', actorId: 'U-1', plan: 'team', input: payload,
        });

        // The shared MockAnthropicRelay served the canonical layout fixture →
        // both options survive §8 validation for the worked-example program.
        expect(action.status).toBe('pending');
        expect(dataOf(action).status).toBe('ok');
        expect(dataOf(action).options.length).toBeGreaterThanOrEqual(1);

        // Read-only Phase A: NO mutation commands on the parent action.
        expect(action.proposedCommands).toEqual([]);

        // AIStore persist + modal event, keyed by the plane-issued runId.
        expect(setPendingLayouts).toHaveBeenCalledWith(action.runId, expect.any(Array));
        expect(emit).toHaveBeenCalledWith(
            'apartment.layout-options-ready',
            expect.objectContaining({ runId: action.runId }),
        );

        // Real pipeline ran: budget pre-checked + cost recorded; one enqueue.
        expect(meter.preChecks).toHaveLength(1);
        expect(meter.recorded).toHaveLength(1);
        expect(queue.actions).toHaveLength(1);
    });

    it('honours an injected relay over the mock default', async () => {
        const { plane } = makePlane();
        const relay = new MockAnthropicRelay();
        relay.layoutFixture = [];                       // force "no options"
        const setPendingLayouts = vi.fn();
        const emit = vi.fn();
        registerApartmentLayoutWorkflow(plane, { relay, shellReader: () => shell, setPendingLayouts, emit });

        const action = await plane.submit({
            workflow: APARTMENT_LAYOUT_WORKFLOW_ID,
            projectId: 'PRJ-A2', actorId: 'U-1', plan: 'team', input: payload,
        });

        expect(dataOf(action).status).toBe('rejected');
        expect(setPendingLayouts).not.toHaveBeenCalled();
        // §REJECT-SURFACE (2026-05-31): rejection now emits `apartment.layout-
        // rejected` so the controller can surface the reason as a toast.
        // It MUST NOT emit options-ready on rejection.
        expect(emit).toHaveBeenCalledTimes(1);
        expect(emit).toHaveBeenCalledWith(
            'apartment.layout-rejected',
            expect.objectContaining({ reason: expect.any(String) }),
        );
        expect(emit).not.toHaveBeenCalledWith('apartment.layout-options-ready', expect.anything());
        expect(action.proposedCommands).toEqual([]);
    });

    it('budget gate denies pre-flight → plane rejects, impl never runs', async () => {
        const { plane, meter } = makePlane(new DenyingCostMeter());
        const setPendingLayouts = vi.fn();
        registerApartmentLayoutWorkflow(plane, { shellReader: () => shell, setPendingLayouts });

        const action = await plane.submit({
            workflow: APARTMENT_LAYOUT_WORKFLOW_ID,
            projectId: 'PRJ-A3', actorId: 'U-1', plan: 'free', input: payload,
        });

        expect(action.status).toBe('rejected');
        expect(setPendingLayouts).not.toHaveBeenCalled();
        expect(meter.recorded).toHaveLength(0);          // impl never reached recordCall
    });
});
