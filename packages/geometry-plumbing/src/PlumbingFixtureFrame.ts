// PlumbingFixtureFrame — THE ONE CONVENTION every reader of a plumbing fixture obeys.
//
// §PLUMBFRAME (founder, 2026-08-26 · L-11487..L-11491) · C84 EI-1 / EI-9 · C99 · C109.
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⭐ THE FOUNDER, TWICE, ABOUT ONE MISSING AUTHORITY:
//
//   "check the toilet family — in plan view it shows correctly the PREVIEW — but then
//    in 3D it creates it 180° ROTATED, and the plan-view SYMBOL is 90° rotated!!"
//
//   "The shower element is also not completely correct — the preview of the shower
//    plate is CENTRED on the shower itself — whereas it should not [be]."
// ═══════════════════════════════════════════════════════════════════════════════
//
// Those are TWO questions, one level apart, and neither had a written answer:
//
//   ROTATION  — what does angle-zero FACE?
//   ANCHOR    — WHERE is the fixture's reference point: its centre, or its
//               wall-contact edge? A wall-hosted fixture placed by its CENTRE will
//               always straddle the wall by half its depth.
//
// ⛔ AND THE HEADERS ALREADY DISAGREED, IN WRITING, FOR MONTHS:
//
//   `ToiletGeometry.ts`  — *"+Z points away from the back wall (front of the bowl).
//                           Origin sits on the floor at the bowl's back-centre."*
//   `PlumbingTool.ts`    — *"Toilet & sink: their FRONT is at local −Z … so we flip
//                           180° to seat their back against the wall."*
//
// `[[probe-can-be-wrong-three-ways]]` says the way to settle that is an INDEPENDENT
// source, so the geometry itself was measured
// (`__tests__/plumbingFixtureFrame.measure.test.ts`). What it found:
//
//   SHOWER   every one of the seven variants spans z ∈ [0, length] — origin at the
//            wall-contact edge, body on +Z. ✅ obeys the convention below.
//   TOILET   the CISTERN is at z ∈ [−0.02, 0.24] (correctly at the wall) while the
//            BOWL BODY, the SEAT RING and the SEAT LID span z ∈ [−0.74, 0.02].
//            ⛔ The three D-extrusions run BACKWARDS, so the tank hugs the wall and
//            the pan sticks THROUGH it — which is exactly what "180° rotated" looks
//            like. `ToiletGeometry`'s own header was FALSE.
//   SINK     `PlumbingFragmentBuilder.createSinkMesh` builds its basin at z = −0.225,
//            its rim at −0.25 and its backsplash at −0.025 — ⛔ the whole fixture on
//            −Z, 180° from its own plan symbol.
//   PLAN / ELEVATION SYMBOL  both build z ∈ [0, length] (`buildPlanLinework`,
//            `buildElevationLinework`'s `zMid = fp.length / 2`). ✅ obey it.
//
// ⭐ SO FOUR READERS AGREED AND THREE PRODUCERS DISSENTED — and the dissent was being
// PAPERED OVER AT THE WRITER: `PlumbingTool` applied `rotateY(π)` to toilets and sinks
// to compensate. That is three rival conventions with makeup on, and it had the
// measurable consequence that the 3-D tool and the plan tool STORED DIFFERENT ANGLES
// FOR THE SAME WALL. A compensating offset at one writer cannot fix a reader that two
// other writers also feed.
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⛔ THE CONVENTION. EVERY PRODUCER AND EVERY READER OBEYS IT. NO ARM MAY
//    RE-DERIVE IT OR CARRY A COMPENSATING OFFSET (C86 §10.1 PR-1's rule, one
//    family over).
// ═══════════════════════════════════════════════════════════════════════════════
//
//   ORIGIN     the midpoint of the fixture's WALL-CONTACT EDGE, on the floor.
//              ⛔ NOT the centroid. A centred anchor puts half the tray inside the
//              wall, which is the founder's shower report.
//   LOCAL +Z   INTO THE ROOM — the fixture's FRONT. The body occupies z ∈ [0, length].
//   LOCAL +X   ALONG the host wall. The body occupies x ∈ [−width/2, +width/2].
//   LOCAL +Y   UP. The body occupies y ∈ [0, height] above the seating datum.
//   ROTATION   a plan angle about world Y that carries local into world. For a
//              wall-hosted fixture it is `plumbingFixtureYawForWallNormal(nx, nz)`
//              where (nx, nz) is the wall's ROOM-SIDE (outward) normal — so local +Z
//              lands on that normal and the fixture's back sits on the wall face.
//
// ⚠ WHAT THIS MEANS FOR ALREADY-PLACED FIXTURES, STATED RATHER THAN DISCOVERED.
// The STORED angle was never the defect: `PlumbingPlanToolHandler` has always written
// `atan2(nx, nz)`, which is this convention exactly, and the founder confirms its
// preview was CORRECT. So:
//   · every fixture placed from PLAN starts rendering CORRECTLY — it was stored right
//     and read wrong;
//   · every TOILET or SINK placed from the 3-D `PlumbingTool` was stored 180° off this
//     convention, because that tool compensated for the reader bug at write time. With
//     the compensation gone those records now render 180° out — the honest surfacing
//     of a wrong stored value, not a new defect. ⛔ It is NOT fixed by restoring the
//     flip: that would re-break every plan-placed fixture. **L-11491, OPEN** — the
//     correct remedy is a one-shot data migration that adds π to the yaw of `toilet`
//     and `sink` records whose provenance is the 3-D tool, and there is no provenance
//     field to key it on today, which is why it is a named row and not a silent guess.

