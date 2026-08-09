# NEXT SESSION — orientation brief

**Written:** 2026-08-09 · **For:** a session starting cold, with no memory of this work.
**How to use:** paste §0 into the new session. Everything after §0 is what that session should
read for itself.

---

## §0 — THE PROMPT (paste this)

> You are joining PRYZM cold. Before doing anything, orient yourself:
>
> 1. Read `CLAUDE.md` (repo root) — architecture, the 8 layers, the 8 CI-enforced principles,
>    and the governance order.
> 2. Read `docs/03-execution/plans/ONBOARDING-BRIEF.md` — this file. It says what
>    PRYZM is, where we are, what is broken, and the constraints that are not negotiable.
> 3. Read `docs/02-decisions/contracts/README.md` — the C01–C65 contract index. Do not read all
>    65; read the index, then the contract for whatever you are about to touch.
> 4. Skim `docs/04-reference/ISSUE-LOG.md` from the BOTTOM — it is the living defect tracker,
>    761 rows, newest last. The last ~20 rows are the current state of play.
>
> Then tell me, in your own words: what PRYZM does, what state it is in, and what you think the
> three most important things to fix are. Do not start work until we agree on that.
>
> Constraints that apply from your first command: never `git stash` (the stash stack is global
> across worktrees), never blanket-restore a shared tree, and always capture a command's own
> exit code unpiped. Verify before you assert, measure before you conclude, and say plainly
> what you could not prove.

---

## §1 — WHAT PRYZM IS

A **browser-native BIM platform**: a 3D building-design tool that runs in a tab, with real-time
collaboration, AI-assisted generation, and IFC/Revit/DXF/Rhino interoperability. Think Revit's
job, done in a browser, with a generative layer on top.

Three things make it unusual, and all three are where the hard problems live:

1. **It generates buildings, not just draws them.** Give it a location and a plot boundary and
   it produces a real apartment, house, residential building or office tower — walls, rooms,
   doors, windows, furniture, lighting — via deterministic engines (`D-TGL` layout, `D-FLE`
   furniture, `D-CE` ceilings) rather than by an LLM inventing geometry.
2. **It knows the law of the site.** PRYZM resolves the actual planning regime for a real parcel
   (zoning, setbacks, buildable depth, height limits) and computes a **buildable envelope**
   from cited ordinance. Spain is deepest (Barcelona end-to-end); 15 countries are mapped.
   ⚠ **The product's core promise is a CITED DETERMINATION, never an estimate.** When the data
   is not there, PRYZM **refuses and says why**. A plausible number where the law is unknown is
   the worst possible output — it is a legal claim about someone's land.
3. **It renders real context.** Real terrain, real neighbouring buildings at true heights, real
   sun and shadow, on a Cesium globe.

**Shape of the repo:** pnpm monorepo, Node ≥20. A single Express BFF (`server.js`, ~240 KB) plus
a layered TypeScript SPA across `packages/*` (L0–L4), `apps/*` (L5), `plugins/*` (L7). The layer
rule — a layer may import DOWN, never UP — is CI-enforced. `src/` is a shrinking legacy zone.

**Business state:** pre-launch private beta. Access to `app.pryzm.so` is gated to four founder
email addresses; anyone else is blocked and the attempt is notified. Stripe billing, plan limits
and the marketplace API exist.

---

## §2 — WHERE WE ARE (2026-08-09, verified — not asserted)

- **Production is live and healthy**: `app.pryzm.so` / `pryzm.fly.dev`, Fly.io region `fra`,
  blue-green, 512 MB, health `1/1`.
- **Baselines**: `test:server` **554 passing** · root `tsc --noEmit --skipLibCheck` **exit 0** ·
  `check:isolation` clean · `ga-gate:all` **exit 0 — 9/25 gates pass, 16 declared debt** in
  `tools/ga-gate/gate-debt.json` (shrink-only ratchet; you may NEVER add to it).
- **Landed 2026-08-09**: raked (angled) walls as a wall PROPERTY · roof now belongs to the level
  immediately above the one it was drawn on · the live-light budget (it existed and was wired to
  nothing) · a 15%-smaller UI via one density lever · an ISO Phase-1 readiness audit
  (`docs/compliance/**`) · same-origin asset proxies restored after an `app.pryzm.so` CORS break.
- **Docs**: 110 stale audits deleted; the tracker renamed `V1-LAUNCH-READINESS-AUDIT.md` →
  **`docs/04-reference/ISSUE-LOG.md`**. Jurisdiction evidence and the ISO baseline were KEPT.

### ⚠ What is actually broken — read this before proposing work

1. **CI has been RED for over a day**, so every release now ships via `bypass_ci_gate`. Four
   jobs fail: Lint (397 errors), root `vitest` (an `xssSinkScan` ratchet trip —
   `GISAreaLayout.ts` went 16 → 20 sinks), `test:pryzm1` (advisory, declared red at L-544), and
   **GA-gate, which passes locally at exit 0 and fails in CI**.
   **A gate you must bypass to ship has stopped being a gate.** Chase the ga-gate local/CI
   divergence first — *a gate that disagrees with itself tells you nothing.*
2. **The Fly boot-smoke CI job is `skipped` and has never guarded a deploy.** That is how L-782
   reached production today: a backtick inside a SQL comment terminated a template literal, the
   server refused to parse, and the machine crash-looped to its restart cap.
   `§GATE-SERVER-JS-PARSES` now closes the *syntax* class — **"does the server actually boot"
   is still unguarded.**
