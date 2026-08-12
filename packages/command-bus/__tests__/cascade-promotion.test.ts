// CascadeRunner PROMOTION TEST — THE test named by STR-06 §6 / ADR-0323 rule 5 /
// BIM30-REASONING-LOOP-PLAN R0.
//
//   wall.move → CascadeRunner → deterministic predicted command set
//             → no mutation → stable result
//
// This is the gate the founder set before CascadeRunner may be wired anywhere:
// "CascadeRunner is NOT wired merely because it exists: first answer — is it the
// planner, or one mechanism the planner uses?"  (STR-06 §5–6.)
//
// Fixture: a wall w1 carrying two hosted openings (o1, o2), junction-adjacent to
// walls w2 and w3; w2 itself hosts an opening (o3) so the cascade is transitive
// (wall.move w1 → wall.transform w2 → opening.refit o3).  The rules mirror the
// REAL rule shapes in `plugins/cross/` (wall-room / slab-wall): payload.wallId
// extraction, `cascadedFrom` attribution, synthesised follow-on commands that
// themselves re-enter the walk.
//
// Assertions (the three clauses of the promotion test):
//   (a) DETERMINISM  — two dispatches over identical state produce byte-equal
//       command sequences and stats.
//   (b) NO MUTATION  — planning leaves the stores byte-identical (verified by
//       deep-freeze + pre/post JSON snapshot; a frozen store makes any write
//       attempt throw in strict mode, so purity is proven, not assumed).
//   (c) STABILITY under input iteration-order shuffle — reversing rule
//       registration order and reversing every adjacency/hosting list changes
//       neither the predicted SET of commands nor the stats.  (The BFS *sequence*
//       is registration-order sensitive — recorded below as a finding, not
//       hidden: a ConsequencePlanner consuming this mechanism must canonicalise
//       ordering itself.)
//
// VERDICT RECORDED (see docs/04-reference/BIM30-DISPOSITION-DOCKET.md):
// CascadeRunner is ONE MECHANISM a planner would use, not the planner.  It
// produces a flat follow-on command list — it cannot express UNDETERMINED,
// excluded/untouched sets, violations, refusals, or a plan hash (STR-06 §1,
// §6-bis).  Within that scope it passes all three clauses → PROMOTE as the
// cascade branch of the future ConsequencePlanner (plan R2), with two caveats
// a promoting integration must own:
//   1. visited-set keys are RAW entity ids with no family namespace — a wall
//      and a room sharing an id string would dedupe against each other;
//   2. emission SEQUENCE follows rule-registration order (set is stable,
//      sequence is not) — canonical ordering is the planner's job.

import { describe, it, expect } from 'vitest';
import {
  CascadeRunner,
  type CascadeRule,
  type CascadeContext,
  type CascadeCommand,
} from '../src/cascade.js';

// ── Fixture stores ──────────────────────────────────────────────────────────
// Shapes mirror what a bootstrap would hand the runner via ctx.stores: a
// junction adjacency surface and an opening-hosting surface.

interface FixtureStores {
  readonly junctions: Readonly<Record<string, readonly string[]>>;
  readonly openingsByWall: Readonly<Record<string, readonly string[]>>;
  readonly walls: Readonly<Record<string, { readonly baseLine: readonly number[] }>>;
  readonly [k: string]: unknown;
}

function buildStores(reversed = false): FixtureStores {
  const maybeRev = <T>(xs: readonly T[]): readonly T[] =>
    reversed ? [...xs].reverse() : xs;
  // Record key insertion order also shuffled in the reversed variant.
  const junctionEntries: Array<[string, readonly string[]]> = [
    ['w1', maybeRev(['w2', 'w3'])],
    ['w2', ['w1']],
    ['w3', ['w1']],
  ];
  const openingEntries: Array<[string, readonly string[]]> = [
    ['w1', maybeRev(['o1', 'o2'])],
    ['w2', ['o3']],
    ['w3', []],
  ];
  const wallEntries: Array<[string, { baseLine: number[] }]> = [
    ['w1', { baseLine: [0, 0, 5, 0] }],
    ['w2', { baseLine: [5, 0, 5, 4] }],
    ['w3', { baseLine: [0, 0, 0, 4] }],
  ];
  const fromEntries = <V>(es: Array<[string, V]>): Record<string, V> =>
    Object.fromEntries(reversed ? [...es].reverse() : es);
  return {
    junctions: fromEntries(junctionEntries),
    openingsByWall: fromEntries(openingEntries),
    walls: fromEntries(wallEntries),
  };
}

function deepFreeze<T>(obj: T): T {
  if (obj && typeof obj === 'object' && !Object.isFrozen(obj)) {
    Object.freeze(obj);
    for (const v of Object.values(obj as Record<string, unknown>)) deepFreeze(v);
  }
  return obj;
}

// ── Rules — same shapes as plugins/cross (wallId extraction, cascadedFrom) ──

/** wall.move / wall.transform → wall.transform on junction-adjacent walls.
 *  Mirrors the junction coupling the cross rules model (slab-wall synthesises
 *  wall.transform with cascadedFrom attribution in exactly this shape). */
function junctionRule(): CascadeRule {
  return {
    key: 'test.wall-junction',
    appliesTo: (t) => t === 'wall.move' || t === 'wall.transform',
    extractEntityId: (cmd) => {
      const p = cmd.payload as { wallId?: string; id?: string };
      const id = p.wallId ?? p.id;
      if (!id) throw new Error(`no wall id on ${cmd.type}`);
      return id;
    },
    resolveAffected(cmd, ctx) {
      const stores = ctx.stores as FixtureStores;
      const p = cmd.payload as { wallId?: string; id?: string };
      return stores.junctions[(p.wallId ?? p.id)!] ?? [];
    },
    synthesize(affectedId, rootCmd) {
      return {
        type: 'wall.transform',
        payload: { wallId: affectedId, kind: 'move', cascadedFrom: rootCmd.type },
      };
    },
  };
}

