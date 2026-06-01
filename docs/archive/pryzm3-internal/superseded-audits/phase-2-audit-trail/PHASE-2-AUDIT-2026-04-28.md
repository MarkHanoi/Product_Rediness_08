# PHASE 2 — CODE-vs-SPEC AUDIT (2026-04-28)

**Scope.** Independent audit of Pryzm Phase 2 (M13 → M24) against the
2026-04 architecture set in `docs/00_NEW_ARCHITECTURE/`. Read sources:
the five Phase-2 phase docs (PHASE-2 master + 2A/2B/2C/2D), the 2B
Auto-Dim/View-Template supplement, the existing
`PHASE-2-DRIFT-CLOSEOUT-IMPLEMENTATION` audit, the
`M24-PREVIEW-SELF-TEST-CHECKLIST`, the 2026-04-27 robustness amendment;
ADRs 002, 016, 019, 027, 030, 031, 040; SPECs 03, 04, 08, 13, 27, 29,
30, 31, 32, 41.

This document is intentionally evidence-based — every finding cites a
file path or grep result you can reproduce. It is a companion to
`PHASE-1-AUDIT-2026-04-28.md` and uses the same rubric.

---

## 0. Headline verdict

| Dimension | Grade | One-line evidence |
| --------- | ----- | ----------------- |
| **Phase 2A — non-element completion (M13–M15)** | **A−** | `rooms`, `structural`, `lighting`, `plumbing`, `furniture`, `dimensions`, `plan-view` plugins present with handlers + tools; multi-LOD furniture committers present; the literal "PRYZM 1 → v2" migration is **explicitly stubbed to Phase 3D** (`MigrationStubError`) — per spec, not a drift. |
| **Phase 2B — plan view (M16–M18)** | **A−** | `PlanViewRenderer`, `CanvasHost`, `view-template-bridge`, `style-resolver`, `section-cut-producer`, `SectionViewCanvasHost`, auto-dim wiring tests all real. Visibility-Intent has all 11 waves shipped (vs spec 5 — early per ADR-0041). Visual-diff Playwright harness is a **gated skeleton** (`PRYZM_VISUAL_DIFF_PLAYWRIGHT=1`), not yet a CI gate. |
| **Phase 2C — sheets / schedules (M19–M21)** | **C+** | Sheets has all 10 widget types ✅; schedules has CSV / XLSX / PDF export files ✅; BUT (a) formula library ships **12 of 24** mandated formulas (drift-closeout item still open), and (b) the PDF backend in `drawing-primitives` is a `throw new BackendNotImplementedError(this.id, 'S37')` stub — so the M20 acceptance "5-sheet PDF set < 30 s, vector not raster" **cannot pass**. |
| **Phase 2D — sync / awareness / beta (M22–M24)** | **B+** | Real Yjs CRDT (`import * as Y from 'yjs'`, `Y.Doc`, `YMap`); translator round-trip test exists (`event-bridge-roundtrip.test.ts`); soft-locks (ADR-019) implemented client and server (`PgSoftLockStore`, `Sweeper`, `soft-locks.sql`, advisory locks); AI host with three real workflows (`Generate3Options`, `PlanCritique`, `VoiceCommand`); BUT Supabase cutover (M22) **deferred** → `restore-verify` bench is a skeleton, AI back-pressure curve from SPEC-31 is **not implemented**, SPEC-08 role matrix at L2/L3 is **not present** (`api-rbac` is a smaller OAuth2-scope concern only). |
| **ADR-002 (translator)** | **A−** | `packages/sync-client/src/event-bridge.ts` is the translator; `__tests__/event-bridge-roundtrip.test.ts` provides the property test. |
| **ADR-019 (soft-locks)** | **A** | `LockManager.acquire/extend/release`, `LockConflictError` (409), `LockTransportError`; server uses Postgres advisory locks via `PgSoftLockStore` with a `Sweeper` for TTL expiry. |
| **ADR-027 (24 schedule formulas)** | **D** | Library catalog enumerates 12 (`Sum`, `Average`, `Minimum`, `Maximum`, `Count`, `Distance 1-D`, `Rect area`, `Rect perimeter`, `Ratio`, `Clamp`, `Lerp`, `Round`). 12 mandated by drift-closeout still missing (Math, Stats, Logic, Date). |
| **ADR-040 (CSV/XLSX/PDF schedule export)** | **B−** | `plugins/schedules/src/export/{csv,xlsx,pdf,index}.ts` present; PDF path inevitably lands on the backend stub. CSV/XLSX likely real; needs a parity check. |
| **SPEC-08 (5-role permission matrix at L2/L3)** | **F** | `packages/api-rbac` is *only* the public-API OAuth2 scope catalogue (3 scopes: `project:read`, `project:write`, `ai:invoke`). The Owner/Admin/Editor/Limited/Reviewer matrix is not anywhere on disk. |
| **SPEC-13 (context envelopes for kernel producers)** | **D** | `packages/schemas/src/contexts/` does not exist. ESLint rule `pryzm/no-impure-context` not seen in eslint.config.js. |
| **SPEC-30 (5 Canvas2D ops + plan-view perf)** | **B** | The 5 ops exist via `PlanViewCanvasHost` + drawing primitives; `apps/bench/src/benches/visual-diff-plan.bench.ts` is a skeleton, not a Playwright run. |
| **SPEC-31 (AI back-pressure 20/50/100)** | **F** | No `soft-pause`, `hard-pause`, `reject` thresholds anywhere in `packages/ai-host/src/`. The `restore-verify` bench is also skeleton — explicitly deferred per ADR-0034. |
| **SPEC-32 (CDE module)** | **N/A — deferred** | `apps/sync-server/src/cde/index.ts` exists as a placeholder; module is Phase 4 per ADR-031. |
| **Strangler-fig honesty** | **C+** | Same gap surfaced in Phase 1 audit: default `npm run dev` serves PRYZM 1 marketing landing; `?pryzm2=1` flip is the kill-switch through end of Phase 2D — and is documented openly in `M24-PREVIEW-SELF-TEST-CHECKLIST`. The gap is documented but no CI step exercises the flag. |

