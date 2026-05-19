import type { Migrator } from '../types.js';
export interface MergeMaterialSlotsParams {
    readonly keepSlotId: string;
    readonly removeSlotId: string;
}
export declare function makeMergeMaterialSlotsMigrator(from: string, to: string, params: MergeMaterialSlotsParams): Migrator;
//# sourceMappingURL=merge-material-slots.d.ts.map