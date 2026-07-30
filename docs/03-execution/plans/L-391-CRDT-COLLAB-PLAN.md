# L-391 — Real-time multi-user CRDT collaboration: deployment + hardening plan

**Status:** Phase 0 landed (this branch, behind a default-OFF flag). Phases 1–3 require human/infra ratification.
**Owner workstream:** #1 launch P0 (September public launch). Collaboration correctness = real users' construction/legal documents — **correctness-first, no shortcuts.**
**Source audit:** `reports/CATEGORY-READINESS-AUDIT-2026-07-17.md` §2 ("Real-time collaboration correctness — GAP (critical)").
**Governing contracts:** C08 §3.1–3.3 (Yjs CRDT replaces LWW; silent LWW FORBIDDEN), P1 (composition root), P4 (no `(window as any)`), P8 (explicit conflicts + spans), ADR-0033 (SyncClient/EventBridge), ADR-049 §4.4 (Y.Doc-per-level).

---

## 1. Current state (investigated, cited)

### 1.1 There are TWO client CRDT stacks; production wires the one with no provider
- **`YjsDocAdapter`** (`packages/sync-client/src/YjsDocAdapter.ts`) — Wave A19 / Phase 2D / ADR-049. This is the one **actually wired in production**: `engineLauncher.ts:817` constructs `new YjsDocAdapter(projectId)`, registers it with the `BatchCoordinator` (`:820`), and attaches it to the CommandBus CRDT applier via `runtime.bus.setCrdtApplier(...)` (`:833-838`, the L-375a fix). Every `commandBus.executeCommand()` now also calls `adapter.applyCommand(type, payload)` → writes to a **local** `Y.Doc`.
- **`SyncClient` + `EventBridge`** (`packages/sync-client/src/SyncClient.ts`, `event-bridge.ts`) — ADR-0033. A parallel, more complete client (Y.Doc + provider factory + reconnect + Immer⇄Y.Doc bridge). **Test-only** — `grep 'new SyncClient'` → only `__tests__/_chaos/PeerHarness.ts`. Its `defaultProviderFactory` deliberately **throws** ("y-websocket provider is not yet wired — see ADR-0033 §2.2", `SyncClient.ts:173-179`). Not used by the editor.

### 1.2 The exact missing link between L-375a and working replication
`YjsDocAdapter.connectWithProvider(provider)` (`YjsDocAdapter.ts:458`) exists and is the intended attach point, but **is never called in production** (only in `__tests__/yjs-adapter.test.ts:104` with a mock). Therefore `YjsDocAdapter._provider` stays `null` (`:232`). The adapter's `Y.Doc` has **no transport** → it never receives remote ops → `applyUpdate()`, `_detectBatchConflicts`, `_detectCwLevelYMismatch`, `CRDTConflictResolver`, and the P8 conflict banner/dialog (`engineLauncher.ts:858-903`) **never fire for real multi-user edits.** L-375a wired the *applier*; there was never a *network backend* for it to talk to.

**One-line summary:** L-375a connected the applier to a local doc; L-391 must connect that doc to a network provider **and** stand up a server that speaks the doc's protocol.

### 1.3 What actually runs in production: socket.io last-write-wins
- Client emits `command-executed` (`src/collaboration/initCollaboration.ts`, socket wiring in `server.js`).
- Server `server.js:534-599`: validates payload + room membership (`§B2`), best-effort logs to `project_command_log` (non-blocking, `:552-574`), then `socket.to('project:'+id).emit('remote-command', ...)` (`:599`).
- Client applies via `RemoteCommandDispatcher.dispatch()` (`apps/editor/src/engine/RemoteCommandDispatcher.ts:157`). The **only** conflict handling is duplicate-create suppression (`isAlreadyAppliedCreate`, `:166-173` → `skipped-duplicate`). Concurrent **move / property-edit / delete** of the same element apply in arrival order = **silent last-write-wins**. No 3-way merge on this path.

