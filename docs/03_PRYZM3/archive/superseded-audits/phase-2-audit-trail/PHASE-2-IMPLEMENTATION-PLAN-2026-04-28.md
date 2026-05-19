# PHASE 2 — AUDIT-DRIVEN IMPLEMENTATION PLAN (2026-04-28)

**Companion to:** `PHASE-2-AUDIT-2026-04-28.md`.

**Goal:** turn the Phase-2 audit's gap list into a concrete, ticketed
plan that takes Pryzm from "Phase 2 substantively built, four cap-stone
artefacts missing" to **"M24 beta-gate green, defensible to 25
external invitees"**.

**Form factor:** three sprints (S28 → S30), each ~1–2 weeks, each
ending at a hard gate. No ticket is open-ended; each has files, steps,
and an executable acceptance check.

---

## 0. Sequencing summary

| Sprint | Theme | Duration | Exit gate |
| ------ | ----- | -------- | --------- |
| **S28** | Pre-beta unblockers (the "before-any-invite" set) | 5 working days | Vector PDF renders; 24-function library complete; AI queue refuses ≥ 100 jobs; all 14 `.replit` workflows green or carrying real failures. |
| **S29** | M24 beta-gate cap-stone | 10 working days | 5-role permission matrix wired into the command-bus; SVG backend live; SPEC-04 equivalence test green; visual-diff plan-view a Playwright CI gate; context envelopes + lint rule shipping. |
| **S30** | GA credibility + Supabase cutover | 10 working days | Supabase primary; `restore-verify` back to 14-night gate; awareness-bandwidth bench enforced; default-route UX flip for the beta cohort; M24 self-test runbook executes 100% green. |

S28 unblocks the team and the Beta cohort. S29 produces the artefacts
you ship with the invitation. S30 produces the artefacts you put on
the GA marketing page.

---

## 1. Sprint S28 — Pre-beta unblockers (5 days)

### S28-T01  Restart stale validation workflows
- **Blocked by:** none.
- **Owner:** DX.
- **Workflows:** `audit-log-middleware`, `pryzm-persistence`,
  `pryzm-vi-parity`.
- **Steps:**
  1. Restart each via the workflow tool.
  2. If any still fails on real assertions (not "no such file"),
     triage into S28-T05 with a fix ticket.
- **Acceptance:** all three workflows reach a real `vitest` run.
- **Effort:** 30 min + triage.

### S28-T02  Implement vector-PDF backend (M20 unblock)
- **Blocked by:** none.
- **Owner:** drawing / sheets.
- **Files:** `packages/drawing-primitives/src/backends/pdf.ts`,
  `packages/drawing-primitives/__tests__/pdf-backend.test.ts`,
  `packages/drawing-primitives/package.json` (add `pdf-lib` dep per
  ADR-040).
- **Steps:**
  1. Replace the `throw new BackendNotImplementedError(this.id, 'S37')`
     body with a real `pdf-lib` renderer that maps the unified
     primitive surface (`Stroke`, `Fill`, `Text`, `Path`, `Image`)
     into pdf-lib calls.
  2. Implement font subsetting for the four built-in title-block
     fonts (carry the choice from ADR-040 §2).
  3. Write `pdf-backend.test.ts` covering: single-page A1, A1+A3
     mixed, 5-sheet set, schedule snapshot widget. Assert (a) file
     opens via `pdf-lib`'s reload path; (b) byte count is < 50 KB
     for the 500-row schedule case; (c) text is selectable (non-raster).
  4. Wire schedule-export PDF (`plugins/schedules/src/export/pdf.ts`)
     to the new backend if not already.
  5. Add `.replit` workflow `drawing-pdf-backend` running the test.
- **Acceptance:**
  - 5-sheet PDF set generated end-to-end in < 30 s on the CI runner.
  - PDF file opens in any viewer; text is selectable (assert via
    `pdf-lib` text extraction).
  - `drawing-pdf-backend` workflow green.
- **Effort:** 2.5 days.

