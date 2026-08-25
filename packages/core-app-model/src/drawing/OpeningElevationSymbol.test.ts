/**
 * §ELEV-SYMBOL-OPENING (L-1240) — the authored opening elevation symbol.
 *
 * ⛔ **NO STUBS AT THE SEAM UNDER TEST.** The outline comes from the REAL `openingOutline`
 * (C86 §10.1 PR-1's single producer), the rake from the REAL `rakeShearPerMetre`, the
 * projection from the REAL `ElevationViewBasis`, and §E strokes into a REAL `CanvasRenderingContext2D`
 * through the REAL `renderSymbol`. The founder's own history is the reason: *"the founder could
 * re-weight his windows and watch nothing happen"* (L-280) shipped past a suite that tested the
 * resolver rather than the paint.
 *
 * The POSITIVE CONTROL throughout is the probe's own case table — a raked host viewed square-on
 * must stay byte-identical to an unraked one, because that is what the measured dump says the
 * SOLID does too. A test that only asserted "horizontal" would pass on a symbol that had
 * silently lost its rake.
 */
import { describe, it, expect } from 'vitest';
import {
    buildOpeningElevationSymbol,
    nearFaceSign,
    DEFAULT_FRAME_WIDTH_M,
    type ElevationSymbolHost,
    type ElevationSymbolOpening,
} from './OpeningElevationSymbol';
import { elevationViewBasis, projectToElevation, type Vec3 } from './ElevationViewBasis';
import { renderSymbol, symbolicRuleForLayer, hasSymbolicRenderer, type SymbolSegment } from './SymbolicRuleRenderer';

// ── Fixtures ──────────────────────────────────────────────────────────────────

/** A wall of length 6 m, bearing `bearingDeg` from +X, base at world Y 12.21 (founder's level 4). */
function wall(bearingDeg: number, rakeAngleDeg: number | null = null, curved = false): ElevationSymbolHost {
    const r = (bearingDeg * Math.PI) / 180;
    return {
        baseStart: { x: 2, z: 0 },
        baseEnd:   { x: 2 + 6 * Math.cos(r), z: 0 + 6 * Math.sin(r) },
        baseY: 12.21,
        thickness: 0.3,
        rakeAngleDeg,
        curved,
    };
}

const WINDOW: ElevationSymbolOpening = {
    id: 'op-1', type: 'window',
    offset: 2.4, width: 1.2, height: 1.4, sillHeight: 0.9,
};

/** Project a polyline through a basis and return its `(h, v)` points. */
function hv(points: readonly Vec3[], viewDir: { x: number; z: number }) {
    const basis = elevationViewBasis(viewDir)!;
    return points.map(p => projectToElevation(basis, p));
}

/** Angles (deg) of every edge of a CLOSED projected polyline, normalised to [0, 180). */
function edgeAngles(pts: Array<{ h: number; v: number }>): number[] {
    const out: number[] = [];
    for (let i = 0; i < pts.length; i++) {
        const a = pts[i]!, b = pts[(i + 1) % pts.length]!;
        const dh = b.h - a.h, dv = b.v - a.v;
        if (Math.hypot(dh, dv) < 1e-12) continue;
        let deg = (Math.atan2(dv, dh) * 180) / Math.PI;
        if (deg < 0) deg += 180;
        if (deg >= 180 - 1e-9) deg = 0;
        out.push(deg);
    }
    return out;
}

function outlineOf(res: ReturnType<typeof buildOpeningElevationSymbol>) {
    const pl = res.polylines.find(p => p.role === 'void-outline');
    expect(pl, 'a void-outline must always be emitted when there is no refusal').toBeDefined();
    return pl!;
}

// ── §A — THE INVARIANT (C86 §10.2) ────────────────────────────────────────────

