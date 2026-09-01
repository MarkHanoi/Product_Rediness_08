// resolveParameter — resolves every parameter to a final value with
// the precedence `instance > type > EXPRESSION > definition default`
// (ADR-0376 D4, §PARAM-PRECEDENCE).
//
// ⚠ This header used to read `instance > type > family default >
//   expression`, and the code below matched it. That order is the
//   inversion ADR-0376 D4 overturned: a `defaultValue` silently
//   pre-empted an `expression`, so the founder's §64 demo — "make the
//   glass width always the opening width minus twice the frame width" —
//   parsed, dependency-sorted and then NEVER EVALUATED the expression,
//   returning the authored default with ok:true and zero diagnostics.
//   A default is a FALLBACK; a fallback that beats design intent is not
//   a fallback.
//
// Per plan §11.2 (instance contract) + §10.2 (validation) + §14 (the
// `pryzm.family.bake.resolveType` span fires once per resolution
// pass, NOT once per parameter — that's
// `pryzm.family.parameter.evaluate`'s job).
//
// Cycle detection is performed at edit time (not save time): we
// build a dependency graph parameter→referenced-identifiers, run a
// topological sort, and surface every parameter that is part of a
// cycle as an `error` diagnostic.  Resolution proceeds for every
// parameter NOT involved in a cycle so the editor can still render
// useful values mid-edit.

import { collectIdentifiers, parse, ParseError, type AstNode } from '../expression/parser.js';
import { evaluateAst, ExpressionEvalError } from '../expression/evaluator.js';
import { LexError } from '../expression/tokenizer.js';
import { emitSpan } from '../span-sink.js';
import type {
  FamilyParameter,
  FamilyType,
  InstanceOverrides,
  ResolverDiagnostic,
  ResolverInput,
  ResolverResult,
} from '../types.js';

const NAME_RX = /^[A-Za-z][A-Za-z0-9_ ]{0,63}$/;

