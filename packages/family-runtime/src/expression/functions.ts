// Built-in function table for the family expression DSL.
//
// Per plan §7.5: `min, max, if, sin, cos, sqrt, abs, round` are the
// minimum surface; we also ship `floor, ceil, pow, tan` because they
// are zero-cost additions of the same shape and the same risk
// profile.  Every function is total over finite numeric inputs;
// non-finite results raise a typed `ExpressionEvalError`.

export interface BuiltinFn {
  readonly name: string;
  /** Inclusive arity range.  Variadic functions (`min`, `max`) use a
   *  large upper bound. */
  readonly minArgs: number;
  readonly maxArgs: number;
  readonly call: (args: readonly number[]) => number;

  /* ---------------------------------------------------------------- *
   * §KIND-ALGEBRA — each function's quantity-kind contract.
   *
   * ⛔ These three fields live HERE, on the one frozen table, and not in a
   *    parallel map keyed by function name inside the evaluator.  A second
   *    table would be the duplicate-source-of-truth shape (spec §76 gate B)
   *    this lane just removed from the unit vocabulary; a function added
   *    without a kind rule must be a compile error, not a silent `scalar`.
   * ---------------------------------------------------------------- */

  /** `'angle'` constrains every argument to be an angle (or permissive):
   *  `sin(Width)` on a length is refused. `'any'` imposes nothing. */
  readonly argKind: 'any' | 'angle';
  /** How the RESULT's kind is computed.
   *   - `'scalar'`  — genuinely dimensionless (trigonometric ratios).
   *   - `'unify'`   — the arguments must agree and the result is what they
   *                   agree on (`min`, `max`, `if`, and the kind-preserving
   *                   rounding family).
   *   - `'derived'` — scalar if every argument is scalar, otherwise
   *                   `unknown`: this engine will not claim that
   *                   `sqrt(area)` is a length or that it is dimensionless. */
  readonly resultKind: 'scalar' | 'unify' | 'derived';
  /** First argument index the `'unify'` rule considers.  `if(cond, a, b)`
   *  unifies its BRANCHES only, so it starts at 1; everything else at 0. */
  readonly unifyFrom: number;
}

function variadic(reduce: (a: number, b: number) => number) {
  return (args: readonly number[]): number => {
    let acc = args[0]!;
    for (let i = 1; i < args.length; i += 1) acc = reduce(acc, args[i]!);
    return acc;
  };
}

export const BUILTIN_FUNCTIONS: Readonly<Record<string, BuiltinFn>> = Object.freeze({
  // `min`/`max` compare their arguments, so the arguments must measure the
  // same thing: `min(Width, Tilt)` is refused for the same reason
  // `Width + Tilt` is.
  min: { name: 'min', minArgs: 1, maxArgs: 64, call: variadic(Math.min), argKind: 'any', resultKind: 'unify', unifyFrom: 0 },
  max: { name: 'max', minArgs: 1, maxArgs: 64, call: variadic(Math.max), argKind: 'any', resultKind: 'unify', unifyFrom: 0 },
  if: {
    name: 'if',
    minArgs: 3,
    maxArgs: 3,
    // `cond != 0` is treated as truthy.  Comparisons in the DSL
    // already evaluate to 0/1, so this is the natural composition.
    call: (args) => (args[0]! !== 0 ? args[1]! : args[2]!),
    argKind: 'any',
    // The two branches must agree — a conditional that returns a length on
    // one arm and an angle on the other has no single kind — but the
    // CONDITION is unconstrained, hence `unifyFrom: 1`.
    resultKind: 'unify',
    unifyFrom: 1,
  },
  // Trigonometry takes an angle and returns a ratio.  `sin(Width)` is a real
  // defect that currently evaluates silently to a plausible number.
  sin:   { name: 'sin',   minArgs: 1, maxArgs: 1, call: (a) => Math.sin(a[0]!),  argKind: 'angle', resultKind: 'scalar',  unifyFrom: 0 },
  cos:   { name: 'cos',   minArgs: 1, maxArgs: 1, call: (a) => Math.cos(a[0]!),  argKind: 'angle', resultKind: 'scalar',  unifyFrom: 0 },
  tan:   { name: 'tan',   minArgs: 1, maxArgs: 1, call: (a) => Math.tan(a[0]!),  argKind: 'angle', resultKind: 'scalar',  unifyFrom: 0 },
  // `sqrt` and `pow` change the DIMENSION of their argument in a way this
  // engine has no vocabulary for — `derived`, never a confident answer.
  sqrt:  { name: 'sqrt',  minArgs: 1, maxArgs: 1, call: (a) => Math.sqrt(a[0]!), argKind: 'any',   resultKind: 'derived', unifyFrom: 0 },
  // The rounding family preserves what it is handed: |a length| is a length,
  // and rounding one does not make it dimensionless.
  abs:   { name: 'abs',   minArgs: 1, maxArgs: 1, call: (a) => Math.abs(a[0]!),   argKind: 'any', resultKind: 'unify', unifyFrom: 0 },
  round: { name: 'round', minArgs: 1, maxArgs: 1, call: (a) => Math.round(a[0]!), argKind: 'any', resultKind: 'unify', unifyFrom: 0 },
  floor: { name: 'floor', minArgs: 1, maxArgs: 1, call: (a) => Math.floor(a[0]!), argKind: 'any', resultKind: 'unify', unifyFrom: 0 },
  ceil:  { name: 'ceil',  minArgs: 1, maxArgs: 1, call: (a) => Math.ceil(a[0]!),  argKind: 'any', resultKind: 'unify', unifyFrom: 0 },
  pow:   { name: 'pow',   minArgs: 2, maxArgs: 2, call: (a) => Math.pow(a[0]!, a[1]!), argKind: 'any', resultKind: 'derived', unifyFrom: 0 },
});

/** Lookup helper.  Returns `null` if the name is not registered.  We
 *  return a discriminated `null` rather than throw so the evaluator
 *  can produce an `unknown-function` diagnostic with the AST position
 *  context. */
export function lookupBuiltin(name: string): BuiltinFn | null {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  return Object.prototype.hasOwnProperty.call(BUILTIN_FUNCTIONS, name)
    ? BUILTIN_FUNCTIONS[name]!
    : null;
}
