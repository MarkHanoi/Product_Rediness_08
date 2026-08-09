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

/** Count matches grouped by an arbitrary key. Sorted descending. */
export function tallyBy(matches: readonly Match[], key: (m: Match) => string): Array<[string, number]> {
  const map = new Map<string, number>();
  for (const m of matches) map.set(key(m), (map.get(key(m)) ?? 0) + 1);
  return [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}
