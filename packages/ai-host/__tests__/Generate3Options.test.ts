// @pryzm/ai-host — Generate3Options workflow tests (S52 D1).
//
// Spec source:
//   • `phases/PHASE-3A-Q1-M25-M27-AI-VISIBILITY-COMPLETE.md` §S52
//     lines 422-462 — generative fan-out workflow with refund-on-overshoot.
//   • SPEC-28 §3 — per-call ceiling $0.18.
//
// e2e smoke pattern: register the workflow with a fresh `AiPlane`,
// submit a fixture region, assert per-option enqueue + parent action
// shape end-to-end. Refund path covered against a stub cost meter.

import { describe, expect, it } from 'vitest';
import { AiPlane } from '../src/AiPlane.js';
import { WorkflowRegistry } from '../src/WorkflowRegistry.js';
import {
  buildOptionPrompt,
  createGenerate3OptionsImpl,
  generate3OptionsDescriptor,
  GENERATE_3_OPTIONS_MODEL,
  parseOption,
  parseOptionCommands,
  type CostMeterRefundLike,
  type Generate3OptionsInput,
} from '../src/workflows/Generate3Options.js';
import {
  GENERATE_3_OPTIONS_COST_USD_ESTIMATE,
  GENERATE_3_OPTIONS_HARD_CEILING_USD,
  OPTION_STYLES,
  type Generate3Result,
  type OptionStyle,
  type PlanRegion,
} from '../src/workflows/Generate3OptionsTypes.js';
import type { RelayPorter, RelayRequest, RelayResponse } from '../src/AnthropicRelay.js';
import type { AiApprovalQueueLike, AiPendingAction } from '../src/types.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────

function makeRegion(): PlanRegion {
  return {
    id: 'plan-1/sel-7',
    bounds: [0, 0, 5000, 4000],
    intent: 'kitchen',
    visibleElementIds: ['wall-a', 'wall-b'],
  };
}

class CollectingQueue implements AiApprovalQueueLike {
  readonly actions: AiPendingAction[] = [];
  enqueue(action: AiPendingAction): void { this.actions.push(action); }
}

class StubRefundMeter implements CostMeterRefundLike {
  refunded: Array<{ projectId: string; costUsd: number }> = [];
  async refund(projectId: string, costUsd: number): Promise<number> {
    this.refunded.push({ projectId, costUsd });
    return costUsd;
  }
}

class StubCostMeter {
  preChecks: Array<{ projectId: string; estimatedCostUsd: number }> = [];
  recorded: Array<{ workflow: string; projectId: string; costUsd: number; latencyMs: number }> = [];
  refunded: Array<{ projectId: string; costUsd: number }> = [];
  async preCheckBudget(projectId: string, estimatedCostUsd: number) {
    this.preChecks.push({ projectId, estimatedCostUsd });
    return { ok: true as const };
  }
  async recordCall(workflow: string, projectId: string, costUsd: number, latencyMs: number) {
    this.recorded.push({ workflow, projectId, costUsd, latencyMs });
  }
  async refund(projectId: string, costUsd: number): Promise<number> {
    this.refunded.push({ projectId, costUsd });
    return costUsd;
  }
}

