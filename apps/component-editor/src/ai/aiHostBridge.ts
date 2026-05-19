// AI host bridge (S54).
//
// The thin L7-side glue between `@pryzm/ai-host` (the L7.5 plane) and
// the family editor's command bus + approval queue (rewrite plan §19.3).
//
// Responsibilities:
//   • `submit(prompt)` — lazy-load the AI host, ask it for a proposal,
//     enqueue the proposal into the local approval queue.  The host
//     itself does NOT mutate the editor; mutation only happens on
//     `accept`.  This preserves the rewrite plan's "AI host is pure,
//     never touches the bus directly" guarantee (§19.3 last bullet).
//   • `accept(id)` / `acceptNext()` — validate every command in the
//     proposal via the tool registry, then call
//     `commandBus.executeBatch` under a `pryzm.family.ai.batchExecute`
//     parent span so the whole proposal collapses to one undo entry.
//   • `reject(id)` / `rejectNext()` — drop the proposal; no commands
//     run.
//
// Validation failure on accept short-circuits BEFORE any mutation:
// the proposal is rejected with a structured `reason`, the bridge
// throws an `AiBridgeValidationError`, and the command bus is left
// untouched.
//
// LAYER — L7 chrome-side. No THREE, no DOM, no `(window as any)`.

import type {
  CommandBus,
  ExecuteBatchResult,
  ExecuteBatchSpec,
} from '../app/commandBus.js';
import type { AiApprovalQueue } from './approvalQueue.js';
import type { AiPendingActionLike, AiToolRegistry } from './types.js';

export const AI_BATCH_SPAN_NAME = 'pryzm.family.ai.batchExecute';
export const AI_BATCH_VERB = 'ai.batchExecute';
export const AI_BATCH_CATEGORY = 'ai';

/** Loader the bridge calls the first time `submit` runs. */
export type AiHostLoader = () => Promise<AiHostFacade>;

/** The minimal slice of `@pryzm/ai-host` the bridge uses. */
export interface AiHostFacade {
  submit(req: { readonly prompt: string }): Promise<AiPendingActionLike>;
}

export interface AiHostBridgeOptions {
  readonly commandBus: CommandBus;
  readonly toolRegistry: AiToolRegistry;
  readonly approvalQueue: AiApprovalQueue;
  /** Override the host loader.  Tests inject a stub; production uses
   *  the default loader which dynamically imports `@pryzm/ai-host`
   *  to keep the AI chunk off the first-paint path. */
  readonly loadHost?: AiHostLoader;
}

export class AiBridgeValidationError extends Error {
  readonly actionId: string;
  readonly failures: ReadonlyArray<{ index: number; verb: string; errors: ReadonlyArray<string> }>;
  constructor(
    actionId: string,
    failures: ReadonlyArray<{ index: number; verb: string; errors: ReadonlyArray<string> }>,
  ) {
    const summary = failures
      .map((f) => `#${f.index} ${f.verb}: ${f.errors.join(', ')}`)
      .join(' | ');
    super(`aiHostBridge: proposal "${actionId}" failed validation: ${summary}`);
    this.name = 'AiBridgeValidationError';
    this.actionId = actionId;
    this.failures = failures;
  }
}

export interface AiHostBridge {
  submit(prompt: string): Promise<AiPendingActionLike>;
  accept(id: string): Promise<ExecuteBatchResult>;
  acceptNext(): Promise<ExecuteBatchResult>;
  reject(id: string, reason?: string): AiPendingActionLike | undefined;
  rejectNext(reason?: string): AiPendingActionLike | undefined;
  /** True once the host has been loaded at least once.  Tests use this
   *  to assert the lazy-load contract. */
  isHostLoaded(): boolean;
}

// The runtime that mounts this bridge (familyEditorRuntime, S55) is
// responsible for passing a `loadHost` that adapts the real
// `@pryzm/ai-host`'s `AiHost.submit` (which returns
// `AiPendingAction { proposedCommands: CommandPayloadRef[] }`) into the
// `AiHostFacade` shape we need (with `commands: ExecuteBatchSpec[]`).
// Keeping the adapter outside the bridge means component-editor does
// NOT take a static dep on `@pryzm/ai-host`, so the AI chunk stays off
// the first-paint path even if the bridge module itself is in scope.
const DEFAULT_LOADER: AiHostLoader = async () => {
  throw new Error(
    'aiHostBridge: no host loader configured. Pass `loadHost` when constructing the bridge.',
  );
};

export function createAiHostBridge(opts: AiHostBridgeOptions): AiHostBridge {
  const { commandBus, toolRegistry, approvalQueue } = opts;
  const loadHost = opts.loadHost ?? DEFAULT_LOADER;
  let hostPromise: Promise<AiHostFacade> | null = null;
  let hostLoaded = false;

  function ensureHost(): Promise<AiHostFacade> {
    if (!hostPromise) {
      hostPromise = loadHost().then((h) => {
        hostLoaded = true;
        return h;
      });
    }
    return hostPromise;
  }

  function validate(action: AiPendingActionLike): void {
    const failures: Array<{ index: number; verb: string; errors: ReadonlyArray<string> }> = [];
    action.commands.forEach((spec, index) => {
      const v = toolRegistry.validate(spec.verb, spec.args);
      if (!v.ok) failures.push({ index, verb: spec.verb, errors: v.errors });
    });
    if (failures.length > 0) {
      throw new AiBridgeValidationError(action.id, Object.freeze(failures));
    }
  }

  async function commit(action: AiPendingActionLike): Promise<ExecuteBatchResult> {
    return commandBus.executeBatch(action.commands as ReadonlyArray<ExecuteBatchSpec>, {
      spanName: AI_BATCH_SPAN_NAME,
      batchId: action.id,
      batchVerb: AI_BATCH_VERB,
      batchCategory: AI_BATCH_CATEGORY,
    });
  }

  return {
    async submit(prompt) {
      const host = await ensureHost();
      const action = await host.submit({ prompt });
      approvalQueue.enqueue(action);
      return action;
    },
    async accept(id) {
      const action = approvalQueue.list().find((a) => a.id === id);
      if (!action) {
        throw new Error(`aiHostBridge.accept: no queued action with id "${id}".`);
      }
      try {
        validate(action);
      } catch (err) {
        approvalQueue.reject(
          id,
          err instanceof AiBridgeValidationError ? err.message : String(err),
        );
        throw err;
      }
      approvalQueue.accept(id);
      return commit(action);
    },
    async acceptNext() {
      const head = approvalQueue.peek();
      if (!head) throw new Error('aiHostBridge.acceptNext: queue is empty.');
      return this.accept(head.id);
    },
    reject(id, reason) {
      return approvalQueue.reject(id, reason);
    },
    rejectNext(reason) {
      const head = approvalQueue.peek();
      if (!head) return undefined;
      return approvalQueue.reject(head.id, reason);
    },
    isHostLoaded: () => hostLoaded,
  };
}
