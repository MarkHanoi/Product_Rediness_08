/**
 * `Pset_WindowCommon` writer — IFC-α-7 (2026-06-01).
 *
 * Every exported `IfcWindow` carries an official IFC4X3 `Pset_WindowCommon`
 * property set. Downstream BIM tools (Revit, ArchiCAD, Solibri, BIMcollab,
 * BIM 360) use this Pset to schedule windows by FireRating
 * (fire-compartment scheduling), AcousticRating, U-value
 * (ThermalTransmittance), SecurityRating, IsExternal, GlazingAreaFraction
 * (daylighting / solar gain analysis), HasSillExternal /
 * HasSillInternal (façade detailing) and HasDrive — without it, windows
 * appear as "uncategorised" geometry with no thermal / acoustic / fire /
 * security classification.
 *
 * Per [C25-IFC-EXPORT-PRODUCTION §3](../../../docs/02-decisions/contracts/C25-IFC-EXPORT-PRODUCTION.md)
 * + master plan IFC-α-7.
 *
 * Architectural notes:
 *
 *   • The 13 `Pset_WindowCommon` properties are all OPTIONAL per IFC4X3 —
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
 *       - `IfcBoolean` for `IsExternal`, `HasSillExternal`,
 *         `HasSillInternal`, `HasDrive`, `SmokeStop`.
 *       - `IfcVolumetricFlowRateMeasure` for `Infiltration`
 *         (m³/(s·m²) — air infiltration through closed window).
 *       - `IfcThermalTransmittanceMeasure` for `ThermalTransmittance`
 *         (W/m²K U-value).
 *       - `IfcPositiveRatioMeasure` for `GlazingAreaFraction`
 *         (clamped to [0, 1]).
 *   • The pset attaches to the window via `IfcRelDefinesByProperties`
 *     (NOT `IfcRelDefinesByType` — that relation is for type-element /
 *     occurrence relationships, not properties).
 *
 * Wrapped in a `pryzm.ifc.export-pset-window-common` span (P8).
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
 * The four `Pset_WindowCommon.Status` enum values per IFC4X3
 * `PEnum_ElementStatus`. Anything else is rejected by
 * `pickWindowCommonProps`.
 */
export const WINDOW_STATUS_VALUES = [
    'NEW',
    'EXISTING',
    'DEMOLISH',
    'TEMPORARY',
] as const;
export type WindowStatus = (typeof WINDOW_STATUS_VALUES)[number];

/**
 * A PRYZM window projected into the minimal shape needed to emit a
 * `Pset_WindowCommon`. The orchestrator does the projection — see the call
 * site in `IFC4X3Exporter.ts`.
 *
 * Every property except `id` is OPTIONAL. Properties with `undefined`
 * values are dropped from the emitted pset; `Status` defaults to `'NEW'`.
 */
export interface WindowToExport {
    /** PRYZM element id (`window_<ulid>`) — span attribute + diagnostics. */
    readonly id: string;
    /** Window reference tag (mark). → `IfcIdentifier` */
    readonly reference?: string;
    /** Element status; defaults to `'NEW'`. → `IfcLabel` */
    readonly status?: WindowStatus;
    /** Acoustic rating, e.g. `"Rw 35 dB"`. → `IfcLabel` */
    readonly acousticRating?: string;
    /** Fire rating, e.g. `"EI 30"` or `"FR-30"`. → `IfcLabel` */
    readonly fireRating?: string;
    /** Security rating, e.g. `"RC2"`. → `IfcLabel` */
    readonly securityRating?: string;
    /**
     * Whether the window is an exterior window. Almost always `true` for
     * the apartment / building shell. → `IfcBoolean`
     */
    readonly isExternal?: boolean;
    /**
     * Air infiltration through the closed window, in m³/(s·m²).
     * → `IfcVolumetricFlowRateMeasure`
     */
    readonly infiltration?: number;
    /** U-value in W/m²K. → `IfcThermalTransmittanceMeasure` */
    readonly thermalTransmittance?: number;
    /**
     * Fraction of the total window area that is glazed, in [0, 1]. Values
     * outside the range are clamped. → `IfcPositiveRatioMeasure`
     */
    readonly glazingAreaFraction?: number;
    /** Whether an exterior sill is present. → `IfcBoolean` */
    readonly hasSillExternal?: boolean;
    /** Whether an interior sill is present. → `IfcBoolean` */
    readonly hasSillInternal?: boolean;
    /** Whether the window is motorised (powered opening). → `IfcBoolean` */
    readonly hasDrive?: boolean;
    /** Whether the window is smoke-tight when closed. → `IfcBoolean` */
    readonly smokeStop?: boolean;
}

/**
 * The defensive-picker output — same shape as `WindowToExport` minus `id`,
 * with `status` guaranteed present. Used internally by the writer.
 */