class FixtureRelay implements RelayPorter {
  /** Per-call cost in USD, indexed by call sequence. */
  costsByCall: number[] = [0.05, 0.05, 0.05];
  /** Per-call response payload, indexed by call sequence. */
  payloadsByCall: unknown[] = [
    { summary: 'Minimal — 1 island, no upper cabinets.', commands: [{ command: 'add-element', payload: { kind: 'island' } }] },
    { summary: 'Efficient — galley with 4 base cabinets.', commands: [{ command: 'add-element', payload: { kind: 'galley' } }, { command: 'add-element', payload: { kind: 'cabinet' } }] },
    { summary: 'Generous — full L-shape + walk-in pantry.', commands: [{ command: 'add-element', payload: { kind: 'pantry' } }] },
  ];
  callCount = 0;
  /** Optional per-style override that ignores the round-robin. */
  perStyle?: Partial<Record<OptionStyle, { text: string; costUsd: number }>>;
  async complete(req: RelayRequest): Promise<RelayResponse> {
    const i = this.callCount++;
    if (this.perStyle) {
      const style = (() => {
        try { return JSON.parse(req.user).requestedStyle as OptionStyle; } catch { return undefined; }
      })();
      if (style && this.perStyle[style]) {
        const s = this.perStyle[style]!;
        return { text: s.text, costUsd: s.costUsd, model: req.model, tokens: { input: 100, output: 50 } };
      }
    }
    const cost = this.costsByCall[i] ?? 0.05;
    const payload = this.payloadsByCall[i] ?? { summary: 'fallback', commands: [] };
    return { text: JSON.stringify(payload), costUsd: cost, model: req.model, tokens: { input: 100, output: 50 } };
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────

describe('@pryzm/ai-host — Generate3Options (S52)', () => {

  describe('descriptor', () => {
    it('registers cleanly with WorkflowRegistry (no $0.18 ceiling violation)', () => {
      const reg = new WorkflowRegistry();
      reg.register(generate3OptionsDescriptor, async () => ({ proposedCommands: [] }));
      expect(reg.has('generate-3-options')).toBe(true);
      expect(reg.list()).toHaveLength(1);
    });
    it('has a $0.15 cost estimate (three $0.05 fan-out calls + headroom)', () => {
      expect(generate3OptionsDescriptor.estimatedCostUsd).toBe(GENERATE_3_OPTIONS_COST_USD_ESTIMATE);
      expect(generate3OptionsDescriptor.estimatedCostUsd).toBeLessThan(GENERATE_3_OPTIONS_HARD_CEILING_USD);
    });
    it("uses kind='generative' so it CAN mutate state on approval (vs PlanCritique's 'rules' kind)", () => {
      expect(generate3OptionsDescriptor.kind).toBe('generative');
    });
  });

  describe('OPTION_STYLES', () => {
    it('enumerates exactly three labelled styles in display order', () => {
      expect(OPTION_STYLES).toEqual(['minimal', 'efficient', 'generous']);
    });
  });

  describe('buildOptionPrompt', () => {
    it('encodes the region + style hint into JSON', () => {
      const p = buildOptionPrompt(makeRegion(), 'efficient');
      const parsed = JSON.parse(p);
      expect(parsed.regionIntent).toBe('kitchen');
      expect(parsed.requestedStyle).toBe('efficient');
      expect(parsed.regionBoundsMm).toEqual({ minX: 0, minY: 0, maxX: 5000, maxY: 4000 });
      expect(parsed.visibleElementIds).toEqual(['wall-a', 'wall-b']);
    });
    it('produces parseable JSON for every OPTION_STYLE', () => {
      for (const s of OPTION_STYLES) {
        const p = buildOptionPrompt(makeRegion(), s);
        expect(() => JSON.parse(p)).not.toThrow();
      }
    });
  });

  describe('parseOptionCommands', () => {
    it('drops malformed entries silently (loud-fail-soft)', () => {
      const out = parseOptionCommands([
        { command: 'add-wall', payload: { x: 0 } },
        null,
        { payload: { x: 1 } },                  // missing command
        { command: '', payload: {} },           // empty command
        { command: 'add-door', payload: null },
      ]);
      expect(out).toHaveLength(2);
      expect(out[0]!.command).toBe('add-wall');
      expect(out[1]!.command).toBe('add-door');
    });
    it('caps the array at 20 entries (matches the system-prompt cap)', () => {
      const big = Array.from({ length: 50 }, (_, i) => ({ command: `cmd-${i}`, payload: {} }));
      expect(parseOptionCommands(big)).toHaveLength(20);
    });
    it('returns [] for non-array input', () => {
      expect(parseOptionCommands(null)).toEqual([]);
      expect(parseOptionCommands('x')).toEqual([]);
      expect(parseOptionCommands({})).toEqual([]);
    });
  });

  describe('parseOption', () => {
    it('returns null for non-JSON text', () => {
      expect(parseOption('not json', 'minimal', 0.05)).toBeNull();
    });
    it('returns an option with empty commands when JSON is valid but commands missing', () => {
      const opt = parseOption(JSON.stringify({ summary: 'hi' }), 'minimal', 0.05);
      expect(opt).not.toBeNull();
      expect(opt!.proposedCommands).toEqual([]);
      expect(opt!.summary).toBe('hi');
    });
  });

  // ─── e2e through AiPlane ────────────────────────────────────────────────

  describe('e2e through AiPlane', () => {
    it('happy path: enqueues 3 separate per-option actions + 1 parent action; parent has zero commands', async () => {
      const queue = new CollectingQueue();
      const meter = new StubCostMeter();
      const relay = new FixtureRelay();
      const registry = new WorkflowRegistry();
      const impl = createGenerate3OptionsImpl({
        relay,
        approvalQueue: queue,
        costMeter: meter,
      });
      registry.register(generate3OptionsDescriptor, impl);
      const plane = new AiPlane({ approvalQueue: queue, costMeter: meter, workflowRegistry: registry });
      const input: Generate3OptionsInput = { region: makeRegion() };
      const action = await plane.submit({
        workflow: 'generate-3-options',
        projectId: 'PRJ-G1',
        actorId: 'U-1',
        input,
        plan: 'team',
      });
      // 3 per-option actions + 1 parent = 4 total enqueued. The parent
      // is the LAST one (plane enqueues after impl returns).
      expect(queue.actions).toHaveLength(4);
      const optActions = queue.actions.slice(0, 3);
      for (const a of optActions) {
        expect(a.workflow).toBe('generative');
        expect(a.preview?.kind).toBe('image');
        expect(a.proposedCommands.length).toBeGreaterThanOrEqual(1);
      }
      // Parent action: zero commands; preview is the JSON summary.
      expect(action.proposedCommands).toEqual([]);
      const preview = action.preview as { kind: 'json'; data: Generate3Result };
      expect(preview.kind).toBe('json');
      expect(preview.data.status).toBe('ok');
      if (preview.data.status === 'ok') {
        expect(preview.data.options).toHaveLength(3);
        expect(preview.data.totalCostUsd).toBeCloseTo(0.15, 6);
      }
    });

    it('overshoot path: total cost > $0.18 → refund called, parent action rejected, no per-option actions', async () => {
      const queue = new CollectingQueue();
      const meter = new StubCostMeter();
      const relay = new FixtureRelay();
      // Each call returns $0.07 → total $0.21 > $0.18 ceiling.
      relay.costsByCall = [0.07, 0.07, 0.07];
      const registry = new WorkflowRegistry();
      const impl = createGenerate3OptionsImpl({
        relay,
        approvalQueue: queue,
        costMeter: meter,
      });
      registry.register(generate3OptionsDescriptor, impl);
      const plane = new AiPlane({ approvalQueue: queue, costMeter: meter, workflowRegistry: registry });
      const action = await plane.submit({
        workflow: 'generate-3-options',
        projectId: 'PRJ-G2',
        actorId: 'U-1',
        input: { region: makeRegion() },
        plan: 'team',
      });
      // Refund called with the actual fan-out cost.
      expect(meter.refunded).toHaveLength(1);
      expect(meter.refunded[0]!.projectId).toBe('PRJ-G2');
      expect(meter.refunded[0]!.costUsd).toBeCloseTo(0.21, 6);
      // Parent action: rejected preview, zero commands, zero per-option actions enqueued.
      const preview = action.preview as { kind: 'json'; data: Generate3Result };
      expect(preview.data.status).toBe('rejected');
      if (preview.data.status === 'rejected') {
        expect(preview.data.reason).toMatch(/exceeded per-call ceiling/i);
        expect(preview.data.refundedUsd).toBeCloseTo(0.21, 6);
      }
      expect(queue.actions).toHaveLength(1); // only the parent
      expect(action.proposedCommands).toEqual([]);
    });

    it('missing input: region absent → rejected, no relay call, no refund', async () => {
      const queue = new CollectingQueue();
      const meter = new StubCostMeter();
      const relay = new FixtureRelay();
      const registry = new WorkflowRegistry();
      const impl = createGenerate3OptionsImpl({
        relay,
        approvalQueue: queue,
        costMeter: meter,
      });
      registry.register(generate3OptionsDescriptor, impl);
      const plane = new AiPlane({ approvalQueue: queue, costMeter: meter, workflowRegistry: registry });
      const action = await plane.submit({
        workflow: 'generate-3-options',
        projectId: 'PRJ-G3',
        actorId: 'U-1',
        plan: 'team',
      });
      expect(relay.callCount).toBe(0);
      expect(meter.refunded).toHaveLength(0);
      const preview = action.preview as { kind: 'json'; data: Generate3Result };
      expect(preview.data.status).toBe('rejected');
      expect(queue.actions).toHaveLength(1); // only the parent
    });

    it('per-option action carries a preview URL from the renderPreview hook', async () => {
      const queue = new CollectingQueue();
      const meter = new StubRefundMeter();
      const relay = new FixtureRelay();
      const seen: string[] = [];
      const impl = createGenerate3OptionsImpl({
        relay,
        approvalQueue: queue,
        costMeter: meter,
        renderPreview: (option, _region) => {
          const url = `https://thumb.example/${option.style}.png`;
          seen.push(url);
          return url;
        },
      });
      const ctx = {
        runId: 'run-x',
        projectId: 'PRJ-G4',
        actorId: 'U-1',
        plan: 'team' as const,
        input: { region: makeRegion() },
        bus: null,
        now: () => 1700000000000,
      };
      await impl(ctx);
      expect(queue.actions).toHaveLength(3);
      for (const a of queue.actions) {
        expect(a.preview?.kind).toBe('image');
        if (a.preview?.kind === 'image') {
          expect(a.preview.url).toMatch(/^https:\/\/thumb\.example\//);
        }
      }
      expect(seen).toHaveLength(3);
    });

    it('uses GENERATE_3_OPTIONS_MODEL by default but accepts an override', async () => {
      const queue = new CollectingQueue();
      const meter = new StubRefundMeter();
      const relay = new FixtureRelay();
      const seenModels: string[] = [];
      const wrappedRelay: RelayPorter = {
        complete: async (req) => { seenModels.push(req.model); return relay.complete(req); },
      };
      const impl = createGenerate3OptionsImpl({
        relay: wrappedRelay,
        approvalQueue: queue,
        costMeter: meter,
        model: 'claude-sonnet-test',
      });
      await impl({
        runId: 'run-y',
        projectId: 'PRJ-G5',
        actorId: 'U-1',
        plan: 'team' as const,
        input: { region: makeRegion() },
        bus: null,
        now: () => 1700000000000,
      });
      expect(seenModels).toHaveLength(3);
      expect(seenModels.every((m) => m === 'claude-sonnet-test')).toBe(true);
    });
  });

  describe('default model id', () => {
    it('targets Haiku 4.5 (matches the live server log)', () => {
      expect(GENERATE_3_OPTIONS_MODEL).toBe('claude-haiku-4-5-20251014');
    });
  });
});
