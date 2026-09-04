import type { Migrator } from '../types.js';
/** One point's new position, in the profile's own plane coordinates. */
export interface ProfilePointUpdate {
    readonly id: string;
    readonly x: number;
    readonly z: number;
}
export interface UpdateProfileParams {
    readonly profileId: string;
    /** Every point the profile carries, in its new position. Partial sets are
     *  refused: an author who moved one vertex still sends all of them, so the
     *  op can prove the id set is intact rather than assume it. */
    readonly points: readonly ProfilePointUpdate[];
}
export declare function makeUpdateProfileMigrator(from: string, to: string, params: UpdateProfileParams): Migrator;
//# sourceMappingURL=update-profile.d.ts.map