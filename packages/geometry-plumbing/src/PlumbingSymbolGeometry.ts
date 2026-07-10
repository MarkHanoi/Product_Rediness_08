/**
 * PlumbingSymbolGeometry — §FEAT-PLUMBING-PLAN-ELEV-SYMBOLS (L-221)
 *
 * PURE, deterministic 2D symbol linework for plumbing fixtures. No THREE, no
 * DOM, no store access — just fixture parameters → flat line-segment buffers.
 * Consumed by `PlumbingPlanSymbolBuilder` (top-view / A-PLMB plan symbols) and
 * `PlumbingElevationSymbolBuilder` (vertical-view silhouette + profile).
 *
 * Why this exists (drawing correctness, not only aesthetics):
 *   The LOD400 3D fixtures (ToiletGeometry, ShowerGeometry, …) are built from
 *   extruded D-silhouettes, bevels, spheres and cylinders so the *shaded* model
 *   reads as real ceramic. When `EdgeProjectorService` runs `THREE.EdgesGeometry`
 *   over those meshes it emits thousands of triangulation edges per fixture
 *   (measured: ~55 ms edge-extraction + ~10.8 k hidden-line-removal segments for
 *   ONE toilet). An architectural drawing must show a toilet as a *standardised
 *   symbol* — bowl outline + cistern rectangle in plan, stepped silhouette in
 *   elevation — not a wireframe trace of its mesh.
 *
 * Local frame (shared by every fixture factory in this package):
 *   • origin = floor level, at the fixture's back-centre (against the wall)
 *   • +X = right, +Y = up, +Z = away from the wall (fixture front)
 * The caller applies the fixture's world position + rotation, then projects the
 * linework through `OBC.TechnicalDrawing.toDrawingSpace` — identical to the
 * Sofa / Door plan-symbol builders.
 *
 * P5 exhaustiveness: `resolveFixtureFootprint` / `buildPlanLinework` /
 * `buildElevationLinework` switch over the full `PlumbingFixtureType` union with
 * a compile-time `assertNever` default, so adding a new fixture type is a build
 * error until a symbol is authored for it.
 */

import type { PlumbingFixtureType } from './PlumbingTypes';
import type { ToiletVariant } from './ToiletGeometry';
import type { ShowerVariant } from './ShowerGeometry';
import type { BathroomAccessoryVariant } from './BathroomAccessoryGeometry';
import { TOILET_FOOTPRINTS, DEFAULT_TOILET_VARIANT } from './ToiletGeometry';
import { SHOWER_FOOTPRINTS, DEFAULT_SHOWER_VARIANT } from './ShowerGeometry';
import { ACCESSORY_FOOTPRINTS, DEFAULT_ACCESSORY_VARIANT } from './BathroomAccessoryGeometry';

/** Minimal fixture description the pure symbol builders need. Subset of `PlumbingFixtureData`. */
export interface FixtureSymbolInput {
    fixtureType: PlumbingFixtureType;
    toiletVariant?: ToiletVariant;
    showerVariant?: ShowerVariant;
    accessoryVariant?: BathroomAccessoryVariant;
    width?: number;
    length?: number;
    height?: number;
}

export interface FixtureFootprint {
    /** Width across (x) in metres. */
    width: number;
    /** Depth from wall (z) in metres. */
    length: number;
    /** Total height from floor (y) in metres. */
    height: number;
}

function assertNever(x: never): never {
    throw new Error(`PlumbingSymbolGeometry: unhandled fixture type "${String(x)}"`);
}

// Fallback footprints for families with no parametric FOOTPRINTS table
// (data-driven or legacy fixed geometry). Chosen to match the 3D builders:
//   • sink  — createSinkMesh rim is 0.65 × 0.50, mounted ~0.85 high.
//   • bath  — createBathMesh defaults 1.70 × 0.75 × 0.60 (data can override).
//   • urinal / bidet — no dedicated 3D factory yet (they fall through to the
//     toilet mesh in PlumbingFragmentBuilder); use conventional sanitaryware
//     footprints so the symbol is still architecturally correct.
const SINK_FALLBACK:   FixtureFootprint = { width: 0.65, length: 0.50, height: 0.85 };
const BATH_FALLBACK:   FixtureFootprint = { width: 1.70, length: 0.75, height: 0.60 };
const URINAL_FALLBACK: FixtureFootprint = { width: 0.38, length: 0.35, height: 0.65 };
const BIDET_FALLBACK:  FixtureFootprint = { width: 0.38, length: 0.56, height: 0.40 };