describe('§A — head and sill are HORIZONTAL, and jambs PLUMB, in every true elevation', () => {
    const CASES: Array<[string, number, number | null]> = [
        ['A · vertical host, square-on',          0,   null],
        ['B · RAKED 75°, square-on',              0,   75],
        ['B2 · RAKED 110° (other hand), square-on', 0, 110],
        ['E · vertical host, bearing +20°',       20,  null],
        ['F · vertical host, bearing −20°',      -20,  null],
        ['C · vertical host, bearing 30°',        30,  null],
    ];

    it.each(CASES)('%s — the outline is a true rectangle in the sheet', (_label, bearing, rake) => {
        const host = wall(bearing, rake);
        const res = buildOpeningElevationSymbol(WINDOW, host, { detail: 'coarse' });
        expect(res.refusal).toBeNull();

        // A TRUE elevation is taken along the host's own normal. leftPerp of the wall direction.
        const r = (bearing * Math.PI) / 180;
        const viewDir = { x: Math.sin(r), z: -Math.cos(r) };

        const pts = hv(outlineOf(res).points, viewDir);
        const angles = edgeAngles(pts).map(a => Math.round(a * 1e6) / 1e6);
        // Exactly two horizontals (head, sill) and two plumbs (jambs) — nothing between.
        expect(angles.filter(a => a === 0)).toHaveLength(2);
        expect(angles.filter(a => Math.abs(a - 90) < 1e-6)).toHaveLength(2);
        expect(angles).toHaveLength(4);
    });

    it('B is BYTE-IDENTICAL to A square-on — the POSITIVE CONTROL that rake was not silently dropped', () => {
        // The probe measured this of the SOLID (case A vs case B: same 1.2000 head, same 1.4000
        // rise). The symbol must agree, or it is modelling a different building.
        const viewDir = { x: 0, z: -1 };
        const a = hv(outlineOf(buildOpeningElevationSymbol(WINDOW, wall(0, null), { detail: 'coarse' })).points, viewDir);
        const b = hv(outlineOf(buildOpeningElevationSymbol(WINDOW, wall(0, 75), { detail: 'coarse' })).points, viewDir);
        expect(b).toHaveLength(a.length);
        for (let i = 0; i < a.length; i++) {
            expect(b[i]!.h).toBeCloseTo(a[i]!.h, 12);
            expect(b[i]!.v).toBeCloseTo(a[i]!.v, 12);
        }
    });

    it('and the rake IS still carried — it moves the symbol in DEPTH, which is why it is invisible', () => {
        // DIFFERENTIATING against a symbol that simply ignored `rakeAngleDeg`: the world points
        // must differ even though their projection does not.
        const plain = outlineOf(buildOpeningElevationSymbol(WINDOW, wall(0, null), { detail: 'coarse' })).points;
        const raked = outlineOf(buildOpeningElevationSymbol(WINDOW, wall(0, 75), { detail: 'coarse' })).points;
        const movedInZ = raked.some((p, i) => Math.abs(p.z - plain[i]!.z) > 1e-6);
        expect(movedInZ, 'a raked host must displace the void in world, not merely draw the same').toBe(true);
        // …and never in height.
        raked.forEach((p, i) => expect(p.y).toBeCloseTo(plain[i]!.y, 12));
    });

    it('there is NO vertical foreshortening — the projected rise equals the authored height exactly', () => {
        // ⚠ Stated as a test because the received wisdom ("a rake foreshortens the opening
        // vertically") is FALSE for this repo's rake convention, and a contract that asserted it
        // would be asserting something the code does not do. `WallRake` keeps the height PLUMB;
        // a plumb rise projects unforeshortened onto a vertical picture plane.
        for (const rake of [null, 75, 110, 20, 160]) {
            const pts = hv(outlineOf(buildOpeningElevationSymbol(WINDOW, wall(0, rake), { detail: 'coarse' })).points,
                           { x: 0, z: -1 });
            const vs = pts.map(p => p.v);
            expect(Math.max(...vs) - Math.min(...vs), `rake ${rake}`).toBeCloseTo(WINDOW.height, 12);
        }
    });

    it('the head and sill sit at the AUTHORED world heights, on every host', () => {
        for (const [bearing, rake] of [[0, null], [20, 75], [-37, 110], [143, null]] as const) {
            const pts = hv(outlineOf(buildOpeningElevationSymbol(WINDOW, wall(bearing, rake), { detail: 'coarse' })).points,
                           { x: 0, z: -1 });
            const vs = pts.map(p => p.v);
            expect(Math.min(...vs)).toBeCloseTo(12.21 + 0.9, 9);
            expect(Math.max(...vs)).toBeCloseTo(12.21 + 0.9 + 1.4, 9);
        }
    });
});

