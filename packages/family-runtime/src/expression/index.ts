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
export { evaluate, evaluateAst, ExpressionEvalError, type EvalScope } from './evaluator.js';
export { BUILTIN_FUNCTIONS, lookupBuiltin, type BuiltinFn } from './functions.js';
export { toCanonical, kindOf, UnitMismatchError, type CanonicalKind } from './unit-coercion.js';
