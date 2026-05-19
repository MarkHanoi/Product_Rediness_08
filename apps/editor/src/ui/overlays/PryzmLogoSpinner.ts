/**
 * PryzmLogoSpinner.ts — §PRYZM-LOGO-SPINNER
 *
 * Shared CSS 3-D rotating PRYZM pyramid logo.
 *
 * Architectural rationale:
 *   - Zero JS animation loop: every frame is driven by the CSS compositor
 *     thread, which continues running even when the main JS thread is blocked
 *     by LONGTASKs (WebGPU PSO compilation, geometry builds, IFC parsing, etc.)
 *   - A single shared factory ensures the EngineLoadingOverlay and the
 *     BatchLoadingIndicator show an *identical* prism — one source of truth.
 *   - No engine imports. Complies with C01 §2 (Layer Isolation).
 *
 * CSS 3-D pyramid geometry (square-base, 4 triangular faces):
 *
 *   BASE = 36 px  (full base edge length)
 *   HALF = 18 px  (half-base — also the Z-offset for each face from centre)
 *   HEIGHT = 52 px
 *   SLANT = 55 px (face slant from base-edge midpoint to apex;
 *                  sqrt(18² + 52²) ≈ 55.0 px)
 *   TILT  = 19 deg (face tilt from vertical; atan(18/52) ≈ 19.1°)
 *
 *   Each face <div>:
 *     • width: 36 px, height: 55 px
 *     • clip-path: polygon(50% 0%, 0% 100%, 100% 100%)  ← triangle, apex at top
 *     • transform-origin: 50% 100%  ← pivot at base-edge midpoint
 *     • transform: rotateY(n×90deg) translateZ(18px) rotateX(19deg)
 *
 *   Applying left-to-right (which is the CSS order in world-space terms):
 *     1. rotateY(n×90deg)   — orient this face to the N/E/S/W compass side
 *     2. translateZ(18px)   — push the pivot to the outer edge of the pyramid
 *        (18 px in the face's already-oriented local Z, = half-base in world)
 *     3. rotateX(19deg)     — tilt the face so the apex points inward to Z=0
 *
 *   Verified: apex ends up exactly at pyramid-container (0, 0, 0) top-centre;
 *   base-edge midpoint at Z=+18 from pyramid centre. ✓
 *
 * Spin animation (pyramid container):
 *   @keyframes: rotateX(-22deg) rotateY(0 → -360deg) over 4 s linear infinite
 *   The rotateX(-22deg) gives a constant slight top-down angle so the apex
 *   is always partially visible, confirming the 3-D prism shape.
 *
 * Shadow / filter isolation:
 *   CSS `filter` on any element forces ALL descendant `transform-style: preserve-3d`
 *   to flatten (CSS Compositing §6.1 "grouping context"). To apply a drop-shadow
 *   WITHOUT killing the 3-D effect, the shadow is placed on an OUTER wrapper
 *   (`.pryzm-logo-spinner-wrap`) and the scene+pyramid are nested inside, filter-free.
 *   The factory returns the wrapper element.
 *
 * Usage:
 *   const spinner = createPryzmLogoSpinner('sm');   // BatchLoadingIndicator
 *   const spinner = createPryzmLogoSpinner('lg');   // EngineLoadingOverlay
 *   container.appendChild(spinner);
 *   // No teardown needed — CSS animations stop when the element leaves the DOM.
 */

const STYLE_ID = 'pryzm-logo-spinner-v2-style';

export type PryzmSpinnerSize = 'sm' | 'lg';

/**
 * Creates a self-contained CSS 3-D pyramid element.
 * Returns the outermost wrapper (safe to append anywhere).
 */
export function createPryzmLogoSpinner(size: PryzmSpinnerSize = 'lg'): HTMLElement {
    ensurePryzmSpinnerStyles();

    // Outer wrapper — carries the drop-shadow filter ISOLATED from the 3-D scene.
    // If filter were on the scene element (which owns `perspective`), it would
    // force transform-style: flat on all descendants, destroying the 3-D effect.
    const wrap = document.createElement('div');
    wrap.className = `pryzm-logo-spinner-wrap pryzm-logo-spinner-wrap--${size}`;

    // Scene — establishes the perspective frustum. No filter here.
    const scene = document.createElement('div');
    scene.className = 'pryzm-logo-spinner-scene';

    // Pyramid container — rotates in 3-D on the compositor thread.
    const pyramid = document.createElement('div');
    pyramid.className = 'pryzm-logo-spinner__pyramid';

    for (const side of ['front', 'right', 'back', 'left'] as const) {
        const face = document.createElement('div');
        face.className = `pryzm-logo-spinner__face pryzm-logo-spinner__face--${side}`;
        pyramid.appendChild(face);
    }

    scene.appendChild(pyramid);
    wrap.appendChild(scene);
    return wrap;
}

