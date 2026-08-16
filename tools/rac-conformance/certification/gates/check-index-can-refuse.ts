// ─── GATE · check-index-can-refuse  (C78 §20, U-INV-7) ───────────────────────
//
// THE INVARIANT (C78 §19 U-INV-7, specified by §5.2):
//   **Every dependency index returns a determination, not a bare set.**
//
// The measured basis (C78 §0.h, 0B §3): *"Nine indexes exist; exactly one can
// refuse."* `DependencyResolver.getAffected` returns
// `{status:'determined'|'cannot-determine', reason}`; every other index answers
// **"nothing depends on this"** and **"I hold no entry for this"** with the same
// value. C78 §1.4 is the clause that makes this a defect rather than a style
// note: *never infer "unaffected" from missing data* — an empty index is
// UNDETERMINED, never DETERMINED-unaffected.
//
// This gate was a NAMED GAP at C78's stamp (§20.1: a gate named there that does
// not exist at HEAD makes its invariant UNPROVEN, never an inherited green).
//
// ─── WHAT IT DECIDES — three arms ────────────────────────────────────────────
//   ARM A · ENUMERATION. The dependency indexes are DISCOVERED from source (a
//           class whose name ends DependencyTracker / DependencyGraph /
//           DependencyResolver / ConnectivityService, plus the store/handler
//           indexes 0B §3 names explicitly), not hardcoded from the appendix's
//           prose. The discovered set is UNIONED with the appendix-declared
//           subjects so that a subject which moves file still gets measured, and
//           a declared subject whose file has VANISHED is itself reported. The
//           floor is deliberately near the measured population: if the detector
//           breaks and finds implausibly few indexes, the gate exits 2
//           MISCONFIGURED — it does NOT exit 0 over an empty subject (C78 §20.2:
//           *a gate for a contract whose central subject is "failure and
//           emptiness are different values" that itself passed on an empty
//           subject would be self-refuting*).
//   ARM B · REFUSAL PATH. Each index must have a TYPED refusal path: a way to
//           answer *"cannot determine"* distinctly from *"empty"*. The accepted
//           shapes are the fixed discriminated shapes in REFUSAL_SHAPES_FIXED
//           below PLUS C78 §8.1's closed `UndeterminedReason` union, which is
//           PARSED FROM SOURCE rather than copied here — see
//           §HAND-COPIED-VOCABULARY-ROTS. The `AffectedSet` discriminated union
//           at `DependencyResolver.ts:91–93` is the reference implementation.
//           Prose in a comment earns nothing: every file is comment-stripped
//           before it is searched, so a tracker that merely *documents* that it
//           should refuse does not pass. ARM B follows `extends`: capability is
//           inherited even though the FILE is not — see
//           §CAPABILITY-IS-INHERITED-THE-FILE-IS-NOT — and an inherited shape
//           always NAMES the ancestor that supplied it.
//   ARM C · SOLE ANSWER SHAPE. An index whose dependency-answering surface
//           returns `T[]` / `Set<T>` / `null` / `undefined` / a number as its
//           ONLY answer shape is a finding, named by index. This is the arm
//           that reproduces §0.h: the return type IS the defect, because a
//           caller cannot branch on a value that carries no determination.
//
// Arms B and C are two readings of one question and are reported as ONE finding
// per index, never two — a double-count would make the ledger read as twice the
// debt and would let one half be "fixed" by narrowing the other.
//
// ─── CONTROLS (executed, both directions, every run — C78 §20.3 / C70 §5.6) ──
// selfTest() drives the SAME analyser over synthetic sources: a synthetic
// tracker carrying the real `AffectedSet` union MUST pass ARM B; the same
// tracker with the union deleted MUST fail it; a tracker that only DESCRIBES
// refusal in a comment MUST fail (comment-stripping proof); and the discovery
// regex MUST match a synthetic `class FooDependencyTracker` and MUST NOT match
// the word inside a string. A control that fails exits 2 — a comparator never
// watched working publishes no verdict.
//
// ─── The ledger ──────────────────────────────────────────────────────────────
// NAMED, shrink-only, pinned at this gate's FIRST HONEST READING, checked in
// BOTH directions: an index that acquires a refusal path must LEAVE the ledger
// in the commit that gives it one (a stale row exits 3), and an index that is
// not on the ledger and cannot refuse is an unledgered finding (also exit 3).
// Red at a named ledger IS the deliverable here — the exit condition C78 §20
// states for U-INV-7 is *"the measured 1-of-9 refusing indexes reaches all"*,
// and nothing about this gate may be narrowed to make that number look nearer.
//
// Exit 0 clean · 1 declared · 2 MISCONFIGURED · 3 exceeded — from contract.ts,
// imported and never copied (C70 §5.1).
//
// ─── MEASURED AT HEAD 3785eae6, 2026-08-16 (lane G2, A.12) — THE PIN ─────────
// Run DIRECTLY, exit code read from `$?` and never through a pipe (tracker §7.2):
//
//   → EXIT 3 · STALE LEDGER · 11 findings against a NAMED ledger of 9.
//     · 1 STALE ROW  DoorDependencyTracker/no-typed-refusal — declared unable to
//       refuse, now measured CAN REFUSE via `UNDETERMINED reason member`,
//       `kind:'undetermined'`. Debt PAID and never struck.
//     · 3 UNLEDGERED CeilingHostDependencyTracker · FloorHostDependencyTracker ·
//       RoofDependencyTracker.
//     · 8 ledgered findings, unchanged.
//
// This block is the reading the fix commits are measured AGAINST. It is recorded
// BEFORE any fix, alone, so "what it said" and "what we did about it" are two
// commits and not one (§7B.4: a stale pin is an uncommitted payment).

