// PROBE C — seeded, stratified municipality draw.
// Frame: Wikidata SPARQL export of Spanish municipalities (INE code P772 + population P1082).
// SIU-INDEPENDENT by construction — the frame never touches mapas.fomento.gob.es.
// Re-run: node draw-c.mjs   (deterministic; SEED below)
import fs from 'node:fs';
import path from 'node:path';

const DIR = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const SEED = 20260802;

// mulberry32 — deterministic PRNG
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- load frame ---
const raw = fs.readFileSync(path.join(DIR, '_wd_munis.csv'), 'utf8').split(/\r?\n/).filter(Boolean).slice(1);
const m = new Map();
for (const l of raw) {
  const parts = l.match(/("[^"]*"|[^,]*)/g).filter((s, i) => i % 2 === 0);
  const code = (parts[0] || '').replace(/"/g, '').trim();
  if (!/^\d{5}$/.test(code)) continue;
  const name = (parts[1] || '').replace(/^"|"$/g, '');
  const pop = parts[2] && parts[2].trim() ? parseFloat(parts[2]) : null;
  const prev = m.get(code);
  if (!prev || (prev.pop == null && pop != null)) m.set(code, { ine: code, name, pop });
}

// --- exclusions ---
// País Vasco: Álava 01, Gipuzkoa 20, Bizkaia 48.  Navarra: 31.  (foral cadastres — separate adapter)
const FORAL = new Set(['01', '20', '48', '31']);
// All 50 provincial capitals + Ceuta + Melilla, by INE code. "No capitals."
const CAPITALS = new Set([
  '01059', '02003', '03014', '04013', '05019', '06015', '07040', '08019', '09059', '10037',
  '11012', '12040', '13034', '14021', '15030', '16078', '17079', '18087', '19130', '20069',
  '21041', '22125', '23050', '24089', '25120', '26089', '27028', '28079', '29067', '30030',
  '31201', '32054', '33044', '34120', '35016', '36038', '37274', '38038', '39075', '40194',
  '41091', '42173', '43148', '44216', '45168', '46250', '47186', '48020', '49275', '50297',
  '51001', '52001',
]);

const all = [...m.values()];
const frame = all
  .filter((r) => !FORAL.has(r.ine.slice(0, 2)))
  .filter((r) => !CAPITALS.has(r.ine))
  .filter((r) => r.pop != null)
  .sort((a, b) => a.ine.localeCompare(b.ine)); // canonical order before shuffling

const BANDS = [
  { key: '<5k', lo: 0, hi: 5000 },
  { key: '5k-20k', lo: 5000, hi: 20000 },
  { key: '20k-50k', lo: 20000, hi: 50000 },
  { key: '50k-100k', lo: 50000, hi: 100000 },
  { key: '>100k', lo: 100000, hi: Infinity },
];

const byBand = Object.fromEntries(BANDS.map((b) => [b.key, []]));
for (const r of frame) {
  const b = BANDS.find((b) => r.pop >= b.lo && r.pop < b.hi);
  byBand[b.key].push(r);
}

// Autonomous-community capitals that are NOT provincial capitals — also rejected ("no capitals").
const AC_CAPITALS = new Set(['06083' /* Mérida, Extremadura */, '15078' /* Santiago de Compostela, Galicia */]);

// <5k carries 84% of the national municipality weight -> double its sample.
const PER_BAND = { '<5k': 8, '5k-20k': 4, '20k-50k': 4, '50k-100k': 4, '>100k': 4 };

const rnd = mulberry32(SEED);
const drawn = [];
const rejected = [];
for (const b of BANDS) {
  const pool = byBand[b.key].slice();
  // Fisher-Yates with the seeded PRNG
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  // Rejection sampling: skip AC capitals, take the next in shuffle order.
  let taken = 0;
  for (const r of pool) {
    if (taken >= PER_BAND[b.key]) break;
    if (AC_CAPITALS.has(r.ine)) { rejected.push({ ...r, band: b.key, why: 'autonomous-community capital' }); continue; }
    drawn.push({ ...r, band: b.key });
    taken++;
  }
}

const out = {
  seed: SEED,
  prng: 'mulberry32, Fisher-Yates shuffle over INE-code-ascending frame, take first N per band with rejection of AC capitals',
  perBand: PER_BAND,
  rejected,
  frameSource: 'Wikidata SPARQL (P31/P279* Q2074737, P772 INE code, P1082 population), fetched 2026-08-02',
  frameSizeAllINE: all.length,
  frameSizeAfterExclusions: frame.length,
  exclusions: {
    foralProvinces: ['01 Alava', '20 Gipuzkoa', '48 Bizkaia', '31 Navarra'],
    capitals: '52 provincial capitals + Ceuta + Melilla by INE code',
    noPopulation: all.length - all.filter((r) => r.pop != null).length,
  },
  bandCounts: Object.fromEntries(BANDS.map((b) => [b.key, byBand[b.key].length])),
  bandShareOfFrame: Object.fromEntries(BANDS.map((b) => [b.key, +(byBand[b.key].length / frame.length).toFixed(5)])),
  drawn,
};
fs.writeFileSync(path.join(DIR, 'probe-c.draw.json'), JSON.stringify(out, null, 2));
console.log('frame(all INE):', all.length, ' after exclusions:', frame.length);
console.log('band counts:', out.bandCounts);
console.log('band shares:', out.bandShareOfFrame);
console.log('--- DRAW ---');
for (const d of drawn) console.log(d.band.padEnd(9), d.ine, String(Math.round(d.pop)).padStart(8), d.name);
