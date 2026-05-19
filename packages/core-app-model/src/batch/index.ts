/**
 * @pryzm/core-app-model — batch sub-barrel (P9-W4 2026-05-10)
 *
 * BatchCoordinator: singleton gating authority that eliminates the "avalanche"
 * failure mode in bulk-creation commands (curtain walls, slabs, walls).
 *
 * Migrated from src/engine/subsystems/core/batch/ to @pryzm/core-app-model
 * as part of the P9 (core/) extraction wave (Task 5.1).
 *
 * Layer: L3 — imports @pryzm/frame-scheduler (L3), @pryzm/core-app-model internals only.
 */

export type { BatchOptions } from './BatchCoordinator.js';
export { batchCoordinator } from './BatchCoordinator.js';
