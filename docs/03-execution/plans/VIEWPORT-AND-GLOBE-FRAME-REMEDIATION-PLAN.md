# Viewport & Globe-Frame Remediation Plan

**Opened 2026-08-20.** Founder-reported, production (`app.pryzm.so`), one session, two reports.
Orchestrator: contract review + sequencing. Lanes: **SWAP1** (L-1410–L-1419), **GLOBE2** (L-1420–L-1429).

> **Why this document exists.** Both reports landed as "the building does not show up properly".
> They are **not one defect** and they are **not new** — each maps onto a clause that a previous
> session already wrote down as OPEN. This plan records the mapping so the work amends the clauses
> that made the false claim, rather than minting a fresh derivative doc (governance: edit the
> canonical `C0N-*.md` in place; never a new `*-AUDIT.md`).

---

## 1 — The two reports, kept separate

| # | Founder's words | Surface | Contract clause it lands on | Clause status BEFORE this session |
|---|---|---|---|---|
| A | *"why the building did not load in PRYZM 3D Site view"* | BIM viewport | **C04 §1.4**, Amendment ADR-0267 §AUTO-WEBGL-HEAVY | Stated as **"Known-behavior, not a violation"** |
| B | *"not rendering realistic … floating on the middle of the sky"* | Cesium 3D Globe, Real | **C12 §1.5** (L-604) + **§9** + **§11.4** (L-1208) | **OPEN / DRAFT / open founder decision** |

⚠ **They are being investigated as two defects.** The founder wrote *"probably related"* and he may
be right — a globe-scale frame wrecks lighting and normals, which reads as "not realistic". But this
session has already had **two proposed shared roots falsified** (rake-joints ↔ windows-not-following;
grey-canvas ↔ WebGPU-ghosting). **Merge only if a measurement forces it.**

---

## 2 — Report A: the renderer swap detaches the scene it was protecting

### 2.1 What the log shows

```
[ProjectLoader] Load complete: 294 loaded, 0 failed, 0 errors
[SceneQualityTier] 3191 meshes → tier=performance
[autoWebGLHeavyScene] §AUTO-WEBGL-HEAVY — scene is device-loss-risk
    (233 elems / 3191 meshes / 7 levels; reason=tier:post-load)
[initScene] §RETIRE-RENDERER-DETACHES-LISTENERS old renderer retired —
    3181 render object(s) DETACHED from their materials/geometries (L-948).
[initScene] §RENDERER-LIVE-SWAP live swap complete — backend now: webgl-only
```

The project finishes loading, builds 3,191 meshes, and the heavy-scene guard immediately swaps the
renderer — detaching 3,181 objects. **Those 3,181 are the building.**

### 2.2 ⭐ The contract says this scene is NOT heavy

C04 §1.4's ADR-0267 amendment states the trigger normatively:

> per the shared `isHeavyModel` heuristic (**≥ 15 levels AND ≥ 1000 elements, OR ≥ 4000 elements**
> — the exact `LevelScoped3DCullingService` predicate, now exported)

Founder's scene is **233 elements / 7 levels**. ≥15 levels AND ≥1000 elements → **NO**.
≥4000 elements → **NO**. **Neither arm is satisfied, and the guard fired anyway.**

One line earlier: `[SceneQualityTier] 3191 meshes → tier=performance`, and the guard's own reason
string is `tier:post-load`. The contracted predicate counts **elements and levels**; the tier counts
**meshes**. ⭐ **Two rival authorities answering "is this scene heavy", keyed on different
quantities — and the one that fired is not the one C04 §1.4 names.** That is a **C84 EI-1 (one
authority)** breach.

The amendment further scopes firing to *"the batch GPU-compile-start hook … and the per-add tier
pass"*, i.e. **BEFORE the heavy PSO-compile**. `tier:post-load` fires **after** 3,191 meshes exist —
apparently a **third** firing site the amendment never contemplated. Swapping renderers against a
freshly-populated scene is the point of maximum attached state: the worst possible moment.

### 2.3 Open questions SWAP1 must MEASURE, not read

1. Print both predicates' verdicts for `233 / 3191 / 7`. Does the `tier:post-load` route call the
   exported `isHeavyModel` at all, or does it carry its own threshold?
2. Are the 3,181 detached objects **re-attached**, and if so does it happen **before the first
   frame**? The log brackets the swap with `UnifiedFrameLoop Stopped … Started`.
