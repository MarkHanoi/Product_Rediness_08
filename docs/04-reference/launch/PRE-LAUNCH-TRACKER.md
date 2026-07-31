# PRE-LAUNCH TRACKER — live status of launch-blocking items

> **Companion to `PRE-LAUNCH-READINESS-PLAN.md`.** One row per launch-blocking item from that
> plan. This is the *live* status board for the launch-critical cut only — it does **not** replace
> `V1-LAUNCH-READINESS-AUDIT.md` (the full issue register and the authority on per-item detail).
> When they disagree on a status, the audit register is canonical for the *fix* and this tracker is
> canonical for the *launch decision*.

## Legend

- **Severity** — `P0` = data-loss / launch-blocking correctness; `P1` = must-fix before public
  launch; `P2` = should-fix / disclose-if-deferred.
- **Status:**
  - `NOT STARTED` — no work landed.
  - `IN PROGRESS` — actively being worked this cycle.
  - `FIX LANDED` — a commit implementing the fix has merged, but the exit criterion is not yet
    independently verified.
  - `VERIFIED` — the plan's exit criterion is met and independently confirmed (test/drill/probe).
- **Fix commit / Verified by** — filled in as work lands. Empty = not yet.

## How this tracker is maintained

- The **code-fixer agent** updates a row's `Status`, `Fix commit`, and `Verified by` as commits
  land — moving `NOT STARTED → IN PROGRESS → FIX LANDED → VERIFIED`. `FIX LANDED` requires a real
  commit hash; `VERIFIED` requires the exit criterion (a passing test, an executed drill, or an
  independent probe) — never mark `VERIFIED` on assertion alone.
- The **orchestrator owns this file** (structure, phase/severity assignments, adding/removing
  rows). Fixers change status cells, not the plan.
- Per the multi-agent shared-tree rule, fixers commit **scoped code** and leave doc/tracker
  updates to the orchestrator to avoid frozen-lockfile / doc-collision churn.
- **Initial statuses are honest:** only the batch-1 items in flight this cycle (L-388, L-390,
  L-392, L-387) are `IN PROGRESS`; everything else is `NOT STARTED`. No optimistic statuses.

## Launch-blocking L-items

Sorted by phase, then severity (P0 → P1 → P2).

| L-item | Title | Severity | Phase | Status | Fix commit | Verified by |
|---|---|---|---|---|---|---|
| L-388 | Root `vitest` gate RED — 3 door/dimension specs fail at module load (barrel-at-load, 0 tests) | P1 | 0 | VERIFIED | `adb9f9c1` | Root `npx vitest run` gate GREEN (batch-1) |
| L-247 | Unit-test estate not a CI gate (1,495 + 121 workspaces never run; 34 RED on main) | P1 | 0 | VERIFIED | `c5ac656d` | 3 orphaned suites (beta-signup, email-transport, ai-worker) re-wired + passing (batch-1) |
| L-390 | Dead governance breadcrumbs — CLAUDE.md/contracts cite moved VISION/ARCHITECTURE docs | P2 | 0 | VERIFIED | `01abd9b4` | Dead breadcrumbs repointed to current paths (batch-1) |
| L-53 | Concurrent wall `baseLine` move = silent LWW (collab data loss, no conflict, P8 violation) | P0 | 1 | NOT STARTED | — | — |
| L-85 | Kitchen/wardrobe/lighting elements vanish after project close→reopen (element loss) | P0 | 1 | NOT STARTED | — | — |
| L-334 | Save/reload data integrity — no whole-snapshot validation, no quarantine, no safe checksum (prior checksum reverted, L-360) | P0 | 1 | NOT STARTED | — | — |
| L-394 | Snapshot migration v0→v5 untested; forward-version snapshot loads with silent field loss | P1 | 1 | NOT STARTED | — | — |
| L-391 | Real-time CRDT has NO network backend → prod collab is socket.io LWW for move/edit/delete | P0 | 2 | NOT STARTED | — | — |
| L-392 | OTel provider is a no-op; crash reporter Noop; no save-integrity monitoring | P1 | 3 | VERIFIED | `ea6ad658` + `157058bd` | Real tracer provider registered (batch-1); migrated to OTel sdk-trace-base 2.x + server `initTracing()` wired & smoke-verified (ON/OFF); `@opentelemetry/core` moderate CVE (GHSA-8988-4f7v-96qf) cleared; crash-reporter 20/20 + persistence-client 184/184 green |
| L-396 | Backup RESTORE never drilled; PITR unwired; free-plan single-device (0 server versions) | P1 | 4 | NOT STARTED | — | — |
| L-376a | ~30 local-only projects pile up in IndexedDB, never flushed, no eviction cap | P2 | 4 | NOT STARTED | — | — |
| L-387 | 93 dependency advisories (7 crit/28 high) — runtime-reachable jsPDF/Multer/ws/form-data/protobufjs | P1 | 5 | VERIFIED | `2a3a81fc` | Runtime-reachable CVEs cleared (jsPDF→4.x etc.); 0 critical remain (batch-1) |
| L-395 | `/embed` echoes projectId+token with NO server-side token validation; scope unmapped | P1 | 5 | NOT STARTED | — | — |
| L-366 | Auto-WebGL heavy-scene fallback doesn't fire for real ~1,300-elem/6-level building → WebGPU device loss | P0 | 6 | NOT STARTED | — | — |
| L-389 | Real in-browser 60fps + tool-latency-with-renderer UNVERIFIED (headless proxies only); no scale SLA | P1 | 6 | NOT STARTED | — | — |
| L-393 | No IFC/DXF/Rhino round-trip fidelity test; adversarial-input parser behaviour unverified | P1 | 6 | IN PROGRESS (DXF adversarial slice) | `03430515` | DXF malformed-input hardened (non-finite vertices stripped at parse boundary) + `dxf-parser.adversarial.test.ts` 7/7 (batch-5) — closes the DXF half of L-393b; IFC/Rhino round-trip fidelity (L-393a) + IFC/Rhino adversarial still OPEN |

