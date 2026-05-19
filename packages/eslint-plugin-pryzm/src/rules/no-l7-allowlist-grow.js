// pryzm/no-l7-allowlist-grow
//
// SPRINT: Wave 4 Track B PR 4.B.3 — size-ratchet for the L7 transitional allowlist.
//
// CONTRACT: the `TRANSITIONAL_ALLOWLIST` in `no-l7-direct-import.js` is
// frozen at 5 entries.  This rule flags any attempt to add new entries
// by detecting:
//
//   (a) Assignment to a variable named `TRANSITIONAL_ALLOWLIST` with a
//       Set or array literal whose element count exceeds the baseline.
//   (b) Any call to `TRANSITIONAL_ALLOWLIST.add(...)` that appears in
//       source code (defensive — the Set is declared `const` so `add`
//       would only appear if someone tries to extend it dynamically).
//
// BASELINE: 5 entries (from `.ga-gate/baselines/l7-allowlist-size.json`).
// The baseline is read from the JSON file at lint time so CI can update
// it via a controlled `pnpm ga-gate --ratchet l7-allowlist` command.
//
// NOTE: This rule lints the RULE FILE ITSELF (`no-l7-direct-import.js`),
// not the plugin application code.  It is applied to the eslint-plugin-pryzm
// `src/` tree in the project's root ESLint config.
//
// ALTERNATIVE ENFORCEMENT: a companion CI script
// (`tools/ga-gate/check-l7-boundary.ts`) counts the set entries at test
// time so the ratchet is also enforced outside ESLint.

import path from 'node:path';
import { readFileSync } from 'node:fs';

// ── baseline ─────────────────────────────────────────────────────────────────

const BASELINE_FILENAME = '.ga-gate/baselines/l7-allowlist-size.json';
const BASELINE_FALLBACK = 5;
const WATCHED_VAR = 'TRANSITIONAL_ALLOWLIST';

function readBaseline() {
  try {
    const raw = readFileSync(
      path.join(process.cwd(), BASELINE_FILENAME),
      'utf8',
    );
    const parsed = JSON.parse(raw);
    return typeof parsed.count === 'number' ? parsed.count : BASELINE_FALLBACK;
  } catch {
    return BASELINE_FALLBACK;
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────

function normalisePath(p) {
  if (!p) return '';
  return p.split(path.sep).join('/');
}

/** Only applies to the no-l7-direct-import rule file itself. */
function isRuleFile(filename) {
  const norm = normalisePath(filename);
  return norm.includes('rules/no-l7-direct-import');
}

// ── rule ─────────────────────────────────────────────────────────────────────

const rule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Prevents the L7 transitional allowlist (`TRANSITIONAL_ALLOWLIST` in ' +
        '`no-l7-direct-import.js`) from growing beyond the frozen baseline of 5 entries. ' +
        'New L7 plugin packages must migrate to `@pryzm/sdk` (Phase F) rather than ' +
        'being added to the allowlist. ' +
        'See `08-WAVE-4-SLOT-TYPING-ROUTING.md §3` PR 4.B.3 and ' +
        '`.ga-gate/baselines/l7-allowlist-size.json`.',
      category: 'Architecture',
    },
    schema: [],
    messages: {
      tooLarge:
        'The L7 transitional allowlist `{{name}}` has {{count}} entries but the baseline ' +
        'allows at most {{baseline}}. Do not add new entries without updating ' +
        '`.ga-gate/baselines/l7-allowlist-size.json` and getting explicit architectural approval. ' +
        'See Wave 4 Track B PR 4.B.3.',
      dynamicAdd:
        '`TRANSITIONAL_ALLOWLIST.add(...)` is forbidden — the allowlist is frozen. ' +
        'See Wave 4 Track B PR 4.B.3.',
    },
  },

  create(context) {
    const filename = context.filename ?? context.getFilename();
    if (!isRuleFile(filename)) return {};

    const baseline = readBaseline();

    return {
      // (a) `new Set([...entries...])` assigned to `TRANSITIONAL_ALLOWLIST`
      VariableDeclarator(node) {
        if (!node.id || node.id.name !== WATCHED_VAR) return;
        const init = node.init;
        if (!init) return;

        let entries = 0;
        // `new Set([...])` form
        if (
          init.type === 'NewExpression' &&
          init.callee.name === 'Set' &&
          init.arguments.length === 1 &&
          init.arguments[0].type === 'ArrayExpression'
        ) {
          entries = init.arguments[0].elements.length;
        }
        // `[...entries...]` form (if the variable is initialized as an array)
        if (init.type === 'ArrayExpression') {
          entries = init.elements.length;
        }

        if (entries > baseline) {
          context.report({
            node,
            messageId: 'tooLarge',
            data: { name: WATCHED_VAR, count: entries, baseline },
          });
        }
      },

      // (b) `TRANSITIONAL_ALLOWLIST.add(...)` call
      CallExpression(node) {
        const callee = node.callee;
        if (
          callee.type === 'MemberExpression' &&
          callee.object.name === WATCHED_VAR &&
          callee.property.name === 'add'
        ) {
          context.report({ node, messageId: 'dynamicAdd' });
        }
      },
    };
  },
};

export default rule;
export { WATCHED_VAR, BASELINE_FILENAME, BASELINE_FALLBACK };
