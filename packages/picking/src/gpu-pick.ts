// GpuPickStrategy — single-frame pick texture (S16-T1, ADR-0015 §"Strategy A").
//
// Design (matches spec line 715-730):
//   1. Maintain a parallel `pickScene` mirroring every pickable
//      registry element as a clone Mesh with a cached MeshBasicMaterial
//      whose colour = `encodeIndexToRGBA(slotIndex)`.  Clones share
//      geometry references with the originals — no buffer duplication.
//   2. On `pick(point)`:
//      a. sync pickScene with current registry ids (add new clones,
//         remove gone ones, update transforms),
//      b. ask the injected renderer to draw pickScene into a 1×1
//         render target centred on `point`,
//      c. read the pixel back, decode → slotIndex → ElementId.
//   3. `pickRect(rect)` widens (b) to an N×N target and decodes every
//      unique slot in the buffer.
//
// Why a parallel scene instead of an override material:
//   * A `THREE.Material` override applies the SAME material to every
//     mesh, which loses the per-id colour we need.  An override
//     ShaderMaterial COULD read a per-mesh attribute, but that costs
//     a custom shader compile path that's hard to fake in unit tests.
//   * Cloning is cheap (geometry is shared) and the FakeGpuPickRenderer
//     used in tests just verifies which scene + camera + target were
//     passed and returns a preset pixel buffer.
//
// Probe (CRITICAL-2 fix — render-and-readback validation):
//   Renders a known colour (encodeIndexToRGBA(1) = [0,0,1,255]) into a
//   fresh 1×1 RT via a unit PlaneGeometry + OrthographicCamera, then
//   reads the pixel back and verifies decodeRGBAToIndex() === 1.
//   A healthy driver round-trips to 1; the R1C-02 Mesa silent-zero bug
//   returns [0,0,0,0] → decodes to 0 → probe fails → BVH fallback.
//   This replaces the prior no-op probe that only checked for API throws.
//
// Slot free-list (HIGH-7 fix):
//   `_freeSlots` holds slot indices freed when elements are removed.
//   `_allocateSlot()` pops from _freeSlots first, falling back to the
//   monotonic `nextSlot` counter only when the free list is empty.
//   This bounds the slot-index space by the live element count, not the
//   cumulative create-delete count, preventing 2²⁴ exhaustion in
//   long-running sessions with many element create/delete cycles.
//
// ADR-046 §"Pick resolution" — InstancedMesh coalescing (Task 4.1):
//   After `InstancedMeshCoalescer.coalesce()` runs, source per-wall
//   InstancedMeshes are *hidden* (visible=false) but remain in their
//   wall Group under the ElementRegistry.  `syncPickScene` detects
//   InstancedMesh children and creates per-instance pick clones in
//   world space so every panel has the correct elementId pick colour,
//   even when its InstancedMesh is hidden and a merged IM handles
//   the visible render.
//
// Task 2.4 — GPU pick depth readback (R10 · C04 §3):
//   A second render pass (DEPTH_PACK_MATERIAL override) writes each
//   fragment's gl_FragCoord.z packed into RGBA bytes via THREE's
//   `packDepthToRGBA` GLSL function.  The same `readPixels` path reads
//   the depth target; `unpackRGBAToDepth` reconstructs the NDC depth;
//   `ndcToWorldPos` + Vector3.distanceTo gives the world-space distance.
//   Falls back gracefully to distance=0 on any failure (missing renderer,
//   all-zero depth pixel, or exception in the depth pass).  No changes
//   to the GpuPickRenderer interface are needed — renderToTarget +
//   readPixels already cover the depth path.

import * as THREE from '@pryzm/renderer-three/three';
import { withSpanSync } from './otel.js';
import {
  type ElementId,
  type ElementRegistry,
  type GpuPickRenderer,
  type PickContext,
  type PickOptions,
  type PickProbeResult,
  type PickResult,
  type PickStrategy,
  type Point2D,
  type Point3D,
  type Rect2D,
  decodeRGBAToIndex,
  encodeIndexToRGBA,
} from './types.js';

// ---------------------------------------------------------------------------
// Depth-encoding material (Task 2.4)
// ---------------------------------------------------------------------------
//
// Module-level singleton — immutable after module init.  Shared across all
// GpuPickStrategy instances; safe because ShaderMaterials hold no mutable GPU
// state that is instance-specific (state lives in the WebGLProgram cache, not
// the material object).
//
// Uses THREE's built-in 'packing' GLSL chunk so we can read depth back via
// the existing `readRenderTargetPixels` path (Uint8Array, RGBA8 format).
// The #include directive is processed by THREE's WebGLProgram preprocessor
// at shader-compile time; in unit tests it is never compiled (fake renderer).
const DEPTH_PACK_MATERIAL = new THREE.ShaderMaterial({
  vertexShader: /* glsl */ `
    void main() {
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    #include <packing>
    void main() {
      gl_FragColor = packDepthToRGBA(gl_FragCoord.z);
    }
  `,
});

export interface GpuPickOptions {
  /** Target dimensions for the pick render target.  Default 256×256.
   *  Larger = more pickRect resolution; smaller = cheaper readback. */
  readonly targetWidth?: number;
  readonly targetHeight?: number;
}

interface PickEntry {
  readonly slotIndex: number;
  /**
   * Primary pick clone.  For simple Mesh elements this is a `THREE.Mesh`.
   * For elements whose geometry is delivered via InstancedMesh (e.g. coalesced
   * curtain-wall panels), this is a `THREE.InstancedMesh` with per-instance
   * world-space matrices and the pick colour baked in via instanceColor.
   */
  readonly clone: THREE.Mesh;
  readonly material: THREE.MeshBasicMaterial;
  /**
   * ADR-046: When the source Object3D contains InstancedMesh children (hidden
   * after coalescing), `additionalClones` holds one per extra InstancedMesh so
   * every panel in the wall is reachable by the pick ray.
   */
  readonly additionalClones: THREE.Object3D[];
  /**
   * §SELECT-INSTANCED-PICK (FIX #4) — the source element's `userData.version` at
   * the time this entry was built. Builders bump `userData.version` on EVERY
   * geometry rebuild. When a rapid hover+click straddles a rebuild that swaps the
   * element's InstancedMesh children WITHOUT changing their count (e.g. a
   * curtain-wall panel rebuild keeping the panel count), the count-based
   * reconciliation alone cannot tell the clones are stale. A generation mismatch
   * forces a FULL rebuild of the entry, so no clone is left pointing at orphaned
   * geometry. `undefined` = element carries no version (never invalidates on gen).
   */
  generation: number | undefined;
}

/**
 * §SELECT-INSTANCED-PICK (FIX #1) — a registry entry for an
 * InstancedElementRenderer group (userData.isInstancedGroup === true).
 *
 * Unlike a coalesced curtain-wall (where ONE InstancedMesh = ONE element), an
 * instanced GROUP hosts MANY distinct BIM elements, one per occupied instance
 * slot.  The pick must therefore paint a DISTINCT pick colour PER INSTANCE so
 * the readback resolves the per-INSTANCE element id — never the synthetic group
 * id.  The clone is a single pick-coloured InstancedMesh whose `instanceColor`
 * encodes each instance's allocated pick slot; `pickSlotByInstance` records the
 * pick slot allocated for each source instance slot so they can be freed and
 * the indexToId map kept consistent on rebuild/removal.
 */
interface InstancedGroupPickEntry {
  /** This entry hosts an InstancedElementRenderer group — distinct render path. */
  readonly kind: 'instanced-group';
  /** The pick-coloured InstancedMesh clone in world space. */
  readonly clone: THREE.InstancedMesh;
  /** White material (instanceColor passes through 1:1). */
  readonly material: THREE.MeshBasicMaterial;
  /** sourceInstanceSlot → allocated pick slot.  Used for free-list + indexToId upkeep. */
  readonly pickSlotByInstance: Map<number, number>;
  /**
   * Stable signature of the (sourceSlot → elementId) membership at build time.
   * When the next sync sees the SAME signature, only the per-instance world
   * matrices are refreshed — the allocated pick slots + colours are kept stable
   * (so a hover→click pair resolves the same element). Only a membership CHANGE
   * triggers a full dispose + rebuild.
   */
  membershipSig: string;
}

export class GpuPickStrategy implements PickStrategy {
  readonly id = 'gpu-pick' as const;
  available = true;

  /**
   * Pick-target dimensions.  MUTABLE: when the strategy auto-sizes (no explicit
   * opts — the production path), these track the live viewport so the pick is
   * 1:1 with what the user sees.  FIXED when the caller passes
   * targetWidth/targetHeight (unit tests), preserving their exact-pixel
   * expectations.
   */
  private targetWidth: number;
  private targetHeight: number;

  /** True when no explicit target size was supplied → match the viewport. */
  private readonly _autoSize: boolean;

