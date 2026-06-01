// @pryzm/no-three-outside-committer — block direct three imports outside the
// sole authorised owner (`packages/renderer-three/`).
//
// Spec: `phases/PHASE-1A-Q1-M1-M3-SKELETON-RAILS.md` §S04 Track B
// (line 442): "lint rule scaffold pryzm/no-three-outside-committer".
//
// Wave A15 update (2026-05-03):
//   • `packages/renderer/` removed from ALLOW_FRAGMENTS — all violations
//     in that package have been closed (see §11 Wave A15 S120).
//   • `packages/renderer-three/` does NOT need to be in ALLOW_FRAGMENTS:
//     its files use `export { X } from 'three/...'` (ExportDeclaration),
//     not `import … from 'three/...'` (ImportDeclaration), so the rule
//     never triggers on them.
//   • `isThreeSpecifier` already correctly catches sub-paths via
//     `value.startsWith('three/')`, covering Class A1 (three/examples/jsm/…)
//     and Class A2 (three/tsl) violations as well as bare 'three'.
//
// Rules:
//   • HARD-FAIL on packages/* and apps/* (PRYZM 2) outside the allowlist.
//   • WARN-ONLY on src/** (PRYZM 1) — surfaces existing call sites in
//     editors without breaking the legacy build.
//   • ALLOWLIST (no diagnostic):
//        packages/scene-committer/**   (L5 scene committer — writes to THREE scene)
//        plugins/*/committer.ts        (per-plugin THREE-touching files)
//        plugins/*/committer/**        (committer module folder)
//        plugins/*/__tests__/**        (plugin test fixtures)
//        packages/*/__tests__/**       (test fixtures may import THREE)
//        apps/bench/**                 (bench harness uses THREE for fixtures)
//
// Pairs with ADR-005 (PrimitiveCommitter interface) — only L5 committers
// may speak to the THREE scene graph directly.  All other consumers use
// '@pryzm/renderer-three' (barrel) or '@pryzm/renderer-three/three'
// (THREE namespace sub-path).

import path from 'node:path';

const ALLOW_FRAGMENTS = [
  'packages/scene-committer/',
  'apps/bench/',
];

function normalise(filename) {
  if (!filename) return '';
  return filename.split(path.sep).join('/');
}

function isAllowed(filename) {
  const norm = normalise(filename);
  for (const frag of ALLOW_FRAGMENTS) {
    if (norm.includes(frag)) return true;
  }
  // plugins/<name>/committer.ts  — single-file form (plugin root)
  if (/\/plugins\/[^/]+\/committer\.ts$/.test(norm)) return true;
  // plugins/<name>/committer/**  — module-folder form (plugin root)
  if (/\/plugins\/[^/]+\/committer\//.test(norm)) return true;
  // plugins/<name>/src/committer.ts  — single-file form under src/
  if (/\/plugins\/[^/]+\/src\/committer\.ts$/.test(norm)) return true;
  // plugins/<name>/src/committer/**  — module-folder form under src/
  if (/\/plugins\/[^/]+\/src\/committer\//.test(norm)) return true;
  // any package's __tests__ folder
  if (/\/__tests__\//.test(norm)) return true;
  return false;
}

function isLegacy(filename) {
  return normalise(filename).includes('/src/') &&
         !normalise(filename).includes('/packages/') &&
         !normalise(filename).includes('/apps/') &&
         !normalise(filename).includes('/plugins/') &&
         !normalise(filename).includes('/tools/');
}

function isThreeSpecifier(value) {
  if (typeof value !== 'string') return false;
  // Matches bare 'three', sub-paths 'three/tsl', 'three/examples/jsm/…', etc.
  // Does NOT match '@pryzm/renderer-three' or '@pryzm/renderer-three/three'
  // because those begin with '@pryzm/' — correct P2-compliant paths.
  return value === 'three' || value.startsWith('three/');
}

const rule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Block direct THREE imports (from "three" or "three/*") outside ' +
        'packages/renderer-three/.  All consumers must import from ' +
        '"@pryzm/renderer-three" (barrel) or "@pryzm/renderer-three/three" ' +
        '(THREE namespace sub-path).  See ADR-005 and ' +
        'docs/archive/pryzm3-internal/04-PLAN-FORWARD/11-WAVE-7-CLEANUP-PHASE-F.md §11.',
      category: 'Architecture',
    },
    schema: [],
    messages: {
      forbidden:
        '`{{specifier}}` is a direct three import forbidden outside packages/renderer-three/.  ' +
        'Use `@pryzm/renderer-three` (barrel) or `@pryzm/renderer-three/three`.  See ADR-005.',
      legacyWarn:
        '`{{specifier}}` is a direct three import (legacy `src/` warn-only; tracked for hard-fail).  ' +
        'Use `@pryzm/renderer-three` instead.  See ADR-005.',
    },
  },
  create(context) {
    const filename = context.filename ?? context.getFilename();
    if (isAllowed(filename)) return {};

    const messageId = isLegacy(filename) ? 'legacyWarn' : 'forbidden';

    function checkSource(node, value) {
      if (isThreeSpecifier(value)) {
        context.report({
          node,
          messageId,
          data: { specifier: value },
        });
      }
    }

    return {
      ImportDeclaration(node) {
        checkSource(node, node.source.value);
      },
      // dynamic import: import('three')
      ImportExpression(node) {
        if (node.source && node.source.type === 'Literal') {
          checkSource(node, node.source.value);
        }
      },
      // require('three')
      CallExpression(node) {
        if (
          node.callee &&
          node.callee.type === 'Identifier' &&
          node.callee.name === 'require' &&
          node.arguments &&
          node.arguments.length === 1 &&
          node.arguments[0].type === 'Literal'
        ) {
          checkSource(node, node.arguments[0].value);
        }
      },
    };
  },
};

export default rule;
