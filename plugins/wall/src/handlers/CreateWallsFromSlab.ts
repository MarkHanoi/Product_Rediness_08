// CreateWallsFromSlabHandler — mint a wall along every edge of a slab
// perimeter polygon (S10-T3).
//
// Mirrors `src/commands/walls/CreateWallsFromSlabCommand.ts:167`.  The
// SLAB store lives in its own plugin (lands later in 1C); this handler
// accepts the resolved perimeter polygon directly so it can be driven
// by either the slab plugin (UI side) or a script test (no slab-store
// dependency).
//
// The slab.* handler (1C) will dispatch this command in a transaction
// after registering the slab itself — the wall ids returned to the
// inspector come from the patch path under `wall/{id}`.
//
// VALIDATION:
//   • polygon length ≥ 3 (a triangle is the minimum valid slab outline).
//   • Every edge ≥ MIN_WALL_LEN (mirrors per-wall schema rule (1));
//     edges shorter than that are SILENTLY SKIPPED rather than
//     rejecting the entire command — slabs frequently have one or two
//     micro-edges from snap rounding and a "0 walls created" UX is
//     worse than a "5 of 6 walls created" UX.
//
// IDS: every minted wall gets a fresh ULID via `createId('wall')`;
// caller-provided ids are NOT supported (this is a bulk create — a
// list of N pre-allocated ids was pure ceremony in PRYZM 1 and never
// used in practice).
//
// UNDO: a single Immer batch produces ONE forward + ONE inverse patch
// even for an N-wall outline — undoing a "build perimeter" gesture is
// one stack pop.

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { Wall, createId } from '@pryzm/plugin-sdk';
import { WallSchemaError, WallSystemTypeNotFoundError } from '../errors.js';
import type { WallData, WallsState } from '../store.js';
import type { WallSystemTypeStore } from '../system-type-store.js';

export interface CreateWallsFromSlabPayload {
  readonly levelId: string;
  /** Closed polygon — last vertex auto-closed back to first. */
  readonly perimeter: readonly WallData['baseLine'][0][];
  readonly height?: number;
  readonly thickness?: number;
  readonly baseOffset?: number;
  readonly materialColor?: string;
  readonly materialId?: string;
  readonly systemTypeId?: string;
}

type WallHandlerStores = Readonly<{ wall: WallsState } & Record<string, unknown>>;

const MIN_WALL_LEN = 0.05;

function isFiniteVec3(v: unknown): v is { x: number; y: number; z: number } {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.x === 'number' && Number.isFinite(r.x) &&
    typeof r.y === 'number' && Number.isFinite(r.y) &&
    typeof r.z === 'number' && Number.isFinite(r.z)
  );
}

export class CreateWallsFromSlabHandler
  implements CommandHandler<CreateWallsFromSlabPayload, WallHandlerStores>
{
  readonly type = 'wall.createFromSlab';
  readonly affectedStores = ['wall'] as const;

  constructor(private readonly systemTypeStore?: WallSystemTypeStore) {}

  canExecute(
    _ctx: HandlerContext<WallHandlerStores>,
    cmd: CreateWallsFromSlabPayload,
  ): ValidationResult {
    if (typeof cmd.levelId !== 'string') {
      return { valid: false, reason: 'levelId must be a string' };
    }
    if (!Array.isArray(cmd.perimeter) || cmd.perimeter.length < 3) {
      return { valid: false, reason: 'perimeter must be a polygon with ≥ 3 vertices' };
    }
    for (let i = 0; i < cmd.perimeter.length; i += 1) {
      if (!isFiniteVec3(cmd.perimeter[i])) {
        return { valid: false, reason: `perimeter[${i}] must be finite { x, y, z }` };
      }
    }
    // All vertices must share y (level elevation).
    const y0 = cmd.perimeter[0].y;
    for (let i = 1; i < cmd.perimeter.length; i += 1) {
      if (cmd.perimeter[i].y !== y0) {
        return { valid: false, reason: `perimeter[${i}].y differs from perimeter[0].y (level elevation must be uniform)` };
      }
    }
    // Need at least one edge clearing MIN_WALL_LEN — a polygon of all
    // micro-edges is degenerate and we reject the whole command.
    let validEdges = 0;
    for (let i = 0; i < cmd.perimeter.length; i += 1) {
      const a = cmd.perimeter[i];
      const b = cmd.perimeter[(i + 1) % cmd.perimeter.length];
      if (Math.hypot(a.x - b.x, a.z - b.z) >= MIN_WALL_LEN) validEdges += 1;
    }
    if (validEdges === 0) {
      return { valid: false, reason: `no perimeter edge clears ${MIN_WALL_LEN} m` };
    }
    if (cmd.height !== undefined && (!Number.isFinite(cmd.height) || cmd.height <= 0)) {
      return { valid: false, reason: 'height must be > 0' };
    }
    if (cmd.thickness !== undefined && (!Number.isFinite(cmd.thickness) || cmd.thickness < 0.05)) {
      return { valid: false, reason: 'thickness must be ≥ 0.05 m' };
    }
    if (
      cmd.systemTypeId !== undefined &&
      this.systemTypeStore !== undefined &&
      !this.systemTypeStore.has(cmd.systemTypeId)
    ) {
      return { valid: false, reason: `unknown systemTypeId: ${cmd.systemTypeId}` };
    }
    return { valid: true };
  }

  execute(
    ctx: HandlerContext<WallHandlerStores>,
    cmd: CreateWallsFromSlabPayload,
  ): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    if (
      cmd.systemTypeId !== undefined &&
      this.systemTypeStore !== undefined &&
      !this.systemTypeStore.has(cmd.systemTypeId)
    ) {
      throw new WallSystemTypeNotFoundError(cmd.systemTypeId);
    }

    // Build N walls in one Immer batch.  Schema parse is per-wall so
    // the FIRST schema rejection aborts the whole batch (transactional
    // semantics — no half-built perimeter in the store).
    const fresh: WallData[] = [];
    for (let i = 0; i < cmd.perimeter.length; i += 1) {
      const a = cmd.perimeter[i]!;
      const b = cmd.perimeter[(i + 1) % cmd.perimeter.length]!;
      if (Math.hypot(a.x - b.x, a.z - b.z) < MIN_WALL_LEN) continue;
      const id = createId('wall');
      let wall: WallData;
      try {
        wall = Wall.parse({
          id,
          levelId: cmd.levelId,
          baseLine: [a, b],
          ...(cmd.height !== undefined ? { height: cmd.height } : {}),
          ...(cmd.thickness !== undefined ? { thickness: cmd.thickness } : {}),
          ...(cmd.baseOffset !== undefined ? { baseOffset: cmd.baseOffset } : {}),
          ...(cmd.materialColor !== undefined ? { materialColor: cmd.materialColor } : {}),
          ...(cmd.materialId !== undefined ? { materialId: cmd.materialId } : {}),
          ...(cmd.systemTypeId !== undefined ? { systemTypeId: cmd.systemTypeId } : {}),
        }) as WallData;
      } catch (cause) {
        throw new WallSchemaError(
          `wall.createFromSlab rejected — schema validation failed for edge ${i}`,
          cause,
        );
      }
      fresh.push(wall);
    }

    const [next, forward, inverse] = produceCommand<WallsState>(ctx.stores.wall, draft => {
      for (const w of fresh) draft[w.id] = w;
    });
    return { forward, inverse, nextStates: { wall: next } };
    }); // withHandlerSpan — C10 §2
  }
}
