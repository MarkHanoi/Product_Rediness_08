/**
 * Minimal ArcGIS REST catalogue crawler for the Spanish Genome probe.
 *
 * Deliberately small: catalogue → folders → services → layers → fields.
 * No geometry queries, no pagination beyond what the catalogue returns.
 *
 * ── L-422/457/467/469 discipline ─────────────────────────────────────────────
 * A 500, a timeout, an ArcGIS `{error:{code}}` body and a genuinely empty layer
 * list are FOUR DIFFERENT RESULTS and are never collapsed into one. Every fetch
 * returns a discriminated `Fetched<T>`; callers must branch on `status`.
 */

export type Fetched<T> =
  | { status: 'ok'; url: string; value: T; ms: number }
  | { status: 'http-error'; url: string; httpStatus: number; ms: number }
  | { status: 'arcgis-error'; url: string; code: number; message: string; ms: number }
  | { status: 'timeout'; url: string; ms: number }
  | { status: 'network-error'; url: string; message: string; ms: number }
  | { status: 'parse-error'; url: string; message: string; ms: number };

export interface CrawlOptions {
  readonly timeoutMs?: number;
  /** Injectable for tests; defaults to global fetch. */
  readonly fetchImpl?: typeof fetch;
  readonly onRequest?: (url: string) => void;
}

export async function getJson<T>(url: string, opts: CrawlOptions = {}): Promise<Fetched<T>> {
  const timeoutMs = opts.timeoutMs ?? 30_000;
  const f = opts.fetchImpl ?? fetch;
  const t0 = Date.now();
  opts.onRequest?.(url);
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await f(url, { signal: ac.signal, headers: { accept: 'application/json' } });
    const ms = Date.now() - t0;
    if (!res.ok) return { status: 'http-error', url, httpStatus: res.status, ms };
    const text = await res.text();
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch (e) {
      return { status: 'parse-error', url, message: `not JSON (${text.slice(0, 120)})`, ms };
    }
    // ArcGIS returns HTTP 200 with an error envelope. That is NOT success.
    const err = (body as { error?: { code?: number; message?: string } } | null)?.error;
    if (err && typeof err === 'object') {
      return { status: 'arcgis-error', url, code: err.code ?? -1, message: err.message ?? '', ms };
    }
    return { status: 'ok', url, value: body as T, ms };
  } catch (e) {
    const ms = Date.now() - t0;
    const msg = e instanceof Error ? e.message : String(e);
    if (ac.signal.aborted) return { status: 'timeout', url, ms };
    return { status: 'network-error', url, message: msg, ms };
  } finally {
    clearTimeout(timer);
  }
}

// ── ArcGIS shapes (only the fields we read) ──────────────────────────────────

export interface CatalogResponse {
  folders?: string[];
  services?: { name: string; type: string }[];
  currentVersion?: number;
}

export interface ServiceResponse {
  layers?: { id: number; name: string; subLayerIds?: number[] | null }[];
  tables?: { id: number; name: string }[];
  serviceDescription?: string;
  documentInfo?: Record<string, unknown>;
  spatialReference?: { wkid?: number; latestWkid?: number };
  currentVersion?: number;
}

export interface LayerResponse {
  id?: number;
  name?: string;
  type?: string;
  geometryType?: string;
  description?: string;
  fields?: { name: string; alias?: string; type?: string; domain?: unknown }[];
  extent?: { spatialReference?: { wkid?: number; latestWkid?: number } };
  maxRecordCount?: number;
  capabilities?: string;
}

// ── Crawl model ──────────────────────────────────────────────────────────────

export interface DiscoveredLayer {
  readonly serviceName: string;
  readonly serviceType: string;
  readonly serviceUrl: string;
  readonly layerId: number;
  readonly layerName: string;
  readonly layerUrl: string;
  readonly geometryType: string | null;
  readonly fields: { name: string; alias: string; type: string }[];
  readonly wkid: number | null;
  /** Non-fatal problems seen while detailing this layer. */
  readonly detailStatus: Fetched<unknown>['status'];
}

