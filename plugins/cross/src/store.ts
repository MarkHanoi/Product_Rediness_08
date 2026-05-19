// CrossStore — registry of active cross-element cascade rules (ADR-012).
//
// Wave 12 recipe completion: cross plugin store.ts (previously missing).
//
// The cross plugin orchestrates cascade rules: when a source element
// mutates (e.g. slab geometry changes), the cross plugin fires derived
// commands on dependent elements (e.g. pinned walls adjust).
//
// The store tracks which rule sets are registered and their last
// execution timestamp — used by the cascade panel for diagnostics.

export interface CascadeRuleRecord {
  /** Unique rule name, e.g. 'slab-wall', 'stair-handrail', 'wall-room'. */
  readonly name: string;
  /** Whether the rule is currently enabled. */
  enabled: boolean;
  /** ISO timestamp of last successful execution. */
  lastExecutedAt?: string;
  /** Count of cascade commands fired by this rule in the current session. */
  executionCount: number;
}

export type CascadeRulesState = Record<string, CascadeRuleRecord>;

export type CrossDirtyCallback = () => void;

/**
 * CrossStore holds the registered cascade rule set.
 * Handlers call register() when cross.registerRules fires;
 * the diagnostics panel reads via getRules().
 */
export class CrossStore {
  private readonly rules = new Map<string, CascadeRuleRecord>();
  private readonly dirtyListeners = new Set<CrossDirtyCallback>();

  getRules(): readonly CascadeRuleRecord[] {
    return [...this.rules.values()];
  }

  getRule(name: string): CascadeRuleRecord | undefined {
    return this.rules.get(name);
  }

  isRegistered(name: string): boolean {
    return this.rules.has(name);
  }

  /** Called by the handler when cross.registerRules fires. */
  register(name: string): void {
    this.rules.set(name, { name, enabled: true, executionCount: 0 });
    this.fireDirty();
  }

  /** Called by the cascade executor after a rule fires. */
  recordExecution(name: string): void {
    const rule = this.rules.get(name);
    if (!rule) return;
    rule.executionCount += 1;
    rule.lastExecutedAt = new Date().toISOString();
    this.fireDirty();
  }

  setEnabled(name: string, enabled: boolean): void {
    const rule = this.rules.get(name);
    if (!rule) return;
    rule.enabled = enabled;
    this.fireDirty();
  }

  subscribeDirty(cb: CrossDirtyCallback): () => void {
    this.dirtyListeners.add(cb);
    return () => this.dirtyListeners.delete(cb);
  }

  private fireDirty(): void {
    for (const cb of this.dirtyListeners) cb();
  }
}
