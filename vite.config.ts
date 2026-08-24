import { readdirSync, existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Plugin } from 'vite';
import { defineConfig } from 'vite';
import cesium from 'vite-plugin-cesium';

// ---------------------------------------------------------------------------
// core-js stub plugin — production builds only
//
// Problem: some npm packages (e.g. canvg, @thatopen/*, dxf) were compiled with
// Babel and carry @babel/runtime which transitively pulls in ~400 core-js
// micro-files into the Rollup transform graph.  Each file is a polyfill
// installer (side-effect-only) that patches globalThis.  With build.target =
// 'esnext', every modern target browser already implements these features
// natively, so all 400 polyfill installers are pure no-ops.
//
// The stub resolves every `core-js/*` import to a single empty virtual module
// before Rollup touches it, eliminating ~400 individual AST transforms and
// dramatically reducing peak heap usage during the production bundling phase.
//
// Safety: safe whenever build.target is 'esnext'.  Do NOT use for legacy
// targets (es2015, es2017) where the polyfills are genuinely required.
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Stub Node.js built-ins that rhino3dm's UMD wrapper conditionally requires
// ('fs', 'path', 'crypto').  In the browser those require() branches are
// never reached (rhino3dm uses WASM), but Vite's static analysis sees the
// require() calls and emits "Module X has been externalized for browser
// compatibility" warnings.  Providing empty virtual stubs silences the
// warnings without affecting runtime behaviour.
//
// NOTE: 'crypto' here is the CommonJS shim referenced by rhino3dm's UMD
// wrapper (require('crypto')), NOT the browser's globalThis.crypto (Web
// Crypto API) which is a completely separate interface.
// ---------------------------------------------------------------------------
function stubNodeBuiltinsForBrowserPlugin(): Plugin {
  // Plain names ('fs', 'path', 'crypto') → rhino3dm UMD wrapper require()s.
  // Prefixed names ('node:crypto') → @pryzm/plugin-sdk signing.ts dynamic
  // import, guarded by `process.versions?.node` so never reached in browser.
  // Intercepting BEFORE vite:resolve sees them silences the "externalized for
  // browser compatibility" warnings without affecting runtime behaviour.
  const STUBBED = new Set(['fs', 'path', 'crypto', 'node:crypto', 'node:fs', 'node:path']);
  return {
    name: 'stub-node-builtins-for-browser',
    enforce: 'pre',
    apply: 'build',
    resolveId(id: string) {
      if (STUBBED.has(id)) return `\0stub-node-${id.replace(/:/g, '_')}`;
    },
    load(id: string) {
      if (id.startsWith('\0stub-node-')) return 'export default {};\n';
    },
  };
}

function stubCoreJsForEsnextPlugin(): Plugin {
  const STUB_ID = '\0core-js-stub';
  return {
    name: 'stub-core-js-for-esnext',
    enforce: 'pre',
    apply: 'build',
    resolveId(id: string) {
      if (id.startsWith('core-js/') || id === 'core-js') return STUB_ID;
    },
    load(id: string) {
      if (id === STUB_ID) {
        // Return a minimal ESM stub.  The default export is {} so that
        // import-default patterns (e.g. import x from 'core-js/internals/…')
        // don't throw, even though the result is never used at esnext.
        return 'export default {};\n';
      }
    },
  };
}

// Force a single zod v4 across the monorepo. Some workspace packages still
// declare `zod ^3.x`, which otherwise causes Vite's dep optimizer to pick the
// v3 build and break v4-only APIs (e.g. z.partialRecord) at runtime.
const zodV4Path = realpathSync(join(process.cwd(), 'node_modules', 'zod'));

const replitDevDomain = process.env.REPLIT_DEV_DOMAIN;

