/**
 * Tests for the commit-ledger auto-block mechanism.
 *
 * The five properties under test are the five ways this tool could damage the
 * founder's tracker or lie to its reader:
 *
 *   1. IDEMPOTENCY        — running twice on one SHA must change nothing.
 *   2. MARKER ISOLATION   — human prose outside the markers must survive BYTE-
 *                           identically. This is the one that matters most: the
 *                           tracker is hand-written analysis and the tool has a
 *                           write handle on it.
 *   3. UNMAPPED DISCLOSURE— a path owned by no row must be REPORTED, not dropped.
 *   4. STALENESS ARITHMETIC — commits-since must be counted, and undeterminable
 *                           staleness must render NOT DETERMINED, never 0.
 *   5. LOUD DEGRADATION   — absent/duplicated/inverted markers must refuse to
 *                           write rather than mangle the file.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  BEGIN_MARKER,
  END_MARKER,
  type CommitRecord,
  type RowMapping,
  globToRegExp,
  mapPathsToRows,
  renderAutoBlock,
  spliceAutoBlock,
  validateSidecar,
} from '../trackerCore.js';
import { type GitPort, computeStaleness, runUpdate } from '../update-tracker.js';

// `__dirname` does not exist under ESM, which is how vitest loads this file.
const FIXTURE = fileURLToPath(new URL('./fixtures/tracker-fixture.md', import.meta.url));
const fixtureText = (): string => readFileSync(FIXTURE, 'utf8');

const ROWS: RowMapping[] = [
  { id: 'bar-3', title: 'Consequence propagation', globs: ['apps/editor/src/engine/consequence/**'] },
  { id: 'epsilon-policy', title: 'Epsilon policy', globs: ['tools/ga-gate/epsilon-policy-baseline.json'] },
];

const COMMITS: CommitRecord[] = [
  {
    sha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    isoDate: '2026-08-15T10:00:00+02:00',
    subject: 'fix(bar-3): a subject with a | pipe and a "quote"',
    paths: ['apps/editor/src/engine/consequence/WallMovePlanner.ts', 'README.md'],
  },
  {
    sha: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    isoDate: '2026-08-14T09:00:00+02:00',
    subject: 'chore: unrelated',
    paths: ['server/dbMigrate.js'],
  },
];

/** A GitPort with no repo behind it — every answer is a fixture. */
function fakeGit(over: Partial<GitPort> = {}): GitPort {
  return {
    log: () => COMMITS,
    totalCommits: () => 1234,
    lastCommitTouching: () => ({ sha: 'cccccccccccccccccccccccccccccccccccccccc', isoDate: '2026-07-01T00:00:00Z' }),
    commitsSince: () => 40,
    ...over,
  };
}

function baseRun(over: Partial<Parameters<typeof runUpdate>[0]> = {}) {
  const files = new Map<string, string>([
    [resolve('/repo', 'tracker.md'), fixtureText()],
    [
      resolve('/repo', 'sidecar.json'),
      JSON.stringify({ version: 1, rows: ROWS, gates: [{ id: 'g', gate: 'check-thing', evidence: [] }] }),
    ],
  ]);
  const written: string[] = [];
  const opts = {
    repoRoot: '/repo',
    trackerPath: 'tracker.md',
    sidecarPath: 'sidecar.json',
    git: fakeGit(),
    readFile: (p: string) => {
      const v = files.get(p);
      if (v === undefined) throw new Error(`ENOENT ${p}`);
      return v;
    },
    writeFile: (p: string, s: string) => {
      files.set(p, s);
      written.push(p);
    },
    ...over,
  };
  return { opts, files, written };
}

/* ------------------------------------------------------------------ globs */

describe('glob matching', () => {
  it('matches ** across directory separators and * within one segment', () => {
    expect(globToRegExp('a/**').test('a/b/c.ts')).toBe(true);
    expect(globToRegExp('a/**').test('a')).toBe(true); // the directory itself
    expect(globToRegExp('a/*.ts').test('a/b.ts')).toBe(true);
    expect(globToRegExp('a/*.ts').test('a/b/c.ts')).toBe(false); // * must not cross /
    expect(globToRegExp('a/**').test('ab/c.ts')).toBe(false); // no prefix bleed
  });

  it('treats regex metacharacters in a path as literals', () => {
    expect(globToRegExp('tools/ga-gate/epsilon-policy-baseline.json').test('tools/ga-gate/epsilon-policy-baseline.json')).toBe(true);
    // The `.` must not match an arbitrary character.
    expect(globToRegExp('a/b.json').test('a/bXjson')).toBe(false);
  });
});

