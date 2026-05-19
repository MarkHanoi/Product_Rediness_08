/**
 * @file src/ui/ViewCube.ts
 * @description Phase 1.2 — Navigation HUD (ViewCube) — Robust rewrite
 *
 * A plain DOM + CSS 3D-transform ViewCube positioned in the top-right corner.
 *
 * DESIGN PRINCIPLES
 * ─────────────────
 * 1. Zero @thatopen/components dependency — only THREE.js for quaternion math.
 * 2. Camera is resolved via getter on every rAF tick so the cube tracks through
 *    OBC projection switches (PerspectiveCamera ↔ OrthographicCamera).
 * 3. Active face is kept in sync with the 'view-activated' window event so the
 *    lit face always reflects the current view, even when changed from outside
 *    (ViewsRailPanel, keyboard shortcuts, etc.).
 * 4. Singleton guard — a second mount replaces the first instead of doubling up.
 * 5. RAF loop is guarded against throws during view transitions.
 * 6. destroy() fully cleans up: cancels RAF, removes event listeners, removes
 *    the element from the DOM.
 *
 * CONTRACT §05:
 *   - CSS prefix vc- (registered in dockingSystem.ts / AppTheme.ts)
 *   - All CSS lives in VIEW_CUBE_STYLES exported from dockingSystem.ts
 *   - Zero independent <style> injection
 *
 * CONTRACT §01:
 *   - Read-only; does NOT mutate any BIM store.
 *   - Camera repositioning is delegated to ViewController.activate().
 *
 * FACE → MODE MAPPING  (must stay in sync with ViewController.activate() router)
 * ────────────────────
 *   TOP    → 'Top'    → _activateFloorPlanView
 *   FRONT  → 'Front'  → _activateElevationView
 *   BACK   → 'Back'   → _activateElevationView
 *   LEFT   → 'Left'   → _activateElevationView
 *   RIGHT  → 'Right'  → _activateElevationView
 *   3D     → '3D'     → _activate3DView          (bottom face = return to 3D)
 */

import * as THREE from '@pryzm/renderer-three/three';
import { getFrameScheduler, type TickListenerDisposer } from '@pryzm/frame-scheduler';

/** Face descriptor */
interface FaceDef {
    /** Text shown on the face */
    label: string;
    /** CSS modifier class (vc-face--<cls>) for face positioning */
    cls: string;
    /** ViewMode string sent to ViewController.activate() */
    mode: string;
    /** ARIA description */
    aria: string;
}

const FACES: FaceDef[] = [
    { label: 'TOP',   cls: 'top',    mode: 'Top',   aria: 'Top view (floor plan)'    },
    { label: '3D',    cls: 'bottom', mode: '3D',    aria: 'Return to 3D perspective'  },
    { label: 'FRONT', cls: 'front',  mode: 'Front', aria: 'Front elevation view'      },
    { label: 'BACK',  cls: 'back',   mode: 'Back',  aria: 'Back elevation view'       },
    { label: 'LEFT',  cls: 'left',   mode: 'Left',  aria: 'Left elevation view'       },
    { label: 'RIGHT', cls: 'right',  mode: 'Right', aria: 'Right elevation view'      },
];

export class ViewCube {
    // ── Singleton guard ────────────────────────────────────────────────────
    private static _current: ViewCube | null = null;

    /**
     * Factory: mount a ViewCube on document.body, destroying any prior instance
     * so only one cube is ever present in the DOM.
     */
    static mountOrReplace(
        getCamera: () => THREE.Camera,
        viewController?: any,
        runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null,
    ): ViewCube {
        ViewCube._current?.destroy();
        const cube = new ViewCube(getCamera, viewController, runtime);
        document.body.appendChild(cube.element);
        ViewCube._current = cube;
        return cube;
    }

    // ── Instance state ─────────────────────────────────────────────────────
    private readonly _el:   HTMLElement;
    private readonly _cube: HTMLElement;
    private readonly _buttons: Map<string, HTMLButtonElement> = new Map();
    // D.7.5 batch #5: rAF handle replaced by FrameScheduler disposer.
    private _rafId: TickListenerDisposer | null = null;
    private _unsubViewActivated: (() => void) | null = null; // F.events.8
    private _unsubWorkspaceMode: (() => void) | null = null;

