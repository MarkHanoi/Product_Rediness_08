// browse.security.test.ts — XSS-surface regression for the marketplace UGC
// rendering helpers (L-393/SEC-XSS slice). `escapeHtml` guards HTML text/attr
// context; `safeHref` guards the URL-scheme context that `escapeHtml` cannot
// (a `javascript:`/`data:` payload contains no HTML-special characters).

import { describe, it, expect } from 'vitest';

import { escapeHtml, safeHref } from './browse.js';

describe('escapeHtml', () => {
  it('escapes all five HTML-significant characters', () => {
    expect(escapeHtml(`<script>&"'`)).toBe('&lt;script&gt;&amp;&quot;&#39;');
  });

  it('neutralises an attribute-breakout attempt', () => {
    // A UGC value trying to break out of href="…" and add an onerror handler.
    const evil = `" onmouseover="alert(1)`;
    expect(escapeHtml(evil)).toBe('&quot; onmouseover=&quot;alert(1)');
    expect(escapeHtml(evil)).not.toContain('"');
  });

  it('leaves benign text untouched', () => {
    expect(escapeHtml('Kaveh Home Sofa v1.2.0')).toBe('Kaveh Home Sofa v1.2.0');
  });
});

describe('safeHref', () => {
  it('passes http(s) absolute URLs through unchanged', () => {
    expect(safeHref('https://cdn.pryzm.so/f/abc.pryzm-family')).toBe(
      'https://cdn.pryzm.so/f/abc.pryzm-family',
    );
    expect(safeHref('http://example.com/x')).toBe('http://example.com/x');
    expect(safeHref('HTTPS://EXAMPLE.COM/X')).toBe('HTTPS://EXAMPLE.COM/X');
  });

  it('passes relative / root-relative / protocol-relative / hash links unchanged', () => {
    expect(safeHref('/api/v1/families/abc/download')).toBe('/api/v1/families/abc/download');
    expect(safeHref('families/abc.pryzm-family')).toBe('families/abc.pryzm-family');
    expect(safeHref('//cdn.example.com/x')).toBe('//cdn.example.com/x');
    expect(safeHref('#/browse')).toBe('#/browse');
  });

  it('collapses javascript: to the inert placeholder', () => {
    expect(safeHref('javascript:alert(document.cookie)')).toBe('#');
    expect(safeHref('JavaScript:alert(1)')).toBe('#');
    expect(safeHref('  javascript:alert(1)')).toBe('#'); // leading whitespace
  });

  it('collapses data: and vbscript: and other non-http schemes', () => {
    expect(safeHref('data:text/html,<script>alert(1)</script>')).toBe('#');
    expect(safeHref('vbscript:msgbox(1)')).toBe('#');
    expect(safeHref('file:///etc/passwd')).toBe('#');
    expect(safeHref('blob:https://evil/x')).toBe('#');
  });

  it('defeats control-character scheme-splitting bypasses', () => {
    // Browsers strip TAB/NEWLINE inside a scheme token; the guard must too.
    expect(safeHref('java\tscript:alert(1)')).toBe('#');
    expect(safeHref('java\nscript:alert(1)')).toBe('#');
    expect(safeHref('java\r\nscript:alert(1)')).toBe('#');
    expect(safeHref('javascript:alert(1)')).toBe('#');
  });

  it('is null/undefined-safe', () => {
    expect(safeHref(undefined as unknown as string)).toBe('');
    expect(safeHref('')).toBe('');
  });
});
