// PluginHost — Phase F (S81 F.4 first cut) implementation of the
// `runtime.plugins` slot.
//
// Phase A returned `[]` for every kind and threw on `register()`.
// Phase F first cut promotes the slot with:
//   • runtime.plugins.list()      → 38 plugin descriptors
//   • runtime.plugins.count       → 38
//   • runtime.plugins.byKind(k)   → filtered subset
//   • runtime.plugins.get(id)     → single descriptor or null
//
// The descriptor catalog is statically frozen at module load — every
// directory under `plugins/` produces one descriptor, with its `kind`
// field derived from the directory name (the heuristic matches the
// 8-kind taxonomy in `PluginDescriptor` — see types.ts).
//
// Phase F.4.x replaces this static catalog with a Zod-validated
// loader that reads each plugin's `plugin.manifest.json` (per
// `@pryzm/plugin-sdk/descriptor`) so marketplace installs land at
// runtime; until then the static catalog is sufficient for the
// status-pill chrome and the 38 element-family / AI / import-export
// gestures.

import type {
  Disposable,
  PluginContribution,
  PluginDescriptor,
  PluginsSlot,
  ToolbarDisciplineContribution,
} from './types.js';

// ────────────────────────────────────────────────────────────────────────────
//  Static plugin catalog — one entry per directory under `plugins/`.
//  Order matches `ls plugins/` (alphabetical), matching `list()`'s
//  documented stability guarantee.
//
//  When a new plugin lands under `plugins/<id>/`, append its entry
//  here with the matching `kind` per the 8-kind taxonomy.  The
//  S81-WIRE F.4.x sub-phase replaces this static array with a
//  manifest-driven loader so this file becomes a no-op transition.
// ────────────────────────────────────────────────────────────────────────────

const PLUGIN_CATALOG: readonly PluginDescriptor[] = Object.freeze([
  // 5 AI plugins
  desc('ai-floorplan',      'AI Floorplan',           'ai'),
  desc('ai-generative',     'AI Generative',          'ai'),
  desc('ai-query',          'AI Query',               'ai'),
  desc('ai-rules',          'AI Rules',               'ai'),
  desc('ai-voice',          'AI Voice',               'ai'),
  // 4 overlay plugins
  desc('annotations',       'Annotations',            'overlay'),
  desc('dimensions',        'Dimensions',             'overlay'),
  desc('grid',              'Grid',                   'overlay'),
  desc('lighting',          'Lighting',               'overlay'),
  // 4 import/export plugins
  desc('bcf',               'BCF',                    'import-export'),
  desc('ifc-export',        'IFC Export',             'import-export'),
  desc('ifc-import',        'IFC Import',             'import-export'),
  desc('rhino-import',      'Rhino Import',           'import-export'),
  // 12 element-family plugins
  desc('beam',              'Beam',                   'element'),
  desc('ceiling',           'Ceiling',                'element'),
  desc('column',            'Column',                 'element'),
  desc('curtain-wall',      'Curtain Wall',           'element'),
  desc('door',              'Door',                   'element'),
  desc('furniture',         'Furniture',              'element'),
  desc('handrail',          'Handrail',               'element'),
  desc('plumbing',          'Plumbing',               'element'),
  desc('roof',              'Roof',                   'element'),
  desc('slab',              'Slab',                   'element'),
  desc('stair',             'Stair',                  'element'),
  desc('wall',              'Wall',                   'element'),
  desc('window',            'Window',                 'element'),
  // 2 inspector plugins
  desc('ifc-inspector',     'IFC Inspector',          'inspector'),
  desc('schedules',         'Schedules',              'inspector'),
  // 5 view plugins
  desc('plan-view',         'Plan View',              'view'),
  desc('section-view',      'Section View',           'view'),
  desc('sheets',            'Sheets',                 'view'),
  desc('view',              'View',                   'view'),
  desc('rooms',             'Rooms',                  'view'),
  // 2 collab plugins
  desc('multiplayer',       'Multiplayer',            'collab'),
  desc('selection',         'Selection',              'collab'),
  // 4 misc plugins
  desc('cross',             'Cross-Section',          'misc'),
  desc('structural',        'Structural Analysis',    'misc'),
  desc('toy-cube',          'Toy Cube (smoke test)',  'misc'),
] as const);

