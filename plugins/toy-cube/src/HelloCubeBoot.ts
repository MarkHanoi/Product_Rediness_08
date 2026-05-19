// HelloCubeBoot — wires the full PRYZM 2 stack end-to-end for the
// `?pryzm2=1` URL flag entry point (S06-T7, K1A-4 kill-switch boot).
//
// Pipeline exercised:
//   bootstrapRender({ canvas, audit, committers: [CubeCommitter], handlers: [MoveCubeCommand] })
//     → bootstrap()                    (L1 stores + L2 bus + L5 host)
//     → Renderer.init(canvas, mode)    (ADR-007 dual-mode)
//     → CameraController bound to canvas
//     → renderer.attachTo(scheduler)   (rAF-driven render pump)
//   then: bus.executeCommand('cube.move', …) ×3
//     → PatchEmitter → CubeStore → bindStore dispatcher
//     → CommitterHost.commit → CubeCommitter.onAdd
//     → SceneRegistry → renderer.scene reconcile
//     → first frame paints three cubes.
//
// This file lives in `plugins/toy-cube/src/` (NOT `apps/editor/`) so
// it can co-locate with the CubeCommitter that imports THREE — only
// the L5 committer surface and `plugins/<name>/src/committer.ts` may
// import `three` per the `pryzm/no-three-outside-committer` rule.
// HelloCubeBoot itself does NOT import THREE; it only references the
// committer class.

import {
  bootstrapRender,
  type RenderRuntime,
} from '@pryzm/editor';
import type { AuditDefaults } from '@pryzm/plugin-sdk';
import type { RendererMode } from '@pryzm/plugin-sdk';
import { CubeCommitter } from './committer.js';
import { MoveCubeCommand } from './MoveCubeCommand.js';

export interface HelloCubeBootOptions {
  readonly canvas: HTMLCanvasElement;
  /** Forwarded verbatim to `bootstrapRender({ audit })` and ultimately to
   *  the bus's audit-defaults slot.  `timestamp` is bus-generated per
   *  command (see `AuditDefaults` in `@pryzm/command-bus`), so callers
   *  MUST NOT include it here. */
  readonly audit: AuditDefaults;
  readonly mode?: RendererMode;
}

export async function bootHelloCube(
  opts: HelloCubeBootOptions,
): Promise<RenderRuntime> {
  const runtime = await bootstrapRender({
    canvas: opts.canvas,
    audit: opts.audit,
    mode: opts.mode ?? 'auto',
    committers: [new CubeCommitter()],
    handlers: [new MoveCubeCommand() as never],
  });

  // Pull the camera back so the three cubes sit comfortably in view.
  runtime.renderer.camera.position.set(6, 5, 8);
  runtime.renderer.camera.lookAt(0, 0, 0);
  runtime.scheduler.markDirty('camera');

  // Drop three cubes in a line so the demo isn't a single dot.
  await runtime.data.bus.executeCommand('cube.move', {
    id: 'cube-1',
    dx: -2,
    dy: 0,
    dz: 0,
  });
  await runtime.data.bus.executeCommand('cube.move', {
    id: 'cube-2',
    dx: 0,
    dy: 0,
    dz: 0,
  });
  await runtime.data.bus.executeCommand('cube.move', {
    id: 'cube-3',
    dx: 2,
    dy: 0,
    dz: 0,
  });

  return runtime;
}
