// @pryzm/editor/projects — S28 project hub public surface.
//
// A side bundle: the kill-switch boot in `src/main.ts` lazily imports
// this entry only on the hub route, keeping the engine bundle out of
// hub load.  See `phases/PHASE-2A-Q1-M13-M15-NON-ELEMENT-COMPLETION.md`
// §S28 D8 line 745 ("Performance: hub renders < 100 ms for 50
// projects").

export {
  mountProjectHub,
  type MountProjectHubOptions,
  type ProjectHubHandle,
} from './ProjectHub.js';
export {
  renderProjectCard,
  type RenderProjectCardOptions,
} from './ProjectCard.js';
export {
  mountNewProjectDialog,
  type MountNewProjectDialogOptions,
  type NewProjectDialogHandle,
  type NewProjectSubmission,
} from './NewProjectDialog.js';
