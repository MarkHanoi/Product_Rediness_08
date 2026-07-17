# PRYZM — Category-Readiness Audit (Professional Collaborative BIM/CAD bar)

**Date:** 2026-07-17
**Auditor bar:** Arcol / Motif / Snaptrude / Qonic / Hypar / Forma — files become construction/legal documents; the bar is DATA INTEGRITY and COLLABORATION CORRECTNESS, not feature count.
**Method:** Read-only. Evidence is `file:line` + pasted literal code/output. Anything not confirmable from code/output is marked **UNVERIFIED** (not a pass).
**Scope note:** Another agent (Batch 2) was mid-edit on `apps/editor/src/rendering/createRenderer.ts` at audit start (git status showed `M`); it appears committed by end of audit. Renderer specifics below are a snapshot.

---

## 1. Data integrity & durability

### 1.1 The full save path (traced)

1. **User edit → in-memory stores.** Mutations dispatch DOM events (`bim-wall-added`, `bim-store-mutated`, …).
2. **Reactive trigger.** `apps/editor/src/ui/platform/SaveOrchestrator.ts:59-81,238-344` subscribes to ~40 mutation events, debounces (`DEBOUNCE_MS = options.debounceMs ?? 2500`, line 189), hash-compares to skip no-ops (line 317-323), and calls `onAutoSave()`.
3. **Serialize.** `apps/editor/src/engine/persistence/ProjectSerializer.ts` (a second near-identical copy lives at `packages/persistence-client/src/loader/ProjectSerializer.ts`) — `ProjectSerializer.serialize()` walks every store `getAll()` and strips THREE.js to plain JSON. `SNAPSHOT_SCHEMA_VERSION = 5` (packages copy line 74).
4. **localStorage (sync) + IndexedDB.** `onAutoSave` writes to localStorage synchronously (ProjectRepository) then enqueues server sync.
5. **Server sync queue.** `apps/editor/src/ui/platform/ServerSyncQueue.ts` — `enqueue()` (267) → `attemptSync()` (417) POSTs `/api/projects/:id/versions` with `X-Idempotency-Key` (429) and optional `If-Match: "v${count}"` (432).
6. **Server persist.** `server.js:3172` `POST /api/projects/:id/versions`.

### 1.2 What validates the data before it's trusted — thin

Server-side (`server.js:3172-3246`), before persisting:
- **Size cap only:** `const SNAPSHOT_LIMIT_BYTES = 50 * 1024 * 1024;` (3199) → `SnapshotTooLargeError` (3201-3206).
- **Zod validation is `.passthrough()` and validates ONLY the furniture array strictly:**
```js
// server.js:3236-3239
const snapshotSchema = z.object({
    furniture: z.array(furnitureSchema).optional(),
}).passthrough();
const validation = snapshotSchema.safeParse(snapshot);
```
Walls, slabs, doors, windows, stairs, roofs, columns, beams, curtain-walls, rooms, levels, grids, the semantic/temporal graphs — **none are validated**. A snapshot with corrupt/missing walls persists as HTTP 201 success.

### 1.3 Where a write can silently fail / drop elements

- **Serializer silently drops records:** `ProjectSerializer.ts:688-698` filters degenerate room-bounding-lines (`console.warn` only). `deepStrip` heuristics (packages copy 358-382) infer THREE types by duck-typing; a mis-detected field is silently reshaped.
- **Sync queue drops on quota / plan-gate:** `ServerSyncQueue.ts:276-279` "Queue full — dropping oldest item"; `enqueue` short-circuits to `local-only` when `_planRejectsSync` (268-271) — **free plan gets ZERO server versions** (`VERSION_LIMITS = { free: 0, ... }`, server.js:3258; 403 at 3268-3274). A free-plan user's only durable copy is localStorage/IndexedDB on one browser.
- **412 loser kept local-only:** `ServerSyncQueue.ts:481-529` — a concurrent-edit 412 preserves the local snapshot as `local-only` and drops it from the sync queue; the user must manually reload/export. Not lost, but silently un-synced.

