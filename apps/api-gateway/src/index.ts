/**
 * @pryzm/api-gateway — entry point + standalone bootstrap.
 *
 * S65 deliverable per phase-doc-2 §S65.  When run via
 * `pnpm --filter @pryzm/api-gateway start` (alias for
 * `tsx src/index.ts`), this binds an in-memory composition of all
 * ports and listens on `API_GATEWAY_PORT` (default 5101).  Production
 * wires the real ports at S65 D9 cutover.
 */

export {
  createApiGatewayApp,
  API_GATEWAY_SPRINT,
  API_GATEWAY_VERSION,
  type ApiGatewayApp,
  type ApiGatewayAppOptions,
} from './app.js';
export {
  defaultTestAuthShim,
  requireAdmin,
  ADMIN_ROLES,
  isAdminRole,
  type GatewayAuthContext,
  type GatewayAuthedRequest,
} from './auth-shim.js';
export {
  type ProjectExportPort,
  type ProjectExportResult,
  type ProjectImportPort,
  type ProjectImportResult,
  ProjectImportError,
  type AiInvokePort,
  type AiInvokeRequest,
  type AiInvokeResponse,
  type WsEventBus,
  type WsEvent,
  type WsUnsubscribe,
  InMemoryProjectStore,
  StubAiInvokePort,
  type StubAiInvokeOptions,
  InMemoryWsEventBus,
} from './ports.js';
export {
  attachWsGateway,
  parseWsPath,
  type WsGatewayOptions,
  type WsGatewayHandle,
  type WsAuthResult,
  type ParsedWsPath,
} from './ws.js';

// CLI bootstrap — `tsx src/index.ts`.
import { createServer } from 'node:http';
import { createApiGatewayApp, API_GATEWAY_SPRINT } from './app.js';
import { attachWsGateway } from './ws.js';
import {
  InMemoryProjectStore,
  InMemoryWsEventBus,
  StubAiInvokePort,
} from './ports.js';
import { InMemoryAiSpendStore } from '@pryzm/ai-spend';
import { InMemoryOverrideStore } from '@pryzm/admin-overrides';
import { getDefaultCatalog } from '@pryzm/formula-library';
import { planCritiqueDescriptor } from '@pryzm/ai-host';

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number.parseInt(process.env.API_GATEWAY_PORT ?? '5101', 10);

  const projects = new InMemoryProjectStore();
  const wsBus = new InMemoryWsEventBus();
  const aiPort = new StubAiInvokePort({ workflows: [planCritiqueDescriptor] });

  const { app } = createApiGatewayApp({
    exportPort: projects,
    importPort: projects,
    aiPort,
    spendStore: new InMemoryAiSpendStore(),
    overrideStore: new InMemoryOverrideStore(),
    formulaCatalog: getDefaultCatalog(),
    wsBus,
  });

  const server = createServer(app);
  attachWsGateway(server, {
    bus: wsBus,
    allowQueryToken: true,
    authResolver: (token) => (token ? { subject: 'demo', scopes: ['project:read'] } : null),
  });
  server.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`[api-gateway:${API_GATEWAY_SPRINT}] listening on :${port}`);
  });
}
