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
import type {
    AnyPreviewPart,
    PreviewExtrudedOutlinePart,
    PreviewMeshPart,
    PreviewSubject,
} from './OpeningPreviewSubject';
// §OUTLINE81 / §COMPONENT-PREVIEW — the narrowing predicates for the part union
// (value imports, not types).
import { isExtrudedOutlinePart, isMeshPart } from './OpeningPreviewSubject';
// §QTYHL132 (L-12120) — the ONE resolver for CSS custom-property colour
// references. THREE has no CSS engine; see `graphMarkColour` below.
import { resolveCssColour } from '../styles/categoricalPalette';
import type { GraphSubject } from './GraphPreviewSubject';

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
    /**
     * §OPENING-PREVIEW-HONEST-FAILURE (L-9600) — flipped by the canvas's own
     * `webglcontextlost` event. A lost context renders NOTHING and throws NOTHING:
     * every subsequent `render()` is a silent no-op. Without this flag the rig
     * stays non-null forever and the surface shows a permanently blank box while
     * `ensureRig()` keeps handing back the corpse.
     */
    lost: boolean;
}

let rig: Rig | null = null;

/**
 * §OPENING-PREVIEW-HONEST-FAILURE (L-9600) — WHY a draw could not happen, as a
 * NAMED value rather than a boolean.
 *
 * ⭐ THE DEFECT THIS TYPE EXISTS TO KILL. `drawNow` used to return `boolean`, and
 * `ElementPreviewCanvas` did not even read it: it inferred failure by sampling the
 * alpha of the target canvas's top-left 8x8 pixels 120 ms after mount. That region
 * is inside the LETTERBOX MARGIN on any preview box wider than it is tall (the
 * showroom's is 516 x 172 CSS px, so the blit starts 172 px from the left edge and
 * the probe reads 164 px of guaranteed-transparent margin). The probe therefore
 * reported "this browser did not provide a WebGL context" on EVERY mount, in EVERY
 * browser, including one that had just rendered the frame perfectly.
 *
 * That is §CONTEXT-DATA-HONESTY inverted — a probe under which SUCCESS and TOTAL
 * FAILURE carry the same value — and it is why the founder read a false accusation
 * of his browser while his main viewport was rendering his model in WebGL.
 *
 * ⛔ These five are deliberately NOT collapsible into "unavailable". They have
 * different causes, different fixes and different things to tell the user:
 *  - `ok`             — drawn.
 *  - `no-webgl`       — the context could not be CREATED. Carries the driver's own
 *                       message via {@link previewRigDiagnostics}.
 *  - `context-lost`   — it was created and then TAKEN AWAY (driver reset, tab
 *                       backgrounded, the browser's live-context cap evicting).
 *                       Recoverable: the rig is dropped and the next request
 *                       rebuilds it.
 *  - `no-2d-context`  — the TARGET canvas would not give a 2-D context. Nothing to
 *                       do with WebGL; blaming WebGL here was the old message's
 *                       second lie.
 *  - `empty-subject`  — the rig is fine and the subject has no parts. "Nothing to
 *                       draw" must never read as "the renderer failed".
 */
export type PreviewDrawResult =
    | 'ok'
    | 'no-webgl'
    | 'context-lost'
    | 'no-2d-context'
    | 'empty-subject';

/**
 * The driver's own words from the last failed {@link ensureRig}, kept so the UI can
 * name the real cause instead of guessing at one. `null` once a rig exists.
 */
let lastRigFailure: string | null = null;

/** How many times the context has been lost this session. Reported, never hidden. */
let contextLossCount = 0;
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
    // §OPENING-PREVIEW-HONEST-FAILURE (L-9601) — a LOST rig is not a rig. It used to
    // be returned unconditionally, so a single driver reset turned every preview in
    // the application into a permanently blank box for the rest of the session: the
    // renders kept "succeeding" (a lost context throws nothing) and nothing ever
    // rebuilt. Dropping it here is what makes the loss RECOVERABLE.
    if (rig && rig.lost) {
        try { rig.renderer.dispose(); } catch { /* the context is already gone */ }
        rig = null;
        builtKey = null;
    }
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

        rig = { renderer, scene, camera, content, canvas, lost: false };

        // §OPENING-PREVIEW-HONEST-FAILURE (L-9601) — the ONLY way to learn that a
        // context died. `render()` on a lost context is a silent no-op: it returns
        // normally, draws nothing and reports nothing. Without this listener
        // "device-loss" and "everything is fine" are the same observable, which is
        // the failure shape [[render-reconstruction-boundary-gpu-reset]] records for
        // the main viewport, one surface down.
        canvas.addEventListener('webglcontextlost', (e) => {
            // Preventing the default is what makes restoration possible at all.
            e.preventDefault();
            contextLossCount++;
            if (rig) rig.lost = true;
            builtKey = null;
            console.warn(
                '[ElementPreviewRenderer] the shared preview context was LOST ' +
                `(occurrence ${contextLossCount}). The next draw request rebuilds it.`,
            );
        });

        lastRigFailure = null;
        return rig;
    } catch (err) {
        // ⭐ The driver's own words are KEPT, not swallowed into a boolean. "WebGL is
        // unavailable" and "this machine has already handed out its 16th context" are
        // different problems and the second one is actionable.
        lastRigFailure = err instanceof Error ? err.message : String(err);
        console.warn('[ElementPreviewRenderer] WebGL unavailable — preview disabled:', err);
        return null;
    }
}

