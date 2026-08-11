/**
 * @file tools/ga-gate/lib/sourceScan.ts
 *
 * §FIX-GATE-NEEDS-RIPGREP (L-811) — a Node-native source scanner, so that a gate
 * never again depends on a binary that may or may not be installed.
 *
 * ─── What was wrong ──────────────────────────────────────────────────────────
 * Fourteen of the twenty-seven GA gates shelled out to `rg` (ripgrep). Ripgrep is
 * NOT a declared dependency of this repo, is NOT installed on a stock Windows dev
 * box, and is NOT installed by `.github/workflows/ci.yml`. On any machine without
 * it those gates died with:
 *
 *     Error: spawnSync rg ENOENT
 *
 * Three of them are the enforcement for P2 (single THREE owner), P3 (single rAF)
 * and P4 (no `(window as any)`) — three of the eight architectural principles.
 *
 * Several also piped through `awk` / `wc`, which do not exist on Windows outside a
 * POSIX shell, so even WITH ripgrep installed those gates would return garbage.
 *
 * ─── Why this is not "just a crash" ──────────────────────────────────────────
 * A crashing gate and a passing gate are distinguishable ONLY if somebody reads
 * the exit code carefully. `run-all.ts` does — it reports ENOENT as a failure —
 * but each of these gates was ALSO on `gate-debt.json` as declared debt, so the
 * ENOENT was absorbed as "known failing" and told nobody that the gate had never
 * evaluated a single line of source. That is §CONTEXT-DATA-HONESTY applied to CI
 * itself: MISSING PREREQUISITE and CLEAN CODE produced the same observable state.
 *
 * ─── The decision: Node-native, not "install ripgrep in CI" ──────────────────
 * Installing ripgrep in `ci.yml` would fix CI and leave every developer machine
 * broken, which is worse — it hides the failure precisely where a contributor
 * would first hit it, and re-creates the "green on the runner, red locally" split
 * that teaches people to ignore gates. A gate's prerequisites must be the same
 * `pnpm install` everything else needs. This module has zero dependencies beyond
 * `node:fs`, so a gate built on it runs anywhere Node runs.
 *
 * ─── The honesty floor ───────────────────────────────────────────────────────
 * `scanFiles()` REQUIRES a `minFiles` floor and exits 2 if the walk reaches fewer
 * files than that. Mirrors `lib/xssSinkWalk.ts` MIN_SCANNED_FILES, which exists
 * because that gate once resolved its root to `/C:/…` on Windows, walked nothing,
 * and printed "✅ 0 violations". A scanner that finds nothing because it looked
 * nowhere MUST NOT be able to report a pass.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, extname, sep, relative } from 'node:path';
// The repo's single comment lexer. See "Line-preserving comment stripping" below
// for why it is wrapped rather than forked.
import { stripComments } from './writeRouteScan.js';

/** Directories never worth walking. Build output, VCS metadata, dependencies. */
export const DEFAULT_SKIP_DIRS: ReadonlySet<string> = new Set([
  'node_modules', '.git', 'dist', 'build', '.turbo', 'coverage',
  '__snapshots__', '.next', '.vite', 'dist-gate', 'dist-apex',
  '.pnpm-store', 'out', '.cache',
]);

export interface WalkOptions {
  /** File extensions to include, with the dot. Default: .ts and .tsx. */
  readonly exts?: readonly string[];
  /** Directory basenames to skip, on top of DEFAULT_SKIP_DIRS. */
  readonly skipDirs?: readonly string[];
}

/**
 * Recursively list source files under `dir`. Returns ABSOLUTE paths.
 * A directory that cannot be read is skipped — but see `scanFiles`'s minFiles
 * floor, which is what stops a wholly-unreadable tree from looking clean.
 */
export function walk(dir: string, opts: WalkOptions = {}): string[] {
  const exts = new Set(opts.exts ?? ['.ts', '.tsx']);
  const skip = new Set([...DEFAULT_SKIP_DIRS, ...(opts.skipDirs ?? [])]);
  const out: string[] = [];

  const rec = (d: string): void => {
    let entries: string[];
    try { entries = readdirSync(d); } catch { return; }
    for (const name of entries) {
      if (skip.has(name)) continue;
      const full = join(d, name);
      let st;
      try { st = statSync(full); } catch { continue; }
      if (st.isDirectory()) rec(full);
      else if (exts.has(extname(full))) out.push(full);
    }
  };
  rec(dir);
  return out;
}

/** Repo-relative, forward-slashed. Every gate reports paths in this form. */
export function relPath(root: string, abs: string): string {
  return relative(root, abs).split(sep).join('/');
}

