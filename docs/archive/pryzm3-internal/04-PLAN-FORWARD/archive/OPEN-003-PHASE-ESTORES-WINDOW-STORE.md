# OPEN-003 — Phase E.stores: Window Store Elimination

> **Status**: 🔴 ACTIVE — not yet started
> **Anchor**: `54-COMPLETE-LEGACY-ELIMINATION-PLAN.md §Phase E.stores`, C14 LP-01
> **Gate**: `tools/ga-gate/check-window-store-in-packages.ts` (OI-047, ratchet baseline = 235)
> **Effort**: 6 sprints (~20 working days)
> **Outcome**: All stores accessed via `ctx.stores.*` constructor injection. `window.xStore` pattern eliminated from all 78 packages, 47 plugins, and 13 apps. The 5 init files no longer publish to `window.*`.

---

## §0 — Why This Matters

The window-store pattern is the most architecturally damaging legacy pattern in the codebase. It has three consequences:

1. **Untestable code** — Any file reading `window.wallStore` is coupled to the DOM environment. Unit tests require a full browser or JSDOM with a window global — or just don't run. The `packages/legacy-shim/` has `two-stores.bad.ts` as a test artifact showing the problem.
2. **Server rendering impossible** — `window.*` doesn't exist in Node.js. The headless package and any SSR scenario is broken until stores are injected.
3. **Invisible data flow** — 465 store reads scattered across packages make it impossible to trace which files depend on which stores. The architecture claims stores are in `composeRuntime()`. In practice they are in `window.*`.

---

## §1 — Current State (2026-05-16 verified)

| Pattern | Count | Gate |
|---|---:|---|
| `window.xStore` writes in init files (`apps/editor/src/engine/`) | **53** | No gate yet (add in Sprint E.stores.1) |
| `window.xStore` reads in `apps/editor/src/` | **230** | No gate yet |
| `window.xStore` reads in `packages/` | **235** | OI-047 gate (ratchet 235) |
| `(window as any)` — primarily window-store aliases | **107** | Cast-count gate (ratchet 0, blocking new additions) |
| `StoreEventBus` references (batch coordination) | **151** | No gate yet |

**The 5 init files that publish stores to window:**
1. `apps/editor/src/engine/init/initBuilders.ts`
2. `apps/editor/src/engine/init/initTools.ts`
3. `apps/editor/src/engine/init/initUI.ts`
4. `apps/editor/src/engine/init/initScene.ts`
5. `apps/editor/src/engine/init/initDataPlatform.ts`

---

## §2 — The Migration Pattern

```typescript
// BEFORE (init file — publishes to window)
function initBuilders(runtime: PryzmRuntime): void {
  window.wallStore = runtime.stores.wallStore;
  window.slabStore = runtime.stores.slabStore;
  window.doorStore = runtime.stores.doorStore;
  // ... 53 assignments
}

// AFTER (init file — passes as constructor arg)
function initBuilders(ctx: AppContext): void {
  // ctx.stores.wallStore is the canonical handle
  // Builders receive stores via dependency injection
}
```

```typescript
// BEFORE (consumer — reads from window)
function handleWallCreate(): void {
  const store = window.wallStore; // LP-01 violation
  store.addWall(newWall);
}

// AFTER (consumer — receives via constructor injection)
class WallCreateHandler {
  constructor(private readonly stores: PryzmStores) {}
  handle(): void {
    this.stores.wallStore.addWall(newWall);
  }
}
```

---

## §3 — Sprint Plan

### Sprint E.stores.1 (4 days): Feature-flag bridge + init file cleanup

**Goal**: Remove all 53 `window.xStore = ...` writes from the 5 init files.

**Work:**
1. Add feature flag `PRYZM_STORES_INJECTED` to `packages/feature-flags/`
2. Modify each of the 5 init files to:
   - Remove `window.xStore = runtime.stores.xStore` assignments
   - Pass stores via function argument `ctx.stores` instead
3. Add a `packages/legacy-shim/` adapter that re-exports from `ctx.stores.*` for consumers not yet migrated (bridge pattern — temporary, removed in E.stores.6)
4. Verify: `rg "window\.\w*Store\s*=" apps/editor/src/engine --type ts | grep -v "// " | wc -l` → 0

**Gate**: Add `check-window-store-in-apps.ts` to gate suite; set baseline to current count

---

### Sprint E.stores.2 (3 days): BrowserDataHelpers + SpatialTree — ~42 sites

**Target packages:**
- `packages/room-topology/src/BrowserDataHelpers.ts`
- `packages/spatial-index/src/SpatialGrid.ts`
- `packages/room-topology/src/RoomContentsService.ts`

