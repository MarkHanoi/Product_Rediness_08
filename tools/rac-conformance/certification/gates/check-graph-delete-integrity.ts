// ─── GATE · check-graph-delete-integrity ─────────────────────────────────────
//
// C71 §6 (`check-graph-delete-integrity`) · C70 §5 exit-code contract ·
// C70 F-INV-2 (deletes propagate; never an empty cascade BY DESIGN).
//
// WHICH GRAPH (C71 §6.1): this gate measures **SemanticGraph**
// (`packages/core-app-model/src/SemanticGraph.ts`) and nothing else. The UBG and
// RoomGraphService are different graphs with overlapping vocabulary (C71 §4.3).
//
// ─── What this gate decides ──────────────────────────────────────────────────
// "No kind strands its edges." Per element kind of the element registry
// (`ElementType`, packages/core-app-model/src/CoreElement.ts), FOUR arms:
//
//   ARM A · PURGE.   The kind's delete path calls
//                    `semanticGraphManager.removeAllRelationshipsForElement`
//                    (or delegates to a mapped path that does). A delete that
//                    leaves edges pointing at a dead id is the pre-3ee632f6
//                    wall defect: a well-formed edge at a deleted id is NOT
//                    self-erasing — it survives serialize/deserialize forever.
//   ARM B · UNDO.    Undo restores the purged edges. Three readings, printed as
//                    three different words because they are three different
//                    capabilities (commit 3ee632f6 is the REFERENCE SHAPE):
//                      VERBATIM      — edges captured BEFORE the purge and
//                                      re-added from the capture (the wall
//                                      family's `_captureRelationships` /
//                                      `_restoreRelationships` pair).
//                      RECONSTRUCTED — undo re-authors edges from the kind's own
//                                      snapshot (beam re-adds sitsOn/supports).
//                                      3ee632f6's own rationale says why this is
//                                      weaker: edges AUTHORED BY OTHER ELEMENTS'
//                                      COMMANDS (boundedBy from room detection,
//                                      supports from AssignBeamSupports) are
//                                      invisible in the kind's snapshot and are
//                                      NOT re-authored. A finding.
//                      NONE          — the purge runs and undo restores nothing.
//                                      Delete+undo silently deletes the kind's
//                                      graph presence. A finding.
//   ARM C · EMPTY CASCADE BY DESIGN (C70 F-INV-2). A delete path that DECLARES
//                    an empty cascade (literal `consequences: []` / `cascade: []`
//                    returned, or a comment stating no cascade is needed) is a
//                    finding.
//   ARM D · "ANOTHER MECHANISM DOES THE PURGE". A comment in a delete path that
//                    asserts some OTHER mechanism removes the relationships,
//                    while the path itself neither purges nor delegates to a
//                    mapped path that does — the two-mechanisms-each-assuming-
//                    the-other defect. A finding.
//
// ─── What is STATIC here and what is UNPROVEN (printed on every run) ─────────
// Discovery is static. Therefore, per the C71 §6 exit condition ("the undo half
// proven by EXECUTED READ-BACK rather than by the presence of a restore call"):
//   • ARM B's VERBATIM reading proves the RESTORE CALL EXISTS, never that the
//     restored edges are byte-equal to the purged ones. That half is UNPROVEN
//     here and says so.
//   • ARM C can only see a DECLARED empty cascade. A cascade that computes empty
//     at runtime is invisible; that half is UNPROVEN and says so.
// A static arm that cannot decide prints UNPROVEN with a named reason — it never
// prints green for the half it did not measure.
//
// ─── Subject discovery, and the floor ────────────────────────────────────────
// The kind list is parsed FROM SOURCE (the `ElementType` union) — never typed
// into this gate. The kind → delete-path mapping is DECLARED in the ledger
// (graph-delete-integrity-debt.json), because which file owns a kind's delete is
// a repository decision a human wrote and a reviewer can refuse. The floor:
// every parsed kind must have a mapping row and every mapped file must exist —
// discovering fewer kinds than the registry declares means the walk missed
// kinds, and a purge report over a subset is not a purge report (exit 2).
//
// A kind may map to SEVERAL paths (roof: DeleteRoofCommand AND the roof branch
// of DeleteElementCommand). Each path is assessed SEPARATELY: two producers
// where one purges and one does not is exactly the divergence this gate exists
// to catch, and crediting the kind from its better producer would hide it.
//
// ─── Executed controls, both directions, every run (C70 §5.6) ────────────────
// The analyser is pure over a file corpus, and selfTest() drives it over
// synthetic trees before the real tree is graded: a planted purge-less delete
// MUST go red; a planted full verbatim shape MUST read clean; a planted
// "another mechanism purges" comment MUST fire ARM D; a purge that exists only
// inside a comment MUST earn no credit. A control that fails exits 2 — a blind
// comparator must never publish a verdict.

