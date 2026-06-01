// pryzm/no-l7-direct-import
//
// SPRINT: Wave 4 Track B PR 4.B.3 — boundary lint turns on for L7.
//
// CONTRACT: L7 plugin packages (`packages/plugin-*`) may only import from
// L6 (`@pryzm/sdk`, the SDK facade — Phase F).  Importing L0–L5 packages
// directly couples the plugin to the engine internals and prevents the SDK
// abstraction layer from providing stable versioned APIs.
//
// Architecture:
//   L0 — types/protocol   (@pryzm/protocol)
//   L1 — stores           (@pryzm/stores)
//   L2 — bus              (@pryzm/command-bus)
//   L3 — state            (@pryzm/view-state, @pryzm/scene-committer)
//   L4 — composer         (@pryzm/runtime-composer)
//   L5 — engine adapters  (@pryzm/renderer, @pryzm/renderer-three,
//                          @pryzm/frame-scheduler, @pryzm/physics-host,
//                          @pryzm/input-host, @pryzm/picking,
//                          @pryzm/sync-client, @pryzm/ai-host,
//                          @pryzm/persistence-client, @pryzm/runtime-undo-stack)
//   L6 — SDK facade       (@pryzm/sdk — Phase F, not yet shipped)
//   L7 — plugins          (packages/plugin-*)
//
// TRANSITIONAL ALLOWLIST (Wave 4 Track B — 5 entries):
//   The 5 production plugin packages below are grandfathered until Phase F
//   ships `@pryzm/sdk`.  Files in these packages get a WARN (not ERROR) when
//   they import L0–L5 directly.  The allowlist is frozen at 5 entries; the
//   `.ga-gate/baselines/l7-allowlist-size.json` baseline file records this
//   count and a CI check blocks any PR that increases it.
//
//   Adding a new entry to TRANSITIONAL_ALLOWLIST without updating the
//   baseline and getting explicit approval is a merge-time violation.
//
// SCAFFOLD BEHAVIOUR:
//   * Files in TRANSITIONAL_ALLOWLIST packages → WARN (future: → ERROR after
//     Phase F `@pryzm/sdk` ships and the plugins migrate).
//   * All other `packages/plugin-*` files → ERROR immediately.
//
// CURRENT VIOLATIONS: 0.  All 5 production plugins are stubs (no `@pryzm/*`
// imports); the rule runs in guard mode to prevent future regressions.

import path from 'node:path';

// ── L7 detection ────────────────────────────────────────────────────────────

/** Packages that live in `packages/plugin-*` are L7. */
const L7_PACKAGE_PREFIX = 'packages/plugin-';

/** Files in these packages get WARN rather than ERROR until `@pryzm/sdk`
 *  (Phase F) ships and the plugins migrate away from L0-L5 direct imports.
 *  FROZEN — no new entries without updating `.ga-gate/baselines/l7-allowlist-size.json`
 *  and getting explicit architectural approval. */
const TRANSITIONAL_ALLOWLIST = new Set([
  'packages/plugin-bcf',
  'packages/plugin-ifc-export',
  'packages/plugin-ifc-import',
  'packages/plugin-ifc-inspector',
  'packages/plugin-rhino-import',
]);

/** `@pryzm/sdk` is the intended L6 facade — allowed even from L7.
 *  Not yet shipped (Phase F); the set is pre-declared so the rule
 *  stays correct once it ships without a code change. */
const L6_ALLOWED = new Set([
  '@pryzm/sdk',
]);

/** All `@pryzm/*` packages that are NOT L6.  L7 plugins must not import
 *  these directly.  The list is exhaustive as of Wave 4; new packages
 *  added to `packages/` are automatically caught because the rule flags
 *  ANY `@pryzm/*` import that isn't in L6_ALLOWED. */
const L0_TO_L5_PREFIXES = [
  '@pryzm/',
];

// ── helpers ──────────────────────────────────────────────────────────────────

