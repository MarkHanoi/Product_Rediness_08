# PRYZM — Engineering Vision

> **Stamp**: 2026-06-01 · **Status**: CANONICAL · **Rewrite basis**: full code audit, 2026-06-01.
> **Authority**: this doc owns engineering intent and principles. When sprint plans propose work that contradicts this doc, this doc wins. When this doc disagrees with the code, this doc updates (per [operating-principles O5](./operating-principles.md)).
> **Foundation above**: [manifesto.md](./manifesto.md) → [product-vision.md](./product-vision.md) → [positioning.md](./positioning.md)
> **Companion**: [architecture.md](./architecture.md) (system shape + boundary matrix + composition root)
> **Per-package detail**: [architecture-breakdown.md](./architecture-breakdown.md)

This document answers one question: **where do we want to be?** Not how we get there (`03-execution/plans/`), not the shape (`architecture.md`), not where we are today (`03-execution/status/`). Just the destination + the binding commitments.

---

## §1 — Identity (one paragraph)

PRYZM is a **browser-native, layered, plugin-extensible BIM/AEC editor + design intelligence platform** for the design-coordinate-document workflow that competes with Autodesk Revit and Graphisoft Archicad on capability, with Bonsai/IFC.js on openness, and with Forma/Qonic/Motif/Pascal on collaborative speed. The product surface is a **single coherent UI** that runs identically on every device with a modern browser (per [C44](../02-decisions/contracts/C44-MOBILE-AND-TABLET.md), [C45](../02-decisions/contracts/C45-BROWSER-AND-DEVICE-MATRIX.md)). The engine surface is a **single composition root** (`composeRuntime()` in `packages/runtime-composer/`) that returns a single typed runtime handle (`PryzmRuntime`). The file format is a **single open format** (`.pryzm`, ZIP container, MessagePack events + GLB content-addressed chunks, manifest schema v1 frozen) that round-trips losslessly with IFC4X3. The 5 customer archetypes (§7) get one tool, not five.

---

## §2 — The 8 architectural principles (P1–P8)

These are the binding architectural commitments. Each has a CI gate. Violations block merge.

| # | Principle | What it means | CI gate (current state) |
|---|---|---|---|
| **P1** | **Single composition root** | One `composeRuntime()` in `packages/runtime-composer/src/composeRuntime.ts`. Production startup uses it. No parallel composition. | `scripts/ci-check-single-compose.ts` (soft-fail tripwire; ratchets to hard-fail) |
| **P2** | **Single THREE owner** | `import * as THREE` only allowed in `packages/renderer-three/` (specifically `three-re-export.ts`). Other packages import via `@pryzm/renderer-three/three`. | `tools/ga-gate/check-three-imports.ts` + `eslint-plugin-boundaries` — **hard-fail ✅** |
| **P3** | **Single rAF** | `requestAnimationFrame()` is called only in `packages/frame-scheduler/src/RafAdapter.ts:41`. All other animation subscribes to the frame bus. | `tools/ga-gate/check-raf-count.ts` — **hard-fail ✅** |
| **P4** | **No `(window as any)`** | The escape hatch is forbidden outside the allowlisted shim. | `eslint-baseline-window-as-any.json` cast-count tripwire (soft-fail, no-increase) |
| **P5** | **Schemas are pure** | L0 (`packages/schemas/`) has zero I/O imports, zero THREE, zero DOM. | `scripts/ci-check-domain-purity.ts` — **hard-fail ✅** |
| **P6** | **Commands are the only mutation path** | UI dispatches commands; commands flow through `commandBus` → handlers → stores. No direct store writes from UI. | `scripts/ci-check-no-direct-store-writes.ts` — **hard-fail ✅** |
| **P7** | **Visibility intent ≠ UI state** | `packages/visibility/` is a first-class domain concept, not a UI concern. Plugins and AI can express intent without owning UI. Waves 1-5 shipped; waves 6-11 land at S49. | per-package contract test (`packages/visibility/__tests__/intent-not-ui.test.ts`) — **hard-fail ✅** |
| **P8** | **Sync conflicts explicit + every public function has ≥ 1 OpenTelemetry span** | CRDT merges that lose information surface as user-resolvable conflicts, never silently picked. Yjs CRDT in `packages/sync-client/`. | `tools/ga-gate/check-otel-spans.ts` — **hard-fail ✅** |