### S28-T03  Close formula library 12 → 24 (M21 close-out)
- **Blocked by:** none.
- **Owner:** schedules / formula-library.
- **Files:** `packages/formula-library/src/builtins.ts`,
  `packages/formula-library/__tests__/builtins.test.ts`,
  `packages/formula-library/src/types.ts` (if a new arity needed).
- **Steps:** add the missing twelve formulas with test coverage:
  - **Math (5):** `Sqrt`, `Pow`, `Log`, `Sin`, `Cos`.
  - **Stats (3):** `Stdev` (sample stddev), `Median`, `Mode`.
  - **Logic (4):** `If(cond, then, else)`, `And`, `Or`, `Not`.
  - (Optional, post-S28: `Now`, `Today` — non-deterministic, deferred
    behind `--allow-temporal-formulas` flag.)
  - For each: name, description, arity, evaluator, test that uses
    representative inputs and asserts deterministic output.
- **Acceptance:**
  - `packages/formula-library/src/builtins.ts` enumerates **24**
    formulas (count visible via `rg -c "name: '"`).
  - All 24 have unit tests; suite green.
- **Effort:** 1.5 days.

### S28-T04  Wire AI back-pressure curve (SPEC-31)
- **Blocked by:** none.
- **Owner:** ai-host.
- **Files:** `packages/ai-host/src/AiHost.impl.ts`,
  `packages/ai-host/src/types.ts`,
  `packages/ai-host/__tests__/back-pressure.test.ts`,
  `packages/ai-host/src/tracing.ts`.
- **Steps:**
  1. Add `BackpressureConfig { softLimit: 20, hardLimit: 50,
     rejectLimit: 100 }` to `AiHostConfig`. Defaults from SPEC-31.
  2. Add a queue-depth sampler in `AiHost.impl.ts` (1 Hz tick).
     Emit OTel gauges:
     - `pryzm.ai.queue.depth` (current depth)
     - `pryzm.ai.emission.soft-pause` (boolean span when depth > soft)
     - `pryzm.ai.emission.hard-pause` (boolean span when depth > hard)
     - `pryzm.ai.emission.reject` (counter when a job is rejected)
  3. On submit:
     - depth ≥ `rejectLimit` → throw `AiBackpressureRejectError`
       with structured payload (depth, limit, retry-after-ms).
     - depth ≥ `hardLimit` → enqueue but mark `delayed: true`;
       worker doesn't pull until depth drops.
     - depth ≥ `softLimit` → enqueue normally but emit a UI hint
       span so the toast layer can show "AI is busy".
  4. Test fixture: enqueue 120 synthetic jobs against a stub bus,
     assert exactly 100 accepted, 20 rejected, soft+hard pauses
     emitted at the right boundaries.
- **Acceptance:**
  - Test green.
  - OTel gauges visible when `OTEL_EXPORTER_OTLP_ENDPOINT` set.
- **Effort:** 1 day.

### S28-T05  Triage P1-carry workflow failures
- **Blocked by:** S28-T01.
- **Owner:** DX.
- **Steps:** for each workflow that failed *after* restart with a
  real assertion (not a path drift), file an S28-Pn ticket and fix
  in-sprint if < 1 day, else move to S29 backlog.
- **Acceptance:** all 14 `.replit` workflows green.
- **Effort:** variable, capped at 1 day.

### S28 exit gate
- Vector PDF renders end-to-end; M20 unblocks.
- Formula library at 24 of 24.
- AI queue refuses jobs at 100; emits OTel back-pressure gauges.
- All 14 workflows green.
- **You can now safely send the first 5 invitations** (a Tier-0
  cohort, smaller than the planned 25, to validate the loop).

---

## 2. Sprint S29 — M24 beta-gate cap-stone (10 days)

### S29-T06  5-role permission matrix (SPEC-08)
- **Blocked by:** none.
- **Owner:** platform / sync.
- **Files:** new `packages/role-matrix/src/{index, matrix, predicates}.ts`,
  `packages/role-matrix/__tests__/matrix.test.ts`,
  `packages/command-bus/src/middleware/auth.ts`,
  `apps/sync-server/src/locks/handlers.ts` (lock-acquire authz).
