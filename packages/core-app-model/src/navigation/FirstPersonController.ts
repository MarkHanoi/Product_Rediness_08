/**
 * @file src/core/navigation/FirstPersonController.ts
 * @description First-person walkthrough controller for PRYZM.
 *
 * CONTRACT compliance (05-BIM-UI-ARCHITECTURE-CONTRACT):
 *  - Operates exclusively on the Three.js/OBC projection layer.
 *  - Does NOT read or write any ElementStore or semantic model.
 *  - Does NOT use bim-* web components (§7.8).
 *  - Purely additive; does not modify any existing navigation code.
 *  - Exposes activate() / deactivate() toggle surface.
 *  - Dispatches 'fw-mode-changed' CustomEvent on window so UI can react.
 *
 * KEY BUG FIXES (walk mode was silently doing nothing):
 *  1. _applyPose() now calls controls.update(0) after setLookAt().
 *     Without this, setLookAt() updates the camera-controls internal state
 *     but it is NEVER transferred to the THREE.Camera — camera doesn't move.
 *     Every other setLookAt() call in this codebase does controls.update(0).
 *  2. activate() now switches the OBC camera to Perspective projection first,
 *     mirroring what the Pascal editor's setFirstPersonMode() does.
 *  3. Pitch is reset to 0 on activation so the user always starts looking
 *     horizontally, not straight down from a top/ortho view.
 *  4. Crosshair + ESC overlay are added for clear visual feedback.
 *
 * Robustness improvements:
 *  1. Accepts OBC OrthoPerspectiveCamera — reads .three and .controls fresh
 *     every frame so refs are never stale after a projection-type change.
 *  2. Dual mouse-look: pointer lock (preferred) + pointer-drag fallback for
 *     sandboxed iframes where requestPointerLock() is blocked.
 *  3. ESC deactivates from any state.
 *  4. Key guard: ignores keydown from editable targets.
 *  5. Q = fly up, E = fly down (matches Pascal editor).
 */

import * as THREE from '@pryzm/renderer-three/three';
import * as OBC from '@thatopen/components';
// §SCC-NO-SELF-BARREL — relative import, NOT the package barrel (see
// presentation/ViewRangeIntentResolver.ts for the measurement).
import { unifiedFrameLoop } from '../rendering/UnifiedFrameLoop';
import { publishWalkPose } from './WalkPoseBeacon.js';

// ── Constants ────────────────────────────────────────────────────────────────

const EYE_HEIGHT        = 1.7;
const WALK_SPEED        = 3.5;
const SPRINT_MULTIPLIER = 2.5;
const MOUSE_SENSITIVITY = 0.002;
const PITCH_LIMIT       = (85 * Math.PI) / 180;
const LOOK_DIST         = 50;

// ── Types ─────────────────────────────────────────────────────────────────────

interface Keys {
    forward:  boolean;
    backward: boolean;
    left:     boolean;
    right:    boolean;
    up:       boolean;
    down:     boolean;
    sprint:   boolean;
}

const RESET_KEYS: Keys = {
    forward: false, backward: false,
    left: false,    right: false,
    up: false,      down: false,
    sprint: false,
};

// ── Main class ────────────────────────────────────────────────────────────────

export class FirstPersonController {
    private _obcCamera:  OBC.OrthoPerspectiveCamera;
    private _domElement: HTMLElement;

    private _active        = false;
    private _activating    = false;
    private _pointerLocked = false;

    private _yaw      = 0;
    private _pitch    = 0;
    private _position = new THREE.Vector3();

    private _keys: Keys = { ...RESET_KEYS };

    private _floorY = 0;
    private _activeLevelId: string | null = null;
    /** §WALK-DISARMS-THE-GIZMO — `transformControls.enabled` as found on entry, restored on exit. */
    private _gizmoWasEnabled: boolean | null = null;
    private _lastDiagLog = 0;
    private _unregisterTick: (() => void) | null = null;

    private _dragActive  = false;
    private _lastMouseX  = 0;
    private _lastMouseY  = 0;

    private _crosshair:     HTMLElement | null = null;
    private _escHint:       HTMLElement | null = null;

