#!/usr/bin/env node
// @pryzm/plugin-sdk — `pryzm dev` hot-reload CLI (S62 D4).
//
// Spec source:
//   • phases/PHASE-3C-Q3-M31-M33-PLUGIN-SDK-MARKETPLACE-APIS.md §2.5
//     line 1248 ("hot-reload < 500 ms")
//   • phases/PHASE-3C-Q3-M31-M33-SDK-MARKETPLACE-PUBLIC-API.md §S62 D4
//     ("`pryzm dev` hot-reload CLI")
//
// Workflow:
//
//   $ cd my-plugin
//   $ pryzm dev               # validates plugin.manifest.json, starts dev loop
//
//   • Reads `plugin.manifest.json`, validates against the locked schema.
//   • Watches the plugin source tree (default: every file in cwd, minus
//     `node_modules` + dotfiles) via `fs.watch` recursive mode (Node 20+
//     ships recursive watch on Linux + macOS; Windows is supported since
//     Node 14).  `chokidar` is intentionally NOT a dependency — keeping
//     the SDK dependency surface minimal helps the npm install footprint.
//   • On change: re-validates the manifest, prints the iframe srcdoc the
//     editor would mount, prints the build duration.
//
// The CLI is intentionally a development aid, not a production bundler.
// Real plugin authors compile their TypeScript with their own toolchain
// (esbuild / tsup / vite) and then run `pryzm dev` over the built bundle.
//
// Exit codes:
//   0 — clean exit (Ctrl-C in dev mode)
//   1 — manifest validation failed (terminal; user fixes manifest, re-runs)
//   2 — manifest file missing or unreadable
//   3 — build script (--build-cmd) failed
//   4 — argv parse error
//
// `pryzm publish` (S62 D9) is a separate file; this CLI is the dev half.

import { readFileSync, watch, statSync } from 'node:fs';
import { resolve, basename, join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { spawn } from 'node:child_process';
import { validateManifest } from '../descriptor';
import { buildIframeSrcdoc } from '../sandbox/iframe-sandbox';

interface CliArgs {
  manifestPath: string;
  buildCmd: string | null;
  bundlePath: string | null;
  hostOrigin: string;
  once: boolean;
}

function parseArgs(argv: readonly string[]): CliArgs {
  const args: CliArgs = {
    manifestPath: 'plugin.manifest.json',
    buildCmd: null,
    bundlePath: null,
    hostOrigin: 'https://app.pryzm.com',
    once: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--manifest' && argv[i + 1]) {
      args.manifestPath = String(argv[i + 1]);
      i += 1;
    } else if (a === '--build-cmd' && argv[i + 1]) {
      args.buildCmd = String(argv[i + 1]);
      i += 1;
    } else if (a === '--bundle' && argv[i + 1]) {
      args.bundlePath = String(argv[i + 1]);
      i += 1;
    } else if (a === '--host-origin' && argv[i + 1]) {
      args.hostOrigin = String(argv[i + 1]);
      i += 1;
    } else if (a === '--once') {
      args.once = true;
    } else if (a === '--help' || a === '-h') {
      printHelp();
      process.exit(0);
    } else {
      console.error(`pryzm dev: unknown argument '${a}'`);
      printHelp();
      process.exit(4);
    }
  }
  return args;
}

function printHelp(): void {
  console.log(
    [
      'Usage: pryzm dev [options]',
      '',
      'Options:',
      '  --manifest <path>      Path to plugin.manifest.json (default: ./plugin.manifest.json)',
      '  --bundle <path>        Path to compiled JS bundle for the iframe srcdoc preview',
      '  --build-cmd <cmd>      Shell command to run before each rebuild (e.g. "tsup")',
      '  --host-origin <url>    Origin to use for the postMessage handshake (default: https://app.pryzm.com)',
      '  --once                 Run validation + build once and exit (no watch)',
      '  -h, --help             Show this help',
    ].join('\n'),
  );
}

function readManifestOrExit(manifestPath: string): unknown {
  let raw: string;
  try {
    raw = readFileSync(manifestPath, 'utf-8');
  } catch (err) {
    console.error(`pryzm dev: cannot read manifest '${manifestPath}': ${(err as Error).message}`);
    process.exit(2);
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    console.error(`pryzm dev: manifest '${manifestPath}' is not valid JSON: ${(err as Error).message}`);
    process.exit(1);
  }
}

