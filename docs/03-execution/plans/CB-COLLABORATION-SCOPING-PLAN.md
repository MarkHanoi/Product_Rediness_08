# CB-01 / CB-05 — the collaboration scoping plan

> **Stamp**: 2026-08-14 · **Branch**: `main` · **Status**: SCOPED — awaiting scheduling
> **Founder decision recorded**: **COMMIT to the sync-server work.** This document is what that
> commitment buys and what it costs. It converts two BIM 3.0 register rows from *"blocked on an
> unmade decision"* to *"planned"*.
>
> ⚠ **Nothing in this document has been deployed, provisioned, configured or flipped.** No
> implementation was started to write it. Every "verified" claim below names the command that was
> run on **2026-08-14** and its result.
>
> **Governing contracts**: [C08](../../02-decisions/contracts/C08-COLLABORATION-AND-SECURITY.md)
> §1–§3 (Yjs CRDT + server linearization; **silent LWW FORBIDDEN**) ·
> [C66](../../02-decisions/contracts/C66-CONCURRENCY-AND-SCALE.md) §1 (no capacity tier may be
> described as supported while it is CLAIMED) · [C70](../../02-decisions/contracts/C70-BIM30-TARGET-AND-GOLDEN-CHAIN.md)
> K-INV-2 / K-INV-3 · P8.
> **Predecessors, cited not restated**: [`L-391-COLLAB-DEPLOY-DECISION.md`](L-391-COLLAB-DEPLOY-DECISION.md)
> (the infra packet — §3 steps, §4 config table, §6 rollback) ·
> [`L-391-CRDT-COLLAB-PLAN.md`](L-391-CRDT-COLLAB-PLAN.md) (the code-half plan) ·
> [ADR-0311](../../02-decisions/adrs/ADR-0311-delta-persistence-and-crdt-deployment.md) §3 (merged
> data is the one irreversible edge).

---

## 0. The one-paragraph answer

**CB-01's headline — "no CRDT transport exists in any environment" — is right about the
environment and wrong about the code.** Measured today: the server speaks the y-protocols binary
sync + awareness protocol, the client provider seam is wired end-to-end in `engineLauncher.ts`
behind a two-part master gate, authentication on the WebSocket upgrade is fail-closed, `PgAuthz`
is written, and `check-two-client-convergence` passes with **8 update crossings transported across
2 independently composed clients**. What does not exist is **one always-on process with one
secret**, and **a convergence proof that covers more than three wall properties**. So the
committed work is not "build collaboration" — it is **deploy it, then broaden the proof**. Those
are two different budgets and this document keeps them apart.

---

## 1. What exists today — measured, with the command

| Claim | How established (2026-08-14) | Scope |
|---|---|---|
| Two independently composed clients converge through the real command path | `npx tsx tools/rac-conformance/certification/gates/check-two-client-convergence.ts` → **exit 0**, arms 1/1b/2/3 clean, **8 update crossings transported**, 3 properties compared, both controls fired | in-process, **simulated wire** |
| Identity survives concurrent edits | same run, ARM 2: wall ids on A `[tc-wall-1]`, on B `[tc-wall-1]` — no re-mint, no duplicate | in-process |
| Undo under concurrency does not eat the peer's edit | same run, ARM 3: A undoes `height 5→3`, B's `materialColor` survives resync | in-process |
| The comparator can fail | same run, negative control: forced divergence **detected**; two identical values **agree** | — |
| The server speaks the real y-websocket protocol | `apps/sync-server/src/yjs/setupYjsConnection.ts`, rooms per ADR-049 §4.4, docs served from `YjsProjectCache` | code |
| The client provider seam is wired | `apps/editor/src/engine/engineLauncher.ts:954–1005` → `connectCrdtProvider(_yjsDocAdapter, _collabConfig, createWebsocketProvider)`; master gate `enabled = flagOn && Boolean(url)`; session JWT read via `getStoredToken()` | code |
| WS upgrade auth is fail-closed | `apps/sync-server/src/auth/WsAuthGate.ts` + `__tests__/WsAuth.test.ts` | code |
| **`PgAuthz` is written** | `apps/sync-server/src/authz/PgAuthz.ts` (`a693b35d`) + `__tests__/PgAuthz.test.ts` | code |

