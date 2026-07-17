# Lighting fails during house generation — `lighting.create` store missing (2026-06-20)

**Founder report (live deploy console, house generation):**

```
[lighting-layout] §LIGHT-SUMMARY rooms_total=9 rooms_lit=4 rooms_skipped=5 fixtures_placed=7
[lighting-layout] lighting.create failed: CommandBusError: lighting.create: required store
   'lighting' is missing from HandlerContext.stores. The bus does NOT fall back to globals —
   declare the store in your storesProvider. (ADR-0202 §3 / R1A-16)
```

Generated houses end up **under-lit**: the post-gen `lighting → fixtures` batch throws, so the
fixtures the layout engine computed never reach the scene.

## Root cause (definitive — confirmed across all three store-registration sites)

The plugin handler `CreateLightingHandler` (`plugins/lighting/src/handlers/CreateLighting.ts:38`)
declares `affectedStores = ['lighting']` and reads `ctx.stores.lighting` in `execute()`. Per
**ADR-0202 §3** the command bus does **not** fall back to globals — the store must be registered
in the bus's `storesProvider`. It is **not**:

| registration site | registers plumbing / furniture / annotation? | registers **lighting**? |
|---|---|---|
| `apps/editor/src/engine/initStores.ts` (StoreRegistry, "21 stores") | ✅ `r('plumbing'…)`, `r('furniture'…)`, `r('annotation'…)` | ❌ **no `r('lighting', …)` line** |
| `apps/editor/src/PluginRegistry.ts` `ELEMENT_PLUGIN_IDS` | ✅ `plumbing`, `furniture`, `annotations` | ❌ **absent from the list** |
| `apps/editor/src/engine/engineLauncher.ts:701` `initPersistence({ stores })` | ✅ `plumbingStore`, `furnitureStore` | ❌ **no `lightingStore`** |

The lighting **handlers** ARE registered (`engineLauncher.ts:487 registerLightingHandlers(_bus)`),
exactly like plumbing (`:483`) — but the matching **store** contribution was never added. So
`lighting.create` resolves a handler, the bus builds the `HandlerContext`, finds no `lighting`
store, and throws. `plumbing.create` works because `plumbing` IS registered (the asymmetry is the
tell).

## Why the fix should be small (the rest of the pipeline already exists)

- `initTools.ts:1703` already registers a `lighting.created` → **legacy-3D-store** bridge
  (`§FT-LIGHTING: lighting.created bus→legacy-store bridge registered`). Once `lighting.create`
  SUCCEEDS it emits `lighting.created`, and this bridge forwards the fixture into the legacy
  `LightingStore` that `LightingFragmentBuilder` reads (see `CommandEventBridge.ts:619`).
- So the **only** missing link is the store contribution; the create→bridge→3D mesh chain is
  wired and waiting.

## The fix (NOT applied — needs browser verification; this is the "no-risk" writeup)

Mirror the plumbing/furniture wiring for lighting:
1. Thread a `LightingsState` store instance (plugins/lighting `store.ts`) into the editor
   `stores` bundle, the SAME object the legacy 3D builder reads (resolve the **two-store
   ambiguity** first — plugin store vs `window.lightingStore`; pick one source of truth so the
   bridge round-trips into the store the builder renders).
2. Register it everywhere its siblings are: `r('lighting', stores.lightingStore)` in
   `initStores.ts`, add `'lighting'` + a contribution entry in `PluginRegistry.ts`, and add
   `lightingStore` to the `initPersistence({ stores })` record.

**Why it's low-downside but still must be verified:** lighting is currently 100 % broken (throws),
so wiring the store cannot regress it — worst case the fixtures land in the wrong store and stay
invisible (no change from today). But confirming the fixtures actually RENDER requires a browser
generate + visual check, which is why this is documented rather than blind-deployed. It does NOT
touch any other element family (additive store key), so the blast radius is lighting-only.

## Cross-refs
- [[null-at-mount-runtime-event-race]] — the "feature does nothing" blind-wiring risk class.
- Memory `element-semantic-audit-status` already flagged lighting as "Blocked, NOT skipped —
  two stores … gizmo-attach unconfirmed. Needs browser inspection." This pins the FIRST of those
  blockers (the store-missing throw) to an exact, high-confidence root + fix.
