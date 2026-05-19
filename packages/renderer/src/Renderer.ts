// Renderer — L5 boot entry, WebGPU / WebGL2 dual-mode (S06-T1, ADR-007).
//
// Spec: `phases/PHASE-1A-Q1-M1-M3-SKELETON-RAILS.md` §S06-T1 (line 578):
//   "Renderer.init(canvas, mode) → auto-detect WebGPU vs WebGL2.
//    ADR-007 fallback path. mode: 'auto' | 'webgpu' | 'webgl2'."
//
// Design summary (see ADR-007 for the full rationale):
//   * Single boot entry: `Renderer.init(canvas, mode)`.
//   * `mode='auto'` (default) tries WebGPU first; falls back to WebGL2.
//   * `mode='webgpu'` throws `RendererInitError` if WebGPU is missing.
//   * `mode='webgl2'` skips detection entirely.
//   * Resolved mode is recorded under the OTel attribute
//     `pryzm.renderer.mode` on the `pryzm.renderer.init` span.
//
// Internally the renderer wraps THREE's WebGLRenderer (or WebGPURenderer
// in WebGPU mode).  THREE itself is firewalled to this package by the
// `pryzm-no-three-outside-committer` lint rule (see eslint.config.js
// `RENDERER_ALLOW`).  Higher layers should never import THREE — they
// see only the `Renderer` API surface.

import * as THREE from '@pryzm/renderer-three/three';
import type { FrameScheduler } from '@pryzm/frame-scheduler';
import { withSpan, withSpanSync } from './otel.js';
import { Pipeline } from './passes/Pipeline.js';
import { ClearPass } from './passes/ClearPass.js';
import { MeshPass } from './passes/MeshPass.js';
import type { RenderContext, RenderPass } from './passes/types.js';

export type RendererMode = 'auto' | 'webgpu' | 'webgl2';
export type ResolvedRendererMode = 'webgpu' | 'webgl2';

export class RendererInitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RendererInitError';
  }
}

export interface RendererInitOptions {
  /** Mode to boot in.  Defaults to `'auto'` (WebGPU → WebGL2 fallback). */
  readonly mode?: RendererMode;
  /** Override `navigator.gpu` lookup — used by tests to simulate
   *  WebGPU presence / absence without touching the real navigator. */
  readonly gpuProvider?: () => GPU | undefined;
  /** Pixel ratio cap.  Default 2 — matches PRYZM 1's `setPixelRatio(min(devicePixelRatio, 2))`. */
  readonly maxPixelRatio?: number;
  /** Clear color (hex 0xRRGGBB).  Default 0x202024 — neutral dark. */
  readonly clearColor?: number;
}

/** Public Renderer surface.  Higher layers (bootstrap, CameraController,
 *  bench harnesses) hold this object; the underlying THREE renderer is
 *  intentionally not exposed.  THREE.Scene / Camera ARE exposed because
 *  the scene-committer registry binds Object3D nodes onto the scene and
 *  the camera-controller drives the camera. */
export class Renderer {
  readonly mode: ResolvedRendererMode;
  readonly canvas: HTMLCanvasElement;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  /** Underlying THREE renderer.  Internal — DO NOT export across the
   *  package boundary.  Bench/test fixtures access via the
   *  `_internalThreeRenderer()` accessor below. */
  private readonly threeRenderer: THREE.WebGLRenderer;
  private readonly pipeline: Pipeline;
  private disposed = false;
  /** Monotonic frame counter — used as `pass.idle_frame_index` in the
   *  per-pass OTel span and as the jitter index by TRAA. */
  private frameIndex = 0;

  /** @internal — tests + bench only.  Do NOT use from app code. */
  _internalThreeRenderer(): THREE.WebGLRenderer {
    return this.threeRenderer;
  }

