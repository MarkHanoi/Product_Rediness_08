# PRYZM 3 — Convergence Plan

> **The one-way ratchet doc.** Defines the single point at which "PRYZM 1" and "PRYZM 2" stop being separate things and become one clean product called **PRYZM 3** — no legacy code, no dual architecture, no feature flag, no fallback, no "old vs new" anywhere in the codebase or docs. Just one product.
>
> **Status**: ratified 2026-04-29.
> **The endpoint**: PRYZM 3 = the white UI + the layered architecture + zero legacy + zero dual identity. Calendar target: **end of S87-WIRE (~M40)**.
> **Authority**: this doc is synthesis. Everything in `06-PRYZM-IDENTITY` (white UI immutable), `08-VISION` (8 P / 8 L+L7.5 / 10 D / NFTs), and the `.pryzm` format spec stays intact across the convergence — they describe what the *product* is, not what edition it is.
>
> **Companion docs**:
> - [`FINAL-ARCHITECTURE-AND-ORCHESTRATION.md`](../01_ARCHITECTURE/03-FINAL-MAP.md) — the architecture map of the endpoint.
> - [`SUMMARY-IMPLEMENTATION-PLAN.md`](02-SUMMARY.md) — the 12 quarters + post-S72 wireup that lead into the convergence.
> - [`PROCESS-TRACKER.md`](../03_STATUS/01-PROCESS-TRACKER.md) — daily live status (the convergence checklist of §6 below also lives there once we cross M37).
> - [`PRYZM-4-NEXT-GEN-PLAN.md`](../../04_PRYZM4/PRYZM-4-NEXT-GEN-PLAN.md) (in [`docs/03-execution/plans/`](../../04_PRYZM4/)) — **what comes after PRYZM 3**: the from-zero, designer-led, multi-shell, AI-as-substrate next-generation product. Builds on six months of PRYZM 3 production validation (Stage Σ) before any line of PRYZM 4 code is written. Calendar target PRYZM 4 GA: ~M77.

---

## §1  The dual reality today (S72 D0)

```
┌───────────────────────────────────────────────────────────────────────────┐
│                              ONE BROWSER PREVIEW                           │
│                                                                            │
│   ┌───────────────────────────────────────────────────────────────────┐   │
│   │  The white UI (src/ui/, 220 files)        ← what the user SEES    │   │
│   └────────────────────┬─────────────┬────────────────────────────────┘   │
│                        │             │                                     │
│                  ?pryzm2=1?      default                                   │
│                        ▼             ▼                                     │
│   ┌───────────────────────┐   ┌─────────────────────────────────────────┐ │
│   │  PRYZM 2 ARCHITECTURE │   │  PRYZM 1 LEGACY                         │ │
│   │  packages/ (44)       │   │  src/<35 other folders>                 │ │
│   │  plugins/  (38)       │   │  ~150K LOC of stores, AI, render,       │ │
│   │  apps/     (12)       │   │  rendering, tools, monetization,        │ │
│   │  layered, typed,      │   │  import, export, generative, cde,       │ │
│   │  composeRuntime()     │   │  portfolio, physics, geospatial, …      │ │
│   │  44 ADRs · 39 SPECs   │   │  769 (window as any) · 58 rAF owners    │ │
│   │  STILL BEING WIRED    │   │  STILL THE DEFAULT BACKEND              │ │
│   └───────────────────────┘   └─────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────────────────┘
```

This is the strangler-fig in motion. The user can flip a flag and try the new architecture, but the legacy is still there and still the default. **This is by design and it's what's protecting shipping at every step** — but it is also what makes "PRYZM 3" not yet exist.

---

## §2  PRYZM 3 defined (one paragraph + one boolean)

**PRYZM 3 is the single product that exists when all of these are simultaneously true**:

```
( legacy_src_folders == 1 )                       // only src/ui/ remains under src/
AND ( window_any_in_src_ui == 0 )                 // no untyped escape hatches
AND ( raf_owners_outside_frame_scheduler == 0 )   // single rAF owner
AND ( feature_flag_PRYZM_NEW_ARCH == "deleted" )  // no flag, no fallback path
AND ( default_runtime == composeRuntime() )       // single composition root
AND ( docs_reference_to_PRYZM_1_or_2 == 0 )       // historical-only mentions
AND ( pnpm ga-gate == "green" )                   // 12 verification groups pass
AND ( workflows_green == workflows_total )        // every CI workflow green
AND ( customer_migration_complete == true )       // ADR-044 fully executed
```

