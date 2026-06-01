# PRYZM 3 — Consolidated Remaining Work (2026-05-29)

**This document supersedes** (sources archived to `archive/`):

- `DAILY-USE-AUDIT-2026-05-20.md` + `DAILY-USE-FIX-LOG-2026-05-20.md`
- `PRODUCTION-READINESS-AUDIT-2026-05-20.md` + `PRODUCTION-READINESS-FIX-LOG-2026-05-20.md`
- `PLAN-VIEW-INCREMENTAL-PROJECTION-ARCHITECTURE-2026-05-20.md`
- `PRYZM3-MASTER-STATUS.md`

**Method:** six parallel deep-reads of the source docs, deduped across overlapping IDs (U-Bx, L-Bx, S-Bx, B10–B13 appear in 2–3 places). Items marked DONE in any of the source fix-logs are excluded. Last verified against actual fix-log content + memory notes; cross-checked against git log since 2026-05-20.

Use this file as the single canonical to-do list for the remaining PRYZM 3 work. New rounds append a delta block at the bottom; closed items move to a "Closed since 2026-05-29" section below the active queue.

---

## §1 — Production-readiness Blockers (still open)

Single-week priority — data integrity, secret rotation, the slow boot/load tail.

| ID | Title | Notes |
|---|---|---|
| **B10** | Resilient-import quarantine + autosave-blocking modal | `ProjectLoader` keeps loading on element failures — silent data loss. |
| **B11** | Version-limit auto-prune / blocking UX | Partial: `§QUOTA-EVICT` (`8463607`) recovers from full localStorage by evicting OTHER projects' history; remaining work is the proactive prune UI + per-project version cap. |
| **B12** | CRDT conflict UI wired into adapter | Wire `CRDTConflictResolver.mergeElement` into `YjsDocAdapter.applyCommand`; surface `ConflictResolutionDialog` + Banner from `engineLauncher.ts:560`. |
| **B13** | Cursor-paginated catch-up + durable-insert-before-broadcast | Yjs late-joiner replay correctness. |
| **B15** | Dual handler-registration retire | Round 52 Proxy is interim; canonical retire still owed. |
| **B17** | PSO prewarm + EdgeProjector slicing | Closes the 11.5 s / 16.6 s freezes on first plan-view. |
| **B19** | Secret rotation (ops) | Operational, not code. |

## §2 — Production-readiness Highs (still open)

Two-week tier. Security hardening, observability, schema discipline.

- **H3** OAuth `state` CSRF nonce (needs server-side state store)
- **H5** JWT lifetime + refresh tokens (needs session-table migration to avoid logging everyone out on deploy)
- **H6** Marketplace plugin signature — server-side bundle SHA-256
- **H7** IFC upload streaming (multer + S3/disk)
- **H9** Remove in-memory anonymous fallback once §B14 hard-fail covers it
- **H13** Boot-time failed-registration banner (tracking list + DOM surface)
- **H17** Redis adapter for Socket.io + rate-limit + plan cache (OR explicit single-instance pin)
- **H19** OTel SDK install + OTLP exporter + pino structured logs (P8 spans currently emit to void)
- **H20** PITR backup for PG JSONB
- **H21** Per-room loop in `ImportProjectCommand`
- **H23** Strict Zod typing for save payloads (walls/slabs/doors/windows)
- **H24** Chunked snapshot save (wire `SnapshotStreaming` into save path)
- **H25** Snapshot `schemaVersion > current` hard-refuse
- **H27** Hoist `dbMigrate` import in 16 hot handlers
- **H28** Delete ~250 MB duplicate binary assets
- **H31** `(window as any)` ratchet plan (P4 finalisation)
- **H32** Cesium lazy-load
- **H37** 670 unsanitized `innerHTML` sweep + DOMPurify mandate

## §3 — Architecture migration (long range, 6–12 weeks)

- **H33–H36** Finish P6 migration (~12 of 500+ `commandBus` calls remain — primary residual P6 gap); widen GA-gate scope; reset ratchets; split `server.js` (4944 LOC god-file).
- **P4 finalisation** — ~15 residual production sites (OI-044 phase 2): `ViewportPreviewRenderer.ts` ×2, `ProjectScopedStorage.ts`, `ProjectScopeRegistry.ts`, `ViewIntentInstanceStore.ts`.
- **P8** — CRDT dormant + OTLP exporter not configured (spans emit to void). Pairs with H19.

## §4 — Daily-use Sprints (still open after Round 63)

### Sprint 1 — daily-use cliff-edges (2–3 days)

