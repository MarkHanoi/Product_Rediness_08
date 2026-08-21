// §FEAT-RAC-PROPERTY-QUERY (L-2210) — the READ half, proven by EXECUTION.
// =============================================================================
//
// The founder's ask was two words joined by "and": *"All dims and properties of
// all elements should be **queryable and executable** by RAC."* This file
// executes the join.
//
// ⭐ THE DIFFERENTIATING TEST is `executable ⟺ queryable`, below. It is not a
// restatement of the table: it runs `applySemanticIntent` for EVERY row against
// EVERY probed element kind and compares the refusal against the mirrored WRITE
// capability's own kind guard. A row that could be asked about a kind the write
// refuses would fail, and so would the reverse — which is exactly the
// `ElementCapabilities` lie (Mirror/Offset/Scale advertised on seven families
// whose commands are wall-only) that the whole registry exists to prevent.
//
// The second theme is HONESTY OF ABSENCE. Three different facts — no reader, no
// element, no field — must arrive as three different sentences, and none of them
// may be a number. `§CONTEXT-DATA-HONESTY` in its measured form.

import { describe, expect, it } from 'vitest';
import {
  PROPERTY_QUERY_ROWS,
  propertyQueryRow,
  queryableKinds,
  matchPropertyQuery,
  type PropertyReadOutcome,
} from '../src/intents/PropertyQuery.js';
import {
  PROBE_ELEMENT_KINDS,
  resolveChatCapability,
} from '../src/capabilities/ChatCapabilityRegistry.js';
import {
  applySemanticIntent,
  resolveUtterance,
  type ResolverContext,
} from '../src/intents/ZeroTokenResolver.js';

const ctxOf = (
  kind: string,
  readProperty?: ResolverContext['readProperty'],
): ResolverContext => ({
  selection: [{ elementId: `probe-${kind}`, elementType: kind }],
  levels: [{ id: 'L0', name: 'Level 0', elevation: 0 }],
  activeLevelId: 'L0',
  mintId: () => 'probe-level',
  ...(readProperty !== undefined ? { readProperty } : {}),
});

const ask = (property: string, ctx: ResolverContext) =>
  applySemanticIntent({ intent: 'property-query', property } as never, ctx);

const reads = (outcome: PropertyReadOutcome): ResolverContext['readProperty'] => () => outcome;

// ─── The mirror ──────────────────────────────────────────────────────────────

describe('every queryable property MIRRORS a live executable capability', () => {
  it('each row names a capability that exists, and inherits its kinds', () => {
    for (const row of PROPERTY_QUERY_ROWS) {
      const cap = resolveChatCapability(row.capabilityId);
      expect(cap, `row "${row.id}" mirrors "${row.capabilityId}", which is not registered`)
        .not.toBeNull();
      // A row whose twin vanished must refuse EVERYTHING, never claim
      // everything — the safe direction to be wrong in.
      expect(queryableKinds(row).length, row.id).toBeGreaterThan(0);
      expect([...queryableKinds(row)].sort(), row.id).toEqual([...(cap!.targets as string[])].sort());
    }
  });

  it('⭐ executable ⟺ queryable, executed per (row × kind)', () => {
    const mismatches: string[] = [];
    for (const row of PROPERTY_QUERY_ROWS) {
      const cap = resolveChatCapability(row.capabilityId)!;
      const canSet = new Set(cap.targets === 'global' ? [] : cap.targets);
      for (const kind of PROBE_ELEMENT_KINDS) {
        const refused = ask(row.id, ctxOf(kind)).kind === 'refusal';
        const canAsk = !refused;
        if (canAsk !== canSet.has(kind)) {
          mismatches.push(
            `${row.id} × ${kind}: settable=${canSet.has(kind)} askable=${canAsk}`,
          );
        }
      }
    }
    expect(mismatches, mismatches.join(' · ')).toEqual([]);
  });

  it('a kind that cannot be asked is refused BY NAME, offering what it can do', () => {
    // `set-sill-height` serves window and door; a WALL must be told so, and told
    // what a wall CAN do — a refusal that only says "no" teaches nothing.
    const r = ask('sill-height', ctxOf('wall'));
    expect(r.kind).toBe('refusal');
    if (r.kind === 'refusal') {
      expect(r.reason).toContain('sill height');
      expect(r.reason.toLowerCase()).toContain('wall');
    }
  });
});

// ─── Read-only, always ───────────────────────────────────────────────────────

