// §STREET-LIFE (L-12936, founder 2026-09-05: "would it be possible to add everywhere pedestrians but
// also street lighting etc?") — reader for the BAKED `furniture` tile layer.
//
// Sibling of contextTrees.ts. The layer is baked from OSM NODES (`tools/context-bake/bake.mjs`
// LAYERS `furniture`, geom `point`, z15–16):
//     highway=street_lamp · amenity=bench · highway=bus_stop · amenity=bicycle_parking
// This module reads them and classifies each point by kind. The 3D-Site renders the STREET LAMPS
// today (contextStreetLifeRender.ts); the other three kinds are parsed and COUNTED so the console
// line reports what the layer actually holds rather than what we happen to draw.
//
// ⚠ §CONTEXT-DATA-HONESTY (C57 §1.5/§1.9, C58 §1.2) — THE WHOLE POINT OF THIS FILE'S RESULT SHAPE.
// The `furniture` layer is NEW: it does not exist in any tileset published before this lane, so on
// every live stamp until the orchestrator re-bakes and re-publishes, the archive header 403/404s.
// That is an ABSENCE, not a failure, and it is not the same value as "read OK, nothing mapped here":
//   • `state: 'ok'`          — the tiles answered; `lamps.length` may legitimately be 0.
//   • `state: 'absent'`      — 403/404 on the archive: the layer is NOT YET BAKED. Honest EMPTY.
//   • `state: 'unavailable'` — configured and readable in principle, but this read FAILED. NOT an
//                              answer; the count that rides with it means nothing.
//   • `state: 'disabled'`    — no tiles URL configured at all (local dev).
//   • `state: 'aborted'`     — superseded by a newer load (§L-579).
// The caller (`streetLifeLogLine`) prints the state beside the count, so "0 mapped lamps" can never
// be read as "this city has no street lighting". BAKED-ONLY, like trees and rail: there is no
// live-Overpass fallback — a `highway=street_lamp` query over a city bbox is exactly the unreliable
// hot path L-513 removed.
//
// Synthesis is NOT here. Scenery lamps are placed by the pure `contextStreetLife.placeLamps`, which
// takes this module's MAPPED lamps as the data that WINS over synthesis. Never throws.

import { contextBboxAround, CONTEXT_BBOX_HALF_DEG, type Bbox } from './contextBuildings';
import { scopeReadFanOutCap } from './contextExtentBudget';
import { readContextTileFeatures, isArchiveMissingError, type ContextTileFeature } from './contextTiles';
import type { MappedLamp, FurnitureLayerState } from './contextStreetLife';

/** The four node kinds the `furniture` bake filter admits, plus a catch-all. */
export type FurnitureKind = 'street_lamp' | 'bench' | 'bus_stop' | 'bicycle_parking' | 'other';

export interface FurnitureItem {
    readonly lon: number;
    readonly lat: number;
    readonly kind: FurnitureKind;
    /** ⚠ Derived from the tile's SYNTHETIC feature id (spaced by 16) — not an OSM id. */
    readonly osmId: number;
}

export interface ContextFurnitureCollection {
    readonly type: 'ContextFurnitureCollection';
    /** Every furniture point read, all kinds. */
    readonly items: FurnitureItem[];
    /** The `street_lamp` subset, in the shape `placeLamps` consumes. */
    readonly lamps: MappedLamp[];
    /** How the layer answered — failure, absence and empty are THREE DIFFERENT VALUES. */
    readonly state: FurnitureLayerState;
    /** Present when `state` is `unavailable`: the read's own reason string. */
    readonly reason?: string;
}

const cache = new Map<string, ContextFurnitureCollection>();