### 1.4 Corruption detection — **NONE currently in source (checksum reverted after it bricked projects)**

- L-334 (`docs/04-reference/V1-LAUNCH-READINESS-AUDIT.md:480`) is the CRITICAL launch-blocker: *"silent element-loss is reported as SUCCESS, there is no whole-snapshot validation, no quarantine of dropped records, and no checksum anywhere."*
- A checksum WAS added, then **L-360** (`:506`) — *"The L-334 snapshot CHECKSUM hard-REFUSES valid projects, bricking them"* (`§L-334 CORRUPT snapshot (checksum-mismatch) — refusing to load`, real 1009-element project). It was then reverted:
  - `grep computeSnapshotChecksum|SnapshotChecksum` over all `**/*.ts` → **"No files found."**
  - `grep checksum|CORRUPT|refusing to load` over `ProjectLoader.ts` → **"No matches found."**
  - The only surviving mentions of `computeSnapshotChecksum` are in `docs/.../V1-LAUNCH-IMPLEMENTATION-PLAN.md:3280` marked **"Status: FIX IN PROGRESS."**
- **Net state:** no checksum, no integrity hash, no round-trip verification, no element-count reconciliation between save and next load. Corruption/element-loss surfaces only when a user notices missing geometry. This is the single biggest data-integrity gap and it is a KNOWN open blocker (L-334).

### 1.5 Versioning & migration

- Persisted format carries `schemaVersion` (currently 5). `MigrationEngine.migrate()` (`apps/editor/src/engine/persistence/MigrationEngine.ts:233-269`) runs additive v0→v5 steps.
- **Forward-compat is load-anyway:** `MigrationEngine.ts:241-248` — a snapshot with `schemaVersion > 5` logs a warn and returns unchanged ("some fields may be ignored or unsupported"). A newer-client project opened on older code loads with silent field loss.
- **Migration is UNTESTED:** no `MigrationEngine*.test`/`snapshotMigration` file exists (`find` returned none). `apps/editor/__tests__/projectRepositoryMigration.test.ts` tests only localStorage→IndexedDB thumbnail/version migration (`describe('warmThumbnailCache …')`, `warmVersionCache`), NOT snapshot schema upgrade. The v0→v5 path has **no automated coverage**.
- Semantic-format migrations exist (`migrations/VGToIntentMigration.ts`, `ViewTemplateToIntentMigration.ts`) — coverage UNVERIFIED.

### 1.6 Backup & restore

- Contract `C48-BACKUP-AND-DR.md:4` mandates: *"A backup nobody can restore is not a backup — every retention policy is paired with an end-to-end restore test that runs on the same cadence as the backup itself."*
- **No end-to-end restore has ever been run.** `docs/04-reference/runbooks/DR-DRILL-RUNBOOK.md:340`: *"It does **not** claim a real production drill has been executed at S69 close — drill #0 is the runbook authoring itself; drill #1 is scheduled S70 D8."* Line 342: *"does **not** cover full WAL-archive PITR — §3.5 documents the procedure but ADR-0049 §F admits WAL archiving is not yet wired (M37+ post-GA)."* Line 139: `echo "PITR is a documented but not yet wired procedure"`.
- Actual backup mechanism (frequency/retention) beyond Fly/Supabase managed Postgres snapshots: **UNVERIFIED** — no `pg_dump` cron or retention job found in server code; the runbook assumes an operator runs `pg_dump` manually against `DATABASE_URL`.

**Verdict §1: GAP (critical).** No corruption detection in source, only furniture is server-validated, migration untested, restore never drilled.

---

## 2. Real-time collaboration correctness

### 2.1 There are TWO collab mechanisms; the one with conflict-resolution is not wired to a network