// ---------------------------------------------------------------------------
// Auto-discovery plugin
// Scans public/items/<Category>/<slug>/ at dev-start and build time, then
// exposes a virtual module "virtual:item-catalog" that lists every discovered
// item. Consumers:
//   import catalog from 'virtual:item-catalog'
//   // catalog: Array<{ slug, category, glbPath, thumbnailPath, label }>
//
// Items that have a meta.json next to model.glb can override the default label.
// ---------------------------------------------------------------------------
function itemCatalogPlugin(): Plugin {
  const VIRTUAL_ID = 'virtual:item-catalog';
  const RESOLVED_ID = '\0' + VIRTUAL_ID;

  const ITEMS_ROOT = join(process.cwd(), 'public', 'items');

  function buildCatalog(): string {
    const items: Array<{
      slug: string;
      category: string;
      glbPath: string;
      thumbnailPath: string;
      label: string;
    }> = [];

    if (!existsSync(ITEMS_ROOT)) {
      return `export default ${JSON.stringify(items)};`;
    }

    const categories = readdirSync(ITEMS_ROOT, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);

    for (const category of categories) {
      const catDir = join(ITEMS_ROOT, category);
      const slugDirs = readdirSync(catDir, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => d.name);

      for (const slug of slugDirs) {
        const glbFile = join(catDir, slug, 'model.glb');
        if (!existsSync(glbFile)) continue;

        const thumbFile = join(catDir, slug, 'thumbnail.webp');
        const metaFile  = join(catDir, slug, 'meta.json');

        let label = slug
          .split('-')
          .map(w => w.charAt(0).toUpperCase() + w.slice(1))
          .join(' ');

        if (existsSync(metaFile)) {
          try {
            const meta = JSON.parse(readFileSync(metaFile, 'utf8'));
            if (meta.label) label = meta.label;
          } catch {
            // malformed meta.json — use the auto-generated label
          }
        }

        items.push({
          slug,
          category,
          glbPath:       `/items/${category}/${slug}/model.glb`,
          thumbnailPath: existsSync(thumbFile)
            ? `/items/${category}/${slug}/thumbnail.webp`
            : '',
          label,
        });
      }
    }

    return `export default ${JSON.stringify(items, null, 2)};`;
  }

  return {
    name: 'vite-plugin-item-catalog',
    resolveId(id) {
      if (id === VIRTUAL_ID) return RESOLVED_ID;
    },
    load(id) {
      if (id === RESOLVED_ID) return buildCatalog();
    },
    // Re-generate when files under public/items change during dev
    configureServer(server) {
      server.watcher.add(ITEMS_ROOT);
      server.watcher.on('all', (event, changedPath) => {
        if (changedPath.startsWith(ITEMS_ROOT)) {
          const mod = server.moduleGraph.getModuleById(RESOLVED_ID);
          if (mod) server.moduleGraph.invalidateModule(mod);
        }
      });
    },
  };
}

// ---------------------------------------------------------------------------
// §CSP-CESIUM-KNOCKOUT-EVAL (L-10420, lane CSP26) — REMOVE THE ONE `eval` THAT
// RUNS ON EVERY PAGE LOAD.
//
// THE CALLER, NAMED AND MEASURED (2026-08-24, headless Chromium against the
// shipped `dist/`, `securitypolicyviolation` event, not a grep):
//
//   directive=script-src  blocked=eval
//   source=/cesium/Cesium.js  line=17925  col=49
//
// That is byte 5628397 of `node_modules/cesium/Build/Cesium/Cesium.js`
// (CesiumJS 1.143.0), inside the **Knockout 3.5.1** UMD prelude that Cesium
// vendors for its Widgets:
//
//   var t = this || (0,eval)("this")            // ← the global-object idiom
//
// The whole Cesium bundle carries a top-level `"use strict"` (byte 848), so
// inside that plain-called IIFE `this` is `undefined`, the `||` does NOT
// short-circuit, and the indirect `eval` RUNS — at module-evaluation time.
// `vite-plugin-cesium` injects `<script src="/cesium/Cesium.js">` as the
// FIRST, parser-blocking tag in `<head>`, so this fires on EVERY page,
// including the marketing landing page, before anything else executes. It is
// the founder's "first line in the console" verbatim.
//
// ⚠ IT IS NOT COSMETIC. Measured with the same probe in ENFORCE mode:
// unpatched → `EvalError` escapes the top-level IIFE, `Cesium.js` evaluation
// aborts, and `typeof window.Cesium === 'undefined'` — the entire geospatial
// subsystem is dead. Patched → 0 violations, `window.Cesium` present, and
// `new Cesium.Viewer(...)` with PRYZM's exact options (CesiumViewport.ts:2059,
// every knockout widget disabled) constructs cleanly with ZERO script-src
// violations. So the day someone promotes the C51 §3.1.2 shadow policy to
// enforcing, THIS is what would have white-screened production.
//
// WHY A BUILD-TIME REWRITE AND NOT SOMETHING ELSE — the rejected options:
//   • Add `'unsafe-eval'`: it is already granted in the ENFORCED policy; the
//     entire point is to remove it. CSP cannot scope `'unsafe-eval'` to one
//     script, so there is no "narrow allowance" to grant — it is all-or-
//     nothing for the whole document.
//   • `pnpm patch cesium`: a unified diff over a 5.9 MB minified bundle whose
//     hunk is one multi-megabyte line. Unreviewable.
//   • `defer` / dynamic-import Cesium (the perf item in
//     APPLICATION-PERFORMANCE-LEDGER §8.1): DELAYS the eval, never removes it.
//     Worth doing, for a different reason.
//
// The substitution is semantics-preserving: indirect `eval("this")` evaluates
// in global sloppy scope and returns the global object, which is exactly what
// `globalThis` is. It is padded to the SAME BYTE LENGTH so every line/column
// in this un-source-mapped vendor bundle keeps pointing where it did.
//
// ⛔ FAIL-CLOSED, DELIBERATELY. Anything other than exactly one occurrence
// throws and stops the build. A patch that silently finds nothing is how a
// removed `eval` comes back invisibly — and the whole defect being closed here
// is a security claim that nobody re-measured.
// ---------------------------------------------------------------------------
const CESIUM_EVAL_NEEDLES = ['(0,eval)("this")', "(0,eval)('this')"] as const;

