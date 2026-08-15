/**
 * tools/tracker/update-tracker.ts
 *
 * "Every time a file is committed the tracker should be updated." — the founder.
 *
 * WHAT IT UPDATES, AND WHAT IT REFUSES TO UPDATE
 * ----------------------------------------------
 * It maintains ONE delimited, machine-owned block in the tracker markdown:
 * a commit ledger (which commits landed, which rows own the paths they touched,
 * which paths map to no row) and a gate-staleness table (how old each recorded
 * gate reading is, in commits).
 *
 * It does NOT touch a row's STATUS, and it does not compute completion. A row
 * moves between OPEN / CLOSED / UNPROVEN only when a gate is EXECUTED and a
 * human records that run. A post-commit hook that nudged a percentage would be
 * hand-incrementing a count from the mere fact that code was written — which is
 * the exact defect this repo has logged repeatedly (a document asserting
 * enforcement that was never measured). Commits are evidence of ACTIVITY, never
 * of CORRECTNESS.
 *
 * USAGE
 *   npx tsx tools/tracker/update-tracker.ts            # rewrite the auto-block
 *   npx tsx tools/tracker/update-tracker.ts --check     # CI: exit 1 if stale
 *   npx tsx tools/tracker/update-tracker.ts --tracker <path> --sidecar <path>
 *
 * EXIT CODES
 *   Normal mode : ALWAYS 0. It runs from a post-commit hook; a hook that can
 *                 fail a commit gets disabled by the first person it annoys,
 *                 and then the mechanism is worth nothing. Errors are PRINTED.
 *   --check mode: 0 if the block is byte-identical to what HEAD would produce,
 *                 1 otherwise (including every malformed/missing-marker case).
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  type CommitRecord,
  type GateStaleness,
  type Sidecar,
  renderAutoBlock,
  spliceAutoBlock,
  validateSidecar,
} from './trackerCore.js';

export const DEFAULT_TRACKER = 'docs/03-execution/plans/BIM30-MASTER-COMPLETION-TRACKER.md';
export const DEFAULT_SIDECAR = 'tools/tracker/row-paths.json';
export const DEFAULT_LEDGER_DEPTH = 25;

/** The only git surface this tool needs. Injectable so tests need no repo. */
export interface GitPort {
  /** Most-recent-first commits with their changed paths. */
  log(depth: number): CommitRecord[];
  /** Total commits reachable from HEAD, or null if uncountable. */
  totalCommits(): number | null;
  /** Last commit that touched `path`, or null if none / path absent. */
  lastCommitTouching(path: string): { sha: string; isoDate: string } | null;
  /** Commits in `sha..HEAD`, or null if uncountable. */
  commitsSince(sha: string): number | null;
}

// ASCII RS / US, written as escapes (not literal control bytes) so the framing
// survives any editor, diff tool or copy-paste that would silently strip them.
const RECORD_SEP = '\x1e';
const FIELD_SEP = '\x1f';

export function createGitPort(repoRoot: string): GitPort {
  const git = (args: string[]): string =>
    execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

  return {
    log(depth) {
      // One process, machine-safe separators — commit subjects in this repo
      // contain `|`, `:`, em-dashes and quotes, so newline/pipe framing is not
      // safe. ASCII RS/US cannot appear in a subject.
      const raw = git([
        'log',
        `-n${depth}`,
        `--format=${RECORD_SEP}%H${FIELD_SEP}%cI${FIELD_SEP}%s${FIELD_SEP}`,
        '--name-only',
        '--no-color',
        // Merge commits list no paths under --name-only without this; we accept
        // the empty list and render "*no path data*" rather than inventing one.
        '--no-renames',
      ]);
      const out: CommitRecord[] = [];
      for (const chunk of raw.split(RECORD_SEP)) {
        if (!chunk.trim()) continue;
        const [sha, isoDate, subject, rest = ''] = chunk.split(FIELD_SEP);
        const paths = rest
          .split('\n')
          .map((s) => s.trim())
          .filter((s) => s.length > 0);
        out.push({ sha, isoDate, subject, paths });
      }
      return out;
    },
    totalCommits() {
      try {
        return Number.parseInt(git(['rev-list', '--count', 'HEAD']).trim(), 10);
      } catch {
        return null;
      }
    },
    lastCommitTouching(path) {
      try {
        const raw = git(['log', '-1', `--format=%H${FIELD_SEP}%cI`, '--', path]).trim();
        if (!raw) return null;
        const [sha, isoDate] = raw.split(FIELD_SEP);
        return { sha, isoDate };
      } catch {
        return null;
      }
    },
    commitsSince(sha) {
      try {
        return Number.parseInt(git(['rev-list', '--count', `${sha}..HEAD`]).trim(), 10);
      } catch {
        return null;
      }
    },
  };
}

