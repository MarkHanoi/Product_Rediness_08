# 08 — Discipline + Definition of Done

> **Anchored to**: `../01-VISION.md §8` (the 5 binding rules in their original short form). **This document expands them into operational mechanics** — PR templates, CI rules, cadence enforcement.
> **Why this doc exists**: the discipline rules are merge-blockers. They need teeth. This doc is the teeth: the lint rules, the templates, the bots, the calendar reminders that make the rules enforceable rather than aspirational.
> **⚠ TRACKER RULE**: Editing this file → update `../00-PROCESS-TRACKER.md` same commit (§3 wave ledger row, §4 next-actions, §2 booleans as applicable).

---

## §1 — The 6 binding rules (operational form)

The 5 rules from `../01-VISION.md §8` plus rule 6 added by this plan (`pnpm ga-gate` as the merge gate).

### Rule 1 — Edit, don't fork

**Statement**: when a discrepancy is discovered, edit the canonical document. Do not write `*-AUDIT-2026-MM-DD.md`, `NEW-PLAN-2026-MM-DD.md`, `<topic>-VERSION-2.md`, or any equivalent.

**Mechanic — CI lint**:

`packages/lint-config/src/rules/no-new-doc-files.ts`:

```ts
/**
 * Blocks any new top-level .md file in docs/03_PRYZM3/ outside the canonical 4 + README + the 04-PLAN-FORWARD/ folder.
 *
 * Allowed locations for new docs:
 *   - docs/03_PRYZM3/reference/{adrs,specs}/   (numbered ADRs and SPECs)
 *   - docs/03_PRYZM3/archive/                  (move-only, never create)
 *   - docs/03_PRYZM3/04-PLAN-FORWARD/          (this plan's expansion, but only by architecture lead)
 *
 * Forbidden:
 *   - docs/03_PRYZM3/*.md outside the canonical 5 (README + 01..04)
 *   - docs/03_PRYZM3/<new-folder>/             (no new top-level folders)
 *   - docs/03_PRYZM3/04-PLAN-FORWARD/<new-file>.md  (new files require architecture-lead review)
 */
```

Wired into `pnpm ga-gate` as `check-no-new-docs`. CI fails if a PR adds a top-level `.md` outside the allowlist.

**Mechanic — PR template checkbox**:

```markdown
## Doc-rule confirmation
- [ ] I am editing one of the 4 canonical docs OR a numbered ADR/SPEC OR an existing 04-PLAN-FORWARD/ file.
- [ ] If I am creating a new file in 04-PLAN-FORWARD/, I have architecture-lead approval cited in the PR description.
- [ ] If I am creating a new ADR or SPEC, it is numbered (`reference/adrs/ADR-NNN-<topic>.md` or `reference/specs/SPEC-NN-<TOPIC>.md`).
- [ ] I am NOT creating a new top-level doc (e.g. `*-AUDIT-2026-MM-DD.md`, `NEW-PLAN-*.md`).
```

**Why it matters**: `archive/superseded-audits/` has 49 files because this rule was not enforced for 6 months. The cleanup cost (this entire 2026-04-30 consolidation) was 2 days of architecture-lead time. The rule pays for itself in the first month.

---

### Rule 2 — Runtime-only "done"

**Statement**: a sub-phase is "done" when the runtime behaviour matches the spec. Documentation-only changes do not advance the sub-phase counter. Annotation sweeps do not count as binding.

**Mechanic — PR template**:

```markdown
## Done-criterion confirmation
- [ ] This PR changes runtime behaviour (cite the affected file(s) and the new behaviour).
- [ ] The change is covered by at least one Vitest test that asserts the new behaviour.
- [ ] If this PR is doc-only (e.g. updating `../03-CURRENT-STATE.md §10`), I am NOT claiming sub-phase progress.
```

**Mechanic — CI guard**:

`packages/lint-config/src/rules/no-vacuous-binding-test.ts`:

```ts
/**
 * Blocks Vitest test files that contain `expect(x).toHaveBeenCalled()` without
 * a `.toHaveBeenCalledWith(...)` companion assertion.
 *
 * Vacuous tests (a test that passes any time the function is called, regardless
 * of arguments) gamed Phase B's 24/40 "annotation sweep" claim. This rule
 * blocks the same pattern from re-emerging.
 */
```

**Why it matters**: Phase B `1/40` is the rule's existence-proof. If the 24 paper bindings had been required to produce real Vitest assertions, the shortcut would not have happened.

---

