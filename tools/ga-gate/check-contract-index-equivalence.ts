#!/usr/bin/env tsx
/**
 * @file tools/ga-gate/check-contract-index-equivalence.ts
 *
 * **`ls docs/02-decisions/contracts/` == `contracts/README.md`'s row set, IN BOTH
 * DIRECTIONS.** The gate `CLAUDE.md` names as the durable fix and records as
 * *"which does not exist yet"*, and which `contracts/README.md`'s own banner
 * names as its exit condition:
 *
 * > *"a gate asserts `ls contracts/` equals this table's row set **in both
 * > directions**, so neither a file without a row nor a row without a file can
 * > survive a commit. Until that gate exists, this banner is the only thing
 * > standing between the index and its next drift."*
 *
 * ─── Why BOTH directions is the whole point ──────────────────────────────────
 * They are different failures and both have happened:
 *   • **FILE WITHOUT ROW** — the contract exists and the index does not list it,
 *     so the conflict-resolution ordering silently DEMOTES it. This is how
 *     **C84 (Element Integrity)**, binding on every PR touching an element
 *     family, came to rank below an ADR. Recorded as the suite's #1 blast-radius
 *     defect in `CONTRACT-AMENDMENT-REGISTER.md` §1.
 *   • **ROW WITHOUT FILE** — the index promises a contract that is not there, so
 *     a reader cites nothing. Same shape as `check-contract-cited-paths.ts`
 *     (L-960) one level up.
 *   • **GAP NOT DECLARED RESERVED** — an id inside the minted range with neither
 *     file nor row. Silence cannot distinguish *"deliberately unminted"* from
 *     *"deleted and nobody noticed"*, so the gate demands the id be named
 *     RESERVED in the README. This is C76 §6 applied to the index: **absence is
 *     typed, named and counted, never silent.**
 *
 * ─── Why a COUNT would not have caught any of this ───────────────────────────
 * The staleness this replaces has recurred **five times** (C67 -> C81 ->
 * C84/C85–C99 -> C100 -> C76), every time as a *range or count written as a
 * literal*. A count is one number and can be right while the SET is wrong; the
 * README banner has been simultaneously correct in its count and wrong in its
 * range more than once. **This gate compares SETS, and never a number.** It
 * derives everything and transcribes nothing — the rule C69 §0.1 / C64 §2.13 /
 * C76 §0.1 all state and which this file is the first to enforce on the index.
 *
 * ─── What a ROW is ───────────────────────────────────────────────────────────
 * A markdown table line beginning `| **C<id>** |` in `README.md`, carrying a
 * relative link `(./C<id>-....md)`. Prose mentions of a contract id are NOT rows
 * and are deliberately not counted: the register's §9 records that a sweep
 * keyed on a NAME is defeated by using a different name, and the ordering
 * statement in row 4 is made by the TABLE, not by prose.
 *
 * ─── Arms ────────────────────────────────────────────────────────────────────
 *  F0 *(floors, exit 2)*  README parses · >= MIN_FILES contract files ·
 *      >= MIN_ROWS table rows · planted controls fired. A parser that finds no
 *      rows would report a clean sweep of nothing (L-827).
 *  A  *(ratchet, shrink-only)* FILE WITHOUT ROW <= BASELINE_FILE_WITHOUT_ROW.
 *  B  *(hard, 0)* ROW WITHOUT FILE — a row whose linked file does not exist.
 *  C  *(hard, 0)* ROW/LINK MISMATCH — row id `C42` linking to `C43-*.md`.
 *  D  *(hard, 0)* GAP NOT DECLARED RESERVED — an id in `C01..Cmax` with neither
 *      file nor row and no `RESERVED` declaration for it in README.
 *
 * Arms B, C and D are hard-0 because each is currently 0 and each is a
 * one-commit fix; only arm A carries real accumulated debt and therefore a
 * baseline. Per §RATCHET-EXCEEDED-IS-NEVER-DEBT (R7), exit 3 is never absorbable.
 *
 * Exit 0 clean/within baseline · 2 MISCONFIGURED / floors unmet / control did
 * not fire · 3 any arm breached.
 *
 * Usage: npx tsx tools/ga-gate/check-contract-index-equivalence.ts
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const REPO_ROOT = process.env.GA_GATE_REPO_ROOT ?? process.cwd();
const LABEL = 'contract-index-equivalence';
const CONTRACT_DIR = path.join(REPO_ROOT, 'docs', '02-decisions', 'contracts');
const README = path.join(CONTRACT_DIR, 'README.md');

/**
 * §INDEX-EQUIVALENCE-BASELINE — pinned at the FIRST HONEST READING, 2026-08-19
 * (lane REG1): **18 contract files exist with NO row in the index table** —
 * C81, C84, the whole C85–C99 per-element block, and C100.
 *
 * That is not a bookkeeping nit. `CLAUDE.md` defers the conflict-resolution
 * ordering to this table, so every one of the 18 is currently ordered by nothing
 * — including C84, which binds every PR touching an element family.
 *
 * SHRINK-ONLY. Adding a contract file without adding its row raises this, and
 * raising it is choosing to ship an unordered contract.
 */
