# Pre-launch batch-10 — findings

**Agent:** pre-launch bug-fixing lane, batch-10
**Date:** 2026-07-31
**Branch:** `worktree-agent-a6bb2b1c8594aefe7` (branched from `main` @ `3d932a84`)
**Commits:** `385df665`, `aa59cf54`
**Assigned target:** L-406 (P1 — unauthenticated `/api/event-log` write)
**Handovers from batch-9:** XSS sink-scan `--update`; `HouseLayoutModal.ts:651`

Evidence discipline used throughout, per the DK probe standard:

| State | Meaning |
|---|---|
| **VERIFIED** | Established by reading the source and/or executing a command whose output is quoted below. |
| **ASSERTED-UNVERIFIED** | Stated by an existing doc/test/comment, not independently confirmed by this batch. |
| **UNKNOWN** | Not established either way. Named so it is not mistaken for "fine". |

---

## 0. Headline

**The assigned P1 was already fixed in code; the thing that was still broken was the audit that was supposed to catch it.**

L-406's route (`POST /api/event-log`) was hardened on 2026-07-18 in `065c23e2`. The
`ISSUE-LOG.md` row still reads `OPEN — UNASSIGNED / TBD` because the
doc was never updated. That is doc-lag, not a code gap.

The real, un-owned defect sits one level up. The C08 §2.1 "write route coverage matrix"
— the test whose stated job is *"failing this test means the audit matrix is incomplete
and a route may be unprotected"* — **never opened `server.js`**. It asserted the length
of its own hand-typed array. It was green by construction, it declared the L-406 route
**exempt and safe**, and it had silently fallen **nine routes** behind the real surface.

This is the batch-9 pattern (a gate reporting ✅ while scanning zero files) recurring in
a different subsystem: *the check could not see the thing it certified.*

---

## 1. L-406 — status of the route itself

### 1.1 Mechanism of the original vulnerability (from the fix's own record)

`POST /api/event-log` was mounted outside the auth chain and trusted `audit.actorId` /
`audit.projectId` straight from the request body. `authMiddleware` never rejects — by
C08 §1.2 it populates `req.auth` and lets the handler decide — so a route mounted
outside it has no `req.auth` at all and is *structurally unable* to attribute or
authorise the write. Any unauthenticated caller could forge an audit row attributed to
any user in any tenant's project.

### 1.2 Current state — **VERIFIED**

`server/eventLog.js` + `server.js:4103`:

1. Mounted `apiLimiter, authMiddleware, makeEventLogHandler({ requireAccess })`.
2. Anonymous (`req.auth.userId === 'anonymous'`) → **401**.
3. `actorId` is **always** the session user; body-supplied `audit.actorId` is discarded.
4. Project-scoped events pass `_httpRequireAccess` (403 deny / 503 retryable) — the same
   gate every other project-scoped route uses.
5. A no-project event is allowed and attributed only to the caller.

Covered by `server/__tests__/eventLog.test.ts` T01–T05 (5 specs). **VERIFIED** — those
five pass in `npm run test:server`.

**Verdict: L-406 is closed in code.** The audit row is stale and needs the prose in §6.

---

## 2. THE FINDING — the C08 §2.1 audit matrix was tautological

### 2.1 Mechanism

`server/__tests__/permissions.test.ts` §3 declared:

```ts
const auditMatrix: Array<{ route; method; mechanism; exempt }> = [ /* 37 entries */ ];

it('T19 — audit matrix covers all 37 write routes (C08 §2.1 full coverage)', () => {
    expect(auditMatrix).toHaveLength(37);
});
it('T20 — every non-exempt route has an explicit enforcement mechanism', …);
it('T21 — every route in the matrix has a non-empty route string', …);
```

Every assertion is about the literal declared four lines above it. `server.js` is never
read. The test therefore **cannot fail for the reason it exists**: adding an unprotected
route to `server.js` changes nothing it observes. "Coverage" meant "the array I typed
has 37 rows".

This is not a weak test — it is a test pointed at the wrong artefact. Its failure mode
is silence, and silence read as compliance.

### 2.2 Consequence 1 — the audit certified the vulnerability — **VERIFIED**

Line 270 of the pre-fix file:

