// §L-430 slice 2d / C34 §1.4 — the north arrow must resolve from PROJECT CONTEXT.
//
// WHY THIS MATTERS MORE THAN IT LOOKS
// -----------------------------------
// Once the authoring frame is rotated to project north, "up" on the sheet is PROJECT north.
// A north arrow drawn from a stored literal then points at project north while labelling
// itself TRUE north — the drawing is wrong in the one place a reader trusts absolutely, and
// wrong SILENTLY: the arrow renders happily either way, and nothing throws.
//
// The renderer is canvas code, so rather than assert pixels these tests pin the two things
// that actually determine correctness: (1) the SOURCE resolves from project context and not
// from a bare literal, and (2) the ANGLE ALGEBRA maps θ to the correct on-sheet bearing.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(resolve(HERE, '../PlanViewAnnotationRenderer.ts'), 'utf8');

/** The shipping resolution rule, mirrored so the algebra can be exercised directly. */
function northDegOnSheet(projectNorthRad: number, manualDeg?: number): number {
    if (manualDeg !== undefined) return manualDeg;
    return -(projectNorthRad * 180) / Math.PI;
}

const DEG = Math.PI / 180;

describe('§L-430 north arrow — resolves from project context (C34 §1.4)', () => {
    it('does NOT read a bare `northAngle` literal as the default direction', () => {
        // C34 §1.4: "MUST NOT carry a hard-coded numeric direction". The literal may only be
        // consulted behind an explicit manual-mode check.
        expect(SRC).toMatch(/northArrowMode === 'manual'/);
        // The literal read must be INSIDE the manual branch, i.e. guarded by isManual.
        expect(SRC).toMatch(/isManual[\s\S]{0,200}northAngle/);
    });

    it('derives the direction from the injected project-north angle', () => {
        expect(SRC).toMatch(/projectNorthRad/);
        expect(SRC).toMatch(/-\(this\._projectNorthRad \* 180\) \/ Math\.PI/);
    });

    it('θ = 0 ⇒ arrow points UP the sheet (unchanged for un-rotated projects)', () => {
        expect(northDegOnSheet(0)).toBe(-0);   // −0 and 0 are the same bearing
        expect(Math.abs(northDegOnSheet(0))).toBe(0);
    });

    it('points at TRUE north, i.e. the INVERSE of the project rotation', () => {
        // The plan is drawn in the project frame. If the project frame was rotated +30° from
        // true north, then true north sits at −30° on the sheet. Getting this sign backwards
        // yields an arrow that is wrong by 2θ — and still looks entirely plausible.
        expect(northDegOnSheet(30 * DEG)).toBeCloseTo(-30, 9);
        expect(northDegOnSheet(-20 * DEG)).toBeCloseTo(20, 9);
    });

    it('an EXPLICIT manual override still wins (C34 §1.4 escape hatch)', () => {
        expect(northDegOnSheet(30 * DEG, 45)).toBe(45);
        expect(northDegOnSheet(0, 12)).toBe(12);
    });

    it('the plan canvas feeds θ from the SAME provider as the site rings', () => {
        // If the arrow and the site linework read different sources they can disagree — the
        // pane would draw the parcel in one frame and annotate it with another.
        const canvas = readFileSync(resolve(HERE, '../PlanViewCanvas.ts'), 'utf8');
        expect(canvas).toMatch(/projectNorthRad:\s*this\._siteContextProvider\?\.\(\)\?\.projectNorthRad \?\? 0/);
    });
});
