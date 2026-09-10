/**
 * §ONE-ANSWER-TO-WHICH-BUILDING — the SINGLE resolver for spatial containment at
 * the `IfcBuilding` rung.
 *
 * ADR-0385 (founder ask, 2026-09-09) · applies ADR-0328 · amends ADR-0383 ·
 * amends C25 §1.3 · C84 EI-9 · §CONTEXT-DATA-HONESTY (L-581 / L-616) · L-8501.
 *
 * ── WHY THIS FILE EXISTS ─────────────────────────────────────────────────────
 *
 * The founder asked for *"each building … a different building entity for the IFC
 * schema and the inspect tree"*. The audit that preceded ADR-0385 found FOUR
 * records that could answer *"which building is this element in"*:
 *
 *   1. `IntermediateModel.building` — a SINGULAR field hard-coded to
 *      `{id:'building-1', name:'Default Building'}`, and the only one users reach.
 *   2. `hierarchyStore.BuildingData` — live, persisted, 143 non-test reference
 *      sites across 30 files.
 *   3. `plugins/ifc-export/src/hierarchy.ts` — richer, 263 green tests, ZERO
 *      production callers (L-8333).
 *   4. `SpaceEnvelope.group` — ADR-0383 D1, minted the same morning.
 *
 * ADR-0328 had already ruled: *"hierarchyStore + parentId remains the SOLE
 * hierarchy source of truth … Do not create a second independent hierarchy source
 * of truth."* ADR-0385 §2 applies that ruling here:
 *
 *   ⭐ `hierarchyStore` is the AUTHORITY for containment. `SpaceEnvelope.group` is
 *      the massing-stage AUTHORING axis and PROJECTS into it. Nothing downstream
 *      reads `group` for containment — the IFC exporter, the PRYZM tree and the
 *      IFC tree all ask THIS function.
 *
 * That is the C84 EI-9 half of the ask: the IFC file and the inspect tree agree
 * because they call the same function, not because two implementations were
 * written carefully. [[same-rule-two-implementations]] is this repo's dominant
 * defect; a second copy of this rule is the way this lane would fail.
 *
 * ── ⛔ THREE-VALUED, AND THE THIRD VALUE IS NOT DECORATION ────────────────────
 *
 * §CONTEXT-DATA-HONESTY: a FAILURE and an EMPTINESS must never share a value.
 *
 *   `carried`  the substrate RECORDS the containment: exactly one `LevelData`
 *              carries this `bimLevelId`, and the `BuildingData` it names exists.
 *   `derived`  the substrate records NOTHING about this level. That is an
 *              emptiness, not a failure — containment falls to the single default
 *              building. ⭐ EVERY EXISTING PROJECT TAKES THIS PATH, and it is what
 *              makes ADR-0383 D3's back-compatibility guarantee hold.
 *   `unknown`  the question CANNOT be answered. Three distinct causes, each named
 *              in `why`: the substrate could not be read at all; the `LevelData`
 *              names a building that does not exist (a DANGLING reference); or two
 *              buildings both claim this `bimLevelId` (Block A "Level 1" and
 *              Block B "Level 1" — ADR-0385 §3's own example), so the level
 *              resolves but the ELEMENT does not.
 *
 * `buildingId` is `null` **only** when `kind === 'unknown'`. A caller that needs a
 * value anyway (the exporter must still write a file) uses {@link DEFAULT_BUILDING_ID}
 * and REPORTS — it never silently launders `unknown` into `derived`.
 *
 * ── ⛔ WHAT THIS FILE DELIBERATELY DOES NOT DO ────────────────────────────────
 *
 *   • It does not read `SpaceEnvelope.group` FOR CONTAINMENT. ADR-0385 §2 point 3.
 *     ⚠ Stated precisely, because the ADR-0385 §4 contents join (2026-09-10)
 *     touches the group: `readEnvelopeSubstrate` reads `group.id` ONLY to key an
 *     envelope's footprint to the `BuildingData` id the projection minted from
 *     that same group (`projectedBuildingId`). Which buildings EXIST and which
 *     CLAIM a storey is still answered by `hierarchyStore` alone; the envelope
 *     can only select among the store's candidates, never add one. The type is
 *     still never imported — `group` lives on an L0 schema read by L7 UI, and
 *     this is L2 — but the reason is the ruling, not the layer.
 *   • It does not WRITE. The projection `massing group → BuildingData` is the
 *     authoring half (ADR-0385 §2 point 1) and belongs with the commands, behind
 *     the bus (P6). This module is pure over its snapshot and never throws.
 *   • It does not invent a building for a level the substrate has never heard of
 *     beyond the single default. N buildings come from N `BuildingData` rows.
 */

