# ADR-015 — Visibility-Intent Layer Placement

| Field | Value |
|---|---|
| Status | **Accepted** — 2026-04-27 |
| Closes | `CONFLICT-ANALYSIS.md §3.10`, §6.5 |
| Required by | Sprint S29 (Phase 2B start — plan-view rebuild) |
| Owner | Architecture lead |
| Spec dependency | `specs/SPEC-04-DRAWING-ENGINE.md` |
| Source rules | `00_Contracts/12-VISIBILITY-INTENT-SYSTEM-CONTRACT.md` (the rule matrix preserved) |

---

## Context

Contract 12 defines the Cut/Beyond/Hidden/Projection rule matrix and the override-layer precedence. `09-AS-IS §L7` line 121 says "Preserved verbatim — refactored into smaller classes but logic untouched."

But: today's algorithm touches THREE materials, scene flags, and `userData` — concerns that under NEW_ARCH must be split across L4 (kernel), L5 (renderer), and L7 (presentation). The algorithm cannot be both "preserved verbatim" *and* moved into the pure kernel.

---

## Decision

Split Contract 12's rules across four layers with single-responsibility ownership:

| Concern | Layer | Package |
|---|---|---|
| **Cut/Beyond classification** (pure geometry math: which edges are cut by view plane, which are behind, which are hidden by occlusion) | L4 | `packages/geometry-kernel/visibility/classifier.ts` |
| **Style resolution** (Cut linework width, hatch pattern, Hidden-line dash, override precedence) | L1 data + L4 evaluation | `packages/stores/StyleStore.ts` (data) + `packages/geometry-kernel/visibility/style-resolver.ts` (evaluation) |
| **Material swap / edge style application** (turn the resolved style into a draw call) | L5 | `plugins/<elem>/committer.ts` reads resolved style from cache |
| **Per-pass dirty flags** (when does a view need re-classification?) | L5 | `packages/renderer/dirty-flags.ts` |

The rule matrix from Contract 12 is **preserved verbatim** as the *what*; the *where* is the four-way split above.

---

## Consequences

**Positive:**
- Each piece runs in the right layer, lint-checkable.
- Classification and style resolution are pure → testable + cacheable + portable to bake worker.
- The committer has zero classification logic; it reads pre-classified primitives.

**Negative:**
- The original "all-in-one" algorithm has to be cut into four. Refactor cost ≈ 6 sprint-weeks across S29–S33.
- The cache must be invalidated on view definition change AND on element analytic change AND on style override change — three triggers.

---

## Alternatives considered

### A1 — Keep Contract 12's algorithm whole inside the renderer
Rejected: violates P1 (kernel pure) and prevents headless / bake-worker visibility computation.

### A2 — Move the entire algorithm into the kernel (including style application)
Rejected: style application requires THREE materials (committer's job).

### A3 — Move classification to L3 (sync) so it's shared across clients
Rejected: classification is per-view (camera-dependent), client-local.

---

## Phase rollout
- S29 — classifier scaffolded in `packages/geometry-kernel/visibility/`.
- S30 — style resolver; style store populated from view templates (SPEC-04 §5).
- S31 — committers updated to read pre-classified primitives.
- S32 — dirty-flag wire-up in renderer.
- S33 — visual regression locks the verbatim rule matrix output (SPEC-11 §6.3).