// ── §B — the LEAN case G, explained rather than erased ────────────────────────

describe('§B — case G: a raked host on an OBLIQUE sheet leans WITH its wall, and that is stated', () => {
    it('the jamb tilt is exactly atan(cot(rake)·sin(bearing)) — not an artefact', () => {
        const bearingDeg = 20, rakeDeg = 75;
        const res = buildOpeningElevationSymbol(WINDOW, wall(bearingDeg, rakeDeg), { detail: 'coarse' });
        const pts = hv(outlineOf(res).points, { x: 0, z: -1 });   // CARDINAL sheet, oblique wall
        const angles = edgeAngles(pts);
        const k = 1 / Math.tan((rakeDeg * Math.PI) / 180);
        // Asserted as the DEVIATION FROM PLUMB, not as a signed angle: which way the jamb leans
        // depends on `leftPerp`'s sign for this wall, and pinning that would be pinning the
        // fixture's handedness rather than the geometry. The magnitude is the physics.
        const expectedTilt = (Math.atan(k * Math.sin((bearingDeg * Math.PI) / 180)) * 180) / Math.PI;
        expect(expectedTilt).toBeCloseTo(5.2362, 4);
        const jambs = angles.filter(a => a > 45);
        expect(jambs).toHaveLength(2);
        for (const j of jambs) expect(Math.abs(j - 90)).toBeCloseTo(expectedTilt, 6);
        // …and the two jambs stay PARALLEL — the opening is a parallelogram, not a trapezium.
        expect(jambs[0]).toBeCloseTo(jambs[1]!, 9);
        // ⭐ AND THE HEAD AND SILL ARE STILL HORIZONTAL. That is the separation the probe made:
        // the LEAN (case G) and the SKEW (case C) are different defects with different causes,
        // and only the skew makes a horizontal line stop being horizontal.
        expect(angles.filter(a => a === 0 || Math.abs(a) < 1e-9)).toHaveLength(2);
    });
});

// ── §C — the PROFILE axis (C86 §10.1) ─────────────────────────────────────────

