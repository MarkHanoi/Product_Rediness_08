// pryzm/no-l7-boundary-violation
//
// PR 4.B.3 — Wave 4 Track B boundary lint for L7.
//
// CONTRACT (from docs/archive/pryzm3-internal/02-ARCHITECTURE.md §3 + §7 layer matrix):
//   L7 plugin packages (`plugins/<name>/`) may ONLY import from the public
//   plugin SDK surface (`@pryzm/plugin-sdk`). Importing L0–L5 packages
//   directly bypasses the abstraction layer and prevents Phase F from
//   adding signing, sandboxing, and permission gating between the runtime
//   and plugin code.
//
// SCAFFOLD BEHAVIOUR (PR 4.B.3): WARN-mode for all currently violating
//   files (253 src/ files baseline; see `.ga-gate/baselines/l7-boundary-violations.json`).
//   The `pnpm ga-gate --check boundary-lint-l7` size-ratchet blocks any
//   GROWTH in violation count. Phase F.1 flips to ERROR after each plugin
//   migrates to `@pryzm/plugin-sdk` and its count reaches 0.
//
// EXEMPT: `@pryzm/plugin-sdk` itself (the L6 bridge), and any purely
//   type-level imports (TypeScript `import type`) — type erasure means
//   they leave no runtime boundary violation.
//
// MIGRATION: replace `@pryzm/runtime-composer` usage with the equivalent
//   `@pryzm/plugin-sdk` host proxy (see `packages/plugin-sdk/src/hosts/`).
//   For command dispatch use the `CommandHost` proxy; for view registration
//   use `ViewRegistryHost`; for frame scheduling use `FrameHost`.
//   See docs/archive/pryzm3-internal/04-PLAN-FORWARD/10-WAVE-6-CONVERGENCE.md §2.

import path from 'node:path';

// Packages that L7 plugin code should NOT import directly.
// These are L0–L5 runtime-internal packages; all external surface lives in
// @pryzm/plugin-sdk (L6).
const BLOCKED_PKGS = new Set([
  '@pryzm/runtime-composer',
  '@pryzm/command-bus',
  '@pryzm/event-bus',
  '@pryzm/frame-scheduler',
  '@pryzm/renderer',
  '@pryzm/renderer-three',
  '@pryzm/scene-committer',
  '@pryzm/sync-client',
  '@pryzm/visibility',
  '@pryzm/persistence-client',
  '@pryzm/input-host',
  '@pryzm/physics-host',
  '@pryzm/picking',
  '@pryzm/render-runtime',
  '@pryzm/runtime-undo-stack',
  '@pryzm/view-state',
  '@pryzm/stores',
]);

// Test / fixture globs that are exempt from this rule.
const EXEMPT_FRAGMENTS = ['/__tests__/', '.test.', '.spec.'];

function normalise(p) {
  if (!p) return '';
  return p.split(path.sep).join('/');
}

/**
 * Returns true if the file lives under `plugins/<name>/src/` and is not a
 * test file.  Files under `plugins/<name>/__tests__/` or matching `*.test.*`
 * are intentionally exempt (test infrastructure may need raw L0-L5 access to
 * build mock runtimes).
 */
function isPluginSrcFile(filename) {
  const norm = normalise(filename);
  if (EXEMPT_FRAGMENTS.some((f) => norm.includes(f))) return false;
  // Match  plugins/<name>/src/  anywhere in the normalised path.
  return /\/plugins\/[^/]+\/src\//.test(norm) || /^plugins\/[^/]+\/src\//.test(norm);
}

/**
 * Returns true if `source` is a blocked L0–L5 @pryzm/* package.
 * We match on the package name (the part before any trailing `/subpath`).
 */
function isBlockedImport(source) {
  if (!source || !source.startsWith('@pryzm/')) return false;
  const slash = source.indexOf('/', '@pryzm/'.length);
  const pkgName = slash === -1 ? source : source.slice(0, slash);
  return BLOCKED_PKGS.has(pkgName);
}

const rule = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Block L7 plugin packages from importing L0–L5 runtime internals directly. ' +
        'Plugins must consume the runtime via `@pryzm/plugin-sdk` host proxies. ' +
        'See docs/archive/pryzm3-internal/04-PLAN-FORWARD/08-WAVE-4-SLOT-TYPING-ROUTING.md §3 PR 4.B.3.',
      category: 'Architecture',
    },
    schema: [],
    messages: {
      forbidden:
        '`{{pkg}}` is an L0–L5 runtime-internal package. ' +
        'L7 plugin code must use `@pryzm/plugin-sdk` host proxies instead. ' +
        'See `packages/plugin-sdk/src/hosts/` for the available host proxies. ' +
        'Phase F will enforce this as ERROR once your plugin has migrated.',
    },
  },
  create(context) {
    const filename = context.filename ?? context.getFilename?.() ?? '';
    if (!isPluginSrcFile(filename)) return {};

    function check(node, source) {
      if (!isBlockedImport(source)) return;
      const slash = source.indexOf('/', '@pryzm/'.length);
      const pkg = slash === -1 ? source : source.slice(0, slash);
      context.report({ node, messageId: 'forbidden', data: { pkg } });
    }

    return {
      ImportDeclaration(node) {
        // Type-only imports are erased at compile time — no runtime boundary
        // violation; exempt them so `import type { Foo } from '@pryzm/...'`
        // is allowed (the type lives in the compiled output of the L0 package
        // anyway, not at runtime).
        if (node.importKind === 'type') return;
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
export { BLOCKED_PKGS, isPluginSrcFile, isBlockedImport };
