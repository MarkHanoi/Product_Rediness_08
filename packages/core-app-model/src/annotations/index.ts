// §FEAT-AUTO-TAG-BATCH-EXECUTOR (L-265) — the GENERIC tag engine.
//
// One engine, N categories. `RoomTagAutoPopulator` (@pryzm/room-topology) and the
// editor's `autoTagActiveView` are both CONSUMERS of what is exported here; neither
// owns a lifecycle of its own. See TagReconciler.ts for why.

export {
    reconcileTagSet,
    readTagTargetId,
    tagTargetKey,
    TAG_ANNOTATION_TYPE,
    TAG_CATEGORIES,
    type TagCategory,
    type TagTargetLike,
    type ExistingTagLike,
    type TagReconciliation,
    type ReconcileTagSetArgs,
} from './TagReconciler.js';

export {
    resolveInstanceMark,
    resolveTypeMark,
    resolveTagMarks,
    type TagMarkSource,
    type MarkedRecordLike,
    type SystemTypeLookup,
    type ElementCodeLookup,
    type ResolvedMarks,
} from './elementMarks.js';

export {
    wallAxis,
    openingCentreXZ,
    planOpeningTagAnchor,
    planWallTagAnchor,
    elevationOpeningTagAnchor,
    elevationWallTagAnchor,
    PLAN_OPENING_LEADER_M,
    PLAN_WALL_LEADER_M,
    LEADER_STAGGER_M,
    ELEV_OPENING_LEADER_M,
    ELEV_WALL_LEADER_M,
    type TagAnchor,
    type TagWallLike,
    type TagOpeningLike,
    type ViewFrame,
} from './tagAnchors.js';

export {
    resolveAutoTagIntent,
    DEFAULT_TAG_MARK_SOURCE,
    type AutoTagIntent,
    type TagProjection,
    type TagCategorySwitches,
} from './AutoTagIntent.js';

export { withAutoTagSpan, _resetAutoTagTracerCache, type AutoTagStage } from './tracing.js';
