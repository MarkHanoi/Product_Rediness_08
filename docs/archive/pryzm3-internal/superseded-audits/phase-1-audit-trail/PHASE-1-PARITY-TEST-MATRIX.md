# PHASE-1 Per-Element Parity Test Matrix

**Status**: closes W-12 from `PHASE-1-CLOSE-IMPLEMENTATION-PLAN-2026-04-28.md`.
**Date**: 2026-04-28.
**Owner**: Geometry-kernel + plugin teams.

The Phase-1 audit flagged that the existing parity-test inventory was
spread across nine separate fixtures directories and a single
geometry-kernel test suite — operators reading the audit could not
tell at a glance whether the parity coverage for a given element
family was complete. This document is the canonical, single-page
matrix.

For every Phase-1 element family we record:

* **Handlers covered** — the count, sourced from
  `plugins/<family>/src/handlers/`.
* **Producer parity** — fixture path under `tests/fixtures/pryzm-1/<family>/`
  + the test file that exercises it.
* **Geometry-kernel snapshot parity** — vertex / index / pset hash
  comparison against the PRYZM 1 reference snapshot.
* **Visual diff** — `tests/visual-diff/3d/<family>.spec.ts` (24-spec
  corpus added by W-10).
* **Status** — `green` (all gates passing) / `yellow` (one deferred
  fixture) / `red` (gap requiring action).

| #  | Family       | Handlers | Producer parity                               | Geometry snapshots                               | Visual diff (3D)              | Status |
|----|--------------|----------|-----------------------------------------------|---------------------------------------------------|--------------------------------|--------|
| 1  | wall         | 15       | `tests/fixtures/pryzm-1/wall/*.json` × 12     | `packages/geometry-kernel/__tests__/wall.parity.test.ts` | `tests/visual-diff/3d/wall-*.spec.ts` × 4 | green |
| 2  | slab         | 9        | `tests/fixtures/pryzm-1/slab/*.json` × 8      | `packages/geometry-kernel/__tests__/slab.parity.test.ts` | `tests/visual-diff/3d/slab-*.spec.ts` × 2 | green |
| 3  | door         | 7        | `tests/fixtures/pryzm-1/door/*.json` × 6      | `packages/geometry-kernel/__tests__/door.parity.test.ts` | `tests/visual-diff/3d/door-*.spec.ts` × 2 | green |
| 4  | window       | 7        | `tests/fixtures/pryzm-1/window/*.json` × 6    | `packages/geometry-kernel/__tests__/window.parity.test.ts` | `tests/visual-diff/3d/window-*.spec.ts` × 2 | green |
| 5  | roof         | 8        | `tests/fixtures/pryzm-1/roof/*.json` × 7      | `packages/geometry-kernel/__tests__/roof.parity.test.ts` | `tests/visual-diff/3d/roof-*.spec.ts` × 2 | green |
| 6  | curtainwall  | 13       | `tests/fixtures/pryzm-1/curtain-wall/*.json` × 11 | `packages/geometry-kernel/__tests__/curtain-wall.parity.test.ts` | `tests/visual-diff/3d/curtain-wall-*.spec.ts` × 2 | green |
| 7  | grid         | 6        | `tests/fixtures/pryzm-1/grid/*.json` × 5      | `packages/geometry-kernel/__tests__/grid.parity.test.ts` | `tests/visual-diff/3d/grid-*.spec.ts` × 2 | green |
| 8  | column       | 6        | `tests/fixtures/pryzm-1/column/*.json` × 5    | `packages/geometry-kernel/__tests__/column.parity.test.ts` | `tests/visual-diff/3d/column-*.spec.ts` × 2 | green |
| 9  | beam         | 6        | `tests/fixtures/pryzm-1/beam/*.json` × 5      | `packages/geometry-kernel/__tests__/beam.parity.test.ts` | `tests/visual-diff/3d/beam-*.spec.ts` × 2 | green |
| 10 | stair        | 7        | `tests/fixtures/pryzm-1/stair/*.json` × 6     | `packages/geometry-kernel/__tests__/stair.parity.test.ts` | `tests/visual-diff/3d/stair-*.spec.ts` × 2 | green |
| 11 | handrail     | 5        | `tests/fixtures/pryzm-1/handrail/*.json` × 4  | `packages/geometry-kernel/__tests__/handrail.parity.test.ts` | `tests/visual-diff/3d/handrail-*.spec.ts` × 1 | green |
| 12 | ceiling      | 5        | `tests/fixtures/pryzm-1/ceiling/*.json` × 4   | `packages/geometry-kernel/__tests__/ceiling.parity.test.ts` | `tests/visual-diff/3d/ceiling-*.spec.ts` × 1 | green |

**Totals**:
* **Handlers**: 94 across 12 families.
* **Producer parity fixtures**: 79.
* **Geometry-kernel snapshot tests**: 12 (one per family).
* **3D visual-diff specs**: 24 (W-10 corpus extension).

---

## 2 — Snapshot regeneration

When a producer changes intentionally:

```bash
# Regenerate all fixture snapshots for one family.
pnpm --filter @pryzm/geometry-kernel run snapshots:regenerate -- --family=<family>

# Re-run the parity gate.
pnpm --filter @pryzm/geometry-kernel run test -- <family>.parity.test.ts
```

Snapshot regeneration is a code-review-gated operation — every diff
must be reviewed by the family owner per
`docs/04-reference/architecture-detail/parity-fixtures.md` §"Snapshot drift policy".

---

## 3 — Coverage gates

The CI pipeline enforces:

* Every family above has a non-empty fixtures directory.
* Every family above has a `*.parity.test.ts` file in
  `packages/geometry-kernel/__tests__/`.
* Every family above has at least one entry in `tests/visual-diff/3d/`.

The handler counts are NOT enforced by CI today — they're audit
output only. If a future sprint adds a handler the matrix here is
the single source of truth and must be edited in the same PR.
