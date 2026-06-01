# Launch dry-run checklist — S48 D8

> Spec: `phases/PHASE-2D-Q4-M22-M24-SYNC-AWARENESS-BETA.md` §S48 D8 (line 723).
> Run this checklist **the day before** the announced beta launch (S48 D9).
> Owner: launch lead + on-call rotation.
> Outcome: GO / NO-GO decision posted to the launch ticket; if NO-GO, slip
> to the next dry-run window and document the blocker in
> `apps/bench/reports/M24-beta.md` §"Launch dry-run history".

---

## §0 — Pre-flight (T-24h)

- [ ] Latest `main` is green on CI (`npm test`, `npm run typecheck`, `npm run build`).
- [ ] `node scripts/check-ai-host-lazy.mjs` exits 0.
- [ ] `node scripts/check-ai-host-bundle.mjs` exits 0 against a fresh `npm run build` (PRYZM_BUNDLE_REPORT_REQUIRED=1).
- [ ] `npx vitest run apps/bench/src/benches/m24-gate.bench.ts` reports overall = `PARTIAL-RATIFIED` (acceptable for beta) or `GREEN` (post-cutover ideal).
- [ ] `apps/bench/reports/M24-beta.md` has a row for tonight's date.

## §1 — Production environment

- [ ] `SUPABASE_URL`, `SUPABASE_ANON_KEY` provisioned in the prod environment (S43 cutover dependency — confirm explicitly, do NOT assume).
- [ ] `SMTP_URL` + `EMAIL_DEFAULT_FROM` provisioned; `getEmailTransport({env: process.env})` resolves an SMTP transport (NOT the in-memory default).
- [ ] `SENTRY_DSN` (or self-hosted equivalent) provisioned; `getCrashReporter({env: process.env})` returns the OTel-linked reporter (NOT the noop) and outbound test report appears in the backend within 5 minutes.
- [ ] OTel collector endpoint reachable from production; smoke trace appears in Honeycomb / Tempo.
- [ ] Dashboards from `docs/observability/dashboards/honeycomb-beta.json` + `docs/observability/dashboards/tempo-beta.yaml` provisioned in the workspace.

## §2 — Beta wait-list surface

- [ ] `public/beta.html` reachable at `https://pryzm.com/beta`.
- [ ] `POST /api/beta/signup` route mounted (S48 D9 binding — confirm the route is wired before the announcement goes live).
- [ ] Submitting a test signup persists to `beta_signups` (Supabase) AND triggers a confirmation email landing in the test inbox.
- [ ] Submitting a duplicate email returns the existing record (dedupe path).
- [ ] Form rejects malformed payloads with the structured-errors JSON contract.

## §3 — Editor cold-start budget

- [ ] First-paint bundle size measured against the K3-A budget (spec line 611).
- [ ] No `AiHost.impl` chunk in the entry closure (`scripts/check-ai-host-bundle.mjs` PASS).
- [ ] `AiApprovalQueuePanel` mounts on the sidebar slot; empty state visible on a fresh project.

## §4 — Multi-user smoke

- [ ] Two browser sessions on different geographies (US + EU at minimum) join the same project.
- [ ] Cursor + presence visible on both within 1 second.
- [ ] Soft-lock acquired by user A blocks user B's edit; release re-grants in ≤ 1 second.
- [ ] Disconnect + reconnect of user B replays the missed updates without conflict.

## §5 — AI approval loop

- [ ] AI workflow submission lands in the approval queue with a preview + a cost estimate.
- [ ] Approve commits via the command bus; the resulting geometry is sync-broadcast.
- [ ] Reject removes the row; no side effects on the model.
- [ ] Per-project budget enforcement returns the expected error when over-budget (per ADR-028 §4).

## §6 — Crash + observability

- [ ] Synthesise a fatal client error (`throw` in a no-op plugin); confirm:
  - [ ] Captured by `installGlobalHandlers()`.
  - [ ] `CrashReport.traceId` is populated (OTel-linked).
  - [ ] Appears in Honeycomb `crash-free-session-rate` panel within 1 minute.
  - [ ] Auto-issue created in GitHub against the `beta-bug.yml` template (S48 D9 webhook binding).
- [ ] Trigger a sync round-trip; confirm the `sync.roundtrip` span shows up with `duration_ms` in the dashboard.

## §7 — Beta cohort dispatch

- [ ] First 25 invitations drafted (8×C1 + 10×C2 + 5×C3 + 2×academic per spec lines 703–706).
- [ ] Invitation email template renders correctly in Gmail + Outlook.
- [ ] In-app "Help → Copy trace link" affordance copies the right URL format.
- [ ] `docs/process/beta-triage.md` URL points to the live published version.

## §8 — Marketing surfaces

- [ ] Demo video uploaded (or fallback screenshot strip in place per `docs/marketing/beta-demo-script.md`).
- [ ] `docs/marketing/beta-announcement.md` rendered to the blog CMS; preview link reviewed.
- [ ] LinkedIn post scheduled.
- [ ] Wait-list email blast scheduled for T+1 hour after blog goes live.

## §9 — Rollback levers (must be one-button each)

- [ ] Beta wait-list page returns "paused" state if `/api/beta/signup` is disabled.
- [ ] AI host can be globally disabled via env flag (`PRYZM_AI_DISABLED=1`) — verify this short-circuits the approval queue.
- [ ] Sync server can be put in read-only mode (`PRYZM_SYNC_READ_ONLY=1`) — verify peers receive a clear UX banner.
- [ ] Beta cohort invitations can be revoked individually (per-row `status='rejected'` in `beta_signups`).

---

## Decision

GO / NO-GO posted to the launch ticket at: ________________

Signed: launch lead ________________ on-call ________________ date ________________

If NO-GO: blocker recorded at `apps/bench/reports/M24-beta.md` §"Launch dry-run history".