The **moment all nine become true at the same git SHA**, PRYZM 3 exists. The previous SHA was "PRYZM 1 + PRYZM 2 strangler-fig". This SHA is "PRYZM 3". The transition is atomic from the user's point of view: when they reload the preview, they're using PRYZM 3.

In one paragraph:
> **PRYZM 3 is the same white UI, the same `.pryzm` file format, the same 8 principles and 17 NFTs and 10 differentiators — but with the legacy code base, the dual-architecture flag, the "PRYZM 1 vs PRYZM 2" naming, and every reference to either edition completely removed. There is only one product, with one composition root, one rAF, one canvas, one event log, one CRDT, one persistence path, one runtime handle, and one folder under `src/` (`src/ui/`).**

---

## §3  The convergence map — S72 D0 to PRYZM 3 day 1

```
S72 D0 (TODAY)
│  44 packages · 38 plugins · 12 apps    ← PRYZM 2 architecture in place
│  src/ui/ (220 files) untouched          ← PRYZM 1 white UI immutable
│  src/<35 other folders>                 ← PRYZM 1 legacy backend (still default)
│  composeRuntime() not yet wired         ← coexists, behind ?pryzm2=1
│
▼ Author 4 missing ADRs (041–044) and ratify
S73-WIRE D1
│  7 doc-PRs land (chunk 25 §25.8.2)
│  Phase A entry gate: composeRuntime() composed for first time
│  Default runtime is STILL legacy; ?pryzm2=1 routes to composeRuntime()
│
▼ Phases A→B→C→D (S73→S77-WIRE — 5 sprints)
│  Stores · view-state · selection · tools · monetization · import · export · rendering
│  · command-bus (264 handlers) · persistence · sync · soft-locks
│  ALL bound through src/ui/ to packages/* via packages/ui/RuntimeBinding
│  AT END OF PHASE D: ?pryzm2=1 is the SUPERIOR experience; legacy still works
│
▼ Phase E (S78–S80-WIRE — 3 sprints)
│  All 13 element-family plugins bound (incl. plugins/floor scaffolded at E.6.0)
│  AT END OF PHASE E: feature parity reached. ?pryzm2=1 == legacy default visually.
│
▼ Phase F (S81-WIRE — 1 sprint)
│  View · plan-view · section-view · visibility (11 waves) · AI plugins L7.5
│  AT END OF PHASE F: feature parity + new capabilities (AI, visibility) only on new path
│
▼ Phase G (S82–S84-WIRE — 3 sprints) — THE BIG DELETE
│  S82-WIRE  default flips: composeRuntime() is now default. ?pryzm1=1 to fall back.
│  S83-WIRE  35 src/ folders deleted in dependency order (chunks 24 G.10–G.31)
│  S84-WIRE  D9 = G.32 = PRYZM 1 lights-out. ?pryzm1=1 fall-back deleted.
│  AT END OF PHASE G: src/ contains only src/ui/. legacy gone.
│
▼ Phase H (S85–S87-WIRE — 3 sprints) — THE LOCK-IN
│  Verification gates locked at error level (was warn).
│  Cross-doc invariants (chunk 25 §23.x) shipped in pnpm ga-gate.
│  Lint rules pryzm-no-window-any, pryzm-no-raf, pryzm-no-three-in-ui at error.
│  Feature flag PRYZM_NEW_ARCH deleted from packages/feature-flags.
│  Doc PRs from §4 below land (the rename).
│
▼ S87-WIRE D-last  ← THE CONVERGENCE
   PRYZM 3 day 1.
```

---

## §4  The big rename — what changes when PRYZM 3 begins

The convergence is not just code — it is also a clean-up of every name that implies "two editions". This sweep happens in **one sprint window (S87-WIRE)**, runs as a single multi-PR effort, and is gated by `pnpm ga-gate` showing green before the rename PRs are allowed to merge.

### §4.1  Folder renames

| From | To | Rationale |
|---|---|---|
| `docs/00_NEW_ARCHITECTURE/` | `docs/04-reference/architecture-detail/` | there is no longer an "old" architecture |
| `apps/editor/` | `apps/editor/` (kept — single product, no rename needed) | already neutral |
| `packages/legacy-shim/` | **deleted** (folder + all references) | legacy is gone; no shim needed |
| `src/ui/` | `src/ui/` (kept — the canonical UI) | preserved verbatim per `06-PRYZM-IDENTITY §1` |

