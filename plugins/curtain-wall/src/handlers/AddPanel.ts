// AddPanelHandler — add a single panel to an existing curtain-wall
// grid cell (S13-T1 per `code-level ADR docs/architecture/adr/0011-curtain-wall-triage-and-producer-split.md`).
//
// The cell is addressed by (row, col) and validated against the
// computed grid via CurtainWallIntentResolver.validateGridCoordinate.
// The handler refuses to overwrite an existing panel at the same
// (row, col); use SwapPanel for that.

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { ulid as makeUlid } from 'ulid';
import {
  CurtainWallNotFoundError,
  CurtainWallPanelOverlapError,
  InvalidGridCoordinateError,
} from '../errors.js';
import { CurtainWallIntentResolver } from '../intent.js';
import type { CurtainWallData, CurtainWallsState } from '../store.js';

/** Panel ids are sub-element identifiers (panels are not first-class
 *  elements with their own store), so they use a plain `panel_<ulid>`
 *  shape rather than the branded `createId(<ElementType>)` factory. */
function mintPanelId(): string {
  return `panel_${makeUlid()}`;
}

export interface AddPanelPayload {
  readonly curtainWallId: string;
  readonly row: number;
  readonly col: number;
  /** Panel kind — defaults to 'glazed'. */
  readonly kind?: CurtainWallData['panels'][number]['kind'];
  /** Optional panel id — if omitted, a fresh ULID-backed id is minted. */
  readonly panelId?: string;
  /** Optional system type id (e.g. 'curtainwall.panel.glazed.standard'). */
  readonly panelTypeId?: string;
  /** Optional material id — overrides the panel kind's default colour. */
  readonly materialId?: string;
  /** Optional rotation in degrees (0/90/180/270). */
  readonly rotation?: 0 | 90 | 180 | 270;
}

type CWStores = Readonly<{ curtainwall: CurtainWallsState } & Record<string, unknown>>;

export class AddPanelHandler implements CommandHandler<AddPanelPayload, CWStores> {
  readonly type = 'curtainwall.addPanel';
  readonly affectedStores = ['curtainwall'] as const;

  canExecute(ctx: HandlerContext<CWStores>, cmd: AddPanelPayload): ValidationResult {
    if (typeof cmd.curtainWallId !== 'string' || cmd.curtainWallId.length === 0) {
      return { valid: false, reason: 'curtainWallId must be a non-empty string' };
    }
    const cw = ctx.stores.curtainwall[cmd.curtainWallId];
    if (!cw) return { valid: false, reason: `curtain wall not found: ${cmd.curtainWallId}` };

    const resolver = new CurtainWallIntentResolver(ctx.stores.curtainwall);
    const v = resolver.validateGridCoordinate(cmd.curtainWallId, cmd.row, cmd.col);
    if (!v.ok) {
      return {
        valid: false,
        reason:
          v.reason === 'overlaps-existing'
            ? `panel already exists at (${cmd.row},${cmd.col})`
            : `(${cmd.row},${cmd.col}) is outside the curtain-wall grid`,
      };
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<CWStores>, cmd: AddPanelPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    const cw = ctx.stores.curtainwall[cmd.curtainWallId];
    if (!cw) throw new CurtainWallNotFoundError(cmd.curtainWallId);
    const resolver = new CurtainWallIntentResolver(ctx.stores.curtainwall);
    const v = resolver.validateGridCoordinate(cmd.curtainWallId, cmd.row, cmd.col);
    if (!v.ok) {
      if (v.reason === 'overlaps-existing') {
        throw new CurtainWallPanelOverlapError(cmd.curtainWallId, cmd.row, cmd.col);
      }
      throw new InvalidGridCoordinateError(cmd.curtainWallId, cmd.row, cmd.col, v.reason);
    }

    const panelId = cmd.panelId ?? mintPanelId();
    const [next, forward, inverse] = produceCommand<CurtainWallsState>(
      ctx.stores.curtainwall,
      (draft) => {
        const c = draft[cmd.curtainWallId];
        if (!c) return;
        c.panels.push({
          id: panelId,
          row: cmd.row,
          col: cmd.col,
          kind: cmd.kind ?? 'glazed',
          materialId: cmd.materialId ?? cmd.panelTypeId,
          rotation: cmd.rotation ?? 0,
        });
      },
    );
    return { forward, inverse, nextStates: { curtainwall: next } };
    }); // withHandlerSpan — C10 §2
  }
}
