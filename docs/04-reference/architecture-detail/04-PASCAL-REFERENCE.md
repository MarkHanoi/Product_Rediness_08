# Pascal Editor — Reference Implementation Analysis

> Source: `editor/` folder at the repo root, mirror of [pascalorg/editor](https://github.com/pascalorg/editor) v0.6.0 (Apr 2026).
> License: **MIT**. Anything here can be forked, copied, or embedded.
> Status: actively developed, public open-source 3D building editor with ~14 contributors in the latest changelog.

This document is a verdict on how much of Pascal's architecture maps onto the PRYZM 2 target, what to adopt verbatim, what to extend, and what is still missing.

---

## §0 — Alignment header (re-anchored 2026-04-26)

> **Strategic anchor**: This document is now subordinate to `08-VISION.md`, `09-AS-IS-VS-TO-BE.md`, `10-MASTER-IMPLEMENTATION-PLAN-36M.md`, and the four PHASE-1 sub-docs in `phases/`.
>
> **Conflict order** (highest wins): `06-PRYZM-IDENTITY-AND-RECOUNT.md` + the `.pryzm` file-format spec → `08-VISION.md` → `10-MASTER…` and the PHASE docs → this doc.
>
> **TypeScript Vanilla Decision (binding)**: PRYZM 2 stays **vanilla TypeScript** for L7. **Pascal's Next.js 16 + React 19 + R3F editor shell is NOT adopted.** Only Pascal's *patterns* are mined; its stack is not.
>
> **What in this doc is still authoritative (mine these patterns)**:
> - Per-primitive separation inside `packages/core/src/systems/{wall,slab,roof,…}` — adopted in PRYZM 2 as `plugins/<family>/` with the same one-folder-per-primitive shape.
> - The dirty-flag pattern in systems (§1 L4 row) — adopted by `08-VISION.md` §3 P3 (one frame owner) + the `SceneCommitter` (P2).
> - The Scene Registry (`Map<id, Object3D>`) for O(1) lookups — adopted as the committer's element index.
> - Three.js `Layers` for editor-helper / scene / zone separation — adopted as render-pass categories.
> - Three-store split (`useScene` / `useViewer` / `useEditor`) — adopted as `domain stores` (L1) / `view stores` (L1) / `UI state` (L7) but **without Zustand** in L7 (vanilla TS uses its own observable primitives).
> - Zod-validated DTOs at store boundaries — adopted in `packages/protocol/`.
> - The "extension by composition" mental model — promoted into PRYZM 2's L6 plugin manifest contract.
>
> **What in this doc is SUPERSEDED (do NOT adopt these)**:
> - "Adopt verbatim: Next.js 16 + React 19 in `apps/editor`" → **superseded**. Editor shell is **vanilla TS**, not Next.js. PRYZM keeps its existing Vite + Express + Supabase + Stripe stack (per `08-VISION.md` and `06` §1.1).
> - "Adopt verbatim: `packages/viewer` SceneRenderer → NodeRenderer (React/R3F)" → **superseded**. The PRYZM 2 equivalent is `packages/scene-committer/` — an imperative API, not a JSX tree. R3F is **not** in the stack.
> - "Adopt verbatim: Zustand + Zundo middleware" → **superseded for L7**. Stores in L1 are pure TS modules with their own subscription primitives; undo is event-log replay, not Zundo.
> - The TL;DR claim "the fastest path to PRYZM 2 is to fork Pascal as the v1 editor base" → **superseded**. PRYZM 2 mines Pascal's *patterns* but does not fork its codebase. Reasons: (a) Pascal is single-user/IndexedDB and has no L0/L2/L3 — the missing 30% is the hard part; (b) Pascal's React/Next.js shell collides with PRYZM's existing vanilla-TS UI (~390k LOC), Stripe wiring, IFC/sheet/schedule pipeline, AI subsystem; (c) the recount in `06` shows the L7 React migration alone would be a 9–12 month sub-project.
> - The "Strategy A vs B" framing referenced from `05` → both are now **superseded** by the strategy in `10-MASTER…`: stay vanilla TS, build the new layered packages alongside, strangler-fig the legacy `src/` per the PHASE-1/2/3 plan.

---

## TL;DR — three things to know

1. **Pascal already implements ~70% of the architecture proposed in `01-TARGET-ARCHITECTURE.md`.** It is, in effect, a working open-source reference implementation of layers L1, L4, L5, L6 and L7 — the parts that do not need a server.
2. **The remaining 30% — what makes a system Forma/Qonic/Motif-class — is exactly what Pascal does not have**: server-side bake, chunked binary persistence, real-time collaboration, web-worker geometry, plugin SDK. Pascal is a single-user, client-side, IndexedDB-backed app.
3. **The fastest path to PRYZM 2 is to fork Pascal as the v1 editor base** and add the missing layers (L0 persistence, L2 events, L3 sync) on top. This shortcuts roughly **4–6 calendar months** of foundation work that would otherwise be Phase 0–2 of the orchestration plan.

---

## 1. What Pascal has, layer by layer

### Repository layout

Pascal is a Turborepo monorepo with the **exact structure** I proposed:

```
editor/
├─ apps/editor/          # Next.js 16 + React 19 application
├─ packages/core/        # Schema, store, systems, registry, events
├─ packages/viewer/      # @pascal-app/viewer — standalone 3D canvas component
├─ packages/ui/          # Shared UI primitives
├─ packages/eslint-config/
├─ packages/typescript-config/
└─ tooling/
```

Both `core` and `viewer` are **published to npm** as `@pascal-app/core` v0.6.0 and `@pascal-app/viewer` v0.6.0. They are consumed by `apps/editor` via workspace deps and can be embedded in any React app.

### Layer-by-layer mapping to PRYZM 2

| PRYZM 2 Layer | Pascal Implementation | Verdict |
|---|---|---|
| **L0 Persistence** | Zustand `persist` middleware → IndexedDB. Whole-store JSON. No server, no chunks, no bake. | **Missing** — Pascal is single-user. |
| **L1 Domain Stores** | `packages/core/src/store/use-scene.ts`. Zustand store: `nodes: Record<id, AnyNode>`, `rootNodeIds`, `dirtyNodes: Set<id>`. Zod-validated on `parse()`. **Zundo** middleware for undo/redo (50 steps). | **Adopt verbatim.** |
| **L2 Command/Event Bus** | None. Tools mutate the store directly via `useScene.getState().createNode()`. Mitt event bus exists but is for *interactions* (`wall:click`), not domain mutations. | **Missing** — Pascal has no CQRS, no event log, no replay. |
| **L3 Sync Engine** | None. Single-user. | **Missing.** |
| **L4 Geometry Kernel** | `packages/core/src/systems/{wall,slab,roof,ceiling,door,window,item,stair,fence}/`. Each system is a React component running in `useFrame`. Reads `dirtyNodes`, writes geometry directly to registered Three.js objects. **Imports THREE** (so not pure-headless) but has clean per-primitive separation: `wall-system.tsx`, `wall-curve.ts`, `wall-footprint.ts`, `wall-mitering.ts`. | **Adopt the structure, lift to pure functions** so they run in workers/Node. |
| **L5 Render Runtime** | `packages/viewer/src/components/viewer/index.tsx`. Mounts SceneRenderer → NodeRenderer (dispatches by type) → per-type renderers. Scene Registry (`Map<id, Object3D>`) for O(1) lookups. Dirty-flag pattern in systems. Three.js `Layers` for editor-helper / scene / zone separation. | **Adopt verbatim.** |
| **L6 Plugin Host** | None. Tools and systems are React components mounted as `<Viewer>` children. **Extension by composition**, not by manifest. | **Adopt the composition pattern; promote to a manifest later.** |
| **L7 Presentation** | Next.js 16 + React 19 in `apps/editor`. Tools in `apps/editor/components/tools/`. ToolManager mounts active tool by `useEditor` state. | **Adopt verbatim.** |

---

## 2. Patterns Pascal nailed (worth copying line-for-line)

### 2.1 Three-store split

```ts
useScene   // @pascal-app/core   — domain (nodes, dirty set), persisted+undoable
useViewer  // @pascal-app/viewer — view state (selection, camera, level mode)
useEditor  // apps/editor        — UI state (active tool, panels, phase)
```

This is exactly how PRYZM should split state. Today PRYZM mixes all three into ~30+ stores with no clear ownership boundary.

### 2.2 Zod schemas with typed IDs

```ts
export const WallNode = BaseNode.extend({
  id: objectId('wall'),       // generates "wall_abc123"
  type: nodeType('wall'),
  start: vec2(),
  end: vec2(),
  thickness: z.number().default(0.1),
  height: z.number().default(2.5),
}).describe('Linear wall between two points')

export type WallNode = z.infer<typeof WallNode>
```

`WallNode.parse({...})` is the **only** way to create a node — it generates the ID, validates, and fills defaults. PRYZM has Zod schemas in places but lacks the typed-ID convention and the parse-only-creation rule.

### 2.3 Dirty-flag system pattern

```ts
useScene.getState().updateNode(wallId, { thickness: 0.2 })
// → wallId added to dirtyNodes
// → WallSystem regenerates geometry next frame
// → wallId removed from dirtyNodes
```

This is the L5 demand-driven render shape, with one caveat: Pascal's `useFrame` still runs every frame and *checks* if there are dirty nodes. It does not actually skip frames. PRYZM 2 should extend the pattern with a **single frame scheduler** that only requests a frame when the dirty set is non-empty (R3F's `frameloop="demand"` mode is the entry point).

