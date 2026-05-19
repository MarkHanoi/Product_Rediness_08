// @pryzm/feature-flags — central registry for kill-switches & feature gates.
//
// Spec source:
//   • `phases/PHASE-2B-Q2-M16-M18-PLAN-VIEW.md` §"Kill switches" — defines
//     K2B-1..K2B-4 (plan-view canvas, annotation pipeline, contract-44
//     overrides, auto-dim live wiring).
//   • Post-2B closeout ADR-0030 §2.4 — surfaces the registry as a real
//     code module so the `?pryzm2=1` URL flag is no longer the only way
//     to gate a sub-feature.
//
// CONTRACT
// ─────────────────────────────────────────────────────────────────────────────
// • Pure: no DOM, no THREE, no Node-only globals.  Runs in Node tests + the
//   bake worker + the browser.
// • All flags are BOOLEAN.  Numeric / string config belongs elsewhere.
// • Defaults are conservative: kill-switches default to "feature ON";
//   flipping the switch turns the feature OFF.  This means the absence
//   of a flag never turns off a shipped feature.
// • Source precedence (highest wins):
//     1. Explicit `set(name, value)` from app code (e.g. URL flag wiring).
//     2. Environment-style overrides via `loadFromEnv(record)` — caller
//        supplies a `Record<string, string | undefined>`; "1"/"true"/
//        "on"/"yes" → true, "0"/"false"/"off"/"no" → false, anything
//        else is ignored.
//     3. Registry default value.
// • Listener API for live HMR / admin-panel toggles.

export type FlagName = string;
export type FlagValue = boolean;

export interface FlagDefinition {
  readonly name: FlagName;
  readonly defaultValue: FlagValue;
  readonly envVar?: string;
  readonly description?: string;
}

/** Built-in kill-switches — see PHASE-2B-…-PLAN-VIEW.md §"Kill switches". */
export const K2B_FLAGS: readonly FlagDefinition[] = [
  {
    name: 'K2B-1',
    defaultValue: true,
    envVar: 'PRYZM_K2B_1',
    description: 'Plan-view canvas host (S31).  Off ⇒ fall back to legacy plan view.',
  },
  {
    name: 'K2B-2',
    defaultValue: true,
    envVar: 'PRYZM_K2B_2',
    description: 'Plan-view annotation pipeline (S32).  Off ⇒ render geometry only.',
  },
  {
    name: 'K2B-3',
    defaultValue: true,
    envVar: 'PRYZM_K2B_3',
    description: 'Contract 44 per-view overrides (S33 G4–G8).  Off ⇒ global styles.',
  },
  {
    name: 'K2B-4',
    defaultValue: true,
    envVar: 'PRYZM_K2B_4',
    description: 'Auto-dim live wiring (S34 supplement).  Off ⇒ no auto-dimensions.',
  },
] as const;

export class FeatureFlagRegistry {
  private readonly defs = new Map<FlagName, FlagDefinition>();
  private readonly overrides = new Map<FlagName, FlagValue>();
  private readonly listeners = new Set<(name: FlagName, value: FlagValue) => void>();

  /** Register a flag definition.  Subsequent calls with the same name overwrite. */
  define(def: FlagDefinition): void {
    this.defs.set(def.name, def);
  }

  /** Bulk-define from an iterable. */
  defineAll(defs: Iterable<FlagDefinition>): void {
    for (const d of defs) this.define(d);
  }

  /** True if a definition exists. */
  has(name: FlagName): boolean { return this.defs.has(name); }

  /** Read the effective value (override → default).  Throws on unknown flag
   *  — kill-switches are too important to silently mis-spell. */
  get(name: FlagName): FlagValue {
    if (this.overrides.has(name)) return this.overrides.get(name) as FlagValue;
    const def = this.defs.get(name);
    if (!def) throw new Error(`[feature-flags] unknown flag: ${name}`);
    return def.defaultValue;
  }

  /** Set an explicit override.  Pass `undefined` to clear.
   *  Listeners fire only on EFFECTIVE-VALUE change — setting the
   *  override to the same value the registry already reports is a
   *  no-op event-wise. */
  set(name: FlagName, value: FlagValue | undefined): void {
    if (!this.defs.has(name)) {
      throw new Error(`[feature-flags] cannot set unknown flag: ${name}`);
    }
    const prevEffective = this.get(name);
    if (value === undefined) {
      const had = this.overrides.delete(name);
      if (!had) return;
      const nextEffective = this.get(name);
      if (nextEffective !== prevEffective) this.fanout(name, nextEffective);
      return;
    }
    this.overrides.set(name, value);
    if (value !== prevEffective) this.fanout(name, value);
  }

  /** Apply env-style overrides.  Recognised string values:
   *  truthy: '1', 'true', 'on', 'yes' (case-insensitive)
   *  falsey: '0', 'false', 'off', 'no'
   *  Anything else (including absent / empty) is ignored. */
  loadFromEnv(env: Readonly<Record<string, string | undefined>>): void {
    for (const def of this.defs.values()) {
      if (!def.envVar) continue;
      const raw = env[def.envVar];
      if (raw === undefined || raw === '') continue;
      const v = parseBool(raw);
      if (v !== undefined) this.set(def.name, v);
    }
  }

  /** Subscribe to changes.  Listener fires on every set() that actually
   *  changes the effective value. */
  onChange(listener: (name: FlagName, value: FlagValue) => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  /** Snapshot for diagnostic / admin UI.  Returns name → effective value. */
  snapshot(): Readonly<Record<FlagName, FlagValue>> {
    const out: Record<FlagName, FlagValue> = {};
    for (const name of this.defs.keys()) out[name] = this.get(name);
    return out;
  }

  /** All registered definitions (read-only). */
  definitions(): readonly FlagDefinition[] {
    return [...this.defs.values()];
  }

  private fanout(name: FlagName, value: FlagValue): void {
    for (const l of this.listeners) {
      try { l(name, value); }
      catch { /* listener errors are swallowed — registry must not crash */ }
    }
  }
}

function parseBool(raw: string): FlagValue | undefined {
  const v = raw.trim().toLowerCase();
  if (v === '1' || v === 'true' || v === 'on' || v === 'yes') return true;
  if (v === '0' || v === 'false' || v === 'off' || v === 'no') return false;
  return undefined;
}

/** Build a registry pre-loaded with the K2B kill-switches.  Exposed as
 *  the canonical entry-point for app bootstrap; callers can `define()`
 *  additional flags on top. */
export function createDefaultRegistry(): FeatureFlagRegistry {
  const r = new FeatureFlagRegistry();
  r.defineAll(K2B_FLAGS);
  return r;
}
