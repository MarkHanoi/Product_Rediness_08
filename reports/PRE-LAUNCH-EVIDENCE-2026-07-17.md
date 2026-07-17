# PRE-LAUNCH EVIDENCE SNAPSHOT — 2026-07-17

> **Point-in-time evidence snapshot captured 2026-07-17. This is NOT a living document.**
> The single source of truth is `docs/04-reference/SEPTEMBER-READINESS.md` (dashboard) →
> `docs/04-reference/V1-LAUNCH-READINESS-AUDIT.md` (issue register) +
> `docs/04-reference/V1-LAUNCH-IMPLEMENTATION-PLAN.md` (plan).
> The findings below are tracked as **L-387..L-397** in the issue register (plus re-flags of
> pre-existing L-items). Do NOT re-derive issues or plans here — this file preserves only the
> raw point-in-time EVIDENCE (command output, test runs, secrets grep, dependency advisories,
> category-readiness matrix) that produced those L-items.
>
> **Mode of capture:** read-only. Commands run against the working tree at commit on branch
> `feat/wall-move-dimensions` (with `apps/editor/src/rendering/createRenderer.ts` modified in the
> working tree — the L-372/L-386 Batch-2 renderer edit in flight). Raw backing files retained in
> this directory: `.pnpm-audit.txt`, `.audit-raw.json`, `.audit-text.txt`, `.build-output.txt`,
> `.build-clean.txt`, `.test-server.txt`, `.test-vitest-root.txt`.
>
> **History:** consolidated from the now-deleted fragments `PRE-LAUNCH-AUDIT-2026-07-17.md`
> (+ its part1/part2/part3 verbatim copies of living master docs) and
> `CATEGORY-READINESS-AUDIT-2026-07-17.md`. The three "part" files were byte-drifting duplicates
> of `V1-LAUNCH-READINESS-AUDIT.md` / `V1-LAUNCH-IMPLEMENTATION-PLAN.md` /
> `master-execution-tracker.md` and carried zero unique content — deleted as pure sprawl.

---

## Finding → L-item map

| # | Evidence finding | L-item | Source §|
|---|---|---|---|
| 1 | 93 dependency advisories (7 critical / 28 high); runtime-reachable jsPDF/Multer/ws/form-data/protobufjs; none fixed | **L-387** | Part A §1 |
| 2 | Root `npx vitest run` gate RED — 3 door/dimension specs fail at module load (`DoorStore.ts:227` barrel-at-load, register 0 tests) | **L-388** | Part A §2 |
| 3 | Real in-browser 60 FPS frame-budget + tool-latency-with-renderer UNVERIFIED (headless proxies only; founder logs contradict on heavy scenes) | **L-389** | Part A §5 |
| 4 | Dead governance breadcrumbs — CLAUDE.md/contracts cite `docs/03_PRYZM3/01-VISION.md` / `02-ARCHITECTURE.md` (moved/archived) | **L-390** | Part A §6 |
| 5 | Real-time CRDT collab has NO network backend (`apps/sync-server` undeployed, no `WebsocketProvider`); prod collab = socket.io arrival-order LWW for move/edit/delete | **L-391** | Part B §2 |
| 6 | P8 OTel spans created everywhere but NO tracer provider registered → no-op; crash reporter Noop; no save-integrity alert | **L-392** | Part B §9 |
| 7 | No IFC/DXF/Rhino round-trip (import→export→re-import) test — geometry fidelity assumed; adversarial-input behaviour UNVERIFIED | **L-393** | Part B §4 |
| 8 | Snapshot schema migration v0→v5 UNTESTED; forward-version snapshot loads anyway with silent field loss | **L-394** | Part B §1.5 |
| 9 | `/embed` serves public shell echoing projectId+token with NO server-side token validation; token→access scope unmapped | **L-395** | Part B §5.2 |
| 10 | E2E backup RESTORE never drilled; free-plan projects live only in one browser's IndexedDB (0 server versions) | **L-396** | Part B §1.6 / §10 |
| 11 | Pricing contradiction (marketing tiers vs billing-code `monthlyUSD`); founder decision | **L-397** | Strategy briefing |
| re-flag | L-53 (P0 wall-baseLine LWW), L-85 (P0 elements vanish on reopen), L-72 (3D undo gap), L-133 (deploy 503), L-376a (unsynced IDB pile-up), L-373a (heuristic heatmaps) — escalated to launch-blocking | *existing rows* | Part A §2 / Part B |
| n/a | Unit-test estate not a CI gate; coverage % / `pnpm -r test:ci` / Playwright E2E not run | **L-247** (pre-existing) | Part A §2 |

