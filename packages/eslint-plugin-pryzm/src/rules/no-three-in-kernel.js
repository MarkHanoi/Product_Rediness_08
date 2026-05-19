// pryzm/no-three-in-kernel
//
// SPRINT: scaffolded in S01, real enforcement lands in S08 once
// `packages/geometry-kernel/` exists per
// `phases/PHASE-1B-Q2-M4-M6-WALL-END-TO-END.md §S07 D3`.
//
// CONTRACT (P1 from `01-TARGET-ARCHITECTURE.md §0`):
//   "Domain is pure.  No `THREE`, no `OBC`, no DOM, no `window` reads.
//    Runs in Node and the browser unchanged."
//
// The geometry kernel is the most-tested expression of P1 — it must run
// byte-identically in browser worker, Node worker_thread and the bake
// service.  Any THREE / OBC import inside `packages/geometry-kernel/**`
// breaks the kernel-purity claim.
//
// SCAFFOLD BEHAVIOUR (S01): the rule blocks `import` statements (and
// dynamic `import(...)`) that resolve to `three`, `three/*`, `@thatopen/*`
// (OBC), or `web-ifc*`, when the source file lives under
// `packages/geometry-kernel/`.  Outside the kernel the rule is a no-op.

// Each entry is matched as: exact-equal OR begins-with-`<entry>/` OR
// (when the entry ends in `/`) begins-with-`<entry>` directly.
const FORBIDDEN_PACKAGES = ['three', '@thatopen/components', '@thatopen/components-front', 'web-ifc'];
const FORBIDDEN_SCOPES = ['@thatopen/'];

function isInsideKernel(filename) {
  if (!filename) return false;
  const norm = filename.replace(/\\/g, '/');
  return norm.includes('/packages/geometry-kernel/');
}

function isForbidden(value) {
  if (typeof value !== 'string') return false;
  for (const pkg of FORBIDDEN_PACKAGES) {
    if (value === pkg) return true;
    if (value.startsWith(pkg + '/')) return true;
  }
  for (const scope of FORBIDDEN_SCOPES) {
    if (value.startsWith(scope)) return true;
  }
  return false;
}

/** @type {import('eslint').Rule.RuleModule} */
const rule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Forbid THREE / OBC / web-ifc imports inside packages/geometry-kernel/** to preserve P1 (kernel purity).',
    },
    schema: [],
    messages: {
      forbidden:
        'P1 violation — `{{source}}` is forbidden inside packages/geometry-kernel/. ' +
        'The kernel must run identically in browser worker AND Node. ' +
        'Move THREE-touching code to packages/scene-committer/ or plugins/<name>/committer.ts.',
    },
  },

  create(context) {
    const filename = context.filename ?? context.getFilename?.() ?? '';
    if (!isInsideKernel(filename)) {
      return {};
    }

    function checkLiteral(node, source) {
      if (isForbidden(source)) {
        context.report({ node, messageId: 'forbidden', data: { source } });
      }
    }

    return {
      ImportDeclaration(node) {
        checkLiteral(node, node.source.value);
      },
      ImportExpression(node) {
        if (node.source && node.source.type === 'Literal') {
          checkLiteral(node, node.source.value);
        }
      },
      CallExpression(node) {
        if (
          node.callee &&
          node.callee.type === 'Identifier' &&
          node.callee.name === 'require' &&
          node.arguments.length > 0 &&
          node.arguments[0].type === 'Literal'
        ) {
          checkLiteral(node, node.arguments[0].value);
        }
      },
    };
  },
};

export default rule;
