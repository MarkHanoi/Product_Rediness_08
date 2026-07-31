/**
 * Spanish Genome probe — CLI.
 *
 *   npx tsx tools/spanish-genome-probe/probe.ts <arcgis-rest-root> [--out file.json]
 *                                               [--folders <regex>] [--top N]
 *
 * Crawls an ArcGIS REST root, scores every layer with the Madrid-calibrated
 * scorer, and emits a ranked report plus a per-heuristic hit/miss ledger.
 *
 * It NEVER invents a result: unreachable roots, HTTP errors, ArcGIS error
 * envelopes and genuinely empty catalogues are reported as distinct outcomes.
 */

import { writeFileSync } from 'node:fs';
import { crawlArcGisRoot, type CrawlReport, type DiscoveredLayer } from './arcgisCrawler.js';
import { bestFieldFor, classifyFields, rankLayers, type RankedLayer } from './scoring.js';
import { FIELD_RULES, FIELD_SIGNAL_TOKENS, LAYER_NAME_NEGATIVE_TOKENS, LAYER_NAME_TOKENS } from './heuristics.js';

export interface ProbeReport {
  readonly root: string;
  readonly generatedAt: string;
  readonly crawl: {
    readonly catalogStatus: string;
    readonly folders: number;
    readonly services: number;
    readonly layers: number;
    readonly requests: number;
    readonly failures: CrawlReport['failures'];
  };
  readonly ranked: {
    rank: number;
    score: number;
    service: string;
    layer: string;
    url: string;
    geometryType: string | null;
    wkid: number | null;
    breakdown: RankedLayer<DiscoveredLayer & { serviceName: string; layerName: string }>['score']['breakdown'];
    hits: { token: string; weight: number; src: string; where: string }[];
    zoneCodeField: { field: string; alias: string; confidence: number; src: string | null } | null;
    designationField: { field: string; alias: string; confidence: number; src: string | null } | null;
    fieldCount: number;
  }[];
  /** Which heuristic tokens fired anywhere in this catalogue, and which never did. */
  readonly heuristicLedger: {
    readonly layerTokensHit: string[];
    readonly layerTokensMissed: string[];
    readonly negativeTokensHit: string[];
    readonly fieldTokensHit: string[];
    readonly fieldTokensMissed: string[];
    readonly fieldRulesHit: string[];
    readonly fieldRulesMissed: string[];
  };
}

export async function runProbe(
  root: string,
  opts: { folderFilter?: (f: string) => boolean; top?: number; timeoutMs?: number; onCrawl?: (c: CrawlReport) => void } = {},
): Promise<ProbeReport> {
  const urls: string[] = [];
  const crawl = await crawlArcGisRoot(root, {
    folderFilter: opts.folderFilter,
    timeoutMs: opts.timeoutMs ?? 30_000,
    onRequest: (u) => urls.push(u),
  });
  opts.onCrawl?.(crawl);

  const ranked = rankLayers(crawl.layers);
  const top = ranked.slice(0, opts.top ?? 25);

  const layerTokensHit = new Set<string>();
  const negativeTokensHit = new Set<string>();
  const fieldTokensHit = new Set<string>();
  const fieldRulesHit = new Set<string>();
  for (const r of ranked) {
    for (const h of r.score.hits) {
      if (h.weight < 0) negativeTokensHit.add(h.token);
      else if (h.where === 'field') fieldTokensHit.add(h.token);
      else layerTokensHit.add(h.token);
    }
    for (const c of classifyFields(r.layer.fields)) if (c.rule) fieldRulesHit.add(c.rule);
  }

  return {
    root: crawl.root,
    generatedAt: new Date().toISOString(),
    crawl: {
      catalogStatus: crawl.catalogStatus,
      folders: crawl.folders.length,
      services: crawl.services.length,
      layers: crawl.layers.length,
      requests: crawl.requestCount,
      failures: crawl.failures,
    },
    ranked: top.map((r) => {
      const zc = bestFieldFor(r.layer.fields, 'zoneCode');
      const od = bestFieldFor(r.layer.fields, 'officialDesignation');
      return {
        rank: r.rank,
        score: r.score.score,
        service: r.layer.serviceName,
        layer: r.layer.layerName,
        url: r.layer.layerUrl,
        geometryType: r.layer.geometryType,
        wkid: r.layer.wkid,
        breakdown: r.score.breakdown,
        hits: r.score.hits.map((h) => ({ token: h.token, weight: h.weight, src: h.src, where: h.where })),
        zoneCodeField: zc ? { field: zc.field, alias: zc.alias, confidence: zc.confidence, src: zc.src } : null,
        designationField: od ? { field: od.field, alias: od.alias, confidence: od.confidence, src: od.src } : null,
        fieldCount: r.layer.fields.length,
      };
    }),
    heuristicLedger: {
      layerTokensHit: [...layerTokensHit].sort(),
      layerTokensMissed: LAYER_NAME_TOKENS.map((t) => t.t).filter((t) => !layerTokensHit.has(t)),
      negativeTokensHit: [...negativeTokensHit].sort(),
      fieldTokensHit: [...fieldTokensHit].sort(),
      fieldTokensMissed: FIELD_SIGNAL_TOKENS.map((t) => t.t).filter((t) => !fieldTokensHit.has(t)),
      fieldRulesHit: [...fieldRulesHit].sort(),
      fieldRulesMissed: FIELD_RULES.map((r) => String(r.pattern)).filter((p) => !fieldRulesHit.has(p)),
    },
  };
}

// ── CLI ──────────────────────────────────────────────────────────────────────

const isMain = process.argv[1]?.replace(/\\/g, '/').endsWith('spanish-genome-probe/probe.ts');
if (isMain) {
  const args = process.argv.slice(2);
  const root = args.find((a) => !a.startsWith('--'));
  const outIdx = args.indexOf('--out');
  const foldersIdx = args.indexOf('--folders');
  const topIdx = args.indexOf('--top');
  if (!root) {
    console.error('usage: tsx probe.ts <arcgis-rest-root> [--out f.json] [--folders <regex>] [--top N]');
    process.exit(2);
  }
  const folderRe = foldersIdx >= 0 ? new RegExp(args[foldersIdx + 1]!, 'i') : null;
  const rawIdx = args.indexOf('--raw');
  runProbe(root, {
    folderFilter: folderRe ? (f) => folderRe.test(f) : undefined,
    top: topIdx >= 0 ? Number(args[topIdx + 1]) : 25,
    onCrawl: rawIdx >= 0 ? (c) => writeFileSync(args[rawIdx + 1]!, JSON.stringify(c, null, 1)) : undefined,
  })
    .then((rep) => {
      const json = JSON.stringify(rep, null, 2);
      if (outIdx >= 0) {
        writeFileSync(args[outIdx + 1]!, json);
        console.log(`wrote ${args[outIdx + 1]}`);
      }
      console.log(
        `catalog=${rep.crawl.catalogStatus} folders=${rep.crawl.folders} services=${rep.crawl.services} layers=${rep.crawl.layers} failures=${rep.crawl.failures.length}`,
      );
      for (const r of rep.ranked.slice(0, 15)) {
        console.log(
          `#${String(r.rank).padStart(2)} ${String(r.score).padStart(4)}  ${r.service} / ${r.layer}` +
            `  [geom=${r.geometryType ?? '-'} fields=${r.fieldCount}]` +
            (r.zoneCodeField ? `  zoneCode<-${r.zoneCodeField.field}@${r.zoneCodeField.confidence}` : '  zoneCode<-NONE'),
        );
      }
    })
    .catch((e) => {
      console.error('probe failed:', e);
      process.exit(1);
    });
}
