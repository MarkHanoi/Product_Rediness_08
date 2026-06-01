/**
 * IFC4X3-RV variant exporter shim — C26 REV-α-2 (2026-06-01).
 *
 * IFC4X3-RV is the "Revit variant" of IFC4X3: a strict subset / overlay that
 * Revit's own IFC importer recognises. The variant DOES NOT FORK the
 * IFC4X3 exporter — it simply opts-in a few Revit-specific property sets
 * and grouping conventions on top of the standard IFC4X3 pipeline:
 *
 *   • `Pset_RevitType`     — written per IfcType so Revit can recover its
 *                            native Type parameters on round-trip.
 *   • `Pset_RevitInstance` — written per IfcElement instance so Revit can
 *                            recover its native Instance parameters.
 *   • `IfcGroup`           — used to represent Revit Worksets (ObjectType
 *                            = "Revit Workset"). Members are linked via
 *                            `IfcRelAssignsToGroup` — the same relation
 *                            α-3 uses for Apartment zones.
 *   • `Pset_SiteRevitVariant` — a stub site-level pset carrying the
 *                            requested coordinate-mode label. The real
 *                            coordinate transform lives in α-3.
 *
 * Per [C26-REVIT-ROUND-TRIP §1.1](../../../docs/02-decisions/contracts/C26-REVIT-ROUND-TRIP.md)
 * (IFC4 / IFC4X3-RV as canonical) + master plan RVT-α-2.
 *
 * Architectural notes:
 *
 *   • The writers are AGNOSTIC of element type — they accept opaque
 *     `EntityRef` values (typeRef / elementRef / siteRef) and never branch
 *     on IFCWALL / IFCDOOR / IFCWINDOW. Whoever owns the host element
 *     chooses when to call them.
 *   • Every writer is wrapped in its own OpenTelemetry span (P8 — every
 *     new exported function carries ≥ 1 span). The span carries
 *     `propertyCount` / `memberCount` attributes so traces are useful
 *     without pulling individual IFC lines back out.
 *   • Workset member resolution is α-3: today the batch helper accepts a
 *     pre-built `memberElementsByWorksetId` map but `IFC4X3Exporter.ts`
 *     passes an empty map. Worksets without resolved members still emit
 *     the IfcGroup entity (it is valid metadata); they just don't emit
 *     an `IfcRelAssignsToGroup` (a zero-`RelatedObjects` relation is
 *     invalid in IFC4X3).
 *   • Plugin purity: no THREE, no DOM. All entity writes flow through
 *     existing `webifc-helpers` + `mintGlobalId`.
 */

import * as WebIFC from 'web-ifc';

import type { RevitExportOptions, RevitWorkset } from '@pryzm/schemas';

import {
    label,
    text,
    writeEntity,
    type EntityRef,
    type ValueRef,
} from '../api/webifc-helpers.js';
import { mintGlobalId, type GuidProvider } from '../guid-provider.js';
import { withSpan } from '../otel.js';
import type { OwnerHistoryRefs } from '../owner-history.js';

// ---------------------------------------------------------------------------
// Public input shape
// ---------------------------------------------------------------------------

/**
 * Per-export context shared by every Revit-variant writer. Mirrors the
 * α-3 / α-4 / α-5 / α-6 / α-7 `ExportCtx` shape so callers can reuse the
 * same record.
 */
export interface ExportCtx {
    readonly api: WebIFC.IfcAPI;
    readonly modelId: number;
    readonly ownerRefs: OwnerHistoryRefs;
    readonly guid: GuidProvider;
}

/**
 * The bundle of Revit-variant inputs the IFC4X3 exporter accepts. The
 * exporter behaves identically to today when this is OMITTED.
 *
 *   - `options`      validated `RevitExportOptions` (variant must equal
 *                    `'IFC4X3-RV'` — enforced at runtime via
 *                    `assertRevitVariant`).
 *   - `elementIds`   PRYZM element ids paired with their IFC line refs;
 *                    each receives a `Pset_RevitInstance`.
 */
export interface RevitVariantInput {
    /** Validated RevitExportOptions (variant must equal 'IFC4X3-RV'). */
    readonly options: RevitExportOptions;
    /** Element ids that should each receive a Pset_RevitInstance. */
    readonly elementIds: ReadonlyArray<{ id: string; entityRef: number }>;
}

