/**
 * plan-view intent — command ID constants for the plan-view plugin (Wave 11 recipe).
 *
 * These are the commandBus command ids dispatched by plan-view interactions.
 * The wave 11 recipe requirement: plan-view now declares the commands it handles
 * so they can be registered in PluginRegistry.ts auto-discovery (Wave 18).
 *
 * Spec: PHASE-2B-Q2-M16-M18-PLAN-VIEW.md §S33 G9/G10/G11.
 */

export const PLAN_VIEW_COMMANDS = {
  /** Activate a level — makes it the current rendering slice. */
  LEVEL_ACTIVATE: 'plan-view.level.activate',
  /** Select element(s) in the plan view (G9). */
  ELEMENT_SELECT: 'plan-view.element.select',
  /** Clear selection from the plan view. */
  SELECTION_CLEAR: 'plan-view.selection.clear',
  /** Drag-move a selected element in the plan view (G10). */
  ELEMENT_MOVE: 'plan-view.element.move',
  /** Ephemeral preview of a move (not committed to undo stack). */
  ELEMENT_MOVE_PREVIEW: 'plan-view.element.move.preview',
  /** Request a section cut at the given elevation. */
  SECTION_CUT: 'plan-view.section-cut',
  /** Annotation placed in the plan view. */
  ANNOTATION_CREATE: 'plan-view.annotation.create',
  /** Annotation removed from the plan view. */
  ANNOTATION_DELETE: 'plan-view.annotation.delete',
} as const;

export type PlanViewCommandId = typeof PLAN_VIEW_COMMANDS[keyof typeof PLAN_VIEW_COMMANDS];

/**
 * Dependencies the plan-view intent layer needs from its host.
 * Injected at bootstrap time by apps/editor.
 */
export interface PlanViewIntentDeps {
  /** Dispatch a commandBus command. The exact type comes from @pryzm/command-bus. */
  dispatch(commandId: string, payload: unknown): void;
  /** Read the id of the currently active level. */
  getActiveLevelId(): string | undefined;
}
