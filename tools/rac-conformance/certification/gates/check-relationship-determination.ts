// ─── GATE · check-relationship-determination  (C78 §20 · U-INV-1 · tracker §-3) ──
//
// THE INVARIANT (C78 §19 U-INV-1, specified by §1.1/§1.3, instrumented per
// BIM30-MASTER-COMPLETION-TRACKER §-3 — "the one gate, and it does not exist yet"):
//
//   **For every (element kind × relationship × consequential operation) cell,
//   the system returns exactly one of DETERMINED-affected · DETERMINED-unaffected
//   · UNDETERMINED with a typed reason from the closed 11-member union. There is
//   no fourth answer.** A cell that is silent is a FAILURE; a cell that honestly
//   refuses is a PASS (tracker §-3 rule 2). "Unaffected" is never inferred from
//   missing data (C78 §1.4): `0 dependents` and `I could not determine
//   dependents` must be distinguishable at the caller.
//
// C78 §19.1 applies NO PARTIAL CREDIT **across the product**: one family with a
// complete lifecycle is one family, and the coverage claim is n of N cells until
// N is measured. This gate's first duty is therefore the DENOMINATOR.
//
// ─── THE DENOMINATOR — derived from registries, never hand-written (§-3 rule 1) ──
//   · OPERATIONS × ELEMENT KINDS  = the consequential verbs of the C69 register
//     (`docs/04-reference/API-VERB-REGISTER.md`, GENERATED from the code and
//     CI-diffed against it in both directions — the registry artefact, not a
//     hand list). A verb IS a (kind × operation) pair; the consequential classes
//     are C78 §1.5's measured set: create · delete · move · update · batch
//     (0A §3.2). Nothing is hand-pruned: a verb of UNKNOWN liveness stays in the
//     denominator, because *silence is not scoping* (C78 §1.5) and 0A OQ5 is
//     unsettled.
//   · RELATIONSHIPS = the C71 vocabulary, parsed from the `RelationshipType`
//     union in its home file (`packages/core-app-model/src/SemanticGraph.ts`,
//     comment-stripped), UNIONED with the §3.2 store-field relationships from
//     `gates/dependency-fields.json` — the single shared census that gate and
//     C79's share ("two gates over one invariant is the second-copy disease";
//     this gate READS the census, it does not fork it). This is exactly the
//     C78 §20 U-INV-1 exit condition's ledger scope: "the C71 vocabulary PLUS
//     the §3.2 store-field relationships".
//   If any registry cannot be enumerated, the gate exits 2 MISCONFIGURED —
//   "a count of passing cells without a count of cells is the empty-seed lie"
//   (tracker §-3 rule 1).
//
// ─── HOW A CELL IS CLASSIFIED — factorized, and the factorization is DECLARED ──
// A static gate cannot execute 4 000 cells (C79 §8.3(b): runtime behaviour is
// provable only by an executed test — that is check-move-propagation's job, per
// family). What it CAN decide is the pair of STRUCTURALLY NECESSARY conditions
// C78 itself states, and a cell that fails either one provably CANNOT produce
// one of the three answers — that is the fourth answer, proven from source:
//
//   VERB AXIS · the verb must REACH the consequence system: its normaliser is in
//     the canonical registry (`CONSEQUENCE_NORMALIZERS`,
//     ConsequencePreviewService.ts) AND the semantic family it normalises to is
//     registered in THE planner registry (`createConsequencePlanners()`,
//     consequencePreviewServiceComposition.ts — "the ONE place a consequence
//     planner is named"). A verb that reaches neither, while the preview entry
//     point still returns bare `null` (§0.e's four-cause collapse), dispatches
//     with no plan, no typed refusal, no report — every one of its cells is
//     SILENT (finding class `verb:<v>/silent-dispatch`). If the entry point is
//     measured TYPED (returns `PreviewOutcome`, never `ConsequencePlan | null`),
//     an unrecognised verb receives `UNSUPPORTED_ELEMENT_TYPE` and its cells
//     become HONEST-REFUSAL — a pass at this gate's altitude (§-3 rule 2), with
//     dispatch reach still named UNPROVEN below.
//
//   RELATIONSHIP AXIS · the relationship's discovery must be able to REFUSE
//     (C78 §1.4, §5.2). For vocabulary members: a refusal-bearing typed reader
//     in the union's home file — a method that reads the family via
//     `getTargets`/`getSources` AND carries an `ok: false` refusal arm in the
//     same method body (the `JoinedWallsQuery` shape, C71 §4.4). For store-field
//     relationships: the census's own disposition — only POPULATE (written AND
//     reacted) can answer at mutation time; UNREACTED / PARTIAL / EMPTY cannot,
//     and produce no typed UNDETERMINED either. A relationship that cannot
//     refuse blocks every cell of every REACHING verb (finding class
//     `relationship:<r>/cannot-refuse`); its cells under silent verbs are
//     counted ONCE, under the verb key — one finding per cell, never two.
//
//   A cell passing BOTH conditions is STRUCTURALLY-ANSWERABLE — the necessary
//   conditions hold. That is NOT reported as the cell answering (C70 §2.2:
//   UNPROVEN is neither pass nor fail): sufficiency is decided by the EXECUTED
//   gates (check-move-propagation, check-execution-plan-agreement,
//   c79MovePropagation.test.ts) and is named UNPROVEN here, per cell class.
//
// ─── CONTROLS (executed, both directions, every run — C78 §20.3 / C70 §5.6) ──
// selfTest() drives the SAME parsers and the SAME classifier over synthetic
// sources, including:
//   · SATISFIABILITY (L-716: a gate that can never pass is a defect, not a
//     standard). A synthetic full-coverage registry state — every consequential
//     verb normalised + composed, every relationship refusal-capable — MUST
//     classify to 0 findings, and `verdictOf` over that result MUST return exit
//     0. The green state is thereby proven REACHABLE on every run.
//   · A deliberately broken fixture (one silent verb, one refusal-less
//     relationship) MUST produce exactly those two findings by key. A classifier
//     that calls the broken fixture clean is a blind comparator → exit 2 and
//     every verdict this run produced is invalid (§4.3).
//   · Comment-stripping proofs: a `planners.set` in a comment, a union member in
//     prose, a refusal DESCRIBED in a docblock — none earns anything.
//
// ─── The ledger ──────────────────────────────────────────────────────────────
// `relationship-determination.json` — NAMED, shrink-only, pinned at this gate's
// FIRST HONEST READING, checked in BOTH directions: a finding not on it exits 3;
// an entry no longer measured is STALE and also exits 3. Landing RED at a named
// ledger IS the deliverable (tracker §-3 rule 5) — the exit condition is C78
// §20's: every cell answers or carries a founder-signed exception, and no row is
// blank. Nothing here may be narrowed to make that day look nearer.
//
// ─── WHAT THIS GATE CANNOT SEE (named, so the table is not mistaken for coverage) ──
//  (a) STATIC-REACHABILITY — composed ≠ reached at dispatch (C70 §4.2, C78
//      §20.5a). `MovePlanToolHandler.ts`'s kind branch (§5.4) is not measured
//      here; a composed planner a tool handler never calls earns its cells
//      STRUCTURALLY-ANSWERABLE and delivers nothing.
//  (b) PER-CELL-SUFFICIENCY — a reaching verb's planner may still not determine
//      a given relationship (wall.move is composed and wall→stair is 🔴 in the
//      tracker's own matrix). Only executed arms decide sufficiency.
//  (c) GRAPH-HOME-SCOPE — refusal-bearing readers are detected in the union's
//      home file. A refusal-bearing reader living elsewhere is invisible to this
//      arm and would surface as a stale ledger row to be struck, not silently.
//  (d) VERB-LIVENESS — the register's 169 UNKNOWN-liveness verbs are in the
//      denominator. A dead verb's silent cells overstate nothing: C78 §1.5 makes
//      declassification a reviewable act, and it has not been performed.
//
// Exit 0 clean · 1 declared · 2 MISCONFIGURED · 3 exceeded — from contract.ts,
// imported and never copied (C70 §5.1).

