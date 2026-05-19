const MARKETPLACE_BASE = '/marketplace/api';

// ── Domain types ───────────────────────────────────────────────────────────

/**
 * Camelcase view of a marketplace_plugins row (or seed entry).
 * The API client normalizes raw snake_case DB output to this shape so that
 * App.tsx never has to touch raw wire fields.
 */
export interface MarketplacePlugin {
  pluginId: string;
  displayName: string;
  version: string;
  description: string;
  publisherId: string;
  category: string;
  /** Surface identifiers extracted from the permissions array (e.g. 'tool', 'panel', 'command'). */
  surfaces: string[];
  installCount: number;
  rating: number;
  license: string;
  tags: string[];
  icon: string | null;
  bundleUrl: string | null;
  bundleSha256: string | null;
  isFirstParty: boolean;
  auditPassed: boolean;
  homepageUrl: string | null;
  createdAt: string;
}

export interface PluginVersion {
  pluginId: string;
  version: string;
  bundleUrl: string | null;
  bundleSha256: string | null;
  publishedAt: string;
  revokedAt: string | null;
}

export interface PublisherKey {
  id: string;
  publicKeyB64: string;
  keyName: string;
  createdAt: string;
  revokedAt: string | null;
}

export interface PluginSignature {
  payload: {
    manifest: Record<string, unknown>;
    fileSha256: string;
    signedAt: string;
  };
  signatureB64: string;
  publisherPublicKeyB64: string;
}

export interface SubmitPluginResult {
  ok: boolean;
  reviewId: string;
  signatureVerified: boolean;
  message: string;
  estimatedReviewTime: string;
}

export interface InstallPluginResult {
  ok: boolean;
  pluginId: string;
  version: string;
  bundleUrl: string | null;
  bundleSha256: string | null;
  signatureVerified: boolean;
  isReference: boolean;
  installInstructions: string;
}

export interface PurchaseSessionResult {
  ok: boolean;
  sessionUrl: string;
  sessionId: string;
  pluginId: string;
  priceCents: number;
  currency: string;
}

export interface PurchaseStatusResult {
  ok: boolean;
  pluginId: string;
  purchased: boolean;
  status: 'pending' | 'completed' | 'refunded' | 'not_purchased';
  purchasedAt: string | null;
}

export interface PluginReview {
  id: string;
  pluginId: string;
  userId: string;
  reviewerLabel: string;
  rating: number;
  body: string;
  createdAt: string;
  updatedAt: string;
  isOwn: boolean;
}

export interface ReviewListResult {
  reviews: PluginReview[];
  total: number;
  averageRating: number;
  ratingCount: number;
}

export interface RevocationList {
  revokedPublisherKeysB64: string[];
  revokedPluginIdAtVersion: string[];
  issuedAt: string;
}

// ── Normalizer ─────────────────────────────────────────────────────────────

const SURFACE_KEYS = new Set(['tool', 'panel', 'command', 'element-type', 'view-template']);

/**
 * Normalizes a raw DB/seed row (snake_case) to the camelCase MarketplacePlugin shape.
 * Any unknown or missing fields fall back to safe defaults so callers never see undefined.
 */
function normalize(raw: Record<string, unknown>): MarketplacePlugin {
  const permissions = Array.isArray(raw.permissions) ? (raw.permissions as string[]) : [];
  return {
    pluginId:     String(raw.id ?? raw.plugin_id ?? ''),
    displayName:  String(raw.name ?? raw.display_name ?? ''),
    version:      String(raw.version ?? '1.0.0'),
    description:  String(raw.description ?? ''),
    publisherId:  String(raw.publisher ?? raw.publisher_id ?? ''),
    category:     String(raw.category ?? 'other'),
    surfaces:     permissions.filter(p => SURFACE_KEYS.has(p)),
    installCount: Number(raw.downloads ?? raw.install_count ?? 0),
    rating:       Number(raw.rating ?? 0),
    license:      String(raw.price ?? raw.license ?? 'free'),
    tags:         Array.isArray(raw.tags) ? (raw.tags as string[]) : [],
    icon:         typeof raw.icon === 'string' ? raw.icon : null,
    bundleUrl:    typeof raw.bundle_url === 'string' ? raw.bundle_url : null,
    bundleSha256: typeof raw.bundle_sha256 === 'string' ? raw.bundle_sha256 : null,
    isFirstParty: Boolean(raw.is_reference ?? raw.is_first_party ?? false),
    auditPassed:
      raw.review_status === 'approved' ||
      Boolean(raw.audit_passed ?? raw.is_reference ?? false),
    homepageUrl:  typeof raw.homepage_url === 'string' ? raw.homepage_url : null,
    createdAt:    String(raw.submitted_at ?? raw.created_at ?? new Date().toISOString()),
  };
}

// ── HTTP helpers ───────────────────────────────────────────────────────────

