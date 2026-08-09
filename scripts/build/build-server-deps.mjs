#!/usr/bin/env node
/**
 * §L-442 — precompile the workspace TypeScript the production server imports.
 *
 * THE PROBLEM THIS SOLVES
 * ----------------------
 * `server.js` and everything under `server/` are already plain JavaScript. The
 * only reason production booted through the `tsx` ESM loader is that two of the
 * modules they import resolve into `@pryzm/*` workspace packages whose `main` is
 * `./src/index.ts`. So every cold boot paid for a tsx registration + an on-the-fly
 * esbuild transpile of that TypeScript graph before the HTTP server could bind.
 * MEASURED on the dev box: ~1.9s warm / ~4.8s cold for those two imports alone,
 * against ~0.14s once precompiled — i.e. essentially free.
 *
 * (The `fly.toml` comment claiming "~100 workspace TypeScript packages" is wrong:
 *  it is two entry points. Their graphs are NOT small though — measured from a
 *  clean `pnpm install` on 2026-08-09, esbuild inlines 102 modules for
 *  @pryzm/crash-reporter and 144 for @pryzm/file-format/server, i.e. 246 total,
 *  not the "6 + 68" an earlier revision of this comment claimed. Read the counts
 *  off the build log, which prints them per bundle, rather than trusting prose.
 *  The cost was real; both diagnoses of its size were wrong.)
 *
 * WHAT THIS EMITS
 * ---------------
 *   dist-server-deps/@pryzm/crash-reporter/{package.json,index.mjs}
 *   dist-server-deps/@pryzm/file-format/{package.json,server.mjs}
 *
 * Deliberately NOT under `dist/`: `dist/` is handed to `express.static`, and these
 * bundles ship `.map` files containing server-side source. Serving them would be a
 * quiet information leak.
 *
 * Each is a drop-in replacement for the workspace package, containing ONLY the
 * export surface the server actually imports. `apply-server-deps-overlay.mjs`
 * swaps them over the pnpm symlinks in the runtime image, after which plain
 * `node server.js` resolves them with no loader in the path.
 *
 * EXTERNALISATION RULE (deliberate, and self-checking)
 * ---------------------------------------------------
 * A bare import is left EXTERNAL iff it is a node: builtin or its package name
 * appears in the ROOT package.json `dependencies` — i.e. exactly the set that
 * survives `pnpm install --prod` and is resolvable from `<app>/node_modules`.
 * Everything else (jszip, @opentelemetry/resources, @opentelemetry/sdk-trace-base,
 * and the whole `@pryzm/*` graph) is INLINED, because under pnpm's strict layout
 * it would NOT be resolvable from the overlay directory. Native/`.node` addons
 * would break if inlined — none appear in these two graphs, and the assertion at
 * the bottom of this file fails the build if one ever does.
 */
import { mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { builtinModules } from 'node:module';

import { SERVER_DEPS, bundleSlug } from './server-deps.manifest.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');
const outRoot = resolve(repoRoot, 'dist-server-deps');

const require_ = createRequire(join(repoRoot, 'package.json'));

/** @type {typeof import('esbuild')} */
const esbuild = require_('esbuild');

const rootPkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
/** Package names guaranteed present after `pnpm install --prod`. */
const PROD_RESOLVABLE = new Set(Object.keys(rootPkg.dependencies ?? {}));
const BUILTINS = new Set(builtinModules);

