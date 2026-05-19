// S70 D8 — Self-host migration command tests per SPEC-27 §7 + ADR-0052 §B.4.
// 8 cases lock the dispatcher + per-command guards.

import { describe, it, expect, vi } from 'vitest';
import { Writable } from 'node:stream';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInstall } from '../src/commands/install.js';
import { runUpgrade } from '../src/commands/upgrade.js';
import { runRollback } from '../src/commands/rollback.js';
import { parseToFlag, parseVersion, isOneMinorBack } from '../src/commands/index.js';

// Resolve the repo-root install.sh independently of `process.cwd()` —
// vitest runs this suite from `apps/cli/`, so a cwd-relative path
// would point to a non-existent `apps/cli/pryzm-selfhost/install.sh`.
const REPO_ROOT = resolve(fileURLToPath(import.meta.url), '..', '..', '..', '..');
const REAL_SELFHOST_DIR = resolve(REPO_ROOT, 'pryzm-selfhost');
const REAL_INSTALL_SH = resolve(REAL_SELFHOST_DIR, 'install.sh');

class CaptureStream extends Writable {
  buf = '';
  override _write(chunk: Buffer | string, _enc: string, cb: () => void): void {
    this.buf += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
    cb();
  }
}

const v200 = JSON.stringify({ pryzm: '2.0.0' });

describe('cli — shared helpers', () => {
  it('parses --to=X.Y.Z and rejects malformed versions', () => {
    expect(parseToFlag(['--to=2.1.0'])).toBe('2.1.0');
    expect(parseToFlag(['something', '--to=2.0.0', 'else'])).toBe('2.0.0');
    expect(parseToFlag(['--to='])).toBeNull();
    expect(parseToFlag([])).toBeNull();
    expect(parseVersion('2.0.0')).toEqual({ major: 2, minor: 0, patch: 0 });
    expect(parseVersion('2.0.0-rc1')).toBeNull();
    expect(parseVersion('not-a-version')).toBeNull();
    expect(isOneMinorBack({ major: 2, minor: 1, patch: 0 }, { major: 2, minor: 0, patch: 0 })).toBe(true);
    expect(isOneMinorBack({ major: 2, minor: 1, patch: 0 }, { major: 1, minor: 9, patch: 0 })).toBe(false);
    expect(isOneMinorBack({ major: 2, minor: 3, patch: 0 }, { major: 2, minor: 0, patch: 0 })).toBe(false);
  });
});

describe('cli — install', () => {
  it('returns 1 when install.sh is missing', () => {
    const stderr = new CaptureStream();
    const code = runInstall([], {
      selfHostDir: '/nonexistent-dir',
      scriptPath: '/nonexistent-dir/install.sh',
      stderr,
    });
    expect(code).toBe(1);
    expect(stderr.buf).toMatch(/not found/);
  });

  it('invokes install.sh and surfaces exit code 0', () => {
    const stderr = new CaptureStream();
    const spawner = vi.fn(() => ({ status: 0 }));
    const code = runInstall([], {
      selfHostDir: REAL_SELFHOST_DIR,
      scriptPath: REAL_INSTALL_SH,
      spawn: spawner,
      stderr,
    });
    expect(code).toBe(0);
    expect(spawner).toHaveBeenCalledTimes(1);
  });

  it('translates a signal-terminated install.sh to exit code 2', () => {
    const stderr = new CaptureStream();
    const code = runInstall([], {
      selfHostDir: REAL_SELFHOST_DIR,
      scriptPath: REAL_INSTALL_SH,
      spawn: () => ({ status: null }),
      stderr,
    });
    expect(code).toBe(2);
    expect(stderr.buf).toMatch(/signal/);
  });
});

describe('cli — upgrade', () => {
  it('rejects missing --to', async () => {
    const stderr = new CaptureStream();
    const code = await runUpgrade([], { stderr, readVersionJson: async () => v200 });
    expect(code).toBe(1);
    expect(stderr.buf).toMatch(/--to=/);
  });

  it('rejects downgrades (must use rollback)', async () => {
    const stderr = new CaptureStream();
    const code = await runUpgrade(['--to=1.9.0'], {
      stderr,
      readVersionJson: async () => v200,
    });
    expect(code).toBe(1);
    expect(stderr.buf).toMatch(/rollback/);
  });

  it('rejects multi-minor jumps', async () => {
    const stderr = new CaptureStream();
    const code = await runUpgrade(['--to=2.5.0'], {
      stderr,
      readVersionJson: async () => v200,
    });
    expect(code).toBe(1);
    expect(stderr.buf).toMatch(/one-minor-up/);
  });

  it('accepts one-minor-up plan as dry-run success', async () => {
    const stdout = new CaptureStream();
    const code = await runUpgrade(['--to=2.1.0'], {
      stdout,
      readVersionJson: async () => v200,
    });
    expect(code).toBe(0);
    expect(stdout.buf).toMatch(/2\.0\.0 → 2\.1\.0/);
    expect(stdout.buf).toMatch(/dry-run complete/);
  });
});

describe('cli — rollback', () => {
  it('rejects same-or-higher targets (must use upgrade)', async () => {
    const stderr = new CaptureStream();
    const code = await runRollback(['--to=2.0.0'], {
      stderr,
      readVersionJson: async () => v200,
    });
    expect(code).toBe(1);
    expect(stderr.buf).toMatch(/upgrade/);
  });

  it('refuses anything farther than one minor back (same-major)', async () => {
    const stderr = new CaptureStream();
    // Pretend current is 2.5.0 → rollback to 2.0.0 is 5 minors back: refuse.
    const code = await runRollback(['--to=2.0.0'], {
      stderr,
      readVersionJson: async () => JSON.stringify({ pryzm: '2.5.0' }),
    });
    expect(code).toBe(1);
    expect(stderr.buf).toMatch(/one-minor-back/);
  });

  it('major-version rollback refused with backup-restore guidance', async () => {
    const stderr = new CaptureStream();
    const code = await runRollback(['--to=1.9.0'], {
      stderr,
      readVersionJson: async () => v200,
    });
    expect(code).toBe(1);
    expect(stderr.buf).toMatch(/major-version rollback/);
    expect(stderr.buf).toMatch(/backup/);
  });

  it('accepts one-minor-back as dry-run success', async () => {
    const stdout = new CaptureStream();
    // Pretend current is 2.1.0 → rollback to 2.0.0.
    const code = await runRollback(['--to=2.0.0'], {
      stdout,
      readVersionJson: async () => JSON.stringify({ pryzm: '2.1.0' }),
    });
    expect(code).toBe(0);
    expect(stdout.buf).toMatch(/2\.1\.0 → 2\.0\.0/);
  });
});
