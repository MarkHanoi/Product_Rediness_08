// §BLOCK-DISSOLVE-AUDIT (L-676) — the committed, re-runnable measurement that CLOSES Barcelona
// CLOSURE-REGISTER row 4 ("Block dissolve fails on real Eixample parcels").
//
// ─────────────────────────────────────────────────────────────────────────────────────────────
// WHY THIS EXISTS AS A `tools/` PROGRAM AND NOT A `scratchpad/` PROBE
// ─────────────────────────────────────────────────────────────────────────────────────────────
// Row 4's closing criterion is written into the register: *"Measure >=100 random Eixample blocks:
// success / failure / FAILURE REASON. Clustered => engineering bug; random => robustness."* The
// L-539 acceptance probe (`scratchpad/probe-dissolve-accept.mts`) measured the RATE but not the
// two things the row actually turns on:
//
//   1. **The SIGN.** The register calls row 4 *"the only remaining item that can make an
//      ALREADY-PUBLISHED number wrong"*. That premise needs testing, not repeating. A dissolve
//      FAILURE cannot make a published number wrong — `siteDispatch.ts:4307` turns it into
//      `refuseConstructionIncomplete('block-dissolve-refused')` and publishes NOTHING. The only
//      channel that can publish a wrong number is a dissolve that **SUCCEEDS on the wrong ring**.
//      So this tool measures the successes against an independent oracle (the published cadastral
//      areas, a number the dissolve never sees) as its PRIMARY output, and the failure rate second.
//   2. **Clustered vs random, decided by MECHANISM rather than by a statistic with no power.**
//      At Barcelona's measured failure count a spatial permutation test cannot distinguish the two
//      hypotheses (see §CLUSTERING below, which reports its own power and refuses to over-read).
//      What DOES separate them is a per-failure tolerance sweep: a block that closes at a WIDER
//      tolerance is a tolerance-tail robustness case; one that closes at NO tolerance is a
//      structural property of the INPUT (two blocks under one 5-char *manzana* prefix, a genuine
//      cadastral gap, or overlapping parcels), which no engineering change to the dissolve fixes.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────
// WHAT IT RUNS AGAINST — AND WHY THAT IS NOT A WEAKER SAMPLE THAN "100 RANDOM"
// ─────────────────────────────────────────────────────────────────────────────────────────────
// `scratchpad/dissolve-sample.json` (git-tracked, frozen 2026-07-21 from the live Catastro INSPIRE
// WFS): 956 COMPLETE *manzanas* across 5 cities, each parcel carrying its PUBLISHED cadastral
// `areaM2`. Barcelona contributes two disjoint sample areas — `Barcelona` (Eixample/Dreta, 108
// manzanas) and `Barcelona-old` (Ciutat Vella, 77).
//
// It is a **census of every complete manzana inside the sampled bboxes**, not a random draw. For
// the clustered-vs-random question that is STRONGER, not weaker: a random sample of 100 could miss
// a cluster entirely, whereas a census inside a bbox sees every member of any cluster it contains.
// ⚠ The honest limit, stated rather than hidden: it is geographically BOUNDED. It cannot rule out a
// cluster in an Eixample bbox that was never sampled. `--city` + a re-fetch
// (`scratchpad/probe-dissolve-fetch.mts`) is how that would be extended.
//
// A manzana straddling a bbox edge arrives TRUNCATED from a WFS bbox query, and dissolving a
// truncated manzana fails for a reason that is the SAMPLE's, not the cadastre's. The corpus already
// excludes those (~13 m margin) — so this tool inherits that exclusion and does not re-litigate it.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────
// IT CANNOT DISAGREE WITH PRODUCTION
// ─────────────────────────────────────────────────────────────────────────────────────────────
// It imports the PRODUCTION dissolve (`packages/site-parcel-data/src/geometry/blockRing.ts`) — the
// same function `siteDispatch.ts:4306` calls — and the same equirectangular projection the probes
// use. No re-implementation, so a green audit is a statement about the shipped path.
//
// PURE + deterministic. The permutation test is seeded, so two runs on one corpus agree byte for
// byte and a regression is a diff.
//
// Run:
//   npx tsx tools/block-dissolve-audit/audit.mts                     # Barcelona Eixample (row 4)
//   npx tsx tools/block-dissolve-audit/audit.mts --city Barcelona-old
//   npx tsx tools/block-dissolve-audit/audit.mts --city all
//   npx tsx tools/block-dissolve-audit/audit.mts --json
//
// Authority: C58 §1.1/§1.7a (§CONTEXT-DATA-HONESTY — `null` is UNKNOWN, never 0) · C63 §3 Axis 4 ·
// C19 §7.3 (the 200-vertex budget) · ADR-0271 (Art. 242.2 depth, the consumer) · ADR-0274
// (tolerant dissolve) · `docs/04-reference/jurisdictions/es/SPAIN-DISSOLVE-FAILURE-TAXONOMY.md`.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dissolveParcelsToBlockRing } from '../../packages/site-parcel-data/src/geometry/blockRing.js';
import type { Pt } from '@pryzm/schemas';

