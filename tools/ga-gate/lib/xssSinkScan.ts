/**
 * @file tools/ga-gate/lib/xssSinkScan.ts
 *
 * §XSS-SINK-SCAN (L-407) — the pure, testable core of the repo-wide HTML-sink scan.
 *
 * Contract C08 §3.1 — every dynamic HTML-sink assignment that interpolates a
 * runtime value MUST route that value through a recognised safety guard
 * (`escHtml`/`escAttr` from `@pryzm/ui-base`, the local `escapeHtml` aliases,
 * `safeHref`/`safeHttpUrl`, `safeCssColor`, or `DOMPurify.sanitize`).
 *
 * Why this file exists (the defect it replaces)
 * ─────────────────────────────────────────────────────────────────────────────
 * The previous `check-xss-guards.ts` was structurally blind in three ways, so a
 * "✅ 0 violations" verdict from it carried almost no information:
 *
 *   1. LINE-SCOPED. It required `.innerHTML` and `${` to appear on the SAME
 *      source line. The dominant sink shape in this repo is a MULTI-LINE
 *      template literal (`el.innerHTML = \`` … 40 lines … `\`;`), and every one
 *      of those — ~200 interpolating sites — was invisible to it.
 *   2. SINGLE-SINK. It only knew `.innerHTML`. `outerHTML`, `insertAdjacentHTML`,
 *      `document.write`, `srcdoc`, `createContextualFragment`,
 *      `dangerouslySetInnerHTML`, `eval` and `new Function` were unscanned, so
 *      the audit's own headline sink list was never actually gated.
 *   3. NON-EXPRESSION-SCOPED. Its `\$\{([^}]+)\}` interpolation regex cannot
 *      match an expression containing a nested `}` (object literals, nested
 *      templates, arrow bodies) and a single recognised guard ANYWHERE on the
 *      line marked the WHOLE line safe.
 *
 * Additionally the CLI resolved its repo root with `new URL(...).pathname`,
 * which yields `/C:/…` on Windows: every `readdirSync` threw, `walkFiles`
 * swallowed the error, and the gate reported "✅ 0 unguarded interpolations"
 * having scanned ZERO files. Failure and empty were the same value. The CLI now
 * asserts a scan-coverage floor so an unscannable tree can never pass.
 *
 * This module is deliberately dependency-free and DOM-free so it can be unit
 * tested directly (see `tools/ga-gate/__tests__/xssSinkScan.spec.ts`).
 */

// ── Sink taxonomy ────────────────────────────────────────────────────────────

/** Sinks that take an HTML string and parse it as markup. */
export type SinkKind =
  | 'innerHTML'
  | 'outerHTML'
  | 'insertAdjacentHTML'
  | 'document.write'
  | 'srcdoc'
  | 'createContextualFragment'
  | 'dangerouslySetInnerHTML'
  | 'eval'
  | 'new Function';

export interface SinkFinding {
  /** Repo-relative, forward-slashed path. */
  file: string;
  /** 1-based line of the sink itself. */
  line: number;
  kind: SinkKind;
  /** The specific unguarded interpolation, or '' for a zero-tolerance sink. */
  expr: string;
  /** Trimmed source excerpt for the report. */
  text: string;
}

/**
 * Zero-tolerance sinks: these have NO legitimate interpolating use in this
 * codebase, so any interpolating occurrence is a violation regardless of the
 * baseline. `eval`/`new Function` are flagged only when their argument is not a
 * constant string literal (the `new Function('s','return import(s)')` dynamic-
 * import idiom in ai-host/constraint-solver is a bundler escape hatch, not a
 * sink — it interpolates nothing).
 */
export const ZERO_TOLERANCE_SINKS: ReadonlySet<SinkKind> = new Set<SinkKind>([
  'dangerouslySetInnerHTML',
  'eval',
  'new Function',
  'srcdoc',
  'createContextualFragment',
]);

// ── Recognised safety guards ─────────────────────────────────────────────────

/**
 * Guard call names accepted as neutralising an interpolated value. Kept in
 * lock-step with the shipped guard family:
 *   - `escHtml`/`escAttr`      packages/ui-base/src/sanitize.ts
 *   - `escapeHtml`             apps/editor DWHelpers, apps/marketplace-web browse
 *   - `safeHref`/`safeHttpUrl` scheme allowlists (batch-6 / L-402)
 *   - `safeCssColor`           CSS-colour allowlist (batch-8)
 *   - `DOMPurify.sanitize`     subset-preserving sanitiser
 */
