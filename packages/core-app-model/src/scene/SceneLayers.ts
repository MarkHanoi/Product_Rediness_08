/**
 * @file src/engine/subsystems/core/scene/SceneLayers.ts
 *
 * Thin re-export shim — Wave A16-T3 (S122).
 * Canonical implementation lives in `packages/scene-committer/src/SceneLayers.ts`.
 * All consumers that import from this path continue to compile unchanged.
 */
export {
    BIM_LAYER,
    EDITOR_LAYER,
    ANNOTATION_LAYER,
    PLAN_SYMBOL_LAYER,
    DOCUMENTATION_LAYER,
} from '@pryzm/scene-committer';
