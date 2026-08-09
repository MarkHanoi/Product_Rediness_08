# SCALE REMEDIATION PROGRAM
### Implementation plan for L-786 … L-803 + the four re-confirmed rows (L-770, L-336, L-391, L-442)

**Opened:** 2026-08-09 · **Source:** `docs/03-execution/analysis/production-readiness-1000-users-2026-08-09.md`
**Goal:** move the verdict from 🔴 NOT READY to 🟢 READY at 1,000 concurrent users, without shortcuts,
under the C01–C15 contract suite — extending it where the contracts are silent rather than working
around them.

---

## 0. Rules this program works under

These are not preamble; each one has bitten this repo and each one constrains the design below.

1. **Contract-first.** Before touching a subsystem, read its contract. Where the contract is silent
   on something this program decides (concurrency limits, the source of truth for a datum, the
   element lifecycle), **write the contract** — do not encode the decision only in code.

   ⚠ **Corrected 2026-08-09.** This plan originally proposed "C16-CONCURRENCY-AND-SCALE" and
   "C17-ELEMENT-LIFECYCLE". **Both numbers are taken** — C16 is Command Authoring Protocol, C17 is
   Batch Creation Catalogue — and, more usefully, **the element-lifecycle contract largely already
   exists**: C11 (Element Creation Pipeline) + C16 (command authoring) + C17 (batch creation) +
   C65 (Element Type System) cover it between them. Minting a second one would have been the
   duplicate-abstraction smell the audit itself flags. So:
   - **C66 — Concurrency & Scale** is the one genuinely new contract (**minted**; C61 is a reserved
     slot and was not taken).
   - The element-lifecycle work becomes **amendments to C11/C16/C17**, not a new contract.
2. **A refusal and a success must never be the same value** (§CONTEXT-DATA-HONESTY). This program
   removes two existing violations (L-789, and the L-336 consequence) and must not add one.
3. **Ship the probe before the fix.** Every capacity claim in the audit is derived, not measured.
   The k6 harness (T1.7) lands in tranche 1 so that tranches 2–3 are ordered by profile, not by
   this document.
4. **Failing-test-first for behaviour changes.** A fix that changes what the system *does* lands
   with a test that fails against the old code. Config-only changes (fly.toml, pool size) are
   exempt but must state their verification method.
5. **Additive migrations only.** `dbMigrate.js` has a purely-additive, idempotent invariant
   (no `DROP`/`TRUNCATE`/`ALTER COLUMN`/`RENAME`) which is what makes image rollback schema-safe
   by construction (L-770). Nothing here breaks it.
6. **One concern per commit**, named with the `§TAG` / L-number so the ISSUE-LOG row and the diff
   are findable from each other. Keep the inline-incident-comment practice — it is the reason the
   audit was possible (L-801).
7. **Commit, do not deploy**, unless the change is browser-testable and the founder has asked for
   a deploy. Name the commits instead.
8. **Run root `tsc` before committing** — the build uses a stricter root config than the
   per-package ones and Fly hard-fails on a mismatch.

---

## 1. Dependency graph — why the order is the order