**What none of this proves**, and the gate says so itself in its own SCOPE block: *"the wire here
is SIMULATED … production still runs socket.io last-writer-wins … NO capacity tier moves from
CLAIMED to HELD on this evidence. C8 remains FAIL."* That sentence is the whole of CB-01.

---

## 2. What transport is missing, and what it would carry

### 2.1 The missing thing, precisely

Not a protocol. Not a client. **A running process.** `apps/sync-server` is containerised
(`apps/sync-server/Dockerfile`, multi-stage, `EXPOSE 4000`) and is absent from `fly.toml`, the
root `Dockerfile` and every workflow in `.github/workflows/`. Nothing hosts it.

The convergence gate's "simulated wire" is the exact substitution: it moves Yjs state-vector
deltas between two in-process `Y.Doc`s **without a socket**. Everything upstream and downstream of
the socket is real; the socket is the one thing it fakes. That is why 8 crossings transported and
C8 is still FAIL — the gate proves the *code path*, and C8 asks about the *deployment*.

### 2.2 What the transport would carry

| Payload | Direction | Today's substitute |
|---|---|---|
| **Y.Doc binary update deltas** (y-protocols sync step 1/2 + update) per room, room = project id per ADR-049 §4.4 | both | socket.io `command-executed` → `remote-command`, applied in arrival order = **silent LWW** |
| **Awareness** (cursor, selection, presence) | both | `PresenceService` exists server-side; no live channel |
| **Session JWT** on the upgrade, as `?token=` | client → server | n/a — the only credential channel a browser WebSocket has |
| **Soft locks** (`PgSoftLockStore` / `Sweeper`) | both | in-memory, single-process |
| **Event log append** (`PgEventLog`, legacy `/sync` JSON channel) | client → server | unchanged; orthogonal to the CRDT rooms |

The load-bearing consequence: **only the first row retires a defect.** Rows 2–5 are capabilities
the deployment unlocks; row 1 is the one that makes C08 §3.1's *"silent last-write-wins overwrite
is FORBIDDEN"* true in production instead of aspirational.

### 2.3 The single hard constraint on the deployment

**One instance, `min_machines_running = 1`, autostop off.** `YjsProjectCache` and the room
registry are module singletons: a second instance serves a *different* merge cache for the same
room and the two halves of a project diverge silently. Horizontal scale is Redis-pub-sub territory
and is **out of scope** — it is named here so nobody schedules it by accident.

---

## 3. What `PgAuthz` already covers — so CB-02's headline stops being wrong

CB-02 reads: *"`PgAuthz` has not been written."* **That is now factually wrong** (`a693b35d`).
What the class does, from its own header:

- Queries the **live** `project_members` table — `server/dbMigrate.js:120`, created by the BFF on
  startup — **not** the Phase-2 sketch at `apps/sync-server/src/authz/project-members.sql`. Both
  DDLs are `CREATE TABLE IF NOT EXISTS` and the BFF migrates first, so the sketch is a silent
  no-op and a class written against it would have typechecked, unit-tested green, and refused
  every real user in production.
- Handles **owner-is-not-a-member**: `projects.owner_id` is the ownership record and the owner has
  no `project_members` row. A membership-only query locks every user out of the project they
  created. `PgAuthz` uses the same single-round-trip LEFT JOIN shape as
  `server/projectAccess.js:183`, deliberately, so the sync server and the BFF cannot disagree
  about who may enter a room.
- **Fail-closed on every exit**: `no-database-configured` · `database-unavailable` ·
  `database-error` · `no-such-project` · `not-a-member` · `unknown-role` · `role-not-permitted`.
  There is no path through `can()` returning `true` without a Postgres row naming the actor.

