/**
 * CurvedLeafGeometry — §FEAT-CURVED-WINDOW-LEAF / §FEAT-CURVED-DOOR-LEAF (L-957)
 *
 * THE LEAF OF A HOSTED ELEMENT IN A CURVED WALL, BUILT ON THE WALL'S OWN ARC.
 *
 * ── Why this module lives in `geometry-door` and not `geometry-window` ───────
 * It shipped in `geometry-window` for the window half of L-957, and the door
 * half needs exactly the same solid. `@pryzm/geometry-window` ALREADY declares
 * `@pryzm/geometry-door` as a dependency (`WindowSection` imports `injectDwStyles`
 * from it — "dw" = doors/windows, i.e. this package is already the established
 * home for shared door↔window code). That edge points window → door, so the door
 * cannot import the window: moving the module DOWN to the shared package is the
 * only placement that gives both callers ONE implementation.
 *
 * The alternative was a second copy in `geometry-door`, and a second copy is the
 * exact thing C84 EI-10 and `check-predicate-canonical` exist to stop. Nothing
 * moved into `geometry-wall` and no new dependency edge was created; `WallArcParam`
 * already exports everything below that touches an arc.
 * `geometry-window/src/CurvedLeafGeometry.ts` remains, as a re-export shim, so the
 * window's own imports and its shipped test suite are untouched.
 *
 * ── The founder's spec, and why it decomposes the way it does ────────────────
 * *"the glass is curved; the horizontal frame members are curved; the same
 * precised curved than the wall."* Three claims, and the third is the binding
 * one: the leaf's curvature is not an arc that RESEMBLES the wall's, it is the
 * wall's arc. Two independent derivations of one arc is the C84 EI-9 defect
 * class, and here it would be VISIBLE — a seam where the pane meets the reveal.
 *
 * So this module computes NO arc. It has no Bézier, no radius, no `atan2` over a
 * baseline. Every point it emits comes out of `hostedElementFrame()` in
 * `@pryzm/geometry-wall/WallArcParam` — the same function the wall's own carve,
 * the plan symbol and the snap providers already position from, sampling the same
 * quadratic Bézier at the same `curve.segments` stations that
 * `WallFragmentBuilder` builds the solid from. `check-predicate-canonical` counts
 * duplicate geometry predicates; there is nothing here for it to count.
 *
 * ── WHY ONLY THE HORIZONTALS CURVE — confirmed, not assumed ──────────────────
 * The simplification rests entirely on the host's curve being a VERTICAL-AXIS
 * SWEEP rather than a compound curve. That is not an assumption here, it is a
 * property of the stored model, measured:
 *
 *   • `WallArcParam.ArcPointXZ` declares *"`y` is ignored by every function here
 *     (all maths is XZ)"*, and `wallCentreline()` evaluates the quadratic Bézier
 *     in x and z only — there is no y term in the curve at all.
 *   • The wall solid's own cross-section type is `Station = { cx, cz, nx, nz }`
 *     (`CurvedWallLayerBuilder`) — again no y. `buildCurvedLayerGeometry` takes a
 *     scalar `wallHeight` and extrudes each station straight up.
 *
 * A curve with no y component, extruded along +Y, is by construction a sweep
 * about a vertical axis. Every vertical line on such a surface is a straight
 * ruling. Hence: heads, cills, thresholds, transoms and leaf rails traverse the
 * arc and must bend; jambs, mullions, stiles and door posts are rulings and stay
 * straight — they only need RE-SEATING onto the arc (position + local heading),
 * which is what {@link arcSeat} returns. If a compound (non-vertical-axis) curve
 * is ever added to `WallData`, this decomposition stops being true and this
 * comment is where a reader will find out why.
 *
 * ── THE DOOR'S ONE DIFFERENCE FROM THE WINDOW: a leaf that swings ────────────
 * A door has a moving part a window does not, so before reusing this the door
 * lane measured whether the leaf is ever modelled OPEN. It is not, in 3D:
 * `DoorBuilder` sets `group.rotation.y` once — the group's heading on the wall —
 * and every sub-mesh is placed by `position.set` with no rotation of its own.
 * There is no swing angle, no open state and no hinge transform anywhere in the
 * 3D path. The leaf is therefore always modelled CLOSED, seated in its frame, and
 * curving it is exactly the same problem as curving a window pane.
 *
 * The 90°-open leaf exists only in the PLAN SYMBOL (`DoorPlanSymbolBuilder`),
 * where it is deliberately RIGID: §FIX-HOSTED-PLAN-SYMBOL-ON-CURVED-HOST already
 * decided that *"rigid sub-assemblies (a door LEAF and its swing arc) pivot about
 * the hinge and do not bend"*, taking tangent and normal from ONE `frameAt()`
 * station. That is the correct answer for a swung leaf and it is already shipped;
 * nothing here changes it. If a 3D open state is ever added, the leaf built by
 * this module is a rigid body and must ROTATE about a vertical hinge axis seated
 * on the arc — it must never be re-swept at the open angle, or it would no longer
 * close back into the void it was cut from.
 *
 * ── What a "swept box" is here ───────────────────────────────────────────────
 * Every member of the leaf is authored by the builders as an axis-aligned box in
 * GROUP-LOCAL space: +X along the wall, +Y up, +Z out through the exterior face.
 * {@link sweptBoxGeometry} takes exactly those box arguments and returns the same
 * solid with its X extent wrapped onto the host arc — its two faces are
 * concentric arcs and its ends are RADIAL, matching the radial jambs
 * `CurvedWallOpeningBuilder` already cuts the void with. The depth extent is
 * measured along the local NORMAL, so pane thickness is radial too.
 *
 * ⚠ A STRAIGHT HOST NEVER REACHES THIS MODULE. The builder calls {@link leafArc},
 * gets `null`, and emits the ordinary `BoxGeometry` it always has. That is not an
 * optimisation, it is the safety property slice 0 pins: the straight leaf is
 * byte-identical because it is literally the same code path.
 */

