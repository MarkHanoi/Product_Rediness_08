// @pryzm/cli — `pryzm rollback --to=<version>` (S70 D8 — SPEC-27 §7).
//
// Best-effort one-minor-back guard per SPEC-27 §7.3.  Larger jumps
// are refused with explicit instructions to restore from backup.

import { promises as fs } from 'node:fs';
import { resolve } from 'node:path';
import { parseToFlag, parseVersion, isOneMinorBack } from './index.js';

export interface RollbackOptions {
  readonly selfHostDir?: string;
  readonly stderr?: NodeJS.WritableStream;
  readonly stdout?: NodeJS.WritableStream;
  readonly readVersionJson?: (path: string) => Promise<string>;
}

export async function runRollback(argv: readonly string[], opts: RollbackOptions = {}): Promise<number> {
  const stderr = opts.stderr ?? process.stderr;
  const stdout = opts.stdout ?? process.stdout;

  if (argv.includes('-h') || argv.includes('--help')) {
    stdout.write('Usage: pryzm-cli rollback --to=<version>\n');
    stdout.write('       Refuses anything farther back than one minor.\n');
    return 0;
  }

  const target = parseToFlag(argv);
  if (target === null) {
    stderr.write('rollback: --to=<version> required.\n');
    return 1;
  }
  const targetParsed = parseVersion(target);
  if (targetParsed === null) {
    stderr.write(`rollback: invalid version "${target}" — expected X.Y.Z.\n`);
    return 1;
  }

  const selfHostDir = opts.selfHostDir ?? resolve(process.cwd(), 'pryzm-selfhost');
  const versionJsonPath = resolve(selfHostDir, 'version.json');
  let manifest: { pryzm?: string };
  try {
    const text = opts.readVersionJson
      ? await opts.readVersionJson(versionJsonPath)
      : await fs.readFile(versionJsonPath, 'utf8');
    manifest = JSON.parse(text) as { pryzm?: string };
  } catch (err) {
    stderr.write(`rollback: cannot read ${versionJsonPath}: ${(err as Error).message}\n`);
    return 1;
  }

  const current = manifest.pryzm ? parseVersion(manifest.pryzm) : null;
  if (!current) {
    stderr.write(`rollback: ${versionJsonPath} missing or malformed .pryzm field.\n`);
    return 1;
  }

  // Refuse same-or-higher (use upgrade).
  const compareNum = (a: number, b: number): number => (a < b ? -1 : a > b ? 1 : 0);
  const cmp = compareNum(targetParsed.major, current.major)
    || compareNum(targetParsed.minor, current.minor)
    || compareNum(targetParsed.patch, current.patch);
  if (cmp >= 0) {
    stderr.write(`rollback: target ${target} is not less than current ${manifest.pryzm}; use 'upgrade' for forward moves.\n`);
    return 1;
  }
  // Major-version backwards always requires backup-restore.
  if (targetParsed.major !== current.major) {
    stderr.write(`rollback: major-version rollback (${current.major} → ${targetParsed.major}) not supported via 'rollback'.\n`);
    stderr.write(`rollback: restore from backup taken before the major upgrade.\n`);
    return 1;
  }
  // SPEC-27 §7.3: best-effort one-minor-back guard.
  if (!isOneMinorBack(current, targetParsed)) {
    stderr.write(`rollback: only one-minor-back is supported (${manifest.pryzm} → ${current.major}.${current.minor - 1}.x); cannot reach ${target}.\n`);
    stderr.write(`rollback: restore from a backup taken at ${target} or earlier.\n`);
    return 1;
  }

  stdout.write(`rollback: planning ${manifest.pryzm} → ${target} (one-minor-back) ...\n`);
  stdout.write(`  • Schema rollback: planned (reverse-migration sequence).\n`);
  stdout.write(`  • File-format rollback: best-effort; data added in ${manifest.pryzm} may be dropped.\n`);
  stdout.write(`  • Post-rollback smoke: placeholder.\n`);
  stdout.write(`rollback: dry-run complete; live runner lands when a >1-minor diff exists to test against.\n`);
  return 0;
}
