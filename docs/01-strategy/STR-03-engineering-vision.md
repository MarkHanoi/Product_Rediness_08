# PRYZM — Engineering Vision

> **Stamp**: 2026-06-01 · **Revised 2026-08-11 (rev 2 — measured)** · **Status**: CANONICAL
> **Authority**: this doc owns engineering intent and principles. When sprint plans propose work that contradicts this doc, this doc wins. When this doc disagrees with the code, this doc updates (per [operating-principles O5](./STR-06-operating-principles.md)).

> **Foundation above**: [STR-01-manifesto.md](./STR-01-manifesto.md) → [STR-02-product-vision.md](./STR-02-product-vision.md) → [STR-07-positioning.md](./STR-07-positioning.md)
> **Companion**: [STR-04-architecture.md](./STR-04-architecture.md) (system shape + boundary matrix + composition root)
> **Per-package detail**: [STR-05-architecture-breakdown.md](./STR-05-architecture-breakdown.md)

> ### What changed in rev 2, and why
>
> §2 said *"These are the binding architectural commitments. Each has a CI gate."* Two of the
> eight had counters rather than gates, which the table admitted in a footnote while the header
> sentence did not — and a ninth de-facto principle (the layer rule) turned out to have a gate
> that could not see the imports it existed to police. Enforcement claims are now stated at the
> precision they actually hold.
>
> §12 is new and is the substantive addition: **correctness culture stated as strategy**, with
> the defect classes this codebase has actually shipped as the evidence. It exists because the
> single most valuable engineering property PRYZM has built is not a renderer or a solver — it
> is a growing collection of machinery that makes the system's own claims falsifiable.

This document answers one question: **where do we want to be?** Not how we get there (`03-execution/plans/`), not the shape (`STR-04-architecture.md`), not where we are today (`03-execution/status/`). Just the destination + the binding commitments.

---

## §1 — Identity (one paragraph)

PRYZM is a **browser-native, layered, plugin-extensible BIM/AEC editor + design intelligence platform** for the design-coordinate-document workflow that competes with Autodesk Revit and Graphisoft Archicad on capability, with Bonsai/IFC.js on openness, and with Forma/Qonic/Motif/Pascal on collaborative speed. The product surface is a **single coherent UI** that runs identically on every device with a modern browser (per [C44](../02-decisions/contracts/C44-MOBILE-AND-TABLET.md), [C45](../02-decisions/contracts/C45-BROWSER-AND-DEVICE-MATRIX.md)). The engine surface is a **single composition root** (`composeRuntime()` in `packages/runtime-composer/`) that returns a single typed runtime handle (`PryzmRuntime`). The file format is a **single open format** (`.pryzm`, ZIP container, MessagePack events + GLB content-addressed chunks, manifest schema v1 frozen) that round-trips losslessly with IFC4X3. The 5 customer archetypes (§7) get one tool, not five.

---

## §2 — The 8 architectural principles (P1–P8)

These are the binding architectural commitments. Violations block merge **where a hard gate
exists** — and the honest statement of which do is the point of the last column, not a footnote
to it. Six are hard-fail; P1 and P4 are shrink-only counters, and a counter is a *debt with a
name*, not an enforcement.

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

### §2.1 — The ninth commitment, and the lesson it taught (added 2026-08-11)

The **layer rule** — a layer may import downward, never upward — has always been treated as a
principle of the same rank as P1–P8, but this document never listed it, because it was believed
to be enforced by `eslint-plugin-boundaries` and therefore not worth a row.

**It was not enforced.** No `import/resolver` was configured, so boundaries could not resolve
`@pryzm/*` specifiers — the form in which essentially every cross-package import in this
repository is written — and silently passed them. The rule was set to `'error'` and matched
almost none of the imports it existed to police. The authority is now
`tools/ga-gate/check-layer-boundaries.ts`, which resolves `@pryzm/X` → directory from workspace
manifests. Full detail and the corrected orderings: [STR-04 §1.0](./STR-04-architecture.md).

Two lessons belong in *this* document rather than the architecture one, because they are about
how we engineer, not about what the system is:

1. **A rule set to `error` is not a rule that fires.** Before trusting any gate, ask what it
   *matched* — not merely whether it passed. A gate that passes because it found nothing to
   check is indistinguishable, from the outside, from a codebase that is clean.
2. **"CI enforces this" is a claim, and claims in these documents must be falsifiable like any
   other.** This one sat in CLAUDE.md and in this file for months. It was wrong the whole time.
   §12.2 generalises it.

---

## §3 — The layered model (L0 → L9.5)

Codified in [STR-04-architecture.md §1](./STR-04-architecture.md). Each layer has an owner package, a clear responsibility, and a hard import allowlist. The full inventory (verified 2026-06-01):

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