### 2.4 Scene Registry

```ts
sceneRegistry = {
  nodes: Map<id, Object3D>,
  byType: { wall: Set<id>, slab: Set<id>, ... },
}
// In a renderer:
useRegistry(node.id, 'wall', ref)
// In a system:
const obj = sceneRegistry.nodes.get(wallId)
```

This is the clean version of what PRYZM tries to do via `(window as any).slabBuilder` and `(window as any).__pryzmDebugWalls`. **Adopt verbatim and ban global-window cross-wiring** the day this lands.

### 2.5 Viewer isolation

Pascal's hard rule:
> The viewer is controlled from outside. It exposes control points (props, callbacks, children). It never reaches into `apps/editor`.

Concretely:
- `@pascal-app/viewer` cannot import from `apps/editor`.
- Editor-specific behaviour (tools, snapping overlays, phase-aware selection) is **injected as `<Viewer>` children**.
- This is what enables a read-only viewer build (`/viewer/[id]`) to ship without dragging the editor in.

This is exactly the L6 separation PRYZM needs and the reason a viewer-only bundle is feasible at all.

### 2.6 Tools mutate the store, never call THREE

```ts
// ✅ Tool
const createNode = useScene(s => s.createNode)
return <mesh onPointerDown={(e) => createNode(WallNode.parse({...}), levelId)} />

// ❌ Tool
scene.add(new THREE.Mesh(...))
```

