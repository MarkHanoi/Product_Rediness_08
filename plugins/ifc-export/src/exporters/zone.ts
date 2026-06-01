/**
 * IfcZone exporter — IFC-α-3 (2026-06-01).
 *
 * Per IFC4X3, an `IfcZone` is a non-hierarchical collection of one or more
 * `IfcSpace`s sharing a common purpose. PRYZM uses it to model APARTMENTS:
 * each apartment becomes one `IfcZone` whose members are the rooms
 * (IfcSpaces) belonging to that apartment, linked via `IfcRelAssignsToGroup`.
 *
 * Per [C25-IFC-EXPORT-PRODUCTION §1.3](../../../docs/02-decisions/contracts/C25-IFC-EXPORT-PRODUCTION.md)
 * + master plan IFC-α-3 §7.3.
 *
 * Architectural notes:
 *
 *   • `IfcZone` aggregates spaces via `IfcRelAssignsToGroup`, NOT
 *     `IfcRelAggregates`. `IfcRelAggregates` is reserved for the SPATIAL
 *     hierarchy (storey → space); `IfcRelAssignsToGroup` is the IFC-canonical
 *     way to wire a cross-cutting non-spatial grouping such as an
 *     IfcSystem / IfcGroup / IfcZone.
 *   • `IfcZone.ObjectType` is set to `"Apartment"` for α-3; the
 *     `apartmentZoneObjectType` pure helper exists so later sprints can
 *     return other zone kinds (e.g. `"FireCompartment"`) without changing
 *     this file's public shape.
 *   • Apartments whose rooms are all unresolved (none in the spaceRefMap)
 *     still produce the `IfcZone` entity — the zone exists as metadata —
 *     but emit NO `IfcRelAssignsToGroup` (an assigns-relation with zero
 *     RelatedObjects is invalid in IFC4X3). Same when `memberRoomIds` is
 *     empty.
 *
 * Wrapped in a `pryzm.ifc.export-zone` span (P8 / sprint exit criterion).
 */

import * as WebIFC from 'web-ifc';
import type { IfcAPI } from 'web-ifc';

import {
    label,
    text,
    writeEntity,
    type EntityRef,
} from '../api/webifc-helpers.js';
import { mintGlobalId, type GuidProvider } from '../guid-provider.js';
import { withSpan } from '../otel.js';
import type { OwnerHistoryRefs } from '../owner-history.js';

// ---------------------------------------------------------------------------
// Public input shape
// ---------------------------------------------------------------------------

/**
 * A PRYZM Apartment flattened into the minimal shape needed to emit an
 * `IfcZone`. Each apartment groups one or more IfcSpaces (rooms) under a
 * common purpose — e.g. "Apt-101", "Two-bed corner unit".
 *
 * The caller projects whichever apartment representation it has (e.g. the
 * shipped #51 single-apartment shell, the upcoming multi-apartment floor
 * plate, or an IFC-imported `IfcZone`) into this interface.
 */
export interface ApartmentToExport {
    /** PRYZM apartment id (`apt_<ulid>` or similar). */
    readonly id: string;
    /** Short display name (`IfcZone.Name`), e.g. `"Apt-101"`. */
    readonly name: string;
    /** Long display name (`IfcZone.LongName`), e.g. `"Two-bedroom corner unit"`. */
    readonly longName?: string;
    /** Free-form description (`IfcZone.Description`). */
    readonly description?: string;
    /**
     * PRYZM room ids belonging to this apartment. Order is preserved in the
     * emitted `IfcRelAssignsToGroup.RelatedObjects` set so downstream tools
     * (BIMCollab, IfcQuery) iterate rooms in caller order.
     */
    readonly memberRoomIds: ReadonlyArray<string>;
}

/**
 * Per-export context shared with the rooms exporter. Mirrors the inlined
 * arg-bag in α-2's `SpaceExportArgs` — kept as a thin record so the batch
 * helper does not have to forward six positional parameters.
 */
export interface ExportCtx {
    readonly api: IfcAPI;
    readonly modelId: number;
    readonly ownerRefs: OwnerHistoryRefs;
    readonly guid: GuidProvider;
}

export interface ExportedZone {
    /** The `IfcZone` entity itself. */
    readonly zoneRef: EntityRef;
    /**
     * The `IfcRelAssignsToGroup` entity wiring member spaces to the zone,
     * or `undefined` when no rooms were resolvable into IfcSpace refs.
     */
    readonly relRef: EntityRef | undefined;
    /** PRYZM apartment id. */
    readonly pryzmId: string;
    /** Number of member rooms requested by the caller. */
    readonly memberCount: number;
    /** Number of member rooms that resolved to an `IfcSpace` ref. */
    readonly resolvedMemberCount: number;
}

// ---------------------------------------------------------------------------
// Type mapping
// ---------------------------------------------------------------------------

/**
 * Pure helper: return the `IfcZone.ObjectType` string for an apartment.
 *
 * For α-3 this always returns `"Apartment"`. Future sprints can specialise
 * here (e.g. inspect the apartment's role flags to emit
 * `"FireCompartment"`, `"AcousticCompartment"`, etc.) without touching the
 * call sites in `IFC4X3Exporter.ts`.
 */
export function apartmentZoneObjectType(_apt: ApartmentToExport): string {
    return 'Apartment';
}