| Mutation | Production behaviour today | Evidence |
|---|---|---|
| create | idempotent (dup id skipped) | `RemoteCommandDispatcher.ts:166-173` |
| move | **silent LWW** | `RemoteCommandDispatcher.ts:157` (no merge) |
| property-edit | **silent LWW** | same |
| delete | **silent LWW** | same |
| whole-project version save | optimistic-lock 412 → loser kept `local-only`, must reload | `ServerSyncQueue.ts` + `server.js` If-Match |

### 1.4 The sync-server exists but is (a) undeployed and (b) does NOT speak the y-websocket protocol
- `apps/sync-server` is a **custom** Express + `ws` server (`src/index.ts`). Its WebSocket handler (`index.ts:110-129`) upgrades `/sync` and speaks the **S22 JSON command-event protocol** (`project.subscribe` / `event.append` / `events.load`; `src/protocol/messages.ts`, `src/session/SessionManager.ts`). Auth is trust-the-query-string (`clientId`/`userId`, `index.ts:118-119`) — "full JWT lands in Phase 3C".
- It **has** a server-side Yjs merge cache — `src/YjsProjectCache.ts` (`applyUpdate` / `applyUpdateForLevel` do real `Y.applyUpdate` + return merged deltas, ADR-049 §4.4) — **but nothing wires that cache into the WebSocket message dispatch.** `SessionManager.handleMessage` (`:161-195`) only routes the 3 JSON message types; there is **no branch that receives a binary Yjs update and calls `yjsProjectCache.applyUpdate(...)`.** The cache is dead code w.r.t. the transport.
- **Consequence — protocol gap:** the standard `y-websocket` `WebsocketProvider` speaks the **y-protocols binary sync + awareness** protocol on `${url}/${roomname}`. The current sync-server implements **neither** that binary protocol **nor** the awareness channel. Deploying it as-is would NOT give a `WebsocketProvider` anything to talk to.
- **Undeployed:** `fly.toml` runs a single process (`processes = ["app"]`, `Dockerfile:CMD ["node","./dist/index.cjs"]`). `apps/sync-server` is absent from `fly.toml`, `Dockerfile`, and `.github/workflows/`. fly.toml comment: *"Multi-process (e.g. separate websocket worker) would need [processes] above."*

### 1.5 Is the conflict resolver real?
Yes. `CRDTConflictResolver.ts` (Wave A19-T3) implements a real 3-way merge with `MergeResult` descriptors and OTel spans; C08 §3.1 header declares silent LWW FORBIDDEN. **Coverage is thin** — only exercised via `__tests__/yjs-adapter.test.ts` (no dedicated resolver suite). Treat its per-branch correctness as **lightly tested** until Phase 2/3 add coverage.

### 1.6 Reconnect catch-up already exists (JSON path)
`GET /api/projects/:id/command-log?after=cursor` (`server.js:~3523`) + `RemoteCommandDispatcher.applyCatchUp` (`:272-301`). This is the socket.io-path catch-up; the Yjs path has its own catch-up primitives (`getFullStateForLevel`, state vectors) that are not yet transported.

---

## 2. Design decision that gates everything: which wire protocol?

The single biggest architectural fork for Phases 1–2 is **which protocol the client provider and server speak**. Two coherent options — pick ONE (ratification point R-A):

- **Option A — Standard y-websocket (recommended for speed + correctness).** Client uses stock `y-websocket` `WebsocketProvider` (Phase 0 already wires this). Server runs the stock `y-websocket` server utility (`y-websocket/bin/utils` `setupWSConnection`) or a thin wrapper that persists docs. Pro: battle-tested binary sync + awareness, minimal custom code, immediate two-browser testing via `npx y-websocket`. Con: the existing `apps/sync-server` S22 JSON/event-log/soft-lock/authz machinery is bypassed for the CRDT channel (it can still serve locks/presence/authz on a side channel).
- **Option B — Extend `apps/sync-server` to carry Yjs binary frames.** Add a binary message branch to `SessionManager` that feeds `YjsProjectCache.applyUpdate*` and broadcasts merged deltas, plus an awareness channel. Pro: one server, reuses authz/soft-lock/event-log. Con: re-implements y-protocols framing + awareness; higher correctness risk on the highest-stakes path; the client would then need a **custom provider** (not stock `WebsocketProvider`), enlarging Phase 0's surface.