async function get<T>(path: string, token?: string): Promise<T> {
  const headers: Record<string, string> = {};
  if (token) headers['authorization'] = `Bearer ${token}`;
  const res = await fetch(`${MARKETPLACE_BASE}${path}`, { headers });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

async function post<T>(path: string, body: unknown, token?: string): Promise<T> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (token) headers['authorization'] = `Bearer ${token}`;
  const res = await fetch(`${MARKETPLACE_BASE}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

// ── API client ─────────────────────────────────────────────────────────────

export const api = {
  /**
   * Browse the plugin catalog with optional search and category filters.
   * Accepts a flat offset model and converts to server page/perPage internally
   * so callers don't need to know the server's pagination scheme.
   */
  async listPlugins(
    params: { search?: string; category?: string; limit?: number; offset?: number } = {},
    token?: string,
  ): Promise<{ items: MarketplacePlugin[]; total: number }> {
    const qs = new URLSearchParams();
    if (params.search)   qs.set('q',        params.search);
    if (params.category) qs.set('category', params.category);
    const perPage = params.limit ?? 20;
    const page    = params.offset != null ? Math.floor(params.offset / perPage) + 1 : 1;
    qs.set('per_page', String(perPage));
    qs.set('page',     String(page));

    const raw = await get<{ plugins: Record<string, unknown>[]; total: number }>(
      `/plugins?${qs.toString()}`,
      token,
    );
    return { items: (raw.plugins ?? []).map(normalize), total: raw.total ?? 0 };
  },

  /** Fetch a single plugin by ID and return the normalized camelCase shape. */
  async getPlugin(pluginId: string, token?: string): Promise<MarketplacePlugin> {
    const raw = await get<Record<string, unknown>>(
      `/plugins/${encodeURIComponent(pluginId)}`,
      token,
    );
    return normalize(raw);
  },

  /**
   * List released versions for a plugin.
   * Calls GET /plugins/:id/versions on the server; if the endpoint is absent
   * (404 or network error) it falls back to synthesizing a single-entry array
   * from the plugin record itself so the detail page always has something to show.
   */
  async listVersions(pluginId: string, token?: string): Promise<PluginVersion[]> {
    try {
      return await get<PluginVersion[]>(
        `/plugins/${encodeURIComponent(pluginId)}/versions`,
        token,
      );
    } catch {
      try {
        const p = await this.getPlugin(pluginId, token);
        return [{
          pluginId:     p.pluginId,
          version:      p.version,
          bundleUrl:    p.bundleUrl,
          bundleSha256: p.bundleSha256,
          publishedAt:  p.createdAt,
          revokedAt:    null,
        }];
      } catch {
        return [];
      }
    }
  },

  getRevocations(): Promise<RevocationList> {
    return get<RevocationList>('/revocations.json');
  },

  registerPublisherKey(
    opts: { publicKeyB64: string; keyName?: string },
    token: string,
  ): Promise<{ ok: boolean; key: PublisherKey }> {
    return post(
      '/publishers/register-key',
      { publicKeyB64: opts.publicKeyB64, keyName: opts.keyName ?? 'default' },
      token,
    );
  },

  listPublisherKeys(token: string): Promise<{ keys: PublisherKey[] }> {
    return get<{ keys: PublisherKey[] }>('/publishers/keys', token);
  },

  submitPlugin(
    opts: {
      manifest: Record<string, unknown>;
      signature: PluginSignature;
      bundleUrl?: string;
      bundleSha256?: string;
    },
    token: string,
  ): Promise<SubmitPluginResult> {
    return post<SubmitPluginResult>(
      '/plugins/submit',
      {
        manifest:     opts.manifest,
        signature:    opts.signature,
        bundleUrl:    opts.bundleUrl,
        bundleSha256: opts.bundleSha256,
      },
      token,
    );
  },

  installPlugin(pluginId: string, token: string): Promise<InstallPluginResult> {
    return post<InstallPluginResult>(
      `/plugins/${encodeURIComponent(pluginId)}/install`,
      {},
      token,
    );
  },

  createPurchaseSession(
    pluginId: string,
    opts: { successUrl: string; cancelUrl: string },
    token: string,
  ): Promise<PurchaseSessionResult> {
    return post<PurchaseSessionResult>(
      `/plugins/${encodeURIComponent(pluginId)}/checkout`,
      { successUrl: opts.successUrl, cancelUrl: opts.cancelUrl },
      token,
    );
  },

  getPurchaseStatus(pluginId: string, token: string): Promise<PurchaseStatusResult> {
    return get<PurchaseStatusResult>(
      `/plugins/${encodeURIComponent(pluginId)}/purchase-status`,
      token,
    );
  },

  listReviews(pluginId: string, token?: string): Promise<ReviewListResult> {
    return get<ReviewListResult>(
      `/plugins/${encodeURIComponent(pluginId)}/reviews`,
      token,
    );
  },

  submitReview(
    pluginId: string,
    opts: { rating: number; body?: string },
    token: string,
  ): Promise<{ ok: boolean; review: PluginReview }> {
    return post(
      `/plugins/${encodeURIComponent(pluginId)}/reviews`,
      { rating: opts.rating, body: opts.body ?? '' },
      token,
    );
  },

  submitVersion(
    pluginId: string,
    version: string,
    opts: { signature: string; bundleUrl: string; bundleSha256: string; signedByKeyid: string },
    token: string,
  ): Promise<{ accepted: boolean; versionId: string }> {
    return post(
      `/plugins/${encodeURIComponent(pluginId)}/versions`,
      {
        version:       version,
        signature:     opts.signature,
        bundleUrl:     opts.bundleUrl,
        bundleSha256:  opts.bundleSha256,
        signedByKeyid: opts.signedByKeyid,
        publishedAt:   new Date().toISOString(),
        revokedAt:     null,
        revokeReason:  null,
      },
      token,
    );
  },
};
