// ─── The host-reference construction-site sweeper, shared by two gates ───────
//
// `check-region-reference-frame` (C79 §3) and `check-region-fallback-populated`
// (C79 §4.3) ask two different questions about the SAME objects: every place in
// the tree where a `HostReferenceEdge` object literal is CONSTRUCTED. Two copies
// of the finder would be the second-copy disease C79 §6.5 forbids — and, worse,
// two copies that drift mean one gate's subject silently stops matching while the
// other's keeps working, and the divergence reads as "that gate is clean".
//
// WHAT COUNTS AS A CONSTRUCTION SITE. An object literal containing the
// discriminant `type: 'hostReference'`. That is a deliberately narrow, syntactic
// definition, and it is narrow for a reason: a WIDE heuristic ("anything with a
// hostId near a reference") would match type declarations, docstrings, test
// fixtures and this comment. A false POSITIVE in a HARD-0 gate is the worst
// failure available — it would report a violation that is not there, and both
// gates' entire authority is that their findings are real. Comments are stripped
// before matching for exactly the same reason.
//
// THE COST OF THE NARROWNESS, STATED: a site that builds the edge field-by-field
// (`const e: HostReferenceEdge = {}; e.reference = …`) is INVISIBLE to this
// sweeper. No such site exists in the tree today — the floor in
// region-edge-sites.json is what notices if the ones that do exist disappear —
// but the limit is real and is not papered over.

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { collectSources } from './scan.js';

export interface EdgeSite {
  /** repo-relative path */
  rel: string;
  /** 1-based line of the `type: 'hostReference'` discriminant */
  line: number;
  /** the object-literal text, brace to matching brace */
  literal: string;
  /** the `reference:` value named in the literal, if any */
  reference: string | null;
  /**
   * The literal HAS a `reference:` key, but bound to an EXPRESSION rather than a
   * string literal (`reference: edge.reference`). Such a site FORWARDS a frame
   * someone else chose; it does not choose one. See §FORWARDING-IS-NOT-CHOOSING
   * in check-region-reference-frame.ts — distinguishing this from "no reference
   * key at all" is what separates a translation from an unreadable shape.
   */
  referenceIsForwarded: boolean;
  /** the `offset:` value named in the literal, if any (as written) */
  offset: string | null;
  /** whether a `fallback` is set in the literal itself */
  fallbackInLiteral: boolean;
  /** whether a `fallback` is assigned to the edge anywhere in the same file */
  fallbackInFile: boolean;
}

/**
 * A site that FORWARDS a reference frame rather than choosing one, together with
 * the file where that frame IS policed. This is a REDIRECTION of the check, not
 * an exemption: the gate fails if `policedBy` stops carrying `guard`.
 */
export interface ForwardingSite {
  site: string;
  why: string;
  policedBy: string;
  /** Regex source that MUST match the policing file, comments stripped. */
  guard: string;
}

export interface SiteLedger {
  tracedFrame: string;
  tracedOffset: number;
  forbiddenForTracedFrame: string[];
  edgeDiscriminant: string;
  sweepRoots: string[];
  minConstructionSites: number;
  previewOnlySites: string[];
  forwardingSites?: ForwardingSite[];
  fallbackFieldNames: string[];
  typeSource: string;
}

export function loadSiteLedger(path: string): SiteLedger | null {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf8')) as SiteLedger;
}

/** Strip line and block comments so prose never counts as a construction site. */
function stripComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/.*$/gm, (m, p1: string) => p1 + ' '.repeat(Math.max(0, m.length - p1.length)));
}

/** Walk outward from an index to the enclosing `{ … }` literal. */
function enclosingLiteral(text: string, at: number): string {
  let start = at;
  let depth = 0;
  for (let i = at; i >= 0; i--) {
    if (text[i] === '}') depth++;
    else if (text[i] === '{') {
      if (depth === 0) { start = i; break; }
      depth--;
    }
  }
  depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}') { depth--; if (depth === 0) return text.slice(start, i + 1); }
  }
  return text.slice(start, Math.min(text.length, start + 800));
}

/**
 * Sweep for every `HostReferenceEdge` construction site.
 *
 * Comment text is BLANKED (not deleted) rather than removed, so byte offsets are
 * preserved and reported line numbers point at the real line in the real file.
 */
export function findEdgeSites(repoRoot: string, ledger: SiteLedger): EdgeSite[] {
  const disc = new RegExp(`type\\s*:\\s*['"\`]${ledger.edgeDiscriminant}['"\`]`, 'g');
  const sites: EdgeSite[] = [];

  for (const f of collectSources(repoRoot, ledger.sweepRoots)) {
    if (!f.text.includes(ledger.edgeDiscriminant)) continue;
    const code = stripComments(f.text);
    disc.lastIndex = 0;
    for (let m = disc.exec(code); m !== null; m = disc.exec(code)) {
      const literal = enclosingLiteral(code, m.index);
      // A TYPE declaration (`type: 'hostReference';` inside an interface) is not a
      // construction. Interfaces end their members with `;`, literals with `,`.
      if (/interface\s+\w+[^{]*\{[^}]*$/.test(code.slice(Math.max(0, m.index - 400), m.index))) continue;
      const ref = /reference\s*:\s*['"`]([^'"`]+)['"`]/.exec(literal);
      const off = /offset\s*:\s*([^,\n}]+)/.exec(literal);
      sites.push({
        rel: f.rel,
        line: code.slice(0, m.index).split('\n').length,
        literal,
        reference: ref ? ref[1]! : null,
        // A `reference:` key that is present but NOT a string literal is a
        // forwarded frame, not an unreadable one. The two must not print the same.
        referenceIsForwarded: ref === null && /\breference\s*:/.test(literal),
        offset: off ? off[1]!.trim() : null,
        fallbackInLiteral: ledger.fallbackFieldNames.some((n) => new RegExp(`\\b${n}\\s*:`).test(literal)),
        fallbackInFile: ledger.fallbackFieldNames.some((n) => new RegExp(`\\.${n}\\s*=|\\b${n}\\s*:`).test(code)),
      });
    }
  }
  return sites;
}

export function repoRootFrom(dir: string): string {
  return resolve(dir, '../../../..');
}
