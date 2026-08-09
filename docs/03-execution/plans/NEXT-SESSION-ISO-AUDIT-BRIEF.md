# NEXT SESSION — ISO production readiness + deep code audit

**Written:** 2026-08-09 · **For:** the session that starts after this machine restarts.
**How to use:** paste §0 into a fresh Claude Code session. Everything below §0 is the detail
that session will need; it can read this file rather than have it pasted.

---

## §0 — THE PROMPT (paste this)

> Read `docs/03-execution/plans/NEXT-SESSION-ISO-AUDIT-BRIEF.md` first — it is the brief for
> this session and carries the constraints, the current state, and the audit-purge decision
> that is still mine to make.
>
> Two objectives, in order:
>
> **1. Purge the stale audit corpus.** 146 audit-named documents live under `docs/`. I want a
> clean slate so a fresh audit is not anchored to old, possibly-wrong conclusions. **Do NOT
> blanket-delete** — §2 of the brief classifies them into four kinds and only two are safe to
> remove. Come back to me with the delete list and the keep list before deleting anything, and
> tell me what breaks (the V1 audit alone has 57 inbound references, including contracts).
>
> **2. Run a deep, adversarial audit of the CODE against ISO production readiness.** Not a
> re-read of the existing ISO artefacts — an independent pass over the actual source. Use the
> workflow/multi-agent orchestration; I am explicitly opting in. Target the five standards in
> §3, and treat §4's failure modes as the things you are hunting.
>
> Verify before you assert, measure before you conclude, and tell me plainly what you could not
> prove.

---

## §1 — WHERE THINGS STAND (2026-08-09, verified)

- **Production:** live at `app.pryzm.so` / `pryzm.fly.dev`, SHA `f06b04b1`, health `1/1`.
- **`main` is clean** and pushed. Worktrees pruned 41 → 18.
- **Landed today:** raked walls (`§WALL-RAKE`, property not element, no UI yet per C65 §3.9) ·
  roof → level immediately above (`§ROOF-UPPER-LEVEL`) · lighting live-light budget wired
  (`§FIX-LIGHT-TIER-UNWIRED`) · 15% UI density (`§UI-DENSITY-SCALE`) · ISO Phase-1 audit
  (5 artefacts in `docs/compliance/`) · same-origin asset proxies re-pointed after the
  `app.pryzm.so` CORS break.
- **Test baselines:** `test:server` **554** · root `tsc --noEmit --skipLibCheck` **exit 0** ·
  `check:isolation` clean · `ga-gate:all` **exit 0, 9/25 pass, 16 declared debt**.

### ⚠ Open, and load-bearing for this work

1. **CI has been RED for ~23 h** on four jobs — Lint (397 errors), root `vitest`
   (`xssSinkScan` ratchet: `GISAreaLayout.ts` 16 → 20 sinks), `test:pryzm1` (advisory, L-544),
   and **GA-gate, which passes locally at exit 0 and fails in CI**. Every release now requires
   `bypass_ci_gate`. **A gate you must bypass to ship has stopped being a gate.** The
   local/CI ga-gate divergence is the first thing to chase — a gate that disagrees with itself
   tells you nothing.
2. **The Fly boot-smoke job is `skipped`** and has never guarded a deploy. This is how L-782
   (a backtick in a SQL comment) crash-looped production today. `§GATE-SERVER-JS-PARSES` now
   closes the *syntax* class; **"does the server actually boot" is still unguarded.**
3. **The plan-view roof path** cannot resolve "level above" — `plugins/roof` has no level store.
4. **Lighting ladder is DERIVED, not MEASURED** — no GPU wall-time measurement exists in-repo.
5. **`device.destroy()` caller never identified** — WebGPU loss cause unestablished.

---

## §2 — THE AUDIT PURGE: classify before deleting

146 audit-named docs under `docs/`. They are **not one thing**, and the founder's goal (a fresh
audit unanchored by stale conclusions) is served by removing two of these four kinds only.

