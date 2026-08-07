# ADR-0305 — Camera framing: model → site → constant precedence; controls excluded from bounds by ONE classifier; verification must not read stale state

| Field | Value |
|---|---|
| **Status** | Accepted — 2026-08-07 |
| **Tags** | `§CAM-NEAR-NEVER-CUTS` (L-747) · `§CAM-FRAME-SITE-WHEN-NO-MODEL` (L-748) · `§FIX-GIZMO-IN-BOUNDS` (L-749) · `§CAM-VERIFY-AFTER-FLUSH` |
| **Owner** | Camera / framing (`cameraFraming`, `SceneObjectClassifier`, `initViewSetup.zoomToAll`) |
| **Closes** | Founder, 2026-08-07 live session: near-plane "camera section" when walking up to elements; wrong startup zoom ("I NEED TO CLICK HOME"); "the boundary appears briefly then it's gone" / white 3D screen |
| **Constraints** | C04 (framing), C60 §4 (camera ports), C06/C12 (site ring stays in its authored frame), ADR-0299, ADR-0300, ADR-0301 |
| **Implemented by** | `7abd4c70` (near cap + repair) · `c72fdb89` (site precedence + probe rev 2) · `bfed0f7d` (structural control exclusion) · context: `75fc111d` (L-746 ECEF handback) |

---

## Context — one object, the whole chain

The revision-2 bounds probe (`c72fdb89`) identified the poison: the **TransformControls
gizmo**. three.js draws its picker/helper lines as effectively infinite — ~1 575 km each,
23 of them — in the scene on every project since transform controls were first
constructed. Every filter missed it because it looks exactly like what a CONTROL looks
like: `.type` is plain `'Mesh'` (only the PARENT is `TransformControlsGizmo`), userData is
EMPTY (no elementType, no id, no isHelper), and the constructor name is minified.

The chain from that one object: scene bounds ~3 152 km → default framing at 6 542 km
(L-744) → `near = far/1e6 = 14.02 m`, slicing walls the user walked up to (L-747) → and on
a project with no walls, `zoomToAll`'s FALLBACK pass framed the gizmo and flew the camera
to megametres (the white 3D screen). Separately, the Cesium globe hands the SHARED camera
back in ECEF and nothing restored BIM space (L-746, `75fc111d`) — L-378 guarded only the
SAVE, so every downstream consumer of the live camera looked like a separate bug.

## Decision

### 1. Framing precedence is **model → site → constant**

- With BIM geometry: frame the model.
- With no model but a committed site boundary: frame the SITE — a committed boundary IS
  the site (ADR-0300 ranks it the best evidence of extent). The parcel ring is consumed in
  its authored frame (scene-XZ metres, C12 LTP-ENU) — NOT via `resolveSiteFramingExtent`,
  which is the GEO-extent authority for the 2D/3D map panes; one authority **per
  coordinate space**, not one authority for every camera.
- With neither: the constant (50 m at origin) stays as the honest answer — an empty
  project must not be framed as though it were authored.
- The site ring is NOT folded into `computeSceneBounds()`: "what the model occupies" and
  "where the site is" are different questions; merging them would silently widen
  fit-to-selection, level framing and export scoping.

### 2. The near plane may NEVER cut the model

A depth-precision heuristic must not clip geometry: `near` is capped at
`MAX_BIM_NEAR_M = 0.1 m` regardless of `far`. The cost is honest and bounded — weaker
depth precision on distant coplanar surfaces — and we take the artefact over destroying
the geometry being looked at. The depth range is additionally checked and **repaired on 3D
activation independently of camera position**: a camera can sit at a sane BIM position
behind a poisoned near plane, and guards that only stop NEW contamination cannot repair an
already-poisoned session.

### 3. Controls and helpers are excluded from the bounds population **structurally, by the ONE classifier**

- Exclusion is **ancestry-based** (a `TransformControlsGizmo` descendant is excluded even
  though the descendant itself is a plain `Mesh`) and keyed on `.type` (set by three,
  survives minification) — never on constructor names, and never on element-identity
  userData, whose absence is precisely what a control looks like.
- The covered type set: `TransformControls{,Gizmo,Plane}`, `Box3Helper`, `BoxHelper`,
  `ArrowHelper`, `PlaneHelper`, `SkeletonHelper`, and the core light/camera/axes/grid
  helpers, plus `userData.isHelper` subtrees.
- **Every framer routes through `SceneObjectClassifier`.** `zoomToAll` had re-implemented
  classification (an allow-listed pass AND an unfiltered fallback pass) — two independent
  notions of "is this part of the model" is what let the gizmo be excluded in one place
  and included in another. With one classifier the framers converge, so ordering stops
  deciding the outcome. If framers still disagree, the answer is a single framing owner,
  not another guard. (A `§FIX-ONCE-IMPORT-EVERYWHERE` instance — ADR-0306.)

### 4. A verification must not read stale state (`§CAM-VERIFY-AFTER-FLUSH`)

The ADR-0299 framing verification read the camera immediately after
`controls.setLookAt(..., false)`, but camera-controls defers the write to its next
`update()` — so it verified the PRE-FIT pose and reported "auto-frame RAN BUT DID NOT
WORK" for a fit that had worked. A verification that reads stale state cries wolf on the
good path and masks the real failure it exists to catch. Verifications read AFTER the
authority they verify has flushed.

### 5. A probe must identify its subject (ADR-0301 applied)

Revision 1 reported `Largest contributor: X (elementType=∅, id=∅)` — it established a
non-BIM object exists and nothing else. The probe now prints constructor + `.type` +
`.name` + userData keys + parent chain + vertex count + world box for the top three
offenders over 1 km, and covers `Points`/`LineSegments`/`Sprite`, not just `Mesh`.

## Consequences

- Ten new scene-committer tests pin the founder's exact gizmo ancestry, helper
  descendants, `userData.isHelper` subtrees, a cyclic-parent guard, and that real BIM
  geometry is still INCLUDED.
- The defence is in depth: the near cap holds even for inputs L-744 now rejects — a cap
  that only works on guarded inputs is not a cap.
- Home (`captureDefaultView`) is NOT a framing source: it samples the live camera on a
  timer and knows nothing about the site; it working means a correct framing EXISTED, not
  where to get one (the same sampling race captured an ECEF pose in another session,
  L-746).
