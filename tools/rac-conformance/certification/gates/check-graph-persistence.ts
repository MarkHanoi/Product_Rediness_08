// ─── GATE · check-graph-persistence ──────────────────────────────────────────
//
// C71 §6 (`check-graph-persistence`) · C70 §5 exit-code contract ·
// C70 I-INV-2 (persist-or-lose is enumerated BY NAME, shrink-only) ·
// C70 I-INV-3 (a pre-graph snapshot loses nothing SILENTLY).
//
// WHICH GRAPH (C71 §6.1): this gate measures **SemanticGraph** — the serialized
// `ProjectSnapshot.semanticGraph` slice and its rebuild path. Not the UBG, not
// RoomGraphService (C71 §4.3).
//
// ─── The five arms ───────────────────────────────────────────────────────────
//   ARM A · CLASSIFICATION. Every declared `RelationshipType` member is
//           classified REGENERATED-BY-LOADER (reconstructed from authoritative
//           element state by `rebuildSemanticGraphFromSnapshot`),
//           REGENERATED-BY-FLUSH (a declared REGENERATED disposition in the
//           union's own docblock — `joinedTo`, C71 §3.6), or PERSIST-ONLY.
//           There is no third state and no unclassified member, by construction:
//           the table prints all three readings so they never collapse into one
//           green tick.
//   ARM B · THE LEDGER. The PERSIST-ONLY-WITH-A-LIVE-WRITER set must equal the
//           named, shrink-only ledger in graph-persistence-debt.json. C71 §5.4
//           measured that list as PROSE in EV-05 §3 with no gate — "a ledger in
//           a document is not a ledger" (§7.k); this file makes it mechanical.
//           An unlisted persist-or-lose family is the surprise I-INV-2 forbids
//           (a finding, which lands unledgered → exit 3); a ledger row no longer
//           measured is STALE and exits 3 (C70 §5.4).
//           Families with NO live writer are classified but not ledgered: an
//           edge nobody writes carries no data to lose, and ratcheting over it
//           would count air (C71 §0).
//   ARM C · NAMED LOSS AT LOAD (I-INV-3). Loading a snapshot that lacks a
//           persist-only family must REPORT the named loss. Statically decided:
//           (c1) every loader call site of the rebuild consumes and reports the
//           `unreconstructable` result rather than discarding it; (c2) every
//           persist-only-with-writer family is NAMED by the rebuild's
//           `unreconstructable` push set — a family that is neither regenerated
//           nor named is a SILENT loss. What is NOT decidable statically — that
//           the report actually reaches a user — prints UNPROVEN with its
//           reason, never green.
//   ARM D · ONE REBUILD. The rebuild function exists in EXACTLY ONE file.
//           C71 §5.3 measured TWO byte-identical copies (§7.j: a rebuild widened
//           in one copy and not the other is a divergence no test would see);
//           this arm counts definitions from source and reports the measured
//           number every run — more than one is a finding.
//   ARM E · MALFORMED EDGES. `deserialize` must COUNT AND REPORT the edges it
//           drops. C71 §5.7: a defect that self-erases on reload is a defect
//           nobody can reproduce. The arm inspects the drop branch for a
//           counter/report; silent discard is a finding.
//
// ─── The floor, stated honestly ──────────────────────────────────────────────
// C71 §6 floors this gate at "snapshot records compared > 0 and rebuild copies
// located ≥ 1". This is a STATIC gate: it compares no live snapshot records —
// the executed comparison over an artefact belongs to check-derived-regenerable
// and the persistence cert suite. The floor here is the static equivalent, each
// part a misconfiguration detector: union members parsed ≥ 20 · rebuild
// definitions located ≥ 1 · the serialize()/deserialize() pair located · source
// files scanned ≥ 1500 · executed controls passed. The record-level half is
// printed as a named UNPROVEN residual on every run, never silently assumed.
//
// ─── Executed controls, both directions, every run (C70 §5.6) ────────────────
// selfTest() drives the same analyser over synthetics: a planted unledgered
// persist-only family MUST go red; a loader-regenerated family MUST NOT be
// called persist-only; a writer that exists only inside a comment MUST earn no
// credit; a deserialize that counts its drops MUST pass ARM E while the silent
// shape MUST fail it. A control that fails exits 2 — a blind comparator never
// publishes a verdict.