```
                    ┌──────────────────────────────────────┐
                    │ T1.7  k6 harness (L-800)             │  ← measures everything below
                    └──────────────────────────────────────┘
                                     │ informs ordering of T2/T3
   ┌─────────────────────────────────┼─────────────────────────────────┐
   │                                 │                                 │
┌──▼───────────────┐  ┌──────────────▼──────────┐  ┌───────────────────▼──┐
│ T1.1 indexes     │  │ T1.2 degrade honesty    │  │ T1.3 pool + timeout  │
│ (L-788)          │  │ (L-789)                 │  │ (L-787)              │
│ independent      │  │ independent             │  │ independent          │
└──────────────────┘  └─────────────────────────┘  └──────────────────────┘
                                     │
                    ┌────────────────▼─────────────────┐
                    │ T2.3  Redis + Socket.io adapter  │  (L-770)
                    │  ⚠ MUST precede any scale-out    │
                    └────────────────┬─────────────────┘
                          ┌──────────┴──────────┐
              ┌───────────▼────────┐  ┌─────────▼──────────┐
              │ T2.4 rate limits   │  │ T1.6/T2.7 VM scale │
              │  keyed by userId   │  │  resize → N inst.  │
              └────────────────────┘  └────────────────────┘

              ┌──────────────────────────────────────────┐
              │ T2.6  version-save lock scope (L-792)    │
              │   ⚠ MUST precede T2.2                    │
              └────────────────────┬─────────────────────┘
                                   │
              ┌────────────────────▼─────────────────────┐
              │ T2.2  project_members in the gate (L-336)│
              │   makes co-editing POSSIBLE …            │
              └────────────────────┬─────────────────────┘
                                   │ … and therefore makes L-792's 412 VISIBLE
              ┌────────────────────▼─────────────────────┐
              │ T3  delta persistence + CRDT             │  (L-786 + L-391)
              │   ONE project, not two                   │
              └──────────────────────────────────────────┘
```

**Three ordering constraints are hard, and each one is a correctness constraint, not a preference:**

- **T2.3 before any scale-out.** Adding a second machine without the Socket.io adapter is a
  *correctness regression* — peers in one project stop seeing each other, silently. Resizing one
  machine (T1.6) is safe; adding a second one is not, until the adapter lands.
- **T2.6 before T2.2.** Wiring membership makes co-editing possible. Today `createVersionTransactional`
  holds a row lock across a ~16 MB insert and 412s the loser of any concurrent save. Ship T2.2 first
  and the very first thing invited collaborators experience is losing each other's work.
- **T1.7 before T2 and T3 are *ordered*.** T1's items are cheap and independently justified, so they
  do not wait. But the sequencing of the expensive work should follow a profile.

---

## 2. New contracts

### C16-CONCURRENCY-AND-SCALE (new)

The audit could not find a stated concurrency target anywhere; the only record was a comment in
`fly.toml`. That absence is why L-770 could sit at "acceptable for a closed beta" without anyone
having to name the beta's size. C16 fixes that by making the number a contract term.

| § | Content |
|---|---|
| §1 | **Stated targets** per tier (beta / GA / scale), each with a concurrent-user number, a document-size assumption, and the measurement that proves it. A tier without a passing k6 run is *claimed*, not *held*. |
| §2 | **Per-instance limits** — pool size, socket count, memory ceiling, request concurrency — and the arithmetic linking them to §1. |
| §3 | **Statelessness invariant.** Enumerates every piece of per-process mutable state (`_inMemoryProjects`, `_userEmailCache`, `_migrationsReady`, rate-limit store, Socket.io rooms) and where each must live once N > 1. **A new module-level mutable Map in `server/` is a contract violation** and needs a CI check. |
| §4 | **Source-of-truth table** — one row per datum, naming exactly one owner. Currently implicit and, for three data (undo history, persisted document, membership), genuinely split. |
| §5 | **Degradation policy.** What the system does when PG is unreachable: refuse honestly. Names L-789's fallback as dev-only and forbids the pattern in production paths. |
| §6 | **Load-test contract.** The k6 scenario is the artefact that closes a §1 tier claim. |

### C17-ELEMENT-LIFECYCLE (new)

One canonical creation pipeline, and the Builder / Factory / Command / Store / Service rule table
from the audit's *Builder Audit*. Motivated by L-793 (two mutation paths), L-796 (namespace
duplication) and L-797 (partial batch coverage) all being symptoms of an unwritten lifecycle.

### Contracts touched, not created

- **C05 (persistence + file format)** — §1.1 already says the persistence client is the single
  write gateway. T3 makes that true (the autosave path currently bypasses it) and adds the delta
  format. **The code disagreeing with C05 means the code is wrong**, per the governance order.
- **C08 (collaboration + security)** — §7 gains the userId-keyed rate-limit rule (T2.4); the
  access-model section gains the membership resolution T2.2 implements.
- **C03 (schemas/commands/state)** — §4.x gains the batch-dispatch rule from T4/L-797.