// ── Styles (injected once per page) ───────────────────────────────────────

function ensurePryzmSpinnerStyles(): void {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
        /* ── Compositor-thread pyramid spin — immune to JS LONGTASKs ─── */
        @keyframes pryzmLogoSpin {
            from { transform: rotateX(-22deg) rotateY(0deg); }
            to   { transform: rotateX(-22deg) rotateY(-360deg); }
        }

        /*
         * Outer wrapper: carries the drop-shadow ONLY.
         * Kept separate from the scene so the filter grouping context does NOT
         * flatten the child preserve-3d transforms. (CSS Compositing §6.1)
         */
        .pryzm-logo-spinner-wrap {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
            overflow: visible;
        }
        .pryzm-logo-spinner-wrap--lg {
            width: 44px;
            height: 56px;
            filter: drop-shadow(0px 8px 16px rgba(100,60,220,0.22));
        }
        .pryzm-logo-spinner-wrap--sm {
            width: 36px;
            height: 46px;
            /* Scale the entire 3-D assembly to 82% for the compact card */
            transform: scale(0.82);
            transform-origin: center center;
            filter: drop-shadow(0px 5px 8px rgba(100,60,220,0.16));
        }

        /*
         * Scene: perspective frustum. No filter — must be clean for preserve-3d.
         */
        .pryzm-logo-spinner-scene {
            width: 36px;
            height: 52px;
            position: relative;
            overflow: visible;
            perspective: 220px;
            perspective-origin: 50% 42%;
        }

        /* Pyramid container: 3-D space, spins on compositor thread.
         *
         * NOTE: will-change is intentionally absent here.
         * Adding will-change:transform to a preserve-3d element is a known
         * Chromium footgun that can flatten children by creating an independent
         * compositing layer BEFORE the 3D context is resolved. The CSS animation
         * property itself already promotes this element to the compositor thread.
         */
        .pryzm-logo-spinner__pyramid {
            width: 36px;
            height: 52px;
            position: relative;
            transform-style: preserve-3d;
            animation: pryzmLogoSpin 4s linear infinite;
        }

        /*
         * Faces — triangular divs in 3-D space.
         *
         * Geometry: BASE=36 HALF=18 HEIGHT=52 SLANT=55px TILT=19deg
         *
         * Transform applied left-to-right (world-space interpretation):
         *   rotateY(n×90deg)  → orient to compass side (N/E/S/W)
         *   translateZ(18px)  → push pivot to the pyramid's outer edge
         *   rotateX(19deg)    → tilt so the apex folds inward to Z=0
         *
         * transform-origin: 50% 100% — pivot at base-edge centre.
         *
         * Verified: apex at (cx, 0, 0) in container space; base at (cx, 52, 18). ✓
         *
         * backface-visibility: hidden  ← THE CRITICAL GLITCH FIX.
         * Each face is a backface for exactly 180° of every rotation.
         * With 'visible', the mirrored back-triangle overlaps adjacent front
         * faces and CSS 3D cannot depth-sort them (no per-pixel sort for
         * siblings), causing z-fighting flicker. 'hidden' removes back-facing
         * triangles from the render entirely — at any rotation angle exactly
         * 2 of the 4 faces are visible, which is physically correct.
         */
        .pryzm-logo-spinner__face {
            position: absolute;
            bottom: 0;
            left: 0;
            width: 36px;
            height: 55px;
            clip-path: polygon(50% 0%, 0% 100%, 100% 100%);
            transform-origin: 50% 100%;
            backface-visibility: hidden;
        }

        /* Face colours — transparent glass (image_1779120619207.png reference).
         * Semi-transparent white fills with slight opacity variation per face
         * so depth is still perceptible on gradient/coloured backgrounds.
         * The backface-visibility:hidden rule above means at most 2 faces are
         * ever simultaneously visible, so the overlaps never double-blend.
         */
        .pryzm-logo-spinner__face--front { background: rgba(255,255,255,0.28); transform: rotateY(0deg)   translateZ(18px) rotateX(19deg); }
        .pryzm-logo-spinner__face--right { background: rgba(255,255,255,0.14); transform: rotateY(90deg)  translateZ(18px) rotateX(19deg); }
        .pryzm-logo-spinner__face--back  { background: rgba(255,255,255,0.10); transform: rotateY(180deg) translateZ(18px) rotateX(19deg); }
        .pryzm-logo-spinner__face--left  { background: rgba(255,255,255,0.20); transform: rotateY(270deg) translateZ(18px) rotateX(19deg); }

        /* Respect reduced-motion — slow the spin to near-static */
        @media (prefers-reduced-motion: reduce) {
            .pryzm-logo-spinner__pyramid {
                animation-duration: 20s;
            }
        }
    `;
    document.head.appendChild(style);
}
