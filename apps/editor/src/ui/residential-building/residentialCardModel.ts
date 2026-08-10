// Residential building (multi-family) — pure card view-model for the
// "Choose a residential building" preview modal (P3.3). The SIBLING of the
// house's `houseCardModel.ts`, but a residential building has ONE variant with
// N FLOORS (ground = core + commercial shell; upper = core + corridor + packed
// apartments), so the card model is a per-FLOOR breakdown rather than the house's
// per-storey variant grid.
//
// PURE: no DOM, no THREE. The only ai-host imports are TYPE-ONLY (erased at
// compile time), so this unit-tests in plain Node (the apps/editor vitest env).

import type {
    ResidentialBuildingOk,
    PerLevelApartments,
    PlacedApartment,
    BuildingLevel,
} from '@pryzm/ai-host';
import { computeCirculationReachability } from '../apartment-layout/layoutBubbleGraph.js';

const round1 = (n: number): number => Math.round(n * 10) / 10;
const clampPct = (n: number): number => Math.max(0, Math.min(100, Math.round(n)));

/** Friendly floor label from a 0-based level index. 0 → "Ground floor",
 *  1 → "First floor", … (architectural ordinals). Falls back to "Floor N". */
export function floorLabel(levelIndex: number): string {
    if (levelIndex <= 0) return 'Ground floor';
    const ordinals = ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth', 'Ninth', 'Tenth'];
    const name = ordinals[levelIndex - 1];
    return name ? `${name} floor` : `Floor ${levelIndex}`;
}

/** One apartment's per-card summary (drives the per-apartment plan thumbnail +
 *  the rejected hatch). */
export interface ApartmentCardSummary {
    readonly index: number;
    readonly typology: string;          // 'T1'..'T4'
    readonly status: 'ok' | 'rejected';
    readonly rejectReason?: string;
    /** The placed apartment (carries `layout` + `cell`) — used by the renderer to
     *  draw the per-apartment plan thumbnail or the hatched rejection box. */
    readonly apt: PlacedApartment;
    readonly targetAreaM2: number;      // rounded to 0.1
    readonly roomCount: number;
    readonly windowCount: number;
    /** Per-apartment layout score 0-100 (0 for a rejected cell). */
    readonly score: number;
    /** Short room-type roll-up, e.g. "2 bed · 1 bath · kitchen". */
    readonly roomSummary: string;
    /** §DOOR-RESCUE-REACH / §CIRCULATION-GRAPH PART 9 (founder, ADR-0087) — the door-aware
     *  CIRCULATION COMPLETENESS for THIS apartment (0-100): the share of HABITABLE rooms
     *  reachable through a PATH OF DOORS from the entrance. 100 ⇒ MAXIMUM circulation (the
     *  generator guarantee). 0 for a rejected (no-layout) cell. */
    readonly circulationPct: number;
    /** True when the apartment carries a real door graph so `circulationPct` is exact. */
    readonly circulationExact: boolean;
}

/** One floor's per-card summary. */
export interface FloorCardSummary {
    readonly levelIndex: number;
    readonly label: string;
    readonly role: 'ground' | 'upper';
    readonly commercialGroundFloor: boolean;
    readonly apartments: readonly ApartmentCardSummary[];
    readonly placedCount: number;        // apartments with status === 'ok'
    readonly rejectedCount: number;
}

