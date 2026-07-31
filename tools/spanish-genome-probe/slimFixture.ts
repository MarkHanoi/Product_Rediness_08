/**
 * Slim a raw `--raw` crawl dump down to just what the scorer reads, so the
 * offline calibration fixture stays small enough to live in the repo.
 *
 *   npx tsx tools/spanish-genome-probe/slimFixture.ts <in.json> <out.json>
 */
import { readFileSync, writeFileSync } from 'node:fs';
import type { CrawlReport } from './arcgisCrawler.js';

const [inPath, outPath] = process.argv.slice(2);
if (!inPath || !outPath) {
  console.error('usage: tsx slimFixture.ts <in.json> <out.json>');
  process.exit(2);
}
const c = JSON.parse(readFileSync(inPath, 'utf8')) as CrawlReport;
const slim = {
  root: c.root,
  catalogStatus: c.catalogStatus,
  folders: c.folders,
  serviceCount: c.services.length,
  requestCount: c.requestCount,
  failures: c.failures,
  layers: c.layers.map((l) => ({
    serviceName: l.serviceName,
    layerName: l.layerName,
    layerUrl: l.layerUrl,
    geometryType: l.geometryType,
    wkid: l.wkid,
    fields: l.fields.map((f) => ({ name: f.name, alias: f.alias })),
  })),
};
writeFileSync(outPath, JSON.stringify(slim));
console.log(`${c.layers.length} layers -> ${outPath}`);
