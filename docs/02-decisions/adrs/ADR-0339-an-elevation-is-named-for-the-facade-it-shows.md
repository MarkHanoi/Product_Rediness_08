# ADR-0339 — An elevation is named for the façade it SHOWS, and its scope has exactly one owner

- **Status:** Accepted
- **Date:** 2026-08-21
- **Lane:** ELEV1
- **Supersedes:** nothing. **Amends in place:** `VIEW_PROJECTION_DIRECTIONS` doc-comments,
  `DEFAULT_ELEVATION_VIEWS`, `ViewCropSettings.region`.
- **Commit:** `e0e13f6d`
- **Contracts:** C04 (rendering/scheduling), C06 §13.3 (one producer per surface),
  C24 (spatial crop) / C24.1 (paper crop), C09 §4.6.5 (occluder/depth regimes).
- **Issue-log:** L-1858 … L-1861.

---

## 1 · Context — what the founder reported

Testing production build `071a7b2c`, 2026-08-21:

> **1.1** "the elevation works great - but why there is a line staying static pointing to the
> wrong place - it is just for coherence - everything works on south and north elevation - just
> this section line."
>
> **1.2** "East and west however dont work as expected: i am opening east elevation and it is
> showing me the wrong side? or definitely not correct scope. I move the elevation and
> projectors good in the center - but the sides are off - and the 'crop' is not present."

Three defects, one theme. Every one of them is a case of **several producers computing the same
quantity, none of them the owner** — the C06 §13.3 shape this repo keeps re-minting.

The `Depth 8.00 m` → `Depth 0.47 m` handle readings in his screenshots, and the
`resolveClipRange() elevation depth near=0.000 far=2.857` line in his console, are the two
symptoms of the *same* number being owned twice.

---

## 2 · The frame — derived once, so it stops being re-guessed

Everything below depends on knowing which world axis is north. That is **derivable**, and it was
never written down, which is why two files guessed it differently.

`PlanViewService.getViewConfig('top')` sets the plan camera to `dirVec = (0,-1,0)`,
`upVec = (0,0,-1)`. For a three.js camera, screen-up is `up` and screen-right is
`cross(up, -forward)`:

```
screen-up    = (0, 0, -1) = -Z      and screen-up in a PLAN is NORTH
screen-right = cross((0,0,-1),(0,1,0)) = (1, 0, 0) = +X   ⇒ EAST
```

> **DECISION 1 — the world frame is `-Z = NORTH`, `+X = EAST`.** It is stated in the block
> comment above `VIEW_PROJECTION_DIRECTIONS`, derived from `getViewConfig('top')` rather than
> asserted, and it is the only non-circular authority in the subsystem.

**The naming rule.** An elevation is named for the **façade it shows**, which is the façade
*nearest the viewer*. The camera (and the plan mark — `_elevationMarkPlacement` places it at
`-dir * radius`) sits at `centre - direction * distance`. Therefore:

```
viewer side = -direction          named façade = the -direction face
```

> **DECISION 2 — an elevation is named for the façade it SHOWS, not for the direction it looks
> in.** "East Elevation" is the drawing of the east façade, seen from the east.

Applying Decision 2 to both axes:

| View | Viewer stands at | Looks along | Preset |
|---|---|---|---|
| North | −Z | `(0,0,+1)` | `elevationBack` |
| South | +Z | `(0,0,−1)` | `elevationFront` |
| **East** | **+X** | **`(−1,0,0)`** | **`elevationLeft`** |
| **West** | **−X** | **`(+1,0,0)`** | **`elevationRight`** |

---

## 3 · Defect A — East and West were swapped (L-1858)

`DEFAULT_ELEVATION_VIEWS` mapped `East → elevationRight (+1,0,0)` and
`West → elevationLeft (−1,0,0)`. Both are inverted under Decision 2: direction `+X` puts the
viewer at `−X` and draws the **west** façade under a tab labelled *East Elevation*.

**The Z rows applied Decision 2; the X rows applied the opposite rule.** That inconsistency
*inside a single four-row table* is precisely why the founder saw N/S work and E/W fail.

**Where it came from.** The doc-comments on the presets themselves:

```ts
/** Left elevation — looking along -X (west face). */    // ← WRONG: shows the EAST face
/** Right elevation — looking along +X (east face). */   // ← WRONG: shows the WEST face
```

The `elevationFront` / `elevationBack` comments were correct. Someone read the X comments and
wired the table to match them. **The comment was the defect.**

**Corroboration — two independent producers were already right and this table contradicted
both:**

| Producer | East Elevation |
|---|---|
| `apps/editor/src/engine/initUI.ts` (`generateElevations`) | direction `(−1,0,0)`, camera at `+distance` on X ✓ |
| `packages/ai-host/.../buildingElevations.ts` | `{ direction: 'E', anchor: { x: maxX + offset }, facing: { x: −1, z: 0 } }` ✓ |
| `DefaultViewsManager.DEFAULT_ELEVATION_VIEWS` | direction `(+1,0,0)`, mark at `−24` on X ✗ |

