# GE-06 — Clash engine: scoped decomposition

> **Stamp**: 2026-08-14 · **Status**: ACTIVE plan · **Owner row**: BIM30-GAP-REGISTER §3 GE-06
> (also feeds PR-10, which is blocked on this engine's roof-vs-walls slice — now landed).
> **Authority**: C73 (tolerance/canonical predicates) · C70 L-INV-1 (a registered id that
> silently does nothing is the worst state) · ADR-0322 §5 ("found nothing" and "could not
> look" are never the same value).

## 0 — Honest state at HEAD

- **One real slice exists.** `83c82c02` — pure, deterministic roof-vs-walls-beneath detector,
  `packages/geometry-roof/src/pure/roofWallClash.ts`: classifies each wall under a roof as
  clean / PENETRATES (deepest overshoot) / GAP (closest approach), typed findings
  `{wallId, roofId, kind, magnitudeM}`, kernel `COINCIDENT_M` epsilon (no new literal),
  **13 oracle tests** with hand-computed magnitudes. Subscriber point identified:
  `initWallLevelSubscribers.ts:39–57`.
- **Everything else is a stub wearing a capability's clothes.** `clash-run` +
  `ClashDetectionToolbar` remain algorithm-less: 12 declared command ids vs 12 toolbar ids
  with only 3 in common (`clash-run`, `clash-filter-new`, `clash-report-export`), no handler
  in any plugin, no general detector. Additionally the H6 gesture probe (`b32d56ff`) measured
  **all 30 toolbars have zero importers** — the toolbar itself is unreachable pending the
  founder's mount-or-delete decision, so the verb seam, not the toolbar, is the near-term
  surface.

## 1 — The verb's behaviour while slices are missing (do this FIRST, before any new detector)

**`clash-run` must refuse by name, never return "no clashes" it did not compute.** A `[]`
from an engine that checked one pair out of N is the `[]`-means-unknown defect at engine
scale (`check-no-empty-means-unknown` class; ADR-0322 §5).

Contract for the interim handler:

1. Maintain a **pair-coverage manifest**: the closed list of element-pair detectors that are
   REGISTERED (today: `roof×wall`). The manifest is code, not prose — the report is generated
   from it.
2. A `clash-run` result is `{findings, checkedPairs, uncheckedPairs}` — findings only ever
   claim the pairs in `checkedPairs`; `uncheckedPairs` **names** every pair the run could not
   evaluate. UI copy: "No clashes found in roof×wall. NOT CHECKED: wall×wall, column×slab, …".
3. If **zero** detectors are registered in the composed runtime, `clash-run` returns a typed
   `CapabilityRefusal` (C78 §8 shape, reason `ENGINE_NOT_AVAILABLE`) — the `c5ca3dd9`
   precedent.
4. The **ten unhandled toolbar/command ids refuse** (C70 L-INV-1) — the register row's own
   "smallest change". No id may keep silently no-opping.
5. Gate arm (when the C73 gate family grows one): `uncheckedPairs` is a shrink-only ledger;
   a pair leaves it only by gaining an oracle-tested detector.

## 2 — Which pairs next, and what each slice costs (by analogy to the roof slice)

The roof slice's cost shape: **one pure detector file in the owning `geometry-*` package
(~250–400 lines), kernel epsilons only, typed findings with magnitudes, ~13 oracle tests with
hand-computed values, one subscriber/wiring point.** Roughly one lane-session each. Order
below is by measured pain, not symmetry:

| # | Pair | Why it is next | Geometry needed | Cost vs roof slice |
|---|------|----------------|-----------------|--------------------|
| 1 | **wall×wall** (overlap/doubling) | Three logged defect families are this pair: doubled walls (§CLAMP-COSHARE-WELD revert), WallJoinResolver degenerate-wall black spike, interior-wall-on-opening | Baseline-segment proximity + thickness-band overlap. Segment intersection exists (`pure/segmentIntersection.ts` family, oracle-tested); **no general 2-D boolean needed** | **≈1×** — same shape: pure file in `geometry-wall` or kernel, interval math on baselines |
| 2 | **column×slab / beam×slab** (penetration) | Structural pair with the simplest correct math; slab-extrudes-DOWN convention already pinned by the roof slice | Vertical interval overlap + THE canonical point-in-polygon (`df07e5c4`) against the slab ring | **≈0.7×** — less geometry than roof (no pitched underside field) |
| 3 | **stair×slab** (stairwell void) | Stair-fragmentation and stair-carve sagas; a stair whose run pierces an un-voided slab is the recurring generator defect | Stair run AABB/footprint vs slab ring minus declared void — PIP + rectangle clip, both existing | **≈1×** |
| 4 | **furniture×clearance** (furniture overlap + door-swing) | Furnish-quality wishlist; advisory severity, high user value | Plan AABB overlap via the existing spatial index + clearance radii from `rules/programRules.ts` | **≈0.7×**, but ADVISORY class — findings must carry severity so the UI does not cry wolf |
| 5 | **wall/window×opening conflicts** | Partially exists as `WallOccupancyStore.canPlace()` refusals at commit | Mostly EXPOSURE: re-emit existing refusal logic as clash findings; do not duplicate the predicate | **≈0.3×** — wiring, not construction |

**Not in scope until the above land**: a general N×N broad-phase. Five pair detectors over
the existing spatial index are the honest engine; "general clash engine" as a single
construction project is how GE-06 stayed G0 for a year.

## 3 — Exit condition for the register row

GE-06 stops being one row and becomes per-pair rows the moment slice #1 lands. The row
closes when: (a) every declared clash id refuses or answers; (b) `clash-run` reports
checked/unchecked pairs per §1; (c) at least pairs 1–3 have oracle-tested detectors wired to
a subscriber. The toolbar's fate is the founder's mount-or-delete call (§11.3 of the session
brief) and is deliberately NOT a dependency of any of this.