**Today**: 6 of 8 hard-fail (P2, P3, P5, P6, P7, P8); 2 are soft-fail counters (P1, P4) ratcheting to hard-fail at the relevant phase exits.

---

## §3 — The layered model (L0 → L9.5)

Codified in [architecture.md §1](./architecture.md). Each layer has an owner package, a clear responsibility, and a hard import allowlist. The full inventory (verified 2026-06-01):

- **L0** — `packages/schemas/` — Zod schemas; foundation for every package
- **L1** — 13 infrastructure packages (command-bus, frame-scheduler, picking, visibility, snapping, spatial-index, ai-cost, sync-client, runtime-undo-stack, input-host, physics-host, renderer-three, drawing-primitives, protocol)
- **L2** — 4 domain logic packages (geometry-kernel, ai-host, constraint-solver, types-builtin) + 13 geometry-* packages (geometry-wall, -door, -window, -slab, -roof, -stair, -column, -beam, -curtain-wall, -lighting, -plumbing, -furniture, with ceiling producer in geometry-kernel)
- **L3** — `packages/stores/` — the single mutable state surface
- **L4** — 5 packages (scene-committer, persistence-client, renderer, render-runtime, legacy-shim)
- **L5** — 2 packages (file-format, view-state)
- **L6** — 2 packages (runtime-composer, ui-base) — composition root + foundational UI atoms
- **L7** — 13 apps (editor, marketplace, marketplace-web, marketplace-api, sync-server, ai-worker, bake-worker, export-worker, api-gateway, component-editor, docs-site, cli, bench)
- **L8** — `packages/plugin-sdk/` v1.0.0 (published as `@pryzm/sdk`) — public SDK facade
- **L9** — 47 plugins under `plugins/*`
- **L7.5** — `src/` (7 files, 0 subdirs) — transitional legacy zone; monotonically shrinks toward zero

The dependency rule (CI-enforced): a higher layer may import from a lower layer; the reverse is forbidden. L7.5 is the only zone permitted to import from any other.

**Total: 79 packages, 13 apps, 47 plugins** (verified `ls -d packages/*/`, `ls -d apps/*/`, `ls -d plugins/*/`).

---

## §4 — The 13 differentiators (D1–D13)

What makes PRYZM different from Revit / Archicad / Forma / Qonic / Motif / Bonsai / Pascal. These are the bets. Each connects to a binding contract.

