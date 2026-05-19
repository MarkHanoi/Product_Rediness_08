// AI host bridge tests (S54).
//
// Coverage:
//   • submit() lazy-loads the host exactly once and enqueues the
//     resulting AiPendingAction.
//   • accept(id) validates each command, calls executeBatch under the
//     `pryzm.family.ai.batchExecute` parent span with the action's id
//     as the batch id, and the proposal collapses to ONE undo entry.
//   • acceptNext() pops the head; rejectNext() drops it without
//     touching the bus.
//   • Validation failure rejects the proposal (with reason), throws
//     `AiBridgeValidationError`, and runs no commands.
//   • acceptNext() on an empty queue throws.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCommandBus, type CommandBus } from '../../src/app/commandBus.js';
import {
  clearSpanSinks,
  installSpanSink,
  type SpanRecord,
} from '../../src/app/otel.js';
import { createAiApprovalQueue, type AiApprovalQueue } from '../../src/ai/approvalQueue.js';
import { createAiToolRegistry } from '../../src/ai/toolRegistry.js';
import {
  AI_BATCH_SPAN_NAME,
  AI_BATCH_VERB,
  AiBridgeValidationError,
  createAiHostBridge,
  type AiHostBridge,
  type AiHostFacade,
} from '../../src/ai/aiHostBridge.js';
import type { AiPendingActionLike } from '../../src/ai/types.js';
import {
  registerReferencePlaneCommands,
} from '../../src/commands/referencePlane/index.js';
import {
  createReferencePlaneStore,
  type ReferencePlaneStore,
} from '../../src/stores/referencePlaneStore.js';

let bus: CommandBus;
let store: ReferencePlaneStore;
let queue: AiApprovalQueue;
let bridge: AiHostBridge;
let spans: SpanRecord[];
let uninstall: (() => void) | null;
let loadHost: ReturnType<typeof vi.fn>;
let stubProposal: AiPendingActionLike;

const Z_UP = Object.freeze({ x: 0, y: 0, z: 1 });
const Y_UP = Object.freeze({ x: 0, y: 1, z: 0 });