---

## 3. Tranche 1 — immediate (≈5 days, low risk, independently shippable)

| # | ID | Change | Test / verification | Risk |
|---|---|---|---|---|
| T1.1 | L-788 | Three additive indexes in `dbMigrate.js` SCHEMA_SQL | Schema test asserting each index exists in the DDL and covers its query's `(col, col DESC)` shape | Very low |
| T1.2 | L-789 | `§SERVER-PG-DEGRADE` gated to non-production; 503 + retryable code in prod | Failing-test-first: assert a PG error yields a refusal, not a fabricated row | Low, but see below |
| T1.3 | L-787 | `max` 10→25; `statement_timeout` moved into the connection string so the pooler path regains it | Unit test on the conn-string builder; `SHOW statement_timeout` on a real pooled connection | Low |
| T1.4 | L-796 | Canonicalise `curtainwall.*` → `curtain-wall.*`, aliases for one release, CI naming check | New CI check + alias test | Low |
| T1.5 | L-802(g) | `* text=auto` in `.gitattributes` | `git ls-files --eol` clean | Very low |
| T1.6 | L-770a | `fly.toml` → `performance-2x` (2 vCPU / 4 GB) | Deploy-time; `/api/health/live` + memory headroom | Low |
| T1.7 | L-800 | k6 scenario at 1,000 VUs | Its own output is the artefact | None (read-mostly; write paths against a scratch account) |

**T1.2 carries a communication cost that must be stated up front:** it converts silent failures
into visible ones. Error rates will *appear* to rise. They are not rising — they were always there
and were being reported as 200s. This must be said before the deploy, not after.

---

## 4. Tranche 2 — short-term (≈20 days)

| # | ID | Change | Depends on |
|---|---|---|---|
| T2.1 | L-801 | Write **C16**; enumerate per-process state as its §3 inventory | — |
| T2.6 | L-792 | Move the JSONB insert outside the `FOR UPDATE` scope; advisory lock keyed on `project_id` for the count check only; single mechanism for `version_count` | — |
| T2.2 | L-336 | `canUserAccessProject` + the three project read queries consult `project_members`; two-user integration test | **T2.6** |
| T2.3 | L-770 | Redis; `@socket.io/redis-adapter`; move rate-limit store, `_userEmailCache`, `_migrationsReady` off per-process memory | T2.1 §3 |
| T2.4 | L-790 | Rate limits keyed on `req.auth.userId`; AI quota onto `@pryzm/ai-cost` per-plan accounting | **T2.3** |
| T2.5 | L-791 | Buffer command-log inserts (100 ms → multi-row); day-partition + scheduled drop replacing the 2 % inline range DELETE | — |
| T2.7 | L-442 | Precompile the server; stop transpiling ~100 packages at boot | — |
| T2.8 | L-770b | N stateless instances + CPU autoscale | **T2.3, T2.4, T2.7** |

**T2.2 note — the FK trap.** `project_members.user_id REFERENCES pryzm_users(id)` exists in
SCHEMA_SQL, but `projects.owner_id` deliberately has **no** FK because users live in Supabase, not
the Replit PG copy (C05 §1.3) — and `dbMigrate.js:472` already drops
`project_members_user_id_fkey` for exactly that reason. The membership write path must therefore
not assume the FK is present. This is the kind of detail that turns a 3-day task into a 6-day one
if found late.

---

## 5. Tranche 3 — the architectural change (≈25–35 days)

**T3 = L-786 + L-391, as one project.** Delta persistence and CRDT deployment are the same
problem seen from two ends: the bus already emits exact forward/inverse patches, the Y.Doc already
knows how to merge them, and the only missing piece is a durable, ordered, server-side home for
them. Doing either alone means building half of the other.

Design constraints, to be settled in an ADR before any code:

1. **Snapshots do not disappear.** They stop being the *autosave* mechanism and remain the
   *versioning* and *compaction* mechanism. C13 (persisted version is the authoritative model
   served on open) stays true; what changes is how the latest state is reconstructed.
