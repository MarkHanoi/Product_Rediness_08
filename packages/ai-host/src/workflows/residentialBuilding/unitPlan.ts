// L-864 / UNIT CONTAINMENT — §RESI-UNIT-CONTAINMENT.
//
// THE DEFECT (browser-observed in production 2026-08-13, C75 OBSERVED): a building generated
// as five apartments per floor shipped a model tree reading "Unassigned rooms on Level 01" —
// Corridor, Kitchen, Living Room, Bathroom, Bedroom 1, Bedroom 2, then ANOTHER Living Room,
// Kitchen, Bedroom, all FLAT under the level. Nothing in the model knew which rooms formed an
// apartment.
//
// THE DISCARD POINT: `ResidentialBuildingExecutor.execute` walks `perLevel.apartments` — one
// entry per PLACED cell, i.e. the partitioner's grouping, exactly the thing that is missing —
// and pushes `apartmentBuilds.push({ levelId, set, option, entryDoor })`. The apartment's
// IDENTITY (its position on the level, its typology, its shipped bedroom count, its cell area)
// is in scope at that line and was dropped. Downstream `_buildApartmentFinishSpecs` builds one
// `RoomData` per engine room with nothing to attach it to, and `_finishApartments` concatenates
// every apartment's rooms into ONE flat per-level list.
//
// THIS MODULE is the pure carrier of that grouping. It converts the orchestrator's per-level
// apartment lists into one `PlannedUnit` per PLACED apartment, in the SAME order the executor
// iterates, so the executor can (a) mint a hierarchy Unit node per apartment via the EXISTING
// `hierarchy.createUnit` bus verb and (b) stamp the AUTHORITATIVE `room.unitId` field on the
// rooms it builds from that apartment's layout.
//
// SCOPE — deliberately NOT the semantic graph. `check-graph-write-coverage` ledgers
// `partOf/writer` + `partOf/reader` as DELIBERATELY DECLINED (C71 §2.5) pending a prior
// decision: are hierarchy nodes graph citizens at all, or is `hierarchyStore` + `parentId` the
// sole hierarchy substrate? Shipping a `partOf` writer here would settle that by accident. This
// module writes NOTHING; it only plans, and the executor's write path is the authoritative
// `room.unitId` + `hierarchyStore`, which is the substrate the tree, the schedules and
// `getRoomsForUnit` / `getUnassignedRooms` already read.
//
// PURE: zero THREE, zero DOM, zero I/O, zero RNG. Deterministic.
//
// Contracts: C81 §8 (unit containment is a HARD PRECONDITION of the edit layer — "combine these
// two apartments" is meaningless to a model with no concept of an apartment); C20 (building &
// apartment aggregates); C03 §2 (commands are the only mutation path — this module mutates
// nothing); C71 §2.5 (the declined `partOf` ledger entry, respected above).

import type { PerLevelApartments, PlacedApartment } from './residentialBuildingOrchestrator.js';
import type { Typology } from './platePartition.js';

/** One apartment, as a hierarchy Unit the executor can mint + assign rooms to. */
export interface PlannedUnit {
    /** Orchestrator level index (0 = ground; apartments only ever sit on upper levels). */
    readonly levelIndex: number;
    /** 0-based position among the PLACED apartments on that level — the index into the
     *  executor's per-level `apartmentBuilds` sequence, so units zip to builds positionally.
     *  A REJECTED cell (no layout ⇒ no rooms ⇒ nothing to contain) gets no unit and does not
     *  consume an index. */
    readonly indexOnLevel: number;
    /** e.g. "01A", "01B" — level number + a per-level letter. Unique across the building. */
    readonly unitNumber: string;
    /** Display name, e.g. "Apartment 01A". */
    readonly name: string;
    /** e.g. 'studio' | '1-bed' | '3-bed' — derived from the SHIPPED layout, not the pinned
     *  typology (§RESI-CELL-PROGRAM-SCALE scales a program DOWN to the cell area, so a T3 cell
     *  may honestly ship as a 2-bed; the unit must read as what was built). */
    readonly unitType: string;
    /** Bedroom count counted from the shipped layout ('master' + 'bedroom' rooms). */
    readonly bedrooms: number;
    /** The packer's pinned typology, kept for provenance/diagnostics. */
    readonly typology: Typology;
    /** Cell gross area (m², from the cell rect) — so the unit node is not shipped blank. */
    readonly grossUnitAreaM2: number;
    /** How many rooms the shipped layout contains (= how many rooms carry this unitId). */
    readonly roomCount: number;
}

/** Room types the engine emits that COUNT as a bedroom. */
const BEDROOM_TYPES: ReadonlySet<string> = new Set(['master', 'bedroom']);

/** 0 → "A" … 25 → "Z" … 26 → "AA". Spreadsheet-style, so a level with more than 26
 *  apartments still yields unique, non-colliding unit letters. */
export function unitLetter(index: number): string {
    let i = Math.max(0, Math.floor(index));
    let out = '';
    for (;;) {
        out = String.fromCharCode(65 + (i % 26)) + out;
        i = Math.floor(i / 26) - 1;
        if (i < 0) return out;
    }
}

/** 0 → 'studio', n → 'n-bed'. The `UnitData.unitType` vocabulary the hierarchy panel shows. */
export function unitTypeForBedrooms(bedrooms: number): string {
    const b = Math.max(0, Math.floor(bedrooms));
    return b === 0 ? 'studio' : `${b}-bed`;
}

/** Count bedrooms in a SHIPPED layout ('master' + 'bedroom' rooms). */
function bedroomsInLayout(apt: PlacedApartment): number {
    const rooms = (apt.layout?.rooms ?? []) as ReadonlyArray<{ type?: string }>;
    let n = 0;
    for (const r of rooms) if (r.type && BEDROOM_TYPES.has(r.type)) n++;
    return n;
}

/** Cell gross area (m²) from the cell rect. Rounded to 3 dp for stable serialisation. */
function cellAreaM2(apt: PlacedApartment): number {
    const r = apt.cell?.rect;
    if (!r) return 0;
    const a = Math.abs(r.x1 - r.x0) * Math.abs(r.z1 - r.z0);
    return Math.round(a * 1e3) / 1e3;
}

/**
 * Plan ONE hierarchy Unit per PLACED apartment, level by level, in the orchestrator's own
 * iteration order. A rejected cell yields no unit (it ships no rooms). PURE + deterministic.
 */
export function planBuildingUnits(perLevelApartments: readonly PerLevelApartments[]): PlannedUnit[] {
    const units: PlannedUnit[] = [];
    for (const level of perLevelApartments ?? []) {
        if (!level?.apartments?.length) continue;
        let placed = 0;
        for (const apt of level.apartments) {
            if (apt.status !== 'ok' || !apt.layout) continue;   // rejected cell → no rooms → no unit
            const indexOnLevel = placed++;
            const levelCode = String(level.levelIndex).padStart(2, '0');
            const unitNumber = `${levelCode}${unitLetter(indexOnLevel)}`;
            const bedrooms = bedroomsInLayout(apt);
            units.push({
                levelIndex: level.levelIndex,
                indexOnLevel,
                unitNumber,
                name: `Apartment ${unitNumber}`,
                unitType: unitTypeForBedrooms(bedrooms),
                bedrooms,
                typology: apt.typology,
                grossUnitAreaM2: cellAreaM2(apt),
                roomCount: (apt.layout.rooms ?? []).length,
            });
        }
    }
    return units;
}
