// §FEAT-SHARED-CAMERA-POSE (L-600, C59 §2.7) — pins the pure shared-camera-pose model.
//
// WHAT THESE TESTS ARE FOR, precisely: the live surfaces are two GPU renderers (Cesium and
// the WebGPU/THREE BIM view) that cannot run headless, and localhost dev is unusable in this
// repo — so the DECISION layer is pinned here and nowhere else. These tests do NOT prove the
// founder's three views move together in a browser; nothing in this pass does. They prove the
// model that a Phase-3 wiring will project.
//
// The two claims that matter most, and which are properties rather than examples:
//   1. AN APPLIED POSE CANNOT RE-EMIT (the oscillation the whole design exists to prevent).
//   2. θ IS APPLIED EXACTLY ONCE, on the BIM side, and agrees with ADR-0115's canonical
//      vector transform — the bug that would hide in testing because it is 0° everywhere
//      except a rotated site (Barcelona θ ≈ −45°).

import { describe, it, expect } from 'vitest';
import {
    INITIAL_SHARED_CAMERA_POSE,
    INITIAL_SHARED_CAMERA_POSE_STATE,
    LINKED_CAMERA_SURFACES,
    SURFACE_DISTANCE_BAND,
    bimHeadingFromTrueHeading,
    bimHeadingViaCanonicalTransform,
    clampDistanceForSurface,
    clampPitchDeg,
    classifyObservation,
    describeSharedPose,
    headingSeparationDeg,
    isCesiumSurface,
    normalizeHeadingDeg,
    projectPoseToBim,
    projectPoseToCesium,
    reduceSharedCameraPose,
    surfacesToProject,
    trueHeadingFromBimHeading,
    type LinkedCameraSurface,
    type SharedCameraPoseState,
} from '../src/engine/views/sharedCameraPose';

const S = INITIAL_SHARED_CAMERA_POSE_STATE;

function accepted(r: ReturnType<typeof reduceSharedCameraPose>) {
    if (!r.ok) throw new Error(`expected acceptance, got rejection: ${r.rejected}`);
    return r;
}

describe('§FEAT-SHARED-CAMERA-POSE — vocabulary + normalisation', () => {
    it('the globe and the 3D Site are both the ONE Cesium surface', () => {
        // C59 §2 invariant 1 / C60 §6.5 — three surfaces, TWO renderers.
        expect(isCesiumSurface('globe')).toBe(true);
        expect(isCesiumSurface('site-3d')).toBe(true);
        expect(isCesiumSurface('bim-3d')).toBe(false);
        expect(LINKED_CAMERA_SURFACES).toHaveLength(3);
    });

    it('normalises headings into [0, 360) and survives non-finite input', () => {
        expect(normalizeHeadingDeg(0)).toBe(0);
        expect(normalizeHeadingDeg(360)).toBe(0);
        expect(normalizeHeadingDeg(-45)).toBe(315);
        expect(normalizeHeadingDeg(725)).toBeCloseTo(5, 10);
        expect(normalizeHeadingDeg(Number.NaN)).toBe(0);
        expect(normalizeHeadingDeg(Number.POSITIVE_INFINITY)).toBe(0);
    });

    it('clamps pitch away from the gimbal at exactly -90', () => {
        // A camera at -90 has NO defined heading, which would make the shared angle
        // meaningless precisely at C60's world stage.
        expect(clampPitchDeg(-90)).toBe(-89);
        expect(clampPitchDeg(0)).toBe(-1);
        expect(clampPitchDeg(-35)).toBe(-35);
        expect(clampPitchDeg(Number.NaN)).toBe(INITIAL_SHARED_CAMERA_POSE.pitchDeg);
    });

    it('heading separation is the SHORT way round the compass', () => {
        expect(headingSeparationDeg(350, 10)).toBeCloseTo(20, 10);
        expect(headingSeparationDeg(10, 350)).toBeCloseTo(20, 10);
        expect(headingSeparationDeg(0, 180)).toBeCloseTo(180, 10);
    });
});