**A. The advertised CRDT path (Yjs + 3-way conflict resolver) — has NO network provider in production.**
- `packages/sync-client/src/YjsDocAdapter.ts` builds a local `Y.Doc`; `CRDTConflictResolver.ts` implements 3-way merge + conflict descriptors (silent LWW "FORBIDDEN" per C08 §3.1, file header lines 3-14).
- `engineLauncher.ts:817-838` constructs `new YjsDocAdapter(projectId)` **with no provider** and wires it to the CommandBus applier (L-375a fix, `runtime.bus.setCrdtApplier`).
- **No `WebsocketProvider`/`WebrtcProvider` is ever instantiated in production code:** grep for `new WebsocketProvider|setProvider|\.connect\(\)` across `packages/ apps/editor/ src/` → only commented examples (`packages/sync-client/README.md:46` "production wiring at S43 D1", `SyncClient.ts:165` commented). `YjsDocAdapter._provider` stays `null` (`YjsDocAdapter.ts:232`).
- **The Yjs sync server is NOT deployed:** `apps/sync-server` and `apps/api-gateway` exist but are absent from `fly.toml`, `Dockerfile`, and `.github/workflows/`. Fly runs a **single process**: `fly.toml:36 primary_region = "fra"`, `processes = ["app"]`, `Dockerfile:171 CMD ["node", "./dist/index.cjs"]`. `fly.toml` comment: *"Multi-process (e.g. separate websocket worker) would need [processes] above."*
- **Consequence:** the Y.Doc never receives remote ops → `_detectBatchConflicts` / `CRDTConflictResolver` / the conflict banner **never fire in production**. The e2e test admits this: `tests/e2e/crdt-batch-conflict.spec.ts` header: *"Full two-browser simulation … requires a shared Yjs WebSocket server — not available in Replit CI without additional infra."* → real CRDT convergence is **UNVERIFIED end-to-end**.

**B. The path that actually runs in production: socket.io command rebroadcast (last-write-wins).**
- Client emits `command-executed` (`initCollaboration.ts:26`, socket wiring 512).
- Server `server.js:534-599`: validates payload + room membership, best-effort logs to `project_command_log` (non-blocking, 552-574), then `socket.to('project:'+id).emit('remote-command', ...)` (599).
- Client applies via `RemoteCommandDispatcher.dispatch()` (`apps/editor/src/engine/RemoteCommandDispatcher.ts:157`). The ONLY conflict handling is **duplicate-create suppression** (`:100-172` `skipped-duplicate`). Concurrent **move / property-edit / delete** of the same element are applied in arrival order = **silent last-write-wins**. There is no 3-way merge on this path.

### 2.2 Per-mutation-type conflict handling

| Mutation | Production behaviour | Evidence |
|---|---|---|
| create | idempotent (duplicate id skipped) | RemoteCommandDispatcher.ts:100-172 |
| move | **silent LWW** (apply-in-receipt-order) | RemoteCommandDispatcher.ts:157 (no merge) |
| property-edit | **silent LWW** | same |
| delete | **silent LWW** | same |
| whole-project version save | optimistic lock 412 → loser kept `local-only`, must reload | ServerSyncQueue.ts:481-529 + server.js:3181-3192,3343-3356 |

The only real conflict surface is coarse whole-project version granularity via `If-Match`/412 — not per-element. The advertised per-element CRDT conflict UX is dead code in prod.

### 2.3 Project / tenant isolation

- `ProjectIsolationAudit.ts:1-4` is a **runtime tripwire** (console.warn on `pryzm-project-loaded`), self-described: *"runtime tripwire for project-isolation leaks."* It is not a guarantee.
- A test exists: `packages/core-app-model/src/persistence/ProjectIsolationAudit.test.ts` (asserts the tripwire logic), but isolation leaks are historically recurring: **L-224, L-238, L-325, L-342** are all "reminiscencia from the previous project" data-integrity items (`V1-LAUNCH-READINESS-AUDIT.md:372,386`). GPU/render-registry isolation is a runtime audit, not a passing multi-session test.

