// ─── CE-02 — the Geometry axis, scored from an EXECUTED headless build ───────
//
// BIM30-IMPLEMENTATION-ROADMAP Phase 9 measurable exit condition: "the Geometry
// axis scored from an executed headless fragment build". §3 link 4: an axis
// with no subject cannot exit 0 or 1. This suite is that subject.
//
// §4.6 — VITEST'S EXIT CODE IS NOT THE VERDICT. This suite uses `expect.soft`
// so the whole table prints; a red `it` is a MEASURED DIVERGENCE, a finding, not
// breakage. `certify.ts` grades the ARTEFACT against floors, in the order
// MISCONFIGURED (2) -> RATCHET (3) -> DECLARED (1) -> CLEAN (0).
//
// §4.4 — THE DELIBERATE-BREAKAGE PROOF. Set PRYZM_CERT_EMPTY_WORLD=1 and the
// suite skips seeding entirely, builds over nothing, and the artefact it writes
// MUST fail the floors and exit 2. That is the empty-seed incident reproduced on
// purpose, and it is the whole reason this file may be believed.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { World } from '../world';
import { seedBuilding30, type Building30Outcome } from '../seedBuilding30';
import {
  buildHeadlessGeometry, runOffsetOracle, runNegativeControl,
  GEOMETRY_UNPROVEN, type HeadlessBuildResult, type OracleResult, type NegativeControl,
} from '../headlessGeometry';
import { finishRow, writeResults, type CertRow } from '../report';

// §4.4 — the deliberately EMPTY world. Not a debug switch: the harness must be
// PROVEN unable to score well over nothing before any score it prints is worth
// reading.
const EMPTY_WORLD = process.env.PRYZM_CERT_EMPTY_WORLD === '1';

let world: World;
let seeded: Building30Outcome | null = null;
let build: HeadlessBuildResult;
let oracle: OracleResult;
let negative: { arms: NegativeControl[]; blind: boolean };
const rows: CertRow[] = [];
let seedError = '';

beforeAll(async () => {
  const { buildWorld } = await import('../world');
  world = await buildWorld();

  if (EMPTY_WORLD) {
    console.log('\n⚠ PRYZM_CERT_EMPTY_WORLD=1 — SEEDING IS SKIPPED ON PURPOSE (§4.4).');
    console.log('  The harness must exit 2 over this world, not score well. If it scores well,');
    console.log('  the floors are decorative and every other verdict this suite prints is void.');
  } else {
    try {
      seeded = await seedBuilding30(world);
    } catch (e) {
      seedError = String(e).slice(0, 500);
    }
  }

  // The build runs EITHER WAY. Over an empty world it must honestly produce
  // nothing — an empty build that reported meshes would be the more alarming
  // result, and running it is how we find that out.
  build = await buildHeadlessGeometry(world);
  oracle = await runOffsetOracle(seeded?.roofOverhang ?? 0.3);
  negative = await runNegativeControl();
}, 600_000);

const UNPROVEN_COLLAB =
  'UNPROVEN — no transport deployed; collaboration is UNPROVEN BY CONSTRUCTION (§5.1), ' +
  'which caps every row in this harness at PARTIALLY VERIFIED. A founder decision, not engineering work.';

