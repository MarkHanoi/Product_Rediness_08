/**
 * `Pset_WallCommon` writer — IFC-α-4 (2026-06-01).
 *
 * Every exported `IfcWall` carries an official IFC4X3 `Pset_WallCommon`
 * property set. Downstream BIM tools (Revit, ArchiCAD, Solibri, BIMcollab)
 * use this Pset to schedule walls by FireRating, U-value (ThermalTransmittance),
 * LoadBearing, and IsExternal — without it, walls appear in BIM tools as
 * "uncategorised" geometry.
 *
 * Per [C25-IFC-EXPORT-PRODUCTION §3](../../../docs/02-decisions/contracts/C25-IFC-EXPORT-PRODUCTION.md)
 * + master plan IFC-α-4.
 *
 * Architectural notes:
 *
 *   • The 11 `Pset_WallCommon` properties are all OPTIONAL per IFC4X3 — only
 *     properties whose values are defined on the input are written.
 *   • `Status` is the one exception: defaulted to `'NEW'` if the caller does
 *     not supply one (matches the IFC4X3 `PEnum_ElementStatus` default).
 *   • `Status` is restricted to the four official enum values — anything
 *     else is rejected at the picker boundary so we never emit a non-schema
 *     label.
 *   • Each property is an `IfcPropertySingleValue` with the correct measure
 *     type: `IfcIdentifier` for Reference, `IfcLabel` for the enum/string
 *     fields, `IfcBoolean` for boolean fields, and
 *     `IfcThermalTransmittanceMeasure` for the U-value.
 *   • The pset attaches to the wall via `IfcRelDefinesByProperties` (NOT
 *     `IfcRelDefinesByType` — that relation is for type-element / occurrence
 *     relationships, not properties).
 *
 * Wrapped in a `pryzm.ifc.export-pset-wall-common` span (P8).
 */

import * as WebIFC from 'web-ifc';
import type { IfcAPI } from 'web-ifc';

