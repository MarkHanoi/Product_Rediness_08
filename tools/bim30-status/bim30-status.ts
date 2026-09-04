#!/usr/bin/env tsx
/**
 * BIM 3.0 STATUS — the generated half of the tracker.
 *
 * ## Why this exists
 *
 * `BIM30-MASTER-COMPLETION-TRACKER.md` is hand-written prose. Its row DEFINITIONS are
 * excellent and should stay hand-written — a claim like *"`sitsOn` was the most-written
 * edge with no typed reader"* is judgement, and no script will ever author it.
 *
 * Its row STATUSES are a different thing entirely, and hand-maintaining them rots:
 *
 *   - the headline was stamped at one SHA and quoted at another ~40 commits later;
 *   - §5 — the section captioned "THIS OUTRANKS THE ENTIRE TABLE ABOVE IT" — asserted
 *     13 gates ran in no runner, days after all 13 were registered;
 *   - answering "where are we" cost a ten-minute investigation instead of a command.
 *
 * Half 2 does not have this problem, and the reason is structural, not cultural: its
 * ledger is written BY the gate that measures it. This script gives Half 1 the same
 * property.
 *
 * ## The honesty rules this script obeys
 *
 * The whole BIM 3.0 programme is about one defect — *"I found nothing" and "I could not
 * look" rendering as the same value*. A status generator that committed that defect
 * would be worse than the prose it replaces, so:
 *
 *   R1. A gate that could not run yields **NOT_DETERMINED**, never 0 and never "pass".
 *       Not-run, crashed, and timed-out are three distinct values, all reported.
 *   R2. A row whose deciding instrument is not a runnable gate is **CARRIED**, printed
 *       with the tracker's own date, and **counted separately** — never folded into the
 *       measured numerator. This is §1.0's discipline, mechanised.
 *   R3. The headline prints BOTH numbers (measured-only and like-for-like). §1.2.1
 *       records that conflating them is an error this corpus has already made.
 *   R4. Exit 3 is never absorbable (C70 §5.1). A ratchet breach is reported as a breach
 *       regardless of any ledger.
 *   R5. The denominator is derived, and if it cannot be derived the script exits 2
 *       (MISCONFIGURED) rather than printing a count over an unknown base. A count of
 *       passing rows without a count of rows is the empty-seed lie.
 *
 * ## What it does NOT establish
 *
 * It reads the DECIDING INSTRUMENT's exit code. That is exactly as strong as the gate
 * is, and no stronger. A gate that passes while measuring the wrong subject still
 * passes here — see the tracker's §7 for the standing list of what no gate covers.
 *
 * Usage:
 *   npx tsx tools/bim30-status/bim30-status.ts              # human table
 *   npx tsx tools/bim30-status/bim30-status.ts --json       # machine readable
 *   npx tsx tools/bim30-status/bim30-status.ts --fast       # skip gates over the budget
 *   npx tsx tools/bim30-status/bim30-status.ts --row GR-12  # one row, verbose
 *
 * Exit codes: 0 = every measurable row measured · 1 = some rows NOT_DETERMINED
 *             2 = MISCONFIGURED (could not derive the denominator)
 */

import { spawnSync } from 'child_process';
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..');

const TRACKER = join(REPO, 'docs/03-execution/plans/BIM30-MASTER-COMPLETION-TRACKER.md');
const GATE_DIRS = [
  join(REPO, 'tools/ga-gate'),
  join(REPO, 'tools/rac-conformance/certification/gates'),
];

/** Gates known to exceed a sane interactive budget. Skipped under --fast, NEVER silently. */
const SLOW_GATES = new Set(['check-per-package-compile', 'check-package-isolation']);

const PER_GATE_TIMEOUT_MS = 240_000;

// win32 cannot spawn `npx` without a shell; see run-all.ts:551 for the same note.
const NEEDS_SHELL = process.platform === 'win32';