> ⚠ **Superseded 2026-08-11.** The inventory above is the June measurement and its *ordering*
> is wrong in two places. The canonical layer model — eight layers, apps above plugins,
> `frame-scheduler` at L1 — is [STR-04 §1](./STR-04-architecture.md), re-derived from measured
> edge direction. Re-measured totals: **97 packages, 13 apps, 48 plugins**. Do not quote the
> June figures forward; re-run the count.

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
| **D14** | **The capability control plane** *(added 2026-08-11)* | Language is the primary interface, and every editor ability is a **declared, machine-proven** capability — route liveness, targets proven in both directions, a source-anchored proof, and executed acceptance + adversarial corpora. 41 capabilities; undeclared bus commands 0 of 0 on a shrink-only ratchet. Because a capability is a **table entry**, the marginal cost of the next one is metadata, not engineering. No competitor's AI layer is falsifiable in this way. | [C67](../02-decisions/contracts/C67-RAC-CAPABILITY-CONTROL-PLANE.md), [C68](../02-decisions/contracts/C68-ELEMENT-CHAT-ONBOARDING.md), [ADR-0315](../02-decisions/adrs/ADR-0315-universal-capability-architecture.md) |
| **D15** | **Planning law made computable** *(added 2026-08-11)* | Parcel → zoning instrument → block construction → buildable envelope **carrying the article it was derived from**, or a typed determination naming what is missing and who owns it. The envelope is a *construction*, not a lookup, which is why there is no dataset to buy — and why a competitor cannot buy one either. The scoring denominator is buildable land, and a refusal is a correct answer. | [C58](../02-decisions/contracts/C58-ZONING-RULES-AND-BUILDABLE-ENVELOPE.md), [C63](../02-decisions/contracts/C63-CITY-COMPLETION-AND-DOSSIER.md), [C64](../02-decisions/contracts/C64-ENVELOPE-COMPILER.md), ADR-0276/0279/0283 |

**D5 is understated by its June wording.** The AI host is no longer "7 workflows"; the
deterministic generative fleet (apartment, house, office, residential building, plus the
ceiling → floor-finish → furnish → lighting chain) is reachable *by sentence* through D14, over
the same proven executors the modal path uses — one Confirm card, the engines' own words
relayed verbatim into the transcript, and stoppers for over-height, zero-apartment and
granularity cases.

**The zero-token ladder is a differentiator in its own right**, and it generalises: deterministic
tiers run before any model, and the model — when it runs at all — emits the *same validated
structures* the deterministic tiers emit. The same doctrine applied to PDF→BIM (vector → raster
CV → AI) is why that importer now works **with no API key at all**.

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

## §6 — The CI gates (32 as of 2026-08-11; 21 in June)

Located in `tools/ga-gate/check-*.ts`. Run by `tools/ga-gate/run-all.ts`. Merge-blocking on main. Complete list in [STR-04-architecture.md §5](./STR-04-architecture.md). Categories:

- **Principle enforcement** — `check-three-imports` (P2), `check-raf-count` (P3), `check-otel-spans` (P8), per-package compile (P5)
- **Legacy elimination** — `check-no-commandmanager`, `check-no-workspacemountbridge`, `check-apps-editor-ghost-dirs`, `check-engine-bootstrap-loc`
- **Tripwires** — `check-cast-count` (P4 baseline), `check-commandmanager-any`, `check-window-store-in-packages`, `check-custom-event-{apps,packages}`
- **Security + correctness** — `check-xss-guards`, `check-structuredclone-new-commands`, `check-project-isolation`
- **Surface integrity** — `check-l7-boundary`, `check-scene-graph`, `check-geometry-ceiling`, `check-ctrl-z-wired`, `check-motion-gate-coverage`

The contract suite (C24+) introduces additional per-contract gates landing as each contract implements.

---

## §7 — Customer archetypes (C1–C5)

What we build for. Plan and pricing decisions trace back to these archetypes; the deep personas live in [STR-09-personas.md](./STR-09-personas.md).

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
- ~~**PDF-to-BIM as a primary on-ramp**~~ — **retired as a non-goal, 2026-08-10.** It is now a shipped on-ramp with a three-tier ladder (vector extraction → algorithmic raster CV → AI) that functions with no API key. It is still not claimed to be *reliable* at production grade: recognition remains the ceiling, and the placement defects closed on 2026-08-10 (**L-821**) were half-a-door-width offsets that had shipped undetected.
- **Full structural / MEP detailing**. We author at the architectural level; consultants take over via IFC.

---

## §9 — Discipline rules (binding)

These five rules govern how the team works on the code. Violations are merge blockers, not "best efforts".