export const GUARD_CALLS: readonly string[] = [
  'escHtml',
  'escAttr',
  'escapeHtml',
  'escapeHtmlAttr',
  'safeHref',
  'safeHttpUrl',
  'safeCssColor',
  'sanitizeHtml',
  'DOMPurify.sanitize',
];

// ── Comment / string aware source walking ────────────────────────────────────

/**
 * Replace comment bodies with spaces, preserving byte offsets AND line breaks,
 * so downstream offset→line mapping stays exact. String and template literals
 * are left intact (a sink can legitimately live inside a template).
 */
export function blankComments(src: string): string {
  const out = src.split('');
  let i = 0;
  const n = src.length;
  // Template nesting: each entry is the `${` brace depth inside that template.
  // depth 0 ⇒ we are in TEMPLATE TEXT, where `'` and `"` are literal characters
  // and `//` is not a comment. Getting this wrong (the naive version did) makes
  // an apostrophe in markup swallow the rest of the file.
  const tplStack: number[] = [];
  const inTemplateText = () => tplStack.length > 0 && tplStack[tplStack.length - 1] === 0;
  while (i < n) {
    const c = src[i];
    const c2 = src[i + 1];
    if (c === '\\') { i += 2; continue; }

    if (inTemplateText()) {
      if (c === '`') { tplStack.pop(); i++; continue; }
      if (c === '$' && c2 === '{') { tplStack[tplStack.length - 1]++; i += 2; continue; }
      i++;
      continue;
    }

    // Code context (top level, or inside a `${…}` substitution).
    if (c === '/' && c2 === '/') {
      while (i < n && src[i] !== '\n') { out[i] = ' '; i++; }
      continue;
    }
    if (c === '/' && c2 === '*') {
      out[i] = ' '; out[i + 1] = ' '; i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) {
        if (src[i] !== '\n') out[i] = ' ';
        i++;
      }
      if (i < n) { out[i] = ' '; out[i + 1] = ' '; i += 2; }
      continue;
    }
    if (c === "'" || c === '"') {
      const q = c; i++;
      while (i < n && src[i] !== q) {
        if (src[i] === '\\') { i += 2; continue; }
        if (src[i] === '\n') break;
        i++;
      }
      i++;
      continue;
    }
    if (c === '`') { tplStack.push(0); i++; continue; }
    if (tplStack.length > 0) {
      if (c === '{') { tplStack[tplStack.length - 1]++; i++; continue; }
      if (c === '}') {
        tplStack[tplStack.length - 1]--;
        i++;
        continue;
      }
    }
    i++;
  }
  return out.join('');
}

/**
 * Given the index of a backtick, return the template body (exclusive of the
 * delimiting backticks) and the index just past the closing backtick.
 * Handles escapes, `${…}` with nested braces, and nested template literals.
 */
export function readTemplate(src: string, tickIdx: number): { body: string; end: number } {
  let i = tickIdx + 1;
  const n = src.length;
  let depth = 0; // `${` brace depth
  const start = i;
  while (i < n) {
    const c = src[i];
    if (c === '\\') { i += 2; continue; }
    if (depth === 0 && c === '`') return { body: src.slice(start, i), end: i + 1 };
    if (c === '$' && src[i + 1] === '{') { depth++; i += 2; continue; }
    if (depth > 0) {
      if (c === '`') { const inner = readTemplate(src, i); i = inner.end; continue; }
      if (c === "'" || c === '"') {
        const q = c; i++;
        while (i < n && src[i] !== q) { if (src[i] === '\\') i++; i++; }
        i++;
        continue;
      }
      if (c === '{') { depth++; i++; continue; }
      if (c === '}') { depth--; i++; continue; }
    }
    i++;
  }
  return { body: src.slice(start), end: n };
}

/**
 * Extract every top-level `${…}` expression from a template BODY, with correct
 * brace balancing (object literals, arrow bodies, nested templates, ternaries).
 * Nested templates contribute their own interpolations too, so an unguarded
 * value inside a nested template is still reported.
 */
