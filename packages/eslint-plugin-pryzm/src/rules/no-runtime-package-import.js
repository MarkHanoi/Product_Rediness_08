// pryzm/no-runtime-package-import
//
// SPRINT: Z.4 of PRYZM2-WIREUP-PLAN-S72 §26.1 — pre-flight verification harness.
//
// CONTRACT: only the composition root (`src/main.ts` and the `apps/editor/`
// boot path) may import `@pryzm/runtime-composer` directly. Every other
// `src/ui/` and panel module must receive the typed `runtime` handle via
// constructor injection (Phase B widening) and reach the runtime through
// `this.runtime.<slot>`. Importing `@pryzm/runtime-composer` from a panel
// is the canonical "I bypassed Phase B" anti-pattern.
//
// SCAFFOLD BEHAVIOUR (Z.4): WARN-mode in `src/ui/` per §26.1. Reports
// `ImportDeclaration` nodes whose `source.value` is `@pryzm/runtime-composer`
// (or starts with `@pryzm/runtime-composer/`) when the file lives under
// `src/ui/`.  Phase H flips to ERROR after the baseline empties.
//
// EXEMPT: `src/main.ts`, `src/main-pryzm2.ts` (composition root callers).

import path from 'node:path';

const UI_FRAGMENT = path.join('src', 'ui');
const COMPOSER_PKG = '@pryzm/runtime-composer';
const EXEMPT_FILES = new Set([
  'src/main.ts',
  'src/main-pryzm2.ts',
]);

function normalisePath(filename) {
  if (!filename) return '';
  return filename.split(path.sep).join('/');
}

function relativeToCwd(filename) {
  const norm = normalisePath(filename);
  const cwd = process.cwd().split(path.sep).join('/') + '/';
  return norm.startsWith(cwd) ? norm.slice(cwd.length) : norm;
}

function isInUiFolder(filename) {
  return normalisePath(filename).includes('src/ui/');
}

function isExempt(filename) {
  const rel = relativeToCwd(filename);
  return EXEMPT_FILES.has(rel);
}

function importsComposer(source) {
  if (!source || typeof source !== 'string') return false;
  return source === COMPOSER_PKG || source.startsWith(COMPOSER_PKG + '/');
}

const rule = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Block direct imports of `@pryzm/runtime-composer` from `src/ui/`. Panels must receive the typed `runtime` handle via constructor injection (Phase B widening) and reach slots through `this.runtime.<slot>`.',
      category: 'Architecture',
    },
    schema: [],
    messages: {
      forbidden:
        'Direct import of `@pryzm/runtime-composer` from `src/ui/` is forbidden. Receive `runtime: PryzmRuntime` via the panel constructor (Phase B contract) and reach slots through `this.runtime.<slot>`. See PRYZM2-WIREUP-PLAN-S72 §16.2.',
    },
  },
  create(context) {
    const filename = context.filename ?? context.getFilename();
    if (!isInUiFolder(filename)) return {};
    if (isExempt(filename)) return {};

    return {
      ImportDeclaration(node) {
        if (!importsComposer(node.source && node.source.value)) return;
        context.report({ node, messageId: 'forbidden' });
      },
      // Also catch dynamic `await import('@pryzm/runtime-composer')`
      ImportExpression(node) {
        const arg = node.source;
        if (!arg || arg.type !== 'Literal') return;
        if (!importsComposer(arg.value)) return;
        context.report({ node, messageId: 'forbidden' });
      },
    };
  },
};

export default rule;
export { COMPOSER_PKG, UI_FRAGMENT, EXEMPT_FILES };