describe('§C — the symbol is PROFILE-DRIVEN, through the one outline producer', () => {
    it('a circular window is a CIRCLE in elevation, not a projected polygon of the solid', () => {
        const circ: ElevationSymbolOpening = { ...WINDOW, width: 1.2, height: 1.2, openingProfile: 'circular' };
        const res = buildOpeningElevationSymbol(circ, wall(0), { detail: 'coarse' });
        expect(res.refusal).toBeNull();
        const pts = hv(outlineOf(res).points, { x: 0, z: -1 });
        expect(pts.length).toBeGreaterThan(16);
        const cx = 2 + 2.4 + 0.6, cy = 12.21 + 0.9 + 0.6;
        for (const p of pts) expect(Math.hypot(p.h - cx, p.v - cy)).toBeCloseTo(0.6, 6);
    });

    it('a round-arch door has a horizontal SILL and an ARCHED head — both, at once', () => {
        const door: ElevationSymbolOpening = {
            id: 'op-d', type: 'door', offset: 1.0, width: 1.0, height: 2.1, sillHeight: 0,
            openingProfile: 'round-arch',
        };
        const res = buildOpeningElevationSymbol(door, wall(0), { detail: 'coarse' });
        expect(res.refusal).toBeNull();
        const pts = hv(outlineOf(res).points, { x: 0, z: -1 });
        const vMin = Math.min(...pts.map(p => p.v));
        // The sill is a straight horizontal run at the bottom.
        expect(pts.filter(p => Math.abs(p.v - vMin) < 1e-9).length).toBeGreaterThanOrEqual(2);
        // The head is a semicircle of radius w/2 about the springing line.
        const cx = 2 + 1.0 + 0.5, cy = 12.21 + 2.1 - 0.5;
        const headPts = pts.filter(p => p.v > cy + 1e-9);
        expect(headPts.length).toBeGreaterThan(8);
        for (const p of headPts) expect(Math.hypot(p.h - cx, p.v - cy)).toBeCloseTo(0.5, 6);
    });

    it('an ABSENT profile is byte-identical to an explicit rectangular one (PR-2)', () => {
        const a = buildOpeningElevationSymbol(WINDOW, wall(0), { detail: 'coarse' });
        const b = buildOpeningElevationSymbol({ ...WINDOW, openingProfile: 'rectangular' }, wall(0), { detail: 'coarse' });
        expect(outlineOf(b).points).toEqual(outlineOf(a).points);
    });

    it('the frame line of an ARCH is the void ring moved inward by f — constant member, concentric to the mitre bound', () => {
        // §OUTLINE82 (SPEC-WINDOW-CUSTOM-OUTLINE D9). This test USED TO assert exact concentricity
        // (`toBeCloseTo(r, 6)`), which the record-inset path delivered. The frame line is now
        // `insetOutlinePoints` on the producer's own ring — the same helper the 3-D frame member
        // is built with — so the property that holds is CONSTANT MEMBER WIDTH: every frame vertex
        // is exactly f from the void outline. Concentricity is then a CONSEQUENCE bounded by the
        // mitre geometry, f·(1/cos(π/2n) − 1), and the bound is asserted rather than assumed.
        const door: ElevationSymbolOpening = {
            id: 'op-d', type: 'door', offset: 1.0, width: 1.0, height: 2.1, sillHeight: 0,
            openingProfile: 'round-arch',
        };
        const res = buildOpeningElevationSymbol(door, wall(0), { detail: 'fine' });
        const voidRing = local(outlineOf(res).points);
        const frame = res.polylines.find(p => p.role === 'frame')!;
        const inner = local(frame.points);
        const f = DEFAULT_FRAME_WIDTH_M;
        expect(inner.length).toBe(voidRing.length);
        for (const p of inner) {
            expect(pointInPolygon(p, voidRing)).toBe(true);
            expect(distanceToPolygon(p, voidRing)).toBeCloseTo(f, 9);
        }
        // The head: concentric to within the mitre bound, and NOT better than a drawn line.
        const cx = 1.0 + 0.5, cy = 2.1 - 0.5;
        const headPts = inner.filter(q => q.y > cy + 1e-6);
        const n = voidRing.filter(q => q.y > cy + 1e-9).length;          // arc samples on the head
        const mitreBound = f * (1 / Math.cos(Math.PI / (2 * n)) - 1);
        expect(headPts.length).toBeGreaterThan(8);
        for (const p of headPts) {
            const dr = (0.5 - f) - Math.hypot(p.x - cx, p.y - cy);
            expect(dr).toBeGreaterThanOrEqual(-1e-9);
            expect(dr).toBeLessThanOrEqual(mitreBound + 1e-9);
        }
        expect(mitreBound).toBeLessThan(0.001);   // the stated trade: under a drawn line's width
    });
});

// ── §H — §OUTLINE82: the frame line is the ring moved inward, for EVERY profiled kind ──────
//
// `local()` inverts `toWorld` for the §H fixtures: `wall(0)` runs along +X from (2, 0) at base
// Y 12.21 with no rake and `faceSign` 0, so wall-local (x, y) = (world.x − 2, world.y − 12.21).

function local(points: readonly Vec3[]): Array<{ x: number; y: number }> {
    return points.map(p => ({ x: p.x - 2, y: p.y - 12.21 }));
}

/** Ray-cast point-in-polygon; the polygon is implicitly closed (first vertex not repeated). */
function pointInPolygon(p: { x: number; y: number }, ring: ReadonlyArray<{ x: number; y: number }>): boolean {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const a = ring[i]!, b = ring[j]!;
        if ((a.y > p.y) !== (b.y > p.y)) {
            const x = a.x + ((p.y - a.y) * (b.x - a.x)) / (b.y - a.y);
            if (p.x < x) inside = !inside;
        }
    }
    return inside;
}