const BASELINE_FILE_WITHOUT_ROW = 18;

const MIN_FILES = 90;
const MIN_ROWS = 60;

/**
 * `C00` is the index's own self-row (`| **C00** | **Index** (this file) | …`).
 * It is a real row for a real document — README.md itself — and has no
 * `C00-*.md` file by construction. Exempted from arms B and C only, and named
 * here rather than pattern-matched, so the exemption set is one line long and
 * auditable. Arm A is unaffected: no C00 file exists to be missing a row.
 */
const SELF_ROW_IDS = new Set(['C00']);

const FILE_RE = /^C(\d+(?:\.\d+)?)-.*\.md$/;
const ROW_RE = /^\|\s*\*\*C(\d+(?:\.\d+)?)\*\*\s*\|/;
const LINK_RE = /\((\.\/C[\d.]+-[^)]*\.md)\)/;

/**
 * Misconfiguration exit — code 2, NEVER absorbable (C76 §6.1: could-not-measure,
 * measured-a-failure and ratchet-exceeded must not alias).
 *
 * Spelled as a `die(2, …)` helper rather than `return 2` from `main()` because
 * the R5 meta-gate (`check-gate-subject-floors.ts`) reads exit-2 REACHABILITY
 * from source text, and a code that only reaches `process.exit` through a
 * returned variable is invisible to it. It flagged this file on its first run;
 * the honest fix is to make the exit literal, not to argue with the detector.
 */
function die(code: number, msg: string): never {
  console.error(msg);
  process.exit(code);
}

interface Row {
  id: string;
  line: number;
  link: string | null;
}

function parseRows(text: string): Row[] {
  const rows: Row[] = [];
  text.split(/\r?\n/).forEach((line, i) => {
    const m = ROW_RE.exec(line);
    if (!m) return;
    const lm = LINK_RE.exec(line);
    rows.push({ id: `C${m[1]}`, line: i + 1, link: lm ? lm[1] : null });
  });
  return rows;
}

/**
 * ids the README explicitly declares RESERVED / unminted.
 *
 * ⚠ Every character of the intervening span carries a `(?!C\d)` guard, so the id
 * matched is the LAST one before the word RESERVED. Without that guard the
 * changelog idiom *"C61 remains the RESERVED unminted slot — **C64** does not
 * take it"* declares **C64** reserved, which is the precise opposite of what the
 * sentence says. The first draft of this function did exactly that and silently
 * exempted six live contracts (C24.1, C64, C66, C68, C69, C76) from arm D.
 *
 * ⭐ Recorded rather than quietly fixed, because it is this gate family's own
 * failure shape turned on itself: **a permissive exemption parser makes a hard
 * arm unfalsifiable** — arm D would have run, passed, and could never have
 * failed. It was caught by the planted control below, not by reading the code.
 *
 * FORWARD DIRECTION ONLY (`<id> … RESERVED`). The reverse reading is what
 * produced those false positives; in this README every RESERVED declaration
 * names its id first.
 */
