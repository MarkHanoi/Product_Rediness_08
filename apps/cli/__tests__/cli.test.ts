// CLI round-trip test.
//
// We exec the CLI via tsx in a child process, exercising the real
// argv → exit-code path the user gets at the shell.  The test
// performs a full unpack → repack cycle on a synthetic project, then
// inspects the result and verifies stdout shape.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { pack } from '@pryzm/file-format';
import {
  attachLatestPerLevel,
  makeChunks,
  makeEvents,
  makeManifest,
} from '../../../packages/file-format/__tests__/fixtures';

const CLI = join(__dirname, '..', 'src', 'index.ts');

interface RunResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

function runCli(args: readonly string[], cwd?: string): Promise<RunResult> {
  return new Promise((resolveP, reject) => {
    const child = spawn('npx', ['tsx', CLI, ...args], {
      cwd,
      env: { ...process.env, NODE_OPTIONS: '' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (b) => (stdout += b.toString()));
    child.stderr.on('data', (b) => (stderr += b.toString()));
    child.on('error', reject);
    child.on('close', (code) => resolveP({ code, stdout, stderr }));
  });
}

describe('pryzm-cli', () => {
  let workDir: string;
  let pryzmFile: string;

  beforeAll(async () => {
    workDir = await fs.mkdtemp(join(tmpdir(), 'pryzm-cli-test-'));
    pryzmFile = join(workDir, 'project.pryzm');

    // Build a small fixture and pack it programmatically (the CLI's
    // pack/unpack path is tested below by round-tripping THIS file).
    const chunkBytes = await makeChunks(2);
    const { manifest: base, chunkEntries } = makeManifest({
      projectId: 'cli_fixture',
      levels: 1,
      chunksPerLevel: 2,
      chunkBytes,
    });
    const manifest = attachLatestPerLevel(base, chunkEntries);
    const events = makeEvents(7);
    const packed = await pack({ manifest, events, chunks: chunkBytes });
    if (!packed.ok) throw new Error('fixture pack failed');
    await fs.writeFile(pryzmFile, packed.bytes);
  }, 30_000);

  afterAll(async () => {
    await fs.rm(workDir, { recursive: true, force: true });
  });

  it('inspect prints manifest summary', async () => {
    const r = await runCli(['inspect', pryzmFile]);
    expect(r.stderr).toBe('');
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('schemaVersion:');
    expect(r.stdout).toContain('projectId:      cli_fixture');
    expect(r.stdout).toContain('events on disk: 7');
  }, 30_000);

  it('unpack writes a directory tree, repack reproduces a valid file', async () => {
    const unpackedDir = join(workDir, 'unpacked');
    const repackedFile = join(workDir, 'repacked.pryzm');

    const u = await runCli(['unpack', pryzmFile, unpackedDir]);
    expect(u.stderr).toBe('');
    expect(u.code).toBe(0);

    // Verify directory contents.
    const manifestText = await fs.readFile(
      join(unpackedDir, 'manifest.json'),
      'utf8',
    );
    const m = JSON.parse(manifestText);
    expect(m.projectId).toBe('cli_fixture');

    const eventLines = (await fs.readFile(join(unpackedDir, 'events.jsonl'), 'utf8'))
      .split('\n')
      .filter((l) => l.length > 0);
    expect(eventLines).toHaveLength(7);
    for (const line of eventLines) {
      expect(() => JSON.parse(line)).not.toThrow();
    }

    const chunkFiles = await fs.readdir(join(unpackedDir, 'chunks'));
    expect(chunkFiles.filter((f) => f.endsWith('.glb'))).toHaveLength(2);

    // Repack and inspect.
    const p = await runCli(['pack', unpackedDir, repackedFile]);
    expect(p.stderr).toBe('');
    expect(p.code).toBe(0);

    const i = await runCli(['inspect', repackedFile]);
    expect(i.code).toBe(0);
    expect(i.stdout).toContain('projectId:      cli_fixture');
    expect(i.stdout).toContain('events on disk: 7');
  }, 60_000);

  it('reports a friendly error on missing args', async () => {
    const r = await runCli(['pack']);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('expected 2 args');
  }, 30_000);

  it('reports a friendly error on a non-pryzm file', async () => {
    const junkFile = join(workDir, 'junk.bin');
    await fs.writeFile(junkFile, Buffer.from([1, 2, 3, 4]));
    const r = await runCli(['inspect', junkFile]);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('not-a-zip');
  }, 30_000);
});