/** Shortest distance from `p` to any edge of the implicitly closed `ring`. */
function distanceToPolygon(p: { x: number; y: number }, ring: ReadonlyArray<{ x: number; y: number }>): number {
    let best = Infinity;
    for (let i = 0; i < ring.length; i++) {
        const a = ring[i]!, b = ring[(i + 1) % ring.length]!;
        const dx = b.x - a.x, dy = b.y - a.y;
        const L2 = dx * dx + dy * dy;
        const t = L2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2)) : 0;
        best = Math.min(best, Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)));
    }
    return best;
}

describe('§H — §OUTLINE82: the frame line is `insetOutlinePoints` of the void ring (D9)', () => {
    it('RECTANGULAR is BYTE-IDENTICAL to the pre-§OUTLINE82 record-inset output (C86 §10.1 PR-2 pin)', () => {
        // The pre-change formula, written out in the SAME operation order the code used, so this
        // is a pin of the bytes that shipped — not of the new code against itself.
        const f = DEFAULT_FRAME_WIDTH_M;
        const offset = WINDOW.offset + f;
        const width  = WINDOW.width - 2 * f;
        const sill   = WINDOW.sillHeight + f;
        const height = WINDOW.height - 2 * f;
        const x0 = offset, x1 = offset + width, y0 = sill, y1 = sill + height;
        const expected = [
            { x: 2 + x0, y: 12.21 + y0, z: 0 },
            { x: 2 + x1, y: 12.21 + y0, z: 0 },
            { x: 2 + x1, y: 12.21 + y1, z: 0 },
            { x: 2 + x0, y: 12.21 + y1, z: 0 },
        ];
        for (const profile of [undefined, 'rectangular'] as const) {
            const res = buildOpeningElevationSymbol({ ...WINDOW, openingProfile: profile }, wall(0), { detail: 'fine' });
            const frame = res.polylines.find(p => p.role === 'frame')!;
            expect(frame.points).toEqual(expected);
        }
    });

    it('a SEGMENTAL arch has its frame line strictly INSIDE the void ring, at constant member width', () => {
        const seg: ElevationSymbolOpening = { ...WINDOW, width: 1.2, height: 1.4, openingProfile: 'segmental-arch' };
        const res = buildOpeningElevationSymbol(seg, wall(0), { detail: 'fine' });
        expect(res.refusal).toBeNull();
        const ring = local(outlineOf(res).points);
        const frame = res.polylines.find(p => p.role === 'frame');
        expect(frame, 'a frame line must be emitted at LOD fine').toBeDefined();
        const inner = local(frame!.points);
        expect(inner.length).toBe(ring.length);
        for (const p of inner) {
            expect(pointInPolygon(p, ring)).toBe(true);
            // CONSTANT member width along the head — the property the record inset could NOT
            // give a segmental arch (its rise is a fraction of its width).
            expect(distanceToPolygon(p, ring)).toBeCloseTo(DEFAULT_FRAME_WIDTH_M, 9);
        }
    });

    it('a frame thicker than the void can hold emits NO frame line and NO substitute rectangle (WO-G-5)', () => {
        const circ: ElevationSymbolOpening = { ...WINDOW, width: 0.3, height: 0.3, openingProfile: 'circular' };
        const res = buildOpeningElevationSymbol(circ, wall(0), { detail: 'fine', frameWidthM: 0.2 });
        expect(res.refusal).toBeNull();
        expect(res.polylines.map(p => p.role)).toEqual(['void-outline']);
    });

    // §OUTLINE80 lands the `custom` kind. Until it does, `resolveOpeningProfile('custom')` falls
    // to rectangular on the load path (by design — an unknown string must not brick a project),
    // so this arm is gated on the producer actually returning a `custom` outline. Guarded by a
    // string comparison rather than an imported symbol, so this file compiles on both sides.
    const TRIANGLE = { vertices: [{ u: 0, v: 0 }, { u: 1, v: 0 }, { u: 0.5, v: 1 }] };
    const customLanded = (() => {
        const probe = buildOpeningElevationSymbol(
            { ...WINDOW, openingProfile: 'custom', customOutline: TRIANGLE }, wall(0), { detail: 'coarse' },
        );
        return probe.refusal === null && local(outlineOf(probe).points).length === 3;
    })();

    it.skipIf(!customLanded)('a TRIANGLE (custom ring, §OUTLINE80) has its frame line strictly inside the ring', () => {
        const tri: ElevationSymbolOpening = { ...WINDOW, openingProfile: 'custom', customOutline: TRIANGLE };
        const res = buildOpeningElevationSymbol(tri, wall(0), { detail: 'fine' });
        const ring = local(outlineOf(res).points);
        const frame = res.polylines.find(p => p.role === 'frame')!;
        const inner = local(frame.points);
        expect(inner.length).toBe(3);
        for (const p of inner) {
            expect(pointInPolygon(p, ring)).toBe(true);
            expect(distanceToPolygon(p, ring)).toBeCloseTo(DEFAULT_FRAME_WIDTH_M, 9);
        }
    });
});

