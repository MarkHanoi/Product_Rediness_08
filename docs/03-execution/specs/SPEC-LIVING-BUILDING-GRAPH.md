# SPEC — Living Building Graph (A.21.D17) v1.0

**Status.** Live (shipped 2026-06-06).

**Governed by.** `ADR-0058` (Unified Building Graph as the relational substrate; specialised graphs are projections). Sibling of the static living-blob overlay (GRAPH.3, `apps/editor/src/ui/graph/`) — this SPEC's overlay is intended to SUPERSEDE it as the primary graph UI. Direction: [[building-graph-strategy]].

**Owner.** `apps/editor/src/ui/living-graph/`. Read-only over the UBG.

## §1 — Purpose

Show the building not as a node-link diagram of *elements*, but as a **living field of SPACES** whose **relationships are springs**. Each relationship LAYER (adjacency, circulation, environmental/sun, acoustic, structural) pulls or separates rooms; the force-sim settles into the arrangement that **minimises tension across the active layers**. A settled layout is therefore a readable answer to a spatial question — and **toggling a layer asks a different question** ("with only Acoustic on, how do the loud and quiet rooms want to separate?").

This is the founder's "much more interesting, nourishing" graph (A.21.D16): room relationships made physical, live, and interrogable.

## §2 — Non-goals

- It does NOT mutate the model or any source graph (read-only projection, per ADR-0058).
- It is NOT the plan. The free-floating settled layout is a *relational* view; the on-plan geometry is the constrained one. The delta between them is a future feature (§9).
- It does NOT introduce a second renderer or a 3D view — Canvas2D only (P2-safe; no THREE).

## §3 — Data binding

| Concern | Source |
|---|---|
| Live graph | `window.__pryzmBuildingGraph` (a `BuildingGraph` from `apps/editor/src/engine/buildBuildingGraph.ts`) — read the CACHED instance ONLY. |
| Re-sync trigger | the runtime event `pryzm:building-graph-rebuilt` (+ soft `pryzm:room-renamed` / `pryzm:room-occupancy-changed` if emitted). |
| Node universe | `graph.allNodes()` filtered to ROOM kinds (`room`/`space`/`zone`); furniture + non-room kinds excluded. |
| Base edges | `graph.allEdges()` of type `adjacentTo`/`bounds` → **adjacency**; `connectsTo`/`circulatesVia` → **circulation**. |

**Bug-avoidance contract (load-bearing).**

1. **Never** call `window.pryzmBuildBuildingGraph()` from inside the rebuilt listener — it re-enters and recurses → `RangeError: Maximum call stack size exceeded`. The binder reads the cached graph only, behind a `resyncing` re-entry guard.
2. **Skip** rooms with no boundary or a self-intersecting boundary (`boundaryValid === false` / `selfIntersecting === true`) — never crash.
3. **Exclude** furniture nodes (rooms only).
4. Handle `detected < expected` gracefully — map whatever rooms exist.

Node positions are PRESERVED across re-syncs for rooms already simulated (only new rooms are scattered), so a live edit flexes the field instead of reshuffling it.

## §4 — The physics (`forceSimulation.ts`, pure)

Port of the prototype's `simulateStep` / `totalEnergy` / `scatterNodes`. No DOM, no THREE, no I/O, **no `Math.random`** (banned + non-deterministic):

- **Repulsion** — all-pairs Coulomb (`repulsion / d²`), every room pushes every other apart.
- **Attraction** — Hooke spring per ACTIVE-layer edge toward `restLength`, scaled by `weight × active-layer count` (a pair bound by several active relations binds tighter). Toggling a layer off removes its springs.
- **Gravity** — gentle centre-pull so the field stays framed.
- **Integrate + damp + clamp** — Verlet-ish, with a per-step displacement clamp so sparse graphs can't fling apart.
- **Alpha annealing** — `alpha` cools toward `alphaMin` each step (snapped clean at the epsilon) so the field SETTLES; `isSettled()` flips true and the ticker stops. `reheat()` lifts alpha on a layer toggle / rerun / heat-slider nudge so the field re-anneals **from current positions** (not a full scatter).