import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { reportGate, type GateResult, type Floor } from '../contract.js';
import { collectSources, type SourceFile } from './scan.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, '../../../..');
const LEDGER_PATH = resolve(__dirname, 'index-can-refuse-debt.json');

interface LedgerRow { index: string; why: string }
interface Ledger { cannotRefuse: LedgerRow[] }

// ── Subjects named by the appendix (0B §3), so a detector regression is visible ─
// These are UNIONED with discovery, never a substitute for it. A declared
// subject whose file no longer exists is reported as a finding of its own: the
// appendix and the tree must not silently diverge.
const DECLARED_SUBJECTS: { name: string; file: string }[] = [
  { name: 'SlabDependencyTracker',      file: 'packages/geometry-slab/src/SlabDependencyTracker.ts' },
  { name: 'DoorDependencyTracker',      file: 'packages/geometry-door/src/DoorDependencyTracker.ts' },
  { name: 'WindowDependencyTracker',    file: 'packages/geometry-window/src/WindowDependencyTracker.ts' },
  { name: 'ViewDependencyTracker',      file: 'packages/core-app-model/src/views/ViewDependencyTracker.ts' },
  { name: 'DependencyResolver',         file: 'packages/core-app-model/src/DependencyResolver.ts' },
  { name: 'SlabWallConnectivityService', file: 'packages/geometry-slab/src/SlabWallConnectivityService.ts' },
  { name: 'AnnotationDependencyGraph',  file: 'plugins/annotations/src/subsystem/AnnotationDependencyGraph.ts' },
  { name: 'LightingStore.getAllForRoom', file: 'packages/core-app-model/src/stores/LightingStore.ts' },
  { name: 'FloorStore.getByHostSlab',   file: 'packages/geometry-slab/src/floor/FloorSlabBindingHandler.ts' },
  { name: 'joinedTo junction index',    file: 'apps/editor/src/engine/WallRebuildCoordinator.ts' },
];

/** Class-name shapes that ARE dependency indexes by construction. */
const INDEX_CLASS_RE =
  /\bclass\s+([A-Za-z0-9_]*(?:DependencyTracker|DependencyGraph|DependencyResolver|DependencyIndex|ConnectivityService))\b/g;

/**
 * The typed-refusal shapes the estate actually uses where it is right.
 * `AffectedSet` (`DependencyResolver.ts:91–93`) is the reference implementation;
 * the rest are the equivalent discriminated shapes an index could legitimately
 * adopt instead. Anything here answers "cannot determine" DISTINCTLY from
 * "empty" — which is the entire content of U-INV-7.
 */
