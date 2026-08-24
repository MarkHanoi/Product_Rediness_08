// §FINISH-HOST-CONSOLE — `window.pryzmFinishHosts()`: WHICH WALLS IS THIS FINISH WATCHING?
//
// THE FOUNDER ASKED FOR THIS BY NAME (2026-08-24): "please if needed add more logs to
// check after on console" — after three separate reports that each reduced to one
// unanswerable question: **which walls does this floor actually follow?**
//
// ⭐ WHY THIS INSTRUMENT AND NOT MORE LOGGING
// -------------------------------------------
// A floor finish follows a moved wall through ONE mechanism:
// `FinishHostDependencyTracker` indexes `sketch.outerLoop.edges` and keeps only the
// edges whose `type === 'hostReference'`. An edge that failed to attribute at authoring
// time is a `freeLine`, and a `freeLine` is INVISIBLE to the follow — permanently, and
// silently. Nothing in the running product ever showed that distinction, so "the floor
// didn't adapt" and "the floor is not bound to that wall" looked identical from outside.
//
// The attribution counts ARE computed — `formatFinishBoundaryAttributionReport` — but
// only at CREATE time and only behind `__pryzmFloorDiag`. By the time anyone notices a
// finish is not following, that line is long gone from the console. This reads the LIVE
// stored records on demand, which is the moment the question is actually asked.
//
// ⭐ THE THREE READINGS THIS MUST KEEP APART (C78 §1.4 / §NO-EMPTY-MEANS-UNKNOWN)
// -------------------------------------------------------------------------------
//   NO SKETCH        — the relationship was never recorded. The finish cannot follow
//                      ANY wall. (Three create paths mint no sketch; see C89 §FF-4.)
//   SKETCH, 0 HOSTS  — a sketch exists and every edge attributed to nothing. The room
//                      declared no usable bounding walls, or every candidate was refused.
//   SKETCH, N HOSTS  — it follows those N walls, and ONLY those N.
// Collapsing any two of these is the failure-as-emptiness defect this estate keeps
// re-measuring, and it is exactly what made the founder's reports unresolvable.
//
// ⛔ READ-ONLY. This instrument never repairs, re-derives or writes. A console command
// that silently fixed what it measured would destroy the evidence it exists to show.

interface HostRefEdge { type: 'hostReference'; hostId?: string }
type SketchEdge = HostRefEdge | { type?: string; hostId?: string };

interface FinishLike {
    id: string;
    levelId?: string;
    label?: string;
    hostRoomId?: string;
    boundingWallIds?: string[];
    boundary?: { polygon?: Array<{ x: number; z: number }> };
    sketch?: { outerLoop?: { edges?: SketchEdge[] } };
}

interface StoreLike<T> { getAll?: () => T[] }

/** Shoelace area of the stored ring — the number that reaches a schedule. */
function ringArea(poly: Array<{ x: number; z: number }> | undefined): number {
    if (!poly || poly.length < 3) return 0;
    let a = 0;
    for (let i = 0; i < poly.length; i++) {
        const p = poly[i]!, q = poly[(i + 1) % poly.length]!;
        a += p.x * q.z - q.x * p.z;
    }
    return Math.abs(a / 2);
}

interface Row {
    id: string;
    kind: string;
    label: string;
    area: number;
    verts: number;
    /** null = NO SKETCH (never recorded). Deliberately distinct from an empty list. */
    hosts: string[] | null;
    hostEdges: number;
    freeEdges: number;
    hostRoomId: string | undefined;
    /** `boundingWallIds` as STORED — often disagrees with the sketch; see C89 §FF-4. */
    storedBoundingWallIds: number;
}

function inspect(kind: string, store: StoreLike<FinishLike> | undefined, levelId?: string): Row[] {
    const all = store?.getAll?.() ?? [];
    const rows: Row[] = [];
    for (const rec of all) {
        if (levelId && rec.levelId && rec.levelId !== levelId) continue;
        const edges = rec.sketch?.outerLoop?.edges;
        let hosts: string[] | null = null;
        let hostEdges = 0, freeEdges = 0;
        if (rec.sketch && Array.isArray(edges)) {
            const set = new Set<string>();
            for (const e of edges) {
                if (e && (e as HostRefEdge).type === 'hostReference') {
                    hostEdges++;
                    const hid = (e as HostRefEdge).hostId;
                    if (hid) set.add(hid);
                } else {
                    freeEdges++;
                }
            }
            hosts = [...set];
        }
        rows.push({
            id: rec.id,
            kind,
            label: rec.label ?? '—',
            area: ringArea(rec.boundary?.polygon),
            verts: rec.boundary?.polygon?.length ?? 0,
            hosts,
            hostEdges,
            freeEdges,
            hostRoomId: rec.hostRoomId,
            storedBoundingWallIds: rec.boundingWallIds?.length ?? 0,
        });
    }
    return rows;
}