`scatterNodes` seeds an organic golden-angle spiral from the node INDEX with index-derived jitter — deterministic, RNG-free.

## §5 — The five layers + their derivations

| Layer | Spring behaviour | Derivation |
|---|---|---|
| `adjacency` | attract rooms that physically touch | UBG `adjacentTo` / `bounds` edges |
| `circulation` | attract rooms you can move between | UBG `connectsTo` / `circulatesVia` edges |
| `environmental` (Sun) | cluster sun-hungry rooms (shared aspect) | both rooms' `sunExposure ≥ 0.7`; metric from node `sunExposure`/`daylightFactor` if enriched, else per-type seed (living/sleeping high; wet/circulation low) |
| `acoustic` | separate LOUD ↔ QUIET neighbours | one room loud (`noiseLevel ≥ 0.6`: living/service) ↔ one quiet (`≤ 0.35`: sleeping/wet); only for adjacent pairs (you separate neighbours) — or all such pairs when topology is sparse; spring strength = the noise gap |
| `structural` | cluster wet/service rooms (shared risers / wet stack) | both rooms `wet` or `service` |

`sunExposure` / `noiseLevel` are read from the node's enriched props when present (the concurrent UBG enrichment), and otherwise computed locally from the inferred room type — exactly per the prototype's helpers. Room type comes from `inferRoomType(name, occupancy)`.

## §6 — Rendering (`LivingGraphCanvas.ts`, Canvas2D)

DPR-aware. **White canvas, dark text — brand, NOT the prototype's dark surfaces.** Edges draw one quadratic curve per active layer, dashed per layer; nodes are room-type-coloured circles sized by √area; a sun halo (environmental) + an acoustic ring (acoustic) scale by the metric; labels + an area badge; `pick()` hit-tests for click→inspect. Room-type colours are SEMANTIC (kept from the prototype); the selected/active accent is harmonised to **#6600FF**.

## §7 — The panel (`LivingGraphOverlay.ts`)

`position:fixed` bottom-right, `z-index:4500`, white card, draggable header. Chrome: title + `settled`/`rooms` badges + **Freeze** + ✕; the canvas; a one-line **node inspector** (name · area · ☀sun · ♪noise · type · active connections); the five **layer-toggle chips** (toggling re-settles from CURRENT positions); a **heat slider** (steps/frame); **↺ Rerun** (full scatter).

## §8 — P3 compliance (CI-enforced, merge-blocking)

The sim animation NEVER calls `requestAnimationFrame`. It subscribes a tick listener to the runtime frame bus (`window.runtime.scene.scheduler.addTickListener(…, 'post-render')` — the single rAF pump lives in `FrameScheduler`); when no scheduler is reachable (headless / early boot) it falls back to **one guarded `setInterval` (~30fps)** — never rAF. The ticker STOPS on settle (`isSettled`), Freeze, hide, and dispose, so the editor returns to idle.

## §9 — Future (the founder's stated next steps)

- **Canonical settled-state export per layer** — persist the converged positions so a layer's "answer" is reproducible and shareable.
- **Free-graph vs plan-constrained "design compromise" delta** — overlay the free (tension-minimising) layout against the on-plan (geometry-constrained) one and surface the delta as the *design compromise* each relationship pays. This is the headline next feature.
- **Per-element rationale on nodes** (A.21.D16) — "this window is on the SOUTH façade for daylight" surfaced in the inspector once the UBG carries the rationale.

## §10 — Console + entry

`window.pryzmOpenLivingGraph()` / `window.pryzmCloseLivingGraph()` (installed by `installLivingGraphOverlay()` at boot) + a `✦ Living Graph` launcher button. The primary Graph button is intended to open THIS overlay (supersede the static view) — reconciled at merge so the two graph agents don't collide on the shared toolbar.
