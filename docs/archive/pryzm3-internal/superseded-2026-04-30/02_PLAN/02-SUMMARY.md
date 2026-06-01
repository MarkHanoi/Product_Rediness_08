# PRYZM 2 — Summary Implementation Plan

> **One-page distillation** of `10-MASTER-IMPLEMENTATION-PLAN-36M.md` + `12-BIM-2-AND-3-POST-GA-ROADMAP.md` + the 25 wireup-plan chunks. For the full per-sprint, per-day breakdowns, follow the links into `phases/PHASE-*.md` and the chunks. For the full architecture map see [`FINAL-ARCHITECTURE-AND-ORCHESTRATION.md`](../01_ARCHITECTURE/03-FINAL-MAP.md). For the convergence into the single clean product (PRYZM 3) see [`PRYZM-3-CONVERGENCE-PLAN.md`](03-CONVERGENCE.md).
>
> **Status**: ratified 2026-04-29.

---

## §1  The plan in one diagram

```
M0 ─────────────── M12 ─────────────── M24 ─────────────── M36 ─────────────── M40 ─────────────── M72
│                  │                   │                   │                   │                   │
│   PHASE 1        │   PHASE 2         │   PHASE 3         │   GA              │  POST-S72         │  POST-GA ROADMAP
│   Skeleton +     │   All element     │   Drawing + AI    │                   │  WIREUP           │  (12-BIM-2-AND-3)
│   walls          │   families + IFC  │   + PDF-to-BIM +  │                   │  (white-UI bind)  │  Phases 4–8
│                  │   + sync + alpha  │   constraint solv │                   │                   │
│                  │                   │   + beta          │                   │                   │
│                  │                   │                   │                   │                   │
│  S01..S24        │  S25..S48         │  S49..S72         │  ◄ GA gate        │  S73-WIRE..       │  S73-PG4..
│                  │                   │                   │  pnpm ga-gate     │  ..S87-WIRE       │  ..S144-PG8
│                  │                   │                   │  green            │  (15 sprints,     │  (Phase 4 → CDE
│  PHASE-1A/1B/    │  PHASE-2A/2B      │  PHASE-3A/3B/3C/  │                   │   ~7.5 mo,        │   /clash/MEP/
│  1C/1D           │                   │  3D               │                   │   2 engineers,    │   COBie/cert,
│                  │                   │                   │                   │   418 sub-phases) │   Phases 5–8 →
│                  │                   │                   │                   │                   │   4D/5D/LCA/
│                  │                   │                   │                   │                   │   cloud baked)
└──────────────────┴───────────────────┴───────────────────┴───────────────────┴───────────────────┴──────────────
PRYZM 1 ships at every step (strangler-fig — 02-ORCHESTRATION §1) ──────────────────► PRYZM 1 lights-out S84 D9 (G.32)
```

---

## §2  Pre-GA — the 12 quarters (S01 → S72, M1 → M36)

