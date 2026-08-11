/**
 * THE canonical, machine-readable NFT target table.
 *
 * ## Authority
 *
 * The single source of truth is
 * `docs/02-decisions/contracts/C10-PERFORMANCE-AND-OBSERVABILITY.md` §1.
 * Per CLAUDE.md's conflict-resolution order (STR-03 → C01–C15 contracts →
 * ADRs → SPECs), a *contract* outranks a strategy doc and both outrank a
 * source constant. So C10 §1 wins, and this file exists to make C10 §1
 * executable rather than to restate it from memory.
 *
 * Every row below reproduces C10 §1 **verbatim** in `c10Nft`, `c10Target`
 * and `c10BenchFile`. `packages/perf-budgets/__tests__/c10-crosscheck.test.ts`
 * parses the C10 markdown table at test time and fails if any cell drifts.
 * That test IS the anti-drift mechanism: the table cannot silently diverge
 * from the contract again.
 *
 * ## What this replaces (W5-1, 2026-08-11)
 *
 * Four mutually inconsistent target sets existed:
 *   1. C10 §1                            — 19 NFTs (contract, authoritative)
 *   2. STR-03 §5.1                       — 17 NFTs, 3 rows disagreeing with C10
 *   3. this file (previous revision)     — a DISJOINT 9-row list anchored to
 *                                          `docs/00_NEW_ARCHITECTURE/08-VISION.md §6`,
 *                                          a **deleted** document
 *   4. each bench's own header comment   — anchored to `01-VISION.md §5`, also
 *                                          **deleted**, with numbers up to 40×
 *                                          weaker than C10
 *
 * Sets 2–4 are retired. Benches import their thresholds from here.
 *
 * ## Honesty rule (non-negotiable)
 *
 * A bench MAY only assert `limit` when `measurability === 'measured'` — i.e.
 * when it measures the quantity C10 actually names, in an environment where
 * that quantity exists. Where it cannot, the row is
 * `measurability: 'not-yet-measurable'` with a mandatory `blockedBy`, and the
 * bench MUST NOT assert a proxy number against C10's budget. A green bench
 * that measures something adjacent is worse than no bench: it manufactures
 * false confidence.
 */

/** Unit of the machine-readable `limit` field. */
export type NftUnit = 'ms' | 's' | 'MB' | 'GB' | 'fps' | 'percent' | 'boolean';

/** Where the quantity C10 names actually lives. */
export type NftEnv =
  /** Pure CPU/JS work; a Node process measures the real quantity. */
  | 'node'
  /** Needs a real browser: paint, GPU, rAF, DOM, compositor. */
  | 'browser'
  /** Needs a built production bundle on disk. */
  | 'build'
  /** Needs a full app + server: Playwright. */
  | 'e2e'
  /** Needs a live third-party network dependency. */
  | 'network';

export type NftMeasurability =
  /** The bench measures exactly C10's quantity. It may assert `limit`. */
  | 'measured'
  /** The bench cannot measure C10's quantity here. It MUST NOT assert `limit`. */
  | 'not-yet-measurable';

export interface NftTarget {
  /** C10 §1 row number (1–19). */
  readonly nft: number;
  /** Stable kebab-case identifier. */
  readonly id: string;
  /** VERBATIM C10 §1 "NFT" cell. Cross-checked against the contract. */
  readonly c10Nft: string;
  /** VERBATIM C10 §1 "Target" cell. Cross-checked against the contract. */
  readonly c10Target: string;
  /** VERBATIM C10 §1 "Bench file" cell. Cross-checked against the contract. */
  readonly c10BenchFile: string;
  /** Machine-readable budget parsed from `c10Target`. `null` = not numeric. */
  readonly limit: number | null;
  readonly unit: NftUnit;
  /** The workload C10 names (element counts, session length, file size…). */
  readonly workload: string;
  /** Where C10's quantity actually lives. */
  readonly env: NftEnv;
  readonly measurability: NftMeasurability;
  /**
   * Repo-relative path to the file that measures (or is intended to measure)
   * this NFT. `null` when no such file exists at all.
   */
  readonly benchPath: string | null;
  /**
   * REQUIRED when `measurability === 'not-yet-measurable'`. States the exact
   * missing capability. Never a hand-wave.
   */
  readonly blockedBy?: string;
  /**
   * What the current bench file actually measures TODAY, when that is not
   * C10's quantity. Documents the proxy so it is never mistaken for the real
   * metric.
   */
  readonly measuresInsteadToday?: string;
  /** Key(s) under `apps/bench/baseline.json::benches`, when promoted. */
  readonly baselineKey?: string | readonly string[];
}

