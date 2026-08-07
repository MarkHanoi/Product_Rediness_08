/**
 * IfcUnitScale — resolve the IFC project LENGTHUNIT → metres scale factor.
 *
 * §FIX-IFC-STOREY-UNIT-SCALE (L-695)
 *
 * ── Why this file exists ─────────────────────────────────────────────────────
 * web-ifc normalises **geometry** to metres inside the WASM layer: a 4000 mm
 * wall streamed through `StreamAllMeshes`/`GetGeometry` arrives as 4.0. But
 * `IfcAPI.GetLine()` returns **raw STEP attribute values in file units** — it
 * performs no unit conversion at all. Any scalar length we read through
 * `GetLine` (notably `IfcBuildingStorey.Elevation`) is therefore in the
 * project's declared length unit, which for every Revit IFC export is
 * MILLIMETRES.
 *
 * That asymmetry is the whole bug: geometry landed at sane metre coordinates
 * while storey elevations landed 1000× too high (a 2.7 m ceiling became a
 * 2700 m one), which in turn produced a 6,002 m "building height" and a
 * 202-entry floor selector downstream.
 *
 * ⚠ SCALE EXACTLY ONCE. This factor applies **only** to scalars read via
 * `GetLine`. It must never be applied to geometry from `GetGeometry` /
 * `StreamAllMeshes`, which web-ifc has already converted.
 *
 * Contract: C03 (schemas — elevations are metres), C11 §element creation.
 * P8 — the exported resolver carries an OpenTelemetry span.
 */

import { trace } from '@opentelemetry/api';

const tracer = trace.getTracer('@pryzm/file-format');

/**
 * SI prefix → multiplier. IFC4 `IfcSIPrefix` enumeration.
 * Only the prefixes that can legally decorate a length unit matter in
 * practice, but the full enum is cheap and avoids a silent 1.0 fallback
 * on an exotic file.
 */
export const IFC_SI_PREFIX_FACTORS: Readonly<Record<string, number>> = Object.freeze({
    EXA:   1e18,
    PETA:  1e15,
    TERA:  1e12,
    GIGA:  1e9,
    MEGA:  1e6,
    KILO:  1e3,
    HECTO: 1e2,
    DECA:  1e1,
    DECI:  1e-1,
    CENTI: 1e-2,
    MILLI: 1e-3,
    MICRO: 1e-6,
    NANO:  1e-9,
    PICO:  1e-12,
    FEMTO: 1e-15,
    ATTO:  1e-18,
});

/**
 * A length unit declaration lifted out of the IFC model, in a form that is
 * independent of web-ifc so the resolution rule is unit-testable without WASM.
 */
export interface IfcLengthUnitRecord {
    /** 'SI' for IfcSIUnit, 'CONVERSION' for IfcConversionBasedUnit. */
    kind: 'SI' | 'CONVERSION';
    /** IfcUnitEnum, e.g. 'LENGTHUNIT'. */
    unitType?: string;
    /** IfcSIUnitName, e.g. 'METRE'. SI only. */
    name?: string;
    /** IfcSIPrefix, e.g. 'MILLI'. SI only; absent means no prefix. */
    prefix?: string;
    /**
     * CONVERSION only — the numeric ValueComponent of the unit's
     * IfcMeasureWithUnit conversion factor (e.g. 0.3048 for FOOT).
     */
    conversionFactor?: number;
    /**
     * CONVERSION only — the SI scale of the conversion factor's UnitComponent.
     * Normally 1 (the component is plain METRE). Multiplied with
     * `conversionFactor` to reach metres.
     */
    conversionUnitScale?: number;
}

/**
 * Resolve the metres-per-file-unit scale factor from a project's unit
 * declarations.
 *
 * Returns **1.0** when no LENGTHUNIT is declared — an IFC file without a
 * length unit is, per IFC4 §8.15, implicitly metres, and 1.0 is also the
 * only safe no-op: a wrong guess would corrupt correctly-authored files.
 *
 * @param records  Length-unit declarations lifted from IfcUnitAssignment.
 * @returns metres per file unit — 1e-3 for MILLI, 0.3048 for FOOT, 1 for METRE.
 */
export function resolveLengthUnitScale(records: readonly IfcLengthUnitRecord[]): number {
    return tracer.startActiveSpan('pryzm.ifc.resolveLengthUnitScale', (span): number => {
        try {
            const lengthUnits = records.filter(
                (r) => String(r.unitType ?? '').toUpperCase() === 'LENGTHUNIT',
            );
            span.setAttribute('pryzm.ifc.unit_records', records.length);
            span.setAttribute('pryzm.ifc.length_unit_records', lengthUnits.length);

            if (lengthUnits.length === 0) {
                span.setAttribute('pryzm.ifc.length_unit_scale', 1);
                span.setAttribute('pryzm.ifc.length_unit_source', 'default-metre');
                return 1;
            }

            // Prefer an SI declaration; fall back to a conversion-based one
            // (imperial files declare LENGTHUNIT via IfcConversionBasedUnit).
            const si = lengthUnits.find((r) => r.kind === 'SI');
            if (si) {
                const prefix = String(si.prefix ?? '').toUpperCase();
                const factor = prefix ? (IFC_SI_PREFIX_FACTORS[prefix] ?? 1) : 1;
                span.setAttribute('pryzm.ifc.length_unit_scale', factor);
                span.setAttribute('pryzm.ifc.length_unit_source', `SI:${prefix || 'NONE'}`);
                return factor;
            }

            const conv = lengthUnits.find((r) => r.kind === 'CONVERSION');
            if (conv && Number.isFinite(conv.conversionFactor) && conv.conversionFactor! > 0) {
                const componentScale =
                    Number.isFinite(conv.conversionUnitScale) && conv.conversionUnitScale! > 0
                        ? conv.conversionUnitScale!
                        : 1;
                const factor = conv.conversionFactor! * componentScale;
                span.setAttribute('pryzm.ifc.length_unit_scale', factor);
                span.setAttribute('pryzm.ifc.length_unit_source', 'CONVERSION');
                return factor;
            }

            span.setAttribute('pryzm.ifc.length_unit_scale', 1);
            span.setAttribute('pryzm.ifc.length_unit_source', 'unresolved-default');
            return 1;
        } finally {
            span.end();
        }
    });
}

/**
 * Guard against a scale factor that would produce absurd building geometry.
 *
 * §FIX-IFC-STOREY-UNIT-SCALE — a derived building height in the kilometres is
 * always a unit error, never a real building: the tallest structure on earth
 * is under 1 km. This is the assertion that stops a 6,002 m "tower" silently
 * returning if the unit path ever regresses.
 *
 * @param heightMetres  Derived overall building height, in metres.
 * @returns true when the height is physically plausible for a building.
 */
export function isPlausibleBuildingHeight(heightMetres: number): boolean {
    return Number.isFinite(heightMetres) && Math.abs(heightMetres) <= MAX_PLAUSIBLE_BUILDING_HEIGHT_M;
}

/**
 * 1,000 m. Burj Khalifa is 828 m; no authored BIM building exceeds this.
 * Anything above is a unit error by construction.
 */
export const MAX_PLAUSIBLE_BUILDING_HEIGHT_M = 1000;