beforeEach(() => {
  bus = createCommandBus();
  store = createReferencePlaneStore();
  registerReferencePlaneCommands(bus, { store });
  queue = createAiApprovalQueue();

  stubProposal = Object.freeze({
    id: 'ai-1',
    prompt: 'add the front and side reference planes',
    commands: Object.freeze([
      {
        verb: 'referencePlane.add',
        args: { name: 'Front', origin: { x: 0, y: 0, z: 0 }, normal: Y_UP },
      },
      {
        verb: 'referencePlane.add',
        args: { name: 'Top', origin: { x: 0, y: 0, z: 0 }, normal: Z_UP },
      },
    ]),
  });

  const stubHost: AiHostFacade = {
    submit: vi.fn(async () => stubProposal),
  };
  loadHost = vi.fn(async () => stubHost);

  bridge = createAiHostBridge({
    commandBus: bus,
    toolRegistry: createAiToolRegistry(),
    approvalQueue: queue,
    loadHost,
  });

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

describe('aiHostBridge.submit — lazy load + enqueue', () => {
  it('lazy-loads the host on first submit and reuses it on second submit', async () => {
    expect(bridge.isHostLoaded()).toBe(false);
    await bridge.submit('first');
    expect(bridge.isHostLoaded()).toBe(true);
    expect(loadHost).toHaveBeenCalledTimes(1);

    // Second submit must NOT re-load — to do that we have to vary the
    // proposal id so the queue does not throw on duplicate.
    stubProposal = { ...stubProposal, id: 'ai-2' };
    await bridge.submit('second');
    expect(loadHost).toHaveBeenCalledTimes(1);
  });

  it('enqueues the proposal returned by the host', async () => {
    const action = await bridge.submit('hi');
    expect(action.id).toBe('ai-1');
    expect(queue.list().map((a) => a.id)).toEqual(['ai-1']);
  });
});

describe('aiHostBridge.accept — batch commit', () => {
  it('runs the proposal as one batch under pryzm.family.ai.batchExecute and collapses to ONE undo entry', async () => {
    await bridge.submit('hi');
    const result = await bridge.accept('ai-1');

    expect(result.batchId).toBe('ai-1');
    expect(result.results).toHaveLength(2);
    expect(store.get().planes.map((p) => p.name)).toEqual(['Front', 'Top']);
    expect(bus.undoDepth()).toBe(1);

    const parent = spans.find((s) => s.name === AI_BATCH_SPAN_NAME);
    expect(parent).toBeDefined();
    expect(parent!.attributes['pryzm.family.command.batch-id']).toBe('ai-1');
    expect(parent!.attributes['pryzm.family.command.batch.size']).toBe(2);
    expect(parent!.attributes['pryzm.family.command.category']).toBe('ai');
  });

  it('one undo reverts the whole batch', async () => {
    await bridge.submit('hi');
    await bridge.accept('ai-1');
    expect(store.get().planes).toHaveLength(2);
    await bus.undo();
    expect(store.get().planes).toHaveLength(0);
    expect(bus.undoDepth()).toBe(0);
  });

  it('the compound undo entry carries the AI batch verb', async () => {
    await bridge.submit('hi');
    await bridge.accept('ai-1');
    await bus.undo();
    const undoSpan = spans.find((s) => s.name === 'pryzm.family.command.undo');
    expect(undoSpan?.attributes['pryzm.family.command.undone-verb']).toBe(AI_BATCH_VERB);
    expect(undoSpan?.attributes['pryzm.family.command.category']).toBe('ai');
  });

  it('removes the proposal from the queue on accept', async () => {
    await bridge.submit('hi');
    await bridge.accept('ai-1');
    expect(queue.list()).toEqual([]);
  });

  it('throws when no queued action matches the id', async () => {
    await expect(bridge.accept('nope')).rejects.toThrow(/no queued action with id "nope"/);
  });
});

describe('aiHostBridge.acceptNext / rejectNext', () => {
  it('acceptNext pops the head', async () => {
    await bridge.submit('a');
    stubProposal = { ...stubProposal, id: 'ai-2' };
    await bridge.submit('b');
    expect(queue.list().map((x) => x.id)).toEqual(['ai-1', 'ai-2']);
    await bridge.acceptNext();
    expect(queue.list().map((x) => x.id)).toEqual(['ai-2']);
  });

  it('rejectNext drops the head and runs no commands', async () => {
    await bridge.submit('a');
    bridge.rejectNext('user dismissed');
    expect(queue.list()).toEqual([]);
    expect(store.get().planes).toEqual([]);
    expect(bus.undoDepth()).toBe(0);
  });

  it('rejectNext on an empty queue returns undefined', () => {
    expect(bridge.rejectNext()).toBeUndefined();
  });

  it('acceptNext on an empty queue throws', async () => {
    await expect(bridge.acceptNext()).rejects.toThrow(/queue is empty/);
  });
});

describe('aiHostBridge.accept — validation failure', () => {
  it('rejects the proposal, throws AiBridgeValidationError, leaves bus untouched', async () => {
    stubProposal = Object.freeze({
      id: 'ai-bad',
      prompt: 'broken',
      commands: Object.freeze([
        {
          verb: 'referencePlane.add',
          args: { name: '', origin: { x: 0, y: 0, z: 0 }, normal: Z_UP },
        },
        { verb: 'solid.add', args: { name: 'Body', kind: 'morph' } },
      ]),
    });
    await bridge.submit('broken');

    await expect(bridge.accept('ai-bad')).rejects.toBeInstanceOf(AiBridgeValidationError);

    expect(queue.list()).toEqual([]);          // entry was rejected
    expect(store.get().planes).toEqual([]);    // no commands ran
    expect(bus.undoDepth()).toBe(0);
    // No AI batch span emitted — validation short-circuited before commit.
    expect(spans.find((s) => s.name === AI_BATCH_SPAN_NAME)).toBeUndefined();
  });
});
