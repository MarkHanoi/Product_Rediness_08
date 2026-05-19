import { type UnpackInput, type UnpackResult } from './types.js';
/**
 * Unpack a .pryzm v1 ZIP into typed project state.
 *
 * Returns `{ ok: true, manifest, events, chunks, ... }` on success,
 * `{ ok: false, reason }` on user-recoverable failure (corrupt ZIP,
 * future version, signature mismatch, ...).  Programmer errors still
 * throw.
 */
export declare function unpack(input: UnpackInput): Promise<UnpackResult>;
//# sourceMappingURL=unpack.d.ts.map