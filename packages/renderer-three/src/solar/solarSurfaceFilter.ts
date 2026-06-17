// ADR-0074 P1b (C21 §10) — solar surface-filter pure predicates.
//
// PURE + THREE-FREE decision helpers for the two solar-pass refinements:
//
//   1. EXTERIOR-ONLY filter — interior faces read ~0 sun-hours and pollute the
//      AVG/MIN. A face is treated as exterior when a short probe ray cast from the
//      face centre OUTWARD along its own normal escapes into open air, i.e. it does
//      NOT hit the building's own geometry within a small epsilon. The renderer-
//      three pass does the actual BVH raycast (THREE-side); this helper holds the
//      THREE-free DECISION (hit-distance → exterior?) so it is unit-testable.
//
//      Heuristic (documented + deterministic): keep a face if EITHER
//        (a) its outward normal points clearly UPWARD (a roof/slab top — these are
//            exterior by construction; ny ≥ UPWARD_NORMAL_Y), OR
//        (b) the outward probe ray's nearest self-hit is farther than
//            EXTERIOR_PROBE_EPS metres (the normal points into open air).
//      A face whose outward probe immediately hits the building (within the eps)
//      faces INTO an enclosed space → interior → dropped.
//
//   2. GLASS / GLAZING exclude — glass should neither cast a hard solid shadow as
//      an occluder nor be heat-mapped as an opaque surface. A mesh is glazing when
//      its userData.elementType matches a glazing token OR its material is markedly
//      transparent. Pure predicate over a minimal descriptor (no THREE types).

/** Metres: an outward probe self-hit nearer than this means the face is interior. */
export const EXTERIOR_PROBE_EPS = 0.25;

/** Outward-normal Y above which a face is taken as a roof/slab top (exterior). */
export const UPWARD_NORMAL_Y = 0.5;

/**
 * THREE-free exterior decision. Given a face's outward unit-normal Y component and
 * the distance to the nearest self-hit when probing OUT along that normal
 * (Infinity / null when nothing was hit), decide whether the face is exterior.
 *
 * - Upward-facing faces (roofs/slab tops) are always exterior.
 * - Otherwise: exterior iff the outward probe escaped past EXTERIOR_PROBE_EPS.
 *
 * Pure + deterministic.
 */
export function isExteriorFace(
    normalY: number,
    outwardHitDistance: number | null,
    eps: number = EXTERIOR_PROBE_EPS,
    upwardNormalY: number = UPWARD_NORMAL_Y,
): boolean {
    if (Number.isFinite(normalY) && normalY >= upwardNormalY) return true;
    if (outwardHitDistance === null || !Number.isFinite(outwardHitDistance)) return true;
    return outwardHitDistance > eps;
}

/** Lowercase tokens in userData.elementType that denote a glazing / glass surface. */
const GLAZING_TOKENS: ReadonlyArray<string> = [
    'glass',
    'glazing',
    'glazed',
    'windowpane',
    'windowglass',
    'curtainwallglass',
    'curtainglass',
    'pane',
];

/** Minimal THREE-free descriptor of a mesh for the glazing test. */
export interface GlazingDescriptor {
    /** mesh.userData.elementType (or any subtype hint), if present. */
    readonly elementType?: string | undefined;
    /** mesh.material.transparent, if a single material. */
    readonly transparent?: boolean | undefined;
    /** mesh.material.opacity (0..1), if a single material. */
    readonly opacity?: number | undefined;
}

/**
 * THREE-free glazing predicate. A mesh is glazing when its elementType contains a
 * glazing token, OR it is a transparent material with low opacity (≤ 0.6 — a glass
 * pane, not a faintly-translucent solid). Pure + deterministic.
 */
export function isGlazingSurface(d: GlazingDescriptor): boolean {
    const et = (d.elementType ?? '').toLowerCase().replace(/[\s_-]/g, '');
    if (et && GLAZING_TOKENS.some((tok) => et.includes(tok))) return true;
    if (d.transparent === true && typeof d.opacity === 'number' && d.opacity <= 0.6) return true;
    return false;
}
