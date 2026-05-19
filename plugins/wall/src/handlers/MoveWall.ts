// MoveWallHandler — facade over TransformWallHandler (W-1B-1 errata).
//
// The original S07-T5 implementation has been superseded by
// TransformWallHandler (ADR-008 §"Wave 3 — S10") which accepts the
// same ABSOLUTE baseLine via `kind: 'referenceEdit'`.  This file is
// kept as a thin facade so existing bus registrations and tests that
// reference `wall.move` continue to work without migration overhead.
//
// @deprecated Use TransformWallHandler with { kind: 'referenceEdit', ... } directly.
//
// ADR-0008 errata (W-1B-1): MoveWall is now a 1-call delegation to
// TransformWall.referenceEdit.  The full validation logic has moved
// into TransformWallHandler where it is shared with mirror / scale /
// offset / move-delta transforms.

import { type CommandHandler, type HandlerContext, type HandlerResult, type ValidationResult, withHandlerSpan } from '@pryzm/plugin-sdk';
import { TransformWallHandler } from './TransformWall.js';
import type { WallData, WallsState } from '../store.js';

export interface MoveWallPayload {
  readonly id: string;
  readonly baseLine: WallData['baseLine'];
}

type WallHandlerStores = Readonly<{ wall: WallsState } & Record<string, unknown>>;

const INNER = new TransformWallHandler();

export class MoveWallHandler implements CommandHandler<MoveWallPayload, WallHandlerStores> {
  readonly type = 'wall.move';
  readonly affectedStores = ['wall'] as const;

  canExecute(ctx: HandlerContext<WallHandlerStores>, cmd: MoveWallPayload): ValidationResult {
    return INNER.canExecute(ctx, { kind: 'referenceEdit', id: cmd.id, newBaseLine: cmd.baseLine });
  }

  execute(ctx: HandlerContext<WallHandlerStores>, cmd: MoveWallPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    return INNER.execute(ctx, { kind: 'referenceEdit', id: cmd.id, newBaseLine: cmd.baseLine });
    }); // withHandlerSpan — C10 §2
  }
}