**Findings NOT yet captured in an L-item** (see "Uncaptured findings" at the foot of this file —
flagged for the orchestrator to log; NOT silently dropped): XSS surface (781 sinks), client
bundle-size/first-paint budget, `/api/event-log` unauthenticated write, browser/device matrix.

---

# Part A — Pre-launch code / security / performance evidence

## A§1 Dependency audit (`pnpm audit`)

`npm audit` is **NOT USABLE** (pnpm monorepo, no root `package-lock.json`):
```
npm error code ENOLOCK
npm error audit This command requires an existing lockfile.
```

`pnpm audit` RAW summary (full table: `reports/.pnpm-audit.txt`):
```
93 vulnerabilities found
Severity: 9 low | 49 moderate | 28 high | 7 critical
```

**Critical (7) — titles:**
```
critical  Happy DOM: VM Context Escape → Remote Code Execution        (dev/test dep — happy-dom)
critical  jsPDF has Local File Inclusion/Path Traversal               (RUNTIME — packages/file-format > jspdf)
critical  jsPDF has HTML Injection in New Window paths                (RUNTIME — jspdf)
critical  Vitest UI server listening → arbitrary file access          (dev/test dep — vitest UI)
```

**High (28) — deduped sample:**
```
high  jsPDF ReDoS / DoS / PDF Injection (AcroForm/FreeText) / Object Injection  (RUNTIME — jspdf)
high  Happy DOM fetch credentials use page-origin / ESModuleCompiler unsanitized export (dev)
high  fast-uri path traversal / host confusion
high  fast-xml-builder attribute values / Svelte devalue DoS (sparse array)
high  tmp Path Traversal via unsanitized prefix/postfix
high  form-data CRLF injection                                 (RUNTIME-adjacent — multipart)
high  Astro Reflected XSS / Host header SSRF                    (apex/marketing build)
high  Multer DoS via deeply nested fields                      (RUNTIME — server upload)
high  ws Memory exhaustion DoS from tiny fragments             (RUNTIME — websockets/collab)
high  protobufjs DoS through unbounded Any                     (RUNTIME)
high  vite server.fs.deny bypass on Windows ADS                (dev server)
```

**Assessment:** many critical/high are dev/test-only (happy-dom, vitest UI, vite dev-server,
astro build) — not in the runtime bundle. Runtime-reachable = **jsPDF** (critical LFI/path-traversal
+ HTML injection + PDF-injection/DoS, C29 export path), **Multer** (upload DoS), **ws** (collab
transport DoS), **form-data** (CRLF), **protobufjs** (DoS). None auto-fixed. → **L-387.**

## A§2 Test suites

**`npm run test:server`** (vitest, Node env) — **PASS**:
```
Test Files  6 passed (6)     Tests  89 passed (89)     Duration 8.02s     exit=0
```

**`npx vitest run`** (root config) — **FAIL (exit 1)**:
```
Test Files  3 failed | 18 passed (21)     Tests  212 passed (212)     Duration 133.75s     exit=1
```
The 3 failures are **collection/module-load failures, not assertion failures** — the import chain
hits `packages/geometry-door/src/DoorStore.ts:227` where `projectScopeRegistry.register({...})`
runs at module top-level (barrel-at-module-load), throwing during import:
```
❯ apps/editor/src/engine/__tests__/dimensionSelectionPanel.spec.ts (0 test)
❯ apps/editor/src/engine/views/plantools/__tests__/DoorHostResolution.slab.spec.ts (0 test)
❯ apps/editor/src/engine/views/plantools/__tests__/DoorFlipOnSpace.spec.ts (0 test)
❯ packages/geometry-door/src/DoorStore.ts:227:1  →  index.ts:9:1
```
These 3 files register **0 tests**, so "212 passed" masks a real breakage. Root gate is RED. → **L-388.**

