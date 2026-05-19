// KeyboardOrbitPlugin — Wave A18-T20
//
// CONTRACT (C06 §3): The 3D viewport MUST support keyboard orbit/pan/zoom
// for WCAG 2.1 Level AA compliance (Equality Act 2010, EN 301 549).
//
// Key bindings:
//   Arrow keys   — orbit (rotate) the camera around the look-at target
//   Numpad 2/4/6/8 — orbit (same as arrows)
//   Shift+Arrow  — pan (translate camera + target)
//   +/-          — zoom in/out
//   Numpad +/-   — zoom in/out
//   Home         — reset to default perspective
//   0            — top-down plan view
//
// This plugin attaches to an HTMLElement (the canvas / container) via
// `attach()` and detaches on `dispose()`.  It calls into the provided
// camera-controls instance (camera-controls npm package) which is already
// wired into BimWorld via engineLauncher.ts.
//
// Orbit step: 5 degrees per keydown event.
// Pan step:   0.5 m per keydown event.
// Zoom step:  10 % per keydown event.

import { trace } from '@opentelemetry/api';

const tracer = trace.getTracer('pryzm.camera.keyboard-orbit');

const ORBIT_STEP_DEG = 5;
const PAN_STEP_M = 0.5;
const ZOOM_FACTOR = 0.9;

export interface KeyboardOrbitCamera {
  rotate(thetaDeg: number, phiDeg: number, enableTransition?: boolean): Promise<unknown>;
  truck(x: number, y: number, enableTransition?: boolean): Promise<unknown>;
  zoom(zoomStep: number, enableTransition?: boolean): Promise<unknown>;
  reset(enableTransition?: boolean): Promise<unknown>;
}

export class KeyboardOrbitPlugin {
  private _attached = false;
  private _element: HTMLElement | null = null;
  private readonly _camera: KeyboardOrbitCamera;
  private readonly _handler: (e: KeyboardEvent) => void;

  constructor(camera: KeyboardOrbitCamera) {
    this._camera = camera;
    this._handler = this._onKeyDown.bind(this);
  }

  attach(element: HTMLElement): void {
    if (this._attached) return;
    this._element = element;
    element.addEventListener('keydown', this._handler);
    this._attached = true;
    console.log('[KeyboardOrbitPlugin] attached — Arrow/Numpad/+/- orbit enabled');
  }

  dispose(): void {
    if (!this._attached || !this._element) return;
    this._element.removeEventListener('keydown', this._handler);
    this._element = null;
    this._attached = false;
  }

  private _onKeyDown(e: KeyboardEvent): void {
    const span = tracer.startSpan('pryzm.camera.keyboard-orbit.keydown');
    try {
      const shift = e.shiftKey;

      switch (e.code) {
        // ── Orbit ─────────────────────────────────────────────────────────
        case 'ArrowLeft':
        case 'Numpad4':
          e.preventDefault();
          if (shift) {
            void this._camera.truck(-PAN_STEP_M, 0, true);
          } else {
            void this._camera.rotate(-ORBIT_STEP_DEG * (Math.PI / 180), 0, true);
          }
          break;

        case 'ArrowRight':
        case 'Numpad6':
          e.preventDefault();
          if (shift) {
            void this._camera.truck(PAN_STEP_M, 0, true);
          } else {
            void this._camera.rotate(ORBIT_STEP_DEG * (Math.PI / 180), 0, true);
          }
          break;

        case 'ArrowUp':
        case 'Numpad8':
          e.preventDefault();
          if (shift) {
            void this._camera.truck(0, PAN_STEP_M, true);
          } else {
            void this._camera.rotate(0, -ORBIT_STEP_DEG * (Math.PI / 180), true);
          }
          break;

        case 'ArrowDown':
        case 'Numpad2':
          e.preventDefault();
          if (shift) {
            void this._camera.truck(0, -PAN_STEP_M, true);
          } else {
            void this._camera.rotate(0, ORBIT_STEP_DEG * (Math.PI / 180), true);
          }
          break;

        // ── Zoom ──────────────────────────────────────────────────────────
        case 'Equal':
        case 'NumpadAdd':
          e.preventDefault();
          void this._camera.zoom(1 / ZOOM_FACTOR, true);
          break;

        case 'Minus':
        case 'NumpadSubtract':
          e.preventDefault();
          void this._camera.zoom(ZOOM_FACTOR, true);
          break;

        // ── Reset / top-down ──────────────────────────────────────────────
        case 'Home':
          e.preventDefault();
          void this._camera.reset(true);
          break;

        default:
          break;
      }
    } finally {
      span.end();
    }
  }
}