```ts
{ route: '/api/event-log', method: 'POST',
  mechanism: 'rate-limited, no project write', exempt: true },
```

The mechanism claim is false in both halves: the route *is* a project write, and
rate-limiting is not authorisation. **The document whose job was to catch L-406 is the
document that declared it safe** — and it still said so after `065c23e2` fixed the route,
because nothing connected the matrix to the source.

### 2.3 Consequence 2 — nine routes drifted in unaudited — **VERIFIED**

Matrix: 37 routes. `server.js`: 46. Difference:

| Route | Method | Real state |
|---|---|---|
| `/api/security/csp-report` | POST | authless (by design) |
| `/api/leads` | POST | authless (by design) |
| `/api/overpass` | POST | authless (by design) |
| `/api/ai/cache/lookup` | POST | `authMiddleware` |
| `/api/ai/cache/store` | POST | `authMiddleware` |
| `/marketplace/api/publishers/register-key` | POST | `authMiddleware` |
| `/marketplace/api/plugins/:id(*)/install` | POST | `authMiddleware` |
| `/marketplace/api/plugins/:id(*)/checkout` | POST | `authMiddleware` |
| `/marketplace/api/plugins/:id(*)/reviews` | POST | `authMiddleware` |

None of the nine is itself a vulnerability. The finding is that **their protection status
was luck, not verification** — nothing would have reported it had any of them shipped
authless, exactly as nothing reported `/api/event-log`.

### 2.4 Independent trace of all 7 authless routes — **VERIFIED**

Every authless write route was re-derived from source and each handler read. I did *not*
carry any mechanism claim over from the old matrix.

| Route | server.js | What actually prevents anonymous abuse |
|---|---|---|
| `/api/security/csp-report` | 377 | Browser CSP reporting agent cannot attach a Bearer token. Answers 204; persists no row, no user-attributed state. |
| `/api/leads` | 383 | Pre-signup by definition — no session exists yet. Self-attributed marketing lead; no tenant, no project; never read into an authorisation decision. Rate- + size-capped. |
| `/api/overpass` | 395 | Semantically a read-through cache of public OSM data (POST only because Overpass-QL rides the body). Cache key = query, value = public geometry identical for all callers. `apiLimiter` 60/min/IP. |
| `/api/auth/set-plan` | 1800 | `x-internal-secret` vs `INTERNAL_PLAN_SECRET`, and **fail-closed**: `if (!internalSecret \|\| header !== internalSecret) return 403` — an unset env var denies every request rather than accepting them. |
| `/api/auth/signup` | 1881 | Authentication cannot precede creation of the account it would authenticate. Write confined to a new self-owned row. |
| `/api/auth/signin` | 1904 | The route that *mints* the session. Mutates no domain state. |
| `/api/stripe/webhook` | 2078 | **Re-verified by reading the handler, not by trusting the matrix.** `constructWebhookEvent()` HMAC-verifies the raw body against `STRIPE_WEBHOOK_SECRET` before any business logic; missing signature header → 400; missing secret → 503 fail-closed (5xx so Stripe retries rather than silently dropping a paid subscription). |

**No new vulnerability was found among the authless set.** The defect is the audit, not
the routes — which is precisely why it survived: nothing was visibly broken.

---

## 3. The fix — invert the enumeration (commit `385df665`)

**Governing contract:** C08 §1.2 (auth-middleware contract), §2.1 (role gate on every
mutating route), §2.2 (server-side ownership check). Gate precedent and file layout
mirror batch-9's `tools/ga-gate/lib/xssSinkScan.ts` + `check-xss-guards.ts`.

**Design rationale.** A hand-list of *every* route drifts — demonstrated, nine times over.
A hand-list of only the *exceptions* cannot, provided it is reconciled against a scan of
the real source in **both** directions. Protected routes then need no declaration at all;
the scan proves them, so the gate needs no maintenance as routes are added.

| File | Role |
|---|---|
| `tools/ga-gate/lib/writeRouteScan.ts` | Pure, I/O-free Express route scanner. |
| `tools/ga-gate/write-route-auth-exemptions.json` | The 7 authless routes, each with a rationale for what prevents anonymous abuse. |
| `tools/ga-gate/check-write-route-auth.ts` | CI gate + `--list`. |
| `tools/ga-gate/__tests__/writeRouteScan.spec.ts` | 28 specs. |
| `server/__tests__/permissions.test.ts` §3 | T19–T21 replaced by source-derived T28–T33. |
| `tools/ga-gate/run-all.ts`, `package.json` | Registration (`check:write-route-auth`). |