/**
 * §CTX-ONE-READ-PER-BBOX (L-585) EXTENDED TO FURNITURE (L-13110, lane STARTUP-FIX 2026-09-07).
 *
 * Same shape and same reason as parks/landuse/rail/trees: the resolved-value cache is populated on
 * COMPLETION and cannot serve a caller issued while the first read is still in flight.
 *
 * ⚠ AND THE MARGINAL COST HERE IS NOT ZERO WHILE THE LAYER IS ABSENT — it is the part that made this
 * worth doing rather than skipping. Only `ok` and `absent` are cached (`unavailable` deliberately is
 * NOT — a transient blip must not become a session-long "no lamps"), so before this guard two
 * overlapping callers of an UNREADABLE layer each ran a full read. `§CTX-KNOWN-MISSING` bounds the
 * repeat cost to a memo lookup, not to zero work, and it only arms AFTER the first probe returns.
 *
 * ⚠ THE SHARED READ TAKES NO ABORT SIGNAL (L-585). A caller that aborted still gets its honest
 * `aborted` state back — the state is per CALLER, decided after the await, not per read (§L-579).
 */
const inFlight = new Map<string, Promise<ContextFurnitureCollection>>();

function bboxKey(b: Bbox): string { return 'furniture:' + b.map((n) => n.toFixed(4)).join(','); }

export function emptyFurnitureCollection(state: FurnitureLayerState, reason?: string): ContextFurnitureCollection {
    return reason === undefined
        ? { type: 'ContextFurnitureCollection', items: [], lamps: [], state }
        : { type: 'ContextFurnitureCollection', items: [], lamps: [], state, reason };
}

/**
 * A 403/404 on the ARCHIVE means the object is not in the bucket for this tileset version — the
 * layer has not been baked/published yet. `contextTiles.isArchiveMissingError` is the ONE place that
 * verdict is spelled (it is the same test §CTX-KNOWN-MISSING memoises on); this only additionally
 * accepts the memoised form, whose reason carries a `(known missing this session …)` suffix.
 */
export function furnitureReasonIsAbsent(reason: string): boolean {
    return isArchiveMissingError(reason) || /known missing this session/.test(reason);
}

/**
 * §CTX-PMTILES-READER — classify baked `furniture` tile features. Like `trees`, this is a POINT layer
 * (`LAYER_IS_POINT.furniture = true`), so the reader hands each node over as a one-vertex "ring"
 * `[[lon,lat]]`. Kind comes from the tags the bake filter selected on; anything else is `other`
 * (kept and counted, never silently dropped and never re-labelled as a lamp).
 */
export function furnitureFromTileFeatures(features: ContextTileFeature[]): FurnitureItem[] {
    const items: FurnitureItem[] = [];
    for (const f of features) {
        const highway = f.tags['highway'] ?? '';
        const amenity = f.tags['amenity'] ?? '';
        const kind: FurnitureKind =
            highway === 'street_lamp' ? 'street_lamp'
            : highway === 'bus_stop' ? 'bus_stop'
            : amenity === 'bench' ? 'bench'
            : amenity === 'bicycle_parking' ? 'bicycle_parking'
            : 'other';
        for (let ri = 0; ri < f.rings.length; ri++) {
            const pt = f.rings[ri]![0];
            if (!pt || !Number.isFinite(pt[0]) || !Number.isFinite(pt[1])) continue;
            items.push({ lon: pt[0]!, lat: pt[1]!, kind, osmId: f.syntheticId * 16 + ri });
        }
    }
    return items;
}

/** The `street_lamp` subset in `placeLamps`' input shape. */
export function lampsFrom(items: ReadonlyArray<FurnitureItem>): MappedLamp[] {
    const out: MappedLamp[] = [];
    for (const it of items) if (it.kind === 'street_lamp') out.push({ lon: it.lon, lat: it.lat, osmId: it.osmId });
    return out;
}

/**
 * Read the baked `furniture` layer for the site bbox. Cached per bbox. Never throws — every failure
 * mode returns an EMPTY collection carrying the state that produced it, so no caller can mistake a
 * failed read for "nothing here".
 */
