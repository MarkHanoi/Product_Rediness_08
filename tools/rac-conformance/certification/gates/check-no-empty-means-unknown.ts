// ─── GATE · check-no-empty-means-unknown  (C78 §20, U-INV-4) ─────────────────
//
// THE INVARIANT (C78 §19 U-INV-4, specified by §1.4 and §5):
//   **"Unaffected" is never inferred from missing data.** An empty index, an
//   absent field, a `?? []`, an unregistered planner and a caught exception are
//   **UNDETERMINED**, never DETERMINED-unaffected.
//
// C78 §20's floor for this gate is *"discovery sites scanned > 0"* and its exit
// condition is *"no `?? []`, `?.` or catch-arm on a discovery path collapses
// failure into emptiness"*. It was a NAMED GAP at stamp time (§20.1).
//
// ─── The defect family, by its two measured instances ────────────────────────
// (1) `sg.getEdgesFromNode?.(room.id) ?? []` in HierarchyTreePanel — a method
//     `SemanticGraphManager` HAS NEVER HAD. The optional call evaluated to
//     `undefined` on every invocation, `?? []` turned that into "this room
//     contains nothing", and **the Furniture group therefore never rendered**.
//     A call that can never succeed and an honestly empty room printed the same
//     value, so the bug was invisible for as long as it existed. (Now fixed at
//     that site — the FAMILY is what this gate measures.)
// (2) `RECONCILABLE_TYPES` exported with zero consumers — the same shape seen
//     from the other end: machinery that answers nobody.
//
// The rule this encodes is C70 L-INV-1 and `consequence.ts:36-38`'s founding
// sentence: *"'I found nothing' and 'I could not look' are never the same
// value."*
//
// ─── WHAT IT DECIDES — three arms ────────────────────────────────────────────
//   ARM A · CATCH-TO-EMPTY. A `catch` arm whose body returns an empty
//           collection is **ALWAYS a finding** — no exception. A throw is by
//           definition "I could not look"; converting it to `[]` asserts "I
//           looked and found nothing", which is a different fact. This arm needs
//           no relationship scoping to be correct in principle, but IS scoped
//           (see below) so the ledger stays about C78's subject.
//   ARM B · OPTIONAL-CALL-TO-EMPTY. `x?.method?.(…) ?? []` — where the METHOD
//           itself is optional-called — is **ALWAYS a finding**: it is exactly
//           instance (1). `?.()` on a method means the author does not know
//           whether the method exists, and `?? []` then makes "the method is
//           missing" indistinguishable from "the method returned nothing".
//           `x?.method(…)` (optional OBJECT, definite method) is NOT flagged by
//           this arm: a null object is a different and often legitimate case.
//   ARM C · BARE-OR-EMPTY. `expr || []` and `expr ?? []` on a
//           relationship-answering expression, where the left side is a plain
//           call or member access. This is the WEAKEST arm — a genuinely
//           optional field defaulting to empty can be legitimate — so it is
//           reported SEPARATELY and its residual doubt is printed as UNPROVEN
//           rather than hidden inside the count.
//
// ─── LEGITIMATE-EMPTY vs SWALLOWED-FAILURE (the task's hard part) ────────────
// The discriminator is not the shape of `[]`; it is **whether the branch that
// produced it could have been a FAILURE**. Three rules, applied in order:
//   · A `catch` arm is a failure branch BY CONSTRUCTION → always a finding.
//   · An OPTIONAL-CALLED METHOD may not exist → its absence is a failure →
//     always a finding.
//   · Everything else is a possible legitimate empty, so it must additionally
//     be on a RELATIONSHIP/DEPENDENCY/GRAPH question path to be counted — and
//     even then it is the arm whose doubt is declared.
// A site that is a `getAll()` over a whole store is NOT a relationship question
// and is excluded: "give me every wall" answering `[]` on an empty project is
// honest. The exclusion list is printed on every run so a reader can see
// exactly what was set aside, per C70 §5.5.
//
// ─── SCOPE ───────────────────────────────────────────────────────────────────
// Production `src` only (`collectSources` excludes .test/.spec/.cert and
// node_modules/dist). Sites must name a relationship/dependency/graph question
// via RELATIONSHIP_RE — the gate is C78's, not a repo-wide `?? []` census, and
// widening it to every array default would drown the named ledger in sites no
// contract governs.
//
// ─── CONTROLS (executed, both directions, every run — C78 §20.3 / C70 §5.6) ──
// selfTest() drives the SAME analyser over synthetics: the exact
// `getEdgesFromNode?.(room.id) ?? []` line MUST be flagged; `catch { return []; }`
// on a graph path MUST be flagged; a legitimate `catch { return []; }` that
// RETHROWS or reports MUST NOT be silently equated with it; an honest empty
// literal `const out: Edge[] = [];` MUST NOT be flagged; and a flagged shape
// inside a COMMENT MUST NOT be flagged (the HierarchyTreePanel file documents
// the old defect in prose — a gate that counted that would be measuring its own
// changelog). A control that fails exits 2.
//
// Exit 0 clean · 1 declared · 2 MISCONFIGURED · 3 exceeded — contract.ts,
// imported, never copied.