export const NFT_TARGETS: readonly NftTarget[] = [
  {
    nft: 1,
    id: 'cold-boot-first-paint',
    c10Nft: 'Cold-boot to first paint',
    c10Target: '< 2.5 s on M1 / Chrome',
    c10BenchFile: 'cold-boot.bench.ts',
    limit: 2500,
    unit: 'ms',
    workload: 'cold browser load to first contentful paint',
    env: 'browser',
    measurability: 'not-yet-measurable',
    benchPath: 'apps/bench/src/benches/cold-boot.bench.ts',
    blockedBy:
      'First paint is a browser compositor event. A Node process has no paint. ' +
      'Requires @vitest/browser (headless Chromium) or the existing Playwright ' +
      'probe tests/e2e/cold-boot.spec.ts, which DOES measure a real paint.',
    measuresInsteadToday:
      'composeRuntime() wall-time in Node — the Stage-1 runtime-composition share only. ' +
      'It excludes HTML parse, critical CSS, and the paint itself, i.e. it excludes the ' +
      'quantity NFT 1 names.',
  },
  {
    nft: 2,
    id: 'project-load-10k',
    c10Nft: 'Project-load (10k elements)',
    c10Target: '< 6 s p95',
    c10BenchFile: 'project-load.bench.ts',
    limit: 6000,
    unit: 'ms',
    workload: '10,000 elements, cold open',
    env: 'browser',
    measurability: 'not-yet-measurable',
    benchPath: 'apps/bench/src/benches/project-load.bench.ts',
    blockedBy:
      'Needs a seeded 10k-element project and a real renderer to reach "loaded". ' +
      'No seeded fixture and no GPU in the Node harness.',
    measuresInsteadToday:
      'composeRuntime() composition time with ZERO elements loaded. The bench asserts ' +
      '< 6000 ms against a workload that is not the 10k-element load C10 names.',
  },
  {
    nft: 3,
    id: 'tool-latency',
    c10Nft: 'Tool latency (click → visible)',
    c10Target: '< 50 ms p95',
    c10BenchFile: 'tool-latency.bench.ts',
    limit: 50,
    unit: 'ms',
    workload: 'pointer-down to the mutation being visible on screen',
    env: 'browser',
    measurability: 'not-yet-measurable',
    benchPath: 'apps/bench/src/benches/tool-latency.bench.ts',
    blockedBy:
      '"→ visible" is a frame-presented event. Node cannot observe presentation.',
    measuresInsteadToday:
      'CommandBus wall.create dispatch latency (handler + store patch). This is a ' +
      'genuine SUB-budget of NFT 3 and is asserted as such, but it is not NFT 3.',
  },
  {
    nft: 4,
    id: 'frame-budget',
    c10Nft: 'Frame budget (interactive viewport)',
    c10Target: '16.6 ms p95 (60 FPS)',
    c10BenchFile: 'frame-budget.bench.ts',
    limit: 16.6,
    unit: 'ms',
    workload: 'interactive viewport, camera moving',
    env: 'browser',
    measurability: 'not-yet-measurable',
    benchPath: 'apps/bench/src/benches/frame-budget.bench.ts',
    blockedBy:
      'The frame budget is GPU submit + rAF cadence. The Node bench drives ' +
      'FakeRafAdapter, which is synchronous and has no cadence at all.',
    measuresInsteadToday:
      'FrameScheduler queue-drain time with a fake rAF. It asserts only "> 0" — it has ' +
      'never had a 16.6 ms threshold.',
  },
  {
    nft: 5,
    id: 'plan-view-redraw',
    c10Nft: 'Plan-view re-render after edit',
    c10Target: '< 100 ms p95',
    c10BenchFile: 'plan-view-redraw.bench.ts',
    limit: 100,
    unit: 'ms',
    workload: 'single-element edit → plan repaint',
    env: 'browser',
    measurability: 'not-yet-measurable',
    benchPath: 'apps/bench/src/benches/plan-view-redraw.bench.ts',
    blockedBy: 'Plan view repaints onto a 2D canvas. No canvas in Node.',
    measuresInsteadToday:
      'WallStore.applyPatch → subscribeDirty notification propagation only.',
  },
  {
    nft: 6,
    id: 'sheet-view-redraw',
    c10Nft: 'Sheet-view re-render',
    c10Target: '< 200 ms p95',
    c10BenchFile: 'sheet-view-redraw.bench.ts',
    limit: 200,
    unit: 'ms',
    workload: 'sheet edit → sheet repaint',
    env: 'browser',
    measurability: 'not-yet-measurable',
    benchPath: 'apps/bench/src/benches/sheet-view-redraw.bench.ts',
    blockedBy: 'Requires React reconciliation + DOM layout.',
    measuresInsteadToday: 'Sheet Zod schema parse/serialize round-trip.',
  },
  {
    nft: 7,
    id: 'crdt-merge',
    c10Nft: 'CRDT merge (2 concurrent users)',
    c10Target: '< 80 ms p95',
    c10BenchFile: 'crdt-merge.bench.ts',
    limit: 80,
    unit: 'ms',
    workload: 'two Y.Doc replicas, concurrent edit, encodeStateAsUpdate + applyUpdate',
    env: 'node',
    measurability: 'measured',
    benchPath: 'apps/bench/src/benches/crdt-merge.bench.ts',
    baselineKey: 'crdt-merge',
  },
  {
    nft: 8,
    id: 'sync-conflict-surface',
    c10Nft: 'Sync conflict surface',
    c10Target: '< 1 s from second-user save',
    c10BenchFile: 'sync-conflict.bench.ts',
    limit: 1000,
    unit: 'ms',
    workload: 'second-user save → conflict visible to the first user',
    env: 'e2e',
    measurability: 'not-yet-measurable',
    benchPath: 'apps/bench/src/benches/sync-conflict.bench.ts',
    blockedBy:
      'C10 measures from a SAVE (a network round-trip through the sync server) to a ' +
      'SURFACED conflict (a UI event). The Node bench has neither endpoint. ' +
      'tests/e2e/conflict-resolution.spec.ts is the correct home.',
    measuresInsteadToday:
      'In-process 3-way auto-merge decision time between two local Y.Docs — ' +
      'microseconds of pure CPU, with no save and no surfacing.',
  },
  {
    nft: 9,
    id: 'ifc-import-tier1',
    c10Nft: 'IFC import (Tier-1, 50 MB)',
    c10Target: '< 30 s',
    c10BenchFile: 'ifc-import-tier1.bench.ts',
    limit: 30_000,
    unit: 'ms',
    workload: 'a 50 MB IFC STEP file, tier-1 entities',
    env: 'node',
    measurability: 'not-yet-measurable',
    benchPath: 'apps/bench/src/benches/ifc-import-tier1.bench.ts',
    blockedBy:
      'No 50 MB IFC fixture is committed, and the web-ifc WASM decode — the dominant ' +
      'cost — is not exercised. The bench uses 500 in-memory DTOs instead of a file.',
    measuresInsteadToday:
      'extractAllPsets() + Wall.parse() over 500 synthetic DTOs, asserted < 8 s. ' +
      'A different workload against a different budget.',
  },
  {
    nft: 10,
    id: 'ifc-export-tier1',
    c10Nft: 'IFC export (Tier-1, 10k elements)',
    c10Target: '< 20 s',
    c10BenchFile: 'ifc-export-tier1.bench.ts',
    limit: 20_000,
    unit: 'ms',
    workload: '10,000 elements → .ifc STEP file on disk',
    env: 'node',
    measurability: 'not-yet-measurable',
    benchPath: 'apps/bench/src/benches/ifc-export-tier1.bench.ts',
    blockedBy:
      'The bench does not call the WASM writer or write a file. It exercises 500 ' +
      'elements, not 10,000.',
    measuresInsteadToday:
      'globalIdFromUuid() + meta-store reads for 500 elements, asserted < 5 s.',
  },
  {
    nft: 11,
    id: 'bcf-roundtrip',
    c10Nft: 'BCF round-trip (issue cycle)',
    c10Target: '< 4 s',
    c10BenchFile: 'bcf-roundtrip.bench.ts',
    limit: 4000,
    unit: 'ms',
    workload: 'writeBCF → readBCF over a 50-topic archive',
    env: 'node',
    measurability: 'measured',
    benchPath: 'apps/bench/src/benches/bcf-roundtrip.bench.ts',
    baselineKey: 'bcf-roundtrip',
  },
  {
    nft: 12,
    id: 'family-load',
    c10Nft: 'Family load (medium, 200 params)',
    c10Target: '< 200 ms',
    c10BenchFile: 'family-load.bench.ts',
    limit: 200,
    unit: 'ms',
    workload: 'packFamily → loadFamilyFromBytes, medium family, 200 parameters',
    env: 'node',
    measurability: 'measured',
    benchPath: 'apps/bench/src/benches/family-load.bench.ts',
    baselineKey: 'family-load',
  },
  {
    nft: 13,
    id: 'schedule-rebuild',
    c10Nft: 'Schedule rebuild (10k rows)',
    c10Target: '< 500 ms p95',
    c10BenchFile: 'schedule-rebuild.bench.ts',
    limit: 500,
    unit: 'ms',
    workload: '10,000 schedule rows rebuilt from the element stores',
    env: 'node',
    measurability: 'measured',
    benchPath: 'apps/bench/src/benches/schedule-rebuild.bench.ts',
    baselineKey: 'schedule-rebuild',
  },
  {
    nft: 14,
    id: 'ai-critique-latency',
    c10Nft: 'AI plan-critique latency',
    c10Target: '< 8 s e2e',
    c10BenchFile: 'ai-critique.bench.ts',
    limit: 8000,
    unit: 'ms',
    workload: 'end-to-end plan critique including the LLM round-trip',
    env: 'network',
    measurability: 'not-yet-measurable',
    benchPath: 'apps/bench/src/benches/ai-critique.bench.ts',
    blockedBy:
      'C10 says "e2e", which is dominated by LLM API latency. CI has no API key and ' +
      'must not depend on a third-party SLA for a merge gate.',
    measuresInsteadToday:
      'computeCostUSD() arithmetic — sub-microsecond pure JS, asserted < 3000 ms. ' +
      'This assertion can never fail and therefore carries zero information.',
  },
  {
    nft: 15,
    id: 'bundle-size',
    c10Nft: 'Bundle size (editor app)',
    c10Target: '< 4 MB gzipped',
    c10BenchFile: 'bundle-size.bench.ts',
    limit: 4,
    unit: 'MB',
    workload: 'apps/editor production build, sum of gzipped JS assets',
    env: 'build',
    measurability: 'measured',
    benchPath: 'apps/bench/src/benches/bundle-size.bench.ts',
    blockedBy: undefined,
    measuresInsteadToday:
      'BEFORE W5-1: the gzip size of the @pryzm/schemas SOURCE barrel, with no ' +
      'threshold assertion at all. W5-1 repoints it at the real dist/ output; it ' +
      'SKIPS (never passes) when no build is present.',
    baselineKey: 'bundle-size',
  },
  {
    nft: 16,
    id: 'memory-ceiling',
    c10Nft: 'Memory ceiling (10k elements, 1 h session)',
    c10Target: '< 1.5 GB',
    c10BenchFile: 'memory-ceiling.bench.ts',
    limit: 1.5,
    unit: 'GB',
    workload: '10,000 elements held for a 1-hour session',
    env: 'browser',
    measurability: 'not-yet-measurable',
    benchPath: 'apps/bench/src/benches/memory-ceiling.bench.ts',
    blockedBy:
      'C10 names total process memory INCLUDING GPU-resident geometry and the DOM, ' +
      'over a 1-hour session. Node has neither, and no CI job runs for an hour.',
    measuresInsteadToday:
      '2,000 (not 10,000) WallStore DTOs against a 200 MB (not 1.5 GB) data-layer ' +
      'ceiling, over seconds (not an hour). Three separate deviations in one file.',
  },
  {
    nft: 17,
    id: 'plugin-sandbox-overhead',
    c10Nft: 'Plugin sandbox overhead',
    c10Target: '< 5 % CPU vs native call',
    c10BenchFile: 'plugin-sandbox-overhead.bench.ts',
    limit: 5,
    unit: 'percent',
    workload: 'sandboxed plugin call vs the equivalent in-process native call',
    env: 'browser',
    measurability: 'not-yet-measurable',
    benchPath: 'apps/bench/src/benches/plugin-sandbox-overhead.bench.ts',
    blockedBy:
      'The overhead is an iframe postMessage round-trip. Node has no iframe. ' +
      'C10 also states the budget as a RATIO (% vs native), which requires both ' +
      'legs to be measured; the bench measures neither.',
    measuresInsteadToday:
      'buildPluginCSP() / manifest parse / JSON.stringify latency asserted < 5 ms — ' +
      'note the UNIT DIFFERS from the contract (ms, not % of a native baseline).',
  },
  {
    nft: 18,
    id: 'undo-stack-memory',
    c10Nft: 'Undo stack memory (4 h session, 1000 commands)',
    c10Target: '< 50 MB rss delta',
    c10BenchFile: 'undo-stack-memory.bench.ts',
    limit: 50,
    unit: 'MB',
    workload: '1,000 commands pushed through the ring-buffer undo stack',
    env: 'node',
    measurability: 'measured',
    benchPath: 'apps/bench/src/benches/undo-stack-memory.bench.ts',
    baselineKey: 'undo-stack-memory',
  },
  {
    nft: 19,
    id: 'e2e-playwright-suite',
    c10Nft: 'E2E suite (Playwright, 10 critical flows)',
    c10Target: 'all green on every CI run',
    c10BenchFile: 'e2e-playwright-suite.spec.ts',
    limit: null,
    unit: 'boolean',
    workload: '10 critical user flows under Playwright',
    env: 'e2e',
    measurability: 'not-yet-measurable',
    benchPath: null,
    blockedBy:
      'The file C10 names — e2e-playwright-suite.spec.ts — DOES NOT EXIST anywhere ' +
      'in the repo. tests/e2e/ holds 14 individual specs that are not aggregated ' +
      'into the named suite, and `npx playwright test` is not wired into CI.',
  },
];

