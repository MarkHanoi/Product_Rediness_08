// §MURCIA-ENVELOPE-MAX · STEP 10 — THE FICHA HARVEST (n >= 100, seeded, per-municipality)
//
// ⛔ THE CHANNEL IS DEFENDED. urbmurcia.carm.es sits behind a Radware Bot Manager WAF that
//    serves a CAPTCHA interstitial with HTTP 200. That is the canonical "HTTP 200 IS NOT
//    SUCCESS" trap, and it is detected explicitly on every response — a CAPTCHA is NEVER
//    counted as a ficha, and never as an absent parameter.
//
// Politeness is therefore not decoration: it is the only way this completes. One request at
// a time, long gaps, exponential back-off on a block, full resume from disk cache.
//
// SAMPLE DESIGN: stratified — up to N_PER municipality from BUILDABLE-NOW ámbitos, drawn
// with a seeded PRNG so the draw is reproducible. Per-municipality, never a mean.

import { wfsJson, politeFetch, writeOut, mulberry32, sleep, HERE } from './lib.mjs';
import { classify } from './detect.mjs';
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const SEED = 20260802;
const N_PER = Number(process.env.N_PER || 4);
const REFRESH = process.argv.includes('--refresh');
const O = { refresh: REFRESH };

const RAW = join(HERE, 'raw-fichas');
mkdirSync(RAW, { recursive: true });
const STATE = join(HERE, 'out', '10-harvest-state.json');
const state = existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : { done: {}, blocked: [] };

const BUILDABLE_NOW = new Set([
  'Suelo Urbano', 'Suelo Urbano Consolidado', 'Suelo Urbano Sin Consolidar', 'Suelo Urbano Especial',
  'Suelo Urbanizable Sectorizado', 'Suelo Urbanizable Sectorizado Especial',
  'Suelo Urbanizable Programado', 'Suelo Apto para Urbanizar', 'Suelo Urbanizable',
]);

const wideOf = (u) => { const m = /[?&]wide=(\d+)/.exec(u || ''); return m ? m[1] : null; };
const live = (w) => `http://urbmurcia.carm.es/urbmurcia/sitmurcia/potgisfichacen.jsp?wide=${w}&widi=es&x=0&y=0`;
const BROWSER = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
  'Upgrade-Insecure-Requests': '1',
};

// ── 10a · build the seeded, stratified sample ───────────────────────────────
console.log('\n== 10a · seeded stratified sample ==');
const pool = [];
for (const layer of ['SIT_USU_PLA_URB_CARM:plu_clasific_tipos_urbano', 'SIT_USU_PLA_URB_CARM:plu_clasific_tipos_urbanizable']) {
  const j = await wfsJson(layer, { propertyName: 'Municipio,Ambito,Clasificacion,Uso_global,Uso_especifico,Edificabilidad,Area_m2,Enlace_ficha', count: 200000 }, O);
  for (const f of j.features) {
    const p = f.properties;
    if (!BUILDABLE_NOW.has(p.Clasificacion)) continue;
    const w = wideOf(p.Enlace_ficha);
    if (!w) continue;
    pool.push({ ...p, wide: w, layer });
  }
}
console.log(`  buildable-now ámbitos with a ficha link: ${pool.length}`);

const byMuni = new Map();
for (const r of pool) {
  if (!byMuni.has(r.Municipio)) byMuni.set(r.Municipio, []);
  byMuni.get(r.Municipio).push(r);
}
const rnd = mulberry32(SEED);
const sample = [];
for (const [_muni, list] of [...byMuni.entries()].sort()) {
  // de-duplicate by wide: one ámbito can back many polygons
  const uniq = [...new Map(list.map((r) => [r.wide, r])).values()];
  const shuffled = uniq.map((r) => ({ r, k: rnd() })).sort((a, b) => a.k - b.k).map((x) => x.r);
  sample.push(...shuffled.slice(0, N_PER));
}
console.log(`  sample n = ${sample.length} across ${byMuni.size} municipalities (${N_PER} per municipality, seed ${SEED})`);
if (sample.length < 100) throw new Error(`SAMPLE TOO SMALL: ${sample.length} < 100 — raise N_PER`);

// ── 10b · harvest, WAF-aware ────────────────────────────────────────────────
console.log('\n== 10b · harvest (slow, WAF-aware, resumable) ==');
let gap = 9000;
let consecutiveBlocks = 0;
let fetched = 0, blocked = 0, cached = 0;

for (let i = 0; i < sample.length; i++) {
  const t = sample[i];
  const file = join(RAW, `ficha-${t.wide}.html`);
  if (existsSync(file) && !REFRESH) { cached++; state.done[t.wide] = true; continue; }

  let ok = false;
  for (let attempt = 0; attempt < 3 && !ok; attempt++) {
    let r;
    try {
      r = await politeFetch(live(t.wide), { refresh: true, tag: 'harvest', headers: BROWSER, timeout: 120_000 });
    } catch (e) {
      console.log(`  wide=${t.wide} TRANSPORT ${String(e.message).slice(0, 90)}`);
      await sleep(20000);
      continue;
    }
    const body = r.buf.toString('utf8');
    // ⛔ HTTP 200 IS NOT SUCCESS — and the naive inverse is also wrong. The WAF injects
    //    its sensor into SUCCESSFUL pages too, so we classify POSITIVELY on the document.
    //    See detect.mjs.
    const kind = classify(body);
    const captcha = kind === 'captcha';
    const isFicha = kind === 'ficha';
    if (!isFicha) {
      consecutiveBlocks++;
      blocked++;
      gap = Math.min(gap * 1.7, 180000);
      console.log(`  wide=${t.wide} ⛔ ${captcha ? 'CAPTCHA' : 'not-a-ficha (' + r.buf.length + 'B)'} — backing off ${Math.round(gap / 1000)}s (streak ${consecutiveBlocks})`);
      await sleep(gap);
      if (consecutiveBlocks >= 12) {
        console.log('\n  ⛔ 12 consecutive blocks — the WAF is holding. Stopping HONESTLY rather than');
        console.log('     emitting a partial denominator as if it were the population.');
        i = sample.length;
        break;
      }
      continue;
    }
    writeFileSync(file, r.buf);
    state.done[t.wide] = true;
    fetched++; ok = true; consecutiveBlocks = 0;
    gap = Math.max(9000, gap * 0.85);
    if (fetched % 5 === 0 || fetched < 4)
      console.log(`  [${i + 1}/${sample.length}] ${t.Municipio.slice(0, 20).padEnd(21)} wide=${String(t.wide).padEnd(7)} ${String(r.buf.length).padStart(7)}B  ok (fetched ${fetched}, blocked ${blocked})`);
    await sleep(gap + Math.floor(rnd() * 4000));
  }
  writeFileSync(STATE, JSON.stringify(state, null, 2));
}

console.log(`\n  harvest: fetched ${fetched}, from cache ${cached}, blocked ${blocked}`);
writeOut('10-ficha-harvest.json', {
  step: 10,
  measuredAt: new Date().toISOString(),
  seed: SEED,
  nPerMunicipality: N_PER,
  poolSize: pool.length,
  sampleSize: sample.length,
  municipalities: byMuni.size,
  fetched, cached, blocked,
  sample: sample.map((s) => ({ municipio: s.Municipio, ambito: s.Ambito, clasificacion: s.Clasificacion, edificabilidad: s.Edificabilidad, wide: s.wide })),
});
console.log('\nSTEP 10 done.');
