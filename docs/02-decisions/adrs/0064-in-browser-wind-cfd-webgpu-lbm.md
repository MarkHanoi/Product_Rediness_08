# 0064 — Wind CFD runs client-side on WebGPU + Lattice-Boltzmann (not cloud, not nothing)

**Status**: PROPOSED
**Date**: 2026-06-09
**Deciders**: architecture team (founder-driven — R&D reference: a browser WebGPU+LBM wind CFD, no cloud/queue, tens of seconds, validated to AIJ Case-B r≈0.84)
**Related contracts**: [C54 — In-Browser Wind CFD](../contracts/C54-IN-BROWSER-WIND-CFD.md) (the normative form of this decision), [C21 — Climate Ingestion](../contracts/C21-CLIMATE-INGESTION.md) (wind-rose inlet), [C19 — Site Model & Parcel](../contracts/C19-SITE-MODEL-AND-PARCEL.md) (context-building massing), [C04 — Rendering & Scheduling](../contracts/C04-RENDERING-AND-SCHEDULING.md) (THREE/rAF ownership), [C45 — Browser & Device Matrix](../contracts/C45-BROWSER-AND-DEVICE-MATRIX.md) (WebGPU tiering), [C22 — Privacy & PII Tier](../contracts/C22-PRIVACY-AND-PII-TIER.md) (no data egress)
**Related ADRs**: [ADR-0007](./0007-webgpu-webgl2-dual-mode.md) (WebGPU/WebGL2 dual mode — the rendering substrate), [ADR-0061](./0061-building-graph-bidirectional-edit-substrate.md) (determinism — a CFD result must be reproducible to feed the engine)
**Engineering spec**: [SPEC-WIND-CFD-LBM](../../03-execution/specs/SPEC-WIND-CFD-LBM.md)

## Context

PRYZM resolves wind today only as a **wind rose** — a direction/frequency aggregate (`windRose.ts`, `buildWindRose`) rendered as a 2D rose + coarse 3D streaks (SPEC-FORMA-SITE-VIEW §6, A.21.D24) and consumed as a direction-only input by the E.4 `naturalVentilation` objective (`tgl/envDrivers.ts`). It cannot answer the early-stage *wind-comfort between buildings* questions a designer actually asks: is this courtyard sheltered, does this corner accelerate, does the roof edge separate?

A real CFD answers those. The founder shared an R&D reference showing a wind CFD running **in the browser on WebGPU + Lattice-Boltzmann (LBM)**, no cloud, no queue, in **tens of seconds**, validated against **AIJ benchmarks** (Case B isolated body, r≈0.84), with absolute velocities in sheltered zones still being calibrated. The decision is **how PRYZM should provide CFD**: cloud, client-side, or not at all.

## Decision

**PRYZM runs early-stage wind CFD CLIENT-SIDE on WebGPU compute using a Lattice-Boltzmann solver, validated against AIJ benchmarks, surfaced as an explicitly BETA / partially-calibrated indicative tool.**

- LBM (not finite-volume Navier-Stokes) because the collide-stream update is a local stencil that maps directly to a WebGPU compute kernel with no global pressure solve. D2Q9 pedestrian-slice first, D3Q19 3D later.
- The domain + inlet are built from the EXISTING site substrate (C19 context buildings + C21 wind rose); the result feeds the EXISTING wind driver / `naturalVentilation` input (C54 §1.6), never a parallel objective.
- AIJ Case-B correlation is a CI release gate (C54 §1.4); the honesty rule (BETA + sheltered-zone calibration caveat) is a contract invariant (C54 §1.1).
- WebGPU absence is a graceful soft-fallback to the existing wind-rose overlay (C54 §1.2), not a crash.

The normative invariants live in C54; the engineering design in SPEC-WIND-CFD-LBM. This ADR records the *why we chose client-side WebGPU+LBM*.

## Consequences

- **Positive:** free + fast + local (tens of seconds, no cloud cost, no queue, no data egress — a C22 privacy win by construction); turns the wind driver from direction-only into a real shelter/exposure measurement; reuses the existing site/climate substrate and the existing render owner; the LBM-on-GPU mapping is proven by the R&D reference.
- **Negative / trade-offs:** WebGPU is opt-in/rolling-out (C45) → a real subset of users get only the wind-rose fallback; an indicative LBM run is NOT a certified microclimate analysis → the BETA/calibration honesty rule is mandatory and carries liability if dropped; absolute sheltered-zone velocities need ongoing calibration; a new pure compute package + WGSL kernels + an AIJ harness is real engineering effort (7-step plan, SPEC §7).
- **Determinism:** the run is reproducible per (domain, mesh, inlet, lattice, steps, seed) within a bounded tolerance (C54 §1.3) so it can feed the deterministic layout engine and be audited (C23).

## Alternatives considered

- **Cloud CFD (server/worker queue).** Rejected: adds infrastructure cost, a job queue + latency (minutes, not seconds), and ships site geometry off-device (a C22 privacy + data-egress surface). The founder's explicit goal is a *free, fast, local* early-stage tool — the client-side route is the differentiator.
- **Do nothing — keep only the wind rose.** Rejected: the wind rose gives direction/frequency but no flow field, so it can't answer comfort-between-buildings questions; the layout engine's wind driver stays direction-only.
- **Finite-volume Navier-Stokes on the GPU.** Rejected for the first iteration: the global pressure solve is far harder to express efficiently as WebGPU compute than LBM's local stencil; LBM is the route the R&D reference validated for the browser.
- **Present CFD as certified analysis (drop the BETA label).** Rejected: an indicative AIJ-r≈0.84 run with under-calibrated sheltered zones is genuinely useful for early design but is not compliance-grade; mislabelling it is an architectural-honesty violation and a liability — hence the C54 §1.1 honesty invariant.
