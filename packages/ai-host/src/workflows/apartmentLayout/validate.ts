// Apartment Layout Generator — pre-execution validator (SPEC §8).
//
// PURE: no stores, no DOM, no THREE, no network. Hard rules V1–V7; any failure
// rejects the option, and `failures[]` are fed back into the retry prompt (§10).
// This is the "pre-execution validator" the architect identified as the only
// genuinely-new logic piece besides the prompt template + scorer.

import type {
    LayoutOption,
    LayoutRoom,
    ApartmentConstraints,
    ApartmentProgram,
    ValidationResult,
} from './types.js';

/** V1 — minimum net floor areas (m²) per room type. */
const MIN_AREA_M2: Partial<Record<LayoutRoom['type'], number>> = {
    master: 12, bedroom: 9, living: 18, kitchen: 8, bathroom: 4, ensuite: 4,
};

/** V2 — room types that MUST have at least one window. */
const NEEDS_WINDOW: ReadonlyArray<LayoutRoom['type']> = ['master', 'bedroom', 'living', 'kitchen'];

/** V5 — minimum door clear width (mm). */
const MIN_DOOR_CLEARANCE_MM = 600;

export function validateLayout(
    option: LayoutOption,
    constraints: ApartmentConstraints,
    program: ApartmentProgram,
): ValidationResult {
    const failures: string[] = [];
    const byName = new Map(option.rooms.map(r => [r.name, r] as const));
    const typeOf = (name: string): LayoutRoom['type'] | undefined => byName.get(name)?.type;
    const countType = (t: LayoutRoom['type']): number => option.rooms.filter(r => r.type === t).length;

    // V1 — minimum area.
    for (const r of option.rooms) {
        const min = MIN_AREA_M2[r.type];
        if (min !== undefined && r.area < min) {
            failures.push(`${r.name} (${r.type}) area ${r.area.toFixed(1)}m² is below the ${min}m² minimum`);
        }
    }

    // V2 — natural light for habitable rooms.
    for (const r of option.rooms) {
        if (NEEDS_WINDOW.includes(r.type) && r.windowCount < 1) {
            failures.push(`${r.name} (${r.type}) has no window — habitable rooms need natural light`);
        }
    }

    // V3 — direct access (en-suite may be reached through its master).
    for (const r of option.rooms) {
        if (!r.hasDirectAccess && r.type !== 'ensuite') {
            failures.push(`${r.name} (${r.type}) is only reachable through another room`);
        }
    }

    // V4 — corridor width.
    if (option.corridorWidthMin < constraints.minCorridorWidth) {
        failures.push(`narrowest corridor ${option.corridorWidthMin}mm < minimum ${constraints.minCorridorWidth}mm`);
    }

    // V5 — door clearances.
    for (const d of option.doors) {
        if (d.width < MIN_DOOR_CLEARANCE_MM) {
            failures.push(`a door clear width ${d.width}mm < ${MIN_DOOR_CLEARANCE_MM}mm minimum`);
        }
    }

    // V6 — required adjacencies.
    for (const r of option.rooms) {
        if (r.type === 'ensuite' && !r.adjacentTo.some(n => typeOf(n) === 'master')) {
            failures.push(`${r.name} (en-suite) is not adjacent to a master bedroom`);
        }
        if (r.type === 'kitchen' && program.openPlanKitchenDining
            && !r.adjacentTo.some(n => typeOf(n) === 'dining')) {
            failures.push(`${r.name} (kitchen) is not adjacent to a dining area (open-plan required)`);
        }
    }

    // V7 — program satisfaction.
    const bedrooms = countType('bedroom') + countType('master');
    if (bedrooms < program.bedrooms) {
        failures.push(`only ${bedrooms} bedroom(s) — program requires ${program.bedrooms}`);
    }
    if (countType('bathroom') < program.bathrooms) {
        failures.push(`only ${countType('bathroom')} bathroom(s) — program requires ${program.bathrooms}`);
    }
    if (program.masterEnSuite && countType('ensuite') < 1) {
        failures.push('program requires a master en-suite but none is present');
    }
    if (program.livingRoom && countType('living') < 1) {
        failures.push('program requires a living room but none is present');
    }

    return { valid: failures.length === 0, failures };
}