### 3.1 Deliberate anti-blindness properties

Each of these exists because its absence is a way the gate could report green while
seeing nothing:

- **Coverage floor.** `MIN_WRITE_ROUTES = 40`; below it the gate exits **2**, not 0.
- **Root resolution.** `fileURLToPath`, not `new URL(...).pathname` — the latter yields
  `/C:/…` on Windows, which is the exact bug that made `check-xss-guards` scan zero files.
- **Throw, don't shrink.** An unterminated `app.post(` or an unresolvable path constant
  **throws**. A scanner that silently skipped `app.post(EVENT_LOG_PATH, …)` would report a
  smaller, cleaner route surface — failure disguised as good news.
- **Comments stripped before matching.** A `// TODO: add authMiddleware` comment must not
  satisfy a security check (spec T06); a commented-out registration is not a live route (T09).
- **Bidirectional reconciliation.** Stale (route gone) and obsolete (route gained auth)
  exemptions both fail. A list that outlives its routes is how the matrix became fiction.
- **Rationale required.** A blank rationale fails. Exempting must cost a sentence of thought.

### 3.2 Mutation proof — the gate can actually see — **VERIFIED**

Live proof, re-introducing L-406 by removing `authMiddleware` from the real registration:

```
$ npx tsx tools/ga-gate/check-write-route-auth.ts     # unmutated
[write-route-auth] ✅ 46 mutating route(s) scanned in server.js: 39 behind
authMiddleware, 7 declared-exempt with a rationale. 8 router mount(s) seen.
exit 0

$ node <remove authMiddleware from the EVENT_LOG_PATH registration>
$ npx tsx tools/ga-gate/check-write-route-auth.ts
[write-route-auth] ❌ 1 MUTATING route(s) mounted outside the auth chain with no
declared exemption (C08 §1.2):

  POST /api/event-log  server.js:4039  [apiLimiter]
exit 1
```

> **Process note worth keeping.** My *first* attempt at this mutation silently failed to
> apply (CRLF vs LF in the replacement string) and the gate dutifully reported ✅ — a
> false green produced by my own test, not by the gate. I caught it only by checking
> `git diff --numstat server.js` before believing the result. Spec **T25** therefore
> asserts `expect(mutated).not.toBe(source)` *before* asserting the detection, so a
> mutation that stops applying fails loudly instead of passing vacuously. **A mutation
> test that cannot prove its mutation landed is itself a tautology** — the same shape as
> the defect this batch fixed.

---

## 4. Second finding — 17 of 22 GA gates run nowhere in CI

Found while wiring the new gate: I checked whether `run-all.ts` is actually executed,
rather than assuming the docs were right.

**Status: VERIFIED (mechanism) / UNKNOWN (whether flipping it is safe today).**

- `.github/workflows/ci.yml:276` job `ga-gate` runs `pnpm run ga-gate`.
- `package.json:45` → `node packages/release/src/ga-gate.mjs`.
- That script's `CHECKS` array runs **5** of the 22 `tools/ga-gate/check-*.ts` scripts:
  `check-engine-bootstrap-loc`, `check-cast-count`, `check-raf-count`,
  `check-l7-boundary`, `check-motion-gate-coverage` (plus lint/typecheck/wireup/gesture/visual-diff).
- **`tools/ga-gate/run-all.ts` — which runs all 22 — is invoked by nothing in any workflow.**
  Its only references are docs asserting it is merge-blocking: `CLAUDE.md:92`,
  `STR-02:192`, `STR-03:130`, `STR-04:212`, `STR-05:423`, `C14:447`.
- The `ga-gate` job additionally carries `continue-on-error: true`, so even those 5 are advisory.

Reproduce:

```bash
grep -n "ga-gate" package.json .github/workflows/ci.yml
grep -rn "ga-gate/run-all" --include=*.yml .
sed -n '181,197p' packages/release/src/ga-gate.mjs
```

