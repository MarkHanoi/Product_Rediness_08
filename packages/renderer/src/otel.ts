// L5 OTel helper — `pryzm.renderer.*` spans (S06 Track B).
//
// Same shape as the L5 scene-committer / L0 persistence-client / L2
// command-bus tracers — a no-op by default, lights up when a
// TracerProvider is registered.
//
// Spans emitted by this package:
//   * `pryzm.renderer.init`    — boot path; records `pryzm.renderer.mode`
//                                = 'webgpu' | 'webgl2' (ADR-007).
//   * `pryzm.frame.render`     — per-frame draw call; records
//                                `pryzm.renderer.draw_calls` and
//                                `pryzm.renderer.triangles`.
//   * `pryzm.bootstrap.scene`  — D.4.1 (S79-WIRE) scene composition
//                                root span; records
//                                `pryzm.bootstrap.scene.mode`,
//                                `.has_canvas`, `.outcome`, `.error`.
//                                See `./SceneBootstrap.ts`.

import {
  trace,
  SpanStatusCode,
  type Attributes,
  type Span,
} from '@opentelemetry/api';

const TRACER = trace.getTracer('@pryzm/renderer', '0.1.0');

export function startSpan(name: string, attrs: Attributes = {}): Span {
  return TRACER.startSpan(name, { attributes: attrs });
}

export async function withSpan<T>(
  name: string,
  attrs: Attributes,
  fn: (span: Span) => Promise<T> | T,
): Promise<T> {
  const span = TRACER.startSpan(name, { attributes: attrs });
  try {
    const out = await fn(span);
    span.setStatus({ code: SpanStatusCode.OK });
    return out;
  } catch (err) {
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: err instanceof Error ? err.message : String(err),
    });
    span.recordException(err as Error);
    throw err;
  } finally {
    span.end();
  }
}

export function withSpanSync<T>(
  name: string,
  attrs: Attributes,
  fn: (span: Span) => T,
): T {
  const span = TRACER.startSpan(name, { attributes: attrs });
  try {
    const out = fn(span);
    span.setStatus({ code: SpanStatusCode.OK });
    return out;
  } catch (err) {
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: err instanceof Error ? err.message : String(err),
    });
    span.recordException(err as Error);
    throw err;
  } finally {
    span.end();
  }
}