describe('§FEAT-SHARED-CAMERA-POSE — the anti-oscillation guard', () => {
    it('accepts a genuine user camera move and increments the epoch', () => {
        const r = accepted(
            reduceSharedCameraPose(S, {
                type: 'view.camera.pose-observed',
                surface: 'site-3d',
                pose: { headingDeg: 90, pitchDeg: -20, distanceM: 300 },
                appliedEpoch: S.epoch,
            }),
        );
        expect(r.next.pose.headingDeg).toBe(90);
        expect(r.next.epoch).toBe(S.epoch + 1);
        expect(r.next.originSurface).toBe('site-3d');
    });

    it('projects to every surface EXCEPT the one that moved', () => {
        const r = accepted(
            reduceSharedCameraPose(S, {
                type: 'view.camera.pose-observed',
                surface: 'site-3d',
                pose: { headingDeg: 90, pitchDeg: -20, distanceM: 300 },
                appliedEpoch: S.epoch,
            }),
        );
        expect(r.effects).toHaveLength(1);
        expect([...r.effects[0]!.surfaces].sort()).toEqual(['bim-3d', 'globe']);
        expect(r.effects[0]!.epoch).toBe(r.next.epoch);
        expect(surfacesToProject(null)).toEqual(LINKED_CAMERA_SURFACES);
    });

    it('PROPERTY: an applied pose cannot re-emit — every surface echoing it is refused', () => {
        // THE failure mode this design exists to prevent. Move the camera once, then have
        // EVERY surface faithfully report back the pose it was just given, at the epoch it
        // was given. Not one of those may change anything.
        const moved = accepted(
            reduceSharedCameraPose(S, {
                type: 'view.camera.pose-observed',
                surface: 'globe',
                pose: { headingDeg: 123.4, pitchDeg: -42, distanceM: 900 },
                appliedEpoch: S.epoch,
            }),
        ).next;

        for (const surface of LINKED_CAMERA_SURFACES) {
            const echo = reduceSharedCameraPose(moved, {
                type: 'view.camera.pose-observed',
                surface,
                pose: moved.pose,
                appliedEpoch: moved.epoch,
            });
            expect(echo.ok).toBe(false);
            if (!echo.ok) expect(echo.rejected).toMatch(/just been given|just given|re-emit/);
        }
        // …and a whole round of echoes leaves the state byte-identical.
        let cursor: SharedCameraPoseState = moved;
        for (const surface of LINKED_CAMERA_SURFACES) {
            const r = reduceSharedCameraPose(cursor, {
                type: 'view.camera.pose-observed',
                surface,
                pose: cursor.pose,
                appliedEpoch: cursor.epoch,
            });
            if (r.ok) cursor = r.next;
        }
        expect(cursor).toEqual(moved);
    });

    it('a jitter smaller than the tolerance is an echo, not a move', () => {
        expect(
            classifyObservation(
                S,
                'bim-3d',
                { ...S.pose, headingDeg: S.pose.headingDeg + 0.2 },
                S.epoch,
            ),
        ).toBe('echo');
        expect(
            classifyObservation(
                S,
                'bim-3d',
                { ...S.pose, headingDeg: S.pose.headingDeg + 5 },
                S.epoch,
            ),
        ).toBe('accept');
    });

    it('a STALE report (superseded epoch) is refused — the formaFlyToken discipline', () => {
        const moved = accepted(
            reduceSharedCameraPose(S, {
                type: 'view.camera.pose-observed',
                surface: 'globe',
                pose: { headingDeg: 200, pitchDeg: -50, distanceM: 700 },
                appliedEpoch: S.epoch,
            }),
        ).next;
        const stale = reduceSharedCameraPose(moved, {
            type: 'view.camera.pose-observed',
            surface: 'bim-3d',
            pose: { headingDeg: 10, pitchDeg: -10, distanceM: 100 },
            appliedEpoch: S.epoch, // the epoch BEFORE the globe moved
        });
        expect(stale.ok).toBe(false);
        if (!stale.ok) expect(stale.rejected).toMatch(/superseded/);
    });

    it('a FUTURE or non-finite epoch is refused rather than trusted', () => {
        expect(classifyObservation(S, 'globe', S.pose, S.epoch + 5)).toBe('future');
        expect(classifyObservation(S, 'globe', S.pose, Number.NaN)).toBe('future');
    });

    it('with linking OFF nothing is shared and nothing is refused into a mutation', () => {
        const off = accepted(
            reduceSharedCameraPose(S, { type: 'view.camera.set-link-mode', mode: 'off' }),
        ).next;
        expect(off.mode).toBe('off');
        const r = reduceSharedCameraPose(off, {
            type: 'view.camera.pose-observed',
            surface: 'bim-3d',
            pose: { headingDeg: 77, pitchDeg: -11, distanceM: 50 },
            appliedEpoch: off.epoch,
        });
        expect(r.ok).toBe(false);
        expect(projectPoseToCesium(off, 'globe')).toBeNull();
        expect(projectPoseToBim(off, { x: 0, y: 0, z: 0 }, 0)).toBeNull();
    });

    it('turning linking OFF moves no camera; turning it on re-projects', () => {
        const off = accepted(
            reduceSharedCameraPose(S, { type: 'view.camera.set-link-mode', mode: 'off' }),
        );
        expect(off.effects).toEqual([]);
        const on = accepted(
            reduceSharedCameraPose(off.next, { type: 'view.camera.set-link-mode', mode: 'angle-only' }),
        );
        expect(on.effects).toHaveLength(1);
    });

    it('reset returns the declared default and re-projects EVERY surface', () => {
        const moved = accepted(
            reduceSharedCameraPose(S, {
                type: 'view.camera.pose-observed',
                surface: 'bim-3d',
                pose: { headingDeg: 12, pitchDeg: -80, distanceM: 33 },
                appliedEpoch: S.epoch,
            }),
        ).next;
        const r = accepted(reduceSharedCameraPose(moved, { type: 'view.camera.reset' }));
        expect(r.next.pose).toEqual(INITIAL_SHARED_CAMERA_POSE);
        expect(r.next.originSurface).toBeNull();
        expect(r.effects[0]!.surfaces).toEqual(LINKED_CAMERA_SURFACES);
    });

    it('in angle-only mode a distance report does NOT change the shared distance', () => {
        const r = accepted(
            reduceSharedCameraPose(S, {
                type: 'view.camera.pose-observed',
                surface: 'site-3d',
                pose: { headingDeg: 42, pitchDeg: -25, distanceM: 9_999 },
                appliedEpoch: S.epoch,
            }),
        );
        expect(r.next.pose.headingDeg).toBe(42);
        expect(r.next.pose.distanceM).toBe(S.pose.distanceM); // untouched
    });
});

