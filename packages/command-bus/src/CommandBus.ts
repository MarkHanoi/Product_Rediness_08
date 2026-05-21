// CommandBus — handler registry + executeCommand entry point.
//
// Owns:
//   • registry of CommandHandler instances keyed by `handler.type`
//   • a per-execution OTel span `pryzm.command.execute`
//   • PatchEmitter + UndoStack + RingBufferUndoStack invocation order:
//       1. handler.canExecute() → ValidationResult (gate)
//       2. handler.execute()    → HandlerResult (forward + inverse + nextStates)
//       3. emitter.emit(eventRecord)
//       4. undoStack.push(eventRecord)
//       5. _ringBuffer?.push(PatchPair) — Sprint A31 C03 §4.1
//   • thrown errors do NOT push to the undo stack
//   • `canExecute` returning `{ valid: false }` aborts cleanly with a
//     `CommandBusError` and DOES NOT push to the undo stack
//   • SYNCHRONOUS throw if any key in `handler.affectedStores` is absent
//     from `ctx.stores` — explicitly outlaws the PRYZM-1 `(window as any)`
//     fallback antipattern (ADR-002, R1A-16; spec line 718).

import { ulid } from 'ulid';
import { withSpan } from './otel.js';
import { RingBufferUndoStack } from '@pryzm/runtime-undo-stack'; // Sprint A31 — C03 §4.1
import { toJsonPointer } from './PatchSnapshot.js';               // Sprint A31 — Immer→JSON Pointer
import type {
  AnyStores,
  AuditDefaults,
  CommandHandler,
  EventRecord,
  HandlerContext,
  AuditMetadata,
  PatchSnapshotEntry,
  StoreId,
} from './types.js';
import { PatchEmitter } from './PatchEmitter.js';
import { UndoStack } from './UndoStack.js';

export class CommandBusError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CommandBusError';
  }
}

export interface CommandBusOptions {
  emitter?: PatchEmitter;
  undoStack?: UndoStack;
  /**
   * Optional RingBufferUndoStack — when provided, every successful dispatch
   * also pushes a `PatchPair` (forward + inverse JSON Pointer ops) to this
   * buffer.  Sprint A31 (C03 §4.1): direct push avoids the patches.subscribe
   * indirection and keeps the ring buffer in sync with every dispatch.
   * Pass via `composeRuntime` options or call `setRingBuffer()` post-construction.
   */
  ringBuffer?: RingBufferUndoStack;
  /** Returns the current state slice for each store id. */
  storesProvider?: (storeIds: readonly string[]) => AnyStores;
  /** Audit defaults — overridden per-command via `executeCommand` overrides. */
  audit: AuditDefaults;
}

export class CommandBus {
  private readonly handlers = new Map<string, CommandHandler<unknown, AnyStores>>();
  private readonly emitter: PatchEmitter;
  private readonly undoStack: UndoStack;
  /** Sprint A31 — C03 §4.1: ring buffer for forward/inverse patch pairs. */
  private _ringBuffer: RingBufferUndoStack | null;
  /**
   * G3-T2: Direct CommandBus → CRDT applier (YjsDocAdapter).
   * When set, every successful executeCommand() call routes the command
   * payload into the Y.Doc immediately — eliminating the CRDT batch blackout
   * caused by StoreEventBus coalescing (gap-analysis doc 50, G3-T2). // TODO(TASK-08)
   */
  private _crdtApplier: ((type: string, payload: Record<string, unknown>) => void) | null = null;
  private readonly storesProvider: (ids: readonly string[]) => AnyStores;
  private readonly auditDefaults: AuditDefaults;

  constructor(opts: CommandBusOptions) {
    this.emitter = opts.emitter ?? new PatchEmitter();
    this.undoStack = opts.undoStack ?? new UndoStack();
    this._ringBuffer = opts.ringBuffer ?? null;
    this.storesProvider = opts.storesProvider ?? (() => ({}));
    this.auditDefaults = opts.audit;
  }