- **`pnpm -r run test:ci`** — NOT RUN (long recursive suite). **`npx playwright test`** E2E — NOT RUN
  (localhost dev documented unusable on this box). **Coverage %** — no coverage tooling wired into
  any documented script → UNVERIFIED. (CI-gate absence of the unit-test estate is pre-existing **L-247.**)

## A§3 Auth / session / permission surface — INFO/OK (strong)

`authMiddleware` at `server.js:720`; 92 `app.<method>` routes; auth applied per-route + on `/api/v1`,
`/v1/ai`, `/api/stripe` mounts. Ownership scoping (`owner_id`/`ownerId`) enforced. Socket layer:
`server.js:480` `join-project` → `canUserAccessProject` (`server/projectAccess.js`), fail-closed,
anonymous denied; `server.js:541` `command-executed` requires `_socketInProjectRoom` (§B2) +
`isValidCommandPayload` (H4). ISO-19650 role matrix in `server/permissions.js` (tested,
`server/__tests__/permissions.test.ts`). Verdict: fail-closed, ID-validated, ownership-scoped,
socket-room gated. Gaps are route-level **test coverage** (versions/thumbnail/stripe UNVERIFIED),
not missing guards.

## A§4 Input → sink validation — INFO/OK, with gaps

- **SQL:** grep for query string-interpolation in `server.js`/`server/` = **0 hits** — all DB access
  parameterized (`pool.query(text, params)` / Supabase builder). No SQL-injection sink found.
- Project reads validate `isValidProjectId` allowlist before any DB call. Socket command payload gated
  by `isValidCommandPayload` + room membership. Client mutations gated by Zod schemas (C03/P5).
- **Multer upload routes** (`/api/import/dwg` 2359, `ifc-uploads` 2415) — size-limited; **Multer DoS
  advisory open** (§A1).
- **Client rendering:** `.innerHTML=` / `dangerouslySetInnerHTML` / `eval(` / `new Function(` =
  **781 occurrences** across `apps/*`, `src/*`, `packages/*`. Sampled marketplace uses `escapeHtml()`;
  many are static strings. A minority interpolate values; UGC marketplace pages (family names,
  descriptions) are highest-risk. Full XSS review UNVERIFIED. *(NOT yet an L-item — see foot.)*

## A§5 Secrets check — OK

No hardcoded real secrets in tracked source.
```
$ rg -n -o "(sk_live_...|sk-ant-...|AKIA[0-9A-Z]{16}|AIza...|ghp_...|xoxb-...)" (excl node_modules,lock,reports)
(no output — none found)

$ rg -n -i "(api[_-]?key|secret|password|token)\s*[:=]\s*['\"][A-Za-z0-9_\-]{16,}['\"]" ...
docs/03-execution/plans/b2b-implementation-plan.md:144:    apiKey: 'pk_live_kavehome_xxxxx'   ← placeholder, not real
```
Private-key-block scan (`BEGIN … PRIVATE KEY`) — no output. `.env` gitignored (`git check-ignore .env`
exit 0) and never committed (`git log --all -- .env` empty). `.gitignore` includes `.env`, `.env.local`,
`.env.*.local`, `!.env.example`. **Clean.**

## A§6 Client bundle size (`npm run build`)  *(NOT yet an L-item — see foot.)*

