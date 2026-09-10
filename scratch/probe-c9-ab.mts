// TEMP probe (lane C9) — A/B the TRANSPORT SHAPE on the exact ranges the shipped reader asked for.
import { coalesceRanges } from '../apps/editor/src/ui/geospatial/contextTiles';
const U = 'https://pub-1ad4f6c5dec849b5b25a45586898fd4d.r2.dev/tiles/roads.pmtiles?v=L663a';
// The 16 tile-data ranges the shipped reader issued for Barcelona roads @0.016 (probe-c9-order).
const R = [
    [20135706423, 5792], [20135374346, 206691], [20136055910, 23456], [20135581037, 9667],
    [20135252396, 29342], [20135617841, 61107], [20135232314, 20082], [20135225144, 7170],
    [20135631210, 13168], [20134735562, 3021], [20134584645, 52520], [20134644937, 15399],
    [20134738583, 10740], [20135220573, 4571], [20134559222, 85715], [20135560118, 146305],
].map(([o, l]) => ({ offset: o!, length: l! }));
// The wave structure the shipped reader actually produced (grouped by observed start time).
const WAVES = [[0, 1, 2], [3], [4], [5, 6, 8], [7, 10, 13, 15], [9, 11, 12, 14]];
async function get(o: number, l: number) {
    const r = await fetch(`${U}&r=${o}-${l}`, { headers: { range: `bytes=${o}-${o + l - 1}` } });
    return (await r.arrayBuffer()).byteLength;
}
async function timed(name: string, run: () => Promise<number>) {
    const t = Date.now(); const bytes = await run();
    console.log(`${name.padEnd(46)} ${String(Date.now() - t).padStart(6)} ms  ${(bytes / 1024).toFixed(0).padStart(6)} KiB`);
}
const span1 = coalesceRanges(R);
const lo = Math.min(...R.map((x) => x.offset)), hi = Math.max(...R.map((x) => x.offset + x.length));
const span512 = coalesceRanges(R, 512 * 1024);
for (let pass = 1; pass <= 2; pass++) {
    console.log(`--- pass ${pass} ---`);
    await timed('A  SHIPPED: 16 ranges in 6 observed waves', async () => {
        let b = 0;
        for (const w of WAVES) b += (await Promise.all(w.map((i) => get(R[i]!.offset, R[i]!.length)))).reduce((x, y) => x + y, 0);
        return b;
    });
    await timed(`B  ONE WINDOW, gap 64K: ${span1.length} spans parallel`, async () =>
        (await Promise.all(span1.map((s) => get(s.offset, s.length)))).reduce((x, y) => x + y, 0));
    await timed(`C  ONE WINDOW, gap 512K: ${span512.length} spans parallel`, async () =>
        (await Promise.all(span512.map((s) => get(s.offset, s.length)))).reduce((x, y) => x + y, 0));
    await timed(`D  ONE REQUEST for the whole extent (${((hi - lo) / 1024).toFixed(0)} KiB)`, async () => get(lo, hi - lo));
}