export interface Match {
  /** Repo-relative, forward-slashed. */
  readonly file: string;
  /** 1-based. */
  readonly line: number;
  /** The matching line, trimmed. */
  readonly text: string;
  /** Regex capture groups, if the pattern had any. */
  readonly groups: readonly (string | undefined)[];
}

export interface ScanOptions {
  /** Repo root; all reported paths are relative to it. */
  readonly root: string;
  /** Directories to walk, repo-relative. */
  readonly dirs: readonly string[];
  /**
   * The pattern, applied PER LINE. A `g` flag is added if absent so that
   * multiple hits on one line are all counted.
   */
  readonly pattern: RegExp;
  /**
   * ⚠ REQUIRED. Minimum files the walk must reach for the result to be
   * trustworthy. Below this the scan exits 2 (misconfiguration), never 0.
   */
  readonly minFiles: number;
  /** Repo-relative path predicate — return true to EXCLUDE the file. */
  readonly exclude?: (rel: string) => boolean;
  /** Extensions, default .ts/.tsx. */
  readonly exts?: readonly string[];
  /** Extra directory basenames to skip. */
  readonly skipDirs?: readonly string[];
  /** Label used in the misconfiguration message. */
  readonly label: string;
}

export interface ScanResult {
  readonly matches: Match[];
  /** Files actually read. */
  readonly filesScanned: number;
  /** Files matched by the walk but excluded by `exclude`. Reported, never hidden. */
  readonly filesExcluded: number;
  /** Files with ≥1 match. */
  readonly filesMatched: number;
}

/**
 * Walk, read, and match line-by-line.
 *
 * Exits the process with code 2 if fewer than `minFiles` files were reached.
 * Exit 2 is deliberately NOT 1: a broken scan is a different fact from a failed
 * check, and conflating them is how "0 violations" once meant "walked nothing".
 */
export function scanFiles(opts: ScanOptions): ScanResult {
  const flags = opts.pattern.flags.includes('g') ? opts.pattern.flags : opts.pattern.flags + 'g';
  const re = new RegExp(opts.pattern.source, flags);

  const matches: Match[] = [];
  let filesScanned = 0;
  let filesExcluded = 0;
  let filesMatched = 0;

  for (const dir of opts.dirs) {
    for (const abs of walk(join(opts.root, dir), { exts: opts.exts, skipDirs: opts.skipDirs })) {
      const rel = relPath(opts.root, abs);
      if (opts.exclude?.(rel)) { filesExcluded++; continue; }
      let src: string;
      try { src = readFileSync(abs, 'utf8'); } catch { continue; }
      filesScanned++;
      let hit = false;
      const lines = src.split('\n');
      for (let i = 0; i < lines.length; i++) {
        re.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = re.exec(lines[i]!)) !== null) {
          matches.push({ file: rel, line: i + 1, text: lines[i]!.trim(), groups: m.slice(1) });
          hit = true;
          if (m[0] === '') re.lastIndex++;   // guard a zero-width pattern
        }
      }
      if (hit) filesMatched++;
    }
  }

  if (filesScanned < opts.minFiles) {
    console.error(
      `\n[${opts.label}] MISCONFIGURED (exit 2) — the scan READ only ${filesScanned} file(s) ` +
      `(${filesExcluded} more were walked but excluded by filter); floor is ${opts.minFiles}.\n` +
      `  Root:  ${opts.root}\n` +
      `  Dirs:  ${opts.dirs.join(', ')}\n` +
      `  This is NOT a pass. A scan that looked nowhere finds nothing, and reporting\n` +
      `  that as "0 violations" is the exact failure this floor exists to prevent.`,
    );
    process.exit(2);
  }

  return { matches, filesScanned, filesExcluded, filesMatched };
}

// ── Per-file COVERAGE scanning ────────────────────────────────────────────────
//
// §FIX-P8-ENFORCEMENT-BLIND (W3-2, 2026-08-11) — ADDITIVE.
//
// `scanFiles()` answers "where does this pattern appear?". A coverage gate asks
// the opposite question: "which files that MUST contain a pattern do not?".
// Expressing that with `scanFiles()` means inverting a match list against a
// separately-computed file list — two walks that can silently disagree, which is
// precisely how a coverage gate ends up reporting on a set it never enumerated.
//
// `scanFileCoverage()` does one walk and returns BOTH sides of the partition, so
// covered + uncovered is always exactly the population. It inherits the same
// `minFiles` honesty floor and the same exit-2 semantics: a scan that read fewer
// files than its floor is MISCONFIGURED, and must never be reported as a pass.
//
// Nothing above this line changed. Existing callers of walk()/scanFiles()/
// tallyBy() are unaffected.