**Bottom line.** Phase 2 has shipped **substantively more code** than
the docs imply — the visibility engine is fully ported (11/11 waves
vs spec 5), the soft-lock service is real on both ends of the wire,
the Yjs translator + round-trip test exist, and the AI host has three
working workflows. **But four cap-stone artefacts that decide M24
beta-gate green are missing**:

1. **Vector-PDF export backend** — the M20 acceptance criterion lands on a thrown error.
2. **24-function schedule formula library** — currently at 12 (50%).
3. **AI back-pressure curve (20/50/100)** — the safety valve for the Beta cohort is not implemented.
4. **Supabase storage cutover (M22)** — deferred; `restore-verify` bench is a skeleton.

Items 1–3 are pure code work, scoped, and can land in one focused
sprint. Item 4 is environment-bound and is the genuine M24 ship gate.

---

## 1. Phase 2 milestone audit (M13 → M24)

### M13 — Rooms, Structural, Lighting, Plumbing

| Check | Status | Evidence |
| ----- | ------ | -------- |
| `plugins/rooms`, `plugins/structural`, `plugins/lighting`, `plugins/plumbing` exist | ✅ | all four plugin folders present with handlers + tools. |
| Room area/perimeter < 0.1% error vs PRYZM 1 | ⚠ | producer present in `packages/geometry-kernel`; no parity recording surfaced in audit. |
| `tests/parity/rooms/` 20-case fixture | ⚠ | parity directory not located in this audit pass; if absent, raise as ticket. |

### M14 — Furniture (multi-LOD) + Project hub

| Check | Status |
| ----- | ------ |
| `plugins/furniture` with catalogue + LOD representations | ✅ `catalogue/`, `committer/`, `handlers/{CreateFurniture, SetFurnitureRepresentation, SetFurnitureScale}`, `intent.ts`, `tool.ts`. |
| 5-LOD sofa fixture | ✅ structurally; per-handler comments reference "all 5 LODs" and "per-LOD bounding boxes the carousel previews use as size hints". |
| Project hub (list/open/create/delete + thumbnails) | ⚠ verify in `apps/editor/src/projects` — not directly audited here. |

### M15 — Dimensions, Plan skeleton, Pure math

| Check | Status |
| ----- | ------ |
| `plugins/dimensions` | ✅ |
| Plan skeleton renders Level 1 outline | ✅ `plugins/plan-view/src/PlanViewRenderer.ts` + `CanvasHost.ts`. |
| Edge projection / poche math is pure / headless | ⚠ verify `packages/geometry-kernel/__tests__/{edge-projection,poche}.snap`; not surfaced in audit grep. |

### M16 — Plan-view foundation (Canvas2D)