    /**
     * @param _getCamera     — Getter called on every rAF tick.
     *                         Must return the currently active THREE.Camera.
     *                         The OBC wrapper returns different instances for
     *                         perspective vs orthographic — this getter handles that.
     * @param _viewController — ViewController.activate() is called on face clicks.
     *                          Optional: absent → clicks are silent no-ops.
     */
    /** Phase B.11 (S73-WIRE) — runtime threaded by parent (Layout.ts via mountOrReplace). */
    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;

    constructor(
        private readonly _getCamera:       () => THREE.Camera,
        private readonly _viewController?: any,
        runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null,
    ) {
        this.runtime = runtime;
        // F.5.2 Wave 14 — runtime.scene wiring.
        // Reads runtime.scene.renderer to confirm the renderer slot is available
        // once the canvas is mounted; Phase D.4 replaces window.world references.
        if (runtime) {
            const _rendererReady = runtime.scene.renderer !== null;
            console.debug('[ViewCube] Wave 14 runtime.scene wired, renderer ready:', _rendererReady);
        }
        this._cube = this._createCubeEl();
        this._el   = this._createRootEl();

        // Sync active face from any view-activated event (internal OR external).
        // F.events.8 — migrated to runtime.events typed bus.
        this._unsubViewActivated = window.runtime?.events?.on('view-activated', (payload: unknown) => {
            const mode = (payload as { mode?: string })?.mode;
            if (mode) this._setActive(mode);
        }) ?? null;

        // §05 §8 — hide in inspect / data workspace modes.
        // WorkspaceController dispatches 'pryzm-workspace-mode' { detail: { mode } }
        // on every mode transition. We apply immediately and also sync the initial
        // mode in case WorkspaceController ran before this cube was mounted.
        // F.events.6 — pryzm-workspace-mode migrated to runtime.events typed bus.
        // Uses window.runtime (globals.d.ts) so on() returns () => void (not Disposable).
        this._unsubWorkspaceMode = window.runtime?.events?.on('pryzm-workspace-mode', (payload: unknown) => {
            const mode = (payload as { mode?: string })?.mode;
            if (mode) this._applyModeVisibility(mode);
        }) ?? null;

        // Catch-up: apply the mode that WorkspaceController may have already set.
        const currentMode = window.workspaceController?.getMode?.() as string | undefined; // TODO(D.4): replace with runtime.scene.workspaceController — Phase D.4
        if (currentMode) this._applyModeVisibility(currentMode);

        // Shift cube left when the right sub-panel (tpr-panel) opens/closes.
        // Reads the actual panel bounding rect so it stays correct regardless
        // of user-resized panel width.
        window.addEventListener('tpr-rail-toggled', (e: Event) => {
            const open = (e as CustomEvent<{ open: boolean }>).detail?.open;
            if (open) {
                const tprPanel = document.querySelector('.tpr-panel') as HTMLElement | null;
                if (tprPanel) {
                    const rect = tprPanel.getBoundingClientRect();
                    // Position cube just to the left of the tpr-panel with a 12px gap.
                    this._el.style.right = `${window.innerWidth - rect.left + 12}px`;
                } else {
                    this._el.style.right = '244px';
                }
            } else {
                this._el.style.right = '80px';
            }
        });

        this._startLoop();
    }

    /** The root DOM element. */
    get element(): HTMLElement { return this._el; }

    /**
     * Stop the RAF loop, remove event listeners, and detach from the DOM.
     * Call this before discarding the instance.
     */
    destroy(): void {
        // D.7.5 batch #5: dispose the FrameScheduler tick listener.
        if (this._rafId !== null) {
            this._rafId();
            this._rafId = null;
        }
        this._unsubViewActivated?.(); // F.events.8
        this._unsubViewActivated = null;
        // F.events.6 — pryzm-workspace-mode migrated to runtime.events typed bus.
        this._unsubWorkspaceMode?.();
        this._unsubWorkspaceMode = null;
        this._el.remove();
        if (ViewCube._current === this) ViewCube._current = null;
    }

    // ── Private ─────────────────────────────────────────────────────────────

