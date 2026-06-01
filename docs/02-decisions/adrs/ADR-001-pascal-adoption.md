# ADR-001 — Pascal Adoption Strategy

| Field | Value |
|---|---|
| Status | **Accepted** — 2026-04-27 |
| Closes | `05-IMPLEMENTATION-PLAN.md §17` row ADR-001 |
| Required by | Sprint S01 (Phase 1A start — repo scaffolding) |
| Owner | Architecture lead |
| Implementation | Pattern adoption in `packages/geometry-kernel/`, `packages/scene-committer/`, `apps/editor/`. No code copied verbatim. |
| Spec dependency | `03-PASCAL-EDITOR-ANALYSIS.md`, `08-VISION §3` |

---

## Context

Pascal Editor is the prior-art reference architecture. It is well-understood internally and ships proven patterns for: layered geometry kernel separation, scene-committer indirection, plugin host scaffolding, and L4↔L5 boundaries.

The corpus presented four options (`05-IMPLEMENTATION-PLAN.md §17`):

- **A** — Hard fork of Pascal; rebrand and rewrite incrementally.
- **B** — Adopt patterns and rule matrix; re-author code under PRYZM 2's package layout.
- **C** — Viewer-only adoption (use Pascal as a read-only frame).
- **D** — None (start from a blank repo with no Pascal influence).

`08-VISION` mandates a clean re-architecture with the L0–L7 layer model, OTel-first observability, and CRDT collaboration — none of which Pascal carries today. A fork (A) inherits structural debt; option D (none) discards proven patterns gratuitously.

---

## Decision

**Adopt Option B — patterns + rules, no fork.**

- The PRYZM 2 monorepo is **green-field**: a fresh `packages/` and `apps/` layout per `08-VISION §4`.
- Pascal's L4 / L5 / L6 layer separation, scene-committer indirection, and plugin manifest patterns are adopted as reference designs.
- Pascal's rule matrices (Visibility-Intent Contract 12; Element Types Contract 17; transform/snap heuristics) are adopted **verbatim as data**, not as code: the rule tables ship as JSON / TypeScript constants in PRYZM 2 packages, free of the Pascal runtime.
- No Pascal source files are copy-pasted. Every PRYZM 2 file is authored fresh, with its own tests, OTel spans (P8), and forbidden-deps lint (P1).
- License-clean: PRYZM 2 has its own MIT license header on every file from S01.

### What is reused from Pascal
- The **layer model** (L4 pure kernel; L5 committer; L6 plugin host).
- The **rule matrix** for visibility intent (Contract 12).
- The **type/material schema shape** (Contract 17), expanded per ADR-017.
- The **snap priority table** (kernel-resident; SPEC-01 §5).
- The **command / event vocabulary** (verb-noun naming, ULID-keyed payloads).

### What is explicitly not carried over
- THREE.js coupling in former L4 modules — PRYZM 2's L4 is THREE-free (P1).
- Centralised per-frame cache invalidation patterns — replaced by L1 store subscriptions and chunk-level bake (ADR-010).
- The Pascal renderer pipeline — replaced by ADR-006 (WebGPU-when-available, WebGL2 fallback).
- Pascal's persistence model — replaced by event-log + R2 chunks (SPEC-02, ADR-013).

---

## Consequences

**Positive:**
- Avoids 3+ months of carrying Pascal's runtime debt into the new codebase.
- Every PRYZM 2 file is auditable for license, P1 (boundary lint), and OTel spans from S01.
- The team can re-test rules in their new architectural context; bugs latent in Pascal don't silently migrate.
- Public API and file format are decoupled from Pascal naming.

**Negative:**
- Re-implementation cost: every accepted Pascal pattern must be re-authored.
- Risk of pattern drift: re-authored code may diverge from the intent of the original pattern; mitigated by code review against `03-PASCAL-EDITOR-ANALYSIS.md`.
- Slower start than A; estimated +4 weeks across Phase 1A vs a fork.

---

## Alternatives considered

### A — Hard fork
- Rejected: inherits THREE coupling in L4; inherits non-CRDT persistence; license/repo provenance is murkier; rebuilding tests against the new layer model approaches a re-write anyway.

### C — Viewer-only adoption
- Rejected: PRYZM 2 is the editor; "viewer-only Pascal" is a non-goal.

### D — No Pascal influence
- Rejected: discards rule matrices that took years to harden (visibility intent, snap priorities). The corpus is explicit that those *survive* (`08-VISION §3` P9; CONFLICT-ANALYSIS.md §3.10).

---

## Phase rollout
- S01 — repo scaffolded with `packages/` + `apps/` per `08-VISION §4`. License headers in place. Pascal serves as reference doc only; no Pascal code in the repo.
- S03 — Visibility-Intent rules ported as TS constants under `packages/visibility-rules/`.
- S07 — Snap priority table ported as TS constant under `packages/geometry-kernel/`.
- S11 — Type/material schema (per ADR-017) lands; supersedes Contract 17.
- M12 (S22) — Pascal reference repo formally archived as historical; no further pattern lifts after this point.
