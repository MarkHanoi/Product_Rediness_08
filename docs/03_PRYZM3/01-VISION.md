# PRYZM 3 — Vision

> **Stamp**: 2026-05-31 · **Status**: CANONICAL · **Authority**: this doc owns engineering intent and principles. When `04-PLAN-FORWARD.md` proposes work that contradicts this doc, this doc wins.
> **Foundation above this doc**: [00-PRODUCT-VISION-AND-BUSINESS-STRATEGY-V1.md](00-PRODUCT-VISION-AND-BUSINESS-STRATEGY-V1.md) (product + business vision; supersedes this doc on any conflict).
> **Cross-cutting synthesis**: [PRYZM3-MASTER-IMPLEMENTATION-PLAN-2026-05-31.md](PRYZM3-MASTER-IMPLEMENTATION-PLAN-2026-05-31.md) — end-to-end delivery plan across all C-contracts.
> **Code-state grounding**: [PRYZM3-PRIOR-ART-AUDIT-2026-05-31.md](PRYZM3-PRIOR-ART-AUDIT-2026-05-31.md) — repository state at 2026-05-31.
> **Source consolidated from**: `archive/superseded-2026-04-30/00_VISION/01-IDENTITY.md`, `02-VISION.md`, `03-AS-IS-VS-TO-BE.md` (the As-Is column moves to `03-CURRENT-STATE.md`; only the To-Be intent stays here).
> **⚠ TRACKER RULE**: If you edit this file, update `00-PROCESS-TRACKER.md` in the same commit (§1 metrics if any number changed; §3/§4 if any wave or deliverable status changed).

This document answers one question: **where do we want to be?** Not how we get there (`04-PLAN-FORWARD.md`), not what shape it takes (`02-ARCHITECTURE.md`), not where we are today (`03-CURRENT-STATE.md`). Just the destination.

---

## §1 — Identity (one paragraph)

PRYZM 3 is a **browser-native, layered, plugin-extensible BIM/AEC editor** for the design–coordinate–document workflow that competes with Autodesk Revit and Graphisoft Archicad on capability, with Bonsai/IFC.js on openness, and with Forma/Qonic/Motif on collaborative speed. The product surface is a **single white UI** that runs identically on every device with a modern browser; the engine surface is a **single composition root** (`composeRuntime()`) that returns a single typed runtime handle (`PryzmRuntime`); the file format is a **single open format** (`.pryzm`) that round-trips losslessly with IFC4. The 5 customer archetypes (§6) get one tool, not five.

---

## §2 — The 8 architectural principles (P1–P8)

These are the binding architectural commitments. Every one has a CI gate. Violations block merge.

| # | Principle | What it means | CI gate |
|---|---|---|---|
| **P1** | **Single composition root** | One `composeRuntime()`. Production startup uses it. No parallel composition. | `scripts/ci-check-single-compose.ts` (Phase D exit gate) |
| **P2** | **Single THREE owner** | Only `packages/renderer-three/` may `import * as THREE`. | `eslint-plugin-boundaries` |
| **P3** | **Single rAF** | Only `packages/runtime-composer/src/scheduler.ts` calls `requestAnimationFrame`. All other animations subscribe to the frame bus. | `scripts/ci-check-single-raf.ts` |
| **P4** | **No `(window as any)`** | The escape hatch is forbidden. The only allowlisted file is `src/legacy/window-shim.ts` (transitional). | `scripts/ci-check-no-window-any.ts` (cast-count tripwire today; hard-fail at Phase E exit) |
| **P5** | **Schemas are pure** | L0 (`packages/schemas/`) has zero I/O imports, zero THREE, zero DOM. The CI script (still named `ci-check-domain-purity.ts`) scans `packages/schemas/` — `packages/domain/` never existed. | `scripts/ci-check-domain-purity.ts` |
| **P6** | **Commands are the only state mutation path** | UI dispatches commands; commands flow through `commandBus` → handlers → store. No direct store writes from UI. | `scripts/ci-check-no-direct-store-writes.ts` |
| **P7** | **Visibility intent ≠ UI state** | `packages/visibility/` is a first-class domain concept, not a UI concern. Plugins and AI can express intent without owning UI. | per-package contract test |
| **P8** | **Sync conflicts are explicit** | CRDT merges that lose information surface as user-resolvable conflicts, never silently picked. Every new public function must add ≥ 1 OpenTelemetry span. | per-PR span check |