  register<T, S extends AnyStores = AnyStores>(handler: CommandHandler<T, S>): void {
    if (this.handlers.has(handler.type)) {
      throw new CommandBusError(`handler already registered: ${handler.type}`);
    }
    if (!Array.isArray(handler.affectedStores)) {
      throw new CommandBusError(
        `${handler.type}: affectedStores must be a readonly array — see ADR-002 §3.`,
      );
    }
    if (typeof handler.canExecute !== 'function' || typeof handler.execute !== 'function') {
      throw new CommandBusError(
        `${handler.type}: handler must implement both canExecute() and execute() — see ADR-002.`,
      );
    }
    this.handlers.set(
      handler.type,
      handler as unknown as CommandHandler<unknown, AnyStores>,
    );
  }

  unregister(type: string): boolean {
    return this.handlers.delete(type);
  }

  has(type: string): boolean {
    return this.handlers.has(type);
  }

  /** Convenience for tests / introspection. */
  get registeredTypes(): readonly string[] {
    return [...this.handlers.keys()];
  }

  /**
   * Read-only view of the handler registry, keyed by `handler.type`.
   *
   * D.5.A.8 (2026-04-30 evening): exposed as a public getter so the
   * runtime composer (and dev tools) can introspect the live registry
   * without going through the speculative `(inner as { commandRegistry?
   * : ReadonlyMap<string, unknown> }).commandRegistry ?? new Map()`
   * cast that previously returned an always-empty map (the field
   * `EverythingRuntime.commandRegistry` never existed).  The
   * `ReadonlyMap` view aliases the live `handlers` Map — entries
   * registered after this getter is read are reflected on the next
   * iteration (the contract is "live view", not "snapshot").
   *
   * Anchor: `04-PLAN-FORWARD/08-WAVE-4-SLOT-TYPING-ROUTING.md §2 PR 4.A.8`.
   */
  get registry(): ReadonlyMap<string, CommandHandler<unknown, AnyStores>> {
    return this.handlers;
  }

  get undo(): UndoStack {
    return this.undoStack;
  }

  get patches(): PatchEmitter {
    return this.emitter;
  }

  /**
   * Attach (or replace) the RingBufferUndoStack post-construction.
   *
   * Called by `composeRuntime` after the bus is wired into the inner runtime.
   * Once attached, every successful `executeCommand()` call pushes a `PatchPair`
   * (forward + inverse JSON Pointer ops converted from Immer patches) to the
   * ring buffer so `runtime.undoStack.undo()` can apply `inverse.ops` in
   * < 5 ms without replaying history (C03 §4.1, Sprint A31).
   *
   * CONTRACT: Sprint A31, C03 §4.1 — ring buffer MUST be populated on
   * every `source: 'user'` dispatch (non-undoable commands still push,
   * matching the EventRecord push on `undoStack`).
   */
  setRingBuffer(rb: RingBufferUndoStack): void {
    this._ringBuffer = rb;
  }

  /** Read-only access to the attached ring buffer (`null` if not yet set). */
  get ringBuffer(): RingBufferUndoStack | null {
    return this._ringBuffer;
  }

  /**
   * G3-T2 — Attach (or replace) the CRDT applier post-construction.
   *
   * When set, every successful `executeCommand()` call routes the command
   * payload directly to `YjsDocAdapter.applyCommand()` immediately after the
   * PatchEmitter fires (step 4).  This eliminates the CRDT batch blackout:
   * commands produce one CRDT op per element at execution time instead of
   * being coalesced via StoreEventBus events (one per level per batch). // TODO(TASK-08)
   *
   * Follows the same lazy-wiring pattern as `setRingBuffer()` (Sprint A31).
   *
   * CONTRACT (G3-T2, C08 §3.1):
   *   Non-fatal — if the applier throws, the error is logged and command
   *   execution returns the record normally.  CRDT failure MUST NOT break
   *   local execution.  Called by `engineLauncher.ts` after
   *   `batchCoordinator.registerYjsDocAdapter()` so the batch-window hooks
   *   are wired before the first command executes.
   */
  setCrdtApplier(fn: (type: string, payload: Record<string, unknown>) => void): void {
    this._crdtApplier = fn;
  }