| # | Differentiator | Why it matters | Contracts |
|---|---|---|---|
| **D1** | **Open `.pryzm` file format** | Round-trips losslessly with IFC4X3. No vendor lock-in. ZIP container; manifest schema v1 frozen. | [C05](../02-decisions/contracts/C05-PERSISTENCE-AND-FILE-FORMAT.md), [C25](../02-decisions/contracts/C25-IFC-EXPORT-PRODUCTION.md), [C47](../02-decisions/contracts/C47-FILE-FORMAT-VERSIONING.md) |
| **D2** | **Run-anywhere browser-native** | No installer, no Windows-only, no per-seat license server. Works on iPad, Chromebook, Linux. Codified browser support per Tier 1/2/3. | [C44](../02-decisions/contracts/C44-MOBILE-AND-TABLET.md), [C45](../02-decisions/contracts/C45-BROWSER-AND-DEVICE-MATRIX.md) |
| **D3** | **Real-time multi-user with explicit conflicts** | CRDT-backed (Yjs in `packages/sync-client/`); conflicts surface to the user, never silently resolved (P8). Socket.io broadcast; project-scoped room. | [C08](../02-decisions/contracts/C08-COLLABORATION-AND-SECURITY.md) |
| **D4** | **Plugin SDK with marketplace** | Third-party developers ship paid extensions through `marketplace.pryzm.app`. 70/30 revenue share. iframe sandbox + Ed25519 signing. `packages/plugin-sdk/` v1.0.0 ready for npm publish. | [C07](../02-decisions/contracts/C07-PLUGIN-SDK-AND-MARKETPLACE.md), [C40](../02-decisions/contracts/C40-MARKETPLACE-ECONOMICS.md) |
| **D5** | **AI as a first-class layer** | 7 workflows in `packages/ai-host/src/workflows/`: Generate3Options, PlanCritique, VoiceCommand, apartmentLayout, ceilingLayout, furnishLayout, lightingLayout. Includes deterministic engines (D-TGL, D-FLE, D-LE, D-CE) for offline operation. Routes through Anthropic via direct API or CF Worker. | [C09](../02-decisions/contracts/C09-AI-AND-VISIBILITY-INTENT.md), [C23](../02-decisions/contracts/C23-PROVENANCE-AND-AI-AUDIT.md) |
| **D6** | **Sovereignty default** | EU customers default to EU region; customer-managed keys (BYOK) supported. Never crosses sovereignty on failover. | [C49](../02-decisions/contracts/C49-MULTI-REGION-AND-SOVEREIGNTY.md), [C22](../02-decisions/contracts/C22-PRIVACY-AND-PII-TIER.md) |
| **D7** | **Self-host minimum** | A team of 5 can run PRYZM on their own AWS account in < 1 day. Docker + Helm + Terraform path documented. | [C48](../02-decisions/contracts/C48-BACKUP-AND-DR.md), [C49](../02-decisions/contracts/C49-MULTI-REGION-AND-SOVEREIGNTY.md) |
| **D8** | **Federated clash detection** | BCF round-trip with Solibri, Navisworks, BIMcollab — works as the third party in a federated review. `plugins/bcf/` shipped. | [C36](../02-decisions/contracts/C36-CLASH-DETECTION-AND-COORDINATION.md) |
| **D9** | **Pascal-editor-grade family creation** | First-class component/family editor. `apps/component-editor/` (functional, not scaffold) with sketcher, planegcs constraint solver, 3D ops, parameter table. `.pryzm-family` ZIP format. | [C07](../02-decisions/contracts/C07-PLUGIN-SDK-AND-MARKETPLACE.md), SPEC-FAMILY-FORMAT |
| **D10** | **Honest performance contracts** | 68 benchmarks in `apps/bench/src/benches/*.bench.ts` measured every PR in CI, not at GA-1. Baseline regression gate. | [C10](../02-decisions/contracts/C10-PERFORMANCE-AND-OBSERVABILITY.md) |
| **D11** | **Architecturally sound Sheet + PDF export** | Publication-grade vector PDF + DWG via `plugins/sheets/` + `packages/drawing-primitives/`. Title blocks per regional drawing standards. Revision tracking + sheet sets. | [C24](../02-decisions/contracts/C24-SHEET-COMPOSITION-ENGINE.md), [C29](../02-decisions/contracts/C29-PDF-VECTOR-EXPORT.md), [C30](../02-decisions/contracts/C30-DRAWING-SET-MANAGEMENT.md), [C34](../02-decisions/contracts/C34-PRINT-AND-DRAWING-STANDARDS.md) |
| **D12** | **Native Revit round-trip** | Bidirectional `.rvt`/`.rfa` ↔ `.pryzm` via IFC4X3 as canonical bridge + optional Python adapter for Revit-API-specific extensions (phasing / worksets / design options). | [C26](../02-decisions/contracts/C26-REVIT-ROUND-TRIP.md) |
| **D13** | **BIM 3.0 Inspect + Data Model** | Hierarchical model tree (Site → Building → Level → Apartment → Room → Element) with selection-driven viewport isolation. Live data layer for `check / automate / update / review`. | [C27](../02-decisions/contracts/C27-BIM3-INSPECT-MODEL.md), [C28](../02-decisions/contracts/C28-DATA-PANEL-AND-AUTOMATION.md) |

---

## §5 — Non-functional targets (the 68 benchmarks)

The **measured contracts**. Every bench runs in CI (`apps/bench/src/benches/*.bench.ts`) with baseline regression gates.

### §5.1 — Headline NFTs (the public commitment)

These are the customer-facing performance promises codified in [C10](../02-decisions/contracts/C10-PERFORMANCE-AND-OBSERVABILITY.md):