| Q | Months | Sprints | Phase | What lands | Exit gate |
|---|---|---|---|---|---|
| Q1 | M1–M3 | S01–S06 | **PHASE-1A — Skeleton rails** | composition root v0 · 5 ref Cmds (level/wall create/update/delete + transaction.commit) · OTel + perf budgets · `pnpm ga-gate` v0 · feature flags | K1A-1..3 green; load-bench baseline |
| Q2 | M4–M6 | S07–S12 | **PHASE-1B — Headless geometry + walls** | `packages/geometry-kernel` v1 · `produceWallGeometry()` pure · worker pool · scene-committer v0 · frame-scheduler v0 (ADR-023 single rAF) | walls render new path · ≥30% cold-load improvement |
| Q3 | M7–M9 | S13–S18 | **PHASE-1C — Persistence + sync** | `.pryzm` format v1 (ADR-004) · IndexedDB event log · Yjs CRDT bridge (ADR-002) · soft-locks (ADR-019) · sync-server alpha | medium fixture cold-load < 3 s |
| Q4 | M10–M12 | S19–S24 | **PHASE-1D — Bake worker + Alpha** | `apps/bake-worker` · R2 chunks (ADR-003) · 11-wave VI engine (ADR-015) · alpha onboarding · ADR-018 T1 cuts | **ALPHA gate** — 25 design-partner projects open daily |
| Q5 | M13–M15 | S25–S30 | **PHASE-2A — All element families part 1** | wall · slab · roof · beam · column (5/13) · type-catalog (ADR-017) · constraint solver scaffolding | 5/13 families parity-verified vs PRYZM 1 |
| Q6 | M16–M18 | S31–S33 | **PHASE-2A — All element families part 2** | door · window · stair · curtain-wall · ceiling · handrail · furniture (12/13) · multi-rep furniture (sofa case) | 12/13 ship; floor scaffolded at sub-phase **E.6.0** |
| Q6 | M16–M18 | S34–S36 | **PHASE-2B — IFC import + export** | `plugins/ifc-import` Tier-2 (read PSets) · `plugins/ifc-export` Tier-1 (write PSets) · ADR-008 round-trip | IFC import → export → import preserves all PSets |
| Q7 | M19–M21 | S37–S42 | **PHASE-3A — Drawing engine + AI L7.5** | `packages/drawing-primitives` (ADR-016) · `packages/ai-host` (ADR-014) · 5 AI plugins · approval queue · cost meter · BYOK (ADR-038) | AI propose-approve-apply round-trip; cost ≤ budget |
| Q8 | M22–M24 | S43–S48 | **PHASE-3A — Beta + soft-locks GA** | enterprise SSO/SCIM (ADR-021) · audit-log streaming · multi-region (ADR-037) · soft-lock GA · `apps/marketplace-*` v0 | **BETA gate** — 100 paying tenants, soft-locks zero data loss |
| Q9 | M25–M27 | S49–S54 | **PHASE-3B — PDF-to-BIM (the moat)** | `packages/pdf-to-bim` (SPEC-45 + ADR-029) · workflow-paged scope per ADR-018 T1.7 cut list | PDF round-trip on 10 fixture drawings |
| Q10 | M28–M30 | S55–S60 | **PHASE-3B — IFC4 cert + Component editor** | buildingSMART IFC4 cert prep (SPEC-40) · `apps/component-editor` quality gates · plan critique (SPEC-46) · generate-3 (SPEC-47) | family-editor-quality-gates green; cert dry run |
| Q11 | M31–M33 | S61–S66 | **PHASE-3C — Constraint solver + lifecycle** | `packages/constraint-solver` (SPEC-48 + ADR-024) · lifecycle subsystem (ADR-030) · schedule formulas full (SPEC-27) | constraints converge < 50 ms p95 medium scene |
| Q12 | M34–M36 | S67–S72 | **PHASE-3D — GA hardening** | enterprise hardening (SPEC-35) · WCAG AA pass (`packages/wcag-audit`) · docs site GA · pricing live · stakeholder review (SPEC-33) | **GA gate** — `pnpm ga-gate` green on all 12 checks |

**ADR-018 cut list** is the safety valve for Q1–Q12: T1.1..T1.8 may be cut at any phase gate to buy back a sprint. T1.7 (PDF-to-BIM expanded scope) and T1.8 (constraint solver hardening) each buy a full sprint of calendar.

---

## §3  Post-S72 wireup — bind the white UI to the new architecture

**Window**: M37–M40 (~7.5 months). **Sprints**: S73-WIRE → S87-WIRE. **Team**: 2 engineers. **Sub-phases**: 418 across 8 phases (A–H). Source of truth: 25 chunks under `phases/audits/PRYZM2-WIREUP-PLAN-S72/`.

| Phase | Sprints | Sub-phases | Theme | Chunk |
|---|---|---:|---|---|
| **A** | S73-WIRE | ~22 | Composition root + RuntimeBinding + 7 doc-PRs from chunk 25 | 14 |
| **B** | S74–S75-WIRE | ~38 (incl. B.6–B.10 from chunk 24) | Stores · view-state · selection · tools · monetization · import · rendering · export | 14, 24 |
| **C** | S76-WIRE | ~28 (incl. C.14 from chunk 24) | Command-bus binding · 264 handlers wired · plan-view binding | 15 |
| **D** | S77-WIRE | ~24 | Persistence client binding · sync-client binding · soft-locks live in UI | 15 |
| **E** | S78–S80-WIRE | ~64 (incl. E.6.0 floor, E.15–E.17 elements, E.6.0 from chunk 24) | All 13 element-family plugins bound to `src/ui/` panels | 16, 24 |
| **F** | S81-WIRE | ~36 | View · plan-view · section-view · selection · visibility (F.8 with 13 sub-phases) · AI plugins (F.7.*) | 17, 18 |
| **G** | S82–S84-WIRE | ~178 (incl. G.10–G.32 from chunks 24+25) | **Legacy deletion** — every `src/` folder removed in dependency order; PRYZM 1 lights-out S84 D9 (G.32) | 19, 24, 25 |
| **H** | S85–S87-WIRE | ~28 | Verification gates lock-in · `pnpm ga-gate` §23.x cross-doc invariants · vision conformance · hand-off | 19, 23 |

**Verification cadence** (chunk 23): every PR runs the full `pnpm ga-gate`; every sprint closes with a sprint demo + a chunk-21 reverse coverage update; every phase gate runs the full bench harness.

---

