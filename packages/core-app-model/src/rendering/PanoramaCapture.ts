/**
 * @file src/core/rendering/PanoramaCapture.ts
 * @description 360° equirectangular panorama capture from a THREE.js scene.
 *
 * CONTRACT (01-BIM-ENGINE-CORE-CONTRACT §4.3, §5):
 *  - This class NEVER mutates any ElementStore or semantic state.
 *  - It reads the Three.js scene in read-only fashion.
 *  - A CubeCamera is created fresh for each capture and disposed immediately after.
 *  - The main scene's environment/background is saved and restored precisely.
 *
 * Pipeline:
 *   1. Create THREE.CubeCamera at the main camera's position
 *   2. Render all 6 cube faces into a WebGLCubeRenderTarget
 *   3. Run a custom equirectangular projection shader that maps the cubemap
 *      to a flat 2:1 equirectangular image
 *   4. Read pixels from the WebGLRenderTarget → canvas → PNG Blob URL
 *   5. Dispose all GPU resources
 */

import * as THREE from '@pryzm/renderer-three/three';

export interface PanoramaCaptureOptions {
    /** Cube face resolution in pixels (power of 2; default 1024). */
    faceResolution?: number;
    /** Output equirectangular width in pixels (default 4096, height = width / 2). */
    outputWidth?: number;
    /** Progress callback fired 0–1 during capture. */
    onProgress?: (progress: number, status: string) => void;
}

export interface PanoramaResult {
    blobUrl: string;
    width: number;
    height: number;
    durationMs: number;
}

// ── Equirectangular projection GLSL fragment shader ─────────────────────────
// For each output pixel at (u, v):
//   θ = u × 2π   (longitude, maps from -π to +π)
//   φ = v × π    (latitude,  maps from top to bottom: 0 → π)
//   direction = (sin(φ)sin(θ), cos(φ), sin(φ)cos(θ))
//   sample the cubemap at this direction
const EQUIRECT_VERT = /* glsl */`
    varying vec2 vUv;
    void main() {
        vUv     = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
`;

const EQUIRECT_FRAG = /* glsl */`
    uniform samplerCube cubeMap;
    varying vec2 vUv;

    void main() {
        // vUv.y = 0 is the bottom of the GL plane (= bottom of the saved PNG).
        // Equirectangular standard: top of image = zenith (+Y), bottom = nadir (-Y).
        // Because toBlob() reads the canvas top-to-bottom while WebGL renders
        // bottom-to-top, vUv.y = 0 ends up as the LAST row of the PNG (bottom).
        // Flipping (1.0 - vUv.y) makes phi = π at vUv.y=0 (nadir, PNG bottom)
        // and phi = 0 at vUv.y=1 (zenith, PNG top) — correct equirectangular layout.
        float theta = vUv.x * 2.0 * 3.14159265358979323846;
        float phi   = (1.0 - vUv.y) * 3.14159265358979323846;

        float sinPhi = sin(phi);
        float cosPhi = cos(phi);
        float sinTh  = sin(theta);
        float cosTh  = cos(theta);

        // Map equirectangular UV to a cubemap direction vector.
        // The coordinate system matches THREE.js CubeCamera (right-handed, +Y up).
        vec3 dir = vec3(sinPhi * sinTh, cosPhi, sinPhi * cosTh);

        gl_FragColor = textureCube(cubeMap, dir);
    }
`;

