// @pryzm/family-runtime — public surface (S55 deliverable).
//
// Per plan §7.5 + §11.2 + §14: this package is the single source of
// truth for the family expression DSL, the parameter resolver, and
// the unit-coercion table.  It is intentionally pure-Node and
// dependency-free so the editor (browser), the bake-worker (Node),
// and the AI worker (Node) all import the SAME runtime.

export * from './expression/index.js';
export * from './resolution/index.js';
export * from './types.js';
export {
  setFamilyRuntimeSpanSink,
  clearFamilyRuntimeSpanSinks,
  emitSpan as emitFamilyRuntimeSpan,
  type SpanRecord as FamilyRuntimeSpanRecord,
  type SpanSink as FamilyRuntimeSpanSink,
  type SpanStatus as FamilyRuntimeSpanStatus,
} from './span-sink.js';
