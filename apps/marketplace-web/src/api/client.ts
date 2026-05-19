// api/client.ts — thin fetch wrapper around the server's /api/v1/families
// surface (family marketplace, S59) and /marketplace/api/plugins surface
// (plugin marketplace, Phase F / C07 §4.1).

const FAMILIES_BASE = '/api/v1/families';
const PLUGINS_BASE  = '/marketplace/api';

export const api = {
  // ── Family marketplace (S59) ────────────────────────────────────────────

  async listFamilies(): Promise<{ families: any[] }> {
    const r = await fetch(FAMILIES_BASE);
    if (!r.ok) throw new Error(`listFamilies: HTTP ${r.status}`);
    return r.json();
  },

  async getFamily(id: string): Promise<any> {
    const r = await fetch(`${FAMILIES_BASE}/${encodeURIComponent(id)}`);
    if (!r.ok) throw new Error(`getFamily(${id}): HTTP ${r.status}`);
    return r.json();
  },

  async downloadFamily(downloadUrl: string): Promise<Uint8Array> {
    const r = await fetch(downloadUrl);
    if (!r.ok) throw new Error(`downloadFamily: HTTP ${r.status}`);
    return new Uint8Array(await r.arrayBuffer());
  },

  // ── Plugin marketplace (Phase F / C07 §4.1) ─────────────────────────────

  /**
   * List plugins from the marketplace catalog (paginated).
   * GET /marketplace/api/plugins
   */
  async listPlugins(opts: { page?: number; perPage?: number; category?: string } = {}): Promise<{
    plugins: any[];
    total: number;
    page: number;
    perPage: number;
  }> {
    const params = new URLSearchParams();
    if (opts.page)     params.set('page',     String(opts.page));
    if (opts.perPage)  params.set('perPage',  String(opts.perPage));
    if (opts.category) params.set('category', opts.category);
    const r = await fetch(`${PLUGINS_BASE}/plugins?${params}`);
    if (!r.ok) throw new Error(`listPlugins: HTTP ${r.status}`);
    return r.json();
  },

  /**
   * Get a single plugin's detail record.
   * GET /marketplace/api/plugins/:id
   */
  async getPlugin(id: string): Promise<any> {
    const r = await fetch(`${PLUGINS_BASE}/plugins/${encodeURIComponent(id)}`);
    if (!r.ok) throw new Error(`getPlugin(${id}): HTTP ${r.status}`);
    return r.json();
  },

  /**
   * Submit a plugin for marketplace review.
   * POST /marketplace/api/plugins/submit
   * Requires a PRYZM Bearer token (from localStorage 'pryzm_token' after login).
   * Body: { manifest: PluginManifest, signature: string }
   * Returns: { ok: true, reviewId: string, message: string, estimatedReviewTime: string }
   */
  async submitPlugin(
    manifest: {
      id: string;
      name: string;
      version: string;
      description: string;
      publisher: string;
      category: string;
      permissions: string[];
      tags: string[];
    },
    signature: string,
    bearerToken: string,
  ): Promise<{ ok: boolean; reviewId: string; message: string; estimatedReviewTime: string }> {
    const r = await fetch(`${PLUGINS_BASE}/plugins/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${bearerToken}`,
      },
      body: JSON.stringify({ manifest, signature }),
    });
    if (!r.ok) {
      let msg = `HTTP ${r.status}`;
      try { const j = await r.json(); msg = j.error ?? msg; } catch { /* ignore */ }
      throw new Error(`submitPlugin: ${msg}`);
    }
    return r.json();
  },
};
