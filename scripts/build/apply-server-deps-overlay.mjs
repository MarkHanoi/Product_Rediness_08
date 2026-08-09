#!/usr/bin/env node
/**
 * §L-442 — swap the precompiled bundles over the pnpm workspace symlinks.
 *
 * Under pnpm, `node_modules/@pryzm/crash-reporter` is a SYMLINK to
 * `packages/crash-reporter`, whose entry point is TypeScript. This replaces that
 * symlink with a real directory holding the bundle from
 * `dist-server-deps/@pryzm/...`, after which plain `node server.js` resolves it
 * with no loader — and the runtime image no longer needs `packages/`, `apps/`,
 * `plugins/` or `tools/` at all.
 *
 * DESTRUCTIVE by design: it deletes an entry from node_modules. It therefore
 * REFUSES to run without `--yes`, so a developer who runs it by accident on a
 * working tree gets a message instead of a broken `pnpm dev` (recovery is
 * `pnpm install`, which restores the symlinks).
 *
 * Invoked from the Dockerfile AFTER `pnpm install --prod` (that install would
 * otherwise recreate the symlinks and undo this) and BEFORE the smoke test, so
 * the smoke test exercises exactly the module graph that ships.
 */
import { cpSync, existsSync, lstatSync, rmSync, mkdirSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SERVER_DEPS } from './server-deps.manifest.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');

if (!process.argv.includes('--yes')) {
  console.error(
    '[apply-server-deps-overlay] refusing to run without --yes.\n' +
      '  This DELETES node_modules/@pryzm/<pkg> and replaces it with a build artefact.\n' +
      '  It is meant for the container image build only. Recovery: `pnpm install`.',
  );
  process.exit(2);
}

const srcRoot = resolve(repoRoot, 'dist-server-deps');
if (!existsSync(srcRoot)) {
  console.error(
    `[apply-server-deps-overlay] ${srcRoot} does not exist — run ` +
      '`node scripts/build/build-server-deps.mjs` first.',
  );
  process.exit(1);
}

for (const dep of SERVER_DEPS) {
  const parts = dep.pkg.split('/');
  const src = join(srcRoot, ...parts);
  const dest = join(repoRoot, 'node_modules', ...parts);

  if (!existsSync(join(src, 'package.json'))) {
    console.error(`[apply-server-deps-overlay] missing bundle for ${dep.pkg} at ${src}`);
    process.exit(1);
  }

  // lstat, not stat: the target is usually a symlink and must be unlinked, not
  // followed (following it would delete the workspace source).
  if (existsSync(dest) || safeLstat(dest)) {
    rmSync(dest, { recursive: true, force: true });
  }
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(src, dest, { recursive: true, dereference: true });
  console.log(`[apply-server-deps-overlay] ${dep.pkg} → precompiled bundle`);
}

function safeLstat(p) {
  try {
    return lstatSync(p);
  } catch {
    return null;
  }
}