function withOverrides(base: FixtureFootprint, d: FixtureSymbolInput): FixtureFootprint {
    return {
        width:  d.width  && d.width  > 0 ? d.width  : base.width,
        length: d.length && d.length > 0 ? d.length : base.length,
        height: d.height && d.height > 0 ? d.height : base.height,
    };
}

/**
 * Resolve the fixture's plan/elevation bounding footprint from the SAME source
 * of truth the 3D builders use (the FOOTPRINTS tables / data overrides), so the
 * symbol silhouette matches the placed mesh exactly (Contract 36 §5 / 39 §5).
 */
export function resolveFixtureFootprint(d: FixtureSymbolInput): FixtureFootprint {
    const t = d.fixtureType;
    switch (t) {
        case 'toilet':    return TOILET_FOOTPRINTS[d.toiletVariant ?? DEFAULT_TOILET_VARIANT];
        case 'shower':    return SHOWER_FOOTPRINTS[d.showerVariant ?? DEFAULT_SHOWER_VARIANT];
        case 'accessory': return ACCESSORY_FOOTPRINTS[d.accessoryVariant ?? DEFAULT_ACCESSORY_VARIANT];
        case 'sink':      return withOverrides(SINK_FALLBACK,   d);
        case 'bath':      return withOverrides(BATH_FALLBACK,   d);
        case 'urinal':    return withOverrides(URINAL_FALLBACK, d);
        case 'bidet':     return withOverrides(BIDET_FALLBACK,  d);
        default:          return assertNever(t);
    }
}

/** True when a toilet variant carries a visible close-coupled cistern (vs wall-hung concealed). */
function isCloseCoupled(v: ToiletVariant | undefined): boolean {
    const variant = v ?? DEFAULT_TOILET_VARIANT;
    return variant === 'close_coupled_square' || variant === 'close_coupled_round';
}

/** True when a toilet variant has a full-round (vs square-D) bowl. */
function isRoundBowl(v: ToiletVariant | undefined): boolean {
    const variant = v ?? DEFAULT_TOILET_VARIANT;
    return variant === 'wall_hung_round' || variant === 'close_coupled_round';
}

// ── Plan primitives (flat [x, 0, z, x, 0, z, …]) ─────────────────────────────

function planSeg(acc: number[], ax: number, az: number, bx: number, bz: number): void {
    acc.push(ax, 0, az, bx, 0, bz);
}

function planRect(acc: number[], x0: number, z0: number, x1: number, z1: number): void {
    planSeg(acc, x0, z0, x1, z0);
    planSeg(acc, x1, z0, x1, z1);
    planSeg(acc, x1, z1, x0, z1);
    planSeg(acc, x0, z1, x0, z0);
}

function planCircle(acc: number[], cx: number, cz: number, r: number, segs = 16): void {
    for (let i = 0; i < segs; i++) {
        const a0 = (i / segs) * Math.PI * 2;
        const a1 = ((i + 1) / segs) * Math.PI * 2;
        planSeg(acc, cx + r * Math.cos(a0), cz + r * Math.sin(a0),
                     cx + r * Math.cos(a1), cz + r * Math.sin(a1));
    }
}

/**
 * "D" bowl outline in plan: flat back edge at z=zBack, straight sides, rounded
 * front sweeping to z=zFront. `frontness` shapes the front (0 ≈ square-D, 1 ≈
 * full round). Matches the ToiletGeometry `dShape` convention (bowl outline).
 */
function planDOutline(
    acc: number[], halfW: number, zBack: number, zFront: number,
    frontness: number, arcSegs = 12,
): void {
    const length = Math.max(0.001, zFront - zBack);
    const r = Math.min(halfW, length) * (0.30 + 0.55 * frontness);
    const straight = Math.max(0, length - r);
    const zArc = zBack + straight;

    planSeg(acc, -halfW, zBack, halfW, zBack);        // back edge
    planSeg(acc,  halfW, zBack, halfW, zArc);         // right straight side
    planSeg(acc, -halfW, zBack, -halfW, zArc);        // left straight side
    // Rounded front: half-ellipse, radii (halfW, r), theta 0 (right) → π (left).
    for (let i = 0; i < arcSegs; i++) {
        const t0 = (i / arcSegs) * Math.PI;
        const t1 = ((i + 1) / arcSegs) * Math.PI;
        planSeg(acc,
            halfW * Math.cos(t0), zArc + r * Math.sin(t0),
            halfW * Math.cos(t1), zArc + r * Math.sin(t1));
    }
}

