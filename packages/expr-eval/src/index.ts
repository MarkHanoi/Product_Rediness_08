// @pryzm/expr-eval — public surface (S25 deliverable).
//
// SPEC-01 §4.1: light parametric expressions land in Phase 2A; **no
// constraint solver**.  The constraint solver is a separate, larger
// package that arrives at S49 (`[strategic ADR-024]` §Phase-3A).

export { evaluate, type Scope, ExprEvalError } from './evaluator.js';
export { parse, type AstNode } from './parser.js';