  /** CRDT applier registered by `setCrdtApplier()`; null if not yet wired. */
  get crdtApplier(): ((type: string, payload: Record<string, unknown>) => void) | null {
    return this._crdtApplier;
  }

  /**
   * Phase D (Sprint A35 — C03 §4.1): expose the storesProvider for the
   * undo/redo applicator in `composeRuntime`.  Returns the same store map
   * that `buildContext()` uses — the Phase D Ctrl-Z handler passes the
   * result directly to `applyRingBufferSide()`.
   *
   * CONTRACT: never throws; unknown ids return `undefined` entries which
   * `applyRingBufferSide` silently skips (C03 §4.1 MUST NOT throw).
   */
  fetchStores(ids: readonly string[]): AnyStores {
    try {
      return this.storesProvider(ids);
    } catch {
      return {};
    }
  }

  /**
   * Materialise `ctx.stores` and synchronously verify every required
   * store id is present.  Throws `CommandBusError` on the first missing
   * key — no `(window as any)` fallback, ever.
   */
  private buildContext<S extends AnyStores>(
    handler: CommandHandler<unknown, S>,
  ): HandlerContext<S> {
    const required = handler.affectedStores as readonly string[];
    const provided = this.storesProvider(required) as Readonly<Record<string, unknown>>;
    for (const key of required) {
      if (!Object.prototype.hasOwnProperty.call(provided, key)) {
        throw new CommandBusError(
          `${handler.type}: required store '${key}' is missing from HandlerContext.stores. ` +
            `The bus does NOT fall back to globals — declare the store in your storesProvider. ` +
            `(ADR-002 §3 / R1A-16)`,
        );
      }
    }
    const audit: AuditMetadata = {
      ...this.auditDefaults,
      timestamp: new Date().toISOString(),
    };
    return { audit, stores: provided as S };
  }