T-B1 polyline state evaporates on Split-View mouse-leave · T-B2 backspace deletes selected element mid-draw · T-B7 move tool exits after one move · C-B1 zoom-fit/zoom-selected dead buttons · C-B2 plan camera "fit all" after every commit · C-B3 100 m maxDistance hard cap · C-B4 maxPolarAngle clamp · M-B1 wall+slab system-type IDs regenerate on save/load · T-H5 furniture rotation hard-coded at 0 · T-H7 door 1.5 m radius · L-B3 standalone slab/floor opening restore.

### Sprint 2 — undo/redo + collab silent-loss (3–4 days)

U-B1 ring-buffer not cleared on project switch · U-B2 `runtime.bus.dispatch` undefined → CRDT broken · U-B5 empty PatchPair on `element.delete` · L-B2 `If-Match` 412 not sent · L-B1 quarantine modal (overlaps B10) · S-B1 wire ConflictResolutionDialog (overlaps B12) · L-H2 `sendBeacon` for beforeunload.

### Sprint 3 — material fidelity + view UX (3–4 days)

M-H1 wall/roof/CW materialId resolution (CW closed in Round 51, others remain) · M-H2 plan-edge hard-black colour (deferred with architectural rationale) · M-H4 door/window custom types persist · preserve selection across views · C-H1 triple-dispatch on canvas click · C-H7 marquee in plan.

### Sprint 4 — polish (1+ week)

T-H3 stair gizmo silent no-op · T-H6 column type ignored in plan · T-H2 backspace handler inconsistency · U-H6 multi-select Delete · U-H7 slab cascade delete · view template / view creation / section · S-B2 export PDF/DXF (`window.print()` stub → real plugin) · S-B3 multiplayer cursor.

### Daily-use Highs/Mediums not in any sprint (long tail)

T-H1, T-H8, T-H9, T-H10 · U-H8, U-H9, U-H10, U-H11 · L-H1, L-H3, L-H4, L-H5, L-H6, L-H7, L-H8, L-H9 · C-H2, C-H3, C-H4, C-H5, C-H6, C-H8 · M-H3, M-H5, M-H6, M-H7 · S-H1–S-H8 (snap + dimension dual systems + annotation cmdMgr).

### Daily-use fix-log carry-overs (deferred section)

- **Round 17 follow-ups:** `RoofPathToolHandler`, `StairPathPlanToolHandler` — same one-liner pattern.
- **Round 24 §FURN-3D-RESILIENCE:** awaiting architect's logged error.
- **STAIR-PLAN-DI TODO** in `apps/editor/src/types/globals.d.ts`.
- **Round 7 §FIX-VDT-DUAL-PATH Part 2** — per-undo redetect storm (~80 ms LONGTASK).
- **#47** WebGPU `Destroyed ShadowDepthTexture` on project-load hang.
- **#48** RoomTopologyObserver forced-fire after unpause.

## §5 — Plan-view incremental projection (architecture)

Per-element projection cache widened from curtain-walls only to all element types. Current status: **16/18 element types in cache** (memory note `session-2026-05-20-21-40-rounds`). Two remain:

- **`opening`** — not yet cached.
- **`stair-railing`** — not yet cached.

Contract amendments still pending sign-off: C04 §3.4 element-level dirty contract; C11 §6.2.1/§6.2.2 per-element projection cache + version-stamp invariant; C10 NFT-PV-1 (≤ 16 ms p95 plan-view element-add latency).

Open question (§9 of source doc): if HiddenLineRemoval becomes the new bottleneck after this lands, make it incremental too (segment-intersect dirty element only, not the full N×N pass).

## §6 — Master-status open items register (OI-007–OI-058)

- **OI-007** IFC streaming LONGTASK 253 ms (3–7 FPS drop) — P2, post-GA.
- **OI-008** WebGPU prewarm 2909 ms vs < 1500 ms target — P3.
- **OI-009** `engineLauncher.ts` bundle 4.3 MB — P3.
- **OI-050** CustomEvent migration — 598 total remaining. Last sub-completed = `F.events.19`. Gate #17 packages ratchet: `input-host` 41, `core-app-model` 35, `ai-host` 22, `runtime-composer` 1 comment. Gate #21 apps ratchet: 28 deep DOM-only.
- **OI-053** Project create + open slow — (a) eliminate double handler reg (Round 52 interim), (b) profile/rAF-slice 844 ms + 1008 ms blocks, (c) defer DataWorkbench / Portfolio / AI panels off cold-boot, (d) RenderPipelineManager phase-ramp churn, (e) project-create latency review.
- **OI-054** Hosted door/window two-part undo (followup-a); cross-stack redo ordering / ADR-051 single-store end-state (followup-b).
- **OI-056** Auto-zoom on first plan-view element creation — queued 2026-05-24.
- **OI-057** Post-batch wall-join: sound but timing-implicit + no test; plugin-store keeps pre-miter baselines — backlogged.
- **OI-058** Scene Registry (pascalorg pattern) to replace `scene.traverse` for visibility/selection — highest-value architectural key, open.
- **OI-011–016** Infrastructure-only (npm publish SDK + headless, DNS marketplace.pryzm.app, Stripe keys, Yjs WebSocket server, OTLP endpoint) — awaiting credentials/registrar.

