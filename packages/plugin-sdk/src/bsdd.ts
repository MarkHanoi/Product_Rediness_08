/**
 * bSDD — buildingSMART Data Dictionary property lookup (Wave A20-T10).
 *
 * Provides a typed client for the buildingSMART Data Dictionary (bSDD) API:
 *   https://identifier.buildingsmart.org/uri/buildingsmart/ifc-4.3
 *
 * Used by the Property Inspector to show authoritative Pset property
 * definitions, units, and allowed values for IFC elements.
 *
 * SPEC reference: C07 §5, C05 §3 ("Pset lookup from bSDD on selection").
 * API docs: https://app.swaggerhub.com/apis-docs/buildingSMART/Dictionaries/v1
 *
 * CONTRACT:
 *  - All requests are GET (read-only)
 *  - Results are cached in memory (LRU-lite — per-session, 200-entry cap)
 *  - Network errors are non-fatal (returns null; UI shows a warning)
 *  - Requires `network:fetch` plugin permission when called from a plugin
 */

export interface BsddPropertyDefinition {
  /** bSDD property code (e.g. "IsExternal") */
  code: string;
  /** Human-readable name */
  name: string;
  /** Description of the property */
  description?: string;
  /** Data type (e.g. "Boolean", "Real", "String") */
  dataType?: string;
  /** Unit of measure (e.g. "m", "m²", "W/m²K") */
  unit?: string;
  /** For enumeration properties: allowed values */
  allowedValues?: string[];
  /** URI to the bSDD definition page */
  uri: string;
  /** IFC Pset name (e.g. "Pset_WallCommon") */
  psetName?: string;
}

export interface BsddClassification {
  code: string;
  name: string;
  description?: string;
  uri: string;
  properties: BsddPropertyDefinition[];
}

export interface BsddLookupOptions {
  /**
   * Base URL for the bSDD API.
   * @default 'https://api.bsdd.buildingsmart.org'
   */
  apiBase?: string;
  /**
   * Dictionary URI to search within.
   * @default 'https://identifier.buildingsmart.org/uri/buildingsmart/ifc-4.3'
   */
  dictionaryUri?: string;
}

// ── Simple LRU-lite memory cache (capped at 200 entries) ─────────────────────
const cache = new Map<string, BsddPropertyDefinition | null>();
const CACHE_MAX = 200;

function cacheGet(key: string): BsddPropertyDefinition | null | undefined {
  return cache.get(key);
}

function cacheSet(key: string, value: BsddPropertyDefinition | null): void {
  if (cache.size >= CACHE_MAX) {
    // Evict the oldest entry (insertion-order via Map iteration)
    const oldestKey = cache.keys().next().value;
    if (oldestKey !== undefined) cache.delete(oldestKey);
  }
  cache.set(key, value);
}

// ── Client class ──────────────────────────────────────────────────────────────

/**
 * BsddPropertyLookup — typed client for buildingSMART Data Dictionary.
 *
 * Usage:
 *   const bsdd = new BsddPropertyLookup();
 *   const prop = await bsdd.lookupProperty('IsExternal', 'Pset_WallCommon');
 *   // → { name: 'Is External', dataType: 'Boolean', ... }
 */
export class BsddPropertyLookup {
  private readonly apiBase: string;
  private readonly dictionaryUri: string;

  constructor(options: BsddLookupOptions = {}) {
    this.apiBase = options.apiBase ?? 'https://api.bsdd.buildingsmart.org';
    this.dictionaryUri =
      options.dictionaryUri ??
      'https://identifier.buildingsmart.org/uri/buildingsmart/ifc-4.3';
  }

