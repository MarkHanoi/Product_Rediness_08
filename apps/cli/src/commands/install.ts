// @pryzm/cli — `pryzm install` (S70 D8 — SPEC-27 §7).
//
// Thin wrapper over `pryzm-selfhost/install.sh` (landed at S67 D1).
// The script is idempotent on its own, so this command does no extra
// state-tracking — it just locates the script and invokes it,
// surfacing the exit code.
//
// We deliberately do NOT shell into bash from a JS string template
// (that's a security smell); we use spawn() with no shell.

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

export interface InstallOptions {
  /** Override the pryzm-selfhost directory.  Defaults to
   *  `<repo-root>/pryzm-selfhost` (resolved from `process.cwd()`). */
  readonly selfHostDir?: string;
  /** Override the install.sh path inside selfHostDir.  Defaults to
   *  `<selfHostDir>/install.sh`. */
  readonly scriptPath?: string;
  /** Inject a fake spawn for tests.  Returns { status }. */
  readonly spawn?: (
    cmd: string,
    args: readonly string[],
    opts: { cwd: string },
  ) => { status: number | null };
  /** Stream sink for friendly errors. */
  readonly stderr?: NodeJS.WritableStream;
}

export function runInstall(argv: readonly string[], opts: InstallOptions = {}): number {
  const stderr = opts.stderr ?? process.stderr;

  if (argv.includes('-h') || argv.includes('--help')) {
    stderr.write('Usage: pryzm-cli install\n');
    stderr.write('       (Wraps pryzm-selfhost/install.sh — idempotent.)\n');
    return 0;
  }

  const selfHostDir = opts.selfHostDir ?? resolve(process.cwd(), 'pryzm-selfhost');
  const scriptPath = opts.scriptPath ?? resolve(selfHostDir, 'install.sh');

  if (!existsSync(scriptPath)) {
    stderr.write(`install: ${scriptPath} not found.\n`);
    stderr.write('install: run from the PRYZM 2 repository root, or pass selfHostDir.\n');
    return 1;
  }

  const spawner = opts.spawn ?? ((cmd: string, args: readonly string[], o: { cwd: string }) => {
    const r = spawnSync(cmd, args as string[], { cwd: o.cwd, stdio: 'inherit' });
    return { status: r.status };
  });

  const result = spawner(scriptPath, [], { cwd: selfHostDir });
  if (result.status === null) {
    stderr.write('install: install.sh terminated by a signal.\n');
    return 2;
  }
  return result.status === 0 ? 0 : (result.status || 1);
}