## §7 — Apartment-layout pipeline (queues — see companion doc)

Detailed status + remaining work in **`APARTMENT-LAYOUT-STATUS-2026-05-29.md`**. Summary of open items here:

- **multi-apartment-floor-plate-brief** — new feature scope (shared core, N apartments per floor, structured JSON output).
- **single-apartment-fix-pass-spec** — failures #1 (kitchen merged) + #3 (master over-allocated) + #4 (sealed-room diagnostic) closed; #2 (corridor connectivity) + #5 (NO windows engine) remain.
- **apartment-furnish-quality-wishlist** — floor finishes + kitchen-fridge + island shipped; remaining: proper lighting (task lights), wardrobe variants, professional layout (slicing-tree), corridors quality, illogical-connection post-pass.
- **program-rules-improvements-queue** — #1a (WC), #2 (bath corridor-only), #3 (size-scaled weights), #6 (adjacency preference) shipped; remaining: #1b (balcony/storage/open_plan room types), #4 (desk/desk_chair FurnitureKind stubs), #5 (asymmetric door access — accessTo field).

## §8 — Wall-junction defects (geometry-wall package)

Owned by the geometry-wall package, not the apartment-layout engine. All P2 or P3 unless flagged.

- **Defect #3 L-corner** — interior↔exterior L-corner junction still produces a black-triangle artefact (`apartment-pre-existing-door-and-wall-finish` memory note).
- **WallJoinResolver multi-cluster degenerate-wall bug** (project zse, 2026-05-29) — `walljoinresolver-multi-cluster-bug` memory note. Phantom 3D spike + project re-open hang. Fix path: flag self-cluster walls INVALID + skip mesh build; clamp diff-thickness butt-join when sub-wall length ≤ 0.
- **Interior-wall-on-opening conflict bug** (2026-05-29) — `interior-wall-on-opening-conflict-bug` memory note. Interior partition terminates inside an exterior window/door → mesh clip + degenerate junction. Fix path: `WallOccupancyStore.canPlace()` check at commit + SnapManager exclusion + new Tier-1 ConstraintEngine rule.
- **ADR-0055 P4** — `P4a` (layered walls) + `P4b` (openings) + `P4c` (retire infill) backlogged. `P3b` already covers the apartment generator's plain-partition production case.

## §9 — Post-GA / long-range (P3)

- WCAG 2.1 AA (TASK-20).
- Multi-model IFC federation.
- GeoJSON / SHP geospatial import.
- SharedArrayBuffer geometry transfer.
- WebGPU mobile fallback (rendering gap).
- Family builders off main thread (threading gap).
- Multi-day offline merge (persistence gap).
- Dependabot + deploy pipeline (CI/CD gap).

## §10 — Operator / non-code tasks

- `git rm --cached '*.tsbuildinfo'` (still on the books).
- Retro `ALTER TABLE` for §H22 FK on existing prod DBs.
- `pnpm up jspdf` lockfile regeneration (B16 sub-task).

---

## Closed since 2026-05-29 (this doc replaces the source files)

This block grows as items close. Cross-reference commit hashes to `git log` on the working branch.

- `4d1f450` §WC room type — closes program-rules #1a.
- `4e2d444` §AREA-FRACTIONS — closes single-apartment-fix #3 + program-rules #3.
- `58ccd3f` §BATH-CORRIDOR-ONLY — closes program-rules #2.
- `2244585` §KITCHEN-DISTINCT — closes single-apartment-fix #1.
- `587f7b0` §ADJACENCY-PREFERENCE — closes program-rules #6.
- `7623221` §SEALED-ROOMS — partial diagnostic for single-apartment-fix #4.
- `8463607` §QUOTA-EVICT — partial close of B11 (recovery path; proactive prune still open).
- `8028640` §SKEL-MATCH — closes landing-skeleton mismatch.
- `97417be` §FLOOR-FINISH — partial close of furnish-quality wishlist.
- `77416c0` §KITCHEN-DEFAULT-APPLIANCES + `550e30a` §KITCHEN-ISLAND — close furnish-quality kitchen items.
