# ADRs — Architecture Decision Records

> **201 files** = **196 ADR decisions** + **5 renumber redirect stubs** (from the duplicate-number fix, §2.1) — per-decision rationale supporting the [contracts](../contracts/). (As of 2026-07-16.)
>
> Follows [Michael Nygard's template](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions).
>
> ✅ **Duplicate-number reconciliation (2026-07-16).** Five ADR numbers were each shared by two files. The later-dated file of each pair was renumbered to a fresh `ADR-NNNN` (its content moved via `git mv`, history preserved, with a one-line renumber annotation); a **redirect stub** was left at the old path so inbound links still resolve. Old → new map:
>
> | Old (kept its number) | Old (renumbered) | → New number |
> |---|---|---|
> | `ADR-0014-traa-ssgi-idle-budget.md` | `ADR-0014-traa-ssgi-idle-budget-s49-refresh.md` (refresh) | **ADR-0125** |
> | `ADR-0069-dynamic-program-canvas-as-primary-authoring-surface.md` | `ADR-0069-graph-authoritative-room-identity-at-execution.md` | **ADR-0126** |
> | `ADR-0098-element-lifecycle-conformance-audit.md` | `ADR-0098-stair-authored-by-height-implied-level-above.md` | **ADR-0127** |
> | `ADR-0110-unified-furniture-plan-symbol-vocabulary.md` | `ADR-0110-sunhours-bvh-no-recompute-and-facade-real-geometry.md` | **ADR-0128** |
> | `ADR-0117-uniform-material-set-command.md` | `ADR-0117-room-redetect-noprogress-loop-guard.md` | **ADR-0129** |
>
> (`ADR-0055` + `ADR-0055A` is an intentional sub-decision, not a collision — left as-is.) New ADRs MUST use the next free `ADR-NNNN ≥ 0130` per [C31 §1.2](../contracts/C31-DOCUMENTATION-AUTHORING-PROTOCOL.md). Note: two sealed ACCEPTED ADRs (`0067`, `0075`) still link to the old `0069` path — those links resolve through the redirect stub; the sealed bodies were left unedited per C31 immutability.

## §1 — What an ADR is

A single architectural decision, recorded once, never edited. If the decision changes, a NEW ADR supersedes the old one. The old one stays in place forever — historical archeology + traceability for code reviews.

## §2 — Numbering — two co-existing series

This folder consolidates ADRs from two former locations:

| Series | Origin | Format | Range | Era |
|---|---|---|---|---|
| **Strategic ADRs** | `docs/03_PRYZM3/reference/adrs/` (legacy) | `ADR-NNN` (3-digit) | 001–099 | 2025–2026 strategic decisions |
| **Code-level ADRs** | `docs/architecture/adr/` (legacy) | `NNNN-<slug>.md` (4-digit) | 0001–0099 | 2024–2026 sprint-scoped decisions |

Going forward (2026-06-01+), new ADRs use the **4-digit format** (`ADR-NNNN`) starting at the next free number above both series. To disambiguate in body text when both series could match: write `[strategic ADR-NNN]` or `[code-level ADR-NNNN]` explicitly.

## §3 — Lifecycle

```
PROPOSED  →  ACCEPTED  →  (optionally) SUPERSEDED by ADR-NNNN
                     ↘
                       REJECTED  (kept as record of rejected option)
```

A SUPERSEDED ADR is left in place forever. The superseding ADR cites it.

## §4 — When to write an ADR vs a contract

| Situation | What to write |
|---|---|
| "We considered options A, B, C and chose B because…" | **ADR** |
| "Every downstream package MUST follow this rule" | **Contract** ([../contracts/](../contracts/)) |
| "Here is why C03 §2.4 says you can't bypass the command bus" | **ADR** (cited from the contract) |
| "Here is HOW the command bus encodes patches" | **Spec** ([../../03-execution/specs/](../../03-execution/specs/)) |

A contract may cite an ADR. An ADR may cite a contract. An ADR may NOT contradict a contract — if it would, raise a contract revision PR in the same change.

## §5 — Anatomy of an ADR

```markdown
# <NNNN-slug>  OR  ADR-NNN — <Title>

**Status**: PROPOSED | ACCEPTED | REJECTED | SUPERSEDED by …
**Date**: YYYY-MM-DD
**Deciders**: <names or "architecture team">
**Supersedes**: (if applicable) ADR-…
**Related contracts**: (if applicable) C03, C11

## Context
What problem are we solving? What forces are at play?

## Decision
What we chose.

## Consequences
What follows — good, bad, trade-offs.

## Alternatives considered
Other options + why we rejected each.
```

## §6 — Full index (auto-generated 2026-07-16 from the file listing — regenerate with the script in docs-audit-findings §8.1)

All ADR files, sorted by filename. **Canonical form is `ADR-NNNN-kebab.md`.** The 86 bare `NNNN-*` + 2 uppercase-slug files were unified 2026-07-16; the 66 **strategic `ADR-NNN-*` (3-digit)** files remain pending a renumber-band decision (they collide with the bare-origin `ADR-00NN` on zero-pad — see §2.2). The 5 `RENUMBERED` stubs redirect to their new numbers per §2.1.

| File | Title (linked) |
|---|---|
| `ADR-0001-typed-id-brand-strategy` | [ADR-0001 — Typed-ID brand strategy](./ADR-0001-typed-id-brand-strategy.md) |
| `ADR-0002-command-handler-signature` | [ADR-0202 — Command handler signature](./ADR-0002-command-handler-signature.md) |
| `ADR-0003-frame-scheduler-priority-vs-deadline` | [ADR-0203 — Frame scheduler priority vs deadline API](./ADR-0003-frame-scheduler-priority-vs-deadline.md) |
| `ADR-0004-messagepack-codec-choice` | [ADR-0204 — MessagePack codec choice for the persistence wire format](./ADR-0004-messagepack-codec-choice.md) |
| `ADR-0005-primitive-committer-interface` | [ADR-0205 — PrimitiveCommitter interface](./ADR-0005-primitive-committer-interface.md) |
| `ADR-0006-idle-continuation-budget` | [ADR-0206 — Idle-continuation N-frame budget](./ADR-0006-idle-continuation-budget.md) |
| `ADR-0007-webgpu-webgl2-dual-mode` | [ADR-0207 — WebGPU / WebGL2 dual-mode renderer strategy](./ADR-0007-webgpu-webgl2-dual-mode.md) |
| `ADR-0008-wall-handler-triage` | [ADR-0208 — Wall handler triage (22 → 14)](./ADR-0008-wall-handler-triage.md) |
| `ADR-0009-producer-pure-function-signature` | [ADR-0209 — Producer pure-function signature](./ADR-0009-producer-pure-function-signature.md) |
| `ADR-0201-pascal-adoption` | [ADR-0201 — Pascal Adoption Strategy](./ADR-0201-pascal-adoption.md) |
| `ADR-0010-slab-handler-triage` | [ADR-0210 — Slab handler triage (12 → 8) + cross-element coupling lift](./ADR-0010-slab-handler-triage.md) |
| `ADR-0011-curtain-wall-triage-and-producer-split` | [ADR-0211 — Curtain-wall handler triage (15 → 9) + producer split](./ADR-0011-curtain-wall-triage-and-producer-split.md) |
| `ADR-0012-cross-element-cascade-rule-registration` | [ADR-0212 — Cross-element cascade-rule registration](./ADR-0012-cross-element-cascade-rule-registration.md) |
| `ADR-0013-intent-resolver` | [ADR-0213 — Wall intent resolver shape](./ADR-0013-intent-resolver.md) |
| `ADR-0014-traa-ssgi-idle-budget-s49-refresh` | [0014 (refresh) — RENUMBERED to ADR-0125](./ADR-0014-traa-ssgi-idle-budget-s49-refresh.md) |
| `ADR-0014-traa-ssgi-idle-budget` | [ADR-0014 — TRAA / SSGI under idle-continuation budget](./ADR-0014-traa-ssgi-idle-budget.md) |
| `ADR-0015-picking-strategy` | [ADR-0015 — Picking strategy: gpu-pick default, BVH fallback](./ADR-0015-picking-strategy.md) |
| `ADR-0016-view-state-command-driven` | [ADR-0016 — View state as command-driven, persisted entities](./ADR-0016-view-state-command-driven.md) |
| `ADR-0017-headless-package-surface` | [ADR-0017 — Headless package public surface (S18)](./ADR-0017-headless-package-surface.md) |
| `ADR-0018-pryzm-zip-format-v1` | [ADR-0018 — `.pryzm` ZIP file format v1](./ADR-0018-pryzm-zip-format-v1.md) |
| `ADR-0019-sync-server-linearisation` | [ADR-0019 — Sync-server linearisation, broadcast, and bake hand-off](./ADR-0019-sync-server-linearisation.md) |
| `ADR-0202-crdt-event-log-bridge` | [ADR-0202 — CRDT / Event-Log Bridge](./ADR-0202-crdt-event-log-bridge.md) |
| `ADR-0020-tier-streamed-loader` | [ADR-0020 — Tier-Streamed Loader](./ADR-0020-tier-streamed-loader.md) |
| `ADR-0021-plugin-descriptor-bootstrap-everything` | [ADR-0021 — Plugin descriptor + `bootstrapWithEverything()`](./ADR-0021-plugin-descriptor-bootstrap-everything.md) |
| `ADR-0022-room-boundary-detection` | [ADR-0022 — Room boundary detection strategy](./ADR-0022-room-boundary-detection.md) |
| `ADR-0023-plan-view-canvas2d-renderer` | [ADR-0023 — Plan-view renderer architecture (Canvas2D, dirty flags, no THREE)](./ADR-0023-plan-view-canvas2d-renderer.md) |
| `ADR-0024-plan-view-annotation-pipeline` | [ADR-0024 — Plan-View Annotation Pipeline (Layout / Committer Split)](./ADR-0024-plan-view-annotation-pipeline.md) |
| `ADR-0025-plan-view-svp-parity-contract-44` | [ADR-0025 — Plan-View + SVP Parity (Contract 44, Sprint S33)](./ADR-0025-plan-view-svp-parity-contract-44.md) |
| `ADR-0026-second-tier-elements-triage` | [ADR-0026 — Second-tier element families (Structural / Lighting / Plumbing) triage](./ADR-0026-second-tier-elements-triage.md) |
| `ADR-0027-furniture-multi-representation` | [ADR-0027 — Furniture multi-representation model](./ADR-0027-furniture-multi-representation.md) |
| `ADR-0028-plan-view-canvas-architecture` | [ADR-0028 — Plan-view canvas architecture](./ADR-0028-plan-view-canvas-architecture.md) |
| `ADR-0029-vector-primitives-and-backends` | [ADR-0029 — Vector primitives + multi-backend rendering (Canvas2D / SVG / PDF / Print-Canvas)](./ADR-0029-vector-primitives-and-backends.md) |
| `ADR-0203-object-storage` | [ADR-0203 — Object Storage Backend](./ADR-0203-object-storage.md) |
| `ADR-0030-phase-2b-post-audit-reconciliation` | [ADR-0030 — Phase 2B post-audit reconciliation](./ADR-0030-phase-2b-post-audit-reconciliation.md) |
| `ADR-0031-s61-staged-legacy-deletion` | [ADR-0031 — S61 Staged Legacy Deletion + 90-day Sunset Window](./ADR-0031-s61-staged-legacy-deletion.md) |
| `ADR-0032-schedule-formula-dsl` | [ADR-0032 — Schedule Formula DSL semantics](./ADR-0032-schedule-formula-dsl.md) |
| `ADR-0033-sync-client-event-bridge` | [ADR-0033 — Sync-client + Immer ⇄ Y.Doc event bridge](./ADR-0033-sync-client-event-bridge.md) |
| `ADR-0034-awareness-multiplayer-cursor` | [ADR-0034 — Awareness extended (cursor + view + tool + selection) and the multiplayer plugin](./ADR-0034-awareness-multiplayer-cursor.md) |
| `ADR-0035-soft-locks-and-cutover` | [ADR-0035: Soft-Locks (S45 D1-D4) and Replit-PG → Supabase Cutover Gate (S45 D5)](./ADR-0035-soft-locks-and-cutover.md) |
| `ADR-0036-visibility-intent-waves-1-5` | [ADR-0036: Visibility-Intent — Waves 1-5 (S46) and Restore-Verify Streak Gate](./ADR-0036-visibility-intent-waves-1-5.md) |
| `ADR-0037-ai-host-lazy-bootstrap` | [ADR-0037 — AI Host Lazy Bootstrap + Worker Queue Skeleton + Approval Queue](./ADR-0037-ai-host-lazy-bootstrap.md) |
| `ADR-0038-s62-plugin-sdk-descriptor-schema-lock` | [ADR-0038 — S62 Plugin SDK 1.0 Descriptor Schema Lock + Sandbox Model Selection](./ADR-0038-s62-plugin-sdk-descriptor-schema-lock.md) |
| `ADR-0039-s63-public-api-and-docs-site-foundation` | [ADR-0039 — S63 Public API OpenAPI Schema + Plugin SDK Docs Site Foundation](./ADR-0039-s63-public-api-and-docs-site-foundation.md) |
| `ADR-0204-wire-format` | [ADR-0204 — Wire Format](./ADR-0204-wire-format.md) |
| `ADR-0040-s64-marketplace-skeleton-and-signing` | [ADR-0040 — S64 Marketplace Skeleton + Ed25519 Signing Integration (D1)](./ADR-0040-s64-marketplace-skeleton-and-signing.md) |
| `ADR-0041-s65-public-rest-ws-api` | [ADR-0041 — S65 Public REST + WebSocket API Gateway](./ADR-0041-s65-public-rest-ws-api.md) |
| `ADR-0042-s65-ai-public-api` | [ADR-0042 — S65 AI Public API (Read-Only L7.5 Surface)](./ADR-0042-s65-ai-public-api.md) |
| `ADR-0043-s65-ai-spend-view` | [ADR-0043 — S65 Workspace Admin AI Spend View](./ADR-0043-s65-ai-spend-view.md) |
| `ADR-0044-s65-formula-library-extraction` | [ADR-0044 — S65 Formula Library Extraction (ADR-0227 Realization)](./ADR-0044-s65-formula-library-extraction.md) |
| `ADR-0045-s65-admin-overrides-and-lifecycle-deferral` | [ADR-0045 — S65 Enterprise Admin Overrides + Lifecycle-Event Deferral](./ADR-0045-s65-admin-overrides-and-lifecycle-deferral.md) |
| `ADR-0046-s66-webhooks-composition` | [ADR-0046 — S66 Webhooks composition](./ADR-0046-s66-webhooks-composition.md) |
| `ADR-0047-s66-headless-publish-prep` | [ADR-0047 — S66 Headless npm-publish prep](./ADR-0047-s66-headless-publish-prep.md) |
| `ADR-0048-s67-self-host-docker-compose` | [ADR-0048 — S67 Self-Host Docker Compose Stack](./ADR-0048-s67-self-host-docker-compose.md) |
| `ADR-0049-s67-multi-region-cut-decision` | [ADR-0049 — S67 D9 Multi-Region Cut Decision (Tier-2)](./ADR-0049-s67-multi-region-cut-decision.md) |
| `ADR-0205-worker-pool-policy` | [ADR-0205 — Worker Pool Policy](./ADR-0205-worker-pool-policy.md) |
| `ADR-0050-s68-security-hardening-posture` | [ADR-0050 — S68 Security-Hardening Posture (2026-Q4)](./ADR-0050-s68-security-hardening-posture.md) |
| `ADR-0051-s69-largest-fixture-bench-policy` | [ADR-0051 — S69 Largest-Fixture Bench Policy + DR-Drill Codification](./ADR-0051-s69-largest-fixture-bench-policy.md) |
| `ADR-0052-s70-browser-matrix-wcag-selfhost-publish-pdf-preview-lifecycle-deletion` | [ADR-0052 — S70 Browser Matrix + WCAG + Self-Host Publish + PDF-to-BIM Preview + Lifecycle Deletion](./ADR-0052-s70-browser-matrix-wcag-selfhost-publish-pdf-preview-lifecycle-deletion.md) |
| `ADR-0053-s71-perf-regression-hunt-and-hardfail-flip` | [ADR-0053 — S71 Perf Regression Hunt + Largest-Fixture Hard-Fail Flip + K3-F Codification](./ADR-0053-s71-perf-regression-hunt-and-hardfail-flip.md) |
| `ADR-0054-s72-m36-ga-launch-gate` | [ADR-0054 — S72 · M36 GA Launch Gate](./ADR-0054-s72-m36-ga-launch-gate.md) |
| `ADR-0055-wall-junction-pascal-style` | [ADR-0055 — Replace `WallJunctionInfill` with per-wall miter trimming (Pascal-style)](./ADR-0055-wall-junction-pascal-style.md) |
| `ADR-0055a-wall-junction-p4-layered-and-openings` | [ADR-0055A — P4 addendum: extending Pascal-style miters to layered walls + opening segments](./ADR-0055a-wall-junction-p4-layered-and-openings.md) |
| `ADR-0056-typology-declared-brief` | [ADR-0056 — Briefs are typology-declared, not UI-hard-coded](./ADR-0056-typology-declared-brief.md) |
| `ADR-0058-unified-building-graph` | [ADR-0058 — Unified Building Graph (UBG) as the relational substrate](./ADR-0058-unified-building-graph.md) |
| `ADR-0059-monorepo-typecheck-profile-and-emit` | [ADR-0059 — Monorepo typecheck profile + `declarationDir`/emit (per-package hygiene)](./ADR-0059-monorepo-typecheck-profile-and-emit.md) |
| `ADR-0206-default-render-mode` | [ADR-0206 — Default Render Mode](./ADR-0206-default-render-mode.md) |
| `ADR-0060-living-design-parameters` | [ADR-0060 — Living Design Parameters bind to existing substrate, not a parallel scorer](./ADR-0060-living-design-parameters.md) |
| `ADR-0061-building-graph-bidirectional-edit-substrate` | [ADR-0061 — The building graph is a bidirectional edit substrate, not a read-only projection](./ADR-0061-building-graph-bidirectional-edit-substrate.md) |
| `ADR-0062-layout-engine-deterministic-graph-solver` | [ADR-0062 — Layout engine: deterministic combinatorial expansion + rectangular dual-graph solver](./ADR-0062-layout-engine-deterministic-graph-solver.md) |
| `ADR-0063-house-generative-layout-doctrine` | [0063 — House generative-layout doctrine: per-storey apartment pipeline + multi-storey spine only](./ADR-0063-house-generative-layout-doctrine.md) |
| `ADR-0064-in-browser-wind-cfd-webgpu-lbm` | [0064 — Wind CFD runs client-side on WebGPU + Lattice-Boltzmann (not cloud, not nothing)](./ADR-0064-in-browser-wind-cfd-webgpu-lbm.md) |
| `ADR-0065-geodata-analytical-layers-pluggable-provider` | [0065 — Geodata analytical layers are a first-class pluggable-provider subsystem draped on Forma/Cesium (not hardcoded per-country, not nothing)](./ADR-0065-geodata-analytical-layers-pluggable-provider.md) |
| `ADR-0066-access-graph-first-generative-layout-doctrine` | [0066 — Access-Graph-First Generative Layout Doctrine](./ADR-0066-access-graph-first-generative-layout-doctrine.md) |
| `ADR-0067-graph-ir-intent-first-building-graph-bim3` | [0067 — Graph-IR / Intent-First Building Graph (BIM 3.0)](./ADR-0067-graph-ir-intent-first-building-graph-bim3.md) |
| `ADR-0068-five-graph-model-circulation-first-building-graph` | [0068 — Five-Graph Model: Circulation-First Building Graph](./ADR-0068-five-graph-model-circulation-first-building-graph.md) |
| `ADR-0069-dynamic-program-canvas-as-primary-authoring-surface` | [0069 — The Dynamic Program Canvas is the primary program-authoring surface](./ADR-0069-dynamic-program-canvas-as-primary-authoring-surface.md) |
| `ADR-0069-graph-authoritative-room-identity-at-execution` | [0069 — Graph-Authoritative Room Identity at Execution — RENUMBERED to ADR-0126](./ADR-0069-graph-authoritative-room-identity-at-execution.md) |
| `ADR-0207-telemetry-backend` | [ADR-0207 — Telemetry Backend](./ADR-0207-telemetry-backend.md) |
| `ADR-0070-project-north-vs-true-north-authoring-frame` | [ADR-0070 — Project North vs True North: an orthogonal authoring frame for generative geometry](./ADR-0070-project-north-vs-true-north-authoring-frame.md) |
| `ADR-0071-room-and-module-rule-engine` | [ADR-0071 — Room-and-Module Rule Engine: constraint-satisfaction + scoring, per-room ontology](./ADR-0071-room-and-module-rule-engine.md) |
| `ADR-0072-corridor-spine-on-stair-fragmented-plates` | [ADR-0072 — Corridor-spine adjacency on stair-fragmented / L-T-U plates (D-TGL §P3c / tracker §52.6)](./ADR-0072-corridor-spine-on-stair-fragmented-plates.md) |
| `ADR-0073-hierarchical-access-graph-corridor-spine` | [ADR-0073 — Hierarchical Access Graph & Corridor-as-Spine Engine](./ADR-0073-hierarchical-access-graph-corridor-spine.md) |
| `ADR-0073-house-execution-frame-parity-with-apartment` | [ADR-0073 — House execution must reach apartment-grade joint quality via FRAME PARITY](./ADR-0073-house-execution-frame-parity-with-apartment.md) |
| `ADR-0074-gpu-solar-sun-hours-environmental-analysis` | [ADR-0074 — Solar HEAT / sun-hours runs client-side on WebGPU over the REAL model geometry (heatmap on roofs & façades), built on RealSunService](./ADR-0074-gpu-solar-sun-hours-environmental-analysis.md) |
| `ADR-0075-preview-execution-parity-contract` | [0075 — Preview↔Execution Parity Contract](./ADR-0075-preview-execution-parity-contract.md) |
| `ADR-0075-resi-corner-preserving-perimeter-fill` | [ADR-0075 — Residential plate: corner-preserving perimeter fill (default-on)](./ADR-0075-resi-corner-preserving-perimeter-fill.md) |
| `ADR-0076-webgpu-fragment-performance` | [ADR-0076 — WebGPU Fragment-Engine Performance (§PERF-WEBGPU-FRAGMENT)](./ADR-0076-webgpu-fragment-performance.md) |
| `ADR-0077-live-renderer-backend-swap` | [ADR-0077 — Live, In-Place Renderer Backend Swap (§RENDERER-LIVE-SWAP)](./ADR-0077-live-renderer-backend-swap.md) |
| `ADR-0078-v2-l-junction-pivot-equals-legacy-sharedpt` | [ADR-0078 — V2 L-junction pivot = legacy `sharedPt` (close mixed-pipeline perimeter corners)](./ADR-0078-v2-l-junction-pivot-equals-legacy-sharedpt.md) |
| `ADR-0079-site-metric-analysis-disc-decoupled-from-camera` | [ADR-0079 — Site-metric analysis disc is an INDEPENDENT extent, decoupled from camera/overlay framing (§SITE-METRIC-RADIUS-DECOUPLE)](./ADR-0079-site-metric-analysis-disc-decoupled-from-camera.md) |
| `ADR-0208-ifc-scope` | [ADR-0208 — IFC Scope for v1](./ADR-0208-ifc-scope.md) |
| `ADR-0080-site-metric-daylight-vsc-ground-grid` | [ADR-0080 — Daylight (Vertical Sky Component) is a side-3D ground-grid metric (§SITE-METRIC-DAYLIGHT-VSC)](./ADR-0080-site-metric-daylight-vsc-ground-grid.md) |
| `ADR-0081-resi-rectilinear-rect-decomposition-l-plate` | [ADR-0080 — Residential plate: rectilinear rect-decomposition for L / concave plates](./ADR-0081-resi-rectilinear-rect-decomposition-l-plate.md) |
| `ADR-0082-circle-boundary-draw-tool` | [ADR-0082 — Circle / Ellipse / Fillet boundary-draw tools (centre + radius → closed N-gon)](./ADR-0082-circle-boundary-draw-tool.md) |
| `ADR-0083-office-building-circular-floor-plate-typology` | [ADR-0081 — Office building (tower) as the 4th generative typology, with a circular concentric-ring floor plate (§OFFICE-BUILDING)](./ADR-0083-office-building-circular-floor-plate-typology.md) |
| `ADR-0084-load-time-heal-and-chunked-redetect` | [ADR-0084 — Load-time degenerate-polygon heal + frame-chunked post-load room redetect](./ADR-0084-load-time-heal-and-chunked-redetect.md) |
| `ADR-0085-webgpu-safe-element-builder-disposal` | [ADR-0084 — WebGPU-safe element-builder disposal seam (§I2 generalisation)](./ADR-0085-webgpu-safe-element-builder-disposal.md) |
| `ADR-0086-site-metric-per-metric-cost-tier-resolution` | [ADR-0084 — Site-metric grid resolution is DECOUPLED per cost tier (§SITE-METRIC-COST-TIER)](./ADR-0086-site-metric-per-metric-cost-tier-resolution.md) |
| `ADR-0087-bulk-room-finishes-command` | [ADR-0087 — Bulk room-finishes command (one mutation for N rooms)](./ADR-0087-bulk-room-finishes-command.md) |
| `ADR-0088-forma-ao-opt-in-and-gentle-overpass-mirrors` | [ADR-0087 — Forma AO is opt-in (render-error-guarded) + gentle Overpass mirror fetch](./ADR-0088-forma-ao-opt-in-and-gentle-overpass-mirrors.md) |
| `ADR-0089-non-fatal-webgpu-device-loss-recovery` | [ADR-0087 — Non-fatal WebGPU device-loss recovery (downgrade, never "Rendering has stopped")](./ADR-0089-non-fatal-webgpu-device-loss-recovery.md) |
| `ADR-0209-plugin-sandbox` | [ADR-0209 — Plugin Sandbox Model](./ADR-0209-plugin-sandbox.md) |
| `ADR-0090-door-rescue-maximum-circulation-guarantee` | [ADR-0087 — Door-rescue post-pass: the generator-side maximum-circulation guarantee + modal readout](./ADR-0090-door-rescue-maximum-circulation-guarantee.md) |
| `ADR-0091-forma-scene-visual-quality` | [ADR-0089 — Forma scene visual quality (architectural-model look: neutral massing, soft gradient shadowing, sky gradient)](./ADR-0091-forma-scene-visual-quality.md) |
| `ADR-0092-office-typology-first-class-onboarding` | [ADR-0092 — Office typology is first-class from the picker (onboarding wiring + default-ON gate)](./ADR-0092-office-typology-first-class-onboarding.md) |
| `ADR-0093-forma-white-model-and-facade-analysis` | [ADR-0093 — Forma 3D-site: all-white architectural model + on-demand façade sun analysis](./ADR-0093-forma-white-model-and-facade-analysis.md) |
| `ADR-0094-large-scene-render-perf-postgeom-compile-and-tier-cap` | [ADR-0094 — Large-scene render perf: no synchronous post-geometry compile + hard tier cap + auto-skip PBR](./ADR-0094-large-scene-render-perf-postgeom-compile-and-tier-cap.md) |
| `ADR-0095-real-datasets-site-analysis-facade-footprint-and-globe-clamp` | [ADR-0095 — Real free datasets for site analysis (population / temperature / wind), façade-footprint resolution, honest degradation, and globe tile-](./ADR-0095-real-datasets-site-analysis-facade-footprint-and-globe-clamp.md) |
| `ADR-0096-office-furnish-modular-engine` | [ADR-0096 — Modular Furnish Office engine (Phase 2 of SPEC-OFFICE-GENERATION-ENGINE)](./ADR-0096-office-furnish-modular-engine.md) |
| `ADR-0097-house-shell-containment-on-all-floors` | [ADR-0097 — House shell containment on ALL floors + paths (§DIAG-HOUSE-SHELL-CONTAINMENT)](./ADR-0097-house-shell-containment-on-all-floors.md) |
| `ADR-0098-element-lifecycle-conformance-audit` | [ADR-0098 — Element-Lifecycle Conformance Audit (movement · placement · hosting · rotation · properties · dimensions · materials)](./ADR-0098-element-lifecycle-conformance-audit.md) |
| `ADR-0098-stair-authored-by-height-implied-level-above` | [ADR-0098 — A stair is authored by HEIGHT … — RENUMBERED to ADR-0127](./ADR-0098-stair-authored-by-height-implied-level-above.md) |
| `ADR-0099-host-wall-opening-reverse-index-freeze-fix` | [ADR-0099 — Host-wall → opening reverse index kills the wall-move total freeze (§FIX-HOSTWALL-DOOR-INDEX / §FIX-HOSTWALL-MOVE-COALESCE)](./ADR-0099-host-wall-opening-reverse-index-freeze-fix.md) |
| `ADR-0210-bake-debounce` | [ADR-0210 — Bake Debounce Policy](./ADR-0210-bake-debounce.md) |
| `ADR-0100-circulation-metric-honesty-duplicate-name-and-corridor-root` | [ADR-0100 — Circulation-% honesty: duplicate-name-safe reachability + corridor root + storage rescue](./ADR-0100-circulation-metric-honesty-duplicate-name-and-corridor-root.md) |
| `ADR-0101-wall-preview-render-request-and-defer-tier-during-draw` | [ADR-0101 — Wall rubber-band preview: request a render per move + defer render-tier escalation during a draw](./ADR-0101-wall-preview-render-request-and-defer-tier-during-draw.md) |
| `ADR-0102-large-project-open-freeze-and-false-timeout` | [ADR-0102 — Large-project open: kill the false-timeout, the autosave-mid-load freeze, and the O(N) clear storm](./ADR-0102-large-project-open-freeze-and-false-timeout.md) |
| `ADR-0103-properties-panel-parametric-section-alignment` | [ADR-0103 — Element properties panel: converge parametric sections onto the shared aligned-grid inspector](./ADR-0103-properties-panel-parametric-section-alignment.md) |
| `ADR-0104-plan-view-door-jamb-seam` | [ADR-0104 — Plan-view door-in-wall symbol closes watertight onto the frame jambs (§FIX-PLAN-DOOR-JAMB-SEAM)](./ADR-0104-plan-view-door-jamb-seam.md) |
| `ADR-0105-uniform-element-change-type-in-place` | [ADR-0105 — Uniform "change element type" (replace-in-place) across families (§FEAT-ELEMENT-CHANGE-TYPE)](./ADR-0105-uniform-element-change-type-in-place.md) |
| `ADR-0106-real-environment-sun-and-ground-shadow-catcher` | [ADR-0106 — The Environment & Camera panel drives a REAL sun + an invisible ground shadow-catcher](./ADR-0106-real-environment-sun-and-ground-shadow-catcher.md) |
| `ADR-0107-placement-preview-spacebar-rotate` | [ADR-0107 — Spacebar rotates the placement preview 90° (pre-placement rotation)](./ADR-0107-placement-preview-spacebar-rotate.md) |
| `ADR-0108-webgl2-ghost-on-rotate-per-frame-obc-base-clear` | [ADR-0108 — WebGL2 ghost/duplicate-on-rotate: per-frame OBC base framebuffer clear](./ADR-0108-webgl2-ghost-on-rotate-per-frame-obc-base-clear.md) |
| `ADR-0109-forma-massing-facade-context-and-sunhours-fixes` | [ADR-0109 — Forma 3D-site view: all-storeys massing, façade footprint, instant sun-hours/daylight, filled context, reliable zoom](./ADR-0109-forma-massing-facade-context-and-sunhours-fixes.md) |
| `ADR-0211-permission-granularity` | [ADR-0211 — Permission Granularity](./ADR-0211-permission-granularity.md) |
| `ADR-0110-sunhours-bvh-no-recompute-and-facade-real-geometry` | [ADR-0110 — Forma sun-hours (BVH raycast …) — RENUMBERED to ADR-0128](./ADR-0110-sunhours-bvh-no-recompute-and-facade-real-geometry.md) |
| `ADR-0110-unified-furniture-plan-symbol-vocabulary` | [ADR-0110 — Unified furniture plan-symbol vocabulary for library card previews](./ADR-0110-unified-furniture-plan-symbol-vocabulary.md) |
| `ADR-0111-nav-lod-shadow-freeze-not-castshadow-toggle` | [ADR-0111 — Transient shadow suppression FREEZES the shadow map; it never clears `castShadow`](./ADR-0111-nav-lod-shadow-freeze-not-castshadow-toggle.md) |
| `ADR-0112-cross-level-slab-corner-snap-reference` | [ADR-0112 — Cross-level slab-corner snap reference + far-from-origin snap-bounds fix](./ADR-0112-cross-level-slab-corner-snap-reference.md) |
| `ADR-0113-kitchen-accurate-preview-plan-symbol-and-second-place` | [ADR-0113 — Kitchen fidelity: accurate preview, professional plan symbol, and continuous second placement](./ADR-0113-kitchen-accurate-preview-plan-symbol-and-second-place.md) |
| `ADR-0114-shower-orientation-and-walkin-enclosure-type` | [ADR-0114 — Shower wall-hosted orientation fix + composite walk-in enclosure type](./ADR-0114-shower-orientation-and-walkin-enclosure-type.md) |
| `ADR-0115-underlay-defined-project-north-and-dual-north-transform` | [ADR-0115 — Underlay-defined Project North + the dual-north (project↔true) transform](./ADR-0115-underlay-defined-project-north-and-dual-north-transform.md) |
| `ADR-0116-unified-wall-system-type-catalogue` | [ADR-0116 — One wall system-type catalogue, seeded at the composition root](./ADR-0116-unified-wall-system-type-catalogue.md) |
| `ADR-0117-room-redetect-noprogress-loop-guard` | [ADR-0117 — Room re-detection loop-guard — RENUMBERED to ADR-0129](./ADR-0117-room-redetect-noprogress-loop-guard.md) |
| `ADR-0117-uniform-material-set-command` | [ADR-0117 — Uniform `material.set` surface: per-family `<family>.setMaterial` handlers unified by one dispatch facade](./ADR-0117-uniform-material-set-command.md) |
| `ADR-0118-autodimension-engine` | [ADR-0118 — Auto-dimensioning is a deterministic L2-pure engine (`@pryzm/auto-dimension`), not an extension of the naive producer and not AI](./ADR-0118-autodimension-engine.md) |
| `ADR-0119-autodimension-render-sink-is-subsystem-annotationstore` | [ADR-0119 — The AutoDimension RENDER sink is the subsystem `annotationStore` `'linear-dim'` path, not `dimension.createMany`](./ADR-0119-autodimension-render-sink-is-subsystem-annotationstore.md) |
| `ADR-0212-self-host-minimums` | [ADR-0212 — Self-Host Minimum Requirements](./ADR-0212-self-host-minimums.md) |
| `ADR-0120-shadow-caster-set-ownership` | [ADR-0120 — The shadow caster set is owned, explicit, and size-bounded](./ADR-0120-shadow-caster-set-ownership.md) |
| `ADR-0121-associative-dimensions-and-the-presentation-split` | [ADR-0121 — Associative dimensions, the presentation split, and what Ctrl-Z does to a re-derived drawing](./ADR-0121-associative-dimensions-and-the-presentation-split.md) |
| `ADR-0123-what-an-edited-tag-edits` | [ADR-0123 — What does an edited TAG edit? (and the coherence rule it shares with ADR-0266)](./ADR-0123-what-an-edited-tag-edits.md) |
| `ADR-0124-the-pool-is-an-assembly-and-water-is-an-element` | [ADR-0124 — The Pool is an ASSEMBLY, and WATER is an Element Family](./ADR-0124-the-pool-is-an-assembly-and-water-is-an-element.md) |
| `ADR-0125-traa-ssgi-idle-budget-s49-refresh` | [ADR-0125 (formerly 0014-refresh) — TRAA + SSGI Idle Budget for the AI Plane](./ADR-0125-traa-ssgi-idle-budget-s49-refresh.md) |
| `ADR-0126-graph-authoritative-room-identity-at-execution` | [ADR-0126 (formerly 0069) — Graph-Authoritative Room Identity at Execution](./ADR-0126-graph-authoritative-room-identity-at-execution.md) |
| `ADR-0127-stair-authored-by-height-implied-level-above` | [ADR-0127 (formerly ADR-0098) — A stair is authored by HEIGHT; the level above is IMPLIED, not required](./ADR-0127-stair-authored-by-height-implied-level-above.md) |
| `ADR-0128-sunhours-bvh-no-recompute-and-facade-real-geometry` | [ADR-0128 (formerly ADR-0110) — Forma sun-hours: BVH-accelerated raycast, no-recompute caching, and the path to real-geometry façade analysis](./ADR-0128-sunhours-bvh-no-recompute-and-facade-real-geometry.md) |
| `ADR-0129-room-redetect-noprogress-loop-guard` | [ADR-0129 (formerly ADR-0117) — Room re-detection is loop-guarded so a non-closing room loop cannot re-arm forever (§FIX-ROOMREDETECT-NOPROGRESS-GUA](./ADR-0129-room-redetect-noprogress-loop-guard.md) |
| `ADR-0213-persistence-operational` | [ADR-0213 — Persistence Operational Semantics](./ADR-0213-persistence-operational.md) |
| `ADR-0214-ai-l75-operational` | [ADR-0214 — AI L7.5 Operational Semantics](./ADR-0214-ai-l75-operational.md) |
| `ADR-0215-visibility-intent-placement` | [ADR-0215 — Visibility-Intent Layer Placement](./ADR-0215-visibility-intent-placement.md) |
| `ADR-0216-drawing-engine-architecture` | [ADR-0216 — Drawing Engine Architecture](./ADR-0216-drawing-engine-architecture.md) |
| `ADR-0217-type-catalog-scope` | [ADR-0217 — Element Type Catalog Scope](./ADR-0217-type-catalog-scope.md) |
| `ADR-0218-capacity-cut-list` | [ADR-0218 — Capacity Cut List (Velocity-Slip Triage)](./ADR-0218-capacity-cut-list.md) |
| `ADR-0219-soft-lock-semantics` | [ADR-0219 — Soft-Lock Semantics](./ADR-0219-soft-lock-semantics.md) |
| `ADR-0220-kernel-robustness` | [ADR-0220 — Geometry Kernel Robustness Budget](./ADR-0220-kernel-robustness.md) |
| `ADR-0221-enterprise-security-data-residency` | [ADR-0221 — Enterprise Security & Data Residency](./ADR-0221-enterprise-security-data-residency.md) |
| `ADR-0222-renderer-topology-backend-runtime` | [ADR-0222 — Renderer Topology + Backend Runtime](./ADR-0222-renderer-topology-backend-runtime.md) |
| `ADR-0223-library-raf-quarantine` | [ADR-0223 — Library rAF Quarantine](./ADR-0223-library-raf-quarantine.md) |
| `ADR-0224-constraint-solver` | [ADR-0224 — Constraint Solver](./ADR-0224-constraint-solver.md) |
| `ADR-0225-three-js-pin` | [ADR-0225 — Three.js Version Pin & WebGPU Path](./ADR-0225-three-js-pin.md) |
| `ADR-0226-ui-binding-vanilla-ts` | [ADR-0226 — UI Binding: Vanilla TS (Path A confirmed); React in deps but unused at runtime](./ADR-0226-ui-binding-vanilla-ts.md) |
| `ADR-0227-schedule-formula-library` | [ADR-0227 — Schedule Formula Library Scope](./ADR-0227-schedule-formula-library.md) |
| `ADR-0228-authority-unification` | [ADR-0228 — Authority Unification (one permission model)](./ADR-0228-authority-unification.md) |
| `ADR-0229-pdf-to-bim-scope` | [ADR-0229 — PDF-to-BIM Scope (the moat)](./ADR-0229-pdf-to-bim-scope.md) |
| `ADR-0230-lifecycle-subsystem-placement` | [ADR-0230 — Lifecycle Subsystem Placement](./ADR-0230-lifecycle-subsystem-placement.md) |
| `ADR-0231-cde-storage-topology` | [ADR-0231 — CDE Storage Topology: Share L0 Event Log](./ADR-0231-cde-storage-topology.md) |
| `ADR-0232-clash-rule-language` | [ADR-0232 — Clash Classification Rule Language: Declarative JSON DSL](./ADR-0232-clash-rule-language.md) |
| `ADR-0233-mep-propagation-graph-traversal` | [ADR-0233 — MEP System Propagation: Graph Traversal (not Constraint Solver)](./ADR-0233-mep-propagation-graph-traversal.md) |
| `ADR-0234-cobie-fallback-policy` | [ADR-0234 — COBie Mapping Fallback: Synthesise + Issue Row (Default)](./ADR-0234-cobie-fallback-policy.md) |
| `ADR-0235-buildingsmart-cert-scope` | [ADR-0235 — buildingSMART Certification Scope: RV + DTV (not CV 2.0)](./ADR-0235-buildingsmart-cert-scope.md) |
| `ADR-0236-stakeholder-review-pricing` | [ADR-0236 — Stakeholder Reviewer Pricing: Free Per Project (Unlimited)](./ADR-0236-stakeholder-review-pricing.md) |
| `ADR-0237-sovereignty-default-cloud-region` | [ADR-0237 — Hybrid Sovereignty Default: Cloud-Region (Auto-Selected)](./ADR-0237-sovereignty-default-cloud-region.md) |
| `ADR-0238-byok-key-custody` | [ADR-0238 — Enterprise BYOK Key Custody: KMS-Default + HSM-Tier](./ADR-0238-byok-key-custody.md) |
| `ADR-0239-export-worker-architecture` | [ADR-0239 — Export Worker Architecture (Sheets + Schedules)](./ADR-0239-export-worker-architecture.md) |
| `ADR-0240-schedule-export-formats` | [ADR-0240 — Schedule Export Formats: CSV, XLSX, PDF](./ADR-0240-schedule-export-formats.md) |
| `ADR-0241-portfolio-aggregate-placement` | [ADR-0241 — Portfolio Aggregate Placement](./ADR-0241-portfolio-aggregate-placement.md) |
| `ADR-0242-physics-runtime-vs-dev-only` | [ADR-0242 — `src/physics/` Runtime vs Dev-Only](./ADR-0242-physics-runtime-vs-dev-only.md) |
| `ADR-0243-utils-inline-vs-package` | [ADR-0243 — `src/utils/*` Inline vs `packages/utils`](./ADR-0243-utils-inline-vs-package.md) |
| `ADR-0244-customer-migration-pryzm1-to-pryzm2` | [ADR-0244 — Customer Migration (PRYZM 1 → PRYZM 2)](./ADR-0244-customer-migration-pryzm1-to-pryzm2.md) |
| `ADR-0245-mixed-auth-supabase-replit-pg` | [ADR-0245 — Mixed-Auth Architecture: Supabase Service-Role for Identity + Replit PG for Project Storage](./ADR-0245-mixed-auth-supabase-replit-pg.md) |
| `ADR-0246-instanced-mesh-coalescing` | [ADR-0246 — InstancedMesh Post-Batch Coalescing Strategy](./ADR-0246-instanced-mesh-coalescing.md) |
| `ADR-0247-web-worker-geometry-pipeline` | [ADR-0247 — Web Worker Geometry Build Pipeline](./ADR-0247-web-worker-geometry-pipeline.md) |
| `ADR-0248-virtualized-element-store` | [ADR-0248 — Virtualized ElementStore with Spatial LRU Streaming](./ADR-0248-virtualized-element-store.md) |
| `ADR-0249-ydoc-per-level-collaboration` | [ADR-0249 — Y.Doc-per-Level Collaboration Architecture](./ADR-0249-ydoc-per-level-collaboration.md) |
| `ADR-0250-ai-response-cache-content-hash` | [ADR-0250 — AI Response Cache by Content Hash](./ADR-0250-ai-response-cache-content-hash.md) |
| `ADR-0251-undo-single-source-of-truth` | [ADR-0251 — Undo as single-source-of-truth + derived mesh (patch-inverse on one store)](./ADR-0251-undo-single-source-of-truth.md) |
| `ADR-0252-docs-site-marketing-surface` | [ADR-0252 — Docs-site marketing surface (Cloudflare Pages + 404-as-page + token reuse)](./ADR-0252-docs-site-marketing-surface.md) |
| `ADR-0253-lockfile-drift-policy` | [ADR-0253 — Lockfile-drift policy + CI gate](./ADR-0253-lockfile-drift-policy.md) |
| `ADR-0254-reference-only-repos` | [ADR-0254 — Reference-only repos as gitignored subtrees](./ADR-0254-reference-only-repos.md) |
| `ADR-0255-one-pryzm-cloudflare-supabase` | [ADR-0255 — One PRYZM: hosted on Cloudflare + Supabase](./ADR-0255-one-pryzm-cloudflare-supabase.md) |
| `ADR-0256-supabase-auth-migration` | [ADR-0256 — Supabase Auth migration (Phase A.5 of ADR-0255)](./ADR-0256-supabase-auth-migration.md) |
| `ADR-0257-realtime-geometry-and-view-interactivity` | [ADR-0257 — Realtime geometry editing & view interactivity](./ADR-0257-realtime-geometry-and-view-interactivity.md) |
| `ADR-0258-modular-building-plan-preview` | [ADR-0258 — Modular building-plan preview (typology-agnostic preview kit)](./ADR-0258-modular-building-plan-preview.md) |
| `ADR-0259-site-plan-overlay` | [ADR-0259 — Georeferenced site-plan overlay (PDF/image) for boundary capture](./ADR-0259-site-plan-overlay.md) |
| `ADR-0260-chunked-project-load-and-diagnostic-gating` | [ADR-0260 — Chunked, frame-yielding project load + load-time diagnostic gating](./ADR-0260-chunked-project-load-and-diagnostic-gating.md) |
| `ADR-0261-webgl2-render-on-move-and-wall-drag-defer` | [ADR-0261 — WebGL2 continuous render-on-move & wall-drag rebuild deferral](./ADR-0261-webgl2-render-on-move-and-wall-drag-defer.md) |
| `ADR-0262-doors-as-circulation-graph-entities` | [ADR-0262 — Doors as first-class circulation-graph entities + door-aware reachability](./ADR-0262-doors-as-circulation-graph-entities.md) |
| `ADR-0263-slab-by-region-curved-walls-and-3d-pick` | [ADR-0263 — Slab "By Region": shared curve-aware tracer + 3D-view region pick](./ADR-0263-slab-by-region-curved-walls-and-3d-pick.md) |
| `ADR-0264-open-old-ceiling-restore-and-webgl2-view-unstick` | [ADR-0264 — Open-old-project: ceiling restore mapping + WebGL2 view-unstick (OBC loop hardening)](./ADR-0264-open-old-ceiling-restore-and-webgl2-view-unstick.md) |
| `ADR-0265-solidity-poche-and-lod-across-view-types` | [ADR-0265 — Solidity, Poché, Pen Hierarchy and Level of Detail ACROSS Plan, Elevation and Section](./ADR-0265-solidity-poche-and-lod-across-view-types.md) |
| `ADR-0266-dimension-drives-model-or-overrides-text` | [ADR-0266 — Does an editable DIMENSION drive the model, or override the text?](./ADR-0266-dimension-drives-model-or-overrides-text.md) |

## §6b — The CORPUS DOCTRINE SET (ADR-0283–0287, founder-signed 2026-08-02)

Five ADRs ratified together as one family. They govern **every municipality**, and a city dossier
should CITE them rather than re-argue the doctrine.

| ADR | The rule, in one line |
|---|---|
| [ADR-0283](./ADR-0283-authoritative-publication-bounds-knowledge-unknown-is-valid.md) | Authoritative publication defines the boundary of verified knowledge. **UNKNOWN is a valid product state.** |
| [ADR-0284](./ADR-0284-derived-geometry-permissible-derived-law-is-not.md) | **Derived geometry is permissible; derived law is not.** |
| [ADR-0285](./ADR-0285-computing-an-observable-criterion-is-implementation.md) | Computing an observable quantity is *implementation* where the ordinance states the criterion but not the method. |
| [ADR-0286](./ADR-0286-every-derived-value-exposes-legal-computational-source-and-tier.md) | Every derived value exposes **legal source · computational source · confidence tier**. |
| [ADR-0287](./ADR-0287-resolvers-refuse-when-uncertainty-changes-the-legal-outcome.md) | Resolvers **refuse** whenever uncertainty can change the legal outcome. |

> PRYZM may assert only what authoritative publication demonstrates. Where evidence is incomplete or
> legally insufficient, PRYZM returns Unknown rather than inferring entitlement.

⚠ **The §6 table above is STALE, and the staleness NOTE was stale too** — re-measured
**2026-08-21** (lane FREEZE1): the table's last row is **ADR-0287**, and the directory holds
**ADR-0338**. This note previously read *"ends at ADR-0266 … through 0287"*, i.e. **both numbers had
moved on** — the table had in fact been extended to 0287 and the directory had grown by fifty more.
⭐ **Re-measure, never re-transcribe:** `ls docs/02-decisions/adrs/ADR-*.md | tail -1` and
`grep -o 'ADR-0[0-9]*' README.md | sort -u | tail -1`. Deliberately not backfilled here (the
gap is ~51 entries authored by other lanes); recorded so the gap is known rather than mistaken for
"no ADRs exist in that range".

## §7 — Update / supersession rule

You don't edit an ACCEPTED ADR. To change a decision:

1. Write a new ADR that explicitly supersedes the old one (cite the number).
2. Mark the old one `Status: SUPERSEDED by …` (this is the ONLY edit ever allowed to a sealed ADR body).
3. Update any contracts that cited the superseded ADR.

CI gate (planned): `tools/ga-gate/check-adr-immutability.ts` — fails any PR that edits an ACCEPTED ADR body except the Status-line annotation.
