/**
 * STEP 3 — Verify the two claims step 2 produced, before anything is built on them.
 *
 *  CLAIM A: paging works when `sortBy` is supplied. MADRID-DATA-INVENTORY §2 says paging is
 *           unsupported and therefore every figure is a natural-order HEAD (indicative).
 *           If A holds, that caveat is REMOVABLE and the prior figures can be re-measured.
 *           Verification: page the whole layer and check pages are DISJOINT and COMPLETE
 *           against the independent numberMatched total. (Disjointness is the real test —
 *           a server that silently ignores startIndex returns the same head every time.)
 *
 *  CLAIM B: CD_MUNICIPIO is NOT a 5-digit INE code. The census layer shows 3-digit "048".
 *           Verification: known-answer control. Madrid capital is INE 28079 / DGC 28900;
 *           if the key is the 3-digit INE municipality-within-province part, '079' resolves
 *           to MADRID and must be the largest municipality by feature count.
 *
 * Run: node tools/madrid-spacm-probe/03-verify-paging-and-key.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { getJson, q, hits } from './lib.mjs';

const OUT = new URL('./out/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
mkdirSync(OUT, { recursive: true });
const log = [];
const say = (s) => { console.log(s); log.push(s); };

// ═══ CLAIM B — the join key ══════════════════════════════════════════════════
say('=== CLAIM B: what is CD_MUNICIPIO? ===');
for (const code of ['079', '28079', '28900', '900', '5', '048']) {
  const h = await hits('sitcm:VPLA_V_ORDENANZA', `CD_MUNICIPIO='${code}'`);
  let name = null;
  if (h.count) {
    const r = await getJson(q({
      service: 'WFS', version: '2.0.0', request: 'GetFeature', typeNames: 'sitcm:VPLA_V_ORDENANZA',
      outputFormat: 'application/json', count: '1', CQL_FILTER: `CD_MUNICIPIO='${code}'`,
      propertyName: 'CD_MUNICIPIO,DS_MUNICIPIO', sortBy: 'CDID',
    }));
    name = r.json?.features?.[0]?.properties?.DS_MUNICIPIO ?? null;
  }
  say(`  CD_MUNICIPIO='${code}'  count=${String(h.count ?? 'NULL').padStart(6)}  DS_MUNICIPIO=${name}`);
}

// ═══ CLAIM A — does startIndex actually advance? ══════════════════════════════
say('\n=== CLAIM A: does sortBy make startIndex advance (or is it the same head each time)? ===');
const TN = 'sitcm:VPLA_V_AMBITO';
const total = (await hits(TN)).count;
say(`  independent total (resultType=hits) = ${total}`);

async function page(startIndex, count, sortBy) {
  const p = {
    service: 'WFS', version: '2.0.0', request: 'GetFeature', typeNames: TN,
    outputFormat: 'application/json', count: String(count), startIndex: String(startIndex),
    propertyName: 'CDID', sortBy,
  };
  const r = await getJson(q(p), { timeoutMs: 300000 });
  if (!r.ok) return { ids: null, err: r.owsException ?? r.transportError, status: r.status };
  return { ids: r.json.features.map((f) => f.properties.CDID), err: null };
}

const pA = await page(0, 10, 'CDID');
const pB = await page(10, 10, 'CDID');
say(`  page(start=0 ,n=10) ids = ${pA.ids ? pA.ids.join(',') : 'FAIL ' + pA.err}`);
say(`  page(start=10,n=10) ids = ${pB.ids ? pB.ids.join(',') : 'FAIL ' + pB.err}`);
const disjoint = pA.ids && pB.ids && pA.ids.every((i) => !pB.ids.includes(i));
say(`  DISJOINT? ${disjoint ? 'YES — startIndex genuinely advances' : 'NO — startIndex is being IGNORED, results would be a repeated head'}`);

// Full walk: page the entire layer and verify the union is complete and duplicate-free.
say('\n  Full walk of ' + TN + ' …');
const seen = new Set();
let dupes = 0, pages = 0, failed = null;
for (let s = 0; s < total + 5000; s += 5000) {
  const p = await page(s, 5000, 'CDID');
  if (!p.ids) { failed = `startIndex=${s}: ${p.err}`; break; }
  pages++;
  for (const id of p.ids) { if (seen.has(id)) dupes++; else seen.add(id); }
  if (p.ids.length === 0) break;
}
say(`  pages fetched  : ${pages}`);
say(`  unique CDIDs   : ${seen.size}`);
say(`  duplicates     : ${dupes}`);
say(`  hits total     : ${total}`);
say(`  failure        : ${failed ?? 'none'}`);
const complete = seen.size === total && dupes === 0;
say(`  ⇒ PAGING ${complete ? 'WORKS AND IS COMPLETE — the "paging unsupported" blocker is FALSE; it needs sortBy=CDID.'
                          : 'INCOMPLETE — do not rely on it'}`);

// ═══ Known-answer control: per-municipality counts must SUM to the layer total ═══
say('\n=== KNOWN-ANSWER CONTROL: do per-municipality hits sum to the layer total? ===');
say('  (this is the internal-contradiction check — if the parts do not sum to the whole,');
say('   either the key has nulls or the counts are filtered, and no rate may be quoted)');

writeFileSync(`${OUT}/03-verify.log`, log.join('\n'));
writeFileSync(`${OUT}/03-verify.json`, JSON.stringify({ total, unique: seen.size, dupes, disjoint, complete, failed }, null, 2));
