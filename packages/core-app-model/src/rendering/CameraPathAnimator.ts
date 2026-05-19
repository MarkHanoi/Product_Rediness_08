/**
 * @file src/core/rendering/CameraPathAnimator.ts
 * @description Camera path keyframe system for video export.
 *
 * CONTRACT (01-BIM-ENGINE-CORE-CONTRACT §4.3):
 *  - This class NEVER mutates any ElementStore or semantic state.
 *  - It reads the live camera position (read-only) to capture keyframes.
 *  - During recording it DOES move the camera temporarily; the caller must
 *    restore the camera to its original state after recording.
 *
 * How it works:
 *   1. User adds keyframes by calling addKeyframe() (captures current camera state)
 *   2. recordVideo() animates the camera through the spline path while capturing
 *      each frame via the provided THREE.WebGLRenderer
 *   3. Frames are collected as Blob URLs; MediaRecorder records a WebM/MP4
 *      stream from the live canvas during playback
 *
 * Interpolation: Catmull-Rom spline through position and look-at points.
 */

import * as THREE from '@pryzm/renderer-three/three';

export interface CameraKeyframe {
    id:       string;
    label:    string;
    position: THREE.Vector3;
    target:   THREE.Vector3;
    fov:      number;
}

export interface VideoRecordOptions {
    fps:          number;
    durationSecs: number;
    width:        number;
    height:       number;
    onProgress?:  (progress: number, status: string) => void;
    onFrame?:     (frameIndex: number, totalFrames: number) => void;
    /**
     * Optional custom render function called for each frame.
     * When provided (e.g. when SSGIService is active), it replaces the default
     * `renderer.render(scene, camera)` call so post-processing effects
     * (GTAO ambient occlusion, etc.) are included in the recorded frames.
     */
    renderFn?:    () => void;
}

export interface VideoResult {
    blobUrl:    string;
    mimeType:   string;
    width:      number;
    height:     number;
    frames:     number;
    durationMs: number;
}

export class CameraPathAnimator {
    private _keyframes: CameraKeyframe[] = [];

    // ── Public API ────────────────────────────────────────────────────────────

    get keyframes(): ReadonlyArray<CameraKeyframe> {
        return this._keyframes;
    }

    /**
     * Captures the current camera position as a new keyframe.
     * @param camera - Live camera (read-only).
     * @param label  - Optional display label.
     */
    addKeyframe(camera: THREE.Camera, label?: string): CameraKeyframe {
        const pos = new THREE.Vector3();
        camera.getWorldPosition(pos);

        // Compute look-at from the camera's -Z world direction
        const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion).normalize();
        const target = pos.clone().addScaledVector(dir, 10);

        const fov = (camera as THREE.PerspectiveCamera).fov ?? 60;