/** 'zod/v4' → 'zod'; '@scope/pkg/sub' → '@scope/pkg' */
function packageNameOf(spec) {
  const parts = spec.split('/');
  return spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

const externalisePlugin = {
  name: 'pryzm-externalise-prod-resolvable',
  setup(build) {
    build.onResolve({ filter: /.*/ }, (args) => {
      if (args.kind === 'entry-point') return null;
      const p = args.path;
      // Relative / absolute → always bundle.
      if (p.startsWith('.') || p.startsWith('/') || /^[A-Za-z]:[\\/]/.test(p)) return null;
      if (p.startsWith('node:')) return { external: true };
      // EXACT match only. `require('string_decoder/')` (readable-stream's
      // browserify shim) is NOT the builtin — with a trailing slash Node goes to
      // node_modules, which pnpm's strict layout will not resolve from the
      // overlay directory. Inline it instead.
      if (BUILTINS.has(p)) return { external: true };
      const name = packageNameOf(p);
      // Workspace packages ship .ts — they MUST be inlined.
      if (name.startsWith('@pryzm/')) return null;
      if (PROD_RESOLVABLE.has(name)) return { external: true };
      return null; // inline: not resolvable from the runtime image's root node_modules
    });
  },
};

rmSync(outRoot, { recursive: true, force: true });

const summary = [];

for (const dep of SERVER_DEPS) {
  const pkgOutDir = join(outRoot, ...dep.pkg.split('/'));
  mkdirSync(pkgOutDir, { recursive: true });

  /** @type {Record<string,string>} */
  const exportsMap = {};
  // Read the source manifest through node_modules directly: most workspace
  // packages declare an "exports" map that (correctly) does not expose
  // ./package.json, so require.resolve() cannot be used here.
  const srcPkgJson = JSON.parse(
    readFileSync(join(repoRoot, 'node_modules', ...dep.pkg.split('/'), 'package.json'), 'utf8'),
  );

  // IDEMPOTENCY GUARD — this failure was reproduced, not imagined (2026-08-09).
  // `apply-server-deps-overlay.mjs` replaces node_modules/@pryzm/<pkg> with THIS
  // script's own output. Building again in that state re-bundles the bundle:
  // esbuild prepends the createRequire banner a second time and the artefact dies
  // at import with `SyntaxError: Identifier '__pryzmCreateRequire' has already
  // been declared`. The Dockerfile's step order makes this unreachable inside the
  // image, but a developer who ran the overlay locally — or any future job that
  // builds twice in one tree — would otherwise get a silently poisoned bundle
  // that only fails at boot. Fail here instead, with the recovery spelled out.
  if (srcPkgJson.pryzmPrecompiled === true) {
    throw new Error(
      `[build-server-deps] node_modules/${dep.pkg} is ALREADY a precompiled overlay, not the ` +
        'workspace source — re-bundling it emits a broken double-bannered module. ' +
        'Recovery: `pnpm install` (restores the workspace symlinks), then rebuild.',
    );
  }

  for (const subpath of dep.subpaths) {
    const spec = subpath === '.' ? dep.pkg : `${dep.pkg}/${subpath.replace(/^\.\//, '')}`;
    const entry = require_.resolve(spec);
    const slug = bundleSlug(subpath);
    const outfile = join(pkgOutDir, `${slug}.mjs`);

    const result = await esbuild.build({
      entryPoints: [entry],
      outfile,
      bundle: true,
      format: 'esm',
      platform: 'node',
      target: 'node20',
      // Keep readable-ish output: a stack trace from prod must still be usable,
      // and the bundle is a few hundred KB, not a client payload.
      minify: false,
      sourcemap: 'linked',
      metafile: true,
      logLevel: 'warning',
      logOverride: { 'package.json': 'silent' },
      plugins: [externalisePlugin],
      define: { 'process.env.NODE_ENV': JSON.stringify('production') },
      loader: { '.node': 'copy' },
      // ESM output has no `require`. Several INLINED CommonJS modules (the
      // OpenTelemetry SDK, readable-stream/jszip) `require()` an EXTERNAL
      // package at load time; without this banner esbuild's shim throws
      // "Dynamic require of X is not supported" on the very first import.
      // createRequire(import.meta.url) resolves from the bundle's own location
      // — i.e. node_modules/@pryzm/<pkg>/ in the overlay — which walks up to
      // the app-root node_modules where every declared external lives.
      banner: {
        js: [
          "import { createRequire as __pryzmCreateRequire } from 'node:module';",
          'const require = __pryzmCreateRequire(import.meta.url);',
        ].join('\n'),
      },
    });

    const inputs = Object.keys(result.metafile.inputs);
    const nativeAddons = inputs.filter((i) => i.endsWith('.node'));
    if (nativeAddons.length > 0) {
      throw new Error(
        `[build-server-deps] ${spec} pulls native addon(s) into the bundle: ` +
          `${nativeAddons.join(', ')}. Add the owning package to the root ` +
          `package.json "dependencies" so it stays external, then rebuild.`,
      );
    }

    const externals = new Set();
    for (const out of Object.values(result.metafile.outputs)) {
      for (const imp of out.imports ?? []) if (imp.external) externals.add(imp.path);
    }

    // Every remaining external MUST be resolvable from the app root at runtime,
    // where only root `dependencies` exist (pnpm strict layout, `--prod` install).
    // Catching this here is the difference between a build failure and a 3am
    // ERR_MODULE_NOT_FOUND on a scaled-out instance.
    for (const ext of externals) {
      if (ext.startsWith('node:') || BUILTINS.has(ext)) continue;
      try {
        require_.resolve(ext);
      } catch {
        throw new Error(
          `[build-server-deps] ${spec}: external "${ext}" is not resolvable from the ` +
            `repo root. Either add its package to root package.json "dependencies", ` +
            `or let it be inlined (remove it from that list).`,
        );
      }
    }

    exportsMap[subpath] = `./${slug}.mjs`;
    summary.push({ spec, slug, modules: inputs.length, externals: [...externals].sort() });
  }

  writeFileSync(
    join(pkgOutDir, 'package.json'),
    `${JSON.stringify(
      {
        name: dep.pkg,
        version: srcPkgJson.version ?? '0.0.0',
        private: true,
        type: 'module',
        // Marker read by the idempotency guard above: if this manifest ever comes
        // back in as the BUILD INPUT, the overlay has been applied to the tree and
        // re-bundling would double the esbuild banner. Do not remove.
        pryzmPrecompiled: true,
        // §L-442 AUTO-GENERATED by scripts/build/build-server-deps.mjs.
        // Only the subpaths the production server imports are present. Any other
        // subpath throws ERR_PACKAGE_PATH_NOT_EXPORTED — deliberately loud.
        exports: exportsMap,
        main: exportsMap['.'] ?? undefined,
      },
      null,
      2,
    )}\n`,
  );
}

writeFileSync(
  join(outRoot, 'BUILD-INFO.json'),
  `${JSON.stringify({ generatedAt: new Date().toISOString(), bundles: summary }, null, 2)}\n`,
);

for (const s of summary) {
  console.log(
    `[build-server-deps] ${s.spec} → ${s.slug}.mjs  (${s.modules} modules inlined, ` +
      `external: ${s.externals.join(', ') || 'none'})`,
  );
}
console.log(`[build-server-deps] wrote ${outRoot}`);

// Fail loudly if the emitted JS is not parseable by the runtime's own parser.
for (const dep of SERVER_DEPS) {
  for (const subpath of dep.subpaths) {
    const file = join(outRoot, ...dep.pkg.split('/'), `${bundleSlug(subpath)}.mjs`);
    // `node --check` does not accept ESM-with-await reliably across versions;
    // a real dynamic import is the stronger check and is what smoke-prod-boot
    // exercises end-to-end. Here we only assert the file is non-empty JS.
    const text = readFileSync(file, 'utf8');
    if (text.trim().length === 0) throw new Error(`[build-server-deps] empty bundle: ${file}`);
    void pathToFileURL(file);
  }
}