// ─────────────────────────────────────────────────────────────────────────────────────────────
// CONSTANTS — every threshold named, with its provenance, so none of them is a magic number.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** Earth radius (m) + degrees→radians, for the equirectangular projection about the first vertex. */
const R_EARTH_M = 6_378_137;
const DEG = Math.PI / 180;

/**
 * The tolerance ladder swept per FAILING block to decide tolerance-tail vs structural.
 * `0.1` is the SHIPPED `TJUNCTION_SPLIT_TOLERANCE_M` (ADR-0274, derived from Catastro's own
 * 1e-6-degree publication grid = 0.111 m north). Everything above it is DIAGNOSTIC ONLY — this tool
 * never proposes raising the shipped tolerance, because the taxonomy measured the success curve
 * already flat at 0.10 and FALLING by 0.30 (over-splitting destroys rings).
 */
const TOLERANCE_SWEEP_M = [0.1, 0.15, 0.2, 0.3, 0.5, 1.0] as const;

/**
 * The area-oracle alarm. A ring that closed around the WRONG loop, or swallowed a neighbouring
 * block, misses the published cadastral area by TENS of percent; the measured honest population sits
 * near 0.15 %. 2 % is an order of magnitude above the honest population and an order of magnitude
 * below a wrong-loop failure — i.e. it sits in the empty space between them, which is the only place
 * a threshold is defensible. Anything flagged here is listed individually, never just counted.
 *
 * ⚠ §NET-OF-VOIDS — A MEASUREMENT BUG THIS TOOL MADE FIRST, RECORDED SO IT IS NOT REMADE.
 * The oracle's first draft (and `scratchpad/probe-dissolve-accept.mts`, which has the same defect)
 * compared the OUTER ring area with Σ published parcel areas and ignored `BlockRingResult.voids`.
 * A block with a real interior courtyard that is not itself a parcel then reads as an over-statement
 * of exactly the courtyard's size. Ciutat Vella `12215` was flagged at **2.34 %** by that draft and
 * is at **0.20 %** once its 101.9 m² courtyard is subtracted — i.e. the tool's own first verdict for
 * Ciutat Vella was `OVER-STATES`, and it was an artefact of the ORACLE, not a defect in the dissolve.
 * The comparison is therefore `|outer| − Σ|voids|` vs Σ published areas. Same register lesson, one
 * level down: **establish the sign before ranking the severity** — including the sign your own
 * instrument reports.
 */
const AREA_ORACLE_ALARM_FRACTION = 0.02;

/** C19 §7.3 — rings above this hard-reject downstream. Counted so a "success" that cannot be USED is visible. */
const VERTEX_BUDGET_HARD_REJECT = 200;

/** Permutation-test resolution + seed. Fixed so the p-value is reproducible, not resampled per run. */
const PERMUTATIONS = 2000;
const PERMUTATION_SEED = 0x5eed_4a17;