  /**
   * §SELECT-3D-FORGIVING — cursor search tolerance in CSS px when auto-sized.
   * Converted to target px in pickInternal so it stays constant regardless of
   * the auto-sized resolution.  Mirrors the few-px "magnetic" pick tolerance of
   * Revit / SketchUp / pascalorg/editor.
   */
  private static readonly SCREEN_SEARCH_RADIUS_PX = 8;

  /**
   * §SELECT-PICK-RESOLUTION — fallback hard cap on either auto-sized target axis,
   * used ONLY when the renderer doesn't report `maxTextureSize`.  4096 is the
   * WebGL2 guaranteed-minimum MAX_TEXTURE_SIZE, so it is always safe to allocate.
   * The PRODUCTION cap is the GPU's real `maxTextureSize` (typically 8192–16384),
   * passed in via ctx.renderer.maxTextureSize — NOT this constant, and NOT the
   * old fixed 1280 that downscaled a 1910-wide viewport to 0.67× and made thin
   * elements (columns, railings) unhittable.
   */
  private static readonly FALLBACK_MAX_DIM = 4096;

  private readonly pickScene = new THREE.Scene();
  private readonly entries = new Map<ElementId, PickEntry>();
  /**
   * §SELECT-INSTANCED-PICK (FIX #1) — registry-id → instanced-group entry.
   * Keyed by the group's SYNTHETIC userData.id; the per-instance element ids it
   * resolves live in `indexToId` exactly like any other element.
   */
  private readonly instancedGroupEntries = new Map<ElementId, InstancedGroupPickEntry>();
  private readonly indexToId = new Map<number, ElementId>();
  private nextSlot = 1; // slot 0 reserved for "no hit"

  // HIGH-7: Free-list — slot indices returned by syncPickScene on element
  // removal.  _allocateSlot() pops from here first; only when the list is
  // empty does it increment nextSlot.  Keeps the slot-index space bounded
  // by the live element count rather than the cumulative create-delete count,
  // preventing 2²⁴ = 16 M exhaustion in long-lived AI batch sessions.
  private readonly _freeSlots: number[] = [];

  // ID render target (RGBA8 — slot colour per element).
  private renderTarget: THREE.WebGLRenderTarget | null = null;
  private pixelBuffer: Uint8Array = new Uint8Array(4);

  // Depth render target (Task 2.4 — same format/size; DEPTH_PACK_MATERIAL
  // writes gl_FragCoord.z packed into RGBA so we can read via readPixels).
  private depthTarget: THREE.WebGLRenderTarget | null = null;
  private depthPixelBuffer: Uint8Array = new Uint8Array(4);

  // D1: Registry content hash — tracks the sorted, joined set of element IDs
  // that were present the last time syncPickScene ran.  When the hash matches
  // the incoming registry AND the entries map is non-empty, the element set is
  // stable: no clones need to be created or disposed, so the remove-old pass
  // is skipped entirely.  Transform copies still run every call (elements may
  // have moved since the last pick).
  private _lastRegistrySig = '';

  constructor(opts: GpuPickOptions = {}) {
    // Auto-size only when NEITHER dimension is supplied.  Production
    // (resolvePickStrategy → new GpuPickStrategy({})) auto-sizes to the
    // viewport; unit tests pass explicit dims and keep a fixed target.
    this._autoSize = opts.targetWidth === undefined && opts.targetHeight === undefined;
    this.targetWidth = Math.max(1, opts.targetWidth ?? 256);
    this.targetHeight = Math.max(1, opts.targetHeight ?? 256);
  }

