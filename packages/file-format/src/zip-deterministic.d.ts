export interface DeterministicEntry {
    /** Logical path inside the ZIP (e.g. `manifest.json`). */
    readonly path: string;
    /** Byte content. */
    readonly bytes: Uint8Array;
}
/** Write a deterministic ZIP from a list of entries.
 *
 * Guarantees:
 *  - Entries are emitted in lexicographic path order regardless of
 *    insertion order.
 *  - Every entry has the same frozen mtime.
 *  - Compression is DEFLATE level 9.
 *  - Two calls with the same input return byte-identical Uint8Array.
 */
export declare function writeDeterministicZip(entries: readonly DeterministicEntry[]): Promise<Uint8Array>;
/** Read a deterministic ZIP into a path-keyed map. */
export declare function readDeterministicZip(bytes: Uint8Array): Promise<ReadonlyMap<string, Uint8Array>>;
//# sourceMappingURL=zip-deterministic.d.ts.map