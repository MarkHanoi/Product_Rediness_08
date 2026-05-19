/**
 * DWHelpers — shared pure-utility functions for DataWorkbench bucket files.
 *
 * Layer Affected:    UI — Data Workbench
 * File:             src/ui/dataworkbench/buckets/DWHelpers.ts
 *
 * No imports from parent DataWorkbench class; no circular dependency risk.
 */

export function escapeHtml(value: unknown): string {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export function formatMaterialColor(color: unknown): string {
    if (typeof color === 'string') return color;
    if (typeof color === 'number') return `#${color.toString(16).padStart(6, '0')}`;
    if (color && typeof (color as { getHexString?: unknown }).getHexString === 'function') {
        return `#${(color as { getHexString: () => string }).getHexString()}`;
    }
    return '#d8d8d8';
}

export function formatMetres(value: number): string {
    if (!Number.isFinite(value)) return '—';
    return value < 1 ? `${Math.round(value * 1000)}mm` : `${value.toFixed(2)}m`;
}