## §4  Post-GA roadmap — 12-BIM-2-AND-3 (M37 → M72)

**Runs in parallel** with the wireup track from M37 onward (chunk 25 §25.7 two-track sprint scheme).

| Phase | Months | Sprints | Theme | Specs · ADRs |
|---|---|---|---|---|
| **Phase 4** | M37–M40 | S73-PG4..S84-PG4 | CDE · clash · MEP · COBie · IFC4 cert delivery | SPEC-32, 36, 37, 38, 39, 40 · ADR-031..035 |
| **Phase 5** | M41–M48 | S85-PG5..S96-PG5 | Sheets / schedules 4D / 5D extensions · analysis bridges · sustainability LCA | SPEC-41, 42, 43 |
| **Phase 6** | M49–M56 | S97-PG6..S108-PG6 | Cloud baked rendering · multi-region GA · marketplace v2 | SPEC-44 |
| **Phase 7** | M57–M64 | S109-PG7..S132-PG7 | (reserved — SPEC-49 placeholder per `12-BIM-2-AND-3 §0`) | TBD |
| **Phase 8** | M65–M72 | S133-PG8..S144-PG8 | (reserved — SPEC-50 placeholder per `12-BIM-2-AND-3 §0`) | TBD |

---

## §5  ADR queue — 44 total (40 ratified + 4 pending author)

40 ratified on disk. The 4 pending must be authored before their sub-phase ships (chunks 24 + 25):

| # | Topic | Latest sprint | Default if not ratified |
|---|---|---|---|
| **041** | Portfolio aggregate placement (`src/portfolio/PortfolioSemanticGraph.ts` → which package) | S84 (G.17) | Stay in `apps/headless` (no-op safe) |
| **042** | `src/physics/` runtime vs dev-only | S84 (G.18 + G.28) | Mark dev-only; quarantine behind `__DEV__` flag |
| **043** | `src/utils/*` inline vs `packages/utils` | S84 (G.21–G.27) | Inline into consuming layer (no new package) |
| **044** | **Customer migration** (PRYZM 1 → PRYZM 2 path) | **S22 latest** (before any private-alpha announcement) | Opt-in, snapshot-only, read-only PRYZM 1 for 12 months |

---

## §6  SPEC ledger — 39 ratified + 1 special

```
SPEC-01..13   foundation                    ✓ all ratified
SPEC-14       (intentional reserve)
SPEC-15       deployment topology           ✓
SPEC-16..20   (intentional reserve)
SPEC-21       element creation protocol     ✓
SPEC-22..23   (intentional reserve)
SPEC-24       data store map                ✓
SPEC-25       (intentional reserve)
SPEC-26..31   pre-GA core                    ✓ all ratified
SPEC-32..40   Phase 4 (post-GA roadmap)      ✓ all ratified
SPEC-41..44   Phase 5–6                      ✓ all ratified
SPEC-45..48   PDF-to-BIM · plan critique · generate-3 · constraint solver  ✓
SPEC-49..50   reserved — Phase 7–8
SPEC-FAMILY-EDITOR.md                        ✓ (un-numbered)
```

---

## §7  Gap closure — 103 closed (running total)

