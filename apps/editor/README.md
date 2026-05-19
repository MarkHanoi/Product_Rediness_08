# `@pryzm/editor`

L7 — the boot binary.  The browser's entry into the PRYZM 2 stack.

## Two boot halves

| File | Half | Wires |
|---|---|---|
| `src/bootstrap.ts` | **Data** (S05-T8) | `EventBus` → committers → stores; returns `EditorRuntime` |
| `src/bootstrap.render.ts` | **Render** (S06-T7) | `FrameScheduler` + `Renderer` + `CameraController`; returns `RenderRuntime` |

`bootstrap()` is the smaller surface (no canvas needed, no rAF) — used
by every test fixture.  `bootstrapRender({ canvas })` calls
`bootstrap()` first, then plugs the render half on top.

## URL-flag dispatch

The PRYZM 1 entry point in `src/main.ts` (legacy app) inspects
`location.search`; on `?pryzm2=1` it dynamic-imports
`@pryzm/editor` and calls `bootstrapRender({ canvas, mode })` —
where `mode` comes from `&mode=webgpu` / `&mode=webgl2` (default
`'auto'`).  No `?pryzm1=` flag exists; absence of `?pryzm2` means the
legacy app boots.

## Render-frame ordering

`bootstrapRender` registers two scheduler tick listeners:

1. `'pre-render'` — scene reconciler walks `host.registry` and
   adds/removes `Object3D`s on `renderer.scene`.
2. `'render'` — `renderer.render()` (installed by `attachTo()`).

This guarantees committer-emitted Object3D additions land in the THREE
scene **before** `MeshPass` walks it on the same tick — no one-frame lag.

## Tests

```sh
npm test --workspace=@pryzm/editor
```

* `__tests__/bootstrap.test.ts` — data-half smoke (S05).
* `__tests__/dual-mode-parity.test.ts` — renderer-mode contract (S06-T9).

The pixel-level visual diff lives in `apps/bench/scripts/visual-diff.mjs`
and is gated by per-mode reference PNGs in
`__tests__/visual-fixtures/` — see that directory's README.

## Snapshot capture

`scripts/snapshot-cube.mjs` re-captures the per-mode reference PNGs.
**Requires a real GPU**; the Replit / many CI sandboxes have none.
