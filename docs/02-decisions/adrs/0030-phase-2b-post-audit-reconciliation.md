# ADR-0030 — Phase 2B post-audit reconciliation

- **Status**: Accepted (post-Phase-2B closeout, 2026-04-27)
- **Sprint**: post-2B closeout — landed as "S35-bis / S36-bis"
- **Authors**: PRYZM 2 architecture
- **Related**: ADR-0023 / ADR-0024 / ADR-0025 (Phase 2B trilogy), ADR-0029 (vector primitives), `11-GAP-CLOSURE-PLAN.md` §1, `PROCESS-TRACKER.md` §2B + §6

---

## 1. Context

The 2026-04-27 audit of Phase 2B found a series of governance and code gaps that, while individually small, together undermined the truthfulness of the tracker:

- **Sprint-label conflation** in `PROCESS-TRACKER.md §2B`: S34/S35/S36 each carried two or three different specs in one row.
- **Three duplicate ADR numbers** in `docs/02-decisions/adrs/`: 0023, 0024, 0025 each claimed by two different ADRs.
- **False "85/85 closed"** in `11-GAP-CLOSURE-PLAN.md §1` — four items were demonstrably open.
- **Architectural lie** in `packages/geometry-kernel/src/edge-projection.ts` — referenced a non-existent `packages/drawing-primitives/` package.
- **Plugin without tests** — `plugins/annotations/` was the only Phase 2B plugin shipping zero tests.
- **Dead resolver** — `packages/geometry-kernel/src/view-resolution/` is fully tested but not consumed by `PlanViewCanvasHost` (it is dead code from the host's perspective).
- **Persistence claim unproven** — Contract 44 G4–G8 are unit-class invariants only; no `Store` wraps `StyleResolver` / `ViewElementVisibility`, and no e2e test demonstrates per-view overrides survive reload.
- **Visual-diff exit gate paper** — the S33 "< 2 px" exit criterion has never been measured. The bench file's gated test is hard-wired to throw.
- **Kill-switches absent** — K2B-1..K2B-4 are referenced in the spec, never coded.
- **Deferred scope hidden** — Section View (S35), Multi-View Sync (S36), Visibility-Intent waves 3–4 (mistakenly bundled into S34) all silently rolled to Phase 2C without an ADR.

## 2. Decisions

### 2.1 ADR ledger

Renumber the three colliding ADRs (the second occurrence in each pair takes the next free slot — monotonicity preserved going forward):

- `0023-second-tier-elements-triage.md` → `0026-…`
- `0024-furniture-multi-representation.md` → `0027-…`
- `0025-plan-view-canvas-architecture.md` → `0028-…`

Update `PROCESS-TRACKER §6` to list ADRs 0021–0030 explicitly.

### 2.2 Sprint-label reconciliation (`PROCESS-TRACKER §2B`)

Re-align rows S33–S36 with `phases/PHASE-2B-Q2-M16-M18-PLAN-VIEW.md`:

| Row | Re-label |
|---|---|
| S33 | "Plan View + SVP Parity (Contract 44 G1–G10, isolation suite)" — make explicit it's *isolation* not integration |
| S34 | "Annotations Migration + Track C backfill" — drop the Visibility-Intent labelling |
| S35 | "Plan-view perf tune + visual-diff harness lit" — partial; Playwright deferred to S37 D5 |
| S36 | "Multi-view sync + cross-view layout" — partial; production hardening at S46 |

Add three "S35-bis / S36-bis" closeout rows for the post-2B work landed under this ADR.

### 2.3 `11-GAP-CLOSURE-PLAN §1`

Reclassify and surface in the headline:
- §2.2 #8 (service-role-key) — **Open** (sprint S26)
- §2.2 #11 (BullMQ sweep) — **Open** (sprint S26)
- §2.4 #24 (4 backends) — **Partial** (Canvas2D live; SVG/PDF/Print-Canvas typed stubs per ADR-0029)
- §2.4 #26 (backend-equivalence gate) — **Partial** (self-equivalence harness; full equivalence at S37)

New totals: 81 closed / 2 partial / 2 open of 85.

### 2.4 Code & test backfill (the "S35-bis / S36-bis" rows)

| Item | Where | Sprint marker |
|---|---|---|
| `packages/feature-flags/` (K2B-1..K2B-4 + others) | new package | S35-bis |
| `packages/drawing-primitives/` (Canvas2D live + 3 typed stubs) | new package; ADR-0029 | S35-bis |
| `packages/geometry-kernel/src/hidden-line/` (kernel-pure classifier) | new module | S35-bis |
| `tests/visual-diff/plan-view/` recording-canvas harness + 5 fixtures | tests | S35-bis |
| `packages/visibility/` (legacy VI adapter — waves 3–4 skeleton) | new package | S36-bis |
| `plugins/section-view/` (kernel section-cut producer + canvas host shell) | new plugin | S36-bis |
| `packages/view-state/src/view-sync.ts` + `multi-view-layout.ts` | new modules | S36-bis |
| `packages/schemas/src/view/system-templates.ts` (12 templates) | new module | S36-bis |
| `packages/stores/src/PerViewOverridesStore.ts` + Contract-44 G5 round-trip test | new store | S36-bis |
| `plugins/annotations/__tests__/` (8 handlers + intent + adapter + registration) | tests | S36-bis |
| `view-resolution` consumed by `PlanViewCanvasHost` (default-template helper) | wiring | S36-bis |

### 2.5 Explicit deferrals (project-task follow-ups, NOT done in closeout)

The following genuinely require sprint-scale work and are filed as project tasks:

- **ViewTemplateEditor UI** — UI design pass first; project task.
- **5 hot-op pre-port (S30.5–S30.10)** — needs legacy-code analysis pass; project task.
- **`SUPABASE_SERVICE_ROLE_KEY` removal** — touches `server.js` + secrets; project task at S26.
- **BullMQ scheduled sweep** — needs queue infra; project task at S26.
- **Cesium lazy mount** — refactor of 10 legacy files; project task at S31 originally — re-scoped here.

## 3. Consequences

- The tracker / closure-plan / ADR ledger / code now agree on what shipped vs. what didn't.
- The "P0" governance findings of the audit are closed.
- The "P1" code findings (PerViewOverridesStore persistence, drawing-primitives package, hidden-line classifier, view-resolution wiring, system templates, kill-switches, annotation tests) ship as skeleton + ADR + tests.
- The "P1" code findings that need real engineering depth (Section View, Multi-View Sync, Visibility legacy adapter) ship as *honest skeletons* — the package exists, has tests, has an ADR, and the deeper passes are explicitly bound to later sprints.
- The Phase 2B exit-criterion claim ("< 2 px visual diff") is no longer a paper claim: the recording-canvas harness measures *stream-equivalence* now, and the Playwright PNG promotion is openly bound to S37 D5.

## 4. What this ADR explicitly does NOT close

- It does not pretend the deferred items are done.
- It does not retroactively gate Phase 2B closure on the closeout work — Phase 2B is reported as it actually was (2 partial rows at S35/S36) and the closeout is reported as what it actually is (post-2B stabilisation).
- It does not change the Phase 2C sprint plan; the deeper depth-passes for the typed stubs land in their originally-planned sprints (S37 / S40 / S46 / S49 / S55).

---

## Amendment 2026-04-28 (W-09 — section-view continuation; W-19 — Active*Store ratification)

**Source**: W-09 + W-19 of `PHASE-2-CLOSE-IMPLEMENTATION-PLAN-2026-04-28.md`.

### W-09 — section-view continuation landed

The section-view plugin was a 3-file shell at the time of this ADR's original
RATIFIED.  W-09 ships:

* `packages/geometry-kernel/src/producers/section-cut.ts` — moved from the
  plugin to the kernel, leaves a re-export shim at the plugin path so
  in-tree callers continue to compile.
* `packages/stores/src/SectionStore.ts` + `ActiveSectionStore.ts` — mirror
  `SheetStore` / `ActiveSheetStore` exactly (singleton-on-Store pattern).
* Six handlers (`CreateSection`, `DeleteSection`, `MoveSectionLine`,
  `SetSectionDepth`, `SetSectionMark`, `SetSectionScale`) under
  `plugins/section-view/src/handlers/`.
* `SectionViewRenderer.ts` — Canvas2D renderer feeding the producer output
  into `@pryzm/drawing-primitives`.
* `SectionViewCanvasHost.ts` — promoted from shell to live host that draws
  pixels (the canvas-host integration test now asserts non-zero pixels).

This closes §3 C-3 of `PHASE-2-CODE-VS-SPEC-AUDIT-2026-04-28.md` and the
M24 §3 functional-readiness "section view functional" claim becomes
truthful.

### W-19 — Active{Sheet,Schedule}Store ratification

`packages/stores/src/ActiveSheetStore.ts` + `ActiveScheduleStore.ts` are
+1 over the original Phase 2C spec.  They mirror `ActiveViewStore` (the
singleton-on-Store pattern landed in S29) so that the per-store cursor
semantics are consistent across views, sheets, and schedules.  This
amendment ratifies the +1; the stores are the canonical place to read
"which sheet/schedule is active".

<!-- code-anchor: pattern="plugins/section-view/src/handlers/*.ts" expect="present" min="6" -->
<!-- code-anchor: pattern="packages/stores/src/SectionStore.ts" expect="present" min="1" -->
<!-- code-anchor: pattern="packages/stores/src/ActiveSectionStore.ts" expect="present" min="1" -->
<!-- code-anchor: pattern="packages/stores/src/ActiveSheetStore.ts" expect="present" min="1" -->
<!-- code-anchor: pattern="packages/stores/src/ActiveScheduleStore.ts" expect="present" min="1" -->
<!-- code-anchor: pattern="packages/geometry-kernel/src/producers/section-cut.ts" expect="present" min="1" -->