| # | NFT | Target | Bench file |
|---|---|---|---|
| 1 | Cold-boot to first paint | < 2.5 s on M1 / Chrome | `cold-boot.bench.ts` |
| 2 | Project-load (10k elements) | < 6 s p95 | `load-large.bench.ts` |
| 3 | Tool latency (click → visible) | < 50 ms p95 | `cmd-execute-latency.bench.ts` |
| 4 | Frame budget (interactive viewport) | 16.6 ms p95 (60 FPS) | `frame-budget.bench.ts` |
| 5 | Plan-view re-render after edit | < 100 ms p95 | `plan-view-redraw.bench.ts` |
| 6 | Sheet-view re-render | < 200 ms p95 | `sheet-view-redraw.bench.ts` |
| 7 | CRDT merge (2 concurrent users) | < 80 ms p95 | `crdt-merge.bench.ts` |
| 8 | Sync conflict surface | < 1 s from second-user save | `sync-conflict.bench.ts` |
| 9 | IFC import (Tier-1, 50 MB) | < 30 s | `ifc-import-tier1.bench.ts` |
| 10 | IFC export (Tier-1, 10k elements) | < 20 s | `ifc-export-tier1.bench.ts` |
| 11 | BCF round-trip (issue cycle) | < 4 s | `bcf-roundtrip.bench.ts` |
| 12 | Family load (medium, 200 params) | < 200 ms | `family-load.bench.ts` |
| 13 | Schedule rebuild (10k rows) | < 500 ms p95 | `schedule-rebuild.bench.ts` |
| 14 | AI plan-critique latency | < 8 s e2e | `ai-critique.bench.ts` |
| 15 | Bundle size (editor app) | < 4 MB gzipped | `bundle-size.bench.ts` |
| 16 | Memory ceiling (10k elements, 1 h session) | < 1.5 GB | `memory-ceiling.bench.ts` |
| 17 | Plugin sandbox overhead | < 5 % CPU vs native call | `plugin-sandbox-overhead.bench.ts` |

### §5.2 — The full benchmark surface

The 68 benchmarks extend beyond the headline NFTs. Categories:

- **Element geometry producers** (12) — `produce-wall`, `produce-door`, `produce-window`, `produce-slab`, `produce-roof`, `produce-stair`, `produce-column`, `produce-beam`, `produce-ceiling`, `produce-curtain-wall`, `produce-lighting`, `produce-plumbing`
- **Load perf** (4) — `load-small`, `load-medium`, `load-large`, `cold-load-real`
- **Interchange** (3) — IFC import/export Tier 1, BCF round-trip
- **Constraint / snap / pick** (3) — `constraint-solve-latency`, `snap-latency`, `pick-latency`
- **Persistence** — `save`, `restore`, `undo`, `redo`
- **UI overhead** — `auth-modal-open`, `tool-activate`, `panel-base-overhead`
- **AI** — `ai-cost`, `ai-critique`, `pdf-to-bim`
- **Sync** — `awareness-throughput`, `sync-merge`, `crdt-merge`
- **Memory / CPU** — `memory-ceiling`, `cpu-idle`

Per-bench JSON output is committed to baselines; CI fails on regressions beyond a defined tolerance band.

---

## §6 — The 21 CI gates

Located in `tools/ga-gate/check-*.ts`. Run by `tools/ga-gate/run-all.ts`. Merge-blocking on main. Complete list in [architecture.md §5](./architecture.md). Categories:

- **Principle enforcement** — `check-three-imports` (P2), `check-raf-count` (P3), `check-otel-spans` (P8), per-package compile (P5)
- **Legacy elimination** — `check-no-commandmanager`, `check-no-workspacemountbridge`, `check-apps-editor-ghost-dirs`, `check-engine-bootstrap-loc`
- **Tripwires** — `check-cast-count` (P4 baseline), `check-commandmanager-any`, `check-window-store-in-packages`, `check-custom-event-{apps,packages}`
- **Security + correctness** — `check-xss-guards`, `check-structuredclone-new-commands`, `check-project-isolation`
- **Surface integrity** — `check-l7-boundary`, `check-scene-graph`, `check-geometry-ceiling`, `check-ctrl-z-wired`, `check-motion-gate-coverage`

The contract suite (C24+) introduces additional per-contract gates landing as each contract implements.

---

## §7 — Customer archetypes (C1–C5)

What we build for. Plan and pricing decisions trace back to these archetypes; the deep personas live in [personas.md](./personas.md).

| # | Archetype | Size | Pain point we solve | Tier (per [C39](../02-decisions/contracts/C39-PRICING-AND-PLAN-TIERS.md)) |
|---|---|---|---|---|
| **C1** | Solo architect | 1 seat | Revit too expensive, Archicad too Mac-bound, Bonsai too DIY | Solo — $25 / mo |
| **C2** | Small studio (AEC boutique) | 2–10 seats | Per-seat Revit cost; collaboration friction with consultants | Studio — £15 / seat / mo |
| **C3** | Mid-firm with consultants | 11–50 seats | Federated clash detection, BCF round-trip, BIM coordinator overhead | Mid-firm — $35 / seat / mo + clash module |
| **C4** | Enterprise / GC / institutional | 50+ seats | Sovereignty, BYOK, audit trail, self-host, SOC 2 evidence | Enterprise — custom, named CSM |
| **C5** | Plugin developer | 0 seats — revenue partner | Need a marketplace and SDK to monetise their domain expertise | 30/70 revenue share via `marketplace.pryzm.app` |