function report(levelId?: string): void {
    const w = globalThis as unknown as Record<string, StoreLike<FinishLike> | undefined>;
    const rows = [
        ...inspect('floor', w['floorStore'], levelId),
        ...inspect('ceiling', w['ceilingStore'], levelId),
    ];

    if (rows.length === 0) {
        console.log('[pryzmFinishHosts] No floor or ceiling finishes found'
            + (levelId ? ` on level "${levelId}"` : '') + '.');
        return;
    }

    console.log('%c§FINISH-HOST-CONSOLE — which walls each finish FOLLOWS', 'font-weight:bold');
    console.table(rows.map(r => ({
        kind: r.kind,
        id: r.id.slice(0, 8),
        label: r.label,
        'area m2': r.area.toFixed(3),
        verts: r.verts,
        // ⭐ the three readings, never collapsed into one
        FOLLOWS: r.hosts === null
            ? 'NO SKETCH'
            : r.hosts.length === 0 ? '0 walls' : `${r.hosts.length} wall(s)`,
        'edges host/free': `${r.hostEdges}/${r.freeEdges}`,
        hostRoomId: r.hostRoomId ? r.hostRoomId.slice(0, 8) : '—',
        'stored boundingWallIds': r.storedBoundingWallIds,
    })));

    // The wall ids IN FULL — a truncated id cannot be cross-referenced against a wall log,
    // which is the whole point of running this.
    for (const r of rows) {
        if (r.hosts === null) {
            console.warn(
                `[pryzmFinishHosts] ⛔ ${r.kind} "${r.id}" has NO SKETCH — the relationship was NEVER RECORDED, `
                + `so it cannot follow ANY wall. This is not "no walls nearby": it is a create path that minted `
                + `no host references (C89 §FF-4). Re-opening the project rebuilds it through CreateFloorCommand, `
                + `which DOES mint one.`,
            );
        } else if (r.hosts.length === 0) {
            console.warn(
                `[pryzmFinishHosts] ⛔ ${r.kind} "${r.id}" has a sketch but ZERO attributed walls `
                + `(${r.freeEdges} free edge(s)). Every edge failed to attribute — the room declared no usable `
                + `bounding walls, or every candidate was refused. It will not follow anything.`,
            );
        } else {
            console.log(
                `[pryzmFinishHosts] ✅ ${r.kind} "${r.id}" follows ${r.hosts.length} wall(s): ${r.hosts.join(', ')}`
                + (r.freeEdges > 0
                    ? `\n    ⚠ ${r.freeEdges} of its ${r.hostEdges + r.freeEdges} edges are FREE LINES and follow `
                      + `NOTHING. Moving a wall along such an edge will NOT move this finish — that edge stays put `
                      + `while its neighbours move, which is what "taking shortcuts / not fitting" looks like.`
                    : ''),
            );
        }
    }

    const noSketch = rows.filter(r => r.hosts === null).length;
    const zeroHost = rows.filter(r => r.hosts !== null && r.hosts.length === 0).length;
    const partial = rows.filter(r => r.hosts !== null && r.hosts.length > 0 && r.freeEdges > 0).length;
    console.log(
        `[pryzmFinishHosts] ${rows.length} finish(es): ${noSketch} with NO SKETCH, `
        + `${zeroHost} with a sketch but no attributed wall, ${partial} PARTIALLY attributed `
        + `(some edges follow, some do not), ${rows.length - noSketch - zeroHost - partial} fully attributed.`,
    );
}

/** Which finishes name this wall as a host — the inverse question, asked just as often. */
function forWall(wallId: string): void {
    const w = globalThis as unknown as Record<string, StoreLike<FinishLike> | undefined>;
    const rows = [...inspect('floor', w['floorStore']), ...inspect('ceiling', w['ceilingStore'])];
    const hits = rows.filter(r => r.hosts?.includes(wallId));
    if (hits.length === 0) {
        console.warn(
            `[pryzmFinishHosts] ⛔ NO finish follows wall "${wallId}". Moving it will change no floor or ceiling `
            + `boundary. If you expected one to follow, run window.pryzmFinishHosts() and check whether that finish `
            + `has a sketch at all, and whether the edge along this wall is a FREE LINE.`,
        );
        return;
    }
    console.log(`[pryzmFinishHosts] ${hits.length} finish(es) follow wall "${wallId}":`);
    for (const h of hits) {
        console.log(`    ${h.kind} "${h.id}" — ${h.area.toFixed(3)} m2, ${h.hostEdges} host edge(s), ${h.freeEdges} free`);
    }
}

export function installFinishHostConsole(): void {
    const g = globalThis as unknown as Record<string, unknown>;
    g['pryzmFinishHosts'] = Object.assign(report, { forWall, report });
    console.log(
        '[pryzmFinishHosts] ready — window.pryzmFinishHosts() lists every finish and the walls it follows; '
        + 'window.pryzmFinishHosts.forWall("wall_…") asks the inverse.',
    );
}