Combined with **systems own all geometry generation**, this gives a clean unidirectional flow: input → store → systems → registry → render. PRYZM's 264 commands today violate this in dozens of places.

### 2.7 Two selection managers (viewer + editor)

Pascal mounts a default selection manager inside `<Viewer>` (hierarchical: building → level → zone → elements) and lets the editor *replace* it with a phase-aware one as a child. Same pattern, two implementations, no shared "if isEditor" branching. PRYZM's selection logic today is sprinkled across 12 files; Pascal's is two.

### 2.8 Typed event bus for interactions only

Mitt-based emitter for `wall:click`, `item:enter`, `grid:pointerdown`. Crucially: **events are interactions, not state mutations**. Mutations always go through `useScene`. PRYZM's "Phase E-2" CRDT/OT plans should keep this distinction — interactions on mitt, mutations through the (future) command bus.

### 2.9 Architectural rules as `.cursor/rules/*.mdc`

Pascal ships ten rule files describing its architecture. Each file is < 100 lines, scoped to a glob, and includes both correct examples and explicit rules. They're picked up automatically by Cursor and Claude Code.

This is **lighter weight than ESLint boundaries** and easier to start with. PRYZM should adopt the same pattern as a stepping stone to lint-enforced layer boundaries later.

### 2.10 R3F + Drei + WebGPU + three-bvh-csg

Pascal's stack choices match what `01-TARGET-ARCHITECTURE.md` recommends:
- React Three Fiber instead of vanilla THREE (composability with React state).
- `three-bvh-csg` for boolean operations (replacing PRYZM's older csg-js).
- WebGPU renderer with WebGL2 fallback.
- `three-mesh-bvh` for fast spatial queries.

---

## 3. Where Pascal stops short

These are the gaps between Pascal and a Forma/Qonic/Motif-class system.

### 3.1 Single-user only — no CRDT, no relay, no awareness

Pascal has **no multi-user collab.** State is local. No WebSocket, no Yjs, no presence protocol. Adding it requires:
- Wrapping the Zustand store in a Yjs document (or equivalent CRDT).
- A WebSocket relay server (which the existing PRYZM Socket.io infra can become).
- Conflict resolution per command type.
- Awareness for cursors and selection.

### 3.2 No server-side bake, no streaming chunks

Pascal persists the **entire scene** as one IndexedDB blob via Zustand `persist`. No CDN-friendly chunks, no per-level streaming, no server bake. A 50,000-element project would re-build geometry from scratch on every load. This is the same failure mode the PRYZM audit identified (`00-AUDIT.md` §2).

To fix on top of Pascal:
- Add `packages/persistence-client` (chunk fetching, range requests, manifest).
- Add `apps/bake-worker` (Node service running the same `packages/core` systems headlessly).
- Replace IndexedDB persistence with the chunked binary format.

### 3.3 Systems are React components, not pure functions

Pascal's `wall-system.tsx` is **603 lines** (vs PRYZM's 2,256-line `WallFragmentBuilder.ts`, so already ~3× cleaner) but it still:
- Imports `from 'three'` at the top of `packages/core` — so the "core" package is **not headless**.
- Runs in `useFrame` on the main thread — no worker pool.
- Reads from `sceneRegistry` and writes geometry directly to live `Object3D` instances.