/**
 * Age every gate in the sidecar against its evidence artefact.
 *
 * A gate's "last recorded measurement" is the last commit that changed the file
 * the gate writes its reading into (its baseline/ledger JSON). We never execute
 * the gate. If no evidence path resolves — the artefact does not exist yet, or
 * the gate itself does not exist yet — we say NOT DETERMINED and say why. We
 * emphatically do not report `0 commits since`, which would read as "freshly
 * measured" and be the exact inversion of the truth.
 */
export function computeStaleness(sidecar: Sidecar, git: GitPort, repoRoot: string): GateStaleness[] {
  return sidecar.gates.map((g) => {
    const missing: string[] = [];
    let best: { sha: string; isoDate: string } | null = null;

    for (const ev of g.evidence) {
      if (!existsSync(resolve(repoRoot, ev))) {
        missing.push(ev);
        continue;
      }
      const hit = git.lastCommitTouching(ev);
      if (!hit) {
        missing.push(`${ev} (tracked by no commit)`);
        continue;
      }
      // Most recent evidence change wins — that is the freshest reading.
      if (!best || hit.isoDate > best.isoDate) best = hit;
    }

    if (!best) {
      return {
        id: g.id,
        gate: g.gate,
        evidenceSha: null,
        evidenceDate: null,
        commitsSince: null,
        undeterminedReason:
          g.evidence.length === 0
            ? 'sidecar declares no evidence artefact for this gate'
            : `no evidence artefact resolved: ${missing.join(', ')}`,
      };
    }

    const since = git.commitsSince(best.sha);
    return {
      id: g.id,
      gate: g.gate,
      evidenceSha: best.sha,
      evidenceDate: best.isoDate,
      commitsSince: since,
      undeterminedReason: since === null ? 'commit distance to HEAD could not be counted' : undefined,
    };
  });
}

export interface RunOptions {
  repoRoot: string;
  trackerPath: string;
  sidecarPath: string;
  git: GitPort;
  check?: boolean;
  ledgerDepth?: number;
  /** Injected for tests; defaults to real fs. */
  readFile?: (p: string) => string;
  writeFile?: (p: string, s: string) => void;
}

export type RunStatus = 'updated' | 'unchanged' | 'stale' | 'error';

export interface RunResult {
  status: RunStatus;
  messages: string[];
}

