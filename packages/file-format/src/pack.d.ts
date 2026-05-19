import { type PackInput, type PackResult } from './types.js';
/**
 * Pack project state into a .pryzm v1 ZIP.
 *
 * Returns `{ ok: true, bytes }` on success.  On structural failure
 * returns `{ ok: false, reason }` instead of throwing — pack() is
 * meant to be called from UI save flows where a `try/catch` would be
 * brittle.  Genuine programmer errors (e.g. importing a function
 * without its dependency) still throw.
 */
export declare function pack(input: PackInput): Promise<PackResult>;
//# sourceMappingURL=pack.d.ts.map