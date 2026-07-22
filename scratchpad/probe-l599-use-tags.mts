// L-599 — DO WE ACTUALLY KNOW WHAT THE CONTEXT BUILDINGS ARE USED FOR?
//
// The founder asked to colour buildings/parcels by USE. Before designing a legend, measure whether
// the use is KNOWN or GUESSED. This is the same question that produced L-582's answer for heights
// (0.9% surveyed, 19.8% fabricated) — and colouring a guess is worse than colouring nothing,
// because a colour reads as a fact.
import { readContextTileFeatures, __setContextTilesBaseUrl } from '../apps/editor/src/ui/geospatial/contextTiles.js';

__setContextTilesBaseUrl('https://pryzm.fly.dev/api/context-tiles/');
const BBOX = [2.150, 41.380, 2.190, 41.405] as const;   // central Eixample + Gracia edge
const res = await readContextTileFeatures('buildings', BBOX as any);
if (res.status !== 'ok') { console.log('reader status:', res.status, (res as any).reason ?? ''); process.exit(1); }

const n = res.features.length;
const val = new Map<string, number>();
let withUseTag = 0;
for (const f of res.features) {
    const t = f.tags;
    // The tags that actually say what a building IS, in OSM's own priority order.
    const use = t['building'] && t['building'] !== 'yes' ? `building=${t['building']}`
        : t['amenity'] ? `amenity=${t['amenity']}`
        : t['shop'] ? 'shop=*'
        : t['office'] ? 'office=*'
        : t['tourism'] ? `tourism=${t['tourism']}`
        : t['landuse'] ? `landuse=${t['landuse']}`
        : null;
    if (use) { withUseTag++; val.set(use, (val.get(use) ?? 0) + 1); }
}
console.log(`context buildings in bbox: ${n}`);
console.log(`carrying a MEANINGFUL use tag: ${withUseTag} = ${(withUseTag/n*100).toFixed(1)}%`);
console.log(`bare building=yes / no use   : ${n-withUseTag} = ${((n-withUseTag)/n*100).toFixed(1)}%\n`);
console.log('top use values:');
for (const [k,v] of [...val.entries()].sort((a,b)=>b[1]-a[1]).slice(0,12)) {
    console.log(`   ${k.padEnd(28)} ${String(v).padStart(5)}  ${(v/n*100).toFixed(1)}%`);
}
console.log('\n=> If the "no use" share is large, a use legend would colour mostly UNKNOWN,');
console.log('   and any scheme that hides that is the L-582 fabrication pattern in colour form.');