import {
    boolean,
    identifier,
    label,
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
 * The four `Pset_WallCommon.Status` enum values per IFC4X3
 * `PEnum_ElementStatus`. Anything else is rejected by `pickWallCommonProps`.
 */
export const WALL_STATUS_VALUES = ['NEW', 'EXISTING', 'DEMOLISH', 'TEMPORARY'] as const;
export type WallStatus = (typeof WALL_STATUS_VALUES)[number];

/**
 * A PRYZM wall projected into the minimal shape needed to emit a
 * `Pset_WallCommon`. The orchestrator does the projection — see the
 * call site in `IFC4X3Exporter.ts`.
 *
 * Every property except `id` is OPTIONAL. Properties with `undefined`
 * values are dropped from the emitted pset; `Status` defaults to `'NEW'`.
 */
export interface WallToExport {
    /** PRYZM element id (`wall_<ulid>`) — span attribute + diagnostics. */
    readonly id: string;
    /** Wall reference tag (mark). → `IfcIdentifier` */
    readonly reference?: string;
    /** Element status; defaults to `'NEW'`. → `IfcLabel` */
    readonly status?: WallStatus;
    /** Acoustic rating, e.g. `"RW 45 dB"`. → `IfcLabel` */
    readonly acousticRating?: string;
    /** Fire rating, e.g. `"60 minutes"` or `"EI 60"`. → `IfcLabel` */
    readonly fireRating?: string;
    /** Whether the wall material is combustible. → `IfcBoolean` */
    readonly combustible?: boolean;
    /** Surface spread of flame class, e.g. `"Class 0"`. → `IfcLabel` */
    readonly surfaceSpreadOfFlame?: string;
    /** U-value in W/m²K. → `IfcThermalTransmittanceMeasure` */
    readonly thermalTransmittance?: number;
    /** Whether the wall is an external (exterior) wall. → `IfcBoolean` */
    readonly isExternal?: boolean;
    /** Whether the wall runs floor-to-floor (deck-to-deck). → `IfcBoolean` */
    readonly extendToStructure?: boolean;
    /** Whether the wall is structural / load-bearing. → `IfcBoolean` */
    readonly loadBearing?: boolean;
    /** Whether the wall acts as a fire compartment. → `IfcBoolean` */
    readonly compartmentation?: boolean;
}

/**
 * The defensive-picker output — same shape as `WallToExport` minus `id`,
 * with `status` guaranteed present. Used internally by the writer.
 */
export interface IfcWallCommonProps {
    readonly reference?: string;
    readonly status: WallStatus;
    readonly acousticRating?: string;
    readonly fireRating?: string;
    readonly combustible?: boolean;
    readonly surfaceSpreadOfFlame?: string;
    readonly thermalTransmittance?: number;
    readonly isExternal?: boolean;
    readonly extendToStructure?: boolean;
    readonly loadBearing?: boolean;
    readonly compartmentation?: boolean;
}

/**
 * Per-export context shared by every Pset writer. Mirrors the α-3 zone
 * exporter's `ExportCtx` shape so callers can reuse the same record.
 */
export interface ExportCtx {
    readonly api: IfcAPI;
    readonly modelId: number;
    readonly ownerRefs: OwnerHistoryRefs;
    readonly guid: GuidProvider;
}

export interface WritePsetWallCommonResult {
    /** The `IfcPropertySet` entity (Name = 'Pset_WallCommon'). */
    readonly psetRef: EntityRef;
    /** The `IfcRelDefinesByProperties` entity linking the pset to the wall. */
    readonly relRef: EntityRef;
    /**
     * Number of properties written to the pset (always ≥ 1 — Status is
     * always present). Useful for the orchestrator's property-count tally.
     */
    readonly propertyCount: number;
}

// ---------------------------------------------------------------------------
// Defensive picker
// ---------------------------------------------------------------------------

/**
 * Project a `WallToExport` into the canonical `IfcWallCommonProps` shape:
 *
 *   • `status` is required and defaults to `'NEW'` if absent or invalid.
 *   • Every OTHER property is preserved as-is — `undefined` values are
 *     dropped silently so the emitted pset only carries defined data.
 *   • `thermalTransmittance` non-finite values (NaN, Infinity) are dropped.
 *
 * Pure helper — exported so the writer logic is testable in isolation.
 *
 * @throws `Error` when `status` is an unknown non-default value.
 */
export function pickWallCommonProps(w: WallToExport): IfcWallCommonProps {
    let status: WallStatus = 'NEW';
    if (w.status !== undefined) {
        if (!WALL_STATUS_VALUES.includes(w.status)) {
            throw new Error(
                `[ifc-export/pset-wall-common] wall ${w.id}: status must be one of ` +
                    `${WALL_STATUS_VALUES.join(' | ')} (got ${JSON.stringify(w.status)})`,
            );
        }
        status = w.status;
    }

    const out: {
        -readonly [K in keyof IfcWallCommonProps]: IfcWallCommonProps[K];
    } = { status };

    if (w.reference !== undefined) out.reference = w.reference;
    if (w.acousticRating !== undefined) out.acousticRating = w.acousticRating;
    if (w.fireRating !== undefined) out.fireRating = w.fireRating;
    if (w.combustible !== undefined) out.combustible = w.combustible;
    if (w.surfaceSpreadOfFlame !== undefined)
        out.surfaceSpreadOfFlame = w.surfaceSpreadOfFlame;
    if (
        w.thermalTransmittance !== undefined &&
        Number.isFinite(w.thermalTransmittance)
    ) {
        out.thermalTransmittance = w.thermalTransmittance;
    }
    if (w.isExternal !== undefined) out.isExternal = w.isExternal;
    if (w.extendToStructure !== undefined)
        out.extendToStructure = w.extendToStructure;
    if (w.loadBearing !== undefined) out.loadBearing = w.loadBearing;
    if (w.compartmentation !== undefined)
        out.compartmentation = w.compartmentation;

    return out as IfcWallCommonProps;
}

// ---------------------------------------------------------------------------
// Single-property writer
// ---------------------------------------------------------------------------

/**
 * Emit one `IfcPropertySingleValue` entity with `(Name, NominalValue)`.
 * Description (#1) and Unit (#3) are left null — the latter falls through
 * to the project unit assignment.
 */
function writeProp(
    api: IfcAPI,
    modelId: number,
    name: string,
    value: ValueRef,
): EntityRef {
    return writeEntity(
        api,
        modelId,
        WebIFC.IFCPROPERTYSINGLEVALUE,
        identifier(api, modelId, name),
        null,
        value,
        null,
    );
}

/**
 * Emit an `IfcThermalTransmittanceMeasure` value object.
 *
 * `IfcThermalTransmittanceMeasure` is a derived REAL measure in IFC4X3 —
 * the raw value is a number and the type tag carries the dimensional
 * unit (W/m²K). web-ifc's `CreateIfcType` accepts the same `(modelId,
 * typeCode, value)` shape we use for other measures.
 */
function thermalTransmittance(
    api: IfcAPI,
    modelId: number,
    value: number,
): ValueRef {
    return api.CreateIfcType(
        modelId,
        WebIFC.IFCTHERMALTRANSMITTANCEMEASURE,
        value,
    );
}

// ---------------------------------------------------------------------------
// Main entry — write Pset_WallCommon + IfcRelDefinesByProperties
// ---------------------------------------------------------------------------

/**
 * Emit one `IfcPropertySet` (Name = `"Pset_WallCommon"`) containing every
 * property the wall carries, then attach it to the wall via
 * `IfcRelDefinesByProperties`.
 *
 * `Status` is always present (defaults to `'NEW'`). Every other property
 * is included iff `pickWallCommonProps` retained it from the input.
 *
 * Returns the `IfcPropertySet` and `IfcRelDefinesByProperties` entity refs
 * plus the count of properties written — the orchestrator uses the count
 * to roll up `counts.properties` for the final export result.
 *
 * Wrapped in a `pryzm.ifc.export-pset-wall-common` span (P8) with
 * `{ wallId, propertyCount }` attributes.
 */
export function writePsetWallCommon(
    wallRef: EntityRef,
    wall: WallToExport,
    ctx: ExportCtx,
): WritePsetWallCommonResult {
    return withSpan(
        'pryzm.ifc.export-pset-wall-common',
        (span) => {
            const { api, modelId, ownerRefs, guid } = ctx;
            const picked = pickWallCommonProps(wall);

            const properties: EntityRef[] = [];

            if (picked.reference !== undefined) {
                properties.push(
                    writeProp(
                        api,
                        modelId,
                        'Reference',
                        identifier(api, modelId, picked.reference),
                    ),
                );
            }

            // Status — always present (default 'NEW').
            properties.push(
                writeProp(api, modelId, 'Status', label(api, modelId, picked.status)),
            );

            if (picked.acousticRating !== undefined) {
                properties.push(
                    writeProp(
                        api,
                        modelId,
                        'AcousticRating',
                        label(api, modelId, picked.acousticRating),
                    ),
                );
            }
            if (picked.fireRating !== undefined) {
                properties.push(
                    writeProp(
                        api,
                        modelId,
                        'FireRating',
                        label(api, modelId, picked.fireRating),
                    ),
                );
            }
            if (picked.combustible !== undefined) {
                properties.push(
                    writeProp(
                        api,
                        modelId,
                        'Combustible',
                        boolean(api, modelId, picked.combustible),
                    ),
                );
            }
            if (picked.surfaceSpreadOfFlame !== undefined) {
                properties.push(
                    writeProp(
                        api,
                        modelId,
                        'SurfaceSpreadOfFlame',
                        label(api, modelId, picked.surfaceSpreadOfFlame),
                    ),
                );
            }
            if (picked.thermalTransmittance !== undefined) {
                properties.push(
                    writeProp(
                        api,
                        modelId,
                        'ThermalTransmittance',
                        thermalTransmittance(
                            api,
                            modelId,
                            picked.thermalTransmittance,
                        ),
                    ),
                );
            }
            if (picked.isExternal !== undefined) {
                properties.push(
                    writeProp(
                        api,
                        modelId,
                        'IsExternal',
                        boolean(api, modelId, picked.isExternal),
                    ),
                );
            }
            if (picked.extendToStructure !== undefined) {
                properties.push(
                    writeProp(
                        api,
                        modelId,
                        'ExtendToStructure',
                        boolean(api, modelId, picked.extendToStructure),
                    ),
                );
            }
            if (picked.loadBearing !== undefined) {
                properties.push(
                    writeProp(
                        api,
                        modelId,
                        'LoadBearing',
                        boolean(api, modelId, picked.loadBearing),
                    ),
                );
            }
            if (picked.compartmentation !== undefined) {
                properties.push(
                    writeProp(
                        api,
                        modelId,
                        'Compartmentation',
                        boolean(api, modelId, picked.compartmentation),
                    ),
                );
            }

            // IFCPROPERTYSET(GlobalId, OwnerHistory, Name, Description, HasProperties)
            const psetRef = writeEntity(
                api,
                modelId,
                WebIFC.IFCPROPERTYSET,
                mintGlobalId(api, modelId, guid),
                ownerRefs.ownerHistory,
                label(api, modelId, 'Pset_WallCommon'),
                null,
                properties,
            );

            // IFCRELDEFINESBYPROPERTIES(GlobalId, OwnerHistory, Name, Description,
            //                           RelatedObjects, RelatingPropertyDefinition)
            // NB: IfcRelDefinesByProperties is the property-attachment relation;
            // IfcRelDefinesByType is for type-element / occurrence relationships.
            const relRef = writeEntity(
                api,
                modelId,
                WebIFC.IFCRELDEFINESBYPROPERTIES,
                mintGlobalId(api, modelId, guid),
                ownerRefs.ownerHistory,
                null,
                null,
                [wallRef],
                psetRef,
            );

            // Inside the span (mirrors α-3 zone pattern).
            span.setAttribute('wallId', wall.id);
            span.setAttribute('propertyCount', properties.length);

            return { psetRef, relRef, propertyCount: properties.length };
        },
    );
}
