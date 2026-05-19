/**
 * ViewType — the camera projection mode.
 *
 * Sprint F-2.5 (2026-05-15): migrated from `@pryzm/engine` to `@pryzm/views`
 * (view-layer concepts belong in the view-layer package).
 * `@pryzm/engine` re-exports these for backward compatibility.
 *
 * Until Sprint F-2.5, `apps/editor/src/engine/ViewController.ts` is the
 * authoritative implementation; this declaration is the canonical public
 * contract that UI and plugin code imports.
 */
export type ViewType = 'perspective' | 'orthographic';

/**
 * ViewMode — the active viewport display mode.
 *
 * Sprint F-2.1 REVISED (2026-05-15): aligned to the ground-truth values
 * from `@pryzm/core-app-model` ViewNavigationManager.ts and the production
 * ViewController.ts implementation.
 *
 * Sprint F-2.5 (2026-05-15): migrated from `@pryzm/engine` to `@pryzm/views`.
 * `@pryzm/engine` re-exports for backward compatibility.
 *
 * '3D'           – full perspective / orbit viewport (default).
 * 'Top'          – top-down orthographic floor-plan view (structural plan).
 * 'Ceiling'      – ceiling-plan view (reflected ceiling plan).
 * 'ceiling-plan' – alias for ceiling plan used by viewDefinition routing.
 * 'Front'        – exterior front elevation view.
 * 'Back'         – exterior back elevation view.
 * 'Left'         – exterior left elevation view.
 * 'Right'        – exterior right elevation view.
 */
export type ViewMode = '3D' | 'Top' | 'Ceiling' | 'ceiling-plan' | 'Front' | 'Back' | 'Left' | 'Right';