import { distancePointToRing, pointInPolygonXZ } from '@pryzm/geometry-kernel';
import { hierarchyStore, type HierarchyStore } from './HierarchyStore.js';
import type { BuildingData, LevelData } from './HierarchyTypes.js';
import { projectedBuildingId } from './MassingGroupProjection.js';

// ─────────────────────────────────────────────────────────────────────────────
// The default building
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ⛔ THIS STRING IS A PERSISTENCE FORMAT. DO NOT CHANGE IT.
 *
 * `createDefaultIntermediateModel()` has emitted `building-1` since the first
 * commit, and `IfcSpatialStructure` seeds the `IfcBuilding` GlobalId from
 * `building:${id}`. More importantly it is the SENTINEL that makes the ungrouped
 * storey key byte-identical to the pre-ADR-0385 key (see
 * `ifcIdentity.storeySlot`), which is the whole of the L-8501 back-compat pin:
 * change it and every storey GlobalId in every existing project re-churns.
 *
 * It lives HERE, next to the resolver, so the exporter and the trees cannot each
 * keep their own copy — two copies of a sentinel is the same defect as two copies
 * of a rule.
 */
export const DEFAULT_BUILDING_ID = 'building-1';
export const DEFAULT_BUILDING_NAME = 'Default Building';

// ─────────────────────────────────────────────────────────────────────────────
// The substrate, as this resolver needs to see it
// ─────────────────────────────────────────────────────────────────────────────

/** A `BuildingData` row, narrowed to what containment needs. */
export interface BuildingSubstrateBuilding {
    readonly id: string;
    readonly name: string;
    /** Persisted IFC identity, when the building came from an imported file. */
    readonly ifcGuid?: string;
}

/** A `LevelData` row, narrowed to the `bimLevelId → buildingId` edge. */
export interface BuildingSubstrateLevel {
    readonly id: string;
    readonly buildingId: string;
    readonly bimLevelId: string;
    readonly name: string;
}

/**
 * One read of `hierarchyStore`, taken ONCE and handed to every resolution in a
 * pass — so two elements in the same export can never see different vintages of
 * the store.
 *
 * ⛔ `null` is NOT `[]`. `buildings: null` means *the store could not be read*;
 * `buildings: []` means *it was read and holds none*. Collapsing those is exactly
 * the L-581/L-616 defect, and here it would be load-bearing: an unreadable store
 * reported as empty would make every element resolve `derived` into the default
 * building and look perfectly fine.
 */
export interface BuildingSubstrate {
    readonly buildings: readonly BuildingSubstrateBuilding[] | null;
    readonly levels: readonly BuildingSubstrateLevel[] | null;
    /** Why the substrate is shaped as it is — carried into every `why` string. */
    readonly note: string;
    /**
     * ⭐ ADR-0385 §4 — THE CONTENTS JOIN. The grouped `role: 'level'` envelopes with
     * their footprints, so an element on a storey N blocks share can be routed to
     * the block whose envelope it stands in. This is the axis §4 named as missing:
     * "N correct containers with nothing inside them".
     *
     * ⛔ `null` is NOT `[]`, for the third time in this file. `null` means the
     * envelope geometry was not supplied or could not be read — and then a fanned
     * storey's elements stay `unknown` and SAY SO in `why`. `[]` means it was read
     * and no grouped level envelope exists, which on a fanned storey is the same
     * `unknown` with a different, equally honest, reason (L-581 / L-616).
     */
    readonly envelopes: readonly BuildingSubstrateEnvelope[] | null;
    /** Why `envelopes` is shaped as it is — carried into every element `why`. */
    readonly envelopeNote: string;
}

