// zip-deterministic — wrapper around JSZip that enforces the
// determinism contract from plan §5.4.
//
// Per the plan and risk #2 of §20: "ship a tiny custom DEFLATE-safe
// ZIP writer (`packages/file-format/src/zip-deterministic.ts`)".
// JSZip's `generateAsync` already produces deterministic DEFLATE
// output when called with `{ compression: 'DEFLATE', compressionOptions: { level: 9 } }`
// AND when entry mtimes are normalised AND when entries are added in
// alphabetical order — all of which this wrapper enforces, so callers
// cannot accidentally produce a non-deterministic file.
//
// We use JSZip rather than re-implement the ZIP envelope because:
//   • PRYZM 1's `.pryzm` writer already uses JSZip and we have years
//     of audit history with the dependency.
//   • The custom DEFLATE writer mentioned in §20 risk #2 is the
//     escape hatch if (when) JSZip starts producing non-deterministic
//     output across versions; we do not need to lift it pre-emptively.
//
// Determinism is verified by the `family-round-trip` gate (50-document
// corpus, byte-exact across pack→unpack→repack).
import JSZip from 'jszip';
/** Frozen mtime applied to every entry — Unix epoch + one day so the
 *  ZIP's DOS-date encoding (which can't represent values before 1980)
 *  doesn't fall over.  The *value* is irrelevant; what matters is
 *  that it's the same for every entry, every pack call, on every
 *  machine. */
const FROZEN_MTIME = new Date('1980-01-01T00:00:00.000Z');
/** Write a deterministic ZIP from a list of entries.
 *
 * Guarantees:
 *  - Entries are emitted in lexicographic path order regardless of
 *    insertion order.
 *  - Every entry has the same frozen mtime.
 *  - Compression is DEFLATE level 9.
 *  - Two calls with the same input return byte-identical Uint8Array.
 */
export async function writeDeterministicZip(entries) {
    const sorted = [...entries].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
    // Reject duplicate paths up-front — silent overwrite would defeat
    // determinism and is almost certainly a programmer error.
    const seen = new Set();
    for (const e of sorted) {
        if (seen.has(e.path)) {
            throw new Error(`[file-format/zip-deterministic] duplicate entry path ${JSON.stringify(e.path)}`);
        }
        seen.add(e.path);
    }
    const zip = new JSZip();
    for (const e of sorted) {
        zip.file(e.path, e.bytes, {
            date: FROZEN_MTIME,
            // JSZip honours createFolders=false to avoid implicit
            // intermediate directory entries that would also need
            // deterministic mtimes — keep entry list flat.
            createFolders: false,
            compression: 'DEFLATE',
            compressionOptions: { level: 9 },
        });
    }
    const out = await zip.generateAsync({
        type: 'uint8array',
        compression: 'DEFLATE',
        compressionOptions: { level: 9 },
        // platform: 'UNIX' avoids pulling in process-specific OS bits.
        platform: 'UNIX',
    });
    return out;
}
/** Read a deterministic ZIP into a path-keyed map. */
export async function readDeterministicZip(bytes) {
    const zip = await JSZip.loadAsync(bytes);
    const out = new Map();
    for (const [path, entry] of Object.entries(zip.files)) {
        if (entry.dir)
            continue;
        out.set(path, await entry.async('uint8array'));
    }
    return out;
}
//# sourceMappingURL=zip-deterministic.js.map