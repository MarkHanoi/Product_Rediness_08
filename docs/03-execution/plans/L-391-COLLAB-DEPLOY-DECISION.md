# L-391 leg C — the collaboration deploy decision packet

> **Stamp**: 2026-08-11 · **Branch**: `main` · **Status**: DECISION PENDING — founder
> **Nothing in this document has been deployed, provisioned, configured or flipped.**
> No infrastructure was created and no production configuration was changed to write it.
>
> **What it is for**: BIM 2.0 criterion **C8** ("collaboration preserves relationships") is the
> ceiling on [`BIM20-ACCEPTANCE-10-OF-10.md`](BIM20-ACCEPTANCE-10-OF-10.md) — until it can be
> scored, 10/10 is arithmetically unreachable, and it cannot be scored without a deployed CRDT
> transport. That deployment is a founder decision because it costs money. This packet exists so
> the decision is a **yes/no**, not a research project.

---

## 0. The one-paragraph answer

The code side is **done and measured**. Auth on the WebSocket upgrade — the last engineering
blocker, R-B — is implemented, fail-closed, and tested in both directions. The C8 gate
(`check-collab-graph-integrity`) exists, runs two real `y-websocket` clients through the real
server, and is **GREEN on the local harness today**: the hosting relationship between a wall and
its door survives concurrent editing on both documents, with the host resolving to a wall that
exists. **There is no code defect standing between PRYZM and C8.** What is missing is one process,
running somewhere, with one secret and one flag. The estimated cost is **$5–10/month**.

---

## 1. What was verified, and what that does and does not prove

| Claim | How it was established | Scope |
|---|---|---|
| Two clients converge through the real server | `apps/sync-server/__tests__/YjsTwoClient.test.ts` (pre-existing, 83270e88), now running **through the authenticated path** | in-process |
| The **hosting edge survives a concurrent edit** | `npx tsx tools/ga-gate/check-collab-graph-integrity.ts` → exit 0; 4 hosting edges, 10 element records, 0 violations | in-process |
| The gate can **fail** | its own negative control flagged 3 violations on a deliberately broken pair, on the same run; a mutation that breaks the edge drives the gate to exit 3 | — |
| No transport ≠ converged fine | pointed at an unreachable URL the gate exits **2 MISCONFIGURED / `transport-absent`**, never 0 | — |
| An unauthenticated upgrade is refused | `apps/sync-server/__tests__/WsAuth.test.ts`, 20 tests; a mutation that makes the gate always allow fails 15 of them | — |

**What none of this proves**: that a deployed transport exists. Production still runs socket.io
last-writer-wins. **C66 tiers remain CLAIMED, not HELD**, and this document does not move them.
Run the gate with `PRYZM_COLLAB_GATE_SCOPE=production` and it says so itself, on exit 1.

---

## 2. The decision

**Deploy `apps/sync-server` as a single small always-on instance, give it the BFF's
`SESSION_SECRET`, and point a STAGING build at it. Yes or no.**

### Cost

| Item | Estimate |
|---|---|
| 1× Fly `shared-cpu-1x`, 256–512 MB, always-on (a CRDT room server cannot scale to zero — sleeping drops every socket) | **~$2–5 / mo** |
| TLS + hostname (`wss://`) on an existing Fly org | included |
| Optional dedicated IPv4 | ~$2 / mo |
| **Total** | **~$5–10 / mo**, matching the figure in the acceptance plan |

No new vendor, no new account, no new database — it reuses the existing Fly org and (optionally)
the existing `DATABASE_URL`.

---

## 3. The infra steps — exactly, in order

The service is **already containerised**: `apps/sync-server/Dockerfile` is a working multi-stage
build (`pnpm install --filter "@pryzm/sync-server..."`, `EXPOSE 4000`, `CMD pnpm start`). Nothing
needs to be written to deploy it.

1. **Create the app** — `pryzm-sync`, same org, same region as `pryzm` (`fra`, per `fly.toml:36`;
   co-location matters, every editor keystroke crosses this link).
