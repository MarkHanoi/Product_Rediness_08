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
