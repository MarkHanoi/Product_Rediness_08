# ADR-042 — `src/physics/` Runtime vs Dev-Only

| Field | Value |
|---|---|
| Status | **Proposed** — 2026-04-29 (S73-WIRE D2) |
| Closes | `phases/audits/PRYZM2-WIREUP-PLAN-S72/24-pryzm1-src-coverage-audit.md` §24.4 (line 184); `PROCESS-TRACKER.md` §1 open decision row 2 |
| Required by | Sub-phase **G.18** — `DELETE src/physics/` (S84) |
| Owner | Architecture lead |
| Default if not ratified | Dev-only behind `__DEV__` (per PROCESS-TRACKER §1) |

---

## Context

`src/physics/` and `src/render/` together (~600 LOC) host a debug-only physics overlay used during PRYZM 1 development to visualise constraint solving. They do not ship in any production code path today — there is no UI surface that exposes them, no NFT depends on them, and `08-VISION.md §D7` explicitly says the headless app excludes physics.

Two placements were considered:

| Option | Behaviour | Bundle impact |
|---|---|---|
| **A** | Ship as runtime artefact (preserved on disk under `packages/physics-overlay`) | +600 LOC + dependencies on every cold load |
| **B** | Dev-only — moved to `apps/bench/physics-overlay/`, gated by `__DEV__`, never reached at GA | Zero bundle impact; production unaffected |

The PROCESS-TRACKER default is **B**. Chunk 24 §24.4 also leaned toward **B**.

---

## Decision (proposed)

**Option B — dev-only.** Move `src/physics/` and the parts of `src/render/` that depend on it to `apps/bench/physics-overlay/` during sub-phase G.18 (S84). Production builds cannot reach this code (the import path lives in `apps/bench`, which is not a deployment target). The constraint-solver visualisation remains available to engineers via `pnpm --filter @pryzm/bench dev physics-overlay`.

**Rationale**: Vision D7 already excludes physics from the headless artefact. There is no operator-visible UI surface that depends on physics today, and none is planned for GA. Promoting physics to a runtime package would add cold-load weight for zero customer value.

---

## Consequences

- **Sub-phase G.18** (S84) deletes `src/physics/` after moving the visualisation tooling to `apps/bench/physics-overlay/`.
- **Sub-phase G.28** (S84) deletes `src/render/` after the same move (the parts of `src/render/` not dependent on physics are absorbed by `packages/renderer/` per Phase D).
- A future "live physics simulation" feature (e.g. for structural plug-in validation) is a NEW SPEC and a NEW package, not a resurrection of `src/physics/`.

---

## Status transitions

| Date | Status | Note |
|---|---|---|
| 2026-04-29 | Proposed | Authored as Phase A entry-gate stub (PROCESS-TRACKER §4) |
| TBD | Accepted | Founder + Architecture lead ratification |