export class PanoramaCapture {
    /**
     * Captures a 360° equirectangular panorama from the current scene
     * at the active camera's position.
     *
     * @param renderer - The main THREE.WebGLRenderer (used only for reading;
     *                   an offscreen renderer is created for the actual capture).
     * @param scene    - The main THREE.Scene (read-only).
     * @param camera   - The main camera (position used; projection is NOT used).
     * @param opts     - Capture configuration.
     */
    static async capture(
        _renderer: THREE.WebGLRenderer,
        scene:     THREE.Scene,
        camera:    THREE.Camera,
        opts:      PanoramaCaptureOptions = {},
    ): Promise<PanoramaResult> {
        const faceRes   = opts.faceResolution ?? 1024;
        const outWidth  = opts.outputWidth    ?? 4096;
        const outHeight = Math.round(outWidth / 2);
        const t0        = performance.now();

        opts.onProgress?.(0.02, 'Creating off-screen renderer…');

        // ── 1. Dedicated off-screen renderer for the capture ─────────────────
        const canvas = document.createElement('canvas');
        canvas.width  = outWidth;
        canvas.height = outHeight;

        const offRenderer = new THREE.WebGLRenderer({
            canvas,
            antialias:            false,
            alpha:                false,
            preserveDrawingBuffer: true,
            powerPreference:      'high-performance',
        });
        offRenderer.setSize(outWidth, outHeight, false);
        offRenderer.setPixelRatio(1);
        offRenderer.outputColorSpace = THREE.SRGBColorSpace;
        offRenderer.toneMapping      = THREE.ACESFilmicToneMapping;
        offRenderer.toneMappingExposure = 1.0;

        // ── 2. Save and restore scene state ──────────────────────────────────
        const prevEnv = scene.environment;
        const prevBg  = scene.background;

        // When PascalSceneLighting is active it sets scene.background = null,
        // which causes sky and open areas to render as pure black in all 6
        // cubemap faces — creating the visible black shape in the panorama.
        // Set a neutral sky colour so background-less areas look natural.
        // The original background is restored in the finally block below.
        if (prevBg === null) {
            scene.background = new THREE.Color(0xdce8f0); // neutral sky blue
        }

        let result: PanoramaResult;

        // ── 2b. Hide helper / gizmo objects that must not appear in the pano ──
        // Traverses the scene and temporarily hides:
        //   • THREE built-in helpers (Axes, Grid, CameraHelper, Light helpers)
        //   • THREE.CubeCamera instances (e.g. ReflectionProbeService probe)
        //   • TransformControls planes/gizmos
        //   • Any object marked userData.isHelper = true
        //   • Any object with userData.elementType === 'LevelLine' (level datums)
        //   • Known annotation group names (bimGridsGroup, levelLinesGroup, etc.)
        //   • Snap indicators and other UI-only overlays (depthTest:false, high renderOrder)
        //   • Line/LineSegments objects with depthTest:false (crosshair indicators)
        const ANNOTATION_GROUP_NAMES = new Set([
            'bimGridsGroup', 'levelLinesGroup', 'snapGroup',
            'dimensionGroup', 'annotationGroup',
        ]);
        const hiddenHelpers: THREE.Object3D[] = [];
        scene.traverse((obj) => {
            if (!obj.visible) return; // already hidden — don't touch
            const isBuiltinHelper =
                obj instanceof THREE.AxesHelper      ||
                obj instanceof THREE.GridHelper       ||
                obj instanceof THREE.CameraHelper     ||
                obj instanceof THREE.DirectionalLightHelper ||
                obj instanceof THREE.PointLightHelper ||
                obj instanceof THREE.SpotLightHelper;
            // CubeCamera (e.g. ReflectionProbeService probe) — no visible geometry
            // but its presence can confuse the six-face cubemap render pass.
            const isCubeCamera = obj instanceof THREE.CubeCamera;
            const isTransformControl =
                obj.type === 'TransformControlsPlane' ||
                obj.type === 'TransformControlsGizmo' ||
                obj.type === 'TransformControls';
            const isMarkedHelper =
                obj.userData?.isHelper === true ||
                obj.userData?.elementType === 'LevelLine';
            // Named annotation groups (grids, level datums, etc.)
            const isAnnotationGroup = ANNOTATION_GROUP_NAMES.has(obj.name);
            // Snap / selection indicator heuristic:
            // Mesh OR Line with renderOrder >= 500 AND depthTest=false
            // (used by SnapVisualizer sphere + crosshair lines, dimension helpers…)
            const isDrawable = (obj as THREE.Mesh).isMesh === true || (obj as any).isLine === true;
            const drawMat    = isDrawable ? (obj as THREE.Mesh).material : undefined;
            const depthOff   = Array.isArray(drawMat)
                ? drawMat.some((m: THREE.Material) => m?.depthTest === false)
                : (drawMat as THREE.Material | undefined)?.depthTest === false;
            const isUIOverlay = isDrawable && obj.renderOrder >= 500 && depthOff;

            if (
                isBuiltinHelper || isCubeCamera || isTransformControl ||
                isMarkedHelper  || isAnnotationGroup || isUIOverlay
            ) {
                obj.visible = false;
                hiddenHelpers.push(obj);
            }
        });

        try {
            opts.onProgress?.(0.08, 'Rendering 6 cubemap faces…');
            await _yieldFrame();

            // ── 3. Create CubeCamera at the main camera's world position ──────
            const cubeRT = new THREE.WebGLCubeRenderTarget(faceRes, {
                format:  THREE.RGBAFormat,
                type:    THREE.HalfFloatType,
                generateMipmaps: false,
            });
            const cubeCamera = new THREE.CubeCamera(0.05, 10000, cubeRT);

            // Position the cube camera at the main camera's world position
            const camPos = new THREE.Vector3();
            camera.getWorldPosition(camPos);
            cubeCamera.position.copy(camPos);
            scene.add(cubeCamera);

            // Update (renders all 6 faces into cubeRT)
            cubeCamera.update(offRenderer, scene);

            opts.onProgress?.(0.55, 'Converting cubemap to equirectangular…');
            await _yieldFrame();

            // ── 4. Custom equirectangular projection pass ─────────────────────
            const eqRT = new THREE.WebGLRenderTarget(outWidth, outHeight, {
                minFilter: THREE.LinearFilter,
                magFilter: THREE.LinearFilter,
                format:    THREE.RGBAFormat,
                type:      THREE.UnsignedByteType,
            });

            const eqMat = new THREE.ShaderMaterial({
                uniforms: {
                    cubeMap: { value: cubeRT.texture },
                },
                vertexShader:   EQUIRECT_VERT,
                fragmentShader: EQUIRECT_FRAG,
                depthTest:  false,
                depthWrite: false,
            });

            const eqGeo  = new THREE.PlaneGeometry(2, 2);
            const eqMesh = new THREE.Mesh(eqGeo, eqMat);

            const eqScene  = new THREE.Scene();
            const eqCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
            eqScene.add(eqMesh);

            offRenderer.setRenderTarget(eqRT);
            offRenderer.render(eqScene, eqCamera);
            offRenderer.setRenderTarget(null);

            opts.onProgress?.(0.80, 'Capturing panorama image…');
            await _yieldFrame();

            // ── 5. Read pixels from the equirectangular RT ────────────────────
            // Blit the render target to the main canvas via a basic quad pass
            const blitMat  = new THREE.MeshBasicMaterial({ map: eqRT.texture });
            const blitMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), blitMat);
            const blitScene = new THREE.Scene();
            blitScene.add(blitMesh);
            offRenderer.setRenderTarget(null);
            offRenderer.render(blitScene, eqCamera);