// ── Elevation primitives (flat [x, y, z, x, y, z, …]) ────────────────────────
//
// The FRONT profile lives in the X-Y plane at z = zPlane (mid-depth). The SIDE
// profile lives in the Z-Y plane at x = 0. When projected through toDrawingSpace
// for a cardinal elevation, whichever profile faces the viewer reads as the
// silhouette; the perpendicular one collapses to a single vertical line. This
// gives a correct, bounded elevation for all four building elevations without a
// view-direction lookup inside the pure builder.

function frontSeg(acc: number[], ax: number, ay: number, bx: number, by: number, zPlane: number): void {
    acc.push(ax, ay, zPlane, bx, by, zPlane);
}

function frontRect(acc: number[], x0: number, y0: number, x1: number, y1: number, zPlane: number): void {
    frontSeg(acc, x0, y0, x1, y0, zPlane);
    frontSeg(acc, x1, y0, x1, y1, zPlane);
    frontSeg(acc, x1, y1, x0, y1, zPlane);
    frontSeg(acc, x0, y1, x0, y0, zPlane);
}

function sideRect(acc: number[], z0: number, y0: number, z1: number, y1: number, xPlane = 0): void {
    acc.push(xPlane, y0, z0, xPlane, y0, z1);
    acc.push(xPlane, y0, z1, xPlane, y1, z1);
    acc.push(xPlane, y1, z1, xPlane, y1, z0);
    acc.push(xPlane, y1, z0, xPlane, y0, z0);
}

// ── Plan symbol assembly ─────────────────────────────────────────────────────

/**
 * Build the PLAN (top-view) symbol linework for one fixture, in the local XZ
 * frame (origin = floor back-centre, +Z = front). Returns a flat
 * [x, 0, z, x, 0, z, …] line-segment buffer. Pure + deterministic.
 */
export function buildPlanLinework(d: FixtureSymbolInput): number[] {
    const fp = resolveFixtureFootprint(d);
    const acc: number[] = [];
    const hw = fp.width / 2;
    const t = d.fixtureType;

    switch (t) {
        case 'toilet': {
            const round = isRoundBowl(d.toiletVariant);
            const coupled = isCloseCoupled(d.toiletVariant);
            const cisternD = coupled ? Math.min(0.22, fp.length * 0.32) : 0.10;
            planRect(acc, -hw, 0, hw, cisternD);                              // cistern / concealed plate
            planDOutline(acc, hw * 0.94, cisternD, fp.length, round ? 0.95 : 0.4); // bowl outline
            planDOutline(acc, hw * 0.72, cisternD + 0.06, fp.length - 0.06, round ? 0.95 : 0.4); // seat/rim
            break;
        }
        case 'sink': {
            planRect(acc, -hw, 0, hw, fp.length);                             // rim outline
            planCircle(acc, 0, fp.length * 0.55, Math.min(hw, fp.length / 2) * 0.68); // basin bowl
            planSeg(acc, 0, 0.02, 0, 0.10);                                   // faucet tick at back
            break;
        }
        case 'bath': {
            planRect(acc, -hw, 0, hw, fp.length);                            // outer rim
            planRect(acc, -hw + 0.06, 0.06, hw - 0.06, fp.length - 0.06);    // inner basin
            planCircle(acc, 0, fp.length - 0.14, 0.03, 12);                  // drain
            break;
        }
        case 'shower': {
            // Tray outline + drain cross (classic shower plan symbol). Slim
            // "system" showers (no tray) still read as a small footprint + head.
            planRect(acc, -hw, 0, hw, fp.length);
            planSeg(acc, -hw, 0, hw, fp.length);                             // diagonal
            planSeg(acc, -hw, fp.length, hw, 0);                             // diagonal
            planCircle(acc, 0, fp.length * 0.5, Math.min(hw, fp.length / 2) * 0.22, 12); // drain
            break;
        }
        case 'bidet': {
            planDOutline(acc, hw, 0.02, fp.length, 0.9);                     // bowl outline
            planDOutline(acc, hw * 0.66, 0.08, fp.length - 0.06, 0.9);       // inner bowl
            break;
        }
        case 'urinal': {
            planRect(acc, -hw, 0, hw, fp.length * 0.5);                      // wall-mounted body
            planDOutline(acc, hw * 0.82, fp.length * 0.5, fp.length, 0.95);  // bowl lip
            break;
        }
        case 'accessory': {
            planRect(acc, -hw, 0, hw, fp.length);                            // bounding footprint
            if (d.accessoryVariant === 'washing_machine') {
                planCircle(acc, 0, fp.length * 0.55, Math.min(hw, fp.length / 2) * 0.6, 16); // door
            }
            break;
        }
        default:
            return assertNever(t);
    }
    return acc;
}