const REFUSAL_SHAPES_FIXED: { id: string; re: RegExp }[] = [
  { id: "status:'cannot-determine'",   re: /['"]cannot-determine['"]/ },
  { id: 'CANNOT_DETERMINE',            re: /\bCANNOT_DETERMINE\b/ },
  { id: "status:'determined' union",   re: /status\s*:\s*['"]determined['"]/ },
  { id: 'AffectedSet return type',     re: /:\s*AffectedSet\b/ },
  { id: "kind:'undetermined'",         re: /kind\s*:\s*['"]undetermined['"]/i },
  { id: 'Determination<> wrapper',     re: /\bDetermination\s*</ },
];

// ── C78 §8.1's ONE CLOSED UNION, PARSED FROM SOURCE — never hand-copied ──────
//
// ⚠ §HAND-COPIED-VOCABULARY-ROTS (lane G2, A.12). This list used to be five
// SCREAMING_SNAKE literals written inline above. C78 §8.1 declares ELEVEN, and
// the five chosen were a subset nobody re-checked: `ENGINE_NOT_AVAILABLE` — §8.1
// member #2, "exists", ~14 producing sites — was NOT among them. The measured
// consequence was a FALSE POSITIVE: `RoofDependencyTracker` refuses with
// `ENGINE_NOT_AVAILABLE` at RoofDependencyTracker.ts:137, distinguishing "I could
// not look" from "I looked and it is gone" exactly as U-INV-7 requires, and this
// gate reported it CANNOT REFUSE. A gate that polices a closed union against a
// private copy of that union measures its own copy — which is §7.4's rule
// ("a hand-copied list rots") arriving in the one place it was not applied.
//
// The union is now READ from the type that defines it. A parse that returns
// materially fewer members than the contract declares means the PARSER broke,
// and a broken parser exits 2 MISCONFIGURED rather than quietly policing less.
const REASON_UNION_SOURCE = 'packages/command-bus/src/consequence.ts';

export function parseUndeterminedReasons(text: string): string[] {
  const m = /export\s+type\s+UndeterminedReason\s*=([\s\S]*?);/.exec(stripComments(text));
  if (!m) return [];
  return [...m[1]!.matchAll(/['"]([A-Z][A-Z0-9_]+)['"]/g)].map((x) => x[1]!);
}

/** The full shape table = the fixed shapes + the union read from source. */
export function refusalShapeTable(reasons: string[]): { id: string; re: RegExp }[] {
  if (reasons.length === 0) return REFUSAL_SHAPES_FIXED;
  return [
    ...REFUSAL_SHAPES_FIXED,
    { id: 'UNDETERMINED reason member', re: new RegExp(`\\b(${reasons.join('|')})\\b`) },
  ];
}

/** Populated once in main() from REASON_UNION_SOURCE; the controls pass their own. */
let REFUSAL_SHAPES: { id: string; re: RegExp }[] = REFUSAL_SHAPES_FIXED;

/** Bare answer shapes — the sole-answer defect ARM C names. */
const BARE_RETURN_RE =
  /\b(?:get|find|query|lookup|resolve|collect)[A-Za-z0-9_]*\s*\([^)]*\)\s*:\s*(?:readonly\s+)?(?:[A-Za-z0-9_.<>|\s]*\[\]|Set<[^>]*>|Map<[^>]*>|number|null|undefined)/;

// ── Comment-stripping: prose never earns credit (line-preserving) ────────────
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

export interface IndexSubject { name: string; rel: string; text: string; declared: boolean; discovered: boolean }

/** ARM B — does this source carry a typed refusal path at all? */
export function refusalShapesIn(src: string): string[] {
  const clean = stripComments(src);
  return REFUSAL_SHAPES.filter((s) => s.re.test(clean)).map((s) => s.id);
}

/** ARM C — does its dependency-answering surface have a bare-set-only shape? */
export function hasBareAnswerShape(src: string): boolean {
  return BARE_RETURN_RE.test(stripComments(src));
}

// ── INHERITED CAPABILITY — ARM B follows `extends` ───────────────────────────
//
// ⚠ §CAPABILITY-IS-INHERITED-THE-FILE-IS-NOT (lane G2, A.12). ARM B used to read
// ONE FILE per subject. A class that gets its refusal path from a BASE CLASS
// therefore read as CANNOT REFUSE, because the refusal lives in the base's file.
//
// This produced two measured FALSE POSITIVES at HEAD 3785eae6:
// `CeilingHostDependencyTracker` (65 lines) and `FloorHostDependencyTracker`
// (71 lines) are CONSTRUCTOR-ONLY bindings — `class X extends
// FinishHostDependencyTracker<T>` plus a `super(...)` call and one exported
// narrowing helper. They hold no dependency-answering surface of their own AT
// ALL. Their base, `FinishHostDependencyTracker`, is scored ✓ CAN REFUSE by THIS
// GATE in THIS RUN. The gate was therefore reporting that an index cannot refuse
// while simultaneously reporting that the only code it has can.
//
// Note what it was NOT: the two files DO name `RELATIONSHIP_NOT_RECORDED` — but
// only inside docstrings, which are stripped. Comment-stripping was working
// exactly as designed; the defect was reading one file for a capability that TS
// inheritance puts in another. The chain is walked with a cycle guard and a
// depth cap, and the ancestor that supplied the shape is NAMED in the output, so
// an inherited ✓ can never be mistaken for a local one.
const MAX_EXTENDS_DEPTH = 8;

/** `class X ... extends Y` → `Y`. Generic args and `implements` are ignored. */
export function baseClassOf(src: string, className: string): string | null {
  const re = new RegExp(`\\bclass\\s+${className}\\b[^{]*?\\bextends\\s+([A-Za-z0-9_$]+)`);
  const m = re.exec(stripComments(src));
  return m ? m[1]! : null;
}

/** name → source text, for every `class` declared anywhere in the sweep. */
export function indexClassSources(sources: SourceFile[]): Map<string, string> {
  const out = new Map<string, string>();
  const re = /\bclass\s+([A-Za-z0-9_$]+)/g;
  for (const f of sources) {
    const clean = stripComments(f.text);
    re.lastIndex = 0;
    for (let m = re.exec(clean); m !== null; m = re.exec(clean)) {
      if (!out.has(m[1]!)) out.set(m[1]!, f.text);
    }
  }
  return out;
}

/**
 * ARM B, inheritance-aware. Returns the shapes found on the subject itself, plus
 * any found on an ancestor — each ancestor-sourced shape tagged with its origin.
 */
export function refusalShapesInherited(
  className: string,
  ownText: string,
  classSources: Map<string, string>,
): string[] {
  const own = refusalShapesIn(ownText);
  if (own.length > 0) return own;

  const seen = new Set<string>([className]);
  let currentName = className;
  let currentText = ownText;

  for (let depth = 0; depth < MAX_EXTENDS_DEPTH; depth++) {
    const base = baseClassOf(currentText, currentName);
    if (base === null || seen.has(base)) return [];
    seen.add(base);
    const baseText = classSources.get(base);
    if (baseText === undefined) return [];
    const shapes = refusalShapesIn(baseText);
    if (shapes.length > 0) return shapes.map((s) => `${s} (inherited from ${base})`);
    currentName = base;
    currentText = baseText;
  }
  return [];
}

// ── Discovery (ARM A) ────────────────────────────────────────────────────────
export function discoverIndexClasses(sources: SourceFile[]): { name: string; rel: string }[] {
  const out: { name: string; rel: string }[] = [];
  for (const f of sources) {
    const clean = stripComments(f.text);
    INDEX_CLASS_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = INDEX_CLASS_RE.exec(clean)) !== null) out.push({ name: m[1]!, rel: f.rel });
  }
  return out;
}

// ── Executed controls, both directions ───────────────────────────────────────
function selfTest(): { ok: boolean; lines: string[] } {
  const lines: string[] = [];
  let ok = true;
  const pass = (m: string): void => { lines.push(`  ✓ CONTROL ${m}`); };
  const fail = (m: string): void => { ok = false; lines.push(`  ❌ CONTROL FAILED — ${m}`); };

  // 1 · POSITIVE: the real refusal union must be recognised.
  const refusing = `export type AffectedSet = { readonly status: 'determined'; tasks: T[] } | { readonly status: 'cannot-determine'; reason: string };
    class FooDependencyTracker { getAffected(id: string): AffectedSet { return { status: 'cannot-determine', reason: 'x' }; } }`;
  if (refusalShapesIn(refusing).length > 0) pass('a tracker carrying the real AffectedSet union IS recognised as able to refuse');
  else fail('the analyser cannot recognise the reference refusal shape (AffectedSet) — it would call the ONE refusing index a finding');

  // 2 · NEGATIVE: the same tracker with the union deleted must NOT pass.
  const bare = `class FooDependencyTracker { getDoorIdsForWall(wallId: string): string[] { return this._m.get(wallId) ?? []; } }`;
  if (refusalShapesIn(bare).length === 0) pass('the same tracker with the union DELETED is NOT credited with a refusal path');
  else fail('the analyser credits a bare-set tracker with a refusal path — every finding would vanish');

  // 3 · COMMENT-STRIPPING: prose about refusal earns nothing.
  const prose = `// TODO: this should return { status: 'cannot-determine', reason } one day.
    /* AffectedSet would be the right shape here. */
    class BarDependencyTracker { getX(id: string): string[] { return []; } }`;
  if (refusalShapesIn(prose).length === 0) pass('a tracker that only DESCRIBES refusal in comments earns NO credit (prose is stripped)');
  else fail('comment prose earns credit — a file could be "fixed" by writing a sentence');

  // 4 · ARM C both directions.
  if (hasBareAnswerShape(bare)) pass('ARM C sees the bare `: string[]` answer shape');
  else fail('ARM C cannot see a bare array return — the sole-answer arm is blind');
  const determined = `class BazDependencyTracker { getAffected(id: string): AffectedSet { return { status: 'determined', tasks: [] }; } }`;
  if (!hasBareAnswerShape(determined)) pass('ARM C does NOT flag a surface that returns a determination');
  else fail('ARM C flags a determination-returning surface — it would never go green even when fixed');

  // 5 · DISCOVERY both directions.
  const discovered = discoverIndexClasses([{ path: 'x', rel: 'x.ts', text: 'export class QuxDependencyTracker {}' }]);
  const notDiscovered = discoverIndexClasses([{ path: 'y', rel: 'y.ts', text: "const s = 'class QuxDependencyTracker {}'; // in a comment: class ZedDependencyGraph" }]);
  if (discovered.length === 1 && discovered[0]!.name === 'QuxDependencyTracker') pass('discovery matches a real `class QuxDependencyTracker`');
  else fail('discovery misses a real index class declaration');
  if (!notDiscovered.some((d) => d.name === 'ZedDependencyGraph')) pass('discovery does NOT count an index class named inside a comment');
  else fail('discovery counts commented-out classes — the floor could be met by prose');

  // 6 · INHERITED CAPABILITY, both directions. The subclass carries NO refusal
  //     text of its own in either case; only the base differs.
  const refusingBase = `class BaseTracker { plan(): void { this.r = 'RELATIONSHIP_NOT_RECORDED'; } }`;
  const bareBase = `class PlainBase { getIdsForWall(id: string): string[] { return []; } }`;
  const sub = `class SubDependencyTracker extends BaseTracker { constructor() { super('ceiling'); } }`;
  const subOfBare = `class OtherDependencyTracker extends PlainBase { constructor() { super(); } }`;
  const chain = new Map<string, string>([['BaseTracker', refusingBase], ['PlainBase', bareBase]]);

  const inherited = refusalShapesInherited('SubDependencyTracker', sub, chain);
  if (inherited.length > 0 && inherited[0]!.includes('inherited from BaseTracker')) {
    pass('a constructor-only subclass IS credited with its BASE class\'s refusal path, and the origin is named');
  } else fail('ARM B cannot see an inherited refusal path — a thin subclass of a refusing base reads as a finding (the Ceiling/Floor false positive)');

  if (refusalShapesInherited('OtherDependencyTracker', subOfBare, chain).length === 0) {
    pass('a subclass of a base that CANNOT refuse is still NOT credited — inheritance does not launder a missing path');
  } else fail('inheritance credits a subclass whose base has no refusal path — every finding could be hidden behind an `extends`');

  // 7 · THE UNION IS READ FROM SOURCE, not from a copy in this file.
  const unionFixture = `export type UndeterminedReason =\n  | 'NO_DEPENDENCY_INDEX'\n  | 'ENGINE_NOT_AVAILABLE'\n  | 'PLANNER_THREW';`;
  const parsed = parseUndeterminedReasons(unionFixture);
  if (parsed.length === 3 && parsed.includes('ENGINE_NOT_AVAILABLE')) {
    pass('the §8.1 UndeterminedReason union PARSES from source (a hand-copied vocabulary is what missed ENGINE_NOT_AVAILABLE)');
  } else fail(`the union parser is broken — it read [${parsed.join(', ')}] from a 3-member fixture`);
  if (parseUndeterminedReasons('export type Something = string;').length === 0) {
    pass('the union parser returns EMPTY for a source with no UndeterminedReason — a broken parse forces the floor, never a silent smaller vocabulary');
  } else fail('the union parser invents members from unrelated source');

  return { ok, lines };
}

// ── Run ──────────────────────────────────────────────────────────────────────
function main(): number {
  const floors: Floor[] = [];
  const lines: string[] = [];

  // C78 §8.1's closed union, read from the type that defines it. Done BEFORE the
  // controls so the run policing the estate and the run policing itself use the
  // same table — two vocabularies is the defect this replaced.
  const unionPath = resolve(REPO, REASON_UNION_SOURCE);
  const unionReasons = existsSync(unionPath)
    ? parseUndeterminedReasons(readFileSync(unionPath, 'utf8')) : [];
  REFUSAL_SHAPES = refusalShapeTable(unionReasons);

  const control = selfTest();
  lines.push('EXECUTED CONTROLS (both directions, every run — C78 §20.3):');
  lines.push(...control.lines);
  lines.push('');
  floors.push({ what: 'executed controls passed', measured: control.ok ? 11 : 0, min: 11 });
  // A parse that finds materially fewer than the ELEVEN members C78 §8.1
  // declares means THIS PARSER broke, not that the contract shrank — and a
  // broken parser must exit 2 MISCONFIGURED, never police a smaller vocabulary
  // quietly. The floor sits below 11 so a legitimate contract edit is not
  // reported as a harness fault, and far above the 0/1 a broken parse returns.
  floors.push({
    what: `C78 §8.1 UndeterminedReason members parsed from ${REASON_UNION_SOURCE}`,
    measured: unionReasons.length,
    min: 8,
  });

  const ledger: Ledger | null = existsSync(LEDGER_PATH)
    ? (JSON.parse(readFileSync(LEDGER_PATH, 'utf8')) as Ledger) : null;
  floors.push({ what: 'index-can-refuse-debt.json ledger present', measured: ledger ? 1 : 0, min: 1 });

  const sources = collectSources(REPO, ['packages', 'apps', 'plugins']);
  floors.push({ what: 'production source files scanned', measured: sources.length, min: 1500 });

  // ARM A — discovery ∪ declared subjects.
  const discovered = discoverIndexClasses(sources);
  const byRel = new Map(sources.map((s) => [s.rel, s]));
  const subjects = new Map<string, IndexSubject>();

  for (const d of discovered) {
    const f = byRel.get(d.rel)!;
    subjects.set(d.name, { name: d.name, rel: d.rel, text: f.text, declared: false, discovered: true });
  }
  const missingDeclared: string[] = [];
  for (const decl of DECLARED_SUBJECTS) {
    const existing = subjects.get(decl.name);
    if (existing) { existing.declared = true; continue; }
    const p = resolve(REPO, decl.file);
    if (!existsSync(p)) { missingDeclared.push(`${decl.name} (${decl.file})`); continue; }
    subjects.set(decl.name, { name: decl.name, rel: decl.file, text: readFileSync(p, 'utf8'), declared: true, discovered: false });
  }

  // The floor: 0B §3 measured NINE (its table lists ten rows). A detector that
  // finds materially fewer has broken, and a broken detector exits 2, never 0.
  floors.push({ what: 'dependency indexes established (discovered ∪ declared)', measured: subjects.size, min: 8 });
  floors.push({ what: 'index classes DISCOVERED from source (independent of the appendix list)', measured: discovered.length, min: 5 });
  floors.push({ what: 'declared subjects still present in the tree', measured: DECLARED_SUBJECTS.length - missingDeclared.length, min: DECLARED_SUBJECTS.length });

  const findings: { key: string; detail: string }[] = [];
  const stale: string[] = [];

  if (ledger && floors.every((f) => f.measured >= f.min)) {
    const ordered = [...subjects.values()].sort((a, b) => a.name.localeCompare(b.name));
    lines.push(`ARM A — ${ordered.length} dependency index(es) established (${discovered.length} discovered from source, ${DECLARED_SUBJECTS.length} declared by 0B §3):`);

    const classSources = indexClassSources(sources);
    const canRefuse: string[] = [];
    for (const s of ordered) {
      // ARM B follows `extends`: a constructor-only subclass of a refusing base
      // CAN refuse. The origin is carried in the shape id, never elided.
      const shapes = refusalShapesInherited(s.name, s.text, classSources);
      const bare = hasBareAnswerShape(s.text);
      const origin = s.discovered && s.declared ? 'discovered+declared' : s.discovered ? 'discovered' : 'declared';
      if (shapes.length > 0) {
        canRefuse.push(s.name);
        lines.push(`  ✓  ${s.name.padEnd(30)} CAN REFUSE via ${shapes.join(', ')}  [${origin}] ${s.rel}`);
      } else {
        // ARMS B and C are ONE finding per index, never two.
        findings.push({
          key: `${s.name}/no-typed-refusal`,
          detail:
            `${s.rel} — no typed refusal path: nothing in this file (comments stripped) distinguishes ` +
            `"nothing depends on this" from "I hold no entry for this"` +
            (bare ? ', and its dependency-answering surface returns a bare set/null/number as its ONLY answer shape (ARM C)' : ' (ARM B; no bare-surface shape matched, so the answer shape could not be characterised — the refusal path is absent either way)') +
            `. C78 §1.4: an empty index is UNDETERMINED, never DETERMINED-unaffected.`,
        });
        lines.push(`  ❌ ${s.name.padEnd(30)} CANNOT REFUSE${bare ? ' (bare answer shape)' : ''}  [${origin}] ${s.rel}`);
      }
    }
    lines.push('');
    lines.push(`ARM B/C — indexes that CAN refuse: ${canRefuse.length} of ${ordered.length} (${canRefuse.join(', ') || 'none'}).`);
    lines.push(`  C78 §0.h measured "nine indexes, exactly one can refuse" on 2026-08-12; this run measures ${canRefuse.length} of ${ordered.length} independently, from source.`);
    lines.push('');

    // Ledger, both directions.
    const measuredKeys = new Set(findings.map((f) => f.key));
    const declaredKeys = new Set(ledger.cannotRefuse.map((r) => r.index));
    lines.push(`FINDINGS: ${findings.length} against a NAMED ledger of ${ledger.cannotRefuse.length}.`);
    for (const f of findings) {
      lines.push(`  ${declaredKeys.has(f.key) ? '·' : '⛔ UNLEDGERED'} ${f.key} — ${f.detail}`);
    }
    for (const r of ledger.cannotRefuse) {
      if (!measuredKeys.has(r.index)) {
        stale.push(r.index);
        lines.push(`  ⚠ STALE LEDGER ROW: "${r.index}" is declared unable to refuse but is no longer measured that way — strike it in the commit that gave it a refusal path.`);
      }
    }
    lines.push('');
    lines.push('UNPROVEN — named, never green (C78 §20.5):');
    lines.push('  ◌ This gate is STATIC. It proves a refusal SHAPE exists in the file, not that every caller BRANCHES on it — an index that returns a determination which every consumer immediately spreads into a bare array satisfies this gate and violates U-INV-7 in effect.');
    lines.push('  ◌ Reachability is not measured (C78 §20.5a): an index that can refuse but is never consulted on the consequence path earns a ✓ here and delivers nothing.');
    lines.push('  ◌ Discovery is name-shaped. A dependency index that answers relationship questions under a name matching none of DependencyTracker/DependencyGraph/DependencyResolver/DependencyIndex/ConnectivityService is invisible to ARM A unless 0B §3 named it — the declared list is the mitigation, not a proof of completeness.');
  }

  if (missingDeclared.length > 0) {
    lines.push(`⚠ DECLARED SUBJECT(S) NOT FOUND IN TREE: ${missingDeclared.join(' · ')} — the appendix and the tree have diverged; this forces the floor, not a silent smaller subject.`);
  }

  return reportGate({
    gate: 'check-index-can-refuse (C78 §20 · U-INV-7 · §5.2)',
    floors,
    lines,
    findings: findings.length,
    declared: ledger?.cannotRefuse.length ?? 0,
    findingNames: findings.map((f) => f.key),
    stale,
  });
}

process.exit(main());
