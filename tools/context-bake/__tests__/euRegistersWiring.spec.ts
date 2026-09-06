// §EU-REGISTERS — the WIRING of the Dutch / Belgian / Irish official footprint sources, pinned, and
// the preflight RUN FOR REAL.
//
// WHY THIS FILE EXISTS, AND IT IS THE WHOLE POINT OF THE LANE. `footprints/euRegisters.mjs` was
// committed on 2026-09-06 with a message that said, in as many words, "it is imported by NOTHING …
// no bake path reaches it, so it changes no output today". That is L-12976's shape — the fifth
// authored-but-unwired of the session — and a green unit suite over the adapter would have stayed
// green forever without a single Dutch building changing. `euRegisters.spec.ts` is that unit suite.
// THIS file is the one that can fail if the module goes back to being unreachable.
//
// THE CHAIN IT PINS, link by link, because "it has tests" is not a capability:
//   euRegisters.mjs  →  FOOTPRINT_SOURCE_KEYS (footprintMerge.mjs, forwarded not retyped)
//                    →  FOOTPRINT_SOURCES (bake.mjs)
//                    →  the `netherlands` / `belgium` / `ireland` REGIONS rows
//                    →  applyNationalFootprints → mergeReplaceInBbox → the tiled geojsonseq
//   and the dispatch half: context-bake.yml's `footprints` input → --footprints official, plus
//   EU_REGISTER_NATIONAL / EU_SWEEP_CURSOR / EU_BUDGET_SECONDS in the Bake step's env.
//
// The env half is pinned as text because a switch with no way to be turned on from a dispatch is
// the same defect one level up — that is exactly what happened to CATASTRO_NATIONAL, and the yml
// carries its own note saying so.
//
// LAYERING: a build-tool test — no OTel span (P8 applies to exported package functions).
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { FOOTPRINT_SOURCE_KEYS, assertFootprintConfig } from '../footprints/footprintMerge.mjs';
import { EU_FOOTPRINT_SOURCE_KEYS, EU_REGISTER_SOURCES } from '../footprints/euRegisters.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const BAKE_PATH = resolve(HERE, '../bake.mjs');
const bake = readFileSync(BAKE_PATH, 'utf8');
const WORKFLOW = resolve(HERE, '../../../.github/workflows/context-bake.yml');
const yml = readFileSync(WORKFLOW, 'utf8');

/**
 * ONE REGIONS row as text — its own object literal and NOT ONE CHARACTER MORE.
 *
 * ⚠ NOT `slice(start, indexOf('\n  },', start))`, which is what `esCatastroWiring.spec.ts` uses and
 * what this file used until it caught itself. That terminator only exists for a row spread over
 * several lines; the `netherlands` / `belgium` / `ireland` rows END ON THEIR OWN LINE with ` },`, so
 * the search ran past them and returned SEVERAL rows glued together. The three "the row declares its
 * source" assertions above PASSED that way — on text belonging to a different country. A wiring
 * test that can pass by reading the neighbour's row is worse than no wiring test, so the row is
 * delimited by counting braces from its own opening one.
 */
function regionRow(name: string): string {
  const at = bake.indexOf(`name: '${name}',`);
  expect(at, `REGIONS row for '${name}'`).toBeGreaterThan(-1);
  const open = bake.lastIndexOf('{', at);
  expect(open, `opening brace of the '${name}' row`).toBeGreaterThan(-1);
  let depth = 0;
  for (let i = open; i < bake.length; i++) {
    if (bake[i] === '{') depth++;
    else if (bake[i] === '}') {
      depth--;
      if (depth === 0) return bake.slice(open, i + 1);
    }
  }
  throw new Error(`unterminated REGIONS row for '${name}'`);
}

function sourcesTable(): string {
  const m = bake.match(/const FOOTPRINT_SOURCES = \{([\s\S]*?)\n\};/);
  expect(m, 'FOOTPRINT_SOURCES table').not.toBeNull();
  return m![1];
}

/**
 * Run `bake.mjs --check` and return its exit code + output.
 *
 * ⚠ NODE_OPTIONS is set because `assertHeightStampBudget` refuses a heap under 6000 MB — a DIFFERENT
 * gate whose refusal would mask this one, which is how a broken tree goes unnoticed on a dev box.
 */