### Rule 3 — Weekly metric refresh

**Statement**: the 13 verifiers in `../03-CURRENT-STATE.md §1` are re-run every sprint close. Wrong-direction drift on a tripwired metric is an incident.

**Mechanic — calendar**: every Friday 16:00 UTC, the architecture lead re-runs the verifiers (or a cron job posts the values).

**Mechanic — CI ratchet**: the 3 tripwires from `02-WAVE-1-TRIPWIRES.md` (LOC, cast, rAF) are configured to **automatically lower their baseline** when a PR brings the metric down. They never let it rise without a merge-block.

**Mechanic — incident log**: if a tripwire baseline rises (which shouldn't happen, but might if the ratchet has a bug or someone forces past it), the rise is logged in `13-RISK-REGISTER.md §2` (incident register) within 24 hours.

**Mechanic — merge gate during weekend**: between Friday 17:00 UTC and Monday 09:00 UTC, no PR merges to main unless the §10 weekly delta paragraph for the closed sprint was written. Enforced by:

`packages/lint-config/src/rules/require-weekly-delta.ts`:

```ts
/**
 * If the current time is in the 'sprint-closed-weekend' window (Fri 17:00 UTC → Mon 09:00 UTC)
 * AND the most recent §10 entry in docs/03_PRYZM3/03-CURRENT-STATE.md is older than the most
 * recent sprint close date, block the merge.
 *
 * Override: PR description containing "[skip-weekly-delta]" with architecture-lead approval.
 */
```

**Why it matters**: the §10 cadence had slipped 3 weeks before the 2026-04-30 consolidation. Without enforcement, it slips again.

---

### Rule 4 — Phase F gate

**Statement**: Phase F (plugin SDK + headless + marketplace) cannot start until 6 of 9 convergence booleans (`../02-ARCHITECTURE.md §8`) reach ✅ or on-track.

**Mechanic — CI guard**:

`packages/lint-config/src/rules/no-phase-f-prs-pre-gate.ts`:

```ts
/**
 * Blocks any PR that touches:
 *   - packages/plugin-sdk/    (other than skeleton/types)
 *   - packages/headless/      (other than skeleton/types)
 *   - apps/marketplace/       (anything)
 * unless the convergence gate is reached.
 *
 * The gate is reached when:
 *   pnpm pryzm-3-day-1-dry-run | grep -c '✓\|⚠ on-track' >= 6
 *
 * Override: PR description containing "[phase-f-foundation]" with founder + architecture-lead
 * approval. This override is intended only for the S84-WIRE D-1 kickoff PRs.
 */
```

**Mechanic — branch protection**: the `main` branch's GitHub branch protection rule requires the `convergence-gate` status check. The check is:

```bash
COUNT=$(pnpm pryzm-3-day-1-dry-run 2>/dev/null | grep -c '✓\|⚠ on-track')
if [ "$COUNT" -lt 6 ]; then
  echo "Convergence gate FAILED: $COUNT/9 booleans (need 6+ for Phase F)"
  echo "PRs touching plugin-sdk/, headless/, or marketplace/ are blocked."
  exit 1
fi
```

**Why it matters**: starting Phase F early on a broken foundation produces a worse outcome than waiting 12 weeks. Phase F is a 195-sub-phase program. Building it on top of `EngineBootstrap` (still 2,066 LOC) and 2,070 casts is the highest-impact failure mode the project can suffer (R6 of `13-RISK-REGISTER.md`).

---

### Rule 5 — Spans on every public function (P8)

**Statement**: every PR that adds a new public function adds at least one OpenTelemetry span. No span = no merge.

**Mechanic — CI guard**:

`tools/ga-gate/check-spans.ts`:

```ts
/**
 * Reads the PR diff. For each NEW exported function in packages/* or src/*,
 * verifies that the function body contains at least one `tracer.startSpan(...)`
 * or equivalent OpenTelemetry instrumentation.
 *
 * Span name convention:
 *   - 'pryzm.<package>.<scope>'  for runtime work (e.g. 'pryzm.bootstrap.scene')
 *   - 'pryzm.command.<verb>'      for command handlers (e.g. 'pryzm.command.create-wall')
 *   - 'pryzm.api.<endpoint>'      for headless REST/WS endpoints
 */
```

**Mechanic — PR template**:

```markdown
## Spans (P8) confirmation
- [ ] This PR does not add any new exported functions, OR
- [ ] Every new exported function contains an OpenTelemetry span (or equivalent log) named per convention.
```

**Why it matters**: D2 (real-time multi-user) requires observability to debug CRDT conflicts at customer sites. Spans are the wire. Skipping spans is technical debt that is invisible until production debugging.

---

### Rule 6 — `pnpm ga-gate` is the merge gate

**Statement**: `pnpm ga-gate` is the single source of truth for "is this commit shippable?". Workflow-green is necessary but not sufficient. The gate runs the 3 tripwires + 8 cross-cutting CI checks + 50+ catalog verifiers.

**Mechanic — branch protection**: GitHub branch protection rule requires `pnpm ga-gate` to pass before merge. No exceptions.

**Mechanic — composition**:

`tools/ga-gate/index.ts`:

```ts
const checks = [
  // Tripwires (Wave 1)
  { name: 'loc-tripwire',     cmd: 'tsx tools/ga-gate/check-engine-bootstrap-loc.ts' },
  { name: 'cast-tripwire',    cmd: 'tsx tools/ga-gate/check-cast-count.ts' },
  { name: 'raf-tripwire',     cmd: 'tsx tools/ga-gate/check-raf-count.ts' },

  // Doc rules (Rule 1)
  { name: 'no-new-docs',      cmd: 'tsx tools/ga-gate/check-no-new-docs.ts' },

  // Spans (Rule 5)
  { name: 'spans-on-pr',      cmd: 'tsx tools/ga-gate/check-spans.ts' },

  // Cross-cutting CI gates (../02-ARCHITECTURE.md §4)
  { name: 'p1-single-compose', cmd: 'tsx scripts/ci-check-single-compose.ts' },
  { name: 'p2-three-owner',    cmd: 'pnpm --filter @pryzm/lint-config test:p2' },
  { name: 'p3-single-raf',     cmd: 'tsx scripts/ci-check-single-raf.ts' },
  { name: 'p4-no-window-any',  cmd: 'tsx scripts/ci-check-no-window-any.ts' },
  { name: 'p5-domain-purity',  cmd: 'tsx scripts/ci-check-domain-purity.ts' },
  { name: 'p6-no-store-write', cmd: 'tsx scripts/ci-check-no-direct-store-writes.ts' },
  { name: 'p7-vis-not-ui',     cmd: 'pnpm --filter @pryzm/visibility test:contract' },
  { name: 'p8-spans-coverage', cmd: 'tsx tools/ga-gate/check-span-coverage.ts' },

  // Catalog verifiers (50+) — see 14-VERIFIERS-CATALOG.md
  { name: 'catalog',           cmd: 'tsx tools/ga-gate/run-catalog.ts' },
];

const failed = checks.filter(c => spawnSync('sh', ['-c', c.cmd], { stdio: 'inherit' }).status !== 0);
process.exit(failed.length === 0 ? 0 : 1);
```

**Why it matters**: workflow-green is per-package. ga-gate is repo-wide. The Phase 3 GA gate failed not because workflows were red but because ga-gate-equivalent invariants (no audit-on-audit pattern, no annotation-as-binding) were not enforced.

### Rule 7 — White-UI preservation (pixel-freeze on `src/ui/`)

**The rule**: the 220 files under `src/ui/` are the **non-negotiable preserve set**. Vision §6 declares the white UI frozen through Phase G; the only edits permitted to any file in this set are the **four kinds** enumerated below. Any other kind of edit is a Rule 7 violation and is blocked by `pnpm ga-gate --check ui-edit-discipline` (lint rule landed in Wave 7 F.* alongside the per-folder rAF/canvas drilldowns from `04-PLAN-FORWARD/05-UI-INVENTORY-AND-CLICK-TRAILS.md §5`).

**The four permitted edit kinds**:

1. **Import path rewrite** — change a `from '../../../engine/foo'` to `from '@pryzm/<package>'` or to a `runtime.<leg>` reference. **Zero behavior change.**
2. **`(window as any).foo` → `runtime.<leg>`** rewrite — driven by the cast-count tripwire (`02-WAVE-1-TRIPWIRES.md §1`); each rewrite drops the cast-count by one.
3. **`commandManager.execute(...)` → `runtime.bus.executeCommand(...)`** rewrite — the Wave-16 codemod surface; each rewrite drops the legacy-bus reach count by one (`15-PACKAGE-POPULATION-GAP.md §16`).
4. **File split** (Wave 8+ S103-WIRE inspector decompositions) — moving handler/section sub-trees out of `PropertyInspector.ts` (1,807 LOC), `RoomPropertySection.ts` (1,142 LOC), `ViewPropertiesPanel.ts` (1,616 LOC), and the other top-files in `02-WAVE-1-TRIPWIRES.md §13`. **The split must produce a 0-pixel visual diff against the per-chunk baseline** captured by Z.7 (`07-RETRO-FIT-AND-EXTRACTION-LEDGER.md §2`); the diff is re-asserted on every Wave 8+ PR that touches a top-files file.

**The pixel-diff verifier**:

```bash
# packages/bench-visual-diff/ (lands as Z.7 in S77-WIRE D4)
pnpm --filter @pryzm/bench-visual-diff diff --baseline pre-S72 --threshold 0
# Exits non-zero on any non-zero pixel diff for any chunk in the corpus.
```

**Why it matters**: every previous attempt to "improve the UI while wiring it" produced an irreversible regression that took ≥ 1 sprint to undo. Rule 7 makes the rewire a *behavior-preserving* refactor by construction; the four edit kinds are mechanical and codemod-friendly. Any "while we're in there" improvement is deferred to Wave 18+ (post-GA), where it can land as a deliberate behavior change with its own visual baseline update.

**Discipline note**: Rule 7 applies only to files **under `src/ui/`** as enumerated by `05-UI-INVENTORY-AND-CLICK-TRAILS.md §1` (currently 220 files). New surfaces authored under `apps/editor/src/` for Wave 4+ runtime composition are *not* under Rule 7 — they are net-new code with their own discipline (Rules 2–6).

---

## §2 — Definition of Done (per artifact type)

### A sub-phase is done when

1. The runtime behaviour matches the spec (Rule 2).
2. The change is covered by Vitest tests with non-vacuous assertions.
3. `pnpm ga-gate` is green on the PR.
4. The PR adds an entry to `../03-CURRENT-STATE.md §10` if the sub-phase advanced a tripwired metric.

### A wave is done when

1. The wave-exit verifier in `pnpm ga-gate --check wave-N-exit` returns 0.
2. The convergence boolean state in `../02-ARCHITECTURE.md §8` and `../03-CURRENT-STATE.md §8` is updated.
3. A weekly delta paragraph is written in `../03-CURRENT-STATE.md §10` for the wave-closing sprint.
4. The wave file in this folder (e.g. `02-WAVE-1-TRIPWIRES.md §9`) has its "Exit gate evidence" section filled in with the actual shell command output.

### A PR is done when

1. PR template's 5 checkboxes are all ticked.
2. `pnpm ga-gate` is green on the PR HEAD (re-run by reviewer; PR descriptions are not trusted).
3. Architecture-lead reviewer (or designated tech-lead for non-architectural PRs) has approved.
4. The PR's verifier (named in the PR description) returns the target value.

### An ADR is done when

1. The file is `reference/adrs/ADR-NNN-<topic>.md` (numbered).
2. The frontmatter has `status: proposed | accepted | rejected | superseded` and a date.
3. The file has 4 sections: Context, Decision, Consequences, Alternatives.
4. The architecture lead has approved.

### A SPEC is done when

1. The file is `reference/specs/SPEC-NN-<TOPIC>.md` (numbered).
2. The spec has at least 1 normative requirement statement (RFC 2119 keywords: MUST, SHOULD, MAY).
3. The spec is linked from at least one ADR.
4. The architecture lead has approved.

---

## §3 — The PR template (full)

`.github/pull_request_template.md`:

```markdown
## Summary
<one paragraph: what this PR changes and why>

## Anchored to
- Vision principle: P<N> (`../01-VISION.md §2`)
- Architecture clause: §<N> of `../02-ARCHITECTURE.md`
- Plan wave: `04-PLAN-FORWARD/<file>.md §<N>`

## Verifier
The PR closes when:
```bash
<the exact shell command>
```
returns the target value.

Run output on PR HEAD:
```
<paste the actual output>
```

## Rule confirmations

### Rule 1 (no new docs)
- [ ] I am editing one of the 4 canonical docs OR a numbered ADR/SPEC OR an existing 04-PLAN-FORWARD/ file.

### Rule 2 (runtime-only done)
- [ ] This PR changes runtime behaviour AND is covered by Vitest tests with non-vacuous assertions, OR
- [ ] This PR is doc-only and does NOT claim sub-phase progress.

### Rule 5 (spans on public functions)
- [ ] This PR adds no new exported functions, OR
- [ ] Every new exported function contains an OpenTelemetry span named per convention.

### Rule 6 (ga-gate)
- [ ] `pnpm ga-gate` is green on this PR HEAD.

## Boolean(s) advanced
<which of the 9 convergence booleans this PR moves the needle on, if any>

## Rollback
<what `git revert` does and what state the system returns to>
```

---

## §4 — The §10 weekly delta paragraph (template)

`../03-CURRENT-STATE.md §10` entries follow this exact form:

```markdown
### YYYY-MM-DD (S<N>-WIRE D-last close)
Wave <N> <progress noun>. <Metric A> dropped X → Y (PR <reference>).
<Metric B> moved <direction> (PR <reference>). <Boolean change> (e.g. "Boolean #4 ✅" or "no boolean change").
<Workflow status delta>. <Quarantine changes>.
PRs: <#1>, <#2>, ..., <#N>.
<Optional: incident or warning paragraph>
```

Sample (synthesized from `03-WAVE-2-3-D4-EXECUTION.md §9`):

```markdown
### 2026-06-12 (S80-WIRE D-last close)
Wave 3 closed. EngineBootstrap.ts 2,066 → 30 LOC (5 D.4 PRs landed in 4 weeks).
WorkspaceMountBridge dead (0 files). composeRuntime() is now the production composition path.
4 new packages (physics-host, input-host, scene-bootstrap-in-renderer-three,
persistence-client/bootstrap). Boolean #4 ✅. pryzm-persistence de-quarantined and green.
8/9 workflows green; vi-parity still quarantined until Wave 5 cast deletion.
PRs: D.4.1, D.4.2, D.4.3, D.4.4, D.4.5.
```

---

## §5 — The architecture-lead's daily 5-minute check

Every morning, the architecture lead runs:

```bash
pnpm ga-gate                   # baseline check
pnpm pryzm-3-day-1-dry-run      # convergence boolean state
git log --oneline --since=yesterday docs/03_PRYZM3/  # any doc edits
git log --oneline --since=yesterday packages/runtime-composer/  # composeRuntime drift
```

If any of the 4 commands shows unexpected output, the lead investigates. This is the early-warning system that prevents 3-week-stale §10 cadences from happening again.

---

## §6 — Cadence summary

| Cadence | Activity | Owner | Output |
|---|---|---|---|
| Per-PR | Run `pnpm ga-gate` + verify the verifier in PR description | author + reviewer | Green ga-gate; merged PR |
| Daily | 5-minute architecture-lead check (§5) | architecture lead | Drift detected ≤ 1 day after introduction |
| Weekly (Friday) | Refresh `../03-CURRENT-STATE.md §1` metrics + write §10 delta paragraph | architecture lead | §10 entry; updated tripwire baselines |
| Per-sprint (every 2 weeks) | Wave file's "Exit gate evidence" section filled in (if a wave is closing) | architecture lead | Wave closure evidence committed |
| Per-quarter | Convergence-boolean trend chart re-rendered; founder review | founder + architecture lead | Quarter review meeting; calendar-recovery decision (R7 of `13-RISK-REGISTER.md`) |

---

## §7 — When discipline is broken

The 6 rules are merge blockers, not "best efforts". When a rule is violated:

1. **Block the merge** (CI does this automatically for rules with `pnpm ga-gate` enforcement).
2. **If the rule was bypassed manually** (e.g. someone pushed to main outside the PR flow): immediate revert + post-mortem in `13-RISK-REGISTER.md §2` (incident register).
3. **If the rule itself is wrong** (e.g. blocks a legitimate change): the architecture lead authors an amendment to this doc; the founder reviews; the rule changes via an explicit edit, not a one-off override.

The point is: **discipline is enforced at the tooling layer**, not at the social layer. The 5 rules from `../01-VISION.md §8` were "binding" before the 2026-04-30 consolidation and the project had 178 docs anyway. The difference now is that violation is mechanically blocked.

---

## §8 — Connection to vision

Discipline is the lever that lets the small architecture team sustain the 8 principles (P1-P8) across a growing codebase. Without it:

- P1 erodes ("just one more parallel composition path for this one feature")
- P3 erodes ("just one more rAF for this animation")
- P4 erodes ("just one more `(window as any)` to unblock me")
- P8 erodes ("I'll add the span later")

The 6 binding rules in this doc are the named, enforced answer to "later". The reason `archive/superseded-2026-04-30/` exists at all is that none of the rules were enforced for 6 months. The 2026-04-30 consolidation is a one-time recovery; the rules in this doc are how the recovery is preserved.