**Consequence.** `check-xss-guards.ts` — batch-9's headline deliverable, the repo-wide
XSS sink scan with its 147-file ratchet — **does not run in CI at all.** Neither do
`check-otel-spans`, `check-project-isolation`, `check-zoning-fidelity-label`,
`check-height-fidelity`, `check-three-imports`, and eleven others. Six governance
documents state these are merge-blocking. They are not.

**Why I did not just fix it.** Wiring `run-all.ts` into CI and clearing
`continue-on-error` would arm 17 gates simultaneously, several of which are ratchets at
baselines whose current pass/fail state is **UNKNOWN** to me. That is a repo-wide CI
decision, not a batch-10 fix, and landing it blind could red the build for every agent.
Left open in §7 with a proposed sequence.

**How my own work avoids depending on it.** I placed the enforcement in the two CI jobs
that verifiably *are* blocking (no `continue-on-error`):

- `server/__tests__/permissions.test.ts` → job `test-server` → `pnpm run test:server`
- `tools/ga-gate/__tests__/writeRouteScan.spec.ts` → job `test-root` → `pnpm run test:root` (root `vitest.config.ts:58` includes `tools/ga-gate/__tests__/**`)

The CLI gate in `run-all.ts` is a bonus, not the load-bearing lock.

---

## 5. Batch-9 handovers

### 5.1 Sink-scan `--update` — **no-op, premise was wrong** — VERIFIED

The handover expected the gate to report "shrunk / please tighten" because batch-9's
baseline predated batch-8. It does not:

```
$ npx tsx tools/ga-gate/check-xss-guards.ts
[xss-guards] ✅ no new unguarded HTML-sink interpolations. 580 baselined finding(s)
across 147 file(s); 4297 files scanned.

$ npx tsx tools/ga-gate/check-xss-guards.ts --update
[xss-guards] baseline written: 147 file(s), 580 finding(s).
$ git diff --stat tools/ga-gate/xss-sink-baseline.json
(empty)
```

`--update` produced a **byte-identical** file. The baseline was already tight on current
`main`; batch-8's fixes did not lower the count in any baselined file. Nothing committed —
committing an identical file would be noise. 4297 files scanned, well above
`MIN_SCANNED_FILES`, so the ✅ is a seeing ✅.

### 5.2 `HouseLayoutModal.ts:651` — **safe, and now locked** (commit `aa59cf54`)

```ts
if (result) result.outerHTML = buildHouseResultHtml(cards[0], this._noticeHtml);
```

Traced end-to-end. `buildHouseResultHtml` has exactly **one** deliberately-raw input,
`noticeHtml`, a documented pre-built-HTML pass-through — so its safety is a property of
its **producers**, not of the sink. Both producers (`HouseLayoutController.ts:446`,
`ApartmentLayoutController.ts:84`) go through `buildReducedProgramNoticeHtml`, which
`escHtml()`s the summary. Everything else is `escHtml()`-guarded (`title`, `roofKind` via
`roofLabel`, `stairText`) or a `number` model field (`overall`, `storeyCount`, `index`).

Batch-9's baselining decision was therefore **correct**. But it was *asserted*, not
verified, and nothing locked it — and there is a real path worth locking:
`roomTypeLabel()`'s generic fallback Title-cases and passes through an **unknown** room
type, so a hostile type string does reach the notice summary and is neutralised **only**
by the producer. Remove that one `escHtml` and the sink becomes live.

Four specs added (`programNotice.test.ts`, 16 → 20): hostile title, hostile `roofKind`,
numeric `style="width:82%"` / `data-index="0"` stay numeric (a string here would be a
CSS-injection sink), and the raw pass-through fed a hostile room type. **20/20 pass.**
No production code changed — there was no bug, only an unverified claim.

---

## 6. Audit-log prose for `ISSUE-LOG.md`

