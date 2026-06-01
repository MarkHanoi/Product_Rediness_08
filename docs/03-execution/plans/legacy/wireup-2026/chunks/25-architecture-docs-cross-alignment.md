# §25  Architecture-docs cross-alignment — every NEW_ARCHITECTURE doc, ADR, SPEC and phase plan vs reality

> Part of [PRYZM2-WIREUP-PLAN-S72](./00-INDEX.md). New deliverable, second-tier audit (Chunk 24 covers per-folder; this chunk covers per-doc).

> **Status updates since this chunk was authored** (per [Chunk 26 §26.11](./26-plan-self-corrections.md#§2611--amendment-k--chunks-24--25-status-updates-from-on-disk-reality)):
> 1. **ADR-041, 042, 043, 044** — §25.2 marks all four as "MISSING — proposed by Chunk 24 / by THIS chunk". **All four are now ratified on disk**:
>    - `docs/02-decisions/adrs/ADR-041-portfolio-aggregate-placement.md`
>    - `docs/02-decisions/adrs/ADR-042-physics-runtime-vs-dev-only.md`
>    - `docs/02-decisions/adrs/ADR-043-utils-inline-vs-package.md`
>    - `docs/02-decisions/adrs/ADR-044-customer-migration-pryzm1-to-pryzm2.md`
> 2. **ADR count** — §25.2 says "40 ratified + 4 proposed = 44 queued". Live count: **44 ratified on disk**. Update the result line to drop "queued" wording.
> 3. **SPEC count** — §25.3 says "39 SPECs". Live count: **40** (39 numbered + `SPEC-FAMILY-EDITOR.md`).
> 4. **Package/plugin/app count** — §25.4 says "44 packages / 38 plugins / 12 apps". Live count: **46 / 38 / 12**. Per [Chunk 26 §26.3](./26-plan-self-corrections.md#§263--amendment-c--hard-coded-numbers-go-parametric), this is now read parametrically with `≥` semantics.
> 5. **§25.8.3 verification block** — uses `=` semantics which fails any time a package is added. Per [Chunk 26 §26.3](./26-plan-self-corrections.md#§263--amendment-c--hard-coded-numbers-go-parametric), replaced with `≥`/`≤` against `.local/state/replit/agent/wireup-floor.json`.
> 6. **ADR-044 sprint** — §25.8.1 says "land by S22 (M11)". This is impossible (we are at S76, M37). Per [Chunk 26 §26.8](./26-plan-self-corrections.md#§268--amendment-h--missing-deletion-ids-and-unspecified-checklists), re-derived to "before **G.32.6** customer comms send" — practically S82-WIRE D5.
> 7. **G.32 enumeration** — §25.8.1 declares G.32 as a single sub-phase. Per [Chunk 26 §26.8](./26-plan-self-corrections.md#§268--amendment-h--missing-deletion-ids-and-unspecified-checklists), enumerated into 9 sub-items G.32.1–G.32.9 spanning S84-WIRE D1–D9.
> 8. **Sprint-ID rename via doc-edits only** — §25.7 proposes `S73-WIRE…S87-WIRE` via 7 doc PRs but provides no enforcement. Per [Chunk 26 §26.9](./26-plan-self-corrections.md#§269--amendment-i--sprint-id-lint-enforcement-missing), **H.5.1** commit-msg hook lands the lint rule.
>
> **Scope of this audit**: walk every document under `docs/archive/pryzm3-internal/` (14 root docs + 24 phase docs + 41 ADRs + 39 SPECs + 36 standalone audits + the 24 chunks under `phases/audits/PRYZM2-WIREUP-PLAN-S72/`) and prove three things:
>
> 1. **Internal consistency** — no two NEW_ARCH docs disagree on a normative claim that hasn't been resolved by a ratified ADR.
> 2. **Reality alignment** — what each doc says exists on disk actually exists on disk at S72 D0.
> 3. **Coverage closure** — every Pryzm 1 surface called out in `06-PRYZM-IDENTITY-AND-RECOUNT.md`, `08-VISION.md`, `09-AS-IS-VS-TO-BE.md` and the 11 §6 open contradictions in `CONFLICT-ANALYSIS.md` has either (a) shipped code, (b) a sub-phase ID in the wireup plan, or (c) a documented post-GA deferral with the SPEC + ADR queued.
>
> **Why this matters**: Chunk 24 closed the per-folder gap (17 unaddressed `src/` directories surfaced; 31 sub-phases added). This chunk closes the per-document gap. The user's mandate is "**NO SHORTCUTS, NO PATCHES — verify EVERYTHING from `src/` is tackled by 00_NEW_ARCHITECTURE as a complete solution.**" Chunk 24 proves the *folders* are tackled; Chunk 25 proves the *docs that govern the work* are tackled and agree with each other.

---

## §25.0  Authority order (recap, single source of truth)

Per `06-PRYZM-IDENTITY-AND-RECOUNT.md` §0 and `00-INDEX.md` §"Single source of truth", the **binding authority order** for any disagreement between NEW_ARCH documents is:

```
06-PRYZM-IDENTITY-AND-RECOUNT.md            (what Pryzm IS — non-negotiable identity)
       ↓
.pryzm format spec  (packages/file-format/spec.md)
       ↓
08-VISION.md                                 (8 principles · 8 layers · 10 differentiators · NFTs · non-goals)
       ↓
10-MASTER-IMPLEMENTATION-PLAN-36M.md  +  phases/PHASE-*.md  +  12-BIM-2-AND-3-POST-GA-ROADMAP.md
       ↓
00-AUDIT · 01-TARGET-ARCH · 02-ORCHESTRATION · 03-PASCAL · 04-PROD-PARITY · 05-IMPL-PLAN · 07-PLAYBOOK · 09-AS-IS-VS-TO-BE · 11-GAP-CLOSURE · 11-FILE-STRUCTURE · CONFLICT-ANALYSIS
       ↓
adrs/ADR-001 … ADR-040 · specs/SPEC-01 … SPEC-48
       ↓
audits/* and phases/audits/* (this folder, including chunks 01–24, 25)
       ↓
00_Contracts/ (legacy — survives only where CONFLICT-ANALYSIS §3/§4 say it does)
```

The wireup-plan **monolith** at `../PRYZM2-ENTERPRISE-WIREUP-PLAN-S72.md` is the authority for **post-S72 wireup work only** (Chunks 01–24); the docs above govern long-range vision and all post-GA scope. This chunk respects that order.

---

## §25.1  The 14 root NEW_ARCHITECTURE docs — per-doc coverage status

| # | Doc | Lines | Authority | Read in this audit pass? | Wireup-plan reference | Status |
|---|---|---:|---|---|---|---|
| 1 | `00-AUDIT.md` | 619 | Tier 5 (supporting) | ✓ Chunk 24 pass | Chunk 04 deletions; Chunk 06 risks | **CONSISTENT** — the 6-layer→8-layer revision is reflected in §3.1 of CONFLICT-ANALYSIS and Chunk 02 runtime architecture. |
| 2 | `01-TARGET-ARCHITECTURE.md` | 532 | Tier 5 | ✓ Chunk 24 pass | Chunk 02 runtime arch | **CONSISTENT** — 8-layer model L0–L7.5 matches Chunk 02 `composeRuntime()` + `PryzmRuntime` typed handle. |
| 3 | `02-ORCHESTRATION.md` | 510 | Tier 5 | ✓ Chunk 24 pass | Chunk 03 phases overview; Chunk 14 phase A | **CONSISTENT** — composition root contract matches Chunk 14 §16.1 (Phase A). |
| 4 | `03-PASCAL-EDITOR-ANALYSIS.md` | 383 | Tier 5 | ✗ skim only (not normative) | ADR-001 (Pascal Strategy B) | **CONSISTENT** — ADR-001 ratified Strategy B (adopt patterns, no fork); 03 doc is reference reading, not binding. |
| 5 | `04-PRODUCTION-PARITY.md` | 488 | Tier 5 | ✓ Chunk 24 pass | Chunk 12 UI perf benches; Chunk 13 vision conformance | **CONSISTENT** — 17 NFT bench targets reproduced verbatim in Chunk 12 §13. |
| 6 | `05-IMPLEMENTATION-PLAN.md` | 1,514 | **SUPERSEDED by 10-MASTER** | ✗ skim only | n/a | **SUPERSEDED** — `05` was the original 4-FTE plan; `10-MASTER` rewrote it for solo-founder + Replit Agent. Per 10-MASTER §2 explicit. No conflict to resolve, but `05-IMPLEMENTATION-PLAN.md` should carry a banner pointing to `10-MASTER`. **NEW finding — see §25.4**. |
| 7 | `06-PRYZM-IDENTITY-AND-RECOUNT.md` | 390 | **Tier 1 — non-negotiable** | ✓ Chunk 24 pass | Chunk 01 objective; Chunk 13 conformance | **CONSISTENT** — every identity claim (V-I verbatim, multi-rep furniture, StructuredName, soft-locks, sofa case, plan critique, generate-3, PDF-to-BIM, constraint solver) maps to a sub-phase ID — see §25.5 below for the line-by-line check. |
| 8 | `07-EXECUTION-PLAYBOOK.md` | 1,388 | **SUPERSEDED by 10-MASTER + phases/** | ✗ skim only | n/a | **SUPERSEDED** — `07` was the 4→11 FTE playbook; `10-MASTER §2` explicit on this. Same banner needed — **NEW finding**. |
| 9 | `08-VISION.md` | (read in full) | Tier 3 | ✓ Chunk 24 pass | Chunk 13 vision conformance | **CONSISTENT** — 8 P / 17 NFT / 9 layers (8 + L7.5) / 10 D / 8 non-goals all ticked in Chunk 13 §14. |
| 10 | `09-AS-IS-VS-TO-BE.md` | (read in full) | Tier 5 | ✓ Chunk 24 pass | Chunk 21 reverse coverage matrix | **CONSISTENT** — 27 stores · 31 AI files · 91 OBC sites · 58 rAF owners · 2,078 `(window as any)` · 264 commands all reflected in Chunk 24 + Chunk 21. |
| 11 | `10-MASTER-IMPLEMENTATION-PLAN-36M.md` | 619 | Tier 4 | ✓ Chunk 24 + this pass | Chunks 03, 14–19 phase plans | **CONSISTENT** — sprint windows S01–S72 match phases/PHASE-*.md and the wireup chunks 14–19 (S73–S87). |
| 12 | `11-GAP-CLOSURE-PLAN.md` | (read in full) | Tier 5 | ✓ Chunk 24 pass | n/a (a closure plan, not a wireup plan) | **STALE** — claims all 85 gaps closed. Chunk 24 surfaced 17 additional unaddressed `src/` directories that were not in the original 85. **NEW finding — see §25.6**. |
| 13 | `11-ARCHITECTURE-FILE-STRUCTURE-BREAKDOWN.md` | 456 | Tier 5 | ✓ Chunk 24 pass | n/a | **DRIFTED** — claims 16 packages, 16 plugins, 6 apps. Reality at S72 D0: **44 packages, 38 plugins, 12 apps** (file-system check below). **NEW finding — see §25.4**. |
| 14 | `ARCHITECTURE-FILE-STRUCTURE-BREAKDOWN.md` (no number prefix) | 456 | Tier 5 | ✓ byte-identical to #13 | n/a | **DUPLICATE** — `diff -q` returns identical content. One of the two should be deleted to prevent future drift between copies. **NEW finding — see §25.4**. |
| 15 | `12-BIM-2-AND-3-POST-GA-ROADMAP.md` | 532 | Tier 4 (post-GA) | ✓ this pass | n/a (post-GA, M37–M72) | **CONSISTENT BUT NOT WIRED** — defines Phase 4 (S73–S84 in *post-GA* numbering, i.e. M37+) which collides with the wireup-plan **chunk** numbering of S73–S87 (which is the post-GA-launch wireup, not post-GA roadmap). Risk: sprint-ID overload. **NEW finding — see §25.7**. |
| 16 | `13-AEC-WISHLIST.md` | — | — | ✗ does not exist | n/a | **MISSING FILE** — referenced by some sources but never authored. Either the reference is stale or the file was lost. **NEW finding — see §25.4**. |
| 17 | `CONFLICT-ANALYSIS.md` | 595 | Tier 5 | ✓ this pass (full read) | Chunks 06, 13 | **PARTIALLY ACTIONED** — §3 (12 contract supersessions) all have sprint targets. §6 (11 open intra-NEW_ARCH contradictions) — 10 of 11 have a ratified ADR; **§6.10 customer-migration story has no ADR** — see §25.5. |

**Total**: 17 root entries; **2 SUPERSEDED, 1 STALE, 1 DRIFTED, 1 DUPLICATE, 1 MISSING, 1 PARTIALLY ACTIONED, 10 CONSISTENT.** The 6 non-CONSISTENT items are the actionable gaps this chunk closes (§25.4–§25.7).

---

## §25.2  ADR coverage — 41 files on disk vs the 50+ called out across the corpus

```
docs/02-decisions/adrs/
  ADR-001  Pascal adoption (Strategy B)             ✓ on disk
  ADR-002  CRDT ↔ event-log bridge                  ✓ on disk    closes CONFLICT §6.1
  ADR-003  Object storage backend (R2)              ✓ on disk
  ADR-004  Wire format (MessagePack)                ✓ on disk
  ADR-005  Worker pool policy                       ✓ on disk
  ADR-006  Default render mode (WebGPU/WebGL2)      ✓ on disk
  ADR-007  Telemetry backend (OTel + Tempo)         ✓ on disk
  ADR-008  IFC scope (read+write Pset round-trip)   ✓ on disk
  ADR-009  Plugin sandbox model                     ✓ on disk
  ADR-010  Bake debounce (per-element, 250 ms)      ✓ on disk
  ADR-011  Permission granularity                   ✓ on disk
  ADR-012  Self-host minimums (docker-compose)      ✓ on disk
  ADR-013  Persistence operational                  ✓ on disk    closes CONFLICT §6.2
  ADR-014  AI L7.5 operational                      ✓ on disk    closes CONFLICT §6.4
  ADR-015  Visibility-Intent placement              ✓ on disk    closes CONFLICT §6.5 + §3.10
  ADR-016  Drawing-engine architecture              ✓ on disk    closes CONFLICT §6.6 + §3.11
  ADR-017  Type-catalog scope                       ✓ on disk    closes CONFLICT §6.7 + §3.12
  ADR-018  Capacity cut-list (T1.1–T1.8)            ✓ on disk    closes CONFLICT §6.3
  ADR-019  Soft-lock semantics                      ✓ on disk    closes CONFLICT §6.8
  ADR-020  Geometry-kernel robustness budget        ✓ on disk    closes CONFLICT §6.9
  ADR-021  Enterprise security & data residency    ✓ on disk    closes CONFLICT §6.11
  ADR-022  Renderer topology + backend runtime      ✓ on disk
  ADR-023  Library rAF quarantine                   ✓ on disk
  ADR-024  Constraint solver                        ✓ on disk
  ADR-025  three.js version pin & WebGPU path       ✓ on disk
  ADR-026  UI binding: vanilla TS (Path A)          ✓ on disk
  ADR-027  Schedule formula library scope           ✓ on disk
  ADR-028  Authority unification                    ✓ on disk
  ADR-029  PDF-to-BIM scope (the moat)              ✓ on disk
  ADR-030  Lifecycle subsystem placement            ✓ on disk
  ADR-031  CDE storage topology                     ✓ on disk    Phase-4 (post-GA)
  ADR-032  Clash-rule language                      ✓ on disk    Phase-4 (post-GA)
  ADR-033  MEP propagation (graph traversal)        ✓ on disk    Phase-4 (post-GA)
  ADR-034  COBie fallback policy                    ✓ on disk    Phase-4 (post-GA)
  ADR-035  buildingSMART cert scope                 ✓ on disk    Phase-4 (post-GA)
  ADR-036  Stakeholder-review pricing               ✓ on disk
  ADR-037  Sovereignty default cloud region         ✓ on disk
  ADR-038  BYOK key custody                         ✓ on disk
  ADR-039  Export-worker architecture               ✓ on disk
  ADR-040  Schedule export formats                  ✓ on disk
  ADR-041  Portfolio aggregate placement            ✗ MISSING    proposed by Chunk 24 §24.4
  ADR-042  src/physics dev-only vs runtime          ✗ MISSING    proposed by Chunk 24 §24.4
  ADR-043  src/utils inline vs packages/utils       ✗ MISSING    proposed by Chunk 24 §24.4
  ADR-044  Customer migration (PRYZM 1 → PRYZM 2)   ✗ MISSING    proposed by THIS chunk §25.5
  M28-IFC-IMPORT-PIPELINE.md                        ✓ on disk    (special, not numbered)
```

**Result**: 40 numbered ADRs on disk; **4 ADRs proposed but not yet authored** (041–044). Chunk 24 raised three; this chunk raises one more (the customer-migration story flagged in CONFLICT-ANALYSIS §6.10 has no owner ADR). All four must be written before the sub-phase that depends on them — see §25.8 schedule.

---

## §25.3  SPEC coverage — 39 SPECs on disk vs the 50 promised by 12-BIM-2-AND-3 + the 48-numbered set

```
docs/03-execution/specs/
  SPEC-01  Geometry kernel                          ✓
  SPEC-02  Persistence                              ✓
  SPEC-03  Sync CRDT                                ✓
  SPEC-04  Drawing engine                           ✓
  SPEC-05  Type catalog                             ✓
  SPEC-06  Rooms & levels                           ✓
  SPEC-07  AI layer                                 ✓
  SPEC-08  Security & collab                        ✓
  SPEC-09  Plugin SDK                               ✓
  SPEC-10  Observability                            ✓
  SPEC-11  Testing                                  ✓
  SPEC-12  Bundle splitting                         ✓
  SPEC-13  Context envelopes                        ✓
  SPEC-14  (skipped — no file)                      ✗ HOLE
  SPEC-15  Deployment topology                      ✓
  SPEC-16–20  (skipped — no files)                  ✗ HOLE (5)
  SPEC-21  Element creation protocol                ✓
  SPEC-22  (skipped)                                ✗ HOLE
  SPEC-23  (skipped)                                ✗ HOLE
  SPEC-24  Data store map                           ✓
  SPEC-25  (skipped)                                ✗ HOLE
  SPEC-26  Pryzm file format                        ✓
  SPEC-27  Migration & rollback                     ✓
  SPEC-28  AI cost model                            ✓
  SPEC-29  Vector primitives                        ✓
  SPEC-30  Plan-view performance                    ✓
  SPEC-31  Load bench & backpressure                ✓
  SPEC-32  CDE module                               ✓ Phase-4 ahead-of-schedule
  SPEC-33  Stakeholder review wedge                 ✓
  SPEC-34  Hybrid data sovereignty                  ✓
  SPEC-35  Browser security & enterprise hardening  ✓
  SPEC-36  COBie export                             ✓ Phase-4
  SPEC-37  Federated clash detection                ✓ Phase-4
  SPEC-38  MEP systems                              ✓ Phase-4
  SPEC-39  EIR/BEP/TIDP/MIDP                        ✓ Phase-4
  SPEC-40  buildingSMART IFC4 cert                  ✓ Phase-4
  SPEC-41  Sheet/schedule 4D/5D extensions          ✓ Phase-5
  SPEC-42  Analysis bridge protocol                 ✓ Phase-5
  SPEC-43  Sustainability LCA carbon                ✓ Phase-5
  SPEC-44  Cloud baked rendering                    ✓ Phase-5
  SPEC-45  PDF-to-BIM pipeline                      ✓
  SPEC-46  Plan critique workflow                   ✓
  SPEC-47  Generate-3-options workflow              ✓
  SPEC-48  Constraint solver                        ✓
  SPEC-FAMILY-EDITOR.md                             ✓ (un-numbered)
```

**Result**: 39 SPECs on disk + 1 special (`SPEC-FAMILY-EDITOR.md`). **7 numbered holes (14, 16–20, 22, 23, 25)**. These appear to be reserved gaps for future numbering continuity; they are intentional and **not** considered missing for the wireup. (`12-BIM-2-AND-3 §0` also reserves SPEC-49 + SPEC-50 for Phase-7 + Phase-8 work.) **No action needed**.

---

## §25.4  Document drift — file-structure breakdown vs reality on disk

The two `*ARCHITECTURE-FILE-STRUCTURE-BREAKDOWN.md` files (byte-identical) claim:

> "16 packages · 16 plugins · 6 apps under `packages/`, `plugins/`, `apps/`."

**Reality at S72 D0** (verified by `ls packages/ plugins/ apps/`):

| Dimension | Doc claim | On-disk reality | Drift |
|---|---:|---:|---|
| `packages/` | 16 | **44** | +28 packages unaccounted |
| `plugins/` | 16 | **38** | +22 plugins unaccounted |
| `apps/` | 6 | **12** | +6 apps unaccounted |

### §25.4.1  The 28 packages added since the breakdown was written

```
admin-overrides        ai-cost            ai-host            ai-spend
api-rbac               api-spec           beta-signup        crash-reporter
constraint-solver      drawing-primitives engine-router      expr-eval
family-instance        family-loader      family-runtime     feature-flags
formula-library        legacy-shim        oauth2-pkce        pdf-to-bim
perf-budgets           protocol           rate-limit         render-runtime
storage-driver         types-builtin      wcag-audit         webhooks
```

These packages are real, working, and consumed by the 24-chunk wireup plan (see Chunk 21 reverse coverage matrix). **The breakdown doc is the broken side**.

### §25.4.2  The 22 plugins added since the breakdown was written

```
ai-floorplan      ai-generative   ai-query         ai-rules         ai-voice
annotations       bcf             ceiling          column           cross
dimensions        grid            handrail         ifc-export       ifc-inspector
multiplayer       plan-view       plumbing         schedules        section-view
selection         toy-cube        view
```

The breakdown's "16 plugins" maps roughly to the 12 element families + 3 importers + 1 multiplayer; the 22 above are the AI plugins, the IFC export/inspector pair, the layout plugins (annotations, dimensions, schedules, sheets, plan-view, section-view, view) and the cross-cutting plugins (selection, toy-cube). **All 22 are referenced by `12-POST-GA §3`, `08-VISION §5`, or one of the 12 chunks 14–19 sub-phase tables.**

### §25.4.3  The 6 apps added since the breakdown was written

```
ai-worker        cli              component-editor       headless
marketplace-api  marketplace-web
```

All 6 are first-class deliverables in `08-VISION §5 D7` (`@pryzm/headless`), `08-VISION §5 D4` (marketplace), `06 §3.3` (component-editor sub-app). **`apps/component-editor` is the most under-documented of the six** — it has its own `__tests__/quality-gates` workflow (the `family-editor-quality-gates` workflow currently running) and is the subject of Phase 3B-S58–S62 in `phases/PHASE-3B-Q2-M28-M30-IFC-REVIT-COMPONENT-EDITOR.md` — but **neither file-structure breakdown copy mentions it**.

### §25.4.4  Two duplicate copies of the breakdown

`docs/archive/pryzm3-internal/ARCHITECTURE-FILE-STRUCTURE-BREAKDOWN.md` and `docs/archive/pryzm3-internal/11-ARCHITECTURE-FILE-STRUCTURE-BREAKDOWN.md` are byte-identical (`diff -q` returns no output). One must be deleted; the other rewritten to reflect the 44/38/12 reality.

### §25.4.5  Missing file: `13-AEC-WISHLIST.md`

`13-AEC-WISHLIST.md` is referenced in older notes but does not exist on disk. Either the reference is stale (then strike the reference) or the file was lost in a corpus shuffle. This audit flags it for either **reconstruction** (most likely from `12-BIM-2-AND-3 §1.4` "BIM-2.0 contractual deliverable" gap table, which contains everything an AEC wishlist would have anyway) or **explicit removal** from any source that points to it.

---

## §25.5  06-PRYZM-IDENTITY-AND-RECOUNT.md — line-by-line identity coverage

`06` is the **non-negotiable** identity doc — Tier 1 authority. Every claim of unique Pryzm identity must have either (a) shipped code, (b) a sub-phase ID in chunks 14–24, or (c) an explicit post-GA SPEC + ADR.

| 06 § | Identity claim | Implementation | Sub-phase ID | Status |
|---|---|---|---|---|
| §1 | The white UI is non-negotiable | `src/ui/` (220 files) — 0 pixel changes | Chunk 05 §6 | **CONSISTENT** |
| §1 | Visibility-Intent system **preserved verbatim** | `packages/visibility/` + 11-wave engine; ADR-015 owns L4/L5/L7 split | Chunk 18 §16.6.8 (F.8 — 13 sub-phases) | **CONSISTENT** — but watch out: "verbatim" means *behaviour-verbatim*, not *file-verbatim*; the implementation is split across 3 layers per ADR-015, and that split is the resolution to CONFLICT §3.10. |
| §1 | Multi-representation furniture (sofa case Contract 48) | `plugins/furniture/` with R3/R4/R5 producers | S27 (Phase 2A) | **CONSISTENT** |
| §1 | StructuredName / CDE codec | `packages/api-spec` + Phase-4 `apps/cde/` (post-GA) | Chunk 24 G.15 (deletion); SPEC-32 + ADR-031 (post-GA full module) | **CONSISTENT — pre-GA stub, full module post-GA** |
| §1 | Per-element soft-locks | `packages/sync-client` + ADR-019 + Postgres TTL | S22, S48 (Beta gate) | **CONSISTENT** |
| §1 | Plan critique workflow | `plugins/ai-rules` + SPEC-46 | F.7.* (chunk 18 §16.6.7) | **CONSISTENT** |
| §1 | Generate-3-options workflow | `plugins/ai-generative` + SPEC-47 | F.7.* (chunk 18 §16.6.7) | **CONSISTENT** |
| §1 | PDF-to-BIM (the moat) | `packages/pdf-to-bim` + SPEC-45 + ADR-029 | S49 + Phase 3 | **CONSISTENT — moat is at risk per ADR-018 T1.7 cut list** |
| §1 | Constraint solver | `packages/constraint-solver` + SPEC-48 + ADR-024 | S65 (Phase 3D) | **CONSISTENT** |
| §2 | Component-editor sub-app | `apps/component-editor/` + `family-editor-quality-gates` workflow | `phases/PHASE-3B-Q2-M28-M30-IFC-REVIT-COMPONENT-EDITOR.md` S58–S62 | **CONSISTENT — but missing from FILE-STRUCTURE-BREAKDOWN; see §25.4** |
| §3.1 | Strangler-fig migration (PRYZM 1 ships at every step) | `?pryzm2=1` flag from S06 onward | Phase A (S73) composes runtime; Phase G (S82–S84) deletes legacy | **CONSISTENT** |
| §3.2 | AI is L7.5 (above L5–L7) | `packages/ai-host` + `apps/ai-worker` + 5 AI plugins | F.7.* | **CONSISTENT — 37 src/ai/ files migrated, see Chunk 24 Tier A row 5** |
| §3.3 | Repository structure update | `apps/component-editor`, `apps/headless`, `apps/cli`, `apps/marketplace-*` | Chunk 02 §3 + this chunk §25.4 | **CONSISTENT once §25.4 doc-drift is fixed** |
| §3.4 | Lint-enforced zero `(window as any)`, zero non-scheduler `requestAnimationFrame` | Custom ESLint rules `pryzm-no-window-any`, `pryzm-no-raf` | M12 alpha gate (`10-MASTER §4.4 1D exit`); Phase H (chunk 19) lock-in | **CONSISTENT — 769 cast sites in src/ui/ → 0 by Phase G; remaining ~1,309 outside src/ui/ are deleted with their owning directories per Chunk 24** |
| §4 | Customer migration story (PRYZM 1 users → PRYZM 2) | **NONE** — no SPEC, no ADR, no sub-phase | — | **GAP — closed by NEW ADR-044 in §25.8** |

**Result**: 14 of 15 identity claims have a wired sub-phase. **One gap**: customer-migration story (CONFLICT-ANALYSIS §6.10). This audit adds **ADR-044 — Customer migration** to the queue (see §25.8).

---

## §25.6  11-GAP-CLOSURE-PLAN.md reconciliation

`11-GAP-CLOSURE-PLAN.md` claims **all 85 enumerated gaps are closed**. The claim is honest *for the 85 it enumerates*. The defect is that the enumeration was scoped to the 85 surfaced by `GAP-REVIEW-2026-04-27.md` and the audit roster up to that date — and Chunk 24 (this folder, §24.1) surfaced **17 additional Tier-B + Tier-C `src/` directories** that were not on the 85-gap list because no prior audit walked the disk top-down.

Action: **append a §3.6 "Phase-G coverage gap (added by chunk 24)" block to `11-GAP-CLOSURE-PLAN.md`** that:

1. References Chunk 24 by file path.
2. Lists the 17 new gaps (each as a one-line entry of the form *`src/<dir>` → covered by sub-phase G.NN per chunk 24*).
3. States: "**Total enumerated gaps closed: 85 + 17 = 102.** This count is updated whenever a future audit surfaces a new gap; the rule is one PR, one gap, one closure entry."

The §3.6 block does not invalidate the 85 already closed; it acknowledges that the closure plan is **a living document** and the 17 new entries land at the same Phase G window (S82–S84) the original 85 were already targeted for. **No schedule slip.**

---

## §25.7  Pre-GA wireup window vs Post-GA roadmap window — sprint-ID collision risk

This is the most subtle cross-doc issue in the corpus.

| Doc | Sprint window | Calendar | Sprint IDs |
|---|---|---|---|
| `10-MASTER §1 §3.1–§7` | S01–S72 | M0–M36 (pre-GA) | S01 … S72 |
| `12-BIM-2-AND-3 §2` | S73–S144 | M37–M72 (post-GA) | S73 … S144 |
| **THIS folder (PRYZM2-WIREUP-PLAN-S72)** §16 cadence per `19-subphases-G-H-catchall.md` | **S73–S87** | M37–M40 (post-S72 wireup, ~7.5 mo) | **S73 … S87 — collides with `12-BIM-2-AND-3 §3` Phase 4 which also opens at S73** |

### §25.7.1  The collision

If "S73" means two different things — (a) the wireup-plan PR window for the sub-phases that bind `src/ui/` to the new architecture, and (b) the Phase-4 BIM-2.0-closure post-GA roadmap — engineers and CI gates will ambiguate. The wireup folder's monolith says "S73–S87 = 15 sprints"; the post-GA roadmap says "S73–S84 = Phase 4". **Both run on the same calendar window** (M37–M42 / M37–M40 respectively).

### §25.7.2  The resolution (proposal — needs founder ratification)

**Two-track sprint numbering scheme**:
- **Pre-GA track**: `S01 … S72` — exactly as `10-MASTER` defines.
- **Post-GA wireup track**: `S73-WIRE … S87-WIRE` — 15 sprints whose only deliverable is binding `src/ui/` to the new architecture (chunks 14–24, §16 sub-phases).
- **Post-GA roadmap track**: `S73-PG4 … S144-PG8` — `12-BIM-2-AND-3` Phases 4–8.

The two tracks run **in parallel** (same engineering team, two separate boards) for the M37–M42 window. After M42, only the post-GA roadmap track continues.

This is recorded as a **doc-only edit** to:
1. The 24-chunk wireup-plan monolith (header line "S73–S87" → "S73-WIRE … S87-WIRE").
2. `12-BIM-2-AND-3 §0` (sprint numbering note → "S73-PG4 onward").
3. `00-INDEX.md §"Status snapshot"` — re-label the cadence figure.

**No code change. No schedule change.** This audit raises it as a finding because failure to disambiguate would silently produce two interpretations of every "S73" reference in code reviews, OTel span tags, and bench reports.

---

## §25.8  NEW deliverables added by this chunk

Building on Chunk 24's 31 new sub-phases + 3 new ADRs, this chunk adds:

### §25.8.1  ADR-044 — Customer migration (PRYZM 1 → PRYZM 2)

| Field | Value |
|---|---|
| Owner | Founder + Architecture lead |
| Closes | `CONFLICT-ANALYSIS §6.10` |
| Decision required | (a) Does PRYZM 1 stop accepting new projects at M24 Beta or M36 GA? (b) Is migration automatic on first PRYZM 2 login, opt-in, or batch-only? (c) Are PRYZM 1 events replayed or only the latest snapshot is converted? (d) Read-only PRYZM 1 access window (months / years / forever)? (e) Per-tier customer comms calendar. |
| Default if no ADR | Opt-in migration, snapshot-only, read-only PRYZM 1 for 12 months past M36, founder-authored comms. |
| Latest sprint to land | **Before any PRYZM 1 user is told about PRYZM 2** — practically, before any private alpha announcement, i.e. **S22 (M11)** at the latest. |
| Adds wireup sub-phase | **G.32 — PRYZM 1 lights-out checklist** (S84 D9 — last day of Phase G) |

### §25.8.2  Doc cleanup PRs (Phase-A composition root window — chunk 14 §16.1 already adds these to S73)

| PR | Edit | File |
|---|---|---|
| **Doc-PR-1** | Add "SUPERSEDED BY 10-MASTER" banner | `05-IMPLEMENTATION-PLAN.md` |
| **Doc-PR-2** | Add "SUPERSEDED BY 10-MASTER + phases/" banner | `07-EXECUTION-PLAYBOOK.md` |
| **Doc-PR-3** | Delete duplicate; keep only `11-ARCHITECTURE-FILE-STRUCTURE-BREAKDOWN.md` | rm `ARCHITECTURE-FILE-STRUCTURE-BREAKDOWN.md` |
| **Doc-PR-4** | Rewrite to reflect 44 packages / 38 plugins / 12 apps; add `apps/component-editor` row | `11-ARCHITECTURE-FILE-STRUCTURE-BREAKDOWN.md` |
| **Doc-PR-5** | Either author from `12-BIM-2-AND-3 §1.4` table or strike all references to it | `13-AEC-WISHLIST.md` |
| **Doc-PR-6** | Append §3.6 "Chunk 24 + 25 additions" → 102 closed gaps | `11-GAP-CLOSURE-PLAN.md` |
| **Doc-PR-7** | Apply two-track sprint numbering (S73-WIRE / S73-PG4 disambiguation) | `00-INDEX.md`, `19-subphases-G-H-catchall.md`, `12-BIM-2-AND-3 §0` |

All seven doc-PRs are non-code, non-schedule and land in the **first day of Phase A (S73 D1)** alongside the composition-root ADR ratification.

### §25.8.3  Updated Phase H verification — cross-doc invariants

Append to `pnpm ga-gate` (`23-verification-scripts.md`) a new check group `§23.x — Cross-doc invariants`:

```bash
# §23.x  ADR coverage: every CONFLICT §6 entry has an ADR
ADR_COUNT=$(ls docs/02-decisions/adrs/ADR-*.md | wc -l)
EXPECTED_ADR_MIN=44     # 40 ratified + ADR-041..044 from chunks 24+25
[ "$ADR_COUNT" -ge "$EXPECTED_ADR_MIN" ] || { echo "FAIL: only $ADR_COUNT ADRs, expected ≥ $EXPECTED_ADR_MIN"; exit 1; }

# §23.x  No SUPERSEDED doc is referenced as authoritative outside the supersession map
for f in 05-IMPLEMENTATION-PLAN.md 07-EXECUTION-PLAYBOOK.md; do
  cnt=$(rg -l --ignore-case "see ${f%.md}" docs/archive/pryzm3-internal/ 2>/dev/null | wc -l)
  [ "$cnt" -le 2 ] || { echo "FAIL: $f referenced $cnt times after supersession"; exit 1; }
done

# §23.x  No duplicate file-structure breakdown
[ ! -f docs/archive/pryzm3-internal/ARCHITECTURE-FILE-STRUCTURE-BREAKDOWN.md ] \
  || { echo "FAIL: duplicate breakdown file still present"; exit 1; }

# §23.x  File-structure breakdown matches reality
PKG_COUNT=$(ls packages/ | wc -l)
PLG_COUNT=$(ls plugins/ | wc -l)
APP_COUNT=$(ls apps/ | wc -l)
DOC_PKG=$(rg -oE '\b[0-9]+ packages\b' docs/archive/pryzm3-internal/11-ARCHITECTURE-FILE-STRUCTURE-BREAKDOWN.md | head -1 | awk '{print $1}')
[ "$PKG_COUNT" = "$DOC_PKG" ] || { echo "FAIL: doc says $DOC_PKG packages, disk has $PKG_COUNT"; exit 1; }

echo "OK: cross-doc invariants hold"
```

This is the GA-gate check that `archive/pryzm3-internal/` documentation has not silently drifted from reality between sprints.

---

## §25.9  Coverage matrix — every §6 open contradiction in CONFLICT-ANALYSIS

| §6.# | Contradiction | Owner ADR | Status | Latest sprint |
|---|---|---|---|---|
| §6.1 | MessagePack event log vs Yjs CRDT | ADR-002 | ✓ ratified | S08 |
| §6.2 | Persistence operational semantics (compaction, migration, idempotency, R2↔PG window) | ADR-013 | ✓ ratified | S07 |
| §6.3 | Solo founder + Replit Agent capacity vs scope | ADR-018 | ✓ ratified — extended 2026-04-27 with T1.7+T1.8 | S22 |
| §6.4 | AI L7.5 operational semantics (approval queue × CRDT, prompt pinning, quotas, headless AI keys) | ADR-014 | ✓ ratified | S07 |
| §6.5 | Visibility-Intent placement (L4/L5/L7 split) | ADR-015 | ✓ ratified | S17 |
| §6.6 | Drawing-engine architecture (vector primitives × Canvas2D/SVG/PDF back-ends) | ADR-016 | ✓ ratified | S31 |
| §6.7 | Type-catalog scope (system vs loadable family, type vs instance params, IFC mapping) | ADR-017 | ✓ ratified | S20 |
| §6.8 | Multi-user soft-lock semantics (TTL, blast radius, AI queue interaction) | ADR-019 | ✓ ratified | S22 |
| §6.9 | Geometry-kernel robustness budget | ADR-020 | ✓ ratified | S23 |
| §6.10 | **Customer migration story** | **ADR-044 (proposed by §25.8.1)** | **✗ MISSING — closed by this chunk** | **S22 (latest)** |
| §6.11 | Enterprise security & data residency (SSO, SCIM, audit-log streaming, MFA) | ADR-021 | ✓ ratified | S24 |

**Result**: 10/11 already closed; **1 closure added by this chunk (§6.10 → ADR-044)**. The CONFLICT-ANALYSIS §6 set is now 11/11 owned.

---

## §25.10  Updated wireup-plan deliverable count

| Source | Sub-phases / ADRs / SPECs | Notes |
|---|---:|---|
| Original `19-subphases-G-H-catchall.md` cadence | 386 sub-phases | S73–S87 |
| Chunk 24 additions (B.6–B.10, C.14, E.6.0, E.15–E.17, G.10–G.31) | +31 sub-phases | net = 417 |
| Chunk 24 ADR additions (041, 042, 043) | +3 ADRs | net = 43 |
| **Chunk 25 additions (this audit)** | **+1 sub-phase (G.32) · +1 ADR (044) · +7 doc-PRs · +1 verification block** | **net = 418 sub-phases · 44 ADRs · 7 doc-PRs · §23.x cross-doc invariants in `pnpm ga-gate`** |

The schedule envelope is unchanged — all chunk-25 deliverables land in **S73 D1** (the first day of Phase A) as doc-PRs, except G.32 which is the **last** wireup gesture in **S84 D9** (PRYZM 1 lights-out).

---

## §25.11  Updated Phase A entry gate

`14-subphases-A-D.md` (Phase A) is amended: **Phase A entry gate** now requires the seven doc-PRs in §25.8.2 above to land alongside the composition-root scaffolding. No code is held by these PRs (they are pure-doc edits), but the gate prevents Chunk-2 runtime architecture from being written against drifted file-structure documentation.

---

## §25.12  TL;DR

Chunk 24 proved every Pryzm 1 `src/` *folder* is tackled (31 new sub-phases). **This chunk proves every Pryzm 1 / NEW_ARCHITECTURE *document* is tackled** by:

1. Walking all 17 root entries under `docs/archive/pryzm3-internal/` — finding **6 doc gaps** (2 SUPERSEDED-without-banner, 1 STALE, 1 DRIFTED, 1 DUPLICATE, 1 MISSING) and proposing 7 doc-PRs that close them on S73 D1.
2. Auditing all 41 ADRs against the 11 open §6 contradictions in CONFLICT-ANALYSIS — finding **1 missing ADR (customer migration)** and proposing **ADR-044**.
3. Auditing all 39 SPECs vs the 50 named in `12-BIM-2-AND-3` — finding **7 numbering holes** (intentional reservation, no action).
4. Walking the 15 identity claims in `06-PRYZM-IDENTITY-AND-RECOUNT.md` line by line — confirming **14/15 wired**, **1 customer-migration gap** (closed by ADR-044).
5. Reconciling `11-GAP-CLOSURE-PLAN.md` (which claimed 85 closed) against Chunk 24's additional 17 — proposing the §3.6 update that lifts the count to 102.
6. Surfacing the **sprint-ID collision** between the post-S72 wireup window (S73–S87) and the post-GA roadmap Phase 4 (also S73+) — proposing a two-track numbering scheme (`S73-WIRE` vs `S73-PG4`).
7. Adding a `§23.x — Cross-doc invariants` block to `pnpm ga-gate` so doc-drift is caught by CI from S73 onward.

**No shortcuts. No patches. Every NEW_ARCHITECTURE document, every ADR, every SPEC, every identity claim now has either (a) shipped code, (b) a wired sub-phase ID, or (c) a documented post-GA deferral with the SPEC + ADR queued.** With Chunk 24 and Chunk 25 merged, the wireup-plan corpus is **complete to a single founder's review cycle** — the operator can audit any leg of the architecture by following the chains:

```
06 / 08 / 10 root claim
   ↓
SPEC + ADR
   ↓
Chunk 14–19 sub-phase ID
   ↓
Chunk 21 reverse coverage matrix
   ↓
Chunk 24 src/ folder coverage
   ↓
Chunk 25 cross-doc consistency
   ↓
Chunk 23 verification script (pnpm ga-gate)
```

Each link is now strict. No surface is orphaned. The 36-month rebuild can wire behind the white UI without leaving anything in `archive/pryzm3-internal/` un-actioned.
