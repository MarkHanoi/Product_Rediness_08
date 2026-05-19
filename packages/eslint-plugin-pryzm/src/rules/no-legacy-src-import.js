// pryzm/no-legacy-src-import
//
// SPRINT: Z.4 of PRYZM2-WIREUP-PLAN-S72 §26.1 — pre-flight verification harness.
//
// CONTRACT: no file under `packages/`, `plugins/`, or `apps/` may import
// from `src/` (the legacy PRYZM 1 tree). Cross-tree imports break the L0–L7
// boundary matrix and prevent Phase G from deleting `src/` cleanly.
//
// Detects relative imports that resolve into `src/` (e.g.
// `../../src/foo`) and absolute aliases like `@/src/foo` (if any) by
// matching path-fragment substrings.
//
// SCAFFOLD BEHAVIOUR (Z.4): ERROR-mode for `packages/`, `plugins/`,
// `apps/` per §26.1 — no current cross-tree imports exist (verified at
// scaffold time), so the rule starts at error to prevent regression.
// `src/` files are NOT subject to this rule (they may import freely
// from `src/`).

import path from 'node:path';

const FORBIDDEN_FRAGMENT = '/src/';
const FORBIDDEN_PREFIX = 'src/';
const PROTECTED_ROOTS = ['packages/', 'plugins/', 'apps/'];

function normalisePath(p) {
  if (!p) return '';
  return p.split(path.sep).join('/');
}

function isInProtectedRoot(filename) {
  const norm = normalisePath(filename);
  return PROTECTED_ROOTS.some((root) => norm.includes('/' + root) || norm.startsWith(root));
}

/**
 * Find the source file's workspace prefix: `packages/<name>/`,
 * `plugins/<name>/`, or `apps/<name>/`.  Returns null if the file is
 * not under one of those roots.  Anchors on the LAST occurrence of
 * the root segment so absolute paths like
 * `/home/runner/workspace/packages/foo/src/bar.ts` are handled too.
 */
function workspacePrefix(filename) {
  const norm = normalisePath(filename);
  for (const root of PROTECTED_ROOTS) {
    const idx = norm.lastIndexOf('/' + root);
    const start = idx >= 0 ? idx + 1 : (norm.startsWith(root) ? 0 : -1);
    if (start < 0) continue;
    // Capture `<root><name>/` (root already ends with `/`).
    const after = norm.slice(start + root.length);
    const slash = after.indexOf('/');
    if (slash < 0) continue;
    return norm.slice(0, start + root.length + slash + 1);
  }
  return null;
}

function looksLikeLegacySrcImport(source, filename) {
  if (!source) return false;
  // Direct alias forms used in some configs:
  //   "@/src/foo", "src/foo", "/src/foo"
  if (source === 'src' || source.startsWith('src/')) return true;
  if (source.startsWith('@/src/') || source.startsWith('/src/')) return true;
  // Relative reach: ../../src/foo  → join against the source filename
  // and check whether the result *escapes* the workspace prefix and
  // lands on a `src/...` segment.  Using path.posix avoids cwd-resolve
  // surprises in unit tests.
  if (!source.startsWith('.')) return false;
  const prefix = workspacePrefix(filename);
  if (!prefix) return false;
  const norm = normalisePath(filename);
  const dir = path.posix.dirname(norm);
  const joined = path.posix.normalize(path.posix.join(dir, source));
  // Still inside the package's own tree → allow.
  if (joined.startsWith(prefix)) return false;
  // Escaped the package; does the remainder land on `src/`?
  // Trim everything up through the LAST occurrence of `/` that
  // sits BEFORE the suspected `/src/` segment, then check for it.
  const srcIdx = joined.lastIndexOf('/src/');
  if (srcIdx >= 0) {
    // Make sure the `/src/` segment isn't inside another workspace
    // module (e.g. an escape into `packages/other/src/`).
    const tail = joined.slice(srcIdx + 1);
    const head = joined.slice(0, srcIdx + 1);
    const escapedIntoOtherWorkspace =
      head.lastIndexOf('/packages/') > head.length - prefix.length - 1 ||
      head.includes('/plugins/') ||
      head.includes('/apps/');
    if (!escapedIntoOtherWorkspace || head.endsWith('/')) {
      // Heuristic: if the tail begins with exactly `src/`, treat as legacy reach.
      if (tail.startsWith('src/')) return true;
    }
  }
  // Also catch the bare endsWith-`/src` case (uncommon).
  if (joined.endsWith('/src') || joined === 'src') return true;
  return false;
}

const rule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Block any file under `packages/`, `plugins/`, or `apps/` from importing the legacy `src/` tree. Cross-tree imports break the L0–L7 boundary matrix and prevent Phase G from deleting `src/` cleanly.',
      category: 'Architecture',
    },
    schema: [],
    messages: {
      forbidden:
        'Importing from the legacy `src/` tree is forbidden inside workspace modules. The `src/` tree is PRYZM 1 legacy; Phase G deletes it. Move the dependency into a `packages/*` workspace (or duplicate the helper there). See PRYZM2-WIREUP-PLAN-S72 §16.4 / §16.7.',
    },
  },
  create(context) {
    const filename = context.filename ?? context.getFilename();
    if (!isInProtectedRoot(filename)) return {};

    return {
      ImportDeclaration(node) {
        const src = node.source && node.source.value;
        if (looksLikeLegacySrcImport(src, filename)) {
          context.report({ node, messageId: 'forbidden' });
        }
      },
      ImportExpression(node) {
        const arg = node.source;
        if (!arg || arg.type !== 'Literal') return;
        if (looksLikeLegacySrcImport(arg.value, filename)) {
          context.report({ node, messageId: 'forbidden' });
        }
      },
    };
  },
};

export default rule;
export {
  FORBIDDEN_PREFIX,
  FORBIDDEN_FRAGMENT,
  PROTECTED_ROOTS,
  looksLikeLegacySrcImport,
};