/** Every NFT whose bench may legitimately assert C10's budget today. */
export const MEASURED_NFTS: readonly NftTarget[] = NFT_TARGETS.filter(
  (t) => t.measurability === 'measured',
);

/** Every NFT that CANNOT be measured against C10's own quantity today. */
export const NOT_YET_MEASURABLE_NFTS: readonly NftTarget[] = NFT_TARGETS.filter(
  (t) => t.measurability === 'not-yet-measurable',
);

/** Look up a row by its C10 §1 number. Throws rather than returning undefined. */
export function nft(n: number): NftTarget {
  const found = NFT_TARGETS.find((t) => t.nft === n);
  if (!found) throw new Error(`No NFT row ${n} — C10 §1 defines 1..${NFT_TARGETS.length}`);
  return found;
}

/**
 * The numeric budget for an NFT, in its contract unit.
 *
 * Throws for a `not-yet-measurable` NFT. This is deliberate: it makes it
 * impossible for a proxy bench to quietly assert the contract's number
 * against a quantity the contract does not name.
 */
export function nftLimit(n: number): number {
  const t = nft(n);
  if (t.measurability !== 'measured') {
    throw new Error(
      `NFT ${n} (${t.c10Nft}) is NOT-YET-MEASURABLE — ${t.blockedBy}\n` +
        `Refusing to hand out the C10 budget "${t.c10Target}" to a proxy measurement.`,
    );
  }
  if (t.limit === null) throw new Error(`NFT ${n} has no numeric budget.`);
  return t.limit;
}

