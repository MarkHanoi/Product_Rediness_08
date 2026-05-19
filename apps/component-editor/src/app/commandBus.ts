// commandBus — the family editor's L2 command dispatch (S52 D3 + S54).
//
// Per the rewrite plan §8: every authoring action goes through a
// command (sketch.addLine, constraint.addCoincident, parameter.set,
// solid.extrude, type.create, material.bind, …). Each command is
// registered with a `verb`, an executor, and an undoer. The bus wraps
// every dispatch in a `pryzm.family.command.<verb>` OTel span (§14)
// and pushes onto a bounded undo stack.
//
// S54 — ADR-014 batch-undo: `executeBatch(specs, opts?)` runs N
// commands sequentially, emits a single named parent span (the AI
// host bridge passes `pryzm.family.ai.batchExecute`), and collapses
// the whole group into ONE entry on the undo stack so a single undo
// reverts the whole batch in reverse order. On mid-batch failure
// every already-executed command's inverse runs in reverse, the
// stack is left untouched, and the original error re-throws.
//
// LAYER — L7 chrome-side. No THREE, no DOM, no `(window as any)`.
// Pure logic — the bus does not own any model state.

import { withSpanAsync } from './otel.js';

export type CommandVerb = string;

export interface CommandResult<T = unknown> {
  /** Free-form payload returned by the executor (e.g. a new entity id). */
  readonly payload: T;
  /** Inverse function captured at execution time. */
  readonly undo: () => void | Promise<void>;
}

export interface CommandHandler<TArgs = unknown, TResult = unknown> {
  /** Span attribute classification: e.g. 'sketch', 'constraint', 'parameter'. */
  readonly category: string;
  /** Executor — performs the mutation and returns an undo closure. */
  execute(args: TArgs): CommandResult<TResult> | Promise<CommandResult<TResult>>;
}

export interface CommandRegistration<TArgs, TResult> {
  readonly verb: CommandVerb;
  readonly handler: CommandHandler<TArgs, TResult>;
}

export interface DispatchedCommand {
  readonly verb: CommandVerb;
  readonly category: string;
  readonly executedAt: number;
  readonly undo: () => void | Promise<void>;
}

const DEFAULT_UNDO_DEPTH = 100;
const DEFAULT_BATCH_SPAN_NAME = 'pryzm.family.command.batch';
const DEFAULT_BATCH_VERB = 'batch';
const DEFAULT_BATCH_CATEGORY = 'batch';

/** A single command spec inside an `executeBatch` call. */
export interface ExecuteBatchSpec<TArgs = unknown> {
  readonly verb: CommandVerb;
  readonly args: TArgs;
}

export interface ExecuteBatchOptions {
  /** Parent span name. Defaults to `pryzm.family.command.batch`. The AI
   *  host bridge overrides this with `pryzm.family.ai.batchExecute`. */
  readonly spanName?: string;
  /** Stable id for the whole group (echoed on every child span via
   *  `pryzm.family.command.batch-id` and on the undo span). Auto-
   *  generated when omitted. */
  readonly batchId?: string;
  /** Verb stored on the compound undo entry — surfaces in the
   *  `pryzm.family.command.undone-verb` span attribute. Defaults to
   *  `'batch'`. */
  readonly batchVerb?: string;
  /** Category stored on the compound undo entry. Defaults to `'batch'`. */
  readonly batchCategory?: string;
}

export interface ExecuteBatchResult {
  readonly batchId: string;
  readonly results: ReadonlyArray<unknown>;
}

export interface CommandBus {
  register<TArgs, TResult>(reg: CommandRegistration<TArgs, TResult>): void;
  unregister(verb: CommandVerb): void;
  has(verb: CommandVerb): boolean;
  /** Execute by verb. Throws if no handler is registered. */
  execute<TArgs = unknown, TResult = unknown>(
    verb: CommandVerb,
    args: TArgs,
  ): Promise<TResult>;
  /**
   * Execute N commands as one undo group (ADR-014 §S54). On mid-batch
   * failure, every already-executed command's inverse runs in reverse
   * and the original error re-throws — the undo stack is NOT mutated.
   * Refuses re-entry: nested batches throw.
   */
  executeBatch(
    specs: ReadonlyArray<ExecuteBatchSpec>,
    opts?: ExecuteBatchOptions,
  ): Promise<ExecuteBatchResult>;
  /** Pop and run the most recent undo. No-op if the stack is empty. */
  undo(): Promise<boolean>;
  /** Wipe the undo stack. */
  clear(): void;
  /** Inspect the current undo stack depth. */
  undoDepth(): number;
}

export interface CommandBusOptions {
  /** Maximum undo stack depth. Defaults to 100 per ADR-014. */
  readonly maxUndoDepth?: number;
}

