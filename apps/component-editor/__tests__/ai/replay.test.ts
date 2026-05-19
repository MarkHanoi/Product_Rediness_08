// AI replay corpus test (S54).
//
// For every fixture in `replay.fixtures.ts`:
//   1. Build a fresh editor runtime — command bus + every store +
//      every command handler + the AI tool registry + the approval
//      queue + the host bridge with a stub `loadHost` that returns the
//      fixture's commands.
//   2. `bridge.submit(prompt)` — enqueues the proposal.
//   3. `bridge.acceptNext()` — commits the batch.
//   4. Assert: undo depth = 1, parent span = `pryzm.family.ai.batchExecute`
//      with the fixture's command count, and store state matches the
//      fixture's `expect` block.
//   5. `commandBus.undo()` — proves the WHOLE batch reverts as one
//      compound undo entry per ADR-014.
//
// Tests every replay end-to-end with the SAME bridge + bus + stores
// the production app uses.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createCommandBus,
  type CommandBus,
} from '../../src/app/commandBus.js';
import {
  clearSpanSinks,
  installSpanSink,
  type SpanRecord,
} from '../../src/app/otel.js';
import { createAiApprovalQueue } from '../../src/ai/approvalQueue.js';
import { createAiToolRegistry } from '../../src/ai/toolRegistry.js';
import {
  AI_BATCH_SPAN_NAME,
  createAiHostBridge,
  type AiHostBridge,
  type AiHostFacade,
} from '../../src/ai/aiHostBridge.js';
import { registerConstraintCommands } from '../../src/commands/constraint/index.js';
import { registerReferencePlaneCommands } from '../../src/commands/referencePlane/index.js';
import { registerSolidCommands } from '../../src/commands/solid/index.js';
import { createConstraintStore, type ConstraintStore } from '../../src/stores/constraintStore.js';
import {
  createReferencePlaneStore,
  type ReferencePlaneStore,
} from '../../src/stores/referencePlaneStore.js';
import { createSolidStore, type SolidStore } from '../../src/stores/solidStore.js';
import { REPLAY_FIXTURES, type ReplayFixture } from './replay.fixtures.js';

interface Runtime {
  bus: CommandBus;
  bridge: AiHostBridge;
  refStore: ReferencePlaneStore;
  constraintStore: ConstraintStore;
  solidStore: SolidStore;
}

function buildRuntime(fixture: ReplayFixture): Runtime {
  const bus = createCommandBus();
  const refStore = createReferencePlaneStore();
  const constraintStore = createConstraintStore();
  const solidStore = createSolidStore();

  registerConstraintCommands(bus, { constraintStore });
  registerReferencePlaneCommands(bus, { store: refStore });
  registerSolidCommands(bus, { store: solidStore });

  const queue = createAiApprovalQueue();
  const stubHost: AiHostFacade = {
    submit: async () => Object.freeze({
      id: fixture.id,
      prompt: fixture.prompt,
      commands: fixture.commands,
    }),
  };

  const bridge = createAiHostBridge({
    commandBus: bus,
    toolRegistry: createAiToolRegistry(),
    approvalQueue: queue,
    loadHost: async () => stubHost,
  });

  return { bus, bridge, refStore, constraintStore, solidStore };
}

let spans: SpanRecord[];
let uninstall: (() => void) | null;

beforeEach(() => {
  spans = [];
  uninstall = installSpanSink((r) => {
    spans.push(r);
  });
});

afterEach(() => {
  uninstall?.();
  uninstall = null;
  clearSpanSinks();
});

describe('AI replay corpus (S54) — 10 prompts', () => {
  it('contains exactly 10 fixtures', () => {
    expect(REPLAY_FIXTURES).toHaveLength(10);
  });

  it('every fixture id is unique', () => {
    const ids = new Set(REPLAY_FIXTURES.map((f) => f.id));
    expect(ids.size).toBe(REPLAY_FIXTURES.length);
  });

  it.each(REPLAY_FIXTURES.map((f) => [f.id, f] as const))(
    '%s — submit → acceptNext → assert → undo',
    async (_id, fx) => {
      const rt = buildRuntime(fx);

      // 1. Submit (lazy-loads + enqueues).
      const action = await rt.bridge.submit(fx.prompt);
      expect(action.id).toBe(fx.id);

      // 2. Accept (commits the batch).
      const result = await rt.bridge.acceptNext();
      expect(result.batchId).toBe(fx.id);
      expect(result.results).toHaveLength(fx.commands.length);

      // 3. Undo depth.
      expect(rt.bus.undoDepth()).toBe(fx.expect.undoDepthAfter);

      // 4. Parent span.
      const parent = spans.find((s) => s.name === fx.expect.spanName);
      expect(parent, `parent span ${fx.expect.spanName} not emitted`).toBeDefined();
      expect(parent!.attributes['pryzm.family.command.batch-id']).toBe(fx.id);
      expect(parent!.attributes['pryzm.family.command.batch.size']).toBe(fx.commands.length);

      // 4a. Per-verb child spans.
      const childSpans = spans.filter(
        (s) =>
          s.name.startsWith('pryzm.family.command.') &&
          s.attributes['pryzm.family.command.batch-id'] === fx.id &&
          s.name !== AI_BATCH_SPAN_NAME,
      );
      expect(childSpans).toHaveLength(fx.commands.length);
      expect(childSpans.map((s) => s.name)).toEqual(
        fx.commands.map((c) => `pryzm.family.command.${c.verb}`),
      );

      // 5. Store-state assertions.
      if (fx.expect.finalReferencePlaneCount !== undefined) {
        expect(rt.refStore.get().planes).toHaveLength(fx.expect.finalReferencePlaneCount);
      }
      if (fx.expect.finalReferencePlaneNames) {
        expect(rt.refStore.get().planes.map((p) => p.name)).toEqual(
          fx.expect.finalReferencePlaneNames,
        );
      }
      if (fx.expect.finalSolidNames) {
        const names = rt.solidStore.get().solids.map((s) => s.name);
        expect(names).toEqual(fx.expect.finalSolidNames);
      }
      if (fx.expect.finalConstraintCount !== undefined) {
        expect(rt.constraintStore.get().constraints).toHaveLength(
          fx.expect.finalConstraintCount,
        );
      }
      if (fx.expect.finalConstraintKindCounts) {
        const actual: Record<string, number> = {};
        for (const c of rt.constraintStore.get().constraints) {
          actual[c.kind] = (actual[c.kind] ?? 0) + 1;
        }
        expect(actual).toEqual(fx.expect.finalConstraintKindCounts);
      }

      // 6. Undo round-trip — the WHOLE batch must collapse to one entry.
      const undone = await rt.bus.undo();
      expect(undone).toBe(true);
      expect(rt.bus.undoDepth()).toBe(0);
      expect(rt.refStore.get().planes).toEqual([]);
      expect(rt.constraintStore.get().constraints).toEqual([]);
      expect(rt.solidStore.get().solids).toEqual([]);
    },
  );
});