Build **SUCCEEDED** (`exit=0`, `built in 3m 16s`; C13 isolation guard passed: 27 serialized
singletons / 54 registered scopes / 0 dead listeners; `tsc --skipLibCheck` passed). Vite config does
**not** report gzip — figures are **uncompressed**. Total `dist/` = 242 MB (includes static asset
catalogs). 77 JS chunks. Largest:
```
vendor-web-ifc            3,555 kB      main                       2,450 kB
domain-engine             3,281 kB      vendor-thatopen            1,988 kB
engineLauncher            3,230 kB      vendor-three               1,866 kB
SiteBoundaryMap2D         1,100 kB      vendor-pdfjs                 749 kB
```
`main` (2.45 MB) + `engineLauncher` (3.23 MB) are eager-ish entry chunks, heavy for first paint even
gzipped (~600–800 KB est., UNMEASURED). Rollup warns `RoomAutoOrganiser.ts` is both static and dynamic
import (defeats a code-split). Gzipped app-shell budget proxy (`bundle-size.json`) = 0.31 KB gzip of the
schema export manifest — a proxy, not the real shell; real production bundle is not gate-measured.

## A§7 Perf budgets (C10) — MET vs UNVERIFIED

Measured numbers from `apps/bench/.run-output/*.json` (headless proxies; JSON `notes` say full
browser/GPU numbers are "Wave 13, apps/editor-bench" — not present/not run):

| C10 budget | Target | Measured (headless proxy) | Verdict |
|---|---|---|---|
| Cold boot (composeRuntime) | <2.5 s in-browser | `cold-boot.json` p95 = 18.3 ms (compose only) | UNVERIFIED (proxy) |
| Tool latency (click→visible) | <50 ms p95 | `tool-latency.json` p95 = 10.5 ms (pipeline only) | proxy MET; real UNVERIFIED |
| Frame budget (interactive) | 16.6 ms p95 | `frame-budget.json` p95 = 0.0075 ms (scheduler drain, no GPU) | proxy MET; real UNVERIFIED |
| Plan-view re-render | <100 ms p95 | `plan-view-redraw.json` p95 = 0.033 ms (store notify) | proxy MET; real UNVERIFIED |
| CRDT merge (2 users) | <80 ms p95 | `crdt-merge.json` p95 = 0.32 ms, 9,433 ops/s (REAL Y.Doc) | **MET (real)** |
| Cold load small/med/large | 80/800/1500 ms | `cold-load-real.json` 7.1 / 257 / 336 ms | **MET (real, headless)** |
| Family load (200 params) | <200 ms | not located | UNVERIFIED |
| Schedule rebuild (10k rows) | <500 ms p95 | not located | UNVERIFIED |

**Bottom line:** pure-compute/store budgets met (real or proxy); CRDT-merge + cold-load met with REAL
numbers. The two that matter most for launch — real in-browser 60 FPS frame budget and
tool-latency-with-renderer — are UNVERIFIED, and the founder log contradicts them on heavy scenes
(L-02/117/131/139/372/377/382). → **L-389.**

## A§8 Doc-drift / working-tree note

- Governance conflict-resolution order in `CLAUDE.md` (and some contracts/bench notes) cites
  `docs/03_PRYZM3/01-VISION.md` / `02-ARCHITECTURE.md` — the directory does not exist (moved to
  `docs/01-strategy/` + archived). → **L-390.**
- `git status` at capture: `M apps/editor/src/rendering/createRenderer.ts` (uncommitted, L-372/L-386
  Batch-2 renderer edit in flight); deleted `docs/03-execution/queue/README.md` + one queue doc;
  untracked `docs/04-reference/DENMARK-GEOSPATIAL-REFERENCE-ARCHITECTURE.md`. Branch
  `feat/wall-move-dimensions`. Build + tests above were run against this working-tree state.

---

# Part B — Category-readiness evidence (professional collaborative BIM/CAD bar)

Bar = Arcol / Motif / Snaptrude / Qonic / Hypar / Forma: files become construction/legal documents;
the judged properties are DATA INTEGRITY and COLLABORATION CORRECTNESS. Read-only; evidence is
`file:line` + literal output. Anything not confirmable = **UNVERIFIED** (not a pass).

## B§1 Data integrity & durability — GAP (critical)

- **Save path (traced):** edit → in-memory stores (DOM events) → `SaveOrchestrator.ts:59-81,238-344`
  (debounce `2500 ms`, hash-compare) → `ProjectSerializer.serialize()` (`SNAPSHOT_SCHEMA_VERSION = 5`)
  → localStorage sync + IndexedDB → `ServerSyncQueue.ts` `enqueue()`→`attemptSync()` POST
  `/api/projects/:id/versions` (`X-Idempotency-Key`, `If-Match`) → `server.js:3172`.
