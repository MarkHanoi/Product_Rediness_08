/**
 * tools/ga-gate/lib/acceptanceCorpus.ts
 *
 * Reads the ACCEPTANCE SUITE as DATA, so the gate can execute what the suite
 * declares without owning a second copy of it.
 *
 * ─── Why parse instead of import ─────────────────────────────────────────────
 * `packages/ai-host/__tests__/capability-acceptance.test.ts` is a vitest module:
 * importing it calls `describe`/`it` at module scope and throws outside a vitest
 * runner. Extracting the corpus into a shared data module would be the cleaner
 * shape, but that file is owned by the live U9 tranche and the gate must not
 * take an edit lock on it. So the gate reads the source text and lifts three
 * literal tables out of it:
 *
 *   • the acceptance FAMILIES (`{ id, ctx, phrasings }`) — which capability each
 *     family covers, the selection context it declares, and its phrasings;
 *   • the ADVERSARIAL corpus — the `it.each([...])` string list in the
 *     `describe('adversarial — …')` block: utterances that must never mutate;
 *   • the wall-type FIXTURE (`WALL_TYPES`), so a gate-side context can offer the
 *     same catalogue names the suite does rather than a sanitised invention.
 *
 * ─── What this parser CANNOT see, stated plainly ─────────────────────────────
 * It reads LITERALS. A phrasing built by concatenation, a family pushed in a
 * loop, or an adversarial case declared outside the `it.each` array is
 * invisible to it. That is acceptable because the failure mode is
 * under-counting (the gate checks fewer sentences than the suite does), never
 * over-claiming — and the family/adversarial counts are printed on every run so
 * a silent drop to zero is visible rather than green.
 */

import { readFileSync } from 'node:fs';

export interface AcceptanceFamily {
  readonly id: string;
  /** The element kind the family's `ctx: sel('kind')` selects, or null for `{}`. */
  readonly selectionKind: string | null;
  /**
   * RAC U9.2 — the family declares `scoped: true`, meaning its ctx injects a
   * `resolveScope`. The parser reads LITERALS, so it cannot see the resolver
   * itself (it may be built by a helper); this flag is how the suite TELLS the
   * gate, in one word, that spatial examples in this family are meant to
   * resolve. Without it a spatially-scoped example can only ever be counted as
   * "refused: spatial scoping isn't wired into this chat context", which says
   * something about the harness and nothing about the capability.
   */
  readonly declaresScopeResolver: boolean;
  readonly phrasings: readonly string[];
}

export interface AcceptanceCorpus {
  readonly families: readonly AcceptanceFamily[];
  readonly adversarial: readonly string[];
  readonly wallTypes: readonly { id: string; name: string }[];
}

/** Strip line comments and block comments so commented-out literals are not
 *  mistaken for declarations. Deliberately naive: it does not understand
 *  strings containing `//`, so it also drops the tail of such a line. No
 *  acceptance literal in this suite contains `//`, and the count print would
 *  expose it if one ever did. */
function decomment(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

/** All single-quoted / double-quoted string literals in a slice, in order. */
function stringLiterals(slice: string): string[] {
  const out: string[] = [];
  const re = /'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(slice)) !== null) {
    const raw = m[1] ?? m[2] ?? '';
    out.push(raw.replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\\\/g, '\\'));
  }
  return out;
}

/** The slice from `open` (an index pointing AT a bracket) to its match. */
function balancedSlice(src: string, openIdx: number, open: string, close: string): string {
  let depth = 0;
  for (let i = openIdx; i < src.length; i += 1) {
    const ch = src[i];
    if (ch === open) depth += 1;
    else if (ch === close) {
      depth -= 1;
      if (depth === 0) return src.slice(openIdx, i + 1);
    }
  }
  return src.slice(openIdx);
}

function parseFamilies(src: string): AcceptanceFamily[] {
  const out: AcceptanceFamily[] = [];
  // Every family object literal starts with an `id:` key and carries a
  // `phrasings: [` array. Anchor on `id:` and take the balanced object.
  const re = /\{\s*id:\s*'([a-z0-9-]+)'/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const obj = balancedSlice(src, m.index, '{', '}');
    const pIdx = obj.indexOf('phrasings:');
    if (pIdx === -1) continue;
    const arrIdx = obj.indexOf('[', pIdx);
    if (arrIdx === -1) continue;
    const phrasings = stringLiterals(balancedSlice(obj, arrIdx, '[', ']'));
    // `ctx: sel('wall')` | `ctx: sel('door', 'x')` | `ctx: {}`
    // `ctx: sel('wall')` | `ctx: sel('door', 'x')` | `ctx: helper('furniture')`
    const ctxMatch = /ctx:\s*\w+\(\s*'([a-z-]+)'/.exec(obj);
    out.push({
      id: m[1]!,
      selectionKind: ctxMatch === null ? null : ctxMatch[1]!,
      declaresScopeResolver: /scoped:\s*true/.test(obj),
      phrasings,
    });
  }
  return out;
}

function parseAdversarial(src: string): string[] {
  const dIdx = src.search(/describe\(\s*'adversarial/);
  if (dIdx === -1) return [];
  const block = balancedSlice(src, src.indexOf('{', dIdx), '{', '}');
  const eachIdx = block.search(/it\.each\(/);
  if (eachIdx === -1) return [];
  const arrIdx = block.indexOf('[', eachIdx);
  if (arrIdx === -1) return [];
  return stringLiterals(balancedSlice(block, arrIdx, '[', ']'));
}

function parseWallTypes(src: string): { id: string; name: string }[] {
  const i = src.indexOf('const WALL_TYPES');
  if (i === -1) return [];
  const arr = balancedSlice(src, src.indexOf('[', i), '[', ']');
  const out: { id: string; name: string }[] = [];
  const re = /\{\s*id:\s*'([^']+)'\s*,\s*name:\s*'([^']+)'\s*\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(arr)) !== null) out.push({ id: m[1]!, name: m[2]! });
  return out;
}

export function readAcceptanceCorpus(specPath: string): AcceptanceCorpus {
  // §GATE-CRASH-IS-MISCONFIG (2026-08-11, C9). An unreadable corpus threw a raw
  // ENOENT, which node reports as EXIT 1 — the same code a real coverage failure
  // produces, and the one gate-debt.json is allowed to absorb. "I could not open
  // the acceptance corpus" and "the chat capabilities are undeclared" are different
  // facts (L-811 / L-827): the first is exit 2 and is never absorbable.
  let raw: string;
  try {
    raw = readFileSync(specPath, 'utf8');
  } catch (err) {
    console.error(
      `\n[acceptance-corpus] MISCONFIGURED (exit 2) — cannot read the acceptance corpus: ${specPath}`
      + `\n  cwd: ${process.cwd()}`
      + `\n  ${(err as Error).message.split('\n')[0]}`
      + `\n  Every example, adversarial utterance and wall-type pin is read from this file. Without it`
      + `\n  the caller's proofs pass vacuously. This is NOT a pass.`,
    );
    process.exit(2);
  }
  const src = decomment(raw);
  return {
    families: parseFamilies(src),
    adversarial: parseAdversarial(src),
    wallTypes: parseWallTypes(src),
  };
}
