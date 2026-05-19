// @pryzm/plugin-ai-floorplan — public barrel.
//
// Lazy entry: callers obtain the AI host via `getAiHost()` from
// `@pryzm/ai-host`. We re-export the descriptor + the sidebar panel
// renderer (vanilla DOM, no framework — pattern from
// `plugins/multiplayer/src/lock-ui.ts`).

export {
  PLUGIN_ID,
  aiFloorplanDescriptor,
  type AiFloorplanPluginDescriptor,
} from './descriptor.js';
export {
  mountApprovalQueuePanel,
  type ApprovalQueuePanel,
  type ApprovalQueuePanelOptions,
} from './ApprovalQueuePanel.js';
export { buildAiFloorplanHandlerSet } from './handlers/index.js';
export type { AiFloorplanHandler } from './handlers/index.js';