import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { reportGate, type GateResult, type Floor } from '../contract.js';
import { collectSources, type SourceFile } from './scan.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, '../../../..');
const LEDGER_PATH = resolve(__dirname, 'graph-persistence-debt.json');

const UNION_FILE = 'packages/core-app-model/src/SemanticGraph.ts';
const REBUILD_FILE_HINT = 'rebuildSemanticGraph.ts';
/** Different graphs with an overlapping vocabulary — C71 §4.3 / §7.g. */
const OTHER_GRAPH_PATHS = [
  'packages/building-graph/',
  'apps/editor/src/engine/buildBuildingGraph.ts',
  'packages/room-topology/src/TopologyLayer.ts',
];

interface LedgerRow { family: string; why: string }
interface LedgerFinding { key: string; why: string }
interface Ledger { persistOnly: LedgerRow[]; declaredFindings: LedgerFinding[] }

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Line-preserving comment strip, so prose never earns credit. */
function stripComments(src: string): string {
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

export function parseUnion(src: string): string[] {
  const clean = stripComments(src);
  const start = clean.indexOf('RelationshipType =');
  if (start < 0) return [];
  const end = clean.indexOf(';', start);
  const body = end < 0 ? clean.slice(start) : clean.slice(start, end);
  const out: string[] = [];
  const re = /\|\s*'([A-Za-z][A-Za-z0-9_]*)'/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) out.push(m[1]!);
  return [...new Set(out)];
}

/**
 * REGENERATED dispositions declared in the union's own docblock. Scoped to the
 * docblock's SUBJECT LINE — the first non-empty content line must name the
 * family — because `joinedTo`'s block names `connectedTo` in CONTRAST ("NOT
 * `connectedTo`: …") and a block-scoped rule hands the disposition to the
 * wrong family (a false positive measured on this exact file by the sibling
 * ga-gate implementation; the narrowing is inherited from it).
 */
export function declaredRegenerated(unionSrc: string, types: readonly string[]): string[] {
  const out: string[] = [];
  const blocks = unionSrc.match(/\/\*\*[\s\S]*?\*\//g) ?? [];
  const declares = /Rebuild disposition[^\n]*:\s*REGENERATED/;
  for (const t of types) {
    const subject = new RegExp(`^\\s*\\*?\\s*\`${t}\``);
    const isAbout = (b: string): boolean => {
      const first = b.split('\n').slice(1).find((l) => l.replace(/^\s*\*?\s*/, '').length > 0) ?? '';
      return subject.test(first);
    };
    if (blocks.some((b) => isAbout(b) && declares.test(b))) out.push(t);
  }
  return out;
}

/** Families the rebuild reconstructs: `addRel(a, b, 'X')` literals. */
export function loaderRegeneratedOf(rebuildClean: string): string[] {
  const out = new Set<string>();
  const re = /\baddRel\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(rebuildClean)) !== null) {
    const open = rebuildClean.indexOf('(', m.index);
    let depth = 0; let i = open;
    const cap = Math.min(rebuildClean.length, open + 300);
    for (; i < cap; i++) {
      const c = rebuildClean[i]!;
      if (c === '(') depth++;
      else if (c === ')') { depth--; if (depth === 0) break; }
    }
    const args = rebuildClean.slice(open, Math.min(i + 1, cap));
    const lit = /'([A-Za-z][A-Za-z0-9_]*)'/.exec(args);
    if (lit) out.add(lit[1]!);
  }
  return [...out];
}

