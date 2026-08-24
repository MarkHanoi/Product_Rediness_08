// §GEN-ON-BOUNDARY-LINE (L-7961 · C106 §7.2) — the footprint resolver's ladder and
// its refusals.
//
// WHAT THESE LOCK, AND WHY EACH ONE IS A COUNT OR A QUOTED STRING RATHER THAN
// "IT DIDN'T THROW"
// ---------------------------------------------------------------------------
// Every refusal below is a sentence the founder will actually read, so the assertion
// is on the sentence — the numbers it quotes and the route back it names. A test that
// only asserted `ok === false` would pass against a refusal that said nothing useful,
// which is the failure this module exists to prevent (C106 §7.3: *"a verb the chat
// classifies but that generates nothing is the silent-success shape this repository
// keeps finding"*).
//
// ⛔ NOTE WHAT IS NOT TESTED HERE, DELIBERATELY: "is this plate big enough for N
// storeys?" Feasibility belongs to `orchestrateResidentialBuilding`, which quotes the
// measured plate SHORT SIDE against its own `MIN_PLATE_WIDTH_M`. This module must
// never grow an area threshold — see §RESI-REFUSAL-TRUE in `residentialError.ts`,
// where an invented `RESIDENTIAL_MIN_PLATE_M2 = 400` once told the founder his 674 m²
// plot was too small, and the measured truth turned out to be that a 720 m² plate
// refuses while a 272 m² plate builds.

import { describe, it, expect } from 'vitest';
import {
    resolveBoundaryLineFootprint,
    ringAreaM2,
    type BoundaryLineCandidate,
} from '../src/ui/generation/boundaryLineFootprint.js';

/** A closed 20 × 15 m rectangle (300 m²) on level L0. */
const closedRect = (over: Partial<BoundaryLineCandidate> = {}): BoundaryLineCandidate => ({
    id: 'boundaryLine_A',
    levelId: 'L0',
    closed: true,
    vertices: [
        { x: 0, z: 0 },
        { x: 20, z: 0 },
        { x: 20, z: 15 },
        { x: 0, z: 15 },
    ],
    ...over,
});

/** The site parcel: a 60 × 60 m lot (3600 m²) containing the rectangle above. */
const PARCEL = [
    { x: -10, z: -10 },
    { x: 50, z: -10 },
    { x: 50, z: 50 },
    { x: -10, z: 50 },
];

describe('§GEN-ON-BOUNDARY-LINE — ringAreaM2', () => {
    it('measures a 20 × 15 rectangle as 300 m² regardless of winding', () => {
        expect(ringAreaM2(closedRect().vertices)).toBe(300);
        expect(ringAreaM2([...closedRect().vertices].reverse())).toBe(300);
    });

    it('a ring with fewer than 3 points has no area', () => {
        expect(ringAreaM2([{ x: 0, z: 0 }, { x: 10, z: 0 }])).toBe(0);
    });
});

describe('§GEN-ON-BOUNDARY-LINE — the ladder', () => {
    it('the ONE closed line on the level is used, and the resolution says so', () => {
        const res = resolveBoundaryLineFootprint({
            lines: [closedRect()],
            activeLevelId: 'L0',
            parcel: PARCEL,
        });
        expect(res.ok).toBe(true);
        if (!res.ok) return;
        expect(res.lineId).toBe('boundaryLine_A');
        expect(res.areaM2).toBe(300);
        expect(res.footprint).toHaveLength(4);
        expect(res.how).toBe('only-closed-line');
    });

    it('an EXPLICIT selection wins over the implicit search, even across levels', () => {
        const res = resolveBoundaryLineFootprint({
            lines: [
                closedRect(),
                closedRect({ id: 'boundaryLine_B', levelId: 'L3', name: 'Block B' }),
            ],
            explicitId: 'boundaryLine_B',
            activeLevelId: 'L0',
            parcel: PARCEL,
        });
        expect(res.ok).toBe(true);
        if (!res.ok) return;
        expect(res.lineId).toBe('boundaryLine_B');
        expect(res.how).toBe('explicit');
        expect(res.lineLabel).toBe('"Block B"');
    });

    it('TWO closed lines REFUSE BY NAMING THE COUNT and both names — never a coin flip', () => {
        const res = resolveBoundaryLineFootprint({
            lines: [
                closedRect({ id: 'boundaryLine_A', name: 'Block A' }),
                closedRect({ id: 'boundaryLine_B', name: 'Block B' }),
            ],
            activeLevelId: 'L0',
            parcel: PARCEL,
        });
        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.reason).toContain('2 closed boundary lines');
        expect(res.reason).toContain('"Block A"');
        expect(res.reason).toContain('"Block B"');
        expect(res.reason).toContain('Select the one you want');
    });

    it('lines on OTHER levels are out of scope, and the refusal counts them', () => {
        const res = resolveBoundaryLineFootprint({
            lines: [closedRect({ levelId: 'L5' }), closedRect({ id: 'boundaryLine_B', levelId: 'L6' })],
            activeLevelId: 'L0',
            parcel: PARCEL,
        });
        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.reason).toContain('2 on other levels');
    });

    it('no boundary line at all names the TOOL and the shortcut', () => {
        const res = resolveBoundaryLineFootprint({ lines: [], activeLevelId: 'L0' });
        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.reason).toContain('Boundary Line tool');
        expect(res.reason).toContain('Alt+Shift+N');
    });

    it('an explicit id that does not exist is reported ABOUT ITSELF, not silently re-routed', () => {
        const res = resolveBoundaryLineFootprint({
            lines: [closedRect()],
            explicitId: 'boundaryLine_GONE',
            activeLevelId: 'L0',
        });
        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.reason).toContain('boundaryLine_GONE');
        expect(res.reason).toContain('1 boundary line');
    });
});