    /**
     * Show or hide the cube based on workspace mode.
     * Hidden in 'inspect' and 'data' modes; visible in 'author'.
     * Uses inline display (same pattern WorkspaceController uses for #container).
     */
    private _applyModeVisibility(mode: string): void {
        this._el.style.display = (mode === 'inspect' || mode === 'data') ? 'none' : '';
    }

    private _createCubeEl(): HTMLElement {
        const cube = document.createElement('div');
        cube.className = 'vc-cube';

        for (const face of FACES) {
            const btn = document.createElement('button');
            btn.type         = 'button';
            btn.className    = `vc-face vc-face--${face.cls}`;
            btn.textContent  = face.label;
            btn.title        = face.aria;
            btn.setAttribute('aria-label', face.aria);
            btn.setAttribute('aria-pressed', face.mode === '3D' ? 'true' : 'false');
            btn.addEventListener('click', () => this._navigate(face.mode));
            this._buttons.set(face.mode, btn);
            cube.appendChild(btn);
        }

        return cube;
    }

    private _createRootEl(): HTMLElement {
        const root = document.createElement('div');
        root.className = 'vc-root';
        root.setAttribute('aria-label', 'View navigation cube');
        root.setAttribute('role', 'navigation');
        root.appendChild(this._cube);
        return root;
    }

    /** Highlight the face whose mode matches, clear all others. */
    private _setActive(mode: string): void {
        for (const [m, btn] of this._buttons) {
            const isActive = m === mode;
            btn.classList.toggle('vc-face--active', isActive);
            btn.setAttribute('aria-pressed', String(isActive));
        }
    }

    private _navigate(mode: string): void {
        if (!this._viewController) return;
        try {
            this._viewController.activate(mode);
        } catch (err) {
            console.warn('[ViewCube] navigate error:', err);
        }
    }

    /**
     * rAF loop — reads camera.quaternion and applies the inverse rotation to
     * the cube element as a CSS matrix3d().
     *
     * MATH:
     *   q   = camera.quaternion.inverse()  → cube should rotate opposite to camera
     *   R   = makeRotationFromQuaternion(q) → 3×3 rotation matrix (column-major)
     *
     *   Three.js is right-handed Y-up; CSS 3D is left-handed Y-down.
     *   To convert: R_css = flip_y · R · flip_y
     *   where flip_y = diag(1, -1, 1).
     *
     *   For a pure rotation matrix R_css[i][j] = flip[i] · R[i][j] · flip[j],
     *   flip[0]=1, flip[1]=-1, flip[2]=1.
     *
     *   In column-major layout (mat.elements[col*4 + row]):
     *     col 0 (e[0],e[1],e[2]): negate e[1]
     *     col 1 (e[4],e[5],e[6]): negate e[4] and e[6]
     *     col 2 (e[8],e[9],e[10]): negate e[9]
     *
     *   CSS matrix3d takes column-major: (col0, col1, col2, col3).
     */
    private _startLoop(): void {
        const q    = new THREE.Quaternion();
        const mat  = new THREE.Matrix4();
        const cube = this._cube;

        // D.7.5 batch #5: continuous tick driven by FrameScheduler.
        // The scheduler re-invokes the callback every frame; no manual reschedule.
        // The original try/catch early-out is preserved — on a camera swap the
        // tick simply returns and the scheduler invokes us again next frame.
        const tick = () => {
            try {
                // Resolve active camera on every tick — OBC may swap camera
                // instances when switching between perspective and orthographic.
                q.copy(this._getCamera().quaternion).invert();
            } catch {
                // Camera not yet ready or undergoing a projection switch —
                // skip this frame, the loop continues next tick.
                return;
            }

            mat.makeRotationFromQuaternion(q);
            const e = mat.elements;

            // Build the Y-flipped CSS matrix3d (column-major).
            cube.style.transform = (
                `matrix3d(` +
                ` ${ e[0] },${ -e[1] },${ e[2] },0,` +
                ` ${ -e[4] },${ e[5] },${ -e[6] },0,` +
                ` ${ e[8] },${ -e[9] },${ e[10] },0,` +
                ` 0,0,0,1)`
            );
        };

        this._rafId = getFrameScheduler().addTickListener(
            'view-cube-rotation',
            tick,
            'overlay',
        );
    }
}