    private readonly _onKeyDown:           (e: KeyboardEvent) => void;
    private readonly _onKeyUp:             (e: KeyboardEvent) => void;
    private readonly _onMouseMove:         (e: MouseEvent)    => void;
    private readonly _onPointerLockChange: ()                 => void;
    private readonly _onPointerLockError:  ()                 => void;
    private readonly _onCanvasClick:       (e: MouseEvent)    => void;
    private readonly _onPointerDown:       (e: PointerEvent)  => void;
    private readonly _onPointerMove:       (e: PointerEvent)  => void;
    private readonly _onPointerUp:         (e: PointerEvent)  => void;
    private readonly _onWindowBlur:        ()                 => void;
    private readonly _onActiveLevelChanged:(e: Event)         => void;

    constructor(
        obcCamera:  OBC.OrthoPerspectiveCamera,
        domElement: HTMLElement,
        _scene:     THREE.Scene,
    ) {
        this._obcCamera  = obcCamera;
        this._domElement = domElement;

        this._onKeyDown           = this._handleKeyDown.bind(this);
        this._onKeyUp             = this._handleKeyUp.bind(this);
        this._onMouseMove         = this._handleMouseMove.bind(this);
        this._onPointerLockChange = this._handlePointerLockChange.bind(this);
        this._onPointerLockError  = this._handlePointerLockError.bind(this);
        this._onCanvasClick       = this._handleCanvasClick.bind(this);
        this._onPointerDown       = this._handlePointerDown.bind(this);
        this._onPointerMove       = this._handlePointerMove.bind(this);
        this._onPointerUp         = this._handlePointerUp.bind(this);
        this._onWindowBlur        = this._handleWindowBlur.bind(this);
        this._onActiveLevelChanged = this._handleActiveLevelChanged.bind(this);
    }

    // ── Public API ────────────────────────────────────────────────────────────

    get active(): boolean { return this._active; }

