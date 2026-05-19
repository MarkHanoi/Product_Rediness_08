// PickStrategyResolver — boot-time gpu-pick → BVH fallback (S16-T1, ADR-0015 §"Decision").
//
// Spec line 706-712:
//   const gpu = new GpuPickStrategy(...);
//   const probe = gpu.probeAvailability(ctx);
//   if (probe.ok) return gpu;
//   ctx.otel.addEvent('pryzm.picking.gpu-pick.unavailable', { reason });
//   return new BvhPickStrategy(...);
//
// The resolver is intentionally a function, not a class — the resolved
// strategy is stable for the session.  Re-resolution requires a hard
// reload (matches the "boot-time" semantics in the ADR).

import { startSpan } from './otel.js';
import { BvhPickStrategy, type BvhPickOptions } from './bvh-pick.js';
import { GpuPickStrategy, type GpuPickOptions } from './gpu-pick.js';
import type { PickContext, PickStrategy } from './types.js';

export interface PickStrategyResolverOptions {
  readonly gpu?: GpuPickOptions;
  readonly bvh?: BvhPickOptions;
  /** Force BVH fallback regardless of probe.  Useful for headless tests. */
  readonly forceFallback?: boolean;
}

/** Resolve the pick strategy for this session.
 *
 *  Returns `gpu-pick` when its probe succeeds, otherwise `bvh-pick`.
 *  On fallback, emits a `pryzm.picking.gpu-pick.unavailable` span event
 *  with the failure reason — visible in Honeycomb / Jaeger and used by
 *  the OTel coverage lint (S16 exit criterion line 623). */
export function resolvePickStrategy(
  ctx: PickContext,
  opts: PickStrategyResolverOptions = {},
): PickStrategy {
  if (opts.forceFallback === true) {
    const span = startSpan('pryzm.picking.resolve');
    span.addEvent('pryzm.picking.gpu-pick.unavailable', {
      reason: 'forceFallback',
    });
    span.end();
    return new BvhPickStrategy(opts.bvh ?? {});
  }

  const gpu = new GpuPickStrategy(opts.gpu ?? {});

  // HIGH-3 fix: probeAvailability() can throw on broken WebGL contexts (e.g.
  // context-lost, headless environments with no GL support).  Wrap in
  // try/catch so resolvePickStrategy() NEVER propagates an exception — the
  // caller (initTools.ts) would otherwise call setPickStrategy(null), leaving
  // GPU pick silently disabled with no OTel trace.
  let probe: ReturnType<typeof gpu.probeAvailability>;
  try {
    probe = gpu.probeAvailability(ctx);
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err));
    const span = startSpan('pryzm.picking.resolve');
    span.addEvent('pryzm.picking.gpu-pick.unavailable', {
      reason: `probeAvailability threw: ${e.message}`,
    });
    span.recordException(e);
    span.end();
    gpu.dispose();
    return new BvhPickStrategy(opts.bvh ?? {});
  }

  if (probe.ok) {
    return gpu;
  }

  // Fallback path — emit event then return BVH.
  const span = startSpan('pryzm.picking.resolve');
  span.addEvent('pryzm.picking.gpu-pick.unavailable', {
    reason: probe.reason ?? 'unknown',
  });
  if (probe.error) {
    span.recordException(probe.error);
  }
  span.end();
  gpu.dispose();
  return new BvhPickStrategy(opts.bvh ?? {});
}