/**
 * The three coordinate-mode labels the variant exporter recognises.
 * Mirrors `RevitCoordinateMode` in `@pryzm/schemas` so call sites can
 * narrow on the union without re-importing the schema package.
 */
export type RevitCoordinateModeValue =
    | 'project-base-point'
    | 'survey-point'
    | 'internal-origin';

/**
 * Output shape for the two single-element pset writers
 * (`writePsetRevitType` / `writePsetRevitInstance`). The
 * `IfcRelDefinesByProperties` entity links the pset to its host.
 */
export interface WriteRevitPsetResult {
    /** The `IfcPropertySet` entity. */
    readonly psetRef: EntityRef;
    /** The `IfcRelDefinesByProperties` entity linking pset → host. */
    readonly relRef: EntityRef;
}

/**
 * Output shape for the workset batch helper.
 */
export interface WriteRevitWorksetGroupsResult {
    /** Total `IfcGroup` entities written (one per workset). */
    readonly groupCount: number;
    /**
     * Total `IfcRelAssignsToGroup` entities written. May be < `groupCount`
     * when a workset has no resolvable members — zero-`RelatedObjects`
     * assigns relations are invalid in IFC4X3 so we skip them.
     */
    readonly relCount: number;
}

// ---------------------------------------------------------------------------
// Variant gate
// ---------------------------------------------------------------------------

/**
 * Throw if the caller hands us a non-Revit-variant options bag. The
 * schema layer already pins `variant` to `'IFC4X3-RV'`, but the runtime
 * gate guarantees the exporter never silently downgrades a misconfigured
 * call into an IFC4X3 vanilla file.
 */
export function assertRevitVariant(opts: RevitExportOptions): void {
    if (opts.variant !== 'IFC4X3-RV') {
        throw new Error(
            `[ifc-export/revit-variant] expected variant 'IFC4X3-RV', got ${JSON.stringify(opts.variant)}`,
        );
    }
}

// ---------------------------------------------------------------------------
// Single-property writer (shared)
// ---------------------------------------------------------------------------

/**
 * Emit one `IfcPropertySingleValue` entity with `(Name, NominalValue)`.
 * Same shape as the wall/door/window pset writers — kept local so the
 * Revit-variant shim has no upward coupling to those modules.
 */
function writeProp(
    api: WebIFC.IfcAPI,
    modelId: number,
    name: string,
    value: ValueRef,
): EntityRef {
    return writeEntity(
        api,
        modelId,
        WebIFC.IFCPROPERTYSINGLEVALUE,
        label(api, modelId, name),
        null,
        value,
        null,
    );
}

// ---------------------------------------------------------------------------
// Pset_RevitType
// ---------------------------------------------------------------------------

/**
 * Emit one `IfcPropertySet` (Name = `"Pset_RevitType"`) carrying the
 * Revit `targetVersion` string, then attach it to the IfcType via
 * `IfcRelDefinesByProperties`.
 *
 * Revit reads this pset to anchor its native Type parameters on
 * round-trip. A single property is sufficient for the α-2 shim — α-3
 * will extend it with the actual Revit Type id once the type-mapping
 * registry is plumbed.
 *
 * Wrapped in a `pryzm.ifc.export-pset-revit-type` span (P8).
 *
 * @param typeRef  the IFC line ref of the host IfcType (opaque integer).
 * @param opts     `{ targetVersion }` — emitted verbatim as `RevitTargetVersion`.
 * @param ctx      shared export context.
 */
