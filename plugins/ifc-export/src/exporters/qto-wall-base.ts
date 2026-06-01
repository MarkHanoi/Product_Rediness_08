/**
 * `Qto_WallBaseQuantities` writer — IFC-α-5 (2026-06-01).
 *
 * Every exported `IfcWall` carries the official IFC4X3
 * `Qto_WallBaseQuantities` quantity set. Downstream BIM tools (Revit
 * schedules, Solibri, BIMcollab, BIM 360, Vico) use these quantities for
 * quantity-takeoff, cost estimation, embodied-carbon analysis and 4D/5D
 * BIM workflows. Without them, walls appear in BIM tool quantity reports
 * with empty Length / Area / Volume columns.
 *
 * Per [C25-IFC-EXPORT-PRODUCTION §3](../../../docs/02-decisions/contracts/C25-IFC-EXPORT-PRODUCTION.md)
 * + master plan IFC-α-5.
 *
 * Architectural notes:
 *
 *   • `Qto_WallBaseQuantities` uses `IfcElementQuantity` (NOT
 *     `IfcPropertySet`) as the container — quantities and properties live
 *     in distinct subtrees of `IfcPropertySetDefinition` so BIM tools can
 *     route them to schedule vs property views.
 *   • Every quantity is an `IfcQuantityLength` / `IfcQuantityArea` /
 *     `IfcQuantityVolume` / `IfcQuantityWeight` carrying a raw SI value
 *     (m, m², m³, kg — IFC4X3 defaults). The dimensional measure tags
 *     downstream tools to render units correctly.
 *   • The qto attaches to the wall via `IfcRelDefinesByProperties` (the
 *     same relation Psets use — quantity-sets are a sibling of
 *     property-sets under `IfcPropertySetDefinition`).
 *   • Net values clamp to ≥ 0: if openings exceed the gross area/volume
 *     the net is set to zero (a defensive guard for malformed inputs;
 *     normally caught upstream).
 *   • Footprint area is invariant to openings — wall openings are
 *     vertical cut-outs so they do not change the floor-plan footprint.
 *     `netFootprintArea` therefore equals `grossFootprintArea`.
 *   • `GrossWeight` and `NetWeight` are emitted iff `densityKgPerM3` is
 *     supplied — most walls do not yet carry density and we prefer the
 *     IFC4X3 default of omitting the quantity over emitting a zero.
 *
 * Wrapped in a `pryzm.ifc.export-qto-wall-base` span (P8).
 */

import * as WebIFC from 'web-ifc';
import type { IfcAPI } from 'web-ifc';