export function createCommandBus(opts: CommandBusOptions = {}): CommandBus {
  const handlers: Map<CommandVerb, CommandHandler<unknown, unknown>> = new Map();
  const undoStack: DispatchedCommand[] = [];
  const cap = Math.max(1, opts.maxUndoDepth ?? DEFAULT_UNDO_DEPTH);
  let inBatch = false;
  let batchCounter = 0;

  function pushUndo(entry: DispatchedCommand): void {
    undoStack.push(entry);
    while (undoStack.length > cap) undoStack.shift();
  }

  function nextBatchId(): string {
    batchCounter += 1;
    return `batch-${Date.now().toString(36)}-${batchCounter}`;
  }

  async function runChild(
    spec: ExecuteBatchSpec,
    batchId: string,
  ): Promise<{ result: CommandResult<unknown>; verb: CommandVerb; category: string }> {
    const handler = handlers.get(spec.verb);
    if (!handler) {
      throw new Error(`commandBus.executeBatch: no handler registered for "${spec.verb}".`);
    }
    const result = await withSpanAsync(
      `pryzm.family.command.${spec.verb}`,
      {
        'pryzm.family.command.category': handler.category,
        'pryzm.family.command.batch-id': batchId,
      },
      async () => handler.execute(spec.args),
    );
    return { result, verb: spec.verb, category: handler.category };
  }

  return {
    register(reg) {
      if (handlers.has(reg.verb)) {
        throw new Error(`commandBus.register: verb "${reg.verb}" already registered.`);
      }
      handlers.set(reg.verb, reg.handler as CommandHandler<unknown, unknown>);
    },
    unregister(verb) {
      handlers.delete(verb);
    },
    has(verb) {
      return handlers.has(verb);
    },
    async execute<TArgs, TResult>(verb: CommandVerb, args: TArgs): Promise<TResult> {
      const handler = handlers.get(verb) as
        | CommandHandler<TArgs, TResult>
        | undefined;
      if (!handler) {
        throw new Error(`commandBus.execute: no handler registered for "${verb}".`);
      }
      return withSpanAsync(
        `pryzm.family.command.${verb}`,
        { 'pryzm.family.command.category': handler.category },
        async () => {
          const result = await handler.execute(args);
          pushUndo({
            verb,
            category: handler.category,
            executedAt: Date.now(),
            undo: result.undo,
          });
          return result.payload;
        },
      );
    },
    async executeBatch(specs, opts = {}): Promise<ExecuteBatchResult> {
      if (inBatch) {
        throw new Error('commandBus.executeBatch: nested batches are not allowed.');
      }
      const batchId = opts.batchId ?? nextBatchId();
      const spanName = opts.spanName ?? DEFAULT_BATCH_SPAN_NAME;
      const batchVerb = opts.batchVerb ?? DEFAULT_BATCH_VERB;
      const batchCategory = opts.batchCategory ?? DEFAULT_BATCH_CATEGORY;

      // Empty batch — emit the parent span for observability but do
      // NOT push an undo entry (nothing to revert).
      if (specs.length === 0) {
        await withSpanAsync(
          spanName,
          {
            'pryzm.family.command.batch-id': batchId,
            'pryzm.family.command.batch.size': 0,
            'pryzm.family.command.category': batchCategory,
          },
          async () => undefined,
        );
        return Object.freeze({ batchId, results: Object.freeze([]) });
      }

      inBatch = true;
      const undos: Array<() => void | Promise<void>> = [];
      const results: unknown[] = [];
      try {
        await withSpanAsync(
          spanName,
          {
            'pryzm.family.command.batch-id': batchId,
            'pryzm.family.command.batch.size': specs.length,
            'pryzm.family.command.category': batchCategory,
          },
          async () => {
            for (const spec of specs) {
              const child = await runChild(spec, batchId);
              undos.push(child.result.undo);
              results.push(child.result.payload);
            }
          },
        );
      } catch (err) {
        // Roll back already-executed children in reverse order.  An
        // undoer that throws must not block the rest of the rollback,
        // but the original error is what we re-throw to the caller.
        for (let i = undos.length - 1; i >= 0; i -= 1) {
          try {
            await undos[i]!();
          } catch {
            // swallow — see comment above.
          }
        }
        inBatch = false;
        throw err;
      }
      inBatch = false;

      // One compound undo entry collapses the whole batch.
      pushUndo({
        verb: batchVerb,
        category: batchCategory,
        executedAt: Date.now(),
        undo: async () => {
          for (let i = undos.length - 1; i >= 0; i -= 1) {
            await undos[i]!();
          }
        },
      });

      return Object.freeze({ batchId, results: Object.freeze(results.slice()) });
    },
    async undo(): Promise<boolean> {
      const last = undoStack.pop();
      if (!last) return false;
      await withSpanAsync(
        'pryzm.family.command.undo',
        {
          'pryzm.family.command.undone-verb': last.verb,
          'pryzm.family.command.category': last.category,
        },
        async () => {
          await last.undo();
        },
      );
      return true;
    },
    clear() {
      undoStack.length = 0;
    },
    undoDepth() {
      return undoStack.length;
    },
  };
}
