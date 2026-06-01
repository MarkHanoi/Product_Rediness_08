# PRYZM — Selection / Picking Fix: Implementation Plan
**Status:** DONE — All phases 0–5 complete · All plan steps verified · Build clean · Zero TypeScript errors  
**Audit source:** `selection-picking-audit-2026.md` (10 bugs, 19 findings)  
**Date:** 2026-05-15  
**Completed:** 2026-05-15  
**Gap-fix pass:** 2026-05-15 — three remaining per-step items closed:
- BUG-08 threshold corrected to 0.1 (matching SelectionManager PERF-FIX-#5)
- BUG-05 JSDoc added to GpuPickRenderer.width/height (CSS pixels contract)
- Phase 3 Variant A step 1: 'instancedelement' added to SEMANTIC_TYPES

---

## How to use this document

This plan is written for Replit AI to execute. Each phase has a strict rule:

> **ANALYSE → CONFIRM → IMPLEMENT. Never implement without the analyse step completing first.**

Each phase contains:
- What to read before touching any code
- What to verify / answer as a precondition
- Only then: what to change and where

Phases are ordered by impact. Do not reorder them. Do not combine phases.

---

## Phase 0 — Pre-flight (no code changes)

**Purpose:** Confirm the audit line numbers still match the live code before any work begins. Replit AI must do this at the start of every phase, not just Phase 0.

### 0.1 — Verify audit line numbers are current

For each bug listed below, open the referenced file and confirm the cited lines match the audit description. If a line number has shifted (due to other recent changes), note the new line number before proceeding.

| Bug | File | Lines to verify |
|-----|------|----------------|
| BUG-01 | `SelectionManager.ts` | 220–236 (registry build loop) |
| BUG-02 | `gpu-pick.ts` | 663–693 (extractGeometry + clone creation) |
| BUG-03 | `gpu-pick.ts` | 648–657 (stable-entry refresh loop) |
| BUG-04 | `InstancedElementRenderer.ts` | 153–158 (getInstanceElementId) + SelectionManager SEMANTIC_TYPES |
| BUG-05 | `SelectionManager.ts` | 248–249 (width/height getters) |
| BUG-06 | `gpu-pick.ts` | 766 (Math.min guard) |
| BUG-07 | `SelectionManager.ts` | 758–770 (world-click dispatch) |
| BUG-08 | `bvh-pick.ts` | constructor (~lines 80–100) |
| BUG-09 | `bvh-pick.ts` | ~line 160 (intersectObject call) |
| BUG-10 | `SelectionManager.ts` | 711–722 and 1899–1910 (duplicate cache blocks) |

### 0.2 — Answer three architectural questions before Phase 2

The audit identified three questions that must be answered by reading the code — not assumed. Write explicit answers before starting Phase 2.

**Q1 — What is the `_buildElementRegistry` root contract?**

Read the code around lines 220–236 in `SelectionManager.ts` and answer:
- Can a wall Group have children (`wall-fragment`) that also carry the same `userData.id`?
- After a geometry rebuild, is the parent chain of a `wall-fragment` always valid (i.e. `fragment.parent === wallGroup`)?
- Is there a `findSelectableRoot` guard that already tries to recover from a null parent, or does it silently return null?

Do not fix anything. Write the answers as comments in your response.

**Q2 — What is the `InstancedElementRenderer` selection model?**

Read `InstancedElementRenderer.ts` lines 38–52 and 153–158, and then read how curtain wall panels are registered in the GPU pick path (lines 632–641 of `gpu-pick.ts`). Answer:
- Does each instance represent a distinct BIM element (each has its own element ID), or does the whole group share one ID?
- Is `getInstanceElementId(slotIndex)` currently called anywhere outside `InstancedElementRenderer.ts` itself?

Do not fix anything. The answer determines which fix variant is used in Phase 3.

**Q3 — What is the pick render target size and why?**

Find the constant `256 × 256` (or equivalent) in `gpu-pick.ts` lines 167–168. Answer:
- Is this value a hardcoded constant, a config option, or computed from viewport size?
- Is there any comment explaining why this size was chosen?
- What is the current viewport size in a typical PRYZM session (approximate CSS width × height)?

Do not fix anything. This determines whether Phase 4 is needed.

---

## Phase 1 — P1 fixes (the two bugs that break selection for edited elements)

**Priority:** Fix these first. They cause the most-reported symptom: "I edited a wall and now I can't select it, or I select the wrong one."

**Bugs in this phase:** BUG-01, BUG-02

---

### Phase 1, Step 1 — Analyse BUG-01 before touching it

**File:** `SelectionManager.ts`  
**Lines:** 220–236 (`_buildElementRegistry`) + 711–722 and 1899–1910 (cache build calls)

**Read and confirm:**

1. Open `_buildElementRegistry`. Read the full loop at lines 220–236.
2. Find every caller of `_buildElementRegistry` — list each call site.
3. Find `isSemanticType` — read its implementation. What types does it accept?
4. For a wall Group (`userData.id = 'wall-abc'`, `userData.elementType = 'wall'`), how many objects in the traversal will have `userData.id = 'wall-abc'`? (The root Group AND each `wall-fragment` child all share the same ID per the audit.)
5. Confirm: after the loop, does `idToObj.get('wall-abc')` hold the root Group or a fragment? (It holds whichever was traversed last — confirm this by reading the traversal order.)
6. Read `findSelectableRoot` lines 593–658. What does it return when `obj.parent === null`?

**Only after confirming all 6 points above**, implement:

**Change:** In `_buildElementRegistry`, change the loop to store only the *highest-ancestor* object that carries a given `userData.id`. The rule: if both a parent and a child carry the same ID, store the parent, not the child.

```
BEFORE (lines 220–236 approx):
  for (const obj of cache) {
      const id = obj.userData?.id as string | undefined;
      if (id) idToObj.set(id, obj);   // last-write-wins
  }

AFTER:
  for (const obj of cache) {
      const id = obj.userData?.id as string | undefined;
      if (!id) continue;
      const existing = idToObj.get(id);
      // Only replace if this object is HIGHER in the hierarchy
      // (i.e. existing is a descendant of obj, or no entry yet)
      if (!existing || isAncestorOf(obj, existing)) {
          idToObj.set(id, obj);
      }
  }
```

You will need to implement `isAncestorOf(candidate, existing): boolean` as a private helper that walks `existing.parent` chain and returns true if it reaches `candidate`. Keep it O(depth) — depth is at most 3–4 for BIM elements.

**Gate check after this step:** No TypeScript errors. Run the app and verify a wall can still be selected (basic smoke test). Do not proceed to Step 2 until Step 1 is confirmed working.

---

### Phase 1, Step 2 — Analyse BUG-02 before touching it

**File:** `gpu-pick.ts`  
**Lines:** 663–693 (the simple-mesh path of `syncPickScene`)

**Read and confirm:**

1. Read `extractGeometry(obj)`. What does it return for a Group with 3 child Meshes?
2. Read the clone creation block lines 663–693. How many `THREE.Mesh` clones are created for a multi-mesh element?
3. Read the InstancedMesh multi-clone path (lines 632–641). This is the existing pattern for multiple clones — understand its structure before mirroring it.
4. Confirm: is `BufferGeometryUtils` already imported in `gpu-pick.ts`, or would it need to be added?
5. For a wall with 3 fragment meshes at different offsets within the group, would Fix Option A (merge into one geometry) or Fix Option B (one clone per child mesh) be simpler without changing existing InstancedMesh logic?

**Only after confirming all 5 points above**, implement **Fix Option B** (one pick clone per child mesh, mirroring the existing IM multi-clone pattern):

**Change:** In the simple-mesh path (currently creates one clone), iterate over all visible child Meshes and create one additional clone per mesh, each using the child's own `matrixWorld`.

The pattern to follow is the InstancedMesh multi-clone block (lines 632–641). Mirror its structure exactly.

**Gate check after this step:** No TypeScript errors. Test with an L-shaped wall or any wall with T-junction. Both the main body and the junction arm should now highlight and select from GPU pick.

---

## Phase 2 — P2 fixes (bugs that affect specific element families or leave ghost pick regions)

**Do not start Phase 2 until Phase 1 is complete and gate checks pass.**

**Bugs in this phase:** BUG-03, BUG-06, BUG-07, BUG-05

---

### Phase 2, Step 1 — Fix BUG-03: CW panel count reconciliation

**File:** `gpu-pick.ts`  
**Lines:** 648–657 (stable-entry refresh loop)

**Analyse first:**

1. Read the stable-entry refresh loop lines 648–657 in full.
2. Find where `entry.additionalClones` is created (the creation path). Note the initial length.
3. Read `setStable` computation lines 574–575. Confirm: changing a panel count (adding/removing a panel from an existing CW element) does NOT change the element ID → `setStable` remains true → creation path is never re-run.
4. Confirm: `instancedMeshes` is retrieved fresh each call (not cached). What is `instancedMeshes.length - 1` for a 3-panel CW vs a 5-panel CW after adding panels?

**Implement:**

After the refresh loop, add a count-reconciliation block:

```
// After the existing refresh loop:
const expectedAdditional = instancedMeshes.length - 1;
if (entry.additionalClones.length !== expectedAdditional) {
    // Rebuild all clones for this entry
    // 1. Remove all existing additionalClones from pickScene
    // 2. Clear entry.additionalClones array
    // 3. Run the full creation path for additional clones
    //    (mirror the creation block, do not call setStable=false globally)
}
```

The rebuild should only touch the one entry whose count changed, not the full scene.

---

### Phase 2, Step 2 — Fix BUG-06: Orphan instance matrices after panel removal

**File:** `gpu-pick.ts`  
**Lines:** 756–779 (`refreshInstancedPickClone`), specifically line 766

**Analyse first:**

1. Read `refreshInstancedPickClone` in full (lines 756–779).
2. Confirm: when `src.count < clone.count`, the instances at indices `[src.count .. clone.count-1]` are not zeroed — they keep stale world-space matrices.
3. Check: does Three.js render all `clone.count` instances regardless of whether specific instance matrices are "active"? (Yes — Three.js renders all instances up to `count`.)
4. What is a safe "invisible" matrix to assign orphan instances? (A zero-scale matrix: `scale(0,0,0)`, or a matrix that translates far off-screen. A zero-scale matrix is preferred as it is unambiguous and non-destructive.)

**Implement:**

After the existing `Math.min` copy loop, add:

```typescript
if (src.count < clone.count) {
    const ZERO_SCALE = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = src.count; i < clone.count; i++) {
        clone.setMatrixAt(i, ZERO_SCALE);
    }
    clone.instanceMatrix.needsUpdate = true;
}
```

Note: `THREE.Matrix4` must be imported via the project's abstract renderer interface, not directly — check how other files in `packages/picking/` import Three.js types before adding this import.

---

### Phase 2, Step 3 — Fix BUG-07: Wrong world-point on GPU success

**File:** `SelectionManager.ts`  
**Lines:** 758–770 (world-click dispatch block)

**Analyse first:**

1. Read lines 758–770 in full. Where is `worldPoint` computed?
2. Read `readDepthResult` lines 519–553. What does it return? Is it always populated on a GPU hit, or can it be zero/null?
3. Find `gpuResult.hitPoint` — confirm it is the 3D world-space hit point from depth readback.
4. Confirm: is `gpuResult.hitPoint` already typed as `THREE.Vector3 | null` or similar? Can it be zero-vector when depth readback is unavailable?

**Implement:**

Replace the level-plane intersection with the GPU hit point when available:

```typescript
// BEFORE: always uses level-plane intersection
const worldPoint = computeLevelPlaneIntersection(ray, activeLevelElevation);

// AFTER: prefer GPU depth hit point; fall back to level-plane
const worldPoint = (gpuResult.hitPoint && gpuResult.hitPoint.lengthSq() > 0)
    ? gpuResult.hitPoint
    : computeLevelPlaneIntersection(ray, activeLevelElevation);
```

The exact variable names will differ — use the names found in the actual code.

---

### Phase 2, Step 4 — Fix BUG-05: HiDPI interface contract

**File:** `SelectionManager.ts`  
**Lines:** 248–249

**This is a trivial defensive fix.** No analysis required beyond verifying the lines.

Change `renderer.domElement.width/height` (physical pixels) to `rect.width/rect.height` (CSS pixels) to match `viewportWidth/Height`. Add a JSDoc comment on `GpuPickRenderer.width/height` in `types.ts` stating: `// CSS pixels — matches viewportWidth/viewportHeight`.

---

## Phase 3 — P2 fix: InstancedElementRenderer selectability (BUG-04)

**Do not start Phase 3 until Phase 2 is complete.**

This is the most architecturally significant fix. It requires the answer to Q2 from Phase 0.

---

### Phase 3, Step 1 — Architecture decision gate

**Before writing any code**, answer Q2 (from Phase 0) and choose a fix variant:

**If each instance is a distinct BIM element** (e.g. column-1, column-2 each have own IDs via `getInstanceElementId`):

→ Use **Fix Variant A** (full instance-level selectability):
1. Add `'instancedelement'` to `SEMANTIC_TYPES` in `SelectionManager`.
2. In `_buildElementRegistry`, add a separate pass for `InstancedMesh` objects with `userData.isInstancedGroup === true`. For each, register each slot: `for (let i = 0; i < mesh.count; i++) { idToObj.set(mesh.userData.getInstanceElementId(i), mesh) }`.
3. In the GPU pick hit path, when `hit.object` is an `InstancedMesh`, resolve `hit.instanceId` via `getInstanceElementId(hit.instanceId)` to get the element ID.
4. In `syncPickScene`, add these groups to the instanced-mesh collection path (already handles IM correctly for CW panels).

**If the whole group is one BIM element** (all instances share a group-level ID):

→ Use **Fix Variant B** (group-level selectability):
1. In `InstancedElementRenderer.register()`, set `mesh.userData.id = groupKey` on the IM.
2. Add `'instancedelement'` to `SEMANTIC_TYPES`.
3. No changes needed to GPU pick (IM path already handles groups with IDs).

**Write the chosen variant and its justification as a comment in your response before making any code change.**

---

### Phase 3, Step 2 — Implement and test

After choosing the variant, implement it. Then verify:
- Hover over a structural column → highlight appears.
- Click a structural column → it is selected (`SelectionStore` updated).
- If Variant A: clicking column-1 selects column-1, not column-2.

---

## Phase 4 — P3 fixes (BVH fallback path cleanup)

**Do not start Phase 4 until Phase 3 is complete.**

**Bugs in this phase:** BUG-08, BUG-09, BUG-10

These are small, independent, and safe to batch.

---

### Phase 4, Step 1 — BUG-08: BVH raycaster threshold

**File:** `bvh-pick.ts`  
**Location:** Constructor (~lines 80–100)

Analyse: Read the constructor. Confirm no `params.Line.threshold` or `params.Points.threshold` is set. Read `SelectionManager`'s init (lines 374–376) to find the correct threshold values used there.

Implement: Add in the `BvhPickStrategy` constructor:
```typescript
this.raycaster.params.Line!.threshold = 0.1;    // match SelectionManager's value
this.raycaster.params.Points!.threshold = 0.1;  // match SelectionManager's value
```

---

### Phase 4, Step 2 — BUG-09: BVH recursive flag

**File:** `bvh-pick.ts`  
**Location:** `pickInternal` ~line 160

Analyse: Read `firstMesh(obj)` and the `intersectObject` call. Confirm `recursive: false` is used and that this misses sibling meshes in compound elements.

Implement: Replace `raycaster.intersectObject(mesh, false)` with `raycaster.intersectObject(obj, true)` where `obj` is the original candidate root (not just `firstMesh`). Filter results with `findSelectableRoot`. This aligns BVH fallback with `SelectionManager`'s own approach.

---

### Phase 4, Step 3 — BUG-10: Extract duplicate cache build

**File:** `SelectionManager.ts`  
**Locations:** Lines 711–722 (click path) and 1899–1910 (hover path)

Analyse: Read both blocks side by side. Confirm they are identical. Confirm there is no intentional difference.

Implement: Extract to a private `_ensureSelectableCache(): THREE.Object3D[]` method that builds and returns the candidate list. Call it from both the click path and the hover path. This is a pure refactor — no logic change.

---

## Phase 5 — Regression verification (no code changes)

After all phases are complete, Replit AI must verify the following before declaring the work done:

### 5.1 — Architecture gate checks

Run these and confirm all pass:
```
pnpm run ga-gates
```
Expected: all gates exit 0. Specifically:
- `check-cast-count` → 0 (no new `(window as any)` casts)
- `check-raf-count` → 1 owner
- `check-three-imports` → 0 violations (no direct THREE imports outside `packages/renderer-three/`)
- `check-no-commandmanager` → 0
- `pnpm tsc --noEmit` → 0 errors

### 5.2 — Manual selection smoke tests

For each scenario from the original audit, verify the fix:

| Scenario | Test action | Expected result after fix |
|----------|-------------|--------------------------|
| A — Far camera | Move camera 50m away, click a wall face | Correct wall selected (GPU pick, not BVH fallback) |
| B — Specific elements | Click a curtain wall panel, then add/remove a panel, click again | Correct panel selected; no ghost pick regions |
| C — Empty space | Click clearly outside all geometry | Nothing selected |
| D — Hover vs click | Hover over an element (check highlight), then click | Highlighted element = selected element (same path) |
| Instanced columns | Click a structural column | Column selected; other columns not highlighted |
| Multi-floor | Camera at floor 3, click element on floor 3 | `worldPoint.y` matches floor 3 elevation, not active level |

### 5.3 — No regressions to previously working selection

Test that standard wall, slab, door, and window selection still works correctly after the changes.

---

## Do-not-touch list

These items were identified in the audit but are **out of scope for this sprint** — do not change them:

| Finding | Reason deferred |
|---------|----------------|
| F-08 — Pick RT 256×256 size | Requires profiling decision on read-back cost vs accuracy. Separate spike needed. |
| F-15/F-16 — FrustumCullingService element count | Separate concern; no selection correctness impact. |
| F-17 — PlanSnapEngine GC allocations | No selection bug. |
| F-19 — BaseTool Raycaster allocation | No selection bug. |
| F-18 — PlanViewInteraction | Out of mandatory audit scope. Separate audit needed. |

---

## Summary: What gets fixed in each phase

| Phase | Bugs fixed | User-visible change |
|-------|-----------|---------------------|
| 1 | BUG-01, BUG-02 | Edited walls/slabs/openings selectable again; L-shaped elements select correctly anywhere on their body |
| 2 | BUG-03, BUG-06, BUG-07, BUG-05 | Curtain wall panels stable after add/remove; world coordinates correct for multi-floor tools |
| 3 | BUG-04 | Structural columns/beams become selectable for the first time |
| 4 | BUG-08, BUG-09, BUG-10 | Fallback path works for lines/points and compound elements; code cleaner |
| 5 | — | Confirmed no regressions |