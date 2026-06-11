// §DIAG-EXEC-* — EXECUTION-BOUNDARY diagnostics (founder 2026-06-10).
//
// PURPOSE: a SINGLE console paste must tell us EXACTLY where generated-house
// quality is lost between (a) what the PURE engine DESIGNED (the §DIAG-* engine
// logs: caps enforced — bedroom ≤16 %, master ≤20 %; §HALL-SINGLETON;
// §ROOM-OVERLAP-HARD) and (b) what the EDITOR actually SHIPPED + DETECTED. The
// engine diagnostics are rich; the EDITOR-side ones were thin. A 53 m² en-suite
// is IMPOSSIBLE from the engine caps, so a designed↔shipped divergence is at the
// EDITOR execution / detection / naming boundary — this module surfaces it.
//
// It compares, PER LEVEL:
//   §DIAG-EXEC-ROOMS   — engineRooms=N vs detectedRooms=M (+ the mismatch list).
//                        THE single most important line: proves whether room
//                        DETECTION diverged from the engine design (merge/split).
//   §DIAG-EXEC-AREA    — per detected room: detectedArea vs the matched engine
//                        target vs the §AREA-FRACTIONS cap (maxAreaFrac × plate);
//                        verdict OK / ⚠ OVER-CAP / ⚠ NO-ENGINE-MATCH. Surfaces the
//                        founder's "29-53 m² oversized" defect + whether it is a
//                        detection-merge (detected ≫ engine target) vs the design.
//   §DIAG-EXEC-DOORS   — per detected room: door openings on its bounding walls;
//                        ⚠ NO-DOOR if zero. Measures "8/10 rooms door-gaps=0".
//   §DIAG-EXEC-WINDOWS — per perimeter-fronting detected room: window count +
//                        ⚠ NO-WINDOW; AND ⚠ WINDOW-ON-PARTITION for any window
//                        whose host wall is an INTERIOR partition (not shell).
//   §DIAG-EXEC-STAIR   — detected rooms overlapping the stair keep-out: exactly
//                        ONE should be the "Stair"; ⚠ HABITABLE-ON-STAIR otherwise.
//   …then a one-line ROLLUP: roomsWithDoor=X/M windowless=Y overCap=Z noEngineMatch=W.
//
// (§DIAG-EXEC-ROTATION is emitted from the executor, where the `result`+`shell`
//  live — see HouseLayoutExecutor; this module owns the per-room comparisons that
//  need the DETECTED room store + wall openings + façade orientation.)
//
// LOGGING ONLY — no geometry / behaviour change. Deterministic. P2: no THREE
// (reads plain store records + the façade service). Reuses the bijective
// `pointInPolygon` from matchDetectedRooms so the designed↔detected pairing here
// matches the naming pass's pairing (no second, divergent matcher).
//
// Governance: C53 (house/apartment generation engine) — instrumentation of the
// engine→editor execution boundary; C04 (rendering/scheduling) — read-only, no
// scheduling impact. ADR-0061 determinism (no Date.now / Math.random).

import { storeRegistry } from '@pryzm/core-app-model';
import { facadeOrientationService } from '@pryzm/spatial-index';
import type { ScoredLayoutOption } from '@pryzm/ai-host';
import { pointInPolygon } from '../apartment-layout/matchDetectedRooms.js';

// ── §AREA-FRACTIONS cap table ────────────────────────────────────────────────
// maxAreaFrac per room TYPE × plate net area = the room's area CEILING. Mirror of
// the SINGLE SOURCE OF TRUTH — `ROOM_RULES` in
// packages/ai-host/src/workflows/apartmentLayout/rules/programRules.ts (the
// `maxAreaFrac` field per rule). Hardcoded here (with this pointer) because
// ROOM_RULES is not re-exported from the @pryzm/ai-host barrel and the editor L7
// layer should not reach into the package's internal rules module. Types absent
// from this table have NO maxAreaFrac in programRules (uncapped → Infinity):
// hall, stair, study, bathroom, ensuite, wc, utility.
const MAX_AREA_FRAC: Readonly<Record<string, number>> = {
    living: 0.32,    // §SOCIAL-CAVERN-CAP
    kitchen: 0.16,   // §SOCIAL-CAVERN-CAP
    dining: 0.16,    // §SOCIAL-CAVERN-CAP
    corridor: 0.10,  // §AREA-FRACTIONS
    master: 0.20,    // §AREA-FRACTIONS ceiling
    bedroom: 0.16,   // §AREA-FRACTIONS ceiling (each secondary bedroom)
};

