# Queue: ESC during boundary-draw still broken (founder, 2026-06-21)

**Symptom:** while defining the site boundary (the Hektar 2D draw map, onboarding
`pryzmStartBoundaryDraw()` → `SiteBoundaryMap2D`), pressing **ESC** misbehaves — the issue the
founder previously reported is still present.

**Status:** QUEUED (founder said "queue it"; not yet investigated this session).

**Where to look when picked up:**
- `SiteBoundaryMap2D` component (bundle `SiteBoundaryMap2D-*.js`) — the 2D boundary-draw map.
- The boundary-draw tool armed via `pryzmStartBoundaryDraw()` (onboarding `§GIS-HANDOFF`).
- ESC key handler: likely a `keydown` listener that should cancel the in-progress polygon /
  exit draw mode. Candidate defects: ESC not bound on the 2D map canvas (only on the 3D viewport);
  ESC cancels the whole onboarding/closes the map instead of just the current vertex/draw; or the
  listener is removed when GIS toggles. Compare with the working ESC-cancels-draw in the BIM plan
  tools (`initTools` / DrawingEditor) for the expected pattern.

**Repro:** New project → guided onboarding → location → "draw on map" → start drawing a boundary →
press ESC mid-draw. Observe the wrong behaviour.

**Next action:** reproduce + read the SiteBoundaryMap2D ESC handling; decide whether ESC should
(a) remove the last vertex, or (b) cancel the whole boundary and stay on the map. Confirm intended
UX with the founder before coding.