export function extractInterpolations(body: string): string[] {
  const out: string[] = [];
  let i = 0;
  const n = body.length;
  while (i < n) {
    const c = body[i];
    if (c === '\\') { i += 2; continue; }
    if (c === '$' && body[i + 1] === '{') {
      const start = i + 2;
      let j = start;
      let depth = 1;
      while (j < n && depth > 0) {
        const d = body[j];
        if (d === '\\') { j += 2; continue; }
        if (d === '`') { const t = readTemplate(body, j); out.push(...extractInterpolations(t.body)); j = t.end; continue; }
        if (d === "'" || d === '"') {
          const q = d; j++;
          while (j < n && body[j] !== q) { if (body[j] === '\\') j++; j++; }
          j++;
          continue;
        }
        if (d === '{') depth++;
        else if (d === '}') { depth--; if (depth === 0) break; }
        j++;
      }
      out.push(body.slice(start, j).trim());
      i = j + 1;
      continue;
    }
    i++;
  }
  return out;
}

// ── Expression safety classification ─────────────────────────────────────────

/**
 * Detect HTML escapers DECLARED IN THIS FILE, so their local names count as
 * guards for this file only.
 *
 * Why per-file and not a global name list: `escape(` resolves to the DEPRECATED
 * global URL escaper in any file that does not declare its own — which does not
 * neutralise `<`, `>` or `"` at all. Accepting the bare name globally would turn
 * a live XSS sink into a green tick. A local `function escape(s) { … &amp; … }`
 * (TrustPage/PricingPage) is a real escaper; the global is not, and only the
 * declaring file gets the benefit of the doubt.
 *
 * Recognised shapes (name followed within ~700 chars by entity-encoding
 * evidence, or by a delegation to an already-recognised guard):
 *   function esc(s) { return s.replace(/&/g,'&amp;')… }
 *   private escape(value: string): string { … }
 *   private _escHtml(str: string): string { … }
 *   const esc = (s: string) => this.escHtml(s);
 */
export function detectLocalGuards(src: string): string[] {
  const names = new Set<string>();
  const decl = /\b(?:function|const|let|var|private|public|protected|readonly|static)\s+([A-Za-z_$][\w$]*)/g;
  let m: RegExpExecArray | null;
  while ((m = decl.exec(src)) !== null) {
    const name = m[1];
    if (!/esc|sanit|purif/i.test(name)) continue;
    const window = src.slice(m.index, m.index + 700);
    const encodes = window.includes('&amp;') && (window.includes('&lt;') || window.includes('&#39;'));
    const delegates = GUARD_CALLS.some((g) => window.includes(g + '('));
    if (encodes || delegates) names.add(name);
  }
  return [...names];
}

/** Remove every balanced `guard(...)` call from an expression. */
export function stripGuardCalls(expr: string, localGuards: readonly string[] = []): string {
  let out = expr;
  for (const guard of [...GUARD_CALLS, ...localGuards]) {
    for (;;) {
      const idx = out.indexOf(guard + '(');
      if (idx === -1) break;
      // Must be a call, not the tail of a longer identifier. A `.` prefix IS
      // accepted — `this.escHtml(x)` / `helpers.escapeHtml(x)` are the same
      // guard reached as a method (PlatformProjectBrowser's private escHtml).
      const prev = idx > 0 ? out[idx - 1] : '';
      if (/[A-Za-z0-9_$]/.test(prev) && !guard.includes('.')) {
        // e.g. `myEscHtml(` — not our guard; bail to avoid an infinite loop
        break;
      }
      let j = idx + guard.length; // at '('
      let depth = 0;
      for (; j < out.length; j++) {
        const c = out[j];
        if (c === '(') depth++;
        else if (c === ')') { depth--; if (depth === 0) { j++; break; } }
        else if (c === "'" || c === '"' || c === '`') {
          const q = c; j++;
          while (j < out.length && out[j] !== q) { if (out[j] === '\\') j++; j++; }
        }
      }
      // Consume the receiver too (`this.escHtml(x)` → nothing, not `this.`).
      let start = idx;
      if (start > 0 && out[start - 1] === '.') {
        let k = start - 1;
        while (k > 0 && /[A-Za-z0-9_$.]/.test(out[k - 1])) k--;
        start = k;
      }
      out = out.slice(0, start) + out.slice(j);
    }
  }
  return out;
}

