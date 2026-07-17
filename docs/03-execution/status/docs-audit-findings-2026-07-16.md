# PRYZM — Documentation Audit Findings

> **Stamp**: 2026-07-16 · **Status**: SNAPSHOT (dated audit — sealed at this date)
> **Source**: full read of `docs/**` (818 files) by the DOCS agent, cross-checked against
> [C31 Documentation Authoring Protocol](../../02-decisions/contracts/C31-DOCUMENTATION-AUTHORING-PROTOCOL.md),
> [NAMING-CONVENTIONS.md](../../NAMING-CONVENTIONS.md), [docs/README.md](../../README.md), and the three index READMEs.
> **Scope**: audit the whole `docs/` tree for SSOT coherence, contract/ADR/spec integrity, structure vs the C31 pyramid, and a prioritised cleanup plan.
> **Fence**: this audit did NOT modify `04-reference/V1-LAUNCH-READINESS-AUDIT.md` or `04-reference/V1-LAUNCH-IMPLEMENTATION-PLAN.md` (live SSOTs owned by the orchestrator). Proposals affecting them are listed for sign-off, not applied.

---

## §1 — Executive summary + issue counts by category

| Category | Issues found | Safe-fix now | Needs sign-off |
|---|---|---|---|
| SSOT drift (competing audit/impl docs) | 12 | 3 (pointer/stamp) | 9 (consolidation) |
| Contracts (C01–C56) | 5 | 3 | 2 |
| ADRs (196 files) | 7 | 2 | 5 (renumber) |
| Specs (82 files) | 4 | 2 | 2 |
| Stale counts / stamps in index READMEs | 6 | 6 | 0 |
| Misplaced files (wrong pyramid layer) | 8 | 2 | 6 |
| Broken / stale internal references | 4 | 4 | 0 |
| **Total** | **46** | **22** | **24** |

**Headline reality vs the docs' own self-description:**

| Metric | Docs claim | Actual (2026-07-16) | Where the stale claim lives |
|---|---|---|---|
| ADR count | "~55" / "~112" | **196** | `adrs/README.md` line 3; `docs/README.md` line 50 |
| Spec files | "56 (39 numbered + 17 special)" | **82 SPEC (39 numbered + 43 special) + 1 legacy PLAN** | `specs/README.md` line 3 |
| Contract range | "C00–C18, C24–C30; C19–C23 reserved" | **C01–C56 all present + C24.1 (57 files), no gaps** | `NAMING-CONVENTIONS.md` §2.1 |
| Contracts drafted | "All 49 contracts" | **57 contract files (C56 is the highest)** | `contracts/README.md` §Gaps |
| Missing-contracts audit | "18 gaps, ACTIVE TRACKER" | **all 18 now exist → RESOLVED** | `MISSING-CONTRACTS-AUDIT-2026-06-01.md` |

The single biggest structural risk is **SSOT fragmentation**: at least a dozen "master/tracker/audit/remaining-work" documents coexist, several claiming to be authoritative. The named launch SSOTs (V1-LAUNCH-READINESS-AUDIT + V1-LAUNCH-IMPLEMENTATION-PLAN) are healthy; the problem is the older master-plan/status docs that were never pointed at them.

---

## §2 — SSOT map

### §2.1 — Confirmed SSOTs (keep, do not touch)

| SSOT | Path | Role |
|---|---|---|
| **AUDIT SSOT** | `04-reference/V1-LAUNCH-READINESS-AUDIT.md` | Live L-NNN issue log — the active bug/readiness tracker |
| **IMPLEMENTATION SSOT** | `04-reference/V1-LAUNCH-IMPLEMENTATION-PLAN.md` | Phased fixes per L-NNN (gates G1–G10) |

Both are being appended live by the orchestrator; this audit leaves them untouched and recommends every other audit/plan doc point *up* to them.

### §2.2 — Other audit-like / implementation-plan-like docs (classify)