/**
 * Minimum failures below which the spatial permutation test is NOT reported as evidence. With k
 * failures the test's power against anything but an extreme cluster is negligible; printing a
 * p-value from k=4 and reading "not clustered" off it would be the §CONTEXT-DATA-HONESTY collapse in
 * statistical clothing (absence of a detection reported as a detection of absence). Below this the
 * tool prints `INSUFFICIENT-POWER` and defers to the per-failure mechanism classification, which is
 * a census of the failures and therefore has no power problem at all.
 */
const CLUSTER_TEST_MIN_FAILURES = 8;

// ─────────────────────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────────────────────

interface CorpusParcel { readonly refcat: string; readonly ring: ReadonlyArray<{ lat: number; lon: number }>; readonly areaM2: number }
interface CorpusManzana { readonly city: string; readonly manzana: string; readonly parcels: ReadonlyArray<CorpusParcel> }

/**
 * Why a block failed, in terms of what a FIX would have to change. This is the axis row 4 asks
 * about — "clustered ⇒ engineering bug" means the failures share a mechanism PRYZM owns.
 */
export type FailureMechanism =
    /** Closes at a wider tolerance ⇒ the shipped 0.1 m tolerance's tail. PRYZM-side, robustness. */
    | 'tolerance-tail'
    /** Two or more SIDE-BY-SIDE perimeter loops ⇒ the 5-char refcat prefix collected two real
     *  blocks. A *prefix* defect in block IDENTITY, not a geometry defect; the dissolve is right to
     *  refuse, because there is no single ring to produce. */
    | 'disjoint-blocks-under-one-prefix'
    /** An edge shared by 3+ parcels ⇒ the published parcels OVERLAP. A cadastral input defect; the
     *  dissolve deliberately never repairs it (repair would make a fiction closable). */
    | 'non-manifold-input'
    /** Closes at NO tolerance up to 1.0 m and is not disjoint/non-manifold ⇒ a genuine gap or a
     *  defect in the published tiling. Not reachable by any change to the dissolve. */
    | 'structural-input-defect'
    /** A parcel with < 3 vertices, or fewer than 2 parcels — malformed input, refused up front. */
    | 'malformed-input';