import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { reportGate, verdictOf, type Floor } from '../contract.js';
import { collectSources } from './scan.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, '../../../..');
const LEDGER_PATH = resolve(__dirname, 'relationship-determination.json');

// The registries. Each is the artefact its subsystem already declares
// authoritative — this gate derives, it does not re-invent (second-copy disease).
const REGISTER_PATH = resolve(REPO, 'docs/04-reference/API-VERB-REGISTER.md');
const SERVICE_PATH = resolve(REPO, 'apps/editor/src/engine/consequence/ConsequencePreviewService.ts');
const COMPOSITION_PATH = resolve(REPO, 'apps/editor/src/engine/consequence/consequencePreviewServiceComposition.ts');
const GRAPH_HOME_PATH = resolve(REPO, 'packages/core-app-model/src/SemanticGraph.ts');
const DEP_FIELDS_PATH = resolve(__dirname, 'dependency-fields.json');
const CONSEQUENCE_PATH = resolve(REPO, 'packages/command-bus/src/consequence.ts');

/** C78 §1.5's consequential operation classes, measured by 0A §3.2 (31+27+18+12+12 = 100). */
const CONSEQUENTIAL_CLASSES = ['create', 'delete', 'move', 'update', 'batch'] as const;

interface Ledger { '//'?: string[]; firstReading?: string; measured?: unknown; declaredFindings: string[] }

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

// ── Registry parsers (each self-tested below) ────────────────────────────────