export function writePsetRevitType(
    typeRef: number,
    opts: { targetVersion: string },
    ctx: ExportCtx,
): WriteRevitPsetResult {
    return withSpan(
        'pryzm.ifc.export-pset-revit-type',
        (span) => {
            const { api, modelId, ownerRefs, guid } = ctx;

            const properties: EntityRef[] = [
                writeProp(
                    api,
                    modelId,
                    'RevitTargetVersion',
                    label(api, modelId, opts.targetVersion),
                ),
            ];

            // IFCPROPERTYSET(GlobalId, OwnerHistory, Name, Description,
            //                HasProperties)
            const psetRef = writeEntity(
                api,
                modelId,
                WebIFC.IFCPROPERTYSET,
                mintGlobalId(api, modelId, guid),
                ownerRefs.ownerHistory,
                label(api, modelId, 'Pset_RevitType'),
                null,
                properties,
            );

            // IFCRELDEFINESBYPROPERTIES(GlobalId, OwnerHistory, Name,
            //                           Description, RelatedObjects,
            //                           RelatingPropertyDefinition)
            // NB: IfcRelDefinesByProperties is the property-attachment
            // relation; IfcRelDefinesByType is for type-element /
            // occurrence relationships. Even though this pset attaches
            // to an IfcType, the *attachment mechanism* is still the
            // by-properties relation.
            const relRef = writeEntity(
                api,
                modelId,
                WebIFC.IFCRELDEFINESBYPROPERTIES,
                mintGlobalId(api, modelId, guid),
                ownerRefs.ownerHistory,
                null,
                null,
                [typeRef],
                psetRef,
            );

            span.setAttribute('typeRef', typeRef);
            span.setAttribute('targetVersion', opts.targetVersion);
            span.setAttribute('propertyCount', properties.length);

            return { psetRef, relRef };
        },
    );
}

// ---------------------------------------------------------------------------
// Pset_RevitInstance
// ---------------------------------------------------------------------------

/**
 * Emit one `IfcPropertySet` (Name = `"Pset_RevitInstance"`) carrying a
 * Revit instance marker, then attach it to the host IfcElement via
 * `IfcRelDefinesByProperties`.
 *
 * The marker is opaque to the exporter — it round-trips into Revit's
 * native Instance-parameter store as the element's PRYZM-side stable
 * id. When the caller does not supply one we default to `'PRYZM-EXPORT'`
 * so the pset is still well-formed.
 *
 * Wrapped in a `pryzm.ifc.export-pset-revit-instance` span (P8).
 *
 * @param elementRef  the IFC line ref of the host IfcElement.
 * @param opts        `{ instanceMarker? }` — defaults to `'PRYZM-EXPORT'`.
 * @param ctx         shared export context.
 */
export function writePsetRevitInstance(
    elementRef: number,
    opts: { instanceMarker?: string },
    ctx: ExportCtx,
): WriteRevitPsetResult {
    return withSpan(
        'pryzm.ifc.export-pset-revit-instance',
        (span) => {
            const { api, modelId, ownerRefs, guid } = ctx;

            const marker = opts.instanceMarker ?? 'PRYZM-EXPORT';

            const properties: EntityRef[] = [
                writeProp(
                    api,
                    modelId,
                    'RevitInstanceMarker',
                    label(api, modelId, marker),
                ),
            ];

            const psetRef = writeEntity(
                api,
                modelId,
                WebIFC.IFCPROPERTYSET,
                mintGlobalId(api, modelId, guid),
                ownerRefs.ownerHistory,
                label(api, modelId, 'Pset_RevitInstance'),
                null,
                properties,
            );

            const relRef = writeEntity(
                api,
                modelId,
                WebIFC.IFCRELDEFINESBYPROPERTIES,
                mintGlobalId(api, modelId, guid),
                ownerRefs.ownerHistory,
                null,
                null,
                [elementRef],
                psetRef,
            );

            span.setAttribute('elementRef', elementRef);
            span.setAttribute('instanceMarker', marker);
            span.setAttribute('propertyCount', properties.length);

            return { psetRef, relRef };
        },
    );
}

// ---------------------------------------------------------------------------
// IfcGroup — Revit Worksets
// ---------------------------------------------------------------------------

/**
 * The `IfcGroup.ObjectType` string for a Revit Workset. Revit's IFC
 * importer keys off this literal when it round-trips groups back into
 * native Worksets.
 */
export const REVIT_WORKSET_OBJECT_TYPE = 'Revit Workset';

/**
 * Emit one `IfcGroup` per Revit Workset, plus (when at least one member
 * resolves) one `IfcRelAssignsToGroup` linking the group to its members.
 *
 *   • `Name`         = `workset.name`.
 *   • `ObjectType`   = `'Revit Workset'`.
 *   • `Description`  = `'Open'` when `workset.isOpen`, else `'Closed'`.
 *
 * `memberElementsByWorksetId` maps the PRYZM-side Workset id → the IFC
 * line refs of its member elements. Worksets whose entry is missing or
 * empty still emit the IfcGroup (the group exists as metadata) but skip
 * the `IfcRelAssignsToGroup` — a zero-`RelatedObjects` relation is
 * invalid in IFC4X3.
 *
 * Wrapped in a `pryzm.ifc.export-revit-workset` span PER WORKSET (P8).
 */
