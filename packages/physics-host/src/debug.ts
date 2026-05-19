// PhysicsDebug — D.4.3 dev-only debug helpers for the physics-host.
//
// Functions are exported unconditionally; production bundles tree-shake
// any unused call sites automatically.  Callers in dev tooling / panel
// code import these by name; production paths never reference them.
//
// PURE: no DOM, no THREE, no RAF calls, no Node globals.

/** Log the current `isReady()` value of the physics-host.
 *  Intended for dev tooling; tree-shaken in production when unused. */
export function debugLogPhysicsReady(isReady: boolean): void {
  console.debug('[physics-host] isReady =', isReady);
}

/** Log a soft-fail error captured by `bootstrapPhysics()`.
 *  Intended for dev tooling; tree-shaken in production when unused. */
export function debugLogPhysicsError(error: Error): void {
  console.debug('[physics-host] bootstrap soft-fail:', error.message);
}

/** Log a stepper lifecycle event (start / stop / tick).
 *  Intended for dev tooling; tree-shaken in production when unused. */
export function debugLogStepperEvent(
  event: 'start' | 'stop' | 'tick',
  detail?: unknown,
): void {
  console.debug('[physics-host/stepper]', event, detail ?? '');
}