### §4.2  String renames (sweep across all `.ts`, `.md`, `.json`, `.yaml`)

| From | To | Notes |
|---|---|---|
| `PRYZM 1` | `PRYZM` (or struck if context is historical) | remove edition number |
| `PRYZM 2` | `PRYZM` (or struck if context is historical) | remove edition number |
| `pryzm1`, `pryzm2` (identifiers) | `pryzm` | code-style sweep |
| `PRYZM_NEW_ARCH` (feature flag) | **deleted everywhere** | always-on, no flag |
| `?pryzm2=1`, `?pryzm1=1` (URL flags) | **deleted** (404) | router rejects unknown query keys post-rename |
| `LegacyXxx`, `OldXxx`, `Pryzm1Xxx` | **deleted with their owning code** | these classes are deleted in Phase G |
| references to `00_NEW_ARCHITECTURE` paths | rewrite to `architecture/` | done by sed sweep + manual review |

### §4.3  Doc-corpus renames

| File | New name | Why |
|---|---|---|
| `06-PRYZM-IDENTITY-AND-RECOUNT.md` | `01-IDENTITY.md` | drop the "recount" — there's nothing to recount once the editions collapse |
| `08-VISION.md` | `02-VISION.md` | renumber for the new corpus |
| `09-AS-IS-VS-TO-BE.md` | **archived** to `docs/archive/pryzm-1-to-2-transition/` | only useful as history once PRYZM 3 ships |
| `10-MASTER-IMPLEMENTATION-PLAN-36M.md` | **archived** | the 36-month plan completed; preserve as history |
| `12-BIM-2-AND-3-POST-GA-ROADMAP.md` | `03-ROADMAP.md` | renamed; this is just the roadmap now |
| `CONFLICT-ANALYSIS.md` | **archived** | all 11 §6 contradictions resolved by GA |
| `11-GAP-CLOSURE-PLAN.md` | `04-GAP-CLOSURE.md` | living document, but no edition prefix |
| `FINAL-ARCHITECTURE-AND-ORCHESTRATION.md` | `00-ARCHITECTURE.md` | becomes the day-one doc |
| `SUMMARY-IMPLEMENTATION-PLAN.md` | **archived** with `10-MASTER` | replaced by `03-ROADMAP.md` |
| `PROCESS-TRACKER.md` | `05-TRACKER.md` | living, but no edition prefix |
| `PRYZM-3-CONVERGENCE-PLAN.md` (this doc) | **archived** | the convergence is done; the doc is history |
| `phases/audits/PRYZM2-WIREUP-PLAN-S72/*` | `archive/wireup-2026/*` | the wireup is done; preserve as audit trail |

### §4.4  Code renames

| From | To | Where |
|---|---|---|
| `composeRuntime()` | `composeRuntime()` | kept — no rename needed |
| `PryzmRuntime` (handle type) | `PryzmRuntime` | kept |
| `bindRuntime(uiRoot, runtime)` | `bindRuntime(uiRoot, runtime)` | kept |
| Any class named `*V2`, `*New`, `*Modern` | strip the suffix | sweep |
| Any class named `*V1`, `*Legacy`, `*Old` | **deleted** with its source folder in Phase G | already covered |

After the rename, **`git grep -i 'pryzm 1\|pryzm 2\|pryzm1\|pryzm2\|legacy\|new arch'` returns 0 results** outside `docs/archive/`. That is the sweep's acceptance test.

---

## §5  What the user sees in preview at each milestone

This is the journey from the *user's* (not engineer's) point of view:

