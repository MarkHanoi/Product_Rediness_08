// ──────────────────────────────────────────────────────────────────────────
// Contract 25b — Wave 3
//
// The eight commands re-exported below (CreateVGTemplate / ApplyVGTemplate*
// / SetVGCategoryStyle / SetVGViewCategoryStyle / CaptureViewVGAsTemplate /
// UpdateVGTemplateCategoryStyle / SetInstanceVGOverride) are LEGACY. They are
// kept only so that pre-25b project files continue to load without runtime
// errors. New code MUST use the modern Intent + Override commands listed
// below (Assign / Create / Update / DeleteVisibilityIntent + Hide / Isolate /
// Ghost / SetGraphicOverride / Clear* / ClearAllOverrides).
//
// Lint guard: `scripts/check-no-legacy-vg.sh` will flag any new importer.
// ──────────────────────────────────────────────────────────────────────────
/** @deprecated Contract 25b — use `CreateVisibilityIntentCommand`. */
export { CreateVGTemplateCommand } from './CreateVGTemplateCommand';
/** @deprecated Contract 25b — use `AssignViewIntentCommand` against a project default. */
export { ApplyVGTemplateToModelCommand } from './ApplyVGTemplateToModelCommand';
/** @deprecated Contract 25b — use `UpdateVisibilityIntentCommand` on `elementRules`. */
export { SetVGCategoryStyleCommand } from './SetVGCategoryStyleCommand';
/** @deprecated Contract 25b — use `SetGraphicOverrideCommand` on the view's `OverrideLayer`. */
export { SetVGViewCategoryStyleCommand } from './SetVGViewCategoryStyleCommand';
/** @deprecated Contract 25b — use `CreateVisibilityIntentCommand` derived from current overrides. */
export { CaptureViewVGAsTemplateCommand } from './CaptureViewVGAsTemplateCommand';
/** @deprecated Contract 25b — use `AssignViewIntentCommand`. */
export { ApplyVGTemplateToViewCommand } from './ApplyVGTemplateToViewCommand';
/** @deprecated Contract 25b — use `UpdateVisibilityIntentCommand`. */
export { UpdateVGTemplateCategoryStyleCommand } from './UpdateVGTemplateCategoryStyleCommand';
export { VG_COMMAND_TYPES } from './types';
// Phase C — Serialisable Visibility Rule Layer
export { CreateVisibilityRuleCommand } from './CreateVisibilityRuleCommand';
export { UpdateVisibilityRuleCommand } from './UpdateVisibilityRuleCommand';
export { DeleteVisibilityRuleCommand } from './DeleteVisibilityRuleCommand';
export { ToggleVisibilityRuleCommand } from './ToggleVisibilityRuleCommand';
export { AssignViewIntentCommand } from './AssignViewIntentCommand';
export { CreateVisibilityIntentCommand } from './CreateVisibilityIntentCommand';
export { UpdateVisibilityIntentCommand } from './UpdateVisibilityIntentCommand';
export { DeleteVisibilityIntentCommand } from './DeleteVisibilityIntentCommand';
export { HideElementInViewCommand } from './HideElementInViewCommand';
export { IsolateElementInViewCommand } from './IsolateElementInViewCommand';
export { GhostElementInViewCommand } from './GhostElementInViewCommand';
export { SetGraphicOverrideCommand } from './SetGraphicOverrideCommand';
export { ClearOverrideCommand } from './ClearOverrideCommand';
export { ClearAllOverridesCommand } from './ClearAllOverridesCommand';
export type { UpdateVisibilityRulePatch } from './UpdateVisibilityRuleCommand';
// Wave 7 / Stage A2 — VisibilityIntent appearance mass-edit + clipboard.
export {
    BulkApplyAppearanceCommand,
    CopyAppearancePatchToClipboardCommand,
    PasteAppearancePatchFromClipboardCommand,
    appearancePatchClipboardIsPopulated,
    peekAppearancePatchClipboard,
} from './BulkApplyAppearanceCommand';
export type { BulkAppearanceTarget } from './BulkApplyAppearanceCommand';