export function runUpdate(opts: RunOptions): RunResult {
  const messages: string[] = [];
  const read = opts.readFile ?? ((p: string) => readFileSync(p, 'utf8'));
  const write = opts.writeFile ?? ((p: string, s: string) => writeFileSync(p, s, 'utf8'));
  const trackerAbs = resolve(opts.repoRoot, opts.trackerPath);
  const sidecarAbs = resolve(opts.repoRoot, opts.sidecarPath);

  /* ---- sidecar ---- */
  let sidecar: Sidecar;
  try {
    const parsed: unknown = JSON.parse(read(sidecarAbs));
    const v = validateSidecar(parsed);
    if (!v.ok) return { status: 'error', messages: [`tracker: sidecar invalid — ${v.reason}`] };
    sidecar = v.sidecar;
  } catch (err) {
    return {
      status: 'error',
      messages: [`tracker: could not read ${opts.sidecarPath} — ${(err as Error).message}`],
    };
  }

  /* ---- tracker ---- */
  let markdown: string;
  try {
    markdown = read(trackerAbs);
  } catch (err) {
    return {
      status: 'error',
      messages: [`tracker: could not read ${opts.trackerPath} — ${(err as Error).message}`],
    };
  }

  /* ---- git ---- */
  let ledger: CommitRecord[];
  try {
    ledger = opts.git.log(opts.ledgerDepth ?? DEFAULT_LEDGER_DEPTH);
  } catch (err) {
    return { status: 'error', messages: [`tracker: git log failed — ${(err as Error).message}`] };
  }
  if (ledger.length === 0) {
    return { status: 'error', messages: ['tracker: git log returned no commits — nothing recorded.'] };
  }

  const block = renderAutoBlock({
    head: ledger[0],
    ledger,
    rows: sidecar.rows,
    gates: computeStaleness(sidecar, opts.git, opts.repoRoot),
    totalCommits: opts.git.totalCommits(),
    sidecarPath: opts.sidecarPath,
  });

  const spliced = spliceAutoBlock(markdown, block);
  if (!spliced.ok) {
    // LOUD, and nothing written. See spliceAutoBlock's contract.
    return {
      status: 'error',
      messages: [
        `tracker: REFUSING TO WRITE ${opts.trackerPath} — ${spliced.reason}`,
        'tracker: the file was left byte-for-byte unchanged.',
      ],
    };
  }

  if (!spliced.changed) {
    messages.push(`tracker: up to date at ${ledger[0].sha.slice(0, 8)} (no write).`);
    return { status: 'unchanged', messages };
  }

  if (opts.check) {
    return {
      status: 'stale',
      messages: [
        `tracker: AUTO-BLOCK IS STALE against HEAD ${ledger[0].sha.slice(0, 8)}.`,
        'tracker: run `npx tsx tools/tracker/update-tracker.ts` and commit the result.',
      ],
    };
  }

  write(trackerAbs, spliced.text);
  messages.push(`tracker: auto-block updated to ${ledger[0].sha.slice(0, 8)}.`);
  return { status: 'updated', messages };
}

/* ------------------------------------------------------------------- CLI */

function parseArgs(argv: string[]) {
  const get = (flag: string, fallback: string): string => {
    const i = argv.indexOf(flag);
    return i !== -1 && argv[i + 1] ? argv[i + 1] : fallback;
  };
  return {
    check: argv.includes('--check'),
    tracker: get('--tracker', DEFAULT_TRACKER),
    sidecar: get('--sidecar', DEFAULT_SIDECAR),
    repoRoot: get('--repo', process.cwd()),
    depth: Number.parseInt(get('--depth', String(DEFAULT_LEDGER_DEPTH)), 10),
  };
}

export function main(argv: string[]): number {
  const args = parseArgs(argv);
  let result: RunResult;
  try {
    result = runUpdate({
      repoRoot: args.repoRoot,
      trackerPath: args.tracker,
      sidecarPath: args.sidecar,
      git: createGitPort(args.repoRoot),
      check: args.check,
      ledgerDepth: Number.isFinite(args.depth) ? args.depth : DEFAULT_LEDGER_DEPTH,
    });
  } catch (err) {
    // Belt and braces: nothing reaches the caller as a throw.
    result = { status: 'error', messages: [`tracker: unexpected failure — ${(err as Error).message}`] };
  }
  for (const m of result.messages) console.log(m);
  if (args.check) return result.status === 'unchanged' ? 0 : 1;
  return 0; // post-commit must never fail a commit.
}

const invokedDirectly =
  process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) process.exit(main(process.argv.slice(2)));