function reservedIds(text: string): Set<string> {
  const out = new Set<string>();
  for (const m of text.matchAll(/(C\d+(?:\.\d+)?)\*{0,2}(?:(?!C\d)[^.\n]){0,50}?RESERVED/g)) {
    out.add(m[1]);
  }
  return out;
}

function numeric(id: string): number {
  return parseFloat(id.slice(1));
}

/** F0 planted controls — exercised against the real parsers on every run. */
function controlsFired(): { ok: boolean; detail: string } {
  const fixture = [
    '| **C01** | [A](./C01-A.md) | body |',
    '| **C24.1** | [B](./C24.1-B.md) | body |',
    'Prose mentioning C99 must NOT become a row.',
    '| not a row | x |',
  ].join('\n');
  const rows = parseRows(fixture);
  const problems: string[] = [];
  const resNeg = reservedIds('C61 remains the RESERVED unminted slot - C64 does not take it');
  if (!resNeg.has('C61')) problems.push('RESERVED forward match failed');
  if (resNeg.has('C64')) problems.push('RESERVED over-matched a trailing id (C64)');
  if (rows.length !== 2) problems.push(`expected 2 rows, parsed ${rows.length}`);
  if (rows[0]?.id !== 'C01' || rows[0]?.link !== './C01-A.md') problems.push('plain row misparsed');
  if (rows[1]?.id !== 'C24.1') problems.push('decimal id (C24.1) misparsed');
  const res = reservedIds('**C61** is the ONLY RESERVED, unminted slot');
  if (!res.has('C61')) problems.push('RESERVED declaration not detected');
  return { ok: problems.length === 0, detail: problems.join('; ') };
}