function desc(
  id: string,
  title: string,
  kind: PluginDescriptor['kind'],
): PluginDescriptor {
  return Object.freeze({ id, title, kind, enabled: true });
}

// Indexed lookups frozen at module load — `get(id)` is O(1).
const BY_ID: ReadonlyMap<string, PluginDescriptor> = (() => {
  const m = new Map<string, PluginDescriptor>();
  for (const d of PLUGIN_CATALOG) m.set(d.id, d);
  return m;
})();

const BY_KIND: ReadonlyMap<PluginDescriptor['kind'], readonly PluginDescriptor[]> = (() => {
  const m = new Map<PluginDescriptor['kind'], PluginDescriptor[]>();
  for (const d of PLUGIN_CATALOG) {
    const arr = m.get(d.kind) ?? [];
    arr.push(d);
    m.set(d.kind, arr);
  }
  // Freeze each bucket so callers cannot mutate the catalog.
  const frozen = new Map<PluginDescriptor['kind'], readonly PluginDescriptor[]>();
  for (const [k, v] of m) frozen.set(k, Object.freeze(v));
  return frozen;
})();

// ────────────────────────────────────────────────────────────────────────────

export class PluginHost implements PluginsSlot {
  /** Contributions bucketed by `kind` discriminator.  Boot-time entries
   *  land via the constructor; runtime `register()` calls append to the
   *  matching bucket and the returned `Disposable` removes the entry. */
  private readonly _byKind: Map<string, PluginContribution[]> = new Map();

  /**
   * @param initialContributions  Boot-time contributions assembled by
   *   `composeRuntime()` from `apps/editor/src/PluginRegistry.ts`.
   *   Order is preserved and reflected in `contributions(kind)` output.
   */
  constructor(initialContributions: readonly PluginContribution[] = []) {
    for (const c of initialContributions) {
      this._appendUnchecked(c);
    }
  }

  contributions(kind: 'toolbar.discipline'): readonly ToolbarDisciplineContribution[];
  contributions<K extends string>(kind: K): readonly PluginContribution[];
  contributions(kind: string): readonly PluginContribution[] {
    // Return a frozen empty array (cached per absent-kind) so callers
    // can `.filter().map()` without a null guard.  The bucket arrays
    // are NOT frozen because `register()` may append at runtime — but
    // we hand out a shallow copy on read so callers cannot mutate.
    const bucket = this._byKind.get(kind);
    return bucket ? bucket.slice() : EMPTY_CONTRIBUTIONS;
  }

  register(contribution: PluginContribution): Disposable {
    this._appendUnchecked(contribution);
    let disposed = false;
    return {
      dispose: () => {
        if (disposed) return;
        disposed = true;
        const bucket = this._byKind.get(contribution.kind);
        if (!bucket) return;
        const idx = bucket.indexOf(contribution);
        if (idx >= 0) bucket.splice(idx, 1);
        if (bucket.length === 0) this._byKind.delete(contribution.kind);
      },
    };
  }

  private _appendUnchecked(c: PluginContribution): void {
    const bucket = this._byKind.get(c.kind);
    if (bucket) {
      bucket.push(c);
    } else {
      this._byKind.set(c.kind, [c]);
    }
  }

  // ── Phase F first cut ──────────────────────────────────────────────────

  get count(): number {
    return PLUGIN_CATALOG.length;
  }

  list(): readonly PluginDescriptor[] {
    return PLUGIN_CATALOG;
  }

  get(id: string): PluginDescriptor | null {
    return BY_ID.get(id) ?? null;
  }

  byKind(kind: PluginDescriptor['kind']): readonly PluginDescriptor[] {
    return BY_KIND.get(kind) ?? Object.freeze([]);
  }
}

const EMPTY_CONTRIBUTIONS: readonly PluginContribution[] = Object.freeze([]);
