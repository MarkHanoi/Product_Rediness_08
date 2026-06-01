# Beta triage workflow

> Spec: `phases/PHASE-2D-Q4-M22-M24-SYNC-AWARENESS-BETA.md` §S48 D6 (lines 717–722).
> Owner: PRYZM operations rotation (24h on-call across the beta window).
> Service-level expectation: every beta-bug issue has an owner + status update within **8 hours** of filing.

## 0 · Where issues land

| Source | Channel | Auto-label |
| --- | --- | --- |
| In-app "Report a bug" link | GitHub issue via `.github/ISSUE_TEMPLATE/beta-bug.yml` | `beta`, `bug` |
| In-app "Feedback" link | GitHub issue via `.github/ISSUE_TEMPLATE/beta-feedback.yml` | `beta`, `feedback` |
| Crash-reporter auto-capture (fatal) | GitHub issue via the crash-reporter webhook (S48 D9 binding) | `beta`, `bug`, `auto` |
| Direct email to `beta@pryzm.com` | Triager opens an issue using the bug-report template | `beta`, `bug`, `inbound` |

## 1 · Triage steps (≤ 8h SLA)

For every new `beta-bug` issue:

1. **Acknowledge.** Comment with your name + ETA for first investigation.
2. **Open the trace.** Click the OTel link from the issue body → opens
   the saved view `Trace by ID` in
   [docs/04-reference/observability/dashboards/honeycomb-beta.json](../observability/dashboards/honeycomb-beta.json)
   or [docs/04-reference/observability/dashboards/tempo-beta.yaml](../observability/dashboards/tempo-beta.yaml).
3. **Confirm severity.** Re-classify if the trace contradicts the
   reporter's pick. S0 (data loss / cannot save) escalates immediately
   to the on-call lead.
4. **Look for fingerprint duplicates.** The crash-reporter
   `pryzm.crash.fingerprint` field clusters identical errors —
   bulk-link the dupes to the canonical issue.
5. **Triage label.**
   * `triage:repro-needed` → ask reporter for a project file or steps.
   * `triage:owner-needed` → tag the package owner (see CODEOWNERS).
   * `triage:in-progress` → an owner has accepted.
   * `triage:wontfix-beta` → defer to post-beta with reasoning.

## 2 · Severity → response time

| Severity | First response | Resolution target |
| --- | --- | --- |
| S0 — Data loss | 30 min | Same-day patch + write-up |
| S1 — Cannot complete workflow | 4 h | ≤ 3 working days |
| S2 — Workaround exists | 1 working day | Next sprint |
| S3 — Cosmetic | 1 working day | Backlog (post-beta acceptable) |

## 3 · Cross-package routing

| Symptom | Likely owner | Trace breadcrumb |
| --- | --- | --- |
| Sync delay > 250 ms p95 | `@pryzm/sync-server` | `sync.roundtrip` span |
| Yjs replay corruption | `@pryzm/sync-client` | `sync.applyUpdate` span |
| Soft-lock UX wedge | `@pryzm/sync-client` (LockManager) | `lock.reject` span |
| AI cost overrun | `@pryzm/ai-host` + `@pryzm/ai-cost` | `ai.workflow.submit` span; `pryzm.ai.cost.usd` attr |
| Approval-queue UI stuck | `plugins/ai-floorplan` (ApprovalQueuePanel) | `pryzm-ai-approval-queue` DOM marker |
| Crash on first paint | `@pryzm/editor` + `@pryzm/crash-reporter` | `pryzm.crash.fingerprint` |
| Element not visible | `@pryzm/visibility` (waves W01–W05) | `view.compute` span |

## 4 · Closing the loop

When you close a beta issue:

1. Comment with the resolving commit / PR link.
2. Add the `closed-in-beta` label.
3. If the fix introduces a new behaviour the cohort needs to know
   about, schedule a Friday digest entry (see `docs/03-execution/plans/launch/beta-announcement.md` §6).
4. If the bug touched the M24 BETA GATE invariants (sync p95,
   crash-free rate, soft-lock churn), add a row to the next
   `apps/bench/reports/M24-beta.md` weekly snapshot.

## 5 · Escalation

* Two consecutive S0s within 24h → freeze further beta cohort
  invitations (S48 D2 invitation pipeline) until root-causes are
  understood. The launch-day ADR-0038 §4 names this rollback.
* Sync p95 above 250 ms for > 2 consecutive hours → page the on-call
  sync owner (Honeycomb alert wired to `sync-latency-p95` panel).
* Crash-free rate < 99% over a rolling 24h window → halt new feature
  flag rollouts; only fixes ship.

## 6 · Forwarding to Phase 3 (S49+)

Issues labelled `triage:wontfix-beta` are reviewed at the Phase 3
kick-off and either:

* Promoted to a backlog entry in `docs/archive/pryzm3-internal/reference/status-detail/01-PROCESS-TRACKER.md` §Phase 3, or
* Closed with rationale + a link to the related ADR.

This is the bound channel that turns beta feedback into roadmap input.
