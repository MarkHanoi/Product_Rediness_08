// commandBus.executeBatch — ADR-014 batch-undo (S54).
//
// Coverage:
//   • Successful batch collapses to ONE entry on the undo stack and a
//     single `undo()` reverts every child in reverse order.
//   • Each child still emits its own `pryzm.family.command.<verb>` span
//     with the shared `pryzm.family.command.batch-id`.
//   • The parent span name defaults to `pryzm.family.command.batch`
//     and can be overridden (the AI bridge passes
//     `pryzm.family.ai.batchExecute`).
//   • Empty batch is a no-op for undo state but still emits the parent
//     span (size = 0).
//   • Mid-batch failure: every already-executed child is rolled back in
//     reverse order, the original error re-throws, the undo stack is
//     untouched, and a follow-up batch can still be executed.
//   • Nested batches throw immediately.
//   • An unknown verb inside a batch throws BEFORE the batch is opened
//     (registers no commands, no span).

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createCommandBus,
  type CommandBus,
  type CommandHandler,
} from '../../src/app/commandBus.js';
import {
  clearSpanSinks,
  installSpanSink,
  type SpanRecord,
} from '../../src/app/otel.js';

interface Counter {
  value: number;
  events: string[];
}

function counterHandler(c: Counter, label: string, failOn?: number): CommandHandler<{ delta: number }, number> {
  return {
    category: 'test',
    execute({ delta }) {
      if (failOn !== undefined && c.value + delta === failOn) {
        throw new Error(`counter would reach ${failOn}`);
      }
      c.value += delta;
      c.events.push(`do:${label}:${delta}`);
      const before = c.value - delta;
      return {
        payload: c.value,
        undo: () => {
          c.value = before;
          c.events.push(`undo:${label}:${delta}`);
        },
      };
    },
  };
}

let bus: CommandBus;
let counter: Counter;
let spans: SpanRecord[];
let uninstall: (() => void) | null;

