# PRYZM 3 — Contract Suite Index

> **Stamp**: 2026-05-16 · **Status**: CANONICAL  
> **Authority**: these contracts govern every implementation decision in PRYZM 3.  
> When code disagrees with a contract, the code is wrong — fix the code **or** open an ADR that supersedes the contract section; never do both.

---

## Conflict resolution order (strongest → weakest)

1. `docs/03_PRYZM3/01-VISION.md` — intent and principles (P1–P8)
2. `docs/03_PRYZM3/02-ARCHITECTURE.md` — system shape, lint gates, convergence booleans
3. **This contract suite** — per-subsystem binding contracts (C01–C14)
4. `docs/03_PRYZM3/reference/adrs/` — per-decision rationale (45 ADRs)
5. `docs/03_PRYZM3/reference/specs/` — per-system normative specs (40 SPECs)
6. `docs/00_Contracts/archive/superseded-pryzm1-pryzm2/` — archived PRYZM1/2 contracts (informational only)

If a contract and an ADR disagree, **the contract wins**; the ADR must be updated or a new ADR raised. If a contract and the Vision/Architecture docs disagree, **Vision/Architecture wins**; amend the contract.

---

## Contract suite

| # | Contract | Governs | Key principle |
|---|---|---|---|
| **C00** | **Index** (this file) | Hierarchy, conflict resolution · Last updated 2026-05-17 (added C15) | — |
| **C01** | [Architecture & Governance](./C01-ARCHITECTURE-AND-GOVERNANCE.md) | 8-layer model, boundary matrix, CI gates, convergence booleans | P1–P8 |
| **C02** | [Composition Root & Boot](./C02-COMPOSITION-ROOT-AND-BOOT.md) | `composeRuntime()`, `PryzmRuntime`, 3-stage boot, disposal. §3.1 F.events Bootstrap Invariant. §3.2 F-1.2 creation dual-write. §3.3 F-1.2 baseline-update dual-write (hosted-element void correctness). | P1, P3 |
| **C03** | [Schemas, Commands & State](./C03-SCHEMAS-COMMANDS-AND-STATE.md) | L0 schemas, command bus, Zustand stores, CQRS + undo. Hosted element schema: see C15. | P5, P6 |
| **C04** | [Rendering & Scheduling](./C04-RENDERING-AND-SCHEDULING.md) | `renderer-three` (single THREE owner), frame scheduler (single rAF), scene-committer | P2, P3 |
| **C05** | [Persistence & File Format](./C05-PERSISTENCE-AND-FILE-FORMAT.md) | `persistence-client`, `.pryzm` file format, project lifecycle, isolation | P6 |
| **C06** | [UI Shell & Tools](./C06-UI-SHELL-AND-TOOLS.md) | `PlatformRouter`, panels, tool registration, camera, keyboard | P1, P4, P6 |
| **C07** | [Plugin SDK & Marketplace](./C07-PLUGIN-SDK-AND-MARKETPLACE.md) | L6 SDK facade, L7 plugin structure, sandbox, Ed25519, marketplace | P1 |
| **C08** | [Collaboration & Security](./C08-COLLABORATION-AND-SECURITY.md) | CRDT sync, explicit conflicts, JWT auth, rate limiting, CORS, ISO 19650 | P8 |
| **C09** | [AI & Visibility Intent](./C09-AI-AND-VISIBILITY-INTENT.md) | AI host (L2), visibility intent (P7), plan critique, cost governance | P7 |
| **C10** | [Performance & Observability](./C10-PERFORMANCE-AND-OBSERVABILITY.md) | 17 NFTs, OpenTelemetry spans, CI gate inventory, DR runbook | P8 |
| **C11** | [Element Creation Pipeline](./C11-ELEMENT-CREATION-PIPELINE.md) | End-to-end orchestration of element creation for both UI-initiated (user gesture → tool → command) and AI-initiated (AI response → ai-host → command) paths; geometry build lifecycle; event-driven room redetection; batch coalescing. **Covers all three views (3D, plan, elevation) and all element types.** **AS-IS gaps updated 2026-05-04**: 5,627ms LONGTASK eliminated ✅; 117/120 `commandManager.execute()` sites bridged ✅; 2 remaining in `engineLauncher` + `RemoteCommandDispatcher`; 4 systematic interior-protocol gaps (OTel, `runtime.events.emit`, `produceWithPatches`, FrameScheduler) apply universally to all 177 handlers — S03 scope. **2026-05-19 amendments**: §6.2 rewritten with real plan-view trigger chain (5-stage storeEventBus mechanism); §6.3 hardened with RedetectRooms infinite-loop anti-pattern; §7.0 documents 3 critical bugs fixed (F-1.4-REDETECT-LOOP, P3.1-CW-PLAN, FT1-C11-SLAB-BOUNDARY); §10 Transitional Bridge Architecture; §11 Per-Element Compliance Matrix with checklist for new element types. Companion gap analysis: `04-PLAN-FORWARD/34-HANDLER-PROTOCOL-GAP-ANALYSIS.md`. | P3, P6, P8 |
| **C12** | [Geospatial & Coordinate Systems](./C12-GEOSPATIAL.md) | LTP-ENU rebasing (1 km recentre trigger), proj4js integration, IfcProjectedCRS read/write, logarithmic depth buffer for large-scale infrastructure projects | P1, P3, P8 |
| **C13** | [Project Lifecycle and Isolation](./C13-PROJECT-LIFECYCLE-AND-ISOLATION.md) | Normative project session model (open/active/close/switch); isolation invariants preventing per-project state (BatchCoordinator, wall-rebuild flags, pending wall events, rAF handles) from leaking across project boundaries; teardown sequence; E2E testability gates; OTel span requirement. **AS-IS gaps**: 7 gaps (C13-G1–G7) — `pryzm-project-switch` only resets `_levelCamReady`; no `forceReset()` on BatchCoordinator; no teardown surface for closure-private flags. Implementation plan: `04-PLAN-FORWARD/35-PROJECT-ISOLATION-WAVE.md`. | P1, P3, P8 |
| **C14** | [Legacy Elimination & PRYZM3 Enforcement](./C14-LEGACY-ELIMINATION-AND-PRYZM3-ENFORCEMENT.md) | Deep audit of `packages/` (80), `plugins/` (46), `scripts/` (27), and `tools/ga-gate/` (15 gates). Catalogues 10 legacy-pattern categories (LP-01–LP-10) found during the 2026-05-16 audit. Classifies every package as COMPLIANT / TRANSITIONAL-ZONE / LEGACY-ZONE. Prohibits all PRYZM1/2 patterns in new code. Maps each pattern to a migration phase. Identifies 5 GA gate gaps (G-NEW-01–G-NEW-05) not yet covered by existing gates. **Key legacy zones**: `@pryzm/ai-host` (44 window-store reads, 20 CustomEvent dispatches), `@pryzm/command-registry` (165 structuredClone undo snapshots, global-bridge.ts), `@pryzm/core-app-model` (92 window accesses, active StoreEventBus), `plugins/annotations` (12 commands using window.xStore fallback). | P4, P5, P6 |
| **C15** | [Hosted Element / Host-Wall Contract](./C15-HOSTED-ELEMENT-CONTRACT.md) | Parametric offset model for doors and windows; opening void geometry lifecycle; wall baseline update dual-write invariant for void correctness; drag constraint (single-axis, HostedElementDragController); OpeningsChildrenMismatch guard; BaselineReversal guard; OTel requirements. **Added**: 2026-05-17, REGRESSION-DIAGNOSIS.md §R2. | P3, P5, P6 |