import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { reportGate, type Floor } from '../contract.js';
import { collectSources } from './scan.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, '../../../..');
const LEDGER_PATH = resolve(__dirname, 'no-empty-means-unknown-debt.json');

interface LedgerRow { site: string; arm: string; why: string }
interface Ledger { swallowed: LedgerRow[] }

/**
 * A relationship / dependency / graph QUESTION — C78 §3.2's scope: a C71
 * vocabulary member, or a store field naming another element. Deliberately
 * expressed over the CALL being defaulted, not over the file, so that a
 * relationship question inside a large unrelated file is still seen.
 */
const RELATIONSHIP_RE =
  /(Edges?|Relationship|Depend|Graph|Affected|Hosted|Hosts|Joined|Bounding|BoundedBy|Adjacent|Neighbou|Connect|SitsOn|Supports|Contains|PartOf|ForWall|ForRoom|ForHost|ForSlab|ForLevel|ByHost|ByWall|ByRoom|BySlab|Targets|Sources|Children|Parents|Openings?)/i;

/**
 * Whole-store enumerations. "Give me every X" answering `[]` on an empty
 * project is an HONEST empty, not a swallowed failure, so these are excluded
 * from ARM C — and the exclusions are printed, never silent.
 */
const WHOLE_STORE_RE = /\b(getAll|getAllFor(Level|Project)|getLevels|getByLevel)\b/;

interface Site { file: string; line: number; arm: 'A' | 'B' | 'C'; text: string; key: string }

// ── Comment-stripping (line-preserving, so line numbers stay true) ───────────
export function stripComments(src: string): string {
  let inBlock = false;
  return src.split('\n').map((line) => {
    let res = '';
    for (let i = 0; i < line.length; i++) {
      if (inBlock) {
        if (line.startsWith('*/', i)) { inBlock = false; i++; }
        continue;
      }
      if (line.startsWith('/*', i)) { inBlock = true; i++; continue; }
      if (line.startsWith('//', i)) break;
      res += line[i];
    }
    return res;
  }).join('\n');
}

/** An empty-collection literal used as an answer. */
const EMPTY_ANSWER = /(\[\s*\]|new (?:Map|Set)\s*\(\s*\)|Object\.freeze\(\s*\[\s*\]\s*\))/;

/** ARM B — an OPTIONAL-CALLED METHOD defaulted to empty. Always a finding. */
const OPTIONAL_METHOD_EMPTY = /\.([A-Za-z0-9_]+)\?\.\([^)]*\)\s*(?:\?\?|\|\|)\s*\[\s*\]/g;

/** ARM C — a plain call/member defaulted to empty. */
const BARE_OR_EMPTY = /([A-Za-z0-9_$.?]+(?:\?\.)?\([^)]*\)|[A-Za-z0-9_$]+(?:\?\.|\.)[A-Za-z0-9_$]+)\s*(?:\?\?|\|\|)\s*\[\s*\]/g;

/**
 * ARM A — a `catch` arm that returns an empty collection.
 * Scans forward a bounded window from each `catch`, so both
 * `catch { return []; }` and a multi-line arm are seen. A `throw` or a
 * report/log-and-rethrow inside the window disqualifies it: the failure did not
 * disappear, so nothing was swallowed.
 */
