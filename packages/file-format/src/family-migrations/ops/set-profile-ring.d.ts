import type { Migrator } from '../types.js';
/** One vertex of the new ring, in the profile's own plane coordinates. */
export interface ProfileRingPoint {
    /** An EXISTING entity id (the vertex is retained) or a freshly minted ULID. */
    readonly id: string;
    readonly x: number;
    readonly z: number;
}
export interface SetProfileRingParams {
    readonly profileId: string;
    /**
     * The COMPLETE new ring, in ring order. Ids present on the profile are
     * retained (and overlaid); ids absent from it are minted as new `point`
     * entities; profile entities absent from this list are DELETED.
     */
    readonly points: readonly ProfileRingPoint[];
}
export declare function makeSetProfileRingMigrator(from: string, to: string, params: SetProfileRingParams): Migrator;
//# sourceMappingURL=set-profile-ring.d.ts.map