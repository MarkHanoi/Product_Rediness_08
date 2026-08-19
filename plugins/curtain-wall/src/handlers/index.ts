// Curtain-wall handler registration (S12-T5; extended in S13-T1).
//
// S12 shipped 9 whole-CW handlers (Create / Delete / Move / SetGrid /
// SetMullionType / SetTransomType / SetPanelType / SetOutline / Resize).
// S13 adds 4 per-panel manipulation handlers per `code-level ADR
// docs/02-decisions/adrs/0011-curtain-wall-triage-and-producer-split.md`:
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
// §FIX-CW-UPDATE-REACH-RECORD — UpdateCurtainWallHandler import removed with its
// registration; see the CURTAIN_WALL_HANDLER_TYPES note below.
import { UpdateCurtainWallBatchHandler } from './UpdateCurtainWallBatch.js';
import { CreateCurtainWallsOnAllSlabsHandler } from './CreateCurtainWallsOnAllSlabs.js';
import { AddCurtainGridLineHandler } from './AddCurtainGridLine.js';
import { RemoveCurtainGridLineHandler } from './RemoveCurtainGridLine.js';
import { ReplacePanelHandler } from './ReplacePanel.js';
import { SetCurtainWallMaterialHandler } from './SetCurtainWallMaterial.js'; // §FEAT-UNIFORM-MATERIAL-COMMAND
// §L-1032 — the storey move. Registered in the ONE register at
// `@pryzm/command-bus` `LEVEL_CHANGE_VERBS`; see that file for the four parts a
// level change must complete before this row may exist.
import { ChangeCurtainWallLevelHandler } from './ChangeCurtainWallLevel.js';

export const CURTAIN_WALL_HANDLER_TYPES = [
  // S12 (9)
  'curtain-wall.create',
  'curtain-wall.delete',
  'curtain-wall.move',
  'curtain-wall.setGrid',
  'curtain-wall.setMullionType',
  'curtain-wall.setTransomType',
  'curtain-wall.setPanelType',
  'curtain-wall.setOutline',
  'curtain-wall.resize',
  // S13 (+4)
  'curtain-wall.addPanel',
  'curtain-wall.removePanel',
  'curtain-wall.swapPanel',
  'curtain-wall.rotatePanel',
  // P2e: batch create (E.5.x migration — AI pipeline + slab-perimeter bulk creation)
  'curtain-wall.batch.create',
  // P2e: batch delete — undo-mirror of batch.create; keeps plugin store in sync with legacy undo()
  'curtain-wall.batch.delete',
  // §FIX-CW-UPDATE-REACH-RECORD — 'wall.updateCurtainWall' LEFT this set.
  // `UpdateCurtainWallHandler` `produceCommand`ed against the plugin DTO store — a fresh
  // store built by PluginRegistry that no builder, no 2-D projector, no IFC exporter and
  // no persistence path reads. Unlike its roof/ceiling siblings there was no shadowed
  // bridge behind it: TASK-07 Phase A DELETED the bridge outright, so the verb was
  // UNBRIDGED, and all four of its live dispatchers (3-D gizmo drag-end, plan Move tool,
  // property sheet, Material control) reported success and changed nothing authoritative.
  // The verb is now owned by the `initBusHandlers.ts` bridge → `UpdateCurtainWallCommand`
  // → the geometry `curtainWallStore` (`engineLauncher.ts:305,774,824`), which also
  // carries a real `undo()` (full snapshot restore, §01 §2.2) and the §DW-03 spatial
  // re-registration on a levelId change — neither of which the DTO handler did.
  //
  // NOT MIGRATED WITH IT, deliberately (do not scope-creep): 'curtain-wall.batch.update',
  // 'curtain-wall.setGrid', 'setOutline', 'resize', 'setMullionType', 'setTransomType',
  // 'setPanelType', the per-panel verbs and 'curtain-wall.move' all still write the same
  // detached DTO store. They are a separate, larger remediation.
  // FT7 (ELEMENT-FUNCTIONAL-FIX-PLAN-2026-05-18): batch update — one Immer call, one rebuild
  'curtain-wall.batch.update',
  // F-1.3 bridge
  'curtain-wall.create-on-all-slabs',
  // E.5.x migration bridges
  'curtain-wall.addGridLine',
  'curtain-wall.removeGridLine',
  'curtain-wall.replacePanel',
  'curtain-wall.setMaterial',
  // §L-1032 — move a curtain wall between storeys (founder-requested).
  //
  // CAMEL-CASED, and deliberately out of step with every other row above:
  // `packages/command-bus/src/levelChangeVerbs.ts:184-193` declares the verb as
  // 'curtainWall.changeLevel', and that register is what the event bridge, the
  // property panel and the chat registration all read. A hyphenated spelling
  // here would be a verb the register matches nothing for — the command would
  // report success and the renderer would keep its own copy.
  //
  // The legacy `CurtainWallStore.changeLevel` MUST exist before this verb does
  // (`packages/geometry-curtain-wall/src/CurtainWallStore.ts`): the undo
  // adapter routes a `levelId` inverse by testing for that METHOD, and a family
  // without it also loses the bimManager / view-dependency re-registration the
  // adapter performs alongside the call.
  'curtainWall.changeLevel',
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
    // §FIX-CW-UPDATE-REACH-RECORD — UpdateCurtainWallHandler retired (see the
    // CURTAIN_WALL_HANDLER_TYPES note); the initBusHandlers bridge owns the verb.
    // FT7 (ELEMENT-FUNCTIONAL-FIX-PLAN-2026-05-18): batch update — one Immer call, one rebuild
    new UpdateCurtainWallBatchHandler() as unknown as CommandHandler<unknown>,
    // F-1.3 bridge
    new CreateCurtainWallsOnAllSlabsHandler() as unknown as CommandHandler<unknown>,
    // E.5.x migration bridges
    AddCurtainGridLineHandler as unknown as CommandHandler<unknown>,
    RemoveCurtainGridLineHandler as unknown as CommandHandler<unknown>,
    ReplacePanelHandler as unknown as CommandHandler<unknown>,
    new SetCurtainWallMaterialHandler() as unknown as CommandHandler<unknown>,
    new ChangeCurtainWallLevelHandler() as unknown as CommandHandler<unknown>,
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
// §FIX-CW-UPDATE-REACH-RECORD — `UpdateCurtainWall.ts` DELETED, not merely unregistered,
// exactly as `UpdateRoof.ts` was at 2c8b4904. Nothing outside this barrel imported
// `UpdateCurtainWallHandler`, and `tools/ga-gate/check-verb-register.ts` classifies
// SHADOWED from DECLARING FILES rather than from registration — so leaving the class in
// place would keep a second declaring site for a verb that now has exactly one owner, and
// would leave a test bus able to register it manually and write the detached store again
// (the residue L-815 logged as NOT COVERED).
export {
  UpdateCurtainWallBatchHandler,
  type UpdateCurtainWallBatchPayload,
} from './UpdateCurtainWallBatch.js';
export {
  CreateCurtainWallsOnAllSlabsHandler,
  type CreateCurtainWallsOnAllSlabsPayload,
} from './CreateCurtainWallsOnAllSlabs.js';
export {
  SetCurtainWallMaterialHandler,
  type SetCurtainWallMaterialPayload,
} from './SetCurtainWallMaterial.js';
export {
  ChangeCurtainWallLevelHandler,
  type ChangeCurtainWallLevelPayload,
} from './ChangeCurtainWallLevel.js';
