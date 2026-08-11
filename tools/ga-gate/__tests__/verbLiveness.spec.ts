/**
 * Unit spec for the pure classification half of `check-verb-liveness.ts`.
 *
 * The gate's OTHER half — "does the harness actually prove anything" — cannot be
 * unit-tested, by design: CA-21 admits no substitute for an executed dispatch,
 * so that half is negative-tested by running the gate with a fault injected into
 * a proven verb's authoritative store and watching it fail by name.
 *
 * What IS testable here is the rule that keeps the three verdicts three facts.
 * Collapsing UNPROVABLE-NO-STORE into UNKNOWN would make "the store is out of
 * reach" indistinguishable from "nobody looked", and promoting either to PROVEN
 * on anything short of an executed read-back is the precise failure CA-21 names.
 */

import { describe, it, expect } from 'vitest';
import { classify, familyOf, parseRegisterVerbs, serializerImports, type CensusRow, type LedgerRow } from '../check-verb-liveness.js';

const census: CensusRow[] = [
  { family: 'annotation', reachable: true, via: '@pryzm/plugin-annotations::annotationStore' },
  { family: 'door', reachable: true, via: '@pryzm/geometry-door::doorStore' },
  { family: 'wall', reachable: false, via: 'UNREACHABLE' },
];

const rows: LedgerRow[] = [
  { verb: 'annotation.setText', family: 'annotation', verdict: 'PROVEN', reason: 'executed read-back', via: 'x' },
  { verb: 'door.create', family: 'door', verdict: 'UNKNOWN', reason: 'readback-negative (dispatch reported success; the AUTHORITATIVE store did not change)', via: 'x' },
];

describe('familyOf', () => {
  it('splits on the first dot and keeps hyphenated families whole', () => {
    expect(familyOf('curtain-wall.setGrid')).toBe('curtain-wall');
    expect(familyOf('schedule.column.add')).toBe('schedule');
    expect(familyOf('zoom-fit')).toBe('zoom-fit');
  });
});

describe('classify — the three verdicts stay three facts', () => {
  it('PROVEN only from an executed PROVEN ledger row', () => {
    expect(classify('annotation.setText', rows, census).verdict).toBe('PROVEN');
  });

  it('a dispatch that reported success but did not change the authoritative store is UNKNOWN, never PROVEN', () => {
    const r = classify('door.create', rows, census);
    expect(r.verdict).toBe('UNKNOWN');
    expect(r.reason).toContain('readback-negative');
  });

  it('an absent store is UNPROVABLE-NO-STORE — distinct from UNKNOWN and never a pass', () => {
    const r = classify('wall.move', rows, census);
    expect(r.verdict).toBe('UNPROVABLE-NO-STORE');
    expect(r.reason).toContain('ABSENT');
  });

  it('a family nobody measured is UNKNOWN, NOT UNPROVABLE-NO-STORE (that would claim a measurement nobody made)', () => {
    const r = classify('lighting.create', rows, census);
    expect(r.verdict).toBe('UNKNOWN');
    expect(r.reason).toContain('no census entry');
  });

  it('a reachable store with no spec is UNKNOWN/not-attempted, not a pass', () => {
    const r = classify('door.setSwing', rows, census);
    expect(r.verdict).toBe('UNKNOWN');
    expect(r.reason).toContain('not-attempted');
  });

  it('no static signal can promote a verb — an empty ledger proves nothing', () => {
    for (const v of ['annotation.setText', 'door.create', 'wall.move']) {
      expect(classify(v, [], []).verdict).not.toBe('PROVEN');
    }
  });
});

describe('parseRegisterVerbs', () => {
  it('reads the verb column and ignores prose and the shadow table', () => {
    const md = [
      '| verb | owner |', '|---|---|',
      '| `door.create` | plugins/door | UNKNOWN |',
      '| `curtain-wall.setGrid` | plugins/cw | LIVE |',
      'not a row at all',
    ].join('\n');
    expect(parseRegisterVerbs(md)).toEqual(['curtain-wall.setGrid', 'door.create']);
  });
});

describe('serializerImports — the authoritativeness check', () => {
  it('collects named imports including aliased ones', () => {
    const src = "import { doorStore, windowStore as w } from '@pryzm/geometry-door';\nimport type { X } from 'y';";
    const s = serializerImports(src);
    expect(s.has('doorStore')).toBe(true);
    expect(s.has('windowStore')).toBe(true);
  });
});