  probeAvailability(ctx: PickContext): PickProbeResult {
    if (!ctx.renderer) return { ok: false, reason: 'no GpuPickRenderer in context' };
    if (!ctx.scene) return { ok: false, reason: 'no scene in context' };

    // CRITICAL-2 fix: render-and-readback validation.
    //
    // The previous implementation only called createRenderTarget + readPixels
    // without first rendering, which cannot detect the R1C-02 Mesa driver bug
    // where readPixels silently returns all-zero bytes after every render —
    // causing every pick to return "no hit" with no error or warning.
    //
    // This probe:
    //   1. Allocates a 1×1 RGBA8 render target.
    //   2. Renders a 2×2 PlaneGeometry filled with encodeIndexToRGBA(1) colour
    //      ([0,0,1,255] — slot 1) into it through a minimal OrthographicCamera.
    //      The plane fully covers the 1×1 RT so the entire pixel is occupied.
    //   3. Reads back the pixel and verifies decodeRGBAToIndex(r,g,b,a) === 1.
    //
    // Results:
    //   Healthy driver → readback [0,0,1,255] → decode 1 → ok:true.
    //   R1C-02 Mesa bug → readback [0,0,0,0] → decode 0 → ok:false.
    //   Any other driver error → exception → ok:false with the error message.
    //
    // The probe exercises the full encode→render→readback→decode pipeline,
    // not just the API surface.  Cost: one 1×1 render + one readPixels call.

    const [pr, pg, pb] = encodeIndexToRGBA(1); // [0, 0, 1] — slot 1

    // Probe objects — disposed immediately after readback.
    const probeGeo = new THREE.PlaneGeometry(2, 2);
    const probeMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(pr / 255, pg / 255, pb / 255),
    });
    const probeMesh = new THREE.Mesh(probeGeo, probeMat);
    probeMesh.matrixAutoUpdate = false;
    probeMesh.matrix.identity();
    probeMesh.matrixWorld.identity();
    const probeScene = new THREE.Scene();
    probeScene.add(probeMesh);

    // Orthographic camera — 2×2 CSS-unit frustum, 0.1…10 depth.
    // The 2×2 plane at z=0 fully covers the [-1,1]×[-1,1] view.
    const probeCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
    probeCam.position.set(0, 0, 1);
    probeCam.lookAt(0, 0, 0);
    probeCam.updateMatrixWorld(true);

    try {
      const rt     = ctx.renderer.createRenderTarget(1, 1);
      const buf    = new Uint8Array(4);
      ctx.renderer.renderToTarget(probeScene, probeCam, rt, null);
      ctx.renderer.readPixels(rt, 0, 0, 1, 1, buf);

      const decoded = decodeRGBAToIndex(buf[0] ?? 0, buf[1] ?? 0, buf[2] ?? 0, buf[3] ?? 0);
      if (decoded !== 1) {
        const got = `[${buf[0]},${buf[1]},${buf[2]},${buf[3]}]`;
        return {
          ok: false,
          reason: decoded === 0
            ? `R1C-02: readPixels returned all-zero after render (Mesa silent readback bug) — got ${got}`
            : `probe pixel mismatch: expected slot=1 [${pr},${pg},${pb},255], got ${got}`,
        };
      }
      return { ok: true };
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      return {
        ok: false,
        reason: e.message,
        error: e,
      };
    } finally {
      // Always dispose probe resources, whether the probe succeeded or failed.
      probeGeo.dispose();
      probeMat.dispose();
    }
  }

  pick(screenPoint: Point2D, ctx: PickContext, opts?: PickOptions): PickResult | null {
    return withSpanSync(
      'pryzm.picking.pick',
      {
        strategy: this.id,
        'screen.x': screenPoint.x,
        'screen.y': screenPoint.y,
      },
      (span) => {
        const t0 = performance.now();
        const result = this.pickInternal(screenPoint, ctx, opts);
        const dur = performance.now() - t0;
        span.setAttribute('result.found', result !== null);
        if (result !== null) span.setAttribute('result.elementKind', result.elementKind);
        span.setAttribute('duration_ms', Number(dur.toFixed(3)));
        return result;
      },
    );
  }

  pickRect(screenRect: Rect2D, ctx: PickContext): readonly PickResult[] {
    return withSpanSync(
      'pryzm.picking.pickRect',
      {
        strategy: this.id,
        'rect.x': screenRect.x,
        'rect.y': screenRect.y,
        'rect.w': screenRect.w,
        'rect.h': screenRect.h,
      },
      (span) => {
        const t0 = performance.now();
        const results = this.pickRectInternal(screenRect, ctx);
        const dur = performance.now() - t0;
        span.setAttribute('result.count', results.length);
        span.setAttribute('duration_ms', Number(dur.toFixed(3)));
        return results;
      },
    );
  }

  dispose(): void {
    for (const [, entry] of this.entries) {
      entry.material.dispose();
      for (const c of entry.additionalClones) {
        this.pickScene.remove(c);
      }
    }
    // §SELECT-INSTANCED-PICK (FIX #1) — tear down instanced-group pick clones.
    for (const [, entry] of this.instancedGroupEntries) {
      this.pickScene.remove(entry.clone);
      entry.material.dispose();
    }
    this.instancedGroupEntries.clear();
    this.entries.clear();
    this.indexToId.clear();
    this.renderTarget = null;
    this.depthTarget = null;
    this.pickScene.clear();
    this.nextSlot = 1;
    // HIGH-7: clear the free-list on full teardown; nextSlot resets to 1
    // so all slot IDs restart from scratch on the next session.
    this._freeSlots.length = 0;
    this._lastRegistrySig = '';
  }

  // ---- private --------------------------------------------------------

  /**
   * HIGH-7: Allocate a pick slot index, reusing freed slots before
   * incrementing the monotonic counter.  O(1) amortised.
   *
   * Freed slots are pushed to `_freeSlots` in `syncPickScene`'s removal
   * pass.  On `dispose()` both `nextSlot` and `_freeSlots` are reset, so
   * the slot space is always bounded by the current live element count.
   */
  private _allocateSlot(): number {
    return this._freeSlots.length > 0 ? this._freeSlots.pop()! : this.nextSlot++;
  }

  private pickInternal(point: Point2D, ctx: PickContext, opts?: PickOptions): PickResult | null {
    if (!ctx.renderer || !ctx.scene) return null;
    this._syncTargetSize(ctx);
    this.syncPickScene(ctx.elementRegistry);
    const rt = this.ensureRenderTarget(ctx.renderer);

    ctx.renderer.renderToTarget(this.pickScene, ctx.camera, rt, null);

    // Map screen point into the RT (centre pixel).
    //
    // COORDINATE CONVENTION: CSS y=0 is at the TOP of the element, increasing
    // downward.  WebGL readPixels / gl.readPixels uses y=0 at the BOTTOM of the
    // framebuffer, increasing upward.  We must flip Y here so that a click at
    // the CSS top of the canvas reads from the top row of the render target
    // (high WebGL y), not from the bottom (low WebGL y).
    const cx = Math.max(
      0,
      Math.min(this.targetWidth - 1, Math.floor((point.x / ctx.viewportWidth) * this.targetWidth)),
    );
    const cy = Math.max(
      0,
      Math.min(
        this.targetHeight - 1,
        this.targetHeight - 1 - Math.floor((point.y / ctx.viewportHeight) * this.targetHeight),
      ),
    );

    // §SELECT-3D-FORGIVING — centre pixel first; on a background centre, snap to
    // the nearest element pixel within a screen-px tolerance (converted to target
    // px).  Radius 0 for fixed-size callers (tests) → exact-pixel behaviour.
    const radiusTargetPx = this._autoSize
      ? Math.max(
          1,
          Math.round(
            GpuPickStrategy.SCREEN_SEARCH_RADIUS_PX * (this.targetWidth / Math.max(1, ctx.viewportWidth)),
          ),
        )
      : 0;
    const { slot, winX, winY } = this._readNearestSlot(ctx.renderer, rt, cx, cy, radiusTargetPx);
    if (slot === 0) return null;
    const id = this.indexToId.get(slot);
    if (id === undefined) return null;
    const kind = ctx.elementRegistry.kindOf(id);
    if (kind === null) return null;

    // §SELECT-PERF — HOVER passes skipDepth: it only needs the elementId for the
    // outline, so the SECOND (depth) render + readback is pure waste. Skipping it
    // ~halves the per-frame hover cost — the part that scales with element count
    // (the cause of "selection worsens as more elements are added"). hitPoint is the
    // cheap near-plane unprojection; hover ignores it.
    if (opts?.skipDepth) {
      return {
        elementId: id,
        elementKind: kind,
        hitPoint: unprojectScreenToWorld(point, ctx),
        distance: 0,
      };
    }

    // Task 2.4: depth readback — second render pass with DEPTH_PACK_MATERIAL.
    // When the pick snapped to a neighbour pixel, sample depth + unproject at
    // THAT pixel so hitPoint matches the element actually selected; otherwise use
    // the exact cursor point (preserves prior behaviour for centre hits + tests).
    const snapped = winX !== cx || winY !== cy;
    const depthScreen: Point2D = snapped
      ? {
          x: ((winX + 0.5) / this.targetWidth) * ctx.viewportWidth,
          y: ((this.targetHeight - 1 - winY + 0.5) / this.targetHeight) * ctx.viewportHeight,
        }
      : point;
    const { hitPoint, distance } = this.readDepthResult(ctx, winX, winY, depthScreen);

    return {
      elementId: id,
      elementKind: kind,
      hitPoint,
      distance,
    };
  }

  private pickRectInternal(rect: Rect2D, ctx: PickContext): readonly PickResult[] {
    if (!ctx.renderer || !ctx.scene) return [];
    if (rect.w <= 0 || rect.h <= 0) return [];
    this._syncTargetSize(ctx);
    this.syncPickScene(ctx.elementRegistry);
    const rt = this.ensureRenderTarget(ctx.renderer);
    ctx.renderer.renderToTarget(this.pickScene, ctx.camera, rt, null);

    // X is identical to CSS space (left-to-right).
    const rx = Math.max(0, Math.floor((rect.x / ctx.viewportWidth) * this.targetWidth));
    const rw = Math.max(
      1,
      Math.min(this.targetWidth - rx, Math.ceil((rect.w / ctx.viewportWidth) * this.targetWidth)),
    );

    // Y must be FLIPPED: CSS rect.y is from the CSS top; WebGL readPixels
    // y=0 is at the BOTTOM of the render target.  The CSS rect's bottom edge
    // (rect.y + rect.h from CSS top) becomes the WebGL bottom of the region.
    //   webgl_bottom = viewportHeight - (rect.y + rect.h)
    //   mapped to target: floor(webgl_bottom / viewportHeight * targetHeight)
    const ry = Math.max(
      0,
      Math.floor(((ctx.viewportHeight - rect.y - rect.h) / ctx.viewportHeight) * this.targetHeight),
    );
    const rh = Math.max(
      1,
      Math.min(this.targetHeight - ry, Math.ceil((rect.h / ctx.viewportHeight) * this.targetHeight)),
    );
    const buf = new Uint8Array(rw * rh * 4);
    ctx.renderer.readPixels(rt, rx, ry, rw, rh, buf);

    // First pass: collect unique slots and their representative pixel
    // (first pixel with that slot) for depth sampling.
    const slotRepPixel = new Map<number, { x: number; y: number }>();
    const seen = new Set<number>();
    for (let py = 0; py < rh; py++) {
      for (let px = 0; px < rw; px++) {
        const i = (py * rw + px) * 4;
        const slot = decodeRGBAToIndex(
          buf[i] ?? 0,
          buf[i + 1] ?? 0,
          buf[i + 2] ?? 0,
          buf[i + 3] ?? 0,
        );
        if (slot !== 0) {
          seen.add(slot);
          if (!slotRepPixel.has(slot)) {
            // Store in target-space coordinates for depth lookup.
            slotRepPixel.set(slot, { x: rx + px, y: ry + py });
          }
        }
      }
    }

    if (seen.size === 0) return [];

    // Task 2.4: depth pass — render once, read depth for each element's
    // representative pixel, reconstruct world-space distance.
    const depthBySlot = this.buildDepthBySlot(ctx, rx, ry, rw, rh, slotRepPixel);

    // Fall-back hit point (rect centre) used when no depth info is available.
    const center: Point2D = { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
    const results: PickResult[] = [];
    for (const slot of seen) {
      const id = this.indexToId.get(slot);
      if (id === undefined) continue;
      const kind = ctx.elementRegistry.kindOf(id);
      if (kind === null) continue;
      const depthInfo = depthBySlot.get(slot);
      results.push({
        elementId: id,
        elementKind: kind,
        hitPoint: depthInfo?.hitPoint ?? unprojectScreenToWorld(center, ctx),
        distance: depthInfo?.distance ?? 0,
      });
    }

    // Sort front-to-back so overlapping multi-selects produce depth-ordered results
    // (acceptance criterion: C04 §3.2 depth-sorted).
    results.sort((a, b) => a.distance - b.distance);
    return results;
  }

  /**
   * Render the pick scene with DEPTH_PACK_MATERIAL and read depth for each
   * unique slot from the depth target.  Returns an empty map on any failure.
   */
  private buildDepthBySlot(
    ctx: PickContext,
    rx: number,
    ry: number,
    rw: number,
    rh: number,
    slotRepPixel: Map<number, { x: number; y: number }>,
  ): Map<number, { hitPoint: Point3D; distance: number }> {
    const result = new Map<number, { hitPoint: Point3D; distance: number }>();
    if (!ctx.renderer) return result;
    try {
      const drt = this.ensureDepthTarget(ctx.renderer);
      const depthBuf = new Uint8Array(rw * rh * 4);
      ctx.renderer.renderToTarget(this.pickScene, ctx.camera, drt, DEPTH_PACK_MATERIAL);
      ctx.renderer.readPixels(drt, rx, ry, rw, rh, depthBuf);

      for (const [slot, rep] of slotRepPixel) {
        // rep is in target-space; convert to local buffer coords.
        const lx = rep.x - rx;
        const ly = rep.y - ry;
        const di = (ly * rw + lx) * 4;
        const ndcDepth = unpackRGBAToDepth(
          depthBuf[di] ?? 0,
          depthBuf[di + 1] ?? 0,
          depthBuf[di + 2] ?? 0,
          depthBuf[di + 3] ?? 0,
        );
        // 0 → near plane (background); 1 → far plane (background). Skip both.
        if (ndcDepth <= 0 || ndcDepth >= 1) continue;

        // Convert target pixel → screen coords → NDC → world.
        // rep.x / rep.y are in WebGL render-target space (y=0 at BOTTOM).
        // NDC-X: same direction as screen-X → no sign change.
        // NDC-Y: WebGL y=0 → NDC -1 (bottom), y=targetHeight → NDC +1 (top).
        //        That is the direct formula; do NOT negate (no CSS flip here).
        const screenX = (rep.x / this.targetWidth) * ctx.viewportWidth;
        const screenY = (rep.y / this.targetHeight) * ctx.viewportHeight;
        const ndcX = (screenX / ctx.viewportWidth) * 2.0 - 1.0;
        const ndcY = (screenY / ctx.viewportHeight) * 2.0 - 1.0;
        const ndcZ = ndcDepth * 2.0 - 1.0; // depth buffer [0,1] → NDC z [-1,1]
        const worldPos = ndcToWorldPos(ndcX, ndcY, ndcZ, ctx.camera);
        const distance = worldPos.distanceTo(ctx.camera.position);
        result.set(slot, {
          hitPoint: { x: worldPos.x, y: worldPos.y, z: worldPos.z },
          distance,
        });
      }
    } catch {
      // Depth pass failed — caller uses distance=0 fallback for all elements.
    }
    return result;
  }

  /**
   * Render the pick scene with DEPTH_PACK_MATERIAL and read depth at a single
   * target pixel `(rx, ry)`.  Returns world hit point + distance.
   * Falls back to near-plane world point + distance=0 on any failure.
   */
  private readDepthResult(
    ctx: PickContext,
    rx: number,
    ry: number,
    screenPoint: Point2D,
  ): { hitPoint: Point3D; distance: number } {
    const fallback = { hitPoint: unprojectScreenToWorld(screenPoint, ctx), distance: 0 };
    if (!ctx.renderer) return fallback;
    try {
      const drt = this.ensureDepthTarget(ctx.renderer);
      if (this.depthPixelBuffer.length < 4) this.depthPixelBuffer = new Uint8Array(4);
      ctx.renderer.renderToTarget(this.pickScene, ctx.camera, drt, DEPTH_PACK_MATERIAL);
      ctx.renderer.readPixels(drt, rx, ry, 1, 1, this.depthPixelBuffer);

      const ndcDepth = unpackRGBAToDepth(
        this.depthPixelBuffer[0] ?? 0,
        this.depthPixelBuffer[1] ?? 0,
        this.depthPixelBuffer[2] ?? 0,
        this.depthPixelBuffer[3] ?? 0,
      );
      // Depth of 0 means near plane (no geometry); 1 means far plane.
      if (ndcDepth <= 0 || ndcDepth >= 1) return fallback;

      const ndcX = (screenPoint.x / ctx.viewportWidth) * 2.0 - 1.0;
      const ndcY = -((screenPoint.y / ctx.viewportHeight) * 2.0 - 1.0);
      const ndcZ = ndcDepth * 2.0 - 1.0; // [0,1] → [-1,1]
      const worldPos = ndcToWorldPos(ndcX, ndcY, ndcZ, ctx.camera);
      const distance = worldPos.distanceTo(ctx.camera.position);
      return {
        hitPoint: { x: worldPos.x, y: worldPos.y, z: worldPos.z },
        distance,
      };
    } catch {
      return fallback;
    }
  }

  private ensureRenderTarget(renderer: GpuPickRenderer): THREE.WebGLRenderTarget {
    if (this.renderTarget !== null) return this.renderTarget;
    this.renderTarget = renderer.createRenderTarget(this.targetWidth, this.targetHeight);
    return this.renderTarget;
  }

  private ensureDepthTarget(renderer: GpuPickRenderer): THREE.WebGLRenderTarget {
    if (this.depthTarget !== null) return this.depthTarget;
    this.depthTarget = renderer.createRenderTarget(this.targetWidth, this.targetHeight);
    return this.depthTarget;
  }

  /**
   * §SELECT-PICK-RESOLUTION — when auto-sizing, match the pick render target to
   * the FULL device-pixel viewport (viewport × dpr) via computePickTargetSize,
   * clamped only to the GPU's real maxTextureSize, so the id-buffer is >= 1:1
   * with the rendered image.  The previous fixed 1280 cap downscaled a 1910-wide
   * viewport to ~0.67×, so thin elements (columns, railings, edge-on walls) lost
   * their pixels in the id-buffer and the pick fell through to the larger element
   * behind them.  Recreates the (id + depth) targets when the size changes,
   * disposing the old ones first.  No-op for fixed-size callers (unit tests) so
   * their exact-pixel expectations hold.
   */
  private _syncTargetSize(ctx: PickContext): void {
    if (!this._autoSize) return;
    const vw = ctx.viewportWidth;
    const vh = ctx.viewportHeight;
    if (!(vw > 0) || !(vh > 0)) return;
    // §SELECT-PICK-RESOLUTION — size the pick target to the FULL device-pixel
    // viewport (viewport × dpr) so the id-buffer is ≥ 1:1 with what the user
    // sees, clamped ONLY to the GPU's real max texture size (or a safe 4096
    // fallback when unreported).  This replaces the old fixed 1280 cap +
    // dpr-blind sizing that rendered thin elements at 0.67× and dropped them
    // from the id-buffer entirely.
    const dpr = (globalThis as { devicePixelRatio?: number }).devicePixelRatio ?? 1;
    const maxTex = ctx.renderer?.maxTextureSize ?? GpuPickStrategy.FALLBACK_MAX_DIM;
    const { width: tw, height: th } = computePickTargetSize(vw, vh, dpr, maxTex);
    if (tw === this.targetWidth && th === this.targetHeight && this.renderTarget !== null) return;
    // Diagnostic — print the EFFECTIVE pick resolution exactly once per size
    // change (the guard above throttles it to first-pick + each viewport
    // resize).  `pick:rendered >= 1` now is the goal: the pick samples at least
    // as densely as the rendered image, so thin elements survive in the buffer.
    const pickToRendered = tw / Math.max(1, vw * dpr);
    console.log(
      `[GpuPick] §SELECT-PICK-RESOLUTION target=${tw}x${th} viewport=${vw}x${vh} ` +
      `dpr=${dpr} maxTex=${maxTex} pick:rendered=${pickToRendered.toFixed(2)}` +
      (pickToRendered < 0.999
        ? ' (SUB-1:1 — clamped to GPU maxTextureSize; thin elements may still under-sample on extreme HiDPI/4K)'
        : ' (>=1:1 — pick matches rendered density; thin elements preserved)'),
    );
    // Size changed (first pick, or viewport resize) — drop old targets so the
    // ensure*Target helpers recreate them at the new resolution.  Optional
    // dispose() guards the fake render targets used in tests (auto-size off).
    (this.renderTarget as { dispose?: () => void } | null)?.dispose?.();
    (this.depthTarget as { dispose?: () => void } | null)?.dispose?.();
    this.renderTarget = null;
    this.depthTarget = null;
    this.targetWidth = tw;
    this.targetHeight = th;
  }

  /**
   * §SELECT-EXACT-PIXEL-FIRST (was §SELECT-3D-FORGIVING + §SELECT-THIN-WINS) —
   * read the slot under the cursor, with a nearest-element fallback ONLY when the
   * exact pixel is empty.
   *
   * The exact 1×1 read at (cx, cy) is authoritative: if it decodes to a valid slot
   * the user clicked directly ON that element, so it wins immediately and the
   * neighbourhood is NOT scanned (this is also the common-case perf win — no
   * second, larger readback when the cursor is on geometry, which matters as scene
   * density grows).  This reverses the prior "scan even on a centre hit so a
   * thinner footprint can steal it" rule, which let an adjacent door with a smaller
   * clipped footprint beat a window under the cursor.
   *
   * Fallback (radius > 0 AND centre empty): read the (2r+1)² neighbourhood ONCE and
   * delegate to the pure `chooseNearestThinSlot`, which picks the candidate whose
   * NEAREST pixel is closest to the cursor (ties → thinner, then lower slot id).
   * The id-buffer already resolves front/back occlusion per pixel via depthTest.
   *
   * Returns the winning slot plus the target-space pixel it came from (so the
   * depth pass samples the right place).
   */
  private _readNearestSlot(
    renderer: GpuPickRenderer,
    rt: THREE.WebGLRenderTarget,
    cx: number,
    cy: number,
    radius: number,
  ): { slot: number; winX: number; winY: number } {
    if (this.pixelBuffer.length < 4) this.pixelBuffer = new Uint8Array(4);
    renderer.readPixels(rt, cx, cy, 1, 1, this.pixelBuffer);
    const centreSlot = decodeRGBAToIndex(
      this.pixelBuffer[0] ?? 0,
      this.pixelBuffer[1] ?? 0,
      this.pixelBuffer[2] ?? 0,
      this.pixelBuffer[3] ?? 0,
    );
    // §SELECT-EXACT-PIXEL-FIRST — a valid id at the exact cursor pixel wins outright
    // (radius 0 fixed-size callers/tests fall through here too). The neighbourhood
    // scan below runs ONLY when the cursor sits on background, so it can never
    // override a confident direct click.
    if (radius <= 0 || centreSlot !== 0) {
      return { slot: centreSlot, winX: cx, winY: cy };
    }

    const x0 = Math.max(0, cx - radius);
    const y0 = Math.max(0, cy - radius);
    const x1 = Math.min(this.targetWidth - 1, cx + radius);
    const y1 = Math.min(this.targetHeight - 1, cy + radius);
    const bw = x1 - x0 + 1;
    const bh = y1 - y0 + 1;
    if (bw <= 0 || bh <= 0) {
      return { slot: centreSlot, winX: cx, winY: cy };
    }

    const buf = new Uint8Array(bw * bh * 4);
    renderer.readPixels(rt, x0, y0, bw, bh, buf);
    return chooseNearestThinSlot(buf, bw, bh, x0, y0, cx, cy, centreSlot);
  }

  private syncPickScene(registry: ElementRegistry): void {
    const rawIds = [...registry.ids()];

    // D1: Compute a sorted ID-set signature so we can detect a stable registry.
    // Sorting ensures identical element sets hash identically regardless of the
    // Map iteration order used by registry.ids().
    const sig = rawIds.slice().sort().join('\x00');
    const setStable = sig === this._lastRegistrySig && this.entries.size > 0;
    this._lastRegistrySig = sig;

    const liveIds = new Set(rawIds);

    if (!setStable) {
      // Remove clones for elements that are no longer in the registry.
      // Skipped on a stable scene (nothing added/removed) to avoid the
      // O(entries) Map iteration on every hover RAF and click.
      for (const [id, entry] of this.entries) {
        if (!liveIds.has(id)) {
          this.pickScene.remove(entry.clone);
          for (const c of entry.additionalClones) {
            this.pickScene.remove(c);
          }
          entry.material.dispose();
          this.indexToId.delete(entry.slotIndex);
          // HIGH-7: return the slot to the free-list so it can be reused
          // by the next element that is added.  O(1).
          this._freeSlots.push(entry.slotIndex);
          this.entries.delete(id);
        }
      }
      // §SELECT-INSTANCED-PICK (FIX #1) — parallel removal pass for instanced
      // groups that left the registry: drop their clone + free every per-instance
      // pick slot they held so indexToId never resolves a stale element id.
      for (const [id, entry] of this.instancedGroupEntries) {
        if (!liveIds.has(id)) {
          this._disposeInstancedGroupEntry(id, entry);
        }
      }
    }

    // Add new elements + refresh transforms.
    for (const id of liveIds) {
      const obj = registry.objectFor(id);
      if (obj === null) continue;

      // §PICK-RESPECT-VISIBILITY — an element whose root is hidden (visible=false
      // on the root or any ancestor) must NOT be pickable. Floor isolation
      // ("Active Level Only") and every other hide write `root.visible = false`;
      // the renderer skips those roots, so the pick id-buffer MUST skip them too —
      // otherwise a click resolves to an element the user cannot see. Keying off
      // the SAME `.visible` signal the renderer honours makes render and pick agree
      // by construction (no parallel hidden-list to drift). This single guard covers
      // ALL three downstream branches (instanced-group, coalesced-IM, simple-mesh).
      // If a prior entry exists for a now-hidden root, drop it so its slot leaves
      // the id-buffer; a later visible sync rebuilds it from scratch.
      if (!isVisibleInHierarchy(obj)) {
        const existing = this.entries.get(id);
        if (existing !== undefined) this._invalidateEntry(id, existing);
        const existingGroup = this.instancedGroupEntries.get(id);
        if (existingGroup !== undefined) this._disposeInstancedGroupEntry(id, existingGroup);
        continue;
      }

      // §SELECT-INSTANCED-PICK (FIX #1) — InstancedElementRenderer group path.
      // The group carries a single SYNTHETIC userData.id (so the registry includes
      // it) but hosts MANY BIM elements, one per occupied instance slot. We paint
      // a DISTINCT pick colour per instance and register each instance's element id
      // under its OWN pick slot, so the id-buffer readback resolves the per-INSTANCE
      // element — never the synthetic group id. This is the GPU-path mirror of the
      // BVH path's hit.instanceId → getInstanceElementId(slot) resolution.
      if (obj.userData?.isInstancedGroup === true && obj instanceof THREE.InstancedMesh) {
        this._syncInstancedGroup(id, obj);
        continue;
      }

      // §SELECT-INSTANCED-PICK (FIX #4) — generation guard: if the element was
      // rebuilt since its entry was created (userData.version bumped), drop the
      // stale entry so it is rebuilt fresh below — defeating the rapid hover+click
      // reconciliation race where an IM-child swap keeps the same count.
      this._invalidateIfStaleGeneration(id, obj);

      // ADR-046: Collect ALL InstancedMesh descendants (including hidden ones
      // whose geometry is now served visually by a merged IM).  For each IM,
      // we create per-instance pick clones positioned in world space so every
      // coalesced panel is individually pickable and maps to this element's slot.
      const instancedMeshes = collectInstancedMeshes(obj);

      if (instancedMeshes.length > 0) {
        // ── InstancedMesh path (coalesced curtain-wall panels) ────────────
        const entry = this.entries.get(id);

        if (entry === undefined) {
          // Allocate a slot colour for this element.
          // HIGH-7: _allocateSlot() reuses freed indices before incrementing nextSlot.
          const slotIndex = this._allocateSlot();
          const [r, g, b] = encodeIndexToRGBA(slotIndex);
          const material = new THREE.MeshBasicMaterial({
            color: new THREE.Color(r / 255, g / 255, b / 255),
            transparent: false,
            depthTest: true,
            depthWrite: true,
            // FIX-S16-Z: Polygon offset pulls the pick fragment slightly toward
            // the camera so the visually-frontmost surface wins deterministically
            // at wall seam pixels where two walls share an edge (z-fighting).
            polygonOffset: true,
            polygonOffsetFactor: -1,
            polygonOffsetUnits: -1,
          });

          // Primary clone from the first InstancedMesh.
          const firstIM = instancedMeshes[0]!;
          const primaryClone = buildInstancedPickClone(firstIM, obj, material);
          this.pickScene.add(primaryClone);

          // Additional clones for any remaining InstancedMeshes on this element.
          const additionalClones: THREE.Object3D[] = [];
          for (let i = 1; i < instancedMeshes.length; i++) {
            const extra = buildInstancedPickClone(instancedMeshes[i]!, obj, material);
            this.pickScene.add(extra);
            additionalClones.push(extra);
          }

          this.entries.set(id, {
            slotIndex,
            clone: primaryClone,
            material,
            additionalClones,
            generation: (obj.userData as { version?: number }).version,
          });
          this.indexToId.set(slotIndex, id);
        } else {
          // Refresh transforms for all existing clones.
          // refreshInstancedPickClone calls root.updateMatrixWorld(true) internally.
          refreshInstancedPickClone(entry.clone as THREE.InstancedMesh, instancedMeshes[0]!, obj);

          // BUG-03: Reconcile additionalClones count when the element's InstancedMesh
          // count changes between picks (e.g. after a geometry rebuild that adds or
          // removes child IMs).  Without reconciliation, entries created with N clones
          // silently stop syncing the (N+k)th IM, or redundant clones remain after
          // an IM is removed.
          const expectedAdditional = instancedMeshes.length - 1;
          if (entry.additionalClones.length !== expectedAdditional) {
            for (const c of entry.additionalClones) this.pickScene.remove(c);
            entry.additionalClones.length = 0;
            for (let i = 1; i < instancedMeshes.length; i++) {
              const extra = buildInstancedPickClone(instancedMeshes[i]!, obj, entry.material);
              this.pickScene.add(extra);
              entry.additionalClones.push(extra);
            }
          } else {
            for (let i = 0; i < entry.additionalClones.length; i++) {
              const src = instancedMeshes[i + 1];
              if (src) {
                refreshInstancedPickClone(
                  entry.additionalClones[i] as THREE.InstancedMesh,
                  src,
                  obj,
                );
              }
            }
          }
        }
        continue;
      }

      // ── Simple Mesh / Group path (BUG-02: per-child-mesh clones) ────────
      // Collect ALL visible, non-instanced child meshes so that compound
      // elements (L-shaped walls, multi-fragment slabs, multi-body roofs) are
      // fully covered by the pick scene.  The previous single-clone approach
      // only covered the first child mesh — all other geometry was invisible
      // to the GPU pick readback, causing missed picks on multi-fragment walls.
      const allMeshes = collectVisibleMeshes(obj);
      if (allMeshes.length === 0) {
        // §PICK-RESPECT-VISIBILITY — the element has NO visible geometry now
        // (e.g. its child meshes were individually hidden, or a ceiling went
        // visible=false in exploded view via LevelExplodeController, while the
        // root group itself stays visible=true so the hierarchy guard above did
        // not catch it). A bare `continue` here used to LEAVE the element's prior
        // PickEntry — clone + slot colour — in the pick scene, so the id-buffer
        // kept rendering a STALE clone of a now-invisible object: a click on a
        // VISIBLE element behind/around it could read the stale pixel and resolve
        // to the wrong (invisible) element ("3D selection picks wrong element in
        // exploded view"; hidden element stays selectable). Dispose the entry so
        // an element with no visible geometry has NO clone in the pick scene.
        const stale = this.entries.get(id);
        if (stale !== undefined) this._invalidateEntry(id, stale);
        continue;
      }

      const primaryMesh = allMeshes[0]!;

      let entry = this.entries.get(id);
      if (entry === undefined) {
        // HIGH-7: _allocateSlot() reuses freed indices before incrementing nextSlot.
        const slotIndex = this._allocateSlot();
        const [r, g, b] = encodeIndexToRGBA(slotIndex);
        const material = new THREE.MeshBasicMaterial({
          color: new THREE.Color(r / 255, g / 255, b / 255),
          transparent: false,
          depthTest: true,
          depthWrite: true,
          // FIX-S16-Z: Polygon offset — same rationale as InstancedMesh path above.
          polygonOffset: true,
          polygonOffsetFactor: -1,
          polygonOffsetUnits: -1,
        });
        const clone = new THREE.Mesh(primaryMesh.geometry as THREE.BufferGeometry, material);
        clone.matrixAutoUpdate = false;
        this.pickScene.add(clone);

        const additionalClones: THREE.Object3D[] = [];
        for (let i = 1; i < allMeshes.length; i++) {
          const extra = new THREE.Mesh(allMeshes[i]!.geometry as THREE.BufferGeometry, material);
          extra.matrixAutoUpdate = false;
          this.pickScene.add(extra);
          additionalClones.push(extra);
        }

        entry = {
          slotIndex,
          clone,
          material,
          additionalClones,
          generation: (obj.userData as { version?: number }).version,
        };
        this.entries.set(id, entry);
        this.indexToId.set(slotIndex, id);
      }

      // Refresh transforms — each clone tracks its source mesh's matrixWorld.
      // Using mesh.matrixWorld (not the group root matrixWorld) correctly places
      // each clone relative to its mesh-local geometry, even when fragment meshes
      // have position offsets within the parent Group.
      // CRITICAL FIX (F-NEW): force=true guarantees builders using
      // matrixAutoUpdate=false get their world matrix recomputed.
      obj.updateMatrixWorld(true);
      primaryMesh.updateWorldMatrix(true, false);
      entry.clone.matrix.copy(primaryMesh.matrixWorld);
      entry.clone.geometry = primaryMesh.geometry as THREE.BufferGeometry;

      // BUG-02/BUG-03: Reconcile additionalClones count if child mesh count changed
      // since this entry was created (geometry rebuild, fragment add/remove).
      const expectedAdditional = allMeshes.length - 1;
      if (entry.additionalClones.length !== expectedAdditional) {
        for (const c of entry.additionalClones) this.pickScene.remove(c);
        entry.additionalClones.length = 0;
        for (let i = 1; i < allMeshes.length; i++) {
          const extra = new THREE.Mesh(allMeshes[i]!.geometry as THREE.BufferGeometry, entry.material);
          extra.matrixAutoUpdate = false;
          this.pickScene.add(extra);
          entry.additionalClones.push(extra);
        }
      }

      for (let i = 0; i < entry.additionalClones.length; i++) {
        const srcMesh = allMeshes[i + 1];
        if (srcMesh) {
          srcMesh.updateWorldMatrix(true, false);
          (entry.additionalClones[i] as THREE.Mesh).matrix.copy(srcMesh.matrixWorld);
          (entry.additionalClones[i] as THREE.Mesh).geometry = srcMesh.geometry as THREE.BufferGeometry;
        }
      }
    }
  }

  /**
   * §SELECT-INSTANCED-PICK (FIX #1) — render an InstancedElementRenderer group
   * into the pick scene with a DISTINCT pick colour per occupied instance.
   *
   * Each occupied instance hosts a different BIM element. We:
   *   1. resolve every occupied source slot via `getOccupiedInstanceSlots()`,
   *   2. resolve each slot's element id via `getInstanceElementId(slot)`,
   *   3. allocate ONE pick slot per element id and register `indexToId[pickSlot]
   *      = elementId`,
   *   4. bake the pick-slot colour into the clone InstancedMesh's `instanceColor`
   *      at the SAME source slot index, copying that instance's world matrix.
   *
   * The id-buffer readback at a pixel covered by instance `k` therefore decodes
   * to instance `k`'s pick slot → its per-INSTANCE element id. The synthetic
   * group id is never the resolved selection — it exists only so the registry
   * includes the group. Rebuilt fully each call (instance counts are small and
   * the slot set can change as the curtain-wall / structural grid rebuilds).
   */
  private _syncInstancedGroup(id: ElementId, group: THREE.InstancedMesh): void {
    const ud = group.userData as {
      getOccupiedInstanceSlots?: () => readonly number[];
      getInstanceElementId?: (slot: number) => string | undefined;
    };
    const occupied = ud.getOccupiedInstanceSlots?.() ?? [];
    const getElemId = ud.getInstanceElementId;

    // Build the membership signature (sourceSlot:elementId, sorted) so a stable
    // group only refreshes matrices and keeps its pick slots + colours — a
    // hover→click pair must resolve the SAME element. Only a membership change
    // (slot added/removed/re-homed) forces a full dispose + rebuild.
    const pairs: string[] = [];
    if (getElemId !== undefined) {
      for (const slot of occupied) {
        const eid = getElemId(slot);
        if (eid !== undefined) pairs.push(`${slot}\x1f${eid}`);
      }
    }
    pairs.sort();
    const membershipSig = pairs.join('\x00');

    const prior = this.instancedGroupEntries.get(id);
    if (prior && prior.membershipSig === membershipSig && membershipSig !== '') {
      // STABLE membership — refresh only the per-instance world matrices.
      group.updateMatrixWorld(true);
      const localM = new THREE.Matrix4();
      const worldM = new THREE.Matrix4();
      for (const srcSlot of prior.pickSlotByInstance.keys()) {
        group.getMatrixAt(srcSlot, localM);
        worldM.multiplyMatrices(group.matrixWorld, localM);
        prior.clone.setMatrixAt(srcSlot, worldM);
      }
      prior.clone.instanceMatrix.needsUpdate = true;
      return;
    }

    // Membership changed (or first build) — tear down any prior entry and rebuild.
    if (prior) this._disposeInstancedGroupEntry(id, prior);

    if (occupied.length === 0 || getElemId === undefined) return;

    group.updateMatrixWorld(true);

    const count = group.count;
    const material = new THREE.MeshBasicMaterial({
      // White base so the per-instance `instanceColor` passes through 1:1 — the
      // colour the readback decodes is EXACTLY the encoded pick slot.
      color: new THREE.Color(1, 1, 1),
      transparent: false,
      depthTest: true,
      depthWrite: true,
      // FIX-S16-Z parity: pull pick fragments slightly toward the camera.
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });

    const clone = new THREE.InstancedMesh(group.geometry, material, count);
    clone.matrixAutoUpdate = false;
    clone.matrix.identity();
    clone.matrixWorld.identity();

    // Park EVERY slot at zero scale + slot-0 colour ("no hit") so non-occupied
    // slots produce no pickable fragments and never decode to a live element.
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    const black = new THREE.Color(0, 0, 0);
    for (let i = 0; i < count; i++) {
      clone.setMatrixAt(i, zero);
      clone.setColorAt(i, black);
    }

    const localMatrix = new THREE.Matrix4();
    const worldMatrix = new THREE.Matrix4();
    const pickSlotByInstance = new Map<number, number>();
    const colour = new THREE.Color();

    for (const srcSlot of occupied) {
      if (srcSlot < 0 || srcSlot >= count) continue;
      const elemId = getElemId(srcSlot);
      if (elemId === undefined) continue;

      const pickSlot = this._allocateSlot();
      this.indexToId.set(pickSlot, elemId);
      pickSlotByInstance.set(srcSlot, pickSlot);

      const [r, g, b] = encodeIndexToRGBA(pickSlot);
      colour.setRGB(r / 255, g / 255, b / 255);
      clone.setColorAt(srcSlot, colour);

      // World matrix = group world transform × per-instance local matrix.
      group.getMatrixAt(srcSlot, localMatrix);
      worldMatrix.multiplyMatrices(group.matrixWorld, localMatrix);
      clone.setMatrixAt(srcSlot, worldMatrix);
    }

    clone.instanceMatrix.needsUpdate = true;
    if (clone.instanceColor) clone.instanceColor.needsUpdate = true;
    this.pickScene.add(clone);
    this.instancedGroupEntries.set(id, {
      kind: 'instanced-group',
      clone,
      material,
      pickSlotByInstance,
      membershipSig,
    });
  }

  /**
   * §SELECT-INSTANCED-PICK (FIX #1) — dispose one instanced-group pick entry:
   * remove its clone, free every per-instance pick slot it held (returning them
   * to the free-list and clearing indexToId), and dispose its material.
   */
  private _disposeInstancedGroupEntry(id: ElementId, entry: InstancedGroupPickEntry): void {
    this.pickScene.remove(entry.clone);
    for (const pickSlot of entry.pickSlotByInstance.values()) {
      this.indexToId.delete(pickSlot);
      this._freeSlots.push(pickSlot);
    }
    entry.material.dispose();
    this.instancedGroupEntries.delete(id);
  }

  /**
   * §SELECT-INSTANCED-PICK (FIX #4) — generation guard against a reconciliation
   * race. If an existing standard pick entry's stored generation differs from the
   * element's CURRENT `userData.version`, the element was rebuilt since the entry
   * was created (possibly swapping its InstancedMesh children with no count
   * change). Dispose the entry (freeing its slot + clones) so the add path below
   * rebuilds it from scratch, rather than incrementally reconciling clones that
   * may point at orphaned geometry. No-op when the element carries no version or
   * the generation is unchanged.  Returns true if the entry was invalidated.
   */
  private _invalidateIfStaleGeneration(id: ElementId, obj: THREE.Object3D): boolean {
    const entry = this.entries.get(id);
    if (entry === undefined) return false;
    const currentGen = (obj.userData as { version?: number }).version;
    if (currentGen === undefined || currentGen === entry.generation) return false;

    this._invalidateEntry(id, entry);
    return true;
  }

  /**
   * Tear down one standard (Mesh / coalesced-IM) pick entry: remove its primary
   * and additional clones from the pick scene, dispose its material, free its
   * pick slot (clearing indexToId + returning the slot to the free-list), and
   * drop it from `entries`. Shared by the stale-generation guard (FIX #4) and the
   * §PICK-RESPECT-VISIBILITY hidden-root skip so a hidden element's slot leaves
   * the id-buffer and can never be resolved by a pick.
   */
  private _invalidateEntry(id: ElementId, entry: PickEntry): void {
    this.pickScene.remove(entry.clone);
    for (const c of entry.additionalClones) this.pickScene.remove(c);
    entry.material.dispose();
    this.indexToId.delete(entry.slotIndex);
    this._freeSlots.push(entry.slotIndex);
    this.entries.delete(id);
  }
}