/** The whole-building card view-model — the single preview card. */
export interface ResidentialCardModel {
    readonly title: string;
    readonly floorCount: number;
    readonly upperLevels: number;
    /** Total apartments across all upper floors (placed only). */
    readonly totalApartments: number;
    readonly totalRejected: number;
    /** Net residential area built (m², placed apartments only). */
    readonly totalNetAreaM2: number;
    /** Centred-core size as "W×D m" for the totals readout. */
    readonly coreSize: string;
    /** §RESI-CORRIDOR-ECONOMY (audit P1-2, C.4) — apartments as a % of the net plate (0-100),
     *  averaged across the upper levels that carry a partition `fillRatio`. Drives the option
     *  card's "apartments NN% of plate" honesty readout. Absent when no level carries one. */
    readonly fillPct?: number;
    /** §RESI-STRETCH-TO-RUN honesty (founder 2026-08-10) — present when any placed unit's real
     *  area landed ABOVE the user's max band: the partition prefers stretching a unit to the full
     *  usable run width over stranding a dead strip, and this line says so out loud, e.g.
     *  "largest unit 146 m² — above your 130 m² max (stretched to fill the plate width; raise
     *  the max or add a larger type)". Absent when every unit is inside the band. */
    readonly overBandNote?: string;
    /** §RESI-BAND-UNDERFILL honesty (founder 2026-08-10, §CONTEXT-DATA-HONESTY) — present when the
     *  minimum-area slider emptied whole apartment rows: an apartment row is capped at the
     *  engine-feasible depth, so on a narrow plate a row cannot reach a high minimum no matter what
     *  and the floor comes out mostly bare. Names the largest unit a row CAN hold, which is exactly
     *  the number to move the min slider to. Absent when no row was skipped on band grounds. */
    readonly underfillNote?: string;
    readonly floors: readonly FloorCardSummary[];
}

/** Count rooms by a coarse type bucket so a summary reads like a brief. */
function roomSummaryLine(apt: PlacedApartment): string {
    const rooms = apt.layout?.rooms ?? [];
    let bed = 0, bath = 0;
    let kitchen = false, living = false;
    for (const r of rooms) {
        const t = (r.type || '').toLowerCase();
        const occ = ((r as { occupancy?: string }).occupancy || '').toLowerCase();
        if (t.includes('bed') || occ.includes('bed')) bed++;
        else if (t.includes('bath') || t.includes('wc') || occ.includes('bath')) bath++;
        else if (t.includes('kitchen') || occ.includes('kitchen')) kitchen = true;
        else if (t.includes('living') || occ.includes('living')) living = true;
    }
    const parts: string[] = [];
    if (bed > 0) parts.push(`${bed} bed`);
    if (bath > 0) parts.push(`${bath} bath`);
    if (kitchen) parts.push('kitchen');
    if (living) parts.push('living');
    return parts.length > 0 ? parts.join(' · ') : `${rooms.length} rooms`;
}

function buildApartmentSummary(apt: PlacedApartment, index: number): ApartmentCardSummary {
    const rooms = apt.layout?.rooms ?? [];
    const windows = apt.layout?.windows?.length ?? 0;
    const score = apt.status === 'ok'
        ? clampPct(apt.layout?.score?.overall ?? 0)
        : 0;
    // §DOOR-RESCUE-REACH — per-apartment door-aware circulation completeness (100% = every
    // habitable room reachable through doors from the entrance). 0 for a rejected (no-layout) cell.
    const reach = apt.status === 'ok' && apt.layout
        ? computeCirculationReachability(apt.layout)
        : null;
    return {
        index,
        typology: apt.typology,
        status: apt.status,
        ...(apt.rejectReason ? { rejectReason: apt.rejectReason } : {}),
        apt,
        targetAreaM2: round1(apt.targetAreaM2),
        roomCount: rooms.length,
        windowCount: windows,
        score,
        roomSummary: apt.status === 'ok' ? roomSummaryLine(apt) : 'no layout — over-programmed',
        circulationPct: reach ? clampPct(reach.fraction * 100) : 0,
        circulationExact: reach ? reach.hasDoorGraph : false,
    };
}

function buildFloorSummary(level: BuildingLevel, perLevel: PerLevelApartments): FloorCardSummary {
    const apartments = perLevel.apartments.map((a, i) => buildApartmentSummary(a, i));
    const placedCount = apartments.filter(a => a.status === 'ok').length;
    const rejectedCount = apartments.length - placedCount;
    return {
        levelIndex: level.levelIndex,
        label: floorLabel(level.levelIndex),
        role: level.role,
        commercialGroundFloor: level.commercialGroundFloor === true,
        apartments,
        placedCount,
        rejectedCount,
    };
}

/**
 * Build the single whole-building card view-model from the orchestrator's OK
 * result. Pure. `levels` and `perLevelApartments` are STRICTLY index-aligned by
 * the orchestrator (one `perLevelApartments[i]` per `levels[i]`), so we zip them
 * positionally.
 */