import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { reportGate, type GateResult, type Floor } from '../contract.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, '../../../..');
const LEDGER_PATH = resolve(__dirname, 'graph-delete-integrity-debt.json');

// ── Ledger shape ─────────────────────────────────────────────────────────────
interface PathDecl {
  /** repo-relative file of the delete path */
  file: string;
  /**
   * Optional branch anchors inside a shared multi-kind command file
   * (DeleteElementCommand). `executeMarker` scopes the execute() branch
   * (`this.elementType = '<m>'`); `undoMarker` scopes the undo() branch
   * (`case '<m>':`). Absent ⇒ the whole file is the scope.
   */
  marker?: string;
}
interface KindRow { kind: string; paths: PathDecl[]; note?: string }
interface LedgerFinding { key: string; why: string }
interface Ledger {
  registryFile: string;
  kinds: KindRow[];
  declaredFindings: LedgerFinding[];
}

// ── Small helpers (self-contained; no external binaries — L-811) ─────────────

/** Line-preserving comment strip, so credit is never earned from prose. */
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

/** The comments of a source, one string per comment, with their line numbers. */
function commentsOf(src: string): Array<{ line: number; text: string }> {
  const out: Array<{ line: number; text: string }> = [];
  const lines = src.split('\n');
  let inBlock = false;
  let buf: string[] = [];
  let start = 0;
  for (let n = 0; n < lines.length; n++) {
    const line = lines[n]!;
    if (inBlock) {
      const end = line.indexOf('*/');
      if (end >= 0) { buf.push(line.slice(0, end)); out.push({ line: start + 1, text: buf.join('\n') }); buf = []; inBlock = false; }
      else buf.push(line);
      continue;
    }
    const bs = line.indexOf('/*');
    const ls = line.indexOf('//');
    if (ls >= 0 && (bs < 0 || ls < bs)) { out.push({ line: n + 1, text: line.slice(ls + 2) }); continue; }
    if (bs >= 0) {
      const end = line.indexOf('*/', bs + 2);
      if (end >= 0) out.push({ line: n + 1, text: line.slice(bs + 2, end) });
      else { inBlock = true; start = n; buf = [line.slice(bs + 2)]; }
    }
  }
  return out;
}

/** Parse a string-literal union (`ElementType`) from source, comments stripped. */
export function parseKindUnion(src: string, typeName: string): string[] {
  const clean = stripComments(src);
  const start = clean.indexOf(`${typeName} =`);
  if (start < 0) return [];
  const end = clean.indexOf(';', start);
  const body = end < 0 ? clean.slice(start) : clean.slice(start, end);
  const out: string[] = [];
  const re = /\|\s*'([A-Za-z][A-Za-z0-9-]*)'/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) out.push(m[1]!);
  return [...new Set(out)];
}

// ── Scope extraction ─────────────────────────────────────────────────────────

interface Scope { execRaw: string; execClean: string; undoRaw: string; undoClean: string; whole: boolean }

/**
 * Slice a shared multi-kind file into the one kind's execute and undo scopes.
 * Boundaries are the next sibling anchor of the SAME shape, so a branch never
 * inherits its neighbour's purge call.
 */