export function resolveParameter(input: ResolverInput): ResolverResult {
  const start = nowMs();
  const diagnostics: ResolverDiagnostic[] = [];
  const { parameters } = input;

  // 1. Lint the parameter list — duplicate names and invalid names
  //    are blocking errors; expression parse errors are per-parameter
  //    diagnostics that don't abort the pass.
  const seen = new Set<string>();
  const byName = new Map<string, FamilyParameter>();
  for (const p of parameters) {
    if (!NAME_RX.test(p.name)) {
      diagnostics.push({
        severity: 'error',
        code: 'invalid-name',
        parameterId: p.id,
        message: `parameter name ${JSON.stringify(p.name)} does not match ^[A-Za-z][A-Za-z0-9_ ]{0,63}$`,
      });
    }
    if (seen.has(p.name)) {
      diagnostics.push({
        severity: 'error',
        code: 'duplicate-name',
        parameterId: p.id,
        message: `duplicate parameter name ${JSON.stringify(p.name)}`,
      });
    }
    seen.add(p.name);
    byName.set(p.name, p);
  }

  // 2. Pre-parse every expression once and collect dependencies.
  interface Compiled {
    readonly param: FamilyParameter;
    readonly ast: AstNode | null;
    readonly deps: readonly string[];
  }
  const compiled: Compiled[] = [];
  for (const p of parameters) {
    if (p.expression === null || p.expression.trim() === '') {
      compiled.push({ param: p, ast: null, deps: [] });
      continue;
    }
    try {
      const ast = parse(p.expression);
      const deps = Array.from(collectIdentifiers(ast)).filter((d) => byName.has(d));
      compiled.push({ param: p, ast, deps });
    } catch (e) {
      const msg = e instanceof ParseError || e instanceof LexError ? e.message : String(e);
      diagnostics.push({
        severity: 'error',
        code: 'expression-parse',
        parameterId: p.id,
        message: msg,
      });
      compiled.push({ param: p, ast: null, deps: [] });
    }
  }

  // 3. Topological sort — Kahn's algorithm.  Parameters in a cycle
  //    are surfaced via `cycle` diagnostics and excluded from the
  //    resolution order.
  const inDegree = new Map<string, number>();
  const dependents = new Map<string, string[]>();
  for (const c of compiled) {
    inDegree.set(c.param.id, c.deps.length);
    for (const dep of c.deps) {
      const depParam = byName.get(dep);
      if (!depParam) continue;
      const list = dependents.get(depParam.id) ?? [];
      list.push(c.param.id);
      dependents.set(depParam.id, list);
    }
  }
  const ready: string[] = [];
  for (const [id, deg] of inDegree) if (deg === 0) ready.push(id);
  const order: string[] = [];
  while (ready.length > 0) {
    const id = ready.shift()!;
    order.push(id);
    for (const child of dependents.get(id) ?? []) {
      const next = (inDegree.get(child) ?? 0) - 1;
      inDegree.set(child, next);
      if (next === 0) ready.push(child);
    }
  }
  if (order.length !== compiled.length) {
    const cyclic = compiled
      .filter((c) => !order.includes(c.param.id))
      .map((c) => c.param);
    for (const p of cyclic) {
      diagnostics.push({
        severity: 'error',
        code: 'cycle',
        parameterId: p.id,
        message: `parameter ${JSON.stringify(p.name)} participates in a dependency cycle`,
      });
    }
  }

  // 4. Resolve in topological order.  Apply the precedence
  //    instance > type > EXPRESSION > definition default at each step
  //    (ADR-0376 D4).
  const values: Record<string, number | string> = {};
  const compiledById = new Map(compiled.map((c) => [c.param.id, c]));
  for (const id of order) {
    const c = compiledById.get(id)!;
    const p = c.param;
    const override = pickOverride(p, input.type, input.instanceOverrides);
    if (override !== undefined) {
      if (typeof override === 'number' && !Number.isFinite(override)) {
        diagnostics.push({
          severity: 'error',
          code: 'invalid-override',
          parameterId: p.id,
          message: `non-finite override value ${override}`,
        });
        continue;
      }
      values[p.name] = override;
      continue;
    }
    // ⛔ ORDER IS LOAD-BEARING — the expression branch sits ABOVE the default
    //    branch (ADR-0376 D4). It used to sit below, and `resolveParameter.test.ts`
    //    could not see the difference because every arm it carried had EITHER a
    //    default OR an expression, never both. The both-present arm now exists;
    //    reordering these two blocks fails it by name.
    //    A `string` parameter never evaluates an expression (the evaluator is
    //    numeric), so it falls through to its default — unchanged behaviour.
    if (c.ast !== null && p.dataType !== 'string') {
      // A default an expression pre-empts is DEAD DATA, not a fallback in
      // waiting. `introduce-expression` now clears it and records it as
      // `supersededDefault`; a document still carrying both predates that
      // migrator, so SAY so rather than resolving silently over it.
      if (p.defaultValue !== null) {
        diagnostics.push({
          severity: 'warn',
          code: 'superseded-default',
          parameterId: p.id,
          message:
            `parameter ${JSON.stringify(p.name)} carries BOTH an expression and a defaultValue ` +
            `${JSON.stringify(p.defaultValue)}; per ADR-0376 D4 the expression wins and the default ` +
            `is dead. Re-run introduce-expression to record it as supersededDefault.`,
        });
      }
      try {
        const numericScope: Record<string, number> = {};
        for (const [k, v] of Object.entries(values)) {
          if (typeof v === 'number') numericScope[k] = v;
        }
        const v = evaluateAst(c.ast, numericScope, { src: p.expression ?? undefined, parameterId: p.id });
        values[p.name] = v;
      } catch (e) {
        const msg = e instanceof ExpressionEvalError ? e.message : String(e);
        diagnostics.push({
          severity: 'error',
          code: e instanceof ExpressionEvalError && e.code === 'unknown-identifier' ? 'unknown-identifier' : 'expression-eval',
          parameterId: p.id,
          message: msg,
        });
      }
      // An expression that THREW does not fall back to the default. The pass is
      // already ok:false; a silent fallback is precisely the failure class this
      // change removes.
      continue;
    }
    if (p.defaultValue !== null) {
      if (typeof p.defaultValue === 'number' && !Number.isFinite(p.defaultValue)) {
        diagnostics.push({
          severity: 'error',
          code: 'invalid-default',
          parameterId: p.id,
          message: `non-finite default value ${p.defaultValue}`,
        });
        continue;
      }
      values[p.name] = p.defaultValue;
      continue;
    }
  }

  const ok = !diagnostics.some((d) => d.severity === 'error');
  emitSpan({
    name: 'pryzm.family.bake.resolveType',
    startedAt: Date.now(),
    durationMs: Math.max(0, nowMs() - start),
    status: ok ? 'ok' : 'error',
    attributes: {
      'family.parameterCount': parameters.length,
      'family.typeId': input.type?.id ?? '',
      'family.typeName': input.type?.name ?? '',
      'family.resolvedCount': Object.keys(values).length,
      'family.diagnosticCount': diagnostics.length,
      'family.errorCount': diagnostics.filter((d) => d.severity === 'error').length,
    },
  });

  if (ok) {
    return { ok: true, values, order, diagnostics };
  }
  return { ok: false, diagnostics };
}

function pickOverride(
  p: FamilyParameter,
  type: FamilyType | null,
  instance: InstanceOverrides,
): number | string | undefined {
  if (Object.prototype.hasOwnProperty.call(instance, p.id)) {
    return instance[p.id];
  }
  if (type && Object.prototype.hasOwnProperty.call(type.values, p.id)) {
    return type.values[p.id];
  }
  return undefined;
}

function nowMs(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}