The 5 archetypes drive feature prioritisation. A feature only ships if it serves at least one archetype clearly.

---

## §8 — Non-goals (what PRYZM explicitly is NOT)

Equally important to keep the scope honest. These are out of scope; some return in later phases:

- **Native desktop apps**. PRYZM is browser-only (per D2). PWA install is supported; we ship no Electron or Tauri wrapper.
- **Full structural analysis**. We round-trip with structural analysis tools (Tekla, ETABS, SAP via IFC) but do not solve FEM ourselves.
- **Generative design as a primary autonomous surface**. AI assists (D5); it does not generate buildings without an architect in the loop.
- **Construction-phase scheduling as a primary tool**. We export to 4D/5D tools per [C37](../02-decisions/contracts/C37-SCHEDULE-4D.md); we are not Synchro/Asta.
- **Facility management as a primary tool**. We export COBie per [C35](../02-decisions/contracts/C35-COBIE-FM-HANDOVER.md); we are not Archibus/Maximo.
- **Photorealistic rendering**. We round-trip to V-Ray/Enscape/Twinmotion; the in-app viewport is design-grade, not visualization-grade.
- **PDF-to-BIM as a primary on-ramp**. Out of core scope; a marketplace plugin opportunity.
- **Full structural / MEP detailing**. We author at the architectural level; consultants take over via IFC.

---

## §9 — Discipline rules (binding)

These five rules govern how the team works on the code. Violations are merge blockers, not "best efforts".

1. **When a discrepancy is discovered, EDIT the canonical document.** Do not write a new `*-AUDIT-YYYY-MM-DD.md`. The reason the legacy archive has 43 superseded audits is that we did this 43 times. Per [C31 §1.2](../02-decisions/contracts/C31-DOCUMENTATION-AUTHORING-PROTOCOL.md) + [operating-principles O5](./operating-principles.md).
2. **A sub-phase is "done" when the runtime behaviour matches the spec.** Documentation-only changes do not advance the sub-phase counter. Annotation sweeps do not count as binding.
3. **The convergence booleans are re-run every sprint close.** Any positive delta on a tripwired metric is an incident.
4. **Every PR adding a new public function adds ≥ 1 OpenTelemetry span** (P8). No span = no merge.
5. **The contract suite is the authoritative architecture surface.** When a contract and an ADR disagree, the contract wins. When the contract and code disagree, the code is the source of truth and the contract updates.

---

## §10 — What this document is NOT

- Not a sprint plan → `docs/03-execution/plans/`
- Not the system shape → [architecture.md](./architecture.md)
- Not a status snapshot → `docs/03-execution/status/`
- Not a competitive landscape document → [positioning.md](./positioning.md)
- Not the per-decision rationale → `docs/02-decisions/adrs/` (108 ADRs)
- Not the per-system normative contract → `docs/02-decisions/contracts/` (49 contracts)
- Not the per-system spec → `docs/03-execution/specs/` (56 specs)

---

## §11 — Cross-references

| Doc | Relationship |
|---|---|
| [manifesto.md](./manifesto.md) | Founding intent + brand voice |
| [product-vision.md](./product-vision.md) | Product north star + user journey |
| [positioning.md](./positioning.md) | Competitive landscape + moats |
| [architecture.md](./architecture.md) | System shape + boundary matrix + composition root |
| [architecture-breakdown.md](./architecture-breakdown.md) | Per-package detail (79 packages line-by-line) |
| [platform-strategy.md](./platform-strategy.md) | The plugin SDK + family platform + marketplace surfaces |
| [site-and-cognition-strategy.md](./site-and-cognition-strategy.md) | The site/geospatial + cognition substrate strategy |
| [operating-principles.md](./operating-principles.md) | How the team works (separate from these P1–P8 code principles) |

---

*End — PRYZM Engineering Vision, 2026-06-01 — CANONICAL.*