- **Steps:**
  1. Create `packages/role-matrix` exporting:
     ```ts
     type Role = 'Owner' | 'Admin' | 'Editor' | 'Limited' | 'Reviewer';
     canExecute(user: User, command: AnyCommand, target: ElementRef): boolean;
     canAcquireLock(user: User, target: ElementRef): boolean;
     ```
  2. Implement the matrix verbatim from SPEC-08 §4 (5 × command-class
     × element-category truth table — small, finite).
  3. Add `auth.ts` middleware to the command-bus that runs *before*
     intent → handler. Reject with `PermissionError` (HTTP 403
     equivalent inside the bus).
  4. Wire the same predicate into the lock-acquire handler in the
     sync-server.
  5. Test: `Limited Editor` cannot delete a `structural` element;
     `Reviewer` cannot acquire any lock; `Admin` can transfer
     ownership; `Owner` is the only one who can change project
     metadata.
- **Acceptance:**
  - Matrix package + middleware shipped.
  - Test suite asserts the full 5 × N table.
  - Sync-server returns 403 on unauthorized lock acquire.
- **Effort:** 2 days.

### S29-T07  SVG backend + SPEC-04 equivalence test
- **Blocked by:** S28-T02 (PDF backend).
- **Owner:** drawing.
- **Files:** `packages/drawing-primitives/src/backends/svg.ts`,
  `packages/drawing-primitives/__tests__/equivalence.test.ts`,
  `tests/visual-diff/sheets/` (reference fixtures).
- **Steps:**
  1. Replace the SVG backend stub with a real serializer mapping
     the primitive surface to SVG `<path>`/`<text>`/`<image>`.
  2. Build the equivalence test: render the same primitive scene to
     all three backends (Canvas2D bitmap, SVG → rasterized via
     `resvg`, PDF → rasterized via `pdf-lib` → `pdf-to-png`).
  3. Compute pairwise pixel L1 norm; assert ≤ 0.5 % per SPEC-04 §6.
  4. Add 5 reference scenes: empty title block, dimensioned wall,
     5-element schedule snapshot, hatch fill, complex polyline.
  5. Wire `drawing-equivalence` `.replit` workflow.
- **Acceptance:**
  - Equivalence test green on all 5 fixtures.
  - Workflow visible in `.replit`.
- **Effort:** 2 days (after PDF backend).

### S29-T08  Promote visual-diff plan-view to a Playwright CI gate
- **Blocked by:** S29-T06 (role-matrix is unrelated; this can run in
  parallel — listed for sequencing only).
- **Owner:** plan-view + DX.
- **Files:** `apps/bench/src/benches/visual-diff-plan.bench.ts`
  (replace skeleton), `tests/visual-diff/plan-view/` (reference PNGs),
  `playwright.config.ts` (root or per-app), `.replit` workflow
  `visual-diff-plan-view`.
- **Steps:**
  1. Install `@playwright/test` as a devDep.
  2. Replace the `PRYZM_VISUAL_DIFF_PLAYWRIGHT=1` opt-in with an
     unconditional Playwright run that boots the editor at
     `?pryzm2=1`, navigates to each fixture, captures, diffs.
  3. Honour the per-sprint tolerance schedule already encoded
     (S31<10, S32<5, S33<2, S35<1) — current sprint pin is S35
     (≤ 1 px).
  4. Capture 8 reference fixtures: small house, 50-element plan,
     500-element plan, hatched walls, dimensioned plan, multi-level,
     section-cut overlay, view-template change.
  5. Wire as a `.replit` workflow that fails on any diff > tolerance.
- **Acceptance:**
  - Workflow green on a clean main.
  - Deliberately add a 2-px-shift bug → workflow goes red.
- **Effort:** 1.5 days.

### S29-T09  Context envelopes + lint rule (SPEC-13)
- **Blocked by:** none.
- **Owner:** schemas + kernel.
- **Files:** new `packages/schemas/src/contexts/{wall, slab, door,
  window, roof, ...}.ts` (one file per producer = 18 envelopes),
  `tools/eslint-plugin-pryzm/src/no-impure-context.js`,
  `eslint.config.js`, plus producer signature updates in
  `packages/geometry-kernel/src/producers/`.