    async activate(): Promise<void> {
        if (this._active || this._activating) return;
        this._activating = true;

        console.log('[FPC] Walk mode activating…');

        // ── Step 1: Ensure Perspective projection ─────────────────────────────
        // The Pascal editor always forces perspective + 3D mode before entering
        // first-person. Without this, walk mode in orthographic top view shows
        // nothing because setLookAt() operates on the wrong camera/frustum.
        try {
            const proj = (this._obcCamera as any).projection;
            if (proj && typeof proj.set === 'function') {
                const isPerspective = (this._obcCamera as any).projectionType === 'Perspective'
                    || (this._obcCamera as any)._currentProjection === 'Perspective'
                    || (this._obcCamera.three instanceof THREE.PerspectiveCamera);
                if (!isPerspective) {
                    console.log('[FPC] Switching to Perspective projection…');
                    await proj.set('Perspective');
                    console.log('[FPC] Perspective projection active.');
                } else {
                    console.log('[FPC] Already in Perspective projection.');
                }
            }
        } catch (err) {
            console.warn('[FPC] Projection switch failed (non-fatal):', err);
        }

        // ── Step 2: Seed position and look angles ─────────────────────────────
        // Read camera AFTER the projection switch — the THREE.Camera ref may
        // have been recreated by projection.set('Perspective').
        const camera   = this._obcCamera.three;
        const controls = this._obcCamera.controls;

        this._position.copy(camera.position);

        // Always plant the user at EYE_HEIGHT (1.7m) above the *active level's*
        // elevation, not above world Y=0.  This matches how the user thinks
        // about Walk Mode: "drop me on the active floor at eye height".
        const floorY = this._getActiveLevelElevation();
        this._floorY = floorY;
        // §WALK-POSITION-ON-PLAN — the plan pane draws ONE storey, so the marker
        // needs to know which storey the walker is on, not only how high he is.
        this._activeLevelId = this._readActiveLevelId();
        this._position.y = floorY + EYE_HEIGHT;
        console.log(`[FPC] Eye seeded at Y=${this._position.y.toFixed(3)} (level elevation ${floorY.toFixed(3)} + eye ${EYE_HEIGHT}).`);

        // Sync yaw from the camera's current heading but ALWAYS reset pitch to
        // horizontal. If the user was in top view the pitch would be -90° which
        // makes walk mode look straight down — useless.
        this._syncYawFromCamera(camera);
        this._pitch = 0;

        // ── Step 3: Disable user input on camera-controls ─────────────────────
        controls.enabled = false;

        // ── Step 3b: Disarm the transform gizmo (§WALK-DISARMS-THE-GIZMO) ─────
        // The orbit controls were disabled above; the gizmo is the sibling input
        // consumer that was forgotten. Under pointer lock three's TransformControls
        // is broken twice over: `getPointer()` returns NDC (0,0) for every event,
        // so a drag operates at screen-centre regardless of the mouse; and its
        // `onPointerDown` guard reads `document.pointerLockElement`, which Chrome
        // reports as `null` while a lock is PENDING even though the browser
        // already refuses `setPointerCapture` — the founder's
        // `Uncaught InvalidStateError: Failed to execute 'setPointerCapture'`.
        // Disabling it makes `onPointerDown` return at its first line, before the
        // capture call, closing every timing window at once.
        this._setGizmoEnabled(false);

        // ── Step 4: Apply pose immediately ───────────────────────────────────
        // CRITICAL: _applyPose() now calls controls.update(0) after setLookAt().
        // Without that call the THREE.Camera position is never actually updated.
        this._applyPose();

        // ── Step 5: Build static collision geometry ───────────────────────────

        // ── Step 6: Register per-frame tick (pre-render priority) ─────────────
        this._unregisterTick = unifiedFrameLoop.addTickListener({
            id:       'first-person-controller',
            priority: 'pre-render',
            callback: (deltaMs) => {
                if (!this._active) return;
                this._update(Math.min(deltaMs / 1000, 0.1));
            },
        });

        // ── Step 6b: Follow the active level ──────────────────────────────────
        // §WALK-CAMERA-FOLLOWS-THE-LEVEL.  `activeLevelChanged` is the SAME
        // window CustomEvent that `LevelPlanViewBinder` and `engineLauncher`
        // already consume (it is dispatched by `ProjectContext.emit()`), NOT a
        // parallel signal — if the walk camera listened to something else the
        // two split panes would drift apart on every storey change.
        //
        // The subscription is deliberately scoped to the active session: it is
        // added here and removed in `deactivate()`, so OUTSIDE walk mode this
        // controller changes nothing and the orbit camera keeps the behaviour
        // `engineLauncher` has always given it.
        window.addEventListener('activeLevelChanged', this._onActiveLevelChanged);

        // ── Step 7: Wire input events ─────────────────────────────────────────
        // Listen on BOTH window and document in capture phase so we receive
        // keydown before any other handler in the app (and before the browser
        // does its default arrow-key page-scroll behaviour).
        window.addEventListener('keydown',   this._onKeyDown, { capture: true });
        window.addEventListener('keyup',     this._onKeyUp,   { capture: true });
        document.addEventListener('keydown', this._onKeyDown, { capture: true });
        document.addEventListener('keyup',   this._onKeyUp,   { capture: true });
        window.addEventListener('blur', this._onWindowBlur);

        document.addEventListener('pointerlockchange', this._onPointerLockChange);
        document.addEventListener('pointerlockerror',  this._onPointerLockError);

        this._domElement.addEventListener('click',       this._onCanvasClick);
        this._domElement.addEventListener('pointerdown', this._onPointerDown);
        this._domElement.addEventListener('pointermove', this._onPointerMove);
        this._domElement.addEventListener('pointerup',   this._onPointerUp);

        if (this._domElement.tabIndex < 0) this._domElement.tabIndex = 0;
        this._domElement.focus({ preventScroll: true });

        // ── Step 8: Show crosshair + ESC hint overlay ─────────────────────────
        this._showHUD();

        this._active     = true;
        this._activating = false;

        window.dispatchEvent(new CustomEvent('fw-mode-changed', { detail: { active: true } })); // TODO(TASK-15)
        console.log('[FPC] Walk mode active — click the viewport to enable full mouse look.');
    }

