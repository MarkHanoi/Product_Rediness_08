// CreateWallHandler — the canonical PRYZM 2 wall handler (S07-T4).
//
// Mirrors `src/commands/walls/CreateWallCommand.ts` (349 LOC) — but
// with PRYZM 2's contract changes:
//   • `affectedStores: ['wall'] as const` (single-store; level integration
//     deferred to LevelStore landing in 1C — see ADR-008 §3.D).  PRYZM 1
//     declared `['wall', 'level']` defensively at `CreateWallCommand.ts:51`,
//     but the new handler only WRITES to wall — level lookup (when available)
//     would be read-only via `ctx.stores.level`, which the bus filter
//     (`PatchSnapshotEntry.forwardPatches`) does not yet route correctly
//     for non-prefixed paths in multi-store handlers.
//   • No O(N) `_neighbourSnapshot` — the join-cascade undo lives in the
//     L4 cascade infra that lands with the producer in S08 (see blocker
//     analysis in §S07).  Local undo is the inverse Immer patch only.
//   • ULID id minting via `@pryzm/schemas/factory/createId` (replaces
//     `crypto.randomUUID()` at PRYZM 1 line 32).  Parity capture
//     normalises ids to `'<id>'` before comparison.
//   • OTel span owned by the bus (`pryzm.command.execute` wraps the
//     entire `canExecute → execute → emit → undo.push` pipeline);
//     this handler adds no nested span — first nested span lands in
//     S08 once the producer is invoked from a committer.

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { Wall, createId } from '@pryzm/plugin-sdk';
import {
  WallDimensionsError,
  WallSchemaError,
  WallSystemTypeNotFoundError,
} from '../errors.js';
import type { WallData, WallsState } from '../store.js';
import type { WallSystemTypeStore } from '../system-type-store.js';
import { resolveWallSystemType } from '../resolveWallSystemType.js';
// §FIX-CREATE-DTO-ONLY-SUCCESS — the AUTHORITATIVE-store census, nothing else.
// Reached through the SDK FACADE, not around it: `@pryzm/plugin-sdk` re-exports
// `storeRegistry` for exactly this question (see the widening note at the foot of
// `packages/plugin-sdk/src/index.ts`). This module is READ here and never written —
// ADR-0318 I-2 makes population the composition root's job, never a plugin's.
import { storeRegistry } from '@pryzm/plugin-sdk';

/**
 * §FIX-CREATE-DTO-ONLY-SUCCESS (BIM30 Phase 2) — why `wall.create` now refuses in
 * SOME processes and not others, and why that is a fact rather than a hedge.
 *
 * MEASURED. The CA-21 executed read-back
 * (`tools/rac-conformance/runtime-harness/__tests__/liveness.probe.ts`) dispatched
 * `wall.create` on the composed bus and read `runtime.stores.elements.get('wall')`
 * — the authoritative `wallStore` singleton `ProjectSerializer` reads, made
 * reachable by ADR-0318 wave 1. Verdict: **`readback-negative` — dispatch reported
 * success; the AUTHORITATIVE store did not change.**
 *
 * ─── WHY NOT "REFUSE", the door.create answer ──────────────────────────────
 * `door.create` was converted to an unconditional refusal because it was dead
 * everywhere and a door is a hosted opening. `wall.create` is the OPPOSITE case:
 * it is the live production creation path for `WallTool`, `WallPlanToolHandler`,
 * `PreviewManager`, `CopyPlanToolHandler` and every `wall.batch.create` the
 * apartment/house generators drive. An unconditional refusal would delete wall
 * creation from the product.
 *
 * ─── WHY NOT "WRITE THE AUTHORITATIVE STORE" EITHER ────────────────────────
 * Two independent reasons, both from source:
 *
 *  1. **In the browser it would be a SECOND write site.** The authoritative write
 *     already happens — `apps/editor/src/engine/initTools.ts` subscribes to
 *     `runtime.events.on('wall.created')` (the event `CommandEventBridge` emits
 *     from THIS command's patch pair) and performs `wallStore.add(...)` on the
 *     adopted singleton, plus the `viewDependencyTracker` + `bimManager` level
 *     registration. That bridge deliberately registers BEFORE it adds
 *     (§G3-STALE-FIX): `WallStore.add()` synchronously fires StoreEventBus, and an
 *     unregistered wall sends every plan view down the §G3-STALE-EVENT
 *     mark-all-views-dirty fallback. A write from inside this handler would land
 *     ahead of that registration and reintroduce the defect on every wall create.
 *
 *  2. **Headlessly it is impossible BY DESIGN.** `WallStore.add()` needs the level
 *     authority to run its level-existence guard, and ADR-0318 I-3 makes it REFUSE
 *     (`WallStoreEngineNotAttachedError`) rather than invent a level when the
 *     engine half is not attached. A composed runtime with no engine half cannot
 *     create a wall, and the store says so itself.
 *
 * ─── SO THE DEFECT THAT IS ACTUALLY AVAILABLE TO FIX IS THE FALSE SUCCESS ──
 * The verb is conditionally live, and until now it reported success identically in
 * both conditions. It no longer does. The predicate is the process's OWN
 * declaration of what is authoritative here, and it is three-valued — matching
 * CA-21's own three verdicts rather than collapsing them to two:
 *
 *   • **No authoritative wall store registered** (a plugin unit test, the
 *     `apps/bake-worker` closed DTO loop): this handler's patch pair IS the whole
 *     contract in that process. Proceed. Nothing is being lied about.
 *   • **Registered AND engine-attached** (the browser, after
 *     `initBuilders.ts` calls `wallStore.attachEngine`): the bridge above completes
 *     the write. Proceed — production is byte-for-byte unchanged.
 *   • **Registered AND NOT attached** (the composed headless runtime — the exact
 *     case the probe measured): the authoritative store exists in this process and
 *     provably cannot receive this create. REFUSE, and name why.
 */