### 2.4 Dropped-websocket / two-users-same-element / 60s reconnect

- Reconnect catch-up exists: `GET /api/projects/:id/command-log?after=cursor` (server.js:3523) + `RemoteCommandDispatcher.applyCatchUp` (`:272-301`).
- **No automated two-browser test** exercises dropped-ws-mid-edit, two-users-same-element, or 60s-offline-reconnect — the CRDT e2e is single-context structural only (see 2.1). **UNVERIFIED.**

**Verdict §2: GAP (critical).** Production collab is socket.io last-write-wins; the CRDT/conflict-resolution system is not network-connected (sync-server undeployed, no provider). Multi-user correctness is UNVERIFIED and, for move/edit/delete, silently LWW.

---

## 3. Performance at real scale

### 3.1 Is "real project size" written down?

Partially. The office target (40 storeys / ~2000+ elems) drives L-361/366/376. The heavy-scene predicate is codified: `packages/core-app-model/src/rendering/LevelScoped3DCullingService.ts:153,160,167,180-186`:
```ts
const HEAVY_MODEL_LEVEL_THRESHOLD = 15;
const HEAVY_MODEL_ELEMENT_THRESHOLD = 1000;
const HUGE_MODEL_ELEMENT_THRESHOLD = 4000;
export function isHeavyModel(levelCount, elementCount) {
  return (levelCount >= 15 && elementCount >= 1000) || elementCount >= 4000;
}
```
C10 defines NFTs/observability but no single "supported max element count" SLA was found (grep C10 for element-count returned only §BUILD-TOAST). Target is **implied, not an SLA.**

### 3.2 Benchmarks — headless proxies, ~2 months stale, NOT real GPU

From `apps/bench/.run-output/` (all recorded 2026-05-09):
- `frame-budget.json`: p50 **0.005 ms**, p95 0.0075 ms, target 16.6 ms — but `"notes": "headless proxy … Measures FrameScheduler drain overhead (FakeRafAdapter, no GPU). Full 60-FPS frame budget including GPU is measured in apps/editor-bench/ (Wave 13)."` → **does not measure real render.**
- `load.large.full.json`: p50 0.571 ms / p95 2.576 ms vs budget 12000 ms (5 samples).
- `load.large.parse.json`: p50 19.0 ms / p95 31.4 ms vs 600 ms.
- `largest-model.produce.json`: p50 165.6 ms / p95 185.8 ms vs 9000 ms.
- `ifc-import-tier1.json`: p50 1347 ms (500 in-memory DTOs), `"headless proxy … Full tier-1 import including web-ifc WASM decode is in apps/editor-bench (Wave 13)."`
- `cold-load-real.json` large: cold 336 ms, warm p95 538 ms vs budget 1500 ms.

**These pass their budgets but the budgets are for synthetic in-memory proxies with no GPU.** The real-scale numbers that matter (GPU frame time at 40 storeys / ~2000 elems, real IFC WASM decode) live in an `apps/editor-bench` browser harness whose recent output was **not found in `.run-output/`** → **real-scale perf is UNVERIFIED here.** Live evidence contradicts the synthetic pass: L-369 (`:517`) "generation … tens of seconds for ~6-storey / ~580 elems", L-372 "process is slow", L-361/366 WebGPU device-loss on real buildings.

### 3.3 Degradation + user signal

- Auto-escalation to massing LOD at `isHeavyModel` (silent — no user message; `LevelScoped3DCullingService.ts:299`).
- Auto-WebGL swap reuses the same predicate (ADR-0267 / L-362). **Gap already tracked (L-366, `:522`):** a ~1300-elem/6-level resi building does NOT trip `isHeavyModel` (6<15, 1300<4000) → WebGPU device-loss with no fallback.
- User signal on generation drops exists: `C10 §BUILD-TOAST` surfaces dropped-element counts in the completion toast. But the "your model is too heavy, switching backend" event flickers the loading overlay (L-367, `:528`).