describe('CE-02 — Geometry axis, executed headless fragment build', () => {
  it('§4.3 NEGATIVE CONTROL — the comparator is proven SIGHTED before any verdict is trusted', () => {
    console.log('\n── §4.3 IN-RUN NEGATIVE CONTROL ' + '─'.repeat(40));
    for (const a of negative.arms) {
      console.log(`   ${a.sighted ? '✓' : '❌'} ${a.arm}: ${a.expectation}`);
      console.log(`        observed: ${a.observed}`);
    }
    if (negative.blind) {
      console.log('\n   ❌ BLIND COMPARATOR — countGeometry called a planted defect clean.');
      console.log('      Per §4.3 EVERY verdict this run produced is INVALIDATED, not downgraded:');
      console.log('      they were all produced by the instrument that just failed to see a defect.');
      console.log('      certify.ts must exit 2 on this artefact.');
    } else {
      console.log(`   → comparator SIGHTED on ${negative.arms.length}/${negative.arms.length} planted defects.`);
    }
    expect.soft(negative.blind, 'blind comparator — every verdict this run is INVALID').toBe(false);
  });

  it('establishes its subject — the canonical world seeds through REAL commands', () => {
    console.log('\n── SUBJECT: seedBuilding30 (§1.2 canonical world) ' + '─'.repeat(20));
    if (EMPTY_WORLD) {
      console.log('   (empty-world run — nothing was seeded, on purpose)');
      expect.soft(seeded, 'empty-world run must have no seed outcome').toBe(null);
      return;
    }
    if (seedError) console.log(`   ❌ SEED THREW: ${seedError}`);
    console.log('   per-kind seeding outcome (a refusal is EVIDENCE, never a blank):');
    for (const [k, v] of Object.entries(seeded?.seedOutcomes ?? {})) {
      console.log(`     ${v.startsWith('SEEDED') ? '✓' : '❌'} ${k}: ${v}`);
    }
    console.log('   declared target vs measured — a zero against a declared target is a FINDING (§1.2.1):');
    for (const t of seeded?.targetReadings ?? []) {
      const ok = t.measured >= t.target;
      console.log(`     ${ok ? '✓' : '❌'} ${t.family}: measured ${t.measured} / target ${t.target}`);
    }
    expect.soft(seedError, 'the seed must not throw').toBe('');
  });

  it('EXECUTES a headless fragment build and scores the Geometry axis per family', () => {
    console.log('\n── EXECUTED HEADLESS FRAGMENT BUILD ' + '─'.repeat(35));
    console.log(`   frames pumped to drain the P3 frame bus: ${build.framesPumped}`);
    for (const f of build.families) {
      // §4.2 — every comparator prints its COMPARED COUNT next to its verdict.
      // "0 divergences" without a compared count is not a result.
      const line =
        `${f.family}: attempted=${f.attempted} built=${f.built} meshes=${f.meshes} ` +
        `verts=${f.vertices} tris=${f.triangles} path=${f.path}`;
      console.log(`   ${f.meshes > 0 ? '✓' : '❌'} ${line}${f.error ? `  [error: ${f.error}]` : ''}`);

      const geometry =
        f.error && f.meshes === 0
          ? `FAIL — builder produced nothing and reported: ${f.error}`
          : f.attempted === 0
            ? 'MISCONFIGURED — no elements of this family were established, so the builder had no subject; ' +
              'a verdict over an empty subject is not a verdict (C70 §5.1)'
            : f.meshes > 0
              ? `PROVEN — executed headless fragment build: ${f.built}/${f.attempted} elements built, ` +
                `${f.meshes} meshes / ${f.triangles} triangles read back from the scene graph`
              : 'FAIL — elements were established and handed to the builder, which produced 0 meshes';

      rows.push(finishRow({
        capability: `geometry:${f.family}`,
        intent: `build ${f.family} geometry headlessly from authoritative store records`,
        command: `${f.family} FragmentBuilder over @pryzm/renderer-three/three (the sanctioned P2 facade)`,
        authoritativeState:
          f.attempted > 0
            ? `PROVEN — ${f.attempted} record(s) read from the authoritative store, never the plugin-DTO sink`
            : 'MISCONFIGURED — the authoritative store held no records of this family',
        geometry,
        persistence: 'n/a — this suite scores the Geometry link; persistence is certified by persistence.cert.ts',
        undo: 'n/a — geometry is derived from authoritative state; undo is certified by undoredo.cert.ts',
        redo: 'n/a — as undo',
        collaboration: UNPROVEN_COLLAB,
        report: `PROVEN — compared counts printed per family (§4.2): meshes=${f.meshes} triangles=${f.triangles}`,
        evidence: [
          `attempted=${f.attempted}`, `built=${f.built}`, `meshes=${f.meshes}`,
          `vertices=${f.vertices}`, `triangles=${f.triangles}`, `path=${f.path}`,
          f.error ? `error=${f.error}` : 'error=none',
        ],
      }));
    }
    console.log(`   TOTALS meshes=${build.totals.meshes} vertices=${build.totals.vertices} triangles=${build.totals.triangles}`);

    if (EMPTY_WORLD) {
      // Over an empty world the ONLY acceptable outcome is that nothing built.
      expect.soft(build.totals.meshes, 'an empty world must produce NO geometry').toBe(0);
    } else {
      expect.soft(build.totals.triangles, 'the executed build must produce triangles').toBeGreaterThan(0);
    }
  });

  it('§2.4 ORACLE — polygon offset against a KNOWN answer, not self-consistency', () => {
    console.log('\n── §2.4 POLYGON-OFFSET ORACLE ' + '─'.repeat(38));
    console.log(`   ${oracle.ran ? (oracle.passed ? '✓' : '❌') : '❌'} ${oracle.detail}`);
    rows.push(finishRow({
      capability: 'geometry:offset-oracle',
      intent: 'offset the 12x8 shell by the roof\'s declared 300 mm overhang',
      command: 'offsetPolygon (@pryzm/geometry-kernel/pure/polygonOffset)',
      authoritativeState: 'n/a — a pure function over a declared fixture ring, no store involved',
      geometry: !oracle.ran
        ? `MISCONFIGURED — the oracle never executed: ${oracle.detail}`
        : oracle.passed
          ? `PROVEN — ${oracle.detail}`
          : `FAIL — ${oracle.detail}`,
      persistence: 'n/a', undo: 'n/a', redo: 'n/a',
      collaboration: UNPROVEN_COLLAB,
      report: `PROVEN — expected ${oracle.expected.width}x${oracle.expected.depth}, spread printed`,
      evidence: [
        `oracleRan=${oracle.ran ? 1 : 0}`, `oraclePassed=${oracle.passed ? 1 : 0}`,
        `spread=${oracle.spread}`,
      ],
    }));
    expect.soft(oracle.ran, 'the oracle must actually execute — a vacuous pass is §4.4 way 3').toBe(true);
    expect.soft(oracle.passed, 'polygon offset must match its hand-checked answer').toBe(true);
  });

  it('names what a headless build CANNOT prove (§5) — declared, never inferred from silence', () => {
    console.log('\n── UNPROVEN, WITH NAMED REASONS (§5) ' + '─'.repeat(31));
    for (const u of GEOMETRY_UNPROVEN) {
      console.log(`   • ${u.what}`);
      console.log(`     ${u.reason}`);
    }
    console.log('\n   These are UNPROVEN — neither a pass nor a fail. Declaring a limitation and then');
    console.log('   citing the declaration as coverage is the Phase 9 risk, and it is not permitted.');
    expect(GEOMETRY_UNPROVEN.length).toBeGreaterThan(0);
  });
});