    deactivate(): void {
        if (!this._active) return;
        this._active        = false;
        this._activating    = false;
        this._pointerLocked = false;
        this._dragActive    = false;
        console.log('[FPC] Walk mode deactivating…');

        this._unregisterTick?.();
        this._unregisterTick = null;

        window.removeEventListener('keydown',   this._onKeyDown, { capture: true } as EventListenerOptions);
        window.removeEventListener('keyup',     this._onKeyUp,   { capture: true } as EventListenerOptions);
        document.removeEventListener('keydown', this._onKeyDown, { capture: true } as EventListenerOptions);
        document.removeEventListener('keyup',   this._onKeyUp,   { capture: true } as EventListenerOptions);
        window.removeEventListener('blur', this._onWindowBlur);
        window.removeEventListener('mousemove', this._onMouseMove);
        window.removeEventListener('activeLevelChanged', this._onActiveLevelChanged);

        document.removeEventListener('pointerlockchange', this._onPointerLockChange);
        document.removeEventListener('pointerlockerror',  this._onPointerLockError);

        this._domElement.removeEventListener('click',       this._onCanvasClick);
        this._domElement.removeEventListener('pointerdown', this._onPointerDown);
        this._domElement.removeEventListener('pointermove', this._onPointerMove);
        this._domElement.removeEventListener('pointerup',   this._onPointerUp);

        if (document.pointerLockElement) {
            try { document.exitPointerLock(); } catch { /* non-fatal */ }
        }

        try { this._obcCamera.controls.enabled = true; } catch { /* non-fatal */ }
        this._restoreGizmoEnabled();

        this._keys = { ...RESET_KEYS };
        // §WALK-POSITION-ON-PLAN — retract the beacon. A stale pose would leave a
        // purple dot frozen on the plan after the user stopped walking, which reads
        // as "he is standing there" and is false.
        publishWalkPose(null);

        this._removeHUD();

        window.dispatchEvent(new CustomEvent('fw-mode-changed', { detail: { active: false } })); // TODO(TASK-15)
        console.log('[FPC] Walk mode inactive.');
    }

    // ── Per-frame update ──────────────────────────────────────────────────────

    private _update(delta: number): void {
        const speed = WALK_SPEED * (this._keys.sprint ? SPRINT_MULTIPLIER : 1);

        const fwd   = this._getForwardXZ();
        const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();

        const move = new THREE.Vector3();
        if (this._keys.forward)  move.addScaledVector(fwd,    1);
        if (this._keys.backward) move.addScaledVector(fwd,   -1);
        if (this._keys.right)    move.addScaledVector(right,  1);
        if (this._keys.left)     move.addScaledVector(right, -1);

        const anyMoveKey = move.lengthSq() > 0 || this._keys.up || this._keys.down;

        if (move.lengthSq() > 0) {
            move.normalize().multiplyScalar(speed * delta);
            // No-collision free walk — mirrors the Pascal editor reference
            // (`camera.position.add(_moveVector)`).  The previous AABB collision
            // check produced false positives (the spawn point is often inside
            // an oversized scene-AABB box, which blocked all horizontal motion).
            this._position.x += move.x;
            this._position.z += move.z;
        }

        if      (this._keys.up)   this._position.y += speed * delta;
        else if (this._keys.down) this._position.y -= speed * delta;
        // Keep camera above a minimum of eye height above the *active* floor.
        const minY = this._floorY + EYE_HEIGHT;
        if (this._position.y < minY) this._position.y = minY;

        this._applyPose();

        // Diagnostic: log once per second while a key is down so we can confirm
        // _update is firing AND _keys is being read correctly AND the camera
        // position is actually changing on the THREE camera.
        if (anyMoveKey) {
            const now = performance.now();
            if (now - this._lastDiagLog > 500) {
                this._lastDiagLog = now;
                const cam = this._obcCamera.three;
                console.log(
                    `[FPC tick] keys F=${this._keys.forward} B=${this._keys.backward} L=${this._keys.left} R=${this._keys.right} U=${this._keys.up} D=${this._keys.down} | ` +
                    `intPos=(${this._position.x.toFixed(2)}, ${this._position.y.toFixed(2)}, ${this._position.z.toFixed(2)}) | ` +
                    `camPos=(${cam.position.x.toFixed(2)}, ${cam.position.y.toFixed(2)}, ${cam.position.z.toFixed(2)}) | dt=${delta.toFixed(3)}`
                );
            }
        }
    }

    // ── Pose application ──────────────────────────────────────────────────────

