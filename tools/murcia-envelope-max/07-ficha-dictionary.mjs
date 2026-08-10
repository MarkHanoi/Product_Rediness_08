// §MURCIA-ENVELOPE-MAX · STEP 7 — DERIVE THE FIELD DICTIONARY FROM THE DATA
//
// ⚠ DO NOT ASSUME MURCIAN ABBREVIATIONS. Balears' assumed codes collided with
//   USE CLASSES (`AT` = Allotjament turístic, not altura; `RL` = Religiós, not
//   reculada) and the guess reported metric height as 0/80 ABSENT when it was
//   49/80. So: dump the labels the document itself prints, verbatim, and build
//   the dictionary from that.
//
// This step fetches a handful of fichas across DIFFERENT municipalities and
// DIFFERENT land classes, and emits the complete label inventory.

import { politeFetch, wfsJson, writeOut, sha256, sleep } from './lib.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { HERE } from './lib.mjs';

const REFRESH = process.argv.includes('--refresh');
const O = { refresh: REFRESH };
const report = { step: 7, measuredAt: new Date().toISOString(), notes: [] };

const RAW = join(HERE, 'raw-fichas');
mkdirSync(RAW, { recursive: true });

const live = (wide) => `http://urbmurcia.carm.es/urbmurcia/sitmurcia/potgisfichacen.jsp?wide=${wide}&widi=es&x=0&y=0`;
const wideOf = (u) => { const m = /[?&]wide=(\d+)/.exec(u || ''); return m ? m[1] : null; };

// ── 7a · pick diverse targets from the WFS ─────────────────────────────────
const j = await wfsJson(
  'SIT_USU_PLA_URB_CARM:plu_ze_37_mun_uso_suelo',
  { propertyName: 'Municipio,Ambito,Clasificacion,Uso_Especifico,Area_m2,Enlace_ficha', count: 200000 },
  O
);
const rows = j.features.map((f) => f.properties).filter((r) => wideOf(r.Enlace_ficha));

// diversity: one per (municipality, clasificación) up to 14 targets
const seen = new Set();
const targets = [];
for (const r of rows) {
  const k = r.Municipio + '|' + r.Clasificacion;
  if (seen.has(k)) continue;
  seen.add(k);
  targets.push(r);
  if (targets.length >= 14) break;
}
console.log(`\n== 7a · ${targets.length} diverse ficha targets ==`);
targets.forEach((t) => console.log(`  ${t.Municipio} / ${t.Ambito} / ${t.Clasificacion} → wide=${wideOf(t.Enlace_ficha)}`));

// ── 7b · fetch them SLOWLY. The Radware WAF at urbmurcia.carm.es trips on
//         anything that looks automated, so 6 s between hits and no cookies.
console.log('\n== 7b · fetching (slow — 6 s apart, WAF-aware) ==');
report.fetches = [];
const bodies = [];
for (const t of targets) {
  const w = wideOf(t.Enlace_ficha);
  const r = await politeFetch(live(w), { ...O, tag: 'dict-' + w, timeout: 120_000, headers: { 'User-Agent': 'curl/8.5.0' } });
  const raw = r.buf.toString('utf8');
  const captcha = /Radware Captcha|perfdrive\.com|hcaptcha/i.test(raw);
  const rec = {
    municipio: t.Municipio,
    ambito: t.Ambito,
    clasificacion: t.Clasificacion,
    wide: w,
    status: r.status,
    bytes: r.buf.length,
    sha256: sha256(r.buf),
    // ⛔ HTTP 200 IS NOT SUCCESS — a CAPTCHA interstitial is a 200.
    captchaBlocked: captcha,
  };
  report.fetches.push(rec);
  if (!captcha && r.status === 200) {
    writeFileSync(join(RAW, `ficha-${w}.html`), r.buf);
    bodies.push({ ...rec, raw });
  }
  console.log(`  wide=${String(w).padEnd(7)} ${t.Municipio.slice(0, 18).padEnd(19)} ${String(r.buf.length).padStart(7)}B ${captcha ? '⛔ CAPTCHA' : 'ok'} sha=${rec.sha256.slice(0, 10)}`);
  if (!r.fromCache) await sleep(4600);
}