function main(): number {
  if (!fs.existsSync(README)) {
    die(2, `[${LABEL}] MISCONFIGURED: README not found at ${README}`);
  }
  const ctl = controlsFired();
  if (!ctl.ok) {
    die(2, `[${LABEL}] MISCONFIGURED: planted control failed to fire — ${ctl.detail}`);
  }

  const readme = fs.readFileSync(README, 'utf8');

  // --- DIRECTORY SIDE (derived, never transcribed) ---
  const fileById = new Map<string, string>();
  for (const f of fs.readdirSync(CONTRACT_DIR)) {
    const m = FILE_RE.exec(f);
    if (m) fileById.set(`C${m[1]}`, f);
  }

  // --- INDEX SIDE ---
  const rows = parseRows(readme);
  const rowById = new Map<string, Row>();
  for (const r of rows) if (!rowById.has(r.id)) rowById.set(r.id, r);
  const reserved = reservedIds(readme);

  if (fileById.size < MIN_FILES) {
    die(2, `[${LABEL}] MISCONFIGURED: ${fileById.size} contract files < floor ${MIN_FILES}`);
  }
  if (rowById.size < MIN_ROWS) {
    die(2, `[${LABEL}] MISCONFIGURED: ${rowById.size} index rows < floor ${MIN_ROWS}
  A parser finding no rows would report a clean sweep of nothing.`);
  }

  // --- ARM A: file without row ---
  const fileWithoutRow = [...fileById.keys()]
    .filter((id) => !rowById.has(id))
    .sort((a, b) => numeric(a) - numeric(b));

  // --- ARM B: row without file / dead link ---
  const rowWithoutFile: string[] = [];
  // --- ARM C: row id does not match the file it links to ---
  const mismatch: string[] = [];
  for (const r of rowById.values()) {
    if (SELF_ROW_IDS.has(r.id)) continue;
    if (!fileById.has(r.id)) {
      rowWithoutFile.push(`${r.id} (README:${r.line}) — no C${numeric(r.id)} file on disk`);
      continue;
    }
    if (!r.link) {
      mismatch.push(`${r.id} (README:${r.line}) — row carries NO link to its contract file`);
      continue;
    }
    const target = r.link.replace(/^\.\//, '');
    if (!fs.existsSync(path.join(CONTRACT_DIR, target))) {
      rowWithoutFile.push(`${r.id} (README:${r.line}) — link target missing: ${target}`);
      continue;
    }
    const tm = FILE_RE.exec(target);
    if (!tm || `C${tm[1]}` !== r.id) {
      mismatch.push(`${r.id} (README:${r.line}) — links to ${target}, a different contract`);
    }
  }

  // --- ARM D: gap in the minted range, not declared RESERVED ---
  const maxId = Math.max(...[...fileById.keys(), ...rowById.keys()].map(numeric));
  const gaps: string[] = [];
  for (let n = 1; n <= maxId; n++) {
    const id = `C${String(n).padStart(2, '0')}`;
    const alt = `C${n}`;
    if (fileById.has(id) || fileById.has(alt) || rowById.has(id) || rowById.has(alt)) continue;
    if (reserved.has(id) || reserved.has(alt)) continue;
    gaps.push(id);
  }

  console.log(`[${LABEL}] contract FILES on disk : ${fileById.size}`);
  console.log(`[${LABEL}] index ROWS in README   : ${rowById.size}  (max id C${maxId})`);
  console.log(`[${LABEL}] declared RESERVED ids  : ${[...reserved].sort().join(', ') || '(none)'}`);
  console.log(`[${LABEL}]   A FILE WITHOUT ROW   : ${fileWithoutRow.length}  (baseline ${BASELINE_FILE_WITHOUT_ROW})`);
  console.log(`[${LABEL}]   B ROW WITHOUT FILE   : ${rowWithoutFile.length}  (hard 0)`);
  console.log(`[${LABEL}]   C ROW/LINK MISMATCH  : ${mismatch.length}  (hard 0)`);
  console.log(`[${LABEL}]   D GAP NOT RESERVED   : ${gaps.length}  (hard 0)`);

  if (fileWithoutRow.length) {
    console.log('\n  A — contracts that EXIST but are ordered by NOTHING:');
    for (const id of fileWithoutRow) console.log(`      ${id}  ${fileById.get(id)}`);
  }
  for (const [arm, list] of [
    ['B', rowWithoutFile],
    ['C', mismatch],
    ['D', gaps.map((g) => `${g} — in range, no file, no row, not declared RESERVED`)],
  ] as const) {
    if (list.length) {
      console.log(`\n  ${arm} findings:`);
      for (const s of list) console.log(`      ${s}`);
    }
  }

  let rc = 0;
  if (fileWithoutRow.length > BASELINE_FILE_WITHOUT_ROW) {
    console.error(
      `\n[${LABEL}] [3] ARM A RATCHET EXCEEDED — ${fileWithoutRow.length} files with no index row, declared level ${BASELINE_FILE_WITHOUT_ROW}.`,
    );
    console.error('  Add the row in the SAME commit that adds the contract. Do NOT raise the baseline.');
    rc = 3;
  }
  if (rowWithoutFile.length || mismatch.length || gaps.length) {
    console.error(`\n[${LABEL}] [3] HARD ARM BREACHED (B=${rowWithoutFile.length} C=${mismatch.length} D=${gaps.length}).`);
    rc = 3;
  }
  if (rc === 0) {
    if (fileWithoutRow.length < BASELINE_FILE_WITHOUT_ROW) {
      console.log(
        `\n[${LABEL}] OK: arm A ${fileWithoutRow.length} < baseline ${BASELINE_FILE_WITHOUT_ROW}. ` +
          'RATCHET DOWN in this commit.',
      );
    } else {
      console.log(`\n[${LABEL}] OK: arm A ${fileWithoutRow.length} = baseline; arms B/C/D clean.`);
    }
  }
  return rc;
}

process.exit(main());