/**
 * A grouped `role: 'level'` space envelope, narrowed to the one edge and the one
 * ring element routing needs.
 *
 * ⭐ `buildingId` is `projectedBuildingId(group.id)` — the SAME derivation the
 * projection uses to mint the `BuildingData` row (`MassingGroupProjection.ts`),
 * so an envelope keys to a building exactly the way the store spells it. There is
 * no second rule here; it is the projection's own id function read backwards.
 *
 * ⛔ THE STORE STAYS THE AUTHORITY (ADR-0328 / ADR-0385 §2). The resolver only
 * ever uses an envelope to SELECT AMONG the buildings `hierarchyStore` already
 * says claim the level. An envelope keyed to a building the store does not hold
 * selects nothing; an envelope can never introduce a building.
 */
export interface BuildingSubstrateEnvelope {
    readonly id: string;
    /** The PRYZM level id (`SpaceEnvelope.levelId`). */
    readonly levelId: string;
    /** `projectedBuildingId(group.id)`. */
    readonly buildingId: string;
    /** The footprint ring on the level's XZ plane, OPEN, world metres. */
    readonly footprint: readonly { readonly x: number; readonly z: number }[];
}

/** The substrate as it reads when `hierarchyStore` cannot be reached at all. */
export const UNREADABLE_SUBSTRATE: BuildingSubstrate = {
    buildings: null,
    levels: null,
    note: 'hierarchyStore could not be read',
    envelopes: null,
    envelopeNote: 'no envelope geometry was supplied to this read',
};

/**
 * The structural view of one envelope record, as {@link readEnvelopeSubstrate}
 * accepts it. Fed straight from a plugin store's `getState().values()`, which are
 * typed `unknown` at every seam that can reach them — so every field is checked,
 * never trusted. `MassingGroupMemberView` plus the ring; `plugins/space-envelope`
 * is L6 and this is L2, so the type is never imported.
 */
interface EnvelopeRecordView {
    readonly id?: unknown;
    readonly levelId?: unknown;
    readonly role?: unknown;
    readonly group?: unknown;
    readonly footprint?: unknown;
}

const _finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * Read the routing geometry off a set of envelope records.
 *
 * Only `role: 'level'` members carrying a `group` contribute — the same two
 * filters `readMassingGroupSubstrate` applies, because the buildings those rows
 * project are the only buildings an envelope can select. An ungrouped envelope
 * maps to the default building, which never fans, so it has nothing to select.
 *
 * @param envelopes `undefined` — the caller had no envelope store to offer;
 *                  `null` — it had one and the read failed. Both come back as
 *                  `envelopes: null`, told apart in the note (L-581 / L-616).
 */
export function readEnvelopeSubstrate(
    envelopes: Iterable<unknown> | null | undefined,
): Pick<BuildingSubstrate, 'envelopes' | 'envelopeNote'> {
    if (envelopes === undefined) {
        return { envelopes: null, envelopeNote: 'no envelope geometry was supplied to this read' };
    }
    if (envelopes === null) {
        return { envelopes: null, envelopeNote: 'the space envelope store could not be read' };
    }
    let records: unknown[];
    try {
        records = [...envelopes];
    } catch (err) {
        // A throw while READING is a failure, and a failure is not an emptiness.
        return {
            envelopes: null,
            envelopeNote: `the space envelope store threw while being iterated: ${String(err)}`,
        };
    }

    const out: BuildingSubstrateEnvelope[] = [];
    let scanned = 0;
    let malformed = 0;
    for (const raw of records) {
        scanned++;
        if (raw === null || typeof raw !== 'object') continue;
        const r = raw as EnvelopeRecordView;
        if (r.role !== 'level') continue;
        if (r.group === null || typeof r.group !== 'object') continue;
        const groupId = (r.group as { id?: unknown }).id;
        if (typeof groupId !== 'string' || groupId.length === 0) continue;
        if (typeof r.id !== 'string' || typeof r.levelId !== 'string' || r.levelId.length === 0) continue;
        if (!Array.isArray(r.footprint) || r.footprint.length < 3) { malformed++; continue; }
        const ring: { x: number; z: number }[] = [];
        for (const p of r.footprint as unknown[]) {
            const v = p as { x?: unknown; z?: unknown } | null;
            if (v === null || typeof v !== 'object' || !_finite(v.x) || !_finite(v.z)) {
                ring.length = 0;
                break;
            }
            ring.push({ x: v.x, z: v.z });
        }
        if (ring.length < 3) { malformed++; continue; }
        out.push({ id: r.id, levelId: r.levelId, buildingId: projectedBuildingId(groupId), footprint: ring });
    }

    return {
        envelopes: out,
        envelopeNote:
            `${scanned} envelope(s) read; ${out.length} grouped level envelope(s) carry a footprint` +
            (malformed > 0
                ? `; ${malformed} grouped level envelope(s) had no usable footprint and were skipped`
                : ''),
    };
}

