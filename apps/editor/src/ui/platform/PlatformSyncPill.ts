/**
 * PlatformSyncPill — re-exports the syncBadge helper.
 *
 * Named "SyncPill" in the Wave 14 FILE 2 god-file inventory
 * (docs/archive/pryzm3-internal/04-PLAN-FORWARD/18-WAVES-13-15-ZERO-WASTE.md §2a).
 * The implementation lives in PlatformToastSystem.ts; this module is
 * a stable named entry-point so callers can import from the correct
 * semantic module without depending on ToastSystem internals.
 *
 * Extracted from PlatformShell.ts (Wave 14 FILE 2 god-file split, 2026-05-02).
 */

export { syncBadge } from './PlatformToastSystem';