- **Validation before trust is thin:** server (`server.js:3172-3246`) enforces only a 50 MB size cap
  (`SNAPSHOT_LIMIT_BYTES`) and a `.passthrough()` Zod schema that validates **only the furniture
  array**:
  ```js
  const snapshotSchema = z.object({ furniture: z.array(furnitureSchema).optional() }).passthrough();
  ```
  Walls, slabs, doors, windows, stairs, roofs, columns, beams, curtain-walls, rooms, levels, grids,
  semantic/temporal graphs — **none validated**. A snapshot with corrupt/missing walls persists as 201.
- **Silent drop points:** `ProjectSerializer.ts:688-698` filters degenerate room-bounding-lines
  (`console.warn` only); `deepStrip` duck-types THREE fields (mis-detect → silently reshaped);
  `ServerSyncQueue.ts:276-279` "Queue full — dropping oldest item"; free plan short-circuits to
  `local-only` (`VERSION_LIMITS.free = 0`, `server.js:3258`; 403 at 3268) → free-plan user's only
  durable copy is one browser's localStorage/IndexedDB; 412 loser kept `local-only` (`:481-529`).
- **Corruption detection — NONE in source.** Checksum was added (L-334) then reverted after it bricked
  a real 1009-element project (L-360). `grep computeSnapshotChecksum|SnapshotChecksum` over `**/*.ts` →
  "No files found." No integrity hash, no round-trip verification, no element-count reconciliation.
  (This is pre-existing **L-334**, the biggest data-integrity blocker.)
- **Versioning/migration:** `MigrationEngine.migrate()` runs additive v0→v5; forward-compat is
  load-anyway (`MigrationEngine.ts:241-248` — `schemaVersion > 5` warns + returns unchanged → silent
  field loss); **no `MigrationEngine*.test` exists** → v0→v5 path has zero automated coverage. → **L-394.**
- **Backup/restore:** `DR-DRILL-RUNBOOK.md:340` "does not claim a real production drill has been
  executed"; PITR "not yet wired" (`:342`, ADR-0049 §F); no `pg_dump` cron/retention job found. → **L-396.**

## B§2 Real-time collaboration correctness — GAP (critical)

Two collab mechanisms; the one with conflict-resolution is not wired to a network.
- **A. Advertised CRDT path (Yjs + 3-way resolver) has NO network provider in production.**
  `YjsDocAdapter` builds a local `Y.Doc`; `engineLauncher.ts:817-838` constructs
  `new YjsDocAdapter(projectId)` **with no provider** (L-375a applier wiring). No
  `WebsocketProvider`/`WebrtcProvider` is ever instantiated (`grep` → only commented examples);
  `_provider` stays `null` (`YjsDocAdapter.ts:232`). Sync server is **undeployed**: `apps/sync-server`
  + `apps/api-gateway` absent from `fly.toml`/`Dockerfile`/workflows; Fly runs a single process
  (`fly.toml:36 processes=["app"]`, `Dockerfile:171 CMD ["node","./dist/index.cjs"]`). → Y.Doc never
  receives remote ops → `CRDTConflictResolver`/conflict banner **never fire in prod**. The e2e test
  (`tests/e2e/crdt-batch-conflict.spec.ts`) admits it needs a shared Yjs WS server "not available in CI".
- **B. What actually runs: socket.io command rebroadcast (LWW).** Client emits `command-executed`;
  `server.js:534-599` validates + best-effort logs + `socket.to(...).emit('remote-command')`; client
  applies via `RemoteCommandDispatcher.dispatch()` (`:157`). Only conflict handling = duplicate-create
  suppression (`:100-172`). Concurrent **move/property-edit/delete** = silent last-write-wins.

