// pryzm/no-direct-pryzm-in-plugins
//
// Wave-12 (S98-S100) ERROR-level enforcement rule.
//
// CONTRACT: After Wave 12, all 46 L7 plugin packages are L8-compliant —
// they import ONLY from `@pryzm/plugin-sdk`.  This rule enforces that
// constraint at ERROR level (the WARN-mode `no-l7-boundary-violation`
// ratchet is superseded by this rule post-Wave-12).
//
// Spec: docs/03_PRYZM3/04-PLAN-FORWARD/17-WAVES-9-12-SRC-MIGRATION.md §4
// Architecture: docs/03_PRYZM3/02-ARCHITECTURE.md §3 (L7 boundary rule)
//
// BLOCKED: any `from '@pryzm/<pkg>'` where <pkg> is NOT plugin-sdk,
//   inside any file matching plugins/**/*.ts (src or __tests__).
// ALLOWED: `@pryzm/plugin-sdk` (and any subpath thereof).
//
// NOTE: `import type` declarations are also blocked — type imports from
//   direct L0-L6 packages still create a dev-time dependency on those
//   packages, which conflicts with the L8 compliance requirement that
//   a plugin's package.json lists ONLY `@pryzm/plugin-sdk`.

import path from 'node:path';

// All @pryzm/* packages that are NOT the plugin-sdk are blocked.
// Plugins must receive everything through @pryzm/plugin-sdk.
const ALLOWED_PKGS = new Set([
  '@pryzm/plugin-sdk',
]);

function normalise(p) {
  if (!p) return '';
  return p.split(path.sep).join('/');
}

function isPluginFile(filename) {
  const norm = normalise(filename);
  return /\/plugins\/[^/]+\//.test(norm) || /^plugins\/[^/]+\//.test(norm);
}

function isBlockedImport(source) {
  if (!source || !source.startsWith('@pryzm/')) return false;
  const slash = source.indexOf('/', '@pryzm/'.length);
  const pkgName = slash === -1 ? source : source.slice(0, slash);
  return !ALLOWED_PKGS.has(pkgName);
}

const rule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Block L7 plugin packages from importing any @pryzm/* package except @pryzm/plugin-sdk. ' +
        'Wave-12 L8-compliance rule — all plugins must import ONLY from @pryzm/plugin-sdk. ' +
        'Spec: docs/03_PRYZM3/04-PLAN-FORWARD/17-WAVES-9-12-SRC-MIGRATION.md §4.',
      category: 'Architecture',
    },
    schema: [],
    messages: {
      forbidden:
        '`{{pkg}}` is not allowed in L7 plugin code. ' +
        'Plugins must import ONLY from `@pryzm/plugin-sdk` (Wave-12 L8-compliance). ' +
        'All required symbols are re-exported from `@pryzm/plugin-sdk`. ' +
        'See packages/plugin-sdk/src/index.ts for the full re-export surface.',
    },
  },
  create(context) {
    const filename = context.filename ?? context.getFilename?.() ?? '';
    if (!isPluginFile(filename)) return {};

    function check(node, source) {
      if (!isBlockedImport(source)) return;
      const slash = source.indexOf('/', '@pryzm/'.length);
      const pkg = slash === -1 ? source : source.slice(0, slash);
      context.report({ node, messageId: 'forbidden', data: { pkg } });
    }

    return {
      ImportDeclaration(node) {
        check(node, node.source?.value);
      },
      ImportExpression(node) {
        const arg = node.source;
        if (!arg || arg.type !== 'Literal') return;
        check(node, arg.value);
      },
    };
  },
};

export default rule;
export { isPluginFile, isBlockedImport };