// ---------------------------------------------------------------------------
// ADR-046: InstancedMesh pick helpers
// ---------------------------------------------------------------------------

/**
 * §PICK-RESPECT-VISIBILITY — true iff `obj` is renderable: neither it nor any of
 * its ancestors has `visible === false`.
 *
 * THREE's renderer skips a subtree the moment ANY node on the path from the root
 * to a mesh is `visible=false`; floor isolation ("Active Level Only") and other
 * hides set `root.visible = false` on the REGISTERED root (a Group), while its
 * child meshes keep `visible=true`. Checking only the registered object's own
 * flag would miss a hide applied to an ancestor; checking only child flags (as
 * `collectVisibleMeshes` did) misses a hide applied to the root Group itself.
 * Walking the whole chain keeps the pick id-buffer 1:1 with what the renderer
 * actually draws, so a click can never resolve to a hidden element.
 */
function isVisibleInHierarchy(obj: THREE.Object3D): boolean {
  let node: THREE.Object3D | null = obj;
  while (node !== null) {
    if (node.visible === false) return false;
    node = node.parent;
  }
  return true;
}

/**
 * Collect all InstancedMesh descendants of `obj` — including hidden ones
 * (visible=false) that were coalesced by InstancedMeshCoalescer.
 * THREE.traverse visits invisible nodes by default.
 */