/** Families the rebuild NAMES as lost: `unreconstructable.push('X')`. */
export function namedLostOf(rebuildClean: string): string[] {
  const out = new Set<string>();
  const re = /unreconstructable\s*\.\s*push\s*\(\s*'([A-Za-z][A-Za-z0-9_]*)'/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(rebuildClean)) !== null) out.add(m[1]!);
  return [...out];
}

/** Live writers per family: `addRelationship({ … type: 'X' … })` in production. */
export function writersOf(
  files: readonly Pick<SourceFile, 'rel' | 'text'>[],
  types: readonly string[],
): Map<string, string[]> {
  const writers = new Map<string, string[]>(types.map((t) => [t, []]));
  for (const f of files) {
    if (f.rel.endsWith(UNION_FILE) || f.rel === UNION_FILE) continue;
    if (f.rel.includes(REBUILD_FILE_HINT)) continue; // the rebuild is not a LIVE writer
    if (OTHER_GRAPH_PATHS.some((p) => f.rel === p || f.rel.startsWith(p))) continue;
    if (f.rel.includes('/dist/') || f.rel.includes('/dist-gate/') || f.rel.includes('/dist-apex/')) continue;
    const clean = stripComments(f.text);
    if (!clean.includes('addRelationship')) continue;
    const re = /addRelationship\s*\(/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(clean)) !== null) {
      const window = clean.slice(m.index, m.index + 400);
      for (const t of types) {
        if (new RegExp(`type\\s*:\\s*['"]${t}['"]`).test(window)) writers.get(t)!.push(f.rel);
      }
    }
  }
  return writers;
}

/**
 * ARM E — does the deserialize body count-and-report its drops? The drop branch
 * must do SOMETHING with an invalid edge other than fall through: a counter, a
 * collection, or a report call reachable from an else/guard branch.
 */
