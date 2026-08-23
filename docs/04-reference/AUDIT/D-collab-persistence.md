# AUDIT-D — Collaboration · Persistence · Sync · Observability · Tenancy
### Pascal editor (MIT, public) vs PRYZM — a measured head-to-head
### Lane AUDIT-D · 2026-08-23 · input to **C107**

---

## 1. Scope and method

### 1.1 What I read

**PASCAL** — clone at
`…/scratchpad/pascal` (read-only; nothing written, nothing committed).
Every collaboration, persistence and sync path in the repo:

| Area | Files read in full |
|---|---|
| Scene HTTP API | `apps/editor/app/api/scenes/route.ts`, `apps/editor/app/api/scenes/[id]/route.ts`, `apps/editor/app/api/scenes/[id]/events/route.ts`, `apps/editor/app/api/health/route.ts` |
| API security | `apps/editor/lib/scene-api-security.ts` (180 L) |
| Wire validation | `apps/editor/lib/graph-schema.ts` (180 L) |
| Wipe guards | `apps/editor/lib/empty-graph-guard.ts`, `apps/editor/lib/scene-signature.ts` |
| Store wiring | `apps/editor/lib/scene-store-server.ts` |
| Persistence engine | `packages/mcp/src/storage/sqlite-scene-store.ts` (705 L), `types.ts` (164 L), `sqlite-driver.ts`, `index.ts` |
| Operations facade | `packages/mcp/src/operations/scene-operations.ts` (327 L) |
| Live sync (agent→browser) | `packages/mcp/src/tools/live-sync.ts` |
| Client sync | `apps/editor/components/scene-loader.tsx` (309 L) |
| Client autosave | `packages/editor/src/hooks/use-auto-save.ts` (~300 L) |
| Undo / history | `packages/core/src/store/history-control.ts`, `packages/core/src/store/use-scene.ts` (2114 L, read at the zundo config + temporal subscription), `packages/editor/src/lib/history.ts` |
| Local persistence | `packages/editor/src/lib/scene.ts` (426 L) |
| CI + arch gates | `.github/workflows/ci.yml`, `packages/core/src/architecture.test.ts` |

**PRYZM** — the working tree. Same axes:
`packages/sync-client/**` (4 978 L across 15 source files), `apps/sync-server/**`,
`apps/editor/src/ui/platform/{ServerSyncQueue,ProjectRepository,PlatformSaveController}.ts`,
`apps/editor/src/engine/{initCollaboration,engineLauncher}.ts`, `server.js` (socket.io + versions API),
`packages/crash-reporter/src/Tracing.ts`, and the contracts `C05 §3.5–§3.7`, `C08 §3`, plus
`docs/04-reference/ISSUE-LOG.md` rows **L-8700 … L-8704**.

### 1.2 What I ran

Every number in §2 is reproducible. Gates were executed live, not quoted:

```
npx tsx tools/rac-conformance/certification/gates/check-conflict-surfacing.ts   → RC=0
npx tsx tools/ga-gate/check-otel-spans.ts                                       → RC=3
npm run check:isolation                                                          → RC=1
git log --oneline --grep="L-870"                                                 → 7 commits
```

### 1.3 ⛔ THE SINGLE MOST IMPORTANT SCOPE FACT — READ THIS BEFORE ANY VERDICT

> **The Supabase Realtime layer the founder captured in his browser console IS NOT IN THE PUBLIC PASCAL REPOSITORY.**
> This is a measurement, not an impression:
>
> ```
> $ grep -rn "realtime-observability" --include=*.ts --include=*.tsx -l .    → 0 files
> $ grep -rn "postgres_changes" --include=*.ts --include=*.tsx -l .          → 0 files
> $ grep -rni "supabase" . -l | grep -v "\.git/"                             → 14 files
> $ grep -rn "WebSocket\|ws://\|wss://\|socket.io" --include=*.ts --include=*.tsx \
>       packages apps | grep -v node_modules | grep -v "\.test\."            → 0 hits
> ```
>
> Of the 14 `supabase` hits: `.gitignore`, `turbo.json`, two legal pages
> (`app/privacy/page.tsx`, `app/terms/page.tsx` — naming Supabase as a subprocessor),
> `apps/ifc-converter/lib/test-files.ts`, three asset-URL constants, and
> **`packages/mcp/src/storage/types.ts:122`**, which is the single load-bearing one:
>
> ```ts
> export interface SceneStore {
>   readonly backend: 'sqlite' | 'supabase'      // types.ts:122
> ```
>
> The union admits a Supabase-backed store. **The repository ships only the SQLite one**
> (`packages/mcp/src/storage/index.ts:16`, `createSceneStore()` → `new SqliteSceneStore(...)`,
> unconditionally). `grep -rn "=== 'supabase'"` over the whole tree → **0 branches**.

**Three further seams prove the same thing** — the OSS repo is the single-player engine
*plus published extension points*, and the hosted multiplayer app plugs into them from outside:

| Seam | Declared at | Consumers in the OSS repo |
|---|---|---|
| `SceneSaveOptions.saveMode` / `.publish` / `.agentSessionId` / `.operation` | `packages/mcp/src/storage/types.ts:59, 61, 63, 65` | **Zero reads** in `SqliteSceneStore.save()` (`sqlite-scene-store.ts:329–447`, read in full) |
| `installHistoryCommandDelegate({ mode: 'collaborative' \| 'standalone', status: 'offline' \| 'ready' \| 'syncing' \| 'unavailable', persistence: 'local' \| 'queued' })` | `packages/editor/src/lib/history.ts:15–37`, exported from the barrel at `packages/editor/src/index.tsx:427` | **Zero production callers** — `grep -rn installHistoryCommandDelegate` → 1 definition, 1 barrel export, 3 test call sites |
| `ProjectStatus.draftVersion` / `.publishedVersion` / `.browserVisibleVersion` | `types.ts:104–110` | SQLite store returns `draftVersion: null` and `publishedVersion === latestVersion === version` unconditionally (`sqlite-scene-store.ts:177–184`) |

**Consequence for this audit, stated so nobody over-reads it:**

* ✅ I CAN audit Pascal's **persistence engine**, **optimistic-concurrency model**, **wipe guards**,
  **agent→browser live-sync**, **SSE reconnection**, **undo model**, **wire validation** and
  **API security** — all of that is real, shipped code and it is what §3 covers.
* ⛔ I CANNOT audit Pascal's **Supabase Realtime channel handling**, its **`realtime-observability`
  event schema**, its **reconnect `attempt` counter and backoff curve**, or its
  **multi-tenant row-level authorization**. Those are closed. Judging them from a
  console capture would be inferring architecture from an artefact, which is exactly the
  failure mode this repo's own `CLAUDE.md` documents rotting five times over.
  Every such item is listed in **§8**, not guessed at in §5.

⚠ **The founder's `heartbeat timeout` capture is therefore evidence of a SYMPTOM in a system whose
reconnection code I could not read.** I have not judged it. What I *did* read is Pascal's
**open-source** reconnection story (SSE, §3.4), and that I judge on the code.

### 1.4 What I did not do

Read-only on both trees. No file in either repo was created, edited, or committed except this one
output file. Four sibling lanes were mid-flight in PRYZM; one of them (`L-870x`, persistence) landed
commits *during* this audit — every persistence number below was re-measured against
`git log --oneline --grep="L-870"` at HEAD, not carried over from the brief.

---

## 2. Measured facts

### 2.1 Repository shape

| Fact | Pascal | PRYZM | Command |
|---|---|---|---|
| Apps / packages | 2 apps · 10 packages · 2 tooling | 13 apps · 97 package manifests · 48 plugins | `ls apps packages tooling` (Pascal) · CLAUDE.md §Architecture (PRYZM) |
| Package manager / runtime | `bun@1.3.14`, turbo, biome | `pnpm@10.26.1`, vite, eslint | `cat package.json` |
| Test files | **459** | **2 684** | `find . \( -name "*.test.ts" -o -name "*.test.tsx" \) -not -path "*/node_modules/*" \| wc -l` |
| CI jobs | 2 (`quality`, `cli-smoke`) | `ci.yml` multi-job + `deploy-fly.yml` `ci-gate` | `cat .github/workflows/ci.yml` |
| Architectural gate scripts | **1** (`packages/core/src/architecture.test.ts` — one rule: no runtime `three` in core) | **69** `tools/ga-gate/*.ts` + **48** `tools/rac-conformance/certification/gates/*.ts` | `ls tools/ga-gate/*.ts \| wc -l`; `ls tools/rac-conformance/certification/gates/*.ts \| wc -l` |

### 2.2 Collaboration transport

| Fact | Pascal (OSS) | PRYZM | Command / locator |
|---|---|---|---|
| WebSocket in the tree | **0 hits** | socket.io (deployed) + `y-websocket` (gated off) | `grep -rn "WebSocket\|ws://\|wss://\|socket.io" packages apps` |
| Live push mechanism | **SSE**, `text/event-stream` | socket.io `remote-command` rebroadcast | `apps/editor/app/api/scenes/[id]/events/route.ts:110`; `server.js:674` |
| Push source | **MCP agent writes only** — `appendSceneEvent` has exactly **2** call sites, both in `packages/mcp/src/tools/live-sync.ts:50, 76` | any peer's command | `grep -rn "appendSceneEvent" --include=*.ts .` |
| Browser→browser live sync | **ABSENT.** The browser PUT path (`app/api/scenes/[id]/route.ts:115` → `operations.saveScene`) never calls `appendSceneEvent` | present (socket.io) | read both routes in full |
| CRDT | **absent** — no CRDT library in the tree or in `package.json` | Yjs `YjsDocAdapter` (1 373 L) | `grep -rni "yjs\|automerge\|\bcrdt\b" --include=*.ts --include=*.tsx --include=*.json . \| grep -v node_modules` → **2 hits, both false positives** in `apps/ifc-converter/components/IfcConverter.tsx` (`copyJsonToClipboard`); zero real |
| Conflict machinery | 137 `conflict` hits, **all** spatial-collision / port / CLI process state; **1** sync conflict: HTTP 409 `version_conflict` | 339 declared dispositions, 134 disclose, 2 declared-LWW | `grep -rni conflict --include=*.ts packages apps \| grep -v "\.test\."` |
| Merge | 2 hits under `packages/mcp/src/storage`+`operations`+`api`+`lib`, **neither a state merge** | Yjs merge + per-property disclosure | `grep -rni merge packages/mcp/src/storage …` |

