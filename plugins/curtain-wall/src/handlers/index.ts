// Curtain-wall handler registration (S12-T5; extended in S13-T1).
//
// S12 shipped 9 whole-CW handlers (Create / Delete / Move / SetGrid /
// SetMullionType / SetTransomType / SetPanelType / SetOutline / Resize).
// S13 adds 4 per-panel manipulation handlers per `code-level ADR
// docs/architecture/adr/0011-curtain-wall-triage-and-producer-split.md`:
// AddPanel / RemovePanel / SwapPanel / RotatePanel.

import type { CommandBus, CommandHandler } from '@pryzm/plugin-sdk';
import { CreateCurtainWallHandler } from './CreateCurtainWall.js';
import { DeleteCurtainWallHandler } from './DeleteCurtainWall.js';
import { MoveCurtainWallHandler } from './MoveCurtainWall.js';
import { SetCurtainWallGridHandler } from './SetCurtainWallGrid.js';
import { SetCurtainWallMullionTypeHandler } from './SetCurtainWallMullionType.js';
import { SetCurtainWallTransomTypeHandler } from './SetCurtainWallTransomType.js';
import { SetCurtainWallPanelTypeHandler } from './SetCurtainWallPanelType.js';
import { SetCurtainWallOutlineHandler } from './SetCurtainWallOutline.js';
import { ResizeCurtainWallHandler } from './ResizeCurtainWall.js';
import { AddPanelHandler } from './AddPanel.js';
import { RemovePanelHandler } from './RemovePanel.js';
import { SwapPanelHandler } from './SwapPanel.js';
import { RotatePanelHandler } from './RotatePanel.js';
import { CreateCurtainWallBatchHandler } from './CreateCurtainWallBatch.js';
import { DeleteCurtainWallBatchHandler } from './DeleteCurtainWallBatch.js';
import { UpdateCurtainWallHandler } from './UpdateCurtainWall.js';
import { UpdateCurtainWallBatchHandler } from './UpdateCurtainWallBatch.js';
import { CreateCurtainWallsOnAllSlabsHandler } from './CreateCurtainWallsOnAllSlabs.js';
import { AddCurtainGridLineHandler } from './AddCurtainGridLine.js';
import { RemoveCurtainGridLineHandler } from './RemoveCurtainGridLine.js';
import { ReplacePanelHandler } from './ReplacePanel.js';

export const CURTAIN_WALL_HANDLER_TYPES = [
  // S12 (9)
  'curtainwall.create',
  'curtainwall.delete',
  'curtainwall.move',
  'curtainwall.setGrid',
  'curtainwall.setMullionType',
  'curtainwall.setTransomType',
  'curtainwall.setPanelType',
  'curtainwall.setOutline',
  'curtainwall.resize',
  // S13 (+4)
  'curtainwall.addPanel',
  'curtainwall.removePanel',
  'curtainwall.swapPanel',
  'curtainwall.rotatePanel',
  // P2e: batch create (E.5.x migration — AI pipeline + slab-perimeter bulk creation)
  'curtain-wall.batch.create',
  // P2e: batch delete — undo-mirror of batch.create; keeps plugin store in sync with legacy undo()
  'curtain-wall.batch.delete',
  // F-1.3 bridge
  'wall.updateCurtainWall',
  // FT7 (ELEMENT-FUNCTIONAL-FIX-PLAN-2026-05-18): batch update — one Immer call, one rebuild
  'curtainwall.batch.update',
  // F-1.3 bridge
  'curtain-wall.create-on-all-slabs',
  // E.5.x migration bridges
  'curtainwall.addGridLine',
  'curtainwall.removeGridLine',
  'curtainwall.replacePanel',
] as const;

export type CurtainWallHandlerType = (typeof CURTAIN_WALL_HANDLER_TYPES)[number];

