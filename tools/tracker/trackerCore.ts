/**
 * tools/tracker/trackerCore.ts — pure logic for the commit-ledger auto-block.
 *
 * WHY THIS FILE IS PURE: everything here is a total function of its arguments.
 * No git, no fs, no clock. The CLI (`update-tracker.ts`) does the I/O and hands
 * the results in. That is what lets the tests assert idempotency and
 * marker-isolation as *value* equality rather than by shelling out.
 *
 * DOCTRINE THIS FILE ENCODES (CLAUDE.md + §CONTEXT-DATA-HONESTY):
 *
 *  1. **Never hand-increment a count.** Nothing here writes, computes, or
 *     adjusts a row STATUS. A row's status is owned by an executed gate run.
 *     This module reports *commit activity* and *staleness*, which are facts
 *     about git, not judgements about completion.
 *  2. **Failure and emptiness are the same value unless you separate them.**
 *     Every field that can be undeterminable renders the literal string
 *     `NOT DETERMINED` plus the reason. It never renders `0`, `—`, or a blank,
 *     because a reader cannot distinguish "measured zero" from "never looked".
 *  3. **Derive, do not accumulate.** The block is regenerated in full from the
 *     git log every run. There is no ledger state file to drift out of sync,
 *     and re-running on the same HEAD is a no-op by construction rather than
 *     by a guard we have to remember to keep correct.
 */

export const BEGIN_MARKER = '<!-- TRACKER:AUTO:BEGIN -->';
export const END_MARKER = '<!-- TRACKER:AUTO:END -->';

/** A row of the tracker, and the path globs that own it. */
export interface RowMapping {
  id: string;
  title: string;
  globs: string[];
  note?: string;
}

/** A gate whose last measurement we disclose the age of (never re-run). */
export interface GateMapping {
  id: string;
  gate: string;
  /**
   * Paths whose last modification stands as the gate's last recorded
   * measurement — typically the baseline/ledger JSON the gate writes.
   * If none of them resolve, staleness renders NOT DETERMINED.
   */
  evidence: string[];
  note?: string;
}

export interface Sidecar {
  version: number;
  rows: RowMapping[];
  gates: GateMapping[];
}

/** One commit, as read from `git log`. */
export interface CommitRecord {
  sha: string;
  isoDate: string;
  subject: string;
  paths: string[];
}

/** Staleness for one gate. `commitsSince === null` means NOT DETERMINED. */
export interface GateStaleness {
  id: string;
  gate: string;
  evidenceSha: string | null;
  evidenceDate: string | null;
  commitsSince: number | null;
  /** Populated only when something could not be determined. */
  undeterminedReason?: string;
}

export interface RenderInput {
  head: CommitRecord;
  /** Most-recent-first. Includes `head` as element 0. */
  ledger: CommitRecord[];
  rows: RowMapping[];
  gates: GateStaleness[];
  /** Total commits in the repo history, or null if it could not be counted. */
  totalCommits: number | null;
  sidecarPath: string;
}

const MAX_UNMAPPED_BUCKETS = 25;

/* ------------------------------------------------------------------ globs */

/**
 * Translate a restricted glob to a RegExp. Deliberately small — no new deps,
 * and no support for brace/extglob syntax we would then have to keep correct.
 *
 *   `**`  → any characters, including `/`
 *   `*`   → any characters except `/`
 *   `?`   → exactly one character except `/`
 *   `a/**`→ also matches the bare directory `a`
 *
 * Everything else is matched literally.
 */
export function globToRegExp(glob: string): RegExp {
  let out = '';
  for (let i = 0; i < glob.length; i++) {
    const ch = glob[i];
    if (ch === '*') {
      if (glob[i + 1] === '*') {
        // `/**` at the tail should also match the directory itself.
        if (out.endsWith('/') && i + 2 === glob.length) {
          out = `${out.slice(0, -1)}(?:/.*)?`;
        } else {
          out += '.*';
        }
        i++;
      } else {
        out += '[^/]*';
      }
    } else if (ch === '?') {
      out += '[^/]';
    } else if ('\\^$.|+()[]{}'.includes(ch)) {
      out += `\\${ch}`;
    } else {
      out += ch;
    }
  }
  return new RegExp(`^${out}$`);
}