export function catchToEmptySites(clean: string): { line: number; text: string }[] {
  const lines = clean.split('\n');
  const out: { line: number; text: string }[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!/\bcatch\b\s*(\([^)]*\))?\s*\{/.test(lines[i]!)) continue;
    const window = lines.slice(i, Math.min(lines.length, i + 6));
    const body = window.join('\n');
    // A rethrow anywhere in the window means the failure still propagates.
    if (/\bthrow\b/.test(body)) continue;
    for (let j = 0; j < window.length; j++) {
      const m = /return\s+(\[\s*\]|new (?:Map|Set)\s*\(\s*\))\s*;/.exec(window[j]!);
      if (m) { out.push({ line: i + j + 1, text: (window[j] ?? '').trim() }); break; }
      // stop at the end of the catch arm
      if (j > 0 && /^\s*\}/.test(window[j]!)) break;
    }
  }
  return out;
}

/** Does this catch arm answer a relationship question? Looked for in the
 *  enclosing function signature above the catch, plus the returning line. */
export function catchIsRelationshipScoped(clean: string, line: number): boolean {
  const lines = clean.split('\n');
  const from = Math.max(0, line - 30);
  const context = lines.slice(from, line).join('\n');
  return RELATIONSHIP_RE.test(context);
}

export function analyseFile(rel: string, text: string): Site[] {
  const clean = stripComments(text);
  const lines = clean.split('\n');
  const sites: Site[] = [];

  // ARM A
  for (const c of catchToEmptySites(clean)) {
    if (!catchIsRelationshipScoped(clean, c.line)) continue;
    sites.push({ file: rel, line: c.line, arm: 'A', text: c.text, key: `${rel}:catch-to-empty` });
  }

  // ARM B and C, line by line.
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]!;
    if (!EMPTY_ANSWER.test(l)) continue;

    OPTIONAL_METHOD_EMPTY.lastIndex = 0;
    let m: RegExpExecArray | null;
    let armBHit = false;
    while ((m = OPTIONAL_METHOD_EMPTY.exec(l)) !== null) {
      const method = m[1]!;
      if (!RELATIONSHIP_RE.test(method) && !RELATIONSHIP_RE.test(l)) continue;
      if (WHOLE_STORE_RE.test(method)) continue;
      armBHit = true;
      sites.push({ file: rel, line: i + 1, arm: 'B', text: l.trim(), key: `${rel}:${method}/optional-method-to-empty` });
    }
    if (armBHit) continue;

    BARE_OR_EMPTY.lastIndex = 0;
    while ((m = BARE_OR_EMPTY.exec(l)) !== null) {
      const expr = m[1]!;
      if (!RELATIONSHIP_RE.test(expr)) continue;
      if (WHOLE_STORE_RE.test(expr)) continue;
      sites.push({ file: rel, line: i + 1, arm: 'C', text: l.trim(), key: `${rel}:${expr.replace(/[^A-Za-z0-9_.]/g, '')}/or-empty` });
    }
  }
  return sites;
}

