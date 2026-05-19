// pryzm/affected-stores-required
//
// SPRINT: scaffolded in S01, real AST assertions land in S02 per
// `phases/PHASE-1A-Q1-M1-M3-SKELETON-RAILS.md §S02-T6` (line 298).
//
// CONTRACT: every class that implements `CommandHandler` MUST declare a
// readonly `affectedStores` field listing the stores its patches touch.
// The command-bus reads that field to decide which subscribers to notify
// and which OTel attributes to attach.
//
// In `pryzm2/` mode the rule ALSO catches classes that `implements Command`
// (the legacy PRYZM-1 interface) — per spec line 298 "(or extending the
// legacy `Command` interface, in `pryzm2/` mode only)".  The rule is
// disabled on `src/**` via the global ESLint ignores so PRYZM-1 commands
// are not affected.

const HANDLER_INTERFACE_NAMES = new Set(['CommandHandler', 'Command']);

/** @type {import('eslint').Rule.RuleModule} */
const rule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require classes implementing CommandHandler (or the legacy Command interface in pryzm2/) to declare an `affectedStores` field.',
    },
    schema: [],
    messages: {
      missing:
        '{{name}} implements {{iface}} but is missing the readonly `affectedStores` field. ' +
        'Add `readonly affectedStores: readonly StoreId[] = [...]` so the bus knows which stores to notify.',
    },
  },

  create(context) {
    function classImplementedInterface(node) {
      const implementsList = node.implements ?? [];
      for (const impl of implementsList) {
        const expr = impl.expression ?? impl;
        if (!expr) continue;
        // Plain identifier — e.g. `class X implements CommandHandler { ... }`
        if (expr.type === 'Identifier' && HANDLER_INTERFACE_NAMES.has(expr.name)) {
          return expr.name;
        }
        // TS type-reference — `class X implements CommandHandler<...> { ... }`
        if (
          expr.type === 'TSTypeReference' &&
          expr.typeName &&
          expr.typeName.type === 'Identifier' &&
          HANDLER_INTERFACE_NAMES.has(expr.typeName.name)
        ) {
          return expr.typeName.name;
        }
      }
      return null;
    }

    function hasAffectedStores(node) {
      for (const member of node.body.body) {
        if (
          (member.type === 'PropertyDefinition' || member.type === 'TSPropertySignature') &&
          member.key &&
          member.key.type === 'Identifier' &&
          member.key.name === 'affectedStores'
        ) {
          return true;
        }
      }
      return false;
    }

    return {
      ClassDeclaration(node) {
        const iface = classImplementedInterface(node);
        if (!iface) return;
        if (hasAffectedStores(node)) return;
        context.report({
          node,
          messageId: 'missing',
          data: {
            name: node.id ? node.id.name : '<anonymous class>',
            iface,
          },
        });
      },
    };
  },
};

export default rule;
