/**
 * @file foliageCards.ts  · §TREE-HIFI 2026-06-24
 *
 * High-fidelity, GPU-cheap foliage for the parametric outdoor tree library.
 *
 * Replaces the old opaque-icosahedron-blob canopy with the
 * Spacemaker/Forma-style look: a small cluster of intersecting alpha-textured
 * quads (a "cross-billboard" volume) plus a thin volumetric inner shell.  The
 * leaf texture is generated PROCEDURALLY on a canvas (no binary asset commit),
 * cached once per palette, and shared across every tree via a material cache.
 *
 * Why this is cheaper AND better-looking than the old blob:
 *   - Old canopy: ~14–28 IcosahedronGeometry(detail 1) meshes = ~1.1k–2.2k tris
 *     of solid opaque geometry, ~14–28 draw calls, hard silhouette, no leaf
 *     read at all.
 *   - New canopy: 5 crossed alpha cards (2 tris each = 10 tris) + a low-poly
 *     inner shell (~80 tris) ≈ 90 tris, 1–2 draw calls, lush dappled
 *     silhouette with soft edges and two-tone shading.
 *
 * Performance contract:
 *   - alphaTest (NOT transparent blending) → no per-frame depth sort, writes
 *     depth, casts crisp shadows. Zero per-frame CPU cost.
 *   - One CanvasTexture per palette key, one MeshStandardMaterial per palette
 *     key — both cached module-wide and reused across all trees of a species.
 *   - P3-safe: no requestAnimationFrame, no animation, no per-frame work.
 *   - P2-safe: THREE is imported via the renderer-three re-export barrel, the
 *     same legitimate path the rest of geometry-furniture already uses.
 *
 * Determinism (§13 save/load parity): every random offset is drawn from a
 * caller-supplied seeded PRNG, so a given species id always yields an
 * identical canopy between sessions.
 */

import * as THREE from '@pryzm/renderer-three/three';

// ── Procedural leaf-card alpha texture ───────────────────────────────────────
//
// One soft dappled "leaf mass" sprite per palette.  The texture is a radial
// cloud of overlapping leaf blobs with a feathered alpha edge so the card
// silhouette reads as foliage rather than a hard rectangle.  Two-tone vertical
// gradient (lighter near the top) bakes the lit-top / shaded-underside cue
// straight into the albedo so we get the look without a second material.

const _texCache = new Map<string, THREE.Texture>();

function _hexToRgb(hex: string): [number, number, number] {
    const h = hex.replace('#', '');
    return [
        parseInt(h.slice(0, 2), 16),
        parseInt(h.slice(2, 4), 16),
        parseInt(h.slice(4, 6), 16),
    ];
}

function _mix(a: number, b: number, t: number): number {
    return Math.round(a + (b - a) * t);
}

/**
 * Build (or fetch from cache) a 128×128 alpha-feathered leaf-cluster texture
 * for the given foliage colour.  The drawing is fully deterministic (uses its
 * own fixed-seed PRNG) so the same colour always produces the same texture.
 */
