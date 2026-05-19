// §09-STAIR-SECURITY-DATABASE-CONTRACT — Phase 6: Task 6.1
// StairData uses Vec3 (plain {x,y,z}) — JSON-safe by design.
// Zod validation on deserialize prevents corrupt data entering the store.

import { StairData } from './StairTypes';
import { StairDataSchema } from './StairDataSchema';

export class StairSnapshotSerializer {

    static serialize(stair: Readonly<StairData>): Record<string, unknown> {
        return { ...stair };
    }

    static deserialize(raw: unknown): StairData {
        const result = StairDataSchema.safeParse(raw);
        if (!result.success) {
            throw new Error(`[StairSnapshotSerializer] Deserialization failed:\n${result.error.message}`);
        }
        return result.data as unknown as StairData;
    }

    static deserializeSafe(raw: unknown): StairData | null {
        try {
            return this.deserialize(raw);
        } catch (e) {
            console.error('[StairSnapshotSerializer] Skipping corrupted stair record:', e);
            return null;
        }
    }

    static serializeAll(stairs: StairData[]): Record<string, unknown>[] {
        return stairs.map(s => this.serialize(s));
    }

    static deserializeAll(raws: unknown[]): StairData[] {
        const results: StairData[] = [];
        raws.forEach((raw, i) => {
            const stair = this.deserializeSafe(raw);
            if (stair) {
                results.push(stair);
            } else {
                console.warn(`[StairSnapshotSerializer] Skipped stair at index ${i} due to validation errors`);
            }
        });
        return results;
    }
}
