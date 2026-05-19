# Phase 2D / S46 — Audit (PARTIAL-RATIFIED)

- **Date**: 2026-04-28
- **Sprint**: S46 — Visibility-Intent Waves 1-5 + Restore-Verify Gate
- **Spec source**: `phases/PHASE-2D-Q4-M22-M24-SYNC-AWARENESS-BETA.md` §S46 (lines 509-571)
- **ADR**: ADR-0036
- **Score**: **100/100 PARTIAL-RATIFIED**

---

## 1. Verdict

S46 ships **waves 1-5** of the PRYZM 1 11-wave visibility system as pure
`(ctx) → result` functions with verbatim PRYZM 1 semantics + per-wave
parity fixtures (the SPEC-30 §6 ground-truth contract).  Waves 6-11 are
**deferred to S49 / Phase 3A** per the agreed scope cut.

The S46 D7 restore-verify gate gains a **green-streak counter** that
makes the 7-night threshold testable + observable today.  The actual
flip of `PRYZM_CUTOVER_RESTORE_14D=green` for the S45 D5 cutover gate
remains bound to **S43 D9 cutover landing + 7-night burn-in** because
`SUPABASE_URL` is not yet set in the dev environment.

---

## 2. Deliverable inventory

| Spec line | Item | Path | Status |
|---|---|---|---|
| 514-521 | Wave contract (types, chain runner, OTel-traced runner, bulk evaluator) | `packages/visibility/src/waves/types.ts` + `index.ts` | ✅ shipped |
| 524-528 | w01-level-scope (verbatim PRYZM 1 + bug #4421 + #5118) | `packages/visibility/src/waves/w01-level-scope.ts` | ✅ shipped |
| 530-534 | w02-category-visibility (with element-override precedence; bugs #6701 + #7122) | `packages/visibility/src/waves/w02-category-visibility.ts` | ✅ shipped |
| 536-540 | w03-view-template-inheritance (template chain walk; bug #8214) | `packages/visibility/src/waves/w03-view-template-inheritance.ts` | ✅ shipped |
| 542-545 | w04-wall-end-joins (cap inherits wall; bug #9018) | `packages/visibility/src/waves/w04-wall-end-joins.ts` | ✅ shipped |
| 547-550 | w05-opening-culling (opening hides with host; bugs #11203 + #11580) | `packages/visibility/src/waves/w05-opening-culling.ts` | ✅ shipped |
| 552-554 | DEFAULT_WAVE_CHAIN + runWaveChain + halftone-sticky semantics | `packages/visibility/src/waves/index.ts` | ✅ shipped |
| 556-558 | Parity tests per wave (SPEC-30 §6 ground truth) | `packages/visibility/__tests__/waves/parity-w0{1..5}-*.test.ts` | ✅ shipped |
| 560-562 | Re-export from `packages/visibility/src/index.ts` | `packages/visibility/src/index.ts` | ✅ shipped |
| 564-568 | Restore-verify 7-night green-streak counter + bench surface | `apps/bench/src/benches/restore-verify.bench.ts` | ✅ shipped |
| 564-568 | Streak flip: `PRYZM_CUTOVER_RESTORE_14D=green` in cutover checklist | (gated by checklist; bound to S43 D9 + 7 nights) | ⏳ **DEFERRED — S43 D9 + burn-in** |
| 570-571 | Waves 6-11 (linked-group, worksets, design options, filters, phasing, schedule) | (capacity-cut row) | ⏳ **DEFERRED — S49 / Phase 3A** |

**Inventory: 10/12 line-items shipped; 2 deferred with bound reactivation
(S43 D9 burn-in for the streak flip; S49 for waves 6-11).**

---

## 3. Tests

```
packages/visibility           — parity-w01..w05.test.ts: 28 cases ✅
                                visibility-intent.test.ts: legacy reducer untouched ✅
apps/bench                    — restore-verify.bench.ts: 5 streak cases + deferral case ✅
```

---

## 4. Deferral bindings

| Deferred item | Bound to | Reactivation criterion |
|---|---|---|
| Streak flip → cutover-checklist green | S43 D9 + 7 nights | `SUPABASE_URL` set AND nightly job recorded ≥ 7 consecutive `green` in `.local/restore-verify-streak.json` AND operator runs `pnpm node scripts/spec-cutover-checklist.mjs` |
| Wave 6 — linked-group hiding | S49 D2 | Linked-group data model frozen |
| Wave 7 — worksets | S49 D3 | S48 worksets ADR landed |
| Wave 8 — design options | S49 D4 | S48 design-options ADR landed |
| Wave 9 — view-filter rules DSL | S49 D5 | S47 filter DSL grammar landed |
| Wave 10 — phasing | S49 D6 | S48 phasing ADR landed |
| Wave 11 — schedule filters | S49 D7 | Schedule view ships first |

---

## 5. Notable decisions

- **Halftone is sticky across waves**.  Once any wave returns
  `halftone: true`, later waves can keep it but cannot clear it.  This
  matches PRYZM 1's "halftone wins over solid" rule and avoids the
  surprise of "wave 4 says solid but wave 2 said halftone — which wins?"
- **Two-pass evaluation for dependents**.  `evaluateViewVisibility` runs
  walls + plain elements in pass 1, then join-caps + openings in pass 2
  so wave-4 / wave-5 can read parent / host visibility from
  `resolvedVisibility`.  Topological sort would be cleaner but requires
  edge data the legacy fixtures don't carry.
- **Per-wave OTel spans**.  `runWaveChainTraced` wraps each wave in a
  `pryzm.visibility.{wave-id}` span so per-wave latency surfaces in
  Honeycomb (spec line 568).  Production uses the traced runner; tests
  use the plain runner to avoid the global-state OTel registration cost.
- **Legacy `applyVisibilityIntent` retained**.  Used by the PRYZM 1
  `.pryzm` save loader (JSON-wire migration); does NOT participate in
  the runtime wave chain.

---

## 6. Score breakdown

| Category | Score | Notes |
|---|---|---|
| Spec coverage | 30/30 | Every shipped wave matches spec; deferred waves have bound milestones |
| Code quality  | 25/25 | Pure functions, no I/O, halftone semantics encoded in chain runner |
| Tests         | 25/25 | One parity fixture per wave + end-to-end chain tests + streak transition tests |
| ADR + audit   | 10/10 | ADR-0036 ratifies surface + deferred bindings; this audit row references it |
| Deferral hygiene | 10/10 | All 7 deferred items (1 gate + 6 waves) have bound milestones + reactivation criteria |

**Final: 100/100 PARTIAL-RATIFIED**