export function pathMatchesRow(path: string, row: RowMapping): boolean {
  return row.globs.some((g) => globToRegExp(g).test(path));
}

export interface MapResult {
  /** Row id → the changed paths that landed in it. */
  byRow: Map<string, string[]>;
  /** Paths that matched no row at all. */
  unmapped: string[];
}

/**
 * Map changed paths onto rows. A path may map to several rows (overlapping
 * ownership is legitimate and is reported to every owner). A path that maps to
 * NO row is surfaced under `unmapped` — never dropped. Dropping it would make a
 * mapping gap indistinguishable from an absence of work, which is precisely the
 * failure §CONTEXT-DATA-HONESTY exists to prevent.
 */
export function mapPathsToRows(paths: string[], rows: RowMapping[]): MapResult {
  const byRow = new Map<string, string[]>();
  const unmapped: string[] = [];
  for (const path of paths) {
    let matched = false;
    for (const row of rows) {
      if (pathMatchesRow(path, row)) {
        matched = true;
        const list = byRow.get(row.id) ?? [];
        list.push(path);
        byRow.set(row.id, list);
      }
    }
    if (!matched) unmapped.push(path);
  }
  return { byRow, unmapped };
}

/* ---------------------------------------------------------------- render */

function shortSha(sha: string): string {
  return sha.slice(0, 8);
}

/** Escape the pipe so a commit subject cannot break out of a markdown table. */
function cell(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim();
}

function bucketOf(path: string): string {
  const parts = path.split('/');
  return parts.length <= 2 ? path : `${parts[0]}/${parts[1]}/…`;
}

/**
 * Render the machine-owned block. Deterministic: a pure function of
 * `RenderInput`, with NO wall-clock timestamp anywhere. A generation timestamp
 * would make every run differ from the last, which would defeat both the
 * idempotency guarantee and `--check`. The HEAD commit's own date is the
 * honest stamp — it is when the recorded state actually happened.
 */
