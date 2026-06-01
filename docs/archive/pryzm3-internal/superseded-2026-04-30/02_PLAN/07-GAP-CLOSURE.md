# 11 — PRYZM 2 Gap-Closure Plan (the gap-to-doc index)

**Status**: ratified 2026-04-27. Updated 2026-04-29 with the Chunk 24 + Chunk 25 cross-audits (see §3.6). Single source of truth for "is this gap closed yet?" Every gap from `GAP-REVIEW-2026-04-27.md` is listed below with the SPEC/ADR/sprint that closes it. If a row says **OPEN**, it isn't closed.

**Read alongside:**
- `GAP-REVIEW-2026-04-27.md` — the gap inventory (the original 85).
- `10-MASTER-IMPLEMENTATION-PLAN-36M.md` §3.5 + §3.6 — where ADRs land and which phases hold the work.
- Per-phase `§Gap-Closure Subphase` blocks under `phases/`.
- `phases/audits/PRYZM2-WIREUP-PLAN-S72/24-pryzm1-src-coverage-audit.md` — the per-folder cross-audit (adds 17 folder-level gaps + 31 sub-phases + ADR-041/042/043).
- `phases/audits/PRYZM2-WIREUP-PLAN-S72/25-architecture-docs-cross-alignment.md` — the per-document cross-audit (closes CONFLICT §6.10 via ADR-044 + adds 7 doc-PRs).

> **Note on the 85 number below**: it counts the gaps surfaced by `GAP-REVIEW-2026-04-27.md`. The §3.6 Chunk-24/25 amendments below add 18 more (17 folder gaps + 1 customer-migration gap), bringing the running total to **103** all-closed. The §1 summary table is preserved unchanged for historical traceability; §3.6 is the live extension.

---

## §1 Closure status summary

