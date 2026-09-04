// ComponentCatalog — THE project-level definition catalogue. Lane U0.
// UIUX-PLAN §U0 · ADR-0376 D5/D9 · C111 §3.1 ("THERE IS NO CORPUS") / §4.3-b ·
// C110 §2.2 · C84 EI-9 / §6.2c · audit R1 · C16 CA-3.
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⭐⭐ THE ONE RESOLVER. Before this file, `definitionId` resolved to NOTHING in
//     production (Phase-4 verify, still_open item 2): `component.place` accepted
//     any well-formed `fam_<ULID>`, `component.swapType` could not check type
//     membership, and no surface could enumerate "what definitions does this
//     project have?". This catalogue is the single answer to all of it — for the
//     command handlers (via the `ComponentDefinitionResolver` port), for the
//     render/bake seam (its `has()` satisfies the committer's
//     `ComponentDefinitionSource` unchanged — lane 4E's port, adopted, not
//     rivalled), and for the UI lanes (U1 browser, U2 property panel, U3 editor)
//     that enumerate `list()`.
// ═══════════════════════════════════════════════════════════════════════════════
//
// ─── ⛔ IT WRAPS THE ONE LOADER, AND ADDS NO SECOND PIPELINE (audit R1) ─────────
// Every definition enters through `loadFamilyFromBytes` (`@pryzm/family-loader/
// bytes` — the browser-safe surface of the SAME loader `loadFamily(path)`
// delegates to): unzip → Zod-validate → resolver pre-flight → cache by
// `(familyId, schemaHash)` (C111 §4.3-b's exact key). There is deliberately NO
// `registerDocument(document)` seam — bytes or nothing, so validation cannot be
// bypassed and no rival validation path can grow here. A tampered or malformed
// file refuses with the LOADER's named error, passed through verbatim.
//
// ─── ⭐ HONEST EMPTY STATE ([[context-data-honesty-family]]) ────────────────────
// A project with no definitions answers `list() === []` and `has() === false` —
// answers, not errors. A failed LOAD is a typed refusal (`ok:false` + reason +
// message). The two can never collapse into one value.
//
// ─── ⚠ WHERE DO A PROJECT'S DEFINITIONS PERSIST? — OPEN, AND SAID SO ──────────
// UIUX-PLAN §U0, verbatim: *"C111 §4.3-a rules the split (definitions in the
// envelope, instances in the snapshot) but nothing yet rules how a project
// references its definition set."* This catalogue is therefore IN-MEMORY with
// EXPLICIT load, process-lifetime, and it does not invent a storage location —
// project-scoped definition persistence is flagged for a founder/ADR ruling.
// When that ruling lands, its load path lands HERE, behind the same one-loader
// wrap.
//
// ─── PROVENANCE ───────────────────────────────────────────────────────────────
// Every entry records where it came from — `'project'` (file-open / explicit
// bytes), `'marketplace'` (the LIVE `GET /api/v1/families/:id/download` route,
// C111 §3.1's one LIVE transport row), `'builtin'` (app-shipped bytes). One entry
// per definitionId regardless of source (C84 EI-9); provenance is a recorded
// fact, never an authority ranking. A re-load of the same id REPLACES the entry
// (latest explicit load wins) — the LOADER's `(familyId, schemaHash)` cache still
// dedups identical bytes underneath.

// ⚠ TYPE-ONLY at module scope, LAZY at load time — deliberately. The loader's
// graph reaches `@pryzm/file-format`'s barrel, which eagerly evaluates
// `import/PDFToImageConverter.ts` → pdfjs-dist, which dereferences `DOMMatrix`
// AT MODULE SCOPE. A static value-import here would put that on the COMPOSITION
// ROOT's module graph (PluginRegistry imports this file) and kill every
// node-environment boot suite at collection — measured on
// `bootstrap.everything.test.ts` before this comment existed. The dynamic import
// in `loadFromBytes()` defers that cost to the first actual LOAD, which is
// async anyway; type imports are erased and cost nothing.
import type {
  FamilyCache,
  LoadedFamily,
  LoadFamilyErrorReason,
} from '@pryzm/family-loader/bytes';
import type {
  ComponentDefinitionProvenance,
  ComponentDefinitionResolver,
  ComponentDefinitionView,
} from '@pryzm/plugin-component';

/** One loaded definition, with its provenance. `family` is the loader's shared,
 *  treat-as-readonly `LoadedFamily` — the bake seam consumes `family.document`
 *  directly (`bakeFamilyInstance({ family })`), so nothing is copied. */
