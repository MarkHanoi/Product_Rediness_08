// PASS fixture for `pryzm/no-raf`.
//
// File path used in the lint test is `packages/frame-scheduler/src/Pump.ts`,
// which is the only allowed location for `requestAnimationFrame`.

declare function tick(): void;

export function pump(): void {
  requestAnimationFrame(tick);
}