---

## Conventions used across all contracts

- **MUST / MUST NOT / SHALL / MAY** — RFC 2119 normative terms.
- **[ADR-NNN]** — links to `docs/03_PRYZM3/reference/adrs/ADR-NNN-*.md`.
- **[SPEC-NN]** — links to `docs/03_PRYZM3/reference/specs/SPEC-NN-*.md`.
- **CI gate: hard-fail** — a merge-blocking lint or test failure.
- **CI gate: soft-fail** — a counter tripwire; becomes hard-fail at the stated phase exit.

---

## How to amend a contract

1. Edit the relevant `C0N-*.md` directly. Do NOT create a new `*-AUDIT.md` alongside it.
2. If the change alters a CI gate or convergence boolean, update `docs/03_PRYZM3/02-ARCHITECTURE.md §8` and `03-CURRENT-STATE.md §1` in the same commit.
3. If the change reverses an ADR decision, raise a superseding ADR first; then amend the contract to cite the new ADR.

---

## What is NOT a contract

- Sprint plans → `docs/03_PRYZM3/04-PLAN-FORWARD/`
- Current status → `docs/03_PRYZM3/03-CURRENT-STATE.md`
- Per-decision rationale → `docs/03_PRYZM3/reference/adrs/`
- Per-system normative spec (wire format, schema tables) → `docs/03_PRYZM3/reference/specs/`
