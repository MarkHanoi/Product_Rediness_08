/**
 * @pryzm/ai-spend — aggregation helpers (SPEC-28 §9 dashboard math).
 *
 * Pure functions over arrays of AiSpendEntry.  The api-gateway calls
 * these on the result of `store.query(range)` — separating "what entries
 * to consider" (the store) from "how to roll them up" (this file)
 * keeps the test surface small and lets us unit-test aggregation
 * arithmetic without faking a store.
 *
 * Determinism: every aggregation returns rows sorted by `key` ascending
 * so JSON output bytes are stable for snapshot tests + ETag computation.
 */

import type { AiSpendEntry, AiSpendAggregateRow, AiSpendTotals } from './types.js';

// ──────────────────────────────────────────────────────────────────────
//  Internal helpers
// ──────────────────────────────────────────────────────────────────────

function freezeRows<K>(rows: AiSpendAggregateRow<K>[]): readonly AiSpendAggregateRow<K>[] {
  for (const r of rows) Object.freeze(r);
  return Object.freeze(rows);
}

/**
 * Group entries by `keyFn(entry)` and roll up count + totalCost +
 * first/last timestamps.  Sorted by key ascending.
 */
function aggregateBy<K extends string>(
  entries: readonly AiSpendEntry[],
  keyFn: (e: AiSpendEntry) => K,
): readonly AiSpendAggregateRow<K>[] {
  type Acc = {
    count: number;
    totalCostUsd: number;
    firstSeenTs: number;
    lastSeenTs: number;
  };
  const map = new Map<K, Acc>();
  for (const e of entries) {
    const k = keyFn(e);
    const acc = map.get(k);
    if (acc === undefined) {
      map.set(k, {
        count: 1,
        totalCostUsd: e.costUsd,
        firstSeenTs: e.ts,
        lastSeenTs: e.ts,
      });
    } else {
      acc.count += 1;
      acc.totalCostUsd += e.costUsd;
      if (e.ts < acc.firstSeenTs) acc.firstSeenTs = e.ts;
      if (e.ts > acc.lastSeenTs) acc.lastSeenTs = e.ts;
    }
  }
  const rows: AiSpendAggregateRow<K>[] = [];
  for (const [key, acc] of map) {
    rows.push({
      key,
      count: acc.count,
      totalCostUsd: roundCents(acc.totalCostUsd),
      firstSeenTs: acc.firstSeenTs,
      lastSeenTs: acc.lastSeenTs,
    });
  }
  rows.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return freezeRows(rows);
}

/** Round to 6 decimal places — sub-cent precision for AI calls. */
function roundCents(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000;
}

/** Format a Date as `YYYY-MM-DD` in UTC.  Calendar days are UTC by
 *  contract per SPEC-28 §9.2 ("workspace admin views use UTC days to
 *  avoid timezone-dependent billing rollovers"). */
export function utcDayKey(tsMs: number): string {
  const d = new Date(tsMs);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ──────────────────────────────────────────────────────────────────────
//  Public aggregations
// ──────────────────────────────────────────────────────────────────────

export function aggregateByWorkspace(
  entries: readonly AiSpendEntry[],
): readonly AiSpendAggregateRow[] {
  return aggregateBy(entries, (e) => e.workspaceId);
}

export function aggregateByProject(
  entries: readonly AiSpendEntry[],
): readonly AiSpendAggregateRow[] {
  return aggregateBy(entries, (e) => e.projectId);
}

export function aggregateByActor(
  entries: readonly AiSpendEntry[],
): readonly AiSpendAggregateRow[] {
  return aggregateBy(entries, (e) => `${e.actorKind}:${e.actorId}`);
}

export function aggregateBySurface(
  entries: readonly AiSpendEntry[],
): readonly AiSpendAggregateRow[] {
  return aggregateBy(entries, (e) => e.surface);
}

export function aggregateByDay(
  entries: readonly AiSpendEntry[],
): readonly AiSpendAggregateRow[] {
  return aggregateBy(entries, (e) => utcDayKey(e.ts));
}

export function aggregateByModel(
  entries: readonly AiSpendEntry[],
): readonly AiSpendAggregateRow[] {
  return aggregateBy(entries, (e) => e.model);
}

export function aggregateByWorkflow(
  entries: readonly AiSpendEntry[],
): readonly AiSpendAggregateRow[] {
  return aggregateBy(entries, (e) => e.workflowId);
}

/** Top-level totals — the headline numbers on the admin dashboard. */
export function computeTotals(entries: readonly AiSpendEntry[]): AiSpendTotals {
  let total = 0;
  const projects = new Set<string>();
  const actors = new Set<string>();
  for (const e of entries) {
    total += e.costUsd;
    projects.add(e.projectId);
    actors.add(`${e.actorKind}:${e.actorId}`);
  }
  return Object.freeze({
    count: entries.length,
    totalCostUsd: roundCents(total),
    distinctProjects: projects.size,
    distinctActors: actors.size,
  });
}