1. **When a discrepancy is discovered, EDIT the canonical document.** Do not write a new `*-AUDIT-YYYY-MM-DD.md`. The reason the legacy archive has 43 superseded audits is that we did this 43 times. Per [C31 §1.2](../02-decisions/contracts/C31-DOCUMENTATION-AUTHORING-PROTOCOL.md) + [operating-principles O5](./STR-06-operating-principles.md).
2. **A sub-phase is "done" when the runtime behaviour matches the spec.** Documentation-only changes do not advance the sub-phase counter. Annotation sweeps do not count as binding.
3. **The convergence booleans are re-run every sprint close.** Any positive delta on a tripwired metric is an incident.
4. **Every PR adding a new public function adds ≥ 1 OpenTelemetry span** (P8). No span = no merge.
5. **The contract suite is the authoritative architecture surface.** When a contract and an ADR disagree, the contract wins. When the contract and code disagree, the code is the source of truth and the contract updates.

---

## §10 — What this document is NOT

- Not a sprint plan → `docs/03-execution/plans/`
- Not the system shape → [STR-04-architecture.md](./STR-04-architecture.md)
- Not a status snapshot → `docs/03-execution/status/`
- Not a competitive landscape document → [STR-07-positioning.md](./STR-07-positioning.md)
- Not the per-decision rationale → `docs/02-decisions/adrs/` (**252** ADRs)
- Not the per-system normative contract → `docs/02-decisions/contracts/` (**68** contracts, C01–C68)
- Not the per-system spec → `docs/03-execution/specs/` (**94** specs)

---

## §12 — Correctness culture as strategy (added 2026-08-11)

Everything above this section describes what PRYZM's engineering *builds*. This section
describes what it *refuses to ship*, and it is here because the refusal is the more durable
asset. A competitor can copy a renderer. What they cannot copy quickly is a codebase in which
the system's own claims about itself are mechanically falsifiable.

### §12.1 — The thesis, in one line

> **A system that reports what it did not do is worth more than one that quietly does less.**

Every principle in this section is a restatement of that line against a different failure mode.
The reason it needs stating at strategy rank is that it is *counter-intuitive under delivery
pressure*: a confident "Done" always ships faster than an honest "Changed 22 of 24 — 2 skipped:
the packer could not fit a cell at that depth." The second one is the product.

### §12.2 — Five defect classes this codebase has actually shipped

These are not hypotheticals. Each is a real defect, found and closed, and each names a *class*
rather than an instance — which is the only reason it is worth recording at this level.

| # | Class | What it looked like | Evidence |
|---|---|---|---|
| **1** | **The dead verb.** A write that lands somewhere nothing reads. | Handlers `produceCommand`'d against detached plugin DTO stores while rendering, export, persistence and undo all read the *geometry* stores. **The chat said "Done" and nothing changed** — thirteen times across two sessions. | **L-620**, **L-815**, §FIX-CHAT-DEAD-ROUTES |
| **2** | **The gate whose own arithmetic disproves its verdict.** A check that passes because it cannot see its subject. | The boundaries rule matched almost no `@pryzm/*` import (§2.1). A soundness gate compared an inset to the *parcel* rather than to the true erosion, so a miter offset over-stated buildable area on 31 of 65 real blocks — worst case 65 % — while every published statistic looked healthy. | **L-809**, **L-586** |
| **3** | **The fallback wearing the costume of the feature.** A last-resort path that produces plausible output and is therefore never noticed. | A collapsed polygon inset fell through to a *centroid similarity shrink* — which is not an inset at all, since pullback scales with distance from the centre. It logged `boundary=inner-face ✓`, and the resulting area loss was exactly what a correct inset loses. Measured: 60 mm mid-room, 540 mm at the ends, where 100 mm was correct everywhere. | **L-825**, **L-581** |
| **4** | **The system acting on its own output.** A report re-entering as an instruction. | The assistant's own summary line, pasted back into the chat, **created a level — twice** — because typo correction rewrote *built → build*, a synonym table rewrote *floors → level*, and the bare `6` was read as an elevation. Its sibling rewrote the function word *with* → *width*. | **L-823**, §FIX-CHAT-REPORT-PASTEBACK |
| **5** | **The audit that under-counts, so a leak looks clean.** | Fifteen of nineteen scene builders leaked their roots into the next project, and the isolation audit gated every scene check on `userData.id` + a type — which linework groups, label sprites and fallback boxes do not carry. It printed **`1 finding(s)`** over a scene full of foreign geometry. | **L-824**, **L-820** |

### §12.3 — The seven engineering invariants these produced

Each is now enforced somewhere — by a gate, a pinned test, or (where stated) by review.