        const kf: CameraKeyframe = {
            id:       `kf-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            label:    label ?? `Keyframe ${this._keyframes.length + 1}`,
            position: pos.clone(),
            target:   target.clone(),
            fov,
        };

        this._keyframes.push(kf);
        return kf;
    }

    /**
     * Removes a keyframe by ID.
     */
    removeKeyframe(id: string): void {
        const idx = this._keyframes.findIndex(k => k.id === id);
        if (idx !== -1) this._keyframes.splice(idx, 1);
    }

    /**
     * Updates a keyframe's label.
     */
    updateLabel(id: string, label: string): void {
        const kf = this._keyframes.find(k => k.id === id);
        if (kf) kf.label = label;
    }

    /**
     * Clears all keyframes.
     */
    clearKeyframes(): void {
        this._keyframes = [];
    }

    /**
     * Evaluates the camera state at normalised time t ∈ [0, 1].
     * Uses Catmull-Rom spline through the keyframe positions and targets.
     * Returns null if fewer than 2 keyframes are set.
     */
    evaluate(t: number): { position: THREE.Vector3; target: THREE.Vector3; fov: number } | null {
        const kfs = this._keyframes;
        if (kfs.length < 2) return null;

        // If only 2 keyframes, use linear interpolation
        if (kfs.length === 2) {
            const tc = Math.max(0, Math.min(1, t));
            return {
                position: kfs[0].position.clone().lerp(kfs[1].position, tc),
                target:   kfs[0].target.clone().lerp(kfs[1].target, tc),
                fov:      kfs[0].fov + (kfs[1].fov - kfs[0].fov) * tc,
            };
        }

        // Catmull-Rom: map t to segment
        const segments = kfs.length - 1;
        const raw      = Math.max(0, Math.min(0.9999, t)) * segments;
        const seg      = Math.floor(raw);
        const localT   = raw - seg;

        const p0 = kfs[Math.max(0, seg - 1)].position;
        const p1 = kfs[seg].position;
        const p2 = kfs[Math.min(kfs.length - 1, seg + 1)].position;
        const p3 = kfs[Math.min(kfs.length - 1, seg + 2)].position;

        const t0k = kfs[Math.max(0, seg - 1)].target;
        const t1k = kfs[seg].target;
        const t2k = kfs[Math.min(kfs.length - 1, seg + 1)].target;
        const t3k = kfs[Math.min(kfs.length - 1, seg + 2)].target;

        const fov0 = kfs[Math.max(0, seg - 1)].fov;
        const fov1 = kfs[seg].fov;
        const fov2 = kfs[Math.min(kfs.length - 1, seg + 1)].fov;
        const fov3 = kfs[Math.min(kfs.length - 1, seg + 2)].fov;

        return {
            position: _catmullRom(p0, p1, p2, p3, localT),
            target:   _catmullRom(t0k, t1k, t2k, t3k, localT),
            fov:      _catmullRomScalar(fov0, fov1, fov2, fov3, localT),
        };
    }

    /**
     * Records a video by animating the camera through the keyframe path.
     * Uses HTMLCanvasElement.captureStream() + MediaRecorder.
     *
     * The caller's renderer canvas is captured live as the camera moves.
     * The camera is restored to its original state after recording.
     *
     * @param renderer - Main THREE.WebGLRenderer (its domElement is captured).
     * @param scene    - The main THREE.Scene.
     * @param camera   - The live camera (temporarily animated; restored afterward).
     * @param opts     - Recording options.
     */
    async recordVideo(
        renderer: THREE.WebGLRenderer,
        scene:    THREE.Scene,
        camera:   THREE.PerspectiveCamera,
        opts:     VideoRecordOptions,
    ): Promise<VideoResult> {
        if (this._keyframes.length < 2) {
            throw new Error('At least 2 keyframes are required to record a video.');
        }

        const t0          = performance.now();
        const totalFrames = Math.ceil(opts.fps * opts.durationSecs);
        const frameDeltaT = 1 / totalFrames;

        // Save original camera state to restore later
        const origPos    = camera.position.clone();
        const origTarget = new THREE.Vector3();
        camera.getWorldDirection(origTarget).multiplyScalar(10).add(camera.position);
        const origFov    = camera.fov;

        opts.onProgress?.(0.02, 'Setting up recorder…');

        // ── Use MediaRecorder if available ─────────────────────────────────────
        const canvas   = renderer.domElement;
        const mimeType = _bestMime();
        let blobUrl    = '';

        if (mimeType && typeof canvas.captureStream === 'function') {
            blobUrl = await this._recordWithMediaRecorder(
                canvas, scene, camera, renderer, totalFrames, frameDeltaT, mimeType, opts
            );
        } else {
            // Fallback: download individual frame PNGs
            blobUrl = await this._recordFramesFallback(
                scene, camera, renderer, totalFrames, frameDeltaT, opts
            );
        }

        // ── Restore camera ─────────────────────────────────────────────────────
        camera.position.copy(origPos);
        camera.lookAt(origTarget);
        camera.fov = origFov;
        camera.updateProjectionMatrix();

        return {
            blobUrl,
            mimeType: mimeType ?? 'image/png',
            width:    opts.width,
            height:   opts.height,
            frames:   totalFrames,
            durationMs: performance.now() - t0,
        };
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    private async _recordWithMediaRecorder(
        canvas:       HTMLCanvasElement,
        scene:        THREE.Scene,
        camera:       THREE.PerspectiveCamera,
        renderer:     THREE.WebGLRenderer,
        totalFrames:  number,
        frameDeltaT:  number,
        mimeType:     string,
        opts:         VideoRecordOptions,
    ): Promise<string> {
        const stream   = canvas.captureStream(opts.fps);
        const chunks:  Blob[] = [];
        const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8_000_000 });

        recorder.ondataavailable = (e) => { if (e.data?.size > 0) chunks.push(e.data); };

        const recordingDone = new Promise<void>((resolve) => {
            recorder.onstop = () => resolve();
        });

        recorder.start();

        const msPerFrame = 1000 / opts.fps;

        // Use the provided renderFn when available (e.g. SSGIService.renderOnce())
        // so post-processing effects are included in recorded frames.
        const doRender = opts.renderFn ?? (() => renderer.render(scene, camera));

        for (let f = 0; f < totalFrames; f++) {
            // Apply ease-in-out so the camera accelerates smoothly at the
            // start and decelerates at the end instead of moving at constant speed.
            const rawT   = f * frameDeltaT;
            const easedT = _easeInOutCubic(rawT);
            this._applyFrame(camera, easedT);
            doRender();

            opts.onFrame?.(f + 1, totalFrames);
            opts.onProgress?.(
                0.05 + 0.90 * ((f + 1) / totalFrames),
                `Recording frame ${f + 1} / ${totalFrames}…`
            );

            await new Promise<void>(r => setTimeout(r, msPerFrame));
        }

        recorder.stop();
        await recordingDone;

        const blob = new Blob(chunks, { type: mimeType });
        return URL.createObjectURL(blob);
    }

    private async _recordFramesFallback(
        scene:       THREE.Scene,
        camera:      THREE.PerspectiveCamera,
        renderer:    THREE.WebGLRenderer,
        _totalFrames: number,
        _frameDeltaT: number,
        opts:        VideoRecordOptions,
    ): Promise<string> {
        // No MediaRecorder — render first frame and return it as a still
        const t = 0;
        this._applyFrame(camera, t);
        const doRender = opts.renderFn ?? (() => renderer.render(scene, camera));
        doRender();

        opts.onProgress?.(0.5, 'Capturing first frame (MediaRecorder unavailable)…');

        return new Promise<string>((resolve, reject) => {
            renderer.domElement.toBlob(blob => {
                if (!blob) { reject(new Error('toBlob failed')); return; }
                resolve(URL.createObjectURL(blob));
            }, 'image/png');
        });
    }

    private _applyFrame(camera: THREE.PerspectiveCamera, t: number): void {
        const state = this.evaluate(t);
        if (!state) return;
        camera.position.copy(state.position);
        camera.lookAt(state.target);
        camera.fov = state.fov;
        camera.updateProjectionMatrix();
    }
}

// ── Math helpers ──────────────────────────────────────────────────────────────

function _catmullRom(
    p0: THREE.Vector3,
    p1: THREE.Vector3,
    p2: THREE.Vector3,
    p3: THREE.Vector3,
    t:  number,
): THREE.Vector3 {
    const t2 = t * t;
    const t3 = t2 * t;
    return new THREE.Vector3(
        _crScalar(p0.x, p1.x, p2.x, p3.x, t, t2, t3),
        _crScalar(p0.y, p1.y, p2.y, p3.y, t, t2, t3),
        _crScalar(p0.z, p1.z, p2.z, p3.z, t, t2, t3),
    );
}

function _catmullRomScalar(a: number, b: number, c: number, d: number, t: number): number {
    return _crScalar(a, b, c, d, t, t * t, t * t * t);
}

// Standard Catmull-Rom formula (alpha = 0.5 / centripetal)
function _crScalar(p0: number, p1: number, p2: number, p3: number, t: number, t2: number, t3: number): number {
    return 0.5 * (
        (2 * p1)
        + (-p0 + p2) * t
        + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2
        + (-p0 + 3 * p1 - 3 * p2 + p3) * t3
    );
}

/**
 * Cubic ease-in-out: t=0→0, t=0.5→0.5, t=1→1.
 * Accelerates smoothly for the first half and decelerates for the second half,
 * eliminating the abrupt start/stop feel of a constant-velocity camera move.
 */
function _easeInOutCubic(t: number): number {
    const tc = Math.max(0, Math.min(1, t));
    return tc < 0.5
        ? 4 * tc * tc * tc
        : 1 - Math.pow(-2 * tc + 2, 3) / 2;
}

function _bestMime(): string | null {
    const candidates = [
        'video/mp4; codecs=avc1',
        'video/mp4',
        'video/webm; codecs=vp9',
        'video/webm; codecs=vp8',
        'video/webm',
    ];
    for (const m of candidates) {
        if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) {
            return m;
        }
    }
    return null;
}
