import { describe, it, expect, beforeEach } from 'vitest';
import {
  createMarketplaceApp,
  createInMemoryStore,
  seedFirstParty,
  FIRST_PARTY_PLUGINS,
  FIRST_PARTY_AGGREGATE,
  PRYZM_FIRST_PARTY_PUBLISHER_ID,
} from '../src/index.js';
import { generateKeyPair, makePluginSignature, sha256OfBytes } from '@pryzm/plugin-sdk/signing';

/**
 * S64 D1 marketplace skeleton tests.  Uses node:http + fetch instead of
 * supertest to keep the dep graph minimal — express 5 + node 20's
 * built-in fetch are enough.
 */

async function withApp(): Promise<{
  baseUrl: string;
  close: () => Promise<void>;
  store: ReturnType<typeof createInMemoryStore>;
}> {
  const store = createInMemoryStore();
  const { app } = createMarketplaceApp({ store });
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  const addr = server.address();
  if (!addr || typeof addr === 'string') throw new Error('failed to bind');
  const baseUrl = `http://127.0.0.1:${addr.port}`;
  return {
    baseUrl,
    store,
    close: () => new Promise((resolve, reject) => server.close((e) => (e ? reject(e) : resolve()))),
  };
}

describe('seedFirstParty + inventory', () => {
  it('FIRST_PARTY_PLUGINS has exactly 38 entries (matches internal-plugin-inventory.md)', () => {
    expect(FIRST_PARTY_PLUGINS).toHaveLength(38);
    expect(FIRST_PARTY_AGGREGATE.total).toBe(38);
  });

  it('every entry has a valid plugin-slug + non-empty display name + description', () => {
    const seen = new Set<string>();
    for (const e of FIRST_PARTY_PLUGINS) {
      expect(e.slug).toMatch(/^[a-z][a-z0-9-]{1,63}$/);
      expect(e.displayName.length).toBeGreaterThanOrEqual(2);
      expect(e.description.length).toBeGreaterThan(0);
      expect(seen.has(e.slug), `duplicate slug ${e.slug}`).toBe(false);
      seen.add(e.slug);
    }
  });

  it('seedFirstParty inserts 1 publisher + 38 plugins', () => {
    const store = createInMemoryStore();
    const result = seedFirstParty(store, { now: () => '2026-04-28T00:00:00.000Z' });
    expect(result.publishersInserted).toBe(1);
    expect(result.pluginsInserted).toBe(38);
    expect(store.size().publishers).toBe(1);
    expect(store.size().plugins).toBe(38);
  });

  it('seedFirstParty is idempotent (re-run upserts every row)', () => {
    const store = createInMemoryStore();
    seedFirstParty(store);
    const sizeAfterFirst = store.size();
    seedFirstParty(store);
    expect(store.size()).toEqual(sizeAfterFirst);
  });

  it('every seeded plugin id is `pryzm/<slug>`', () => {
    const store = createInMemoryStore();
    seedFirstParty(store);
    const list = store.listPlugins({ limit: 200 });
    expect(list.total).toBe(38);
    for (const p of list.items) {
      expect(p.publisherId).toBe(PRYZM_FIRST_PARTY_PUBLISHER_ID);
      expect(p.pluginId.startsWith('pryzm/')).toBe(true);
      expect(p.isFirstParty).toBe(true);
      expect(p.auditPassed).toBe(true);
    }
  });
});