1. **Failure and emptiness are never the same value.** A probe that could not run must not
   return what a probe that ran and found nothing returns. §CONTEXT-DATA-HONESTY; **L-581**
   (a geometry failure read by the solver as a legal constraint, citing the wrong rule);
   **L-616** (an *unknown* constraint rendered as *maximally permissive* geometry).
2. **Ship the probe before the fix.** A fix validated only by the theory that motivated it has
   been confirmed and wrong twice in this repository. Demand an *independent* source, and be
   aware a probe can be wrong three ways — wrong runtime, wrong property, wrong system.
3. **Liveness is proven, not presumed.** A write path is dead until something demonstrates the
   value reaching the store that rendering and persistence read. Codified as gate 31's
   execution-authority rule, with the presumption stated in the failure text itself: *presumed
   DEAD until proven otherwise, because that presumption has been right 13/13 times.*
4. **A declaration must be executed, not read.** A capability table that is merely *typed* is
   the `ElementCapabilities` defect — a table advertising Mirror / Offset / Scale on seven
   families whose commands refuse at `canExecute`. **A capability table that LIES is worse than
   none**: a blank table produces an honest "I can't"; a lying table produces a confident "Done"
   over a mutation that never happened (C68 §2.2).
5. **Both directions, or neither.** Declared-but-refused and accepted-but-undeclared are the
   same lie facing opposite ways, and a check that tests only one direction certifies half a
   system (C68 §5.c).
6. **Partial is reported as partial, in the engine's own words.** "Changed N of M — K skipped:
   `<reason>`", with the reason read off the command's or engine's report payload rather than
   re-narrated by the layer above it. Re-narration is where truth is lost.
7. **Never accept an aggregate as proof of a change**, and check that your invariant is the
   *right* invariant before trusting that it holds (**L-586**).

### §12.4 — Ratchets, and what a baseline means

Much of the above is enforced by **shrink-only ratchets** rather than zero-tolerance bars: a
counted debt that CI forbids increasing, each with a dated in-code justification naming exactly
what it counts and what it cannot see.

This is deliberate — a zero-tolerance bar on a pre-existing debt is either a lie or a
work-stoppage — but it carries an obligation that must not be lost:

> **A baseline is not permission. It is a debt with a name** (C68 §6.2).

And a second, which is why the ratchets are documented with their blind spots rather than their
numbers alone:

> **A gate nobody has watched fail is a gate nobody should trust.** Every check added in the
> C68 §6.3 hardening pass was negative-tested — the fault injected, the failure watched, the
> injection removed.

### §12.5 — Where this is stated as NOT-YET-TRUE

- **C68 is CANONICAL, not ACTIVE.** Refusal *quality* has no gate; the runtime halves of "one
  undo entry" and "a truthfully populated report payload" are provable only against a running
  editor; six of the new checks are ratchets (C68 §6.3, §9).
- **The envelope fidelity-label gate does not exist.** ADR-0279 §6 records it as the highest
  blocker in the geodata workstream: the *"never render an estimate as authoritative"*
  guarantee currently rides on convention. Given §12.2 class 2, convention is precisely the
  condition under which a guarantee quietly stops being one.
- **Refusal correctness has never been measured** in the jurisdiction pipeline. It is asserted.
- **Collaboration maturity is over-stated by D3 below.** Yjs CRDT sync ships and conflicts are
  modelled as explicit, but multi-instance deployment (Redis pub/sub) is deferred and the
  concurrency envelope is governed by C66 rather than demonstrated at scale. A catch-up defect
  found on 2026-08-10 — *the model replaying the user's own commands back at them* — is the
  kind of thing this area still produces.

---

## §11 — Cross-references

| Doc | Relationship |
|---|---|
| [STR-01-manifesto.md](./STR-01-manifesto.md) | Founding intent + brand voice |
| [STR-02-product-vision.md](./STR-02-product-vision.md) | Product north star + user journey |
| [STR-07-positioning.md](./STR-07-positioning.md) | Competitive landscape + moats |
| [STR-04-architecture.md](./STR-04-architecture.md) | System shape + boundary matrix + composition root |
| [STR-05-architecture-breakdown.md](./STR-05-architecture-breakdown.md) | Per-package detail (97 packages line-by-line) |
| [STR-10-platform-strategy.md](./STR-10-platform-strategy.md) | The plugin SDK + family platform + marketplace surfaces |
| [STR-12-site-and-cognition-strategy.md](./STR-12-site-and-cognition-strategy.md) | The site/geospatial + cognition substrate strategy |
| [STR-06-operating-principles.md](./STR-06-operating-principles.md) | How the team works (separate from these P1–P8 code principles) |

---

*End — PRYZM Engineering Vision, revised 2026-08-11 — CANONICAL.*
