// Intentional fixture — `pryzm/no-raf` MUST flag the call below.
// See package README for the full justification.

declare function paint(): void;

export function start(): void {
  requestAnimationFrame(paint);
}
