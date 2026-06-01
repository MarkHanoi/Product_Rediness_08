// pryzm/no-engine-bootstrap-shim — block imports of src/engine/EngineBootstrap
// after D.4.5 (S81-WIRE). Both allowlists are now empty after S86-WIRE close.
//
// S86-WIRE (Wave 7, 2026-04-30 evening): src/main.ts redirected its dynamic
// import to './engine/engineLauncher'. EngineBootstrap.ts is now a ≤35 LOC
// type-alias shim. Boolean #5 (`EngineBootstrap_LOC == 0`) → ✅.
//
// The rule remains active post-S86-WIRE to block any regression attempt
// (no code should start importing the shim now that the real module is gone).
// Both staticFiles and dynamicFiles allowlists are [] — zero tolerance.
//
// Next (S87-WIRE): once EngineBootstrap.ts is deleted entirely, this rule is
// removed (there is no file left to import).
//
// Allowlist: dynamically loaded from `.ga-gate/baselines/engine-bootstrap-importers.json`
// (updated at S86-WIRE to empty; dynamicImporterCount = 0).
//
// Anchored to: `docs/archive/pryzm3-internal/04-PLAN-FORWARD/01-CRITICAL-PATH-D4.md §7`
//              `docs/archive/pryzm3-internal/04-PLAN-FORWARD/11-WAVE-7-CLEANUP-PHASE-F.md §2` S86-WIRE

import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadAllowlist() {
  try {
    const p = path.resolve(__dirname, '../../../../.ga-gate/baselines/engine-bootstrap-importers.json');
    const json = JSON.parse(readFileSync(p, 'utf8'));
    const staticFiles = new Set((json.files ?? []).map((f) => path.normalize(f)));
    const dynamicFiles = new Set((json.dynamicImporters ?? []).map((f) => path.normalize(f)));
    return { staticFiles, dynamicFiles };
  } catch {
    return { staticFiles: new Set(), dynamicFiles: new Set() };
  }
}

const ALLOWLIST = loadAllowlist();

function isEngineBootstrapPath(value) {
  if (typeof value !== 'string') return false;
  const norm = value.split('/').join(path.sep);
  return norm.endsWith(path.join('engine', 'EngineBootstrap')) ||
         norm.endsWith(path.join('engine', 'EngineBootstrap.ts')) ||
         norm.endsWith(path.join('engine', 'EngineBootstrap.js'));
}

function relativeToCwd(filename) {
  if (!filename) return '';
  try {
    return path.relative(process.cwd(), filename);
  } catch {
    return filename;
  }
}

const rule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Block new imports of `src/engine/EngineBootstrap` after D.4.5 (S81-WIRE). ' +
        'Use `import type { PryzmRuntime } from "@pryzm/runtime-composer"` instead. ' +
        'See `docs/archive/pryzm3-internal/04-PLAN-FORWARD/01-CRITICAL-PATH-D4.md §7`.',
      category: 'Architecture',
    },
    schema: [],
    messages: {
      forbidden:
        'Importing from `src/engine/EngineBootstrap` is forbidden after D.4.5 (S81-WIRE). ' +
        'Use `import type { PryzmRuntime } from "@pryzm/runtime-composer"` instead. ' +
        'See `01-CRITICAL-PATH-D4.md §7`.',
      forbiddenDynamic:
        'Dynamic import of `src/engine/EngineBootstrap` is forbidden after D.4.5 (S81-WIRE). ' +
        'The engine init path must go through `composeRuntime()` from `@pryzm/runtime-composer`. ' +
        'See `01-CRITICAL-PATH-D4.md §7`.',
    },
  },

  create(context) {
    const filename = context.filename ?? context.getFilename?.() ?? '';
    const rel = relativeToCwd(filename);

    return {
      ImportDeclaration(node) {
        const src = node.source.value;
        if (!isEngineBootstrapPath(src)) return;
        if (ALLOWLIST.staticFiles.has(path.normalize(rel))) return;
        context.report({ node, messageId: 'forbidden' });
      },

      ImportExpression(node) {
        const arg = node.source;
        if (!arg) return;
        const value = arg.type === 'Literal' ? arg.value : null;
        if (!isEngineBootstrapPath(value)) return;
        if (ALLOWLIST.dynamicFiles.has(path.normalize(rel))) return;
        context.report({ node, messageId: 'forbiddenDynamic' });
      },
    };
  },
};

export default rule;
