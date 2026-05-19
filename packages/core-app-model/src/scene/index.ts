/**
 * @pryzm/core-app-model — scene sub-barrel (Sprint B, P9-W7)
 *
 * All canonical implementations live in @pryzm/scene-committer.
 * These files are thin re-export shims; this barrel collects them.
 */

export {
    BIM_LAYER,
    EDITOR_LAYER,
    ANNOTATION_LAYER,
    PLAN_SYMBOL_LAYER,
    DOCUMENTATION_LAYER,
} from '@pryzm/scene-committer';

export { SceneBoundsCache } from '@pryzm/scene-committer';
export { SceneObjectClassifier } from '@pryzm/scene-committer';
export { PreviewRegistry, previewRegistry } from '@pryzm/scene-committer';
export { StairPlanSymbolRegistry, stairPlanSymbolRegistry } from '@pryzm/scene-committer';
