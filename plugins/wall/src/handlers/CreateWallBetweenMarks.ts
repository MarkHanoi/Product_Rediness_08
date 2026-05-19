// CreateWallBetweenMarksHandler — mint a wall from two snap marks (S10-T2).
//
// Mirrors `src/commands/walls/CreateWallBetweenMarksCommand.ts:152`.
// In PRYZM 1 the "marks" were references to `SnapMarkStore` entries;
// the new handler accepts the resolved 3D points directly so it can be
// driven by either the mark store (UI side) or a script test (no
// mark-store dependency).
//
// Logic is otherwise the standard wall-create path — the only thing
// that distinguishes this command from a generic `wall.create` is
// SEMANTICS: it is the audit-distinct command for wall placement
// THROUGH the snap-mark UI flow, vs free-hand drawing (`wall.create`)
// or slab perimeter generation (`wall.createFromSlab`).  The audit
// trail benefits from the distinction at replay time.

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

export interface CreateWallBetweenMarksPayload {
  readonly levelId: string;
  readonly start: WallData['baseLine'][0];
  readonly end:   WallData['baseLine'][1];
  /** Optional caller-provided id. */
  readonly id?: string;
  readonly height?: number;
  readonly thickness?: number;
  readonly baseOffset?: number;
  readonly materialColor?: string;
  readonly materialId?: string;
  readonly systemTypeId?: string;
}

type WallHandlerStores = Readonly<{ wall: WallsState } & Record<string, unknown>>;

function isFiniteVec3(v: unknown): v is { x: number; y: number; z: number } {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.x === 'number' && Number.isFinite(r.x) &&
    typeof r.y === 'number' && Number.isFinite(r.y) &&
    typeof r.z === 'number' && Number.isFinite(r.z)
  );
}

export class CreateWallBetweenMarksHandler
  implements CommandHandler<CreateWallBetweenMarksPayload, WallHandlerStores>
{
  readonly type = 'wall.createBetweenMarks';
  readonly affectedStores = ['wall'] as const;

  constructor(private readonly systemTypeStore?: WallSystemTypeStore) {}

  canExecute(
    _ctx: HandlerContext<WallHandlerStores>,
    cmd: CreateWallBetweenMarksPayload,
  ): ValidationResult {
    if (typeof cmd.levelId !== 'string') {
      return { valid: false, reason: 'levelId must be a string' };
    }
    if (!isFiniteVec3(cmd.start) || !isFiniteVec3(cmd.end)) {
      return { valid: false, reason: 'start / end must be finite { x, y, z }' };
    }
    if (cmd.start.y !== cmd.end.y) {
      return { valid: false, reason: 'start.y and end.y must match (level elevation)' };
    }
    if (Math.hypot(cmd.start.x - cmd.end.x, cmd.start.z - cmd.end.z) < 0.05) {
      return { valid: false, reason: 'mark distance must be ≥ 0.05 m on the XZ plane' };
    }
    if (cmd.id !== undefined && (typeof cmd.id !== 'string' || cmd.id.length === 0)) {
      return { valid: false, reason: 'id must be a non-empty string' };
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
    cmd: CreateWallBetweenMarksPayload,
  ): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    if (
      cmd.systemTypeId !== undefined &&
      this.systemTypeStore !== undefined &&
      !this.systemTypeStore.has(cmd.systemTypeId)
    ) {
      throw new WallSystemTypeNotFoundError(cmd.systemTypeId);
    }
    if (Math.hypot(cmd.start.x - cmd.end.x, cmd.start.z - cmd.end.z) < 0.05) {
      throw new WallDimensionsError(
        'wall.createBetweenMarks rejected — mark distance < 0.05 m',
      );
    }

    const id = cmd.id ?? createId('wall');

    let wall: WallData;
    try {
      wall = Wall.parse({
        id,
        levelId: cmd.levelId,
        baseLine: [cmd.start, cmd.end],
        ...(cmd.height !== undefined ? { height: cmd.height } : {}),
        ...(cmd.thickness !== undefined ? { thickness: cmd.thickness } : {}),
        ...(cmd.baseOffset !== undefined ? { baseOffset: cmd.baseOffset } : {}),
        ...(cmd.materialColor !== undefined ? { materialColor: cmd.materialColor } : {}),
        ...(cmd.materialId !== undefined ? { materialId: cmd.materialId } : {}),
        ...(cmd.systemTypeId !== undefined ? { systemTypeId: cmd.systemTypeId } : {}),
      }) as WallData;
    } catch (cause) {
      throw new WallSchemaError(
        `wall.createBetweenMarks rejected — schema validation failed for id ${id}`,
        cause,
      );
    }

    const [next, forward, inverse] = produceCommand<WallsState>(ctx.stores.wall, draft => {
      draft[id] = wall;
    });
    return { forward, inverse, nextStates: { wall: next } };
    }); // withHandlerSpan — C10 §2
  }
}