| Check | Status |
| ----- | ------ |
| `plugins/plan-view/PlanViewRenderer.ts`, `CanvasHost.ts` | ✅ |
| Walls/slabs/doors render | ✅ structurally |
| **Visual diff < 5 px** | ❌ **gated** — `apps/bench/src/benches/visual-diff-plan.bench.ts` is the **skeleton** of a Playwright harness. The harness is "opt-in via `PRYZM_VISUAL_DIFF_PLAYWRIGHT=1` env var". Per-sprint tolerance schedule (S31 < 10 px, S32 < 5 px, S33 < 2 px, S35 < 1 px) is encoded in the file but not enforced. |
| Idle 0 fps (P3) | ✅ inherited from Phase 1's `pryzm/no-raf: error`. |

### M17 — Contract 44 parity + Annotations

| Check | Status |
| ----- | ------ |
| `plugins/annotations` | ✅ |
| 10 Contract 44 gaps closed (selection, drag, style resolver) | ⚠ `style-resolver.ts` present in plan-view; no `tests/contract-44/` matrix grep-confirmed. Worth a follow-up. |

### M18 — Section + multi-view sync

| Check | Status |
| ----- | ------ |
| `plugins/section-view/{SectionViewRenderer, SectionViewCanvasHost, section-cut-producer, handlers}` | ✅ all four files present. |
| Cross-view edit propagation < 16 ms | ⚠ no `multi-view-sync.bench.ts` surfaced. Verify in `apps/bench`. |

### M19 — Sheets store + viewports

| Check | Status |
| ----- | ------ |
| `plugins/sheets/src/{book/book.ts, view-renderer/composite.ts}` | ✅ |
| Viewport scale parity test | ⚠ verify `tests/parity/sheets/viewport-scale.test.ts`. |

### M20 — Sheet widgets + PDF export

| Check | Status |
| ----- | ------ |
| 10 widget types | ✅ — `text`, `image`, `line`, `bim-tag`, `north-arrow`, `scale-bar`, `legend`, `region`, `schedule-snapshot`, `revisions-table` (10 files in `plugins/sheets/src/widgets/` plus `base.ts`, `index.ts`, `registry.ts`). |
| **5-sheet PDF export < 30 s, vector not raster** | ❌ **blocked**. `packages/drawing-primitives/src/backends/pdf.ts:19` does `throw new BackendNotImplementedError(this.id, 'S37')`. Same for SVG (`'S55'`). PDF backend is the M20 ship gate — and it is unimplemented today. Schedules `pdf.ts` export will inherit this failure when actually invoked. |

### M21 — Schedules + 24-function formula DSL

| Check | Status |
| ----- | ------ |
| `plugins/schedules/src/{evaluate-schedule, formula-evaluator, sort, view, export/{csv,xlsx,pdf}}` | ✅ all real. |
| Auto-update on element edit | ⚠ verify; structurally plausible via store subscription. |
| **24-function library** | ❌ **drift open**. Only **12** functions in `packages/formula-library/src/builtins.ts` (`Sum`, `Average`, `Minimum`, `Maximum`, `Count`, `Distance 1-D`, `Rectangle area`, `Rectangle perimeter`, `Ratio`, `Clamp`, `Linear interpolation`, `Round to N digits`). Missing: log/sqrt/pow/sin/cos (Math), stdev/median/mode (Stats), if/and/or/not (Logic), now/today (Date) — exactly the closeout-doc list. |
| CSV round-trip test | ⚠ `__tests__` present in plugin; not deeply read here. |

### M22 — Yjs sync + Supabase cutover + RBAC

| Check | Status | Evidence |
| ----- | ------ | -------- |
| Yjs CRDT real (not stubbed) | ✅ | `packages/sync-client/src/SyncClient.ts:22  import * as Y from 'yjs'`; `:59  this.doc = opts.doc ?? new Y.Doc();`. |
| Translator round-trip test (ADR-002) | ✅ | `packages/sync-client/__tests__/event-bridge-roundtrip.test.ts`. |
| Causal chaos harness | ✅ | `packages/sync-client/__tests__/_chaos/PeerHarness.ts` + `__tests__/chaos.test.ts`. |
| **Supabase cutover** | ❌ **deferred** | `apps/bench/src/benches/restore-verify.bench.ts` opens with: *"The full restore-verify pipeline requires Supabase + a backup-restore API + an ephemeral PG instance to restore into. None of those are provisioned yet (`SUPABASE_URL` is not set; Supabase cutover is the S43 D9 milestone)."* |
| **5-role authz at L2 + L3 (SPEC-08)** | ❌ | `packages/api-rbac/src/index.ts` ships only the public-API **OAuth2 scope** catalogue (3 scopes). Owner/Admin/Editor/Limited/Reviewer matrix at the command-bus + lock layer is missing. |

