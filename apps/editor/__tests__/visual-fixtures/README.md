# Visual fixtures (S06-T8 / S06-T9)

Per-mode reference PNGs for the Hello-Cube scene, captured by
`apps/editor/scripts/snapshot-cube.mjs` in headed Chromium.

## Layout

```
visual-fixtures/
  hello-cube.webgpu.png      # Reference render in WebGPU mode
  hello-cube.webgl2.png      # Reference render in WebGL2 mode
  hello-cube.diff.png        # Most-recent diff (if any) — gitignored
```

## CI gate

`apps/bench/scripts/visual-diff.mjs` re-renders both modes and runs
`pixelmatch` against the reference PNGs.  **The gate hard-fails when
> 2 px differ** between the WebGPU and WebGL2 outputs (S06 exit
criteria, line 666).

## Updating fixtures

1. Run `npm run snapshot:cube --workspace @pryzm/editor` on a host with
   a discrete GPU.
2. Visually inspect both PNGs.
3. Commit them.  The diff PNG is gitignored.

## Why no PNGs in the initial commit

Headless WebGPU is not available in the Replit / CI sandbox.  The
reference PNGs land when the WebGPU pipeline first lights up on a real
GPU (Sub-phase 1B, post-K1A-3 mitigation).  Until then, the harness
runs in **shape-validation-only** mode (see `visual-diff.mjs`
`--no-fixtures` flag).