### 2.3 The conflict-surfacing gate — LIVE, this run

`npx tsx tools/rac-conformance/certification/gates/check-conflict-surfacing.ts` → **RC=0**.
⚠ These numbers are **larger** than the ones in `CLAUDE.md` (which says "126 merges"). Read the gate.

| Arm | Reading |
|---|---|
| ARM A — declaration audit | **339** declared command types · 136 replicated element-property · 203 not-synced · **134 disclose · 2 last-writer-wins**, both with a stated reason (`room.rename`, `room.setName`) |
| ARM B — executed merges | S1-DIRECT **134** driven / 134 discarded / 134 artefact / **0 SILENT** · S2-INTERVENING **134 / 134 / 134 / 0 SILENT** · S3-AGREEING **134 / 0 / 0 / 0** |
| Totals vs floors | merges driven **402** (min 300) · genuinely discarded **268** (min 100) · artefacts **268** (min 50) · files scanned **7 520** (min 500) |
| ARM C — controls | **6/6** proven in-run, both directions, including a **planted silent merge flagged by name** (`S1-DIRECT::room.rename::probeSurfacing`) |
| ARM D — subscriber reachability | **1** production `onConflict(` site: `apps/editor/src/engine/engineLauncher.ts:1320` |
| Findings | **0 against a NAMED ledger of 0**, hard-0, no baseline |

### 2.4 Observability

| Fact | Pascal (OSS) | PRYZM | Command / locator |
|---|---|---|---|
| Telemetry library | **0** — no OTel, Sentry, PostHog, Datadog | `@opentelemetry/api` throughout | `grep -rni "opentelemetry\|@sentry\|posthog\|datadog" --include=*.ts --include=*.json .` → 1 file, and it is a false positive (`trace(` in `packages/nodes/src/liquid-line/tool.tsx`, unrelated) |
| Structured event stream | **0 in OSS** (the `realtime-observability` stream is closed — §1.3) | **0** — `grep -rn "console.log(JSON.stringify\|structuredLog\|logEvent("` over `apps/editor/src` + `packages/sync-client` → 0 hits |
| `console.*` calls (non-test) | **134** | 21 (`ProjectRepository.ts`) + 24 (`ServerSyncQueue.ts`) + 27 (`initCollaboration.ts`) + 8 (`YjsDocAdapter.ts`) = **80** on the sync/persistence path alone | `grep -c "console\." <file>` |
| OTel spans gate | n/a | **RC=3 (FAIL).** ZONE A **266/266** · ZONE B **62 uninstrumented of 80 against a baseline of 52 — 10 NEW files** · ZONE C census **1 987 of 2 275** files with an exported function have no span | `npx tsx tools/ga-gate/check-otel-spans.ts; echo $?` |
| ⭐ Are PRYZM's spans **recording** in production? | n/a | **NO — unreachable by construction.** `initTracing()` (`packages/crash-reporter/src/Tracing.ts:109`) returns `OFF` unless `PRYZM_TRACING` is truthy. It reads only `process.env` (`Tracing.ts:79–92`); `vite.config.ts` has **no `define` for `process.env`**, and `PRYZM_TRACING` appears in **zero** config file (`grep -rn PRYZM_TRACING --include=*.json --include=*.toml --include=*.yml .` → 0). It is also absent from `tools/ga-gate/secrets-declarations.json`. Every `trace.getTracer()` in the browser returns the API's **no-op** tracer. | `grep -rn "PRYZM_TRACING"` → 7 files, all source/doc/test, none configuration |

> ⛔ **This is the finding that matters on axis 5.** `ZONE A 266/266 instrumented` is a
> **static** measurement of source text. In the deployed browser bundle those 266 spans
> **record nothing and export nowhere.** That is UNREACHABLE, not absent — the code is
> correct, the provider is never registered. It is the same shape as `L-391`: authored, gated, off.

### 2.5 Persistence — the head-to-head cost of ONE model

The founder's real project: **281 elements, 7 levels, 62 walls, 10 slabs, 31 furniture**,
`temporalGraph` **30 432 mutations**, integrity suffix `0x8639ce` = **8 796 110 characters** of
canonical snapshot (ISSUE-LOG `L-8704`, `docs/04-reference/ISSUE-LOG.md:43891`).

**Pascal's per-node payload, measured** by stringifying the exact node literals from
`packages/mcp/src/templates/two-bedroom.ts:33–124`:

```
$ node -e "…JSON.stringify(wall/door/window literals)…"
wall 215   door 682   window 355     → avg 417 bytes/node
```

⭐ **That independently reproduces PRYZM's own figure** — `C05 §3.5` measures PRYZM's model at
*"~0.1 MB for 264 elements, about **400 bytes per element**"*
(`docs/02-decisions/contracts/C05-PERSISTENCE-AND-FILE-FORMAT.md:310`).
**The two systems' MODELS are the same size.** Everything below is about what else gets stored.

| Storage question | **Pascal** | **PRYZM** |
|---|---|---|
| One version, on the wire | 281 × 417 B ≈ **115 KB** JSON, uncompressed | model ≈ 0.1 MB **+ journal 8.7 MB** = **8.8 MB** canonical; **1.84 MB** deflated |
| Where the client keeps versions | **nowhere.** `saveSceneToLocalStorage` (`packages/editor/src/lib/scene.ts:411`) writes ONE key, `pascal-editor-scene`, and only when no `onSave` prop is supplied — the hosted path always supplies one (`scene-loader.tsx:129`) | IndexedDB mirror + localStorage: a **v2 container** of the last `MAX_VERSIONS_STORED = 20` versions (`ProjectRepository.ts:141, 174`) |
| Client container size, this model | **0 bytes** (server round-trip per open) | **~36.8 MB (38 630 482 chars)** — founder's console, `ISSUE-LOG:43809` |
| Server history | 1 `scenes` row + 1 `scene_revisions` row **per version**, each a **full** `graph_json` (`sqlite-scene-store.ts:427–433`) | 1 `project_versions` row per version, `snapshot` = full canonical JSON |
| Server history for 20 versions | 21 × 115 KB ≈ **2.35 MB** uncompressed | 20 × 8.8 MB ≈ **176 MB** uncompressed (the 50 MB per-POST cap at `server.js:3601` bounds a single write, not the table) |
| History pruning | **NONE.** `grep -rn "DELETE FROM scene_events\|DELETE FROM scene_revisions\|prune\|retention\|VACUUM" packages/mcp/src` → **0 hits.** Bounded only by `ON DELETE CASCADE` (`sqlite-scene-store.ts:645, 658`) | ring buffer of 20, `slice(-MAX_VERSIONS_STORED)` |
| Hard size cap | `DEFAULT_MAX_SCENE_BYTES = 10 MB` per graph (`sqlite-scene-store.ts:27`), env-overridable via `PASCAL_MAX_SCENE_BYTES` | `SNAPSHOT_LIMIT_BYTES = 50 MB` per POST (`server.js:3601`) |
| Compression | **none** — SQLite `TEXT` | deflate level 1, per-version blob, v2 container (`ProjectRepository.ts:118–174`) |
| Undo history persisted? | **NO** — zundo `limit: 50` in RAM (`packages/core/src/store/use-scene.ts:1591`), cleared on load (`packages/editor/src/lib/scene.ts:404`) | **YES** — `temporalGraph` embedded whole in **every** version |

⭐ **The ratio, stated three ways:**
* Per version: **36.8 MB ÷ 20 = 1.84 MB** stored vs Pascal's **115 KB** → **16×**.
* Inflated per version: **8.8 MB** vs **115 KB** → **~76×**.
* Whole client container vs Pascal's *entire 21-copy server history*: **36.8 MB vs 2.35 MB** → **~15.7×**.

⛔ **And the delta is not PRYZM's model. It is the journal.** `C05 §3.5` and `L-8704` both put it at
**~99 %** of the payload. Storing the journal **once per project** with versions holding a cursor is
a measured **≈15×** reduction (36.8 MB → ≈2.4 MB) **with no record dropped** — which would land
PRYZM's container within a factor of ~1 of Pascal's whole server-side history.
⛔ **It is a C05 format change and the founder's history; L-8704 is OPEN awaiting his call.**

### 2.6 L-870x — what a sibling lane changed under this audit

`git log --oneline --grep="L-870"` (re-run at HEAD):

| SHA | What moved |
|---|---|
| `32b88ac5` | `§L-8700/L-8701` — the "file may be corrupted" banner fired on two **healthy** projects because the canonical form did not mirror `JSON.stringify`. **v2 canonicaliser**; a differing algorithm is now **NOT COMPARABLE**, not "corrupt" (`C05 §3.7`, new and binding) |
| `55ccaaf5` | `§L-8702/L-8703` — **three** whole-container writes per autosave → **two**. `sync-pending` moved to a module-scoped overlay (`ProjectRepository.ts:258` `_transientSyncStatus`) and is overlaid on every read. **≈36.8 MB less IndexedDB traffic per autosave.** Plus `§PROBE-OPEN-PATH-STORAGE-LEG` (`ProjectRepository.ts:1195`), an always-on open-path probe |
| `23b59ce3` | Docs: `C05 §3.5/§3.6/§3.7`, `ISSUE-LOG L-8700…L-8704` |

⚠ **The floor with the current shape is TWO writes, not one** — the save, plus one terminal
`synced` write. `synced` was deliberately **not** made transient: *"the server already has this"*
may not live only in RAM (`C48`).

### 2.7 Multi-tenancy / project isolation

