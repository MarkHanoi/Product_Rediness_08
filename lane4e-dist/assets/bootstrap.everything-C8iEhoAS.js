import { t as trace, S as SpanStatusCode } from './trace-api-BIfvUk_c.js';
import { aH as produceWithPatches, aI as withSpan, aJ as toJsonPointer, C as CommandType, aK as childRefusalText, a3 as resolveCatalogueRef, aL as isValidPanelType, aM as VALID_PANEL_TYPES, aN as DEFAULT_HOSTED_DOOR, ak as UpdateFurnitureParametersCommand, aO as STANDARD_MATERIAL_LIBRARY, aP as isCurtainWallParameterKey, aQ as unknownCurtainWallParameterRefusal, ad as checkCurtainWallParameter, aR as UpdateCurtainWallCommand, g as doorStore, aS as doorSystemTypeStore, i as elementRegistry, s as semanticGraphManager, aT as roomSpatialIndex, aU as polygonAABB, aV as isRoomColourMode, aW as vgGovernanceStore, aX as ROOM_VG_CATEGORY, w as wallOccupancyStore$1, aY as evaluateWallPlacement, aZ as findWallOpeningCrossings, a_ as wallCrossesOpeningRefusalText, a$ as computeWallCrossingOffers, j as serializeWallSnapshot, b0 as reseatOpeningWithFrame, b1 as deserializeWallSnapshot, b2 as rakeAuthorability, b3 as wallSystemTypeStore, b4 as UpdateElementParameterCommand, b5 as isRakeInRange, a5 as RAKE_MIN_DEG, a6 as RAKE_MAX_DEG, b6 as arcMinTurnRadius, k as windowStore, b7 as windowSystemTypeStore, b8 as wallCentrelineLength, l as CreateWallOpeningCommand, _ as _enum, B as discriminatedUnion, q as object, p as string, v as literal, r as number, u as array, b9 as ZodIssueCode, T as Store, x as boolean, A as record, E as unknown, ba as createId, bb as Wall, a as storeRegistry, aj as UpdateWallHeightCommand, bc as WALL_HEIGHT_CONSTRAINTS, bd as UpdateWallBaselineCommand, ao as CreateWallsOnAllSlabsCommand, be as Slab, ar as CreateSlabsOnAllFloorsCommand, bf as Door, bg as Window, bh as Roof, bi as Skylight, bj as CurtainWall, aq as CreateCurtainWallsOnAllSlabsCommand, ag as migrateToGridSystem, bk as insertGridLine, bl as removeGridLine, bm as Grid, bn as Column, bo as Beam, bp as MoveStairCommand, bq as Stair, br as CreateStairRailingCommand, bs as UpdateStairParametersCommand, bt as Handrail, bu as Ceiling, bv as DEFAULT_FINISH_THICKNESS_M, bw as resolveFinishSeating, bx as confidencePredatingTheField, by as systemProvenance, bz as Pool, bA as Balcony, bB as Component, bC as ENCLOSURE_SIDE_COUNT, bD as LIFT_PART_CYCLE_ORDER, bE as LiftCompoundSchema, bF as buildLiftAssembly, bG as BoundaryLine, F as projectScopeRegistry, b as storeEventBus, bH as annotationStore, bI as Annotation, bJ as Furniture, bK as FurnitureRepresentation, D as DOMEventBus, bL as Plumbing, bM as Lighting, as as UpdateRoomCommand, bN as Structural, bO as Dimension } from './ElementStore-CQe7ZDFd.js';
import { u as ulid } from './LODManager-DHqndFcX.js';
import { p as polygonSignedAreaOrdinates, f as findMaterialRecord } from './SteelProfileLibrary-NgbfwhrM.js';
import { C as CubeStore, a as attachStores, A as AnnotationStore, S as SelectionStore } from './attachStores-BMAC7-uX.js';
import { C as CommitterHost, b as bindStore } from './dispatcher-wbP0dOm1.js';
import { e as encode, d as decode } from './decode-CN54oYFr.js';
import { p as planDoorTypeChange } from './DoorTypeChange-C0A5VweF.js';
import { p as planWindowTypeChange } from './WindowTypeChange-BhhzXbXs.js';
import { r as resolveLevelScopeByHost, a as CreateFurnitureCommand, C as CreatePlumbingFixtureCommand } from './CreatePlumbingFixtureCommand-DUwQtpaf.js';
import { D as DescriptorInvariantError } from './assertValidDescriptor-tuQbjkHa.js';
import './three.core-Bv4ks8y-.js';
import './three.module-zvZFyv9V.js';

function capabilityRefused(input) {
  return input.subReason !== void 0 ? { kind: "refused", ...input, subReason: input.subReason } : {
    kind: "refused",
    commandType: input.commandType,
    reason: input.reason,
    asked: input.asked,
    unaccountedFor: input.unaccountedFor,
    protects: input.protects,
    detail: input.detail
  };
}

function _prefixWithStore(storeKey, p) {
  return { ...p, path: [storeKey, ...p.path] };
}
function produceMultiStoreCommand(stores, recipes) {
  const nextStates = {};
  const forward = [];
  const inverse = [];
  for (const key of Object.keys(stores)) {
    const [next, fwd, inv] = produceWithPatches(stores[key], (draft) => {
      recipes[key](draft);
    });
    nextStates[key] = next;
    for (const p of fwd) forward.push(_prefixWithStore(key, p));
    for (const p of inv) inverse.push(_prefixWithStore(key, p));
  }
  return { nextStates, forward, inverse };
}
function produceCommand(base, recipe) {
  const [next, forward, inverse] = produceWithPatches(base, recipe);
  return [next, forward, inverse];
}

class PatchEmitter {
  listeners = /* @__PURE__ */ new Set();
  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  /** Emit an event record to every subscriber.  Returns the encoded bytes. */
  emit(record) {
    const bytes = PatchEmitter.encode(record);
    for (const listener of this.listeners) {
      listener(bytes, record);
    }
    return bytes;
  }
  /** S04 (ADR-004): MessagePack binary encoding. */
  static encode(record) {
    return encode(record);
  }
  /** S04 (ADR-004): MessagePack binary decoding. */
  static decode(bytes) {
    return decode(bytes);
  }
}

class UndoStack {
  maxSize;
  undoBuf = [];
  redoBuf = [];
  constructor(opts = {}) {
    this.maxSize = Math.max(1, Math.floor(opts.maxSize ?? 100));
  }
  push(record) {
    this.undoBuf.push(record);
    if (this.undoBuf.length > this.maxSize) {
      this.undoBuf.shift();
    }
    this.redoBuf = [];
  }
  /** Pop the most recent forward event; caller applies its `inverse` patches. */
  undo() {
    const popped = this.undoBuf.pop();
    if (!popped) return null;
    this.redoBuf.push(popped);
    return popped;
  }
  /** Pop the most recent undone event; caller applies its `forward` patches. */
  redo() {
    const popped = this.redoBuf.pop();
    if (!popped) return null;
    this.undoBuf.push(popped);
    return popped;
  }
  clear() {
    this.undoBuf = [];
    this.redoBuf = [];
  }
  get size() {
    return this.undoBuf.length;
  }
  get redoSize() {
    return this.redoBuf.length;
  }
  /** Snapshot — for introspection and tests. */
  snapshot() {
    return { undo: [...this.undoBuf], redo: [...this.redoBuf] };
  }
}

let _seq$1 = 0;
let _current = null;
function newGestureId(label) {
  _seq$1 += 1;
  const tag = label ? `${label}-` : "";
  return `g_${tag}${_seq$1.toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
function currentGestureId() {
  return _current;
}
function withGestureId(gestureId, body) {
  const previous = _current;
  _current = gestureId;
  try {
    return body();
  } finally {
    _current = previous;
  }
}
const REMOTE_ORIGIN_SLOT = "__pryzmRemoteOriginDispatch";
function withRemoteOrigin(body) {
  const host = globalThis;
  const previous = host[REMOTE_ORIGIN_SLOT];
  host[REMOTE_ORIGIN_SLOT] = true;
  try {
    return body();
  } finally {
    host[REMOTE_ORIGIN_SLOT] = previous;
  }
}

class CommandBusError extends Error {
  constructor(message) {
    super(message);
    this.name = "CommandBusError";
  }
}
class CommandBus {
  handlers = /* @__PURE__ */ new Map();
  /**
   * §FIX-COMMAND-NAMESPACE (L-796) — deprecated alias → canonical type.
   * Only ever READ for reporting (which name a caller used); dispatch never
   * consults it, because aliases are already keys in `handlers`.
   */
  aliasToCanonical = /* @__PURE__ */ new Map();
  /** One deprecation warning per alias per process — never once per dispatch. */
  warnedAliases = /* @__PURE__ */ new Set();
  emitter;
  undoStack;
  /** Sprint A31 — C03 §4.1: ring buffer for forward/inverse patch pairs. */
  _ringBuffer;
  /**
   * G3-T2: Direct CommandBus → CRDT applier (YjsDocAdapter).
   * When set, every successful executeCommand() call routes the command
   * payload into the Y.Doc immediately — eliminating the CRDT batch blackout
   * caused by StoreEventBus coalescing (gap-analysis doc 50, G3-T2). // TODO(TASK-08)
   */
  _crdtApplier = null;
  storesProvider;
  auditDefaults;
  constructor(opts) {
    this.emitter = opts.emitter ?? new PatchEmitter();
    this.undoStack = opts.undoStack ?? new UndoStack();
    this._ringBuffer = opts.ringBuffer ?? null;
    this.storesProvider = opts.storesProvider ?? (() => ({}));
    this.auditDefaults = opts.audit;
  }
  register(handler) {
    if (this.handlers.has(handler.type)) {
      throw new CommandBusError(`handler already registered: ${handler.type}`);
    }
    if (!Array.isArray(handler.affectedStores)) {
      throw new CommandBusError(
        `${handler.type}: affectedStores must be a readonly array — see ADR-002 §3.`
      );
    }
    if (typeof handler.canExecute !== "function" || typeof handler.execute !== "function") {
      throw new CommandBusError(
        `${handler.type}: handler must implement both canExecute() and execute() — see ADR-002.`
      );
    }
    const entry = handler;
    this.handlers.set(handler.type, entry);
    for (const alias of handler.aliases ?? []) {
      if (alias === handler.type) {
        throw new CommandBusError(
          `${handler.type}: alias must differ from the canonical type.`
        );
      }
      const existing = this.handlers.get(alias);
      if (existing) {
        throw new CommandBusError(
          `alias '${alias}' for ${handler.type} collides with an already-registered type (owned by ${existing.type}). Aliases must not shadow a real command.`
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
  unregister(type) {
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
  canonicalTypeFor(type) {
    return this.aliasToCanonical.get(type) ?? null;
  }
  has(type) {
    return this.handlers.has(type);
  }
  /** Convenience for tests / introspection. */
  get registeredTypes() {
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
  get registry() {
    return this.handlers;
  }
  get undo() {
    return this.undoStack;
  }
  get patches() {
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
  setRingBuffer(rb) {
    this._ringBuffer = rb;
  }
  /** Read-only access to the attached ring buffer (`null` if not yet set). */
  get ringBuffer() {
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
  setCrdtApplier(fn) {
    this._crdtApplier = fn;
  }
  /** CRDT applier registered by `setCrdtApplier()`; null if not yet wired. */
  get crdtApplier() {
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
  fetchStores(ids) {
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
  buildContext(handler) {
    const required = handler.affectedStores;
    const provided = this.storesProvider(required);
    for (const key of required) {
      if (!Object.prototype.hasOwnProperty.call(provided, key)) {
        throw new CommandBusError(
          `${handler.type}: required store '${key}' is missing from HandlerContext.stores. The bus does NOT fall back to globals — declare the store in your storesProvider. (ADR-002 §3 / R1A-16)`
        );
      }
    }
    const audit = {
      ...this.auditDefaults,
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    };
    return { audit, stores: provided };
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
  async executeCommand(type, payload, opts) {
    const handler = this.handlers.get(type);
    if (!handler) {
      throw new CommandBusError(`no handler registered for: ${type}`);
    }
    const gestureId = opts?.gestureId ?? currentGestureId() ?? newGestureId(type);
    const canonical = this.aliasToCanonical.get(type);
    if (canonical && !this.warnedAliases.has(type)) {
      this.warnedAliases.add(type);
      console.warn(
        `[CommandBus] §FIX-COMMAND-NAMESPACE — '${type}' is a DEPRECATED alias for '${canonical}'. Update the call site; the alias will be removed once the naming ratchet reaches zero (L-796).`
      );
    }
    const ctx = this.buildContext(handler);
    const _p = payload;
    const remoteOrigin = opts?.suppressUndo === true || typeof _p === "object" && _p !== null && _p["_remoteSync"] === true;
    const suppressUndo = remoteOrigin;
    const executionContext = opts?.context;
    const consumedPlan = opts?.plan;
    return withSpan(
      "pryzm.command.execute",
      {
        "pryzm.command.type": handler.type,
        "pryzm.command.affected_stores": handler.affectedStores.join(",")
      },
      async () => {
        const validation = handler.canExecute(ctx, payload);
        if (!validation.valid) {
          throw new CommandBusError(
            `${handler.type}: canExecute rejected — ${validation.reason}`
          );
        }
        const _runHandler = () => handler.execute(ctx, payload);
        const result = await withGestureId(gestureId, () => remoteOrigin ? withRemoteOrigin(_runHandler) : _runHandler());
        const capturedAt = ctx.audit.timestamp;
        const stores = handler.affectedStores;
        if (result.forward.length > 0 || result.inverse.length > 0) {
          if (stores.length === 0) {
            console.error(
              `[CommandBus] §U-B6 UNDO-ROUTING BUG: handler "${handler.type}" produced ${result.forward.length} forward patch(es) but declares NO affectedStores → they are dropped from undo routing (Ctrl+Z will not restore them). Declare affectedStores.`
            );
          } else if (stores.length > 1) {
            const declared = new Set(stores);
            const offending = /* @__PURE__ */ new Set();
            for (const p of result.forward) {
              const r = String(p.path[0]);
              if (r && !declared.has(r)) offending.add(r);
            }
            for (const p of result.inverse) {
              const r = String(p.path[0]);
              if (r && !declared.has(r)) offending.add(r);
            }
            if (offending.size > 0) {
              console.error(
                `[CommandBus] §U-B6 UNDO-ROUTING BUG: handler "${handler.type}" wrote to undeclared store(s) [${[...offending].join(", ")}] (declared: [${[...declared].join(", ")}]). Those patches are dropped from undo routing → Ctrl+Z applies an incomplete inverse. Add them to affectedStores.`
              );
            }
          }
        }
        const stripStoreKey = (p) => ({ ...p, path: p.path.slice(1) });
        const patches = stores.length === 0 ? [] : stores.length === 1 ? [{
          storeKey: stores[0],
          forwardPatches: result.forward,
          inversePatches: result.inverse,
          capturedAt
        }] : stores.map((storeKey) => ({
          storeKey,
          forwardPatches: result.forward.filter((p) => String(p.path[0]) === storeKey).map(stripStoreKey),
          inversePatches: result.inverse.filter((p) => String(p.path[0]) === storeKey).map(stripStoreKey),
          capturedAt
        }));
        const record = {
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
          ...executionContext !== void 0 ? { context: executionContext } : {},
          // ADR-0322 §2 (R4) — the consumed plan rides the record verbatim,
          // conditionally spread for the same byte-identity reason as above.
          ...consumedPlan !== void 0 ? { plan: consumedPlan } : {},
          // C80 §1.4 (GEN-GAP-1) — a handler's typed decision NOT to act rides
          // the record verbatim, conditionally spread for the same byte-identity
          // reason as the two above: a handler that did not refuse produces a
          // record WITHOUT the property, so every legacy record is unchanged.
          // The bus does not branch on it — refusing is the HANDLER's decision
          // and reporting it is the CALLER's; the bus only carries it, which is
          // what makes the refusal a value the caller can read instead of a
          // throw a `catch {}` can swallow (C80 §10.f).
          ...result.refusal !== void 0 ? { refusal: result.refusal } : {},
          // C71 §4.4 (L-INV-1) — the QUERY answer rides the record verbatim,
          // conditionally spread for the same byte-identity reason as the
          // three above. The bus does not branch on it: what a query found is
          // the HANDLER's determination and rendering it is the CALLER's; the
          // bus only carries it, which is what lets `findings: []` be read as
          // "zero results in `checked`" instead of being indistinguishable
          // from a verb that never ran.
          ...result.report !== void 0 ? { report: result.report } : {}
        };
        this.emitter.emit(record);
        const isEmptyPatchRecord = result.forward.length === 0 && result.inverse.length === 0;
        const skipLegacyUndo = suppressUndo;
        const skipRingBuffer = suppressUndo || isEmptyPatchRecord;
        if (!skipLegacyUndo) this.undoStack.push(record);
        if (this._ringBuffer && !skipRingBuffer) {
          try {
            this._ringBuffer.push({
              forward: {
                // Sprint A33 (C03 §4.1): `op` MUST be preserved — `patchSideToImmer()`
                // needs it to reconstruct Immer-compatible Patch[] for `applyPatches`.
                ops: record.forward.map((p) => ({ op: p.op, path: toJsonPointer(p.path), value: p.value }))
              },
              inverse: {
                ops: record.inverse.map((p) => ({ op: p.op, path: toJsonPointer(p.path), value: p.value }))
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
              // §UNDO-HISTORY-DROPDOWN (ADR-0341) — WHAT the user did, in the
              // one vocabulary that distinguishes create from delete from move
              // within the same store. `affectedStores` can only ever say
              // "wall"; `record.type` says `wall.create`, and it was already in
              // hand here. Label data ONLY — nothing on the undo path reads it,
              // so an entry pushed without it routes byte-identically.
              commandType: record.type
            });
          } catch (err) {
            console.error("[CommandBus] RingBufferUndoStack push failed for type=" + record.type + ":", err);
          }
        }
        if (this._crdtApplier) {
          try {
            this._crdtApplier(record.type, record.payload);
          } catch (err) {
            console.error(
              "[CommandBus] CRDT applier error (type=" + record.type + "):",
              err
            );
          }
        }
        return record;
      }
    );
  }
}

const NODE_EPSILON_DEFAULT = 1e-3;
function nearlyEqual(a, b, eps) {
  return Math.abs(a - b) <= eps;
}
function findOrAddNode(nodes, x, z, eps) {
  for (const n of nodes) {
    if (nearlyEqual(n.x, x, eps) && nearlyEqual(n.z, z, eps)) return n;
  }
  const fresh = { id: nodes.length, x, z, out: [] };
  nodes.push(fresh);
  return fresh;
}
function buildGraph(walls, eps) {
  const nodes = [];
  const edges = [];
  let nextEdgeId = 0;
  for (const w of walls) {
    const [a, b] = w.baseLine;
    if (a === void 0 || b === void 0) continue;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    if (Math.hypot(dx, dz) < eps) continue;
    const na = findOrAddNode(nodes, a.x, a.z, eps);
    const nb = findOrAddNode(nodes, b.x, b.z, eps);
    const fwd = {
      id: nextEdgeId++,
      from: na,
      to: nb,
      twin: void 0,
      angle: Math.atan2(nb.z - na.z, nb.x - na.x),
      wallId: w.id
    };
    const rev = {
      id: nextEdgeId++,
      from: nb,
      to: na,
      twin: fwd,
      angle: Math.atan2(na.z - nb.z, na.x - nb.x),
      wallId: w.id
    };
    fwd.twin = rev;
    na.out.push(fwd);
    nb.out.push(rev);
    edges.push(fwd, rev);
  }
  for (const n of nodes) {
    n.out.sort((p, q) => p.angle - q.angle);
  }
  return { nodes, halfEdges: edges };
}
function nextFaceEdge(e) {
  const v = e.to;
  const twin = e.twin;
  if (!twin) return void 0;
  const idx = v.out.indexOf(twin);
  if (idx === -1) return void 0;
  const nextIdx = (idx - 1 + v.out.length) % v.out.length;
  return v.out[nextIdx];
}
function signedAreaOf(loop) {
  return polygonSignedAreaOrdinates(loop.length, (i) => loop[i].x, (i) => loop[i].z);
}
function extractFaces(graph) {
  const visited = /* @__PURE__ */ new Set();
  const faces = [];
  for (const start of graph.halfEdges) {
    if (visited.has(start.id)) continue;
    const halfEdges = [];
    const polygon = [];
    let curr = start;
    let safety = 0;
    while (curr !== void 0) {
      if (visited.has(curr.id)) break;
      visited.add(curr.id);
      halfEdges.push(curr);
      polygon.push({ x: curr.from.x, z: curr.from.z });
      curr = nextFaceEdge(curr);
      if (curr === start) break;
      if (++safety > 1e5) {
        throw new DescriptorInvariantError(
          `[produceRoom] face walk exceeded ${safety} steps; half-edge topology is malformed`
        );
      }
    }
    if (polygon.length < 3) continue;
    faces.push({
      halfEdges,
      polygon,
      signedArea: signedAreaOf(polygon)
    });
  }
  return faces;
}
function pointInPolygon(px, pz, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    const dz = b.z - a.z;
    if (dz === 0) continue;
    const intersects = a.z > pz !== b.z > pz && px < (b.x - a.x) * (pz - a.z) / dz + a.x;
    if (intersects) inside = !inside;
  }
  return inside;
}
function centroidOf(poly) {
  let cx = 0;
  let cz = 0;
  for (const p of poly) {
    cx += p.x;
    cz += p.z;
  }
  return { x: cx / poly.length, z: cz / poly.length };
}
function ensureCCW(poly) {
  return signedAreaOf(poly) >= 0 ? poly : [...poly].reverse();
}
function analyseRoom(room, ctx) {
  if (room.boundaryMode === "sketched") {
    const polygon2 = ensureCCW(room.boundary.map((p) => ({ x: p.x, z: p.z })));
    return {
      polygon: polygon2,
      area: Math.abs(signedAreaOf(polygon2)),
      perimeter: perimeterOf(polygon2),
      centroid: centroidOf(polygon2),
      boundingWallIds: []
    };
  }
  const seed = room.seedPoint;
  if (seed === null) {
    throw new DescriptorInvariantError(
      `[produceRoom] room ${room.id} has boundaryMode='wallBound' but no seedPoint; cannot flood-fill`
    );
  }
  const walls = ctx.walls.filter((w) => w.levelId === room.levelId);
  if (walls.length === 0) {
    throw new DescriptorInvariantError(
      `[produceRoom] room ${room.id} (level ${room.levelId}) has no walls on its level; boundary is undefined`
    );
  }
  const eps = ctx.nodeEpsilon ?? NODE_EPSILON_DEFAULT;
  const graph = buildGraph(walls, eps);
  const faces = extractFaces(graph);
  let chosen;
  for (const f of faces) {
    if (f.signedArea <= 0) continue;
    if (pointInPolygon(seed.x, seed.z, f.polygon)) {
      chosen = f;
      break;
    }
  }
  if (!chosen) {
    throw new DescriptorInvariantError(
      `[produceRoom] room ${room.id}: seed point (${seed.x.toFixed(3)}, ${seed.z.toFixed(3)}) is not enclosed by any wall face on level ${room.levelId}; the room is unenclosed`
    );
  }
  const polygon = ensureCCW(chosen.polygon);
  const wallIds = [];
  const seenWallIds = /* @__PURE__ */ new Set();
  for (const he of chosen.halfEdges) {
    if (seenWallIds.has(he.wallId)) continue;
    seenWallIds.add(he.wallId);
    wallIds.push(he.wallId);
  }
  return {
    polygon,
    area: Math.abs(signedAreaOf(polygon)),
    perimeter: perimeterOf(polygon),
    centroid: centroidOf(polygon),
    boundingWallIds: wallIds
  };
}
function perimeterOf(poly) {
  let p = 0;
  for (let i = 0, n = poly.length; i < n; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % n];
    p += Math.hypot(b.x - a.x, b.z - a.z);
  }
  return p;
}

function describeFloorFinishRenderLimit() {
  return "the 3-D view paints a floor finish as its material COLOUR plus a plank/tile grid — it does not bind the material's texture maps (FloorPanelBuilder has no map binding), so the photographic or procedural pattern itself will not appear";
}

const DEFAULT_ANNOTATION_STYLE = Object.freeze({
  lineWeight: 0.35,
  lineColor: "#1a2035",
  textSizeMm: 2.5,
  textColor: "#1a2035",
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  arrowStyle: "filled",
  arrowSizeMm: 2
});
const ANNOTATION_CATEGORY_BY_FAMILY = Object.freeze({
  "linear-dim": "dimension",
  "angular-dim": "dimension",
  "radius-dim": "dimension",
  "diameter-dim": "dimension",
  "slope-dim": "dimension",
  "spot-elevation": "dimension",
  "text-note": "text",
  "keynote": "text",
  "detail-line": "text",
  "tag": "tag",
  "door-tag": "tag",
  "window-tag": "tag",
  "wall-tag": "tag",
  "level-tag": "tag",
  "room-tag": "tag",
  "grid-bubble": "tag",
  "level-datum-line": "tag",
  "section-grid-line": "tag",
  "roof-slope-arrow": "tag",
  "revision-cloud": "symbol",
  "matchline": "symbol",
  "north-arrow": "symbol",
  "scale-bar": "symbol",
  "section-mark": "symbol",
  "elevation-mark": "symbol",
  "callout-detail": "symbol",
  "room-fill": "symbol"
});
const ANNOTATION_DEFAULT_TYPE_BY_CATEGORY = Object.freeze({
  text: "at-note-3.5mm-charcoal",
  dimension: "at-dim-2.5mm-slate",
  tag: "at-tag-2.0mm-teal",
  symbol: "at-revision-4.0mm-crimson",
  custom: "at-note-3.5mm-charcoal"
});
function defaultAnnotationTypeIdFor(family) {
  const cat = ANNOTATION_CATEGORY_BY_FAMILY[family] ?? "custom";
  return ANNOTATION_DEFAULT_TYPE_BY_CATEGORY[cat];
}
function makeAnnotationElement(id, type, ownerViewId, references, geometry2D, parameters = {}, style = {}, semantics, systemTypeId) {
  const now = Date.now();
  return {
    id,
    type,
    systemTypeId: systemTypeId ?? defaultAnnotationTypeIdFor(type),
    ownerViewId,
    references,
    geometry2D,
    style,
    parameters,
    isDriving: false,
    ...{},
    createdAt: now,
    updatedAt: now
  };
}

function resolveWallSideFinish(wall, side) {
  const override = wall.sideFinishes?.[side];
  if (override?.materialId) {
    return {
      side,
      source: "override",
      materialId: override.materialId,
      materialColor: override.materialColor ?? null,
      materialName: override.materialName ?? null
    };
  }
  const wanted = `finish-${side}`;
  const layer = wall.layers?.find((l) => l.function === wanted);
  if (layer && (layer.materialId || layer.materialColor)) {
    return {
      side,
      source: "layer",
      materialId: layer.materialId ?? null,
      materialColor: layer.materialColor ?? null,
      materialName: layer.name ?? null
    };
  }
  return { side, source: "none", materialId: null, materialColor: null, materialName: null };
}
function withWallSideFinish(wall, side, finish) {
  const prev = wall.sideFinishes;
  const next = {};
  const other = side === "interior" ? "exterior" : "interior";
  if (prev?.[other]) next[other] = { ...prev[other] };
  next[side] = { ...finish };
  return next;
}
function maskedSideAfterSetting(wall, side, next) {
  const n = wall.layers?.length ?? 0;
  if (n > 1) return null;
  const after = withWallSideFinish(wall, side, next);
  if (!after.interior?.materialColor || !after.exterior?.materialColor) return null;
  return "interior";
}
function describeSingleLayerRenderLimit() {
  return "Both finishes are saved, but this wall has a single layer — its two faces are one surface in the 3D view, so only the exterior finish is painted there. Add a layer (Wall Type → Layers) to show them separately.";
}
function authoriseRoomScopedSideFinish(wallId, boundingRoomCount) {
  if (boundingRoomCount === null) {
    return {
      ok: false,
      reason: "SIDE_CLASSIFICATION_UNKNOWN",
      text: `wall ${wallId}: which rooms this wall bounds was not recorded, so I cannot tell which of its two faces looks into the room you named. Set that face from the wall's property panel (Interior / Exterior finish), where you choose it explicitly.`
    };
  }
  if (boundingRoomCount >= 2) {
    return {
      ok: false,
      reason: "SIDE_CLASSIFICATION_UNKNOWN",
      text: `wall ${wallId}: this wall separates ${boundingRoomCount} rooms, so BOTH of its faces are interior ones. Which face looks into the room you named is recorded in frontSide/backSide, and nothing in this build ever sets them — so I will not guess and risk re-finishing the room next door. Set that face from the wall's property panel (Interior / Exterior finish), where you choose it explicitly.`
    };
  }
  return { ok: true };
}

class UpdateCeilingLayersCommand {
  constructor(_payload) {
    this._payload = _payload;
    this.id = `cmd-ceiling-layers-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    this.timestamp = Date.now();
    this.targetIds = [_payload.ceilingId];
  }
  _payload;
  affectedStores = ["ceiling"];
  id;
  type = CommandType.UPDATE_CEILING_LAYERS;
  timestamp;
  targetIds;
  _prevSnapshot;
  canExecute(context) {
    const { ceilingStore } = context.stores;
    if (!ceilingStore) return { ok: false, reason: "CeilingStore not available." };
    if (!ceilingStore.has(this._payload.ceilingId)) {
      return { ok: false, reason: `Ceiling "${this._payload.ceilingId}" not found.` };
    }
    if (!Array.isArray(this._payload.layers) || this._payload.layers.length === 0) {
      return { ok: false, reason: "Layer stack must have at least one layer." };
    }
    if (this._payload.thickness <= 0) {
      return { ok: false, reason: "Total thickness must be positive." };
    }
    return { ok: true };
  }
  execute(context) {
    const { ceilingStore } = context.stores;
    if (!ceilingStore) throw new Error("[UpdateCeilingLayersCommand] CeilingStore not available.");
    const existing = ceilingStore.getById(this._payload.ceilingId);
    if (!existing) throw new Error(`[UpdateCeilingLayersCommand] Ceiling "${this._payload.ceilingId}" not found.`);
    this._prevSnapshot = structuredClone(existing);
    const updated = ceilingStore.update(this._payload.ceilingId, {
      systemTypeId: this._payload.systemTypeId ?? void 0,
      layers: structuredClone(this._payload.layers),
      boundary: {
        ...existing.boundary,
        thickness: parseFloat(this._payload.thickness.toFixed(6))
      }
    });
    if (!updated) {
      return { success: false, affectedElementIds: [], error: "Update failed — see CeilingStore warnings." };
    }
    return {
      success: true,
      affectedElementIds: [this._payload.ceilingId],
      info: [`Ceiling ${this._payload.ceilingId} layers updated (${this._payload.layers.length} layers, ${(this._payload.thickness * 1e3).toFixed(0)}mm total)`]
    };
  }
  undo(context) {
    const { ceilingStore } = context.stores;
    if (!ceilingStore) throw new Error("[UpdateCeilingLayersCommand.undo] CeilingStore not available.");
    if (!this._prevSnapshot) {
      console.warn("[UpdateCeilingLayersCommand.undo] No snapshot — cannot undo.");
      return { success: false, affectedElementIds: [] };
    }
    ceilingStore.remove(this._payload.ceilingId);
    ceilingStore.restoreSnapshot(this._prevSnapshot);
    return { success: true, affectedElementIds: [this._payload.ceilingId] };
  }
  serialize() {
    return {
      type: this.type,
      payload: { ...this._payload },
      targetIds: this.targetIds,
      timestamp: this.timestamp,
      version: 1
    };
  }
}

let _cachedTracer$g = null;
function _tracer$m() {
  _cachedTracer$g ??= trace.getTracer("@pryzm/command-registry", "0.1.0");
  return _cachedTracer$g;
}
const CEILING_TYPE_DOMAIN_NOISE = ["ceiling", "ceilings", "type", "the", "a"];
function resolveCeilingSystemTypeRef(catalogue, ref) {
  return resolveCatalogueRef(catalogue, ref, {
    domainNoise: CEILING_TYPE_DOMAIN_NOISE,
    spanDomain: "pryzm.ceiling.systemType"
  }).entry;
}
function ceilingSystemTypeNames(catalogue) {
  return catalogue.getAll().map((t) => t.name);
}
class UpdateCeilingsSystemTypeBatchCommand {
  constructor(input) {
    this.input = input;
    this.targetIds = input.ceilingIds === "all" ? [] : [...input.ceilingIds];
  }
  input;
  affectedStores = ["ceiling"];
  id = crypto.randomUUID();
  type = CommandType.UPDATE_CEILINGS_SYSTEM_TYPE_BATCH;
  timestamp = Date.now();
  targetIds;
  executedChildren = [];
  _skipped = [];
  get skipped() {
    return this._skipped;
  }
  _resolveCeilingIds(ctx) {
    if (this.input.ceilingIds === "all") {
      return (ctx.stores.ceilingStore?.getAll() ?? []).map((c) => c.id);
    }
    return Array.from(new Set(this.input.ceilingIds));
  }
  _child(ceilingId, type) {
    return new UpdateCeilingLayersCommand({
      ceilingId,
      systemTypeId: type.id,
      layers: structuredClone(type.layers),
      thickness: type.totalThickness
    });
  }
  /** The project's ceiling catalogue, or null when the host threaded none —
   *  a missing catalogue is a REFUSAL, never a guess. */
  _catalogue(ctx) {
    return ctx.stores.ceilingSystemTypeStore ?? null;
  }
  canExecute(ctx) {
    const catalogue = this._catalogue(ctx);
    if (catalogue === null) {
      return { ok: false, reason: "The ceiling type catalogue is not available here." };
    }
    const type = resolveCeilingSystemTypeRef(catalogue, this.input.systemType);
    if (type === null) {
      return {
        ok: false,
        reason: `There is no ceiling type called "${this.input.systemType}". The ceiling types here are: ${ceilingSystemTypeNames(catalogue).join(", ")}.`
      };
    }
    if (type.layers.length === 0 || type.totalThickness <= 0) {
      return {
        ok: false,
        reason: `The ceiling type "${type.name}" has no layer stack to apply.`
      };
    }
    const ids = this._resolveCeilingIds(ctx);
    if (ids.length === 0) {
      return {
        ok: false,
        reason: this.input.ceilingIds === "all" ? "There are no ceilings in this project to retype." : "No ceilings selected — select at least one ceiling first."
      };
    }
    const refusals = [];
    let acceptable = 0;
    for (const id of ids) {
      const v = this._child(id, type).canExecute(ctx);
      if (v.ok) acceptable++;
      else refusals.push(childRefusalText(v.reason, "UpdateCeilingLayersCommand.canExecute", `ceiling ${id}`));
    }
    if (acceptable === 0) {
      return {
        ok: false,
        reason: `None of the ${ids.length} ceiling${ids.length === 1 ? "" : "s"} can become "${type.name}" — ${refusals[0]}`
      };
    }
    return { ok: true, warnings: refusals.length > 0 ? refusals : void 0 };
  }
  execute(ctx) {
    return _tracer$m().startActiveSpan("pryzm.ceiling.updateSystemType.batch", (span) => {
      try {
        this.executedChildren = [];
        this._skipped = [];
        const catalogue = this._catalogue(ctx);
        if (catalogue === null) {
          return {
            success: false,
            affectedElementIds: [],
            info: ["The ceiling type catalogue is not available here."]
          };
        }
        const type = resolveCeilingSystemTypeRef(catalogue, this.input.systemType);
        if (type === null) {
          const reason = `There is no ceiling type called "${this.input.systemType}". The ceiling types here are: ${ceilingSystemTypeNames(catalogue).join(", ")}.`;
          return { success: false, affectedElementIds: [], info: [reason] };
        }
        const ids = this._resolveCeilingIds(ctx);
        this.targetIds = [...ids];
        const affected = [];
        for (const id of ids) {
          const child = this._child(id, type);
          const v = child.canExecute(ctx);
          if (!v.ok) {
            this._skipped.push({ ceilingId: id, reason: childRefusalText(v.reason, "UpdateCeilingLayersCommand.canExecute", `ceiling ${id}`) });
            continue;
          }
          let r;
          try {
            r = child.execute(ctx);
          } catch (e) {
            this._skipped.push({ ceilingId: id, reason: e.message });
            continue;
          }
          if (r.success) {
            this.executedChildren.push(child);
            affected.push(id);
          } else {
            this._skipped.push({ ceilingId: id, reason: childRefusalText(r.info?.[0], "UpdateCeilingLayersCommand.execute", `ceiling ${id}`) });
          }
        }
        const total = ids.length;
        const changed = affected.length;
        const skippedCount = this._skipped.length;
        const reasonCounts = /* @__PURE__ */ new Map();
        for (const s of this._skipped) {
          reasonCounts.set(s.reason, (reasonCounts.get(s.reason) ?? 0) + 1);
        }
        const reasonLines = [...reasonCounts.entries()].map(
          ([reason, count]) => `${count}× ${reason}`
        );
        const summary = `Retyped ${changed} of ${total} ceiling${total === 1 ? "" : "s"} to "${type.name}" (${(type.totalThickness * 1e3).toFixed(0)}mm)` + (skippedCount > 0 ? ` — ${skippedCount} skipped` : "");
        span.setAttribute("pryzm.ceiling.typeBatch.total", total);
        span.setAttribute("pryzm.ceiling.typeBatch.changed", changed);
        span.setAttribute("pryzm.ceiling.typeBatch.skipped", skippedCount);
        span.setAttribute("pryzm.ceiling.typeBatch.scope", this.input.ceilingIds === "all" ? "all" : "ids");
        return {
          success: changed > 0,
          affectedElementIds: affected,
          info: [summary, ...reasonLines]
        };
      } catch (err) {
        span.recordException(err);
        throw err;
      } finally {
        span.end();
      }
    });
  }
  undo(ctx) {
    const affected = [];
    for (let i = this.executedChildren.length - 1; i >= 0; i--) {
      const child = this.executedChildren[i];
      if (!child) continue;
      const r = child.undo(ctx);
      if (r.success) affected.push(...r.affectedElementIds);
    }
    return { success: true, affectedElementIds: affected };
  }
  serialize() {
    return {
      type: this.type,
      targetIds: this.targetIds,
      timestamp: this.timestamp,
      version: 1,
      payload: this.input
    };
  }
  static deserialize(serialized) {
    return new UpdateCeilingsSystemTypeBatchCommand(
      serialized.payload
    );
  }
}

class ReplacePanelTypeCommand {
  constructor(payload) {
    this.payload = payload;
    this.targetIds = [payload.panelId];
  }
  payload;
  // §CURTAIN-WALL-AUDIT-2026 §13 — this command mutates the panel store only.
  // The transitive parent re-render is driven by the panel-store subscriber in
  // EngineBootstrap (see §3.8 / §MI-02), so declaring "curtainWall" here would
  // wrongly bus this mutation to wall-shape subscribers and double-fire renders.
  affectedStores = ["curtainPanel"];
  id = crypto.randomUUID();
  type = CommandType.REPLACE_CURTAIN_PANEL_TYPE;
  timestamp = Date.now();
  targetIds;
  previousPanelType = null;
  previousMaterialOverride = void 0;
  /** §CW-2 — captured only when the payload actually carries an offset, so an
   *  undo cannot write `undefined` over an offset this command never touched. */
  previousOffset = void 0;
  touchedOffset = false;
  /** §CW-3 — same discipline as `touchedOffset`: snapshot ONLY what this
   *  dispatch wrote, so an undo cannot revert a door some other command set. */
  previousHostedDoor = void 0;
  touchedHostedDoor = false;
  /** §FEAT-CW-PANEL-MATERIAL-CONTROL — same discipline as `touchedOffset`.
   *  ⛔ Note `previousMaterialOverride` above is captured UNCONDITIONALLY and is
   *  the older, weaker pattern; do not copy it for new fields. */
  previousMaterialId = void 0;
  touchedMaterialId = false;
  canExecute(context) {
    if (!isValidPanelType(this.payload.newPanelType)) {
      return {
        ok: false,
        // §CW-Voc-3 — GENERATED, NOT TRANSCRIBED. This named THREE members while
        // `isValidPanelType` validates against THIRTEEN, so a user told
        // "valid values: Glass, Opaque, Empty" could not discover the ten that
        // would have worked. Same defect as `ReplacePanel.ts:77-79` (fixed
        // 648b443d) — a hand-written copy of a union is C84 EI-8a's failure mode.
        reason: `'${this.payload.newPanelType}' is not a valid PanelType. Valid values: ${VALID_PANEL_TYPES.join(", ")}`
      };
    }
    const panelStore = context.stores.curtainPanelStore;
    if (!panelStore) {
      return { ok: false, reason: "CurtainPanelStore is not available in CommandContext" };
    }
    const panel = panelStore.get(this.payload.panelId);
    if (!panel) {
      return { ok: false, reason: `Panel '${this.payload.panelId}' not found` };
    }
    return { ok: true };
  }
  execute(context) {
    const panelStore = context.stores.curtainPanelStore;
    if (!panelStore) throw new Error("[ReplacePanelTypeCommand] CurtainPanelStore not available in CommandContext");
    const panel = panelStore.get(this.payload.panelId);
    if (!panel) throw new Error(`Panel '${this.payload.panelId}' not found`);
    this.previousPanelType = panel.panelType;
    this.previousMaterialOverride = panel.materialOverride;
    const updates = { panelType: this.payload.newPanelType };
    if (this.payload.materialOverride !== void 0) {
      updates.materialOverride = this.payload.materialOverride ?? void 0;
    }
    if (this.payload.offsetFromCentreline !== void 0) {
      this.previousOffset = panel.offsetFromCentreline;
      this.touchedOffset = true;
      updates.offsetFromCentreline = this.payload.offsetFromCentreline;
    }
    if (this.payload.materialId !== void 0) {
      this.previousMaterialId = panel.materialId;
      this.touchedMaterialId = true;
      updates.materialId = this.payload.materialId ?? void 0;
    }
    if (this.payload.hostedDoor !== void 0) {
      this.previousHostedDoor = panel.hostedDoor;
      this.touchedHostedDoor = true;
      updates.hostedDoor = this.payload.hostedDoor === null ? void 0 : { ...DEFAULT_HOSTED_DOOR, ...panel.hostedDoor ?? {}, ...this.payload.hostedDoor };
    } else if (this.payload.newPanelType === "SystemPanel_Door" && !panel.hostedDoor) {
      this.previousHostedDoor = panel.hostedDoor;
      this.touchedHostedDoor = true;
      updates.hostedDoor = { ...DEFAULT_HOSTED_DOOR };
    }
    panelStore.update(this.payload.panelId, updates);
    return { success: true, affectedElementIds: [this.payload.panelId, panel.curtainWallId] };
  }
  undo(context) {
    if (this.previousPanelType === null) {
      return { success: false, affectedElementIds: [], error: "No snapshot available for undo" };
    }
    const panelStore = context.stores.curtainPanelStore;
    if (!panelStore) return { success: false, affectedElementIds: [], error: "CurtainPanelStore not available in CommandContext" };
    const panel = panelStore.get(this.payload.panelId);
    if (!panel) return { success: false, affectedElementIds: [], error: `Panel '${this.payload.panelId}' not found` };
    panelStore.update(this.payload.panelId, {
      panelType: this.previousPanelType,
      materialOverride: this.previousMaterialOverride,
      // §CW-2 — restored only if execute() actually changed it. See execute().
      ...this.touchedOffset ? { offsetFromCentreline: this.previousOffset } : {},
      ...this.touchedHostedDoor ? { hostedDoor: this.previousHostedDoor } : {},
      ...this.touchedMaterialId ? { materialId: this.previousMaterialId } : {}
    });
    return { success: true, affectedElementIds: [this.payload.panelId, panel.curtainWallId] };
  }
  serialize() {
    return {
      type: this.type,
      targetIds: this.targetIds,
      timestamp: this.timestamp,
      version: 1,
      payload: this.payload
    };
  }
}

let _cachedTracer$f = null;
function _tracer$l() {
  _cachedTracer$f ??= trace.getTracer("@pryzm/command-registry", "0.1.0");
  return _cachedTracer$f;
}
const TARGET_FIELD = {
  carcass: "carcassMaterialId",
  doorFront: "frontMaterialId",
  countertop: "countertopMaterialId"
};
const TARGET_LABEL = {
  carcass: "carcass body",
  doorFront: "door/front",
  countertop: "countertop"
};
let _materialReader = null;
function materialReader() {
  if (_materialReader) return _materialReader;
  const all = STANDARD_MATERIAL_LIBRARY.map((m) => ({
    id: m.id,
    name: m.label,
    category: m.category
  }));
  _materialReader = {
    getById: (id) => all.find((m) => m.id === id),
    getAll: () => all
  };
  return _materialReader;
}
const KITCHEN_MATERIAL_DOMAIN_NOISE = [
  "material",
  "materials",
  "colour",
  "color",
  "finish",
  "carcass",
  "body",
  "door",
  "front",
  "countertop",
  "worktop",
  "counter",
  "kitchen"
];
function resolveKitchenMaterialRef(ref) {
  return resolveCatalogueRef(materialReader(), ref, {
    domainNoise: KITCHEN_MATERIAL_DOMAIN_NOISE,
    spanDomain: "pryzm.kitchen.material"
  }).entry;
}
class BulkUpdateKitchenMaterialCommand {
  constructor(input) {
    this.input = input;
    this.targetIds = input.scope.kind === "element" ? [input.scope.elementId] : [];
  }
  input;
  affectedStores = ["furniture"];
  id = crypto.randomUUID();
  type = CommandType.BULK_UPDATE_KITCHEN_MATERIAL;
  timestamp = Date.now();
  targetIds;
  /** Children that actually EXECUTED — undo replays these in reverse. */
  executedChildren = [];
  /** Refusals from the last execute() — exposed for callers that want detail. */
  _skipped = [];
  /** Skips recorded by the most recent execute() (empty before execution). */
  get skipped() {
    return this._skipped;
  }
  // ── Internals ────────────────────────────────────────────────────────────
  _furnitureStore(ctx) {
    return ctx.stores.furnitureStore;
  }
  _isKitchen(f) {
    return f !== void 0 && f !== null && f.kitchenConfig !== void 0;
  }
  /** Resolve the requested material, or `undefined` if it cannot be found. */
  _resolveMaterial() {
    return resolveKitchenMaterialRef(this.input.materialRef) ?? void 0;
  }
  /** Resolve the kitchen ids the scope reaches. Never throws. */
  _resolveKitchenIds(ctx) {
    const store = this._furnitureStore(ctx);
    const kitchens = store.getAll().filter((f) => this._isKitchen(f));
    const scope = this.input.scope;
    if (scope.kind === "element") {
      return kitchens.filter((f) => f.id === scope.elementId).map((f) => f.id);
    }
    if (scope.kind === "level") {
      return kitchens.filter((f) => f.levelId === scope.levelId).map((f) => f.id);
    }
    return kitchens.map((f) => f.id);
  }
  _scopeLabel() {
    const scope = this.input.scope;
    if (scope.kind === "element") return "the selected kitchen";
    if (scope.kind === "level") return `the kitchens on level "${scope.levelId}"`;
    return "the kitchens in this project";
  }
  /** Honest reason for a scope that resolves to zero kitchens — distinguishes
   *  "nothing there" from "that element exists but isn't a kitchen". */
  _emptyScopeReason(ctx) {
    const scope = this.input.scope;
    if (scope.kind === "element") {
      const f = this._furnitureStore(ctx).get(scope.elementId);
      if (f === void 0) return `No element found with id "${scope.elementId}".`;
      return `Element "${scope.elementId}" is not a kitchen (furnitureType "${f.furnitureType ?? "unknown"}") — nothing to change.`;
    }
    if (scope.kind === "level") {
      return `There are no kitchens on level "${scope.levelId}" to change.`;
    }
    return "There are no kitchens in this project to change.";
  }
  /** Build the single-kitchen child (REUSE of the proven single-element path).
   *  Reads the kitchen's CURRENT kitchenConfig and spreads it — see the file
   *  header: the child command REPLACES kitchenConfig wholesale, so a bare
   *  `{ [field]: materialId }` patch would erase every other field. */
  _child(ctx, kitchenId, materialId) {
    const furniture = this._furnitureStore(ctx).get(kitchenId);
    const field = TARGET_FIELD[this.input.target];
    const kitchenConfig = { ...furniture?.kitchenConfig ?? {}, [field]: materialId };
    return new UpdateFurnitureParametersCommand({ id: kitchenId, kitchenConfig });
  }
  _valueLabel(material) {
    return `${TARGET_LABEL[this.input.target]} to "${material.name}"`;
  }
  // ── Command surface ──────────────────────────────────────────────────────
  canExecute(ctx) {
    const material = this._resolveMaterial();
    if (material === void 0) {
      return {
        ok: false,
        reason: `Unknown material "${this.input.materialRef}" — no material with that id or name exists in the material library.`
      };
    }
    const ids = this._resolveKitchenIds(ctx);
    if (ids.length === 0) {
      return { ok: false, reason: this._emptyScopeReason(ctx) };
    }
    const refusals = [];
    let acceptable = 0;
    for (const kitchenId of ids) {
      const v = this._child(ctx, kitchenId, material.id).canExecute(ctx);
      if (v.ok) acceptable++;
      else refusals.push(childRefusalText(v.reason, "UpdateFurnitureParametersCommand.canExecute", `kitchen ${kitchenId}`));
    }
    if (acceptable === 0) {
      return {
        ok: false,
        reason: `None of the ${ids.length} kitchen${ids.length === 1 ? "" : "s"} in ${this._scopeLabel()} can take ${this._valueLabel(material)} — ${refusals[0]}`
      };
    }
    return { ok: true, warnings: refusals.length > 0 ? refusals : void 0 };
  }
  execute(ctx) {
    return _tracer$l().startActiveSpan("pryzm.kitchen.updateMaterial.batch", (span) => {
      try {
        this.executedChildren = [];
        this._skipped = [];
        const material = this._resolveMaterial();
        if (material === void 0) {
          span.setAttribute("pryzm.kitchen.materialBatch.unresolvedMaterial", true);
          return {
            success: false,
            affectedElementIds: [],
            info: [`Unknown material "${this.input.materialRef}".`]
          };
        }
        const ids = this._resolveKitchenIds(ctx);
        if (ids.length === 0) {
          return { success: false, affectedElementIds: [], info: [this._emptyScopeReason(ctx)] };
        }
        this.targetIds = [...ids];
        const affected = [];
        for (const kitchenId of ids) {
          const child = this._child(ctx, kitchenId, material.id);
          const v = child.canExecute(ctx);
          if (!v.ok) {
            this._skipped.push({ kitchenId, reason: childRefusalText(v.reason, "UpdateFurnitureParametersCommand.canExecute", `kitchen ${kitchenId}`) });
            continue;
          }
          const r = child.execute(ctx);
          if (r.success) {
            this.executedChildren.push(child);
            affected.push(kitchenId);
          } else {
            this._skipped.push({
              kitchenId,
              reason: childRefusalText(r.info?.[0], "UpdateFurnitureParametersCommand.execute", `kitchen ${kitchenId}`)
            });
          }
        }
        const total = ids.length;
        const changed = affected.length;
        const skippedCount = this._skipped.length;
        const reasonCounts = /* @__PURE__ */ new Map();
        for (const s of this._skipped) {
          reasonCounts.set(s.reason, (reasonCounts.get(s.reason) ?? 0) + 1);
        }
        const reasonLines = [...reasonCounts.entries()].map(
          ([reason, count]) => `${count}× ${reason}`
        );
        const summary = `Changed ${changed} of ${total} kitchen${total === 1 ? "'s" : "s'"} ${this._valueLabel(material)}` + (skippedCount > 0 ? ` — ${skippedCount} skipped` : "");
        span.setAttribute("pryzm.kitchen.materialBatch.total", total);
        span.setAttribute("pryzm.kitchen.materialBatch.changed", changed);
        span.setAttribute("pryzm.kitchen.materialBatch.skipped", skippedCount);
        span.setAttribute("pryzm.kitchen.materialBatch.target", this.input.target);
        span.setAttribute("pryzm.kitchen.materialBatch.scope", this.input.scope.kind);
        return {
          // Success iff at least one kitchen changed; the all-refused case
          // is normally intercepted by canExecute, but execute() re-checks
          // against live state and reports rather than throwing.
          success: changed > 0,
          affectedElementIds: affected,
          info: [summary, ...reasonLines]
        };
      } catch (err) {
        span.recordException(err);
        throw err;
      } finally {
        span.end();
      }
    });
  }
  undo(ctx) {
    const affected = [];
    for (let i = this.executedChildren.length - 1; i >= 0; i--) {
      const child = this.executedChildren[i];
      if (!child) continue;
      const r = child.undo(ctx);
      if (r.success) affected.push(...r.affectedElementIds);
    }
    return { success: true, affectedElementIds: affected };
  }
  serialize() {
    return {
      type: this.type,
      targetIds: this.targetIds,
      timestamp: this.timestamp,
      version: 1,
      payload: this.input
    };
  }
  static deserialize(serialized) {
    return new BulkUpdateKitchenMaterialCommand(
      serialized.payload
    );
  }
}

let _cachedTracer$e = null;
function _tracer$k() {
  _cachedTracer$e ??= trace.getTracer("@pryzm/command-registry", "0.1.0");
  return _cachedTracer$e;
}
class BulkUpdateCurtainPanelsCommand {
  constructor(input) {
    this.input = input;
    this.targetIds = input.scope.kind === "element" ? [input.scope.elementId] : [];
  }
  input;
  affectedStores = ["curtainPanel"];
  id = crypto.randomUUID();
  type = CommandType.BULK_UPDATE_CURTAIN_PANELS;
  timestamp = Date.now();
  targetIds;
  /** Children that actually EXECUTED — undo replays these in reverse. */
  executedChildren = [];
  /** Refusals from the last execute() — exposed for callers that want detail. */
  _skipped = [];
  /** Grouped scope-resolution notes (host-unresolvable panels), separate from
   *  per-panel execution skips because they name a COUNT of panels the scope
   *  stage itself excluded, not a `ReplacePanelTypeCommand.canExecute` verdict. */
  _scopeNotes = [];
  /** Skips recorded by the most recent execute() (empty before execution). */
  get skipped() {
    return this._skipped;
  }
  // ── Internals ────────────────────────────────────────────────────────────
  _resolveChange() {
    const change = this.input.change;
    if (change.kind === "type") {
      if (!isValidPanelType(change.panelType)) {
        return {
          error: `'${change.panelType}' is not a known curtain-panel type. Valid values: ${VALID_PANEL_TYPES.join(", ")}`
        };
      }
      return { panelType: change.panelType };
    }
    const hit = resolveKitchenMaterialRef(change.materialRef);
    if (hit === null) {
      return {
        error: `I don't know a material called "${change.materialRef}". The materials I can resolve are the project's C100 material library (e.g. by id or name — "marble", "oak", "composite decking").`
      };
    }
    return { materialId: hit.id };
  }
  /** Resolve the panel ids the scope reaches, plus any scope-level notes
   *  (grouped host-unresolvable exclusions). Never throws. */
  _resolvePanelIds(ctx) {
    const store = ctx.stores.curtainPanelStore;
    if (!store) {
      return { ids: [], notes: [], error: "The curtain-panel store is not available in this session." };
    }
    const all = store.getAll();
    const scope = this.input.scope;
    if (scope.kind === "element") {
      return { ids: all.some((p) => p.id === scope.elementId) ? [scope.elementId] : [], notes: [] };
    }
    if (scope.kind === "ids") {
      const known = new Set(all.map((p) => p.id));
      return { ids: [...new Set(scope.panelIds)].filter((id) => known.has(id)), notes: [] };
    }
    if (scope.kind === "project") {
      return { ids: all.map((p) => p.id), notes: [] };
    }
    const cwStore = ctx.stores.curtainWallStore;
    const rows = all.map((p) => ({ id: p.id, wallId: p.curtainWallId }));
    const res = resolveLevelScopeByHost(
      "curtain panel",
      rows,
      scope.levelId,
      `level "${scope.levelId}"`,
      (wallId) => {
        if (cwStore?.getById === void 0) return null;
        const cw = cwStore.getById(wallId);
        return cw === void 0 ? void 0 : cw.levelId ?? void 0;
      }
    );
    if (res.kind === "refused") return { ids: [], notes: [], error: res.error };
    return {
      ids: [...res.ids],
      notes: res.skipped.map((s) => `${s.count}× ${s.kind} excluded from the level scope: ${s.reason}`)
    };
  }
  _child(panelId, value, currentType) {
    return new ReplacePanelTypeCommand({
      panelId,
      // ReplacePanelTypeCommand always requires a type; a MATERIAL-only
      // change re-states the panel's CURRENT type so the write is a
      // genuine no-op on that field (mirrors BulkUpdateKitchenMaterialCommand
      // spreading the live kitchenConfig rather than a bare patch).
      newPanelType: value.panelType ?? currentType,
      ...value.materialId !== void 0 ? { materialId: value.materialId } : {}
    });
  }
  _changeLabel(change, resolved) {
    return change.kind === "type" ? `type "${resolved.panelType}"` : `material "${change.materialRef}" (${resolved.materialId})`;
  }
  // ── Command surface ──────────────────────────────────────────────────────
  canExecute(ctx) {
    const resolved = this._resolveChange();
    if ("error" in resolved) return { ok: false, reason: resolved.error };
    const { ids, error } = this._resolvePanelIds(ctx);
    if (error !== void 0) return { ok: false, reason: error };
    if (ids.length === 0) {
      const scope = this.input.scope;
      return {
        ok: false,
        reason: scope.kind === "project" ? "There are no curtain-wall panels in this project to change." : scope.kind === "element" ? `Panel "${scope.elementId}" was not found.` : scope.kind === "level" ? `There are no curtain-wall panels on that level.` : "No curtain-wall panels matched — nothing was changed."
      };
    }
    const store = ctx.stores.curtainPanelStore;
    const refusals = [];
    let acceptable = 0;
    for (const panelId of ids) {
      const panel = store.get(panelId);
      if (!panel) {
        refusals.push(`panel ${panelId}: no longer in the model`);
        continue;
      }
      const v = this._child(panelId, resolved, panel.panelType).canExecute(ctx);
      if (v.ok) acceptable++;
      else refusals.push(childRefusalText(v.reason, "ReplacePanelTypeCommand.canExecute", `panel ${panelId}`));
    }
    if (acceptable === 0) {
      return {
        ok: false,
        reason: `None of the ${ids.length} panel${ids.length === 1 ? "" : "s"} can take the ${this._changeLabel(this.input.change, resolved)} — ${refusals[0]}`
      };
    }
    return { ok: true, warnings: refusals.length > 0 ? refusals : void 0 };
  }
  execute(ctx) {
    return _tracer$k().startActiveSpan("pryzm.curtainWall.bulkUpdatePanels", (span) => {
      try {
        this.executedChildren = [];
        this._skipped = [];
        this._scopeNotes = [];
        const resolved = this._resolveChange();
        if ("error" in resolved) {
          span.setAttribute("pryzm.curtainWall.panelBatch.unresolvedChange", true);
          return { success: false, affectedElementIds: [], info: [resolved.error] };
        }
        const { ids, notes, error } = this._resolvePanelIds(ctx);
        this._scopeNotes = notes;
        if (error !== void 0) {
          return { success: false, affectedElementIds: [], info: [error] };
        }
        this.targetIds = [...ids];
        const store = ctx.stores.curtainPanelStore;
        const affected = [];
        for (const panelId of ids) {
          const panel = store?.get(panelId);
          if (!panel) {
            this._skipped.push({ panelId, reason: "the panel is no longer in the model" });
            continue;
          }
          const child = this._child(panelId, resolved, panel.panelType);
          const v = child.canExecute(ctx);
          if (!v.ok) {
            this._skipped.push({ panelId, reason: childRefusalText(v.reason, "ReplacePanelTypeCommand.canExecute", `panel ${panelId}`) });
            continue;
          }
          const r = child.execute(ctx);
          if (r.success) {
            this.executedChildren.push(child);
            affected.push(panelId);
          } else {
            this._skipped.push({ panelId, reason: childRefusalText(r.info?.[0], "ReplacePanelTypeCommand.execute", `panel ${panelId}`) });
          }
        }
        const total = ids.length;
        const changed = affected.length;
        const skippedCount = this._skipped.length;
        const reasonCounts = /* @__PURE__ */ new Map();
        for (const s of this._skipped) reasonCounts.set(s.reason, (reasonCounts.get(s.reason) ?? 0) + 1);
        const reasonLines = [...reasonCounts.entries()].map(([reason, count]) => `${count}× ${reason}`);
        const summary = `Changed ${changed} of ${total} curtain-wall panel${total === 1 ? "" : "s"} to ${this._changeLabel(this.input.change, resolved)}` + (skippedCount > 0 ? ` — ${skippedCount} skipped` : "");
        span.setAttribute("pryzm.curtainWall.panelBatch.total", total);
        span.setAttribute("pryzm.curtainWall.panelBatch.changed", changed);
        span.setAttribute("pryzm.curtainWall.panelBatch.skipped", skippedCount);
        span.setAttribute("pryzm.curtainWall.panelBatch.changeKind", this.input.change.kind);
        span.setAttribute("pryzm.curtainWall.panelBatch.scope", this.input.scope.kind);
        return {
          success: changed > 0,
          affectedElementIds: affected,
          info: [summary, ...reasonLines, ...this._scopeNotes]
        };
      } catch (err) {
        span.recordException(err);
        throw err;
      } finally {
        span.end();
      }
    });
  }
  undo(ctx) {
    const affected = [];
    for (let i = this.executedChildren.length - 1; i >= 0; i--) {
      const child = this.executedChildren[i];
      if (!child) continue;
      const r = child.undo(ctx);
      if (r.success) affected.push(child.targetIds[0]);
    }
    return { success: true, affectedElementIds: affected };
  }
  serialize() {
    return {
      type: this.type,
      targetIds: this.targetIds,
      timestamp: this.timestamp,
      version: 1,
      payload: this.input
    };
  }
  static deserialize(serialized) {
    return new BulkUpdateCurtainPanelsCommand(serialized.payload);
  }
}

let _cachedTracer$d = null;
function _tracer$j() {
  _cachedTracer$d ??= trace.getTracer("@pryzm/command-registry", "0.1.0");
  return _cachedTracer$d;
}
class BulkUpdateCurtainWallParameterCommand {
  constructor(input) {
    this.input = input;
    this.targetIds = input.scope.kind === "element" ? [input.scope.elementId] : [];
  }
  input;
  // C84 EI-7 — the MEASURED write set. `UpdateCurtainWallCommand` writes
  // only `curtainWallStore` for the fields this command ever passes (it
  // never sets `levelId`, so the bimManager spatial-registration branch
  // never runs — see the module header).
  affectedStores = ["curtainWall"];
  id = crypto.randomUUID();
  type = CommandType.BULK_UPDATE_CURTAIN_WALL_PARAMETER;
  timestamp = Date.now();
  targetIds;
  /** Children that actually EXECUTED — undo replays these in reverse. */
  executedChildren = [];
  _skipped = [];
  /** Skips recorded by the most recent execute() (empty before execution). */
  get skipped() {
    return this._skipped;
  }
  // ── Internals ────────────────────────────────────────────────────────────
  _resolveChange() {
    const { parameter, value } = this.input;
    if (!isCurtainWallParameterKey(parameter)) {
      return { error: unknownCurtainWallParameterRefusal(parameter) };
    }
    const violation = checkCurtainWallParameter(parameter, value);
    if (violation !== null) return { error: violation.message };
    return { key: parameter, value };
  }
  /** Resolve the curtain-wall ids the scope reaches. Never throws. */
  _resolveIds(ctx) {
    const store = ctx.stores.curtainWallStore;
    if (!store) {
      return { ids: [], error: "The curtain-wall store is not available in this session." };
    }
    const all = store.getAll();
    const scope = this.input.scope;
    if (scope.kind === "element") {
      return { ids: all.some((cw) => cw.id === scope.elementId) ? [scope.elementId] : [] };
    }
    if (scope.kind === "ids") {
      const known = new Set(all.map((cw) => cw.id));
      return { ids: [...new Set(scope.curtainWallIds)].filter((id) => known.has(id)) };
    }
    if (scope.kind === "project") {
      return { ids: all.map((cw) => cw.id) };
    }
    return { ids: all.filter((cw) => cw.levelId === scope.levelId).map((cw) => cw.id) };
  }
  _child(id, key, value) {
    return new UpdateCurtainWallCommand({ id, updates: { [key]: value } });
  }
  // ── Command surface ──────────────────────────────────────────────────────
  canExecute(ctx) {
    const resolved = this._resolveChange();
    if ("error" in resolved) return { ok: false, reason: resolved.error };
    const { ids, error } = this._resolveIds(ctx);
    if (error !== void 0) return { ok: false, reason: error };
    if (ids.length === 0) {
      const scope = this.input.scope;
      return {
        ok: false,
        reason: scope.kind === "project" ? "There are no curtain walls in this project to change." : scope.kind === "element" ? `Curtain wall "${scope.elementId}" was not found.` : scope.kind === "level" ? `There are no curtain walls on that level.` : "No curtain walls matched — nothing was changed."
      };
    }
    const store = ctx.stores.curtainWallStore;
    const refusals = [];
    let acceptable = 0;
    for (const id of ids) {
      const cw = store.get(id);
      if (!cw) {
        refusals.push(`curtain wall ${id}: no longer in the model`);
        continue;
      }
      const v = this._child(id, resolved.key, resolved.value).canExecute(ctx);
      if (v.ok) acceptable++;
      else refusals.push(childRefusalText(v.reason, "UpdateCurtainWallCommand.canExecute", `curtain wall ${id}`));
    }
    if (acceptable === 0) {
      return {
        ok: false,
        reason: `None of the ${ids.length} curtain wall${ids.length === 1 ? "" : "s"} can take the ${resolved.key} change to ${resolved.value} — ${refusals[0]}`
      };
    }
    return { ok: true, warnings: refusals.length > 0 ? refusals : void 0 };
  }
  execute(ctx) {
    return _tracer$j().startActiveSpan("pryzm.curtainWall.bulkUpdateParameter", (span) => {
      try {
        this.executedChildren = [];
        this._skipped = [];
        const resolved = this._resolveChange();
        if ("error" in resolved) {
          span.setAttribute("pryzm.curtainWall.parameterBatch.unresolvedChange", true);
          return { success: false, affectedElementIds: [], info: [resolved.error] };
        }
        const { ids, error } = this._resolveIds(ctx);
        if (error !== void 0) {
          return { success: false, affectedElementIds: [], info: [error] };
        }
        this.targetIds = [...ids];
        const store = ctx.stores.curtainWallStore;
        const affected = [];
        const childInfo = [];
        for (const id of ids) {
          const cw = store?.get(id);
          if (!cw) {
            this._skipped.push({ curtainWallId: id, reason: "the curtain wall is no longer in the model" });
            continue;
          }
          const child = this._child(id, resolved.key, resolved.value);
          const v = child.canExecute(ctx);
          if (!v.ok) {
            this._skipped.push({ curtainWallId: id, reason: childRefusalText(v.reason, "UpdateCurtainWallCommand.canExecute", `curtain wall ${id}`) });
            continue;
          }
          const r = child.execute(ctx);
          if (r.success) {
            this.executedChildren.push(child);
            affected.push(id);
            for (const line of r.info ?? []) {
              if (!childInfo.includes(line)) childInfo.push(line);
            }
          } else {
            this._skipped.push({ curtainWallId: id, reason: childRefusalText(r.info?.[0], "UpdateCurtainWallCommand.execute", `curtain wall ${id}`) });
          }
        }
        const total = ids.length;
        const changed = affected.length;
        const skippedCount = this._skipped.length;
        const reasonCounts = /* @__PURE__ */ new Map();
        for (const s of this._skipped) reasonCounts.set(s.reason, (reasonCounts.get(s.reason) ?? 0) + 1);
        const reasonLines = [...reasonCounts.entries()].map(([reason, count]) => `${count}× ${reason}`);
        const summary = `Changed ${changed} of ${total} curtain wall${total === 1 ? "" : "s"}' ${resolved.key} to ${resolved.value}` + (skippedCount > 0 ? ` — ${skippedCount} skipped` : "");
        span.setAttribute("pryzm.curtainWall.parameterBatch.total", total);
        span.setAttribute("pryzm.curtainWall.parameterBatch.changed", changed);
        span.setAttribute("pryzm.curtainWall.parameterBatch.skipped", skippedCount);
        span.setAttribute("pryzm.curtainWall.parameterBatch.parameter", resolved.key);
        span.setAttribute("pryzm.curtainWall.parameterBatch.scope", this.input.scope.kind);
        return {
          success: changed > 0,
          affectedElementIds: affected,
          info: [summary, ...reasonLines, ...childInfo]
        };
      } catch (err) {
        span.recordException(err);
        throw err;
      } finally {
        span.end();
      }
    });
  }
  undo(ctx) {
    const affected = [];
    for (let i = this.executedChildren.length - 1; i >= 0; i--) {
      const child = this.executedChildren[i];
      if (!child) continue;
      const r = child.undo(ctx);
      if (r.success) affected.push(child.targetIds[0]);
    }
    return { success: true, affectedElementIds: affected };
  }
  serialize() {
    return {
      type: this.type,
      targetIds: this.targetIds,
      timestamp: this.timestamp,
      version: 1,
      payload: this.input
    };
  }
  static deserialize(serialized) {
    return new BulkUpdateCurtainWallParameterCommand(serialized.payload);
  }
}

let _cachedTracer$c = null;
function _tracer$i() {
  _cachedTracer$c ??= trace.getTracer("@pryzm/command-registry", "0.1.0");
  return _cachedTracer$c;
}
class UpdateDoorSystemTypeCommand {
  constructor(input) {
    this.input = input;
    this.targetIds = [input.doorId];
  }
  input;
  /** Doors are hosted ON walls; the wall snapshot scope covers the opening. */
  affectedStores = ["door", "wall"];
  id = crypto.randomUUID();
  type = CommandType.UPDATE_DOOR_SYSTEM_TYPE;
  timestamp = Date.now();
  targetIds;
  /** EXACT pre-change record — the undo restores this verbatim. */
  prevSnapshot = null;
  canExecute(_ctx) {
    const door = doorStore.getById(this.input.doorId);
    if (!door) return { ok: false, reason: `Door ${this.input.doorId} not found` };
    const plan = planDoorTypeChange(door, this.input.systemTypeId);
    if (plan.blockedReason) return { ok: false, reason: plan.blockedReason };
    return { ok: true };
  }
  execute(_ctx) {
    return _tracer$i().startActiveSpan("pryzm.door.updateSystemType", (span) => {
      try {
        const door = doorStore.getById(this.input.doorId);
        if (!door) {
          span.end();
          return { success: false, affectedElementIds: [] };
        }
        const plan = planDoorTypeChange(door, this.input.systemTypeId);
        if (plan.blockedReason) {
          console.warn(plan.blockedReason);
          span.setAttribute("pryzm.door.typeChange.blocked", true);
          span.end();
          return { success: false, affectedElementIds: [], info: [plan.blockedReason] };
        }
        this.prevSnapshot = structuredClone(door);
        doorStore.update(this.input.doorId, plan.patch);
        span.setAttribute("pryzm.door.id", this.input.doorId);
        span.setAttribute("pryzm.door.systemTypeId.from", plan.from ?? "<none>");
        span.setAttribute("pryzm.door.systemTypeId.to", plan.to);
        span.end();
        return { success: true, affectedElementIds: [this.input.doorId, door.wallId] };
      } catch (err) {
        span.recordException(err);
        span.end();
        throw err;
      }
    });
  }
  undo(_ctx) {
    return _tracer$i().startActiveSpan("pryzm.door.updateSystemType.undo", (span) => {
      try {
        if (!this.prevSnapshot) {
          span.end();
          return { success: false, affectedElementIds: [] };
        }
        doorStore.replace(this.prevSnapshot);
        span.end();
        return {
          success: true,
          affectedElementIds: [this.prevSnapshot.id, this.prevSnapshot.wallId]
        };
      } catch (err) {
        span.recordException(err);
        span.end();
        throw err;
      }
    });
  }
  serialize() {
    return {
      type: this.type,
      targetIds: this.targetIds,
      timestamp: this.timestamp,
      version: 1,
      payload: { doorId: this.input.doorId, systemTypeId: this.input.systemTypeId }
    };
  }
}

let _cachedTracer$b = null;
function _tracer$h() {
  _cachedTracer$b ??= trace.getTracer("@pryzm/command-registry", "0.1.0");
  return _cachedTracer$b;
}
const DOOR_TYPE_DOMAIN_NOISE = ["door", "doors", "type", "style", "the", "a"];
function resolveDoorSystemTypeRef(ref) {
  return resolveCatalogueRef(doorSystemTypeStore, ref, {
    domainNoise: DOOR_TYPE_DOMAIN_NOISE,
    spanDomain: "pryzm.door.systemType"
  }).entry;
}
function doorSystemTypeNames() {
  return doorSystemTypeStore.getAll().map((t) => t.name);
}
class UpdateDoorsSystemTypeBatchCommand {
  constructor(input) {
    this.input = input;
    this.targetIds = input.doorIds === "all" ? [] : [...input.doorIds];
  }
  input;
  affectedStores = ["door", "wall"];
  id = crypto.randomUUID();
  type = CommandType.UPDATE_DOORS_SYSTEM_TYPE_BATCH;
  timestamp = Date.now();
  targetIds;
  /** Children that actually EXECUTED — undo replays these in reverse. */
  executedChildren = [];
  _skipped = [];
  /** Host walls of retyped doors — the bridge nudges their rebuild. */
  _affectedWallIds = /* @__PURE__ */ new Set();
  /** Skips recorded by the most recent execute() (empty before execution). */
  get skipped() {
    return this._skipped;
  }
  /** Host wall ids of every retyped door (for the reveal-map rebuild nudge). */
  get affectedWallIds() {
    return [...this._affectedWallIds];
  }
  _resolveDoorIds() {
    if (this.input.doorIds === "all") {
      return doorStore.getAll().map((d) => d.id);
    }
    return Array.from(new Set(this.input.doorIds));
  }
  canExecute(ctx) {
    const type = resolveDoorSystemTypeRef(this.input.systemType);
    if (type === null) {
      return {
        ok: false,
        reason: `There is no door type called "${this.input.systemType}". The door types here are: ${doorSystemTypeNames().join(", ")}.`
      };
    }
    const ids = this._resolveDoorIds();
    if (ids.length === 0) {
      return {
        ok: false,
        reason: this.input.doorIds === "all" ? "There are no doors in this project to retype." : "No doors selected — select at least one door first."
      };
    }
    const refusals = [];
    let acceptable = 0;
    for (const id of ids) {
      const v = new UpdateDoorSystemTypeCommand({ doorId: id, systemTypeId: type.id }).canExecute(ctx);
      if (v.ok) acceptable++;
      else refusals.push(childRefusalText(v.reason, "UpdateDoorSystemTypeCommand.canExecute", `door ${id}`));
    }
    if (acceptable === 0) {
      return {
        ok: false,
        reason: `None of the ${ids.length} door${ids.length === 1 ? "" : "s"} can become "${type.name}" — ${refusals[0]}`
      };
    }
    return { ok: true, warnings: refusals.length > 0 ? refusals : void 0 };
  }
  execute(ctx) {
    return _tracer$h().startActiveSpan("pryzm.door.updateSystemType.batch", (span) => {
      try {
        this.executedChildren = [];
        this._skipped = [];
        this._affectedWallIds = /* @__PURE__ */ new Set();
        const type = resolveDoorSystemTypeRef(this.input.systemType);
        if (type === null) {
          const reason = `There is no door type called "${this.input.systemType}". The door types here are: ${doorSystemTypeNames().join(", ")}.`;
          span.end();
          return { success: false, affectedElementIds: [], info: [reason] };
        }
        const ids = this._resolveDoorIds();
        this.targetIds = [...ids];
        const affected = [];
        for (const id of ids) {
          const child = new UpdateDoorSystemTypeCommand({
            doorId: id,
            systemTypeId: type.id
          });
          const v = child.canExecute(ctx);
          if (!v.ok) {
            this._skipped.push({ doorId: id, reason: childRefusalText(v.reason, "UpdateDoorSystemTypeCommand.canExecute", `door ${id}`) });
            continue;
          }
          const r = child.execute(ctx);
          if (r.success) {
            this.executedChildren.push(child);
            affected.push(id);
            const host = doorStore.getById(id)?.wallId;
            if (host) this._affectedWallIds.add(host);
          } else {
            this._skipped.push({ doorId: id, reason: childRefusalText(r.info?.[0], "UpdateDoorSystemTypeCommand.execute", `door ${id}`) });
          }
        }
        const total = ids.length;
        const changed = affected.length;
        const skippedCount = this._skipped.length;
        const reasonCounts = /* @__PURE__ */ new Map();
        for (const s of this._skipped) {
          reasonCounts.set(s.reason, (reasonCounts.get(s.reason) ?? 0) + 1);
        }
        const reasonLines = [...reasonCounts.entries()].map(
          ([reason, count]) => `${count}× ${reason}`
        );
        const summary = `Retyped ${changed} of ${total} door${total === 1 ? "" : "s"} to "${type.name}"` + (skippedCount > 0 ? ` — ${skippedCount} skipped` : "");
        span.setAttribute("pryzm.door.typeBatch.total", total);
        span.setAttribute("pryzm.door.typeBatch.changed", changed);
        span.setAttribute("pryzm.door.typeBatch.skipped", skippedCount);
        span.setAttribute("pryzm.door.typeBatch.scope", this.input.doorIds === "all" ? "all" : "ids");
        return {
          success: changed > 0,
          affectedElementIds: [...affected, ...this._affectedWallIds],
          info: [summary, ...reasonLines]
        };
      } catch (err) {
        span.recordException(err);
        throw err;
      } finally {
        span.end();
      }
    });
  }
  undo(ctx) {
    const affected = [];
    for (let i = this.executedChildren.length - 1; i >= 0; i--) {
      const child = this.executedChildren[i];
      if (!child) continue;
      const r = child.undo(ctx);
      if (r.success) affected.push(...r.affectedElementIds);
    }
    return { success: true, affectedElementIds: affected };
  }
  serialize() {
    return {
      type: this.type,
      targetIds: this.targetIds,
      timestamp: this.timestamp,
      version: 1,
      payload: this.input
    };
  }
  static deserialize(serialized) {
    return new UpdateDoorsSystemTypeBatchCommand(
      serialized.payload
    );
  }
}

let _cachedTracer$a = null;
function _tracer$g() {
  _cachedTracer$a ??= trace.getTracer("@pryzm/command-registry", "0.1.0");
  return _cachedTracer$a;
}
function floorPatternForMaterialLabel(label) {
  return _tracer$g().startActiveSpan("pryzm.floor.patternForMaterialLabel", (span) => {
    try {
      const pattern = _floorPatternForMaterialLabel(label);
      span.setAttribute("pryzm.floor.materialLabel", label);
      span.setAttribute("pryzm.floor.pattern", pattern);
      return pattern;
    } finally {
      span.end();
    }
  });
}
function _floorPatternForMaterialLabel(label) {
  const t = label.toLowerCase();
  const isTimber = /\b(?:parquet|timber|wood|oak|walnut|ash|birch|pine|teak|bamboo|plank|board)\b/.test(t);
  if (/\bherringbone\b/.test(t)) return isTimber ? "plank-herringbone" : "tile-herringbone";
  if (/\b(?:chevron|hungarian)\b/.test(t)) return "plank-herringbone";
  if (/\b(?:basket weave|versailles)\b/.test(t)) return isTimber ? "tile-600x600" : "tile-300x300";
  if (/\bterrazzo\b/.test(t)) return "terrazzo";
  const mod = /\b(\d{2,4})\s*[×x]\s*(\d{2,4})\b/.exec(t);
  if (mod !== null && !isTimber) {
    const a = Number(mod[1]);
    const b = Number(mod[2]);
    const long = Math.max(a, b);
    const short = Math.min(a, b);
    if (long === short) return short <= 400 ? "tile-300x300" : "tile-600x600";
    return "tile-600x300";
  }
  if (isTimber) return "plank-90";
  if (/\b(?:tile|tiles|mosaic|hexagon|metro|subway|porcelain|ceramic|terracotta|marble|slate|quarry|chequer)\b/.test(t)) {
    return "tile-600x600";
  }
  return "seamless";
}

let _cachedTracer$9 = null;
function _tracer$f() {
  _cachedTracer$9 ??= trace.getTracer("@pryzm/command-registry", "0.1.0");
  return _cachedTracer$9;
}
const HEX_COLOR_RE$8 = /^#[0-9a-fA-F]{6}$/;
function composeFloorFinishUpdate(existing, finish, pattern) {
  return {
    materialId: finish.materialId,
    finishSpec: {
      ...existing.finishSpec,
      finishMaterialId: finish.materialId,
      ...finish.materialColor !== void 0 ? { finishColor: finish.materialColor } : {},
      finishPattern: pattern,
      ...finish.materialName !== void 0 ? { materialName: finish.materialName } : {}
    },
    // §FLOOR-FINISH-BEATS-TINT — see the header. `undefined` (not a delete)
    // because `Object.assign` copies it and `resolveFloorColor` tests
    // truthiness, so the override stops winning while the field's shape is
    // unchanged for persistence.
    colour: void 0
  };
}
function floorCarriesFinish(record, finish) {
  if (!record) return false;
  if (record.materialId !== finish.materialId) return false;
  if (record.finishSpec?.finishMaterialId !== finish.materialId) return false;
  if (finish.materialColor !== void 0 && record.finishSpec?.finishColor !== finish.materialColor) {
    return false;
  }
  return true;
}
class SetFloorFinishCommand {
  constructor(_input) {
    this._input = _input;
    this.id = `cmd-floor-finish-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    this.timestamp = Date.now();
    this.targetIds = [_input.floorId];
  }
  _input;
  affectedStores = ["floor"];
  id;
  type = CommandType.SET_FLOOR_FINISH;
  timestamp;
  targetIds;
  /** Pre-update snapshot captured in execute() — used by undo(). */
  _beforeSnapshot = null;
  canExecute(ctx) {
    const { floorStore } = ctx.stores;
    if (!floorStore) return { ok: false, reason: "FloorStore not available." };
    if (!floorStore.getById(this._input.floorId)) {
      return { ok: false, reason: `Floor "${this._input.floorId}" not found.` };
    }
    const f = this._input.finish;
    if (!f || typeof f.materialId !== "string" || f.materialId.length === 0) {
      return { ok: false, reason: "finish.materialId is required." };
    }
    if (f.materialColor !== void 0 && !HEX_COLOR_RE$8.test(f.materialColor)) {
      return {
        ok: false,
        reason: `finish.materialColor must be a '#rrggbb' hex string, got "${f.materialColor}".`
      };
    }
    return { ok: true };
  }
  execute(ctx) {
    const { floorStore } = ctx.stores;
    if (!floorStore) throw new Error("[SetFloorFinishCommand] FloorStore not available.");
    const existing = floorStore.getById(this._input.floorId);
    if (!existing) return { success: false, affectedElementIds: [] };
    this._beforeSnapshot = structuredClone(existing);
    const label = this._input.finish.materialName ?? findMaterialRecord(this._input.finish.materialId)?.label ?? this._input.finish.materialId;
    const pattern = floorPatternForMaterialLabel(label);
    const updated = floorStore.update(
      this._input.floorId,
      composeFloorFinishUpdate(existing, this._input.finish, pattern)
    );
    if (!updated) return { success: false, affectedElementIds: [] };
    return { success: true, affectedElementIds: [this._input.floorId] };
  }
  undo(ctx) {
    const { floorStore } = ctx.stores;
    if (!floorStore || !this._beforeSnapshot) {
      return { success: false, affectedElementIds: [] };
    }
    if (typeof floorStore.restoreSnapshot === "function") {
      floorStore.restoreSnapshot(this._beforeSnapshot);
    } else {
      floorStore.update(this._beforeSnapshot.id, this._beforeSnapshot);
    }
    return { success: true, affectedElementIds: [this._beforeSnapshot.id] };
  }
  serialize() {
    return {
      type: this.type,
      targetIds: this.targetIds,
      timestamp: this.timestamp,
      version: 1,
      payload: this._input
    };
  }
}
class SetFloorFinishBatchCommand {
  constructor(_input) {
    this._input = _input;
    this.id = `cmd-floor-finish-batch-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    this.timestamp = Date.now();
    this.targetIds = _input.floorIds === "all" ? [] : [..._input.floorIds];
  }
  _input;
  affectedStores = ["floor"];
  id;
  type = CommandType.SET_FLOOR_FINISH_BATCH;
  timestamp;
  targetIds;
  _executedChildren = [];
  _skipped = [];
  _tintCleared = [];
  /** Skips recorded by the most recent execute() (empty before execution). */
  get skipped() {
    return this._skipped;
  }
  /**
   * Floors that carried a hand-picked `colour` override which this finish
   * SUPERSEDED. Not a skip — the write is correct and wanted — but it is a
   * second change the user did not literally ask for, so it is said out loud
   * rather than discovered later (§CONTEXT-DATA-HONESTY).
   */
  get tintCleared() {
    return this._tintCleared;
  }
  _resolveFloorIds(ctx) {
    const { floorStore } = ctx.stores;
    if (this._input.floorIds === "all") {
      return (floorStore?.getAll() ?? []).map((f) => f.id);
    }
    return Array.from(new Set(this._input.floorIds));
  }
  _child(floorId) {
    return new SetFloorFinishCommand({ floorId, finish: { ...this._input.finish } });
  }
  _valueLabel() {
    const f = this._input.finish;
    return `finish ${f.materialName ?? f.materialId}`;
  }
  canExecute(ctx) {
    const { floorStore } = ctx.stores;
    if (!floorStore) return { ok: false, reason: "FloorStore not available." };
    const ids = this._resolveFloorIds(ctx);
    if (ids.length === 0) {
      return {
        ok: false,
        reason: this._input.floorIds === "all" ? "There are no floor finishes in this project to change." : "No floors selected — select at least one floor first."
      };
    }
    const refusals = [];
    let acceptable = 0;
    for (const floorId of ids) {
      const v = this._child(floorId).canExecute(ctx);
      if (v.ok) acceptable++;
      else refusals.push(childRefusalText(v.reason, "SetFloorFinishCommand.canExecute", `floor ${floorId}`));
    }
    if (acceptable === 0) {
      return {
        ok: false,
        reason: `None of the ${ids.length} floor${ids.length === 1 ? "" : "s"} can take the ${this._valueLabel()} — ${refusals[0]}`
      };
    }
    return { ok: true, warnings: refusals.length > 0 ? refusals : void 0 };
  }
  execute(ctx) {
    return _tracer$f().startActiveSpan("pryzm.floor.setFinish.batch", (span) => {
      try {
        this._executedChildren = [];
        this._skipped = [];
        this._tintCleared = [];
        const { floorStore } = ctx.stores;
        const ids = this._resolveFloorIds(ctx);
        this.targetIds = [...ids];
        const affected = [];
        for (const floorId of ids) {
          const child = this._child(floorId);
          const v = child.canExecute(ctx);
          if (!v.ok) {
            this._skipped.push({
              floorId,
              reason: childRefusalText(v.reason, "SetFloorFinishCommand.canExecute", `floor ${floorId}`)
            });
            continue;
          }
          const hadTint = Boolean(floorStore?.getById(floorId)?.colour);
          const r = child.execute(ctx);
          if (!r.success) {
            this._skipped.push({
              floorId,
              reason: childRefusalText(r.info?.[0], "SetFloorFinishCommand.execute", `floor ${floorId}`)
            });
            continue;
          }
          this._executedChildren.push(child);
          if (!floorCarriesFinish(floorStore?.getById(floorId), this._input.finish)) {
            this._skipped.push({
              floorId,
              reason: `floor ${floorId}: the store accepted the write and reported success, but reading the record back shows its finish is NOT ${this._input.finish.materialName ?? this._input.finish.materialId}. The value did not reach the authority, so nothing about this floor changed — do not trust a success count over this floor.`
            });
            continue;
          }
          affected.push(floorId);
          if (hadTint) this._tintCleared.push(floorId);
        }
        const total = ids.length;
        const changed = affected.length;
        const skippedCount = this._skipped.length;
        const reasonCounts = /* @__PURE__ */ new Map();
        for (const s of this._skipped) {
          reasonCounts.set(s.reason, (reasonCounts.get(s.reason) ?? 0) + 1);
        }
        const reasonLines = [...reasonCounts.entries()].map(([reason, count]) => `${count}× ${reason}`);
        const record = findMaterialRecord(this._input.finish.materialId);
        const hasMaps = record?.maps !== void 0 && Object.keys(record.maps).length > 0;
        const mapsTail = !hasMaps || changed === 0 ? "" : ` — ⚠ ${describeFloorFinishRenderLimit()}`;
        const tintTail = this._tintCleared.length === 0 ? "" : ` — ${this._tintCleared.length} of them carried a hand-picked colour override, which this finish replaces (Ctrl+Z restores it)`;
        const summary = `Set the ${this._valueLabel()} on ${changed} of ${total} floor${total === 1 ? "" : "s"}` + (skippedCount > 0 ? ` — ${skippedCount} skipped` : "") + tintTail + mapsTail;
        span.setAttribute("pryzm.floor.finishBatch.total", total);
        span.setAttribute("pryzm.floor.finishBatch.changed", changed);
        span.setAttribute("pryzm.floor.finishBatch.skipped", skippedCount);
        span.setAttribute("pryzm.floor.finishBatch.tintCleared", this._tintCleared.length);
        span.setAttribute("pryzm.floor.finishBatch.materialHasMaps", hasMaps);
        span.setAttribute("pryzm.floor.finishBatch.scope", this._input.floorIds === "all" ? "all" : "ids");
        return {
          success: changed > 0,
          affectedElementIds: affected,
          info: [summary, ...reasonLines]
        };
      } catch (err) {
        span.recordException(err);
        throw err;
      } finally {
        span.end();
      }
    });
  }
  undo(ctx) {
    const affected = [];
    for (let i = this._executedChildren.length - 1; i >= 0; i--) {
      const child = this._executedChildren[i];
      if (!child) continue;
      const r = child.undo(ctx);
      if (r.success) affected.push(...r.affectedElementIds);
    }
    return { success: true, affectedElementIds: affected };
  }
  serialize() {
    return {
      type: this.type,
      targetIds: this.targetIds,
      timestamp: this.timestamp,
      version: 1,
      payload: { floorIds: this._input.floorIds, finish: this._input.finish }
    };
  }
}

function resolveRoomLevelPrefix(levelId, ctx) {
  try {
    const sourceLevels = ctx.bimManager.getLevels?.() ?? ctx.stores.wallStore?.getLevels?.() ?? [];
    const sorted = [...sourceLevels].sort((a, b) => (a.elevation ?? 0) - (b.elevation ?? 0));
    const idx = sorted.findIndex((level) => level.id === levelId);
    return String(idx >= 0 ? idx : 0).padStart(2, "0");
  } catch {
    return "00";
  }
}
const MINTED_NUMBER_SHAPE = String.raw`\d{2,}-\d{3,}`;
const MINTED_ROOM_NAME_RE = new RegExp(`^Room ${MINTED_NUMBER_SHAPE}$`);
function isSystemMintedRoomName(name, incoming) {
  if (!name) return true;
  if (name === "Room") return true;
  if (incoming !== "" && name === incoming) return true;
  return MINTED_ROOM_NAME_RE.test(name);
}
function assignUniqueRoomNumbers(rooms, levelPrefix, reservedNumbers = []) {
  const expectedPattern = new RegExp(`^${levelPrefix}-\\d{3}$`);
  const used = /* @__PURE__ */ new Set();
  for (const raw of reservedNumbers) {
    const number = String(raw ?? "").trim();
    if (number && expectedPattern.test(number)) used.add(number);
  }
  const authoredKept = /* @__PURE__ */ new Set();
  rooms.forEach((room, i) => {
    if (room.metadata?.roomNumberAuthored !== true) return;
    const authored = String(room.roomNumber ?? "").trim();
    if (!authored) return;
    if (used.has(authored)) return;
    used.add(authored);
    authoredKept.add(i);
  });
  let nextSeq = 1;
  const nextRoomNumber = () => {
    let candidate = "";
    do {
      candidate = `${levelPrefix}-${String(nextSeq++).padStart(3, "0")}`;
    } while (used.has(candidate));
    used.add(candidate);
    return candidate;
  };
  return rooms.map((room, i) => {
    const incoming = String(room.roomNumber ?? "").trim();
    if (authoredKept.has(i)) {
      return incoming === room.roomNumber ? room : { ...room, roomNumber: incoming };
    }
    if (incoming && expectedPattern.test(incoming) && !used.has(incoming)) {
      used.add(incoming);
      const keptName = isSystemMintedRoomName(room.name, incoming) ? `Room ${incoming}` : room.name;
      if (incoming === room.roomNumber && keptName === room.name) return room;
      return { ...room, roomNumber: incoming, name: keptName };
    }
    const roomNumber = nextRoomNumber();
    const name = isSystemMintedRoomName(room.name, incoming) ? `Room ${roomNumber}` : room.name;
    return { ...room, roomNumber, name };
  });
}
function assignUniqueRoomNumber(room, ctx, reservedRooms = []) {
  const levelPrefix = resolveRoomLevelPrefix(room.levelId, ctx);
  return assignUniqueRoomNumbers(
    [room],
    levelPrefix,
    reservedRooms.filter((existing) => existing.id !== room.id).map((existing) => existing.roomNumber)
  )[0];
}

class CreateRoomCommand {
  constructor(roomData) {
    this.roomData = roomData;
    this.targetIds = [roomData.id];
  }
  roomData;
  affectedStores = ["room"];
  id = crypto.randomUUID();
  type = CommandType.CREATE_ROOM;
  timestamp = Date.now();
  targetIds;
  canExecute(ctx) {
    const roomStore = ctx.stores.roomStore;
    if (!roomStore) {
      return { ok: false, reason: "RoomStore not available in context" };
    }
    if (!ctx.bimManager.getLevelById(this.roomData.levelId)) {
      return { ok: false, reason: `Level '${this.roomData.levelId}' not found` };
    }
    if (!this.roomData.boundary?.polygon || this.roomData.boundary.polygon.length < 3) {
      return { ok: false, reason: "Room boundary must have at least 3 vertices" };
    }
    return { ok: true };
  }
  execute(ctx) {
    const roomStore = ctx.stores.roomStore;
    if (!roomStore) {
      return { success: false, affectedElementIds: [], error: "RoomStore not available" };
    }
    try {
      const existingRooms = roomStore.getByLevel(this.roomData.levelId);
      this.roomData = assignUniqueRoomNumber(this.roomData, ctx, existingRooms);
      roomStore.add(this.roomData);
      ctx.bimManager.registerElement(this.roomData.id, this.roomData.levelId);
      elementRegistry.registerSemantic(this.roomData.id, "room");
      console.log(`[CreateRoomCommand] Room '${this.roomData.id}' created on level '${this.roomData.levelId}'`);
      return { success: true, affectedElementIds: [this.roomData.id] };
    } catch (err) {
      return { success: false, affectedElementIds: [], error: err?.message ?? String(err) };
    }
  }
  undo(ctx) {
    const roomStore = ctx.stores.roomStore;
    if (!roomStore) {
      return { success: false, affectedElementIds: [], error: "RoomStore not available" };
    }
    try {
      roomStore.remove(this.roomData.id);
      ctx.bimManager.unregisterElement(this.roomData.id);
      elementRegistry.unregister(this.roomData.id);
      return { success: true, affectedElementIds: [this.roomData.id] };
    } catch (err) {
      return { success: false, affectedElementIds: [], error: err?.message ?? String(err) };
    }
  }
  serialize() {
    return {
      type: this.type,
      payload: { roomData: this.roomData },
      targetIds: this.targetIds,
      timestamp: this.timestamp,
      version: 1
    };
  }
}

class DeleteRoomCommand {
  constructor(roomId) {
    this.roomId = roomId;
    this.targetIds = [roomId];
  }
  roomId;
  affectedStores = ["room"];
  id = crypto.randomUUID();
  type = CommandType.DELETE_ROOM;
  timestamp = Date.now();
  targetIds;
  snapshot;
  canExecute(ctx) {
    const roomStore = ctx.stores.roomStore;
    if (!roomStore) return { ok: false, reason: "RoomStore not available" };
    if (!roomStore.getById(this.roomId)) {
      return { ok: false, reason: `Room '${this.roomId}' not found` };
    }
    return { ok: true };
  }
  execute(ctx) {
    const roomStore = ctx.stores.roomStore;
    if (!roomStore) return { success: false, affectedElementIds: [], error: "RoomStore not available" };
    try {
      this.snapshot = roomStore.remove(this.roomId);
      if (!this.snapshot) {
        return { success: false, affectedElementIds: [], error: `Room '${this.roomId}' not found` };
      }
      ctx.bimManager.unregisterElement(this.roomId);
      elementRegistry.unregister(this.roomId);
      try {
        semanticGraphManager.removeAllRelationshipsForElement(this.roomId);
      } catch {
      }
      try {
        roomSpatialIndex.remove(this.roomId);
      } catch {
      }
      return { success: true, affectedElementIds: [this.roomId] };
    } catch (err) {
      return { success: false, affectedElementIds: [], error: err?.message ?? String(err) };
    }
  }
  undo(ctx) {
    const roomStore = ctx.stores.roomStore;
    if (!roomStore || !this.snapshot) {
      return { success: false, affectedElementIds: [], error: "Cannot undo — snapshot missing" };
    }
    try {
      roomStore.add(this.snapshot);
      ctx.bimManager.registerElement(this.snapshot.id, this.snapshot.levelId);
      elementRegistry.registerSemantic(this.snapshot.id, "room");
      try {
        const boundingBox = this.snapshot.computed?.boundingBox ?? (this.snapshot.boundary?.polygon?.length ? polygonAABB(this.snapshot.boundary.polygon) : void 0);
        if (boundingBox) {
          roomSpatialIndex.insert(this.snapshot.id, boundingBox);
        }
      } catch {
      }
      return { success: true, affectedElementIds: [this.roomId] };
    } catch (err) {
      return { success: false, affectedElementIds: [], error: err?.message ?? String(err) };
    }
  }
  serialize() {
    return {
      type: this.type,
      payload: { roomId: this.roomId },
      targetIds: this.targetIds,
      timestamp: this.timestamp,
      version: 1
    };
  }
}

class RenameRoomCommand {
  constructor(roomId, updates) {
    this.roomId = roomId;
    this.updates = updates;
    this.targetIds = [roomId];
  }
  roomId;
  updates;
  affectedStores = ["room"];
  id = crypto.randomUUID();
  type = CommandType.RENAME_ROOM;
  timestamp = Date.now();
  targetIds;
  // §07 / M5 fix: full pre-update snapshot so undo restores every derived
  // field (modifiedAt, version, etc.) — not just the named ones.
  snapshot;
  canExecute(ctx) {
    const roomStore = ctx.stores.roomStore;
    if (!roomStore) return { ok: false, reason: "RoomStore not available" };
    if (!roomStore.getById(this.roomId)) return { ok: false, reason: `Room '${this.roomId}' not found` };
    return { ok: true };
  }
  execute(ctx) {
    const roomStore = ctx.stores.roomStore;
    if (!roomStore) return { success: false, affectedElementIds: [], error: "RoomStore not available" };
    try {
      const current = roomStore.getById(this.roomId);
      if (!current) return { success: false, affectedElementIds: [], error: `Room '${this.roomId}' not found` };
      this.snapshot = current;
      const patch = {};
      if (this.updates.name !== void 0) patch.name = this.updates.name;
      if (this.updates.roomNumber !== void 0) {
        patch.roomNumber = this.updates.roomNumber;
        const authored = this.updates.roomNumber.trim().length > 0;
        patch.metadata = { ...patch.metadata ?? {}, roomNumberAuthored: authored };
      }
      if (this.updates.occupancyType !== void 0) patch.occupancyType = this.updates.occupancyType;
      if (this.updates.department !== void 0) {
        patch.department = this.updates.department;
        const authored = this.updates.department.trim().length > 0;
        patch.metadata = { ...patch.metadata ?? {}, departmentAuthored: authored };
      }
      roomStore.update(this.roomId, patch);
      return { success: true, affectedElementIds: [this.roomId] };
    } catch (err) {
      return { success: false, affectedElementIds: [], error: err?.message ?? String(err) };
    }
  }
  undo(ctx) {
    const roomStore = ctx.stores.roomStore;
    if (!roomStore || !this.snapshot) {
      return { success: false, affectedElementIds: [], error: "Cannot undo — snapshot missing" };
    }
    try {
      roomStore.restoreSnapshot(this.snapshot);
      return { success: true, affectedElementIds: [this.roomId] };
    } catch (err) {
      return { success: false, affectedElementIds: [], error: err?.message ?? String(err) };
    }
  }
  serialize() {
    return {
      type: this.type,
      payload: { roomId: this.roomId, updates: this.updates },
      targetIds: this.targetIds,
      timestamp: this.timestamp,
      version: 1
    };
  }
}

class SetRoomOccupancyCommand {
  constructor(roomId, occupancyType) {
    this.roomId = roomId;
    this.occupancyType = occupancyType;
    this.targetIds = [roomId];
  }
  roomId;
  occupancyType;
  affectedStores = ["room"];
  id = crypto.randomUUID();
  type = CommandType.SET_ROOM_OCCUPANCY;
  timestamp = Date.now();
  targetIds;
  // §07 / M5 fix: full pre-update snapshot.  Occupancy changes also drive
  // RoomColourSystem.resolve() and finishes defaults, so partial restores
  // can leave the room with mismatched colour/finishes after undo.
  snapshot;
  canExecute(ctx) {
    const roomStore = ctx.stores.roomStore;
    if (!roomStore) return { ok: false, reason: "RoomStore not available" };
    if (!roomStore.getById(this.roomId)) return { ok: false, reason: `Room '${this.roomId}' not found` };
    return { ok: true };
  }
  execute(ctx) {
    const roomStore = ctx.stores.roomStore;
    if (!roomStore) return { success: false, affectedElementIds: [], error: "RoomStore not available" };
    try {
      const current = roomStore.getById(this.roomId);
      if (!current) return { success: false, affectedElementIds: [], error: `Room '${this.roomId}' not found` };
      this.snapshot = current;
      const patch = { occupancyType: this.occupancyType };
      roomStore.update(this.roomId, patch);
      return { success: true, affectedElementIds: [this.roomId] };
    } catch (err) {
      return { success: false, affectedElementIds: [], error: err?.message ?? String(err) };
    }
  }
  undo(ctx) {
    const roomStore = ctx.stores.roomStore;
    if (!roomStore || !this.snapshot) {
      return { success: false, affectedElementIds: [], error: "Cannot undo — snapshot missing" };
    }
    try {
      roomStore.restoreSnapshot(this.snapshot);
      return { success: true, affectedElementIds: [this.roomId] };
    } catch (err) {
      return { success: false, affectedElementIds: [], error: err?.message ?? String(err) };
    }
  }
  serialize() {
    return {
      type: this.type,
      payload: { roomId: this.roomId, occupancyType: this.occupancyType },
      targetIds: this.targetIds,
      timestamp: this.timestamp,
      version: 1
    };
  }
}

class SetRoomColourModeCommand {
  constructor(mode, scope, modelId, viewId) {
    this.mode = mode;
    this.scope = scope;
    this.modelId = modelId;
    this.viewId = viewId;
  }
  mode;
  scope;
  modelId;
  viewId;
  /** Mutates view/model-level category overrides on vgGovernanceStore. */
  affectedStores = ["vg-governance"];
  id = crypto.randomUUID();
  type = CommandType.VG_SET_VIEW_CATEGORY_STYLE;
  timestamp = Date.now();
  targetIds = [];
  previousMode;
  previousWasOverridden = false;
  canExecute(_ctx) {
    if (!isRoomColourMode(this.mode)) {
      return { ok: false, reason: `'${String(this.mode)}' is not a room colour mode.` };
    }
    if (this.scope === "view" && !this.viewId) {
      return { ok: false, reason: "No active view to apply the room colour mode to." };
    }
    return { ok: true };
  }
  execute(_ctx) {
    vgGovernanceStore.ensureModel(this.modelId, this.modelId);
    const before = vgGovernanceStore.resolveStyle(
      this.modelId,
      ROOM_VG_CATEGORY,
      this.viewId ?? void 0
    );
    const raw = before.style.roomColourMode;
    this.previousMode = isRoomColourMode(raw) ? raw : void 0;
    if (this.scope === "view" && this.viewId) {
      vgGovernanceStore.ensureView(this.viewId, this.viewId, this.modelId);
      this.previousWasOverridden = vgGovernanceStore.isViewPropOverridden(
        this.viewId,
        ROOM_VG_CATEGORY,
        "roomColourMode"
      );
      const ok2 = vgGovernanceStore.setViewCategoryOverride(
        this.viewId,
        ROOM_VG_CATEGORY,
        { roomColourMode: this.mode }
      );
      return { success: ok2, affectedElementIds: [this.viewId] };
    }
    this.previousWasOverridden = vgGovernanceStore.isPropOverridden(
      this.modelId,
      ROOM_VG_CATEGORY,
      "roomColourMode"
    );
    const ok = vgGovernanceStore.setModelCategoryOverride(
      this.modelId,
      ROOM_VG_CATEGORY,
      { roomColourMode: this.mode }
    );
    return { success: ok, affectedElementIds: [this.modelId] };
  }
  undo(_ctx) {
    const target = this.scope === "view" && this.viewId ? this.viewId : this.modelId;
    if (!this.previousWasOverridden) {
      if (this.scope === "view" && this.viewId) {
        vgGovernanceStore.resetViewCategoryOverride(
          this.viewId,
          ROOM_VG_CATEGORY,
          "roomColourMode"
        );
      } else {
        vgGovernanceStore.resetModelCategoryOverride(
          this.modelId,
          ROOM_VG_CATEGORY,
          "roomColourMode"
        );
      }
      return { success: true, affectedElementIds: [target] };
    }
    if (this.previousMode === void 0) {
      return { success: true, affectedElementIds: [target] };
    }
    if (this.scope === "view" && this.viewId) {
      vgGovernanceStore.setViewCategoryOverride(
        this.viewId,
        ROOM_VG_CATEGORY,
        { roomColourMode: this.previousMode }
      );
    } else {
      vgGovernanceStore.setModelCategoryOverride(
        this.modelId,
        ROOM_VG_CATEGORY,
        { roomColourMode: this.previousMode }
      );
    }
    return { success: true, affectedElementIds: [target] };
  }
  serialize() {
    return {
      type: this.type,
      payload: {
        mode: this.mode,
        scope: this.scope,
        modelId: this.modelId,
        viewId: this.viewId,
        previousMode: this.previousMode
      },
      targetIds: [],
      timestamp: this.timestamp,
      version: 1
    };
  }
}

class UpdateRoomBoundaryCommand {
  constructor(roomId, newBoundary, newBoundingWallIds) {
    this.roomId = roomId;
    this.newBoundary = newBoundary;
    this.newBoundingWallIds = newBoundingWallIds;
    this.targetIds = [roomId];
  }
  roomId;
  newBoundary;
  newBoundingWallIds;
  affectedStores = ["room"];
  id = crypto.randomUUID();
  type = CommandType.UPDATE_ROOM_BOUNDARY;
  timestamp = Date.now();
  targetIds;
  snapshot;
  canExecute(ctx) {
    const roomStore = ctx.stores.roomStore;
    if (!roomStore) return { ok: false, reason: "RoomStore not available" };
    if (!roomStore.getById(this.roomId)) return { ok: false, reason: `Room '${this.roomId}' not found` };
    if (this.newBoundary.polygon.length < 3) return { ok: false, reason: "New boundary must have at least 3 vertices" };
    return { ok: true };
  }
  execute(ctx) {
    const roomStore = ctx.stores.roomStore;
    if (!roomStore) return { success: false, affectedElementIds: [], error: "RoomStore not available" };
    try {
      this.snapshot = roomStore.getById(this.roomId);
      if (!this.snapshot) return { success: false, affectedElementIds: [], error: `Room '${this.roomId}' not found` };
      const patch = {
        boundary: this.newBoundary,
        metadata: {
          ...this.snapshot.metadata,
          detectionVersion: (this.snapshot.metadata.detectionVersion ?? 0) + 1
        }
      };
      if (this.newBoundingWallIds !== void 0) {
        patch.boundingWallIds = this.newBoundingWallIds;
      }
      roomStore.update(this.roomId, patch);
      return { success: true, affectedElementIds: [this.roomId] };
    } catch (err) {
      return { success: false, affectedElementIds: [], error: err?.message ?? String(err) };
    }
  }
  undo(ctx) {
    const roomStore = ctx.stores.roomStore;
    if (!roomStore || !this.snapshot) {
      return { success: false, affectedElementIds: [], error: "Cannot undo — snapshot missing" };
    }
    try {
      roomStore.restoreSnapshot(this.snapshot);
      return { success: true, affectedElementIds: [this.roomId] };
    } catch (err) {
      return { success: false, affectedElementIds: [], error: err?.message ?? String(err) };
    }
  }
  serialize() {
    return {
      type: this.type,
      payload: { roomId: this.roomId, newBoundary: this.newBoundary, newBoundingWallIds: this.newBoundingWallIds },
      targetIds: this.targetIds,
      timestamp: this.timestamp,
      version: 1
    };
  }
}

class BulkAutoClassifyRoomsCommand {
  constructor(patches) {
    this.patches = patches;
    this.targetIds = patches.map((p) => p.roomId);
  }
  patches;
  affectedStores = ["room"];
  id = crypto.randomUUID();
  type = CommandType.BULK_AUTO_CLASSIFY_ROOMS;
  timestamp = Date.now();
  targetIds;
  // One full pre-update snapshot per room actually mutated, in execute order —
  // same discipline as UpdateRoomFinishesBulkCommand, so undo restores every
  // previous name AND occupancy exactly, not just the two named fields.
  snapshots = [];
  /** Rooms in the patch list that no longer existed at execute time. */
  _vanished = [];
  /** Rooms skipped because they vanished between preview and apply — empty
   *  before execute(). */
  get vanished() {
    return this._vanished;
  }
  canExecute(ctx) {
    const roomStore = ctx.stores.roomStore;
    if (!roomStore) return { ok: false, reason: "RoomStore not available" };
    if (this.patches.length === 0) {
      return { ok: false, reason: "Nothing to rename — every room is either unclassified or already named by hand." };
    }
    const anyPresent = this.patches.some((p) => !!roomStore.getById(p.roomId));
    if (!anyPresent) return { ok: false, reason: "None of the proposed rooms could be found — nothing to change." };
    return { ok: true };
  }
  execute(ctx) {
    const roomStore = ctx.stores.roomStore;
    if (!roomStore) return { success: false, affectedElementIds: [], error: "RoomStore not available" };
    this.snapshots = [];
    this._vanished = [];
    const affected = [];
    try {
      for (const { roomId, name, occupancyType, department } of this.patches) {
        const current = roomStore.getById(roomId);
        if (!current) {
          this._vanished.push(roomId);
          continue;
        }
        this.snapshots.push(current);
        const patch = { name, occupancyType };
        if (department !== void 0) patch.department = department;
        roomStore.update(roomId, patch);
        affected.push(roomId);
      }
      const info = [
        `Renamed ${affected.length} of ${this.patches.length} room${this.patches.length === 1 ? "" : "s"}.`
      ];
      if (this._vanished.length > 0) {
        info.push(`${this._vanished.length} skipped — no longer present: ${this._vanished.join(", ")}.`);
      }
      return { success: affected.length > 0, affectedElementIds: affected, info };
    } catch (err) {
      for (let i = this.snapshots.length - 1; i >= 0; i--) {
        try {
          roomStore.restoreSnapshot(this.snapshots[i]);
        } catch {
        }
      }
      this.snapshots = [];
      return { success: false, affectedElementIds: [], error: err?.message ?? String(err) };
    }
  }
  undo(ctx) {
    const roomStore = ctx.stores.roomStore;
    if (!roomStore || this.snapshots.length === 0) {
      return { success: false, affectedElementIds: [], error: "Cannot undo — no snapshots" };
    }
    try {
      const restored = [];
      for (let i = this.snapshots.length - 1; i >= 0; i--) {
        const snap = this.snapshots[i];
        roomStore.restoreSnapshot(snap);
        restored.push(snap.id);
      }
      return { success: true, affectedElementIds: restored };
    } catch (err) {
      return { success: false, affectedElementIds: [], error: err?.message ?? String(err) };
    }
  }
  serialize() {
    return {
      type: this.type,
      payload: { patches: this.patches },
      targetIds: this.targetIds,
      timestamp: this.timestamp,
      version: 1
    };
  }
  static deserialize(serialized) {
    const payload = serialized.payload;
    return new BulkAutoClassifyRoomsCommand(payload.patches);
  }
}

class UpdateSlabLayersCommand {
  constructor(payload) {
    this.payload = payload;
    this.id = `cmd-update-slab-layers-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.timestamp = Date.now();
    this.targetIds = [payload.slabId];
  }
  payload;
  affectedStores = ["slab"];
  id;
  type = CommandType.UPDATE_SLAB_LAYERS;
  timestamp;
  targetIds;
  prevSnapshot;
  canExecute(context) {
    const slab = context.stores.slabStore.getById(this.payload.slabId);
    if (!slab) return { ok: false, reason: `Slab "${this.payload.slabId}" not found` };
    if (!Array.isArray(this.payload.layers) || this.payload.layers.length === 0) {
      return { ok: false, reason: "Layer stack must have at least one layer" };
    }
    if (this.payload.thickness <= 0) {
      return { ok: false, reason: "Total thickness must be positive" };
    }
    return { ok: true };
  }
  execute(context) {
    const slab = context.stores.slabStore.getById(this.payload.slabId);
    if (!slab) throw new Error(`[UpdateSlabLayersCommand] Slab "${this.payload.slabId}" not found`);
    this.prevSnapshot = structuredClone(slab);
    const nextState = structuredClone(slab);
    nextState.systemTypeId = this.payload.systemTypeId ?? null;
    nextState.layers = structuredClone(this.payload.layers);
    nextState.thickness = parseFloat(this.payload.thickness.toFixed(6));
    context.stores.slabStore.update(this.payload.slabId, nextState);
    return {
      success: true,
      affectedElementIds: [this.payload.slabId],
      info: [`Slab ${this.payload.slabId} layers updated (${this.payload.layers.length} layers, ${(this.payload.thickness * 1e3).toFixed(0)}mm total)`]
    };
  }
  undo(context) {
    if (!this.prevSnapshot) return { success: false, affectedElementIds: [] };
    context.stores.slabStore.update(this.payload.slabId, this.prevSnapshot);
    return { success: true, affectedElementIds: [this.payload.slabId] };
  }
  serialize() {
    return {
      type: this.type,
      payload: this.payload,
      targetIds: this.targetIds,
      timestamp: this.timestamp,
      version: 1
    };
  }
}

let _cachedTracer$8 = null;
function _tracer$e() {
  _cachedTracer$8 ??= trace.getTracer("@pryzm/command-registry", "0.1.0");
  return _cachedTracer$8;
}
const SLAB_TYPE_DOMAIN_NOISE = ["slab", "slabs", "type", "the", "a"];
function resolveSlabSystemTypeRef(catalogue, ref) {
  return resolveCatalogueRef(catalogue, ref, {
    domainNoise: SLAB_TYPE_DOMAIN_NOISE,
    spanDomain: "pryzm.slab.systemType"
  }).entry;
}
function slabSystemTypeNames(catalogue) {
  return catalogue.getAll().map((t) => t.name);
}
class UpdateSlabsSystemTypeBatchCommand {
  constructor(input) {
    this.input = input;
    this.targetIds = input.slabIds === "all" ? [] : [...input.slabIds];
  }
  input;
  affectedStores = ["slab"];
  id = crypto.randomUUID();
  type = CommandType.UPDATE_SLABS_SYSTEM_TYPE_BATCH;
  timestamp = Date.now();
  targetIds;
  /** Children that actually EXECUTED — undo replays these in reverse. */
  executedChildren = [];
  _skipped = [];
  /** Skips recorded by the most recent execute() (empty before execution). */
  get skipped() {
    return this._skipped;
  }
  _resolveSlabIds(ctx) {
    if (this.input.slabIds === "all") {
      return (ctx.stores.slabStore?.getAll() ?? []).map((s) => s.id);
    }
    return Array.from(new Set(this.input.slabIds));
  }
  /** The child for one slab, with the type MATERIALISED onto it. */
  _child(slabId, type) {
    return new UpdateSlabLayersCommand({
      slabId,
      systemTypeId: type.id,
      layers: structuredClone(type.layers),
      thickness: type.totalThickness
    });
  }
  /** The project's slab catalogue, or null when the host did not thread one
   *  (headless tests) — a missing catalogue is a REFUSAL, never a guess. */
  _catalogue(ctx) {
    return ctx.stores.slabSystemTypeStore ?? null;
  }
  canExecute(ctx) {
    const catalogue = this._catalogue(ctx);
    if (catalogue === null) {
      return { ok: false, reason: "The slab type catalogue is not available here." };
    }
    const type = resolveSlabSystemTypeRef(catalogue, this.input.systemType);
    if (type === null) {
      return {
        ok: false,
        reason: `There is no slab type called "${this.input.systemType}". The slab types here are: ${slabSystemTypeNames(catalogue).join(", ")}.`
      };
    }
    if (type.layers.length === 0 || type.totalThickness <= 0) {
      return {
        ok: false,
        reason: `The slab type "${type.name}" has no layer stack to apply.`
      };
    }
    const ids = this._resolveSlabIds(ctx);
    if (ids.length === 0) {
      return {
        ok: false,
        reason: this.input.slabIds === "all" ? "There are no slabs in this project to retype." : "No slabs selected — select at least one slab first."
      };
    }
    const refusals = [];
    let acceptable = 0;
    for (const id of ids) {
      const v = this._child(id, type).canExecute(ctx);
      if (v.ok) acceptable++;
      else refusals.push(childRefusalText(v.reason, "UpdateSlabLayersCommand.canExecute", `slab ${id}`));
    }
    if (acceptable === 0) {
      return {
        ok: false,
        reason: `None of the ${ids.length} slab${ids.length === 1 ? "" : "s"} can become "${type.name}" — ${refusals[0]}`
      };
    }
    return { ok: true, warnings: refusals.length > 0 ? refusals : void 0 };
  }
  execute(ctx) {
    return _tracer$e().startActiveSpan("pryzm.slab.updateSystemType.batch", (span) => {
      try {
        this.executedChildren = [];
        this._skipped = [];
        const catalogue = this._catalogue(ctx);
        if (catalogue === null) {
          return {
            success: false,
            affectedElementIds: [],
            info: ["The slab type catalogue is not available here."]
          };
        }
        const type = resolveSlabSystemTypeRef(catalogue, this.input.systemType);
        if (type === null) {
          const reason = `There is no slab type called "${this.input.systemType}". The slab types here are: ${slabSystemTypeNames(catalogue).join(", ")}.`;
          return { success: false, affectedElementIds: [], info: [reason] };
        }
        const ids = this._resolveSlabIds(ctx);
        this.targetIds = [...ids];
        const affected = [];
        for (const id of ids) {
          const child = this._child(id, type);
          const v = child.canExecute(ctx);
          if (!v.ok) {
            this._skipped.push({ slabId: id, reason: childRefusalText(v.reason, "UpdateSlabLayersCommand.canExecute", `slab ${id}`) });
            continue;
          }
          const r = child.execute(ctx);
          if (r.success) {
            this.executedChildren.push(child);
            affected.push(id);
          } else {
            this._skipped.push({ slabId: id, reason: childRefusalText(r.info?.[0], "UpdateSlabLayersCommand.execute", `slab ${id}`) });
          }
        }
        const total = ids.length;
        const changed = affected.length;
        const skippedCount = this._skipped.length;
        const reasonCounts = /* @__PURE__ */ new Map();
        for (const s of this._skipped) {
          reasonCounts.set(s.reason, (reasonCounts.get(s.reason) ?? 0) + 1);
        }
        const reasonLines = [...reasonCounts.entries()].map(
          ([reason, count]) => `${count}× ${reason}`
        );
        const summary = `Retyped ${changed} of ${total} slab${total === 1 ? "" : "s"} to "${type.name}" (${(type.totalThickness * 1e3).toFixed(0)}mm)` + (skippedCount > 0 ? ` — ${skippedCount} skipped` : "");
        span.setAttribute("pryzm.slab.typeBatch.total", total);
        span.setAttribute("pryzm.slab.typeBatch.changed", changed);
        span.setAttribute("pryzm.slab.typeBatch.skipped", skippedCount);
        span.setAttribute("pryzm.slab.typeBatch.scope", this.input.slabIds === "all" ? "all" : "ids");
        return {
          success: changed > 0,
          affectedElementIds: affected,
          info: [summary, ...reasonLines]
        };
      } catch (err) {
        span.recordException(err);
        throw err;
      } finally {
        span.end();
      }
    });
  }
  undo(ctx) {
    const affected = [];
    for (let i = this.executedChildren.length - 1; i >= 0; i--) {
      const child = this.executedChildren[i];
      if (!child) continue;
      const r = child.undo(ctx);
      if (r.success) affected.push(...r.affectedElementIds);
    }
    return { success: true, affectedElementIds: affected };
  }
  serialize() {
    return {
      type: this.type,
      targetIds: this.targetIds,
      timestamp: this.timestamp,
      version: 1,
      payload: this.input
    };
  }
  static deserialize(serialized) {
    return new UpdateSlabsSystemTypeBatchCommand(
      serialized.payload
    );
  }
}

const BUILT_IN_LIFT_TYPES = [
  // ═══════════════════════════════════════════════════════════════════════════
  // §FEAT-LIFT-COMPOUND-SYSTEM (L-5701) — THE 6-PERSON DEFAULT, AND WHY IT IS AN
  // ADDITION RATHER THAN AN EDIT.
  // ═══════════════════════════════════════════════════════════════════════════
  // The founder asked for a "default of standard lift for 6 people". The type
  // that existed was `passenger-8`, at 8 persons. Both are real standard cars, so
  // this is a genuine conflict of two correct facts, not a bug — and it was
  // resolved by ADDING, deliberately, for three measured reasons:
  //
  //  1. ⛔ `passenger-8` AND `accessible` CARRY A STANDARDS CITATION. The header
  //     of this file cites EN 81-70 for the accessible car's 1.1 x 1.4 m clear
  //     dimensions, and those are REGULATORY: an accessible lift that is not
  //     1.1 x 1.4 m is not an accessible lift. Silently rewriting a
  //     standards-cited definition to satisfy a default preference would be the
  //     worst possible way to honour the request.
  //  2. `passenger-8` IS LOAD-BEARING ELSEWHERE. `LiftToolPlacement.ts` pins
  //     `DEFAULT_TYPE_ID = 'passenger-8'` and the residential-building generator
  //     drives that same path. Changing the value under it would silently resize
  //     every lift in every generated multi-family building.
  //  3. A 6-PERSON CAR IS ITSELF STANDARD — 450 kg / 6 persons, ~1.0 x 1.25 m
  //     car, the common European residential size (EN 81-20/-50 duty range). It
  //     earns a row; it does not need to displace one.
  //
  // So: `passenger-6` is NEW, it is the default of the NEW LOD-300 compound
  // (`plugins/lift`), and the legacy massing path keeps `passenger-8` untouched.
  // Recorded in C104 §6.
  {
    id: "passenger-6",
    name: "Passenger Lift (6-person)",
    kind: "passenger",
    defaults: {
      // Car ~1.0 x 1.25 m; +0.2 m shaft wall and 0.15 m clearance per side
      // gives the 1.5 x 1.6 m shaft `LIFT_DIMENSION_DEFAULTS` documents.
      shaftWidth: 1.5,
      shaftDepth: 1.6,
      carCapacityPersons: 6,
      doorWidth: 0.8,
      material: "steel"
    },
    rules: { minDoorWidth: 0.7, minShaftDim: 1.3 }
  },
  {
    id: "passenger-8",
    name: "Passenger Lift (8-person)",
    kind: "passenger",
    defaults: {
      shaftWidth: 1.8,
      shaftDepth: 1.8,
      carCapacityPersons: 8,
      doorWidth: 0.9,
      material: "steel"
    },
    rules: { minDoorWidth: 0.8, minShaftDim: 1.4 }
  },
  {
    id: "accessible",
    name: "Accessible Lift (EN 81-70)",
    kind: "accessible",
    defaults: {
      shaftWidth: 1.8,
      shaftDepth: 2,
      carCapacityPersons: 8,
      doorWidth: 1,
      material: "steel"
    },
    rules: { minDoorWidth: 0.9, minShaftDim: 1.6 }
  },
  {
    id: "goods",
    name: "Goods / Service Lift",
    kind: "goods",
    defaults: {
      shaftWidth: 2,
      shaftDepth: 2.4,
      carCapacityPersons: 13,
      doorWidth: 1.2,
      material: "steel"
    },
    rules: { minDoorWidth: 1.1, minShaftDim: 1.8 }
  }
];

class CreateTemplateCommand {
  constructor(input) {
    this.input = input;
    this.targetIds = [input.id];
  }
  input;
  affectedStores = ["template"];
  id = crypto.randomUUID();
  type = CommandType.CREATE_TEMPLATE;
  timestamp = Date.now();
  targetIds;
  canExecute(ctx) {
    if (!ctx.stores.templateStore) {
      return { ok: false, reason: "TemplateStore not available in CommandContext" };
    }
    if (!this.input.name.trim()) {
      return { ok: false, reason: "Template name must not be empty" };
    }
    if (!this.input.code.trim()) {
      return { ok: false, reason: "Template code must not be empty" };
    }
    if (ctx.stores.templateStore.has(this.input.id)) {
      return { ok: false, reason: `Template id already exists: ${this.input.id}` };
    }
    return { ok: true };
  }
  execute(ctx) {
    const now = Date.now();
    const template = {
      id: this.input.id,
      scope: this.input.scope,
      name: this.input.name.trim(),
      code: this.input.code.trim(),
      description: this.input.description,
      version: 1,
      // FUTURE: Phase C — server template registry (currently local-only flag)
      isShared: this.input.isShared ?? false,
      requirements: this.input.requirements ?? {},
      metadata: {
        createdAt: now,
        createdBy: this.input.createdBy ?? "user",
        modifiedAt: now,
        modifiedBy: this.input.createdBy ?? "user",
        tags: this.input.tags
      }
    };
    ctx.stores.templateStore.add(template);
    return { success: true, affectedElementIds: [this.input.id] };
  }
  undo(ctx) {
    ctx.stores.templateStore?.remove(this.input.id);
    return { success: true, affectedElementIds: [this.input.id] };
  }
  serialize() {
    return {
      type: this.type,
      targetIds: this.targetIds,
      timestamp: this.timestamp,
      version: 1,
      payload: this.input
    };
  }
}

function _tracer$d() {
  return trace.getTracer("@pryzm/command-registry");
}
const PRE_EXISTING_TOL_M = 1e-3;
function crossingKey(v) {
  return `${v.hostWallId}|${v.openingId}`;
}
class CascadeWallBaselineCommand {
  affectedStores = ["wall"];
  id;
  type = CommandType.CASCADE_WALL_BASELINE;
  timestamp;
  targetIds;
  entries;
  cause;
  /** §L-990 — see `CascadeWallBaselineInput.movedSubject`. */
  movedSubject;
  /**
   * One full WallData snapshot per affected wall, indexed by wallId.
   * Captured during execute() so undo can `restoreSnapshot()` and preserve
   * metadata.version (no audit-trail drift — same pattern as
   * UpdateWallBaselineCommand).
   */
  prevSnapshots = /* @__PURE__ */ new Map();
  /**
   * §HOSTED-OPENING-HOST-MOVE — the PRE-EDIT openings this cascade moved, per
   * wall, so undo can put them back.
   *
   * Exists for exactly the reason `UpdateWallBaselineCommand.relocated` does:
   * `WallStore.restoreSnapshot()` restores baseLine / height / thickness /
   * layers / metadata but **NOT `openings`** — openings have their own
   * mutation API. So `prevSnapshots` alone cannot undo a relocation, and
   * without this record an undo would put a 4 m wall back while leaving its
   * door at the offset the 2 m wall forced on it. Silent data loss on the undo
   * path is the same defect as silent data loss on the edit path (C70 C-INV-3:
   * a move mints no new identity, and undo restores the one that was there).
   */
  relocated = /* @__PURE__ */ new Map();
  executed = false;
  constructor(input) {
    this.id = crypto.randomUUID();
    this.timestamp = Date.now();
    this.entries = input.entries.map((e) => ({
      wallId: e.wallId,
      newBaseLine: [{ ...e.newBaseLine[0] }, { ...e.newBaseLine[1] }],
      prevBaseLine: e.prevBaseLine ? [{ ...e.prevBaseLine[0] }, { ...e.prevBaseLine[1] }] : void 0
    }));
    this.cause = input.cause ?? "cascade";
    this.movedSubject = input.movedSubject ? {
      wallId: input.movedSubject.wallId,
      prevBaseLine: [
        { ...input.movedSubject.prevBaseLine[0] },
        { ...input.movedSubject.prevBaseLine[1] }
      ]
    } : void 0;
    this.targetIds = this.entries.map((e) => e.wallId);
    Object.freeze(this.targetIds);
  }
  canExecute(ctx) {
    const wallStore = ctx.stores.wallStore;
    const missing = [];
    const tooShort = [];
    for (const e of this.entries) {
      if (!wallStore.getById(e.wallId)) {
        missing.push(e.wallId);
        continue;
      }
      const dx = e.newBaseLine[1].x - e.newBaseLine[0].x;
      const dy = e.newBaseLine[1].y - e.newBaseLine[0].y;
      const dz = e.newBaseLine[1].z - e.newBaseLine[0].z;
      if (Math.sqrt(dx * dx + dy * dy + dz * dz) < 0.1) {
        tooShort.push(e.wallId);
      }
    }
    if (missing.length > 0) {
      return {
        ok: false,
        reason: "WALL_NOT_FOUND",
        blockingIssues: missing.map((id) => `WALL_NOT_FOUND: ${id}`)
      };
    }
    if (tooShort.length > 0) {
      return {
        ok: false,
        reason: "WALL_TOO_SHORT",
        blockingIssues: tooShort.map((id) => `WALL_TOO_SHORT: ${id} minimum 0.1m`)
      };
    }
    const openingIssues = [];
    for (const e of this.entries) {
      const wall = wallStore.getById(e.wallId);
      if (!wall) continue;
      const plan = wallOccupancyStore$1.planOpeningRebase(wall, e.newBaseLine);
      for (const r of plan.refusals) {
        openingIssues.push(`OPENING_DOES_NOT_FIT: ${e.wallId}: ${r.reason}`);
      }
    }
    if (openingIssues.length > 0) {
      return { ok: false, reason: "OPENING_DOES_NOT_FIT", blockingIssues: openingIssues };
    }
    const _c83g = globalThis;
    if (_c83g.__pryzmProjectLoadActive !== true && _c83g.__pryzmBuildingGenActive !== true) {
      const allWalls = wallStore.getAll();
      const preWalls = this.preGestureWalls(allWalls);
      const crossingIssues = [];
      const preExisting = [];
      for (const e of this.entries) {
        const wall = wallStore.getById(e.wallId);
        if (!wall) continue;
        const candidate = {
          id: e.wallId,
          // excludes the subject from its own host list
          levelId: wall.levelId,
          thickness: typeof wall.thickness === "number" ? wall.thickness : 0,
          baseLine: [e.newBaseLine[0], e.newBaseLine[1]],
          // §PRE-WELD-TRANSIENT — a cascade is ALL re-weld, so every
          // entry's joined neighbours are mid-correction by definition.
          ...wall.baseLine?.[0] && wall.baseLine?.[1] ? { currentBaseLine: [wall.baseLine[0], wall.baseLine[1]] } : {},
          ...wall.curve !== void 0 ? { curve: wall.curve } : {}
        };
        const spatial = evaluateWallPlacement(candidate, allWalls);
        if (spatial.valid) continue;
        let novel = spatial.violations;
        if (preWalls) {
          const priorCandidate = {
            id: candidate.id,
            levelId: candidate.levelId,
            thickness: candidate.thickness,
            baseLine: this.preGesturePose(e, wall),
            ...candidate.curve !== void 0 ? { curve: candidate.curve } : {}
          };
          const before = findWallOpeningCrossings(priorCandidate, preWalls).violations;
          const priorDepth = /* @__PURE__ */ new Map();
          for (const v of before) {
            priorDepth.set(crossingKey(v), Math.max(priorDepth.get(crossingKey(v)) ?? 0, v.overlapM));
          }
          novel = spatial.violations.filter((v) => {
            const prior = priorDepth.get(crossingKey(v));
            return prior === void 0 || v.overlapM > prior + PRE_EXISTING_TOL_M;
          });
        }
        if (novel.length === 0) {
          preExisting.push(
            `${e.wallId}: ` + wallCrossesOpeningRefusalText(spatial.violations, [])
          );
          continue;
        }
        crossingIssues.push(
          `${e.wallId}: ` + wallCrossesOpeningRefusalText(
            novel,
            novel.length === spatial.violations.length ? spatial.offers : computeWallCrossingOffers(candidate, allWalls, novel, spatial.undetermined)
          )
        );
      }
      if (preExisting.length > 0) {
        console.warn(
          `[CascadeWallBaselineCommand] §L-990 ${preExisting.length} crossing(s) in this '${this.cause}' cascade were ALREADY STANDING before the gesture and are REPORTED, NOT REFUSED — the same disposition §L-942-UNBLOCK gives the incumbent arm. They are unchanged by this move; Ctrl+Z reverts the move but will not remove them.`,
          { preExisting }
        );
      }
      if (crossingIssues.length > 0) {
        return {
          ok: false,
          reason: "OCC_CROSSES_HOSTED_OPENING",
          blockingIssues: crossingIssues,
          ...preExisting.length > 0 ? { warnings: preExisting } : {}
        };
      }
      if (preExisting.length > 0) {
        return { ok: true, warnings: preExisting };
      }
    }
    return { ok: true };
  }
  /**
   * §L-990 — the wall list AS IT STOOD BEFORE THE GESTURE, or `null` when that
   * is not knowable.
   *
   * Only ONE wall differs between the cascade's world and the pre-gesture
   * world at the moment `canExecute` runs: the SUBJECT, which has already been
   * re-baselined (on the real path by `UpdateWallBaselineCommand`, on the
   * pre-flight path by `moveReweldPreflight`'s shim). The cascade's own
   * entries have not been applied yet — that is what `canExecute` means — so
   * every other wall is already at its pre-gesture pose.
   *
   * Returns `null` without `movedSubject`, and the caller then attempts no
   * attribution at all. C83 §5.3's reading, applied to this question.
   */
  preGestureWalls(all) {
    const ms = this.movedSubject;
    if (!ms) return null;
    let found = false;
    const out = all.map((w) => {
      if (w.id !== ms.wallId) return w;
      found = true;
      return {
        ...w,
        baseLine: [{ ...ms.prevBaseLine[0] }, { ...ms.prevBaseLine[1] }]
      };
    });
    return found ? out : null;
  }
  /** §L-990 — where THIS entry's wall stood before the gesture. */
  preGesturePose(e, wall) {
    if (this.movedSubject && e.wallId === this.movedSubject.wallId) {
      return this.movedSubject.prevBaseLine;
    }
    if (e.prevBaseLine) return e.prevBaseLine;
    const bl = wall.baseLine;
    if (bl && bl.length >= 2) return [bl[0], bl[1]];
    return [e.newBaseLine[0], e.newBaseLine[1]];
  }
  /**
   * P8 / C10 §2 — the cascade's span. Delegating rather than re-indenting a
   * ~140-line body keeps this an ADDITIVE change to a file three lanes have
   * touched this week; same idiom as `roomBoundarySketch.ts` in this package.
   */
  execute(ctx) {
    return _tracer$d().startActiveSpan("pryzm.wall.cascadeBaseline", (span) => {
      try {
        span.setAttribute("pryzm.cascade.cause", this.cause);
        span.setAttribute("pryzm.cascade.entries", this.entries.length);
        const r = this._execute(ctx);
        span.setAttribute("pryzm.cascade.success", r.success);
        span.setAttribute("pryzm.cascade.affected", r.affectedElementIds.length);
        if (!r.success) span.setAttribute("pryzm.cascade.reason", r.error ?? r.info?.[0] ?? "");
        return r;
      } finally {
        span.end();
      }
    });
  }
  _execute(ctx) {
    if (this.executed) {
      return { success: false, affectedElementIds: [], info: ["Command already executed"] };
    }
    const wallStore = ctx.stores.wallStore;
    for (const e of this.entries) {
      const wall = wallStore.getById(e.wallId);
      if (!wall) {
        return {
          success: false,
          affectedElementIds: [],
          info: [`Wall ${e.wallId} disappeared between canExecute and execute`]
        };
      }
      const snapshot = serializeWallSnapshot(wall);
      if (e.prevBaseLine) {
        snapshot.baseLine = [
          { x: e.prevBaseLine[0].x, y: e.prevBaseLine[0].y, z: e.prevBaseLine[0].z },
          { x: e.prevBaseLine[1].x, y: e.prevBaseLine[1].y, z: e.prevBaseLine[1].z }
        ];
      }
      this.prevSnapshots.set(e.wallId, snapshot);
    }
    const plans = /* @__PURE__ */ new Map();
    const refusalSentences = [];
    for (const e of this.entries) {
      const wall = wallStore.getById(e.wallId);
      const plan = wallOccupancyStore$1.planOpeningRebase(wall, e.newBaseLine);
      plans.set(e.wallId, plan);
      for (const r of plan.refusals) {
        refusalSentences.push(`${e.wallId}: ${r.reason}`);
      }
    }
    if (refusalSentences.length > 0) {
      const reason = refusalSentences.join("; ");
      console.warn(
        `[CascadeWallBaselineCommand] §HOSTED-OPENING-HOST-MOVE refusing '${this.cause}' cascade (${this.entries.length} entry/entries): ${reason} — no wall was re-baselined.`
      );
      return {
        success: false,
        affectedElementIds: [],
        info: [`OPENING_DOES_NOT_FIT: ${reason}`],
        error: `OPENING_DOES_NOT_FIT: ${reason}`
      };
    }
    this.relocated = /* @__PURE__ */ new Map();
    try {
      for (const e of this.entries) {
        const wall = wallStore.getById(e.wallId);
        const baseVersion = (wall?._renderVersion ?? 0) + 1;
        wallStore.update(e.wallId, {
          baseLine: e.newBaseLine,
          _renderVersion: baseVersion
        });
      }
      for (const e of this.entries) {
        const plan = plans.get(e.wallId);
        if (!plan || plan.relocations.length === 0) continue;
        const pre = [];
        for (const r of plan.relocations) {
          const next = {
            ...r.opening,
            offset: r.next.offset,
            sillHeight: r.next.sillHeight
          };
          try {
            reseatOpeningWithFrame(
              wallStore,
              e.wallId,
              next,
              "CascadeWallBaselineCommand"
            );
            pre.push(r.opening);
            console.log(
              `[CascadeWallBaselineCommand] §HOSTED-OPENING-HOST-MOVE re-seated ${r.opening.type} ${r.opening.elementId ?? r.opening.id} on wall ${e.wallId}: offset ${r.opening.offset.toFixed(3)} → ${r.next.offset.toFixed(3)} m (cause '${this.cause}')`
            );
          } catch (err) {
            console.warn(
              `[CascadeWallBaselineCommand] §HOSTED-OPENING-HOST-MOVE could not re-seat opening ${r.opening.id} on wall ${e.wallId}:`,
              err
            );
          }
        }
        if (pre.length > 0) this.relocated.set(e.wallId, pre);
      }
    } finally {
    }
    this.executed = true;
    return { success: true, affectedElementIds: [...this.targetIds] };
  }
  undo(ctx) {
    if (!this.executed || this.prevSnapshots.size === 0) {
      return { success: false, affectedElementIds: [], info: ["Nothing to undo"] };
    }
    const wallStore = ctx.stores.wallStore;
    const restored = [];
    try {
      for (const e of [...this.entries].reverse()) {
        const snap = this.prevSnapshots.get(e.wallId);
        if (snap) {
          wallStore.restoreSnapshot(snap);
          restored.push(e.wallId);
        }
        for (const opening of this.relocated.get(e.wallId) ?? []) {
          try {
            reseatOpeningWithFrame(
              wallStore,
              e.wallId,
              opening,
              "CascadeWallBaselineCommand.undo"
            );
          } catch (err) {
            console.warn(
              `[CascadeWallBaselineCommand] §HOSTED-OPENING-HOST-MOVE undo could not restore opening ${opening.id} on wall ${e.wallId}:`,
              err
            );
          }
        }
      }
    } finally {
    }
    this.relocated = /* @__PURE__ */ new Map();
    this.executed = false;
    return { success: true, affectedElementIds: restored };
  }
  serialize() {
    return {
      type: this.type,
      timestamp: this.timestamp,
      targetIds: [...this.targetIds],
      version: 1,
      payload: {
        cause: this.cause,
        entries: this.entries.map((e) => ({
          wallId: e.wallId,
          newBaseLine: [
            { x: e.newBaseLine[0].x, y: e.newBaseLine[0].y, z: e.newBaseLine[0].z },
            { x: e.newBaseLine[1].x, y: e.newBaseLine[1].y, z: e.newBaseLine[1].z }
          ]
        }))
      }
    };
  }
}

class UpdateWallColorCommand {
  constructor(input) {
    this.input = input;
    this.targetIds = [input.wallId];
  }
  input;
  affectedStores = ["wall"];
  id = crypto.randomUUID();
  type = CommandType.UPDATE_WALL_COLOR;
  timestamp = Date.now();
  targetIds;
  prevSnapshot = null;
  canExecute(ctx) {
    const wall = ctx.stores.wallStore.getById(this.input.wallId);
    if (!wall) return { ok: false, reason: `Wall ${this.input.wallId} not found` };
    if (!this.input.materialColor && this.input.materialId === void 0) {
      return { ok: false, reason: "No visual properties specified" };
    }
    return { ok: true };
  }
  execute(ctx) {
    const wall = ctx.stores.wallStore.getById(this.input.wallId);
    if (!wall) return { success: false, affectedElementIds: [] };
    this.prevSnapshot = serializeWallSnapshot(wall);
    const nextState = { ...serializeWallSnapshot(wall) };
    if (this.input.materialColor !== void 0) nextState.materialColor = this.input.materialColor;
    if (this.input.materialId !== void 0) nextState.materialId = this.input.materialId ?? null;
    ctx.stores.wallStore.updateWall(nextState);
    return { success: true, affectedElementIds: [this.input.wallId] };
  }
  undo(ctx) {
    if (!this.prevSnapshot) return { success: false, affectedElementIds: [] };
    ctx.stores.wallStore.restoreSnapshot(this.prevSnapshot);
    return { success: true, affectedElementIds: [this.input.wallId] };
  }
  serialize() {
    return {
      type: this.type,
      targetIds: this.targetIds,
      timestamp: this.timestamp,
      version: 1,
      payload: this.input
    };
  }
}

class UpdateWallLayersCommand {
  constructor(input) {
    this.input = input;
    this.targetIds = [input.wallId];
  }
  input;
  affectedStores = ["wall"];
  id = crypto.randomUUID();
  type = CommandType.UPDATE_WALL_LAYERS;
  timestamp = Date.now();
  targetIds;
  prevSnapshot = null;
  /** Snapshots of ALL sibling walls that were also updated (type propagation). */
  prevSiblingSnapshots = [];
  /** Previous type definition, if a WallSystemType was updated. */
  prevTypeSnapshot = null;
  canExecute(ctx) {
    const wall = ctx.stores.wallStore.getById(this.input.wallId);
    if (!wall) return { ok: false, reason: `Wall ${this.input.wallId} not found` };
    if (!this.input.layers || this.input.layers.length === 0) {
      return { ok: false, reason: "Layer stack must contain at least one layer" };
    }
    if (this.input.thickness <= 0) {
      return { ok: false, reason: "Total thickness must be positive" };
    }
    return { ok: true };
  }
  execute(ctx) {
    const wall = ctx.stores.wallStore.getById(this.input.wallId);
    if (!wall) return { success: false, affectedElementIds: [] };
    this.prevSnapshot = serializeWallSnapshot(wall);
    this.prevSiblingSnapshots = [];
    this.prevTypeSnapshot = null;
    const frozenLayers = this.input.layers.map((l) => Object.freeze({ ...l }));
    const affectedIds = [this.input.wallId];
    const typeId = this.input.systemTypeId ?? wall.systemTypeId ?? null;
    if (typeId) {
      const typeStore = ctx.stores.wallSystemTypeStore;
      if (typeStore) {
        const existingType = typeStore.getById(typeId);
        if (existingType) {
          this.prevTypeSnapshot = { id: typeId, layers: existingType.layers, totalThickness: existingType.totalThickness };
          typeStore.update(typeId, { layers: frozenLayers });
          const allWalls = ctx.stores.wallStore.getAll();
          for (const sibling of allWalls) {
            if (sibling.id === this.input.wallId) continue;
            if (sibling.systemTypeId !== typeId) continue;
            this.prevSiblingSnapshots.push(serializeWallSnapshot(sibling));
            const siblingNext = {
              ...serializeWallSnapshot(sibling),
              layers: frozenLayers,
              thickness: this.input.thickness
            };
            ctx.stores.wallStore.updateWall(siblingNext);
            affectedIds.push(sibling.id);
          }
        }
      }
    }
    const nextState = {
      ...serializeWallSnapshot(wall),
      layers: frozenLayers,
      thickness: this.input.thickness
    };
    if (typeId !== void 0) {
      nextState.systemTypeId = typeId;
    }
    ctx.stores.wallStore.updateWall(nextState);
    return { success: true, affectedElementIds: affectedIds };
  }
  undo(ctx) {
    if (!this.prevSnapshot) return { success: false, affectedElementIds: [] };
    const affectedIds = [this.input.wallId];
    for (const snap of this.prevSiblingSnapshots) {
      const restored = deserializeWallSnapshot(snap);
      ctx.stores.wallStore.updateWall(restored);
      affectedIds.push(snap.id);
    }
    if (this.prevTypeSnapshot && ctx.stores.wallSystemTypeStore) {
      ctx.stores.wallSystemTypeStore.update(this.prevTypeSnapshot.id, {
        layers: this.prevTypeSnapshot.layers
      });
    }
    ctx.stores.wallStore.restoreSnapshot(this.prevSnapshot);
    return { success: true, affectedElementIds: affectedIds };
  }
  serialize() {
    return {
      type: this.type,
      targetIds: this.targetIds,
      timestamp: this.timestamp,
      version: 1,
      payload: this.input
    };
  }
}

class UpdateWallSystemTypeCommand {
  constructor(input) {
    this.input = input;
    this.targetIds = [input.wallId];
  }
  input;
  affectedStores = ["wall"];
  id = crypto.randomUUID();
  type = CommandType.UPDATE_WALL_SYSTEM_TYPE;
  timestamp = Date.now();
  targetIds;
  prevSnapshot = null;
  canExecute(ctx) {
    const wall = ctx.stores.wallStore.getById(this.input.wallId);
    if (!wall) return { ok: false, reason: `Wall ${this.input.wallId} not found` };
    const nextLayers = this.input.layers ?? void 0;
    const rake = rakeAuthorability({
      rakeAngleDeg: wall.rakeAngleDeg,
      curve: wall.curve,
      openings: (nextLayers?.length ?? 0) > 1 ? wall.openings : void 0
    });
    if (!rake.ok) {
      return {
        ok: false,
        reason: `This wall is angled (raked), so it cannot take this wall type — set its Vertical Angle back to 90° first, remove its openings, or pick a single-layer type. ${rake.reason ?? ""}`
      };
    }
    return { ok: true };
  }
  execute(ctx) {
    const wall = ctx.stores.wallStore.getById(this.input.wallId);
    if (!wall) return { success: false, affectedElementIds: [] };
    this.prevSnapshot = serializeWallSnapshot(wall);
    const nextState = {
      ...serializeWallSnapshot(wall),
      systemTypeId: this.input.systemTypeId ?? null,
      layers: this.input.layers ?? void 0
    };
    if (this.input.thickness !== void 0) {
      nextState.thickness = this.input.thickness;
    }
    ctx.stores.wallStore.updateWall(nextState);
    return { success: true, affectedElementIds: [this.input.wallId] };
  }
  undo(ctx) {
    if (!this.prevSnapshot) return { success: false, affectedElementIds: [] };
    ctx.stores.wallStore.restoreSnapshot(this.prevSnapshot);
    return { success: true, affectedElementIds: [this.input.wallId] };
  }
  serialize() {
    return {
      type: this.type,
      targetIds: this.targetIds,
      timestamp: this.timestamp,
      version: 1,
      payload: this.input
    };
  }
}

let _cachedTracer$7 = null;
function _tracer$c() {
  _cachedTracer$7 ??= trace.getTracer("@pryzm/command-registry", "0.1.0");
  return _cachedTracer$7;
}
const WALL_TYPE_DOMAIN_NOISE = ["wall", "walls", "wt"];
function resolveWallSystemTypeRef(store, ref) {
  return resolveCatalogueRef(store, ref, {
    domainNoise: WALL_TYPE_DOMAIN_NOISE,
    spanDomain: "pryzm.wall.systemType"
  }).entry;
}
class UpdateWallsSystemTypeBatchCommand {
  constructor(input) {
    this.input = input;
    this.targetIds = input.wallIds === "all" ? [] : [...input.wallIds];
  }
  input;
  affectedStores = ["wall"];
  id = crypto.randomUUID();
  type = CommandType.UPDATE_WALLS_SYSTEM_TYPE_BATCH;
  timestamp = Date.now();
  targetIds;
  /** Children that actually EXECUTED — undo replays these in reverse. */
  executedChildren = [];
  /** Refusals from the last execute() — exposed for callers that want detail. */
  _skipped = [];
  /** Skips recorded by the most recent execute() (empty before execution). */
  get skipped() {
    return this._skipped;
  }
  // ── Internals ────────────────────────────────────────────────────────────
  _catalogue(ctx) {
    return ctx.stores.wallSystemTypeStore ?? wallSystemTypeStore;
  }
  /** Resolve the requested type, or null-detach. `undefined` = unresolvable. */
  _resolveType(ctx) {
    if (this.input.systemType === null) return null;
    return resolveWallSystemTypeRef(this._catalogue(ctx), this.input.systemType) ?? void 0;
  }
  _resolveWallIds(ctx) {
    if (this.input.wallIds === "all") {
      return ctx.stores.wallStore.getAll().map((w) => w.id);
    }
    return Array.from(new Set(this.input.wallIds));
  }
  /** Build the single-wall child for one wall id (REUSE of the proven path). */
  _child(wallId, type) {
    return type === null ? new UpdateWallSystemTypeCommand({ wallId, systemTypeId: null, layers: null }) : new UpdateWallSystemTypeCommand({
      wallId,
      systemTypeId: type.id,
      // Per-wall deep copy — walls must not share one mutable layer array.
      layers: type.layers.map((l) => ({ ...l })),
      thickness: type.totalThickness
    });
  }
  _typeLabel(type) {
    return type === null ? "no type (monolithic)" : `"${type.name}"`;
  }
  // ── Command surface ──────────────────────────────────────────────────────
  canExecute(ctx) {
    const type = this._resolveType(ctx);
    if (type === void 0) {
      return {
        ok: false,
        reason: `Unknown wall type "${this.input.systemType}" — no wall type with that id or name exists in this project.`
      };
    }
    const ids = this._resolveWallIds(ctx);
    if (ids.length === 0) {
      return {
        ok: false,
        reason: this.input.wallIds === "all" ? "There are no walls in this project to change." : "No walls selected — select at least one wall first."
      };
    }
    const refusals = [];
    let acceptable = 0;
    for (const wallId of ids) {
      const v = this._child(wallId, type).canExecute(ctx);
      if (v.ok) acceptable++;
      else refusals.push(childRefusalText(v.reason, "UpdateWallSystemTypeCommand.canExecute", `wall ${wallId}`));
    }
    if (acceptable === 0) {
      return {
        ok: false,
        reason: `None of the ${ids.length} wall${ids.length === 1 ? "" : "s"} can take ${this._typeLabel(type)} — ${refusals[0]}`
      };
    }
    return { ok: true, warnings: refusals.length > 0 ? refusals : void 0 };
  }
  execute(ctx) {
    return _tracer$c().startActiveSpan("pryzm.wall.updateSystemType.batch", (span) => {
      try {
        this.executedChildren = [];
        this._skipped = [];
        const type = this._resolveType(ctx);
        if (type === void 0) {
          span.setAttribute("pryzm.wall.typeBatch.unresolvedType", true);
          return {
            success: false,
            affectedElementIds: [],
            info: [`Unknown wall type "${this.input.systemType}".`]
          };
        }
        const ids = this._resolveWallIds(ctx);
        this.targetIds = [...ids];
        const affected = [];
        for (const wallId of ids) {
          const child = this._child(wallId, type);
          const v = child.canExecute(ctx);
          if (!v.ok) {
            this._skipped.push({ wallId, reason: childRefusalText(v.reason, "UpdateWallSystemTypeCommand.canExecute", `wall ${wallId}`) });
            continue;
          }
          const r = child.execute(ctx);
          if (r.success) {
            this.executedChildren.push(child);
            affected.push(wallId);
          } else {
            this._skipped.push({
              wallId,
              reason: childRefusalText(r.info?.[0], "UpdateWallSystemTypeCommand.execute", `wall ${wallId}`)
            });
          }
        }
        const total = ids.length;
        const changed = affected.length;
        const skippedCount = this._skipped.length;
        const reasonCounts = /* @__PURE__ */ new Map();
        for (const s of this._skipped) {
          reasonCounts.set(s.reason, (reasonCounts.get(s.reason) ?? 0) + 1);
        }
        const reasonLines = [...reasonCounts.entries()].map(
          ([reason, count]) => `${count}× ${reason}`
        );
        const summary = `Changed ${changed} of ${total} wall${total === 1 ? "" : "s"} to ${this._typeLabel(type)}` + (skippedCount > 0 ? ` — ${skippedCount} skipped` : "");
        span.setAttribute("pryzm.wall.typeBatch.total", total);
        span.setAttribute("pryzm.wall.typeBatch.changed", changed);
        span.setAttribute("pryzm.wall.typeBatch.skipped", skippedCount);
        span.setAttribute("pryzm.wall.typeBatch.systemType", this.input.systemType ?? "<detach>");
        span.setAttribute("pryzm.wall.typeBatch.scope", this.input.wallIds === "all" ? "all" : "ids");
        return {
          // Success iff at least one wall changed; the all-refused case is
          // normally intercepted by canExecute, but execute() re-checks
          // against live state and reports rather than throwing.
          success: changed > 0,
          affectedElementIds: affected,
          info: [summary, ...reasonLines]
        };
      } catch (err) {
        span.recordException(err);
        throw err;
      } finally {
        span.end();
      }
    });
  }
  undo(ctx) {
    const affected = [];
    for (let i = this.executedChildren.length - 1; i >= 0; i--) {
      const child = this.executedChildren[i];
      if (!child) continue;
      const r = child.undo(ctx);
      if (r.success) affected.push(...r.affectedElementIds);
    }
    return { success: true, affectedElementIds: affected };
  }
  serialize() {
    return {
      type: this.type,
      targetIds: this.targetIds,
      timestamp: this.timestamp,
      version: 1,
      payload: this.input
    };
  }
  static deserialize(serialized) {
    return new UpdateWallsSystemTypeBatchCommand(
      serialized.payload
    );
  }
}

let _cachedTracer$6 = null;
function _tracer$b() {
  _cachedTracer$6 ??= trace.getTracer("@pryzm/command-registry", "0.1.0");
  return _cachedTracer$6;
}
const HEX_COLOR_RE$7 = /^#[0-9a-fA-F]{6}$/;
class UpdateWallsColorBatchCommand {
  constructor(input) {
    this.input = input;
    this.targetIds = input.wallIds === "all" ? [] : [...input.wallIds];
  }
  input;
  affectedStores = ["wall"];
  id = crypto.randomUUID();
  type = CommandType.UPDATE_WALLS_COLOR_BATCH;
  timestamp = Date.now();
  targetIds;
  /** Children that actually EXECUTED — undo replays these in reverse. */
  executedChildren = [];
  _skipped = [];
  /** Skips recorded by the most recent execute() (empty before execution). */
  get skipped() {
    return this._skipped;
  }
  _resolveWallIds(ctx) {
    if (this.input.wallIds === "all") {
      return ctx.stores.wallStore.getAll().map((w) => w.id);
    }
    return Array.from(new Set(this.input.wallIds));
  }
  _child(wallId) {
    return new UpdateWallColorCommand({
      wallId,
      ...this.input.materialColor !== void 0 ? { materialColor: this.input.materialColor } : {},
      ...this.input.materialId !== void 0 ? { materialId: this.input.materialId } : {}
    });
  }
  _valueLabel() {
    const parts = [];
    if (this.input.materialColor !== void 0) parts.push(this.input.materialColor);
    if (this.input.materialId !== void 0) {
      parts.push(this.input.materialId === null ? "no material (cleared)" : `material "${this.input.materialId}"`);
    }
    return parts.join(" + ");
  }
  canExecute(ctx) {
    if (this.input.materialColor === void 0 && this.input.materialId === void 0) {
      return { ok: false, reason: "No visual properties specified — provide materialColor and/or materialId." };
    }
    if (this.input.materialColor !== void 0 && !HEX_COLOR_RE$7.test(this.input.materialColor)) {
      return { ok: false, reason: `materialColor must be a '#rrggbb' hex string, got "${this.input.materialColor}".` };
    }
    const ids = this._resolveWallIds(ctx);
    if (ids.length === 0) {
      return {
        ok: false,
        reason: this.input.wallIds === "all" ? "There are no walls in this project to recolour." : "No walls selected — select at least one wall first."
      };
    }
    const refusals = [];
    let acceptable = 0;
    for (const wallId of ids) {
      const v = this._child(wallId).canExecute(ctx);
      if (v.ok) acceptable++;
      else refusals.push(childRefusalText(v.reason, "UpdateWallColorCommand.canExecute", `wall ${wallId}`));
    }
    if (acceptable === 0) {
      return {
        ok: false,
        reason: `None of the ${ids.length} wall${ids.length === 1 ? "" : "s"} can take ${this._valueLabel()} — ${refusals[0]}`
      };
    }
    return { ok: true, warnings: refusals.length > 0 ? refusals : void 0 };
  }
  execute(ctx) {
    return _tracer$b().startActiveSpan("pryzm.wall.updateColor.batch", (span) => {
      try {
        this.executedChildren = [];
        this._skipped = [];
        const ids = this._resolveWallIds(ctx);
        this.targetIds = [...ids];
        const affected = [];
        for (const wallId of ids) {
          const child = this._child(wallId);
          const v = child.canExecute(ctx);
          if (!v.ok) {
            this._skipped.push({ wallId, reason: childRefusalText(v.reason, "UpdateWallColorCommand.canExecute", `wall ${wallId}`) });
            continue;
          }
          const r = child.execute(ctx);
          if (r.success) {
            this.executedChildren.push(child);
            affected.push(wallId);
          } else {
            this._skipped.push({ wallId, reason: childRefusalText(r.info?.[0], "UpdateWallColorCommand.execute", `wall ${wallId}`) });
          }
        }
        const total = ids.length;
        const changed = affected.length;
        const skippedCount = this._skipped.length;
        const reasonCounts = /* @__PURE__ */ new Map();
        for (const s of this._skipped) {
          reasonCounts.set(s.reason, (reasonCounts.get(s.reason) ?? 0) + 1);
        }
        const reasonLines = [...reasonCounts.entries()].map(
          ([reason, count]) => `${count}× ${reason}`
        );
        const summary = `Recoloured ${changed} of ${total} wall${total === 1 ? "" : "s"} to ${this._valueLabel()}` + (skippedCount > 0 ? ` — ${skippedCount} skipped` : "");
        span.setAttribute("pryzm.wall.colorBatch.total", total);
        span.setAttribute("pryzm.wall.colorBatch.changed", changed);
        span.setAttribute("pryzm.wall.colorBatch.skipped", skippedCount);
        span.setAttribute("pryzm.wall.colorBatch.scope", this.input.wallIds === "all" ? "all" : "ids");
        return {
          success: changed > 0,
          affectedElementIds: affected,
          info: [summary, ...reasonLines]
        };
      } catch (err) {
        span.recordException(err);
        throw err;
      } finally {
        span.end();
      }
    });
  }
  undo(ctx) {
    const affected = [];
    for (let i = this.executedChildren.length - 1; i >= 0; i--) {
      const child = this.executedChildren[i];
      if (!child) continue;
      const r = child.undo(ctx);
      if (r.success) affected.push(...r.affectedElementIds);
    }
    return { success: true, affectedElementIds: affected };
  }
  serialize() {
    return {
      type: this.type,
      targetIds: this.targetIds,
      timestamp: this.timestamp,
      version: 1,
      payload: this.input
    };
  }
  static deserialize(serialized) {
    return new UpdateWallsColorBatchCommand(
      serialized.payload
    );
  }
}

let _cachedTracer$5 = null;
function _tracer$a() {
  _cachedTracer$5 ??= trace.getTracer("@pryzm/command-registry", "0.1.0");
  return _cachedTracer$5;
}
function _curveMinRadius(w) {
  const rec = w;
  if (!rec.curve || !rec.curve.control || !rec.baseLine || rec.baseLine.length < 2) return void 0;
  try {
    const r = arcMinTurnRadius(rec);
    return Number.isFinite(r) ? r : void 0;
  } catch {
    return void 0;
  }
}
class UpdateWallsRakeBatchCommand {
  constructor(input) {
    this.input = input;
    this.targetIds = input.wallIds === "all" ? [] : [...input.wallIds];
  }
  input;
  affectedStores = ["wall"];
  id = crypto.randomUUID();
  type = CommandType.UPDATE_WALLS_RAKE_BATCH;
  timestamp = Date.now();
  targetIds;
  /** Children that actually EXECUTED — undo replays these in reverse. */
  executedChildren = [];
  _skipped = [];
  /** Skips recorded by the most recent execute() (empty before execution). */
  get skipped() {
    return this._skipped;
  }
  _resolveWalls(ctx) {
    const store = ctx.stores.wallStore;
    if (this.input.wallIds === "all") return store.getAll();
    const out = [];
    for (const id of new Set(this.input.wallIds)) {
      const w = store.getById?.(id);
      if (w !== void 0) out.push(w);
      else this._skipped.push({ wallId: id, reason: "wall not found" });
    }
    return out;
  }
  /** The store's OWN refusal policy, applied to the TARGET angle on this
   *  wall's actual shape — never a re-typed copy of the rules. */
  _refusal(w) {
    const subject = {
      rakeAngleDeg: this.input.rakeAngleDeg,
      curve: w.curve,
      layers: w.layers ?? w.wallType?.layers,
      openings: w.openings ?? w.childrenIds,
      height: typeof w.height === "number" ? w.height : void 0,
      curveMinRadiusM: _curveMinRadius(w)
    };
    const verdict = rakeAuthorability(subject);
    return verdict.ok ? null : verdict.reason ?? verdict.code ?? "refused";
  }
  _child(wallId) {
    return new UpdateElementParameterCommand({
      elementId: wallId,
      elementType: "wall",
      parameters: { rakeAngleDeg: this.input.rakeAngleDeg }
    });
  }
  canExecute(ctx) {
    const deg = this.input.rakeAngleDeg;
    if (typeof deg !== "number" || !Number.isFinite(deg)) {
      return { ok: false, reason: "rakeAngleDeg must be a finite number of degrees (90 = vertical)." };
    }
    if (!isRakeInRange(deg)) {
      return {
        ok: false,
        reason: `A wall can lean between ${RAKE_MIN_DEG}° and ${RAKE_MAX_DEG}° (90° = vertical); ${deg}° is outside that range.`
      };
    }
    this._skipped = [];
    const walls = this._resolveWalls(ctx);
    if (walls.length === 0) {
      return {
        ok: false,
        reason: this.input.wallIds === "all" ? "There are no walls in this project to rake." : "None of the requested walls exist any more."
      };
    }
    const refusals = this._skipped.map(
      (s) => `Wall ${s.wallId}: ${s.reason}`
    );
    let acceptable = 0;
    for (const w of walls) {
      const r = this._refusal(w);
      if (r === null) acceptable++;
      else refusals.push(r);
    }
    if (acceptable === 0) {
      return {
        ok: false,
        reason: `None of the ${walls.length} wall${walls.length === 1 ? "" : "s"} can lean to ${deg}° — ${refusals[0]}`
      };
    }
    return { ok: true, warnings: refusals.length > 0 ? refusals : void 0 };
  }
  execute(ctx) {
    return _tracer$a().startActiveSpan("pryzm.wall.updateRake.batch", (span) => {
      try {
        this.executedChildren = [];
        this._skipped = [];
        const walls = this._resolveWalls(ctx);
        this.targetIds = walls.map((w) => w.id);
        const affected = [];
        for (const w of walls) {
          const refusal = this._refusal(w);
          if (refusal !== null) {
            this._skipped.push({ wallId: w.id, reason: refusal });
            continue;
          }
          const child = this._child(w.id);
          const r = child.execute(ctx);
          if (r.success) {
            this.executedChildren.push(child);
            affected.push(w.id);
          } else {
            this._skipped.push({ wallId: w.id, reason: r.info?.[0] ?? "execution refused" });
          }
        }
        const total = walls.length + this._skipped.filter((s) => s.reason === "wall not found").length;
        const changed = affected.length;
        const skippedCount = this._skipped.length;
        const reasonCounts = /* @__PURE__ */ new Map();
        for (const s of this._skipped) {
          reasonCounts.set(s.reason, (reasonCounts.get(s.reason) ?? 0) + 1);
        }
        const reasonLines = [...reasonCounts.entries()].map(
          ([reason, count]) => `${count}× ${reason}`
        );
        const deg = this.input.rakeAngleDeg;
        const summary = `Raked ${changed} of ${total} wall${total === 1 ? "" : "s"} to ${deg}°` + (deg === 90 ? " (vertical)" : "") + (skippedCount > 0 ? ` — ${skippedCount} skipped` : "");
        span.setAttribute("pryzm.wall.rakeBatch.total", total);
        span.setAttribute("pryzm.wall.rakeBatch.changed", changed);
        span.setAttribute("pryzm.wall.rakeBatch.skipped", skippedCount);
        span.setAttribute("pryzm.wall.rakeBatch.angleDeg", deg);
        span.setAttribute("pryzm.wall.rakeBatch.scope", this.input.wallIds === "all" ? "all" : "ids");
        return {
          success: changed > 0,
          affectedElementIds: affected,
          info: [summary, ...reasonLines]
        };
      } catch (err) {
        span.recordException(err);
        throw err;
      } finally {
        span.end();
      }
    });
  }
  undo(ctx) {
    const affected = [];
    for (let i = this.executedChildren.length - 1; i >= 0; i--) {
      const child = this.executedChildren[i];
      if (!child) continue;
      const r = child.undo(ctx);
      if (r.success) affected.push(...r.affectedElementIds);
    }
    return { success: true, affectedElementIds: affected };
  }
  serialize() {
    return {
      type: this.type,
      targetIds: this.targetIds,
      timestamp: this.timestamp,
      version: 1,
      payload: this.input
    };
  }
  static deserialize(serialized) {
    return new UpdateWallsRakeBatchCommand(
      serialized.payload
    );
  }
}

let _cachedTracer$4 = null;
function _tracer$9() {
  _cachedTracer$4 ??= trace.getTracer("@pryzm/command-registry", "0.1.0");
  return _cachedTracer$4;
}
const HEX_COLOR_RE$6 = /^#[0-9a-fA-F]{6}$/;
const LAYER_MIN_M = 1e-3;
const LAYER_MAX_M = 0.5;
const round6$1 = (n) => Number(n.toFixed(6));
class AddWallLayerBatchCommand {
  constructor(input) {
    this.input = input;
    this.targetIds = input.wallIds === "all" ? [] : [...input.wallIds];
  }
  input;
  affectedStores = ["wall"];
  id = crypto.randomUUID();
  type = CommandType.ADD_WALL_LAYER_BATCH;
  timestamp = Date.now();
  targetIds;
  /** Children that actually EXECUTED — undo replays these in reverse; each
   *  child restores its full pre-change wall snapshot. */
  executedChildren = [];
  _skipped = [];
  /** Skips recorded by the most recent execute() (empty before execution). */
  get skipped() {
    return this._skipped;
  }
  _resolveWalls(ctx) {
    const store = ctx.stores.wallStore;
    if (this.input.wallIds === "all") return store.getAll();
    const out = [];
    for (const id of new Set(this.input.wallIds)) {
      const w = store.getById?.(id);
      if (w !== void 0) out.push(w);
      else this._skipped.push({ wallId: id, reason: "wall not found" });
    }
    return out;
  }
  /** The next instance layer stack for `w`, exterior-first, with the body
   *  seeded for monolithic walls so nothing is lost. */
  _nextLayers(w) {
    const existing = Array.isArray(w.layers) && w.layers.length > 0 ? w.layers.map((l) => ({ ...l })) : [{
      name: "Wall Body",
      function: "structure",
      thickness: w.thickness ?? 0.2,
      materialColor: w.materialColor ?? "#cccccc"
    }];
    const layer = {
      name: this.input.name,
      function: this.input.layerFunction ?? (this.input.side === "interior" ? "finish-interior" : "finish-exterior"),
      thickness: this.input.thickness,
      materialColor: this.input.materialColor,
      ...this.input.materialId !== void 0 ? { materialId: this.input.materialId } : {}
    };
    return this.input.side === "interior" ? [...existing, layer] : [layer, ...existing];
  }
  _child(w) {
    const layers = this._nextLayers(w);
    const thickness = round6$1(
      layers.reduce((sum, l) => sum + (typeof l["thickness"] === "number" ? l["thickness"] : 0), 0)
    );
    return new UpdateWallSystemTypeCommand({
      wallId: w.id,
      // Instance-scoped: the binding is kept for display; geometry follows layers.
      systemTypeId: w.systemTypeId ?? null,
      layers,
      thickness
    });
  }
  canExecute(ctx) {
    const t = this.input.thickness;
    if (typeof t !== "number" || !Number.isFinite(t) || t < LAYER_MIN_M || t > LAYER_MAX_M) {
      return {
        ok: false,
        reason: `A finish layer must be between ${LAYER_MIN_M * 1e3}mm and ${LAYER_MAX_M * 1e3}mm thick; got ${t}m.`
      };
    }
    if (!HEX_COLOR_RE$6.test(this.input.materialColor)) {
      return { ok: false, reason: `materialColor must be a '#rrggbb' hex string, got "${this.input.materialColor}".` };
    }
    if (typeof this.input.name !== "string" || this.input.name.trim().length === 0) {
      return { ok: false, reason: 'The layer needs a name (e.g. "Plaster · Skim Coat").' };
    }
    if (this.input.side !== "interior" && this.input.side !== "exterior") {
      return { ok: false, reason: "side must be 'interior' or 'exterior'." };
    }
    this._skipped = [];
    const walls = this._resolveWalls(ctx);
    if (walls.length === 0) {
      return {
        ok: false,
        reason: this.input.wallIds === "all" ? "There are no walls in this project to add a layer to." : "None of the requested walls exist any more."
      };
    }
    const refusals = this._skipped.map((s) => `Wall ${s.wallId}: ${s.reason}`);
    let acceptable = 0;
    for (const w of walls) {
      const v = this._child(w).canExecute(ctx);
      if (v.ok) acceptable++;
      else refusals.push(childRefusalText(v.reason, "UpdateWallSystemTypeCommand.canExecute", `wall ${w.id}`));
    }
    if (acceptable === 0) {
      return {
        ok: false,
        reason: `None of the ${walls.length} wall${walls.length === 1 ? "" : "s"} can take the ${this.input.name} layer — ${refusals[0]}`
      };
    }
    return { ok: true, warnings: refusals.length > 0 ? refusals : void 0 };
  }
  execute(ctx) {
    return _tracer$9().startActiveSpan("pryzm.wall.addLayer.batch", (span) => {
      try {
        this.executedChildren = [];
        this._skipped = [];
        const walls = this._resolveWalls(ctx);
        this.targetIds = walls.map((w) => w.id);
        const affected = [];
        for (const w of walls) {
          const child = this._child(w);
          const v = child.canExecute(ctx);
          if (!v.ok) {
            this._skipped.push({ wallId: w.id, reason: childRefusalText(v.reason, "UpdateWallSystemTypeCommand.canExecute", `wall ${w.id}`) });
            continue;
          }
          const r = child.execute(ctx);
          if (r.success) {
            this.executedChildren.push(child);
            affected.push(w.id);
          } else {
            this._skipped.push({ wallId: w.id, reason: childRefusalText(r.info?.[0], "UpdateWallSystemTypeCommand.execute", `wall ${w.id}`) });
          }
        }
        const total = walls.length + this._skipped.filter((s) => s.reason === "wall not found").length;
        const changed = affected.length;
        const skippedCount = this._skipped.length;
        const reasonCounts = /* @__PURE__ */ new Map();
        for (const s of this._skipped) {
          reasonCounts.set(s.reason, (reasonCounts.get(s.reason) ?? 0) + 1);
        }
        const reasonLines = [...reasonCounts.entries()].map(
          ([reason, count]) => `${count}× ${reason}`
        );
        const mm = round6$1(this.input.thickness * 1e3);
        const summary = `Added a ${mm}mm ${this.input.name} layer to the ${this.input.side} side of ${changed} of ${total} wall${total === 1 ? "" : "s"}` + (skippedCount > 0 ? ` — ${skippedCount} skipped` : "");
        span.setAttribute("pryzm.wall.layerBatch.total", total);
        span.setAttribute("pryzm.wall.layerBatch.changed", changed);
        span.setAttribute("pryzm.wall.layerBatch.skipped", skippedCount);
        span.setAttribute("pryzm.wall.layerBatch.side", this.input.side);
        span.setAttribute("pryzm.wall.layerBatch.thicknessM", this.input.thickness);
        span.setAttribute("pryzm.wall.layerBatch.scope", this.input.wallIds === "all" ? "all" : "ids");
        return {
          success: changed > 0,
          affectedElementIds: affected,
          info: [summary, ...reasonLines]
        };
      } catch (err) {
        span.recordException(err);
        throw err;
      } finally {
        span.end();
      }
    });
  }
  undo(ctx) {
    const affected = [];
    for (let i = this.executedChildren.length - 1; i >= 0; i--) {
      const child = this.executedChildren[i];
      if (!child) continue;
      const r = child.undo(ctx);
      if (r.success) affected.push(...r.affectedElementIds);
    }
    return { success: true, affectedElementIds: affected };
  }
  serialize() {
    return {
      type: this.type,
      targetIds: this.targetIds,
      timestamp: this.timestamp,
      version: 1,
      payload: this.input
    };
  }
  static deserialize(serialized) {
    return new AddWallLayerBatchCommand(
      serialized.payload
    );
  }
}

let _cachedTracer$3 = null;
function _tracer$8() {
  _cachedTracer$3 ??= trace.getTracer("@pryzm/command-registry", "0.1.0");
  return _cachedTracer$3;
}
const HEX_COLOR_RE$5 = /^#[0-9a-fA-F]{6}$/;
function sidesToApply(side) {
  return side === "both" ? ["exterior", "interior"] : [side];
}
class SetWallSideFinishCommand {
  constructor(input) {
    this.input = input;
    this.targetIds = [input.wallId];
  }
  input;
  affectedStores = ["wall"];
  id = crypto.randomUUID();
  type = CommandType.SET_WALL_SIDE_FINISH;
  timestamp = Date.now();
  targetIds;
  prevSnapshot = null;
  canExecute(ctx) {
    const wall = ctx.stores.wallStore.getById(this.input.wallId);
    if (!wall) return { ok: false, reason: `Wall ${this.input.wallId} not found` };
    if (this.input.side !== "interior" && this.input.side !== "exterior") {
      return {
        ok: false,
        reason: `side must be 'interior' or 'exterior' (the semantic side), got "${String(this.input.side)}".`
      };
    }
    const f = this.input.finish;
    if (!f || typeof f.materialId !== "string" || f.materialId.length === 0) {
      return { ok: false, reason: "finish.materialId is required." };
    }
    if (f.materialColor !== void 0 && !HEX_COLOR_RE$5.test(f.materialColor)) {
      return {
        ok: false,
        reason: `finish.materialColor must be a '#rrggbb' hex string, got "${f.materialColor}".`
      };
    }
    return { ok: true };
  }
  execute(ctx) {
    const wall = ctx.stores.wallStore.getById(this.input.wallId);
    if (!wall) return { success: false, affectedElementIds: [] };
    this.prevSnapshot = serializeWallSnapshot(wall);
    const nextState = { ...serializeWallSnapshot(wall) };
    nextState.sideFinishes = withWallSideFinish(wall, this.input.side, this.input.finish);
    ctx.stores.wallStore.updateWall(nextState);
    return { success: true, affectedElementIds: [this.input.wallId] };
  }
  undo(ctx) {
    if (!this.prevSnapshot) return { success: false, affectedElementIds: [] };
    ctx.stores.wallStore.restoreSnapshot(this.prevSnapshot);
    return { success: true, affectedElementIds: [this.input.wallId] };
  }
  serialize() {
    return {
      type: this.type,
      targetIds: this.targetIds,
      timestamp: this.timestamp,
      version: 1,
      payload: this.input
    };
  }
}
class SetWallSideFinishBatchCommand {
  constructor(input) {
    this.input = input;
    this.targetIds = input.wallIds === "all" ? [] : [...input.wallIds];
  }
  input;
  affectedStores = ["wall"];
  id = crypto.randomUUID();
  type = CommandType.SET_WALL_SIDE_FINISH_BATCH;
  timestamp = Date.now();
  targetIds;
  executedChildren = [];
  _skipped = [];
  _masked = [];
  /** Skips recorded by the most recent execute() (empty before execution). */
  get skipped() {
    return this._skipped;
  }
  /**
   * Walls written successfully whose finish the 3D view cannot show (§L960-STEP3).
   *
   * ⚠ THIS IS A TRIPWIRE, NOT A LIVE PATH — and saying which it is, is the point.
   * Before L-960 the GPU-instanced arm and every plain fragment arm dropped the
   * finish silently, so ANY 1-layer wall landed here in spirit and the user was
   * told "Done" anyway. Those arms honour it now, so a wall that carries ONE
   * finish always renders it and this list stays EMPTY.
   *
   * What survives is a property of the GEOMETRY and not of the renderer: a wall
   * drawn as one solid has ONE surface, so if BOTH sides carry a finish only one
   * of them can be painted. That case is real, and it must be said in the same
   * breath as "Done" rather than discovered from a render.
   */
  get masked() {
    return this._masked;
  }
  _resolveWallIds(ctx) {
    if (this.input.wallIds === "all") {
      return ctx.stores.wallStore.getAll().map((w) => w.id);
    }
    return Array.from(new Set(this.input.wallIds));
  }
  /** §RACSIDE144 — `side` is now a PARAMETER, not read off `this.input.side`
   *  directly: a `'both'` batch input applies this per-wall via TWO children,
   *  one per real {@link WallFinishSide}, never a wall-set command that
   *  itself understands 'both'. */
  _child(wallId, side) {
    return new SetWallSideFinishCommand({
      wallId,
      side,
      finish: { ...this.input.finish }
    });
  }
  /**
   * THE HONEST REFUSAL, per wall and per SIDE. Returns the refusal text, or
   * `null` to proceed.
   *
   * Only room-scoped requests can hit it: they are the only ones that ask a
   * GEOMETRIC question ("the face that looks into room X") rather than a
   * semantic one ("the interior finish"). §RACSIDE144 — `side` is now a
   * parameter so a `'both'` batch asks this once per real side; "exterior" is
   * never the shared face, so a `'both'` write is refused only on its
   * interior half, exactly as an `'interior'`-only write already was.
   */
  _sideRefusal(wallId, side) {
    const counts = this.input.roomBoundCounts;
    if (!counts) return null;
    if (side !== "interior") return null;
    const auth = authoriseRoomScopedSideFinish(wallId, counts.get(wallId) ?? null);
    return auth.ok ? null : auth.text;
  }
  _valueLabel() {
    const f = this.input.finish;
    const sideLabel = this.input.side === "both" ? "interior and exterior" : this.input.side;
    return `${sideLabel} finish ${f.materialName ?? f.materialId}`;
  }
  canExecute(ctx) {
    const ids = this._resolveWallIds(ctx);
    if (ids.length === 0) {
      return {
        ok: false,
        reason: this.input.wallIds === "all" ? "There are no walls in this project to finish." : "No walls selected — select at least one wall first."
      };
    }
    const isBoth = this.input.side === "both";
    const refusals = [];
    let acceptable = 0;
    for (const wallId of ids) {
      let wallAcceptable = false;
      for (const side of sidesToApply(this.input.side)) {
        const subject = isBoth ? `wall ${wallId} (${side} face)` : `wall ${wallId}`;
        const sideRefusal = this._sideRefusal(wallId, side);
        if (sideRefusal !== null) {
          refusals.push(sideRefusal);
          continue;
        }
        const v = this._child(wallId, side).canExecute(ctx);
        if (v.ok) {
          wallAcceptable = true;
          continue;
        }
        refusals.push(childRefusalText(v.reason, "SetWallSideFinishCommand.canExecute", subject));
      }
      if (wallAcceptable) acceptable++;
    }
    if (acceptable === 0) {
      return {
        ok: false,
        reason: `None of the ${ids.length} wall${ids.length === 1 ? "" : "s"} can take the ${this._valueLabel()} — ${refusals[0]}`
      };
    }
    return { ok: true, warnings: refusals.length > 0 ? refusals : void 0 };
  }
  execute(ctx) {
    return _tracer$8().startActiveSpan("pryzm.wall.setSideFinish.batch", (span) => {
      try {
        this.executedChildren = [];
        this._skipped = [];
        this._masked = [];
        const ids = this._resolveWallIds(ctx);
        this.targetIds = [...ids];
        const affected = [];
        const isBoth = this.input.side === "both";
        for (const wallId of ids) {
          let wallChanged = false;
          let wallMaskedSide = null;
          for (const side of sidesToApply(this.input.side)) {
            const subject = isBoth ? `wall ${wallId} (${side} face)` : `wall ${wallId}`;
            const sideRefusal = this._sideRefusal(wallId, side);
            if (sideRefusal !== null) {
              this._skipped.push({ wallId, reason: sideRefusal });
              continue;
            }
            const child = this._child(wallId, side);
            const v = child.canExecute(ctx);
            if (!v.ok) {
              this._skipped.push({
                wallId,
                reason: childRefusalText(v.reason, "SetWallSideFinishCommand.canExecute", subject)
              });
              continue;
            }
            const maskedSide = maskedSideAfterSetting(
              ctx.stores.wallStore.getById(wallId) ?? {},
              side,
              this.input.finish
            );
            const r = child.execute(ctx);
            if (r.success) {
              this.executedChildren.push(child);
              const after = ctx.stores.wallStore.getById(wallId);
              const landed = after ? resolveWallSideFinish(after, side).materialId === this.input.finish.materialId : false;
              if (!landed) {
                this._skipped.push({
                  wallId,
                  reason: `${subject}: the store accepted the write and reported success, but reading the record back shows its ${side} finish is NOT ${this.input.finish.materialName ?? this.input.finish.materialId}. The value did not reach the authority, so nothing about this ${isBoth ? "side" : "wall"} changed — do not trust a success count over this wall.`
                });
                continue;
              }
              wallChanged = true;
              if (maskedSide) wallMaskedSide = maskedSide;
            } else {
              this._skipped.push({
                wallId,
                reason: childRefusalText(r.info?.[0], "SetWallSideFinishCommand.execute", subject)
              });
            }
          }
          if (wallChanged) affected.push(wallId);
          if (wallMaskedSide) this._masked.push({ wallId, maskedSide: wallMaskedSide });
        }
        const total = ids.length;
        const changed = affected.length;
        const skippedCount = this._skipped.length;
        const reasonCounts = /* @__PURE__ */ new Map();
        for (const s of this._skipped) {
          reasonCounts.set(s.reason, (reasonCounts.get(s.reason) ?? 0) + 1);
        }
        const reasonLines = [...reasonCounts.entries()].map(
          ([reason, count]) => `${count}× ${reason}`
        );
        const maskedCount = this._masked.length;
        const maskedTail = maskedCount === 0 ? "" : this.input.side !== "exterior" ? ` — ⚠ on ${maskedCount} of them the 3D view will NOT show it: ${describeSingleLayerRenderLimit()}` : ` — ⚠ on ${maskedCount} of them this now covers the interior finish in the 3D view: ${describeSingleLayerRenderLimit()}`;
        const summary = `Set the ${this._valueLabel()} on ${changed} of ${total} wall${total === 1 ? "" : "s"}` + (skippedCount > 0 ? ` — ${skippedCount} skipped` : "") + maskedTail;
        span.setAttribute("pryzm.wall.sideFinishBatch.total", total);
        span.setAttribute("pryzm.wall.sideFinishBatch.changed", changed);
        span.setAttribute("pryzm.wall.sideFinishBatch.skipped", skippedCount);
        span.setAttribute("pryzm.wall.sideFinishBatch.maskedInView", maskedCount);
        span.setAttribute("pryzm.wall.sideFinishBatch.side", this.input.side);
        span.setAttribute("pryzm.wall.sideFinishBatch.scope", this.input.wallIds === "all" ? "all" : "ids");
        return {
          success: changed > 0,
          affectedElementIds: affected,
          info: [summary, ...reasonLines]
        };
      } catch (err) {
        span.recordException(err);
        throw err;
      } finally {
        span.end();
      }
    });
  }
  undo(ctx) {
    const affected = [];
    for (let i = this.executedChildren.length - 1; i >= 0; i--) {
      const child = this.executedChildren[i];
      if (!child) continue;
      const r = child.undo(ctx);
      if (r.success) affected.push(...r.affectedElementIds);
    }
    return { success: true, affectedElementIds: affected };
  }
  serialize() {
    return {
      type: this.type,
      targetIds: this.targetIds,
      timestamp: this.timestamp,
      version: 1,
      payload: {
        wallIds: this.input.wallIds,
        side: this.input.side,
        finish: this.input.finish
      }
    };
  }
}

let _cachedTracer$2 = null;
function _tracer$7() {
  _cachedTracer$2 ??= trace.getTracer("@pryzm/command-registry", "0.1.0");
  return _cachedTracer$2;
}
class UpdateWindowSystemTypeCommand {
  constructor(input) {
    this.input = input;
    this.targetIds = [input.windowId];
  }
  input;
  affectedStores = ["window", "wall"];
  id = crypto.randomUUID();
  type = CommandType.UPDATE_WINDOW_SYSTEM_TYPE;
  timestamp = Date.now();
  targetIds;
  /** EXACT pre-change record — the undo restores this verbatim. */
  prevSnapshot = null;
  canExecute(_ctx) {
    const win = windowStore.getById(this.input.windowId);
    if (!win) return { ok: false, reason: `Window ${this.input.windowId} not found` };
    const plan = planWindowTypeChange(win, this.input.systemTypeId);
    if (plan.blockedReason) return { ok: false, reason: plan.blockedReason };
    return { ok: true };
  }
  execute(_ctx) {
    return _tracer$7().startActiveSpan("pryzm.window.updateSystemType", (span) => {
      try {
        const win = windowStore.getById(this.input.windowId);
        if (!win) {
          span.end();
          return { success: false, affectedElementIds: [] };
        }
        const plan = planWindowTypeChange(win, this.input.systemTypeId);
        if (plan.blockedReason) {
          console.warn(plan.blockedReason);
          span.setAttribute("pryzm.window.typeChange.blocked", true);
          span.end();
          return { success: false, affectedElementIds: [], info: [plan.blockedReason] };
        }
        this.prevSnapshot = structuredClone(win);
        windowStore.update(this.input.windowId, plan.patch);
        span.setAttribute("pryzm.window.id", this.input.windowId);
        span.setAttribute("pryzm.window.systemTypeId.from", plan.from ?? "<none>");
        span.setAttribute("pryzm.window.systemTypeId.to", plan.to);
        span.end();
        return { success: true, affectedElementIds: [this.input.windowId, win.wallId] };
      } catch (err) {
        span.recordException(err);
        span.end();
        throw err;
      }
    });
  }
  undo(_ctx) {
    return _tracer$7().startActiveSpan("pryzm.window.updateSystemType.undo", (span) => {
      try {
        if (!this.prevSnapshot) {
          span.end();
          return { success: false, affectedElementIds: [] };
        }
        windowStore.replace(this.prevSnapshot);
        span.end();
        return {
          success: true,
          affectedElementIds: [this.prevSnapshot.id, this.prevSnapshot.wallId]
        };
      } catch (err) {
        span.recordException(err);
        span.end();
        throw err;
      }
    });
  }
  serialize() {
    return {
      type: this.type,
      targetIds: this.targetIds,
      timestamp: this.timestamp,
      version: 1,
      payload: { windowId: this.input.windowId, systemTypeId: this.input.systemTypeId }
    };
  }
}

let _cachedTracer$1 = null;
function _tracer$6() {
  _cachedTracer$1 ??= trace.getTracer("@pryzm/command-registry", "0.1.0");
  return _cachedTracer$1;
}
const WINDOW_TYPE_DOMAIN_NOISE = ["window", "windows", "type", "style", "the", "a"];
function resolveWindowSystemTypeRef(ref) {
  return resolveCatalogueRef(windowSystemTypeStore, ref, {
    domainNoise: WINDOW_TYPE_DOMAIN_NOISE,
    spanDomain: "pryzm.window.systemType"
  }).entry;
}
function windowSystemTypeNames() {
  return windowSystemTypeStore.getAll().map((t) => t.name);
}
class UpdateWindowsSystemTypeBatchCommand {
  constructor(input) {
    this.input = input;
    this.targetIds = input.windowIds === "all" ? [] : [...input.windowIds];
  }
  input;
  affectedStores = ["window", "wall"];
  id = crypto.randomUUID();
  type = CommandType.UPDATE_WINDOWS_SYSTEM_TYPE_BATCH;
  timestamp = Date.now();
  targetIds;
  /** Children that actually EXECUTED — undo replays these in reverse. */
  executedChildren = [];
  _skipped = [];
  /** Host walls of retyped windows — the bridge nudges their rebuild. */
  _affectedWallIds = /* @__PURE__ */ new Set();
  /** Skips recorded by the most recent execute() (empty before execution). */
  get skipped() {
    return this._skipped;
  }
  /** Host wall ids of every retyped window (for the reveal-map rebuild nudge). */
  get affectedWallIds() {
    return [...this._affectedWallIds];
  }
  _resolveWindowIds() {
    if (this.input.windowIds === "all") {
      return windowStore.getAll().map((w) => w.id);
    }
    return Array.from(new Set(this.input.windowIds));
  }
  canExecute(ctx) {
    const type = resolveWindowSystemTypeRef(this.input.systemType);
    if (type === null) {
      return {
        ok: false,
        reason: `There is no window type called "${this.input.systemType}". The window types here are: ${windowSystemTypeNames().join(", ")}.`
      };
    }
    const ids = this._resolveWindowIds();
    if (ids.length === 0) {
      return {
        ok: false,
        reason: this.input.windowIds === "all" ? "There are no windows in this project to retype." : "No windows selected — select at least one window first."
      };
    }
    const refusals = [];
    let acceptable = 0;
    for (const id of ids) {
      const v = new UpdateWindowSystemTypeCommand({ windowId: id, systemTypeId: type.id }).canExecute(ctx);
      if (v.ok) acceptable++;
      else refusals.push(childRefusalText(v.reason, "UpdateWindowSystemTypeCommand.canExecute", `window ${id}`));
    }
    if (acceptable === 0) {
      return {
        ok: false,
        reason: `None of the ${ids.length} window${ids.length === 1 ? "" : "s"} can become "${type.name}" — ${refusals[0]}`
      };
    }
    return { ok: true, warnings: refusals.length > 0 ? refusals : void 0 };
  }
  execute(ctx) {
    return _tracer$6().startActiveSpan("pryzm.window.updateSystemType.batch", (span) => {
      try {
        this.executedChildren = [];
        this._skipped = [];
        this._affectedWallIds = /* @__PURE__ */ new Set();
        const type = resolveWindowSystemTypeRef(this.input.systemType);
        if (type === null) {
          const reason = `There is no window type called "${this.input.systemType}". The window types here are: ${windowSystemTypeNames().join(", ")}.`;
          span.end();
          return { success: false, affectedElementIds: [], info: [reason] };
        }
        const ids = this._resolveWindowIds();
        this.targetIds = [...ids];
        const affected = [];
        for (const id of ids) {
          const child = new UpdateWindowSystemTypeCommand({
            windowId: id,
            systemTypeId: type.id
          });
          const v = child.canExecute(ctx);
          if (!v.ok) {
            this._skipped.push({ windowId: id, reason: childRefusalText(v.reason, "UpdateWindowSystemTypeCommand.canExecute", `window ${id}`) });
            continue;
          }
          const r = child.execute(ctx);
          if (r.success) {
            this.executedChildren.push(child);
            affected.push(id);
            const host = windowStore.getById(id)?.wallId;
            if (host) this._affectedWallIds.add(host);
          } else {
            this._skipped.push({ windowId: id, reason: childRefusalText(r.info?.[0], "UpdateWindowSystemTypeCommand.execute", `window ${id}`) });
          }
        }
        const total = ids.length;
        const changed = affected.length;
        const skippedCount = this._skipped.length;
        const reasonCounts = /* @__PURE__ */ new Map();
        for (const s of this._skipped) {
          reasonCounts.set(s.reason, (reasonCounts.get(s.reason) ?? 0) + 1);
        }
        const reasonLines = [...reasonCounts.entries()].map(
          ([reason, count]) => `${count}× ${reason}`
        );
        const summary = `Retyped ${changed} of ${total} window${total === 1 ? "" : "s"} to "${type.name}"` + (skippedCount > 0 ? ` — ${skippedCount} skipped` : "");
        span.setAttribute("pryzm.window.typeBatch.total", total);
        span.setAttribute("pryzm.window.typeBatch.changed", changed);
        span.setAttribute("pryzm.window.typeBatch.skipped", skippedCount);
        span.setAttribute("pryzm.window.typeBatch.scope", this.input.windowIds === "all" ? "all" : "ids");
        return {
          success: changed > 0,
          affectedElementIds: [...affected, ...this._affectedWallIds],
          info: [summary, ...reasonLines]
        };
      } catch (err) {
        span.recordException(err);
        throw err;
      } finally {
        span.end();
      }
    });
  }
  undo(ctx) {
    const affected = [];
    for (let i = this.executedChildren.length - 1; i >= 0; i--) {
      const child = this.executedChildren[i];
      if (!child) continue;
      const r = child.undo(ctx);
      if (r.success) affected.push(...r.affectedElementIds);
    }
    return { success: true, affectedElementIds: affected };
  }
  serialize() {
    return {
      type: this.type,
      targetIds: this.targetIds,
      timestamp: this.timestamp,
      version: 1,
      payload: this.input
    };
  }
  static deserialize(serialized) {
    return new UpdateWindowsSystemTypeBatchCommand(
      serialized.payload
    );
  }
}

let _cachedTracer = null;
function _tracer$5() {
  _cachedTracer ??= trace.getTracer("@pryzm/command-registry", "0.1.0");
  return _cachedTracer;
}
const WINDOW_EDGE_MARGIN_M = 0.15;
class CreateWindowsParametricBatchCommand {
  constructor(input) {
    this.input = input;
    this.targetIds = input.wallIds === "all" ? [] : [...input.wallIds];
  }
  input;
  // §L-1031 (C84 EI-7c, C86 §11 #17) — inherited the parent gap and is the WORSE
  // half of it. This declared `['wall']` while :299 `child.execute(ctx)` runs N
  // CreateWallOpeningCommand children, each of which adds a windowStore record.
  //
  // Why this one is worse than the single command: CreateWallOpeningCommand cannot
  // fail AFTER its store write (its only `success:false` returns are :91/:96/:114,
  // all BEFORE the write at :204, and the write itself is inside a swallowing
  // try/catch), so its rollback exposure is latent. THIS command re-raises at :337
  // (`throw err`) from the post-loop summary/span block — i.e. AFTER N children have
  // already written windowStore. That exception reaches CommandManagerImpl:428,
  // which restores the SNAPSHOT: with `['wall']` the walls came back without their
  // openings while windowStore kept N records and WindowBuilder kept N meshes.
  // Declaring 'window' puts the store the children write inside the rollback scope.
  affectedStores = ["wall", "window"];
  id = crypto.randomUUID();
  type = CommandType.CREATE_WINDOWS_PARAMETRIC_BATCH;
  timestamp = Date.now();
  targetIds;
  executedChildren = [];
  _skipped = [];
  _created = 0;
  _planned = 0;
  get skipped() {
    return this._skipped;
  }
  /** Planned/created counts from the most recent execute() — the chat's
   *  preview card asks canExecute + planCount() BEFORE confirming. */
  get createdCount() {
    return this._created;
  }
  /** How many windows this input PLANS across the resolved walls — used by
   *  the chat's Confirm card ("This will create 24 windows on 12 walls"). */
  planCount(ctx) {
    let planned = 0;
    for (const w of this._resolveWalls(
      ctx,
      /*recordSkips*/
      false
    )) {
      planned += this._offsetsFor(w).offsets.length;
    }
    return planned;
  }
  _resolveWalls(ctx, recordSkips) {
    const store = ctx.stores.wallStore;
    if (this.input.wallIds === "all") return store.getAll();
    const out = [];
    for (const id of new Set(this.input.wallIds)) {
      const w = store.getById?.(id);
      if (w !== void 0) out.push(w);
      else if (recordSkips) this._skipped.push({ wallId: id, reason: "wall not found" });
    }
    return out;
  }
  /** Window START offsets for one wall, honest about why any were dropped. */
  _offsetsFor(w) {
    const rake = rakeAuthorability({
      rakeAngleDeg: w.rakeAngleDeg,
      curve: w.curve});
    if (!rake.ok) {
      return { offsets: [], dropReason: `wall cannot hold its angle (rake): ${rake.reason ?? rake.code}` };
    }
    let length;
    try {
      length = wallCentrelineLength(w);
    } catch {
      return { offsets: [], dropReason: "wall length could not be measured" };
    }
    if (!Number.isFinite(length) || length <= 0) {
      return { offsets: [], dropReason: "wall length could not be measured" };
    }
    const width = this.input.width;
    const usable = length - 2 * WINDOW_EDGE_MARGIN_M;
    if (usable < width) {
      return { offsets: [], dropReason: `wall too short (${length.toFixed(2)}m) for a ${width}m window` };
    }
    const centres = [];
    if (this.input.mode.kind === "count") {
      const n = this.input.mode.count;
      for (let i = 0; i < n; i++) centres.push(length * (i + 1) / (n + 1));
    } else {
      const s = this.input.mode.spacingM;
      for (let c = s; c + width / 2 <= length - WINDOW_EDGE_MARGIN_M; c += s) centres.push(c);
    }
    const offsets = centres.map((c) => c - width / 2).filter((o) => o >= WINDOW_EDGE_MARGIN_M && o + width <= length - WINDOW_EDGE_MARGIN_M);
    const dropped = centres.length - offsets.length;
    return {
      offsets,
      dropReason: offsets.length === 0 ? `no window fits — wall ${length.toFixed(2)}m, window ${width}m` : dropped > 0 ? `${dropped} of ${centres.length} did not fit and were capped to the segment` : null
    };
  }
  _child(wallId, offset) {
    return new CreateWallOpeningCommand({
      wallId,
      openingData: {
        type: "window",
        offset,
        width: this.input.width,
        height: this.input.height,
        sillHeight: this.input.sillHeight ?? 0.9,
        ...this.input.systemTypeId !== void 0 ? { systemTypeId: this.input.systemTypeId } : {}
      }
    });
  }
  canExecute(ctx) {
    const { width, height, mode } = this.input;
    if (!Number.isFinite(width) || width <= 0 || width > 10) {
      return { ok: false, reason: `Window width must be a positive number of metres (got ${width}).` };
    }
    if (!Number.isFinite(height) || height <= 0 || height > 10) {
      return { ok: false, reason: `Window height must be a positive number of metres (got ${height}).` };
    }
    const sill = this.input.sillHeight ?? 0.9;
    if (!Number.isFinite(sill) || sill < 0) {
      return { ok: false, reason: `Sill height must be ≥ 0 (got ${sill}).` };
    }
    if (mode.kind === "count" && (!Number.isInteger(mode.count) || mode.count < 1 || mode.count > 50)) {
      return { ok: false, reason: `The per-wall window count must be a whole number between 1 and 50.` };
    }
    if (mode.kind === "spacing" && (!Number.isFinite(mode.spacingM) || mode.spacingM < this.input.width)) {
      return {
        ok: false,
        reason: `The spacing (${mode.kind === "spacing" ? mode.spacingM : ""}m) must be at least the window width (${width}m), or the windows would overlap.`
      };
    }
    this._skipped = [];
    const walls = this._resolveWalls(ctx, true);
    if (walls.length === 0) {
      return {
        ok: false,
        reason: this.input.wallIds === "all" ? "There are no walls in this project to put windows in." : "None of the requested walls exist any more."
      };
    }
    let planned = 0;
    const reasons = this._skipped.map((s) => `Wall ${s.wallId}: ${s.reason}`);
    for (const w of walls) {
      const { offsets, dropReason } = this._offsetsFor(w);
      planned += offsets.length;
      if (dropReason !== null) reasons.push(dropReason);
    }
    if (planned === 0) {
      return {
        ok: false,
        reason: `No window fits on any of the ${walls.length} wall${walls.length === 1 ? "" : "s"} — ${reasons[0] ?? "nothing to place"}.`
      };
    }
    return { ok: true, warnings: reasons.length > 0 ? reasons : void 0 };
  }
  execute(ctx) {
    return _tracer$5().startActiveSpan("pryzm.window.parametricCreate.batch", (span) => {
      try {
        this.executedChildren = [];
        this._skipped = [];
        this._created = 0;
        this._planned = 0;
        const walls = this._resolveWalls(ctx, true);
        this.targetIds = walls.map((w) => w.id);
        const affected = [];
        for (const w of walls) {
          const { offsets, dropReason } = this._offsetsFor(w);
          if (offsets.length === 0) {
            if (dropReason !== null) this._skipped.push({ wallId: w.id, reason: dropReason });
            continue;
          }
          if (dropReason !== null) this._skipped.push({ wallId: w.id, reason: dropReason });
          for (const offset of offsets) {
            this._planned++;
            const child = this._child(w.id, offset);
            const v = child.canExecute(ctx);
            if (!v.ok) {
              this._skipped.push({ wallId: w.id, reason: v.reason ?? "(no reason stated by the child command)" });
              continue;
            }
            const r = child.execute(ctx);
            if (r.success) {
              this.executedChildren.push(child);
              this._created++;
              affected.push(...r.affectedElementIds);
            } else {
              this._skipped.push({ wallId: w.id, reason: r.info?.[0] ?? "execution refused" });
            }
          }
        }
        const skippedCount = this._skipped.length;
        const reasonCounts = /* @__PURE__ */ new Map();
        for (const s of this._skipped) {
          reasonCounts.set(s.reason, (reasonCounts.get(s.reason) ?? 0) + 1);
        }
        const reasonLines = [...reasonCounts.entries()].map(
          ([reason, count]) => `${count}× ${reason}`
        );
        const summary = `Created ${this._created} of ${this._planned} planned window${this._planned === 1 ? "" : "s"} across ${walls.length} wall${walls.length === 1 ? "" : "s"}` + (skippedCount > 0 ? ` — ${skippedCount} skip${skippedCount === 1 ? "" : "s"}` : "");
        span.setAttribute("pryzm.window.parametric.planned", this._planned);
        span.setAttribute("pryzm.window.parametric.created", this._created);
        span.setAttribute("pryzm.window.parametric.skipped", skippedCount);
        span.setAttribute("pryzm.window.parametric.mode", this.input.mode.kind);
        span.setAttribute("pryzm.window.parametric.scope", this.input.wallIds === "all" ? "all" : "ids");
        return {
          success: this._created > 0,
          affectedElementIds: [...new Set(affected)],
          info: [summary, ...reasonLines]
        };
      } catch (err) {
        span.recordException(err);
        throw err;
      } finally {
        span.end();
      }
    });
  }
  undo(ctx) {
    const affected = [];
    for (let i = this.executedChildren.length - 1; i >= 0; i--) {
      const child = this.executedChildren[i];
      if (!child) continue;
      const r = child.undo(ctx);
      if (r.success) affected.push(...r.affectedElementIds);
    }
    return { success: true, affectedElementIds: affected };
  }
  serialize() {
    return {
      type: this.type,
      targetIds: this.targetIds,
      timestamp: this.timestamp,
      version: 1,
      payload: this.input
    };
  }
  static deserialize(serialized) {
    return new CreateWindowsParametricBatchCommand(
      serialized.payload
    );
  }
}

const BOUNDARY_LINE_EPSILON_M = 1e-6;
function boundaryLineSegments(line) {
  const v = line.vertices;
  const n = line.closed ? v.length : v.length - 1;
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = v[i];
    const b = v[(i + 1) % v.length];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const length = Math.hypot(dx, dz);
    const ok = length > BOUNDARY_LINE_EPSILON_M;
    out.push({
      index: i,
      a,
      b,
      length,
      dir: ok ? { x: dx / length, z: dz / length } : null,
      // LEFT normal in a right-handed XZ plan frame: (dx,dz) → (dz,−dx).
      // Sign convention is stated once, here, and every offset in the family
      // is measured against it — a second convention elsewhere would mirror
      // every dependent to the wrong side of the line.
      normal: ok ? { x: dz / length, z: -dx / length } : null
    });
  }
  return out;
}
function anchorOnBoundaryLine(line, point) {
  let best = null;
  for (const seg of boundaryLineSegments(line)) {
    if (!seg.dir || !seg.normal) continue;
    const px = point.x - seg.a.x;
    const pz = point.z - seg.a.z;
    const along = Math.min(seg.length, Math.max(0, px * seg.dir.x + pz * seg.dir.z));
    const t = seg.length > 0 ? along / seg.length : 0;
    const footX = seg.a.x + seg.dir.x * along;
    const footZ = seg.a.z + seg.dir.z * along;
    const dx = point.x - footX;
    const dz = point.z - footZ;
    const d2 = dx * dx + dz * dz;
    const offset = dx * seg.normal.x + dz * seg.normal.z;
    if (!best || d2 < best.d2 - BOUNDARY_LINE_EPSILON_M) {
      best = { segmentIndex: seg.index, t, offset, d2 };
    }
  }
  if (!best) return null;
  return { segmentIndex: best.segmentIndex, t: best.t, offset: best.offset };
}

function resolveBoundaryLineMaterial(line, systemType) {
  if (!line.hasVolume) return { kind: "linework" };
  if (line.materialId) {
    return {
      kind: "resolved",
      materialId: line.materialId,
      materialColor: line.materialColor,
      source: "record"
    };
  }
  return {
    kind: "unresolved",
    reason: "This boundary line has VOLUME switched on but names no material, and no boundary-line system type supplies one. C100 requires a solid to name a real material — pick one in the property panel, or switch volume off to keep it as linework."
  };
}

const BOUNDARY_LINE_FAMILY_RULES = Object.freeze([
  // -- ADAPTS ------------------------------------------------------------------
  // Every row below was verified TWICE: the bus verb exists in
  // `MOVE_COMMAND_BY_TYPE`, and a legacy command with a MEASURED payload writes the
  // family's AUTHORITATIVE geometry store. `boundaryLineDependentAdapters.ts`
  // (`packages/command-registry`) holds the second half, and its coverage test fails
  // if a PROPAGATES row has no adapter -- which is what stops this table claiming a
  // cell nothing can execute.
  { family: "wall", verdict: "PROPAGATES", shape: "line", moveVerb: "wall.updateBaseline" },
  { family: "slab", verdict: "PROPAGATES", shape: "area", moveVerb: "slab.movePolygon" },
  { family: "column", verdict: "PROPAGATES", shape: "point", moveVerb: "column.update" },
  // `BeamData.startPoint` / `.endPoint` -- measured, a LINE family.
  // WARNING, NAMED REMAINDER: `startSupportId` / `endSupportId` are NOT re-solved. A
  // beam whose columns rode the same line still meets them; a beam whose supports did
  // not move now spans differently. That is a bounded, STATED gap (C106 §3.5), not a
  // silence -- re-running support assignment is `AssignBeamSupportsCommand`'s job,
  // never a boundary line's.
  { family: "beam", verdict: "PROPAGATES", shape: "line", moveVerb: "beam.update" },
  { family: "curtain-wall", verdict: "PROPAGATES", shape: "line", moveVerb: "wall.updateCurtainWall" },
  { family: "curtainwall", verdict: "PROPAGATES", shape: "line", moveVerb: "wall.updateCurtainWall" },
  { family: "handrail", verdict: "PROPAGATES", shape: "line", moveVerb: "handrail.moveBaseLine" },
  { family: "railing", verdict: "PROPAGATES", shape: "line", moveVerb: "handrail.moveBaseLine" },
  { family: "furniture", verdict: "PROPAGATES", shape: "point", moveVerb: "furniture.updateParameters" },
  { family: "plumbing", verdict: "PROPAGATES", shape: "point", moveVerb: "plumbing.moveFixture" },
  { family: "plumbingfixture", verdict: "PROPAGATES", shape: "point", moveVerb: "plumbing.moveFixture" },
  // STAIR PROPAGATES HERE AND REFUSES FOR A LEVEL, AND THAT IS NOT A CONTRADICTION.
  // ADR-0345 refuses a stair on a level-HEIGHT change because the storey gap it spans
  // changed, which invalidates its riser count -- a re-SOLVE, not a translate. A
  // boundary-line move is a horizontal displacement in XZ: the rise is untouched, so
  // the stair goes with it through the same `MoveStairCommand` the 3-D gizmo already
  // dispatches (and which re-reconciles its slab void). Two hosts, two questions, two
  // answers; flattening them would be the wrong kind of consistency.
  { family: "stair", verdict: "PROPAGATES", shape: "point", moveVerb: "stair.move" },
  { family: "stairs", verdict: "PROPAGATES", shape: "point", moveVerb: "stair.move" },
  // LIGHTING -- CLOSED §LIGHT121 (L-11900). This row used to carry no `moveVerb`
  // (measured 2026-08-23: `MoveLightingCommand` existed and wrote the lighting
  // store, but no SURFACE dispatched it -- no `MOVE_COMMAND_BY_TYPE` row, no 3-D
  // gizmo branch, and `ElementCapabilities` declared no ops for lighting at all,
  // which is exactly the founder's "no move icon" report). All three are wired now
  // (`lighting.moveFixture`, the L-220 distinct-verb bridge), so this row states the
  // verb like every other family instead of the deliberate absence it used to
  // record. `MoveBoundaryLineCommand` still dispatches the COMMAND directly rather
  // than the bus verb (folding every dependent's move into ONE undo entry, C81 --
  // see `boundaryLineDependentAdapters.ts`), so this cell's behaviour is unchanged;
  // only its HONESTY improved, from "the bus cannot reach this family" to "the bus
  // can too, and this adapter simply does not use it."
  { family: "lighting", verdict: "PROPAGATES", shape: "point", moveVerb: "lighting.moveFixture" },
  // -- REFUSES, EACH WITH ITS MEASURED REASON ----------------------------------
  // These are not gaps. C84 EI-PROP-b: an honest refusal is a valid answer, and for a
  // whole class of cells it is the TARGET state. Nine of the thirteen below are cells
  // that MUST refuse -- adapting them would itself be the defect.
  {
    family: "door",
    verdict: "REFUSES",
    reason: "A door is HOSTED in a wall (C15) - its position is an OFFSET along that wall, not a world point. It moves when its host wall moves. Attach the WALL to the boundary line and the door rides it."
  },
  {
    family: "window",
    verdict: "REFUSES",
    reason: "A window is HOSTED in a wall (C15) - its position is an OFFSET along that wall, not a world point. It moves when its host wall moves. Attach the WALL to the boundary line and the window rides it."
  },
  // -- The C79 cause-vocabulary trio -------------------------------------------
  // MEASURED, AND THE SAME MEASUREMENT FOR ALL THREE. `UpdateRoofBoundaryCommand`,
  // `UpdateCeilingBoundaryCommand` and `UpdateFloorBoundaryCommand` each REQUIRE
  //     cause: { wallId: string; kind: 'wall-moved' | 'wall-removed' }
  // and each documents it as "Why this write happened. Named, never inferred (C79
  // §4.4 / C75)." A boundary line is not a wall and has no `wallId`. Passing a
  // fabricated one to satisfy the type would write FALSE PROVENANCE into the record --
  // it would tell every later reader that a wall moved when none did, which is worse
  // than the element not following. The fix is a `boundary-line-moved` member on that
  // cause union, which is C79's contract to amend and not this lane's to force.
  {
    family: "roof",
    verdict: "REFUSES",
    reason: "A roof re-projects only through UpdateRoofBoundaryCommand, whose `cause` must name a WALL that moved (C79 §4.4 - named, never inferred). A boundary line is not a wall, and inventing a wall id would write false provenance. Move the roof directly, or attach the walls it sits on."
  },
  {
    family: "ceiling",
    verdict: "REFUSES",
    reason: "A ceiling re-projects only through UpdateCeilingBoundaryCommand, whose `cause` must name a WALL that moved (C79 §4.4 - named, never inferred). A boundary line is not a wall, and inventing a wall id would write false provenance. Attach the walls that bound the ceiling instead."
  },
  {
    family: "floor",
    verdict: "REFUSES",
    reason: "A floor finish re-projects only through UpdateFloorBoundaryCommand, whose `cause` must name a WALL that moved (C79 §4.4 - named, never inferred). A boundary line is not a wall, and inventing a wall id would write false provenance. Attach the walls that bound the floor instead."
  },
  {
    family: "room",
    verdict: "REFUSES",
    // Not "cannot" -- "must not". A room's polygon carries `detectionMethod`, i.e.
    // it records that it was DERIVED from its bounding walls. Writing it from a
    // boundary line would make two authorities over one polygon (C84 EI-9), and the
    // next re-detect would silently overwrite whichever one lost.
    reason: "A room BOUNDARY is DERIVED from its bounding walls and records that in `detectionMethod`. Writing it from a boundary line would create a second authority over one polygon. A room follows because its WALLS follow - attach those."
  },
  {
    family: "grid",
    verdict: "REFUSES",
    reason: "A structural grid is a DATUM - other elements are set out FROM it. Moving a grid because a construction line moved would invert that hierarchy and silently relocate everything dimensioned off it. Move the grid deliberately instead."
  },
  {
    family: "level",
    verdict: "REFUSES",
    reason: "A level is a vertical DATUM and a host in its own right; its move is owned by SetLevelHeightCommand (ADR-0345). A horizontal boundary line has no authority over it."
  },
  {
    family: "pool",
    verdict: "REFUSES",
    reason: "A pool is a COMPOUND (ADR-0124 §3): its walls, floor slab and water belong to it, and the hole it cut belongs to a host slab. Translating one member would tear the assembly apart. Move the pool itself, which moves all of it."
  },
  {
    family: "balcony",
    verdict: "REFUSES",
    reason: "A balcony is a COMPOUND (C103 §2): its plate, finish and railings are DERIVED from one polygon and from the host wall it cantilevers off. Translating a member would break that derivation. Move the balcony, or move its host wall."
  },
  {
    family: "lift",
    verdict: "REFUSES",
    reason: "A lift is a COMPOUND (C104 §2) whose shaft voids a slab on every storey it serves. Translating it without re-cutting those voids would leave holes in mid-air. Re-place the lift instead."
  },
  {
    family: "annotation",
    verdict: "REFUSES",
    reason: "An annotation belongs to a VIEW, not to model geometry (C101). It is re-placed when the view is re-issued, not when a model line moves."
  },
  {
    family: "dimension",
    verdict: "REFUSES",
    reason: "A dimension MEASURES elements; it is regenerated from whatever they now are (C101). Translating it would make it report a length it never measured."
  }
]);
function boundaryLineRuleFor(family) {
  const key = (family ?? "").toLowerCase().trim();
  return BOUNDARY_LINE_FAMILY_RULES.find((r) => r.family === key) ?? null;
}

function bootstrap(opts) {
  const stores = opts.stores ?? { cube: new CubeStore() };
  const emitter = new PatchEmitter();
  const undoStack = new UndoStack({ maxSize: 200 });
  const bus = new CommandBus({
    audit: opts.audit,
    storesProvider: () => storesAsRecordView(stores),
    emitter,
    undoStack
  });
  for (const handler of opts.handlers ?? []) {
    bus.register(handler);
  }
  const detachStores = attachStores(emitter, stores);
  const host = new CommitterHost();
  for (const c of opts.committers ?? []) {
    host.register(c);
  }
  const bindings = [];
  for (const c of opts.committers ?? []) {
    const store = stores[c.primitiveType];
    if (store === void 0) {
      opts.onUnboundPrimitive?.(c.primitiveType);
      continue;
    }
    bindings.push(bindStore(store, c.primitiveType, host));
  }
  let torn = false;
  return {
    bus,
    emitter,
    undoStack,
    stores,
    host,
    bindings,
    start() {
    },
    tearDown() {
      if (torn) return;
      torn = true;
      for (const b of bindings) b.dispose();
      detachStores();
      host.dispose();
    }
  };
}
function storesAsRecordView(stores) {
  const out = {};
  for (const [key, store] of Object.entries(stores)) {
    out[key] = Object.fromEntries(store.getState());
  }
  return out;
}

const PluginPermissionSchema = _enum([
  "read:project",
  // read element data from stores
  "write:project",
  // execute commands via commandBus
  "read:user",
  // read current user info
  "network:fetch",
  // make outbound fetch() calls (allowedOrigins enforced)
  "register:tool",
  // register a viewport tool
  "register:panel",
  // register a panel contribution (PropertyPanel et al.)
  "register:command"
  // register a command in the command palette
]);
const PluginContributionSchema = discriminatedUnion("kind", [
  object({
    kind: literal("tool"),
    id: string(),
    label: string(),
    icon: string(),
    // SVG data URI or icon-registry name
    toolbar: _enum(["left", "right", "top", "floating"])
  }),
  object({
    kind: literal("panel"),
    id: string(),
    location: _enum(["properties", "sidebar-left", "sidebar-right", "bottom"]),
    label: string()
  }),
  object({
    kind: literal("command"),
    id: string(),
    label: string(),
    keybinding: string().optional(),
    // e.g. 'Ctrl+Shift+P'
    category: string().optional()
  }),
  object({
    kind: literal("element-type"),
    id: string(),
    label: string(),
    ifcEntityType: string(),
    familyFile: string()
    // path within plugin package to .pryzm-family
  }),
  object({
    kind: literal("view-template"),
    id: string(),
    label: string(),
    templateFile: string()
    // path to JSON matching ViewTemplateSchema
  })
]);
const ID_REGEX = /^[a-z][a-z0-9-]{2,63}$/;
const SEMVER_REGEX = /^\d+\.\d+\.\d+$/;
object({
  pryzmPlugin: literal("1.0"),
  id: string().regex(ID_REGEX, "Plugin ID must be lowercase-kebab-case (3–64 chars, leading letter)"),
  version: string().regex(SEMVER_REGEX, "version must be MAJOR.MINOR.PATCH"),
  displayName: string().min(2).max(80),
  description: string().max(500),
  author: string(),
  homepage: string().url().optional(),
  main: string(),
  // entry point relative to plugin root
  icon: string().optional(),
  license: string().default("MIT"),
  permissions: array(PluginPermissionSchema),
  allowedOrigins: array(string()).default([]),
  // required iff 'network:fetch' is granted
  contributions: array(PluginContributionSchema).default([]),
  minPRYZMVersion: string().regex(SEMVER_REGEX, "minPRYZMVersion must be MAJOR.MINOR.PATCH"),
  pricingModel: _enum(["free", "one-time", "subscription"]).optional(),
  pricingCurrency: string().optional(),
  // e.g. 'USD'
  pricingAmount: number().optional()
}).superRefine((m, ctx) => {
  if (m.permissions.includes("network:fetch") && m.allowedOrigins.length === 0) {
    ctx.addIssue({
      code: ZodIssueCode.custom,
      path: ["allowedOrigins"],
      message: "allowedOrigins must be non-empty when 'network:fetch' permission is granted"
    });
  }
});

const Vec3 = object({
  x: number().finite(),
  y: number().finite(),
  z: number().finite()
});
const ViewKindEnum = _enum(["3d-perspective", "3d-orthographic"]);
const RenderModeEnum = _enum(["shaded", "wireframe", "shaded-with-edges"]);
const ViewDefinitionShape = object({
  id: string().min(1),
  name: string().min(1),
  kind: ViewKindEnum,
  camera: object({
    position: Vec3,
    target: Vec3,
    up: Vec3,
    fovDeg: number().min(10).max(120).optional(),
    orthoSize: number().positive().optional()
  }),
  renderMode: RenderModeEnum,
  levelFilter: array(string().min(1)).nullable(),
  elementKindFilter: array(string().min(1)).nullable()
});
const ViewDefinitionSchema = ViewDefinitionShape.superRefine((v, ctx) => {
  if (v.kind === "3d-perspective" && v.camera.fovDeg === void 0) {
    ctx.addIssue({
      code: ZodIssueCode.custom,
      path: ["camera", "fovDeg"],
      message: "3d-perspective views require camera.fovDeg."
    });
  }
  if (v.kind === "3d-orthographic" && v.camera.orthoSize === void 0) {
    ctx.addIssue({
      code: ZodIssueCode.custom,
      path: ["camera", "orthoSize"],
      message: "3d-orthographic views require camera.orthoSize."
    });
  }
});

const Default3DView = {
  id: "view-default-3d",
  name: "Default 3D",
  kind: "3d-perspective",
  camera: {
    position: { x: 12, y: 12, z: 12 },
    target: { x: 0, y: 0, z: 0 },
    up: { x: 0, y: 1, z: 0 },
    fovDeg: 50
  },
  renderMode: "shaded-with-edges",
  levelFilter: null,
  elementKindFilter: null
};
const LevelOverview = {
  id: "view-level-overview",
  name: "Level Overview",
  kind: "3d-orthographic",
  camera: {
    position: { x: 0, y: 50, z: 0 },
    target: { x: 0, y: 0, z: 0 },
    up: { x: 0, y: 0, z: -1 },
    orthoSize: 30
  },
  renderMode: "shaded",
  levelFilter: null,
  elementKindFilter: null
};
function defaults() {
  return [Default3DView, LevelOverview];
}

class ViewRegistry extends Store {
  /** Mirrors the convention from `Store` subclasses; views are
   *  persisted via the event log, so this is `false`. */
  static ephemeral = false;
  constructor() {
    super("view");
  }
  /** Seed list returned to bootstrap on a fresh project.  Currently
   *  `[Default3DView, LevelOverview]` — see `defaults.ts`. */
  defaults() {
    return defaults();
  }
}

trace.getTracer("pryzm.sync-client.yjs");

trace.getTracer("pryzm.sync-client.readback");

trace.getTracer("pryzm.sync-client.conflict");

trace.getTracer("pryzm.sync-client.collab");

trace.getTracer("pryzm.sync-client.presence");

const ElementIdSchema = string().min(1).brand("ElementId");
const LevelIdSchema = string().min(1).brand("LevelId");
const ViewIdSchema = string().min(1).brand("ViewId");
const DimensionStringIdSchema = string().min(1).brand("DimensionStringId");
const DimAnchorSchema = _enum([
  "start",
  // element start point (wall start, beam start)
  "end",
  // element end point
  "center",
  // midpoint of element
  "face-outer",
  // outer face of element (outside face of wall)
  "face-inner",
  // inner face of element (inside face of wall)
  "centerline",
  // analytical centerline (for walls: mid of layer stack)
  "top",
  // top of element (columns, walls: topmost Z)
  "bottom",
  // base of element
  "left",
  // leftmost X in element local frame
  "right"
  // rightmost X in element local frame
]);
const DimensionReferenceSchema = object({
  elementId: ElementIdSchema,
  anchor: DimAnchorSchema
});
const DimOrientationSchema = _enum([
  "horizontal",
  // measures horizontal distance (plan view)
  "vertical",
  // measures vertical distance (elevation/section)
  "aligned",
  // measures along the element axis (true length)
  "angular"
  // measures the angle between two references
]);
const ArrowheadStyleSchema = _enum([
  "tick",
  // diagonal tick (architectural default)
  "open-arrow",
  // open chevron
  "filled-arrow",
  // filled triangle
  "dot",
  // filled circle
  "none"
  // no terminus
]);
const WITNESS_LINE_STYLE_DEFAULT = { offset: 1, extension: 2, weight: 0.18 };
const WitnessLineStyleSchema = object({
  /** mm gap between element and the start of the witness line. */
  offset: number().default(WITNESS_LINE_STYLE_DEFAULT.offset),
  /** mm extension beyond the dimension line. */
  extension: number().default(WITNESS_LINE_STYLE_DEFAULT.extension),
  /** mm pen weight. */
  weight: number().default(WITNESS_LINE_STYLE_DEFAULT.weight)
});
const UnitFormatSchema = object({
  unit: _enum(["mm", "cm", "m", "ft", "ft-in", "in"]),
  decimalPlaces: number().int().min(0).max(4).default(0),
  suppressTrailingZeros: boolean().default(true),
  prefix: string().default(""),
  suffix: string().default("")
});
const DimensionKindSchema = _enum([
  "linear-element",
  // single element: wall length, opening width
  "linear-chain",
  // chain across multiple elements — multiple references
  "overall",
  // single overall span (typically auto-generated from chain)
  "angular",
  // angle between two line references
  "radius",
  // arc radius
  "diameter"
  // circular element diameter
]);
const DimensionAutoModeSchema = _enum([
  "per-element",
  "room-bounding",
  "selection",
  "elevation",
  "section",
  "rcp",
  // DOC-AUTO DS5 (2026-06-09) — a SET-OUT plan: every wall opening dimensioned by its
  // OFFSET from the host wall's start (the "set-out" datum) + its width, plus the wall's
  // overall length. The classic builder's setting-out drawing. See
  // docs/03-execution/plans/AUTO-DOCUMENTATION-SHEETS-PLAN.md §5 DS5.
  "set-out"
]);
object({
  id: DimensionStringIdSchema,
  kind: DimensionKindSchema,
  references: array(DimensionReferenceSchema).min(2),
  orientation: DimOrientationSchema,
  /** Distance from geometry to the dimension line, in mm at sheet scale. */
  offsetMm: number().default(8),
  viewId: ViewIdSchema,
  levelId: LevelIdSchema.optional(),
  /** User-pinned value in mm; null = auto. */
  override: number().nullable().default(null),
  /** e.g. "CLR:" prefix. */
  label: string().optional(),
  textStyleRef: string().default("default-dim"),
  witnessLines: WitnessLineStyleSchema.default(WITNESS_LINE_STYLE_DEFAULT),
  arrowheads: ArrowheadStyleSchema.default("tick"),
  /** Inherits project settings when omitted. */
  unitFormat: UnitFormatSchema.optional(),
  /** True when produced by `DimensionProducer` (S33). */
  isAutoGenerated: boolean().default(false),
  /** Which auto mode emitted this dimension (if auto-generated). */
  autoMode: DimensionAutoModeSchema.optional()
});

const ScheduleColumnSchema = object({
  /** Stable column id within this schedule (not globally unique). */
  id: string().min(1),
  /** Display header (rendered as the table TH text). */
  header: string().min(1),
  /** DSL formula string.  Parsed lazily by the evaluator and cached. */
  formula: string().default(""),
  /** Result type hint — used for cell formatting (right-align numbers,
   *  centre booleans) and for sort order (numeric vs lexicographic). */
  type: _enum(["number", "string", "boolean"]).default("string"),
  /** Optional unit suffix appended to the header (e.g. "Width (mm)"). */
  unit: string().optional(),
  /** Display width on a sheet, in millimetres (advisory — used by the
   *  ScheduleSnapshot widget for fitting; the live table view ignores
   *  this and uses CSS-driven widths). */
  widthMm: number().finite().positive().default(20)
});
object({
  /** Stable schedule id (e.g. 'sched-door-default'). */
  id: string().min(1),
  /** Display name (e.g. 'Door Schedule', 'Window Schedule — North Façade'). */
  name: string().min(1).max(200),
  /** Element family this schedule iterates (storeKey: 'door', 'wall', …). */
  elementType: string().min(1),
  /** Ordered list of columns.  Order matters — defines column display
   *  order and CSV/XLSX column order on export (S42). */
  columns: array(ScheduleColumnSchema).default([]),
  /** Optional groupBy field name on the element.  When set, rows are
   *  collapsed by the element's value at `groupBy` and aggregate
   *  columns (SUM, COUNT) operate over the group. */
  groupBy: string().optional(),
  /** Optional boolean filter formula.  Empty string ⇒ no filter. */
  filter: string().default(""),
  /** Canonical display order across schedules. */
  seq: number().int().nonnegative().default(0)
}).refine(
  (s) => new Set(s.columns.map((c) => c.id)).size === s.columns.length,
  { message: "Schedule column ids must be unique within a single schedule." }
);

const PAPER_SIZES = [
  "A0",
  "A1",
  "A2",
  "A3",
  "A4",
  "ARCH-D",
  "ARCH-E"
];

const ViewportSchema = object({
  /** Stable id of this viewport on the sheet. */
  id: string().min(1),
  /** Id of the 3D, plan, or section view being embedded. */
  viewId: string().min(1),
  /** Position on sheet (mm from sheet origin). */
  x: number().finite(),
  y: number().finite(),
  /** Viewport size on sheet (mm). */
  width: number().finite().positive(),
  height: number().finite().positive(),
  /** Drawing scale denominator (e.g. 50 = 1:50; 1 mm on sheet = 50 mm
   *  in world space). */
  scale: number().finite().positive(),
  /** Optional crop within the viewport (mm, viewport-local). */
  clippingBox: object({
    x: number().finite(),
    y: number().finite(),
    width: number().finite().positive(),
    height: number().finite().positive()
  }).optional()
});
const WidgetSchema = object({
  id: string().min(1),
  /** Subtype tag — narrow union of names, fully validated in S39. */
  kind: string().min(1),
  /** Position on sheet (mm from sheet origin). */
  x: number().finite(),
  y: number().finite(),
  /** Widget size on sheet (mm). */
  width: number().finite().positive(),
  height: number().finite().positive(),
  /** Free-form widget payload — fully shaped in S39. */
  payload: record(string(), unknown()).default({})
});
object({
  id: string().min(1),
  /** Display name (free-form). */
  name: string().min(1),
  /** Sheet number (e.g. 'A-001') — validated as non-empty here; format
   *  policy is enforced at the handler layer (`intent.ts`). */
  number: string().min(1),
  size: _enum(PAPER_SIZES),
  orientation: _enum(["landscape", "portrait"]),
  /** Id of the title block bound to this sheet (TitleBlockStore lands
   *  in S38 — for S37 the field is required and stores a
   *  user-supplied opaque id). */
  titleBlockId: string().min(1),
  viewports: array(ViewportSchema).default([]),
  widgets: array(WidgetSchema).default([]),
  /** Revision label (e.g. 'P1', 'C2'). */
  revision: string().default(""),
  /** Issue label (e.g. 'FOR REVIEW', 'FOR CONSTRUCTION'). */
  issue: string().default(""),
  /** Optional approver name. */
  approvedBy: string().optional(),
  /** Display order — see CONTRACT note above. Non-negative integer. */
  seq: number().int().nonnegative()
});

const TextWidgetPayloadSchema = object({
  kind: literal("text"),
  text: string().default(""),
  fontSize: number().finite().positive().default(3.5),
  fontWeight: _enum(["normal", "bold"]).default("normal"),
  align: _enum(["left", "center", "right"]).default("left"),
  color: string().default("#000000"),
  /** Vertical anchor inside the widget rectangle. */
  vAlign: _enum(["top", "middle", "bottom"]).default("top")
});
const ImageWidgetPayloadSchema = object({
  kind: literal("image"),
  /** Source URL or data: URI. */
  src: string().min(1),
  /** Optional alt text, used for the placeholder when src can't load. */
  alt: string().default(""),
  /** Fit policy inside the widget bounds. */
  fit: _enum(["contain", "cover", "stretch"]).default("contain")
});
const NorthArrowWidgetPayloadSchema = object({
  kind: literal("north-arrow"),
  rotation: number().finite().default(0),
  /** Stroke + fill colour. */
  color: string().default("#000000")
});
const ScaleBarWidgetPayloadSchema = object({
  kind: literal("scale-bar"),
  /** Drawing scale denominator (e.g. 50 → 1:50).  Ignored when
   *  `viewportId` is set and the env supplies a live scale. */
  scaleRatio: number().finite().positive().default(100),
  /** Unit shown after the right-hand label ('m', 'mm', 'ft'). */
  unit: _enum(["m", "mm", "ft"]).default("m"),
  /** Number of alternating black/white segments. */
  segments: number().int().positive().default(5),
  /** Bind to a specific viewport's scale (optional). */
  viewportId: string().optional()
});
const LegendEntrySchema = object({
  label: string(),
  color: string().default("#000000"),
  /** Optional pattern hint ('solid' | 'hatch' | 'dashed').  Renderers
   *  can ignore unknown values. */
  pattern: _enum(["solid", "hatch", "dashed"]).default("solid")
});
const LegendWidgetPayloadSchema = object({
  kind: literal("legend"),
  title: string().default("Legend"),
  entries: array(LegendEntrySchema).default([]),
  /** When true, the renderer prefers `env.legendEntries` over `entries`. */
  auto: boolean().default(false)
});
const RevisionRowSchema = object({
  rev: string(),
  date: string(),
  description: string(),
  by: string().default("")
});
const RevisionsTableWidgetPayloadSchema = object({
  kind: literal("revisions-table"),
  /** Column headers (default: Rev / Date / Description / By). */
  headers: array(string()).default(["Rev", "Date", "Description", "By"]),
  rows: array(RevisionRowSchema).default([])
});
const ScheduleSnapshotWidgetPayloadSchema = object({
  kind: literal("schedule-snapshot"),
  /** Stable id of the schedule definition (lookup key in ScheduleStore). */
  scheduleId: string().min(1),
  /** Optional column whitelist (lookup by column key). */
  columns: array(string()).default([]),
  /** Soft row cap so the widget doesn't blow up its bounds. */
  maxRows: number().int().positive().default(20),
  title: string().default("")
});
const BimTagWidgetPayloadSchema = object({
  kind: literal("bim-tag"),
  /** Anchor point on the sheet (mm, sheet origin).  The leader line is
   *  drawn from the widget's bottom-left to this point. */
  anchorX: number().finite(),
  anchorY: number().finite(),
  /** Tag label (e.g. "W-001" for window 1). */
  label: string().default(""),
  /** Optional element id this tag references. */
  elementId: string().optional(),
  fontSize: number().finite().positive().default(2.8),
  color: string().default("#000000")
});
const LineWidgetPayloadSchema = object({
  kind: literal("line"),
  x1: number().finite().default(0),
  y1: number().finite().default(0),
  x2: number().finite().default(10),
  y2: number().finite().default(0),
  lineWeight: number().finite().positive().default(0.35),
  color: string().default("#000000"),
  dash: _enum(["solid", "dashed", "dotted"]).default("solid")
});
const RegionWidgetPayloadSchema = object({
  kind: literal("region"),
  fill: string().default("#FFEEAA"),
  stroke: string().default("#000000"),
  lineWeight: number().finite().positive().default(0.25),
  /** Hatch density in lines/mm (0 = solid fill).  Hatch is 45° lines. */
  hatch: number().finite().nonnegative().default(0),
  opacity: number().finite().min(0).max(1).default(1)
});
discriminatedUnion("kind", [
  TextWidgetPayloadSchema,
  ImageWidgetPayloadSchema,
  NorthArrowWidgetPayloadSchema,
  ScaleBarWidgetPayloadSchema,
  LegendWidgetPayloadSchema,
  RevisionsTableWidgetPayloadSchema,
  ScheduleSnapshotWidgetPayloadSchema,
  BimTagWidgetPayloadSchema,
  LineWidgetPayloadSchema,
  RegionWidgetPayloadSchema
]);

const TitleBlockYAnchorSchema = _enum(["bottom", "top"]);
const TitleBlockTextAlignSchema = _enum(["left", "center", "right"]);
const TitleBlockFieldSchema = object({
  /** Resolution key — e.g. 'projectName', 'sheetNumber', 'date'.  See
   *  `resolveFieldValue` in `plugins/sheets/src/title-block.ts` for the
   *  resolved set; an unknown key renders `[<key>]` so missing data is
   *  visible rather than silent. */
  key: string().min(1),
  /** Display label rendered above the value (e.g. 'Project Name'). */
  label: string().default(""),
  /** Optional override value — when present overrides the resolved key
   *  (useful for static labels: a "PRYZM 2" branding line that does not
   *  bind to project metadata). */
  value: string().optional(),
  /** Position within the title block (mm from bottom-left). */
  x: number().finite(),
  y: number().finite(),
  /** Maximum text width in mm.  The renderer does not wrap — long
   *  values are truncated with an ellipsis. */
  width: number().finite().positive(),
  /** Font size in mm.  Conventionally 2–6 mm for printed output. */
  fontSize: number().finite().positive(),
  fontWeight: _enum(["normal", "bold"]).default("normal"),
  align: TitleBlockTextAlignSchema.default("left"),
  /** Anchor for `y`.  `'bottom'` (default) means y grows upward from
   *  the bottom edge of the title block.  `'top'` is convenient when a
   *  template is keyed off the title-block top edge. */
  yAnchor: TitleBlockYAnchorSchema.default("bottom")
});
const TitleBlockBorderLineSchema = object({
  /** Start point in title-block-local mm. */
  startX: number().finite(),
  startY: number().finite(),
  /** End point in title-block-local mm. */
  endX: number().finite(),
  endY: number().finite(),
  /** Line weight in mm (typically 0.18–0.5 mm for printed sheets). */
  lineWeight: number().finite().positive().default(0.25)
});
const TitleBlockLogoAreaSchema = object({
  x: number().finite(),
  y: number().finite(),
  width: number().finite().positive(),
  height: number().finite().positive()
});
const TitleBlockLayoutSchema = object({
  anchor: _enum(["bottom-left", "bottom-right", "top-left", "top-right"]).default("bottom-right"),
  /** Inset of the anchor corner from the matching sheet edges (mm). */
  insetX: number().finite().nonnegative().default(10),
  insetY: number().finite().nonnegative().default(10),
  /** Title-block size in mm. */
  width: number().finite().positive(),
  height: number().finite().positive()
});
object({
  /** Stable id (e.g. 'standard', 'architectural', 'minimal').  Built-in
   *  templates use lowercase short names; user-supplied templates land
   *  via the Plugin SDK in S62 under prefix-namespaced ids. */
  id: string().min(1),
  /** Human-readable display name shown in the title-block picker. */
  name: string().min(1),
  /** Description for the picker tooltip.  Free-form string. */
  description: string().default(""),
  /** Field list rendered in declaration order. */
  fields: array(TitleBlockFieldSchema).default([]),
  /** Optional logo placement region (renderer paints a placeholder
   *  rectangle until the project supplies a logo image). */
  logoArea: TitleBlockLogoAreaSchema.optional(),
  /** Border lines drawn before fields (header rules, separators, ...). */
  borderLines: array(TitleBlockBorderLineSchema).default([]),
  /** Default on-sheet placement.  Sheet editor falls back to this when
   *  the sheet has no explicit override. */
  defaultLayout: TitleBlockLayoutSchema
});
object({
  /** Project display name (e.g. 'Riverside Apartments'). */
  name: string().default(""),
  /** Project number (e.g. '24-017'). */
  number: string().default(""),
  /** Author / draughter name. */
  drawnBy: string().default(""),
  /** Reviewer name. */
  checkedBy: string().default(""),
  /** Client name (organisation). */
  client: string().default(""),
  /** Free-form site address printed in the title block. */
  siteAddress: string().default("")
});

const BUILTIN_DOOR_TYPES = Object.freeze([
  {
    id: "door.interior.single.standard",
    name: "Interior Single — Standard",
    family: "interior",
    width: 0.9,
    height: 2.1,
    frameThickness: 0.05,
    frameWidth: 0.05,
    swing: "right-in",
    leafColor: "#c2a684",
    frameColor: "#8b7058"
  },
  {
    id: "door.interior.single.bedroom",
    name: "Interior Single — Bedroom",
    family: "interior",
    width: 0.82,
    height: 2.1,
    frameThickness: 0.05,
    frameWidth: 0.05,
    swing: "right-in",
    leafColor: "#d3b78f",
    frameColor: "#8b7058"
  },
  {
    id: "door.interior.double.standard",
    name: "Interior Double — Standard",
    family: "interior",
    width: 1.6,
    height: 2.1,
    frameThickness: 0.05,
    frameWidth: 0.05,
    swing: "right-in",
    leafColor: "#c2a684",
    frameColor: "#8b7058"
  },
  {
    id: "door.exterior.single.standard",
    name: "Exterior Single — Standard",
    family: "exterior",
    width: 0.92,
    height: 2.1,
    frameThickness: 0.07,
    frameWidth: 0.06,
    swing: "right-out",
    leafColor: "#5d3a1a",
    frameColor: "#3d2510"
  },
  {
    id: "door.exterior.double.entrance",
    name: "Exterior Double — Entrance",
    family: "exterior",
    width: 1.8,
    height: 2.4,
    frameThickness: 0.08,
    frameWidth: 0.07,
    swing: "right-out",
    leafColor: "#3a2510",
    frameColor: "#241608"
  },
  {
    id: "door.fire.single.fd30",
    name: "Fire Door — FD30 Single",
    family: "fire",
    width: 0.92,
    height: 2.1,
    frameThickness: 0.06,
    frameWidth: 0.06,
    swing: "right-in",
    fireRating: "FD30",
    leafColor: "#5e5e5e",
    frameColor: "#3a3a3a"
  },
  {
    id: "door.accessible.single.dda",
    name: "Accessible Single — DDA",
    family: "accessible",
    width: 1,
    height: 2.1,
    frameThickness: 0.05,
    frameWidth: 0.05,
    swing: "right-in",
    accessibility: "DDA",
    leafColor: "#c2a684",
    frameColor: "#8b7058"
  },
  {
    id: "door.interior.sliding.pocket",
    name: "Interior Sliding — Pocket",
    family: "interior",
    width: 0.85,
    height: 2.1,
    frameThickness: 0.05,
    frameWidth: 0.05,
    swing: "sliding",
    leafColor: "#d3b78f",
    frameColor: "#8b7058"
  }
]);
function getDoorType(id) {
  return BUILTIN_DOOR_TYPES.find((t) => t.id === id);
}

const BUILTIN_WINDOW_TYPES = Object.freeze([
  {
    id: "window.fixed.single.standard",
    name: "Fixed — Single Pane",
    family: "fixed",
    width: 1.2,
    height: 1.2,
    sillHeight: 0.9,
    frameThickness: 0.05,
    frameWidth: 0.05,
    grid: { columns: 1, rows: 1, mullionThickness: 0.04 },
    glassOpacity: 0.35,
    frameColor: "#cccccc"
  },
  {
    id: "window.fixed.large.picture",
    name: "Fixed — Picture Window",
    family: "fixed",
    width: 2.4,
    height: 1.5,
    sillHeight: 0.6,
    frameThickness: 0.06,
    frameWidth: 0.06,
    grid: { columns: 1, rows: 1, mullionThickness: 0.04 },
    glassOpacity: 0.3,
    frameColor: "#bcbcbc"
  },
  {
    id: "window.casement.single.standard",
    name: "Casement — Single",
    family: "casement",
    width: 0.9,
    height: 1.2,
    sillHeight: 0.9,
    frameThickness: 0.05,
    frameWidth: 0.05,
    grid: { columns: 1, rows: 2, mullionThickness: 0.04 },
    glassOpacity: 0.35,
    frameColor: "#ffffff"
  },
  {
    id: "window.casement.double.standard",
    name: "Casement — Double",
    family: "casement",
    width: 1.6,
    height: 1.2,
    sillHeight: 0.9,
    frameThickness: 0.05,
    frameWidth: 0.05,
    grid: { columns: 2, rows: 2, mullionThickness: 0.04 },
    glassOpacity: 0.35,
    frameColor: "#ffffff"
  },
  {
    id: "window.sliding.double.standard",
    name: "Sliding — Double",
    family: "sliding",
    width: 1.8,
    height: 1.2,
    sillHeight: 0.9,
    frameThickness: 0.06,
    frameWidth: 0.06,
    grid: { columns: 2, rows: 1, mullionThickness: 0.06 },
    glassOpacity: 0.32,
    frameColor: "#888888"
  },
  {
    id: "window.sliding.triple.standard",
    name: "Sliding — Triple",
    family: "sliding",
    width: 2.7,
    height: 1.2,
    sillHeight: 0.9,
    frameThickness: 0.06,
    frameWidth: 0.06,
    grid: { columns: 3, rows: 1, mullionThickness: 0.06 },
    glassOpacity: 0.32,
    frameColor: "#888888"
  },
  {
    id: "window.awning.single.standard",
    name: "Awning — Single",
    family: "awning",
    width: 0.9,
    height: 0.6,
    sillHeight: 1.6,
    frameThickness: 0.05,
    frameWidth: 0.05,
    grid: { columns: 1, rows: 1, mullionThickness: 0.04 },
    glassOpacity: 0.35,
    frameColor: "#ffffff"
  },
  {
    id: "window.fixed.fire.fr60",
    name: "Fire-Rated Fixed — FR60",
    family: "fixed",
    width: 1,
    height: 1,
    sillHeight: 1,
    frameThickness: 0.07,
    frameWidth: 0.06,
    grid: { columns: 1, rows: 1, mullionThickness: 0.05 },
    glassOpacity: 0.5,
    frameColor: "#444444",
    fireRating: "FR60"
  }
]);
function getWindowType(id) {
  return BUILTIN_WINDOW_TYPES.find((t) => t.id === id);
}

const BUILTIN_ROOF_TYPES = Object.freeze([
  {
    id: "roof.flat.standard",
    name: "Flat — Standard",
    shape: "flat",
    pitch: 0,
    thickness: 0.2,
    overhang: 0.2,
    materialColor: "#5a5a5a"
  },
  {
    id: "roof.gable.standard",
    name: "Gable — Standard 6:12",
    shape: "gable",
    pitch: Math.atan(6 / 12),
    thickness: 0.2,
    overhang: 0.4,
    materialColor: "#7a4a2a"
  },
  {
    id: "roof.hip.standard",
    name: "Hip — Standard 6:12",
    shape: "hip",
    pitch: Math.atan(6 / 12),
    thickness: 0.2,
    overhang: 0.4,
    materialColor: "#7a4a2a"
  },
  {
    id: "roof.mansard.standard",
    name: "Mansard — Standard",
    shape: "mansard",
    pitch: Math.atan(10 / 12),
    thickness: 0.22,
    overhang: 0.3,
    materialColor: "#3a2a1a"
  }
]);
function getRoofType(id) {
  return BUILTIN_ROOF_TYPES.find((t) => t.id === id);
}

function withHandlerSpan(spanName, attributes, fn, opts) {
  const span = trace.getActiveSpan() ? trace.getTracer("pryzm.handler").startSpan(spanName, opts) : trace.getTracer("pryzm.handler").startSpan(spanName, opts);
  for (const [k, v] of Object.entries(attributes)) {
    span.setAttribute(k, v);
  }
  try {
    const result = fn(span);
    span.setStatus({ code: SpanStatusCode.OK });
    return result;
  } catch (err) {
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: err instanceof Error ? err.message : String(err)
    });
    if (err instanceof Error) span.recordException(err);
    throw err;
  } finally {
    span.end();
  }
}

class WallStore extends Store {
  constructor() {
    super("wall");
  }
  /** Convenience read — every wall id currently in the store, in
   *  insertion order. */
  ids() {
    return [...this.state.keys()];
  }
  /** Convenience read — every wall on a given level.  O(N) — fine for
   *  S07; an L1 secondary index lands when the LevelStore arrives. */
  byLevel(levelId) {
    const out = [];
    for (const w of this.state.values()) {
      if (w.levelId === levelId) out.push(w);
    }
    return out;
  }
  /** Lookup by id; returns `undefined` when missing.  Mirrors
   *  PRYZM 1's `WallStore.getById()`. */
  get(id) {
    return this.state.get(id);
  }
}

function makeBuiltIn$1(id, name, description, layers) {
  const total = layers.reduce((s, l) => s + l.thickness, 0);
  return {
    id,
    name,
    description,
    layers,
    // 6dp round to keep equality tests stable across floating-point ops.
    totalThickness: Math.round(total * 1e6) / 1e6,
    createdAt: 0,
    modifiedAt: 0
  };
}
[
  makeBuiltIn$1(
    "wt-monolithic",
    "Monolithic (Default)",
    "Single-material wall — identical to pre-type-system walls.",
    [
      // §L934-ONE-WALL-ONE-COLOUR — was '#d4c5b0'. Kept in lock-step with the
      // `wt-monolithic` entry in `packages/geometry-wall/src/WallSystemTypeStore.ts`,
      // which carries the full reasoning: the DEFAULT type must declare the same white
      // §BEIGE-WALL-FIX (2026-06-08) already ruled correct, or a wall changes colour
      // the moment it touches a junction (founder, L-934).
      { name: "Wall Body", thickness: 0.1, function: "structure", materialColor: "#e8e8e8" }
    ]
  ),
  makeBuiltIn$1(
    "wt-interior-partition",
    "Interior – Partition 100mm",
    "Lightweight interior partition: plaster / stud / plaster.",
    [
      { name: "Plaster (Inner)", thickness: 0.012, function: "finish-interior", materialColor: "#f0ece4" },
      { name: "Stud / Cavity", thickness: 0.076, function: "structure", materialColor: "#d4b896" },
      { name: "Plaster (Outer)", thickness: 0.012, function: "finish-exterior", materialColor: "#f0ece4" }
    ]
  ),
  makeBuiltIn$1(
    "wt-exterior-brick",
    "Exterior – Brick 300mm",
    "Cavity brick wall: brick / cavity / insulation / blockwork / plaster.",
    [
      { name: "Face Brick", thickness: 0.11, function: "finish-exterior", materialColor: "#c0674a" },
      { name: "Air Cavity", thickness: 0.05, function: "air-barrier", materialColor: "#e8e8e8" },
      { name: "Insulation", thickness: 0.06, function: "insulation", materialColor: "#f5e07a" },
      { name: "Concrete Block", thickness: 0.14, function: "structure", materialColor: "#a0a0a0" },
      { name: "Internal Render", thickness: 0.015, function: "finish-interior", materialColor: "#f0ece4" }
    ]
  ),
  makeBuiltIn$1(
    "wt-exterior-concrete",
    "Exterior – Concrete 250mm",
    "Insulated concrete wall: render / insulation / concrete / plaster.",
    [
      { name: "External Render", thickness: 0.015, function: "finish-exterior", materialColor: "#c8bfa8" },
      { name: "Insulation", thickness: 0.08, function: "insulation", materialColor: "#f5e07a" },
      { name: "Concrete", thickness: 0.2, function: "structure", materialColor: "#909090" },
      { name: "Plaster", thickness: 0.012, function: "finish-interior", materialColor: "#f0ece4" }
    ]
  ),
  makeBuiltIn$1(
    "wt-cmu-200",
    "CMU – 200mm Block",
    "Concrete masonry unit wall, painted both faces.",
    [
      { name: "Paint (Exterior)", thickness: 1e-3, function: "finish-exterior", materialColor: "#dddddd" },
      { name: "CMU Block", thickness: 0.2, function: "structure", materialColor: "#a0a0a0" },
      { name: "Paint (Interior)", thickness: 1e-3, function: "finish-interior", materialColor: "#f5f5f5" }
    ]
  ),
  makeBuiltIn$1(
    "wt-glazed-curtain-stub",
    "Glazed – Curtain Stub 50mm",
    "Single-pane stub used by tools that need a thin glazed wall placeholder.",
    [{ name: "Glazing", thickness: 0.05, function: "finish-exterior", materialColor: "#7ec8e3" }]
  ),
  makeBuiltIn$1(
    "wt-stud-150",
    "Stud Wall – 150mm",
    "Timber stud wall with insulation core and gypsum facings.",
    [
      { name: "Gypsum (Outer)", thickness: 0.0125, function: "finish-exterior", materialColor: "#efe9da" },
      { name: "Insulation", thickness: 0.125, function: "insulation", materialColor: "#f5e07a" },
      { name: "Gypsum (Inner)", thickness: 0.0125, function: "finish-interior", materialColor: "#efe9da" }
    ]
  ),
  makeBuiltIn$1(
    "wt-foundation-300",
    "Foundation – Concrete 300mm",
    "Below-grade foundation wall, no finishes by default.",
    [{ name: "Concrete", thickness: 0.3, function: "structure", materialColor: "#7d7d7d" }]
  )
];

class WallSystemError extends Error {
  constructor(message, name = "WallSystemError") {
    super(message);
    this.name = name;
  }
}
class WallNotFoundError extends WallSystemError {
  wallId;
  constructor(wallId) {
    super(`Wall not found: ${wallId}`, "WallNotFoundError");
    this.wallId = wallId;
  }
}
class WallSchemaError extends WallSystemError {
  cause;
  constructor(message, cause) {
    super(message, "WallSchemaError");
    this.cause = cause;
  }
}
class WallDimensionsError extends WallSystemError {
  constructor(message) {
    super(message, "WallDimensionsError");
  }
}
class WallSystemTypeNotFoundError extends WallSystemError {
  systemTypeId;
  constructor(systemTypeId) {
    super(`Wall system-type not found: ${systemTypeId}`, "WallSystemTypeNotFoundError");
    this.systemTypeId = systemTypeId;
  }
}

function resolveWallSystemType(store, input) {
  if (input.layers !== void 0 && input.layers.length > 0) {
    const sum = input.layers.reduce((s, l) => s + (l?.thickness ?? 0), 0);
    return {
      layers: cloneLayers(input.layers),
      thickness: input.thickness !== void 0 ? input.thickness : sum > 0 ? round6(sum) : void 0
    };
  }
  if (input.systemTypeId !== void 0 && store !== void 0) {
    const type = store.get(input.systemTypeId);
    if (type !== void 0) {
      const layers = Array.isArray(type.layers) && type.layers.length > 0 ? cloneLayers(type.layers) : void 0;
      const total = type.totalThickness;
      return {
        layers,
        thickness: typeof total === "number" && total > 0 ? total : input.thickness
      };
    }
  }
  return { thickness: input.thickness, layers: void 0 };
}
function cloneLayers(layers) {
  return layers.map((l) => ({ ...l }));
}
function round6(n) {
  return Math.round(n * 1e6) / 1e6;
}

const WALL_CREATE_UNREACHABLE = "wall.create: this process registers an authoritative WallStore (ADR-0318 §ADR-0318-ELEMENTS-SLOT, the instance ProjectSerializer reads) but its engine half is NOT attached, so the create cannot land: WallStore.add() refuses rather than admit a wall onto a level it cannot check (ADR-0318 I-3, WallStoreEngineNotAttachedError). This handler will not report success for a write that reaches only the detached plugin DTO store. wall.create completes in a runtime that ALSO composes the engine half: apps/editor/src/engine/initBuilders.ts calls wallStore.attachEngine(projectContext, bimManager), and initTools.ts's runtime.events.on('wall.created') bridge performs the authoritative wallStore.add plus the viewDependencyTracker/bimManager level registration.";
function authoritativeWallStoreRefusal() {
  const s = storeRegistry.getStoreForType("wall");
  if (!s) return null;
  if (typeof s.isEngineAttached !== "function") return null;
  if (s.isEngineAttached()) return null;
  return WALL_CREATE_UNREACHABLE;
}
class CreateWallHandler {
  /** Optional `WallSystemTypeStore` reference.  When supplied, any
   *  `cmd.systemTypeId` in the payload is validated against the
   *  catalogue at `canExecute` time — unknown ids are rejected with a
   *  deterministic reason (and would throw `WallSystemTypeNotFoundError`
   *  in `execute` on a race).  When omitted, `systemTypeId` is accepted
   *  verbatim — preserves S07 fixtures + tests that don't wire the
   *  catalogue. */
  constructor(systemTypeStore) {
    this.systemTypeStore = systemTypeStore;
  }
  systemTypeStore;
  type = "wall.create";
  affectedStores = ["wall"];
  // C11 §3.2: domain-invariant regex for branded wall IDs.
  // Mirrors the regex inside defineElement('wall', ...) in @pryzm/schemas.
  static WALL_ID_RE = /^wall_[0-9A-HJKMNP-TV-Z]{26}$/;
  canExecute(_ctx, cmd) {
    if (cmd.height !== void 0 && (!Number.isFinite(cmd.height) || cmd.height <= 0)) {
      return { valid: false, reason: "height must be > 0" };
    }
    if (cmd.thickness !== void 0 && (!Number.isFinite(cmd.thickness) || cmd.thickness < 0.05)) {
      return { valid: false, reason: "thickness must be ≥ 0.05 m" };
    }
    if (cmd.id !== void 0) {
      if (typeof cmd.id !== "string" || cmd.id.length === 0) {
        return { valid: false, reason: "id must be a non-empty string" };
      }
      if (!CreateWallHandler.WALL_ID_RE.test(cmd.id)) {
        return {
          valid: false,
          reason: "id must be a branded wall_<ulid> — omit id to auto-generate, or use createId('wall') from @pryzm/schemas"
        };
      }
    }
    if (cmd.systemTypeId !== void 0 && this.systemTypeStore !== void 0 && !this.systemTypeStore.has(cmd.systemTypeId)) {
      return {
        valid: false,
        reason: `unknown systemTypeId: ${cmd.systemTypeId}`
      };
    }
    const unreachable = authoritativeWallStoreRefusal();
    if (unreachable !== null) return { valid: false, reason: unreachable };
    return { valid: true };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      if (cmd.systemTypeId !== void 0 && this.systemTypeStore !== void 0 && !this.systemTypeStore.has(cmd.systemTypeId)) {
        throw new WallSystemTypeNotFoundError(cmd.systemTypeId);
      }
      const resolved = resolveWallSystemType(this.systemTypeStore, cmd);
      const resolvedThickness = resolved.thickness;
      const resolvedLayers = resolved.layers;
      if (cmd.systemTypeId !== void 0 && resolvedLayers === void 0) {
        console.warn(
          `[CreateWallHandler] systemTypeId='${cmd.systemTypeId}' did not resolve to a layer stack (${this.systemTypeStore === void 0 ? "NO systemTypeStore wired" : "id not found in the wired catalogue"}). Wall stored unlayered at thickness=${resolvedThickness ?? "default"}. Expected: the ONE shared catalogue (ADR-0116, buildSharedWallCatalogue) is wired into wall.create.`
        );
      }
      const id = cmd.id ?? createId("wall");
      let wall;
      try {
        wall = Wall.parse({
          id,
          levelId: cmd.levelId ?? "",
          ...cmd.baseLine !== void 0 ? { baseLine: cmd.baseLine } : {},
          ...cmd.height !== void 0 ? { height: cmd.height } : {},
          ...resolvedThickness !== void 0 ? { thickness: resolvedThickness } : {},
          ...cmd.baseOffset !== void 0 ? { baseOffset: cmd.baseOffset } : {},
          ...cmd.materialColor !== void 0 ? { materialColor: cmd.materialColor } : {},
          ...cmd.materialId !== void 0 ? { materialId: cmd.materialId } : {},
          ...cmd.systemTypeId !== void 0 ? { systemTypeId: cmd.systemTypeId } : {},
          // §FIX-WALL-LAYERS-PLAN-VS-3D-CREATION — PERSIST the resolved stack. `layers`
          // was declared on CreateWallPayload but never written here: the field was
          // dropped on the floor by the canonical handler, so NO bus-created wall has
          // ever carried a layer stack in the PRYZM3 store. This line is the fix.
          ...resolvedLayers !== void 0 ? { layers: resolvedLayers } : {},
          // §FIX-WALL-CURVE-PLAN-VS-3D-CREATION — PERSIST the curve descriptor. Same
          // defect family as `layers` above (L-239): declared by callers, dropped here,
          // so NO bus-created wall ever carried curvature in the PRYZM3 store and the
          // bus-only plan path committed curved walls as straight. This line is the fix.
          ...cmd.curve !== void 0 ? { curve: cmd.curve } : {}
        });
      } catch (cause) {
        throw new WallSchemaError(
          `wall.create rejected — schema validation failed for id ${id}`,
          cause
        );
      }
      if (cmd.baseLine !== void 0) {
        const [a, b] = cmd.baseLine;
        const dx = a.x - b.x;
        const dz = a.z - b.z;
        if (Math.hypot(dx, dz) < 0.05) {
          throw new WallDimensionsError(
            `wall.create rejected — baseLine endpoints must be ≥ 0.05 m apart in the XZ plane.`
          );
        }
      }
      const [next, forward, inverse] = produceCommand(ctx.stores.wall, (draft) => {
        draft[id] = wall;
      });
      return { forward, inverse, nextStates: { wall: next } };
    });
  }
}

class CreateWallBatchHandler {
  /** Optional `WallSystemTypeStore` reference.  When supplied, any
   *  `wall.systemTypeId` in each payload entry is validated against the
   *  catalogue at `canExecute` time.  Omitting it preserves S07 behaviour. */
  constructor(systemTypeStore) {
    this.systemTypeStore = systemTypeStore;
  }
  systemTypeStore;
  type = "wall.batch.create";
  affectedStores = ["wall"];
  canExecute(_ctx, cmd) {
    if (!Array.isArray(cmd.walls) || cmd.walls.length === 0) {
      return { valid: false, reason: "walls must be a non-empty array" };
    }
    for (let i = 0; i < cmd.walls.length; i++) {
      const w = cmd.walls[i];
      if (w.height !== void 0 && (!Number.isFinite(w.height) || w.height <= 0)) {
        return { valid: false, reason: `walls[${i}].height must be > 0` };
      }
      if (w.thickness !== void 0 && (!Number.isFinite(w.thickness) || w.thickness < 0.05)) {
        return { valid: false, reason: `walls[${i}].thickness must be ≥ 0.05 m` };
      }
      if (w.id !== void 0 && (typeof w.id !== "string" || w.id.length === 0)) {
        return { valid: false, reason: `walls[${i}].id must be a non-empty string when provided` };
      }
      if (w.systemTypeId !== void 0 && this.systemTypeStore !== void 0 && !this.systemTypeStore.has(w.systemTypeId)) {
        return {
          valid: false,
          reason: `walls[${i}]: unknown systemTypeId: ${w.systemTypeId}`
        };
      }
    }
    return { valid: true };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      const defaultLevelId = cmd.levelId ?? "";
      const fresh = [];
      for (let i = 0; i < cmd.walls.length; i++) {
        const w = cmd.walls[i];
        if (w.systemTypeId !== void 0 && this.systemTypeStore !== void 0 && !this.systemTypeStore.has(w.systemTypeId)) {
          throw new WallSystemTypeNotFoundError(w.systemTypeId);
        }
        const id = w.id ?? createId("wall");
        const resolved = resolveWallSystemType(this.systemTypeStore, w);
        let wall;
        try {
          wall = Wall.parse({
            id,
            levelId: w.levelId ?? defaultLevelId,
            ...w.baseLine !== void 0 ? { baseLine: w.baseLine } : {},
            ...w.height !== void 0 ? { height: w.height } : {},
            ...resolved.thickness !== void 0 ? { thickness: resolved.thickness } : {},
            ...w.baseOffset !== void 0 ? { baseOffset: w.baseOffset } : {},
            ...w.materialColor !== void 0 ? { materialColor: w.materialColor } : {},
            ...w.materialId !== void 0 ? { materialId: w.materialId } : {},
            ...w.systemTypeId !== void 0 ? { systemTypeId: w.systemTypeId } : {},
            ...resolved.layers !== void 0 ? { layers: resolved.layers } : {},
            // §FIX-WALL-CURVE-PLAN-VS-3D-CREATION (2026-08-06) — same chokepoint rule as
            // single wall.create: the curve descriptor is carried verbatim onto the instance.
            ...w.curve !== void 0 ? { curve: w.curve } : {}
          });
        } catch (cause) {
          throw new WallSchemaError(
            `wall.batch.create rejected — schema validation failed for walls[${i}] (id=${id})`,
            cause
          );
        }
        if (w.baseLine !== void 0) {
          const [a, b] = w.baseLine;
          const dx = a.x - b.x;
          const dz = a.z - b.z;
          if (Math.hypot(dx, dz) < 0.05) {
            throw new WallDimensionsError(
              `wall.batch.create rejected — walls[${i}] baseLine endpoints must be ≥ 0.05 m apart in the XZ plane.`
            );
          }
        }
        fresh.push(wall);
      }
      const [next, forward, inverse] = produceCommand(ctx.stores.wall, (draft) => {
        for (const w of fresh) draft[w.id] = w;
      });
      return { forward, inverse, nextStates: { wall: next } };
    });
  }
}

class DeleteWallHandler {
  type = "wall.delete";
  affectedStores = ["wall"];
  canExecute(ctx, cmd) {
    if (typeof cmd.id !== "string" || cmd.id.length === 0) {
      return { valid: false, reason: "cmd.id must be a non-empty string" };
    }
    if (!Object.prototype.hasOwnProperty.call(ctx.stores.wall, cmd.id)) {
      return { valid: false, reason: `wall not found: ${cmd.id}` };
    }
    return { valid: true };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      if (!Object.prototype.hasOwnProperty.call(ctx.stores.wall, cmd.id)) {
        throw new WallNotFoundError(cmd.id);
      }
      const [next, forward, inverse] = produceCommand(ctx.stores.wall, (draft) => {
        delete draft[cmd.id];
      });
      return { forward, inverse, nextStates: { wall: next } };
    });
  }
}

const MIN_WALL_LEN$3 = 0.05;
const PERP_EPS = 1e-9;
function isFiniteXZ(p) {
  if (typeof p !== "object" || p === null) return false;
  const r = p;
  return typeof r.x === "number" && Number.isFinite(r.x) && typeof r.z === "number" && Number.isFinite(r.z);
}
function isFiniteVec3$e(v) {
  if (typeof v !== "object" || v === null) return false;
  const r = v;
  return typeof r.x === "number" && Number.isFinite(r.x) && typeof r.y === "number" && Number.isFinite(r.y) && typeof r.z === "number" && Number.isFinite(r.z);
}
function planarLen(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}
function ensureMinLen(a, b, kind) {
  if (planarLen(a, b) < MIN_WALL_LEN$3) {
    throw new WallDimensionsError(
      `wall.transform[${kind}] would shrink baseLine below ${MIN_WALL_LEN$3} m`
    );
  }
}
function transformMove(wall, delta) {
  const [a, b] = wall.baseLine;
  return [
    { x: a.x + delta.x, y: a.y, z: a.z + delta.z },
    { x: b.x + delta.x, y: b.y, z: b.z + delta.z }
  ];
}
function reflectXZ(p, origin, dir) {
  const dlen = Math.hypot(dir.x, dir.z);
  if (dlen < PERP_EPS) {
    throw new WallDimensionsError("wall.transform[mirror] axis direction is zero-length");
  }
  const ux = dir.x / dlen;
  const uz = dir.z / dlen;
  const vx = p.x - origin.x;
  const vz = p.z - origin.z;
  const t = vx * ux + vz * uz;
  return {
    x: origin.x + (2 * t * ux - vx),
    z: origin.z + (2 * t * uz - vz)
  };
}
function transformMirror(wall, axis) {
  const [a, b] = wall.baseLine;
  const ra = reflectXZ(a, axis.origin, axis.direction);
  const rb = reflectXZ(b, axis.origin, axis.direction);
  return [
    { x: ra.x, y: a.y, z: ra.z },
    { x: rb.x, y: b.y, z: rb.z }
  ];
}
function transformScale(wall, pivot, factor) {
  const [a, b] = wall.baseLine;
  return [
    {
      x: pivot.x + (a.x - pivot.x) * factor,
      y: a.y,
      z: pivot.z + (a.z - pivot.z) * factor
    },
    {
      x: pivot.x + (b.x - pivot.x) * factor,
      y: b.y,
      z: pivot.z + (b.z - pivot.z) * factor
    }
  ];
}
function transformOffset(wall, distance, side) {
  const [a, b] = wall.baseLine;
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len = Math.hypot(dx, dz);
  if (len < PERP_EPS) {
    throw new WallDimensionsError(
      "wall.transform[offset] cannot operate on a zero-length baseline"
    );
  }
  const sign = side === "left" ? 1 : -1;
  const px = -dz / len * distance * sign;
  const pz = dx / len * distance * sign;
  return [
    { x: a.x + px, y: a.y, z: a.z + pz },
    { x: b.x + px, y: b.y, z: b.z + pz }
  ];
}
function transformReferenceEdit(_wall, newBaseLine) {
  const [a, b] = newBaseLine;
  return [
    { x: a.x, y: a.y, z: a.z },
    { x: b.x, y: b.y, z: b.z }
  ];
}
function dispatchTransform(wall, cmd) {
  switch (cmd.kind) {
    case "move":
      return transformMove(wall, cmd.delta);
    case "mirror":
      return transformMirror(wall, cmd.axis);
    case "scale":
      return transformScale(wall, cmd.pivot, cmd.factor);
    case "offset":
      return transformOffset(wall, cmd.distance, cmd.side);
    case "referenceEdit":
      return transformReferenceEdit(wall, cmd.newBaseLine);
    default: {
      const _x = cmd;
      throw new WallDimensionsError(
        `wall.transform: unknown kind in payload: ${JSON.stringify(_x)}`
      );
    }
  }
}
const WALL_TRANSFORM_UNREACHABLE = "wall.transform writes the detached plugin wall store that nothing renders, exports or persists, and no production surface dispatches it. Every wall geometry edit commits through wall.updateBaseline (payload keys: wallId, newBaseLine, prevBaseLine) → UpdateWallBaselineCommand → the geometry wallStore, with wall.cascadeBaseline for neighbour carry. Compute the new baseline for your mirror/scale/offset/move and dispatch that instead.";
class TransformWallHandler {
  type = "wall.transform";
  affectedStores = ["wall"];
  /** Payload validation ONLY — kept public so a delegating facade can reuse it. */
  validatePayload(ctx, cmd) {
    if (typeof cmd.id !== "string" || cmd.id.length === 0) {
      return { valid: false, reason: "cmd.id must be a non-empty string" };
    }
    if (!Object.prototype.hasOwnProperty.call(ctx.stores.wall, cmd.id)) {
      return { valid: false, reason: `wall not found: ${cmd.id}` };
    }
    switch (cmd.kind) {
      case "move":
        if (!isFiniteXZ(cmd.delta)) {
          return { valid: false, reason: "delta must be { x, z } with finite numbers" };
        }
        return { valid: true };
      case "mirror":
        if (!isFiniteXZ(cmd.axis?.origin) || !isFiniteXZ(cmd.axis?.direction)) {
          return { valid: false, reason: "axis.{origin,direction} must be { x, z } with finite numbers" };
        }
        if (Math.hypot(cmd.axis.direction.x, cmd.axis.direction.z) < PERP_EPS) {
          return { valid: false, reason: "axis.direction must be non-zero" };
        }
        return { valid: true };
      case "scale":
        if (!isFiniteXZ(cmd.pivot)) {
          return { valid: false, reason: "pivot must be { x, z } with finite numbers" };
        }
        if (!Number.isFinite(cmd.factor) || cmd.factor === 0) {
          return { valid: false, reason: "factor must be a finite non-zero number" };
        }
        return { valid: true };
      case "offset":
        if (!Number.isFinite(cmd.distance)) {
          return { valid: false, reason: "distance must be a finite number" };
        }
        if (cmd.side !== "left" && cmd.side !== "right") {
          return { valid: false, reason: "side must be 'left' or 'right'" };
        }
        return { valid: true };
      case "referenceEdit": {
        if (!Array.isArray(cmd.newBaseLine) || cmd.newBaseLine.length !== 2) {
          return { valid: false, reason: "newBaseLine must be a 2-tuple of Vec3" };
        }
        const [a, b] = cmd.newBaseLine;
        if (!isFiniteVec3$e(a) || !isFiniteVec3$e(b)) {
          return { valid: false, reason: "newBaseLine endpoints must be finite { x, y, z }" };
        }
        if (a.y !== b.y) {
          return { valid: false, reason: "newBaseLine endpoints must share the same y (level elevation)" };
        }
        if (planarLen(a, b) < MIN_WALL_LEN$3) {
          return { valid: false, reason: `newBaseLine planar length must be ≥ ${MIN_WALL_LEN$3} m` };
        }
        return { valid: true };
      }
      default: {
        const _x = cmd;
        return { valid: false, reason: `unknown transform kind: ${JSON.stringify(_x)}` };
      }
    }
  }
  /**
   * §FIX-DEAD-MOVE-VERB-REFUSE (W3-4) — ORDER IS LOAD-BEARING. `canExecute` must be the
   * LAST method before `execute`. `tools/ga-gate/check-verb-register.ts` classifies a
   * verb as REFUSES by slicing the source from `canExecute` to the next `execute(` and
   * checking that the slice can never yield an ACCEPTING validation result. With
   * `validatePayload` sitting between them, its accepting branch lands inside that slice
   * and the verb is mis-reported as UNKNOWN — a refusal hiding from the register that
   * exists to find it. (For the same reason this comment must not spell the accepting
   * literal out: the detector is a regex over source text, and prose is source text.)
   * Do not reorder these two methods.
   */
  canExecute(ctx, cmd) {
    const v = this.validatePayload(ctx, cmd);
    if (!v.valid) return v;
    return { valid: false, reason: WALL_TRANSFORM_UNREACHABLE };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      const wall = ctx.stores.wall[cmd.id];
      if (wall === void 0) throw new WallNotFoundError(cmd.id);
      const nextBaseLine = dispatchTransform(wall, cmd);
      ensureMinLen(nextBaseLine[0], nextBaseLine[1], cmd.kind);
      const [next, forward, inverse] = produceCommand(ctx.stores.wall, (draft) => {
        const w = draft[cmd.id];
        if (w === void 0) return;
        w.baseLine = [
          { x: nextBaseLine[0].x, y: nextBaseLine[0].y, z: nextBaseLine[0].z },
          { x: nextBaseLine[1].x, y: nextBaseLine[1].y, z: nextBaseLine[1].z }
        ];
      });
      return { forward, inverse, nextStates: { wall: next } };
    });
  }
}

const INNER = new TransformWallHandler();
const WALL_MOVE_UNREACHABLE = "wall.move writes the detached plugin wall store that nothing renders, exports or persists, and no production surface dispatches it. Moving a wall commits through wall.updateBaseline (payload keys: wallId, newBaseLine, prevBaseLine) — the live bridge to UpdateWallBaselineCommand and the geometry wallStore, pinned by L-49 — which is what both the 3-D gizmo and the plan Move tool already dispatch. Use the Move tool, the 3-D gizmo, or wall.updateBaseline directly.";
class MoveWallHandler {
  type = "wall.move";
  affectedStores = ["wall"];
  /**
   * Payload validation ONLY.
   *
   * §FIX-DEAD-MOVE-VERB-REFUSE (W3-4) — this delegates to `INNER.validatePayload`,
   * NOT to `INNER.canExecute`. `TransformWallHandler.canExecute` now refuses too, and
   * routing through it would make a `wall.move` caller read a refusal that talks about
   * `wall.transform`. Each verb must state its OWN reason, so the facade reuses only the
   * shared validation and supplies its own refusal above.
   */
  validatePayload(ctx, cmd) {
    return INNER.validatePayload(ctx, { kind: "referenceEdit", id: cmd.id, newBaseLine: cmd.baseLine });
  }
  /**
   * §FIX-DEAD-MOVE-VERB-REFUSE (W3-4) — ORDER IS LOAD-BEARING. `canExecute` must be the
   * LAST method before `execute`. `tools/ga-gate/check-verb-register.ts` classifies a
   * verb as REFUSES by slicing the source from `canExecute` to the next `execute(` and
   * checking that the slice can never yield an ACCEPTING validation result. With
   * `validatePayload` sitting between them, its accepting branch lands inside that slice
   * and the verb is mis-reported as UNKNOWN — a refusal hiding from the register that
   * exists to find it. (For the same reason this comment must not spell the accepting
   * literal out: the detector is a regex over source text, and prose is source text.)
   * Do not reorder these two methods.
   */
  canExecute(ctx, cmd) {
    const v = this.validatePayload(ctx, cmd);
    if (!v.valid) return v;
    return { valid: false, reason: WALL_MOVE_UNREACHABLE };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      return INNER.execute(ctx, { kind: "referenceEdit", id: cmd.id, newBaseLine: cmd.baseLine });
    });
  }
}

const WALL_SET_DIMENSIONS_UNREACHABLE = "wall.setDimensions writes the detached plugin wall store that nothing renders. Use wall.updateDimensions: §FIX-DIMS-REACH-RECORD (ADR-0315 U1 / L-815) re-pointed that verb at the same-name legacy bridge in initBusHandlers, which runs UpdateWallDimensionsCommand against the geometry wallStore and rebuilds the mesh.";
class SetWallDimensionsHandler {
  type = "wall.setDimensions";
  affectedStores = ["wall"];
  canExecute(ctx, cmd) {
    if (typeof cmd.id !== "string" || cmd.id.length === 0) {
      return { valid: false, reason: "cmd.id must be a non-empty string" };
    }
    if (cmd.height === void 0 && cmd.thickness === void 0 && cmd.baseOffset === void 0) {
      return { valid: false, reason: "at least one of height / thickness / baseOffset is required" };
    }
    if (cmd.height !== void 0 && (!Number.isFinite(cmd.height) || cmd.height <= 0)) {
      return { valid: false, reason: "height must be > 0" };
    }
    if (cmd.thickness !== void 0 && (!Number.isFinite(cmd.thickness) || cmd.thickness < 0.05)) {
      return { valid: false, reason: "thickness must be ≥ 0.05 m" };
    }
    if (cmd.baseOffset !== void 0 && !Number.isFinite(cmd.baseOffset)) {
      return { valid: false, reason: "baseOffset must be a finite number" };
    }
    if (!Object.prototype.hasOwnProperty.call(ctx.stores.wall, cmd.id)) {
      return { valid: false, reason: `wall not found: ${cmd.id}` };
    }
    return { valid: false, reason: WALL_SET_DIMENSIONS_UNREACHABLE };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      const wall = ctx.stores.wall[cmd.id];
      if (wall === void 0) throw new WallNotFoundError(cmd.id);
      if (cmd.height !== void 0 && cmd.height <= 0) {
        throw new WallDimensionsError("height must be > 0");
      }
      if (cmd.thickness !== void 0 && cmd.thickness < 0.05) {
        throw new WallDimensionsError("thickness must be ≥ 0.05 m");
      }
      const [next, forward, inverse] = produceCommand(ctx.stores.wall, (draft) => {
        const w = draft[cmd.id];
        if (w === void 0) return;
        if (cmd.height !== void 0) w.height = cmd.height;
        if (cmd.thickness !== void 0) w.thickness = cmd.thickness;
        if (cmd.baseOffset !== void 0) w.baseOffset = cmd.baseOffset;
      });
      return { forward, inverse, nextStates: { wall: next } };
    });
  }
}

const HEX_COLOR_RE$4 = /^#[0-9a-fA-F]{6}$/;
const WALL_SET_COLOR_UNREACHABLE = "wall.setColor writes the detached plugin wall store that nothing renders (§FIX-MATERIAL-DEAD-DISPATCH). Use wall.updateColor for one wall (its payload key is wallId, not id) or wall.updateColorBatch for many — both run UpdateWallColorCommand against the geometry wallStore, and WallFragmentBuilder reads BOTH materialColor and a catalogue materialId from it.";
class SetWallColorHandler {
  type = "wall.setColor";
  affectedStores = ["wall"];
  canExecute(ctx, cmd) {
    if (typeof cmd.id !== "string" || cmd.id.length === 0) {
      return { valid: false, reason: "cmd.id must be a non-empty string" };
    }
    if (cmd.materialColor === void 0 && cmd.materialId === void 0) {
      return { valid: false, reason: "at least one of materialColor / materialId is required" };
    }
    if (cmd.materialColor !== void 0 && !HEX_COLOR_RE$4.test(cmd.materialColor)) {
      return { valid: false, reason: "materialColor must be a #rrggbb hex string" };
    }
    if (cmd.materialId !== void 0 && cmd.materialId !== null && (typeof cmd.materialId !== "string" || cmd.materialId.length === 0)) {
      return { valid: false, reason: "materialId must be a non-empty string or null" };
    }
    if (!Object.prototype.hasOwnProperty.call(ctx.stores.wall, cmd.id)) {
      return { valid: false, reason: `wall not found: ${cmd.id}` };
    }
    return { valid: false, reason: WALL_SET_COLOR_UNREACHABLE };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      const wall = ctx.stores.wall[cmd.id];
      if (wall === void 0) throw new WallNotFoundError(cmd.id);
      const [next, forward, inverse] = produceCommand(ctx.stores.wall, (draft) => {
        const w = draft[cmd.id];
        if (w === void 0) return;
        if (cmd.materialColor !== void 0) w.materialColor = cmd.materialColor;
        if (cmd.materialId !== void 0) {
          if (cmd.materialId === null) {
            delete w.materialId;
          } else {
            w.materialId = cmd.materialId;
          }
        }
      });
      return { forward, inverse, nextStates: { wall: next } };
    });
  }
}

const WALL_TYPE_BATCH_REPORT_EVENT = "pryzm-wall-type-batch-report";
const UpdateWallsSystemTypeBatchHandler = {
  type: "wall.updateSystemTypeBatch",
  affectedStores: [],
  canExecute(_ctx, cmd) {
    if (cmd.wallIds !== "all" && !Array.isArray(cmd.wallIds)) {
      return { valid: false, reason: "wallIds must be 'all' or an array of wall ids" };
    }
    if (cmd.systemType !== null && (typeof cmd.systemType !== "string" || cmd.systemType.length === 0)) {
      return { valid: false, reason: "systemType must be a non-empty type id/name, or null to detach" };
    }
    return { valid: true };
  },
  execute(_ctx, cmd) {
    return withHandlerSpan(
      "wall.updateSystemTypeBatch.handler",
      { "pryzm.command.type": "wall.updateSystemTypeBatch" },
      () => {
        const cm = window.commandManager;
        const sayNothingRan = (why) => {
          const report = {
            success: false,
            info: [
              `'wall.updateSystemTypeBatch' did not run — ${why}. Nothing was changed, and nothing about the model is confirmed.`
            ],
            affectedElementIds: [],
            outcome: "indeterminate"
          };
          try {
            window.dispatchEvent(new CustomEvent(WALL_TYPE_BATCH_REPORT_EVENT, { detail: report }));
          } catch (emitErr) {
            console.error("[wall.updateSystemTypeBatch.handler] indeterminate report emit failed:", emitErr);
          }
        };
        let refusal = null;
        if (cm) {
          try {
            const result = cm.execute(
              new UpdateWallsSystemTypeBatchCommand({
                wallIds: cmd.wallIds === "all" ? "all" : [...cmd.wallIds],
                systemType: cmd.systemType
              })
            );
            const readable = !!result && Array.isArray(result.affectedElementIds);
            const report = readable ? {
              success: result.success ?? false,
              info: result.info ?? [],
              affectedElementIds: result.affectedElementIds
            } : {
              success: false,
              info: [
                `'wall.updateSystemTypeBatch' RAN but the command manager returned no readable result. WHICH walls changed is not known — this is NOT a report that none did.`
              ],
              affectedElementIds: [],
              outcome: "indeterminate"
            };
            window.dispatchEvent(
              new CustomEvent(WALL_TYPE_BATCH_REPORT_EVENT, { detail: report })
            );
            if (!report.success) {
              refusal = report.info[0] ?? "the wall type change was refused, and no reason was given";
            }
          } catch (e) {
            console.error("[wall.updateSystemTypeBatch.handler] bridge failed:", e);
            sayNothingRan(`the bridge threw: ${String(e?.message ?? e)}`);
            refusal = `the bridge threw: ${String(e?.message ?? e)}`;
          }
        } else {
          sayNothingRan("the command manager is not available in this session");
          refusal = "the command manager is not available in this session";
        }
        if (refusal !== null) {
          throw new Error(`wall.updateSystemTypeBatch: ${refusal}`);
        }
        const empty = { forward: [], inverse: [] };
        return empty;
      }
    );
  }
};

const WALL_COLOR_BATCH_REPORT_EVENT = "pryzm-wall-color-batch-report";
const HEX_COLOR_RE$3 = /^#[0-9a-fA-F]{6}$/;
const UpdateWallsColorBatchHandler = {
  type: "wall.updateColorBatch",
  affectedStores: [],
  canExecute(_ctx, cmd) {
    if (cmd.wallIds !== "all" && !Array.isArray(cmd.wallIds)) {
      return { valid: false, reason: "wallIds must be 'all' or an array of wall ids" };
    }
    if (cmd.materialColor === void 0 && cmd.materialId === void 0) {
      return { valid: false, reason: "at least one of materialColor / materialId is required" };
    }
    if (cmd.materialColor !== void 0 && !HEX_COLOR_RE$3.test(cmd.materialColor)) {
      return { valid: false, reason: "materialColor must be a '#rrggbb' hex string" };
    }
    if (cmd.materialId !== void 0 && cmd.materialId !== null && (typeof cmd.materialId !== "string" || cmd.materialId.length === 0)) {
      return { valid: false, reason: "materialId must be a non-empty string or null" };
    }
    return { valid: true };
  },
  execute(_ctx, cmd) {
    return withHandlerSpan(
      "wall.updateColorBatch.handler",
      { "pryzm.command.type": "wall.updateColorBatch" },
      () => {
        const cm = window.commandManager;
        const sayNothingRan = (why) => {
          const report = {
            success: false,
            info: [
              `'wall.updateColorBatch' did not run — ${why}. Nothing was changed, and nothing about the model is confirmed.`
            ],
            affectedElementIds: [],
            outcome: "indeterminate"
          };
          try {
            window.dispatchEvent(new CustomEvent(WALL_COLOR_BATCH_REPORT_EVENT, { detail: report }));
          } catch (emitErr) {
            console.error("[wall.updateColorBatch.handler] indeterminate report emit failed:", emitErr);
          }
        };
        let refusal = null;
        if (cm) {
          try {
            const result = cm.execute(
              new UpdateWallsColorBatchCommand({
                wallIds: cmd.wallIds === "all" ? "all" : [...cmd.wallIds],
                ...cmd.materialColor !== void 0 ? { materialColor: cmd.materialColor } : {},
                ...cmd.materialId !== void 0 ? { materialId: cmd.materialId } : {}
              })
            );
            const readable = !!result && Array.isArray(result.affectedElementIds);
            const report = readable ? {
              success: result.success ?? false,
              info: result.info ?? [],
              affectedElementIds: result.affectedElementIds
            } : {
              success: false,
              info: [
                `'wall.updateColorBatch' RAN but the command manager returned no readable result. WHICH walls changed is not known — this is NOT a report that none did.`
              ],
              affectedElementIds: [],
              outcome: "indeterminate"
            };
            window.dispatchEvent(
              new CustomEvent(WALL_COLOR_BATCH_REPORT_EVENT, { detail: report })
            );
            if (!report.success) {
              refusal = report.info[0] ?? "the wall colour change was refused, and no reason was given";
            }
          } catch (e) {
            console.error("[wall.updateColorBatch.handler] bridge failed:", e);
            sayNothingRan(`the bridge threw: ${String(e?.message ?? e)}`);
            refusal = `the bridge threw: ${String(e?.message ?? e)}`;
          }
        } else {
          sayNothingRan("the command manager is not available in this session");
          refusal = "the command manager is not available in this session";
        }
        if (refusal !== null) {
          throw new Error(`wall.updateColorBatch: ${refusal}`);
        }
        const empty = { forward: [], inverse: [] };
        return empty;
      }
    );
  }
};

class SetWallSystemTypeHandler {
  /** The catalogue is REQUIRED for this handler — unlike `wall.create`
   *  which accepts an unset catalogue (S07-T8 fixtures don't wire one),
   *  rebinding is a direct catalogue lookup and would silently corrupt
   *  the wall if the catalogue is unset. */
  constructor(systemTypeStore) {
    this.systemTypeStore = systemTypeStore;
  }
  systemTypeStore;
  type = "wall.setSystemType";
  affectedStores = ["wall"];
  canExecute(ctx, cmd) {
    if (typeof cmd.id !== "string" || cmd.id.length === 0) {
      return { valid: false, reason: "cmd.id must be a non-empty string" };
    }
    if (cmd.systemTypeId !== null) {
      if (typeof cmd.systemTypeId !== "string" || cmd.systemTypeId.length === 0) {
        return { valid: false, reason: "systemTypeId must be a non-empty string or null" };
      }
      if (!this.systemTypeStore.has(cmd.systemTypeId)) {
        return { valid: false, reason: `unknown systemTypeId: ${cmd.systemTypeId}` };
      }
    }
    if (!Object.prototype.hasOwnProperty.call(ctx.stores.wall, cmd.id)) {
      return { valid: false, reason: `wall not found: ${cmd.id}` };
    }
    return { valid: true };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      const wall = ctx.stores.wall[cmd.id];
      if (wall === void 0) throw new WallNotFoundError(cmd.id);
      if (cmd.systemTypeId !== null && !this.systemTypeStore.has(cmd.systemTypeId)) {
        throw new WallSystemTypeNotFoundError(cmd.systemTypeId);
      }
      const [next, forward, inverse] = produceCommand(ctx.stores.wall, (draft) => {
        const w = draft[cmd.id];
        if (w === void 0) return;
        if (cmd.systemTypeId === null) {
          delete w.systemTypeId;
          delete w.layers;
          return;
        }
        const type = this.systemTypeStore.get(cmd.systemTypeId);
        if (type === void 0) return;
        w.systemTypeId = type.id;
        w.layers = type.layers.map((l) => ({ ...l }));
        w.thickness = type.totalThickness;
      });
      return { forward, inverse, nextStates: { wall: next } };
    });
  }
}

const VALID_LAYER_FUNCTIONS = /* @__PURE__ */ new Set([
  "finish-exterior",
  "substrate",
  "insulation",
  "air-barrier",
  "structure",
  "finish-interior"
]);
function isLayerValid(l) {
  if (typeof l !== "object" || l === null) {
    return { valid: false, reason: "layer must be an object" };
  }
  const r = l;
  if (typeof r.name !== "string" || r.name.length === 0) {
    return { valid: false, reason: "layer.name must be a non-empty string" };
  }
  if (typeof r.function !== "string" || !VALID_LAYER_FUNCTIONS.has(r.function)) {
    return { valid: false, reason: `layer.function must be one of: ${[...VALID_LAYER_FUNCTIONS].join(", ")}` };
  }
  if (typeof r.thickness !== "number" || !Number.isFinite(r.thickness) || r.thickness <= 0) {
    return { valid: false, reason: "layer.thickness must be a finite number > 0" };
  }
  if (r.materialId !== void 0 && typeof r.materialId !== "string") {
    return { valid: false, reason: "layer.materialId must be a string when present" };
  }
  if (r.materialColor !== void 0 && typeof r.materialColor !== "string") {
    return { valid: false, reason: "layer.materialColor must be a string when present" };
  }
  return { valid: true };
}
const WALL_SET_LAYERS_UNREACHABLE = "wall.setLayers writes the detached plugin wall store, so a layer edit was written faithfully, was invisible in the viewport, and was gone after reload (§FIX-WALL-LAYER-EDIT-DETACHED-STORE). Use element.changeType (→ UpdateWallSystemTypeCommand on the geometry wallStore) to change a wall composition, or wall.addLayerBatch to add a finish layer across many walls.";
class SetWallLayersHandler {
  type = "wall.setLayers";
  affectedStores = ["wall"];
  canExecute(ctx, cmd) {
    if (typeof cmd.id !== "string" || cmd.id.length === 0) {
      return { valid: false, reason: "cmd.id must be a non-empty string" };
    }
    if (!Array.isArray(cmd.layers) || cmd.layers.length === 0) {
      return { valid: false, reason: "layers must be a non-empty array" };
    }
    for (let i = 0; i < cmd.layers.length; i += 1) {
      const r = isLayerValid(cmd.layers[i]);
      if (!r.valid) return { valid: false, reason: `layers[${i}]: ${r.reason}` };
    }
    const total = cmd.layers.reduce((s, l) => s + l.thickness, 0);
    if (total < 0.05) {
      return { valid: false, reason: `Sum of layer thicknesses (${total}) must be ≥ 0.05 m` };
    }
    if (!Object.prototype.hasOwnProperty.call(ctx.stores.wall, cmd.id)) {
      return { valid: false, reason: `wall not found: ${cmd.id}` };
    }
    return { valid: false, reason: WALL_SET_LAYERS_UNREACHABLE };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      const wall = ctx.stores.wall[cmd.id];
      if (wall === void 0) throw new WallNotFoundError(cmd.id);
      const total = cmd.layers.reduce((s, l) => s + l.thickness, 0);
      if (total < 0.05) {
        throw new WallDimensionsError(
          `wall.setLayers rejected — total thickness ${total} m < 0.05 m`
        );
      }
      const rounded = Math.round(total * 1e6) / 1e6;
      const [next, forward, inverse] = produceCommand(ctx.stores.wall, (draft) => {
        const w = draft[cmd.id];
        if (w === void 0) return;
        w.layers = cmd.layers.map((l) => ({ ...l }));
        w.thickness = rounded;
      });
      return { forward, inverse, nextStates: { wall: next } };
    });
  }
}

const HEX_COLOR_RE$2 = /^#[0-9a-fA-F]{6}$/;
const WALL_BULK_VISUALS_UNREACHABLE = "wall.bulkSetVisuals writes the detached plugin wall store, which no renderer, 2-D projector, IFC exporter or persistence path reads (§FIX-MATERIAL-DEAD-DISPATCH). Use wall.updateColorBatch for a bulk recolour, or wall.addLayerBatch / wall.updateSystemTypeBatch for bulk composition — all three reach the geometry wallStore, land as ONE undo entry, and report per-wall what they changed and skipped.";
class BulkSetWallVisualsHandler {
  type = "wall.bulkSetVisuals";
  affectedStores = ["wall"];
  canExecute(ctx, cmd) {
    if (!Array.isArray(cmd.ids) || cmd.ids.length === 0) {
      return { valid: false, reason: "ids must be a non-empty array" };
    }
    if (cmd.materialColor === void 0 && cmd.materialId === void 0 && cmd.thickness === void 0) {
      return { valid: false, reason: "at least one of materialColor / materialId / thickness is required" };
    }
    if (cmd.materialColor !== void 0 && !HEX_COLOR_RE$2.test(cmd.materialColor)) {
      return { valid: false, reason: "materialColor must be a #rrggbb hex string" };
    }
    if (cmd.materialId !== void 0 && cmd.materialId !== null && (typeof cmd.materialId !== "string" || cmd.materialId.length === 0)) {
      return { valid: false, reason: "materialId must be a non-empty string or null" };
    }
    if (cmd.thickness !== void 0 && (!Number.isFinite(cmd.thickness) || cmd.thickness < 0.05)) {
      return { valid: false, reason: "thickness must be ≥ 0.05 m" };
    }
    for (const id of cmd.ids) {
      if (typeof id !== "string" || id.length === 0) {
        return { valid: false, reason: "every id must be a non-empty string" };
      }
      if (!Object.prototype.hasOwnProperty.call(ctx.stores.wall, id)) {
        return { valid: false, reason: `wall not found: ${id}` };
      }
    }
    return { valid: false, reason: WALL_BULK_VISUALS_UNREACHABLE };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      if (cmd.thickness !== void 0 && cmd.thickness < 0.05) {
        throw new WallDimensionsError("thickness must be ≥ 0.05 m");
      }
      for (const id of cmd.ids) {
        if (!Object.prototype.hasOwnProperty.call(ctx.stores.wall, id)) {
          throw new WallNotFoundError(id);
        }
      }
      const [next, forward, inverse] = produceCommand(ctx.stores.wall, (draft) => {
        for (const id of cmd.ids) {
          const w = draft[id];
          if (w === void 0) continue;
          if (cmd.materialColor !== void 0) w.materialColor = cmd.materialColor;
          if (cmd.materialId !== void 0) {
            if (cmd.materialId === null) {
              delete w.materialId;
            } else {
              w.materialId = cmd.materialId;
            }
          }
          if (cmd.thickness !== void 0) w.thickness = cmd.thickness;
        }
      });
      return { forward, inverse, nextStates: { wall: next } };
    });
  }
}

const OCCUPANCY_EPSILON_M = 1e-3;
function canPlaceRefusalText(result) {
  if (result.valid) return void 0;
  const code = result.code ?? "OCC_UNIDENTIFIED";
  const sentence = result.reason !== void 0 && result.reason.length > 0 ? result.reason : result.code === void 0 ? "the occupancy check refused this placement without stating a reason — that omission is the defect" : DEFAULT_SENTENCE[result.code];
  const conflicts = result.conflictIds.length > 0 ? ` (conflicts: ${result.conflictIds.join(", ")})` : "";
  return `[${code}] ${sentence}${conflicts}`;
}
const DEFAULT_SENTENCE = {
  OCC_HOST_ZERO_LENGTH: "the host wall has no length, so there is no span for an opening to occupy",
  OCC_WIDTH_NOT_POSITIVE: "the requested opening width is not a positive number",
  OCC_OFFSET_NOT_FINITE: "the requested opening offset is not a finite number",
  OCC_OFFSET_BEFORE_WALL_START: "the requested opening starts before the wall does",
  OCC_SPAN_BEYOND_WALL_END: "the requested opening runs past the end of the wall",
  OCC_OVERLAPS_SIBLING: "the requested opening overlaps an opening already on this wall"
};
function planarBaselineLength(wall) {
  const [a, b] = wall.baseLine;
  return Math.hypot(a.x - b.x, a.z - b.z);
}
class WallOccupancyStore {
  /** Re-exported for callers that want to share the tolerance constant. */
  static EPSILON_M = OCCUPANCY_EPSILON_M;
  /** Can a new opening `[offsetM, offsetM + widthM]` be placed on `wall`
   *  without overlapping any existing entry in `wall.openings[]`?
   *
   *  Returns `{ valid: true }` when clear, `{ valid: false, conflictIds,
   *  reason }` when blocked.  The result is INTENTIONALLY structured
   *  (not just a boolean) so handlers can surface the conflicting opening
   *  ids in user-facing error messages without re-querying. */
  canPlace(wall, offsetM, widthM, excludeId) {
    const wallLengthM = planarBaselineLength(wall);
    if (wallLengthM <= 0) {
      return {
        valid: false,
        conflictIds: [],
        code: "OCC_HOST_ZERO_LENGTH",
        reason: "Wall has zero length — cannot place openings"
      };
    }
    if (!Number.isFinite(widthM) || widthM <= 0) {
      return {
        valid: false,
        conflictIds: [],
        code: "OCC_WIDTH_NOT_POSITIVE",
        reason: `Opening width must be > 0 (got ${widthM})`
      };
    }
    if (!Number.isFinite(offsetM)) {
      return {
        valid: false,
        conflictIds: [],
        code: "OCC_OFFSET_NOT_FINITE",
        reason: `Offset must be a finite number (got ${offsetM})`
      };
    }
    const eps = OCCUPANCY_EPSILON_M;
    if (offsetM < -eps) {
      return {
        valid: false,
        conflictIds: [],
        code: "OCC_OFFSET_BEFORE_WALL_START",
        reason: `Offset ${offsetM.toFixed(3)} m is before wall start`
      };
    }
    const newEnd = offsetM + widthM;
    if (newEnd > wallLengthM + eps) {
      return {
        valid: false,
        conflictIds: [],
        code: "OCC_SPAN_BEYOND_WALL_END",
        reason: `Opening [${offsetM.toFixed(3)} m, ${newEnd.toFixed(3)} m] extends beyond wall length ${wallLengthM.toFixed(3)} m`
      };
    }
    const conflicts = [];
    for (const existing of wall.openings ?? []) {
      if (excludeId !== void 0 && existing.id === excludeId) continue;
      const exStart = existing.offset;
      const exEnd = existing.offset + existing.width;
      const overlaps = offsetM < exEnd - eps && newEnd > exStart + eps;
      if (overlaps) conflicts.push(existing.id);
    }
    if (conflicts.length > 0) {
      return {
        valid: false,
        conflictIds: conflicts,
        code: "OCC_OVERLAPS_SIBLING",
        reason: `Opening overlaps existing opening(s): ${conflicts.join(", ")}`
      };
    }
    return { valid: true, conflictIds: [] };
  }
  /** Read all existing openings on a wall, sorted by offset.  Useful
   *  for tool UI that needs to display occupied spans (e.g. greyed-out
   *  ranges in a placement preview). */
  getOccupiedSpans(wall) {
    const out = (wall.openings ?? []).map((o) => ({
      openingId: o.id,
      type: o.type,
      offsetM: o.offset,
      endM: o.offset + o.width
    }));
    out.sort((a, b) => a.offsetM - b.offsetM);
    return out;
  }
}
const wallOccupancyStore = new WallOccupancyStore();

class WallOpeningOverlapError extends WallSystemError {
  conflictIds;
  /**
   * §REFUSAL-IDENTITY-CANPLACE (GE-09) — the occupancy verdict's identity,
   * carried OUT of the handler rather than flattened into the message. A caller
   * that wants to branch (offer "move it" for an overlap, "resize it" for a span
   * that runs past the wall end) can; a caller that only renders still gets the
   * code inside `message`, because `canPlaceRefusalText` puts it there.
   * Optional ONLY because a producer can refuse without one — and when it does,
   * that absence is reported as `OCC_UNIDENTIFIED`, never smoothed over.
   */
  code;
  constructor(message, conflictIds, code) {
    super(message, "WallOpeningOverlapError");
    this.conflictIds = conflictIds;
    this.code = code;
  }
}
function validateOpeningShape(o) {
  if (typeof o !== "object" || o === null) {
    return { valid: false, reason: "opening must be an object" };
  }
  const r = o;
  if (typeof r.id !== "string" || r.id.length === 0) {
    return { valid: false, reason: "opening.id must be a non-empty string" };
  }
  if (r.type !== "window" && r.type !== "door") {
    return { valid: false, reason: "opening.type must be 'window' or 'door'" };
  }
  if (typeof r.offset !== "number" || !Number.isFinite(r.offset) || r.offset < 0) {
    return { valid: false, reason: "opening.offset must be a finite number ≥ 0" };
  }
  if (typeof r.width !== "number" || !Number.isFinite(r.width) || r.width <= 0) {
    return { valid: false, reason: "opening.width must be a finite number > 0" };
  }
  if (typeof r.height !== "number" || !Number.isFinite(r.height) || r.height <= 0) {
    return { valid: false, reason: "opening.height must be a finite number > 0" };
  }
  if (typeof r.sillHeight !== "number" || !Number.isFinite(r.sillHeight) || r.sillHeight < 0) {
    return { valid: false, reason: "opening.sillHeight must be a finite number ≥ 0" };
  }
  if (typeof r.elementId !== "string" || r.elementId.length === 0) {
    return { valid: false, reason: "opening.elementId must be a non-empty string" };
  }
  return { valid: true, opening: r };
}
class CreateWallOpeningHandler {
  type = "wall.createOpening";
  affectedStores = ["wall"];
  canExecute(ctx, cmd) {
    if (typeof cmd.wallId !== "string" || cmd.wallId.length === 0) {
      return { valid: false, reason: "wallId must be a non-empty string" };
    }
    const shape = validateOpeningShape(cmd.opening);
    if (!shape.valid) return { valid: false, reason: shape.reason };
    const wall = ctx.stores.wall[cmd.wallId];
    if (wall === void 0) {
      return { valid: false, reason: `wall not found: ${cmd.wallId}` };
    }
    if ((wall.openings ?? []).some((o) => o.id === shape.opening.id)) {
      return { valid: false, reason: `opening id already exists on wall: ${shape.opening.id}` };
    }
    const occ = wallOccupancyStore.canPlace(
      wall,
      shape.opening.offset,
      shape.opening.width
    );
    if (!occ.valid) {
      return { valid: false, reason: canPlaceRefusalText(occ) ?? "" };
    }
    return { valid: true };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      const wall = ctx.stores.wall[cmd.wallId];
      if (wall === void 0) throw new WallNotFoundError(cmd.wallId);
      const occ = wallOccupancyStore.canPlace(wall, cmd.opening.offset, cmd.opening.width);
      if (!occ.valid) {
        throw new WallOpeningOverlapError(
          canPlaceRefusalText(occ) ?? "",
          occ.conflictIds,
          occ.code
        );
      }
      const opening = {
        ...cmd.opening
      };
      const [next, forward, inverse] = produceCommand(ctx.stores.wall, (draft) => {
        const w = draft[cmd.wallId];
        if (w === void 0) return;
        w.openings = [...w.openings ?? [], opening];
        if (!w.childrenIds.includes(opening.elementId)) {
          w.childrenIds = [...w.childrenIds, opening.elementId];
        }
      });
      return { forward, inverse, nextStates: { wall: next } };
    });
  }
}

class WallOpeningLegacyAdapterHandler {
  type = "wall.opening.create";
  affectedStores = ["wall"];
  canExecute(_ctx, cmd) {
    if (typeof cmd.wallId !== "string" || cmd.wallId.length === 0) {
      return { valid: false, reason: "wallId must be a non-empty string" };
    }
    const d = cmd.openingData;
    if (typeof d !== "object" || d === null) {
      return { valid: false, reason: "openingData must be an object" };
    }
    if (d.type !== "door" && d.type !== "window") {
      return { valid: false, reason: "openingData.type must be 'door' or 'window'" };
    }
    if (typeof d.offset !== "number" || !Number.isFinite(d.offset) || d.offset < 0) {
      return { valid: false, reason: "openingData.offset must be a finite number ≥ 0" };
    }
    if (typeof d.width !== "number" || !Number.isFinite(d.width) || d.width <= 0) {
      return { valid: false, reason: "openingData.width must be a finite number > 0" };
    }
    if (typeof d.height !== "number" || !Number.isFinite(d.height) || d.height <= 0) {
      return { valid: false, reason: "openingData.height must be a finite number > 0" };
    }
    if (typeof d.sillHeight !== "number" || !Number.isFinite(d.sillHeight) || d.sillHeight < 0) {
      return { valid: false, reason: "openingData.sillHeight must be a finite number ≥ 0" };
    }
    return { valid: true };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(
      this.type + ".handler",
      { "pryzm.command.type": this.type },
      () => {
        const d = cmd.openingData;
        const id = typeof d.id === "string" && d.id.length > 0 ? d.id : crypto.randomUUID();
        const elementId = typeof d.elementId === "string" && d.elementId.length > 0 ? d.elementId : crypto.randomUUID();
        const opening = { ...d, id, elementId };
        const [next, forward, inverse] = produceCommand(
          ctx.stores.wall,
          (draft) => {
            const w = draft[cmd.wallId];
            if (w === void 0) return;
            w.openings = [...w.openings ?? [], opening];
            if (!w.childrenIds.includes(elementId)) {
              w.childrenIds = [...w.childrenIds, elementId];
            }
          }
        );
        return { forward, inverse, nextStates: { wall: next } };
      }
    );
  }
}

function isFiniteVec3$d(v) {
  if (typeof v !== "object" || v === null) return false;
  const r = v;
  return typeof r.x === "number" && Number.isFinite(r.x) && typeof r.y === "number" && Number.isFinite(r.y) && typeof r.z === "number" && Number.isFinite(r.z);
}
class CreateWallBetweenMarksHandler {
  constructor(systemTypeStore) {
    this.systemTypeStore = systemTypeStore;
  }
  systemTypeStore;
  type = "wall.createBetweenMarks";
  affectedStores = ["wall"];
  canExecute(_ctx, cmd) {
    if (typeof cmd.levelId !== "string") {
      return { valid: false, reason: "levelId must be a string" };
    }
    if (!isFiniteVec3$d(cmd.start) || !isFiniteVec3$d(cmd.end)) {
      return { valid: false, reason: "start / end must be finite { x, y, z }" };
    }
    if (cmd.start.y !== cmd.end.y) {
      return { valid: false, reason: "start.y and end.y must match (level elevation)" };
    }
    if (Math.hypot(cmd.start.x - cmd.end.x, cmd.start.z - cmd.end.z) < 0.05) {
      return { valid: false, reason: "mark distance must be ≥ 0.05 m on the XZ plane" };
    }
    if (cmd.id !== void 0 && (typeof cmd.id !== "string" || cmd.id.length === 0)) {
      return { valid: false, reason: "id must be a non-empty string" };
    }
    if (cmd.height !== void 0 && (!Number.isFinite(cmd.height) || cmd.height <= 0)) {
      return { valid: false, reason: "height must be > 0" };
    }
    if (cmd.thickness !== void 0 && (!Number.isFinite(cmd.thickness) || cmd.thickness < 0.05)) {
      return { valid: false, reason: "thickness must be ≥ 0.05 m" };
    }
    if (cmd.systemTypeId !== void 0 && this.systemTypeStore !== void 0 && !this.systemTypeStore.has(cmd.systemTypeId)) {
      return { valid: false, reason: `unknown systemTypeId: ${cmd.systemTypeId}` };
    }
    return { valid: true };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      if (cmd.systemTypeId !== void 0 && this.systemTypeStore !== void 0 && !this.systemTypeStore.has(cmd.systemTypeId)) {
        throw new WallSystemTypeNotFoundError(cmd.systemTypeId);
      }
      if (Math.hypot(cmd.start.x - cmd.end.x, cmd.start.z - cmd.end.z) < 0.05) {
        throw new WallDimensionsError(
          "wall.createBetweenMarks rejected — mark distance < 0.05 m"
        );
      }
      const id = cmd.id ?? createId("wall");
      let wall;
      try {
        const resolved = resolveWallSystemType(this.systemTypeStore, cmd);
        wall = Wall.parse({
          id,
          levelId: cmd.levelId,
          baseLine: [cmd.start, cmd.end],
          ...cmd.height !== void 0 ? { height: cmd.height } : {},
          ...resolved.thickness !== void 0 ? { thickness: resolved.thickness } : {},
          ...cmd.baseOffset !== void 0 ? { baseOffset: cmd.baseOffset } : {},
          ...cmd.materialColor !== void 0 ? { materialColor: cmd.materialColor } : {},
          ...cmd.materialId !== void 0 ? { materialId: cmd.materialId } : {},
          ...cmd.systemTypeId !== void 0 ? { systemTypeId: cmd.systemTypeId } : {},
          ...resolved.layers !== void 0 ? { layers: resolved.layers } : {}
        });
      } catch (cause) {
        throw new WallSchemaError(
          `wall.createBetweenMarks rejected — schema validation failed for id ${id}`,
          cause
        );
      }
      const [next, forward, inverse] = produceCommand(ctx.stores.wall, (draft) => {
        draft[id] = wall;
      });
      return { forward, inverse, nextStates: { wall: next } };
    });
  }
}

const MIN_WALL_LEN$2 = 0.05;
function isFiniteVec3$c(v) {
  if (typeof v !== "object" || v === null) return false;
  const r = v;
  return typeof r.x === "number" && Number.isFinite(r.x) && typeof r.y === "number" && Number.isFinite(r.y) && typeof r.z === "number" && Number.isFinite(r.z);
}
class CreateWallsFromSlabHandler {
  constructor(systemTypeStore) {
    this.systemTypeStore = systemTypeStore;
  }
  systemTypeStore;
  type = "wall.createFromSlab";
  affectedStores = ["wall"];
  canExecute(_ctx, cmd) {
    if (typeof cmd.levelId !== "string") {
      return { valid: false, reason: "levelId must be a string" };
    }
    if (!Array.isArray(cmd.perimeter) || cmd.perimeter.length < 3) {
      return { valid: false, reason: "perimeter must be a polygon with ≥ 3 vertices" };
    }
    for (let i = 0; i < cmd.perimeter.length; i += 1) {
      if (!isFiniteVec3$c(cmd.perimeter[i])) {
        return { valid: false, reason: `perimeter[${i}] must be finite { x, y, z }` };
      }
    }
    const y0 = cmd.perimeter[0].y;
    for (let i = 1; i < cmd.perimeter.length; i += 1) {
      if (cmd.perimeter[i].y !== y0) {
        return { valid: false, reason: `perimeter[${i}].y differs from perimeter[0].y (level elevation must be uniform)` };
      }
    }
    let validEdges = 0;
    for (let i = 0; i < cmd.perimeter.length; i += 1) {
      const a = cmd.perimeter[i];
      const b = cmd.perimeter[(i + 1) % cmd.perimeter.length];
      if (Math.hypot(a.x - b.x, a.z - b.z) >= MIN_WALL_LEN$2) validEdges += 1;
    }
    if (validEdges === 0) {
      return { valid: false, reason: `no perimeter edge clears ${MIN_WALL_LEN$2} m` };
    }
    if (cmd.height !== void 0 && (!Number.isFinite(cmd.height) || cmd.height <= 0)) {
      return { valid: false, reason: "height must be > 0" };
    }
    if (cmd.thickness !== void 0 && (!Number.isFinite(cmd.thickness) || cmd.thickness < 0.05)) {
      return { valid: false, reason: "thickness must be ≥ 0.05 m" };
    }
    if (cmd.systemTypeId !== void 0 && this.systemTypeStore !== void 0 && !this.systemTypeStore.has(cmd.systemTypeId)) {
      return { valid: false, reason: `unknown systemTypeId: ${cmd.systemTypeId}` };
    }
    return { valid: true };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      if (cmd.systemTypeId !== void 0 && this.systemTypeStore !== void 0 && !this.systemTypeStore.has(cmd.systemTypeId)) {
        throw new WallSystemTypeNotFoundError(cmd.systemTypeId);
      }
      const resolved = resolveWallSystemType(this.systemTypeStore, cmd);
      const fresh = [];
      for (let i = 0; i < cmd.perimeter.length; i += 1) {
        const a = cmd.perimeter[i];
        const b = cmd.perimeter[(i + 1) % cmd.perimeter.length];
        if (Math.hypot(a.x - b.x, a.z - b.z) < MIN_WALL_LEN$2) continue;
        const id = createId("wall");
        let wall;
        try {
          wall = Wall.parse({
            id,
            levelId: cmd.levelId,
            baseLine: [a, b],
            ...cmd.height !== void 0 ? { height: cmd.height } : {},
            ...resolved.thickness !== void 0 ? { thickness: resolved.thickness } : {},
            ...cmd.baseOffset !== void 0 ? { baseOffset: cmd.baseOffset } : {},
            ...cmd.materialColor !== void 0 ? { materialColor: cmd.materialColor } : {},
            ...cmd.materialId !== void 0 ? { materialId: cmd.materialId } : {},
            ...cmd.systemTypeId !== void 0 ? { systemTypeId: cmd.systemTypeId } : {},
            ...resolved.layers !== void 0 ? { layers: resolved.layers } : {}
          });
        } catch (cause) {
          throw new WallSchemaError(
            `wall.createFromSlab rejected — schema validation failed for edge ${i}`,
            cause
          );
        }
        fresh.push(wall);
      }
      const [next, forward, inverse] = produceCommand(ctx.stores.wall, (draft) => {
        for (const w of fresh) draft[w.id] = w;
      });
      return { forward, inverse, nextStates: { wall: next } };
    });
  }
}

class ChangeWallLevelHandler {
  type = "wall.changeLevel";
  affectedStores = ["wall"];
  canExecute(ctx, cmd) {
    if (typeof cmd.id !== "string" || cmd.id.length === 0) {
      return { valid: false, reason: "cmd.id must be a non-empty string" };
    }
    if (typeof cmd.newLevelId !== "string" || cmd.newLevelId.length === 0) {
      return { valid: false, reason: "newLevelId must be a non-empty string" };
    }
    if (!Number.isFinite(cmd.newElevationY)) {
      return { valid: false, reason: "newElevationY must be a finite number" };
    }
    if (!Object.prototype.hasOwnProperty.call(ctx.stores.wall, cmd.id)) {
      return { valid: false, reason: `wall not found: ${cmd.id}` };
    }
    return { valid: true };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      const wall = ctx.stores.wall[cmd.id];
      if (wall === void 0) throw new WallNotFoundError(cmd.id);
      const [next, forward, inverse] = produceCommand(ctx.stores.wall, (draft) => {
        const w = draft[cmd.id];
        if (w === void 0) return;
        w.levelId = cmd.newLevelId;
        const [a, b] = w.baseLine;
        w.baseLine = [
          { x: a.x, y: cmd.newElevationY, z: a.z },
          { x: b.x, y: cmd.newElevationY, z: b.z }
        ];
      });
      return { forward, inverse, nextStates: { wall: next } };
    });
  }
}

const MIN_WALL_LEN$1 = 0.05;
class JoinWallHandler {
  type = "wall.join";
  affectedStores = ["wall"];
  canExecute(ctx, cmd) {
    if (typeof cmd.idA !== "string" || cmd.idA.length === 0) {
      return { valid: false, reason: "idA must be a non-empty string" };
    }
    if (typeof cmd.idB !== "string" || cmd.idB.length === 0) {
      return { valid: false, reason: "idB must be a non-empty string" };
    }
    if (cmd.idA === cmd.idB) {
      return { valid: false, reason: "cannot join a wall to itself" };
    }
    if (cmd.endpointA !== 0 && cmd.endpointA !== 1) {
      return { valid: false, reason: "endpointA must be 0 or 1" };
    }
    if (cmd.endpointB !== 0 && cmd.endpointB !== 1) {
      return { valid: false, reason: "endpointB must be 0 or 1" };
    }
    const a = ctx.stores.wall[cmd.idA];
    const b = ctx.stores.wall[cmd.idB];
    if (a === void 0) return { valid: false, reason: `wall not found: ${cmd.idA}` };
    if (b === void 0) return { valid: false, reason: `wall not found: ${cmd.idB}` };
    if (a.levelId !== b.levelId) {
      return { valid: false, reason: `walls on different levels (A=${a.levelId}, B=${b.levelId}) — change level first` };
    }
    const target = b.baseLine[cmd.endpointB];
    const fixed = a.baseLine[cmd.endpointA === 0 ? 1 : 0];
    if (Math.hypot(target.x - fixed.x, target.z - fixed.z) < MIN_WALL_LEN$1) {
      return {
        valid: false,
        reason: `join would shrink wall ${cmd.idA} below ${MIN_WALL_LEN$1} m`
      };
    }
    return { valid: true };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      const a = ctx.stores.wall[cmd.idA];
      const b = ctx.stores.wall[cmd.idB];
      if (a === void 0) throw new WallNotFoundError(cmd.idA);
      if (b === void 0) throw new WallNotFoundError(cmd.idB);
      const target = b.baseLine[cmd.endpointB];
      const fixed = a.baseLine[cmd.endpointA === 0 ? 1 : 0];
      if (Math.hypot(target.x - fixed.x, target.z - fixed.z) < MIN_WALL_LEN$1) {
        throw new WallDimensionsError(
          `wall.join rejected — would shrink ${cmd.idA} below ${MIN_WALL_LEN$1} m`
        );
      }
      const [next, forward, inverse] = produceCommand(ctx.stores.wall, (draft) => {
        const w = draft[cmd.idA];
        if (w === void 0) return;
        const moving = w.baseLine[cmd.endpointA];
        const next0 = cmd.endpointA === 0 ? { x: target.x, y: moving.y, z: target.z } : w.baseLine[0];
        const next1 = cmd.endpointA === 1 ? { x: target.x, y: moving.y, z: target.z } : w.baseLine[1];
        w.baseLine = [
          { x: next0.x, y: next0.y, z: next0.z },
          { x: next1.x, y: next1.y, z: next1.z }
        ];
      });
      return { forward, inverse, nextStates: { wall: next } };
    });
  }
}

const MIN_WALL_LEN = 0.05;
class WallCutOpeningStraddleError extends WallSystemError {
  openingIds;
  constructor(message, openingIds) {
    super(message, "WallCutOpeningStraddleError");
    this.openingIds = openingIds;
  }
}
function projectOntoBaseline(wall, p) {
  const [a, b] = wall.baseLine;
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len = Math.hypot(dx, dz);
  if (len === 0) return { t: 0, len: 0 };
  const ux = dx / len;
  const uz = dz / len;
  const vx = p.x - a.x;
  const vz = p.z - a.z;
  const t = vx * ux + vz * uz;
  return { t, len };
}
class CutWallHandler {
  type = "wall.cut";
  affectedStores = ["wall"];
  /**
   * §FEAT-WALL-SPLIT-ID (GE-10) — the verb NAMED IN REFUSALS AND SPANS.
   * `wall.split` (see `SplitWall.ts`) is a second id over THIS ONE handler, not a
   * second cut path. Without this, a user who typed "split" read a refusal about
   * "wall.cut" and a trace named `wall.cut.handler` — the same defect class the
   * refusal-identity gate exists to stop, one level up: the refusal would be
   * attributable to the wrong verb. Defaults to `wall.cut`, so the existing
   * registration and every existing message are byte-unchanged.
   */
  verb;
  constructor(verb = "wall.cut") {
    this.verb = verb;
  }
  canExecute(ctx, cmd) {
    if (typeof cmd.id !== "string" || cmd.id.length === 0) {
      return { valid: false, reason: "cmd.id must be a non-empty string" };
    }
    if (typeof cmd.at?.x !== "number" || !Number.isFinite(cmd.at.x) || typeof cmd.at?.z !== "number" || !Number.isFinite(cmd.at.z)) {
      return { valid: false, reason: "at.{x,z} must be finite numbers" };
    }
    const wall = ctx.stores.wall[cmd.id];
    if (wall === void 0) return { valid: false, reason: `wall not found: ${cmd.id}` };
    const { t, len } = projectOntoBaseline(wall, cmd.at);
    if (len < MIN_WALL_LEN * 2) {
      return { valid: false, reason: `wall ${cmd.id} too short to cut (len=${len.toFixed(4)} m)` };
    }
    if (t <= MIN_WALL_LEN || t >= len - MIN_WALL_LEN) {
      return {
        valid: false,
        reason: `cut point ${t.toFixed(4)} m outside cuttable interval (${MIN_WALL_LEN}, ${(len - MIN_WALL_LEN).toFixed(4)}) m`
      };
    }
    const straddling = [];
    for (const op of wall.openings ?? []) {
      const start = op.offset;
      const end = op.offset + op.width;
      if (start < t && end > t) straddling.push(op.id);
    }
    if (straddling.length > 0) {
      return {
        valid: false,
        reason: `opening(s) straddle the cut point: ${straddling.join(", ")}`
      };
    }
    if (cmd.leftId !== void 0 && (typeof cmd.leftId !== "string" || cmd.leftId.length === 0)) {
      return { valid: false, reason: "leftId must be a non-empty string when supplied" };
    }
    if (cmd.rightId !== void 0 && (typeof cmd.rightId !== "string" || cmd.rightId.length === 0)) {
      return { valid: false, reason: "rightId must be a non-empty string when supplied" };
    }
    return { valid: true };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(
      this.verb + ".handler",
      { "pryzm.command.type": this.verb },
      () => this.executeCore(ctx, cmd)
    );
  }
  /**
   * The cut itself, UNWRAPPED.
   *
   * §FEAT-WALL-SPLIT-ID (GE-10) + P8 (C10 §2). `SplitWallHandler` is a second verb
   * id over this one handler, and it must open its OWN span — Zone A of
   * `check-otel-spans` is zero-tolerance per handler FILE, and more importantly a
   * trace that never names `wall.split` cannot answer "what did that verb do".
   * If it delegated to `execute()` the two spans would nest and every split would
   * report twice; so the span lives in each `execute()` and the arithmetic lives
   * here, once. Public only so the sibling handler can reach it — it is not part
   * of the CommandHandler contract and nothing else should call it.
   */
  executeCore(ctx, cmd) {
    {
      const wall = ctx.stores.wall[cmd.id];
      if (wall === void 0) throw new WallNotFoundError(cmd.id);
      const { t, len } = projectOntoBaseline(wall, cmd.at);
      if (len < MIN_WALL_LEN * 2 || t <= MIN_WALL_LEN || t >= len - MIN_WALL_LEN) {
        throw new WallDimensionsError(
          `${this.verb} rejected — cut point ${t.toFixed(4)} m outside cuttable interval`
        );
      }
      const straddling = [];
      for (const op of wall.openings ?? []) {
        if (op.offset < t && op.offset + op.width > t) straddling.push(op.id);
      }
      if (straddling.length > 0) {
        throw new WallCutOpeningStraddleError(
          `${this.verb} rejected — opening(s) straddle cut point: ${straddling.join(", ")}`,
          straddling
        );
      }
      const [a, b] = wall.baseLine;
      const ux = (b.x - a.x) / len;
      const uz = (b.z - a.z) / len;
      const cutPoint = {
        x: a.x + ux * t,
        y: a.y,
        z: a.z + uz * t
      };
      const leftId = cmd.leftId ?? createId("wall");
      const rightId = cmd.rightId ?? createId("wall");
      if (leftId === rightId) {
        throw new WallDimensionsError(`${this.verb} rejected — leftId === rightId`);
      }
      if (leftId === cmd.id || rightId === cmd.id) {
        throw new WallDimensionsError(
          `${this.verb} rejected — leftId / rightId must differ from the source id`
        );
      }
      const leftOpenings = [];
      const rightOpenings = [];
      const leftChildren = [];
      const rightChildren = [];
      const sharedChildren = new Set((wall.childrenIds ?? []).map((c) => c));
      for (const op of wall.openings ?? []) {
        if (op.offset + op.width <= t) {
          leftOpenings.push(op);
          leftChildren.push(op.elementId);
        } else {
          rightOpenings.push({ ...op, offset: op.offset - t });
          rightChildren.push(op.elementId);
        }
        sharedChildren.delete(op.elementId);
      }
      for (const c of sharedChildren) leftChildren.push(c);
      const leftWall = {
        ...wall,
        id: leftId,
        baseLine: [
          { x: a.x, y: a.y, z: a.z },
          { x: cutPoint.x, y: cutPoint.y, z: cutPoint.z }
        ],
        openings: leftOpenings,
        childrenIds: leftChildren
      };
      const rightWall = {
        ...wall,
        id: rightId,
        baseLine: [
          { x: cutPoint.x, y: cutPoint.y, z: cutPoint.z },
          { x: b.x, y: b.y, z: b.z }
        ],
        openings: rightOpenings,
        childrenIds: rightChildren
      };
      const [next, forward, inverse] = produceCommand(ctx.stores.wall, (draft) => {
        delete draft[cmd.id];
        draft[leftId] = leftWall;
        draft[rightId] = rightWall;
      });
      return { forward, inverse, nextStates: { wall: next } };
    }
  }
}

class SplitWallHandler {
  type = "wall.split";
  affectedStores = ["wall"];
  /** THE cut path. Not a copy of it — the same class, told its verb. */
  inner = new CutWallHandler("wall.split");
  canExecute(ctx, cmd) {
    return this.inner.canExecute(ctx, cmd);
  }
  /**
   * P8 (C10 §2) — this verb opens its OWN span. It does NOT call
   * `inner.execute()`, which would wrap a second time and report every split
   * twice; it calls the unwrapped `executeCore`. So one span per dispatch, named
   * `wall.split.handler`, over the one shared implementation.
   */
  execute(ctx, cmd) {
    return withHandlerSpan(
      "wall.split.handler",
      { "pryzm.command.type": "wall.split" },
      () => this.inner.executeCore(ctx, cmd)
    );
  }
}

const UpdateWallSystemTypeHandler = {
  type: "wall.updateSystemType",
  affectedStores: [],
  canExecute(_ctx, cmd) {
    if (!cmd.wallId) return { valid: false, reason: "wallId is required" };
    return { valid: true };
  },
  execute(_ctx, cmd) {
    return withHandlerSpan("wall.updateSystemType.handler", { "pryzm.command.type": "wall.updateSystemType" }, () => {
      const cm = window.commandManager;
      if (cm) {
        try {
          const layerStack = Array.isArray(cmd.layers) ? cmd.layers : null;
          const propagationOn = globalThis.__pryzmWallLayerEditPropagation !== false;
          const isLayerEdit = propagationOn && layerStack !== null && layerStack.length > 0;
          if (isLayerEdit) {
            const total = typeof cmd.thickness === "number" && cmd.thickness > 0 ? cmd.thickness : layerStack.reduce(
              (s, l) => s + (Number(l?.thickness) || 0),
              0
            );
            cm.execute(new UpdateWallLayersCommand({
              wallId: cmd.wallId,
              layers: layerStack,
              thickness: total,
              systemTypeId: cmd.systemTypeId ?? null
            }));
          } else {
            cm.execute(new UpdateWallSystemTypeCommand({
              wallId: cmd.wallId,
              systemTypeId: cmd.systemTypeId ?? null,
              layers: cmd.layers ?? null,
              thickness: cmd.thickness
            }));
          }
        } catch (e) {
          console.error("[wall.updateSystemType.handler] bridge failed:", e);
        }
      }
      return { forward: [], inverse: [] };
    });
  }
};

const WALL_SIDE_FINISH_BATCH_REPORT_EVENT = "pryzm-wall-side-finish-batch-report";
const HEX_COLOR_RE$1 = /^#[0-9a-fA-F]{6}$/;
function boundingRoomCounts(wallIds) {
  const roomStore = window.roomStore;
  const rooms = roomStore?.getAll?.();
  if (!Array.isArray(rooms)) return null;
  const counts = /* @__PURE__ */ new Map();
  for (const room of rooms) {
    if (!Array.isArray(room?.boundingWallIds)) continue;
    for (const wid of room.boundingWallIds) {
      counts.set(wid, (counts.get(wid) ?? 0) + 1);
    }
  }
  const out = /* @__PURE__ */ new Map();
  for (const id of wallIds) out.set(id, counts.get(id) ?? 0);
  return out;
}
const SetWallSideFinishBatchHandler = {
  type: "wall.setSideFinishBatch",
  affectedStores: [],
  canExecute(_ctx, cmd) {
    if (cmd.wallIds !== "all" && !Array.isArray(cmd.wallIds)) {
      return { valid: false, reason: "wallIds must be 'all' or an array of wall ids" };
    }
    if (cmd.side !== "interior" && cmd.side !== "exterior" && cmd.side !== "both") {
      return { valid: false, reason: "side must be 'interior', 'exterior', or 'both'" };
    }
    if (!cmd.finish || typeof cmd.finish.materialId !== "string" || cmd.finish.materialId.length === 0) {
      return { valid: false, reason: "finish.materialId is required" };
    }
    if (cmd.finish.materialColor !== void 0 && !HEX_COLOR_RE$1.test(cmd.finish.materialColor)) {
      return { valid: false, reason: "finish.materialColor must be a '#rrggbb' hex string" };
    }
    return { valid: true };
  },
  execute(_ctx, cmd) {
    return withHandlerSpan(
      "wall.setSideFinishBatch.handler",
      { "pryzm.command.type": "wall.setSideFinishBatch" },
      () => {
        const cm = window.commandManager;
        const sayNothingRan = (why) => {
          const report = {
            success: false,
            info: [
              `'wall.setSideFinishBatch' did not run — ${why}. Nothing was changed, and nothing about the model is confirmed.`
            ],
            affectedElementIds: [],
            outcome: "indeterminate"
          };
          try {
            window.dispatchEvent(
              new CustomEvent(WALL_SIDE_FINISH_BATCH_REPORT_EVENT, { detail: report })
            );
          } catch (emitErr) {
            console.error("[wall.setSideFinishBatch.handler] indeterminate report emit failed:", emitErr);
          }
        };
        if (!cm) {
          sayNothingRan("the command manager is not available in this session");
          throw new Error(
            "wall.setSideFinishBatch: the command manager is not available in this session"
          );
        }
        let refusal = null;
        try {
          let roomCounts;
          if (cmd.roomScoped === true) {
            const ids = cmd.wallIds === "all" ? [] : [...cmd.wallIds];
            const built = boundingRoomCounts(ids);
            roomCounts = built ?? new Map(ids.map((id) => [id, null]));
          }
          const result = cm.execute(
            new SetWallSideFinishBatchCommand({
              wallIds: cmd.wallIds === "all" ? "all" : [...cmd.wallIds],
              side: cmd.side,
              finish: {
                materialId: cmd.finish.materialId,
                ...cmd.finish.materialColor !== void 0 ? { materialColor: cmd.finish.materialColor } : {},
                ...cmd.finish.materialName !== void 0 ? { materialName: cmd.finish.materialName } : {}
              },
              ...roomCounts !== void 0 ? { roomBoundCounts: roomCounts } : {}
            })
          );
          const readable = !!result && Array.isArray(result.affectedElementIds);
          const report = readable ? {
            success: result.success ?? false,
            info: result.info ?? [],
            affectedElementIds: result.affectedElementIds
          } : {
            success: false,
            info: [
              `'wall.setSideFinishBatch' RAN but the command manager returned no readable result. WHICH walls changed is not known — this is NOT a report that none did.`
            ],
            affectedElementIds: [],
            outcome: "indeterminate"
          };
          window.dispatchEvent(
            new CustomEvent(WALL_SIDE_FINISH_BATCH_REPORT_EVENT, { detail: report })
          );
          if (!report.success) {
            refusal = report.info[0] ?? "the wall finish change was refused, and no reason was given";
          }
        } catch (e) {
          console.error("[wall.setSideFinishBatch.handler] bridge failed:", e);
          sayNothingRan(`the bridge threw: ${String(e?.message ?? e)}`);
          refusal = `the bridge threw: ${String(e?.message ?? e)}`;
        }
        if (refusal !== null) {
          throw new Error(`wall.setSideFinishBatch: ${refusal}`);
        }
        const empty = { forward: [], inverse: [] };
        return empty;
      }
    );
  }
};

const WALL_RAKE_BATCH_REPORT_EVENT = "pryzm-wall-rake-batch-report";
const UpdateWallsRakeBatchHandler = {
  type: "wall.updateRakeBatch",
  affectedStores: [],
  canExecute(_ctx, cmd) {
    if (cmd.wallIds !== "all" && !Array.isArray(cmd.wallIds)) {
      return { valid: false, reason: "wallIds must be 'all' or an array of wall ids" };
    }
    if (typeof cmd.rakeAngleDeg !== "number" || !Number.isFinite(cmd.rakeAngleDeg)) {
      return { valid: false, reason: "rakeAngleDeg must be a finite number of degrees" };
    }
    return { valid: true };
  },
  execute(_ctx, cmd) {
    return withHandlerSpan(
      "wall.updateRakeBatch.handler",
      { "pryzm.command.type": "wall.updateRakeBatch" },
      () => {
        const cm = window.commandManager;
        const sayNothingRan = (why) => {
          const report = {
            success: false,
            info: [
              `'wall.updateRakeBatch' did not run — ${why}. Nothing was changed, and nothing about the model is confirmed.`
            ],
            affectedElementIds: [],
            outcome: "indeterminate"
          };
          try {
            window.dispatchEvent(new CustomEvent(WALL_RAKE_BATCH_REPORT_EVENT, { detail: report }));
          } catch (emitErr) {
            console.error("[wall.updateRakeBatch.handler] indeterminate report emit failed:", emitErr);
          }
        };
        let refusal = null;
        if (cm) {
          try {
            const result = cm.execute(
              new UpdateWallsRakeBatchCommand({
                wallIds: cmd.wallIds === "all" ? "all" : [...cmd.wallIds],
                rakeAngleDeg: cmd.rakeAngleDeg
              })
            );
            const readable = !!result && Array.isArray(result.affectedElementIds);
            const report = readable ? {
              success: result.success ?? false,
              info: result.info ?? [],
              affectedElementIds: result.affectedElementIds
            } : {
              success: false,
              info: [
                `'wall.updateRakeBatch' RAN but the command manager returned no readable result. WHICH walls changed is not known — this is NOT a report that none did.`
              ],
              affectedElementIds: [],
              outcome: "indeterminate"
            };
            window.dispatchEvent(
              new CustomEvent(WALL_RAKE_BATCH_REPORT_EVENT, { detail: report })
            );
            if (!report.success) {
              refusal = report.info[0] ?? "the wall rake change was refused, and no reason was given";
            }
          } catch (e) {
            console.error("[wall.updateRakeBatch.handler] bridge failed:", e);
            sayNothingRan(`the bridge threw: ${String(e?.message ?? e)}`);
            refusal = `the bridge threw: ${String(e?.message ?? e)}`;
          }
        } else {
          sayNothingRan("the command manager is not available in this session");
          refusal = "the command manager is not available in this session";
        }
        if (refusal !== null) {
          throw new Error(`wall.updateRakeBatch: ${refusal}`);
        }
        const empty = { forward: [], inverse: [] };
        return empty;
      }
    );
  }
};

const WALL_HEIGHT_BATCH_REPORT_EVENT = "pryzm-wall-height-batch-report";
const UpdateWallsHeightBatchHandler = {
  type: "wall.updateHeightBatch",
  // Bridges to the legacy command manager — mutates NO plugin store. See header.
  affectedStores: [],
  canExecute(_ctx, cmd) {
    if (cmd?.wallIds !== "all" && !Array.isArray(cmd?.wallIds)) {
      return { valid: false, reason: "wallIds must be 'all' or an array of wall ids" };
    }
    if (typeof cmd.height !== "number" || !Number.isFinite(cmd.height)) {
      return { valid: false, reason: "height must be a finite number of metres" };
    }
    if (cmd.height < WALL_HEIGHT_CONSTRAINTS.MIN_HEIGHT) {
      return {
        valid: false,
        reason: `A wall cannot be shorter than ${WALL_HEIGHT_CONSTRAINTS.MIN_HEIGHT} m; ${cmd.height} m was requested.`
      };
    }
    if (cmd.height > WALL_HEIGHT_CONSTRAINTS.MAX_HEIGHT) {
      return {
        valid: false,
        reason: `A wall cannot be taller than ${WALL_HEIGHT_CONSTRAINTS.MAX_HEIGHT} m; ${cmd.height} m was requested.`
      };
    }
    return { valid: true };
  },
  execute(_ctx, cmd) {
    return withHandlerSpan(
      "wall.updateHeightBatch.handler",
      { "pryzm.command.type": "wall.updateHeightBatch" },
      () => {
        const w = globalThis.window ?? {};
        const empty = { forward: [], inverse: [] };
        const sayNothingRan = (why) => {
          const report = {
            success: false,
            info: [
              `'wall.updateHeightBatch' did not run — ${why}. Nothing was changed, and nothing about the model is confirmed.`
            ],
            affectedElementIds: [],
            outcome: "indeterminate"
          };
          try {
            window.dispatchEvent(new CustomEvent(WALL_HEIGHT_BATCH_REPORT_EVENT, { detail: report }));
          } catch (emitErr) {
            console.error("[wall.updateHeightBatch.handler] indeterminate report emit failed:", emitErr);
          }
        };
        const cm = w.commandManager;
        if (!cm) {
          sayNothingRan("the command manager is not available in this session");
          throw new Error(
            "wall.updateHeightBatch: the command manager is not available in this session"
          );
        }
        let resolved;
        const missing = [];
        const store = w.wallStore;
        if (cmd.wallIds === "all") {
          if (!store) {
            sayNothingRan('the wall store is not available, so "all walls" could not be resolved');
            throw new Error(
              'wall.updateHeightBatch: the wall store is not available, so "all walls" could not be resolved'
            );
          }
          resolved = store.getAll().map((x) => x.id);
        } else {
          const requested = [...new Set(cmd.wallIds)];
          if (store?.getById) {
            resolved = [];
            for (const id of requested) {
              if (store.getById(id)) resolved.push(id);
              else missing.push(id);
            }
          } else {
            resolved = requested;
          }
        }
        if (resolved.length === 0) {
          const report = {
            success: false,
            info: [
              cmd.wallIds === "all" ? "There are no walls in this project to raise." : `None of the ${missing.length} requested wall${missing.length === 1 ? "" : "s"} exist any more.`
            ],
            affectedElementIds: [],
            outcome: "refused"
          };
          try {
            window.dispatchEvent(new CustomEvent(WALL_HEIGHT_BATCH_REPORT_EVENT, { detail: report }));
          } catch {
          }
          throw new Error(`wall.updateHeightBatch: ${report.info[0]}`);
        }
        let refusal = null;
        try {
          const result = cm.execute(
            new UpdateWallHeightCommand({ wallIds: resolved, newHeight: cmd.height })
          );
          const changed = result?.affectedElementIds?.length ?? 0;
          const total = resolved.length + missing.length;
          const info = [
            `Raised ${changed} of ${total} wall${total === 1 ? "" : "s"} to ${cmd.height} m` + (missing.length > 0 ? ` — ${missing.length} skipped` : "")
          ];
          if (missing.length > 0) {
            info.push(`${missing.length}× wall not found`);
          }
          if (result?.error) info.push(result.error);
          const readableIds = result && Array.isArray(result.affectedElementIds) ? result.affectedElementIds : void 0;
          const report = result && readableIds ? {
            success: result.success ?? false,
            info: result.success ? info : result.info ?? info,
            affectedElementIds: readableIds,
            outcome: result.success ? "applied" : "refused"
          } : {
            success: false,
            info: [
              `'wall.updateHeightBatch' RAN but the command manager returned no readable result. WHICH walls changed is not known — this is NOT a report that none did, and it is NOT a refusal.`
            ],
            affectedElementIds: [],
            outcome: "indeterminate"
          };
          window.dispatchEvent(new CustomEvent(WALL_HEIGHT_BATCH_REPORT_EVENT, { detail: report }));
          if (!report.success) {
            refusal = report.info[0] ?? "the wall height change was refused, and no reason was given";
          }
        } catch (e) {
          console.error("[wall.updateHeightBatch.handler] bridge failed:", e);
          sayNothingRan(`the bridge threw: ${String(e?.message ?? e)}`);
          refusal = `the bridge threw: ${String(e?.message ?? e)}`;
        }
        if (refusal !== null) {
          throw new Error(`wall.updateHeightBatch: ${refusal}`);
        }
        return empty;
      }
    );
  }
};

const WALL_LAYER_BATCH_REPORT_EVENT = "pryzm-wall-layer-batch-report";
const AddWallLayerBatchHandler = {
  type: "wall.addLayerBatch",
  affectedStores: [],
  canExecute(_ctx, cmd) {
    if (cmd.wallIds !== "all" && !Array.isArray(cmd.wallIds)) {
      return { valid: false, reason: "wallIds must be 'all' or an array of wall ids" };
    }
    if (cmd.side !== "interior" && cmd.side !== "exterior") {
      return { valid: false, reason: "side must be 'interior' or 'exterior'" };
    }
    if (typeof cmd.thickness !== "number" || !Number.isFinite(cmd.thickness)) {
      return { valid: false, reason: "thickness (metres) is required" };
    }
    return { valid: true };
  },
  execute(_ctx, cmd) {
    return withHandlerSpan(
      "wall.addLayerBatch.handler",
      { "pryzm.command.type": "wall.addLayerBatch" },
      () => {
        const cm = window.commandManager;
        const sayNothingRan = (why) => {
          const report = {
            success: false,
            info: [
              `'wall.addLayerBatch' did not run — ${why}. Nothing was changed, and nothing about the model is confirmed.`
            ],
            affectedElementIds: [],
            outcome: "indeterminate"
          };
          try {
            window.dispatchEvent(new CustomEvent(WALL_LAYER_BATCH_REPORT_EVENT, { detail: report }));
          } catch (emitErr) {
            console.error("[wall.addLayerBatch.handler] indeterminate report emit failed:", emitErr);
          }
        };
        let refusal = null;
        if (cm) {
          try {
            const result = cm.execute(
              new AddWallLayerBatchCommand({
                wallIds: cmd.wallIds === "all" ? "all" : [...cmd.wallIds],
                side: cmd.side,
                thickness: cmd.thickness,
                name: cmd.name,
                materialColor: cmd.materialColor,
                ...cmd.materialId !== void 0 ? { materialId: cmd.materialId } : {},
                ...cmd.layerFunction !== void 0 ? { layerFunction: cmd.layerFunction } : {}
              })
            );
            const readable = !!result && Array.isArray(result.affectedElementIds);
            const report = readable ? {
              success: result.success ?? false,
              info: result.info ?? [],
              affectedElementIds: result.affectedElementIds
            } : {
              success: false,
              info: [
                `'wall.addLayerBatch' RAN but the command manager returned no readable result. WHICH walls changed is not known — this is NOT a report that none did.`
              ],
              affectedElementIds: [],
              outcome: "indeterminate"
            };
            window.dispatchEvent(
              new CustomEvent(WALL_LAYER_BATCH_REPORT_EVENT, { detail: report })
            );
            if (!report.success) {
              refusal = report.info[0] ?? "the wall layer addition was refused, and no reason was given";
            }
          } catch (e) {
            console.error("[wall.addLayerBatch.handler] bridge failed:", e);
            sayNothingRan(`the bridge threw: ${String(e?.message ?? e)}`);
            refusal = `the bridge threw: ${String(e?.message ?? e)}`;
          }
        } else {
          sayNothingRan("the command manager is not available in this session");
          refusal = "the command manager is not available in this session";
        }
        if (refusal !== null) {
          throw new Error(`wall.addLayerBatch: ${refusal}`);
        }
        const empty = { forward: [], inverse: [] };
        return empty;
      }
    );
  }
};

const _clonePt = (p) => ({ x: p.x, y: p.y, z: p.z });
function _baselinePatchPair(cmd) {
  const nb = cmd.newBaseLine;
  const pb = cmd.prevBaseLine;
  if (!Array.isArray(nb) || nb.length !== 2 || !nb[0] || !nb[1]) return null;
  if (!Array.isArray(pb) || pb.length !== 2 || !pb[0] || !pb[1]) return null;
  return {
    forward: [{ op: "replace", path: [cmd.wallId, "baseLine"], value: [_clonePt(nb[0]), _clonePt(nb[1])] }],
    inverse: [{ op: "replace", path: [cmd.wallId, "baseLine"], value: [_clonePt(pb[0]), _clonePt(pb[1])] }]
  };
}
const UpdateWallBaselineHandler = {
  type: "wall.updateBaseline",
  // §FIX-WALL-MOVE-UNDO-CAPTURE (L-49) — declare the `wall` store so the
  // forward/inverse baseLine PatchPair this handler emits is routed onto the
  // ring buffer (CommandBus §U-B6 routes patches by affectedStores). Previously
  // this was `[]` with empty patches, so the CommandBus classified every 3D wall
  // move as an EMPTY-PATCH record and SKIPPED the ring buffer — the move landed
  // ONLY in the legacy commandManager (via the bridge below). Because the unified
  // performUndo() is ring-buffer-FIRST, any covered `wall` entry already on the
  // ring (the wall's own create, a generated batch, …) was undone instead, and
  // the commandManager-only move — stranded on the independent cm cursor — was
  // never reached ("wall stays moved", log: `ring-buffer applied — stores: wall`).
  affectedStores: ["wall"],
  canExecute(_ctx, cmd) {
    if (!cmd.wallId) return { valid: false, reason: "wallId is required" };
    return { valid: true };
  },
  execute(_ctx, cmd) {
    return withHandlerSpan("wall.updateBaseline.handler", { "pryzm.command.type": "wall.updateBaseline" }, () => {
      const patches = cmd._recordUndo ? _baselinePatchPair(cmd) : null;
      const result = patches ?? { forward: [], inverse: [] };
      if (cmd._skipBridge) {
        return result;
      }
      const cm = window.commandManager;
      if (cm) {
        try {
          cm.execute(new UpdateWallBaselineCommand({
            wallId: cmd.wallId,
            newBaseLine: cmd.newBaseLine,
            prevBaseLine: cmd.prevBaseLine
          }));
        } catch (e) {
          console.error("[wall.updateBaseline.handler] bridge failed:", e);
        }
      }
      return result;
    });
  }
};

const CascadeWallBaselineHandler = {
  type: "wall.cascadeBaseline",
  affectedStores: [],
  canExecute(_ctx, cmd) {
    if (!cmd.entries?.length) return { valid: false, reason: "entries must be non-empty" };
    return { valid: true };
  },
  execute(_ctx, cmd) {
    return withHandlerSpan("wall.cascadeBaseline.handler", { "pryzm.command.type": "wall.cascadeBaseline" }, () => {
      if (cmd._skipBridge) {
        return { forward: [], inverse: [] };
      }
      const cm = window.commandManager;
      if (cm) {
        try {
          cm.execute(new CascadeWallBaselineCommand({
            entries: cmd.entries,
            cause: cmd.cause
          }));
        } catch (e) {
          console.error("[wall.cascadeBaseline.handler] bridge failed:", e);
        }
      }
      return { forward: [], inverse: [] };
    });
  }
};

class CreateWallsOnAllSlabsHandler {
  type = "wall.create-on-all-slabs";
  affectedStores = [];
  canExecute(_ctx, _cmd) {
    return { valid: true };
  }
  execute(_ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      const cm = window.commandManager;
      if (cm) {
        try {
          cm.execute(
            new CreateWallsOnAllSlabsCommand({
              wallHeight: cmd.wallHeight,
              wallThickness: cmd.wallThickness
            })
          );
        } catch (e) {
          console.error("[wall.create-on-all-slabs.handler] bridge failed:", e);
        }
      }
      return { forward: [], inverse: [] };
    });
  }
}

function buildWallHandlerSet(deps = {}) {
  const set = [
    new CreateWallHandler(deps.systemTypeStore),
    new DeleteWallHandler(),
    new MoveWallHandler(),
    new SetWallDimensionsHandler(),
    new SetWallColorHandler(),
    new TransformWallHandler(),
    new SetWallLayersHandler(),
    new BulkSetWallVisualsHandler(),
    new CreateWallOpeningHandler(),
    new WallOpeningLegacyAdapterHandler(),
    new CreateWallBetweenMarksHandler(deps.systemTypeStore),
    new CreateWallsFromSlabHandler(deps.systemTypeStore),
    new CreateWallBatchHandler(deps.systemTypeStore),
    new ChangeWallLevelHandler(),
    new JoinWallHandler(),
    new CutWallHandler(),
    new SplitWallHandler()
  ];
  if (deps.systemTypeStore !== void 0) {
    set.push(
      new SetWallSystemTypeHandler(deps.systemTypeStore)
    );
  }
  set.push(
    UpdateWallSystemTypeHandler,
    UpdateWallsSystemTypeBatchHandler,
    UpdateWallsColorBatchHandler,
    SetWallSideFinishBatchHandler,
    UpdateWallsRakeBatchHandler,
    UpdateWallsHeightBatchHandler,
    AddWallLayerBatchHandler,
    // §FIX-DIMS-REACH-RECORD — UpdateWallDimensionsHandler retired (see
    // WALL_HANDLER_TYPES note); the initBusHandlers bridge owns the verb.
    UpdateWallBaselineHandler,
    CascadeWallBaselineHandler,
    new CreateWallsOnAllSlabsHandler()
  );
  return set;
}

const wallToolbarContribution = {
  kind: "toolbar.discipline",
  id: "wall.tool",
  discipline: "architecture",
  label: "Wall",
  // Resolved against `PryzmIcons` in `CreateRailPanel`; the legacy
  // hard-coded entry uses `PryzmIcons.wall` and we keep the same key.
  icon: "wall",
  shortcut: "Alt+W",
  activate: (runtime) => {
    runtime.tools.activate("wall", "POLYLINE_ORTHO");
  }
};

class SlabStore extends Store {
  constructor() {
    super("slab");
  }
  /** Convenience read — every slab id currently in the store. */
  ids() {
    return [...this.state.keys()];
  }
  /** Convenience read — every slab on a given level.  O(N). */
  byLevel(levelId) {
    const out = [];
    for (const s of this.state.values()) {
      if (s.levelId === levelId) out.push(s);
    }
    return out;
  }
  /** Lookup by id; returns `undefined` when missing. */
  get(id) {
    return this.state.get(id);
  }
}

class SlabSystemError extends Error {
  constructor(message) {
    super(message);
    this.name = "SlabSystemError";
  }
}
class SlabNotFoundError extends SlabSystemError {
  constructor(slabId) {
    super(`Slab not found: ${slabId}`);
    this.slabId = slabId;
    this.name = "SlabNotFoundError";
  }
  slabId;
}
class SlabSchemaError extends SlabSystemError {
  constructor(cause) {
    super(`Slab schema validation failed: ${String(cause?.message ?? cause)}`);
    this.cause = cause;
    this.name = "SlabSchemaError";
  }
  cause;
}
class SlabBoundaryError extends SlabSystemError {
  constructor(reason) {
    super(`Invalid slab boundary: ${reason}`);
    this.reason = reason;
    this.name = "SlabBoundaryError";
  }
  reason;
}
class SlabHoleNotFoundError extends SlabSystemError {
  constructor(slabId, holeIndex) {
    super(`Slab ${slabId} has no hole at index ${holeIndex}`);
    this.slabId = slabId;
    this.holeIndex = holeIndex;
    this.name = "SlabHoleNotFoundError";
  }
  slabId;
  holeIndex;
}
class SlabThicknessError extends SlabSystemError {
  constructor(thickness) {
    super(`Slab thickness must be > 0; got ${thickness}`);
    this.thickness = thickness;
    this.name = "SlabThicknessError";
  }
  thickness;
}

function signedAreaXZ(loop) {
  let sum = 0;
  for (let i = 0, n = loop.length; i < n; i++) {
    const a = loop[i];
    const b = loop[(i + 1) % n];
    sum += a.x * b.z - b.x * a.z;
  }
  return sum / 2;
}
function validateSlabBoundary(loop) {
  if (loop.length < 3) {
    return { ok: false, reason: "boundary must have ≥3 vertices" };
  }
  const first = loop[0];
  const last = loop[loop.length - 1];
  if (first.x === last.x && first.y === last.y && first.z === last.z) {
    return { ok: false, reason: "boundary must be open (do not duplicate the closing vertex)" };
  }
  const a = signedAreaXZ(loop);
  if (Math.abs(a) < 1e-9) {
    return { ok: false, reason: "boundary has zero area" };
  }
  return { ok: true, area: a };
}

const SLAB_CREATE_UNREACHABLE = "slab.create: this process registers an authoritative SlabStore (ADR-0318 §ADR-0318-ELEMENTS-SLOT, the instance ProjectSerializer reads) but its engine half is NOT attached, so the create cannot land: SlabStore.add() resolves the level through activeLevelId, which refuses rather than invent one (ADR-0318 I-3, SlabStoreEngineNotAttachedError). This handler will not report success for a write that reaches only the detached plugin DTO store. slab.create completes in a runtime that ALSO composes the engine half: apps/editor/src/engine/initBuilders.ts calls slabStore.attachEngine(projectContext), and initTools.ts's runtime.events.on('slab.created') bridge performs the authoritative slabStore.add.";
function authoritativeSlabStoreRefusal() {
  const s = storeRegistry.getStoreForType("slab");
  if (!s) return null;
  if (typeof s.isEngineAttached !== "function") return null;
  if (s.isEngineAttached()) return null;
  return SLAB_CREATE_UNREACHABLE;
}
class CreateSlabHandler {
  type = "slab.create";
  affectedStores = ["slab"];
  canExecute(_ctx, cmd) {
    const rawPoly = cmd.polygon;
    const resolvedBoundaryForValidation = cmd.boundary ?? (rawPoly ? rawPoly.map((p) => ({ x: p.x, y: p.y, z: p.z ?? 0 })) : void 0);
    if (resolvedBoundaryForValidation !== void 0) {
      const v = validateSlabBoundary(resolvedBoundaryForValidation);
      if (!v.ok) return { valid: false, reason: v.reason ?? "invalid boundary" };
    }
    if (cmd.thickness !== void 0 && (!Number.isFinite(cmd.thickness) || cmd.thickness <= 0)) {
      return { valid: false, reason: "thickness must be > 0" };
    }
    if (cmd.baseOffset !== void 0 && !Number.isFinite(cmd.baseOffset)) {
      return { valid: false, reason: "baseOffset must be a finite number" };
    }
    if (cmd.holes !== void 0) {
      for (let i = 0; i < cmd.holes.length; i++) {
        const v = validateSlabBoundary(cmd.holes[i]);
        if (!v.ok) return { valid: false, reason: `hole[${i}]: ${v.reason ?? "invalid hole"}` };
      }
    }
    const unreachable = authoritativeSlabStoreRefusal();
    if (unreachable !== null) return { valid: false, reason: unreachable };
    return { valid: true };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      const id = cmd.id ?? createId("slab");
      const rawPolygon = cmd.polygon;
      const resolvedBoundary = cmd.boundary ?? (rawPolygon ? rawPolygon.map((p) => ({ x: p.x, y: p.y, z: p.z ?? 0 })) : void 0);
      const seed = {
        id,
        levelId: cmd.levelId ?? "",
        thickness: cmd.thickness ?? 0.2,
        baseOffset: cmd.baseOffset ?? 0,
        holes: cmd.holes ?? [],
        materialId: cmd.materialId,
        materialColor: cmd.materialColor,
        systemTypeId: cmd.systemTypeId
      };
      if (resolvedBoundary) seed.boundary = resolvedBoundary;
      if (seed.thickness !== void 0 && seed.thickness <= 0) {
        throw new SlabThicknessError(seed.thickness);
      }
      if (resolvedBoundary) {
        const v = validateSlabBoundary(resolvedBoundary);
        if (!v.ok) throw new SlabBoundaryError(v.reason ?? "invalid");
      }
      let slab;
      try {
        slab = Slab.parse(seed);
      } catch (err) {
        throw new SlabSchemaError(err);
      }
      const [next, forward, inverse] = produceCommand(ctx.stores.slab, (draft) => {
        draft[slab.id] = slab;
      });
      return { forward, inverse, nextStates: { slab: next } };
    });
  }
}

class DeleteSlabHandler {
  type = "slab.delete";
  affectedStores = ["slab"];
  canExecute(ctx, cmd) {
    if (typeof cmd.slabId !== "string" || cmd.slabId.length === 0) {
      return { valid: false, reason: "slabId must be a non-empty string" };
    }
    if (!ctx.stores.slab[cmd.slabId]) {
      return { valid: false, reason: `slab not found: ${cmd.slabId}` };
    }
    return { valid: true };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      if (!ctx.stores.slab[cmd.slabId]) throw new SlabNotFoundError(cmd.slabId);
      const [next, forward, inverse] = produceCommand(ctx.stores.slab, (draft) => {
        delete draft[cmd.slabId];
      });
      return { forward, inverse, nextStates: { slab: next } };
    });
  }
}

const SLAB_MOVE_UNREACHABLE = "slab.move writes the detached plugin slab store that nothing renders, exports or persists, and no production surface dispatches it. Moving a slab commits through slab.movePolygon (payload keys: slabId, polygon) → UpdateSlabPolygonCommand → the geometry slabStore — the DISTINCT verb minted by §FIX-MOVE-SLAB-AND-HANDRAIL (G7) precisely because slab.move and slab.update were claimed by this detached store. Translate the boundary yourself and dispatch slab.movePolygon.";
class MoveSlabHandler {
  type = "slab.move";
  affectedStores = ["slab"];
  /** Payload validation ONLY — kept public so a delegating facade can reuse it. */
  validatePayload(ctx, cmd) {
    if (typeof cmd.slabId !== "string" || cmd.slabId.length === 0) {
      return { valid: false, reason: "slabId must be a non-empty string" };
    }
    if (!cmd.delta || !Number.isFinite(cmd.delta.x) || !Number.isFinite(cmd.delta.y) || !Number.isFinite(cmd.delta.z)) {
      return { valid: false, reason: "delta must have finite x, y, z" };
    }
    if (!ctx.stores.slab[cmd.slabId]) {
      return { valid: false, reason: `slab not found: ${cmd.slabId}` };
    }
    return { valid: true };
  }
  /**
   * §FIX-DEAD-MOVE-VERB-REFUSE (W3-4) — ORDER IS LOAD-BEARING. `canExecute` must be the
   * LAST method before `execute`. `tools/ga-gate/check-verb-register.ts` classifies a
   * verb as REFUSES by slicing the source from `canExecute` to the next `execute(` and
   * checking that the slice can never yield an ACCEPTING validation result. With
   * `validatePayload` sitting between them, its accepting branch lands inside that slice
   * and the verb is mis-reported as UNKNOWN — a refusal hiding from the register that
   * exists to find it. (For the same reason this comment must not spell the accepting
   * literal out: the detector is a regex over source text, and prose is source text.)
   * Do not reorder these two methods.
   */
  canExecute(ctx, cmd) {
    const v = this.validatePayload(ctx, cmd);
    if (!v.valid) return v;
    return { valid: false, reason: SLAB_MOVE_UNREACHABLE };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      if (!ctx.stores.slab[cmd.slabId]) throw new SlabNotFoundError(cmd.slabId);
      const dx = cmd.delta.x, dy = cmd.delta.y, dz = cmd.delta.z;
      const [next, forward, inverse] = produceCommand(ctx.stores.slab, (draft) => {
        const s = draft[cmd.slabId];
        if (!s) return;
        for (const p of s.boundary) {
          p.x += dx;
          p.y += dy;
          p.z += dz;
        }
        for (const hole of s.holes) {
          for (const p of hole) {
            p.x += dx;
            p.y += dy;
            p.z += dz;
          }
        }
      });
      return { forward, inverse, nextStates: { slab: next } };
    });
  }
}

class SetSlabTypeHandler {
  type = "slab.setType";
  affectedStores = ["slab"];
  canExecute(ctx, cmd) {
    if (typeof cmd.slabId !== "string" || cmd.slabId.length === 0) {
      return { valid: false, reason: "slabId must be a non-empty string" };
    }
    if (typeof cmd.systemTypeId !== "string" || cmd.systemTypeId.length === 0) {
      return { valid: false, reason: "systemTypeId must be a non-empty string" };
    }
    if (!ctx.stores.slab[cmd.slabId]) {
      return { valid: false, reason: `slab not found: ${cmd.slabId}` };
    }
    return { valid: true };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      if (!ctx.stores.slab[cmd.slabId]) throw new SlabNotFoundError(cmd.slabId);
      const [next, forward, inverse] = produceCommand(ctx.stores.slab, (draft) => {
        const s = draft[cmd.slabId];
        if (!s) return;
        s.systemTypeId = cmd.systemTypeId;
        if (cmd.materialId !== void 0) s.materialId = cmd.materialId;
        if (cmd.materialColor !== void 0) s.materialColor = cmd.materialColor;
      });
      return { forward, inverse, nextStates: { slab: next } };
    });
  }
}

class AddSlabHoleHandler {
  type = "slab.addHole";
  affectedStores = ["slab"];
  canExecute(ctx, cmd) {
    if (typeof cmd.slabId !== "string" || cmd.slabId.length === 0) {
      return { valid: false, reason: "slabId must be a non-empty string" };
    }
    if (!ctx.stores.slab[cmd.slabId]) {
      return { valid: false, reason: `slab not found: ${cmd.slabId}` };
    }
    const v = validateSlabBoundary(cmd.hole);
    if (!v.ok) return { valid: false, reason: v.reason ?? "invalid hole" };
    return { valid: true };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      if (!ctx.stores.slab[cmd.slabId]) throw new SlabNotFoundError(cmd.slabId);
      const v = validateSlabBoundary(cmd.hole);
      if (!v.ok) throw new SlabBoundaryError(v.reason ?? "invalid hole");
      const [next, forward, inverse] = produceCommand(ctx.stores.slab, (draft) => {
        const s = draft[cmd.slabId];
        if (!s) return;
        s.holes.push(cmd.hole.map((p) => ({ x: p.x, y: p.y, z: p.z })));
      });
      return { forward, inverse, nextStates: { slab: next } };
    });
  }
}

class RemoveSlabHoleHandler {
  type = "slab.removeHole";
  affectedStores = ["slab"];
  canExecute(ctx, cmd) {
    if (typeof cmd.slabId !== "string" || cmd.slabId.length === 0) {
      return { valid: false, reason: "slabId must be a non-empty string" };
    }
    if (!Number.isInteger(cmd.holeIndex) || cmd.holeIndex < 0) {
      return { valid: false, reason: "holeIndex must be a non-negative integer" };
    }
    const slab = ctx.stores.slab[cmd.slabId];
    if (!slab) return { valid: false, reason: `slab not found: ${cmd.slabId}` };
    if (cmd.holeIndex >= slab.holes.length) {
      return {
        valid: false,
        reason: `holeIndex ${cmd.holeIndex} is out of range (slab has ${slab.holes.length} hole(s))`
      };
    }
    return { valid: true };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      const slab = ctx.stores.slab[cmd.slabId];
      if (!slab) throw new SlabNotFoundError(cmd.slabId);
      if (cmd.holeIndex >= slab.holes.length) {
        throw new SlabHoleNotFoundError(cmd.slabId, cmd.holeIndex);
      }
      const [next, forward, inverse] = produceCommand(ctx.stores.slab, (draft) => {
        const s = draft[cmd.slabId];
        if (!s) return;
        s.holes.splice(cmd.holeIndex, 1);
      });
      return { forward, inverse, nextStates: { slab: next } };
    });
  }
}

class SetSlabThicknessHandler {
  type = "slab.setThickness";
  affectedStores = ["slab"];
  canExecute(ctx, cmd) {
    if (typeof cmd.slabId !== "string" || cmd.slabId.length === 0) {
      return { valid: false, reason: "slabId must be a non-empty string" };
    }
    if (!Number.isFinite(cmd.thickness) || cmd.thickness <= 0) {
      return { valid: false, reason: "thickness must be a finite number > 0" };
    }
    if (!ctx.stores.slab[cmd.slabId]) {
      return { valid: false, reason: `slab not found: ${cmd.slabId}` };
    }
    return { valid: true };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      if (!ctx.stores.slab[cmd.slabId]) throw new SlabNotFoundError(cmd.slabId);
      if (cmd.thickness <= 0) throw new SlabThicknessError(cmd.thickness);
      const [next, forward, inverse] = produceCommand(ctx.stores.slab, (draft) => {
        const s = draft[cmd.slabId];
        if (s) s.thickness = cmd.thickness;
      });
      return { forward, inverse, nextStates: { slab: next } };
    });
  }
}

class SetSlabBaseOffsetHandler {
  type = "slab.setBaseOffset";
  affectedStores = ["slab"];
  canExecute(ctx, cmd) {
    if (typeof cmd.slabId !== "string" || cmd.slabId.length === 0) {
      return { valid: false, reason: "slabId must be a non-empty string" };
    }
    if (!Number.isFinite(cmd.baseOffset)) {
      return { valid: false, reason: "baseOffset must be a finite number" };
    }
    if (!ctx.stores.slab[cmd.slabId]) {
      return { valid: false, reason: `slab not found: ${cmd.slabId}` };
    }
    return { valid: true };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      if (!ctx.stores.slab[cmd.slabId]) throw new SlabNotFoundError(cmd.slabId);
      const [next, forward, inverse] = produceCommand(ctx.stores.slab, (draft) => {
        const s = draft[cmd.slabId];
        if (s) s.baseOffset = cmd.baseOffset;
      });
      return { forward, inverse, nextStates: { slab: next } };
    });
  }
}

class CreateSlabBatchHandler {
  type = "slab.batch.create";
  affectedStores = ["slab"];
  canExecute(_ctx, cmd) {
    if (!Array.isArray(cmd.slabs) || cmd.slabs.length === 0) {
      return { valid: false, reason: "slabs must be a non-empty array" };
    }
    for (let i = 0; i < cmd.slabs.length; i++) {
      const s = cmd.slabs[i];
      if (s.thickness !== void 0 && (!Number.isFinite(s.thickness) || s.thickness <= 0)) {
        return { valid: false, reason: `slabs[${i}].thickness must be > 0` };
      }
      if (s.baseOffset !== void 0 && !Number.isFinite(s.baseOffset)) {
        return { valid: false, reason: `slabs[${i}].baseOffset must be a finite number` };
      }
      if (s.id !== void 0 && (typeof s.id !== "string" || s.id.length === 0)) {
        return { valid: false, reason: `slabs[${i}].id must be a non-empty string when provided` };
      }
      if (s.boundary !== void 0) {
        const v = validateSlabBoundary(s.boundary);
        if (!v.ok) return { valid: false, reason: `slabs[${i}].boundary: ${v.reason ?? "invalid"}` };
      }
      if (s.holes !== void 0) {
        for (let h = 0; h < s.holes.length; h++) {
          const v = validateSlabBoundary(s.holes[h]);
          if (!v.ok) {
            return { valid: false, reason: `slabs[${i}].holes[${h}]: ${v.reason ?? "invalid hole"}` };
          }
        }
      }
    }
    return { valid: true };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      const defaultLevelId = cmd.levelId ?? "";
      const fresh = [];
      for (let i = 0; i < cmd.slabs.length; i++) {
        const s = cmd.slabs[i];
        const id = s.id ?? createId("slab");
        const thickness = s.thickness ?? 0.2;
        if (thickness <= 0) {
          throw new SlabThicknessError(thickness);
        }
        if (s.boundary !== void 0) {
          const v = validateSlabBoundary(s.boundary);
          if (!v.ok) throw new SlabBoundaryError(v.reason ?? "invalid");
        }
        if (s.holes !== void 0) {
          for (let h = 0; h < s.holes.length; h++) {
            const v = validateSlabBoundary(s.holes[h]);
            if (!v.ok) throw new SlabBoundaryError(`hole[${h}]: ${v.reason ?? "invalid"}`);
          }
        }
        let slab;
        try {
          slab = Slab.parse({
            id,
            levelId: s.levelId ?? defaultLevelId,
            thickness,
            baseOffset: s.baseOffset ?? 0,
            holes: s.holes ?? [],
            ...s.boundary !== void 0 ? { boundary: s.boundary } : {},
            ...s.materialId !== void 0 ? { materialId: s.materialId } : {},
            ...s.materialColor !== void 0 ? { materialColor: s.materialColor } : {},
            ...s.systemTypeId !== void 0 ? { systemTypeId: s.systemTypeId } : {}
          });
        } catch (parseErr) {
          throw new SlabSchemaError(
            new Error(`slab.batch.create — slabs[${i}] (id=${id})`, { cause: parseErr })
          );
        }
        fresh.push(slab);
      }
      const [next, forward, inverse] = produceCommand(ctx.stores.slab, (draft) => {
        for (const s of fresh) draft[s.id] = s;
      });
      return { forward, inverse, nextStates: { slab: next } };
    });
  }
}

const UpdateSlabHandler = {
  type: "slab.update",
  affectedStores: ["slab"],
  canExecute(ctx, cmd) {
    if (!cmd.id) return { valid: false, reason: "slab id is required" };
    if (!ctx.stores.slab[cmd.id]) return { valid: false, reason: `slab not found: ${cmd.id}` };
    return { valid: true };
  },
  execute(ctx, cmd) {
    return withHandlerSpan("slab.update.handler", { "pryzm.command.type": "slab.update" }, () => {
      const { id, ...updates } = cmd;
      const [next, forward, inverse] = produceCommand(ctx.stores.slab, (draft) => {
        const slab = draft[id];
        if (!slab) {
          console.error("[slab.update] slab not found in store:", id);
          return;
        }
        Object.assign(slab, updates);
      });
      return { forward, inverse, nextStates: { slab: next } };
    });
  }
};

const UpdateSlabPolygonHandler = {
  type: "slab.updatePolygon",
  affectedStores: ["slab"],
  canExecute(ctx, cmd) {
    if (!cmd.slabId) return { valid: false, reason: "slabId is required" };
    if (!ctx.stores.slab[cmd.slabId]) return { valid: false, reason: `slab not found: ${cmd.slabId}` };
    if (!cmd.polygon || cmd.polygon.length < 3) {
      return { valid: false, reason: "polygon must have at least 3 vertices" };
    }
    return { valid: true };
  },
  execute(ctx, cmd) {
    return withHandlerSpan("slab.updatePolygon.handler", { "pryzm.command.type": "slab.updatePolygon" }, () => {
      const [next, forward, inverse] = produceCommand(ctx.stores.slab, (draft) => {
        const slab = draft[cmd.slabId];
        if (!slab) {
          console.error("[slab.updatePolygon] slab not found in store:", cmd.slabId);
          return;
        }
        const baseZ = slab.boundary[0]?.z ?? 0;
        slab.boundary = cmd.polygon.map((p) => ({ x: p.x, y: p.y, z: baseZ }));
      });
      return { forward, inverse, nextStates: { slab: next } };
    });
  }
};

const UpdateSlabLayersHandler = {
  type: "slab.updateLayers",
  affectedStores: ["slab"],
  canExecute(ctx, cmd) {
    if (!cmd.slabId) return { valid: false, reason: "slabId is required" };
    if (!ctx.stores.slab[cmd.slabId]) return { valid: false, reason: `slab not found: ${cmd.slabId}` };
    return { valid: true };
  },
  execute(ctx, cmd) {
    return withHandlerSpan("slab.updateLayers.handler", { "pryzm.command.type": "slab.updateLayers" }, () => {
      const [next, forward, inverse] = produceCommand(ctx.stores.slab, (draft) => {
        const slab = draft[cmd.slabId];
        if (!slab) {
          console.error("[slab.updateLayers] slab not found in store:", cmd.slabId);
          return;
        }
        if (cmd.systemTypeId !== void 0) slab["systemTypeId"] = cmd.systemTypeId;
        if (cmd.layers !== void 0) slab["layers"] = cmd.layers;
        if (cmd.thickness !== void 0) slab["thickness"] = cmd.thickness;
      });
      return { forward, inverse, nextStates: { slab: next } };
    });
  }
};

class CreateSlabsOnAllFloorsHandler {
  type = "slab.create-on-all-floors";
  affectedStores = [];
  canExecute(_ctx, cmd) {
    if (!cmd.referenceSlabId) {
      return { valid: false, reason: "referenceSlabId is required" };
    }
    return { valid: true };
  }
  execute(_ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      if (!cmd.referenceSlabId) {
        console.warn("[slab.create-on-all-floors.handler] referenceSlabId is required — skipping.");
        throw new Error("slab.create-on-all-floors: referenceSlabId is required — nothing was created.");
      }
      const cm = window.commandManager;
      if (!cm) {
        throw new Error(
          "slab.create-on-all-floors: the command manager is not available in this session — nothing was created."
        );
      }
      let result;
      try {
        result = cm.execute(new CreateSlabsOnAllFloorsCommand(cmd.referenceSlabId));
      } catch (e) {
        console.error("[slab.create-on-all-floors.handler] bridge failed:", e);
        throw new Error(
          `slab.create-on-all-floors: the bridge threw: ${String(e?.message ?? e)} — nothing was created.`
        );
      }
      if (!result?.success) {
        throw new Error(
          `slab.create-on-all-floors: ${result?.info?.[0] ?? "the command refused, and no reason was given"}`
        );
      }
      return { forward: [], inverse: [] };
    });
  }
}

const SLAB_MATERIAL_UNREACHABLE = "It writes the plugin DTO store, which is a FRESH instance built by PluginRegistry and is read by no renderer, no 2-D projector, no IFC exporter and no persistence path — only `<family>.created` is ever mirrored to the geometry store, never updates (§FIX-MATERIAL-DEAD-DISPATCH). Use `slab.updateDimensions` instead — it reaches the geometry record the builders read. (UpdateSlabCommand deliberately THROWS on material fields; UpdateSlabDimensionsCommand owns them.)";
class SetSlabMaterialHandler {
  type = "slab.setMaterial";
  affectedStores = ["slab"];
  canExecute(ctx, cmd) {
    if (typeof cmd.slabId !== "string" || cmd.slabId.length === 0) {
      return { valid: false, reason: "slabId must be a non-empty string" };
    }
    if (cmd.materialId === void 0 && cmd.materialColor === void 0) {
      return { valid: false, reason: "at least one of materialId / materialColor must be provided" };
    }
    if (cmd.materialColor !== void 0 && cmd.materialColor.length === 0) {
      return { valid: false, reason: "materialColor must be non-empty when provided" };
    }
    if (cmd.materialId !== void 0 && cmd.materialId !== null && cmd.materialId.length === 0) {
      return { valid: false, reason: "materialId must be non-empty when provided" };
    }
    if (!ctx.stores.slab[cmd.slabId]) {
      return { valid: false, reason: `slab not found: ${cmd.slabId}` };
    }
    return { valid: false, reason: SLAB_MATERIAL_UNREACHABLE };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      if (!ctx.stores.slab[cmd.slabId]) throw new SlabNotFoundError(cmd.slabId);
      const [next, forward, inverse] = produceCommand(ctx.stores.slab, (draft) => {
        const s = draft[cmd.slabId];
        if (!s) return;
        if (cmd.materialId === null) delete s.materialId;
        else if (cmd.materialId !== void 0) s.materialId = cmd.materialId;
        if (cmd.materialColor !== void 0) s.materialColor = cmd.materialColor;
      });
      return { forward, inverse, nextStates: { slab: next } };
    });
  }
}

const SLAB_TYPE_BATCH_REPORT_EVENT = "pryzm-slab-type-batch-report";
const UpdateSlabsSystemTypeBatchHandler = {
  type: "slab.updateSystemTypeBatch",
  affectedStores: [],
  canExecute(_ctx, cmd) {
    if (cmd.slabIds !== "all" && !Array.isArray(cmd.slabIds)) {
      return { valid: false, reason: "slabIds must be 'all' or an array of slab ids" };
    }
    if (typeof cmd.systemType !== "string" || cmd.systemType.length === 0) {
      return { valid: false, reason: "systemType (id or name) is required" };
    }
    return { valid: true };
  },
  execute(_ctx, cmd) {
    return withHandlerSpan(
      "slab.updateSystemTypeBatch.handler",
      { "pryzm.command.type": "slab.updateSystemTypeBatch" },
      () => {
        const cm = window.commandManager;
        const sayNothingRan = (why) => {
          const report = {
            success: false,
            info: [
              `'slab.updateSystemTypeBatch' did not run — ${why}. Nothing was changed, and nothing about the model is confirmed.`
            ],
            affectedElementIds: [],
            outcome: "indeterminate"
          };
          try {
            window.dispatchEvent(new CustomEvent(SLAB_TYPE_BATCH_REPORT_EVENT, { detail: report }));
          } catch (emitErr) {
            console.error("[slab.updateSystemTypeBatch.handler] indeterminate report emit failed:", emitErr);
          }
        };
        let refusal = null;
        if (cm) {
          try {
            const batch = new UpdateSlabsSystemTypeBatchCommand({
              slabIds: cmd.slabIds === "all" ? "all" : [...cmd.slabIds],
              systemType: cmd.systemType
            });
            const result = cm.execute(batch);
            const report = {
              success: result?.success ?? false,
              info: result?.info ?? [],
              affectedElementIds: result?.affectedElementIds ?? []
            };
            window.dispatchEvent(
              new CustomEvent(SLAB_TYPE_BATCH_REPORT_EVENT, { detail: report })
            );
            if (!report.success) {
              refusal = report.info[0] ?? "the slab type change was refused, and no reason was given";
            }
          } catch (e) {
            console.error("[slab.updateSystemTypeBatch.handler] bridge failed:", e);
            sayNothingRan(`the bridge threw: ${String(e?.message ?? e)}`);
            refusal = `the bridge threw: ${String(e?.message ?? e)}`;
          }
        } else {
          sayNothingRan("the command manager is not available in this session");
          refusal = "the command manager is not available in this session";
        }
        if (refusal !== null) {
          throw new Error(`slab.updateSystemTypeBatch: ${refusal}`);
        }
        const empty = { forward: [], inverse: [] };
        return empty;
      }
    );
  }
};

class ChangeSlabLevelHandler {
  type = "slab.changeLevel";
  affectedStores = ["slab"];
  canExecute(ctx, cmd) {
    if (typeof cmd.slabId !== "string" || cmd.slabId.length === 0) {
      return { valid: false, reason: "slabId must be a non-empty string" };
    }
    if (typeof cmd.levelId !== "string" || cmd.levelId.length === 0) {
      return { valid: false, reason: "levelId must be a non-empty string" };
    }
    if (!Object.prototype.hasOwnProperty.call(ctx.stores.slab, cmd.slabId)) {
      return { valid: false, reason: `slab not found: ${cmd.slabId}` };
    }
    if (ctx.stores.slab[cmd.slabId]?.levelId === cmd.levelId) {
      return { valid: false, reason: `slab ${cmd.slabId} is already on level ${cmd.levelId}` };
    }
    return { valid: true };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      const [next, forward, inverse] = produceCommand(ctx.stores.slab, (draft) => {
        const s = draft[cmd.slabId];
        if (s === void 0) return;
        s.levelId = cmd.levelId;
      });
      return { forward, inverse, nextStates: { slab: next } };
    });
  }
}

function buildSlabHandlerSet() {
  return [
    new CreateSlabHandler(),
    new CreateSlabBatchHandler(),
    new DeleteSlabHandler(),
    new MoveSlabHandler(),
    new SetSlabTypeHandler(),
    new AddSlabHoleHandler(),
    new RemoveSlabHoleHandler(),
    new SetSlabThicknessHandler(),
    new SetSlabBaseOffsetHandler(),
    UpdateSlabHandler,
    UpdateSlabPolygonHandler,
    UpdateSlabLayersHandler,
    new CreateSlabsOnAllFloorsHandler(),
    new SetSlabMaterialHandler(),
    UpdateSlabsSystemTypeBatchHandler,
    new ChangeSlabLevelHandler()
  ];
}

class DoorStore extends Store {
  constructor() {
    super("door");
  }
  /** Convenience read — every door id currently in the store. */
  ids() {
    return [...this.state.keys()];
  }
  /** Convenience read — every door hosted by a given wall.  O(N). */
  byWall(wallId) {
    const out = [];
    for (const d of this.state.values()) {
      if (d.wallId === wallId) out.push(d);
    }
    return out;
  }
  /** Lookup by id; returns `undefined` when missing. */
  get(id) {
    return this.state.get(id);
  }
}

class DoorSystemError extends Error {
  constructor(message) {
    super(message);
    this.name = "DoorSystemError";
  }
}
class DoorNotFoundError extends DoorSystemError {
  constructor(doorId) {
    super(`Door not found: ${doorId}`);
    this.doorId = doorId;
    this.name = "DoorNotFoundError";
  }
  doorId;
}
class DoorSchemaError extends DoorSystemError {
  constructor(cause) {
    super(`Door schema validation failed: ${String(cause?.message ?? cause)}`);
    this.cause = cause;
    this.name = "DoorSchemaError";
  }
  cause;
}
class DoorDimensionsError extends DoorSystemError {
  constructor(reason) {
    super(`Invalid door dimensions: ${reason}`);
    this.reason = reason;
    this.name = "DoorDimensionsError";
  }
  reason;
}
class DoorTypeNotFoundError extends DoorSystemError {
  constructor(typeId) {
    super(`Door type not found: ${typeId}`);
    this.typeId = typeId;
    this.name = "DoorTypeNotFoundError";
  }
  typeId;
}

const DOOR_CREATE_UNREACHABLE = "door.create writes the detached plugin door store: the CA-21 executed read-back saw the dispatch report success while the authoritative doorStore (the one ProjectSerializer reads) did not change, and it left door.delete unjudgeable. A door is a hosted opening, so it is created by ONE atomic command — wall.createOpening (payload: { wallId, opening: { id, type: 'door', offset, width, height, sillHeight, elementId } }) → CreateWallOpeningCommand, which reserves the wall-side opening AND writes the authoritative doorStore record with its system type, finishes and mark.";
class CreateDoorHandler {
  type = "door.create";
  affectedStores = ["door"];
  /** Payload validation ONLY — kept public so a delegating facade can reuse it. */
  validatePayload(_ctx, cmd) {
    if (typeof cmd.wallId !== "string" || cmd.wallId.length === 0) {
      return { valid: false, reason: "wallId must be a non-empty string" };
    }
    if (typeof cmd.openingId !== "string" || cmd.openingId.length === 0) {
      return { valid: false, reason: "openingId must be a non-empty string" };
    }
    if (cmd.width !== void 0 && (!Number.isFinite(cmd.width) || cmd.width <= 0)) {
      return { valid: false, reason: "width must be > 0" };
    }
    if (cmd.height !== void 0 && (!Number.isFinite(cmd.height) || cmd.height <= 0)) {
      return { valid: false, reason: "height must be > 0" };
    }
    if (cmd.offset !== void 0 && (!Number.isFinite(cmd.offset) || cmd.offset < 0)) {
      return { valid: false, reason: "offset must be ≥ 0" };
    }
    if (cmd.sillHeight !== void 0 && (!Number.isFinite(cmd.sillHeight) || cmd.sillHeight < 0)) {
      return { valid: false, reason: "sillHeight must be ≥ 0" };
    }
    if (cmd.systemTypeId !== void 0 && cmd.systemTypeId.length > 0) {
      if (!getDoorType(cmd.systemTypeId)) {
        return {
          valid: false,
          reason: `door type not found: ${cmd.systemTypeId}`
        };
      }
    }
    return { valid: true };
  }
  canExecute(ctx, cmd) {
    const v = this.validatePayload(ctx, cmd);
    if (!v.valid) return v;
    return { valid: false, reason: DOOR_CREATE_UNREACHABLE };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      const typeDefaults = cmd.systemTypeId ? getDoorType(cmd.systemTypeId) : void 0;
      if (cmd.systemTypeId && !typeDefaults) {
        throw new DoorTypeNotFoundError(cmd.systemTypeId);
      }
      const id = cmd.id ?? createId("door");
      const seed = {
        id,
        wallId: cmd.wallId,
        openingId: cmd.openingId,
        doorType: cmd.doorType ?? "single",
        width: cmd.width ?? typeDefaults?.width ?? 0.9,
        height: cmd.height ?? typeDefaults?.height ?? 2.1,
        sillHeight: cmd.sillHeight ?? 0,
        offset: cmd.offset ?? 0,
        frameThickness: cmd.frameThickness ?? typeDefaults?.frameThickness ?? 0.05,
        frameWidth: cmd.frameWidth ?? typeDefaults?.frameWidth ?? 0.05,
        frameColor: cmd.frameColor ?? typeDefaults?.frameColor,
        leafColor: cmd.leafColor ?? typeDefaults?.leafColor,
        fireRating: cmd.fireRating ?? typeDefaults?.fireRating,
        accessibilityType: cmd.accessibilityType ?? typeDefaults?.accessibility
      };
      let door;
      try {
        door = Door.parse(seed);
      } catch (err) {
        throw new DoorSchemaError(err);
      }
      if (door.frameWidth * 2 > door.width) {
        throw new DoorDimensionsError("frameWidth must not exceed half the leaf width");
      }
      const [next, forward, inverse] = produceCommand(ctx.stores.door, (draft) => {
        draft[door.id] = door;
      });
      return { forward, inverse, nextStates: { door: next } };
    });
  }
}

class DeleteDoorHandler {
  type = "door.delete";
  affectedStores = ["door"];
  canExecute(ctx, cmd) {
    if (typeof cmd.doorId !== "string" || cmd.doorId.length === 0) {
      return { valid: false, reason: "doorId must be a non-empty string" };
    }
    if (!ctx.stores.door[cmd.doorId]) {
      return { valid: false, reason: `door not found: ${cmd.doorId}` };
    }
    return { valid: true };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      if (!ctx.stores.door[cmd.doorId]) throw new DoorNotFoundError(cmd.doorId);
      const [next, forward, inverse] = produceCommand(ctx.stores.door, (draft) => {
        delete draft[cmd.doorId];
      });
      return { forward, inverse, nextStates: { door: next } };
    });
  }
}

const DOOR_MOVE_UNREACHABLE = "door.move writes the detached plugin door store that nothing renders, exports or persists, and no production surface dispatches it. Moving a door along its host wall commits through door.setOffset (payload keys: doorId, newOffset, prevOffset) → SetDoorOffsetCommand → the geometry wallStore opening, which is what MOVE_COMMAND_BY_TYPE and the 3-D gizmo already dispatch.";
class MoveDoorHandler {
  type = "door.move";
  affectedStores = ["door"];
  /** Payload validation ONLY — kept public so a delegating facade can reuse it. */
  validatePayload(ctx, cmd) {
    if (typeof cmd.doorId !== "string" || cmd.doorId.length === 0) {
      return { valid: false, reason: "doorId must be a non-empty string" };
    }
    if (!Number.isFinite(cmd.offset) || cmd.offset < 0) {
      return { valid: false, reason: "offset must be a finite number ≥ 0" };
    }
    if (!ctx.stores.door[cmd.doorId]) {
      return { valid: false, reason: `door not found: ${cmd.doorId}` };
    }
    return { valid: true };
  }
  /**
   * §FIX-DEAD-MOVE-VERB-REFUSE (W3-4) — ORDER IS LOAD-BEARING. `canExecute` must be the
   * LAST method before `execute`. `tools/ga-gate/check-verb-register.ts` classifies a
   * verb as REFUSES by slicing the source from `canExecute` to the next `execute(` and
   * checking that the slice can never yield an ACCEPTING validation result. With
   * `validatePayload` sitting between them, its accepting branch lands inside that slice
   * and the verb is mis-reported as UNKNOWN — a refusal hiding from the register that
   * exists to find it. (For the same reason this comment must not spell the accepting
   * literal out: the detector is a regex over source text, and prose is source text.)
   * Do not reorder these two methods.
   */
  canExecute(ctx, cmd) {
    const v = this.validatePayload(ctx, cmd);
    if (!v.valid) return v;
    return { valid: false, reason: DOOR_MOVE_UNREACHABLE };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      if (!ctx.stores.door[cmd.doorId]) throw new DoorNotFoundError(cmd.doorId);
      const [next, forward, inverse] = produceCommand(ctx.stores.door, (draft) => {
        const d = draft[cmd.doorId];
        if (d) d.offset = cmd.offset;
      });
      return { forward, inverse, nextStates: { door: next } };
    });
  }
}

class SetDoorTypeHandler {
  type = "door.setType";
  affectedStores = ["door"];
  canExecute(ctx, cmd) {
    if (typeof cmd.doorId !== "string" || cmd.doorId.length === 0) {
      return { valid: false, reason: "doorId must be a non-empty string" };
    }
    if (typeof cmd.systemTypeId !== "string" || cmd.systemTypeId.length === 0) {
      return { valid: false, reason: "systemTypeId must be a non-empty string" };
    }
    if (!ctx.stores.door[cmd.doorId]) {
      return { valid: false, reason: `door not found: ${cmd.doorId}` };
    }
    if (!getDoorType(cmd.systemTypeId)) {
      return { valid: false, reason: `door type not found: ${cmd.systemTypeId}` };
    }
    return { valid: true };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      const door = ctx.stores.door[cmd.doorId];
      if (!door) throw new DoorNotFoundError(cmd.doorId);
      const t = getDoorType(cmd.systemTypeId);
      if (!t) throw new DoorTypeNotFoundError(cmd.systemTypeId);
      const apply = cmd.applyDefaults !== false;
      const [next, forward, inverse] = produceCommand(ctx.stores.door, (draft) => {
        const d = draft[cmd.doorId];
        if (!d) return;
        if (apply) {
          d.width = t.width;
          d.height = t.height;
          d.frameThickness = t.frameThickness;
          d.frameWidth = t.frameWidth;
          d.frameColor = t.frameColor;
          d.leafColor = t.leafColor;
          if (t.fireRating !== void 0) d.fireRating = t.fireRating;
          if (t.accessibility !== void 0) d.accessibilityType = t.accessibility;
        }
      });
      return { forward, inverse, nextStates: { door: next } };
    });
  }
}

const VALID_SWINGS = [
  "left-in",
  "left-out",
  "right-in",
  "right-out",
  "sliding"
];
class SetDoorSwingHandler {
  type = "door.setSwing";
  affectedStores = ["door"];
  canExecute(ctx, cmd) {
    if (typeof cmd.doorId !== "string" || cmd.doorId.length === 0) {
      return { valid: false, reason: "doorId must be a non-empty string" };
    }
    if (!VALID_SWINGS.includes(cmd.swing)) {
      return { valid: false, reason: `invalid swing: ${String(cmd.swing)}` };
    }
    if (!ctx.stores.door[cmd.doorId]) {
      return { valid: false, reason: `door not found: ${cmd.doorId}` };
    }
    return { valid: true };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      if (!ctx.stores.door[cmd.doorId]) throw new DoorNotFoundError(cmd.doorId);
      const [next, forward, inverse] = produceCommand(ctx.stores.door, (draft) => {
        const door = draft[cmd.doorId];
        if (door) door["swing"] = cmd.swing;
      });
      return { forward, inverse, nextStates: { door: next } };
    });
  }
}

class CreateDoorBatchHandler {
  type = "door.batch.create";
  affectedStores = ["door"];
  canExecute(_ctx, cmd) {
    if (!Array.isArray(cmd.doors) || cmd.doors.length === 0) {
      return { valid: false, reason: "doors must be a non-empty array" };
    }
    for (let i = 0; i < cmd.doors.length; i++) {
      const d = cmd.doors[i];
      if (typeof d.wallId !== "string" || d.wallId.length === 0) {
        return { valid: false, reason: `doors[${i}].wallId must be a non-empty string` };
      }
      if (typeof d.openingId !== "string" || d.openingId.length === 0) {
        return { valid: false, reason: `doors[${i}].openingId must be a non-empty string` };
      }
      if (d.id !== void 0 && (typeof d.id !== "string" || d.id.length === 0)) {
        return { valid: false, reason: `doors[${i}].id must be a non-empty string when provided` };
      }
      if (d.width !== void 0 && (!Number.isFinite(d.width) || d.width <= 0)) {
        return { valid: false, reason: `doors[${i}].width must be > 0` };
      }
      if (d.height !== void 0 && (!Number.isFinite(d.height) || d.height <= 0)) {
        return { valid: false, reason: `doors[${i}].height must be > 0` };
      }
      if (d.systemTypeId !== void 0 && d.systemTypeId.length > 0) {
        if (!getDoorType(d.systemTypeId)) {
          return { valid: false, reason: `doors[${i}]: door type not found: ${d.systemTypeId}` };
        }
      }
    }
    return { valid: true };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      const fresh = [];
      for (let i = 0; i < cmd.doors.length; i++) {
        const d = cmd.doors[i];
        const typeDefaults = d.systemTypeId ? getDoorType(d.systemTypeId) : void 0;
        if (d.systemTypeId && !typeDefaults) {
          throw new DoorTypeNotFoundError(d.systemTypeId);
        }
        const id = d.id ?? createId("door");
        const seed = {
          id,
          wallId: d.wallId,
          openingId: d.openingId,
          doorType: d.doorType ?? "single",
          width: d.width ?? typeDefaults?.width ?? 0.9,
          height: d.height ?? typeDefaults?.height ?? 2.1,
          sillHeight: d.sillHeight ?? 0,
          offset: d.offset ?? 0,
          frameThickness: d.frameThickness ?? typeDefaults?.frameThickness ?? 0.05,
          frameWidth: d.frameWidth ?? typeDefaults?.frameWidth ?? 0.05,
          frameColor: d.frameColor ?? typeDefaults?.frameColor,
          leafColor: d.leafColor ?? typeDefaults?.leafColor,
          fireRating: d.fireRating ?? typeDefaults?.fireRating,
          accessibilityType: d.accessibilityType ?? typeDefaults?.accessibility
        };
        let door;
        try {
          door = Door.parse(seed);
        } catch (parseErr) {
          throw new DoorSchemaError(
            new Error(`door.batch.create — doors[${i}] (id=${id})`, { cause: parseErr })
          );
        }
        if (door.frameWidth * 2 > door.width) {
          throw new DoorDimensionsError(`doors[${i}]: frameWidth must not exceed half the leaf width`);
        }
        fresh.push(door);
      }
      const [next, forward, inverse] = produceCommand(ctx.stores.door, (draft) => {
        for (const d of fresh) draft[d.id] = d;
      });
      return { forward, inverse, nextStates: { door: next } };
    });
  }
}

class SetDoorFireRatingHandler {
  type = "door.setFireRating";
  affectedStores = ["door"];
  canExecute(ctx, cmd) {
    if (typeof cmd.doorId !== "string" || cmd.doorId.length === 0) {
      return { valid: false, reason: "doorId must be a non-empty string" };
    }
    if (typeof cmd.fireRating !== "string") {
      return { valid: false, reason: "fireRating must be a string" };
    }
    const door = ctx.stores.door[cmd.doorId];
    if (!door) return { valid: false, reason: `door not found: ${cmd.doorId}` };
    return { valid: true };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      const door = ctx.stores.door[cmd.doorId];
      if (!door) throw new DoorNotFoundError(cmd.doorId);
      const [next, forward, inverse] = produceCommand(ctx.stores.door, (draft) => {
        const d = draft[cmd.doorId];
        if (d) d.fireRating = cmd.fireRating || void 0;
      });
      return { forward, inverse, nextStates: { door: next } };
    });
  }
}

class SetDoorAccessibilityHandler {
  type = "door.setAccessibility";
  affectedStores = ["door"];
  canExecute(ctx, cmd) {
    if (typeof cmd.doorId !== "string" || cmd.doorId.length === 0) {
      return { valid: false, reason: "doorId must be a non-empty string" };
    }
    if (typeof cmd.accessibilityType !== "string") {
      return { valid: false, reason: "accessibilityType must be a string" };
    }
    const door = ctx.stores.door[cmd.doorId];
    if (!door) return { valid: false, reason: `door not found: ${cmd.doorId}` };
    return { valid: true };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      const door = ctx.stores.door[cmd.doorId];
      if (!door) throw new DoorNotFoundError(cmd.doorId);
      const [next, forward, inverse] = produceCommand(ctx.stores.door, (draft) => {
        const d = draft[cmd.doorId];
        if (d) d.accessibilityType = cmd.accessibilityType || void 0;
      });
      return { forward, inverse, nextStates: { door: next } };
    });
  }
}

const DOOR_TYPE_BATCH_REPORT_EVENT = "pryzm-door-type-batch-report";
const UpdateDoorsSystemTypeBatchHandler = {
  type: "door.updateSystemTypeBatch",
  affectedStores: [],
  canExecute(_ctx, cmd) {
    if (cmd.doorIds !== "all" && !Array.isArray(cmd.doorIds)) {
      return { valid: false, reason: "doorIds must be 'all' or an array of door ids" };
    }
    if (typeof cmd.systemType !== "string" || cmd.systemType.length === 0) {
      return { valid: false, reason: "systemType (id or name) is required" };
    }
    return { valid: true };
  },
  execute(_ctx, cmd) {
    return withHandlerSpan(
      "door.updateSystemTypeBatch.handler",
      { "pryzm.command.type": "door.updateSystemTypeBatch" },
      () => {
        const cm = window.commandManager;
        const sayNothingRan = (why) => {
          const report = {
            success: false,
            info: [
              `'door.updateSystemTypeBatch' did not run — ${why}. Nothing was changed, and nothing about the model is confirmed.`
            ],
            affectedElementIds: [],
            outcome: "indeterminate"
          };
          try {
            window.dispatchEvent(new CustomEvent(DOOR_TYPE_BATCH_REPORT_EVENT, { detail: report }));
          } catch (emitErr) {
            console.error("[door.updateSystemTypeBatch.handler] indeterminate report emit failed:", emitErr);
          }
        };
        let refusal = null;
        if (cm) {
          try {
            const batch = new UpdateDoorsSystemTypeBatchCommand({
              doorIds: cmd.doorIds === "all" ? "all" : [...cmd.doorIds],
              systemType: cmd.systemType
            });
            const result = cm.execute(batch);
            const hostWalls = batch.affectedWallIds;
            if (result?.success && hostWalls.length > 0) {
              try {
                window.__wallRebuildControl?.rebuildWalls?.(hostWalls);
              } catch (e) {
                console.warn("[door.updateSystemTypeBatch] host-wall rebuild nudge failed:", e);
              }
            }
            const report = {
              success: result?.success ?? false,
              info: result?.info ?? [],
              affectedElementIds: result?.affectedElementIds ?? []
            };
            window.dispatchEvent(
              new CustomEvent(DOOR_TYPE_BATCH_REPORT_EVENT, { detail: report })
            );
            if (!report.success) {
              refusal = report.info[0] ?? "the door type change was refused, and no reason was given";
            }
          } catch (e) {
            console.error("[door.updateSystemTypeBatch.handler] bridge failed:", e);
            sayNothingRan(`the bridge threw: ${String(e?.message ?? e)}`);
            refusal = `the bridge threw: ${String(e?.message ?? e)}`;
          }
        } else {
          sayNothingRan("the command manager is not available in this session");
          refusal = "the command manager is not available in this session";
        }
        if (refusal !== null) {
          throw new Error(`door.updateSystemTypeBatch: ${refusal}`);
        }
        const empty = { forward: [], inverse: [] };
        return empty;
      }
    );
  }
};

function buildDoorHandlerSet() {
  return [
    new CreateDoorHandler(),
    new CreateDoorBatchHandler(),
    new DeleteDoorHandler(),
    new MoveDoorHandler(),
    new SetDoorTypeHandler(),
    new SetDoorSwingHandler(),
    // §FIX-DIMS-REACH-RECORD — SetDoorWidthHandler / SetDoorHeightHandler
    // retired (see DOOR_HANDLER_TYPES note); initBusHandlers bridges own the verbs.
    new SetDoorFireRatingHandler(),
    new SetDoorAccessibilityHandler(),
    UpdateDoorsSystemTypeBatchHandler
  ];
}

class WindowStore extends Store {
  constructor() {
    super("window");
  }
  ids() {
    return [...this.state.keys()];
  }
  byWall(wallId) {
    const out = [];
    for (const w of this.state.values()) {
      if (w.wallId === wallId) out.push(w);
    }
    return out;
  }
  get(id) {
    return this.state.get(id);
  }
}

class WindowSystemError extends Error {
  constructor(message) {
    super(message);
    this.name = "WindowSystemError";
  }
}
class WindowNotFoundError extends WindowSystemError {
  constructor(windowId) {
    super(`Window not found: ${windowId}`);
    this.windowId = windowId;
    this.name = "WindowNotFoundError";
  }
  windowId;
}
class WindowSchemaError extends WindowSystemError {
  constructor(cause) {
    super(`Window schema validation failed: ${String(cause?.message ?? cause)}`);
    this.cause = cause;
    this.name = "WindowSchemaError";
  }
  cause;
}
class WindowDimensionsError extends WindowSystemError {
  constructor(reason) {
    super(`Invalid window dimensions: ${reason}`);
    this.reason = reason;
    this.name = "WindowDimensionsError";
  }
  reason;
}
class WindowTypeNotFoundError extends WindowSystemError {
  constructor(typeId) {
    super(`Window type not found: ${typeId}`);
    this.typeId = typeId;
    this.name = "WindowTypeNotFoundError";
  }
  typeId;
}

const WINDOW_CREATE_UNREACHABLE = "window.create writes the detached plugin window store: the CA-21 executed read-back saw the dispatch report success while the authoritative windowStore (the one ProjectSerializer reads) did not change, and it left window.delete unjudgeable. A window is a hosted opening, so it is created by ONE atomic command — wall.createOpening (payload: { wallId, opening: { id, type: 'window', offset, width, height, sillHeight, elementId } }) → CreateWallOpeningCommand, which reserves the wall-side opening AND writes the authoritative windowStore record with its system type, finishes and mark.";
class CreateWindowHandler {
  type = "window.create";
  affectedStores = ["window"];
  /** Payload validation ONLY — kept public so a delegating facade can reuse it. */
  validatePayload(_ctx, cmd) {
    if (typeof cmd.wallId !== "string" || cmd.wallId.length === 0) {
      return { valid: false, reason: "wallId must be a non-empty string" };
    }
    if (typeof cmd.openingId !== "string" || cmd.openingId.length === 0) {
      return { valid: false, reason: "openingId must be a non-empty string" };
    }
    if (cmd.width !== void 0 && (!Number.isFinite(cmd.width) || cmd.width <= 0)) {
      return { valid: false, reason: "width must be > 0" };
    }
    if (cmd.height !== void 0 && (!Number.isFinite(cmd.height) || cmd.height <= 0)) {
      return { valid: false, reason: "height must be > 0" };
    }
    if (cmd.systemTypeId !== void 0 && cmd.systemTypeId.length > 0) {
      if (!getWindowType(cmd.systemTypeId)) {
        return { valid: false, reason: `window type not found: ${cmd.systemTypeId}` };
      }
    }
    return { valid: true };
  }
  canExecute(ctx, cmd) {
    const v = this.validatePayload(ctx, cmd);
    if (!v.valid) return v;
    return { valid: false, reason: WINDOW_CREATE_UNREACHABLE };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      const typeDefaults = cmd.systemTypeId ? getWindowType(cmd.systemTypeId) : void 0;
      if (cmd.systemTypeId && !typeDefaults) {
        throw new WindowTypeNotFoundError(cmd.systemTypeId);
      }
      const id = cmd.id ?? createId("window");
      const seed = {
        id,
        wallId: cmd.wallId,
        openingId: cmd.openingId,
        windowType: cmd.windowType ?? "single",
        width: cmd.width ?? typeDefaults?.width ?? 1.2,
        height: cmd.height ?? typeDefaults?.height ?? 1.2,
        sillHeight: cmd.sillHeight ?? typeDefaults?.sillHeight ?? 0.9,
        offset: cmd.offset ?? 0,
        frameThickness: cmd.frameThickness ?? typeDefaults?.frameThickness ?? 0.05,
        frameWidth: cmd.frameWidth ?? typeDefaults?.frameWidth ?? 0.05,
        frameColor: cmd.frameColor ?? typeDefaults?.frameColor,
        fireRating: cmd.fireRating ?? typeDefaults?.fireRating
      };
      let window;
      try {
        window = Window.parse(seed);
      } catch (err) {
        throw new WindowSchemaError(err);
      }
      if (window.frameWidth * 2 > window.width) {
        throw new WindowDimensionsError("frameWidth must not exceed half the pane width");
      }
      const [next, forward, inverse] = produceCommand(ctx.stores.window, (draft) => {
        draft[window.id] = window;
      });
      return { forward, inverse, nextStates: { window: next } };
    });
  }
}

class DeleteWindowHandler {
  type = "window.delete";
  affectedStores = ["window"];
  canExecute(ctx, cmd) {
    if (typeof cmd.windowId !== "string" || cmd.windowId.length === 0) {
      return { valid: false, reason: "windowId must be a non-empty string" };
    }
    if (!ctx.stores.window[cmd.windowId]) {
      return { valid: false, reason: `window not found: ${cmd.windowId}` };
    }
    return { valid: true };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      if (!ctx.stores.window[cmd.windowId]) throw new WindowNotFoundError(cmd.windowId);
      const [next, forward, inverse] = produceCommand(ctx.stores.window, (draft) => {
        delete draft[cmd.windowId];
      });
      return { forward, inverse, nextStates: { window: next } };
    });
  }
}

const WINDOW_MOVE_UNREACHABLE = "window.move writes the detached plugin window store that nothing renders, exports or persists, and no production surface dispatches it. Moving a window along its host wall commits through window.setOffset (payload keys: windowId, newOffset, prevOffset) → SetWindowOffsetCommand → the geometry wallStore opening, which is what MOVE_COMMAND_BY_TYPE and the 3-D gizmo already dispatch.";
class MoveWindowHandler {
  type = "window.move";
  affectedStores = ["window"];
  /** Payload validation ONLY — kept public so a delegating facade can reuse it. */
  validatePayload(ctx, cmd) {
    if (typeof cmd.windowId !== "string" || cmd.windowId.length === 0) {
      return { valid: false, reason: "windowId must be a non-empty string" };
    }
    if (!Number.isFinite(cmd.offset) || cmd.offset < 0) {
      return { valid: false, reason: "offset must be a finite number ≥ 0" };
    }
    if (!ctx.stores.window[cmd.windowId]) {
      return { valid: false, reason: `window not found: ${cmd.windowId}` };
    }
    return { valid: true };
  }
  /**
   * §FIX-DEAD-MOVE-VERB-REFUSE (W3-4) — ORDER IS LOAD-BEARING. `canExecute` must be the
   * LAST method before `execute`. `tools/ga-gate/check-verb-register.ts` classifies a
   * verb as REFUSES by slicing the source from `canExecute` to the next `execute(` and
   * checking that the slice can never yield an ACCEPTING validation result. With
   * `validatePayload` sitting between them, its accepting branch lands inside that slice
   * and the verb is mis-reported as UNKNOWN — a refusal hiding from the register that
   * exists to find it. (For the same reason this comment must not spell the accepting
   * literal out: the detector is a regex over source text, and prose is source text.)
   * Do not reorder these two methods.
   */
  canExecute(ctx, cmd) {
    const v = this.validatePayload(ctx, cmd);
    if (!v.valid) return v;
    return { valid: false, reason: WINDOW_MOVE_UNREACHABLE };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      if (!ctx.stores.window[cmd.windowId]) throw new WindowNotFoundError(cmd.windowId);
      const [next, forward, inverse] = produceCommand(ctx.stores.window, (draft) => {
        const w = draft[cmd.windowId];
        if (w) w.offset = cmd.offset;
      });
      return { forward, inverse, nextStates: { window: next } };
    });
  }
}

class SetWindowTypeHandler {
  type = "window.setType";
  affectedStores = ["window"];
  canExecute(ctx, cmd) {
    if (typeof cmd.windowId !== "string" || cmd.windowId.length === 0) {
      return { valid: false, reason: "windowId must be a non-empty string" };
    }
    if (typeof cmd.systemTypeId !== "string" || cmd.systemTypeId.length === 0) {
      return { valid: false, reason: "systemTypeId must be a non-empty string" };
    }
    if (!ctx.stores.window[cmd.windowId]) {
      return { valid: false, reason: `window not found: ${cmd.windowId}` };
    }
    if (!getWindowType(cmd.systemTypeId)) {
      return { valid: false, reason: `window type not found: ${cmd.systemTypeId}` };
    }
    return { valid: true };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      const w = ctx.stores.window[cmd.windowId];
      if (!w) throw new WindowNotFoundError(cmd.windowId);
      const t = getWindowType(cmd.systemTypeId);
      if (!t) throw new WindowTypeNotFoundError(cmd.systemTypeId);
      const apply = cmd.applyDefaults !== false;
      const [next, forward, inverse] = produceCommand(ctx.stores.window, (draft) => {
        const d = draft[cmd.windowId];
        if (!d) return;
        if (apply) {
          d.width = t.width;
          d.height = t.height;
          d.sillHeight = t.sillHeight;
          d.frameThickness = t.frameThickness;
          d.frameWidth = t.frameWidth;
          d.frameColor = t.frameColor;
          if (t.fireRating !== void 0) d.fireRating = t.fireRating;
        }
      });
      return { forward, inverse, nextStates: { window: next } };
    });
  }
}

class CreateWindowBatchHandler {
  type = "window.batch.create";
  affectedStores = ["window"];
  canExecute(_ctx, cmd) {
    if (!Array.isArray(cmd.windows) || cmd.windows.length === 0) {
      return { valid: false, reason: "windows must be a non-empty array" };
    }
    for (let i = 0; i < cmd.windows.length; i++) {
      const w = cmd.windows[i];
      if (typeof w.wallId !== "string" || w.wallId.length === 0) {
        return { valid: false, reason: `windows[${i}].wallId must be a non-empty string` };
      }
      if (typeof w.openingId !== "string" || w.openingId.length === 0) {
        return { valid: false, reason: `windows[${i}].openingId must be a non-empty string` };
      }
      if (w.id !== void 0 && (typeof w.id !== "string" || w.id.length === 0)) {
        return { valid: false, reason: `windows[${i}].id must be a non-empty string when provided` };
      }
      if (w.width !== void 0 && (!Number.isFinite(w.width) || w.width <= 0)) {
        return { valid: false, reason: `windows[${i}].width must be > 0` };
      }
      if (w.height !== void 0 && (!Number.isFinite(w.height) || w.height <= 0)) {
        return { valid: false, reason: `windows[${i}].height must be > 0` };
      }
      if (w.systemTypeId !== void 0 && w.systemTypeId.length > 0) {
        if (!getWindowType(w.systemTypeId)) {
          return { valid: false, reason: `windows[${i}]: window type not found: ${w.systemTypeId}` };
        }
      }
    }
    return { valid: true };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      const fresh = [];
      for (let i = 0; i < cmd.windows.length; i++) {
        const w = cmd.windows[i];
        const typeDefaults = w.systemTypeId ? getWindowType(w.systemTypeId) : void 0;
        if (w.systemTypeId && !typeDefaults) {
          throw new WindowTypeNotFoundError(w.systemTypeId);
        }
        const id = w.id ?? createId("window");
        const seed = {
          id,
          wallId: w.wallId,
          openingId: w.openingId,
          windowType: w.windowType ?? "single",
          width: w.width ?? typeDefaults?.width ?? 1.2,
          height: w.height ?? typeDefaults?.height ?? 1.2,
          sillHeight: w.sillHeight ?? typeDefaults?.sillHeight ?? 0.9,
          offset: w.offset ?? 0,
          frameThickness: w.frameThickness ?? typeDefaults?.frameThickness ?? 0.05,
          frameWidth: w.frameWidth ?? typeDefaults?.frameWidth ?? 0.05,
          frameColor: w.frameColor ?? typeDefaults?.frameColor,
          fireRating: w.fireRating ?? typeDefaults?.fireRating
        };
        let window;
        try {
          window = Window.parse(seed);
        } catch (parseErr) {
          throw new WindowSchemaError(
            new Error(`window.batch.create — windows[${i}] (id=${id})`, { cause: parseErr })
          );
        }
        if (window.frameWidth * 2 > window.width) {
          throw new WindowDimensionsError(`windows[${i}]: frameWidth must not exceed half the pane width`);
        }
        fresh.push(window);
      }
      const [next, forward, inverse] = produceCommand(ctx.stores.window, (draft) => {
        for (const w of fresh) draft[w.id] = w;
      });
      return { forward, inverse, nextStates: { window: next } };
    });
  }
}

class SetWindowFireRatingHandler {
  type = "window.setFireRating";
  affectedStores = ["window"];
  canExecute(ctx, cmd) {
    if (typeof cmd.windowId !== "string" || cmd.windowId.length === 0) {
      return { valid: false, reason: "windowId must be a non-empty string" };
    }
    if (typeof cmd.fireRating !== "string") {
      return { valid: false, reason: "fireRating must be a string" };
    }
    const w = ctx.stores.window[cmd.windowId];
    if (!w) return { valid: false, reason: `window not found: ${cmd.windowId}` };
    return { valid: true };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      const w = ctx.stores.window[cmd.windowId];
      if (!w) throw new WindowNotFoundError(cmd.windowId);
      const [next, forward, inverse] = produceCommand(ctx.stores.window, (draft) => {
        const d = draft[cmd.windowId];
        if (!d) return;
        d.fireRating = cmd.fireRating || void 0;
      });
      return { forward, inverse, nextStates: { window: next } };
    });
  }
}

const WINDOW_TYPE_BATCH_REPORT_EVENT = "pryzm-window-type-batch-report";
const UpdateWindowsSystemTypeBatchHandler = {
  type: "window.updateSystemTypeBatch",
  affectedStores: [],
  canExecute(_ctx, cmd) {
    if (cmd.windowIds !== "all" && !Array.isArray(cmd.windowIds)) {
      return { valid: false, reason: "windowIds must be 'all' or an array of window ids" };
    }
    if (typeof cmd.systemType !== "string" || cmd.systemType.length === 0) {
      return { valid: false, reason: "systemType (id or name) is required" };
    }
    return { valid: true };
  },
  execute(_ctx, cmd) {
    return withHandlerSpan(
      "window.updateSystemTypeBatch.handler",
      { "pryzm.command.type": "window.updateSystemTypeBatch" },
      () => {
        const cm = window.commandManager;
        const sayNothingRan = (why) => {
          const report = {
            success: false,
            info: [
              `'window.updateSystemTypeBatch' did not run — ${why}. Nothing was changed, and nothing about the model is confirmed.`
            ],
            affectedElementIds: [],
            outcome: "indeterminate"
          };
          try {
            window.dispatchEvent(new CustomEvent(WINDOW_TYPE_BATCH_REPORT_EVENT, { detail: report }));
          } catch (emitErr) {
            console.error("[window.updateSystemTypeBatch.handler] indeterminate report emit failed:", emitErr);
          }
        };
        let refusal = null;
        if (cm) {
          try {
            const batch = new UpdateWindowsSystemTypeBatchCommand({
              windowIds: cmd.windowIds === "all" ? "all" : [...cmd.windowIds],
              systemType: cmd.systemType
            });
            const result = cm.execute(batch);
            const hostWalls = batch.affectedWallIds;
            if (result?.success && hostWalls.length > 0) {
              try {
                window.__wallRebuildControl?.rebuildWalls?.(hostWalls);
              } catch (e) {
                console.warn("[window.updateSystemTypeBatch] host-wall rebuild nudge failed:", e);
              }
            }
            const report = {
              success: result?.success ?? false,
              info: result?.info ?? [],
              affectedElementIds: result?.affectedElementIds ?? []
            };
            window.dispatchEvent(
              new CustomEvent(WINDOW_TYPE_BATCH_REPORT_EVENT, { detail: report })
            );
            if (!report.success) {
              refusal = report.info[0] ?? "the window type change was refused, and no reason was given";
            }
          } catch (e) {
            console.error("[window.updateSystemTypeBatch.handler] bridge failed:", e);
            sayNothingRan(`the bridge threw: ${String(e?.message ?? e)}`);
            refusal = `the bridge threw: ${String(e?.message ?? e)}`;
          }
        } else {
          sayNothingRan("the command manager is not available in this session");
          refusal = "the command manager is not available in this session";
        }
        if (refusal !== null) {
          throw new Error(`window.updateSystemTypeBatch: ${refusal}`);
        }
        const empty = { forward: [], inverse: [] };
        return empty;
      }
    );
  }
};

const WINDOW_PARAMETRIC_REPORT_EVENT = "pryzm-window-parametric-report";
const CreateWindowsParametricBatchHandler = {
  type: "window.parametricCreate",
  affectedStores: [],
  canExecute(_ctx, cmd) {
    if (cmd.wallIds !== "all" && !Array.isArray(cmd.wallIds)) {
      return { valid: false, reason: "wallIds must be 'all' or an array of wall ids" };
    }
    if (cmd.mode?.kind !== "count" && cmd.mode?.kind !== "spacing") {
      return { valid: false, reason: "mode must be { kind: 'count' } or { kind: 'spacing' }" };
    }
    if (typeof cmd.width !== "number" || typeof cmd.height !== "number") {
      return { valid: false, reason: "width and height (metres) are required" };
    }
    return { valid: true };
  },
  execute(_ctx, cmd) {
    return withHandlerSpan(
      "window.parametricCreate.handler",
      { "pryzm.command.type": "window.parametricCreate" },
      () => {
        const cm = window.commandManager;
        const sayNothingRan = (why) => {
          const report = {
            success: false,
            info: [
              `'window.parametricCreate' did not run — ${why}. Nothing was changed, and nothing about the model is confirmed.`
            ],
            affectedElementIds: [],
            outcome: "indeterminate"
          };
          try {
            window.dispatchEvent(new CustomEvent(WINDOW_PARAMETRIC_REPORT_EVENT, { detail: report }));
          } catch (emitErr) {
            console.error("[window.parametricCreate.handler] indeterminate report emit failed:", emitErr);
          }
        };
        let refusal = null;
        if (cm) {
          try {
            const result = cm.execute(
              new CreateWindowsParametricBatchCommand({
                wallIds: cmd.wallIds === "all" ? "all" : [...cmd.wallIds],
                mode: cmd.mode,
                width: cmd.width,
                height: cmd.height,
                ...cmd.sillHeight !== void 0 ? { sillHeight: cmd.sillHeight } : {},
                ...cmd.systemTypeId !== void 0 ? { systemTypeId: cmd.systemTypeId } : {}
              })
            );
            const report = {
              success: result?.success ?? false,
              info: result?.info ?? [],
              affectedElementIds: result?.affectedElementIds ?? []
            };
            window.dispatchEvent(
              new CustomEvent(WINDOW_PARAMETRIC_REPORT_EVENT, { detail: report })
            );
            if (!report.success) {
              refusal = report.info[0] ?? "the window creation was refused, and no reason was given";
            }
          } catch (e) {
            console.error("[window.parametricCreate.handler] bridge failed:", e);
            sayNothingRan(`the bridge threw: ${String(e?.message ?? e)}`);
            refusal = `the bridge threw: ${String(e?.message ?? e)}`;
          }
        } else {
          sayNothingRan("the command manager is not available in this session");
          refusal = "the command manager is not available in this session";
        }
        if (refusal !== null) {
          throw new Error(`window.parametricCreate: ${refusal}`);
        }
        const empty = { forward: [], inverse: [] };
        return empty;
      }
    );
  }
};

function buildWindowHandlerSet() {
  return [
    new CreateWindowHandler(),
    new CreateWindowBatchHandler(),
    new DeleteWindowHandler(),
    new MoveWindowHandler(),
    new SetWindowTypeHandler(),
    // §FIX-DIMS-REACH-RECORD — SetWindowSizeHandler / SetWindowSillHeightHandler
    // retired (see WINDOW_HANDLER_TYPES note); initBusHandlers bridges own the verbs.
    new SetWindowFireRatingHandler(),
    UpdateWindowsSystemTypeBatchHandler,
    CreateWindowsParametricBatchHandler
  ];
}

class RoofStore extends Store {
  constructor() {
    super("roof");
  }
  ids() {
    return [...this.state.keys()];
  }
  byLevel(levelId) {
    const out = [];
    for (const r of this.state.values()) {
      if (r.levelId === levelId) out.push(r);
    }
    return out;
  }
  get(id) {
    return this.state.get(id);
  }
}

class RoofSystemError extends Error {
  constructor(message) {
    super(message);
    this.name = "RoofSystemError";
  }
}
class RoofNotFoundError extends RoofSystemError {
  constructor(roofId) {
    super(`Roof not found: ${roofId}`);
    this.roofId = roofId;
    this.name = "RoofNotFoundError";
  }
  roofId;
}
class RoofSchemaError extends RoofSystemError {
  constructor(cause) {
    super(`Roof schema validation failed: ${String(cause?.message ?? cause)}`);
    this.cause = cause;
    this.name = "RoofSchemaError";
  }
  cause;
}
class RoofTypeNotFoundError extends RoofSystemError {
  constructor(typeId) {
    super(`Roof type not found: ${typeId}`);
    this.typeId = typeId;
    this.name = "RoofTypeNotFoundError";
  }
  typeId;
}
class RoofPitchOutOfRangeError extends RoofSystemError {
  constructor(pitch) {
    super(`Roof pitch ${pitch.toFixed(4)} rad out of range [0, π/2)`);
    this.pitch = pitch;
    this.name = "RoofPitchOutOfRangeError";
  }
  pitch;
}
class RoofShapeMismatchError extends RoofSystemError {
  constructor(shape, pitch) {
    super(
      `Roof with shape="${shape}" cannot have pitch=${pitch.toFixed(4)} (flat roofs require pitch=0)`
    );
    this.shape = shape;
    this.pitch = pitch;
    this.name = "RoofShapeMismatchError";
  }
  shape;
  pitch;
}

class CreateRoofHandler {
  type = "roof.create";
  affectedStores = ["roof"];
  canExecute(_ctx, cmd) {
    if (cmd.boundary !== void 0 && cmd.boundary.length < 3) {
      return { valid: false, reason: "boundary requires ≥3 points" };
    }
    if (cmd.thickness !== void 0 && (!Number.isFinite(cmd.thickness) || cmd.thickness <= 0)) {
      return { valid: false, reason: "thickness must be > 0" };
    }
    if (cmd.pitch !== void 0 && (!Number.isFinite(cmd.pitch) || cmd.pitch < 0 || cmd.pitch >= Math.PI / 2)) {
      return { valid: false, reason: "pitch must be in [0, π/2)" };
    }
    if (cmd.systemTypeId !== void 0 && cmd.systemTypeId.length > 0) {
      if (!getRoofType(cmd.systemTypeId)) {
        return { valid: false, reason: `roof type not found: ${cmd.systemTypeId}` };
      }
    }
    return { valid: true };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      const typeDefaults = cmd.systemTypeId ? getRoofType(cmd.systemTypeId) : void 0;
      if (cmd.systemTypeId && !typeDefaults) {
        throw new RoofTypeNotFoundError(cmd.systemTypeId);
      }
      const id = cmd.id ?? createId("roof");
      const seed = {
        id,
        levelId: cmd.levelId ?? "",
        shape: cmd.shape ?? typeDefaults?.shape ?? "flat",
        pitch: cmd.pitch ?? typeDefaults?.pitch ?? 0,
        thickness: cmd.thickness ?? typeDefaults?.thickness ?? 0.2,
        overhang: cmd.overhang ?? typeDefaults?.overhang ?? 0,
        materialId: cmd.materialId,
        materialColor: cmd.materialColor ?? typeDefaults?.materialColor
      };
      if (cmd.boundary) seed.boundary = cmd.boundary;
      let roof;
      try {
        roof = Roof.parse(seed);
      } catch (err) {
        throw new RoofSchemaError(err);
      }
      const [next, forward, inverse] = produceCommand(ctx.stores.roof, (draft) => {
        draft[roof.id] = roof;
      });
      return { forward, inverse, nextStates: { roof: next } };
    });
  }
}

class DeleteRoofHandler {
  type = "roof.delete";
  affectedStores = ["roof"];
  canExecute(ctx, cmd) {
    if (typeof cmd.roofId !== "string" || cmd.roofId.length === 0) {
      return { valid: false, reason: "roofId must be a non-empty string" };
    }
    if (!ctx.stores.roof[cmd.roofId]) {
      return { valid: false, reason: `roof not found: ${cmd.roofId}` };
    }
    return { valid: true };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      if (!ctx.stores.roof[cmd.roofId]) throw new RoofNotFoundError(cmd.roofId);
      const [next, forward, inverse] = produceCommand(ctx.stores.roof, (draft) => {
        delete draft[cmd.roofId];
      });
      return { forward, inverse, nextStates: { roof: next } };
    });
  }
}

const VALID_SHAPES$2 = /* @__PURE__ */ new Set([
  "flat",
  "gable",
  "hip",
  "mono",
  "mansard"
]);
class SetRoofShapeHandler {
  type = "roof.setShape";
  affectedStores = ["roof"];
  canExecute(ctx, cmd) {
    if (typeof cmd.roofId !== "string" || cmd.roofId.length === 0) {
      return { valid: false, reason: "roofId must be a non-empty string" };
    }
    if (!VALID_SHAPES$2.has(cmd.shape)) {
      return { valid: false, reason: `invalid shape: ${cmd.shape}` };
    }
    if (!ctx.stores.roof[cmd.roofId]) {
      return { valid: false, reason: `roof not found: ${cmd.roofId}` };
    }
    return { valid: true };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      if (!ctx.stores.roof[cmd.roofId]) throw new RoofNotFoundError(cmd.roofId);
      const [next, forward, inverse] = produceCommand(ctx.stores.roof, (draft) => {
        const r = draft[cmd.roofId];
        if (!r) return;
        r.shape = cmd.shape;
        if (cmd.shape === "flat") r.pitch = 0;
      });
      return { forward, inverse, nextStates: { roof: next } };
    });
  }
}

const MAX_PITCH = Math.PI / 2 - 1e-3;
class SetRoofPitchHandler {
  type = "roof.setPitch";
  affectedStores = ["roof"];
  canExecute(ctx, cmd) {
    if (typeof cmd.roofId !== "string" || cmd.roofId.length === 0) {
      return { valid: false, reason: "roofId must be a non-empty string" };
    }
    if (!Number.isFinite(cmd.pitch) || cmd.pitch < 0 || cmd.pitch > MAX_PITCH) {
      return { valid: false, reason: `pitch must be in [0, ${MAX_PITCH.toFixed(4)}]` };
    }
    const r = ctx.stores.roof[cmd.roofId];
    if (!r) return { valid: false, reason: `roof not found: ${cmd.roofId}` };
    if (r.shape === "flat" && cmd.pitch !== 0) {
      return { valid: false, reason: "flat roof must keep pitch=0" };
    }
    return { valid: true };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      const r = ctx.stores.roof[cmd.roofId];
      if (!r) throw new RoofNotFoundError(cmd.roofId);
      if (cmd.pitch < 0 || cmd.pitch > MAX_PITCH) {
        throw new RoofPitchOutOfRangeError(cmd.pitch);
      }
      if (r.shape === "flat" && cmd.pitch !== 0) {
        throw new RoofShapeMismatchError(r.shape, cmd.pitch);
      }
      const [next, forward, inverse] = produceCommand(ctx.stores.roof, (draft) => {
        const d = draft[cmd.roofId];
        if (d) d.pitch = cmd.pitch;
      });
      return { forward, inverse, nextStates: { roof: next } };
    });
  }
}

class SetRoofThicknessHandler {
  type = "roof.setThickness";
  affectedStores = ["roof"];
  canExecute(ctx, cmd) {
    if (typeof cmd.roofId !== "string" || cmd.roofId.length === 0) {
      return { valid: false, reason: "roofId must be a non-empty string" };
    }
    if (!Number.isFinite(cmd.thickness) || cmd.thickness <= 0) {
      return { valid: false, reason: "thickness must be > 0" };
    }
    if (!ctx.stores.roof[cmd.roofId]) {
      return { valid: false, reason: `roof not found: ${cmd.roofId}` };
    }
    return { valid: true };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      if (!ctx.stores.roof[cmd.roofId]) throw new RoofNotFoundError(cmd.roofId);
      const [next, forward, inverse] = produceCommand(ctx.stores.roof, (draft) => {
        const d = draft[cmd.roofId];
        if (d) d.thickness = cmd.thickness;
      });
      return { forward, inverse, nextStates: { roof: next } };
    });
  }
}

class SetRoofOverhangHandler {
  type = "roof.setOverhang";
  affectedStores = ["roof"];
  canExecute(ctx, cmd) {
    if (typeof cmd.roofId !== "string" || cmd.roofId.length === 0) {
      return { valid: false, reason: "roofId must be a non-empty string" };
    }
    if (!Number.isFinite(cmd.overhang) || cmd.overhang < 0) {
      return { valid: false, reason: "overhang must be ≥ 0" };
    }
    if (!ctx.stores.roof[cmd.roofId]) {
      return { valid: false, reason: `roof not found: ${cmd.roofId}` };
    }
    return { valid: true };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      if (!ctx.stores.roof[cmd.roofId]) throw new RoofNotFoundError(cmd.roofId);
      const [next, forward, inverse] = produceCommand(ctx.stores.roof, (draft) => {
        const d = draft[cmd.roofId];
        if (d) d.overhang = cmd.overhang;
      });
      return { forward, inverse, nextStates: { roof: next } };
    });
  }
}

const ROOF_MOVE_UNREACHABLE = "roof.move writes the detached plugin roof store that nothing renders, exports or persists, and no production surface dispatches it. Moving a roof commits through roof.update (payload keys: id, updates) → UpdateRoofCommand → the geometry roofStore, which is what MOVE_COMMAND_BY_TYPE already dispatches. Put the translated boundary in `updates`.";
class MoveRoofHandler {
  type = "roof.move";
  affectedStores = ["roof"];
  /** Payload validation ONLY — kept public so a delegating facade can reuse it. */
  validatePayload(ctx, cmd) {
    if (typeof cmd.roofId !== "string" || cmd.roofId.length === 0) {
      return { valid: false, reason: "roofId must be a non-empty string" };
    }
    if (!cmd.delta || ![cmd.delta.x, cmd.delta.y, cmd.delta.z].every(Number.isFinite)) {
      return { valid: false, reason: "delta must be a finite Vec3" };
    }
    if (!ctx.stores.roof[cmd.roofId]) {
      return { valid: false, reason: `roof not found: ${cmd.roofId}` };
    }
    return { valid: true };
  }
  /**
   * §FIX-DEAD-MOVE-VERB-REFUSE (W3-4) — ORDER IS LOAD-BEARING. `canExecute` must be the
   * LAST method before `execute`. `tools/ga-gate/check-verb-register.ts` classifies a
   * verb as REFUSES by slicing the source from `canExecute` to the next `execute(` and
   * checking that the slice can never yield an ACCEPTING validation result. With
   * `validatePayload` sitting between them, its accepting branch lands inside that slice
   * and the verb is mis-reported as UNKNOWN — a refusal hiding from the register that
   * exists to find it. (For the same reason this comment must not spell the accepting
   * literal out: the detector is a regex over source text, and prose is source text.)
   * Do not reorder these two methods.
   */
  canExecute(ctx, cmd) {
    const v = this.validatePayload(ctx, cmd);
    if (!v.valid) return v;
    return { valid: false, reason: ROOF_MOVE_UNREACHABLE };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      if (!ctx.stores.roof[cmd.roofId]) throw new RoofNotFoundError(cmd.roofId);
      const [next, forward, inverse] = produceCommand(ctx.stores.roof, (draft) => {
        const r = draft[cmd.roofId];
        if (!r) return;
        r.boundary = r.boundary.map((p) => ({
          x: p.x + cmd.delta.x,
          y: p.y + cmd.delta.y,
          z: p.z + cmd.delta.z
        }));
      });
      return { forward, inverse, nextStates: { roof: next } };
    });
  }
}

class ChangeRoofLevelHandler {
  type = "roof.changeLevel";
  affectedStores = ["roof"];
  canExecute(ctx, cmd) {
    if (typeof cmd.roofId !== "string" || cmd.roofId.length === 0) {
      return { valid: false, reason: "roofId must be a non-empty string" };
    }
    if (typeof cmd.levelId !== "string" || cmd.levelId.length === 0) {
      return { valid: false, reason: "levelId must be a non-empty string" };
    }
    if (!ctx.stores.roof[cmd.roofId]) {
      return { valid: false, reason: `roof not found: ${cmd.roofId}` };
    }
    return { valid: true };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      if (!ctx.stores.roof[cmd.roofId]) throw new RoofNotFoundError(cmd.roofId);
      const [next, forward, inverse] = produceCommand(ctx.stores.roof, (draft) => {
        const r = draft[cmd.roofId];
        if (r) r.levelId = cmd.levelId;
      });
      return { forward, inverse, nextStates: { roof: next } };
    });
  }
}

class AddSkylightHandler {
  type = "roof.addSkylight";
  affectedStores = ["roof"];
  canExecute(ctx, cmd) {
    if (typeof cmd.roofId !== "string" || cmd.roofId.length === 0) {
      return { valid: false, reason: "roofId must be a non-empty string" };
    }
    if (!ctx.stores.roof[cmd.roofId]) {
      return { valid: false, reason: `roof not found: ${cmd.roofId}` };
    }
    const parsed = Skylight.safeParse(cmd.skylight);
    if (!parsed.success) {
      return { valid: false, reason: parsed.error.message };
    }
    const roof = ctx.stores.roof[cmd.roofId];
    if (roof && roof.skylights.some((s) => s.id === cmd.skylight.id)) {
      return { valid: false, reason: `skylight id already exists on roof: ${cmd.skylight.id}` };
    }
    return { valid: true };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      const roof = ctx.stores.roof[cmd.roofId];
      if (!roof) throw new RoofNotFoundError(cmd.roofId);
      const parsed = Skylight.safeParse(cmd.skylight);
      if (!parsed.success) throw new RoofSchemaError(parsed.error.message);
      const [next, forward, inverse] = produceCommand(ctx.stores.roof, (draft) => {
        const d = draft[cmd.roofId];
        if (d) d.skylights = [...d.skylights, parsed.data];
      });
      return { forward, inverse, nextStates: { roof: next } };
    });
  }
}

class RemoveSkylightHandler {
  type = "roof.removeSkylight";
  affectedStores = ["roof"];
  canExecute(ctx, cmd) {
    if (typeof cmd.roofId !== "string" || cmd.roofId.length === 0) {
      return { valid: false, reason: "roofId must be a non-empty string" };
    }
    if (typeof cmd.skylightId !== "string" || cmd.skylightId.length === 0) {
      return { valid: false, reason: "skylightId must be a non-empty string" };
    }
    const roof = ctx.stores.roof[cmd.roofId];
    if (!roof) {
      return { valid: false, reason: `roof not found: ${cmd.roofId}` };
    }
    if (!roof.skylights.some((s) => s.id === cmd.skylightId)) {
      return { valid: false, reason: `skylight not found on roof: ${cmd.skylightId}` };
    }
    return { valid: true };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      const roof = ctx.stores.roof[cmd.roofId];
      if (!roof) throw new RoofNotFoundError(cmd.roofId);
      const [next, forward, inverse] = produceCommand(ctx.stores.roof, (draft) => {
        const d = draft[cmd.roofId];
        if (d) d.skylights = d.skylights.filter((s) => s.id !== cmd.skylightId);
      });
      return { forward, inverse, nextStates: { roof: next } };
    });
  }
}

class JoinRoofsHandler {
  type = "roof.joinRoofs";
  affectedStores = ["roof"];
  canExecute(ctx, cmd) {
    if (typeof cmd.sourceId !== "string" || cmd.sourceId.length === 0) {
      return { valid: false, reason: "sourceId must be a non-empty string" };
    }
    if (typeof cmd.targetId !== "string" || cmd.targetId.length === 0) {
      return { valid: false, reason: "targetId must be a non-empty string" };
    }
    if (cmd.sourceId === cmd.targetId) {
      return { valid: false, reason: "sourceId and targetId must differ" };
    }
    if (!ctx.stores.roof[cmd.sourceId]) {
      return { valid: false, reason: `roof not found: ${cmd.sourceId}` };
    }
    if (!ctx.stores.roof[cmd.targetId]) {
      return { valid: false, reason: `roof not found: ${cmd.targetId}` };
    }
    const src = ctx.stores.roof[cmd.sourceId];
    if (src && src.joinedToRoofIds.includes(cmd.targetId)) {
      return { valid: false, reason: `roofs already joined: ${cmd.sourceId} ↔ ${cmd.targetId}` };
    }
    return { valid: true };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      if (!ctx.stores.roof[cmd.sourceId]) throw new RoofNotFoundError(cmd.sourceId);
      if (!ctx.stores.roof[cmd.targetId]) throw new RoofNotFoundError(cmd.targetId);
      const [next, forward, inverse] = produceCommand(ctx.stores.roof, (draft) => {
        const src = draft[cmd.sourceId];
        const tgt = draft[cmd.targetId];
        if (src && !src.joinedToRoofIds.includes(cmd.targetId)) {
          src.joinedToRoofIds = [...src.joinedToRoofIds, cmd.targetId];
        }
        if (tgt && !tgt.joinedToRoofIds.includes(cmd.sourceId)) {
          tgt.joinedToRoofIds = [...tgt.joinedToRoofIds, cmd.sourceId];
        }
      });
      return { forward, inverse, nextStates: { roof: next } };
    });
  }
}

const ROOF_MATERIAL_UNREACHABLE = "It writes the plugin DTO store, which is a FRESH instance built by PluginRegistry and is read by no renderer, no 2-D projector, no IFC exporter and no persistence path — only `<family>.created` is ever mirrored to the geometry store, never updates (§FIX-MATERIAL-DEAD-DISPATCH). Use `roof.update` instead — it reaches the geometry record the builders read.";
class SetRoofMaterialHandler {
  type = "roof.setMaterial";
  affectedStores = ["roof"];
  canExecute(ctx, cmd) {
    if (typeof cmd.roofId !== "string" || cmd.roofId.length === 0) {
      return { valid: false, reason: "roofId must be a non-empty string" };
    }
    if (cmd.materialId === void 0 && cmd.materialColor === void 0) {
      return { valid: false, reason: "at least one of materialId / materialColor must be provided" };
    }
    if (cmd.materialColor !== void 0 && cmd.materialColor.length === 0) {
      return { valid: false, reason: "materialColor must be non-empty when provided" };
    }
    if (cmd.materialId !== void 0 && cmd.materialId !== null && cmd.materialId.length === 0) {
      return { valid: false, reason: "materialId must be non-empty when provided" };
    }
    if (!ctx.stores.roof[cmd.roofId]) {
      return { valid: false, reason: `roof not found: ${cmd.roofId}` };
    }
    return { valid: false, reason: ROOF_MATERIAL_UNREACHABLE };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      if (!ctx.stores.roof[cmd.roofId]) throw new RoofNotFoundError(cmd.roofId);
      const [next, forward, inverse] = produceCommand(ctx.stores.roof, (draft) => {
        const r = draft[cmd.roofId];
        if (!r) return;
        if (cmd.materialId === null) delete r.materialId;
        else if (cmd.materialId !== void 0) r.materialId = cmd.materialId;
        if (cmd.materialColor !== void 0) r.materialColor = cmd.materialColor;
      });
      return { forward, inverse, nextStates: { roof: next } };
    });
  }
}

function buildRoofHandlerSet() {
  return [
    new CreateRoofHandler(),
    new DeleteRoofHandler(),
    new SetRoofShapeHandler(),
    new SetRoofPitchHandler(),
    new SetRoofThicknessHandler(),
    new SetRoofOverhangHandler(),
    new MoveRoofHandler(),
    new ChangeRoofLevelHandler(),
    new AddSkylightHandler(),
    new RemoveSkylightHandler(),
    new JoinRoofsHandler(),
    // §FIX-ROOF-UPDATE-REACH-RECORD — UpdateRoofHandler retired (see the
    // ROOF_HANDLER_TYPES note); the initBusHandlers bridge owns the verb.
    new SetRoofMaterialHandler()
  ];
}

class CurtainWallStore extends Store {
  constructor() {
    super("curtainwall");
  }
  ids() {
    return [...this.state.keys()];
  }
  byLevel(levelId) {
    const out = [];
    for (const cw of this.state.values()) if (cw.levelId === levelId) out.push(cw);
    return out;
  }
  get(id) {
    return this.state.get(id);
  }
}

class CurtainWallSystemError extends Error {
  constructor(message) {
    super(message);
    this.name = "CurtainWallSystemError";
  }
}
class CurtainWallNotFoundError extends CurtainWallSystemError {
  constructor(curtainWallId) {
    super(`CurtainWall not found: ${curtainWallId}`);
    this.curtainWallId = curtainWallId;
    this.name = "CurtainWallNotFoundError";
  }
  curtainWallId;
}
class CurtainWallSchemaError extends CurtainWallSystemError {
  constructor(cause) {
    super(`CurtainWall schema validation failed: ${String(cause?.message ?? cause)}`);
    this.cause = cause;
    this.name = "CurtainWallSchemaError";
  }
  cause;
}
class CurtainWallGeometryError extends CurtainWallSystemError {
  constructor(reason) {
    super(`Invalid curtain-wall geometry: ${reason}`);
    this.name = "CurtainWallGeometryError";
  }
}
class CurtainWallPanelNotFoundError extends CurtainWallSystemError {
  constructor(curtainWallId, panelId) {
    super(`Curtain-wall ${curtainWallId} has no panel ${panelId}`);
    this.curtainWallId = curtainWallId;
    this.panelId = panelId;
    this.name = "CurtainWallPanelNotFoundError";
  }
  curtainWallId;
  panelId;
}
class InvalidGridCoordinateError extends CurtainWallSystemError {
  constructor(curtainWallId, row, col, reason) {
    super(`Invalid grid coordinate (${row},${col}) on curtain-wall ${curtainWallId}: ${reason}`);
    this.curtainWallId = curtainWallId;
    this.row = row;
    this.col = col;
    this.reason = reason;
    this.name = "InvalidGridCoordinateError";
  }
  curtainWallId;
  row;
  col;
  reason;
}
class CurtainWallPanelOverlapError extends CurtainWallSystemError {
  constructor(curtainWallId, row, col) {
    super(`Curtain-wall ${curtainWallId} already has a panel at cell (${row},${col})`);
    this.curtainWallId = curtainWallId;
    this.row = row;
    this.col = col;
    this.name = "CurtainWallPanelOverlapError";
  }
  curtainWallId;
  row;
  col;
}

function isFiniteVec3$b(p) {
  return !!p && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z);
}
function isNonZeroBaseLine$1(a, b) {
  return a.x !== b.x || a.y !== b.y || a.z !== b.z;
}
function baseLineLength(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
}
function computeIntentGrid(cw) {
  const length = baseLineLength(cw.baseLine[0], cw.baseLine[1]) || 1;
  const cols = [0];
  let x = cw.bayWidth;
  while (x < length - 1e-6) {
    cols.push(x);
    x += cw.bayWidth;
  }
  cols.push(length);
  const rows = [0];
  let y = cw.bayHeight;
  while (y < cw.height - 1e-6) {
    rows.push(y);
    y += cw.bayHeight;
  }
  rows.push(cw.height);
  return { cols, rows };
}
const DEFAULT_MULLION_EDGE_TOLERANCE_M = 0.04;
class CurtainWallIntentResolver {
  cwById;
  tol;
  constructor(walls, opts = {}) {
    this.cwById = walls instanceof Map ? walls : new Map(Object.entries(walls));
    this.tol = opts.mullionEdgeToleranceM ?? DEFAULT_MULLION_EDGE_TOLERANCE_M;
  }
  /** Returns the (row, col) cell containing `projected`, or null if out
   *  of grid range.  `projected.x` = distance along baseline, `projected.y`
   *  = height up from baseline.y. */
  resolvePanelCell(cwId, projected) {
    const cw = this.cwById.get(cwId);
    if (!cw) return null;
    const grid = computeIntentGrid(cw);
    const col = findCellIndex(grid.cols, projected.x);
    const row = findCellIndex(grid.rows, projected.y);
    if (col === -1 || row === -1) return null;
    return { row, col };
  }
  /** Disambiguates panel/mullion/transom intent for `projected`.  Mullion
   *  is preferred when `projected` is within `mullionEdgeToleranceM` of
   *  any vertical grid line; transom likewise for horizontal lines.
   *  When both edge tolerances overlap (an intersection point), the
   *  shorter Euclidean distance wins; ties resolve to mullion. */
  resolveSegmentIntent(cwId, projected) {
    const cw = this.cwById.get(cwId);
    if (!cw) return null;
    const grid = computeIntentGrid(cw);
    const mIdx = nearestLineWithin(grid.cols, projected.x, this.tol);
    const tIdx = nearestLineWithin(grid.rows, projected.y, this.tol);
    if (mIdx !== -1 && tIdx !== -1) {
      const dM = Math.abs(grid.cols[mIdx] - projected.x);
      const dT = Math.abs(grid.rows[tIdx] - projected.y);
      if (dT < dM) return { kind: "transom", orientation: "horizontal", index: tIdx };
      return { kind: "mullion", orientation: "vertical", index: mIdx };
    }
    if (mIdx !== -1) return { kind: "mullion", orientation: "vertical", index: mIdx };
    if (tIdx !== -1) return { kind: "transom", orientation: "horizontal", index: tIdx };
    const cell = this.resolvePanelCell(cwId, projected);
    if (!cell) return null;
    return { kind: "panel", row: cell.row, col: cell.col };
  }
  /** Used by AddPanel handler entry point — ensures grid coords are valid
   *  (row/col are in-range integers) and not occupied by an existing panel. */
  validateGridCoordinate(cwId, row, col) {
    const cw = this.cwById.get(cwId);
    if (!cw) return { ok: false, reason: "out-of-range" };
    if (!Number.isInteger(row) || !Number.isInteger(col) || row < 0 || col < 0) {
      return { ok: false, reason: "out-of-range" };
    }
    const grid = computeIntentGrid(cw);
    const maxRow = grid.rows.length - 1;
    const maxCol = grid.cols.length - 1;
    if (row >= maxRow || col >= maxCol) return { ok: false, reason: "out-of-range" };
    if (cw.panels.some((p) => p.row === row && p.col === col)) {
      return { ok: false, reason: "overlaps-existing" };
    }
    return { ok: true };
  }
  /** Number of grid cells (rows × cols) for a curtain wall — convenience
   *  for tools that need to pre-allocate panel arrays. */
  cellCount(cwId) {
    const cw = this.cwById.get(cwId);
    if (!cw) return null;
    const grid = computeIntentGrid(cw);
    return { rows: grid.rows.length - 1, cols: grid.cols.length - 1 };
  }
}
function findCellIndex(lines, v) {
  if (v < lines[0] || v >= lines[lines.length - 1]) return -1;
  for (let i = 0; i < lines.length - 1; i++) {
    if (v >= lines[i] && v < lines[i + 1]) return i;
  }
  return -1;
}
function nearestLineWithin(lines, v, tol) {
  let best = -1;
  let bestDist = tol;
  for (let i = 0; i < lines.length; i++) {
    const d = Math.abs(lines[i] - v);
    if (d <= bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}

class CreateCurtainWallHandler {
  type = "curtain-wall.create";
  /** §FIX-COMMAND-NAMESPACE (L-796) — deprecated pre-migration spelling. */
  aliases = ["curtainwall.create"];
  affectedStores = ["curtainwall"];
  canExecute(_ctx, cmd) {
    if (cmd.baseLine !== void 0) {
      const [a, b] = cmd.baseLine;
      if (!isFiniteVec3$b(a) || !isFiniteVec3$b(b)) {
        return { valid: false, reason: "baseLine endpoints must be finite Vec3" };
      }
      if (!isNonZeroBaseLine$1(a, b)) {
        return { valid: false, reason: "baseLine endpoints must differ" };
      }
    }
    for (const k of ["height", "mullionThickness", "bayWidth", "bayHeight", "panelThickness"]) {
      const v = cmd[k];
      if (v !== void 0 && (!Number.isFinite(v) || v <= 0)) {
        return { valid: false, reason: `${k} must be > 0` };
      }
    }
    if (cmd.baseOffset !== void 0 && !Number.isFinite(cmd.baseOffset)) {
      return { valid: false, reason: "baseOffset must be finite" };
    }
    if (cmd.panels) {
      const ids = /* @__PURE__ */ new Set();
      for (let i = 0; i < cmd.panels.length; i++) {
        const p = cmd.panels[i];
        if (typeof p.id !== "string" || p.id.length === 0) {
          return { valid: false, reason: `panels[${i}].id must be a non-empty string` };
        }
        if (ids.has(p.id)) return { valid: false, reason: `duplicate panel id: ${p.id}` };
        ids.add(p.id);
      }
    }
    return { valid: true };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      const id = cmd.id ?? createId("curtainwall");
      const seed = {
        id,
        levelId: cmd.levelId ?? "",
        height: cmd.height ?? 3,
        baseOffset: cmd.baseOffset ?? 0,
        mullionThickness: cmd.mullionThickness ?? 0.05,
        panelThickness: cmd.panelThickness ?? 0.05,
        bayWidth: cmd.bayWidth ?? 1.2,
        bayHeight: cmd.bayHeight ?? 1.5,
        panels: cmd.panels ?? [],
        materialId: cmd.materialId ?? cmd.systemTypeId
      };
      if (cmd.baseLine) seed.baseLine = cmd.baseLine;
      if (seed.baseLine && !isNonZeroBaseLine$1(seed.baseLine[0], seed.baseLine[1])) {
        throw new CurtainWallGeometryError("baseLine endpoints must differ");
      }
      let cw;
      try {
        cw = CurtainWall.parse(seed);
      } catch (err) {
        throw new CurtainWallSchemaError(err);
      }
      const [next, forward, inverse] = produceCommand(ctx.stores.curtainwall, (draft) => {
        draft[cw.id] = cw;
      });
      return { forward, inverse, nextStates: { curtainwall: next } };
    });
  }
}

class DeleteCurtainWallHandler {
  type = "curtain-wall.delete";
  /** §FIX-COMMAND-NAMESPACE (L-796) — deprecated pre-migration spelling. */
  aliases = ["curtainwall.delete"];
  affectedStores = ["curtainwall"];
  canExecute(ctx, cmd) {
    if (typeof cmd.curtainWallId !== "string" || cmd.curtainWallId.length === 0) {
      return { valid: false, reason: "curtainWallId must be a non-empty string" };
    }
    if (!ctx.stores.curtainwall[cmd.curtainWallId]) {
      return { valid: false, reason: `curtain wall not found: ${cmd.curtainWallId}` };
    }
    return { valid: true };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      if (!ctx.stores.curtainwall[cmd.curtainWallId]) throw new CurtainWallNotFoundError(cmd.curtainWallId);
      const [next, forward, inverse] = produceCommand(ctx.stores.curtainwall, (draft) => {
        delete draft[cmd.curtainWallId];
      });
      return { forward, inverse, nextStates: { curtainwall: next } };
    });
  }
}

class MoveCurtainWallHandler {
  type = "curtain-wall.move";
  /** §FIX-COMMAND-NAMESPACE (L-796) — deprecated pre-migration spelling. */
  aliases = ["curtainwall.move"];
  affectedStores = ["curtainwall"];
  canExecute(ctx, cmd) {
    if (typeof cmd.curtainWallId !== "string" || cmd.curtainWallId.length === 0) {
      return { valid: false, reason: "curtainWallId must be a non-empty string" };
    }
    if (!cmd.delta || !Number.isFinite(cmd.delta.x) || !Number.isFinite(cmd.delta.y) || !Number.isFinite(cmd.delta.z)) {
      return { valid: false, reason: "delta must have finite x, y, z" };
    }
    if (!ctx.stores.curtainwall[cmd.curtainWallId]) {
      return { valid: false, reason: `curtain wall not found: ${cmd.curtainWallId}` };
    }
    return { valid: true };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      if (!ctx.stores.curtainwall[cmd.curtainWallId]) throw new CurtainWallNotFoundError(cmd.curtainWallId);
      const [next, forward, inverse] = produceCommand(ctx.stores.curtainwall, (draft) => {
        const cw = draft[cmd.curtainWallId];
        if (!cw) return;
        for (const p of cw.baseLine) {
          p.x += cmd.delta.x;
          p.y += cmd.delta.y;
          p.z += cmd.delta.z;
        }
      });
      return { forward, inverse, nextStates: { curtainwall: next } };
    });
  }
}

class SetCurtainWallGridHandler {
  type = "curtain-wall.setGrid";
  /** §FIX-COMMAND-NAMESPACE (L-796) — deprecated pre-migration spelling. */
  aliases = ["curtainwall.setGrid"];
  affectedStores = ["curtainwall"];
  canExecute(ctx, cmd) {
    if (typeof cmd.curtainWallId !== "string" || cmd.curtainWallId.length === 0) {
      return { valid: false, reason: "curtainWallId must be a non-empty string" };
    }
    if (cmd.bayWidth !== void 0 && (!Number.isFinite(cmd.bayWidth) || cmd.bayWidth <= 0)) {
      return { valid: false, reason: "bayWidth must be > 0" };
    }
    if (cmd.bayHeight !== void 0 && (!Number.isFinite(cmd.bayHeight) || cmd.bayHeight <= 0)) {
      return { valid: false, reason: "bayHeight must be > 0" };
    }
    if (cmd.bayWidth === void 0 && cmd.bayHeight === void 0) {
      return { valid: false, reason: "must specify at least one of bayWidth or bayHeight" };
    }
    if (!ctx.stores.curtainwall[cmd.curtainWallId]) {
      return { valid: false, reason: `curtain wall not found: ${cmd.curtainWallId}` };
    }
    return { valid: true };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      if (!ctx.stores.curtainwall[cmd.curtainWallId]) throw new CurtainWallNotFoundError(cmd.curtainWallId);
      if (cmd.bayWidth !== void 0 && cmd.bayWidth <= 0 || cmd.bayHeight !== void 0 && cmd.bayHeight <= 0) {
        throw new CurtainWallGeometryError("bay dimensions must be > 0");
      }
      const [next, forward, inverse] = produceCommand(ctx.stores.curtainwall, (draft) => {
        const cw = draft[cmd.curtainWallId];
        if (!cw) return;
        if (cmd.bayWidth !== void 0) cw.bayWidth = cmd.bayWidth;
        if (cmd.bayHeight !== void 0) cw.bayHeight = cmd.bayHeight;
      });
      return { forward, inverse, nextStates: { curtainwall: next } };
    });
  }
}

class SetCurtainWallMullionTypeHandler {
  type = "curtain-wall.setMullionType";
  /** §FIX-COMMAND-NAMESPACE (L-796) — deprecated pre-migration spelling. */
  aliases = ["curtainwall.setMullionType"];
  affectedStores = ["curtainwall"];
  canExecute(ctx, cmd) {
    if (typeof cmd.curtainWallId !== "string" || cmd.curtainWallId.length === 0) {
      return { valid: false, reason: "curtainWallId must be a non-empty string" };
    }
    if (cmd.thickness !== void 0 && (!Number.isFinite(cmd.thickness) || cmd.thickness <= 0)) {
      return { valid: false, reason: "thickness must be > 0" };
    }
    if (cmd.systemTypeId === void 0 && cmd.thickness === void 0 && cmd.materialId === void 0) {
      return { valid: false, reason: "must specify at least one of systemTypeId, thickness, or materialId" };
    }
    if (!ctx.stores.curtainwall[cmd.curtainWallId]) {
      return { valid: false, reason: `curtain wall not found: ${cmd.curtainWallId}` };
    }
    return { valid: true };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      if (!ctx.stores.curtainwall[cmd.curtainWallId]) throw new CurtainWallNotFoundError(cmd.curtainWallId);
      if (cmd.thickness !== void 0 && cmd.thickness <= 0) {
        throw new CurtainWallGeometryError("mullion thickness must be > 0");
      }
      const [next, forward, inverse] = produceCommand(ctx.stores.curtainwall, (draft) => {
        const cw = draft[cmd.curtainWallId];
        if (!cw) return;
        if (cmd.thickness !== void 0) cw.mullionThickness = cmd.thickness;
        if (cmd.materialId !== void 0) cw.materialId = cmd.materialId;
        else if (cmd.systemTypeId !== void 0) cw.materialId = cmd.systemTypeId;
      });
      return { forward, inverse, nextStates: { curtainwall: next } };
    });
  }
}

class SetCurtainWallTransomTypeHandler {
  type = "curtain-wall.setTransomType";
  /** §FIX-COMMAND-NAMESPACE (L-796) — deprecated pre-migration spelling. */
  aliases = ["curtainwall.setTransomType"];
  affectedStores = ["curtainwall"];
  canExecute(ctx, cmd) {
    if (typeof cmd.curtainWallId !== "string" || cmd.curtainWallId.length === 0) {
      return { valid: false, reason: "curtainWallId must be a non-empty string" };
    }
    if (cmd.thickness !== void 0 && (!Number.isFinite(cmd.thickness) || cmd.thickness <= 0)) {
      return { valid: false, reason: "thickness must be > 0" };
    }
    if (cmd.systemTypeId === void 0 && cmd.thickness === void 0 && cmd.materialId === void 0) {
      return { valid: false, reason: "must specify at least one of systemTypeId, thickness, or materialId" };
    }
    if (!ctx.stores.curtainwall[cmd.curtainWallId]) {
      return { valid: false, reason: `curtain wall not found: ${cmd.curtainWallId}` };
    }
    return { valid: true };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      if (!ctx.stores.curtainwall[cmd.curtainWallId]) throw new CurtainWallNotFoundError(cmd.curtainWallId);
      if (cmd.thickness !== void 0 && cmd.thickness <= 0) {
        throw new CurtainWallGeometryError("transom thickness must be > 0");
      }
      const [next, forward, inverse] = produceCommand(ctx.stores.curtainwall, (draft) => {
        const cw = draft[cmd.curtainWallId];
        if (!cw) return;
        if (cmd.thickness !== void 0) cw.mullionThickness = cmd.thickness;
        if (cmd.materialId !== void 0) cw.materialId = cmd.materialId;
        else if (cmd.systemTypeId !== void 0) cw.materialId = cmd.systemTypeId;
      });
      return { forward, inverse, nextStates: { curtainwall: next } };
    });
  }
}

class SetCurtainWallPanelTypeHandler {
  type = "curtain-wall.setPanelType";
  /** §FIX-COMMAND-NAMESPACE (L-796) — deprecated pre-migration spelling. */
  aliases = ["curtainwall.setPanelType"];
  affectedStores = ["curtainwall"];
  canExecute(ctx, cmd) {
    if (typeof cmd.curtainWallId !== "string" || cmd.curtainWallId.length === 0) {
      return { valid: false, reason: "curtainWallId must be a non-empty string" };
    }
    if (typeof cmd.panelId !== "string" || cmd.panelId.length === 0) {
      return { valid: false, reason: "panelId must be a non-empty string" };
    }
    const cw = ctx.stores.curtainwall[cmd.curtainWallId];
    if (!cw) return { valid: false, reason: `curtain wall not found: ${cmd.curtainWallId}` };
    const exists = cw.panels.some((p) => p.id === cmd.panelId);
    if (!exists && !cmd.upsertAt) {
      return { valid: false, reason: `panel not found: ${cmd.panelId} (provide upsertAt to create)` };
    }
    if (cmd.upsertAt && (!Number.isInteger(cmd.upsertAt.row) || cmd.upsertAt.row < 0 || !Number.isInteger(cmd.upsertAt.col) || cmd.upsertAt.col < 0)) {
      return { valid: false, reason: "upsertAt.row and upsertAt.col must be non-negative integers" };
    }
    return { valid: true };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      const cw = ctx.stores.curtainwall[cmd.curtainWallId];
      if (!cw) throw new CurtainWallNotFoundError(cmd.curtainWallId);
      const exists = cw.panels.some((p) => p.id === cmd.panelId);
      if (!exists && !cmd.upsertAt) {
        throw new CurtainWallPanelNotFoundError(cmd.curtainWallId, cmd.panelId);
      }
      const [next, forward, inverse] = produceCommand(ctx.stores.curtainwall, (draft) => {
        const c = draft[cmd.curtainWallId];
        if (!c) return;
        const idx = c.panels.findIndex((p) => p.id === cmd.panelId);
        if (idx === -1) {
          c.panels.push({
            id: cmd.panelId,
            row: cmd.upsertAt.row,
            col: cmd.upsertAt.col,
            kind: cmd.kind ?? "glazed",
            rotation: 0,
            materialId: cmd.materialId
          });
        } else {
          const p = c.panels[idx];
          if (cmd.kind !== void 0) p.kind = cmd.kind;
          if (cmd.materialId !== void 0) p.materialId = cmd.materialId;
        }
      });
      return { forward, inverse, nextStates: { curtainwall: next } };
    });
  }
}

class SetCurtainWallOutlineHandler {
  type = "curtain-wall.setOutline";
  /** §FIX-COMMAND-NAMESPACE (L-796) — deprecated pre-migration spelling. */
  aliases = ["curtainwall.setOutline"];
  affectedStores = ["curtainwall"];
  canExecute(ctx, cmd) {
    if (typeof cmd.curtainWallId !== "string" || cmd.curtainWallId.length === 0) {
      return { valid: false, reason: "curtainWallId must be a non-empty string" };
    }
    if (cmd.baseLine !== void 0) {
      const [a, b] = cmd.baseLine;
      if (!isFiniteVec3$b(a) || !isFiniteVec3$b(b)) {
        return { valid: false, reason: "baseLine endpoints must be finite Vec3" };
      }
      if (!isNonZeroBaseLine$1(a, b)) {
        return { valid: false, reason: "baseLine endpoints must differ" };
      }
    }
    if (cmd.height !== void 0 && (!Number.isFinite(cmd.height) || cmd.height <= 0)) {
      return { valid: false, reason: "height must be > 0" };
    }
    if (cmd.baseLine === void 0 && cmd.height === void 0) {
      return { valid: false, reason: "must specify at least one of baseLine or height" };
    }
    if (!ctx.stores.curtainwall[cmd.curtainWallId]) {
      return { valid: false, reason: `curtain wall not found: ${cmd.curtainWallId}` };
    }
    return { valid: true };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      if (!ctx.stores.curtainwall[cmd.curtainWallId]) throw new CurtainWallNotFoundError(cmd.curtainWallId);
      if (cmd.height !== void 0 && cmd.height <= 0) {
        throw new CurtainWallGeometryError("height must be > 0");
      }
      const [next, forward, inverse] = produceCommand(ctx.stores.curtainwall, (draft) => {
        const cw = draft[cmd.curtainWallId];
        if (!cw) return;
        if (cmd.baseLine) {
          cw.baseLine = [
            { x: cmd.baseLine[0].x, y: cmd.baseLine[0].y, z: cmd.baseLine[0].z },
            { x: cmd.baseLine[1].x, y: cmd.baseLine[1].y, z: cmd.baseLine[1].z }
          ];
        }
        if (cmd.height !== void 0) cw.height = cmd.height;
      });
      return { forward, inverse, nextStates: { curtainwall: next } };
    });
  }
}

class ResizeCurtainWallHandler {
  type = "curtain-wall.resize";
  /** §FIX-COMMAND-NAMESPACE (L-796) — deprecated pre-migration spelling. */
  aliases = ["curtainwall.resize"];
  affectedStores = ["curtainwall"];
  canExecute(ctx, cmd) {
    if (typeof cmd.curtainWallId !== "string" || cmd.curtainWallId.length === 0) {
      return { valid: false, reason: "curtainWallId must be a non-empty string" };
    }
    if (cmd.length !== void 0 && (!Number.isFinite(cmd.length) || cmd.length <= 0)) {
      return { valid: false, reason: "length must be > 0" };
    }
    if (cmd.height !== void 0 && (!Number.isFinite(cmd.height) || cmd.height <= 0)) {
      return { valid: false, reason: "height must be > 0" };
    }
    if (cmd.length === void 0 && cmd.height === void 0) {
      return { valid: false, reason: "must specify at least one of length or height" };
    }
    if (!ctx.stores.curtainwall[cmd.curtainWallId]) {
      return { valid: false, reason: `curtain wall not found: ${cmd.curtainWallId}` };
    }
    return { valid: true };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      const cw = ctx.stores.curtainwall[cmd.curtainWallId];
      if (!cw) throw new CurtainWallNotFoundError(cmd.curtainWallId);
      if (cmd.length !== void 0 && cmd.length <= 0 || cmd.height !== void 0 && cmd.height <= 0) {
        throw new CurtainWallGeometryError("dimensions must be > 0");
      }
      const [next, forward, inverse] = produceCommand(ctx.stores.curtainwall, (draft) => {
        const c = draft[cmd.curtainWallId];
        if (!c) return;
        if (cmd.length !== void 0) {
          const [a, b] = c.baseLine;
          const cur = baseLineLength(a, b);
          if (cur > 0) {
            const k = cmd.length / cur;
            c.baseLine[1] = {
              x: a.x + (b.x - a.x) * k,
              y: a.y + (b.y - a.y) * k,
              z: a.z + (b.z - a.z) * k
            };
          }
        }
        if (cmd.height !== void 0) c.height = cmd.height;
      });
      return { forward, inverse, nextStates: { curtainwall: next } };
    });
  }
}

function mintPanelId() {
  return `panel_${ulid()}`;
}
class AddPanelHandler {
  type = "curtain-wall.addPanel";
  /** §FIX-COMMAND-NAMESPACE (L-796) — deprecated pre-migration spelling. */
  aliases = ["curtainwall.addPanel"];
  affectedStores = ["curtainwall"];
  canExecute(ctx, cmd) {
    if (typeof cmd.curtainWallId !== "string" || cmd.curtainWallId.length === 0) {
      return { valid: false, reason: "curtainWallId must be a non-empty string" };
    }
    const cw = ctx.stores.curtainwall[cmd.curtainWallId];
    if (!cw) return { valid: false, reason: `curtain wall not found: ${cmd.curtainWallId}` };
    const resolver = new CurtainWallIntentResolver(ctx.stores.curtainwall);
    const v = resolver.validateGridCoordinate(cmd.curtainWallId, cmd.row, cmd.col);
    if (!v.ok) {
      return {
        valid: false,
        reason: v.reason === "overlaps-existing" ? `panel already exists at (${cmd.row},${cmd.col})` : `(${cmd.row},${cmd.col}) is outside the curtain-wall grid`
      };
    }
    return { valid: true };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      const cw = ctx.stores.curtainwall[cmd.curtainWallId];
      if (!cw) throw new CurtainWallNotFoundError(cmd.curtainWallId);
      const resolver = new CurtainWallIntentResolver(ctx.stores.curtainwall);
      const v = resolver.validateGridCoordinate(cmd.curtainWallId, cmd.row, cmd.col);
      if (!v.ok) {
        if (v.reason === "overlaps-existing") {
          throw new CurtainWallPanelOverlapError(cmd.curtainWallId, cmd.row, cmd.col);
        }
        throw new InvalidGridCoordinateError(cmd.curtainWallId, cmd.row, cmd.col, v.reason);
      }
      const panelId = cmd.panelId ?? mintPanelId();
      const [next, forward, inverse] = produceCommand(
        ctx.stores.curtainwall,
        (draft) => {
          const c = draft[cmd.curtainWallId];
          if (!c) return;
          c.panels.push({
            id: panelId,
            row: cmd.row,
            col: cmd.col,
            kind: cmd.kind ?? "glazed",
            materialId: cmd.materialId ?? cmd.panelTypeId,
            rotation: cmd.rotation ?? 0
          });
        }
      );
      return { forward, inverse, nextStates: { curtainwall: next } };
    });
  }
}

class RemovePanelHandler {
  type = "curtain-wall.removePanel";
  /** §FIX-COMMAND-NAMESPACE (L-796) — deprecated pre-migration spelling. */
  aliases = ["curtainwall.removePanel"];
  affectedStores = ["curtainwall"];
  canExecute(ctx, cmd) {
    if (typeof cmd.curtainWallId !== "string" || cmd.curtainWallId.length === 0) {
      return { valid: false, reason: "curtainWallId must be a non-empty string" };
    }
    if (typeof cmd.panelId !== "string" || cmd.panelId.length === 0) {
      return { valid: false, reason: "panelId must be a non-empty string" };
    }
    const cw = ctx.stores.curtainwall[cmd.curtainWallId];
    if (!cw) return { valid: false, reason: `curtain wall not found: ${cmd.curtainWallId}` };
    if (!cw.panels.some((p) => p.id === cmd.panelId)) {
      return { valid: false, reason: `panel not found: ${cmd.panelId}` };
    }
    return { valid: true };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      const cw = ctx.stores.curtainwall[cmd.curtainWallId];
      if (!cw) throw new CurtainWallNotFoundError(cmd.curtainWallId);
      if (!cw.panels.some((p) => p.id === cmd.panelId)) {
        throw new CurtainWallPanelNotFoundError(cmd.curtainWallId, cmd.panelId);
      }
      const [next, forward, inverse] = produceCommand(
        ctx.stores.curtainwall,
        (draft) => {
          const c = draft[cmd.curtainWallId];
          if (!c) return;
          const idx = c.panels.findIndex((p) => p.id === cmd.panelId);
          if (idx !== -1) c.panels.splice(idx, 1);
        }
      );
      return { forward, inverse, nextStates: { curtainwall: next } };
    });
  }
}

class SwapPanelHandler {
  type = "curtain-wall.swapPanel";
  /** §FIX-COMMAND-NAMESPACE (L-796) — deprecated pre-migration spelling. */
  aliases = ["curtainwall.swapPanel"];
  affectedStores = ["curtainwall"];
  canExecute(ctx, cmd) {
    if (typeof cmd.curtainWallId !== "string" || cmd.curtainWallId.length === 0) {
      return { valid: false, reason: "curtainWallId must be a non-empty string" };
    }
    if (typeof cmd.panelId !== "string" || cmd.panelId.length === 0) {
      return { valid: false, reason: "panelId must be a non-empty string" };
    }
    const cw = ctx.stores.curtainwall[cmd.curtainWallId];
    if (!cw) return { valid: false, reason: `curtain wall not found: ${cmd.curtainWallId}` };
    if (!cw.panels.some((p) => p.id === cmd.panelId)) {
      return { valid: false, reason: `panel not found: ${cmd.panelId}` };
    }
    if (cmd.kind === void 0 && cmd.materialId === void 0 && cmd.panelTypeId === void 0) {
      return { valid: false, reason: "SwapPanel requires at least one of kind/materialId/panelTypeId" };
    }
    return { valid: true };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      const cw = ctx.stores.curtainwall[cmd.curtainWallId];
      if (!cw) throw new CurtainWallNotFoundError(cmd.curtainWallId);
      if (!cw.panels.some((p) => p.id === cmd.panelId)) {
        throw new CurtainWallPanelNotFoundError(cmd.curtainWallId, cmd.panelId);
      }
      const [next, forward, inverse] = produceCommand(
        ctx.stores.curtainwall,
        (draft) => {
          const c = draft[cmd.curtainWallId];
          if (!c) return;
          const p = c.panels.find((q) => q.id === cmd.panelId);
          if (!p) return;
          if (cmd.kind !== void 0) p.kind = cmd.kind;
          if (cmd.materialId !== void 0) p.materialId = cmd.materialId;
          else if (cmd.panelTypeId !== void 0) p.materialId = cmd.panelTypeId;
        }
      );
      return { forward, inverse, nextStates: { curtainwall: next } };
    });
  }
}

const ALLOWED = /* @__PURE__ */ new Set([0, 90, 180, 270]);
function normalizeDelta(deltaDeg) {
  const m = (deltaDeg % 360 + 360) % 360;
  return m;
}
class RotatePanelHandler {
  type = "curtain-wall.rotatePanel";
  /** §FIX-COMMAND-NAMESPACE (L-796) — deprecated pre-migration spelling. */
  aliases = ["curtainwall.rotatePanel"];
  affectedStores = ["curtainwall"];
  canExecute(ctx, cmd) {
    if (typeof cmd.curtainWallId !== "string" || cmd.curtainWallId.length === 0) {
      return { valid: false, reason: "curtainWallId must be a non-empty string" };
    }
    if (typeof cmd.panelId !== "string" || cmd.panelId.length === 0) {
      return { valid: false, reason: "panelId must be a non-empty string" };
    }
    if (cmd.rotation !== void 0 && cmd.deltaDeg !== void 0) {
      return { valid: false, reason: "RotatePanel: provide rotation OR deltaDeg, not both" };
    }
    if (cmd.rotation === void 0 && cmd.deltaDeg === void 0) {
      return { valid: false, reason: "RotatePanel: rotation or deltaDeg required" };
    }
    if (cmd.rotation !== void 0 && !ALLOWED.has(cmd.rotation)) {
      return { valid: false, reason: "rotation must be 0, 90, 180, or 270" };
    }
    if (cmd.deltaDeg !== void 0 && (!Number.isFinite(cmd.deltaDeg) || cmd.deltaDeg % 90 !== 0)) {
      return { valid: false, reason: "deltaDeg must be a finite multiple of 90" };
    }
    const cw = ctx.stores.curtainwall[cmd.curtainWallId];
    if (!cw) return { valid: false, reason: `curtain wall not found: ${cmd.curtainWallId}` };
    if (!cw.panels.some((p) => p.id === cmd.panelId)) {
      return { valid: false, reason: `panel not found: ${cmd.panelId}` };
    }
    return { valid: true };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      const cw = ctx.stores.curtainwall[cmd.curtainWallId];
      if (!cw) throw new CurtainWallNotFoundError(cmd.curtainWallId);
      if (!cw.panels.some((p) => p.id === cmd.panelId)) {
        throw new CurtainWallPanelNotFoundError(cmd.curtainWallId, cmd.panelId);
      }
      const [next, forward, inverse] = produceCommand(
        ctx.stores.curtainwall,
        (draft) => {
          const c = draft[cmd.curtainWallId];
          if (!c) return;
          const p = c.panels.find((q) => q.id === cmd.panelId);
          if (!p) return;
          if (cmd.rotation !== void 0) {
            p.rotation = cmd.rotation;
          } else if (cmd.deltaDeg !== void 0) {
            const cur = p.rotation ?? 0;
            p.rotation = normalizeDelta(cur + cmd.deltaDeg);
          }
        }
      );
      return { forward, inverse, nextStates: { curtainwall: next } };
    });
  }
}

class CreateCurtainWallBatchHandler {
  type = "curtain-wall.batch.create";
  affectedStores = ["curtainwall"];
  canExecute(_ctx, cmd) {
    const walls = cmd.curtainWalls;
    if (walls === void 0 || walls.length === 0) {
      return { valid: true };
    }
    for (let i = 0; i < walls.length; i++) {
      const w = walls[i];
      if (w.baseLine !== void 0) {
        const [a, b] = w.baseLine;
        if (!isFiniteVec3$b(a) || !isFiniteVec3$b(b)) {
          return { valid: false, reason: `curtainWalls[${i}].baseLine endpoints must be finite Vec3` };
        }
        if (!isNonZeroBaseLine$1(a, b)) {
          return { valid: false, reason: `curtainWalls[${i}].baseLine endpoints must differ` };
        }
      }
      for (const k of ["height", "mullionThickness", "bayWidth", "bayHeight"]) {
        const v = w[k];
        if (v !== void 0 && (!Number.isFinite(v) || v <= 0)) {
          return { valid: false, reason: `curtainWalls[${i}].${k} must be > 0` };
        }
      }
      if (w.id !== void 0 && (typeof w.id !== "string" || w.id.length === 0)) {
        return { valid: false, reason: `curtainWalls[${i}].id must be a non-empty string when provided` };
      }
    }
    return { valid: true };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      const walls = cmd.curtainWalls;
      const defaultHeight = cmd.height ?? 3;
      if (!walls || walls.length === 0) {
        const [next2, forward2, inverse2] = produceCommand(
          ctx.stores.curtainwall,
          () => {
          }
        );
        return { forward: forward2, inverse: inverse2, nextStates: { curtainwall: next2 } };
      }
      const fresh = [];
      for (let i = 0; i < walls.length; i++) {
        const w = walls[i];
        const id = w.id ?? createId("curtainwall");
        const seed = {
          id,
          levelId: w.levelId ?? "",
          height: w.height ?? defaultHeight,
          mullionThickness: w.mullionThickness ?? 0.05,
          bayWidth: w.bayWidth ?? 1.2,
          bayHeight: w.bayHeight ?? 1.5,
          panels: w.panels ?? [],
          materialId: w.materialId ?? w.systemTypeId
        };
        if (w.baseLine) seed.baseLine = w.baseLine;
        if (seed.baseLine && !isNonZeroBaseLine$1(seed.baseLine[0], seed.baseLine[1])) {
          throw new CurtainWallGeometryError(
            `curtain-wall.batch.create rejected — curtainWalls[${i}] baseLine endpoints must differ.`
          );
        }
        let cw;
        try {
          cw = CurtainWall.parse(seed);
        } catch (cause) {
          throw new CurtainWallSchemaError(
            `curtain-wall.batch.create rejected — schema validation failed for curtainWalls[${i}] (id=${id})`
          );
        }
        fresh.push(cw);
      }
      const [next, forward, inverse] = produceCommand(ctx.stores.curtainwall, (draft) => {
        for (const cw of fresh) draft[cw.id] = cw;
      });
      console.log(`[CommandBus] DISPATCH: curtain-wall.batch.create — ${fresh.length} curtain wall(s) committed to plugin store`);
      return { forward, inverse, nextStates: { curtainwall: next } };
    });
  }
}

class DeleteCurtainWallBatchHandler {
  type = "curtain-wall.batch.delete";
  affectedStores = ["curtainwall"];
  canExecute(_ctx, cmd) {
    if (!Array.isArray(cmd.ids)) {
      return { valid: false, reason: "`ids` must be an array" };
    }
    return { valid: true };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      const ids = cmd.ids ?? [];
      if (ids.length === 0) {
        const [next2, forward2, inverse2] = produceCommand(
          ctx.stores.curtainwall,
          () => {
          }
        );
        return { forward: forward2, inverse: inverse2, nextStates: { curtainwall: next2 } };
      }
      const [next, forward, inverse] = produceCommand(
        ctx.stores.curtainwall,
        (draft) => {
          for (const id of ids) {
            delete draft[id];
          }
        }
      );
      console.log(
        `[CommandBus] DISPATCH: curtain-wall.batch.delete — ${ids.length} curtain wall(s) removed from plugin store`
      );
      return { forward, inverse, nextStates: { curtainwall: next } };
    });
  }
}

class UpdateCurtainWallBatchHandler {
  type = "curtain-wall.batch.update";
  /** §FIX-COMMAND-NAMESPACE (L-796) — deprecated pre-migration spelling. */
  aliases = ["curtainwall.batch.update"];
  affectedStores = ["curtainwall"];
  canExecute(_ctx, cmd) {
    if (!Array.isArray(cmd.updates) || cmd.updates.length === 0) {
      return {
        valid: false,
        reason: "curtain-wall.batch.update: updates array must be non-empty"
      };
    }
    for (let i = 0; i < cmd.updates.length; i++) {
      const entry = cmd.updates[i];
      if (!entry.id || typeof entry.id !== "string" || entry.id.trim() === "") {
        return {
          valid: false,
          reason: `curtain-wall.batch.update: updates[${i}].id must be a non-empty string`
        };
      }
      if (!entry.updates || typeof entry.updates !== "object") {
        return {
          valid: false,
          reason: `curtain-wall.batch.update: updates[${i}].updates must be a plain object`
        };
      }
    }
    return { valid: true };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(
      this.type + ".handler",
      { "pryzm.command.type": this.type },
      () => {
        let applied = 0;
        let skipped = 0;
        const [next, forward, inverse] = produceCommand(
          ctx.stores.curtainwall,
          (draft) => {
            for (const entry of cmd.updates) {
              const existing = draft[entry.id];
              if (!existing) {
                console.warn(
                  `[curtain-wall.batch.update] id '${entry.id}' not found in plugin store — skipping`
                );
                skipped++;
                continue;
              }
              Object.assign(existing, entry.updates);
              applied++;
            }
          }
        );
        console.log(
          `[CommandBus] DISPATCH: curtain-wall.batch.update — ${applied} applied, ${skipped} skipped`
        );
        return { forward, inverse, nextStates: { curtainwall: next } };
      }
    );
  }
}

class CreateCurtainWallsOnAllSlabsHandler {
  type = "curtain-wall.create-on-all-slabs";
  affectedStores = [];
  canExecute(_ctx, _cmd) {
    return { valid: true };
  }
  execute(_ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      const cm = window.commandManager;
      if (cm) {
        try {
          cm.execute(
            new CreateCurtainWallsOnAllSlabsCommand({
              height: cmd.height,
              gridXSpacing: cmd.gridXSpacing,
              gridYSpacing: cmd.gridYSpacing
            })
          );
        } catch (e) {
          console.error("[curtain-wall.create-on-all-slabs.handler] bridge failed:", e);
        }
      }
      return { forward: [], inverse: [] };
    });
  }
}

const AddCurtainGridLineHandler = {
  type: "curtain-wall.addGridLine",
  /** §FIX-COMMAND-NAMESPACE (L-796) — deprecated pre-migration spelling. */
  aliases: ["curtainwall.addGridLine"],
  affectedStores: ["curtainwall"],
  canExecute(ctx, cmd) {
    if (!cmd.curtainWallId) return { valid: false, reason: "curtainWallId is required" };
    if (cmd.axis !== "u" && cmd.axis !== "v") return { valid: false, reason: "axis must be u or v" };
    if (!Number.isFinite(cmd.t) || cmd.t <= 1e-3 || cmd.t >= 0.999) {
      return { valid: false, reason: "t must be between 0.001 and 0.999" };
    }
    if (!ctx.stores.curtainwall[cmd.curtainWallId]) {
      return { valid: false, reason: `curtain wall not found: ${cmd.curtainWallId}` };
    }
    return { valid: true };
  },
  execute(ctx, cmd) {
    return withHandlerSpan("curtain-wall.addGridLine.handler", { "pryzm.command.type": "curtain-wall.addGridLine" }, () => {
      const newLineId = crypto.randomUUID();
      const [next, forward, inverse] = produceCommand(ctx.stores.curtainwall, (draft) => {
        const cw = draft[cmd.curtainWallId];
        if (!cw) {
          console.error("[curtain-wall.addGridLine] curtain wall not found in store:", cmd.curtainWallId);
          return;
        }
        const [start, end] = cw.baseLine;
        const dx = end.x - start.x, dy = end.y - start.y, dz = end.z - start.z;
        const length = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const currentGrid = cw.gridSystem ?? migrateToGridSystem(length, cw.height, cw.bayWidth, cw.bayHeight, cmd.curtainWallId);
        cw.gridSystem = {
          uLines: cmd.axis === "u" ? insertGridLine(currentGrid.uLines, cmd.t, 1e-3, newLineId) : currentGrid.uLines.map((l) => ({ id: l.id, t: l.t })),
          vLines: cmd.axis === "v" ? insertGridLine(currentGrid.vLines, cmd.t, 1e-3, newLineId) : currentGrid.vLines.map((l) => ({ id: l.id, t: l.t }))
        };
      });
      return { forward, inverse, nextStates: { curtainwall: next } };
    });
  }
};

const RemoveCurtainGridLineHandler = {
  type: "curtain-wall.removeGridLine",
  /** §FIX-COMMAND-NAMESPACE (L-796) — deprecated pre-migration spelling. */
  aliases: ["curtainwall.removeGridLine"],
  affectedStores: ["curtainwall"],
  canExecute(ctx, cmd) {
    if (!cmd.curtainWallId) return { valid: false, reason: "curtainWallId is required" };
    if (!cmd.gridLineId) return { valid: false, reason: "gridLineId is required" };
    if (cmd.axis !== "u" && cmd.axis !== "v") return { valid: false, reason: "axis must be u or v" };
    const cw = ctx.stores.curtainwall[cmd.curtainWallId];
    if (!cw) return { valid: false, reason: `curtain wall not found: ${cmd.curtainWallId}` };
    const grid = cw.gridSystem;
    if (grid) {
      const lines = cmd.axis === "u" ? grid.uLines : grid.vLines;
      const line = lines.find((l) => l.id === cmd.gridLineId);
      if (!line) {
        return { valid: false, reason: `grid line '${cmd.gridLineId}' not found on ${cmd.axis}-axis` };
      }
      if (line.t < 1e-3 || line.t > 0.999) {
        return { valid: false, reason: "cannot remove a boundary grid line (t=0 or t=1)" };
      }
      if (lines.length <= 2) {
        return { valid: false, reason: `cannot remove the last interior grid line on ${cmd.axis}-axis` };
      }
    }
    return { valid: true };
  },
  execute(ctx, cmd) {
    return withHandlerSpan("curtain-wall.removeGridLine.handler", { "pryzm.command.type": "curtain-wall.removeGridLine" }, () => {
      const [next, forward, inverse] = produceCommand(ctx.stores.curtainwall, (draft) => {
        const cw = draft[cmd.curtainWallId];
        if (!cw) {
          console.error("[curtain-wall.removeGridLine] curtain wall not found in store:", cmd.curtainWallId);
          return;
        }
        const [start, end] = cw.baseLine;
        const dx = end.x - start.x, dy = end.y - start.y, dz = end.z - start.z;
        const length = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const currentGrid = cw.gridSystem ?? migrateToGridSystem(length, cw.height, cw.bayWidth, cw.bayHeight, cmd.curtainWallId);
        cw.gridSystem = {
          uLines: cmd.axis === "u" ? removeGridLine(currentGrid.uLines, cmd.gridLineId) : currentGrid.uLines.map((l) => ({ ...l })),
          vLines: cmd.axis === "v" ? removeGridLine(currentGrid.vLines, cmd.gridLineId) : currentGrid.vLines.map((l) => ({ ...l }))
        };
      });
      return { forward, inverse, nextStates: { curtainwall: next } };
    });
  }
};

const ReplacePanelHandler = {
  type: "curtain-wall.replacePanel",
  /** §FIX-COMMAND-NAMESPACE (L-796) — deprecated pre-migration spelling. */
  aliases: ["curtainwall.replacePanel"],
  // affectedStores is empty pending CurtainPanelStore → Store<CurtainPanelData> migration.
  // Set to ['curtainpanel'] once the store migration lands so the CommandBus undo
  // applicator can route inverse patches to an Immer-managed panel state.
  // TODO(E.5.x): set to ['curtainpanel'] after CurtainPanelStore migration.
  affectedStores: [],
  canExecute(ctx, cmd) {
    if (!cmd.panelId) return { valid: false, reason: "panelId is required" };
    if (!cmd.newPanelType) return { valid: false, reason: "newPanelType is required" };
    if (!isValidPanelType(cmd.newPanelType)) {
      return {
        valid: false,
        // §CW-Voc-3 (C87 §9) — GENERATED, NOT TRANSCRIBED. This used to name three
        // members while `isValidPanelType` validated against THIRTEEN, so a user
        // told "valid values: Glass, Opaque, Empty" could not discover the ten
        // that would have worked. A hand-written copy of a union is C84 EI-8a's
        // failure mode; the union is the only place that knows its own members.
        reason: `'${cmd.newPanelType}' is not a valid PanelType. Valid values: ${VALID_PANEL_TYPES.join(", ")}`
      };
    }
    const panelStore = ctx.stores["curtainPanelStore"];
    if (!panelStore) return { valid: false, reason: "curtainPanelStore not available in handler context" };
    if (!panelStore.get(cmd.panelId)) return { valid: false, reason: `panel not found: ${cmd.panelId}` };
    return { valid: true };
  },
  execute(ctx, cmd) {
    return withHandlerSpan(
      "curtain-wall.replacePanel.handler",
      { "pryzm.command.type": "curtain-wall.replacePanel" },
      () => {
        const panelStore = ctx.stores["curtainPanelStore"];
        if (!panelStore) {
          console.error("[curtain-wall.replacePanel] curtainPanelStore not available in handler context");
          return { forward: [], inverse: [] };
        }
        const panel = panelStore.get(cmd.panelId);
        if (!panel) {
          console.error("[curtain-wall.replacePanel] panel not found in store:", cmd.panelId);
          return { forward: [], inverse: [] };
        }
        const snapshot = {
          [cmd.panelId]: {
            panelType: panel.panelType,
            ...panel.materialOverride !== void 0 && { materialOverride: panel.materialOverride }
          }
        };
        const [, forward, inverse] = produceCommand(snapshot, (draft) => {
          const p = draft[cmd.panelId];
          if (!p) return;
          p.panelType = cmd.newPanelType;
          if (cmd.materialOverride !== void 0) {
            p.materialOverride = cmd.materialOverride ?? void 0;
          }
        });
        const updates = { panelType: cmd.newPanelType };
        if (cmd.materialOverride !== void 0) {
          updates.materialOverride = cmd.materialOverride ?? void 0;
        }
        panelStore.update(cmd.panelId, updates);
        return { forward, inverse };
      }
    );
  }
};

const CURTAIN_WALL_MATERIAL_UNREACHABLE = "It writes the plugin DTO store, which is a FRESH instance built by PluginRegistry and is read by no renderer, no 2-D projector, no IFC exporter and no persistence path — only `<family>.created` is ever mirrored to the geometry store, never updates (§FIX-MATERIAL-DEAD-DISPATCH). Use `wall.updateCurtainWall` instead — it reaches the geometry record the builders read.";
class SetCurtainWallMaterialHandler {
  type = "curtain-wall.setMaterial";
  /** §FIX-COMMAND-NAMESPACE (L-796) — deprecated pre-migration spelling. */
  aliases = ["curtainwall.setMaterial"];
  affectedStores = ["curtainwall"];
  canExecute(ctx, cmd) {
    if (typeof cmd.curtainWallId !== "string" || cmd.curtainWallId.length === 0) {
      return { valid: false, reason: "curtainWallId must be a non-empty string" };
    }
    if (cmd.materialId === void 0 && cmd.materialColor === void 0) {
      return { valid: false, reason: "at least one of materialId / materialColor must be provided" };
    }
    if (cmd.materialColor !== void 0 && cmd.materialColor.length === 0) {
      return { valid: false, reason: "materialColor must be non-empty when provided" };
    }
    if (cmd.materialId !== void 0 && cmd.materialId !== null && cmd.materialId.length === 0) {
      return { valid: false, reason: "materialId must be non-empty when provided" };
    }
    if (!ctx.stores.curtainwall[cmd.curtainWallId]) {
      return { valid: false, reason: `curtain-wall not found: ${cmd.curtainWallId}` };
    }
    return { valid: false, reason: CURTAIN_WALL_MATERIAL_UNREACHABLE };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      if (!ctx.stores.curtainwall[cmd.curtainWallId]) throw new CurtainWallNotFoundError(cmd.curtainWallId);
      const [next, forward, inverse] = produceCommand(ctx.stores.curtainwall, (draft) => {
        const cw = draft[cmd.curtainWallId];
        if (!cw) return;
        if (cmd.materialId === null) delete cw.materialId;
        else if (cmd.materialId !== void 0) cw.materialId = cmd.materialId;
      });
      return { forward, inverse, nextStates: { curtainwall: next } };
    });
  }
}

const CURTAIN_PANEL_BATCH_REPORT_EVENT = "pryzm-curtain-panel-batch-report";
function isValidScope$2(scope) {
  if (typeof scope !== "object" || scope === null) return false;
  const s = scope;
  if (s.kind === "element") return typeof s.elementId === "string" && s.elementId.length > 0;
  if (s.kind === "level") return typeof s.levelId === "string" && s.levelId.length > 0;
  if (s.kind === "project") return true;
  if (s.kind === "ids") return Array.isArray(s.panelIds) && s.panelIds.every((id) => typeof id === "string");
  return false;
}
function isValidChange(change) {
  if (typeof change !== "object" || change === null) return false;
  const c = change;
  if (c.kind === "type") return typeof c.panelType === "string" && c.panelType.length > 0;
  if (c.kind === "material") return typeof c.materialRef === "string" && c.materialRef.length > 0;
  return false;
}
const BulkUpdateCurtainPanelsHandler = {
  type: "curtain-wall.bulkUpdatePanels",
  affectedStores: [],
  canExecute(_ctx, cmd) {
    if (!isValidScope$2(cmd.scope)) {
      return {
        valid: false,
        reason: "scope must be { kind: 'element', elementId } | { kind: 'level', levelId } | { kind: 'project' } | { kind: 'ids', panelIds }"
      };
    }
    if (!isValidChange(cmd.change)) {
      return {
        valid: false,
        reason: "change must be { kind: 'type', panelType } | { kind: 'material', materialRef }"
      };
    }
    return { valid: true };
  },
  execute(_ctx, cmd) {
    return withHandlerSpan(
      "curtain-wall.bulkUpdatePanels.handler",
      { "pryzm.command.type": "curtain-wall.bulkUpdatePanels" },
      () => {
        const cm = window.commandManager;
        const sayNothingRan = (why) => {
          const report = {
            success: false,
            info: [
              `'curtain-wall.bulkUpdatePanels' did not run — ${why}. Nothing was changed, and nothing about the model is confirmed.`
            ],
            affectedElementIds: [],
            outcome: "indeterminate"
          };
          try {
            window.dispatchEvent(new CustomEvent(CURTAIN_PANEL_BATCH_REPORT_EVENT, { detail: report }));
          } catch (emitErr) {
            console.error("[curtain-wall.bulkUpdatePanels.handler] indeterminate report emit failed:", emitErr);
          }
        };
        let refusal = null;
        if (cm) {
          try {
            const result = cm.execute(
              new BulkUpdateCurtainPanelsCommand({ scope: cmd.scope, change: cmd.change })
            );
            const readable = !!result && Array.isArray(result.affectedElementIds);
            const report = readable ? {
              success: result.success ?? false,
              info: result.info ?? [],
              affectedElementIds: result.affectedElementIds
            } : {
              success: false,
              info: [
                `'curtain-wall.bulkUpdatePanels' RAN but the command manager returned no readable result. WHICH panels changed is not known — this is NOT a report that none did.`
              ],
              affectedElementIds: [],
              outcome: "indeterminate"
            };
            window.dispatchEvent(
              new CustomEvent(CURTAIN_PANEL_BATCH_REPORT_EVENT, { detail: report })
            );
            if (!report.success) {
              refusal = report.info[0] ?? "the curtain panel change was refused, and no reason was given";
            }
          } catch (e) {
            console.error("[curtain-wall.bulkUpdatePanels.handler] bridge failed:", e);
            sayNothingRan(`the bridge threw: ${String(e?.message ?? e)}`);
            refusal = `the bridge threw: ${String(e?.message ?? e)}`;
          }
        } else {
          sayNothingRan("the command manager is not available in this session");
          refusal = "the command manager is not available in this session";
        }
        if (refusal !== null) {
          throw new Error(`curtain-wall.bulkUpdatePanels: ${refusal}`);
        }
        const empty = { forward: [], inverse: [] };
        return empty;
      }
    );
  }
};

const CURTAIN_WALL_PARAMETER_BATCH_REPORT_EVENT = "pryzm-curtain-wall-parameter-batch-report";
function isValidScope$1(scope) {
  if (typeof scope !== "object" || scope === null) return false;
  const s = scope;
  if (s.kind === "element") return typeof s.elementId === "string" && s.elementId.length > 0;
  if (s.kind === "level") return typeof s.levelId === "string" && s.levelId.length > 0;
  if (s.kind === "project") return true;
  if (s.kind === "ids") return Array.isArray(s.curtainWallIds) && s.curtainWallIds.every((id) => typeof id === "string");
  return false;
}
const BulkUpdateCurtainWallParameterHandler = {
  type: "curtain-wall.bulkUpdateParameter",
  affectedStores: [],
  canExecute(_ctx, cmd) {
    if (!isValidScope$1(cmd.scope)) {
      return {
        valid: false,
        reason: "scope must be { kind: 'element', elementId } | { kind: 'level', levelId } | { kind: 'project' } | { kind: 'ids', curtainWallIds }"
      };
    }
    if (typeof cmd.parameter !== "string" || cmd.parameter.length === 0) {
      return { valid: false, reason: "parameter must be a non-empty string (mullionSize, panelThickness, gridXSpacing, gridYSpacing)" };
    }
    if (typeof cmd.value !== "number" || !Number.isFinite(cmd.value)) {
      return { valid: false, reason: "value must be a finite number, in metres" };
    }
    return { valid: true };
  },
  execute(_ctx, cmd) {
    return withHandlerSpan(
      "curtain-wall.bulkUpdateParameter.handler",
      { "pryzm.command.type": "curtain-wall.bulkUpdateParameter" },
      () => {
        const cm = window.commandManager;
        const sayNothingRan = (why) => {
          const report = {
            success: false,
            info: [
              `'curtain-wall.bulkUpdateParameter' did not run — ${why}. Nothing was changed, and nothing about the model is confirmed.`
            ],
            affectedElementIds: [],
            outcome: "indeterminate"
          };
          try {
            window.dispatchEvent(new CustomEvent(CURTAIN_WALL_PARAMETER_BATCH_REPORT_EVENT, { detail: report }));
          } catch (emitErr) {
            console.error("[curtain-wall.bulkUpdateParameter.handler] indeterminate report emit failed:", emitErr);
          }
        };
        let refusal = null;
        if (cm) {
          try {
            const result = cm.execute(
              new BulkUpdateCurtainWallParameterCommand({
                scope: cmd.scope,
                parameter: cmd.parameter,
                value: cmd.value
              })
            );
            const readable = !!result && Array.isArray(result.affectedElementIds);
            const report = readable ? {
              success: result.success ?? false,
              info: result.info ?? [],
              affectedElementIds: result.affectedElementIds
            } : {
              success: false,
              info: [
                `'curtain-wall.bulkUpdateParameter' RAN but the command manager returned no readable result. WHICH walls changed is not known — this is NOT a report that none did.`
              ],
              affectedElementIds: [],
              outcome: "indeterminate"
            };
            window.dispatchEvent(
              new CustomEvent(CURTAIN_WALL_PARAMETER_BATCH_REPORT_EVENT, { detail: report })
            );
            if (!report.success) {
              refusal = report.info[0] ?? "the curtain wall parameter change was refused, and no reason was given";
            }
          } catch (e) {
            console.error("[curtain-wall.bulkUpdateParameter.handler] bridge failed:", e);
            sayNothingRan(`the bridge threw: ${String(e?.message ?? e)}`);
            refusal = `the bridge threw: ${String(e?.message ?? e)}`;
          }
        } else {
          sayNothingRan("the command manager is not available in this session");
          refusal = "the command manager is not available in this session";
        }
        if (refusal !== null) {
          throw new Error(`curtain-wall.bulkUpdateParameter: ${refusal}`);
        }
        const empty = { forward: [], inverse: [] };
        return empty;
      }
    );
  }
};

class ChangeCurtainWallLevelHandler {
  type = "curtain-wall.changeLevel";
  /** The pre-2026-08-30 spelling — see the header. ⛔ Keep this short: `storesOf()`
   *  in `check-mirror-completeness.ts:186-188` reads only the first 900 chars after
   *  the `type` declaration, so prose here can push `affectedStores` out of the
   *  gate's window and make a mirrored verb read as un-mirrored. It did exactly
   *  that once, during this rename. */
  aliases = ["curtainWall.changeLevel"];
  /**
   * `curtainwall` — ONE WORD, LOWERCASE, and the exact key matters.
   * `buildUndoStoreMap()` (`apps/editor/src/engine/undo/performUndoRedo.ts:315-320`)
   * says so in its own comment: *"the bus handler declares
   * affectedStores=['curtainwall'] (one word, lowercase) — that EXACT key MUST be
   * present or curtain-wall undo falls to commandManager ('history empty'), the
   * identical bug walls had"*. Every other handler in this plugin declares the
   * same key.
   */
  affectedStores = ["curtainwall"];
  canExecute(ctx, cmd) {
    if (typeof cmd.curtainWallId !== "string" || cmd.curtainWallId.length === 0) {
      return { valid: false, reason: "curtainWallId must be a non-empty string" };
    }
    if (typeof cmd.levelId !== "string" || cmd.levelId.length === 0) {
      return { valid: false, reason: "levelId must be a non-empty string" };
    }
    if (!Object.prototype.hasOwnProperty.call(ctx.stores.curtainwall, cmd.curtainWallId)) {
      return { valid: false, reason: `curtain wall not found: ${cmd.curtainWallId}` };
    }
    if (ctx.stores.curtainwall[cmd.curtainWallId]?.levelId === cmd.levelId) {
      return {
        valid: false,
        reason: `curtain wall ${cmd.curtainWallId} is already on level ${cmd.levelId}`
      };
    }
    return { valid: true };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      const [next, forward, inverse] = produceCommand(
        ctx.stores.curtainwall,
        (draft) => {
          const cw = draft[cmd.curtainWallId];
          if (cw === void 0) return;
          cw.levelId = cmd.levelId;
        }
      );
      return { forward, inverse, nextStates: { curtainwall: next } };
    });
  }
}

function buildCurtainWallHandlerSet() {
  return [
    new CreateCurtainWallHandler(),
    new DeleteCurtainWallHandler(),
    new MoveCurtainWallHandler(),
    new SetCurtainWallGridHandler(),
    new SetCurtainWallMullionTypeHandler(),
    new SetCurtainWallTransomTypeHandler(),
    new SetCurtainWallPanelTypeHandler(),
    new SetCurtainWallOutlineHandler(),
    new ResizeCurtainWallHandler(),
    new AddPanelHandler(),
    new RemovePanelHandler(),
    new SwapPanelHandler(),
    new RotatePanelHandler(),
    // P2e: batch create + batch delete (undo-mirror)
    new CreateCurtainWallBatchHandler(),
    new DeleteCurtainWallBatchHandler(),
    // §FIX-CW-UPDATE-REACH-RECORD — UpdateCurtainWallHandler retired (see the
    // CURTAIN_WALL_HANDLER_TYPES note); the initBusHandlers bridge owns the verb.
    // FT7 (ELEMENT-FUNCTIONAL-FIX-PLAN-2026-05-18): batch update — one Immer call, one rebuild
    new UpdateCurtainWallBatchHandler(),
    // F-1.3 bridge
    new CreateCurtainWallsOnAllSlabsHandler(),
    // E.5.x migration bridges
    AddCurtainGridLineHandler,
    RemoveCurtainGridLineHandler,
    ReplacePanelHandler,
    new SetCurtainWallMaterialHandler(),
    new ChangeCurtainWallLevelHandler(),
    // §RACORIENT145
    BulkUpdateCurtainPanelsHandler,
    // §CWPROPS152
    BulkUpdateCurtainWallParameterHandler
  ];
}

class GridStore extends Store {
  constructor() {
    super("grid");
  }
  ids() {
    return [...this.state.keys()];
  }
  get(id) {
    return this.state.get(id);
  }
}

class GridSystemError extends Error {
  constructor(message) {
    super(message);
    this.name = "GridSystemError";
  }
}
class GridNotFoundError extends GridSystemError {
  constructor(gridId) {
    super(`Grid not found: ${gridId}`);
    this.gridId = gridId;
    this.name = "GridNotFoundError";
  }
  gridId;
}
class GridSchemaError extends GridSystemError {
  constructor(cause) {
    super(`Grid schema validation failed: ${String(cause?.message ?? cause)}`);
    this.cause = cause;
    this.name = "GridSchemaError";
  }
  cause;
}
class GridConfigError extends GridSystemError {
  constructor(reason) {
    super(`Invalid grid configuration: ${reason}`);
    this.name = "GridConfigError";
  }
}

class CreateGridHandler {
  type = "grid.create";
  affectedStores = ["grid"];
  canExecute(_ctx, cmd) {
    if (cmd.rotation !== void 0 && !Number.isFinite(cmd.rotation)) {
      return { valid: false, reason: "rotation must be a finite number" };
    }
    if (cmd.lines !== void 0) {
      const ids = /* @__PURE__ */ new Set();
      for (let i = 0; i < cmd.lines.length; i++) {
        const ln = cmd.lines[i];
        if (typeof ln.id !== "string" || ln.id.length === 0) {
          return { valid: false, reason: `lines[${i}].id must be a non-empty string` };
        }
        if (ids.has(ln.id)) {
          return { valid: false, reason: `lines[${i}].id is duplicated: ${ln.id}` };
        }
        ids.add(ln.id);
        if (ln.kind === "arc" && (typeof ln.radius !== "number" || ln.radius <= 0)) {
          return { valid: false, reason: `lines[${i}]: arc requires positive radius` };
        }
      }
    }
    return { valid: true };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      const id = cmd.id ?? createId("grid");
      const seed = {
        id,
        levelId: cmd.levelId ?? "",
        rotation: cmd.rotation ?? 0,
        lines: cmd.lines ?? []
      };
      let grid;
      try {
        grid = Grid.parse(seed);
      } catch (err) {
        throw new GridSchemaError(err);
      }
      const [next, forward, inverse] = produceCommand(ctx.stores.grid, (draft) => {
        draft[grid.id] = grid;
      });
      return { forward, inverse, nextStates: { grid: next } };
    });
  }
}

class DeleteGridHandler {
  type = "grid.delete";
  affectedStores = ["grid"];
  canExecute(ctx, cmd) {
    if (typeof cmd.gridId !== "string" || cmd.gridId.length === 0) {
      return { valid: false, reason: "gridId must be a non-empty string" };
    }
    if (!ctx.stores.grid[cmd.gridId]) return { valid: false, reason: `grid not found: ${cmd.gridId}` };
    return { valid: true };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      if (!ctx.stores.grid[cmd.gridId]) throw new GridNotFoundError(cmd.gridId);
      const [next, forward, inverse] = produceCommand(ctx.stores.grid, (draft) => {
        delete draft[cmd.gridId];
      });
      return { forward, inverse, nextStates: { grid: next } };
    });
  }
}

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
function letterLabel(n) {
  let s = "";
  let i = n;
  do {
    s = ALPHABET[i % 26] + s;
    i = Math.floor(i / 26) - 1;
  } while (i >= 0);
  return s;
}
function generateRectGridLines(spec) {
  const ox = spec.origin?.x ?? 0;
  const oy = spec.origin?.y ?? 0;
  const oz = spec.origin?.z ?? 0;
  const lines = [];
  for (let i = 0; i < spec.countX; i++) {
    const x = ox + i * spec.spacingX;
    lines.push({
      id: `x-${i + 1}`,
      label: String(i + 1),
      kind: "linear",
      start: { x, y: oy, z: oz },
      end: { x, y: oy, z: oz + spec.extent }
    });
  }
  for (let j = 0; j < spec.countZ; j++) {
    const z = oz + j * spec.spacingZ;
    lines.push({
      id: `y-${letterLabel(j)}`,
      label: letterLabel(j),
      kind: "linear",
      start: { x: ox, y: oy, z },
      end: { x: ox + spec.extent, y: oy, z }
    });
  }
  return lines;
}
function validateRectGridSpec(spec) {
  if (!Number.isFinite(spec.spacingX) || spec.spacingX <= 0) {
    return { ok: false, reason: "spacingX must be > 0" };
  }
  if (!Number.isFinite(spec.spacingZ) || spec.spacingZ <= 0) {
    return { ok: false, reason: "spacingZ must be > 0" };
  }
  if (!Number.isInteger(spec.countX) || spec.countX < 1) {
    return { ok: false, reason: "countX must be a positive integer" };
  }
  if (!Number.isInteger(spec.countZ) || spec.countZ < 1) {
    return { ok: false, reason: "countZ must be a positive integer" };
  }
  if (!Number.isFinite(spec.extent) || spec.extent <= 0) {
    return { ok: false, reason: "extent must be > 0" };
  }
  return { ok: true };
}

class SetGridSpacingHandler {
  type = "grid.setSpacing";
  affectedStores = ["grid"];
  canExecute(ctx, cmd) {
    if (typeof cmd.gridId !== "string" || cmd.gridId.length === 0) {
      return { valid: false, reason: "gridId must be a non-empty string" };
    }
    if (!ctx.stores.grid[cmd.gridId]) {
      return { valid: false, reason: `grid not found: ${cmd.gridId}` };
    }
    const v = validateRectGridSpec(cmd);
    if (!v.ok) return { valid: false, reason: v.reason ?? "invalid grid spec" };
    return { valid: true };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      if (!ctx.stores.grid[cmd.gridId]) throw new GridNotFoundError(cmd.gridId);
      const v = validateRectGridSpec(cmd);
      if (!v.ok) throw new GridConfigError(v.reason ?? "invalid spec");
      const lines = generateRectGridLines(cmd);
      const [next, forward, inverse] = produceCommand(ctx.stores.grid, (draft) => {
        const g = draft[cmd.gridId];
        if (g) g.lines = lines;
      });
      return { forward, inverse, nextStates: { grid: next } };
    });
  }
}

class SetGridExtentHandler {
  type = "grid.setExtent";
  affectedStores = ["grid"];
  canExecute(ctx, cmd) {
    if (typeof cmd.gridId !== "string" || cmd.gridId.length === 0) {
      return { valid: false, reason: "gridId must be a non-empty string" };
    }
    if (!Number.isFinite(cmd.extent) || cmd.extent <= 0) {
      return { valid: false, reason: "extent must be > 0" };
    }
    if (!ctx.stores.grid[cmd.gridId]) {
      return { valid: false, reason: `grid not found: ${cmd.gridId}` };
    }
    return { valid: true };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      if (!ctx.stores.grid[cmd.gridId]) throw new GridNotFoundError(cmd.gridId);
      if (cmd.extent <= 0) throw new GridConfigError("extent must be > 0");
      const [next, forward, inverse] = produceCommand(ctx.stores.grid, (draft) => {
        const g = draft[cmd.gridId];
        if (!g) return;
        for (const ln of g.lines) {
          if (ln.kind !== "linear") continue;
          const dx = ln.end.x - ln.start.x;
          const dy = ln.end.y - ln.start.y;
          const dz = ln.end.z - ln.start.z;
          const len = Math.hypot(dx, dy, dz);
          if (len === 0) continue;
          const inv = cmd.extent / len;
          ln.end = {
            x: ln.start.x + dx * inv,
            y: ln.start.y + dy * inv,
            z: ln.start.z + dz * inv
          };
        }
      });
      return { forward, inverse, nextStates: { grid: next } };
    });
  }
}

function buildGridHandlerSet() {
  return [
    new CreateGridHandler(),
    new DeleteGridHandler(),
    new SetGridSpacingHandler(),
    new SetGridExtentHandler()
  ];
}

class ColumnStore extends Store {
  constructor() {
    super("column");
  }
  ids() {
    return [...this.state.keys()];
  }
  byLevel(levelId) {
    const out = [];
    for (const c of this.state.values()) if (c.levelId === levelId) out.push(c);
    return out;
  }
  get(id) {
    return this.state.get(id);
  }
}

class ColumnSystemError extends Error {
  constructor(message) {
    super(message);
    this.name = "ColumnSystemError";
  }
}
class ColumnNotFoundError extends ColumnSystemError {
  constructor(columnId) {
    super(`Column not found: ${columnId}`);
    this.columnId = columnId;
    this.name = "ColumnNotFoundError";
  }
  columnId;
}
class ColumnSchemaError extends ColumnSystemError {
  constructor(cause) {
    super(`Column schema validation failed: ${String(cause?.message ?? cause)}`);
    this.cause = cause;
    this.name = "ColumnSchemaError";
  }
  cause;
}
class ColumnDimensionsError extends ColumnSystemError {
  constructor(reason) {
    super(`Invalid column dimensions: ${reason}`);
    this.name = "ColumnDimensionsError";
  }
}

function isFiniteVec3$a(p) {
  return !!p && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z);
}

class CreateColumnHandler {
  type = "column.create";
  affectedStores = ["column"];
  canExecute(_ctx, cmd) {
    if (cmd.origin !== void 0 && !isFiniteVec3$a(cmd.origin)) {
      return { valid: false, reason: "origin must have finite x, y, z" };
    }
    if (cmd.width !== void 0 && (!Number.isFinite(cmd.width) || cmd.width <= 0)) {
      return { valid: false, reason: "width must be > 0" };
    }
    if (cmd.depth !== void 0 && (!Number.isFinite(cmd.depth) || cmd.depth <= 0)) {
      return { valid: false, reason: "depth must be > 0" };
    }
    if (cmd.height !== void 0 && (!Number.isFinite(cmd.height) || cmd.height <= 0)) {
      return { valid: false, reason: "height must be > 0" };
    }
    if (cmd.shape === "circular" && cmd.width !== void 0 && cmd.depth !== void 0 && cmd.width !== cmd.depth) {
      return { valid: false, reason: "circular column requires width === depth" };
    }
    return { valid: true };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      const id = cmd.id ?? createId("column");
      const seed = {
        id,
        levelId: cmd.levelId ?? "",
        topLevelId: cmd.topLevelId,
        origin: cmd.origin ?? { x: 0, y: 0, z: 0 },
        shape: cmd.shape ?? "rectangular",
        width: cmd.width ?? 0.4,
        depth: cmd.depth ?? 0.4,
        height: cmd.height ?? 3,
        baseOffset: cmd.baseOffset ?? 0,
        rotation: cmd.rotation ?? 0,
        materialId: cmd.materialId ?? cmd.systemTypeId
      };
      if (seed.shape === "circular" && seed.width !== seed.depth) {
        throw new ColumnDimensionsError("circular column requires width === depth");
      }
      let column;
      try {
        column = Column.parse(seed);
      } catch (err) {
        throw new ColumnSchemaError(err);
      }
      const [next, forward, inverse] = produceCommand(ctx.stores.column, (draft) => {
        draft[column.id] = column;
      });
      return { forward, inverse, nextStates: { column: next } };
    });
  }
}

class DeleteColumnHandler {
  type = "column.delete";
  affectedStores = ["column"];
  canExecute(ctx, cmd) {
    if (typeof cmd.columnId !== "string" || cmd.columnId.length === 0) {
      return { valid: false, reason: "columnId must be a non-empty string" };
    }
    if (!ctx.stores.column[cmd.columnId]) {
      return { valid: false, reason: `column not found: ${cmd.columnId}` };
    }
    return { valid: true };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      if (!ctx.stores.column[cmd.columnId]) throw new ColumnNotFoundError(cmd.columnId);
      const [next, forward, inverse] = produceCommand(ctx.stores.column, (draft) => {
        delete draft[cmd.columnId];
      });
      return { forward, inverse, nextStates: { column: next } };
    });
  }
}

const COLUMN_MOVE_UNREACHABLE = "column.move writes the detached plugin column store that nothing renders, exports or persists, and no production surface dispatches it. Moving a column commits through column.update (payload keys: id, updates) → UpdateColumnCommand → the geometry columnStore, which is what MOVE_COMMAND_BY_TYPE and the 3-D gizmo already dispatch. Put the translated origin in `updates`.";
class MoveColumnHandler {
  type = "column.move";
  affectedStores = ["column"];
  /** Payload validation ONLY — kept public so a delegating facade can reuse it. */
  validatePayload(ctx, cmd) {
    if (typeof cmd.columnId !== "string" || cmd.columnId.length === 0) {
      return { valid: false, reason: "columnId must be a non-empty string" };
    }
    if (!cmd.delta || !Number.isFinite(cmd.delta.x) || !Number.isFinite(cmd.delta.y) || !Number.isFinite(cmd.delta.z)) {
      return { valid: false, reason: "delta must have finite x, y, z" };
    }
    if (!ctx.stores.column[cmd.columnId]) {
      return { valid: false, reason: `column not found: ${cmd.columnId}` };
    }
    return { valid: true };
  }
  /**
   * §FIX-DEAD-MOVE-VERB-REFUSE (W3-4) — ORDER IS LOAD-BEARING. `canExecute` must be the
   * LAST method before `execute`. `tools/ga-gate/check-verb-register.ts` classifies a
   * verb as REFUSES by slicing the source from `canExecute` to the next `execute(` and
   * checking that the slice can never yield an ACCEPTING validation result. With
   * `validatePayload` sitting between them, its accepting branch lands inside that slice
   * and the verb is mis-reported as UNKNOWN — a refusal hiding from the register that
   * exists to find it. (For the same reason this comment must not spell the accepting
   * literal out: the detector is a regex over source text, and prose is source text.)
   * Do not reorder these two methods.
   */
  canExecute(ctx, cmd) {
    const v = this.validatePayload(ctx, cmd);
    if (!v.valid) return v;
    return { valid: false, reason: COLUMN_MOVE_UNREACHABLE };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      if (!ctx.stores.column[cmd.columnId]) throw new ColumnNotFoundError(cmd.columnId);
      const [next, forward, inverse] = produceCommand(ctx.stores.column, (draft) => {
        const c = draft[cmd.columnId];
        if (!c) return;
        c.origin.x += cmd.delta.x;
        c.origin.y += cmd.delta.y;
        c.origin.z += cmd.delta.z;
      });
      return { forward, inverse, nextStates: { column: next } };
    });
  }
}

class SetColumnTypeHandler {
  type = "column.setType";
  affectedStores = ["column"];
  canExecute(ctx, cmd) {
    if (typeof cmd.columnId !== "string" || cmd.columnId.length === 0) {
      return { valid: false, reason: "columnId must be a non-empty string" };
    }
    const col = ctx.stores.column[cmd.columnId];
    if (!col) return { valid: false, reason: `column not found: ${cmd.columnId}` };
    if (cmd.width !== void 0 && (!Number.isFinite(cmd.width) || cmd.width <= 0)) {
      return { valid: false, reason: "width must be > 0" };
    }
    if (cmd.depth !== void 0 && (!Number.isFinite(cmd.depth) || cmd.depth <= 0)) {
      return { valid: false, reason: "depth must be > 0" };
    }
    const nextShape = cmd.shape ?? col.shape;
    if (nextShape === "circular" && cmd.shape === "circular") {
      if (cmd.width === void 0 || cmd.depth === void 0) {
        return { valid: false, reason: "setType[circular] requires explicit width AND depth" };
      }
    }
    const nextW = cmd.width ?? col.width;
    const nextD = cmd.depth ?? col.depth;
    if (nextShape === "circular" && nextW !== nextD) {
      return { valid: false, reason: "circular column requires width === depth" };
    }
    return { valid: true };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      const col = ctx.stores.column[cmd.columnId];
      if (!col) throw new ColumnNotFoundError(cmd.columnId);
      const nextShape = cmd.shape ?? col.shape;
      if (nextShape === "circular" && cmd.shape === "circular") {
        if (cmd.width === void 0 || cmd.depth === void 0) {
          throw new ColumnDimensionsError("setType[circular] requires explicit width AND depth");
        }
      }
      const nextW = cmd.width ?? col.width;
      const nextD = cmd.depth ?? col.depth;
      if (nextShape === "circular" && nextW !== nextD) {
        throw new ColumnDimensionsError("circular column requires width === depth");
      }
      const [next, forward, inverse] = produceCommand(ctx.stores.column, (draft) => {
        const c = draft[cmd.columnId];
        if (!c) return;
        if (cmd.shape !== void 0) c.shape = cmd.shape;
        if (cmd.width !== void 0) c.width = cmd.width;
        if (cmd.depth !== void 0) c.depth = cmd.depth;
        if (cmd.materialId !== void 0) c.materialId = cmd.materialId;
        else if (cmd.systemTypeId !== void 0) c.materialId = cmd.systemTypeId;
      });
      return { forward, inverse, nextStates: { column: next } };
    });
  }
}

class SetColumnHeightHandler {
  type = "column.setHeight";
  affectedStores = ["column"];
  canExecute(ctx, cmd) {
    if (typeof cmd.columnId !== "string" || cmd.columnId.length === 0) {
      return { valid: false, reason: "columnId must be a non-empty string" };
    }
    if (!Number.isFinite(cmd.height) || cmd.height <= 0) {
      return { valid: false, reason: "height must be > 0" };
    }
    if (!ctx.stores.column[cmd.columnId]) {
      return { valid: false, reason: `column not found: ${cmd.columnId}` };
    }
    return { valid: true };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      if (!ctx.stores.column[cmd.columnId]) throw new ColumnNotFoundError(cmd.columnId);
      if (cmd.height <= 0) throw new ColumnDimensionsError("height must be > 0");
      const [next, forward, inverse] = produceCommand(ctx.stores.column, (draft) => {
        const c = draft[cmd.columnId];
        if (c) c.height = cmd.height;
      });
      return { forward, inverse, nextStates: { column: next } };
    });
  }
}

class CreateColumnBatchHandler {
  type = "column.batch.create";
  affectedStores = ["column"];
  canExecute(_ctx, cmd) {
    if (!Array.isArray(cmd.columns) || cmd.columns.length === 0) {
      return { valid: false, reason: "columns must be a non-empty array" };
    }
    for (let i = 0; i < cmd.columns.length; i++) {
      const c = cmd.columns[i];
      if (c.id !== void 0 && (typeof c.id !== "string" || c.id.length === 0)) {
        return { valid: false, reason: `columns[${i}].id must be a non-empty string when provided` };
      }
      if (c.origin !== void 0 && !isFiniteVec3$a(c.origin)) {
        return { valid: false, reason: `columns[${i}].origin must have finite x, y, z` };
      }
      if (c.width !== void 0 && (!Number.isFinite(c.width) || c.width <= 0)) {
        return { valid: false, reason: `columns[${i}].width must be > 0` };
      }
      if (c.depth !== void 0 && (!Number.isFinite(c.depth) || c.depth <= 0)) {
        return { valid: false, reason: `columns[${i}].depth must be > 0` };
      }
      if (c.height !== void 0 && (!Number.isFinite(c.height) || c.height <= 0)) {
        return { valid: false, reason: `columns[${i}].height must be > 0` };
      }
      if (c.shape === "circular" && c.width !== void 0 && c.depth !== void 0 && c.width !== c.depth) {
        return {
          valid: false,
          reason: `columns[${i}]: circular column requires width === depth`
        };
      }
    }
    return { valid: true };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      const defaultLevelId = cmd.levelId ?? "";
      const fresh = [];
      for (let i = 0; i < cmd.columns.length; i++) {
        const c = cmd.columns[i];
        const id = c.id ?? createId("column");
        const shape = c.shape ?? "rectangular";
        const width = c.width ?? 0.4;
        const depth = c.depth ?? 0.4;
        if (shape === "circular" && width !== depth) {
          throw new ColumnDimensionsError("circular column requires width === depth");
        }
        const seed = {
          id,
          levelId: c.levelId ?? defaultLevelId,
          topLevelId: c.topLevelId,
          origin: c.origin ?? { x: 0, y: 0, z: 0 },
          shape,
          width,
          depth,
          height: c.height ?? 3,
          baseOffset: c.baseOffset ?? 0,
          rotation: c.rotation ?? 0,
          materialId: c.materialId ?? c.systemTypeId
        };
        let column;
        try {
          column = Column.parse(seed);
        } catch (parseErr) {
          throw new ColumnSchemaError(
            new Error(`column.batch.create — columns[${i}] (id=${id})`, { cause: parseErr })
          );
        }
        fresh.push(column);
      }
      const [next, forward, inverse] = produceCommand(ctx.stores.column, (draft) => {
        for (const c of fresh) draft[c.id] = c;
      });
      return { forward, inverse, nextStates: { column: next } };
    });
  }
}

const COLUMN_MATERIAL_UNREACHABLE = "It writes the plugin DTO store, which is a FRESH instance built by PluginRegistry and is read by no renderer, no 2-D projector, no IFC exporter and no persistence path — only `<family>.created` is ever mirrored to the geometry store, never updates (§FIX-MATERIAL-DEAD-DISPATCH). Use `column.update` instead — it reaches the geometry record the builders read.";
class SetColumnMaterialHandler {
  type = "column.setMaterial";
  affectedStores = ["column"];
  canExecute(ctx, cmd) {
    if (typeof cmd.columnId !== "string" || cmd.columnId.length === 0) {
      return { valid: false, reason: "columnId must be a non-empty string" };
    }
    if (cmd.materialId === void 0 && cmd.materialColor === void 0) {
      return { valid: false, reason: "at least one of materialId / materialColor must be provided" };
    }
    if (cmd.materialColor !== void 0 && cmd.materialColor.length === 0) {
      return { valid: false, reason: "materialColor must be non-empty when provided" };
    }
    if (cmd.materialId !== void 0 && cmd.materialId !== null && cmd.materialId.length === 0) {
      return { valid: false, reason: "materialId must be non-empty when provided" };
    }
    if (!ctx.stores.column[cmd.columnId]) {
      return { valid: false, reason: `column not found: ${cmd.columnId}` };
    }
    return { valid: false, reason: COLUMN_MATERIAL_UNREACHABLE };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      if (!ctx.stores.column[cmd.columnId]) throw new ColumnNotFoundError(cmd.columnId);
      const [next, forward, inverse] = produceCommand(ctx.stores.column, (draft) => {
        const c = draft[cmd.columnId];
        if (!c) return;
        if (cmd.materialId === null) delete c.materialId;
        else if (cmd.materialId !== void 0) c.materialId = cmd.materialId;
      });
      return { forward, inverse, nextStates: { column: next } };
    });
  }
}

class ChangeColumnLevelHandler {
  type = "column.changeLevel";
  affectedStores = ["column"];
  canExecute(ctx, cmd) {
    if (typeof cmd.columnId !== "string" || cmd.columnId.length === 0) {
      return { valid: false, reason: "columnId must be a non-empty string" };
    }
    if (typeof cmd.levelId !== "string" || cmd.levelId.length === 0) {
      return { valid: false, reason: "levelId must be a non-empty string" };
    }
    if (!Object.prototype.hasOwnProperty.call(ctx.stores.column, cmd.columnId)) {
      return { valid: false, reason: `column not found: ${cmd.columnId}` };
    }
    if (ctx.stores.column[cmd.columnId]?.levelId === cmd.levelId) {
      return { valid: false, reason: `column ${cmd.columnId} is already on level ${cmd.levelId}` };
    }
    return { valid: true };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      const [next, forward, inverse] = produceCommand(ctx.stores.column, (draft) => {
        const c = draft[cmd.columnId];
        if (c === void 0) return;
        c.levelId = cmd.levelId;
      });
      return { forward, inverse, nextStates: { column: next } };
    });
  }
}

function buildColumnHandlerSet() {
  return [
    new CreateColumnHandler(),
    new CreateColumnBatchHandler(),
    new DeleteColumnHandler(),
    new MoveColumnHandler(),
    new SetColumnTypeHandler(),
    new SetColumnHeightHandler(),
    new SetColumnMaterialHandler(),
    new ChangeColumnLevelHandler()
  ];
}

class BeamStore extends Store {
  constructor() {
    super("beam");
  }
  ids() {
    return [...this.state.keys()];
  }
  byLevel(levelId) {
    const out = [];
    for (const b of this.state.values()) if (b.levelId === levelId) out.push(b);
    return out;
  }
  get(id) {
    return this.state.get(id);
  }
}

class BeamSystemError extends Error {
  constructor(message) {
    super(message);
    this.name = "BeamSystemError";
  }
}
class BeamNotFoundError extends BeamSystemError {
  constructor(beamId) {
    super(`Beam not found: ${beamId}`);
    this.beamId = beamId;
    this.name = "BeamNotFoundError";
  }
  beamId;
}
class BeamSchemaError extends BeamSystemError {
  constructor(cause) {
    super(`Beam schema validation failed: ${String(cause?.message ?? cause)}`);
    this.cause = cause;
    this.name = "BeamSchemaError";
  }
  cause;
}
class BeamDimensionsError extends BeamSystemError {
  constructor(reason) {
    super(`Invalid beam dimensions: ${reason}`);
    this.name = "BeamDimensionsError";
  }
}
class BeamGeometryError extends BeamSystemError {
  constructor(reason) {
    super(`Invalid beam geometry: ${reason}`);
    this.name = "BeamGeometryError";
  }
}

function isFiniteVec3$9(p) {
  return !!p && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z);
}
function isNonZeroBaseLine(a, b) {
  return a.x !== b.x || a.y !== b.y || a.z !== b.z;
}

const LEGACY_SECTION_TO_SHAPE = {
  rectangular: "rectangular",
  UB: "i-section"
};
class CreateBeamHandler {
  type = "beam.create";
  affectedStores = ["beam"];
  /** §FIX-BEAM-PAYLOAD: fold the `startPoint`/`endPoint` alias into a baseLine
   *  tuple. `baseLine` (when supplied) always wins. */
  static resolveBaseLine(cmd) {
    if (cmd.baseLine !== void 0) return cmd.baseLine;
    if (cmd.startPoint !== void 0 && cmd.endPoint !== void 0) {
      return [cmd.startPoint, cmd.endPoint];
    }
    return void 0;
  }
  /** §FIX-BEAM-CEB-STEEL — `shape` (when supplied) always wins over the legacy
   *  `sectionType` alias, mirroring `resolveBaseLine`'s precedence rule. */
  static resolveShape(cmd) {
    if (cmd.shape !== void 0) return cmd.shape;
    if (cmd.sectionType === void 0) return void 0;
    return LEGACY_SECTION_TO_SHAPE[cmd.sectionType];
  }
  canExecute(_ctx, cmd) {
    if (cmd.shape === void 0 && cmd.sectionType !== void 0 && LEGACY_SECTION_TO_SHAPE[cmd.sectionType] === void 0) {
      return {
        valid: false,
        reason: `sectionType "${cmd.sectionType}" has no L0 Beam.shape member — 'UC' is an I-section indistinguishable from 'UB' once folded, so it is refused by name rather than silently downgraded (§FIX-BEAM-CEB-STEEL / L-974).`
      };
    }
    const baseLine = CreateBeamHandler.resolveBaseLine(cmd);
    if (baseLine === void 0) {
      return {
        valid: false,
        reason: 'beam.create describes no baseline: neither `baseLine` (the L0 Beam schema field, dispatched by plugins/beam and by the copy/duplicate paths) nor the `startPoint`/`endPoint` legacy alias (dispatched by BeamPlanToolHandler) is present. Refused rather than defaulted, because Beam.baseLine has a schema default and accepting the command would commit a 4 m beam at the world origin on level "" — the phantom §FIX-STAIR-CREATE-SHADOW closed for stair (§FIX-BEAM-PHANTOM-TELEMETRY).'
      };
    }
    {
      const [a, b] = baseLine;
      if (!isFiniteVec3$9(a) || !isFiniteVec3$9(b)) {
        return { valid: false, reason: "baseLine endpoints must be finite Vec3" };
      }
      if (!isNonZeroBaseLine(a, b)) {
        return { valid: false, reason: "baseLine endpoints must differ" };
      }
    }
    if (cmd.width !== void 0 && (!Number.isFinite(cmd.width) || cmd.width <= 0)) {
      return { valid: false, reason: "width must be > 0" };
    }
    if (cmd.depth !== void 0 && (!Number.isFinite(cmd.depth) || cmd.depth <= 0)) {
      return { valid: false, reason: "depth must be > 0" };
    }
    return { valid: true };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      const id = cmd.id ?? createId("beam");
      const seed = {
        id,
        levelId: cmd.levelId ?? "",
        shape: CreateBeamHandler.resolveShape(cmd) ?? "rectangular",
        width: cmd.width ?? 0.2,
        depth: cmd.depth ?? 0.4,
        rotation: cmd.rotation ?? 0,
        materialId: cmd.materialId ?? cmd.material ?? cmd.systemTypeId,
        // §FIX-BEAM-CEB-STEEL (L-974) — omitted rather than seeded with
        // `undefined` so the schema's own defaults own the unstated case
        // (`loadBearing` → true, matching `CreateBeamCommand.ts:190`).
        ...cmd.loadBearing !== void 0 ? { loadBearing: cmd.loadBearing } : {},
        ...cmd.fireRating !== void 0 ? { fireRating: cmd.fireRating } : {},
        ...cmd.steelProfileName !== void 0 ? { steelProfileName: cmd.steelProfileName } : {}
      };
      const baseLine = CreateBeamHandler.resolveBaseLine(cmd);
      if (baseLine) seed.baseLine = baseLine;
      if (seed.baseLine && !isNonZeroBaseLine(seed.baseLine[0], seed.baseLine[1])) {
        throw new BeamGeometryError("baseLine endpoints must differ");
      }
      let beam;
      try {
        beam = Beam.parse(seed);
      } catch (err) {
        throw new BeamSchemaError(err);
      }
      const [next, forward, inverse] = produceCommand(ctx.stores.beam, (draft) => {
        draft[beam.id] = beam;
      });
      return { forward, inverse, nextStates: { beam: next } };
    });
  }
}

class DeleteBeamHandler {
  type = "beam.delete";
  affectedStores = ["beam"];
  canExecute(ctx, cmd) {
    if (typeof cmd.beamId !== "string" || cmd.beamId.length === 0) {
      return { valid: false, reason: "beamId must be a non-empty string" };
    }
    if (!ctx.stores.beam[cmd.beamId]) return { valid: false, reason: `beam not found: ${cmd.beamId}` };
    return { valid: true };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      if (!ctx.stores.beam[cmd.beamId]) throw new BeamNotFoundError(cmd.beamId);
      const [next, forward, inverse] = produceCommand(ctx.stores.beam, (draft) => {
        delete draft[cmd.beamId];
      });
      return { forward, inverse, nextStates: { beam: next } };
    });
  }
}

const BEAM_MOVE_UNREACHABLE = "beam.move writes the detached plugin beam store that nothing renders, exports or persists, and no production surface dispatches it. Moving a beam commits through beam.update (payload keys: beamId, updates) → UpdateBeamCommand → the geometry beamStore, which is what MOVE_COMMAND_BY_TYPE, the Align tool and the 3-D gizmo already dispatch. Put the translated startPoint/endPoint in `updates`.";
class MoveBeamHandler {
  type = "beam.move";
  affectedStores = ["beam"];
  /** Payload validation ONLY — kept public so a delegating facade can reuse it. */
  validatePayload(ctx, cmd) {
    if (typeof cmd.beamId !== "string" || cmd.beamId.length === 0) {
      return { valid: false, reason: "beamId must be a non-empty string" };
    }
    if (!cmd.delta || !Number.isFinite(cmd.delta.x) || !Number.isFinite(cmd.delta.y) || !Number.isFinite(cmd.delta.z)) {
      return { valid: false, reason: "delta must have finite x, y, z" };
    }
    if (!ctx.stores.beam[cmd.beamId]) return { valid: false, reason: `beam not found: ${cmd.beamId}` };
    return { valid: true };
  }
  /**
   * §FIX-DEAD-MOVE-VERB-REFUSE (W3-4) — ORDER IS LOAD-BEARING. `canExecute` must be the
   * LAST method before `execute`. `tools/ga-gate/check-verb-register.ts` classifies a
   * verb as REFUSES by slicing the source from `canExecute` to the next `execute(` and
   * checking that the slice can never yield an ACCEPTING validation result. With
   * `validatePayload` sitting between them, its accepting branch lands inside that slice
   * and the verb is mis-reported as UNKNOWN — a refusal hiding from the register that
   * exists to find it. (For the same reason this comment must not spell the accepting
   * literal out: the detector is a regex over source text, and prose is source text.)
   * Do not reorder these two methods.
   */
  canExecute(ctx, cmd) {
    const v = this.validatePayload(ctx, cmd);
    if (!v.valid) return v;
    return { valid: false, reason: BEAM_MOVE_UNREACHABLE };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      if (!ctx.stores.beam[cmd.beamId]) throw new BeamNotFoundError(cmd.beamId);
      const [next, forward, inverse] = produceCommand(ctx.stores.beam, (draft) => {
        const b = draft[cmd.beamId];
        if (!b) return;
        for (const p of b.baseLine) {
          p.x += cmd.delta.x;
          p.y += cmd.delta.y;
          p.z += cmd.delta.z;
        }
      });
      return { forward, inverse, nextStates: { beam: next } };
    });
  }
}

class SetBeamTypeHandler {
  type = "beam.setType";
  affectedStores = ["beam"];
  canExecute(ctx, cmd) {
    if (typeof cmd.beamId !== "string" || cmd.beamId.length === 0) {
      return { valid: false, reason: "beamId must be a non-empty string" };
    }
    if (typeof cmd.systemTypeId !== "string" || cmd.systemTypeId.length === 0) {
      return { valid: false, reason: "systemTypeId must be a non-empty string" };
    }
    if (!ctx.stores.beam[cmd.beamId]) return { valid: false, reason: `beam not found: ${cmd.beamId}` };
    return { valid: true };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      if (!ctx.stores.beam[cmd.beamId]) throw new BeamNotFoundError(cmd.beamId);
      const [next, forward, inverse] = produceCommand(ctx.stores.beam, (draft) => {
        const b = draft[cmd.beamId];
        if (!b) return;
        b.materialId = cmd.materialId ?? cmd.systemTypeId;
      });
      return { forward, inverse, nextStates: { beam: next } };
    });
  }
}

class SetBeamSectionHandler {
  type = "beam.setSection";
  affectedStores = ["beam"];
  canExecute(ctx, cmd) {
    if (typeof cmd.beamId !== "string" || cmd.beamId.length === 0) {
      return { valid: false, reason: "beamId must be a non-empty string" };
    }
    if (cmd.width !== void 0 && (!Number.isFinite(cmd.width) || cmd.width <= 0)) {
      return { valid: false, reason: "width must be > 0" };
    }
    if (cmd.depth !== void 0 && (!Number.isFinite(cmd.depth) || cmd.depth <= 0)) {
      return { valid: false, reason: "depth must be > 0" };
    }
    if (cmd.rotation !== void 0 && !Number.isFinite(cmd.rotation)) {
      return { valid: false, reason: "rotation must be a finite number" };
    }
    if (!ctx.stores.beam[cmd.beamId]) return { valid: false, reason: `beam not found: ${cmd.beamId}` };
    return { valid: true };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      if (!ctx.stores.beam[cmd.beamId]) throw new BeamNotFoundError(cmd.beamId);
      if (cmd.width !== void 0 && cmd.width <= 0) throw new BeamDimensionsError("width must be > 0");
      if (cmd.depth !== void 0 && cmd.depth <= 0) throw new BeamDimensionsError("depth must be > 0");
      const [next, forward, inverse] = produceCommand(ctx.stores.beam, (draft) => {
        const b = draft[cmd.beamId];
        if (!b) return;
        if (cmd.shape !== void 0) b.shape = cmd.shape;
        if (cmd.width !== void 0) b.width = cmd.width;
        if (cmd.depth !== void 0) b.depth = cmd.depth;
        if (cmd.rotation !== void 0) b.rotation = cmd.rotation;
      });
      return { forward, inverse, nextStates: { beam: next } };
    });
  }
}

class CreateBeamBatchHandler {
  type = "beam.batch.create";
  affectedStores = ["beam"];
  canExecute(_ctx, cmd) {
    if (!Array.isArray(cmd.beams) || cmd.beams.length === 0) {
      return { valid: false, reason: "beams must be a non-empty array" };
    }
    for (let i = 0; i < cmd.beams.length; i++) {
      const b = cmd.beams[i];
      if (b.id !== void 0 && (typeof b.id !== "string" || b.id.length === 0)) {
        return { valid: false, reason: `beams[${i}].id must be a non-empty string when provided` };
      }
      if (b.baseLine !== void 0) {
        const [a, bPt] = b.baseLine;
        if (!isFiniteVec3$9(a) || !isFiniteVec3$9(bPt)) {
          return { valid: false, reason: `beams[${i}].baseLine endpoints must be finite Vec3` };
        }
        if (!isNonZeroBaseLine(a, bPt)) {
          return { valid: false, reason: `beams[${i}].baseLine endpoints must differ` };
        }
      }
      if (b.width !== void 0 && (!Number.isFinite(b.width) || b.width <= 0)) {
        return { valid: false, reason: `beams[${i}].width must be > 0` };
      }
      if (b.depth !== void 0 && (!Number.isFinite(b.depth) || b.depth <= 0)) {
        return { valid: false, reason: `beams[${i}].depth must be > 0` };
      }
    }
    return { valid: true };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      const defaultLevelId = cmd.levelId ?? "";
      const fresh = [];
      for (let i = 0; i < cmd.beams.length; i++) {
        const b = cmd.beams[i];
        const id = b.id ?? createId("beam");
        if (b.baseLine !== void 0) {
          const [a, bPt] = b.baseLine;
          if (!isNonZeroBaseLine(a, bPt)) {
            throw new BeamGeometryError(`beams[${i}] baseLine endpoints must differ`);
          }
        }
        const seed = {
          id,
          levelId: b.levelId ?? defaultLevelId,
          shape: b.shape ?? "rectangular",
          width: b.width ?? 0.2,
          depth: b.depth ?? 0.4,
          rotation: b.rotation ?? 0,
          materialId: b.materialId ?? b.systemTypeId
        };
        if (b.baseLine !== void 0) seed.baseLine = b.baseLine;
        let beam;
        try {
          beam = Beam.parse(seed);
        } catch (parseErr) {
          throw new BeamSchemaError(
            new Error(`beam.batch.create — beams[${i}] (id=${id})`, { cause: parseErr })
          );
        }
        fresh.push(beam);
      }
      const [next, forward, inverse] = produceCommand(ctx.stores.beam, (draft) => {
        for (const b of fresh) draft[b.id] = b;
      });
      return { forward, inverse, nextStates: { beam: next } };
    });
  }
}

const BEAM_MATERIAL_UNREACHABLE = "A beam's material now resolves and persists (BeamData.materialId is rendered by BeamFragmentBuilder and round-trips through save/load), but THIS command still cannot reach it: the bus hands this handler a detached plugin DTO store, not the geometry store the builder and persistence read, and there is no bridge between them. Writing here would report success and change nothing you could see. Set the material through a command in packages/command-registry (CreateBeamCommand accepts materialId), or bridge this verb to the geometry store as L-815 did for wall.updateDimensions.";
class SetBeamMaterialHandler {
  type = "beam.setMaterial";
  affectedStores = ["beam"];
  canExecute(ctx, cmd) {
    if (typeof cmd.beamId !== "string" || cmd.beamId.length === 0) {
      return { valid: false, reason: "beamId must be a non-empty string" };
    }
    if (cmd.materialId === void 0 && cmd.materialColor === void 0) {
      return { valid: false, reason: "at least one of materialId / materialColor must be provided" };
    }
    if (cmd.materialColor !== void 0 && cmd.materialColor.length === 0) {
      return { valid: false, reason: "materialColor must be non-empty when provided" };
    }
    if (cmd.materialId !== void 0 && cmd.materialId !== null && cmd.materialId.length === 0) {
      return { valid: false, reason: "materialId must be non-empty when provided" };
    }
    if (!ctx.stores.beam[cmd.beamId]) {
      return { valid: false, reason: `beam not found: ${cmd.beamId}` };
    }
    return { valid: false, reason: BEAM_MATERIAL_UNREACHABLE };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      if (!ctx.stores.beam[cmd.beamId]) throw new BeamNotFoundError(cmd.beamId);
      const [next, forward, inverse] = produceCommand(ctx.stores.beam, (draft) => {
        const b = draft[cmd.beamId];
        if (!b) return;
        if (cmd.materialId === null) delete b.materialId;
        else if (cmd.materialId !== void 0) b.materialId = cmd.materialId;
      });
      return { forward, inverse, nextStates: { beam: next } };
    });
  }
}

class ChangeBeamLevelHandler {
  type = "beam.changeLevel";
  affectedStores = ["beam"];
  canExecute(ctx, cmd) {
    if (typeof cmd.beamId !== "string" || cmd.beamId.length === 0) {
      return { valid: false, reason: "beamId must be a non-empty string" };
    }
    if (typeof cmd.levelId !== "string" || cmd.levelId.length === 0) {
      return { valid: false, reason: "levelId must be a non-empty string" };
    }
    if (!Object.prototype.hasOwnProperty.call(ctx.stores.beam, cmd.beamId)) {
      return { valid: false, reason: `beam not found: ${cmd.beamId}` };
    }
    if (ctx.stores.beam[cmd.beamId]?.levelId === cmd.levelId) {
      return { valid: false, reason: `beam ${cmd.beamId} is already on level ${cmd.levelId}` };
    }
    return { valid: true };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      const [next, forward, inverse] = produceCommand(ctx.stores.beam, (draft) => {
        const b = draft[cmd.beamId];
        if (b === void 0) return;
        b.levelId = cmd.levelId;
      });
      return { forward, inverse, nextStates: { beam: next } };
    });
  }
}

function buildBeamHandlerSet() {
  return [
    new CreateBeamHandler(),
    new CreateBeamBatchHandler(),
    new DeleteBeamHandler(),
    new MoveBeamHandler(),
    new SetBeamTypeHandler(),
    new SetBeamSectionHandler(),
    new SetBeamMaterialHandler(),
    new ChangeBeamLevelHandler()
  ];
}

class StairStore extends Store {
  constructor() {
    super("stair");
  }
  /** Convenience read — every stair id currently in the store. */
  ids() {
    return [...this.state.keys()];
  }
  /** Convenience read — every stair on a given level.  O(N). */
  byLevel(levelId) {
    const out = [];
    for (const s of this.state.values()) {
      if (s.levelId === levelId) out.push(s);
    }
    return out;
  }
  /** Lookup by id; returns `undefined` when missing. */
  get(id) {
    return this.state.get(id);
  }
}

class StairSystemError extends Error {
  constructor(message) {
    super(message);
    this.name = "StairSystemError";
  }
}
class StairNotFoundError extends StairSystemError {
  constructor(id) {
    super(`Stair not found: ${id}`);
    this.name = "StairNotFoundError";
  }
}
class StairSchemaError extends StairSystemError {
  constructor(cause) {
    super(`Stair schema validation failed: ${cause?.message ?? cause}`);
    this.cause = cause;
    this.name = "StairSchemaError";
  }
  cause;
}
class StairGeometryError extends StairSystemError {
  constructor(reason) {
    super(`Stair geometry invariant violated: ${reason}`);
    this.name = "StairGeometryError";
  }
}
class StairRiserCountError extends StairSystemError {
  constructor(n) {
    super(`Stair must have at least 2 risers (got ${n}).`);
    this.name = "StairRiserCountError";
  }
}

class DeleteStairHandler {
  type = "stair.delete";
  affectedStores = ["stair"];
  canExecute(ctx, cmd) {
    return ctx.stores.stair[cmd.stairId] ? { valid: true } : { valid: false, reason: `stair not found: ${cmd.stairId}` };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      if (!ctx.stores.stair[cmd.stairId]) throw new StairNotFoundError(cmd.stairId);
      const [next, forward, inverse] = produceCommand(ctx.stores.stair, (draft) => {
        delete draft[cmd.stairId];
      });
      return { forward, inverse, nextStates: { stair: next } };
    });
  }
}

function isFiniteVec3$8(v) {
  if (typeof v !== "object" || v === null) return false;
  const r = v;
  return Number.isFinite(r.x) && Number.isFinite(r.y) && Number.isFinite(r.z);
}
function validateStairDims(dims) {
  if (dims.treadDepth !== void 0 && (!Number.isFinite(dims.treadDepth) || dims.treadDepth <= 0)) {
    return { ok: false, reason: "treadDepth must be > 0" };
  }
  if (dims.riserHeight !== void 0 && (!Number.isFinite(dims.riserHeight) || dims.riserHeight <= 0)) {
    return { ok: false, reason: "riserHeight must be > 0" };
  }
  if (dims.width !== void 0 && (!Number.isFinite(dims.width) || dims.width <= 0)) {
    return { ok: false, reason: "width must be > 0" };
  }
  if (dims.numRisers !== void 0) {
    if (!Number.isInteger(dims.numRisers)) return { ok: false, reason: "numRisers must be an integer" };
    if (dims.numRisers < 2) return { ok: false, reason: "numRisers must be ≥ 2" };
  }
  return { ok: true };
}

function legacyStairStore() {
  if (typeof window === "undefined") return void 0;
  return window.stairStore;
}
function legacyHasStair(stairId) {
  const store = legacyStairStore();
  return !!store?.get?.(stairId);
}
function bridgeLegacyMove(cmd) {
  if (typeof window === "undefined") return false;
  if (!legacyHasStair(cmd.stairId)) return false;
  const cm = window.commandManager;
  if (!cm) {
    console.error("[stair.move.handler] geometry stair exists but commandManager is unavailable — move not persisted.");
    return false;
  }
  try {
    cm.execute(new MoveStairCommand({ stairId: cmd.stairId, delta: cmd.delta }));
    return true;
  } catch (e) {
    console.error("[stair.move.handler] MoveStairCommand bridge failed:", e);
    return false;
  }
}
class MoveStairHandler {
  type = "stair.move";
  affectedStores = ["stair"];
  canExecute(ctx, cmd) {
    if (!isFiniteVec3$8(cmd.delta)) return { valid: false, reason: "delta must be a finite Vec3" };
    if (ctx.stores.stair[cmd.stairId]) return { valid: true };
    if (legacyHasStair(cmd.stairId)) return { valid: true };
    return { valid: false, reason: `stair not found: ${cmd.stairId}` };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      const s = ctx.stores.stair[cmd.stairId];
      const bridged = bridgeLegacyMove(cmd);
      if (!s) {
        if (!bridged) throw new StairNotFoundError(cmd.stairId);
        return { forward: [], inverse: [] };
      }
      const [next, forward, inverse] = produceCommand(ctx.stores.stair, (draft) => {
        const dto = draft[cmd.stairId];
        if (!dto) return;
        draft[cmd.stairId] = {
          ...dto,
          origin: {
            x: dto.origin.x + cmd.delta.x,
            y: dto.origin.y + cmd.delta.y,
            z: dto.origin.z + cmd.delta.z
          }
        };
      });
      return { forward, inverse, nextStates: { stair: next } };
    });
  }
}

class SetStairTypeHandler {
  type = "stair.setType";
  affectedStores = ["stair"];
  canExecute(ctx, cmd) {
    return ctx.stores.stair[cmd.stairId] ? { valid: true } : { valid: false, reason: `stair not found: ${cmd.stairId}` };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      if (!ctx.stores.stair[cmd.stairId]) throw new StairNotFoundError(cmd.stairId);
      const [next, forward, inverse] = produceCommand(ctx.stores.stair, (draft) => {
        const dto = draft[cmd.stairId];
        if (!dto) return;
        draft[cmd.stairId] = { ...dto, materialId: cmd.materialId };
      });
      return { forward, inverse, nextStates: { stair: next } };
    });
  }
}

const VALID_SHAPES$1 = ["straight", "l-shape", "u-shape", "spiral"];
class SetStairShapeHandler {
  type = "stair.setShape";
  affectedStores = ["stair"];
  canExecute(ctx, cmd) {
    if (!VALID_SHAPES$1.includes(cmd.shape)) {
      return { valid: false, reason: `unknown stair shape: ${cmd.shape}` };
    }
    return ctx.stores.stair[cmd.stairId] ? { valid: true } : { valid: false, reason: `stair not found: ${cmd.stairId}` };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      if (!ctx.stores.stair[cmd.stairId]) throw new StairNotFoundError(cmd.stairId);
      const [next, forward, inverse] = produceCommand(ctx.stores.stair, (draft) => {
        const dto = draft[cmd.stairId];
        if (!dto) return;
        draft[cmd.stairId] = { ...dto, shape: cmd.shape };
      });
      return { forward, inverse, nextStates: { stair: next } };
    });
  }
}

class SetTreadCountHandler {
  type = "stair.setTreadCount";
  affectedStores = ["stair"];
  canExecute(ctx, cmd) {
    if (!Number.isInteger(cmd.numRisers) || cmd.numRisers < 2) {
      return { valid: false, reason: "numRisers must be an integer ≥ 2" };
    }
    return ctx.stores.stair[cmd.stairId] ? { valid: true } : { valid: false, reason: `stair not found: ${cmd.stairId}` };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      if (!ctx.stores.stair[cmd.stairId]) throw new StairNotFoundError(cmd.stairId);
      if (cmd.numRisers < 2) throw new StairRiserCountError(cmd.numRisers);
      const [next, forward, inverse] = produceCommand(ctx.stores.stair, (draft) => {
        const dto = draft[cmd.stairId];
        if (!dto) return;
        draft[cmd.stairId] = { ...dto, numRisers: cmd.numRisers };
      });
      return { forward, inverse, nextStates: { stair: next } };
    });
  }
}

class SetRiserHeightHandler {
  type = "stair.setRiserHeight";
  affectedStores = ["stair"];
  canExecute(ctx, cmd) {
    if (!Number.isFinite(cmd.riserHeight) || cmd.riserHeight <= 0) {
      return { valid: false, reason: "riserHeight must be > 0" };
    }
    return ctx.stores.stair[cmd.stairId] ? { valid: true } : { valid: false, reason: `stair not found: ${cmd.stairId}` };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      if (!ctx.stores.stair[cmd.stairId]) throw new StairNotFoundError(cmd.stairId);
      if (cmd.riserHeight <= 0) throw new StairGeometryError("riserHeight must be > 0");
      const [next, forward, inverse] = produceCommand(ctx.stores.stair, (draft) => {
        const dto = draft[cmd.stairId];
        if (!dto) return;
        draft[cmd.stairId] = { ...dto, riserHeight: cmd.riserHeight };
      });
      return { forward, inverse, nextStates: { stair: next } };
    });
  }
}

class SetWidthHandler {
  type = "stair.setWidth";
  affectedStores = ["stair"];
  canExecute(ctx, cmd) {
    if (!Number.isFinite(cmd.width) || cmd.width <= 0) {
      return { valid: false, reason: "width must be > 0" };
    }
    return ctx.stores.stair[cmd.stairId] ? { valid: true } : { valid: false, reason: `stair not found: ${cmd.stairId}` };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      if (!ctx.stores.stair[cmd.stairId]) throw new StairNotFoundError(cmd.stairId);
      if (cmd.width <= 0) throw new StairGeometryError("width must be > 0");
      const [next, forward, inverse] = produceCommand(ctx.stores.stair, (draft) => {
        const dto = draft[cmd.stairId];
        if (!dto) return;
        draft[cmd.stairId] = { ...dto, width: cmd.width };
      });
      return { forward, inverse, nextStates: { stair: next } };
    });
  }
}

const STAIR_ROTATE_UNREACHABLE = "stair.rotate writes the detached plugin stair store that nothing renders, exports or persists, and no production surface dispatches it. Note the asymmetry, and that it is the honest answer: stair TRANSLATION is live (stair.move — payload keys: stairId, delta — bridges to MoveStairCommand and the geometry stairStore), but stair ROTATION has NO live route on any surface. There is nothing to redirect you to; a live rotate needs a stair rotate bridge to the geometry stairStore, tracked under Gate G7.";
class RotateStairHandler {
  type = "stair.rotate";
  affectedStores = ["stair"];
  /** Payload validation ONLY — kept public so a delegating facade can reuse it. */
  validatePayload(ctx, cmd) {
    if (!Number.isFinite(cmd.rotation)) return { valid: false, reason: "rotation must be finite" };
    return ctx.stores.stair[cmd.stairId] ? { valid: true } : { valid: false, reason: `stair not found: ${cmd.stairId}` };
  }
  /**
   * §FIX-DEAD-MOVE-VERB-REFUSE (W3-4) — ORDER IS LOAD-BEARING. `canExecute` must be the
   * LAST method before `execute`. `tools/ga-gate/check-verb-register.ts` classifies a
   * verb as REFUSES by slicing the source from `canExecute` to the next `execute(` and
   * checking that the slice can never yield an ACCEPTING validation result. With
   * `validatePayload` sitting between them, its accepting branch lands inside that slice
   * and the verb is mis-reported as UNKNOWN — a refusal hiding from the register that
   * exists to find it. (For the same reason this comment must not spell the accepting
   * literal out: the detector is a regex over source text, and prose is source text.)
   * Do not reorder these two methods.
   */
  canExecute(ctx, cmd) {
    const v = this.validatePayload(ctx, cmd);
    if (!v.valid) return v;
    return { valid: false, reason: STAIR_ROTATE_UNREACHABLE };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      if (!ctx.stores.stair[cmd.stairId]) throw new StairNotFoundError(cmd.stairId);
      const [next, forward, inverse] = produceCommand(ctx.stores.stair, (draft) => {
        const dto = draft[cmd.stairId];
        if (!dto) return;
        draft[cmd.stairId] = { ...dto, rotation: cmd.rotation };
      });
      return { forward, inverse, nextStates: { stair: next } };
    });
  }
}

class CreateStairBatchHandler {
  type = "stair.batch.create";
  affectedStores = ["stair"];
  canExecute(_ctx, cmd) {
    if (!Array.isArray(cmd.stairs) || cmd.stairs.length === 0) {
      return { valid: false, reason: "stairs array must be non-empty" };
    }
    for (let i = 0; i < cmd.stairs.length; i++) {
      const s = cmd.stairs[i];
      if (s.origin !== void 0 && !isFiniteVec3$8(s.origin)) {
        return { valid: false, reason: `stairs[${i}].origin must be a finite Vec3` };
      }
      const v = validateStairDims(s);
      if (!v.ok) {
        return { valid: false, reason: `stairs[${i}]: ${v.reason ?? "invalid dimensions"}` };
      }
    }
    return { valid: true };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(
      this.type + ".handler",
      { "pryzm.command.type": this.type, "pryzm.batch.size": cmd.stairs.length },
      () => {
        const parsed = [];
        const existing = ctx.stores.stair;
        for (const entry of cmd.stairs) {
          const id = entry.id ?? createId("stair");
          if (existing[id]) throw new StairGeometryError(`stair id ${id} already exists`);
          const seed = {
            id,
            levelId: entry.levelId ?? "",
            topLevelId: entry.topLevelId ?? "",
            shape: entry.shape ?? "straight",
            rotation: entry.rotation ?? 0,
            treadDepth: entry.treadDepth ?? 0.28,
            riserHeight: entry.riserHeight ?? 0.18,
            width: entry.width ?? 1,
            numRisers: entry.numRisers ?? 15,
            materialId: entry.materialId
          };
          seed.origin = entry.origin ?? { x: 0, y: 0, z: 0 };
          if (seed.numRisers !== void 0 && seed.numRisers < 2) {
            throw new StairRiserCountError(seed.numRisers);
          }
          let stair;
          try {
            stair = Stair.parse(seed);
          } catch (err) {
            throw new StairSchemaError(err);
          }
          parsed.push(stair);
        }
        const [next, forward, inverse] = produceCommand(
          ctx.stores.stair,
          (draft) => {
            for (const stair of parsed) {
              draft[stair.id] = stair;
            }
          }
        );
        return { forward, inverse, nextStates: { stair: next } };
      }
    );
  }
}

const CreateStairRailingHandler = {
  type: "stair.createRailing",
  affectedStores: [],
  canExecute(ctx, cmd) {
    if (!cmd.stairId || typeof cmd.stairId !== "string" || cmd.stairId.trim() === "") {
      return { valid: false, reason: "stairId is required and must be a non-empty string" };
    }
    const stairStore = ctx.stores["stairStore"];
    if (stairStore !== void 0) {
      const stair = stairStore.getById?.(cmd.stairId) ?? stairStore.get?.(cmd.stairId) ?? stairStore[cmd.stairId];
      if (!stair) {
        return {
          valid: false,
          reason: `Stair ID '${cmd.stairId}' does not exist in stairStore — railing cannot be built`
        };
      }
    }
    return { valid: true };
  },
  execute(_ctx, cmd) {
    return withHandlerSpan("stair.createRailing.handler", { "pryzm.command.type": "stair.createRailing" }, () => {
      const cm = window.commandManager;
      if (!cm) {
        console.error(
          "[stair.createRailing.handler] window.commandManager is undefined — ",
          "railing for stair " + cmd.stairId + " will NOT be created. ",
          "This usually means the bridge fired before initTools assigned ",
          "window.commandManager (race condition); check initialisation order."
        );
        return { forward: [], inverse: [] };
      }
      try {
        cm.execute(new CreateStairRailingCommand(cmd));
      } catch (e) {
        console.error("[stair.createRailing.handler] bridge failed:", e);
      }
      return { forward: [], inverse: [] };
    });
  }
};

const UpdateStairParametersHandler = {
  type: "stair.updateParameters",
  affectedStores: [],
  canExecute(_ctx, cmd) {
    if (!cmd.stairId) return { valid: false, reason: "stairId is required" };
    return { valid: true };
  },
  execute(_ctx, cmd) {
    return withHandlerSpan("stair.updateParameters.handler", { "pryzm.command.type": "stair.updateParameters" }, () => {
      const cm = window.commandManager;
      if (cm) {
        try {
          cm.execute(new UpdateStairParametersCommand({ stairId: cmd.stairId, updates: cmd.updates }));
        } catch (e) {
          console.error("[stair.updateParameters.handler] bridge failed:", e);
        }
      }
      return { forward: [], inverse: [] };
    });
  }
};

const STAIR_MATERIAL_UNREACHABLE = "StairData has no materialId/materialColor. Its only material field is `properties.material`, a fixed ENUM (concrete|steel|timber|marble|glass|composite) resolved by StairMaterialResolver — not a catalogue id and not a hex colour — so a catalogue material cannot be expressed on a stair. Set the stair material ENUM instead; tracked under Gate G7.";
class SetStairMaterialHandler {
  type = "stair.setMaterial";
  affectedStores = ["stair"];
  canExecute(ctx, cmd) {
    if (typeof cmd.stairId !== "string" || cmd.stairId.length === 0) {
      return { valid: false, reason: "stairId must be a non-empty string" };
    }
    if (cmd.materialId === void 0 && cmd.materialColor === void 0) {
      return { valid: false, reason: "at least one of materialId / materialColor must be provided" };
    }
    if (cmd.materialColor !== void 0 && cmd.materialColor.length === 0) {
      return { valid: false, reason: "materialColor must be non-empty when provided" };
    }
    if (cmd.materialId !== void 0 && cmd.materialId !== null && cmd.materialId.length === 0) {
      return { valid: false, reason: "materialId must be non-empty when provided" };
    }
    if (!ctx.stores.stair[cmd.stairId]) {
      return { valid: false, reason: `stair not found: ${cmd.stairId}` };
    }
    return { valid: false, reason: STAIR_MATERIAL_UNREACHABLE };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      if (!ctx.stores.stair[cmd.stairId]) throw new StairNotFoundError(cmd.stairId);
      const [next, forward, inverse] = produceCommand(ctx.stores.stair, (draft) => {
        const s = draft[cmd.stairId];
        if (!s) return;
        if (cmd.materialId === null) delete s.materialId;
        else if (cmd.materialId !== void 0) s.materialId = cmd.materialId;
      });
      return { forward, inverse, nextStates: { stair: next } };
    });
  }
}

function buildStairHandlerSet() {
  return [
    new CreateStairBatchHandler(),
    new DeleteStairHandler(),
    new MoveStairHandler(),
    new SetStairTypeHandler(),
    new SetStairShapeHandler(),
    new SetTreadCountHandler(),
    new SetRiserHeightHandler(),
    new SetWidthHandler(),
    new RotateStairHandler(),
    CreateStairRailingHandler,
    UpdateStairParametersHandler,
    new SetStairMaterialHandler()
  ];
}

class HandrailStore extends Store {
  constructor() {
    super("handrail");
  }
  ids() {
    return [...this.state.keys()];
  }
  byHost(hostId) {
    const out = [];
    for (const h of this.state.values()) if (h.hostId === hostId) out.push(h);
    return out;
  }
  get(id) {
    return this.state.get(id);
  }
}

class HandrailSystemError extends Error {
  constructor(message) {
    super(message);
    this.name = "HandrailSystemError";
  }
}
class HandrailNotFoundError extends HandrailSystemError {
  constructor(id) {
    super(`Handrail not found: ${id}`);
    this.name = "HandrailNotFoundError";
  }
}
class HandrailSchemaError extends HandrailSystemError {
  constructor(cause) {
    super(`Handrail schema validation failed: ${cause?.message ?? cause}`);
    this.cause = cause;
    this.name = "HandrailSchemaError";
  }
  cause;
}
class HandrailGeometryError extends HandrailSystemError {
  constructor(reason) {
    super(`Handrail geometry invariant violated: ${reason}`);
    this.name = "HandrailGeometryError";
  }
}

function isFiniteVec3$7(v) {
  if (typeof v !== "object" || v === null) return false;
  const r = v;
  return Number.isFinite(r.x) && Number.isFinite(r.y) && Number.isFinite(r.z);
}
function validateHandrailPath(path) {
  if (path.length < 2) return { ok: false, reason: "path must have ≥ 2 points" };
  for (const p of path) if (!isFiniteVec3$7(p)) return { ok: false, reason: "path points must be finite Vec3" };
  const a = path[0];
  const b = path[path.length - 1];
  if (a.x === b.x && a.y === b.y && a.z === b.z) {
    return { ok: false, reason: "first / last path points must differ (zero-length rail)" };
  }
  return { ok: true };
}

class CreateHandrailHandler {
  type = "handrail.create";
  affectedStores = ["handrail"];
  canExecute(_ctx, cmd) {
    if (cmd.path !== void 0) {
      const v = validateHandrailPath(cmd.path);
      if (!v.ok) return { valid: false, reason: v.reason ?? "invalid path" };
    }
    if (cmd.height !== void 0 && (!Number.isFinite(cmd.height) || cmd.height <= 0)) {
      return { valid: false, reason: "height must be > 0" };
    }
    if (cmd.diameter !== void 0 && (!Number.isFinite(cmd.diameter) || cmd.diameter <= 0)) {
      return { valid: false, reason: "diameter must be > 0" };
    }
    return { valid: true };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      const id = cmd.id ?? createId("handrail");
      const seed = {
        id,
        levelId: cmd.levelId ?? "",
        shape: cmd.shape ?? "round",
        height: cmd.height ?? 1,
        diameter: cmd.diameter ?? 0.04,
        materialId: cmd.materialId
      };
      seed.path = cmd.path ?? [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }];
      if (cmd.hostId !== void 0) seed.hostId = cmd.hostId;
      let handrail;
      try {
        handrail = Handrail.parse(seed);
      } catch (err) {
        throw new HandrailSchemaError(err);
      }
      const existing = ctx.stores.handrail;
      if (existing[id]) throw new HandrailGeometryError(`handrail id ${id} already exists`);
      const [next, forward, inverse] = produceCommand(ctx.stores.handrail, (draft) => {
        draft[handrail.id] = handrail;
      });
      return { forward, inverse, nextStates: { handrail: next } };
    });
  }
}

class DeleteHandrailHandler {
  type = "handrail.delete";
  affectedStores = ["handrail"];
  canExecute(ctx, cmd) {
    return ctx.stores.handrail[cmd.handrailId] ? { valid: true } : { valid: false, reason: `handrail not found: ${cmd.handrailId}` };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      if (!ctx.stores.handrail[cmd.handrailId]) throw new HandrailNotFoundError(cmd.handrailId);
      const [next, forward, inverse] = produceCommand(ctx.stores.handrail, (draft) => {
        delete draft[cmd.handrailId];
      });
      return { forward, inverse, nextStates: { handrail: next } };
    });
  }
}

class SetHandrailPathHandler {
  type = "handrail.setPath";
  affectedStores = ["handrail"];
  canExecute(ctx, cmd) {
    const v = validateHandrailPath(cmd.path);
    if (!v.ok) return { valid: false, reason: v.reason ?? "invalid path" };
    return ctx.stores.handrail[cmd.handrailId] ? { valid: true } : { valid: false, reason: `handrail not found: ${cmd.handrailId}` };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      if (!ctx.stores.handrail[cmd.handrailId]) throw new HandrailNotFoundError(cmd.handrailId);
      const v = validateHandrailPath(cmd.path);
      if (!v.ok) throw new HandrailGeometryError(v.reason ?? "path invalid");
      const [next, forward, inverse] = produceCommand(ctx.stores.handrail, (draft) => {
        const dto = draft[cmd.handrailId];
        if (!dto) return;
        draft[cmd.handrailId] = { ...dto, path: cmd.path };
      });
      return { forward, inverse, nextStates: { handrail: next } };
    });
  }
}

const VALID_SHAPES = ["round", "square", "flat"];
class SetHandrailShapeHandler {
  type = "handrail.setShape";
  affectedStores = ["handrail"];
  canExecute(ctx, cmd) {
    if (!VALID_SHAPES.includes(cmd.shape)) {
      return { valid: false, reason: `unknown handrail shape: ${cmd.shape}` };
    }
    return ctx.stores.handrail[cmd.handrailId] ? { valid: true } : { valid: false, reason: `handrail not found: ${cmd.handrailId}` };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      if (!ctx.stores.handrail[cmd.handrailId]) throw new HandrailNotFoundError(cmd.handrailId);
      const [next, forward, inverse] = produceCommand(ctx.stores.handrail, (draft) => {
        const dto = draft[cmd.handrailId];
        if (!dto) return;
        draft[cmd.handrailId] = { ...dto, shape: cmd.shape };
      });
      return { forward, inverse, nextStates: { handrail: next } };
    });
  }
}

class SetHandrailHostHandler {
  type = "handrail.setHost";
  affectedStores = ["handrail"];
  canExecute(ctx, cmd) {
    return ctx.stores.handrail[cmd.handrailId] ? { valid: true } : { valid: false, reason: `handrail not found: ${cmd.handrailId}` };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      if (!ctx.stores.handrail[cmd.handrailId]) throw new HandrailNotFoundError(cmd.handrailId);
      const [next, forward, inverse] = produceCommand(ctx.stores.handrail, (draft) => {
        const dto = draft[cmd.handrailId];
        if (!dto) return;
        draft[cmd.handrailId] = { ...dto, hostId: cmd.hostId };
      });
      return { forward, inverse, nextStates: { handrail: next } };
    });
  }
}

class RecomputeHandrailHandler {
  type = "handrail.recompute";
  affectedStores = ["handrail"];
  canExecute(ctx, cmd) {
    const v = validateHandrailPath(cmd.path);
    if (!v.ok) return { valid: false, reason: v.reason ?? "invalid path" };
    return ctx.stores.handrail[cmd.handrailId] ? { valid: true } : { valid: false, reason: `handrail not found: ${cmd.handrailId}` };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      if (!ctx.stores.handrail[cmd.handrailId]) throw new HandrailNotFoundError(cmd.handrailId);
      const v = validateHandrailPath(cmd.path);
      if (!v.ok) throw new HandrailGeometryError(v.reason ?? "path invalid");
      const [next, forward, inverse] = produceCommand(ctx.stores.handrail, (draft) => {
        const dto = draft[cmd.handrailId];
        if (!dto) return;
        draft[cmd.handrailId] = { ...dto, path: cmd.path };
      });
      return { forward, inverse, nextStates: { handrail: next } };
    });
  }
}

const HANDRAIL_MATERIAL_UNREACHABLE = "It writes the detached plugin DTO store that nothing renders (§FIX-MATERIAL-DEAD-DISPATCH). Use `handrail.updateColor`, which reaches handrailStore. Note that HandrailFragmentBuilder has NO material-library lookup — it reads only `materialColor` — so a catalogue materialId cannot be shown on a handrail at all; pick a colour override.";
class SetHandrailMaterialHandler {
  type = "handrail.setMaterial";
  affectedStores = ["handrail"];
  canExecute(ctx, cmd) {
    if (typeof cmd.handrailId !== "string" || cmd.handrailId.length === 0) {
      return { valid: false, reason: "handrailId must be a non-empty string" };
    }
    if (cmd.materialId === void 0 && cmd.materialColor === void 0) {
      return { valid: false, reason: "at least one of materialId / materialColor must be provided" };
    }
    if (cmd.materialColor !== void 0 && cmd.materialColor.length === 0) {
      return { valid: false, reason: "materialColor must be non-empty when provided" };
    }
    if (cmd.materialId !== void 0 && cmd.materialId !== null && cmd.materialId.length === 0) {
      return { valid: false, reason: "materialId must be non-empty when provided" };
    }
    if (!ctx.stores.handrail[cmd.handrailId]) {
      return { valid: false, reason: `handrail not found: ${cmd.handrailId}` };
    }
    return { valid: false, reason: HANDRAIL_MATERIAL_UNREACHABLE };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      if (!ctx.stores.handrail[cmd.handrailId]) throw new HandrailNotFoundError(cmd.handrailId);
      const [next, forward, inverse] = produceCommand(ctx.stores.handrail, (draft) => {
        const h = draft[cmd.handrailId];
        if (!h) return;
        if (cmd.materialId === null) delete h.materialId;
        else if (cmd.materialId !== void 0) h.materialId = cmd.materialId;
      });
      return { forward, inverse, nextStates: { handrail: next } };
    });
  }
}

class ChangeHandrailLevelHandler {
  type = "handrail.changeLevel";
  affectedStores = ["handrail"];
  canExecute(ctx, cmd) {
    if (typeof cmd.handrailId !== "string" || cmd.handrailId.length === 0) {
      return { valid: false, reason: "handrailId must be a non-empty string" };
    }
    if (typeof cmd.levelId !== "string" || cmd.levelId.length === 0) {
      return { valid: false, reason: "levelId must be a non-empty string" };
    }
    if (!Object.prototype.hasOwnProperty.call(ctx.stores.handrail, cmd.handrailId)) {
      return { valid: false, reason: `handrail not found: ${cmd.handrailId}` };
    }
    if (ctx.stores.handrail[cmd.handrailId]?.levelId === cmd.levelId) {
      return { valid: false, reason: `handrail ${cmd.handrailId} is already on level ${cmd.levelId}` };
    }
    return { valid: true };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      const [next, forward, inverse] = produceCommand(ctx.stores.handrail, (draft) => {
        const h = draft[cmd.handrailId];
        if (h === void 0) return;
        h.levelId = cmd.levelId;
      });
      return { forward, inverse, nextStates: { handrail: next } };
    });
  }
}

function buildHandrailHandlerSet() {
  return [
    new CreateHandrailHandler(),
    new DeleteHandrailHandler(),
    new SetHandrailPathHandler(),
    new SetHandrailShapeHandler(),
    new SetHandrailHostHandler(),
    new RecomputeHandrailHandler(),
    new SetHandrailMaterialHandler(),
    new ChangeHandrailLevelHandler()
  ];
}

class CeilingStore extends Store {
  constructor() {
    super("ceiling");
  }
  ids() {
    return [...this.state.keys()];
  }
  byLevel(levelId) {
    const out = [];
    for (const c of this.state.values()) if (c.levelId === levelId) out.push(c);
    return out;
  }
  get(id) {
    return this.state.get(id);
  }
}

class CeilingSystemError extends Error {
  constructor(message) {
    super(message);
    this.name = "CeilingSystemError";
  }
}
class CeilingNotFoundError extends CeilingSystemError {
  constructor(id) {
    super(`Ceiling not found: ${id}`);
    this.name = "CeilingNotFoundError";
  }
}
class CeilingSchemaError extends CeilingSystemError {
  constructor(cause) {
    super(`Ceiling schema validation failed: ${cause?.message ?? cause}`);
    this.cause = cause;
    this.name = "CeilingSchemaError";
  }
  cause;
}
class CeilingGeometryError extends CeilingSystemError {
  constructor(reason) {
    super(`Ceiling geometry invariant violated: ${reason}`);
    this.name = "CeilingGeometryError";
  }
}

function isFiniteVec3$6(v) {
  if (typeof v !== "object" || v === null) return false;
  const r = v;
  return Number.isFinite(r.x) && Number.isFinite(r.y) && Number.isFinite(r.z);
}
function polygonSignedArea(boundary) {
  let s = 0;
  for (let i = 0; i < boundary.length; i++) {
    const a = boundary[i];
    const b = boundary[(i + 1) % boundary.length];
    s += a.x * b.z - b.x * a.z;
  }
  return s * 0.5;
}
function distinctCornerCount(b, eps = 1e-3) {
  const pts = [];
  for (const p of b) {
    const prev = pts[pts.length - 1];
    if (prev && Math.hypot(p.x - prev.x, p.z - prev.z) < eps) continue;
    pts.push({ x: p.x, z: p.z });
  }
  if (pts.length >= 2) {
    const a = pts[0], z = pts[pts.length - 1];
    if (Math.hypot(a.x - z.x, a.z - z.z) < eps) pts.pop();
  }
  return pts.length;
}
const MIN_CEILING_AREA_M2 = 0.05;
function validateCeilingBoundary(b) {
  if (b.length < 3) return { ok: false, reason: "boundary requires ≥ 3 points" };
  for (const p of b) if (!isFiniteVec3$6(p)) return { ok: false, reason: "boundary points must be finite Vec3" };
  if (distinctCornerCount(b) < 3) return { ok: false, reason: "boundary has < 3 distinct corners (collinear/coincident → degenerate)" };
  const area = Math.abs(polygonSignedArea(b));
  if (area < MIN_CEILING_AREA_M2) return { ok: false, reason: `boundary area ${area.toFixed(4)} m² < ${MIN_CEILING_AREA_M2} m² (degenerate)` };
  return { ok: true };
}

class CreateCeilingHandler {
  type = "ceiling.create";
  affectedStores = ["ceiling"];
  canExecute(_ctx, cmd) {
    if (cmd.boundary !== void 0) {
      const v = validateCeilingBoundary(cmd.boundary);
      if (!v.ok) return { valid: false, reason: v.reason ?? "invalid boundary" };
    }
    if (cmd.ceilingHeight !== void 0 && (!Number.isFinite(cmd.ceilingHeight) || cmd.ceilingHeight <= 0)) {
      return { valid: false, reason: "ceilingHeight must be > 0" };
    }
    if (cmd.thickness !== void 0 && (!Number.isFinite(cmd.thickness) || cmd.thickness <= 0)) {
      return { valid: false, reason: "thickness must be > 0" };
    }
    if (cmd.thickness !== void 0 && cmd.ceilingHeight !== void 0 && cmd.thickness >= cmd.ceilingHeight) {
      return { valid: false, reason: "thickness must be < ceilingHeight" };
    }
    return { valid: true };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      const id = cmd.id ?? createId("ceiling");
      const seed = {
        id,
        levelId: cmd.levelId ?? "",
        ceilingHeight: cmd.ceilingHeight ?? 2.7,
        thickness: cmd.thickness ?? 0.05,
        materialId: cmd.materialId,
        materialColor: cmd.materialColor
      };
      if (cmd.boundary) seed.boundary = cmd.boundary;
      if (seed.thickness !== void 0 && seed.ceilingHeight !== void 0 && seed.thickness >= seed.ceilingHeight) {
        throw new CeilingGeometryError("thickness must be < ceilingHeight");
      }
      if (seed.boundary) {
        const v = validateCeilingBoundary(seed.boundary);
        if (!v.ok) throw new CeilingGeometryError(v.reason ?? "invalid boundary");
      }
      let ceiling;
      try {
        ceiling = Ceiling.parse(seed);
      } catch (err) {
        throw new CeilingSchemaError(err);
      }
      const existing = ctx.stores.ceiling;
      if (existing[id]) throw new CeilingGeometryError(`ceiling id ${id} already exists`);
      const [next, forward, inverse] = produceCommand(ctx.stores.ceiling, (draft) => {
        draft[ceiling.id] = ceiling;
      });
      return { forward, inverse, nextStates: { ceiling: next } };
    });
  }
}

class DeleteCeilingHandler {
  type = "ceiling.delete";
  affectedStores = ["ceiling"];
  canExecute(ctx, cmd) {
    return ctx.stores.ceiling[cmd.ceilingId] ? { valid: true } : { valid: false, reason: `ceiling not found: ${cmd.ceilingId}` };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      if (!ctx.stores.ceiling[cmd.ceilingId]) throw new CeilingNotFoundError(cmd.ceilingId);
      const [next, forward, inverse] = produceCommand(ctx.stores.ceiling, (draft) => {
        delete draft[cmd.ceilingId];
      });
      return { forward, inverse, nextStates: { ceiling: next } };
    });
  }
}

class SetCeilingBoundaryHandler {
  type = "ceiling.setBoundary";
  affectedStores = ["ceiling"];
  canExecute(ctx, cmd) {
    const v = validateCeilingBoundary(cmd.boundary);
    if (!v.ok) return { valid: false, reason: v.reason ?? "invalid boundary" };
    return ctx.stores.ceiling[cmd.ceilingId] ? { valid: true } : { valid: false, reason: `ceiling not found: ${cmd.ceilingId}` };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      if (!ctx.stores.ceiling[cmd.ceilingId]) throw new CeilingNotFoundError(cmd.ceilingId);
      const v = validateCeilingBoundary(cmd.boundary);
      if (!v.ok) throw new CeilingGeometryError(v.reason ?? "invalid boundary");
      const [next, forward, inverse] = produceCommand(ctx.stores.ceiling, (draft) => {
        const dto = draft[cmd.ceilingId];
        if (!dto) return;
        draft[cmd.ceilingId] = { ...dto, boundary: cmd.boundary };
      });
      return { forward, inverse, nextStates: { ceiling: next } };
    });
  }
}

class SetCeilingHeightHandler {
  type = "ceiling.setHeight";
  affectedStores = ["ceiling"];
  canExecute(ctx, cmd) {
    if (!Number.isFinite(cmd.ceilingHeight) || cmd.ceilingHeight <= 0) {
      return { valid: false, reason: "ceilingHeight must be > 0" };
    }
    const dto = ctx.stores.ceiling[cmd.ceilingId];
    if (!dto) return { valid: false, reason: `ceiling not found: ${cmd.ceilingId}` };
    if (cmd.ceilingHeight <= dto.thickness) {
      return { valid: false, reason: "ceilingHeight must exceed thickness" };
    }
    return { valid: true };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      const dto = ctx.stores.ceiling[cmd.ceilingId];
      if (!dto) throw new CeilingNotFoundError(cmd.ceilingId);
      if (cmd.ceilingHeight <= dto.thickness) {
        throw new CeilingGeometryError("ceilingHeight must exceed thickness");
      }
      const [next, forward, inverse] = produceCommand(ctx.stores.ceiling, (draft) => {
        const cur = draft[cmd.ceilingId];
        if (!cur) return;
        draft[cmd.ceilingId] = { ...cur, ceilingHeight: cmd.ceilingHeight };
      });
      return { forward, inverse, nextStates: { ceiling: next } };
    });
  }
}

class CreateCeilingBatchHandler {
  type = "ceiling.batch.create";
  affectedStores = ["ceiling"];
  canExecute(_ctx, cmd) {
    if (!Array.isArray(cmd.ceilings) || cmd.ceilings.length === 0) {
      return { valid: false, reason: "ceilings must be a non-empty array" };
    }
    for (let i = 0; i < cmd.ceilings.length; i++) {
      const c = cmd.ceilings[i];
      if (c.id !== void 0 && (typeof c.id !== "string" || c.id.length === 0)) {
        return { valid: false, reason: `ceilings[${i}].id must be a non-empty string when provided` };
      }
      if (c.ceilingHeight !== void 0 && (!Number.isFinite(c.ceilingHeight) || c.ceilingHeight <= 0)) {
        return { valid: false, reason: `ceilings[${i}].ceilingHeight must be > 0` };
      }
      if (c.thickness !== void 0 && (!Number.isFinite(c.thickness) || c.thickness <= 0)) {
        return { valid: false, reason: `ceilings[${i}].thickness must be > 0` };
      }
      if (c.thickness !== void 0 && c.ceilingHeight !== void 0 && c.thickness >= c.ceilingHeight) {
        return { valid: false, reason: `ceilings[${i}].thickness must be < ceilingHeight` };
      }
      if (c.boundary !== void 0) {
        const v = validateCeilingBoundary(c.boundary);
        if (!v.ok) return { valid: false, reason: `ceilings[${i}].boundary: ${v.reason ?? "invalid"}` };
      }
    }
    return { valid: true };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      const defaultLevelId = cmd.levelId ?? "";
      const fresh = [];
      let droppedDegenerate = 0;
      for (let i = 0; i < cmd.ceilings.length; i++) {
        const c = cmd.ceilings[i];
        const id = c.id ?? createId("ceiling");
        const ceilingHeight = c.ceilingHeight ?? 2.7;
        const thickness = c.thickness ?? 0.05;
        if (thickness >= ceilingHeight) {
          throw new CeilingGeometryError(`ceilings[${i}]: thickness must be < ceilingHeight`);
        }
        if (c.boundary !== void 0) {
          const v = validateCeilingBoundary(c.boundary);
          if (!v.ok) {
            droppedDegenerate++;
            continue;
          }
        }
        const seed = {
          id,
          levelId: c.levelId ?? defaultLevelId,
          ceilingHeight,
          thickness,
          materialId: c.materialId,
          materialColor: c.materialColor
        };
        if (c.boundary) seed.boundary = c.boundary;
        let ceiling;
        try {
          ceiling = Ceiling.parse(seed);
        } catch (parseErr) {
          throw new CeilingSchemaError(
            new Error(`ceiling.batch.create — ceilings[${i}] (id=${id})`, { cause: parseErr })
          );
        }
        fresh.push(ceiling);
      }
      if (droppedDegenerate > 0) {
        console.warn(`[ceiling.batch.create] §RESI-CEILING-DEGENERATE-GUARD-2 dropped ${droppedDegenerate} degenerate ceiling(s) (zero-area / collinear / <3 distinct corners) — ${fresh.length} valid ceiling(s) committed.`);
      }
      const [next, forward, inverse] = produceCommand(ctx.stores.ceiling, (draft) => {
        for (const c of fresh) draft[c.id] = c;
      });
      return { forward, inverse, nextStates: { ceiling: next } };
    });
  }
}

const UpdateCeilingLayersHandler = {
  type: "ceiling.updateLayers",
  affectedStores: ["ceiling"],
  canExecute(ctx, cmd) {
    if (!cmd.ceilingId) return { valid: false, reason: "ceilingId is required" };
    if (!ctx.stores.ceiling[cmd.ceilingId]) return { valid: false, reason: `ceiling not found: ${cmd.ceilingId}` };
    return { valid: true };
  },
  execute(ctx, cmd) {
    return withHandlerSpan("ceiling.updateLayers.handler", { "pryzm.command.type": "ceiling.updateLayers" }, () => {
      const [next, forward, inverse] = produceCommand(ctx.stores.ceiling, (draft) => {
        const ceiling = draft[cmd.ceilingId];
        if (!ceiling) {
          console.error("[ceiling.updateLayers] ceiling not found in store:", cmd.ceilingId);
          return;
        }
        if (cmd.systemTypeId !== void 0) ceiling["systemTypeId"] = cmd.systemTypeId;
        if (cmd.layers !== void 0) ceiling["layers"] = cmd.layers;
        if (cmd.thickness !== void 0) ceiling["thickness"] = cmd.thickness;
      });
      return { forward, inverse, nextStates: { ceiling: next } };
    });
  }
};

const CEILING_MATERIAL_UNREACHABLE = "It writes the plugin DTO store, which is a FRESH instance built by PluginRegistry and is read by no renderer, no 2-D projector, no IFC exporter and no persistence path — only `<family>.created` is ever mirrored to the geometry store, never updates (§FIX-MATERIAL-DEAD-DISPATCH). Use `ceiling.update` instead — it reaches the geometry record the builders read.";
class SetCeilingMaterialHandler {
  type = "ceiling.setMaterial";
  affectedStores = ["ceiling"];
  canExecute(ctx, cmd) {
    if (typeof cmd.ceilingId !== "string" || cmd.ceilingId.length === 0) {
      return { valid: false, reason: "ceilingId must be a non-empty string" };
    }
    if (cmd.materialId === void 0 && cmd.materialColor === void 0) {
      return { valid: false, reason: "at least one of materialId / materialColor must be provided" };
    }
    if (cmd.materialColor !== void 0 && cmd.materialColor.length === 0) {
      return { valid: false, reason: "materialColor must be non-empty when provided" };
    }
    if (cmd.materialId !== void 0 && cmd.materialId !== null && cmd.materialId.length === 0) {
      return { valid: false, reason: "materialId must be non-empty when provided" };
    }
    if (!ctx.stores.ceiling[cmd.ceilingId]) {
      return { valid: false, reason: `ceiling not found: ${cmd.ceilingId}` };
    }
    return { valid: false, reason: CEILING_MATERIAL_UNREACHABLE };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      if (!ctx.stores.ceiling[cmd.ceilingId]) throw new CeilingNotFoundError(cmd.ceilingId);
      const [next, forward, inverse] = produceCommand(ctx.stores.ceiling, (draft) => {
        const c = draft[cmd.ceilingId];
        if (!c) return;
        if (cmd.materialId === null) delete c.materialId;
        else if (cmd.materialId !== void 0) c.materialId = cmd.materialId;
        if (cmd.materialColor !== void 0) c.materialColor = cmd.materialColor;
      });
      return { forward, inverse, nextStates: { ceiling: next } };
    });
  }
}

const CEILING_TYPE_BATCH_REPORT_EVENT = "pryzm-ceiling-type-batch-report";
const UpdateCeilingsSystemTypeBatchHandler = {
  type: "ceiling.updateSystemTypeBatch",
  affectedStores: [],
  canExecute(_ctx, cmd) {
    if (cmd.ceilingIds !== "all" && !Array.isArray(cmd.ceilingIds)) {
      return { valid: false, reason: "ceilingIds must be 'all' or an array of ceiling ids" };
    }
    if (typeof cmd.systemType !== "string" || cmd.systemType.length === 0) {
      return { valid: false, reason: "systemType (id or name) is required" };
    }
    return { valid: true };
  },
  execute(_ctx, cmd) {
    return withHandlerSpan(
      "ceiling.updateSystemTypeBatch.handler",
      { "pryzm.command.type": "ceiling.updateSystemTypeBatch" },
      () => {
        const cm = window.commandManager;
        const sayNothingRan = (why) => {
          const report = {
            success: false,
            info: [
              `'ceiling.updateSystemTypeBatch' did not run — ${why}. Nothing was changed, and nothing about the model is confirmed.`
            ],
            affectedElementIds: [],
            outcome: "indeterminate"
          };
          try {
            window.dispatchEvent(new CustomEvent(CEILING_TYPE_BATCH_REPORT_EVENT, { detail: report }));
          } catch (emitErr) {
            console.error("[ceiling.updateSystemTypeBatch.handler] indeterminate report emit failed:", emitErr);
          }
        };
        let refusal = null;
        if (cm) {
          try {
            const batch = new UpdateCeilingsSystemTypeBatchCommand({
              ceilingIds: cmd.ceilingIds === "all" ? "all" : [...cmd.ceilingIds],
              systemType: cmd.systemType
            });
            const result = cm.execute(batch);
            const report = {
              success: result?.success ?? false,
              info: result?.info ?? [],
              affectedElementIds: result?.affectedElementIds ?? []
            };
            window.dispatchEvent(
              new CustomEvent(CEILING_TYPE_BATCH_REPORT_EVENT, { detail: report })
            );
            if (!report.success) {
              refusal = report.info[0] ?? "the ceiling type change was refused, and no reason was given";
            }
          } catch (e) {
            console.error("[ceiling.updateSystemTypeBatch.handler] bridge failed:", e);
            sayNothingRan(`the bridge threw: ${String(e?.message ?? e)}`);
            refusal = `the bridge threw: ${String(e?.message ?? e)}`;
          }
        } else {
          sayNothingRan("the command manager is not available in this session");
          refusal = "the command manager is not available in this session";
        }
        if (refusal !== null) {
          throw new Error(`ceiling.updateSystemTypeBatch: ${refusal}`);
        }
        const empty = { forward: [], inverse: [] };
        return empty;
      }
    );
  }
};

class ChangeCeilingLevelHandler {
  type = "ceiling.changeLevel";
  affectedStores = ["ceiling"];
  canExecute(ctx, cmd) {
    if (typeof cmd.ceilingId !== "string" || cmd.ceilingId.length === 0) {
      return { valid: false, reason: "ceilingId must be a non-empty string" };
    }
    if (typeof cmd.levelId !== "string" || cmd.levelId.length === 0) {
      return { valid: false, reason: "levelId must be a non-empty string" };
    }
    if (!Object.prototype.hasOwnProperty.call(ctx.stores.ceiling, cmd.ceilingId)) {
      return { valid: false, reason: `ceiling not found: ${cmd.ceilingId}` };
    }
    if (ctx.stores.ceiling[cmd.ceilingId]?.levelId === cmd.levelId) {
      return { valid: false, reason: `ceiling ${cmd.ceilingId} is already on level ${cmd.levelId}` };
    }
    return { valid: true };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      const [next, forward, inverse] = produceCommand(ctx.stores.ceiling, (draft) => {
        const c = draft[cmd.ceilingId];
        if (c === void 0) return;
        c.levelId = cmd.levelId;
      });
      return { forward, inverse, nextStates: { ceiling: next } };
    });
  }
}

function buildCeilingHandlerSet() {
  return [
    new CreateCeilingHandler(),
    new CreateCeilingBatchHandler(),
    new DeleteCeilingHandler(),
    new SetCeilingBoundaryHandler(),
    new SetCeilingHeightHandler(),
    // §FIX-CEILING-UPDATE-REACH-RECORD — UpdateCeilingHandler retired (see the
    // CEILING_HANDLER_TYPES note); the initBusHandlers bridge owns the verb.
    UpdateCeilingLayersHandler,
    new SetCeilingMaterialHandler(),
    UpdateCeilingsSystemTypeBatchHandler,
    new ChangeCeilingLevelHandler()
  ];
}

class FloorStore extends Store {
  constructor() {
    super("floor");
  }
  byLevel(levelId) {
    const out = [];
    for (const f of this.state.values()) {
      if (f.levelId === levelId) out.push(f);
    }
    return out;
  }
  get(id) {
    return this.state.get(id);
  }
  ids() {
    return [...this.state.keys()];
  }
}

class CreateFloorHandler {
  type = "floor.create";
  affectedStores = ["floor"];
  canExecute(_ctx, cmd) {
    if (cmd.polygon !== void 0 && cmd.polygon.length < 3) {
      return { valid: false, reason: "polygon requires ≥ 3 vertices" };
    }
    const thickness = cmd.thickness ?? cmd.finishThicknessM ?? DEFAULT_FINISH_THICKNESS_M;
    if (!Number.isFinite(thickness) || thickness <= 0) {
      return { valid: false, reason: "thickness must be > 0" };
    }
    if (cmd.baseOffset !== void 0 && !Number.isFinite(cmd.baseOffset)) {
      return { valid: false, reason: "baseOffset must be a finite number" };
    }
    return { valid: true };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      const floorId = cmd.floorId ?? createId("floor");
      const now = Date.now();
      const { thickness, baseOffset } = resolveFinishSeating({
        finishThicknessM: cmd.finishThicknessM,
        thickness: cmd.thickness,
        baseOffset: cmd.baseOffset,
        hasLayers: !!(cmd.layers && cmd.layers.length > 0),
        slabTopOffsetM: cmd.slabTopOffsetM
      });
      const polygon = cmd.polygon ?? [];
      const floorCount = Object.keys(ctx.stores.floor).length + 1;
      const label = cmd.label ?? `Floor-${floorCount.toString().padStart(2, "0")}`;
      const finishSpec = {
        finishColor: "#D4C4A8",
        finishPattern: "none",
        exposedScreed: false,
        ...cmd.finishSpec ?? {}
      };
      const newFloor = {
        id: floorId,
        type: "floor",
        levelId: cmd.levelId ?? "",
        parentId: cmd.levelId ?? "",
        label,
        floorNumber: `F.${floorCount.toString().padStart(2, "0")}`,
        boundary: {
          polygon,
          baseOffset,
          thickness,
          detectionMethod: "manual-polygon"
        },
        systemTypeId: cmd.systemTypeId,
        layers: cmd.layers ? [...cmd.layers] : void 0,
        finishSpec,
        slope: void 0,
        serviceHoles: cmd.serviceHoles ? [...cmd.serviceHoles] : [],
        coveredRoomIds: cmd.hostRoomId ? [cmd.hostRoomId] : [],
        boundingWallIds: [],
        hostSlabId: cmd.hostSlabId,
        hostRoomId: cmd.hostRoomId,
        colour: void 0,
        opacity: 1,
        visible: true,
        properties: {},
        ifcData: {
          guid: cmd.ifcGuid ?? crypto.randomUUID(),
          ifcClass: "IfcCovering",
          predefinedType: "FLOORING"
        },
        metadata: {
          createdAt: now,
          modifiedAt: now,
          createdBy: cmd.createdBy ?? "user",
          version: 1
        }
      };
      const [next, forward, inverse] = produceCommand(
        ctx.stores.floor,
        (draft) => {
          draft[floorId] = newFloor;
        }
      );
      return { forward, inverse, nextStates: { floor: next } };
    });
  }
}

const UpdateFloorLayersHandler = {
  type: "floor.updateLayers",
  affectedStores: ["floor"],
  canExecute(ctx, cmd) {
    if (!cmd.floorId) return { valid: false, reason: "floorId is required" };
    if (!ctx.stores.floor[cmd.floorId]) return { valid: false, reason: `floor not found: ${cmd.floorId}` };
    return { valid: true };
  },
  execute(ctx, cmd) {
    return withHandlerSpan("floor.updateLayers.handler", { "pryzm.command.type": "floor.updateLayers" }, () => {
      const [next, forward, inverse] = produceCommand(ctx.stores.floor, (draft) => {
        const floor = draft[cmd.floorId];
        if (!floor) {
          console.error("[floor.updateLayers] floor not found in store:", cmd.floorId);
          return;
        }
        if (cmd.systemTypeId !== void 0) floor["systemTypeId"] = cmd.systemTypeId;
        if (cmd.layers !== void 0) floor["layers"] = cmd.layers;
        if (cmd.thickness !== void 0) floor["thickness"] = cmd.thickness;
      });
      return { forward, inverse, nextStates: { floor: next } };
    });
  }
};

const FLOOR_MATERIAL_UNREACHABLE = "It writes the plugin DTO store, which is a FRESH instance built by PluginRegistry and is read by no renderer, no 2-D projector, no IFC exporter and no persistence path — only `<family>.created` is ever mirrored to the geometry store, never updates (§FIX-MATERIAL-DEAD-DISPATCH). Use `floor.update` instead — it reaches the geometry record the builders read.";
const SetFloorMaterialHandler = {
  type: "floor.setMaterial",
  affectedStores: ["floor"],
  canExecute(ctx, cmd) {
    if (typeof cmd.floorId !== "string" || cmd.floorId.length === 0) {
      return { valid: false, reason: "floorId must be a non-empty string" };
    }
    if (cmd.materialId === void 0 && cmd.materialColor === void 0) {
      return { valid: false, reason: "at least one of materialId / materialColor must be provided" };
    }
    if (cmd.materialColor !== void 0 && cmd.materialColor.length === 0) {
      return { valid: false, reason: "materialColor must be non-empty when provided" };
    }
    if (cmd.materialId !== void 0 && cmd.materialId !== null && cmd.materialId.length === 0) {
      return { valid: false, reason: "materialId must be non-empty when provided" };
    }
    if (!ctx.stores.floor[cmd.floorId]) {
      return { valid: false, reason: `floor not found: ${cmd.floorId}` };
    }
    return { valid: false, reason: FLOOR_MATERIAL_UNREACHABLE };
  },
  execute(ctx, cmd) {
    return withHandlerSpan("floor.setMaterial.handler", { "pryzm.command.type": "floor.setMaterial" }, () => {
      const [next, forward, inverse] = produceCommand(ctx.stores.floor, (draft) => {
        const floor = draft[cmd.floorId];
        if (!floor) return;
        if (cmd.materialId === null) delete floor["materialId"];
        else if (cmd.materialId !== void 0) floor["materialId"] = cmd.materialId;
        if (cmd.materialColor !== void 0) floor["materialColor"] = cmd.materialColor;
      });
      return { forward, inverse, nextStates: { floor: next } };
    });
  }
};

class ChangeFloorLevelHandler {
  type = "floor.changeLevel";
  affectedStores = ["floor"];
  canExecute(ctx, cmd) {
    if (typeof cmd.floorId !== "string" || cmd.floorId.length === 0) {
      return { valid: false, reason: "floorId must be a non-empty string" };
    }
    if (typeof cmd.levelId !== "string" || cmd.levelId.length === 0) {
      return { valid: false, reason: "levelId must be a non-empty string" };
    }
    if (!Object.prototype.hasOwnProperty.call(ctx.stores.floor, cmd.floorId)) {
      return { valid: false, reason: `floor not found: ${cmd.floorId}` };
    }
    if (ctx.stores.floor[cmd.floorId]?.levelId === cmd.levelId) {
      return { valid: false, reason: `floor ${cmd.floorId} is already on level ${cmd.levelId}` };
    }
    return { valid: true };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      const [next, forward, inverse] = produceCommand(ctx.stores.floor, (draft) => {
        const f = draft[cmd.floorId];
        if (f === void 0) return;
        f.levelId = cmd.levelId;
      });
      return { forward, inverse, nextStates: { floor: next } };
    });
  }
}

const FLOOR_FINISH_BATCH_REPORT_EVENT = "pryzm-floor-finish-batch-report";
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const SetFloorFinishBatchHandler = {
  type: "floor.setFinishBatch",
  affectedStores: [],
  canExecute(_ctx, cmd) {
    if (cmd.floorIds !== "all" && !Array.isArray(cmd.floorIds)) {
      return { valid: false, reason: "floorIds must be 'all' or an array of floor ids" };
    }
    if (!cmd.finish || typeof cmd.finish.materialId !== "string" || cmd.finish.materialId.length === 0) {
      return { valid: false, reason: "finish.materialId is required" };
    }
    if (cmd.finish.materialColor !== void 0 && !HEX_COLOR_RE.test(cmd.finish.materialColor)) {
      return { valid: false, reason: "finish.materialColor must be a '#rrggbb' hex string" };
    }
    return { valid: true };
  },
  execute(_ctx, cmd) {
    return withHandlerSpan(
      "floor.setFinishBatch.handler",
      { "pryzm.command.type": "floor.setFinishBatch" },
      () => {
        const cm = window.commandManager;
        const sayNothingRan = (why) => {
          const report = {
            success: false,
            info: [
              `'floor.setFinishBatch' did not run — ${why}. Nothing was changed, and nothing about the model is confirmed.`
            ],
            affectedElementIds: [],
            outcome: "indeterminate"
          };
          try {
            window.dispatchEvent(
              new CustomEvent(FLOOR_FINISH_BATCH_REPORT_EVENT, { detail: report })
            );
          } catch (emitErr) {
            console.error("[floor.setFinishBatch.handler] indeterminate report emit failed:", emitErr);
          }
        };
        if (!cm) {
          sayNothingRan("the command manager is not available in this session");
          throw new Error(
            "floor.setFinishBatch: the command manager is not available in this session"
          );
        }
        let refusal = null;
        try {
          const result = cm.execute(
            new SetFloorFinishBatchCommand({
              floorIds: cmd.floorIds === "all" ? "all" : [...cmd.floorIds],
              finish: {
                materialId: cmd.finish.materialId,
                ...cmd.finish.materialColor !== void 0 ? { materialColor: cmd.finish.materialColor } : {},
                ...cmd.finish.materialName !== void 0 ? { materialName: cmd.finish.materialName } : {}
              }
            })
          );
          const readable = !!result && Array.isArray(result.affectedElementIds);
          const report = readable ? {
            success: result.success ?? false,
            info: result.info ?? [],
            affectedElementIds: result.affectedElementIds
          } : {
            success: false,
            info: [
              `'floor.setFinishBatch' RAN but the command manager returned no readable result. WHICH floors changed is not known — this is NOT a report that none did.`
            ],
            affectedElementIds: [],
            outcome: "indeterminate"
          };
          window.dispatchEvent(
            new CustomEvent(FLOOR_FINISH_BATCH_REPORT_EVENT, { detail: report })
          );
          if (!report.success) {
            refusal = report.info[0] ?? "the floor finish change was refused, and no reason was given";
          }
        } catch (e) {
          console.error("[floor.setFinishBatch.handler] bridge failed:", e);
          sayNothingRan(`the bridge threw: ${String(e?.message ?? e)}`);
          refusal = `the bridge threw: ${String(e?.message ?? e)}`;
        }
        if (refusal !== null) {
          throw new Error(`floor.setFinishBatch: ${refusal}`);
        }
        const empty = { forward: [], inverse: [] };
        return empty;
      }
    );
  }
};

function buildFloorHandlerSet() {
  return [
    new CreateFloorHandler(),
    UpdateFloorLayersHandler,
    SetFloorMaterialHandler,
    new ChangeFloorLevelHandler(),
    SetFloorFinishBatchHandler
  ];
}

class PoolStore extends Store {
  constructor() {
    super("pool");
  }
  ids() {
    return [...this.state.keys()];
  }
  /** Every pool on a given level. O(N). */
  byLevel(levelId) {
    const out = [];
    for (const p of this.state.values()) if (p.levelId === levelId) out.push(p);
    return out;
  }
  /** Every pool cut into a given host slab — the reverse index the slab needs when
   *  it is deleted (a slab cannot vanish under a pool and leave it floating). */
  byHostSlab(slabId) {
    const out = [];
    for (const p of this.state.values()) if (p.hostSlabId === slabId) out.push(p);
    return out;
  }
  get(id) {
    return this.state.get(id);
  }
}
class WaterStore extends Store {
  constructor() {
    super("water");
  }
  ids() {
    return [...this.state.keys()];
  }
  /** The water held by a given pool. */
  byPool(poolId) {
    const out = [];
    for (const w of this.state.values()) if (w.poolId === poolId) out.push(w);
    return out;
  }
  get(id) {
    return this.state.get(id);
  }
}

class PoolSystemError extends Error {
  constructor(message) {
    super(message);
    this.name = "PoolSystemError";
  }
}
class PoolNotFoundError extends PoolSystemError {
  constructor(poolId) {
    super(`pool not found: ${poolId}`);
    this.name = "PoolNotFoundError";
  }
}
class PoolHostSlabError extends PoolSystemError {
  constructor(message) {
    super(message);
    this.name = "PoolHostSlabError";
  }
}
class PoolBoundaryError extends PoolSystemError {
  constructor(message) {
    super(message);
    this.name = "PoolBoundaryError";
  }
}

const _tracer$4 = trace.getTracer("pryzm-geometry-pool");
const POOL_DIMENSION_DEFAULTS = {
  depth: 1.2,
  wallThickness: 0.25,
  floorThickness: 0.3,
  freeboard: 0.1,
  waterColor: "#2E86C1",
  waterOpacity: 0.3
};
function resolvePoolDimensions(pool, systemType) {
  return _tracer$4.startActiveSpan("pryzm.pool.resolveDimensions", (span) => {
    try {
      const pick = (fromRecord, fromType, fallback) => fromRecord ?? fromType ?? fallback;
      const resolved = {
        depth: pick(pool.depth, systemType?.depth, POOL_DIMENSION_DEFAULTS.depth),
        wallThickness: pick(pool.wallThickness, systemType?.wallThickness, POOL_DIMENSION_DEFAULTS.wallThickness),
        floorThickness: pick(pool.floorThickness, systemType?.floorThickness, POOL_DIMENSION_DEFAULTS.floorThickness),
        freeboard: pick(pool.freeboard, systemType?.freeboard, POOL_DIMENSION_DEFAULTS.freeboard),
        // ⭐ §POOL95 — TIER 1 WAS A LITERAL `undefined` HERE, for both fields, so the
        // architect's own override was structurally unreachable: `Pool` carried no
        // such field to read. The chain is documented as three tiers in this file's
        // header and was two for the water's appearance. It is three now.
        waterColor: pick(pool.waterColor, systemType?.waterColor, POOL_DIMENSION_DEFAULTS.waterColor),
        waterOpacity: pick(pool.waterOpacity, systemType?.waterOpacity, POOL_DIMENSION_DEFAULTS.waterOpacity)
      };
      span.setAttribute("pryzm.pool.depth", resolved.depth);
      span.setAttribute("pryzm.pool.freeboard", resolved.freeboard);
      span.setAttribute("pryzm.pool.systemTypeId", systemType?.id ?? "(none)");
      return resolved;
    } finally {
      span.end();
    }
  });
}

const partProvenance = (part) => systemProvenance("computed", `@pryzm/geometry-pool buildPoolAssembly — pool ${part}`);
const _tracer$3 = trace.getTracer("pryzm-geometry-pool");
function buildPoolAssembly(pool, ids, systemType) {
  return _tracer$3.startActiveSpan("pryzm.pool.buildAssembly", (span) => {
    try {
      const dims = resolvePoolDimensions(pool, systemType);
      const boundary = pool.boundary;
      const n = boundary.length;
      if (ids.wallIds.length !== n) {
        throw new Error(
          `[buildPoolAssembly] expected ${n} wall ids (one per boundary edge), got ${ids.wallIds.length}. Ids are pre-minted by the command so they are stable across redo (CA-2).`
        );
      }
      const datumY = boundary[0].y;
      const hostHole = boundary.map((p) => ({ x: p.x, y: p.y, z: p.z }));
      const walls = [];
      for (let i = 0; i < n; i++) {
        const a = boundary[i];
        const b = boundary[(i + 1) % n];
        walls.push({
          id: ids.wallIds[i],
          type: "wall",
          parentId: pool.id,
          // ← the assembly link (ADR-0124 §3)
          childrenIds: [],
          metadata: pool.metadata,
          provenance: partProvenance("wall"),
          // PV-06 — this part is CONSTRUCTED by the assembly, never measured, so its
          // confidence is the predating default: pending-implementation, score null.
          confidence: confidencePredatingTheField(),
          levelId: pool.levelId,
          // Wall baselines are horizontal by contract (the schema refines it), and
          // both endpoints carry the level elevation in `y`.
          baseLine: [
            { x: a.x, y: datumY, z: a.z },
            { x: b.x, y: datumY, z: b.z }
          ],
          height: dims.depth,
          thickness: dims.wallThickness,
          baseOffset: -dims.depth,
          // ← UNDER the level. The whole trick.
          openings: [],
          ...pool.materialId ? { materialId: pool.materialId } : {},
          ...pool.materialColor ? { materialColor: pool.materialColor } : {}
        });
      }
      const floorSlab = {
        id: ids.floorSlabId,
        type: "slab",
        parentId: pool.id,
        // ← the assembly link
        childrenIds: [],
        metadata: pool.metadata,
        provenance: partProvenance("floor slab"),
        // PV-06 — this part is CONSTRUCTED by the assembly, never measured, so its
        // confidence is the predating default: pending-implementation, score null.
        confidence: confidencePredatingTheField(),
        levelId: pool.levelId,
        boundary: boundary.map((p) => ({ x: p.x, y: datumY, z: p.z })),
        holes: [],
        thickness: dims.floorThickness,
        baseOffset: -dims.depth,
        ...pool.materialId ? { materialId: pool.materialId } : {},
        ...pool.materialColor ? { materialColor: pool.materialColor } : {},
        ...pool.systemTypeId ? { systemTypeId: pool.systemTypeId } : {}
      };
      const water = {
        id: ids.waterId,
        type: "water",
        parentId: pool.id,
        // ← the assembly link
        childrenIds: [],
        metadata: pool.metadata,
        provenance: partProvenance("water"),
        // PV-06 — this part is CONSTRUCTED by the assembly, never measured, so its
        // confidence is the predating default: pending-implementation, score null.
        confidence: confidencePredatingTheField(),
        levelId: pool.levelId,
        poolId: pool.id,
        boundary: boundary.map((p) => ({ x: p.x, y: datumY, z: p.z })),
        surfaceElevation: datumY - dims.freeboard,
        bottomElevation: datumY - dims.depth,
        color: dims.waterColor,
        opacity: dims.waterOpacity,
        ...pool.systemTypeId ? { systemTypeId: pool.systemTypeId } : {}
      };
      span.setAttribute("pryzm.pool.wallCount", walls.length);
      span.setAttribute("pryzm.pool.waterSurfaceY", water.surfaceElevation);
      return { dims, hostHole, walls, floorSlab, water };
    } finally {
      span.end();
    }
  });
}

class CreatePoolHandler {
  type = "pool.create";
  /**
   * CA-6 / §U-B6. FOUR stores, because the command really does write four. Declaring
   * fewer would silently DROP the undeclared store's patches from undo routing —
   * Ctrl+Z would then remove the pool but LEAVE THE HOLE IN THE FLOOR, which the
   * ticket names as "worse than no feature".
   */
  // eslint-disable-next-line pryzm/store-single-channel -- CA-6/§U-B6: this command
  // REALLY writes four stores; declaring fewer drops the undeclared stores' patches
  // from undo routing (Ctrl+Z would remove the pool but leave the hole in the
  // floor). The rule has no multi-store option; the declaration is the truth.
  affectedStores = ["pool", "wall", "slab", "water"];
  canExecute(ctx, cmd) {
    if (typeof cmd.poolId !== "string" || cmd.poolId.length === 0) {
      return { valid: false, reason: "poolId must be a non-empty string" };
    }
    if (ctx.stores.pool[cmd.poolId]) {
      return { valid: false, reason: `duplicate pool id: ${cmd.poolId}` };
    }
    if (!ctx.stores.slab[cmd.hostSlabId]) {
      return { valid: false, reason: `host slab not found: ${cmd.hostSlabId}` };
    }
    if (!Array.isArray(cmd.boundary) || cmd.boundary.length < 3) {
      return { valid: false, reason: "pool boundary needs ≥ 3 vertices" };
    }
    if (cmd.wallIds.length !== cmd.boundary.length) {
      return {
        valid: false,
        reason: `expected ${cmd.boundary.length} pre-minted wall ids (one per boundary edge), got ${cmd.wallIds.length}`
      };
    }
    const parsed = Pool.safeParse(this._recordOf(cmd));
    if (!parsed.success) {
      return { valid: false, reason: parsed.error.issues[0]?.message ?? "invalid pool" };
    }
    return { valid: true };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      const host = ctx.stores.slab[cmd.hostSlabId];
      if (!host) throw new PoolHostSlabError(`host slab not found: ${cmd.hostSlabId}`);
      const parsed = Pool.safeParse(this._recordOf(cmd));
      if (!parsed.success) throw new PoolBoundaryError(parsed.error.issues[0]?.message ?? "invalid pool");
      const pool = parsed.data;
      const asm = buildPoolAssembly(
        pool,
        { wallIds: cmd.wallIds, floorSlabId: cmd.floorSlabId, waterId: cmd.waterId },
        cmd.systemType
      );
      const poolRecord = {
        ...pool,
        childrenIds: [...cmd.wallIds, cmd.floorSlabId, cmd.waterId]
      };
      const out = produceMultiStoreCommand(
        {
          pool: ctx.stores.pool,
          wall: ctx.stores.wall,
          slab: ctx.stores.slab,
          water: ctx.stores.water
        },
        {
          pool: (d) => {
            d[cmd.poolId] = poolRecord;
          },
          wall: (d) => {
            for (const w of asm.walls) d[w.id] = w;
          },
          slab: (d) => {
            const draft = d;
            draft[cmd.floorSlabId] = asm.floorSlab;
            const h = draft[cmd.hostSlabId];
            if (h) h.holes = [...h.holes ?? [], asm.hostHole];
          },
          water: (d) => {
            d[cmd.waterId] = asm.water;
          }
        }
      );
      return {
        forward: out.forward,
        inverse: out.inverse,
        nextStates: out.nextStates
      };
    });
  }
  /** The pool record as the schema sees it (used by both canExecute and execute so
   *  they cannot disagree about what a valid pool is). */
  _recordOf(cmd) {
    return {
      id: cmd.poolId,
      type: "pool",
      levelId: cmd.levelId,
      hostSlabId: cmd.hostSlabId,
      boundary: cmd.boundary,
      ...cmd.depth !== void 0 ? { depth: cmd.depth } : {},
      ...cmd.wallThickness !== void 0 ? { wallThickness: cmd.wallThickness } : {},
      ...cmd.floorThickness !== void 0 ? { floorThickness: cmd.floorThickness } : {},
      ...cmd.freeboard !== void 0 ? { freeboard: cmd.freeboard } : {},
      ...cmd.systemTypeId ? { systemTypeId: cmd.systemTypeId } : {},
      ...cmd.materialId ? { materialId: cmd.materialId } : {},
      // §POOL95 — `!== undefined`, not truthiness: `waterOpacity: 0` is an authored,
      // deliberately invisible water and a truthy test would drop it on the floor
      // here exactly as `||` would drop it in the resolver (WR-4).
      ...cmd.waterColor !== void 0 ? { waterColor: cmd.waterColor } : {},
      ...cmd.waterOpacity !== void 0 ? { waterOpacity: cmd.waterOpacity } : {}
    };
  }
}

const EPS$1 = 1e-6;
function sameLoop$1(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const p = a[i];
    const q = b[i];
    if (Math.abs(p.x - q.x) > EPS$1 || Math.abs(p.y - q.y) > EPS$1 || Math.abs(p.z - q.z) > EPS$1) return false;
  }
  return true;
}
class DeletePoolHandler {
  type = "pool.delete";
  /** The same four stores the create touched — the delete must be able to undo it. */
  // eslint-disable-next-line pryzm/store-single-channel -- CA-6/§U-B6: mirrors
  // CreatePool — four stores is the truthful declaration; see the rationale there.
  affectedStores = ["pool", "wall", "slab", "water"];
  canExecute(ctx, cmd) {
    if (!ctx.stores.pool[cmd.poolId]) {
      return { valid: false, reason: `pool not found: ${cmd.poolId}` };
    }
    return { valid: true };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      const pool = ctx.stores.pool[cmd.poolId];
      if (!pool) throw new PoolNotFoundError(cmd.poolId);
      const childIds = new Set(pool.childrenIds);
      const hostSlabId = pool.hostSlabId;
      const host = ctx.stores.slab[hostSlabId];
      const holesBefore = host?.holes ?? [];
      const holesAfter = holesBefore.filter((loop) => !sameLoop$1(loop, pool.boundary));
      const out = produceMultiStoreCommand(
        {
          pool: ctx.stores.pool,
          wall: ctx.stores.wall,
          slab: ctx.stores.slab,
          water: ctx.stores.water
        },
        {
          pool: (d) => {
            delete d[cmd.poolId];
          },
          wall: (d) => {
            const draft = d;
            for (const id of Object.keys(draft)) if (childIds.has(id)) delete draft[id];
          },
          slab: (d) => {
            const draft = d;
            for (const id of Object.keys(draft)) if (childIds.has(id)) delete draft[id];
            const h = draft[hostSlabId];
            if (h) h.holes = holesAfter;
          },
          water: (d) => {
            const draft = d;
            for (const id of Object.keys(draft)) if (childIds.has(id)) delete draft[id];
          }
        }
      );
      return {
        forward: out.forward,
        inverse: out.inverse,
        nextStates: out.nextStates
      };
    });
  }
}

function buildPoolHandlerSet() {
  return [
    new CreatePoolHandler(),
    new DeletePoolHandler()
  ];
}

class BalconyStore extends Store {
  constructor() {
    super("balcony");
  }
  ids() {
    return [...this.state.keys()];
  }
  /** Every balcony on a given level. O(N). */
  byLevel(levelId) {
    const out = [];
    for (const b of this.state.values()) if (b.levelId === levelId) out.push(b);
    return out;
  }
  /**
   * Every balcony hosted on a given wall — the reverse index the WALL needs when it
   * is moved or deleted. A wall cannot vanish out from under a balcony and leave it
   * cantilevering off nothing.
   *
   * ⚠ Nothing consumes this yet, and that is stated rather than hidden: wall-move
   * re-seating for balconies is NOT implemented (L-5611). The index exists so the
   * fix has somewhere to start; its presence is not a claim that the behaviour works.
   */
  byHostWall(wallId) {
    const out = [];
    for (const b of this.state.values()) if (b.hostWallId === wallId) out.push(b);
    return out;
  }
  /**
   * The balcony that OWNS a given member id, or `undefined`.
   *
   * ⭐ THIS IS THE LOOKUP THE PROFILE-EDIT BRIDGE NEEDS. When the user drags a
   * vertex of a slab, the only thing the editor knows is the SLAB's id; answering
   * "is this slab a balcony's plate?" is what turns that gesture into a
   * `balcony.updateProfile`. Scanning `childrenIds` is O(N) in balconies, which is
   * the right cost for a per-gesture question and avoids a second index that could
   * disagree with `childrenIds`.
   */
  byMember(memberId) {
    for (const b of this.state.values()) {
      if (b.childrenIds.includes(memberId)) return b;
    }
    return void 0;
  }
  get(id) {
    return this.state.get(id);
  }
}

class BalconySystemError extends Error {
  constructor(message) {
    super(message);
    this.name = "BalconySystemError";
  }
}
class BalconyNotFoundError extends BalconySystemError {
  constructor(balconyId) {
    super(`balcony not found: ${balconyId}`);
    this.name = "BalconyNotFoundError";
  }
}
class BalconyHostWallError extends BalconySystemError {
  constructor(message) {
    super(message);
    this.name = "BalconyHostWallError";
  }
}
class BalconyBoundaryError extends BalconySystemError {
  constructor(message) {
    super(message);
    this.name = "BalconyBoundaryError";
  }
}
class BalconyMemberIdError extends BalconySystemError {
  constructor(message) {
    super(message);
    this.name = "BalconyMemberIdError";
  }
}

const _tracer$2 = trace.getTracer("pryzm-geometry-balcony");
const BALCONY_DIMENSION_DEFAULTS = {
  width: 1,
  projection: 0.5,
  railingHeight: 1,
  slabThickness: 0.2,
  finishThickness: 0.015,
  railDiameter: 0.04
};
const SLAB_TOP_AT_LEVEL_DATUM = 0;
function resolveBalconyDimensions(balcony, systemType) {
  return _tracer$2.startActiveSpan("pryzm.balcony.resolveDimensions", (span) => {
    try {
      const pick = (fromRecord, fromType, fallback) => fromRecord ?? fromType ?? fallback;
      const resolved = {
        width: pick(balcony.width, systemType?.width, BALCONY_DIMENSION_DEFAULTS.width),
        projection: pick(
          balcony.projection,
          systemType?.projection,
          BALCONY_DIMENSION_DEFAULTS.projection
        ),
        railingHeight: pick(
          balcony.railingHeight,
          systemType?.railingHeight,
          BALCONY_DIMENSION_DEFAULTS.railingHeight
        ),
        slabThickness: pick(
          balcony.slabThickness,
          systemType?.slabThickness,
          BALCONY_DIMENSION_DEFAULTS.slabThickness
        ),
        finishThickness: pick(
          balcony.finishThickness,
          systemType?.finishThickness,
          BALCONY_DIMENSION_DEFAULTS.finishThickness
        ),
        // `railDiameter` has no record tier: the balcony record deliberately carries no
        // rail section. A user who wants a different section edits the RAILING MEMBER,
        // which is a real handrail with the whole handrail property panel behind it —
        // that is the founder's "changed on demand by selecting the independent
        // elements". A parent field here would be a second, rival place to say it.
        railDiameter: pick(
          void 0,
          systemType?.railDiameter,
          BALCONY_DIMENSION_DEFAULTS.railDiameter
        )
      };
      span.setAttribute("pryzm.balcony.width", resolved.width);
      span.setAttribute("pryzm.balcony.projection", resolved.projection);
      span.setAttribute("pryzm.balcony.railingHeight", resolved.railingHeight);
      span.setAttribute("pryzm.balcony.systemTypeId", systemType?.id ?? "(none)");
      return resolved;
    } finally {
      span.end();
    }
  });
}

const _tracer$1 = trace.getTracer("pryzm-geometry-balcony");
const HOST_EDGE_TOLERANCE_M = 0.25;
function distanceToSegment(p, a, b) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const lenSq = dx * dx + dz * dz;
  if (lenSq < 1e-12) return Math.hypot(p.x - a.x, p.z - a.z);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / lenSq));
  return Math.hypot(p.x - (a.x + t * dx), p.z - (a.z + t * dz));
}
function balconyEdges(boundary) {
  const n = boundary.length;
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = boundary[i];
    const b = boundary[(i + 1) % n];
    out.push({ index: i, a, b, length: Math.hypot(b.x - a.x, b.z - a.z) });
  }
  return out;
}
function resolveFreeEdges(boundary, host, tolerance = HOST_EDGE_TOLERANCE_M) {
  return _tracer$1.startActiveSpan("pryzm.balcony.resolveFreeEdges", (span) => {
    try {
      const all = balconyEdges(boundary);
      span.setAttribute("pryzm.balcony.edgeCount", all.length);
      if (!host) {
        span.setAttribute("pryzm.balcony.hostKnown", false);
        span.setAttribute("pryzm.balcony.freeEdgeCount", all.length);
        return all;
      }
      span.setAttribute("pryzm.balcony.hostKnown", true);
      const free = all.filter((e) => {
        const aOn = distanceToSegment(e.a, host.a, host.b) <= tolerance;
        const bOn = distanceToSegment(e.b, host.a, host.b) <= tolerance;
        return !(aOn && bOn);
      });
      span.setAttribute("pryzm.balcony.freeEdgeCount", free.length);
      return free;
    } finally {
      span.end();
    }
  });
}

const memberProvenance = (member) => systemProvenance("computed", `@pryzm/geometry-balcony buildBalconyAssembly — balcony ${member}`);
const _tracer = trace.getTracer("pryzm-geometry-balcony");
function buildBalconyAssembly(balcony, ids, ctx = {}) {
  return _tracer.startActiveSpan("pryzm.balcony.buildAssembly", (span) => {
    try {
      const dims = resolveBalconyDimensions(balcony, ctx.systemType);
      const boundary = balcony.boundary;
      const datumY = boundary[0].y;
      const freeEdges = resolveFreeEdges(boundary, ctx.hostSegment);
      if (ids.railingIds.length !== freeEdges.length) {
        throw new Error(
          `[buildBalconyAssembly] expected ${freeEdges.length} railing ids (one per FREE edge), got ${ids.railingIds.length}. Call resolveFreeEdges() on the CURRENT boundary and mint against that count; ids are pre-minted so they are stable across redo (CA-2).`
        );
      }
      const slab = {
        id: ids.slabId,
        type: "slab",
        parentId: balcony.id,
        // ← the compound link (C103 §2)
        childrenIds: [],
        metadata: balcony.metadata,
        provenance: memberProvenance("slab"),
        // PV-06 — this member is CONSTRUCTED by the assembly, never measured, so its
        // confidence is the predating default: pending-implementation, score null.
        confidence: confidencePredatingTheField(),
        levelId: balcony.levelId,
        boundary: boundary.map((p) => ({ x: p.x, y: datumY, z: p.z })),
        holes: [],
        thickness: dims.slabThickness,
        baseOffset: SLAB_TOP_AT_LEVEL_DATUM,
        ...balcony.materialId ? { materialId: balcony.materialId } : {},
        ...balcony.materialColor ? { materialColor: balcony.materialColor } : {},
        ...balcony.systemTypeId ? { systemTypeId: balcony.systemTypeId } : {}
      };
      const finish = {
        id: ids.floorId,
        type: "floor",
        parentId: balcony.id,
        // ← the compound link
        childrenIds: [],
        metadata: balcony.metadata,
        provenance: memberProvenance("floor finish"),
        confidence: confidencePredatingTheField(),
        levelId: balcony.levelId,
        boundary: boundary.map((p) => ({ x: p.x, y: datumY, z: p.z })),
        // FFL = slab top + finish thickness. The floor body extrudes DOWNWARD from
        // its FFL, so its underside lands exactly on the slab's top face.
        baseOffset: dims.finishThickness,
        thickness: dims.finishThickness,
        ...balcony.materialId ? { materialId: balcony.materialId } : {},
        ...balcony.materialColor ? { materialColor: balcony.materialColor } : {}
      };
      const railBaseY = datumY + dims.finishThickness;
      const railings = freeEdges.map((e, i) => ({
        id: ids.railingIds[i],
        type: "handrail",
        parentId: balcony.id,
        // ← the compound link
        childrenIds: [],
        metadata: balcony.metadata,
        provenance: memberProvenance("railing"),
        confidence: confidencePredatingTheField(),
        levelId: balcony.levelId,
        // The handrail's HOST is the balcony's SLAB, not the balcony record: a guard
        // is carried by the plate it stands on, and `Handrail.hostId` is documented
        // as "(stair, slab edge, ramp)". The compound link is `parentId` above; these
        // are two different relationships and are not merged.
        hostId: ids.slabId,
        path: [
          { x: e.a.x, y: railBaseY, z: e.a.z },
          { x: e.b.x, y: railBaseY, z: e.b.z }
        ],
        shape: "round",
        height: dims.railingHeight,
        diameter: dims.railDiameter,
        ...balcony.materialId ? { materialId: balcony.materialId } : {}
      }));
      span.setAttribute("pryzm.balcony.railingCount", railings.length);
      span.setAttribute("pryzm.balcony.freeEdgeCount", freeEdges.length);
      span.setAttribute("pryzm.balcony.hostKnown", ctx.hostSegment !== void 0);
      return { dims, slab, finish, railings, freeEdges };
    } finally {
      span.end();
    }
  });
}

class CreateBalconyHandler {
  type = "balcony.create";
  /**
   * CA-6 / §U-B6. FOUR stores, because the command really does write four. Declaring
   * fewer would silently DROP the undeclared store's patches from undo routing —
   * Ctrl+Z would then remove the balcony and LEAVE ITS RAILING FLOATING IN THE AIR,
   * which is strictly worse than no feature.
   */
  // eslint-disable-next-line pryzm/store-single-channel -- CA-6/§U-B6: see above.
  affectedStores = ["balcony", "slab", "floor", "handrail"];
  canExecute(ctx, cmd) {
    if (typeof cmd.balconyId !== "string" || cmd.balconyId.length === 0) {
      return { valid: false, reason: "balconyId must be a non-empty string" };
    }
    if (ctx.stores.balcony[cmd.balconyId]) {
      return { valid: false, reason: `duplicate balcony id: ${cmd.balconyId}` };
    }
    if (!Array.isArray(cmd.boundary) || cmd.boundary.length < 3) {
      return { valid: false, reason: "balcony boundary needs >= 3 vertices" };
    }
    if (cmd.hostWallId !== void 0 && cmd.hostSegment === void 0) {
      return {
        valid: false,
        reason: `balcony names host wall ${cmd.hostWallId} but no hostSegment was resolved for it. Resolve the wall's centreline at the gesture and pass it, or omit hostWallId for a free-standing balcony (which is railed all round).`
      };
    }
    if (ctx.stores.slab[cmd.slabId]) {
      return { valid: false, reason: `duplicate slab id: ${cmd.slabId}` };
    }
    if (ctx.stores.floor[cmd.floorId]) {
      return { valid: false, reason: `duplicate floor id: ${cmd.floorId}` };
    }
    const parsed = Balcony.safeParse(this._recordOf(cmd));
    if (!parsed.success) {
      return { valid: false, reason: parsed.error.issues[0]?.message ?? "invalid balcony" };
    }
    const free = resolveFreeEdges(parsed.data.boundary, cmd.hostSegment);
    if (cmd.railingIds.length !== free.length) {
      return {
        valid: false,
        reason: `expected ${free.length} pre-minted railing ids (one per FREE edge of this outline), got ${cmd.railingIds.length}`
      };
    }
    return { valid: true };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      if (cmd.hostWallId !== void 0 && cmd.hostSegment === void 0) {
        throw new BalconyHostWallError(
          `balcony names host wall ${cmd.hostWallId} but no hostSegment was resolved for it.`
        );
      }
      const parsed = Balcony.safeParse(this._recordOf(cmd));
      if (!parsed.success) {
        throw new BalconyBoundaryError(parsed.error.issues[0]?.message ?? "invalid balcony");
      }
      const balcony = parsed.data;
      let asm;
      try {
        asm = buildBalconyAssembly(
          balcony,
          { slabId: cmd.slabId, floorId: cmd.floorId, railingIds: cmd.railingIds },
          { hostSegment: cmd.hostSegment, systemType: cmd.systemType }
        );
      } catch (e) {
        throw new BalconyMemberIdError(e instanceof Error ? e.message : String(e));
      }
      const balconyRecord = {
        ...balcony,
        childrenIds: [cmd.slabId, cmd.floorId, ...cmd.railingIds]
      };
      const out = produceMultiStoreCommand(
        {
          balcony: ctx.stores.balcony,
          slab: ctx.stores.slab,
          floor: ctx.stores.floor,
          handrail: ctx.stores.handrail
        },
        {
          balcony: (d) => {
            d[cmd.balconyId] = balconyRecord;
          },
          slab: (d) => {
            d[cmd.slabId] = asm.slab;
          },
          floor: (d) => {
            d[cmd.floorId] = asm.finish;
          },
          handrail: (d) => {
            const draft = d;
            for (const r of asm.railings) draft[r.id] = r;
          }
        }
      );
      return { forward: out.forward, inverse: out.inverse, nextStates: out.nextStates };
    });
  }
  /** The balcony record as the schema sees it (used by BOTH canExecute and execute so
   *  they cannot disagree about what a valid balcony is). */
  _recordOf(cmd) {
    return {
      id: cmd.balconyId,
      type: "balcony",
      levelId: cmd.levelId,
      boundary: cmd.boundary,
      ...cmd.hostWallId !== void 0 ? { hostWallId: cmd.hostWallId } : {},
      ...cmd.hostOffset !== void 0 ? { hostOffset: cmd.hostOffset } : {},
      ...cmd.width !== void 0 ? { width: cmd.width } : {},
      ...cmd.projection !== void 0 ? { projection: cmd.projection } : {},
      ...cmd.railingHeight !== void 0 ? { railingHeight: cmd.railingHeight } : {},
      ...cmd.slabThickness !== void 0 ? { slabThickness: cmd.slabThickness } : {},
      ...cmd.finishThickness !== void 0 ? { finishThickness: cmd.finishThickness } : {},
      ...cmd.systemTypeId ? { systemTypeId: cmd.systemTypeId } : {},
      ...cmd.railingTypeId ? { railingTypeId: cmd.railingTypeId } : {},
      ...cmd.finishTypeId ? { finishTypeId: cmd.finishTypeId } : {},
      ...cmd.materialId ? { materialId: cmd.materialId } : {},
      ...cmd.materialColor ? { materialColor: cmd.materialColor } : {}
    };
  }
}

class DeleteBalconyHandler {
  type = "balcony.delete";
  /** The same four stores the create touched — the delete must be able to undo it. */
  // eslint-disable-next-line pryzm/store-single-channel -- CA-6/§U-B6: see above.
  affectedStores = ["balcony", "slab", "floor", "handrail"];
  canExecute(ctx, cmd) {
    if (!ctx.stores.balcony[cmd.balconyId]) {
      return { valid: false, reason: `balcony not found: ${cmd.balconyId}` };
    }
    return { valid: true };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      const balcony = ctx.stores.balcony[cmd.balconyId];
      if (!balcony) throw new BalconyNotFoundError(cmd.balconyId);
      const childIds = new Set(balcony.childrenIds);
      const out = produceMultiStoreCommand(
        {
          balcony: ctx.stores.balcony,
          slab: ctx.stores.slab,
          floor: ctx.stores.floor,
          handrail: ctx.stores.handrail
        },
        {
          balcony: (d) => {
            delete d[cmd.balconyId];
          },
          slab: (d) => {
            const draft = d;
            for (const id of Object.keys(draft)) if (childIds.has(id)) delete draft[id];
          },
          floor: (d) => {
            const draft = d;
            for (const id of Object.keys(draft)) if (childIds.has(id)) delete draft[id];
          },
          handrail: (d) => {
            const draft = d;
            for (const id of Object.keys(draft)) if (childIds.has(id)) delete draft[id];
          }
        }
      );
      return { forward: out.forward, inverse: out.inverse, nextStates: out.nextStates };
    });
  }
}

const DERIVED_FIELDS = Object.freeze({
  slab: ["boundary"],
  floor: ["boundary"],
  handrail: ["path"]
});
class UpdateBalconyProfileHandler {
  type = "balcony.updateProfile";
  /** The fields re-derived by this command, exported so the contract and the tests
   *  read the SAME list rather than two copies of it (C84 EI-8, one vocabulary). */
  static DERIVED_FIELDS = DERIVED_FIELDS;
  // eslint-disable-next-line pryzm/store-single-channel -- CA-6/§U-B6: see above.
  affectedStores = ["balcony", "slab", "floor", "handrail"];
  canExecute(ctx, cmd) {
    const existing = ctx.stores.balcony[cmd.balconyId];
    if (!existing) return { valid: false, reason: `balcony not found: ${cmd.balconyId}` };
    if (!Array.isArray(cmd.boundary) || cmd.boundary.length < 3) {
      return { valid: false, reason: "balcony boundary needs >= 3 vertices" };
    }
    const parsed = Balcony.safeParse({ ...existing, boundary: cmd.boundary });
    if (!parsed.success) {
      return { valid: false, reason: parsed.error.issues[0]?.message ?? "invalid balcony outline" };
    }
    const need = resolveFreeEdges(parsed.data.boundary, cmd.hostSegment).length;
    const have = this._existingRailIds(existing).length;
    const supplied = cmd.addedRailingIds?.length ?? 0;
    if (need > have + supplied) {
      return {
        valid: false,
        reason: `this outline has ${need} free edges and the balcony has ${have} railings; ${need - have} more pre-minted railing id(s) are required in addedRailingIds (got ${supplied}).`
      };
    }
    return { valid: true };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      const existing = ctx.stores.balcony[cmd.balconyId];
      if (!existing) throw new BalconyNotFoundError(cmd.balconyId);
      const parsed = Balcony.safeParse({ ...existing, boundary: cmd.boundary });
      if (!parsed.success) {
        throw new BalconyBoundaryError(parsed.error.issues[0]?.message ?? "invalid balcony outline");
      }
      const next = parsed.data;
      const oldRailIds = this._existingRailIds(existing);
      const free = resolveFreeEdges(next.boundary, cmd.hostSegment);
      const added = cmd.addedRailingIds ?? [];
      const nextRailIds = [];
      for (let i = 0; i < free.length; i++) {
        const reused = oldRailIds[i];
        if (reused !== void 0) {
          nextRailIds.push(reused);
        } else {
          const fresh = added[i - oldRailIds.length];
          if (fresh === void 0) {
            throw new BalconyMemberIdError(
              `this outline has ${free.length} free edges and the balcony has ${oldRailIds.length} railings; ${free.length - oldRailIds.length} more pre-minted railing id(s) are required in addedRailingIds (got ${added.length}).`
            );
          }
          nextRailIds.push(fresh);
        }
      }
      const removedRailIds = oldRailIds.slice(free.length);
      const asm = buildBalconyAssembly(
        next,
        { slabId: existing.childrenIds[0], floorId: existing.childrenIds[1], railingIds: nextRailIds },
        { hostSegment: cmd.hostSegment, systemType: cmd.systemType }
      );
      const slabId = existing.childrenIds[0];
      const floorId = existing.childrenIds[1];
      const out = produceMultiStoreCommand(
        {
          balcony: ctx.stores.balcony,
          slab: ctx.stores.slab,
          floor: ctx.stores.floor,
          handrail: ctx.stores.handrail
        },
        {
          balcony: (d) => {
            const draft = d;
            draft[cmd.balconyId] = {
              ...next,
              childrenIds: [slabId, floorId, ...nextRailIds]
            };
          },
          slab: (d) => {
            const draft = d;
            const rec = draft[slabId];
            if (rec) rec["boundary"] = asm.slab.boundary;
            else draft[slabId] = asm.slab;
          },
          floor: (d) => {
            const draft = d;
            const rec = draft[floorId];
            if (rec) rec["boundary"] = asm.finish.boundary;
            else draft[floorId] = asm.finish;
          },
          handrail: (d) => {
            const draft = d;
            for (const r of asm.railings) {
              const rec = draft[r.id];
              if (rec) rec["path"] = r.path;
              else draft[r.id] = r;
            }
            for (const id of removedRailIds) delete draft[id];
          }
        }
      );
      return { forward: out.forward, inverse: out.inverse, nextStates: out.nextStates };
    });
  }
  /**
   * The balcony's railing ids, in free-edge order.
   *
   * `childrenIds` is `[slabId, floorId, ...railingIds]` by construction in
   * `CreateBalcony`, and this is the ONE place that ordering is decoded — so if it
   * ever changes, it changes in two places that are next to each other rather than in
   * five places that are not.
   */
  _existingRailIds(b) {
    return b.childrenIds.slice(2);
  }
}

function buildBalconyHandlerSet() {
  return [
    new CreateBalconyHandler(),
    new UpdateBalconyProfileHandler(),
    new DeleteBalconyHandler()
  ];
}

class ComponentStore extends Store {
  constructor() {
    super("component");
  }
  ids() {
    return [...this.state.keys()];
  }
  get(id) {
    return this.state.get(id);
  }
  /** Every placed occurrence on a given level. O(N). */
  byLevel(levelId) {
    const out = [];
    for (const c of this.state.values()) if (c.levelId === levelId) out.push(c);
    return out;
  }
  /**
   * ⭐ EVERY OCCURRENCE OF ONE DEFINITION — the query spec §66's twenty-instance
   * falsifier is written against, and the one `graph.query(typeId,'instantiates')`
   * will resolve through in Phase 4G.
   *
   * ⚠ It is O(N) in placed components and that is the right cost today: an index
   * would be a second answer to the same question, and C84 EI-9 is the reason not
   * to mint one before a measurement demands it.
   */
  byDefinition(definitionId) {
    const out = [];
    for (const c of this.state.values()) if (c.definitionId === definitionId) out.push(c);
    return out;
  }
  /**
   * Every occurrence wearing a given named type.
   *
   * ⚠ NOT a reverse index maintained on write — computed on demand, for the same
   * reason `byDefinition` is. A maintained index would have to be corrected by
   * `component.swapType`, which is one more place for the two to disagree.
   */
  byType(typeId) {
    const out = [];
    for (const c of this.state.values()) if (c.typeId === typeId) out.push(c);
    return out;
  }
}

class ComponentSystemError extends Error {
  constructor(message) {
    super(message);
    this.name = "ComponentSystemError";
  }
}
class ComponentNotFoundError extends ComponentSystemError {
  constructor(componentId) {
    super(`placed component not found: ${componentId}`);
    this.name = "ComponentNotFoundError";
  }
}
class ComponentDefinitionRefError extends ComponentSystemError {
  constructor(message) {
    super(message);
    this.name = "ComponentDefinitionRefError";
  }
}
class ComponentTypeRefError extends ComponentSystemError {
  constructor(message) {
    super(message);
    this.name = "ComponentTypeRefError";
  }
}
class ComponentParameterWriteError extends ComponentSystemError {
  constructor(message) {
    super(message);
    this.name = "ComponentParameterWriteError";
  }
}

const DEFINITION_RE = /^fam_[0-9A-HJKMNP-TV-Z]{26}$/;
const TYPE_RE$1 = /^typ_[0-9A-HJKMNP-TV-Z]{26}$/;
const PARAMETER_RE$1 = /^par_[0-9A-HJKMNP-TV-Z]{26}$/;
class PlaceComponentHandler {
  type = "component.place";
  /** CA-6 / §U-B6 — one store, because the command writes exactly one. */
  affectedStores = ["component"];
  canExecute(ctx, cmd) {
    if (typeof cmd.componentId !== "string" || cmd.componentId.length === 0) {
      return { valid: false, reason: "componentId must be a non-empty string" };
    }
    if (ctx.stores.component[cmd.componentId]) {
      return { valid: false, reason: `duplicate component id: ${cmd.componentId}` };
    }
    if (!DEFINITION_RE.test(cmd.definitionId ?? "")) {
      return {
        valid: false,
        reason: `component.place needs a definitionId of the form fam_<ULID> (C111 §1.1-a); got ${JSON.stringify(cmd.definitionId)}. A placed occurrence of no definition is unresolvable — it would carry no parameters, no geometry and no meaning.`
      };
    }
    if (!TYPE_RE$1.test(cmd.typeId ?? "")) {
      return {
        valid: false,
        reason: `component.place needs a typeId of the form typ_<ULID> (C111 §1.1-a); got ${JSON.stringify(cmd.typeId)}. Every definition declares at least one type (FamilyDocumentSchema.types is .min(1)), so an occurrence always wears one.`
      };
    }
    for (const key of Object.keys(cmd.instanceParameters ?? {})) {
      if (!PARAMETER_RE$1.test(key)) {
        return {
          valid: false,
          reason: `instanceParameters key ${JSON.stringify(key)} is not a par_<ULID>. Overrides are keyed by parameter ID, never by display name — a rename would silently orphan a name-keyed override.`
        };
      }
    }
    const parsed = Component.safeParse(this._recordOf(cmd));
    if (!parsed.success) {
      return { valid: false, reason: parsed.error.issues[0]?.message ?? "invalid component" };
    }
    return { valid: true };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      if (!DEFINITION_RE.test(cmd.definitionId ?? "")) {
        throw new ComponentDefinitionRefError(
          `component.place: definitionId ${JSON.stringify(cmd.definitionId)} is not a fam_<ULID>.`
        );
      }
      if (!TYPE_RE$1.test(cmd.typeId ?? "")) {
        throw new ComponentTypeRefError(
          `component.place: typeId ${JSON.stringify(cmd.typeId)} is not a typ_<ULID>.`
        );
      }
      const record = Component.parse(this._recordOf(cmd));
      const [next, forward, inverse] = produceCommand(
        ctx.stores.component,
        (draft) => {
          draft[cmd.componentId] = record;
        }
      );
      return { forward, inverse, nextStates: { component: next } };
    });
  }
  /**
   * The record as the L0 schema sees it — used by BOTH `canExecute` and `execute`
   * so the two cannot disagree about what a valid placement is.
   *
   * ⚠ ABSENT STAYS ABSENT (C79 §2.3). An optional field is spread in only when the
   * caller sent it; writing `hostId: undefined` would put the key in the record and
   * change its packed bytes, and writing a default would invent a fact the user did
   * not state.
   */
  _recordOf(cmd) {
    return {
      id: cmd.componentId,
      type: "component",
      levelId: cmd.levelId ?? "",
      definitionId: cmd.definitionId,
      typeId: cmd.typeId,
      ...cmd.definitionVersion !== void 0 ? { definitionVersion: cmd.definitionVersion } : {},
      ...cmd.origin !== void 0 ? { origin: cmd.origin } : {},
      ...cmd.rotation !== void 0 ? { rotation: cmd.rotation } : {},
      ...cmd.hostId !== void 0 ? { hostId: cmd.hostId } : {},
      ...cmd.materialId !== void 0 ? { materialId: cmd.materialId } : {},
      instanceParameters: { ...cmd.instanceParameters ?? {} }
    };
  }
}

const TYPE_RE = /^typ_[0-9A-HJKMNP-TV-Z]{26}$/;
class SwapComponentTypeHandler {
  type = "component.swapType";
  affectedStores = ["component"];
  canExecute(ctx, cmd) {
    const current = ctx.stores.component[cmd.componentId];
    if (!current) {
      return { valid: false, reason: `placed component not found: ${cmd.componentId}` };
    }
    if (!TYPE_RE.test(cmd.typeId ?? "")) {
      return {
        valid: false,
        reason: `component.swapType needs a typeId of the form typ_<ULID> (C111 §1.1-a); got ${JSON.stringify(cmd.typeId)}.`
      };
    }
    if (current.typeId === cmd.typeId) {
      return {
        valid: false,
        reason: `component ${cmd.componentId} already wears type ${cmd.typeId}; nothing to swap.`
      };
    }
    return { valid: true };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      const current = ctx.stores.component[cmd.componentId];
      if (!current) throw new ComponentNotFoundError(cmd.componentId);
      if (!TYPE_RE.test(cmd.typeId ?? "")) {
        throw new ComponentTypeRefError(
          `component.swapType: typeId ${JSON.stringify(cmd.typeId)} is not a typ_<ULID>.`
        );
      }
      const [next, forward, inverse] = produceCommand(
        ctx.stores.component,
        (draft) => {
          draft[cmd.componentId]["typeId"] = cmd.typeId;
        }
      );
      return { forward, inverse, nextStates: { component: next } };
    });
  }
}

const PARAMETER_RE = /^par_[0-9A-HJKMNP-TV-Z]{26}$/;
class SetComponentInstanceParameterHandler {
  type = "component.setInstanceParameter";
  affectedStores = ["component"];
  canExecute(ctx, cmd) {
    const current = ctx.stores.component[cmd.componentId];
    if (!current) {
      return { valid: false, reason: `placed component not found: ${cmd.componentId}` };
    }
    if (!PARAMETER_RE.test(cmd.parameterId ?? "")) {
      return {
        valid: false,
        reason: `parameterId ${JSON.stringify(cmd.parameterId)} is not a par_<ULID>. Overrides are keyed by parameter ID, never by display name — a rename would silently orphan a name-keyed override.`
      };
    }
    const setting = cmd.value !== void 0;
    const clearing = cmd.clear === true;
    if (setting && clearing) {
      return {
        valid: false,
        reason: `component.setInstanceParameter was sent BOTH a value and clear:true for ${cmd.parameterId}. Setting and clearing are different acts; send one.`
      };
    }
    if (!setting && !clearing) {
      return {
        valid: false,
        reason: `component.setInstanceParameter needs either a value or clear:true for ${cmd.parameterId}. A command that changes nothing still costs the user a Ctrl+Z.`
      };
    }
    if (setting) {
      const t = typeof cmd.value;
      if (t !== "number" && t !== "string" && t !== "boolean") {
        return {
          valid: false,
          reason: `instance parameter value must be a number, string or boolean; got ${t}.`
        };
      }
      if (t === "number" && !Number.isFinite(cmd.value)) {
        return { valid: false, reason: "instance parameter value must be a finite number." };
      }
    }
    if (clearing && current.instanceParameters[cmd.parameterId] === void 0) {
      return {
        valid: false,
        reason: `component ${cmd.componentId} has no instance override for ${cmd.parameterId}; there is nothing to clear.`
      };
    }
    return { valid: true };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      const current = ctx.stores.component[cmd.componentId];
      if (!current) throw new ComponentNotFoundError(cmd.componentId);
      if (!PARAMETER_RE.test(cmd.parameterId ?? "")) {
        throw new ComponentParameterWriteError(
          `component.setInstanceParameter: parameterId ${JSON.stringify(cmd.parameterId)} is not a par_<ULID>.`
        );
      }
      const setting = cmd.value !== void 0;
      const clearing = cmd.clear === true;
      if (setting === clearing) {
        throw new ComponentParameterWriteError(
          `component.setInstanceParameter: send exactly one of value / clear:true (got value=${JSON.stringify(cmd.value)}, clear=${JSON.stringify(cmd.clear)}).`
        );
      }
      const [next, forward, inverse] = produceCommand(
        ctx.stores.component,
        (draft) => {
          const rec = draft[cmd.componentId];
          const params = rec["instanceParameters"];
          if (clearing) delete params[cmd.parameterId];
          else params[cmd.parameterId] = cmd.value;
        }
      );
      return { forward, inverse, nextStates: { component: next } };
    });
  }
}

function buildComponentHandlerSet() {
  return [
    new PlaceComponentHandler(),
    new SwapComponentTypeHandler(),
    new SetComponentInstanceParameterHandler()
  ];
}

class LiftCompoundStore extends Store {
  constructor() {
    super("lift");
  }
  ids() {
    return [...this.state.keys()];
  }
  get(id) {
    return this.state.get(id);
  }
  /** Every lift ANCHORED on a given level (its base level). O(N). */
  byLevel(levelId) {
    const out = [];
    for (const l of this.state.values()) if (l.levelId === levelId) out.push(l);
    return out;
  }
  /**
   * Every lift that SERVES a given level — which is a different question from
   * `byLevel` and is the one a floor plan actually asks. A lift anchored on the
   * ground floor still puts a landing door on storey 7, and a plan of storey 7
   * that only looked at `levelId` would draw nothing.
   */
  servingLevel(levelId) {
    const out = [];
    for (const l of this.state.values()) {
      if (l.servedLevelIds.includes(levelId)) out.push(l);
    }
    return out;
  }
  /**
   * Every lift hosted in a given wall — the reverse index the WALL needs when it
   * is deleted. A wall cannot vanish out from under a wall-hosted lift and leave
   * it claiming a host that is gone.
   */
  byHostWall(wallId) {
    const out = [];
    for (const l of this.state.values()) if (l.hostWallId === wallId) out.push(l);
    return out;
  }
  /** Every lift whose shaft voids a given slab — the slab's reverse index. */
  byPenetratedSlab(slabId) {
    const out = [];
    for (const l of this.state.values()) {
      if (l.penetratedSlabIds.includes(slabId)) out.push(l);
    }
    return out;
  }
}
class LiftPartStore extends Store {
  constructor() {
    super("liftPart");
  }
  ids() {
    return [...this.state.keys()];
  }
  get(id) {
    return this.state.get(id);
  }
  /**
   * The cabin parts of a given lift, in `LIFT_PART_CYCLE_ORDER`. This is the
   * query the Tab drill-in and the property inspector both read, so it lives here
   * once rather than being re-derived by each of them in a different order.
   */
  byLift(liftId) {
    const out = [];
    for (const p of this.state.values()) if (p.liftId === liftId) out.push(p);
    return out;
  }
  /** One named part of one lift — what "select the cabin ceiling alone" resolves through. */
  partOfKind(liftId, kind) {
    for (const p of this.state.values()) {
      if (p.liftId === liftId && p.kind === kind) return p;
    }
    return void 0;
  }
}

class LiftSystemError extends Error {
  constructor(message) {
    super(message);
    this.name = "LiftSystemError";
  }
}
class LiftNotFoundError extends LiftSystemError {
  constructor(liftId) {
    super(`lift not found: ${liftId}`);
    this.name = "LiftNotFoundError";
  }
}
class LiftHostWallError extends LiftSystemError {
  constructor(message) {
    super(message);
    this.name = "LiftHostWallError";
  }
}
class LiftServedLevelsError extends LiftSystemError {
  constructor(message) {
    super(message);
    this.name = "LiftServedLevelsError";
  }
}
class LiftGeometryError extends LiftSystemError {
  constructor(message) {
    super(message);
    this.name = "LiftGeometryError";
  }
}

const DEFAULT_LIFT_TYPE_ID = "passenger-6";
class CreateLiftHandler {
  type = "lift.create";
  /**
   * CA-6 / §U-B6. SIX stores, because the command really does write six.
   * Declaring fewer would silently DROP the undeclared store's patches from undo
   * routing. For `slab` specifically that means Ctrl+Z removing the lift but
   * LEAVING THE VOID — the pool's "worse than no feature" case, multiplied by the
   * number of storeys served.
   */
  // eslint-disable-next-line pryzm/store-single-channel -- CA-6/§U-B6, see above.
  affectedStores = ["lift", "liftPart", "wall", "curtainwall", "door", "slab"];
  canExecute(ctx, cmd) {
    if (typeof cmd.liftId !== "string" || cmd.liftId.length === 0) {
      return { valid: false, reason: "liftId must be a non-empty string" };
    }
    if (ctx.stores.lift[cmd.liftId]) {
      return { valid: false, reason: `duplicate lift id: ${cmd.liftId}` };
    }
    if (!Array.isArray(cmd.servedLevels) || cmd.servedLevels.length === 0) {
      return {
        valid: false,
        reason: "a lift must serve at least one level — the storey question has no valid empty answer"
      };
    }
    const seen = /* @__PURE__ */ new Set();
    for (const l of cmd.servedLevels) {
      if (typeof l.levelId !== "string" || l.levelId.length === 0) {
        return { valid: false, reason: "every served level must name a levelId" };
      }
      if (seen.has(l.levelId)) {
        return { valid: false, reason: `served level listed twice: ${l.levelId}` };
      }
      seen.add(l.levelId);
      if (!Number.isFinite(l.elevation)) {
        return {
          valid: false,
          reason: `served level ${l.levelId} has a non-finite elevation`
        };
      }
      if (l.slabId !== void 0 && !ctx.stores.slab[l.slabId]) {
        return {
          valid: false,
          reason: `served level ${l.levelId} names slab ${l.slabId}, which does not exist`
        };
      }
    }
    if (cmd.enclosureType === "wall-hosted") {
      if (!cmd.hostWallId) {
        return {
          valid: false,
          reason: "a wall-hosted lift must name the wall it is hosted in (hostWallId)"
        };
      }
      if (!ctx.stores.wall[cmd.hostWallId]) {
        return { valid: false, reason: `host wall not found: ${cmd.hostWallId}` };
      }
    }
    if (cmd.enclosureIds.length !== ENCLOSURE_SIDE_COUNT) {
      return {
        valid: false,
        reason: `expected ${ENCLOSURE_SIDE_COUNT} enclosure ids, got ${cmd.enclosureIds.length}`
      };
    }
    if (cmd.landingDoorIds.length !== cmd.servedLevels.length) {
      return {
        valid: false,
        reason: `expected ${cmd.servedLevels.length} landing-door ids (one per served level), got ${cmd.landingDoorIds.length}`
      };
    }
    if (cmd.cabinPartIds.length !== LIFT_PART_CYCLE_ORDER.length) {
      return {
        valid: false,
        reason: `expected ${LIFT_PART_CYCLE_ORDER.length} cabin-part ids, got ${cmd.cabinPartIds.length}`
      };
    }
    const parsed = LiftCompoundSchema.safeParse(this._recordOf(cmd));
    if (!parsed.success) {
      return { valid: false, reason: parsed.error.issues[0]?.message ?? "invalid lift" };
    }
    return { valid: true };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      const parsed = LiftCompoundSchema.safeParse(this._recordOf(cmd));
      if (!parsed.success) {
        throw new LiftGeometryError(
          parsed.error.issues[0]?.message ?? "invalid lift record"
        );
      }
      const lift = parsed.data;
      if (lift.enclosureType === "wall-hosted" && !ctx.stores.wall[lift.hostWallId]) {
        throw new LiftHostWallError(`host wall not found: ${lift.hostWallId}`);
      }
      if (cmd.servedLevels.length === 0) {
        throw new LiftServedLevelsError("a lift must serve at least one level");
      }
      const systemType = BUILT_IN_LIFT_TYPES.find(
        (t) => t.id === (cmd.typeId ?? DEFAULT_LIFT_TYPE_ID)
      );
      const asm = buildLiftAssembly(
        {
          id: lift.id,
          levelId: lift.levelId,
          origin: lift.origin,
          rotation: lift.rotation,
          enclosureType: lift.enclosureType,
          ...lift.hostWallId ? { hostWallId: lift.hostWallId } : {},
          ...lift.materialId ? { materialId: lift.materialId } : {},
          ...lift.glassMaterialId ? { glassMaterialId: lift.glassMaterialId } : {},
          ...lift.frameMaterialId ? { frameMaterialId: lift.frameMaterialId } : {},
          ...lift.guideRailMaterialId ? { guideRailMaterialId: lift.guideRailMaterialId } : {},
          ...lift.shaftWidth !== void 0 ? { shaftWidth: lift.shaftWidth } : {},
          ...lift.shaftDepth !== void 0 ? { shaftDepth: lift.shaftDepth } : {},
          ...lift.shaftWallThickness !== void 0 ? { shaftWallThickness: lift.shaftWallThickness } : {},
          ...lift.doorWidth !== void 0 ? { doorWidth: lift.doorWidth } : {},
          ...lift.doorHeight !== void 0 ? { doorHeight: lift.doorHeight } : {},
          ...lift.carCapacityPersons !== void 0 ? { carCapacityPersons: lift.carCapacityPersons } : {},
          ...lift.pitDepth !== void 0 ? { pitDepth: lift.pitDepth } : {},
          ...lift.overrunHeight !== void 0 ? { overrunHeight: lift.overrunHeight } : {}
        },
        {
          enclosureIds: cmd.enclosureIds,
          landingDoorIds: cmd.landingDoorIds,
          cabinPartIds: cmd.cabinPartIds
        },
        cmd.servedLevels,
        systemType
      );
      const liftRecord = {
        ...lift,
        childrenIds: [...asm.childrenIds],
        landingSideId: asm.landingSideId,
        penetratedSlabIds: asm.slabVoids.map((v) => v.slabId),
        // FEAT-LIFT-OBSERVATION-FRAME (L-9400) — the resolved vertical span,
        // written ONCE by the one producer that computes it. See the
        // `shaftBaseOffset` docstring in `LiftCompoundTypes.ts` for why three
        // derived scalars are stored on the parent: the enclosure sides this
        // same assembly emits already persist the identical two numbers as
        // `height` and `baseOffset`, so this adds no new drift class — and
        // without them the render layer would have to re-resolve the project
        // level table, becoming a SECOND producer that could disagree with
        // the walls.
        shaftBaseOffset: asm.shaftBaseOffset,
        shaftHeight: asm.shaftHeight,
        carParkOffsetY: asm.carParkOffsetY
      };
      const out = produceMultiStoreCommand(
        {
          lift: ctx.stores.lift,
          liftPart: ctx.stores.liftPart,
          wall: ctx.stores.wall,
          curtainwall: ctx.stores.curtainwall,
          door: ctx.stores.door,
          slab: ctx.stores.slab
        },
        {
          lift: (d) => {
            d[lift.id] = liftRecord;
          },
          liftPart: (d) => {
            for (const p of asm.cabinParts) d[p.id] = p;
            for (const p of asm.shaftParts) d[p.id] = p;
          },
          wall: (d) => {
            for (const s of asm.enclosure) {
              if (s.kind === "wall") d[s.id] = s.record;
            }
          },
          curtainwall: (d) => {
            for (const s of asm.enclosure) {
              if (s.kind === "curtainWall") {
                d[s.id] = s.record;
              }
            }
          },
          door: (d) => {
            for (const dr of asm.landingDoors) {
              d[dr.id] = dr;
            }
          },
          slab: (d) => {
            const draft = d;
            for (const v of asm.slabVoids) {
              const s = draft[v.slabId];
              if (s) s.holes = [...s.holes ?? [], v.loop];
            }
          }
        }
      );
      return {
        forward: out.forward,
        inverse: out.inverse,
        nextStates: out.nextStates
      };
    });
  }
  /**
   * The lift record as the schema sees it. Used by BOTH `canExecute` and
   * `execute` so they cannot disagree about what a valid lift is.
   */
  _recordOf(cmd) {
    return {
      id: cmd.liftId,
      type: "lift",
      levelId: cmd.levelId,
      enclosureType: cmd.enclosureType,
      kind: cmd.kind ?? "passenger",
      typeId: cmd.typeId ?? DEFAULT_LIFT_TYPE_ID,
      origin: cmd.origin,
      rotation: cmd.rotation ?? 0,
      servedLevelIds: cmd.servedLevels.map((l) => l.levelId),
      ...cmd.hostWallId ? { hostWallId: cmd.hostWallId } : {},
      childrenIds: [],
      penetratedSlabIds: [],
      ...cmd.shaftWidth !== void 0 ? { shaftWidth: cmd.shaftWidth } : {},
      ...cmd.shaftDepth !== void 0 ? { shaftDepth: cmd.shaftDepth } : {},
      ...cmd.shaftWallThickness !== void 0 ? { shaftWallThickness: cmd.shaftWallThickness } : {},
      ...cmd.doorWidth !== void 0 ? { doorWidth: cmd.doorWidth } : {},
      ...cmd.doorHeight !== void 0 ? { doorHeight: cmd.doorHeight } : {},
      ...cmd.carCapacityPersons !== void 0 ? { carCapacityPersons: cmd.carCapacityPersons } : {},
      ...cmd.pitDepth !== void 0 ? { pitDepth: cmd.pitDepth } : {},
      ...cmd.overrunHeight !== void 0 ? { overrunHeight: cmd.overrunHeight } : {},
      ...cmd.materialId ? { materialId: cmd.materialId } : {},
      ...cmd.glassMaterialId ? { glassMaterialId: cmd.glassMaterialId } : {},
      ...cmd.frameMaterialId ? { frameMaterialId: cmd.frameMaterialId } : {},
      ...cmd.guideRailMaterialId ? { guideRailMaterialId: cmd.guideRailMaterialId } : {}
    };
  }
}

const EPS = 1e-6;
function sameLoop(a, b, ignoreY = false) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const p = a[i];
    const q = b[i];
    if (Math.abs(p.x - q.x) > EPS || Math.abs(p.z - q.z) > EPS) return false;
    if (!ignoreY && Math.abs(p.y - q.y) > EPS) return false;
  }
  return true;
}
class DeleteLiftHandler {
  type = "lift.delete";
  /** The same six stores the create touched — the delete must be able to undo it. */
  // eslint-disable-next-line pryzm/store-single-channel -- CA-6/§U-B6, see above.
  affectedStores = ["lift", "liftPart", "wall", "curtainwall", "door", "slab"];
  canExecute(ctx, cmd) {
    if (!ctx.stores.lift[cmd.liftId]) {
      return { valid: false, reason: `lift not found: ${cmd.liftId}` };
    }
    return { valid: true };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      const lift = ctx.stores.lift[cmd.liftId];
      if (!lift) throw new LiftNotFoundError(cmd.liftId);
      const childIds = new Set(lift.childrenIds);
      const { loops, exactY } = this._healableLoops(lift, cmd.servedLevels);
      const healed = /* @__PURE__ */ new Map();
      for (const slabId of lift.penetratedSlabIds) {
        const slab = ctx.stores.slab[slabId];
        if (!slab) continue;
        const before = slab.holes ?? [];
        const after = before.filter(
          (loop) => !loops.some((mine) => sameLoop(loop, mine, !exactY))
        );
        healed.set(slabId, after);
      }
      const out = produceMultiStoreCommand(
        {
          lift: ctx.stores.lift,
          liftPart: ctx.stores.liftPart,
          wall: ctx.stores.wall,
          curtainwall: ctx.stores.curtainwall,
          door: ctx.stores.door,
          slab: ctx.stores.slab
        },
        {
          lift: (d) => {
            delete d[cmd.liftId];
          },
          liftPart: (d) => {
            const draft = d;
            for (const id of Object.keys(draft)) if (childIds.has(id)) delete draft[id];
          },
          wall: (d) => {
            const draft = d;
            for (const id of Object.keys(draft)) if (childIds.has(id)) delete draft[id];
          },
          curtainwall: (d) => {
            const draft = d;
            for (const id of Object.keys(draft)) if (childIds.has(id)) delete draft[id];
          },
          door: (d) => {
            const draft = d;
            for (const id of Object.keys(draft)) if (childIds.has(id)) delete draft[id];
          },
          slab: (d) => {
            const draft = d;
            for (const [slabId, after] of healed) {
              const s = draft[slabId];
              if (s) s.holes = after;
            }
          }
        }
      );
      return {
        forward: out.forward,
        inverse: out.inverse,
        nextStates: out.nextStates
      };
    });
  }
  /**
   * The void loops this lift punched, re-derived from the pure assembly.
   *
   * `exactY` reports which of the two matching regimes applies, so the caller can
   * say so rather than silently using the weaker one:
   *   - `true`  — the caller supplied the served levels, so each loop carries its
   *               real elevation and matching is exact in all three axes.
   *   - `false` — no levels supplied; only the XZ footprint is known, so matching
   *               ignores Y. See the `DeleteLiftPayload.servedLevels` docstring.
   */
  _healableLoops(lift, servedLevels) {
    const exactY = Array.isArray(servedLevels) && servedLevels.length > 0;
    const levels = exactY ? [...servedLevels] : lift.servedLevelIds.map((id) => ({ levelId: id, elevation: 0, slabId: void 0 }));
    const systemType = BUILT_IN_LIFT_TYPES.find((t) => t.id === lift.typeId);
    const asm = buildLiftAssembly(
      {
        id: lift.id,
        levelId: lift.levelId,
        origin: lift.origin,
        rotation: lift.rotation,
        enclosureType: lift.enclosureType,
        ...lift.hostWallId ? { hostWallId: lift.hostWallId } : {},
        ...lift.shaftWidth !== void 0 ? { shaftWidth: lift.shaftWidth } : {},
        ...lift.shaftDepth !== void 0 ? { shaftDepth: lift.shaftDepth } : {},
        ...lift.shaftWallThickness !== void 0 ? { shaftWallThickness: lift.shaftWallThickness } : {},
        ...lift.doorWidth !== void 0 ? { doorWidth: lift.doorWidth } : {}
      },
      {
        // Placeholder ids: this call is used ONLY for its geometry. The ids
        // never leave this function.
        enclosureIds: ["a", "b", "c", "d"],
        landingDoorIds: levels.map((_, i) => `d${i}`),
        cabinPartIds: ["p0", "p1", "p2", "p3", "p4"]
      },
      // Give every level a slab id so the assembly emits a loop for each; the
      // loops are all we read.
      levels.map((l) => ({ ...l, slabId: l.slabId ?? `probe-${l.levelId}` })),
      systemType
    );
    return { loops: asm.slabVoids.map((v) => [...v.loop]), exactY };
  }
}

function buildLiftHandlerSet() {
  return [
    new CreateLiftHandler(),
    new DeleteLiftHandler()
  ];
}

class BoundaryLineStore extends Store {
  constructor() {
    super("boundaryLine");
  }
  ids() {
    return [...this.state.keys()];
  }
  get(id) {
    return this.state.get(id);
  }
  /** Every boundary line on a given level. O(N). */
  byLevel(levelId) {
    const out = [];
    for (const b of this.state.values()) if (b.levelId === levelId) out.push(b);
    return out;
  }
  /**
   * ⭐ THE REVERSE INDEX — "which boundary line is this element attached to?"
   *
   * The edge is stored on the HOST (C106 §3.2, and C84 EI-PROP-d's requirement that
   * the record hold an edge to walk), so answering the question from the DEPENDENT's
   * side is a scan. It is O(lines × attachments) and that is acceptable: a project
   * has tens of construction lines, not thousands, and the alternative — a
   * `boundaryLineId` field on Wall, Slab, Column, Beam, Roof, Stair, Furniture and
   * Plumbing — is EIGHT schema amendments across C85–C99 for one host, each of which
   * could then disagree with this one.
   *
   * Returns every line that claims the element, not just the first: two lines
   * claiming one wall is a real (if unusual) authoring state, and silently returning
   * one of them would make a propagation half-run with nothing said.
   */
  linesHolding(elementId) {
    const out = [];
    for (const b of this.state.values()) {
      if (b.attachments.some((a) => a.elementId === elementId)) out.push(b);
    }
    return out;
  }
  /** Every element attached to a line, as `(id, kind)` pairs. */
  attachmentsOf(boundaryLineId) {
    return this.state.get(boundaryLineId)?.attachments ?? [];
  }
}

class BoundaryLineSystemError extends Error {
  constructor(message) {
    super(message);
    this.name = "BoundaryLineSystemError";
  }
}
class BoundaryLineGeometryError extends BoundaryLineSystemError {
  constructor(message) {
    super(message);
    this.name = "BoundaryLineGeometryError";
  }
}

class CreateBoundaryLineHandler {
  type = "boundaryLine.create";
  affectedStores = ["boundaryLine"];
  canExecute(ctx, cmd) {
    if (typeof cmd.boundaryLineId !== "string" || cmd.boundaryLineId.length === 0) {
      return { valid: false, reason: "boundaryLineId must be a non-empty string" };
    }
    if (ctx.stores.boundaryLine[cmd.boundaryLineId]) {
      return { valid: false, reason: `duplicate boundary line id: ${cmd.boundaryLineId}` };
    }
    if (typeof cmd.levelId !== "string" || cmd.levelId.length === 0) {
      return { valid: false, reason: "levelId is required — a boundary line is drawn on a level" };
    }
    const parsed = BoundaryLine.safeParse(this._recordOf(cmd));
    if (!parsed.success) {
      return { valid: false, reason: parsed.error.issues[0]?.message ?? "invalid boundary line" };
    }
    const mat = resolveBoundaryLineMaterial(parsed.data);
    if (mat.kind === "unresolved") return { valid: false, reason: mat.reason };
    return { valid: true };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(
      this.type + ".handler",
      { "pryzm.command.type": this.type },
      () => {
        const parsed = BoundaryLine.safeParse(this._recordOf(cmd));
        if (!parsed.success) {
          throw new BoundaryLineGeometryError(
            parsed.error.issues[0]?.message ?? "invalid boundary line"
          );
        }
        const record = parsed.data;
        const [next, forward, inverse] = produceCommand(
          ctx.stores.boundaryLine,
          (draft) => {
            draft[cmd.boundaryLineId] = record;
          }
        );
        return { forward, inverse, nextStates: { boundaryLine: next } };
      }
    );
  }
  /** The record as the schema sees it — used by BOTH canExecute and execute, so the
   *  gate and the mutation can never disagree about what is being written. */
  _recordOf(cmd) {
    return {
      id: cmd.boundaryLineId,
      levelId: cmd.levelId,
      vertices: cmd.vertices,
      closed: cmd.closed ?? false,
      ...cmd.drawMode !== void 0 ? { drawMode: cmd.drawMode } : {},
      hasVolume: cmd.hasVolume ?? false,
      // Every dimensional field is OMITTED when unset rather than passed as
      // `undefined` — "unset" is a first-class state meaning *resolve me*
      // (L-127), and an explicit `undefined` would be indistinguishable from an
      // authored zero once it round-tripped through JSON.
      ...cmd.height !== void 0 ? { height: cmd.height } : {},
      ...cmd.thickness !== void 0 ? { thickness: cmd.thickness } : {},
      ...cmd.baseOffset !== void 0 ? { baseOffset: cmd.baseOffset } : {},
      ...cmd.systemTypeId !== void 0 ? { systemTypeId: cmd.systemTypeId } : {},
      ...cmd.materialId !== void 0 ? { materialId: cmd.materialId } : {},
      ...cmd.materialColor !== void 0 ? { materialColor: cmd.materialColor } : {},
      ...cmd.name !== void 0 ? { name: cmd.name } : {},
      attachments: []
    };
  }
}

class AttachToBoundaryLineHandler {
  type = "boundaryLine.attach";
  affectedStores = ["boundaryLine"];
  canExecute(ctx, cmd) {
    const line = ctx.stores.boundaryLine[cmd.boundaryLineId];
    if (!line) return { valid: false, reason: `boundary line not found: ${cmd.boundaryLineId}` };
    if (!cmd.elementId) return { valid: false, reason: "elementId is required" };
    if (!cmd.elementKind) return { valid: false, reason: "elementKind is required" };
    const rule = boundaryLineRuleFor(cmd.elementKind);
    if (!rule) {
      return {
        valid: false,
        reason: `"${cmd.elementKind}" has no row in the boundary-line host-move table (C106 §3.3), so whether it should follow a boundary line is UNDECIDED — not "no". Add its row before attaching it (C84 EI-PROP-a).`
      };
    }
    if (rule.verdict !== "PROPAGATES") {
      return { valid: false, reason: rule.reason ?? `${rule.family} cannot follow a boundary line.` };
    }
    if (rule.shape === "line" && !cmd.to) {
      return {
        valid: false,
        reason: `${rule.family} is a LINE element, so it needs BOTH ends anchored — send \`to\` as well as \`at\`. With only one end the far end would have nowhere to go when the boundary line moves.`
      };
    }
    if (!anchorOnBoundaryLine(line, cmd.at)) {
      return {
        valid: false,
        reason: `This boundary line has no segment with a direction, so nothing can be anchored to it. Give it at least one segment 1 mm or longer.`
      };
    }
    if (line.attachments.some((a) => a.elementId === cmd.elementId)) {
      return {
        valid: false,
        reason: `${cmd.elementId} is already attached to this boundary line. Detach it first if you want to re-anchor it where it now sits.`
      };
    }
    return { valid: true };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      const line = ctx.stores.boundaryLine[cmd.boundaryLineId];
      const start = anchorOnBoundaryLine(line, cmd.at);
      const end = cmd.to ? anchorOnBoundaryLine(line, cmd.to) : null;
      const attachment = {
        elementId: cmd.elementId,
        elementKind: cmd.elementKind.toLowerCase().trim(),
        segmentIndex: start.segmentIndex,
        t: start.t,
        offset: start.offset,
        ...end ? { end: { segmentIndex: end.segmentIndex, t: end.t, offset: end.offset } } : {}
      };
      const [next, forward, inverse] = produceCommand(ctx.stores.boundaryLine, (draft) => {
        const d = draft;
        const rec = d[cmd.boundaryLineId];
        if (!rec) return;
        rec.attachments = [...rec.attachments, attachment];
      });
      return { forward, inverse, nextStates: { boundaryLine: next } };
    });
  }
}
class DetachFromBoundaryLineHandler {
  type = "boundaryLine.detach";
  affectedStores = ["boundaryLine"];
  canExecute(ctx, cmd) {
    const line = ctx.stores.boundaryLine[cmd.boundaryLineId];
    if (!line) return { valid: false, reason: `boundary line not found: ${cmd.boundaryLineId}` };
    if (!line.attachments.some((a) => a.elementId === cmd.elementId)) {
      return {
        valid: false,
        reason: `${cmd.elementId} is not attached to boundary line ${cmd.boundaryLineId}.`
      };
    }
    return { valid: true };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      const [next, forward, inverse] = produceCommand(ctx.stores.boundaryLine, (draft) => {
        const d = draft;
        const rec = d[cmd.boundaryLineId];
        if (!rec) return;
        rec.attachments = rec.attachments.filter((a) => a.elementId !== cmd.elementId);
      });
      return { forward, inverse, nextStates: { boundaryLine: next } };
    });
  }
}

class UpdateBoundaryLineHandler {
  type = "boundaryLine.update";
  affectedStores = ["boundaryLine"];
  canExecute(ctx, cmd) {
    const line = ctx.stores.boundaryLine[cmd.boundaryLineId];
    if (!line) return { valid: false, reason: `boundary line not found: ${cmd.boundaryLineId}` };
    const next = this._merged(line, cmd);
    const parsed = BoundaryLine.safeParse(next);
    if (!parsed.success) {
      return { valid: false, reason: parsed.error.issues[0]?.message ?? "invalid boundary line" };
    }
    const mat = resolveBoundaryLineMaterial(parsed.data);
    if (mat.kind === "unresolved") return { valid: false, reason: mat.reason };
    return { valid: true };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      const line = ctx.stores.boundaryLine[cmd.boundaryLineId];
      const next = BoundaryLine.parse(this._merged(line, cmd));
      const [nextState, forward, inverse] = produceCommand(
        ctx.stores.boundaryLine,
        (draft) => {
          draft[cmd.boundaryLineId] = next;
        }
      );
      return { forward, inverse, nextStates: { boundaryLine: nextState } };
    });
  }
  /**
   * The next record. ⚠ `undefined` means "not sent", NOT "clear it" — a spread of
   * `{ height: undefined }` over a record that HAS a height would erase it, and the
   * user who toggled `hasVolume` would silently lose an authored dimension.
   */
  _merged(line, cmd) {
    const patch = {};
    for (const k of [
      "hasVolume",
      "height",
      "thickness",
      "baseOffset",
      "systemTypeId",
      "materialId",
      "materialColor",
      "name",
      // §FEAT-BOUNDARY-LINE-PINNED (L-10504) — see the payload field's note.
      "pinned"
    ]) {
      const v = cmd[k];
      if (v !== void 0) patch[k] = v;
    }
    return { ...line, ...patch };
  }
}
class DeleteBoundaryLineHandler {
  type = "boundaryLine.delete";
  affectedStores = ["boundaryLine"];
  canExecute(ctx, cmd) {
    if (!ctx.stores.boundaryLine[cmd.boundaryLineId]) {
      return { valid: false, reason: `boundary line not found: ${cmd.boundaryLineId}` };
    }
    return { valid: true };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      const [next, forward, inverse] = produceCommand(
        ctx.stores.boundaryLine,
        (draft) => {
          delete draft[cmd.boundaryLineId];
        }
      );
      return { forward, inverse, nextStates: { boundaryLine: next } };
    });
  }
}

function buildBoundaryLineHandlerSet() {
  return [
    new CreateBoundaryLineHandler(),
    new AttachToBoundaryLineHandler(),
    new DetachFromBoundaryLineHandler(),
    new UpdateBoundaryLineHandler(),
    new DeleteBoundaryLineHandler()
  ];
}

let _seq = 0;
function mintId() {
  return `section-${Date.now().toString(36)}-${(++_seq).toString(36)}`;
}
class CreateSectionHandler {
  type = "section.create";
  affectedStores = ["section"];
  canExecute(ctx, cmd) {
    if (cmd.id !== void 0 && (typeof cmd.id !== "string" || cmd.id.length === 0)) {
      return { valid: false, reason: "id, when supplied, must be a non-empty string" };
    }
    if (cmd.id !== void 0 && ctx.stores.section[cmd.id]) {
      return { valid: false, reason: `section id "${cmd.id}" already exists` };
    }
    if (!cmd.line || typeof cmd.line !== "object") {
      return { valid: false, reason: "line is required" };
    }
    const { a, b, lookDepth } = cmd.line;
    if (!a || !b || !Number.isFinite(a.x) || !Number.isFinite(a.y) || !Number.isFinite(b.x) || !Number.isFinite(b.y)) {
      return { valid: false, reason: "line.{a,b}.{x,y} must be finite numbers" };
    }
    if (!Number.isFinite(lookDepth) || lookDepth < 0) {
      return { valid: false, reason: "line.lookDepth must be a non-negative finite number" };
    }
    if (cmd.scale !== void 0 && (!Number.isFinite(cmd.scale) || cmd.scale <= 0)) {
      return { valid: false, reason: "scale must be a positive finite number" };
    }
    if (cmd.seq !== void 0 && (!Number.isInteger(cmd.seq) || cmd.seq < 0)) {
      return { valid: false, reason: "seq must be a non-negative integer" };
    }
    return { valid: true };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      const id = cmd.id ?? mintId();
      let nextSeq = cmd.seq;
      if (nextSeq === void 0) {
        let max = -1;
        for (const s of Object.values(ctx.stores.section)) if (s.seq > max) max = s.seq;
        nextSeq = max + 1;
      }
      const data = {
        id,
        ...cmd.mark !== void 0 ? { mark: cmd.mark } : {},
        line: {
          a: { x: cmd.line.a.x, y: cmd.line.a.y },
          b: { x: cmd.line.b.x, y: cmd.line.b.y },
          lookDepth: cmd.line.lookDepth
        },
        scale: cmd.scale ?? 50,
        seq: nextSeq
      };
      const [next, forward, inverse] = produceCommand(ctx.stores.section, (draft) => {
        draft[data.id] = data;
      });
      return { forward, inverse, nextStates: { section: next } };
    });
  }
}

class DeleteSectionHandler {
  type = "section.delete";
  affectedStores = ["section"];
  canExecute(ctx, cmd) {
    if (typeof cmd.id !== "string" || cmd.id.length === 0) {
      return { valid: false, reason: "id must be a non-empty string" };
    }
    if (!ctx.stores.section[cmd.id]) {
      return { valid: false, reason: `no section with id "${cmd.id}"` };
    }
    return { valid: true };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      const [next, forward, inverse] = produceCommand(ctx.stores.section, (draft) => {
        delete draft[cmd.id];
      });
      return { forward, inverse, nextStates: { section: next } };
    });
  }
}

const SECTION_MOVE_LINE_UNREACHABLE = "section.moveLine writes the plugin section store that nothing renders, exports or persists, and NO surface dispatches it — `SECTION_INTENT.MOVE_LINE` is declared in plugins/section-view/src/intent.ts and referenced by nothing, and neither MOVE_COMMAND_BY_TYPE nor any 3-D gizmo drag site names this verb. The store IS bound in production since §PLUGIN-DESCRIPTOR-AT-L5 (L-9922), so the binding is no longer the blocker; the missing half is a bridge from this store to whatever the section renderer reads. Moving a section line therefore still cannot be committed by any path a user can reach today, tracked under Gate G7.";
class MoveSectionLineHandler {
  type = "section.moveLine";
  affectedStores = ["section"];
  /** Payload validation ONLY — kept public so a delegating facade can reuse it. */
  validatePayload(ctx, cmd) {
    if (typeof cmd.id !== "string" || cmd.id.length === 0) {
      return { valid: false, reason: "id must be a non-empty string" };
    }
    if (!ctx.stores.section[cmd.id]) {
      return { valid: false, reason: `no section with id "${cmd.id}"` };
    }
    if (!cmd.a || !cmd.b) return { valid: false, reason: "a and b are required" };
    for (const [k, v] of Object.entries({ "a.x": cmd.a.x, "a.y": cmd.a.y, "b.x": cmd.b.x, "b.y": cmd.b.y })) {
      if (!Number.isFinite(v)) return { valid: false, reason: `${k} must be finite` };
    }
    return { valid: true };
  }
  /**
   * §FIX-DEAD-MOVE-VERB-REFUSE (W3-4) — ORDER IS LOAD-BEARING. `canExecute` must be the
   * LAST method before `execute`. `tools/ga-gate/check-verb-register.ts` classifies a
   * verb as REFUSES by slicing the source from `canExecute` to the next `execute(` and
   * checking that the slice can never yield an ACCEPTING validation result. With
   * `validatePayload` sitting between them, its accepting branch lands inside that slice
   * and the verb is mis-reported as UNKNOWN — a refusal hiding from the register that
   * exists to find it. (For the same reason this comment must not spell the accepting
   * literal out: the detector is a regex over source text, and prose is source text.)
   * Do not reorder these two methods.
   */
  canExecute(ctx, cmd) {
    const v = this.validatePayload(ctx, cmd);
    if (!v.valid) return v;
    return { valid: false, reason: SECTION_MOVE_LINE_UNREACHABLE };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      const [next, forward, inverse] = produceCommand(ctx.stores.section, (draft) => {
        const cur = draft[cmd.id];
        draft[cmd.id] = {
          ...cur,
          line: { a: { x: cmd.a.x, y: cmd.a.y }, b: { x: cmd.b.x, y: cmd.b.y }, lookDepth: cur.line.lookDepth }
        };
      });
      return { forward, inverse, nextStates: { section: next } };
    });
  }
}

class SetSectionDepthHandler {
  type = "section.setDepth";
  affectedStores = ["section"];
  canExecute(ctx, cmd) {
    if (typeof cmd.id !== "string" || cmd.id.length === 0) {
      return { valid: false, reason: "id must be a non-empty string" };
    }
    if (!ctx.stores.section[cmd.id]) {
      return { valid: false, reason: `no section with id "${cmd.id}"` };
    }
    if (!Number.isFinite(cmd.lookDepth) || cmd.lookDepth < 0) {
      return { valid: false, reason: "lookDepth must be a non-negative finite number" };
    }
    return { valid: true };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      const [next, forward, inverse] = produceCommand(ctx.stores.section, (draft) => {
        const cur = draft[cmd.id];
        draft[cmd.id] = { ...cur, line: { ...cur.line, lookDepth: cmd.lookDepth } };
      });
      return { forward, inverse, nextStates: { section: next } };
    });
  }
}

class SetSectionMarkHandler {
  type = "section.setMark";
  affectedStores = ["section"];
  canExecute(ctx, cmd) {
    if (typeof cmd.id !== "string" || cmd.id.length === 0) {
      return { valid: false, reason: "id must be a non-empty string" };
    }
    if (!ctx.stores.section[cmd.id]) {
      return { valid: false, reason: `no section with id "${cmd.id}"` };
    }
    if (typeof cmd.mark !== "string" || cmd.mark.length === 0 || cmd.mark.length > 200) {
      return { valid: false, reason: "mark must be a non-empty string ≤ 200 chars" };
    }
    return { valid: true };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      const [next, forward, inverse] = produceCommand(ctx.stores.section, (draft) => {
        const cur = draft[cmd.id];
        draft[cmd.id] = { ...cur, mark: cmd.mark };
      });
      return { forward, inverse, nextStates: { section: next } };
    });
  }
}

class SetSectionScaleHandler {
  type = "section.setScale";
  affectedStores = ["section"];
  canExecute(ctx, cmd) {
    if (typeof cmd.id !== "string" || cmd.id.length === 0) {
      return { valid: false, reason: "id must be a non-empty string" };
    }
    if (!ctx.stores.section[cmd.id]) {
      return { valid: false, reason: `no section with id "${cmd.id}"` };
    }
    if (!Number.isFinite(cmd.scale) || cmd.scale <= 0) {
      return { valid: false, reason: "scale must be a positive finite number" };
    }
    return { valid: true };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      const [next, forward, inverse] = produceCommand(ctx.stores.section, (draft) => {
        const cur = draft[cmd.id];
        draft[cmd.id] = { ...cur, scale: cmd.scale };
      });
      return { forward, inverse, nextStates: { section: next } };
    });
  }
}

function buildSectionHandlerSet() {
  return [
    new CreateSectionHandler(),
    new DeleteSectionHandler(),
    new MoveSectionLineHandler(),
    new SetSectionDepthHandler(),
    new SetSectionMarkHandler(),
    new SetSectionScaleHandler()
  ];
}

class SectionStore extends Store {
  constructor() {
    super("section");
  }
  ids() {
    return [...this.state.keys()];
  }
  get(id) {
    return this.state.get(id);
  }
  all() {
    return [...this.state.values()];
  }
  /** Find sections whose mark string matches. */
  byMark(mark) {
    const out = [];
    for (const s of this.state.values()) {
      if (s.mark === mark) out.push(s);
    }
    return out;
  }
}

const sectionViewPluginRegistration = {
  id: "section-view",
  storeKey: "section",
  buildStore: () => new SectionStore(),
  buildHandlers: () => buildSectionHandlerSet()
};

class SelectionStoreUnavailableError extends Error {
  constructor(verb, saw) {
    const shape = saw === void 0 ? "undefined" : saw === null ? "null" : `${typeof saw} (ctor: ${saw?.constructor?.name ?? "?"}, keys: ${Object.keys(saw).length})`;
    super(
      `[${verb}] §SEL-STORE-IDENTITY — no SelectionStore reachable. The handler was given neither an injected store (see the 'selection' descriptor in apps/editor/src/PluginRegistry.ts) nor a store-shaped ctx.stores.selection; it saw ${shape}. In production the bus hands handlers a Record<id,dto> view (bootstrap.ts storesAsRecordView), so the store MUST be injected at registration.`
    );
    this.name = "SelectionStoreUnavailableError";
  }
}
function isSelectionStore(v) {
  if (v === null || typeof v !== "object") return false;
  const o = v;
  return typeof o["select"] === "function" && typeof o["deselect"] === "function" && typeof o["clear"] === "function" && typeof o["getState"] === "function";
}
function resolveSelectionStore(injected, stores, verb) {
  if (injected !== null) return injected;
  const candidate = stores["selection"];
  if (isSelectionStore(candidate)) return candidate;
  throw new SelectionStoreUnavailableError(verb, candidate);
}

class SelectSelectionHandler {
  /** §SEL-STORE-IDENTITY — the canonical SelectionStore, ADOPTED from the
   *  composition root (never constructed here). `null` falls back to
   *  `ctx.stores.selection` for buses that really do hand store instances. */
  constructor(store = null) {
    this.store = store;
  }
  store;
  type = "selection.select";
  affectedStores = ["selection"];
  canExecute(_ctx, cmd) {
    if (!Array.isArray(cmd.targets)) {
      return { valid: false, reason: "targets must be an array" };
    }
    for (let i = 0; i < cmd.targets.length; i++) {
      const t = cmd.targets[i];
      if (typeof t.id !== "string" || t.id.length === 0) {
        return { valid: false, reason: `targets[${i}].id must be a non-empty string` };
      }
      if (typeof t.kind !== "string" || t.kind.length === 0) {
        return { valid: false, reason: `targets[${i}].kind must be a non-empty string` };
      }
    }
    if (cmd.mode !== void 0 && cmd.mode !== "replace" && cmd.mode !== "add" && cmd.mode !== "toggle") {
      return { valid: false, reason: `unknown mode "${String(cmd.mode)}"` };
    }
    return { valid: true };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      resolveSelectionStore(this.store, ctx.stores, this.type).select(cmd.targets, cmd.mode ?? "replace");
      return { forward: [], inverse: [] };
    });
  }
}

class DeselectSelectionHandler {
  /** §SEL-STORE-IDENTITY — canonical store ADOPTED from the composition root. */
  constructor(store = null) {
    this.store = store;
  }
  store;
  type = "selection.deselect";
  affectedStores = ["selection"];
  canExecute(_ctx, cmd) {
    if (!Array.isArray(cmd.ids)) {
      return { valid: false, reason: "ids must be an array" };
    }
    for (let i = 0; i < cmd.ids.length; i++) {
      if (typeof cmd.ids[i] !== "string" || cmd.ids[i].length === 0) {
        return { valid: false, reason: `ids[${i}] must be a non-empty string` };
      }
    }
    return { valid: true };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      resolveSelectionStore(this.store, ctx.stores, this.type).deselect(cmd.ids);
      return { forward: [], inverse: [] };
    });
  }
}

class ClearSelectionHandler {
  /** §SEL-STORE-IDENTITY — canonical store ADOPTED from the composition root. */
  constructor(store = null) {
    this.store = store;
  }
  store;
  type = "selection.clear";
  affectedStores = ["selection"];
  canExecute(_ctx, _cmd) {
    return { valid: true };
  }
  execute(ctx, _cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      resolveSelectionStore(this.store, ctx.stores, this.type).clear();
      return { forward: [], inverse: [] };
    });
  }
}

class SelectionClipboard {
  _entries = [];
  /** Replace the clipboard contents with `entries`. */
  set(entries) {
    this._entries = [...entries];
  }
  /** Current clipboard contents (never mutated by callers). */
  get() {
    return this._entries;
  }
  /** Number of copied elements currently held. */
  get size() {
    return this._entries.length;
  }
  /** Empty the clipboard. */
  clear() {
    this._entries = [];
  }
}
const selectionClipboard = new SelectionClipboard();
const DEFAULT_PASTE_OFFSET = { x: 0.5, y: 0, z: 0.5 };

class CopySelectionHandler {
  constructor(clipboard = selectionClipboard, port = null, store = null) {
    this.clipboard = clipboard;
    this.port = port;
    this.store = store;
  }
  clipboard;
  port;
  store;
  type = "copy-selection";
  affectedStores = ["selection"];
  /** Copyable selection entries — filtered by the port's `canCopy` when set. */
  _copyableEntries(ctx) {
    const out = [];
    const selection = resolveSelectionStore(this.store, ctx.stores, this.type);
    for (const dto of selection.getState().values()) {
      if (this.port !== null && !this.port.canCopy(dto.kind)) continue;
      out.push({ sourceId: dto.id, kind: dto.kind });
    }
    return out;
  }
  canExecute(ctx, _cmd) {
    if (resolveSelectionStore(this.store, ctx.stores, this.type).getState().size === 0) {
      return { valid: false, reason: "Nothing selected to copy" };
    }
    if (this._copyableEntries(ctx).length === 0) {
      return { valid: false, reason: "Selected element(s) cannot be copied" };
    }
    return { valid: true };
  }
  execute(ctx, _cmd) {
    return withHandlerSpan(
      this.type + ".handler",
      { "pryzm.command.type": this.type },
      (span) => {
        const entries = this._copyableEntries(ctx);
        this.clipboard.set(entries);
        span.setAttribute("pryzm.copy.count", entries.length);
        console.log(`[copy-selection.handler] Copied ${entries.length} element(s) to clipboard.`);
        return { forward: [], inverse: [] };
      }
    );
  }
}

function freshId() {
  return globalThis.crypto?.randomUUID?.() ?? `paste-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
class PasteClipboardHandler {
  constructor(clipboard = selectionClipboard, port = null, offset = DEFAULT_PASTE_OFFSET) {
    this.clipboard = clipboard;
    this.port = port;
    this.offset = offset;
  }
  clipboard;
  port;
  offset;
  type = "paste-clipboard";
  affectedStores = [];
  canExecute(_ctx, _cmd) {
    if (this.port === null) {
      return { valid: false, reason: "Paste is not available (no paste port wired)" };
    }
    if (this.clipboard.size === 0) {
      return { valid: false, reason: "Clipboard is empty — copy an element first" };
    }
    return { valid: true };
  }
  execute(_ctx, _cmd) {
    return withHandlerSpan(
      this.type + ".handler",
      { "pryzm.command.type": this.type },
      (span) => {
        const port = this.port;
        const newIds = [];
        if (port !== null) {
          for (const entry of this.clipboard.get()) {
            const newId = freshId();
            const res = port.paste(entry, { newId, offset: this.offset });
            if (res) newIds.push(res.newId);
          }
        }
        span.setAttribute("pryzm.paste.count", newIds.length);
        console.log(`[paste-clipboard.handler] Pasted ${newIds.length} element(s):`, newIds);
        return { forward: [], inverse: [] };
      }
    );
  }
}

function buildSelectionHandlerSet(opts = {}) {
  const clipboard = opts.clipboard ?? selectionClipboard;
  const port = opts.pastePort ?? null;
  const store = opts.store ?? null;
  return [
    new SelectSelectionHandler(store),
    new DeselectSelectionHandler(store),
    new ClearSelectionHandler(store),
    new CopySelectionHandler(clipboard, port, store),
    new PasteClipboardHandler(clipboard, port)
  ];
}

function makeMeta(createdBy = "system") {
  const now = Date.now();
  return { createdAt: now, modifiedAt: now, createdBy, version: 1 };
}
function makeBuiltIn(id, name, category, style, description, tags) {
  return Object.freeze({
    id,
    name,
    description,
    category,
    isBuiltIn: true,
    style: Object.freeze({ ...DEFAULT_ANNOTATION_STYLE, ...style }),
    tags: Object.freeze([...tags]),
    metadata: Object.freeze(makeMeta())
  });
}
const BUILT_IN_ANNOTATION_TYPES = Object.freeze([
  makeBuiltIn(
    "at-title-5mm-purple",
    "Title — 5.0 mm PRYZM Purple",
    "text",
    { textSizeMm: 5, textColor: "#6600ff", lineColor: "#6600ff", lineWeight: 0.5, arrowSizeMm: 3 },
    "Drawing titles and headline callouts. PRYZM brand purple (#6600FF).",
    ["title", "heading", "purple"]
  ),
  makeBuiltIn(
    "at-note-3.5mm-charcoal",
    "Note — 3.5 mm Charcoal",
    "text",
    { textSizeMm: 3.5, textColor: "#1a2035", lineColor: "#1a2035", lineWeight: 0.35 },
    "Standard drawing note. The default type for text notes and keynotes.",
    ["note", "text", "default"]
  ),
  makeBuiltIn(
    "at-dim-2.5mm-slate",
    "Dimension — 2.5 mm Slate",
    "dimension",
    { textSizeMm: 2.5, textColor: "#374151", lineColor: "#4b5563", lineWeight: 0.18, arrowStyle: "filled", arrowSizeMm: 2 },
    "ISO 128 dimension text at 2.5 mm on a 0.18 mm pen. The default for every dimension family.",
    ["dimension", "iso", "default"]
  ),
  makeBuiltIn(
    "at-tag-2.0mm-teal",
    "Tag — 2.0 mm Teal",
    "tag",
    { textSizeMm: 2, textColor: "#0f766e", lineColor: "#0f766e", lineWeight: 0.25, arrowStyle: "dot", arrowSizeMm: 1.5 },
    "Element tags (door, window, wall, room, level) with a leader dot.",
    ["tag", "leader", "teal"]
  ),
  makeBuiltIn(
    "at-revision-4.0mm-crimson",
    "Revision — 4.0 mm Crimson",
    "symbol",
    { textSizeMm: 4, textColor: "#b91c1c", lineColor: "#b91c1c", lineWeight: 0.5, arrowStyle: "open", arrowSizeMm: 2.5 },
    "Revision clouds, matchlines and anything the reader must not miss.",
    ["revision", "cloud", "alert", "crimson"]
  )
]);
class AnnotationSystemTypeStore {
  _types = /* @__PURE__ */ new Map();
  constructor() {
    for (const t of BUILT_IN_ANNOTATION_TYPES) this._types.set(t.id, t);
  }
  getAll() {
    return Array.from(this._types.values());
  }
  getById(id) {
    return this._types.get(id);
  }
  has(id) {
    return this._types.has(id);
  }
  isBuiltIn(id) {
    return this._types.get(id)?.isBuiltIn === true;
  }
  /**
   * The default type id for an annotation FAMILY. Never throws — an unknown family
   * falls back to the note type so a new family added tomorrow still gets a type
   * rather than silently getting none.
   */
  defaultTypeIdFor(family) {
    return defaultAnnotationTypeIdFor(family);
  }
  /**
   * Resolve the style an annotation should render with:
   *   type style (or the family default type's style)  ←  overridden by  →  element style.
   * This is THE reader of `systemTypeId`. Nothing else may switch on it.
   */
  resolveStyle(family, systemTypeId, elementStyle) {
    const t = (systemTypeId ? this._types.get(systemTypeId) : void 0) ?? this._types.get(this.defaultTypeIdFor(family));
    return { ...DEFAULT_ANNOTATION_STYLE, ...t?.style ?? {}, ...elementStyle ?? {} };
  }
  add(type) {
    if (this._types.has(type.id)) {
      throw new Error(`[AnnotationSystemTypeStore] Type id "${type.id}" already exists.`);
    }
    const clone = structuredClone(type);
    this._types.set(clone.id, clone);
    storeEventBus.emit({ elementId: clone.id, elementType: "annotationSystemType", operation: "create", timestamp: Date.now() });
  }
  update(id, patch) {
    const existing = this._types.get(id);
    if (!existing) throw new Error(`[AnnotationSystemTypeStore] Type "${id}" not found.`);
    if (existing.isBuiltIn) throw new Error(`[AnnotationSystemTypeStore] Built-in type "${id}" is immutable.`);
    this._types.set(id, structuredClone({ ...existing, ...patch, id }));
    storeEventBus.emit({ elementId: id, elementType: "annotationSystemType", operation: "update", timestamp: Date.now() });
  }
  remove(id) {
    const existing = this._types.get(id);
    if (!existing) return;
    if (existing.isBuiltIn) throw new Error(`[AnnotationSystemTypeStore] Built-in type "${id}" cannot be deleted.`);
    this._types.delete(id);
    storeEventBus.emit({ elementId: id, elementType: "annotationSystemType", operation: "delete", timestamp: Date.now() });
  }
  duplicate(id, newId, newName) {
    const source = this._types.get(id);
    if (!source) throw new Error(`[AnnotationSystemTypeStore] Type "${id}" not found.`);
    const clone = structuredClone(source);
    clone.id = newId ?? `at-custom-${Date.now()}`;
    clone.name = newName ?? `${source.name} (Copy)`;
    clone.isBuiltIn = false;
    clone.metadata = { ...clone.metadata, createdBy: "user", createdAt: Date.now(), modifiedAt: Date.now() };
    this._types.set(clone.id, clone);
    storeEventBus.emit({ elementId: clone.id, elementType: "annotationSystemType", operation: "create", timestamp: Date.now() });
    return clone;
  }
  /** C45 project switch — wipe USER types only; built-ins are code and survive. */
  clearCustomTypes() {
    for (const [id, t] of [...this._types.entries()]) {
      if (!t.isBuiltIn) {
        this._types.delete(id);
        storeEventBus.emit({ elementId: id, elementType: "annotationSystemType", operation: "delete", timestamp: Date.now() });
      }
    }
  }
  /**
   * §ANN-TYPE-PERSIST — CUSTOM types only (built-ins are code).
   * The `stairTypeStore` hole (custom types silently lost on save/load) is closed HERE,
   * before ship, not after.
   */
  serialize() {
    return {
      version: 1,
      types: this.getAll().filter((t) => !t.isBuiltIn).map((t) => structuredClone(t))
    };
  }
  deserialize(data) {
    if (!data || typeof data !== "object") return;
    const snap = data;
    if (snap.version !== 1 || !Array.isArray(snap.types)) return;
    for (const t of snap.types) {
      if (!t?.id || this._types.has(t.id)) continue;
      this._types.set(t.id, structuredClone({ ...t, isBuiltIn: false }));
    }
  }
}
const annotationSystemTypeStore = new AnnotationSystemTypeStore();
projectScopeRegistry.register({
  scopeName: "annotationSystemTypeStore",
  clear: () => annotationSystemTypeStore.clearCustomTypes()
});

class AnnotationSystemError extends Error {
  constructor(message) {
    super(message);
    this.name = "AnnotationSystemError";
  }
}
class AnnotationNotFoundError extends AnnotationSystemError {
  constructor(annotationId) {
    super(`Annotation not found: ${annotationId}`);
    this.annotationId = annotationId;
    this.name = "AnnotationNotFoundError";
  }
  annotationId;
}
class AnnotationSchemaError extends AnnotationSystemError {
  constructor(cause) {
    super(`Annotation schema validation failed: ${String(cause?.message ?? cause)}`);
    this.cause = cause;
    this.name = "AnnotationSchemaError";
  }
  cause;
}

function isFiniteVec3$5(p) {
  return !!p && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z);
}
const ANNOTATION_KINDS = [
  "text-note",
  "tag",
  "callout",
  "revision-cloud",
  "keynote",
  "elevation-mark",
  "section-mark",
  "level-tag",
  "grid-bubble",
  "north-arrow",
  "scale-bar"
];
function isAnnotationKind(s) {
  return typeof s === "string" && ANNOTATION_KINDS.includes(s);
}
const ANNOTATION_TEXT_HEIGHT_MAX_MM = 100;

const OK = Object.freeze({ ok: true });
const fail = (reason) => ({ ok: false, reason });
function isFullElementPayload(p) {
  if (!p || typeof p !== "object") return false;
  const o = p;
  return typeof o.id === "string" && typeof o.type === "string" && typeof o.ownerViewId === "string" && typeof o.geometry2D === "object" && o.geometry2D !== null && Array.isArray(o.references);
}
function liftFlatToElement(p) {
  return withHandlerSpan("annotation.sink.lift", { "pryzm.annotation.id": p.id }, () => {
    const anchor = p.anchor ?? { x: 0, y: 0, z: 0 };
    const el = makeAnnotationElement(
      p.id,
      p.kind ?? "text-note",
      p.viewId ?? "",
      [],
      { modelPoints: [anchor], offset: 0 },
      {
        ...p.text !== void 0 ? { text: p.text } : {},
        ...p.hostElementId !== void 0 ? { targetElementId: p.hostElementId } : {},
        ...p.rotation !== void 0 ? { rotation: p.rotation } : {}
      },
      {
        ...p.textHeightMm !== void 0 ? { textSizeMm: p.textHeightMm } : {},
        ...p.color !== void 0 ? { textColor: p.color, lineColor: p.color } : {}
      }
    );
    return p.systemTypeId !== void 0 ? { ...el, systemTypeId: p.systemTypeId } : el;
  });
}
function sinkCreate(payload) {
  return withHandlerSpan("annotation.sink.create", {}, () => {
    const el = isFullElementPayload(payload) ? payload : payload && typeof payload.id === "string" ? liftFlatToElement(payload) : null;
    if (!el) return fail("payload carries no annotation id — nothing to store");
    if (annotationStore.has(el.id)) return { ok: true, reason: `already present — ${el.id}` };
    annotationStore.add(el);
    if (!annotationStore.has(el.id)) {
      return fail(`canonical store rejected ${el.id} (${el.type})`);
    }
    return OK;
  });
}
function sinkUpdate(id, patch) {
  return withHandlerSpan("annotation.sink.update", { "pryzm.annotation.id": id }, () => {
    if (!annotationStore.has(id)) return fail(`annotation ${id} is not in the canonical store`);
    annotationStore.update({ ...patch, id });
    return OK;
  });
}
function sinkDelete(id) {
  return withHandlerSpan("annotation.sink.delete", { "pryzm.annotation.id": id }, () => {
    if (!annotationStore.has(id)) return fail(`annotation ${id} is not in the canonical store`);
    annotationStore.remove(id);
    return annotationStore.has(id) ? fail(`canonical store refused to remove ${id}`) : OK;
  });
}
function sinkStyle(id, style) {
  return withHandlerSpan("annotation.sink.style", { "pryzm.annotation.id": id }, () => {
    const existing = annotationStore.getById(id);
    if (!existing) return fail(`annotation ${id} is not in the canonical store`);
    annotationStore.update({ id, style: { ...existing.style, ...style } });
    return OK;
  });
}
function sinkParameters(id, parameters) {
  return withHandlerSpan("annotation.sink.params", { "pryzm.annotation.id": id }, () => {
    const existing = annotationStore.getById(id);
    if (!existing) return fail(`annotation ${id} is not in the canonical store`);
    annotationStore.update({ id, parameters: { ...existing.parameters, ...parameters } });
    return OK;
  });
}
function mirrorRecordFor(id) {
  return withHandlerSpan("annotation.sink.mirror", { "pryzm.annotation.id": id }, () => {
    const el = annotationStore.getById(id);
    if (!el) return null;
    const anchor = el.geometry2D?.modelPoints?.[0] ?? { x: 0, y: 0, z: 0 };
    return {
      id: el.id,
      viewId: el.ownerViewId,
      kind: el.type,
      systemTypeId: el.systemTypeId,
      anchor: { x: anchor.x, y: anchor.y, z: anchor.z },
      hostElementId: el.parameters?.targetElementId,
      text: String(el.parameters?.text ?? ""),
      rotation: Number(el.parameters?.rotation ?? 0),
      textHeightMm: el.style?.textSizeMm ?? 2.5,
      color: el.style?.textColor
    };
  });
}

class CreateAnnotationHandler {
  type = "annotation.create";
  affectedStores = ["annotation"];
  canExecute(_ctx, cmd) {
    if (cmd.kind !== void 0 && !isAnnotationKind(cmd.kind)) {
      return { valid: false, reason: `kind must be one of the AnnotationKind enum, got: ${String(cmd.kind)}` };
    }
    if (cmd.anchor !== void 0 && !isFiniteVec3$5(cmd.anchor)) {
      return { valid: false, reason: "anchor must be a finite Vec3 ({x,y,z} all finite)" };
    }
    if (cmd.rotation !== void 0 && !Number.isFinite(cmd.rotation)) {
      return { valid: false, reason: "rotation must be finite" };
    }
    if (cmd.textHeightMm !== void 0) {
      if (!Number.isFinite(cmd.textHeightMm) || cmd.textHeightMm <= 0) {
        return { valid: false, reason: "textHeightMm must be a positive finite number" };
      }
      if (cmd.textHeightMm > ANNOTATION_TEXT_HEIGHT_MAX_MM) {
        return { valid: false, reason: `textHeightMm must be ≤ ${ANNOTATION_TEXT_HEIGHT_MAX_MM} mm at sheet scale` };
      }
    }
    return { valid: true };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      if (isFullElementPayload(cmd)) {
        const projected2 = sinkCreate(cmd);
        if (!projected2.ok) throw new AnnotationSchemaError(new Error(projected2.reason));
        const flat = mirrorRecordFor(cmd.id);
        const [next2, forward2, inverse2] = produceCommand(ctx.stores.annotation, (draft) => {
          if (flat) draft[flat.id] = flat;
        });
        return { forward: forward2, inverse: inverse2, nextStates: { annotation: next2 } };
      }
      const id = cmd.id ?? createId("annotation");
      const seed = {
        id,
        viewId: cmd.viewId ?? "",
        kind: cmd.kind ?? "text-note",
        anchor: cmd.anchor ?? { x: 0, y: 0, z: 0 },
        hostElementId: cmd.hostElementId,
        text: cmd.text ?? "",
        rotation: cmd.rotation ?? 0,
        textHeightMm: cmd.textHeightMm ?? 2.5,
        color: cmd.color
      };
      let a;
      try {
        a = Annotation.parse(seed);
      } catch (err) {
        throw new AnnotationSchemaError(err);
      }
      const projected = sinkCreate({ ...cmd, id: a.id });
      if (!projected.ok) throw new AnnotationSchemaError(new Error(projected.reason));
      const [next, forward, inverse] = produceCommand(ctx.stores.annotation, (draft) => {
        draft[a.id] = a;
      });
      return { forward, inverse, nextStates: { annotation: next } };
    });
  }
}

class DeleteAnnotationHandler {
  type = "annotation.delete";
  affectedStores = ["annotation"];
  canExecute(ctx, cmd) {
    if (typeof cmd.annotationId !== "string" || cmd.annotationId.length === 0) {
      return { valid: false, reason: "annotationId must be a non-empty string" };
    }
    if (!ctx.stores.annotation[cmd.annotationId] && !annotationStore.has(cmd.annotationId)) {
      return { valid: false, reason: `annotation not found: ${cmd.annotationId}` };
    }
    return { valid: true };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      const _mirror = ctx.stores.annotation[cmd.annotationId] ?? mirrorRecordFor(cmd.annotationId);
      if (!_mirror) throw new AnnotationNotFoundError(cmd.annotationId);
      const [next, forward, inverse] = produceCommand(ctx.stores.annotation, (draft) => {
        if (!draft[cmd.annotationId]) draft[cmd.annotationId] = _mirror;
        delete draft[cmd.annotationId];
      });
      const _p = sinkDelete(cmd.annotationId);
      if (!_p.ok) throw new AnnotationNotFoundError(`${cmd.annotationId} — ${_p.reason}`);
      return { forward, inverse, nextStates: { annotation: next } };
    });
  }
}

class UpdateAnnotationHandler {
  type = "annotation.update";
  affectedStores = ["annotation"];
  canExecute(_ctx, cmd) {
    if (typeof cmd.annotationId !== "string" || cmd.annotationId.length === 0) {
      return { valid: false, reason: "annotationId is required" };
    }
    const noOp = cmd.systemTypeId === void 0 && cmd.style === void 0 && cmd.parameters === void 0 && cmd.semantics === void 0 && cmd.isDriving === void 0;
    if (noOp) {
      return { valid: false, reason: "annotation.update carries no field to change" };
    }
    const h = cmd.style?.textSizeMm;
    if (h !== void 0 && (!Number.isFinite(h) || h <= 0 || h > ANNOTATION_TEXT_HEIGHT_MAX_MM)) {
      return { valid: false, reason: `style.textSizeMm must be > 0 and ≤ ${ANNOTATION_TEXT_HEIGHT_MAX_MM} mm at sheet scale` };
    }
    return { valid: true };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      const mirror = ctx.stores.annotation[cmd.annotationId] ?? mirrorRecordFor(cmd.annotationId);
      if (!mirror) throw new AnnotationNotFoundError(cmd.annotationId);
      const refuse = (r) => {
        throw new AnnotationNotFoundError(`${cmd.annotationId} — ${r ?? "canonical projection failed"}`);
      };
      if (cmd.systemTypeId !== void 0 || cmd.semantics !== void 0 || cmd.isDriving !== void 0) {
        const p = sinkUpdate(cmd.annotationId, {
          ...cmd.systemTypeId !== void 0 ? { systemTypeId: cmd.systemTypeId } : {},
          ...cmd.semantics !== void 0 ? { semantics: cmd.semantics } : {},
          ...cmd.isDriving !== void 0 ? { isDriving: cmd.isDriving } : {}
        });
        if (!p.ok) refuse(p.reason);
      }
      if (cmd.style !== void 0) {
        const p = sinkStyle(cmd.annotationId, cmd.style);
        if (!p.ok) refuse(p.reason);
      }
      if (cmd.parameters !== void 0) {
        const p = sinkParameters(cmd.annotationId, cmd.parameters);
        if (!p.ok) refuse(p.reason);
      }
      const [next, forward, inverse] = produceCommand(ctx.stores.annotation, (draft) => {
        if (!draft[cmd.annotationId]) draft[cmd.annotationId] = mirror;
        const refreshed = mirrorRecordFor(cmd.annotationId);
        if (refreshed) draft[cmd.annotationId] = refreshed;
      });
      return { forward, inverse, nextStates: { annotation: next } };
    });
  }
}

class MoveAnnotationHandler {
  type = "annotation.move";
  affectedStores = ["annotation"];
  canExecute(ctx, cmd) {
    if (typeof cmd.annotationId !== "string" || cmd.annotationId.length === 0) {
      return { valid: false, reason: "annotationId must be a non-empty string" };
    }
    if (!cmd.delta || !Number.isFinite(cmd.delta.x) || !Number.isFinite(cmd.delta.y) || !Number.isFinite(cmd.delta.z)) {
      return { valid: false, reason: "delta must have finite x, y, z" };
    }
    if (!ctx.stores.annotation[cmd.annotationId] && !annotationStore.has(cmd.annotationId)) {
      return { valid: false, reason: `annotation not found: ${cmd.annotationId}` };
    }
    return { valid: true };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      const _mirror = ctx.stores.annotation[cmd.annotationId] ?? mirrorRecordFor(cmd.annotationId);
      if (!_mirror) throw new AnnotationNotFoundError(cmd.annotationId);
      const [next, forward, inverse] = produceCommand(ctx.stores.annotation, (draft) => {
        if (!draft[cmd.annotationId]) draft[cmd.annotationId] = _mirror;
        const a = draft[cmd.annotationId];
        if (!a) return;
        a.anchor.x += cmd.delta.x;
        a.anchor.y += cmd.delta.y;
        a.anchor.z += cmd.delta.z;
      });
      const _el = annotationStore.getById(cmd.annotationId);
      if (_el) {
        const _p = sinkUpdate(cmd.annotationId, {
          geometry2D: {
            ..._el.geometry2D,
            modelPoints: (_el.geometry2D?.modelPoints ?? []).map((pt) => ({
              x: pt.x + cmd.delta.x,
              y: pt.y + cmd.delta.y,
              z: pt.z + cmd.delta.z
            }))
          }
        });
        if (!_p.ok) throw new AnnotationNotFoundError(`${cmd.annotationId} — ${_p.reason}`);
      }
      return { forward, inverse, nextStates: { annotation: next } };
    });
  }
}

class SetAnnotationTextHandler {
  type = "annotation.setText";
  affectedStores = ["annotation"];
  canExecute(ctx, cmd) {
    if (typeof cmd.annotationId !== "string" || cmd.annotationId.length === 0) {
      return { valid: false, reason: "annotationId must be a non-empty string" };
    }
    if (typeof cmd.text !== "string") {
      return { valid: false, reason: "text must be a string" };
    }
    if (!ctx.stores.annotation[cmd.annotationId] && !annotationStore.has(cmd.annotationId)) {
      return { valid: false, reason: `annotation not found: ${cmd.annotationId}` };
    }
    return { valid: true };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      const _mirror = ctx.stores.annotation[cmd.annotationId] ?? mirrorRecordFor(cmd.annotationId);
      if (!_mirror) throw new AnnotationNotFoundError(cmd.annotationId);
      const [next, forward, inverse] = produceCommand(ctx.stores.annotation, (draft) => {
        if (!draft[cmd.annotationId]) draft[cmd.annotationId] = _mirror;
        const a = draft[cmd.annotationId];
        if (!a) return;
        a.text = cmd.text;
      });
      const _p = sinkParameters(cmd.annotationId, { text: cmd.text });
      if (!_p.ok) throw new AnnotationNotFoundError(`${cmd.annotationId} — ${_p.reason}`);
      return { forward, inverse, nextStates: { annotation: next } };
    });
  }
}

class SetAnnotationKindHandler {
  type = "annotation.setKind";
  affectedStores = ["annotation"];
  canExecute(ctx, cmd) {
    if (typeof cmd.annotationId !== "string" || cmd.annotationId.length === 0) {
      return { valid: false, reason: "annotationId must be a non-empty string" };
    }
    if (!isAnnotationKind(cmd.kind)) {
      return { valid: false, reason: `kind must be one of the AnnotationKind enum, got: ${String(cmd.kind)}` };
    }
    if (!ctx.stores.annotation[cmd.annotationId] && !annotationStore.has(cmd.annotationId)) {
      return { valid: false, reason: `annotation not found: ${cmd.annotationId}` };
    }
    return { valid: true };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      const _mirror = ctx.stores.annotation[cmd.annotationId] ?? mirrorRecordFor(cmd.annotationId);
      if (!_mirror) throw new AnnotationNotFoundError(cmd.annotationId);
      const [next, forward, inverse] = produceCommand(ctx.stores.annotation, (draft) => {
        if (!draft[cmd.annotationId]) draft[cmd.annotationId] = _mirror;
        const a = draft[cmd.annotationId];
        if (!a) return;
        a.kind = cmd.kind;
      });
      const _p = sinkUpdate(cmd.annotationId, { type: cmd.kind });
      if (!_p.ok) throw new AnnotationNotFoundError(`${cmd.annotationId} — ${_p.reason}`);
      return { forward, inverse, nextStates: { annotation: next } };
    });
  }
}

class SetAnnotationRotationHandler {
  type = "annotation.setRotation";
  affectedStores = ["annotation"];
  canExecute(ctx, cmd) {
    if (typeof cmd.annotationId !== "string" || cmd.annotationId.length === 0) {
      return { valid: false, reason: "annotationId must be a non-empty string" };
    }
    if (!Number.isFinite(cmd.rotation)) {
      return { valid: false, reason: "rotation must be finite" };
    }
    if (!ctx.stores.annotation[cmd.annotationId] && !annotationStore.has(cmd.annotationId)) {
      return { valid: false, reason: `annotation not found: ${cmd.annotationId}` };
    }
    return { valid: true };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      const _mirror = ctx.stores.annotation[cmd.annotationId] ?? mirrorRecordFor(cmd.annotationId);
      if (!_mirror) throw new AnnotationNotFoundError(cmd.annotationId);
      const [next, forward, inverse] = produceCommand(ctx.stores.annotation, (draft) => {
        if (!draft[cmd.annotationId]) draft[cmd.annotationId] = _mirror;
        const a = draft[cmd.annotationId];
        if (!a) return;
        a.rotation = cmd.rotation;
      });
      const _p = sinkParameters(cmd.annotationId, { rotation: cmd.rotation });
      if (!_p.ok) throw new AnnotationNotFoundError(`${cmd.annotationId} — ${_p.reason}`);
      return { forward, inverse, nextStates: { annotation: next } };
    });
  }
}

class SetAnnotationTextHeightHandler {
  type = "annotation.setTextHeight";
  affectedStores = ["annotation"];
  canExecute(ctx, cmd) {
    if (typeof cmd.annotationId !== "string" || cmd.annotationId.length === 0) {
      return { valid: false, reason: "annotationId must be a non-empty string" };
    }
    if (!Number.isFinite(cmd.textHeightMm) || cmd.textHeightMm <= 0) {
      return { valid: false, reason: "textHeightMm must be a positive finite number" };
    }
    if (cmd.textHeightMm > ANNOTATION_TEXT_HEIGHT_MAX_MM) {
      return { valid: false, reason: `textHeightMm must be ≤ ${ANNOTATION_TEXT_HEIGHT_MAX_MM} mm at sheet scale` };
    }
    if (!ctx.stores.annotation[cmd.annotationId] && !annotationStore.has(cmd.annotationId)) {
      return { valid: false, reason: `annotation not found: ${cmd.annotationId}` };
    }
    return { valid: true };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      const _mirror = ctx.stores.annotation[cmd.annotationId] ?? mirrorRecordFor(cmd.annotationId);
      if (!_mirror) throw new AnnotationNotFoundError(cmd.annotationId);
      const [next, forward, inverse] = produceCommand(ctx.stores.annotation, (draft) => {
        if (!draft[cmd.annotationId]) draft[cmd.annotationId] = _mirror;
        const a = draft[cmd.annotationId];
        if (!a) return;
        a.textHeightMm = cmd.textHeightMm;
      });
      const _p = sinkStyle(cmd.annotationId, { textSizeMm: cmd.textHeightMm });
      if (!_p.ok) throw new AnnotationNotFoundError(`${cmd.annotationId} — ${_p.reason}`);
      return { forward, inverse, nextStates: { annotation: next } };
    });
  }
}

class SetAnnotationColorHandler {
  type = "annotation.setColor";
  affectedStores = ["annotation"];
  canExecute(ctx, cmd) {
    if (typeof cmd.annotationId !== "string" || cmd.annotationId.length === 0) {
      return { valid: false, reason: "annotationId must be a non-empty string" };
    }
    if (cmd.color !== null && typeof cmd.color !== "string") {
      return { valid: false, reason: "color must be a string or null" };
    }
    if (!ctx.stores.annotation[cmd.annotationId] && !annotationStore.has(cmd.annotationId)) {
      return { valid: false, reason: `annotation not found: ${cmd.annotationId}` };
    }
    return { valid: true };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      const _mirror = ctx.stores.annotation[cmd.annotationId] ?? mirrorRecordFor(cmd.annotationId);
      if (!_mirror) throw new AnnotationNotFoundError(cmd.annotationId);
      const [next, forward, inverse] = produceCommand(ctx.stores.annotation, (draft) => {
        if (!draft[cmd.annotationId]) draft[cmd.annotationId] = _mirror;
        const a = draft[cmd.annotationId];
        if (!a) return;
        if (cmd.color === null) a.color = void 0;
        else a.color = cmd.color;
      });
      const _p = sinkStyle(cmd.annotationId, { textColor: cmd.color ?? void 0, lineColor: cmd.color ?? void 0 });
      if (!_p.ok) throw new AnnotationNotFoundError(`${cmd.annotationId} — ${_p.reason}`);
      return { forward, inverse, nextStates: { annotation: next } };
    });
  }
}

function buildAnnotationHandlerSet() {
  return [
    new CreateAnnotationHandler(),
    new DeleteAnnotationHandler(),
    new UpdateAnnotationHandler(),
    new MoveAnnotationHandler(),
    new SetAnnotationTextHandler(),
    new SetAnnotationKindHandler(),
    new SetAnnotationRotationHandler(),
    new SetAnnotationTextHeightHandler(),
    new SetAnnotationColorHandler()
  ];
}

class ViewLinkResolver {
  _listeners = /* @__PURE__ */ new Set();
  _unsubscribe = null;
  constructor() {
    this._unsubscribe = storeEventBus.subscribe((event) => {
      if (event.elementType === "sheet-definition") {
        this._notify();
      }
    });
  }
  resolve(viewDefId) {
    const sheetStore = typeof window !== "undefined" ? window.sheetStore : null;
    if (!sheetStore) return null;
    const sheets = sheetStore.getAll();
    for (const sheet of sheets) {
      const idx = sheet.viewports.findIndex((vp) => vp.viewId === viewDefId);
      if (idx !== -1) {
        return {
          sheetNumber: sheet.sheetNumber,
          detailNumber: String(idx + 1),
          sheetName: sheet.name
        };
      }
    }
    return null;
  }
  subscribe(callback) {
    this._listeners.add(callback);
    return () => this._listeners.delete(callback);
  }
  dispose() {
    this._unsubscribe?.();
    this._unsubscribe = null;
    this._listeners.clear();
  }
  _notify() {
    for (const cb of this._listeners) {
      try {
        cb();
      } catch {
      }
    }
  }
}
new ViewLinkResolver();

class FurnitureStore extends Store {
  constructor() {
    super("furniture");
  }
  ids() {
    return [...this.state.keys()];
  }
  byLevel(levelId) {
    const out = [];
    for (const f of this.state.values()) if (f.levelId === levelId) out.push(f);
    return out;
  }
  byCatalogId(catalogId) {
    const out = [];
    for (const f of this.state.values()) if (f.catalogId === catalogId) out.push(f);
    return out;
  }
  get(id) {
    return this.state.get(id);
  }
}

class FurnitureSystemError extends Error {
  constructor(message) {
    super(message);
    this.name = "FurnitureSystemError";
  }
}
class FurnitureNotFoundError extends FurnitureSystemError {
  constructor(furnitureId) {
    super(`Furniture not found: ${furnitureId}`);
    this.furnitureId = furnitureId;
    this.name = "FurnitureNotFoundError";
  }
  furnitureId;
}
class FurnitureSchemaError extends FurnitureSystemError {
  constructor(cause) {
    super(`Furniture schema validation failed: ${String(cause?.message ?? cause)}`);
    this.cause = cause;
    this.name = "FurnitureSchemaError";
  }
  cause;
}
class FurnitureLodError extends FurnitureSystemError {
  constructor(lod) {
    super(`Furniture LOD must be one of {0,1,2,3,4} (received ${String(lod)})`);
    this.lod = lod;
    this.name = "FurnitureLodError";
  }
  lod;
}

function isFiniteVec3$4(p) {
  return !!p && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z);
}
function isValidLod(v) {
  return typeof v === "number" && (v === 0 || v === 1 || v === 2 || v === 3 || v === 4);
}
function isValidScale(s) {
  return typeof s === "number" && Number.isFinite(s) && s > 0;
}

class CreateFurnitureHandler {
  type = "furniture.create";
  affectedStores = ["furniture"];
  canExecute(_ctx, cmd) {
    if (cmd.origin !== void 0 && !isFiniteVec3$4(cmd.origin)) {
      return { valid: false, reason: "origin must have finite x, y, z" };
    }
    if (cmd.rotation !== void 0 && !Number.isFinite(cmd.rotation)) {
      return { valid: false, reason: "rotation must be finite" };
    }
    if (cmd.scale !== void 0 && !isValidScale(cmd.scale)) {
      return { valid: false, reason: "scale must be > 0 and finite" };
    }
    if (cmd.activeLod !== void 0 && !isValidLod(cmd.activeLod)) {
      return { valid: false, reason: "activeLod must be one of {0,1,2,3,4}" };
    }
    if (cmd.size !== void 0 && !isFiniteVec3$4(cmd.size)) {
      return { valid: false, reason: "size override must have finite x, y, z" };
    }
    const wardrobeCabinetConfig = cmd.wardrobeCabinetConfig;
    if (wardrobeCabinetConfig !== void 0) {
      const cm = window.commandManager;
      const legacyCtx = cm?.getContext?.();
      if (legacyCtx) {
        const verdict = new CreateFurnitureCommand(
          cmd
        ).canExecute(legacyCtx);
        if (!verdict.ok) {
          return {
            valid: false,
            reason: verdict.blockingIssues?.[0] ?? verdict.reason ?? "CreateFurnitureCommand.canExecute refused without stating a reason"
          };
        }
      }
    }
    return { valid: true };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      const id = cmd.id ?? createId("furniture");
      const seed = {
        id,
        levelId: cmd.levelId ?? "",
        catalogId: cmd.catalogId ?? "",
        origin: cmd.origin ?? { x: 0, y: 0, z: 0 },
        rotation: cmd.rotation ?? 0,
        scale: cmd.scale ?? 1,
        size: cmd.size,
        activeLod: cmd.activeLod ?? 2,
        representations: cmd.representations ?? {},
        materialSlots: cmd.materialSlots ?? {},
        materialId: cmd.materialId
      };
      let f;
      try {
        f = Furniture.parse(seed);
      } catch (err) {
        throw new FurnitureSchemaError(err);
      }
      const [next, forward, inverse] = produceCommand(ctx.stores.furniture, (draft) => {
        draft[f.id] = f;
      });
      return { forward, inverse, nextStates: { furniture: next } };
    });
  }
}

class CreateFurnitureBatchHandler {
  type = "furniture.batch.create";
  affectedStores = ["furniture"];
  canExecute(_ctx, cmd) {
    if (!Array.isArray(cmd.furniture) || cmd.furniture.length === 0) {
      return { valid: false, reason: "furniture must be a non-empty array" };
    }
    for (let i = 0; i < cmd.furniture.length; i++) {
      const f = cmd.furniture[i];
      const origin = f.origin ?? f.position;
      if (origin !== void 0 && !isFiniteVec3$4(origin)) {
        return { valid: false, reason: `furniture[${i}].origin/position must have finite x, y, z` };
      }
      if (f.rotation !== void 0 && !Number.isFinite(f.rotation)) {
        return { valid: false, reason: `furniture[${i}].rotation must be finite` };
      }
      if (f.scale !== void 0 && !isValidScale(f.scale)) {
        return { valid: false, reason: `furniture[${i}].scale must be > 0 and finite` };
      }
      if (f.activeLod !== void 0 && !isValidLod(f.activeLod)) {
        return { valid: false, reason: `furniture[${i}].activeLod must be one of {0,1,2,3,4}` };
      }
      if (f.size !== void 0 && !isFiniteVec3$4(f.size)) {
        return { valid: false, reason: `furniture[${i}].size override must have finite x, y, z` };
      }
      if (f.id !== void 0 && (typeof f.id !== "string" || f.id.length === 0)) {
        return { valid: false, reason: `furniture[${i}].id must be a non-empty string when provided` };
      }
    }
    return { valid: true };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      const defaultLevelId = cmd.levelId ?? "";
      const fresh = [];
      for (let i = 0; i < cmd.furniture.length; i++) {
        const cmdF = cmd.furniture[i];
        const id = cmdF.id ?? createId("furniture");
        const seed = {
          id,
          levelId: cmdF.levelId ?? defaultLevelId,
          catalogId: cmdF.catalogId ?? "",
          // Map the legacy furnish `position` to `origin` when no explicit origin
          // is supplied — keeps the PRYZM3 record location-aware (harmless; the
          // single CreateFurnitureHandler defaults origin to {0,0,0}).
          origin: cmdF.origin ?? cmdF.position ?? { x: 0, y: 0, z: 0 },
          rotation: cmdF.rotation ?? 0,
          scale: cmdF.scale ?? 1,
          size: cmdF.size,
          activeLod: cmdF.activeLod ?? 2,
          representations: cmdF.representations ?? {},
          materialSlots: cmdF.materialSlots ?? {},
          materialId: cmdF.materialId
        };
        let f;
        try {
          f = Furniture.parse(seed);
        } catch (err) {
          throw new FurnitureSchemaError(
            new Error(`furniture.batch.create — furniture[${i}] (id=${id})`, { cause: err })
          );
        }
        fresh.push(f);
      }
      const [next, forward, inverse] = produceCommand(ctx.stores.furniture, (draft) => {
        for (const f of fresh) draft[f.id] = f;
      });
      return { forward, inverse, nextStates: { furniture: next } };
    });
  }
}

class DeleteFurnitureHandler {
  type = "furniture.delete";
  affectedStores = ["furniture"];
  canExecute(ctx, cmd) {
    if (typeof cmd.furnitureId !== "string" || cmd.furnitureId.length === 0) {
      return { valid: false, reason: "furnitureId must be a non-empty string" };
    }
    if (!ctx.stores.furniture[cmd.furnitureId]) {
      return { valid: false, reason: `furniture not found: ${cmd.furnitureId}` };
    }
    return { valid: true };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      if (!ctx.stores.furniture[cmd.furnitureId]) throw new FurnitureNotFoundError(cmd.furnitureId);
      const [next, forward, inverse] = produceCommand(ctx.stores.furniture, (draft) => {
        delete draft[cmd.furnitureId];
      });
      return { forward, inverse, nextStates: { furniture: next } };
    });
  }
}

const FURNITURE_MOVE_UNREACHABLE = "furniture.move writes the detached plugin furniture store that nothing renders, exports or persists, and no production surface dispatches it. Moving furniture commits through furniture.updateParameters (payload key: id, plus the changed parameters) → UpdateFurnitureParametersCommand → the geometry furnitureStore, which is what MOVE_COMMAND_BY_TYPE and the 3-D gizmo already dispatch.";
class MoveFurnitureHandler {
  type = "furniture.move";
  affectedStores = ["furniture"];
  /** Payload validation ONLY — kept public so a delegating facade can reuse it. */
  validatePayload(ctx, cmd) {
    if (typeof cmd.furnitureId !== "string" || cmd.furnitureId.length === 0) {
      return { valid: false, reason: "furnitureId must be a non-empty string" };
    }
    if (!isFiniteVec3$4(cmd.delta)) {
      return { valid: false, reason: "delta must have finite x, y, z" };
    }
    if (!ctx.stores.furniture[cmd.furnitureId]) {
      return { valid: false, reason: `furniture not found: ${cmd.furnitureId}` };
    }
    return { valid: true };
  }
  /**
   * §FIX-DEAD-MOVE-VERB-REFUSE (W3-4) — ORDER IS LOAD-BEARING. `canExecute` must be the
   * LAST method before `execute`. `tools/ga-gate/check-verb-register.ts` classifies a
   * verb as REFUSES by slicing the source from `canExecute` to the next `execute(` and
   * checking that the slice can never yield an ACCEPTING validation result. With
   * `validatePayload` sitting between them, its accepting branch lands inside that slice
   * and the verb is mis-reported as UNKNOWN — a refusal hiding from the register that
   * exists to find it. (For the same reason this comment must not spell the accepting
   * literal out: the detector is a regex over source text, and prose is source text.)
   * Do not reorder these two methods.
   */
  canExecute(ctx, cmd) {
    const v = this.validatePayload(ctx, cmd);
    if (!v.valid) return v;
    return { valid: false, reason: FURNITURE_MOVE_UNREACHABLE };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      if (!ctx.stores.furniture[cmd.furnitureId]) throw new FurnitureNotFoundError(cmd.furnitureId);
      const [next, forward, inverse] = produceCommand(ctx.stores.furniture, (draft) => {
        const f = draft[cmd.furnitureId];
        if (!f) return;
        f.origin.x += cmd.delta.x;
        f.origin.y += cmd.delta.y;
        f.origin.z += cmd.delta.z;
      });
      return { forward, inverse, nextStates: { furniture: next } };
    });
  }
}

const FURNITURE_ROTATE_UNREACHABLE = "furniture.rotate writes the detached plugin furniture store that nothing renders, exports or persists, and no production surface dispatches it. Rotation commits through the SAME live verb as translation — furniture.updateParameters (payload key: id, plus `rotation`) → UpdateFurnitureParametersCommand → the geometry furnitureStore, which is what the 3-D gizmo already dispatches on a rotate drag.";
class RotateFurnitureHandler {
  type = "furniture.rotate";
  affectedStores = ["furniture"];
  /** Payload validation ONLY — kept public so a delegating facade can reuse it. */
  validatePayload(ctx, cmd) {
    if (typeof cmd.furnitureId !== "string" || cmd.furnitureId.length === 0) {
      return { valid: false, reason: "furnitureId must be a non-empty string" };
    }
    if (typeof cmd.rotation !== "number" || !Number.isFinite(cmd.rotation)) {
      return { valid: false, reason: "rotation must be a finite number" };
    }
    if (!ctx.stores.furniture[cmd.furnitureId]) {
      return { valid: false, reason: `furniture not found: ${cmd.furnitureId}` };
    }
    return { valid: true };
  }
  /**
   * §FIX-DEAD-MOVE-VERB-REFUSE (W3-4) — ORDER IS LOAD-BEARING. `canExecute` must be the
   * LAST method before `execute`. `tools/ga-gate/check-verb-register.ts` classifies a
   * verb as REFUSES by slicing the source from `canExecute` to the next `execute(` and
   * checking that the slice can never yield an ACCEPTING validation result. With
   * `validatePayload` sitting between them, its accepting branch lands inside that slice
   * and the verb is mis-reported as UNKNOWN — a refusal hiding from the register that
   * exists to find it. (For the same reason this comment must not spell the accepting
   * literal out: the detector is a regex over source text, and prose is source text.)
   * Do not reorder these two methods.
   */
  canExecute(ctx, cmd) {
    const v = this.validatePayload(ctx, cmd);
    if (!v.valid) return v;
    return { valid: false, reason: FURNITURE_ROTATE_UNREACHABLE };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      if (!ctx.stores.furniture[cmd.furnitureId]) throw new FurnitureNotFoundError(cmd.furnitureId);
      const [next, forward, inverse] = produceCommand(ctx.stores.furniture, (draft) => {
        const f = draft[cmd.furnitureId];
        if (!f) return;
        f.rotation = cmd.rotation;
      });
      return { forward, inverse, nextStates: { furniture: next } };
    });
  }
}

class SetFurnitureScaleHandler {
  type = "furniture.setScale";
  affectedStores = ["furniture"];
  canExecute(ctx, cmd) {
    if (typeof cmd.furnitureId !== "string" || cmd.furnitureId.length === 0) {
      return { valid: false, reason: "furnitureId must be a non-empty string" };
    }
    if (!isValidScale(cmd.scale)) {
      return { valid: false, reason: "scale must be > 0 and finite" };
    }
    if (!ctx.stores.furniture[cmd.furnitureId]) {
      return { valid: false, reason: `furniture not found: ${cmd.furnitureId}` };
    }
    return { valid: true };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      if (!ctx.stores.furniture[cmd.furnitureId]) throw new FurnitureNotFoundError(cmd.furnitureId);
      const [next, forward, inverse] = produceCommand(ctx.stores.furniture, (draft) => {
        const f = draft[cmd.furnitureId];
        if (!f) return;
        f.scale = cmd.scale;
      });
      return { forward, inverse, nextStates: { furniture: next } };
    });
  }
}

class SetActiveLodHandler {
  type = "furniture.setActiveLod";
  affectedStores = ["furniture"];
  canExecute(ctx, cmd) {
    if (typeof cmd.furnitureId !== "string" || cmd.furnitureId.length === 0) {
      return { valid: false, reason: "furnitureId must be a non-empty string" };
    }
    if (!isValidLod(cmd.lod)) {
      return { valid: false, reason: "lod must be one of {0,1,2,3,4}" };
    }
    if (!ctx.stores.furniture[cmd.furnitureId]) {
      return { valid: false, reason: `furniture not found: ${cmd.furnitureId}` };
    }
    return { valid: true };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      if (!ctx.stores.furniture[cmd.furnitureId]) throw new FurnitureNotFoundError(cmd.furnitureId);
      if (!isValidLod(cmd.lod)) throw new FurnitureLodError(cmd.lod);
      const [next, forward, inverse] = produceCommand(ctx.stores.furniture, (draft) => {
        const f = draft[cmd.furnitureId];
        if (!f) return;
        f.activeLod = cmd.lod;
      });
      return { forward, inverse, nextStates: { furniture: next } };
    });
  }
}

class SetFurnitureRepresentationHandler {
  type = "furniture.setRepresentation";
  affectedStores = ["furniture"];
  canExecute(ctx, cmd) {
    if (typeof cmd.furnitureId !== "string" || cmd.furnitureId.length === 0) {
      return { valid: false, reason: "furnitureId must be a non-empty string" };
    }
    if (!isValidLod(cmd.lod)) {
      return { valid: false, reason: "lod must be one of {0,1,2,3,4}" };
    }
    if (!ctx.stores.furniture[cmd.furnitureId]) {
      return { valid: false, reason: `furniture not found: ${cmd.furnitureId}` };
    }
    return { valid: true };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      if (!ctx.stores.furniture[cmd.furnitureId]) throw new FurnitureNotFoundError(cmd.furnitureId);
      if (!isValidLod(cmd.lod)) throw new FurnitureLodError(cmd.lod);
      let parsed;
      if (cmd.representation !== void 0) {
        try {
          parsed = FurnitureRepresentation.parse(cmd.representation);
        } catch (err) {
          throw new FurnitureSchemaError(err);
        }
      }
      const key = String(cmd.lod);
      const [next, forward, inverse] = produceCommand(ctx.stores.furniture, (draft) => {
        const f = draft[cmd.furnitureId];
        if (!f) return;
        if (parsed === void 0) {
          delete f.representations[key];
        } else {
          f.representations[key] = parsed;
        }
      });
      return { forward, inverse, nextStates: { furniture: next } };
    });
  }
}

function _furnitureMovePatchPair(cmd) {
  const forward = [];
  const inverse = [];
  if (cmd.position && cmd._prevPosition) {
    forward.push({ op: "replace", path: [cmd.id, "position"], value: { ...cmd.position } });
    inverse.push({ op: "replace", path: [cmd.id, "position"], value: { ...cmd._prevPosition } });
  }
  if (cmd.rotation && cmd._prevRotation) {
    forward.push({ op: "replace", path: [cmd.id, "rotation"], value: { ...cmd.rotation } });
    inverse.push({ op: "replace", path: [cmd.id, "rotation"], value: { ...cmd._prevRotation } });
  }
  return forward.length > 0 ? { forward, inverse } : null;
}
function legacyCanExecuteRefusal(cmd) {
  const cm = window.commandManager;
  const legacyCtx = cm?.getContext?.();
  if (!legacyCtx) return null;
  const verdict = new UpdateFurnitureParametersCommand(
    cmd
  ).canExecute(legacyCtx);
  if (verdict.ok) return null;
  return verdict.blockingIssues?.[0] ?? verdict.reason ?? "UpdateFurnitureParametersCommand.canExecute refused without stating a reason";
}
const UpdateFurnitureParametersHandler = {
  type: "furniture.updateParameters",
  // §FIX-UNDO-CAPTURE-SYSTEMIC (L-72) — declare the `furniture` store so the
  // forward/inverse PatchPair emitted on a 3D-gizmo move/rotate is routed onto the
  // ring buffer (CommandBus routes patches by affectedStores). Previously this was
  // `[]` with empty patches, so EVERY 3D furniture move/rotate was classified as an
  // EMPTY-PATCH record and SKIPPED the ring buffer — the move landed ONLY in the
  // legacy commandManager, so the ring-buffer-FIRST performUndo() undid whatever
  // covered element was on the ring and the furniture "stayed moved" (same class as
  // L-49 for walls). Non-drag callers still return empty patches → still skipped.
  affectedStores: ["furniture"],
  canExecute(_ctx, cmd) {
    if (!cmd.id) return { valid: false, reason: "furniture id is required" };
    if (cmd.wardrobeCabinetConfig !== void 0 || cmd.height !== void 0) {
      const refusal = legacyCanExecuteRefusal(cmd);
      if (refusal !== null) return { valid: false, reason: refusal };
    }
    return { valid: true };
  },
  execute(_ctx, cmd) {
    return withHandlerSpan("furniture.updateParameters.handler", { "pryzm.command.type": "furniture.updateParameters" }, () => {
      const patches = cmd._recordUndo ? _furnitureMovePatchPair(cmd) : null;
      const result = patches ?? { forward: [], inverse: [] };
      const cm = window.commandManager;
      if (cm) {
        try {
          cm.execute(new UpdateFurnitureParametersCommand(cmd));
        } catch (e) {
          console.error("[furniture.updateParameters.handler] bridge failed:", e);
        }
      }
      return result;
    });
  }
};

const FURNITURE_MATERIAL_UNREACHABLE = "It writes the plugin DTO store, which is a FRESH instance built by PluginRegistry and is read by no renderer, no 2-D projector, no IFC exporter and no persistence path — only `<family>.created` is ever mirrored to the geometry store, never updates (§FIX-MATERIAL-DEAD-DISPATCH). Use `furniture.updateParameters` instead — it reaches the geometry record the builders read. (its colour field is `color`).";
class SetFurnitureMaterialHandler {
  type = "furniture.setMaterial";
  affectedStores = ["furniture"];
  canExecute(ctx, cmd) {
    if (typeof cmd.furnitureId !== "string" || cmd.furnitureId.length === 0) {
      return { valid: false, reason: "furnitureId must be a non-empty string" };
    }
    if (cmd.materialId === void 0 && cmd.materialColor === void 0) {
      return { valid: false, reason: "at least one of materialId / materialColor must be provided" };
    }
    if (cmd.materialColor !== void 0 && cmd.materialColor.length === 0) {
      return { valid: false, reason: "materialColor must be non-empty when provided" };
    }
    if (cmd.materialId !== void 0 && cmd.materialId !== null && cmd.materialId.length === 0) {
      return { valid: false, reason: "materialId must be non-empty when provided" };
    }
    if (!ctx.stores.furniture[cmd.furnitureId]) {
      return { valid: false, reason: `furniture not found: ${cmd.furnitureId}` };
    }
    return { valid: false, reason: FURNITURE_MATERIAL_UNREACHABLE };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      if (!ctx.stores.furniture[cmd.furnitureId]) throw new FurnitureNotFoundError(cmd.furnitureId);
      const [next, forward, inverse] = produceCommand(ctx.stores.furniture, (draft) => {
        const f = draft[cmd.furnitureId];
        if (!f) return;
        if (cmd.materialId === null) delete f.materialId;
        else if (cmd.materialId !== void 0) f.materialId = cmd.materialId;
      });
      return { forward, inverse, nextStates: { furniture: next } };
    });
  }
}

class ChangeFurnitureLevelHandler {
  type = "furniture.changeLevel";
  // The EXACT key the rest of this plugin's handlers declare, and the exact key
  // `buildUndoStoreMap()` binds to the legacy geometry store
  // (`apps/editor/src/engine/undo/performUndoRedo.ts:322` —
  // `furniture:      w.furnitureStore,`). A key absent from that map makes
  // `_covered()` false, `performUndo` skips the ring buffer and falls through to
  // commandManager, and Ctrl+Z reports "history empty" (the OI-054 bug).
  affectedStores = ["furniture"];
  canExecute(ctx, cmd) {
    if (typeof cmd.furnitureId !== "string" || cmd.furnitureId.length === 0) {
      return { valid: false, reason: "furnitureId must be a non-empty string" };
    }
    if (typeof cmd.levelId !== "string" || cmd.levelId.length === 0) {
      return { valid: false, reason: "levelId must be a non-empty string" };
    }
    if (!Object.prototype.hasOwnProperty.call(ctx.stores.furniture, cmd.furnitureId)) {
      return { valid: false, reason: `furniture not found: ${cmd.furnitureId}` };
    }
    if (ctx.stores.furniture[cmd.furnitureId]?.levelId === cmd.levelId) {
      return {
        valid: false,
        reason: `furniture ${cmd.furnitureId} is already on level ${cmd.levelId}`
      };
    }
    return { valid: true };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      const [next, forward, inverse] = produceCommand(ctx.stores.furniture, (draft) => {
        const f = draft[cmd.furnitureId];
        if (f === void 0) return;
        f.levelId = cmd.levelId;
      });
      return { forward, inverse, nextStates: { furniture: next } };
    });
  }
}

const KITCHEN_MATERIAL_BATCH_REPORT_EVENT = "pryzm-kitchen-material-batch-report";
function isValidScope(scope) {
  if (typeof scope !== "object" || scope === null) return false;
  const s = scope;
  if (s.kind === "element") return typeof s.elementId === "string" && s.elementId.length > 0;
  if (s.kind === "level") return typeof s.levelId === "string" && s.levelId.length > 0;
  if (s.kind === "project") return true;
  return false;
}
const VALID_TARGETS = /* @__PURE__ */ new Set(["carcass", "doorFront", "countertop"]);
const BulkUpdateKitchenMaterialHandler = {
  type: "furniture.bulkUpdateKitchenMaterial",
  affectedStores: [],
  canExecute(_ctx, cmd) {
    if (!isValidScope(cmd.scope)) {
      return { valid: false, reason: "scope must be { kind: 'element', elementId } | { kind: 'level', levelId } | { kind: 'project' }" };
    }
    if (!VALID_TARGETS.has(cmd.target)) {
      return { valid: false, reason: "target must be 'carcass', 'doorFront' or 'countertop'" };
    }
    if (typeof cmd.materialRef !== "string" || cmd.materialRef.length === 0) {
      return { valid: false, reason: "materialRef must be a non-empty material id or name" };
    }
    return { valid: true };
  },
  execute(_ctx, cmd) {
    return withHandlerSpan(
      "furniture.bulkUpdateKitchenMaterial.handler",
      { "pryzm.command.type": "furniture.bulkUpdateKitchenMaterial" },
      () => {
        const cm = window.commandManager;
        const sayNothingRan = (why) => {
          const report = {
            success: false,
            info: [
              `'furniture.bulkUpdateKitchenMaterial' did not run — ${why}. Nothing was changed, and nothing about the model is confirmed.`
            ],
            affectedElementIds: [],
            outcome: "indeterminate"
          };
          try {
            window.dispatchEvent(new CustomEvent(KITCHEN_MATERIAL_BATCH_REPORT_EVENT, { detail: report }));
          } catch (emitErr) {
            console.error("[furniture.bulkUpdateKitchenMaterial.handler] indeterminate report emit failed:", emitErr);
          }
        };
        let refusal = null;
        if (cm) {
          try {
            const result = cm.execute(
              new BulkUpdateKitchenMaterialCommand({
                scope: cmd.scope,
                target: cmd.target,
                materialRef: cmd.materialRef
              })
            );
            const readable = !!result && Array.isArray(result.affectedElementIds);
            const report = readable ? {
              success: result.success ?? false,
              info: result.info ?? [],
              affectedElementIds: result.affectedElementIds
            } : {
              success: false,
              info: [
                `'furniture.bulkUpdateKitchenMaterial' RAN but the command manager returned no readable result. WHICH kitchens changed is not known — this is NOT a report that none did.`
              ],
              affectedElementIds: [],
              outcome: "indeterminate"
            };
            window.dispatchEvent(
              new CustomEvent(KITCHEN_MATERIAL_BATCH_REPORT_EVENT, { detail: report })
            );
            if (!report.success) {
              refusal = report.info[0] ?? "the kitchen material change was refused, and no reason was given";
            }
          } catch (e) {
            console.error("[furniture.bulkUpdateKitchenMaterial.handler] bridge failed:", e);
            sayNothingRan(`the bridge threw: ${String(e?.message ?? e)}`);
            refusal = `the bridge threw: ${String(e?.message ?? e)}`;
          }
        } else {
          sayNothingRan("the command manager is not available in this session");
          refusal = "the command manager is not available in this session";
        }
        if (refusal !== null) {
          throw new Error(`furniture.bulkUpdateKitchenMaterial: ${refusal}`);
        }
        const empty = { forward: [], inverse: [] };
        return empty;
      }
    );
  }
};

function buildFurnitureHandlerSet() {
  return [
    new CreateFurnitureHandler(),
    new CreateFurnitureBatchHandler(),
    new DeleteFurnitureHandler(),
    new MoveFurnitureHandler(),
    new RotateFurnitureHandler(),
    new SetFurnitureScaleHandler(),
    new SetActiveLodHandler(),
    new SetFurnitureRepresentationHandler(),
    UpdateFurnitureParametersHandler,
    new SetFurnitureMaterialHandler(),
    new ChangeFurnitureLevelHandler(),
    BulkUpdateKitchenMaterialHandler
  ];
}

function box(w, h, d) {
  const x = w / 2, y = h / 2, z = d / 2;
  const positions = [
    -x,
    -y,
    -z,
    x,
    -y,
    -z,
    x,
    y,
    -z,
    -x,
    y,
    -z,
    // back  (-Z)
    -x,
    -y,
    z,
    x,
    -y,
    z,
    x,
    y,
    z,
    -x,
    y,
    z
    // front (+Z)
  ];
  const indices = [
    // -Z
    0,
    2,
    1,
    0,
    3,
    2,
    // +Z
    4,
    5,
    6,
    4,
    6,
    7,
    // -X
    0,
    4,
    7,
    0,
    7,
    3,
    // +X
    1,
    2,
    6,
    1,
    6,
    5,
    // -Y
    0,
    1,
    5,
    0,
    5,
    4,
    // +Y
    3,
    7,
    6,
    3,
    6,
    2
  ];
  return { positions, indices };
}
function stack(w, h, d) {
  const a = box(w, h, d);
  const b = box(w * 0.6, h * 0.6, d * 0.6);
  const offset = a.positions.length / 3;
  return {
    positions: [...a.positions, ...b.positions],
    indices: [...a.indices, ...b.indices.map((i) => i + offset)]
  };
}
function luxury(w, h, d) {
  const s = stack(w, h, d);
  const cap = box(w * 0.9, h * 0.05, d * 0.9);
  const offset = s.positions.length / 3;
  const capLifted = cap.positions.slice();
  for (let i = 1; i < capLifted.length; i += 3) capLifted[i] = (capLifted[i] ?? 0) + h / 2;
  return {
    positions: [...s.positions, ...capLifted],
    indices: [...s.indices, ...cap.indices.map((i) => i + offset)]
  };
}
const CHAIR_SIZE = { x: 0.5, y: 0.9, z: 0.55 };
const SOFA_SIZE = { x: 2.1, y: 0.85, z: 0.9 };
const TABLE_SIZE = { x: 1.4, y: 0.75, z: 0.8 };
[
  {
    id: "pryzm/chair-basic",
    displayName: "Basic Chair",
    category: "seating",
    tags: ["chair", "seating", "basic"],
    size: CHAIR_SIZE,
    representations: {
      "0": box(CHAIR_SIZE.x, CHAIR_SIZE.y, CHAIR_SIZE.z),
      "1": box(CHAIR_SIZE.x, CHAIR_SIZE.y, CHAIR_SIZE.z),
      "2": box(CHAIR_SIZE.x, CHAIR_SIZE.y, CHAIR_SIZE.z),
      "3": stack(CHAIR_SIZE.x, CHAIR_SIZE.y, CHAIR_SIZE.z),
      "4": luxury(CHAIR_SIZE.x, CHAIR_SIZE.y, CHAIR_SIZE.z)
    },
    materialSlots: { primary: "wood-oak" },
    materialId: "wood-oak"
  },
  {
    id: "pryzm/sofa-3s",
    displayName: "3-Seat Sofa",
    category: "seating",
    tags: ["sofa", "seating", "living-room"],
    size: SOFA_SIZE,
    representations: {
      "0": box(SOFA_SIZE.x, SOFA_SIZE.y, SOFA_SIZE.z),
      "1": box(SOFA_SIZE.x, SOFA_SIZE.y, SOFA_SIZE.z),
      "2": box(SOFA_SIZE.x, SOFA_SIZE.y, SOFA_SIZE.z),
      "3": stack(SOFA_SIZE.x, SOFA_SIZE.y, SOFA_SIZE.z),
      "4": luxury(SOFA_SIZE.x, SOFA_SIZE.y, SOFA_SIZE.z)
    },
    materialSlots: { primary: "fabric-wool-felt-grey" },
    materialId: "fabric-wool-felt-grey"
  },
  {
    id: "pryzm/table-rect",
    displayName: "Rectangular Table",
    category: "tables",
    tags: ["table", "dining", "rectangular"],
    size: TABLE_SIZE,
    representations: {
      "0": box(TABLE_SIZE.x, TABLE_SIZE.y, TABLE_SIZE.z),
      "1": box(TABLE_SIZE.x, TABLE_SIZE.y, TABLE_SIZE.z),
      "2": box(TABLE_SIZE.x, TABLE_SIZE.y, TABLE_SIZE.z),
      "3": stack(TABLE_SIZE.x, TABLE_SIZE.y, TABLE_SIZE.z),
      "4": luxury(TABLE_SIZE.x, TABLE_SIZE.y, TABLE_SIZE.z)
    },
    materialSlots: { primary: "wood-walnut" },
    materialId: "wood-walnut"
  }
];

class PlumbingStore extends Store {
  constructor() {
    super("plumbing");
  }
  ids() {
    return [...this.state.keys()];
  }
  byLevel(levelId) {
    const out = [];
    for (const p of this.state.values()) if (p.levelId === levelId) out.push(p);
    return out;
  }
  bySystem(tag) {
    const out = [];
    for (const p of this.state.values()) if (p.systemTag === tag) out.push(p);
    return out;
  }
  get(id) {
    return this.state.get(id);
  }
}

const ACCESSORY_VARIANTS = [
  "washing_machine",
  "toilet_brush",
  "toilet_paper",
  "laundry_bag",
  "iron",
  "ironing_board"
];
const ACCESSORY_VARIANT_LABELS = {
  washing_machine: "Washing Machine",
  toilet_brush: "Toilet Brush",
  toilet_paper: "Toilet Paper Holder",
  laundry_bag: "Laundry Hamper",
  iron: "Steam Iron",
  ironing_board: "Ironing Board"
};
const DEFAULT_ACCESSORY_VARIANT = "washing_machine";
const ACCESSORY_FOOTPRINTS = {
  washing_machine: { width: 0.6, length: 0.6, height: 0.85 },
  toilet_brush: { width: 0.1, length: 0.1, height: 0.4 },
  toilet_paper: { width: 0.18, length: 0.1, height: 0.12 },
  laundry_bag: { width: 0.4, length: 0.4, height: 0.55 },
  iron: { width: 0.26, length: 0.13, height: 0.18 },
  ironing_board: { width: 0.4, length: 1.3, height: 0.85 }
};

const SHOWER_VARIANTS = [
  "shower_system_shelf",
  "shower_system_simple",
  "shower_cabinet_sliding",
  "shower_cabinet_open",
  "shower_walkin_left",
  "shower_walkin_right",
  "shower_walkin_corner"
];
const SHOWER_VARIANT_LABELS = {
  shower_system_shelf: "Rain System with Shelf",
  shower_system_simple: "Rain System (Simple)",
  shower_cabinet_sliding: "Glass Cabinet — Sliding Door",
  shower_cabinet_open: "Glass Cabinet — Open",
  shower_walkin_left: "Walk-in Shower — Glass Left",
  shower_walkin_right: "Walk-in Shower — Glass Right",
  shower_walkin_corner: "Walk-in Shower — Corner Glass"
};
const DEFAULT_SHOWER_VARIANT = "shower_system_shelf";
const SHOWER_FOOTPRINTS = {
  shower_system_shelf: { width: 0.3, length: 0.4, height: 2.1 },
  shower_system_simple: { width: 0.28, length: 0.36, height: 2.1 },
  shower_cabinet_sliding: { width: 0.9, length: 0.9, height: 2 },
  shower_cabinet_open: { width: 0.9, length: 0.9, height: 2 },
  // Walk-in enclosures are generous open bays — ~1.0 m wide × 1.2 m deep,
  // 2.20 m to the ceiling rain-head (Contract 39 §5 — plan symbol reads the
  // same footprint via SHOWER_FOOTPRINTS).
  shower_walkin_left: { width: 1, length: 1.2, height: 2.2 },
  shower_walkin_right: { width: 1, length: 1.2, height: 2.2 },
  shower_walkin_corner: { width: 1, length: 1.2, height: 2.2 }
};

const TOILET_VARIANTS = [
  "wall_hung_square",
  "wall_hung_round",
  "close_coupled_square",
  "close_coupled_round"
];
const TOILET_VARIANT_LABELS = {
  wall_hung_square: "Wall-Hung Square",
  wall_hung_round: "Wall-Hung Round",
  close_coupled_square: "Close-Coupled Square",
  close_coupled_round: "Close-Coupled Round"
};
const DEFAULT_TOILET_VARIANT = "close_coupled_round";
const TOILET_FOOTPRINTS = {
  wall_hung_square: { width: 0.36, length: 0.54, height: 0.42 },
  wall_hung_round: { width: 0.38, length: 0.58, height: 0.42 },
  close_coupled_square: { width: 0.4, length: 0.68, height: 0.78 },
  close_coupled_round: { width: 0.42, length: 0.72, height: 0.82 }
};

new DOMEventBus();

const TOILET_DESCRIPTIONS = {
  wall_hung_square: "Concealed cistern, square D-shape seat — modern.",
  wall_hung_round: "Concealed cistern, full-round seat — minimal.",
  close_coupled_square: "Visible square tank, dual flush buttons.",
  close_coupled_round: "Visible rounded tank, single dome flush."
};
const SHOWER_DESCRIPTIONS = {
  shower_system_shelf: "Wall column, round rain-head, shelf and handheld.",
  shower_system_simple: "Wall column, round rain-head, thermostat and handheld.",
  shower_cabinet_sliding: "Glass enclosure with sliding front door and tray.",
  shower_cabinet_open: "Open glass enclosure with low ceramic tray.",
  // §FEAT-SHOWER-ENCLOSURE-TYPE (L-37) — composite walk-in: rain head +
  // hand-shower + mixer + niche + linear gutter drain + frameless glass.
  shower_walkin_left: "Walk-in: rain + hand-shower + gutter drain, frameless glass on the left.",
  shower_walkin_right: "Walk-in: rain + hand-shower + gutter drain, frameless glass on the right.",
  shower_walkin_corner: "Walk-in: rain + hand-shower + gutter drain, L-shaped corner glass."
};
const ACCESSORY_DESCRIPTIONS = {
  washing_machine: "Front-loading washing machine with porthole door.",
  toilet_brush: "Toilet brush in cylindrical holder.",
  toilet_paper: "Wall-mounted paper holder with roll.",
  laundry_bag: "Cylindrical fabric hamper with rope handles.",
  iron: "Steam iron resting on its base.",
  ironing_board: "Folding ironing board on splayed legs."
};
function freezeType(t) {
  return Object.freeze({ ...t });
}
const BUILT_IN = [
  ...TOILET_VARIANTS.map((v) => freezeType({
    id: `pf-toilet-${v}`,
    family: "toilet",
    variant: v,
    name: TOILET_VARIANT_LABELS[v],
    description: TOILET_DESCRIPTIONS[v],
    ceramicColor: "#ffffff",
    metalColor: "#aaaaaa",
    isBuiltIn: true
  })),
  freezeType({
    id: "pf-bath-default",
    family: "bath",
    variant: "default",
    name: "Standard Tub",
    description: "Rectangular extruded rim tub.",
    ceramicColor: "#ffffff",
    metalColor: "#aaaaaa",
    isBuiltIn: true
  }),
  freezeType({
    id: "pf-sink-default",
    family: "sink",
    variant: "default",
    name: "Pedestal Basin",
    description: "Pedestal-mounted ceramic basin with chrome spout.",
    ceramicColor: "#ffffff",
    metalColor: "#aaaaaa",
    isBuiltIn: true
  }),
  ...SHOWER_VARIANTS.map((v) => freezeType({
    id: `pf-shower-${v}`,
    family: "shower",
    variant: v,
    name: SHOWER_VARIANT_LABELS[v],
    description: SHOWER_DESCRIPTIONS[v],
    ceramicColor: "#ffffff",
    metalColor: "#222222",
    // matt-black per catalogue references
    isBuiltIn: true
  })),
  ...ACCESSORY_VARIANTS.map((v) => freezeType({
    id: `pf-accessory-${v}`,
    family: "accessory",
    variant: v,
    name: ACCESSORY_VARIANT_LABELS[v],
    description: ACCESSORY_DESCRIPTIONS[v],
    ceramicColor: "#f5f5f5",
    metalColor: "#b8b8b8",
    isBuiltIn: true
  }))
];
class PlumbingSystemTypeStore {
  _types = /* @__PURE__ */ new Map();
  constructor() {
    for (const t of BUILT_IN) this._types.set(t.id, t);
  }
  getAll() {
    return Array.from(this._types.values());
  }
  getById(id) {
    return this._types.get(id);
  }
  /** All variants for a fixture family (toilet / sink / bath / …). */
  getByFamily(family) {
    return this.getAll().filter((t) => t.family === family);
  }
  /** Lookup by variant slug (e.g. 'wall_hung_square'). */
  getByVariant(variant) {
    return this.getAll().find((t) => t.variant === variant);
  }
}
const plumbingSystemTypeStore = new PlumbingSystemTypeStore();
if (typeof window !== "undefined") {
  window.plumbingSystemTypeStore = plumbingSystemTypeStore;
}

function assertNever(x) {
  throw new Error(`PlumbingSymbolGeometry: unhandled fixture type "${String(x)}"`);
}
const SINK_FALLBACK = { width: 0.65, length: 0.5, height: 0.85 };
const BATH_FALLBACK = { width: 1.7, length: 0.75, height: 0.6 };
const URINAL_FALLBACK = { width: 0.38, length: 0.35, height: 0.65 };
const BIDET_FALLBACK = { width: 0.38, length: 0.56, height: 0.4 };
function withOverrides(base, d) {
  return {
    width: d.width && d.width > 0 ? d.width : base.width,
    length: d.length && d.length > 0 ? d.length : base.length,
    height: d.height && d.height > 0 ? d.height : base.height
  };
}
function resolveFixtureFootprint(d) {
  const t = d.fixtureType;
  switch (t) {
    case "toilet":
      return TOILET_FOOTPRINTS[d.toiletVariant ?? DEFAULT_TOILET_VARIANT];
    case "shower":
      return SHOWER_FOOTPRINTS[d.showerVariant ?? DEFAULT_SHOWER_VARIANT];
    case "accessory":
      return ACCESSORY_FOOTPRINTS[d.accessoryVariant ?? DEFAULT_ACCESSORY_VARIANT];
    case "sink":
      return withOverrides(SINK_FALLBACK, d);
    case "bath":
      return withOverrides(BATH_FALLBACK, d);
    case "urinal":
      return withOverrides(URINAL_FALLBACK, d);
    case "bidet":
      return withOverrides(BIDET_FALLBACK, d);
    default:
      return assertNever(t);
  }
}

const BATHROOM_POD_MEMBER_ORDER = Object.freeze([
  "shower",
  "bath",
  "wc",
  "basin",
  "accessory"
]);
function bathroomPodChildIds(pod) {
  return pod.members.map((m) => m.id);
}
const MEMBER_KINDS = new Set(BATHROOM_POD_MEMBER_ORDER);
const FIXTURE_TYPES = /* @__PURE__ */ new Set(["toilet", "sink", "shower", "bath", "accessory"]);
function isFiniteNumber(v) {
  return typeof v === "number" && Number.isFinite(v);
}
function isVec3(v) {
  if (typeof v !== "object" || v === null) return false;
  const o = v;
  return isFiniteNumber(o["x"]) && isFiniteNumber(o["y"]) && isFiniteNumber(o["z"]);
}
function validateBathroomPod(v) {
  if (typeof v !== "object" || v === null) return { ok: false, reason: "a bathroom pod must be an object" };
  const o = v;
  if (typeof o["id"] !== "string" || o["id"].length === 0) {
    return { ok: false, reason: "id must be a non-empty string" };
  }
  if (o["type"] !== "bathroomPod") {
    return { ok: false, reason: `type must be "bathroomPod", got ${JSON.stringify(o["type"])}` };
  }
  if (typeof o["levelId"] !== "string" || o["levelId"].length === 0) {
    return { ok: false, reason: "levelId must be a non-empty string" };
  }
  if (o["handedness"] !== "left" && o["handedness"] !== "right") {
    return { ok: false, reason: `handedness must be "left" or "right", got ${JSON.stringify(o["handedness"])}` };
  }
  if (o["arrangement"] !== "single-wall" && o["arrangement"] !== "l-shaped") {
    return {
      ok: false,
      reason: `arrangement must be "single-wall" or "l-shaped", got ${JSON.stringify(o["arrangement"])}`
    };
  }
  const room = o["room"];
  if (typeof room !== "object" || room === null) return { ok: false, reason: "room is required" };
  const r = room;
  if (!isFiniteNumber(r["clearWidth"]) || r["clearWidth"] <= 0) {
    return { ok: false, reason: "room.clearWidth must be a positive, finite number of metres" };
  }
  if (!isFiniteNumber(r["clearDepth"]) || r["clearDepth"] <= 0) {
    return { ok: false, reason: "room.clearDepth must be a positive, finite number of metres" };
  }
  if (!isVec3(r["origin"])) return { ok: false, reason: "room.origin must be a finite {x,y,z}" };
  if (!isFiniteNumber(r["rotation"])) return { ok: false, reason: "room.rotation must be a finite number of radians" };
  const members = o["members"];
  if (!Array.isArray(members) || members.length === 0) {
    return { ok: false, reason: "a bathroom pod must have at least one member" };
  }
  const seenIds = /* @__PURE__ */ new Set();
  const seenKinds = /* @__PURE__ */ new Set();
  for (const raw of members) {
    if (typeof raw !== "object" || raw === null) return { ok: false, reason: "every member must be an object" };
    const m = raw;
    if (typeof m["id"] !== "string" || m["id"].length === 0) {
      return { ok: false, reason: "every member must have a non-empty id" };
    }
    if (seenIds.has(m["id"])) {
      return { ok: false, reason: `member id listed twice: ${m["id"]}` };
    }
    seenIds.add(m["id"]);
    if (typeof m["kind"] !== "string" || !MEMBER_KINDS.has(m["kind"])) {
      return { ok: false, reason: `member ${m["id"]} has an unknown kind ${JSON.stringify(m["kind"])}` };
    }
    if (m["kind"] !== "accessory") {
      if (seenKinds.has(m["kind"])) {
        return { ok: false, reason: `a pod may carry only one ${m["kind"]}; it was listed twice` };
      }
      seenKinds.add(m["kind"]);
    }
    if (typeof m["fixtureType"] !== "string" || !FIXTURE_TYPES.has(m["fixtureType"])) {
      return {
        ok: false,
        reason: `member ${m["id"]} has an unknown fixtureType ${JSON.stringify(m["fixtureType"])}`
      };
    }
    if (!isVec3(m["position"])) return { ok: false, reason: `member ${m["id"]} has a non-finite position` };
    if (!isFiniteNumber(m["rotationY"])) {
      return { ok: false, reason: `member ${m["id"]} has a non-finite rotationY` };
    }
    const fp = m["footprint"];
    if (typeof fp !== "object" || fp === null) {
      return { ok: false, reason: `member ${m["id"]} has no footprint` };
    }
    const f = fp;
    if (!isFiniteNumber(f["width"]) || f["width"] <= 0 || !isFiniteNumber(f["length"]) || f["length"] <= 0 || !isFiniteNumber(f["height"]) || f["height"] <= 0) {
      return { ok: false, reason: `member ${m["id"]} has a non-positive footprint dimension` };
    }
    if (m["wall"] !== "primary" && m["wall"] !== "left-return" && m["wall"] !== "right-return") {
      return { ok: false, reason: `member ${m["id"]} names an unknown wall ${JSON.stringify(m["wall"])}` };
    }
  }
  return { ok: true, value: v };
}

const BATHROOM_POD_CLEARANCES = Object.freeze({
  wc: { clearFront: 0.6, clearSides: 0.1 },
  basin: { clearFront: 0.7, clearSides: 0.05 },
  shower: { clearFront: 0.2, clearSides: 0 },
  bath: { clearFront: 0.45, clearSides: 0.05 },
  accessory: { clearFront: 0, clearSides: 0 }
});
const BATHROOM_POD_DEFAULT_MEMBERS = Object.freeze(["shower", "wc", "basin"]);
const DEFAULT_POD_TOILET_VARIANT = "close_coupled_round";
function podShowerVariantFor(handedness) {
  return handedness === "left" ? "shower_walkin_right" : "shower_walkin_left";
}
function podGapBetween(a, b) {
  return Math.max(BATHROOM_POD_CLEARANCES[a].clearSides, BATHROOM_POD_CLEARANCES[b].clearSides);
}
function podMemberConsumesRun(kind) {
  return kind !== "accessory";
}

const FIXTURE_TYPE_OF = Object.freeze({
  shower: "shower",
  bath: "bath",
  wc: "toilet",
  basin: "sink",
  accessory: "accessory"
});
const MEMBER_LABEL = Object.freeze({
  shower: "shower",
  bath: "bath",
  wc: "WC",
  basin: "basin",
  accessory: "accessory"
});
function m2(v) {
  return v.toFixed(2);
}
function footprintOf(kind, handedness, overrides) {
  const variant = resolveVariant(kind, handedness, overrides);
  const fixtureType = FIXTURE_TYPE_OF[kind];
  const footprint = resolveFixtureFootprint({
    fixtureType,
    ...kind === "wc" ? { toiletVariant: variant } : {},
    ...kind === "shower" ? { showerVariant: variant } : {},
    ...kind === "accessory" ? { accessoryVariant: variant } : {}
  });
  return { footprint, variant };
}
function resolveVariant(kind, handedness, overrides) {
  const override = overrides?.[kind];
  if (override !== void 0 && override.length > 0) return override;
  if (kind === "wc") return DEFAULT_POD_TOILET_VARIANT;
  if (kind === "shower") return podShowerVariantFor(handedness);
  return void 0;
}
function normaliseMembers(requested) {
  const out = [];
  for (const kind of BATHROOM_POD_MEMBER_ORDER) {
    const n = requested.filter((k) => k === kind).length;
    if (kind === "accessory") {
      for (let i = 0; i < n; i++) out.push(kind);
    } else if (n > 0) {
      out.push(kind);
    }
  }
  return out;
}
function toWorld(room, localX, localZ) {
  const cos = Math.cos(room.rotation);
  const sin = Math.sin(room.rotation);
  return {
    x: room.origin.x + localX * cos - localZ * sin,
    y: room.origin.y,
    z: room.origin.z + localX * sin + localZ * cos
  };
}
function requiredRun(kinds, fps) {
  let run = 0;
  let previous = null;
  for (let i = 0; i < kinds.length; i++) {
    const kind = kinds[i];
    if (!podMemberConsumesRun(kind)) continue;
    if (previous !== null) run += podGapBetween(previous, kind);
    run += fps.get(i).width;
    previous = kind;
  }
  return run;
}
function requiredDepth(kinds, fps) {
  let worst = 0;
  let worstKind = kinds[0] ?? "wc";
  for (let i = 0; i < kinds.length; i++) {
    const kind = kinds[i];
    if (!podMemberConsumesRun(kind)) continue;
    const need = fps.get(i).length + BATHROOM_POD_CLEARANCES[kind].clearFront;
    if (need > worst) {
      worst = need;
      worstKind = kind;
    }
  }
  return { depth: worst, kind: worstKind };
}
function runBreakdown(kinds, fps) {
  const parts = [];
  let previous = null;
  for (let i = 0; i < kinds.length; i++) {
    const kind = kinds[i];
    if (!podMemberConsumesRun(kind)) continue;
    if (previous !== null) {
      const gap = podGapBetween(previous, kind);
      if (gap > 0) parts.push(m2(gap));
    }
    parts.push(`${MEMBER_LABEL[kind]} ${m2(fps.get(i).width)}`);
    previous = kind;
  }
  return parts.join(" + ");
}
function solveBathroomPodLayout(input) {
  const { room, handedness } = input;
  const kinds = normaliseMembers(input.members);
  if (kinds.length === 0) {
    return {
      ok: false,
      reason: "A bathroom pod must contain at least one fixture. Choose a WC, a basin or a shower and place it again.",
      shortfall: { axis: "width", requiredM: 0, availableM: room.clearWidth }
    };
  }
  if (input.memberIds.length !== kinds.length) {
    return {
      ok: false,
      reason: `This pod resolves to ${kinds.length} member(s) but was given ${input.memberIds.length} pre-minted id(s). Every member must have an id minted once by the tool, so a redo re-creates the same pod.`,
      shortfall: { axis: "width", requiredM: 0, availableM: room.clearWidth }
    };
  }
  const fps = /* @__PURE__ */ new Map();
  const variants = /* @__PURE__ */ new Map();
  for (let i = 0; i < kinds.length; i++) {
    const { footprint, variant } = footprintOf(kinds[i], handedness, input.variantOverrides);
    fps.set(i, footprint);
    variants.set(i, variant);
  }
  const runA = requiredRun(kinds, fps);
  const depthA = requiredDepth(kinds, fps);
  if (runA <= room.clearWidth && depthA.depth <= room.clearDepth) {
    return {
      ok: true,
      arrangement: "single-wall",
      members: _place(kinds, fps, variants, input.memberIds, room, handedness, null)
    };
  }
  const wetIndex = kinds.findIndex((k) => k === "shower" || k === "bath");
  if (wetIndex >= 0) {
    const rest = kinds.filter((_, i) => i !== wetIndex);
    const restFps = /* @__PURE__ */ new Map();
    const restVariants = /* @__PURE__ */ new Map();
    const restIds = [];
    let j = 0;
    for (let i = 0; i < kinds.length; i++) {
      if (i === wetIndex) continue;
      restFps.set(j, fps.get(i));
      restVariants.set(j, variants.get(i));
      restIds.push(input.memberIds[i]);
      j++;
    }
    const wetFp = fps.get(wetIndex);
    const usableWidth = room.clearWidth - wetFp.length;
    const runB = requiredRun(rest, restFps);
    const depthB = requiredDepth(rest, restFps);
    const wetDepthOnReturn = wetFp.width + BATHROOM_POD_CLEARANCES[kinds[wetIndex]].clearFront;
    if (usableWidth > 0 && runB <= usableWidth && depthB.depth <= room.clearDepth && wetDepthOnReturn <= room.clearDepth) {
      return {
        ok: true,
        arrangement: "l-shaped",
        members: _place(kinds, fps, variants, input.memberIds, room, handedness, wetIndex)
      };
    }
  }
  if (runA > room.clearWidth) {
    const hint = kinds.includes("shower") || kinds.includes("bath") ? ` Widen the room to ${m2(runA)} m, or remove the ${kinds.includes("shower") ? "shower" : "bath"} from the module.` : ` Widen the room to ${m2(runA)} m.`;
    return {
      ok: false,
      reason: `This bathroom pod needs ${m2(runA)} m of clear wall (${runBreakdown(kinds, fps)}, including clearances); this room offers ${m2(room.clearWidth)} m.${hint}`,
      shortfall: { axis: "width", requiredM: runA, availableM: room.clearWidth }
    };
  }
  const deepest = depthA;
  const clearFront = BATHROOM_POD_CLEARANCES[deepest.kind].clearFront;
  const body = fps.get(kinds.indexOf(deepest.kind))?.length ?? deepest.depth - clearFront;
  return {
    ok: false,
    reason: `This bathroom pod needs ${m2(deepest.depth)} m of clear depth (${MEMBER_LABEL[deepest.kind]} ${m2(body)} + ${m2(clearFront)} activity space); this room offers ${m2(room.clearDepth)} m. Deepen the room to ${m2(deepest.depth)} m` + (deepest.kind === "wc" ? ", or choose a wall-hung WC (0.58 m deep)." : "."),
    shortfall: { axis: "depth", requiredM: deepest.depth, availableM: room.clearDepth }
  };
}
function _place(kinds, fps, variants, ids, room, handedness, wetIndex) {
  const out = [];
  const mirror = handedness === "right";
  let primaryStart = 0;
  if (wetIndex !== null) {
    const fp = fps.get(wetIndex);
    const localX = mirror ? room.clearWidth : 0;
    const localZ = fp.width / 2;
    out.push({
      id: ids[wetIndex],
      kind: kinds[wetIndex],
      fixtureType: FIXTURE_TYPE_OF[kinds[wetIndex]],
      ...variants.get(wetIndex) !== void 0 ? { variant: variants.get(wetIndex) } : {},
      position: toWorld(room, localX, localZ),
      rotationY: room.rotation + (mirror ? -Math.PI / 2 : Math.PI / 2),
      footprint: { width: fp.width, length: fp.length, height: fp.height },
      wall: mirror ? "right-return" : "left-return"
    });
    primaryStart = mirror ? 0 : fp.length;
  }
  let cursor = primaryStart;
  let previous = null;
  for (let i = 0; i < kinds.length; i++) {
    if (i === wetIndex) continue;
    const kind = kinds[i];
    const fp = fps.get(i);
    if (!podMemberConsumesRun(kind)) {
      const localX2 = mirror ? fp.width / 2 : room.clearWidth - fp.width / 2;
      out.push({
        id: ids[i],
        kind,
        fixtureType: FIXTURE_TYPE_OF[kind],
        ...variants.get(i) !== void 0 ? { variant: variants.get(i) } : {},
        // §PLUMBFRAME (L-11490) — the CONTACT EDGE, on the wall (local Z = 0).
        position: toWorld(room, localX2, 0),
        rotationY: room.rotation,
        footprint: { width: fp.width, length: fp.length, height: fp.height },
        wall: "primary"
      });
      continue;
    }
    if (previous !== null) cursor += podGapBetween(previous, kind);
    const centreLocalX = cursor + fp.width / 2;
    const localX = mirror ? room.clearWidth - centreLocalX : centreLocalX;
    out.push({
      id: ids[i],
      kind,
      fixtureType: FIXTURE_TYPE_OF[kind],
      ...variants.get(i) !== void 0 ? { variant: variants.get(i) } : {},
      // §PLUMBFRAME (founder, 2026-08-26 · L-11490) — THE ANCHOR IS THE
      // WALL-CONTACT EDGE, AND THIS LINE USED TO EMIT THE CENTRE.
      //
      // ⛔ It read `toWorld(room, localX, fp.length / 2)` with the comment *"The
      // fixture's BACK sits on the primary wall (local Z = 0), so its centre is
      // half its depth into the room."* The PREMISE was right and the OUTPUT was
      // the wrong point: every consumer of a `PlumbingFixtureData` — the mesh, the
      // plan symbol, the elevation symbol — reads `position` as the midpoint of
      // the CONTACT EDGE and builds the body over z ∈ [0, length] from there
      // (`PlumbingFixtureFrame.ts`). Emitting the centre pushed every pod member
      // half its own depth further into the room, which is the founder's
      // straddling shower plate at pod scale.
      //
      // ⚠ THE REFUSAL ARITHMETIC IS UNCHANGED, and that is worth stating because
      // it is the obvious thing to fear: `requiredRun` and `requiredDepth` are
      // functions of WIDTHS and DEPTHS, not of where a member's origin sits. The
      // 2.27 m width refusal and the depth refusal quote exactly the same numbers
      // as before — D-3 and D-6 in `bathroomPodLayout.test.ts` pin them.
      position: toWorld(room, localX, 0),
      rotationY: room.rotation,
      footprint: { width: fp.width, length: fp.length, height: fp.height },
      wall: "primary"
    });
    cursor += fp.width;
    previous = kind;
  }
  out.sort(
    (a, b) => BATHROOM_POD_MEMBER_ORDER.indexOf(a.kind) - BATHROOM_POD_MEMBER_ORDER.indexOf(b.kind)
  );
  return out;
}
function buildBathroomPod(id, levelId, input, extras) {
  const solved = solveBathroomPodLayout(input);
  if (!solved.ok) return solved;
  return {
    ok: true,
    pod: {
      id,
      type: "bathroomPod",
      levelId,
      room: input.room,
      handedness: input.handedness,
      members: solved.members,
      arrangement: solved.arrangement,
      ...extras?.mark !== void 0 ? { mark: extras.mark } : {},
      ...extras?.materialId !== void 0 ? { materialId: extras.materialId } : {}
    }
  };
}
function bathroomPodMemberCount(members) {
  return normaliseMembers(members).length;
}

class BathroomPodStore extends Store {
  constructor() {
    super("bathroomPod");
  }
  ids() {
    return [...this.state.keys()];
  }
  get(id) {
    return this.state.get(id);
  }
  /** Every pod on a given storey. O(N) — there are single-digit pods per level. */
  byLevel(levelId) {
    const out = [];
    for (const p of this.state.values()) if (p.levelId === levelId) out.push(p);
    return out;
  }
  /**
   * The member ids a pod owns — the C109 §3.2 / R-5 read model.
   *
   * ⛔ IT COMES FROM THE RECORD, NEVER FROM `root.traverse()`, and the reason is
   * stronger for a pod than for the kitchen run that established the traverse
   * pattern: a pod's members are N SEPARATE `plumbing` records, each built as its
   * own fragment, on a level that may not be the active one. A traverse-discovered
   * list silently drops every member whose fragment has not been built — which for a
   * freshly-loaded project is the COMMON case, not the corner one.
   *
   * Delegates to `bathroomPodChildIds()` so there is ONE derivation, in the pure
   * package, rather than a second copy here that could disagree with it.
   */
  childIdsOf(podId) {
    const pod = this.state.get(podId);
    return pod === void 0 ? [] : bathroomPodChildIds(pod);
  }
  /**
   * The pod that owns a given member id, or `undefined`.
   *
   * ⭐ THE REVERSE INDEX THE DELETE NEEDS. C109 §7 forbids reaping members
   * SPATIALLY (*"delete the fixtures inside this rectangle"* is wrong the moment an
   * architect hand-places a bidet in the same room), so the only correct question is
   * *"which pod names this id?"* — and it must be answerable from the record.
   */
  podOfMember(memberId) {
    for (const p of this.state.values()) {
      for (const m of p.members) if (m.id === memberId) return p;
    }
    return void 0;
  }
}

class PlumbingSystemError extends Error {
  constructor(message) {
    super(message);
    this.name = "PlumbingSystemError";
  }
}
class PlumbingNotFoundError extends PlumbingSystemError {
  constructor(plumbingId) {
    super(`Plumbing element not found: ${plumbingId}`);
    this.plumbingId = plumbingId;
    this.name = "PlumbingNotFoundError";
  }
  plumbingId;
}
class PlumbingSchemaError extends PlumbingSystemError {
  constructor(cause) {
    super(`Plumbing schema validation failed: ${String(cause?.message ?? cause)}`);
    this.cause = cause;
    this.name = "PlumbingSchemaError";
  }
  cause;
}
class BathroomPodFitError extends PlumbingSystemError {
  constructor(reason) {
    super(reason);
    this.name = "BathroomPodFitError";
  }
}
class BathroomPodSchemaError extends PlumbingSystemError {
  constructor(reason) {
    super(`Bathroom pod validation failed: ${reason}`);
    this.name = "BathroomPodSchemaError";
  }
}
class BathroomPodNotFoundError extends PlumbingSystemError {
  constructor(podId) {
    super(`Bathroom pod not found: ${podId}`);
    this.podId = podId;
    this.name = "BathroomPodNotFoundError";
  }
  podId;
}

function isFiniteVec3$3(p) {
  return !!p && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z);
}

class CreatePlumbingHandler {
  type = "plumbing.create";
  affectedStores = ["plumbing"];
  canExecute(_ctx, cmd) {
    if (cmd.origin !== void 0 && !isFiniteVec3$3(cmd.origin)) {
      return { valid: false, reason: "origin must have finite x, y, z" };
    }
    for (const k of ["diameter", "length", "bendRadius"]) {
      const v = cmd[k];
      if (v !== void 0 && (!Number.isFinite(v) || v <= 0)) {
        return { valid: false, reason: `${k} must be > 0` };
      }
    }
    if (cmd.wallThickness !== void 0 && (!Number.isFinite(cmd.wallThickness) || cmd.wallThickness < 0)) {
      return { valid: false, reason: "wallThickness must be ≥ 0" };
    }
    return { valid: true };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      const id = cmd.id ?? createId("plumbing");
      const seed = {
        id,
        levelId: cmd.levelId ?? "",
        kind: cmd.kind ?? "straight",
        origin: cmd.origin ?? { x: 0, y: 0, z: 0 },
        diameter: cmd.diameter ?? 0.05,
        wallThickness: cmd.wallThickness ?? 5e-3,
        length: cmd.length ?? 1,
        bendRadius: cmd.bendRadius ?? 0.075,
        rotation: cmd.rotation ?? 0,
        baseOffset: cmd.baseOffset ?? 0,
        systemTag: cmd.systemTag ?? "cold-water",
        materialId: cmd.materialId
      };
      let p;
      try {
        p = Plumbing.parse(seed);
      } catch (err) {
        throw new PlumbingSchemaError(err);
      }
      const [next, forward, inverse] = produceCommand(ctx.stores.plumbing, (draft) => {
        draft[p.id] = p;
      });
      return { forward, inverse, nextStates: { plumbing: next } };
    });
  }
}

class DeletePlumbingHandler {
  type = "plumbing.delete";
  affectedStores = ["plumbing"];
  canExecute(ctx, cmd) {
    if (typeof cmd.plumbingId !== "string" || cmd.plumbingId.length === 0) {
      return { valid: false, reason: "plumbingId must be a non-empty string" };
    }
    if (!ctx.stores.plumbing[cmd.plumbingId]) {
      return { valid: false, reason: `plumbing not found: ${cmd.plumbingId}` };
    }
    return { valid: true };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      if (!ctx.stores.plumbing[cmd.plumbingId]) throw new PlumbingNotFoundError(cmd.plumbingId);
      const [next, forward, inverse] = produceCommand(ctx.stores.plumbing, (draft) => {
        delete draft[cmd.plumbingId];
      });
      return { forward, inverse, nextStates: { plumbing: next } };
    });
  }
}

const PLUMBING_MOVE_UNREACHABLE = "plumbing.move writes the detached plugin plumbing store that nothing renders, exports or persists. It is the ORIGINAL L-220 defect: this handler shadowed the legacy bridge, rejected the gizmo's { id, to } payload at canExecute, and the founder's moved toilet never reached the 2-D plan. Moving a fixture commits through plumbing.moveFixture (payload keys: id, to) → MovePlumbingCommand → the geometry plumbingStore, the DISTINCT verb minted to un-shadow that bridge.";
class MovePlumbingHandler {
  type = "plumbing.move";
  affectedStores = ["plumbing"];
  /** Payload validation ONLY — kept public so a delegating facade can reuse it. */
  validatePayload(ctx, cmd) {
    if (typeof cmd.plumbingId !== "string" || cmd.plumbingId.length === 0) {
      return { valid: false, reason: "plumbingId must be a non-empty string" };
    }
    if (!cmd.delta || !Number.isFinite(cmd.delta.x) || !Number.isFinite(cmd.delta.y) || !Number.isFinite(cmd.delta.z)) {
      return { valid: false, reason: "delta must have finite x, y, z" };
    }
    if (!ctx.stores.plumbing[cmd.plumbingId]) {
      return { valid: false, reason: `plumbing not found: ${cmd.plumbingId}` };
    }
    return { valid: true };
  }
  /**
   * §FIX-DEAD-MOVE-VERB-REFUSE (W3-4) — ORDER IS LOAD-BEARING. `canExecute` must be the
   * LAST method before `execute`. `tools/ga-gate/check-verb-register.ts` classifies a
   * verb as REFUSES by slicing the source from `canExecute` to the next `execute(` and
   * checking that the slice can never yield an ACCEPTING validation result. With
   * `validatePayload` sitting between them, its accepting branch lands inside that slice
   * and the verb is mis-reported as UNKNOWN — a refusal hiding from the register that
   * exists to find it. (For the same reason this comment must not spell the accepting
   * literal out: the detector is a regex over source text, and prose is source text.)
   * Do not reorder these two methods.
   */
  canExecute(ctx, cmd) {
    const v = this.validatePayload(ctx, cmd);
    if (!v.valid) return v;
    return { valid: false, reason: PLUMBING_MOVE_UNREACHABLE };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      if (!ctx.stores.plumbing[cmd.plumbingId]) throw new PlumbingNotFoundError(cmd.plumbingId);
      const [next, forward, inverse] = produceCommand(ctx.stores.plumbing, (draft) => {
        const p = draft[cmd.plumbingId];
        if (!p) return;
        p.origin.x += cmd.delta.x;
        p.origin.y += cmd.delta.y;
        p.origin.z += cmd.delta.z;
      });
      return { forward, inverse, nextStates: { plumbing: next } };
    });
  }
}

class SetPlumbingSystemHandler {
  type = "plumbing.setSystem";
  affectedStores = ["plumbing"];
  canExecute(ctx, cmd) {
    if (typeof cmd.systemTag !== "string" || cmd.systemTag.length === 0) {
      return { valid: false, reason: "systemTag must be a non-empty string" };
    }
    if (!ctx.stores.plumbing[cmd.plumbingId]) {
      return { valid: false, reason: `plumbing not found: ${cmd.plumbingId}` };
    }
    return { valid: true };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      if (!ctx.stores.plumbing[cmd.plumbingId]) throw new PlumbingNotFoundError(cmd.plumbingId);
      const [next, forward, inverse] = produceCommand(ctx.stores.plumbing, (draft) => {
        const p = draft[cmd.plumbingId];
        if (p) p.systemTag = cmd.systemTag;
      });
      return { forward, inverse, nextStates: { plumbing: next } };
    });
  }
}

const CreatePlumbingFixtureHandler = {
  type: "plumbing.createFixture",
  affectedStores: [],
  canExecute(_ctx, cmd) {
    if (!cmd.fixtureType) return { valid: false, reason: "fixtureType is required" };
    return { valid: true };
  },
  execute(_ctx, cmd) {
    return withHandlerSpan("plumbing.createFixture.handler", { "pryzm.command.type": "plumbing.createFixture" }, () => {
      const cm = window.commandManager;
      if (cm) {
        try {
          cm.execute(new CreatePlumbingFixtureCommand(cmd));
        } catch (e) {
          console.error("[plumbing.createFixture.handler] bridge failed:", e);
        }
      }
      return { forward: [], inverse: [] };
    });
  }
};

const PLUMBING_MATERIAL_UNREACHABLE = "The plumbing builder honours `data.color` for the BATH fixture only (createBathMesh); sink, toilet, urinal, bidet, shower and accessory meshes hardcode their ceramic/chrome colours. Applying a material would work on one fixture type in six and silently do nothing on the other five — and this verb writes the detached plugin DTO store in any case. Tracked under Gate G7.";
class SetPlumbingMaterialHandler {
  type = "plumbing.setMaterial";
  affectedStores = ["plumbing"];
  canExecute(ctx, cmd) {
    if (typeof cmd.plumbingId !== "string" || cmd.plumbingId.length === 0) {
      return { valid: false, reason: "plumbingId must be a non-empty string" };
    }
    if (cmd.materialId === void 0 && cmd.materialColor === void 0) {
      return { valid: false, reason: "at least one of materialId / materialColor must be provided" };
    }
    if (cmd.materialColor !== void 0 && cmd.materialColor.length === 0) {
      return { valid: false, reason: "materialColor must be non-empty when provided" };
    }
    if (cmd.materialId !== void 0 && cmd.materialId !== null && cmd.materialId.length === 0) {
      return { valid: false, reason: "materialId must be non-empty when provided" };
    }
    if (!ctx.stores.plumbing[cmd.plumbingId]) {
      return { valid: false, reason: `plumbing not found: ${cmd.plumbingId}` };
    }
    return { valid: false, reason: PLUMBING_MATERIAL_UNREACHABLE };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      if (!ctx.stores.plumbing[cmd.plumbingId]) throw new PlumbingNotFoundError(cmd.plumbingId);
      const [next, forward, inverse] = produceCommand(ctx.stores.plumbing, (draft) => {
        const p = draft[cmd.plumbingId];
        if (!p) return;
        if (cmd.materialId === null) delete p.materialId;
        else if (cmd.materialId !== void 0) p.materialId = cmd.materialId;
      });
      return { forward, inverse, nextStates: { plumbing: next } };
    });
  }
}

class ChangePlumbingLevelHandler {
  type = "plumbing.changeLevel";
  // The EXACT key the rest of this plugin's handlers declare, and the exact key
  // `buildUndoStoreMap()` binds to the legacy geometry store
  // (`apps/editor/src/engine/undo/performUndoRedo.ts:345` —
  // `plumbing:       w.plumbingStore,`). A key absent from that map makes
  // `_covered()` false, `performUndo` skips the ring buffer and falls through to
  // commandManager, and Ctrl+Z reports "history empty" (the OI-054 bug).
  affectedStores = ["plumbing"];
  canExecute(ctx, cmd) {
    if (typeof cmd.plumbingId !== "string" || cmd.plumbingId.length === 0) {
      return { valid: false, reason: "plumbingId must be a non-empty string" };
    }
    if (typeof cmd.levelId !== "string" || cmd.levelId.length === 0) {
      return { valid: false, reason: "levelId must be a non-empty string" };
    }
    if (!Object.prototype.hasOwnProperty.call(ctx.stores.plumbing, cmd.plumbingId)) {
      return { valid: false, reason: `plumbing not found: ${cmd.plumbingId}` };
    }
    if (ctx.stores.plumbing[cmd.plumbingId]?.levelId === cmd.levelId) {
      return {
        valid: false,
        reason: `plumbing ${cmd.plumbingId} is already on level ${cmd.levelId}`
      };
    }
    return { valid: true };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      const [next, forward, inverse] = produceCommand(ctx.stores.plumbing, (draft) => {
        const p = draft[cmd.plumbingId];
        if (p === void 0) return;
        p.levelId = cmd.levelId;
      });
      return { forward, inverse, nextStates: { plumbing: next } };
    });
  }
}

class CreateBathroomPodHandler {
  type = "bathroomPod.create";
  /**
   * ONE store — the truthful write set (C03 §4.6 U-2, and the header's two
   * measurements). ⛔ Do not add `'plumbing'`: it resolves to the PIPE DTO store on
   * write and to the LEGACY FIXTURE store on undo, which is U-2b's corrupting case.
   */
  affectedStores = ["bathroomPod"];
  canExecute(ctx, cmd) {
    if (typeof cmd.podId !== "string" || cmd.podId.length === 0) {
      return { valid: false, reason: "podId must be a non-empty string" };
    }
    if (ctx.stores.bathroomPod[cmd.podId]) {
      return { valid: false, reason: `duplicate bathroom pod id: ${cmd.podId}` };
    }
    if (typeof cmd.levelId !== "string" || cmd.levelId.length === 0) {
      return { valid: false, reason: "levelId must be a non-empty string" };
    }
    const kinds = cmd.members ?? BATHROOM_POD_DEFAULT_MEMBERS;
    const expected = bathroomPodMemberCount(kinds);
    if (!Array.isArray(cmd.memberIds) || cmd.memberIds.length !== expected) {
      return {
        valid: false,
        reason: `expected ${expected} pre-minted member id(s) for this member set, got ${Array.isArray(cmd.memberIds) ? cmd.memberIds.length : 0}`
      };
    }
    const built = buildBathroomPod(cmd.podId, cmd.levelId, this._inputOf(cmd));
    if (!built.ok) return { valid: false, reason: built.reason };
    const checked = validateBathroomPod(built.pod);
    if (!checked.ok) return { valid: false, reason: checked.reason };
    return { valid: true };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      const built = buildBathroomPod(cmd.podId, cmd.levelId, this._inputOf(cmd), {
        ...cmd.mark !== void 0 ? { mark: cmd.mark } : {},
        ...cmd.materialId !== void 0 ? { materialId: cmd.materialId } : {}
      });
      if (!built.ok) {
        throw new BathroomPodFitError(built.reason);
      }
      const checked = validateBathroomPod(built.pod);
      if (!checked.ok) throw new BathroomPodSchemaError(checked.reason);
      const pod = checked.value;
      const [next, forward, inverse] = produceCommand(
        ctx.stores.bathroomPod,
        (draft) => {
          draft[pod.id] = pod;
        }
      );
      return { forward, inverse, nextStates: { bathroomPod: next } };
    });
  }
  /**
   * The solver input, built ONCE and used by BOTH `canExecute` and `execute`.
   *
   * ⛔ If these two ever build different inputs, `canExecute` is validating a pod
   * the command does not create — the class of defect this repo has now recorded in
   * three families. One method, both callers.
   */
  _inputOf(cmd) {
    return {
      room: cmd.room,
      handedness: cmd.handedness,
      members: cmd.members ?? BATHROOM_POD_DEFAULT_MEMBERS,
      memberIds: cmd.memberIds,
      ...cmd.variantOverrides !== void 0 ? { variantOverrides: cmd.variantOverrides } : {}
    };
  }
}

class DeleteBathroomPodHandler {
  type = "bathroomPod.delete";
  /** The same ONE store the create wrote — the delete must be able to undo it. */
  affectedStores = ["bathroomPod"];
  canExecute(ctx, cmd) {
    if (typeof cmd.podId !== "string" || cmd.podId.length === 0) {
      return { valid: false, reason: "podId must be a non-empty string" };
    }
    if (!ctx.stores.bathroomPod[cmd.podId]) {
      return { valid: false, reason: `bathroom pod not found: ${cmd.podId}` };
    }
    return { valid: true };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(
      this.type + ".handler",
      { "pryzm.command.type": this.type },
      (span) => {
        const pod = ctx.stores.bathroomPod[cmd.podId];
        if (!pod) throw new BathroomPodNotFoundError(cmd.podId);
        span.setAttribute("pryzm.bathroom_pod.members_reaped", pod.members.length);
        const [next, forward, inverse] = produceCommand(
          ctx.stores.bathroomPod,
          (draft) => {
            delete draft[cmd.podId];
          }
        );
        return { forward, inverse, nextStates: { bathroomPod: next } };
      }
    );
  }
}

function buildBathroomPodHandlerSet() {
  return [
    new CreateBathroomPodHandler(),
    new DeleteBathroomPodHandler()
  ];
}
function buildPlumbingHandlerSet() {
  return [
    new CreatePlumbingHandler(),
    new DeletePlumbingHandler(),
    new MovePlumbingHandler(),
    new SetPlumbingSystemHandler(),
    CreatePlumbingFixtureHandler,
    new SetPlumbingMaterialHandler(),
    new ChangePlumbingLevelHandler(),
    // §BATH102 — the pod's two verbs, from the ONE set that declares them.
    ...buildBathroomPodHandlerSet()
  ];
}

class LightingStore extends Store {
  constructor() {
    super("lighting");
  }
  ids() {
    return [...this.state.keys()];
  }
  byLevel(levelId) {
    const out = [];
    for (const l of this.state.values()) if (l.levelId === levelId) out.push(l);
    return out;
  }
  emergency() {
    const out = [];
    for (const l of this.state.values()) if (l.isEmergency) out.push(l);
    return out;
  }
  get(id) {
    return this.state.get(id);
  }
}

class LightingSystemError extends Error {
  constructor(message) {
    super(message);
    this.name = "LightingSystemError";
  }
}
class LightingNotFoundError extends LightingSystemError {
  constructor(lightingId) {
    super(`Lighting fixture not found: ${lightingId}`);
    this.lightingId = lightingId;
    this.name = "LightingNotFoundError";
  }
  lightingId;
}
class LightingSchemaError extends LightingSystemError {
  constructor(cause) {
    super(`Lighting schema validation failed: ${String(cause?.message ?? cause)}`);
    this.cause = cause;
    this.name = "LightingSchemaError";
  }
  cause;
}

function isFiniteVec3$2(p) {
  return !!p && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z);
}

class CreateLightingHandler {
  type = "lighting.create";
  affectedStores = ["lighting"];
  canExecute(_ctx, cmd) {
    if (cmd.origin !== void 0 && !isFiniteVec3$2(cmd.origin)) {
      return { valid: false, reason: "origin must have finite x, y, z" };
    }
    for (const k of ["width", "depth", "thickness"]) {
      const v = cmd[k];
      if (v !== void 0 && (!Number.isFinite(v) || v <= 0)) {
        return { valid: false, reason: `${k} must be > 0` };
      }
    }
    if (cmd.intensity !== void 0 && (!Number.isFinite(cmd.intensity) || cmd.intensity < 0)) {
      return { valid: false, reason: "intensity must be ≥ 0" };
    }
    if (cmd.range !== void 0 && (!Number.isFinite(cmd.range) || cmd.range < 0)) {
      return { valid: false, reason: "range must be ≥ 0" };
    }
    return { valid: true };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      const id = cmd.id ?? createId("lighting");
      const seed = {
        id,
        levelId: cmd.levelId ?? "",
        kind: cmd.kind ?? "downlight",
        origin: cmd.origin ?? { x: 0, y: 0, z: 0 },
        width: cmd.width ?? 0.2,
        depth: cmd.depth ?? 0.2,
        thickness: cmd.thickness ?? 0.05,
        dropLength: cmd.dropLength ?? 0,
        range: cmd.range ?? 6,
        // §FEAT-FIXTURE-PHOTOMETRY (2026-08-06) — `intensity` is now an OPTIONAL
        // explicit override on the schema; when the caller does not supply one it
        // must stay absent so the committer derives brightness from `lumens`.
        // (`?? 1` here would stamp every fixture with the physically negligible
        // legacy 1 candela and defeat the photometry path.)
        intensity: cmd.intensity,
        color: cmd.color ?? [1, 1, 1],
        isEmergency: cmd.isEmergency ?? false,
        rotation: cmd.rotation ?? 0,
        materialId: cmd.materialId
      };
      let l;
      try {
        l = Lighting.parse(seed);
      } catch (err) {
        throw new LightingSchemaError(err);
      }
      const [next, forward, inverse] = produceCommand(ctx.stores.lighting, (draft) => {
        draft[l.id] = l;
      });
      return { forward, inverse, nextStates: { lighting: next } };
    });
  }
}

class DeleteLightingHandler {
  type = "lighting.delete";
  affectedStores = ["lighting"];
  canExecute(ctx, cmd) {
    if (typeof cmd.lightingId !== "string" || cmd.lightingId.length === 0) {
      return { valid: false, reason: "lightingId must be a non-empty string" };
    }
    if (!ctx.stores.lighting[cmd.lightingId]) {
      return { valid: false, reason: `lighting not found: ${cmd.lightingId}` };
    }
    return { valid: true };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      if (!ctx.stores.lighting[cmd.lightingId]) throw new LightingNotFoundError(cmd.lightingId);
      const [next, forward, inverse] = produceCommand(ctx.stores.lighting, (draft) => {
        delete draft[cmd.lightingId];
      });
      return { forward, inverse, nextStates: { lighting: next } };
    });
  }
}

const LIGHTING_MOVE_UNREACHABLE = 'lighting.move writes the detached plugin lighting store that nothing renders, exports or persists — and unlike the other families there is NO live alternative to point you at. Lighting is absent from MOVE_COMMAND_BY_TYPE and from every dragDispatch site; MOVE_UNSUPPORTED_REASON already states it outright ("Lighting fixtures have no move command on any surface yet — tracked under Gate G7"), and the Move button is capability-gated off for that reason. A live route needs a bridge from a lighting move verb to the geometry lightingStore that initBuilders constructs and ProjectSerializer persists. Until Gate G7 mints one, moving a light cannot be committed by any path.';
class MoveLightingHandler {
  type = "lighting.move";
  affectedStores = ["lighting"];
  /** Payload validation ONLY — kept public so a delegating facade can reuse it. */
  validatePayload(ctx, cmd) {
    if (typeof cmd.lightingId !== "string" || cmd.lightingId.length === 0) {
      return { valid: false, reason: "lightingId must be a non-empty string" };
    }
    if (!cmd.delta || !Number.isFinite(cmd.delta.x) || !Number.isFinite(cmd.delta.y) || !Number.isFinite(cmd.delta.z)) {
      return { valid: false, reason: "delta must have finite x, y, z" };
    }
    if (!ctx.stores.lighting[cmd.lightingId]) {
      return { valid: false, reason: `lighting not found: ${cmd.lightingId}` };
    }
    return { valid: true };
  }
  /**
   * §FIX-DEAD-MOVE-VERB-REFUSE (W3-4) — ORDER IS LOAD-BEARING. `canExecute` must be the
   * LAST method before `execute`. `tools/ga-gate/check-verb-register.ts` classifies a
   * verb as REFUSES by slicing the source from `canExecute` to the next `execute(` and
   * checking that the slice can never yield an ACCEPTING validation result. With
   * `validatePayload` sitting between them, its accepting branch lands inside that slice
   * and the verb is mis-reported as UNKNOWN — a refusal hiding from the register that
   * exists to find it. (For the same reason this comment must not spell the accepting
   * literal out: the detector is a regex over source text, and prose is source text.)
   * Do not reorder these two methods.
   */
  canExecute(ctx, cmd) {
    const v = this.validatePayload(ctx, cmd);
    if (!v.valid) return v;
    return { valid: false, reason: LIGHTING_MOVE_UNREACHABLE };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      if (!ctx.stores.lighting[cmd.lightingId]) throw new LightingNotFoundError(cmd.lightingId);
      const [next, forward, inverse] = produceCommand(ctx.stores.lighting, (draft) => {
        const l = draft[cmd.lightingId];
        if (!l) return;
        l.origin.x += cmd.delta.x;
        l.origin.y += cmd.delta.y;
        l.origin.z += cmd.delta.z;
      });
      return { forward, inverse, nextStates: { lighting: next } };
    });
  }
}

class SetLightingIntensityHandler {
  type = "lighting.setIntensity";
  affectedStores = ["lighting"];
  canExecute(ctx, cmd) {
    if (!ctx.stores.lighting[cmd.lightingId]) {
      return { valid: false, reason: `lighting not found: ${cmd.lightingId}` };
    }
    if (cmd.intensity !== void 0 && (!Number.isFinite(cmd.intensity) || cmd.intensity < 0)) {
      return { valid: false, reason: "intensity must be ≥ 0" };
    }
    if (cmd.range !== void 0 && (!Number.isFinite(cmd.range) || cmd.range < 0)) {
      return { valid: false, reason: "range must be ≥ 0" };
    }
    if (cmd.color !== void 0) {
      if (!Array.isArray(cmd.color) || cmd.color.length !== 3) {
        return { valid: false, reason: "color must be [r,g,b] tuple" };
      }
      for (const c of cmd.color) if (!Number.isFinite(c) || c < 0 || c > 1) {
        return { valid: false, reason: "color channels must be in [0,1]" };
      }
    }
    return { valid: true };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      if (!ctx.stores.lighting[cmd.lightingId]) throw new LightingNotFoundError(cmd.lightingId);
      const [next, forward, inverse] = produceCommand(ctx.stores.lighting, (draft) => {
        const l = draft[cmd.lightingId];
        if (!l) return;
        if (cmd.intensity !== void 0) l.intensity = cmd.intensity;
        if (cmd.range !== void 0) l.range = cmd.range;
        if (cmd.color !== void 0) l.color = [...cmd.color];
      });
      return { forward, inverse, nextStates: { lighting: next } };
    });
  }
}

class SetLightingEmergencyHandler {
  type = "lighting.setEmergency";
  affectedStores = ["lighting"];
  canExecute(ctx, cmd) {
    if (typeof cmd.isEmergency !== "boolean") return { valid: false, reason: "isEmergency must be boolean" };
    if (!ctx.stores.lighting[cmd.lightingId]) {
      return { valid: false, reason: `lighting not found: ${cmd.lightingId}` };
    }
    return { valid: true };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      if (!ctx.stores.lighting[cmd.lightingId]) throw new LightingNotFoundError(cmd.lightingId);
      const [next, forward, inverse] = produceCommand(ctx.stores.lighting, (draft) => {
        const l = draft[cmd.lightingId];
        if (l) l.isEmergency = cmd.isEmergency;
      });
      return { forward, inverse, nextStates: { lighting: next } };
    });
  }
}

const LIGHTING_MATERIAL_UNREACHABLE = "LightingData has no materialId/materialColor. A light fixture's colour lives in its per-fixture parameter blocks (downlightParams.color, pendantParams.shadeColor, emission.color, …) — a different field name per fixture type — so there is nothing a single material verb can write. This needs a per-fixture-part colour command, tracked under Gate G7.";
class SetLightingMaterialHandler {
  type = "lighting.setMaterial";
  affectedStores = ["lighting"];
  canExecute(ctx, cmd) {
    if (typeof cmd.lightingId !== "string" || cmd.lightingId.length === 0) {
      return { valid: false, reason: "lightingId must be a non-empty string" };
    }
    if (cmd.materialId === void 0 && cmd.materialColor === void 0) {
      return { valid: false, reason: "at least one of materialId / materialColor must be provided" };
    }
    if (cmd.materialColor !== void 0 && cmd.materialColor.length === 0) {
      return { valid: false, reason: "materialColor must be non-empty when provided" };
    }
    if (cmd.materialId !== void 0 && cmd.materialId !== null && cmd.materialId.length === 0) {
      return { valid: false, reason: "materialId must be non-empty when provided" };
    }
    if (!ctx.stores.lighting[cmd.lightingId]) {
      return { valid: false, reason: `lighting not found: ${cmd.lightingId}` };
    }
    return { valid: false, reason: LIGHTING_MATERIAL_UNREACHABLE };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      if (!ctx.stores.lighting[cmd.lightingId]) throw new LightingNotFoundError(cmd.lightingId);
      const [next, forward, inverse] = produceCommand(ctx.stores.lighting, (draft) => {
        const l = draft[cmd.lightingId];
        if (!l) return;
        if (cmd.materialId === null) delete l.materialId;
        else if (cmd.materialId !== void 0) l.materialId = cmd.materialId;
      });
      return { forward, inverse, nextStates: { lighting: next } };
    });
  }
}

class ChangeLightingLevelHandler {
  type = "lighting.changeLevel";
  // The EXACT key the rest of this plugin's handlers declare, and the exact key
  // `buildUndoStoreMap()` binds to the legacy geometry store
  // (`apps/editor/src/engine/undo/performUndoRedo.ts:346` —
  // `lighting:       w.lightingStore,`). A key absent from that map makes
  // `_covered()` false, `performUndo` skips the ring buffer and falls through to
  // commandManager, and Ctrl+Z reports "history empty" (the OI-054 bug).
  affectedStores = ["lighting"];
  canExecute(ctx, cmd) {
    if (typeof cmd.lightingId !== "string" || cmd.lightingId.length === 0) {
      return { valid: false, reason: "lightingId must be a non-empty string" };
    }
    if (typeof cmd.levelId !== "string" || cmd.levelId.length === 0) {
      return { valid: false, reason: "levelId must be a non-empty string" };
    }
    if (!Object.prototype.hasOwnProperty.call(ctx.stores.lighting, cmd.lightingId)) {
      return { valid: false, reason: `lighting not found: ${cmd.lightingId}` };
    }
    if (ctx.stores.lighting[cmd.lightingId]?.levelId === cmd.levelId) {
      return {
        valid: false,
        reason: `lighting ${cmd.lightingId} is already on level ${cmd.levelId}`
      };
    }
    return { valid: true };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      const [next, forward, inverse] = produceCommand(ctx.stores.lighting, (draft) => {
        const l = draft[cmd.lightingId];
        if (l === void 0) return;
        l.levelId = cmd.levelId;
      });
      return { forward, inverse, nextStates: { lighting: next } };
    });
  }
}

function buildLightingHandlerSet() {
  return [
    new CreateLightingHandler(),
    new DeleteLightingHandler(),
    new MoveLightingHandler(),
    new SetLightingIntensityHandler(),
    new SetLightingEmergencyHandler(),
    new SetLightingMaterialHandler(),
    new ChangeLightingLevelHandler()
  ];
}

class RoomsPluginStore extends Store {
  constructor() {
    super("room");
  }
  /** Convenience read — every room id currently in the store. */
  ids() {
    return [...this.state.keys()];
  }
  /** Convenience read — every room on a given level.  O(N). */
  byLevel(levelId) {
    const out = [];
    for (const r of this.state.values()) {
      if (r.levelId === levelId) out.push(r);
    }
    return out;
  }
  /** Lookup by id; returns `undefined` when missing. */
  get(id) {
    return this.state.get(id);
  }
}

class RoomSystemError extends Error {
  constructor(message) {
    super(message);
    this.name = "RoomSystemError";
  }
}
class RoomSeedError extends RoomSystemError {
  constructor(reason) {
    super(`Invalid room seed point: ${reason}`);
    this.reason = reason;
    this.name = "RoomSeedError";
  }
  reason;
}

function validateRoomSeed(seed) {
  if (seed === null || seed === void 0) {
    return { ok: false, reason: "seedPoint is required for wallBound rooms" };
  }
  if (!Number.isFinite(seed.x) || !Number.isFinite(seed.y) || !Number.isFinite(seed.z)) {
    return { ok: false, reason: "seedPoint components must be finite" };
  }
  return { ok: true };
}
function recomputeRoomAnalytic(room, walls) {
  if (room.boundaryMode === "wallBound") {
    const v = validateRoomSeed(room.seedPoint);
    if (!v.ok) throw new RoomSeedError(v.reason);
  }
  const ctx = { walls };
  try {
    const a = analyseRoom(room, ctx);
    return {
      area: a.area,
      perimeter: a.perimeter,
      boundingElementIds: a.boundingWallIds,
      boundingWallIds: a.boundingWallIds
    };
  } catch {
    return void 0;
  }
}

const undeterminedBoth = (roomId, reason, detail) => ({
  roomId,
  forward: { kind: "undetermined", scope: `boundary recompute of room ${roomId}`, reason, detail },
  inverse: {
    kind: "undetermined",
    scope: `undo of the boundary recompute of room ${roomId}`,
    reason,
    detail
  },
  changed: false
});
const numberOr = (v, fallback) => typeof v === "number" && Number.isFinite(v) ? v : fallback;
const idsOf = (v) => Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
const sameIds = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
const AREA_EPSILON_M2 = 1e-6;
const LENGTH_EPSILON_M = 1e-3;
function determineRoomBoundaryRecompute(input) {
  const { roomId } = input;
  if (input.rooms === void 0) {
    return undeterminedBoth(
      roomId,
      "RELATIONSHIP_NOT_READABLE",
      'the room store could not be read (absent, no callable getAll, threw, or returned a non-array) — nothing was read, which is NOT the same as "this project holds no rooms"'
    );
  }
  if (input.walls === void 0) {
    return undeterminedBoth(
      roomId,
      "RELATIONSHIP_NOT_READABLE",
      "the wall store could not be read — a room boundary is traced FROM walls, so an unreadable wall set leaves the boundary undetermined, NOT unchanged"
    );
  }
  const room = input.rooms.find((r) => r.id === roomId);
  if (room === void 0) {
    return undeterminedBoth(
      roomId,
      "INVALID_REQUEST",
      `the room store was read successfully (${input.rooms.length} room(s)) and holds no room with id '${roomId}'. The id may name a different element kind, or a room that was already deleted.`
    );
  }
  const raw = room;
  if (raw.boundaryMode === "wallBound") {
    const seed = raw.seedPoint;
    const seedUsable = seed !== null && seed !== void 0 && Number.isFinite(seed.x) && Number.isFinite(seed.y) && Number.isFinite(seed.z);
    if (!seedUsable) {
      return undeterminedBoth(
        roomId,
        "RELATIONSHIP_NOT_RECORDED",
        `room '${roomId}' declares boundaryMode 'wallBound' but carries no usable seedPoint. The seed is the input that records WHICH enclosed region this room occupies; without it there is no point to flood-fill from and no boundary can be traced. Nothing recorded it — this is not a geometry failure.`
      );
    }
  }
  const before = {
    area: numberOr(raw.area, 0),
    perimeter: numberOr(raw.perimeter, 0),
    boundingWallIds: idsOf(raw.boundingWallIds)
  };
  const analyse = input.analyse ?? recomputeRoomAnalytic;
  let update;
  try {
    update = analyse(room, input.walls);
  } catch (err) {
    return undeterminedBoth(
      roomId,
      "GEOMETRY_UNPREDICTABLE",
      `the boundary trace for room '${roomId}' threw: ` + (err instanceof Error ? err.message : String(err))
    );
  }
  if (update === void 0) {
    return undeterminedBoth(
      roomId,
      "GEOMETRY_UNPREDICTABLE",
      `the boundary trace for room '${roomId}' ran and could not produce a closed ring (no walls on the room's level, a chain that does not close, or a ring of (near-)zero area). The previous analytic is LEFT INTACT rather than zeroed — a boundary that could not be traced is undetermined, not empty.`
    );
  }
  const after = {
    area: update.area,
    perimeter: update.perimeter,
    boundingWallIds: [...update.boundingWallIds]
  };
  const moved = Math.abs(after.area - before.area) > AREA_EPSILON_M2 || Math.abs(after.perimeter - before.perimeter) > LENGTH_EPSILON_M || !sameIds(before.boundingWallIds, after.boundingWallIds);
  const elements = moved ? [roomId] : [];
  return {
    roomId,
    forward: { kind: "determined", elements },
    inverse: { kind: "determined", elements },
    changed: moved,
    before,
    after
  };
}

function whyNotACompleteRoom(cmd) {
  const missing = [];
  if (typeof cmd.id !== "string" || cmd.id.length === 0) missing.push("id");
  if (typeof cmd.levelId !== "string" || cmd.levelId.length === 0) missing.push("levelId");
  const poly = cmd.boundary?.polygon;
  if (!Array.isArray(poly) || poly.length < 3) missing.push("boundary.polygon (≥3 vertices)");
  if (cmd.computed === null || typeof cmd.computed !== "object") missing.push("computed");
  if (cmd.metadata === null || typeof cmd.metadata !== "object") missing.push("metadata");
  if (missing.length === 0) return null;
  return "room.create needs a COMPLETE RoomData record and this payload is missing: " + missing.join(", ") + ". `computed` (area/grossArea/perimeter/volume/centroid/boundingBox) and `metadata` are DERIVED — this plugin will not re-derive them, because a rival derivation would silently disagree with the one the area schedules, the room label renderer and the IFC exporter read. Either send the complete record (the shape apps/editor/src/engine/views/plantools/RoomPlanToolHandler.ts:114 sends, which CreateRoomCommand accepts verbatim), or — for a wall-bound room — dispatch `room.redetect` { levelId }, which runs ReDetectRoomsCommand and derives the boundary from the wall graph.";
}
function buildEngineAbsentRefusal(cmd) {
  const named = typeof cmd.name === "string" && cmd.name.length > 0 ? ` '${cmd.name}'` : "";
  return capabilityRefused({
    commandType: "room.create",
    reason: "ENGINE_NOT_AVAILABLE",
    asked: 1,
    unaccountedFor: 1,
    protects: "the registration work CreateRoomCommand (@pryzm/command-registry) performs in the §R-3 order and a plugin-local roomStore.add() would skip — unique room-number assignment (assignUniqueRoomNumber), bimManager.registerElement spatial registration, and elementRegistry.registerSemantic. A room minted without those is a record the area schedules, the room-label renderer and the IFC exporter cannot account for, which is a lie about WHAT THE MODEL IS rather than about whether something moved",
    detail: `room.create was asked to create 1 room${named}, and 1 could not be created. The legacy command manager is not present in this process, so the ONLY path to authoritative room state is absent. This is not a no-op and not a silent success: nothing was written. THE ASK: create 1 room from a complete RoomData record. THE BLOCKER: CreateRoomCommand needs the engine half — a BimManager level authority plus an attached RoomStore — which apps/editor/src/engine/initBuilders.ts wires at boot (roomStore.attachEngine, §ADR-0318-ELEMENTS-SLOT) and apps/editor/src/engine/initTools.ts:3254 exposes as window.commandManager. A composed runtime without that half cannot create a room, and this plugin will not write one locally: doing so would mint a rival creation path that skips the registrations named in \`protects\`. In a browser session both are present and this verb delegates normally — see plugins/rooms/__tests__/roomCreateEngineRefusal.test.ts, whose last case proves exactly that.`
  });
}
class CreateRoomHandler {
  type = "room.create";
  /**
   * §FIX-ROOM-CREATE-STORE-KEY — `[]`, matching every sibling bridge in this
   * directory. The authoritative write is `CreateRoomCommand` and undo lives on
   * the legacy stack with it; producing an Immer patch over the plugin `RoomsState`
   * would recreate the storeKey mismatch AND write into a store nothing reads.
   */
  affectedStores = [];
  canExecute(_ctx, cmd) {
    if (cmd.type !== void 0 && cmd.type !== "room") {
      return { valid: false, reason: `room.create: type must be "room" (got ${String(cmd.type)})` };
    }
    if (typeof cmd.name === "string" && cmd.name.length > 256) {
      return { valid: false, reason: "room.create: name must be ≤ 256 characters" };
    }
    const why = whyNotACompleteRoom(cmd);
    if (why !== null) return { valid: false, reason: why };
    return { valid: true };
  }
  execute(_ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      const cm = typeof window === "undefined" ? void 0 : window.commandManager;
      if (!cm) {
        const refusal = buildEngineAbsentRefusal(cmd);
        console.warn("[room.create.handler] REFUSED —", refusal.detail);
        return { forward: [], inverse: [], refusal };
      }
      let result;
      try {
        result = cm.execute(new CreateRoomCommand(cmd));
      } catch (e) {
        console.error("[room.create.handler] CreateRoomCommand bridge failed:", e);
        throw e instanceof Error ? e : new Error(String(e));
      }
      if (result && result.success === false) {
        throw new Error(
          `room.create: CreateRoomCommand refused — ${result.error ?? "no reason given"}`
        );
      }
      return { forward: [], inverse: [] };
    });
  }
}

class DeleteRoomHandler {
  type = "room.delete";
  // Bridges to the legacy command manager — this handler mutates NO plugin store
  // (matches RenameRoomHandler's `affectedStores: []`).
  affectedStores = [];
  canExecute(_ctx, cmd) {
    if (typeof cmd.roomId !== "string" || cmd.roomId.length === 0) {
      return { valid: false, reason: "roomId must be a non-empty string" };
    }
    return { valid: true };
  }
  execute(_ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      if (!window.__pryzmInitComplete) {
        throw new Error(
          "room.delete: the engine is not initialised yet, so nothing was changed. Wait for the project to finish loading and try again."
        );
      }
      const cm = window.commandManager;
      if (!cm) {
        throw new Error(
          "room.delete: the legacy command manager is not available, so the change could not be applied."
        );
      }
      if (cm) {
        try {
          cm.execute(new DeleteRoomCommand(cmd.roomId));
        } catch (e) {
          console.error("[room.delete.handler] bridge failed:", e);
          throw e instanceof Error ? e : new Error(String(e));
        }
      }
      return { forward: [], inverse: [] };
    });
  }
}

class MoveRoomHandler {
  type = "room.move";
  // Bridges to the legacy command manager — mutates NO plugin store.
  affectedStores = [];
  canExecute(_ctx, cmd) {
    if (typeof cmd.roomId !== "string" || cmd.roomId.length === 0) {
      return { valid: false, reason: "roomId must be a non-empty string" };
    }
    if (!cmd.delta || !Number.isFinite(cmd.delta.x) || !Number.isFinite(cmd.delta.y) || !Number.isFinite(cmd.delta.z)) {
      return { valid: false, reason: "delta must have finite x, y, z" };
    }
    return { valid: true };
  }
  execute(_ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      if (!window.__pryzmInitComplete) {
        throw new Error(
          "room.move: the engine is not initialised yet, so nothing was changed. Wait for the project to finish loading and try again."
        );
      }
      const w = window;
      const room = w.roomStore?.getById(cmd.roomId);
      if (!room?.boundary) {
        throw new Error(
          `room.move: room ${cmd.roomId} has no boundary in the room store, so it could not be updated.`
        );
      }
      const cm = w.commandManager;
      if (!cm) {
        throw new Error(
          "room.move: the legacy command manager is not available, so the change could not be applied."
        );
      }
      if (cm) {
        try {
          const { x: dx, y: dy, z: dz } = cmd.delta;
          const polygon = room.boundary.polygon.map((p) => ({ ...p, x: p.x + dx, z: p.z + dz }));
          const boundary = {
            ...room.boundary,
            polygon,
            baseOffset: (room.boundary.baseOffset ?? 0) + dy
          };
          cm.execute(new UpdateRoomBoundaryCommand(cmd.roomId, boundary));
        } catch (e) {
          console.error("[room.move.handler] bridge failed:", e);
          throw e instanceof Error ? e : new Error(String(e));
        }
      }
      return { forward: [], inverse: [] };
    });
  }
}

class SetRoomNameHandler {
  type = "room.setName";
  // Bridges to the legacy command manager — this handler mutates NO plugin store
  // (matches RenameRoomHandler / DeleteRoomHandler's `affectedStores: []`).
  affectedStores = [];
  canExecute(_ctx, cmd) {
    if (typeof cmd.roomId !== "string" || cmd.roomId.length === 0) {
      return { valid: false, reason: "roomId must be a non-empty string" };
    }
    if (typeof cmd.name !== "string" || cmd.name.length === 0) {
      return { valid: false, reason: "name must be a non-empty string" };
    }
    return { valid: true };
  }
  execute(_ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      if (!window.__pryzmInitComplete) {
        throw new Error(
          "room.setName: the engine is not initialised yet, so nothing was changed. Wait for the project to finish loading and try again."
        );
      }
      const cm = window.commandManager;
      if (!cm) {
        throw new Error(
          "room.setName: the legacy command manager is not available, so the change could not be applied."
        );
      }
      if (cm) {
        let result;
        try {
          result = cm.execute(new RenameRoomCommand(cmd.roomId, { name: cmd.name }));
        } catch (e) {
          console.error("[room.setName.handler] bridge failed:", e);
          throw e instanceof Error ? e : new Error(String(e));
        }
        if (result && result.success === false) {
          const reason = result.info?.[0] ?? result.error ?? "no reason given";
          console.warn(`[room.setName.handler] RenameRoomCommand refused: ${reason}`);
          throw new Error(`room.setName: RenameRoomCommand refused — ${reason}`);
        }
      }
      return { forward: [], inverse: [] };
    });
  }
}

class SetRoomNumberHandler {
  type = "room.setNumber";
  // Bridges to the legacy command manager — mutates NO plugin store.
  affectedStores = [];
  canExecute(_ctx, cmd) {
    if (typeof cmd.roomId !== "string" || cmd.roomId.length === 0) {
      return { valid: false, reason: "roomId must be a non-empty string" };
    }
    if (cmd.number !== void 0 && typeof cmd.number !== "string") {
      return { valid: false, reason: "number must be a string when present" };
    }
    return { valid: true };
  }
  execute(_ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      if (!window.__pryzmInitComplete) {
        throw new Error(
          "room.setNumber: the engine is not initialised yet, so nothing was changed. Wait for the project to finish loading and try again."
        );
      }
      const cm = window.commandManager;
      if (!cm) {
        throw new Error(
          "room.setNumber: the legacy command manager is not available, so the change could not be applied."
        );
      }
      if (cm) {
        try {
          cm.execute(new RenameRoomCommand(cmd.roomId, { roomNumber: cmd.number ?? "" }));
        } catch (e) {
          console.error("[room.setNumber.handler] bridge failed:", e);
          throw e instanceof Error ? e : new Error(String(e));
        }
      }
      return { forward: [], inverse: [] };
    });
  }
}

class SetRoomOccupancyHandler {
  type = "room.setOccupancy";
  // Bridges to the legacy command manager — mutates NO plugin store.
  affectedStores = [];
  canExecute(_ctx, cmd) {
    if (typeof cmd.roomId !== "string" || cmd.roomId.length === 0) {
      return { valid: false, reason: "roomId must be a non-empty string" };
    }
    if (cmd.occupancy !== void 0 && typeof cmd.occupancy !== "string") {
      return { valid: false, reason: "occupancy must be a string when present" };
    }
    return { valid: true };
  }
  execute(_ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      if (!window.__pryzmInitComplete) {
        throw new Error(
          "room.setOccupancy: the engine is not initialised yet, so nothing was changed. Wait for the project to finish loading and try again."
        );
      }
      const cm = window.commandManager;
      if (!cm) {
        throw new Error(
          "room.setOccupancy: the legacy command manager is not available, so the change could not be applied."
        );
      }
      if (cm) {
        try {
          const occupancy = cmd.occupancy && cmd.occupancy.length > 0 ? cmd.occupancy : "unclassified";
          cm.execute(new SetRoomOccupancyCommand(cmd.roomId, occupancy));
        } catch (e) {
          console.error("[room.setOccupancy.handler] bridge failed:", e);
          throw e instanceof Error ? e : new Error(String(e));
        }
      }
      return { forward: [], inverse: [] };
    });
  }
}

const ROOM_MATERIAL_ID_UNSUPPORTED = "A room’s visible plan / 3-D fill is the top-level `colour` field (the RoomColourSystem override), which is what the renderer and persistence read. There is no legacy room field for a catalogue material id, so picking a library material would write nothing. Pick a colour override instead — that applies end to end.";
class SetRoomMaterialHandler {
  type = "room.setMaterial";
  // Bridges to the legacy command manager — mutates NO plugin store.
  affectedStores = [];
  canExecute(_ctx, cmd) {
    if (typeof cmd.roomId !== "string" || cmd.roomId.length === 0) {
      return { valid: false, reason: "roomId must be a non-empty string" };
    }
    if (cmd.materialId === void 0 && cmd.materialColor === void 0) {
      return { valid: false, reason: "at least one of materialId / materialColor must be provided" };
    }
    if (cmd.materialColor !== void 0 && cmd.materialColor.length === 0) {
      return { valid: false, reason: "materialColor must be non-empty when provided" };
    }
    if (cmd.materialId !== void 0) {
      return { valid: false, reason: ROOM_MATERIAL_ID_UNSUPPORTED };
    }
    return { valid: true };
  }
  execute(_ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      if (!window.__pryzmInitComplete) {
        throw new Error(
          "room.setMaterial: the engine is not initialised yet, so nothing was changed. Wait for the project to finish loading and try again."
        );
      }
      if (cmd.materialColor === void 0) {
        return { forward: [], inverse: [] };
      }
      const cm = window.commandManager;
      if (!cm) {
        throw new Error(
          "room.setMaterial: the legacy command manager is not available, so the change could not be applied."
        );
      }
      if (cm) {
        try {
          cm.execute(new UpdateRoomCommand(cmd.roomId, { colour: cmd.materialColor }));
        } catch (e) {
          console.error("[room.setMaterial.handler] bridge failed:", e);
          throw e instanceof Error ? e : new Error(String(e));
        }
      }
      return { forward: [], inverse: [] };
    });
  }
}

class SetRoomHeightOffsetHandler {
  type = "room.setHeightOffset";
  // Bridges to the legacy command manager — mutates NO plugin store.
  affectedStores = [];
  canExecute(_ctx, cmd) {
    if (typeof cmd.roomId !== "string" || cmd.roomId.length === 0) {
      return { valid: false, reason: "roomId must be a non-empty string" };
    }
    if (!Number.isFinite(cmd.heightOffset)) {
      return { valid: false, reason: "heightOffset must be a finite number" };
    }
    if (cmd.heightOffset < -10 || cmd.heightOffset > 10) {
      return { valid: false, reason: "heightOffset must be in [-10, 10]" };
    }
    return { valid: true };
  }
  execute(_ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      if (!window.__pryzmInitComplete) {
        throw new Error(
          "room.setHeightOffset: the engine is not initialised yet, so nothing was changed. Wait for the project to finish loading and try again."
        );
      }
      const w = window;
      const room = w.roomStore?.getById(cmd.roomId);
      if (!room?.boundary) {
        throw new Error(
          `room.setHeightOffset: room ${cmd.roomId} has no boundary in the room store, so it could not be updated.`
        );
      }
      const cm = w.commandManager;
      if (!cm) {
        throw new Error(
          "room.setHeightOffset: the legacy command manager is not available, so the change could not be applied."
        );
      }
      if (cm) {
        try {
          const boundary = { ...room.boundary, baseOffset: cmd.heightOffset };
          cm.execute(new UpdateRoomCommand(cmd.roomId, { boundary }));
        } catch (e) {
          console.error("[room.setHeightOffset.handler] bridge failed:", e);
          throw e instanceof Error ? e : new Error(String(e));
        }
      }
      return { forward: [], inverse: [] };
    });
  }
}

class SetRoomDepartmentHandler {
  type = "room.setDepartment";
  // Bridges to the legacy command manager — mutates NO plugin store.
  affectedStores = [];
  canExecute(_ctx, cmd) {
    if (typeof cmd.roomId !== "string" || cmd.roomId.length === 0) {
      return { valid: false, reason: "roomId must be a non-empty string" };
    }
    if (cmd.department !== void 0 && typeof cmd.department !== "string") {
      return { valid: false, reason: "department must be a string when present" };
    }
    return { valid: true };
  }
  execute(_ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      if (!window.__pryzmInitComplete) {
        throw new Error(
          "room.setDepartment: the engine is not initialised yet, so nothing was changed. Wait for the project to finish loading and try again."
        );
      }
      const cm = window.commandManager;
      if (!cm) {
        throw new Error(
          "room.setDepartment: the legacy command manager is not available, so the change could not be applied."
        );
      }
      if (cm) {
        try {
          cm.execute(new RenameRoomCommand(cmd.roomId, { department: cmd.department ?? "" }));
        } catch (e) {
          console.error("[room.setDepartment.handler] bridge failed:", e);
          throw e instanceof Error ? e : new Error(String(e));
        }
      }
      return { forward: [], inverse: [] };
    });
  }
}

const MODES = [
  "detection",
  "occupancy",
  "area",
  "custom",
  "uniform",
  "sync-state"
];
function activeViewId() {
  const w = window;
  return w.runtime?.viewRegistry?.activeViewId ?? null;
}
function activeModelId() {
  const w = window;
  return w.__pryzmVgModelId ?? "model-default";
}
class SetRoomColourModeHandler {
  type = "room.setColourMode";
  affectedStores = [];
  canExecute(_ctx, cmd) {
    if (!MODES.includes(cmd.mode)) {
      return { valid: false, reason: `mode must be one of ${MODES.join(", ")}` };
    }
    if (cmd.scope !== void 0 && cmd.scope !== "view" && cmd.scope !== "project") {
      return { valid: false, reason: "scope must be 'view' or 'project'" };
    }
    return { valid: true };
  }
  execute(_ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", {
      "pryzm.command.type": this.type,
      "pryzm.room.colour_mode": cmd.mode
    }, () => {
      const scope = cmd.scope ?? "view";
      const viewId = cmd.viewId ?? activeViewId();
      const command = new SetRoomColourModeCommand(cmd.mode, scope, activeModelId(), viewId);
      const check = command.canExecute({});
      if (!check.ok) {
        throw new Error(`room.setColourMode refused: ${check.reason}`);
      }
      const result = command.execute({});
      if (!result.success) {
        throw new Error("room.setColourMode: the room graphics category could not be updated.");
      }
      return { forward: [], inverse: [] };
    });
  }
}

const ROOM_FINISH_SURFACES = ["floor", "ceiling", "walls"];
function legacyWindow() {
  return globalThis.window ?? {};
}
function isSurface(v) {
  return typeof v === "string" && ROOM_FINISH_SURFACES.includes(v);
}
class SetRoomFinishHandler {
  type = "room.setFinish";
  // Bridges to the legacy command manager — mutates NO plugin store. See header.
  affectedStores = [];
  canExecute(_ctx, cmd) {
    if (typeof cmd?.roomId !== "string" || cmd.roomId.length === 0) {
      return { valid: false, reason: "roomId must be a non-empty string" };
    }
    const wantsSurface = cmd.surface !== void 0 || cmd.finish !== void 0;
    const wantsHeights = cmd.skirtingHeight !== void 0 || cmd.coveHeight !== void 0;
    if (!wantsSurface && !wantsHeights) {
      return {
        valid: false,
        reason: "Nothing to set: provide a `surface` + `finish`, and/or `skirtingHeight` / `coveHeight`."
      };
    }
    if (wantsSurface) {
      if (!isSurface(cmd.surface)) {
        return {
          valid: false,
          reason: `surface must be one of ${ROOM_FINISH_SURFACES.join(" / ")}`
        };
      }
      if (cmd.finish === void 0 || typeof cmd.finish !== "object") {
        return { valid: false, reason: `a \`finish\` specification is required for surface '${cmd.surface}'` };
      }
      if (typeof cmd.finish.materialName !== "string" || cmd.finish.materialName.length === 0) {
        return { valid: false, reason: "finish.materialName is required (a non-empty name for the material)" };
      }
      if (typeof cmd.finish.materialColor !== "string" || cmd.finish.materialColor.length === 0) {
        return { valid: false, reason: 'finish.materialColor is required (e.g. "#b98b4f")' };
      }
    }
    for (const [key, value] of [
      ["skirtingHeight", cmd.skirtingHeight],
      ["coveHeight", cmd.coveHeight]
    ]) {
      if (value === void 0) continue;
      if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
        return { valid: false, reason: `${key} must be a finite number ≥ 0 (metres)` };
      }
    }
    return { valid: true };
  }
  execute(_ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      const w = legacyWindow();
      if (!w.__pryzmInitComplete) {
        throw new Error(
          "room.setFinish: the engine is not initialised yet, so nothing was changed. Wait for the project to finish loading and try again."
        );
      }
      const cm = w.commandManager;
      if (!cm) {
        throw new Error(
          "room.setFinish: the legacy command manager is not available, so the finish could not be applied."
        );
      }
      const store = w.roomStore;
      if (!store) {
        throw new Error(
          "room.setFinish: the room store is not available, so the finish could not be applied."
        );
      }
      const room = store.getById(cmd.roomId);
      if (!room) {
        throw new Error(`room.setFinish: room not found: ${cmd.roomId}`);
      }
      const existing = room.finishes ?? {};
      const merged = { ...existing };
      if (cmd.surface !== void 0 && cmd.finish !== void 0) {
        const spec = {};
        for (const [k, v] of Object.entries(cmd.finish)) {
          if (v !== void 0) spec[k] = v;
        }
        merged[cmd.surface] = spec;
      }
      if (cmd.skirtingHeight !== void 0) merged.skirtingHeight = cmd.skirtingHeight;
      if (cmd.coveHeight !== void 0) merged.coveHeight = cmd.coveHeight;
      let result;
      try {
        result = cm.execute(new UpdateRoomCommand(cmd.roomId, { finishes: merged }));
      } catch (e) {
        console.error("[room.setFinish.handler] bridge failed:", e);
        throw e instanceof Error ? e : new Error(String(e));
      }
      if (result && result.success === false) {
        throw new Error(
          `room.setFinish: ${result.error ?? result.info?.[0] ?? "the room could not be updated"}`
        );
      }
      return { forward: [], inverse: [] };
    });
  }
}

function readAll(store) {
  if (store === null || store === void 0) return void 0;
  const fn = store.getAll;
  if (typeof fn !== "function") return void 0;
  let raw;
  try {
    raw = fn.call(store);
  } catch {
    return void 0;
  }
  return Array.isArray(raw) ? raw : void 0;
}
function describeDelta(outcome) {
  const { before, after } = outcome;
  if (before === void 0 || after === void 0) return "no delta was computed";
  const fmt = (n) => n.toFixed(3);
  const added = after.boundingWallIds.filter((w) => !before.boundingWallIds.includes(w));
  const removed = before.boundingWallIds.filter((w) => !after.boundingWallIds.includes(w));
  return `area ${fmt(before.area)} m² → ${fmt(after.area)} m², perimeter ${fmt(before.perimeter)} m → ${fmt(after.perimeter)} m, bounding walls ${before.boundingWallIds.length} → ${after.boundingWallIds.length}` + (added.length > 0 ? ` (+${added.join(", ")})` : "") + (removed.length > 0 ? ` (−${removed.join(", ")})` : "");
}
function refuseUndetermined(roomId, impact) {
  return capabilityRefused({
    commandType: "room.recomputeBoundary",
    reason: impact.reason,
    asked: 1,
    unaccountedFor: 1,
    protects: `the room's last known boundary — a recompute that could not run must leave the cached analytic INTACT and say so, never zero it and never report the boundary as up to date (C71 §4.4: undetermined is not "unchanged")`,
    detail: `asked to recompute the boundary of room '${roomId}'; 1 of 1 could not be determined. ` + impact.detail
  });
}
function refuseWithheldWrite(outcome) {
  return capabilityRefused({
    commandType: "room.recomputeBoundary",
    reason: "RELATIONSHIP_NOT_RECORDED",
    asked: 1,
    unaccountedFor: 1,
    protects: "rooms whose boundary a human drew (RoomBoundary.detectionMethod 'manual-boundary' / 'point-pick') — which cannot yet be distinguished from a flood-filled one for the rooms that matter, because every boundary snapshot written before 2026-08-12 carries no detectionMethod at all and loads as 'origin-unknown' / predates-provenance (C75 §2.5: an old snapshot is not evidence about origin in either direction). Unknown authority is not permission (C80 GEN-GAP-2, open)",
    detail: `the boundary of room '${outcome.roomId}' WAS recomputed and it MOVED: ${describeDelta(outcome)}. The recomputed boundary is NOT written. Overwriting RoomBoundary.polygon would destroy a hand-drawn boundary wherever the provenance value is a default rather than a determination — treating unknown authority as permission, which C80 §2.3 forbids by name and which check-authored-state-protection clause (b) measured on 2026-08-12 (seeded=2 · remaining=0 · the authored room survived=false). THE ASK: refresh this room's cached boundary. THE BLOCKER: per-room boundary authority (C80 GEN-GAP-2 / roadmap Phase 8). This verb commits the delta through UpdateRoomBoundaryCommand the moment authority can be established per room.`
  });
}
class RecomputeRoomBoundaryHandler {
  type = "room.recomputeBoundary";
  // CA-19 — TRUE: this verb writes no store. The plugin `RoomsState` is a
  // detached shim (GE-04) and the authoritative RoomStore is written only
  // through the legacy seam, which this verb deliberately does not invoke yet
  // (see the WHY IT DETERMINES BUT DOES NOT WRITE section above).
  affectedStores = [];
  /** CA-3 — validates the PAYLOAD only; the capability decision is a VALUE. */
  canExecute(_ctx, cmd) {
    if (typeof cmd?.roomId !== "string" || cmd.roomId.length === 0) {
      return { valid: false, reason: "roomId must be a non-empty string" };
    }
    return { valid: true };
  }
  execute(_ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      const w = globalThis;
      const outcome = determineRoomBoundaryRecompute({
        roomId: cmd.roomId,
        rooms: readAll(w.roomStore),
        walls: readAll(w.wallStore)
      });
      if (outcome.forward.kind === "undetermined") {
        return {
          forward: [],
          inverse: [],
          refusal: refuseUndetermined(cmd.roomId, outcome.forward)
        };
      }
      if (outcome.changed) {
        return { forward: [], inverse: [], refusal: refuseWithheldWrite(outcome) };
      }
      return { forward: [], inverse: [] };
    });
  }
}

class RedetectRoomsHandler {
  type = "room.redetect";
  /** §FIX-COMMAND-NAMESPACE (L-796) — deprecated pre-migration spelling. */
  aliases = ["rooms.redetect"];
  affectedStores = [];
  canExecute(_ctx, cmd) {
    if (typeof cmd.levelId !== "string" || cmd.levelId.length === 0) {
      return { valid: false, reason: "room.redetect: levelId must be a non-empty string" };
    }
    if (cmd.elevation !== void 0 && typeof cmd.elevation !== "number") {
      return { valid: false, reason: "room.redetect: elevation must be a number when provided" };
    }
    if (cmd.height !== void 0 && (typeof cmd.height !== "number" || cmd.height <= 0)) {
      return { valid: false, reason: "room.redetect: height must be a positive number when provided" };
    }
    return { valid: true };
  }
  execute(_ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      try {
        const elevation = cmd.elevation ?? 0;
        const height = cmd.height ?? 3;
        window.dispatchEvent(
          new CustomEvent("pryzm-bus-rooms-redetect", {
            // TODO(TASK-15)
            detail: {
              levelId: cmd.levelId,
              elevation,
              height
            }
          })
        );
      } catch (err) {
        console.error("[RedetectRoomsHandler] Failed to dispatch bridge event:", err);
        throw new Error(
          `room.redetect: the room-detection bridge event could not be dispatched — ${String(err?.message ?? err)}. No re-detection was requested.`
        );
      }
      return { forward: [], inverse: [] };
    });
  }
}

function buildRegenerationRefusal(cmd) {
  const generator = cmd.generator ?? "a generation pass";
  const asked = cmd.roomIds === void 0 ? void 0 : cmd.roomIds.length;
  const unaccountedFor = asked;
  const askedText = asked === void 0 ? "an unenumerated set of rooms" : `${asked} room(s)`;
  const unaccountedText = unaccountedFor === void 0 ? "every one of them is of unknown provenance" : `all ${unaccountedFor} are of unknown provenance`;
  return capabilityRefused({
    commandType: "room.regenerate",
    reason: "RELATIONSHIP_NOT_RECORDED",
    asked,
    unaccountedFor,
    protects: "rooms whose boundary a human drew (RoomBoundary.detectionMethod 'manual-boundary' / 'point-pick') — which cannot yet be distinguished from rooms a generator produced, because no element in this model carries provenance (C80 GEN-GAP-2, open)",
    detail: `${generator} asked to regenerate ${askedText} on level '${cmd.levelId}', and ${unaccountedText}. Regeneration is WITHHELD. No element in this model records where it came from, so a room a human drew is indistinguishable from one a generator produced (C80 §0.1(2): generationId / generatedBy / isGenerated → 0 element hits; RoomBoundary.detectionMethod is the only element-grain signal and it is room-local and itself ambiguous — roomSnapshotUtils.ts:156 writes 'auto-topology' as a || default). Overwriting them anyway would treat unknown-authority as permission, which C80 §2.3 forbids by name — and which was MEASURED destroying a hand-drawn room on 2026-08-12 (check-authored-state-protection clause (b): seeded=2 · remaining=0 · the authored room survived=false). THE ASK: replace the rooms on this level. THE BLOCKER: element-grain provenance (C80 GEN-GAP-2 / roadmap Phase 8). This verb regenerates the moment authority can be established per element — the refusal will then narrow to the protected and unknown-authority buckets instead of covering the whole set.`
  });
}
class RegenerateRoomsHandler {
  type = "room.regenerate";
  /**
   * CA-19 — and here it is a STRUCTURAL truth rather than a bridge
   * concession: C80 §1.5 requires that this verb mutate NOTHING, so there is
   * no store to name. A future version that regenerates will declare the
   * stores it writes in the same commit that makes it write them.
   */
  affectedStores = [];
  /**
   * CA-3 — validates the PAYLOAD only. The capability decision is NOT taken
   * here: `canExecute({valid:false})` throws (`CommandBus.ts:426-432`) and a
   * throw is swallowable by the `catch {}` C80 §10.f names. The refusal must
   * be a value the caller reads, so it is produced in `execute()`.
   */
  canExecute(_ctx, cmd) {
    if (typeof cmd?.levelId !== "string" || cmd.levelId.length === 0) {
      return {
        valid: false,
        reason: "room.regenerate: levelId must be a non-empty string"
      };
    }
    if (cmd.roomIds !== void 0 && !Array.isArray(cmd.roomIds)) {
      return {
        valid: false,
        reason: "room.regenerate: roomIds must be an array of ids when provided"
      };
    }
    return { valid: true };
  }
  /**
   * Returns the typed refusal. ZERO store mutations (C80 §1.5), zero
   * dispatches, zero events — asserted by
   * `check-generation-is-consequential` arm (b) statically and by
   * `__tests__/roomRegenerate.test.ts` dynamically over a real bus.
   */
  execute(_ctx, cmd) {
    return withHandlerSpan(
      this.type + ".handler",
      { "pryzm.command.type": this.type },
      () => ({
        // EMPTY BY CONSTRUCTION, and NOT a CA-18(b) silent no-op: the empty
        // pair is qualified by `refusal` below, which states what did not
        // happen and why. C80 §1.5 — a generation pass that cannot proceed
        // safely performs no mutation at all.
        forward: [],
        inverse: [],
        refusal: buildRegenerationRefusal(cmd)
      })
    );
  }
}

const RenameRoomHandler = {
  type: "room.rename",
  affectedStores: [],
  canExecute(_ctx, cmd) {
    if (!cmd.roomId) return { valid: false, reason: "roomId is required" };
    return { valid: true };
  },
  execute(_ctx, cmd) {
    return withHandlerSpan("room.rename.handler", { "pryzm.command.type": "room.rename" }, () => {
      if (!window.__pryzmInitComplete) {
        throw new Error(
          "room.rename: the engine is not initialised yet, so nothing was changed. Wait for the project to finish loading and try again."
        );
      }
      const cm = window.commandManager;
      if (!cm) {
        throw new Error(
          "room.rename: the legacy command manager is not available, so the change could not be applied."
        );
      }
      if (cm) {
        let result;
        try {
          result = cm.execute(new RenameRoomCommand(cmd.roomId, {
            name: cmd.name,
            roomNumber: cmd.roomNumber,
            ...cmd.occupancy && cmd.occupancy.length > 0 ? { occupancyType: cmd.occupancy } : {}
          }));
        } catch (e) {
          console.error("[room.rename.handler] bridge failed:", e);
          throw e instanceof Error ? e : new Error(String(e));
        }
        if (result && result.success === false) {
          const reason = result.info?.[0] ?? result.error ?? "no reason given";
          console.warn(`[room.rename.handler] RenameRoomCommand refused: ${reason}`);
          throw new Error(`room.rename: RenameRoomCommand refused — ${reason}`);
        }
      }
      return { forward: [], inverse: [] };
    });
  }
};

const TEMPLATE_CREATE_NO_BRIDGE = "template.create reaches the authoritative templateStore only through the legacy commandManager bridge (window.commandManager → CreateTemplateCommand), and that bridge is not present in this process. It is absent in every headless runtime and in any browser frame before the engine boots. Refusing here is the honest answer: the previous behaviour returned an empty patch pair, which the bus reads as SUCCESS, so the caller was told a template existed that was never created.";
const CreateTemplateHandler = {
  type: "template.create",
  affectedStores: [],
  canExecute(_ctx, cmd) {
    if (!cmd.id || !cmd.name) return { valid: false, reason: "id and name are required" };
    if (typeof cmd.code !== "string" || cmd.code.trim().length === 0) {
      return { valid: false, reason: "code is required (CreateTemplateCommand rejects an empty template code)" };
    }
    if (typeof window === "undefined" || !window.commandManager) {
      return { valid: false, reason: TEMPLATE_CREATE_NO_BRIDGE };
    }
    return { valid: true };
  },
  execute(_ctx, cmd) {
    return withHandlerSpan("template.create.handler", { "pryzm.command.type": "template.create" }, () => {
      const cm = window.commandManager;
      if (!cm) {
        throw new Error("[template.create] " + TEMPLATE_CREATE_NO_BRIDGE);
      }
      cm.execute(new CreateTemplateCommand(cmd));
      return { forward: [], inverse: [] };
    });
  }
};

function isValidPatches(patches) {
  if (!Array.isArray(patches)) return false;
  return patches.every(
    (p) => typeof p === "object" && p !== null && typeof p.roomId === "string" && p.roomId.length > 0 && typeof p.name === "string" && p.name.length > 0 && typeof p.occupancyType === "string" && p.occupancyType.length > 0 && // §DEPT153 — optional, but must be a string when present.
    (p.department === void 0 || typeof p.department === "string")
  );
}
const BulkAutoClassifyRoomsHandler = {
  type: "room.autoClassify.batch",
  // Bridges to the legacy command manager — mutates NO plugin store.
  affectedStores: [],
  canExecute(_ctx, cmd) {
    if (!isValidPatches(cmd.patches)) {
      return { valid: false, reason: "patches must be a list of { roomId, name, occupancyType }" };
    }
    if (cmd.patches.length === 0) {
      return { valid: false, reason: "patches is empty — nothing to rename" };
    }
    return { valid: true };
  },
  execute(_ctx, cmd) {
    return withHandlerSpan("room.autoClassify.batch.handler", { "pryzm.command.type": "room.autoClassify.batch" }, () => {
      if (!window.__pryzmInitComplete) {
        throw new Error(
          "room.autoClassify.batch: the engine is not initialised yet, so nothing was changed. Wait for the project to finish loading and try again."
        );
      }
      const cm = window.commandManager;
      if (!cm) {
        throw new Error(
          "room.autoClassify.batch: the legacy command manager is not available, so the change could not be applied."
        );
      }
      let result;
      try {
        result = cm.execute(new BulkAutoClassifyRoomsCommand(
          cmd.patches.map((p) => ({
            roomId: p.roomId,
            name: p.name,
            occupancyType: p.occupancyType,
            // §DEPT153 — forwarded only when the caller decided to write it.
            ...p.department !== void 0 ? { department: p.department } : {}
          }))
        ));
      } catch (e) {
        console.error("[room.autoClassify.batch.handler] bridge failed:", e);
        throw e instanceof Error ? e : new Error(String(e));
      }
      if (result && result.success === false) {
        const reason = result.info?.[0] ?? result.error ?? "no reason given";
        console.warn(`[room.autoClassify.batch.handler] BulkAutoClassifyRoomsCommand refused: ${reason}`);
        throw new Error(`room.autoClassify.batch: refused — ${reason}`);
      }
      return { forward: [], inverse: [] };
    });
  }
};

const RESTORABLE_KEYS = [
  "name",
  "roomNumber",
  "department",
  "occupancyType",
  "occupancyLoad",
  "programmeArea",
  "finishes",
  "properties",
  "ifcData",
  "revitId",
  "phase"
];
class RestoreRoomMeaningHandler {
  type = "room.restoreMeaning";
  // Bridges to the legacy command manager — mutates NO plugin store.
  affectedStores = [];
  canExecute(_ctx, cmd) {
    if (typeof cmd?.roomId !== "string" || cmd.roomId.length === 0) {
      return { valid: false, reason: "roomId must be a non-empty string" };
    }
    if (!RESTORABLE_KEYS.some((k) => cmd[k] !== void 0)) {
      return { valid: false, reason: "nothing to restore — the payload carried no room details" };
    }
    return { valid: true };
  }
  execute(_ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      if (!window.__pryzmInitComplete) {
        throw new Error(
          "room.restoreMeaning: the engine is not initialised yet, so nothing was changed. Wait for the project to finish loading and try again."
        );
      }
      const cm = window.commandManager;
      if (!cm) {
        throw new Error(
          "room.restoreMeaning: the legacy command manager is not available, so the details could not be restored."
        );
      }
      const updates = {};
      for (const k of RESTORABLE_KEYS) {
        if (cmd[k] !== void 0) updates[k] = cmd[k];
      }
      try {
        cm.execute(new UpdateRoomCommand(cmd.roomId, updates));
      } catch (e) {
        console.error("[room.restoreMeaning.handler] bridge failed:", e);
        throw e instanceof Error ? e : new Error(String(e));
      }
      return { forward: [], inverse: [] };
    });
  }
}

function buildRoomHandlerSet() {
  return [
    new CreateRoomHandler(),
    new DeleteRoomHandler(),
    new MoveRoomHandler(),
    new SetRoomNameHandler(),
    new SetRoomNumberHandler(),
    new SetRoomDepartmentHandler(),
    new SetRoomOccupancyHandler(),
    new SetRoomColourModeHandler(),
    new SetRoomMaterialHandler(),
    new SetRoomFinishHandler(),
    new SetRoomHeightOffsetHandler(),
    new RecomputeRoomBoundaryHandler(),
    new RedetectRoomsHandler(),
    new RegenerateRoomsHandler(),
    new RestoreRoomMeaningHandler(),
    RenameRoomHandler,
    CreateTemplateHandler,
    BulkAutoClassifyRoomsHandler
  ];
}

const DEFAULT_ELEVATION = 0;
const DEFAULT_HEIGHT = 3;
function __pryzmBuildingGenActive() {
  return globalThis.__pryzmBuildingGenActive === true;
}
function wireRoomEventSubscriptions(runtime) {
  const disposers = [];
  disposers.push(
    runtime.events.on("wall.created", async (payload) => {
      const levelId = typeof payload.levelId === "string" ? payload.levelId : "";
      if (!levelId) return;
      if (__pryzmBuildingGenActive()) return;
      try {
        await runtime.bus.executeCommand("room.redetect", {
          levelId,
          elevation: DEFAULT_ELEVATION,
          height: DEFAULT_HEIGHT
        });
      } catch (err) {
        console.error("[rooms/contributions] room.redetect failed (wall.created):", err);
      }
    })
  );
  disposers.push(
    runtime.events.on("curtain-wall.created", async (payload) => {
      const levelId = typeof payload.levelId === "string" ? payload.levelId : "";
      if (!levelId) return;
      if (__pryzmBuildingGenActive()) return;
      try {
        await runtime.bus.executeCommand("room.redetect", {
          levelId,
          elevation: DEFAULT_ELEVATION,
          height: DEFAULT_HEIGHT
        });
      } catch (err) {
        console.error(
          "[rooms/contributions] room.redetect failed (curtain-wall.created):",
          err
        );
      }
    })
  );
  return () => {
    for (const d of disposers) d.dispose();
  };
}

class StructuralStore extends Store {
  constructor() {
    super("structural");
  }
  ids() {
    return [...this.state.keys()];
  }
  byLevel(levelId) {
    const out = [];
    for (const s of this.state.values()) if (s.levelId === levelId) out.push(s);
    return out;
  }
  byKind(kind) {
    const out = [];
    for (const s of this.state.values()) if (s.kind === kind) out.push(s);
    return out;
  }
  get(id) {
    return this.state.get(id);
  }
}

class StructuralSystemError extends Error {
  constructor(message) {
    super(message);
    this.name = "StructuralSystemError";
  }
}
class StructuralNotFoundError extends StructuralSystemError {
  constructor(structuralId) {
    super(`Structural element not found: ${structuralId}`);
    this.structuralId = structuralId;
    this.name = "StructuralNotFoundError";
  }
  structuralId;
}
class StructuralSchemaError extends StructuralSystemError {
  constructor(cause) {
    super(`Structural schema validation failed: ${String(cause?.message ?? cause)}`);
    this.cause = cause;
    this.name = "StructuralSchemaError";
  }
  cause;
}
class StructuralDimensionsError extends StructuralSystemError {
  constructor(reason) {
    super(`Invalid structural dimensions: ${reason}`);
    this.name = "StructuralDimensionsError";
  }
}

function isFiniteVec3$1(p) {
  return !!p && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z);
}

class CreateStructuralHandler {
  type = "structural.create";
  affectedStores = ["structural"];
  canExecute(_ctx, cmd) {
    if (cmd.origin !== void 0 && !isFiniteVec3$1(cmd.origin)) {
      return { valid: false, reason: "origin must have finite x, y, z" };
    }
    if (cmd.endOffset !== void 0 && !isFiniteVec3$1(cmd.endOffset)) {
      return { valid: false, reason: "endOffset must have finite x, y, z" };
    }
    for (const k of ["width", "depth", "thickness", "radius"]) {
      const v = cmd[k];
      if (v !== void 0 && (!Number.isFinite(v) || v <= 0)) {
        return { valid: false, reason: `${k} must be > 0` };
      }
    }
    return { valid: true };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      const id = cmd.id ?? createId("structural");
      const seed = {
        id,
        levelId: cmd.levelId ?? "",
        kind: cmd.kind ?? "brace",
        origin: cmd.origin ?? { x: 0, y: 0, z: 0 },
        endOffset: cmd.endOffset ?? { x: 1, y: 0, z: 0 },
        width: cmd.width ?? 0.6,
        depth: cmd.depth ?? 0.6,
        thickness: cmd.thickness ?? 0.4,
        radius: cmd.radius ?? 0.06,
        rotation: cmd.rotation ?? 0,
        baseOffset: cmd.baseOffset ?? 0,
        materialId: cmd.materialId
      };
      let s;
      try {
        s = Structural.parse(seed);
      } catch (err) {
        throw new StructuralSchemaError(err);
      }
      const [next, forward, inverse] = produceCommand(ctx.stores.structural, (draft) => {
        draft[s.id] = s;
      });
      return { forward, inverse, nextStates: { structural: next } };
    });
  }
}

class DeleteStructuralHandler {
  type = "structural.delete";
  affectedStores = ["structural"];
  canExecute(ctx, cmd) {
    if (typeof cmd.structuralId !== "string" || cmd.structuralId.length === 0) {
      return { valid: false, reason: "structuralId must be a non-empty string" };
    }
    if (!ctx.stores.structural[cmd.structuralId]) {
      return { valid: false, reason: `structural not found: ${cmd.structuralId}` };
    }
    return { valid: true };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      if (!ctx.stores.structural[cmd.structuralId]) throw new StructuralNotFoundError(cmd.structuralId);
      const [next, forward, inverse] = produceCommand(ctx.stores.structural, (draft) => {
        delete draft[cmd.structuralId];
      });
      return { forward, inverse, nextStates: { structural: next } };
    });
  }
}

const STRUCTURAL_MOVE_UNREACHABLE = "structural.move is dead for a deeper reason than a detached store: THERE IS NO STRUCTURAL RUNTIME FAMILY. schemas/elements/Structural.ts defines the element, but no structuralStore, no fragment builder and no command exist anywhere in the app — it is schema-only (the same finding that made structural.setMaterial refuse). Nothing can render, export or persist a structural member, so nothing can observe it moving. The real structural element is `column`, which has a full live path: use column.update (payload keys: id, updates).";
class MoveStructuralHandler {
  type = "structural.move";
  affectedStores = ["structural"];
  /** Payload validation ONLY — kept public so a delegating facade can reuse it. */
  validatePayload(ctx, cmd) {
    if (typeof cmd.structuralId !== "string" || cmd.structuralId.length === 0) {
      return { valid: false, reason: "structuralId must be a non-empty string" };
    }
    if (!cmd.delta || !Number.isFinite(cmd.delta.x) || !Number.isFinite(cmd.delta.y) || !Number.isFinite(cmd.delta.z)) {
      return { valid: false, reason: "delta must have finite x, y, z" };
    }
    if (!ctx.stores.structural[cmd.structuralId]) {
      return { valid: false, reason: `structural not found: ${cmd.structuralId}` };
    }
    return { valid: true };
  }
  /**
   * §FIX-DEAD-MOVE-VERB-REFUSE (W3-4) — ORDER IS LOAD-BEARING. `canExecute` must be the
   * LAST method before `execute`. `tools/ga-gate/check-verb-register.ts` classifies a
   * verb as REFUSES by slicing the source from `canExecute` to the next `execute(` and
   * checking that the slice can never yield an ACCEPTING validation result. With
   * `validatePayload` sitting between them, its accepting branch lands inside that slice
   * and the verb is mis-reported as UNKNOWN — a refusal hiding from the register that
   * exists to find it. (For the same reason this comment must not spell the accepting
   * literal out: the detector is a regex over source text, and prose is source text.)
   * Do not reorder these two methods.
   */
  canExecute(ctx, cmd) {
    const v = this.validatePayload(ctx, cmd);
    if (!v.valid) return v;
    return { valid: false, reason: STRUCTURAL_MOVE_UNREACHABLE };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      if (!ctx.stores.structural[cmd.structuralId]) throw new StructuralNotFoundError(cmd.structuralId);
      const [next, forward, inverse] = produceCommand(ctx.stores.structural, (draft) => {
        const s = draft[cmd.structuralId];
        if (!s) return;
        s.origin.x += cmd.delta.x;
        s.origin.y += cmd.delta.y;
        s.origin.z += cmd.delta.z;
      });
      return { forward, inverse, nextStates: { structural: next } };
    });
  }
}

const KINDS = /* @__PURE__ */ new Set([
  "brace",
  "footing",
  "foundation-slab",
  "connection"
]);
class SetStructuralKindHandler {
  type = "structural.setKind";
  affectedStores = ["structural"];
  canExecute(ctx, cmd) {
    if (!KINDS.has(cmd.kind)) return { valid: false, reason: `unknown kind: ${cmd.kind}` };
    if (!ctx.stores.structural[cmd.structuralId]) {
      return { valid: false, reason: `structural not found: ${cmd.structuralId}` };
    }
    return { valid: true };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      if (!ctx.stores.structural[cmd.structuralId]) throw new StructuralNotFoundError(cmd.structuralId);
      const [next, forward, inverse] = produceCommand(ctx.stores.structural, (draft) => {
        const s = draft[cmd.structuralId];
        if (s) s.kind = cmd.kind;
      });
      return { forward, inverse, nextStates: { structural: next } };
    });
  }
}

class SetStructuralDimensionsHandler {
  type = "structural.setDimensions";
  affectedStores = ["structural"];
  canExecute(ctx, cmd) {
    if (!ctx.stores.structural[cmd.structuralId]) {
      return { valid: false, reason: `structural not found: ${cmd.structuralId}` };
    }
    for (const k of ["width", "depth", "thickness", "radius"]) {
      const v = cmd[k];
      if (v !== void 0 && (!Number.isFinite(v) || v <= 0)) {
        return { valid: false, reason: `${k} must be > 0` };
      }
    }
    return { valid: true };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      if (!ctx.stores.structural[cmd.structuralId]) throw new StructuralNotFoundError(cmd.structuralId);
      const [next, forward, inverse] = produceCommand(ctx.stores.structural, (draft) => {
        const s = draft[cmd.structuralId];
        if (!s) return;
        if (cmd.width !== void 0) s.width = cmd.width;
        if (cmd.depth !== void 0) s.depth = cmd.depth;
        if (cmd.thickness !== void 0) s.thickness = cmd.thickness;
        if (cmd.radius !== void 0) s.radius = cmd.radius;
      });
      return { forward, inverse, nextStates: { structural: next } };
    });
  }
}

const STRUCTURAL_MATERIAL_UNREACHABLE = "There is no structural runtime family: schemas/elements/Structural.ts defines the element, but no structuralStore, no builder and no legacy command exists anywhere — it is schema-only, so nothing could observe this write. The real structural element is `column`, which has a live material path (`column.update`).";
class SetStructuralMaterialHandler {
  type = "structural.setMaterial";
  affectedStores = ["structural"];
  canExecute(ctx, cmd) {
    if (!ctx.stores.structural[cmd.structuralId]) {
      return { valid: false, reason: `structural not found: ${cmd.structuralId}` };
    }
    return { valid: false, reason: STRUCTURAL_MATERIAL_UNREACHABLE };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      if (!ctx.stores.structural[cmd.structuralId]) throw new StructuralNotFoundError(cmd.structuralId);
      const [next, forward, inverse] = produceCommand(ctx.stores.structural, (draft) => {
        const s = draft[cmd.structuralId];
        if (!s) return;
        s.materialId = cmd.materialId;
      });
      return { forward, inverse, nextStates: { structural: next } };
    });
  }
}

class SetBraceEndOffsetHandler {
  type = "structural.setBraceEndOffset";
  affectedStores = ["structural"];
  canExecute(ctx, cmd) {
    if (!isFiniteVec3$1(cmd.endOffset)) return { valid: false, reason: "endOffset must have finite x, y, z" };
    if (cmd.endOffset.x === 0 && cmd.endOffset.y === 0 && cmd.endOffset.z === 0) {
      return { valid: false, reason: "endOffset must be non-zero" };
    }
    const s = ctx.stores.structural[cmd.structuralId];
    if (!s) return { valid: false, reason: `structural not found: ${cmd.structuralId}` };
    if (s.kind !== "brace") return { valid: false, reason: `setBraceEndOffset only valid for kind=brace (was ${s.kind})` };
    return { valid: true };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      const cur = ctx.stores.structural[cmd.structuralId];
      if (!cur) throw new StructuralNotFoundError(cmd.structuralId);
      if (cur.kind !== "brace") throw new StructuralDimensionsError(`setBraceEndOffset on kind=${cur.kind}`);
      const [next, forward, inverse] = produceCommand(ctx.stores.structural, (draft) => {
        const s = draft[cmd.structuralId];
        if (!s) return;
        s.endOffset = { ...cmd.endOffset };
      });
      return { forward, inverse, nextStates: { structural: next } };
    });
  }
}

function buildStructuralHandlerSet() {
  return [
    new CreateStructuralHandler(),
    new DeleteStructuralHandler(),
    new MoveStructuralHandler(),
    new SetStructuralKindHandler(),
    new SetStructuralDimensionsHandler(),
    new SetStructuralMaterialHandler(),
    new SetBraceEndOffsetHandler()
  ];
}

class DimensionStore extends Store {
  constructor() {
    super("dimension");
  }
  ids() {
    return [...this.state.keys()];
  }
  byLevel(levelId) {
    const out = [];
    for (const d of this.state.values()) if (d.levelId === levelId) out.push(d);
    return out;
  }
  byView(viewId) {
    const out = [];
    for (const d of this.state.values()) if (d.viewId === viewId) out.push(d);
    return out;
  }
  get(id) {
    return this.state.get(id);
  }
}

class DimensionSystemError extends Error {
  constructor(message) {
    super(message);
    this.name = "DimensionSystemError";
  }
}
class DimensionNotFoundError extends DimensionSystemError {
  constructor(dimensionId) {
    super(`Dimension not found: ${dimensionId}`);
    this.dimensionId = dimensionId;
    this.name = "DimensionNotFoundError";
  }
  dimensionId;
}
class DimensionSchemaError extends DimensionSystemError {
  constructor(cause) {
    super(`Dimension schema validation failed: ${String(cause?.message ?? cause)}`);
    this.cause = cause;
    this.name = "DimensionSchemaError";
  }
  cause;
}

function isFiniteVec3(p) {
  return !!p && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z);
}
function isFiniteVec3Array(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return false;
  for (const v of arr) if (!isFiniteVec3(v)) return false;
  return true;
}
const DIMENSION_UNITS = ["mm", "cm", "m", "in", "ft"];
function isDimensionUnit(s) {
  return typeof s === "string" && DIMENSION_UNITS.includes(s);
}

class CreateDimensionHandler {
  type = "dimension.create";
  affectedStores = ["dimension"];
  canExecute(_ctx, cmd) {
    if (cmd.points !== void 0 && !isFiniteVec3Array(cmd.points)) {
      return { valid: false, reason: "points must be a non-empty array of finite Vec3" };
    }
    if (cmd.offsetMm !== void 0 && !Number.isFinite(cmd.offsetMm)) {
      return { valid: false, reason: "offsetMm must be finite" };
    }
    if (cmd.precision !== void 0 && (!Number.isInteger(cmd.precision) || cmd.precision < 0 || cmd.precision > 6)) {
      return { valid: false, reason: "precision must be an integer in [0, 6]" };
    }
    return { valid: true };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      const id = cmd.id ?? createId("dimension");
      const seed = {
        id,
        levelId: cmd.levelId ?? "",
        viewId: cmd.viewId ?? "",
        kind: cmd.kind ?? "linear",
        points: cmd.points ?? [
          { x: 0, y: 0, z: 0 },
          { x: 1, y: 0, z: 0 }
        ],
        offsetMm: cmd.offsetMm ?? 8,
        units: cmd.units ?? "mm",
        precision: cmd.precision ?? 0,
        style: cmd.style ?? "architectural",
        overridden: cmd.overridden ?? false,
        overrideText: cmd.overrideText
      };
      let d;
      try {
        d = Dimension.parse(seed);
      } catch (err) {
        throw new DimensionSchemaError(err);
      }
      const [next, forward, inverse] = produceCommand(ctx.stores.dimension, (draft) => {
        draft[d.id] = d;
      });
      return { forward, inverse, nextStates: { dimension: next } };
    });
  }
}

class CreateManyDimensionsHandler {
  type = "dimension.createMany";
  affectedStores = ["dimension"];
  canExecute(_ctx, cmd) {
    if (!Array.isArray(cmd.dimensions) || cmd.dimensions.length === 0) {
      return { valid: false, reason: "dimensions must be a non-empty array" };
    }
    for (const d of cmd.dimensions) {
      if (d.points !== void 0 && !isFiniteVec3Array(d.points)) {
        return { valid: false, reason: "each points must be a non-empty array of finite Vec3" };
      }
      if (d.offsetMm !== void 0 && !Number.isFinite(d.offsetMm)) {
        return { valid: false, reason: "each offsetMm must be finite" };
      }
      if (d.precision !== void 0 && (!Number.isInteger(d.precision) || d.precision < 0 || d.precision > 6)) {
        return { valid: false, reason: "each precision must be an integer in [0, 6]" };
      }
    }
    return { valid: true };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type, "pryzm.dimension.count": cmd.dimensions.length }, () => {
      const built = cmd.dimensions.map((c) => {
        const id = c.id ?? createId("dimension");
        const seed = {
          id,
          levelId: c.levelId ?? "",
          viewId: c.viewId ?? "",
          kind: c.kind ?? "linear",
          points: c.points ?? [
            { x: 0, y: 0, z: 0 },
            { x: 1, y: 0, z: 0 }
          ],
          offsetMm: c.offsetMm ?? 8,
          units: c.units ?? "mm",
          precision: c.precision ?? 0,
          style: c.style ?? "architectural",
          overridden: c.overridden ?? false,
          overrideText: c.overrideText
        };
        try {
          return Dimension.parse(seed);
        } catch (err) {
          throw new DimensionSchemaError(err);
        }
      });
      const [next, forward, inverse] = produceCommand(ctx.stores.dimension, (draft) => {
        for (const d of built) draft[d.id] = d;
      });
      return { forward, inverse, nextStates: { dimension: next } };
    });
  }
}

class DeleteDimensionHandler {
  type = "dimension.delete";
  affectedStores = ["dimension"];
  canExecute(ctx, cmd) {
    if (typeof cmd.dimensionId !== "string" || cmd.dimensionId.length === 0) {
      return { valid: false, reason: "dimensionId must be a non-empty string" };
    }
    if (!ctx.stores.dimension[cmd.dimensionId]) {
      return { valid: false, reason: `dimension not found: ${cmd.dimensionId}` };
    }
    return { valid: true };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      if (!ctx.stores.dimension[cmd.dimensionId]) throw new DimensionNotFoundError(cmd.dimensionId);
      const [next, forward, inverse] = produceCommand(ctx.stores.dimension, (draft) => {
        delete draft[cmd.dimensionId];
      });
      return { forward, inverse, nextStates: { dimension: next } };
    });
  }
}

const DIMENSION_MOVE_UNREACHABLE = "dimension.move writes the detached plugin dimension store that nothing renders, exports or persists, and NO surface dispatches it — not MOVE_COMMAND_BY_TYPE, not the 3-D gizmo, not the Align tool, not the property panel. Dimensions the user can see are annotation elements written to the canonical annotationStore (§ANN-ONE-STORE) that AnnotationRenderLayer and ProjectSerializer read; annotation.move is the verb that translates those and it is LIVE. There is no live route on this store, so this cannot be committed.";
class MoveDimensionHandler {
  type = "dimension.move";
  affectedStores = ["dimension"];
  /** Payload validation ONLY — kept public so a delegating facade can reuse it. */
  validatePayload(ctx, cmd) {
    if (typeof cmd.dimensionId !== "string" || cmd.dimensionId.length === 0) {
      return { valid: false, reason: "dimensionId must be a non-empty string" };
    }
    if (!cmd.delta || !Number.isFinite(cmd.delta.x) || !Number.isFinite(cmd.delta.y) || !Number.isFinite(cmd.delta.z)) {
      return { valid: false, reason: "delta must have finite x, y, z" };
    }
    if (!ctx.stores.dimension[cmd.dimensionId]) {
      return { valid: false, reason: `dimension not found: ${cmd.dimensionId}` };
    }
    return { valid: true };
  }
  /**
   * §FIX-DEAD-MOVE-VERB-REFUSE (W3-4) — ORDER IS LOAD-BEARING. `canExecute` must be the
   * LAST method before `execute`. `tools/ga-gate/check-verb-register.ts` classifies a
   * verb as REFUSES by slicing the source from `canExecute` to the next `execute(` and
   * checking that the slice can never yield an ACCEPTING validation result. With
   * `validatePayload` sitting between them, its accepting branch lands inside that slice
   * and the verb is mis-reported as UNKNOWN — a refusal hiding from the register that
   * exists to find it. (For the same reason this comment must not spell the accepting
   * literal out: the detector is a regex over source text, and prose is source text.)
   * Do not reorder these two methods.
   */
  canExecute(ctx, cmd) {
    const v = this.validatePayload(ctx, cmd);
    if (!v.valid) return v;
    return { valid: false, reason: DIMENSION_MOVE_UNREACHABLE };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      if (!ctx.stores.dimension[cmd.dimensionId]) throw new DimensionNotFoundError(cmd.dimensionId);
      const [next, forward, inverse] = produceCommand(ctx.stores.dimension, (draft) => {
        const d = draft[cmd.dimensionId];
        if (!d) return;
        for (const p of d.points) {
          p.x += cmd.delta.x;
          p.y += cmd.delta.y;
          p.z += cmd.delta.z;
        }
      });
      return { forward, inverse, nextStates: { dimension: next } };
    });
  }
}

class SetDimensionPrecisionHandler {
  type = "dimension.setPrecision";
  affectedStores = ["dimension"];
  canExecute(ctx, cmd) {
    if (typeof cmd.dimensionId !== "string" || cmd.dimensionId.length === 0) {
      return { valid: false, reason: "dimensionId must be a non-empty string" };
    }
    if (!Number.isInteger(cmd.precision) || cmd.precision < 0 || cmd.precision > 6) {
      return { valid: false, reason: "precision must be an integer in [0, 6]" };
    }
    if (!ctx.stores.dimension[cmd.dimensionId]) {
      return { valid: false, reason: `dimension not found: ${cmd.dimensionId}` };
    }
    return { valid: true };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      if (!ctx.stores.dimension[cmd.dimensionId]) throw new DimensionNotFoundError(cmd.dimensionId);
      const [next, forward, inverse] = produceCommand(ctx.stores.dimension, (draft) => {
        const d = draft[cmd.dimensionId];
        if (!d) return;
        d.precision = cmd.precision;
      });
      return { forward, inverse, nextStates: { dimension: next } };
    });
  }
}

class SetDimensionUnitHandler {
  type = "dimension.setUnit";
  affectedStores = ["dimension"];
  canExecute(ctx, cmd) {
    if (typeof cmd.dimensionId !== "string" || cmd.dimensionId.length === 0) {
      return { valid: false, reason: "dimensionId must be a non-empty string" };
    }
    if (!isDimensionUnit(cmd.units)) {
      return { valid: false, reason: "units must be one of mm/cm/m/in/ft" };
    }
    if (!ctx.stores.dimension[cmd.dimensionId]) {
      return { valid: false, reason: `dimension not found: ${cmd.dimensionId}` };
    }
    return { valid: true };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      if (!ctx.stores.dimension[cmd.dimensionId]) throw new DimensionNotFoundError(cmd.dimensionId);
      const [next, forward, inverse] = produceCommand(ctx.stores.dimension, (draft) => {
        const d = draft[cmd.dimensionId];
        if (!d) return;
        d.units = cmd.units;
      });
      return { forward, inverse, nextStates: { dimension: next } };
    });
  }
}

class SetDimensionTextHandler {
  type = "dimension.setText";
  affectedStores = ["dimension"];
  canExecute(ctx, cmd) {
    if (typeof cmd.dimensionId !== "string" || cmd.dimensionId.length === 0) {
      return { valid: false, reason: "dimensionId must be a non-empty string" };
    }
    if (cmd.overrideText !== null && typeof cmd.overrideText !== "string") {
      return { valid: false, reason: "overrideText must be a string or null" };
    }
    if (!ctx.stores.dimension[cmd.dimensionId]) {
      return { valid: false, reason: `dimension not found: ${cmd.dimensionId}` };
    }
    return { valid: true };
  }
  execute(ctx, cmd) {
    return withHandlerSpan(this.type + ".handler", { "pryzm.command.type": this.type }, () => {
      if (!ctx.stores.dimension[cmd.dimensionId]) throw new DimensionNotFoundError(cmd.dimensionId);
      const [next, forward, inverse] = produceCommand(ctx.stores.dimension, (draft) => {
        const d = draft[cmd.dimensionId];
        if (!d) return;
        if (cmd.overrideText === null) {
          d.overridden = false;
          d.overrideText = void 0;
        } else {
          d.overridden = true;
          d.overrideText = cmd.overrideText;
        }
      });
      return { forward, inverse, nextStates: { dimension: next } };
    });
  }
}

function buildDimensionHandlerSet() {
  return [
    new CreateDimensionHandler(),
    new CreateManyDimensionsHandler(),
    new DeleteDimensionHandler(),
    new MoveDimensionHandler(),
    new SetDimensionPrecisionHandler(),
    new SetDimensionUnitHandler(),
    new SetDimensionTextHandler()
  ];
}

class ViewNotFoundError extends Error {
  constructor(viewId) {
    super(`[view.handler] View "${viewId}" not found.`);
    this.name = "ViewNotFoundError";
  }
}
class ViewAlreadyExistsError extends Error {
  constructor(viewId) {
    super(`[view.handler] View "${viewId}" already exists.`);
    this.name = "ViewAlreadyExistsError";
  }
}
class ViewValidationError extends Error {
  constructor(message) {
    super(`[view.handler] Validation failed: ${message}`);
    this.name = "ViewValidationError";
  }
}

const CreateViewHandler = {
  type: "view.create",
  affectedStores: ["view"],
  canExecute(ctx, cmd) {
    const id = cmd.definition.id ?? "";
    if (id && ctx.stores.view.getState().has(id)) {
      return { valid: false, reason: `View "${id}" already exists.` };
    }
    return { valid: true };
  },
  execute(ctx, cmd) {
    return withHandlerSpan("view.create.handler", { "pryzm.command.type": "view.create" }, () => {
      const raw = cmd.definition;
      const parsed = ViewDefinitionSchema.safeParse(raw);
      if (!parsed.success) {
        throw new ViewValidationError(parsed.error.issues.map((i) => i.message).join("; "));
      }
      const def = parsed.data;
      if (ctx.stores.view.getState().has(def.id)) {
        throw new ViewAlreadyExistsError(def.id);
      }
      return {
        forward: [{ op: "add", path: [def.id], value: def }],
        inverse: [{ op: "remove", path: [def.id] }]
      };
    });
  }
};

const DeleteViewHandler = {
  type: "view.delete",
  affectedStores: ["view"],
  canExecute(ctx, cmd) {
    if (!ctx.stores.view.getState().has(cmd.viewId)) {
      return { valid: false, reason: `View "${cmd.viewId}" not found.` };
    }
    return { valid: true };
  },
  execute(ctx, cmd) {
    return withHandlerSpan("view.delete.handler", { "pryzm.command.type": "view.delete" }, () => {
      const existing = ctx.stores.view.getState().get(cmd.viewId);
      if (!existing) throw new ViewNotFoundError(cmd.viewId);
      return {
        forward: [{ op: "remove", path: [cmd.viewId] }],
        inverse: [{ op: "add", path: [cmd.viewId], value: existing }]
      };
    });
  }
};

const RenameViewHandler = {
  type: "view.rename",
  affectedStores: ["view"],
  canExecute(ctx, cmd) {
    if (!ctx.stores.view.getState().has(cmd.viewId)) {
      return { valid: false, reason: `View "${cmd.viewId}" not found.` };
    }
    if (!cmd.name || cmd.name.trim().length === 0) {
      return { valid: false, reason: "View name must be non-empty." };
    }
    return { valid: true };
  },
  execute(ctx, cmd) {
    return withHandlerSpan("view.rename.handler", { "pryzm.command.type": "view.rename" }, () => {
      const existing = ctx.stores.view.getState().get(cmd.viewId);
      if (!existing) throw new ViewNotFoundError(cmd.viewId);
      const trimmed = cmd.name.trim();
      if (!trimmed) throw new ViewValidationError("View name must be non-empty.");
      return {
        forward: [{ op: "replace", path: [cmd.viewId, "name"], value: trimmed }],
        inverse: [{ op: "replace", path: [cmd.viewId, "name"], value: existing.name }]
      };
    });
  }
};

const SwitchViewHandler = {
  type: "view.switch",
  affectedStores: ["active-view"],
  canExecute(ctx, cmd) {
    if (!ctx.stores.view.getState().has(cmd.viewId)) {
      return { valid: false, reason: `View "${cmd.viewId}" not found.` };
    }
    return { valid: true };
  },
  execute(ctx, cmd) {
    return withHandlerSpan("view.switch.handler", { "pryzm.command.type": "view.switch" }, () => {
      if (!ctx.stores.view.getState().has(cmd.viewId)) {
        throw new ViewNotFoundError(cmd.viewId);
      }
      const prev = ctx.stores["active-view"].getActive();
      return {
        forward: [{ op: "replace", path: ["active", "activeViewId"], value: cmd.viewId }],
        inverse: [{ op: "replace", path: ["active", "activeViewId"], value: prev.activeViewId }]
      };
    });
  }
};

const UpdateViewCameraHandler = {
  type: "view.updateCamera",
  affectedStores: ["view"],
  canExecute(ctx, cmd) {
    if (!ctx.stores.view.getState().has(cmd.viewId)) {
      return { valid: false, reason: `View "${cmd.viewId}" not found.` };
    }
    return { valid: true };
  },
  execute(ctx, cmd) {
    return withHandlerSpan("view.updateCamera.handler", { "pryzm.command.type": "view.updateCamera" }, () => {
      const existing = ctx.stores.view.getState().get(cmd.viewId);
      if (!existing) throw new ViewNotFoundError(cmd.viewId);
      return {
        forward: [{ op: "replace", path: [cmd.viewId, "camera"], value: cmd.camera }],
        inverse: [{ op: "replace", path: [cmd.viewId, "camera"], value: existing.camera }]
      };
    });
  }
};

function sharedWallTypeSingleton() {
  return typeof window !== "undefined" ? window.wallSystemTypeStore : void 0;
}
function buildSharedWallCatalogue() {
  return {
    has: (_id) => true,
    get: (id) => sharedWallTypeSingleton()?.getById?.(id),
    list: () => sharedWallTypeSingleton()?.getAll?.() ?? [],
    add: (t) => sharedWallTypeSingleton()?.add?.(t),
    size: () => sharedWallTypeSingleton()?.getAll?.().length ?? 0
  };
}
let selectionStoreForThisBootstrap = null;
const ALL_PLUGINS = [
  // ---- Wall (carries the catalogue dep) ----
  {
    id: "wall",
    storeKey: "wall",
    buildStore: () => new WallStore(),
    // §FIX-WALL-TYPE-UNIFY-CATALOGUE (L-50) — was `new WallSystemTypeStore()`, a
    // FRESH plugin-side catalogue whose built-ins diverged from the picker's
    // (e.g. wt-monolithic 0.1 m here vs 1.0 m in geometry-wall). Now the ONE
    // shared geometry-wall catalogue, adapted to the handler interface.
    buildAuxiliaries: () => ({ wallSystemTypes: buildSharedWallCatalogue() }),
    buildHandlers: (deps) => {
      const systemTypeStore = deps.wallSystemTypes;
      return buildWallHandlerSet({ systemTypeStore });
    },
    // F-launch.1 (S81 F.1.01) — first plugin contribution: Wall →
    // Architecture rail tool.  F.1.02..F.1.13 add the remaining 12.
    contributions: [wallToolbarContribution]
  },
  // ---- Slab ----
  {
    id: "slab",
    storeKey: "slab",
    buildStore: () => new SlabStore(),
    buildHandlers: () => buildSlabHandlerSet()
  },
  // ---- Pool + Water (§FIX-POOL-UNREACHABLE, L-5200 · ADR-0124 · C100) ----
  //
  // ⭐ THIS IS THE WHOLE UNREACHABILITY FIX, AND IT IS THE `lighting` DESCRIPTOR'S
  // DEFECT VERBATIM (see §LIGHTING-STORE-FIX above).
  //
  // MEASURED 2026-08-22, before this descriptor existed — four independent axes,
  // each re-run rather than inherited from the L-980 note that first recorded them:
  //
  //   1. `rg -n "new PoolStore\(|new WaterStore\("` → ZERO construction sites
  //      repo-wide. The classes in `plugins/pool/src/store.ts` were never built,
  //      not even by the plugin's own tests.
  //   2. No `pool` / `water` storeKey was declared HERE, so the bus storesProvider
  //      (built from `stores[plugin.storeKey]` in bootstrap.everything.ts) had no
  //      such key, and `CommandBus.buildContext` (CommandBus.ts:286-292) THREW
  //        "pool.create: required store 'pool' is missing from HandlerContext.stores"
  //      before `pool.create` mutated anything. The handlers WERE registered
  //      (engineLauncher.ts:630) — registered but not dispatchable, which is the
  //      `[[authored-but-unwired-is-the-bottleneck]]` shape exactly.
  //   3. No tool, palette entry or plan handler dispatched `pool.create`; the only
  //      call sites were `plugins/pool/__tests__/`.
  //   4. The AI chat classifies `pool.create` as class B
  //      (`ChatCommandClassification.ts:66`), so that route refused it too.
  //
  // Axes 1 + 2 are closed by the two descriptors below. Axis 3 is closed by the
  // `pool` activator + the LANDSCAPE palette row + `PoolPlanToolHandler`. Axis 4 is
  // NOT closed here and is recorded as still-open in L-5206.
  //
  // ⚠ ORDER: pool sits after slab because `CreatePoolHandler.canExecute` reads the
  // HOST slab from `ctx.stores.slab`. That is a DISPATCH-time read, so array order
  // is not load-bearing — it is kept adjacent for the reader, not for correctness.
  {
    id: "pool",
    storeKey: "pool",
    buildStore: () => new PoolStore(),
    // `pool.create` / `pool.delete` declare affectedStores
    // ['pool','wall','slab','water'] — ALL FOUR must resolve, which is why the
    // water descriptor below is not optional.
    buildHandlers: () => buildPoolHandlerSet()
  },
  {
    id: "water",
    storeKey: "water",
    buildStore: () => new WaterStore(),
    // ⭐ NO HANDLERS, DELIBERATELY — and this is a statement, not an omission.
    // Water has no commands of its own: a water body is created and destroyed
    // ONLY as part of a pool assembly (ADR-0124 §4), so `pool.create` owns the
    // only write path. Minting a `water.create` here would be a second, rival way
    // to produce a water body with no pool around it — the exact defect ADR-0124
    // §4 exists to prevent. The store is contributed so the pool's fourth
    // affectedStore resolves; the command surface stays the pool's.
    buildHandlers: () => []
  },
  // ---- Door ----
  {
    id: "door",
    storeKey: "door",
    buildStore: () => new DoorStore(),
    buildHandlers: () => buildDoorHandlerSet()
  },
  // ---- Window ----
  {
    id: "window",
    storeKey: "window",
    buildStore: () => new WindowStore(),
    buildHandlers: () => buildWindowHandlerSet()
  },
  // ---- Roof ----
  {
    id: "roof",
    storeKey: "roof",
    buildStore: () => new RoofStore(),
    buildHandlers: () => buildRoofHandlerSet()
  },
  // ---- Curtain Wall ----
  {
    id: "curtain-wall",
    storeKey: "curtainwall",
    buildStore: () => new CurtainWallStore(),
    buildHandlers: () => buildCurtainWallHandlerSet()
  },
  // ---- Grid ----
  {
    id: "grid",
    storeKey: "grid",
    buildStore: () => new GridStore(),
    buildHandlers: () => buildGridHandlerSet()
  },
  // ---- Column ----
  {
    id: "column",
    storeKey: "column",
    buildStore: () => new ColumnStore(),
    buildHandlers: () => buildColumnHandlerSet()
  },
  // ---- Beam ----
  {
    id: "beam",
    storeKey: "beam",
    buildStore: () => new BeamStore(),
    buildHandlers: () => buildBeamHandlerSet()
  },
  // ---- Stair ----
  {
    id: "stair",
    storeKey: "stair",
    buildStore: () => new StairStore(),
    buildHandlers: () => buildStairHandlerSet()
  },
  // ---- Handrail ----
  {
    id: "handrail",
    storeKey: "handrail",
    buildStore: () => new HandrailStore(),
    buildHandlers: () => buildHandrailHandlerSet()
  },
  // ---- Ceiling ----
  {
    id: "ceiling",
    storeKey: "ceiling",
    buildStore: () => new CeilingStore(),
    buildHandlers: () => buildCeilingHandlerSet()
  },
  // ---- Floor (§P3.2-FL) ----
  // FloorStore provides the L1 bus store so ctx.stores.floor is materialised
  // for CreateFloorHandler / UpdateFloorLayersHandler.  The initTools.ts
  // §P3.2-FL bridge mirrors Immer patches to the legacy FloorStore for
  // FloorFragmentBuilder mesh rendering during the F-1.x migration window.
  {
    id: "floor",
    storeKey: "floor",
    buildStore: () => new FloorStore(),
    buildHandlers: () => buildFloorHandlerSet()
  },
  // ---- Balcony (§FEAT-BALCONY-COMPOUND, L-5600 · C103 · ADR-0333) ----
  //
  // ⭐ THIS DESCRIPTOR IS THE WHOLE REACHABILITY FIX, WRITTEN BEFORE THE DEFECT
  // RATHER THAN AFTER IT. The pool sat in this repo for weeks, fully built and fully
  // tested, and could not be dispatched AT ALL because these five lines did not
  // exist (§FIX-POOL-UNREACHABLE, L-5200). The production storesProvider is
  // `storesAsRecordView(stores)` over `stores[plugin.storeKey]` accumulated from
  // `ALL_PLUGINS` (bootstrap.everything.ts), so a plugin with no descriptor here
  // contributes no store key, and `CommandBus.buildContext` THROWS
  //     "balcony.create: required store 'balcony' is missing from HandlerContext.stores"
  // BEFORE any mutation — registered and undispatchable.
  //
  // `apps/editor/__tests__/balconyReachableThroughComposedRuntime.test.ts` exists to
  // make that unrepeatable: delete this descriptor and every test in it fails.
  //
  // ⚠ THE OTHER THREE STORES ARE *NOT* DECLARED HERE, AND THAT IS CORRECT.
  // `balcony.create` declares `affectedStores = ['balcony','slab','floor','handrail']`
  // — all four must resolve — but `slab`, `floor` and `handrail` are contributed by
  // their OWN descriptors above. A balcony's plate IS a slab and lives in the slab
  // store; that is the point of a compound (C103 §2.3). The pool needed a second
  // descriptor only because `water` was a genuinely new family with no home.
  //
  // ⚠ ORDER: balcony is placed after `slab`, `handrail` and `floor` because it
  // writes all three of their stores. Array order is NOT load-bearing — a handler
  // reads its stores at DISPATCH time, long after every descriptor has been built —
  // so this is for the reader, not for correctness. It is stated because the first
  // draft of this comment claimed an ordering the code did not have, which is
  // exactly the class of defect this file is otherwise full of warnings about.
  {
    id: "balcony",
    storeKey: "balcony",
    buildStore: () => new BalconyStore(),
    buildHandlers: () => buildBalconyHandlerSet()
  },
  // ---- ⭐⭐ Component (§COMPONENT-PLACE, audit §12 Phase 4C · ADR-0376 D9) ------
  //
  // THE JOIN. The universal-component-editor audit's headline gap, in its own words
  // (§3.1): **there is no bus verb anywhere in this repository that places a
  // component into a project.** This descriptor is what makes `component.place`
  // dispatchable at all — and it is the axis the pool proved is the silent one.
  //
  // ⚠ ONE STORE, and it is genuinely new. Unlike the balcony above — whose plate is
  // a `slab`, whose finish is a `floor` and whose railings are `handrail`s, all
  // contributed by their own descriptors — a placed component has NO member
  // families. Its three verbs each declare `affectedStores = ['component']`, so this
  // one key is the whole requirement; with the descriptor absent,
  // `CommandBus.buildContext` throws
  //
  //     component.place: required store 'component' is missing from HandlerContext.stores
  //
  // BEFORE any mutation, with the handlers registered and undispatchable. That is
  // §FIX-POOL-UNREACHABLE (L-5200), and it is why
  // `apps/editor/__tests__/componentJoinThroughComposedRuntime.test.ts` never
  // constructs a store: delete these four lines and every test in it fails.
  //
  // ⚠ ORDER IS NOT LOAD-BEARING. A handler reads its stores at DISPATCH time, long
  // after every descriptor is built. Placed here beside the other new families for
  // the reader only — stated because the balcony's comment above once claimed an
  // ordering the code did not have.
  {
    id: "component",
    storeKey: "component",
    buildStore: () => new ComponentStore(),
    buildHandlers: () => buildComponentHandlerSet()
  },
  // ---- Lift + LiftPart (§FEAT-LIFT-COMPOUND-SYSTEM, L-5700 · C104 · ADR-0325) ----
  //
  // ⭐ THESE TWO DESCRIPTORS ARE AXIS 2 OF THE FOUR-AXIS REACHABILITY CHECK, AND
  // AXIS 2 IS THE ONE THAT SILENTLY THROWS.
  //
  // The production storesProvider is `storesAsRecordView(stores)` over
  // `stores[plugin.storeKey]` accumulated from `ALL_PLUGINS`
  // (bootstrap.everything.ts:145). With no descriptor here, the key is simply
  // absent, and `CommandBus.buildContext` (CommandBus.ts:286-292) throws
  //
  //     lift.create: required store 'lift' is missing from HandlerContext.stores
  //
  // BEFORE anything mutates — with the handlers registered and undispatchable. That
  // is the `pool` defect (L-5200) and the `lighting` defect before it, and it is why
  // `apps/editor/__tests__/liftReachableThroughComposedRuntime.test.ts` reads
  // `rt.stores.lift` off the REAL composition root and never builds a store of its
  // own. A plugin's own suite CANNOT catch this: it supplies the provider that was
  // broken.
  //
  // ⚠ MEASURED STATE OF THE OTHER THREE AXES FOR `lift`, 2026-08-22, so nobody
  // inherits the stale reading the brief for this lane carried:
  //   1. `new LiftStore(` — 2 non-test sites (initBuilders.ts:982/987). That is the
  //      LOD-200 MASSING lift's store, a DIFFERENT store from the two below; see
  //      `LiftCompoundTypes.ts` for why both exist.
  //   3. DISPATCH — `lift` already has a palette button
  //      (`CreatePanelLayout.ts:278`, Structure > Lift) and an activator
  //      (`ToolsAreaLayout.ts:332`). ⚠ BOTH DRIVE THE LEGACY MASSING COMMAND
  //      (`CreateVerticalCirculationCommand`), NOT `lift.create`. So the tool key is
  //      armed and the COMPOUND is still not dispatchable from the UI. The earlier
  //      report that `lift` "arms nothing" was stale — it was fixed by
  //      §FIX-DECLARED-TOOL-WITH-NO-ACTIVATOR; the accurate statement is narrower and
  //      is recorded in L-5709.
  //   4. `ChatCommandClassification.ts` classifies `lift.create` class B, so the AI
  //      chat route refuses it. NOT closed here — recorded open in L-5710.
  //
  // ⚠ ORDER: lift sits after `slab`, `door` and `curtain-wall` because
  // `CreateLiftHandler` declares
  // `affectedStores = ['lift','liftPart','wall','curtainwall','door','slab']` and ALL
  // SIX must resolve. Array order is NOT load-bearing (a handler reads its stores at
  // DISPATCH time, long after every descriptor is built) — this is for the reader.
  {
    id: "lift",
    storeKey: "lift",
    buildStore: () => new LiftCompoundStore(),
    buildHandlers: () => buildLiftHandlerSet()
  },
  {
    id: "liftPart",
    storeKey: "liftPart",
    buildStore: () => new LiftPartStore(),
    // ⭐ NO HANDLERS, DELIBERATELY — a statement, not an omission, and the same
    // statement the `water` descriptor makes. A cabin part is created and destroyed
    // ONLY as part of a lift compound (C104 §2), so `lift.create` owns the only
    // write path. Minting a `liftPart.create` would be a second, rival way to
    // produce a car ceiling with no car around it — exactly the defect the
    // single-write-path rule exists to prevent. The store is contributed so the
    // lift's second affectedStore resolves; the command surface stays the lift's.
    buildHandlers: () => []
  },
  // ---- BoundaryLine (§FEAT-CONSTRUCTION-BOUNDARY-LINE, L-7914 · C106 · ADR-0348) ----
  //
  // ⭐ AXIS 2 OF THE FOUR-AXIS REACHABILITY CHECK — THE ONE THAT THROWS SILENTLY.
  // With no descriptor here the key is simply absent from
  // `storesAsRecordView(stores)` and `CommandBus.buildContext` (CommandBus.ts:286-292)
  // throws
  //
  //     boundaryLine.create: required store 'boundaryLine' is missing from HandlerContext.stores
  //
  // BEFORE anything mutates — with the handlers registered and undispatchable. That is
  // the `pool` defect (L-5200), the `lift` defect (L-5700) and the `lighting` defect
  // before both, and it is why
  // `apps/editor/__tests__/boundaryLineReachableThroughComposedRuntime.test.ts` reads
  // `rt.stores.boundaryLine` off the REAL composition root and never builds a store of
  // its own. A plugin's own suite CANNOT catch this: it supplies the provider that was
  // broken.
  //
  // ⭐ AND THIS IS THE FAMILY'S **ONLY** STORE. C84 §1 measures five rival
  // representations per family and rows 2/3 — the plugin DTO store and the legacy
  // geometry store — are the pair that keeps diverging (`MoveWall.ts` refuses
  // `wall.move` in as many words). `boundaryLine` has no geometry twin: this instance
  // IS the authority, which makes C84 EI-1 hold by construction rather than by
  // discipline. `boundaryLineHasOneStore.test.ts` checks the claim rather than
  // asserting it.
  //
  // ⚠ ORDER IS NOT LOAD-BEARING — every handler here declares `affectedStores:
  // ['boundaryLine']` and nothing else, because creating, attaching to, updating or
  // deleting a boundary line writes exactly one store. The MOVE is the multi-store
  // gesture, and it is deliberately NOT a plugin handler (see
  // `plugins/boundary-line/src/handlers/index.ts` for why).
  {
    id: "boundary-line",
    storeKey: "boundaryLine",
    buildStore: () => new BoundaryLineStore(),
    buildHandlers: () => buildBoundaryLineHandlerSet()
  },
  // ---- Furniture (E-finish.0.E orphan registration) ----
  {
    id: "furniture",
    storeKey: "furniture",
    buildStore: () => new FurnitureStore(),
    buildHandlers: () => buildFurnitureHandlerSet()
  },
  // ---- Plumbing (E-finish.0.E orphan registration) ----
  //
  // ⚠ §BATH102 — `buildPlumbingHandlerSet()` ALSO registers `bathroomPod.create` and
  // `bathroomPod.delete` (C109). Their `affectedStores: ['bathroomPod']` resolves
  // against the store the `bathroomPod` descriptor below contributes, NOT this one:
  // `storesAsRecordView(stores)` is built from EVERY descriptor's store, which is how
  // `CreateLiftHandler` — registered by the `lift` descriptor — resolves `wall`,
  // `curtainwall`, `door` and `slab` from four other descriptors.
  {
    id: "plumbing",
    storeKey: "plumbing",
    buildStore: () => new PlumbingStore(),
    buildHandlers: () => buildPlumbingHandlerSet()
  },
  // ---- BathroomPod (§BATH102 · C109 · L-11480) ----
  //
  // ⭐ AXIS 1 AND AXIS 2 OF C109 §9's SEVEN, AND AXIS 2 IS THE ONE THAT SILENTLY
  // THROWS. The production storesProvider is `storesAsRecordView(stores)` over
  // `stores[plugin.storeKey]` accumulated from `ALL_PLUGINS`
  // (bootstrap.everything.ts:145). With no descriptor here the key is simply absent
  // and `CommandBus.buildContext` (CommandBus.ts:286-292) throws
  //
  //     bathroomPod.create: required store 'bathroomPod' is missing from HandlerContext.stores
  //
  // BEFORE anything mutates — with the handlers registered and undispatchable. That is
  // the `pool` defect (L-5200), the `lift` defect (L-5700) and the `lighting` defect
  // before both, and it is why
  // `apps/editor/__tests__/bathroomPodReachableThroughComposedRuntime.test.ts` reads
  // `rt.stores.bathroomPod` off the REAL composition root and never builds a store of
  // its own. A plugin's own suite CANNOT catch this: it supplies the provider that was
  // broken.
  //
  // ⭐ AND THIS IS THE FAMILY'S **ONLY** STORE — the `boundaryLine` shape (C106 §1),
  // not the `plumbing` one. C84 §1's rows 2/3 (a plugin DTO store and a legacy geometry
  // store that keep diverging) do not both exist here, so C84 EI-1 holds BY
  // CONSTRUCTION. See `plugins/plumbing/src/bathroomPodStore.ts`.
  //
  // ⭐ NO HANDLERS ON THIS DESCRIPTOR, DELIBERATELY — a statement, not an omission, and
  // it is the `water` / `liftPart` idiom with a DIFFERENT reason, written down in
  // `STORE_ONLY_PLUGIN_IDS` below. The pod DOES own two verbs; they are registered by
  // the `plumbing` descriptor above because C109 §0 governs the pod's store and
  // handlers as living in `plugins/plumbing/`, and a descriptor carries exactly ONE
  // `storeKey`. ⛔ Giving this descriptor the handlers instead would need a
  // `plugins/bathroom-pod/` DIRECTORY, and arm D of
  // `tools/ga-gate/check-plugin-census-equivalence.ts` is HARD-0 on
  // *"REGISTRY \ DISK — booted with no directory"*.
  {
    id: "bathroomPod",
    storeKey: "bathroomPod",
    buildStore: () => new BathroomPodStore(),
    buildHandlers: () => []
  },
  // ---- Lighting (§LIGHTING-STORE-FIX 2026-06-26) ----
  //
  // Sibling of plumbing: the lighting handlers were already registered (via
  // registerLightingHandlers in engineLauncher AND, authoritatively, here through
  // buildHandlers), but no STORE was contributed — so the bus storesProvider
  // (built from `stores[plugin.storeKey]` in bootstrap.everything.ts) had no
  // `lighting` key. CreateLightingHandler.affectedStores = ['lighting'] and reads
  // ctx.stores.lighting, so every lighting.create threw
  //   "required store 'lighting' is missing from HandlerContext.stores" (ADR-002 §3)
  // — 48× per furnish (once per fixture), and the post-furnish fixtures never
  // rendered. Contributing LightingStore under storeKey 'lighting' (exact mirror of
  // the plumbing descriptor) closes the create→`lighting.created`→legacy-3D-store
  // bridge that initTools already wires.
  {
    id: "lighting",
    storeKey: "lighting",
    buildStore: () => new LightingStore(),
    buildHandlers: () => buildLightingHandlerSet()
  },
  // ---- Rooms (E-finish.0.E orphan registration) ----
  //
  // Task 1.3 (C11 §6.3) — rooms is the first plugin to declare a
  // `wireSubscriptions` callback.  `wireAllPluginSubscriptions(runtime)` calls
  // it once after `composeRuntime()` so room boundaries are recomputed
  // event-driven (wall.created / curtain-wall.created → room.redetect)
  // rather than via imperative commandManager.execute() calls.
  {
    id: "rooms",
    storeKey: "rooms",
    buildStore: () => new RoomsPluginStore(),
    buildHandlers: () => buildRoomHandlerSet(),
    wireSubscriptions: wireRoomEventSubscriptions
  },
  // ---- Structural (E-finish.0.E orphan registration) ----
  {
    id: "structural",
    storeKey: "structural",
    buildStore: () => new StructuralStore(),
    buildHandlers: () => buildStructuralHandlerSet()
  },
  // ---- Dimensions (E-finish.0.E orphan registration) ----
  // §FIX-DIMENSION-STOREKEY-SINGULAR (L-138): storeKey MUST be 'dimension'
  // (singular) to match every handler's affectedStores=['dimension'] +
  // ctx.stores.dimension. Was 'dimensions' (plural) — the bus storesProvider
  // then had no 'dimension' key, so dimension.createMany (AutoDimension) threw
  // "required store 'dimension' is missing" (ADR-002 §3). Mirror of
  // §LIGHTING-STORE-FIX. The DimensionStore held no bus data before (this bug
  // blocked all bus dimension creates), so no persistence is orphaned.
  {
    id: "dimensions",
    storeKey: "dimension",
    buildStore: () => new DimensionStore(),
    buildHandlers: () => buildDimensionHandlerSet()
  },
  // ---- Selection (Wave 18 — zero-dep handler registration) ----
  //
  // `SelectionStore` lives in `packages/stores/` (not in the plugin package).
  // `buildSelectionHandlerSet()` takes NO deps and returns the three
  // canonical handlers (selection.select / .deselect / .clear).  Handlers
  // access `ctx.stores.selection`.
  //
  // ⛔ §SEL-STORE-IDENTITY (W4d) — THIS COMMENT USED TO END: "the SelectionStore
  // registered here under storeKey 'selection' satisfies that contract in the
  // legacy `bootstrapWithEverything()` path". IT DID NOT, AND HAD NOT SINCE THE
  // BUS SWITCHED TO A RECORD VIEW. Registering the store under the matching key
  // satisfies the NAME; it does not satisfy the SHAPE. The bus hands handlers
  // `storesAsRecordView(stores)` — `Object.fromEntries(store.getState())`,
  // a `Record<id,dto>` with no methods (`bootstrap.ts:94` / `:148-158`) — so
  // measured at the real composition root, FOUR of the five verbs threw
  // `ctx.stores.selection.<method> is not a function`, INCLUDING the
  // `selection.clear` the default pointer tool dispatches at line ~1223 below
  // into a swallowing `.catch(console.error)`.
  //
  // The store is therefore handed to `buildSelectionHandlerSet` directly. Same
  // instance, both slots — see `selectionStoreForThisBootstrap` above for why a
  // holder is needed and why a second store would be a rival, not a fix.
  //
  // ⚠ STILL NOT TRUE, so it is not implied: nothing POPULATES this store from
  // the 3-D viewport. `packages/input-host/SelectionManager`,
  // `runtime.selection` (`composeRuntime.ts:328`) and
  // `packages/core-app-model/SelectionBus` are the three live selection
  // authorities; these verbs are a fourth surface that only a `selection.*`
  // dispatch fills. Making them dispatchable does NOT make the toolbar's Copy
  // button see the user's 3-D selection.
  {
    id: "selection",
    storeKey: "selection",
    buildStore: () => {
      selectionStoreForThisBootstrap = new SelectionStore();
      return selectionStoreForThisBootstrap;
    },
    buildHandlers: () => buildSelectionHandlerSet(
      selectionStoreForThisBootstrap === null ? {} : { store: selectionStoreForThisBootstrap }
    )
  },
  // ---- Annotations (Wave 18 — zero-dep handler registration) ----
  //
  // `AnnotationStore` lives in `packages/stores/` (re-exported by both
  // `@pryzm/plugin-sdk` and `@pryzm/plugin-annotations`).
  // `buildAnnotationHandlerSet()` takes NO deps and returns the 8
  // annotation command handlers (annotation.create / .delete / .move /
  // .setText / .setKind / .setRotation / .setTextHeight / .setColor).
  // Handlers access `ctx.stores.annotation` — storeKey 'annotation'
  // matches that access pattern.
  {
    id: "annotations",
    storeKey: "annotation",
    buildStore: () => new AnnotationStore(),
    buildHandlers: () => buildAnnotationHandlerSet()
  },
  // ---- View (13th plugin — ViewRegistry IS a Store<ViewDefinition>) ----
  //
  // Note: the view handlers (`view.create` / `view.delete` / …) read
  // `ctx.stores.view.getState()` (the Map view) rather than the
  // `Record<id, ViewDefinition>` view that bootstrap's default
  // `storesProvider` exposes.  Calling `view.*` commands through the
  // bus requires a custom storesProvider that passes the ViewRegistry
  // instance directly — that wiring is owned by W-2A view-state
  // integration.  W-1C-1 ships the registry contribution so the
  // store is present + the handlers are registered; the bus-level
  // override is the 2A milestone's responsibility.
  {
    id: "view",
    storeKey: "view",
    buildStore: () => new ViewRegistry(),
    buildHandlers: () => [
      CreateViewHandler,
      DeleteViewHandler,
      RenameViewHandler,
      SwitchViewHandler,
      UpdateViewCameraHandler
    ]
  },
  // ---- Section view — §PLUGIN-DESCRIPTOR-AT-L5 (L-9922, ADR-0367) ----------
  //
  // ⭐ THE ONLY ELEMENT OF THIS ARRAY THAT IS NOT AN OBJECT LITERAL, AND THAT IS
  // THE ENTIRE DEMONSTRATION. The record is authored in
  // `plugins/section-view/src/registration.ts` — inside the plugin, at L6,
  // against a contract at L5. Nothing about section-view is described here any
  // more; this line only says that it participates.
  //
  // ⚠ IT WAS ALSO LIVE-BROKEN, WHICH IS WHY IT WAS CHOSEN OVER A COSMETIC
  // MIGRATION OF AN ALREADY-WORKING FAMILY. `engineLauncher.ts:711` has been
  // calling `registerSectionHandlers(_bus)` on the real runtime bus since
  // §P3.4-SE, so all six `section.*` verbs were REGISTERED. No descriptor
  // existed, so no `section` key reached `storesAsRecordView(stores)`, and all
  // six handlers declare `affectedStores = ['section']`. Every dispatch died in
  // `CommandBus.buildContext` with
  //     "section.create: required store 'section' is missing from HandlerContext.stores"
  // before touching anything — the tenth instance of the pool (L-5200) / lift
  // (L-5700) / lighting shape, and the FIRST found by a gate
  // (`check-plugin-census-equivalence.ts` arm A) instead of by a person.
  //
  // engineLauncher needs no edit: its `_bus` is the §OI-053 skip-if-present
  // proxy, so the composition root now registers these six FIRST and that call
  // becomes an idempotent no-op — the same relationship `registerWallHandlers`
  // already has with the wall descriptor.
  //
  // storeKey is `'section'`, NOT `'section-view'`. The id must match the
  // DIRECTORY (the census gate compares it to `ls plugins/`); the storeKey must
  // match what the handlers read. §FIX-DIMENSION-STOREKEY-SINGULAR (L-138) is
  // the same divergence in the other direction.
  sectionViewPluginRegistration
];
const ELEMENT_PLUGIN_IDS = [
  "wall",
  "slab",
  // §FIX-POOL-UNREACHABLE (L-5200) — both contribute a non-empty storeKey, so both
  // belong in the list the storeKey assertion iterates. `water` contributes no
  // handlers by design; see STORE_ONLY_PLUGIN_IDS below.
  "pool",
  "water",
  // §FEAT-BALCONY-COMPOUND (L-5600) — contributes a non-empty storeKey AND a
  // handler set, so it belongs in the list the storeKey assertion iterates and needs
  // no STORE_ONLY_PLUGIN_IDS exemption.
  "balcony",
  // §FEAT-LIFT-COMPOUND-SYSTEM (L-5700) — `lift` contributes a storeKey AND a
  // handler set. `liftPart` contributes a storeKey and NO handlers by design, so it
  // needs a written reason in STORE_ONLY_PLUGIN_IDS below (the bootstrap test
  // requires >= 1 handler per plugin unless the id is named there).
  "lift",
  "liftPart",
  // §FEAT-CONSTRUCTION-BOUNDARY-LINE (L-7914) — contributes a non-empty storeKey AND
  // a handler set, so it belongs in the list the storeKey assertion iterates and needs
  // no STORE_ONLY_PLUGIN_IDS exemption.
  "boundary-line",
  "door",
  "window",
  "roof",
  "curtain-wall",
  "grid",
  "column",
  "beam",
  "stair",
  "handrail",
  "ceiling",
  "furniture",
  "plumbing",
  // §BATH102 (L-11480) — the C109 compound contributes a non-empty storeKey and NO
  // handlers of its own, so it belongs in the list the storeKey assertion iterates AND
  // needs a written reason in STORE_ONLY_PLUGIN_IDS below. ⚠ Omitting this row would
  // NOT have failed anything loudly — it would simply have landed in arm F of
  // `check-plugin-census-equivalence.ts` beside `floor`, `lighting` and `view`, which
  // is why the row and the descriptor must land in the SAME commit.
  "bathroomPod",
  "rooms",
  "structural",
  "dimensions",
  "selection",
  "annotations",
  // §PLUGIN-DESCRIPTOR-AT-L5 (L-9922) — contributes storeKey `'section'` AND six
  // handlers, so it belongs in the list the bootstrap suite's storeKey assertion
  // iterates and needs no STORE_ONLY_PLUGIN_IDS exemption. ⚠ Omitting this row
  // would NOT have failed anything loudly: the descriptor would still boot, and
  // the per-plugin storeKey assertion would simply never look at it. That silent
  // hole is arm F of `check-plugin-census-equivalence.ts`, and it is why the row
  // and the descriptor must land in the SAME commit.
  "section-view"
];
const STORE_ONLY_PLUGIN_IDS = Object.freeze({
  // ADR-0124 §4 — a water body exists ONLY as part of a pool assembly. `pool.create`
  // writes it and `pool.delete` removes it; there is no gesture that produces water
  // on its own, so there is no `water.*` verb to register. Minting one would create a
  // second, rival way to put water in a project with no pool around it — precisely
  // what ADR-0124 §4 rules out. The STORE is still contributed because
  // `pool.create` declares `affectedStores = ['pool','wall','slab','water']` and
  // `CommandBus.buildContext` throws unless all four keys resolve.
  water: "ADR-0124 §4 — water is created and destroyed only by pool.* ; it owns no verb of its own.",
  // C104 §2 — a lift CABIN PART exists ONLY as part of a lift compound.
  // `lift.create` writes the five of them and `lift.delete` removes them; there is
  // no gesture that produces a car ceiling on its own, so there is no `liftPart.*`
  // verb to register. Minting one would be a second, rival way to produce a cabin
  // part with no cabin around it. The STORE is still contributed because
  // `lift.create` declares `liftPart` among its six affectedStores and
  // `CommandBus.buildContext` throws unless all six keys resolve.
  liftPart: "C104 §2 — cabin parts are created and destroyed only by lift.* ; they own no verb of their own.",
  // §BATH102 · C109 §0 — ⚠ THIS EXEMPTION'S REASON IS DIFFERENT FROM THE TWO ABOVE,
  // AND SAYING SO IS THE POINT. `water` and `liftPart` own NO verb at all. The bathroom
  // pod owns TWO (`bathroomPod.create` / `bathroomPod.delete`, C109 R-1) — they are
  // simply registered by the `plumbing` descriptor, because C109 §0 governs the pod's
  // store AND its handlers as living in `plugins/plumbing/` and a descriptor carries
  // exactly ONE storeKey. So THIS descriptor really does contribute zero handlers, the
  // assertion this list refines is really satisfied, and the verbs really are on the
  // bus — verified by `bathroomPodReachableThroughComposedRuntime.test.ts`, which
  // dispatches through the REAL composed runtime rather than trusting this comment.
  bathroomPod: "C109 §0 — the pod's two verbs are registered by the `plumbing` descriptor (its store and handlers live in plugins/plumbing/); this descriptor exists to contribute the store, which bathroomPod.create declares."
});

const EDITOR_TRACER_NAME = "pryzm.editor";
async function bootstrapWithEverything(opts) {
  const BOOT_BATCH_SIZE = 3;
  const tracer = trace.getTracer(EDITOR_TRACER_NAME);
  const bootSpan = tracer.startSpan("pryzm.boot");
  const bootStartMs = typeof performance !== "undefined" ? performance.now() : Date.now();
  let bootSpanEnded = false;
  function endBootSpanOk(extraAttrs = {}) {
    if (bootSpanEnded) return;
    bootSpanEnded = true;
    for (const [k, v] of Object.entries(extraAttrs)) bootSpan.setAttribute(k, v);
    bootSpan.setStatus({ code: SpanStatusCode.OK });
    bootSpan.end();
  }
  function endBootSpanError(err) {
    if (bootSpanEnded) return;
    bootSpanEnded = true;
    bootSpan.recordException(err);
    bootSpan.setStatus({
      code: SpanStatusCode.ERROR,
      message: err instanceof Error ? err.message : String(err)
    });
    bootSpan.end();
  }
  const yieldToMain = () => new Promise((resolve) => setTimeout(resolve, 0));
  try {
    performance.mark("pryzm:bootstrap:stores:start");
    const stores = {};
    const auxiliaries = {};
    const registeredStoreKeys = {};
    for (let i = 0; i < ALL_PLUGINS.length; i++) {
      const plugin = ALL_PLUGINS[i];
      const aux = plugin.buildAuxiliaries?.();
      if (aux !== void 0) {
        for (const [k, v] of Object.entries(aux)) auxiliaries[k] = v;
      }
      const store = plugin.buildStore();
      registeredStoreKeys[plugin.id] = plugin.storeKey;
      if (store !== void 0 && plugin.storeKey.length > 0) {
        stores[plugin.storeKey] = store;
      }
      if ((i + 1) % BOOT_BATCH_SIZE === 0 && i < ALL_PLUGINS.length - 1) {
        await yieldToMain();
      }
    }
    performance.mark("pryzm:bootstrap:stores:end");
    performance.measure("pryzm:bootstrap:stores", "pryzm:bootstrap:stores:start", "pryzm:bootstrap:stores:end");
    await yieldToMain();
    performance.mark("pryzm:bootstrap:handlers:start");
    const deps = auxiliaries;
    const handlers = [];
    const registeredHandlerTypes = {};
    for (let i = 0; i < ALL_PLUGINS.length; i++) {
      const plugin = ALL_PLUGINS[i];
      const set = plugin.buildHandlers(deps);
      const types = [];
      for (const h of set) {
        handlers.push(h);
        types.push(h.type);
      }
      registeredHandlerTypes[plugin.id] = types;
      if ((i + 1) % BOOT_BATCH_SIZE === 0 && i < ALL_PLUGINS.length - 1) {
        await yieldToMain();
      }
    }
    performance.mark("pryzm:bootstrap:handlers:end");
    performance.measure("pryzm:bootstrap:handlers", "pryzm:bootstrap:handlers:start", "pryzm:bootstrap:handlers:end");
    if (opts.stores !== void 0) {
      for (const [k, v] of Object.entries(opts.stores)) stores[k] = v;
    }
    for (const h of opts.handlers ?? []) handlers.push(h);
    performance.mark("pryzm:bootstrap:wire:start");
    const inner = bootstrap({
      audit: opts.audit,
      stores,
      handlers,
      committers: opts.committers,
      onUnboundPrimitive: opts.onUnboundPrimitive,
      persistenceClient: opts.persistenceClient
    });
    performance.mark("pryzm:bootstrap:wire:end");
    performance.measure("pryzm:bootstrap:wire", "pryzm:bootstrap:wire:start", "pryzm:bootstrap:wire:end");
    const wallSystemTypes = auxiliaries.wallSystemTypes;
    const viewRegistry = stores.view;
    const totalHandlerCount = Object.values(registeredHandlerTypes).reduce((acc, types) => acc + types.length, 0);
    bootSpan.setAttribute("boot.module_count", ALL_PLUGINS.length);
    bootSpan.setAttribute("boot.handler_count", totalHandlerCount);
    bootSpan.setAttribute("boot.store_count", Object.keys(stores).length);
    const bootElapsedMs = (typeof performance !== "undefined" ? performance.now() : Date.now()) - bootStartMs;
    bootSpan.setAttribute("boot.elapsed_wall_ms", bootElapsedMs);
    if (typeof opts.onFirstFrame === "function") {
      opts.onFirstFrame(() => {
        const nowMs = typeof performance !== "undefined" ? performance.now() : Date.now();
        endBootSpanOk({ "boot.first_frame_ms": nowMs - bootStartMs });
      });
    } else {
      endBootSpanOk({ "boot.async_wall_ms": bootElapsedMs });
    }
    return {
      ...inner,
      wallSystemTypes,
      viewRegistry,
      auxiliaries,
      registeredHandlerTypes,
      registeredStoreKeys
    };
  } catch (err) {
    endBootSpanError(err);
    throw err;
  }
}

export { ALL_PLUGINS, ELEMENT_PLUGIN_IDS, STORE_ONLY_PLUGIN_IDS, bootstrapWithEverything };
