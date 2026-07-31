// §IMPORTED-COLOR-XSS (L-407 / SEC-XSS) — regression lock for the two
// imported/provider-derived COLOUR-string XSS sinks that interpolated an
// untrusted colour RAW into an inline `style` attribute.
//
// Class of bug (identical to the batch-6/7 project-name & marketplace sinks):
// a colour string from imported-file / snapshot data is dropped into
// `style="background:${colour}"`. escaping the sibling *label* is not enough —
// the colour itself can carry `"><img …>` and break out of the attribute.
//
//   1. DxfImportPanel.renderLayerList()  — `l.color` from the parsed DXF layer
//      table (and `DxfLayerStore.restore()` from a persisted snapshot). Sibling
//      `l.name` was already `escHtml`-wrapped; the colour was not.
//   2. MaterialsBucket cards (lines 138, 373) — `formatMaterialColor(
//      material.params.color)`, whose string branch returned the imported
//      material colour VERBATIM. Sibling id/label were escaped; the colour
//      was not, and material colours PERSIST in the project (stored XSS).
//
// Both now route the colour through a `safeCssColor()` colour-grammar allowlist
// which, unlike escHtml, also blocks `;`-delimited CSS-property injection. This
// suite proves, in the node test environment (no DOM; the modules under test
// are pure):
//   (A) `safeCssColor` passes real colours and collapses any breakout/injection
//       payload to an inert fallback;
//   (B) `formatMaterialColor` inherits that guard for string input; and
//   (C) neither raw sink can silently reappear, while the sibling label
//       escaping stays in place (scoped source-scan regression lock).

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { describe, it, expect } from 'vitest';

// DWHelpers is a pure util module (no DOM/side-effect imports), so it — and its
// exported `safeCssColor` — load safely under the node test environment.
import { safeCssColor, formatMaterialColor } from '../src/ui/dataworkbench/buckets/DWHelpers';

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (rel: string): string => readFileSync(resolve(HERE, rel), 'utf8');

const DXF_PANEL   = '../src/ui/import/DxfImportPanel.ts';
const MATERIALS   = '../src/ui/dataworkbench/buckets/MaterialsBucket.ts';
const DW_HELPERS  = '../src/ui/dataworkbench/buckets/DWHelpers.ts';

describe('safeCssColor — colour-grammar allowlist (A)', () => {
  it('passes legitimate hex colours unchanged', () => {
    for (const c of ['#fff', '#ffff', '#ff0000', '#12ab34', '#12ab34cd']) {
      expect(safeCssColor(c)).toBe(c);
    }
  });

  it('passes rgb()/rgba()/hsl()/hsla() functional colours', () => {
    expect(safeCssColor('rgb(255, 0, 0)')).toBe('rgb(255, 0, 0)');
    expect(safeCssColor('rgba(0,0,0,0.5)')).toBe('rgba(0,0,0,0.5)');
    expect(safeCssColor('hsl(120, 50%, 50%)')).toBe('hsl(120, 50%, 50%)');
  });

  it('passes a bare colour keyword', () => {
    expect(safeCssColor('red')).toBe('red');
    expect(safeCssColor('transparent')).toBe('transparent');
  });

  it('collapses an attribute-breakout payload to the inert fallback', () => {
    const out = safeCssColor(`#fff"></span><img src=x onerror=alert(1)>`);
    expect(out).toBe('#888888');
    expect(out).not.toContain('"');
    expect(out).not.toContain('<');
    expect(out).not.toContain('>');
  });

  it('collapses a `;`-delimited CSS-property injection to the fallback', () => {
    // escHtml would NOT stop these (no HTML-special chars) — the allowlist must.
    expect(safeCssColor('red;position:fixed;inset:0')).toBe('#888888');
    expect(safeCssColor('url(javascript:alert(1))')).toBe('#888888');
  });

  it('collapses empty / nullish input to the fallback', () => {
    expect(safeCssColor('')).toBe('#888888');
    expect(safeCssColor(null)).toBe('#888888');
    expect(safeCssColor(undefined)).toBe('#888888');
  });

  it('honours a caller-supplied fallback', () => {
    expect(safeCssColor('not a colour!', '#000')).toBe('#000');
  });

  it('never returns a string carrying a breakout character, for any input', () => {
    const payloads = [
      '#fff"onmouseover="alert(1)',
      'javascript:alert(1)',
      '<script>alert(1)</script>',
      '#fff;}</style><script>alert(1)</script>',
    ];
    for (const p of payloads) {
      expect(safeCssColor(p)).not.toMatch(/["<>;]/);
    }
  });
});

describe('formatMaterialColor inherits the guard for string input (B)', () => {
  it('passes a legitimate hex colour string unchanged', () => {
    expect(formatMaterialColor('#3366ff')).toBe('#3366ff');
  });

  it('still formats a numeric colour as safe hex', () => {
    expect(formatMaterialColor(0xff0000)).toBe('#ff0000');
  });

  it('collapses a malicious colour string to the inert fallback', () => {
    const out = formatMaterialColor(`red"><img src=x onerror=alert(1)>`);
    expect(out).not.toMatch(/["<>;]/);
    expect(out).toBe('#888888');
  });
});

describe('colour sinks are guarded (source-scan lock) (C)', () => {
  it('DxfImportPanel routes the swatch background through safeCssColor', () => {
    const src = read(DXF_PANEL);
    expect(src).toMatch(/style="background:\$\{safeCssColor\(l\.color\)\}"/);
    expect(src).not.toMatch(/style="background:\$\{l\.color\}"/);
    // the guard must be defined in-file
    expect(src).toMatch(/function safeCssColor\(/);
    // sibling layer-name sinks must stay escaped
    expect(src).not.toMatch(/title="\$\{l\.name\}"/);
    expect(src).toMatch(/title="\$\{escHtml\(l\.name\)\}"/);
    expect(src).toMatch(/>\$\{escHtml\(l\.name\)\}</);
  });

  it('formatMaterialColor no longer returns an untrusted string verbatim', () => {
    const src = read(DW_HELPERS);
    expect(src).toMatch(/export function safeCssColor\(/);
    expect(src).toMatch(/typeof color === 'string'\)\s*return safeCssColor\(color\)/);
    // the raw passthrough must never come back
    expect(src).not.toMatch(/typeof color === 'string'\)\s*return color;/);
  });

  it('MaterialsBucket colour still flows through the formatMaterialColor chokepoint', () => {
    const src = read(MATERIALS);
    // The colour used in the swatch style must originate from the guarded helper.
    expect(src).toMatch(/const color\s*=\s*formatMaterialColor\(material\.params\.color\)/);
    // sibling label / id sinks stay escaped
    expect(src).toMatch(/\$\{escapeHtml\(material\.label\)\}/);
  });
});