/** Rooms that legitimately carry no window (so EXEC-WINDOWS does not flag them). */
const NO_WINDOW_OK = new Set(['corridor', 'hall', 'wc', 'utility', 'storage', 'ensuite', 'stair']);

/** Engine room flattened to the comparison shape (metres, world XZ centroid). */
interface EngineRoomCmp {
    readonly name: string;
    readonly type: string;
    readonly occupancy?: string;
    readonly areaM2: number;
    readonly cx: number;
    readonly cz: number;
    /** Footprint polygon in metres (world XZ) — for the stair-overlap test. */
    readonly polyM: ReadonlyArray<{ x: number; z: number }>;
}

/** Detected room flattened to the comparison shape (metres, world XZ). */
interface DetectedRoomCmp {
    readonly id: string;
    readonly name: string;
    readonly occupancyType: string;
    readonly areaM2: number;
    readonly cx: number;
    readonly cz: number;
    readonly polygon: ReadonlyArray<{ x: number; z: number }>;
    readonly boundingWallIds: readonly string[];
}

/** A wall as the legacy store exposes it (same shape HouseLayoutExecutor reads). */
interface WallRec {
    id: string;
    levelId: string;
    baseLine?: ReadonlyArray<{ x: number; z: number }>;
    // §VERBOSE-DIAG-2 (founder 2026-06-11) — offset/width surfaced for the window-clash
    // diagnostic (§DIAG-EXEC-WIN-CLASH). Optional: undefined → clash check skipped for that wall.
    openings?: ReadonlyArray<{ type: 'window' | 'door'; elementId?: string; offset?: number; width?: number }>;
    // §VERBOSE-DIAG (founder 2026-06-11) — surfaced for the wall-height / partition-slab
    // diagnostics (§DIAG-EXEC-WALLS). Optional: a record without it logs height=?.
    height?: number;
    thickness?: number;
}

/** Detected room as the room store exposes it (RoomData subset). */
interface RoomRec {
    id: string;
    name?: string;
    occupancyType?: string;
    boundary?: { polygon?: ReadonlyArray<{ x: number; z: number }> };
    boundingWallIds?: readonly string[];
    computed?: { area?: number; centroid?: { x: number; z: number } };
}

function centroidOf(poly: ReadonlyArray<{ x: number; z: number }>): { x: number; z: number } {
    let cx = 0, cz = 0;
    for (const p of poly) { cx += p.x; cz += p.z; }
    const n = Math.max(1, poly.length);
    return { x: cx / n, z: cz / n };
}

/**
 * Bijective designed↔detected pairing — the SAME two-pass contract
 * `matchDetectedRooms` uses (direct centroid-in-polygon containment, then
 * nearest-unused fallback), but retaining the engine-room OBJECT (not just its
 * name) so the area/target/cap comparison can read the matched engine target.
 * Returns, per detected room id, the engine room it was paired with (or null).
 */
function pairDetectedToEngine(
    engine: readonly EngineRoomCmp[],
    detected: readonly DetectedRoomCmp[],
): Map<string, EngineRoomCmp | null> {
    const out = new Map<string, EngineRoomCmp | null>();
    const tgl = [...engine].sort((a, b) => b.areaM2 - a.areaM2);
    const used = new Set<EngineRoomCmp>();
    const pending: DetectedRoomCmp[] = [];

    // Pass 1 — direct containment (largest engine room first; uniqueness-tracked).
    for (const d of detected) {
        if (d.polygon.length < 3) { out.set(d.id, null); continue; }
        const hit = tgl.find(t => !used.has(t) && pointInPolygon(t.cx, t.cz, d.polygon));
        if (hit) { used.add(hit); out.set(d.id, hit); }
        else pending.push(d);
    }
    // Pass 2 — nearest still-unused engine room, nearest-first (global order).
    const cands: Array<{ d: DetectedRoomCmp; t: EngineRoomCmp; dist: number }> = [];
    for (const d of pending) {
        for (const t of tgl) {
            const dist = (t.cx - d.cx) * (t.cx - d.cx) + (t.cz - d.cz) * (t.cz - d.cz);
            cands.push({ d, t, dist });
        }
    }
    cands.sort((a, b) => a.dist - b.dist);
    const claimed = new Set<string>();
    for (const c of cands) {
        if (claimed.has(c.d.id) || used.has(c.t)) continue;
        used.add(c.t); claimed.add(c.d.id); out.set(c.d.id, c.t);
    }
    for (const d of pending) if (!out.has(d.id)) out.set(d.id, null);
    return out;
}