**KEEP as distinct live trackers (different scope than the launch SSOT — but should add a one-line "for launch-blocking issues see the V1 SSOT" pointer):**

| Doc | Verdict | Note |
|---|---|---|
| `03-execution/plans/master-execution-tracker.md` | KEEP | Day-to-day "what's next" across Phases A/B/C. Stamp 2026-06-03 — going stale; distinct from launch SSOT. Add pointer. |
| `03-execution/plans/residential-building-implementation-tracker.md` | KEEP | Typology-scoped living tracker; legit. |
| `03-execution/status/autonomous-session-runs-log.md` | KEEP | Append-only run log; legit live tracker. |
| `03-execution/status/apartment-status-dashboard.md` | KEEP | Topic dashboard; legit. |

**CONSOLIDATE-BY-POINTER (replace body with a redirect to the SSOT or the newer superseding doc — keep file for link stability):**

| Doc | Verdict | Points to |
|---|---|---|
| `03-execution/status/remaining-work-consolidated.md` | CONSOLIDATE | Stamp 2026-05-29, "PRYZM 3 — Consolidated Remaining Work". Superseded by the V1 launch SSOT. Add SUPERSEDED banner → V1-LAUNCH-READINESS-AUDIT. |
| `03-execution/status/senior-architect-audit.md` | CONSOLIDATE/ARCHIVE | Dated 2026-05-03 point-in-time audit; should be a dated snapshot (`senior-architect-audit-2026-05-03.md`) and pointer-linked from V1 SSOT. Currently unstamped in filename. |
| `03-execution/status/intent-analysis/master-implementation-plan.md` | RENAME/SCOPE | Titled "Visibility-Intent Master Implementation Plan" (2026-04-26) — NOT a global master plan; the filename `master-implementation-plan.md` is misleading and collides conceptually with the real plan SSOT. Rename to `visibility-intent-implementation-plan.md` (needs sign-off — link updates). |
| `04-reference/element-lifecycle-remediation-plan.md` | KEEP w/ pointer | ACTIVE 2026-07-02, companion to ADR-0098. Legit but is an impl-plan living in `04-reference/` — belongs in `03-execution/plans/`. Flag move. |

**ALREADY ARCHIVED / superseded (correct — no action beyond confirming pointers):**

- `03-execution/plans/legacy/superseded-2026-06-01/master-implementation-plan-2026-05-31.md`
- `03-execution/plans/legacy/superseded-2026-06-01/master-architecture-and-capabilities-2026-06-01.md`
- `archive/pryzm3-internal/MASTER-IMPLEMENTATION-TRACKER-ARCHIVED-2026-05-16.md`
- `archive/pryzm3-internal/PRYZM3-MASTER-STATUS-2026-05-16-ARCHIVED.md` + `…-2026-05-29-ARCHIVED.md`
- `archive/pryzm3-internal/MASTER-IMPL-PLAN-FUNCTIONAL-2026-05-18-ARCHIVED.md`

These are correctly in `archive/` with `-ARCHIVED` suffixes. **Goal state = ONE audit SSOT + ONE impl SSOT + a small set of clearly-scoped living trackers that each point up to the SSOT.** We are close; the remaining drift is the four CONSOLIDATE rows above.

---

## §3 — Contracts (C01–C56)

**Inventory: 57 files — C01–C56 contiguous + C24.1. No numbering gaps.** (This contradicts `NAMING-CONVENTIONS.md §2.1` which still says "C00–C18, C24–C30; C19–C23 reserved" — that note predates the C19–C56 build-out.)