This is a deliberate Pascal trade-off: simpler React mental model, no worker plumbing. For PRYZM 2 it's a problem because:
- The same code can't run in Node for server bake.
- Big edits stall the main thread.
- Systems can't be unit-tested without mounting React + R3F.

**The lift**: extract the pure parts. For each Pascal system, identify the function that *just* takes node DTOs and returns geometry data (e.g. `wall-curve.ts`, `wall-footprint.ts`, `wall-mitering.ts` are already pure) — keep them in `packages/core`. The React component that calls them and mutates the registry becomes a `packages/viewer/systems/wall-system-host.tsx` that does the side-effect part. This is mechanical; ~2 weeks per primitive.

### 3.4 No event sourcing, no command/event split

Pascal's undo is **Zundo**: it snapshots the entire Zustand store before every change (with structural sharing). Works fine for solo, but:
- Snapshots are not a wire format — you can't broadcast them to collaborators.
- 50-step history is a hard cap baked into the middleware.
- Time-travel to arbitrary points requires storing all snapshots (memory cost).

For PRYZM 2's collab + bake + audit trail needs, the L2 event bus from `01-TARGET-ARCHITECTURE.md` is still required. But Pascal's store can host it: every event reducer is a Zustand `set()` call, and Zundo can be replaced with event-log replay.

### 3.5 No plugin manifest

Tools are statically registered in `ToolManager`. Adding a tool means adding a React file and a switch case. No dynamic loading, no third-party plugins, no version isolation.

For v1, **this is fine.** Pascal proves you can ship a serious editor without a plugin SDK. For PRYZM 2, the L6 plugin host can be added in Phase 7 (per the orchestration plan) without disturbing anything Pascal already does.

### 3.6 No multi-view (plan / section / 3D split)

Pascal renders one perspective view. PRYZM has plan view, section view, multi-camera, sheet export — all built on OBC. Pascal does not address this at all.

This is **PRYZM's existing strength** that Pascal does not provide. The plan-view machinery in PRYZM (`PlanViewManager`, `PlanViewService`, `EdgeProjectorService`) cannot be replaced wholesale by Pascal; it needs to be reframed as additional viewer systems and renderers on top of the Pascal-style core.

### 3.7 No IFC import

Pascal has no IFC importer. PRYZM's IFC pipeline (web-ifc + OBC) is therefore a feature PRYZM keeps and Pascal does not need.

---

## 4. Three viable adoption strategies

### Strategy A — **Fork Pascal as the v1 base** (recommended)

**What**: Take `editor/` (MIT) as the starting point. Rename `@pascal-app/*` → `@pryzm/*`. Migrate PRYZM's domain-specific code onto Pascal's foundation.

**Pros**:
- Saves 4–6 calendar months of Phase 0–2 work.
- Inherits a working WebGPU pipeline, scene registry, dirty-flag, viewer isolation, undo/redo, IndexedDB persistence, R3F rendering.
- Inherits Cursor/Claude rules wholesale.
- Battle-tested by ~14 community contributors over 200+ PRs.