**This plan assumes Option A** unless ratified otherwise. Phase 0 is compatible with both (it wires a stock `WebsocketProvider`; Option B would swap the injected factory for a custom provider without touching the `connectCrdtProvider` seam).

---

## 3. Phase 0 — client provider wiring behind a flag (THIS TASK — landed, NO infra change)

**Scope.** Construct a `y-websocket` `WebsocketProvider` on the wired `YjsDocAdapter`'s `Y.Doc`, gated behind an explicit flag (default OFF) with a configurable URL. Flag OFF ⇒ no provider, no socket ⇒ **solo/offline editing byte-identical to today.** The socket.io LWW path is untouched.

**Seams (files).**
- `packages/sync-client/src/collabProvider.ts` (new) — `connectCrdtProvider(target, config, factory)`: the pure, transport-free, unit-tested wiring seam. Config gate: `enabled && url` → construct via injected factory → `target.connectWithProvider(provider)`; else strict no-op returning `null`. Failure-isolated (catches, returns null, stays solo). P8 span.
- `packages/sync-client/src/websocketProviderFactory.ts` (new) — `createWebsocketProvider`: the real transport (static `import { WebsocketProvider } from 'y-websocket'`). Exposed via the `@pryzm/sync-client/websocket-provider` **subpath export** so the base barrel stays free of the y-websocket dependency. P8 span.
- `packages/sync-client/src/index.ts` — re-exports `connectCrdtProvider` + config types (NOT the transport factory).
- `apps/editor/src/engine/engineLauncher.ts` — after `setCrdtApplier`, reads config (`VITE_SYNC_URL` / `window.__pryzmSyncUrl`, flag `VITE_COLLAB_CRDT==='true'` / `window.__pryzmCollabCrdt===true`) and calls `connectCrdtProvider(_yjsDocAdapter, cfg, createWebsocketProvider)`. Master gate `enabled: flagOn && Boolean(url)` — both default unset ⇒ OFF.
- `packages/sync-client/__tests__/collab-provider.test.ts` (new) — 5 tests: flag OFF → no provider; flag ON no URL → no-op; flag ON+URL → provider built against configured URL/room + registered; flag ON → adapter doc receives remote ops through the wired doc; factory throw isolated → null.

**Risk.** Very low. Default OFF is a compile-time+runtime no-op on the hot path (one boolean check inside the already-deferred `wireCollaborationCRDT`). No infra, no protocol change, no retirement of the socket.io path.

**Verify gate (met on this branch).** `pnpm --filter @pryzm/sync-client test` = 114 passing (incl. 5 new). Solo boot with no flag/URL → provider OFF (log line confirms), zero behavioural delta. Full-tree root tsc deferred to CI (worktree node_modules isolation prevents cross-package + y-websocket resolution locally; the sole local tsc error is `Cannot find module 'y-websocket'`, a resolution artifact — the constructor call was verified against the installed `y-websocket` `.d.ts`).

**Ratification.** None — no infra, flag default OFF.

---

## 4. Phase 1 — deploy the sync-server + ws auth + room scoping (NEEDS RATIFICATION)