| Mutation | Production behaviour | Evidence |
|---|---|---|
| create | idempotent (dup id skipped) | RemoteCommandDispatcher.ts:100-172 |
| move / property-edit / delete | **silent LWW** (arrival order, no merge) | RemoteCommandDispatcher.ts:157 |
| whole-project version save | optimistic-lock 412 → loser kept `local-only` | ServerSyncQueue.ts:481-529; server.js:3181-3192 |

No automated two-browser test exercises dropped-ws-mid-edit / two-users-same-element / 60s reconnect.
→ **L-391.**

## B§3 Performance at real scale — UNKNOWN / GAP

- Heavy-scene predicate codified: `LevelScoped3DCullingService.ts` `isHeavyModel(levelCount,elementCount)`
  = `(levelCount>=15 && elementCount>=1000) || elementCount>=4000`. No single "supported max element
  count" SLA found (target implied, not an SLA).
- Benches (`apps/bench/.run-output/`, all recorded 2026-05-09) are headless proxies, ~2 mo stale, NOT
  real GPU: `frame-budget.json` p95 0.0075 ms vs 16.6 ms target but `notes` = "FrameScheduler drain
  (FakeRafAdapter, no GPU) … full 60-FPS in apps/editor-bench (Wave 13)"; `ifc-import-tier1.json`
  p50 1347 ms with the same "full import … Wave 13" caveat. Real-scale GPU/IFC-WASM numbers not found
  in `.run-output/`. Live evidence contradicts: L-369 (tens of s for ~6-storey/~580 elems), L-361/366
  WebGPU device-loss on real buildings. → folded into **L-389** (real-scale perf UNVERIFIED).
- Degradation: auto-escalate to massing LOD at `isHeavyModel` (silent); **known hole L-366** — a
  ~1300-elem/6-level building does NOT trip `isHeavyModel` (6<15, 1300<4000) → WebGPU device-loss
  with no fallback.

## B§4 Import/export & interop fidelity — GAP

| Format | Import | Export | Round-trip test? |
|---|---|---|---|
| IFC | web-ifc | IFC4X3-RV | **NONE** |
| DXF/DWG | DxfParser | — | NONE (import-only) |
| Rhino/3dm | import/rhino | — | NONE (import-only) |
| GLB/GLTF | — | export/glb | export-only tests |
| BCF | issue exchange | bcf-roundtrip bench | `bcf-roundtrip.json` p50 9.6 ms — the ONE real round-trip |
| `.pryzm` family | pack/unpack | pack | family/chunk round-trip tests (NOT IFC/DXF) |

No IFC import→export→re-import comparison test exists; the only `*roundtrip*` tests are
family/chunk/schema/sync-event/BCF. IFC/DXF/Rhino geometry fidelity = assumed, not verified.
Adversarial/malformed-file parser behaviour UNVERIFIED. → **L-393.**

## B§5 Auth, access control, multi-tenant security — PARTIAL/GAP

- REST project routes use `authMiddleware` (versions POST `server.js:3172`, etc.); `isValidProjectId`
  format check; ownership enforced inside the atomic RPC (`server.js:3411-3419` owner read-back).
- Socket.io gates on join (`server.js:466-521` `canUserAccessProject`); every other socket mutation
  checks `_socketInProjectRoom` first. Enforced, not assumed.
- **Mutating routes WITHOUT authMiddleware:** `/csp-report` (339), `/leads` (345), `/overpass` (357),
  **`/api/event-log` (3970)**. First three benign; **`/api/event-log` unauthenticated write** —
  UNVERIFIED whether it can write another tenant's log. *(NOT yet an L-item — see foot.)*
- **Share/embed:** `GET /embed?projectId=X&token=Y` (`server.js:4557-4595`) serves a public HTML shell
  with `X-Frame-Options` removed + `frame-ancestors *`, echoes projectId/token into the DOM, does
  **no server-side token validation**; token→access mapping (view vs edit, single-project vs
  account-wide) not located → leaked-link blast radius unconfirmed. → **L-395.**
- **Audit trail:** version rows persist `created_by` (`server.js:3434`); command log persists `user_id`
  (`:558`) but is purged after 24h (`:578-596`) → not durable; `TemporalGraph` persists `sessionId`,
  not necessarily stable userId → durable per-user edit attribution partial/UNVERIFIED.