export function writeRevitWorksetGroups(
    worksets: ReadonlyArray<RevitWorkset>,
    memberElementsByWorksetId: ReadonlyMap<string, ReadonlyArray<number>>,
    ctx: ExportCtx,
): WriteRevitWorksetGroupsResult {
    if (worksets.length === 0) {
        return { groupCount: 0, relCount: 0 };
    }

    let groupCount = 0;
    let relCount = 0;

    for (const ws of worksets) {
        withSpan(
            'pryzm.ifc.export-revit-workset',
            (span) => {
                const { api, modelId, ownerRefs, guid } = ctx;

                const description = ws.isOpen ? 'Open' : 'Closed';

                // IFCGROUP(GlobalId, OwnerHistory, Name, Description,
                //          ObjectType)
                const groupRef = writeEntity(
                    api,
                    modelId,
                    WebIFC.IFCGROUP,
                    mintGlobalId(api, modelId, guid),
                    ownerRefs.ownerHistory,
                    label(api, modelId, ws.name),
                    text(api, modelId, description),
                    label(api, modelId, REVIT_WORKSET_OBJECT_TYPE),
                );
                groupCount += 1;

                const members = memberElementsByWorksetId.get(ws.id) ?? [];

                let memberCount = 0;
                if (members.length > 0) {
                    // IFCRELASSIGNSTOGROUP(GlobalId, OwnerHistory, Name,
                    //                      Description, RelatedObjects,
                    //                      RelatedObjectsType, RelatingGroup)
                    writeEntity(
                        api,
                        modelId,
                        WebIFC.IFCRELASSIGNSTOGROUP,
                        mintGlobalId(api, modelId, guid),
                        ownerRefs.ownerHistory,
                        null,
                        null,
                        members.slice(),
                        null,
                        groupRef,
                    );
                    relCount += 1;
                    memberCount = members.length;
                }

                span.setAttribute('worksetId', ws.id);
                span.setAttribute('worksetName', ws.name);
                span.setAttribute('isOpen', ws.isOpen);
                span.setAttribute('memberCount', memberCount);
            },
        );
    }

    return { groupCount, relCount };
}

// ---------------------------------------------------------------------------
// Coordinate-mode hook (Pset_SiteRevitVariant stub)
// ---------------------------------------------------------------------------

/**
 * Attach a `Pset_SiteRevitVariant` stub to the project's IfcSite that
 * records the requested coordinate-mode label. Real coordinate-mode
 * transforms (project-base-point vs survey-point vs internal-origin
 * placement aliasing) are α-3 — α-2 only persists the user intent so
 * downstream tools can read it back.
 *
 * Wrapped in a `pryzm.ifc.export-revit-coord-mode` span (P8).
 *
 * @param siteRef  the IFC line ref of the project's `IfcSite`.
 * @param mode     one of `'project-base-point' | 'survey-point' | 'internal-origin'`.
 * @param ctx      shared export context.
 */
export function applyCoordinateMode(
    siteRef: number,
    mode: RevitCoordinateModeValue,
    ctx: ExportCtx,
): void {
    withSpan(
        'pryzm.ifc.export-revit-coord-mode',
        (span) => {
            const { api, modelId, ownerRefs, guid } = ctx;

            const properties: EntityRef[] = [
                writeProp(
                    api,
                    modelId,
                    'RevitCoordinateMode',
                    label(api, modelId, mode),
                ),
            ];

            const psetRef = writeEntity(
                api,
                modelId,
                WebIFC.IFCPROPERTYSET,
                mintGlobalId(api, modelId, guid),
                ownerRefs.ownerHistory,
                label(api, modelId, 'Pset_SiteRevitVariant'),
                null,
                properties,
            );

            writeEntity(
                api,
                modelId,
                WebIFC.IFCRELDEFINESBYPROPERTIES,
                mintGlobalId(api, modelId, guid),
                ownerRefs.ownerHistory,
                null,
                null,
                [siteRef],
                psetRef,
            );

            span.setAttribute('siteRef', siteRef);
            span.setAttribute('coordinateMode', mode);
        },
    );
}
