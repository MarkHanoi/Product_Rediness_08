// W-1A-1 — unit test for the `pryzm/store-single-channel` ESLint rule.
//
// Tests via ESLint's built-in `RuleTester` (v9 flat-config API) exercising:
//   - VALID: handler with a single store → no report.
//   - VALID: handler with an empty `affectedStores` array → no report.
//   - VALID: non-handler class with multiple strings in an array → no report.
//   - INVALID: handler with two stores → flagged with `multiChannel` message.
//   - INVALID: handler with three stores → flagged with `multiChannel` message.

import { RuleTester } from 'eslint';
import { describe, it } from 'vitest';
import rule from '../rules/pryzm-store-single-channel.js';

const VALID_SINGLE = `
class MoveWallHandler implements CommandHandler<any, any> {
  readonly type = 'wall.move';
  readonly affectedStores = ['wall'] as const;
  canExecute() { return { valid: true }; }
  execute() { return {}; }
}
`;

const VALID_EMPTY = `
class NoopHandler implements CommandHandler<any, any> {
  readonly type = 'noop';
  readonly affectedStores = [] as const;
  canExecute() { return { valid: true }; }
  execute() { return {}; }
}
`;

const VALID_NON_HANDLER = `
class UnrelatedClass {
  readonly someList = ['a', 'b', 'c'];
}
`;

const INVALID_TWO_STORES = `
class TwoStoreHandler implements CommandHandler<any, any> {
  readonly type = 'multi.bad';
  readonly affectedStores = ['wall', 'roof'] as const;
  canExecute() { return { valid: true }; }
  execute() { return {}; }
}
`;

const INVALID_THREE_STORES = `
class ThreeStoreHandler implements CommandHandler<any, any> {
  readonly type = 'multi.bad3';
  readonly affectedStores = ['wall', 'roof', 'slab'] as const;
  canExecute() { return { valid: true }; }
  execute() { return {}; }
}
`;

describe('pryzm/store-single-channel rule', () => {
  const tester = new RuleTester({
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
    },
  });

  it('has correct meta.type', () => {
    // vitest assertion — ensure the rule module is well-formed.
    const { default: ruleDefault } = { default: rule };
    const r = ruleDefault ?? rule;
    const meta = r.meta ?? {};
    if (meta.type !== undefined) {
      if (meta.type !== 'problem' && meta.type !== 'suggestion' && meta.type !== 'layout') {
        throw new Error(`Unexpected rule type: ${meta.type}`);
      }
    }
  });

  tester.run('pryzm/store-single-channel', rule, {
    valid: [
      { code: VALID_SINGLE },
      { code: VALID_EMPTY },
      { code: VALID_NON_HANDLER },
    ],
    invalid: [
      {
        code: INVALID_TWO_STORES,
        errors: [{ messageId: 'multiChannel' }],
      },
      {
        code: INVALID_THREE_STORES,
        errors: [{ messageId: 'multiChannel' }],
      },
    ],
  });
});
