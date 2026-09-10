// TEMP probe (lane C9) — is the reproducible "fetch failed" about the OFFSET, the ARCHIVE, or CONCURRENCY?
const U = 'https://pub-1ad4f6c5dec849b5b25a45586898fd4d.r2.dev/tiles/roads.pmtiles?v=L663a';
async function get(off: number, len: number, tag: string) {
    const t = Date.now();
    try {
        const r = await fetch(`${U}&r=${off}-${len}`, { headers: { range: `bytes=${off}-${off + len - 1}` } });
        const b = await r.arrayBuffer();
        return `${tag} ok ${r.status} ${b.byteLength}B ${Date.now() - t}ms`;
    } catch (e) { return `${tag} FAIL ${Date.now() - t}ms ${(e as Error).message} / ${(e as any).cause?.message ?? ''}`; }
}
console.log('--- serial, the exact offsets that failed ---');
for (const o of [20135706423, 20135700953, 20135232314, 20135617841]) console.log(await get(o, 20082, `@${o}`));
console.log('--- 12 concurrent, spread through the archive ---');
const offs = Array.from({ length: 12 }, (_, i) => 20135000000 + i * 65536);
console.log((await Promise.all(offs.map((o, i) => get(o, 20082, `#${i}`)))).join('\n'));
console.log('--- 24 concurrent ---');
const offs2 = Array.from({ length: 24 }, (_, i) => 20135000000 + i * 40000);
console.log((await Promise.all(offs2.map((o, i) => get(o, 20082, `#${i}`)))).join('\n'));