## B§6 Compliance & data handling — PARTIAL

- **Residency documented:** `fly.toml:22-36` `primary_region = "fra"` (Frankfurt) — "Mandated by
  C22 §1.3 + C49 §1.2 (EU primary) + C49 §1.13 (GDPR). Do NOT add a US peer region without a contract
  amendment." Answerable to a customer.
- **Runbooks exist:** `DR-DRILL`, `RUNBOOK-ACCIDENTAL-DELETE`, `RUNBOOK-DB-PRIMARY-FAILURE`,
  `RUNBOOK-RANSOMWARE`, `RUNBOOK-REGIONAL-OUTAGE` + `incidents/`. Cadence "quarterly".
- **But** no drill/restore executed; breach on-call rotation/alerting existence UNVERIFIED (no
  PagerDuty/Opsgenie config found).

## B§7 Infrastructure resilience — PARTIAL

- DB pool `server/pgClient.js:84-89` `max:10, idleTimeoutMillis:30000, connectionTimeoutMillis:10000`;
  `statement_timeout=60s` + `idle_in_transaction_session_timeout=30s`. Saturation → acquire fails after
  10 s (fail-closed). Client circuit breaker `ServerSyncQueue.ts:38-51,341-351` (opens after 5 failures,
  30 s cooldown).
- **PG-degrade fallback:** `server/pgClient.js:251-278` §SERVER-PG-DEGRADE — on PG connect failure,
  requests fall through to an **in-memory** project store instead of a permanent 503 (fixes the
  migration-gate deadlock). In-memory = non-durable writes during degrade → data-loss window
  (fail-open to volatile store).
- Health: `/api/health/live` (no DB, always 200), `/api/health/ready` (SELECT 1, 503 on error),
  `/api/health` (schema + FK invariant); `Dockerfile:166 HEALTHCHECK`. Alerting on those / status page
  UNVERIFIED (no integration found).

## B§8 Browser/device reality — GAP/UNVERIFIED  *(NOT yet an L-item — see foot.)*

- Tested browsers `playwright.config.ts:28-30`: chromium, firefox, webkit — **Desktop only**, no mobile/
  tablet device projects (no `devices['Pixel 5']`/`iPhone`).
- WebGL/WebGPU fallback exists (`createRenderer.ts` backend states `webgpu | webgl-fallback |
  webgl-only`); Batch-2 shipped the `webgl-only` heavy-gen path.
- Real-hardware verification is effectively **one Windows box** (forces WebGL); WebGPU on real hardware
  repeatedly device-loses (L-361/366/372). Low-end-GPU / broad-device matrix UNVERIFIED. Tablet/mobile
  (even read-only) — no device tests, no `isMobile`/touch gating found → likely unsupported.

## B§9 Observability — GAP (critical for a data-integrity product)

- P8 OTel spans created everywhere (`trace.getTracer().startSpan()`, e.g.
  `CRDTConflictResolver.ts:18,61,114,146,174`); CI enforces "≥1 span per exported fn".
- **But no tracer PROVIDER is registered** — `grep NodeTracerProvider|WebTracerProvider|
  BasicTracerProvider|provider.register|@opentelemetry/sdk-trace` = only a devDependency
  (`persistence-client/package.json:40`), no runtime registration → `@opentelemetry/api` returns a
  **no-op tracer** → spans go nowhere. `server.js:2172` only reports the OTLP endpoint in health JSON;
  no exporter wired.
- **Crash reporting is Noop:** `crash-reporter/package.json:4` default `NoopCrashReporter`; "Real
  Sentry/GlitchTip binding deferred to S48 D9." `ViewportCrashGuard.ts:229` guards on `window.Sentry`
  (CDN placeholder only).
- Server logging = `console.log`/`console.warn` to Fly stdout; no structured logger, no
  aggregation/alerting. **Save-integrity monitoring: none** — a silent prod corruption is invisible
  until a user reports it. → **L-392.**