export function buildCurtainWallHandlerSet() {
  return [
    new CreateCurtainWallHandler() as unknown as CommandHandler<unknown>,
    new DeleteCurtainWallHandler() as unknown as CommandHandler<unknown>,
    new MoveCurtainWallHandler() as unknown as CommandHandler<unknown>,
    new SetCurtainWallGridHandler() as unknown as CommandHandler<unknown>,
    new SetCurtainWallMullionTypeHandler() as unknown as CommandHandler<unknown>,
    new SetCurtainWallTransomTypeHandler() as unknown as CommandHandler<unknown>,
    new SetCurtainWallPanelTypeHandler() as unknown as CommandHandler<unknown>,
    new SetCurtainWallOutlineHandler() as unknown as CommandHandler<unknown>,
    new ResizeCurtainWallHandler() as unknown as CommandHandler<unknown>,
    new AddPanelHandler() as unknown as CommandHandler<unknown>,
    new RemovePanelHandler() as unknown as CommandHandler<unknown>,
    new SwapPanelHandler() as unknown as CommandHandler<unknown>,
    new RotatePanelHandler() as unknown as CommandHandler<unknown>,
    // P2e: batch create + batch delete (undo-mirror)
    new CreateCurtainWallBatchHandler() as unknown as CommandHandler<unknown>,
    new DeleteCurtainWallBatchHandler() as unknown as CommandHandler<unknown>,
    UpdateCurtainWallHandler as unknown as CommandHandler<unknown>,
    // FT7 (ELEMENT-FUNCTIONAL-FIX-PLAN-2026-05-18): batch update — one Immer call, one rebuild
    new UpdateCurtainWallBatchHandler() as unknown as CommandHandler<unknown>,
    // F-1.3 bridge
    new CreateCurtainWallsOnAllSlabsHandler() as unknown as CommandHandler<unknown>,
    // E.5.x migration bridges
    AddCurtainGridLineHandler as unknown as CommandHandler<unknown>,
    RemoveCurtainGridLineHandler as unknown as CommandHandler<unknown>,
    ReplacePanelHandler as unknown as CommandHandler<unknown>,
  ];
}

export function registerCurtainWallHandlers(bus: CommandBus): readonly string[] {
  for (const h of buildCurtainWallHandlerSet()) bus.register(h);
  return CURTAIN_WALL_HANDLER_TYPES;
}

export { CreateCurtainWallHandler, type CreateCurtainWallPayload } from './CreateCurtainWall.js';
export { DeleteCurtainWallHandler, type DeleteCurtainWallPayload } from './DeleteCurtainWall.js';
export { MoveCurtainWallHandler, type MoveCurtainWallPayload } from './MoveCurtainWall.js';
export { SetCurtainWallGridHandler, type SetCurtainWallGridPayload } from './SetCurtainWallGrid.js';
export {
  SetCurtainWallMullionTypeHandler,
  type SetCurtainWallMullionTypePayload,
} from './SetCurtainWallMullionType.js';
export {
  SetCurtainWallTransomTypeHandler,
  type SetCurtainWallTransomTypePayload,
} from './SetCurtainWallTransomType.js';
export {
  SetCurtainWallPanelTypeHandler,
  type SetCurtainWallPanelTypePayload,
} from './SetCurtainWallPanelType.js';
export {
  SetCurtainWallOutlineHandler,
  type SetCurtainWallOutlinePayload,
} from './SetCurtainWallOutline.js';
export { ResizeCurtainWallHandler, type ResizeCurtainWallPayload } from './ResizeCurtainWall.js';
export { AddPanelHandler, type AddPanelPayload } from './AddPanel.js';
export { RemovePanelHandler, type RemovePanelPayload } from './RemovePanel.js';
export { SwapPanelHandler, type SwapPanelPayload } from './SwapPanel.js';
export {
  RotatePanelHandler,
  type RotatePanelPayload,
  type PanelRotationDeg,
} from './RotatePanel.js';
export { AddCurtainGridLineHandler, type AddCurtainGridLinePayload } from './AddCurtainGridLine.js';
export { RemoveCurtainGridLineHandler, type RemoveCurtainGridLinePayload } from './RemoveCurtainGridLine.js';
export { ReplacePanelHandler, type ReplacePanelPayload } from './ReplacePanel.js';
// P2e: batch create + batch delete
export {
  CreateCurtainWallBatchHandler,
  type CreateCurtainWallBatchPayload,
} from './CreateCurtainWallBatch.js';
export {
  DeleteCurtainWallBatchHandler,
  type DeleteCurtainWallBatchPayload,
} from './DeleteCurtainWallBatch.js';
export { UpdateCurtainWallHandler, type UpdateCurtainWallPayload } from './UpdateCurtainWall.js';
export {
  UpdateCurtainWallBatchHandler,
  type UpdateCurtainWallBatchPayload,
} from './UpdateCurtainWallBatch.js';
export {
  CreateCurtainWallsOnAllSlabsHandler,
  type CreateCurtainWallsOnAllSlabsPayload,
} from './CreateCurtainWallsOnAllSlabs.js';
