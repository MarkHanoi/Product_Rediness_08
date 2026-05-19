# PRYZM 2 — New Architecture

This folder contains the audit, vision, target architecture, As-Is/To-Be comparison and 36-month execution plan for rebuilding PRYZM as a layered, headless-first, streaming-capable, multi-user, AI-native, plugin-extensible BIM platform that beats Forma, Qonic, Motif and Pascal on every measured dimension.

> **Start here**: docs **08**, **09**, **10** are the binding documents (Apr 2026, post-final-decisions). 00–07 remain as the analytical backbone that produced them. If 08/09/10 conflict with 00–07, **08/09/10 win**.

## Read in order

### Decision-binding (read first)

8. **[08-VISION.md](../../00_VISION/02-VISION.md)** — **THE NORTH STAR**. The identity sentence, eight architectural principles (P1–P8), eight layers (L0–L7.5), ten differentiators (D1–D10), measurable non-functional targets (the contract numbers), non-goals, customer profiles, the discipline paragraph. Read weekly.
9. **[09-AS-IS-VS-TO-BE.md](../../00_VISION/03-AS-IS-VS-TO-BE.md)** — **THE COMPARISON**. Layer-by-layer As-Is vs To-Be. The 30 worst files transformation. The 264-command consolidation. The 2,078 `(window as any)` deletion plan. The 58 rAF owners → 1. The 91 OBC sites → ~25. **Plus the Forma / Qonic / Motif / Pascal competitive matrix (50 capabilities) and the Pascal threat assessment** ("Pascal scares me the most" — answered).
10. **[10-MASTER-IMPLEMENTATION-PLAN-36M.md](../../02_PLAN/01-MASTER-36M.md)** — **THE PLAN**. 72 two-week sprints across 36 months, 3 phases, 12 quarterly sub-phases. Calibrated for **solo founder + Replit Agent**, **Path A (vanilla TS)**, **all 10 D-points in scope**, **PRYZM 1 feature freeze**. Pre-flight (12 ADRs) → Phase 1 Foundation → Phase 2 Migration & Multi-User → Phase 3 Completion & GA. Sprint master table, kill-switches, risk register, retirement schedule.

### Analytical backbone (the documents that produced 08/09/10)

