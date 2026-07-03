// SetColumnMaterialHandler — uniform material-set command (L-08). §FEAT-UNIFORM-MATERIAL-COMMAND
//
// One `column.setMaterial` handler mirroring the family-uniform shape used
// across every element family.  The scene-committer's MATERIAL_FIELDS
// dirty-check swaps materials on the next commit — no builder/committer
// change is required here.

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { ColumnNotFoundError } from '../errors.js';
import type { ColumnsState } from '../store.js';

export interface SetColumnMaterialPayload {
  readonly columnId: string;
  readonly materialId?: string | null;
  readonly materialColor?: string;
}

type ColumnHandlerStores = Readonly<{ column: ColumnsState } & Record<string, unknown>>;

export class SetColumnMaterialHandler
  implements CommandHandler<SetColumnMaterialPayload, ColumnHandlerStores>
{
  readonly type = 'column.setMaterial';
  readonly affectedStores = ['column'] as const;

  canExecute(ctx: HandlerContext<ColumnHandlerStores>, cmd: SetColumnMaterialPayload): ValidationResult {
    if (typeof cmd.columnId !== 'string' || cmd.columnId.length === 0) {
      return { valid: false, reason: 'columnId must be a non-empty string' };
    }
    if (cmd.materialId === undefined && cmd.materialColor === undefined) {
      return { valid: false, reason: 'at least one of materialId / materialColor must be provided' };
    }
    if (cmd.materialColor !== undefined && cmd.materialColor.length === 0) {
      return { valid: false, reason: 'materialColor must be non-empty when provided' };
    }
    if (cmd.materialId !== undefined && cmd.materialId !== null && cmd.materialId.length === 0) {
      return { valid: false, reason: 'materialId must be non-empty when provided' };
    }
    if (!ctx.stores.column[cmd.columnId]) {
      return { valid: false, reason: `column not found: ${cmd.columnId}` };
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<ColumnHandlerStores>, cmd: SetColumnMaterialPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    if (!ctx.stores.column[cmd.columnId]) throw new ColumnNotFoundError(cmd.columnId);

    const [next, forward, inverse] = produceCommand<ColumnsState>(ctx.stores.column, (draft) => {
      const c = draft[cmd.columnId];
      if (!c) return;
      if (cmd.materialId === null) delete c.materialId;
      else if (cmd.materialId !== undefined) c.materialId = cmd.materialId;
      // materialColor accepted for uniform shape but not applied — column colour derives from the material-library entry (materialId). §FEAT-UNIFORM-MATERIAL-COMMAND
    });
    return { forward, inverse, nextStates: { column: next } };
    }); // withHandlerSpan — C10 §2
  }
}