3. **Raked walls have no UI control yet** (in progress on `agent/c17-rake-ui`), and are refused
   on curved, layered, and opening-hosting walls. Hosted openings on a raked wall is ~3–4 weeks:
   the vertical axis is not modelled at all — sill is a bare world-Y translate at four
   independent sites.
4. **The plan-view roof path cannot resolve "the level above"** — `plugins/roof` has no level
   store and no elevations, so roofs drawn in a plan view still land on the view's own level.
5. **The lighting cost ladder is DERIVED, not MEASURED** — no GPU wall-time measurement exists
   in this repo. Validating it needs an in-browser FPS capture against C10 NFT-4 (16.6 ms p95).
6. **ISO Phase 1 named five fail-opens** worth knowing early: DB TLS runs
   `rejectUnauthorized:false`; the plugin CRL fails OPEN and caches that for an hour; there is
   zero dependency scanning; there is no alerting; and `/trust` sells a 4-hour RTO **while
   backups do not exist**.

---

## §3 — HOW THIS CODEBASE FAILS (the patterns, not the incidents)

Every one of these has cost a real outage or a wrong founder decision. When you audit or debug,
these are your hypotheses.

1. **Authored-but-unwired — the defining failure mode.** Capability that exists, compiles, is
   documented, and is reachable by nothing. Real examples: a 23-gate CI suite invoked by
   nothing · 424 OpenTelemetry spans with no provider · an IFC4X3 exporter behind a slot that
   throws · `requirePlan()` with zero call sites · `setQualityTier()` with zero production call
   sites · the entire ISO-19650 CDE (server state machine, vocabulary, role matrix and three
   panels all built; **no panel instantiated, no client ever POSTs a transition**).
   ⭐ **Audit REACHABILITY, not existence.**
2. **§CONTEXT-DATA-HONESTY — a failure and an empty result must never be the same value.**
   L-716: a false `AND` made "not ready" and "can never be ready" identical. L-752: an isolation
   audit compared stores only, so a leak living in the scene reported "✓ loaded clean". L-779: a
   500 rendered as an empty project, which autosave then persisted over good server data.
3. **A probe can be wrong three ways — wrong RUNTIME, wrong PROPERTY, wrong SYSTEM.** `curl`
   sends no `Origin` header, so a bare 200 proves nothing about CORS. Confirm a failing check
   against an INDEPENDENT source before acting on it: a verification tool that can fail a
   healthy system is more dangerous than no tool, because it converts success into a
   destructive action.
4. **A check that cannot fail is decoration.** Every new gate needs a POSITIVE CONTROL that
   proves it goes red when the defect is reintroduced. L-774: a 25-gate suite reported 25/25
   failures because the runner itself was broken.
5. **N divergent copies of one policy.** In a single week: three disagreeing plan-limit tables
   (silent data loss), two typology id lists (a residential request silently produced an
   apartment), two copies of one style resolver (authored colours discarded).
6. **Documentation asserting what the code does not do.** ISO Phase 1 found seven such docs.

---

## §4 — CONSTRAINTS (non-negotiable)

- ⛔ **NEVER `git stash`** — the stash stack is GLOBAL across worktrees and holds other agents' work.
- ⛔ **NEVER blanket-restore** (`git checkout -- .`, `git clean -fd`, `git reset --hard`) in a
  shared tree. Restore named paths only. Multiple agents verify in the MAIN tree; serialise them.
- ⚠ **Capture a command's OWN exit code, unpiped.** A pipeline reports its LAST command's
  status — piping `tsc` through `head`/`tail`/`grep` reads 0 on a FAILING typecheck. This has
  shipped a broken build here twice.
- ⚠ **An agent worktree has no `node_modules`** — `@pryzm/*` symlinks to the main tree, so a
  cross-package change is UNVERIFIABLE there and reports PHANTOM errors. Author in the worktree,
  verify centrally.
- ⚠ **Scope every cleanup to what was authorised.** A link-repair script here walked the whole
  repo and rewrote 3,599 files across other worktrees before being reverted. Widening the blast
  radius of a cleanup is how a cleanup becomes an incident.
- **Governance order:** STR-03 → STR-04 → contracts C01–C65 → ADRs → SPECs. **When code
  disagrees with a contract, the CODE is wrong** — fix it, or raise a superseding ADR. Never
  author a new `*-AUDIT.md`; edit the canonical `C0N-*.md` in place.
- **Every reported bug gets a row in `docs/04-reference/ISSUE-LOG.md`.** That is the standing
  instruction and it is why the file survived the purge.
- **Deploy** only when asked, following `docs/02-decisions/DEPLOY-CONTRACT-MANUAL-FLY.md` §2→§6
  in order. CI is the default path; dispatch via REST + PAT. Capture the rollback tag FIRST.
- **Localhost dev is unusable** (it starves the Node event loop) — real verification is on
  production, which is why deploy discipline matters here more than usual.

---

## §5 — FOUNDER DECISIONS CURRENTLY BLOCKING WORK

None is an engineering question. Surface them rather than working around them.

1. The `ESTIMATED_DEFAULT_PACK` ruling (what PRYZM may show where ordinance is unresolved).
2. Who may act as **reviewer-of-record** for ISO purposes.
3. Confirmation that PRYZM's external posture is **cited determination, not certification**.
4. Approval to **measure EA-5's coverage cost** before it ships.