  /**
   * Look up a single property definition by property code and optional Pset name.
   *
   * Returns `null` if not found or if the network request fails.
   */
  async lookupProperty(
    propertyCode: string,
    psetName?: string,
  ): Promise<BsddPropertyDefinition | null> {
    const cacheKey = `${this.dictionaryUri}::${psetName ?? '*'}::${propertyCode}`;
    const cached = cacheGet(cacheKey);
    if (cached !== undefined) return cached;

    try {
      const url = new URL(`${this.apiBase}/api/Property/v4`);
      url.searchParams.set('DictionaryUri', this.dictionaryUri);
      url.searchParams.set('PropertyCode', propertyCode);

      const res = await fetch(url.toString(), {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(8_000),
      });

      if (!res.ok) {
        cacheSet(cacheKey, null);
        return null;
      }

      const raw = await res.json() as {
        code?: string;
        name?: string;
        definition?: string;
        dataType?: string;
        units?: Array<{ code: string }>;
        allowedValues?: Array<{ value: string }>;
        uri?: string;
      };

      const result: BsddPropertyDefinition = {
        code: raw.code ?? propertyCode,
        name: raw.name ?? propertyCode,
        ...(raw.definition !== undefined ? { description: raw.definition } : {}),
        ...(raw.dataType   !== undefined ? { dataType:    raw.dataType }   : {}),
        ...(raw.units?.[0]?.code !== undefined ? { unit: raw.units[0]!.code } : {}),
        ...(raw.allowedValues !== undefined ? { allowedValues: raw.allowedValues.map((v) => v.value) } : {}),
        uri: raw.uri ?? `${this.dictionaryUri}/prop/${propertyCode}`,
        ...(psetName !== undefined ? { psetName } : {}),
      };

      cacheSet(cacheKey, result);
      return result;
    } catch (err) {
      console.warn(`[bsdd] lookupProperty(${propertyCode}) failed:`, err);
      cacheSet(cacheKey, null);
      return null;
    }
  }

  /**
   * Look up all properties for a given Pset.
   *
   * Returns an empty array if the class is not found or the request fails.
   */
  async lookupPset(psetName: string): Promise<BsddPropertyDefinition[]> {
    try {
      const url = new URL(`${this.apiBase}/api/Class/v1`);
      url.searchParams.set('DictionaryUri', this.dictionaryUri);
      url.searchParams.set('ClassCode', psetName);
      url.searchParams.set('includeProperties', 'true');

      const res = await fetch(url.toString(), {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(8_000),
      });

      if (!res.ok) return [];

      const raw = await res.json() as {
        classProperties?: Array<{
          code: string;
          name: string;
          definition?: string;
          dataType?: string;
          units?: Array<{ code: string }>;
          allowedValues?: Array<{ value: string }>;
          uri?: string;
        }>;
      };

      return (raw.classProperties ?? []).map((p): BsddPropertyDefinition => ({
        code: p.code,
        name: p.name,
        ...(p.definition   !== undefined ? { description: p.definition }   : {}),
        ...(p.dataType     !== undefined ? { dataType:    p.dataType }     : {}),
        ...(p.units?.[0]?.code !== undefined ? { unit: p.units[0]!.code } : {}),
        ...(p.allowedValues !== undefined ? { allowedValues: p.allowedValues.map((v) => v.value) } : {}),
        uri: p.uri ?? `${this.dictionaryUri}/prop/${p.code}`,
        psetName,
      }));
    } catch (err) {
      console.warn(`[bsdd] lookupPset(${psetName}) failed:`, err);
      return [];
    }
  }

  /**
   * Clear the in-memory lookup cache.
   * Useful when the user switches locale or IFC version.
   */
  clearCache(): void {
    cache.clear();
  }

  /** Static factory — creates a BsddPropertyLookup with default options. */
  static create(options?: BsddLookupOptions): BsddPropertyLookup {
    return new BsddPropertyLookup(options);
  }
}

/** Singleton instance for use across the editor (lazy-initialized). */
let _defaultLookup: BsddPropertyLookup | null = null;

/**
 * getBsddLookup() — singleton accessor for the default BsddPropertyLookup.
 *
 * Usage in the Property Inspector:
 *   const bsdd = getBsddLookup();
 *   const prop = await bsdd.lookupProperty('IsExternal', 'Pset_WallCommon');
 */
export function getBsddLookup(options?: BsddLookupOptions): BsddPropertyLookup {
  if (!_defaultLookup || options) {
    _defaultLookup = new BsddPropertyLookup(options);
  }
  return _defaultLookup;
}