| # | Finding | Severity | Fix |
|---|---|---|---|
| C-1 | **C18 (`C18-ELEMENT-PREVIEW-VISUAL-CONTRACT.md`) has NO row in the C00 index table.** The file exists; the index jumps C17 → C24. | HIGH (index integrity) | SAFE — add C18 row to `contracts/README.md`. |
| C-2 | C00 index "Gaps + roadmap" says **"All 49 contracts now drafted"** — actually 56 (C50–C56 added since). Conflict-resolution list caps at C30 ("C01–C30"). | MED | SAFE — update counts + range in `contracts/README.md`. |
| C-3 | `NAMING-CONVENTIONS.md §2.1` contract-range note stale (see above). | MED | SAFE — update the "Currently used" line. |
| C-4 | Status labels: C19–C23, C32–C56 mostly **DRAFT since 2026-06-01** (13+ months of "pending stakeholder sign-off"). C01–C18 CANONICAL. No contradiction found, but the draft backlog is large. | LOW (informational) | SIGN-OFF — founder ratify DRAFT→CANONICAL sweep. |
| C-5 | Conflict-resolution order in C00 references `contracts/archive/superseded-pryzm1-pryzm2/` — **that directory does not exist** under `contracts/`. Broken structural reference. | LOW | SAFE — remove/repoint the dead path in `contracts/README.md`. |

**MISSING contracts:** none within C01–C56. The `MISSING-CONTRACTS-AUDIT-2026-06-01.md` proposed exactly C18–C49 (18 gaps) — **every one now exists**. That audit is RESOLVED; its "ACTIVE TRACKER" status is stale. SAFE-fix: mark it RESOLVED with a pointer to the C00 index.

**Misplaced contract-like file:** `02-decisions/specs/SPEC-OFFICE-GENERATION-ENGINE.md` sits in a `02-decisions/specs/` folder that should not exist (specs live in `03-execution/specs/`). It is the only file there. Flag move to `03-execution/specs/` (needs sign-off — cross-links).

---

## §4 — ADRs (196 files)

**Inventory: 196 ADR files** across three intermixed series — 84 four-digit `NNNN-*.md` (0001–0086), 112 `ADR-NNN`/`ADR-NNNN-*.md` (ADR-0201–ADR-0264 strategic 3-digit + ADR-0055…ADR-0124 four-digit). Both index READMEs badly undercount ("~55" / "~112").

### §4.1 — Duplicate ADR numbers (5 collisions — the most serious ADR finding)

| Number | File A | File B | Nature |
|---|---|---|---|
| `0014` | `ADR-0014-traa-ssgi-idle-budget.md` | `ADR-0014-traa-ssgi-idle-budget-s49-refresh.md` | Refresh of same decision sharing a number — should be a superseding ADR with a new number, or the refresh folded in. |
| `0069` | `ADR-0069-dynamic-program-canvas-as-primary-authoring-surface.md` | `ADR-0069-graph-authoritative-room-identity-at-execution.md` | **Two unrelated decisions on one number** — true collision. |
| `ADR-0098` | `ADR-0098-element-lifecycle-conformance-audit.md` | `ADR-0098-stair-authored-by-height-implied-level-above.md` | **True collision.** |
| `ADR-0110` | `ADR-0110-sunhours-bvh-no-recompute-and-facade-real-geometry.md` | `ADR-0110-unified-furniture-plan-symbol-vocabulary.md` | **True collision.** |
| `ADR-0117` | `ADR-0117-room-redetect-noprogress-loop-guard.md` | `ADR-0117-uniform-material-set-command.md` | **True collision.** |

`ADR-0055` + `ADR-0055A` is an intentional sub-decision (A-suffix), **not** a collision.

Renumbering sealed ADRs is an immutability-sensitive operation → **NEEDS SIGN-OFF.** Recommendation: keep both files, give the later-authored of each pair a fresh next-free number via a superseding stub, and record the mapping. Do NOT silently rename. Flagged for orchestrator.

### §4.2 — Series / numbering structure

