import type { ChainResult, Migrator, RawFamily } from './types.js';
export declare class MigratorRegistry {
    private readonly byFrom;
    register(migrator: Migrator): void;
    /** Total number of edges currently registered. */
    size(): number;
    /** Returns the ordered chain of migrators that lifts `fromVersion`
     *  to `targetVersion`.  Returns `null` when no path exists. */
    resolveChain(fromVersion: string, targetVersion: string): readonly Migrator[] | null;
    /** Run the chain `fromVersion → targetVersion` against `input` and
     *  return either the final family + per-step telemetry, or a typed
     *  failure with whatever steps did succeed. */
    run(input: RawFamily, targetVersion: string): ChainResult;
}
//# sourceMappingURL=registry.d.ts.map