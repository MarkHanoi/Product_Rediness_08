/**
 * §FIX-STAIR-SHAPE-DESYNC — the ONE registry of stair shapes.
 *
 * THE DEFECT THIS EXISTS TO PREVENT: the set of stair shapes was written out by
 * hand in two unrelated places — the ARCHITECTURE palette (three icons: I / L / U)
 * and `StairPathParamPanel`'s button row (four: I / L / U / C). Curved stairs were
 * therefore authorable but UNREACHABLE from the palette (founder: "we are MISSING
 * ONE FOR CURVED STAIR"), and nothing could keep the two lists in step as shapes
 * are added.
 *
 * Both surfaces now DERIVE from this list, so a new shape appears in both by
 * construction. This is the shape CATALOGUE only — the ACTIVE shape of a live
 * drawing session is owned by `StairPathToolController` (seeded from the palette
 * icon via `config.initialShape`); the parameter panel is a VIEW of it, never a
 * rival copy. See `StairPathParamPanel._selectedShape`.
 *
 * Layer: pure data — no DOM, no THREE, no I/O.
 */

/** Drawing mode a shape is authored in. */
export type StairMode2D = 'straight' | 'curved';

/** The shapes an architect can author. */
export type StairShapeChoice = 'I' | 'L' | 'U' | 'C';

export interface StairShapeDescriptor {
    readonly label: StairShapeChoice;
    readonly mode: StairMode2D;
    /** Tooltip / palette caption. */
    readonly hint: string;
    /**
     * Polyline segments the architect must draw before the run auto-commits.
     * `null` = not segment-driven (curved is committed by its own sweep gesture).
     * U is the exception: `2-run` needs 2, `3-run` needs 3 — resolved by
     * {@link expectedSegmentsFor}, never re-derived at a call site.
     */
    readonly expectedSegments: number | null;
}

export const STAIR_SHAPES: readonly StairShapeDescriptor[] = [
    { label: 'I', mode: 'straight', hint: 'Straight stair',                            expectedSegments: 1 },
    { label: 'L', mode: 'straight', hint: 'L-shape (90° turn)',                        expectedSegments: 2 },
    { label: 'U', mode: 'straight', hint: 'U-shape (180° turn, two parallel runs)',    expectedSegments: 2 },
    { label: 'C', mode: 'curved',   hint: 'Curved stair (swept arc)',                  expectedSegments: null },
];

const BY_LABEL = new Map<StairShapeChoice, StairShapeDescriptor>(
    STAIR_SHAPES.map(s => [s.label, s]),
);

/** Descriptor for a shape label, or undefined for an unknown label. */
export function stairShapeDescriptor(label: string): StairShapeDescriptor | undefined {
    return BY_LABEL.get(label as StairShapeChoice);
}

/**
 * Segments the architect must draw for `label`. The U variant is the ONLY
 * shape whose count depends on a parameter, and it is resolved here so the
 * tool controller and the panel can never disagree about the click budget —
 * the disagreement that let a stair activated as `L` commit as `U`.
 *
 * Returns 0 when the shape is not segment-driven (curved), matching the
 * controller's "no auto-commit" sentinel.
 */
export function expectedSegmentsFor(
    label: StairShapeChoice | null | undefined,
    uVariant: '2-run' | '3-run' = '2-run',
): number {
    if (!label) return 0;
    if (label === 'U') return uVariant === '3-run' ? 3 : 2;
    return stairShapeDescriptor(label)?.expectedSegments ?? 0;
}