/** Convenience: flatten baseline keys (single | array | absent) to a flat list. */
export function flattenBaselineKeys(targets: readonly NftTarget[]): string[] {
  const out: string[] = [];
  for (const t of targets) {
    if (!t.baselineKey) continue;
    if (typeof t.baselineKey === 'string') out.push(t.baselineKey);
    else out.push(...t.baselineKey);
  }
  return out;
}

/** K3-F threshold (> 10 % slip on any NFT target halts forward 3D work). */
export const K3F_REGRESSION_THRESHOLD_PCT = 10;

/**
 * R2 ratchet baseline — NFT benches EXECUTED in CI.
 *
 * ## Dated justification — 2026-08-11
 *
 * Before W5-1 the number was **0 of 19**. `grep -rn "bench" .github/workflows/`
 * returned zero matches: no workflow has ever invoked `apps/bench`. C10 §4 lists
 * "All 17 NFT benches pass" as a MERGE BLOCKER, so for the entire life of that
 * clause the gate has been asserting a fact nobody checked. Worse, running the
 * suite locally for the first time on 2026-08-11 returned **20 failed files of
 * 77** — including NFT 1, 2 and 12, which fail at MODULE LOAD (`DOMMatrix is not
 * defined`, from pdfjs-dist reached through @pryzm/file-format under
 * `environment: 'node'`), and NFT 18, which used `bench()` under `vitest run` and
 * therefore raised "`bench()` is only available in benchmark mode" without ever
 * executing a line of its body. Had the suite ever run in CI, none of that could
 * have survived a single merge.
 *
 * The ratchet counts NFTs whose bench EXECUTES in CI — not NFTs that pass, and
 * not NFTs that measure the right quantity. Those are three different axes and
 * conflating them is how the previous "17 benches pass" claim came to be false.
 * Execution is the weakest of the three and therefore the honest first rung.
 *
 * Shrink-only in the inverted sense: this count may only RISE. Lowering it
 * requires an ADR, because the only way it falls is a bench being removed from
 * CI, which is exactly the regression the ratchet exists to catch.
 *
 * ## Baseline raised 0 → 16 (2026-08-11, W5-1)
 *
 * Measured by `apps/bench/scripts/nft-ci.ts`, the same script the CI job runs:
 *
 *     EXECUTED 16/19
 *
 * The three that do NOT execute, and why — none is padded into the count:
 *
 *   * **NFT 1 cold-boot** and **NFT 2 project-load** — fail at MODULE LOAD with
 *     `ReferenceError: window is not defined`, thrown by `ConstraintEngineImpl`'s
 *     constructor (`packages/constraint-solver/src/ConstraintEngine.ts:109`),
 *     reached through `@pryzm/ai-host` → `LayoutGenerator` →
 *     `@pryzm/editor/bootstrap.everything`. This is a SECOND module-load blocker
 *     behind the `DOMMatrix` one that `apps/bench/vitest.setup.ts` repairs.
 *     It was deliberately NOT stubbed: unlike the inert `DOMMatrix` placeholder,
 *     a `window` global sits ON the timed path for these two benches and would
 *     push `composeRuntime()` down browser branches with no real DOM behind
 *     them — turning a crash into a plausible-looking wrong number. A loud
 *     failure is the correct output. The durable fix is upstream (constraint-
 *     solver must not touch `window` in a constructor) and is outside W5-1's
 *     file ownership.
 *   * **NFT 19 e2e-playwright-suite** — the file C10 §1 names does not exist
 *     anywhere in the repo. Nothing to execute.
 *
 * ⚠ MEASURED LOCALLY (win32), not yet on a CI runner — the `nft-bench` job had
 * never run when this number was set. It lands ADVISORY precisely so a runner
 * that disagrees REPORTS rather than blocks. Confirm against the first green CI
 * run and correct this constant if ubuntu differs.
 */
export const R2_NFT_EXECUTED_IN_CI_BASELINE = 16;