beforeEach(() => {
  bus = createCommandBus();
  counter = { value: 0, events: [] };
  bus.register({ verb: 'inc', handler: counterHandler(counter, 'inc') });
  bus.register({ verb: 'dec', handler: counterHandler(counter, 'dec') });
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

describe('commandBus.executeBatch — ADR-014 batch-undo (S54)', () => {
  it('runs each child in order and returns the collected payloads', async () => {
    const result = await bus.executeBatch([
      { verb: 'inc', args: { delta: 1 } },
      { verb: 'inc', args: { delta: 2 } },
      { verb: 'inc', args: { delta: 3 } },
    ]);
    expect(result.results).toEqual([1, 3, 6]);
    expect(counter.value).toBe(6);
  });

  it('collapses the whole batch into ONE undo entry', async () => {
    await bus.executeBatch([
      { verb: 'inc', args: { delta: 5 } },
      { verb: 'inc', args: { delta: 7 } },
    ]);
    expect(bus.undoDepth()).toBe(1);
  });

  it('one undo reverts every child in reverse order', async () => {
    await bus.executeBatch([
      { verb: 'inc', args: { delta: 1 } },
      { verb: 'inc', args: { delta: 2 } },
      { verb: 'inc', args: { delta: 4 } },
    ]);
    expect(counter.value).toBe(7);
    const ok = await bus.undo();
    expect(ok).toBe(true);
    expect(counter.value).toBe(0);
    expect(counter.events.slice(-3)).toEqual([
      'undo:inc:4',
      'undo:inc:2',
      'undo:inc:1',
    ]);
    expect(bus.undoDepth()).toBe(0);
  });

  it('each child emits its own pryzm.family.command.<verb> span tagged with the batch id', async () => {
    await bus.executeBatch([
      { verb: 'inc', args: { delta: 1 } },
      { verb: 'dec', args: { delta: 1 } },
    ]);
    const childSpans = spans.filter((s) => s.name.startsWith('pryzm.family.command.') && !s.name.endsWith('.batch') && !s.name.endsWith('batchExecute'));
    expect(childSpans.map((s) => s.name)).toEqual([
      'pryzm.family.command.inc',
      'pryzm.family.command.dec',
    ]);
    const batchIds = new Set(childSpans.map((s) => s.attributes['pryzm.family.command.batch-id']));
    expect(batchIds.size).toBe(1);
    expect([...batchIds][0]).toMatch(/^batch-/);
  });

  it('emits a parent batch span with size and overrideable name', async () => {
    await bus.executeBatch(
      [
        { verb: 'inc', args: { delta: 1 } },
        { verb: 'inc', args: { delta: 1 } },
      ],
      { spanName: 'pryzm.family.ai.batchExecute', batchId: 'b-fixed', batchVerb: 'ai.batchExecute', batchCategory: 'ai' },
    );
    const parent = spans.find((s) => s.name === 'pryzm.family.ai.batchExecute');
    expect(parent).toBeDefined();
    expect(parent!.status).toBe('ok');
    expect(parent!.attributes['pryzm.family.command.batch-id']).toBe('b-fixed');
    expect(parent!.attributes['pryzm.family.command.batch.size']).toBe(2);
    expect(parent!.attributes['pryzm.family.command.category']).toBe('ai');
  });

  it('empty batch emits the parent span with size 0 and pushes no undo entry', async () => {
    const result = await bus.executeBatch([]);
    expect(result.results).toEqual([]);
    expect(bus.undoDepth()).toBe(0);
    const parent = spans.find((s) => s.name === 'pryzm.family.command.batch');
    expect(parent).toBeDefined();
    expect(parent!.attributes['pryzm.family.command.batch.size']).toBe(0);
  });

  it('mid-batch failure rolls back already-executed children and does NOT push an undo entry', async () => {
    bus.unregister('inc');
    // Re-register `inc` with a guard that fails on the third increment.
    bus.register({ verb: 'inc', handler: counterHandler(counter, 'inc', 3) });

    await expect(
      bus.executeBatch([
        { verb: 'inc', args: { delta: 1 } }, // counter 0 → 1
        { verb: 'inc', args: { delta: 1 } }, // counter 1 → 2
        { verb: 'inc', args: { delta: 1 } }, // would reach 3 → throws
      ]),
    ).rejects.toThrow(/counter would reach 3/);

    expect(counter.value).toBe(0);
    expect(bus.undoDepth()).toBe(0);
    expect(counter.events).toEqual([
      'do:inc:1',
      'do:inc:1',
      'undo:inc:1',
      'undo:inc:1',
    ]);
  });

  it('after a failed batch the bus is still usable for a follow-up batch', async () => {
    bus.unregister('inc');
    bus.register({ verb: 'inc', handler: counterHandler(counter, 'inc', 1) });
    await expect(
      bus.executeBatch([{ verb: 'inc', args: { delta: 1 } }]),
    ).rejects.toThrow();
    bus.unregister('inc');
    bus.register({ verb: 'inc', handler: counterHandler(counter, 'inc') });
    await bus.executeBatch([{ verb: 'inc', args: { delta: 5 } }]);
    expect(counter.value).toBe(5);
    expect(bus.undoDepth()).toBe(1);
  });

  it('refuses nested batches', async () => {
    bus.register({
      verb: 'nest',
      handler: {
        category: 'test',
        async execute() {
          await bus.executeBatch([{ verb: 'inc', args: { delta: 1 } }]);
          return { payload: 'x', undo: () => undefined };
        },
      },
    });
    await expect(
      bus.executeBatch([{ verb: 'nest', args: {} }]),
    ).rejects.toThrow(/nested batches are not allowed/);
  });

  it('unknown verb inside a batch throws and leaves no children executed', async () => {
    await expect(
      bus.executeBatch([
        { verb: 'inc', args: { delta: 1 } },
        { verb: 'doesNotExist', args: {} },
      ]),
    ).rejects.toThrow(/no handler registered for "doesNotExist"/);
    expect(counter.value).toBe(0);
    expect(bus.undoDepth()).toBe(0);
  });

  it('per-verb single execute is unaffected (regression)', async () => {
    await bus.execute('inc', { delta: 9 });
    expect(counter.value).toBe(9);
    expect(bus.undoDepth()).toBe(1);
    await bus.undo();
    expect(counter.value).toBe(0);
  });
});
