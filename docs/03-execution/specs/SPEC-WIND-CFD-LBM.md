# SPEC — In-Browser Wind CFD (WebGPU Lattice-Boltzmann)

**Status:** DRAFT (2026-06-09) · **Owner:** PRYZM core · **Tracker:** `WIND-CFD` → tracker §28
**Governs:** the engineering design of an in-browser pedestrian-wind / wind-comfort solver — a WebGPU Lattice-Boltzmann (LBM) flow simulation around the site's buildings, running client-side with no cloud/queue, in tens of seconds, for early-stage comfort assessment between buildings (recirculation, roof-edge separation, corner accelerations).
**Governance:** [C54 — In-Browser Wind CFD](../../02-decisions/contracts/C54-IN-BROWSER-WIND-CFD.md) (the binding invariants) · [ADR-0064](../../02-decisions/adrs/0064-in-browser-wind-cfd-webgpu-lbm.md) (the client-side WebGPU+LBM decision) · [C19](../../02-decisions/contracts/C19-SITE-MODEL-AND-PARCEL.md) (Site + context buildings) · [C21](../../02-decisions/contracts/C21-CLIMATE-INGESTION.md) (climate / wind rose) · [C12](../../02-decisions/contracts/C12-GEOSPATIAL.md) (LTP-ENU) · [C04](../../02-decisions/contracts/C04-RENDERING-AND-SCHEDULING.md) (THREE/rAF ownership) · [C45](../../02-decisions/contracts/C45-BROWSER-AND-DEVICE-MATRIX.md) (WebGPU tiering).
**Relates to:** [SPEC-ENVIRONMENTAL-DESIGN-DRIVERS](./SPEC-ENVIRONMENTAL-DESIGN-DRIVERS.md) §3 (wind) + §5 (E.4 `naturalVentilation`) and [SPEC-FORMA-SITE-VIEW](./SPEC-FORMA-SITE-VIEW.md) §6 (the coarse wind-rose overlay this is the high-fidelity sibling of).
**Scope discipline:** the solver is a NEW pure compute package; it **consumes** the existing site + climate substrate read-only and **renders** through the existing THREE/Cesium owner. It does NOT introduce a parallel building/terrain model or a parallel wind objective.

> R&D reference (founder-shared): a wind CFD simulation of flow around buildings running IN THE BROWSER on WebGPU + Lattice-Boltzmann, no cloud/queue, tens of seconds; goal = a free fast early-stage wind-comfort assessment between buildings; validated against AIJ benchmarks (Case B isolated body r≈0.84); absolute velocities in sheltered zones still calibrating (the honesty framing → C54 §1.1).

---

## §1 — Why (and why client-side)

Today PRYZM's wind awareness is a **wind rose** (`packages/schemas/src/climate/windRose.ts`, `buildWindRose`) rendered as a 2D rose + coarse 3D streaks (SPEC-FORMA-SITE-VIEW §6, A.21.D24) and consumed as a *direction-only* input by the E.4 `naturalVentilation` objective (`tgl/envDrivers.ts`). There is **no actual flow field** — no answer to "is this courtyard sheltered? does this corner accelerate? does the roof edge separate?".

A full CFD answers that, but cloud CFD is slow, costs money, queues, and ships site geometry off-device. An LBM solver maps naturally to GPU compute (local, explicit, stencil-parallel) and the R&D reference shows a browser WebGPU LBM gives a *useful early-stage* answer in tens of seconds, validated to AIJ Case-B r≈0.84. The decision to do this client-side is recorded in ADR-0064. This SPEC is the engineering design; no solver code ships with it.

## §2 — Solver design (WebGPU LBM)

- **Method:** Lattice-Boltzmann (BGK / single-relaxation-time to start; MRT/regularised as a later refinement for stability at higher Reynolds number). LBM is chosen over Navier-Stokes finite-volume because the collide-stream update is a local stencil — ideal for a WebGPU compute kernel, no global pressure solve.
- **Lattice:** **D2Q9** for the first slice (a horizontal pedestrian-level slice — fast, the most demanded answer), then **D3Q19** for the full 3D field (roof-edge separation, vertical recirculation).
- **Kernels:** per-step `collide` + `stream` compute shaders over a regular lattice stored in GPU storage buffers (double-buffered f-distributions); bounce-back boundary at building voxels; inlet/outlet at the domain faces. Macroscopic velocity/density derived in a reduction pass for the result field.
- **Boundary (buildings):** voxelise the analysis building + `ContextBuilding` massing (C19 §1.5) into the lattice as solid cells (bounce-back). The walkable ground plane is a solid floor with a log-law-ish near-wall treatment (calibration target — see §5).
- **Stability/convergence:** fixed step budget with an early-out when a windowed velocity-residual falls below a threshold; the (resolution, step budget, relaxation time, seed) tuple is recorded with the result for determinism (C54 §1.3).

## §3 — Domain + inlet setup (from the site)

- **Domain** is built from the C19 Site: bounding box around the analysis building + nearby context buildings, padded per AIJ blockage-ratio guidance (inlet/lateral/top clearances sized from building height), positioned in the C12 LTP-ENU frame. No hand-authored geometry (C54 §1.5).
- **Inlet** wind direction + speed from the C21 **wind rose** — the dominant sector by default, or a user-picked sector / speed band (the same `buildWindRose` aggregate the Forma overlay uses). The inlet is a vertical wind profile (power-law / log-law per terrain category) rather than a uniform jet.
- **Resolution** is adaptive to domain size against a target cell budget so the perf NFT (§6) holds; the chosen resolution is part of the recorded config.

