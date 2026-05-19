import type { Express } from 'express';
import { createServer, type Server } from 'node:http';
import {
  createApiGatewayApp,
  InMemoryProjectStore,
  InMemoryWsEventBus,
  StubAiInvokePort,
  type ApiGatewayApp,
} from '../src/index.js';
import { InMemoryAiSpendStore, type AiSpendEntry } from '@pryzm/ai-spend';
import { InMemoryOverrideStore } from '@pryzm/admin-overrides';
import { buildCatalogWithBuiltins } from '@pryzm/formula-library';
import type { WorkflowDescriptor } from '@pryzm/ai-host';
import { InMemoryWebhookStore, type FetchLike, type WebhookStore } from '@pryzm/webhooks';

export interface TestRig {
  readonly baseUrl: string;
  readonly server: Server;
  readonly app: Express;
  readonly gateway: ApiGatewayApp;
  readonly projects: InMemoryProjectStore;
  readonly wsBus: InMemoryWsEventBus;
  readonly aiPort: StubAiInvokePort;
  readonly spendStore: InMemoryAiSpendStore;
  readonly overrideStore: InMemoryOverrideStore;
  readonly webhookStore: WebhookStore;
  close(): Promise<void>;
}

export interface TestRigOptions {
  readonly workflows?: readonly WorkflowDescriptor[];
  readonly seedSpend?: readonly AiSpendEntry[];
  readonly webhookFetch?: FetchLike;
  readonly webhookClock?: () => number;
}

const STUB_WORKFLOW: WorkflowDescriptor = Object.freeze({
  id: 'plan.critique',
  title: 'Plan Critique',
  kind: 'plan-critique',
  estimatedCostUsd: 0.05,
});

const STUB_WORKFLOW_2: WorkflowDescriptor = Object.freeze({
  id: 'auto.layout',
  title: 'Auto Layout',
  kind: 'auto-layout',
  estimatedCostUsd: 0.10,
});

export async function startRig(opts: TestRigOptions = {}): Promise<TestRig> {
  const projects = new InMemoryProjectStore();
  const wsBus = new InMemoryWsEventBus();
  const workflows = opts.workflows ?? [STUB_WORKFLOW, STUB_WORKFLOW_2];
  const aiPort = new StubAiInvokePort({ workflows });
  const spendStore = new InMemoryAiSpendStore({
    ...(opts.seedSpend ? { seed: opts.seedSpend } : {}),
  });
  const overrideStore = new InMemoryOverrideStore();
  const formulaCatalog = buildCatalogWithBuiltins();
  formulaCatalog.freeze();
  const webhookStore = new InMemoryWebhookStore({
    idFactory: (() => { let n = 0; return () => `wh_test_${++n}`; })(),
    secretFactory: () => 'k'.repeat(32),
  });

  const gateway = createApiGatewayApp({
    exportPort: projects,
    importPort: projects,
    aiPort,
    spendStore,
    overrideStore,
    formulaCatalog,
    wsBus,
    webhookStore,
    ...(opts.webhookFetch !== undefined ? { webhookFetch: opts.webhookFetch } : {}),
    ...(opts.webhookClock !== undefined ? { webhookClock: opts.webhookClock } : {}),
  });

  const server = createServer(gateway.app);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const addr = server.address();
  if (!addr || typeof addr === 'string') throw new Error('failed to bind');
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  return {
    baseUrl,
    server,
    app: gateway.app,
    gateway,
    projects,
    wsBus,
    aiPort,
    spendStore,
    overrideStore,
    webhookStore,
    close: () => new Promise((resolve, reject) => {
      server.close((e) => (e ? reject(e) : resolve()));
    }),
  };
}

/** Helper headers for the default test auth shim. */
export function authHeaders(opts: {
  subject?: string;
  scopes?: readonly string[];
  roles?: readonly string[];
  tier?: 'free' | 'paid';
} = {}): Record<string, string> {
  const h: Record<string, string> = {};
  if (opts.subject) h['x-test-subject'] = opts.subject;
  if (opts.scopes) h['x-test-scopes'] = opts.scopes.join(' ');
  if (opts.roles) h['x-test-roles'] = opts.roles.join(' ');
  if (opts.tier) h['x-test-tier'] = opts.tier;
  return h;
}

/** Minimal valid PK ZIP file bytes — the in-memory import port checks magic only. */
export function tinyZipBytes(): Uint8Array {
  // PK\x03\x04 ... empty central directory ... end-of-central-directory
  return new Uint8Array([
    0x50, 0x4b, 0x05, 0x06, // EOCD signature
    0x00, 0x00, 0x00, 0x00, // disk numbers
    0x00, 0x00, 0x00, 0x00, // entries
    0x00, 0x00, 0x00, 0x00, // central dir size
    0x00, 0x00, 0x00, 0x00, // central dir offset
    0x00, 0x00,             // comment length
  ]);
}