3. `§RETIRE-RENDERER-DETACHES-LISTENERS` has reported **0, 3181, 6936 and 6937** across today's logs.
   A prior lane flagged the **`0`** and never investigated. Is a `0` there *"nothing was attached"*
   or *"the sweep looked in the wrong place"*? This repo has been wrong about a zero-from-a-counter
   repeatedly (a version count, an audit detector, an in-flight guard, a rescue that rescued nothing).
4. A **vocabulary disagreement one line apart**: `[renderer-three] backend: webgl1` vs
   `[RenderPipelineManager] §PERF-WEBGL2-NO-TSL WebGL2 backend detected`. Two components disagree
   about which backend is live and one of them selects a render path on that answer. Lane BG1
   established `isNativeWebGpuBackend()` / `isLightweightWebGlBackend()` as a partition **by
   construction** — use that authority; do not add a third string comparison.

### 2.4 Release-side rules that bind the fix

C04 **§3.1.2 §GPU-RESOURCE-LIFETIME** (ADR-0297, binding) and **§3.1.2a** (L-1290): *detach on your
own tick, release at the frame boundary*; `RenderPipelineManager.render()` is the **sole drain
point**; **rule 7 — the release funnel MUST have no bypass.** Whatever the retire path does with
3,181 objects is governed by these; check it does not dispose in place.

⚠ **Two defects would not be surprising**: *fires when it should not* AND *destroys the scene when it
does*. The re-attach measurement is required **either way** — do not let a threshold fix hide it.

### 2.5 Anti-pattern, stated up front

⛔ **Do not simply raise a threshold.** If the tier route is an unauthorised second authority, the
fix is to make the swap read the ONE contracted predicate. C04 **§INST.2** records the lesson in
terms: *"512 is ARBITRARY, and raising it is NOT the fix."*

---

## 3 — Report B: the globe Real model is in the wrong frame, and unglazed

### 3.1 What the log shows

```
🚀 Starting GLB Export (Hierarchy preserved)...
🧹 §GLOBE-REAL-GRID-SUPPRESS — skipped 28 datum/grid/axis overlay object(s)
📊 Found 312 root elements to export.
📐 Export payload: 85,369 triangles (budget 1,500,000).
📦 Bounding box minY: 2553068.999066395
🏗 Model anchored to ground-floor plane (Y = 0); applied drop 2553068.999 m
```

`minY` is **2,553,069 m — 2,553 km**. `minY` is a **minimum**, so this does not say "one stray object
is far away"; it says **every exported object's lowest point is 2,553 km up**. A building framed at
`range 53 m` that renders as a continent-sized slab against the horizon is what a 2.5 × 10⁶ m
coordinate does.

### 3.2 ⭐ C12 §1.5 already names the mechanism — and forbids concluding it from magnitude

**C12 §1.5 — KNOWN VIOLATION (L-604, OPEN, severity P1, owner UNASSIGNED).**
`plugins/geospatial/src/CesiumThreeBridge.ts` `setAnchor()` (`:63–101`) re-parents BIM meshes into a
`GIS_BIM_ROOT` group carrying the full ECEF `eastNorthUpToFixedFrame(anchor)` matrix, so *"any
consumer that reads **world** coordinates from the shared scene graph inherits the ECEF frame."*
**The GLB exporter's bounding box is exactly such a consumer**, and `CesiumThreeBridge ACTIVATED`
appears immediately before the export in the founder's log.

⛔ **§1.5 explicitly blocks the inference:**
> ❌ NOT verified: that `setAnchor()` actually ran … `ACTIVATED` proves only that `activate()` ran.
> **The magnitude is globe-scale; the derivation is not established.** Naming `setAnchor()` as *the*
> producer on magnitude alone would be exactly the inference that made L-481 stall for weeks.

⭐ The arithmetic supports that caution. Barcelona ECEF ≈ `x 4.79e6 · y 1.8e5 · z 4.20e6`.
**None of those is 2,553,069.** Globe-scale, yes; a clean ECEF component, **no**. **The producer must
be traced, not assumed.**

§1.5 also records that L-604 **already shipped** an outlier probe printing **world** position and
**ancestry** — written because the previous probe read `obj.position` (LOCAL) and *"therefore could
not see a parent-borne transform at all — a probe that passed while measuring nothing."*
**Use that probe.** Aggregate-vs-per-element is the whole question; one summary number is what this
repo has repeatedly been wrong about.

### 3.3 The suppression list is an architecture defect regardless of tonight's root cause