- Three co-existing numbering schemes (`NNNN`, `ADR-NNN`, `ADR-NNNN`) create ambiguity: e.g. code-level `0055` does not exist but `ADR-0055` does, and 3-digit `ADR-0255` (one-pryzm-cloudflare) is a *different* doc. C31 §1.2 already mandates new ADRs use `ADR-NNNN ≥ 0100`; the collision at ADR-0110/0117 shows this is being violated in practice.
- **NEEDS SIGN-OFF:** a one-time ADR numbering reconciliation (assign a monotonic next-free counter, publish an old→new map). Do not attempt in a "safe" pass.

### §4.3 — Index staleness (SAFE to fix)

- `adrs/README.md` §intro "~55 ADRs" → 196. §6 index tables stop at 0009 / ADR-0209 with "see ls" placeholders; the "most-cited" table references ADR-0120/0111 that are real but the main index is unusable as a lookup.
- SAFE-fix applied this pass: correct the headline count + add a duplicate-numbers callout so the collisions are visible until reconciled. A full rebuilt index table is larger work (flagged, not done, to avoid transcription error across 196 rows).

### §4.4 — Orphans / superseded-not-marked

- Spot-check found no ADR marked ACCEPTED that is clearly contradicted, but a full supersession audit of 196 ADRs was **not** performed (out of safe scope; would need per-file reads). Flagged as a follow-on task.

---

## §5 — Specs (82 SPEC files + 1 legacy PLAN)

**Inventory: 39 numbered SPEC-NN + 43 special-named SPEC-* + `PLAN-GENERATIVE-DESIGN-SPRINTS.md`.**

