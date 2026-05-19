#!/usr/bin/env -S npx tsx
// pryzm-cli — command-line tool for the .pryzm v1 file format.
//
// Usage:
//   pryzm-cli pack    <project-dir> <output.pryzm>
//   pryzm-cli unpack  <input.pryzm>  <output-dir>
//   pryzm-cli inspect <input.pryzm>
//
// `unpack` writes a directory tree designed for hand-inspection:
//
//   manifest.json              — pretty-printed (the same bytes the
//                                ZIP would have stored)
//   events.jsonl               — one PersistedEvent per line (decoded
//                                from MessagePack so you can grep)
//   chunks/<sha256>.glb        — content-addressed chunk bytes
//   thumbnails/project.png     — optional thumbnail
//
// `pack` reads the same layout and produces a `.pryzm` ZIP.  This
// mirror lets a developer round-trip a project through the shell
// (`unpack → grep → pack`) without ever touching binary tooling.
//
// Exit codes:
//   0 — success
//   1 — user error (missing args, bad path, malformed file)
//   2 — internal error (please file a bug)

import { promises as fs } from 'node:fs';
import { join, resolve, basename } from 'node:path';

import { pack, unpack } from '@pryzm/file-format';
import type { Manifest, PersistedEvent } from '@pryzm/persistence-client';
// S70 D8 — self-host migration tooling per SPEC-27 §7 + ADR-0052 §B.4.
import { runInstall, runUpgrade, runRollback } from './commands/index.js';

const USAGE = `pryzm-cli — PRYZM 2 command-line tool.

File-format subcommands (.pryzm v1):
  pryzm-cli pack     <project-dir> <output.pryzm>
  pryzm-cli unpack   <input.pryzm>  <output-dir>
  pryzm-cli inspect  <input.pryzm>

Self-host subcommands (S70 D8 — SPEC-27 §7):
  pryzm-cli install                       Run pryzm-selfhost/install.sh idempotently.
  pryzm-cli upgrade  --to=<version>       Schema + file-format migrations to <version>.
  pryzm-cli rollback --to=<version>       Roll back one minor version (best-effort).
`;

async function main(argv: readonly string[]): Promise<number> {
  const [cmd, ...rest] = argv;
  switch (cmd) {
    case 'pack':
      return cmdPack(rest);
    case 'unpack':
      return cmdUnpack(rest);
    case 'inspect':
      return cmdInspect(rest);
    case 'install':
      return runInstall(rest);
    case 'upgrade':
      return runUpgrade(rest);
    case 'rollback':
      return runRollback(rest);
    case undefined:
    case '-h':
    case '--help':
    case 'help':
      process.stdout.write(USAGE);
      return 0;
    default:
      process.stderr.write(`unknown command: ${cmd}\n${USAGE}`);
      return 1;
  }
}

export { main };

async function cmdPack(args: readonly string[]): Promise<number> {
  if (args.length !== 2) {
    process.stderr.write(`pack: expected 2 args, got ${args.length}\n${USAGE}`);
    return 1;
  }
  const [srcDir, outFile] = args as [string, string];
  const srcAbs = resolve(srcDir);
  const outAbs = resolve(outFile);

  let manifest: Manifest;
  try {
    const text = await fs.readFile(join(srcAbs, 'manifest.json'), 'utf8');
    manifest = JSON.parse(text) as Manifest;
  } catch (err) {
    process.stderr.write(`pack: cannot read manifest.json: ${(err as Error).message}\n`);
    return 1;
  }

  const events: PersistedEvent[] = [];
  try {
    const eventsText = await fs.readFile(join(srcAbs, 'events.jsonl'), 'utf8');
    for (const line of eventsText.split('\n')) {
      if (line.trim() === '') continue;
      events.push(JSON.parse(line) as PersistedEvent);
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      process.stderr.write(`pack: cannot read events.jsonl: ${(err as Error).message}\n`);
      return 1;
    }
    // No events.jsonl → empty event log.  Legal for new projects.
  }

  const chunks = new Map<string, Uint8Array>();
  try {
    const chunksDir = join(srcAbs, 'chunks');
    const entries = await fs.readdir(chunksDir);
    for (const name of entries) {
      if (!name.endsWith('.glb')) continue;
      const hash = name.slice(0, -'.glb'.length);
      const bytes = await fs.readFile(join(chunksDir, name));
      chunks.set(hash, new Uint8Array(bytes));
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      process.stderr.write(`pack: cannot read chunks/: ${(err as Error).message}\n`);
      return 1;
    }
  }

  let thumbnail: Uint8Array | undefined;
  try {
    const buf = await fs.readFile(join(srcAbs, 'thumbnails', 'project.png'));
    thumbnail = new Uint8Array(buf);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      process.stderr.write(
        `pack: cannot read thumbnails/project.png: ${(err as Error).message}\n`,
      );
      return 1;
    }
  }

  const t0 = performance.now();
  const result = await pack({ manifest, events, chunks, thumbnail });
  const elapsed = performance.now() - t0;
  if (!result.ok) {
    process.stderr.write(`pack: ${result.reason}: ${result.message}\n`);
    return 1;
  }
  await fs.writeFile(outAbs, result.bytes);
  process.stdout.write(
    `pack: wrote ${outAbs} (${formatBytes(result.byteLength)}, ` +
      `${result.telemetry.eventBatchCount} event batches, ` +
      `${result.telemetry.chunkCount} chunks, ${elapsed.toFixed(0)} ms)\n`,
  );
  return 0;
}