| Fact | Pascal (OSS) | PRYZM |
|---|---|---|
| Auth model | **ONE shared deployment token.** `PASCAL_SCENE_API_TOKEN`, constant-time compared (`apps/editor/lib/scene-api-security.ts:67–77`). Absent + loopback ⇒ **no auth at all**; absent + non-loopback ⇒ **503 `scene_api_token_required`** (fail-closed) | per-user session JWT, `authMiddleware` on every project route (`server.js:3425, 3574`) |
| Per-user authorization | **ABSENT.** `ownerId` is stored (`sqlite-scene-store.ts:394`) and **never checked**: `grep -rn "ownerId\|owner_id" apps/editor` → **2 hits**, both pass-through (`app/api/scenes/[id]/route.ts:113`, `components/scene-loader.tsx:31`). Any bearer of the shared token may `GET`, `PUT` or `DELETE` **any** scene id | membership-checked (`server.js:554–591`, `join-project` → `projectAccess.js`); `apps/sync-server/src/authz/` has `MemoryAuthz` + `PgAuthz` against `project_members` |
| Auth framework / RLS | **ABSENT.** `grep -rni "getServerSession\|next-auth\|clerk\|RLS\|row level" apps packages` → **0 hits** | Express session + Supabase; `C13` isolation contract |
| Isolation gate | none | `npm run check:isolation` → **RC=1**: C13 arm ✅ (30 serialized singletons, 61 registered scopes, 0 dead listeners, **3/3 roots** against 204 declared events), C48 storage arm ✅, **ADR-0298 arm ✗ — 47 undeclared candidates vs a baseline of 45, 2 NEW** (`apps/editor/src/ui/analysis/graphViewState.ts`, `widgetRenderers.ts` — a sibling lane's in-flight work) |

⚠ **My brief said "28 unattributed scene roots." The gate says `3/3 root(s) scanned … 2 named
exception(s), 0 new` and passes that arm.** I report what the gate printed today. The failing arm
is the ADR-0298 declared-project-scope sweep, at 47/45.

---

## 3. Pascal's design

### 3.1 The persistence shape: full snapshot, versioned, server-authoritative

Pascal has **one** durable representation: the whole `SceneGraph` as JSON. There is no delta, no
patch log, no CRDT state vector. Three tables (`packages/mcp/src/storage/sqlite-scene-store.ts:619–660`):

```sql
CREATE TABLE IF NOT EXISTS scenes (            -- the head
  id TEXT PRIMARY KEY, name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
  project_id TEXT, owner_id TEXT, thumbnail_url TEXT,
  version INTEGER NOT NULL CHECK (version >= 1),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0),
  node_count INTEGER NOT NULL CHECK (node_count >= 0),
  graph_json TEXT NOT NULL );

CREATE TABLE IF NOT EXISTS scene_revisions (   -- every version, whole
  scene_id TEXT NOT NULL, version INTEGER NOT NULL CHECK (version >= 1),
  graph_json TEXT NOT NULL, author_kind TEXT NOT NULL, author_id TEXT, created_at TEXT NOT NULL,
  PRIMARY KEY (scene_id, version),
  FOREIGN KEY (scene_id) REFERENCES scenes(id) ON DELETE CASCADE );

CREATE TABLE IF NOT EXISTS scene_events (      -- live push, ALSO whole graphs
  event_id INTEGER PRIMARY KEY AUTOINCREMENT, scene_id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version >= 1), kind TEXT NOT NULL,
  created_at TEXT NOT NULL, graph_json TEXT NOT NULL,
  FOREIGN KEY (scene_id) REFERENCES scenes(id) ON DELETE CASCADE );
```

**Notable, and good:** `CHECK` constraints in the schema, indexes on
`(project_id, updated_at DESC)` / `(owner_id, updated_at DESC)` / `(scene_id, event_id)`, and
transaction discipline (`sqlite-scene-store.ts:663–679`):

```ts
private async withWriteTransaction<T>(fn: (db: SqliteDatabase) => T | Promise<T>): Promise<T> {
  const db = await this.database();
  db.exec('BEGIN IMMEDIATE');                              // writer lock taken up-front
  try { const result = await fn(db); db.exec('COMMIT'); return result; }
  catch (err) { try { db.exec('ROLLBACK'); } catch {} throw err; }
}
```

with `PRAGMA journal_mode = WAL` and `PRAGMA busy_timeout = 5000` (`:608–610`). The version
check runs **inside** the same `BEGIN IMMEDIATE` (`:352–360`), so `expectedVersion` is a genuine
compare-and-swap, not a check-then-write race.

**Notable, and bad:** every `scene_events` row holds a **complete graph** (`:557`). The table is
never pruned. §3.4 shows what that costs.

**Loud on the read path** (`sqlite-scene-store.ts:73–80`) — a comment worth stealing verbatim:

> *"Values stay `unknown` rather than being validated against `SceneMaterial`/`Collection`:
> nothing validates on the way in, and `parseGraph` throws, so a strict shape here would let one odd
> stored value make a saved scene **permanently unloadable**. Validation belongs on the write path,
> where the caller can still react to it."*

That is a first-class persistence principle and Pascal states it where it binds.

### 3.2 Concurrency: optimistic locking at whole-scene granularity

`apps/editor/app/api/scenes/[id]/route.ts` implements RFC-7232 `If-Match` correctly, including
the weak form and the `*` wildcard (`:180–195`):

```ts
function parseIfMatch(raw: string | null): number | undefined {
  if (!raw) return undefined
  const trimmed = raw.trim()
  if (trimmed === '*') return undefined
  const match = trimmed.match(/^(?:W\/)?"([^"]+)"$/)
  …
}
```

Responses carry `ETag: "<version>"` (`:52, :127`), and a 409 carries `currentVersion` recovered
best-effort (`:216–233`). The client sends it on every autosave (`components/scene-loader.tsx:157`):

```ts
headers: { 'Content-Type': 'application/json', 'If-Match': String(versionRef.current) },
body: JSON.stringify({ name: meta.name, graph }),
keepalive: options?.keepalive,
```

### 3.3 ⭐ What Pascal does when two users edit the same wall

**Answer: nothing merges. The second writer is refused, and is told to throw their work away.**

Three mechanisms, in the order they fire.

**(a) The 409 and the modal.** `scene-loader.tsx:176–180` → `:236–261`:

```tsx
if (response.status === 409) { … setConflict(true); return }
…
<h2 className="font-semibold text-sm">Another session saved first — refresh?</h2>
<p className="mt-1 text-muted-foreground text-xs">
  Your changes haven&apos;t been saved. Reload to pick up the latest version.
</p>
<button onClick={() => router.refresh()}>Reload</button>
<button onClick={() => setConflict(false)}>Dismiss</button>
```

The granularity is **the entire scene**, not the wall. Two users editing *different* walls in the
same scene conflict exactly as hard as two users editing the same wall.

⚠ **"Dismiss" is a trap.** The 409 branch returns without advancing `versionRef.current`
(`:176–180`). Every subsequent autosave therefore sends the same stale `If-Match` and 409s again —
**the session is permanently unable to save**, and the only surface is one dismissible banner. There
is no retry, no queue, no re-base, no local durability fallback: `handleSave` is the *only* writer,
and when it returns early nothing is written anywhere.

**(b) The SSE overwrite — silent, unrecoverable loss of local edits.**
`scene-loader.tsx:201–218`:

```tsx
source.addEventListener('scene', (event) => {
  …
  if (payload.version <= versionRef.current) return
  versionRef.current = payload.version
  serverNodeCountRef.current = countGraphNodes(payload.graph)
  lastRemoteGraphJsonRef.current = sceneGraphSignature(payload.graph)
  suppressRemoteSaveUntilRef.current = Date.now() + 2500
  applySceneGraphToEditor(payload.graph)          // ← full replace of the local store
  setConflict(false); setSaveError(null)
})
```

and `packages/editor/src/lib/scene.ts:385–407`:

```ts
export function applySceneGraphToEditor(sceneGraph?: SceneGraph | null) {
  …
  useScene.getState().setScene(nodes as any, rootNodeIds as any, { … })
  …
  clearSceneHistory()          // ← the undo stack is wiped
  syncEditorSelectionFromCurrentScene()
}
```

**A newer remote version replaces the whole local graph AND clears the undo history.** Any local
edit not yet accepted by the server is destroyed with **no recovery path** — Ctrl+Z cannot reach it,
because the history was just cleared in the same call. There is no diff, no "you had unsaved
changes" prompt, no banner. `setConflict(false)` even *dismisses* a conflict banner that may have
been telling the user their work was unsaved.

⚠ In the **OSS** repo this fires only for MCP-agent writes (§2.2), so the realistic shape is:
*an AI agent edits the scene while you are editing → your unsaved work vanishes, silently, and undo
cannot bring it back.* Whether the hosted app widens this to human peers is §8.

**(c) The echo suppressor.** `lib/scene-signature.ts:17–27` is a thoughtful piece of work and its
header states its own failure mode precisely:

```ts
/** Every field the PUT body carries has to appear here. A field that is
 *  persisted but unsigned makes a local change to *only* that field
 *  indistinguishable from an echo, and the save is skipped. */
export function sceneGraphSignature(graph: PersistedSceneGraph): string {
  return JSON.stringify({ nodes: graph.nodes, rootNodeIds: graph.rootNodeIds,
    collections: graph.collections ?? {}, materials: graph.materials ?? {},
    installedPlugins: graph.installedPlugins ?? [] })
}
```

⚠ It is a **whole-graph `JSON.stringify` on every save decision**, plus a blunt 2 500 ms time
window (`scene-loader.tsx:214`) during which **every** local save is dropped (`:132`,
`if (isRecentRemoteApply) return`). A user editing continuously through a remote apply loses
2.5 s of edits from the save path with no surface at all.

### 3.4 Reconnection: the browser's EventSource, and one scale defect

Pascal writes **no** reconnection code. `apps/editor/components/scene-loader.tsx:199`:

```tsx
const source = new EventSource(`/api/scenes/${meta.id}/events`)
```

The retry policy is one server-sent line (`app/api/scenes/[id]/events/route.ts:71`):

```ts
enqueue('retry: 1000\n\n')
```

**Fixed 1 000 ms. No exponential backoff, no jitter, no cap, no attempt counter, no circuit
breaker, no offline suspension** — `grep -rn "navigator.onLine\|addEventListener('online'"
packages apps` → **0 hits**. A server outage produces one reconnect per second per open tab,
indefinitely, from every client at once — a thundering herd with no damping.

The error surface is a single string (`scene-loader.tsx:220–224`):

```tsx
source.addEventListener('error', () => {
  if (source.readyState === EventSource.CLOSED) setSaveError('Live scene connection closed')
})
```

⚠ `EventSource.CLOSED` is the *terminal* state. During normal `CONNECTING` retry churn this
handler does nothing — the user sees no indication that live sync is down.

**What Pascal gets RIGHT here, and PRYZM does not have an equivalent of:** gap-free cursor resume.
The route honours `Last-Event-ID` (`:40`) and merges it with `?after=` (`:38–45`), and emits `id:`
on every event (`:81`), so the browser's automatic reconnect resumes **exactly** where it stopped —
no clock, no timestamp, a monotonic integer cursor.

⚠ **Scale defect, read from the code (not executed):** on a *first* connect there is no
`Last-Event-ID` and no `?after=`, so `cursor = 0` and the server replays **the entire
`scene_events` history**, 50 rows per 250 ms (`:14–16`), **each row a complete scene graph**
(`sqlite-scene-store.ts:557`). The client then discards most of them at
`if (payload.version <= versionRef.current) return` (`scene-loader.tsx:209`) — after paying the
bandwidth. For a scene with 5 000 accumulated events at 115 KB each that is ≈575 MB streamed and
thrown away over ≈25 s. The table is **never pruned** (§2.5). This does not bite today only because
`scene_events` is written by nothing but MCP live-sync.

⚠ **Second, structural:** the SSE route **polls SQLite every 250 ms per connected client**
(`:91`). N viewers of one scene = 4N queries/second, forever, on a single-file WAL database.
There is no pub/sub, no `LISTEN/NOTIFY`, no shared poller. That is almost certainly why the hosted
deployment moved to Supabase Realtime `postgres_changes` — this design does not scale, and Pascal
appears to know it.

### 3.5 The wipe guards — Pascal's best work, and PRYZM has no equivalent

Pascal has been bitten by scene-wipes and built **three layers** of defence, each documented with
the incident that produced it.

**Layer 1 — client autosave.** `packages/editor/src/hooks/use-auto-save.ts:5–47`:

```ts
const STRUCTURAL_NODE_COUNT = 4
export function isSuspiciousNodeDrop(previousNodeCount: number, currentNodeCount: number) {
  return previousNodeCount > STRUCTURAL_NODE_COUNT && currentNodeCount <= STRUCTURAL_NODE_COUNT
}
```

with a tracker whose whole point is stated in its docstring: *"a graph that came from storage is
authoritative and has to become the new baseline, while an edited or previewed graph must not.
Seeding the baseline once at mount is not enough — the hook mounts before the scene has loaded."*

**Layer 2 — the unload flush, as a pure function.** `use-auto-save.ts:49–75`:

```ts
export type ExitFlushDecision = 'skip-clean' | 'skip-loading' | 'blocked-suspicious' | 'flush'
export function decideExitFlush(opts: { isLoadingScene, hasDirtyChanges, storedNodeCount, currentNodeCount }): ExitFlushDecision {
  if (!opts.hasDirtyChanges) return 'skip-clean'
  if (opts.isLoadingScene)   return 'skip-loading'
  if (isSuspiciousNodeDrop(opts.storedNodeCount, opts.currentNodeCount)) return 'blocked-suspicious'
  return 'flush'
}
```

⭐ **`skip-loading` is the load-bearing branch and Pascal says so:** *"while a scene load is in
flight the store passes through an intermediate `unloadScene()` state — zero nodes, zero roots —
that is NOT user data. A flush fired in that window … used to serialize that empty store and PUT it
over the server copy, wiping the scene at v2. **The dirty flag alone cannot protect here**:
document-level writes that land before hydration … mark the session dirty without any user edit."*

**Layer 3 — the server refuses.** `apps/editor/lib/empty-graph-guard.ts` + the route
(`app/api/scenes/[id]/route.ts:96–110`) return **409 `empty_graph_rejected`** with the node counts,
overridable only by an explicit `"force": true` documented in the request schema (`:22–29`).
There is a **real integration test** driving the real route against a real SQLite temp DB
(`apps/editor/lib/api-put-empty-guard.test.ts:1–12`).

⭐ The rationale is a trade stated in both numbers, which is exactly the standard PRYZM's own
contracts demand: *"Losing a save of a legitimately-emptied scene is far rarer and is recoverable
(`scene_revisions` keeps every version), so the trade is blocking empty overwrites by default."*

**Unload durability:** `keepalive: true` only on the exit flush, with the reason —
*"Browsers cap keepalive bodies at 64 KB, so only the unload flush opts in"* (`scene-loader.tsx:160–164`).

### 3.6 Undo: in-memory, bounded, never persisted

`packages/core/src/store/use-scene.ts:1581–1592` — zustand + `zundo`:

```ts
{ partialize: (state) => sceneHistorySnapshotFromState(state),
  equality: (pastState, currentState) => areSceneSnapshotsEqual(pastState, currentState),
  onSave: (pastState, currentState) => notifySceneCommit({ origin: 'local', … }),
  limit: 50, }   // Limit to last 50 actions
```

50 full snapshots, structurally shared, **in RAM only**, cleared on every load
(`packages/editor/src/lib/scene.ts:404`). `history-control.ts` adds depth-counted pause leases
(`pauseSceneHistory` / `acquireSceneHistoryPause`, `:186–220`) and
`runAsSingleSceneHistoryStep` (`:249–275`), which collapses a multi-write operation into one undo
entry and **removes the entry entirely** if the operation turned out to be a semantic no-op.

⭐ **This is the single decision that produces the 76× persistence gap in §2.5.**
Pascal's history is a *session* artefact. PRYZM's is a *document* artefact.

### 3.7 API security and wire validation

`apps/editor/lib/scene-api-security.ts` is genuinely good for what it is: origin allowlist with
loopback exemption (`:118–133`), `timingSafeEqual` token compare (`:104–109`),
120 req/min/IP in-process bucket (`:78–100`), `X-Content-Type-Options: nosniff` and
`Cache-Control: no-store` on every response (`:45–57`), and correct `Vary: Origin`.

⚠ The rate limiter is a module-level `Map` (`:14`) — per process, not per deployment. On
serverless/multi-instance it is decorative. Pascal does not say so.

⭐ **`apps/editor/lib/graph-schema.ts` is the strongest single file in Pascal's API layer, and
PRYZM has nothing equivalent.** It re-parses every node at the untrusted boundary against the
`AssetUrl` allowlist, with an explicitly reasoned foreign-node envelope for plugin-minted kinds
(`:31–35`), C0-control stripping before scheme matching (`:56–58`), and **DoS bounds on the walk**:

```ts
// A walk over attacker-shaped JSON needs both bounds: depth, so a nest of
// arrays can't overflow the stack (an exception thrown past `safeParse` is a
// 500, not the 400 the caller is owed), and a visit count, so a wide-but-flat
// body can't burn the request budget.
const MAX_SCAN_DEPTH = 48
const MAX_SCAN_VALUES = 50_000
```

It names the two bugs it closes: *"Phase 8 P4 found the POST bypass; Phase 10 A2 found the PUT bypass."*

---

## 4. PRYZM's design

### 4.1 Two collaboration systems, only one deployed

**Deployed: socket.io command rebroadcast.** `server.js:485–745`. Membership-checked join
(`:546–598`), `_socketInProjectRoom` re-check on every message (`:613`, `§B2`), payload schema
validation (`:607`), a persisted `project_command_log` for catch-up (`:625–646`) with
**probabilistic 24 h retention cleanup at ~2 % of inserts** (`:650–668` — a cron-less bound),
then rebroadcast with the log row id attached (`:674–679`):

```js
socket.to(`project:${data.projectId}`).emit('remote-command', {
    ...data, userId: socket.data.userId, commandLogId: logId,
});
```

Client: `apps/editor/src/engine/initCollaboration.ts` (1 092 L). It reconstructs the typed command
via `CommandRegistry` and executes it with `source: 'REMOTE'` to suppress re-broadcast (`:633–687`),
and performs a catch-up fetch on every (re)connect (`:821–900`).

⭐ **`nextCatchUpBaseline` (`initCollaboration.ts:268–278`) is a small masterpiece of a fix**, and
its header is the kind of reasoning Pascal's codebase does not contain an example of:

```ts
/* ROOT CAUSE this closes (BASELINE DRIFT): the baseline is sent to the server as
 * `?since=` and compared there against `project_command_log.created_at` — a SERVER
 * timestamp. The old code stamped it from the CLIENT clock …
 *   • client clock BEHIND the server → the baseline never advances … so EVERY
 *     reconnect re-requests the same window forever … that is the founder's model
 *     mutating itself "after a while without touching the project".
 *   • client clock AHEAD of the server → a peer's real edits are silently SKIPPED.
 * The baseline is therefore advanced ONLY in server time … When neither is
 * available the PREVIOUS baseline is kept rather than guessed — a stale baseline
 * costs one redundant (and now idempotent) request; a wrong one loses data. */
```

⚠ **What the deployed path does NOT have:** total ordering (socket.io fan-out is per-socket, not
linearised), any conflict detection, or any convergence guarantee. `C08 §3.1` calls the v0
semantics LWW. Two users moving the same wall converge only by luck of arrival order.

**Undeployed: the CRDT stack.** `packages/sync-client/` (4 978 L) + `apps/sync-server/`.
`apps/sync-server` appears in **zero** deploy workflow (`grep -rn "sync-server" .github/workflows/`
→ 0 hits); `fly.toml` deploys the Express+Vite+socket.io machine only. The client gate
(`apps/editor/src/engine/engineLauncher.ts:1265–1271`):

```ts
const _syncUrl = _win.__pryzmSyncUrl ?? _env['VITE_SYNC_URL'];
const _flagOn  = _win.__pryzmCollabCrdt === true || _env['VITE_COLLAB_CRDT'] === 'true';
…
enabled: _flagOn && Boolean(_syncUrl),          // OFF unless BOTH
```

producing the log line the brief quotes:
`L-391: CRDT websocket provider OFF (flag/url unset) — solo/socket.io path unchanged` (`:1295`).

⭐ The gate is **fail-loud, not fail-quiet** (`:1274–1279`): if the flag is on but no session token
is available it warns by name rather than opening a socket that "will be refused and
reconnect-looped forever with no explanation."

### 4.2 The conflict model — the strongest artefact in either repository

**The declaration table.** `packages/sync-client/src/syncDisposition.ts` (1 206 L). Its header
records the defect it closes, and the defect is precisely the "confident wrong value" class:

```
//     const elementId = String(payload['id'] ?? '');
//     if (!elementId) return;            // ← SILENT DROP
//
// Every `*.create` verb keys its payload `id`. Essentially no PROPERTY-MUTATION
// verb does: they key `wallId`, `elementId`, `slabId`, … The consequence was not
// "property sync is approximate"; it was that a collaborator's document kept the
// value from element CREATION forever … A raises a wall to 5 m, B's document
// still says 3 m — confidently, not emptily.
```

The fix is a **declaration**, not a special case: for each command type, where the subject id
lives and where the properties live. `'disclose'` is the default; `'last-writer-wins'` requires a
written `lwwReason` and is a **gate failure** without one.

**The disclosure mechanism.** `YjsDocAdapter._discloseOverwrittenLocalWrites`
(`packages/sync-client/src/YjsDocAdapter.ts:1050–1090`) emits a `CRDTConflict` for every property
where *both* this client authored an un-exchanged value *and* the merged document now holds a
different one. It has a per-property (not per-doc) lifecycle with three exit cases and a
`_PENDING_WRITE_TTL_MS = 10 * 60_000` (`:1048`), and the header records the regression that
forced the per-property redesign:

```
// §PENDING-PER-PROP — cleanup is PER PROPERTY, never per doc. This method used to
// end with `this._localPendingWrites.delete(docKey)`, wiping the whole doc's
// bookkeeping after ANY merge … (check-conflict-surfacing S2-INTERVENING:
// 103/103 SILENT, 2026-08-14). The first merge worked; the second is where P8
// stopped holding.
```

**The gate.** `tools/rac-conformance/certification/gates/check-conflict-surfacing.ts`, live
reading in §2.3: **402 real merges driven, 268 that genuinely discarded authored state, 0 SILENT**,
against a **NAMED ledger of 0**, hard-0, no baseline. Arm C proves the detector is not deaf by
**planting a silent merge and requiring it to be flagged by its exact key**, and Arm D proves the
artefact reaches a subscriber. It also names its own six unproven axes — the wire is simulated,
the store leg is unmeasured, artefact *quality* is unmeasured, one probe property per disposition,
structural loss out of scope, Arm D is name-shaped.

⚠ **And the whole thing is UNREACHABLE in production.** `syncDisposition.ts:40–44` says so itself:

```
// Declaring a verb here … does NOT mean the receiving CLIENT re-renders — no code
// reads the canonical element map back into local stores yet, and no CRDT transport
// is deployed in production (L-391).
```

Measured: `elementSyncReader.ts` (330 L) has **zero production consumers** —
`grep -rn "elementSyncReader"` → the file, the barrel, one test.

### 4.3 Persistence: v2 container, incremental compression, and a journal that dwarfs the model

`apps/editor/src/ui/platform/ProjectRepository.ts` (1 826 L). Container format
(`:161–174`) is `V2_CONTAINER_MARKER + JSON.stringify([{ i: versionId, b: deflate(record) }, …])`
— per-version blobs so a save can carry 19 unchanged versions forward **as bytes** without decoding
them (`_PendingSlot`, `:176–186`), backed by a per-project blob cache (`:209–216`). Read path
understands v2, legacy v1 whole-array, and raw JSON, flag-independently (`:1218–1251`).

Narrow open: `getLatestVersion` (`:1167`) decodes exactly one blob — **503 ms → 31 ms, 16×**
per the docstring at `:963`. And `countVersions` **503 ms → 15 ms, 33×** (`:931`).

Honesty instrumentation is unusually good:
* `_formatPayloadSize` (`:203`) exists because the log **overstated the payload by 2×** —
  *"a number presented as measured that no instrument produced"* (`:190–202`).
* `§PROBE-OPEN-PATH-STORAGE-LEG` (`:1148–1205`) splits mirror-read / envelope-parse / inflate /
  record-parse with four `performance.now()` reads, prints container size, inflated size and the
  journal's mutation+edge counts, and ends the line
  `= N ms before the loader has seen a single element.`
  ⭐ It explicitly declines to claim it makes opening faster: *"It makes the next open **say where
  the time goes**, which is the precondition the previous three perf attempts in this area skipped."*

**The defect.** `C05 §3.5` (binding) and `ISSUE-LOG L-8704`:

> *281 elements … `temporalGraph` **30 432 mutations**, integrity suffix `0x8639ce` = **8 796 110
> characters** … The model is ~1 % of the snapshot. **The journal is the rest** — and it is embedded
> **whole** in each of 20 versions … whose journals are near-identical because a journal is
> append-only: version n is version n−1 plus a handful of records.*

Storing it **once per project** with versions holding a cursor: **≈36.8 MB → ≈2.4 MB (≈15×)** on
every write and every open, **no record dropped**. ⛔ **OPEN, founder's decision, and the fix is
never deletion.**

### 4.4 Reconnection: `ServerSyncQueue` — the best retry implementation in either repository

`apps/editor/src/ui/platform/ServerSyncQueue.ts` (1 068 L):

| Property | Value | Locator |
|---|---|---|
| Exponential backoff | `[5 s, 15 s, 45 s, 2 min, 5 min]` | `:38` |
| Circuit breaker | open after **5** consecutive server-health failures, **30 s** cooldown floor, half-open single-item probe | `:56–57`, header `:44–55` |
| Offline suspension | `navigator.onLine` + `online`/`offline` listeners; flush is gated on `isOnline` | `:239, :330–341, :651` |
| Cross-reload durability | queue persisted to `localStorage` key `pryzm-sync-queue`, **byte-budgeted at 1.5 MB**, newest-first | `:62, :114` |
| Idempotency | `X-Idempotency-Key: version.id` on every POST | `:725` |
| Optimistic locking | `If-Match: "v${expectedCount}"`, omitted when the count is unknown (server reads absent as "no precondition") | `:717–729` |
| No silent eviction | evicts only a **superseded** item; otherwise **refuses the enqueue and surfaces it** | `:64–86` |
| Hard ceiling | `MAX_QUEUE_ITEMS = 50` scheduling target, `HARD_QUEUE_CEILING = 250` absolute | `:86, :94` |

The circuit breaker's header records the incident that produced it — *"the 2026-07-06
DB-saturation cascade was AMPLIFIED by this queue … a positive-feedback spiral"* — and states its
invariant: *"the breaker only ever ADDS delay (a sane floor), never removes it."*

Server-side, `migrations_in_progress` (`server/pgClient.js:338–364`) gates `/api/v1` on
`_migrationsSettled` — *"settled"*, not *"ready"* — with the recorded failure mode being a rejected
module-eval leaving it false forever.

⭐ **And there is a SECOND retry ladder I initially missed — client-side, in
`packages/persistence-client/src/ProjectListClient.ts`.** It is separate from `ServerSyncQueue`
(that one carries version uploads; this one carries project list/create/duplicate calls) and it is
the better-reasoned of the two:

| Property | Value | Locator |
|---|---|---|
| **Two distinct retry classes, different budgets** | transport failure (fetch rejected / timed out): **2** retries, linear **400 ms → 800 ms**. Migrations-503: its own **60 s wall-clock budget**, exponential **1 s → 2 s → 4 s → 8 s** capped | `:436–451` |
| ⭐ **Honours the server's `Retry-After`** | `max(exponentialTerm, retryAfter)` — *"so we never poll faster than it asked"*. Parses **both** the delta-seconds and the HTTP-date forms | `:475–494` |
| ⭐ **Deliberately narrow retry predicate** | retries **only** a 503 whose JSON body carries `code:'migrations_in_progress'`. *"A bare 503 (or any other 5xx) is NOT treated as retriable here, so we never retry-storm a genuinely unavailable upstream."* Every other 4xx/5xx throws on first hit | `:464–473`, `:422–423` |
| **Idempotency reasoned explicitly** | re-attempting a non-idempotent POST is justified per path: connection-refused ⇒ *"the server never saw it"*; migrations-503 ⇒ *"the gate runs BEFORE the route handler so no row is ever written"* | `:356–361` |
| **Provably bounded** | wall-clock budget is the real ceiling, plus `MAX_TOTAL_ATTEMPTS = 128` as *"belt-and-suspenders against a pathological zero-length sleep"* | `:366–369, :451` |
| **Typed, `retriable` error kinds** | `'timeout'` vs `'migrations'` vs `'network-error'` so the UI shows a retry affordance instead of a terminal error | `:28–51` |

The operational half is in `fly.toml:51–60`: **blue-green deploy** exists specifically so users
never see the gate — the green machine must pass `/api/health/ready` (`SELECT 1` + boot migrations
done) *before* traffic switches, because a rolling deploy on one always-on machine produced a
*"~30-90s window with NO healthy instance where the whole site 503s"* (incident 2026-07-06).

### 4.5 The server write path

`server.js:3574–3700`: `authMiddleware` → project-id validation (400) → `If-Match` parse →
**50 MB snapshot cap** (`:3601`) → Zod (`.passthrough()`, strict only on the `furniture` array,
`:3616–3646`) → idempotency dedup on `X-Idempotency-Key` (`:3653–3695`) → plan-based version limit
(`:3658–3676`).

⚠ **The Zod schema is `passthrough` and performs no scan of the payload's string values.**
`grep -rn "javascript:\|isUrlShaped\|AssetUrl"` over `server.js` + `server/*.js` → **0 hits**.
PRYZM has SSRF guards on its *jurisdiction proxies* (`server/jurisdiction/balearsMuibProxy.js:129`)
but **not on the snapshot write path**. Pascal has one (§3.7). See §6 row 4 — I state this as
absence with **unproven impact**, not as a vulnerability.

⚠ **The 50 MB cap is a moving deadline.** The founder's snapshot is 8.8 MB at 30 432 mutations
and the count grew 30 357 → 30 432 in about an hour of editing (`ISSUE-LOG:43920`). Linearly,
the cap is reached at ≈170 000 mutations. The journal fix in §6 row 1 removes this ceiling as a
side effect.

---

## 5. Head-to-head

| Sub-axis | Pascal (file:line) | PRYZM (file:line) | Winner | Why, in one sentence | Evidence |
|---|---|---|---|---|---|
| **5.1 Collaboration model** | SSE full-graph push from `scene_events`; agent→browser only; no CRDT — `app/api/scenes/[id]/events/route.ts:110`, `mcp/src/tools/live-sync.ts:50` | Deployed socket.io command rebroadcast (`server.js:674`) + undeployed Yjs CRDT (`engineLauncher.ts:1265`) | **DIFFERENT-BY-DESIGN** | Pascal accepts **lost concurrent work** in exchange for one trivially-reasoned representation; PRYZM accepts **an unshipped second system and 4 978 lines of maintained complexity** in exchange for a convergence guarantee it does not yet run. | §3.3(a); §4.1; `grep "sync-server" .github/workflows/` → 0 |
| **5.2 Convergence guarantee** | none — whole-scene LWW gated by `If-Match`; loser is refused (`[id]/route.ts:216`) | Yjs converges by construction, but the transport is off | **DIFFERENT-BY-DESIGN** | Pascal's failure is **a user told to discard their work**; PRYZM's failure is **arrival-order LWW in the path that actually ships**, i.e. the same outcome with no refusal to warn you. | `scene-loader.tsx:236–261`; `C08 §3.1` |
| **5.3 Conflict granularity** | **whole scene** — two users on different walls conflict identically | **per element per property** — 339 declared verbs, 136 replicated | **PRYZM** | Pascal cannot express "you changed height, they changed thickness"; PRYZM's disposition table is exactly that expression. | `syncDisposition.ts:110–…`; gate ARM A |
| **5.4 Silent data loss on merge** | **YES, and unrecoverable** — `applySceneGraphToEditor` full-replaces the store then `clearSceneHistory()` | **0 SILENT** across 402 driven merges, hard-0 ledger, with a planted-silent control | **PRYZM** | Pascal's remote apply destroys unsaved local edits *and* the undo stack that could recover them, with no surface; PRYZM has an executed gate proving the opposite. | `scene-loader.tsx:215` → `scene.ts:389–404`; §2.3 |
| **5.5 Is the conflict machinery reachable?** | Pascal's 409 modal: **YES**, it is the shipped path | PRYZM's disclosure: **NO** — no CRDT transport deployed, `elementSyncReader` has 0 production consumers | **PASCAL** | A crude conflict surface a user actually sees beats a rigorous one gated behind a flag that is off. | `syncDisposition.ts:40–44`; `grep elementSyncReader` → 3 files |
| **5.6 Optimistic locking** | RFC-7232 `If-Match`/`ETag`, weak+wildcard forms, 409 carries `currentVersion` | `If-Match: "v${count}"`, 412 + `{expected, actual}`, checked inside `FOR UPDATE` on the PG path | **EQUAL** | Both do real compare-and-swap inside the write transaction; Pascal's is more standards-correct, PRYZM's is idempotency-keyed. | `[id]/route.ts:180–195`; `server.js:3588–3595`, `ServerSyncQueue.ts:717–729` |
| **5.7 Retry / backoff** | **`retry: 1000` and nothing else** on SSE; no backoff, jitter, cap, attempt counter, breaker or offline suspension. On the save path the client special-cases **exactly one** status (409) — every other failure is `setSaveError('Save failed (' + status + ')')` with **no retry of any kind** | **TWO** ladders: `ServerSyncQueue` (5-step exponential, circuit breaker 5/30 s, offline suspend+resume, persisted byte-budgeted queue, idempotency key, no-silent-eviction) **and** `ProjectListClient` (split transport/migrations budgets, `Retry-After`-honouring, narrow retry predicate, bounded) | **PRYZM — decisively** | Pascal delegates entirely to the browser and would thundering-herd a recovering server; PRYZM has two independently-reasoned ladders, each born from a named production incident. | `events/route.ts:71`; `scene-loader.tsx:167, 182`; `grep navigator.onLine pascal` → 0; `ServerSyncQueue.ts:38–114`; `ProjectListClient.ts:436–494` |
| **5.7b `Retry-After` handling** | **sends it, never reads it** — 2 emit sites (`scene-api-security.ts:94`, `mcp/transports/http.ts:212`), **0** client-side consumers | **sends and reads it**, delta-seconds *and* HTTP-date forms, taken as `max(exponential, retryAfter)` | **PRYZM** | Pascal tells clients how long to wait and then ignores its own advice; PRYZM never polls faster than the server asked. | `grep -rn "retry-after\|retryAfter" pascal packages apps` → 3 hits, all emit; `ProjectListClient.ts:475–494` |
| **5.8 Gap-free resume** | **`Last-Event-ID` + monotonic `event_id` cursor** — exact, clock-free | timestamp `?since=` against a **server** clock, with `nextCatchUpBaseline` closing the drift | **PASCAL** | An integer cursor cannot drift; PRYZM needed a documented bug and a pure function to make a timestamp safe, and it still keeps the previous baseline when it cannot advance. | `events/route.ts:38–45, 81`; `initCollaboration.ts:244–278` |
| **5.9 Wipe / empty-overwrite guards** | **three layers**: client tracker, pure `decideExitFlush` with a `skip-loading` branch, server 409 `empty_graph_rejected` + `force`, real integration test | **ABSENT** — `rg "isSuspiciousNodeDrop\|isEmptyGraphOverwrite\|empty_snapshot_rejected\|empty_graph_rejected" apps/editor/src` → **0 files** (repo-wide sweep timed out; scoped to the save path, which is where it would live) | **PASCAL** | Pascal identified the pre-hydration flush as a distinct failure from a dirty flag and encoded it three times; PRYZM has no equivalent check on either side. | `use-auto-save.ts:5–75`; `[id]/route.ts:96–110`; `api-put-empty-guard.test.ts` |
| **5.10 Persistence shape (client)** | **nothing stored** except a single-key localStorage fallback | 20-version v2 container, deflated, IndexedDB-mirrored | **DIFFERENT-BY-DESIGN** | Pascal accepts **a server round-trip on every open and no offline history**; PRYZM accepts **36.8 MB of client storage and a multi-minute open** to have local versions. | `scene.ts:409–426`; `ProjectRepository.ts:141–174` |
| **5.11 Persistence cost, one 281-element model** | **115 KB/version**, 2.35 MB for 21 server copies | **1.84 MB/version deflated (8.8 MB inflated)**, **36.8 MB** container | **PASCAL** | Both models are ~400 bytes/element; PRYZM's extra ~99 % is the temporal journal duplicated 20×, which is the whole gap and is fixable without dropping a record. | §2.5; `C05 §3.5:310`; `ISSUE-LOG:43891` |
| **5.12 History pruning** | **NONE** — `scene_revisions` + `scene_events` grow forever, each row a whole graph | ring buffer of 20 | **PRYZM** | Pascal's server-side growth is unbounded and its `scene_events` replay-from-zero makes it a live scale defect, not just a disk cost. | `grep "DELETE FROM scene_events\|prune\|VACUUM"` → 0; §3.4 |
| **5.13 Undo model** | 50 snapshots in RAM, cleared on load, **never persisted**; depth-counted pause leases; no-op steps removed | persisted `temporalGraph`, restored on load, **inside every version** | **DIFFERENT-BY-DESIGN** | Pascal accepts **losing undo across a reload**; PRYZM accepts **a document that grows with its own edit history** to keep design provenance. | `use-scene.ts:1591`, `scene.ts:404`; `C05 §3.5` |
| **5.14 Live-push scalability** | **250 ms SQLite poll per connected client** (4N q/s), full graph per event, replay-from-zero on first connect | socket.io fan-out, no polling; command payloads not full graphs | **PRYZM** | Pascal's OSS SSE cannot scale past a handful of clients per scene, which is visibly why the hosted app uses Supabase Realtime instead. | `events/route.ts:14, 91`; `server.js:674` |
| **5.15 Observability — production diagnosis** | prose `console.*` only in OSS (134 sites); the structured `realtime-observability` stream is **closed** and unauditable here | **80** `console.*` on the sync path; OTel spans **266/266 Zone A but no-op in the browser**; **0** structured-JSON events | **DIFFERENT-BY-DESIGN** *(see note)* | Both are diagnosed in practice by reading console prose; PRYZM additionally carries span instrumentation that records nothing in production, and Pascal additionally ships a structured stream I cannot read. | §2.4 |
| **5.16 Observability — what actually diagnosed a real bug** | n/a in OSS | ⭐ PRYZM's console prose **did the job**: three container-size lines resolved L-8702, and a hex integrity suffix resolved L-8700 | **PRYZM** | The instrument that found four defects in one session is the one that exists and prints numbers — but it needed a human to decode a hex suffix, which is exactly what L-8701 then fixed. | `ISSUE-LOG:43803–43860` |
| **5.17 Telemetry design quality** | **cannot assess** (closed) | span catalogue frozen (`sync-server/src/otel.ts:38–43`), spans on every wiring seam | **NOT ESTABLISHED** | The founder's capture shows Pascal names channel, component, status, attempt, network state and visibility — but I could not read the code that emits it. | §1.3, §8.1 |
| **5.18 Multi-tenancy** | **ABSENT in OSS** — one shared deployment token, `owner_id` stored and never checked, no auth framework, no RLS | per-user JWT, `authMiddleware` on every route, membership check on socket join, `PgAuthz` against `project_members`, C13 + C48 gates | **PRYZM** | Pascal's OSS scene API grants any token-bearer full CRUD on every scene id; PRYZM has an authorization boundary, an isolation contract, and a gate that runs. | `scene-api-security.ts:67–77`; `grep ownerId apps/editor` → 2 pass-throughs; `npm run check:isolation` |
| **5.19 Fail-closed posture** | `PASCAL_SCENE_API_TOKEN` absent + non-loopback ⇒ **503**, refuses to serve | `WsAuthGate` `deny-all` when `SESSION_SECRET` absent (`auth/WsAuthGate.ts:39–51`) — but `PRYZM_AUTHZ_MODE` still **defaults to `memory-allow-by-default`**, i.e. **no policy** | **PASCAL** | Pascal's omission fails closed; PRYZM's authz omission yields "every signed-in user may enter every room they can name", and `policies.ts:22–46` says so in its own words. | `scene-api-security.ts:69–72`; `apps/sync-server/src/authz/policies.ts:22–46` |
| **5.20 Untrusted-payload validation** | **AssetUrl allowlist re-parsed per node**, foreign-node envelope, C0-control stripping, `MAX_SCAN_DEPTH 48` / `MAX_SCAN_VALUES 50 000` | Zod `.passthrough()`, strict only on `furniture`; **no URL-shaped-string scan** on the snapshot path | **PASCAL** | Pascal treats the graph body as attacker-shaped and bounds the walk; PRYZM validates shape but never inspects string values. | `graph-schema.ts:38–61`; `server.js:3616–3646`; `grep AssetUrl server.js` → 0 |
| **5.21 Architectural enforcement** | **1** architecture test (no runtime `three` in core) with an anti-vacuity guard | **69** ga-gates + **48** rac-conformance gates, ratchets, named ledgers, planted controls | **PRYZM** | Not close — but note Pascal's single test includes `expect(files.length).toBeGreaterThan(100)` to stop it passing vacuously, which several PRYZM gates learned the hard way. | `architecture.test.ts:47`; `ls tools/ga-gate/*.ts \| wc -l` |
| **5.22 Documented-reasoning density** | very high on the persistence/wipe path — every guard names its incident and states its trade in both directions | very high everywhere, with dated corrections and retracted claims | **EQUAL** | Both codebases write the reason next to the code; this is the trait they most share and the one most worth protecting in each. | `empty-graph-guard.ts:1–12`; `syncDisposition.ts:1–44` |

### 5.23 ⭐ The bet, stated as two accepted failures

Because §5.1/§5.2 are `DIFFERENT-BY-DESIGN`, the useful answer is not a winner but the exact trade:

**Pascal accepts: LOST WORK.**
Whole-scene LWW means concurrent editing has no merge. The refusal path (409 + "Reload") is at
least *visible*; the SSE path (`applySceneGraphToEditor` + `clearSceneHistory`) is *not*, and
destroys the undo stack that could have recovered it. In exchange Pascal gets: one representation,
one code path, a store you can `SELECT * FROM scenes` and read, `scene_revisions` as a real
recovery mechanism, and **an engineer can hold the whole model in their head**.

**PRYZM accepts: UNSHIPPED COMPLEXITY.**
4 978 lines of CRDT client, an entire `apps/sync-server`, a 339-row disposition table, a
1 373-line adapter and a hard-0 conformance gate — **none of which runs in production**. The path
that *does* run (socket.io rebroadcast) has the same arrival-order LWW semantics as Pascal's, with
*less* protection than Pascal's, because there is no `If-Match` on the live path at all. In
exchange PRYZM gets: a convergence guarantee that is *correct when switched on*, a conflict
vocabulary Pascal cannot express, and the only executed proof of no-silent-loss in either repo.

⛔ **The honest reading: PRYZM has paid for the harder design and is not yet collecting.**
Pascal has not paid, and is losing work it does not measure.

---

## 6. What PRYZM should adopt

Ranked by value-over-cost. Each row is executable by a lane that has not read this audit.

| # | Change | Files to touch | Effort | Value | Risk | Blast radius | Contract / ADR impact | Prerequisite |
|---|---|---|---|---|---|---|---|---|
| **1** | ⭐ **SHIPPED 2026-08-23 — lane PERF5, founder-approved.** `C05 §3.8` (binding) + ISSUE-LOG `L-9980`…`L-9985`. MEASURED at the founder exact shape (`tools/perf/bench-journal-sidecar.mjs`): container **34.33 MB → 2.32 MB, 14.8×**, journal records **30 432 → 30 432 (nothing dropped)**, autosave DEFLATE **28×**, version panel **9.6×**. ⚠ The COLD open is ≈ unchanged (245 → 222 ms) — the loader needs the journal; what an open sheds is the 14.8× smaller IndexedDB read, which only `§PROBE-OPEN-PATH-STORAGE-LEG` can report. The server half is deliberately NOT done (L-9985). — **Store the temporal journal ONCE per project; versions hold a cursor.** Move `snapshot.temporalGraph` out of `VersionRecord.snapshot` into a per-project append-only side store (IndexedDB object store + a `project_journal` server table). Each `VersionRecord` gains `journalCursor: number` = the mutation index at stamp time. `TemporalGraphManager.deserialize()` reads journal[0..cursor]. ⛔ **Do not delete a single record** — the fix is to stop *copying*, never to trim. **Proof it worked:** `§PROBE-OPEN-PATH-STORAGE-LEG` prints `container ~2.4 MB` instead of `~36.8 MB` for the founder's project, and `temporalGraph N mutations` is unchanged at 30 432. | `apps/editor/src/ui/platform/ProjectRepository.ts` (container read/write, `_PendingSlot`, `_decodeVersionsPayload`), `apps/editor/src/ui/platform/PlatformShellTypes.ts` (`VersionRecord`), `ProjectSerializer.ts`, `TemporalGraphManager.serialize/deserialize`, `server.js:3574` (versions POST), `server/dbMigrate.js` | **L** | **~15× on every write and every open** (36.8 MB → ~2.4 MB, `C05 §3.5` box). Removes the 50 MB POST cap as a growth ceiling. Directly answers *"opens take minutes, should be 10 s"* | **M** — a persistence format change; needs a legacy-container read path exactly as v1/v2 already coexist (`ProjectRepository.ts:1218–1251` is the pattern to copy) | every save, every open, version history panel, server versions API | **`C05 §3.5` already binds this position**; needs a `C05 §3.8` for the sidecar format + an ADR superseding nothing. `ISSUE-LOG L-8704` + `L-5823` are the costings | ⛔ **FOUNDER DECISION — L-8704 is OPEN.** It is his design history. Do not start without it |
| **2** | ⭐ **Port Pascal's three-layer empty/collapse-overwrite guard.** (a) a `decideExitFlush`-equivalent pure function gating the unload/teardown save on `isLoadingProject` — PRYZM's `setLoading` latch already exists (`C05:233`) but nothing consumes it as a *save veto*; (b) a stored-element-count tracker refusing a write that drops a populated project to a bare scaffold; (c) **server-side**: reject a version POST whose `elementCount` is 0 against a project whose latest version has elements, `409 empty_snapshot_rejected`, overridable by `force: true`. **Proof:** a unit test that drives the pure decider through all four branches, plus an integration test POSTing an empty snapshot over a populated project and asserting 409 | new `apps/editor/src/ui/platform/saveWipeGuard.ts`; `PlatformSaveController.ts:77`; `SaveOrchestrator.ts`; `ProjectRepository.ts` (write path); `server.js:3574–3610` | **S** | Closes an entire **unmeasured** loss class. PRYZM has **0** guards here (`grep "empty_graph\|isSuspiciousNodeDrop"` → 0) and *does* have a documented pre-hydration window (`C05:233`) — the exposure is real | **Low** — pure additive refusals with an explicit `force` escape | save path only | New `C05 §3.9`; no ADR needed | none |
| **3** | ⭐ **Turn PRYZM's spans on, or stop counting them.** Register the tracer provider in the browser: read the flag from `import.meta.env.VITE_PRYZM_TRACING` in addition to `process.env` (`Tracing.ts:79–92`), declare `VITE_PRYZM_TRACING` in `tools/ga-gate/secrets-declarations.json`, and add an arm to `check-otel-spans.ts` that fails when **no** provider registration is reachable from the composition root. ⛔ **Until this ships, `ZONE A 266/266` must be reported as "instrumented in source, recording nothing in production."** **Proof:** `isTracingEnabled()` returns true in a production build smoke test | `packages/crash-reporter/src/Tracing.ts:79–113`; `packages/runtime-composer/src/composeRuntime.ts:926`; `tools/ga-gate/secrets-declarations.json`; `tools/ga-gate/check-otel-spans.ts`; `fly.toml` | **S** | Converts the single largest *claimed* observability asset from decorative to real; a gate that counts unrecorded spans is measuring source text, not behaviour | **Low** — off by default preserved; opt-in by env | telemetry only | `STR-03 §2` P8 row; `C10 §2` | none |
| **4** | **Scan the snapshot for URL-shaped strings on the server write path.** Port `graph-schema.ts`'s approach: bounded walk (`MAX_SCAN_DEPTH`, `MAX_SCAN_VALUES`), C0-control stripping before scheme matching, allowlist of safe schemes/hosts for every URL-shaped value; reject with 400 naming the JSON path. ⚠ **State the impact honestly first**: run the scan in *report-only* mode for one week and log what it would have rejected, before it refuses anything | `server.js:3616–3646`; new `server/snapshotUrlScan.js`; `server/__tests__/` | **M** | Pascal names two real bypasses it closed (POST and PUT). PRYZM's snapshots carry texture/GLB/CDN URLs and the write path has **no** value-level validation | **M** — a too-eager allowlist rejects legitimate saves; hence report-only first | version POST | `C08 §5`; possibly `C22` (asset hosts) | Enumerate every URL-bearing snapshot field first |
| **5** | **Replace the timestamp catch-up cursor with a monotonic sequence.** `project_command_log` already has an `id`; add a `BIGSERIAL seq`, return `latestSeq` on subscribe, and have the client request `?fromSeq=`. This is exactly `apps/sync-server`'s already-tested protocol (`__tests__/Reconnect.test.ts:31–60` proves replay from `fromSeq`) — **the implementation exists, it is just in the undeployed app.** ⛔ Keep `nextCatchUpBaseline` for legacy rows during the transition | `server.js:625–679` (log insert), the `/api/projects/:id/commands` route, `apps/editor/src/engine/initCollaboration.ts:821–900`, `server/dbMigrate.js` | **M** | Removes a whole class of clock-skew bugs by construction rather than by a pure function that has to be right. Pascal proves the integer-cursor design (§5.8) | **M** — dual-read window while both cursors coexist | collaboration catch-up | `C08 §3.3` | none |
| **6** | **Get the sync/persistence path OUT of `console.*` prose and into one structured event emitter** — `{event, component, projectId, phase, ms, bytes, …}` as JSON, mirrored to `console.debug` so it stays copy-pasteable from the founder's browser. Start with the **9 lines that already carry numbers**: `§PROBE-OPEN-PATH-STORAGE-LEG`, the three `VersionRepository … persisted` lines, `ServerSyncQueue` backoff/breaker transitions, `initCollaboration` connect/disconnect/catch-up. ⭐ This is what Pascal's `realtime-observability` shape gets right and it is the *cheap* half of observability | new `apps/editor/src/ui/platform/syncTelemetry.ts`; `ProjectRepository.ts` (21 sites), `ServerSyncQueue.ts` (24), `initCollaboration.ts` (27) | **M** | L-8700 cost a session because a **hex suffix** had to be reverse-engineered from prose. A machine-parsable line is diffable, greppable and pasteable | **Low** | logging only | `C10`; complements #3 rather than replacing it | Do **not** block on #3 |
| **7** | **Flip `PRYZM_AUTHZ_MODE` default to `pg`, refusing when no DB is reachable.** `apps/sync-server/src/authz/policies.ts:22–46` already contains the full argument, the mitigations and the named escapes — it declines to make the change only because it belongs to the founder. Pascal's equivalent omission fails **closed** (503); PRYZM's fails **open** | `apps/sync-server/src/authz/policies.ts` | **S** | *"A forgotten environment variable should never be the difference between an authorization system and none"* — the file's own words | **M** — breaking for any env without `DATABASE_URL`; both escapes stay reachable **by name** | sync-server only (currently undeployed, so blast radius is ~0 today — which makes now the cheapest moment) | `C08 §2`; ADR-0040 | ⛔ **FOUNDER DECISION**, per the file |
| **8** | **Add `If-Match`-equivalent version gating to the LIVE socket.io path**, or record in `C08 §3.1` that the deployed path is unguarded LWW. Today `command-executed` (`server.js:605`) validates membership and payload shape but carries **no** version precondition — the deployed collaboration path has *less* concurrency protection than the version-save path beside it | `server.js:605–679`; `apps/editor/src/engine/initCollaboration.ts` | **M** | Closes the gap between what `C08 §3` describes and what runs | **M** — rejecting live commands needs a user-visible outcome, or it is a silent drop with extra steps | live collaboration | `C08 §3.1` must change either way | Decide #5 first (a sequence number is the natural precondition) |
| **9** | **Reduce the autosave floor from 2 whole-container writes to 1** by moving `syncStatus` out of the container into a sidecar `id → status` map with the container as fallback — named and costed at `ISSUE-LOG L-8702`, deliberately not shipped blind. ⛔ **Do not solve it by making `synced` transient** — *"the server already has this" is not a claim that may live only in RAM* (`C48`) | `ProjectRepository.ts:258` (`_transientSyncStatus` is the shape to generalise), `PlatformSaveController.ts:77` | **S** | ~18 MB less IndexedDB traffic per autosave **after** #1, ~36.8 MB before | **Low** | save path | `C48 §1.9` | Do **after** #1 — #1 changes the denominator by 15× and may make this unnecessary |
| **10** | **Prune `elementSyncReader` + the CRDT read-back seam, or wire it.** It has 0 production consumers and `syncDisposition.ts:40–44` says the store leg does not exist. Either connect it behind the same `VITE_COLLAB_CRDT` flag so the disclosure path is end-to-end testable, or mark it `@internal` so no lane mistakes it for a live capability | `packages/sync-client/src/elementSyncReader.ts`, `index.ts:116–120` | **S** | Removes an "authored-but-unwired" trap of exactly the class this repo keeps rediscovering | **Low** | sync-client only | none | none |

⛔ **The invariant every row above must protect:**
`tools/rac-conformance/certification/gates/check-conflict-surfacing.ts` must stay **RC=0 with 0
findings against a named ledger of 0**, and its ARM C controls must stay 6/6 — in particular the
**planted-silent-merge** control, which is the only thing proving the detector is not deaf.
Rows 1, 2, 8 and 9 touch code that gate reads; run it before and after.

---

## 7. What PRYZM does BETTER, and must keep deliberately

**7.1 ⭐ The conflict-surfacing gate is, as far as this audit can establish, without peer.**
Not "PRYZM has tests for conflicts" — PRYZM has a gate that **drives 402 real `YjsDocAdapter`
merges**, counts the **268** that genuinely discarded authored state, requires **0 SILENT**, and then
**plants a silent merge on a declared-LWW verb and fails unless the harness names it by its exact
key** (`S1-DIRECT::room.rename::probeSurfacing`). It further proves the artefact reaches a live
subscriber (ARM D) and **enumerates its own six unproven axes** rather than implying completeness.
Pascal has nothing in this class: `grep -rni conflict` over Pascal returns **137** hits, of which
**zero** concern sync — they are spatial collisions, CLI port conflicts and process state.
⛔ **Keep it. Do not let rows 1/2/8 above weaken it, and never absorb a finding into a baseline.**

**7.2 The disposition table's shape — a declaration, not a special case.**
`syncDisposition.ts` fixed a whole-class bug ("essentially no property-mutation verb keys its
payload `id`") by declaring *where the subject lives* per verb, so **a new property on an
already-declared verb needs no new sync code**, and an *undeclared verb is reported, not skipped*
(`getUndeclaredCommandTypes()` + `check-sync-disposition.ts`). `'last-writer-wins'` requires a
written reason and is a gate failure without one — *"a property may be silently converged BY
DECLARATION; never BY OMISSION."* That sentence is the correct policy and Pascal has no analogue.

**7.3 PRYZM has the two best retry implementations in either repository — and they are independent.**
Exponential backoff, a circuit breaker born from a named production incident with the invariant
*"the breaker only ever ADDS delay, never removes it"*, offline suspend/resume, a **byte-budgeted**
persisted queue, idempotency keys, and — the part most codebases get wrong —
**no silent eviction**: it evicts only a genuinely superseded item and otherwise **refuses the
enqueue and surfaces the refusal**, because *"a cap that drops the oldest item without telling
anyone is data loss with a different name."*

`ProjectListClient` (§4.4) is the second, and its restraint is the notable part: it retries
**only** the server's explicit `code:'migrations_in_progress'` 503 and throws on every other 5xx,
*"so we never retry-storm a genuinely unavailable upstream"* — and it takes
`max(exponentialBackoff, Retry-After)` so it never outpaces what the server asked for.
Pascal's entire retry story is one `retry: 1000` line it does not write itself, and it **emits**
`Retry-After` while **reading** it nowhere.

**7.4 Instruments that are honest about being instruments.**
`_formatPayloadSize` exists because a log **overstated by 2×** and that was correctly classified as
*"a number presented as measured that no instrument produced."*
`§PROBE-OPEN-PATH-STORAGE-LEG` explicitly refuses to claim it makes opening faster:
*"It makes the next open say where the time goes, which is the precondition the previous three perf
attempts in this area skipped."* This discipline is why L-8700…L-8704 were four **distinct** roots
and not one tidy wrong story. ⛔ Keep it — it is the reason this audit had numbers to compare against.

**7.5 Multi-tenancy exists at all.**
Per-user JWT, `authMiddleware` on every project route, membership check on socket join,
`PgAuthz` against `project_members`, a C13 isolation contract with a gate that runs, and a C48
storage-scoping gate that passes. Pascal's OSS scene API grants any bearer of one shared token full
CRUD on every scene id and never reads the `owner_id` it stores.

**7.6 Corrections are dated, attributed, and sometimes retract the previous fix.**
`CLAUDE.md`'s own P4 box records a gate that was reported **RED when it was GREEN** — *"stale
pessimistically"* — and `L-8702` explicitly **retires** the "8 characters different" reading from
the previous brief and insists L-8700 and L-8702 are *"two different roots, not one seen twice.
Reporting them as one would have been the tidier story and the wrong one."* Pascal's comments are
excellent but I found no instance of a **retraction**. This is PRYZM's deepest cultural advantage.

**7.7 One thing worth taking FROM Pascal into PRYZM's gate culture, cheaply:**
`packages/core/src/architecture.test.ts:47` ends with
`expect(files.length).toBeGreaterThan(100)` — an **anti-vacuity guard**, one line, so the walk
cannot pass by finding nothing. PRYZM's gates mostly have floors (the conflict gate has five), but
not all do. It is a one-line habit worth making universal.

---

## 8. Not established

Each of these is a **measurement of what I could not reach**, not a guess withheld.

**8.1 Pascal's actual production collaboration layer — Supabase Realtime.**
`grep -rn "realtime-observability"` → 0 files; `grep -rn "postgres_changes"` → 0 files;
`grep -rn "WebSocket\|wss://"` over `packages apps` → 0 hits. The `SceneStore.backend` union
(`types.ts:122`) admits `'supabase'` and **no such store ships**. Therefore I cannot assess:
its channel lifecycle, its reconnect **backoff curve** or what the `attempt` counter does at high
values, whether it degrades to a REST poll or to read-only on `heartbeat timeout`, whether the user
is told, or what its `postgres_changes` payload contains (row deltas vs whole graphs).
**Why not a guess:** inferring a reconnection design from a console line is precisely the failure
mode the brief forbids and this repo has recorded five times.

**8.2 Whether Pascal's hosted app merges concurrent human edits.**
The OSS repo's answer is unambiguous (§3.3): it does not, at any granularity finer than the whole
scene. But `installHistoryCommandDelegate` (`history.ts:26`) publishes an interface with
`mode: 'collaborative'`, `status: 'syncing' | 'offline'` and `persistence: 'queued'`, and it has
**zero production callers** in the OSS tree. Something installs it in the hosted build. I cannot
read it. It may well implement queued, mergeable, offline-capable history — the *seam is shaped for
exactly that.*

**8.3 Whether Pascal's hosted app has multi-tenancy.**
The OSS API has none (§2.7). Supabase RLS is the obvious mechanism and the privacy page names
Supabase as a subprocessor, but **there is not one policy, migration or `.sql` file in the repo**
(`find . -name "*.sql" -not -path "*/node_modules/*"` → 0). ⛔ Do not read "Pascal has no
multi-tenancy" out of this audit; read "the open repository has none, and the hosted one is closed."

**8.4 Pascal's real-world persistence sizes.**
My **115 KB / 281 nodes** is computed from Pascal's own node literals
(`templates/two-bedroom.ts:33–124`) at 417 bytes/node — a defensible proxy that independently
reproduces PRYZM's measured ~400 B/element, but it is **not** a measurement of a real Pascal project.
A Pascal model with terrain, scans, materials and item references will be larger. What is
*established* is that **the delta between the two systems is the journal, not the model** — that
half is measured on both sides.

**8.5 Whether the SSE replay-from-zero defect (§3.4) bites in production.**
Read from the code, not executed. It requires a scene with a long `scene_events` history, which in
the OSS repo only MCP live-sync creates. I did not run Pascal's server.

**8.6 Whether PRYZM's missing snapshot URL scan (§4.5 / §6 row 4) is exploitable.**
Absence of the scan is measured (`grep AssetUrl server.js` → 0). Whether any client path renders an
attacker-controlled URL out of a stored snapshot is **not** measured — that requires enumerating
every URL-bearing snapshot field and its render path. Row 4 therefore prescribes a **report-only**
week before any refusal. ⛔ This is not a vulnerability claim.

**8.7 PRYZM's real open-path timings.**
`§PROBE-OPEN-PATH-STORAGE-LEG` shipped ~this session and is always-on, but **no production reading
exists yet** (`ISSUE-LOG L-8703` says so explicitly: *"nothing is claimed, because nothing was
measured in his browser"*). Every open-side number in §2.5 is a **size**, not a **duration**.
The one duration on record is `C05 §3.5`'s **2 231 ms** of synchronous main-thread decode for a
~35 MB container.

**8.8 The "28 unattributed scene roots" in my brief.**
Not reproduced. `npm run check:isolation` today prints
`§C13-TEARDOWN-TRIGGER-DECLARED — 3/3 root(s) scanned against 204 declared events; 2 named
exception(s), 0 new` and **passes** that arm. The failing arm is ADR-0298's declared-project-scope
sweep at **47/45 with 2 new files**, both from a sibling lane in flight. I report the gate.

**8.9 Whether Pascal's 250 ms SSE poll is what the hosted app runs.**
Almost certainly not — the founder's capture shows Supabase Realtime, which exists precisely to
replace polling. §5.14's verdict is therefore about **the open-source design**, and I have said so
in the row. It is not a claim about the product he uses.