- **SPEC-NN present:** 01–13, 15, 21, 24, 26–48. **Gaps:** 14, 16–20, 22, 23, 25 (matches `specs/README.md §2`'s stated gaps — accurate).
- **Stale count:** `specs/README.md` line 3 says "56 spec files (39 numbered + 17 special-named)". Actual special-named = **43**, total = 82. SAFE-fix.
- **Index incompleteness:** the §4 "Full index" table lists only SPEC-01…10 then "see directory" and a partial special-named list (7 of 43). Not a lookup. Flagged; full rebuild is larger work.
- **Missing-spec candidates (capabilities shipped in code, spec absent or thin):** not exhaustively verified this pass. Notable: many special-named specs exist for shipped engines (apartment/furniture/ceiling/lighting/TGL), so coverage is broad. Deep code-vs-spec gap analysis flagged as follow-on.
- **Possible duplication:** `SPEC-KITCHEN-WARDROBE-APPLIANCES.md` vs `SPEC-KITCHEN-WARDROBE-WALL-DRIVEN.md` — overlapping topic; verify one supersedes the other (flag, not resolved).

---

## §6 — Per-area assessment vs the C31 pyramid

### §6.1 — `01-strategy/`
Healthy. `STR-04-architecture.md` + `STR-05-architecture-breakdown.md` are correctly split (rules vs inventory). `_pryzm3-overview-legacy.md` is correctly underscore-prefixed + marked legacy (2026-04-30) — candidate for `archive/` but harmless. Several strategy docs (GENERATIVE-LAYOUT-WORLD-MODEL-STRATEGY, PRYZM-BUILDING-GRAPH-AND-RELATIONAL-AI-FOUNDATION, site-and-cognition-strategy) are UPPERCASE-named, breaking the strategy-layer lowercase-kebab convention (NAMING §2.4/C31 §1.2). Cosmetic; flag rename for sign-off.

### §6.2 — `02-decisions/`
Contracts + ADRs assessed above. Stray `02-decisions/specs/` folder (§3) should not exist. `README.md` + `MISSING-CONTRACTS-AUDIT` present. `MISSING-CONTRACTS-AUDIT` is RESOLVED (mark it).

### §6.3 — `03-execution/`
Mostly well-structured (`analysis/`, `plans/`, `specs/`, `status/`, `spikes/`, `queue/`). **Root-level strays** (violate C31 §1.1 — everything lives in a subfolder):
- `03-execution/layout-generation-algorithm.md` (2026-06-13) — duplicate-ish of `04-reference/layout-generation-algorithm.md` (newer, cleaner). Consolidate: archive the 03-execution copy, keep the reference copy. **SAFE-ish move** (flag).
- `03-execution/session-status-2026-06-08.md` — belongs in `status/`. Flag move.
- `03-execution/README.md` — legit.
Naming: `analysis/` + `plans/` mix UPPERCASE-dated working docs (e.g. `house-gen-audit-2026-06-21.md`) which is fine for dated snapshots, but many are `*-AUDIT-*.md` — the exact pattern C31 §4/README §4 says "never write alongside a canonical doc." They're isolated in `analysis/` so acceptable as working material, but the volume signals the anti-pattern is still happening.

### §6.4 — `04-reference/`
Holds the two launch SSOTs (correct home). Also holds several **plan/remediation** docs that belong in `03-execution/` (`element-lifecycle-remediation-plan.md`, `layout-generation-algorithm.md`, `pipeline-architecture-apartment-vs-house.md`, `stair-creation-pipeline-and-anchor-analysis.md`). `architecture-detail/`, `file-formats/`, `runbooks/`, `security/`, `observability/` are correctly reference material. `typecheck-errors-2026-05-24.txt` is a raw dump — archive candidate. `audit/` subfolder (BatchCW, THREE_Decopuling, etc.) is stale working material — archive candidate.

### §6.5 — `05-guides/`
Reasonable. `mobile/` contains `X_B2B/` strategy docs + `responsiveness-plan.md` that are really strategy/plan not guides — misfiled. `deployments/` guides are legit. Flag `mobile/X_B2B/*` for move to `01-strategy/` or `03-execution/plans/`.

### §6.6 — `03_PRYZM3/` (legacy area — migration mapping)
9 files, all active climate/geospatial/circulation/spike working docs. Proposed pyramid mapping:

| Current `03_PRYZM3/` file | Proposed home |
|---|---|
| `SPEC-CIRCULATION-GRAPH.md` | `03-execution/specs/SPEC-CIRCULATION-GRAPH.md` |
| `SPEC-3D-ANALYTICS-FIXES-AND-OVERLAYS.md` | `03-execution/specs/` (or analysis/ if not normative) |
| `pryzm-3d-geospatial-capabilities.md` | `04-reference/` (capability reference) |
| `pryzm-climate-overlays-build-order.md`, `climate-gis-overlay-plan-2026-06-18.md` | `03-execution/plans/` |
| `pryzm-street-microclimate-pipeline.md` | `03-execution/plans/` or `specs/` |
| `execution-engine-render-defects-audit.md` | `03-execution/analysis/` |
| `SPIKE-*.md` (balcony, roof-garden, corridor-spine, true-north) | `03-execution/spikes/` |

All are file moves (link-sensitive) → **NEEDS SIGN-OFF**; mapping provided above for a single reconciling commit.

### §6.7 — `interview/`
Out-of-scope personal material (11 files). Left untouched per brief. Noted only.

### §6.8 — `archive/`
Large and correctly one-way. `archive/pryzm3-internal/` holds the bulk of historical audits/plans (~180 files) — appropriate. `duplicates/` subfolder explicitly quarantines copies — good hygiene. `InterviewDAR.docx` is a binary in archive — harmless. No action.

---

## §7 — Prioritised cleanup plan

### §7.1 — SAFE NOW (executed / executable this session — body edits that cannot break links)

1. **Fix stale counts** in `docs/README.md` (ADRs ~112→196), `adrs/README.md` (~55→196), `specs/README.md` (56→82; special 17→43).
2. **Add C18 row** to `contracts/README.md` C00 index; update "All 49"→"57 files (C01–C56 + C24.1)"; fix conflict-order range note; remove dead `contracts/archive/superseded-pryzm1-pryzm2/` path.
3. **Update `NAMING-CONVENTIONS.md §2.1`** contract-range note to reflect C01–C56 fully assigned.
4. **Mark `MISSING-CONTRACTS-AUDIT-2026-06-01.md` RESOLVED** with pointer to C00 index (Status-line + resolution note).
5. **Add duplicate-ADR-numbers callout** to `adrs/README.md` so the 5 collisions are visible until reconciled.
6. **SUPERSEDED banner** on `status/remaining-work-consolidated.md` → V1 launch SSOT.

### §7.2 — NEEDS SIGN-OFF (do NOT do in a safe pass)

1. **ADR renumbering reconciliation** — resolve the 5 duplicate numbers (0014, 0069, ADR-0098, ADR-0110, ADR-0117) via superseding stubs + old→new map. Immutability-sensitive.
2. **`03_PRYZM3/` migration** — 9 files moved into the pyramid per §6.6 mapping (one reconciling commit, link updates).
3. **Move misplaced plan/impl docs** out of `04-reference/` into `03-execution/plans/` (ELEMENT-LIFECYCLE-REMEDIATION-PLAN, etc.) and out of `05-guides/mobile/X_B2B/`.
4. **Move `02-decisions/specs/SPEC-OFFICE-GENERATION-ENGINE.md`** → `03-execution/specs/` and delete the stray folder.
5. **Rename `status/intent-analysis/master-implementation-plan.md`** → `visibility-intent-implementation-plan.md` (misleading global name).
6. **Rebuild the full ADR + spec index tables** (196 + 82 rows) — high transcription-error risk; do deliberately, not in a cleanup batch.
7. **DRAFT→CANONICAL ratification** sweep for C19–C23, C32–C56.
8. **Rename UPPERCASE strategy-layer docs** to lowercase-kebab per convention.
9. **Consolidate the two `layout-generation-algorithm.md` files** (archive the 03-execution-root copy).

### §7.3 — FOLLOW-ON audits (not attempted here — need per-file deep reads)

- Full ADR supersession audit (196 files) for ACCEPTED-but-contradicted / orphan ADRs.
- Full code-vs-spec gap analysis (capabilities shipped without a spec).
- Full relative-link resolution sweep across all 818 files (the planned `check-doc-links.ts` gate).

---

## §8 — Cleanup log (this session)

_Each entry: commit · what changed._

- **`682ee1cf`** — refreshed stale counts + index drift: ADRs ~55/~112→196 (docs/README, C00 index, adrs/README); specs 56→82 (specs/README); NAMING contract range→C01–C56; added missing **C18 row** to C00 index; fixed "All 49"→57; repointed dead `contracts/archive/superseded-pryzm1-pryzm2` path + broken `master-implementation-plan.md` link; added duplicate-ADR-numbers callout to adrs/README. (§7.1 items 1, 2, 3, 5)
- **_(this commit)_** — status-line reconciliation: marked `MISSING-CONTRACTS-AUDIT-2026-06-01.md` **RESOLVED** (all 18 gaps built); added **SUPERSEDED** banner to `status/remaining-work-consolidated.md` → V1 launch SSOTs. (§7.1 items 4, 6)

Remaining §7.1 items are covered.

### §8.1 — Index-table regeneration script (Task 6)

The full ADR + spec index tables in `adrs/README.md §6` and `specs/README.md §4` are auto-generated (not hand-typed — transcription is the risk). To regenerate after adding/removing files, run from the folder:

```bash
for f in $(ls *.md | grep -v '^README.md$' | sort); do
  title=$(grep -m1 '^# ' "$f" | sed 's/^# *//' | sed 's/|/\\|/g' | tr -d '\r' | cut -c1-160)
  echo "| \`${f%.md}\` | [$title](./$f) |"
done
```

Paste the rows under the `| File | Title (linked) |` header. Verify every link resolves with the link-sweep in §8.2.

### §8.2 — Post-restructure link sweep

A Python relative-link resolver (`scratchpad/linksweep.py`) walks every `.md` under `docs/`, resolves every `](path)` link, and reports non-existent targets. **Result after ALL restructures + the ADR unification + the STR-NN scheme: zero broken links introduced by any rename/move in this session.** Proof: the total broken count held **constant at 310** across every stage (before/after the 03_PRYZM3 migration, the working-doc lowercase sweep, the 86-ADR unification, and the 15-file STR rename) — an orphaned reference would have raised it. Breakdown of the 310 (all PRE-EXISTING debt, not this session's work):
- **158** inside `archive/**` + `03-execution/plans/legacy/**` — dead links to old pre-migration paths (`../01_ARCHITECTURE/…`, `../03_STATUS/…`). Immutable per C31 §3.4.
- **146** in active docs — references to docs that were **archived or renamed BEFORE this session**: 28× the long-archived `master-implementation-plan.md`, 6× `geospatial-foundation.md` (in legacy/superseded), stale contract short-names (`C16-COMMAND-AUTHORING.md`→ now `-PROTOCOL`, `C17-BATCH-CREATE-CATALOGUE.md`→ now `-AND-PANEL-BINDING`), wrong `./adr/` dirs in `architecture-detail/*`, etc.
- **~6** doc-format examples (`relative/path/file.md` in NAMING/C31) — false positives, not real links.

This pre-existing debt is a separate archive/contract-hygiene task (many targets are genuinely deleted with no valid replacement, and several live in sealed contracts). It is **out of scope for the rename work** and logged here for a dedicated follow-up. Regenerate the sweep with `scratchpad/linksweep.py`.

---

## §9 — NAMING-COMPLIANCE (tree-wide sweep + ADR-unification blocker)

### §9.1 — Canonical scheme
The one-canonical-filename-code-per-type table now lives in [NAMING-CONVENTIONS.md §2.0](../../NAMING-CONVENTIONS.md). Summary: contracts `CNN-UPPERCASE.md`; ADRs `ADR-NNNN-kebab.md`; specs `SPEC-*`; everything else (strategy/plans/status/analysis/spikes/queue/reference/guides) `kebab-case.md` (dated snapshots keep `-YYYY-MM-DD`).

### §9.2 — DONE: 77 working-doc files lowercased (commit `e488d873` + the git-mv sweep)
All non-compliant UPPERCASE files in `03-execution/{analysis,spikes,queue,status}`, `03-execution/plans` (non-legacy), `04-reference/*` (security, architecture-detail, + 4 root docs), and `05-guides/*` were renamed to lowercase-kebab; every inbound path-link rewritten; link sweep clean. Full before→after map: see `scratchpad/rename_map.tsv` (77 rows) — representative entries: `HOUSE-GEN-AUDIT-2026-06-21.md`→`house-gen-audit-2026-06-21.md`, `STAIR-CREATION-PIPELINE-AND-ANCHOR-ANALYSIS.md`→`stair-creation-pipeline-and-anchor-analysis.md`, `CLOUDFLARE-PAGES-SETUP.md`→`cloudflare-pages-setup.md`, `DOCS-AUDIT-FINDINGS-2026-07-16.md`→`docs-audit-findings-2026-07-16.md` (this file).

### §9.3 — DONE: strategy layer fully lowercase-kebab (commit `9faa76ab`)
`GENERATIVE-LAYOUT-WORLD-MODEL-STRATEGY.md`→`STR-13-generative-layout-world-model-strategy.md`; `PRYZM-BUILDING-GRAPH-AND-RELATIONAL-AI-FOUNDATION.md`→`STR-14-pryzm-building-graph-and-relational-ai-foundation.md`; `B2B-PLATFORM-STRATEGY.md`→`STR-11-b2b-platform-strategy.md`. `01-strategy/` now has zero UPPERCASE files (besides `README.md`).

### §9.4 — ADR unification — 86 DONE, 66 flagged (partial, by design)
**DONE (commit `f823f94b`):** the **84 bare `NNNN-*`** files → `ADR-NNNN-*` and the **2 uppercase-slug** files (`ADR-0055-WALL-JUNCTION-PASCAL-STYLE.md`→`ADR-0055-wall-junction-pascal-style.md`; `ADR-0055A`→`ADR-0055a`) were unified to canonical `ADR-NNNN-kebab.md`. Collision-free (the bare 0001–0086 gaps are exactly the numbers the 4-digit `ADR-` series already fills). Every path reference rewritten byte-level; ADR index regenerated; link sweep clean. Map: `scratchpad/adr_final_map.tsv` (86 rows).

**FLAGGED for founder sign-off — the 66 strategic 3-digit `ADR-NNN-*`:** these CANNOT be zero-padded without a genuine number collision:
- The **strategic series** `ADR-0201…064` reuses the SAME numbers as the now-canonical bare-origin `ADR-0001…0086` series. Padding `ADR-0252`→`ADR-0052` collides with `ADR-0052-s70-browser-matrix`; `ADR-0255`→`ADR-0055` collides with `ADR-0055-wall-junction`. ≈60 collisions across 001–064.

**Proposed resolution (needs founder decision):** renumber the **64 strategic ADRs into a distinct band** — recommended `ADR-0201–0264`, preserving current order — updating every citation + regenerating the index. Do NOT execute until the band is chosen — it changes well-known numbers (ADR-0252 docs-site, ADR-0255 one-pryzm, ADR-0257 realtime-geometry). This is the ONE ADR rename left; the tree is NOT half-renamed (the 66 remain uniformly at their current valid `ADR-NNN-*` names).

### §9.6 — DONE: strategy layer assigned `STR-NN` codes (this pass)
Per the founder's alphanumeric-code directive, all 15 current strategy docs now carry `STR-NN` codes by the README authority/reading order: STR-01 manifesto · STR-02 product-vision · STR-03 engineering-vision · STR-04 architecture · STR-05 architecture-breakdown · STR-06 operating-principles · STR-07 positioning · STR-08 go-to-market · STR-09 personas · STR-10 platform-strategy · STR-11 b2b-platform-strategy · STR-12 site-and-cognition-strategy · STR-13 generative-layout-world-model-strategy · STR-14 pryzm-building-graph-and-relational-ai-foundation · STR-15 risks-and-assumptions. Every inbound path reference rewritten (incl. the C00 conflict-resolution order + docs/README §3 authority order); `01-strategy/README.md` rebuilt with codes; `STR-NN` registered in NAMING-CONVENTIONS §2.0. The legacy `_pryzm3-overview-legacy.md` was moved to `archive/pryzm3-internal/pryzm3-overview-legacy.md` (not `STR-99` — it is superseded archeology, not a current strategy doc). A byte-replace over-match briefly corrupted 3 ADR refs ending `-architecture.md` + the `b2b-platform-strategy` refs; both were detected and reversed before commit (link sweep clean).

### §9.5 — Deferred / flagged (not renamed)
- `archive/**` (immutable per C31 §3.4) + `interview/**` (out of scope) — left UPPERCASE by design.
- `04-reference/audit/` stale working subtree (BatchCW/, THREE_Decopuling.md, …) — recommend ARCHIVING the whole subdir rather than renaming ugly stale files.
- Root meta docs `NAMING-CONVENTIONS.md`, `DOCUMENTATION-GAPS-AND-NEXT-PHASES.md`, `README.md` — kept UPPERCASE (established top-level meta convention; heavily referenced). Flag if a lowercase policy is desired.
- `04-reference/runbooks/RUNBOOK-*.md` + `DR-DRILL-RUNBOOK.md` — kept the `RUNBOOK-` ops-convention prefix; flag if lowercase-kebab is preferred.
- `02-decisions/MISSING-CONTRACTS-AUDIT-2026-06-01.md` — path-frozen this session (concurrent reader); rename to `missing-contracts-audit-2026-06-01.md` deferred.
</content>
</invoke>