**Cons**:
- Commits PRYZM to React 19 + Next.js 16 (Pascal's stack), not the current Vite + Express setup. **Major rip-up of the current shell**, even though most domain code is portable.
- Inherits Pascal's not-headless system design — must still do the worker port (Phase 2 of orchestration) before workers/server bake become possible.
- Inherits Pascal's lack of multi-view — PRYZM's plan/section/sheet code must be re-grown on top.
- Dependency on an external project's release cadence (mitigated by fork).

**When to choose**: if the team is willing to switch the editor shell to Next.js and accept a 4–8 week migration of UI, but wants the architectural foundation handed to them.

### Strategy B — **Adopt patterns + rules without forking** (safe middle path)

**What**: Keep PRYZM's Vite + Express shell. Build new packages following Pascal's patterns: `packages/core` with `useScene` + `dirtyNodes` + `sceneRegistry`, `packages/viewer` with R3F renderers, `packages/editor` with tools. Copy the `.cursor/rules/*.mdc` files into PRYZM's repo root.

**Pros**:
- No shell change, no Next.js commitment.
- Borrows the patterns and the rule files (which are the actual valuable IP) without inheriting the dependency.
- Free to make different stack choices (e.g. Vite over Next.js, Yjs from day one).
- Preserves PRYZM's plan-view and IFC code as-is during the transition.

**Cons**:
- Re-implements code Pascal already shipped — wall mitering, slab triangulation, scene registry, dirty-flag system. ~6–10 weeks of "rewrite from a known good blueprint" instead of "new design".
- Misses out on Pascal's WebGPU pipeline groundwork.

**When to choose**: if the team values stack continuity over a fast start; if Next.js is a non-starter; if PRYZM 2 needs an event-sourced/collab-first architecture from day one (which Pascal doesn't have anyway).

### Strategy C — **Embed Pascal as the viewer-only build** (narrow win)

**What**: Use `@pascal-app/viewer` as the read-only viewer for `apps/viewer` deliverable. Build the editor independently.

**Pros**:
- Fast win for the viewer-only build target (Phase 7 success criterion in orchestration plan).
- No editor migration needed.
- Bundle size gain immediately.

**Cons**:
- Forks PRYZM's domain model (different node schemas, different stores).
- Maintenance burden of keeping two model definitions in sync.
- Limited value — most of Pascal's IP is in the editor patterns, not the viewer surface.

**When to choose**: rarely. Only if a viewer-only deliverable needs to ship in weeks, before the editor architecture is decided.

---

## 5. Recommendation

Adopt **Strategy B** as the core decision, with **selective copying from Pascal** of:

1. The **monorepo layout** (`packages/core` + `packages/viewer` + `apps/editor`) — verbatim.
2. The **three-store split** (`useScene` / `useViewer` / `useEditor`) — verbatim.
3. The **`.cursor/rules/*.mdc` architecture files** — verbatim, customised for PRYZM specifics. Add five PRYZM-specific rules: `command-event-bus`, `worker-pool`, `chunked-persistence`, `multi-view`, `ifc-pipeline`.
4. The **scene registry** + **`useRegistry` hook** — verbatim.
5. The **dirty-flag pattern** — verbatim, plus PRYZM 2 frame scheduler (R3F `frameloop="demand"`) on top.
6. The **viewer-isolation rule** — verbatim. Adopt it as the L6 boundary in PRYZM 2.
7. The **tools-mutate-store-only rule** — verbatim.
8. The **typed-ID + Zod schema + `.parse()` only** convention — verbatim.
9. The **selection-manager-as-injectable-child** pattern — verbatim.
10. The **`three-bvh-csg`** dependency choice — verbatim.

Where Pascal stops short, fall back to `01-TARGET-ARCHITECTURE.md`:

- **L0 / L2 / L3** (persistence, events, sync) — design from the architecture doc, no Pascal precedent to follow.
- **L4 worker hosting** — extract the pure parts of Pascal's systems into worker-friendly modules.
- **Multi-view + IFC** — keep PRYZM's existing machinery, port it onto the new structure as extra viewer systems and renderers.

This is a **net positive** for the orchestration plan. It compresses Phase 0 (foundation) from 4 weeks to ~2, and gives Phase 1 (domain & events) a working blueprint to extend rather than design from scratch.

---

## 6. Concrete next actions

If the team agrees with Strategy B:

1. Copy `editor/.cursor/rules/*.mdc` into `docs/archive/pryzm3-internal/rules/` (read-only reference) and `.cursor/rules/` (PRYZM-customised live versions).
2. Create `packages/core/src/store/use-scene.ts` mirroring Pascal's pattern but reducing from an event log instead of accepting direct mutations.
3. Create `packages/core/src/hooks/scene-registry/` as a direct port.
4. Extract one primitive (recommend **walls** because it's PRYZM's biggest mess) using Pascal's `wall-curve.ts` / `wall-footprint.ts` / `wall-mitering.ts` as the pure-function reference; bind to a worker host in `packages/viewer`.
5. Stand up the `frameloop="demand"` mode in `<Canvas>` and add a single `requestFrame()` call to the dirty-set updates.
6. Compare load-bench numbers against the existing PRYZM legacy on the same fixture — if Phase 0 + Strategy B beats baseline by ≥ 30% with one primitive ported, the strategy is validated.

If the team agrees with Strategy A (full fork):

1. Spike a 1-week migration of one PRYZM page to Next.js to confirm the shell change is tolerable.
2. Confirm WebGPU works in production for the customer hardware mix.
3. Produce a list of every PRYZM Vite/Express dep that needs a Next.js equivalent.
4. Decide whether to upstream PRYZM-specific contributions back to Pascal (multi-view, IFC) or keep the fork private.

If neither: the original orchestration plan in `02-ORCHESTRATION.md` stands as written — Pascal is then a useful reference document but not part of the deliverable.

---

## 7. Risk: depending on a community project

Pascal is MIT-licensed and currently active, but it's not maintained by an established company with SLAs. Risks:

- **Project abandonment.** Mitigated by the fork — once forked, Pascal upstream changes are optional.
- **Breaking API changes.** The `@pascal-app/core` and `@pascal-app/viewer` packages are at v0.6.0 — pre-1.0. Mitigated by pinning exact versions and pulling updates manually.
- **License contamination.** MIT is the most permissive license that requires only attribution. Including the LICENSE file in `packages/*/` covers it.
- **Architectural drift.** If Pascal pivots (e.g. away from Zustand, toward Solid.js), the fork must absorb or reject the change. This is normal fork hygiene; the cost is bounded as long as Strategy B (patterns-only) is chosen rather than Strategy A (deep fork).

None of these are blocking. They are governance issues to acknowledge in the ADR for whichever strategy is chosen.

---

## 8. Summary table — what to do with each Pascal artefact

| Artefact | Action |
|---|---|
| `editor/packages/core/src/schema/` (Zod node schemas) | **Adopt the pattern.** Rewrite for PRYZM's element types using the same conventions. |
| `editor/packages/core/src/store/use-scene.ts` | **Adopt the pattern, replace direct mutation with event reducer.** |
| `editor/packages/core/src/hooks/scene-registry/` | **Copy verbatim** (rename namespace). |
| `editor/packages/core/src/hooks/spatial-grid/` | **Copy verbatim**, extend with PRYZM's existing collision rules. |
| `editor/packages/core/src/events/bus.ts` | **Copy the mitt setup verbatim.** Use only for interaction events; do not conflate with the future command/event bus. |
| `editor/packages/core/src/systems/wall/*` | **Reference for refactoring PRYZM's wall code.** Lift pure parts (`wall-curve`, `wall-footprint`, `wall-mitering`) into PRYZM's `packages/core`; the React host becomes a worker dispatcher in `packages/viewer`. |
| `editor/packages/viewer/src/components/renderers/` | **Use as templates** for PRYZM's renderers. Same dispatch pattern, PRYZM-specific node types. |
| `editor/packages/viewer/src/components/viewer/` | **Reference for the viewer entry component**, especially the children-injection extension point. |
| `editor/apps/editor/components/tools/` | **Reference for tool structure.** Pascal's tool inventory is a good baseline for PRYZM's MVP tool set. |
| `editor/.cursor/rules/*.mdc` | **Copy verbatim** to seed PRYZM's architecture rule set; add 5 PRYZM-specific rules on top. |
| `editor/biome.jsonc` | **Optional.** Biome is Pascal's lint/format choice. PRYZM can keep ESLint or switch — orthogonal decision. |
| `editor/turbo.json` | **Adopt** if going Strategy A; ignore if Strategy B (Vite has its own watch story). |
| `editor/bun.lock` | **Ignore.** PRYZM stays on npm; Pascal's bun preference is not architectural. |

---

## 9. Final word

Pascal is a gift. Someone has already built and open-sourced the architectural foundation that `01-TARGET-ARCHITECTURE.md` describes. The remaining hard work — server bake, event sourcing, real-time collab, worker geometry, plugin SDK, PRYZM-specific multi-view and IFC — is exactly the work `02-ORCHESTRATION.md` was sized for. Strategy B lets PRYZM borrow the easy 70% from Pascal and spend the team's calendar months on the 30% that actually differentiates a Forma/Qonic/Motif-class platform.

If the architecture review approves Strategy B, the orchestration timeline contracts from ~40 calendar weeks to ~32–36 calendar weeks for the same deliverable, with lower technical risk on the foundation layers and unchanged risk on persistence/sync/bake.