// ── §D — refusals (C16 CA-18) ─────────────────────────────────────────────────

describe('§D — refusals name the condition, the reason and the live alternative', () => {
    it('a PROFILED opening in a CURVED host refuses by name (C86 §10.1 PR-5)', () => {
        const res = buildOpeningElevationSymbol(
            { ...WINDOW, width: 1.2, height: 1.2, openingProfile: 'circular' },
            wall(0, null, /* curved */ true),
        );
        expect(res.polylines).toHaveLength(0);
        expect(res.refusal?.code).toBe('PROFILE_ON_CURVED_HOST');
        expect(res.refusal?.reason).toMatch(/curved wall/i);
        expect(res.refusal?.alternative).toMatch(/rectangular|straight/i);
    });

    it('…but a RECTANGULAR opening in a curved host is SERVED — the refusal is scoped, not blanket', () => {
        const res = buildOpeningElevationSymbol(WINDOW, wall(0, null, true), { detail: 'coarse' });
        expect(res.refusal).toBeNull();
        expect(res.polylines.length).toBeGreaterThan(0);
    });

    it('a circular opening whose box is not square refuses, and emits NOTHING', () => {
        const res = buildOpeningElevationSymbol(
            { ...WINDOW, width: 1.2, height: 0.8, openingProfile: 'circular' }, wall(0),
        );
        expect(res.polylines).toHaveLength(0);
        expect(res.refusal?.code).toBe('DEGENERATE_OPENING');
        // ⛔ The forbidden outcome is a SILENT fall-back to a rectangle. Assert it did not happen.
        expect(res.polylines.some(p => p.role === 'void-outline')).toBe(false);
    });

    it('a degenerate host refuses rather than emitting a zero-length symbol', () => {
        const res = buildOpeningElevationSymbol(WINDOW, {
            baseStart: { x: 1, z: 1 }, baseEnd: { x: 1, z: 1 }, baseY: 0, thickness: 0.3,
        });
        expect(res.refusal?.code).toBe('DEGENERATE_HOST');
        expect(res.polylines).toHaveLength(0);
    });
});

// ── §E — the pen reaches these lines, and the ZONE is not flattened ───────────