2. **Open must not become slower.** Open = latest snapshot + patches since. Compaction cadence is
   the knob; it needs a stated bound (e.g. never more than N patches to replay).
3. **Flagged, with snapshot fallback**, and the fallback must be *observable* — a silent fallback
   would re-create L-789 in a new place.
4. **The 412 goes away** because concurrent edits merge instead of racing. That is the user-visible
   payoff and the thing to demo.

---

## 6. Tranche 4 — remaining P2/P3

L-793 (finish the command migration; widen the gate to `apps/`), L-794 (`SceneRegistry`
authoritative), L-795 (union-then-subtract CSG + kernel worker), L-797 (batch coverage), L-798
(LATERAL rewrite *only if* still hot post-T1.1), L-799 (Core/App boundary; extract the zoning
proxies to `apps/api-gateway`), L-802 (the P3 group), plus **C17**.

---

## 7. Progress log

| Tranche | Item | Status | Commit |
|---|---|---|---|
| T1.1 | L-788 hot-query indexes | ✅ DONE — 4 tests, 3/4 red first | `1bbe0a97` |
| T1.2 | L-789 degrade honesty | ✅ DONE — 8 tests, 6/8 red first | `97ad9f77` |
| T1.3 | L-787 pool size + `SET LOCAL` timeout | ✅ DONE — 12 tests | `ceaddb38` |
| T1.5 | L-802(g) scoped LF policy | ✅ DONE — 20 files renormalised | `ffae7651` |
| T1.4 | L-796 alias seam + prefix ratchet | ✅ DONE — 13 tests; gate negative-tested | `e534a58b` |
| T1.7 | L-800 k6 harness | ✅ AUTHORED — **not yet run**; needs staging + credentials | — |
| T1.6 | L-770a VM resize | ⛔ **FOUNDER-GATED — not done, deliberately** | — |
| T2.1 | **C66 — Concurrency & Scale** minted + indexed | ✅ DONE — found L-804, L-805 | — |

*(An item is DONE when its test is green, root `tsc` passes, and its ISSUE-LOG row is updated —
not when the code is written.)*

### ⛔ T1.6 is deliberately not done — this needs a founder decision

The audit recommended resizing to `performance-2x`. **I did not make that change**, because
`fly.toml` records that this exact change was already made and then **reverted**, with reasons:

> `§L-442 REVERTED 2026-07-20 — back to 512 MB / 1 CPU. I raised this to 1024/2 to fix a "slow cold
> boot" that DOES NOT EXIST: measured boot-to-env-check is 2.9s, not 60s. The real cause was L-444
> (the deploy gate querying a dead database). Keeping the larger VM would be paying for a diagnosis
> that was wrong. **Beta budget: stay on the free-tier-friendly size until September.**`

Three reasons to leave it alone:

1. **It is a billing event the founder already ruled on**, with a stated horizon (September) that
   has not arrived. Spending someone's money on the strength of a derived estimate is not a
   technical call.
2. **The last time this was raised, the diagnosis was wrong.** The comment is a warning written by
   someone who made exactly this mistake. My case is different — capacity, not boot time — but
   "different reasoning, same change, previously reverted" deserves an explicit decision, not a
   silent repeat.
3. **The evidence is not in yet.** T1.7's k6 run is what turns "1 vCPU is ~20× short" from a
   derivation into a measurement. Resize *after* the ramp stage, sized to what it shows.

**What the founder needs to decide:** whether to hold the free-tier line to September and accept a
~50–200 concurrent-user ceiling, or to spend now. Either is defensible; the audit does not make it
for them.

### ⚠ T1.7 is authored, not run

The harness cannot be run from here: it needs credentials and a target. It also **must not** be
pointed at production at `STAGE=target` — 1,000 VUs against one 512 MB machine with
`min_machines_running = 1` is a real outage for real users, and `fly.staging.toml` **does not
exist** despite `fly.toml:18-19` describing it (L-770). **Creating a staging app is a prerequisite
for the target stage**, not a nicety. `STAGE=smoke` against production is harmless and is the right
first step.