**Verdict §3: UNKNOWN / GAP.** Synthetic benches pass; real-scale GPU perf is UNVERIFIED and live logs show it degrades badly. Heavy-model auto-fallback has a known hole (L-366).

---

## 4. Import/export & interop fidelity

### 4.1 Formats (from `packages/file-format/src/`)

| Format | Import | Export | Round-trip test? |
|---|---|---|---|
| IFC | `import/ifc/` (web-ifc) | `export/ifc/` (IFC4X3-RV per memory) | **NONE found** |
| DXF/DWG | `import/dxf/` (`DxfParser.ts`) | — | **NONE** (import-only) |
| Rhino/3dm | `import/rhino/` | — | **NONE** (import-only) |
| GLB/GLTF | — | `export/glb/` | export-only tests: `glb-export-*.test.ts` |
| PDF/Image | `import/PDFToImageConverter.ts`, `ImageToImportConverter.ts` | — | n/a (underlay) |
| Sheets | — | `export/sheets/` | — |
| BCF | (issue exchange) | `bcf-roundtrip` bench | `bcf-roundtrip.json` p50 9.6 ms (write→read, 50 topics) — the ONE real round-trip |
| `.pryzm` family | pack/unpack | pack | `family-round-trip.test.ts`, `roundtrip.test.ts` (family/chunk format, NOT IFC/DXF) |

### 4.2 Round-trip fidelity

- **No IFC import→export→re-import comparison test exists.** The only `*roundtrip*` tests are family-format, chunk, schema, sync-event, and BCF — none is IFC or DXF geometry fidelity.
- IFC/DXF/Rhino round-trip fidelity is therefore **assumed, not verified** — the highest-stakes interop claim for a BIM tool is UNVERIFIED.

### 4.3 Malformed / adversarial input

- Server rejects oversize snapshots (50 MB, server.js:3199) and malformed furniture (Zod, 3240).
- Client-side IFC/DXF parser hardening (truncated/adversarial file → reject vs crash vs silent drop): **UNVERIFIED** — parse-guard code in `DxfParser.ts`/web-ifc wrapper not read in this pass. Needs a human to feed a corrupt IFC/DXF and observe.

**Verdict §4: GAP.** Broad format support, but zero geometry round-trip tests for the load-bearing formats (IFC/DXF/Rhino). Adversarial-input behaviour UNVERIFIED.

---

## 5. Auth, access control, multi-tenant security

### 5.1 Enforcement coverage

- **REST project routes** use `authMiddleware` (e.g. `server.js:3172 app.post('/api/projects/:id/versions', authMiddleware, …)`, GET versions 3039, version detail 3591). Project-id format validated (`isValidProjectId`, 3175). Ownership enforced server-side inside the atomic RPC / `createVersionTransactional` (`server.js:3411-3419` GAP-03 owner read-back; 3476-3480 in-memory).
- **Socket.io** gates on join: `server.js:466-521` — `join-project` runs `canUserAccessProject` and is *"the only gate that joins the socket to project:${projectId}"*; every other socket mutation checks `_socketInProjectRoom` first (`command-executed` 542-545; `vi:*` 604; `cursor-move` 630). This is enforced, not assumed.
- **Mutating routes WITHOUT authMiddleware:** `POST /csp-report` (339), `POST /leads` (345), `POST /overpass` proxy (357), `POST /api/event-log` (3970). The first three are benign telemetry/proxy; `/api/event-log` unauthenticated write is worth a look — **UNVERIFIED** whether it can be abused to write another tenant's log.

### 5.2 Share / embed links

