/**
 * @pryzm/ai-spend — store interface + in-memory implementation.
 *
 * The store is the persistence seam.  At S65 we ship the in-memory
 * implementation; S66 will add a Postgres adapter behind the same
 * interface (tracked in ADR-0043 §C).  The api-gateway depends only on
 * the interface so the swap at S66 is a config change, not a refactor.
 *
 * Append-only by design: spend records are immutable financial events.
 * Bugs are corrected by inserting compensating records, never by
 * mutating history.  This matches SPEC-28 §9.4 "an immutable AI spend
 * ledger is a precondition for the workspace admin trust contract".
 */

import { AiSpendEntrySchema, type AiSpendEntry, type AiSpendQueryRange } from './types.js';

/** The persistence seam between the api-gateway and the spend ledger. */
export interface AiSpendStore {
  /** Append a single ledger entry.  Throws if the entry is invalid OR
   *  if `entry.id` is already taken (idempotency: callers must use a
   *  deterministic id derivation for at-least-once delivery). */
  append(entry: AiSpendEntry): void;

  /** Append many in one go.  All-or-nothing: validates every entry
   *  first and only commits if every one passes. */
  appendBatch(entries: readonly AiSpendEntry[]): void;

  /** Fetch entries matching the range — used by the aggregations. */
  query(range: AiSpendQueryRange): readonly AiSpendEntry[];

  /** Count of entries.  Diagnostic; do not depend on this for billing. */
  size(): number;

  /** Test-only: clear the store. */
  _clear(): void;
}

// ──────────────────────────────────────────────────────────────────────
//  In-memory implementation
// ──────────────────────────────────────────────────────────────────────

/** Thrown when `append` rejects a duplicate id. */
export class DuplicateSpendEntryError extends Error {
  public readonly name = 'DuplicateSpendEntryError';
  public readonly entryId: string;
  constructor(entryId: string) {
    super(`AiSpendStore: duplicate entry id '${entryId}' — append is idempotent.`);
    this.entryId = entryId;
  }
}

/** Thrown when `append` rejects an invalid entry. */
export class InvalidSpendEntryError extends Error {
  public readonly name = 'InvalidSpendEntryError';
  public readonly issues: unknown;
  constructor(issues: unknown) {
    super(`AiSpendStore: invalid entry`);
    this.issues = issues;
  }
}

export interface InMemoryAiSpendStoreOptions {
  /** Optional seed entries — useful for tests + admin demo views. */
  readonly seed?: readonly AiSpendEntry[];
}

export class InMemoryAiSpendStore implements AiSpendStore {
  private readonly byId = new Map<string, AiSpendEntry>();
  /** Insertion order list — kept in sync with `byId`. Range queries are
   *  linear over this list; for the volumes the workspace admin view
   *  cares about (≤ 100k entries per workspace per quarter) this is
   *  fine.  The Postgres adapter will index by (workspaceId, ts). */
  private readonly order: AiSpendEntry[] = [];

  constructor(opts: InMemoryAiSpendStoreOptions = {}) {
    if (opts.seed) {
      for (const e of opts.seed) this.append(e);
    }
  }

  append(entry: AiSpendEntry): void {
    const parsed = AiSpendEntrySchema.safeParse(entry);
    if (!parsed.success) {
      throw new InvalidSpendEntryError(parsed.error.issues);
    }
    if (this.byId.has(parsed.data.id)) {
      throw new DuplicateSpendEntryError(parsed.data.id);
    }
    // Freeze for immutability.
    const frozen = Object.freeze({ ...parsed.data });
    this.byId.set(frozen.id, frozen);
    this.order.push(frozen);
  }

  appendBatch(entries: readonly AiSpendEntry[]): void {
    // Validate all first — rolls back nothing on success because we
    // commit one-by-one only after every entry parses.
    const parsed: AiSpendEntry[] = [];
    for (const e of entries) {
      const r = AiSpendEntrySchema.safeParse(e);
      if (!r.success) throw new InvalidSpendEntryError(r.error.issues);
      if (this.byId.has(r.data.id)) {
        throw new DuplicateSpendEntryError(r.data.id);
      }
      parsed.push(r.data);
    }
    // Second pass — commit.
    for (const e of parsed) {
      const frozen = Object.freeze({ ...e });
      this.byId.set(frozen.id, frozen);
      this.order.push(frozen);
    }
  }

  query(range: AiSpendQueryRange): readonly AiSpendEntry[] {
    const fromTs = range.fromTs ?? Number.NEGATIVE_INFINITY;
    const toTs = range.toTs ?? Number.POSITIVE_INFINITY;
    const ws = range.workspaceId;
    const pj = range.projectId;
    const out: AiSpendEntry[] = [];
    for (const e of this.order) {
      if (e.ts < fromTs) continue;
      if (e.ts >= toTs) continue;
      if (ws !== undefined && e.workspaceId !== ws) continue;
      if (pj !== undefined && e.projectId !== pj) continue;
      out.push(e);
    }
    return out;
  }

  size(): number { return this.byId.size; }

  _clear(): void {
    this.byId.clear();
    this.order.length = 0;
  }
}