/* ------------------------------------------- 3. unmapped-path disclosure */

describe('unmapped-path disclosure (§CONTEXT-DATA-HONESTY)', () => {
  it('reports a path that matches no row instead of dropping it', () => {
    const { byRow, unmapped } = mapPathsToRows(
      ['apps/editor/src/engine/consequence/X.ts', 'server/dbMigrate.js', 'docs/thing.md'],
      ROWS,
    );
    expect([...byRow.keys()]).toEqual(['bar-3']);
    expect(unmapped).toEqual(['server/dbMigrate.js', 'docs/thing.md']);
  });

  it('reports a path to EVERY row that owns it', () => {
    const overlapping: RowMapping[] = [
      { id: 'r1', title: '', globs: ['pkg/**'] },
      { id: 'r2', title: '', globs: ['pkg/sub/**'] },
    ];
    const { byRow, unmapped } = mapPathsToRows(['pkg/sub/a.ts'], overlapping);
    expect([...byRow.keys()].sort()).toEqual(['r1', 'r2']);
    expect(unmapped).toEqual([]);
  });

  it('renders unmapped paths in the block as a mapping gap, never as silence', () => {
    const block = renderAutoBlock({
      head: COMMITS[0],
      ledger: COMMITS,
      rows: ROWS,
      gates: [],
      totalCommits: 10,
      sidecarPath: 's.json',
    });
    expect(block).toContain('UNMAPPED');
    // The two unmapped paths (README.md, server/dbMigrate.js) must be counted.
    expect(block).toContain('2 distinct changed path(s) matched no row');
    expect(block).toContain('mapping gap');
    // And the commit that mapped to nothing must say so explicitly.
    expect(block).toContain('*none mapped*');
  });

  it('says NOT DETERMINED — never "0 gates" — when the sidecar declares no gates', () => {
    const block = renderAutoBlock({
      head: COMMITS[0],
      ledger: COMMITS,
      rows: ROWS,
      gates: [],
      totalCommits: null,
      sidecarPath: 's.json',
    });
    expect(block).toContain('**NOT DETERMINED** — `row-paths.json` declares no gates to age');
    // An uncountable repo size must not render as a number either.
    expect(block).toContain('**NOT DETERMINED** — `git rev-list --count HEAD` failed');
  });
});

/* -------------------------------------------- 4. staleness arithmetic */

describe('staleness arithmetic', () => {
  it('counts commits since the evidence artefact last changed', () => {
    const gates = computeStaleness(
      { version: 1, rows: [], gates: [{ id: 'e', gate: 'check-epsilon-policy', evidence: ['package.json'] }] },
      fakeGit({ commitsSince: () => 40 }),
      process.cwd(), // package.json really exists at the repo root
    );
    expect(gates[0].commitsSince).toBe(40);
    expect(gates[0].evidenceSha).toBe('cccccccccccccccccccccccccccccccccccccccc');
  });

  it('renders a large gap as a warning a reader cannot miss', () => {
    const block = renderAutoBlock({
      head: COMMITS[0],
      ledger: COMMITS,
      rows: ROWS,
      totalCommits: 5,
      sidecarPath: 's.json',
      gates: [
        { id: 'e', gate: 'check-epsilon-policy', evidenceSha: 'c'.repeat(40), evidenceDate: '2026-07-01T00:00:00Z', commitsSince: 40 },
        { id: 'f', gate: 'check-fresh', evidenceSha: 'd'.repeat(40), evidenceDate: '2026-08-15T00:00:00Z', commitsSince: 0 },
      ],
    });
    expect(block).toContain('⚠ **40 commits old** — re-run before quoting');
    expect(block).toContain('current — measured at HEAD');
  });

  it('reports NOT DETERMINED (not 0) when no evidence artefact resolves', () => {
    const gates = computeStaleness(
      {
        version: 1,
        rows: [],
        gates: [{ id: 'bar-3', gate: 'check-relationship-determination', evidence: ['tools/ga-gate/does-not-exist.json'] }],
      },
      fakeGit(),
      process.cwd(),
    );
    expect(gates[0].commitsSince).toBeNull();
    expect(gates[0].undeterminedReason).toContain('no evidence artefact resolved');

    const block = renderAutoBlock({
      head: COMMITS[0], ledger: COMMITS, rows: ROWS, gates, totalCommits: 5, sidecarPath: 's.json',
    });
    expect(block).toContain('**NOT DETERMINED**');
    // The critical negative assertion: an unmeasured gate must never render as
    // "0 commits since", which a reader would take as freshly measured.
    expect(block).not.toMatch(/check-relationship-determination.*\| 0 \|/);
  });
});

