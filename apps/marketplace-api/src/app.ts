/**
 * Express app factory for the PRYZM marketplace API — S64 D1.
 *
 * Routes live here as a flat module so that route addition at D2-D9 is a
 * single-file diff.  Auth, scope-check, rate-limit are wired via
 * @pryzm/api-rbac + @pryzm/rate-limit consistent with ADR-0039.
 *
 * D1 scope (per phase-doc-2 §S64 D1):
 *   GET  /v1/plugins                        list (rate-limited READ)
 *   GET  /v1/plugins/:pluginId              detail (rate-limited READ)
 *   GET  /v1/plugins/:pluginId/versions     versions list (rate-limited READ)
 *   GET  /v1/revocations.json               CRL (rate-limited READ, no auth)
 *   POST /v1/plugins/:pluginId/versions     publish a signed version (rate-limited WRITE, scope project:write)
 *   POST /v1/admin/plugins/:pluginId/versions/:version/revoke
 *                                           revoke (rate-limited WRITE, scope project:write)
 *
 * D2-D9 will add: install/uninstall flows, third-party publisher
 * onboarding, full bundle storage, marketplace UI feed, audit-passed
 * gating, etc.
 */

import express, { type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import {
  ALL_API_SCOPES,
  requireScopes,
  type AuthenticatedRequest,
} from '@pryzm/api-rbac';
import { rateLimit, RateLimitRegistry, type RateLimitedRequest } from '@pryzm/rate-limit';
import { verifyPluginSignature, RevocationList } from '@pryzm/plugin-sdk/signing';
import { validateManifest } from '@pryzm/plugin-sdk/descriptor';
import {
  createInMemoryStore,
  type MarketplaceStore,
} from './store/in-memory.js';
import {
  PluginIdSchema,
  StrictSemverSchema,
  MarketplacePluginVersionSchema,
} from './types.js';

export interface MarketplaceAppOptions {
  /** Inject a custom store (e.g. Postgres-backed at S64 D2+). */
  readonly store?: MarketplaceStore;
  /**
   * Inject an auth-shim middleware. The default no-op shim trusts
   * `X-Test-Subject` + `X-Test-Scopes` headers — used by tests.
   * Production wires the real OAuth2 resource-server adapter here.
   */
  readonly authShim?: express.RequestHandler;
}

export interface MarketplaceApp {
  readonly app: express.Express;
  readonly store: MarketplaceStore;
}

export function createMarketplaceApp(opts: MarketplaceAppOptions = {}): MarketplaceApp {
  const store = opts.store ?? createInMemoryStore();
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '5mb' }));

  // Per-app rate-limit registries so reads + writes have isolated buckets.
  const reads = new RateLimitRegistry();
  const writes = new RateLimitRegistry();

  // Auth shim — production wires the real OAuth2 resource server here.
  const authShim = opts.authShim ?? defaultTestAuthShim;
  app.use(authShim);

  const readLimited = rateLimit({ kind: 'read', registry: reads });
  const writeLimited = rateLimit({ kind: 'write', registry: writes });

  // ── PUBLIC READ-ONLY ENDPOINTS ──────────────────────────────────────

  app.get('/v1/health', (_req, res) => {
    res.json({ status: 'ok', sprint: 'S64-D1', sizes: store.size() });
  });

  app.get('/v1/plugins', readLimited, (req, res) => {
    const q = ListPluginsQuerySchema.safeParse(req.query);
    if (!q.success) {
      res.status(400).json({ error: 'invalid_query', issues: q.error.issues });
      return;
    }
    const result = store.listPlugins(q.data);
    res.json(result);
  });

  app.get('/v1/plugins/:publisher/:slug', readLimited, (req, res) => {
    const pluginId = `${req.params.publisher}/${req.params.slug}`;
    const idCheck = PluginIdSchema.safeParse(pluginId);
    if (!idCheck.success) { res.status(400).json({ error: 'invalid_plugin_id' }); return; }
    const plugin = store.getPlugin(pluginId);
    if (!plugin) { res.status(404).json({ error: 'not_found' }); return; }
    res.json(plugin);
  });

  app.get('/v1/plugins/:publisher/:slug/versions', readLimited, (req, res) => {
    const pluginId = `${req.params.publisher}/${req.params.slug}`;
    const idCheck = PluginIdSchema.safeParse(pluginId);
    if (!idCheck.success) { res.status(400).json({ error: 'invalid_plugin_id' }); return; }
    if (!store.getPlugin(pluginId)) { res.status(404).json({ error: 'not_found' }); return; }
    res.json({ items: store.listVersions(pluginId) });
  });

  app.get('/v1/revocations.json', readLimited, (_req, res) => {
    res.json(store.getRevocationList());
  });

  // ── AUTHENTICATED WRITE ENDPOINTS ───────────────────────────────────

  app.post(
    '/v1/plugins/:publisher/:slug/versions',
    writeLimited,
    requireScopes(['project:write']),
    async (req, res) => {
      const pluginId = `${req.params.publisher}/${req.params.slug}`;
      const idCheck = PluginIdSchema.safeParse(pluginId);
      if (!idCheck.success) { res.status(400).json({ error: 'invalid_plugin_id' }); return; }
      const plugin = store.getPlugin(pluginId);
      if (!plugin) { res.status(404).json({ error: 'plugin_not_found' }); return; }

      const body = PublishVersionBodySchema.safeParse(req.body);
      if (!body.success) {
        res.status(400).json({ error: 'invalid_body', issues: body.error.issues });
        return;
      }

      const manifestCheck = validateManifest(body.data.signature.payload.manifest);
      if (!manifestCheck.ok) {
        res.status(400).json({ error: 'invalid_manifest', errors: manifestCheck.errors });
        return;
      }

      // Cryptographic + revocation verification using @pryzm/plugin-sdk/signing.
      const crl = store.getRevocationList();
      const revocations = new RevocationList({
        revokedPublisherKeysB64: crl.revokedPublisherKeysB64,
        revokedPluginIdAtVersion: crl.revokedPluginIdAtVersion,
        issuedAt: crl.issuedAt,
      });
      // Cast: D1 accepts any caller-provided manifest object; descriptor
      // schema validation has already passed above.
      const expectedManifest = body.data.signature.payload.manifest as Parameters<typeof verifyPluginSignature>[1]['manifest'];
      const verification = await verifyPluginSignature(
        body.data.signature as Parameters<typeof verifyPluginSignature>[0],
        { manifest: expectedManifest, fileSha256: body.data.bundleSha256 },
        revocations,
      );
      if (!verification.ok) {
        res.status(403).json({ error: 'signature_rejected', reason: verification.reason });
        return;
      }

      const publisher = store.getPublisher(plugin.publisherId);
      if (!publisher) {
        res.status(409).json({ error: 'publisher_missing' });
        return;
      }
      if (publisher.publicKeyB64 !== body.data.signature.publisherPublicKeyB64) {
        res.status(403).json({ error: 'publisher_key_mismatch' });
        return;
      }

      const version: z.infer<typeof MarketplacePluginVersionSchema> = {
        pluginId,
        version: body.data.version,
        signature: body.data.signature.signatureB64,
        signedByKeyid: body.data.signature.publisherPublicKeyB64,
        bundleUrl: body.data.bundleUrl,
        bundleSha256: body.data.bundleSha256,
        publishedAt: new Date().toISOString(),
        revokedAt: null,
        revokeReason: null,
      };
      try {
        store.insertVersion(version);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes('duplicate')) { res.status(409).json({ error: 'version_exists' }); return; }
        throw e;
      }
      res.status(201).json(version);
    },
  );

  app.post(
    '/v1/admin/plugins/:publisher/:slug/versions/:version/revoke',
    writeLimited,
    requireScopes(['project:write']),
    (req, res) => {
      const pluginId = `${req.params.publisher}/${req.params.slug}`;
      const versionStr = req.params.version ?? '';
      const idCheck = PluginIdSchema.safeParse(pluginId);
      const versionCheck = StrictSemverSchema.safeParse(versionStr);
      if (!idCheck.success || !versionCheck.success) { res.status(400).json({ error: 'invalid_path' }); return; }
      const reason = (typeof req.body?.reason === 'string' && req.body.reason) || 'unspecified';
      const ok = store.revokeVersion(pluginId, versionStr, reason, new Date().toISOString());
      if (!ok) { res.status(404).json({ error: 'version_not_found' }); return; }
      res.status(204).end();
    },
  );

  // ── ERROR HANDLER (LAST) ────────────────────────────────────────────
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const message = err instanceof Error ? err.message : 'internal_error';
    res.status(500).json({ error: 'internal_error', message });
  });

  return { app, store };
}