## §4 — Pedestrian-comfort output

- **Primary field:** the macroscopic velocity magnitude at pedestrian height (~1.5–2 m) → a normalised wind-amplification factor (local speed / reference free-stream speed) — the quantity AIJ benchmarks measure and the founder's "comfort between buildings" target.
- **Comfort categories:** map the amplification factor (optionally weighted by wind-rose frequency for an annual exceedance estimate) to a small ordinal comfort scale (e.g. sitting / standing / strolling / business-walking / uncomfortable / unsafe — Lawson-style bands), rendered as a coloured ground heat-field over the site (in the `#6600FF`-family palette consistent with the wind-rose streaks).
- **Feature callouts:** corner-acceleration hotspots, recirculation/wake zones, sheltered courtyards — the qualitatively-validated features (vs the still-calibrating absolute sheltered-zone speeds, surfaced per C54 §1.1).
- **Downstream:** a shelter/exposure scalar per analysis region feeds the EXISTING wind driver / E.4 `naturalVentilation` input (C54 §1.6) — refining data, not adding a parallel objective.

## §5 — AIJ validation harness

- A fixed set of **AIJ benchmark geometries** (Case B isolated building first; grouped-building cases as the harness grows) with their published reference measurement points.
- The harness runs the solver headless (a CI WebGPU context or a documented offline reference run), extracts predicted point velocities, and computes the **correlation r vs the AIJ measurements**. Gate: Case-B **r ≥ committed threshold** (reference achieved ≈0.84) — `windcfd-aij-validation` CI test (C54 §1.4); a regression below threshold fails the build.
- **Known calibration status** (documented + surfaced per C54 §1.1): bulk features (corner accel, recirculation, roof-edge separation) validated; **absolute velocities in sheltered/low-speed zones are under-calibrated** — read qualitatively there. Calibration knobs: near-wall treatment, relaxation time vs target Reynolds, lattice resolution.

## §6 — Perf, fallback, layering

- **Perf NFT (C10):** a default-resolution single-direction D2Q9 run completes in **tens of seconds** on a mid-tier WebGPU GPU; the solver yields to the frame scheduler between compute batches (P3 — no private rAF, no main-thread block) and a run is cancellable (`windcfd.cancel`).
- **Fallback (C54 §1.2):** no WebGPU → `windcfd.run` soft-fails `windcfd.unavailable`, the UI shows a "needs WebGPU" affordance, and the coarse wind-rose overlay (SPEC-FORMA-SITE-VIEW §6) remains the available wind cue. No CPU LBM fallback.
- **Layering (C54 §1.8):** NEW pure compute package `packages/wind-cfd/` (L1/L2 — WGSL LBM kernels + a pure `WindCfdConfig`/`WindCfdResult` data model + voxeliser; no THREE/DOM/I-O); result rendered via `packages/renderer-three/` / the Cesium owner (P2); launched from an `apps/editor/` site-analysis surface (L5) via `windcfd.*` commands (P6); WebGPU device acquired in the C02/C04 GPU-context region. Schemas in `packages/schemas/src/climate/windCfd.ts` (P5 — pure).

## §7 — Phased build plan

- **W.1 — Pure data model + voxeliser (L0/L2).** `WindCfdConfig`/`WindCfdResult` schemas + the building-massing → lattice voxeliser, pure + unit-tested (no GPU). Domain/inlet derivation from C19 + C21 wind rose.
- **W.2 — D2Q9 solver (pedestrian slice).** WGSL collide/stream + bounce-back + inlet profile; macroscopic reduction → amplification field. Deterministic per config (C54 §1.3). Headless-runnable for tests.
- **W.3 — AIJ Case-B validation harness + CI gate.** Benchmark geometry + reference points + r-correlation gate (C54 §1.4). This gate must be green before the result is surfaced as anything but a demo.
- **W.4 — Comfort mapping + result overlay.** Amplification → Lawson-style comfort bands → `#6600FF`-palette ground field rendered over the Forma site view; BETA + calibration affordance (C54 §1.1).
- **W.5 — D3Q19 3D field.** Full 3D for roof-edge separation + vertical recirculation; perf re-budgeted (W.5 may need a coarser default resolution).
- **W.6 — Feed the wind driver.** Supply the shelter/exposure scalar into the EXISTING E.4 `naturalVentilation` input (C54 §1.6) — no new objective axis.
- **W.7 — Command surface + UX + cancellation + WebGPU fallback.** `windcfd.run/cancel/setVisualization/clear` (C54 §2), the site-analysis panel trigger, soft-fallback (C54 §1.2), OTel spans (P8).

Each step ships behind its own tests; W.3 (AIJ gate) gates W.4's honesty surface; W.6 only lands after W.3 (don't feed the engine an unvalidated field).

## §8 — Acceptance

A user on a WebGPU browser opens the site-analysis panel, picks a wind direction (defaulted from the wind rose), runs the CFD, and within tens of seconds sees a coloured pedestrian-comfort field over the site showing corner accelerations / sheltered courtyards / wakes — clearly labelled BETA with the sheltered-zone calibration caveat. The AIJ Case-B r-gate is green in CI. No WebGPU → the user sees the wind-rose overlay + a "needs WebGPU" note instead, with no error. The layout engine's wind driver can read a real shelter value where it previously had only a wind-rose direction.
