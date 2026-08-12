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
import type { Patch } from 'immer';   // §L-292: multi-store envelope store-key strip
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
// ADR-0324 §1–2 (R1) — optional invocation envelope (actor/origin/approval).
// ADR-0322 §2 (R4) — optional consumed plan, threaded the same way.
import type { CommandExecutionContext, ConsequencePlan } from './consequence.js';
import { PatchEmitter } from './PatchEmitter.js';
import { UndoStack } from './UndoStack.js';
// §UNDO-GESTURE-ID (C03 §4.6 U-10) — one dispatch = one gesture unless a caller
// declares a wider one. See gestureScope.ts for the full rationale.
import { currentGestureId, newGestureId, withGestureId, withRemoteOrigin } from './gestureScope.js';

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
  /**
   * §FIX-COMMAND-NAMESPACE (L-796) — deprecated alias → canonical type.
   * Only ever READ for reporting (which name a caller used); dispatch never
   * consults it, because aliases are already keys in `handlers`.
   */
  private readonly aliasToCanonical = new Map<string, string>();
  /** One deprecation warning per alias per process — never once per dispatch. */
  private readonly warnedAliases = new Set<string>();
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
    const entry = handler as unknown as CommandHandler<unknown, AnyStores>;
    this.handlers.set(handler.type, entry);

    // §FIX-COMMAND-NAMESPACE (L-796) — deprecated aliases resolve to the SAME
    // handler object via extra keys in the SAME map. No second dispatch path
    // exists, so a handler without aliases is byte-for-byte unaffected.
    //
    // Collisions are FATAL rather than last-write-wins. An alias silently
    // shadowing a real command would route a caller to the wrong handler and
    // produce patches against the wrong store — a data defect that would be
    // near-impossible to trace back to a registration order. Registration is a
    // boot-time operation, so throwing here fails the app loudly at start rather
    // than corrupting a document at runtime.
    for (const alias of handler.aliases ?? []) {
      if (alias === handler.type) {
        throw new CommandBusError(
          `${handler.type}: alias must differ from the canonical type.`,
        );
      }
      const existing = this.handlers.get(alias);
      if (existing) {
        throw new CommandBusError(
          `alias '${alias}' for ${handler.type} collides with an already-registered ` +
            `type (owned by ${existing.type}). Aliases must not shadow a real command.`,
        );
      }
      this.handlers.set(alias, entry);
      this.aliasToCanonical.set(alias, handler.type);
    }
  }

  /**
   * Remove a type. When `type` is a CANONICAL name its aliases go too —
   * otherwise `unregister` would leave the alias keys pointing at a handler the
   * caller believes is gone, and `has()` would answer true for a command that no
   * longer exists.
   */
  unregister(type: string): boolean {
    const removed = this.handlers.delete(type);
    if (removed && !this.aliasToCanonical.has(type)) {
      for (const [alias, canonical] of [...this.aliasToCanonical]) {
        if (canonical === type) {
          this.handlers.delete(alias);
          this.aliasToCanonical.delete(alias);
        }
      }
    } else if (removed) {
      this.aliasToCanonical.delete(type);
    }
    return removed;
  }

  /**
   * §FIX-COMMAND-NAMESPACE (L-796) — canonical name for a type, or `null` when
   * `type` is not a deprecated alias. Lets tooling and tests assert the mapping
   * without reaching into the registry.
   */
  canonicalTypeFor(type: string): string | null {
    return this.aliasToCanonical.get(type) ?? null;
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
  async executeCommand<T>(
    type: string,
    payload: T,
    opts?: {
      readonly suppressUndo?: boolean;
      readonly gestureId?: string;
      /**
       * ADR-0324 §1–2 (R1) — the optional invocation envelope
       * (actor / origin / approval), riding beside `gestureId` exactly as
       * §UNDO-GESTURE-ID threaded that field: caller-supplied, resolved
       * before any await, carried onto the EventRecord, read by NOTHING in
       * the bus. Zero behaviour change when absent — the record simply
       * omits the property.
       */
      readonly context?: CommandExecutionContext;
      /**
       * ADR-0322 §2 (R4) — the ConsequencePlan this execution CONSUMES,
       * riding beside `context` in the exact R1 idiom: caller-supplied,
       * resolved before any await, carried onto the EventRecord, read by
       * NOTHING in the bus. The caller (the L7 executor service) has already
       * verified the planHash binding against the live pre-state — a stale
       * plan is refused THERE (`PlanStaleRefusal`) and never passed here.
       * Zero behaviour change when absent — the record simply omits the
       * property, so plan-less dispatch of every verb is byte-identical to
       * pre-R4 behaviour.
       */
      readonly plan?: ConsequencePlan;
    },
  ): Promise<EventRecord<T>> {
    const handler = this.handlers.get(type) as CommandHandler<T, AnyStores> | undefined;
    if (!handler) {
      throw new CommandBusError(`no handler registered for: ${type}`);
    }

    // §UNDO-GESTURE-ID (C03 §4.6 U-10) — resolve the gesture this dispatch belongs
    // to, SYNCHRONOUSLY, before anything can await. Three cases, in order:
    //   1. `opts.gestureId` — a caller that owns a multi-call interaction (a tool
    //      that dual-dispatches, a drag) declares the id explicitly;
    //   2. an open ambient scope (`withGesture`) — the dispatch is nested inside a
    //      declared interaction;
    //   3. otherwise this dispatch IS the interaction, so mint one.
    // Captured into a local because the ring-buffer push below happens after
    // `await handler.execute(...)`, in a later microtask where the ambient slot may
    // legitimately belong to a different dispatch. The ambient is re-established
    // around the handler call only (see `withGestureId` there), which is where the
    // 81 `initBusHandlers` bridges synchronously run `commandManager.execute`.
    const gestureId = opts?.gestureId ?? currentGestureId() ?? newGestureId(type);

    // §FIX-COMMAND-NAMESPACE (L-796) — name and shame a deprecated alias ONCE
    // per process. The point of a deprecation is that somebody removes it, and
    // an alias nobody can see is an alias nobody retires. Once-per-alias, not
    // once-per-dispatch: a per-call warning on a hot command would be noise the
    // next person silences rather than acts on.
    const canonical = this.aliasToCanonical.get(type);
    if (canonical && !this.warnedAliases.has(type)) {
      this.warnedAliases.add(type);
      console.warn(
        `[CommandBus] §FIX-COMMAND-NAMESPACE — '${type}' is a DEPRECATED alias for ` +
          `'${canonical}'. Update the call site; the alias will be removed once the ` +
          `naming ratchet reaches zero (L-796).`,
      );
    }

    const ctx = this.buildContext<AnyStores>(handler as CommandHandler<unknown, AnyStores>);

    // §UNDO-REMOTE-ORIGIN (C03 §4.6 U-1) — is this dispatch REMOTE-originated?
    //
    // TWO signals, because two production paths mark remoteness differently and
    // reading only one leaves the other broken:
    //   • `opts.suppressUndo` — the bus's own declared remote signal, documented
    //     on `executeCommand` above ("Remote/collaboration commands … must not
    //     push onto the LOCAL user's undo stack — §30-COLLAB §3.5") and equated
    //     with `source: 'remote'` by C03 §4.6 U-1 verbatim.
    //   • `payload._remoteSync === true` — the marker the CRDT read-back sink
    //     ACTUALLY sets today (`initRemoteElementSync.ts:159`, exported there as
    //     `REMOTE_SYNC_FLAG`). That sink does NOT pass `suppressUndo`, which is
    //     exactly why the CRDT leg escaped the U-1 rule while the socket.io leg
    //     (`RemoteCommandDispatcher.ts:378`, which stamps `{source:'REMOTE'}`)
    //     obeyed it. The flag is not re-declared as a constant here on purpose:
    //     `initRemoteElementSync` is L7 and this is L1, so L1 may not import it;
    //     the string is the wire contract between them and is named in both
    //     files' comments so neither can be changed alone.
    // The marker is read defensively — a non-object payload is not remote.
    const _p = payload as unknown as Record<string, unknown> | null | undefined;
    const remoteOrigin =
      opts?.suppressUndo === true ||
      (typeof _p === 'object' && _p !== null && _p['_remoteSync'] === true);

    // A remote-originated dispatch must not push to EITHER stack (U-1). The ring
    // buffer was already covered by `suppressUndo`; the `_remoteSync` half is new
    // and closes the same hole on the same rule, so the two stacks cannot
    // disagree about whether a peer's edit is undoable locally.
    const suppressUndo = remoteOrigin;
    // ADR-0324 §1–2 (R1) — capture the invocation envelope SYNCHRONOUSLY,
    // mirroring the gestureId capture above. Metadata only: nothing below
    // branches on it.
    const executionContext = opts?.context;
    // ADR-0322 §2 (R4) — capture the consumed plan the same way. Metadata
    // only at the bus layer: nothing below branches on it; reconciliation
    // against reality happens in the caller AFTER this dispatch returns.
    const consumedPlan = opts?.plan;

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
        //
        // §UNDO-GESTURE-ID — the handler runs INSIDE this dispatch's gesture scope.
        // `withGestureId` sets the ambient id for the synchronous entry of
        // `handler.execute`, which is exactly where the `initBusHandlers` bridges
        // call `_cmExec(new XCommand(...))`; the legacy entry they create then
        // carries the same id as the PatchPair pushed below, so `performUndo`
        // recognises the pair as ONE gesture without consulting a clock. The scope
        // is restored the moment the call returns (it does not span the await) —
        // see the SYNCHRONOUS BY CONTRACT note in gestureScope.ts.
        // §UNDO-REMOTE-ORIGIN (C03 §4.6 U-1) — the LEGACY half of the same rule.
        // The bridges called below run `commandManager.execute(new XCommand(...))`
        // on this synchronous stack, and `CommandMetadata` defaults to
        // `{ source: 'HUMAN_DIRECT' }`. Marking the stack lets
        // `CommandManagerImpl.execute` stamp REMOTE instead, so the legacy history
        // honours U-1 exactly as the ring buffer does via `suppressUndo`. Without
        // this, `suppressUndo` protects only the stack the bridges do NOT use, and
        // a peer's edit still lands on the local user's Ctrl+Z.
        const _runHandler = (): unknown =>
          handler.execute(ctx as HandlerContext<AnyStores>, payload);
        const result = await withGestureId(gestureId, () =>
          (remoteOrigin ? withRemoteOrigin(_runHandler) : _runHandler()) as ReturnType<
            typeof handler.execute
          >);

        // 3. Build the per-store patch envelopes (spec §1.2 PatchSnapshotEntry).
        const capturedAt = ctx.audit.timestamp;
        const stores = handler.affectedStores as readonly StoreId[];

        // §U-B6 (DAILY-USE 2026-05-22, #117) — UNDO-ROUTING GUARD. A patch is routed
        // onto the undo stack by its store. If a handler MUTATES a store it did not
        // declare in affectedStores, that patch is silently dropped from the per-store
        // routing built just below → Ctrl+Z applies an INCOMPLETE inverse, leaving
        // orphaned state (the #117 robustness class). This dev-time guard surfaces the
        // misconfiguration loudly at the exact source so affectedStores is corrected
        // before it ships. It is observability only — no behaviour change. Two modes:
        //   (a) zero declared stores but real patches → empty routing → undo delegates
        //       to legacy (OI-034) and usually no-ops.
        //   (b) multi-store handler whose patch path[0] (the store key, by the routing
        //       convention `String(p.path[0]) === storeKey` used in `stores.map(...)`
        //       below) is not in affectedStores.
        // Single-store handlers are exempt — all their patches route to the one store
        // regardless of path[0], so there is nothing to mis-route.
        if (result.forward.length > 0 || result.inverse.length > 0) {
          if (stores.length === 0) {
            console.error(
              `[CommandBus] §U-B6 UNDO-ROUTING BUG: handler "${handler.type}" produced ` +
              `${result.forward.length} forward patch(es) but declares NO affectedStores → they are ` +
              `dropped from undo routing (Ctrl+Z will not restore them). Declare affectedStores.`,
            );
          } else if (stores.length > 1) {
            const declared = new Set<string>(stores as readonly string[]);
            const offending = new Set<string>();
            for (const p of result.forward) { const r = String(p.path[0]); if (r && !declared.has(r)) offending.add(r); }
            for (const p of result.inverse) { const r = String(p.path[0]); if (r && !declared.has(r)) offending.add(r); }
            if (offending.size > 0) {
              console.error(
                `[CommandBus] §U-B6 UNDO-ROUTING BUG: handler "${handler.type}" wrote to undeclared ` +
                `store(s) [${[...offending].join(', ')}] (declared: [${[...declared].join(', ')}]). Those ` +
                `patches are dropped from undo routing → Ctrl+Z applies an incomplete inverse. Add them to affectedStores.`,
              );
            }
          }
        }

        // §FEAT-SWIMMING-POOL-ELEMENT (L-292, ADR-0124 §5) — the multi-store branch
        // ROUTES by `path[0] === storeKey` and then STRIPS that key, because the
        // consumer of a per-store envelope is `attachStores` → `Store.applyPatch()`,
        // which expects STORE-RELATIVE paths (`[elementId, ...field]`) — exactly what
        // the single-store branch below hands it, since `produceCommand` is already
        // store-relative.
        //
        // Leaving the key on would make every op look like a field-write on an element
        // literally named "wall"/"slab", nesting the whole store one level deep. The
        // FLAT `record.forward` / `record.inverse` arrays KEEP the prefix — the ring
        // buffer needs it to route at Ctrl+Z time (`applyRingBufferSide`, which strips
        // it symmetrically), and the §U-B6 guard above reads it too.
        //
        // Dead until L-292: no bus handler had ever declared two stores.
        const stripStoreKey = (p: Patch): Patch => ({ ...p, path: p.path.slice(1) });

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
              forwardPatches: result.forward.filter(p => String(p.path[0]) === storeKey).map(stripStoreKey),
              inversePatches: result.inverse.filter(p => String(p.path[0]) === storeKey).map(stripStoreKey),
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
          // ADR-0324 §1–2 (R1) — the envelope rides the record verbatim.
          // Conditionally spread so a legacy call yields a record WITHOUT the
          // property (not `context: undefined`) — wire encodings (msgpack) and
          // deep-equality of legacy records stay byte-identical.
          ...(executionContext !== undefined ? { context: executionContext } : {}),
          // ADR-0322 §2 (R4) — the consumed plan rides the record verbatim,
          // conditionally spread for the same byte-identity reason as above.
          ...(consumedPlan !== undefined ? { plan: consumedPlan } : {}),
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
              // §UNDO-CROSS-STACK-ORDER (C03 §4.7-2) — commit time so performUndoRedo
              // can order this entry against the legacy CommandManager's stack
              // (both are Date.now()-based) and undo in reverse chronological order.
              timestamp: Date.now(),
              // §UNDO-GESTURE-ID (C03 §4.6 U-10) — WHICH user interaction produced
              // this entry. `performUndo` compares it against the legacy stack's
              // top entry (`CommandMetadata.gestureId`) to recognise a
              // dual-dispatch twin by identity instead of by clock proximity.
              gestureId,
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