function collectInstancedMeshes(obj: THREE.Object3D | null): THREE.InstancedMesh[] {
  if (obj === null) return [];
  const result: THREE.InstancedMesh[] = [];
  obj.traverse((child) => {
    if (child instanceof THREE.InstancedMesh) result.push(child);
  });
  return result;
}

/**
 * BUG-02: Collect all visible, non-instanced Mesh descendants of `obj`.
 *
 * Used by syncPickScene to create one pick clone per child mesh, ensuring
 * compound elements (L-shaped walls, multi-fragment slabs, multi-body roofs)
 * are fully covered by the GPU pick scene.  The previous `extractGeometry`
 * approach only cloned the first child mesh, leaving all other geometry
 * invisible to the pick readback.
 *
 * InstancedMesh is excluded — those are handled by the dedicated
 * collectInstancedMeshes + buildInstancedPickClone path.
 * Invisible meshes are excluded since they produce no pixels in the render.
 */
function collectVisibleMeshes(obj: THREE.Object3D | null): THREE.Mesh[] {
  if (obj === null) return [];
  // §PICK-RESPECT-VISIBILITY — a hidden root contributes NOTHING, even if its
  // child meshes carry visible=true (isolation hides the root Group, not the
  // leaves). The renderer skips the whole subtree, so the pick scene must too.
  if (obj.visible === false) return [];
  if (obj instanceof THREE.InstancedMesh) return [];
  if (obj instanceof THREE.Mesh) {
    return obj.visible ? [obj] : [];
  }
  const result: THREE.Mesh[] = [];
  obj.traverse((child) => {
    if (child instanceof THREE.InstancedMesh) return;
    if (!(child instanceof THREE.Mesh)) return;
    if (!child.visible) return;
    result.push(child);
  });
  return result;
}