export interface CoverageOptions {
  /** Repo root; all reported paths are relative to it. */
  readonly root: string;
  /** Directories to walk, repo-relative. Missing directories contribute nothing. */
  readonly dirs: readonly string[];
  /** A file is COVERED when its source matches this. Applied to the whole file. */
  readonly require: RegExp;
  /**
   * Population filter. Return true for files that are SUBJECT to the rule.
   * Files returning false are counted as `filesExcluded` — reported, never hidden.
   */
  readonly participates?: (rel: string, src: string) => boolean;
  /**
   * ⚠ REQUIRED. Minimum files the walk must READ (before `participates`) for the
   * result to be trustworthy. Below this the scan exits 2, never 0.
   * This is a MISCONFIGURATION detector, NOT a coverage target — never raise it
   * to make a gate green.
   */
  readonly minFiles: number;
  /** Extensions, default .ts/.tsx. */
  readonly exts?: readonly string[];
  /** Extra directory basenames to skip. */
  readonly skipDirs?: readonly string[];
  /** Label used in the misconfiguration message. */
  readonly label: string;
}

export interface CoverageResult {
  /** Repo-relative, forward-slashed. Participating files that matched `require`. */
  readonly covered: string[];
  /** Repo-relative, forward-slashed. Participating files that did NOT match. */
  readonly uncovered: string[];
  /** Files read from disk, before `participates`. The honesty-floor subject. */
  readonly filesRead: number;
  /** Files read but filtered out by `participates`. */
  readonly filesExcluded: number;
}

/**
 * Partition every file under `dirs` into covered / uncovered by `require`.
 *
 * Exits the process with code 2 if fewer than `minFiles` files were READ.
 * Exit 2 is deliberately NOT 1: "this family has no violations" and "this walk
 * never reached the family" are different facts, and a gate that cannot
 * establish its own subject is misconfigured, not passing.
 */
export function scanFileCoverage(opts: CoverageOptions): CoverageResult {
  const covered: string[] = [];
  const uncovered: string[] = [];
  let filesRead = 0;
  let filesExcluded = 0;

  for (const dir of opts.dirs) {
    for (const abs of walk(join(opts.root, dir), { exts: opts.exts, skipDirs: opts.skipDirs })) {
      const rel = relPath(opts.root, abs);
      let src: string;
      try { src = readFileSync(abs, 'utf8'); } catch { continue; }
      filesRead++;
      if (opts.participates && !opts.participates(rel, src)) { filesExcluded++; continue; }
      if (opts.require.test(src)) covered.push(rel);
      else uncovered.push(rel);
    }
  }

  if (filesRead < opts.minFiles) {
    console.error(
      `\n[${opts.label}] MISCONFIGURED (exit 2) — the coverage walk READ only ${filesRead} file(s); ` +
      `floor is ${opts.minFiles}.\n` +
      `  Root:  ${opts.root}\n` +
      `  Dirs:  ${opts.dirs.join(', ')}\n` +
      `  This is NOT a pass. A coverage scan that enumerated nothing has nothing to\n` +
      `  cover, and reporting that as "100% covered" is the exact failure this floor\n` +
      `  exists to prevent.`,
    );
    process.exit(2);
  }

  return { covered, uncovered, filesRead, filesExcluded };
}

// ── Line-preserving comment stripping ─────────────────────────────────────────
//
// §FIX-GATE-NEEDS-RIPGREP (L-811, wave P, 2026-08-11) — ADDITIVE.
//
// A gate whose pattern can appear in prose measures DOCUMENTATION unless comments
// are removed first. This is not theoretical: `BatchCoordinator.ts` mentions
// `forceReset` 33 times and calls it twice. Every ratchet in this family
// (`new CustomEvent`, `structuredClone`, `WorkspaceMountBridge`, `cm.execute`)
// is exactly that shape — a name that a migration plan's JSDoc repeats far more
// often than the code uses it.
//
// The single comment lexer in this repo is `stripComments()` in
// `lib/writeRouteScan.ts`. It is whole-source and collapses a block comment to a
// single space, which DESTROYS line numbering — fine for its own caller (which
// matches, and never reports a line) but unusable for a gate that must report
// `file:line`. Rather than fork a fourth copy of the lexer, this wrapper drives
// the SAME lexer one line at a time and carries only the block-comment open/close
// state across lines, by re-opening the block (`/*` prefix) on continuation lines.
//
// Detection of "this line left a block comment open" reuses the lexer too: append
// a sentinel; if the lexer swallowed it, the block is still open.
//
// Known, documented limitation: a template literal spanning multiple lines is not
// tracked across lines, so `//` inside a multi-line template on a continuation
// line is treated as a comment. That can only ever REMOVE a candidate line, i.e.
// it can under-count a pattern hiding inside a multi-line template literal — a
// shape none of these gates' patterns legitimately take.