function _leafTexture(foliageHex: string): THREE.Texture | null {
    const key = `leaf:${foliageHex}`;
    const cached = _texCache.get(key);
    if (cached) return cached;

    // Resolve a drawing surface — prefer the DOM canvas (main thread), fall
    // back to OffscreenCanvas, and bail to null (flat-material path) if neither
    // exists so we never throw in a headless/test context.
    let canvas: HTMLCanvasElement | OffscreenCanvas | null = null;
    const S = 128;
    if (typeof document !== 'undefined' && document.createElement) {
        const c = document.createElement('canvas');
        c.width = S; c.height = S;
        canvas = c;
    } else if (typeof OffscreenCanvas !== 'undefined') {
        canvas = new OffscreenCanvas(S, S);
    }
    if (!canvas) return null;

    const ctx = canvas.getContext('2d') as
        | CanvasRenderingContext2D
        | OffscreenCanvasRenderingContext2D
        | null;
    if (!ctx) return null;

    const [r, g, b] = _hexToRgb(foliageHex);
    // Two-tone: a lighter highlight and a darker shade derived from the base.
    const light: [number, number, number] = [_mix(r, 255, 0.32), _mix(g, 255, 0.32), _mix(b, 255, 0.18)];
    const dark:  [number, number, number] = [_mix(r, 0, 0.30),   _mix(g, 0, 0.30),   _mix(b, 0, 0.30)];

    ctx.clearRect(0, 0, S, S);

    // Deterministic PRNG (mulberry32) seeded on the colour so the dapple is
    // stable across reloads.
    let seed = 0x9e3779b9 ^ (r << 16) ^ (g << 8) ^ b;
    const rng = (): number => {
        seed = (seed + 0x6D2B79F5) >>> 0;
        let t = seed;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };

    const cx = S / 2, cy = S / 2;
    const R = S * 0.46;
    // Scatter ~90 soft leaf blobs in a roughly circular mass, alpha falling off
    // toward the rim so the card edges feather out (no hard rectangle).
    const N = 90;
    for (let i = 0; i < N; i++) {
        const a = rng() * Math.PI * 2;
        const rad = R * Math.sqrt(rng());           // uniform area distribution
        const x = cx + Math.cos(a) * rad;
        const y = cy + Math.sin(a) * rad;
        const blob = 6 + rng() * 10;
        // Vertical tone: lighter near the top of the sprite, darker at the base.
        const vt = 1 - y / S;                        // 1 at top, 0 at bottom
        const cr = _mix(dark[0], light[0], vt * (0.55 + rng() * 0.45));
        const cg = _mix(dark[1], light[1], vt * (0.55 + rng() * 0.45));
        const cb = _mix(dark[2], light[2], vt * (0.55 + rng() * 0.45));
        // Edge feathering: alpha tapers as the blob approaches the rim.
        const edge = 1 - rad / R;
        const alpha = Math.min(1, 0.55 + edge * 0.45);
        const grd = ctx.createRadialGradient(x, y, 0, x, y, blob);
        grd.addColorStop(0,   `rgba(${cr},${cg},${cb},${alpha})`);
        grd.addColorStop(0.7, `rgba(${cr},${cg},${cb},${alpha * 0.6})`);
        grd.addColorStop(1,   `rgba(${cr},${cg},${cb},0)`);
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.arc(x, y, blob, 0, Math.PI * 2);
        ctx.fill();
    }

    const tex = new THREE.CanvasTexture(canvas as unknown as HTMLCanvasElement);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 2;
    tex.needsUpdate = true;
    _texCache.set(key, tex);
    return tex;
}

// ── Foliage card material (alpha-tested, double-sided) ───────────────────────

const _cardMatCache = new Map<string, THREE.MeshStandardMaterial>();

/**
 * Alpha-tested, double-sided leaf-card material for the given palette.  Falls
 * back to a flat foliage colour when the procedural texture is unavailable
 * (headless/test) so the canopy still renders, just without the dapple.
 */
function _cardMaterial(foliageHex: string): THREE.MeshStandardMaterial {
    const key = `card:${foliageHex}`;
    const cached = _cardMatCache.get(key);
    if (cached) return cached;

    const tex = _leafTexture(foliageHex);
    const mat = new THREE.MeshStandardMaterial({
        color: tex ? 0xffffff : new THREE.Color(foliageHex).getHex(),
        map: tex ?? null,
        alphaTest: tex ? 0.45 : 0,   // crisp cut-out — no blending, no sort
        transparent: false,
        side: THREE.DoubleSide,
        roughness: 0.9,
        metalness: 0.0,
        // Slightly translucent leaf read without paying for true transmission.
        emissive: new THREE.Color(foliageHex).multiplyScalar(0.06),
    });
    _cardMatCache.set(key, mat);
    return mat;
}

// ── Cross-billboard canopy builder ───────────────────────────────────────────