/* ------------------------------------- 2. marker isolation + 1. idempotency */

describe('marker-block isolation', () => {
  it('leaves every byte outside the markers untouched', () => {
    const original = fixtureText();
    const block = renderAutoBlock({
      head: COMMITS[0], ledger: COMMITS, rows: ROWS, gates: [], totalCommits: 9, sidecarPath: 's.json',
    });
    const res = spliceAutoBlock(original, block);
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const before = (t: string) => t.slice(0, t.indexOf(BEGIN_MARKER));
    const after = (t: string) => t.slice(t.indexOf(END_MARKER) + END_MARKER.length);
    expect(before(res.text)).toBe(before(original));
    expect(after(res.text)).toBe(after(original));

    // Spot-check the prose that a naive line/regex splicer would have eaten.
    expect(res.text).toContain('literal pipe \\| and an unmatched `<!-- comment-looking thing');
    expect(res.text).toContain('## Human prose AFTER the block');
    expect(res.text).toContain('| `epsilon-policy` | CLOSED | `check-epsilon-policy` |');
  });

  it('is idempotent — splicing the same block twice is a fixed point', () => {
    const block = renderAutoBlock({
      head: COMMITS[0], ledger: COMMITS, rows: ROWS, gates: [], totalCommits: 9, sidecarPath: 's.json',
    });
    const once = spliceAutoBlock(fixtureText(), block);
    expect(once.ok).toBe(true);
    if (!once.ok) return;
    const twice = spliceAutoBlock(once.text, block);
    expect(twice.ok).toBe(true);
    if (!twice.ok) return;
    expect(twice.text).toBe(once.text);
    expect(twice.changed).toBe(false);
  });

  it('renders no wall-clock timestamp, so two runs on one SHA are byte-identical', () => {
    const args = { head: COMMITS[0], ledger: COMMITS, rows: ROWS, gates: [], totalCommits: 9, sidecarPath: 's.json' };
    expect(renderAutoBlock(args)).toBe(renderAutoBlock(args));
  });
});

/* --------------------------------------------- 5. loud degradation */

