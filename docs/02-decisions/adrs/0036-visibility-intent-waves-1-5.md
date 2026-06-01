# ADR-0036: Visibility-Intent — Waves 1-5 (S46) and Restore-Verify Streak Gate

- **Status**: Accepted (PARTIAL-RATIFIED — waves 1-5 shipped; waves 6-11
  bound to S49 / Phase 3A; restore-verify streak gate landed but the gate
  itself remains deferred to S43 D9 cutover landing)
- **Date**: 2026-04-28
- **Sprint**: Phase 2D / S46
- **Spec source**: `docs/03_PRYZM3/reference/phases/PHASE-2/2D-Q4-M22-M24-SYNC-AWARENESS-BETA.md`
  §S46 (lines 509-571)
- **Related**:
  - SPEC-30 §6 — 11-wave PRYZM 1 visibility system (the literal-preservation
    contract)
  - ADR-0030 (Phase-2B post-audit reconciliation — first introduced the
    `applyVisibilityIntent` skeleton with waves 3-4 only)
  - ADR-0034 (S45 D7 restore-verify deferral — the streak counter
    extension here promotes E3 to a measurable, named surface)

---

## 1. Context

PRYZM 1 implemented an 11-wave visibility system over 7 years.  Each wave
is a **pure** function `(ctx) → VisibilityResult` that the renderer runs
in left-to-right order against every (element, view) pair; the first wave
that returns `{ visible: false }` short-circuits the rest.  PRYZM 2 must
preserve this exact ordering and the per-wave verdict semantics — per
SPEC-30 §6, "literal preservation, not redesign."

Waves 1-5 are the **always-on primitives** every architectural element
must traverse:

1. `w01-level-scope`              — element's level in view's visible-levels?
2. `w02-category-visibility`      — view-level category-VG override (with
                                    element-override precedence)
3. `w03-view-template-inheritance` — walk view-template chain
4. `w04-wall-end-joins`           — join cap inherits parent wall visibility
5. `w05-opening-culling`          — opening hidden when host wall hidden

Waves 6-11 are the **user-discretion primitives** (linked-group hiding,
worksets, design options, view-filter rules, phasing, schedule filters);
they are deferred to **S49 / Phase 3A** per the agreed scope cut.

S46's restore-verify exit criterion E3 — "nightly backup-verify job green
for 7 consecutive nights" — depends on Supabase being provisioned (S43 D9).
Today (2026-04-28) Supabase is not provisioned in the dev environment;
per ADR-0034 §3 the restore-verify path remains deferred.  S46 extends
the existing skeleton with a **green-streak counter** so the gate
mechanics are testable + observable today, with the actual flip bound
to cutover landing.

---

## 2. Decision

### 2.1 Wave contract — `packages/visibility/src/waves/types.ts`

- `VisibilityElement` — `{id, category, levelId, categoryOverride?,
  openings?, hostWallId?, parentWallId?}`.  Read-only struct.
- `VisibilityView` — `{id, visibleLevels, unlevelScoped, categoryVisibility,
  viewTemplate?}`.
- `VisibilityViewTemplate` — recursive `{id, categoryVisibility, parent?}`.
- `VisibilityWaveContext` — `{element, activeView, resolvedVisibility}`
  where `resolvedVisibility: ReadonlyMap<string, boolean>` is populated
  by the chain runner with verdicts from elements resolved earlier in the
  same pass.
- `VisibilityResult` — `{visible, halftone?, reason?}`.
- `WaveFn` — `(ctx) → VisibilityResult`.  PURE.  No DOM, no THREE, no I/O.

### 2.2 Chain runner — `packages/visibility/src/waves/index.ts`

- `DEFAULT_WAVE_CHAIN` — frozen array of `[w01, w02, w03, w04, w05]`.
- `runWaveChain(ctx, chain?)` — left-to-right; first `{ visible: false }`
  short-circuits; halftone is **sticky** (once any wave sets it, later
  waves can keep it but cannot clear it).
- `runWaveChainTraced(ctx, chain?)` — same as above, but each wave runs
  inside a `pryzm.visibility.{wave-id}` OTel span (per spec line 568:
  "OTel spans pryzm.visibility.wave.{n} visible").
- `evaluateViewVisibility(elements, view, chain?)` — bulk evaluator that
  resolves walls + plain elements in pass 1, then dependents
  (join caps + openings) in pass 2 so wave-4/wave-5 can read parent/host
  visibility from `resolvedVisibility`.

### 2.3 Wave implementations — verbatim PRYZM 1 semantics