export interface ComponentCatalogEntry {
  readonly family: LoadedFamily;
  readonly provenance: ComponentDefinitionProvenance;
  readonly loadedAt: string;
  /**
   * ⭐ §UCE-DEFINITION-ESCAPE-HATCH — the EXACT `.pryzm-family` bytes the loader
   * validated to produce `family`. Retained, not re-derivable: the format is
   * CONTENT-ADDRESSED (C111 §4.3-b — a definition reference is
   * `(familyId, schemaHash)`), so a re-pack is a DIFFERENT artefact with a
   * different `schemaHash`, and exporting one would hand the author a file that
   * no placed instance references. These are the bytes, verbatim.
   *
   * ⚠ Copied at load (`.slice()`), because the caller owns the buffer it passed
   * and may reuse it — a retained view would let a later write mutate what this
   * catalogue believes it validated.
   */
  readonly bytes: Uint8Array;
}

/** Load outcome. Refusal reasons are the LOADER's own, plus the two this
 *  catalogue can add: `transport-failed` (the marketplace leg's HTTP failure)
 *  and `identity-mismatch` (the downloaded family is not the one asked for). */
export type ComponentCatalogLoadResult =
  | {
      readonly ok: true;
      readonly definitionId: string;
      /** True when the loader served its `(familyId, schemaHash)` cache. */
      readonly cacheHit: boolean;
      readonly entry: ComponentCatalogEntry;
    }
  | {
      readonly ok: false;
      readonly reason: LoadFamilyErrorReason | 'transport-failed' | 'identity-mismatch';
      readonly message: string;
    };

/** One row of `GET /api/v1/families` — mirrors `server/familyMarketplaceRoutes.js`. */
export interface MarketplaceFamilyRow {
  readonly id: string;
  readonly name: string;
  readonly semver: string;
  readonly category: string;
  readonly ifcEntity: string;
  readonly schemaHash: string;
  readonly publishedAt: string;
  readonly availableSemvers: readonly string[];
}

export type MarketplaceListResult =
  | { readonly ok: true; readonly rows: readonly MarketplaceFamilyRow[] }
  | { readonly ok: false; readonly reason: 'transport-failed'; readonly message: string };

/** The slice of `fetch` the marketplace leg consumes — structural so tests can
 *  drive the leg without a live server (the URL + bytes contract is the same). */
export type CatalogFetch = (url: string) => Promise<{
  readonly ok: boolean;
  readonly status: number;
  arrayBuffer(): Promise<ArrayBuffer>;
  json(): Promise<unknown>;
}>;

/** The slice of `File` the file-open leg consumes. */
export interface FileLike {
  readonly name?: string;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export interface ComponentCatalogOptions {
  /** Loader cache override — defaults to the loader's process-default cache. */
  readonly cache?: FamilyCache;
  /** Fetch override for the marketplace legs — defaults to `globalThis.fetch`. */
  readonly fetchImpl?: CatalogFetch;
  /** Base URL prefixed to `/api/v1/families…` — defaults to same-origin (''). */
  readonly baseUrl?: string;
}

export class ComponentCatalog implements ComponentDefinitionResolver {
  private readonly entries = new Map<string, ComponentCatalogEntry>();
  private readonly listeners = new Set<() => void>();
  /** `undefined` means "the loader's own process-default cache" — resolved by the
   *  loader itself at load time (`opts.cache ?? defaultFamilyCache`), so this
   *  class never needs the loader module before the first load. */
  private readonly cache: FamilyCache | undefined;
  private readonly fetchImpl: CatalogFetch | undefined;
  private readonly baseUrl: string;

  constructor(opts: ComponentCatalogOptions = {}) {
    this.cache = opts.cache;
    this.fetchImpl =
      opts.fetchImpl ??
      (typeof globalThis.fetch === 'function'
        ? (globalThis.fetch.bind(globalThis) as unknown as CatalogFetch)
        : undefined);
    this.baseUrl = opts.baseUrl ?? '';
  }

  // ── The ComponentDefinitionResolver port (handlers + committer) ────────────

  has(definitionId: string): boolean {
    return this.entries.has(definitionId);
  }

  view(definitionId: string): ComponentDefinitionView | undefined {
    const entry = this.entries.get(definitionId);
    if (entry === undefined) return undefined;
    return this._viewOf(definitionId, entry);
  }

  /** ⭐ The honest empty state: no definitions → `[]`, an answer, not an error. */
  list(): readonly ComponentDefinitionView[] {
    const out: ComponentDefinitionView[] = [];
    for (const [id, entry] of this.entries) out.push(this._viewOf(id, entry));
    return out;
  }

  // ── The bake/UI read channel ───────────────────────────────────────────────

  /** The full entry — the 4E bake wiring reads `entry.family` here so
   *  `bakeFamilyInstance` gets the REAL document, never a projection. */
  entry(definitionId: string): ComponentCatalogEntry | undefined {
    return this.entries.get(definitionId);
  }

  size(): number {
    return this.entries.size;
  }

