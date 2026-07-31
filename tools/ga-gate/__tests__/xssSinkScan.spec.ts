/**
 * §XSS-SINK-SCAN (L-407) — behavioural specs for the repo-wide HTML-sink gate.
 *
 * These lock the three structural blindnesses that made the previous
 * `check-xss-guards.ts` verdict meaningless, plus the honesty assertion that a
 * scan reaching zero files can never report a pass.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  blankComments,
  readTemplate,
  readStatementRhs,
  extractInterpolations,
  isSafeExpression,
  isStaticLiteral,
  detectLocalGuards,
  stripGuardCalls,
  containsTemplateLiteral,
  scanSource,
  ZERO_TOLERANCE_SINKS,
} from '../lib/xssSinkScan.js';
import { scanRepo, tally, diffBaseline, MIN_SCANNED_FILES } from '../lib/xssSinkWalk.js';

// Vitest runs from the repo root; `import.meta.url` is not a file: URL here.
const ROOT = process.cwd().replace(/[\\/]$/, '');

describe('blankComments', () => {
  it('blanks a sink written inside a comment', () => {
    const src = '// el.innerHTML = `${evil}`\nconst x = 1;';
    expect(blankComments(src)).not.toContain('innerHTML');
  });

  it('preserves byte offsets and line breaks', () => {
    const src = 'a\n/* comment */\nb';
    const out = blankComments(src);
    expect(out.length).toBe(src.length);
    expect(out.split('\n').length).toBe(src.split('\n').length);
  });

  it('does NOT treat an apostrophe inside template TEXT as a string opener', () => {
    // Regression: the naive walker opened a string at the apostrophe in "it's"
    // and swallowed the rest of the file, hiding every later sink.
    const src = ['const a = `<p>it\'s here</p>`;', 'el.innerHTML = `<b>${evil}</b>`;'].join('\n');
    const out = blankComments(src);
    expect(out).toContain('innerHTML');
    const findings = scanSource('x.ts', src);
    expect(findings.map((f) => f.expr)).toContain('evil');
  });

  it('does not treat a `//` inside template text as a comment', () => {
    const src = 'el.innerHTML = `<a href="https://x.test">${evil}</a>`;';
    expect(scanSource('x.ts', src).map((f) => f.expr)).toContain('evil');
  });
});

describe('readTemplate / readStatementRhs', () => {
  it('reads a template with a nested template inside a substitution', () => {
    const src = 'x = `a${ cond ? `in${deep}` : "" }b`;';
    const { body } = readTemplate(src, src.indexOf('`'));
    expect(body).toContain('deep');
    expect(body.endsWith('b')).toBe(true);
  });

  it('does not let a `;` inside a CSS string terminate the RHS', () => {
    const src = `el.innerHTML = '<h2 style="color:red;margin:0;">Hi</h2>';`;
    const rhs = readStatementRhs(src, src.indexOf("'"));
    expect(rhs.endsWith("'")).toBe(true);
    // …and therefore the whole thing is recognised as a static literal.
    expect(scanSource('x.ts', src)).toHaveLength(0);
  });
});

describe('extractInterpolations', () => {
  it('handles an expression containing a nested `}` (object literal)', () => {
    // The old `\$\{([^}]+)\}` regex truncated this at the first `}`.
    const exprs = extractInterpolations('a${ fn({ k: v }) }b');
    expect(exprs).toEqual(['fn({ k: v })']);
  });

  it('extracts interpolations from a NESTED template too', () => {
    const exprs = extractInterpolations('${rows.map(r => `<td>${r.name}</td>`).join("")}');
    expect(exprs).toContain('r.name');
  });

  it('ignores a `}` inside a string literal', () => {
    expect(extractInterpolations('${ x ?? "}" }')).toEqual(['x ?? "}"']);
  });
});

describe('isSafeExpression', () => {
  it('accepts a guarded value', () => {
    expect(isSafeExpression('escHtml(user.name)')).toBe(true);
    expect(isSafeExpression('escAttr(v)')).toBe(true);
    expect(isSafeExpression('DOMPurify.sanitize(body)')).toBe(true);
  });

  it('accepts a guard reached as a METHOD (this.escHtml)', () => {
    expect(stripGuardCalls('this.escHtml(this.ctx.projectName)').trim()).toBe('');
    expect(isSafeExpression('this.escHtml(this.ctx.projectName)')).toBe(true);
  });

  it('rejects a raw runtime value', () => {
    expect(isSafeExpression('result.message')).toBe(false);
    expect(isSafeExpression('room.name')).toBe(false);
    expect(isSafeExpression('v.label')).toBe(false);
  });

  it('accepts numeric and comparison expressions', () => {
    expect(isSafeExpression('area.toFixed(1)')).toBe(true);
    expect(isSafeExpression('rows.length')).toBe(true);
    expect(isSafeExpression('42')).toBe(true);
  });

  it('accepts an author-written static markup literal but not a runtime string', () => {
    expect(isStaticLiteral(`'<span class="x">hi</span>'`)).toBe(true);
    expect(isSafeExpression(`'<span class="x">hi</span>'`)).toBe(true);
    expect(isStaticLiteral('`<b>${x}</b>`')).toBe(false);
  });

  it('accepts a ternary only when EVERY branch is safe', () => {
    expect(isSafeExpression(`isOn ? '▼' : '▲'`)).toBe(true);
    expect(isSafeExpression(`isOn ? escHtml(a) : ''`)).toBe(true);
    expect(isSafeExpression(`isOn ? a : ''`)).toBe(false);
  });

  it('accepts `a || b` only when both sides are safe', () => {
    expect(isSafeExpression(`escHtml(a) || ''`)).toBe(true);
    expect(isSafeExpression(`a || '—'`)).toBe(false);
  });

  it('treats a template container as safe because its inner values are judged separately', () => {
    expect(containsTemplateLiteral('rows.map(r => `<td>${r.name}</td>`)')).toBe(true);
    expect(isSafeExpression('rows.map(r => `<td>${r.name}</td>`)')).toBe(true);
    // …and the inner raw value is still reported by the scanner:
    const src = 'el.innerHTML = `${rows.map(r => `<td>${r.name}</td>`).join("")}`;';
    expect(scanSource('x.ts', src).map((f) => f.expr)).toContain('r.name');
  });
});

