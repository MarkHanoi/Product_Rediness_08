// @pryzm/plugin-sdk — tracing helpers for CommandBus handlers.
//
// Spec: docs/archive/pryzm3-internal/04-PLAN-FORWARD/34-HANDLER-PROTOCOL-GAP-ANALYSIS.md §5
//       C10 §2 ("Every new exported function MUST add ≥ 1 OTel span").
//       ADR-002 §2 (L7 plugins import ONLY from @pryzm/plugin-sdk — no direct
//       @opentelemetry/api imports allowed in plugin handler files).
//
// Usage in a handler:
//
//   import { getHandlerTracer, withHandlerSpan } from '@pryzm/plugin-sdk';
//
//   export class CreateWallHandler implements CommandHandler<CreateWallPayload> {
//     readonly type = 'wall.create';
//     readonly affectedStores = ['walls'] as const;
//
//     execute(ctx: HandlerContext, payload: CreateWallPayload): HandlerResult {
//       return withHandlerSpan('pryzm.wall.create.handler', {
//         'pryzm.command.type': this.type,
//         'pryzm.command.actorId': ctx.audit.actorId,
//       }, () => {
//         // ... handler body ...
//       });
//     }
//   }
//
// Why re-export from plugin-sdk rather than importing @opentelemetry/api directly?
//   The L7 plugin boundary (ADR-002 §2) mandates that handler files import ONLY
//   from @pryzm/plugin-sdk.  A direct `import ... from '@opentelemetry/api'` in
//   a handler file would cross the boundary and couple the plugin package to the
//   OTel SDK version.  Routing through plugin-sdk lets the OTel version be managed
//   in one place (here) and lets tests inject a mock tracer without patching the
//   global `trace` registry.
//
// Tracer naming convention:
//   'pryzm.<family>'  — e.g. 'pryzm.wall', 'pryzm.door', 'pryzm.room'
//   Use getHandlerTracer('<family>') once per plugin and re-use the result.

import {
  trace,
  SpanStatusCode,
  type Tracer,
  type Span,
  type SpanOptions,
} from '@opentelemetry/api';

export type { Tracer, Span };

// ── Tracer factory ────────────────────────────────────────────────────────────

/**
 * Get (or create) a named OTel tracer scoped to a PRYZM plugin family.
 *
 * Call once at module level:
 * ```ts
 * const tracer = getHandlerTracer('pryzm.wall');
 * ```
 *
 * The returned `Tracer` is the standard `@opentelemetry/api` `Tracer` —
 * callers can use `tracer.startSpan(name)` directly for manual span lifecycle,
 * or use the convenience wrapper `withHandlerSpan()` below.
 */
export function getHandlerTracer(name: string): Tracer {
  return trace.getTracer(name);
}

// ── Synchronous span wrapper ───────────────────────────────────────────────────

/**
 * Run `fn` inside a span named `spanName`, set OK/ERROR status automatically,
 * and return the result.  Rethrows any exception after recording it on the span.
 *
 * Attributes can include any `string | number | boolean` values.
 *
 * ```ts
 * const result = withHandlerSpan('pryzm.wall.create.handler', {
 *   'pryzm.command.type': 'wall.create',
 * }, () => {
 *   // sync handler body
 *   return produceCommand(ctx, payload, draft => { ... });
 * });
 * ```
 */
export function withHandlerSpan<T>(
  spanName: string,
  attributes: Record<string, string | number | boolean>,
  fn: (span: Span) => T,
  opts?: SpanOptions,
): T {
  const span = trace.getActiveSpan()
    ? trace.getTracer('pryzm.handler').startSpan(spanName, opts)
    : trace.getTracer('pryzm.handler').startSpan(spanName, opts);

  for (const [k, v] of Object.entries(attributes)) {
    span.setAttribute(k, v);
  }

  try {
    const result = fn(span);
    span.setStatus({ code: SpanStatusCode.OK });
    return result;
  } catch (err) {
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: err instanceof Error ? err.message : String(err),
    });
    if (err instanceof Error) span.recordException(err);
    throw err;
  } finally {
    span.end();
  }
}

// ── Async span wrapper ────────────────────────────────────────────────────────

/**
 * Async variant of `withHandlerSpan` for handlers whose `execute()` is async.
 *
 * ```ts
 * return withAsyncHandlerSpan('pryzm.ifc.import.handler', {
 *   'pryzm.command.type': 'ifc.import.file',
 * }, async (span) => {
 *   // async handler body
 * });
 * ```
 */
export async function withAsyncHandlerSpan<T>(
  spanName: string,
  attributes: Record<string, string | number | boolean>,
  fn: (span: Span) => Promise<T>,
  opts?: SpanOptions,
): Promise<T> {
  const span = trace.getTracer('pryzm.handler').startSpan(spanName, opts);

  for (const [k, v] of Object.entries(attributes)) {
    span.setAttribute(k, v);
  }

  try {
    const result = await fn(span);
    span.setStatus({ code: SpanStatusCode.OK });
    return result;
  } catch (err) {
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: err instanceof Error ? err.message : String(err),
    });
    if (err instanceof Error) span.recordException(err);
    throw err;
  } finally {
    span.end();
  }
}