| Milestone | What the URL bar shows | What the screen shows | What changes vs the previous milestone |
|---|---|---|---|
| **Today (S72 D0)** | `/editor/<id>` | white UI, runs on PRYZM 1 legacy backend | (baseline) |
| **Today (S72 D0)** | `/editor/<id>?pryzm2=1` | white UI, runs on PRYZM 2 architecture (partial) | engineers can preview the new path |
| **End of Phase A (S73)** | `/editor/<id>` | unchanged (still PRYZM 1 backend) | composition root exists; UI is unaware |
| **End of Phase A (S73)** | `/editor/<id>?pryzm2=1` | white UI, basic flows work on PRYZM 2 | first taste of the new path |
| **End of Phase D (S77)** | `/editor/<id>?pryzm2=1` | white UI, all read paths + soft-locks + sync work | new path now better than legacy for read |
| **End of Phase E (S80)** | `/editor/<id>?pryzm2=1` | white UI, all 13 element families work | feature parity on the new path |
| **End of Phase F (S81)** | `/editor/<id>?pryzm2=1` | white UI + AI panels + visibility / view tools | AI L7.5 only available on new path |
| **Mid Phase G (S82)** | `/editor/<id>` (default flipped) | white UI, runs on PRYZM 2 by default. `?pryzm1=1` falls back. | **the default flips silently** — user sees nothing different unless they look at the URL |
| **End of Phase G (S84 D9 — G.32)** | `/editor/<id>` | white UI, runs on PRYZM 2. **`?pryzm1=1` returns 404.** | legacy gone from the bundle; bundle size drops materially |
| **End of Phase H (S87 D-last) — PRYZM 3 day 1** | `/editor/<id>` | white UI, runs on PRYZM 3 — the only path that exists. | **identical to the previous milestone visually**. Difference is internal: rename done, docs archived, lint rules at error, no flags exist. |

**The user's experience of the convergence is invisible.** That is the point. The white UI never changes. The product never breaks. The only things that change are inside the codebase and inside the docs corpus.

---

## §6  PRYZM 3 day 1 acceptance checklist (every box must be ticked)

This checklist runs as a single CI job (`pnpm pryzm-3-day-1`) in the S87-WIRE D-last PR. **No box may be skipped. No box may be deferred.** If any box fails, the rename PRs do not merge, and PRYZM 3 day 1 slips by one sprint.

### Code state

- [ ] `ls src/` returns exactly one entry: `ui`
- [ ] `rg -c '\(window as any\)' src/ui/` returns 0
- [ ] `rg -l 'requestAnimationFrame' packages/ apps/ plugins/ src/` returns exactly one file: `packages/frame-scheduler/src/Scheduler.ts`
- [ ] `rg -l 'PRYZM_NEW_ARCH' .` returns 0 outside `docs/archive/`
- [ ] `rg -l 'pryzm1\|pryzm2' . --ignore-case` returns 0 outside `docs/archive/`
- [ ] `ls packages/legacy-shim/ 2>/dev/null` returns "not found"
- [ ] Bundle size for `apps/editor` drops by ≥ 30% vs S82 (legacy gone from production bundle)

### Runtime state

- [ ] `composeRuntime()` is the single entry point used by every app (`apps/editor`, `apps/headless`, `apps/cli`, `apps/component-editor`)
- [ ] `PryzmRuntime` handle is the only thing `src/ui/` imports from outside `src/ui/`
- [ ] `?pryzm1=1` and `?pryzm2=1` URL flags both return 404
- [ ] On a hard reload of `/editor/<id>`, the preview renders identically to the S87-WIRE D-prev SHA (visual diff < 1 px MSE)

### Verification state

- [ ] `pnpm ga-gate` returns green on all 12 check groups
- [ ] All 9 + 2 workflows (`Start application`, `bcf-round-trip`, `family-editor-quality-gates`, `ifc-export-tier1`, `ifc-import-tier2`, `ifc-inspector-pset-editor`, `pryzm-persistence`, `pryzm-vi-parity`, `rhino-import-3dm`, plus the new `composition-root` and `cross-doc-invariants` from `PROCESS-TRACKER §6`) are green
- [ ] Lint rules `pryzm-no-window-any`, `pryzm-no-raf`, `pryzm-no-three-in-ui` are at **error** level (no warn allowed)
- [ ] `eslint-plugin-boundaries` reports zero upward imports
- [ ] §23.x cross-doc invariants block in `pnpm ga-gate` reports zero violations

### Doc corpus state

- [ ] `docs/00_NEW_ARCHITECTURE/` no longer exists; `docs/04-reference/architecture-detail/` does
- [ ] `docs/archive/pryzm-1-to-2-transition/` contains the archived `09-AS-IS-VS-TO-BE.md`, `10-MASTER`, `12-BIM-2-AND-3 §1.x` historical sections, `CONFLICT-ANALYSIS.md`, `SUMMARY-IMPLEMENTATION-PLAN.md`, `PRYZM-3-CONVERGENCE-PLAN.md` (this doc)
- [ ] `docs/archive/wireup-2026/` contains the 25 chunks from the wireup-plan audit folder
- [ ] `docs/04-reference/architecture-detail/` contains exactly: `00-ARCHITECTURE.md`, `01-IDENTITY.md`, `02-VISION.md`, `03-ROADMAP.md`, `04-GAP-CLOSURE.md`, `05-TRACKER.md`, plus `adrs/` and `specs/` subfolders
- [ ] All 44 ADRs (001..044) ratified and on disk
- [ ] All cross-references inside `docs/04-reference/architecture-detail/` resolve (no broken links)

