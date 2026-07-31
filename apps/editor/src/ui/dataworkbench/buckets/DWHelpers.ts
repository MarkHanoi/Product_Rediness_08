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

/**
 * Return `value` only if it is a syntactically safe CSS colour; otherwise a
 * neutral `fallback`. Accepts a hex literal (`#rgb`/`#rgba`/`#rrggbb`/
 * `#rrggbbaa`), an `rgb()`/`rgba()`/`hsl()`/`hsla()` functional value over a
 * restricted numeric charset, or a bare colour keyword (letters only). Every
 * accepted form is guaranteed free of `"`, `<`, `>`, `;` and other
 * markup/CSS-breakout characters.
 *
 * Use this — NOT escapeHtml — when interpolating a provider- or imported-file-
 * derived colour string into an inline `style` attribute: escapeHtml neuters an
 * attribute breakout but still lets a `;`-delimited CSS-property injection
 * through, whereas a colour value has a narrow, allowlistable grammar.
 */
export function safeCssColor(value: unknown, fallback = '#888888'): string {
    const v = String(value ?? '').trim();
    // #rgb | #rgba | #rrggbb | #rrggbbaa
    if (/^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(v)) return v;
    // rgb()/rgba()/hsl()/hsla() over a strict, breakout-free charset
    if (/^(?:rgb|rgba|hsl|hsla)\([0-9.,%/deg\s]+\)$/i.test(v)) return v;
    // Bare colour keyword — letters only; cannot carry breakout characters
    if (/^[a-zA-Z]{3,20}$/.test(v)) return v;
    return fallback;
}

export function formatMaterialColor(color: unknown): string {
    // §DW-MATERIAL-COLOR-XSS (L-407 / SEC-XSS) — `color` may be an imported-model
    // material colour (IFC/glTF/Rhino) or a snapshot-restored user material; the
    // string branch previously returned it VERBATIM straight into inline
    // `style="background:…"` swatch sinks (MaterialsBucket.ts:138,373), so a value
    // like `red"><img src=x onerror=alert(1)>` broke out of the attribute. Route
    // untrusted strings through the CSS-colour allowlist. Numeric / THREE.Color
    // branches already yield a safe `#rrggbb`.
    if (typeof color === 'string') return safeCssColor(color);
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
