/**
 * `Pset_DoorCommon` writer — IFC-α-6 (2026-06-01).
 *
 * Every exported `IfcDoor` carries an official IFC4X3 `Pset_DoorCommon`
 * property set. Downstream BIM tools (Revit, ArchiCAD, Solibri, BIMcollab,
 * BIM 360) use this Pset to schedule doors by FireRating (fire-compartment
 * scheduling), HandicapAccessible (accessibility audits), FireExit (egress
 * analysis), AcousticRating, U-value (ThermalTransmittance), SecurityRating
 * and IsExternal — without it, doors appear as "uncategorised" geometry
 * with no thermal / acoustic / fire / accessibility classification.
 *
 * Per [C25-IFC-EXPORT-PRODUCTION §3](../../../docs/02-decisions/contracts/C25-IFC-EXPORT-PRODUCTION.md)
 * + master plan IFC-α-6.
 *
 * Architectural notes:
 *
 *   • The 13 `Pset_DoorCommon` properties are all OPTIONAL per IFC4X3 —
 *     only properties whose values are defined on the input are written.
 *   • `Status` is the one exception: defaulted to `'NEW'` if the caller
 *     does not supply one (matches the IFC4X3 `PEnum_ElementStatus`
 *     default).
 *   • `Status` is restricted to the four official enum values — anything
 *     else is rejected at the picker boundary so we never emit a
 *     non-schema label.
 *   • Each property is an `IfcPropertySingleValue` with the correct
 *     measure type:
 *       - `IfcIdentifier` for `Reference`.
 *       - `IfcLabel` for `Status`, `AcousticRating`, `FireRating`,
 *         `SecurityRating`.
 *       - `IfcBoolean` for `IsExternal`, `HandicapAccessible`,
 *         `FireExit`, `HasDrive`, `SelfClosing`, `SmokeStop`.
 *       - `IfcVolumetricFlowRateMeasure` for `Infiltration`
 *         (m³/(s·m²) — air infiltration through closed door).
 *       - `IfcThermalTransmittanceMeasure` for `ThermalTransmittance`
 *         (W/m²K U-value).
 *       - `IfcPositiveRatioMeasure` for `GlazingAreaFraction`
 *         (clamped to [0, 1]).
 *   • The pset attaches to the door via `IfcRelDefinesByProperties`
 *     (NOT `IfcRelDefinesByType` — that relation is for type-element /
 *     occurrence relationships, not properties).
 *
 * Wrapped in a `pryzm.ifc.export-pset-door-common` span (P8).
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
 * The four `Pset_DoorCommon.Status` enum values per IFC4X3
 * `PEnum_ElementStatus`. Anything else is rejected by `pickDoorCommonProps`.
 */
export const DOOR_STATUS_VALUES = [
    'NEW',
    'EXISTING',
    'DEMOLISH',
    'TEMPORARY',
] as const;
export type DoorStatus = (typeof DOOR_STATUS_VALUES)[number];

/**
 * A PRYZM door projected into the minimal shape needed to emit a
 * `Pset_DoorCommon`. The orchestrator does the projection — see the call
 * site in `IFC4X3Exporter.ts`.
 *
 * Every property except `id` is OPTIONAL. Properties with `undefined`
 * values are dropped from the emitted pset; `Status` defaults to `'NEW'`.
 */
export interface DoorToExport {
    /** PRYZM element id (`door_<ulid>`) — span attribute + diagnostics. */
    readonly id: string;
    /** Door reference tag (mark). → `IfcIdentifier` */
    readonly reference?: string;
    /** Element status; defaults to `'NEW'`. → `IfcLabel` */
    readonly status?: DoorStatus;
    /** Acoustic rating, e.g. `"Rw 32 dB"`. → `IfcLabel` */
    readonly acousticRating?: string;
    /** Fire rating, e.g. `"30 minutes"` or `"EI30"`. → `IfcLabel` */
    readonly fireRating?: string;
    /** Security rating, e.g. `"RC2"`. → `IfcLabel` */
    readonly securityRating?: string;
    /** Whether the door is an external (exterior) door. → `IfcBoolean` */
    readonly isExternal?: boolean;
    /**
     * Air infiltration through the closed door, in m³/(s·m²).
     * → `IfcVolumetricFlowRateMeasure`
     */
    readonly infiltration?: number;
    /** U-value in W/m²K. → `IfcThermalTransmittanceMeasure` */
    readonly thermalTransmittance?: number;
    /**
     * Fraction of the door leaf that is glazed, in [0, 1]. Values outside
     * the range are clamped. → `IfcPositiveRatioMeasure`
     */
    readonly glazingAreaFraction?: number;
    /** Whether the door is wheelchair-accessible. → `IfcBoolean` */
    readonly handicapAccessible?: boolean;
    /** Whether the door is a designated fire-escape route. → `IfcBoolean` */
    readonly fireExit?: boolean;
    /** Whether the door is automatic / motorised. → `IfcBoolean` */
    readonly hasDrive?: boolean;
    /** Whether the door has a self-closer. → `IfcBoolean` */
    readonly selfClosing?: boolean;
    /** Whether the door is smoke-tight when closed. → `IfcBoolean` */
    readonly smokeStop?: boolean;
}

