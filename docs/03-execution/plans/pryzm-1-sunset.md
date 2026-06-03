# PRYZM 1 Sunset — 90-Day Migration Window

> **Stamp**: 2026-06-03 · **Status**: HISTORICAL — superseded framing, kept for the migration-tooling runbook.
> **Reconciled 2026-06-03 to ADR-055/C51**: this doc was written assuming a **GA SaaS launch had already shipped** ("GA boot path", "GA LAUNCH date S72 D7", "2026-Q3 sunset window"). That GA launch has **NOT shipped**. The current production deploy is the **ADR-055 Phase-A bridge** (apex/app split: `pryzm.so` apex marketing on Cloudflare Pages + `app.pryzm.so` editor on Fly.io EU `fra`; auth migration is ADR-056, Phase A.5). The PRYZM 1 → PRYZM 2 architecture migration (the `src/` legacy-tree retirement) described below is a **separate internal track** from the customer-facing GA launch; the `@pryzm/cli` migration tooling (§2) remains the canonical runbook for that internal track. Treat every "GA"/"2026-Q3 sunset" date here as an aspiration of the prior plan, not a shipped fact.

**Date opened**: 2026-04-29 (S72 D5)
**Sunset announcement date**: S61 close (≈ 2026-Q1)
**Sunset window length**: 90 days (3 months)
**Sunset window end (target)**: 2026-Q3
**Owner**: Founder + Architecture lead