/**
 * The plan yaw that seats a fixture's back against a wall.
 *
 * @param normalX x-component of the wall's ROOM-SIDE (outward) normal
 * @param normalZ z-component of the same normal
 * @returns radians about world Y, such that local +Z lands on (normalX, normalZ)
 *
 * ⭐ `atan2(x, z)` AND NOT `atan2(z, x)`. For `Euler(0, yaw, 0)` THREE maps local +Z to
 * `(sin yaw, 0, cos yaw)`, so recovering a yaw from a direction is `atan2(dir.x,
 * dir.z)`. The swapped form is off by 90° for every wall that is not axis-aligned with
 * the one it was eyeballed on, which is the shape of "the plan-view SYMBOL is 90°
 * rotated". ONE function, so no caller has to remember which way round it goes.
 */
export function plumbingFixtureYawForWallNormal(normalX: number, normalZ: number): number {
    return Math.atan2(normalX, normalZ);
}

/**
 * The fixture's plan footprint as a closed ring in its LOCAL frame — the shape every
 * preview, symbol and highlight must draw.
 *
 * ⭐ IT IS THE ANCHOR, EXPRESSED AS GEOMETRY RATHER THAN AS PROSE. z runs 0 → length,
 * never −length/2 → +length/2. A caller that draws a centred box is not obeying this
 * convention no matter what its comments say, and the difference is exactly half a
 * fixture depth — the founder's straddling shower plate.
 */
export function plumbingFixtureLocalFootprintRing(
    width: number,
    length: number,
): ReadonlyArray<{ readonly x: number; readonly z: number }> {
    const hw = width / 2;
    return [
        { x: -hw, z: 0 },
        { x: hw, z: 0 },
        { x: hw, z: length },
        { x: -hw, z: length },
    ];
}

/**
 * The same ring carried into world coordinates.
 *
 * ⛔ THE ONE TRANSFORM, so a preview, a symbol and a selection outline cannot each
 * apply their own. `origin` is the wall-contact edge midpoint; `yaw` comes from
 * `plumbingFixtureYawForWallNormal`.
 */
export function plumbingFixtureWorldFootprintRing(
    origin: { readonly x: number; readonly z: number },
    yaw: number,
    width: number,
    length: number,
): ReadonlyArray<{ readonly x: number; readonly z: number }> {
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    return plumbingFixtureLocalFootprintRing(width, length).map((p) => ({
        // Local (x, z) → world through `Euler(0, yaw, 0)`: local +Z lands on
        // (sin yaw, cos yaw) and local +X on (cos yaw, −sin yaw).
        x: origin.x + p.x * cos + p.z * sin,
        z: origin.z - p.x * sin + p.z * cos,
    }));
}

/**
 * ⛔ THE MIGRATION SENTINEL. A single documented constant, so the one legitimate
 * half-turn in this family has exactly ONE name and can be grepped.
 *
 * There is currently NO production caller, and that is the point: `PlumbingTool` used
 * to apply this to toilets and sinks to compensate for their backwards meshes, and the
 * meshes are now built the right way round. If a future reader finds itself needing a
 * half-turn to look right, the fixture's GEOMETRY is wrong, not the reader — measure it
 * with `__tests__/plumbingFixtureFrame.measure.test.ts` before adding an offset.
 */
export const PLUMBING_FIXTURE_HALF_TURN = Math.PI;
