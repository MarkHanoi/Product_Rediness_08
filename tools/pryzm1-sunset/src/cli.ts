#!/usr/bin/env node
// pryzm1-sunset — CLI entry per ADR-0031.
//
// Usage:
//   pryzm1-sunset --input <pryzm1.json> --output <pryzm2.json> [--dry-run] [--client-id <id>] [--fixed-now <ms>]
//
// Reads a PRYZM 1 JSON snapshot, converts it via `convertPryzm1Snapshot()`,
// writes the PRYZM 2 archive payload to disk (or stdout if `--dry-run`),
// and prints the migration report (input counts, output counts, skipped
// elements, Tier 2 deferrals, warnings).
//
// Exit codes:
//   0 — conversion succeeded (warnings + skipped elements OK)
//   1 — invalid CLI arguments
//   2 — input file unreadable / not valid JSON
//   3 — input snapshot failed schema sanity check
//   4 — output write failed

import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { argv, exit, stdout, stderr } from 'node:process';

import { convertPryzm1Snapshot } from './converter.js';
import type { Pryzm1Snapshot } from './types.js';

interface CliArgs {
  input: string | undefined;
  output: string | undefined;
  dryRun: boolean;
  clientId: string | undefined;
  fixedNow: number | undefined;
  help: boolean;
}

const HELP_TEXT = `pryzm1-sunset — convert a PRYZM 1 snapshot to a PRYZM 2 archive payload

Usage:
  pryzm1-sunset --input <pryzm1.json> --output <pryzm2.json> [options]

Options:
  --input <path>      Path to a PRYZM 1 JSON snapshot exported from
                      Settings → Project → Export → JSON.  Required.
  --output <path>     Path to write the PRYZM 2 archive payload (JSON).
                      Required unless --dry-run.
  --dry-run           Print the converted payload + report to stdout
                      without writing to disk.
  --client-id <id>    Stable client id stamped on every emitted event.
                      Default: 'pryzm1-sunset-cli'.
  --fixed-now <ms>    Frozen wall-clock (ms) for migratedAt + per-event
                      timestamp.  Useful for byte-stable test fixtures.
  --help              Print this message.

Spec: docs/00_NEW_ARCHITECTURE/specs/SPEC-27-MIGRATION-ROLLBACK.md §4.3
ADR : docs/architecture/adr/0031-s61-staged-legacy-deletion.md
`;

function parseArgs(rawArgs: readonly string[]): CliArgs {
  const args: CliArgs = {
    input: undefined,
    output: undefined,
    dryRun: false,
    clientId: undefined,
    fixedNow: undefined,
    help: false,
  };
  for (let i = 0; i < rawArgs.length; i += 1) {
    const flag = rawArgs[i];
    switch (flag) {
      case '--input':
        i += 1;
        args.input = rawArgs[i];
        break;
      case '--output':
        i += 1;
        args.output = rawArgs[i];
        break;
      case '--dry-run':
        args.dryRun = true;
        break;
      case '--client-id':
        i += 1;
        args.clientId = rawArgs[i];
        break;
      case '--fixed-now': {
        i += 1;
        const v = rawArgs[i];
        if (v === undefined) throw new Error('--fixed-now requires a numeric value');
        const parsed = Number(v);
        if (!Number.isFinite(parsed)) {
          throw new Error(`--fixed-now value '${v}' is not a finite number`);
        }
        args.fixedNow = parsed;
        break;
      }
      case '--help':
      case '-h':
        args.help = true;
        break;
      default:
        throw new Error(`Unknown CLI flag: ${flag}`);
    }
  }
  return args;
}

function validateSnapshot(value: unknown): asserts value is Pryzm1Snapshot {
  if (typeof value !== 'object' || value === null) {
    throw new Error('snapshot is not an object');
  }
  const v = value as Record<string, unknown>;
  if (typeof v.schemaVersion !== 'number') {
    throw new Error("snapshot is missing 'schemaVersion: number'");
  }
  const project = v.project;
  if (typeof project !== 'object' || project === null) {
    throw new Error("snapshot is missing 'project: object'");
  }
  const p = project as Record<string, unknown>;
  for (const key of ['id', 'name', 'createdAt', 'updatedAt']) {
    if (typeof p[key] !== 'string') {
      throw new Error(`snapshot.project.${key} must be a string`);
    }
  }
}

export async function runCli(rawArgs: readonly string[]): Promise<number> {
  let args: CliArgs;
  try {
    args = parseArgs(rawArgs);
  } catch (err) {
    stderr.write(`error: ${err instanceof Error ? err.message : String(err)}\n\n`);
    stderr.write(HELP_TEXT);
    return 1;
  }
  if (args.help) {
    stdout.write(HELP_TEXT);
    return 0;
  }
  if (args.input === undefined) {
    stderr.write('error: --input <path> is required\n\n');
    stderr.write(HELP_TEXT);
    return 1;
  }
  if (!args.dryRun && args.output === undefined) {
    stderr.write('error: --output <path> is required (unless --dry-run)\n\n');
    stderr.write(HELP_TEXT);
    return 1;
  }

  let raw: string;
  try {
    raw = await readFile(resolve(args.input), 'utf8');
  } catch (err) {
    stderr.write(`error: cannot read --input '${args.input}': ${err instanceof Error ? err.message : String(err)}\n`);
    return 2;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    stderr.write(`error: --input '${args.input}' is not valid JSON: ${err instanceof Error ? err.message : String(err)}\n`);
    return 2;
  }

  try {
    validateSnapshot(parsed);
  } catch (err) {
    stderr.write(`error: invalid PRYZM 1 snapshot: ${err instanceof Error ? err.message : String(err)}\n`);
    return 3;
  }

  const archive = convertPryzm1Snapshot(parsed, {
    ...(args.clientId !== undefined ? { clientId: args.clientId } : {}),
    ...(args.fixedNow !== undefined ? { fixedNow: args.fixedNow } : {}),
  });
  const serialised = JSON.stringify(archive, null, 2);

  if (args.dryRun) {
    stdout.write(serialised + '\n');
  } else {
    try {
      await writeFile(resolve(args.output as string), serialised + '\n', 'utf8');
    } catch (err) {
      stderr.write(`error: cannot write --output '${args.output}': ${err instanceof Error ? err.message : String(err)}\n`);
      return 4;
    }
  }

  // Migration report → stderr so stdout stays machine-readable in --dry-run.
  const r = archive.migrationReport;
  stderr.write('\n=== Migration report ===\n');
  stderr.write(`Input  : ${JSON.stringify(r.inputElementCounts)}\n`);
  stderr.write(`Output : ${JSON.stringify(r.outputEventCounts)}\n`);
  if (r.skipped.length > 0) {
    stderr.write(`Skipped (${r.skipped.length}):\n`);
    for (const s of r.skipped) stderr.write(`  - ${s.kind} '${s.id}': ${s.reason}\n`);
  }
  if (r.tier2Deferred.length > 0) {
    stderr.write(`Tier 2 deferred to v0.2:\n`);
    for (const k of r.tier2Deferred) stderr.write(`  - ${k}\n`);
  }
  if (r.warnings.length > 0) {
    stderr.write(`Warnings:\n`);
    for (const w of r.warnings) stderr.write(`  - ${w}\n`);
  }

  return 0;
}

// ESM equivalent of `if (require.main === module)`.
const isDirectInvocation =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith('cli.ts') === true ||
  process.argv[1]?.endsWith('cli.js') === true;

if (isDirectInvocation) {
  runCli(argv.slice(2)).then((code) => exit(code), (err) => {
    stderr.write(`fatal: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
    exit(99);
  });
}