export function stripCesiumLoadTimeEvalPlugin(): Plugin {
  // Resolved from Vite (absolute) rather than hard-coded to `<cwd>/dist`, so an
  // `--outDir` override cannot silently leave an un-patched bundle behind.
  let outDir = resolve(process.cwd(), 'dist');
  return {
    name: 'pryzm-strip-cesium-load-time-eval',
    apply: 'build',
    enforce: 'post',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    closeBundle: {
      // `vite-plugin-cesium` copies Cesium.js into the output dir in its OWN
      // `closeBundle`, and Rollup runs `closeBundle` hooks in PARALLEL.
      // `sequential: true` is what makes this run after that copy has settled;
      // without it the rewrite races the copy and loses on a fast disk.
      sequential: true,
      order: 'post',
      handler() {
        const target = resolve(outDir, 'cesium', 'Cesium.js');
        if (!existsSync(target)) {
          throw new Error(
            `[csp-cesium-eval] ${target} does not exist after the build. ` +
              'vite-plugin-cesium is expected to have copied it. If Cesium was ' +
              'removed from the build, delete this plugin and record it in ' +
              'docs/02-decisions/contracts/C51-APEX-APP-DEPLOYMENT-SPLIT.md §3.1.2.3.',
          );
        }
        const src = readFileSync(target, 'utf8');
        const hits = CESIUM_EVAL_NEEDLES.map((n) => ({ n, i: src.indexOf(n) })).filter(
          (h) => h.i !== -1,
        );
        const total = CESIUM_EVAL_NEEDLES.reduce(
          (acc, n) => acc + src.split(n).length - 1,
          0,
        );
        if (total !== 1) {
          throw new Error(
            `[csp-cesium-eval] expected EXACTLY 1 knockout \`(0,eval)("this")\` in ` +
              `${target}, found ${total}. This gate is fail-closed on purpose. ` +
              'If Cesium/Knockout removed it upstream, delete this plugin and update ' +
              'C51 §3.1.2.3 + server/securityHeaders.js. If the idiom merely changed ' +
              'shape, update CESIUM_EVAL_NEEDLES — do NOT weaken the CSP instead.',
          );
        }
        const { n } = hits[0]!;
        const replacement = 'globalThis'.padEnd(n.length, ' ');
        const out = src.replace(n, replacement);
        if (out.length !== src.length) {
          throw new Error(
            '[csp-cesium-eval] byte length changed; the replacement must be padded to ' +
              'the needle length so line/column offsets in this un-source-mapped bundle hold.',
          );
        }
        writeFileSync(target, out);
        console.log(
          `[csp-cesium-eval] removed the load-time \`${n}\` from ${target} ` +
            '(Knockout 3.5.1 global-object idiom → globalThis) — C51 §3.1.2.3 / L-10420.',
        );
      },
    },
  };
}