    /**
     * Writes the new pose DIRECTLY to the THREE.Camera (position + quaternion),
     * mirroring the Pascal editor's first-person controller.
     *
     * Why not go through camera-controls?  The library uses time-based smoothing
     * (`smoothTime`, `draggingSmoothTime`).  Even when `setLookAt(..., false)`
     * is called with enableTransition=false, the actual position/target are
     * only applied to the THREE camera inside `update(delta)` — and only
     * proportionally to `delta`.  Calling `update(0)` therefore moves the
     * camera 0% toward the new pose, so the avatar stays frozen no matter how
     * many keys are pressed.  The cleanest fix is to bypass controls entirely
     * while in Walk Mode and drive the camera ourselves; on deactivation we
     * resync the controls back to the live camera transform.
     */
    private _applyPose(): void {
        const camera = this._obcCamera.three;
        const pos    = this._position;

        camera.position.set(pos.x, pos.y, pos.z);

        // YXZ Euler: yaw (Y) first, then pitch (X), no roll.
        const euler = new THREE.Euler(this._pitch, this._yaw, 0, 'YXZ');
        camera.quaternion.setFromEuler(euler);
        camera.updateMatrixWorld(true);

        // §WALK-POSITION-ON-PLAN — publish the pose for the plan pane's marker.
        // This is deliberately HERE and not in `_update()`: `_applyPose()` is the
        // single funnel through which every pose change passes, movement frames
        // and mouse-look deltas alike, so the marker cannot lag the camera.
        const dir = this._getForwardXZ();
        publishWalkPose({
            x: pos.x, y: pos.y, z: pos.z,
            dirX: dir.x, dirZ: dir.z,
            levelId: this._activeLevelId,
        });

        // Keep camera-controls' internal target in sync with our look direction
        // so when Walk Mode exits the orbit camera doesn't snap back wildly.
        try {
            const controls = this._obcCamera.controls;
            const lookDir  = this._getLookDirection();
            const target   = pos.clone().addScaledVector(lookDir, LOOK_DIST);
            controls.setLookAt(
                pos.x, pos.y, pos.z,
                target.x, target.y, target.z,
                false,
            );
        } catch {
            /* non-fatal — direct camera write is what actually moves the avatar */
        }
    }

    // ── Direction helpers ─────────────────────────────────────────────────────

    /**
     * World-space look direction derived from yaw + pitch using the same YXZ
     * Euler convention as `_applyPose()` (THREE camera looking down -Z by
     * default).  yaw=0 → -Z, yaw=+π/2 → -X.
     */
    private _getLookDirection(): THREE.Vector3 {
        const cp = Math.cos(this._pitch);
        return new THREE.Vector3(
            -Math.sin(this._yaw) * cp,
             Math.sin(this._pitch),
            -Math.cos(this._yaw) * cp,
        ).normalize();
    }

    /** XZ-plane forward (ignores pitch — used for WASD movement). */
    private _getForwardXZ(): THREE.Vector3 {
        return new THREE.Vector3(-Math.sin(this._yaw), 0, -Math.cos(this._yaw)).normalize();
    }

    /** Extracts yaw (heading) from the camera quaternion, ignoring pitch. */
    private _syncYawFromCamera(camera: THREE.Camera): void {
        const euler = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
        this._yaw   = euler.y;
    }

    // ── Mouse delta application ───────────────────────────────────────────────

    private _applyMouseDelta(dx: number, dy: number): void {
        this._yaw   -= dx * MOUSE_SENSITIVITY;
        this._pitch -= dy * MOUSE_SENSITIVITY;
        this._pitch  = THREE.MathUtils.clamp(this._pitch, -PITCH_LIMIT, PITCH_LIMIT);
        this._applyPose();
    }

    // ── HUD overlay ───────────────────────────────────────────────────────────