interface BlockOutcome {
    readonly city: string;
    readonly manzana: string;
    readonly parcelCount: number;
    readonly lat: number;
    readonly lon: number;
    /** Σ of the PUBLISHED cadastral parcel areas — the oracle. `null` when the corpus lacks them. */
    readonly cadastralAreaM2: number | null;
    readonly ok: boolean;
    readonly reason: string | null;
    readonly path: 'exact' | 't-junction-split' | null;
    readonly vertexCount: number | null;
    /** Number of interior courtyard loops the dissolve returned (`voids`), subtracted by the oracle. */
    readonly voidCount: number | null;
    /** |(outerArea − Σ voidArea) − cadastralArea| / cadastralArea. `null` = UNKNOWN (no oracle), NEVER 0. */
    readonly areaErrorFraction: number | null;
    /** Failure only: the mechanism, and the tolerance at which it would have closed (`null` = never). */
    readonly mechanism: FailureMechanism | null;
    readonly closesAtToleranceM: number | null;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// PURE HELPERS
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** Equirectangular projection about a block's first vertex — the probes' projection, unchanged. */
function projectBlock(m: CorpusManzana): { rings: Pt[][]; lat0: number; lon0: number } {
    const lat0 = m.parcels[0]!.ring[0]!.lat;
    const lon0 = m.parcels[0]!.ring[0]!.lon;
    const cosLat = Math.cos(lat0 * DEG);
    const rings = m.parcels.map((p) => p.ring.map((v) => ({
        x: (v.lon - lon0) * DEG * R_EARTH_M * cosLat,
        z: -((v.lat - lat0) * DEG * R_EARTH_M),
    })));
    return { rings, lat0, lon0 };
}

/** Shoelace area of a closed ring, m². */
function ringArea(ring: ReadonlyArray<Pt>): number {
    let a = 0;
    for (let i = 0; i < ring.length; i++) {
        const p = ring[i]!;
        const q = ring[(i + 1) % ring.length]!;
        a += p.x * q.z - q.x * p.z;
    }
    return Math.abs(a / 2);
}

/**
 * Quantiles by the nearest-rank convention. Returns `null` for an EMPTY input rather than NaN or 0 —
 * "there were no measurements" and "the measurement was zero" are different facts (C58 §1.7a).
 */
function quantiles(values: readonly number[], qs: readonly number[]): Array<number | null> {
    if (values.length === 0) return qs.map(() => null);
    const s = [...values].sort((a, b) => a - b);
    return qs.map((q) => s[Math.min(s.length - 1, Math.floor(q * s.length))]!);
}

/** A tiny deterministic PRNG (mulberry32) — a seeded permutation test is reproducible; Math.random is not. */
function mulberry32(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * Classify a FAILING block by the mechanism a fix would have to address.
 *
 * The order is most-decisive-first and every branch is a MEASUREMENT, not an inference:
 *   `non-manifold` / `malformed-parcel` are reported by the dissolve itself; the tolerance sweep is
 *   run; and disjointness is decided by re-running with the repair DISABLED and checking whether the
 *   parcels split into spatially separated groups (a side-by-side pair has two bounding boxes that
 *   do not overlap, whereas the hair-loop artefact is strictly NESTED inside the outline).
 */
function classifyFailure(rings: Pt[][], reason: string | null): { mechanism: FailureMechanism; closesAtToleranceM: number | null } {
    if (reason === 'non-manifold') return { mechanism: 'non-manifold-input', closesAtToleranceM: null };
    if (reason === 'malformed-parcel' || reason === 'too-few-parcels') {
        return { mechanism: 'malformed-input', closesAtToleranceM: null };
    }
    for (const tol of TOLERANCE_SWEEP_M) {
        const r = dissolveParcelsToBlockRing(rings, { tJunctionTolerance_m: tol });
        if (!r.degenerate) {
            // It closed above the shipped tolerance ⇒ the shipped tolerance's tail.
            return { mechanism: 'tolerance-tail', closesAtToleranceM: tol };
        }
    }
    // It closes at NO tolerance. Two structural sub-cases, separated by whether the parcels form
    // spatially DISJOINT groups (two real blocks under one 5-char prefix) or one connected mass
    // with a defect inside it.
    return {
        mechanism: parcelsAreSpatiallyDisjoint(rings) ? 'disjoint-blocks-under-one-prefix' : 'structural-input-defect',
        closesAtToleranceM: null,
    };
}

/**
 * Do the parcels fall into ≥2 groups whose bounding boxes do not touch? Union-find over
 * bbox-overlap (inflated by the shipped tolerance so a shared boundary always links). This is a
 * deliberately CONSERVATIVE test: it only ever reports "disjoint" when there is clear air between
 * the groups, so it cannot mislabel a connected block with an internal gap.
 */
function parcelsAreSpatiallyDisjoint(rings: ReadonlyArray<ReadonlyArray<Pt>>): boolean {
    const PAD = 0.5; // metres of clear air required — well above Catastro's 0.111 m quantum.
    const boxes = rings.map((r) => {
        let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
        for (const p of r) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z); }
        return { x0, x1, z0, z1 };
    });
    const parent = boxes.map((_, i) => i);
    const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
    for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
            const a = boxes[i]!, b = boxes[j]!;
            const overlaps = a.x0 - PAD <= b.x1 && b.x0 - PAD <= a.x1 && a.z0 - PAD <= b.z1 && b.z0 - PAD <= a.z1;
            if (overlaps) parent[find(i)] = find(j);
        }
    }
    return new Set(boxes.map((_, i) => find(i))).size > 1;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// THE MEASUREMENT
// ─────────────────────────────────────────────────────────────────────────────────────────────