afterAll(() => {
  const builtFamilies = build?.families.filter((f) => f.meshes > 0).length ?? 0;
  const seededElements = build?.families.reduce((a, f) => a + f.attempted, 0) ?? 0;

  const p = writeResults('geometry.json', {
    harness: 'CE-02 geometry (executed headless fragment build)',
    generatedAt: new Date().toISOString(),
    emptyWorldRun: EMPTY_WORLD,
    ceiling: 'PARTIALLY VERIFIED — collaboration is UNPROVEN by construction (§3.3); VERIFIED is ' +
      'arithmetically unreachable for every row in this harness, declared on day one so it cannot ' +
      'be quietly redefined later.',
    seedOutcomes: seeded?.seedOutcomes ?? {},
    targetReadings: seeded?.targetReadings ?? [],
    counts: seeded?.counts ?? {},
    seedError,
    seededElements,
    builtFamilies,
    totals: build?.totals ?? { meshes: 0, vertices: 0, triangles: 0 },
    framesPumped: build?.framesPumped ?? 0,
    families: build?.families ?? [],
    oracle,
    negativeControl: negative?.arms ?? [],
    negativeControlBlind: negative?.blind ?? true,
    unproven: GEOMETRY_UNPROVEN,
    rows,
  });
  console.log(`\n[geometry.cert] artefact → ${p}`);
  console.log(`[geometry.cert] rows=${rows.length} builtFamilies=${builtFamilies} ` +
    `triangles=${build?.totals.triangles ?? 0} blindComparator=${negative?.blind ?? true}`);
});