/**
 * Build a pick-coloured `THREE.InstancedMesh` clone for `src`.
 * Each instance matrix is converted from `src`'s local space to world space
 * so the pick clone is positioned correctly regardless of the parent hierarchy.
 * The clone's own matrix is identity — it lives in world space.
 *
 * @param src    The source InstancedMesh (may be hidden after coalescing).
 * @param root   The registered Object3D (wall Group) — used to get world transform.
 * @param mat    Pre-allocated pick-colour MeshBasicMaterial.
 */
function buildInstancedPickClone(
  src: THREE.InstancedMesh,
  root: THREE.Object3D,
  mat: THREE.MeshBasicMaterial,
): THREE.InstancedMesh {
  const count = src.count;
  const clone = new THREE.InstancedMesh(src.geometry, mat, count);
  clone.matrixAutoUpdate = false;
  clone.matrix.identity();

  root.updateMatrixWorld(true);
  src.updateWorldMatrix(true, false);

  const localMatrix = new THREE.Matrix4();
  const worldMatrix = new THREE.Matrix4();

  for (let i = 0; i < count; i++) {
    src.getMatrixAt(i, localMatrix);
    // World matrix = IM's world transform × per-instance local matrix.
    worldMatrix.multiplyMatrices(src.matrixWorld, localMatrix);
    clone.setMatrixAt(i, worldMatrix);
  }
  clone.instanceMatrix.needsUpdate = true;
  return clone;
}