async function cmdUnpack(args: readonly string[]): Promise<number> {
  if (args.length !== 2) {
    process.stderr.write(`unpack: expected 2 args, got ${args.length}\n${USAGE}`);
    return 1;
  }
  const [inFile, outDir] = args as [string, string];
  const inAbs = resolve(inFile);
  const outAbs = resolve(outDir);

  const bytes = new Uint8Array(await fs.readFile(inAbs));
  const t0 = performance.now();
  const result = await unpack({ bytes });
  const elapsed = performance.now() - t0;
  if (!result.ok) {
    process.stderr.write(`unpack: ${result.reason}: ${result.message}\n`);
    return 1;
  }

  await fs.mkdir(outAbs, { recursive: true });
  await fs.writeFile(
    join(outAbs, 'manifest.json'),
    JSON.stringify(result.manifest, null, 2) + '\n',
  );

  if (result.events.length > 0) {
    const lines = result.events.map((e) => JSON.stringify(e)).join('\n');
    await fs.writeFile(join(outAbs, 'events.jsonl'), lines + '\n');
  }

  if (result.chunks.size > 0) {
    const chunksDir = join(outAbs, 'chunks');
    await fs.mkdir(chunksDir, { recursive: true });
    for (const [hash, b] of result.chunks) {
      await fs.writeFile(join(chunksDir, `${hash}.glb`), b);
    }
  }

  if (result.thumbnail) {
    const thumbsDir = join(outAbs, 'thumbnails');
    await fs.mkdir(thumbsDir, { recursive: true });
    await fs.writeFile(join(thumbsDir, 'project.png'), result.thumbnail);
  }

  process.stdout.write(
    `unpack: wrote ${outAbs} (${result.events.length} events, ` +
      `${result.chunks.size} chunks, ` +
      `${result.thumbnail ? 'thumbnail, ' : ''}` +
      `${elapsed.toFixed(0)} ms)\n`,
  );
  return 0;
}

async function cmdInspect(args: readonly string[]): Promise<number> {
  if (args.length !== 1) {
    process.stderr.write(`inspect: expected 1 arg, got ${args.length}\n${USAGE}`);
    return 1;
  }
  const [inFile] = args as [string];
  const inAbs = resolve(inFile);
  const bytes = new Uint8Array(await fs.readFile(inAbs));
  const result = await unpack({ bytes });
  if (!result.ok) {
    process.stderr.write(`inspect: ${result.reason}: ${result.message}\n`);
    return 1;
  }
  const m = result.manifest;
  const lines: string[] = [
    `file:           ${basename(inAbs)}`,
    `bytes:          ${formatBytes(bytes.byteLength)}`,
    `schemaVersion:  ${m.schemaVersion}`,
    `formatVersion:  ${m.formatVersion}`,
    `projectId:      ${m.projectId}`,
    `levels:         ${m.levels.length}`,
    `chunks:         ${m.chunks.length}`,
    `eventLogLength: ${m.eventLogLength}`,
    `lastEventId:    ${m.lastEventId ?? '(none)'}`,
    `events on disk: ${result.events.length}`,
    `chunk bytes:    ${formatBytes(
      Array.from(result.chunks.values()).reduce((s, b) => s + b.byteLength, 0),
    )}`,
    `thumbnail:      ${result.thumbnail ? `${formatBytes(result.thumbnail.byteLength)}` : '(none)'}`,
    `signature:      ${result.hasSignature ? 'present (not verified — pass --verify)' : '(none)'}`,
    `migratedFrom:   v${result.telemetry.migratedFromVersion ?? m.schemaVersion}`,
  ];
  process.stdout.write(lines.join('\n') + '\n');
  return 0;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KiB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MiB`;
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (err: unknown) => {
    process.stderr.write(
      `pryzm-cli: internal error: ${(err as Error).stack ?? String(err)}\n`,
    );
    process.exit(2);
  },
);