export function buildResidentialCardModel(result: ResidentialBuildingOk): ResidentialCardModel {
    const floors: FloorCardSummary[] = [];
    let totalApartments = 0;
    let totalRejected = 0;
    let totalNetAreaM2 = 0;
    for (let i = 0; i < result.levels.length; i++) {
        const level = result.levels[i]!;
        const perLevel = result.perLevelApartments[i] ?? { levelIndex: level.levelIndex, role: level.role, apartments: [], publicCorridor: [] };
        const floor = buildFloorSummary(level, perLevel);
        floors.push(floor);
        for (const a of floor.apartments) {
            if (a.status === 'ok') { totalApartments++; totalNetAreaM2 += a.targetAreaM2; }
            else totalRejected++;
        }
    }
    const coreW = round1(result.core.x1 - result.core.x0);
    const coreD = round1(result.core.z1 - result.core.z0);
    // upperLevels = total floors minus the single ground floor.
    const upperLevels = Math.max(0, result.levels.length - 1);
    // §RESI-CORRIDOR-ECONOMY (C.4) — the "apartments NN% of plate" honesty readout: average the
    // partition fillRatio over the levels that carry one (the ground floor never does).
    const fillRatios = result.perLevelApartments
        .map((l) => l.fillRatio)
        .filter((f): f is number => typeof f === 'number' && Number.isFinite(f));
    const fillPct = fillRatios.length > 0
        ? clampPct((fillRatios.reduce((s, f) => s + f, 0) / fillRatios.length) * 100)
        : undefined;
    // §RESI-STRETCH-TO-RUN honesty — flag units the engine stretched past the user's max band
    // (full plate width preferred over a stranded dead strip; §CONTEXT-DATA-HONESTY: say so).
    const bandMax = result.requestedBandM2?.max;
    let overBandNote: string | undefined;
    if (typeof bandMax === 'number' && Number.isFinite(bandMax)) {
        let largestOver = 0, overCount = 0;
        for (const level of result.perLevelApartments) {
            for (const a of level.apartments) {
                if (a.status !== 'ok') continue;
                const area = a.cell.areaM2;
                if (area > bandMax * 1.02) { overCount++; largestOver = Math.max(largestOver, area); }
            }
        }
        if (overCount > 0) {
            overBandNote =
                `${overCount} unit${overCount === 1 ? ' is' : 's are'} above your ${round1(bandMax)} m² max ` +
                `(largest ${round1(largestOver)} m²) — stretched to fill the plate width instead of ` +
                `leaving a dead strip; raise the max or enable a larger type to absorb it`;
        }
    }
    // §RESI-BAND-UNDERFILL honesty — whole rows the min slider emptied. Quote the WORST level
    // (smallest row capacity), so the number shown is the one that unblocks every level.
    let underfillNote: string | undefined;
    {
        const uf = result.perLevelApartments
            .map((l) => l.bandUnderfill)
            .filter((u): u is NonNullable<typeof u> => u !== undefined)
            .sort((a, b) => a.largestRowUnitAreaM2 - b.largestRowUnitAreaM2)[0];
        if (uf) {
            underfillNote =
                `Some apartment rows were left empty: on this plate a row can hold at most ` +
                `${round1(uf.largestRowUnitAreaM2)} m², below your ${round1(uf.requestedMinAreaM2)} m² minimum ` +
                `(an apartment row is capped at the buildable depth, so a narrow plate cannot reach a high ` +
                `minimum) — lower the minimum to about ${round1(uf.largestRowUnitAreaM2)} m² to fill the floor`;
        }
    }
    return {
        title: 'Residential building',
        floorCount: result.levels.length,
        upperLevels,
        totalApartments,
        totalRejected,
        totalNetAreaM2: round1(totalNetAreaM2),
        coreSize: `${coreW}×${coreD} m`,
        ...(fillPct !== undefined ? { fillPct } : {}),
        ...(overBandNote !== undefined ? { overBandNote } : {}),
        ...(underfillNote !== undefined ? { underfillNote } : {}),
        floors,
    };
}
