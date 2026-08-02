#!/usr/bin/env node
// PROBE A · STAGE 5b — PRECEDENCE FIX + final determination.
//
// ⚠ DEFECT FOUND IN MY OWN STAGE-4 CLASSIFIER, 09:17Z. The worked envelope came out on a parcel
// whose polygon carries NORMATIV='Asterisc' / PLAN='PD*' — i.e. the POUM DELEGATES that land to a
// plà derivat — yet it scored `envelope` because I tested QUAL_MUNI parameters BEFORE the
// delegation flag. That is the `envelope-solid-overstates-partial-data` failure family exactly:
// a baseline parameter set published for a clau does NOT survive a derived plan that may override
// it, and ADR-0283 requires Unknown over inferred entitlement. Delegation must WIN.
//
// CORRECT PRECEDENCE (stated, then applied):
//   1. OV_Trames footprint + PARSABLE `PLANTES`  → ENVELOPE (explicit-area: the volumetric ordering
//      is READ, so it RESOLVES a delegation rather than being overridden by one).
//   2. NORMATIV='Asterisc' or PLAN contains 'PD*' → REFUSE (delegated).
//   3. Títol 6 / Títol 7 clau                     → REFUSE (legally terminal: systems, not private land).
//   4. QUAL_MUNI carries ARM+N_PLANTES+OCUP_MAX+SEP_FVIAL → ENVELOPE.
//   5. QUAL_MUNI row exists but is all-NULL       → REFUSE (article nameable, text unobtainable).
//   6. no row                                     → REFUSE.
//   0. no zoning polygon                          → NOT A DETERMINATION (counted separately, R5).
import { writeFileSync, readFileSync } from 'node:fs';
const OUT = 'c:/Users/LENOVO/OneDrive/Desktop/PRYZM/Product_Rediness_08/.claude/worktrees/agent-a1e8e521bbaeb782e/tools/cold-start-probe/probe-a/';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const SVC = 'https://geoportal.amb.cat/geoserveis/rest/services/qualificacio_refos_3857/MapServer';
const INE = '08196';
const st4 = JSON.parse(readFileSync(OUT + 'stage4.parcels.json', 'utf8'));
const qm = JSON.parse(readFileSync(OUT + 'stage3.qualmuni.raw.json', 'utf8'));
const qmByClau = new Map(qm.map((r) => [String(r.CODI_MUN).slice(6), r]));
const N = st4.n;

const r17 = await fetch(`${SVC}/17/query?${new URLSearchParams({ f: 'json', where: `CODI_INE='${INE}'`, outFields: 'CLAU_URB,PLANTES', returnGeometry: 'true', outSR: '4326' })}`, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(180000) });
const ovj = JSON.parse(await r17.text());
const ovFeats = ovj.features.map((f) => ({ a: f.attributes, rings: f.geometry?.rings ?? [] }));
function inRing(x, y, ring) { let s = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, yi] = ring[i], [xj, yj] = ring[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) s = !s; } return s; }
// `B+7`, `PB+3`, `B+3+A` (àtic) all parse; `ED` does not and MUST refuse — never defaulted.
const parsePlantes = (v) => { const m = /^(?:P?B|PX)\s*\+\s*(\d+)(\s*\+\s*A)?$/i.exec(String(v ?? '').trim()); return m ? { storeys: 1 + Number(m[1]) + (m[2] ? 1 : 0), raw: String(v).trim() } : null; };
const has = (v) => v !== null && v !== undefined && String(v).trim() !== '';

const out = [];
for (const p of st4.results) {
  if (p.state === 'outside-zoning') { out.push({ ...p, final: 'no-determination', reason: 'centroid outside every layer-16 polygon' }); continue; }
  const clau = p.clau, norm = String(p.normativ ?? ''), plan = String(p.plan ?? '');
  let ovHit = null;
  for (const g of ovFeats) { let ins = false; for (const rg of g.rings) if (inRing(p.lon, p.lat, rg)) ins = !ins; if (ins) { ovHit = g; break; } }
  const pl = ovHit ? parsePlantes(ovHit.a.PLANTES) : null;
  const q = qmByClau.get(clau);
  if (pl) { out.push({ ...p, final: 'envelope', via: 'OV_Trames', storeys: pl.storeys, plantes: pl.raw, reason: `explicit volumetric footprint + PLANTES='${pl.raw}' read from AMB layer 17` }); continue; }
  if (ovHit) { out.push({ ...p, final: 'refuse', cat: 'gated-external', via: 'OV_Trames', reason: `inside an OV polygon but PLANTES='${ovHit.a.PLANTES}' is unparseable — refuses rather than defaulting a storey count` }); continue; }
  if (norm === 'Asterisc' || plan.includes('PD*')) { out.push({ ...p, final: 'refuse', cat: 'delegated', reason: `PLAN='${plan}', NORMATIV='Asterisc' — POUM delegates to a plà derivat not in our corpus (ADR-0283)` }); continue; }
  if (/titol_(6|7)\./.test(norm)) { out.push({ ...p, final: 'refuse', cat: 'terminal', reason: `${norm} — systems / non-buildable public land; no private envelope exists` }); continue; }
  if (q && has(q.ARM) && has(q.N_PLANTES) && has(q.OCUP_MAX) && has(q.SEP_FVIAL)) { out.push({ ...p, final: 'envelope', via: 'QUAL_MUNI', reason: `table 18 CODI_MUN=${INE}_${clau} carries ARM/N_PLANTES/OCUP_MAX/setbacks`, q }); continue; }
  if (q) { out.push({ ...p, final: 'refuse', cat: 'gated-external', reason: `QUAL_MUNI row ${INE}_${clau} exists but every envelope field is NULL; governing article ${norm} is NAMEABLE but its text is UNOBTAINABLE (Stage 2)` }); continue; }
  out.push({ ...p, final: 'refuse', cat: 'gated-external', reason: `no QUAL_MUNI row for clau ${clau}` });
}