- `GET /embed?projectId=X&token=Y` (`server.js:4557-4595`) serves a public HTML shell with `X-Frame-Options` removed and `frame-ancestors *` (any site can iframe it). The route itself does **no server-side token validation** — it echoes `projectId`/`token` into the DOM; enforcement is deferred to the client/API layer. Whether the `data-token` grants view-only vs edit, and single-project vs account-wide, is **UNVERIFIED** — the token→access mapping was not located. Leaked-link blast radius is unconfirmed → treat as a real risk until verified.

### 5.3 Audit trail (per-user attribution)

- Version rows persist `created_by: req.auth.userId` (`server.js:3434`). `version_audit_log` table read via `GET /api/projects/:id/versions/:vid/audit` (4196-4216).
- Command log persists `user_id` per command (`server.js:558`), but is purged after 24h (probabilistic cleanup 578-596) → **not a durable audit trail.**
- `TemporalGraph` persists mutations with `sessionId` (`ProjectSerializer` temporalGraph), not necessarily a stable userId — per-user attribution of individual element edits over time is **partial / UNVERIFIED.**

**Verdict §5: PARTIAL/GAP.** Core REST + socket paths enforce access; embed-link token semantics and durable per-user audit are UNVERIFIED.

---

## 6. Compliance & data handling

- **Region / residency: documented.** `fly.toml:22-36`: `primary_region = "fra"` (Frankfurt) — *"Mandated by C22 §1.3 (PII data-residency hard reject on bucket-region mismatch) + C49 §1.2 (EU primary) + C49 §1.13 (GDPR for EU/UK)."* *"Do NOT add a US peer region without a contract amendment."* This is answerable to a customer.
- **Incident response: runbooks exist** (`docs/04-reference/runbooks/`): `DR-DRILL-RUNBOOK.md`, `RUNBOOK-ACCIDENTAL-DELETE.md`, `RUNBOOK-DB-PRIMARY-FAILURE.md`, `RUNBOOK-RANSOMWARE.md`, `RUNBOOK-REGIONAL-OUTAGE.md`, plus an `incidents/` dir. Cadence "quarterly" (DR-DRILL §290).
- **BUT** — as in §1.6, no drill/restore has actually been executed; breach/data-loss on-call rotation/alerting existence is **UNVERIFIED** (no PagerDuty/Opsgenie config found).

**Verdict §6: PARTIAL.** Residency solid + runbooks written; execution/on-call unproven.

---

## 7. Infrastructure resilience

- **DB pool:** `server/pgClient.js:84-89` `new Pool({ max: 10, idleTimeoutMillis: 30000, connectionTimeoutMillis: 10000 })`; per-connection `statement_timeout = 60s` + `idle_in_transaction_session_timeout = 30s` on direct connections (91-104). **max 10** connections — on saturation, acquire fails after 10 s (`connectionTimeoutMillis`) → request errors (fail-closed). A prior saturation cascade is documented and mitigated client-side by the `ServerSyncQueue` circuit breaker (`ServerSyncQueue.ts:38-51,341-351` — opens after 5 consecutive failures, 30 s cooldown).
- **PG-degrade fallback:** `server/pgClient.js:251-278` §SERVER-PG-DEGRADE — when PG can't connect, requests fall through to an **in-memory** project store rather than a permanent 503 (fixes the L-503 migration-gate deadlock). In-memory means non-durable writes during degrade → data-loss risk window (fail-open to volatile store).
- **Third-party:** CF Worker AI relay degrades gracefully (`server.js:157-162,267-268` "AI features disabled" when no `CF_WORKER_URL`/`ANTHROPIC_API_KEY`). Overpass has a same-origin proxy + server cache (`server.js:46,347`, apiLimiter). Timeout/retry semantics per external call: **partially UNVERIFIED.**
- **Health checks:** `server.js:2117` `/api/health/live` (no DB, always 200), `2118-2127` `/api/health/ready` (SELECT 1, 503 on db-error), `2129` `/api/health` (schema + FK invariant). `Dockerfile:166` `HEALTHCHECK curl /api/health/live`. Good.
- **Alerting on those health checks / status page:** **UNVERIFIED** — no alerting integration found; Fly will restart on failed healthcheck but customer-facing status page / paging is not evidenced.

