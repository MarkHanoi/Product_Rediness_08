// AB-0 (Sprint AB, 2026-05-12): ToolName + ToolState extracted from
// src/engine/subsystems/tools/types.ts so tool packages (e.g. @pryzm/geometry-stair)
// can depend on @pryzm/core-app-model without pulling in src/-relative paths.
//
// Source of truth — tools/types.ts re-exports these for in-src/ consumers (no dup).

export type ToolName =
    | 'none'
    | 'slab'
    | 'wall'
    | 'window'
    | 'door'
    | 'curtain-wall'
    | 'column'
    | 'beam'
    | 'stair'
    | 'ceiling'
    | 'floor'
    | 'roof'
    | 'railing'
    | 'linear-dimension'
    | 'text-note'
    | 'element-tag'
    | 'angular-dimension'
    | 'spot-elevation'
    | 'keynote'
    | 'room'
    | 'linear-dim'
    | 'detail-view'
    | 'radius-dimension'
    | 'diameter-dimension'
    | 'slope-dimension'
    | 'door-tag'
    | 'window-tag'
    | 'level-tag'
    | 'grid-bubble'
    | 'revision-cloud'
    | 'furniture'
    | 'plumbing'
    | 'opening'
    | 'grid'
    | 'section-mark'
    | 'elevation-mark'
    | 'stair-path';

export enum ToolState {
    IDLE                 = 'idle',
    DRAWING              = 'drawing',
    AWAITING_CONFIRMATION = 'awaiting_confirmation',
}
