// §L-430 slice 2 — the SOLAR ↔ PROJECT-NORTH frame contract.
//
// WHY THIS FILE EXISTS
// --------------------
// Rotating the authoring frame to project north is the single easiest way to ship silently
// wrong shadow studies. Three separate hazards, each pinned below:
//
//   H1  "Solar must stay true north" read LITERALLY (leave the solar code alone) is WRONG.
//       If the building rotates by θ and the sun does not, the sun keeps pointing at true
//       north while the building no longer does — every shadow swings by θ. The invariant
//       is sun-vs-BUILDING geometry, so the sun MUST rotate with the frame.
//
//   H2  The sun-direction math exists TWICE — `solar-analysis/solarPosition.ts`
//       (`sunDirectionFromAltAz`, used by sun-hours ANALYSIS) and `RealSunService`
//       (the VIEWPORT key light), the latter being a deliberate replica. If only one
//       consumes θ, the rendered shadows and the analysed shadows disagree — the worst
//       failure mode, because both look plausible in isolation.
//
//   H3  Those two low-layer packages (L2 / L1) may NOT import the canonical transform
//       (`projectTrueNorth.ts`, L5), so they apply the algebraically identical SCALAR form
//       (azimuth − θ). Nothing structural stops that scalar form from drifting away from
//       the real transform — except this file.
//
// So: assert the scalar form against the REAL `trueVectorToProjectNorth`, not against a
// re-derivation of it. A sign error survives a hand-rolled expectation; it does not survive
// being compared to the shipping transform.

import { describe, it, expect } from 'vitest';
import { sunDirectionFromAltAz } from '@pryzm/solar-analysis';
import { trueVectorToProjectNorth } from '../src/ui/site/overlay/projectTrueNorth';

const DEG = Math.PI / 180;

/** Scene-XZ sun dir → East/North, using the project-wide mapping (east = x, north = −z). */
function dirToEastNorth(d: { x: number; y: number; z: number }) {
    return { east: d.x, north: -d.z };
}

const THETAS = [0, 10 * DEG, -23.5 * DEG, 44 * DEG, -44 * DEG];
const SUNS = [
    { alt: 60 * DEG, az: 180 * DEG },   // solar noon, due south
    { alt: 10 * DEG, az: 95 * DEG },    // low morning sun — the shadow-critical case
    { alt: 35 * DEG, az: 265 * DEG },   // afternoon
    { alt: 5 * DEG,  az: 0 },           // grazing, due north (S-hemisphere / midnight sun)
];

describe('§L-430 solar ↔ project-north frame equivalence', () => {
    it('H3: the scalar (az − θ) form EQUALS the canonical trueVectorToProjectNorth transform', () => {
        for (const theta of THETAS) {
            for (const { alt, az } of SUNS) {
                // What solar-analysis actually ships.
                const scalar = dirToEastNorth(sunDirectionFromAltAz(alt, az, theta));

                // What the canonical ADR-0115 transform says the answer must be: take the
                // TRUE-frame sun vector and rotate it into the project frame.
                const trueFrame = dirToEastNorth(sunDirectionFromAltAz(alt, az, 0));
                const canonical = trueVectorToProjectNorth(trueFrame, theta);

                expect(scalar.east).toBeCloseTo(canonical.east, 12);
                expect(scalar.north).toBeCloseTo(canonical.north, 12);
            }
        }
    });

    it('θ = 0 is EXACTLY the identity — byte-identity for every un-rotated site (ADR-0070)', () => {
        for (const { alt, az } of SUNS) {
            const before = sunDirectionFromAltAz(alt, az);
            const after = sunDirectionFromAltAz(alt, az, 0);
            expect(after).toEqual(before);          // strict equality, not toBeCloseTo
        }
    });

    it('altitude (hence sun HEIGHT and the horizon test) is untouched by θ', () => {
        // θ is a rotation about the vertical axis only. If it ever changed y, sunrise/sunset
        // and the is-above-horizon gate would move — a much louder bug, but assert it anyway.
        for (const theta of THETAS) {
            for (const { alt, az } of SUNS) {
                expect(sunDirectionFromAltAz(alt, az, theta).y).toBeCloseTo(Math.sin(alt), 12);
            }
        }
    });

    it('H1: the sun moves WITH the frame — relative sun/building geometry is PRESERVED', () => {
        // This is the property the founder's shadow studies actually depend on, stated
        // directly: a façade normal authored in the project frame must meet the sun at the
        // SAME incidence angle it would have had in the true frame. A façade that faces the
        // sun at 30° in the real world must still face it at 30° after we rotate the model.
        for (const theta of THETAS) {
            for (const { alt, az } of SUNS) {
                // A wall normal fixed to the BUILDING: due-south in the project frame.
                const normalProject = { east: 0, north: -1 };
                // The same physical wall in the TRUE frame is that normal rotated by θ.
                const normalTrue = trueVectorToProjectNorth(normalProject, -theta);

                const sunProject = dirToEastNorth(sunDirectionFromAltAz(alt, az, theta));
                const sunTrue = dirToEastNorth(sunDirectionFromAltAz(alt, az, 0));

                const dotProject = sunProject.east * normalProject.east + sunProject.north * normalProject.north;
                const dotTrue = sunTrue.east * normalTrue.east + sunTrue.north * normalTrue.north;

                expect(dotProject).toBeCloseTo(dotTrue, 12);
            }
        }
    });

    it('H1 (negative control): IGNORING θ genuinely breaks that invariant', () => {
        // Guards against a vacuous suite. If someone "fixes" the code by dropping θ, the
        // test above must FAIL — so prove the un-rotated sun really does change incidence.
        const theta = 30 * DEG;
        const { alt, az } = { alt: 35 * DEG, az: 265 * DEG };

        const normalProject = { east: 0, north: -1 };
        const normalTrue = trueVectorToProjectNorth(normalProject, -theta);

        const sunUnrotated = dirToEastNorth(sunDirectionFromAltAz(alt, az, 0)); // θ ignored — the bug
        const dotBuggy = sunUnrotated.east * normalProject.east + sunUnrotated.north * normalProject.north;
        const dotTrue = sunUnrotated.east * normalTrue.east + sunUnrotated.north * normalTrue.north;

        expect(Math.abs(dotBuggy - dotTrue)).toBeGreaterThan(0.1);
    });
});
