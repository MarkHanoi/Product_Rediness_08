# PRYZM 2 — Orchestration & Execution Plan

> Companion to `00-AUDIT.md` and `01-TARGET-ARCHITECTURE.md`.
> Audience: technical lead + 2 senior engineers (the assumed team).
> Goal: a credible, sequenced path from today's monolith to the layered architecture, with measurable gates and explicit kill-switches.

---

## §0 — Alignment header (re-anchored 2026-04-26)

> **Strategic anchor**: This document is now subordinate to `08-VISION.md`, `09-AS-IS-VS-TO-BE.md`, `10-MASTER-IMPLEMENTATION-PLAN-36M.md`, and the four PHASE-1 sub-docs in `phases/` (`PHASE-1A-Q1-M1-M3-SKELETON-RAILS.md` → `PHASE-1D-Q4-M10-M12-BAKE-PRYZM-ALPHA.md`).
>
> **Conflict order** (highest wins): `06-PRYZM-IDENTITY-AND-RECOUNT.md` + the `.pryzm` file-format spec → `08-VISION.md` → `10-MASTER…` and the PHASE docs → this doc.
>
> **TypeScript Vanilla Decision (binding)**: L7 stays **vanilla TypeScript**. There is no React migration phase in the new orchestration. See `08-VISION.md` §3 P1 / P2.
>
> **What in this doc is still authoritative**:
> - The strangler-fig strategy (§1) — non-negotiable. The PHASE-1 sub-docs operationalise it as Track A (data/headless) + Track B (render/scenic) running in parallel from M1.
> - The "two parallel tracks from day one" pattern (§1.1) — adopted verbatim by every PHASE-1 sub-doc.
> - The Phase 0 deliverables (monorepo, CI gates, perf harness, OTel spans, feature-flag plumbing) — this is the input list to PHASE-1A Sprint S01.
> - Kill-switch discipline — extended in PHASE-1A/B/C/D as named kill-switches K1A-1..3, K1B-1..3, K1C-1..3, K1D-1..3.
>
> **What in this doc is SUPERSEDED**:
> - The **40-week / 8-phase calendar** → **superseded by the 36-month / 72-sprint master plan** in `10-MASTER…`. This doc's "Phase 1 = weeks 5–10" maps to PHASE-1A Sprints S01–S03 (M1–M3) but at the new, larger scope.
> - "Team of 2 senior engineers" assumption → still the team size for PHASE-1, but `06` and `10-MASTER…` show the team grows to 4 → 11 FTE across the 36 months.
> - Sprint sequencing language ("Phase 1 weeks 5–10 = Domain & Event Bus") → superseded by the per-sprint two-agent daily breakdowns in `phases/PHASE-1A…1D…`.
> - Any wording that implies the editor shell becomes React → superseded by the TypeScript Vanilla Decision in `08-VISION.md`.

---

## 1. Strategy — strangler fig, not big-bang

We do **not** rewrite the whole app in a branch and merge it. We:

1. Build the new packages **alongside** the old code.
2. Move features over one primitive at a time, behind a feature flag.
3. Keep the legacy app shippable at every step.
4. Cut the cord (delete `EngineBootstrap.ts`) only after parity is proven.

This is the strangler-fig pattern. It is slower than a clean rewrite for the first 3–4 months, but ships value continuously and never produces a 10,000-line untested merge.

### 1.1 Two parallel tracks from day one

```
Track A — Foundation (must lead)
  Domain core → Event bus → Geometry kernel skeleton → Frame scheduler

Track B — Persistence & Server (can start after week 4)
  Binary format → Bake service → Streaming client SDK
```

Each track has one senior owner. The third pair-hour is a weekly architecture review where both owners + the lead align.

---

## 2. Phases (calendar weeks)

### Phase 0 — Foundation in place (weeks 1–4)

**Outcome**: monorepo, CI gates, perf harness, feature-flag plumbing. No user-visible change.

- Create pnpm workspace, move existing code to `apps/editor-legacy/`.
- Stand up empty `packages/domain`, `packages/protocol`, `packages/geometry-kernel`, `packages/render-runtime`.
- Add `eslint-plugin-boundaries` with the layer rules from §1 of the architecture doc.
- Add `tools/load-bench`: spins a headless Chromium, opens 3 fixture projects (small/medium/large), records cold-load timing. Runs in CI on every PR.
- Add OpenTelemetry browser SDK + a simple span viewer (Honeycomb free tier or local Tempo).
- Define the 8 hot-path spans: `manifest.fetch`, `events.replay`, `chunk.fetch`, `chunk.commit`, `worker.geometry`, `frame.commit`, `frame.render`, `idle.accumulate`.
- Feature flag: `PRYZM_NEW_ARCH=on|off` per primitive. Default off.