import * as THREE from '@pryzm/renderer-three/three';
import {
    hostedElementFrame,
    isArcHost,
    rakeShearPerMetre,
    ARC_EPSILON_M,
} from '@pryzm/geometry-wall';

// ─── The consumed host arc ────────────────────────────────────────────────────

/**
 * The host wall's arc, expressed in the hosted element group's LOCAL frame.
 *
 * The builder places the group at `hostedElementFrame().{x,z}` with
 * `rotation.y = rotationY`, which makes group-local +X the centreline TANGENT at
 * the element's centre and group-local +Z the outward NORMAL there. So the local
 * frame's origin and axes are exactly `frame.{x,z}` / `{tx,tz}` / `{nx,nz}`, and
 * converting a world point the resolver returns into group-local space is two dot
 * products against those axes — no inverse matrix, and nothing re-derived.
 *
 * On a straight host that conversion is provably the identity: `at(s, n)` is
 * `origin + s·t + n·n̂` with orthonormal `t`, `n̂`, so `localX = s` and
 * `localZ = n` exactly. Which is why a straight host is refused a `LeafArc` at
 * all rather than handed a degenerate one — see {@link leafArc}.
 */
export interface LeafArc {
    /** Host centreline (arc) length in metres — for bounds diagnostics. */
    readonly hostLength: number;
    /** Group-local XZ of the point `sLocal` along the arc and `n` across it. */
    at(sLocal: number, n: number): { x: number; z: number };
    /**
     * Group-local polyline from `sLocal = s0` to `s1` at `n` across, sampled at
     * the HOST'S OWN centreline stations.
     *
     * This is the whole reason leaf and reveal cannot disagree at their shared
     * edge: both are polylines through the same vertices of the same
     * tessellation. Calls with different `n` return index-aligned arrays of equal
     * length (the interior station list does not depend on `n`), which is what
     * lets {@link sweptBoxGeometry} pair a back face to a front face.
     */
    run(s0: number, s1: number, n: number): Array<{ x: number; z: number }>;
    /**
     * The group-local `rotation.y` a straight member seated at `sLocal` must take
     * so that it faces the wall there.
     *
     * Read straight off the resolver's own `WallArcFrame.angleY` — the turn from
     * the centre station's heading to this station's — rather than from a fresh
     * `atan2` over two sampled points. Same reason as everything else in this
     * file: one arc, one derivation. Zero at `sLocal = 0` by construction.
     */
    headingAt(sLocal: number): number;
}

