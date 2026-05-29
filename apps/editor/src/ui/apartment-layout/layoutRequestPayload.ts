// Apartment Layout — pure generate-payload builder (SPEC §3, A5-modal trigger).
//
// Assembles the ApartmentGenerateLayoutPayload the workflow consumes from the
// active level's walls + a program/constraints. Pure (type-only ai-host import →
// erased) so it unit-tests in plain Node. The trigger glue reads the real stores
// to produce the `walls` input + supplies program/constraints.

import type {
    ApartmentGenerateLayoutPayload,
    ApartmentProgram,
    ApartmentConstraints,
    ScoringWeights,
} from '@pryzm/ai-host';

/** A wall as the builder needs it: id, exterior flag, baseline (world XZ), and
 *  its openings (with metre offsets + widths so we can resolve window spans to
 *  WORLD coordinates for partition-snap avoidance). */
export interface PayloadWall {
    readonly id: string;
    readonly isExterior: boolean;
    /** [start, end] in WORLD metres, XZ plane. */
    readonly baseLine?: readonly [{ x: number; z: number }, { x: number; z: number }];
    readonly openings: ReadonlyArray<{
        type: 'window' | 'door';
        elementId?: string;
        /** Offset along the wall (metres) from baseLine[0]. */
        offset?: number;
        /** Opening width (metres). */
        width?: number;
    }>;
}

export interface BuildPayloadInput {
    readonly levelId: string;
    readonly walls: ReadonlyArray<PayloadWall>;
    readonly program: ApartmentProgram;
    readonly constraints: ApartmentConstraints;
    readonly count?: number;
    readonly scoringWeights?: ScoringWeights;
}

export const DEFAULT_PROGRAM: ApartmentProgram = {
    bedrooms: 2, bathrooms: 1, masterEnSuite: false,
    openPlanKitchenDining: true, livingRoom: true, entranceHall: true,
};

export const DEFAULT_CONSTRAINTS: ApartmentConstraints = {
    minCorridorWidth: 900, wallThickness: 100, floorToCeiling: 2700, wallTypeId: 'partition',
};

export const DEFAULT_WEIGHTS: ScoringWeights = {
    naturalLight: 1, privacy: 1, kitchenWorkflow: 1, corridorEfficiency: 1,
};

export const DEFAULT_OPTION_COUNT = 3;

/**
 * Build the generate payload. The shell = the level's EXTERIOR walls; window/
 * entrance ids are gathered from those walls' openings (entrance = first door).
 * Pure + deterministic.
 */
export function buildLayoutRequestPayload(input: BuildPayloadInput): ApartmentGenerateLayoutPayload {
    const exterior = input.walls.filter(w => w.isExterior);
    const shellWallIds = exterior.map(w => w.id);

    const windowIds: string[] = [];
    const doorIds: string[] = [];
    const windowSpansWorld: Array<{ a: { x: number; z: number }; b: { x: number; z: number } }> = [];
    const doorSpansWorld: Array<{ a: { x: number; z: number }; b: { x: number; z: number } }> = [];
    for (const w of exterior) {
        for (const o of w.openings) {
            if (!o.elementId) continue;
            if (o.type === 'window') windowIds.push(o.elementId);
            else if (o.type === 'door') doorIds.push(o.elementId);

            // Resolve the opening's span to WORLD coords (for D-TGL partition
            // snap). Needs baseLine + offset + width. Silently skip if any are
            // missing — back-compat with payload producers that pre-date the
            // span fields. Used for BOTH windows and pre-existing exterior
            // doors so the generator never lands an interior wall inside either.
            if (w.baseLine && typeof o.offset === 'number' && typeof o.width === 'number') {
                const [s, e] = w.baseLine;
                const dx = e.x - s.x;
                const dz = e.z - s.z;
                const L = Math.hypot(dx, dz);
                if (L > 1e-6) {
                    const ux = dx / L, uz = dz / L;
                    const a = { x: s.x + ux * o.offset,             z: s.z + uz * o.offset };
                    const b = { x: s.x + ux * (o.offset + o.width), z: s.z + uz * (o.offset + o.width) };
                    if (o.type === 'window') windowSpansWorld.push({ a, b });
                    else if (o.type === 'door') doorSpansWorld.push({ a, b });
                }
            }
        }
    }

    return {
        levelId: input.levelId,
        shellWallIds,
        entranceDoorId: doorIds[0] ?? '',
        windowIds,
        ...(windowSpansWorld.length > 0 ? { windowSpansWorld } : {}),
        ...(doorSpansWorld.length > 0 ? { doorSpansWorld } : {}),
        program: input.program,
        constraints: input.constraints,
        options: {
            count: input.count ?? DEFAULT_OPTION_COUNT,
            scoringWeights: input.scoringWeights ?? DEFAULT_WEIGHTS,
        },
    };
}