  /**
   * ⭐⭐ §UCE-DEFINITION-ESCAPE-HATCH — the bytes for a loaded definition, exactly
   * as this catalogue validated them, or `undefined` when it holds no such
   * definition.
   *
   * ⛔ THIS IS NOT A CONVENIENCE. It is the ONLY way a definition an author
   *    created in this application survives the tab being closed. The header's
   *    OPEN question — *"where do a project's definitions persist?"* — is still
   *    open, and until it is ruled this catalogue is a `Map` with process
   *    lifetime: `New Component` → author → **Save definition** → refresh, and
   *    the definition is GONE, while the placed occurrences that reference it are
   *    faithfully restored from the project snapshot and can then resolve
   *    nothing. Naming that in a comment and shipping no way out is exactly the
   *    defect [[refusing-half-needs-its-escape-hatch]] describes; this accessor,
   *    and the browser's "Export…" button over it, are the escape.
   *
   * ⚠ IT DOES NOT MAKE THE CATALOGUE PERSISTENT, and must not be described as
   *   if it did. Project-scoped definition persistence remains a founder/ADR
   *   ruling (C111 §4.3-a fixes only the SPLIT — definitions in the envelope,
   *   instances in the snapshot — not where a project keeps its envelope set).
   *   What this closes is the loop `author → save → export → load`, which is a
   *   deliberate act by the author, not persistence happening on their behalf.
   */
  exportBytes(definitionId: string): Uint8Array | undefined {
    const entry = this.entries.get(definitionId);
    if (entry === undefined) return undefined;
    // Copied on the way out for the same reason it was copied on the way in:
    // a consumer that writes into the returned buffer must not be able to
    // corrupt what the catalogue holds.
    return entry.bytes.slice();
  }

  /** The filename an export should carry — the definition's own name, made
   *  filesystem-safe, with the FROZEN wire extension (D5: `.pryzm-family` is a
   *  legacy wire name and is not renamed to match the `Component` vocabulary). */
  exportFileName(definitionId: string): string | undefined {
    const entry = this.entries.get(definitionId);
    if (entry === undefined) return undefined;
    const safe = entry.family.manifest.name
      .trim()
      .replace(/[^A-Za-z0-9._ -]+/g, '-')
      .replace(/\s+/g, '-')
      .replace(/^-+|-+$/g, '');
    const stem = safe.length > 0 ? safe : definitionId;
    return `${stem}-v${entry.family.manifest.semver}.pryzm-family`;
  }

  /** Notified after every register / remove / clear — U1's browser refreshes on
   *  this rather than polling. Returns the unsubscribe function. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  }

  // ── The load legs — every one of them ends in the ONE loader ───────────────

  /** Load a `.pryzm-family` from bytes and register it under its manifest id. */
  async loadFromBytes(
    bytes: Uint8Array,
    opts: {
      readonly provenance: ComponentDefinitionProvenance;
      /** When given, a family whose manifest id differs is REFUSED and NOT
       *  registered — the marketplace leg passes the id it asked for. */
      readonly expectId?: string;
    },
  ): Promise<ComponentCatalogLoadResult> {
    // ⚠ Lazy — see the import-block comment at the top of this file.
    const { loadFamilyFromBytes } = await import('@pryzm/family-loader/bytes');
    const res = await loadFamilyFromBytes(bytes, this.cache !== undefined ? { cache: this.cache } : {});
    if (!res.ok) {
      // ⭐ The LOADER's named error, verbatim — this catalogue adds no vocabulary
      // of its own for load failures (audit R1).
      return { ok: false, reason: res.reason, message: res.message };
    }
    const id = res.family.manifest.id;
    if (opts.expectId !== undefined && id !== opts.expectId) {
      return {
        ok: false,
        reason: 'identity-mismatch',
        message:
          `[componentCatalog] asked for definition ${opts.expectId} but the loaded ` +
          `family's manifest id is ${id} — refused, nothing registered.`,
      };
    }
    const entry: ComponentCatalogEntry = {
      family: res.family,
      provenance: opts.provenance,
      loadedAt: new Date().toISOString(),
      // ⭐ §UCE-DEFINITION-ESCAPE-HATCH — taken HERE, at the ONE registration
      //   point every load leg funnels through, so no leg can register an entry
      //   whose bytes are missing. Copied: see the field's own doc.
      bytes: bytes.slice(),
    };
    this.entries.set(id, entry);
    this._notify();
    return { ok: true, definitionId: id, cacheHit: res.cacheHit, entry };
  }

  /** The file-open leg (`<input type=file>` → here). Provenance `'project'`. */
  async loadFromFile(file: FileLike): Promise<ComponentCatalogLoadResult> {
    const buf = await file.arrayBuffer();
    return this.loadFromBytes(new Uint8Array(buf), { provenance: 'project' });
  }

