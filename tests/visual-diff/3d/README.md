# Visual-diff corpus — 3D (W-10)

24 spec files (12 element families × 2 viewing angles) closing W-10 in
`PHASE-1-CLOSE-IMPLEMENTATION-PLAN-2026-04-28.md`.

## Layout

```
3d/
  harness.ts           # Pure recording stub (no THREE / no DOM).
  README.md            # This file.
  vitest.config.ts     # Local test runner config + snapshot dir.
  <family>-<angle>.spec.ts × 24
  __snapshots__/       # Generated; one snapshot per spec (auto-created).
```

## Element families

`wall, floor, roof, column, beam, door, window, stair, ceiling,
curtain-wall, ramp, railing` — matches the W-12 parity matrix
(`docs/03_PRYZM3/archive/superseded-audits/PHASE-1-PARITY-TEST-MATRIX.md`).

## Viewing angles

* `front` — orthographic-ish elevation looking down +Z toward the
  origin.  Dimensions in X / Y dominate.
* `iso`   — true isometric (8, 8, 8) → origin.  Exposes Z-axis
  bugs invisible to the front camera.

## Why a recording stub instead of a renderer?

ADR-0030 (post-2B closeout) ratifies the recording-canvas pattern as
the single source of truth for visual-diff testing.  The 3D corpus
follows the same rule: snapshot the deterministic scene description
the SceneCommitter would hand to THREE, never the rasterised output.
This keeps the tests fast (sub-millisecond), portable (no GPU / no
DOM), and free of float-equality flake.
