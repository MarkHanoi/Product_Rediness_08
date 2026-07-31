/**
 * Rank lookup — given a probe report and one or more layer-URL suffixes, print
 * the rank, score, margin and field classification of each.
 *
 *   npx tsx tools/spanish-genome-probe/rank.ts <report.json> <urlSuffix>...
 *
 * Used to answer "where did the TRUE layer land, and what outscored it?" without
 * eyeballing a 700-row table.
 */
import { readFileSync } from 'node:fs';
import type { ProbeReport } from './probe.js';

const [reportPath, ...suffixes] = process.argv.slice(2);
if (!reportPath) {
  console.error('usage: tsx rank.ts <report.json> <layerUrlSuffix>...');
  process.exit(2);
}
const rep = JSON.parse(readFileSync(reportPath, 'utf8')) as ProbeReport;
const n = rep.ranked.length;
console.log(`report=${reportPath}  root=${rep.root}  ranked=${n}  catalog=${rep.crawl.catalogStatus}`);

for (const suf of suffixes) {
  const hit = rep.ranked.find((r) => r.url.endsWith(suf));
  if (!hit) {
    console.log(`\n?? ${suf} — NOT PRESENT in the ranked list (not "rank 0": absent from the crawl entirely)`);
    continue;
  }
  const above = rep.ranked.filter((r) => r.rank < hit.rank);
  const top = rep.ranked[0]!;
  console.log(`\n== ${suf}`);
  console.log(`   rank      #${hit.rank} / ${n}`);
  console.log(`   score     ${hit.score}   (top scorer = ${top.score}; margin to #1 = ${hit.score - top.score})`);
  const next = rep.ranked[hit.rank] ?? null;
  console.log(`   margin    over next-below = ${next ? hit.score - next.score : 'n/a'}`);
  console.log(`   layer     ${hit.service} / ${hit.layer}  [${hit.geometryType} wkid=${hit.wkid} fields=${hit.fieldCount}]`);
  console.log(`   breakdown ${JSON.stringify(hit.breakdown)}`);
  console.log(`   zoneCode  ${hit.zoneCodeField ? `${hit.zoneCodeField.field} (alias "${hit.zoneCodeField.alias}") conf=${hit.zoneCodeField.confidence} src=${hit.zoneCodeField.src}` : 'NONE'}`);
  console.log(`   designat. ${hit.designationField ? `${hit.designationField.field} (alias "${hit.designationField.alias}") conf=${hit.designationField.confidence} src=${hit.designationField.src}` : 'NONE'}`);
  console.log(`   outscored by ${above.length}:`);
  for (const a of above.slice(0, 10)) console.log(`     #${a.rank} ${a.score}  ${a.service}/${a.layer}`);
}
