/**
 * ElementPreviewRenderer — §OPENING-SHOWROOM-PREVIEW (L-7720 … L-7728)
 * =====================================================================
 *
 * ONE offscreen WebGL context for every element preview in the application,
 * ever. Panels do not own a renderer; they own a plain 2-D canvas and ask this
 * module to draw a {@link PreviewSubject} into it.
 *
 * ── THE ONE-VERSUS-MANY DECISION, AND WHY IT IS NOT A PREFERENCE ────────────
 *
 * A `WebGLRenderer` per panel is a context leak with a hard ceiling: browsers cap
 * live WebGL contexts (commonly 8–16) and silently kill the OLDEST when a new one
 * is created. In this application the oldest is THE MAIN VIEWPORT. Two type
 * editors, a pre-draw picker and an inspector open together would have taken the
 * founder's model off the screen, and the standing constraint on this work is
 * *"don't compromise graphics."*
 *
 * So: one renderer, one 256²–512² offscreen canvas, and every visible preview is a
 * `drawImage` blit of it. N panels open ⇒ still exactly ONE context. The panels
 * are drawn one after another, each into its own 2-D canvas, so they do not
 * fight over the framebuffer.
 *
 * ── HOW IT TICKS — P3, and the "must not run when nothing moves" rule ───────
 *
 * ⛔ THERE IS NO ANIMATION LOOP HERE AND THERE MUST NEVER BE ONE. This module
 * calls no `requestAnimationFrame` (P3: the single owner is
 * `frame-scheduler/src/RafAdapter.ts`) and registers no continuous tick listener.
 * A render happens ONLY when something the image depends on changes — an orbit
 * drag, a parameter edit, a mount, a resize — and each request is coalesced
 * through `getFrameScheduler().scheduleOnce(...)`, so ten pointermove events
 * inside one frame produce ONE draw.
 *
 * The measured consequence: an idle preview costs **zero** frames, zero draw
 * calls and zero GPU time. It is not "cheap"; it is not running.
 *
 * ── P2 ──────────────────────────────────────────────────────────────────────
 *
 * THREE is imported from `@pryzm/renderer-three/three`, the owner package's
 * namespace sub-path. ⚠ `check-three-imports.ts` matches `from 'three'` and
 * `from 'three/*'` ONLY, and names this sub-path as a P2-COMPLIANT path in its
 * own header. This is the same import `FurnitureThumbnailService.ts` and
 * `PIPRenderer.ts` already use to render 3-D inside `apps/editor/src/ui`.
 *
 * ── C100 ────────────────────────────────────────────────────────────────────
 *
 * `resolvePartMaterial` is the ONLY place a preview colour is decided, and it
 * walks C100 §2.1's ladder in order. An id that names nothing renders the
 * designated UNRESOLVED colour — deliberately not a plausible building material —
 * and emits ONE diagnostic per distinct id, never one per part (C100 §5).
 */

import * as THREE from '@pryzm/renderer-three/three';
import { getFrameScheduler } from '@pryzm/frame-scheduler';
import { findMaterialById } from '@pryzm/core-app-model/material-library';
import type { PreviewSubject, PreviewPart } from './OpeningPreviewSubject';

/**
 * C100 §5 — the designated UNRESOLVED colour. Chosen to be VISIBLY WRONG: no
 * building material is this magenta, so "the material was lost" can never be
 * mistaken for "this element is beige". It matches the sentinel
 * `windowFinishColour.ts` / `doorFinishColour.ts` already paint on the real mesh,
 * so the preview and the model agree about failure as well as about success.
 */
const UNRESOLVED_COLOUR = '#ff00ff';

/** Offscreen buffer size. Square; the visible canvas letterboxes into its own box. */
const BUFFER_PX = 512;

/** §CONTEXT-DATA-HONESTY — one line per distinct dead id, not one per part. */
const warnedIds = new Set<string>();

export interface OrbitState {
    /** Radians, around the world Y axis. */
    yaw: number;
    /** Radians, clamped so the camera never crosses the poles. */
    pitch: number;
    /** 1 = the framed default; >1 pulls back. */
    zoom: number;
}

export const DEFAULT_ORBIT: Readonly<OrbitState> = Object.freeze({
    // A three-quarter view. A dead-on elevation hides exactly the depth
    // information the showroom exists to show (reveal, sill projection, leaf
    // thickness), so the default is deliberately NOT orthographic-front.
    yaw: -0.62,
    pitch: 0.22,
    zoom: 1,
});

export const PITCH_LIMIT = 1.35;

interface Rig {
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    /** Everything belonging to the CURRENT subject; emptied and disposed on each swap. */
    content: THREE.Group;
    canvas: HTMLCanvasElement;
}