**Verdict §7: PARTIAL.** Pool caps + breaker + health endpoints are real; degrade-to-in-memory is a durability hole; alerting UNVERIFIED.

---

## 8. Browser/device reality

- **Tested browsers:** `playwright.config.ts:28-30` — `chromium` (Desktop Chrome), `firefox` (Desktop Firefox), `webkit` (Desktop Safari). **No mobile/tablet device projects** (no `devices['Pixel 5']`/`iPhone`). Desktop-only automation.
- **WebGL/WebGPU fallback exists in code:** `apps/editor/src/rendering/createRenderer.ts` — backend states `'webgpu' | 'webgl-fallback' | 'webgl-only'` (header 37-60), `tryCreateWebGPURenderer` prefers WebGPU, falls back to WebGL2, then plain `WebGLRenderer`. Batch 2 just shipped the `webgl-only` heavy-gen path (live bundle `main-0uKZoCNG.js` per coordinator).
- **Real-hardware verification is one machine.** Per project memory, the founder's Windows box forces WebGL — that is the ONLY real GPU-hardware verification. WebGPU on real hardware repeatedly device-loses (L-361/366/372). A low-end-GPU / broad-device matrix is **UNVERIFIED** (coded, minimally exercised).
- **Tablet/mobile (even read-only):** no device tests, no `isMobile`/touch gating found in this pass → **UNVERIFIED**; likely breaks or is unsupported.

**Verdict §8: GAP/UNVERIFIED.** Desktop-3-browser automation only; fallback coded but real-device coverage is effectively one Windows box.

---

## 9. Observability

- **P8 OTel spans are created everywhere** via `@opentelemetry/api` `trace.getTracer().startSpan()` (e.g. `CRDTConflictResolver.ts:18,61,114,146,174`). CI enforces the "≥1 span per exported fn" mandate.
- **But no OTel SDK tracer PROVIDER is registered** — grep for `NodeTracerProvider|WebTracerProvider|BasicTracerProvider|provider.register|@opentelemetry/sdk-trace` across `packages/ apps/ server.js` returns only a **devDependency** in `packages/persistence-client/package.json:40`, no runtime registration. Without a registered provider, `@opentelemetry/api` returns a **no-op tracer** → **spans go nowhere.** `server.js:2172` merely reports `OTEL_EXPORTER_OTLP_ENDPOINT` config in the health JSON; no exporter is wired. `CostMeter.ts:18`: telemetry pipeline "*when* … is provisioned" (future). **P8 spans are local/no-op, NOT exported.**
- **Error reporting is Noop:** `packages/crash-reporter/package.json:4` — default `NoopCrashReporter`; *"Real Sentry/GlitchTip backend binding deferred to S48 D9 launch."* `CrashReporter.impl.ts:34-37` "Sentry adapter not yet shipped." `ViewportCrashGuard.ts:229` guards on `window.Sentry` which is only a CDN placeholder (`src/global-window.d.ts:372`).
- **Server logging = `console.log`/`console.warn`** to Fly stdout (no pino/winston structured logger found on the hot paths). Fly retains stdout; no aggregation/alerting.
- **Save-integrity monitoring:** none. If a project silently corrupts in prod today, there is **no active alert** — discovery is user-report only.

**Verdict §9: GAP (critical for a data-integrity product).** Spans exist but export nowhere; crash reporting is Noop; corruption is invisible until a user complains.

---

## 10. Recoverability & support ops

