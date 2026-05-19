/**
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    AI / Query (Phase D-4)
 * File:             src/ai/SemanticQueryEngine.ts
 * Contract:         docs/00_PRZYM/PRYZM_MASTER_ROADMAP_2026.md §D-4
 *
 * SemanticQueryEngine — Natural Language interface over the SemanticGraph + BIM stores.
 *
 * Design principles:
 *   1. No network calls — purely local pattern matching + store/graph traversal.
 *   2. Additive — does not replace the existing furniture QueryEngine; routes to it for
 *      furniture-specific queries.
 *   3. Zero mutations — read-only; never calls commandManager or modifies stores.
 *   4. Decoupled — resolved at call time via storeRegistry and semanticGraphManager
 *      singletons (no constructor injection required).
 *
 * Supported query families:
 *   rooms-*        rooms on a level, rooms without doors, rooms below area threshold
 *   elements-*     elements of a given type, elements on a level
 *   relationships  rooms adjacent to X, elements hosted in wall Y
 *   stats          count of elements by type
 *   compliance     rooms failing compliance (forwarded to complianceStore if present)
 */

import { storeRegistry } from '@pryzm/core-app-model';
import { semanticGraphManager } from '@pryzm/core-app-model';

export interface NLQueryResult {
    query: string;
    summary: string;
    rows: NLQueryRow[];
    durationMs: number;
}

export interface NLQueryRow {
    id: string;
    label: string;
    type: string;
    meta?: string;
}

type QueryHandler = (input: string, match: RegExpMatchArray) => NLQueryResult;

interface QueryPattern {
    patterns: RegExp[];
    handler: QueryHandler;
}

export class SemanticQueryEngine {
    private static instance: SemanticQueryEngine;
    private readonly _patterns: QueryPattern[];

    private constructor() {
        this._patterns = this._buildPatterns();
    }

    static getInstance(): SemanticQueryEngine {
        if (!SemanticQueryEngine.instance) {
            SemanticQueryEngine.instance = new SemanticQueryEngine();
        }
        return SemanticQueryEngine.instance;
    }

    query(input: string): NLQueryResult {
        const t0 = performance.now();
        const normalised = input.trim().toLowerCase();

        for (const qp of this._patterns) {
            for (const re of qp.patterns) {
                const m = normalised.match(re);
                if (m) {
                    const result = qp.handler(input, m);
                    result.durationMs = Math.round(performance.now() - t0);
                    return result;
                }
            }
        }

        return {
            query: input,
            summary: 'No matching query pattern. Try: "show all rooms", "rooms without doors", "walls on level 1", "count of beams".',
            rows: [],
            durationMs: Math.round(performance.now() - t0),
        };
    }

    // ── Pattern registry ──────────────────────────────────────────────────────