export function deserializeCountsDrops(deserializeBody: string): boolean {
  const clean = stripComments(deserializeBody);
  // An else-branch (or early-continue guard) touching a counter/collector/report.
  return /else\s*\{[^}]*(\+\+|\+=|push\s*\(|console\.|report|dropped|malformed)/s.test(clean)
    || /(dropped|malformed|invalid)\w*\s*(\+\+|\+=|\.push\s*\()/.test(clean);
}

/** Extract a method body by name from a class source (balanced-brace walk). */
export function methodBody(src: string, name: string): string | null {
  const m = new RegExp(`\\b${name}\\s*\\([^)]*\\)\\s*(?::[^{]+)?\\{`).exec(src);
  if (!m) return null;
  let depth = 0;
  for (let i = m.index + m[0].length - 1; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(m.index, i + 1); }
  }
  return null;
}

type Classification = 'regenerated-loader' | 'regenerated-flush' | 'persist-only';
interface Finding { key: string; detail: string }

export interface AnalysisInput {
  declared: string[];
  unionSrc: string;
  rebuildFiles: Array<{ rel: string; text: string }>;
  /** files that CALL the rebuild (loader call sites), with their text */
  loaderCallSites: Array<{ rel: string; text: string }>;
  writerFiles: Array<Pick<SourceFile, 'rel' | 'text'>>;
  ledger: Ledger;
  deserializeBody: string | null;
}

export function analyse(inp: AnalysisInput): {
  findings: Finding[];
  classification: Map<string, Classification>;
  writers: Map<string, string[]>;
  persistOnlyWithWriter: string[];
  namedLost: string[];
  loaderRegenerated: string[];
  unproven: string[];
} {
  const findings: Finding[] = [];
  const unproven: string[] = [];

  const rebuildClean = inp.rebuildFiles.map((f) => stripComments(f.text)).join('\n');
  const loaderRegenerated = loaderRegeneratedOf(rebuildClean).filter((t) => inp.declared.includes(t));
  const flushRegenerated = declaredRegenerated(inp.unionSrc, inp.declared);
  const namedLost = namedLostOf(rebuildClean);

  // ── ARM A · classification, no third state ────────────────────────────────
  const classification = new Map<string, Classification>();
  for (const t of inp.declared) {
    classification.set(
      t,
      loaderRegenerated.includes(t) ? 'regenerated-loader'
        : flushRegenerated.includes(t) ? 'regenerated-flush'
          : 'persist-only',
    );
  }

  // ── writers ───────────────────────────────────────────────────────────────
  const writers = writersOf(inp.writerFiles, inp.declared);
  const persistOnlyWithWriter = inp.declared.filter(
    (t) => classification.get(t) === 'persist-only' && (writers.get(t)?.length ?? 0) > 0,
  );

  // ── ARM B · persist-only set == the named ledger, both directions ─────────
  const ledgered = new Set(inp.ledger.persistOnly.map((r) => r.family));
  for (const t of persistOnlyWithWriter) {
    if (!ledgered.has(t)) {
      findings.push({
        key: `${t}/persist-only-unledgered`,
        detail: `family '${t}' is PERSIST-ONLY with ${writers.get(t)!.length} live writer(s) (e.g. ${writers.get(t)![0]}) and is NOT on the persist-or-lose ledger — the unnamed surprise C70 I-INV-2 forbids.`,
      });
    }
  }
  // (stale rows are computed by the caller against the contract's `stale` channel)

  // ── ARM C · named loss at load ────────────────────────────────────────────
  for (const site of inp.loaderCallSites) {
    const clean = stripComments(site.text);
    const uses = (clean.match(/\bunreconstructable\b/g) ?? []).length;
    // 1 mention = the destructure alone; the result is discarded.
    if (clean.includes('rebuildSemanticGraphFromSnapshot(') && uses < 2) {
      findings.push({
        key: `loader/discards-unreconstructable:${basename(site.rel)}`,
        detail: `ARM C — ${site.rel} calls the rebuild but never consumes 'unreconstructable': the named loss is computed and thrown away, so the load is silent (C70 I-INV-3).`,
      });
    }
  }
  for (const t of persistOnlyWithWriter) {
    if (!namedLost.includes(t)) {
      findings.push({
        key: `${t}/loss-not-named-at-load`,
        detail: `ARM C — persist-only family '${t}' is neither regenerated nor named by the rebuild's unreconstructable set: a snapshot lacking it loads SILENTLY (C70 I-INV-3).`,
      });
    }
  }
  unproven.push(
    'ARM C residual: the named loss is reported via console.warn at the loader call sites — that a USER ' +
    'ever sees it is UNPROVEN here (static gate; no UI/report-surface arm exists yet).',
  );

  // ── ARM D · exactly one rebuild ───────────────────────────────────────────
  if (inp.rebuildFiles.length > 1) {
    const bodies = inp.rebuildFiles.map((f) => stripComments(f.text).replace(/\s+/g, ' '));
    const identical = bodies.every((b) => b === bodies[0]);
    findings.push({
      key: `rebuild/duplicated:${inp.rebuildFiles.length}-copies`,
      detail: `ARM D — the semantic-graph rebuild is defined in ${inp.rebuildFiles.length} files (${inp.rebuildFiles.map((f) => f.rel).join(' · ')}), ${identical ? 'byte-identical today' : 'ALREADY DIVERGED'} — a rebuild widened in one copy and not the other is a loss no test would see (C71 §5.3 / §7.j).`,
    });
  }

  // ── ARM E · malformed edges counted and reported ──────────────────────────
  if (inp.deserializeBody !== null && !deserializeCountsDrops(inp.deserializeBody)) {
    findings.push({
      key: 'deserialize/silent-malformed-drop',
      detail: `ARM E — SemanticGraphManager.deserialize drops any edge missing id/type/sourceId/targetId WITHOUT counting or reporting it (C71 §5.7): a malformed edge is written and saved without complaint and vanishes on the next load — a defect that self-erases is a defect nobody can reproduce.`,
    });
  }
  unproven.push(
    'ARM E residual: how many malformed edges real snapshots carry is UNPROVEN here — this arm inspects ' +
    'the drop branch, it compares no live snapshot records (that comparison belongs to the executed ' +
    'persistence suite / check-derived-regenerable).',
  );

  return { findings, classification, writers, persistOnlyWithWriter, namedLost, loaderRegenerated, unproven };
}

// ── Executed controls (C70 §5.6) ─────────────────────────────────────────────
function selfTest(): { ok: boolean; lines: string[] } {
  const lines: string[] = [];
  let ok = true;
  const fail = (m: string): void => { ok = false; lines.push(`    ✗ BLIND COMPARATOR — ${m}`); };
  const pass = (m: string): void => { lines.push(`    ✓ ${m}`); };

  const unionSrc = [
    '/**',
    ' * `flushed` — synthetic.',
    ' *',
    ' * Rebuild disposition (test): REGENERATED. Not rebuilt from the snapshot.',
    ' */',
    "export type RelationshipType = | 'rebuilt' | 'orphan' | 'flushed' | 'ghost';",
  ].join('\n');
  const inp: AnalysisInput = {
    declared: ['rebuilt', 'orphan', 'flushed', 'ghost'],
    unionSrc,
    rebuildFiles: [{
      rel: 'packages/synthetic/src/loader/rebuildSemanticGraph.ts',
      text: `addRel(a.id, b.id, 'rebuilt');\nconst unreconstructable = [];\n`,
    }],
    loaderCallSites: [{
      rel: 'packages/synthetic/src/loader/GoodLoader.ts',
      text: `const { added, unreconstructable } = rebuildSemanticGraphFromSnapshot(s);\nif (unreconstructable.length) console.warn(unreconstructable.join(','));`,
    }, {
      rel: 'packages/synthetic/src/loader/BadLoader.ts',
      text: `const { added, unreconstructable } = rebuildSemanticGraphFromSnapshot(s);`,
    }],
    writerFiles: [{
      rel: 'packages/synthetic/src/writers.ts',
      text: [
        `sgm.addRelationship({ type: 'orphan', sourceId: a, targetId: b });`,
        `sgm.addRelationship({ type: 'rebuilt', sourceId: a, targetId: b });`,
        `// sgm.addRelationship({ type: 'ghost', sourceId: a, targetId: b });`,
      ].join('\n'),
    }],
    ledger: { persistOnly: [], declaredFindings: [] },
    deserializeBody: null,
  };
  const a = analyse(inp);
  const keys = new Set(a.findings.map((f) => f.key));

  // 1. NEGATIVE — persist-only with a live writer, not ledgered → flagged.
  if (keys.has('orphan/persist-only-unledgered')) pass("NEGATIVE: planted persist-only family 'orphan' (live writer, no ledger row) was FLAGGED");
  else fail("planted unledgered persist-only 'orphan' was NOT flagged — ARM B is blind");

  // 2. POSITIVE — loader-regenerated family with a writer is NOT persist-only.
  if (!keys.has('rebuilt/persist-only-unledgered') && a.classification.get('rebuilt') === 'regenerated-loader') {
    pass("POSITIVE: loader-regenerated 'rebuilt' was classified regenerated-loader and produced NO persist-only finding");
  } else fail("loader-regenerated 'rebuilt' was misclassified — the gate would be stuck red on a correct tree");

  // 3. FLUSH disposition — subject-line docblock grants it; ghost gets nothing.
  if (a.classification.get('flushed') === 'regenerated-flush') pass("DISPOSITION: docblock-declared REGENERATED 'flushed' classified regenerated-flush");
  else fail("a docblock-declared REGENERATED disposition was not honoured");

  // 4. COMMENT-BLINDNESS — a writer that exists only in a comment earns nothing.
  if ((a.writers.get('ghost')?.length ?? 0) === 0 && a.classification.get('ghost') === 'persist-only' && !keys.has('ghost/persist-only-unledgered')) {
    pass("COMMENT-BLINDNESS: comment-only writer for 'ghost' earned NO writer credit (and no-writer families are never ledger-ratcheted)");
  } else fail("'ghost' was credited a writer from a comment — prose is proving coverage");

  // 5. ARM C — a loader that discards `unreconstructable` is flagged; one that
  //    consumes it is not.
  if (keys.has('loader/discards-unreconstructable:BadLoader.ts') && !keys.has('loader/discards-unreconstructable:GoodLoader.ts')) {
    pass('ARM C: the loader that DISCARDS unreconstructable was FLAGGED; the one that reports it was not');
  } else fail('ARM C cannot tell a discarding loader from a reporting one');

  // 6. ARM E — silent drop flagged, counting drop passes.
  const silent = `deserialize(data) { for (const rel of data.relationships) { if (rel.id && rel.type) { this._rels.set(rel.id, rel); } } }`;
  const counting = `deserialize(data) { let dropped = 0; for (const rel of data.relationships) { if (rel.id && rel.type) { this._rels.set(rel.id, rel); } else { dropped++; } } if (dropped) console.warn(dropped); }`;
  if (!deserializeCountsDrops(silent) && deserializeCountsDrops(counting)) {
    pass('ARM E: the silent-drop deserialize shape FAILS the arm and the counting shape PASSES it');
  } else fail('ARM E cannot tell a counting deserialize from a silent one');

  return { ok, lines };
}

// ── Run ──────────────────────────────────────────────────────────────────────
function main(): number {
  const floors: Floor[] = [];
  const lines: string[] = [];

  const control = selfTest();
  lines.push('EXECUTED CONTROLS (both directions, every run):');
  lines.push(...control.lines);
  lines.push('');
  floors.push({ what: 'executed controls passed', measured: control.ok ? 6 : 0, min: 6 });

  const ledger: Ledger | null = existsSync(LEDGER_PATH)
    ? (JSON.parse(readFileSync(LEDGER_PATH, 'utf8')) as Ledger) : null;
  floors.push({ what: 'graph-persistence-debt.json ledger present', measured: ledger ? 1 : 0, min: 1 });

  const unionPath = resolve(REPO, UNION_FILE);
  const unionSrc = existsSync(unionPath) ? readFileSync(unionPath, 'utf8') : '';
  const declared = parseUnion(unionSrc);
  floors.push({ what: 'RelationshipType members parsed from source', measured: declared.length, min: 20 });

  const sources = collectSources(REPO, ['packages', 'apps', 'plugins']);
  floors.push({ what: 'production source files scanned', measured: sources.length, min: 1500 });

  // Rebuild DEFINITIONS (not imports, not call sites): a file that declares the
  // function body. Both historical names are searched, so a resurrected copy
  // under the old `_rebuildSemanticGraph` name is still counted (C71 §5.3).
  const DEF_RE = /(function\s+rebuildSemanticGraphFromSnapshot\s*\(|(?:private|protected|public)\s+_rebuildSemanticGraph\s*\(|^\s*_rebuildSemanticGraph\s*\([^)]*\)\s*(?::[^{]+)?\{)/m;
  const rebuildFiles = sources
    .filter((f) => DEF_RE.test(stripComments(f.text)))
    .map((f) => ({ rel: f.rel, text: f.text }));
  floors.push({ what: 'rebuild implementations located from source', measured: rebuildFiles.length, min: 1 });

  const deserializeBody = methodBody(unionSrc, 'deserialize');
  floors.push({ what: 'SemanticGraphManager.deserialize located', measured: deserializeBody ? 1 : 0, min: 1 });
  const serializeBody = methodBody(unionSrc, 'serialize');
  floors.push({ what: 'SemanticGraphManager.serialize (the snapshot graph slice writer) located', measured: serializeBody ? 1 : 0, min: 1 });

  const loaderCallSites = sources
    .filter((f) => !rebuildFiles.some((r) => r.rel === f.rel))
    .filter((f) => stripComments(f.text).includes('rebuildSemanticGraphFromSnapshot('))
    .map((f) => ({ rel: f.rel, text: f.text }));
  floors.push({ what: 'loader call sites of the rebuild located', measured: loaderCallSites.length, min: 1 });

  let findings: Finding[] = [];
  let stale: string[] = [];
  if (ledger && floors.every((f) => f.measured >= f.min)) {
    const a = analyse({
      declared, unionSrc, rebuildFiles, loaderCallSites,
      writerFiles: sources, ledger, deserializeBody,
    });
    findings = a.findings;

    lines.push(`ARM A — CLASSIFICATION of all ${declared.length} declared members (no third state):`);
    const byClass: Record<Classification, string[]> = {
      'regenerated-loader': [], 'regenerated-flush': [], 'persist-only': [],
    };
    for (const t of declared) byClass[a.classification.get(t)!].push(t);
    lines.push(`  regenerated-by-loader (${byClass['regenerated-loader'].length}): ${byClass['regenerated-loader'].join(', ')}`);
    lines.push(`  regenerated-by-flush  (${byClass['regenerated-flush'].length}): ${byClass['regenerated-flush'].join(', ')}`);
    lines.push(`  persist-only          (${byClass['persist-only'].length}): ${byClass['persist-only'].join(', ')}`);
    lines.push('');
    lines.push('ARM B — persist-only families WITH a live writer (the persist-or-lose set):');
    for (const t of a.persistOnlyWithWriter) {
      const w = a.writers.get(t)!;
      lines.push(`  ${t.padEnd(20)} ${w.length} writer(s) — ${[...new Set(w)].slice(0, 2).join(', ')}`);
    }
    if (a.persistOnlyWithWriter.length === 0) lines.push('  (none measured)');
    lines.push('');
    lines.push(`ARM C — rebuild names as lost: ${a.namedLost.join(', ') || '(none)'} · loader call sites: ${loaderCallSites.map((s) => s.rel).join(' · ')}`);
    lines.push(`ARM D — rebuild definitions located: ${rebuildFiles.length} (${rebuildFiles.map((f) => f.rel).join(' · ')})` +
      (rebuildFiles.length === 1
        ? ' — C71 §5.3 measured TWO byte-identical copies on 2026-08-12; this run measures ONE: the duplication has been paid down since, and §5.3 is superseded by this reading (C71 §0.1).'
        : ''));
    lines.push('');
    lines.push('UNPROVEN — named, never green (C70 §3.4 / §2.2):');
    for (const u of a.unproven) lines.push(`  ◌ ${u}`);
    lines.push('');

    // Ledger, both directions.
    const measuredKeys = new Set(findings.map((f) => f.key));
    const declaredKeys = new Set(ledger.declaredFindings.map((d) => d.key));
    // A persist-only ledger ROW whose family is no longer measured persist-only
    // is stale (it left the class without leaving the ledger).
    for (const row of ledger.persistOnly) {
      if (!a.persistOnlyWithWriter.includes(row.family)) {
        stale.push(`persistOnly:${row.family}`);
        lines.push(`  ⚠ STALE LEDGER ROW: '${row.family}' is on the persist-or-lose ledger but is no longer measured persist-only-with-writer — strike it in the commit that changed its class.`);
      }
    }
    lines.push(`FINDINGS: ${findings.length} against a NAMED ledger of ${ledger.declaredFindings.length}.`);
    for (const f of findings) {
      lines.push(`  ${declaredKeys.has(f.key) ? '·' : '⛔ UNLEDGERED'} ${f.key} — ${f.detail}`);
    }
    for (const d of ledger.declaredFindings) {
      if (!measuredKeys.has(d.key)) {
        stale.push(d.key);
        lines.push(`  ⚠ STALE LEDGER ENTRY: "${d.key}" declared but no longer measured — strike it in the commit that fixed it.`);
      }
    }
  }

  const result: GateResult = {
    gate: 'check-graph-persistence (C71 §6 · C70 I-INV-2/I-INV-3)',
    floors,
    lines,
    findings: findings.length,
    declared: ledger?.declaredFindings.length ?? 0,
    findingNames: findings.map((f) => f.key),
    stale,
  };
  return reportGate(result);
}

process.exit(main());