### M23 — Awareness + soft locks + VI Waves 1–5

| Check | Status |
| ----- | ------ |
| `plugins/multiplayer` | ✅ |
| Soft locks (ADR-019) — client | ✅ `packages/sync-client/src/locks.ts` defines `LockConflictError` (409), `LockTransportError`, lease-id / extend-margin-ms semantics. |
| Soft locks — server | ✅ `apps/sync-server/src/locks/{PgSoftLockStore, InMemorySoftLockStore, Sweeper, handlers, soft-locks.sql, types}`. Postgres advisory locks. |
| Awareness < 5 KB/s per peer | ⚠ no awareness-bandwidth bench discovered. |
| **VI Waves 1–5** spec; **all 11 shipped** | ✅ early — `packages/visibility/src/waves/{w01-level-scope … w11-ghost-layer}` all present. Drift-closeout: ADR-0041 ratifies the early shipment. |
| **`restore-verify` 14-night streak** | ❌ **weakened to 7 nights** in `apps/bench/reports/M24-beta.md` (`"≥ 7 consecutive nights"`); bench itself is a skeleton (see M22 row). |

### M24 — Beta gate

| Check | Status |
| ----- | ------ |
| AI host real | ✅ — three workflows `Generate3Options.ts` (334 LOC), `PlanCritique.ts` (317 LOC), `VoiceCommand.impl.ts` (256 LOC); `AnthropicRelay.ts` is a real HTTP relay. |
| **AI back-pressure curve (SPEC-31: soft 20 / hard 50 / reject 100)** | ❌ no thresholds anywhere in `packages/ai-host/src/`. The L7.5 plane in `AiHost.impl.ts` exists, but the queue-depth gates do not. |
| AI lazy bootstrap (K3-A gate, ADR-0037) | ✅ `scripts/check-ai-host-lazy.mjs` referenced; `AiHost.impl` is in a separate vite chunk. |
| Self-test checklist exists | ✅ `docs/00_NEW_ARCHITECTURE/M24-PREVIEW-SELF-TEST-CHECKLIST.md` — full ops runbook with §0 pre-flight env vars, kill-switch URL pattern, etc. |
| 25 invitations sent | ❌ pre-launch — depends on M22/M23 closing. |
| `project_command_log` removed | ⚠ verify — schema unchecked here. |

---

## 2. ADR / SPEC compliance signals (Phase-2 in-scope)

| Anchor | Status | Evidence |
| ------ | ------ | -------- |
| **ADR-002** translator | ✅ | `event-bridge.ts` + `event-bridge-roundtrip.test.ts`. |
| **ADR-016** drawing engine (Canvas2D / SVG / PDF unified) | ⚠ | unified primitive surface ✅ (`drawing-primitives`); only Canvas2D backend implemented; SVG (S55) and PDF (S37) throw. |
| **ADR-019** soft-lock semantics | ✅ | client + server complete. |
| **ADR-027** 24 schedule formulas | ❌ | 12 of 24. |
| **ADR-030** lifecycle dissolution | ⚠ | not deeply audited here. Worth a separate grep for residual `src/lifecycle/` legacy. |
| **ADR-031 / SPEC-32** CDE | N/A | deferred to Phase 4. Placeholder file fine. |
| **ADR-040** CSV/XLSX/PDF exports, no native bindings | ⚠ | files present; `xlsx` and `pdf-lib` import audit not performed. |
| **SPEC-03** sync / CRDT | ✅ structurally | the chaos harness + translator round-trip cover most of the spec. The 100-edit converge < 5 s gate is not benched here. |
| **SPEC-04** drawing-engine equivalence test (Canvas2D vs SVG vs PDF, ≤ 0.5 % pixel variance) | ❌ | no equivalence test exists; can't, while two backends are stubs. |
| **SPEC-08** 5-role RBAC at L2/L3 | ❌ | not implemented. `api-rbac` is a different concern (OAuth2 scopes for the public REST API). |
| **SPEC-13** context envelopes | ❌ | no `packages/schemas/src/contexts/`. |
| **SPEC-27** strangler-fig migration | ⚠ | framework present (`packages/file-format/src/migrations/`); v0→v1 stub explicitly throws — correct per spec. |
| **SPEC-29** vector primitives | ✅ | `drawing-primitives` is the unified surface. |
| **SPEC-30** plan-view perf gates | ⚠ | bench is a skeleton; not a CI gate. |
| **SPEC-31** AI back-pressure | ❌ | thresholds missing. |