  /**
   * Execute a command by type with an arbitrary payload.
   *
   * §U-B2 / §U-B5 (DAILY-USE-AUDIT 2026-05-20) — `opts.suppressUndo` skips
   * BOTH the legacy `undoStack.push()` and the ring-buffer `_ringBuffer.push()`.
   * Two distinct production code paths need this:
   *   1. **Remote/collaboration commands** (`bus.dispatch(..., { source: 'REMOTE' })`)
   *      must not push onto the LOCAL user's undo stack — Ctrl+Z would otherwise
   *      "undo" another collaborator's edit. §30-COLLAB §3.5.
   *   2. **Bridge handlers that return empty `forward`/`inverse` arrays**
   *      (e.g. `view/DeleteElement` which delegates to the legacy CommandManager).
   *      A push with both arrays empty eats a ring-buffer cursor slot, mis-aligns
   *      the cursor, and causes cascading mis-pops on subsequent Ctrl+Z. The
   *      empty-patch case is auto-detected and skipped regardless of `opts`.
   */
  async executeCommand<T>(type: string, payload: T, opts?: { readonly suppressUndo?: boolean }): Promise<EventRecord<T>> {
    const handler = this.handlers.get(type) as CommandHandler<T, AnyStores> | undefined;
    if (!handler) {
      throw new CommandBusError(`no handler registered for: ${type}`);
    }

    const ctx = this.buildContext<AnyStores>(handler as CommandHandler<unknown, AnyStores>);
    const suppressUndo = opts?.suppressUndo === true;

    return withSpan(
      'pryzm.command.execute',
      {
        'pryzm.command.type': handler.type,
        'pryzm.command.affected_stores': (handler.affectedStores as readonly string[]).join(','),
      },
      async () => {
        // 1. Gate.  canExecute is pure; failure does NOT touch the undo stack.
        const validation = handler.canExecute(ctx as HandlerContext<AnyStores>, payload);
        if (!validation.valid) {
          throw new CommandBusError(
            `${handler.type}: canExecute rejected — ${validation.reason}`,
          );
        }

        // 2. Apply.
        const result = await handler.execute(ctx as HandlerContext<AnyStores>, payload);

        // 3. Build the per-store patch envelopes (spec §1.2 PatchSnapshotEntry).
        const capturedAt = ctx.audit.timestamp;
        const stores = handler.affectedStores as readonly StoreId[];
        const patches: PatchSnapshotEntry[] = stores.length === 0
          ? []
          : stores.length === 1
          ? [{
              storeKey: stores[0]!,
              forwardPatches: result.forward,
              inversePatches: result.inverse,
              capturedAt,
            }]
          : stores.map(storeKey => ({
              storeKey,
              forwardPatches: result.forward.filter(p => String(p.path[0]) === storeKey),
              inversePatches: result.inverse.filter(p => String(p.path[0]) === storeKey),
              capturedAt,
            }));

        const record: EventRecord<T> = {
          id: ulid(),
          type: handler.type,
          payload,
          affectedStores: stores,
          patches,
          forward: result.forward,
          inverse: result.inverse,
          audit: ctx.audit,
        };

        // 4. Emit to PatchEmitter subscribers (EventLogPersistor, etc.).
        this.emitter.emit(record);

        // §U-B2/§U-B5 (audit): three-way gate on undo-stack pushes.
        // (a) `suppressUndo` (REMOTE-source commands) skips both stacks entirely.
        // (b) An empty-patch record (forward.length === 0 && inverse.length === 0)
        //     would poison the ring-buffer cursor — skip it. The legacy
        //     `undoStack` still records it for legacy bridge accounting because
        //     UndoStack is keyed on EventRecord not patches.
        const isEmptyPatchRecord = result.forward.length === 0 && result.inverse.length === 0;
        const skipLegacyUndo = suppressUndo;
        const skipRingBuffer = suppressUndo || isEmptyPatchRecord;

        // 5. Push EventRecord to legacy UndoStack (backward-compat for tests + UI).
        if (!skipLegacyUndo) this.undoStack.push(record);

        // 6. Sprint A31 (C03 §4.1): push forward/inverse PatchPair to RingBufferUndoStack.
        //    Converts Immer `(string | number)[]` paths to RFC 6902 JSON Pointer strings
        //    via `toJsonPointer` (PatchSnapshot.ts).  `runtime.undoStack.undo()` reads
        //    `ringBuffer.current().inverse.ops` and applies them via `applyPatches`.
        //    Sprint A34 (C03 §4.1): `affectedStores` added so `applyRingBufferSide()`
        //    can route inverse patches to the correct stores at Ctrl-Z time (Phase D).
        if (this._ringBuffer && !skipRingBuffer) {
          try {
            this._ringBuffer.push({
              forward: {
                // Sprint A33 (C03 §4.1): `op` MUST be preserved — `patchSideToImmer()`
                // needs it to reconstruct Immer-compatible Patch[] for `applyPatches`.
                ops: record.forward.map(p => ({ op: p.op, path: toJsonPointer(p.path), value: p.value })),
              },
              inverse: {
                ops: record.inverse.map(p => ({ op: p.op, path: toJsonPointer(p.path), value: p.value })),
              },
              // Sprint A34 — store routing metadata for Phase D undo/redo applicator.
              affectedStores: stores,
            });
          } catch (err) {
            console.error('[CommandBus] RingBufferUndoStack push failed for type=' + record.type + ':', err);
          }
        }

        // 7. G3-T2 — CRDT applier: direct CommandBus → YjsDocAdapter path.
        //    Routes the command payload into the Y.Doc immediately at execution
        //    time, eliminating the CRDT batch blackout that the StoreEventBus
        //    coalescing path caused (gap-analysis doc 50, §3).
        //    Non-fatal: CRDT failure MUST NOT break local execution (C08 §3.1).
        if (this._crdtApplier) {
          try {
            this._crdtApplier(record.type, record.payload as Record<string, unknown>);
          } catch (err) {
            console.error(
              '[CommandBus] CRDT applier error (type=' + record.type + '):',
              err,
            );
          }
        }

        return record;
      },
    );
  }
}
