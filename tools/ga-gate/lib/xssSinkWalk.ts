/**
 * @file tools/ga-gate/lib/xssSinkWalk.ts
 *
 * §XSS-SINK-SCAN (L-407) — filesystem side of the repo-wide HTML-sink scan.
 * Kept separate from `xssSinkScan.ts` so the classifier stays pure/testable.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, extname, sep } from 'node:path';
import { scanSource, type SinkFinding } from './xssSinkScan.js';

/** Top-level trees that ship client-side markup. */
export const SCAN_DIRS = ['apps', 'packages', 'src', 'plugins'] as const;

export const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.turbo', 'coverage',
  '__snapshots__', '.next', '.vite', 'dist-gate', 'dist-apex', 'public',
]);

const EXT_OK = new Set(['.ts', '.tsx']);

/**
 * Minimum number of source files a healthy scan must reach.
 * §HONESTY: the previous gate resolved its root to `/C:/…` on Windows, walked
 * nothing, swallowed every ENOENT and printed "✅ 0 violations". Failure and
 * empty were the same value. This floor makes an unscannable tree a hard
 * misconfiguration (exit 2) rather than a green tick. Current tree ≈ 5.4k files.
 */
export const MIN_SCANNED_FILES = 2000;

export function walkFiles(dir: string): string[] {
  const results: string[] = [];
  let entries: string[];
  try { entries = readdirSync(dir); } catch { return results; }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    let st;
    try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) results.push(...walkFiles(full));
    else if (EXT_OK.has(extname(full))) results.push(full);
  }
  return results;
}

export interface ScanResult {
  findings: SinkFinding[];
  filesScanned: number;
}

/** Skip test/spec sources — their fixture payloads are the point. */
function isTestFile(rel: string): boolean {
  return /(^|\/)__tests__\//.test(rel) || /\.(spec|test)\.tsx?$/.test(rel);
}

export function scanRepo(root: string, dirs: readonly string[] = SCAN_DIRS): ScanResult {
  const findings: SinkFinding[] = [];
  let filesScanned = 0;
  for (const dir of dirs) {
    for (const file of walkFiles(join(root, dir))) {
      const rel = file.slice(root.length + 1).split(sep).join('/');
      if (isTestFile(rel)) continue;
      filesScanned++;
      let src: string;
      try { src = readFileSync(file, 'utf8'); } catch { continue; }
      findings.push(...scanSource(rel, src));
    }
  }
  findings.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
  return { findings, filesScanned };
}

/** Baseline shape: repo-relative file → number of accepted findings. */
export type SinkBaseline = Record<string, number>;

export function tally(findings: SinkFinding[]): SinkBaseline {
  const out: SinkBaseline = {};
  for (const f of findings) out[f.file] = (out[f.file] ?? 0) + 1;
  return out;
}

export interface BaselineDiff {
  /** Files with findings that are not in the baseline at all. */
  newFiles: string[];
  /** Files whose finding count exceeded their baseline. */
  grown: Array<{ file: string; baseline: number; actual: number }>;
  /** Files that improved — the baseline should be ratcheted down. */
  shrunk: Array<{ file: string; baseline: number; actual: number }>;
  /** Baseline entries with zero findings left. */
  cleared: string[];
}

export function diffBaseline(actual: SinkBaseline, baseline: SinkBaseline): BaselineDiff {
  const newFiles: string[] = [];
  const grown: BaselineDiff['grown'] = [];
  const shrunk: BaselineDiff['shrunk'] = [];
  const cleared: string[] = [];
  for (const [file, count] of Object.entries(actual)) {
    const base = baseline[file];
    if (base === undefined) newFiles.push(file);
    else if (count > base) grown.push({ file, baseline: base, actual: count });
    else if (count < base) shrunk.push({ file, baseline: base, actual: count });
  }
  for (const file of Object.keys(baseline)) if (!(file in actual)) cleared.push(file);
  return { newFiles, grown, shrunk, cleared };
}