Three producers, one subject, and the one that seeds the founder's `vd-sys-elev-*` views was
alone.

> **DECISION 3 — the preset VECTORS are not changed.** `elevationLeft` / `elevationRight`
> correctly name the *axis sign* (−X / +X) and other callers resolve a preset by name. The
> compass mapping belongs to the caller that names a compass direction, and there is exactly
> one: `DEFAULT_ELEVATION_VIEWS`. The fix is in that table plus the two wrong comments.

### 3.1 · Reachability — the half that would have made this a non-fix

`ensureDefaultViews()` creates each elevation **only `if (!viewDefinitionStore.has(elev.id))`**,
and `_ensureElevationMarksForPlanView()` skips any mark that already exists. Correcting the seed
table therefore fixes **only projects that do not yet exist** — not the founder's live one, whose
console names `vd-sys-elev-south`.

> **DECISION 4 — ship a migration with the seed change.**
> `_repairDefaultElevationOrientation()` runs at the end of `ensureDefaultViews()` (after the
> mark top-up, so fresh and stale marks take the same pass) and is idempotent.
>
> It refuses to overwrite user intent:
> - the **view's** `projectionDirection` is system-owned for `vd-sys-elev-*` → corrected whenever
>   it disagrees with the table;
> - the **mark's** `facingDirection` → likewise corrected;
> - the mark's **anchor** is re-seeded **only if it still sits at `−oldDir * ELEV_MARK_RADIUS_M`**.
>   The old direction is read off the mark's own stored `facingDirection`, so no legacy table is
>   hard-coded. If the founder has *moved* that mark (L-305), the anchor stays exactly where he
>   put it and only the facing is corrected — and the log line says which branch ran.

---

## 4 · Defect B — one far-clip quantity, two magic fallbacks (L-1859)

The far clip of an elevation was resolved by **two hand-copied expressions with different magic
numbers**:

| Site | Expression |
|---|---|
| `EdgeProjectorService.resolveClipRange()` | `crop.farClip.offset ?? viewRange.farOffset ?? **200**` |
| `PlanViewInteraction._resolveSectionVolumeForDrag()` | `crop.farClip.offset ?? viewRange.farOffset ?? **8**` |
| `PlanViewAnnotationRenderer` (×3) | `crop.farClip.offset ?? **8**` |

So an untouched elevation **projected** at 200 m — correctly, the whole building — but **drew its
depth handle at 8 m**. Default elevation marks are seeded 24 m from the origin
(`ELEV_MARK_RADIUS_M`), so the 8 m handle sat **16 m short of the origin** and could never touch
the model. Worse: the moment the user grabbed it, `_applyScopeDragFromPointer` **committed** that
value into `crop.farClip.offset`, collapsing the projector's far from 200 → 8 and slicing the
building down to a slab. That is the founder's `Depth 8.00 m` → `Depth 0.47 m` sequence, and his
`far=2.857`.

The two fallbacks answer genuinely **different questions** and are allowed to differ — but only
deliberately, and only by name:

- **UNCLIPPED** — "nothing is stored, so clip nothing." A depth, not a UI.
- **SCOPE HANDLE** — "nothing is stored, so where do we *draw the grab handle*?" It must land
  past the building or the user cannot reach it.

> **DECISION 5 — one expression, `resolveElevationFarDepth(viewDef, fallback)`, in
> `@pryzm/core-app-model`, with two exported and NAMED fallbacks:
> `UNCLIPPED_ELEVATION_FAR_DEPTH_M` (200) and `DEFAULT_ELEVATION_SCOPE_DEPTH_M` (40).**
> All five call sites come through it. Never inline `?? 8` or `?? 200` again.

**`DEFAULT_ELEVATION_SCOPE_DEPTH_M = 40` is a STAND-IN and is documented as one.** The honest
value is *"the distance from the mark's depth plane to the far side of the model bounding box"*,
which neither the L3 renderer nor the plan interaction can read today. 40 m clears a typical
footprint measured from the 24 m mark radius, i.e. it **overshoots** — and overshoot is the safe
direction, because too far shows the whole building while too near silently slices it. **Exit
condition: derive it from model bounds and delete the constant.**

---

## 5 · Defect C — `crop.region[0]` has two incompatible meanings (L-1860)

`ViewCropSettings.region` is read with **two different encodings**, discriminated by *the presence
of an unrelated field*:

| Case | `region[0]` means | Written by | Read by |
|---|---|---|---|
| plan view | `worldX` | crop drag | `_applyCropClip` |
| section/elevation **with** `spatial.sectionVolume` | **ABSOLUTE world-H** | `_applyScopeDragFromPointer`, `CreateElevationMarkCommand` | `PlanViewCanvas._resolveCropCanvasBounds` (volume branch) |
| section/elevation **without** `sectionVolume` | **SIGNED PERPENDICULAR OFFSET** from the mark anchor | `SetViewCropCommand` / properties panel | `_elevationCropFrame`, `_computeElevationScope` |

(*H* is world X when `|dir.z| ≥ |dir.x|`, else world Z.)

