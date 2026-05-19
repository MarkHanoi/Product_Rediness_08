// a11y — barrel for accessibility primitives (S58 §19.7 deliverable #3).
//
// Spec source: PHASE-3B-FAMILY-CREATOR-REWRITE-PLAN.md §19.7.
// Single import point so `AppShell.ts` stays under the §13 LoC cap.

export { createSkipLink } from './skipLink.js';
export {
  createLiveRegion,
  type LivePoliteness,
  type LiveRegionMount,
} from './liveRegion.js';

/** Conventional id used by the skip-link target.  Kept here so the
 *  link factory and the AppShell agree on the same string. */
export const MAIN_CONTENT_ID = 'main-content';