const NUMERIC_PATTERNS: RegExp[] = [
  /^\d+(\.\d+)?$/,
  /^[A-Za-z0-9_$.[\]']+\.(toFixed|toLocaleString|toPrecision|toString)\(/,
  /^(Number|parseInt|parseFloat|Math\.[a-z]+)\s*\(/,
  /^[A-Za-z0-9_$.[\]']+\.length$/,
  /^[-+]?[\d.\s*/+()]+$/,
];

/**
 * A whole-expression string LITERAL. Author-written source is trusted — a
 * static `${'<span class="x">…</span>'}` is markup the developer typed, not
 * injected data — so `<`/`>` are allowed here, unlike in a runtime value.
 * Concatenations and interpolating templates are deliberately NOT matched.
 */
export function isStaticLiteral(v: string): boolean {
  const t = v.trim();
  return /^'(?:[^'\\]|\\.)*'$/.test(t)
    || /^"(?:[^"\\]|\\.)*"$/.test(t)
    || (/^`(?:[^`\\]|\\.)*`$/.test(t) && !t.includes('${'));
}

/** True when the expression embeds a template literal outside of a string. */
export function containsTemplateLiteral(expr: string): boolean {
  for (let i = 0; i < expr.length; i++) {
    const c = expr[i];
    if (c === '\\') { i++; continue; }
    if (c === '`') return true;
    if (c === "'" || c === '"') {
      const q = c; i++;
      while (i < expr.length && expr[i] !== q) { if (expr[i] === '\\') i++; i++; }
    }
  }
  return false;
}

/**
 * Classify a single `${…}` expression. SAFE means the value provably cannot
 * introduce markup. Everything else is UNSAFE and must be baselined or guarded.
 */