describe('detectLocalGuards', () => {
  it('recognises an escaper declared in the same file', () => {
    const src = [
      "function esc(s: string): string {",
      "  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');",
      "}",
      'el.innerHTML = `<b>${esc(user.name)}</b>`;',
    ].join('\n');
    expect(detectLocalGuards(src)).toContain('esc');
    expect(scanSource('x.ts', src)).toHaveLength(0);
  });

  it('recognises a private method escaper and a delegating alias', () => {
    const method = "private _escHtml(s: string): string { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;'); }";
    expect(detectLocalGuards(method)).toContain('_escHtml');
    const alias = 'const esc = (s: string) => this.escHtml(s);';
    expect(detectLocalGuards(alias)).toContain('esc');
  });

  it('does NOT accept a bare escape() in a file that declares no escaper', () => {
    // The global escape() is the deprecated URL escaper — it leaves `<`, `>`
    // and `"` untouched. Accepting the name globally would turn a live XSS
    // sink into a green tick.
    const src = 'el.innerHTML = `<b>${escape(user.name)}</b>`;';
    expect(detectLocalGuards(src)).not.toContain('escape');
    expect(scanSource('x.ts', src)).toHaveLength(1);
  });
});

describe('scanSource — sink coverage', () => {
  it('reports an unguarded value in a MULTI-LINE innerHTML template', () => {
    // The flagship blindness: the old gate required `.innerHTML` and `${` on
    // the SAME line, so every multi-line builder in the repo was invisible.
    const src = [
      'row.innerHTML = `',
      '    <td>${escHtml(result.ruleId)}</td>',
      '    <td>${result.message}</td>',
      '`;',
    ].join('\n');
    const findings = scanSource('x.ts', src);
    expect(findings).toHaveLength(1);
    expect(findings[0].expr).toBe('result.message');
    expect(findings[0].kind).toBe('innerHTML');
  });

  it('covers outerHTML, insertAdjacentHTML and document.write', () => {
    expect(scanSource('x.ts', 'el.outerHTML = `<b>${v}</b>`;')[0].kind).toBe('outerHTML');
    expect(scanSource('x.ts', "el.insertAdjacentHTML('beforeend', `<b>${v}</b>`);")[0].kind)
      .toBe('insertAdjacentHTML');
    expect(scanSource('x.ts', 'win.document.write(html);')[0].kind).toBe('document.write');
  });

  it('does not flag an all-literal insertAdjacentHTML', () => {
    expect(scanSource('x.ts', "el.insertAdjacentHTML('beforeend', '<div>No template.</div>');")).toHaveLength(0);
  });

  it('flags zero-tolerance sinks on sight', () => {
    for (const src of [
      'eval(userInput);',
      'const f = new Function(`return ${code}`);',
      'frame.srcdoc = `<b>${v}</b>`;',
      'range.createContextualFragment(html);',
      '<div dangerouslySetInnerHTML={{ __html: body }} />',
    ]) {
      const findings = scanSource('x.tsx', src);
      expect(findings.length, src).toBeGreaterThan(0);
      expect(ZERO_TOLERANCE_SINKS.has(findings[0].kind), src).toBe(true);
    }
  });

  it('does NOT flag the constant-argument new Function dynamic-import idiom', () => {
    const src = "const dynImport = (new Function('s', 'return import(s)') as (s: string) => Promise<unknown>);";
    expect(scanSource('x.ts', src)).toHaveLength(0);
  });

  it('ignores an empty-string reset', () => {
    expect(scanSource('x.ts', "el.innerHTML = '';")).toHaveLength(0);
  });
});

describe('repo gate', () => {
  const baselineFile = join(ROOT, 'tools', 'ga-gate', 'xss-sink-baseline.json');
  // One walk of ~4.3k files shared by every assertion below.
  let scan: ReturnType<typeof scanRepo>;
  beforeAll(() => { scan = scanRepo(ROOT); }, 120_000);

  it('has a committed baseline', () => {
    expect(existsSync(baselineFile)).toBe(true);
  });

  it('scans the real tree and stays within the baseline', () => {
    // §HONESTY — the old gate resolved its root to `/C:/…` on Windows, walked
    // nothing, and printed "✅ 0 violations". A pass must prove coverage.
    expect(scan.filesScanned).toBeGreaterThanOrEqual(MIN_SCANNED_FILES);
    const baseline = JSON.parse(readFileSync(baselineFile, 'utf8')) as Record<string, number>;
    const { newFiles, grown } = diffBaseline(tally(scan.findings), baseline);
    expect({ newFiles, grown }).toEqual({ newFiles: [], grown: [] });
  });

  it('permits ZERO zero-tolerance sinks anywhere in the tree', () => {
    expect(scan.findings.filter((f) => ZERO_TOLERANCE_SINKS.has(f.kind))).toEqual([]);
  });
});
