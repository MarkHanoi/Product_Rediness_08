// FAIL fixture for `pryzm/no-raf`.
//
// This file lives outside `packages/frame-scheduler/`, so the bare
// `requestAnimationFrame` call below MUST be flagged by the rule.

declare function paint(): void;

export function startLoop(): void {
  requestAnimationFrame(paint);
}