// ---------------------------------------------------------------------------
// §OBS-TRACING-REACHABLE (L-9960) — THE BROWSER HALF OF THE TRACING SWITCH.
//
// MEASURED 2026-08-23: 347 `trace.getTracer(...)` call sites live across 328
// files; exactly ONE of them is under `server/`. All the rest run in the
// browser, where `process.env` does not exist. `initTracing()` read the flag
// from `process.env` ONLY, this file had NO `define` at all, and `PRYZM_TRACING`
// appeared in ZERO configuration file — so the switch for 99.7 % of PRYZM's
// instrumentation had no wire attached. Every browser `trace.getTracer()`
// returned the API's no-op tracer, by construction.
//
// This block is that wire. Why BARE IDENTIFIERS rather than
// `import.meta.env.VITE_PRYZM_TRACING`:
//   • `packages/crash-reporter` is a LINKED WORKSPACE consumed as raw TS. A
//     bare-identifier `define` is applied by esbuild/Rollup across the whole
//     module graph including linked packages; the implicit `import.meta.env.*`
//     substitution is documented for app source, not guaranteed there.
//   • `crash-reporter/tsconfig.json` declares `types: ["node"]`, so
//     `import.meta.env` would be a TYPE ERROR in that package without dragging
//     `vite/client` into an L1 leaf. A `declare const` costs nothing.
//   • The SAME source file is also bundled by esbuild into `dist-server-deps/`
//     for the production server, and run under vitest. `typeof <undeclared>` is
//     safe in both; `import.meta.env.X` throws when `import.meta.env` is
//     undefined, which it is under Node.
//
// The value is read from the BUILD environment, so `VITE_PRYZM_TRACING=1
// pnpm build` (or a Fly/CI build secret) turns it on. ⚠ It is baked at build
// time — flipping it needs a rebuild, which is the accepted cost of not
// blocking editor boot on a config round-trip (see Tracing.ts's header).
const defineTracing = (): Record<string, string> => {
  // `VITE_`-prefixed first (the repo's client-config convention, see
  // tools/ga-gate/secrets-declarations.json), falling back to the bare server
  // name so a single variable can configure both halves of one deploy.
  const pick = (...names: string[]): string | undefined => {
    for (const n of names) {
      const v = process.env[n];
      if (typeof v === 'string' && v.length > 0) return v;
    }
    return undefined;
  };
  // `'undefined'` (the JS literal, not the string) so `typeof X === 'undefined'`
  // is constant-folded to the OFF branch and the whole thing tree-shakes away.
  const lit = (v: string | undefined): string => (v === undefined ? 'undefined' : JSON.stringify(v));
  return {
    __PRYZM_TRACING__: lit(pick('VITE_PRYZM_TRACING', 'PRYZM_TRACING')),
    __PRYZM_TRACING_SAMPLE__: lit(pick('VITE_PRYZM_TRACING_SAMPLE', 'PRYZM_TRACING_SAMPLE')),
    // ⚠ The browser cannot reach a collector that is not publicly addressable
    // and CORS-enabled. This is the PUBLIC ingest URL, and it is baked into a
    // public bundle by design — the same posture as VITE_CESIUM_TOKEN.
    __PRYZM_TRACING_ENDPOINT__: lit(
      pick('VITE_OTEL_EXPORTER_OTLP_ENDPOINT', 'VITE_PRYZM_TRACING_ENDPOINT'),
    ),
    // ⛔ DELIBERATELY *NOT* fed from `OTEL_EXPORTER_OTLP_HEADERS`. That server
    // variable is classified SECRET (it carries the collector auth token);
    // baking it into a public bundle would publish it to every visitor. A
    // browser exporter must use an ingest endpoint that authenticates by URL
    // path/origin, or go through a same-origin proxy route.
    __PRYZM_TRACING_HEADERS__: 'undefined',
    __PRYZM_RELEASE__: lit(pick('VITE_PRYZM_RELEASE', 'PRYZM_RELEASE')),
    __PRYZM_ENV__: lit(pick('VITE_PRYZM_ENV', 'PRYZM_ENV', 'NODE_ENV')),
  };
};