describe('§E — zone + pen governance actually reach the symbol', () => {
    it('every polyline carries a real zone, and NONE is `cut` (C09 §4.6.1 — an elevation slices nothing)', () => {
        const door: ElevationSymbolOpening = {
            id: 'op-d', type: 'door', offset: 1.0, width: 1.6, height: 2.1, sillHeight: 0,
            leafCount: 'double', hingesSide: 'left', swingDirection: 'outward',
        };
        const res = buildOpeningElevationSymbol(door, wall(0), { detail: 'fine' });
        expect(res.polylines.length).toBeGreaterThanOrEqual(4);
        for (const p of res.polylines) {
            expect(['projection', 'hidden']).toContain(p.zone);
        }
        // The outward-opening leaf is the ONE thing on the dashed zone — expressed through the
        // ladder, never by this module choosing a dash array.
        const swing = res.polylines.find(p => p.role === 'swing-indicator')!;
        expect(swing.zone).toBe('hidden');
    });

    it('an INWARD swing is SOLID, not dashed — the zone carries the convention', () => {
        const door: ElevationSymbolOpening = {
            id: 'op-d', type: 'door', offset: 1.0, width: 0.9, height: 2.1, sillHeight: 0,
            hingesSide: 'right', swingDirection: 'inward',
        };
        const res = buildOpeningElevationSymbol(door, wall(0), { detail: 'fine' });
        expect(res.polylines.find(p => p.role === 'swing-indicator')!.zone).toBe('projection');
    });

    it('an UNKNOWN hand draws NO swing indicator — it does not default to left (C65 §3.4)', () => {
        const door: ElevationSymbolOpening = {
            id: 'op-d', type: 'door', offset: 1.0, width: 0.9, height: 2.1, sillHeight: 0,
        };
        const res = buildOpeningElevationSymbol(door, wall(0), { detail: 'fine' });
        expect(res.polylines.some(p => p.role === 'swing-indicator')).toBe(false);
    });

    it('the swing chevron apex is on the HINGE side — the hand is drawn, not guessed', () => {
        const base = { id: 'op-d', type: 'door' as const, offset: 1.0, width: 0.9, height: 2.1, sillHeight: 0, swingDirection: 'inward' as const };
        const left  = buildOpeningElevationSymbol({ ...base, hingesSide: 'left'  }, wall(0), { detail: 'fine' });
        const right = buildOpeningElevationSymbol({ ...base, hingesSide: 'right' }, wall(0), { detail: 'fine' });
        const apexH = (r: typeof left) => hv(r.polylines.find(p => p.role === 'swing-indicator')!.points, { x: 0, z: -1 })[1]!.h;
        expect(apexH(left)).toBeLessThan(apexH(right));
    });

    it('LOD gating: coarse emits the outline ALONE; fine adds frame + division + swing', () => {
        const door: ElevationSymbolOpening = {
            id: 'op-d', type: 'door', offset: 1.0, width: 1.6, height: 2.1, sillHeight: 0,
            leafCount: 'double', hingesSide: 'left', swingDirection: 'inward',
        };
        expect(buildOpeningElevationSymbol(door, wall(0), { detail: 'coarse' }).polylines.map(p => p.role))
            .toEqual(['void-outline']);
        const fine = buildOpeningElevationSymbol(door, wall(0), { detail: 'fine' }).polylines.map(p => p.role);
        expect(fine).toContain('frame');
        expect(fine).toContain('leaf-division');
        expect(fine).toContain('swing-indicator');
    });
});

// ── §F — dispatch, and the paint (no stub at the seam) ───────────────────────