/**
 * Emit the §DIAG-EXEC-* execution-boundary diagnostics for ONE level. Best-effort
 * + read-only — never throws, never mutates. Called once per generation per level
 * (right after that level's rooms are detected + matched, from the naming pass).
 *
 * @param levelId  the storey level being inspected.
 * @param option   the engine `ScoredLayoutOption` that DESIGNED this storey.
 * @param logTag   console prefix ('[house-layout]' / '[apartment-layout]').
 * @param stairRectsWorld  OPTIONAL stair keep-out rects in WORLD XZ (metres), for
 *   the §DIAG-EXEC-STAIR overlap test. Omitted/empty ⇒ EXEC-STAIR is skipped.
 * @param shellWallIds  OPTIONAL authoritative SHELL (perimeter) wall-id set for this
 *   level (from the executor via houseShellWalls). When supplied, shell-vs-partition
 *   is decided by membership in this set (robust) — a window on a shell wall is NEVER
 *   flagged WINDOW-ON-PARTITION. Falls back to the façade service when omitted/empty.
 * @param stairKeepRoomIds  OPTIONAL detected-room ids the stair resolver KEEPS as the
 *   single non-habitable `stair` room (from `resolveStairRooms().keep`). The
 *   §DIAG-EXEC-STAIR HABITABLE-ON-STAIR flag treats these as the stair regardless of
 *   their (not-yet-committed) occupancy/name — so a room over the void that IS the
 *   resolved stair keep is never falsely flagged habitable.
 */
