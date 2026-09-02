// apps/editor/src/ui/component — the component AUTHORING UI (Phase 4F).
//
// ⛔ This barrel exports SURFACES, never a second model. The parameter model is
// `@pryzm/family-runtime`, the profile evaluator is `@pryzm/family-instance`, the constraint
// record is C74 §4.6, and the drawing surface is `../ElevationOutlineSurface` — extended in
// place, not forked (audit R1; C86 §10.1 PR-9).

export {
    PERSISTED_CONSTRAINT_KINDS,
    EVALUABLE_CONSTRAINT_KINDS,
    EXECUTABLE_BUT_UNPERSISTABLE,
    authorableConstraintKinds,
    constraintAuthoringDisposition,
    constraintGlyphLabel,
    constraintGlyphTitle,
    constraintStatus,
    isPersistedConstraintKind,
    type ConstraintAuthoringDisposition,
    type ConstraintAuthoringRefusal,
    type PersistedConstraintKind,
} from './profileConstraints';

export {
    commitRingToProfile,
    profileConstraintGlyphs,
    profileToSurfaceRing,
    profileWriteBackDisposition,
    surfaceToPlane,
    type ProfileCommitResult,
    type ProfileGlyphResult,
    type ProfileOnPlane,
    type ProfileSurfaceRefusal,
    type ProfileToRingResult,
    type ProfileWriteBackDisposition,
} from './profileSurfaceAdapter';

export {
    buildParameterTableModel,
    createComponentParameterTable,
    runtimeUnitLabel,
    type ComponentParameterTableHandle,
    type ComponentParameterTableOptions,
    type ParameterRowModel,
    type ParameterTableModel,
    type ParameterValueSource,
} from './ComponentParameterTable';

export {
    createComponentProfilePanel,
    type ComponentProfilePanelHandle,
    type ComponentProfilePanelOptions,
} from './ComponentProfilePanel';
