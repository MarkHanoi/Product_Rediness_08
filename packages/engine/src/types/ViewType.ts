/**
 * ViewType / ViewMode — camera projection and viewport display mode.
 *
 * Sprint F-2.5 (2026-05-15): These types have been migrated to `@pryzm/views`
 * (the view-layer contracts package) where they conceptually belong.
 * This file is now a backward-compatible re-export shim so all existing
 * consumers of `@pryzm/engine` continue to resolve without changes.
 *
 * New code should prefer:
 *   `import type { ViewType, ViewMode } from '@pryzm/views'`
 */
export type { ViewType, ViewMode } from '@pryzm/views';