---

## 3. Validation / CI hygiene (Phase-2 specific)

The Phase-1 audit already documented the four broken / stale workflows.
Phase-2-specific observations:

| Workflow / area | Symptom | Action |
| --------------- | ------- | ------ |
| `pryzm-vi-parity` | failed on stale path | restart; if it then runs but fails on real assertions, file as P2 ticket. |
| Visual-diff plan-view | not a workflow at all | the `visual-diff-plan.bench.ts` skeleton must be promoted to a Playwright-backed workflow before M18 acceptance. |
| `m24-gate.bench.ts` | exists in `apps/bench/src/benches/` | not surfaced as a `.replit` workflow — wire it. |
| `restore-verify.bench.ts` | exists as skeleton | unblockable until SUPABASE_URL is provisioned. |
| Schedule export round-trips | tests in `plugins/schedules/__tests__/` | not in `.replit` workflows — wire as `schedules-export-roundtrip`. |
| Drawing equivalence (SPEC-04 §6) | does not exist | needed once backends ship. |

---

## 4. Strangler-fig honesty (Phase-2-specific)

The `M24-PREVIEW-SELF-TEST-CHECKLIST` is **commendably honest** about
this:

> "The Preview iframe loads `/` by default. At M24, **the default URL
> still mounts the PRYZM 1 marketing landing**. The kill-switch in
> `src/main.ts` is binding through all of Phase 2D; the default flip
> to PRYZM 2 happens at S61 (mid-Phase 3C, ~M32)."

That is the right disclosure, but the engineering implication is:

- The Replit Preview pane the founder will demo to invitees still
  shows "Where the built world meets intelligence." marketing.
- The 25 beta invitees must know to append `?pryzm2=1`.
- No CI step proves the `?pryzm2=1` route boots end-to-end against
  the Phase-2 surface. This is exactly the gap raised in the Phase-1
  audit (S25-T04 in the Phase-1 plan).

For an external beta the absence of a default-route flip is a
**user-experience** problem, not a code problem — but it's worth a
pinned note on the invitation email.

---

## 5. "Best-in-class" forward-looking gaps

These go *beyond* Phase-2 acceptance but matter for "the best browser
BIM tool" framing.

### 5.1 Vector PDF is the M20 cap-stone — and it throws

`packages/drawing-primitives/src/backends/pdf.ts` literally:

```
readonly sprintMarker = 'S37';
render(): never {
  throw new BackendNotImplementedError(this.id, this.sprintMarker);
}
```

Until this lands, sheet export, schedule PDF export, and the
SPEC-04 equivalence test are all blocked. Of all Phase-2 gaps,
**this single file is the highest-leverage fix**. Recommend
`pdf-lib` as the implementation library (per ADR-040) and a parity
fixture set in `tests/visual-diff/sheets/`.

### 5.2 The schedule formula library is at 50 %

12 of 24 formulas. The drift-closeout doc names the missing twelve
(Math: `Sqrt`, `Pow`, `Log`, `Sin`, `Cos`; Stats: `Stdev`, `Median`,
`Mode`; Logic: `If`, `And`, `Or`, `Not`; with `Now`/`Today`
optional). Each is ~30 LOC plus a test. A single engineer can
close this in 1.5 days.

### 5.3 AI back-pressure is missing — the Beta safety valve

SPEC-31's curve (soft pause at 20 jobs, hard pause at 50, reject at
100) protects users from runaway AI cost and bake-queue thrash. The
`AiHost.impl.ts` has a queue but no thresholds. **For a paid beta,
this is the difference between "neat demo" and "operationally
defensible service".** Recommended: add `softLimit`, `hardLimit`,
`rejectLimit` fields to `AiHost.config`, an OTel gauge
`pryzm.ai.queue.depth`, and a 1-second polling sampler that emits
`pryzm.ai.emission.{soft,hard}-pause` spans on threshold crossings.

### 5.4 SPEC-08 role matrix is not anywhere on disk