// ── Executed controls, both directions ───────────────────────────────────────
function selfTest(): { ok: boolean; lines: string[] } {
  const lines: string[] = [];
  let ok = true;
  const pass = (m: string): void => { lines.push(`  ✓ CONTROL ${m}`); };
  const fail = (m: string): void => { ok = false; lines.push(`  ❌ CONTROL FAILED — ${m}`); };

  // 1 · The EXACT measured defect (C71 / HierarchyTreePanel) must be flagged by ARM B.
  const real = `const edges = sg.getEdgesFromNode?.(room.id) ?? [];`;
  const s1 = analyseFile('x.ts', real);
  if (s1.some((s) => s.arm === 'B')) pass('the measured `getEdgesFromNode?.(room.id) ?? []` defect IS flagged by ARM B');
  else fail('the reference defect is NOT flagged — the gate cannot see the family it exists for');

  // 2 · The same text inside a COMMENT must NOT be flagged.
  const commented = `// this line read \`sg.getEdgesFromNode?.(room.id) ?? []\`; it never worked.`;
  if (analyseFile('x.ts', commented).length === 0) pass('the same defect written in a COMMENT is NOT counted (a gate must not measure its own changelog)');
  else fail('commented prose is counted — HierarchyTreePanel would be flagged for DOCUMENTING the fix');

  // 3 · ARM A both directions: swallowing catch flagged, rethrowing catch not.
  const swallow = `function getRelationshipEdges(id) { try { return graph.edges(id); } catch { return []; } }`;
  const rethrow = `function getRelationshipEdges(id) { try { return graph.edges(id); } catch (e) { throw e; } }`;
  const aSwallow = analyseFile('x.ts', swallow).some((s) => s.arm === 'A');
  const aRethrow = analyseFile('x.ts', rethrow).some((s) => s.arm === 'A');
  if (aSwallow && !aRethrow) pass('ARM A flags a catch that RETURNS [] and does NOT flag one that rethrows');
  else fail(`ARM A cannot tell a swallowing catch from a rethrowing one (swallow=${aSwallow} rethrow=${aRethrow})`);

  // 4 · An honest empty accumulator must NOT be flagged.
  const honest = `function collectDependencyEdges(id) { const out: Edge[] = []; for (const e of graph.all()) out.push(e); return out; }`;
  if (analyseFile('x.ts', honest).length === 0) pass('an honest empty ACCUMULATOR (`const out: Edge[] = []`) is NOT flagged');
  else fail('an honest accumulator is flagged — every array initialiser in the repo would be a finding');

  // 5 · A whole-store enumeration must NOT be flagged (legitimate empty).
  const wholeStore = `const rooms = window.roomStore?.getAll?.() ?? [];`;
  if (!analyseFile('x.ts', wholeStore).some((s) => s.arm === 'B')) pass('a whole-store `getAll?.() ?? []` is EXCLUDED — "every room" answering [] on an empty project is honest');
  else fail('whole-store enumeration is flagged — the ledger would fill with legitimate empties');

  // 6 · A relationship-scoped optional method that is NOT getAll IS flagged.
  const scoped = `const adj = roomStore.getRoomsAdjacentToWall?.(door.wallId) ?? [];`;
  if (analyseFile('x.ts', scoped).some((s) => s.arm === 'B')) pass('a relationship-scoped optional method (`getRoomsAdjacentToWall?.()`) IS flagged');
  else fail('a relationship-scoped optional-called method is not flagged — ARM B is too narrow to see real sites');

  // 7 · A NON-relationship default must NOT be flagged (scope proof).
  const unrelated = `const labels = config.getLabelStrings?.() ?? [];`;
  if (analyseFile('x.ts', unrelated).length === 0) pass('a NON-relationship optional default is out of scope and NOT flagged (this is C78\'s gate, not a repo-wide census)');
  else fail('an unrelated array default is flagged — the scope is not holding');

  return { ok, lines };
}

