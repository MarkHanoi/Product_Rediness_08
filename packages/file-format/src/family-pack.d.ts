import { type FamilyPackInput, type FamilyPackResult } from './family-types.js';
/** Pack a family into a deterministic `.pryzm-family` ZIP.
 *
 * Failure mode policy mirrors `pack()` (project format): structural /
 * user-recoverable errors return `{ ok: false, reason }`; programmer
 * errors throw.
 */
export declare function packFamily(input: FamilyPackInput): Promise<FamilyPackResult>;
//# sourceMappingURL=family-pack.d.ts.map