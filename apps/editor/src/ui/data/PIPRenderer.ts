/**
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    UI + Rendering (Phase 2.1 — second WebGL renderer)
 * File:             src/ui/data/PIPRenderer.ts
 * Contract:         02-SPATIAL-PROJECTION-CONTRACT §8.2 (read-only scene access)
 *                   05-BIM-UI-ARCHITECTURE-CONTRACT §6.2 (no event dispatch)
 *
 * PIPRenderer — Picture-in-Picture mini-map for F3 Data Command Center.
 * Second THREE.WebGLRenderer on a separate <canvas> element.
 * Shares the main scene object (read-only reference — never modifies it).
 * Own OrthographicCamera, top-down view, wireframe material override.
 *
 * CONTRACT RULES:
 *   - Strictly read-only. Never dispatches events or commands.
 *   - Never modifies scene.elements, ElementRegistry, or any store.
 *   - Calls dispose() on unmount to release GPU resources.
 *   - Renders at devicePixelRatio: 1 (perf budget).
 */

import * as THREE from '@pryzm/renderer-three/three';
import { getFrameScheduler, type TickListenerDisposer } from '@pryzm/frame-scheduler';

export class PIPRenderer {
  /** Phase B (S73-WIRE) — runtime threaded by parent (added by widening — class had no explicit constructor). */
  public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;
  constructor(runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null) { this.runtime = runtime; }

  private _renderer:  THREE.WebGLRenderer | null = null;
  private _camera:    THREE.OrthographicCamera | null = null;
  private _canvas:    HTMLCanvasElement | null = null;
  private _scene:     THREE.Scene | null = null;
  // D.7.5 batch #4: rAF handle replaced by FrameScheduler disposer.
  private _animId: TickListenerDisposer | null = null;
  private _wireMat:   THREE.MeshBasicMaterial | null = null;
  private _prevOverride: THREE.Material | null = null;

  // ── Public API ─────────────────────────────────────────────────────────────

  /** Mount the PIP renderer into a container element. */
  mount(container: HTMLElement, scene: THREE.Scene): void {
    this.dispose();

    this._scene   = scene;
    this._canvas  = document.createElement('canvas');
    this._canvas.width  = 320;
    this._canvas.height = 320;
    this._canvas.style.cssText = 'width:100%;height:100%;display:block;';
    container.appendChild(this._canvas);

    try {
      this._renderer = new THREE.WebGLRenderer({
        canvas:     this._canvas,
        antialias:  false,
        alpha:      true,
        powerPreference: 'low-power',
        precision: 'lowp',
      });
      this._renderer.setPixelRatio(1);
      this._renderer.setSize(320, 320, false);
      this._renderer.setClearColor(0x0d0d0f, 1);
    } catch (err) {
      console.warn('[PIPRenderer] WebGL context creation failed:', err);
      this._showFallback(container);
      return;
    }

    const frustum = 50;
    this._camera = new THREE.OrthographicCamera(-frustum, frustum, frustum, -frustum, 0.1, 1000);
    this._camera.position.set(0, 200, 0);
    this._camera.lookAt(0, 0, 0);

    this._wireMat = new THREE.MeshBasicMaterial({ color: 0x8b5cf6, wireframe: true });

    this._startLoop();
    console.log('[PIPRenderer] Mounted — sharing scene read-only');
  }

  /** Pan the PIP camera to look at a 3D world position. */
  focusPoint(center: THREE.Vector3): void {
    if (!this._camera) return;
    this._camera.position.set(center.x, center.y + 200, center.z);
    this._camera.lookAt(center);
  }

  /** Clean up GPU resources — call when F3 mode exits or the panel is destroyed. */
  dispose(): void {
    this._stopLoop();

    if (this._scene && this._prevOverride !== undefined) {
      this._scene.overrideMaterial = this._prevOverride;
    }
    this._prevOverride = null;

    this._wireMat?.dispose();
    this._wireMat = null;

    this._renderer?.dispose();
    this._renderer = null;

    if (this._canvas?.parentElement) {
      this._canvas.parentElement.removeChild(this._canvas);
    }
    this._canvas = null;
    this._scene  = null;
    this._camera = null;

    console.log('[PIPRenderer] Disposed');
  }

  // ── Render loop ────────────────────────────────────────────────────────────

  private _startLoop(): void {
    // D.7.5 batch #4: continuous render tick driven by FrameScheduler.
    // The scheduler re-invokes the callback every frame; no manual reschedule.
    this._animId = getFrameScheduler().addTickListener(
      'pip-renderer-loop',
      () => this._render(),
      'render',
    );
  }

  private _stopLoop(): void {
    // D.7.5 batch #4: dispose the FrameScheduler tick listener.
    if (this._animId !== null) {
      this._animId();
      this._animId = null;
    }
  }

  private _render(): void {
    if (!this._renderer || !this._camera || !this._scene) return;

    const prev = this._scene.overrideMaterial;
    this._scene.overrideMaterial = this._wireMat;

    try {
      this._renderer.render(this._scene, this._camera);
    } catch {
      // Silently ignore render errors (e.g. context loss)
    }

    this._scene.overrideMaterial = prev;
  }

  // ── Fallback ───────────────────────────────────────────────────────────────

  private _showFallback(container: HTMLElement): void {
    const msg = document.createElement('div');
    msg.style.cssText = 'display:flex;align-items:center;justify-content:center;height:100%;color:var(--app-text-muted);font-size:11px;text-align:center;padding:8px;';
    msg.textContent = 'PIP unavailable (WebGL context limit)';
    container.appendChild(msg);
  }
}