- **Version-restore UI exists:** `PlatformVersionController.ts:327 loadVersion()` + version list (149) + preview mode. A support engineer can walk a customer to a prior version IF one synced to the server (free plan has none — §1.3).
- **Runbook for "project is gone" exists:** `RUNBOOK-ACCIDENTAL-DELETE.md` + `RUNBOOK-DB-PRIMARY-FAILURE.md`. So week-1 support is not fully improvised.
- **But restore has never been drilled** (DR-DRILL §340), PITR is not wired (§342), and free-plan projects live only in one browser's IndexedDB/localStorage — if that browser is lost, there is **nothing to restore.**
- Local recovery: IndexedDB versions + emergency `beforeunload` localStorage flush (`SaveOrchestrator.ts:353-374`) + sync-queue replay across sessions (`ServerSyncQueue.ts:674-694`). Solid for same-browser recovery only.

**Verdict §10: PARTIAL.** Restore tooling + runbooks exist on paper; the restore path is unproven and free-plan durability is single-device.

---

## Summary (ranked by month-one public-incident / lost-customer risk)

| # | Category | Status | Evidence | Risk if launched as-is |
|---|---|---|---|---|
| 1 | Data integrity / corruption detection | **GAP (critical)** | No checksum in source (reverted post-L-360); server validates only furniture + 50 MB cap (server.js:3199-3239); L-334 open | Silent element loss reported as "saved". A wall/door vanishes; user finds out at the printer. Lost customer + reputational. **Highest.** |
| 2 | Real-time collaboration | **GAP (critical)** | CRDT sync-server undeployed (fly.toml `processes=["app"]`), no `WebsocketProvider`; prod collab = socket.io LWW (server.js:534-599, RemoteCommandDispatcher.ts:157) | Two users on one project silently overwrite each other's moves/edits; no conflict surfaced. Data loss the moment collab is sold. |
| 3 | Observability of corruption | **GAP (critical)** | OTel provider unregistered → no-op spans; crash reporter Noop (crash-reporter/package.json:4); no save-integrity alert | If #1 or #2 corrupts data in prod, team learns from a support ticket, days later. Turns a bug into a public incident. |
| 4 | Backup / restore proven | **GAP** | DR-DRILL-RUNBOOK.md:340 "no real drill executed"; PITR not wired (:342) | A DB incident + never-tested restore = potential permanent loss. C48's own "a backup nobody can restore is not a backup." |
| 5 | Perf at real scale | **UNKNOWN** | Benches are headless proxies, 2 mo stale; L-366/369/372 show real degradation + WebGPU device-loss | 40-storey office user hits device-loss / tens-of-seconds gen; churns in the trial. |
| 6 | Import/export fidelity | **GAP** | No IFC/DXF/Rhino round-trip test; only BCF/family | Round-tripped IFC drops/*mangles* geometry silently; kills interop trust with any real BIM shop. |
| 7 | Migration robustness | **GAP** | MigrationEngine untested; forward-version = load-anyway (MigrationEngine.ts:241) | An old or newer-schema project silently loses fields on open. |
| 8 | Share/embed link scope | **UNVERIFIED** | /embed serves public shell, no server token check (server.js:4557); token→access unmapped | A leaked link could expose edit or account-wide access. Security incident. |
| 9 | Infra degrade-to-in-memory | **PARTIAL** | pgClient max:10; §SERVER-PG-DEGRADE → volatile in-memory writes | During a DB blip, writes land in memory and vanish on restart. |
| 10 | Browser/device coverage | **GAP/UNVERIFIED** | Playwright desktop-3 only; WebGL fallback verified on one Windows box | Low-end GPU / any tablet user hits a blank/crashed viewport. |
| 11 | Auth core paths | **PARTIAL (mostly SOLID)** | REST+socket enforce access (server.js:466-521,3172); audit trail thin | Core isolation holds; durable audit + embed tokens are the soft spots. |
| 12 | Data residency / runbooks (docs) | **SOLID (on paper)** | fly.toml:22-36 FRA/GDPR; 5 runbooks | Answerable to customers; execution unproven. |

---

*Prepared read-only. No code or docs were modified except this report file.*