// ⭐ NEGATIVE CONTROL 1 — DISTINCT BYTES. If every ficha were a template echoing
//   the query, the hashes would collide.
const hashes = new Set(bodies.map((b) => b.sha256));
report.negativeControl_distinctBytes = {
  fetched: bodies.length,
  distinctHashes: hashes.size,
  pass: bodies.length > 1 && hashes.size === bodies.length,
};
console.log(`\n  ⭐ distinct byte hashes: ${hashes.size}/${bodies.length} → ${report.negativeControl_distinctBytes.pass ? 'PASS' : 'FAIL'}`);

// ⭐ NEGATIVE CONTROL 2 — DOES THE DOCUMENT NAME ITS OWN MUNICIPALITY?
//   A template that echoed the queried name would also pass a naive check, so
//   we compare against the WFS-side municipality WITHOUT sending it in the URL:
//   the URL carries ONLY an opaque integer `wide`. The name can only come from
//   the server's own record.
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z ]/g, ' ').replace(/\s+/g, ' ').trim();
report.negativeControl_selfNaming = [];
for (const b of bodies) {
  const text = b.raw.replace(/<[^>]+>/g, ' ');
  const m = /Municipio:\s*([^<\n]{2,60}?)\s{2,}/.exec(text) || /Municipio:\s*([A-ZÁÉÍÓÚÑ' -]{2,60})/.exec(text);
  const printed = m ? m[1].trim() : null;
  const ok = printed && norm(printed) === norm(b.municipio);
  report.negativeControl_selfNaming.push({ wide: b.wide, wfsMunicipio: b.municipio, fichaPrints: printed, match: !!ok });
}
const named = report.negativeControl_selfNaming.filter((x) => x.match).length;
console.log(`  ⭐ ficha names its own municipality: ${named}/${bodies.length}`);
console.log(`     (the URL carries ONLY an opaque integer — the name cannot be echoed from the query)`);
report.negativeControl_selfNamingRate = { matched: named, of: bodies.length };

// ── 7c · THE LABEL INVENTORY — verbatim, derived, not assumed ───────────────
console.log('\n== 7c · verbatim label inventory ==');
const labelCounts = new Map();
const labelValues = new Map();
for (const b of bodies) {
  // the ficha is a label/value table; capture "Label:" followed by its cell text
  const flat = b.raw
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/<[^>]+>/g, '')
    // U+0001 is used deliberately as a cell-boundary sentinel: every HTML tag is
    // collapsed to it on the line above, and runs are squashed here. It cannot occur
    // in the source HTML, which is exactly why a control character was chosen over a
    // printable delimiter.
    // eslint-disable-next-line no-control-regex
    .replace(/+/g, '');
  const cells = flat.split('').map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    if (!/:$|:\s*$/.test(c)) continue;
    const label = c.replace(/:\s*$/, '').trim();
    if (label.length < 2 || label.length > 70) continue;
    labelCounts.set(label, (labelCounts.get(label) || 0) + 1);
    const v = cells[i + 1] && !/:$/.test(cells[i + 1]) ? cells[i + 1] : '';
    if (!labelValues.has(label)) labelValues.set(label, []);
    labelValues.get(label).push({ wide: b.wide, muni: b.municipio, value: v });
  }
}
report.labelInventory = [...labelCounts.entries()]
  .sort((a, b2) => b2[1] - a[1])
  .map(([label, n]) => {
    const vals = labelValues.get(label);
    const nonEmpty = vals.filter((v) => v.value && v.value !== '-' && v.value !== '&nbsp;');
    return {
      label,
      appearsInDocs: n,
      populated: nonEmpty.length,
      populatedPct: +((100 * nonEmpty.length) / vals.length).toFixed(1),
      sampleValues: nonEmpty.slice(0, 6).map((v) => `${v.muni}=${v.value}`),
    };
  });
for (const l of report.labelInventory) {
  console.log(`  ${l.label.padEnd(52)} docs=${String(l.appearsInDocs).padStart(3)} populated=${String(l.populated).padStart(3)} (${l.populatedPct}%)`);
  if (l.populated) console.log(`      e.g. ${l.sampleValues.slice(0, 3).join(' | ')}`);
}

writeOut('07-ficha-dictionary.json', report);
console.log('\nSTEP 7 done.');
