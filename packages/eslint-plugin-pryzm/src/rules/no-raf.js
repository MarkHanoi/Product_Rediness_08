// @pryzm/no-raf — block any `requestAnimationFrame(` outside the
// `packages/frame-scheduler/` directory.  Enforces the L5 invariant that
// the scheduler owns the single rAF pump for the entire app.
//
// Pairs with ADR-003 (priority queue) and ADR-006 (idle 30-frame budget).

import path from 'node:path';

const SCHEDULER_FRAGMENT = path.join('packages', 'frame-scheduler');

function isInsideScheduler(filename) {
  if (!filename) return false;
  // Normalise Windows paths and check for the substring; this is robust
  // against the rule running from any cwd.
  const norm = filename.split(path.sep).join('/');
  return norm.includes('packages/frame-scheduler/');
}

const rule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Block `requestAnimationFrame` (and the `window.requestAnimationFrame`/`globalThis.requestAnimationFrame` forms) outside `packages/frame-scheduler/`.  Only the L5 scheduler may pump rAF.',
      category: 'Architecture',
    },
    schema: [],
    messages: {
      forbidden:
        '`requestAnimationFrame` is forbidden outside `packages/frame-scheduler/` (L5 scheduler owns the single rAF pump).  See ADR-003.',
    },
  },
  create(context) {
    const filename = context.filename ?? context.getFilename();
    if (isInsideScheduler(filename)) return {};

    function checkCallee(node) {
      // bare `requestAnimationFrame(...)`
      if (node.callee.type === 'Identifier' && node.callee.name === 'requestAnimationFrame') {
        context.report({ node, messageId: 'forbidden' });
        return;
      }
      // `<root>.requestAnimationFrame(...)` for window/globalThis/self
      if (
        node.callee.type === 'MemberExpression' &&
        node.callee.property &&
        node.callee.property.type === 'Identifier' &&
        node.callee.property.name === 'requestAnimationFrame'
      ) {
        const obj = node.callee.object;
        if (
          obj &&
          obj.type === 'Identifier' &&
          (obj.name === 'window' || obj.name === 'globalThis' || obj.name === 'self')
        ) {
          context.report({ node, messageId: 'forbidden' });
        }
      }
    }

    return {
      CallExpression: checkCallee,
    };
  },
};

// Silence "unused" lint for the path-fragment constant — kept for documentation
// and to make the rule self-describing.
void SCHEDULER_FRAGMENT;

export default rule;