export function auditBlocks(manzanas: readonly CorpusManzana[]): BlockOutcome[] {
    return manzanas.map((m): BlockOutcome => {
        const { rings, lat0, lon0 } = projectBlock(m);
        const cadastralAreaM2 = m.parcels.every((p) => Number.isFinite(p.areaM2))
            ? m.parcels.reduce((s, p) => s + p.areaM2, 0)
            : null;
        const d = dissolveParcelsToBlockRing(rings);
        const base = {
            city: m.city, manzana: m.manzana, parcelCount: m.parcels.length, lat: lat0, lon: lon0, cadastralAreaM2,
        };
        if (d.degenerate) {
            const { mechanism, closesAtToleranceM } = classifyFailure(rings, d.reason);
            return {
                ...base, ok: false, reason: d.reason, path: null, vertexCount: null, voidCount: null,
                areaErrorFraction: null, mechanism, closesAtToleranceM,
            };
        }
        // §NET-OF-VOIDS — the block's NET built area is the outline minus its interior courtyards.
        const netAreaM2 = ringArea(d.ring) - d.voids.reduce((s, v) => s + ringArea(v), 0);
        return {
            ...base, ok: true, reason: null, path: d.quality.path, vertexCount: d.ring.length,
            voidCount: d.voids.length,
            // `null` (not 0) when there is no oracle to compare against — an unmeasurable ring is
            // UNKNOWN, and folding it in as a perfect 0 % error would fabricate agreement.
            areaErrorFraction: cadastralAreaM2 && cadastralAreaM2 > 0
                ? Math.abs(netAreaM2 - cadastralAreaM2) / cadastralAreaM2
                : null,
            mechanism: null, closesAtToleranceM: null,
        };
    });
}

/**
 * §CLUSTERING — are the failures spatially clustered relative to the blocks that were measured?
 *
 * Statistic: mean nearest-neighbour distance WITHIN the failing set. Null distribution: the same
 * statistic over `PERMUTATIONS` random subsets of the SAME SIZE drawn from the measured population,
 * so the test conditions on the population's own geography and cannot mistake the bbox's shape for
 * a cluster. A clustered set has a SMALL mean-NN distance, so p = P(null ≤ observed), one-tailed.
 *
 * Returns `verdict: 'INSUFFICIENT-POWER'` below `CLUSTER_TEST_MIN_FAILURES`, with `p: null`.
 */
export function clusterTest(outcomes: readonly BlockOutcome[]): {
    verdict: 'clustered' | 'not-distinguishable-from-random' | 'INSUFFICIENT-POWER';
    p: number | null; k: number; n: number;
} {
    const fails = outcomes.filter((o) => !o.ok);
    const n = outcomes.length, k = fails.length;
    if (k < CLUSTER_TEST_MIN_FAILURES) return { verdict: 'INSUFFICIENT-POWER', p: null, k, n };
    const pts = outcomes.map((o) => ({ x: o.lon * Math.cos(o.lat * DEG), y: o.lat }));
    const meanNN = (idx: readonly number[]): number => {
        let s = 0;
        for (const i of idx) {
            let best = Infinity;
            for (const j of idx) {
                if (i === j) continue;
                const dx = pts[i]!.x - pts[j]!.x, dy = pts[i]!.y - pts[j]!.y;
                best = Math.min(best, dx * dx + dy * dy);
            }
            s += Math.sqrt(best);
        }
        return s / idx.length;
    };
    const failIdx = outcomes.map((o, i) => [o, i] as const).filter(([o]) => !o.ok).map(([, i]) => i);
    const observed = meanNN(failIdx);
    const rnd = mulberry32(PERMUTATION_SEED);
    let atLeastAsExtreme = 0;
    for (let t = 0; t < PERMUTATIONS; t++) {
        const pool = outcomes.map((_, i) => i);
        for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [pool[i], pool[j]] = [pool[j]!, pool[i]!]; }
        if (meanNN(pool.slice(0, k)) <= observed) atLeastAsExtreme++;
    }
    const p = (atLeastAsExtreme + 1) / (PERMUTATIONS + 1);
    return { verdict: p < 0.05 ? 'clustered' : 'not-distinguishable-from-random', p, k, n };
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// CLI
// ─────────────────────────────────────────────────────────────────────────────────────────────

