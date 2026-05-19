// @pryzm/schemas/annotation — annotation-layer schemas (S31 / Phase 2B Supplement).
//
// Re-exports every public symbol from the annotation tree.  Distinct from the
// `elements/Dimension.ts` first-class node schema which models PRYZM 1's
// existing dimension element (preserved for backward compatibility until
// M36 GA per the SPEC-04 §13 cross-reference).

export {
  ArrowheadStyleSchema,
  DimAnchorSchema,
  DimensionAutoModeSchema,
  DimensionKindSchema,
  DimensionReferenceSchema,
  DimensionStringIdSchema,
  DimensionStringSchema,
  DimOrientationSchema,
  ElementIdSchema,
  LevelIdSchema,
  UnitFormatSchema,
  ViewIdSchema,
  WitnessLineStyleSchema,
  type ArrowheadStyle,
  type DimAnchor,
  type DimensionAutoMode,
  type DimensionKind,
  type DimensionReference,
  type DimensionString,
  type DimensionStringId,
  type DimOrientation,
  type ElementIdRef,
  type EvaluatedDimension,
  type LevelIdRef,
  type UnitFormat,
  type ViewIdRef,
  type WitnessLineStyle,
} from './dimension.js';
