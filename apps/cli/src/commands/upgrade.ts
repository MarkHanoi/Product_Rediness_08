// @pryzm/cli — `pryzm upgrade --to=<version>` (S70 D8 — SPEC-27 §7).
//
// Best-effort one-minor-up upgrade.  At S70 D8 the migration suite
// (schema migrations + file-format migrations + post-upgrade smoke)
// is a placeholder: we validate the version string + read the current
// `pryzm-selfhost/version.json` + print the migration plan.  Actually
// running each migration is wired in later sprints as new schemas /
// file-formats land — this command exists today so the operator
// surface is stable from S70 onwards.

import { promises as fs } from 'node:fs';
import { resolve } from 'node:path';
import { parseToFlag, parseVersion } from './index.js';

export interface UpgradeOptions {
  readonly selfHostDir?: string;
  readonly stderr?: NodeJS.WritableStream;
  readonly stdout?: NodeJS.WritableStream;
  /** Inject a fake fs.readFile for tests.  Returns the JSON text of
   *  `version.json`. */
  readonly readVersionJson?: (path: string) => Promise<string>;
}

export async function runUpgrade(argv: readonly string[], opts: UpgradeOptions = {}): Promise<number> {
  const stderr = opts.stderr ?? process.stderr;
  const stdout = opts.stdout ?? process.stdout;

  if (argv.includes('-h') || argv.includes('--help')) {
    stdout.write('Usage: pryzm-cli upgrade --to=<version>\n');
    stdout.write('       <version> is X.Y.Z (e.g. 2.1.0).\n');
    return 0;
  }

  const target = parseToFlag(argv);
  if (target === null) {
    stderr.write('upgrade: --to=<version> required.\n');
    return 1;
  }
  const targetParsed = parseVersion(target);
  if (targetParsed === null) {
    stderr.write(`upgrade: invalid version "${target}" — expected X.Y.Z.\n`);
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
    stderr.write(`upgrade: cannot read ${versionJsonPath}: ${(err as Error).message}\n`);
    return 1;
  }

  const current = manifest.pryzm ? parseVersion(manifest.pryzm) : null;
  if (!current) {
    stderr.write(`upgrade: ${versionJsonPath} missing or malformed .pryzm field.\n`);
    return 1;
  }

  // Reject downgrades.
  const compareNum = (a: number, b: number): number => (a < b ? -1 : a > b ? 1 : 0);
  const cmp = compareNum(targetParsed.major, current.major)
    || compareNum(targetParsed.minor, current.minor)
    || compareNum(targetParsed.patch, current.patch);
  if (cmp <= 0) {
    stderr.write(`upgrade: target ${target} is not greater than current ${manifest.pryzm}; use 'rollback' for downgrades.\n`);
    return 1;
  }
  // Major-version jumps require manual operator intervention.
  if (targetParsed.major !== current.major) {
    stderr.write(`upgrade: major-version jump (${current.major} → ${targetParsed.major}) not supported via 'upgrade'; perform a fresh install per RELEASE-NOTES-${target}.md.\n`);
    return 1;
  }
  // Best-effort one-minor-up per SPEC-27 §7.3.
  if (targetParsed.minor - current.minor > 1) {
    stderr.write(`upgrade: only one-minor-up is supported (${manifest.pryzm} → ${current.major}.${current.minor + 1}.x); upgrade in steps.\n`);
    return 1;
  }

  stdout.write(`upgrade: planning ${manifest.pryzm} → ${target} ...\n`);
  stdout.write(`  • Schema migrations: planned (will run init-db/*.sql in order).\n`);
  stdout.write(`  • File-format migrations: planned (no .pryzm v1 → v2 path at this time).\n`);
  stdout.write(`  • Post-upgrade smoke: placeholder (next sprint wires the bench harness).\n`);
  stdout.write(`upgrade: dry-run complete; live migration runner lands when the next minor schema diff exists.\n`);
  return 0;
}