describe('§GEN-ON-BOUNDARY-LINE — an OPEN line is refused BY NAME, never closed by guess', () => {
    it('quotes the vertex count and the route back (Enter closes it)', () => {
        const res = resolveBoundaryLineFootprint({
            lines: [
                closedRect({
                    closed: false,
                    name: 'Setting-out run',
                    vertices: [{ x: 0, z: 0 }, { x: 20, z: 0 }, { x: 20, z: 15 }],
                }),
            ],
            activeLevelId: 'L0',
            parcel: PARCEL,
        });
        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.reason).toContain('OPEN');
        expect(res.reason).toContain('3 vertices');
        expect(res.reason).toContain('Enter');
        // The commitment that matters: it says out loud that it will not invent the edge.
        expect(res.reason).toContain("won't guess a closing edge you didn't draw");
    });

    it('an EXPLICITLY selected open line refuses about THAT line rather than falling through', () => {
        const res = resolveBoundaryLineFootprint({
            lines: [
                closedRect({ id: 'boundaryLine_OPEN', closed: false, name: 'Kerb line' }),
                closedRect({ id: 'boundaryLine_OK' }),
            ],
            explicitId: 'boundaryLine_OPEN',
            activeLevelId: 'L0',
        });
        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.reason).toContain('"Kerb line"');
        expect(res.reason).toContain('OPEN');
    });

    it('several open lines and no closed one refuses with the OPEN count', () => {
        const res = resolveBoundaryLineFootprint({
            lines: [
                closedRect({ id: 'boundaryLine_1', closed: false }),
                closedRect({ id: 'boundaryLine_2', closed: false }),
            ],
            activeLevelId: 'L0',
        });
        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.reason).toContain('all 2 boundary lines');
        expect(res.reason).toContain('OPEN');
    });
});

describe('§GEN-ON-BOUNDARY-LINE — degeneracy is reported as geometry, NOT as feasibility', () => {
    it('fewer than 3 distinct corners quotes how many there are', () => {
        const res = resolveBoundaryLineFootprint({
            lines: [
                closedRect({
                    // Duplicated corners collapse to 2 distinct points.
                    vertices: [{ x: 0, z: 0 }, { x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 0 }],
                }),
            ],
            activeLevelId: 'L0',
        });
        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.reason).toContain('2 distinct corners');
        expect(res.reason).toContain('at least 3');
    });

    it('a collinear ring says it has NO INSIDE — and never calls it "too small"', () => {
        const res = resolveBoundaryLineFootprint({
            lines: [
                closedRect({ vertices: [{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 20, z: 0 }] }),
            ],
            activeLevelId: 'L0',
        });
        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.reason).toContain('no inside');
        // ⭐ §RESI-REFUSAL-TRUE: no area may be quoted as a feasibility threshold.
        expect(res.reason).not.toContain('too small');
    });
});

describe('§GEN-ON-BOUNDARY-LINE — "within the site boundary" (the founder\'s own words)', () => {
    it('a line reaching OUTSIDE the parcel refuses with BOTH numbers and the corner count', () => {
        const res = resolveBoundaryLineFootprint({
            lines: [
                closedRect({
                    name: 'Overhang',
                    // Two corners at x = 80 sit outside the parcel's x ≤ 50.
                    vertices: [
                        { x: 0, z: 0 },
                        { x: 80, z: 0 },
                        { x: 80, z: 15 },
                        { x: 0, z: 15 },
                    ],
                }),
            ],
            activeLevelId: 'L0',
            parcel: PARCEL,
        });
        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.reason).toContain('2 of its 4 corners');
        expect(res.reason).toContain('OUTSIDE the parcel');
        // BOTH measured areas, so the user can see the relationship (C74).
        expect(res.reason).toContain('1200 m²');
        expect(res.reason).toContain('3600 m²');
    });

    it('a line fully inside the parcel passes containment', () => {
        const res = resolveBoundaryLineFootprint({
            lines: [closedRect()],
            activeLevelId: 'L0',
            parcel: PARCEL,
        });
        expect(res.ok).toBe(true);
    });

    it('NO parcel means UNKNOWN, not "outside" — containment claims nothing', () => {
        // §CONTEXT-DATA-HONESTY: a failure and an empty value are different values.
        // Plenty of real projects hold a drawn line and no cadastral parcel.
        for (const parcel of [null, undefined, [] as { x: number; z: number }[]]) {
            const res = resolveBoundaryLineFootprint({
                lines: [closedRect({ vertices: [
                    { x: 1000, z: 1000 },
                    { x: 1020, z: 1000 },
                    { x: 1020, z: 1015 },
                    { x: 1000, z: 1015 },
                ] })],
                activeLevelId: 'L0',
                parcel,
            });
            expect(res.ok).toBe(true);
        }
    });
});
