#!/usr/bin/env node
/**
 * §L-442 GUARD — the production runtime has no TypeScript loader.
 *
 * Since `dist/index.cjs` now boots `server.js` with plain `node`, ANY `@pryzm/*`
 * import reachable from the server that is not precompiled by
 * `scripts/build/build-server-deps.mjs` will die at runtime with
 * ERR_UNKNOWN_FILE_EXTENSION ".ts" — possibly not until the route is first hit.
 *
 * This turns that into a build failure. It scans server.js + server/** for
 * `@pryzm/...` specifiers in real import/require positions and asserts every one
 * is covered by SERVER_DEPS in server-deps.manifest.mjs.
 *
 * It is a static scan, so it cannot see a computed specifier
 * (`await import('@pryzm/' + name)`). None exist today; if one is ever added the
 * smoke test will not catch it either, and the manifest comment says so.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, resolve, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SERVER_DEPS, RUNTIME_SOURCE_ROOTS } from './server-deps.manifest.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');

/** Every specifier the overlay will satisfy, e.g. '@pryzm/file-format/server'. */
const ALLOWED = new Set(
  SERVER_DEPS.flatMap((d) =>
    d.subpaths.map((s) => (s === '.' ? d.pkg : `${d.pkg}/${s.replace(/^\.\//, '')}`)),
  ),
);

function* walk(p) {
  const st = statSync(p);
  if (st.isFile()) {
    if (/\.(m|c)?js$/.test(p)) yield p;
    return;
  }
  for (const e of readdirSync(p)) {
    if (e === 'node_modules' || e === '__tests__' || e === 'dist') continue;
    yield* walk(join(p, e));
  }
}

// `from '@pryzm/x'`, `import '@pryzm/x'`, `import('@pryzm/x')`, `require('@pryzm/x')`.
// Anchoring on the keyword is what keeps the dozens of `@pryzm/site-parcel-data`
// PROSE mentions in server.js comments from tripping this.
const SPECIFIER_RE =
  /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s+)['"](@pryzm\/[^'"]+)['"]/g;

const violations = [];
let scanned = 0;

for (const root of RUNTIME_SOURCE_ROOTS) {
  for (const file of walk(resolve(repoRoot, root))) {
    scanned++;
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(SPECIFIER_RE)) {
      const spec = m[1];
      if (ALLOWED.has(spec)) continue;
      const line = text.slice(0, m.index).split('\n').length;
      violations.push(`${relative(repoRoot, file)}:${line}  ${spec}`);
    }
  }
}

if (violations.length > 0) {
  console.error(
    '\n[check-server-deps] ✖ The production server imports workspace package(s) that are\n' +
      '  NOT precompiled. Production runs plain `node` with no tsx loader (§L-442), so these\n' +
      '  would crash with ERR_UNKNOWN_FILE_EXTENSION ".ts".\n\n' +
      violations.map((v) => `    ${v}`).join('\n') +
      '\n\n  Fix: add the package + subpath to SERVER_DEPS in\n' +
      '  scripts/build/server-deps.manifest.mjs, then re-run the build.\n' +
      '  (Or drop the import — the server half is deliberately plain JS.)\n',
  );
  process.exit(1);
}

console.log(
  `[check-server-deps] ok — ${scanned} runtime JS files scanned, ` +
    `${ALLOWED.size} precompiled specifier(s): ${[...ALLOWED].join(', ')}`,
);