/**
 * What the shared rig's state actually is, for a UI that must NAME a failure rather
 * than assert one. Pure read; creates nothing.
 */
export function previewRigDiagnostics(): {
    readonly held: boolean;
    readonly lost: boolean;
    readonly mounts: number;
    readonly contextLosses: number;
    readonly lastFailure: string | null;
} {
    return {
        held: rig !== null && !rig.lost,
        lost: rig !== null && rig.lost,
        mounts: liveMounts,
        contextLosses: contextLossCount,
        lastFailure: lastRigFailure,
    };
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
function resolvePartMaterial(part: AnyPreviewPart): THREE.MeshStandardMaterial {
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
        let geo: THREE.BufferGeometry;
        if (isMeshPart(part)) {
            // §COMPONENT-PREVIEW — already-tessellated buffers from the ONE bake
            // (`bakeFamilyInstance`). Wrapped, never copied and never re-derived —
            // the same translation `plugins/component`'s `geometry-bridge` performs
            // for the placed instance, so the preview cannot disagree with it.
            geo = meshPartGeometry(part);
        } else if (isExtrudedOutlinePart(part)) {
            // §OUTLINE81 (D8) — the outline part, extruded on this already-P2-legal path.
            // The points arrive in the subject's own (x, y) elevation metres; the shape
            // carries its own position, so the mesh sits at `center` (typically the
            // origin) and only the whole-subject vertical centring below applies.
            geo = extrudedOutlineGeometry(part);
        } else {
            geo = new THREE.BoxGeometry(
                Math.max(part.size[0], 1e-4),
                Math.max(part.size[1], 1e-4),
                Math.max(part.size[2], 1e-4),
            );
        }
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

/**
 * §OUTLINE81 (D8) — build the extruded-outline geometry for a
 * {@link PreviewExtrudedOutlinePart}. The ring and its holes become a `THREE.Shape`;
 * the extrusion is centred about z = 0 so `center[2]` means the same thing it means
 * for a box part. No bevel — the real builder's `extrudeCentred` has none either,
 * and a bevelled preview would show edges the placed window will not have.
 */
/**
 * §COMPONENT-PREVIEW (lane U5) — wrap a {@link PreviewMeshPart}'s baked buffers
 * into a `BufferGeometry`. The typed arrays become the geometry's storage
 * directly (no copy) — the same contract `buildComponentBufferGeometry` states
 * in `plugins/component/src/committer/geometry-bridge.ts`. No crease welding,
 * no normal recompute: `produceExtrude` already emitted clean per-face normals,
 * and recomputing here would give the preview a SECOND answer to a question the
 * placed mesh has already answered.
 */
function meshPartGeometry(part: PreviewMeshPart): THREE.BufferGeometry {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(part.position, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(part.normal, 3));
    geo.setIndex(new THREE.BufferAttribute(part.index, 1));
    return geo;
}

function extrudedOutlineGeometry(part: PreviewExtrudedOutlinePart): THREE.BufferGeometry {
    const shape = new THREE.Shape(part.points.map((p) => new THREE.Vector2(p.x, p.y)));
    for (const hole of part.holes ?? []) {
        shape.holes.push(new THREE.Path(hole.map((p) => new THREE.Vector2(p.x, p.y))));
    }
    const depth = Math.max(part.depth, 1e-4);
    const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
    geo.translate(0, 0, -depth / 2);
    return geo;
}

function frameCamera(r: Rig, subject: PreviewSubject, orbit: OrbitState): void {
    const [ex, ey, ez] = subject.extent;
    const radius = Math.max(Math.hypot(ex, ey, ez) * 0.5, 0.2);
    const fov = (r.camera.fov * Math.PI) / 180;
    const dist = (radius / Math.sin(fov / 2)) * 1.28 * Math.max(orbit.zoom, 0.2);

    // §GRAPH-3D-VIEWPORT (L-8440) — the aspect is now set EXPLICITLY on every
    // path. It used to be left at the constructor's 1, which was correct while
    // this rig only ever drew into a square buffer. The graph path draws into a
    // buffer shaped like its card, so a preview drawn AFTER a graph would have
    // inherited the graph's aspect and rendered a stretched window — and a
    // stretched window is a WRONG window, not a cosmetic defect.
    r.camera.aspect = 1;

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
 * Resize the shared offscreen buffer, and ONLY when it actually differs.
 *
 * ⚠ The showroom always asks for `BUFFER_PX` square; the 3-D graph asks for a
 * buffer shaped like its card so its picture is not letterboxed into a square
 * inside a wide panel. Alternating between the two therefore costs one buffer
 * reallocation each way. That is stated rather than hidden: in practice the two
 * surfaces are not open at once, and the alternative — a second WebGL context —
 * is the one thing this module exists to prevent.
 */
function ensureBuffer(r: Rig, w: number, h: number): void {
    if (r.canvas.width === w && r.canvas.height === h) return;
    r.renderer.setSize(w, h, false);
}

/**
 * Draw `subject` into `target` at the given orbit. SYNCHRONOUS — the caller is
 * already inside a scheduled frame.
 *
 * The content is rebuilt only when `subject.key` changed, so an orbit drag on an
 * unchanged type allocates NOTHING: it moves the camera and re-renders 512²
 * pixels of an existing scene.
 */
function drawNow(
    subject: PreviewSubject,
    target: HTMLCanvasElement,
    orbit: OrbitState,
): PreviewDrawResult {
    const wasLost = rig !== null && rig.lost;
    const r = ensureRig();
    // ⚠ The order matters. A rig that was JUST found lost and could not be rebuilt is
    // reported as `context-lost` (recoverable, try again) and not as `no-webgl`
    // (this machine cannot do it at all) — two different sentences for the user.
    if (!r) return wasLost ? 'context-lost' : 'no-webgl';
    if (r.lost) return 'context-lost';
    if (subject.parts.length === 0) return 'empty-subject';

    ensureBuffer(r, BUFFER_PX, BUFFER_PX);
    if (builtKey !== subject.key) buildContent(r, subject);
    frameCamera(r, subject, orbit);
    r.renderer.render(r.scene, r.camera);

    const ctx = target.getContext('2d');
    if (!ctx) return 'no-2d-context';
    ctx.clearRect(0, 0, target.width, target.height);
    // Letterbox: never stretch. A stretched window is a WRONG window, not a
    // cosmetic defect — the whole point of the showroom is proportion.
    const s = Math.min(target.width, target.height);
    const dx = (target.width - s) / 2;
    const dy = (target.height - s) / 2;
    ctx.drawImage(r.canvas, dx, dy, s, s);
    return 'ok';
}

/** A pending draw per target canvas, so requests coalesce per surface. */
const pending = new WeakMap<HTMLCanvasElement, () => void>();

/**
 * Request ONE frame for `target`. Coalesced: repeated calls inside a single frame
 * collapse to one draw. Never starts a loop.
 *
 * `onResult` receives the OUTCOME OF THE DRAW THAT ACTUALLY RAN — the same shape
 * `requestGraphDraw` already reports through `onProjected`, which is the pattern
 * GRAPH48 established and the one this call site should have used from the start.
 *
 * ⭐ §OPENING-PREVIEW-HONEST-FAILURE (L-9600). Read {@link PreviewDrawResult}'s
 * docstring before adding a caller: the previous consumer inferred failure from
 * pixel alpha and was wrong 100% of the time. **The renderer knows; ask it.** And
 * ask it EVERY draw — a one-shot check latches the first frame's answer, which for
 * a preview mounted into a detached panel is the answer for a canvas that had no
 * size yet.
 */
export function requestPreviewDraw(
    subject: PreviewSubject,
    target: HTMLCanvasElement,
    orbit: OrbitState,
    onResult?: (result: PreviewDrawResult) => void,
): void {
    const already = pending.get(target);
    if (already) already();          // cancel the superseded request; the newest state wins
    const dispose = getFrameScheduler().scheduleOnce('element-preview-draw', () => {
        pending.delete(target);
        onResult?.(drawNow(subject, target, orbit));
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

// ═════════════════════════════════════════════════════════════════════════════
// §GRAPH-3D-VIEWPORT (L-8440 · L-8441) — the SAME rig draws the 3-D graph
// ═════════════════════════════════════════════════════════════════════════════
//
// ⭐ THE DECISION, AND IT IS THE SAME ONE THIS FILE ALREADY MADE ONCE.
// The founder asked for a navigable 3-D relationship graph on the Analysis
// surface. The obvious implementation is a `WebGLRenderer` for that card. This
// module's opening paragraph is about why that is not available: browsers cap
// live contexts and evict the OLDEST, which here is the MAIN VIEWPORT, and the
// standing constraint is "don't compromise graphics". A second context would be
// the same defect this file was written to prevent, wearing a graph's costume.
//
// So the graph is a second SUBJECT for one rig, not a second rig.
//
// ⛔ P3 IS UNCHANGED AND MUST STAY UNCHANGED. No animation loop, no tick
// listener, no rAF. A graph frame is drawn only when something it depends on
// moves — an orbit drag, a view switch, a filter, a selection — and every request
// is coalesced through `getFrameScheduler().scheduleOnce`. An idle 3-D graph
// costs zero frames, zero draw calls and zero GPU time. It is not "cheap"; it is
// not running.
//
// ⛔ NO THREE TYPE CROSSES THE BOUNDARY, IN EITHER DIRECTION. The caller supplies
// plain numbers and CSS colour strings; the renderer returns projected SCREEN
// coordinates. Picking and labels are then ordinary 2-D work over the blit, which
// is both P2-clean and better output — canvas text at device resolution beats an
// in-scene sprite.

/**
 * The largest graph buffer, per axis. ⚠ CHOSEN, NOT BENCHED (C66 §1.1). It is the
 * point past which extra pixels stop being visible on a dashboard card while the
 * buffer's memory keeps growing; the card's own size is used below this.
 */
const GRAPH_BUFFER_MAX = 1024;

/**
 * ONE sphere geometry for every node, ONE line set for every relation.
 *
 * ⭐ Nodes are an `InstancedMesh`: 320 nodes are ONE draw call and ONE geometry,
 * not 320 of each. This is the lesson recorded in
 * [[instanced-aggregate-level-visibility]] and
 * [[webgpu-heavy-scene-crash-and-instancing]] — where instancing was DEFEATED in
 * the main viewport by per-element unique materials. It is not defeated here
 * because colour is carried per INSTANCE (`setColorAt`), never per material.
 *
 * ⚠ Segment counts are low on purpose (12x8). At the sizes a graph node is drawn
 * these are indistinguishable from a smooth sphere, and the vertex budget is
 * spent once for every node rather than once per node.
 */
/**
 * ⭐ §QTYHL132 (L-12120) — THE ONE PLACE A GRAPH MARK'S COLOUR STRING BECOMES A
 * COLOUR, and therefore the only place that can tell a parse failure from a
 * parse. Both producers below call it; nothing else may call `Color.set` on a
 * subject colour.
 *
 * ── THE DEFECT, MEASURED 2026-08-26 ──────────────────────────────────────────
 * The founder's console, on the Analysis surface, hundreds of lines:
 *
 *     THREE.Color: Unknown color model var(--app-cat-1)
 *     THREE.Color: Unknown color model var(--app-cat-2)
 *     THREE.Color: Unknown color model var(--app-cat-4)
 *
 * `AnalysisTypes.CAT_TOKENS` is a list of CSS custom-property REFERENCES
 * (`var(--app-cat-N)`); `widgetRenderers.ts:991/:992` hands them to
 * `graphViewState.buildGraphSubject`, which passes them through to
 * `GraphNodeMark.colour`; and the two `c.set(...)` calls below fed them to a
 * renderer that has no CSS engine. ⛔ `Color.set` DOES NOT THROW on a value it
 * cannot parse — it warns and leaves the instance at its default WHITE — so
 * "this category is white" and "this category's colour was lost" produced the
 * same pixels. That is §CONTEXT-DATA-HONESTY's exact prohibition, and it is the
 * founder's "not all the categories highlight".
 *
 * ⚠ WHY HERE AND NOT AT THE SUBJECT. `graphViewState.ts:287` DECLARES this
 * field to be a "resolved CSS colour" and has never received one. Fixing the
 * producer would have made THAT caller honest and left `Color.set` able to
 * whiten silently for the next one — and the Analysis relationship graph is
 * acquiring new colour producers right now (lane ANALYZE129). Resolution at the
 * consumer covers every producer, present and future, by construction.
 * ⚠ OPEN: `graphViewState.ts:287`'s doc still says "Resolved". It is not, and
 * that doc is now the only surviving statement of the wish — it belongs to a
 * concurrently-edited file and is deliberately left for its owner.
 *
 * ⛔ DORMANT IS CARRIED BY COLOUR, NOT BY OPACITY, and the direction is towards
 * WHITE. This clamp+blend was written TWICE — once for nodes, once for links —
 * and is now written once. Per-instance alpha would need a custom material;
 * more importantly a transparent node can disappear entirely against a white
 * ground, and `seriesFocus`'s rule is DORMANT, NOT GONE: the reader must still
 * see the whole population. Lightening preserves hue, so a dimmed mark is still
 * identifiable as itself.
 *
 * `out` is reused by the callers so a 320-node graph allocates one Color, not
 * 320.
 */
export function graphMarkColour(
    css: string,
    alpha: number,
    out: THREE.Color = new THREE.Color(),
): THREE.Color {
    // resolveCssColour never returns a `var()` and never returns '' — on failure
    // it returns the designated UNRESOLVED magenta and warns once, naming the
    // token. So `set` here can no longer fail silently into white.
    out.set(resolveCssColour(css));
    const k = Math.max(0.12, Math.min(1, alpha));
    out.setRGB(out.r * k + (1 - k), out.g * k + (1 - k), out.b * k + (1 - k));
    return out;
}

function buildGraphContent(r: Rig, subject: GraphSubject): void {
    clearContent(r);

    if (subject.nodes.length > 0) {
        const geo = new THREE.SphereGeometry(1, 12, 8);
        // ⚠ ONE material for every node. The per-instance colour attribute is what
        // tints them, which is exactly what keeps this a single draw call.
        const mat = new THREE.MeshStandardMaterial({ metalness: 0.05, roughness: 0.55 });
        const mesh = new THREE.InstancedMesh(geo, mat, subject.nodes.length);
        const m = new THREE.Matrix4();
        const c = new THREE.Color();
        subject.nodes.forEach((n, i) => {
            m.makeScale(n.r, n.r, n.r);
            m.setPosition(n.p[0], n.p[1], n.p[2]);
            mesh.setMatrixAt(i, m);
            // §QTYHL132 — resolve + dim in ONE place (see `graphMarkColour`).
            mesh.setColorAt(i, graphMarkColour(n.colour, n.alpha, c));
        });
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        mesh.name = 'ubg-nodes';
        r.content.add(mesh);
    }

    if (subject.links.length > 0) {
        // ONE LineSegments for every relation, vertex-coloured so each family keeps
        // the legend's colour. Also one draw call.
        const positions = new Float32Array(subject.links.length * 6);
        const colours = new Float32Array(subject.links.length * 6);
        const c = new THREE.Color();
        subject.links.forEach((l, i) => {
            positions.set([l.a[0], l.a[1], l.a[2], l.b[0], l.b[1], l.b[2]], i * 6);
            // §QTYHL132 — the SAME resolve + dim as the nodes above, deliberately
            // not a second copy of the clamp. Two copies is how a link and the
            // node it joins end up disagreeing about what "dormant" means.
            graphMarkColour(l.colour, l.alpha, c);
            colours.set([c.r, c.g, c.b, c.r, c.g, c.b], i * 6);
        });
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geo.setAttribute('color', new THREE.BufferAttribute(colours, 3));
        const lines = new THREE.LineSegments(
            geo,
            new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.85 }),
        );
        lines.name = 'ubg-links';
        r.content.add(lines);
    }

    builtKey = subject.key;
}

/** Where a node landed on the visible canvas, in the target's own pixels. */
export interface ProjectedNode {
    readonly x: number;
    readonly y: number;
    /** Normalised device depth. Lower is nearer; used to pick the FRONTMOST node. */
    readonly depth: number;
    /** Screen-space radius, so the widget can hit-test and place a label. */
    readonly r: number;
}

function drawGraphNow(
    subject: GraphSubject,
    target: HTMLCanvasElement,
    orbit: OrbitState,
): Map<string, ProjectedNode> | null {
    const r = ensureRig();
    if (!r) return null;

    const w = Math.max(2, Math.min(GRAPH_BUFFER_MAX, Math.round(target.width)));
    const h = Math.max(2, Math.min(GRAPH_BUFFER_MAX, Math.round(target.height)));
    ensureBuffer(r, w, h);

    if (builtKey !== subject.key) buildGraphContent(r, subject);

    // The content is already centred on the origin inside a cube of half-extent 1
    // (`normaliseToCube`), so the framing radius is a CONSTANT rather than a
    // measurement — no bounding-box pass per draw, and the camera cannot drift
    // between draws of the same subject.
    const radius = Math.sqrt(3);
    r.camera.aspect = w / h;
    const fov = (r.camera.fov * Math.PI) / 180;
    // ⚠ Frame against the NARROWER axis. Using the vertical FOV alone would let a
    // wide graph run off the sides of a wide card — the picture would be cropped
    // and the reader would silently be shown fewer relations than the count above
    // it, which is the whole failure class this surface exists to avoid.
    const effective = r.camera.aspect >= 1 ? fov : 2 * Math.atan(Math.tan(fov / 2) * r.camera.aspect);
    const dist = (radius / Math.sin(effective / 2)) * 1.15 * Math.max(orbit.zoom, 0.2);

    const p = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, orbit.pitch));
    r.camera.position.set(
        dist * Math.cos(p) * Math.sin(orbit.yaw),
        dist * Math.sin(p),
        dist * Math.cos(p) * Math.cos(orbit.yaw),
    );
    r.camera.lookAt(0, 0, 0);
    r.camera.updateProjectionMatrix();

    r.renderer.render(r.scene, r.camera);

    const ctx = target.getContext('2d');
    if (!ctx) return null;
    ctx.clearRect(0, 0, target.width, target.height);
    // ⛔ NOT letterboxed. The buffer was sized to the card's own aspect, so a 1:1
    // blit is exact — unlike the showroom, where a square subject in a square
    // buffer must be letterboxed into a non-square box.
    ctx.drawImage(r.canvas, 0, 0, target.width, target.height);

    // ── The projection readback ───────────────────────────────────────────────
    //
    // ⭐ THIS IS WHAT MAKES PICKING POSSIBLE WITHOUT A RAYCASTER AND WITHOUT
    // LEAKING A THREE TYPE. The widget receives plain screen coordinates and does
    // its hit-testing in 2-D — which also gives it crisp labels for free.
    const out = new Map<string, ProjectedNode>();
    const v = new THREE.Vector3();
    const sx = target.width / w;
    const sy = target.height / h;
    for (const n of subject.nodes) {
        v.set(n.p[0], n.p[1], n.p[2]).project(r.camera);
        // ⛔ A node behind the camera projects to a MIRRORED point. Excluding it is
        // correct rather than defensive: it is not on screen, so it must not be
        // pickable, and a label drawn at its mirrored position would name the wrong
        // element in the wrong place.
        if (v.z > 1) continue;
        const px = ((v.x + 1) / 2) * w * sx;
        const py = ((1 - v.y) / 2) * h * sy;
        const camDist = Math.hypot(
            n.p[0] - r.camera.position.x,
            n.p[1] - r.camera.position.y,
            n.p[2] - r.camera.position.z,
        );
        const screenR = ((n.r / Math.max(camDist, 1e-3)) * (h * sy)) / (2 * Math.tan(fov / 2));
        out.set(n.id, { x: px, y: py, depth: v.z, r: screenR });
    }
    return out;
}

/** A pending graph draw per target canvas, so requests coalesce per surface. */
const pendingGraph = new WeakMap<HTMLCanvasElement, () => void>();

/**
 * Request ONE graph frame for `target`. Coalesced exactly like
 * {@link requestPreviewDraw}: repeated calls inside a single frame collapse to
 * one draw and the newest state wins. Never starts a loop.
 *
 * `onProjected` receives the node screen positions produced by that draw, or
 * `null` when no WebGL context was available — the caller then shows a NAMED
 * reason rather than an empty box, because "the viewport failed" and "this view
 * has nothing to draw" must never look the same (§CONTEXT-DATA-HONESTY).
 */
export function requestGraphDraw(
    subject: GraphSubject,
    target: HTMLCanvasElement,
    orbit: OrbitState,
    onProjected?: (projected: Map<string, ProjectedNode> | null) => void,
): void {
    const already = pendingGraph.get(target);
    if (already) already();
    const dispose = getFrameScheduler().scheduleOnce('analysis-graph-3d-draw', () => {
        pendingGraph.delete(target);
        onProjected?.(drawGraphNow(subject, target, orbit));
    });
    pendingGraph.set(target, dispose);
}