// @ts-ignore
export default defineConfig({
  define: defineTracing(),
  plugins: [
    cesium(),
    // §CSP-CESIUM-KNOCKOUT-EVAL (L-10420) — MUST stay after cesium(); it rewrites
    // the file cesium() copies. Ordering is enforced by the hook, not by this
    // array (see the plugin's `sequential: true`), but keep them adjacent so the
    // dependency is readable.
    stripCesiumLoadTimeEvalPlugin(),
    itemCatalogPlugin(),
    stubNodeBuiltinsForBrowserPlugin(),
    stubCoreJsForEsnextPlugin(),
  ],
  esbuild: {
    jsx: 'automatic',
    jsxImportSource: 'react',
  },
  build: {
    // Target modern browsers — skips the extra Babel/esbuild transpile AST
    // pass that would otherwise re-lower ES2022 class fields, private methods,
    // etc. that all our target browsers already support. Saves ~30 % peak heap
    // during the Rollup transform phase on the 2,800+ file monorepo bundle.
    // Build constraint: Replit cgroup cap = 8 GB; Node heap = 6 GB (package.json).
    target: 'esnext',

    // Never emit source maps in production — avoids holding a second copy of
    // every module's source in the V8 heap during the Rollup emit phase.
    sourcemap: false,

    // Don't gzip-measure every emitted chunk. The default (true) compresses each
    // of the ~hundreds of output chunks in-memory just to print a size column —
    // on this 2,800-file bundle that holds many MB of compressed buffers at the
    // emit peak (right where Rollup is already at its heap high-water mark) and
    // adds wall-clock. We ship content-hashed, server-gzipped assets, so the
    // reported pre-compression size is noise. Turning it off shaves peak heap +
    // build time — material for fitting the 8GB Fly/Replit builder cgroup.
    reportCompressedSize: false,

    // Emit-phase memory escape hatch for the Fly/Depot managed builder, whose
    // build container OOM-kills (exit 137) at the Rollup emit peak — it dies
    // *after* "3624 modules transformed", i.e. while the full module graph is
    // still resident AND esbuild is holding per-chunk minified output. Fly's
    // managed builder can't be resized from the CLI, so when PRYZM_LOWMEM_BUILD=1
    // (set only in the Dockerfile builder stage) we skip minification: chunks
    // render-and-flush instead of being held for a minify pass, which drops the
    // emit high-water mark below the container cgroup. Local `pnpm build` and the
    // CI build are unaffected (env unset ⇒ default esbuild minify). The shipped
    // assets are still content-hashed and served gzip-compressed; unminified-
    // but-gzipped is a deliberate, temporary first-deploy trade-off until the
    // proper minified build runs on a larger CI builder. Tracker: DEPLOY-MINIFY-CI.
    minify: process.env.PRYZM_LOWMEM_BUILD === '1' ? false : 'esbuild',

    // Increase warning threshold — we ship a CAD/BIM engine; the heavy chunks
    // below (three, web-ifc, cesium, @thatopen, path tracer) are intentionally
    // large and load lazily via dynamic import from main.ts.
    // vendor-web-ifc alone is ~3.5 MB (WASM glue), vendor-thatopen ~2 MB,
    // vendor-three ~1.9 MB, and engineLauncher (app init) ~2.6 MB.
    // Raising the limit to 4000 kB acknowledges these as intentionally large;
    // the true network cost is much lower because all vendor chunks are cached
    // long-term (content-hash filenames) and served gzip-compressed.
    chunkSizeWarningLimit: 4000,
    rollupOptions: {
      input: {
        main: 'index.html',
        browser: 'browser.html',
      },
      output: {
        // Split heavy 3rd-party vendors into their own long-lived chunks so:
        //   1. They are downloaded in parallel with the engine bundle (HTTP/2).
        //   2. They are cached across deploys when the engine code changes.
        //   3. The single-blob 12.9 MB EngineBootstrap chunk is broken up.
        // Order matters: more-specific paths must be tested before generic ones
        // (e.g. three-gpu-pathtracer before three, components-front before
        // components). All splits below are vendor-only — application code is
        // left to rollup's default chunking so dynamic imports keep working.
        manualChunks(id: string) {
          // ── Domain-engine SCC group (real workspace paths) ─────────────────
          // @pryzm/core-app-model, @pryzm/geometry-{curtain-wall,door,wall,stair},
          // @pryzm/room-topology, @pryzm/spatial-index, and @pryzm/plugin-annotations
          // form a Strongly Connected Component in the module dependency graph:
          // each package imports from one or more of the others directly or
          // transitively.  Splitting them into separate chunks produces either:
          //   (a) "broken execution order" warnings — barrel (index.ts) lands
          //       in a different chunk from the file it re-exports, or
          //   (b) "Circular chunk: pkg-X → pkg-Y → pkg-X" warnings — Rollup
          //       cannot establish a valid inter-chunk execution order.
          // Grouping ALL SCC members into ONE chunk eliminates both warning
          // classes.  The combined chunk is intentionally ~1.5-2.5 MB; it is
          // served once and cached indefinitely via content-hash filenames.
          // Real-path variants come first (pnpm resolves workspace packages
          // through their real source tree as well as via node_modules symlinks).
          if (id.includes('/packages/core-app-model/'))         return 'domain-engine';
          if (id.includes('/packages/geometry-curtain-wall/'))  return 'domain-engine';
          if (id.includes('/packages/geometry-door/'))          return 'domain-engine';
          if (id.includes('/packages/geometry-wall/'))          return 'domain-engine';
          if (id.includes('/packages/room-topology/'))          return 'domain-engine';
          if (id.includes('/packages/spatial-index/'))          return 'domain-engine';
          if (id.includes('/packages/geometry-stair/'))         return 'domain-engine';
          if (id.includes('/plugins/annotations/'))             return 'domain-engine';

          if (!id.includes('node_modules')) return undefined;

          // ── Domain-engine SCC group (node_modules symlink variants) ────────
          if (
            id.includes('@pryzm/core-app-model')        ||
            id.includes('@pryzm/geometry-curtain-wall') ||
            id.includes('@pryzm/geometry-door')         ||
            id.includes('@pryzm/geometry-wall')         ||
            id.includes('@pryzm/room-topology')         ||
            id.includes('@pryzm/spatial-index')         ||
            id.includes('@pryzm/geometry-stair')        ||
            id.includes('plugin-annotations')
          ) return 'domain-engine';

          // @pryzm/frame-scheduler workspace package — pinned to a single shared
          // chunk to prevent the FrameScheduler singleton from being duplicated
          // across the engineLauncher dynamic-import chunk boundary.
          // Two instances cause wakeIfStopped() to be inert (adapter === null)
          // → _drainBuildQueue never fires → signalBuildQueueDrained never called
          // → storeEventBus stuck at depth 1 → UI frozen.
          if (id.includes('@pryzm/frame-scheduler')) return 'runtime-frame-scheduler';

          // Cesium — globe / geospatial; only loaded when the geospatial
          // viewport is opened. Largest singular dependency.
          if (id.includes('node_modules/cesium/')) return 'vendor-cesium';

          // web-ifc — IFC importer WASM glue.
          if (id.includes('node_modules/web-ifc/')) return 'vendor-web-ifc';

          // @thatopen suite — BIM components built on top of three.
          if (id.includes('node_modules/@thatopen/')) return 'vendor-thatopen';

          // three-gpu-pathtracer — only loaded by PhotorealisticRenderer /
          // ViewportPathTracer when the user enables path tracing.
          if (id.includes('node_modules/three-gpu-pathtracer/')) return 'vendor-pathtracer';

          // three-mesh-bvh — accelerated raycasting; used everywhere three is.
          if (id.includes('node_modules/three-mesh-bvh/')) return 'vendor-three-bvh';

          // three core + examples (TransformControls, RGBELoader, postprocessing,
          // tsl, webgpu builds, etc.). Must come AFTER pathtracer / bvh splits.
          if (id.includes('node_modules/three/')) return 'vendor-three';

          // PDF / export pipeline — opened only from export panels.
          //
          // NOTE (Contract 47 §9.5): we DO NOT manualChunk jspdf / svg2pdf.js /
          // html2canvas. Doing so caused Rollup to co-locate Vite's
          // `__vitePreload` runtime helper inside `vendor-jspdf` (because
          // jspdf has its own internal dynamic import for html2canvas), which
          // then forced ~17 unrelated chunks (OutlinePass, SSGIPass,
          // ViewportPathTracer, our commands, etc.) to statically import
          // `vendor-jspdf` JUST to get that helper — pulling 477 KB of jspdf
          // into the eager startup graph. Letting Rollup pick the natural
          // chunk groups jspdf+svg2pdf+html2canvas with their only real
          // consumer (`PdfExportService`, dynamically imported from
          // `initUI.ts`), so they fetch only when the user exports a PDF.
          if (id.includes('node_modules/pdfjs-dist/')) return 'vendor-pdfjs';

          // CAD interop — DXF/3DM/IFC parsers used by Import dialogs only.
          if (id.includes('node_modules/dxf/'))      return 'vendor-dxf';
          if (id.includes('node_modules/rhino3dm/')) return 'vendor-rhino3dm';

          // Charting — Data Workbench / schedules.
          if (id.includes('node_modules/chart.js/')) return 'vendor-chart';

          // core-js — entire package stubbed by stubCoreJsForEsnextPlugin() so
          // this branch is never reached; kept as a defensive no-op comment.

          return undefined;
        },
      },

      // Tree-shake config — keep module-level side effects for app code but
      // skip side-effect analysis for external (node_modules) packages that
      // have no sideEffects annotation. Reduces the Rollup link-phase graph
      // walk and peak heap without sacrificing application code correctness.
      // Combined with stubCoreJsForEsnextPlugin(), this eliminates most of
      // the node_modules-polyfill overhead during production bundling.
      treeshake: {
        moduleSideEffects: (id, external) => {
          // Treat node_modules as side-effect-free unless they have a package
          // sideEffects field that Rollup should respect.  Application code
          // (src/, plugins/, packages/) is always checked for side effects.
          if (external) return false;
          if (id.includes('node_modules/')) return false;
          return true;
        },
      },
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5000,
    allowedHosts: true,
    // PERF-FIX (2026-05-01): Exclude pnpm store and node_modules from the
    // Vite/chokidar file watcher.  On monorepos with 118 workspace packages
    // the watcher was trying to watch the entire pnpm content-addressable store
    // (~200k+ files), exhausting the Linux inotify limit and crashing with
    // "ENOSPC: System limit for number of file watchers reached".
    // Only source files and public/ assets need to be watched for HMR.
    watch: {
      ignored: [
        '**/.local/share/pnpm/**',
        '**/node_modules/**',
        '**/.git/**',
      ],
    },
    hmr: replitDevDomain
      ? {
          protocol: 'wss',
          host: replitDevDomain,
          clientPort: 443,
        }
      : undefined,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'credentialless',
    },
    // H8 (07-BIM-SECURITY-CONTRACT §1): The Vite-level proxy to api.anthropic.com
    // has been removed. All AI requests MUST flow through the Express server's
    // /api/anthropic/v1/messages route which applies authMiddleware, rate limiting,
    // and server-side quota enforcement before forwarding to Anthropic.
    // When running via `node server.js`, Vite runs in middlewareMode and this proxy
    // section was already inactive — its removal prevents it from activating if
    // someone runs `vite dev` directly.
  },
  resolve: {
    alias: {
      zod: zodV4Path,
      '@pryzm/renderer-three/three': 'three',
      '@app/ui': resolve('./apps/editor/src/ui'),
      '@app/engine': resolve('./apps/editor/src/engine'),
      '@app/rendering': resolve('./apps/editor/src/rendering'),
    },
    dedupe: ['zod'],
  },
  optimizeDeps: {
    exclude: ['web-ifc', 'three', '@pryzm/renderer-three/three'],
    include: ['svg2pdf.js'],
  },
  preview: {
    allowedHosts: true,
    host: '0.0.0.0',
    port: 5000
  }
});