let rig: Rig | null = null;
/** How many mounted previews exist. The context is released when this reaches 0. */
let liveMounts = 0;
/** The subject currently built into `rig.content`, so an unchanged subject is not rebuilt. */
let builtKey: string | null = null;

/**
 * Build the single rig, lazily. Returns null when WebGL is unavailable — the
 * caller then shows an honest message instead of an empty black box.
 *
 * ⚠ The founder's machine reports `GPU: WebGL · webgl-only`, so this is
 * deliberately a plain `WebGLRenderer` and not a WebGPU path. It must work there
 * FIRST; there is no fallback below it.
 */
function ensureRig(): Rig | null {
    if (rig) return rig;
    try {
        const canvas = document.createElement('canvas');
        canvas.width = BUFFER_PX;
        canvas.height = BUFFER_PX;

        const renderer = new THREE.WebGLRenderer({
            canvas,
            antialias: true,
            alpha: true,
            // The blit reads the buffer AFTER the draw returns, and on some drivers a
            // swapped buffer is already cleared by then. Preserving it is what makes
            // `drawImage` deterministic here.
            preserveDrawingBuffer: true,
        });
        renderer.setPixelRatio(1);
        renderer.setSize(BUFFER_PX, BUFFER_PX, false);
        renderer.setClearColor(0x000000, 0);
        renderer.outputColorSpace = THREE.SRGBColorSpace;

        const scene = new THREE.Scene();

        // Neutral three-point rig. Bright and white — §BRAND: white + purple, no
        // black. The showroom must read as a product photo, not a night render.
        const key = new THREE.DirectionalLight(0xffffff, 2.0);
        key.position.set(2.4, 3.4, 3.0);
        const fill = new THREE.DirectionalLight(0xfff6ec, 0.85);
        fill.position.set(-2.6, 1.1, 1.4);
        const rim = new THREE.DirectionalLight(0xeef0ff, 0.55);
        rim.position.set(-0.6, 1.8, -3.2);
        const amb = new THREE.AmbientLight(0xffffff, 0.55);
        scene.add(key, fill, rim, amb);

        const camera = new THREE.PerspectiveCamera(32, 1, 0.02, 200);
        const content = new THREE.Group();
        scene.add(content);

        rig = { renderer, scene, camera, content, canvas };
        return rig;
    } catch (err) {
        console.warn('[ElementPreviewRenderer] WebGL unavailable — preview disabled:', err);
        return null;
    }
}

/**
 * C100 §2.1's ladder, in order, in ONE place.
 *
 *   1. a resolvable `materialId`      → the master's colour and PBR values;
 *   2. a stored hex with no id        → the LEGACY cached colour, used as-is;
 *   3. an id that resolves to nothing → the designated UNRESOLVED colour.
 *
 * ⚠ Note what is NOT here: a family default, a keyword table, or a plausible
 * beige. C100 §5 forbids substituting a colour of one's own choosing on failure
 * "in a way indistinguishable from success", and a preview is exactly the surface
 * where such a substitution would be most convincing and most wrong.
 */
function resolvePartMaterial(part: PreviewPart): THREE.MeshStandardMaterial {
    const id = part.materialId;
    let colour = part.fallbackHex ?? UNRESOLVED_COLOUR;
    let metalness = 0.1;
    let roughness = 0.7;

    if (id) {
        const rec = findMaterialById(id);
        if (rec) {
            // ⚠ `params.color` is a THREE `ColorRepresentation`, i.e. a `Color`, a NUMBER
            // or a string — all three are legal and the projection does not narrow it.
            // `String(0x9aa0a8)` is "10133672", which `new THREE.Color()` cannot parse and
            // which would have silently produced black. Each form is converted, never
            // stringified blind.
            const c = rec.params.color;
            colour = c instanceof THREE.Color
                ? `#${c.getHexString()}`
                : typeof c === 'number'
                    ? `#${c.toString(16).padStart(6, '0')}`
                    : String(c);
            if (typeof rec.params.metalness === 'number') metalness = rec.params.metalness;
            if (typeof rec.params.roughness === 'number') roughness = rec.params.roughness;
        } else {
            colour = UNRESOLVED_COLOUR;
            if (!warnedIds.has(id)) {
                warnedIds.add(id);
                console.warn(
                    `[ElementPreviewRenderer] material "${id}" is not in the master catalogue — ` +
                    'drawn in the UNRESOLVED colour (C100 §5). This is reported once per distinct id.',
                );
            }
        }
    }

    const opacity = part.opacity ?? 1;
    const transparent = opacity < 1;
    return new THREE.MeshStandardMaterial({
        color: new THREE.Color(colour),
        metalness,
        roughness: transparent ? Math.min(roughness, 0.15) : roughness,
        transparent,
        opacity,
        depthWrite: !transparent,
        side: THREE.DoubleSide,
    });
}