// ──────────────────────────────────────────────────────────────────────
//  Schemas
// ──────────────────────────────────────────────────────────────────────

const ListPluginsQuerySchema = z.object({
  category: z.string().optional(),
  publisherId: z.string().optional(),
  isFirstParty: z.preprocess((v) => v === 'true' ? true : v === 'false' ? false : v, z.boolean().optional()),
  search: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

const PluginSignatureSchema = z.object({
  payload: z.object({
    manifest: z.unknown(),
    fileSha256: z.string().regex(/^[0-9a-f]{64}$/),
    signedAt: z.string(),
  }),
  signatureB64: z.string().min(1),
  publisherPublicKeyB64: z.string().min(1),
});

const PublishVersionBodySchema = z.object({
  version: StrictSemverSchema,
  bundleUrl: z.string().url(),
  bundleSha256: z.string().regex(/^[0-9a-f]{64}$/),
  signature: PluginSignatureSchema,
});

// ──────────────────────────────────────────────────────────────────────
//  Default test auth shim — trusts X-Test-* headers
// ──────────────────────────────────────────────────────────────────────

interface AugmentedRequest extends Request, AuthenticatedRequest, RateLimitedRequest {}

function defaultTestAuthShim(req: Request, _res: Response, next: NextFunction): void {
  const r = req as AugmentedRequest;
  const subject = (req.header('x-test-subject') ?? req.ip) || 'anonymous';
  const scopesHeader = req.header('x-test-scopes') ?? '';
  const scopes = scopesHeader.split(/\s+/).filter((s) => (ALL_API_SCOPES as readonly string[]).includes(s));
  (r as { auth?: unknown }).auth = { subject, scopes, tier: 'free' as const };
  next();
}