/**
 * The `LeafArc` for a hosted element at `offset`/`width` on `wall`, or `null`
 * when the host is not a curved one and the ordinary flat leaf must be built.
 *
 * `null` is returned for a straight host, for a wall with no valid curve, and
 * when the `__pryzmHostedOnCurvedWall` escape hatch is off — all three via
 * `isArcHost`, so this feature is governed by the SAME switch the rest of
 * §FEAT-HOSTED-ON-CURVED-WALL is, and turning that off restores flat leaves
 * along with flat everything else.
 */
export function leafArc(
    wall: unknown,
    offset: number,
    width: number,
): LeafArc | null {
    const w = wall as Parameters<typeof isArcHost>[0];
    if (!isArcHost(w)) return null;

    const hf = hostedElementFrame(
        wall as Parameters<typeof hostedElementFrame>[0],
        offset,
        width,
    );
    const f0 = hf.frame;

    const toLocal = (p: { x: number; z: number }): { x: number; z: number } => {
        const dx = p.x - f0.x;
        const dz = p.z - f0.z;
        return { x: dx * f0.tx + dz * f0.tz, z: dx * f0.nx + dz * f0.nz };
    };

    return {
        hostLength: hf.length,
        at: (sLocal, n) => toLocal(hf.at(sLocal, n)),
        run: (s0, s1, n) => hf.run(s0, s1, n).map(toLocal),
        // `rotationY = -angleY` is the convention `hostedElementFrame` states for
        // the group as a whole; the LOCAL turn is that same convention applied to
        // the difference between this station's heading and the centre's.
        headingAt: (sLocal) => -(hf.frameAt(sLocal).angleY - f0.angleY),
    };
}

// ─── Refusal (C65 §3.9 — no affordance without an implementation) ─────────────

/**
 * The one combination a curved leaf cannot carry, named so the UI can show it.
 *
 * Returns a reason string, or `null` when the combination is buildable. The
 * property panel must IMPORT this rather than restate it: a refusal spelled
 * twice is a refusal that will drift, and both directions of exactly that
 * mismatch shipped and were caught on 2026-08-18.
 *
 * `noun` is the element the message names ("window", "door"). It changes the
 * WORDING only — the CONDITION is one predicate, evaluated once, for every
 * hosted element kind. A door and a window that disagreed about whether a raked
 * curved host is buildable would be the same EI-1 defect one level up.
 *
 * ── Why the list is this short, and it is not laziness ───────────────────────
 * The two combinations one would expect to have to refuse are already settled
 * upstream, and re-refusing them here would be WRONG:
 *
 *   • **curved × layered is BUILT.** `WallFragmentBuilder._buildCurvedWallWithOpenings`
 *     carries a `layerPlans` array — one entry for a plain wall, N concentric
 *     entries for a layered one — through the same band carve. The void is
 *     correct for a layered curved host, so the leaf has nothing to refuse.
 *   • **curved × raked is ALREADY REFUSED, at the model.** `WallRake.ts` lists
 *     `rake × curve` under "what is deliberately refused" — *"the shear direction
 *     is the wall's plan normal, which VARIES along an arc… ILL-POSED, not
 *     unbuilt: this one never lifts"* — enforced in `WallDataSchema` (add path)
 *     and `WallStore` (update / addOpening paths). A wall cannot hold both. The
 *     check below is therefore a DEFENCE, not a second policy: if one is ever
 *     observed, some upstream guard has failed and a silently-wrong leaf is the
 *     worst possible response.
 */