2. **Point it at the existing Dockerfile** with the repository root as build context (the
   Dockerfile's header says this explicitly), `internal_port = 4000`.
3. **Set the secrets** (§4).
4. **One instance, `min_machines_running = 1`, autostop off.** The in-process `YjsProjectCache`
   and room registry are module singletons: a second instance would serve a *different* merge
   cache for the same room and the two halves of a project would silently diverge. Multi-instance
   is R-E/Redis-pub-sub territory and is explicitly out of scope here.
5. **Smoke-test the deployment without touching the editor**: `GET /health` must report
   `wsAuth.mode = "jwt-hs256"`. Anything else — `deny-all`, `trust-query` — is a
   misconfiguration and is visible *without* attempting an unauthenticated connection.
6. **Score C8 against it**, still without flipping any client flag:
   ```
   PRYZM_COLLAB_GATE_URL=wss://pryzm-sync.fly.dev \
   PRYZM_COLLAB_GATE_TOKEN=<a real session JWT> \
   npx tsx tools/ga-gate/check-collab-graph-integrity.ts
   ```
   Exit 0 = C8 is scoreable and green against the deployed transport. This step is the *point* of
   the deployment and it happens **before** any user-visible change.
7. **Only then**, flip the staging build flags (§5).

---

## 4. Config values — the complete list

Server (`pryzm-sync` secrets/env):

| Key | Value | Why it matters |
|---|---|---|
| **`SESSION_SECRET`** | **byte-identical to the BFF's** | ⚠ **The load-bearing value.** The sync server verifies the same HS256 session JWT `server/authStore.js` signs. A different secret ⇒ every client refused `bad-signature`. There is no token exchange and no second identity system to provision. |
| `SYNC_PORT` | `4000` | already the Dockerfile default |
| `PRYZM_AUTHZ_MODE` | `memory-allow-by-default` | see §4.1 — **read it before choosing** |
| `SYNC_EVENT_LOG` | `memory` (staging) / `pg` | `pg` also requires `DATABASE_URL`; only affects the legacy `/sync` event log, not the CRDT rooms |
| `PRYZM_SYNC_WS_AUTH` | **unset** | setting it to `trust-query` disables upgrade auth entirely. It is never a default and it logs a warning on every startup. Do not set it in any deployed environment. |

### 4.1 The authorisation gap you are accepting — state it out loud

Authentication is closed. **Authorisation is all-or-nothing**, and this is a real, measured
limitation, not a hypothetical:

- `MemoryAuthz.addMember()` is called **nowhere in production code**. The `project_members` table
  (`apps/sync-server/src/authz/project-members.sql`) exists; nothing hydrates from it. `PgAuthz`
  was deferred to "Phase 3C" and has not been written.
- Therefore `PRYZM_AUTHZ_MODE=memory-allow-by-default` means **any signed-in PRYZM user who can
  name a room can join it**, and `memory-deny` means **nobody can join anything**.

For a **staging** cohort of known users this is acceptable and is what the acceptance plan already
scopes ("staging only"). For **production** it is not, and `PgAuthz` is a prerequisite of the
production flip — not of this deployment. The gate already asks the `Authz` boundary on every
upgrade and refuses non-members with `403 / not-a-project-member`, so `PgAuthz` is a drop-in
behind an existing seam; no call sites change.

---

## 5. The flag — staging only

Client build env (`apps/editor`), **staging build only**:

| Key | Value |
|---|---|
| `VITE_SYNC_URL` | `wss://pryzm-sync.fly.dev` |
| `VITE_COLLAB_CRDT` | `true` |

The master gate is `enabled = flagOn && Boolean(url)` (`engineLauncher.ts`). **With either unset
the provider is never constructed** — no socket, no behaviour change, today's path exactly. That
is why the deployment in §3 is safe to do *before* any flag moves: a running sync server with no
client pointed at it changes nothing.

The client sends the session JWT as `?token=` (`websocketProviderFactory.ts` → `params.token`),
which is the only channel a browser WebSocket has for credentials. It is TLS-encrypted in transit;
be aware it can appear in reverse-proxy access logs, so `wss://` is required, not optional.

---

## 6. Rollback

| Layer | How | Reversible? |
|---|---|---|
| Client flag | unset `VITE_COLLAB_CRDT` and redeploy the staging build | **yes, completely** — the provider is never constructed; solo + socket.io path is untouched |
| Server | scale `pryzm-sync` to 0 / destroy the app | **yes** — nothing else references it |
| Auth change | already live in this branch and independent of deployment; the sync server is not reachable from production today | n/a |
| **Merged data** | — | ⚠ **NO.** [ADR-0311 §3](../../02-decisions/adrs/ADR-0311-delta-persistence-and-crdt-deployment.md) is explicit: the flag can be turned off, but *a project whose concurrent edits merged cannot be un-merged*, and the client Y.Doc state vector is not reconstructible from snapshots. **This is the one irreversible edge**, and it is precisely why the flip is staging-only. |

---

## 7. What is NOT in this decision

- **Production `VITE_COLLAB_CRDT=true`** — a separate, later founder decision, gated on `PgAuthz`
  (§4.1) and on the E2E gate in [`L-391-CRDT-COLLAB-PLAN.md`](L-391-CRDT-COLLAB-PLAN.md) §3.
- **Multi-instance / horizontal scale** — R-E. One instance only; see §3 step 4.
- **Cross-process durability of room docs** — R-E. Room docs live in an in-process cache. Within
  one process they survive a server restart (the chaos suite proves it); across a machine
  replacement they are re-seeded from whichever client is still connected. A project with **no**
  connected client and unpersisted CRDT state is not covered.
- **C66 tier claims** — no tier moves CLAIMED → HELD on the strength of this document.

---

## 8. The one-line answer to "what remains"

> One always-on 256 MB container running an image that already builds, holding the same
> `SESSION_SECRET` the BFF already has, at ~$5–10/month — after which `check-collab-graph-integrity`
> can score C8 against a real transport, and 10/10 stops being arithmetically unreachable.

---

*Measured, not estimated: every "verified" row in §1 names a command that was run on 2026-08-11 and
its exit code. Cost figures are ESTIMATES from published shared-CPU pricing and are the only
numbers in this document that are not measurements.*
