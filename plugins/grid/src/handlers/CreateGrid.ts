// CreateGridHandler — mint a new structural grid (S12-T4).

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { Grid, createId } from '@pryzm/plugin-sdk';
import { GridSchemaError } from '../errors.js';
import type { GridData, GridsState } from '../store.js';

export interface CreateGridPayload {
  readonly id?: string;
  readonly levelId?: string;
  readonly rotation?: number;
  readonly lines?: GridData['lines'];
}

type GridHandlerStores = Readonly<{ grid: GridsState } & Record<string, unknown>>;

export class CreateGridHandler implements CommandHandler<CreateGridPayload, GridHandlerStores> {
  readonly type = 'grid.create';
  readonly affectedStores = ['grid'] as const;

  canExecute(_ctx: HandlerContext<GridHandlerStores>, cmd: CreateGridPayload): ValidationResult {
    if (cmd.rotation !== undefined && !Number.isFinite(cmd.rotation)) {
      return { valid: false, reason: 'rotation must be a finite number' };
    }
    if (cmd.lines !== undefined) {
      const ids = new Set<string>();
      for (let i = 0; i < cmd.lines.length; i++) {
        const ln = cmd.lines[i]!;
        if (typeof ln.id !== 'string' || ln.id.length === 0) {
          return { valid: false, reason: `lines[${i}].id must be a non-empty string` };
        }
        if (ids.has(ln.id)) {
          return { valid: false, reason: `lines[${i}].id is duplicated: ${ln.id}` };
        }
        ids.add(ln.id);
        if (ln.kind === 'arc' && (typeof ln.radius !== 'number' || ln.radius <= 0)) {
          return { valid: false, reason: `lines[${i}]: arc requires positive radius` };
        }
      }
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<GridHandlerStores>, cmd: CreateGridPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    const id = (cmd.id ?? createId('grid')) as GridData['id'];
    const seed: Partial<GridData> = {
      id,
      levelId: cmd.levelId ?? '',
      rotation: cmd.rotation ?? 0,
      lines: cmd.lines ?? [],
    };
    let grid: GridData;
    try { grid = Grid.parse(seed); }
    catch (err) { throw new GridSchemaError(err); }

    const [next, forward, inverse] = produceCommand<GridsState>(ctx.stores.grid, (draft) => {
      draft[grid.id] = grid;
    });
    return { forward, inverse, nextStates: { grid: next } };
    }); // withHandlerSpan — C10 §2
  }
}