const pc = (x) => +((100 * x) / N).toFixed(2);
const cnt = (f) => out.filter(f).length;
const envQ = cnt((r) => r.final === 'envelope' && r.via === 'QUAL_MUNI');
const envO = cnt((r) => r.final === 'envelope' && r.via === 'OV_Trames');
const refD = cnt((r) => r.cat === 'delegated'), refT = cnt((r) => r.cat === 'terminal'), refG = cnt((r) => r.cat === 'gated-external');
const nod = cnt((r) => r.final === 'no-determination');

console.log(`── FINAL, precedence-corrected (N = ${N} cadastral parcels) ──`);
console.log(`Determination ${pc(envQ + envO + refD + refT + refG)}% = Envelope ${pc(envQ + envO)}% + Refusal ${pc(refD + refT + refG)}%`);
console.log(`  envelope · OV_Trames explicit footprint : ${pc(envO)}% (${envO})   [UNSIGNED cert gate for this muni]`);
console.log(`  envelope · QUAL_MUNI parameters         : ${pc(envQ)}% (${envQ})   [shippable today]`);
console.log(`  refuse   · delegated to a plà derivat   : ${pc(refD)}% (${refD})`);
console.log(`  refuse   · legally terminal (systems)   : ${pc(refT)}% (${refT})`);
console.log(`  refuse   · gated on external authority  : ${pc(refG)}% (${refG})`);
console.log(`  no determination (outside zoning)       : ${pc(nod)}% (${nod})`);
console.log(`\nDELTA vs the buggy Stage-4 ordering: envelope ${pc(envQ + envO)}% vs 56.76% — the precedence fix moved ${(56.76 - pc(envQ + envO)).toFixed(2)} points from ENVELOPE to REFUSAL.`);

// worked examples, now correct
const we = out.find((r) => r.final === 'envelope' && r.via === 'QUAL_MUNI' && r.normativ !== 'Asterisc');
const wo = out.find((r) => r.final === 'envelope' && r.via === 'OV_Trames');
const wr = out.find((r) => r.cat === 'delegated');
const wt = out.find((r) => r.cat === 'terminal');
console.log(`\nworked ENVELOPE (QUAL_MUNI): ${we.ref} clau ${we.clau} · ${we.normativ} · ARM=${we.q.ARM}m N_PLANTES=${we.q.N_PLANTES} OCUP_MAX=${we.q.OCUP_MAX}% setbacks ${we.q.SEP_FVIAL}/${we.q.SEP_LAT}/${we.q.SEP_FONS}m S_MIN_PAR=${we.q.S_MIN_PAR}m2 IE=NULL`);
console.log(`worked ENVELOPE (OV):        ${wo.ref} clau ${wo.clau} · PLANTES='${wo.plantes}' ⇒ ${wo.storeys} storeys, explicit footprint polygon`);
console.log(`worked REFUSAL (delegated):  ${wr.ref} clau ${wr.clau} · ${wr.reason}`);
console.log(`worked REFUSAL (terminal):   ${wt.ref} clau ${wt.clau} · ${wt.reason}`);

writeFileSync(OUT + 'stage5b.final.json', JSON.stringify({
  n: N, envQ, envO, refD, refT, refG, nod,
  pct: { envelope: pc(envQ + envO), envelope_shippable_today: pc(envQ), envelope_after_signature: pc(envQ + envO), refusal: pc(refD + refT + refG), determination: pc(envQ + envO + refD + refT + refG), noDetermination: pc(nod) },
  worked: { envelopeQualMuni: we, envelopeOv: wo, refusalDelegated: wr, refusalTerminal: wt },
}, null, 1));
console.log('\n→ stage5b.final.json');