export function isSafeExpression(rawExpr: string, localGuards: readonly string[] = []): boolean {
  const expr = rawExpr.trim();
  if (expr === '') return true;

  // 1. Guard-wrapped: remove the guarded parts, then judge what is left.
  const residual = stripGuardCalls(expr, localGuards).trim();
  if (residual !== expr) {
    // Leftovers may only be operators / whitespace / inert literals.
    const cleaned = residual.replace(/['"`][^'"`]*['"`]/g, '').trim();
    if (/^[\s+?:()|&,]*$/.test(cleaned)) return true;
    return isSafeExpression(residual, localGuards);
  }

  // 2. Wave-A14 convention: a `safeXxx` variable was escaped before assignment.
  if (/^safe[A-Z_]/.test(expr)) return true;

  // 2b. TEMPLATE CONTAINER. The expression embeds a template literal — a nested
  //     markup builder such as `${rows.map(r => `<tr>…${r.name}…</tr>`).join('')}`
  //     or `${this._section('Title', `<button …>`)}`. Every `${…}` inside those
  //     nested templates is extracted and classified INDEPENDENTLY by
  //     `extractInterpolations`, so classifying the container too would double-
  //     report the same value. Trade-off: a raw value passed as a sibling
  //     NON-template argument is not judged here; it is judged wherever that
  //     helper interpolates it.
  if (containsTemplateLiteral(expr)) return true;

  // 3. Whole-expression static literal (author-written markup is trusted).
  if (isStaticLiteral(expr)) return true;

  // 4. Numeric / arithmetic.
  if (NUMERIC_PATTERNS.some((p) => p.test(expr))) return true;

  // 5. Boolean/comparison result.
  if (/^[A-Za-z0-9_$.[\]]+\s*(===|!==|==|!=|>=|<=|>|<)\s*[A-Za-z0-9_$.'"[\]]+$/.test(expr)) return true;

  // 6. SCREAMING_CONST.prop — module-level style/colour constant tables.
  if (/^[A-Z_][A-Z0-9_]*(\.[A-Za-z0-9_]+)+$/.test(expr)) return true;

  // 7. Ternary/`||`/`??` whose every branch is itself safe.
  const branches = splitTopLevelBranches(expr);
  if (branches && branches.every((b) => isSafeExpression(b, localGuards))) return true;

  return false;
}

/**
 * Split a ternary / `||` / `??` expression into its value-producing branches
 * (the condition is discarded — it is not interpolated). Returns null when the
 * expression is not a branch form.
 */
export function splitTopLevelBranches(expr: string): string[] | null {
  let depth = 0;
  let qIdx = -1;
  for (let i = 0; i < expr.length; i++) {
    const c = expr[i];
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') depth--;
    else if (c === "'" || c === '"' || c === '`') {
      const q = c; i++;
      while (i < expr.length && expr[i] !== q) { if (expr[i] === '\\') i++; i++; }
    } else if (depth === 0 && c === '?' && expr[i + 1] !== '.' && expr[i + 1] !== '?') { qIdx = i; break; }
  }
  if (qIdx !== -1) {
    // find the matching ':' at depth 0
    let d = 0;
    for (let i = qIdx + 1; i < expr.length; i++) {
      const c = expr[i];
      if (c === '(' || c === '[' || c === '{') d++;
      else if (c === ')' || c === ']' || c === '}') d--;
      else if (c === "'" || c === '"' || c === '`') {
        const q = c; i++;
        while (i < expr.length && expr[i] !== q) { if (expr[i] === '\\') i++; i++; }
      } else if (d === 0 && c === '?') {
        // nested ternary in the then-branch — let recursion handle the whole tail
        break;
      } else if (d === 0 && c === ':') {
        return [expr.slice(qIdx + 1, i).trim(), expr.slice(i + 1).trim()];
      }
    }
    return null;
  }
  // `a || b` / `a ?? b`
  let d = 0;
  for (let i = 0; i < expr.length - 1; i++) {
    const c = expr[i];
    if (c === '(' || c === '[' || c === '{') d++;
    else if (c === ')' || c === ']' || c === '}') d--;
    else if (c === "'" || c === '"' || c === '`') {
      const q = c; i++;
      while (i < expr.length && expr[i] !== q) { if (expr[i] === '\\') i++; i++; }
    } else if (d === 0 && ((c === '|' && expr[i + 1] === '|') || (c === '?' && expr[i + 1] === '?'))) {
      return [expr.slice(0, i).trim(), expr.slice(i + 2).trim()];
    }
  }
  return null;
}

// ── Source scanning ──────────────────────────────────────────────────────────

interface SinkSpec {
  kind: SinkKind;
  /** Matches at the sink site; group semantics documented per spec. */
  re: RegExp;
  /** Where the HTML value starts relative to the match end. */
  valueAt: 'after-equals' | 'in-args';
}

const SINK_SPECS: SinkSpec[] = [
  { kind: 'innerHTML', re: /\.innerHTML\s*\+?=/g, valueAt: 'after-equals' },
  { kind: 'outerHTML', re: /\.outerHTML\s*\+?=/g, valueAt: 'after-equals' },
  { kind: 'srcdoc', re: /\.srcdoc\s*\+?=/g, valueAt: 'after-equals' },
  { kind: 'insertAdjacentHTML', re: /\.insertAdjacentHTML\s*\(/g, valueAt: 'in-args' },
  { kind: 'document.write', re: /\bdocument\s*\.\s*write(?:ln)?\s*\(/g, valueAt: 'in-args' },
  { kind: 'createContextualFragment', re: /\.createContextualFragment\s*\(/g, valueAt: 'in-args' },
  { kind: 'dangerouslySetInnerHTML', re: /dangerouslySetInnerHTML/g, valueAt: 'in-args' },
  { kind: 'eval', re: /(?:^|[^\w.$])eval\s*\(/g, valueAt: 'in-args' },
  { kind: 'new Function', re: /\bnew\s+Function\s*\(/g, valueAt: 'in-args' },
];

function lineOf(src: string, idx: number): number {
  let line = 1;
  for (let i = 0; i < idx && i < src.length; i++) if (src[i] === '\n') line++;
  return line;
}

/**
 * Read an assignment right-hand side from `start` up to the statement-ending
 * `;` at bracket depth 0, skipping over string and template literals so a `;`
 * inside e.g. an inline CSS string never terminates it early.
 */
export function readStatementRhs(src: string, start: number): string {
  let i = start;
  let depth = 0;
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === '\\') { i++; continue; }
    if (c === '`') { i = readTemplate(src, i).end - 1; continue; }
    if (c === "'" || c === '"') {
      const q = c; i++;
      while (i < src.length && src[i] !== q) { if (src[i] === '\\') i++; i++; }
      continue;
    }
    if (c === '(' || c === '[' || c === '{') { depth++; continue; }
    if (c === ')' || c === ']' || c === '}') { if (depth === 0) break; depth--; continue; }
    if (c === ';' && depth === 0) break;
  }
  return src.slice(start, i);
}

/** Read the balanced argument list starting at the '(' index. */
function readArgs(src: string, parenIdx: number): string {
  let i = parenIdx;
  let depth = 0;
  const start = parenIdx + 1;
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === '(') depth++;
    else if (c === ')') { depth--; if (depth === 0) return src.slice(start, i); }
    else if (c === '`') { i = readTemplate(src, i).end - 1; }
    else if (c === "'" || c === '"') {
      const q = c; i++;
      while (i < src.length && src[i] !== q) { if (src[i] === '\\') i++; i++; }
    }
  }
  return src.slice(start);
}

/**
 * Scan one source file for unguarded HTML-sink interpolations.
 *
 * `relPath` is used verbatim in the findings (repo-relative, forward slashes).
 */
export function scanSource(relPath: string, rawSrc: string): SinkFinding[] {
  const findings: SinkFinding[] = [];
  const src = blankComments(rawSrc);
  const localGuards = detectLocalGuards(src);

  for (const spec of SINK_SPECS) {
    spec.re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = spec.re.exec(src)) !== null) {
      const sinkIdx = m.index;
      const afterIdx = m.index + m[0].length;
      const line = lineOf(src, sinkIdx);
      const text = (rawSrc.split('\n')[line - 1] ?? '').trim().slice(0, 140);

      let value: string;
      let isTemplate = false;
      if (spec.valueAt === 'after-equals') {
        let j = afterIdx;
        while (j < src.length && /\s/.test(src[j])) j++;
        if (src[j] === '`') { value = readTemplate(src, j).body; isTemplate = true; }
        else {
          // Non-template RHS (a string literal, a variable, a call, a
          // concatenation). Read to the statement-terminating `;` — one that is
          // NOT inside a string/template/bracket, otherwise a `;` inside a CSS
          // string truncates the literal and it is misreported as unsafe.
          value = readStatementRhs(src, j);
        }
      } else {
        const parenIdx = src.indexOf('(', afterIdx - 1);
        value = parenIdx === -1 ? '' : readArgs(src, parenIdx);
        isTemplate = value.includes('`');
      }

      if (ZERO_TOLERANCE_SINKS.has(spec.kind)) {
        // Constant-argument `new Function` / `eval` is the dynamic-import escape
        // hatch, not a sink: no interpolation, no runtime-built code.
        const argsOnly = value.replace(/\s/g, '');
        const allLiteral = /^(['"][^'"]*['"],?)+$/.test(argsOnly);
        if ((spec.kind === 'new Function' || spec.kind === 'eval') && allLiteral) continue;
        findings.push({ file: relPath, line, kind: spec.kind, expr: '', text });
        continue;
      }

      if (isTemplate) {
        const exprs = spec.valueAt === 'in-args'
          ? extractInterpolationsFromArgs(value)
          : extractInterpolations(value);
        for (const expr of exprs) {
          if (!isSafeExpression(expr, localGuards)) {
            findings.push({ file: relPath, line, kind: spec.kind, expr: expr.slice(0, 120), text });
          }
        }
      } else if (spec.valueAt === 'after-equals') {
        const rhs = value.trim();
        if (rhs !== '' && !isSafeExpression(rhs, localGuards)) {
          findings.push({ file: relPath, line, kind: spec.kind, expr: rhs.slice(0, 120), text });
        }
      } else {
        // Non-template call argument (`document.write(html)`,
        // `insertAdjacentHTML('beforeend', buildRow(x))`). Safe only when every
        // argument is a literal; a bare identifier or call carries unknown markup.
        const withoutLiterals = value.replace(/'[^']*'|"[^"]*"/g, '');
        if (/[A-Za-z_$]/.test(withoutLiterals)) {
          findings.push({ file: relPath, line, kind: spec.kind, expr: value.trim().slice(0, 120), text });
        }
      }
    }
  }
  return findings;
}

/** Pull every template literal out of an argument list and union its interpolations. */
function extractInterpolationsFromArgs(args: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const c = args[i];
    if (c === '`') { const t = readTemplate(args, i); out.push(...extractInterpolations(t.body)); i = t.end - 1; }
    else if (c === "'" || c === '"') {
      const q = c; i++;
      while (i < args.length && args[i] !== q) { if (args[i] === '\\') i++; i++; }
    }
  }
  return out;
}
