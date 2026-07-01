// D-LE — geometry/command emission (MVP).
//
// Projects PlacedLight[] into the flat `lighting.create` commands the editor
// bus handler consumes. Payload shape is the bus-handler shape (`kind` +
// `origin`, NOT the legacy `fixtureType`/`position` — see §FIX-LIGHTING-
// PAYLOAD in LightingPlanToolHandler). Pure + deterministic.

import type { LightKind, PlacedLight } from './types.js';

export type LightIdMinter = (prefix: 'lighting') => string;

/** The base fixture kinds the schema + `@pryzm/geometry-lighting` actually
 *  support (downlight / pendant / strip / wall-sconce / emergency). */
export type SchemaLightingKind = 'downlight' | 'pendant' | 'strip' | 'wall-sconce' | 'emergency';

/**
 * §FIX-LIGHTING-KIND-ENUM — the D-LE archetypes emit a RICH `LightKind` set
 * (`pendant_ceramic_bell`, `linear_led`, `floor_arc_brass`, `mirror_light`, …)
 * for placement variety, but the `lighting.create` SCHEMA + the geometry renderer
 * only know the 5 BASE kinds. Emitting a rich kind threw `LightingSchemaError:
 * kind invalid_value` and the fixture was DROPPED — so any room whose archetype
 * chose a rich primary fixture rendered with NO light (founder: ~half the rooms
 * unlit on every generate). Coerce every LightKind to its nearest schema-valid
 * base BEFORE building the payload. The `default` → 'downlight' makes this total
 * over the union, so a newly-added variant is always valid (never dropped).
 */
export function toSchemaLightingKind(kind: LightKind): SchemaLightingKind {
    switch (kind) {
        case 'downlight':
            return 'downlight';
        case 'pendant':
        case 'pendant_pebble':
        case 'pendant_ceramic_bell':
        case 'pendant_conical':
        case 'pendant_cluster':
            return 'pendant';
        case 'linear_led':
            return 'strip';
        case 'mirror_light':
            return 'wall-sconce';
        // Floor / table lamps have no dedicated schema kind and the geometry
        // renderer can't produce them; fall back to a downlight so the room is
        // still lit rather than silently dropped.
        case 'floor_wood_post':
        case 'floor_arc_brass':
        case 'floor_tripod_black':
        case 'table_terracotta':
            return 'downlight';
        default:
            return 'downlight';
    }
}

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
                // §FIX-LIGHTING-KIND-ENUM — map the rich archetype kind → a
                // schema-valid base so the fixture validates + renders (was
                // dropped with LightingSchemaError → dark rooms).
                kind: toSchemaLightingKind(p.kind),
                origin: { x: round6(p.origin.x), y: round6(p.origin.y), z: round6(p.origin.z) },
                levelId,
            },
        });
    }

    return { levelId, commands, ids, totalElementCount: commands.length, warnings };
}
