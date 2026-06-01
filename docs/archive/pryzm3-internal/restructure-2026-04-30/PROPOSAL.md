# PRYZM 3 — Doc Corpus Restructure Proposal

> **Date**: 2026-04-30
> **Status**: PROPOSED — awaiting founder approval
> **Author**: Architect-pass on a 226-file folder
> **Acceptance test**: after restructure, a new engineer can read **5 documents in 90 minutes** and understand vision + architecture + plan + current state, without ever opening an audit, a chunk, or an archive.

---

## §0 — What this doc is and isn't

This is a proposal to **re-shape `docs/archive/pryzm3-internal/`**. It does **not** rewrite the strategic content. `08-VISION.md`, `06-IDENTITY-AND-RECOUNT.md` and `09-AS-IS-VS-TO-BE.md` are excellent and stay verbatim — they're just renumbered and moved.

This doc lists the moves, deletions, dedups, and the 5 new canonical documents I'll write after the restructure. **No file moves until you say yes.**

---

## §1 — The brutal classification of what's actually in there

226 markdown files. Real coherent strategic content fits in ~12 files. The rest is overlap, audit-on-audit, or shrapnel from chasing discrepancies with new documents instead of updating canonical ones.

| Category | # files | Verdict |
|---|---:|---|
| **Canonical strategy** (vision, identity, as-is/to-be) | 3 | Excellent. Keep verbatim, renumber. |
| **Architecture maps** (target, file-structure, final) | 3 | Three views of the same thing. **Merge into one.** |
| **Master plans** (05, 10, 29, SUMMARY, CONVERGENCE, FINAL) | 6 | **Five too many.** Pick one, archive four, keep convergence as appendix. |
| **Phase plans** (1A–1D, 2A–2D, 3A–3D, 4) | 22 | Mostly clean, but Phase-3A/3B/3C each have 2–3 docs covering same milestone — **dedup**. |
| **ADRs** (numbered 001–044 + M28) | 45 | Clean. Leave alone. |
| **SPECs** (01–48 + FAMILY-EDITOR) | 40 | Clean. Leave alone. |
| **Phase audits** (PHASE-1-AUDIT, PHASE-1-CLOSE, PHASE-1-FULL, PHASE-1-RE-AUDIT, PHASE-1-CODE-VS-SPEC, PHASE-1-DRIFT-CLOSEOUT, …) | **48** | **17 Phase-1 docs. 8 Phase-2 docs. 5 Phase-3D per-sprint docs.** Each represents a separate moment of "we discovered a gap, wrote an audit". **Archive all but the latest one per phase.** |
| **Wireup monolith + slices + reconciliation + code-verified audit + missing-items audit** | 38 | The S72 wireup has been written, sliced into 28, reconciled in 8, code-verified once, and "missing-items" audited — for **the same body of work**. **Keep one canonical, archive the rest as audit trail.** |
| **Literal duplicate files** | 4 pairs | `CONFLICT-ANALYSIS.md`, `Context.md`, `IFC-COMPETITIVE-COMPARISON.md`, `M28-IFC-IMPORT-PIPELINE.md` exist in two folders each. **Pick one location, delete the other.** |
| **Numbering collisions** | 2 files | Two files numbered `11-`. **Renumber.** |
| **Misc shrapnel** (`error.md` chat snippet, `pryzm2.md` random naming break, `_TEMPLATE.md`, amendment notes from 04-27) | 6 | **Archive or delete.** |

---

## §2 — Why the current structure paralyzes work

Three concrete failure modes I hit while reading:

1. **No single answer to "where am I?"** `PROCESS-TRACKER.md` is honest (Phase B 1/40, etc.) but its own §1 claims "9/9 workflows green" while three workflows are actually red. Because the live status sits next to a dozen older "Phase X audit" documents, drift between them is normalized.
2. **No single answer to "what's the plan?"** `10-MASTER` says one thing for 36 months. `29-linear-execution-plan` (written today) says another. `SUMMARY-IMPLEMENTATION-PLAN` says a third. `PRYZM-3-CONVERGENCE-PLAN` says a fourth. They mostly agree, but they do not say so explicitly, and a reader has to triangulate.
3. **Audit inflation**. Whenever someone caught a discrepancy, they wrote a new audit. We now have 13+ documents about Phase 1, none of which is the canonical statement of "Phase 1 is done / not done as of date X". The 2,304-LOC `PRYZM2-ENTERPRISE-WIREUP-PLAN-S72.md` was sliced into 28 chunks; then a `PHASES-A-F-RECONCILIATION-2026-04-29` folder was added with 8 more chunks reconciling the slices; then a `PHASES-A-F-CODE-VERIFIED-AUDIT-2026-04-29.md` was added on top; then a `0_PHASES-A-F-MISSING-ITEMS-2026-04-29.md` (2,220 LOC) was added on top of *that*. Five layers, all about the same Phase A–F work.

The CONVERGENCE plan already proposes a future restructure (§4.1, §4.3, §6) — but defers it to S87-WIRE D-last (~M40, **7+ months out**). My proposal is **do it now**: the dedup and renumber don't depend on code completion, and the chaos is paralyzing the actual work today.

---

## §3 — Target structure