describe('degrades loudly rather than mangling the file', () => {
  const block = 'BLOCK';

  it('refuses when both markers are absent', () => {
    const res = spliceAutoBlock('# just prose\n\nno markers here\n', block);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.reason).toContain('neither');
  });

  it('refuses when a marker is duplicated', () => {
    const doc = `${BEGIN_MARKER}\na\n${END_MARKER}\n${BEGIN_MARKER}\nb\n${END_MARKER}\n`;
    const res = spliceAutoBlock(doc, block);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.reason).toContain('found 2 BEGIN and 2 END');
  });

  it('refuses when the END marker is missing (truncated block)', () => {
    const res = spliceAutoBlock(`prose\n${BEGIN_MARKER}\ncontent\n`, block);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.reason).toContain('1 BEGIN and 0 END');
  });

  it('refuses when the markers are inverted', () => {
    const res = spliceAutoBlock(`${END_MARKER}\nmiddle\n${BEGIN_MARKER}\n`, block);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.reason).toContain('inverted');
  });

  it('writes NOTHING to disk on a corrupted tracker, and says so', () => {
    const { opts, files, written } = baseRun();
    files.set(resolve('/repo', 'tracker.md'), '# prose with no markers at all\n');
    const before = files.get(resolve('/repo', 'tracker.md'));
    const res = runUpdate(opts);
    expect(res.status).toBe('error');
    expect(written).toEqual([]);
    expect(files.get(resolve('/repo', 'tracker.md'))).toBe(before);
    expect(res.messages.join('\n')).toContain('REFUSING TO WRITE');
    expect(res.messages.join('\n')).toContain('left byte-for-byte unchanged');
  });

  it('errors (never throws) on an unreadable sidecar', () => {
    const { opts } = baseRun({ sidecarPath: 'nope.json' });
    const res = runUpdate(opts);
    expect(res.status).toBe('error');
    expect(res.messages.join('')).toContain('could not read');
  });

  it('errors (never throws) when git yields nothing', () => {
    const { opts, written } = baseRun({ git: fakeGit({ log: () => [] }) });
    const res = runUpdate(opts);
    expect(res.status).toBe('error');
    expect(written).toEqual([]);
  });

  it('rejects a malformed sidecar with a specific reason', () => {
    expect(validateSidecar({ rows: [], gates: [] }).ok).toBe(true);
    const dup = validateSidecar({ rows: [{ id: 'a', globs: [] }, { id: 'a', globs: [] }], gates: [] });
    expect(dup.ok).toBe(false);
    if (dup.ok) return;
    expect(dup.reason).toContain('duplicate row id');
  });
});

/* ------------------------------------------------ end-to-end run + --check */

describe('runUpdate end to end', () => {
  it('writes once, then reports unchanged on the second run (idempotent)', () => {
    const { opts, written } = baseRun();
    const first = runUpdate(opts);
    expect(first.status).toBe('updated');
    expect(written.length).toBe(1);

    const second = runUpdate(opts);
    expect(second.status).toBe('unchanged');
    expect(written.length).toBe(1); // no second write
    expect(second.messages.join('')).toContain('up to date');
  });

  it('--check reports stale when the block lags HEAD, and passes once refreshed', () => {
    const { opts } = baseRun();
    const stale = runUpdate({ ...opts, check: true });
    expect(stale.status).toBe('stale');
    expect(stale.messages.join('\n')).toContain('AUTO-BLOCK IS STALE');

    runUpdate(opts); // refresh
    expect(runUpdate({ ...opts, check: true }).status).toBe('unchanged');
  });

  it('--check never writes, even when stale', () => {
    const { opts, written } = baseRun();
    runUpdate({ ...opts, check: true });
    expect(written).toEqual([]);
  });

  it('records the HEAD sha and escapes a pipe in a commit subject', () => {
    const { opts, files } = baseRun();
    runUpdate(opts);
    const out = files.get(resolve('/repo', 'tracker.md'))!;
    expect(out).toContain('aaaaaaaa');
    // The `|` in the subject must be escaped or the markdown table breaks apart.
    expect(out).toContain('a subject with a \\| pipe');
  });

  it('never claims a row STATUS changed', () => {
    const { opts, files } = baseRun();
    runUpdate(opts);
    const out = files.get(resolve('/repo', 'tracker.md'))!;
    const auto = out.slice(out.indexOf(BEGIN_MARKER), out.indexOf(END_MARKER));
    expect(auto).toContain('NEVER CHANGES A ROW STATUS');

    // Assert against the RENDERED CONTENT, not the disclaimer: the leading HTML
    // comment necessarily names OPEN / CLOSED / UNPROVEN in order to promise it
    // will not set them. Stripping it is the difference between testing the
    // behaviour and testing the wording of the warning about the behaviour.
    const content = auto.replace(/<!--[\s\S]*?-->/g, '');
    expect(content).not.toMatch(/\bCLOSED\b/);
    expect(content).not.toMatch(/\bUNPROVEN\b/);
    expect(content).not.toMatch(/\d+\s*%\s*COMPLETE/);
    // Nor may it emit an "N of 82" style completion count.
    expect(content).not.toMatch(/\d+\s+of\s+\d+\s+.*rows/i);
    // ...while the human's own status table outside the block is untouched.
    expect(out).toContain('| `epsilon-policy` | CLOSED | `check-epsilon-policy` |');
  });
});