describe('GET /v1/health', () => {
  it('returns ok + sprint marker', async () => {
    const ctx = await withApp();
    try {
      const res = await fetch(`${ctx.baseUrl}/v1/health`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe('ok');
      expect(body.sprint).toBe('S64-D1');
    } finally { await ctx.close(); }
  });
});

describe('GET /v1/plugins', () => {
  it('returns the seeded first-party plugins (paged + sorted)', async () => {
    const ctx = await withApp();
    try {
      seedFirstParty(ctx.store);
      const res = await fetch(`${ctx.baseUrl}/v1/plugins?limit=5`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.total).toBe(38);
      expect(body.items).toHaveLength(5);
      // Sort: install_count desc → all 0 → tie-break by plugin_id asc.
      const ids = body.items.map((p: { pluginId: string }) => p.pluginId);
      expect(ids).toEqual([...ids].sort());
    } finally { await ctx.close(); }
  });

  it('filters by category', async () => {
    const ctx = await withApp();
    try {
      seedFirstParty(ctx.store);
      const res = await fetch(`${ctx.baseUrl}/v1/plugins?category=ai&limit=200`);
      const body = await res.json();
      expect(body.items.length).toBeGreaterThan(0);
      for (const p of body.items) expect(p.category).toBe('ai');
    } finally { await ctx.close(); }
  });

  it('search is substring-match on id/displayName/description', async () => {
    const ctx = await withApp();
    try {
      seedFirstParty(ctx.store);
      const res = await fetch(`${ctx.baseUrl}/v1/plugins?search=floorplan`);
      const body = await res.json();
      expect(body.items.length).toBe(1);
      expect(body.items[0].pluginId).toBe('pryzm/ai-floorplan');
    } finally { await ctx.close(); }
  });

  it('400 on invalid query', async () => {
    const ctx = await withApp();
    try {
      const res = await fetch(`${ctx.baseUrl}/v1/plugins?limit=999`);
      expect(res.status).toBe(400);
    } finally { await ctx.close(); }
  });
});

describe('GET /v1/plugins/:publisher/:slug', () => {
  it('200 + body for a known plugin', async () => {
    const ctx = await withApp();
    try {
      seedFirstParty(ctx.store);
      const res = await fetch(`${ctx.baseUrl}/v1/plugins/pryzm/wall`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.pluginId).toBe('pryzm/wall');
      expect(body.displayName).toBe('Wall');
    } finally { await ctx.close(); }
  });

  it('404 for an unknown plugin', async () => {
    const ctx = await withApp();
    try {
      seedFirstParty(ctx.store);
      const res = await fetch(`${ctx.baseUrl}/v1/plugins/pryzm/nonexistent`);
      expect(res.status).toBe(404);
    } finally { await ctx.close(); }
  });
});

describe('GET /v1/plugins/:publisher/:slug/versions', () => {
  it('returns an empty list for a freshly seeded plugin', async () => {
    const ctx = await withApp();
    try {
      seedFirstParty(ctx.store);
      const res = await fetch(`${ctx.baseUrl}/v1/plugins/pryzm/wall/versions`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.items).toEqual([]);
    } finally { await ctx.close(); }
  });
});

describe('POST /v1/plugins/:publisher/:slug/versions — sign-verify path', () => {
  async function setup() {
    const ctx = await withApp();
    seedFirstParty(ctx.store);
    // Replace the placeholder publisher key with a real one we control.
    const kp = await generateKeyPair();
    const pub = ctx.store.getPublisher('pryzm');
    if (!pub) throw new Error('no publisher seeded');
    ctx.store.upsertPublisher({ ...pub, publicKeyB64: kp.publicKeyB64 });
    return { ctx, kp };
  }

  function manifestFor(pluginId: string) {
    return {
      pryzmPlugin: '1.0',
      id: pluginId.split('/')[1],
      version: '1.0.0',
      displayName: 'Wall (v1)',
      description: 'Wall family',
      author: 'pryzm',
      main: 'dist/index.js',
      license: 'MIT',
      permissions: ['read:project', 'write:project'],
      allowedOrigins: [],
      contributions: [],
      minPRYZMVersion: '2.0.0',
    };
  }

  it('201 on a valid signed publish', async () => {
    const { ctx, kp } = await setup();
    try {
      const tarballBytes = new TextEncoder().encode('fake-tarball-bytes');
      const fileSha256 = await sha256OfBytes(tarballBytes);
      const manifest = manifestFor('pryzm/wall');
      const signature = await makePluginSignature({ manifest, fileSha256, publisherKey: kp });

      const res = await fetch(`${ctx.baseUrl}/v1/plugins/pryzm/wall/versions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-test-subject': 'publisher-pryzm',
          'x-test-scopes': 'project:write',
        },
        body: JSON.stringify({
          version: '1.0.0',
          bundleUrl: 'https://cdn.pryzm.com/plugins/wall/1.0.0.tgz',
          bundleSha256: fileSha256,
          signature,
        }),
      });
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.pluginId).toBe('pryzm/wall');
      expect(body.version).toBe('1.0.0');
    } finally { await ctx.close(); }
  });

  it('403 when scope project:write is absent', async () => {
    const { ctx, kp } = await setup();
    try {
      const tarballBytes = new TextEncoder().encode('fake');
      const fileSha256 = await sha256OfBytes(tarballBytes);
      const manifest = manifestFor('pryzm/wall');
      const signature = await makePluginSignature({ manifest, fileSha256, publisherKey: kp });

      const res = await fetch(`${ctx.baseUrl}/v1/plugins/pryzm/wall/versions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-test-subject': 'pub',
          'x-test-scopes': 'project:read', // wrong scope
        },
        body: JSON.stringify({ version: '1.0.0', bundleUrl: 'https://x/y.tgz', bundleSha256: fileSha256, signature }),
      });
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toBe('insufficient_scope');
    } finally { await ctx.close(); }
  });

  it('403 when publisher key does not match the signature', async () => {
    const { ctx, kp } = await setup();
    try {
      // Tamper: rotate the publisher key so the signature no longer matches.
      const otherKp = await generateKeyPair();
      ctx.store.upsertPublisher({ ...ctx.store.getPublisher('pryzm')!, publicKeyB64: otherKp.publicKeyB64 });

      const tarballBytes = new TextEncoder().encode('fake');
      const fileSha256 = await sha256OfBytes(tarballBytes);
      const manifest = manifestFor('pryzm/wall');
      const signature = await makePluginSignature({ manifest, fileSha256, publisherKey: kp });

      const res = await fetch(`${ctx.baseUrl}/v1/plugins/pryzm/wall/versions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-test-subject': 'pub', 'x-test-scopes': 'project:write' },
        body: JSON.stringify({ version: '1.0.0', bundleUrl: 'https://x/y.tgz', bundleSha256: fileSha256, signature }),
      });
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toBe('publisher_key_mismatch');
    } finally { await ctx.close(); }
  });

  it('400 on an invalid manifest', async () => {
    const { ctx, kp } = await setup();
    try {
      const tarballBytes = new TextEncoder().encode('fake');
      const fileSha256 = await sha256OfBytes(tarballBytes);
      const badManifest = { ...manifestFor('pryzm/wall'), id: 'INVALID' };
      const signature = await makePluginSignature({ manifest: badManifest, fileSha256, publisherKey: kp });

      const res = await fetch(`${ctx.baseUrl}/v1/plugins/pryzm/wall/versions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-test-subject': 'pub', 'x-test-scopes': 'project:write' },
        body: JSON.stringify({ version: '1.0.0', bundleUrl: 'https://x/y.tgz', bundleSha256: fileSha256, signature }),
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('invalid_manifest');
    } finally { await ctx.close(); }
  });

  it('409 on duplicate version', async () => {
    const { ctx, kp } = await setup();
    try {
      const tarballBytes = new TextEncoder().encode('fake');
      const fileSha256 = await sha256OfBytes(tarballBytes);
      const manifest = manifestFor('pryzm/wall');
      const signature = await makePluginSignature({ manifest, fileSha256, publisherKey: kp });
      const body = JSON.stringify({ version: '1.0.0', bundleUrl: 'https://x/y.tgz', bundleSha256: fileSha256, signature });
      const headers = { 'content-type': 'application/json', 'x-test-subject': 'pub', 'x-test-scopes': 'project:write' };
      await fetch(`${ctx.baseUrl}/v1/plugins/pryzm/wall/versions`, { method: 'POST', headers, body });
      const res2 = await fetch(`${ctx.baseUrl}/v1/plugins/pryzm/wall/versions`, { method: 'POST', headers, body });
      expect(res2.status).toBe(409);
    } finally { await ctx.close(); }
  });
});