    private _showHUD(): void {
        // Crosshair
        const ch = document.createElement('div');
        ch.id = 'fpc-crosshair';
        ch.style.cssText = [
            'position:fixed',
            'top:50%',
            'left:50%',
            'transform:translate(-50%,-50%)',
            'pointer-events:none',
            'z-index:10000',
            'width:24px',
            'height:24px',
        ].join(';');
        ch.innerHTML = [
            '<div style="position:absolute;top:50%;left:0;width:100%;height:1px;',
            'background:rgba(255,255,255,0.75);transform:translateY(-50%);"></div>',
            '<div style="position:absolute;left:50%;top:0;height:100%;width:1px;',
            'background:rgba(255,255,255,0.75);transform:translateX(-50%);"></div>',
        ].join('');
        document.body.appendChild(ch);
        this._crosshair = ch;

        // ESC + click-to-look hint — top-right corner
        const hint = document.createElement('div');
        hint.id = 'fpc-esc-hint';
        hint.style.cssText = [
            'position:fixed',
            'top:16px',
            'right:16px',
            'z-index:10001',
            'background:rgba(0,0,0,0.55)',
            'color:#fff',
            'border-radius:10px',
            'padding:8px 14px',
            'font-size:12px',
            'font-family:system-ui,sans-serif',
            'pointer-events:none',
            'backdrop-filter:blur(8px)',
            'display:flex',
            'align-items:center',
            'gap:8px',
            'line-height:1.4',
            'white-space:nowrap',
        ].join(';');
        hint.innerHTML = this._buildHintHTML(false);
        document.body.appendChild(hint);
        this._escHint = hint;
    }

    private _buildHintHTML(locked: boolean): string {
        const kbdStyle = 'background:rgba(255,255,255,0.18);border-radius:4px;padding:1px 6px;font-size:11px;font-family:monospace;';
        if (locked) {
            return `<kbd style="${kbdStyle}">ESC</kbd><span>Exit Walk Mode</span>`;
        }
        return `<span>Click viewport to look around</span><span style="opacity:0.5;">|</span><kbd style="${kbdStyle}">ESC</kbd><span>Exit</span>`;
    }

    private _removeHUD(): void {
        this._crosshair?.remove();
        this._crosshair = null;
        this._escHint?.remove();
        this._escHint = null;
    }

    // ── Event handlers ────────────────────────────────────────────────────────

    private _handleMouseMove(e: MouseEvent): void {
        if (!this._active || !this._pointerLocked) return;
        this._applyMouseDelta(e.movementX, e.movementY);
    }

    private _handleCanvasClick(_e: MouseEvent): void {
        if (!this._active || this._pointerLocked) return;
        this._domElement.focus({ preventScroll: true });
        try { this._domElement.requestPointerLock(); } catch { /* non-fatal */ }
    }

