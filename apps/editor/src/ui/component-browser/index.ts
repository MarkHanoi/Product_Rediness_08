// Component browser — lane U1 (§COMPONENT-BROWSER / §COMPONENT-PLACE-TOOL).
// The barrel both create surfaces dynamic-import (UIUX-PLAN §U1).
export {
    ComponentBrowserPanel,
    openComponentBrowser,
    type ComponentBrowserOptions,
} from './ComponentBrowserPanel';
export { armComponentPlaceTool, type ActiveComponentPlacement } from './componentPlaceTool';
// Lane U-SEED — the from-zero authoring path (mint a minimal valid Component and
// open U3's workspace on it). Exported so a create surface / AI activation can
// reach it without going through the browser panel's private button.
export {
    createBlankComponentDefinition,
    openNewComponentWorkspace,
    type CreateBlankComponentResult,
    type OpenNewComponentResult,
} from './newComponent';