export function curvedLeafRefusal(wall: unknown, noun: string): string | null {
    const w = wall as { rakeAngleDeg?: number };
    if (!isArcHost(wall as Parameters<typeof isArcHost>[0])) return null;
    if (rakeShearPerMetre(w.rakeAngleDeg) !== 0) {
        return `A ${noun} cannot follow the curve of a wall that is also raked: `
            + 'the lean direction is the wall\'s plan normal, which varies along an arc, '
            + 'so there is no single shear to apply. Straighten the wall or remove the rake.';
    }
    return null;
}

// ─── Swept geometry ───────────────────────────────────────────────────────────

/** A face's three vertices, each `[x, y, z]`, sharing one normal. */
type V3 = [number, number, number];

/**
 * Build the group-local solid for a leaf member authored as an axis-aligned box,
 * with its X extent wrapped onto the host arc.
 *
 * Arguments mirror the builders' `addBox(w, h, d, x, y, z)` exactly, so a call
 * site converts by swapping the function — there is no second coordinate
 * convention to keep in step.
 *
 * Normals: the two curved faces get SMOOTH per-station normals (a glazed façade
 * that facets is the defect the founder's reference photograph is the opposite
 * of), while top, bottom and the two radial ends get FLAT face normals so they
 * meet the curved faces at a hard 90° edge. This is the same split
 * `WallFragmentBuilder`'s curved branch already makes for the wall body, and it
 * is why `computeVertexNormals()` is not called: it would average across those
 * edges and round the frame off.
 */