The 6 of 8 that have hard CI gates today are P2, P3, P5, P6, P7, P8. P1 and P4 are soft-fail counters that become hard at Phase D and Phase E exit respectively (see `04-PLAN-FORWARD.md §6` and `§7`).

---

## §3 — The 8 layers (L0 → L7.5)

The layered model is the vehicle for the principles. Each layer has an owner package, a clear responsibility, and a hard import allowlist.

| Layer | Owner (verified 2026-05-01) | Responsibility | Allowed imports |
|---|---|---|---|
| **L0 — Schemas** | `packages/schemas/` (3,016 LOC, Zod) | Canonical Zod schemas for all entities. No I/O, no THREE, no DOM. Foundation for every other package. | std lib + zod only |
| **L1 — Infrastructure** | `packages/command-bus/`, `packages/frame-scheduler/`, `packages/picking/`, `packages/visibility/`, `packages/ai-cost/`, `packages/sync-client/`, `packages/runtime-undo-stack/`, `packages/input-host/`, `packages/physics-host/`, `packages/renderer-three/`, `packages/ui/`; stubs: `packages/snapping/`, `packages/spatial-index/` | Leaf infrastructure: command dispatch, rAF scheduling, 3-D picking + snapping, VG governance, AI cost, real-time sync, undo stack, input/physics hosts, THREE adapter, UI atoms. **No internal @pryzm/* deps.** | L0 or std lib only |
| **L1½ — L0 consumers** | `packages/protocol/` → schemas; `packages/drawing-primitives/` → schemas | Wire protocol types; 2-D geometry primitives. | L0 |
| **L2 — Domain logic** | `packages/geometry-kernel/` → drawing-primitives + protocol + schemas (12,264 LOC — largest package); `packages/ai-host/` → ai-cost; `packages/types-builtin/` → protocol + schemas | BREP/CSG ops, hidden-line, dimension compute, IFC schema validators, AI workflow orchestration. | L0, L1 |
| **L3 — State** | `packages/stores/` → ai-host + command-bus + schemas | Zustand stores; the single mutable state surface. **`composeRuntime()` writes to stores; UI reads from stores.** | L0–L2 |
| **L4 — Scene + Persistence** | `packages/scene-committer/` → drawing-primitives + stores; `packages/persistence-client/` → command-bus + stores (5,974 LOC); `packages/renderer/` → frame-scheduler + scene-committer; `packages/render-runtime/` → scene-committer + stores | THREE scene dispatch, Supabase persistence, abstract renderer, render loop. | L0–L3 |
| **L5 — File + View** | `packages/file-format/` → persistence-client (3,928 LOC); `packages/view-state/` → frame-scheduler + renderer + stores | PRYZM native file format (read/write); view state machine. | L0–L4 |
| **L6 — Composition root** | `packages/runtime-composer/` (3,912 LOC) — `composeRuntime()` | Pulls input-host, physics-host, renderer, renderer-three, runtime-undo-stack, stores, sync-client, view-state into a single `PryzmRuntime`. **Boolean #4 ✅.** | L0–L5 |
| **L7 — UI** | `packages/ui-base/` → runtime-composer + ui | Foundational UI atoms bound to the runtime. | L0–L6 |
| **L8 — Plugin SDK** | `packages/plugin-sdk/` **v1.0.0** ✅ (Wave A20 2026-05-04 — K3-C gate CLOSED; `publishConfig.name=@pryzm/sdk`; CHANGELOG.md; npm-publish ready — manual step pending: `pnpm --filter @pryzm/sdk publish --access public`) | Public, versioned API for third-party plugins. Ed25519 signing, iframe sandbox, 6 host proxies, `pryzm dev` CLI, bSDD lookup client. | L0–L6 (curated subset) |
| **L9 — Plugins** | `plugins/*` (**47 plugins** — BCF, IFC export/import/inspector, Rhino import, wall, door, window, column, beam, stair, slab, ceiling, curtain-wall, roof, floor, furniture, dimensions, grid, rooms, sheets, views, selection, navigate, render, plan-view, section-view, lighting, plumbing, annotations, ai-floorplan, ai-generative, ai-query, ai-rules, ai-voice, dxf, export-pdf, multiplayer, schedules, structural, handrail, levels, cross, visibility-intent, family-editor) | Vendor-or-community-authored extensions. | **L8 only** (no direct L0–L7 access) |
| **L9.5 — Runtime UI shell** | `src/` (2 folders: `engine/`, `ui/`) — transitional | The white-box production app shell. **Monotonically shrinking** — 35 → 2 folders via S87–S97-WIRE + Waves 10–11; target: only `src/ui/` remains (boolean #1). | All layers — legacy concession; shrinks toward zero |

> **Corrections (deep-audit 2026-05-01; updated 2026-05-04 rev 23):** `packages/domain/` (referenced in original) — **never existed**; schemas live in `packages/schemas/`. `packages/event-bus/` — **never existed**; routing is `packages/command-bus/`. `packages/registries/` — **never existed**; registries are `PryzmRuntime` typed slots. Plugin count 38 → **47** (verified 2026-05-04: `ls plugins/ | wc -l` = 47; +`plugins/family-editor/` stub added Wave A20). Package count **58**, app count **13** (corrected 2026-05-04 rev 23: `ls -d packages/*/` = 58; `ls -d apps/*/` = 13). See `02-ARCHITECTURE.md §5` and `04-PLAN-FORWARD/16-PACKAGE-DEPENDENCY-MAP.md` for the full verified map.

The dependency rule (CI-enforced): **a higher layer may import from a lower layer; the reverse is forbidden**. The full boundary lint matrix is in `02-ARCHITECTURE.md §2`.

---

## §4 — The 13 differentiators (D1–D13)

What makes PRYZM 3 different from Revit / Archicad / Forma / Qonic / Motif / Bonsai. These are the bets.

| # | Differentiator | Why it matters | Reference |
|---|---|---|---|
| **D1** | **Open `.pryzm` file format** | Round-trips losslessly with IFC4. No vendor lock-in. | SPEC-26 |
| **D2** | **Run-anywhere browser-native** | No installer, no Windows-only, no per-seat license server. Works on iPad, Chromebook, Linux. | SPEC-15 |
| **D3** | **Real-time multi-user with explicit conflicts** | CRDT-backed; conflicts surface to the user, never silently resolved. (P8) | SPEC-03, ADR-002 |
| **D4** | **Plugin SDK with marketplace** | Third-party developers ship paid extensions through `marketplace.pryzm.app`. Revenue share defined. | SPEC-09, ADR-009 |
| **D5** | **AI as a first-class layer (L7.5)** | Visibility intent + plan critique + 3-options generation as runtime plugins, not bolted-on. | SPEC-07, SPEC-46, SPEC-47 |
| **D6** | **Sovereignty default** | EU customers default to EU region; customer-managed keys (BYOK) supported. | ADR-037, ADR-038, SPEC-34, SPEC-35 |
| **D7** | **Self-host minimum** | A team of 5 can run PRYZM 3 on their own AWS account in < 1 day. | ADR-012 |
| **D8** | **Federated clash detection** | BCF round-trip with Solibri, Navisworks, BIMcollab — works as the third party in a federated review. | SPEC-37, ADR-007 |
| **D9** | **Pascal-editor-grade family creation** | First-class component/family editor, not an afterthought. Targets parity with Revit Family Editor. | SPEC-FAMILY-EDITOR, ADR-001 |
| **D10** | **Honest performance contracts** | 17 NFTs (§5) measured every sprint in CI, not at GA-1. | SPEC-31, ADR-006 |
| **D11** | **Architecturally sound Sheet & PDF export** | Publication-grade vector PDF + DWG with proper drawing frames, title blocks, multi-viewport layouts, scale bars, dimension annotation, revision tracking, sheet sets. The deliverable architects expect — not a raster screenshot. Governs the existing `plugins/sheets/` (PRYZM 2 S37) + fills the typed-stub `packages/drawing-primitives/src/backends/pdf.ts`. Added 2026-05-31. | [C24](../00_Contracts/C24-SHEET-COMPOSITION-ENGINE.md), [C29](../00_Contracts/C29-PDF-VECTOR-EXPORT.md), [C30](../00_Contracts/C30-DRAWING-SET-MANAGEMENT.md) |
| **D12** | **Native Revit round-trip** | Bidirectional `.rvt`/`.rfa` ↔ `.pryzm` via IFC4 as canonical bridge, plus an optional external Python adapter for Revit-API-specific extensions (phasing / worksets / design options). Unblocks consultant ecosystem (which runs on Revit). Added 2026-05-31. | [C26](../00_Contracts/C26-REVIT-ROUND-TRIP.md), depends on production-grade [C25 IFC](../00_Contracts/C25-IFC-EXPORT-PRODUCTION.md) |
| **D13** | **BIM 3.0 Inspect & Data Model** | Hierarchical model tree (Site → Building → Level → Apartment → Room → Element) with selection-driven viewport isolation, next-generation graphical data dashboards per node type, live data layer for `check / automate / update / review`. Governs the existing `plugins/schedules/` (PRYZM 2 S41) as foundation; supersedes the flat `apps/editor/src/ui/PropertyInspector.ts` (80 files) with documented migration. Added 2026-05-31. | [C27](../00_Contracts/C27-BIM3-INSPECT-MODEL.md), [C28](../00_Contracts/C28-DATA-PANEL-AND-AUTOMATION.md) |

---

## §5 — Non-functional targets (the 17 NFTs)

These are the **measured contracts**. Each runs as a benchmark in CI (`apps/bench/src/benches/*.bench.ts`). Shell files exist today; Wave 13 writes real measurement bodies (see `04-PLAN-FORWARD/18-WAVES-13-15-ZERO-WASTE.md §1`).

> **W8-D5 alignment (2026-05-01); Wave 13 ✅ (2026-05-01)**: bench file references updated from placeholder `.ts` paths to the canonical `.bench.ts` names used in Wave-13 bench table. **All 17 NFT bench files written and passing** (Wave 13 COMPLETE 2026-05-01 — `cold-boot`, `project-load`, `tool-latency`, `frame-budget`, `plan-view-redraw`, `sheet-view-redraw`, `crdt-merge`, `sync-conflict`, `ifc-import-tier1`, `ifc-export-tier1`, `bcf-roundtrip`, `family-load`, `schedule-rebuild`, `ai-critique`, `bundle-size`, `memory-ceiling`, `plugin-sandbox-overhead`; 6 missing workspace deps added to `apps/bench/package.json`). Verified: `ls apps/bench/src/benches/*.bench.ts | wc -l` → 17 ✅.

| # | NFT | Target | Measured by |
|---|---|---|---|
| 1 | Cold-boot to first paint | < 2.5 s on M1 / Chrome | `apps/bench/src/benches/cold-boot.bench.ts` |
| 2 | Project-load (10k elements) | < 6 s p95 | `apps/bench/src/benches/project-load.bench.ts` |
| 3 | Tool latency (click → visible) | < 50 ms p95 | `apps/bench/src/benches/tool-latency.bench.ts` |
| 4 | Frame budget (interactive viewport) | 16.6 ms p95 (60 FPS) | `apps/bench/src/benches/frame-budget.bench.ts` |
| 5 | Plan-view re-render after edit | < 100 ms p95 | `apps/bench/src/benches/plan-view-redraw.bench.ts` |
| 6 | Sheet-view re-render | < 200 ms p95 | `apps/bench/src/benches/sheet-view-redraw.bench.ts` |
| 7 | CRDT merge (2 concurrent users) | < 80 ms p95 | `apps/bench/src/benches/crdt-merge.bench.ts` |
| 8 | Sync conflict surface | < 1 s from second-user save | `apps/bench/src/benches/sync-conflict.bench.ts` |
| 9 | IFC import (Tier-1, 50 MB) | < 30 s | `apps/bench/src/benches/ifc-import-tier1.bench.ts` |
| 10 | IFC export (Tier-1, 10k elements) | < 20 s | `apps/bench/src/benches/ifc-export-tier1.bench.ts` |
| 11 | BCF round-trip (issue cycle) | < 4 s | `apps/bench/src/benches/bcf-roundtrip.bench.ts` |
| 12 | Family load (medium, 200 params) | < 200 ms | `apps/bench/src/benches/family-load.bench.ts` |
| 13 | Schedule rebuild (10k rows) | < 500 ms p95 | `apps/bench/src/benches/schedule-rebuild.bench.ts` |
| 14 | AI plan-critique latency | < 8 s e2e | `apps/bench/src/benches/ai-critique.bench.ts` |
| 15 | Bundle size (editor app) | < 4 MB gzipped | `apps/bench/src/benches/bundle-size.bench.ts` |
| 16 | Memory ceiling (10k elements, 1 h session) | < 1.5 GB | `apps/bench/src/benches/memory-ceiling.bench.ts` |
| 17 | Plugin sandbox overhead | < 5 % CPU vs native call | `apps/bench/src/benches/plugin-sandbox-overhead.bench.ts` |

---

## §6 — Customer archetypes (C1–C5)

What we are building for. Plan and pricing decisions trace back to these.

| # | Archetype | Size | Pain point we solve | Pricing tier |
|---|---|---|---|---|
| **C1** | Solo architect | 1 seat | Revit too expensive, Archicad too Mac-bound, Bonsai too DIY | $25 / mo |
| **C2** | Small studio (AEC boutique) | 2–10 seats | Per-seat Revit cost; collaboration friction with consultants | $15 / seat / mo |
| **C3** | Mid-size firm with consultants | 11–50 seats | Federated clash detection, BCF round-trip, BIM coordinator overhead | $35 / seat / mo + clash module |
| **C4** | Enterprise / GC | 50+ seats | Sovereignty, BYOK, audit trail, self-host | $100 / seat / mo + enterprise SKU |
| **C5** | Plugin developer | 0 seats — revenue partner | Need a marketplace and SDK to monetize their domain expertise | 30/70 revenue share via `marketplace.pryzm.app` |

The 5 archetypes drive feature prioritization. A feature only ships if it serves at least one archetype clearly. The 195 Phase F sub-phases trace to C5 (full execution plan: `04-PLAN-FORWARD/20-PHASE-F-PLAN.md`); the federated-clash work traces to C3 + C4; the white UI traces to all of C1–C4.

---

## §7 — Non-goals (what PRYZM 3 explicitly is NOT)

Equally important to keep the scope honest. These are out of scope **for PRYZM 3** (some return in PRYZM 4):

- **Native desktop apps**. PRYZM 3 is browser-only. Native apps are PRYZM 4 Stage γ.
- **Full structural analysis**. We do round-tripping with structural analysis tools (SPEC-42 analysis bridge) but do not do FEM ourselves.
- **Generative design as a primary surface**. AI assists (D5); it does not generate buildings autonomously.
- **Construction-phase scheduling primary tool**. We export to 4D/5D tools; we are not Synchro/Asta.
- **Facility management primary tool**. We export COBie (SPEC-36); we are not Archibus/Maximo.
- **Photorealistic rendering**. We round-trip to V-Ray/Enscape/Twinmotion; the in-app viewport is design-grade, not visualization-grade.
- **PDF-to-BIM as a primary on-ramp** (SPEC-45 + ADR-029 keeps it deliberately scoped).

---

## §8 — Discipline rules (binding)

These five rules govern how we work. Violations are merge blockers, not "best efforts".

1. **When a discrepancy is discovered, EDIT the canonical document.** Do not write a new `*-AUDIT-2026-MM-DD.md`. The reason `archive/superseded-audits/` has 43 files is that we did this 43 times.
2. **A sub-phase is "done" when the runtime behaviour matches the spec.** Documentation-only changes do not advance the sub-phase counter. Annotation sweeps do not count as binding.
3. **The 13 metrics in `03-CURRENT-STATE.md §1` are re-run every sprint close.** Any positive delta on a tripwired metric is an incident.
4. **Phase F (plugin SDK + marketplace) cannot start until the 9 convergence booleans (`02-ARCHITECTURE.md §8`) reach 6/9 true.** This is the ratchet that prevents Phase F from being built on a broken foundation.
5. **Every PR adding a new public function adds ≥ 1 OpenTelemetry span** (P8). No span = no merge.

---

## §9 — What this document is NOT

- Not a sprint plan — `04-PLAN-FORWARD.md`.
- Not the architecture shape — `02-ARCHITECTURE.md`.
- Not a status snapshot — `03-CURRENT-STATE.md`.
- Not a competitive landscape document — `reference/plan-detail/05-POST-GA-ROADMAP.md` and the AEC wishlist (`reference/plan-detail/06-AEC-WISHLIST.md`) carry the full competitive analysis.
- Not the per-decision rationale — `reference/adrs/` (45 ADRs) own each decision.
- Not the per-system contract — `reference/specs/` (40 SPECs) own each contract.