**Scope.**
1. **R-A (protocol):** ratify Option A vs B (§2). Assuming A: add a Yjs websocket server (stock `y-websocket` `setupWSConnection`, or a small wrapper) with **project-room scoping** (room = `projectId`, or `${projectId}:${levelId}` when `PRYZM_YDOC_PER_LEVEL` is on) and an **awareness** channel.
2. **R-B (ws auth):** authenticate the upgrade using the **existing session/JWT** (`SESSION_SECRET`, the same identity server.js issues). Reject unauthenticated upgrades and enforce project membership (mirror `server.js` `_socketInProjectRoom` / the sync-server `authz.can('projectRead', …)`). The current `userId`-from-query trust model (`sync-server/index.ts:118`) is **NOT acceptable for production** — this is a hard gate.
3. **R-C (Fly infra):** run the server. Options, cheapest→cleanest:
   - **1a. 2nd Fly process group** in the same app (`[processes]` + a `websocket` process running the sync-server; a `[[services]]` on a distinct internal port). Crosses the "single process" line the fly.toml comment calls out.
   - **1b. Separate Fly app** (`pryzm-sync`) in `fra`, its own machine, `wss://sync.pryzm.dev`. Cleanest isolation; a deliberate billing event (2nd always-on machine).
   - Either way: **PROPOSED here, NOT changed** — Phase 0 does not touch `fly.toml`/`Dockerfile`.
4. Point `VITE_SYNC_URL` at the deployed server and flip `VITE_COLLAB_CRDT=true` **in staging only**.

**Risk.** Medium (infra + auth). Mitigation: staging-only flag, production stays flag-OFF (socket.io path) until Phase 2/3 gates pass.

**Verify gate.** Staging: two browsers on one project both receive each other's ops via the Yjs channel; unauthenticated/cross-project upgrades rejected; presence cursors appear (awareness). Production flag remains OFF.

**Ratification points:** R-A (protocol), R-B (ws auth model), R-C (Fly infra shape + billing). All three are human decisions.

**Effort:** ~3–5 dev-days (Option A) + infra review. Dependencies: Phase 0.

---

## 5. Phase 2 — make the CRDT path authoritative; retire silent LWW (NEEDS RATIFICATION)

**Scope.** With the provider live, make Yjs the authoritative path for concurrent create/move/delete/property edits:
1. Route the CommandBus applier's remote-apply through the CRDT merge so `move/property/delete` converge via Yjs instead of socket.io arrival-order LWW.
2. Ensure **every** lossy/ambiguous merge surfaces via `CRDTConflictResolver` → `emitConflict` → the existing banner/dialog (`engineLauncher.ts:858-903`) — **P8: no silent LWW.** Add the missing dedicated `CRDTConflictResolver` unit suite (§1.5).
3. **Reconcile the two paths so there is ONE authority.** Decision R-D: when CRDT is authoritative, the socket.io `command-executed → remote-command` rebroadcast must be either (a) demoted to presence/ephemeral only, or (b) retired for mutating commands. Do NOT run both as mutation authorities simultaneously (double-apply / divergence risk). Keep socket.io as a fallback ONLY behind the flag-OFF path.

**Risk.** High — this is the correctness heart. Gate behind Phase 3 E2E before any production flip.

**Verify gate.** Two-user concurrent edit of the same element's property produces a converged doc on both clients AND a surfaced conflict (never a silent overwrite). Delete-vs-edit races resolve deterministically and visibly.

**Ratification:** R-D (which path is authoritative + socket.io demotion/retirement) — architectural, human.

**Effort:** ~5–8 dev-days. Dependencies: Phase 1.

---

## 6. Phase 3 — two-browser E2E acceptance gate (the real gate)

**Scope.** Automated multi-context Playwright tests (the audit flagged all three UNVERIFIED, §2.4):
- **dropped-ws-mid-edit:** kill the ws during an edit → on reconnect the doc converges, no lost ops, no dup.
- **two-users-same-element:** concurrent move/property/delete → converged + conflict surfaced (P8), never silent LWW.
- **60s-offline reconnect:** one client offline 60s making edits → reconnect → state-vector catch-up merges both directions with no loss.