The `api-rbac` package has 3 OAuth2 scopes for the public REST
API — that is **not the same thing** as the in-product 5-role
matrix (Owner / Admin / Editor / Limited Editor / Reviewer) the
spec mandates at L2 (commands) and L3 (locks). Today, any
authenticated user can issue any command. For multi-user beta this
is unsafe. Recommended: ship `packages/role-matrix/` with a
`canExecute(user, command, target)` predicate, wire it into the
command-bus middleware, and reject from `Limited Editor` any
command targeting `category=structural`.

### 5.5 Context envelopes (SPEC-13) — the "pure producer" insurance policy

The whole P1 invariant from Phase 1 (kernel pure, no DOM/THREE)
relies on producers receiving JSON-serialisable context. Without
the typed envelope and the `pryzm/no-impure-context` lint, a future
producer can quietly take a `THREE.Vector3` parameter and break
headless determinism. The cost of adding the envelope types now is
a day; the cost of unwinding a producer that took a non-serialisable
input is a sprint.

### 5.6 Drawing-equivalence test is the differentiator vs Forma / Qonic

Once SVG and PDF backends ship (5.1), the SPEC-04 equivalence test
(Canvas2D ⇄ SVG ⇄ PDF, ≤ 0.5 % pixel variance) is the public
proof-point that "what you see is what you print, and what you
print on paper is what you get back if you re-import the SVG". No
competitor publishes this — a blog post + CI badge would land.

### 5.7 Default-route flip (UX, not code)

Even with the kill-switch design intentionally deferring the flip
to S61, the *Replit Preview* and the *invitee email* both deserve
a one-line workaround: serve `/` as a 200-with-redirect to
`/?pryzm2=1` for users carrying a `beta=1` cookie. Two-line code
change; removes a foot-gun for 25 humans.

### 5.8 `restore-verify` weakening from 14 nights to 7

The M24 beta-gate report quietly dropped from 14 to 7. That's a
real reduction in the data-loss confidence number you can show an
enterprise customer — defensible for the closed beta, but the
target should ratchet back to 14 for GA.

### 5.9 Awareness-bandwidth bench is missing

ADR / spec budget is < 5 KB/s per peer. With 5 concurrent users on
a small project that's 25 KB/s — fine. With 50 it's 250 KB/s —
gets close to mobile-tether limits. Worth a `awareness-bandwidth.bench.ts`
that asserts the budget and fails CI on regression before GA.

### 5.10 Lifecycle subsystem dissolution (ADR-030)

The ADR mandates deletion of `src/lifecycle/` after the
cross-family invariants move to `plugins/lifecycle/` + command-bus
middleware. Worth a one-grep verification that no `src/lifecycle/`
legacy remains; if it does, file the deletion ticket.

---

## 6. Concrete next-actions list (ordered by impact / effort)

1. **Implement `packages/drawing-primitives/src/backends/pdf.ts`** with `pdf-lib` (ADR-040). *2–3 days.* Unblocks M20 acceptance and the SPEC-04 equivalence test.
2. **Close formula library 12 → 24** by porting the missing twelve into `packages/formula-library/src/builtins.ts`. *1.5 days.* Closes the only Phase-2C drift-closeout item still open.
3. **Wire AI back-pressure curve** in `AiHost.impl.ts` per SPEC-31. *1 day.* Unblocks safe Beta cohort scaling.
4. **Restart `audit-log-middleware`, `pryzm-persistence`, `pryzm-vi-parity` workflows** (carried from Phase-1 audit). *5 minutes.*
5. **Promote `visual-diff-plan.bench.ts` skeleton to a Playwright workflow** that runs against the per-sprint tolerance schedule. *1 day.*
6. **Ship `packages/role-matrix/`** with `canExecute(user, command, target)` and wire it into the command-bus middleware (SPEC-08). *2 days.*
7. **Add `packages/schemas/src/contexts/`** and the `pryzm/no-impure-context` ESLint rule (SPEC-13). *1 day.*
8. **Implement SVG backend** (`packages/drawing-primitives/src/backends/svg.ts`) so SPEC-04 equivalence has all three corners. *1 day after PDF lands.*
9. **Add `awareness-bandwidth.bench.ts`** as a CI-failing check. *0.5 day.*
10. **Provision Supabase + run M22 cutover + return `restore-verify` to 14-night target**. *Half-sprint, environment-bound.*

Items 1–3 should land before any external beta invitation. Items 4–7
are the M24 beta-gate cap-stone. Items 8–10 are the credibility
package and (for item 10) the genuine GA gate.

---

*End of audit. — 2026-04-28*