const WALL_CREATE_UNREACHABLE =
  'wall.create: this process registers an authoritative WallStore (ADR-0318 §ADR-0318-ELEMENTS-SLOT, ' +
  'the instance ProjectSerializer reads) but its engine half is NOT attached, so the create cannot land: ' +
  'WallStore.add() refuses rather than admit a wall onto a level it cannot check (ADR-0318 I-3, ' +
  'WallStoreEngineNotAttachedError). This handler will not report success for a write that reaches only the ' +
  'detached plugin DTO store. wall.create completes in a runtime that ALSO composes the engine half: ' +
  'apps/editor/src/engine/initBuilders.ts calls wallStore.attachEngine(projectContext, bimManager), and ' +
  "initTools.ts's runtime.events.on('wall.created') bridge performs the authoritative wallStore.add plus the " +
  'viewDependencyTracker/bimManager level registration.';

/**
 * §FIX-CREATE-DTO-ONLY-SUCCESS — the three-valued census above, in code.
 * Returns the refusal reason, or `null` when this handler's write is honest here.
 */
function authoritativeWallStoreRefusal(): string | null {
  const s = storeRegistry.getStoreForType('wall') as
    | { isEngineAttached?: () => boolean }
    | undefined;
  // No authoritative store in this process — the DTO patch pair is the contract.
  if (!s) return null;
  // Registered, but not the ADR-0318 singleton shape: unjudgeable, and an
  // unjudgeable case must not be scored as a failure (§CONTEXT-DATA-HONESTY).
  if (typeof s.isEngineAttached !== 'function') return null;
  if (s.isEngineAttached()) return null;
  return WALL_CREATE_UNREACHABLE;
}

/** Optional shape for the create-wall input.  Every field falls back
 *  to the schema defaults — `Wall.parse({})` is a valid wall. */
export interface CreateWallPayload {
  /** Owning level id.  Empty string is allowed at S07 (level store is
   *  not registered yet); 1C tightens this to a non-empty branded id. */
  readonly levelId?: string;
  /** Optional caller-provided id.  When omitted a fresh ULID is minted
   *  via `createId('wall')`.  Useful for deterministic test fixtures. */
  readonly id?: string;
  readonly baseLine?: WallData['baseLine'];
  readonly height?: number;
  readonly thickness?: number;
  readonly baseOffset?: number;
  readonly materialColor?: string;
  readonly materialId?: string;
  readonly systemTypeId?: string;
  /** §RESI-FACADE-INTERIOR-WHITE (2026-06-24) — per-layer finish stack. When supplied, the wall
   *  renders each layer with its own `materialColor`, so a wall with a `finish-exterior` layer (the
   *  façade colour) + a `finish-interior` layer (white) reads coloured outside, white inside. Carried
   *  verbatim into `Wall.parse` (the schema validates each layer); absent ⇒ a plain single-colour wall. */
  readonly layers?: WallData['layers'];
  /** §FIX-WALL-CURVE-PLAN-VS-3D-CREATION (2026-08-06) — quadratic-Bézier curve descriptor
   *  (`{ control, segments }`, the ONE curvature representation the Wall schema defines).
   *  Both tools already dispatch it (WallPlanToolHandler curved mode; WallTool CURVED_WALL),
   *  but this payload never declared it, so the canonical handler dropped it on the floor —
   *  a plan-view curved wall committed as STRAIGHT (the 3D path only looked right because
   *  it dual-writes through the legacy CreateWallCommand, which does stamp `curve`).
   *  Carried verbatim into `Wall.parse` (the schema validates); absent ⇒ straight wall. */
  readonly curve?: WallData['curve'];
}