/** wall.move / wall.transform → opening.refit on hosted openings.  Mirrors
 *  the planOpeningRefit consequence family as a cascade rule.  Synthesised
 *  payload carries `id` so the runner's default extractor resolves it. */
function openingRefitRule(): CascadeRule {
  return {
    key: 'test.wall-opening-refit',
    appliesTo: (t) => t === 'wall.move' || t === 'wall.transform',
    extractEntityId: (cmd) => {
      const p = cmd.payload as { wallId?: string; id?: string };
      const id = p.wallId ?? p.id;
      if (!id) throw new Error(`no wall id on ${cmd.type}`);
      return id;
    },
    resolveAffected(cmd, ctx) {
      const stores = ctx.stores as FixtureStores;
      const p = cmd.payload as { wallId?: string; id?: string };
      return stores.openingsByWall[(p.wallId ?? p.id)!] ?? [];
    },
    synthesize(affectedId, rootCmd) {
      const p = rootCmd.payload as { wallId?: string; id?: string };
      return {
        type: 'opening.refit',
        payload: { id: affectedId, hostWallId: (p.wallId ?? p.id)!, cascadedFrom: rootCmd.type },
      };
    },
  };
}

const ROOT: CascadeCommand = {
  type: 'wall.move',
  payload: { wallId: 'w1', baseLine: [0.3, 0, 5.3, 0] },
};

function buildRunner(reverseRegistration = false): CascadeRunner {
  const runner = new CascadeRunner();
  const rules = [junctionRule(), openingRefitRule()];
  for (const r of reverseRegistration ? rules.reverse() : rules) runner.register(r);
  return runner;
}

/** Canonical SET serialisation — key-sorted then list-sorted, so neither
 *  payload key order nor emission sequence affects the comparison. */
function canonicalSet(commands: readonly CascadeCommand[]): string[] {
  return commands
    .map((c) => JSON.stringify({ type: c.type, payload: sortKeys(c.payload) }))
    .sort();
}

function sortKeys(o: Readonly<Record<string, unknown>>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : 1)));
}

describe('CascadeRunner promotion test (STR-06 §6, ADR-0323 rule 5, plan R0)', () => {
  it('(a) DETERMINISM — two runs over identical state are byte-equal', () => {
    const stores = deepFreeze(buildStores());
    const ctx: CascadeContext = { stores };
    const runner = buildRunner();

    const run1 = runner.dispatch(ROOT, ctx);
    const run2 = runner.dispatch(ROOT, ctx);

    expect(JSON.stringify(run1.commands)).toBe(JSON.stringify(run2.commands));
    expect(run1.stats).toEqual(run2.stats);

    // The predicted set is exactly the fixture's consequence surface:
    // root + 2 junction walls + 3 openings (o1, o2 on w1; o3 on w2 transitively).
    expect(run1.stats.commandsTotal).toBe(6);
    expect(run1.stats.entitiesVisited).toBe(6);
    const types = run1.commands.map((c) => c.type).sort();
    expect(types).toEqual([
      'opening.refit', 'opening.refit', 'opening.refit',
      'wall.move', 'wall.transform', 'wall.transform',
    ]);
    // Transitivity: o3 is reached only through the synthesised w2 transform.
    expect(
      run1.commands.some(
        (c) => c.type === 'opening.refit' && (c.payload as { id: string }).id === 'o3',
      ),
    ).toBe(true);
    // Root always first — the bus executes root-first per the dispatch contract.
    expect(run1.commands[0]).toBe(ROOT);
  });

  it('(b) NO MUTATION — planning leaves stores byte-identical (frozen + snapshot)', () => {
    'use strict';
    const stores = deepFreeze(buildStores());
    const before = JSON.stringify(stores);
    const runner = buildRunner();

    // Deep-frozen stores: ANY write attempt inside dispatch/rules throws in
    // strict mode (ESM is always strict), so completing without a throw plus
    // a byte-identical snapshot is positive proof of purity.
    runner.dispatch(ROOT, { stores });

    expect(JSON.stringify(stores)).toBe(before);
  });

  it('(c) STABILITY — predicted SET and stats survive input iteration-order shuffle', () => {
    const forward = buildRunner(false).dispatch(ROOT, { stores: deepFreeze(buildStores(false)) });
    const shuffled = buildRunner(true).dispatch(ROOT, { stores: deepFreeze(buildStores(true)) });

    // The predicted command SET is identical…
    expect(canonicalSet(shuffled.commands)).toEqual(canonicalSet(forward.commands));
    // …and so is every stat.
    expect(shuffled.stats).toEqual(forward.stats);
  });

  it('(c-finding, pinned) emission SEQUENCE follows rule-registration order — the planner must canonicalise', () => {
    // Not a failure of the promotion test — the SET is stable (above) — but a
    // property a promoting ConsequencePlanner must own.  Pinned so the day the
    // runner gains internal canonical ordering, this test flips and the caveat
    // can be deleted from the docket.
    const forward = buildRunner(false).dispatch(ROOT, { stores: deepFreeze(buildStores(false)) });
    const reversedRules = buildRunner(true).dispatch(ROOT, { stores: deepFreeze(buildStores(false)) });

    expect(canonicalSet(reversedRules.commands)).toEqual(canonicalSet(forward.commands));
    const forwardSeq = forward.commands.map((c) => c.type).join(',');
    const reversedSeq = reversedRules.commands.map((c) => c.type).join(',');
    expect(reversedSeq).not.toBe(forwardSeq);
  });
});