**Gate to exit Phase 0**: load-bench reports baseline numbers; any PR that regresses cold-load > 5% fails CI.

---

### Phase 1 — Domain & Event Bus (weeks 5–10)

**Outcome**: a working CQRS core that the new wall primitive (Phase 2) can sit on.

- `packages/protocol`: MessagePack codecs, ULID generation, event envelope schemas.
- `packages/domain`: store contract (§3 of architecture doc), event reducer runtime, time-travel utility.
- Implement **5 reference command handlers** for: `level.create`, `wall.create`, `wall.update`, `wall.delete`, `transaction.commit`.
- Local-only event log (IndexedDB persistence, no server yet).
- Migration adapter: read a legacy `ProjectSerializer` v5 JSON → emit equivalent event log.
- Property tests: random sequences of commands → reduced state matches direct mutation; `replay(events.slice(0,N))` is deterministic.

**Gate**: a 5,000-event project loads, replays, and matches the legacy snapshot byte-for-byte (after deterministic re-serialization).

---

### Phase 2 — Headless Geometry Kernel + Walls (weeks 8–14, overlaps Phase 1)

**Outcome**: walls produced by pure functions in a worker; rendered through the new committer.

- `packages/geometry-kernel`: producer interface (§6.1), `MaterialDescriptor`, `GeometryIR` types, BoundingVolume helpers.
- Port `WallFragmentBuilder.buildWall()` → `produceWallGeometry(dto, ctx)`. **Pure**, no THREE, no scene. ~3 weeks of focused work.
- Port `WallJoinResolver`, `WallOpeningGeometry`, miter math, layer math — all pure.
- Worker host: `packages/render-runtime/workers/geometry.worker.ts`. Comlink-wrapped. Pool of `hardwareConcurrency - 1`.
- Scene Committer v0: subscribes to `WallStore` → enqueues to worker → swaps THREE meshes on response.
- Frame Scheduler v0: single-owner rAF loop, dirty-flag reasons, idle continuation budget.
- Behind feature flag: `PRYZM_NEW_ARCH=walls`. Toggle in dev tools.

**Gate**: a project with 1,000 walls renders identically (visual diff < 1 px MSE) under the new path; cold-load improves ≥ 30% on the medium fixture.

---

### Phase 3 — Persistence v1: chunked binary, no server bake yet (weeks 12–18)

**Outcome**: projects load as event-log + per-level chunks; chunks generated client-side at save time (server bake comes in Phase 5).

- `packages/protocol`: chunk schema (glb + Draco + Meshopt).
- `packages/persistence-client`: manifest fetcher, range-request event reader, chunk loader.
- Save path: editor reduces store → groups geometry by level → writes glb chunks → uploads to R2 (or wherever).
- Load path: manifest → active-level chunk + first event segment → render skeleton + active level → background-stream the rest.
- Legacy importer (Phase 1 adapter) feeds this path so old projects open in the new format on first save (one-shot migration).

**Gate**: load-bench medium fixture cold-load < 3s end-to-end (target is 1s, we accept 3 here pending server bake); save round-trip preserves geometry.

---

### Phase 4 — Slabs, Roofs, Curtain Walls (weeks 16–24)

**Outcome**: all major primitives on the new path; legacy builders deletable for these types.

- Same playbook as Phase 2 walls, repeated for slab, roof, curtain wall, ceiling, floor, opening.
- Each primitive: 2–3 weeks of port + parity tests + visual diff.
- Run in parallel: each engineer owns a primitive; shared review.

**Gate**: feature flag `PRYZM_NEW_ARCH=all` flips on internally; all known sample projects render identically.

---

### Phase 5 — Server Bake Service (weeks 20–28)

**Outcome**: chunks are baked server-side, invalidated incrementally by event hashes.

- `apps/bake-worker`: Node 22 service. Imports `packages/geometry-kernel` directly.
- Subscribes to event-stream from sync server. Computes affected chunks per transaction. Bakes. Writes to object store. Updates manifest.
- Cache eviction: chunks older than N versions garbage-collected nightly.
- Editor save path stops baking client-side; client only appends events; the bake catches up within ~2 s.