  /** App-shipped definition bytes. Provenance `'builtin'`. */
  async loadBuiltin(bytes: Uint8Array): Promise<ComponentCatalogLoadResult> {
    return this.loadFromBytes(bytes, { provenance: 'builtin' });
  }

  /** The marketplace download leg — the LIVE transport (C111 §3.1):
   *  `GET /api/v1/families/:id/download[?semver=…]` → bytes → the one loader. */
  async loadFromMarketplace(
    definitionId: string,
    opts: {
      readonly semver?: string;
      /** Per-call transport override — tests drive the leg against packed bytes
       *  without a live server; the URL + bytes contract is identical. */
      readonly fetchImpl?: CatalogFetch;
    } = {},
  ): Promise<ComponentCatalogLoadResult> {
    const fetchImpl = opts.fetchImpl ?? this.fetchImpl;
    if (fetchImpl === undefined) {
      return {
        ok: false,
        reason: 'transport-failed',
        message: '[componentCatalog] no fetch implementation available in this host.',
      };
    }
    const url =
      `${this.baseUrl}/api/v1/families/${encodeURIComponent(definitionId)}/download` +
      (opts.semver !== undefined ? `?semver=${encodeURIComponent(opts.semver)}` : '');
    let bytes: Uint8Array;
    try {
      const res = await fetchImpl(url);
      if (!res.ok) {
        return {
          ok: false,
          reason: 'transport-failed',
          message: `[componentCatalog] GET ${url} → HTTP ${res.status}; nothing registered.`,
        };
      }
      bytes = new Uint8Array(await res.arrayBuffer());
    } catch (err) {
      return {
        ok: false,
        reason: 'transport-failed',
        message: `[componentCatalog] GET ${url} failed: ${(err as Error).message}`,
      };
    }
    return this.loadFromBytes(bytes, { provenance: 'marketplace', expectId: definitionId });
  }

  /** The marketplace browse leg — `GET /api/v1/families`. Read-only; registers
   *  nothing (browsing is not loading). */
  async listMarketplace(
    opts: { readonly fetchImpl?: CatalogFetch } = {},
  ): Promise<MarketplaceListResult> {
    const fetchImpl = opts.fetchImpl ?? this.fetchImpl;
    if (fetchImpl === undefined) {
      return {
        ok: false,
        reason: 'transport-failed',
        message: '[componentCatalog] no fetch implementation available in this host.',
      };
    }
    const url = `${this.baseUrl}/api/v1/families`;
    try {
      const res = await fetchImpl(url);
      if (!res.ok) {
        return {
          ok: false,
          reason: 'transport-failed',
          message: `[componentCatalog] GET ${url} → HTTP ${res.status}.`,
        };
      }
      const body = (await res.json()) as { families?: readonly MarketplaceFamilyRow[] };
      return { ok: true, rows: body.families ?? [] };
    } catch (err) {
      return {
        ok: false,
        reason: 'transport-failed',
        message: `[componentCatalog] GET ${url} failed: ${(err as Error).message}`,
      };
    }
  }

  // ── Removal ────────────────────────────────────────────────────────────────

  /** Unload one definition. Placed occurrences referencing it stay in the model
   *  (they are the user's data); the verbs refuse further edits BY NAME until it
   *  is loaded again. Returns whether an entry was removed. */
  remove(definitionId: string): boolean {
    const removed = this.entries.delete(definitionId);
    if (removed) this._notify();
    return removed;
  }

  /** Unload everything (project close / tests). */
  clear(): void {
    if (this.entries.size === 0) return;
    this.entries.clear();
    this._notify();
  }

  // ── internals ──────────────────────────────────────────────────────────────

  private _viewOf(definitionId: string, entry: ComponentCatalogEntry): ComponentDefinitionView {
    const doc = entry.family.document;
    return {
      definitionId,
      name: entry.family.manifest.name,
      semver: entry.family.manifest.semver,
      schemaHash: entry.family.schemaHash,
      provenance: entry.provenance,
      types: doc.types.map((t) => ({ id: t.id, name: t.name })),
      parameters: doc.parameters.map((p) => ({
        id: p.id,
        name: p.name,
        kind: p.kind,
        dataType: p.dataType,
      })),
    };
  }

  private _notify(): void {
    for (const l of this.listeners) l();
  }
}

/**
 * ⭐ THE process-default catalogue — the instance `PluginRegistry.ts` injects into
 * the component handlers and advertises as `auxiliaries.componentCatalog`, and
 * the instance every UI lane imports. Same precedent as the loader's
 * `defaultFamilyCache`: one default, explicit injection everywhere it is
 * consumed, and a fresh `ComponentCatalog` for tests that need isolation.
 *
 * ⚠ Process-lifetime, NOT project-scoped — see the header's OPEN persistence
 * question. Call `clear()` on project close until the founder/ADR ruling lands.
 */
export const componentCatalog = new ComponentCatalog();