// ── Elevation symbol assembly ────────────────────────────────────────────────

/**
 * Build the ELEVATION (vertical-view) symbol linework for one fixture, in the
 * local frame (origin = floor back-centre, +Y = up, +Z = front). Returns a flat
 * [x, y, z, x, y, z, …] line-segment buffer combining a family FRONT profile
 * (X-Y plane) and a bounding SIDE profile (Z-Y plane). Pure + deterministic.
 */
export function buildElevationLinework(d: FixtureSymbolInput): number[] {
    const fp = resolveFixtureFootprint(d);
    const acc: number[] = [];
    const hw = fp.width / 2;
    const H = fp.height;
    const zMid = fp.length / 2;
    const t = d.fixtureType;

    // Bounding SIDE profile (depth × height) so side elevations read as a clean
    // box rather than a collapsed line. Shared by every family.
    sideRect(acc, 0, 0, fp.length, H);

    switch (t) {
        case 'toilet': {
            const coupled = isCloseCoupled(d.toiletVariant);
            if (coupled) {
                const bowlTop = Math.min(H * 0.55, 0.42);
                frontRect(acc, -hw, 0, hw, bowlTop, zMid);                    // bowl block
                frontRect(acc, -hw * 0.95, bowlTop, hw * 0.95, H, zMid);      // cistern block
                frontSeg(acc, -hw, bowlTop, hw, bowlTop, zMid);              // seat line
            } else {
                frontRect(acc, -hw, H * 0.45, hw, H, zMid);                   // wall-hung bowl
                frontSeg(acc, -hw * 0.5, 0, -hw * 0.5, H * 0.45, zMid);      // support bracket
                frontSeg(acc,  hw * 0.5, 0,  hw * 0.5, H * 0.45, zMid);
            }
            break;
        }
        case 'sink': {
            const basinY = Math.max(0.05, H - 0.20);
            frontRect(acc, -hw * 0.22, 0, hw * 0.22, basinY, zMid);           // pedestal column
            frontRect(acc, -hw, basinY, hw, H, zMid);                        // basin block
            break;
        }
        case 'bath': {
            frontRect(acc, -hw, 0, hw, H, zMid);                              // tub body
            frontSeg(acc, -hw, H - 0.06, hw, H - 0.06, zMid);               // rim line
            break;
        }
        case 'shower': {
            frontRect(acc, -hw, 0, hw, H, zMid);                              // enclosure / column
            frontSeg(acc, -hw * 0.5, H - 0.04, hw * 0.5, H - 0.04, zMid);    // rain-head bar
            break;
        }
        case 'bidet': {
            frontRect(acc, -hw, 0, hw, H, zMid);
            break;
        }
        case 'urinal': {
            frontRect(acc, -hw, H * 0.35, hw, H, zMid);                       // wall-mounted bowl
            break;
        }
        case 'accessory': {
            frontRect(acc, -hw, 0, hw, H, zMid);
            if (d.accessoryVariant === 'washing_machine') {
                // door circle on the front face (approximated by an octagon)
                const cx = 0, cy = H * 0.55, r = Math.min(hw, H / 2) * 0.6, segs = 12;
                for (let i = 0; i < segs; i++) {
                    const a0 = (i / segs) * Math.PI * 2;
                    const a1 = ((i + 1) / segs) * Math.PI * 2;
                    frontSeg(acc, cx + r * Math.cos(a0), cy + r * Math.sin(a0),
                                  cx + r * Math.cos(a1), cy + r * Math.sin(a1), zMid);
                }
            }
            break;
        }
        default:
            return assertNever(t);
    }
    return acc;
}