export function sweptBoxGeometry(
    arc: LeafArc,
    w: number, h: number, d: number,
    cx: number, cy: number, cz: number,
): THREE.BufferGeometry {
    const s0 = cx - w / 2;
    const s1 = cx + w / 2;
    const nBack = cz - d / 2;
    const nFront = cz + d / 2;
    const yBot = cy - h / 2;
    const yTop = cy + h / 2;

    // Index-aligned by construction: `run` picks its interior stations from the
    // host centreline, which does not depend on `n`.
    const back = arc.run(s0, s1, nBack);
    const front = arc.run(s0, s1, nFront);
    const n = Math.min(back.length, front.length);

    const pos: number[] = [];
    const nrm: number[] = [];

    const tri = (a: V3, b: V3, c: V3, na: V3, nb: V3, nc: V3): void => {
        pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
        nrm.push(na[0], na[1], na[2], nb[0], nb[1], nb[2], nc[0], nc[1], nc[2]);
    };
    /** A quad as two triangles, all four vertices sharing one flat normal. */
    const quadFlat = (a: V3, b: V3, c: V3, dd: V3, nf: V3): void => {
        tri(a, b, c, nf, nf, nf);
        tri(a, c, dd, nf, nf, nf);
    };
    /** Unit normal of the triangle a→b→c, or `null` when degenerate. */
    const faceNormal = (a: V3, b: V3, c: V3): V3 | null => {
        const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
        const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
        const nx = uy * vz - uz * vy;
        const ny = uz * vx - ux * vz;
        const nz = ux * vy - uy * vx;
        const l = Math.hypot(nx, ny, nz);
        // ARC_EPSILON_M is the arc domain's own tolerance, exported by
        // WallArcParam. No epsilon is minted here — `check-epsilon-policy` is live
        // and a new literal would make it worse.
        return l > ARC_EPSILON_M ? [nx / l, ny / l, nz / l] : null;
    };

    // ── Per-station outward normals for the two curved faces ─────────────────
    // Taken from the BACK→FRONT vector at each station, which IS the host's local
    // centreline normal there (both points come from the same `at(s, ·)`), then
    // averaged across adjacent stations for smooth shading.
    const radial: Array<{ x: number; z: number }> = [];
    for (let i = 0; i < n; i++) {
        const dx = front[i]!.x - back[i]!.x;
        const dz = front[i]!.z - back[i]!.z;
        const l = Math.hypot(dx, dz);
        radial.push(l > ARC_EPSILON_M ? { x: dx / l, z: dz / l } : { x: 0, z: 1 });
    }
    const smooth: V3[] = [];
    for (let i = 0; i < n; i++) {
        const a = radial[Math.max(0, i - 1)]!;
        const b = radial[i]!;
        const c = radial[Math.min(n - 1, i + 1)]!;
        const sx = a.x + b.x + c.x;
        const sz = a.z + b.z + c.z;
        const l = Math.hypot(sx, sz) || 1;
        smooth.push([sx / l, 0, sz / l]);
    }

    for (let i = 0; i < n - 1; i++) {
        const b0 = back[i]!, b1 = back[i + 1]!;
        const f0 = front[i]!, f1 = front[i + 1]!;
        const n0 = smooth[i]!, n1 = smooth[i + 1]!;
        const nIn0: V3 = [-n0[0], 0, -n0[2]];
        const nIn1: V3 = [-n1[0], 0, -n1[2]];

        // FRONT (exterior) face — outward normals.
        tri([f0.x, yBot, f0.z], [f1.x, yBot, f1.z], [f1.x, yTop, f1.z], n0, n1, n1);
        tri([f0.x, yBot, f0.z], [f1.x, yTop, f1.z], [f0.x, yTop, f0.z], n0, n1, n0);
        // BACK (interior) face — inward normals, reversed winding.
        tri([b0.x, yBot, b0.z], [b1.x, yTop, b1.z], [b1.x, yBot, b1.z], nIn0, nIn1, nIn1);
        tri([b0.x, yBot, b0.z], [b0.x, yTop, b0.z], [b1.x, yTop, b1.z], nIn0, nIn0, nIn1);

        // TOP and BOTTOM — flat, so the 90° edge to the curved faces stays hard.
        quadFlat(
            [b0.x, yTop, b0.z], [b1.x, yTop, b1.z], [f1.x, yTop, f1.z], [f0.x, yTop, f0.z],
            [0, 1, 0],
        );
        quadFlat(
            [b0.x, yBot, b0.z], [f0.x, yBot, f0.z], [f1.x, yBot, f1.z], [b1.x, yBot, b1.z],
            [0, -1, 0],
        );
    }

    // ── The two RADIAL end caps ──────────────────────────────────────────────
    // These are the faces that meet the void's jambs. They are radial because
    // their two XZ corners are `at(s, nBack)` and `at(s, nFront)` at ONE station —
    // i.e. they lie in the plane of the local centreline normal, exactly the plane
    // `CurvedWallOpeningBuilder` terminates its bands on.
    const capAt = (i: number, flip: boolean): void => {
        const b = back[i]!, f = front[i]!;
        const p: [V3, V3, V3, V3] = flip
            ? [[b.x, yBot, b.z], [b.x, yTop, b.z], [f.x, yTop, f.z], [f.x, yBot, f.z]]
            : [[f.x, yBot, f.z], [f.x, yTop, f.z], [b.x, yTop, b.z], [b.x, yBot, b.z]];
        const nf = faceNormal(p[0], p[1], p[2]);
        if (nf) quadFlat(p[0], p[1], p[2], p[3], nf);
    };
    if (n >= 2) { capAt(0, true); capAt(n - 1, false); }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    geo.computeBoundingSphere();
    return geo;
}

/**
 * Where a STRAIGHT member sits on a curved host.
 *
 * A jamb, mullion, stile or door post is a vertical ruling of the sweep and stays
 * straight (see the header). It must still be RE-SEATED, though: its plan
 * position moves onto the arc and its heading turns to the LOCAL tangent there,
 * or a mullion halfway along a wide curved opening would stand proud of the leaf
 * on one side and sink into it on the other.
 *
 * Returns the group-local position and the group-local Y rotation to apply to an
 * ordinary `BoxGeometry` mesh — the position from {@link LeafArc.at}, the heading
 * from {@link LeafArc.headingAt}. Neither is computed here; this function is the
 * NAME of the operation, not a second implementation of it.
 */
export function arcSeat(
    arc: LeafArc,
    cx: number, cz: number,
): { x: number; z: number; rotationY: number } {
    const p = arc.at(cx, cz);
    return { x: p.x, z: p.z, rotationY: arc.headingAt(cx) };
}
