// apps/editor/src/ui/component-editor-workspace — lane U3's public surface.
// The definition-editor workspace: draft-then-ops-then-pack. See
// `ComponentDefinitionWorkspace.ts` for the doctrine (family-migrations ops are
// the ONLY document mutation path; save = packFamily → the ONE catalogue/loader;
// live typed diagnostics from resolveParameter; D5 Component vocabulary).

export {
    openComponentDefinitionWorkspace,
    type AddParameterFields,
    type ComponentDefinitionWorkspaceHandle,
    type ExpressionPreview,
    type OpenComponentDefinitionWorkspaceResult,
} from './ComponentDefinitionWorkspace.js';
