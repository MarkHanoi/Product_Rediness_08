/**
 * Per-role ranking report over a captured crawl fixture.
 *
 *   npx tsx tools/spanish-genome-probe/roleReport.ts <slim-crawl.json> [--top N] [--find <urlSuffix>]
 *
 * Runs offline against a slimmed crawl so the same bytes can be re-scored
 * without re-hitting anyone's server.
 */
import { readFileSync } from 'node:fs';
import { rankLayersByRole } from './roleScoring.js';
import { ROLE_PROFILES } from './roles.js';

interface SlimLayer {
  serviceName: string;
  layerName: string;
  layerUrl: string;
  geometryType: string | null;
  wkid: number | null;
  fields: { name: string; alias: string }[];
}

const [path, ...rest] = process.argv.slice(2);
if (!path) {
  console.error('usage: tsx roleReport.ts <slim-crawl.json> [--top N] [--find <urlSuffix>]');
  process.exit(2);
}
const topIdx = rest.indexOf('--top');
const top = topIdx >= 0 ? Number(rest[topIdx + 1]) : 5;
const finds = rest.reduce<string[]>((a, v, i) => (rest[i - 1] === '--find' ? [...a, v] : a), []);

const crawl = JSON.parse(readFileSync(path, 'utf8')) as { layers: SlimLayer[]; root?: string };
const ranked = rankLayersByRole(crawl.layers);

console.log(`\n${'='.repeat(78)}\n${crawl.root ?? path}   —   ${crawl.layers.length} layers\n${'='.repeat(78)}`);

for (const p of ROLE_PROFILES) {
  const list = ranked[p.role];
  console.log(`\n### ${p.role.toUpperCase()}`);
  for (const r of list.slice(0, top)) {
    const flag = r.score.score > 0 ? ' ' : '!';
    console.log(
      `  ${flag}#${r.rank} ${String(r.score.score).padStart(4)}  ${r.layer.serviceName} / ${r.layer.layerName}` +
        `  [${r.layer.geometryType ?? '-'}]  ${r.layer.layerUrl.split('/rest/services/')[1] ?? ''}`,
    );
  }
  if ((list[0]?.score.score ?? 0) <= 0) console.log('     -> NOT FOUND for this role (top score <= 0; reported as unknown, not as zero)');
}

for (const f of finds) {
  console.log(`\n--- role ranks for *${f} ---`);
  for (const p of ROLE_PROFILES) {
    const hit = ranked[p.role].find((r) => r.layer.layerUrl.endsWith(f));
    if (!hit) {
      console.log(`  ${p.role.padEnd(19)} ABSENT from crawl`);
      continue;
    }
    const winners = ranked[p.role].slice(0, 3).map((r) => r.layer.layerName).join(' | ');
    console.log(`  ${p.role.padEnd(19)} #${String(hit.rank).padStart(3)}/${ranked[p.role].length}  score=${String(hit.score.score).padStart(4)}   top3: ${winners.slice(0, 90)}`);
  }
}