## Launch-blocking tasks without an L-number

Substantive evidence findings not yet carrying an L-item (evidence §"Uncaptured findings" + §A5).
Tracked here so nothing is dropped; assign L-numbers via the audit register, not here.

| ID | Title | Severity | Phase | Status | Fix commit | Verified by |
|---|---|---|---|---|---|---|
| SEC-PAT | Revoke/rotate the session PAT used this cycle (repo itself is clean per §A5) | P0 (hygiene) | 0 | NOT STARTED | — | — |
| PERSIST-SNAP-VALIDATE | Server validates only the `furniture` array — extend to full snapshot schema on write | P0 | 1 | NOT STARTED | — | — |
| SEC-EVENTLOG | `/api/event-log` unauthenticated mutating write — auth or prove tenant-safe | P2 | 5 | NOT STARTED | — | — |
| SEC-XSS | Focused XSS pass over interpolating sinks (781 total; marketplace UGC highest risk) | P2 | 5 | NOT STARTED | — | — |
| PERF-DEVICE-MATRIX | Define + test supported browser/device matrix (desktop-only today; mobile/tablet untested) | P2 | 6 | NOT STARTED | — | — |

## Phase 7 — Infrastructure & go-live tasks

Infra/ops tasks, not L-items — sourced from `PRYZM-PATH-TO-PRODUCTION.md` (the verified infra
investigation; candidate L-650/L-652/L-653/L-654/L-659). IDs are `INFRA-N`. Severity is by
IP/launch risk. **INFRA-1 (repo privacy) is HIGH / urgent** — the repo is public today, exposing
the whole codebase/IP in an acquisition context; it does not wait on the parallel infra lane.

| ID | Title | Severity | Phase | Status | Fix commit | Verified by |
|---|---|---|---|---|---|---|
| INFRA-1 | Repo is PUBLIC (Actions-billing workaround) → whole codebase/IP exposed; make it PRIVATE + keep deploys working (recommend: direct `flyctl deploy` scoped token for app + CF Pages private-repo integration for apex) | **HIGH / urgent** | 7 | NOT STARTED | — | — |
| INFRA-2 | Domain split-brain — `.so` (C51-canonical) vs `.app` (hard-coded in shipping code) vs stray `.io` (`.env.example`); FOUNDER decision + sweep the losers, amend C51 | HIGH | 7 | NOT STARTED | — | — |
| INFRA-3 | `pryzm.so` go-live — repoint CF Pages apex off Astro (the LANDMINE) before deletion + wire `app.`/`api.` DNS+TLS to Fly | HIGH | 7 | NOT STARTED | — | — |
| INFRA-4 | No staging environment (all testing on prod) — add `pryzm-staging` Fly app + isolated DB + promote-on-green flow | HIGH | 7 | NOT STARTED | — | — |
| INFRA-5 | Deploy is a manual undocumented command with sprawled secrets — commit one-command runbook + scoped Fly token + revoke/rotate flow | MEDIUM | 7 | NOT STARTED | — | — |

## Roll-up

- **Launch-blocking L-items tracked:** 16 (P0: 5 · P1: 9 · P2: 2).
- **Launch-blocking non-L tasks tracked:** 5.
- **Phase 7 infra/go-live tasks tracked:** 5 (INFRA-1..5 — 1 HIGH/urgent · 3 HIGH · 1 MEDIUM).
- **VERIFIED (batch 1 + 2):** L-388, L-247, L-390, L-392, L-387 (Phase 0/3/5 launch-gate items). **All others (incl. all INFRA):** NOT STARTED.
- **Total effort (from the plan):** ≈ 31 eng-weeks (≈ 26.5 on the Phase-2 collab-downscope path),
  of which Phase 7 (infra & go-live) is 5.0 — running largely parallel to Phases 3–6, except
  INFRA-1 (repo privacy) which is urgent/near-term.