export interface IfcWindowCommonProps {
    readonly reference?: string;
    readonly status: WindowStatus;
    readonly acousticRating?: string;
    readonly fireRating?: string;
    readonly securityRating?: string;
    readonly isExternal?: boolean;
    readonly infiltration?: number;
    readonly thermalTransmittance?: number;
    readonly glazingAreaFraction?: number;
    readonly hasSillExternal?: boolean;
    readonly hasSillInternal?: boolean;
    readonly hasDrive?: boolean;
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

export interface WritePsetWindowCommonResult {
    /** The `IfcPropertySet` entity (Name = 'Pset_WindowCommon'). */
    readonly psetRef: EntityRef;
    /** The `IfcRelDefinesByProperties` entity linking the pset to the window. */
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
 * Project a `WindowToExport` into the canonical `IfcWindowCommonProps`
 * shape:
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
export function pickWindowCommonProps(
    w: WindowToExport,
): IfcWindowCommonProps {
    let status: WindowStatus = 'NEW';
    if (w.status !== undefined) {
        if (!WINDOW_STATUS_VALUES.includes(w.status)) {
            throw new Error(
                `[ifc-export/pset-window-common] window ${w.id}: status must be one of ` +
                    `${WINDOW_STATUS_VALUES.join(' | ')} (got ${JSON.stringify(w.status)})`,
            );
        }
        status = w.status;
    }

    const out: {
        -readonly [K in keyof IfcWindowCommonProps]: IfcWindowCommonProps[K];
    } = { status };

    if (w.reference !== undefined) out.reference = w.reference;
    if (w.acousticRating !== undefined) out.acousticRating = w.acousticRating;
    if (w.fireRating !== undefined) out.fireRating = w.fireRating;
    if (w.securityRating !== undefined) out.securityRating = w.securityRating;
    if (w.isExternal !== undefined) out.isExternal = w.isExternal;

    if (w.infiltration !== undefined && Number.isFinite(w.infiltration)) {
        out.infiltration = w.infiltration;
    }
    if (
        w.thermalTransmittance !== undefined &&
        Number.isFinite(w.thermalTransmittance)
    ) {
        out.thermalTransmittance = w.thermalTransmittance;
    }
    if (
        w.glazingAreaFraction !== undefined &&
        Number.isFinite(w.glazingAreaFraction)
    ) {
        // Clamp into the IfcPositiveRatioMeasure [0, 1] range.
        let g = w.glazingAreaFraction;
        if (g < 0) g = 0;
        if (g > 1) g = 1;
        out.glazingAreaFraction = g;
    }

    if (w.hasSillExternal !== undefined)
        out.hasSillExternal = w.hasSillExternal;
    if (w.hasSillInternal !== undefined)
        out.hasSillInternal = w.hasSillInternal;
    if (w.hasDrive !== undefined) out.hasDrive = w.hasDrive;
    if (w.smokeStop !== undefined) out.smokeStop = w.smokeStop;

    return out as IfcWindowCommonProps;
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
 * window infiltration).
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
// Main entry — write Pset_WindowCommon + IfcRelDefinesByProperties
// ---------------------------------------------------------------------------

/**
 * Emit one `IfcPropertySet` (Name = `"Pset_WindowCommon"`) containing
 * every property the window carries, then attach it to the window via
 * `IfcRelDefinesByProperties`.
 *
 * `Status` is always present (defaults to `'NEW'`). Every other property
 * is included iff `pickWindowCommonProps` retained it from the input.
 *
 * Returns the `IfcPropertySet` and `IfcRelDefinesByProperties` entity refs
 * plus the count of properties written — the orchestrator uses the count
 * to roll up `counts.properties` for the final export result.
 *
 * Wrapped in a `pryzm.ifc.export-pset-window-common` span (P8) with
 * `{ windowId, propertyCount }` attributes.
 */
export function writePsetWindowCommon(
    windowRef: EntityRef,
    window: WindowToExport,
    ctx: ExportCtx,
): WritePsetWindowCommonResult {
    return withSpan(
        'pryzm.ifc.export-pset-window-common',
        (span) => {
            const { api, modelId, ownerRefs, guid } = ctx;
            const picked = pickWindowCommonProps(window);

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
                writeProp(
                    api,
                    modelId,
                    'Status',
                    label(api, modelId, picked.status),
                ),
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
            if (picked.hasSillExternal !== undefined) {
                properties.push(
                    writeProp(
                        api,
                        modelId,
                        'HasSillExternal',
                        boolean(api, modelId, picked.hasSillExternal),
                    ),
                );
            }
            if (picked.hasSillInternal !== undefined) {
                properties.push(
                    writeProp(
                        api,
                        modelId,
                        'HasSillInternal',
                        boolean(api, modelId, picked.hasSillInternal),
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
                label(api, modelId, 'Pset_WindowCommon'),
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
                [windowRef],
                psetRef,
            );

            // Inside the span (mirrors α-4 wall + α-3 zone + α-6 door patterns).
            span.setAttribute('windowId', window.id);
            span.setAttribute('propertyCount', properties.length);

            return { psetRef, relRef, propertyCount: properties.length };
        },
    );
}