async function runBuild(buildCmd: string): Promise<{ ok: boolean; durationMs: number }> {
  const started = performance.now();
  return new Promise((resolveP) => {
    const child = spawn(buildCmd, { shell: true, stdio: 'inherit' });
    child.on('exit', (code) => {
      const durationMs = performance.now() - started;
      resolveP({ ok: code === 0, durationMs });
    });
  });
}

async function rebuild(args: CliArgs): Promise<void> {
  const t0 = performance.now();

  // 1. Validate manifest.
  const raw = readManifestOrExit(args.manifestPath);
  const v = validateManifest(raw);
  if (!v.ok) {
    console.error('pryzm dev: manifest validation failed:');
    for (const err of v.errors) console.error(`  • ${err}`);
    if (args.once) process.exit(1);
    return; // stay in watch mode; user fixes + saves
  }
  const manifest = v.manifest;

  // 2. Optional build step.
  if (args.buildCmd) {
    const result = await runBuild(args.buildCmd);
    if (!result.ok) {
      console.error(`pryzm dev: build command failed (${result.durationMs.toFixed(1)} ms)`);
      if (args.once) process.exit(3);
      return;
    }
  }

  // 3. Build the iframe srcdoc preview.
  let bundleSource = '/* no bundle provided; iframe will be empty */';
  if (args.bundlePath) {
    try {
      bundleSource = readFileSync(args.bundlePath, 'utf-8');
    } catch (err) {
      console.error(`pryzm dev: cannot read --bundle '${args.bundlePath}': ${(err as Error).message}`);
      if (args.once) process.exit(2);
      return;
    }
  }
  const srcdoc = buildIframeSrcdoc({
    manifest,
    bundleSource,
    hostOriginForHandshake: args.hostOrigin,
  });

  const totalMs = performance.now() - t0;
  console.log(`✓ ${manifest.id}@${manifest.version} (${manifest.permissions.length} perms, ${manifest.contributions.length} contribs) — ${totalMs.toFixed(1)} ms`);
  if (totalMs > 500) {
    console.warn(`  ⚠ above 500 ms hot-reload budget (phase-doc-1 line 1248)`);
  }
  if (args.once || process.env.PRYZM_DEV_PRINT_SRCDOC === '1') {
    console.log('— iframe srcdoc preview —');
    console.log(srcdoc);
  }
}

export async function main(argv: readonly string[]): Promise<void> {
  const args = parseArgs(argv);

  // Initial build.
  await rebuild(args);

  if (args.once) return;

  // Watch the cwd recursively (Node 20 supports recursive watch on
  // Linux/macOS/Windows since v15.9.0).  Filter out `node_modules` +
  // dotfiles to avoid feedback loops.
  console.log(`pryzm dev: watching ${process.cwd()} (Ctrl-C to exit)`);
  let pending: NodeJS.Timeout | null = null;
  try {
    watch(process.cwd(), { recursive: true }, (_event, filename) => {
      if (!filename) return;
      const f = String(filename);
      if (f.startsWith('node_modules') || basename(f).startsWith('.')) return;
      // 50 ms debounce — many editors save in two passes.
      if (pending) clearTimeout(pending);
      pending = setTimeout(() => {
        pending = null;
        void rebuild(args);
      }, 50);
    });
  } catch (err) {
    // Recursive watch can fail on some filesystems; fall back to no-watch.
    console.warn(`pryzm dev: watch failed (${(err as Error).message}); running once and exiting.`);
    return;
  }

  // Keep the process alive.
  process.stdin.resume();
}

// Entry point — only run main() if invoked directly, not when imported
// (e.g. by tests).
// isDirect: only true when cli.ts is the direct entry point (pryzm dev <args>).
// Does NOT trigger when bin.ts is the entry (which calls main() directly for
// the `dev` subcommand). The basename === 'pryzm' check is intentionally
// absent — that path is now handled by bin.ts.
const isDirect = (() => {
  try {
    const argvPath = process.argv[1];
    if (!argvPath) return false;
    return resolve(argvPath).endsWith(join('plugin-sdk', 'src', 'dev', 'cli.ts')) ||
           resolve(argvPath).endsWith(join('plugin-sdk', 'src', 'dev', 'cli.js')) ||
           resolve(argvPath).endsWith(join('plugin-sdk', 'dist', 'dev', 'cli.js'));
  } catch {
    return false;
  }
})();

if (isDirect) {
  main(process.argv.slice(2)).catch((err) => {
    console.error(`pryzm dev: ${(err as Error).message}`);
    process.exit(1);
  });
}

// Silence unused-import warnings (statSync is part of the Node 20 API
// inventory we test against; keeping the import ensures TS catches a
// node version regression early).
void statSync;