`§GLOBE-REAL-GRID-SUPPRESS` skips **28** objects, almost certainly by a hand-maintained list of
names/types. ⭐ **An enumerated list that must be REMEMBERED rather than DERIVED is the single most
repeated defect in this repo this week** (C04 §3.1.2a was added for exactly this shape: *"an
enumeration cannot cover a GENERIC verb"*). If a sky dome, horizon plane, context-ground proxy, light
target or terrain helper is **not** on the list, it enters the bbox and sets `minY`. The question to
ask is: **is the suppression derived from a property the object carries, or from a list someone has
to update?**

### 3.4 "Not realistic" is a parked founder decision — now decided

**C12 §11.4, KNOWN ASYMMETRY (open, founder decision):**
> 3D **Site** Real exports with `{ formaWhite: true }` (windows → translucent glass); 3D **Globe**
> Real exports with **no option** (windows → the raw BIM material, which may be an opaque solid
> colour). Both are deliberate in isolation … but no call site references the other. See L-1208.

The founder's screenshot is the **globe**, showing opaque window rectangles and no glazing. ⭐ **He
has asked for it to be fixed, so the parked decision is MADE: globe Real renders glazing as glass.**

Constraints that ride with it, from the same clause:
- **one** white + **one** glass material per export **tree**, not per element (ADR-0093, L-1207);
- **MUST (test the bytes)** — assert by running the real `exportFragmentsToGLB` and **decoding the
  emitted glTF**, never a stubbed exporter (L-1208).

⚠ **The 122 unsupported materials are a known FALSE lead.** §11.4 (L-1206): *"MeshPhysicalMaterial
extends MeshStandardMaterial and can never trip that warning."* Every offender the log names is an
edge/outline object (`SlabEdges`, `WallEdges`, `floor-edge-overlay`) — `LineBasicMaterial`, not the
surfaces the founder is looking at. **Separate question worth asking:** should line/edge overlays be
in the Real GLB at all? If not, they belong in §3.3's suppression set.

### 3.5 Where the fix belongs, and what is explicitly OUT of scope tonight

C12 §1.5: *"The real fix belongs here, in C12, not in the plan pane"*, deferring to **§9 — the
SiteFrame authority (STRUCTURAL-SEAM-2, status DRAFT)**, normative item 3: *"The `CesiumThreeBridge`
MUST be de-duplicated to one copy that re-parents into an **LTP-ENU-relative group** (never ECEF in
the shared scene graph)."*

⚠ **§9 is a large structural seam** — ~13 open-coded θ sites, **two** competing origin authorities,
**four** ground paths, and a **duplicated** bridge (`plugins/geospatial/` vs `packages/renderer-three/`,
the latter with no importer found). **OUT OF SCOPE tonight.** In scope: prove the producer; stop the
export tree inheriting a globe-scale frame; close the glazing asymmetry. **What is not done gets
written into §1.5/§9 as the remaining gap — a stated NOT-YET beats a claimed DONE**, which is why
those clauses exist at all.

---

## 4 — Sequencing

| Step | Owner | Gate |
|---|---|---|
| 1 | SWAP1 | Two predicate verdicts for `233/3191/7`; re-attach measurement |
| 2 | GLOBE2 | Per-element bbox + **ancestry** dump via the existing L-604 probe |
| 3 | both | Fix at ONE authority; derived, never enumerated |
| 4 | both | Test at the layer the user experiences — live objects with bindings / decoded glTF bytes. ⛔ A stubbed renderer or exporter proves nothing (*committed ≠ reachable*) |
| 5 | both | Amend **C04 §1.4** / **C12 §1.5, §9, §11.4** **in place**; L-rows in the allocated blocks |
| 6 | orchestrator | Root `tsc --skipLibCheck --noEmit`, `COMPILER_RC` from the compiler |
| 7 | orchestrator | Deploy per `DEPLOY-CONTRACT-MANUAL-FLY.md` §4 → §5 bundle proof **with the SHA as an argument** |

⚠ **Both lanes run in one tree.** SWAP1 owns `initScene` / `createRenderer` / `renderer-three`
backend selection; GLOBE2 owns the Cesium globe + Real-GLB export path. `git commit --only`, scoped
paths, `git diff <path>` read before each commit. ⛔ Never `git add -A`; ⛔ never `git stash` (the
stack is GLOBAL across worktrees and already holds 25 entries).

---

## 5 — What this plan does NOT establish

- ❌ That reports A and B share a root. Investigated separately, deliberately.
- ❌ That `setAnchor()` produced 2,553,069 m. Globe-scale ≠ derived; §1.5 blocks the shortcut.
- ❌ That the `tier:post-load` route is a genuine third firing site — read from the log's `reason`
  string and the amendment's text, **not yet confirmed against the code**.
- ❌ Any claim about the 36 previously-committed, undeployed commits, which remain unshipped.
