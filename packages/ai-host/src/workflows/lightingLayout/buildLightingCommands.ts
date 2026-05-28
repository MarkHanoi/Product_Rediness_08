// D-LE — geometry/command emission (MVP).
//
// Projects PlacedLight[] into the flat `lighting.create` commands the editor
// bus handler consumes. Payload shape is the bus-handler shape (`kind` +
// `origin`, NOT the legacy `fixtureType`/`position` — see §FIX-LIGHTING-
// PAYLOAD in LightingPlanToolHandler). Pure + deterministic.

import type { PlacedLight } from './types.js';

export type LightIdMinter = (prefix: 'lighting') => string;

export interface LightingCommand {
    readonly command: 'lighting.create';
    readonly payload: unknown;
}

export interface LightingCommandSet {
    readonly levelId: string;
    readonly commands: readonly LightingCommand[];
    readonly ids: readonly string[];
    readonly totalElementCount: number;
    readonly warnings: readonly string[];
}

const round6 = (n: number): number => Math.round(n * 1e6) / 1e6;

export function buildLightingCommands(
    placed: readonly PlacedLight[],
    levelId: string,
    mintId: LightIdMinter,
): LightingCommandSet {
    const commands: LightingCommand[] = [];
    const ids: string[] = [];
    const warnings: string[] = [];

    for (const p of placed) {
        if (!Number.isFinite(p.origin.x) || !Number.isFinite(p.origin.y) || !Number.isFinite(p.origin.z)) {
            warnings.push(`${p.kind} skipped — non-finite origin`);
            continue;
        }
        const id = mintId('lighting');
        ids.push(id);
        commands.push({
            command: 'lighting.create',
            payload: {
                id,
                kind: p.kind,
                origin: { x: round6(p.origin.x), y: round6(p.origin.y), z: round6(p.origin.z) },
                levelId,
            },
        });
    }

    return { levelId, commands, ids, totalElementCount: commands.length, warnings };
}