**What remains open on CB-02, and it is a configuration fact rather than a code gap**: the
production flip requires `PRYZM_AUTHZ_MODE` to select `PgAuthz` (not
`memory-allow-by-default`, which means *any signed-in user who can name a room joins it*, nor
`memory-deny`, which means nobody joins anything) **against a `DATABASE_URL` that is the BFF's**.
Selecting `pg` mode against an empty or wrong database is the failure this class is engineered to
make loud rather than silent — it denies, it does not open.

**Corrected CB-02 headline**: *the adapter is written and fail-closed; what is unproven is the
deployed selection of it against the live table.* Drop-in text in §7.

---

## 4. CB-05 — "per-capability convergence proofs", concretely

CB-05 says *the RAC's strongest capabilities are its least syncable* — late-bound `'all'` subjects
(P1-10). Today's proof, measured in §1, covers **three properties of one wall** (`height`,
`materialColor`, `thickness`) through **two** command types (`wall.updateDimensions`,
`wall.updateColor`). That is a convergence proof of the *mechanism*. It is not a proof about the
**capability surface**, and the register should stop reading as though a broader claim were
pending on CB-01 alone.

### 4.1 The test shape — a parameterised arm, not N hand-written tests

`check-two-client-convergence` already has the right skeleton: compose two client worlds, dispatch
on each **from its own bus**, transport deltas, compare property-by-property, and run a negative
control that proves the comparator can fail. **CB-05 is that skeleton with the capability as a
parameter**, plus three arms the current gate does not have.

A per-capability case is a **five-field record**, and the gate iterates them:

```
{ capability, subjectSeed, editOnA, editOnB, observedProperties }
```

| Field | What it must supply |
|---|---|
| `capability` | the RAC capability id, so the gate's ledger is keyed by capability and a missing one is a NAMED absence, never silence |
| `subjectSeed` | the elements each client's world starts with — **identical on both**, so a divergence cannot be a seeding artefact |
| `editOnA` / `editOnB` | one dispatch each, through the REAL bus, deliberately **concurrent and conflicting** where the capability permits it |
| `observedProperties` | the authoritative fields compared after sync. **An empty list is a gate failure, not a pass** — a capability whose convergence is asserted over zero properties is the `[]`-means-verified defect |

### 4.2 The three arms today's gate does not have

1. **LATE-BOUND SUBJECT (`'all'`, P1-10) — the arm CB-05 exists for.** A capability whose subject
   is resolved *at execution time* ("set all walls to type X") does not name its subjects in the
   payload. Client A and client B resolve `'all'` against **different world states** if a peer
   created an element mid-flight. The proof: seed A and B identically, have B create an element,
   have A dispatch the `'all'` capability **before** transporting B's create, then sync — and
   assert what the contract says should happen to the element A never saw. **This arm's expected
   outcome is not yet decided and must be, before the arm is written**: either `'all'` binds at
   dispatch (the new element is excluded, and that must be *visible*, not silent) or it re-binds
   on merge. Writing the arm before deciding produces a test that pins whatever the code does.
2. **BATCH ATOMICITY.** RAC batches are ONE command with one undo entry. Under concurrency, a
   partially-transported batch is the C70 K-INV-2 case: assert the batch arrives all-or-nothing,
   and that a merge which cannot preserve it raises a **conflict artefact** rather than
   substituting silently.
3. **CONFLICT SURFACING (C70 K-INV-2).** `check-conflict-surfacing.ts` exists in the certification
   suite; it is **not** wired to the two-client harness. The arm: force a merge that must discard
   authored state, and assert a resolvable conflict artefact is produced — P8's half that has
   never been measured under real concurrency. This is CB-04's invariant, and CB-05's harness is
   where it becomes measurable.

### 4.3 The ledger rule

The per-capability gate is a **named-absence ledger**, in this repo's established shape: every RAC
capability is a row; a capability with no case is **NOT PROVEN**, printed by name, and the count
is a shrink-only ratchet. It is **never** silence, and a green run must never be readable as
"all capabilities converge" when it means "the four with cases converge".

---

## 5. Sequencing

Each step is independently valuable and independently reversible, and **no step's cost is paid
before the previous step's result is in hand.**