`_renderElevationCutLine` called `_computeElevationScope` **directly** — the OFFSET reading —
unconditionally. But the drag that had just written the value used the ABSOLUTE reading. Adding an
absolute coordinate to the anchor displaces the line **by the anchor's own H coordinate**.

Reproduced from the founder's own console numbers (`cropRegion=[-15.69,-5.84 → 0.15,-2.89]`):

```
anchor H            = (-15.69 + 0.15) / 2   = -7.77
offset reading      = anchor + region[0]    = -23.46 … -7.62
absolute reading    = region[0]             = -15.69 …  0.15
displacement                                = -7.77   ← exactly the anchor
width                                       = IDENTICAL
```

Same width, wrong place — which is why it read as *"a line staying static pointing to the wrong
place"* beside a crop rectangle that was correct, rather than as corrupt geometry. It also
explains why it hid: the two readings **coincide exactly when the anchor's H is 0**, and two of
the four default marks are seeded at H = 0.

> **DECISION 6 — `_scopeWorld` is THE producer of an elevation's world scope.** It prefers
> `spatial.sectionVolume` (the frame the projector and the crop rectangle both use) and falls back
> to `_computeElevationScope` only when no volume exists — the only case in which the OFFSET
> encoding is the correct reading. `_renderElevationCutLine` now routes through it.

> **DECISION 7 — the dual encoding is NOT unified in this change, and is recorded as a named
> hazard** on `ViewCropSettings.region` rather than left implicit. Unifying it means migrating
> stored `crop.region` values in existing snapshots; that is a persistence change and it needs its
> own lane. **Do not add a third encoding.**

---

## 6 · What this change does NOT establish

Stated plainly, because a fix reported as broader than it is has already cost this founder a
demo:

1. **Nothing here was verified in a browser.** The E/W swap, the migration, and the cut-line fix
   are proven by unit assertions and by three-way agreement between independent producers — not
   by opening East Elevation on a real model. **That verification is owed.**
2. **The migration's user-moved-mark branch is untested against a real moved mark.** The logic is
   guarded and logged, but no test drives it.
3. **`DEFAULT_ELEVATION_SCOPE_DEPTH_M = 40` is a guess with a stated basis**, not a derivation.
   A mark placed far from the model, or a model larger than ~40 m deep from its mark, will still
   have a handle in the wrong place — better than before (which could never reach), still wrong.
4. **"The crop is not present" is only half-addressed.** Default elevation views ship with **no
   `crop` at all** (`DefaultViewsManager` writes `spatial.projectionDirection` and nothing else),
   so `_applyCropClip` returns false and no crop rectangle is drawn — *for all four*, including
   South. Fix B makes the depth handle reachable so a crop can be *created*; it does not seed one.
   Seeding a model-derived crop is queued (L-1861).
5. **The projection cost of a crop drag is untouched.** Every drag frame still re-projects 359
   groups in 90 chunks and the log shows 20+ consecutive
   `§PERF-PROJECTION-CANCEL-SUPERSEDED — abandoning after 4/359 group(s)`. **Deliberately
   deferred** to keep this change to the three correctness defects — see L-1861.
6. **There are still FOUR copies of the viewMode direction resolver** —
   `ViewsRailPanel._resolveElevationDirection`, `PlanViewInteraction._resolveElevationObcMode`,
   `LeftNavRail`'s table, and `activateViewForEditing.resolveDirectionalMode`. **Measured: all
   four agree with each other and with `PlanViewService.getViewConfig`, so none of them is the
   E/W defect** — Lead 2's `absZ >= absX` hypothesis is **REFUTED**. They remain a latent hazard
   (four copies of one rule) but they are not today's bug and were not touched.
7. **`ai-host/buildingElevations.ts` uses the OPPOSITE Z convention** (`"North = the +Z façade"`,
   `facing (0,0,-1)`) from `DefaultViewsManager` and `initUI`, which both put north at −Z. It
   agrees with them on E/W, which is why it corroborates §3. Its N/S rows look wrong under
   Decision 1 — **not investigated, not changed**, logged as L-1861.

---

## 7 · Verification actually run (foreground)

| Command | Result |
|---|---|
| `vitest run src/views/__tests__/elevationScopeFrame.test.ts` (`@pryzm/core-app-model`) | **13/13 PASS** |
| `vitest run src/views` (`@pryzm/core-app-model`) | **27 files / 194 PASS** |
| `vitest run __tests__/ElevMark*.test.ts __tests__/ElevationVerticalCrop.test.ts` (`@pryzm/editor`) | **3 files / 27 PASS** |
| `vitest run __tests__/levelPlanViewBinder … viewBusLifecycle … generateDocumentationViews … setOutIntentReachesTheDrawing` | **4 files / 31 PASS + 1 expected-fail** |
| `NODE_OPTIONS=--max-old-space-size=6144 npx tsc --noEmit --skipLibCheck` (root) | **RC=0** |

The new test file pins each defect to a **number** rather than a narrative — including the −7.77 m
displacement of §5, computed from the founder's own log — because this subject already had three
rival producers quietly disagreeing, and prose is what let them.