## B§10 Recoverability & support ops — PARTIAL

- Version-restore UI exists (`PlatformVersionController.ts:327 loadVersion()` + list + preview) IF a
  version synced to the server (free plan has none — §B1). Runbooks for "project is gone" exist.
- But restore never drilled (DR-DRILL §340), PITR not wired (§342), and free-plan projects live only in
  one browser's IndexedDB/localStorage — lose that browser, nothing to restore. Local recovery: IDB
  versions + `beforeunload` flush (`SaveOrchestrator.ts:353-374`) + sync-queue replay — solid for
  same-browser only. → free-plan single-device durability folded into **L-396.**

## B — Category summary (ranked by month-one public-incident / lost-customer risk)

| # | Category | Status | L-item |
|---|---|---|---|
| 1 | Data integrity / corruption detection | GAP (critical) | L-334 (existing) + L-394 |
| 2 | Real-time collaboration | GAP (critical) | L-391 |
| 3 | Observability of corruption | GAP (critical) | L-392 |
| 4 | Backup / restore proven | GAP | L-396 |
| 5 | Perf at real scale | UNKNOWN | L-389 |
| 6 | Import/export fidelity | GAP | L-393 |
| 7 | Migration robustness | GAP | L-394 |
| 8 | Share/embed link scope | UNVERIFIED | L-395 |
| 9 | Infra degrade-to-in-memory | PARTIAL | *(§SERVER-PG-DEGRADE / migration-gate; durability-window framing not an explicit L-item)* |
| 10 | Browser/device coverage | GAP/UNVERIFIED | *(NOT an L-item — see foot)* |
| 11 | Auth core paths | PARTIAL (mostly SOLID) | INFO (A§3/B§5) |
| 12 | Data residency / runbooks (docs) | SOLID (on paper) | INFO (B§6) |

---

# Uncaptured findings — flagged for the orchestrator to log (NOT silently dropped)

The following substantive evidence findings do **NOT** have a corresponding row in the L-register as
of capture. They are preserved above as evidence; the orchestrator should decide whether each warrants
a new L-item (do not invent an L-number here).

1. **XSS surface (P2, UNVERIFIED)** — 781 `.innerHTML=`/`dangerouslySetInnerHTML`/`eval(`/`new Function(`
   occurrences across `apps/*`,`src/*`,`packages/*`. Mostly static/escaped, but a minority interpolate
   values; UGC marketplace pages (family names/descriptions) are highest risk and need a focused XSS
   pass. (Part A §4.)
2. **Client bundle-size / first-paint budget (P2)** — `main` 2.45 MB + `engineLauncher` 3.23 MB
   uncompressed eager chunks; gzip is never gate-measured (the real production shell size has no CI
   budget — `bundle-size.json` is a 0.31 KB schema-manifest proxy); `RoomAutoOrganiser.ts` static+dynamic
   import defeats a code-split. (Part A §6.)
3. **`/api/event-log` unauthenticated write (P2, UNVERIFIED)** — `server.js:3970` mutating route without
   `authMiddleware`; unverified whether it can be abused to write another tenant's log. (Part B §5.)
4. **Browser/device matrix (GAP/UNVERIFIED)** — Playwright covers desktop chromium/firefox/webkit only
   (no mobile/tablet device projects); real GPU verification is effectively one Windows box; tablet/mobile
   (even read-only) likely unsupported (no `isMobile`/touch gating found). C44/C45 are DRAFT contracts but
   no L-register item tracks the test/verification gap. (Part B §8.)

Borderline (mechanism referenced elsewhere but the launch-risk framing may lack a dedicated L-item):
- **Infra degrade-to-in-memory durability window** — §SERVER-PG-DEGRADE fail-open to a volatile
  in-memory store means writes during a DB blip vanish on restart. The mechanism is documented (ties the
  migration-gate deadlock fix) but the "non-durable write window" is not called out as its own row.
  (Part B §7.)
- **Durable per-user audit trail** — command log purged after 24h; `TemporalGraph` keys on `sessionId`
  not a stable userId → per-element edit attribution over time is partial. (Part B §5.)
