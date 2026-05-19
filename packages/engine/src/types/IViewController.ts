/**
 * IViewController / IViewSwitchListener — view controller and switch-listener contracts.
 *
 * Sprint F-2.5 (2026-05-15): These interfaces have been migrated to `@pryzm/views`
 * (view-controller concepts belong in the view-layer package; the migration also
 * breaks the circular dependency that previously prevented `@pryzm/editor-ui` from
 * importing `IViewController`).
 *
 * This file is now a backward-compatible re-export shim. All existing consumers of
 * `import type { IViewController } from '@pryzm/engine'` continue to resolve without
 * any changes.
 *
 * New code should prefer:
 *   `import type { IViewController, IViewSwitchListener } from '@pryzm/views'`
 */
export type { IViewController, IViewSwitchListener } from '@pryzm/views';