- **Steps:**
  1. Define `Context<Family>` types: pure JSON, no THREE / DOM /
     functions / Maps. Use Zod to validate.
  2. Update each producer signature from
     `(input: Foo) => GeometryOut` to
     `(ctx: Context<Foo>) => GeometryOut`.
  3. Author `pryzm/no-impure-context` ESLint rule that walks
     producer file ASTs and rejects any parameter type referencing
     `THREE.*`, `Window`, `Document`, `Map`, `Set`, function types.
  4. Set rule to `error` in `packages/geometry-kernel/`; `warn`
     elsewhere with one-time carve-out list.
- **Acceptance:**
  - All 18 producers carry typed envelopes.
  - Lint passes; deliberately add a `THREE.Vector3` parameter →
    lint fails.
- **Effort:** 1.5 days.

### S29-T10  Awareness-bandwidth bench
- **Blocked by:** none.
- **Owner:** sync.
- **Files:** new `apps/bench/src/benches/awareness-bandwidth.bench.ts`,
  `.replit` workflow `awareness-bandwidth`.
- **Steps:**
  1. Spin up a local sync-server + 5 simulated peers; drive each
     peer through a 60-second cursor + tool-state churn loop.
  2. Measure bytes/s sent per peer.
  3. Assert p95 < 5 KB/s per peer per ADR / SPEC-03.
- **Acceptance:** workflow green; deliberately remove the awareness
  throttle → workflow goes red.
- **Effort:** 1 day.

### S29-T11  Lifecycle subsystem dissolution check (ADR-030)
- **Blocked by:** none.
- **Owner:** platform.
- **Steps:**
  1. `rg -l "src/lifecycle"` to find any residual legacy imports.
  2. If `src/lifecycle/` exists, port any cross-family invariants
     into `plugins/lifecycle/` and delete the legacy directory.
  3. Add a CI grep gate that fails if `src/lifecycle/` re-appears.
- **Acceptance:** `src/lifecycle/` absent; gate green.
- **Effort:** 0.5 day if nothing residual; up to 2 days if invariants
  must move.

### S29 exit gate
- 5-role matrix enforced at L2 (commands) and L3 (locks).
- All three drawing backends live; SPEC-04 equivalence green.
- Plan-view visual-diff a real CI gate.
- Context envelopes + lint rule shipping.
- Awareness within budget.
- **M24 beta-gate is now defensible** apart from the storage cutover.

---

## 3. Sprint S30 — GA credibility + Supabase cutover (10 days)

### S30-T12  Supabase cutover (M22 close-out)
- **Blocked by:** environment provisioning (Replit Secrets +
  Supabase project).
- **Owner:** platform / sync.
- **Files:** `apps/sync-server/src/{eventLog, session, locks}/*`
  (swap PG driver for Supabase URL when `SUPABASE_PRIMARY=true`),
  `apps/sync-server/migrations/`, `scripts/cutover-replit-pg-to-supabase.mjs`,
  `M24-PREVIEW-SELF-TEST-CHECKLIST.md` §0.1 (env vars).
- **Steps:**
  1. Provision Supabase project + R2 + Upstash Redis + Stripe
     test-mode keys per SPEC-15 §6 (the M24 checklist enumerates
     the full list).
  2. Snapshot Replit-PG → Supabase via `scripts/cutover-…`.
  3. Flip `SUPABASE_PRIMARY=true` in production secrets.
  4. Validate: every E2E test passes against Supabase backend.
  5. After 7 nights green, delete Replit-PG production data
     (the "Point of No Return" per the spec).
- **Acceptance:**
  - All sync-server integration tests green against Supabase.
  - `.local/restore-verify-streak.json` reaches 7+.
  - Cutover audit log entry exists.
- **Effort:** 3–4 days, much of it elapsed-time.