This document is the canonical PRYZM 1 → PRYZM 2 migration runbook
referenced by phase-doc §S72 context line 401 (*"PRYZM 1 sunset
announced (90-day migration window — already counting from S61)"*)
and ADR-0054 §D.

---

## §1 What "sunset" means

PRYZM 1 (the legacy `src/` tree) entered sunset at S61 close. From
that date forward:

- **No new feature development** lands in PRYZM 1. The PRYZM 1 boot
  path remains live for existing customers via the `?pryzm1=1`
  kill-switch in `src/main.ts` (the `?pryzm2=1` route is the
  default GA boot path into `apps/editor`).
- **Critical bug fixes only** are accepted in PRYZM 1 during the
  sunset window. Severity threshold = P0 (data loss, crash on
  open, security regression).
- **All new customer onboarding** is on PRYZM 2 only from the
  GA LAUNCH date (S72 D7 Tuesday).

The 90-day window is the time existing PRYZM 1 customers have to
migrate their projects to PRYZM 2 using the migration tool (§3
below). After the window closes (2026-Q3 target), PRYZM 1 enters
end-of-life — the `?pryzm1=1` kill-switch is removed and the `src/`
tree is deleted from the GA bundle.

---

## §2 Migration tool — `@pryzm/cli`

Per phase-doc §S72 context line 401 + §7 ("PRYZM 1 → PRYZM 2 batch
migration tool — S72 ships per-project migration; batch tool in
90-day window"), the per-project migration tool is `@pryzm/cli`
which landed at S70 D8 with three new subcommands:

| Subcommand | What it does | S70 D8 status |
|---|---|---|
| `pryzm install` | Wraps `pryzm-selfhost/install.sh` with exit-code translation | ✅ landed (12/12 tests green) |
| `pryzm upgrade --to=N.M.0` | Best-effort one-minor-up plan | ✅ landed |
| `pryzm rollback --to=N.M.0` | Same-major one-minor-back guard; rejects major-version rollback | ✅ landed |
| `pryzm pack <project>` | Exports a PRYZM 1 project to portable `.pryzm` v1 envelope | landed (S55 era) |
| `pryzm unpack <envelope>` | Imports a `.pryzm` v1 envelope into PRYZM 2 | landed |

The per-project migration recipe:

```bash
# On the PRYZM 1 host:
pryzm pack my-project --output my-project.pryzm

# On the PRYZM 2 host:
pryzm unpack my-project.pryzm --into ./projects/my-project
```

The `.pryzm` v1 file format (frozen at S71b D7 per phase-doc §S71
exit criteria) is the migration envelope. Round-trip is guaranteed
by `packages/file-format/__tests__/round-trip.test.ts`.

### Batch migration tool (carry-forward)

The batch migration tool that walks all projects in a PRYZM 1
deployment and runs `pryzm pack` + `pryzm unpack` per project is
**deferred to the 90-day window** per phase-doc §7. It is a 1-2
sprint dedicated push post-GA per `docs/03-execution/plans/post-ga-roadmap.md` §1
P0 item 4.

---

## §3 What happens at sunset window end

When the 90-day window closes (2026-Q3 target):

1. The `?pryzm1=1` kill-switch in `src/main.ts` is removed (1-line edit).
2. The `src/` PRYZM 1 tree is deleted (the directory + all sub-trees).
3. The `pryzm` `(window as any)` count drops to zero **repo-wide** (currently 0 in PRYZM 2 trees only — the §3 Architectural §3 invariant tightens to its phase-doc reading).
4. The `src/visibility/VGGovernanceStore.ts` honest carry-forward (per ADR-0054 §B) is closed.
5. Any remaining PRYZM 1-only branches in CI / docs / runbooks are deleted.

This is a single mechanical post-sunset PR. Tracked as carry-forward
register row 25 in `docs/03-execution/status/post-mortems/PRYZM-2-build.md` §5.

---

## §4 Customer-facing communication

The sunset announcement at S61 covered:

- Migration tool availability (per-project at S70 D8; batch in window).
- Window length (90 days from announcement).
- End-of-life date (2026-Q3).
- Self-host availability (per `pryzm-selfhost/` + `docs.pryzm.com/selfhost/`) for customers who want to keep running PRYZM 2 in their own infra without GA SaaS dependence.
- Support channels during window: `support@pryzm.com` for migration help; `pryzm-1-sunset` issue label for migration blockers.

The migration window counter is visible to existing PRYZM 1 users
via the `Pryzm1SunsetBanner` component (relocated from `src/lifecycle/`
to `apps/editor/src/sunset/` at S70 D8 per ADR-0052 §B.7).

---

## §5 Migration support cadence

| Week of window | Support cadence | Owner |
|---|---|---|
| Weeks 1–2 (post-LAUNCH) | Daily check-ins; on-call founder + agent | Founder |
| Weeks 3–6 | 3× weekly check-ins | Architecture lead |
| Weeks 7–12 | Weekly check-ins; final-month migration push | Founder + agent |
| Week 13 (window end) | End-of-life notification 14 days prior; `src/` deletion PR opens | Architecture lead |

---

## §6 Reversal triggers

If during the window any of the following occurs, the sunset is
**paused** and re-evaluated:

1. ≥ 5 PRYZM 1 customers file blocking migration issues with the same root cause → fix lands within 7 days OR window extends by 30 days.
2. Critical PRYZM 2 stability issue causes PRYZM 1 → PRYZM 2 migration regret rate > 20% → window extends by 30 days while PRYZM 2 stability lands a fix.
3. Pen test (S68 R3D-02 carry-forward) reveals a critical PRYZM 2 vulnerability → window extends by the fix-time.

Pause is enacted by founder; re-entry is by ADR amendment to ADR-0054 §D.

---

## §7 Cross-references

- ADR-0054 §D (sprint-scoped sunset decision)
- phase-doc §S72 context line 401 + §7 (batch migration tool deferral)
- `docs/03-execution/status/post-mortems/PRYZM-2-build.md` §5 (carry-forward register row 4 + 25)
- `docs/03-execution/plans/post-ga-roadmap.md` §1 P0 item 4 (batch migration tool)
- `apps/cli/src/commands/{install,upgrade,rollback}.ts` + `apps/cli/__tests__/migration-commands.test.ts` (CLI tooling)
- `apps/editor/src/sunset/Pryzm1SunsetBanner.ts` (in-app sunset banner)

---

*Owner: Founder + Architecture lead. The 90-day countdown started at
S61. Updated 2026-04-29 at S72 D5 to consolidate the window contract
in one canonical doc per ADR-0054 §D.*