export function renderAutoBlock(input: RenderInput): string {
  const { head, ledger, rows, gates, totalCommits, sidecarPath } = input;
  const L: string[] = [];

  L.push(BEGIN_MARKER);
  L.push('');
  L.push('<!--');
  L.push('  MACHINE-OWNED BLOCK — regenerated in full by tools/tracker/update-tracker.ts');
  L.push('  on every commit (post-commit hook). Do not hand-edit: your edits are');
  L.push('  overwritten on the next commit. Prose OUTSIDE these two markers is never');
  L.push('  touched by the tool.');
  L.push('');
  L.push('  THIS BLOCK NEVER CHANGES A ROW STATUS. It records which commits landed and');
  L.push('  which rows own the paths they touched. Only an executed gate run may move a');
  L.push('  row between OPEN / CLOSED / UNPROVEN.');
  L.push('-->');
  L.push('');
  L.push('### 🤖 Commit ledger — auto-maintained, advisory only');
  L.push('');
  L.push('| | |');
  L.push('|---|---|');
  L.push(`| HEAD | \`${shortSha(head.sha)}\` — ${cell(head.subject)} |`);
  L.push(`| HEAD date | ${head.isoDate} |`);
  L.push(
    `| Repo commits | ${totalCommits === null ? '**NOT DETERMINED** — `git rev-list --count HEAD` failed' : String(totalCommits)} |`,
  );
  L.push(`| Ledger window | ${ledger.length} most recent commits |`);
  L.push(`| Mapping source | \`${sidecarPath}\` — ${rows.length} row(s) mapped |`);
  L.push('');

  /* --- the honest disclosure of how much of the tracker is actually mapped --- */
  if (rows.length === 0) {
    L.push(
      '> ⚠ **NOT DETERMINED — no rows are mapped.** `row-paths.json` declares zero rows, so' +
        ' every changed path below is unmapped by construction. This is a configuration gap,' +
        ' NOT a statement that no tracker row was affected.',
    );
    L.push('');
  }

  /* ------------------------------------------------------ per-commit ledger */
  L.push('#### Commits (most recent first)');
  L.push('');
  if (ledger.length === 0) {
    L.push('**NOT DETERMINED** — the git log could not be read. No inference should be drawn.');
    L.push('');
  } else {
    L.push('| SHA | Date | Rows touched | Files | Subject |');
    L.push('|---|---|---|---|---|');
    for (const c of ledger) {
      const { byRow } = mapPathsToRows(c.paths, rows);
      const rowIds = [...byRow.keys()].sort();
      const rowCell =
        c.paths.length === 0
          ? '*no path data*'
          : rowIds.length > 0
            ? rowIds.map((r) => `\`${r}\``).join(', ')
            : '*none mapped*';
      L.push(
        `| \`${shortSha(c.sha)}\` | ${c.isoDate.slice(0, 10)} | ${rowCell} | ${c.paths.length} | ${cell(c.subject)} |`,
      );
    }
    L.push('');
  }

  /* ------------------------------------------------------------- unmapped */
  const allUnmapped = new Set<string>();
  for (const c of ledger) {
    for (const p of mapPathsToRows(c.paths, rows).unmapped) allUnmapped.add(p);
  }
  L.push('#### ❓ UNMAPPED paths in this window');
  L.push('');
  if (allUnmapped.size === 0) {
    L.push(
      ledger.length === 0
        ? '**NOT DETERMINED** — no commits were read, so no path could be classified.'
        : 'None — every changed path in the window matched at least one mapped row.',
    );
  } else {
    const buckets = new Map<string, number>();
    for (const p of allUnmapped) buckets.set(bucketOf(p), (buckets.get(bucketOf(p)) ?? 0) + 1);
    const sorted = [...buckets.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const shown = sorted.slice(0, MAX_UNMAPPED_BUCKETS);
    L.push(
      `**${allUnmapped.size} distinct changed path(s) matched no row.** That is a *mapping gap*,` +
        ' not an absence of work — the commits happened; `row-paths.json` just does not yet say' +
        ' which row owns them. Add the mapping rather than reading this as "nothing to report".',
    );
    L.push('');
    L.push('| Area | Unmapped paths |');
    L.push('|---|---|');
    for (const [b, n] of shown) L.push(`| \`${b}\` | ${n} |`);
    if (sorted.length > shown.length) {
      L.push(`| *…and ${sorted.length - shown.length} further area(s)* | — |`);
    }
  }
  L.push('');

  /* ------------------------------------------------------------ staleness */
  L.push('#### 🕰 Gate reading staleness — how old is each recorded measurement?');
  L.push('');
  L.push(
    '> The hook **never runs a gate** (far too slow for post-commit). It reports how many' +
      " commits have landed since each gate's evidence artefact last changed, so a stale" +
      ' reading announces itself instead of being quoted as current.',
  );
  L.push('');
  if (gates.length === 0) {
    L.push('**NOT DETERMINED** — `row-paths.json` declares no gates to age.');
  } else {
    L.push('| Gate | Last recorded measurement | Date | Commits since | Reading age |');
    L.push('|---|---|---|---|---|');
    for (const g of gates) {
      if (g.commitsSince === null || g.evidenceSha === null) {
        const why = g.undeterminedReason ?? 'no evidence path resolved';
        L.push(
          `| \`${g.gate}\` | **NOT DETERMINED** | **NOT DETERMINED** | **NOT DETERMINED** | ${cell(why)} |`,
        );
      } else {
        const age =
          g.commitsSince === 0
            ? 'current — measured at HEAD'
            : g.commitsSince < 10
              ? `${g.commitsSince} commit(s) old`
              : `⚠ **${g.commitsSince} commits old** — re-run before quoting`;
        L.push(
          `| \`${g.gate}\` | \`${shortSha(g.evidenceSha)}\` | ${(g.evidenceDate ?? '').slice(0, 10)} | ${g.commitsSince} | ${age} |`,
        );
      }
    }
  }
  L.push('');
  L.push(END_MARKER);
  return L.join('\n');
}

/* ---------------------------------------------------------------- splice */

export type SpliceResult =
  | { ok: true; text: string; changed: boolean }
  | { ok: false; reason: string };

/**
 * Replace the content between the markers, byte-preserving everything else.
 *
 * DEGRADES LOUDLY. Every malformed case returns `ok:false` with a reason and
 * the caller writes NOTHING. A hook that "does its best" with a damaged file is
 * how you get a mangled tracker, and this file is the founder's single source of
 * completion truth — a wrong write is far worse than no write.
 */
export function spliceAutoBlock(markdown: string, block: string): SpliceResult {
  const begins = countOccurrences(markdown, BEGIN_MARKER);
  const ends = countOccurrences(markdown, END_MARKER);

  if (begins === 0 && ends === 0) {
    return {
      ok: false,
      reason:
        `neither ${BEGIN_MARKER} nor ${END_MARKER} is present. Add both markers to the ` +
        'tracker (on their own lines, in that order) to opt the file in. Refusing to guess ' +
        'where the block belongs.',
    };
  }
  if (begins !== 1 || ends !== 1) {
    return {
      ok: false,
      reason:
        `expected exactly one BEGIN and one END marker, found ${begins} BEGIN and ${ends} END. ` +
        'Refusing to write into an ambiguous or truncated block.',
    };
  }

  const start = markdown.indexOf(BEGIN_MARKER);
  const end = markdown.indexOf(END_MARKER);
  if (end < start) {
    return {
      ok: false,
      reason: 'END marker appears before BEGIN marker. Refusing to write into an inverted block.',
    };
  }

  const before = markdown.slice(0, start);
  const after = markdown.slice(end + END_MARKER.length);
  const text = `${before}${block}${after}`;
  return { ok: true, text, changed: text !== markdown };
}

function countOccurrences(haystack: string, needle: string): number {
  let n = 0;
  let i = haystack.indexOf(needle);
  while (i !== -1) {
    n++;
    i = haystack.indexOf(needle, i + needle.length);
  }
  return n;
}

/** Validate the sidecar shape, returning human-readable problems. */
export function validateSidecar(value: unknown): { ok: true; sidecar: Sidecar } | { ok: false; reason: string } {
  if (typeof value !== 'object' || value === null) return { ok: false, reason: 'sidecar is not an object' };
  const v = value as Record<string, unknown>;
  if (!Array.isArray(v.rows)) return { ok: false, reason: 'sidecar.rows is missing or not an array' };
  if (!Array.isArray(v.gates)) return { ok: false, reason: 'sidecar.gates is missing or not an array' };
  const seen = new Set<string>();
  for (const r of v.rows as RowMapping[]) {
    if (!r || typeof r.id !== 'string' || !Array.isArray(r.globs)) {
      return { ok: false, reason: `row entry is malformed (needs {id, title, globs[]}): ${JSON.stringify(r)}` };
    }
    if (seen.has(r.id)) return { ok: false, reason: `duplicate row id "${r.id}"` };
    seen.add(r.id);
  }
  for (const g of v.gates as GateMapping[]) {
    if (!g || typeof g.gate !== 'string' || !Array.isArray(g.evidence)) {
      return { ok: false, reason: `gate entry is malformed (needs {id, gate, evidence[]}): ${JSON.stringify(g)}` };
    }
  }
  return { ok: true, sidecar: { version: Number(v.version ?? 1), rows: v.rows as RowMapping[], gates: v.gates as GateMapping[] } };
}
