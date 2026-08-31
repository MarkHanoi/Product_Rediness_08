// LANE A shim (F-P5-04 inversion, 2026-08-31): the real module moved to
// packages/core-app-model/src/annotations/AnnotationTypes.ts. This file keeps the
// plugin's public surface and every relative `./subsystem/*` import working,
// routed through @pryzm/plugin-sdk (the blessed edge — never a direct
// core-app-model import, which would grow the sdk-bypass ratchet).
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
    type AnnotationTypeCategory,
    ANNOTATION_CATEGORY_BY_FAMILY,
    ANNOTATION_DEFAULT_TYPE_BY_CATEGORY,
    defaultAnnotationTypeIdFor,
} from '@pryzm/plugin-sdk';