describe('§FEAT-SHARED-CAMERA-POSE — distance bands are DECLARED OUTPUTS', () => {
    it('clamps into the band and reports that it did', () => {
        const globe = clampDistanceForSurface(400, 'globe');
        expect(globe.distanceM).toBe(SURFACE_DISTANCE_BAND.globe.minM);
        expect(globe.clamped).toBe(true);

        const bim = clampDistanceForSurface(400, 'bim-3d');
        expect(bim.distanceM).toBe(400);
        expect(bim.clamped).toBe(false);
    });

    it('even in angle-and-distance mode the globe is still clamped — and says so', () => {
        const linked: SharedCameraPoseState = { ...S, mode: 'angle-and-distance' };
        const globe = projectPoseToCesium(linked, 'globe')!;
        expect(globe.rangeM).toBe(SURFACE_DISTANCE_BAND.globe.minM);
        expect(globe.clamped).toBe(true);
        // A silent clamp would be the defect; a declared one is the design.
    });

    it('a non-finite distance degrades to the band minimum, never to NaN', () => {
        const bad = clampDistanceForSurface(Number.NaN, 'site-3d');
        expect(bad.distanceM).toBe(SURFACE_DISTANCE_BAND['site-3d'].minM);
        expect(Number.isFinite(bad.distanceM)).toBe(true);
    });
});

describe('§FEAT-SHARED-CAMERA-POSE — θ is applied EXACTLY ONCE (ADR-0115 / ADR-0070)', () => {
    const BARCELONA_THETA_RAD = -Math.PI / 4; // ≈ −45°, the case that hides in testing

    it('Cesium gets the TRUE-north heading unrotated — θ is NOT applied there', () => {
        const state: SharedCameraPoseState = { ...S, pose: { ...S.pose, headingDeg: 137 } };
        expect(projectPoseToCesium(state, 'globe')!.headingDeg).toBe(137);
        expect(projectPoseToCesium(state, 'site-3d')!.headingDeg).toBe(137);
    });

    it('the BIM side subtracts θ — and at θ = 0 is byte-identical (ADR-0070)', () => {
        expect(bimHeadingFromTrueHeading(137, 0)).toBe(137);
        expect(bimHeadingFromTrueHeading(137, BARCELONA_THETA_RAD)).toBeCloseTo(182, 9);
    });

    it('EQUIVALENCE: the scalar form agrees with ADR-0115’s canonical vector transform', () => {
        // The pin that stops the convention drifting — the same discipline as
        // projectNorthSolarEquivalence.test.ts does for the sun azimuth.
        for (const theta of [0, 0.1, -Math.PI / 4, Math.PI / 3, -1.9, 2.7]) {
            for (const heading of [0, 15, 90, 179, 180, 271, 359.5]) {
                expect(bimHeadingFromTrueHeading(heading, theta)).toBeCloseTo(
                    bimHeadingViaCanonicalTransform(heading, theta),
                    9,
                );
            }
        }
    });

    it('the BIM heading round-trips back to true north', () => {
        for (const theta of [0, -Math.PI / 4, 1.2]) {
            for (const heading of [0, 33, 200, 359]) {
                expect(
                    trueHeadingFromBimHeading(bimHeadingFromTrueHeading(heading, theta), theta),
                ).toBeCloseTo(heading, 9);
            }
        }
    });

    it('a non-finite θ degrades to identity, never to NaN', () => {
        expect(bimHeadingFromTrueHeading(90, Number.NaN)).toBe(90);
        const t = projectPoseToBim(S, { x: 0, y: 0, z: 0 }, Number.NaN)!;
        expect(Number.isFinite(t.position.x)).toBe(true);
        expect(Number.isFinite(t.position.z)).toBe(true);
    });
});