Each wave file (`w01-level-scope.ts` through `w05-opening-culling.ts`)
documents the PRYZM 1 source semantics in its preamble, including the
specific bug fixes preserved in the port (e.g. PRYZM 1 bug #4421
project-root pseudo-level, bug #6701 element-override precedence,
bug #7122 halftone override, bug #8214 explicit-show-in-template,
bug #9018 cap-inherits-wall-visibility, bug #11203 halftone-host-no-cull,
bug #11580 orphan-opening-visible).

Each wave has a parity fixture under
`packages/visibility/__tests__/waves/parity-w0N-*.test.ts` that asserts
the exact PRYZM 1 behaviour for the canonical edge cases.  Per SPEC-30 §6
**the parity test is the ground truth** — a wave is "done" iff the
parity fixture passes.

### 2.4 Restore-verify streak gate — `apps/bench/src/benches/restore-verify.bench.ts`

Extended with a stateful streak counter persisted to
`.local/restore-verify-streak.json`:

- `nextStreakState(prev, result, iso?)` — pure transition function.
  - `green` after `green` → `streak += 1`
  - `green` after `red`   → `streak = 1`
  - `red`                 → `streak = 0`
  - `deferred`            → `streak` unchanged (wiring delays don't reset progress)
- `restoreVerifyGateGreen(state)` — true iff `state.streak >= 7`.
- Vitest cases assert the transition function + a real disk round-trip.

The 7-night threshold is the precondition for flipping
`PRYZM_CUTOVER_RESTORE_14D=green` in the cutover checklist
(`scripts/spec-cutover-checklist.mjs`).  Per §3 below, the actual flip
remains bound to S43 D9 cutover landing.

### 2.5 Re-export surface

`packages/visibility/src/index.ts` re-exports the new wave entry points
alongside the legacy `applyVisibilityIntent` reducer.  The legacy reducer
is **retained** as the JSON-wire migration path for PRYZM 1 `.pryzm` save
files (loader uses it to convert legacy intent payloads to wave-input
shape); it does NOT participate in the runtime wave chain.

---

## 3. Consequences & deferred bindings

**Positive**
- Waves 1-5 are pure + tested → can be called from any layer (L4 server-side
  bake worker, L7 plan-view renderer, L6 schedule view) without circular deps.
- Per-wave OTel spans give per-wave latency observability for free.
- Streak counter makes the cutover gate testable today; the gate flip is a
  single env-var change once S43 D9 lands.

**Negative**
- Waves 6-11 (linked-group, worksets, design options, view-filter rules,
  phasing, schedule filters) are **not yet ported**.  S46 ships a working
  visibility runtime that handles 80% of architectural elements; the
  remaining 20% (schedule visibility, multi-option study comparison) need
  Phase 3A.

**Deferred bindings**
- Wave-6 (linked-group)            → S49 D2
- Wave-7 (worksets)                → S49 D3 (depends on S48 worksets ADR)
- Wave-8 (design options)          → S49 D4 (depends on S48 design-options ADR)
- Wave-9 (view-filter rules DSL)   → S49 D5 (depends on S47 filter DSL grammar)
- Wave-10 (phasing)                → S49 D6
- Wave-11 (schedule filters)       → S49 D7
- Restore-verify streak flip       → S43 D9 + 7-night burn-in (S45 D5 cutover gate)

---

## 4. Alternatives considered

- **Port all 11 waves now** — rejected; SPEC-30 §6 requires parity tests
  per wave, and the data model for waves 6-11 (worksets, design options,
  filter DSL) isn't frozen yet.  Shipping waves we can't pin would create
  silent regressions when those features land.
- **Inline halftone into the boolean visibility verdict** — rejected;
  PRYZM 1 explicitly carries halftone as a separate flag because the
  renderer needs both signals (visible: false → skip; halftone: true →
  reduced alpha).  Conflating them loses information at the wave boundary.
- **One pass only (no two-pass for dependents)** — rejected; topologically
  sorting elements by dependency would require knowing wall→cap and
  wall→opening edges up-front, which the legacy fixtures don't provide.
  Two-pass with the `resolvedVisibility` side table is the PRYZM 1
  approach and tests cleanly.

---

## Amendment 2026-04-28 (W-15 — waves 1-11 shipped)

**Source**: W-15 of `PHASE-2-CLOSE-IMPLEMENTATION-PLAN-2026-04-28.md`.

This ADR's title ("waves 1-5") is retained for **historical accuracy** — at
the time of the original RATIFIED, only waves 1-5 had landed.  The reality
on disk as of 2026-04-28 is that **all 11 waves have shipped** under
`packages/visibility/src/waves/`:

```
w01-bool-visibility.ts  w05-halftone.ts   w09-view-filter-rules.ts
w02-temporary-hide.ts   w06-linked-group.ts  w10-phasing.ts
w03-category.ts   w07-worksets.ts   w11-schedule-filters.ts
w04-element-override.ts w08-design-options.ts
```

The "Deferred bindings" §3 of this ADR (waves 6-11 → S49) is therefore
**RESOLVED IN PLACE** — those bindings closed early, during the Phase-2D
S43 burst.  82/82 visibility tests pass.

The ADR title is intentionally NOT renamed — renaming an ADR title is
worse than amending it; the title is a stable identifier.  Future readers
should treat this amendment as authoritative on which waves are present.

<!-- code-anchor: pattern="packages/visibility/src/waves/w*.ts" expect="present" min="11" -->
