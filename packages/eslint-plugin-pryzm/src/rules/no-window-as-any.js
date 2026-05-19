// pryzm/no-window-as-any
//
// SPRINT: scaffolded in S73 (Phase A.7 of
// `docs/00_NEW_ARCHITECTURE/phases/audits/PRYZM2-ENTERPRISE-WIREUP-PLAN-S72.md`
// §16.1 line 1695): "Lint rule armed in WARN mode (1 file = 1 warn).
// Existing 200+ `(window as any).<engine field>` reaches captured in
// `eslint-baseline-window-as-any.json`; the rule blocks NEW reaches
// only.  Phase G.31 flips to ERROR after the baseline empties."
//
// CONTRACT (from S72 §3.2 + ADR-008): every cross-cutting reach into
// the engine MUST go through `runtime.<slot>` (the typed
// `PryzmRuntime` handle from `@pryzm/runtime-composer`).  The
// historical `(window as any).<field>` pattern is an architectural
// shortcut that hides ownership and breaks the L0–L7 layer matrix —
// specifically:
//
//   • `(window as any).platformShell.currentProjectName` — should be
//     `runtime.projectContext.projectName`.
//   • `(window as any).__pryzm2Runtime.bus.executeCommand(...)` —
//     should be `runtime.bus.executeCommand(...)`.
//   • `(window as any).platformShell.setProjectContext(...)` — should
//     be `runtime.projectContext.set({...})`.
//
// SCAFFOLD BEHAVIOUR (S73): the rule reports `MemberExpression` nodes
// of the shape `(window as any).<x>` and `(globalThis as any).<x>`.
// In TypeScript ESTree these surface as `MemberExpression` whose
// `object` is a `TSAsExpression` casting `window` / `globalThis` to
// `any` (or `unknown`).
//
// Phase A is WARN only — every existing reach is captured in
// `eslint-baseline-window-as-any.json` so the build stays green; new
// reaches surface as warnings in the editor.  Phase G.31 (S82-WIRE)
// flips to ERROR after the baseline empties.

const ROOTS = new Set(['window', 'globalThis', 'self']);

function unwrapParens(node) {
  // typescript-eslint exposes TSParenthesizedExpression on some
  // versions; on others, `(x)` is just `x`.  Walk through both.
  while (
    node &&
    (node.type === 'TSParenthesizedExpression' ||
      node.type === 'ChainExpression')
  ) {
    node = node.expression;
  }
  return node;
}

function isAnyOrUnknownTypeAnnotation(typeAnnotation) {
  if (!typeAnnotation) return false;
  if (typeAnnotation.type === 'TSAnyKeyword') return true;
  if (typeAnnotation.type === 'TSUnknownKeyword') return true;
  // `as Record<string, any>` / `as { foo: any }` — wider catch-all is
  // out of scope for the scaffold; pure `any` / `unknown` covers the
  // historical reach pattern.
  return false;
}

function isWindowRoot(expr) {
  const e = unwrapParens(expr);
  if (!e) return false;
  return e.type === 'Identifier' && ROOTS.has(e.name);
}

/** Detect `(window as any).<x>` and `(window as unknown as any).<x>`. */
function isWindowAsAnyAssertion(objectExpr) {
  let cursor = unwrapParens(objectExpr);
  // Walk through chained `as` casts: `window as unknown as any`.
  while (cursor && cursor.type === 'TSAsExpression') {
    if (isAnyOrUnknownTypeAnnotation(cursor.typeAnnotation)) {
      // Found an `as any` (or `as unknown`) somewhere in the chain;
      // recurse into the expression to confirm the root is `window`.
      const innerOk = (() => {
        let inner = unwrapParens(cursor.expression);
        // Peel further nested casts.
        while (inner && inner.type === 'TSAsExpression') {
          inner = unwrapParens(inner.expression);
        }
        return inner && inner.type === 'Identifier' && ROOTS.has(inner.name);
      })();
      if (innerOk) return true;
    }
    cursor = unwrapParens(cursor.expression);
  }
  return false;
}

/** @type {import('eslint').Rule.RuleModule} */
const rule = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        "Forbid `(window as any).<x>` / `(globalThis as any).<x>` reaches into the engine — use the typed `runtime.<slot>` handle from `@pryzm/runtime-composer` instead. Scaffolded in S73 (Phase A.7); Phase G.31 (S82-WIRE) flips to ERROR.",
      category: 'Architecture',
    },
    schema: [],
    messages: {
      forbidden:
        '`({{root}} as any).{{prop}}` is a layer-violation reach into the engine. ' +
        'Use the typed `runtime.<slot>` handle from `@pryzm/runtime-composer` instead. ' +
        'See PRYZM2-ENTERPRISE-WIREUP-PLAN-S72 §3.2 + ADR-008. ' +
        'Phase A.7 (S73-WIRE) is WARN; Phase G.31 (S82-WIRE) flips to ERROR.',
      forbiddenIndexed:
        '`({{root}} as any)[\u2026]` is a layer-violation reach into the engine. ' +
        'Use the typed `runtime.<slot>` handle from `@pryzm/runtime-composer` instead.',
    },
  },

  create(context) {
    return {
      MemberExpression(node) {
        if (!isWindowAsAnyAssertion(node.object)) return;
        // Drill out the original root identifier name for the message.
        let root = unwrapParens(node.object);
        while (root && root.type === 'TSAsExpression') {
          root = unwrapParens(root.expression);
        }
        const rootName = root && root.type === 'Identifier' ? root.name : 'window';

        if (node.computed) {
          context.report({ node, messageId: 'forbiddenIndexed', data: { root: rootName } });
          return;
        }
        const prop =
          node.property && node.property.type === 'Identifier'
            ? node.property.name
            : '?';
        context.report({
          node,
          messageId: 'forbidden',
          data: { root: rootName, prop },
        });
      },
    };
  },
};

export default rule;