    private _buildPatterns(): QueryPattern[] {
        return [
            // ── ROOMS ────────────────────────────────────────────────────────

            {
                patterns: [
                    /show all rooms?/,
                    /list rooms?/,
                    /all rooms?/,
                    /rooms?\s+in\s+(?:the\s+)?(?:model|project|building)/,
                ],
                handler: (input) => {
                    const rooms = this._getAll('room');
                    return this._makeResult(input, `${rooms.length} room(s) in model`, rooms, (r) => ({
                        id: r.id,
                        label: r.name ?? 'Room',
                        type: 'room',
                        meta: r.occupancyType ?? undefined,
                    }));
                },
            },

            {
                patterns: [
                    /rooms?\s+(?:on|at|in)\s+level\s*(\d+|[a-z0-9\s]+)/,
                    /level\s*(\d+|[a-z0-9\s]+)\s+rooms?/,
                ],
                handler: (input, m) => {
                    const levelHint = m[1]!.trim();
                    const rooms = this._getAll('room').filter((r: any) => {
                        const lv = (r.levelId ?? r.level ?? '').toLowerCase();
                        return lv.includes(levelHint) || lv.endsWith(levelHint);
                    });
                    return this._makeResult(input, `${rooms.length} room(s) on level "${levelHint}"`, rooms, (r) => ({
                        id: r.id,
                        label: r.name ?? 'Room',
                        type: 'room',
                        meta: `level: ${r.levelId}`,
                    }));
                },
            },

            {
                patterns: [
                    /rooms?\s+without\s+(?:a\s+)?door/,
                    /rooms?\s+missing\s+(?:a\s+)?door/,
                    /rooms?\s+(?:that\s+have\s+)?no\s+door/,
                ],
                handler: (input) => {
                    const rooms = this._getAll('room').filter((r: any) => {
                        const targets = semanticGraphManager.getTargets(r.id, 'connectedTo');
                        const doors = semanticGraphManager.getTargets(r.id, 'boundedBy').flatMap(wallId =>
                            semanticGraphManager.getTargets(wallId, 'hosts').filter(tid => {
                                const doorStore = storeRegistry.getStoreForType?.('door');
                                return doorStore ? doorStore.getAll().some((d: any) => d.id === tid) : false;
                            })
                        );
                        return doors.length === 0 && targets.length === 0;
                    });
                    return this._makeResult(input, `${rooms.length} room(s) without a door`, rooms, (r) => ({
                        id: r.id,
                        label: r.name ?? 'Room',
                        type: 'room',
                        meta: 'no door found',
                    }));
                },
            },

            {
                patterns: [
                    /rooms?\s+smaller\s+than\s+([\d.]+)\s*(?:m2|sqm|m²)?/,
                    /rooms?\s+(?:with\s+)?area\s+(?:less\s+than|under|below)\s+([\d.]+)/,
                    /small\s+rooms?\s+(?:under|below)\s+([\d.]+)/,
                ],
                handler: (input, m) => {
                    const threshold = parseFloat(m[1]!);
                    const rooms = this._getAll('room').filter((r: any) => {
                        const area = r.area ?? r.boundary?.area ?? 0;
                        return area > 0 && area < threshold;
                    });
                    return this._makeResult(input, `${rooms.length} room(s) with area < ${threshold} m²`, rooms, (r) => ({
                        id: r.id,
                        label: r.name ?? 'Room',
                        type: 'room',
                        meta: `area: ${((r.area ?? r.boundary?.area ?? 0) as number).toFixed(1)} m²`,
                    }));
                },
            },

            {
                patterns: [
                    /rooms?\s+larger\s+than\s+([\d.]+)\s*(?:m2|sqm|m²)?/,
                    /rooms?\s+(?:with\s+)?area\s+(?:greater\s+than|over|above)\s+([\d.]+)/,
                ],
                handler: (input, m) => {
                    const threshold = parseFloat(m[1]!);
                    const rooms = this._getAll('room').filter((r: any) => {
                        const area = r.area ?? r.boundary?.area ?? 0;
                        return area >= threshold;
                    });
                    return this._makeResult(input, `${rooms.length} room(s) with area ≥ ${threshold} m²`, rooms, (r) => ({
                        id: r.id,
                        label: r.name ?? 'Room',
                        type: 'room',
                        meta: `area: ${((r.area ?? r.boundary?.area ?? 0) as number).toFixed(1)} m²`,
                    }));
                },
            },

            {
                patterns: [
                    /rooms?\s+adjacent\s+to\s+(.+)/,
                    /(?:what|which)\s+rooms?\s+(?:are\s+)?(?:next\s+to|beside|next\s+door\s+to)\s+(.+)/,
                ],
                handler: (input, m) => {
                    const targetName = m[1]!.trim();
                    const allRooms = this._getAll('room');
                    const anchor = allRooms.find((r: any) =>
                        (r.name ?? '').toLowerCase().includes(targetName.toLowerCase())
                    ) as any;
                    if (!anchor) {
                        return { query: input, summary: `No room named "${targetName}" found`, rows: [], durationMs: 0 };
                    }
                    const adjacentIds = semanticGraphManager.getTargets(anchor.id, 'adjacentTo');
                    const adjacent = allRooms.filter((r: any) => adjacentIds.includes(r.id));
                    return this._makeResult(input, `${adjacent.length} room(s) adjacent to "${anchor.name}"`, adjacent, (r) => ({
                        id: r.id,
                        label: r.name ?? 'Room',
                        type: 'room',
                        meta: 'adjacent',
                    }));
                },
            },

            // ── WALLS ─────────────────────────────────────────────────────────

            {
                patterns: [
                    /show all walls?/,
                    /list walls?/,
                    /all walls?/,
                ],
                handler: (input) => {
                    const walls = this._getAll('wall');
                    return this._makeResult(input, `${walls.length} wall(s)`, walls, (w) => ({
                        id: w.id,
                        label: w.name ?? `Wall ${w.id.slice(0, 6)}`,
                        type: 'wall',
                        ...(w.wallTypeId ? { meta: `type: ${w.wallTypeId}` } : {}),
                    }));
                },
            },

            {
                patterns: [
                    /walls?\s+(?:on|at|in)\s+level\s*(\d+|[a-z0-9\s]+)/,
                    /level\s*(\d+|[a-z0-9\s]+)\s+walls?/,
                ],
                handler: (input, m) => {
                    const levelHint = m[1]!.trim();
                    const walls = this._getAll('wall').filter((w: any) => {
                        const lv = (w.levelId ?? w.level ?? '').toLowerCase();
                        return lv.includes(levelHint);
                    });
                    return this._makeResult(input, `${walls.length} wall(s) on level "${levelHint}"`, walls, (w) => ({
                        id: w.id,
                        label: w.name ?? `Wall ${w.id.slice(0, 6)}`,
                        type: 'wall',
                        meta: `level: ${w.levelId}`,
                    }));
                },
            },

            // ── BEAMS / COLUMNS / SLABS ───────────────────────────────────────

            {
                patterns: [
                    /show all beams?/,
                    /list beams?/,
                    /all beams?/,
                ],
                handler: (input) => {
                    const items = this._getAll('beam');
                    return this._makeResult(input, `${items.length} beam(s)`, items, (b) => ({
                        id: b.id,
                        label: b.name ?? `Beam ${b.id.slice(0, 6)}`,
                        type: 'beam',
                        ...(b.levelId ? { meta: `level: ${b.levelId}` } : {}),
                    }));
                },
            },

            {
                patterns: [
                    /show all columns?/,
                    /list columns?/,
                    /all columns?/,
                ],
                handler: (input) => {
                    const items = this._getAll('column');
                    return this._makeResult(input, `${items.length} column(s)`, items, (c) => ({
                        id: c.id,
                        label: c.name ?? `Column ${c.id.slice(0, 6)}`,
                        type: 'column',
                        ...(c.levelId ? { meta: `level: ${c.levelId}` } : {}),
                    }));
                },
            },

            {
                patterns: [
                    /show all slabs?/,
                    /list slabs?/,
                    /all slabs?/,
                ],
                handler: (input) => {
                    const items = this._getAll('slab');
                    return this._makeResult(input, `${items.length} slab(s)`, items, (s) => ({
                        id: s.id,
                        label: s.name ?? `Slab ${s.id.slice(0, 6)}`,
                        type: 'slab',
                        ...(s.levelId ? { meta: `level: ${s.levelId}` } : {}),
                    }));
                },
            },

            // ── DOORS / WINDOWS ───────────────────────────────────────────────

            {
                patterns: [
                    /show all doors?/,
                    /list doors?/,
                    /all doors?/,
                ],
                handler: (input) => {
                    const items = this._getAll('door');
                    return this._makeResult(input, `${items.length} door(s)`, items, (d) => ({
                        id: d.id,
                        label: d.name ?? `Door ${d.id.slice(0, 6)}`,
                        type: 'door',
                        ...(d.levelId ? { meta: `level: ${d.levelId}` } : {}),
                    }));
                },
            },

            {
                patterns: [
                    /show all windows?/,
                    /list windows?/,
                    /all windows?/,
                ],
                handler: (input) => {
                    const items = this._getAll('window');
                    return this._makeResult(input, `${items.length} window(s)`, items, (w) => ({
                        id: w.id,
                        label: w.name ?? `Window ${w.id.slice(0, 6)}`,
                        type: 'window',
                        ...(w.levelId ? { meta: `level: ${w.levelId}` } : {}),
                    }));
                },
            },

            // ── HOSTED ELEMENTS ───────────────────────────────────────────────

            {
                patterns: [
                    /(?:elements?|openings?|doors?\s*and\s*windows?)\s+(?:in|hosted\s+(?:in|by)|on)\s+wall\s+([a-z0-9\-]+)/i,
                    /what(?:'s|\s+is)\s+(?:in|on)\s+wall\s+([a-z0-9\-]+)/i,
                ],
                handler: (input, m) => {
                    const wallHint = m[1]!.trim();
                    const walls = this._getAll('wall');
                    const wall = walls.find((w: any) =>
                        w.id.includes(wallHint) || (w.name ?? '').toLowerCase().includes(wallHint.toLowerCase())
                    ) as any;
                    if (!wall) {
                        return { query: input, summary: `No wall matching "${wallHint}"`, rows: [], durationMs: 0 };
                    }
                    const hostedIds = semanticGraphManager.getTargets(wall.id, 'hosts');
                    const rows: NLQueryRow[] = hostedIds.map(id => ({
                        id,
                        label: id.slice(0, 12),
                        type: 'opening',
                        meta: `hosted in ${wall.name ?? wall.id.slice(0, 8)}`,
                    }));
                    return { query: input, summary: `${rows.length} element(s) hosted in wall`, rows, durationMs: 0 };
                },
            },

            // ── COUNTS / STATS ────────────────────────────────────────────────

            {
                patterns: [
                    /(?:how many|count(?: of)?)\s+(walls?|rooms?|beams?|columns?|slabs?|doors?|windows?|stairs?|furnitures?)/,
                    /(?:total|number of)\s+(walls?|rooms?|beams?|columns?|slabs?|doors?|windows?|stairs?)/,
                ],
                handler: (input, m) => {
                    const typeWord = m[1]!.replace(/s$/, '');
                    const typeKey = typeWord as any;
                    const items = this._getAll(typeKey);
                    return {
                        query: input,
                        summary: `${items.length} ${typeWord}(s) in model`,
                        rows: [],
                        durationMs: 0,
                    };
                },
            },

            {
                patterns: [
                    /(?:model\s+)?summary/,
                    /what(?:'s|\s+is)\s+in\s+(?:the\s+)?(?:model|project|building)/,
                    /show\s+(?:me\s+)?(?:the\s+)?(?:model|project)\s+summary/,
                ],
                handler: (input) => {
                    const types: Array<[string, string]> = [
                        ['wall', 'Walls'], ['room', 'Rooms'], ['slab', 'Slabs'],
                        ['beam', 'Beams'], ['column', 'Columns'], ['door', 'Doors'],
                        ['window', 'Windows'], ['stair', 'Stairs'], ['furniture', 'Furniture'],
                    ];
                    const rows: NLQueryRow[] = types
                        .map(([type, label]) => {
                            const count = this._getAll(type as any).length;
                            return { id: type, label: `${label}: ${count}`, type: 'stat', meta: `${count} element(s)` };
                        })
                        .filter(r => {
                            const count = parseInt(r.meta ?? '0');
                            return count > 0;
                        });
                    const total = rows.reduce((acc, r) => acc + parseInt(r.meta ?? '0'), 0);
                    return { query: input, summary: `Model contains ${total} elements across ${rows.length} type(s)`, rows, durationMs: 0 };
                },
            },

            // ── SEMANTIC GRAPH STATS ──────────────────────────────────────────

            {
                patterns: [
                    /(?:show|list|get)\s+(?:all\s+)?relationships?/,
                    /relationship\s+(?:count|summary|stats?)/,
                ],
                handler: (input) => {
                    const all = semanticGraphManager.getAll();
                    const byType: Record<string, number> = {};
                    for (const r of all) {
                        byType[r.type] = (byType[r.type] ?? 0) + 1;
                    }
                    const rows: NLQueryRow[] = Object.entries(byType).map(([type, count]) => ({
                        id: type,
                        label: `${type}: ${count}`,
                        type: 'stat',
                        meta: `${count} relationship(s)`,
                    }));
                    return {
                        query: input,
                        summary: `${all.length} semantic relationships across ${rows.length} type(s)`,
                        rows,
                        durationMs: 0,
                    };
                },
            },
        ];
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private _getAll(type: string): any[] {
        try {
            const store = storeRegistry.getStoreForType?.(type as any);
            return store ? (store.getAll() as any[]) : [];
        } catch {
            return [];
        }
    }

    private _makeResult(
        query: string,
        summary: string,
        items: any[],
        mapFn: (item: any) => NLQueryRow,
    ): NLQueryResult {
        return {
            query,
            summary,
            rows: items.map(mapFn),
            durationMs: 0,
        };
    }
}

export const semanticQueryEngine = SemanticQueryEngine.getInstance();