/**
 * Refresh the per-instance world-space matrices on an existing pick clone
 * after the source InstancedMesh or its parent transforms have changed.
 */
function refreshInstancedPickClone(
  clone: THREE.InstancedMesh,
  src: THREE.InstancedMesh,
  root: THREE.Object3D,
): void {
  root.updateMatrixWorld(true);
  src.updateWorldMatrix(true, false);

  const localMatrix = new THREE.Matrix4();
  const worldMatrix = new THREE.Matrix4();
  const count = Math.min(clone.count, src.count);

  for (let i = 0; i < count; i++) {
    src.getMatrixAt(i, localMatrix);
    worldMatrix.multiplyMatrices(src.matrixWorld, localMatrix);
    clone.setMatrixAt(i, worldMatrix);
  }
  clone.instanceMatrix.needsUpdate = true;

  // BUG-06: Zero-scale orphan instances when clone.count > src.count.
  // This happens when a curtain-wall is rebuilt with fewer panels — the pick
  // clone retains the old count but some instance slots are no longer written.
  // Those orphan slots keep their last-written matrix and remain visible in the
  // pick render as ghost hit areas.  Scale them to zero so they produce no
  // fragments.
  if (clone.count > src.count) {
    const zeroScale = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = src.count; i < clone.count; i++) {
      clone.setMatrixAt(i, zeroScale);
    }
  }
}

// ---------------------------------------------------------------------------
// Original helpers
// ---------------------------------------------------------------------------


