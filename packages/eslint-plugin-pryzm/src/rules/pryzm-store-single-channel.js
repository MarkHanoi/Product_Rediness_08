// pryzm/store-single-channel
//
// SPRINT: W-1A-1 per `phases/PHASE-1C-Q3-M7-M9-ELEMENT-FAMILIES.md`
// completion-plan §W-1A.
//
// CONTRACT: every class that implements `CommandHandler` in a handler
// file must list AT MOST ONE store in its `affectedStores` array.
// Cross-store mutations must be composed at the orchestration layer
// (plugin-host cascade), not inside a single handler.
//
// Applied at ERROR level to `plugins/**/handlers/**/*.ts`.

/** @type {import('eslint').Rule.RuleModule} */
const rule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'CommandHandler classes must list at most one store in `affectedStores`. ' +
        'Cross-store mutations belong in the orchestration (cascade) layer.',
    },
    schema: [],
    messages: {
      multiChannel:
        '{{name}} lists {{count}} stores in `affectedStores` [{{stores}}]. ' +
        'Each handler may only write to a single store — compose cross-store ' +
        'mutations via plugin-host cascade rules instead.',
    },
  },

  create(context) {
    function classImplementsCommandHandler(node) {
      const implementsList = node.implements ?? [];
      for (const impl of implementsList) {
        const expr = impl.expression ?? impl;
        if (!expr) continue;
        if (expr.type === 'Identifier' && expr.name === 'CommandHandler') return true;
        if (
          expr.type === 'TSTypeReference' &&
          expr.typeName &&
          expr.typeName.type === 'Identifier' &&
          expr.typeName.name === 'CommandHandler'
        ) return true;
      }
      return false;
    }

    function getAffectedStoresLiteral(node) {
      for (const member of node.body.body) {
        if (
          (member.type === 'PropertyDefinition' || member.type === 'TSPropertySignature') &&
          member.key &&
          member.key.type === 'Identifier' &&
          member.key.name === 'affectedStores' &&
          member.value
        ) {
          // `= ['wall', 'roof'] as const`  →  ArrayExpression (possibly wrapped in TSAsExpression)
          let val = member.value;
          if (val.type === 'TSAsExpression') val = val.expression;
          if (val.type === 'ArrayExpression') return val;
        }
      }
      return null;
    }

    return {
      ClassDeclaration(node) {
        if (!classImplementsCommandHandler(node)) return;
        const arr = getAffectedStoresLiteral(node);
        if (!arr) return;
        if (arr.elements.length <= 1) return;
        const stores = arr.elements
          .map((el) => (el && el.type === 'Literal' ? String(el.value) : '?'))
          .join(', ');
        context.report({
          node,
          messageId: 'multiChannel',
          data: {
            name: node.id ? node.id.name : '<anonymous>',
            count: String(arr.elements.length),
            stores,
          },
        });
      },
    };
  },
};

export default rule;