// ---------------------------------------------------------------------------
// Main entry — emit one IfcZone per Apartment
// ---------------------------------------------------------------------------

/**
 * Emit one `IfcZone` for a PRYZM apartment, plus (when at least one member
 * room resolves) one `IfcRelAssignsToGroup` linking the zone to its member
 * `IfcSpace`s.
 *
 * `spaceRefMap` maps PRYZM room id → the `IfcSpace` IFC line ref produced
 * by `exportRoomToSpace` in α-2. Rooms that do NOT appear in the map are
 * silently skipped (they were either not emitted as spaces in this export,
 * or they belong to a different export shard).
 *
 * Returns `relRef = undefined` when no rooms were resolvable OR
 * `memberRoomIds` was empty — an `IfcRelAssignsToGroup` with zero
 * `RelatedObjects` would be invalid in IFC4X3.
 */
export function exportApartmentToZone(
    apt: ApartmentToExport,
    spaceRefMap: ReadonlyMap<string, EntityRef>,
    ctx: ExportCtx,
): ExportedZone {
    return withSpan(
        'pryzm.ifc.export-zone',
        (span) => {
            const { api, modelId, ownerRefs, guid } = ctx;

            const globalId = mintGlobalId(api, modelId, guid);

            // 1. IFCZONE(GlobalId, OwnerHistory, Name, Description,
            //            ObjectType, LongName)
            const zoneRef = writeEntity(
                api,
                modelId,
                WebIFC.IFCZONE,
                globalId,
                ownerRefs.ownerHistory,
                label(api, modelId, apt.name),
                apt.description ? text(api, modelId, apt.description) : null,
                label(api, modelId, apartmentZoneObjectType(apt)),
                apt.longName ? label(api, modelId, apt.longName) : null,
            );

            // 2. Resolve member rooms → IfcSpace refs. Order-preserving;
            //    unresolved ids are dropped silently.
            const resolvedMembers: EntityRef[] = [];
            for (const roomId of apt.memberRoomIds) {
                const spaceRef = spaceRefMap.get(roomId);
                if (spaceRef) resolvedMembers.push(spaceRef);
            }

            span.setAttribute('zoneId', apt.id);
            span.setAttribute('memberCount', apt.memberRoomIds.length);
            span.setAttribute('resolvedMemberCount', resolvedMembers.length);

            // 3. IFCRELASSIGNSTOGROUP — only when ≥1 member resolved.
            //    Schema-wise, RelatedObjects is a SET[1:?] OF IfcObjectDefinition.
            //    A zero-length set is invalid; in that case we emit no
            //    relation but the zone itself stays.
            let relRef: EntityRef | undefined = undefined;
            if (resolvedMembers.length > 0) {
                // IFCRELASSIGNSTOGROUP(GlobalId, OwnerHistory, Name,
                //                      Description, RelatedObjects,
                //                      RelatedObjectsType, RelatingGroup)
                relRef = writeEntity(
                    api,
                    modelId,
                    WebIFC.IFCRELASSIGNSTOGROUP,
                    mintGlobalId(api, modelId, guid),
                    ownerRefs.ownerHistory,
                    null,
                    null,
                    resolvedMembers.slice(),
                    null,
                    zoneRef,
                );
            }

            return {
                zoneRef,
                relRef,
                pryzmId: apt.id,
                memberCount: apt.memberRoomIds.length,
                resolvedMemberCount: resolvedMembers.length,
            };
        },
    );
}

// ---------------------------------------------------------------------------
// Batch helper
// ---------------------------------------------------------------------------

export interface ApartmentZoneRef {
    readonly aptId: string;
    readonly zoneRef: EntityRef;
    /** Undefined when no member space resolved (see `exportApartmentToZone`). */
    readonly relRef: EntityRef | undefined;
}

export interface ApartmentZoneBatchResult {
    /** Total `IfcZone` entities written. */
    readonly zoneCount: number;
    /** Total `IfcRelAssignsToGroup` entities written. */
    readonly relCount: number;
    /** Per-apartment refs in input order. */
    readonly refs: ReadonlyArray<ApartmentZoneRef>;
}

/**
 * Batch helper: emit one `IfcZone` per apartment in `apartments`, plus one
 * `IfcRelAssignsToGroup` per apartment whose member rooms (at least one)
 * resolve into the `spaceRefMap`.
 *
 * Empty `apartments` → returns `zoneCount=0, relCount=0, refs=[]` and writes
 * no IFC entities. This is the no-op path used by IFC4X3Exporter when the
 * snapshot carries no apartment data.
 */
export function writeAllApartmentZones(
    apartments: ReadonlyArray<ApartmentToExport>,
    spaceRefMap: ReadonlyMap<string, EntityRef>,
    ctx: ExportCtx,
): ApartmentZoneBatchResult {
    if (apartments.length === 0) {
        return { zoneCount: 0, relCount: 0, refs: [] };
    }

    const refs: ApartmentZoneRef[] = [];
    let zoneCount = 0;
    let relCount = 0;

    for (const apt of apartments) {
        const { zoneRef, relRef } = exportApartmentToZone(apt, spaceRefMap, ctx);
        zoneCount += 1;
        if (relRef) relCount += 1;
        refs.push({ aptId: apt.id, zoneRef, relRef });
    }

    return { zoneCount, relCount, refs };
}