```
docs/archive/pryzm3-internal/
│
├── README.md                              # NEW: 1 page, the index. "Read these 5 docs in this order."
│
├── 00_VISION/                             # The strategic anchor. Read first. Read weekly.
│   ├── 01-IDENTITY.md                     # ← was 06-PRYZM-IDENTITY-AND-RECOUNT.md
│   ├── 02-VISION.md                       # ← was 08-VISION.md   (the north star)
│   └── 03-AS-IS-VS-TO-BE.md               # ← was 09-AS-IS-VS-TO-BE.md
│
├── 01_ARCHITECTURE/                       # The shape. One canonical file + supporting maps.
│   ├── 00-ARCHITECTURE.md                 # NEW: the unified canonical architecture (I write it)
│   ├── 01-LAYERS-AND-PRINCIPLES.md        # ← was 01-TARGET-ARCHITECTURE.md
│   ├── 02-FILE-STRUCTURE.md               # ← was 11-ARCHITECTURE-FILE-STRUCTURE-BREAKDOWN.md
│   ├── 03-FINAL-MAP.md                    # ← was FINAL-ARCHITECTURE-AND-ORCHESTRATION.md
│   └── 04-PASCAL-REFERENCE.md             # ← was 03-PASCAL-EDITOR-ANALYSIS.md (input only)
│
├── 02_PLAN/                               # The ONE plan. Everything else is appendix or archive.
│   ├── 00-IMPLEMENTATION-PLAN.md          # NEW: the unified implementation plan I write (the deliverable)
│   ├── 01-MASTER-36M.md                   # ← was 10-MASTER-IMPLEMENTATION-PLAN-36M.md
│   ├── 02-SUMMARY.md                      # ← was SUMMARY-IMPLEMENTATION-PLAN.md
│   ├── 03-CONVERGENCE.md                  # ← was PRYZM-3-CONVERGENCE-PLAN.md (the endpoint definition)
│   ├── 04-LINEAR-EXECUTION.md             # ← was 29-linear-execution-plan-2026-04-30.md
│   ├── 05-POST-GA-ROADMAP.md              # ← was 12-BIM-2-AND-3-POST-GA-ROADMAP.md
│   ├── 06-AEC-WISHLIST.md                 # ← was 13-BIM-2-AND-3-AEC-WISHLIST-SUPPLEMENT.md
│   └── 07-GAP-CLOSURE.md                  # ← was 11-GAP-CLOSURE-PLAN.md
│
├── 03_STATUS/                             # The live, moving documents. Single source of truth.
│   ├── 00-CURRENT-STATE-AUDIT.md          # NEW: my brutal audit + this proposal's findings (the deliverable)
│   ├── 01-PROCESS-TRACKER.md              # ← was PROCESS-TRACKER.md
│   └── 02-LATEST-PHASES-AUDIT.md          # ← was 0_PHASES-A-F-MISSING-ITEMS-2026-04-29.md (the most recent deep audit)
│
├── adrs/                                  # 45 ADRs — UNCHANGED in place
│   └── ADR-001…ADR-044, M28-IFC-IMPORT-PIPELINE.md
│
├── specs/                                 # 40 SPECs — UNCHANGED in place
│   └── SPEC-01…SPEC-48, SPEC-FAMILY-EDITOR.md
│
├── phases/                                # Phase plans only. NO audits, NO duplicates.
│   ├── PHASE-1/
│   │   ├── 00-FOUNDATION.md               # ← was PHASE-1-FOUNDATION-M1-M12.md
│   │   ├── 1A-SKELETON-RAILS.md
│   │   ├── 1B-WALL-END-TO-END.md
│   │   ├── 1C-ELEMENT-FAMILIES.md
│   │   └── 1D-BAKE-PRYZM-ALPHA.md
│   ├── PHASE-2/
│   │   ├── 00-MIGRATION-MULTIUSER.md
│   │   ├── 2A-NON-ELEMENT-COMPLETION.md
│   │   ├── 2B-PLAN-VIEW.md                # merged with PHASE-2B-SUPPLEMENT-AUTODIM-VIEWTEMPLATE.md as §X.4
│   │   ├── 2C-SHEETS-SCHEDULES.md
│   │   └── 2D-SYNC-AWARENESS-BETA.md
│   ├── PHASE-3/
│   │   ├── 00-COMPLETION-GA.md
│   │   ├── 3A-AI-VISIBILITY.md            # ← merged from -COMPLETE.md + -VI-AI-ELEMENT-CREATOR.md (dedup)
│   │   ├── 3B-IFC-COMPONENT-EDITOR.md     # ← merged from -IFC-REVIT- + -PLUGINS-IFC-DXF-RHINO + -FAMILY-CREATOR-REWRITE
│   │   ├── 3C-PLUGIN-SDK-MARKETPLACE.md   # ← merged from -PLUGIN-SDK- + -SDK-MARKETPLACE-PUBLIC-API
│   │   └── 3D-HARDENING-GA.md
│   └── PHASE-4-POST-GA/
│       └── 4-BIM2-CLOSURE.md
│
├── wireup-S72/                            # The post-S72 wireup. ONE folder. No audits-of-audits.
│   ├── 00-PLAN.md                         # ← was PRYZM2-ENTERPRISE-WIREUP-PLAN-S72.md (the canonical 2304-LOC monolith)
│   ├── 01-INDEX.md                        # ← was 00-INDEX.md inside chunks
│   ├── chunks/                            # 28 sliced chunks — UNCHANGED, kept as the working document set
│   │   └── 00-WhereWeAreNow.md … 28-commandManager-execute-migration.md
│   └── reconciliation/                    # 8-chunk reconciliation + code-verified audit
│       └── PHASES-A-F-RECONCILIATION-2026-04-29/* (preserved verbatim)
│
├── runbooks/                              # UNCHANGED
│   └── DR-DRILL-RUNBOOK.md
│
└── archive/                               # Everything superseded — preserved, never deleted
    ├── superseded-plans/
    │   ├── 02-ORCHESTRATION.md            # superseded by 10
    │   ├── 04-PRODUCTION-PARITY.md        # superseded by 09 §8
    │   ├── 05-IMPLEMENTATION-PLAN.md      # superseded by 10
    │   └── 07-EXECUTION-PLAYBOOK.md       # superseded by 10
    ├── superseded-audits/
    │   ├── 00-AUDIT.md                    # superseded by 03_STATUS/00-CURRENT-STATE-AUDIT.md
    │   ├── GAP-REVIEW-2026-04-27.md
    │   ├── PACKAGE-CLASSIFICATION-2026-04-28.md
    │   ├── M24-PREVIEW-SELF-TEST-CHECKLIST.md
    │   ├── CONFLICT-ANALYSIS.md           # the one root copy (audits/ copy also moves here)
    │   ├── Context.md                     # same — pick one, archive
    │   ├── IFC-COMPETITIVE-COMPARISON.md
    │   └── (12 historical Phase-1 audits, 4 Phase-2 audits, 5 Phase-3D per-sprint audits)
    ├── superseded-amendments/
    │   ├── PHASES-AMENDMENT-2026-04-27-ROBUSTNESS.md
    │   ├── PHASES-UPDATE-PLAN-2026-04-27.md
    │   └── pryzm2.md
    └── shrapnel/
        ├── error.md                       # chat snippet that ended up in audits/
        └── _TEMPLATE.md
```