  constructor(
    mode: ResolvedRendererMode,
    canvas: HTMLCanvasElement,
    threeRenderer: THREE.WebGLRenderer,
    opts: RendererInitOptions,
  ) {
    this.mode = mode;
    this.canvas = canvas;
    this.threeRenderer = threeRenderer;
    this.scene = new THREE.Scene();
    // Default camera: 50° FOV, 0.1–1000 near/far, aspect from canvas.
    const aspect = canvas.width > 0 && canvas.height > 0 ? canvas.width / canvas.height : 1;
    this.camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 1000);
    this.camera.position.set(3, 3, 3);
    this.camera.lookAt(0, 0, 0);
    // Default lighting: one directional + ambient so MeshStandardMaterial
    // is not pitch-black out of the box.
    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    const directional = new THREE.DirectionalLight(0xffffff, 0.8);
    directional.position.set(5, 10, 5);
    this.scene.add(ambient, directional);
    // Pipeline: ClearPass → MeshPass.  S06-T3.
    this.pipeline = new Pipeline([
      new ClearPass(opts.clearColor ?? 0x202024),
      new MeshPass(),
    ]);
  }

  /** Canonical alias for `render()` per chunks/22 §22.3 Flow 3 stage 5
   *  ("First frame painted → `runtime.scene.renderer.frame()`").
   *  Delegates straight to `render()` — `render()` is the
   *  Three.js-convention name kept for FrameScheduler interop and
   *  back-compat with existing call sites; `frame()` is the
   *  architectural-spec name.  In a future wave `render()` becomes a
   *  deprecated alias. */
  frame(): void {
    this.render();
  }

  /** Render one frame.  Wrapped in `pryzm.frame.render` OTel span; the
   *  scheduler's `markDirty('camera')` + tick listener pump this. */
  render(): void {
    if (this.disposed) return;
    this.frameIndex++;
    withSpanSync(
      'pryzm.frame.render',
      { 'pryzm.renderer.mode': this.mode },
      (span) => {
        this.pipeline.render(this.renderContext(), 0, this.frameIndex);
        const info = this.threeRenderer.info;
        span.setAttributes({
          'pryzm.renderer.draw_calls': info.render.calls,
          'pryzm.renderer.triangles': info.render.triangles,
        });
      },
    );
  }

  /** Append a post-FX RenderPass.  Bootstrap calls this once for each
   *  of Bloom / TRAA / SSGI when the `?postfx=on` flag is present. */
  addPass(pass: RenderPass): void {
    this.pipeline.add(pass);
  }

  /** Snapshot the current RenderContext — used by IdleAccumulator
   *  bind-time (`accumulator.attachContext(renderer.renderContext())`). */
  renderContext(): RenderContext {
    const size = new THREE.Vector2();
    this.threeRenderer.getSize(size);
    return {
      renderer: this.threeRenderer,
      scene: this.scene,
      camera: this.camera,
      width: size.x,
      height: size.y,
    };
  }

  /** Bind the renderer's `render()` to a FrameScheduler tick listener.
   *  Call once during bootstrap; the returned disposer removes the
   *  binding.  S06-T7 paired-session boot wiring uses this. */
  attachTo(scheduler: FrameScheduler, listenerId = 'renderer.draw'): () => void {
    return scheduler.addTickListener(
      listenerId,
      () => this.render(),
      'render',
    );
  }

  /** Resize the canvas + camera aspect.  Call from a ResizeObserver in
   *  the host page (bootstrap wires this). */
  resize(width: number, height: number): void {
    if (this.disposed) return;
    if (width <= 0 || height <= 0) return;
    this.threeRenderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    // Cascade resize to every pass so accumulation passes can rebuild
    // their history buffers.
    this.pipeline.resize(width, height);
  }

  /** Tear down the THREE renderer + scene + pipeline.  Idempotent. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.pipeline.dispose();
    this.threeRenderer.dispose();
    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry?.dispose();
        if (Array.isArray(obj.material)) {
          for (const m of obj.material) m.dispose();
        } else {
          obj.material?.dispose();
        }
      }
    });
  }

  /** Boot path.  Promise so we can await the WebGPU adapter request.
   *  See ADR-007 for the resolution table. */
  static async init(
    canvas: HTMLCanvasElement,
    opts: RendererInitOptions = {},
  ): Promise<Renderer> {
    const requestedMode: RendererMode = opts.mode ?? 'auto';
    return withSpan(
      'pryzm.renderer.init',
      { 'pryzm.renderer.mode_requested': requestedMode },
      async (span) => {
        const resolved = await resolveMode(requestedMode, opts.gpuProvider);
        const three = createThreeRenderer(canvas, resolved, opts);
        span.setAttributes({ 'pryzm.renderer.mode': resolved });
        return new Renderer(resolved, canvas, three, opts);
      },
    );
  }
}