function runCheck(args: readonly string[], env: Record<string, string> = {}): { code: number; out: string } {
  try {
    const out = execFileSync(process.execPath, [BAKE_PATH, '--check', ...args], {
      encoding: 'utf8',
      env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=8192', ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { code: 0, out };
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return { code: err.status ?? -1, out: `${err.stdout ?? ''}${err.stderr ?? ''}` };
  }
}

describe('§EU-REGISTERS — bake.mjs actually REACHES euRegisters.mjs', () => {
  it('imports the factory from footprints/euRegisters.mjs', () => {
    const imp = bake.match(/^import\s*\{([^}]*)\}\s*from\s*'\.\/footprints\/euRegisters\.mjs';/m);
    expect(imp, 'footprints/euRegisters.mjs import statement').not.toBeNull();
    expect(imp![1]).toContain('euRegisterFootprintSource');
  });

  it('REGISTERS all three EU sources in FOOTPRINT_SOURCES — the import alone is not wiring', () => {
    // This is the assertion the tree failed on 2026-09-06 before this lane, and the assertion that
    // failed for `es_catastro` before it. An import with no table row changes no output.
    const table = sourcesTable();
    for (const key of EU_FOOTPRINT_SOURCE_KEYS) {
      expect(table, `FOOTPRINT_SOURCES row for '${key}'`).toMatch(new RegExp(`\\b${key}:\\s*euRegisterFootprintSource\\(`));
    }
  });

  it('gives EVERY declared source key a row — a key with no row silently bakes OSM', () => {
    const table = sourcesTable();
    for (const key of FOOTPRINT_SOURCE_KEYS) {
      expect(table, `FOOTPRINT_SOURCES row for '${key}'`).toMatch(new RegExp(`\\b${key}:`));
    }
  });

  it('FOOTPRINT_SOURCE_KEYS FORWARDS the EU set instead of retyping it', () => {
    // A hand-copied literal lets the two lists disagree, and this list is what assertFootprintConfig
    // refuses a region against: a source present in euRegisters and missing here fails the cheap
    // Plan step of EVERY bake. Assert set membership, never a count (§GREP-SILENCE).
    for (const key of Object.keys(EU_REGISTER_SOURCES)) expect(FOOTPRINT_SOURCE_KEYS).toContain(key);
    expect([...FOOTPRINT_SOURCE_KEYS]).toEqual(['es_catastro', 'fr_bdtopo', 'nl_bag', 'be_registers', 'ie_tailte']);
  });

  it('the three region rows declare their source AND the only honest merge mode', () => {
    for (const [region, source] of [['netherlands', 'nl_bag'], ['belgium', 'be_registers'], ['ireland', 'ie_tailte']] as const) {
      const row = regionRow(region);
      expect(row, region).toMatch(new RegExp(`footprintSource:\\s*'${source}'`));
      expect(row, region).toMatch(/footprintMerge:\s*'replace-in-bbox'/);
    }
  });

  it('the footprint source does NOT displace either measured-height join', () => {
    // Footprints and heights are DIFFERENT facts about the same region. None of these four registers
    // publishes a metre, so the joins that do must survive the wiring untouched.
    expect(regionRow('netherlands')).toMatch(/heightJoin:\s*'3dbag'/);
    expect(regionRow('belgium')).toMatch(/heightJoin:\s*'be_dhmv'/);
    // Ireland has NO height join and must not acquire a fabricated one just because it now has
    // official shapes: Tailte's whole field list is GUID · OBJECTID · Shape__Area · Shape__Length.
    expect(regionRow('ireland')).not.toMatch(/heightJoin:/);
  });

  it('assertFootprintConfig ACCEPTS the three new sources and still refuses an unknown one', () => {
    expect(assertFootprintConfig([
      { name: 'netherlands', footprintSource: 'nl_bag', footprintMerge: 'replace-in-bbox', footprintBboxes: [[4.83, 52.34, 4.97, 52.42]] },
      { name: 'belgium', footprintSource: 'be_registers', footprintMerge: 'replace-in-bbox', footprintBboxes: [[4.35, 51.19, 4.47, 51.25]] },
      { name: 'ireland', footprintSource: 'ie_tailte', footprintMerge: 'replace-in-bbox', footprintBboxes: [[-6.34, 53.31, -6.19, 53.40]] },
    ] as never)).toEqual([]);
    expect(assertFootprintConfig([{ name: 'x', footprintSource: 'nl_kadaster', footprintMerge: 'replace-in-bbox', footprintBboxes: [[0, 0, 1, 1]] }] as never)[0])
      .toMatch(/is not one of/);
  });

  it('refuses an EMPTY working set — the §FOOTPRINT-BUDGET refusal, at the plan step', () => {
    expect(assertFootprintConfig([{ name: 'ireland', footprintSource: 'ie_tailte', footprintMerge: 'replace-in-bbox', footprintBboxes: [] }] as never)[0])
      .toMatch(/working set is EMPTY/);
  });
});

describe('§FOOTPRINT-BUDGET — the preflight actually runs, with the new rows in it', () => {
  it('EXITS 0 on the DEFAULT path and says nothing about footprints (byte-identical plan)', () => {
    const { code, out } = runCheck([]);
    expect(code, `bake.mjs --check exited ${code}:\n${out}`).toBe(0);
    expect(out).not.toContain('official footprints:');
    expect(out).not.toContain('✖ footprint config');
  }, 90_000);

  it('EXITS 0 with --footprints official and NAMES all five wired regions', () => {
    const { code, out } = runCheck(['--footprints', 'official']);
    expect(code, `bake.mjs --check --footprints official exited ${code}:\n${out}`).toBe(0);
    for (const pair of ['spain→es_catastro', 'france→fr_bdtopo', 'netherlands→nl_bag', 'belgium→be_registers', 'ireland→ie_tailte']) {
      expect(out, pair).toContain(pair);
    }
    expect(out).not.toContain('working set is EMPTY');
  }, 90_000);

  it('still EXITS 0 with the EU national sweep explicitly armed and a cursor set', () => {
    // The national path is bounded by a budget and a cursor rather than by a bbox list, so the cheap
    // Plan step must pass with it armed — otherwise the whole-country path dies at minute two of
    // every run and nobody sees why.
    const { code, out } = runCheck(['--footprints', 'official'], {
      EU_REGISTER_NATIONAL: '1', EU_SWEEP_CURSOR: '+005.100+052.300', EU_BUDGET_SECONDS: '9000',
    });
    expect(code, `armed preflight exited ${code}:\n${out}`).toBe(0);
    expect(out).not.toContain('working set is EMPTY');
  }, 90_000);
});

describe('§EU-REGISTERS — the DISPATCH half: the switches exist in context-bake.yml', () => {
  it('threads all three EU env vars into the Bake step', () => {
    // CATASTRO_NATIONAL was landed with no way to be turned on from a dispatch, which made the
    // whole-country path unreachable — the yml carries its own note saying exactly that. Do not
    // repeat it one file over.
    for (const key of ['EU_REGISTER_NATIONAL:', 'EU_SWEEP_CURSOR:', 'EU_BUDGET_SECONDS:']) {
      expect(yml, key).toContain(key);
    }
  });

  it('EU_REGISTER_NATIONAL is wired as an OFF switch, matching the module default', () => {
    // The module defaults to NATIONAL, so an unset variable must mean the whole country. A mapping
    // of `inputs.x && '1' || ''` (the Catastro shape) would be correct for an ON switch and is a
    // silent no-op here.
    const m = yml.match(/EU_REGISTER_NATIONAL:\s*(.+)/);
    expect(m, 'EU_REGISTER_NATIONAL env line').not.toBeNull();
    expect(m![1]).toContain("eu_footprints_scope == 'metros'");
    expect(m![1]).toContain("'0'");
  });

  it('declares the eu_footprints_scope input with national as the DEFAULT', () => {
    const block = yml.match(/eu_footprints_scope:[\s\S]{0,1600}?\n {6}\w/);
    expect(block, 'eu_footprints_scope input').not.toBeNull();
    expect(block![0]).toContain("options: ['national', 'metros']");
    expect(block![0]).toMatch(/default:\s*'national'/);
  });

  it('stays UNDER the GitHub 10-input cap on workflow_dispatch', () => {
    // ⚠ MEASURED CONSTRAINT, not a style note: an 11th input makes the file invalid and EVERY
    // dispatch of this workflow fails, including the ones that have nothing to do with footprints.
    // This lane hit it (8 existing + 3 proposed) and is why the cursor and budget are SHARED with
    // the Catastro sweep instead of duplicated.
    const inputs = yml.match(/^ {6}[a-z_]+:$/gm) ?? [];
    expect(inputs.length, `workflow_dispatch inputs: ${inputs.join(' ')}`).toBeLessThanOrEqual(10);
  });

  it('the `footprints` input description NAMES the three new countries', () => {
    // The founder reads this box in the Actions UI. A description that still says "today `spain`"
    // is how a shipped capability stays invisible.
    const line = yml.split('\n').find((l) => l.includes("§OFFICIAL-FOOTPRINTS (L-12939)"))!;
    for (const s of ['netherlands', 'belgium', 'ireland']) expect(line, s).toContain(s);
  });
});