export async function fetchContextFurniture(
    lat: number, lon: number, signal?: AbortSignal,
    /** §SITE-SCOPE F-2 (C12 §13.1) — the scope-derived half-extent; defaults to the near read. */
    halfDeg: number = CONTEXT_BBOX_HALF_DEG,
): Promise<ContextFurnitureCollection> {
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) {
        return emptyFurnitureCollection('disabled');
    }
    const bbox = contextBboxAround(lat, lon, halfDeg);
    const key = bboxKey(bbox);
    const hit = cache.get(key);
    if (hit) return hit;

    // §CTX-ONE-READ-PER-BBOX (L-585 / L-13110) — de-duplicate ABOVE the tile read, see `inFlight`.
    let shared = inFlight.get(key);
    if (!shared) {
        shared = readFurnitureForBbox(bbox, key, halfDeg).finally(() => { inFlight.delete(key); });
        inFlight.set(key, shared);
    }
    const collection = await shared;
    // ⚠ EACH CALLER HONOURS ITS OWN SIGNAL, AFTER THE SHARED READ (§L-579). `aborted` is this
    // caller's state; the shared read still completes for the callers still watching.
    if (signal?.aborted) return emptyFurnitureCollection('aborted');
    return collection;
}

/** The ONE read for a bbox. Called only through `fetchContextFurniture`, which owns the cache and
 *  the one-read-per-bbox guarantee. Never throws. ⚠ Takes NO `AbortSignal` by design — see `inFlight`. */
async function readFurnitureForBbox(
    bbox: Bbox, key: string, halfDeg: number,
): Promise<ContextFurnitureCollection> {
    let tiled: Awaited<ReturnType<typeof readContextTileFeatures>>;
    try { tiled = await readContextTileFeatures('furniture', bbox, undefined, { fanOutCap: scopeReadFanOutCap(halfDeg) }); } // §SITE-SCOPE F-2
    catch (e) { return emptyFurnitureCollection('unavailable', String((e as Error)?.message ?? e)); }

    if (tiled.status === 'ok') {
        const items = furnitureFromTileFeatures(tiled.features);
        const collection: ContextFurnitureCollection = {
            type: 'ContextFurnitureCollection', items, lamps: lampsFrom(items), state: 'ok',
        };
        cache.set(key, collection);
        const byKind = (k: FurnitureKind) => items.filter((i) => i.kind === k).length;
        console.log(
            `[gis] §CTX-PMTILES-READER furniture: ${items.length} node(s) from ${tiled.tilesRead} baked tile(s) ` +
                `in ${tiled.ms} ms — ${byKind('street_lamp')} street lamp(s), ${byKind('bench')} bench(es), ` +
                `${byKind('bus_stop')} bus stop(s), ${byKind('bicycle_parking')} bicycle parking.`,
        );
        return collection;
    }
    if (tiled.status === 'aborted') return emptyFurnitureCollection('aborted');
    if (tiled.status === 'disabled') return emptyFurnitureCollection('disabled');

    // `unavailable` splits in two — and the split is the honesty (see the header).
    const reason = tiled.reason;
    if (furnitureReasonIsAbsent(reason)) {
        // ABSENT is a stable fact for this tileset version, so it caches: a re-bake ships a new
        // CONTEXT_TILESET_VERSION, which is a new URL and a new cache key.
        const collection = emptyFurnitureCollection('absent', reason);
        cache.set(key, collection);
        console.log(
            '[gis] §CTX-PMTILES-READER furniture: layer ABSENT for this tileset version ' +
                `(${reason}) — no mapped street lamps to read. This is an honest EMPTY, not a failure: ` +
                'synthesised street lighting still runs off the road network (§STREET-LIFE, L-12936).',
        );
        return collection;
    }
    // A real read FAILURE — never cached (a transient blip must not become a session-long "no lamps").
    console.warn(
        `[gis] §CTX-PMTILES-READER furniture: tiles configured but unreadable (${reason}) — the mapped-lamp ` +
            'count is NOT an answer (no live-Overpass fallback for this baked-only layer).',
    );
    return emptyFurnitureCollection('unavailable', reason);
}