export function logExecRoomDiagnostics(
    levelId: string,
    option: ScoredLayoutOption,
    logTag = '[house-layout]',
    stairRectsWorld?: ReadonlyArray<{ minX: number; maxX: number; minZ: number; maxZ: number }>,
    shellWallIds?: ReadonlySet<string>,
    stairKeepRoomIds?: ReadonlySet<string>,
): void {
    try {
        // ── Gather the DETECTED rooms (RoomData) for this level. ──────────────
        const roomStore = storeRegistry.getStoreForType('room') as unknown as
            { getByLevel?: (id: string) => RoomRec[] } | undefined;
        const rawDetected = roomStore?.getByLevel?.(levelId) ?? [];
        const detected: DetectedRoomCmp[] = rawDetected
            .map(r => {
                const poly = (r.boundary?.polygon ?? []).map(p => ({ x: p.x, z: p.z }));
                const c = r.computed?.centroid ?? centroidOf(poly);
                return {
                    id: r.id,
                    name: r.name ?? '(unnamed)',
                    occupancyType: r.occupancyType ?? 'unclassified',
                    areaM2: r.computed?.area ?? 0,
                    cx: c.x, cz: c.z,
                    polygon: poly,
                    boundingWallIds: r.boundingWallIds ?? [],
                };
            });

        // ── Flatten the ENGINE rooms (mm → m; plan-y is world-z). ─────────────
        const engine: EngineRoomCmp[] = option.rooms.map(r => {
            const c = r.centroid;
            const polyM = (r.polygon ?? []).map(p => ({ x: p.x / 1000, z: p.y / 1000 }));
            const fallback = polyM.length >= 3 ? centroidOf(polyM) : { x: 0, z: 0 };
            return {
                name: r.name,
                type: r.type,
                occupancy: r.occupancy,
                areaM2: r.area,
                cx: c ? c.x / 1000 : fallback.x,
                cz: c ? c.y / 1000 : fallback.z,
                polyM,
            };
        });

        // The plate net area the §AREA-FRACTIONS caps are taken AGAINST. The engine
        // distributes room areas over the storey's net plate, so the sum of the
        // engine room areas is the plate budget the caps were applied to. (Detected
        // areas can sum differently after a merge — that's exactly what we surface.)
        const plateM2 = engine.reduce((n, r) => n + r.areaM2, 0);

        // ── §DIAG-EXEC-ROOMS ─────────────────────────────────────────────────
        const N = engine.length, M = detected.length;
        console.log(`${logTag} §DIAG-EXEC-ROOMS level=${levelId} engineRooms=${N} detectedRooms=${M}${N === M ? ' ✓' : ' ⚠ COUNT-MISMATCH (detection diverged from design — merge/split)'}`);
        if (N !== M) {
            const eng = engine.map(r => `${r.name}[${r.type}] ${r.areaM2.toFixed(1)}m²`).join(' | ');
            const det = detected.map(r => `${r.name}[${r.occupancyType}] ${r.areaM2.toFixed(1)}m²`).join(' | ');
            console.warn(`${logTag} §DIAG-EXEC-ROOMS ${levelId} engine: ${eng}`);
            console.warn(`${logTag} §DIAG-EXEC-ROOMS ${levelId} detected: ${det}`);
        }

        // ── Pair detected → engine (bijective, retaining the engine object). ──
        const pairing = pairDetectedToEngine(engine, detected);

        // ── Build a wall lookup (openings + façade exterior/interior). ────────
        const wallStore = storeRegistry.getStoreForType('wall') as unknown as
            { getAll?: () => WallRec[] } | undefined;
        const allWalls = wallStore?.getAll?.() ?? [];
        const wallById = new Map<string, WallRec>();
        for (const w of allWalls) if (w.levelId === levelId) wallById.set(w.id, w);
        let facades: Map<string, { isExterior: boolean }> | undefined;
        try { facades = facadeOrientationService.getFacades(levelId) as unknown as Map<string, { isExterior: boolean }>; }
        catch { facades = undefined; }
        // §DIAG-EXEC-WINDOWS shell-vs-partition (founder v106 false-positive fix) — a wall
        // is SHELL/exterior if (a) it is in the executor's authoritative shell wall-id set
        // (the drawn ground shell that hosts the entrance door + façade windows, or the
        // minted upper-storey perimeter ring), OR (b) the façade service marks it exterior.
        // The shell set is decisive: on the founder's plate the façade service returned
        // false/unknown for genuine shell walls (the 22.7 m perimeter walls), wrongly
        // flagging façade windows as WINDOW-ON-PARTITION. Only when NEITHER signal marks a
        // wall as shell is its window treated as on an interior partition.
        const haveShellSet = !!shellWallIds && shellWallIds.size > 0;
        const isExteriorWall = (wallId: string): boolean =>
            (haveShellSet && shellWallIds!.has(wallId)) || (facades?.get(wallId)?.isExterior ?? false);

        // Rollup accumulators.
        let roomsWithDoor = 0, windowlessCount = 0, overCapCount = 0, noEngineMatchCount = 0;

        // ── §DIAG-EXEC-AREA + §DIAG-EXEC-DOORS + §DIAG-EXEC-WINDOWS (per room) ─
        for (const d of detected) {
            const eng = pairing.get(d.id) ?? null;
            const type = eng?.type ?? d.occupancyType;
            const cap = MAX_AREA_FRAC[type] !== undefined ? MAX_AREA_FRAC[type]! * plateM2 : Infinity;
            const targetStr = eng ? `${eng.areaM2.toFixed(1)}` : '—';
            const capStr = Number.isFinite(cap) ? `${cap.toFixed(1)}` : '∞';
            let verdict: string;
            if (!eng) { verdict = '⚠ NO-ENGINE-MATCH'; noEngineMatchCount++; }
            else if (Number.isFinite(cap) && d.areaM2 > cap + 0.05) { verdict = '⚠ OVER-CAP'; overCapCount++; }
            else verdict = 'OK';
            console.log(`${logTag} §DIAG-EXEC-AREA ${levelId} ${d.name}[${type}] detected=${d.areaM2.toFixed(1)}m² engineTarget=${targetStr}m² cap=${capStr}m² ${verdict}`);

            // §DIAG-EXEC-DOORS — door openings on this room's bounding walls.
            let doorN = 0, perimeterFronting = false, windowN = 0;
            const partitionWindows: string[] = [];
            for (const wid of d.boundingWallIds) {
                const w = wallById.get(wid);
                if (!w) continue;
                const exterior = isExteriorWall(wid);
                if (exterior) perimeterFronting = true;
                for (const op of w.openings ?? []) {
                    if (op.type === 'door') doorN++;
                    else if (op.type === 'window') {
                        windowN++;
                        // A window hosted on an INTERIOR partition is a defect.
                        if (!exterior) partitionWindows.push(wid);
                    }
                }
            }
            if (doorN > 0) roomsWithDoor++;
            console.log(`${logTag} §DIAG-EXEC-DOORS ${levelId} ${d.name}[${type}] doors=${doorN}${doorN === 0 ? ' ⚠ NO-DOOR' : ''}`);

            // §DIAG-EXEC-WINDOWS — only flag rooms that FRONT a perimeter wall and
            // are window-desired (so an interior wc / corridor is never flagged).
            const windowDesired = !NO_WINDOW_OK.has(type);
            if (perimeterFronting && windowDesired) {
                const noWin = windowN === 0;
                if (noWin) windowlessCount++;
                console.log(`${logTag} §DIAG-EXEC-WINDOWS ${levelId} ${d.name}[${type}] windows=${windowN}${noWin ? ' ⚠ NO-WINDOW' : ''}`);
            }
            if (partitionWindows.length > 0) {
                console.warn(`${logTag} §DIAG-EXEC-WINDOWS ${levelId} ${d.name}[${type}] ⚠ WINDOW-ON-PARTITION wall=${partitionWindows.join(',')} (window hosted on an INTERIOR wall, not the shell)`);
            }
        }

        // ── §DIAG-EXEC-STAIR — detected rooms overlapping the stair keep-out. ─
        if (stairRectsWorld && stairRectsWorld.length > 0) {
            const overlaps: string[] = [];
            const habitableOnStair: string[] = [];
            const STAIR_OCC = new Set(['stair', 'stairwell']);
            for (const d of detected) {
                const c = { x: d.cx, z: d.cz };
                const onStair = stairRectsWorld.some(r => c.x >= r.minX && c.x <= r.maxX && c.z >= r.minZ && c.z <= r.maxZ);
                if (!onStair) continue;
                overlaps.push(`${d.name}[${d.occupancyType}]`);
                // §DIAG-EXEC-STAIR HABITABLE-ON-STAIR (founder v106 false-positive fix) —
                // the diagnostic runs BEFORE the room.rename / SET_ROOM_OCCUPANCY batch
                // commits, so a freshly-detected stair cell still reads occupancy
                // `unclassified`. Treat the resolver's KEEP ids (the room about to be typed
                // `stair`) as the stair — so the just-decided stair room is never falsely
                // flagged habitable. Fall back to the committed occupancy/name for paths
                // that pass no keep set.
                const isStairRoom = (stairKeepRoomIds?.has(d.id) ?? false)
                    || STAIR_OCC.has(d.occupancyType) || /stair/i.test(d.name);
                if (!isStairRoom) habitableOnStair.push(`${d.name}[${d.occupancyType}]`);
            }
            console.log(`${logTag} §DIAG-EXEC-STAIR ${levelId} roomsOverStairVoid=${overlaps.length} (${overlaps.join(', ') || 'none'}) — expect exactly 1 = "Stair"`);
            if (habitableOnStair.length > 0) {
                console.warn(`${logTag} §DIAG-EXEC-STAIR ${levelId} ⚠ HABITABLE-ON-STAIR: ${habitableOnStair.join(', ')} (a non-stair room tiled into the stair keep-out — the void was not cut / detection flooded it)`);
            }
        }

        // ════════════════════════════════════════════════════════════════════
        // §VERBOSE-DIAG (founder 2026-06-11: "add a lot of logs!!!!!") — deep
        // per-storey instrumentation so a single console paste explains the layout.
        // All best-effort + guarded by the outer try/catch; logging only, no behaviour.
        // ════════════════════════════════════════════════════════════════════
        const wallLen = (w: WallRec): number => {
            const bl = w.baseLine; if (!bl || bl.length < 2) return 0;
            return Math.hypot(bl[1]!.x - bl[0]!.x, bl[1]!.z - bl[0]!.z);
        };

        // ── §DIAG-EXEC-WALLS — every wall: role (shell/partition), length, HEIGHT,
        //    thickness, opening count. Surfaces §PARTITION-TOP-AT-SLAB-UNDERSIDE
        //    (partition height should be < shell height on a non-top storey) + the
        //    recurring "EXTRA N walls" divergence. ──────────────────────────────────
        {
            const levelWalls = [...wallById.values()];
            let shellN = 0, partN = 0; const heights = new Set<string>();
            for (const w of levelWalls) {
                const isShell = isExteriorWall(w.id);
                isShell ? shellN++ : partN++;
                heights.add((typeof w.height === 'number' ? w.height.toFixed(3) : '?'));
            }
            console.log(`${logTag} §DIAG-EXEC-WALLS ${levelId} total=${levelWalls.length} shell=${shellN} partition=${partN} distinctHeights={${[...heights].join(',')}}m`);
            for (const w of levelWalls) {
                const role = isExteriorWall(w.id) ? 'shell' : 'partition';
                const ops = w.openings ?? [];
                const doors = ops.filter(o => o.type === 'door').length;
                const wins = ops.filter(o => o.type === 'window').length;
                console.log(`${logTag} §DIAG-EXEC-WALL ${levelId} ${w.id.slice(-6)} ${role} len=${wallLen(w).toFixed(2)}m h=${typeof w.height === 'number' ? w.height.toFixed(3) + 'm' : '?'} thk=${typeof w.thickness === 'number' ? (w.thickness * 1000).toFixed(0) + 'mm' : '?'} doors=${doors} windows=${wins}`);
            }
        }

        // ── §DIAG-EXEC-FILL — plate budget vs what got built, per room + total, so the
        //    "white / blank areas" question is answerable from the log. engineTarget is
        //    the design budget; detected is what room-detection found; Δ surfaces a
        //    stretch (detected ≫ target → a room ballooned into blank space) or a merge. ─
        {
            const detectedSum = detected.reduce((n, d) => n + d.areaM2, 0);
            const engineSum = plateM2;
            console.log(`${logTag} §DIAG-EXEC-FILL ${levelId} engineBudget=${engineSum.toFixed(1)}m² detectedSum=${detectedSum.toFixed(1)}m² Δ=${(detectedSum - engineSum).toFixed(1)}m² coverage=${(detectedSum / Math.max(engineSum, 0.01) * 100).toFixed(0)}% rooms=${M} (a big +Δ on one room = it stretched into blank plate; a count-mismatch above = a merge)`);
            for (const d of detected) {
                const eng = pairing.get(d.id);
                if (eng) {
                    const delta = d.areaM2 - eng.areaM2;
                    const flag = Math.abs(delta) > Math.max(3, eng.areaM2 * 0.4) ? (delta > 0 ? ' ⚠ STRETCHED' : ' ⚠ SHRUNK') : '';
                    console.log(`${logTag} §DIAG-EXEC-FILL-ROOM ${levelId} ${d.name}[${eng.type}] detected=${d.areaM2.toFixed(1)} target=${eng.areaM2.toFixed(1)} Δ=${delta >= 0 ? '+' : ''}${delta.toFixed(1)}m²${flag}`);
                }
            }
        }

        // ── §DIAG-EXEC-STAIR-SIZE (founder 2026-06-11: "the stair should occupy a smaller
        //    room … cornered … min 1.5 m circulation in front of the entrance") — the stair
        //    keep-out footprint vs the room that actually contains it. A room ≫ footprint
        //    means the stair sits in an oversized space (the founder's complaint). ────────
        if (stairRectsWorld && stairRectsWorld.length > 0) {
            stairRectsWorld.forEach((r, i) => {
                const w = r.maxX - r.minX, dep = r.maxZ - r.minZ, footprint = w * dep;
                // the detected room hosting the stair (keep-set, occupancy, or name).
                const host = detected.find(d => (stairKeepRoomIds?.has(d.id) ?? false)
                    || /stair/i.test(d.name) || d.occupancyType === 'stair');
                const hostArea = host?.areaM2 ?? 0;
                const ratio = footprint > 0 ? hostArea / footprint : 0;
                console.log(`${logTag} §DIAG-EXEC-STAIR-SIZE ${levelId} rect#${i} footprint=${w.toFixed(2)}×${dep.toFixed(2)}m=${footprint.toFixed(1)}m² hostRoom=${host?.name ?? '(none)'} hostArea=${hostArea.toFixed(1)}m² roomToFootprint=${ratio.toFixed(1)}×${ratio > 1.6 ? ' ⚠ OVERSIZED (stair should be cornered + a tight ~1.5m landing, not a large room)' : ''}`);
            });
        }

        // ── §DIAG-EXEC-ADJACENCY — for each room: which OTHER rooms it shares a wall with,
        //    and whether it touches CIRCULATION (corridor/hall/stair). Surfaces sealed /
        //    land-locked rooms (no circulation neighbour) at the DETECTED-geometry level. ──
        {
            const CIRC = new Set(['corridor', 'hall', 'stair', 'stairwell', 'landing']);
            const roomByWall = new Map<string, string[]>();
            for (const d of detected) for (const wid of d.boundingWallIds) {
                (roomByWall.get(wid) ?? roomByWall.set(wid, []).get(wid)!).push(d.id);
            }
            const nameById = new Map(detected.map(d => [d.id, d.name]));
            const typeById = new Map(detected.map(d => [d.id, (pairing.get(d.id)?.type ?? d.occupancyType)]));
            for (const d of detected) {
                const neigh = new Set<string>();
                for (const wid of d.boundingWallIds) for (const rid of roomByWall.get(wid) ?? []) if (rid !== d.id) neigh.add(rid);
                const neighNames = [...neigh].map(id => `${nameById.get(id)}[${typeById.get(id)}]`);
                const touchesCirc = [...neigh].some(id => CIRC.has(String(typeById.get(id) ?? '')));
                const self = pairing.get(d.id)?.type ?? d.occupancyType;
                const needsCirc = !CIRC.has(String(self));
                const circFlag = needsCirc ? (touchesCirc ? ' circ=✓' : ' circ=✗ ⚠ NOT-ON-CIRCULATION') : ' circ=n/a';
                console.log(`${logTag} §DIAG-EXEC-ADJ ${levelId} ${d.name}[${self}] neighbours=[${neighNames.join(', ') || 'none'}]${circFlag}`);
            }
        }

        // ── §DIAG-EXEC-OVERLAP (founder 2026-06-11: "some rooms overlap sometimes — this
        //    is not possible") — pairwise detected-room AABB overlap. A real room overlap is
        //    a hard geometry error; the AABB test is a cheap proxy (a true overlap always
        //    overlaps in AABB; an AABB overlap with no polygon overlap is a near-miss flagged
        //    as a watch). Logs the overlap area so the next paste pinpoints the colliding pair. ─
        {
            const bbox = (poly: ReadonlyArray<{ x: number; z: number }>) => {
                let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
                for (const p of poly) { x0 = Math.min(x0, p.x); z0 = Math.min(z0, p.z); x1 = Math.max(x1, p.x); z1 = Math.max(z1, p.z); }
                return { x0, z0, x1, z1, ok: poly.length >= 3 };
            };
            const boxes = detected.map(d => ({ d, b: bbox(d.polygon) }));
            let overlaps = 0;
            for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
                const a = boxes[i]!, c = boxes[j]!;
                if (!a.b.ok || !c.b.ok) continue;
                const ox = Math.min(a.b.x1, c.b.x1) - Math.max(a.b.x0, c.b.x0);
                const oz = Math.min(a.b.z1, c.b.z1) - Math.max(a.b.z0, c.b.z0);
                if (ox > 0.10 && oz > 0.10) {   // > 0.1 m both axes = a real shared region, not a touching edge
                    overlaps++;
                    console.warn(`${logTag} §DIAG-EXEC-OVERLAP ${levelId} ⚠ ${a.d.name} ∩ ${c.d.name} aabbOverlap=${(ox * oz).toFixed(1)}m² (${ox.toFixed(2)}×${oz.toFixed(2)}m) — rooms must NOT overlap`);
                }
            }
            console.log(`${logTag} §DIAG-EXEC-OVERLAP ${levelId} pairsChecked=${boxes.length * (boxes.length - 1) / 2} overlaps=${overlaps}${overlaps === 0 ? ' ✓' : ' ⚠'}`);
        }

        // ── §DIAG-EXEC-WIN-CLASH (founder 2026-06-11: "we cannot have multiple windows
        //    clashing — not possible") — per wall, windows whose [offset−w/2, offset+w/2]
        //    spans overlap. Needs opening offset+width (optional on WallRec); when absent,
        //    falls back to flagging ≥2 windows on a wall as a CLASH-RISK to investigate. ──────
        {
            let clashes = 0, riskWalls = 0;
            for (const w of wallById.values()) {
                const wins = (w.openings ?? []).filter(o => o.type === 'window');
                if (wins.length < 2) continue;
                const haveSpans = wins.every(o => typeof o.offset === 'number' && typeof o.width === 'number');
                if (haveSpans) {
                    const spans = wins.map(o => [o.offset! - o.width! / 2, o.offset! + o.width! / 2] as [number, number]).sort((p, q) => p[0] - q[0]);
                    for (let i = 1; i < spans.length; i++) {
                        if (spans[i]![0] < spans[i - 1]![1] - 0.001) {
                            clashes++;
                            console.warn(`${logTag} §DIAG-EXEC-WIN-CLASH ${levelId} ⚠ wall ${w.id.slice(-6)} windows OVERLAP (${spans[i - 1]![0].toFixed(2)}-${spans[i - 1]![1].toFixed(2)} ∩ ${spans[i]![0].toFixed(2)}-${spans[i]![1].toFixed(2)}m) — windows must not clash`);
                        }
                    }
                } else {
                    riskWalls++;
                    console.warn(`${logTag} §DIAG-EXEC-WIN-CLASH ${levelId} ⚠ wall ${w.id.slice(-6)} has ${wins.length} windows (no offset/width data) — CLASH-RISK, verify spacing`);
                }
            }
            console.log(`${logTag} §DIAG-EXEC-WIN-CLASH ${levelId} clashes=${clashes} riskWalls=${riskWalls}${clashes === 0 && riskWalls === 0 ? ' ✓' : ' ⚠'}`);
        }

        // ── §DIAG-EXEC-ENTRANCE (founder 2026-06-11: "the entrance hall — no matter what —
        //    needs to be connected with the perimeter wall and have the main door; this is not
        //    re-enforced") — the hall must (a) bound at least one EXTERIOR/shell wall and (b)
        //    have a door on a shell wall (the main entrance). Flags a hall that is interior. ──
        {
            const halls = detected.filter(d => {
                const t = pairing.get(d.id)?.type ?? d.occupancyType;
                return t === 'hall' || /entrance|hall|lobby/i.test(String(t)) || /entrance hall/i.test(d.name);
            });
            if (halls.length === 0) {
                console.log(`${logTag} §DIAG-EXEC-ENTRANCE ${levelId} — no entrance hall on this level (expected on GROUND only)`);
            }
            for (const h of halls) {
                let onPerimeter = false, hasShellDoor = false, shellWalls2 = 0;
                for (const wid of h.boundingWallIds) {
                    if (!isExteriorWall(wid)) continue;
                    onPerimeter = true; shellWalls2++;
                    const w = wallById.get(wid);
                    if ((w?.openings ?? []).some(o => o.type === 'door')) hasShellDoor = true;
                }
                const verdict = onPerimeter && hasShellDoor ? '✓'
                    : !onPerimeter ? '⚠ NOT-ON-PERIMETER (hall is interior — must bound a shell wall)'
                    : '⚠ NO-MAIN-DOOR (hall fronts the perimeter but has no door on a shell wall)';
                console.log(`${logTag} §DIAG-EXEC-ENTRANCE ${levelId} ${h.name} perimeter=${onPerimeter} shellWalls=${shellWalls2} mainDoor=${hasShellDoor} ${verdict}`);
            }
        }

        // ── ROLLUP ───────────────────────────────────────────────────────────
        console.log(
            `${logTag} §DIAG-EXEC-ROLLUP ${levelId} roomsWithDoor=${roomsWithDoor}/${M} ` +
            `windowless=${windowlessCount} overCap=${overCapCount} noEngineMatch=${noEngineMatchCount} ` +
            `(plate≈${plateM2.toFixed(1)}m²)`,
        );
    } catch (e) {
        console.warn(`${logTag} §DIAG-EXEC-* failed (non-fatal):`, e);
    }
}
