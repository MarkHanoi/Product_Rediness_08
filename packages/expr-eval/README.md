# @pryzm/expr-eval

Light parametric expression evaluator — landed S25 per
SPEC-01 §4.1 + `[strategic ADR-024]` §Phase-2A.

## Scope

Supports the per-element parametric expressions PRYZM 2 needs in
Phase 2A:

```ts
import { evaluate } from '@pryzm/expr-eval';

evaluate('a + b * 2', { a: 1, b: 3 });    // 7
evaluate('90 * 0.5', {});                 // 45
evaluate('(width - 2 * frame) / panes', { width: 1.2, frame: 0.05, panes: 2 });
//                                                                            // 0.55
```

## Out of scope (deliberately)

* **No constraint solver.**  The 2D constraint solver
  (`packages/constraint-solver/`) is Phase 3A; it lands with the
  Family / Component Editor at S49.  See `[strategic ADR-024]`.
* **No multi-body assembly constraints.**
* **No function calls** beyond unary `-`.  `sin`, `cos`, `min`,
  `max`, etc. join when an actual element family asks for them
  (none does in 2A).  The grammar is intentionally tiny so the
  evaluator stays dependency-free.

## Grammar

```
expr   := term (('+' | '-') term)*
term   := factor (('*' | '/') factor)*
factor := '-' factor | primary
primary:= number | identifier | '(' expr ')'
```

Identifiers resolve via the second `Scope` argument; an unknown
identifier throws `ExprEvalError('unknown identifier "<name>"')`.

## Determinism

The evaluator is THREE-free, dependency-free, and uses only
plain ECMAScript arithmetic — the same operations the kernel is
required by SPEC-01 §6 to produce byte-identically across
Node 20 and the browser.  No `Math.random`, no `Date.now`, no
mutable globals.

## Testing

```sh
npm test --workspace=@pryzm/expr-eval
```
