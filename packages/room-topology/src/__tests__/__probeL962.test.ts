// L-962 PROBE — NOT A GATE. Measures the ring density the ROOM emits for a curved
// shell, and the ring density the SLAB region tracer emits for the SAME walls.
//
// The founder's number: `[FloorTool] Floor created: … with 20 vertices` in a 19-wall
// room. This probe asks whether the under-tessellation is introduced by the FLOOR tool
// or is already present in `room.boundary.polygon`.

import { describe, it, expect } from 'vitest';
import { appendFileSync } from 'node:fs';
const OUT = 'C:/ClaudeWorktrees/probeL962.txt';
import { RoomDetectionEngine } from '../RoomDetectionEngine';
import { traceRegionSketchAtPoint, wallsToSegments } from '../../../geometry-slab/src/SlabRegionTracer';

type P = { x: number; z: number };

const T = 0.2;
const SEGS = 16;

/** A W×D shell with `r` rounded corners: 4 straight walls + 4 quadratic-Bezier arcs. */
function roundedShell(W: number, D: number, r: number, segs: number = SEGS) {
    const straights: Array<[P, P]> = [
        [{ x: r, z: 0 }, { x: W - r, z: 0 }],
        [{ x: W, z: r }, { x: W, z: D - r }],
        [{ x: W - r, z: D }, { x: r, z: D }],
        [{ x: 0, z: D - r }, { x: 0, z: r }],
    ];
    const arcs: Array<{ s: P; c: P; e: P }> = [
        { s: { x: W - r, z: 0 }, c: { x: W, z: 0 }, e: { x: W, z: r } },
        { s: { x: W, z: D - r }, c: { x: W, z: D }, e: { x: W - r, z: D } },
        { s: { x: r, z: D }, c: { x: 0, z: D }, e: { x: 0, z: D - r } },
        { s: { x: 0, z: r }, c: { x: 0, z: 0 }, e: { x: r, z: 0 } },
    ];
    const walls: any[] = [];
    straights.forEach(([a, b], i) => walls.push({
        id: `s${i}`, levelId: 'L0', thickness: T, height: 3,
        baseLine: [{ x: a.x, y: 0, z: a.z }, { x: b.x, y: 0, z: b.z }],
    }));
    arcs.forEach((a, i) => walls.push({
        id: `a${i}`, levelId: 'L0', thickness: T, height: 3,
        baseLine: [{ x: a.s.x, y: 0, z: a.s.z }, { x: a.e.x, y: 0, z: a.e.z }],
        curve: { control: { x: a.c.x, y: 0, z: a.c.z }, segments: segs },
    }));
    return walls;
}

function fakeStore(walls: any[]) {
    return {
        getByLevel: () => walls,
        getAll: () => walls,
        get: (id: string) => walls.find(w => w.id === id),
    } as any;
}

function arcChordLen(W: number, D: number, r: number): number {
    // quarter-arc length approx (quadratic Bezier through the sharp corner) / SEGS
    return (Math.PI * r / 2) / SEGS;
}

describe('L-962 PROBE — room ring vs slab region ring on the same curved walls', () => {
    for (const [label, W, D, r, segsOverride] of [
        ['big gentle arcs (r=6 → chord ~589mm)', 24, 16, 6],
        ['founder scale (r=2 → chord ~196mm)', 12, 8, 2],
        ['many tight curves (r=1 → chord ~98mm)', 12, 8, 1],
        ['BRACKET r=6 @ 27 segs (chord ~349mm, ABOVE 300)', 24, 16, 6, 27],
        ['BRACKET r=6 @ 38 segs (chord ~248mm, BELOW 300)', 24, 16, 6, 38],
        ['DISCRIMINATOR r=6 @ 64 segs (chord ~147mm)', 24, 16, 6, 64],
    ] as Array<[string, number, number, number, number?]>) {
        it(`${label}`, () => {
            const segsForArm = segsOverride ?? SEGS;
            const walls = roundedShell(W, D, r, segsForArm);
            const chord = (Math.PI * r / 2) / segsForArm;

            // ── ROOM path ────────────────────────────────────────────────────
            const engine = new RoomDetectionEngine(fakeStore(walls));
            const rooms = engine.detectRoomsForLevel('L0', 0, 3);
            const roomVerts = rooms[0]?.boundary?.polygon?.length ?? -1;

            // ── SLAB path ────────────────────────────────────────────────────
            const regionWalls = walls.map(w => ({
                id: w.id,
                baseLine: [{ x: w.baseLine[0].x, z: w.baseLine[0].z }, { x: w.baseLine[1].x, z: w.baseLine[1].z }],
                curve: w.curve ? { control: { x: w.curve.control.x, z: w.curve.control.z }, segments: w.curve.segments } : undefined,
                thickness: w.thickness,
            }));
            const segs = wallsToSegments(regionWalls as any).length;
            const traced = traceRegionSketchAtPoint(regionWalls as any, W / 2, D / 2);
            const slabVerts = (traced as any)?.ring?.length ?? -1;

            const shoelace = (p: ReadonlyArray<{x:number;z:number}>) => {
                let a = 0; for (let i=0;i<p.length;i++){const u=p[i]!,v=p[(i+1)%p.length]!;a+=u.x*v.z-v.x*u.z;} return Math.abs(a)/2;
            };
            const roomArea = rooms[0]?.boundary?.polygon ? shoelace(rooms[0].boundary.polygon as any) : -1;
            const slabArea = traced?.ring ? shoelace((traced.ring as any).map((p:any)=>({x:p.x,z:p.y}))) : -1;
            appendFileSync(OUT,
                `[L962-PROBE] ${label}\n`
                + `    arc chord      = ${(chord * 1000).toFixed(0)} mm  (corner-snap threshold = 300 mm)\n`
                + `    walls          = ${walls.length}  (4 straight + 4 curved @ ${segsForArm} segs)\n`
                + `    ROOM ring      = ${roomVerts} vertices   ← what FloorTool AUTO reads\n`
                + `    SLAB segments  = ${segs} chords\n`
                + `    SLAB ring      = ${slabVerts} points
`
                + `    ROOM area      = ${roomArea.toFixed(3)} m2   vs SLAB area = ${slabArea.toFixed(3)} m2   (err ${(roomArea-slabArea).toFixed(3)} m2)

`,
            );
            expect(roomVerts).toBeGreaterThan(0);
        });
    }
});
