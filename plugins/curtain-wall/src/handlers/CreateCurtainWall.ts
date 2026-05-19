// CreateCurtainWallHandler — mint a new curtain wall (S12-T5).

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { CurtainWall, createId } from '@pryzm/plugin-sdk';
import { CurtainWallGeometryError, CurtainWallSchemaError } from '../errors.js';
import type { CurtainWallData, CurtainWallsState } from '../store.js';
import { isFiniteVec3, isNonZeroBaseLine } from '../intent.js';

export interface CreateCurtainWallPayload {
  readonly id?: string;
  readonly levelId?: string;
  readonly baseLine?: CurtainWallData['baseLine'];
  readonly height?: number;
  readonly mullionThickness?: number;
  readonly bayWidth?: number;
  readonly bayHeight?: number;
  readonly panels?: CurtainWallData['panels'];
  readonly materialId?: string;
  readonly systemTypeId?: string;
}

type CWStores = Readonly<{ curtainwall: CurtainWallsState } & Record<string, unknown>>;

export class CreateCurtainWallHandler
  implements CommandHandler<CreateCurtainWallPayload, CWStores>
{
  readonly type = 'curtainwall.create';
  readonly affectedStores = ['curtainwall'] as const;

  canExecute(_ctx: HandlerContext<CWStores>, cmd: CreateCurtainWallPayload): ValidationResult {
    if (cmd.baseLine !== undefined) {
      const [a, b] = cmd.baseLine;
      if (!isFiniteVec3(a) || !isFiniteVec3(b)) {
        return { valid: false, reason: 'baseLine endpoints must be finite Vec3' };
      }
      if (!isNonZeroBaseLine(a, b)) {
        return { valid: false, reason: 'baseLine endpoints must differ' };
      }
    }
    for (const k of ['height', 'mullionThickness', 'bayWidth', 'bayHeight'] as const) {
      const v = cmd[k];
      if (v !== undefined && (!Number.isFinite(v) || v <= 0)) {
        return { valid: false, reason: `${k} must be > 0` };
      }
    }
    if (cmd.panels) {
      const ids = new Set<string>();
      for (let i = 0; i < cmd.panels.length; i++) {
        const p = cmd.panels[i]!;
        if (typeof p.id !== 'string' || p.id.length === 0) {
          return { valid: false, reason: `panels[${i}].id must be a non-empty string` };
        }
        if (ids.has(p.id)) return { valid: false, reason: `duplicate panel id: ${p.id}` };
        ids.add(p.id);
      }
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<CWStores>, cmd: CreateCurtainWallPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    const id = (cmd.id ?? createId('curtainwall')) as CurtainWallData['id'];
    const seed: Partial<CurtainWallData> = {
      id,
      levelId: cmd.levelId ?? '',
      height: cmd.height ?? 3,
      mullionThickness: cmd.mullionThickness ?? 0.05,
      bayWidth: cmd.bayWidth ?? 1.2,
      bayHeight: cmd.bayHeight ?? 1.5,
      panels: cmd.panels ?? [],
      materialId: cmd.materialId ?? cmd.systemTypeId,
    };
    if (cmd.baseLine) seed.baseLine = cmd.baseLine;
    if (seed.baseLine && !isNonZeroBaseLine(seed.baseLine[0], seed.baseLine[1])) {
      throw new CurtainWallGeometryError('baseLine endpoints must differ');
    }
    let cw: CurtainWallData;
    try { cw = CurtainWall.parse(seed); }
    catch (err) { throw new CurtainWallSchemaError(err); }

    const [next, forward, inverse] = produceCommand<CurtainWallsState>(ctx.stores.curtainwall, (draft) => {
      draft[cw.id] = cw;
    });
    return { forward, inverse, nextStates: { curtainwall: next } };
    }); // withHandlerSpan — C10 §2
  }
}
