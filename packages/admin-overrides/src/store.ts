/**
 * @pryzm/admin-overrides — store interface + in-memory implementation.
 *
 * Each subject (`workspace:ws-x` or `user:u-y`) has at most ONE active
 * override record.  `set` is upsert-style — replacing an existing
 * override is a normal admin action (e.g. extending an expiry).  The
 * audit trail lives in the api-gateway request log, NOT in this store.
 */

import {
  OverrideRecordSchema,
  overrideKey,
  type OverrideRecord,
  type SubjectKind,
} from './types.js';

export interface OverrideStore {
  /** Upsert.  Throws if the record fails schema validation. */
  set(record: OverrideRecord): void;
  /** Read by composite key (`subjectKind:subjectId`). */
  get(kind: SubjectKind, id: string): OverrideRecord | undefined;
  /** Delete an override.  Returns true iff one was removed. */
  delete(kind: SubjectKind, id: string): boolean;
  /** List ALL overrides — admin UI list view.  Stable order by key. */
  list(): readonly OverrideRecord[];
  /** Diagnostic. */
  size(): number;
  _clear(): void;
}

export class InvalidOverrideError extends Error {
  public readonly name = 'InvalidOverrideError';
  public readonly issues: unknown;
  constructor(issues: unknown) {
    super('OverrideStore: invalid override record');
    this.issues = issues;
  }
}

export interface InMemoryOverrideStoreOptions {
  readonly seed?: readonly OverrideRecord[];
}

export class InMemoryOverrideStore implements OverrideStore {
  private readonly map = new Map<string, OverrideRecord>();

  constructor(opts: InMemoryOverrideStoreOptions = {}) {
    if (opts.seed) for (const r of opts.seed) this.set(r);
  }

  set(record: OverrideRecord): void {
    const parsed = OverrideRecordSchema.safeParse(record);
    if (!parsed.success) {
      throw new InvalidOverrideError(parsed.error.issues);
    }
    const key = overrideKey(parsed.data.subjectKind, parsed.data.subjectId);
    this.map.set(key, Object.freeze({ ...parsed.data }));
  }

  get(kind: SubjectKind, id: string): OverrideRecord | undefined {
    return this.map.get(overrideKey(kind, id));
  }

  delete(kind: SubjectKind, id: string): boolean {
    return this.map.delete(overrideKey(kind, id));
  }

  list(): readonly OverrideRecord[] {
    const arr = Array.from(this.map.values());
    arr.sort((a, b) => {
      const ka = overrideKey(a.subjectKind, a.subjectId);
      const kb = overrideKey(b.subjectKind, b.subjectId);
      return ka < kb ? -1 : ka > kb ? 1 : 0;
    });
    return Object.freeze(arr);
  }

  size(): number { return this.map.size; }
  _clear(): void { this.map.clear(); }
}