These are the highest-count offenders in `packages/`. Each is a service class — convert to constructor injection.

**Pattern**: Change `constructor()` to `constructor(private stores: PryzmStores)` and remove all `window.xStore` reads.

**Gate**: Lower `packages/` ceiling from 235 to 193

---

### Sprint E.stores.3 (3 days): initUI.ts window reads + BimService — ~48 sites

**Target files:**
- `apps/editor/src/engine/init/initUI.ts` — `window.xStore` reads (31 sites)
- `apps/editor/src/services/BimService.ts` — 15 `(window as any)` casts as store aliases

**Work:**
1. Pass stores explicitly to initUI (it already receives `runtime` — change `window.xStore` reads to `runtime.stores.xStore`)
2. Convert BimService from `(window as any).xStore` pattern to constructor injection

**Gate**: Lower `apps/editor/src/` ceiling from 230 to 182

---

### Sprint E.stores.4 (4 days): Plugin reads + runtime-composer — ~60 sites

**Target locations:**
- `packages/runtime-composer/src/ProjectLifecycleController.ts` — 9 `(window as any)` casts
- Plugin handlers that read `window.xStore` for side-effect checks
- `packages/views/src/` view composition files

**Work:**
1. Inject `PryzmRuntime.stores` into `ProjectLifecycleController` constructor
2. Audit each plugin reading `window.xStore` — pass stores via `createPlugin({ stores })` factory argument
3. Update `plugin-sdk` plugin factory API to accept optional `stores` injection point

**Gate**: Lower packages ceiling to 130; lower apps ceiling to 120

---

### Sprint E.stores.5 (3 days): Remaining packages/ — ~130 sites

**Target packages** (remaining high-count packages):
- `packages/engine/src/`
- `packages/command-registry/src/`
- `packages/stores/src/`
- `packages/physics-host/src/`

**Work:**
1. Systematic conversion of all remaining `window.xStore` reads to injected `stores.*` access
2. Update barrel exports where needed

**Gate**: Lower packages ceiling to 10; apps ceiling to 20

---

### Sprint E.stores.6 (3 days): Final cleanup + legacy shim removal

**Work:**
1. Remove the temporary `packages/legacy-shim/` bridge from Sprint E.stores.1
2. Delete `packages/legacy-shim/two-stores.bad.ts` (it was a test artifact — real shim is now gone)
3. Remove `window.xStore` from `global-window.d.ts` TypeScript declarations
4. Remove `StoreEventBus` from `BatchCoordinator` — replace with `Y.Doc.transact()` boundaries (this unblocks GAP-007)
5. Verify all window store gates at 0

**Milestone verifier**:
```bash
rg "window\.\w*Store\b" apps/editor/src --type ts | grep -v "// |= " | wc -l   # → 0
rg "window\.\w*Store\b" packages --type ts | grep -v "// " | wc -l              # → 0
rg "\(window as any\)" apps/editor/src --type ts | grep -v "// " | wc -l        # → 0
rg "StoreEventBus\b" packages --type ts | grep -v "// |StoreEventBus\.ts" | wc -l  # → 0
```

---

## §4 — Acceptance Criteria (Sprint E.stores.6 Close)

| Verifier | Expected |
|---|---|
| `window.xStore` reads — `apps/editor/src/` | 0 |
| `window.xStore` reads — `packages/` | 0 |
| `window.xStore` writes — init files | 0 |
| `(window as any)` — `apps/editor/src/` | 0 |
| `(window as any)` — `packages/` | 0 |
| `StoreEventBus` references | 0 |
| C03 contract status | PASSING |
| C14 LP-01 status | ELIMINATED |
| Headless runtime — stores accessible without `window.*` | ✅ |

---

## §5 — What Becomes Functional After E.stores Close

| Feature | Before E.stores | After E.stores.6 |
|---|---|---|
| **Unit testing packages** | Requires JSDOM + window globals | Pure Node.js — no DOM needed |
| **Headless rendering** | Broken (window not available) | Fully operational |
| **Store data-flow tracing** | Invisible (global reads) | Explicit constructor injection graph |
| **Server-side rendering** | Impossible | Unlocked |
| **`StoreEventBus`** | 151 references | Eliminated → Yjs transact() |
| **C14 LP-01** | Active violation | ELIMINATED |
| **C03** | FAILING | Advancing toward PASSING |

---

*Stamp: 2026-05-16. Can start concurrently with OPEN-002 Phase E.5.x — no sequencing constraint between E.5.x and E.stores. Preferred: start E.stores.1 in parallel with E.5.2.*
