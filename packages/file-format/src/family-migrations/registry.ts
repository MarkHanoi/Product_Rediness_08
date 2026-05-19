// Migrator registry + linear chain runner (S57 deliverable).
//
// Spec source: PHASE-3B-FAMILY-CREATOR-REWRITE-PLAN.md §5.5.
//
// The registry stores migrators keyed by (`from`, `to`) and walks them
// in topological order.  v1 supports a single linear path per source
// version (no branching); cycles and missing edges fail fast with a
// typed error code.

import type {
  ChainResult,
  ChainStep,
  Migrator,
  RawFamily,
} from './types.js';

export class MigratorRegistry {
  private readonly byFrom = new Map<string, Migrator>();

  register(migrator: Migrator): void {
    if (migrator.from === migrator.to) {
      throw new Error(
        `migrator ${migrator.id}: from=to=${migrator.from} would cause an infinite loop`,
      );
    }
    const existing = this.byFrom.get(migrator.from);
    if (existing && existing.id !== migrator.id) {
      throw new Error(
        `migrator ${migrator.id}: another migrator (${existing.id}) ` +
          `already lifts version ${migrator.from}; v1 supports a single ` +
          `linear path`,
      );
    }
    this.byFrom.set(migrator.from, migrator);
  }

  /** Total number of edges currently registered. */
  size(): number {
    return this.byFrom.size;
  }

  /** Returns the ordered chain of migrators that lifts `fromVersion`
   *  to `targetVersion`.  Returns `null` when no path exists. */
  resolveChain(fromVersion: string, targetVersion: string): readonly Migrator[] | null {
    if (fromVersion === targetVersion) return [];
    const out: Migrator[] = [];
    const visited = new Set<string>();
    let cursor = fromVersion;
    while (cursor !== targetVersion) {
      if (visited.has(cursor)) return null; // cycle
      visited.add(cursor);
      const next = this.byFrom.get(cursor);
      if (!next) return null;
      out.push(next);
      cursor = next.to;
    }
    return out;
  }

  /** Run the chain `fromVersion → targetVersion` against `input` and
   *  return either the final family + per-step telemetry, or a typed
   *  failure with whatever steps did succeed. */
  run(input: RawFamily, targetVersion: string): ChainResult {
    const sourceVersion = input.document.formatVersion;
    const chain = this.resolveChain(sourceVersion, targetVersion);
    const partialSteps: ChainStep[] = [];
    if (chain === null) {
      return {
        ok: false,
        reason: this.byFrom.has(sourceVersion) ? 'cycle' : 'no-path',
        message:
          this.byFrom.has(sourceVersion)
            ? `cycle detected starting at ${sourceVersion}`
            : `no migrator path from ${sourceVersion} to ${targetVersion}`,
        partialSteps,
      };
    }
    if (chain.length === 0) {
      return { ok: true, family: input, steps: [], finalVersion: targetVersion };
    }
    let frame = input;
    for (const migrator of chain) {
      const start = nowMs();
      try {
        frame = migrator.apply(frame);
      } catch (err) {
        return {
          ok: false,
          reason: 'migrator-threw',
          message: `${migrator.id}: ${(err as Error).message}`,
          partialSteps,
        };
      }
      partialSteps.push({
        migratorId: migrator.id,
        from: migrator.from,
        to: migrator.to,
        durationMs: nowMs() - start,
      });
    }
    return {
      ok: true,
      family: frame,
      steps: partialSteps,
      finalVersion: targetVersion,
    };
  }
}

function nowMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}