const CORPUS_URL = new URL('../../scratchpad/dissolve-sample.json', import.meta.url);

function main(argv: readonly string[]): void {
    const cityArg = (() => {
        const i = argv.indexOf('--city');
        return i >= 0 && argv[i + 1] ? argv[i + 1]! : 'Barcelona';
    })();
    const asJson = argv.includes('--json');

    const raw = JSON.parse(readFileSync(CORPUS_URL, 'utf8')) as { manzanas: CorpusManzana[] };
    const selected = cityArg === 'all'
        ? raw.manzanas
        : raw.manzanas.filter((m) => m.city.toLowerCase() === cityArg.toLowerCase());

    if (selected.length === 0) {
        const cities = [...new Set(raw.manzanas.map((m) => m.city))].sort();
        console.error(`No manzanas for --city ${cityArg}. Available: ${cities.join(', ')}, all`);
        process.exitCode = 1;
        return;
    }

    const outcomes = auditBlocks(selected);
    const ok = outcomes.filter((o) => o.ok);
    const fails = outcomes.filter((o) => !o.ok);
    const cluster = clusterTest(outcomes);

    const errs = ok.map((o) => o.areaErrorFraction).filter((v): v is number => v !== null);
    const [p50, p90, p95, max] = quantiles(errs, [0.5, 0.9, 0.95, 1]);
    const alarms = ok.filter((o) => o.areaErrorFraction !== null && o.areaErrorFraction > AREA_ORACLE_ALARM_FRACTION);
    const overBudget = ok.filter((o) => (o.vertexCount ?? 0) > VERTEX_BUDGET_HARD_REJECT);

    // ── THE SIGN, COMPUTED — not asserted. ────────────────────────────────────────────────────
    // A FAILURE publishes nothing (siteDispatch.ts:4307 `refuseConstructionIncomplete`) ⇒ the
    // envelope is absent, never inflated ⇒ omitting the block UNDER-states. The ONLY over-statement
    // channel is a SUCCESS whose ring disagrees with the published cadastral area. So the sign is
    // decided by `alarms`, and by nothing else.
    const sign = alarms.length > 0 ? 'OVER-STATES' : 'UNDER-STATES (failures publish nothing)';

    if (asJson) {
        console.log(JSON.stringify({
            city: cityArg, n: outcomes.length, ok: ok.length, failed: fails.length,
            successRate: ok.length / outcomes.length,
            areaOracle: { n: errs.length, p50, p90, p95, max, alarmThreshold: AREA_ORACLE_ALARM_FRACTION, alarms: alarms.map((a) => ({ manzana: a.manzana, areaErrorFraction: a.areaErrorFraction })) },
            vertexBudget: { hardReject: VERTEX_BUDGET_HARD_REJECT, over: overBudget.map((o) => ({ manzana: o.manzana, vertexCount: o.vertexCount })) },
            cluster, sign, failures: fails,
        }, null, 2));
        return;
    }

    const pctOf = (n: number, d: number) => (d ? `${((n / d) * 100).toFixed(1)}%` : '—');
    const fmtPct = (v: number | null) => (v === null ? 'UNKNOWN' : `${(v * 100).toFixed(2)}%`);

    console.log(`\n§BLOCK-DISSOLVE-AUDIT — ${cityArg}  (corpus: scratchpad/dissolve-sample.json, frozen 2026-07-21)`);
    console.log(`  blocks measured : ${outcomes.length}   parcels: ${selected.reduce((s, m) => s + m.parcels.length, 0)}`);
    console.log(`  dissolved       : ${ok.length} (${pctOf(ok.length, outcomes.length)})   exact=${ok.filter((o) => o.path === 'exact').length} · t-junction-split=${ok.filter((o) => o.path === 't-junction-split').length}`);
    console.log(`  refused         : ${fails.length} (${pctOf(fails.length, outcomes.length)})`);

    console.log(`\n  ── FAILURE REASON (the dissolve's own code) ──`);
    const byReason = new Map<string, number>();
    for (const f of fails) byReason.set(String(f.reason), (byReason.get(String(f.reason)) ?? 0) + 1);
    if (byReason.size === 0) console.log('    (none)');
    for (const [k, n] of [...byReason].sort((a, b) => b[1] - a[1])) console.log(`    ${k.padEnd(28)} ${n}`);

    console.log(`\n  ── FAILURE MECHANISM (what a fix would have to change) ──`);
    const byMech = new Map<string, number>();
    for (const f of fails) byMech.set(String(f.mechanism), (byMech.get(String(f.mechanism)) ?? 0) + 1);
    if (byMech.size === 0) console.log('    (none)');
    for (const [k, n] of [...byMech].sort((a, b) => b[1] - a[1])) console.log(`    ${k.padEnd(36)} ${n}`);
    for (const f of fails) {
        console.log(`      · ${f.manzana}  parcels=${String(f.parcelCount).padStart(3)}  reason=${f.reason}  mechanism=${f.mechanism}  closesAt=${f.closesAtToleranceM === null ? 'NEVER (≤1.0 m)' : `${f.closesAtToleranceM} m`}  @ ${f.lat.toFixed(5)},${f.lon.toFixed(5)}`);
    }

    console.log(`\n  ── §CLUSTERING (seeded permutation, ${PERMUTATIONS} draws) ──`);
    console.log(`    verdict: ${cluster.verdict}   k=${cluster.k}/${cluster.n}   p=${cluster.p === null ? 'null (not computed)' : cluster.p.toFixed(4)}`);
    if (cluster.verdict === 'INSUFFICIENT-POWER') {
        console.log(`    ⚠ k < ${CLUSTER_TEST_MIN_FAILURES}: a spatial test here would have no power, and reporting`);
        console.log(`      "not clustered" from it would be absence-of-detection dressed as detection-of-absence.`);
        console.log(`      The MECHANISM census above answers the same question without a power problem.`);
    }

    console.log(`\n  ── AREA ORACLE — (ring − voids) vs Σ PUBLISHED cadastral parcel areas (the dissolve never sees it) ──`);
    console.log(`    n=${errs.length}${errs.length < ok.length ? ` (${ok.length - errs.length} rings have NO oracle ⇒ UNKNOWN, excluded — never scored 0)` : ''}   rings carrying an interior courtyard: ${ok.filter((o) => (o.voidCount ?? 0) > 0).length}`);
    console.log(`    p50=${fmtPct(p50)}  p90=${fmtPct(p90)}  p95=${fmtPct(p95)}  max=${fmtPct(max)}`);
    console.log(`    alarms (> ${(AREA_ORACLE_ALARM_FRACTION * 100).toFixed(0)}%): ${alarms.length}`);
    for (const a of alarms) console.log(`      ⚠ ${a.manzana}  ${fmtPct(a.areaErrorFraction)}  (${a.parcelCount} parcels, ${a.path}, ${a.voidCount} voids)`);

    console.log(`\n  ── C19 §7.3 VERTEX BUDGET ──`);
    console.log(`    rings > ${VERTEX_BUDGET_HARD_REJECT} verts (dissolve succeeds, downstream hard-rejects): ${overBudget.length}`);
    for (const o of overBudget) console.log(`      ⚠ ${o.manzana}  ${o.vertexCount} verts  (${o.path})`);

    console.log(`\n  ── THE SIGN ──`);
    console.log(`    ${sign}`);
    console.log(`    A refused dissolve reaches refuseConstructionIncomplete('block-dissolve-refused')`);
    console.log(`    (apps/editor/src/ui/site/siteDispatch.ts:4307) and publishes NO envelope. The only`);
    console.log(`    way row 4 could make an ALREADY-PUBLISHED number wrong is an area-oracle alarm above.\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    main(process.argv.slice(2));
}
