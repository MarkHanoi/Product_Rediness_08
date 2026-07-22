// L-586 PROBE 8 — the 5 rings that MOVED without having been self-intersecting.
//
// WHY THEY MOVED. At HEAD the exact pass refused these (multi-loop) and the T-junction split
// produced the shipped ring. §DISSOLVE-INTERIOR-VOID now lets the EXACT pass succeed on them, and
// the module's standing rule is that the exact result wins — so the ring is now the exact outline
// rather than a split-repaired one. The split deviates from the straight input boundary by up to
// 0.1 m by construction; the void extraction deviates by nothing at all.
//
// That reasoning must not be taken on trust — L-539's whole warning is about silently moving
// compliance numbers. So: judge both rings against the INDEPENDENT oracle (published cadastral
// parcel areas, void-corrected) and report which is closer, per named manzana.
//
// Run: npx tsx scratchpad/probe-l586-moved5.mts

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { dissolveParcelsToBlockRing as HEAD } from './baseline/blockRingBaseline.js';
import { dissolveParcelsToBlockRing as NOW } from '../packages/site-parcel-data/src/geometry/blockRing.js';
import type { Pt } from '@pryzm/schemas';

const ROOT = resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
interface M { city: string; manzana: string; parcels: Array<{ refcat: string; ring: Array<{ lat: number; lon: number }>; areaM2: number }> }
const raw = JSON.parse(readFileSync(resolve(ROOT, 'scratchpad/dissolve-sample.json'), 'utf8')) as { manzanas: M[] };
const R = 6_378_137, D = Math.PI / 180;
const A = (r: ReadonlyArray<Pt>) => { let s = 0; for (let i = 0; i < r.length; i++) { const p = r[i]!, q = r[(i + 1) % r.length]!; s += p.x * q.z - q.x * p.z; } return Math.abs(s / 2); };

const TARGETS = ['Barcelona/07174', 'Cordoba/39412', 'Cordoba/42494', 'Sevilla/48202', 'Valencia/53279', 'Valencia/55296'];

console.log('| manzana | HEAD path | HEAD verts | HEAD split maxOff | NOW path | NOW verts | voids | published m² | HEAD net err | NOW net err | closer |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|');
for (const m of raw.manzanas) {
    const id = `${m.city}/${m.manzana}`;
    if (!TARGETS.includes(id)) continue;
    const lat0 = m.parcels[0]!.ring[0]!.lat, lon0 = m.parcels[0]!.ring[0]!.lon, c = Math.cos(lat0 * D);
    const rings = m.parcels.map((p) => p.ring.map((v) => ({ x: (v.lon - lon0) * D * R * c, z: -((v.lat - lat0) * D * R) })));
    const a = HEAD(rings), b = NOW(rings);
    const pub = m.parcels.reduce((s, p) => s + p.areaM2, 0);
    // HEAD had no void concept, so its ring is compared to the published sum directly; NOW's
    // outline is compared void-corrected. Both are "the land the parcels cover" vs "what Catastro
    // says they cover" — the same quantity, measured the same way.
    const errA = ((A(a.ring) - pub) / pub) * 100;
    const vArea = b.voids.reduce((s, v) => s + A(v), 0);
    const errB = ((A(b.ring) - vArea - pub) / pub) * 100;
    console.log(
        `| ${id} | ${a.quality.path} | ${a.ring.length} | ${a.quality.maxOffset_m.toFixed(4)} m | ${b.quality.path} | ${b.ring.length} | ${b.voids.length} | ${pub.toFixed(0)} | ${errA.toFixed(4)}% | ${errB.toFixed(4)}% | ${Math.abs(errB) <= Math.abs(errA) ? 'NOW' : 'HEAD'} |`,
    );
}