import {
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
 * A PRYZM wall projected into the minimal shape needed to emit a
 * `Qto_WallBaseQuantities`. The orchestrator does the projection — see
 * the call site in `IFC4X3Exporter.ts`.
 *
 * Every dimensional field is OPTIONAL. Fields that are absent or
 * non-finite cause every dependent quantity to be dropped.
 */
export interface WallQuantityInputs {
    /** PRYZM element id (`wall_<ulid>`) — span attribute + diagnostics. */
    readonly id: string;
    /** Wall length in metres along its base curve. */
    readonly lengthM?: number;
    /** Wall thickness in metres (perpendicular to length axis). */
    readonly widthM?: number;
    /** Wall height in metres (top - bottom). */
    readonly heightM?: number;
    /**
     * Total area of all openings (doors + windows) cut into the wall,
     * in m². Used to compute net side area.
     */
    readonly openingsAreaM2?: number;
    /** Total volume of all openings, in m³. Used to compute net volume. */
    readonly openingsVolumeM3?: number;
    /**
     * Material density in kg/m³. If provided, GrossWeight + NetWeight
     * are emitted.
     */
    readonly densityKgPerM3?: number;
}

/**
 * The pure-helper output shape. Each field corresponds 1:1 to a quantity
 * in `Qto_WallBaseQuantities`; `undefined` means "do not emit".
 */
export interface WallQuantityOutputs {
    readonly length?: number;
    readonly width?: number;
    readonly height?: number;
    /** length × width. */
    readonly grossFootprintArea?: number;
    /**
     * Same as `grossFootprintArea` for walls — wall openings are
     * vertical cuts and do not modify the floor-plan footprint.
     */
    readonly netFootprintArea?: number;
    /** length × height (one face). */
    readonly grossSideArea?: number;
    /** length × height − openingsAreaM2 (clamped ≥ 0). */
    readonly netSideArea?: number;
    /** length × width × height. */
    readonly grossVolume?: number;
    /** grossVolume − openingsVolumeM3 (clamped ≥ 0). */
    readonly netVolume?: number;
    /** grossVolume × density. */
    readonly grossWeight?: number;
    /** netVolume × density. */
    readonly netWeight?: number;
}

/**
 * Per-export context shared by every Pset / Qto writer. Identical to
 * the shape used by `pset-wall-common.ts` so callers reuse one record.
 */
export interface ExportCtx {
    readonly api: IfcAPI;
    readonly modelId: number;
    readonly ownerRefs: OwnerHistoryRefs;
    readonly guid: GuidProvider;
}

export interface WriteQtoWallBaseResult {
    /** The `IfcElementQuantity` entity (Name = 'Qto_WallBaseQuantities'). */
    readonly qtoRef: EntityRef;
    /** The `IfcRelDefinesByProperties` entity linking the qto to the wall. */
    readonly relRef: EntityRef;
    /**
     * Number of quantities written to the qto (0 when no dimensions
     * were supplied). Useful for the orchestrator's quantity-count tally.
     */
    readonly quantityCount: number;
}

// ---------------------------------------------------------------------------
// Pure helper — derive the quantity outputs
// ---------------------------------------------------------------------------

/**
 * Project the input dimensions into the canonical
 * `WallQuantityOutputs` shape. Pure helper — exported so the writer
 * logic is testable in isolation.
 *
 * Rules:
 *
 *   • A field is `undefined` in the output iff EVERY input it depends on
 *     is absent / non-finite / negative.
 *   • Negative dimensions clamp to `undefined` (treated as missing).
 *   • Non-finite values (NaN, ±Infinity) clamp to `undefined`.
 *   • Net values clamp to zero when openings exceed gross.
 *   • Weight is emitted iff `densityKgPerM3` is finite, non-negative AND
 *     the corresponding (gross/net) volume is defined.
 */
export function computeWallQuantities(
    input: WallQuantityInputs,
): WallQuantityOutputs {
    const length = positiveOrUndefined(input.lengthM);
    const width = positiveOrUndefined(input.widthM);
    const height = positiveOrUndefined(input.heightM);
    const openingsArea = nonNegativeOrUndefined(input.openingsAreaM2);
    const openingsVolume = nonNegativeOrUndefined(input.openingsVolumeM3);
    const density = nonNegativeOrUndefined(input.densityKgPerM3);

    const out: {
        -readonly [K in keyof WallQuantityOutputs]: WallQuantityOutputs[K];
    } = {};

    if (length !== undefined) out.length = length;
    if (width !== undefined) out.width = width;
    if (height !== undefined) out.height = height;

    if (length !== undefined && width !== undefined) {
        const footprint = length * width;
        out.grossFootprintArea = footprint;
        // Openings are vertical → no net floor-plan reduction.
        out.netFootprintArea = footprint;
    }

    if (length !== undefined && height !== undefined) {
        const side = length * height;
        out.grossSideArea = side;
        const opens = openingsArea ?? 0;
        out.netSideArea = Math.max(0, side - opens);
    }

    if (length !== undefined && width !== undefined && height !== undefined) {
        const vol = length * width * height;
        out.grossVolume = vol;
        const opens = openingsVolume ?? 0;
        const net = Math.max(0, vol - opens);
        out.netVolume = net;

        if (density !== undefined) {
            out.grossWeight = vol * density;
            out.netWeight = net * density;
        }
    }

    return out;
}

function positiveOrUndefined(v: number | undefined): number | undefined {
    if (v === undefined) return undefined;
    if (!Number.isFinite(v)) return undefined;
    if (v <= 0) return undefined;
    return v;
}

function nonNegativeOrUndefined(v: number | undefined): number | undefined {
    if (v === undefined) return undefined;
    if (!Number.isFinite(v)) return undefined;
    if (v < 0) return undefined;
    return v;
}

// ---------------------------------------------------------------------------
// Quantity value-object constructors — wrap raw numbers in the right
// IFC4X3 dimensional measure (IfcLengthMeasure / IfcAreaMeasure /
// IfcVolumeMeasure / IfcMassMeasure).
// ---------------------------------------------------------------------------

function lengthMeasure(api: IfcAPI, modelId: number, value: number): ValueRef {
    return api.CreateIfcType(modelId, WebIFC.IFCLENGTHMEASURE, value);
}
function areaMeasure(api: IfcAPI, modelId: number, value: number): ValueRef {
    return api.CreateIfcType(modelId, WebIFC.IFCAREAMEASURE, value);
}
function volumeMeasure(api: IfcAPI, modelId: number, value: number): ValueRef {
    return api.CreateIfcType(modelId, WebIFC.IFCVOLUMEMEASURE, value);
}
function massMeasure(api: IfcAPI, modelId: number, value: number): ValueRef {
    return api.CreateIfcType(modelId, WebIFC.IFCMASSMEASURE, value);
}

// ---------------------------------------------------------------------------
// Single-quantity writers — each emits one IfcQuantity* line.
// ---------------------------------------------------------------------------

/**
 * IFC4X3 `IfcQuantityLength(Name, Description, Unit, LengthValue, Formula)`.
 * Description, Unit and Formula are left null — Unit falls through to the
 * project's UnitAssignment; Formula is an authoring hint we do not emit.
 */
function writeQuantityLength(
    api: IfcAPI,
    modelId: number,
    name: string,
    value: number,
): EntityRef {
    return writeEntity(
        api,
        modelId,
        WebIFC.IFCQUANTITYLENGTH,
        label(api, modelId, name),
        null,
        null,
        lengthMeasure(api, modelId, value),
        null,
    );
}

function writeQuantityArea(
    api: IfcAPI,
    modelId: number,
    name: string,
    value: number,
): EntityRef {
    return writeEntity(
        api,
        modelId,
        WebIFC.IFCQUANTITYAREA,
        label(api, modelId, name),
        null,
        null,
        areaMeasure(api, modelId, value),
        null,
    );
}

function writeQuantityVolume(
    api: IfcAPI,
    modelId: number,
    name: string,
    value: number,
): EntityRef {
    return writeEntity(
        api,
        modelId,
        WebIFC.IFCQUANTITYVOLUME,
        label(api, modelId, name),
        null,
        null,
        volumeMeasure(api, modelId, value),
        null,
    );
}

function writeQuantityWeight(
    api: IfcAPI,
    modelId: number,
    name: string,
    value: number,
): EntityRef {
    return writeEntity(
        api,
        modelId,
        WebIFC.IFCQUANTITYWEIGHT,
        label(api, modelId, name),
        null,
        null,
        massMeasure(api, modelId, value),
        null,
    );
}

// ---------------------------------------------------------------------------
// Main entry — write Qto_WallBaseQuantities + IfcRelDefinesByProperties
// ---------------------------------------------------------------------------

/**
 * Emit one `IfcElementQuantity` (Name = `"Qto_WallBaseQuantities"`)
 * containing every quantity the wall can supply, then attach it to the
 * wall via `IfcRelDefinesByProperties`.
 *
 * The `quantityCount` may be 0 when the input carries no usable
 * dimensions — the qto and rel are still emitted (an empty quantity set
 * is schema-valid IFC4X3 and lets downstream tools at least see the
 * Qto_WallBaseQuantities slot exists). The orchestrator uses the count
 * to roll up `counts.properties` for the final export result.
 *
 * Wrapped in a `pryzm.ifc.export-qto-wall-base` span (P8) with
 * `{ wallId, quantityCount }` attributes.
 */
export function writeQtoWallBase(
    wallRef: EntityRef,
    input: WallQuantityInputs,
    ctx: ExportCtx,
): WriteQtoWallBaseResult {
    return withSpan('pryzm.ifc.export-qto-wall-base', (span) => {
        const { api, modelId, ownerRefs, guid } = ctx;
        const q = computeWallQuantities(input);

        const quantities: EntityRef[] = [];

        if (q.length !== undefined) {
            quantities.push(
                writeQuantityLength(api, modelId, 'Length', q.length),
            );
        }
        if (q.width !== undefined) {
            quantities.push(
                writeQuantityLength(api, modelId, 'Width', q.width),
            );
        }
        if (q.height !== undefined) {
            quantities.push(
                writeQuantityLength(api, modelId, 'Height', q.height),
            );
        }
        if (q.grossFootprintArea !== undefined) {
            quantities.push(
                writeQuantityArea(
                    api,
                    modelId,
                    'GrossFootprintArea',
                    q.grossFootprintArea,
                ),
            );
        }
        if (q.netFootprintArea !== undefined) {
            quantities.push(
                writeQuantityArea(
                    api,
                    modelId,
                    'NetFootprintArea',
                    q.netFootprintArea,
                ),
            );
        }
        if (q.grossSideArea !== undefined) {
            quantities.push(
                writeQuantityArea(
                    api,
                    modelId,
                    'GrossSideArea',
                    q.grossSideArea,
                ),
            );
        }
        if (q.netSideArea !== undefined) {
            quantities.push(
                writeQuantityArea(api, modelId, 'NetSideArea', q.netSideArea),
            );
        }
        if (q.grossVolume !== undefined) {
            quantities.push(
                writeQuantityVolume(
                    api,
                    modelId,
                    'GrossVolume',
                    q.grossVolume,
                ),
            );
        }
        if (q.netVolume !== undefined) {
            quantities.push(
                writeQuantityVolume(api, modelId, 'NetVolume', q.netVolume),
            );
        }
        if (q.grossWeight !== undefined) {
            quantities.push(
                writeQuantityWeight(
                    api,
                    modelId,
                    'GrossWeight',
                    q.grossWeight,
                ),
            );
        }
        if (q.netWeight !== undefined) {
            quantities.push(
                writeQuantityWeight(api, modelId, 'NetWeight', q.netWeight),
            );
        }

        // IFCELEMENTQUANTITY(GlobalId, OwnerHistory, Name, Description,
        //                    MethodOfMeasurement, Quantities)
        const qtoRef = writeEntity(
            api,
            modelId,
            WebIFC.IFCELEMENTQUANTITY,
            mintGlobalId(api, modelId, guid),
            ownerRefs.ownerHistory,
            label(api, modelId, 'Qto_WallBaseQuantities'),
            null,
            null,
            quantities,
        );

        // IFCRELDEFINESBYPROPERTIES(GlobalId, OwnerHistory, Name, Description,
        //                           RelatedObjects, RelatingPropertyDefinition)
        // NB: IfcElementQuantity is a subtype of IfcPropertySetDefinition, so
        // the same relation that attaches Psets attaches Qtos.
        const relRef = writeEntity(
            api,
            modelId,
            WebIFC.IFCRELDEFINESBYPROPERTIES,
            mintGlobalId(api, modelId, guid),
            ownerRefs.ownerHistory,
            null,
            null,
            [wallRef],
            qtoRef,
        );

        span.setAttribute('wallId', input.id);
        span.setAttribute('quantityCount', quantities.length);

        return { qtoRef, relRef, quantityCount: quantities.length };
    });
}
