// @pryzm/family-runtime/expression — barrel.
export { tokenize, LexError, type Token, type Unit } from './tokenizer.js';
export {
  parse,
  collectIdentifiers,
  ParseError,
  type AstNode,
  type ArithOp,
  type CompareOp,
} from './parser.js';
export {
  evaluate,
  evaluateAst,
  evaluateAstQuantity,
  ExpressionEvalError,
  type EvalScope,
  type ScopeValue,
} from './evaluator.js';
export { BUILTIN_FUNCTIONS, lookupBuiltin, type BuiltinFn } from './functions.js';
export {
  toCanonical,
  kindOf,
  kindOfDataType,
  unifyKinds,
  multiplyKinds,
  divideKinds,
  assertAngleArgument,
  UnitMismatchError,
  UNIT_NAMES,
  type CanonicalKind,
  type Quantity,
} from './unit-coercion.js';
