# eslint-plugin-pryzm

Custom ESLint rules that enforce the PRYZM 2 architectural contracts. These rules
land scaffolded in **S01** and harden into real assertions across S02–S08.

| Rule | Sprint introduced | Sprint hard-fails | Purpose |
|---|---|---|---|
| `pryzm-affected-stores-required` | S01 (scaffold) | S02 | Every `CommandHandler` class must declare an `affectedStores` field. |
| `pryzm-no-three-in-kernel` | S01 (scaffold) | S08 | `packages/geometry-kernel/**` may not import `three` (or `OBC`). |
| `pryzm-no-raf` | S03 | S03 | `requestAnimationFrame` is only allowed inside `packages/frame-scheduler/**`. |
| `pryzm-no-three-outside-committer` | S05 | S07 | `import * as THREE` is only allowed inside `packages/scene-committer/**` and `plugins/*/committer.ts`. |

Rules are pure ESLint v9 flat-config plugins. No autofix is provided — the architecture
explicitly wants the engineer to look at each violation and rewrite the call site.

## Usage

```js
// eslint.config.js
import pryzm from 'eslint-plugin-pryzm';

export default [
  {
    plugins: { pryzm },
    rules: {
      'pryzm/affected-stores-required': 'error',
      'pryzm/no-three-in-kernel': 'error',
    },
  },
];
```

See `eslint.config.js` at the repo root for the full wiring + boundaries L0→L7 matrix.
