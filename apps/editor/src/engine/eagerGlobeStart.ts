// eagerGlobeStart.ts — §STARTUP-EAGER-GLOBE (founder 2026-08-10: "project-launch globe ~3×
// quicker + complete first paint").
//
// THE MEASURED DEFECT: `location-step:open +2483ms` and `globe:camera-host-ready +2053ms` after
// that (t+4537ms; worse run t+9339ms). The FULL engine boot (builders, ~80 bus bridges, 37
// stores, tools, UI) ran to completion BEFORE the onboarding location step mounted the Cesium
// globe, and only then did `toggleGIS(true)` start the viewer construction + tile streaming — on
// a container that was 0×0 (display:none) at viewer creation, so even the first tile request
// waited for visibility. Two seconds of engine boot and two seconds of globe mount, in SERIES.
//
// THE FIX: run them in PARALLEL. `PlatformRouter.showOnboarding` (the earliest moment we KNOW a
// globe-first onboarding is coming) sets this one-shot flag; `mountGISArea` (wired during the
// engine boot the flag predates) consumes it and kicks the SAME first-activation Cesium init it
// would later run for `toggleGIS(true)` — construct, mount into a WARM-HIDDEN container
// (`CesiumViewport.enterWarmHiddenState()`: laid out so tiles stream, invisible + inert so
// nothing paints over the boot surface), bridge + authoring surfaces. When the location step
// then calls `pryzmToggleGIS(true)`, the viewer is already live (or mid-mount) and activation is
// a visibility flip instead of a cold construction.
//
// WHY A MODULE FLAG, NOT A WINDOW GLOBAL: P4 forbids `(window as any)`, and the two parties are
// both editor modules — a typed module seam is the honest mechanism. One-shot (consume clears)
// so a LATER project open from the hub — where no onboarding is in flight — never eager-mounts a
// globe nobody asked for.
//
// P8: every exported function carries an OTel span.

import { trace } from '@opentelemetry/api';

const _tracer = trace.getTracer('pryzm.startup.eager-globe');

let _requested = false;

/** Called by `PlatformRouter.showOnboarding` — a globe-first onboarding flow is starting; the
 *  next `mountGISArea` wiring should start the Cesium viewer eagerly, in parallel with the rest
 *  of the engine boot. Idempotent. */
export function requestEagerGlobeStart(): void {
    const span = _tracer.startSpan('pryzm.startup.eager-globe.request');
    try {
        _requested = true;
    } finally {
        span.end();
    }
}

/** Called by `mountGISArea` at wiring time. Returns true AT MOST ONCE per request, so a second
 *  mount (another project open in the same session) stays lazy unless onboarding re-requests. */
export function consumeEagerGlobeStart(): boolean {
    const span = _tracer.startSpan('pryzm.startup.eager-globe.consume');
    try {
        const was = _requested;
        _requested = false;
        return was;
    } finally {
        span.end();
    }
}

/** Test seam — reset without consuming semantics. */
export function __resetEagerGlobeStart(): void {
    _requested = false;
}
