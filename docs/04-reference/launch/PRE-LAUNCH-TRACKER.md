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
| L-388 | Root `vitest` gate RED — 3 door/dimension specs fail at module load (barrel-at-load, 0 tests) | P1 | 0 | IN PROGRESS | — | — |
| L-247 | Unit-test estate not a CI gate (1,495 + 121 workspaces never run; 34 RED on main) | P1 | 0 | NOT STARTED | — | — |
| L-390 | Dead governance breadcrumbs — CLAUDE.md/contracts cite moved VISION/ARCHITECTURE docs | P2 | 0 | IN PROGRESS | — | — |
| L-53 | Concurrent wall `baseLine` move = silent LWW (collab data loss, no conflict, P8 violation) | P0 | 1 | NOT STARTED | — | — |
| L-85 | Kitchen/wardrobe/lighting elements vanish after project close→reopen (element loss) | P0 | 1 | NOT STARTED | — | — |
| L-334 | Save/reload data integrity — no whole-snapshot validation, no quarantine, no safe checksum (prior checksum reverted, L-360) | P0 | 1 | NOT STARTED | — | — |
| L-394 | Snapshot migration v0→v5 untested; forward-version snapshot loads with silent field loss | P1 | 1 | NOT STARTED | — | — |
| L-391 | Real-time CRDT has NO network backend → prod collab is socket.io LWW for move/edit/delete | P0 | 2 | NOT STARTED | — | — |
| L-392 | OTel provider is a no-op; crash reporter Noop; no save-integrity monitoring | P1 | 3 | IN PROGRESS | — | — |
| L-396 | Backup RESTORE never drilled; PITR unwired; free-plan single-device (0 server versions) | P1 | 4 | NOT STARTED | — | — |
| L-376a | ~30 local-only projects pile up in IndexedDB, never flushed, no eviction cap | P2 | 4 | NOT STARTED | — | — |
| L-387 | 93 dependency advisories (7 crit/28 high) — runtime-reachable jsPDF/Multer/ws/form-data/protobufjs | P1 | 5 | IN PROGRESS | — | — |
| L-395 | `/embed` echoes projectId+token with NO server-side token validation; scope unmapped | P1 | 5 | NOT STARTED | — | — |
| L-366 | Auto-WebGL heavy-scene fallback doesn't fire for real ~1,300-elem/6-level building → WebGPU device loss | P0 | 6 | NOT STARTED | — | — |
| L-389 | Real in-browser 60fps + tool-latency-with-renderer UNVERIFIED (headless proxies only); no scale SLA | P1 | 6 | NOT STARTED | — | — |
| L-393 | No IFC/DXF/Rhino round-trip fidelity test; adversarial-input parser behaviour unverified | P1 | 6 | NOT STARTED | — | — |

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

## Roll-up

- **Launch-blocking L-items tracked:** 16 (P0: 5 · P1: 9 · P2: 2).
- **Launch-blocking non-L tasks tracked:** 5.
- **In progress (batch 1):** L-388, L-390, L-392, L-387. **All others:** NOT STARTED.
- **Total effort (from the plan):** ≈ 26 eng-weeks (≈ 21.5 on the Phase-2 collab-downscope path).