### Customer state

- [ ] ADR-044 (customer migration) fully executed: every PRYZM 1 user has either migrated to PRYZM 3 or been notified of the read-only window per the ratified policy
- [ ] PRYZM 1 read-only access window opened (per the migration policy ratified in ADR-044)
- [ ] No open support ticket cites a regression vs the previous SHA
- [ ] Marketing site updated: no mention of "PRYZM 1" or "PRYZM 2" — only "PRYZM" (or whatever brand-side replacement applies)

---

## §7  The single command that proves PRYZM 3 exists

```bash
pnpm pryzm-3-day-1
```

This script (lives in `apps/bench/pryzm-3-day-1.ts` after the rename: `apps/bench/pryzm-day-1.ts`) runs every box from §6 above and prints **one** line:

```
✓ PRYZM 3 day 1 — all checks green at <git SHA> on <date>
```

…or, if anything fails:

```
✗ PRYZM 3 day 1 — N checks failed:
  - <failing check>
  - <failing check>
  …
  Convergence NOT reached. Re-run after fixes.
```

The S87-WIRE D-last PR cannot merge unless this script returns the green line. Once merged, the green-line output is committed to `docs/04-reference/architecture-detail/PRYZM-3-DAY-1-CERTIFICATE.md` as the historical proof.

---

## §8  Post-PRYZM-3 — what changes about how we work

After PRYZM 3 day 1, the following workflows simplify because the dual-edition complexity is gone:

| Concern | Before PRYZM 3 (today) | After PRYZM 3 |
|---|---|---|
| New feature lands in… | `packages/*` + plugin + new path · legacy left alone | the codebase (one place) |
| Verification | `pnpm ga-gate` + parity check (new vs legacy) | `pnpm ga-gate` only |
| Branching/feature flags | per-primitive `PRYZM_NEW_ARCH=…` | none for arch; only product feature flags |
| Onboarding doc | this whole folder + chunks 14–25 + audit trail | `docs/04-reference/architecture-detail/00-ARCHITECTURE.md` (day 1 read) |
| Founder daily | `PROCESS-TRACKER.md §1 + §11` | `docs/04-reference/architecture-detail/05-TRACKER.md` (renamed) |
| Roadmap | `12-BIM-2-AND-3-POST-GA-ROADMAP.md` (Phases 4–8) | `docs/04-reference/architecture-detail/03-ROADMAP.md` (continues Phases 4–8 unchanged) |
| Sprint cadence | dual-track `S<N>-WIRE` + `S<N>-PG4..PG8` | single `S<N>` from S88 onward |
| Plugin SDK story | "extend PRYZM 2" | "extend PRYZM" — marketplace ships unchanged plugins |

**The post-GA roadmap (`12-BIM-2-AND-3 §3..§7`, Phases 4 → 8, S73-PG4 → S144-PG8) continues uninterrupted across the convergence.** Phase 4 was already running in parallel with the wireup; Phase 5 keeps running on the day after PRYZM 3 day 1.

---

## §9  Quick-reference table — "where am I in the convergence?"

| If today's date is… | The current state is… | What the user sees | What the engineer does |
|---|---|---|---|
| Now (S72 D0) | Pre-convergence — pre-GA hardening + wireup planning | white UI on PRYZM 1 legacy default; `?pryzm2=1` opt-in | Author ADR-041..044; plan S73-WIRE D1 doc-PRs |
| S73-WIRE D1 → end of Phase D | Convergence in progress — Phase A→D | white UI on legacy default; `?pryzm2=1` increasingly rich | Wire stores · view-state · selection · commands · persistence · sync |
| End of Phase E (S80) | Feature parity reached on new path | white UI on legacy default; `?pryzm2=1` matches feature for feature | Wire all 13 element families |
| End of Phase F (S81) | New path superior (AI, visibility) | `?pryzm2=1` is the strictly better experience | Bind AI plugins, visibility waves, view plugins |
| Mid Phase G (S82) | **DEFAULT FLIPS** | white UI on PRYZM 2 default; `?pryzm1=1` falls back | Begin deleting `src/<35 folders>` per chunk 24 dependency order |
| End of Phase G (S84 D9 — G.32) | Legacy code gone from bundle | white UI on PRYZM 2; `?pryzm1=1` returns 404 | Lock lint rules at error; final folder deletions |
| End of Phase H (S87 D-last) | **PRYZM 3 day 1** | white UI on PRYZM 3 (looks identical) | Run `pnpm pryzm-3-day-1`; commit certificate |
| Day after PRYZM 3 | Single product, single name, clean codebase | white UI on PRYZM | Continue post-GA roadmap (Phase 5 onward) |

