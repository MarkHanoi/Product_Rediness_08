# S18 — Sprint Retrospective (Phase 1C exit)

> **Sprint**: S18 — final sprint of Phase 1C ("Element families breadth + headless")
> **Window**: late-stage 1C; closed inside the W-1 completion worklist alongside S24.
> **Companion docs**: `docs/03_PRYZM3/archive/superseded-audits/PHASE-1-COMPLETION-PLAN.md`, `docs/retros/PHASE-1-CLOSE.md`.
> **Phase doc**: `phases/PHASE-1C-Q3-M7-M9-ELEMENT-FAMILIES.md` §S18.

---

## What shipped

- 12 element families fully wired in plugin form: wall, slab, door, window, roof, curtain-wall, grid, column, beam, stair, handrail, ceiling — plus the view, selection, picking, cross, and toy-cube auxiliary plugins.
- `apps/headless` package surface stabilised; CLI commands (`new-project`, `add-wall`, `pack`, `unpack`) round-trip identically vs the editor path.
- ADR-0017 ("headless package surface") committed; dependency-cruiser config gates the no-DOM no-THREE invariant.
- `tests/integration/all-12-elements.test.ts` (S14-T9) green — every kernel producer yields a valid descriptor.
- `tests/integration/view-state-2a-readiness.test.ts` (W-1C-8) green — 7 contract assertions pin the view-state surface for 2A.
- 6 architecture handover docs landed: `docs/architecture/{picking,selection,view-state,camera,headless,element-coupling}.md`.

## What worked

- **Plugin-per-element seam.** The pattern from S07 (wall) ported to the other 11 families with near-zero variance. The 12th family was a copy-paste-and-rename plus a producer.
- **ADR-first.** Every cross-cutting decision (cascade rules, headless surface, view-state contract) was nailed down in an ADR before code landed; no architectural rework needed mid-sprint.
- **Bench-as-contract.** `produce-<family>` baselines acted as the regression anchor — when slab broke during a join refactor we caught it inside the same PR.
- **OTel coverage.** Every new producer added its span emission as part of the same change; observability never lagged behind the implementation.

## What slipped

- **Parity-pattern fragmentation.** The wall / ceiling / curtain-wall / stair / handrail families landed on the disk-based byte-equal pattern (`tests/parity/<family>/{configs,snapshots}/`); door / window / slab / grid / column / beam shipped with inline shape-digest fixtures. The audit re-graded this from CRITICAL to HIGH; W-1C-2 closes the gap.
- **Editor wiring.** `bootstrapWithWalls()` ships; `bootstrapWithEverything()` did not land in S18 itself — it became the W-1C-1 anchor in the completion worklist.
- **Bench dashboard.** `apps/bench/dashboard/types.ts` was scaffolded in S18-T6 but the loader/render/coverage/build layer rolled into W-1C-6.
- **Curtain-wall fixture density.** 8 fixtures shipped against a 25-fixture spec budget; W-1C-3 closes the gap.

## Decisions deferred to 1D / 2A

1. `JoinRoofs` cross-roof cascade graph hardening — the depth-limit + cycle-drop guard from 1B suffices for now; Phase 2 may want explicit roof-group entities.
2. Headless CLI shipping format (single-file vs npm package). Today it lives inside `apps/headless`; the Phase 2 packaging plan will decide.
3. View-state collaborative cursor + shared-camera diff — the 2A milestone owns this, but the contract test (W-1C-8) pins the surface so 2A can land without rework.
4. Bundle-size CI gate enforcement — wired in `apps/bench/scripts/check-bundle-size.mjs` but only runs against a real production `vite build`; first deploy build will activate it.

## Process changes for Phase 2

- **Parity pattern is now canonical.** Every new element family must ship with the disk-based `configs/` + `snapshots/` pattern; the inline shape-digest path is gone (W-1C-2 enforces this).
- **CI fails on empty parity dirs.** A vacuous-pass test (zero fixtures) becomes a CI failure (process-gate added in W-1C-6).
- **Bench coverage audit.** Every `*.bench.ts` must appear in at least one report. Adding a bench file but never running it becomes a CI failure (W-1C-6 `coverage-audit.test.ts`).
- **Plugin descriptor pattern.** Adding a 13th element family in 2A is one descriptor entry, not an editor-bootstrap code change (W-1C-1 anchor).

## Cross-references

- ADRs: 0014 (perf budgets), 0015 (picking strategy), 0016 (cascade rules), 0017 (headless surface).
- Completion plan units owned by S18: W-1C-1, W-1C-2, W-1C-3, W-1C-4, W-1C-6, W-1C-7, W-1C-8, W-1C-9.
- M9 1C exit gate report: `apps/bench/reports/M9-1C-baseline.md` (W-1C-6).
- Phase 1 close-out: `docs/retros/PHASE-1-CLOSE.md` (carries the broader S01–S24 picture; this doc is the S18-specific slice).