/** Empty `content`, disposing every geometry and material it held. No GPU leak per swap. */
function clearContent(r: Rig): void {
    r.content.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
        else mat?.dispose();
    });
    r.content.clear();
}

function buildContent(r: Rig, subject: PreviewSubject): void {
    clearContent(r);
    // Centre the subject on the origin so orbit rotates about the object, not
    // about its corner.
    const [ex, ey] = subject.extent;
    for (const part of subject.parts) {
        const geo = new THREE.BoxGeometry(
            Math.max(part.size[0], 1e-4),
            Math.max(part.size[1], 1e-4),
            Math.max(part.size[2], 1e-4),
        );
        const mesh = new THREE.Mesh(geo, resolvePartMaterial(part));
        mesh.position.set(part.center[0], part.center[1] - ey / 2, part.center[2]);
        mesh.name = part.name;
        // Glazing last, so it composites over the frame it sits in.
        mesh.renderOrder = (part.opacity ?? 1) < 1 ? 1 : 0;
        r.content.add(mesh);
    }
    void ex;
    builtKey = subject.key;
}

function frameCamera(r: Rig, subject: PreviewSubject, orbit: OrbitState): void {
    const [ex, ey, ez] = subject.extent;
    const radius = Math.max(Math.hypot(ex, ey, ez) * 0.5, 0.2);
    const fov = (r.camera.fov * Math.PI) / 180;
    const dist = (radius / Math.sin(fov / 2)) * 1.28 * Math.max(orbit.zoom, 0.2);

    const p = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, orbit.pitch));
    r.camera.position.set(
        dist * Math.cos(p) * Math.sin(orbit.yaw),
        dist * Math.sin(p),
        dist * Math.cos(p) * Math.cos(orbit.yaw),
    );
    r.camera.lookAt(0, 0, 0);
    r.camera.updateProjectionMatrix();
}

/**
 * Draw `subject` into `target` at the given orbit. SYNCHRONOUS — the caller is
 * already inside a scheduled frame.
 *
 * The content is rebuilt only when `subject.key` changed, so an orbit drag on an
 * unchanged type allocates NOTHING: it moves the camera and re-renders 512²
 * pixels of an existing scene.
 */
function drawNow(subject: PreviewSubject, target: HTMLCanvasElement, orbit: OrbitState): boolean {
    const r = ensureRig();
    if (!r) return false;

    if (builtKey !== subject.key) buildContent(r, subject);
    frameCamera(r, subject, orbit);
    r.renderer.render(r.scene, r.camera);

    const ctx = target.getContext('2d');
    if (!ctx) return false;
    ctx.clearRect(0, 0, target.width, target.height);
    // Letterbox: never stretch. A stretched window is a WRONG window, not a
    // cosmetic defect — the whole point of the showroom is proportion.
    const s = Math.min(target.width, target.height);
    const dx = (target.width - s) / 2;
    const dy = (target.height - s) / 2;
    ctx.drawImage(r.canvas, dx, dy, s, s);
    return true;
}

/** A pending draw per target canvas, so requests coalesce per surface. */
const pending = new WeakMap<HTMLCanvasElement, () => void>();

/**
 * Request ONE frame for `target`. Coalesced: repeated calls inside a single frame
 * collapse to one draw. Never starts a loop.
 */
export function requestPreviewDraw(
    subject: PreviewSubject,
    target: HTMLCanvasElement,
    orbit: OrbitState,
): void {
    const already = pending.get(target);
    if (already) already();          // cancel the superseded request; the newest state wins
    const dispose = getFrameScheduler().scheduleOnce('element-preview-draw', () => {
        pending.delete(target);
        drawNow(subject, target, orbit);
    });
    pending.set(target, dispose);
}

/** Register a mounted preview. Pair with {@link releasePreviewMount}. */
export function acquirePreviewMount(): void {
    liveMounts++;
}

/**
 * Release a mounted preview. When the LAST one goes, the WebGL context is
 * released rather than parked: a retained context still counts against the
 * browser's cap even when nothing draws into it, and the cap is what would evict
 * the main viewport.
 */
export function releasePreviewMount(): void {
    liveMounts = Math.max(0, liveMounts - 1);
    if (liveMounts > 0 || !rig) return;
    try {
        clearContent(rig);
        rig.renderer.dispose();
        rig.renderer.forceContextLoss();
    } catch (err) {
        console.warn('[ElementPreviewRenderer] context release failed:', err);
    }
    rig = null;
    builtKey = null;
}

/** Test seam — the live-mount count. Exported so a spec can assert the ONE-context rule. */
export function _previewMountCountForTest(): number {
    return liveMounts;
}

/** Test seam — whether a WebGL context is currently held. */
export function _previewContextHeldForTest(): boolean {
    return rig !== null;
}