/**
 * Snapshot `hierarchyStore` — and, when the caller can offer it, the envelope
 * geometry that routes elements on a storey several blocks share.
 *
 * @param store     injectable for tests; defaults to the module singleton, which is
 *                  the same instance `PartOfProjection` reads (ADR-0328).
 * @param envelopes the space envelope records (`store.getState().values()`), or
 *                  `null` when the caller had a store and could not read it, or
 *                  omitted when it had none. See {@link readEnvelopeSubstrate}.
 */
export function readBuildingSubstrate(
    store: HierarchyStore = hierarchyStore,
    envelopes?: Iterable<unknown> | null,
): BuildingSubstrate {
    const env = readEnvelopeSubstrate(envelopes);
    let buildings: BuildingData[];
    let levels: LevelData[];
    try {
        buildings = store.getBuildings();
        levels = store.getLevels();
    } catch (err) {
        // A throw is a FAILURE, and a failure is not an emptiness.
        return {
            ...UNREADABLE_SUBSTRATE,
            ...env,
            note: `hierarchyStore threw while being read: ${String(err)}`,
        };
    }
    if (!Array.isArray(buildings) || !Array.isArray(levels)) {
        return {
            ...UNREADABLE_SUBSTRATE,
            ...env,
            note: 'hierarchyStore returned a non-array for buildings or levels',
        };
    }
    return {
        buildings: buildings.map((b) => ({ id: b.id, name: b.name, ifcGuid: b.ifcGuid })),
        levels: levels.map((l) => ({
            id: l.id,
            buildingId: l.buildingId,
            bimLevelId: l.bimLevelId,
            name: l.name,
        })),
        note: `hierarchyStore: ${buildings.length} building(s), ${levels.length} level row(s)`,
        ...env,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Resolution
// ─────────────────────────────────────────────────────────────────────────────

export type BuildingResolutionKind = 'carried' | 'derived' | 'unknown';

export interface BuildingResolution {
    readonly kind: BuildingResolutionKind;
    /** `null` if and only if `kind === 'unknown'`. */
    readonly buildingId: string | null;
    /** `null` if and only if `kind === 'unknown'`. */
    readonly name: string | null;
    /** Persisted IFC identity of the building, when the substrate carries one. */
    readonly ifcGuid?: string;
    /** Human-readable reason. Never empty — a bare kind is not an explanation. */
    readonly why: string;
    /**
     * Present only when `kind === 'unknown'` because SEVERAL buildings claim this
     * `bimLevelId`. Named rather than arbitrated: choosing one would be the
     * "answer confidently and be wrong" failure C84 §9 records.
     */
    readonly candidateBuildingIds?: readonly string[];
    /**
     * Present only when `kind === 'carried'` BECAUSE envelope geometry selected
     * this building among several the store says claim the element's storey
     * (ADR-0385 §4). Names the envelope the element stands in, so a report can
     * show its evidence. Absent when the storey had one owner and geometry was
     * never consulted.
     */
    readonly envelopeId?: string;
}

const DERIVED_DEFAULT = (why: string): BuildingResolution => ({
    kind: 'derived',
    buildingId: DEFAULT_BUILDING_ID,
    name: DEFAULT_BUILDING_NAME,
    why,
});

/**
 * Which `IfcBuilding` does this PRYZM level belong to?
 *
 * @param bimLevelId the PRYZM level id (`LevelData.bimLevelId`), NOT the
 *                   hierarchy node id. The bridge is declared in
 *                   `HierarchyTypes.ts`'s own header.
 */
export function resolveLevelBuilding(
    bimLevelId: string | null | undefined,
    substrate: BuildingSubstrate,
): BuildingResolution {
    if (substrate.buildings === null || substrate.levels === null) {
        return {
            kind: 'unknown',
            buildingId: null,
            name: null,
            why: `containment is unreadable — ${substrate.note}`,
        };
    }
    if (!bimLevelId) {
        return DERIVED_DEFAULT(
            'the element carries no levelId, so no level row can be matched; ' +
            'falls to the single default building',
        );
    }

    const rows = substrate.levels.filter((l) => l.bimLevelId === bimLevelId);

    if (rows.length === 0) {
        // An EMPTINESS: the substrate simply does not record this level. Every
        // project authored before ADR-0385 is in exactly this state.
        return DERIVED_DEFAULT(
            `no hierarchy level row carries bimLevelId "${bimLevelId}" ` +
            `(${substrate.levels.length} row(s) read); falls to the single default building`,
        );
    }

    const buildingIds = [...new Set(rows.map((r) => r.buildingId))];

    if (buildingIds.length > 1) {
        // ADR-0385 §3's own example, and it is a genuine failure to answer: the
        // storeys are distinguishable, the ELEMENT is not.
        return {
            kind: 'unknown',
            buildingId: null,
            name: null,
            why:
                `bimLevelId "${bimLevelId}" is claimed by ${buildingIds.length} buildings ` +
                `(${buildingIds.join(', ')}); an element carrying only a levelId cannot be ` +
                `routed to one of them until it carries a building axis of its own`,
            candidateBuildingIds: buildingIds,
        };
    }

    const buildingId = buildingIds[0] as string;
    const building = substrate.buildings.find((b) => b.id === buildingId);

    if (!building) {
        // A DANGLING reference. The substrate answered, and its answer is broken —
        // that is not the same as it having said nothing.
        return {
            kind: 'unknown',
            buildingId: null,
            name: null,
            why:
                `hierarchy level row for bimLevelId "${bimLevelId}" names buildingId ` +
                `"${buildingId}", which resolves to no building (${substrate.buildings.length} read)`,
        };
    }

    return {
        kind: 'carried',
        buildingId: building.id,
        name: building.name,
        ifcGuid: building.ifcGuid,
        why: `hierarchy level "${rows[0]!.name}" records building "${building.name}"`,
    };
}

/** A point on the plan (XZ) at which an element stands, world metres. */
export interface PlanSample {
    readonly x: number;
    readonly z: number;
}

/**
 * How far OUTSIDE an envelope ring a plan sample may fall and still count as
 * standing in it.
 *
 * A block's perimeter wall is authored ON its footprint edge — centreline on the
 * ring, or offset by half a thickness either way — and `pointInPolygonXZ` is
 * half-open, so the far two edges of a square read as outside. A quarter metre
 * covers every wall thickness the schema defaults to and stays far below any
 * street between two blocks. Two blocks that actually TOUCH put a shared wall
 * inside both bands, and that resolves `unknown` — which is the honest answer:
 * a party wall belongs to neither block alone.
 */
export const ENVELOPE_EDGE_TOLERANCE_M = 0.25;

function _standsIn(at: PlanSample, ring: BuildingSubstrateEnvelope['footprint']): boolean {
    if (pointInPolygonXZ(at.x, at.z, ring)) return true;
    return distancePointToRing(at.x, at.z, ring.length, (i) => ring[i]!.x, (i) => ring[i]!.z)
        <= ENVELOPE_EDGE_TOLERANCE_M;
}

/**
 * Which `IfcBuilding` does this element belong to?
 *
 * The element→building edge is not carried by any element schema today — `Wall`
 * and `Slab` have no building axis and no group axis (measured: `grep -n "group"
 * packages/schemas/src/elements/Wall.ts Slab.ts` → 0 hits). So containment is
 * resolved THROUGH the element's level, which is the edge the substrate does
 * model. `elementId` is carried only so `why` can name the subject.
 *
 * ⭐ ADR-0385 §4 — AND WHEN THE LEVEL FANS, THROUGH THE ENVELOPE IT STANDS IN.
 * A master plan's blocks share the project's storey ladder, so `resolveLevelBuilding`
 * answers `unknown` with N candidates for every element on those storeys — N correct
 * containers, nothing inside them. This function closes that gap with a pure function
 * of the substrate and one plan point:
 *
 *   1. the CANDIDATES are the buildings `hierarchyStore` records as claiming the
 *      storey — the store is the authority and nothing here widens its answer;
 *   2. among those candidates' grouped level envelopes ON THIS STOREY, the ones the
 *      point stands in are the evidence;
 *   3. exactly ONE building's envelope(s) ⇒ `carried`, naming the envelope.
 *
 * ⛔ Anything else is `unknown`, with the reason: no plan point supplied; envelope
 * geometry not supplied or unreadable; the point stands in NO candidate envelope; or
 * it stands in envelopes of SEVERAL candidates (overlapping massing, a party wall).
 * A wrong container is worse than an honest unresolved one — that is ADR-0385's own
 * rule, and it is why this never picks the nearest, the first, or the largest.
 *
 * A storey with ONE owner never consults geometry: the store answered, and a point
 * that disagrees with the store is not evidence against the authority.
 *
 * @param at where the element stands on the plan, world metres. Callers derive it
 *           from what they hold — the exporter from world-space vertices, the tree
 *           from the store record — and pass `null` when they cannot.
 */
export function resolveElementBuilding(
    elementId: string,
    levelId: string | null | undefined,
    substrate: BuildingSubstrate,
    at?: PlanSample | null,
): BuildingResolution {
    const r = resolveLevelBuilding(levelId, substrate);
    const named = (x: BuildingResolution): BuildingResolution =>
        ({ ...x, why: `element "${elementId}": ${x.why}` });

    // Only a FANNED storey needs geometry. Every other shape — carried, derived,
    // unreadable, dangling — is the store's answer and stands as given.
    const candidates = r.kind === 'unknown' ? (r.candidateBuildingIds ?? []) : [];
    if (candidates.length < 2 || !levelId || substrate.buildings === null) return named(r);

    const fanned =
        `bimLevelId "${levelId}" is claimed by ${candidates.length} buildings (${candidates.join(', ')})`;
    const unknown = (why: string): BuildingResolution => ({
        kind: 'unknown',
        buildingId: null,
        name: null,
        why: `element "${elementId}": ${why}`,
        candidateBuildingIds: candidates,
    });

    if (at === undefined || at === null || !Number.isFinite(at.x) || !Number.isFinite(at.z)) {
        return unknown(
            `${fanned}; no plan position was supplied for the element, so envelope geometry ` +
            `could not select among them`,
        );
    }
    if (substrate.envelopes === null) {
        return unknown(
            `${fanned}; ${substrate.envelopeNote}, so envelope geometry could not select among them`,
        );
    }

    const wanted = new Set(candidates);
    const onStorey = substrate.envelopes.filter((e) => e.levelId === levelId && wanted.has(e.buildingId));
    const hits = onStorey.filter((e) => _standsIn(at, e.footprint));
    const hitBuildings = [...new Set(hits.map((h) => h.buildingId))];
    const where = `plan position (${at.x.toFixed(2)}, ${at.z.toFixed(2)})`;

    if (hitBuildings.length === 1) {
        const buildingId = hitBuildings[0]!;
        const building = substrate.buildings.find((b) => b.id === buildingId);
        if (!building) {
            // The level row names it, the envelope keys to it, and no BuildingData
            // row exists — a dangling reference, reported as one.
            return unknown(
                `${fanned}; ${where} stands in envelope "${hits[0]!.id}" keyed to building ` +
                `"${buildingId}", which resolves to no building (${substrate.buildings.length} read)`,
            );
        }
        return {
            kind: 'carried',
            buildingId: building.id,
            name: building.name,
            ifcGuid: building.ifcGuid,
            envelopeId: hits[0]!.id,
            why:
                `element "${elementId}": ${fanned}; ${where} stands in envelope "${hits[0]!.id}" ` +
                `of building "${building.name}", whose storey hierarchyStore records`,
        };
    }
    if (hitBuildings.length === 0) {
        return unknown(
            `${fanned}; ${where} stands in NONE of the ${onStorey.length} grouped envelope(s) those ` +
            `buildings have on this storey (${substrate.envelopeNote}), so the element is not routed`,
        );
    }
    return unknown(
        `${fanned}; ${where} stands in envelopes of ${hitBuildings.length} of them ` +
        `(${hitBuildings.join(', ')}) — overlapping massing — so the element is not routed`,
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// The roster — which buildings a pass should emit
// ─────────────────────────────────────────────────────────────────────────────

export interface RosterBuilding {
    readonly id: string;
    readonly name: string;
    readonly ifcGuid?: string;
    /** The PRYZM level ids that resolved into this building, in input order. */
    readonly levelIds: readonly string[];
    /** How the levels under it got here. `derived` means the default fallback. */
    readonly kind: Exclude<BuildingResolutionKind, 'unknown'>;
}

export interface BuildingRoster {
    /**
     * ⭐ ADR-0385 §3 — PRYZM level ids that fanned out into SEVERAL buildings.
     *
     * A master plan's blocks sit on the PROJECT's shared storey ladder
     * (`masterPlanAuthoringPlan` hands every profile the same
     * `levels: AdoptLevelCandidate[]`), so Block A "Level 1" and Block B "Level 1"
     * are ONE PRYZM `levelId` and — per C25 §1.3 as amended — TWO
     * `IfcBuildingStorey` entities. Listed here so a caller can EXPAND its own
     * per-level structures rather than discovering the one-to-many the hard way.
     */
    readonly fannedLevelIds: readonly string[];
    /**
     * ⭐ NEVER EMPTY. A pass with no readable containment still has one building —
     * the default — because "I cannot tell you which building" is not a reason to
     * emit a file with no `IfcBuilding` in it. The honesty lives in `unknown`
     * below, not in a missing entity.
     */
    readonly buildings: readonly RosterBuilding[];
    /** Levels whose building could NOT be resolved, with the reason for each. */
    readonly unknown: readonly { readonly levelId: string; readonly why: string }[];
    /**
     * Buildings the substrate holds that no level in this pass resolved into.
     * Reported, not emitted: an `IfcBuilding` owning no `IfcBuildingStorey` says
     * something the model does not.
     */
    readonly unusedBuildingIds: readonly string[];
}

/**
 * Group a pass's levels into the buildings that own them.
 *
 * ⛔ THE UNGROUPED GUARANTEE (ADR-0383 D3 / ADR-0385 §3). When nothing in the
 * substrate claims any of these levels, the roster is EXACTLY ONE building whose
 * id is {@link DEFAULT_BUILDING_ID} holding every level in input order — which is
 * bit-for-bit the shape the exporter produced before ADR-0385. A level that
 * resolves `unknown` also lands there, but is additionally listed in `unknown` so
 * the caller can raise a diagnostic. It is never silently absorbed.
 *
 * ⭐ ONE LEVEL MAY APPEAR IN SEVERAL BUILDINGS (ADR-0385 §3, C25 §1.3 as amended).
 * A master plan's blocks share the project's storey ladder, so a `levelId` claimed by
 * N buildings is emitted into all N and listed in {@link BuildingRoster.fannedLevelIds}.
 * ⛔ A caller holding a `Map<levelId, …>` MUST expand — see
 * `packages/file-format/src/export/ifc/buildingContainment.ts`, which turns each such
 * level into one `ExportLevel` per owning building. A caller that does not expand
 * silently keeps whichever owner it saw last.
 */
export function buildBuildingRoster(
    levelIds: readonly string[],
    substrate: BuildingSubstrate,
): BuildingRoster {
    const order: string[] = [];
    const acc = new Map<string, {
        id: string; name: string; ifcGuid?: string; levelIds: string[];
        kind: Exclude<BuildingResolutionKind, 'unknown'>;
    }>();
    const unknown: { levelId: string; why: string }[] = [];

    const put = (
        b: { id: string; name: string; ifcGuid?: string },
        levelId: string,
        kind: Exclude<BuildingResolutionKind, 'unknown'>,
    ) => {
        let row = acc.get(b.id);
        if (!row) {
            row = { id: b.id, name: b.name, ifcGuid: b.ifcGuid, levelIds: [], kind };
            acc.set(b.id, row);
            order.push(b.id);
        }
        // A building holding even one CARRIED level is carried: the substrate
        // spoke about it. `derived` is reserved for the pure-fallback bucket.
        if (kind === 'carried') row.kind = 'carried';
        row.levelIds.push(levelId);
    };

    const fannedLevelIds: string[] = [];

    for (const levelId of levelIds) {
        const r = resolveLevelBuilding(levelId, substrate);
        if (r.kind === 'unknown') {
            unknown.push({ levelId, why: r.why });

            // ⭐⭐ ADR-0385 §3 — THE STOREY FANS OUT; ONLY THE ELEMENT IS UNROUTABLE.
            //
            // ⛔ THIS BRANCH USED TO PUT THE LEVEL IN THE DEFAULT BUILDING AND STOP,
            // and that collapsed the founder's ACTUAL master plan back to one building.
            // Measured 2026-09-09 (lane MP-PROJECTION): every profile in
            // `masterPlanAuthoringPlan` is handed the SAME `levels` — the project's one
            // storey ladder — so three blocks of three storeys share L1/L2/L3, every
            // level resolved `unknown`, and a correctly-projected three-building
            // hierarchy still emitted ONE `IfcBuilding`. The projection was right and
            // the roster threw the answer away.
            //
            // ⛔ AND IT IS NOT A SOFTENING OF `resolveLevelBuilding`, WHICH IS
            // UNCHANGED. That function answers *"which building is this ELEMENT in"*
            // and `unknown` is still the only honest answer — no element schema carries
            // a building axis, so an element on a shared storey genuinely cannot be
            // routed (ADR-0385 §4). This function answers a DIFFERENT question —
            // *"which buildings should this pass EMIT"* — and for that, "three" is not
            // ambiguous at all. The level stays in `unknown` so the element-routing
            // warning still reaches the caller; it is a fan-out AND a diagnostic, never
            // one instead of the other.
            const candidates = r.candidateBuildingIds ?? [];
            let placed = 0;
            for (const id of candidates) {
                const b = substrate.buildings?.find((x) => x.id === id);
                if (!b) continue; // a dangling candidate is not a building to emit
                put({ id: b.id, name: b.name, ifcGuid: b.ifcGuid }, levelId, 'carried');
                placed++;
            }
            if (placed > 1) fannedLevelIds.push(levelId);
            if (placed > 0) continue;

            // No candidates, or every candidate dangled: an unreadable substrate, or a
            // level naming a building that does not exist. Both fall to the default —
            // the pre-existing behaviour, byte for byte.
            put({ id: DEFAULT_BUILDING_ID, name: DEFAULT_BUILDING_NAME }, levelId, 'derived');
            continue;
        }
        put({ id: r.buildingId!, name: r.name!, ifcGuid: r.ifcGuid }, levelId, r.kind);
    }

    if (order.length === 0) {
        // No levels at all in this pass. Still one building — see the doc above.
        order.push(DEFAULT_BUILDING_ID);
        acc.set(DEFAULT_BUILDING_ID, {
            id: DEFAULT_BUILDING_ID, name: DEFAULT_BUILDING_NAME, levelIds: [], kind: 'derived',
        });
    }

    const emitted = new Set(order);
    const unusedBuildingIds = (substrate.buildings ?? [])
        .map((b) => b.id)
        .filter((id) => !emitted.has(id));

    return {
        buildings: order.map((id) => {
            const row = acc.get(id)!;
            return {
                id: row.id, name: row.name, ifcGuid: row.ifcGuid,
                levelIds: row.levelIds, kind: row.kind,
            };
        }),
        unknown,
        unusedBuildingIds,
        fannedLevelIds,
    };
}