### S30-T13  Restore `restore-verify` to 14-night target
- **Blocked by:** S30-T12.
- **Owner:** platform.
- **Files:** `apps/bench/src/benches/restore-verify.bench.ts`
  (replace skeleton), `apps/bench/reports/M24-beta.md` (revert
  `≥ 7 consecutive nights` → `≥ 14 consecutive nights`),
  `.replit` workflow `restore-verify-nightly`.
- **Steps:**
  1. Implement the real pipeline: Supabase backup → ephemeral PG
     restore → checksum match against canonical project fixture.
  2. Schedule via Replit cron (or external cron hitting the bench
     endpoint) at 02:00 UTC nightly.
  3. Maintain `.local/restore-verify-streak.json`; gate predicate
     `restoreVerifyGateGreen` returns `true` when streak ≥ 14.
- **Acceptance:**
  - Bench runs nightly; 14 consecutive green nights logged before
    GA.
  - Gate predicate consumed by the M24 beta-gate report.
- **Effort:** 2 days code + 14 days elapsed.

### S30-T14  Default-route flip workaround for the beta cohort (UX, not code)
- **Blocked by:** none.
- **Owner:** editor / DevRel.
- **Files:** `server.js` (or the relevant Express route), invitation
  email template under `docs/00_NEW_ARCHITECTURE/beta/`.
- **Steps:**
  1. In `server.js`, on `GET /`: if request carries cookie `beta=1`
     OR query string `pryzm2=1`, 302 to `/?pryzm2=1`. Otherwise
     keep PRYZM-1 marketing landing.
  2. Invitation email sets the cookie on click via a one-pixel
     `/beta/welcome?set=1` endpoint that 302s to `/?pryzm2=1`.
  3. Document in the invitation email body: *"Click this link first;
     bookmark the URL you land on."*
- **Acceptance:**
  - Cookie path tested with two browsers.
  - Invitation email proof reviewed.
- **Effort:** half a day.

### S30-T15  M24 self-test runbook dry-run
- **Blocked by:** S30-T12, S30-T13.
- **Owner:** founder + agent (per the runbook itself).
- **Files:** `docs/00_NEW_ARCHITECTURE/M24-PREVIEW-SELF-TEST-CHECKLIST.md`,
  `apps/bench/reports/M24-beta.md`.
- **Steps:**
  1. Execute every step in §0 → §N of the checklist on the
     deployed environment.
  2. For any red checkbox, file an S30-fixup ticket and resolve
     in-sprint.
  3. Update `apps/bench/reports/M24-beta.md` with the dry-run
     timestamp + green-checkbox count.
- **Acceptance:** 100 % of checkboxes green; report committed.
- **Effort:** half a day execution + variable fixup.

### S30-T16  Awareness compaction beyond throttle (SPEC-03 GA prep)
- **Blocked by:** S29-T10 (bandwidth bench).
- **Owner:** sync.
- **Files:** `packages/sync-client/src/awareness.ts`,
  `apps/bench/src/benches/awareness-bandwidth.bench.ts` (extend).
- **Steps:**
  1. Implement awareness-state compaction (drop stale presence,
     coalesce rapid cursor updates) at the client.
  2. Bench at 50 concurrent peers; assert p95 < 5 KB/s per peer
     holds at the higher cohort size.
- **Acceptance:** 50-peer bench green.
- **Effort:** 1.5 days.

### S30 exit gate (this is **M24 BETA-GATE GREEN**)
- Supabase primary; backups verified nightly.
- Restore-verify back to 14-night target.
- Default-route UX flip live for the beta cohort.
- Self-test checklist 100 % green.
- Awareness budget holds at 50-peer scale.

---

## 4. Out-of-band tickets (file now, schedule into next phase)

| Ticket | Belongs in | One-liner |
| ------ | ---------- | --------- |
| **OOB-F** | Phase 3A | Schedule DSL parser (ADR-027 Part D) — when 24 builtins prove insufficient. |
| **OOB-G** | Phase 3B | Force-directed label placement (SPEC-04 §8.2). |
| **OOB-H** | Phase 4 | CDE module activation (SPEC-32 / ADR-031). |
| **OOB-I** | Phase 3C | Default-route flip from PRYZM-1 → PRYZM-2 at S61 (already on the master plan; carry forward as a tracking ticket so the S30 cookie workaround is retired cleanly). |
| **OOB-J** | Phase 3B | 4D/5D extensions (SPEC-41) for Gantt sheets and BoQ formulas. |