**Risk.** Test infra (needs the deployed server from Phase 1; today's `tests/e2e/crdt-batch-conflict.spec.ts` is single-context structural only because "requires a shared Yjs WebSocket server — not available in CI").

**Verify gate.** All three green in CI against a staging/ephemeral sync-server. **This is the acceptance gate for flipping production `VITE_COLLAB_CRDT=true`.**

**Effort:** ~4–6 dev-days incl. CI wiring for an ephemeral sync-server. Dependencies: Phases 1–2.

---

## 7. Persistence / durability of the Yjs doc (cross-cutting; ties L-334 / L-85)

**Problem.** `sync-server/YjsProjectCache` is **in-memory only** (`_projectDocs`/`_levelDocs` Maps). If every client disconnects and the machine restarts (Fly deploy bounce, OOM), the merged Yjs state is **lost** unless it was persisted. Meanwhile the durable source of truth today is the **snapshot save path** (Supabase), and ADR-002/ADR-0033 frame PRYZM events as the durable log with Yjs as the *convergence transport*.

**Decisions (R-E, ratification):**
1. **Server-side doc store vs ephemeral.** For launch, ephemeral-cache + authoritative snapshot save is acceptable IF the reconciliation below holds; a durable Yjs store (e.g. `y-leveldb`/Postgres-backed) is the hardening target. Do NOT let the Yjs cache silently become a second, diverging source of truth from the snapshot.
2. **Reconcile with the snapshot save path.** Define exactly one authority at rest (the persisted snapshot / event log). On last-client-disconnect or on a debounce, flush the merged Yjs state into the snapshot path so a cold start rehydrates identically. This directly intersects **L-334** (no whole-snapshot validation / silent element-loss reported as success) and **L-85** (data integrity): a CRDT merge that drops elements MUST be caught by snapshot-level element-count reconciliation, not silently persisted.
3. **Eviction:** `YjsProjectCache.evict/evictLevel` on all-subscribers-gone must be paired with a durable flush FIRST, else eviction = data loss.

**Effort:** design ~2 days; durable store ~4–6 days (can trail Phase 3 if ephemeral+flush is proven safe by an E2E cold-start test).

---

## 8. Ratification checklist (anything that changes infra / goes live)

| ID | Decision | Phase | Owner |
|---|---|---|---|
| R-A | Wire protocol: stock y-websocket (A) vs extend sync-server (B) | 1 | architecture |
| R-B | ws auth = existing session/JWT + project-membership enforcement (retire query-string trust) | 1 | security |
| R-C | Fly infra: 2nd process group vs separate app; billing event | 1 | infra/founder |
| R-D | CRDT authoritative + socket.io demotion/retirement (one authority) | 2 | architecture |
| R-E | Yjs durability: ephemeral+flush vs durable store; snapshot reconciliation (L-334/L-85) | 2/3 | architecture + data-integrity |
| — | Production flip of `VITE_COLLAB_CRDT=true` | after Phase 3 | founder |

**Nothing in Phase 0 requires ratification.** Everything that touches `fly.toml`/`Dockerfile`, ws auth, or goes live is above and is PROPOSED only.

---

## 9. Feature-flag reference (Phase 0)

| Flag | Where | Default | Effect |
|---|---|---|---|
| `VITE_COLLAB_CRDT` | build env (Vite) | unset (OFF) | `'true'` enables the CRDT provider (still needs a URL) |
| `window.__pryzmCollabCrdt` | runtime global | unset (OFF) | `true` enables at runtime (dev/manual) |
| `VITE_SYNC_URL` | build env | unset | sync-server ws base URL, e.g. `wss://sync.pryzm.dev` |
| `window.__pryzmSyncUrl` | runtime global | unset | runtime override of the URL |
| `window.__pryzmAuthToken` | runtime global | unset | forwarded as ws `?token=` (server enforcement = Phase 1) |

Enabled iff `(VITE_COLLAB_CRDT==='true' || __pryzmCollabCrdt===true) && (VITE_SYNC_URL || __pryzmSyncUrl)`. With none set: **OFF** — no provider, no socket, today's behaviour exactly.

For local two-browser testing (Option A): `npx y-websocket` (port 1234), then set `window.__pryzmSyncUrl='ws://localhost:1234'` + `window.__pryzmCollabCrdt=true` in two tabs on the same project.