async function resolveMode(
  requested: RendererMode,
  gpuProvider?: () => GPU | undefined,
): Promise<ResolvedRendererMode> {
  if (requested === 'webgl2') return 'webgl2';
  const gpu = gpuProvider ? gpuProvider() : getNavigatorGpu();
  if (gpu === undefined) {
    if (requested === 'webgpu') {
      throw new RendererInitError(
        '[Renderer] mode="webgpu" requested but navigator.gpu is unavailable on this client.',
      );
    }
    // 'auto' falls back.
    return 'webgl2';
  }
  // Try to actually request an adapter — `navigator.gpu` may exist but
  // adapter request can return null on machines without a compatible GPU.
  try {
    const adapter = await gpu.requestAdapter();
    if (adapter === null) {
      if (requested === 'webgpu') {
        throw new RendererInitError(
          '[Renderer] mode="webgpu" requested but no compatible GPU adapter was returned.',
        );
      }
      return 'webgl2';
    }
    return 'webgpu';
  } catch (err) {
    if (requested === 'webgpu') {
      throw new RendererInitError(
        `[Renderer] mode="webgpu" requested but adapter request failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
    return 'webgl2';
  }
}

function getNavigatorGpu(): GPU | undefined {
  if (typeof navigator === 'undefined') return undefined;
  // The WebGPU types put `gpu` on Navigator.  Cast carefully — Node
  // navigators don't have it.
  return (navigator as Navigator & { gpu?: GPU }).gpu;
}

function createThreeRenderer(
  canvas: HTMLCanvasElement,
  mode: ResolvedRendererMode,
  opts: RendererInitOptions,
): THREE.WebGLRenderer {
  // For 1A both modes route through THREE.WebGLRenderer — the WebGPU
  // path uses THREE's WebGPURenderer in a follow-up if/when THREE r170+
  // is in deps, but for 1A we keep a single render code path so the
  // visual-diff parity gate has only the *context* differing, not the
  // pipeline shape.  ADR-007 calls out this 1A simplification.
  //
  // We DO ask for the right context type so `renderer.info.programs`
  // attributes the work correctly and so a WebGL1-only browser fails
  // fast at boot rather than producing a half-broken scene.
  const contextType = mode === 'webgl2' ? 'webgl2' : 'webgl2';
  const context = canvas.getContext(contextType) as WebGL2RenderingContext | null;
  if (context === null) {
    throw new RendererInitError(
      `[Renderer] canvas.getContext('${contextType}') returned null — is the canvas already locked to a different context?`,
    );
  }
  const renderer = new THREE.WebGLRenderer({
    canvas,
    context,
    antialias: true,
    powerPreference: 'high-performance',
  });
  const ratio =
    typeof window !== 'undefined' && window.devicePixelRatio
      ? Math.min(window.devicePixelRatio, opts.maxPixelRatio ?? 2)
      : 1;
  renderer.setPixelRatio(ratio);
  if (canvas.width > 0 && canvas.height > 0) {
    renderer.setSize(canvas.width, canvas.height, false);
  }
  renderer.setClearColor(opts.clearColor ?? 0x202024, 1);
  return renderer;
}