function scopeOf(raw: string, marker?: string): Scope | null {
  if (!marker) {
    const clean = stripComments(raw);
    return { execRaw: raw, execClean: clean, undoRaw: raw, undoClean: clean, whole: true };
  }
  const clean = stripComments(raw);
  // execute branch: from `this.elementType = '<marker>'` to the next
  // `this.elementType =` assignment (or `undo(` if it is the last branch).
  const execAnchor = clean.indexOf(`this.elementType = '${marker}'`);
  if (execAnchor < 0) return null;
  const nextAssign = clean.indexOf('this.elementType =', execAnchor + 10);
  const undoStart = clean.search(/\bundo\s*\(/);
  const execEnd = nextAssign > 0 ? nextAssign : (undoStart > execAnchor ? undoStart : clean.length);
  // undo branch: from `case '<marker>':` to the next `case '`.
  const undoAnchor = clean.indexOf(`case '${marker}'`);
  let undoEnd = clean.length;
  if (undoAnchor >= 0) {
    const nextCase = clean.indexOf("case '", undoAnchor + 6);
    if (nextCase > 0) undoEnd = nextCase;
  }
  return {
    execRaw: raw.slice(execAnchor, execEnd),
    execClean: clean.slice(execAnchor, execEnd),
    undoRaw: undoAnchor >= 0 ? raw.slice(undoAnchor, undoEnd) : '',
    undoClean: undoAnchor >= 0 ? clean.slice(undoAnchor, undoEnd) : '',
    whole: false,
  };
}

// ── The analyser — pure over (kind rows × file contents) ─────────────────────

const PURGE = /removeAllRelationshipsForElement\s*\(/;
const DELEGATE = /new\s+(Delete|Remove)\w*Command\s*\([^)]*\)[\s\S]{0,200}?\.execute\s*\(/;
// Capture-before-purge: either a direct getRelationships snapshot in the branch
// or a call to the file's capture helper (the wall family routes its capture
// through `_captureRelationships`, whose getRelationships call lives outside
// the branch scope).
const CAPTURE = /(_captureRelationships|getRelationships)\s*\(/;
const RESTORE_VERBATIM = /_restoreRelationships\s*\(|addRelationship\s*\(\s*\{\s*type\s*:\s*rel\.type/;
const RESTORE_RECONSTRUCT = /addRelationship\s*\(\s*\{\s*type\s*:\s*['"][A-Za-z]/;
const EMPTY_CASCADE_CODE = /(consequences|cascade|cascades|deletions)\s*:\s*\[\s*\]/;
const EMPTY_CASCADE_COMMENT = /(no\s+cascade|cascade\s+(is\s+)?(intentionally\s+)?empty|empty\s+cascade\s+by\s+design)/i;
// ARM D — a comment asserting the graph purge happens SOMEWHERE ELSE.
const OTHER_MECHANISM_COMMENT =
  /(relationship|semantic\s*graph|graph\s+edge)s?[^\n]{0,120}?(purg|clean|remov|clear|handl)\w*[^\n]{0,60}?\b(by|via|in)\s+(another|elsewhere|[A-Z][\w.]*)/i;

interface Finding { key: string; detail: string }
interface KindReading {
  kind: string;
  perPath: Array<{
    file: string; marker?: string;
    purge: boolean; delegated: boolean;
    undo: 'verbatim' | 'reconstructed' | 'none' | 'n/a-delegated' | 'no-undo-scope';
  }>;
}

export function analyse(
  rows: readonly KindRow[],
  readFile: (rel: string) => string | null,
  mappedFiles: ReadonlySet<string>,
): { findings: Finding[]; readings: KindReading[]; unproven: string[]; armCD: string[] } {
  const findings: Finding[] = [];
  const readings: KindReading[] = [];
  const unproven: string[] = [];
  const armCD: string[] = [];

  for (const row of rows) {
    const reading: KindReading = { kind: row.kind, perPath: [] };
    readings.push(reading);
    if (row.paths.length === 0) {
      findings.push({
        key: `${row.kind}/no-delete-path`,
        detail: `kind '${row.kind}' has NO delete path in the mapping — either the walk missed one (fix the ledger) or the kind genuinely cannot be deleted-with-integrity. ${row.note ?? ''}`.trim(),
      });
      continue;
    }
    for (const p of row.paths) {
      const raw = readFile(p.file);
      if (raw === null) continue; // floor catches missing files
      const scope = scopeOf(raw, p.marker);
      if (!scope) {
        findings.push({
          key: `${row.kind}/marker-missing:${basename(p.file)}`,
          detail: `mapped marker '${p.marker}' not found in ${p.file} — the branch this ledger points at no longer exists; re-map it.`,
        });
        continue;
      }
      const id = p.marker ? `${basename(p.file)}#${p.marker}` : basename(p.file);

      // ARM A — purge (or delegation to a mapped path).
      const purges = PURGE.test(scope.execClean);
      const delegated = !purges && DELEGATE.test(scope.execClean);
      // Delegation only counts if the delegate target is itself mapped for this
      // kind (so its purge is assessed on its own row) — otherwise it is an
      // unmapped mechanism and ARM A fails here.
      const delegateCovered = delegated && row.paths.some((q) => q.file !== p.file && mappedFiles.has(q.file));
      if (!purges && !delegateCovered) {
        findings.push({
          key: `${row.kind}/purge-missing:${id}`,
          detail: `ARM A — '${row.kind}' delete path ${p.file}${p.marker ? ` (branch '${p.marker}')` : ''} never calls removeAllRelationshipsForElement and does not delegate to a mapped path that does. Deleting a ${row.kind} strands its SemanticGraph edges (the pre-3ee632f6 wall defect).`,
        });
      }

      // ARM B — undo reading. Only meaningful where this path purges itself.
      let undo: KindReading['perPath'][number]['undo'];
      if (!purges) {
        undo = delegateCovered ? 'n/a-delegated' : 'none';
      } else if (!scope.undoClean) {
        undo = 'no-undo-scope';
        findings.push({
          key: `${row.kind}/undo-missing:${id}`,
          detail: `ARM B — '${row.kind}' purges in ${p.file} but no undo scope was found: the purge is irreversible by construction.`,
        });
      } else if (RESTORE_VERBATIM.test(scope.undoClean) && CAPTURE.test(scope.execClean)) {
        undo = 'verbatim';
        unproven.push(
          `${row.kind} (${id}): VERBATIM restore SHAPE present — byte-equality of restored edges is ` +
          `UNPROVEN here (static gate; the C71 §6 exit condition demands executed read-back).`,
        );
      } else if (RESTORE_RECONSTRUCT.test(scope.undoClean)) {
        undo = 'reconstructed';
        findings.push({
          key: `${row.kind}/undo-reconstructs-not-verbatim:${id}`,
          detail: `ARM B — '${row.kind}' undo RE-AUTHORS edges from its own snapshot instead of restoring the captured set verbatim. Edges authored by OTHER elements' commands (boundedBy, supports, contains) are invisible in this kind's snapshot and are silently dropped by delete+undo. 3ee632f6 is the reference shape.`,
        });
      } else {
        undo = 'none';
        findings.push({
          key: `${row.kind}/undo-restores-nothing:${id}`,
          detail: `ARM B — '${row.kind}' purges ALL relationships on delete in ${p.file}${p.marker ? ` (branch '${p.marker}')` : ''} and undo restores NONE of them. Delete+undo permanently deletes the kind's graph presence — worse than no purge, because it looks correct.`,
        });
      }

      // ARM C — empty cascade BY DESIGN (declared in code or comment).
      if (EMPTY_CASCADE_CODE.test(scope.execClean)) {
        findings.push({
          key: `${row.kind}/empty-cascade-declared:${id}`,
          detail: `ARM C — '${row.kind}' delete path declares a literal empty cascade (C70 F-INV-2: a delete never returns an empty cascade by design).`,
        });
      }
      for (const c of commentsOf(scope.execRaw)) {
        if (EMPTY_CASCADE_COMMENT.test(c.text)) {
          findings.push({
            key: `${row.kind}/empty-cascade-comment:${id}`,
            detail: `ARM C — comment in ${p.file} declares the cascade empty by design: "${c.text.trim().slice(0, 100)}"`,
          });
        }
        // ARM D — only where this scope neither purges nor delegates: a comment
        // asserting another mechanism does it is the two-mechanisms defect.
        if (!purges && !delegateCovered && OTHER_MECHANISM_COMMENT.test(c.text)) {
          findings.push({
            key: `${row.kind}/purge-asserted-elsewhere:${id}`,
            detail: `ARM D — ${p.file}:${c.line} asserts another mechanism performs the graph purge ("${c.text.trim().slice(0, 100)}") while this path neither purges nor delegates to a mapped path that does.`,
          });
        }
      }

      reading.perPath.push({ file: p.file, marker: p.marker, purge: purges, delegated: delegateCovered, undo });
    }
  }

  armCD.push(
    'ARM C residual: a cascade that COMPUTES empty at runtime is invisible to this static gate — ' +
    'that half of F-INV-2 is UNPROVEN here, not green.',
  );
  return { findings, readings, unproven, armCD };
}

// ── Executed controls (C70 §5.6) — the comparator goes red before it is trusted
function selfTest(): { ok: boolean; lines: string[] } {
  const lines: string[] = [];
  let ok = true;
  const fail = (m: string): void => { ok = false; lines.push(`    ✗ BLIND COMPARATOR — ${m}`); };
  const pass = (m: string): void => { lines.push(`    ✓ ${m}`); };

  const files: Record<string, string> = {
    // 1. NEGATIVE: purge-less delete — must fire ARM A.
    'synthetic/DeleteGhostCommand.ts': [
      `export class DeleteGhostCommand {`,
      `  execute(ctx) { ctx.stores.ghostStore.remove(this.id); return { success: true }; }`,
      `  undo(ctx) { ctx.stores.ghostStore.add(this.snap); return { success: true }; }`,
      `}`,
    ].join('\n'),
    // 2. POSITIVE: the full 3ee632f6 verbatim shape — must read clean on A and B.
    'synthetic/DeleteSolidCommand.ts': [
      `export class DeleteSolidCommand {`,
      `  execute(ctx) {`,
      `    this._removed = semanticGraphManager.getRelationships(this.id);`,
      `    semanticGraphManager.removeAllRelationshipsForElement(this.id);`,
      `    ctx.stores.solidStore.remove(this.id);`,
      `    return { success: true };`,
      `  }`,
      `  undo(ctx) {`,
      `    ctx.stores.solidStore.add(this.snap);`,
      `    for (const rel of this._removed) semanticGraphManager.addRelationship({ type: rel.type, sourceId: rel.sourceId, targetId: rel.targetId, createdBy: rel.createdBy });`,
      `    return { success: true };`,
      `  }`,
      `}`,
    ].join('\n'),
    // 3. ARM D: a comment asserting another mechanism purges, with no purge here.
    'synthetic/DeletePhantomCommand.ts': [
      `export class DeletePhantomCommand {`,
      `  execute(ctx) {`,
      `    // The SemanticGraph relationships are removed by PhantomCleanupService elsewhere.`,
      `    ctx.stores.phantomStore.remove(this.id);`,
      `    return { success: true };`,
      `  }`,
      `  undo(ctx) { return { success: true }; }`,
      `}`,
    ].join('\n'),
    // 4. COMMENT-BLINDNESS: purge exists ONLY in a comment — no ARM A credit.
    'synthetic/DeleteProseCommand.ts': [
      `export class DeleteProseCommand {`,
      `  execute(ctx) {`,
      `    // semanticGraphManager.removeAllRelationshipsForElement(this.id);`,
      `    /* removeAllRelationshipsForElement(this.id) */`,
      `    ctx.stores.proseStore.remove(this.id);`,
      `    return { success: true };`,
      `  }`,
      `  undo(ctx) { return { success: true }; }`,
      `}`,
    ].join('\n'),
  };
  const rows: KindRow[] = [
    { kind: 'ghost', paths: [{ file: 'synthetic/DeleteGhostCommand.ts' }] },
    { kind: 'solid', paths: [{ file: 'synthetic/DeleteSolidCommand.ts' }] },
    { kind: 'phantom', paths: [{ file: 'synthetic/DeletePhantomCommand.ts' }] },
    { kind: 'prose', paths: [{ file: 'synthetic/DeleteProseCommand.ts' }] },
  ];
  const mapped = new Set(rows.flatMap((r) => r.paths.map((p) => p.file)));
  const a = analyse(rows, (rel) => files[rel] ?? null, mapped);
  const keys = new Set(a.findings.map((f) => f.key));

  if (keys.has('ghost/purge-missing:DeleteGhostCommand.ts')) pass('NEGATIVE: planted purge-less delete was FLAGGED on ARM A');
  else fail('a planted purge-less delete was NOT flagged — ARM A is blind');

  const solid = a.findings.filter((f) => f.key.startsWith('solid/'));
  if (solid.length === 0) pass('POSITIVE: planted full verbatim shape (capture → purge → restore) read CLEAN');
  else fail(`the planted verbatim shape still reported ${solid.map((f) => f.key).join(', ')} — the gate is stuck red`);

  if (keys.has('phantom/purge-asserted-elsewhere:DeletePhantomCommand.ts')) pass('ARM D: planted "another mechanism purges" comment was FLAGGED');
  else fail('a comment asserting the purge happens elsewhere was NOT flagged — ARM D is blind');

  if (keys.has('prose/purge-missing:DeleteProseCommand.ts')) pass('COMMENT-BLINDNESS: a purge that exists only inside comments earned NO ARM A credit');
  else fail('a comment-only purge was credited as a real purge — prose is proving its own coverage');

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
  floors.push({ what: 'executed controls passed', measured: control.ok ? 4 : 0, min: 4 });

  const ledger: Ledger | null = existsSync(LEDGER_PATH)
    ? (JSON.parse(readFileSync(LEDGER_PATH, 'utf8')) as Ledger) : null;
  floors.push({ what: 'graph-delete-integrity-debt.json ledger present', measured: ledger ? 1 : 0, min: 1 });

  let kinds: string[] = [];
  if (ledger) {
    const regPath = resolve(REPO, ledger.registryFile);
    const regSrc = existsSync(regPath) ? readFileSync(regPath, 'utf8') : '';
    kinds = parseKindUnion(regSrc, 'ElementType');
  }
  // The registry declares 19 kinds today; a parse that recovered fewer than 15
  // has failed on the union, and a verdict over a subset is not a verdict.
  floors.push({ what: 'element kinds parsed from the registry (ElementType)', measured: kinds.length, min: 15 });

  const rows = ledger?.kinds ?? [];
  const mappedKinds = new Set(rows.map((r) => r.kind));
  const coveredKinds = kinds.filter((k) => mappedKinds.has(k));
  // C71 §6 floor: delete paths discovered ≥ kinds the registry declares.
  floors.push({ what: 'registry kinds with a mapping row in the ledger', measured: coveredKinds.length, min: kinds.length || 1 });
  const unknownRows = rows.filter((r) => !kinds.includes(r.kind));
  if (unknownRows.length > 0) {
    // A ledger row for a kind the registry does not declare is a stale subject.
    floors.push({ what: `ledger rows whose kind exists in the registry (stale: ${unknownRows.map((r) => r.kind).join(',')})`, measured: 0, min: 1 });
  }
  const allFiles = [...new Set(rows.flatMap((r) => r.paths.map((p) => p.file)))];
  const missing = allFiles.filter((f) => !existsSync(resolve(REPO, f)));
  floors.push({ what: `mapped delete-path files present on disk (${allFiles.length} mapped)`, measured: allFiles.length - missing.length, min: allFiles.length || 1 });
  if (missing.length > 0) lines.push(`   missing mapped files: ${missing.join(', ')}`);

  let findings: Finding[] = [];
  let stale: string[] = [];
  if (ledger && floors.every((f) => f.measured >= f.min)) {
    const mappedFiles = new Set(allFiles);
    const cache = new Map<string, string>();
    const readFile = (rel: string): string | null => {
      if (cache.has(rel)) return cache.get(rel)!;
      const p = resolve(REPO, rel);
      if (!existsSync(p)) return null;
      const t = readFileSync(p, 'utf8');
      cache.set(rel, t);
      return t;
    };
    const a = analyse(rows, readFile, mappedFiles);
    findings = a.findings;

    lines.push('PER-KIND × PER-PATH READINGS (SemanticGraph delete integrity):');
    for (const r of a.readings) {
      for (const p of r.perPath) {
        const id = p.marker ? `${basename(p.file)}#${p.marker}` : basename(p.file);
        lines.push(`  ${r.kind.padEnd(14)} ${id.padEnd(44)} purge=${p.purge ? '✓' : (p.delegated ? 'delegated' : '✗')} · undo=${p.undo}`);
      }
      if (r.perPath.length === 0) lines.push(`  ${r.kind.padEnd(14)} (no assessable path)`);
    }
    lines.push('');
    lines.push('UNPROVEN — named, never green (C71 §6 exit condition / C70 §3.4):');
    for (const u of a.unproven) lines.push(`  ◌ ${u}`);
    for (const u of a.armCD) lines.push(`  ◌ ${u}`);
    lines.push('');

    lines.push(`FINDINGS: ${findings.length} against a NAMED ledger of ${ledger.declaredFindings.length}.`);
    const declaredKeys = new Set(ledger.declaredFindings.map((d) => d.key));
    for (const f of findings) {
      const led = declaredKeys.has(f.key);
      lines.push(`  ${led ? '·' : '⛔ UNLEDGERED'} ${f.key} — ${f.detail}`);
    }
    const measuredKeys = new Set(findings.map((f) => f.key));
    stale = ledger.declaredFindings.filter((d) => !measuredKeys.has(d.key)).map((d) => d.key);
    for (const s of stale) {
      lines.push(`  ⚠ STALE LEDGER ENTRY: "${s}" declared but no longer measured — strike it in the commit that fixed it.`);
    }
  }

  const result: GateResult = {
    gate: 'check-graph-delete-integrity (C71 §6 · C70 F-INV-2)',
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