/**
 * The defensive-picker output — same shape as `DoorToExport` minus `id`,
 * with `status` guaranteed present. Used internally by the writer.
 */
export interface IfcDoorCommonProps {
    readonly reference?: string;
    readonly status: DoorStatus;
    readonly acousticRating?: string;
    readonly fireRating?: string;
    readonly securityRating?: string;
    readonly isExternal?: boolean;
    readonly infiltration?: number;
    readonly thermalTransmittance?: number;
    readonly glazingAreaFraction?: number;
    readonly handicapAccessible?: boolean;
    readonly fireExit?: boolean;
    readonly hasDrive?: boolean;
    readonly selfClosing?: boolean;
    readonly smokeStop?: boolean;
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

export interface WritePsetDoorCommonResult {
    /** The `IfcPropertySet` entity (Name = 'Pset_DoorCommon'). */
    readonly psetRef: EntityRef;
    /** The `IfcRelDefinesByProperties` entity linking the pset to the door. */
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
 * Project a `DoorToExport` into the canonical `IfcDoorCommonProps` shape:
 *
 *   • `status` is required and defaults to `'NEW'` if absent.
 *   • Every OTHER property is preserved as-is — `undefined` values are
 *     dropped silently so the emitted pset only carries defined data.
 *   • Non-finite numeric values (`NaN`, `±Infinity`) are dropped for
 *     `infiltration`, `thermalTransmittance`, and `glazingAreaFraction`.
 *   • `glazingAreaFraction` is clamped to [0, 1].
 *
 * Pure helper — exported so the writer logic is testable in isolation.
 *
 * @throws `Error` when `status` is an unknown non-default value.
 */
export function pickDoorCommonProps(d: DoorToExport): IfcDoorCommonProps {
    let status: DoorStatus = 'NEW';
    if (d.status !== undefined) {
        if (!DOOR_STATUS_VALUES.includes(d.status)) {
            throw new Error(
                `[ifc-export/pset-door-common] door ${d.id}: status must be one of ` +
                    `${DOOR_STATUS_VALUES.join(' | ')} (got ${JSON.stringify(d.status)})`,
            );
        }
        status = d.status;
    }

    const out: {
        -readonly [K in keyof IfcDoorCommonProps]: IfcDoorCommonProps[K];
    } = { status };

    if (d.reference !== undefined) out.reference = d.reference;
    if (d.acousticRating !== undefined) out.acousticRating = d.acousticRating;
    if (d.fireRating !== undefined) out.fireRating = d.fireRating;
    if (d.securityRating !== undefined) out.securityRating = d.securityRating;
    if (d.isExternal !== undefined) out.isExternal = d.isExternal;

    if (d.infiltration !== undefined && Number.isFinite(d.infiltration)) {
        out.infiltration = d.infiltration;
    }
    if (
        d.thermalTransmittance !== undefined &&
        Number.isFinite(d.thermalTransmittance)
    ) {
        out.thermalTransmittance = d.thermalTransmittance;
    }
    if (
        d.glazingAreaFraction !== undefined &&
        Number.isFinite(d.glazingAreaFraction)
    ) {
        // Clamp into the IfcPositiveRatioMeasure [0, 1] range.
        let g = d.glazingAreaFraction;
        if (g < 0) g = 0;
        if (g > 1) g = 1;
        out.glazingAreaFraction = g;
    }

    if (d.handicapAccessible !== undefined)
        out.handicapAccessible = d.handicapAccessible;
    if (d.fireExit !== undefined) out.fireExit = d.fireExit;
    if (d.hasDrive !== undefined) out.hasDrive = d.hasDrive;
    if (d.selfClosing !== undefined) out.selfClosing = d.selfClosing;
    if (d.smokeStop !== undefined) out.smokeStop = d.smokeStop;

    return out as IfcDoorCommonProps;
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
 * Emit an `IfcThermalTransmittanceMeasure` value object (W/m²K).
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

/**
 * Emit an `IfcVolumetricFlowRateMeasure` value object (m³/(s·m²) for
 * door infiltration).
 */
function volumetricFlowRate(
    api: IfcAPI,
    modelId: number,
    value: number,
): ValueRef {
    return api.CreateIfcType(
        modelId,
        WebIFC.IFCVOLUMETRICFLOWRATEMEASURE,
        value,
    );
}

/**
 * Emit an `IfcPositiveRatioMeasure` value object. Caller must have
 * already clamped to [0, 1].
 */
function positiveRatio(
    api: IfcAPI,
    modelId: number,
    value: number,
): ValueRef {
    return api.CreateIfcType(
        modelId,
        WebIFC.IFCPOSITIVERATIOMEASURE,
        value,
    );
}

// ---------------------------------------------------------------------------
// Main entry — write Pset_DoorCommon + IfcRelDefinesByProperties
// ---------------------------------------------------------------------------

/**
 * Emit one `IfcPropertySet` (Name = `"Pset_DoorCommon"`) containing every
 * property the door carries, then attach it to the door via
 * `IfcRelDefinesByProperties`.
 *
 * `Status` is always present (defaults to `'NEW'`). Every other property
 * is included iff `pickDoorCommonProps` retained it from the input.
 *
 * Returns the `IfcPropertySet` and `IfcRelDefinesByProperties` entity refs
 * plus the count of properties written — the orchestrator uses the count
 * to roll up `counts.properties` for the final export result.
 *
 * Wrapped in a `pryzm.ifc.export-pset-door-common` span (P8) with
 * `{ doorId, propertyCount }` attributes.
 */
export function writePsetDoorCommon(
    doorRef: EntityRef,
    door: DoorToExport,
    ctx: ExportCtx,
): WritePsetDoorCommonResult {
    return withSpan(
        'pryzm.ifc.export-pset-door-common',
        (span) => {
            const { api, modelId, ownerRefs, guid } = ctx;
            const picked = pickDoorCommonProps(door);

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
            if (picked.securityRating !== undefined) {
                properties.push(
                    writeProp(
                        api,
                        modelId,
                        'SecurityRating',
                        label(api, modelId, picked.securityRating),
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
            if (picked.infiltration !== undefined) {
                properties.push(
                    writeProp(
                        api,
                        modelId,
                        'Infiltration',
                        volumetricFlowRate(api, modelId, picked.infiltration),
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
            if (picked.glazingAreaFraction !== undefined) {
                properties.push(
                    writeProp(
                        api,
                        modelId,
                        'GlazingAreaFraction',
                        positiveRatio(api, modelId, picked.glazingAreaFraction),
                    ),
                );
            }
            if (picked.handicapAccessible !== undefined) {
                properties.push(
                    writeProp(
                        api,
                        modelId,
                        'HandicapAccessible',
                        boolean(api, modelId, picked.handicapAccessible),
                    ),
                );
            }
            if (picked.fireExit !== undefined) {
                properties.push(
                    writeProp(
                        api,
                        modelId,
                        'FireExit',
                        boolean(api, modelId, picked.fireExit),
                    ),
                );
            }
            if (picked.hasDrive !== undefined) {
                properties.push(
                    writeProp(
                        api,
                        modelId,
                        'HasDrive',
                        boolean(api, modelId, picked.hasDrive),
                    ),
                );
            }
            if (picked.selfClosing !== undefined) {
                properties.push(
                    writeProp(
                        api,
                        modelId,
                        'SelfClosing',
                        boolean(api, modelId, picked.selfClosing),
                    ),
                );
            }
            if (picked.smokeStop !== undefined) {
                properties.push(
                    writeProp(
                        api,
                        modelId,
                        'SmokeStop',
                        boolean(api, modelId, picked.smokeStop),
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
                label(api, modelId, 'Pset_DoorCommon'),
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
                [doorRef],
                psetRef,
            );

            // Inside the span (mirrors α-4 wall + α-3 zone patterns).
            span.setAttribute('doorId', door.id);
            span.setAttribute('propertyCount', properties.length);

            return { psetRef, relRef, propertyCount: properties.length };
        },
    );
}