1. **[00-AUDIT.md](../superseded-audits/00-AUDIT.md)** — current-state ground truth. Six structural failure modes with file:line evidence.
2. **[01-TARGET-ARCHITECTURE.md](../../01_ARCHITECTURE/01-LAYERS-AND-PRINCIPLES.md)** — initial 7-layer sketch (now superseded by `08` §4 with L7.5 added).
3. **[02-ORCHESTRATION.md](02-ORCHESTRATION.md)** — high-level rollout (now superseded by `10`).
4. **[03-PASCAL-EDITOR-ANALYSIS.md](../../01_ARCHITECTURE/04-PASCAL-REFERENCE.md)** — Pascal as reference. Strategy B confirmed (`10` Pre-flight ADR-001).
5. **[04-PRODUCTION-PARITY.md](04-PRODUCTION-PARITY.md)** — initial Forma/Qonic/Motif matrix (now expanded to 50 capabilities + Pascal in `09` §8).
6. **[05-IMPLEMENTATION-PLAN.md](05-IMPLEMENTATION-PLAN.md)** — first 20-sprint plan (superseded by `10`'s 72 sprints, but TS interfaces and DB schema remain canonical reference).
7. **[06-PRYZM-IDENTITY-AND-RECOUNT.md](../../00_VISION/01-IDENTITY.md)** — the recount (390K LOC, 2,078 globals, etc.). Identity preserved in `08` §2.
8. **[07-EXECUTION-PLAYBOOK.md](07-EXECUTION-PLAYBOOK.md)** — first deep playbook for 4 → 11 FTE team. Replaced by `10` (calibrated for solo + Agent).

### Context

- **[Context.md](./Context.md)** — six conversation rounds (Ask 01 → Ask 06) and the answers that produced this entire document set.

## One-paragraph summary

PRYZM today is **390,412 lines of vanilla TypeScript across 1,300 files** — a Revit-class BIM authoring platform with 23 element families, full plan/section/sheet/schedule documentation, a 31-file AI subsystem, an 11-wave Visibility-Intent system, a parametric component editor, IFC import/export, and Stripe-backed billing — but it is fused: geometry is welded to THREE (372 import sites), persistence is a single JSON blob, the frame loop has 58 owners, 264 bespoke command classes leave no clean wire format for collaboration, and **2,078 `(window as any)` casts in 325 files are the actual cross-module wiring**. The target architecture splits the system into eight layers — Persistence → Stores → Command/Event Bus → Sync → Geometry Kernel → Render Runtime → Plugin Host → AI Operations → Presentation — with a pure, headless kernel that runs identically in browser workers, a Node bake service, and a Node AI worker. Projects load as a streamed event log plus per-level binary chunks; collaboration uses Yjs over WebSocket; the renderer is demand-driven with a single frame owner. Migration is a strangler-fig over **30–36 calendar months** for a team of 4 → 11 FTE, ending with `EngineBootstrap.ts`, the legacy serializer, all 264 command classes, and all 2,078 `(window as any)` sites deleted, and PRYZM established as **the open, web-native, AI-native, multi-user BIM authoring platform with desktop-CAD documentation parity, that anyone can self-host and anyone can extend**.

## Status

**Phase 1 is fully implemented per the 2026-04-27 re-audit** (see `phases/audits/`):
- 12 element families shipped (walls, slabs, doors, windows, roofs, curtain walls, columns, beams, grids, stairs, handrails, ceilings) — all 18 bench gates GREEN.
- 163 parity fixtures GREEN against PRYZM 1.
- `.pryzm` v1 round-tripping losslessly.
- `apps/bake-worker` operational; chunk re-bake < 1.5 s per element edit.
- `@pryzm/headless` published; Node-side wall+slab project end-to-end.

Phases 2 and 3 are in progress against `10-MASTER-IMPLEMENTATION-PLAN-36M.md` and the per-phase docs under `phases/`. The 30 strategic + gap-closure ADRs (§3.1 + §3.5 of the master plan) define every decision; the 30 SPECs define every contract.

**The `GAP-REVIEW-2026-04-27.md` corpus audit identified 9 missing SPECs and 8 missing ADRs**; all 17 documents are now in this folder, and `11-GAP-CLOSURE-PLAN.md` is the gap-to-doc index ("is this gap closed yet?").

## SPECs (binding contracts)

| # | Title | File | Closes |
|---|---|---|---|
| 01 | Persistence model | `specs/SPEC-01-PERSISTENCE.md` | original 12 |
| 02 | Bake worker contract | `specs/SPEC-02-BAKE-WORKER.md` | original 12 |
| 03 | CRDT collaboration | `specs/SPEC-03-CRDT.md` | original 12 |
| 04 | Plan view + Visibility-Intent | `specs/SPEC-04-PLAN-VIEW.md` | original 12 |
| 05 | Section view | `specs/SPEC-05-SECTION-VIEW.md` | original 12 |
| 06 | Sheet pipeline | `specs/SPEC-06-SHEETS.md` | original 12 |
| 07 | AI layer (L7.5) | `specs/SPEC-07-AI-LAYER.md` | original 12 |
| 08 | Security model | `specs/SPEC-08-SECURITY.md` | original 12 |
| 09 | Plugin SDK | `specs/SPEC-09-PLUGIN-SDK.md` | original 12 |
| 10 | IFC pipeline | `specs/SPEC-10-IFC.md` | original 12 |
| 11 | Visual-diff CI gates | `specs/SPEC-11-VISUAL-DIFF.md` | original 12 |
| 12 | Bundle splitting | `specs/SPEC-12-BUNDLE-SPLITTING.md` | original 12 |
| **13** | **Context envelopes** | `specs/SPEC-13-CONTEXT-ENVELOPES.md` | **gap review §6.2, §10** |
| **15** | **Deployment topology (Replit)** | `specs/SPEC-15-DEPLOYMENT-TOPOLOGY.md` | **gap review §13** |
| **21** | **Element creation protocol** | `specs/SPEC-21-ELEMENT-CREATION-PROTOCOL.md` | **gap review §10** |
| **24** | **Data store map** | `specs/SPEC-24-DATA-STORE-MAP.md` | **gap review §11** |
| **26** | **PRYZM file format `.pryzm` v1** | `specs/SPEC-26-PRYZM-FILE-FORMAT.md` | **gap review §12** |
| **27** | **Migration & rollback** | `specs/SPEC-27-MIGRATION-ROLLBACK.md` | **gap review §27** |
| **28** | **AI cost model** | `specs/SPEC-28-AI-COST-MODEL.md` | **gap review §15** |
| **29** | **Vector primitives + PDF backend** | `specs/SPEC-29-VECTOR-PRIMITIVES-PDF.md` | **gap review §22.4** |
| **30** | **Plan-view performance budget** | `specs/SPEC-30-PLAN-VIEW-PERF.md` | **gap review §22.3** |

(SPEC-31 PDF-to-BIM Pipeline lands at S50 per ADR-029.)

## ADRs (binding decisions)

The 12 Pre-flight ADRs (`ADR-001` … `ADR-012`) are listed in `10-MASTER-IMPLEMENTATION-PLAN-36M.md` §3.1; the 9 strategic ADRs (`ADR-013` … `ADR-021`) drove the broader architecture decisions; the **9 gap-closure ADRs added 2026-04-27 are below**:

| # | Title | File |
|---|---|---|
| **022** | Renderer topology + backend runtime | `adrs/ADR-022-renderer-topology-backend-runtime.md` |
| **023** | Library rAF quarantine | `adrs/ADR-023-library-raf-quarantine.md` |
| **025** | Three.js version pin & WebGPU path | `adrs/ADR-025-three-js-pin.md` |
| **026** | UI binding: vanilla TS | `adrs/ADR-026-ui-binding-vanilla-ts.md` |
| **027** | Schedule formula library scope | `adrs/ADR-027-schedule-formula-library.md` |
| **028** | Authority unification | `adrs/ADR-028-authority-unification.md` |
| **029** | PDF-to-BIM scope (the moat) | `adrs/ADR-029-pdf-to-bim-scope.md` |
| **030** | Lifecycle subsystem placement | `adrs/ADR-030-lifecycle-subsystem-placement.md` |

ADR-018 (capacity cut list) was extended at the same time with two new Tier-1 cuttable items (T1.7 PDF-to-BIM tier degradation; T1.8 schedule formula library reduction).

## Quick navigation by question

| Question | Document |
|---|---|
| **What IS PRYZM and what must it BECOME?** | **`06-PRYZM-IDENTITY-AND-RECOUNT.md`** |
| **How do we actually execute, every step?** | **`07-EXECUTION-PLAYBOOK.md`** |
| What are the real numbers (LOC, file counts, debt sites)? | `06` §1 |
| What are the 10 differentiators we lead on? | `06` §2.4 |
| What is the honest timeline? | `06` §4 (30–36 months) |
| What's the 36-month roadmap? | `07` §2 |
| How does each of the 30+ subdomains migrate? | `07` §6 |
| What does each of the 30 worst files become? | `07` §7 |
| How do we delete the 2,078 `(window as any)` casts? | `07` §8 |
| How do we collapse 264 commands to ~110 handlers? | `07` §9 |
| How do we migrate vanilla TS to React without breaking everything? | `07` §10 |
| How does the AI subsystem (D2) become a moat, not a millstone? | `07` §11 |
| How does the documentation pipeline (D8) survive the migration? | `07` §12 |
| When do we pivot? | `07` §16 |
| Why does PRYZM need a rewrite at all? | `00-AUDIT.md` |
| What does the architecture look like in detail? | `01-TARGET-ARCHITECTURE.md` |
| What features must we ship to be production-ready? | `04-PRODUCTION-PARITY.md` |
| What do we copy from Pascal? | `03-PASCAL-EDITOR-ANALYSIS.md` |
| What's the high-level rollout sequence? | `02-ORCHESTRATION.md` |
| Concrete TypeScript interfaces per layer? | `05-IMPLEMENTATION-PLAN.md` §4 |
| What does a wall look like in the new architecture, end to end? | `05-IMPLEMENTATION-PLAN.md` §13 |
| What decisions must we make before starting? | `05-IMPLEMENTATION-PLAN.md` §17 (12 ADRs) |