type WallHandlerStores = Readonly<{ wall: WallsState } & Record<string, unknown>>;

export class CreateWallHandler
  implements CommandHandler<CreateWallPayload, WallHandlerStores>
{
  readonly type = 'wall.create';
  readonly affectedStores = ['wall'] as const;

  /** Optional `WallSystemTypeStore` reference.  When supplied, any
   *  `cmd.systemTypeId` in the payload is validated against the
   *  catalogue at `canExecute` time — unknown ids are rejected with a
   *  deterministic reason (and would throw `WallSystemTypeNotFoundError`
   *  in `execute` on a race).  When omitted, `systemTypeId` is accepted
   *  verbatim — preserves S07 fixtures + tests that don't wire the
   *  catalogue. */
  constructor(private readonly systemTypeStore?: WallSystemTypeStore) {}

  // C11 §3.2: domain-invariant regex for branded wall IDs.
  // Mirrors the regex inside defineElement('wall', ...) in @pryzm/schemas.
  private static readonly WALL_ID_RE = /^wall_[0-9A-HJKMNP-TV-Z]{26}$/;

  canExecute(_ctx: HandlerContext<WallHandlerStores>, cmd: CreateWallPayload): ValidationResult {
    if (cmd.height !== undefined && (!Number.isFinite(cmd.height) || cmd.height <= 0)) {
      return { valid: false, reason: 'height must be > 0' };
    }
    if (cmd.thickness !== undefined && (!Number.isFinite(cmd.thickness) || cmd.thickness < 0.05)) {
      return { valid: false, reason: 'thickness must be ≥ 0.05 m' };
    }
    // C11 §3.2 / defineElement invariant: if the caller supplies an id it MUST
    // already be in `wall_<ulid>` branded format.  Omitting id is the preferred
    // pattern for interactive tools — the handler auto-mints via createId('wall').
    if (cmd.id !== undefined) {
      if (typeof cmd.id !== 'string' || cmd.id.length === 0) {
        return { valid: false, reason: 'id must be a non-empty string' };
      }
      if (!CreateWallHandler.WALL_ID_RE.test(cmd.id)) {
        return {
          valid: false,
          reason:
            'id must be a branded wall_<ulid> — omit id to auto-generate, or use createId(\'wall\') from @pryzm/schemas',
        };
      }
    }
    if (
      cmd.systemTypeId !== undefined &&
      this.systemTypeStore !== undefined &&
      !this.systemTypeStore.has(cmd.systemTypeId)
    ) {
      return {
        valid: false,
        reason: `unknown systemTypeId: ${cmd.systemTypeId}`,
      };
    }
    // §FIX-CREATE-DTO-ONLY-SUCCESS — LAST, and only after the payload is known to
    // be well-formed: the point of the message is "this payload is fine and it
    // STILL cannot reach authoritative state", which a payload error would muddle.
    const unreachable = authoritativeWallStoreRefusal();
    if (unreachable !== null) return { valid: false, reason: unreachable };
    return { valid: true };
  }

  execute(ctx: HandlerContext<WallHandlerStores>, cmd: CreateWallPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    // 0) Race-defensive systemTypeId re-check.  `canExecute` already
    //    rejected unknown ids; if the catalogue mutated between gate
    //    and execute, throw OUTWARD so the bus surfaces a typed error
    //    and DOES NOT push a partial event.
    if (
      cmd.systemTypeId !== undefined &&
      this.systemTypeStore !== undefined &&
      !this.systemTypeStore.has(cmd.systemTypeId)
    ) {
      throw new WallSystemTypeNotFoundError(cmd.systemTypeId);
    }

    // §FIX-WALL-LAYERS-PLAN-VS-3D-CREATION (L-239 / L-211, 2026-07-11) — THE CHOKEPOINT.
    //
    // `systemTypeId` is resolved into the two INTRINSIC fields the renderers read
    // — `thickness` AND `layers[]` — ONCE, here, below every tool. Both are then
    // PERSISTED on the instance (step 2). The instance is canonical: the 3D builder
    // (WallFragmentBuilder §03-1.3) and the plan builder (WallLayerPlanSymbolBuilder)
    // both read `wall.layers` off the record, so if the record carries the stack,
    // BOTH views draw it and they cannot disagree.
    //
    // This supersedes §WALL-TYPE-THICKNESS (2026-05-22), which resolved thickness
    // here but NOT layers — the asymmetry that produced the founder's exact
    // fingerprint: a plan-created layered wall got the right thickness and NO layers,
    // while the SAME type created in 3D got both (only because the 3D WallTool also
    // dual-writes through the legacy CreateWallCommand, which does stamp layers).
    // Resolution belongs below the tools — a tool cannot forget what it never does.
    //
    // Precedence + idempotency live in resolveWallSystemType (explicit layers win,
    // catalogue second, caller's values on a miss — an unknown id NEVER rejects a
    // wall; ADR-0116 §Decision).
    const resolved = resolveWallSystemType(this.systemTypeStore, cmd);
    const resolvedThickness = resolved.thickness;
    const resolvedLayers    = resolved.layers;

    // §DIAG-WALL-TYPE-RESOLVE — kept: a typed wall that resolves to NO layers means
    // the catalogue the handler reads and the catalogue the picker reads have
    // diverged (the ADR-0116 failure mode). Loud, non-fatal, and self-evident in the
    // browser log rather than a silently plain wall.
    if (cmd.systemTypeId !== undefined && resolvedLayers === undefined) {
      console.warn(
        `[CreateWallHandler] systemTypeId='${cmd.systemTypeId}' did not resolve to a layer stack ` +
        `(${this.systemTypeStore === undefined ? 'NO systemTypeStore wired' : 'id not found in the wired catalogue'}). ` +
        `Wall stored unlayered at thickness=${resolvedThickness ?? 'default'}. ` +
        `Expected: the ONE shared catalogue (ADR-0116, buildSharedWallCatalogue) is wired into wall.create.`,
      );
    }

    // 1) Mint id (or accept the caller's deterministic id for tests).
    const id = cmd.id ?? createId('wall');

    // 2) Materialise a fully-typed WallData via the canonical schema.
    //    `Wall.parse({...})` fills in the schema defaults for every
    //    omitted field — a wall with no inputs is a valid wall.
    let wall: WallData;
    try {
      wall = Wall.parse({
        id,
        levelId: cmd.levelId ?? '',
        ...(cmd.baseLine !== undefined ? { baseLine: cmd.baseLine } : {}),
        ...(cmd.height !== undefined ? { height: cmd.height } : {}),
        ...(resolvedThickness !== undefined ? { thickness: resolvedThickness } : {}),
        ...(cmd.baseOffset !== undefined ? { baseOffset: cmd.baseOffset } : {}),
        ...(cmd.materialColor !== undefined ? { materialColor: cmd.materialColor } : {}),
        ...(cmd.materialId !== undefined ? { materialId: cmd.materialId } : {}),
        ...(cmd.systemTypeId !== undefined ? { systemTypeId: cmd.systemTypeId } : {}),
        // §FIX-WALL-LAYERS-PLAN-VS-3D-CREATION — PERSIST the resolved stack. `layers`
        // was declared on CreateWallPayload but never written here: the field was
        // dropped on the floor by the canonical handler, so NO bus-created wall has
        // ever carried a layer stack in the PRYZM3 store. This line is the fix.
        ...(resolvedLayers !== undefined ? { layers: resolvedLayers } : {}),
        // §FIX-WALL-CURVE-PLAN-VS-3D-CREATION — PERSIST the curve descriptor. Same
        // defect family as `layers` above (L-239): declared by callers, dropped here,
        // so NO bus-created wall ever carried curvature in the PRYZM3 store and the
        // bus-only plan path committed curved walls as straight. This line is the fix.
        ...(cmd.curve !== undefined ? { curve: cmd.curve } : {}),
      }) as WallData;
    } catch (cause) {
      // `WallSchemaError` is thrown OUTWARD so the bus surfaces it as
      // a `CommandBusError` and DOES NOT push to the undo stack.
      throw new WallSchemaError(
        `wall.create rejected — schema validation failed for id ${id}`,
        cause,
      );
    }

    // 3) `MIN_WALL_LEN` invariant lives on the schema (`baseLine` length
    //    ≥ 0.05 m).  We surface a typed error if an explicit baseLine
    //    falls under that bound — the schema would have already thrown
    //    above, but the typed wrapper gives callers a stable instanceof
    //    branch.
    if (cmd.baseLine !== undefined) {
      const [a, b] = cmd.baseLine;
      const dx = a.x - b.x;
      const dz = a.z - b.z;
      if (Math.hypot(dx, dz) < 0.05) {
        throw new WallDimensionsError(
          `wall.create rejected — baseLine endpoints must be ≥ 0.05 m apart in the XZ plane.`,
        );
      }
    }

    // 4) Immer-driven add.  Patch path is `[id]` so the Store<WallData>
    //    routes the patch to the new wall id (single-store branch in
    //    `CommandBus.executeCommand` returns `forwardPatches: result.forward`
    //    verbatim, no path stripping needed).
    const [next, forward, inverse] = produceCommand<WallsState>(ctx.stores.wall, draft => {
      draft[id] = wall;
    });

    return { forward, inverse, nextStates: { wall: next } };
    }); // withHandlerSpan — C10 §2
  }
}
