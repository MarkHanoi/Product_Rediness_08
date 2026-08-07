export {
    type SubElementType,
    type StableReference,
    type ResolverStores,
    makeStableKey,
    makeRef,
    makePointRef,
    makeWallFaceRef,
    resolveReferenceToPoint,
} from './AnnotationReference.js';

export {
    type AnnotationType,
    type AnnotationStyle,
    type AnnotationGeometry2D,
    type AnnotationSemantics,
    type AnnotationElement,
    type DimensionElement,
    type DimPoint2D,
    type LinearDimSegment,
    DEFAULT_ANNOTATION_STYLE,
    makeAnnotationElement,
    // §ANN-TYPE — family → default system type (pure data; no store import)
    type AnnotationTypeCategory,
    ANNOTATION_CATEGORY_BY_FAMILY,
    ANNOTATION_DEFAULT_TYPE_BY_CATEGORY,
    defaultAnnotationTypeIdFor,
} from './AnnotationTypes.js';

export {
    type ValidationOutcome,
    validateAnnotationParameters,
} from './AnnotationParametersSchema.js';

export {
    AnnotationStore,
    annotationStore,
} from './AnnotationStore.js';

// §ANN-TYPE — annotation SYSTEM TYPES (the Revit Type/Instance split for annotation).
export {
    type AnnotationSystemType,
    AnnotationSystemTypeStore,
    annotationSystemTypeStore,
    BUILT_IN_ANNOTATION_TYPES,
} from './AnnotationSystemTypeStore.js';

export {
    AnnotationDependencyGraph,
} from './AnnotationDependencyGraph.js';

export {
    AnnotationVisibilityStore,
    annotationVisibilityStore,
} from './AnnotationVisibilityStore.js';

export {
    AnnotationVisibilityPanel,
} from './AnnotationVisibilityPanel.js';

export {
    type ConstraintOperator,
    type ConstraintRecord,
    ConstraintStore,
    constraintStore,
} from './ConstraintStore.js';

export {
    type ConstraintResult,
    ConstraintSolver,
    constraintSolver,
} from './ConstraintSolver.js';

export {
    type DimScreenPoint,
    type WallDimRenderParams,
    type WallDimStringRenderParams,
    WallDimensionRenderer,
} from './WallDimensionRenderer.js';

// §ANN-TAG-DEFAULT — what a tag displays, per host family (wall → ID by default).
export {
    type TaggableRecord,
    type TagProperty,
    TAG_PROPERTY_CATALOGUE,
    tagPropertiesFor,
    defaultTagPropertyFor,
    resolveTagLabel,
} from './TagPropertyResolver.js';

// §ANN-SEED — five demo annotations (five sizes, five colours) for an empty project.
export { type SeedOutcome, seedDemoAnnotations } from './seedDemoAnnotations.js';