| Group | Items | Closed | Partial | Open |
|---|---:|---:|---:|---:|
| Architectural truth (§§1–6) | 12 | 12 | 0 | 0 |
| Decision gaps (§§7–13) | 14 | 14 | 0 | 0 |
| File-format / data-shape (§§14–17) | 9 | 9 | 0 | 0 |
| AI / cost (§§15, 21) | 8 | 8 | 0 | 0 |
| Plan-view / vector (§§22) | 7 | 7 | 0 | 0 |
| Migration / lifecycle (§§24, 27) | 8 | 8 | 0 | 0 |
| Quick-fire (§29 #1–#27) | 27 | 27 | 0 | 0 |
| **Total** | **85** | **85** | **0** | **0** |

(The SOC2 audit-log retention details — `§29 #7` — close at the document level via ADR-021 + ADR-028 Part G; concrete schema lights up at S57. That is closed for plan purposes; the implementation milestone is tracked separately.)

---

## §2 Gap-by-gap closure index

### §2.1 Architectural truth (Gap Review §1–§6)

| # | Gap | Closes via | Sprint |
|---|---|---|---|
| 1 | "One Renderer is two" — `packages/renderer/` vs `packages/render-runtime/` | ADR-022 Part A | S25 |
| 2 | Library rAF (Cesium / OBC) breaks the "1 frame owner" claim | ADR-023 | S25 (warn) → S30 (error) |
| 3 | `src/render/` + `src/rendering/` legacy overlap | ADR-022 Part A → SPEC-27 §4.3 deletion at S55 | S55 |
| 4 | Geometry-kernel boundary unscoped re context envelopes | SPEC-13 + SPEC-21 Step 4 | S25 |
| 5 | Renderer topology + backend runtime | ADR-022 Part B–F | S25 |
| 6 | Element-creation protocol stops at "create command" — no producer/committer/UI/schedule discipline | SPEC-21 (Steps 1–10) | S25 standing |

### §2.2 Decision gaps (Gap Review §7–§13)

| # | Gap | Closes via | Sprint |
|---|---|---|---|
| 7 | No formal data-store map (where does each entity live: PG, Supabase, Yjs, R2?) | SPEC-24 | S25 |
| 8 | Service-role-key in `server.js` | SPEC-08 §6 + ADR-028 Part F + CI gate `pnpm spec:audit-secrets` | S26 |
| 9 | `00_Contracts/` fate undecided | SPEC-27 §5 (archive at S26) | S26 |
| 10 | Element / context boundary blur in legacy code | SPEC-13 §3 + SPEC-21 Step 2 reverse-doc | S25.5 |
| 11 | `project_command_log` cleanup is probabilistic | SPEC-24 §1.3 (BullMQ scheduled sweep) + S45 deletion | S26 lit; S45 deleted |
| 12 | `.pryzm` v1 not specified | SPEC-26 | S25 |
| 13 | Deployment topology on Replit unspecified | SPEC-15 | S25 |

### §2.3 AI / cost (Gap Review §15, §21)

| # | Gap | Closes via | Sprint |
|---|---|---|---|
| 14 | AI per-call ceiling, daily-user budget, per-project budget | SPEC-28 §3, §4 | S38 (call+user); S43 (project) |
| 15 | AI cost telemetry → Honeycomb metric | SPEC-28 §5.3 | S44 |
| 16 | AI usage UI surfaces (per-project meter, modal warnings) | SPEC-28 §9 | S43 |
| 17 | Workspace Admin AI Spend view | SPEC-28 §9 | S65 |
| 18 | Free-tier exclusion from PDF-to-BIM | SPEC-28 §2 + ADR-029 Part B | S65 |
| 19 | PDF-to-BIM cost ceiling | SPEC-28 §3 + ADR-029 Part C | S65 |
| 20 | Self-host BYO-key safety cap | SPEC-28 §11 | S70 |
| 21 | PDF-to-BIM scope (the moat) | ADR-029 + SPEC-31 (S50) | S49–S72 |

### §2.4 Plan-view / vector primitives (Gap Review §22)

| # | Gap | Closes via | Sprint |
|---|---|---|---|
| 22 | Plan-view perf budget for the four tiers (Small/Med/Large/Torture) | SPEC-30 §2 | S31–S36 |
| 23 | "Pre-port" of 5 hot operations onto new backend before VI engine port | SPEC-30 §5 + Phase-2A §Gap-Closure | S30.5–S30.10 |
| 24 | Vector primitive set + 4 backends (SVG, Canvas2D, PDF, Print-Canvas) | SPEC-29 §3, §4 | S30 → S55 |
| 25 | PDF backend native (no SVG round-trip) | SPEC-29 §4.3 | S37 |
| 26 | Backend-equivalence gate (visual-diff across all 4 backends) | SPEC-29 §4.5 | S34 standing |
| 27 | Hidden-line classifier; WebGL2 first, WebGPU compute later | SPEC-30 §3.2 + ADR-025 Part E | S35 (WebGL2); post-GA (compute) |
| 28 | Multi-view sync incremental | SPEC-30 §7 | S36 |

### §2.5 File format + data shape (Gap Review §12, §14, §16, §17)

| # | Gap | Closes via | Sprint |
|---|---|---|---|
| 29 | `.pryzm` archive layout, manifest, signatures, schemaVersion | SPEC-26 §3, §4, §5 | S25 |
| 30 | File-format migrators (1.0 → 1.1 → 2.0) | SPEC-26 §6 | S25 + per-version |
| 31 | Plugin sandboxed data area | SPEC-26 §11 | S27 |
| 32 | Imports preserved (`imports/source.ifc.zst`, `imports/source.pdf.zst`) | SPEC-26 §10 | S37 (PDF), S55 (IFC) |
| 33 | Public REST `import` / `export.pryzm` endpoints | SPEC-26 §11 + OpenAPI per SPEC-26 §8 | S65 |
| 34 | `.pryzm` round-trip CI gate | SPEC-26 §9 | S25 standing |

### §2.6 Migration / lifecycle (Gap Review §24, §27)

| # | Gap | Closes via | Sprint |
|---|---|---|---|
| 35 | Cutover plan PG → Supabase with rollback window | SPEC-27 §3 (14-day window) | S43 cutover; S45 finalisation |
| 36 | Strangler-fig deletion log (which legacy file dies which sprint) | SPEC-27 §4.3 | standing |
| 37 | Rollback runbook | SPEC-27 §6 + S69 DR drill | S69 |
| 38 | Self-host migration tooling | SPEC-27 §7 | S70 |
| 39 | `src/lifecycle/` placement undecided | ADR-030 | S25–S70 |
| 40 | `src/engine/EngineBootstrap.ts` deletion | SPEC-27 §4.3 | S61 |
| 41 | OBC removed from editor → plugin | SPEC-12 §5 + ADR-023 + SPEC-27 §4.3 | S55 |
| 42 | Legacy 11-wave VI engine deletion | SPEC-27 §4.3 + SPEC-30 §6.2 | S58 |

### §2.7 Quick-fire (Gap Review §29 #1–#27)

The §29 quick-fire list of 27 items maps as follows:

| #29 item | Closes via |
|---|---|
| #1 Robustness budget per kernel op | ADR-020 (already merged S23) |
| #2 First-party catalog inventory | ADR-017 (already merged S20) |
| #3 OTel pipeline | ADR-014 (already merged S07) |
| #4 View-state authority | ADR-016 (already merged S17) |
| #5 Telemetry pipeline | ADR-014 |
| #6 Soft-locks | ADR-019 (already merged S22) |
| #7 SOC2 evidence | ADR-021 + ADR-028 Part G; schema S57 |
| #8 Stripe entitlements | ADR-013 (already merged S07) |
| #9 Bake debounce | ADR-015 (already merged S08) |
| #10 Renderer topology | ADR-022 Part A |
| #11 Single-frame-owner & library rAF | ADR-022 Part F + ADR-023 |
| #12 BullMQ-Redis on Replit | ADR-022 Part C + SPEC-15 §3.3 |
| #13 Yjs server placement | ADR-022 Part D + SPEC-15 §2.2 |
| #14 Lifecycle placement | ADR-030 |
| #15 Node version | ADR-022 Part B |
| #16 three.js pin | ADR-025 |
| #17 WebGPU adoption gate | ADR-025 Part C |
| #18 React-19 in deps | ADR-026 |
| #19 Schedule DSL | ADR-027 |
| #20 Light parametric expressions vs schedule formulas | ADR-027 Part E |
| #21 Authority unification | ADR-028 |
| #22 RLS service-role-key | ADR-028 Part F + S26 removal |
| #23 Workspace permission taxonomy | ADR-028 Part B |
| #24 Plan / role / RLS coordination | ADR-028 Parts A–E |
| #25 PDF-to-BIM scope | ADR-029 |
| #26 Library quarantine policy | ADR-023 |
| #27 Capacity cut list extension (T1.7 + T1.8) | ADR-018 (extended 2026-04-27) |

---

## §3 Sprint coverage check (per phase)

The §Gap-Closure Subphase blocks in the phase docs schedule every gap above into a specific sprint. Cross-checking sprint-by-sprint:

**Per the 2026-04-27 directive Phase 2A holds no gap-closure work** (Phase 2A is in active development; mid-sprint new-work injection forbidden). All originally-2A items have been absorbed into Phase 2B's S31.

| Sprint range | Gap items closed in this range |
|---|---|
| S25–S30 (Phase 2A) | **none — no gap-closure work** (in-flight 2A scope continues per existing PHASE-2A.md §1–§5 plan; envelopes implicit, codified later) |
| **S31 (Phase 2B start, heavy ratification + pre-port sprint)** | 1, 2, 4, 5, 6, 7, 8, 9, 10, 11 (cleanup lit), 12, 13, 17, 22, 23 (the pre-port — single largest risk-reducer), 26, 28, 29, 30, 31, 33, 34, 38 (lifecycle skeleton), 41 (Cesium quarantine), 47, 48, 49, 50; envelopes for all 18 families (12 Phase-1 + 6 Phase-2A in-flight) reverse-documented in one sprint per SPEC-13 §3 + SPEC-21 Step 2 |
| S32 | rule promotions to error (`pryzm/no-impure-context`, `pryzm/single-frame-owner`, `pryzm/no-react-runtime`, `pryzm/no-direct-three-examples`); RLS generator; legacy VI adapter starts |
| S33–S36 | 22, 24, 25 (lit prep), 27, 28 (multi-view sync at S36); plan-symbol producers for all 18 families at S34 |
| S37–S42 | 25 (PDF native), schedule formulas (14 + 10), backend equivalence gate, three.js quarterly upgrade |
| S43–S48 | 35 (cutover), 11 (`project_command_log` deleted at S45), 14–16 (AI budgets), 41 (OBC review prep), 39 (instantiation hooks) |
| S49–S60 | 21 (PDF-to-BIM phased), 41 (OBC removed S55), 42 (VI engine deleted S58), audit-log schema S57 |
| S61–S72 | 40 (`EngineBootstrap` deleted S61), 33 (public APIs S65), 39 (`src/lifecycle/` deleted S70), all GA gates |

Every gap has a sprint home; no gap is unscheduled. **S31 is the heaviest sprint of the 36-month plan**; its slip risk is mitigated by ADR-018 Tier-1 cuts T1.7 (S55) + T1.8 (S41), either of which buys back a sprint of calendar.

---

## §4 What this document does NOT close

Two classes of work are intentionally **not** closed by this gap-closure plan; they are tracked elsewhere:

1. **v2 backlog items** — items in ADR-018 Tier-1/Tier-2/Tier-3 that may be cut at phase gates land in `docs/operations/v2-candidates.md` if cut; this plan does not pretend they are closed if they are deferred.
2. **Post-GA roadmap** — items explicitly post-GA (PDF-to-BIM expanded scope, WebGPU compute, multi-region beyond two regions) belong on the post-GA roadmap, not here.

If a gap is found that is not in this document, raise a PR adding it to §2 with its closing SPEC/ADR/sprint, or — if no document exists yet — file a new ADR/SPEC and link from here. **No gap is allowed to live only in someone's head.**

---

## §5 Maintenance protocol

- Any new gap discovered post-2026-04-27 is appended to §2 with the next available number.
- Closing a gap requires the SPEC/ADR/sprint reference; "fixed in code" without a doc reference is not enough.
- This document is reviewed at every phase gate (M12 → M15 → M18 → M21 → M24 → M27 → M30 → M33 → M36) and the closure status table in §1 is regenerated.
- The single gate question at every retro: *"Is there a gap in the corpus that doesn't have a row in `11-GAP-CLOSURE-PLAN.md`?"* — if yes, the retro doesn't end until it's added.

---

*Last updated: 2026-04-29 (Chunk 24 + Chunk 25 cross-audits added — see §3.6). Owner: Founder + Architecture lead. Conflicts? `06-PRYZM-IDENTITY-AND-RECOUNT.md` then `08-VISION.md` then `10-MASTER-IMPLEMENTATION-PLAN-36M.md` override. The point of this document is to make "we forgot to close that gap" structurally impossible.*

---

## §3.6 Chunk 24 + Chunk 25 cross-audit additions (2026-04-29)

Both audits live under `phases/audits/PRYZM2-WIREUP-PLAN-S72/`. They surfaced gaps that were not on the original 85-item list because no prior audit walked the disk top-down (Chunk 24) or the document corpus side-by-side (Chunk 25). Both are closed at the same Phase G window the original 85 already hit.

### §3.6.1 Folder-level gaps (Chunk 24 — 17 items, all closed)

| # | Gap | Closes via | Sprint |
|---|---|---|---|
| 86 | `src/tools/` legacy ToolRegistry/SelectionManager unmigrated | Wireup B.6 + G.10 | S74 / S82 |
| 87 | `src/monetization/` UI imports unwired | Wireup B.7 + G.11 | S74 / S82 |
| 88 | `src/import/` legacy DXF/IFC/Rhino parsers unwired | Wireup B.8 + G.12 | S75 / S83 |
| 89 | `src/generative/` not in §5 deletion list | Wireup G.13 | S83 |
| 90 | `src/rendering/` preset/queue helpers unwired | Wireup B.9 + G.14 | S75 / S83 |
| 91 | `src/cde/StructuredName.ts` unwired | Wireup G.15 | S83 |
| 92 | `src/export/` GLB/IFC/sheets exporters unwired | Wireup B.10 + G.16 | S75 / S83 |
| 93 | `src/portfolio/PortfolioSemanticGraph.ts` unwired | **ADR-041** + G.17 | S84 |
| 94 | `src/physics/` + `src/render/` debug overlay unwired | **ADR-042** + G.18 + G.28 | S84 |
| 95 | `src/geospatial/CesiumThreeBridge.ts` unwired | Wireup G.19 | S84 |
| 96 | `src/api/apiFetch.ts` unwired | Wireup G.20 | S84 |
| 97 | `src/snapping/` overlap with `packages/picking` | Wireup G.21 | S84 |
| 98 | `src/spatial/` + `src/topology/` + `src/structural/` overlaps | G.22 + G.23 + G.24 | S84 |
| 99 | `src/migration/` legacy migrators | G.25 (fold into `packages/legacy-shim`) | S84 |
| 100 | `src/collaboration/` + `src/constraints/` + `src/visibility/` overlaps | G.26 + G.27 + G.29 | S84 |
| 101 | `src/elements/` 4 sub-folders unaddressed (openings/preview/roomBoundingLines/structural) | E.15 + E.16 + E.17 + G.24 | S78 / S84 |
| 102 | `plugins/floor` missing from disk (Phase E.6 target) | **E.6.0** scaffolding sub-phase | S76 |

**Decisions still pending (3 ADRs to author before their sub-phase ships):** ADR-041 (portfolio aggregate placement), ADR-042 (`src/physics/` runtime vs dev-only), ADR-043 (`src/utils/*` inline vs `packages/utils`). All three default to no-op-safe positions if not ratified by their sprint window.

### §3.6.2 Document-level gaps (Chunk 25 — 1 item closed, 7 doc-PRs queued)

| # | Gap | Closes via | Sprint |
|---|---|---|---|
| 103 | Customer migration (PRYZM 1 → PRYZM 2) — `CONFLICT-ANALYSIS §6.10` had no owner ADR | **ADR-044 — Customer migration** + Wireup **G.32 — PRYZM 1 lights-out** | S22 latest (ADR) / S84 D9 (G.32 wireup) |

**Doc-only PRs (no schedule slip — all land on S73 D1 alongside Phase A composition root):**
1. `Doc-PR-1` — Banner `05-IMPLEMENTATION-PLAN.md` SUPERSEDED-BY 10-MASTER.
2. `Doc-PR-2` — Banner `07-EXECUTION-PLAYBOOK.md` SUPERSEDED-BY 10-MASTER + `phases/`.
3. `Doc-PR-3` — Delete duplicate `ARCHITECTURE-FILE-STRUCTURE-BREAKDOWN.md`; keep only the `11-` prefixed copy.
4. `Doc-PR-4` — Rewrite `11-ARCHITECTURE-FILE-STRUCTURE-BREAKDOWN.md` to reflect 44 packages / 38 plugins / 12 apps + add `apps/component-editor` row.
5. `Doc-PR-5` — Either author `13-AEC-WISHLIST.md` from `12-BIM-2-AND-3 §1.4` or strike all references to it.
6. `Doc-PR-6` — This §3.6 block (already done in this PR).
7. `Doc-PR-7` — Two-track sprint numbering scheme: `S73-WIRE … S87-WIRE` for the post-S72 wireup, `S73-PG4 … S144-PG8` for the `12-BIM-2-AND-3` post-GA roadmap. Edits land in `00-INDEX.md`, `19-subphases-G-H-catchall.md`, `12-BIM-2-AND-3 §0`.

**Verification gate added:** `pnpm ga-gate` gains a `§23.x — Cross-doc invariants` block (see Chunk 25 §25.8.3) that fails CI if (a) ADR count drops below 44, (b) any duplicate doc reappears, (c) the file-structure breakdown's package/plugin/app counts disagree with `ls`, (d) a SUPERSEDED doc is referenced as authoritative.

### §3.6.3 Updated closure table

| Group | Items | Closed | Partial | Open |
|---|---:|---:|---:|---:|
| Original (§§1–§29 #27) | 85 | 85 | 0 | 0 |
| Chunk 24 (folder-level cross-audit) | 17 | 17 | 0 | 0 |
| Chunk 25 (doc-level cross-audit) | 1 | 1 | 0 | 0 |
| **Running total** | **103** | **103** | **0** | **0** |

The corpus is now closed end-to-end: every Pryzm 1 surface, every NEW_ARCHITECTURE document claim, every CONFLICT-ANALYSIS §6 contradiction has a SPEC, an ADR, and a sub-phase ID. The mandate "**no shortcuts, no patches**" is upheld.
