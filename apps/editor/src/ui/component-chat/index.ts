// @pryzm/editor — Component authoring chat (lane U6). Barrel over the deterministic
// offline resolvers, the shared strip, and the surface controllers. UIUX-PLAN §U6.
export {
    resolveComponentInstanceAsk,
    resolveComponentExpressionAsk,
    paramEntriesFrom,
    typeEntriesFrom,
    instanceExamples,
    instanceAuthorable,
    expressionExamples,
    type ParamEntry,
    type TypeEntry,
    type ComponentInstanceResolution,
    type ComponentExpressionResolution,
} from './componentChatIntents.js';
export {
    mountComponentChat,
    type ComponentChatController,
    type ComponentChatHandle,
    type ComponentChatLine,
} from './ComponentChatStrip.js';
export {
    makeComponentInstanceController,
    makeComponentExpressionController,
    type ComponentInstanceChatPort,
    type ComponentExpressionChatPort,
    type ExpressionPreviewLike,
    type ExpressionDiagnosticLike,
} from './componentChatControllers.js';
