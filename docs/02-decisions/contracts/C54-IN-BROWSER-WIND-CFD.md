# C54 — In-Browser Wind CFD (WebGPU Lattice-Boltzmann)

> **Stamp**: 2026-06-09 · **Status**: DRAFT
> **Scope**: governs the in-browser early-stage **wind-comfort / pedestrian-wind analysis** subsystem — a WebGPU Lattice-Boltzmann (LBM) flow solver that simulates wind around the site's buildings client-side (no cloud, no queue), in tens of seconds, for early-stage comfort assessment between buildings (recirculation, roof-edge separation, corner accelerations). Companion to [C21](./C21-CLIMATE-INGESTION.md) (provides the inlet wind rose), [C19](./C19-SITE-MODEL-AND-PARCEL.md) (provides the context-building massing the flow runs around), and [C12](./C12-GEOSPATIAL.md) (coordinate substrate).
> **Depends on**: [C03](./C03-SCHEMAS-COMMANDS-AND-STATE.md) (schemas/commands), [C04](./C04-RENDERING-AND-SCHEDULING.md) (single THREE owner, single rAF — the WebGPU compute device + result-field rendering), [C19](./C19-SITE-MODEL-AND-PARCEL.md) (Site + ContextBuildings), [C21](./C21-CLIMATE-INGESTION.md) (climate / wind rose), [C12](./C12-GEOSPATIAL.md) (LTP-ENU), [C10](./C10-PERFORMANCE-AND-OBSERVABILITY.md) (perf budgets + OTel), [C45](./C45-BROWSER-AND-DEVICE-MATRIX.md) (WebGPU opt-in tiering).
> **Downstream**: the layout engine's [SPEC-ENVIRONMENTAL-DESIGN-DRIVERS](../../03-execution/specs/SPEC-ENVIRONMENTAL-DESIGN-DRIVERS.md) §3 (wind) + §5 (E.4 `naturalVentilation` objective) — a CFD result MAY refine the wind direction/shelter inputs that today come only from the wind rose; the Forma site view's wind overlay ([SPEC-FORMA-SITE-VIEW](../../03-execution/specs/SPEC-FORMA-SITE-VIEW.md) §6, A.21.D24 wind streaks) — the CFD velocity field is the high-fidelity sibling of the coarse wind-rose streaks.
> **Decision record**: [ADR-0064](../adrs/0064-in-browser-wind-cfd-webgpu-lbm.md) — the decision to run CFD client-side on WebGPU+LBM (vs cloud CFD vs none).
> **Engineering spec**: [SPEC-WIND-CFD-LBM](../../03-execution/specs/SPEC-WIND-CFD-LBM.md).
> **Key principles**: **P2** (single THREE owner — only `packages/renderer-three/` may `import * as THREE`; the result velocity/comfort field renders through it), **P3** (single rAF — the solver's per-step compute dispatch is driven by the frame scheduler, never a private `requestAnimationFrame` loop), **P5** (schemas pure — the CFD config/result schemas in `packages/schemas/` carry no GPU/THREE/I-O imports), **P6** (every CFD run is launched via a `windcfd.*` command, never a direct store write), **P8** (every public CFD op opens an OTel span `pryzm.windcfd.<verb>`).

---

## §1 — Invariants

The numbered rules below are binding on every PR that touches the wind-CFD subsystem. Each invariant has an §1.N id usable in `TODO(C54.N)` annotations and in `check-windcfd-*.ts` CI gate failure messages.

### §1.1 — Honesty rule: BETA + calibration status MUST be surfaced

The wind-CFD result is an **early-stage indicative** tool, not a certified engineering analysis. Every surface that presents a CFD result (overlay, panel, exported image, AI summary) MUST carry:

- a visible **BETA** label, and
- the **calibration status** of the result — specifically that absolute velocities in **sheltered / low-speed zones** are still being calibrated and SHOULD be read as relative/qualitative there, while bulk flow features (corner acceleration, recirculation, roof-edge separation) are the validated output.

This mirrors the R&D reference's own honesty framing. A CFD result MUST NOT be presented as a compliance-grade microclimate certification. **Enforcement**: `check-windcfd-beta-label.ts` greps the result surfaces for the BETA + calibration affordances; the AI summary template MUST include the disclaimer string.

**Why**: an indicative LBM run validated to AIJ Case-B r≈0.84 is genuinely useful for early design, but mislabelling it as certified analysis is a liability and an architectural-honesty violation. The label is the contract.

### §1.2 — The compute boundary is WebGPU; absence is a graceful fallback, never a crash

The LBM solver runs on **WebGPU compute shaders only**. The subsystem MUST detect WebGPU availability at run-launch and:

- when WebGPU is present (per [C45](./C45-BROWSER-AND-DEVICE-MATRIX.md) opt-in tiering), run the solver on the GPU;
- when WebGPU is absent, the `windcfd.run` command MUST fail **soft** — emit `windcfd.unavailable` with a reason, surface a "wind CFD needs WebGPU" affordance, and leave the coarse wind-rose overlay (SPEC-FORMA-SITE-VIEW §6) as the available wind cue. It MUST NOT throw, block the frame loop, or attempt a CPU LBM fallback in the main thread.

**Why**: WebGPU is opt-in/rolling-out (C45); the product must degrade to the existing wind-rose substrate rather than break on Safari/older Chrome/no-WebGPU hardware.

### §1.3 — Determinism + repeatability

A CFD run is **deterministic for a fixed (domain, mesh, inlet, lattice, step-count, seed)** tuple: re-running the same configuration MUST produce a velocity field within a documented numerical tolerance (floating-point GPU reduction order is the only permitted source of variance, bounded in §SPEC). The run configuration (domain bounds, lattice resolution, D2Q9/D3Q19 choice, inlet profile, relaxation time, convergence/step criterion, solver version) MUST be recorded with the result so a result can be reproduced and, per [C23](./C23-PROVENANCE-AND-AI-AUDIT.md), carry provenance when an AI consumes it.

**Why**: a non-reproducible analysis cannot feed a deterministic layout engine (ADR-0061) or be audited.

### §1.4 — AIJ benchmark validation is a release gate

The solver MUST be validated against the published **AIJ (Architectural Institute of Japan) benchmark cases** for pedestrian wind around buildings. The validation harness (a fixed set of benchmark geometries + reference measurement points) MUST run in CI as a numerical-regression gate:

- **Case B (isolated single building)** is the primary gate: the correlation of predicted vs measured point velocities MUST meet a published target (reference R&D achieved **r ≈ 0.84**); the gate fails if a change regresses r below the committed threshold.
- Additional AIJ cases (grouped buildings) are tracked as the harness grows.

The current calibration status (which cases pass, the r-values, the known sheltered-zone under-calibration) MUST be documented in the SPEC and surfaced per §1.1.

**Why**: "validated against AIJ" is the difference between a toy and a usable early-stage tool. Encoding it as a CI gate prevents silent solver regressions.

### §1.5 — Domain is built from the Site context, not hand-authored

The CFD domain MUST be derived from the existing site substrate: the analysis building(s) + `ContextBuilding` massing (C19 §1.5 — OSM / Cesium tiles / Forma massing), positioned in the C12 LTP-ENU frame, with the inlet wind direction + speed taken from the C21 climate **wind rose** (the dominant or a user-selected sector). The subsystem MUST NOT introduce a parallel building/terrain model — it consumes C19/C21 read-only.

**Why**: a second source of truth for "what buildings are on the site" would diverge from the model the rest of the platform analyses; the wind rose is already the canonical inlet data (SPEC-FORMA-SITE-VIEW §6, `windRose.ts`).

### §1.6 — Results feed the existing wind/ventilation consumers; no parallel objective

A CFD velocity/comfort field MAY **refine** the inputs of consumers that already exist — the environmental-design wind drivers (SPEC-ENVIRONMENTAL-DESIGN-DRIVERS §3) and the E.4 `naturalVentilation` objective (§5, `tgl/envDrivers.ts`) — by supplying a measured shelter/exposure value where today only the wind-rose direction is used. It MUST do so by feeding the **existing** objective/driver input, NOT by adding a parallel "CFD objective" that competes with `naturalVentilation`. Likewise the Forma wind overlay consumes the CFD field as a higher-fidelity layer alongside the coarse wind streaks, not as a separate viz stack.

**Why**: single-source-of-truth for each design driver (the SPEC §1 conflict hierarchy and the C52/C53 "one engine input per knob" doctrine) — a CFD result is better DATA for the wind driver, not a new driver.

### §1.7 — Perf + privacy budgets

- **Perf**: a default-resolution single-direction run MUST complete in **tens of seconds** on a mid-tier WebGPU GPU (the [C10](./C10-PERFORMANCE-AND-OBSERVABILITY.md) NFT for this subsystem; exact target in the SPEC). The solver MUST yield to the frame scheduler between compute batches (P3) so the editor stays interactive; a run MUST be cancellable.
- **Privacy**: a CFD run uses only site geometry + climate (C19/C21) — no PII (C22). The run executes **entirely client-side**; no geometry or result leaves the browser unless the user explicitly exports/shares it. This is a deliberate property of the client-side decision (ADR-0064) and a C22 alignment.

**Why**: the founder's goal is a *free, fast, local* early-stage assessment; cloud CFD would add cost, a queue, and a data-egress/privacy surface this avoids by construction.

### §1.8 — Layered placement

The solver lives in a **new low-layer compute package** (L1/L2 — pure WebGPU LBM kernels + a pure config/field data model, no THREE, no DOM), with the result **rendered** through `packages/renderer-three/` (P2) and **launched/controlled** from an `apps/editor/` site-analysis surface (L5) via `windcfd.*` commands (P6). The WebGPU device acquisition is wired in the composition root region that owns the GPU context (C02/C04), never ad-hoc.

**Why**: keeps the THREE owner singular (P2), the rAF singular (P3), and the solver reusable/testable as a pure package independent of the editor.

---

## §2 — Command surface (normative shape — full schema in SPEC)

| Command | Effect |
|---|---|
| `windcfd.run` | Launch a run for the current Site + a chosen inlet sector; deterministic per config (§1.3); soft-fails `windcfd.unavailable` when no WebGPU (§1.2). |
| `windcfd.cancel` | Cancel an in-flight run (§1.7). |
| `windcfd.setVisualization` | Toggle/parameterise the result overlay (velocity field / comfort categories) — visibility intent per P7. |
| `windcfd.clear` | Drop the current result + overlay. |

All emit OTel spans `pryzm.windcfd.<verb>` (§1, P8). All mutate via the command bus only (P6).

---

## §3 — CI gates

| Gate | Type | Checks |
|---|---|---|
| `check-windcfd-beta-label.ts` | hard-fail | result surfaces carry BETA + calibration affordance (§1.1) |
| `check-windcfd-no-webgpu-import-outside-pkg.ts` | hard-fail | WebGPU/THREE ownership boundary (§1.8, P2) |
| `windcfd-aij-validation` (CI test) | hard-fail | AIJ Case-B r ≥ committed threshold (§1.4) |
| `check-windcfd-otel-spans.ts` | soft-fail → hard at subsystem GA | every public CFD op opens a `pryzm.windcfd.*` span (§1, P8) |

---

## §4 — Status

DRAFT 2026-06-09. Queued behind the Feature-2 wind-CFD work (tracker §28). No solver code ships with this contract; it governs the subsystem when picked up. DRAFT → CANONICAL ratifies on the first PR after stakeholder sign-off + the AIJ validation gate (§1.4) green.
