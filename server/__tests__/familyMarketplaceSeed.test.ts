// familyMarketplaceSeed.test.ts — lane U-SEED, acceptance (b).
//
// The store starts EMPTY, so before this lane `GET /api/v1/families` served a
// first-time user an empty catalogue and the Components browser had nothing to
// load. This suite proves the STARTER LIBRARY is served:
//   • GET /api/v1/families returns the three starters (Window, Door, Panel);
//   • GET /api/v1/families/:id/download streams REAL `.pryzm-family` bytes that
//     unpack cleanly and carry the §64 GlassWidth formula on the Window;
//   • the seed is OPT-IN — a router built WITHOUT `{ seed: true }` stays empty,
//     so the publish-flow suites are unaffected.
//
// ⚠ Drives a real `http.createServer(app).listen(0)` + `fetch` — the harness the
//   other server/__tests__ suites use (no supertest in this workspace).
// ⚠ Imports `@pryzm/file-format/server` (NOT the root barrel) — the node-safe
//   entry with no pdfjs/DOMMatrix module-scope evaluation, matching the routes.

import { describe, expect, it, beforeEach } from 'vitest';
import express from 'express';
import { createServer, type Server } from 'http';
import type { AddressInfo } from 'net';
import { unpackFamily } from '@pryzm/file-format/server';

import {
  buildFamilyMarketplaceRouter,
  clearFamilyMarketplaceStore,
} from '../familyMarketplaceRoutes.js';
import { STARTER_COMPONENT_IDS } from '../familySeeds.js';

function makeApp(seed: boolean): express.Express {
  const app = express();
  app.use(
    '/api/v1/families',
    buildFamilyMarketplaceRouter({ publicBaseUrl: 'http://test', seed }),
  );
  return app;
}

async function withServer<T>(app: express.Express, fn: (base: string) => Promise<T>): Promise<T> {
  const server: Server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  try {
    return await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

describe('family marketplace — starter seed (lane U-SEED)', () => {
  beforeEach(() => {
    clearFamilyMarketplaceStore();
  });

  it('GET /api/v1/families returns the three starters', async () => {
    await withServer(makeApp(true), async (base) => {
      const res = await fetch(`${base}/api/v1/families`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { families: Array<Record<string, unknown>> };
      expect(body.families.length).toBeGreaterThanOrEqual(3);

      const byId = new Map(body.families.map((f) => [f.id as string, f]));
      expect(byId.has(STARTER_COMPONENT_IDS.window)).toBe(true);
      expect(byId.has(STARTER_COMPONENT_IDS.door)).toBe(true);
      expect(byId.has(STARTER_COMPONENT_IDS.panel)).toBe(true);

      const win = byId.get(STARTER_COMPONENT_IDS.window)!;
      expect(win.name).toBe('Window');
      expect(win.category).toBe('Window');
      expect(win.ifcEntity).toBe('IfcWindow');
      expect(String(win.schemaHash)).toMatch(/^sha256:[0-9a-f]{64}$/);

      const door = byId.get(STARTER_COMPONENT_IDS.door)!;
      expect(door.name).toBe('Door');
      expect(door.ifcEntity).toBe('IfcDoor');

      const panel = byId.get(STARTER_COMPONENT_IDS.panel)!;
      expect(panel.name).toBe('Panel');
    });
  });

  it('GET /:id/download streams REAL bytes that unpack, with the Window formula intact', async () => {
    await withServer(makeApp(true), async (base) => {
      const dl = await fetch(`${base}/api/v1/families/${STARTER_COMPONENT_IDS.window}/download`);
      expect(dl.status).toBe(200);
      expect(dl.headers.get('content-type')).toBe('application/vnd.pryzm.family');

      const bytes = new Uint8Array(await dl.arrayBuffer());
      expect(bytes.byteLength).toBeGreaterThan(0);

      const unpacked = await unpackFamily({ bytes, verifySchemaHash: true });
      expect(unpacked.ok, unpacked.ok ? '' : (unpacked as { message: string }).message).toBe(true);
      if (!unpacked.ok) return;
      expect(unpacked.manifest.name).toBe('Window');
      const glass = unpacked.document.parameters.find((p) => p.name === 'GlassWidth');
      expect(glass, 'the Window carries the derived GlassWidth parameter').toBeDefined();
      expect(glass!.expression).toBe('Width - 2 * FrameWidth');
    });
  });

  it('the seed is OPT-IN — a router built without { seed:true } stays empty', async () => {
    await withServer(makeApp(false), async (base) => {
      const res = await fetch(`${base}/api/v1/families`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { families: unknown[] };
      expect(body.families).toEqual([]);
    });
  });
});