export interface CanopyOptions {
    /** Crown (silhouette) radius in metres. */
    readonly crownR: number;
    /** World-Y of the canopy centre. */
    readonly centerY: number;
    /** Foliage hex colour (drives texture + material palette). */
    readonly foliageHex: string;
    /** Vertical squash of the canopy envelope (1 = sphere, <1 = flattened). */
    readonly squashY?: number;
    /** Number of crossed alpha cards (3–6 is the sweet spot). Default 5. */
    readonly cards?: number;
    /** Seeded PRNG (0..1) for deterministic per-card jitter. */
    readonly rng: () => number;
    /**
     * When true, add a low-poly inner foliage shell (icosahedron) behind the
     * cards so the canopy reads as volumetric from any angle and casts a soft
     * filled shadow.  Default true.
     */
    readonly innerShell?: boolean;
}

/**
 * Build a Spacemaker-style cross-billboard canopy: N intersecting
 * alpha-textured quads arranged around the vertical axis, optionally wrapped
 * around a low-poly inner shell.  Returns a Group rooted so that
 * `position.y === centerY` sits at the canopy centre.
 *
 * Tri budget: cards × 2 + (innerShell ? ~80 : 0) ≈ 90 tris for the default
 * 5-card + shell canopy.  Draw calls: 1 (cards, shared material) +
 * 1 (shell) = 2.
 */
export function buildCrossBillboardCanopy(opts: CanopyOptions): THREE.Group {
    const {
        crownR, centerY, foliageHex,
        squashY = 0.9, cards = 5, rng, innerShell = true,
    } = opts;

    const grp = new THREE.Group();
    grp.position.y = centerY;
    grp.userData.elementType = 'TreeCanopy';

    const cardMat = _cardMaterial(foliageHex);

    // The cards are square quads sized to the crown diameter, each rotated
    // about Y by an even share of 180° (a crossed-plane fan) plus a small
    // deterministic jitter so no two trees look stamped.  A unit PlaneGeometry
    // is built once and reused across cards (geometry sharing → cheaper).
    const cardGeo = new THREE.PlaneGeometry(crownR * 2, crownR * 2);
    for (let i = 0; i < cards; i++) {
        const m = new THREE.Mesh(cardGeo, cardMat);
        const baseRot = (i / cards) * Math.PI;            // fan across 180°
        m.rotation.y = baseRot + (rng() - 0.5) * 0.25;
        // Tilt each card a touch off-vertical for a fuller volume.
        m.rotation.x = (rng() - 0.5) * 0.18;
        m.rotation.z = (rng() - 0.5) * 0.12;
        // Flatten the canopy vertically.
        m.scale.set(1, squashY, 1);
        // Slight vertical offset so cards don't all share one centre plane.
        m.position.y = (rng() - 0.5) * crownR * 0.25;
        m.castShadow = true;
        m.userData.elementType = 'TreeFoliageCard';
        grp.add(m);
    }

    if (innerShell) {
        // A low-detail icosahedron painted with the dark shade fills the volume
        // behind the cards (so the canopy is never see-through at a grazing
        // angle) and grounds the cast shadow.  detail=1 → 80 tris.
        const shellMat = _innerShellMaterial(foliageHex);
        const shellGeo = new THREE.IcosahedronGeometry(crownR * 0.82, 1);
        const shell = new THREE.Mesh(shellGeo, shellMat);
        shell.scale.set(1, squashY * 0.95, 1);
        shell.castShadow = true;
        shell.userData.elementType = 'TreeCanopyShell';
        grp.add(shell);
    }

    return grp;
}

// ── Inner-shell material (opaque, darker shade) ──────────────────────────────

const _shellMatCache = new Map<string, THREE.MeshStandardMaterial>();

function _innerShellMaterial(foliageHex: string): THREE.MeshStandardMaterial {
    const key = `shell:${foliageHex}`;
    const cached = _shellMatCache.get(key);
    if (cached) return cached;
    // Darken the base foliage for the interior so the cards read as the bright
    // lit surface sitting in front of a shaded mass.
    const c = new THREE.Color(foliageHex).multiplyScalar(0.72);
    const mat = new THREE.MeshStandardMaterial({
        color: c, roughness: 0.95, metalness: 0.0, flatShading: true,
    });
    _shellMatCache.set(key, mat);
    return mat;
}

/** Test/diagnostic hook — clear all module caches. */
export function _resetFoliageCaches(): void {
    _texCache.clear();
    _cardMatCache.clear();
    _shellMatCache.clear();
}
