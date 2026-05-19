// @pryzm/ai-host — PlanCritique workflow tests (S51 D7).
//
// Spec source:
//   • `phases/PHASE-3A-Q1-M25-M27-AI-VISIBILITY-COMPLETE.md` §S51
//     lines 322-403 — exit criteria require:
//       • workflow registered + discoverable in command palette
//       • per-call cost ≤ $0.06 measured
//       • critique items surface in approval queue
//   • SPEC-28 §3 — per-call ceiling $0.18.
//   • [strategic ADR-014] — diagnostic workflows do NOT mutate state
//     (zero-command per spec line 379).
//
// e2e smoke pattern: register the workflow with a fresh `AiPlane`,
// submit a fixture snapshot, assert the per-item enqueue + the
// parent action shape end-to-end through the plane.

import { describe, expect, it } from 'vitest';
import { AiPlane } from '../src/AiPlane.js';
import { WorkflowRegistry } from '../src/WorkflowRegistry.js';
import {
  DEFAULT_CRITIQUE_FIXTURE,
  MockAnthropicRelay,
} from '../src/AnthropicRelay.js';
import {
  buildCritiquePrompt,
  createPlanCritiqueImpl,
  parseCritiqueItems,
  PLAN_CRITIQUE_SYSTEM_PROMPT,
  planCritiqueDescriptor,
} from '../src/workflows/PlanCritique.js';
import {
  PLAN_CRITIQUE_COST_USD_ESTIMATE,
  PLAN_CRITIQUE_MAX_ITEMS,
  type CritiqueItem,
  type PlanViewSnapshot,
  type VisibilityState,
} from '../src/workflows/PlanCritiqueTypes.js';
import type {
  AiApprovalQueueLike,
  AiPendingAction,
} from '../src/types.js';

// ─── Test fixtures ────────────────────────────────────────────────────────

function makeSnapshot(): PlanViewSnapshot {
  return {
    viewId: 'view-plan-1',
    viewportBounds: [0, 0, 12000, 8000],
    pixelSize: { width: 1600, height: 1067 },
    elements: [
      { id: 'wall-a', kind: 'wall', bbox: [0, 0, 8000, 200], label: 'Exterior North' },
      { id: 'door-a12', kind: 'door', bbox: [3500, 200, 4400, 300], attrs: { swingDirection: 'in' } },
      { id: 'shelf-1', kind: 'fixture', bbox: [4200, 350, 5000, 700] },
    ],
    capturedAt: 1700000000000,
  };
}

function makeVisibility(): VisibilityState {
  return {
    intent: 'review',
    tags: { wall: true, door: true, fixture: true, shelf: true },
  };
}

class CollectingQueue implements AiApprovalQueueLike {
  readonly actions: AiPendingAction[] = [];
  enqueue(action: AiPendingAction): void {
    this.actions.push(action);
  }
}