/** C69 register table rows → unique verbs. The register is GENERATED and CI-diffed. */
export function parseRegisterVerbs(md: string): string[] {
  const out = new Set<string>();
  for (const line of md.split('\n')) {
    const m = /^\|\s*`([a-z][\w.-]*)`\s*\|/.exec(line);
    if (m) out.add(m[1]!);
  }
  return [...out].sort();
}

/** The verb's operation class, or null when it is outside C78 §1.5's consequential set. */
export function opClassOf(verb: string): string | null {
  const segs = verb.split('.');
  if (segs.length < 2) return null; // the four bare verbs are non-consequential by 0A §3.2
  if (segs.includes('batch')) return 'batch';
  const last = segs[segs.length - 1]!;
  return (CONSEQUENTIAL_CLASSES as readonly string[]).includes(last) ? last : null;
}

/** Entries of the canonical normaliser registry: [busVerb, normaliserFn]. */
export function parseNormaliserEntries(src: string): { verb: string; fn: string }[] {
  const clean = stripComments(src);
  const out: { verb: string; fn: string }[] = [];
  const re = /\[\s*['"]([\w.$-]+)['"]\s*,\s*(normalize[A-Za-z0-9_]*)\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(clean)) !== null) out.push({ verb: m[1]!, fn: m[2]! });
  return out;
}

/** Keys registered in THE planner registry (`planners.set('<semantic>', …)`). */
export function parsePlannerKeys(src: string): string[] {
  const clean = stripComments(src);
  const out: string[] = [];
  const re = /planners\s*\.\s*set\s*\(\s*['"]([\w.$-]+)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(clean)) !== null) out.push(m[1]!);
  return out;
}

/** `normalizeToOpeningMoveFromDoor` → `OpeningMove` — the semantic family a rule feeds. */
export function canonOfFn(fn: string): string {
  return fn.replace(/^normalizeTo/, '').replace(/From[A-Z]\w*$/, '');
}
/** `opening.move` → `OpeningMove` — the same canonical space, from the planner key side. */
export function canonOfKey(key: string): string {
  return key.split('.').map((s) => (s.length > 0 ? s[0]!.toUpperCase() + s.slice(1) : s)).join('');
}

/**
 * Is the preview entry point TYPED? Bare `Promise<ConsequencePlan | null>` is
 * §0.e's four-cause collapse: an unrecognised verb gets `null`, not
 * `UNSUPPORTED_ELEMENT_TYPE`, and its cells are SILENT. Typed = every `preview`
 * signature returns `PreviewOutcome` and none returns the null union.
 */
export function entryPointTyped(src: string): { typed: boolean; bareNullSites: number; typedSites: number } {
  const clean = stripComments(src);
  const bareNullSites = [...clean.matchAll(/\bpreview\s*\([^)]*\)\s*:\s*Promise<\s*ConsequencePlan\s*\|\s*null\s*>/g)].length;
  const typedSites = [...clean.matchAll(/\bpreview\s*\([^)]*\)\s*:\s*Promise<[^>]*\bPreviewOutcome\b/g)].length;
  return { typed: typedSites > 0 && bareNullSites === 0, bareNullSites, typedSites };
}

/** Members of a string-literal union declared as `export type <name> = | 'a' | 'b';`. */
export function parseUnionMembers(src: string, unionName: string): string[] {
  const clean = stripComments(src);
  const start = clean.indexOf(`export type ${unionName}`);
  if (start < 0) return [];
  const end = clean.indexOf(';', start);
  if (end < 0) return [];
  const block = clean.slice(start, end);
  const out: string[] = [];
  const re = /\|\s*'([A-Za-z][\w-]*)'/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block)) !== null) out.push(m[1]!);
  return out;
}

/**
 * Relationship families with a REFUSAL-BEARING reader in the graph's home file:
 * a method whose body reads the family (`getTargets`/`getSources` with the
 * family literal) AND carries an `ok: false` refusal arm — the C71 §4.4
 * `JoinedWallsQuery` shape. A family read only through bare `getTargets` at
 * call sites returns `[]` for both "none" and "unknown" and CANNOT refuse.
 */