// ── Run ──────────────────────────────────────────────────────────────────────
function main(): number {
  const floors: Floor[] = [];
  const lines: string[] = [];

  const control = selfTest();
  lines.push('EXECUTED CONTROLS (both directions, every run — C78 §20.3):');
  lines.push(...control.lines);
  lines.push('');
  floors.push({ what: 'executed controls passed', measured: control.ok ? 7 : 0, min: 7 });

  const ledger: Ledger | null = existsSync(LEDGER_PATH)
    ? (JSON.parse(readFileSync(LEDGER_PATH, 'utf8')) as Ledger) : null;
  floors.push({ what: 'no-empty-means-unknown-debt.json ledger present', measured: ledger ? 1 : 0, min: 1 });

  const sources = collectSources(REPO, ['packages', 'apps', 'plugins']);
  floors.push({ what: 'production source files scanned (tests excluded)', measured: sources.length, min: 1500 });

  // C78 §20's stated floor for this gate: "discovery sites scanned > 0". A
  // scanner that matched NOTHING anywhere has broken rather than found a clean
  // estate — this repo is measured to contain the family, so a zero reading is
  // a detector failure and exits 2, never 0.
  // `collectSources` excludes *.test/*.spec/*.cert BY FILENAME but not whole
  // test DIRECTORIES — a fixture at `__tests__/__configs__/index.ts` is not a
  // production read path and must not enter a production-debt ledger.
  const TEST_DIR_RE = /(^|\/)(__tests__|__mocks__|__fixtures__|test|tests|e2e)(\/|$)/;
  const production = sources.filter((f) => !TEST_DIR_RE.test(f.rel));
  floors.push({ what: 'production files after excluding test DIRECTORIES', measured: production.length, min: 1500 });

  const all: Site[] = [];
  for (const f of production) all.push(...analyseFile(f.rel, f.text));
  floors.push({ what: 'candidate empty-answer sites located (C78 §20 "discovery sites scanned > 0")', measured: all.length, min: 1 });

  const findings: { key: string; detail: string }[] = [];
  const stale: string[] = [];

  if (ledger && floors.every((f) => f.measured >= f.min)) {
    // ─── The ledger grain is the FILE, not the line ──────────────────────────
    // A line number is not a stable identity: an unrelated edit above a site
    // renumbers it, which would make the ratchet fire on a whitespace change and
    // would let a real regression hide inside the churn. The file is stable, is
    // the unit a fix is actually made in, and keeps the ledger auditable by a
    // human (C70 §5.5 — named entries, never a bare count). Every line, arm and
    // source text is printed in the detail, so nothing is lost to the coarser
    // key; the per-file SITE COUNT is carried too, so 8 sites collapsing to 1
    // still shows as a shrink.
    const byFile = new Map<string, Site[]>();
    for (const s of all) { const a = byFile.get(s.file) ?? []; a.push(s); byFile.set(s.file, a); }
    const files = [...byFile.keys()].sort();

    const armCount = { A: 0, B: 0, C: 0 };
    for (const s of all) armCount[s.arm] += 1;

    for (const f of files) {
      const g = byFile.get(f)!.sort((x, y) => x.line - y.line);
      const armsHere = [...new Set(g.map((s) => s.arm))].sort().join('+');
      findings.push({
        key: f,
        detail:
          `${g.length} site(s), ARM ${armsHere} — ` +
          g.map((s) => `${s.arm}@${s.line} \`${s.text.slice(0, 90)}\``).join(' · '),
      });
    }

    lines.push(`ARM TOTALS (raw sites) — A(catch-to-empty): ${armCount.A} · B(optional-method-to-empty): ${armCount.B} · C(relationship-or-empty): ${armCount.C}`);
    lines.push(`  ${all.length} raw site(s) in ${files.length} file(s). The LEDGER GRAIN IS THE FILE (${files.length} rows); every line is named in its row's detail.`);
    lines.push('');
    lines.push('ARM A + ARM B — the no-doubt arms (a caught throw, and a method that may not exist):');
    for (const s of all.filter((x) => x.arm !== 'C').sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)) {
      lines.push(`  ${s.arm}  ${s.file}:${s.line}  \`${s.text.slice(0, 100)}\``);
    }
    lines.push('');

    const measuredKeys = new Set(findings.map((f) => f.key));
    const declaredKeys = new Set(ledger.swallowed.map((r) => r.site));
    lines.push(`FINDINGS: ${findings.length} against a NAMED ledger of ${ledger.swallowed.length}.`);
    for (const f of findings) {
      lines.push(`  ${declaredKeys.has(f.key) ? '·' : '⛔ UNLEDGERED'} ${f.key} — ${f.detail}`);
    }
    for (const r of ledger.swallowed) {
      if (!measuredKeys.has(r.site)) {
        stale.push(r.site);
        lines.push(`  ⚠ STALE LEDGER ROW: "${r.site}" is declared but no longer measured — strike it in the commit that fixed it.`);
      }
    }
    lines.push('');
    lines.push('UNPROVEN — named, never green (C78 §20.5):');
    lines.push('  ◌ ARM C carries residual doubt BY DESIGN and it is declared here rather than hidden in the count: a genuinely optional relationship field defaulting to empty can be legitimate. ARMs A and B carry none — a caught throw and a possibly-absent method are failures by construction.');
    lines.push('  ◌ Whole-store enumerations (getAll/getLevels/getByLevel) are EXCLUDED as honest empties. If one of those is in fact answering a relationship question, this gate is silent about it.');
    lines.push('  ◌ Scope is name-shaped (RELATIONSHIP_RE). A relationship question phrased in vocabulary the regex does not carry is invisible — the gate under-reports and never over-reports, which is the safe direction for a shrink-only ledger but is NOT completeness.');
    lines.push('  ◌ Static only: a site that returns [] and a CALLER that would have refused correctly are indistinguishable here. C78 §20.5(b) — a green gate proves its own assertion, never the invariant around it.');
  }

  return reportGate({
    gate: 'check-no-empty-means-unknown (C78 §20 · U-INV-4 · §1.4/§5)',
    floors,
    lines,
    findings: findings.length,
    declared: ledger?.swallowed.length ?? 0,
    findingNames: findings.map((f) => f.key),
    stale,
  });
}

process.exit(main());
