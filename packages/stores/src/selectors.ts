// @pryzm/stores — memoized Zustand selectors — Wave A18-T25
//
// CONTRACT (C03 §3): Store read access MUST use memoized selectors to
// prevent components from re-rendering when unrelated state changes.
//
// Pattern:
//   import { selectActiveViewId } from '@pryzm/stores/selectors';
//   const viewId = useActiveViewStore(selectActiveViewId);
//   // → only re-renders when activeViewId changes, not on any store mutation
//
// All selectors in this file are pure functions (state → value) compatible
// with Zustand's `useStore(selector)` pattern.  We do NOT use a third-party
// `createSelector` library — Zustand's built-in shallow equality check on the
// selector return value is sufficient for the patterns used here.
//
// For derived collections (filter / map / reduce) use `subscribeWithSelector`
// middleware + `useShallow` from 'zustand/react/shallow' at the call site:
//
//   import { useShallow } from 'zustand/react/shallow';
//   const walls = useElementStore(useShallow(state =>
//     state.elements.filter(e => e.type === 'wall')
//   ));

import type { ActiveViewState } from './ActiveViewStore.js';
import type { ActiveSheetState } from './ActiveSheetStore.js';
import type { ActiveScheduleState } from './ActiveScheduleStore.js';
import type { SelectionDto } from './SelectionStore.js';
import type { AnnotationsState } from './AnnotationStore.js';
import type { DimensionViewSettings } from './DimensionStore.js';

// ── ActiveViewStore selectors ─────────────────────────────────────────────────

/** The id of the currently active view. */
export const selectActiveViewId = (state: ActiveViewState): string =>
  state.activeViewId;

/** The id of the currently active tool (null when no tool active). */
export const selectActiveToolId = (state: ActiveViewState): string | null =>
  state.activeToolId;

/** True when any tool is currently active. */
export const selectHasActiveTool = (state: ActiveViewState): boolean =>
  state.activeToolId !== null;

// ── ActiveSheetStore selectors ────────────────────────────────────────────────

/** The id of the currently active sheet (null when no sheet selected). */
export const selectActiveSheetId = (state: ActiveSheetState): string | null =>
  state.activeSheetId;

/** True when a sheet is selected. */
export const selectHasActiveSheet = (state: ActiveSheetState): boolean =>
  state.activeSheetId !== null;

// ── ActiveScheduleStore selectors ─────────────────────────────────────────────

/** The id of the currently active schedule (null when none selected). */
export const selectActiveScheduleId = (state: ActiveScheduleState): string | null =>
  state.activeScheduleId;

// ── SelectionStore selectors ──────────────────────────────────────────────────
//
// The SelectionStore is a Map<id, SelectionDto> under Store<SelectionDto>.
// For lightweight selectors we operate on individual SelectionDto objects.

/** The kind of a selection DTO. */
export const selectSelectionKind = (dto: SelectionDto): string =>
  dto.kind;

/** The id of a selection DTO. */
export const selectSelectionId = (dto: SelectionDto): string =>
  dto.id;

// ── AnnotationStore selectors ─────────────────────────────────────────────────
//
// AnnotationsState = Record<string, AnnotationData>

/** Number of annotations in the store. */
export const selectAnnotationCount = (state: AnnotationsState): number =>
  Object.keys(state).length;

/** Look up an annotation by id. Returns null when not found. */
export const selectAnnotationById =
  (id: string) =>
  (state: AnnotationsState) =>
    state[id] ?? null;

/** Array of all annotation ids. Safe to use with useShallow. */
export const selectAnnotationIds = (state: AnnotationsState): string[] =>
  Object.keys(state);

// ── DimensionStore selectors ──────────────────────────────────────────────────
//
// DimensionViewSettings: { autoDimensionMode, showOverallDimensions? }

/** The auto-dimension mode for a view's settings. */
export const selectDimensionAutoMode = (settings: DimensionViewSettings): string =>
  settings.autoDimensionMode;

/** Whether the view shows overall (chain-spanning) dimensions. */
export const selectShowOverallDimensions = (settings: DimensionViewSettings): boolean =>
  settings.showOverallDimensions ?? false;

/** True when auto-dimensioning is off. */
export const selectIsDimensionOff = (settings: DimensionViewSettings): boolean =>
  settings.autoDimensionMode === 'off';

// ── Composite / derived selectors ─────────────────────────────────────────────
// These compose primitive selectors and are safe because they derive scalars,
// not new object references.

/**
 * selectIsWallToolActive — true when the wall creation tool is active.
 * Safe to use without useShallow because it returns a boolean.
 */
export const selectIsWallToolActive = (state: ActiveViewState): boolean =>
  state.activeToolId === 'wall';

/**
 * selectIsDoorToolActive — true when the door insertion tool is active.
 */
export const selectIsDoorToolActive = (state: ActiveViewState): boolean =>
  state.activeToolId === 'door';

/**
 * selectIsWindowToolActive — true when the window insertion tool is active.
 */
export const selectIsWindowToolActive = (state: ActiveViewState): boolean =>
  state.activeToolId === 'window';

/**
 * selectIsDefaultView — true when the active view is the default 3D view.
 */
export const selectIsDefaultView = (state: ActiveViewState): boolean =>
  state.activeViewId === 'view-default-3d';