---

## §10  TL;DR — the user's mental model

1. **Today** you have one preview that runs the white UI on top of the *legacy* backend. There is a second backend (the new architecture) you can opt into with a URL flag, but it is not yet feature-complete.

2. **Over the next ~7.5 months** (wireup phases A → H, sprints S73-WIRE → S87-WIRE), the new backend is wired feature-by-feature behind the white UI. The white UI never changes. The user does not see the work happening.

3. **At the midpoint of Phase G (S82)**, the *default* silently flips: the new backend becomes the default, and the legacy backend becomes the opt-in. From the user's point of view, nothing visible changes.

4. **By the end of Phase G (S84 D9)**, the legacy code is physically deleted. The bundle shrinks by ~30%. The legacy URL flag returns 404. From the user's point of view, the page just loads faster.

5. **At the end of Phase H (S87 D-last)**, the cleanup PR sweep happens: docs renamed, "PRYZM 1" / "PRYZM 2" strings deleted, feature flag removed, ADR-044 customer migration completed. The acceptance checklist in §6 must all be ticked. The single command in §7 must return green.

6. **That moment is PRYZM 3 day 1.** From that day forward there is exactly one product, one codebase, one corpus, one composition root, one runtime, one preview. The previous editions exist only in `docs/archive/` as historical record.

7. **The post-GA roadmap (Phase 4 → Phase 8, S73-PG4 → S144-PG8) is unaffected by the convergence.** It continues in parallel and seamlessly across the boundary because it was always written against the new architecture.

That is the path from where we are to PRYZM 3.

---

## §11  What comes after PRYZM 3 — the PRYZM 4 arc

PRYZM 3 is **a foundation that proves the architecture concepts**. It is not the end-state product. The end-state product is **PRYZM 4** — designed-from-zero, multi-shell (web + native + mobile + spatial), AI-as-substrate, full BIM Phase 4–8 features, WCAG 2.2 AAA, sovereignty-first, no compromises and no patched-through-stages feel.

The bridge from PRYZM 3 day 1 to PRYZM 4 day 1 is a **31-month, three-stage arc**:

| Stage | Sprints | Months | Purpose |
|---|---|---|---|
| **Σ — Production validation** | S88 → S99 | 6 | Run PRYZM 3 in production with paying customers; prove the architecture works under real load; learn what customers actually need |
| **α + β — Design + architecture genesis** | S100 → S117 | 6 (overlapping) | Designer-led from-zero product design; architect-led from-zero technical design informed by Σ lessons |
| **γ + δ — Build + migration + GA** | S118 → S155 | 19 | Full from-zero implementation across 5 parallel tracks; PRYZM 3 → PRYZM 4 customer migration; PRYZM 3 read-only sunset |

PRYZM 4 day 1 calendar target: **~S155 (M77, year 7 from project start)**.

The full plan, including:
- The 12 production-validation criteria that gate Stage Σ.exit
- The 12 PRYZM 4 design pillars
- The 10 PRYZM 4 architecture pillars
- Sub-phases V.* (validation), α.* (design), β.* (architecture), γ.* (build), δ.* (migration)
- Headcount + runway + cost (~$5M, 7-person team at peak)
- Risk register (12 risks with mitigations)
- The PRYZM 3 → PRYZM 4 customer migration story (90-day dual-run + 12-month read-only PRYZM 3 sunset)
- The PRYZM 4 day 1 acceptance checklist
- The single command (`pnpm pryzm-4-day-1`) that proves PRYZM 4 exists

…lives in [`PRYZM-4-NEXT-GEN-PLAN.md`](../../04_PRYZM4/PRYZM-4-NEXT-GEN-PLAN.md) under [`docs/03-execution/plans/`](../../04_PRYZM4/).

PRYZM 3 is the foundation. PRYZM 4 is the product the founder set out to build.