    private _handlePointerDown(e: PointerEvent): void {
        if (!this._active || this._pointerLocked) return;
        this._dragActive = true;
        this._lastMouseX = e.clientX;
        this._lastMouseY = e.clientY;
        try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* non-fatal */ }
    }

    private _handlePointerMove(e: PointerEvent): void {
        if (!this._active || !this._dragActive || this._pointerLocked) return;
        const dx = e.clientX - this._lastMouseX;
        const dy = e.clientY - this._lastMouseY;
        this._lastMouseX = e.clientX;
        this._lastMouseY = e.clientY;
        if (dx !== 0 || dy !== 0) this._applyMouseDelta(dx, dy);
    }

    private _handlePointerUp(e: PointerEvent): void {
        this._dragActive = false;
        try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* non-fatal */ }
    }

    private _handlePointerLockChange(): void {
        if (document.pointerLockElement === this._domElement) {
            this._pointerLocked = true;
            this._dragActive    = false;
            window.addEventListener('mousemove', this._onMouseMove);
            if (this._escHint) this._escHint.innerHTML = this._buildHintHTML(true);
            console.log('[FPC] Pointer lock acquired — full FPS mouse look active.');
        } else {
            this._pointerLocked = false;
            window.removeEventListener('mousemove', this._onMouseMove);
            if (this._escHint) this._escHint.innerHTML = this._buildHintHTML(false);
            console.log('[FPC] Pointer lock released — drag-look fallback active.');
        }
    }

    private _handlePointerLockError(): void {
        this._pointerLocked = false;
        if (this._escHint) this._escHint.innerHTML = this._buildHintHTML(false);
        console.warn('[FPC] Pointer lock denied — drag-look fallback will be used instead.');
    }

    private _handleKeyDown(e: KeyboardEvent): void {
        if (!this._active) return;
        // Skip text-input fields, but ONLY when the pointer is not locked.
        // Once pointer lock is active, the user is unambiguously controlling
        // the avatar — we own all keys.
        if (!this._pointerLocked && this._isEditableTarget(e.target)) return;

        if (e.code === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            this.deactivate();
            return;
        }

        if (!this._isWalkKey(e.code)) return;
        if ((e.metaKey || e.ctrlKey || e.altKey) && e.code !== 'ShiftLeft' && e.code !== 'ShiftRight') return;

        // The same event fires twice (window capture, then document capture);
        // _setKey is idempotent so the second call is a no-op.  Log only the
        // first transition to keep the console quiet.
        const wasPressed = this._isKeyPressed(e.code);
        e.preventDefault();
        e.stopPropagation();
        this._setKey(e.code, true);
        if (!wasPressed) console.log(`[FPC] key down: ${e.code}`);
    }

    private _handleKeyUp(e: KeyboardEvent): void {
        if (!this._active) return;
        if (!this._isWalkKey(e.code)) return;
        e.preventDefault();
        e.stopPropagation();
        this._setKey(e.code, false);
    }

    private _handleWindowBlur(): void {
        this._keys = { ...RESET_KEYS };
        this._dragActive = false;
    }

    private _setKey(code: string, pressed: boolean): void {
        switch (code) {
            case 'KeyW': case 'ArrowUp':        this._keys.forward  = pressed; break;
            case 'KeyS': case 'ArrowDown':       this._keys.backward = pressed; break;
            case 'KeyA': case 'ArrowLeft':       this._keys.left     = pressed; break;
            case 'KeyD': case 'ArrowRight':      this._keys.right    = pressed; break;
            case 'KeyQ': case 'Space':           this._keys.up       = pressed; break;
            case 'KeyE':                         this._keys.down     = pressed; break;
            case 'ShiftLeft': case 'ShiftRight': this._keys.sprint   = pressed; break;
        }
    }

    private _isKeyPressed(code: string): boolean {
        switch (code) {
            case 'KeyW': case 'ArrowUp':         return this._keys.forward;
            case 'KeyS': case 'ArrowDown':       return this._keys.backward;
            case 'KeyA': case 'ArrowLeft':       return this._keys.left;
            case 'KeyD': case 'ArrowRight':      return this._keys.right;
            case 'KeyQ': case 'Space':           return this._keys.up;
            case 'KeyE':                         return this._keys.down;
            case 'ShiftLeft': case 'ShiftRight': return this._keys.sprint;
            default:                             return false;
        }
    }

    private _isWalkKey(code: string): boolean {
        switch (code) {
            case 'KeyW':
            case 'KeyA':
            case 'KeyS':
            case 'KeyD':
            case 'KeyQ':
            case 'KeyE':
            case 'ArrowUp':
            case 'ArrowDown':
            case 'ArrowLeft':
            case 'ArrowRight':
            case 'Space':
            case 'ShiftLeft':
            case 'ShiftRight':
                return true;
            default:
                return false;
        }
    }

    private _isEditableTarget(target: EventTarget | null): boolean {
        if (!(target instanceof HTMLElement)) return false;
        if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
        return target.isContentEditable;
    }

    /**
     * §WALK-CAMERA-FOLLOWS-THE-LEVEL — re-seat the eye when the active level
     * changes while Walk Mode is engaged.
     *
     * The plan pane already retargets itself on this event; before this handler
     * existed the 3-D walk camera did not, so a user who switched from Ground to
     * Level 1 kept walking at Y=1.70 on a storey whose slab is at 5.00 — the two
     * halves of split view showed different buildings.
     *
     * The user's height ABOVE the floor is preserved rather than reset to
     * EYE_HEIGHT, so someone who flew up with Q arrives at the same height over
     * the new storey.  The offset is floored at EYE_HEIGHT so arriving inside
     * the new slab is impossible — landing in the floor is worse than not
     * moving at all.
     *
     * Horizontal position is untouched: he stays over the same point in plan,
     * which is what the plan pane is still showing him.
     */
    private _handleActiveLevelChanged(e: Event): void {
        if (!this._active) return;

        const levelId = (e as CustomEvent<{ levelId?: string }>).detail?.levelId;
        if (typeof levelId !== 'string' || levelId.length === 0) return;

        const newFloorY = this._getLevelElevationById(levelId);
        if (newFloorY === null) return;

        const oldFloorY = this._floorY;
        if (Math.abs(newFloorY - oldFloorY) < 0.001) return;

        const offset = Math.max(this._position.y - oldFloorY, EYE_HEIGHT);
        this._floorY        = newFloorY;
        this._activeLevelId = levelId;
        this._position.y    = newFloorY + offset;

        this._applyPose();

        console.log(
            `[FPC] Level change → "${levelId}": eye ${(oldFloorY + offset).toFixed(3)} → ` +
            `${this._position.y.toFixed(3)} (floor ${oldFloorY.toFixed(3)} → ${newFloorY.toFixed(3)}).`,
        );
    }

    /**
     * §WALK-DISARMS-THE-GIZMO — the app publishes its TransformControls at
     * `window.transformControls` (initTransformControllers.ts). Read through a
     * narrow cast, never `(window as any)` (P4); absent ⇒ nothing to disarm.
     */
    private _gizmo(): { enabled?: boolean } | null {
        try {
            const tc = (window as { transformControls?: { enabled?: boolean } }).transformControls;
            return tc && typeof tc === 'object' ? tc : null;
        } catch {
            return null;
        }
    }

    private _setGizmoEnabled(enabled: boolean): void {
        const tc = this._gizmo();
        if (!tc) return;
        if (this._gizmoWasEnabled === null) this._gizmoWasEnabled = tc.enabled !== false;
        tc.enabled = enabled;
    }

    /** Puts the gizmo back exactly as it was found — a user who had it OFF keeps it OFF. */
    private _restoreGizmoEnabled(): void {
        const tc = this._gizmo();
        if (tc && this._gizmoWasEnabled !== null) tc.enabled = this._gizmoWasEnabled;
        this._gizmoWasEnabled = null;
    }

    /** The active level's id from `ProjectContext`, or `null` when unavailable. */
    private _readActiveLevelId(): string | null {
        try {
            const id = window.projectContext?.activeLevelId;
            return typeof id === 'string' && id.length > 0 ? id : null;
        } catch {
            return null;
        }
    }

    /**
     * Elevation (Y, world metres) of ONE level by id, or `null` when it cannot
     * be resolved.
     *
     * `null` and `0` are deliberately different answers: Ground genuinely sits
     * at 0, so reporting a failed lookup as `0` would silently teleport the user
     * to the ground floor and call it success.
     */
    private _getLevelElevationById(levelId: string): number | null {
        try {
            const bim = window.bimManager;
            if (bim && typeof bim.getLevelById === 'function') {
                const lvl = bim.getLevelById(levelId);
                if (lvl && typeof lvl.elevation === 'number' && isFinite(lvl.elevation)) {
                    return lvl.elevation;
                }
            }
            if (bim && typeof bim.getLevels === 'function') {
                const levels = bim.getLevels() as Array<{ id: string; elevation: number }>;
                const lvl = levels.find(l => l.id === levelId);
                if (lvl && typeof lvl.elevation === 'number' && isFinite(lvl.elevation)) {
                    return lvl.elevation;
                }
            }
        } catch (err) {
            console.warn('[FPC] Could not resolve level elevation:', err);
        }
        return null;
    }

    /**
     * Resolves the elevation (Y) of the currently active level via the
     * platform's BimManager / ProjectContext globals.  Falls back to 0 (the
     * Ground level) if either is unavailable.  Walk Mode places the user's eye
     * at this elevation + EYE_HEIGHT so they walk on the active floor.
     */
    private _getActiveLevelElevation(): number {
        try {
            const bim = window.bimManager;
            const ctx = window.projectContext;
            const activeId: string | undefined = ctx?.activeLevelId;
            if (bim && activeId && typeof bim.getLevelById === 'function') {
                const lvl = bim.getLevelById(activeId);
                if (lvl && typeof lvl.elevation === 'number' && isFinite(lvl.elevation)) {
                    return lvl.elevation;
                }
            }
            if (bim && typeof bim.getLevels === 'function') {
                const levels = bim.getLevels() as Array<{ id: string; elevation: number }>;
                const lvl = activeId ? levels.find(l => l.id === activeId) : levels[0];
                if (lvl && typeof lvl.elevation === 'number' && isFinite(lvl.elevation)) {
                    return lvl.elevation;
                }
            }
        } catch (err) {
            console.warn('[FPC] Could not resolve active level elevation:', err);
        }
        return 0;
    }

}