export interface CrawlReport {
  readonly root: string;
  readonly catalogStatus: Fetched<unknown>['status'];
  readonly folders: string[];
  readonly services: { name: string; type: string; folder: string | null }[];
  readonly layers: DiscoveredLayer[];
  /** Every non-ok fetch, kept verbatim so failure is never read as absence. */
  readonly failures: Exclude<Fetched<unknown>, { status: 'ok' }>[];
  readonly requestCount: number;
}

const SUPPORTED_SERVICE_TYPES = new Set(['MapServer', 'FeatureServer']);

/**
 * Crawl an ArcGIS REST root. `folderFilter` limits which folders are descended
 * into — this is the ONLY place a caller may narrow the search, and any use of
 * it must be declared in the experiment's config-line budget.
 */
export async function crawlArcGisRoot(
  root: string,
  opts: CrawlOptions & { folderFilter?: (folder: string) => boolean; maxLayersDetailed?: number } = {},
): Promise<CrawlReport> {
  const failures: Exclude<Fetched<unknown>, { status: 'ok' }>[] = [];
  let requestCount = 0;
  const wrapped: CrawlOptions = {
    ...opts,
    onRequest: (u) => {
      requestCount++;
      opts.onRequest?.(u);
    },
  };
  const push = <T,>(r: Fetched<T>): r is Extract<Fetched<T>, { status: 'ok' }> => {
    if (r.status !== 'ok') failures.push(r as Exclude<Fetched<unknown>, { status: 'ok' }>);
    return r.status === 'ok';
  };

  const base = root.replace(/\/+$/, '');
  const cat = await getJson<CatalogResponse>(`${base}?f=json`, wrapped);
  if (!push(cat)) {
    return { root: base, catalogStatus: cat.status, folders: [], services: [], layers: [], failures, requestCount };
  }

  const folders = (cat.value.folders ?? []).filter((f) => (opts.folderFilter ? opts.folderFilter(f) : true));
  const services: { name: string; type: string; folder: string | null }[] = (cat.value.services ?? []).map((s) => ({
    name: s.name,
    type: s.type,
    folder: null,
  }));

  for (const folder of folders) {
    const fr = await getJson<CatalogResponse>(`${base}/${encodeURIComponent(folder)}?f=json`, wrapped);
    if (!push(fr)) continue;
    for (const s of fr.value.services ?? []) services.push({ name: s.name, type: s.type, folder });
  }

  const layers: DiscoveredLayer[] = [];
  let detailed = 0;
  const cap = opts.maxLayersDetailed ?? Number.POSITIVE_INFINITY;

  for (const svc of services) {
    if (!SUPPORTED_SERVICE_TYPES.has(svc.type)) continue;
    const serviceUrl = `${base}/${svc.name}/${svc.type}`;
    const sr = await getJson<ServiceResponse>(`${serviceUrl}?f=json`, wrapped);
    if (!push(sr)) continue;
    const wkid = sr.value.spatialReference?.latestWkid ?? sr.value.spatialReference?.wkid ?? null;
    for (const l of sr.value.layers ?? []) {
      const layerUrl = `${serviceUrl}/${l.id}`;
      let geometryType: string | null = null;
      let fields: { name: string; alias: string; type: string }[] = [];
      let detailStatus: Fetched<unknown>['status'] = 'ok';
      if (detailed < cap) {
        const lr = await getJson<LayerResponse>(`${layerUrl}?f=json`, wrapped);
        detailed++;
        detailStatus = lr.status;
        if (push(lr)) {
          geometryType = lr.value.geometryType ?? null;
          fields = (lr.value.fields ?? []).map((f) => ({
            name: f.name,
            alias: f.alias ?? '',
            type: f.type ?? '',
          }));
        }
      } else {
        detailStatus = 'parse-error'; // sentinel: not attempted — see maxLayersDetailed
      }
      layers.push({
        serviceName: svc.name,
        serviceType: svc.type,
        serviceUrl,
        layerId: l.id,
        layerName: l.name,
        layerUrl,
        geometryType,
        fields,
        wkid,
        detailStatus,
      });
    }
  }

  return { root: base, catalogStatus: 'ok', folders, services, layers, failures, requestCount };
}