describe('Revocation', () => {
  it('GET /v1/revocations.json starts empty + grows on revoke', async () => {
    const ctx = await withApp();
    try {
      seedFirstParty(ctx.store);
      const initial = await (await fetch(`${ctx.baseUrl}/v1/revocations.json`)).json();
      expect(initial.revokedPluginIdAtVersion).toEqual([]);
      expect(initial.revokedPublisherKeysB64).toEqual([]);

      // Set up a publisher key matching what the test will sign with.
      const kp = await generateKeyPair();
      ctx.store.upsertPublisher({ ...ctx.store.getPublisher('pryzm')!, publicKeyB64: kp.publicKeyB64 });

      const tarballBytes = new TextEncoder().encode('fake');
      const fileSha256 = await sha256OfBytes(tarballBytes);
      const manifest = {
        pryzmPlugin: '1.0', id: 'wall', version: '1.0.0', displayName: 'Wall', description: 'd',
        author: 'pryzm', main: 'dist/index.js', license: 'MIT',
        permissions: ['read:project'], allowedOrigins: [], contributions: [], minPRYZMVersion: '2.0.0',
      };
      const signature = await makePluginSignature({ manifest, fileSha256, publisherKey: kp });
      await fetch(`${ctx.baseUrl}/v1/plugins/pryzm/wall/versions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-test-subject': 'pub', 'x-test-scopes': 'project:write' },
        body: JSON.stringify({ version: '1.0.0', bundleUrl: 'https://x/y.tgz', bundleSha256: fileSha256, signature }),
      });

      const revoke = await fetch(`${ctx.baseUrl}/v1/admin/plugins/pryzm/wall/versions/1.0.0/revoke`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-test-subject': 'admin', 'x-test-scopes': 'project:write' },
        body: JSON.stringify({ reason: 'security' }),
      });
      expect(revoke.status).toBe(204);

      const after = await (await fetch(`${ctx.baseUrl}/v1/revocations.json`)).json();
      expect(after.revokedPluginIdAtVersion).toEqual(['pryzm/wall@1.0.0']);
    } finally { await ctx.close(); }
  });
});

describe('Rate-limit integration (ADR-018 free tier 60 r/m)', () => {
  it('exhausting the read bucket returns 429 + Retry-After', async () => {
    const ctx = await withApp();
    try {
      seedFirstParty(ctx.store);
      let rateLimitedCount = 0;
      let lastRetryAfter = '';
      // 70 reads from the same subject should trip the 60-token bucket.
      for (let i = 0; i < 70; i++) {
        const res = await fetch(`${ctx.baseUrl}/v1/plugins?limit=1`, {
          headers: { 'x-test-subject': 'rate-test', 'x-test-scopes': 'project:read' },
        });
        if (res.status === 429) { rateLimitedCount++; lastRetryAfter = res.headers.get('retry-after') ?? ''; }
        await res.text();
      }
      expect(rateLimitedCount).toBeGreaterThan(0);
      expect(lastRetryAfter).not.toBe('');
    } finally { await ctx.close(); }
  });
});
