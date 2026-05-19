// §WALL-AUDIT-2026-M12 — `GenericCommands.ts` is a pure barrel re-export module:
// it exists solely to give legacy import paths a single entry point during the
// per-command file split. New code should import directly from the per-command
// module (e.g. `./CreateWallCommand`) — no command class is defined here.
export { CreateWallCommand } from './CreateWallCommand';
export { SetWallWidthCommand } from './SetWallWidthCommand';
export { SetAllWallsWidthCommand } from './SetAllWallsWidthCommand';
// §WALL-AUDIT-2026-M1: renamed from UpdateWallVisualPropertiesCommand.
export { SetAllWallsVisualPropertiesCommand } from './SetAllWallsVisualPropertiesCommand';
export { DeleteElementCommand } from './DeleteElementCommand';
export { CreateWallBetweenMarksCommand } from './CreateWallBetweenMarksCommand';
export { CreateWallsFromSlabCommand } from './CreateWallsFromSlabCommand';
export { CreateWallsOnAllSlabsCommand } from './CreateWallsOnAllSlabsCommand';
export { CreateWallOpeningCommand } from './CreateWallOpeningCommand';