> **L-406 — CLOSED (batch-10, `385df665`; route itself fixed earlier in `065c23e2`).**
> Two separate things were wrong and only one was the route. **(a) The route:** `POST
> /api/event-log` was hardened on 2026-07-18 — mounted behind `authMiddleware`, anonymous
> → 401, `actorId` taken from the SESSION with any body-supplied `audit.actorId`
> discarded (closes the actor-spoof), and project-scoped events gated through the same
> `_httpRequireAccess` membership check every other project-scoped route uses (403 deny /
> 503 retryable). `server/__tests__/eventLog.test.ts` T01–T05. This audit row was never
> updated and has read `OPEN — UNASSIGNED` ever since; that was doc-lag, not a gap.
> **(b) The real un-owned defect — the audit that was supposed to catch it.** The C08
> §2.1 "write route coverage matrix" in `server/__tests__/permissions.test.ts` §3 was a
> hand-typed 37-entry array whose headline assertion was `expect(auditMatrix).toHaveLength(37)`
> against the literal declared four lines above. It never opened `server.js`, so it was
> green by construction and structurally incapable of detecting an unprotected route. It
> declared `/api/event-log` `exempt: true, mechanism: 'rate-limited, no project write'` —
> **the audit meant to catch L-406 is the document that certified it safe**, and it still
> said so after the route was fixed. It had also fallen 9 routes behind reality (37
> declared vs 46 registered): `/api/security/csp-report`, `/api/leads`, `/api/overpass`,
> `/api/ai/cache/lookup`, `/api/ai/cache/store`,
> `/marketplace/api/publishers/register-key` and the three `/marketplace/api/plugins/:id/*`
> writes — all unaudited, suite still green. **Fix (C08 §1.2/§2.1/§2.2):** invert the
> enumeration — declare only the EXCEPTIONS, derive the rest from a scan of the real
> source. New `tools/ga-gate/lib/writeRouteScan.ts` (pure, I/O-free; resolves the
> `server/*.js` path constants, strips comments before matching so prose can't satisfy a
> security check, and THROWS on an unterminated call or unresolvable path rather than
> reporting a smaller cleaner surface); `write-route-auth-exemptions.json` (the 7 authless
> routes, each traced to its handler and each carrying a rationale for what prevents
> anonymous abuse — including a re-verification that the Stripe webhook HMAC-checks the
> raw body before any business logic and fails closed, rather than trusting the old
> matrix's claim); `check-write-route-auth.ts` (fails on undeclared-authless, stale,
> obsolete or unjustified entries; `MIN_WRITE_ROUTES` coverage floor + `fileURLToPath`
> root so an unscannable tree exits 2 instead of passing — the batch-9 lesson). All 7
> authless routes independently traced: **no new vulnerability** — the defect was the
> audit, not the routes, which is why it survived. Tests: 28 new ga-gate specs incl. a
> mutation proof that re-introducing L-406 is detected (and an assertion that the mutation
> actually applied — my first attempt silently no-op'd on CRLF and produced a false green);
> `permissions.test.ts` T19–T21 replaced by source-derived T28–T33. Both suites are in
> BLOCKING CI jobs (`test-server`, `test-root`). Verification: gate exit 0 unmutated / exit
> 1 mutated; ga-gate specs 28/28; `test:server` 272 passed / 1 failed (`catastroBlock`,
> pre-existing on a clean tree); root `tsc --noEmit --skipLibCheck` 88 errors vs 88
> baseline = **0 net-new**; `check:isolation` green.

> **L-407 — further PARTIAL (batch-10, `aa59cf54`) — `HouseLayoutModal.ts:651` verified,
> not fixed, and now locked.** Batch-9 baselined `result.outerHTML =
> buildHouseResultHtml(cards[0], this._noticeHtml)` on the grounds that the builder has
> its own escaping. Traced end-to-end: that is **correct**, but it was asserted rather
> than verified and nothing locked it. The sink has exactly one deliberately-raw input,
> `noticeHtml` — a documented pre-built-HTML pass-through — so its safety is a property of
> its PRODUCERS, not the sink; both producers route through
> `buildReducedProgramNoticeHtml`, which `escHtml()`s the summary. Every other
> interpolation is `escHtml()`-guarded (`title`, `roofKind`→`roofLabel`, `stairText`) or a
> `number` model field. Worth locking because `roomTypeLabel()`'s generic fallback
> Title-cases and passes through an UNKNOWN room type, so a hostile type DOES reach the
> notice summary and is neutralised only by the producer — remove that one `escHtml` and
> the sink goes live. 4 specs added to `programNotice.test.ts` (16→20, all pass): hostile
> title, hostile `roofKind`, numeric `width`/`data-index` stay numeric (a string there
> would be a CSS-injection sink), and the raw pass-through fed a hostile room type. **No
> production code changed — there was no bug, only an unverified claim.** Separately, the
> handed-over sink-scan `--update` is a **no-op**: `--update` rewrites a byte-identical
> baseline (580 findings / 147 files / 4297 files scanned), so batch-9's baseline was
> already tight on current main and the "shrunk / please tighten" premise was wrong.

> **L-NEW (batch-10, VERIFIED, unfixed) — [P1 - CI/GOVERNANCE] 17 of 22 GA gates run
> NOWHERE in CI, and the job that runs the other 5 is advisory.** Six governance documents
> (`CLAUDE.md:92`, `STR-02:192`, `STR-03:130`, `STR-04:212`, `STR-05:423`, `C14:447`)
> state that `tools/ga-gate/check-*.ts` are run by `tools/ga-gate/run-all.ts` and are
> merge-blocking. **`run-all.ts` is invoked by nothing in any workflow.** CI's `ga-gate`
> job runs `pnpm run ga-gate` → `packages/release/src/ga-gate.mjs`, a *different*
> orchestrator whose `CHECKS` array contains only 5 of the 22 gates (`engine-bootstrap-loc`,
> `cast-count`, `raf-count`, `l7-boundary`, `motion-gate-coverage`) — and that job carries
> `continue-on-error: true`, so even those cannot fail a build. Not running anywhere:
> `check-xss-guards` (batch-9's entire L-407 regression lock, 147-file ratchet),
> `check-otel-spans`, `check-project-isolation`, `check-three-imports`,
> `check-zoning-fidelity-label`, `check-height-fidelity`, and 11 more. Every "✅ the gate
> will catch it" claim resting on those is currently false. This is the batch-9 finding
> one level up: not a gate that sees nothing, but a gate that *runs* nowhere. **Not fixed
> here deliberately** — arming 17 ratchets at once is a repo-wide CI decision and several
> baselines' current state is UNKNOWN; landing it blind could red the build for every
> agent. Proposed sequence: (1) run `run-all.ts` locally and record per-gate
> pass/fail; (2) add a `ga-gate-full` job running `run-all.ts` with
> `continue-on-error: true` to get a real signal; (3) fix or re-baseline the red ones; (4)
> flip to blocking and delete the now-redundant 5-gate path. *Owner: TBD.*

---

## 7. Left open — honest list

| # | Item | Why not done |
|---|---|---|
| 1 | **17 of 22 GA gates unwired from CI** (§4) | Repo-wide CI decision, not a batch-10 fix. Arming 17 ratchets at once with UNKNOWN baselines could red the build for every agent. Sequence proposed in §6. **Highest-value item I am handing on** — it silently voids batch-9's deliverable. |
| 2 | **`catastroBlock.test.ts` failing** — `expected undefined to be close to 605` in `parseParcelCollectionGml` | Pre-existing; **VERIFIED** by stashing my changes and re-running (1 failed / 17 passed on a clean tree). Sits in `packages/site-parcel-data`-adjacent territory owned by another agent per my boundaries. |
| 3 | **The 580 baselined XSS findings** | Untouched. Batch-9's note that they are dominated by static enum labels and preset tables remains **ASSERTED-UNVERIFIED**; they are still not individually traced. |
| 4 | **Router-mounted write routes are scanned but not gated** | `scanWriteRoutes` records `app.use(prefix, …)` mounts and all 4 API mounts are `authMiddleware`-protected today (`/api/v1`, `/api/v1/families`, `/v1/ai`, `/api/stripe`). Routes *inside* those routers are not individually enumerated — the mount-level gate covers them, but a router mounted **without** auth would need its own routes scanned. **UNKNOWN** whether any such mount will appear; the gate would report the mount as `PUBLIC` in `--list` but does not fail on it. Natural next increment. |
| 5 | **HTTP-level integration tests for `/api/event-log`** | `server.js` does not export the app, so the eventLog specs test the extracted handler factory, not a live request. Noted in the file header since before this batch; unchanged. |
| 6 | **`/api/auth/set-plan` shared-secret strength** | Fail-closed and correct as written; whether `INTERNAL_PLAN_SECRET` is actually set (and rotated) in the Fly deployment is **UNKNOWN** to me — I cannot see production secrets. |

---

## 8. Process incident — shared stash stack across worktrees

**Recorded because it nearly destroyed two agents' work and will recur.**

Measuring the tsc baseline requires stashing. `git stash` / `git stash pop` operate on a
stack that is **shared by every worktree of the same repository**. Sequence observed:

1. batch-10 `git stash -u` → my WIP is `stash@{0}`.
2. Agent `a6dfd20492b0791ee` (a different worktree) pushes a stash → theirs becomes
   `stash@{0}`, mine is bumped to `stash@{1}`.
3. batch-10 `git stash pop` (no argument) → pops **their** stash into **my** worktree and
   drops it. My `git status` showed `packages/site-parcel-data/**` — files on my
   do-not-touch list.
4. A third pop elsewhere consumed my stash entry.

Recovered by locating the dangling stash commits with
`git fsck --unreachable --no-reflogs` and matching on the branch name embedded in the
stash message (`WIP on worktree-agent-<id>`). Mine was `bc6f7518`; restored with
`git stash apply bc6f7518` (which also restores the `-u` untracked files via the stash's
third parent). The other agent's files were first parked with a pathspec-limited,
clearly-labelled stash so they remain recoverable:

```
RECOVERED-FOR-agent-a6dfd20492b0791ee: site-parcel-data byggefelt WIP —
mis-popped into batch-10 worktree by shared-stash-stack race
```

**Rules that follow, for every agent in a shared checkout:**

- **Never** run bare `git stash pop` / `git stash drop`. Always address an explicit SHA:
  `git stash apply <sha>`, which needs no stack entry and cannot race.
- Prefer measuring a tsc baseline **without** stashing — e.g. `git worktree add` a
  throwaway checkout at the base commit, or run tsc on the base commit in a separate
  clone.
- If a `pop` yields files you do not recognise, **stop**: re-stash them with a
  `RECOVERED-FOR-<agent-id>` label before doing anything else, and report it.

---

## 9. Verification transcript

```
$ npx tsx tools/ga-gate/check-write-route-auth.ts
[write-route-auth] ✅ 46 mutating route(s) scanned in server.js: 39 behind
authMiddleware, 7 declared-exempt with a rationale. 8 router mount(s) seen.
exit 0

$ <remove authMiddleware from the event-log registration>
$ npx tsx tools/ga-gate/check-write-route-auth.ts
[write-route-auth] ❌ 1 MUTATING route(s) mounted outside the auth chain with no
declared exemption (C08 §1.2):
  POST /api/event-log  server.js:4039  [apiLimiter]
exit 1

$ npx vitest run tools/ga-gate/__tests__/writeRouteScan.spec.ts
Test Files 1 passed (1)   Tests 28 passed (28)

$ npm run test:server
Test Files 1 failed | 19 passed (20)
Tests 1 failed | 272 passed (273)
# the 1 failure is catastroBlock.test.ts — pre-existing:
$ git stash -u && npx vitest run --config vitest.server.config.ts \
    server/__tests__/catastroBlock.test.ts
Test Files 1 failed (1)   Tests 1 failed | 17 passed (18)

$ cd apps/editor && npx vitest run __tests__/programNotice.test.ts
Test Files 1 passed (1)   Tests 20 passed (20)

$ npx tsc --noEmit --skipLibCheck | grep -c "error TS"
88                      # with batch-10 changes
88                      # baseline (changes stashed)  →  0 NET-NEW

$ npm run check:isolation
✓ Project isolation is intact.
✓ Every localStorage / sessionStorage key is either project-scoped or allowlisted.

$ npx tsx tools/ga-gate/check-xss-guards.ts
[xss-guards] ✅ no new unguarded HTML-sink interpolations. 580 baselined
finding(s) across 147 file(s); 4297 files scanned.
```

**Commits:** `385df665` (L-406 gate), `aa59cf54` (L-407 HouseLayoutModal locks).
Scoped code only, on the batch-10 branch. Not merged, not pushed, not deployed.
No docs edited other than this file.