| # | Step | Gate that scores it | Reversible? |
|---|---|---|---|
| **S1** | Deploy `pryzm-sync` — one Fly `shared-cpu-1x`, 256–512 MB, `fra` (co-located with `pryzm`), `min_machines_running = 1`, autostop off, existing Dockerfile, repo root as build context. Secrets per L-391 §4: `SESSION_SECRET` **byte-identical to the BFF's**, `SYNC_PORT=4000`, `PRYZM_SYNC_WS_AUTH` **unset**. | `GET /health` reports `wsAuth.mode = "jwt-hs256"` | scale to 0 / destroy |
| **S2** | Score C8 against the deployed transport — **no client flag moves.** `PRYZM_COLLAB_GATE_URL=wss://… PRYZM_COLLAB_GATE_TOKEN=<real JWT> npx tsx tools/ga-gate/check-collab-graph-integrity.ts` | exit 0 ⇒ C8 scoreable and green. Exit 2 `transport-absent` ⇒ S1 is wrong, and the gate says so rather than passing | n/a — read-only |
| **S3** | Point `check-two-client-convergence` at the deployed wire and **retire the SIMULATED scope note** | the gate's own SCOPE block changes; ledger stays `declared=0` | n/a |
| **S4** | Staging client flag: `VITE_SYNC_URL` + `VITE_COLLAB_CRDT=true`, **staging build only** | manual cohort + the gates above | flag unset ⇒ provider never constructed ⇒ today's path exactly. ⚠ **but see §6** |
| **S5** | **CB-05 harness** — the parameterised per-capability gate of §4, seeded with the four capabilities already exercised, with every other capability printed as NOT PROVEN | new ledger, shrink-only | n/a |
| **S6** | The three arms of §4.2, in order: batch atomicity → conflict surfacing → late-bound `'all'`. **`'all'` last, because it needs the §4.2(1) decision first.** | per-arm | n/a |
| **S7** | Production flip. **Gated on**: `PRYZM_AUTHZ_MODE` selecting `PgAuthz` against the BFF's `DATABASE_URL` (§3), S5/S6 green, and a separate founder decision. | — | flag-reversible; **data is not** |

**S1–S4 are the CB-01 half. S5–S6 are the CB-05 half. S7 is neither — it is a later decision and
is listed only so the sequence has an end.**

---

## 6. The honest cost

### 6.1 Money

| Item | Estimate |
|---|---|
| 1× Fly `shared-cpu-1x`, 256–512 MB, always-on (a CRDT room server cannot scale to zero — sleeping drops every socket) | ~$2–5 / mo |
| TLS + hostname (`wss://`) on the existing Fly org | included |
| Optional dedicated IPv4 | ~$2 / mo |
| **Total** | **~$5–10 / mo** |

No new vendor, no new account, no new database. **These are the only numbers in this document
that are estimates rather than measurements** — they are from published shared-CPU pricing.

### 6.2 Engineering

| Step | Estimate | Confidence |
|---|---|---|
| S1–S2 | **hours, not days** — nothing is written; the image builds today | high; the Dockerfile and the gate both exist and have been run |
| S3 | ~half a day — point the harness at a real socket, delete the simulation branch, keep the negative control | high |
| S4 | ~half a day + a manual cohort session | high |
| S5 | **~2–3 days** — the parameterised harness plus the named-absence ledger. The skeleton exists; the work is the ledger, the per-capability seeds, and the empty-`observedProperties` failure rule | medium |
| S6 batch atomicity | ~2 days | medium |
| S6 conflict surfacing | ~2–3 days — wiring `check-conflict-surfacing` into the concurrency harness | medium |
| S6 late-bound `'all'` | ~2 days **after** the §4.2(1) semantic decision. **The decision is the long pole, not the test.** | low until decided |

### 6.3 What the money does not buy — stated so it is never inferred

- **No C66 capacity tier moves CLAIMED → HELD.** One always-on 256 MB instance is not a capacity
  measurement, and C66 §1 forbids describing a tier as supported while it is CLAIMED.