class StubCostMeter {
  preChecks: Array<{ projectId: string; estimatedCostUsd: number }> = [];
  recorded: Array<{ workflow: string; projectId: string; costUsd: number; latencyMs: number; extras?: Record<string, unknown> }> = [];
  rejectReason: string | null = null;
  async preCheckBudget(projectId: string, estimatedCostUsd: number) {
    this.preChecks.push({ projectId, estimatedCostUsd });
    if (this.rejectReason) return { ok: false as const, reason: this.rejectReason };
    return { ok: true as const };
  }
  async recordCall(workflow: string, projectId: string, costUsd: number, latencyMs: number, extras?: Record<string, unknown>) {
    const entry: { workflow: string; projectId: string; costUsd: number; latencyMs: number; extras?: Record<string, unknown> } = {
      workflow, projectId, costUsd, latencyMs,
    };
    if (extras) entry.extras = extras;
    this.recorded.push(entry);
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────

describe('@pryzm/ai-host — PlanCritique (S51)', () => {

  describe('descriptor', () => {
    it('registers cleanly with WorkflowRegistry (no $0.18 ceiling violation)', () => {
      const reg = new WorkflowRegistry();
      reg.register(planCritiqueDescriptor, async () => ({ proposedCommands: [] }));
      expect(reg.has('plan-critique')).toBe(true);
      expect(reg.list()).toHaveLength(1);
    });
    it('has a $0.05 cost estimate (per phase doc line 343)', () => {
      expect(planCritiqueDescriptor.estimatedCostUsd).toBe(PLAN_CRITIQUE_COST_USD_ESTIMATE);
      expect(planCritiqueDescriptor.estimatedCostUsd).toBeLessThanOrEqual(0.06);
    });
    it("uses kind='rules' so it shares the diagnostic-only contract", () => {
      expect(planCritiqueDescriptor.kind).toBe('rules');
    });
  });

  describe('buildCritiquePrompt', () => {
    it('serialises every visible element + visibility state', () => {
      const prompt = buildCritiquePrompt(makeSnapshot(), makeVisibility());
      expect(prompt).toContain('door-a12');
      expect(prompt).toContain('wall-a');
      expect(prompt).toContain('"intent":"review"');
      expect(prompt).toContain('"swingDirection":"in"');
    });
    it('produces parseable JSON', () => {
      const prompt = buildCritiquePrompt(makeSnapshot(), makeVisibility());
      const parsed = JSON.parse(prompt);
      expect(parsed.viewId).toBe('view-plan-1');
      expect(parsed.elements).toHaveLength(3);
      expect(parsed.visibility.intent).toBe('review');
    });
    it('omits absent optional fields (centroid/label/attrs)', () => {
      const snapshot = makeSnapshot();
      const prompt = buildCritiquePrompt(snapshot, makeVisibility());
      // shelf-1 has no label/attrs; ensure those keys aren't injected.
      const parsed = JSON.parse(prompt);
      const shelf = parsed.elements.find((e: { id: string }) => e.id === 'shelf-1')!;
      expect(shelf.label).toBeUndefined();
      expect(shelf.attrs).toBeUndefined();
    });
  });

  describe('parseCritiqueItems', () => {
    it('returns [] on non-string input', () => {
      // Cast through unknown to feed the guard with a non-string.
      expect(parseCritiqueItems(null as unknown as string)).toEqual([]);
      expect(parseCritiqueItems('')).toEqual([]);
    });
    it('returns [] on malformed JSON (loud-fail-soft per SPEC-28 §10)', () => {
      const items = parseCritiqueItems('{not json}');
      expect(items).toEqual([]);
    });
    it('returns [] when the JSON is not an array', () => {
      expect(parseCritiqueItems('{"foo": 1}')).toEqual([]);
    });
    it('returns N items on a valid response', () => {
      const items = parseCritiqueItems(JSON.stringify(DEFAULT_CRITIQUE_FIXTURE));
      expect(items).toHaveLength(3);
      expect(items[0]!.id).toBe('crit-1');
      expect(items[0]!.severity).toBe('warning');
      expect(items[1]!.locationRef).toEqual({ kind: 'point', x: 1820, y: 4500 });
    });
    it('drops malformed items but keeps valid siblings', () => {
      const mixed = [
        { /* missing id */ severity: 'warning', category: 'x', message: 'm', locationRef: { kind: 'element', elementId: 'a' }, confidence: 0.5 },
        { id: 'ok-1', severity: 'info', category: 'door-clearance', message: 'msg', locationRef: { kind: 'element', elementId: 'door-a' }, confidence: 0.7 },
        { id: 'bad-loc', severity: 'info', category: 'x', message: 'm', locationRef: { kind: 'invalid' }, confidence: 0.5 },
      ];
      const items = parseCritiqueItems(JSON.stringify(mixed));
      expect(items).toHaveLength(1);
      expect(items[0]!.id).toBe('ok-1');
    });
    it(`caps at PLAN_CRITIQUE_MAX_ITEMS (${PLAN_CRITIQUE_MAX_ITEMS}) even when the model emits more`, () => {
      const overlong: CritiqueItem[] = Array.from({ length: 30 }, (_, i) => ({
        id: `crit-${i}`,
        severity: 'info',
        category: 'visibility',
        message: 'over the cap',
        locationRef: { kind: 'point', x: i, y: i },
        confidence: 0.5,
      }));
      const items = parseCritiqueItems(JSON.stringify(overlong));
      expect(items).toHaveLength(PLAN_CRITIQUE_MAX_ITEMS);
    });
    it('rejects confidence outside [0, 1]', () => {
      const bad = [{ id: 'b', severity: 'info', category: 'x', message: 'm', locationRef: { kind: 'element', elementId: 'a' }, confidence: 1.5 }];
      expect(parseCritiqueItems(JSON.stringify(bad))).toEqual([]);
    });
  });

  describe('MockAnthropicRelay', () => {
    it('returns the default critique fixture for plan-critique requests', async () => {
      const relay = new MockAnthropicRelay();
      const resp = await relay.complete({
        model: 'claude-haiku-4-5-20251014',
        system: PLAN_CRITIQUE_SYSTEM_PROMPT,
        user: buildCritiquePrompt(makeSnapshot(), makeVisibility()),
      });
      expect(resp.costUsd).toBeGreaterThan(0);
      expect(resp.costUsd).toBeLessThan(0.06);
      const items = parseCritiqueItems(resp.text);
      expect(items).toHaveLength(3);
    });
    it('returns [] for non-critique prompts', async () => {
      const relay = new MockAnthropicRelay();
      const resp = await relay.complete({
        model: 'claude-haiku-4-5-20251014',
        system: 'sys',
        user: 'unrelated query about the weather',
      });
      expect(parseCritiqueItems(resp.text)).toEqual([]);
    });
  });

  describe('end-to-end via AiPlane', () => {
    it('registers, submits, parses, and enqueues 1 parent + 3 per-item actions', async () => {
      const queue = new CollectingQueue();
      const meter = new StubCostMeter();
      const plane = new AiPlane({ approvalQueue: queue, costMeter: meter });

      const relay = new MockAnthropicRelay();
      plane.registerWorkflow(
        planCritiqueDescriptor,
        createPlanCritiqueImpl({ relay, approvalQueue: queue }),
      );

      const action = await plane.submit({
        workflow: 'plan-critique',
        projectId: 'P-1',
        actorId: 'U-1',
        input: { snapshot: makeSnapshot(), visibility: makeVisibility() },
      });

      // 3 per-item actions enqueued first, then the parent (the
      // plane enqueues last, after the impl returns).
      expect(queue.actions).toHaveLength(4);
      const perItem = queue.actions.slice(0, 3);
      const parent = queue.actions[3]!;

      // Per-item actions: zero-command, json preview, status pending.
      for (const a of perItem) {
        expect(a.proposedCommands).toHaveLength(0);
        expect(a.estimatedCostUsd).toBe(0);
        expect(a.status).toBe('pending');
        expect(a.preview?.kind).toBe('json');
        expect(a.workflow).toBe('rules');
        expect(a.id).toMatch(/-item-/);
      }

      // Parent: zero-command, summary preview, status pending.
      expect(parent).toBe(action);
      expect(action.proposedCommands).toHaveLength(0);
      expect(action.status).toBe('pending');
      expect(action.preview?.kind).toBe('json');
      const summary = (action.preview as { kind: 'json'; data: { status: string; itemCount: number } }).data;
      expect(summary.status).toBe('ok');
      expect(summary.itemCount).toBe(3);

      // Cost was pre-checked + recorded under the descriptor's $0.05 estimate.
      expect(meter.preChecks).toHaveLength(1);
      expect(meter.preChecks[0]!.estimatedCostUsd).toBe(PLAN_CRITIQUE_COST_USD_ESTIMATE);
      expect(meter.recorded).toHaveLength(1);
      expect(meter.recorded[0]!.workflow).toBe('plan-critique');
      expect(meter.recorded[0]!.costUsd).toBeLessThan(0.06);
      expect(meter.recorded[0]!.extras?.surface).toBe('ai.plan.critique');
    });

    it('respects budget rejection: no per-item actions, parent is rejected', async () => {
      const queue = new CollectingQueue();
      const meter = new StubCostMeter();
      meter.rejectReason = 'Per-call ceiling exceeded';
      const plane = new AiPlane({ approvalQueue: queue, costMeter: meter });

      const relay = new MockAnthropicRelay();
      plane.registerWorkflow(
        planCritiqueDescriptor,
        createPlanCritiqueImpl({ relay, approvalQueue: queue }),
      );

      const action = await plane.submit({
        workflow: 'plan-critique',
        projectId: 'P-1',
        actorId: 'U-1',
        input: { snapshot: makeSnapshot(), visibility: makeVisibility() },
      });

      expect(action.status).toBe('rejected');
      expect(queue.actions).toHaveLength(1);
      expect(meter.recorded).toHaveLength(0);
    });

    it('handles missing input gracefully (returns rejected summary, enqueues 0 items)', async () => {
      const queue = new CollectingQueue();
      const meter = new StubCostMeter();
      const plane = new AiPlane({ approvalQueue: queue, costMeter: meter });

      const relay = new MockAnthropicRelay();
      plane.registerWorkflow(
        planCritiqueDescriptor,
        createPlanCritiqueImpl({ relay, approvalQueue: queue }),
      );

      const action = await plane.submit({
        workflow: 'plan-critique',
        projectId: 'P-1',
        actorId: 'U-1',
        input: undefined,
      });

      // Plane enqueues the parent action (status pending — the impl
      // didn't throw, it returned a 'rejected' summary in the preview).
      expect(queue.actions).toHaveLength(1);
      expect(action.status).toBe('pending');
      const data = (action.preview as { kind: 'json'; data: { status: string } }).data;
      expect(data.status).toBe('rejected');
      // No per-item actions — the impl skipped enqueueing on missing input.
      expect(queue.actions.filter((a) => a.id.includes('-item-'))).toHaveLength(0);
    });

    it('per-item enqueue hook fires once per critique item', async () => {
      const queue = new CollectingQueue();
      const meter = new StubCostMeter();
      const plane = new AiPlane({ approvalQueue: queue, costMeter: meter });

      const relay = new MockAnthropicRelay();
      const seen: { actionId: string; itemId: string }[] = [];
      plane.registerWorkflow(
        planCritiqueDescriptor,
        createPlanCritiqueImpl({
          relay,
          approvalQueue: queue,
          onItemEnqueued: (action, item) => seen.push({ actionId: action.id, itemId: item.id }),
        }),
      );

      await plane.submit({
        workflow: 'plan-critique',
        projectId: 'P-1',
        actorId: 'U-1',
        input: { snapshot: makeSnapshot(), visibility: makeVisibility() },
      });

      expect(seen).toHaveLength(3);
      expect(seen.map((s) => s.itemId)).toEqual(['crit-1', 'crit-2', 'crit-3']);
    });
  });
});