type Determination =
  | { kind: 'MEASURED'; exit: number; summary: string; gate: string }
  | { kind: 'CARRIED'; declared: string; note: string }
  | { kind: 'NOT_DETERMINED'; reason: NotDeterminedReason; detail: string };

/** Closed union. A new member is a deliberate edit, never an ad-hoc string. */
type NotDeterminedReason =
  | 'GATE_NOT_FOUND'
  | 'GATE_CRASHED'
  | 'GATE_TIMED_OUT'
  | 'GATE_SKIPPED_SLOW'
  | 'INSTRUMENT_NOT_RUNNABLE';

interface Row {
  id: string;
  block: string;
  blockOwner: string;
  claim: string;
  contract: string;
  instrument: string;
  declaredStatus: string;
  declaredReading: string;
  statusSource: string;
  gates: string[];
  determination?: Determination;
}

/* ─────────────────────────── parsing the tracker ─────────────────────────── */

/**
 * Markdown cells here routinely contain `|` inside code spans — `ConsequencePlan | null`
 * is a real value in this corpus. Splitting on a bare `|` shreds those rows and silently
 * shifts every later column, which would mis-attribute statuses rather than fail. Mask
 * code spans first, split, then restore.
 */
function splitCells(line: string): string[] {
  const spans: string[] = [];
  const masked = line.replace(/`[^`]*`/g, (m) => {
    spans.push(m);
    return `${spans.length - 1}`;
  });
  return masked
    .split('|')
    .map((c) => c.replace(/(\d+)/g, (_, i) => spans[Number(i)] ?? ''))
    .map((c) => c.trim());
}

function parseTracker(): { rows: Row[]; blocks: Map<string, string> } {
  if (!existsSync(TRACKER)) {
    console.error(`[bim30-status] MISCONFIGURED: tracker not found at ${TRACKER}`);
    process.exit(2);
  }
  const text = readFileSync(TRACKER, 'utf8');
  const lines = text.split(/\r?\n/);

  const rows: Row[] = [];
  const blocks = new Map<string, string>();
  let block = '';
  let owner = '';

  for (const line of lines) {
    // §2.2 — §1 · Graph & topology (owner: C71) — 16 counted rows
    const head = line.match(/^###\s+§2\.\d+\s+—\s+§\d+\s+·\s+(.+?)\s+\(owners?:\s*([^)]+)\)/);
    if (head) {
      block = head[1].trim();
      owner = head[2].trim();
      blocks.set(block, owner);
      continue;
    }
    // Leaving §2 ends row collection — §2.10 onward is distribution, not rows.
    if (/^###\s+§2\.(10|11)\b/.test(line)) block = '';
    if (/^##\s+§3\b/.test(line)) break;

    if (!block || !line.startsWith('|')) continue;

    const c = splitCells(line);
    // leading + trailing empty from the outer pipes → 9 cells for a 7-column row
    if (c.length < 8) continue;
    const idCell = c[1];
    const m = idCell.match(/\*\*([A-Z]{2}-\d+)\*\*/);
    if (!m) continue;

    const instrument = c[4] ?? '';
    rows.push({
      id: m[1],
      block,
      blockOwner: owner,
      claim: c[2] ?? '',
      contract: c[3] ?? '',
      instrument,
      declaredStatus: (c[5] ?? '').replace(/\*\*/g, '').trim(),
      declaredReading: c[6] ?? '',
      statusSource: c[7] ?? '',
      gates: extractGates(instrument),
    });
  }
  applyOverlay(rows);
  return { rows, blocks };
}

/* ─────────────────────── the registration overlay ─────────────────────── */

/**
 * §ROW-GATE-REGISTRY — attach an existing runnable gate to a row whose markdown
 * cell has not yet been rewritten to name it. See `row-gate-registry.json`'s own
 * `$comment` for why the bridge exists.
 *
 * The rules below are ENFORCED here rather than trusted to the JSON, because a
 * registry that can silently no-op is worse than no registry: it would let a row
 * read CARRIED while a green gate sat beside it, or — much worse — read MEASURED
 * against a gate that does not exist.
 *
 *   R-A  ADD-ONLY. Overlay gates are unioned onto whatever the markdown names.
 *        An entry can never remove a gate, and never make a measured row carried.
 *   R-B  Every `row` must exist in the tracker → else exit 2.
 *   R-C  Every gate must resolve to a real file → else exit 2.
 *   R-D  `instrumentCellShouldRead` must yield EXACTLY its `gates` array when fed
 *        through this tool's own `extractGates` → else exit 2. Pasting that text
 *        into the doc must not change which gate decides the row; `extractGates`
 *        takes EVERY `check-*` token in the cell and the row takes the WORST exit,
 *        so a stray gate name inside a parenthetical is enough to hand the row to
 *        a gate that is blind to it.
 */
interface OverlayEntry {
  row: string;
  gates: string[];
  contract?: string;
  why?: string;
  instrumentCellShouldRead?: string;
}

/**
 * A row examined and left CARRIED on purpose — because it is legitimately OPEN and
 * every gate shape available would either mint a never-absorbable exit 3 or a debt
 * baseline. It attaches nothing. It is validated (R-B, R-E) so the list cannot rot
 * into a set of names that no longer mean anything.
 */
interface UnregisteredEntry { row: string; contract?: string; declared?: string; why: string }

const OVERLAY_FILE = join(HERE, 'row-gate-registry.json');
const overlayApplied = new Map<string, OverlayEntry>();

interface OverlayFile { entries?: OverlayEntry[]; deliberatelyUnregistered?: UnregisteredEntry[] }

function loadOverlay(): OverlayFile {
  if (!existsSync(OVERLAY_FILE)) return {};
  try {
    return JSON.parse(readFileSync(OVERLAY_FILE, 'utf8')) as OverlayFile;
  } catch (e) {
    console.error(`[bim30-status] MISCONFIGURED: ${OVERLAY_FILE} is not valid JSON — ${(e as Error).message}`);
    process.exit(2);
  }
}

const deliberatelyUnregistered: UnregisteredEntry[] = [];

function applyOverlay(rows: Row[]): void {
  const file = loadOverlay();
  const entries = file.entries ?? [];
  deliberatelyUnregistered.length = 0;
  deliberatelyUnregistered.push(...(file.deliberatelyUnregistered ?? []));
  if (entries.length === 0 && deliberatelyUnregistered.length === 0) return;
  const byId = new Map(rows.map((r) => [r.id, r]));
  const problems: string[] = [];

  for (const e of entries) {
    const row = byId.get(e.row);
    if (!row) { problems.push(`R-B ${e.row}: no such row in the tracker — this entry would be a silent no-op`); continue; }
    if (!Array.isArray(e.gates) || e.gates.length === 0) { problems.push(`R-C ${e.row}: no gates declared`); continue; }
    for (const g of e.gates) {
      if (!resolveGate(g)) problems.push(`R-C ${e.row}: gate '${g}' resolves to no file under either gate dir`);
    }
    if (e.instrumentCellShouldRead !== undefined) {
      const derived = extractGates(e.instrumentCellShouldRead);
      const same = derived.length === e.gates.length && derived.every((g) => e.gates.includes(g));
      if (!same) {
        problems.push(
          `R-D ${e.row}: instrumentCellShouldRead parses to [${derived.join(', ') || 'nothing'}] but declares [${e.gates.join(', ')}] — ` +
          'pasting it into the tracker would change which gate decides the row',
        );
      }
    }
    // R-A — union, never replace.
    row.gates = [...new Set([...row.gates, ...e.gates])];
    overlayApplied.set(e.row, e);
  }

  // R-B / R-E over the deliberately-unregistered list. A name that no longer
  // matches a row, or one that has since acquired a gate here, means the written
  // reason has silently stopped describing anything — which is how an
  // on-the-record exclusion decays into folklore.
  for (const u of deliberatelyUnregistered) {
    if (!byId.has(u.row)) problems.push(`R-B ${u.row}: listed as deliberately unregistered, but no such row exists in the tracker`);
    if (overlayApplied.has(u.row)) problems.push(`R-E ${u.row}: listed BOTH as deliberately unregistered and as a registered entry — the file contradicts itself`);
    if (!u.why || u.why.length < 40) problems.push(`R-E ${u.row}: deliberately unregistered with no written reason — that is omission, not a decision`);
  }

  if (problems.length) {
    console.error(`[bim30-status] MISCONFIGURED: ${OVERLAY_FILE} has ${problems.length} broken entr(ies):`);
    for (const p of problems) console.error(`  ${p}`);
    console.error('  A registration that points at nothing must not read as a registration.');
    process.exit(2);
  }
}

/** A deciding instrument names zero or more runnable gates. Zero is a real answer. */
function extractGates(instrument: string): string[] {
  const found = instrument.match(/check-[a-z0-9-]+/g) ?? [];
  return [...new Set(found)];
}

function resolveGate(name: string): string | null {
  for (const d of GATE_DIRS) {
    const p = join(d, `${name}.ts`);
    if (existsSync(p)) return p;
  }
  return null;
}

/* ─────────────────────────── running the gates ─────────────────────────── */

interface GateResult {
  exit: number | null;
  summary: string;
  reason?: NotDeterminedReason;
  detail?: string;
}

const gateCache = new Map<string, GateResult>();

function runGate(name: string, fast: boolean): GateResult {
  const cached = gateCache.get(name);
  if (cached) return cached;

  let result: GateResult;
  const path = resolveGate(name);

  if (!path) {
    result = { exit: null, summary: '', reason: 'GATE_NOT_FOUND', detail: `no ${name}.ts under either gate dir` };
  } else if (fast && SLOW_GATES.has(name)) {
    result = { exit: null, summary: '', reason: 'GATE_SKIPPED_SLOW', detail: '--fast; re-run without it' };
  } else {
    const r = spawnSync('npx', ['tsx', NEEDS_SHELL ? `"${path}"` : path], {
      cwd: REPO,
      encoding: 'utf8',
      shell: NEEDS_SHELL,
      timeout: PER_GATE_TIMEOUT_MS,
      maxBuffer: 64 * 1024 * 1024,
      env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=8192' },
    });

    if (r.error && (r.error as NodeJS.ErrnoException).code === 'ETIMEDOUT') {
      result = { exit: null, summary: '', reason: 'GATE_TIMED_OUT', detail: `>${PER_GATE_TIMEOUT_MS / 1000}s` };
    } else if (r.status === null) {
      result = { exit: null, summary: '', reason: 'GATE_CRASHED', detail: r.error?.message ?? 'no exit status' };
    } else {
      result = { exit: r.status, summary: lastSignificantLine(`${r.stdout ?? ''}\n${r.stderr ?? ''}`, name) };
    }
  }

  gateCache.set(name, result);
  return result;
}

/**
 * Gates print a headline near the end. Prefer a line naming the gate; fall back to the
 * last non-empty line. Never fabricate — an empty summary stays empty.
 */
function lastSignificantLine(out: string, gate: string): string {
  // eslint-disable-next-line no-control-regex -- the ESC control character IS the subject:
  // this strips ANSI colour codes out of captured child-process output. A regex forbidden
  // from matching the control character cannot strip it.
  const lines = out.split(/\r?\n/).map((l) => l.replace(/\x1b\[[0-9;]*m/g, '').trim()).filter(Boolean);
  const tagged = lines.filter((l) => l.includes(`[${gate.replace(/^check-/, '')}]`) || l.includes(`[${gate}]`));
  const pick = (tagged.length ? tagged : lines).slice(-1)[0] ?? '';
  return pick.length > 160 ? `${pick.slice(0, 157)}…` : pick;
}

/* ─────────────────────────── determination ─────────────────────────── */

/**
 * R4: exit 3 is a ratchet breach and is never absorbable (C70 §5.1). It is reported as
 * a breach here regardless of gate-debt.json, because absorbing it is a CI decision and
 * this is a status report, not CI.
 */
function classify(exit: number): 'CLOSED' | 'OPEN' | 'BREACH' {
  if (exit === 0) return 'CLOSED';
  if (exit === 3) return 'BREACH';
  return 'OPEN';
}

function determine(row: Row, fast: boolean): Determination {
  if (row.gates.length === 0) {
    return {
      kind: 'CARRIED',
      declared: row.declaredStatus,
      note: row.instrument.trim() === '—' || row.instrument.trim() === ''
        ? 'no deciding instrument declared'
        : `instrument is not a runnable gate: ${row.instrument.slice(0, 80)}`,
    };
  }

  // A row may name several gates. The row is only as closed as its WORST gate — a row
  // decided by two instruments where one breaches is not a closed row.
  const results = row.gates.map((g) => ({ g, r: runGate(g, fast) }));
  const undetermined = results.filter((x) => x.r.exit === null);
  if (undetermined.length === results.length) {
    const first = undetermined[0];
    return {
      kind: 'NOT_DETERMINED',
      reason: first.r.reason ?? 'GATE_CRASHED',
      detail: `${first.g}: ${first.r.detail ?? ''}`,
    };
  }

  const ran = results.filter((x) => x.r.exit !== null);
  const worst = ran.reduce((a, b) => ((b.r.exit ?? 0) > (a.r.exit ?? 0) ? b : a));
  return { kind: 'MEASURED', exit: worst.r.exit as number, summary: worst.r.summary, gate: worst.g };
}

/* ─────────────────────────── reporting ─────────────────────────── */

function main() {
  const argv = process.argv.slice(2);
  const asJson = argv.includes('--json');
  const fast = argv.includes('--fast');
  const only = argv.includes('--row') ? argv[argv.indexOf('--row') + 1] : null;

  const { rows: allRows } = parseTracker();

  // R5 — derive the denominator, or exit 2. Never count over an unknown base.
  if (allRows.length === 0) {
    console.error('[bim30-status] MISCONFIGURED: parsed 0 rows from the tracker. The §2 table shape changed — fix the parser, do not print a count.');
    process.exit(2);
  }

  const rows = only ? allRows.filter((r) => r.id === only) : allRows;
  if (only && rows.length === 0) {
    console.error(`[bim30-status] MISCONFIGURED: no row named ${only}`);
    process.exit(2);
  }

  const sha = spawnSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: REPO, encoding: 'utf8' }).stdout?.trim() ?? 'UNKNOWN';

  if (!asJson) {
    console.log(`\n\x1b[1mBIM 3.0 STATUS\x1b[0m — generated, not stamped`);
    // Print the PARSED count and the SELECTED count separately. Collapsing them made a
    // `--row` run print "1 rows parsed from the tracker" when it had parsed 82 — a
    // filtered view wearing a register-wide number, which is this tool's own subject
    // matter turned on itself.
    console.log(
      `HEAD ${sha} · ${allRows.length} rows parsed from the tracker` +
      (only ? ` · \x1b[33mFILTERED to ${rows.length} (--row ${only}) — NOT a register-wide reading\x1b[0m` : '') +
      (fast ? ' · --fast' : ''),
    );
    console.log('Running deciding gates. Rows sharing a gate run it once.');
    if (overlayApplied.size) {
      console.log(
        `\x1b[33m${overlayApplied.size} row(s) take their deciding gate from tools/bim30-status/row-gate-registry.json, ` +
        'NOT from their tracker cell — the markdown still reads as it did. Listed below.\x1b[0m',
      );
    }
    console.log('');
  }

  for (const row of rows) row.determination = determine(row, fast);

  // Rows the tracker itself marks n/a (PARKED, anti-recount notes) are not counted.
  const counted = rows.filter((r) => r.declaredStatus.toLowerCase() !== 'n/a');
  const measured = counted.filter((r) => r.determination?.kind === 'MEASURED');
  const carried = counted.filter((r) => r.determination?.kind === 'CARRIED');
  const nd = counted.filter((r) => r.determination?.kind === 'NOT_DETERMINED');

  const closed = measured.filter((r) => classify((r.determination as any).exit) === 'CLOSED');
  const breaches = measured.filter((r) => classify((r.determination as any).exit) === 'BREACH');

  if (asJson) {
    console.log(JSON.stringify({
      generatedAtSha: sha,
      rowsParsed: rows.length,
      counted: counted.length,
      measured: measured.length,
      carried: carried.length,
      notDetermined: nd.length,
      closedOfMeasured: closed.length,
      ratchetBreaches: breaches.length,
      overlayRegistered: [...overlayApplied.keys()].sort(),
      rows: rows.map((r) => ({
        id: r.id, block: r.block, owner: r.blockOwner,
        declaredStatus: r.declaredStatus, instrument: r.instrument,
        gates: r.gates, gateFromOverlay: overlayApplied.has(r.id), determination: r.determination,
      })),
    }, null, 2));
    process.exit(nd.length ? 1 : 0);
  }

  /* per-block */
  const byBlock = new Map<string, Row[]>();
  for (const r of counted) {
    if (!byBlock.has(r.block)) byBlock.set(r.block, []);
    byBlock.get(r.block)!.push(r);
  }

  console.log('\x1b[1mPER BLOCK\x1b[0m  (measured only — carried rows are listed separately and never folded in)');
  console.log('─'.repeat(96));
  console.log(`${'block'.padEnd(34)} ${'rows'.padStart(5)} ${'meas'.padStart(5)} ${'closed'.padStart(7)} ${'breach'.padStart(7)} ${'carried'.padStart(8)} ${'ND'.padStart(4)}`);
  for (const [b, rs] of [...byBlock.entries()].sort()) {
    const m = rs.filter((r) => r.determination?.kind === 'MEASURED');
    const c = m.filter((r) => classify((r.determination as any).exit) === 'CLOSED');
    const br = m.filter((r) => classify((r.determination as any).exit) === 'BREACH');
    const ca = rs.filter((r) => r.determination?.kind === 'CARRIED');
    const n = rs.filter((r) => r.determination?.kind === 'NOT_DETERMINED');
    console.log(`${b.slice(0, 34).padEnd(34)} ${String(rs.length).padStart(5)} ${String(m.length).padStart(5)} ${String(c.length).padStart(7)} ${String(br.length).padStart(7)} ${String(ca.length).padStart(8)} ${String(n.length).padStart(4)}`);
  }

  console.log(`\n\x1b[1mHEADLINE\x1b[0m`);
  console.log('─'.repeat(96));
  console.log(`  MEASURED-ONLY      ${closed.length} / ${measured.length} closed of rows measured now`);
  console.log(`  COUNTED ROWS       ${counted.length}   (tracker n/a rows excluded by rule)`);
  console.log(`  CARRIED            ${carried.length}   \x1b[2m← status inherited from prose; NOT evidence at HEAD\x1b[0m`);
  console.log(`  NOT DETERMINED     ${nd.length}   \x1b[2m← the gate did not yield a reading; never counted as pass or fail\x1b[0m`);
  if (breaches.length) {
    console.log(`  \x1b[31mRATCHET BREACHES   ${breaches.length}   ← exit 3. Never absorbable (C70 §5.1).\x1b[0m`);
  }

  if (breaches.length) {
    console.log(`\n\x1b[1;31mEXIT-3 BREACHES\x1b[0m`);
    console.log('─'.repeat(96));
    for (const r of breaches) {
      const d = r.determination as any;
      console.log(`  ${r.id.padEnd(8)} ${d.gate}`);
      if (d.summary) console.log(`           ${d.summary}`);
    }
  }

  if (nd.length) {
    console.log(`\n\x1b[1mNOT DETERMINED — why, per row\x1b[0m`);
    console.log('─'.repeat(96));
    for (const r of nd) {
      const d = r.determination as any;
      console.log(`  ${r.id.padEnd(8)} ${String(d.reason).padEnd(24)} ${d.detail}`);
    }
  }

  if (carried.length) {
    console.log(`\n\x1b[1mCARRIED — no runnable gate decides these\x1b[0m`);
    console.log('─'.repeat(96));
    console.log('  These are the rows a generated tracker cannot help with. Each needs either a');
    console.log('  gate, or an explicit founder-signed exception. Until then their status is prose.');
    for (const r of carried) {
      const d = r.determination as any;
      const examined = deliberatelyUnregistered.find((u) => u.row === r.id);
      console.log(`  ${r.id.padEnd(8)} declared ${String(d.declared).padEnd(12)} ${d.note}`);
      // Distinguish "nobody has looked at this row" from "someone looked and
      // concluded a gate would MISREPORT it". Both print CARRIED, and collapsing
      // them is this tool's own subject matter: an unexamined row and a
      // deliberately-unexamined one are not the same value.
      if (examined) {
        console.log(`           \x1b[2m↳ EXAMINED and left carried on purpose (row-gate-registry.json):\x1b[0m`);
        for (const chunk of String(examined.why).match(/.{1,84}(\s|$)/g) ?? []) {
          console.log(`             \x1b[2m${chunk.trim()}\x1b[0m`);
        }
      }
    }
  }

  if (overlayApplied.size) {
    console.log(`\n\x1b[1mOVERLAY-REGISTERED — gate named in row-gate-registry.json, not in the tracker cell\x1b[0m`);
    console.log('─'.repeat(96));
    console.log('  These rows are MEASURED, but their tracker cell has not yet been rewritten to name');
    console.log('  the gate. Reconcile by copying each `instrumentCellShouldRead` into the row\'s');
    console.log('  *Deciding instrument* cell; the text is checked against this tool\'s own parser every');
    console.log('  run, so the paste cannot change which gate decides the row.');
    for (const [id, e] of [...overlayApplied.entries()].sort()) {
      const r = rows.find((x) => x.id === id);
      const d = r?.determination as any;
      const verdict = d?.kind === 'MEASURED' ? `[${d.exit}] ${classify(d.exit)}` : (d?.kind ?? 'NOT SELECTED');
      console.log(`  ${id.padEnd(8)} ${verdict.padEnd(14)} ${e.gates.join(' + ')}`);
    }
  }

  console.log(`\n\x1b[1mOPEN ROWS (measured, not closed)\x1b[0m`);
  console.log('─'.repeat(96));
  for (const r of measured.filter((x) => classify((x.determination as any).exit) === 'OPEN')) {
    const d = r.determination as any;
    console.log(`  ${r.id.padEnd(8)} [${d.exit}] ${d.gate}`);
    if (d.summary) console.log(`           ${d.summary}`);
  }

  const outDir = join(REPO, 'tools/bim30-status/results');
  mkdirSync(outDir, { recursive: true });
  const outFile = join(outDir, 'latest.json');
  writeFileSync(outFile, JSON.stringify({
    generatedAtSha: sha, rowsParsed: rows.length, counted: counted.length,
    measured: measured.length, carried: carried.length, notDetermined: nd.length,
    closedOfMeasured: closed.length, ratchetBreaches: breaches.length,
    overlayRegistered: [...overlayApplied.keys()].sort(),
    rows: rows.map((r) => ({ id: r.id, block: r.block, declaredStatus: r.declaredStatus, gates: r.gates, gateFromOverlay: overlayApplied.has(r.id), determination: r.determination })),
  }, null, 2));
  console.log(`\n  written → ${outFile}`);

  console.log(`\n\x1b[2m  This reads the deciding instrument's exit code and is exactly as strong as that`);
  console.log(`  gate. A gate passing while measuring the wrong subject still passes here.`);
  console.log(`  The tracker's §7 is the standing list of what no gate covers.\x1b[0m\n`);

  process.exit(nd.length ? 1 : 0);
}

main();