| Kind | Count | Recommendation |
|---|---|---|
| **A. Archived / superseded** (`docs/archive/**`) | 72 | ✅ **DELETE.** Phase-1/2/3 trails from April–May 2026, already marked superseded. Zero current value; pure anchoring risk. |
| **B. Point-in-time feature audits** (`docs/03-execution/analysis/**`, `docs/04-reference/audit/**`) | ~38 | ✅ **DELETE**, with one pass first: several record *root causes* that are still true (e.g. house-gen, corridor-spine, element-semantic). Extract any still-live finding into the issue log or an ADR before removing. |
| **C. Jurisdiction evidence** (`docs/04-reference/jurisdictions/**/CAPABILITY-AUDIT-*`, `FORENSIC-BLOCKER-AUDIT-*`) | 28 | ⛔ **KEEP.** These are **measured sourcing evidence**, not opinions — they back the coverage and ROI claims per city, and one of them is the record that 9 of 14 "blockers" were refusals about the wrong product. Deleting them destroys provenance we cannot cheaply re-derive. |
| **D. Live governance** | 8 | ⛔ **KEEP.** `V1-LAUNCH-READINESS-AUDIT.md` (761 issue rows, L-001…L-785, **57 inbound references including contracts C12/C55 and six ADRs**), `docs/compliance/**` (today's ISO baseline), `docs/04-reference/security/*-audit-2026-q4.md`, `C23-PROVENANCE-AND-AI-AUDIT.md` (a **contract**, not an audit). |

### ⚠ Things to say out loud before deleting

- **Git preserves everything.** Deletion is recoverable via history, so this is far less
  dangerous than it looks — but the *inbound links* break immediately and silently.
- **`V1-LAUNCH-READINESS-AUDIT.md` is the living defect tracker, not an audit report.** The
  standing instruction is to append every reported bug to it. If the founder wants it gone,
  something must replace it first, or the next regression has nowhere to land.
- **`C23-PROVENANCE-AND-AI-AUDIT.md` is a CONTRACT** that merely has "AUDIT" in its name. A
  filename-pattern delete would take it out. Match on location and role, never on the string.
- CLAUDE.md already forbids creating new `*-AUDIT.md` derivative docs — so the purge is
  consistent with governance, provided the canonical contracts/ADRs absorb what is still true.

---

## §3 — THE DEEP AUDIT: what to actually do

**Independent pass over the SOURCE.** Do not summarise `docs/compliance/**` — that is Phase 1,
it was static-trace only, and it says so. This pass exists to test it.

Standards in scope, and what each means *for the code*:

- **ISO 9001** — change control, traceability, records. Does a change leave evidence?
- **ISO 27001** — the fail-opens. Phase 1 named: **DB TLS `rejectUnauthorized:false`**, the
  **plugin CRL failing open and caching it an hour**, **zero dependency scanning**, **no
  alerting**, audit trail neither append-only nor tamper-evident.
- **ISO 42001** — AI governance. Phase 1's headline: the **best-governed AI subsystem is
  unreachable**, while `/api/ai/compliance/advise` returns regulation-citing advice raw —
  unvalidated, unrecorded, unlabelled. **Nothing is redacted before prompt egress**; the
  mandated `PiiRedactor` has one grep hit, in the contract line describing it.
- **ISO 19650** — CDE. Server state machine, vocabulary, role matrix and three panels all
  exist; **no panel is instantiated and no client ever POSTs a transition.**
- **ISO 191xx** — geospatial. The strongest area: 19107 ring validation (detect-never-repair,
  `buffer(0)` forbidden), 19111 refuses on unknown CRS. 19115 is DRAFT and deliberately unwired.

**Verify Phase 1 rather than trusting it.** Its own closing caveat: every WIRED/UNREACHABLE
verdict came from static tracing, not an executed session. **Reachability is the single highest-
leverage axis** — this codebase's defining failure mode is capability that is authored,
committed, documented, and reachable by nothing.

---

## §4 — THE FAILURE MODES YOU ARE HUNTING

These are this repository's recurring defects. Each has cost a real outage or a wrong founder
decision. Treat them as the audit's actual hypotheses.

1. **Authored-but-unwired.** Audit REACHABILITY, not existence. Precedents: a 23-gate CI suite
   invoked by nothing · 424 OTel spans with no provider · an IFC4X3 exporter behind a throwing
   slot · `requirePlan()` with zero call sites · `setQualityTier()` with zero production call
   sites · the entire 19650 CDE.
2. **§CONTEXT-DATA-HONESTY — a failure and an empty result must never be the same value.**
   L-716 (a false AND made "not ready" and "can never be ready" identical) · L-752 (an isolation
   audit that compared stores only, so a scene-resident leak reported "loaded clean") · L-779
   (a 500 rendered as an empty project, which autosave then persisted).
3. **A probe can be wrong three ways** — wrong RUNTIME, wrong PROPERTY, wrong SYSTEM. `curl`
   sends no `Origin`, so a bare 200 proves nothing about CORS. Demand an independent source
   before acting on a failing check — a verification tool that can fail a healthy system is
   more dangerous than none, because it converts success into a destructive action.
4. **A check that cannot fail is decoration.** Every new gate needs a POSITIVE CONTROL proving
   it goes red when the defect is reintroduced. L-774: a 25-gate suite reported 25/25 failures
   because the runner itself was broken.
5. **N divergent copies of one policy.** In one week: three disagreeing plan-limit tables
   (silent data loss) · two typology id lists (a residential request silently produced an
   apartment) · two copies of one style resolver (authored colours discarded).
6. **Documentation that asserts what code does not do.** Phase 1 found seven documents in this
   class, including `/trust` selling a 4-hour RTO **while backups do not exist**.

---

## §5 — STANDING CONSTRAINTS (non-negotiable)

- ⛔ **NEVER `git stash`** — the stash stack is GLOBAL across worktrees and holds other agents' work.
- ⛔ **NEVER blanket-restore** (`git checkout -- .`, `git clean -fd`, `git reset --hard`) when
  more than one agent is live. Restore named paths only.
- ⚠ **Capture `tsc`'s OWN exit code, unpiped.** A pipeline reports its LAST command's status —
  piping through `head`/`tail`/`grep` reads 0 on a failing typecheck. This has shipped a broken
  build here twice, most recently while diagnosing L-782.
- ⚠ **An agent worktree has no `node_modules`** — `@pryzm/*` symlinks to the main tree, so a
  cross-package change is UNVERIFIABLE there and reports phantom errors. Author in the worktree,
  verify centrally, and **serialise** main-tree verification between agents.
- **Baselines that must not regress:** `test:server` 554 · root `tsc` exit 0 ·
  `check:isolation` clean · `ga-gate:all` exit 0 with **no additions** to `gate-debt.json`.
- **Governance order:** STR-03 → STR-04 → contracts C01–C65 → ADRs → SPECs. **When code
  disagrees with a contract, the code is wrong** — fix it or raise a superseding ADR. Never
  author a new `*-AUDIT.md`; edit the canonical `C0N-*.md` in place.
- **Deploy:** `docs/02-decisions/DEPLOY-CONTRACT-MANUAL-FLY.md`, walked §2 → §6 in order. CI is
  the default path; dispatch via REST + PAT. Capture the rollback tag BEFORE deploying.
- **Do not deploy** unless the founder asks.

---

## §6 — THE FOUR FOUNDER DECISIONS ISO PHASE 1 IS BLOCKED ON

None is engineering. Surface these early rather than working around them.

1. The `ESTIMATED_DEFAULT_PACK` ruling.
2. Who may act as **reviewer-of-record**.
3. Confirmation that PRYZM's external posture is **cited determination, not certification**.
4. Approval to **measure EA-5's coverage cost** before it ships.
