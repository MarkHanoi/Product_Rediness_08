// @pryzm/cli — self-host migration command barrel (S70 D8).
//
// Spec: SPEC-27 §7 (operator-side migration tooling) + ADR-0052 §B.4
// (commands live in @pryzm/cli rather than a new package).
//
// All three commands are PURE in the sense that they never crash — on
// any error they write to stderr and return a non-zero exit code (1
// for user error, 2 for internal).  This keeps the dispatcher in
// `apps/cli/src/index.ts` trivial.

export { runInstall } from './install.js';
export { runUpgrade } from './upgrade.js';
export { runRollback } from './rollback.js';

// ─── Shared helpers ──────────────────────────────────────────────────────────

/** Parse a `--to=<value>` flag from argv.  Returns null if absent or
 *  malformed.  The caller decides how to treat null. */
export function parseToFlag(argv: readonly string[]): string | null {
  for (const arg of argv) {
    if (arg.startsWith('--to=')) {
      const v = arg.slice('--to='.length).trim();
      return v === '' ? null : v;
    }
  }
  return null;
}

/** Parse a SemVer-ish "X.Y.Z" string into `{ major, minor, patch }`.
 *  Returns null on any parse error.  Pre-release / build metadata
 *  intentionally rejected — operators must give us a clean release
 *  tag (the migration scripts can't reason about pre-releases). */
export interface ParsedVersion {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
}
export function parseVersion(s: string): ParsedVersion | null {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(s);
  if (!m) return null;
  const [_, major, minor, patch] = m;
  return {
    major: Number(major),
    minor: Number(minor),
    patch: Number(patch),
  };
}

/** Returns true iff `to` is exactly one minor version below `from`
 *  (same major, minor differs by 1, patch ignored).  Used by
 *  `rollback` per SPEC-27 §7.3 ("best-effort one-minor-back guard"). */
export function isOneMinorBack(from: ParsedVersion, to: ParsedVersion): boolean {
  return from.major === to.major && from.minor - to.minor === 1;
}