**Gate**: load-bench large fixture (50k elements) cold-load **< 1s perceived** with warm CDN cache.

---

### Phase 6 — Sync Engine + Real-Time Collab (weeks 24–32)

**Outcome**: two users edit the same project live with awareness.

- `packages/sync`: Yjs document wrapping the event log; awareness protocol for cursors, selection, lock state.
- `apps/sync-server`: WebSocket relay (replaces / extends existing Socket.io). Linearizes events from all clients into the canonical log. Hands them to bake worker.
- Conflict resolution policy per command (last-write-wins / reject-after-delete / merge).
- Offline queue: IndexedDB-buffered events flushed on reconnect.

**Gate**: 3 users in same project, each editing different rooms, no conflicts; one user offline for 5 min then re-syncs cleanly.

---

### Phase 7 — Plugin Host + OBC Demotion (weeks 28–36)

**Outcome**: tools and importers loaded as plugins; OBC reduced to one IFC plugin.

- `packages/plugin-host`: manifest loader, dependency graph resolver, sandboxed activation.
- Convert wall/slab/roof tools to plugins (mostly mechanical — they're already isolated by Phase 2–4).
- `plugins/ifc-import`: wraps OBC + web-ifc; consumes IFC → emits PRYZM events. **OBC no longer in core.**
- Delete OBC imports from `ViewController`, `PlanViewManager`, `EdgeProjectorService`, `PlanViewService`. Replace with the Scene Committer interface.
- `plugins/ai-copilot`: AI features behind a plugin boundary, never on boot path.

**Gate**: viewer-only build (`apps/viewer`) excludes editor + AI plugins; bundle size < 800 KB gzipped.

---

### Phase 8 — Cutover & Decommission (weeks 32–40)

**Outcome**: legacy code deleted, single architecture in production.

- Migrate all live customer projects to the new format (one-shot batch on bake worker).
- Delete `apps/editor-legacy/`, the 264-class command tree, `EngineBootstrap.ts`, the legacy builders.
- Remove all `(window as any).*` cross-wiring. Lint rule enabled to ban it.
- Final docs sweep, public ADRs published, plugin SDK 1.0 release.

**Gate**: 30-day production observation with all targets in §13 of the architecture doc met.

---

## 3. Phase dependency DAG

```
P0  Foundation ──────────────┐
                             ├──► P1 Domain & Events ──┐
                             │                         ├──► P2 Walls (kernel + committer) ──┐
                             │                         │                                    ├──► P4 Slabs/Roofs/CW ──┐
                             └──► P3 Persistence v1 ───┘                                    │                       │
                                                                                            │                       │
                                                              P5 Server Bake ◄──────────────┴───┐                   │
                                                                                                │                   │
                                                              P6 Sync Engine ◄──────────────────┴───────────────────┤
                                                                                                                    │
                                                              P7 Plugin Host & OBC demotion ◄──────────────────────┤
                                                                                                                    │
                                                                                                       P8 Cutover ◄─┘
```

Critical path: **P0 → P1 → P2 → P4 → P5 → P6 → P7 → P8 ≈ 40 calendar weeks** of strict sequencing if you have only one pair. With 2 seniors split across tracks A and B, P3 overlaps P2, and P5/P6 can overlap once their dependencies settle, pulling total down to **32–36 weeks for the v1 viewer-quality system** and **40 weeks for full cutover**.

---

## 4. Roles & ownership

| Role | Responsibility | Allocation |
|---|---|---|
| Tech lead | Architecture review, gate enforcement, hiring next engineers, customer comms | 100% |
| Senior — Track A (foundation/render) | P0, P1, P2, P4, P7 | 100% |
| Senior — Track B (persistence/server/sync) | P0, P3, P5, P6 | 100% |
| Junior / contractor (optional, from week 12) | Per-primitive ports in Phase 4, plugin migrations in P7 | 50–100% |

The lead is **not** a third pair of hands; assume they write code 30% of the time, max.

---

## 5. Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Worker port of `WallFragmentBuilder` discovers hidden global reads not visible from current grep | Medium | High | P2 includes a 1-week spike at the start specifically to enumerate side effects before the port begins. |
| Server bake economics blow up (CPU cost) | Medium | Medium | Bake on edit, not on save; cache aggressively; measure $/project early in P5. |
| Yjs cannot represent some BIM operations cleanly | Low | High | P6 starts with a 1-week prototype of the worst-case operation (multi-user opening edit) before commitment. |
| Customers upgrade at different speeds → must support legacy + new in parallel | High | Medium | One-shot migration in P8 is opt-in initially; both editors coexist for 60 days. |
| Team is two seniors, one senior leaves | Low | Catastrophic | Tech lead documents architecture decisions weekly (ADR format); pairing on critical paths is enforced. |
| OBC removal in P7 reveals deeper coupling than the 105 import sites suggest | High | Medium | Spike in P0 to enumerate every OBC API touched, not just imports. |
| Browser WebGPU support stalls on Safari | Medium | Low | WebGL2 path is preserved end-to-end; WebGPU is upgrade, not requirement. |
| Scope creep ("while we're rewriting, let's also...") | High | High | Tech lead refuses non-goal features until P8 ships. Backlog only. |

---

## 6. Kill-switches and reversal

Each phase has an explicit kill-switch — if the gate is missed twice, the team **stops and reassesses**, not pushes through.

| Phase | Kill condition | Response |
|---|---|---|
| P2 | Wall parity fails after 6 weeks | Pair on the failing primitive; if still failing at week 8, reassess whether the kernel contract is right. |
| P3 | Cold load > 5s after 4 weeks (target was 3s) | Likely chunk granularity is wrong; refactor before adding more primitives. |
| P5 | Bake takes > 30s for a single wall change | Algorithmic problem in invalidation; halt P5, fix before continuing. |
| P6 | CRDT semantics produce incorrect state under stress | Halt P6; consider operational-transform alternative (centralized server) before committing. |
| P7 | OBC cannot be cleanly extracted | Keep OBC as a library dep; ship plugin host without that demotion in v1. |

---

## 7. Communication & documentation

- **Weekly** architecture review (lead + 2 seniors, 1 hour).
- **Monthly** customer-facing changelog of perf improvements (load-bench numbers visible).
- **ADRs** (Architecture Decision Records) committed to `docs/00_NEW_ARCHITECTURE/adrs/` for every non-obvious choice (CRDT choice, mesh format choice, bake granularity, etc.). One file per decision, ~1 page each.
- **Per-package READMEs** in the monorepo. The architecture document is the canonical reference; READMEs are for "how to run this package".
- **No tribal knowledge.** Anything not written down in `docs/00_NEW_ARCHITECTURE/` does not exist.

---

## 8. Success — what "done" looks like

By end of Phase 8 (week ~40):

1. `tools/load-bench` shows < 1s cold load on the 50k-element fixture, < 3s on the 200k fixture.
2. Multi-user collab works on a 5-person stress test with no observable conflicts on non-overlapping edits.
3. Idle CPU drops to < 1% when the scene is unchanged.
4. Edit-to-paint p95 < 33 ms.
5. Editor bundle is < 2 MB gzipped; viewer < 800 KB gzipped.
6. The legacy `EngineBootstrap.ts`, `ProjectSerializer.ts`, and 264 command classes are deleted from the repo.
7. Plugin SDK 1.0 published; one external developer can build a custom tool against documented APIs.
8. CI enforces architecture: layer boundaries, single rAF owner, no `(window as any).*`, perf budgets.

If those eight items are true, PRYZM is structurally a Forma/Qonic-class platform.
If any one is false, the rewrite was a re-paint, and the same audit will re-emerge in 18 months.

---

## 9. Anti-patterns the team must refuse

These are the patterns that produced the current state. They cannot be allowed back:

1. **Cross-wiring through `(window as any).*`.** If two modules need to talk, they go through the event bus or a typed dependency injection container. Period.
2. **Adding `requestAnimationFrame` outside `FrameScheduler`.** Lint rule enforces this. PRs are blocked.
3. **Creating a 19th wall command.** New behavior is either: (a) a new event type with handler, or (b) a plugin. Never a new bespoke class in a god-folder.
4. **`scene.add` outside the Scene Committer.** Same lint enforcement.
5. **Importing `three` from `packages/domain`, `packages/protocol`, or `packages/geometry-kernel`.** Boundary lint catches it.
6. **Skipping the load-bench gate.** No PR merges that regresses cold load by > 5% without an ADR explaining the trade-off.
7. **"Let's just unblock this with a flag for now."** Every flag has an expiry date in its declaration; CI fails when an expired flag is still in code.
8. **Treating AI features as boot-path infrastructure.** AI is a plugin, always.

These rules are the structural immune system. Without them, the new architecture decays into the old one.
