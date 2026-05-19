/**
 * In-memory marketplace store — D1 deliverable.
 *
 * The shape exactly matches the SQL migration in
 * `migrations/0001_marketplace_plugins.sql` so when D2-D9 swap to
 * Postgres, the upstream API + tests keep working without changes.
 *
 * Per ADR-0040 §C: at S64 D1 the store is in-memory + seeded.  D2-D5
 * promote it to Postgres + a real publisher onboarding flow.
 */

import type {
  MarketplacePlugin,
  MarketplacePluginVersion,
  Publisher,
  RevocationListResponse,
} from '../types.js';

export interface PluginListQuery {
  readonly category?: string;
  readonly publisherId?: string;
  readonly isFirstParty?: boolean;
  readonly search?: string;
  readonly limit?: number;
  readonly offset?: number;
}

export interface MarketplaceStore {
  // publishers
  upsertPublisher(p: Publisher): void;
  getPublisher(id: string): Publisher | null;
  listPublishers(): readonly Publisher[];

  // plugins
  upsertPlugin(p: MarketplacePlugin): void;
  getPlugin(pluginId: string): MarketplacePlugin | null;
  listPlugins(q?: PluginListQuery): { readonly total: number; readonly items: readonly MarketplacePlugin[] };

  // versions
  insertVersion(v: MarketplacePluginVersion): void;
  getVersion(pluginId: string, version: string): MarketplacePluginVersion | null;
  listVersions(pluginId: string): readonly MarketplacePluginVersion[];
  revokeVersion(pluginId: string, version: string, reason: string, atIso: string): boolean;

  // revocation
  revokePublisher(publisherKeyB64: string): void;
  getRevocationList(): RevocationListResponse;

  // diagnostics
  size(): { readonly publishers: number; readonly plugins: number; readonly versions: number };
  clear(): void;
}

export function createInMemoryStore(): MarketplaceStore {
  const publishers = new Map<string, Publisher>();
  const plugins = new Map<string, MarketplacePlugin>();
  /** keyed by `${pluginId}@${version}` for O(1) lookup. */
  const versions = new Map<string, MarketplacePluginVersion>();
  const revokedPublisherKeys = new Set<string>();

  function* iterVersionsFor(pluginId: string): IterableIterator<MarketplacePluginVersion> {
    for (const v of versions.values()) if (v.pluginId === pluginId) yield v;
  }

  return {
    upsertPublisher(p) { publishers.set(p.id, p); },
    getPublisher(id) { return publishers.get(id) ?? null; },
    listPublishers() { return Array.from(publishers.values()); },

    upsertPlugin(p) { plugins.set(p.pluginId, p); },
    getPlugin(pluginId) { return plugins.get(pluginId) ?? null; },
    listPlugins(q = {}) {
      const all = Array.from(plugins.values());
      const filtered = all.filter((p) => {
        if (q.category && p.category !== q.category) return false;
        if (q.publisherId && p.publisherId !== q.publisherId) return false;
        if (q.isFirstParty !== undefined && p.isFirstParty !== q.isFirstParty) return false;
        if (q.search) {
          const needle = q.search.toLowerCase();
          if (!p.pluginId.toLowerCase().includes(needle) &&
              !p.displayName.toLowerCase().includes(needle) &&
              !p.description.toLowerCase().includes(needle)) {
            return false;
          }
        }
        return true;
      });
      // Stable order: install_count desc, plugin_id asc.
      filtered.sort((a, b) => (b.installCount - a.installCount) || a.pluginId.localeCompare(b.pluginId));
      const offset = Math.max(0, q.offset ?? 0);
      const limit = Math.min(200, Math.max(1, q.limit ?? 50));
      return { total: filtered.length, items: filtered.slice(offset, offset + limit) };
    },

    insertVersion(v) {
      const key = `${v.pluginId}@${v.version}`;
      if (versions.has(key)) {
        throw new Error(`marketplace_plugin_versions: duplicate ${key}`);
      }
      if (!plugins.has(v.pluginId)) {
        throw new Error(`marketplace_plugin_versions: plugin_id ${v.pluginId} not registered`);
      }
      versions.set(key, v);
    },
    getVersion(pluginId, version) {
      return versions.get(`${pluginId}@${version}`) ?? null;
    },
    listVersions(pluginId) {
      const out = Array.from(iterVersionsFor(pluginId));
      // newest first by publishedAt; ties broken by version string desc.
      out.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt) || b.version.localeCompare(a.version));
      return out;
    },
    revokeVersion(pluginId, version, reason, atIso) {
      const key = `${pluginId}@${version}`;
      const existing = versions.get(key);
      if (!existing) return false;
      versions.set(key, { ...existing, revokedAt: atIso, revokeReason: reason });
      return true;
    },

    revokePublisher(publisherKeyB64) { revokedPublisherKeys.add(publisherKeyB64); },
    getRevocationList(): RevocationListResponse {
      const revokedVersions: string[] = [];
      for (const v of versions.values()) {
        if (v.revokedAt !== null) revokedVersions.push(`${v.pluginId}@${v.version}`);
      }
      revokedVersions.sort();
      return Object.freeze({
        issuedAt: new Date().toISOString(),
        revokedPublisherKeysB64: Array.from(revokedPublisherKeys).sort(),
        revokedPluginIdAtVersion: revokedVersions,
      });
    },

    size() { return { publishers: publishers.size, plugins: plugins.size, versions: versions.size }; },
    clear() { publishers.clear(); plugins.clear(); versions.clear(); revokedPublisherKeys.clear(); },
  };
}
