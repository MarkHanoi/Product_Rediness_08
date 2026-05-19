/**
 * @pryzm/api-gateway — Express 5 app factory.
 *
 * Composition root — see ADR-0041 §A.  All ports are injected; the
 * factory itself does no I/O.  Tests construct in-memory ports
 * (`InMemoryProjectStore`, `StubAiInvokePort`, `InMemoryWsEventBus`)
 * and assert HTTP semantics; production wires the real ports at the
 * `tsx src/index.ts` bootstrap.
 *
 * Per-app `RateLimitRegistry` for read+write isolated buckets per
 * ADR-018.  The registries are PASSED TO sub-routers so a single
 * subject's read budget is consistent across all GET routes.
 */

import express, { type Express, type Request, type Response, type NextFunction, type RequestHandler } from 'express';
import { RateLimitRegistry } from '@pryzm/rate-limit';
import type { AiSpendStore } from '@pryzm/ai-spend';
import type { OverrideStore } from '@pryzm/admin-overrides';
import type { FormulaCatalog } from '@pryzm/formula-library';
import type { FetchLike, WebhookStore } from '@pryzm/webhooks';
import { defaultTestAuthShim } from './auth-shim.js';
import {
  type AiInvokePort,
  type ProjectExportPort,
  type ProjectImportPort,
  type WsEventBus,
} from './ports.js';
import { buildHealthRouter } from './routes/health.js';
import { buildProjectsRouter } from './routes/projects.js';
import { buildAiRouter } from './routes/ai.js';
import { buildAdminRouter } from './routes/admin.js';
import { buildFormulasRouter } from './routes/formulas.js';
import { buildWebhooksRouter } from './routes/webhooks.js';

// S66 D1 — gateway version bumps to 0.2.0, sprint marker bumps to S66.
export const API_GATEWAY_SPRINT = 'S66';
export const API_GATEWAY_VERSION = '0.2.0';

export interface ApiGatewayAppOptions {
  readonly exportPort: ProjectExportPort;
  readonly importPort: ProjectImportPort;
  readonly aiPort: AiInvokePort;
  readonly spendStore: AiSpendStore;
  readonly overrideStore: OverrideStore;
  readonly formulaCatalog: FormulaCatalog;
  readonly wsBus: WsEventBus;
  /** Production wires a real OAuth2 resource server here. */
  readonly authShim?: RequestHandler;
  readonly maxImportBytes?: number;
  /** S66 — webhook subscription store + injectable transport for tests. */
  readonly webhookStore?: WebhookStore;
  readonly webhookFetch?: FetchLike;
  readonly webhookClock?: () => number;
}

export interface ApiGatewayApp {
  readonly app: Express;
  readonly reads: RateLimitRegistry;
  readonly writes: RateLimitRegistry;
  readonly wsBus: WsEventBus;
}

export function createApiGatewayApp(opts: ApiGatewayAppOptions): ApiGatewayApp {
  const app = express();
  app.disable('x-powered-by');

  // Per-app rate-limit registries — read + write share-nothing per
  // ADR-018.  All routers receive these same registries so a single
  // subject's budget is consistent across the gateway surface.
  const reads = new RateLimitRegistry();
  const writes = new RateLimitRegistry();

  const authShim = opts.authShim ?? defaultTestAuthShim;
  app.use(authShim);

  // /v1/health — no auth, no rate-limit.
  app.use(
    buildHealthRouter({
      sprint: API_GATEWAY_SPRINT,
      version: API_GATEWAY_VERSION,
      snapshot: () => ({
        formulas: opts.formulaCatalog.size(),
        spendEntries: opts.spendStore.size(),
        overrides: opts.overrideStore.size(),
        workflows: opts.aiPort.listWorkflows().length,
        webhooks: opts.webhookStore?.size() ?? 0,
      }),
    }),
  );

  // Projects + AI + admin + formulas.
  app.use(
    buildProjectsRouter({
      exportPort: opts.exportPort,
      importPort: opts.importPort,
      reads,
      writes,
      ...(opts.maxImportBytes !== undefined ? { maxImportBytes: opts.maxImportBytes } : {}),
    }),
  );

  app.use(buildAiRouter({ aiPort: opts.aiPort, reads, writes }));

  app.use(
    buildAdminRouter({
      spendStore: opts.spendStore,
      overrideStore: opts.overrideStore,
      reads,
      writes,
    }),
  );

  app.use(buildFormulasRouter({ catalog: opts.formulaCatalog, reads }));

  // S66 — webhooks subscription surface (admin-gated).  Mounted only
  // when a store is injected; tests that don't care can omit it and
  // the routes simply don't exist.
  if (opts.webhookStore) {
    app.use(
      buildWebhooksRouter({
        store: opts.webhookStore,
        reads,
        writes,
        ...(opts.webhookFetch !== undefined ? { fetchImpl: opts.webhookFetch } : {}),
        ...(opts.webhookClock !== undefined ? { clock: opts.webhookClock } : {}),
      }),
    );
  }

  // ── 404 — unknown paths ─────────────────────────────────────────────
  app.use((req: Request, res: Response) => {
    res.status(404).json({
      error: 'not_found',
      method: req.method,
      path: req.path,
    });
  });

  // ── ERROR HANDLER (LAST) ────────────────────────────────────────────
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const message = err instanceof Error ? err.message : 'internal_error';
    res.status(500).json({ error: 'internal_error', message });
  });

  return { app, reads, writes, wsBus: opts.wsBus };
}
