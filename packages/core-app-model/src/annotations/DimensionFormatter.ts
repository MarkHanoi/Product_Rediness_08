/**
 * DimensionFormatter — §DIM-II4
 *
 * Pure formatting utility: converts a raw distance in metres to a
 * human-readable measurement string with unit suffix.
 *
 * Moved from src/engine/subsystems/core/views/DimensionFormatter.ts
 * during Sprint C (S5.1-P2 2026-05-10). Original path now a re-export shim.
 *
 * CONTRACT COMPLIANCE:
 *   §01 §4   — No side effects; idempotent pure function
 *   §01 §5   — No DOM, no store, no window.* access
 *   §05 §7.8 — No bim-* / @thatopen/ui elements
 */

export type DimensionUnit = 'mm' | 'cm' | 'm';

export function formatDimension(
    distanceMetres: number,
    unit: DimensionUnit | string = 'mm',
    prefix?: string,
    suffix?: string,
    override?: string
): string {
    if (override) return override;

    let valueStr: string;
    switch (unit) {
        case 'mm':
            valueStr = `${Math.round(distanceMetres * 1000)} mm`;
            break;
        case 'm':
            valueStr = `${distanceMetres.toFixed(3)} m`;
            break;
        case 'cm':
        default:
            valueStr = `${(distanceMetres * 100).toFixed(0)} cm`;
            break;
    }

    return `${prefix ?? ''}${valueStr}${suffix ?? ''}`;
}