export function refusalCapableFamilies(src: string): Set<string> {
  const clean = stripComments(src);
  const lines = clean.split('\n');
  const methodStart = /^\s{4}(?:public\s+|private\s+|protected\s+|static\s+|async\s+|get\s+|set\s+)*[A-Za-z_]\w*\s*(?:<[^>]*>)?\s*\(/;
  const notAMethod = /^\s{4}(?:if|for|while|switch|return|new|const|let|var|throw)\b/;
  const chunks: string[] = [];
  let current: string[] | null = null;
  for (const line of lines) {
    if (methodStart.test(line) && !notAMethod.test(line)) {
      if (current) chunks.push(current.join('\n'));
      current = [line];
    } else if (current) {
      current.push(line);
    }
  }
  if (current) chunks.push(current.join('\n'));

  const capable = new Set<string>();
  const readRe = /\bget(?:Targets|Sources)\s*\(\s*[^,()]+,\s*'(\w+)'\s*\)/g;
  for (const chunk of chunks) {
    if (!/\bok\s*:\s*false\b/.test(chunk)) continue;
    let m: RegExpExecArray | null;
    readRe.lastIndex = 0;
    while ((m = readRe.exec(chunk)) !== null) capable.add(m[1]!);
  }
  return capable;
}

// ── The cell classifier — PURE, shared by the real run and both fixtures ─────

export interface RelationshipAxisRow {
  name: string;
  source: 'vocabulary' | 'store-field';
  canRefuse: boolean;
  why: string;
}
export interface AxisModel {
  /** The consequential verbs — each IS an (element kind × operation) pair. */
  verbs: { verb: string; opClass: string }[];
  /** Verbs whose normaliser feeds a COMPOSED planner family. */
  reaching: Set<string>;
  /** Is the preview entry point typed (PreviewOutcome), or §0.e's bare null? */
  entryTyped: boolean;
  relationships: RelationshipAxisRow[];
}
export interface CellReading {
  cells: number;
  silentCells: number;
  honestRefusalCells: number;
  refusalBlockedCells: number;
  structurallyAnswerableCells: number;
  findings: { key: string; detail: string }[];
}

export function classifyCells(m: AxisModel): CellReading {
  const R = m.relationships.length;
  const reachingVerbs = m.verbs.filter((v) => m.reaching.has(v.verb));
  const findings: { key: string; detail: string }[] = [];
  let silentCells = 0;
  let honestRefusalCells = 0;

  for (const v of m.verbs) {
    if (m.reaching.has(v.verb)) continue;
    if (m.entryTyped) {
      // The typed entry point answers UNSUPPORTED_ELEMENT_TYPE for an
      // unrecognised verb — the third legal answer. A pass at this altitude;
      // dispatch reach stays UNPROVEN (limit (a)).
      honestRefusalCells += R;
    } else {
      silentCells += R;
      findings.push({
        key: `verb:${v.verb}/silent-dispatch`,
        detail:
          `${v.opClass} — no normaliser + composed planner reaches this verb, and the preview entry ` +
          `point returns bare null (§0.e), so every one of its ${R} cells yields the forbidden fourth ` +
          `answer: no plan, no typed UNDETERMINED, no report (C78 §1.1).`,
      });
    }
  }

  let refusalBlockedCells = 0;
  let structurallyAnswerableCells = 0;
  for (const r of m.relationships) {
    if (r.canRefuse) {
      structurallyAnswerableCells += reachingVerbs.length;
    } else {
      refusalBlockedCells += reachingVerbs.length;
      findings.push({
        key: `relationship:${r.name}/cannot-refuse`,
        detail:
          `${r.source} — ${r.why} "0 dependents" and "I could not determine dependents" are the same ` +
          `value here, so even a composed planner inherits C78 §1.4's forbidden inference; blocks ` +
          `${reachingVerbs.length} reaching-verb cell(s), counted once (silent-verb cells are counted ` +
          `under their verb key).`,
      });
    }
  }

  return {
    cells: m.verbs.length * R,
    silentCells,
    honestRefusalCells,
    refusalBlockedCells,
    structurallyAnswerableCells,
    findings,
  };
}

// ── Executed controls, both directions, every run ────────────────────────────

function selfTest(): { total: number; passed: number; lines: string[] } {
  const lines: string[] = [];
  let total = 0;
  let passed = 0;
  const check = (name: string, ok: boolean, why: string): void => {
    total++;
    if (ok) { passed++; lines.push(`  ✓ CONTROL ${name}`); }
    else lines.push(`  ❌ CONTROL FAILED — ${name}: ${why}`);
  };

  // 1 · register parser: table rows only, deduped; prose earns nothing.
  const md = '| `wall.move` | x | LIVE |\n| `wall.move` | dup | LIVE |\n| `beam.batch.create` | y | UNKNOWN |\nprose citing `room.delete` is not a row\n| `door.setOffset` | z | LIVE |';
  const verbs = parseRegisterVerbs(md);
  check('register parser reads table rows only, deduped', verbs.length === 3 && verbs.includes('wall.move') && !verbs.includes('room.delete'),
    `parsed ${JSON.stringify(verbs)} — a parser that reads prose or double-counts SHADOWED rows corrupts the denominator`);

  // 2 · operation classifier — the C78 §1.5 boundary, both directions.
  check('opClass: consequential verbs classify, non-consequential return null',
    opClassOf('wall.move') === 'move' && opClassOf('room.delete') === 'delete' && opClassOf('beam.batch.create') === 'batch'
    && opClassOf('wall.setMaterial') === null && opClassOf('zoom-fit') === null && opClassOf('wall.updateSystemTypeBatch') === null,
    'the classifier disagrees with 0A §3.2\'s class table — the 100-verb consequential core would be miscounted');

  // 3 · normaliser parser: code counts, comments do not.
  const normSrc = `const R = new Map([\n  ['wall.move', normalizeToWallMove],\n  // ['ghost.move', normalizeToGhostMove],\n  ['door.setOffset', normalizeToOpeningMoveFromDoor],\n]);`;
  const norm = parseNormaliserEntries(normSrc);
  check('normaliser parser: 2 code entries, the commented one earns nothing', norm.length === 2 && !norm.some((n) => n.verb === 'ghost.move'),
    `parsed ${JSON.stringify(norm)}`);

  // 4 · planner-key parser: same comment-stripping proof.
  const planSrc = `planners.set(\n  'wall.move',\n  x,\n);\n// planners.set('ghost.move', y);`;
  const keys = parsePlannerKeys(planSrc);
  check('planner parser: 1 code key, the commented one earns nothing', keys.length === 1 && keys[0] === 'wall.move',
    `parsed ${JSON.stringify(keys)}`);

  // 5 · canonical-space agreement between the two registries.
  check('canon: normaliser fn and planner key meet in one semantic space',
    canonOfFn('normalizeToOpeningMoveFromDoor') === canonOfKey('opening.move')
    && canonOfFn('normalizeToWallMove') === canonOfKey('wall.move')
    && canonOfFn('normalizeToWallCreate') !== canonOfKey('wall.move'),
    'the fn↔key mapping is broken — reaching verbs would be mis-derived');

  // 6 · entry-point typing, both directions.
  const typedSrc = `preview(command: PreviewCommand): Promise<PreviewOutcome> {}`;
  const nullSrc = `preview(command: PreviewCommand): Promise<ConsequencePlan | null>;`;
  check('entry-point detector: typed says typed, bare-null says untyped',
    entryPointTyped(typedSrc).typed === true && entryPointTyped(nullSrc).typed === false,
    'the detector cannot tell §0.e\'s null collapse from a typed PreviewOutcome');

  // 7 · union parser: members in code, not in prose.
  const unionSrc = `/** the 'ghost' member is prose */\nexport type RelationshipType =\n  | 'hosts'\n  | 'sitsOn' // trailing note\n  | 'joinedTo';\nconst x = 'unrelated';`;
  const members = parseUnionMembers(unionSrc, 'RelationshipType');
  check('union parser: 3 members, prose and unrelated literals earn nothing',
    members.length === 3 && members.includes('joinedTo') && !members.includes('ghost'),
    `parsed ${JSON.stringify(members)}`);

  // 8 · refusal-reader chunker, both directions + prose proof.
  const graphSrc = [
    'export class G {',
    '    getA(id: string): Q {',
    "        const t = this.getTargets(id, 'aaa');",
    '        if (t.length > 0) return { ok: true, t };',
    "        return { ok: false, reason: 'x', detail: 'y' };",
    '    }',
    '    /** should return { ok: false } one day — prose earns nothing for ccc */',
    '    getB(id: string): string[] {',
    "        return this.getSources(id, 'bbb');",
    '    }',
    '}',
  ].join('\n');
  const capable = refusalCapableFamilies(graphSrc);
  check('refusal chunker: the refusing method credits aaa; the bare one denies bbb; prose earns nothing',
    capable.has('aaa') && !capable.has('bbb') && !capable.has('ccc'),
    `derived ${JSON.stringify([...capable])}`);

  // 9 · SATISFIABILITY (L-716) — the green state is REACHABLE, proven every run.
  const greenModel: AxisModel = {
    verbs: [{ verb: 'aaa.move', opClass: 'move' }, { verb: 'bbb.create', opClass: 'create' }],
    reaching: new Set(['aaa.move', 'bbb.create']),
    entryTyped: true,
    relationships: [
      { name: 'rel1', source: 'vocabulary', canRefuse: true, why: '' },
      { name: 'rel2', source: 'store-field', canRefuse: true, why: '' },
    ],
  };
  const green = classifyCells(greenModel);
  const greenVerdict = verdictOf({
    gate: 'satisfiability-fixture', floors: [{ what: 'cells', measured: green.cells, min: 1 }],
    lines: [], findings: green.findings.length, declared: 0,
  });
  check('SATISFIABILITY — a full-coverage registry state classifies to 0 findings and verdictOf returns exit 0',
    green.findings.length === 0 && green.structurallyAnswerableCells === 4 && green.cells === 4 && greenVerdict.code === 0,
    `findings=${green.findings.length}, answerable=${green.structurallyAnswerableCells}/${green.cells}, exit=${greenVerdict.code} — ` +
    'a gate that can never pass is a defect, not a standard (L-716)');

  // 10 · the broken fixture MUST be seen broken — the blind-comparator proof.
  const brokenModel: AxisModel = {
    ...greenModel,
    reaching: new Set(['aaa.move']),
    entryTyped: false,
    relationships: [
      { name: 'rel1', source: 'vocabulary', canRefuse: true, why: '' },
      { name: 'rel2', source: 'store-field', canRefuse: false, why: 'planted.' },
    ],
  };
  const broken = classifyCells(brokenModel);
  const brokenKeys = broken.findings.map((f) => f.key).sort();
  check('NEGATIVE — the planted silent verb and refusal-less relationship are both found, by key',
    brokenKeys.length === 2 && brokenKeys[0] === 'relationship:rel2/cannot-refuse' && brokenKeys[1] === 'verb:bbb.create/silent-dispatch'
    && broken.silentCells === 2 && broken.refusalBlockedCells === 1 && broken.structurallyAnswerableCells === 1,
    `found ${JSON.stringify(brokenKeys)} cells{silent=${broken.silentCells},blocked=${broken.refusalBlockedCells},ok=${broken.structurallyAnswerableCells}} — ` +
    'a classifier that calls the broken fixture clean publishes no verdict (§4.3)');

  // 11 · the entryTyped branch converts silence into honest refusal — and ONLY that.
  const typedBroken = classifyCells({ ...brokenModel, entryTyped: true });
  check('entryTyped flips silent-dispatch cells to honest-refusal without touching the relationship finding',
    typedBroken.findings.length === 1 && typedBroken.findings[0]!.key === 'relationship:rel2/cannot-refuse'
    && typedBroken.honestRefusalCells === 2 && typedBroken.silentCells === 0,
    `findings=${JSON.stringify(typedBroken.findings.map((f) => f.key))} honest=${typedBroken.honestRefusalCells}`);

  return { total, passed, lines };
}

// ── Run ──────────────────────────────────────────────────────────────────────

function main(): number {
  const floors: Floor[] = [];
  const lines: string[] = [];

  const control = selfTest();
  lines.push('EXECUTED CONTROLS (both directions + satisfiability, every run — C70 §5.6, L-716):');
  lines.push(...control.lines);
  lines.push('');
  floors.push({ what: `executed controls passed (${control.passed}/${control.total})`, measured: control.passed, min: control.total });

  const ledger: Ledger | null = existsSync(LEDGER_PATH)
    ? (JSON.parse(readFileSync(LEDGER_PATH, 'utf8')) as Ledger) : null;
  floors.push({ what: 'ledger relationship-determination.json present', measured: ledger ? 1 : 0, min: 1 });

  // ── ARM A · THE DENOMINATOR, derived from the registries ───────────────────
  const registryFiles = [REGISTER_PATH, SERVICE_PATH, COMPOSITION_PATH, GRAPH_HOME_PATH, DEP_FIELDS_PATH, CONSEQUENCE_PATH];
  const missing = registryFiles.filter((p) => !existsSync(p));
  floors.push({ what: 'registry source files present (register · service · composition · graph home · census · union)', measured: registryFiles.length - missing.length, min: registryFiles.length });
  if (missing.length > 0) {
    for (const p of missing) lines.push(`‼  REGISTRY SOURCE MISSING: ${p}`);
    return reportGate({ gate: 'check-relationship-determination (C78 §20 · U-INV-1 · tracker §-3)', floors, lines, findings: 0, declared: ledger?.declaredFindings.length ?? 0 });
  }

  // A1 · verbs — the (element kind × operation) axis, from the C69 register.
  const registerMd = readFileSync(REGISTER_PATH, 'utf8');
  const allVerbs = parseRegisterVerbs(registerMd);
  const verbs = allVerbs
    .map((verb) => ({ verb, opClass: opClassOf(verb) }))
    .filter((v): v is { verb: string; opClass: string } => v.opClass !== null);
  const families = new Set(verbs.map((v) => v.verb.split('.')[0]!));
  floors.push({ what: 'register verbs enumerated (C69, generated + CI-diffed)', measured: allVerbs.length, min: 250 });
  floors.push({ what: 'consequential verbs (C78 §1.5: create·delete·move·update·batch)', measured: verbs.length, min: 80 });
  floors.push({ what: 'element families carrying a consequential verb', measured: families.size, min: 15 });

  // A2 · relationships — C71 vocabulary ∪ §3.2 store-field census.
  const graphSrc = readFileSync(GRAPH_HOME_PATH, 'utf8');
  const vocab = parseUnionMembers(graphSrc, 'RelationshipType');
  floors.push({ what: 'C71 RelationshipType union members parsed from the home file', measured: vocab.length, min: 20 });

  const census = JSON.parse(readFileSync(DEP_FIELDS_PATH, 'utf8')) as {
    fields: { id: string; disposition: string; why: string }[];
    censusFloor: number;
  };
  floors.push({ what: `store-field census rows read (single shared ledger; its own censusFloor=${census.censusFloor})`, measured: census.fields.length, min: census.censusFloor });

  // A3 · the closed refusal vocabulary the third answer must draw from.
  const reasonMembers = parseUnionMembers(readFileSync(CONSEQUENCE_PATH, 'utf8'), 'UndeterminedReason');
  floors.push({ what: `UndeterminedReason union CLOSED at 11 members (measured ${reasonMembers.length})`, measured: reasonMembers.length === 11 ? 1 : 0, min: 1 });

  // ── ARM B · the axis facts ─────────────────────────────────────────────────
  const serviceSrc = readFileSync(SERVICE_PATH, 'utf8');
  const compositionSrc = readFileSync(COMPOSITION_PATH, 'utf8');
  const normalisers = parseNormaliserEntries(serviceSrc);
  const plannerKeys = parsePlannerKeys(compositionSrc);
  floors.push({ what: 'normaliser registry entries parsed (CONSEQUENCE_NORMALIZERS)', measured: normalisers.length, min: 3 });
  floors.push({ what: 'planner registry keys parsed (createConsequencePlanners)', measured: plannerKeys.length, min: 2 });

  const composedCanons = new Set(plannerKeys.map(canonOfKey));
  const reaching = new Set(
    normalisers.filter((n) => composedCanons.has(canonOfFn(n.fn))).map((n) => n.verb),
  );
  const entry = entryPointTyped(serviceSrc);

  const refusalCapable = refusalCapableFamilies(graphSrc);
  const relationships: RelationshipAxisRow[] = [
    ...vocab.map((name): RelationshipAxisRow => ({
      name,
      source: 'vocabulary',
      canRefuse: refusalCapable.has(name),
      why: refusalCapable.has(name)
        ? 'a refusal-bearing typed reader exists in the union home file (C71 §4.4 shape).'
        : 'no refusal-bearing reader in the union home file: the family is read (if at all) through bare getTargets/getSources, which returns [] for both "none" and "unknown" (C78 §5.2, §0.h).',
    })),
    ...census.fields.map((f): RelationshipAxisRow => ({
      name: f.id,
      source: 'store-field',
      canRefuse: f.disposition === 'POPULATE',
      why: `census disposition ${f.disposition} — ${f.disposition === 'POPULATE'
        ? 'written on every path AND a reactor re-derives on the named element changing.'
        : 'the field names a dependency (C78 §1.2a: a dependency is KNOWN the moment a field names it) that nothing can determine at mutation time, and no typed UNDETERMINED is produced.'}`,
    })),
  ];
  const cellsDenominator = verbs.length * relationships.length;
  floors.push({ what: 'DENOMINATOR — (element kind × operation) × relationship cells enumerated', measured: cellsDenominator, min: 2000 });

  // Producer scan — a measured fact line, not a verdict axis: are the typed
  // entry-point constructors called anywhere in production yet?
  const sources = collectSources(REPO, ['packages', 'apps', 'plugins']);
  floors.push({ what: 'production source files scanned for typed-refusal producers', measured: sources.length, min: 1500 });
  const producerRe = /\b(?:previewUnrecognisedVerb|previewPlannerNotComposed|previewInvalidRequest|previewPlannerThrew|undeterminedOutcome)\s*\(/;
  const producers = sources
    .filter((f) => f.rel !== 'packages/command-bus/src/consequence.ts' && producerRe.test(stripComments(f.text)))
    .map((f) => f.rel);

  // ── The classification ─────────────────────────────────────────────────────
  const model: AxisModel = { verbs, reaching, entryTyped: entry.typed, relationships };
  const reading = classifyCells(model);

  const opCounts = new Map<string, number>();
  for (const v of verbs) opCounts.set(v.opClass, (opCounts.get(v.opClass) ?? 0) + 1);
  const silentVerbCount = reading.findings.filter((f) => f.key.startsWith('verb:')).length;
  const cannotRefuseCount = reading.findings.filter((f) => f.key.startsWith('relationship:')).length;

  lines.push('ARM A — THE DENOMINATOR, derived (never hand-written — tracker §-3 rule 1):');
  lines.push(`  verbs: ${allVerbs.length} in the C69 register, of which ${verbs.length} consequential ` +
    `(${[...opCounts.entries()].map(([k, n]) => `${k} ${n}`).join(' · ')}) across ${families.size} element families.`);
  lines.push(`  relationships: ${vocab.length} C71 vocabulary members + ${census.fields.length} store-field census rows = ${relationships.length}.`);
  lines.push(`  cells: ${verbs.length} × ${relationships.length} = ${cellsDenominator}. A count of passing cells without this count is the empty-seed lie.`);
  lines.push('');
  lines.push('ARM B — the axis facts, measured from source this run:');
  lines.push(`  normaliser registry: ${normalisers.length} entries (${normalisers.map((n) => n.verb).join(', ')}).`);
  lines.push(`  planner registry: ${plannerKeys.length} composed keys (${plannerKeys.join(', ')}).`);
  lines.push(`  REACHING consequential verbs (normalised AND composed): ${[...reaching].filter((v) => verbs.some((x) => x.verb === v)).join(', ') || 'none'} ` +
    `— of the normalised set, ${[...reaching].filter((v) => !verbs.some((x) => x.verb === v)).join(', ') || 'none'} are outside the §1.5 consequential class or not register verbs.`);
  lines.push(`  preview entry point: ${entry.typed ? 'TYPED (PreviewOutcome)' : `BARE NULL (§0.e — ${entry.bareNullSites} null-returning signature(s), ${entry.typedSites} typed)`}. ` +
    `Typed-refusal constructors called in production: ${producers.length} file(s)${producers.length > 0 ? ` (${producers.slice(0, 4).join(', ')}${producers.length > 4 ? ', …' : ''})` : ''}.`);
  lines.push(`  refusal-capable relationships: ${relationships.filter((r) => r.canRefuse).map((r) => r.name).join(', ') || 'none'} ` +
    `(${relationships.filter((r) => r.canRefuse).length} of ${relationships.length}).`);
  lines.push('');
  lines.push('THE READING — every cell must answer DETERMINED-affected · DETERMINED-unaffected · UNDETERMINED+typed reason (C78 §1.1); no fourth answer:');
  lines.push(`  SILENT cells (the fourth answer, proven structurally): ${reading.silentCells} — ${silentVerbCount} silent verb(s) × ${relationships.length} relationships.`);
  lines.push(`  refusal-BLOCKED cells (reaching verb × relationship that cannot refuse, §1.4): ${reading.refusalBlockedCells}.`);
  lines.push(`  honest-refusal cells (typed UNSUPPORTED_ELEMENT_TYPE at a typed entry point): ${reading.honestRefusalCells}.`);
  lines.push(`  structurally-answerable cells (necessary conditions met; sufficiency UNPROVEN, see limits): ${reading.structurallyAnswerableCells}.`);
  lines.push(`  C78 §19.1 no-partial-credit ACROSS the product: this gate is not green until every one of the ${cellsDenominator} cells leaves the first two classes.`);
  lines.push('');

  // ── Ledger, both directions ────────────────────────────────────────────────
  const findings = reading.findings;
  const stale: string[] = [];
  if (ledger) {
    const measuredKeys = new Set(findings.map((f) => f.key));
    const declaredKeys = new Set(ledger.declaredFindings);
    lines.push(`FINDINGS: ${findings.length} (${silentVerbCount} silent verbs + ${cannotRefuseCount} refusal-less relationships) against a NAMED ledger of ${ledger.declaredFindings.length}.`);
    for (const f of findings) {
      lines.push(`  ${declaredKeys.has(f.key) ? '·' : '⛔ UNLEDGERED'} ${f.key} — ${f.detail}`);
    }
    for (const d of ledger.declaredFindings) {
      if (!measuredKeys.has(d)) {
        stale.push(d);
        lines.push(`  ⚠ STALE LEDGER ROW: "${d}" is declared but no longer measured — strike it in the commit that closed it.`);
      }
    }
    lines.push('');
  }

  lines.push('UNPROVEN — typed instrument limits, named so nothing here reads as coverage (C70 §2.2, C78 §20.5):');
  lines.push('  ◌ STATIC-REACHABILITY — composed ≠ reached at dispatch (C70 §4.2). MovePlanToolHandler\'s kind branch (C78 §5.4) is not measured here; a reaching verb\'s cells are answerable in structure, not proven answered.');
  lines.push('  ◌ PER-CELL-SUFFICIENCY — a composed planner may still not determine a given relationship (wall.move is composed; the tracker\'s own matrix holds 🔴 rows for it). Sufficiency is decided per family by the EXECUTED gates: check-move-propagation, check-execution-plan-agreement, c79MovePropagation.test.ts.');
  lines.push('  ◌ GRAPH-HOME-SCOPE — refusal-bearing readers are detected in the RelationshipType home file only; one living elsewhere is invisible to this arm and surfaces as a stale ledger row when found, never silently.');
  lines.push('  ◌ VERB-LIVENESS — the register\'s UNKNOWN-liveness verbs stay in the denominator (0A OQ5 unsettled; silence is not scoping, C78 §1.5). Declassifying one is a reviewable register change, not a gate edit.');
  lines.push('');
  lines.push(`SUBJECT SIZE: ${cellsDenominator} cells over ${verbs.length} consequential verbs × ${relationships.length} relationships; ` +
    `${findings.length} finding(s); ${control.passed}/${control.total} controls proven, satisfiability included.`);

  return reportGate({
    gate: 'check-relationship-determination (C78 §20 · U-INV-1 · tracker §-3)',
    floors,
    lines,
    findings: findings.length,
    declared: ledger?.declaredFindings.length ?? 0,
    findingNames: findings.map((f) => f.key),
    stale,
  });
}

process.exit(main());