            // Capture as PNG Blob URL
            const blobUrl = await _canvasToBlobUrl(canvas);

            opts.onProgress?.(0.98, 'Cleaning up…');

            // ── 6. Dispose all temporary GPU resources ────────────────────────
            scene.remove(cubeCamera);
            cubeRT.dispose();
            eqRT.dispose();
            eqMat.dispose();
            eqGeo.dispose();
            blitMat.dispose();
            blitMesh.geometry.dispose();

            result = {
                blobUrl,
                width:      outWidth,
                height:     outHeight,
                durationMs: performance.now() - t0,
            };

            opts.onProgress?.(1.0, 'Panorama ready');
        } finally {
            // Restore hidden helper objects
            for (const obj of hiddenHelpers) obj.visible = true;
            // Restore scene state
            scene.environment = prevEnv;
            scene.background  = prevBg;
            offRenderer.dispose();
        }

        return result;
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _yieldFrame(): Promise<void> {
    return new Promise(r => setTimeout(r, 0));
}

function _canvasToBlobUrl(canvas: HTMLCanvasElement): Promise<string> {
    return new Promise((resolve, reject) => {
        canvas.toBlob(blob => {
            if (!blob) { reject(new Error('Canvas toBlob failed')); return; }
            resolve(URL.createObjectURL(blob));
        }, 'image/jpeg', 0.92);
    });
}