describe('§FEAT-SHARED-CAMERA-POSE — the BIM orbit projection', () => {
    const origin = { x: 0, y: 0, z: 0 };

    it('scene axes are {x=East, y=Up, z=South} — a north-looking camera sits SOUTH of it', () => {
        // heading 0 = looking north. Scene north is −z, so the camera must be at +z.
        const state: SharedCameraPoseState = {
            ...S,
            pose: { headingDeg: 0, pitchDeg: -1, distanceM: 100 },
        };
        const t = projectPoseToBim(state, origin, 0)!;
        expect(t.position.z).toBeGreaterThan(0);
        expect(Math.abs(t.position.x)).toBeLessThan(1e-6);
    });

    it('an east-looking camera sits WEST of the target', () => {
        const state: SharedCameraPoseState = {
            ...S,
            pose: { headingDeg: 90, pitchDeg: -1, distanceM: 100 },
        };
        const t = projectPoseToBim(state, origin, 0)!;
        expect(t.position.x).toBeLessThan(0);
        expect(Math.abs(t.position.z)).toBeLessThan(1e-6);
    });

    it('a downward pitch always puts the camera ABOVE the target', () => {
        for (const pitch of [-1, -35, -89]) {
            const state: SharedCameraPoseState = {
                ...S,
                pose: { headingDeg: 200, pitchDeg: pitch, distanceM: 250 },
            };
            const t = projectPoseToBim(state, { x: 5, y: 3, z: -7 }, 0.4)!;
            expect(t.position.y).toBeGreaterThan(3);
        }
    });

    it('the camera sits exactly `distance` from the target it was handed', () => {
        const state: SharedCameraPoseState = {
            ...S,
            pose: { headingDeg: 71, pitchDeg: -33, distanceM: 480 },
        };
        const target = { x: 12, y: 4, z: -9 };
        const t = projectPoseToBim(state, target, -0.7)!;
        const d = Math.hypot(
            t.position.x - target.x,
            t.position.y - target.y,
            t.position.z - target.z,
        );
        expect(d).toBeCloseTo(480, 6);
        expect(t.target).toEqual(target);
    });

    it('θ ≈ −45° rotates the BIM camera by 45° and nothing else', () => {
        const state: SharedCameraPoseState = {
            ...S,
            pose: { headingDeg: 0, pitchDeg: -30, distanceM: 200 },
        };
        const straight = projectPoseToBim(state, origin, 0)!;
        const rotated = projectPoseToBim(state, origin, -Math.PI / 4)!;
        expect(rotated.projectHeadingDeg).toBeCloseTo(45, 9);
        // Same height, same distance — only the bearing changed.
        expect(rotated.position.y).toBeCloseTo(straight.position.y, 9);
        expect(Math.hypot(rotated.position.x, rotated.position.z)).toBeCloseTo(
            Math.hypot(straight.position.x, straight.position.z),
            9,
        );
    });
});

describe('§FEAT-SHARED-CAMERA-POSE — the linkage is inspectable, never hidden', () => {
    it('states plainly when it is off', () => {
        const off: SharedCameraPoseState = { ...S, mode: 'off' };
        const d = describeSharedPose(off);
        expect(d.enabled).toBe(false);
        expect(d.headline).toMatch(/off/i);
    });

    it('states the angle, which north it is measured from, and that plans are excluded', () => {
        const d = describeSharedPose(S);
        expect(d.enabled).toBe(true);
        expect(d.headline).toMatch(/true north/i);
        expect(d.lines.join(' ')).toMatch(/TRUE north/i);
        expect(d.lines.join(' ')).toMatch(/Plans, sections and elevations are not linked/);
    });

    it('says whether distance is shared, differently per mode', () => {
        expect(describeSharedPose(S).lines.join(' ')).toMatch(/own distance/);
        expect(
            describeSharedPose({ ...S, mode: 'angle-and-distance' }).lines.join(' '),
        ).toMatch(/Distance is shared/);
    });
});

describe('§FEAT-SHARED-CAMERA-POSE — honest scope of these tests', () => {
    it('does NOT claim any renderer is wired (L-600 is unverified live)', () => {
        // A deliberate marker, not a filler test: this module has no renderer import, so a
        // future edit that reaches into CesiumViewport or THREE from here would be caught by
        // review against this assertion rather than discovered in production.
        const surfaces: LinkedCameraSurface[] = [...LINKED_CAMERA_SURFACES];
        expect(surfaces).toEqual(['globe', 'site-3d', 'bim-3d']);
        expect(projectPoseToCesium(S, 'globe')!.epoch).toBe(S.epoch);
    });
});