describe('a question NEVER mutates', () => {
  it('no row, on any kind, in any read state, produces a bus command', () => {
    const states: readonly (ResolverContext['readProperty'] | undefined)[] = [
      undefined,
      reads({ ok: true, value: 2.4 }),
      reads({ ok: false, reason: 'no-such-element' }),
      reads({ ok: false, reason: 'field-absent' }),
    ];
    for (const row of PROPERTY_QUERY_ROWS) {
      for (const kind of PROBE_ELEMENT_KINDS) {
        for (const state of states) {
          const r = ask(row.id, ctxOf(kind, state));
          expect(r.kind, `${row.id} × ${kind}`).not.toBe('commands');
          if (r.kind === 'local') expect(r.action, `${row.id} × ${kind}`).toBe('answer');
        }
      }
    }
  });
});

// ─── The three absences are three sentences ──────────────────────────────────

describe('§CONTEXT-DATA-HONESTY — unreadable, missing and absent are NOT the same value', () => {
  const answerText = (ctx: ResolverContext): string => {
    const r = ask('height', ctx);
    expect(r.kind).toBe('local');
    return r.kind === 'local' ? r.summary : '';
  };

  it('no reader injected ⇒ says it cannot read, and never reports a number', () => {
    const s = answerText(ctxOf('wall'));
    expect(s).toMatch(/cannot read/i);
    expect(s).not.toMatch(/\d+(\.\d+)?\s*m\b/);
  });

  it('the store does not hold the id ⇒ says the model no longer holds it', () => {
    const s = answerText(ctxOf('wall', reads({ ok: false, reason: 'no-such-element' })));
    expect(s).toMatch(/no longer holds/i);
    expect(s).not.toMatch(/\d+(\.\d+)?\s*m\b/);
  });

  it('⭐ the record carries no such field ⇒ names the WRITE/READ asymmetry', () => {
    // The most valuable answer in the feature: the registry says the write
    // reaches this kind and the authoritative record has nothing to read back.
    // Reporting 0 would hide it; naming it turns a silent no-op into a report.
    const s = answerText(ctxOf('wall', reads({ ok: false, reason: 'field-absent' })));
    expect(s).toContain('height');
    expect(s).toMatch(/no "height" to read back/i);
    expect(s).not.toMatch(/\d+(\.\d+)?\s*m\b/);
  });

  it('the three sentences are pairwise DIFFERENT', () => {
    const a = answerText(ctxOf('wall'));
    const b = answerText(ctxOf('wall', reads({ ok: false, reason: 'no-such-element' })));
    const c = answerText(ctxOf('wall', reads({ ok: false, reason: 'field-absent' })));
    expect(new Set([a, b, c]).size).toBe(3);
  });

  it('nothing selected ⇒ refuses and says what to do', () => {
    const r = ask('height', { ...ctxOf('wall'), selection: [] });
    expect(r.kind).toBe('refusal');
    if (r.kind === 'refusal') expect(r.reason).toMatch(/nothing is selected/i);
  });
});

// ─── Values, and the one unit conversion ─────────────────────────────────────

describe('the value reaches the sentence, in the unit a human uses', () => {
  it('a length is spoken in metres', () => {
    const r = ask('height', ctxOf('wall', reads({ ok: true, value: 3.2 })));
    expect(r.kind).toBe('local');
    if (r.kind === 'local') expect(r.summary).toContain('3.2 m');
  });

  it('⭐ roof pitch is stored as a GRADIENT and spoken in DEGREES', () => {
    // The geometry `RoofData` carries `slope`, a gradient
    // (`geometry-roof/src/RoofTypes.ts:83`; RoofGeometryBuilder computes
    // `height = slope × distance`), and the WRITE converts with `Math.tan`. A
    // read that printed the raw gradient would answer "0.577" — the stored
    // value, and useless. `atan` is the exact mirror.
    //
    // ⚠ THE FIRST DRAFT OF THIS ROW READ `pitch` IN RADIANS, from the L0 Zod
    // schema, which is NOT the record the write lands in — see the row's own
    // comment. This assertion is the one that would have caught it.
    const r = ask('roof-pitch', ctxOf('roof', reads({ ok: true, value: Math.tan(Math.PI / 6) })));
    expect(r.kind).toBe('local');
    if (r.kind === 'local') expect(r.summary).toContain('30°');
  });

  it('the roof row reads the field the roof WRITE writes', () => {
    // The structural half of the assertion above: field equality between the
    // read row and the live write arm, so a future re-route of `set-roof-pitch`
    // cannot leave the read pointed at a field nothing sets.
    expect(propertyQueryRow('roof-pitch')!.field).toBe('slope');
  });

  it('the row unit and its speaking are declared, never inferred', () => {
    // Every non-metric row is listed WITH its unit, so a new one cannot arrive
    // without a deliberate edit here. It has already earned its keep once: the
    // `rake-angle` row was added mid-lane and this assertion is what stopped it
    // being added silently — and the two angle rows are NOT the same unit
    // (`rakeAngleDeg` is stored in degrees, `slope` is a gradient), which is
    // precisely the distinction a "just convert angles" shortcut would erase.
    const nonMetric = PROPERTY_QUERY_ROWS
      .filter((r) => r.unit !== 'metres')
      .map((r) => `${r.id}:${r.unit}`)
      .sort();
    // §FEAT-WINDOW-REVEAL-RAC (L-3202 … L-3204) — the four reveal splays join
    // the census, and they join it as `degrees` because `WindowOpeningSchema`
    // stores them that way. THREE storage conventions for an angle now coexist
    // in one table (`rakeAngleDeg` degrees, `slope` a gradient, the splays
    // degrees), which is the strongest possible argument for the per-row `unit`
    // this assertion protects.
    expect(nonMetric).toEqual([
      'rake-angle:degrees',
      'reveal-splay-head:degrees',
      'reveal-splay-jamb-left:degrees',
      'reveal-splay-jamb-right:degrees',
      'reveal-splay-sill:degrees',
      'roof-pitch:gradient-as-degrees',
    ]);
  });

  it('a rake angle is already in degrees — read back verbatim, never converted twice', () => {
    const r = ask('rake-angle', ctxOf('wall', reads({ ok: true, value: 70 })));
    expect(r.kind).toBe('local');
    if (r.kind === 'local') expect(r.summary).toContain('70°');
  });
});

