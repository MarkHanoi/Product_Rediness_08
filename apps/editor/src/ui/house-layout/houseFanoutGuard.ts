// Casa Unifamiliar — house post-gen fan-out guard (A.21.i).
//
// The apartment finish chain is built from globally-subscribed triggers that
// CASCADE off each other's completion events:
//   apartment.layout-executed → floor + ceiling
//   ceiling.layout-executed   → furnish   (furnishLayoutTrigger)
//   furnish.layout-executed   → lighting  (lightingLayoutTrigger)
//
// The house orchestrator (`runHousePostGenChain`) drives those SAME stages
// itself, PER STOREY, emitting each stage's `*.layout-execute` event explicitly
// so it can target a specific level and sequence the storeys. That means the
// stage executors emit their `*.layout-executed` completion events — which would
// ALSO trip the cascade handlers above and fire furnish/lighting a SECOND time
// (duplicate furniture / fixtures). This guard lets those cascade handlers
// no-op while the house orchestrator is actively driving the chain.
//
// ADDITIVE + apartment-safe: the guard is FALSE during every apartment run (only
// `runHousePostGenChain` ever flips it), so the apartment cascade is byte-for-
// byte unchanged. It is a simple in-memory boolean — no rAF, no store writes.

let _houseFanoutActive = false;

/** True while the house orchestrator is driving the per-storey finish chain. */
export function isHouseFanoutActive(): boolean {
    return _houseFanoutActive;
}

/** Mark the house fan-out as active (called by runHousePostGenChain). */
export function beginHouseFanout(): void {
    _houseFanoutActive = true;
}

/** Clear the house fan-out flag (called when the orchestrator finishes). */
export function endHouseFanout(): void {
    _houseFanoutActive = false;
}
