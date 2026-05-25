// Apartment Layout Generator — layout scorer (SPEC §9).
//
// PURE: scores a VALID layout option on four 0-1 axes and a weighted 0-100
// overall. No stores/DOM/THREE/network.

import type {
    LayoutOption,
    LayoutRoom,
    ScoringWeights,
    LayoutScore,
} from './types.js';

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/** BFS over the room adjacency graph; returns hop-distance from `startName` to every room. */
function distancesFrom(option: LayoutOption, startName: string): Map<string, number> {
    const adj = new Map(option.rooms.map(r => [r.name, r.adjacentTo] as const));
    const dist = new Map<string, number>();
    if (!adj.has(startName)) return dist;
    dist.set(startName, 0);
    const queue = [startName];
    while (queue.length) {
        const cur = queue.shift()!;
        const d = dist.get(cur)!;
        for (const n of adj.get(cur) ?? []) {
            if (!dist.has(n) && adj.has(n)) {
                dist.set(n, d + 1);
                queue.push(n);
            }
        }
    }
    return dist;
}

/**
 * Privacy = mean hop-distance of bedrooms from the entrance (hall, else a room
 * adjacent to the entrance), normalised by the graph diameter. Further = better.
 */
function privacyScore(option: LayoutOption): number {
    const bedrooms = option.rooms.filter(r => r.type === 'master' || r.type === 'bedroom');
    if (bedrooms.length === 0) return 1;
    const entry = option.rooms.find(r => r.type === 'hall')
        ?? option.rooms.find(r => r.type === 'corridor')
        ?? option.rooms[0];
    if (!entry) return 0.5;
    const dist = distancesFrom(option, entry.name);
    const reachable = [...dist.values()];
    const diameter = reachable.length ? Math.max(1, ...reachable) : 1;
    let sum = 0, n = 0;
    for (const b of bedrooms) {
        const d = dist.get(b.name);
        if (d !== undefined) { sum += d; n++; }
    }
    if (n === 0) return 0.5;
    return clamp01((sum / n) / diameter);
}

export function scoreLayout(option: LayoutOption, weights: ScoringWeights): LayoutScore {
    const totalArea = option.rooms.reduce((s, r) => s + r.area, 0) || 1;

    // naturalLight — share of floor area in rooms with a window.
    const litArea = option.rooms.filter(r => r.windowCount >= 1).reduce((s, r) => s + r.area, 0);
    const naturalLight = clamp01(litArea / totalArea);

    // privacy — bedrooms far from the entrance.
    const privacy = privacyScore(option);

    // kitchenWorkflow — kitchen↔dining adjacency + kitchen has an exterior wall (window).
    const kitchen = option.rooms.find(r => r.type === 'kitchen');
    let kitchenWorkflow = 0;
    if (kitchen) {
        const byName = new Map(option.rooms.map(r => [r.name, r] as const));
        const adjDining = kitchen.adjacentTo.some(n => byName.get(n)?.type === 'dining') ? 1 : 0;
        const hasExterior = kitchen.windowCount > 0 ? 1 : 0;
        kitchenWorkflow = (adjDining + hasExterior) / 2;
    }

    // corridorEfficiency — less circulation area is better.
    const corridorArea = option.rooms
        .filter((r: LayoutRoom) => r.type === 'corridor' || r.type === 'hall')
        .reduce((s, r) => s + r.area, 0);
    const corridorEfficiency = clamp01(1 - corridorArea / totalArea);

    const breakdown = { naturalLight, privacy, kitchenWorkflow, corridorEfficiency };
    const wSum = weights.naturalLight + weights.privacy + weights.kitchenWorkflow + weights.corridorEfficiency || 1;
    const weighted =
        (naturalLight * weights.naturalLight +
         privacy * weights.privacy +
         kitchenWorkflow * weights.kitchenWorkflow +
         corridorEfficiency * weights.corridorEfficiency) / wSum;

    return { overall: Math.round(100 * clamp01(weighted)), breakdown };
}