// ─── The grammar ─────────────────────────────────────────────────────────────

describe('the generated grammar claims questions, and ONLY questions', () => {
  it.each([
    ['how tall is this wall', 'height'],
    ['how wide is the selected door', 'width'],
    ['how thick is this wall', 'thickness'],
    ['what is the height of this wall', 'height'],
    ["what's the base offset of this slab", 'base-offset'],
    ['tell me the width of this door', 'width'],
    ['the thickness of this wall', 'thickness'],
  ])('"%s" → %s', (utterance, expected) => {
    expect(matchPropertyQuery(utterance)).toBe(expected);
  });

  it('⭐ a COMPOUND noun is never split by its own suffix', () => {
    // "sill height" ends in "height" and "panel thickness" ends in "thickness".
    // Answering the wrong property is worse than answering nothing, because the
    // number looks right.
    expect(matchPropertyQuery('what is the sill height of this window')).toBe('sill-height');
    expect(matchPropertyQuery('what is the panel thickness of this curtain wall'))
      .toBe('panel-thickness');
    expect(matchPropertyQuery('what is the baluster width of this handrail'))
      .toBe('baluster-width');
    expect(matchPropertyQuery('what is the tread depth of this stair')).toBe('tread-depth');
  });

  it('⛔ a sentence carrying a MEASUREMENT is never claimed', () => {
    // The structural guarantee that this family cannot nibble at a mutation:
    // every pattern is anchored and none of them admits a number.
    for (const s of [
      'set the height to 3m',
      'make this wall 3m tall',
      'make all windows 2 meters height',
      'set the sill height to 0.9m',
      'change the tread depth to 280mm',
    ]) {
      expect(matchPropertyQuery(s), s).toBeNull();
    }
  });

  it('end to end: the ladder answers the founder\'s sentence with the stored value', () => {
    const r = resolveUtterance(
      'how tall is this wall?',
      ctxOf('wall', reads({ ok: true, value: 2.75 })),
    );
    expect(r.kind).toBe('local');
    if (r.kind === 'local') {
      expect(r.intent).toBe('property-query');
      expect(r.action).toBe('answer');
      expect(r.summary).toContain('2.75 m');
    }
  });

  it('every row is reachable from at least one sentence', () => {
    // A row with no phrasing is dead metadata; the founder would still get the
    // miss string, which is the state this whole feature exists to end.
    const unreachable = PROPERTY_QUERY_ROWS.filter(
      (row) => matchPropertyQuery(`what is the ${row.noun} of this element`) !== row.id,
    ).map((r) => r.id);
    expect(unreachable, unreachable.join(', ')).toEqual([]);
  });
});

describe('the table is addressable', () => {
  it('ids are unique and resolvable', () => {
    const ids = PROPERTY_QUERY_ROWS.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(propertyQueryRow(id)).not.toBeNull();
    expect(propertyQueryRow('not-a-property')).toBeNull();
  });

  it('an unknown property (a planner could name one) is REFUSED, never answered', () => {
    const r = ask('not-a-property', ctxOf('wall'));
    expect(r.kind).toBe('refusal');
    if (r.kind === 'refusal') expect(r.reason).toContain('not-a-property');
  });
});