- **Multi-instance / horizontal scale is out of scope** (§2.3). Redis pub-sub, R-E.
- **Cross-process durability of room docs is out of scope.** Room docs live in an in-process
  cache; within one process they survive a restart, across a machine replacement they are
  re-seeded from whichever client is still connected. **A project with no connected client and
  unpersisted CRDT state is not covered.**
- **Merged data is irreversible.** [ADR-0311 §3](../../02-decisions/adrs/ADR-0311-delta-persistence-and-crdt-deployment.md):
  the flag can be turned off, but a project whose concurrent edits merged **cannot be un-merged**,
  and the client Y.Doc state vector is not reconstructible from snapshots. This is the single
  irreversible edge in the whole sequence and it is exactly why S4 is staging-only.

---

## 7. Register drop-in text

*(This document does not edit `docs/04-reference/BIM30-GAP-REGISTER.md` — L-STAMP owns it. The
status-cell replacements are supplied here.)*

**CB-01 status cell** →
> **PLANNED — founder COMMITTED 2026-08-14; scoped in [`CB-COLLABORATION-SCOPING-PLAN.md`](../03-execution/plans/CB-COLLABORATION-SCOPING-PLAN.md).** The row's headline is right about the *environment* and wrong about the *code*: re-measured at HEAD, the server speaks y-protocols binary sync + awareness, the client provider seam is wired end-to-end (`engineLauncher.ts:954–1005`, master gate `flagOn && Boolean(url)`), WS-upgrade auth is fail-closed, and **executed** `check-two-client-convergence` → **exit 0, 8 crossings transported, 2 composed clients, both controls fired**. What is missing is **one always-on process with one secret** (~$5–10/mo), not engineering. Sequenced S1–S4; C8 becomes scoreable at **S2**, before any client flag moves. C8 remains FAIL until then, and **no C66 tier moves CLAIMED → HELD on this plan**.

**CB-02 status cell** →
> **PARTIALLY CLOSED — the headline is factually wrong and is corrected here.** `PgAuthz` **has been written** (`a693b35d`): it queries the **live** `project_members` (`server/dbMigrate.js:120`), not the sync-server sketch DDL that is a silent no-op; it handles owner-is-not-a-member with the same LEFT JOIN shape as `server/projectAccess.js:183`, so the sync server and the BFF cannot disagree about room entry; and it is **fail-closed on all seven exits** with no path returning `true` without a Postgres row naming the actor. **What remains OPEN is configuration, not code**: the production flip requires `PRYZM_AUTHZ_MODE` to select `PgAuthz` against the BFF's `DATABASE_URL`. Scoped as **S7** in the CB plan; a prerequisite of the **production** flip, not of CB-01.

**CB-05 status cell** →
> **PLANNED — no longer "gated behind CB-01".** Scoped in [`CB-COLLABORATION-SCOPING-PLAN.md`](../03-execution/plans/CB-COLLABORATION-SCOPING-PLAN.md) §4 as a concrete test shape: the existing two-client harness **parameterised by capability** — `{capability, subjectSeed, editOnA, editOnB, observedProperties}` — over a **named-absence ledger** where a capability with no case prints as NOT PROVEN rather than passing in silence, and an empty `observedProperties` is a gate FAILURE. Three arms the current gate lacks: batch atomicity, conflict surfacing (C70 K-INV-2, wiring the existing `check-conflict-surfacing` into the concurrency harness), and the late-bound `'all'` subject (P1-10). ⚠ **The `'all'` arm has an undecided prerequisite**: whether `'all'` binds at dispatch or re-binds on merge. Writing the arm first would pin whatever the code happens to do. Current proof covers **3 properties of 1 wall through 2 command types** — a proof of the mechanism, not of the capability surface, and the row should read that way. Cost S5–S6 ≈ **8–10 engineer-days**; the long pole is the semantic decision, not the harness.

---

*Measured, not estimated: every row in §1 names a command run on 2026-08-14 or a file at HEAD.
The figures in §6.1 are ESTIMATES from published pricing and are the only numbers here that are
not measurements. §6.2 are engineering estimates and are labelled with their confidence.*