**Net effect**: 226 files → ~70 actively-used files in `docs/archive/pryzm3-internal/` (excluding ADRs/SPECs which stay at 85), plus ~50 in `archive/`. **Reader cognitive load drops from "228 files in one folder" to "5 docs in 90 minutes."**

---

## §4 — Dedup decisions (which file wins for each conflict)

| Conflict | Winner | Loser → moves to |
|---|---|---|
| `CONFLICT-ANALYSIS.md` (root) vs `audits/CONFLICT-ANALYSIS.md` | I'll diff and keep the newer; if identical, keep root | `archive/superseded-audits/` |
| `Context.md` (root) vs `audits/Context.md` | Same — diff, keep newer | `archive/superseded-audits/` |
| `IFC-COMPETITIVE-COMPARISON.md` (root) vs `audits/` | Same | `archive/superseded-audits/` |
| `M28-IFC-IMPORT-PIPELINE.md` (root) vs `adrs/` | **`adrs/` wins** (it's an ADR, that's its home) | Delete root copy after content-equality check |
| Two `11-` files | `11-ARCHITECTURE-FILE-STRUCTURE-BREAKDOWN.md` → `01_ARCHITECTURE/02-FILE-STRUCTURE.md`; `11-GAP-CLOSURE-PLAN.md` → `02_PLAN/07-GAP-CLOSURE.md` | Numbering collision dissolved |
| `PHASE-3A-Q1-M25-M27-AI-VISIBILITY-COMPLETE.md` vs `PHASE-3A-Q1-M25-M27-VI-AI-ELEMENT-CREATOR.md` | Merge — content overlaps | New: `phases/PHASE-3/3A-AI-VISIBILITY.md` |
| `PHASE-3B-Q2-M28-M30-IFC-REVIT-COMPONENT-EDITOR.md` vs `PHASE-3B-Q2-M28-M30-PLUGINS-IFC-DXF-RHINO.md` vs `PHASE-3B-FAMILY-CREATOR-REWRITE-PLAN.md` | Merge — three views of Phase 3B | New: `phases/PHASE-3/3B-IFC-COMPONENT-EDITOR.md` |
| `PHASE-3C-Q3-M31-M33-PLUGIN-SDK-MARKETPLACE-APIS.md` vs `PHASE-3C-Q3-M31-M33-SDK-MARKETPLACE-PUBLIC-API.md` | Merge | New: `phases/PHASE-3/3C-PLUGIN-SDK-MARKETPLACE.md` |
| 17 Phase-1 audit/plan documents | Keep `PHASE-1-CODE-VS-SPEC-AUDIT-2026-04-28.md` (latest, most rigorous) as the canonical historical audit; archive the other 16 | `archive/superseded-audits/phase-1-audit-trail/` |
| 8 Phase-2 audit/plan documents | Keep `PHASE-2-CODE-VS-SPEC-AUDIT-2026-04-28.md` as canonical; archive 7 | `archive/superseded-audits/phase-2-audit-trail/` |
| 5 Phase-3D per-sprint audits | Keep `PHASE-3D-S72-M36-GA-LAUNCH-GATE-2026-04-29.md` as canonical (it's the GA gate); archive 4 | `archive/superseded-audits/phase-3d-per-sprint/` |
| `PRYZM2-ENTERPRISE-WIREUP-PLAN-S72.md` (2304 LOC monolith) vs 28 chunks vs 8 reconciliation chunks vs code-verified audit vs missing-items audit | **Monolith stays as `wireup-S72/00-PLAN.md`**; chunks stay in `wireup-S72/chunks/`; reconciliation + code-verified audit stay in `wireup-S72/reconciliation/`; missing-items audit promotes to `03_STATUS/02-LATEST-PHASES-AUDIT.md` (it's the freshest reality check, deserves top-level) | (no archive — all preserved in their cleaner home) |

---

## §5 — What I will write after the restructure (the deliverables)

Three new canonical documents, each replacing a category of overlapping older docs. I write these only **after** the restructure is approved and executed:

### 5.1 — `01_ARCHITECTURE/00-ARCHITECTURE.md` (the unified architecture)

**Replaces nothing**, **reconciles**: `01-TARGET-ARCHITECTURE`, `11-FILE-STRUCTURE`, `FINAL-ARCHITECTURE-AND-ORCHESTRATION`. ~600 LOC. Contents:

1. The 8 layers (L0–L7.5), the 8 principles (P1–P8), the 10 differentiators (D1–D10), the 17 NFTs — pulled from `02-VISION.md` and never restated, just cross-referenced.
2. The package/app/plugin map — 49 packages, 12 apps, 38 plugins — with one-line purpose per file. The single canonical layout.
3. The composition root contract — `composeRuntime()` signature, the 14-slot `PryzmRuntime` handle, what's typed and what's still `unknown`.
4. The cross-cutting wiring rules — frame scheduler is the only rAF, scene committer is the only THREE owner, etc. Each with its CI gate.
5. The boundary lint matrix — which layer can import which.

### 5.2 — `02_PLAN/00-IMPLEMENTATION-PLAN.md` (the one plan)

**Replaces nothing**, **reconciles**: `10-MASTER-36M`, `29-linear-execution`, `SUMMARY`, `PRYZM-3-CONVERGENCE`. ~800 LOC. Contents:

1. The reality (from `03_STATUS/00-CURRENT-STATE-AUDIT.md`): what's actually built vs claimed.
2. The 12 quarters (S01–S72) — quarter-by-quarter table from `10-MASTER` §3, with phase exit gates.
3. The wireup phases A–H (S73-WIRE → S87-WIRE) — sub-phase counts, the honest 31/207 status, the next gate.
4. The convergence point — when the 9 booleans of `PRYZM-3-CONVERGENCE-PLAN §2` simultaneously become true.
5. The post-GA roadmap (Phase 4 → 8) — preserved from `12-BIM-2-AND-3`.
6. **The discipline section** — the principles you must NOT violate while executing this plan, with explicit mention of: no `(window as any)` lazy-boots, no `WorkspaceMountBridge`-style legacy bridges resurrected behind new names, no out-of-order sub-phase promotions, no phase reclassifications without audit. This is the answer to "the suspected shortcut in PRYZM2-WIREUP-PLAN-S72."

### 5.3 — `03_STATUS/00-CURRENT-STATE-AUDIT.md` (the brutal audit)

**Replaces**: my chat-only audit. ~400 LOC. Contents:

1. **What composes today**: `composeRuntime` slot-by-slot — what's real, what's `unknown`, what reads `(window as any)`.
2. **What's still alive that the plan said to delete**: `EngineBootstrap.ts` (2061 LOC), `WorkspaceMountBridge` (Phase D.4 violation), `__pryzm2RuntimeComposed` window stash, `LegacyCommandManagerAdapter`.
3. **The cast count**: 776 `(window as any)` in `src/ui/` (drifting wrong direction from 764 baseline).
4. **The phase reality**: A 7/7 ✅, B 1/40 (annotation sweep ≠ binding), C 3/33, D 5/14, E 0–15/54 (routing path is dead code in production), F 0/195. Plus the ~24/40 "annotation panels meet bar" claim — what it actually means, what it doesn't.
5. **Workflow status**: 3/9 red, not 9/9 green.
6. **The shortcuts taken in S72** that the plan must never repeat.

---

## §6 — Execution order (if you approve)

1. **Step 1 — Move docs to archive (no edits, no merges yet).** Just relocate the superseded files to `archive/`. ~50 files moved. No content changes. **Reversible**: `git mv` only.
2. **Step 2 — Create the new top-level folders** (`00_VISION/`, `01_ARCHITECTURE/`, `02_PLAN/`, `03_STATUS/`). Move the canonical files into them with renames (e.g. `08-VISION.md` → `00_VISION/02-VISION.md`).
3. **Step 3 — Restructure `phases/`** into `PHASE-1/`, `PHASE-2/`, `PHASE-3/`, `PHASE-4-POST-GA/`. Merge the 3A/3B/3C duplicate plans into single files (read both, dedup, write merged version, archive originals).
4. **Step 4 — Restructure `phases/audits/`**: rename to `wireup-S72/` and reorganize (monolith → `00-PLAN.md`, chunks stay, reconciliation stays, missing-items audit promotes to `03_STATUS/`).
5. **Step 5 — Update internal cross-references**. Run a sweep on every `.md` to update relative links (e.g. `08-VISION.md` → `../00_VISION/02-VISION.md`). I'll script this — it's a mechanical sed.
6. **Step 6 — Write the 3 new canonical docs** (architecture, plan, current-state audit).
7. **Step 7 — Write the new top-level `README.md`**: the index, "read these 5 docs in this order".

Each step is one commit. Each step is independently revertable. **No code changes** in `src/` or `packages/` or `apps/` — this is docs-only.

---

## §7 — What I will explicitly NOT do (preserves your trust)

- **Will not delete any file**, even superseded shrapnel. Everything moves to `archive/`. `git log --follow` traces history through the move.
- **Will not edit canonical strategy** (`08-VISION`, `06-IDENTITY`, `09-AS-IS-VS-TO-BE`). They are renumbered/moved verbatim.
- **Will not merge ADRs**. They're already clean.
- **Will not merge SPECs**. Same.
- **Will not touch the 28 wireup chunks** — they're the working document set. They just move to `wireup-S72/chunks/`.
- **Will not touch `src/`, `packages/`, `apps/`, or `plugins/`** during the restructure. Pure doc reorganization.
- **Will not invent new strategy**. The 3 new canonical docs are syntheses of existing material + the brutal audit you already approved in chat.
- **Will not declare anything "done" that isn't done**. The `03_STATUS/00-CURRENT-STATE-AUDIT.md` will read like the chat audit: brutal, evidence-cited, no rosy claims.

---

## §8 — Risks and how I mitigate them

| Risk | Mitigation |
|---|---|
| Internal links break across 226 files | Step 5 is a scripted link-rewrite pass with a check that grep finds zero broken `](./` references afterwards. |
| Engineer with old browser tab references an archived path | Old paths still resolve via `git log --follow`. Archive folder is preserved forever. |
| You disagree with one of my dedup decisions | Each step is one commit. We revert just that step if needed. |
| I miss content during a 3A/3B/3C merge | I diff old vs new, paste the diff in the commit message. No content vanishes silently. |
| The 3 new canonical docs grow into another set of 5+ overlapping plans over time | Single-author convention (I'll set the discipline doc): when a new gap is found, **edit the canonical doc**, do NOT write a new audit. The whole problem is "audit inflation" — the discipline against it goes in `02_PLAN/00-IMPLEMENTATION-PLAN §6`. |

---

## §9 — The single question for you

**Do I have your approval to execute Steps 1–7?**

If yes, I start with Step 1 (move ~50 superseded docs to `archive/`) and report back at each commit.

If you want to adjust the proposal first (different folder names, different dedup decisions, keep something I'm archiving), tell me what to change and I'll revise this doc before touching anything.

If you want me to read more of the corpus before deciding — say which docs and I'll read them. I deliberately stopped reading at the canonical strategic spine + this week's reality reconciliation, because the marginal return on the 200 remaining audit/chunk files looked low.
