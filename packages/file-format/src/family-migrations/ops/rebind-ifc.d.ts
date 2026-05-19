import type { Migrator } from '../types.js';
export interface RebindIfcParams {
    readonly parameterId: string;
    readonly newPset: string | null;
    readonly newProperty: string | null;
}
export declare function makeRebindIfcMigrator(from: string, to: string, params: RebindIfcParams): Migrator;
//# sourceMappingURL=rebind-ifc.d.ts.map