/**
 * §SELECT-PICK-RESOLUTION — PURE target-size computation (no THREE, no DOM).
 *
 * Sizes the GPU pick render target to the full device-pixel viewport
 * (`viewport × dpr`) so the id-buffer samples at least as densely as the
 * rendered image — thin elements (columns, railings, edge-on walls) keep their
 * pixels in the buffer instead of collapsing to <1px and vanishing.
 *
 * The ONLY hard cap is `maxTextureSize` (the GPU's real `MAX_TEXTURE_SIZE`),
 * NOT a fixed 1280.  When the *device-pixel* dimensions exceed the cap (extreme
 * 4K/retina canvases), both axes are scaled down together so the aspect ratio
 * is preserved and neither axis exceeds the GPU limit.
 *
 * Deterministic: identical inputs → identical output.  Exported for unit tests.
 *
 * @param viewportW  CSS-pixel viewport width  (> 0).
 * @param viewportH  CSS-pixel viewport height (> 0).
 * @param dpr        devicePixelRatio (>= 1 in practice; clamped to >= 1 here).
 * @param maxTexSize GPU max single-texture dimension (clamped to >= 1).
 */
export function computePickTargetSize(
  viewportW: number,
  viewportH: number,
  dpr: number,
  maxTexSize: number,
): { width: number; height: number } {
  const vw = Math.max(1, viewportW);
  const vh = Math.max(1, viewportH);
  const ratio = Math.max(1, dpr); // never under-sample below CSS resolution
  const cap = Math.max(1, Math.floor(maxTexSize));

  // Ideal: full device-pixel resolution.
  let w = vw * ratio;
  let h = vh * ratio;

  // Clamp to the GPU max, preserving aspect ratio (scale the LONGER axis to fit).
  const longest = Math.max(w, h);
  if (longest > cap) {
    const scale = cap / longest;
    w *= scale;
    h *= scale;
  }

  return {
    width: Math.max(1, Math.min(cap, Math.round(w))),
    height: Math.max(1, Math.min(cap, Math.round(h))),
  };
}

/**
 * §SELECT-EXACT-PIXEL-FIRST — PURE id-buffer disambiguation (no THREE, no DOM).
 *
 * INVARIANT (founder priority — "architecturally sound"): the id painted at the
 * EXACT pixel under the cursor is the user's intent and WINS whenever it is a
 * valid (non-background) slot.  The GPU id-buffer already resolves front/back
 * occlusion per pixel (frontmost surface wins via depthTest), so the pixel the
 * cursor sits on is authoritative — a click that lands ON a window must select
 * that window, never a bigger- OR smaller-footprint neighbour (door / wall) that
 * merely happens to have pixels in the surrounding search window.
 *
 * The neighbourhood scan is a FALLBACK that engages ONLY when the centre pixel is
 * background (empty).  This replaces the prior §SELECT-THIN-WINS "thinner
 * footprint steals a confident centre hit" rule, which was the ROOT CAUSE of the
 * reported defect: a door whose sliver of pixels near a window edge had a smaller
 * footprint than the window under the cursor would beat the window, and the defect
 * worsened with scene density because denser scenes put more competing slivers in
 * the search window.
 *
 * Fallback selection (centre empty): pick the slot whose NEAREST pixel is closest
 * to the cursor; ties in distance → smaller footprint (a thin element the cursor
 * just grazed); final deterministic tie-break → lower slot id.  Never "largest
 * footprint wins" and never "first non-empty slot wins".
 *
 * Deterministic: a stable tie-break on (distance, footprint, slot id) guarantees
 * identical inputs → identical output.  Exported for unit tests.
 *
 * @param buf        RGBA bytes, length >= bw*bh*4 (row-major, y down within window).
 * @param bw, bh     Window dimensions in pixels.
 * @param x0, y0     Target-space pixel of the window's top-left (buf[0]).
 * @param cx, cy     Target-space cursor pixel.
 * @param centreSlot Decoded slot at (cx, cy) (0 = background).  When non-zero it
 *                   is returned verbatim — the exact pixel always wins.
 */
export function chooseNearestThinSlot(
  buf: Uint8Array,
  bw: number,
  bh: number,
  x0: number,
  y0: number,
  cx: number,
  cy: number,
  centreSlot: number,
): { slot: number; winX: number; winY: number } {
  // §SELECT-EXACT-PIXEL-FIRST — the exact pixel under the cursor is authoritative.
  // If it carries a valid id, that id wins outright; the neighbourhood scan below
  // is NEVER consulted (so no neighbour — larger OR smaller footprint — can steal
  // a confident direct click).  This is the whole fix for the window→door defect.
  if (centreSlot !== 0) {
    return { slot: centreSlot, winX: cx, winY: cy };
  }

  // Pixels at which a near-tie in distance is decided by thinness instead.
  const TIE_PX = 2;
  const TIE_SQ = TIE_PX * TIE_PX;

  interface SlotStat {
    nearestDistSq: number;
    nearestX: number;
    nearestY: number;
    footprint: number;
  }
  const stats = new Map<number, SlotStat>();

  for (let py = 0; py < bh; py++) {
    for (let px = 0; px < bw; px++) {
      const i = (py * bw + px) * 4;
      const s = decodeRGBAToIndex(buf[i] ?? 0, buf[i + 1] ?? 0, buf[i + 2] ?? 0, buf[i + 3] ?? 0);
      if (s === 0) continue;
      const ax = x0 + px;
      const ay = y0 + py;
      const dsq = (ax - cx) * (ax - cx) + (ay - cy) * (ay - cy);
      const existing = stats.get(s);
      if (existing === undefined) {
        stats.set(s, { nearestDistSq: dsq, nearestX: ax, nearestY: ay, footprint: 1 });
      } else {
        existing.footprint += 1;
        if (dsq < existing.nearestDistSq) {
          existing.nearestDistSq = dsq;
          existing.nearestX = ax;
          existing.nearestY = ay;
        }
      }
    }
  }

  if (stats.size === 0) return { slot: 0, winX: cx, winY: cy };

  // §SELECT-EXACT-PIXEL-FIRST — centre was empty, so choose the nearest-to-cursor
  // candidate.  Nearest pixel first; on a near-tie in distance, the SMALLER
  // footprint wins (a thin element the cursor just grazed rather than the large
  // element behind it); final deterministic tie-break on slot id (lower wins).
  // Crucially this never prefers the LARGEST footprint, so small elements are not
  // starved by adjacent large ones.
  let best: { slot: number } & SlotStat | null = null;
  for (const [slot, st] of stats) {
    if (best === null) {
      best = { slot, ...st };
      continue;
    }
    const dDiff = st.nearestDistSq - best.nearestDistSq;
    let better: boolean;
    if (Math.abs(dDiff) <= TIE_SQ) {
      // Near-tie in distance → thinner wins; then lower slot id.
      better =
        st.footprint < best.footprint ||
        (st.footprint === best.footprint && slot < best.slot);
    } else {
      better = dDiff < 0; // strictly nearer
    }
    if (better) best = { slot, ...st };
  }

  return best === null
    ? { slot: 0, winX: cx, winY: cy }
    : { slot: best.slot, winX: best.nearestX, winY: best.nearestY };
}

function unprojectScreenToWorld(point: Point2D, ctx: PickContext): { x: number; y: number; z: number } {
  // NDC: [-1, 1] both axes; +Y up.  Screen +Y is down.
  const ndcX = (point.x / ctx.viewportWidth) * 2 - 1;
  const ndcY = -((point.y / ctx.viewportHeight) * 2 - 1);
  const v = new THREE.Vector3(ndcX, ndcY, 0.5);
  v.unproject(ctx.camera);
  return { x: v.x, y: v.y, z: v.z };
}

// ---------------------------------------------------------------------------
// Task 2.4: depth helpers
// ---------------------------------------------------------------------------

/**
 * Unpack four RGBA bytes (from THREE's `packDepthToRGBA` shader) back to a
 * normalised float depth value ∈ [0, 1].
 *
 * Mirrors the THREE.js `UnpackDepthRGBA` macro:
 *   dot(v, 1.0 / vec4(1.0, 255.0, 65025.0, 16581375.0))
 *
 * Each channel carries a successive base-255 fractional digit.
 */
function unpackRGBAToDepth(r: number, g: number, b: number, a: number): number {
  return (r / 255) / 1.0 +
    (g / 255) / 255.0 +
    (b / 255) / 65025.0 +
    (a / 255) / 16581375.0;
}

/**
 * Unproject NDC coordinates into world space using the camera's inverse
 * projection-view matrix.  Wraps `Vector3.unproject(camera)`.
 *
 * `ndcZ` ∈ [-1, 1]: -1 = near plane, +1 = far plane.
 */
function ndcToWorldPos(
  ndcX: number,
  ndcY: number,
  ndcZ: number,
  camera: THREE.Camera,
): THREE.Vector3 {
  return new THREE.Vector3(ndcX, ndcY, ndcZ).unproject(camera);
}