| Source | Count | Closed |
|---|---:|---:|
| Original `GAP-REVIEW-2026-04-27.md` (§§1–§29 #27) | 85 | 85 |
| Chunk 24 folder-level cross-audit | 17 | 17 |
| Chunk 25 doc-level cross-audit | 1 | 1 |
| **Running total** | **103** | **103** |

Maintenance protocol (per `11-GAP-CLOSURE-PLAN §5`): one PR, one gap, one closure entry. No gap allowed to live only in someone's head.

---

## §8  Live verification — `pnpm ga-gate`

12 check groups; all must pass before any release tag is cut. Each maps to one of the 9 currently-running workflows or to a custom ESLint/bench script:

| Group | What it checks | Workflow / script |
|---|---|---|
| Layer boundaries | no upward imports | `eslint-plugin-boundaries` |
| No casts | 0 `(window as any)` in `src/ui/` | `pryzm-no-window-any` lint |
| One rAF | only frame-scheduler may call rAF | `pryzm-no-raf` lint |
| Renderer parity | visual diff < 1 px MSE | `apps/bench/visual.ts` |
| Load bench | 17 NFTs from `08-VISION §6` | `apps/bench/loadbench.ts` |
| Replay determinism | random Cmd seq → same state | `command-bus/__tests__/replay` |
| BCF round-trip | issue export → import preserves viewpoints | `bcf-round-trip` workflow |
| IFC export | Tier-1 PSet write | `ifc-export-tier1` workflow |
| IFC import | Tier-2 PSet read | `ifc-import-tier2` workflow |
| IFC inspector | PSet editor | `ifc-inspector-pset-editor` workflow |
| Persistence | snapshot + events idempotent | `pryzm-persistence` workflow |
| VI parity | 11-wave engine matches PRYZM 1 | `pryzm-vi-parity` workflow |
| Family editor | quality gates green | `family-editor-quality-gates` workflow |
| Rhino import | 3DM round-trip | `rhino-import-3dm` workflow |
| **Cross-doc invariants** (added by chunk 25 §25.8.3) | doc counts match disk; no SUPERSEDED ref; no duplicate breakdown; ADR ≥ 44 | new `§23.x` shell block in `pnpm ga-gate` |

---

## §9  Headcount + capacity (per `06 §3` and `10-MASTER §2`)

```
M1   ──────  M12  ──────  M24  ──────  M36   ──────  M40
1 founder    1 founder    1 founder    1 founder     1 founder
+ Replit     + 2 eng      + 4 eng      + 7 eng       + 7 eng
  Agent     (alpha)      (beta)        (GA)          (post-GA + wireup)
                                       + DevRel/PM   + 2 design partners liaison
                                       + design lead
                                       grows to 11 FTE
```

ADR-018 cut list owns the slip-risk: any phase gate may invoke T1.1..T1.8 cuts to preserve calendar.

---

## §10  How to use this doc

- **Founder daily**: scan §11 of [`PROCESS-TRACKER.md`](../03_STATUS/01-PROCESS-TRACKER.md) (the live status board), this doc §1 + §2 for context.
- **Engineer onboarding day 1**: read [`FINAL-ARCHITECTURE-AND-ORCHESTRATION.md`](../01_ARCHITECTURE/03-FINAL-MAP.md), then this doc §2 (current quarter only), then their phase doc under `phases/`.
- **At every sprint demo**: tick boxes in [`PROCESS-TRACKER.md`](../03_STATUS/01-PROCESS-TRACKER.md) §3.
- **At every phase gate**: full `pnpm ga-gate` + chunk 21 reverse coverage refresh + this doc §2 row checked off.
- **At every retro**: the single retro question — *"Is there a gap in the corpus that doesn't have a row in `11-GAP-CLOSURE-PLAN.md`?"*

---

## §11  Beyond PRYZM 3 — the PRYZM 4 arc (S88 → S155, ~31 months past convergence)

PRYZM 3 day 1 (~S87, M40) is the convergence endpoint of the wireup, not the end of the program. The from-zero next-generation product — **PRYZM 4** — adds three more stages:

| Stage | Sprints | Months | What it produces | Gate |
|---|---|---|---|---|
| **Σ — Production validation** | S88 → S99 | 6 | PRYZM 3 in production with ≥ 100 paying customers; SOC2 Type 1 attested; ≥ 5 third-party plugins; lessons-learned doc; 12 hard validation criteria green | Σ.exit decision: go for PRYZM 4 (Path A) or extend PRYZM 3 (Path B) or pivot (Path C) |
| **α — Design genesis** | S100 → S111 | 6 | Designer-led from-zero design system, voice/sketch/AR interaction patterns, visual identity refresh, locked Storybook | α.exit: design freeze ratified by founder + architect + designer + 5 customers |
| **β — Architecture genesis** | S106 → S117 | 6 (overlap with α) | 12 pillar ADRs + 12 tech ADRs + 20 SPECs (PR4-NNN), reference architecture, vertical slice in all four shells, plugin SDK v2 reference, AI substrate L0 reference | β.exit: architecture freeze + vertical slice ratified |
| **γ — Build** | S118 → S145 | 14 | 5 parallel tracks (Foundation, Plugins, Shells, AI, BIM-features); 12 first-party plugins; web + native + mobile + spatial shells; all BIM Phase 4–8 features from zero; weekly customer alpha builds | γ.exit: feature freeze; ≥ 200 benches green |
| **δ — Migration + GA** | S146 → S155 | 5 | PRYZM 3 → PRYZM 4 customer migration tool; 90-day dual-run; PRYZM 3 read-only mode; PRYZM 4 GA cutover; PRYZM 3 sunset | δ.exit: PRYZM 4 day 1 checklist all green; `pnpm pryzm-4-day-1` exits 0 |

**PRYZM 4 day 1 target: ~S155 (M77, year 7 from project start)**.

Full PRYZM 4 plan with 12 design pillars, 10 architecture pillars, sub-phase tables, headcount + runway, customer migration story, risk register, and acceptance checklist lives in [`PRYZM-4-NEXT-GEN-PLAN.md`](../../04_PRYZM4/PRYZM-4-NEXT-GEN-PLAN.md) under [`docs/03-execution/plans/`](../../04_PRYZM4/).