---

## 5. Risks and mitigations

| Risk | Likelihood | Impact | Mitigation |
| ---- | ---------- | ------ | ---------- |
| `pdf-lib` text rendering doesn't match Canvas2D pixel-for-pixel | High | Medium | SPEC-04 tolerance is ≤ 0.5 % — well above font hinting noise. Calibrate fixtures once and freeze; document the calibration in `tests/visual-diff/sheets/CALIBRATION.md`. |
| Supabase region latency degrades sync round-trip target (< 250 ms p95) | Medium | High | Pick the region nearest the founder + first 5 invitees; document; revisit pre-GA. |
| Playwright flake in `visual-diff-plan-view` | High (always) | Low | Pin browser version; run 3× and accept on best-of; record HARs of any flake to debug. |
| Role-matrix middleware blocks legitimate flows nobody anticipated | Medium | High | Ship behind a `ROLE_MATRIX_ENFORCE=warn` mode for the first 48 h; flip to `error` after invitee feedback. |
| Restore-verify streak resets near GA | Medium | High (delays GA) | Start the 14-night clock immediately after Supabase cutover, not after S30 ends, so it overlaps with the rest of the work. |
| AI back-pressure rejection looks scary to first invitees | Low | Low | Frame as "AI is busy — try again in a minute" toast; do not surface "rejected at 100 jobs". |

---

## 6. Capacity assumption and team shape

This plan assumes **3 engineers** working in parallel across S28–S30.

- **Drawing engineer:** owns S28-T02 (PDF), S29-T07 (SVG +
  equivalence). Critical path through both sprints.
- **Sync / platform engineer:** owns S28-T04 (back-pressure), S29-T06
  (role matrix), S30-T12 (Supabase cutover), S30-T13 (restore-verify),
  S30-T16 (awareness compaction).
- **Plan-view / DX engineer:** owns S28-T01/T05 (workflow restarts),
  S28-T03 (formulas), S29-T08 (visual-diff Playwright), S29-T09
  (context envelopes), S29-T11 (lifecycle dissolution check),
  S30-T14 (default-route cookie).

**2-engineer fallback:** drop S29-T11 (lifecycle dissolution check —
already low-risk per audit) and S30-T16 (compaction — needed only for
> 5 concurrent peers; the closed beta is ≤ 5). This still produces
M24 beta-gate green.

**1-engineer fallback:** ship S28 only. M20 unblocks, M21 closes,
SPEC-31 lands. M24 beta gate slips by one sprint but the substance is
intact.

---

## 7. Definition of done for "M24 beta gate"

A single line you can hold the team to:

> A founder + 25 invitees can each open the Replit-deployed app via
> the invitation link, land on `?pryzm2=1`, create a project, draw
> walls + place a door + run an AI critique, save and reload, then
> co-edit with another invitee — without any of: a thrown
> `BackendNotImplementedError`, an unauthorised command going through,
> an AI request loop saturating the queue, or a refresh losing data.

S28 unblocks the cohort; S29 makes the experience defensible; S30
makes it credible to enterprise reviewers. After S30, **`suggest_deploy`
to production is the right next call.**

---

## 8. Cross-reference back to Phase-1 implementation plan

Two Phase-1 carry-overs are explicitly *not* repeated here because
they are already on the Phase-1 backlog:

- Phase-1 S25-T03 (`three` exact pin + `pnpm overrides`) — must land
  before S29-T07 to keep the SVG/PDF/Canvas2D equivalence numbers
  reproducible between developer machines.
- Phase-1 S26-T05 (`canonical.json` per family) — needed to make
  Phase-2 schedule-snapshot widget output stable across rebuilds.

Schedule both Phase-1 tickets *into* S28 if they have not already
landed; they are dependencies, not optional polish.

---

*End of plan. — 2026-04-28*