function normalisePath(p) {
  if (!p) return '';
  return p.split(path.sep).join('/');
}

/** Returns true when the file lives under a `packages/plugin-*` directory. */
function isL7Plugin(filename) {
  const norm = normalisePath(filename);
  // Match both absolute (`/home/runner/workspace/packages/plugin-foo/src/bar.ts`)
  // and relative (`packages/plugin-foo/src/bar.ts`) forms.
  return (
    norm.includes('/' + L7_PACKAGE_PREFIX) ||
    norm.startsWith(L7_PACKAGE_PREFIX)
  );
}

/** Returns the `packages/plugin-<name>` prefix for the file, or null. */
function pluginPackageKey(filename) {
  const norm = normalisePath(filename);
  const marker = '/' + L7_PACKAGE_PREFIX;
  const idx = norm.lastIndexOf(marker);
  if (idx < 0 && !norm.startsWith(L7_PACKAGE_PREFIX)) return null;
  const after = idx >= 0 ? norm.slice(idx + 1) : norm;
  // `after` = `packages/plugin-<name>/src/bar.ts`
  const secondSlash = after.indexOf('/', 'packages/'.length);
  if (secondSlash < 0) return null;
  return after.slice(0, secondSlash); // `packages/plugin-<name>`
}

/** Returns true when the import source is a forbidden L0-L5 `@pryzm/*` package. */
function isForbiddenImport(source) {
  if (!source || typeof source !== 'string') return false;
  // Allow the L6 SDK facade (not yet shipped; future-proof allowance).
  if (L6_ALLOWED.has(source)) return false;
  const stripped = source.split('/')[0] + (source.includes('/') ? '/' + source.split('/').slice(1).join('/') : '');
  // Flag any @pryzm/* import that isn't in L6_ALLOWED.
  return L0_TO_L5_PREFIXES.some(
    (prefix) => source === prefix.slice(0, -1) || source.startsWith(prefix),
  );
}

// ── rule ─────────────────────────────────────────────────────────────────────

const rule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'L7 plugin packages (`packages/plugin-*`) must not import L0–L5 `@pryzm/*` packages directly. ' +
        'Route through `@pryzm/sdk` (Phase F). ' +
        'See `docs/archive/pryzm3-internal/04-PLAN-FORWARD/08-WAVE-4-SLOT-TYPING-ROUTING.md §3` PR 4.B.3.',
      category: 'Architecture',
    },
    schema: [],
    messages: {
      forbidden:
        "L7 plugin '{{pkg}}' must not import '{{source}}' (L0–L5) directly. " +
        'Route through `@pryzm/sdk` once Phase F ships. ' +
        'See 08-WAVE-4-SLOT-TYPING-ROUTING.md §3 PR 4.B.3.',
      transitional:
        "[transitional allowlist] '{{pkg}}' imports '{{source}}' (L0–L5) directly. " +
        'This is grandfathered until `@pryzm/sdk` (Phase F) ships. ' +
        'Do not add new direct L0–L5 imports to this plugin.',
    },
  },

  create(context) {
    const filename = context.filename ?? context.getFilename();
    if (!isL7Plugin(filename)) return {};

    const pkg = pluginPackageKey(filename);

    function checkImport(source, node) {
      if (!isForbiddenImport(source)) return;
      const inAllowlist = pkg !== null && TRANSITIONAL_ALLOWLIST.has(pkg);
      context.report({
        node,
        messageId: inAllowlist ? 'transitional' : 'forbidden',
        data: { pkg: pkg ?? '(unknown)', source },
      });
    }

    return {
      ImportDeclaration(node) {
        checkImport(node.source?.value, node);
      },
      ImportExpression(node) {
        if (node.source?.type !== 'Literal') return;
        checkImport(node.source.value, node);
      },
    };
  },
};

export default rule;
export { TRANSITIONAL_ALLOWLIST, L6_ALLOWED, isL7Plugin, pluginPackageKey, isForbiddenImport };
