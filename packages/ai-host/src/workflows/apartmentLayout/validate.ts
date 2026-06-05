// Apartment Layout Generator — pre-execution validator (SPEC §8 + SPEC-ARCHITECTURAL-PROGRAM-RULES).
//
// PURE: no stores, no DOM, no THREE, no network. Hard rules V1–V9; any failure
// rejects the option, and `failures[]` are fed back into the retry prompt (§10).
// Minima, mandatory windows and the door-permission matrix are read from the
// SINGLE SOURCE OF TRUTH rules database (rules/programRules.ts) — never duplicated.

import type {
    LayoutOption,
    LayoutRoom,
    ApartmentConstraints,
    ApartmentProgram,
    ValidationResult,
} from './types.js';
import { roomRule, doorAllowedBetween } from './rules/programRules.js';

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

    // V1 — minimum area (rules DB; enforced only where a minimum is defined).
    for (const r of option.rooms) {
        const min = roomRule(r.type).minAreaM2;
        if (min > 0 && r.area < min) {
            failures.push(`${r.name} (${r.type}) area ${r.area.toFixed(1)}m² is below the ${min}m² minimum`);
        }
    }

    // V2 — natural light for rooms that legally require a window (rules DB).
    for (const r of option.rooms) {
        if (roomRule(r.type).windowMandatory && r.windowCount < 1) {
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

    // V8 — connectivity legality: every room must have at least one PERMITTED access
    // neighbour (a room type it is allowed to share a door with). A room boxed in by
    // only forbidden neighbours (e.g. a bedroom surrounded solely by bedrooms) cannot
    // be reached logically. Circulation rooms connect to everything → always pass.
    for (const r of option.rooms) {
        if (roomRule(r.type).privacy === 'circulation') continue;
        const hasPermitted = r.adjacentTo.some(n => {
            const t = typeOf(n);
            return t !== undefined && doorAllowedBetween(r.type, t);
        });
        if (r.adjacentTo.length > 0 && !hasPermitted) {
            failures.push(`${r.name} (${r.type}) has no architecturally-permitted access — its only neighbours are forbidden door pairs`);
        }
    }

    // V9 — access-target rules (A.21.D5.d): every BEDROOM (incl. the master) and
    // every BATHROOM must be adjacent to a valid ACCESS space — a bedroom's access
    // comes from circulation or a social space; a bathroom only from a corridor/hall
    // (a bathroom off a bedroom is modelled as an `ensuite`, a distinct room type).
    // Uses the rules DB's accessFrom whitelist.
    //
    // §D5.d-ACCESS-TARGET — two refinements over the prior bedroom/bathroom-only check:
    //   1. the `master` is a bedroom too: it must reach circulation/social, never be
    //      reachable ONLY through its ensuite or another private room (the "bedroom you
    //      can only enter through another bedroom" anti-pattern this task targets);
    //   2. a private room (bedroom/master) is NOT validly accessed via another PRIVATE
    //      room — so the master's `ensuite` (in its accessFrom for the en-suite door)
    //      and any bedroom/master/study neighbour do NOT count as an access target.
    //      The ensuite-via-master rule is the inverse and is intentional; this guards
    //      the FORWARD direction (you reach the master from circulation, not from the
    //      ensuite). The bathroom whitelist (`['corridor']`) already excludes private
    //      rooms, so this only changes the bedroom/master verdict.
    const adjacentTypes = (r: LayoutRoom): Set<string> =>
        new Set(r.adjacentTo.map(n => typeOf(n)).filter((t): t is LayoutRoom['type'] => t !== undefined));
    const isPrivateType = (t: string): boolean => roomRule(t).privacy === 'private';
    for (const r of option.rooms) {
        if (r.type !== 'bedroom' && r.type !== 'master' && r.type !== 'bathroom') continue;
        // A bedroom/master must reach a NON-private access space (corridor / hall /
        // living / dining); a private neighbour (another bedroom, the ensuite, a
        // study) is never a valid primary access target. The bathroom whitelist is
        // circulation-only already, so the filter is a no-op there.
        const allowed = roomRule(r.type).accessFrom.filter(t => !isPrivateType(t));
        const adj = adjacentTypes(r);
        const hasTarget = allowed.some(t => adj.has(t));
        if (adj.size > 0 && !hasTarget) {
            const list = allowed.length > 0 ? allowed.join(' / ') : 'a corridor / hall';
            failures.push(`${r.name} (${r.type}) is not adjacent to a valid access space (needs one of: ${list}) — a private room must never be reachable only through another private room`);
        }
    }

    return { valid: failures.length === 0, failures };
}