/** Cannot occur in TypeScript source; used only as a lexer probe. */
const EOL_SENTINEL = ' GA_GATE_EOL ';

/**
 * Strip `//` and block comments while preserving the line count, so a match's
 * index is still its real 1-based line number in the file on disk.
 *
 * Returns an array of cleaned lines, same length as `src.split('\n')`.
 */
export function stripCommentsToLines(src: string): string[] {
  const raw = src.split('\n');
  const out: string[] = [];
  let inBlock = false;

  for (const line of raw) {
    const text = inBlock ? `/*${line}` : line;
    // The sentinel goes on the NEXT line: a trailing `//` comment consumes to the
    // first newline, so a same-line sentinel would be eaten by an ordinary line
    // comment and misread as "block still open".
    const probed = stripComments(`${text}\n${EOL_SENTINEL}`);
    const at = probed.indexOf(EOL_SENTINEL);
    if (at !== -1) {
      inBlock = false;
      out.push(probed.slice(0, at).replace(/\n+$/, ''));
    } else {
      // The lexer swallowed the sentinel ⇒ an unterminated block comment (or,
      // rarely, an unterminated string) runs past end-of-line.
      inBlock = true;
      out.push(stripComments(text));
    }
  }
  return out;
}

/**
 * `scanFiles()`, but each file's comments are removed first (line numbers kept).
 *
 * Identical contract to `scanFiles` — including the REQUIRED `minFiles` honesty
 * floor and the exit-2 semantics — except that `Match.text` is the CLEANED line,
 * so the reader can see exactly what the gate matched rather than a line whose
 * meaning depends on a comment the gate discarded.
 */
export function scanFilesStripped(opts: ScanOptions): ScanResult {
  const flags = opts.pattern.flags.includes('g') ? opts.pattern.flags : opts.pattern.flags + 'g';
  const re = new RegExp(opts.pattern.source, flags);

  const matches: Match[] = [];
  let filesScanned = 0;
  let filesExcluded = 0;
  let filesMatched = 0;

  for (const dir of opts.dirs) {
    for (const abs of walk(join(opts.root, dir), { exts: opts.exts, skipDirs: opts.skipDirs })) {
      const rel = relPath(opts.root, abs);
      if (opts.exclude?.(rel)) { filesExcluded++; continue; }
      let src: string;
      try { src = readFileSync(abs, 'utf8'); } catch { continue; }
      filesScanned++;
      let hit = false;
      const lines = stripCommentsToLines(src);
      for (let i = 0; i < lines.length; i++) {
        re.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = re.exec(lines[i]!)) !== null) {
          matches.push({ file: rel, line: i + 1, text: lines[i]!.trim(), groups: m.slice(1) });
          hit = true;
          if (m[0] === '') re.lastIndex++;   // guard a zero-width pattern
        }
      }
      if (hit) filesMatched++;
    }
  }

  if (filesScanned < opts.minFiles) {
    console.error(
      `\n[${opts.label}] MISCONFIGURED (exit 2) — the scan READ only ${filesScanned} file(s) ` +
      `(${filesExcluded} more were walked but excluded by filter); floor is ${opts.minFiles}.\n` +
      `  Root:  ${opts.root}\n` +
      `  Dirs:  ${opts.dirs.join(', ')}\n` +
      `  This is NOT a pass. A scan that looked nowhere finds nothing, and reporting\n` +
      `  that as "0 violations" is the exact failure this floor exists to prevent.`,
    );
    process.exit(2);
  }

  return { matches, filesScanned, filesExcluded, filesMatched };
}

/** Distinct `file:line` pairs — rg's `-c` counted LINES, not occurrences. */
export function distinctLines(matches: readonly Match[]): Match[] {
  const seen = new Set<string>();
  const out: Match[] = [];
  for (const m of matches) {
    const key = `${m.file}:${m.line}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(m);
  }
  return out;
}

/** Count matches grouped by an arbitrary key. Sorted descending. */
export function tallyBy(matches: readonly Match[], key: (m: Match) => string): Array<[string, number]> {
  const map = new Map<string, number>();
  for (const m of matches) map.set(key(m), (map.get(key(m)) ?? 0) + 1);
  return [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}
