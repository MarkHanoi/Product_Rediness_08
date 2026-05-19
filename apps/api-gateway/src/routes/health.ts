/**
 * @pryzm/api-gateway — /v1/health route.
 *
 * Cheap liveness check — no auth, no rate-limit.  Returns the build
 * sprint marker + a snapshot of injected port sizes so operators can
 * confirm the gateway is wired correctly.
 */

import type { Router, Request, Response } from 'express';
import { Router as makeRouter } from 'express';

export interface HealthRouterOptions {
  readonly sprint: string;
  readonly version: string;
  readonly snapshot: () => Record<string, unknown>;
}

export function buildHealthRouter(opts: HealthRouterOptions): Router {
  const r = makeRouter();
  r.get('/v1/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      sprint: opts.sprint,
      version: opts.version,
      snapshot: opts.snapshot(),
    });
  });
  return r;
}
