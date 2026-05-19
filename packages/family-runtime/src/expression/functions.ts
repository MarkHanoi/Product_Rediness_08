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
}

function variadic(reduce: (a: number, b: number) => number) {
  return (args: readonly number[]): number => {
    let acc = args[0]!;
    for (let i = 1; i < args.length; i += 1) acc = reduce(acc, args[i]!);
    return acc;
  };
}

export const BUILTIN_FUNCTIONS: Readonly<Record<string, BuiltinFn>> = Object.freeze({
  min: { name: 'min', minArgs: 1, maxArgs: 64, call: variadic(Math.min) },
  max: { name: 'max', minArgs: 1, maxArgs: 64, call: variadic(Math.max) },
  if: {
    name: 'if',
    minArgs: 3,
    maxArgs: 3,
    // `cond != 0` is treated as truthy.  Comparisons in the DSL
    // already evaluate to 0/1, so this is the natural composition.
    call: (args) => (args[0]! !== 0 ? args[1]! : args[2]!),
  },
  sin:   { name: 'sin',   minArgs: 1, maxArgs: 1, call: (a) => Math.sin(a[0]!) },
  cos:   { name: 'cos',   minArgs: 1, maxArgs: 1, call: (a) => Math.cos(a[0]!) },
  tan:   { name: 'tan',   minArgs: 1, maxArgs: 1, call: (a) => Math.tan(a[0]!) },
  sqrt:  { name: 'sqrt',  minArgs: 1, maxArgs: 1, call: (a) => Math.sqrt(a[0]!) },
  abs:   { name: 'abs',   minArgs: 1, maxArgs: 1, call: (a) => Math.abs(a[0]!) },
  round: { name: 'round', minArgs: 1, maxArgs: 1, call: (a) => Math.round(a[0]!) },
  floor: { name: 'floor', minArgs: 1, maxArgs: 1, call: (a) => Math.floor(a[0]!) },
  ceil:  { name: 'ceil',  minArgs: 1, maxArgs: 1, call: (a) => Math.ceil(a[0]!) },
  pow:   { name: 'pow',   minArgs: 2, maxArgs: 2, call: (a) => Math.pow(a[0]!, a[1]!) },
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