describe('§F — the elevation rules dispatch, and a PEN OVERRIDE actually changes the paint', () => {
    it('the elevation arm routes ONLY injected -SYM layers, leaving existing layers untouched', () => {
        expect(symbolicRuleForLayer('A-GLAZ-SYM:proj', 'elevation')).toBe('elev-window');
        expect(symbolicRuleForLayer('A-DOOR-SYM:hidden', 'elevation')).toBe('elev-door');
        expect(symbolicRuleForLayer('A-DOOR-SYM:proj', 'section')).toBe('elev-door');
        // ⭐ THE NON-REGRESSION HALF. Every layer that exists TODAY must still return null in
        // elevation, or this change silently re-routes the drawing rather than adding to it.
        expect(symbolicRuleForLayer('A-GLAZ:proj', 'elevation')).toBeNull();
        expect(symbolicRuleForLayer('A-DOOR:proj', 'elevation')).toBeNull();
        expect(symbolicRuleForLayer('A-WALL:proj', 'elevation')).toBeNull();
        // ⚠ MEASURED, NOT WISHED FOR: in PLAN, `A-GLAZ-SYM` still matches the `A-GLAZ` rule and
        // returns the plan symbol. That is harmless because `OpeningElevationSymbolBuilder` is
        // called only from the `isElevationView` branch, so no plan drawing contains a `-SYM`
        // layer — and it is asserted rather than "fixed" because narrowing the PLAN arm is a
        // change to the path that works today, which this lane deliberately did not make.
        expect(symbolicRuleForLayer('A-GLAZ-SYM:proj', 'plan')).toBe('plan-window-cased');
        // …and plan is byte-identical.
        expect(symbolicRuleForLayer('A-DOOR:proj', 'plan')).toBe('plan-door-swing');
        expect(symbolicRuleForLayer('A-GLAZ:proj', 'plan')).toBe('plan-window-cased');
        expect(hasSymbolicRenderer('elev-window')).toBe(true);
        expect(hasSymbolicRenderer('elev-door')).toBe(true);
    });

    it('DIFFERENTIATING — the pen the caller resolves is what gets painted, width AND colour AND dash', () => {
        // A recording 2-D context. It records what the renderer SET, so a renderer that
        // re-decided a weight (the L-280 bug) fails here rather than in a resolver unit test.
        const calls: Array<[string, unknown]> = [];
        const ctx = {
            save() {}, restore() {}, beginPath() {}, stroke() {},
            moveTo() {}, lineTo() {},
            setLineDash(d: number[]) { calls.push(['dash', [...d]]); },
            set strokeStyle(v: string) { calls.push(['color', v]); },
            set lineWidth(v: number) { calls.push(['width', v]); },
            set globalAlpha(v: number) { calls.push(['alpha', v]); },
            set lineCap(_v: string) {}, set lineJoin(_v: string) {}, set miterLimit(_v: number) {},
        } as unknown as CanvasRenderingContext2D;

        const segs: SymbolSegment[] = [{ x1: 0, y1: 0, x2: 10, y2: 0 }];
        renderSymbol(ctx, 'elev-window', segs, { widthPx: 1.1, color: '#000000', dashPx: null, opacity: 1 });
        renderSymbol(ctx, 'elev-window', segs, { widthPx: 4.7, color: '#ff00aa', dashPx: [4, 3], opacity: 0.5 });

        expect(calls).toContainEqual(['width', 1.1]);
        expect(calls).toContainEqual(['color', '#000000']);
        // The OVERRIDE reached the paint. This is the assertion L-280 did not have.
        expect(calls).toContainEqual(['width', 4.7]);
        expect(calls).toContainEqual(['color', '#ff00aa']);
        expect(calls).toContainEqual(['dash', [4, 3]]);
        expect(calls).toContainEqual(['alpha', 0.5]);
    });

    it('an invisible element (opacity 0) paints nothing', () => {
        let stroked = 0;
        const ctx = {
            save() {}, restore() {}, beginPath() {}, stroke() { stroked++; },
            moveTo() {}, lineTo() {}, setLineDash() {},
            set strokeStyle(_v: string) {}, set lineWidth(_v: number) {}, set globalAlpha(_v: number) {},
            set lineCap(_v: string) {}, set lineJoin(_v: string) {}, set miterLimit(_v: number) {},
        } as unknown as CanvasRenderingContext2D;
        renderSymbol(ctx, 'elev-door', [{ x1: 0, y1: 0, x2: 1, y2: 1 }],
                     { widthPx: 2, color: '#000', dashPx: null, opacity: 0 });
        expect(stroked).toBe(0);
    });
});

// ── §G — near-face resolution ─────────────────────────────────────────────────

describe('§G — the symbol sits on the face the viewer sees', () => {
    it('flips with the view direction and is symmetric', () => {
        const h = wall(0);   // wall along +X ⇒ leftPerp = +Z
        expect(nearFaceSign(h, { x: 0, z: 1 })).toBe(-1);   // looking toward +Z ⇒ near face is -Z
        expect(nearFaceSign(h, { x: 0, z: -1 })).toBe(1);
    });

    it('a degenerate host puts the symbol on the centreline rather than guessing', () => {
        expect(nearFaceSign({ baseStart: { x: 0, z: 0 }, baseEnd: { x: 0, z: 0 } }, { x: 0, z: -1 })).toBe(0);
    });

    it('the face offset moves the symbol in DEPTH only — never in height', () => {
        const a = outlineOf(buildOpeningElevationSymbol(WINDOW, wall(0), { detail: 'coarse', faceSign: 1 })).points;
        const b = outlineOf(buildOpeningElevationSymbol(WINDOW, wall(0), { detail: 'coarse', faceSign: -1 })).points;
        a.forEach((p, i) => {
            expect(p.y).toBeCloseTo(b[i]!.y, 12);
            expect(Math.abs(p.z - b[i]!.z)).toBeCloseTo(0.3, 12);   // the wall's full thickness
        });
    });
});
