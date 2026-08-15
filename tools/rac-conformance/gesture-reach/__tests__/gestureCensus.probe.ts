// ─── CE-05 gesture→command census — the CONTROLS, run in CI ─────────────────
//
// The four controls also run in-run inside `check-gesture-command-census.ts`
// itself (a control that only runs when a human remembers to run it is not a
// control). This file exists so they ALSO run in the suite, and so the three
// planted-defect records in that file's header are re-derivable by anyone
// reading them rather than taken on trust: each `it` below plants the SAME
// defect the header names, in the same shape, and asserts the comparator goes
// red. §7.5: "A comparator that has never failed has not been shown to be able
// to."
//
// Named `*.probe.ts` to match the include glob already in ./vitest.config.ts.
// Run: npx vitest run --config tools/rac-conformance/gesture-reach/vitest.config.ts

import { describe, it, expect } from 'vitest';
import {
  stripComments, extractSites, literalOf, classifySite,
  type RawSite, type FileFacts,
} from '../check-gesture-command-census.js';

const site = (firstArg: string, file = 'fixture/F.ts'): RawSite =>
  ({ file, line: 1, receiver: 'bus', firstArg });
const facts = (importers: string[], gestureBinding = true): FileFacts =>
  ({ importers, gestureBinding });

// The identical fixture the gate uses for CONTROL C1.
const C1_FIXTURE = [
  `interface Bus { executeCommand(type: string, payload: unknown): Promise<unknown>; }`,
  `// legacy: bus.executeCommand('wall.deleteOld', {});`,
  `/* migrate to runtime.bus.executeCommand('room.legacy', {}); */`,
  `btn.addEventListener('click', () => { void bus.executeCommand('wall.create', { id: 'w1' }); });`,
].join('\n');

describe('CE-05 census · CONTROL C1 — the extractor admits dispatches, not strings', () => {
  it('admits exactly 1 of 4 occurrences and itemises the other 3', () => {
    const r = extractSites('fixture/C1.ts', C1_FIXTURE);
    expect(r.occurrences).toBe(4);
    expect(r.sites).toHaveLength(1);
    expect(r.excluded.comment).toBe(2);
    expect(r.excluded['type-declaration']).toBe(1);
    expect(literalOf(r.sites[0]!.firstArg)).toBe('wall.create');
  });

  it('NEGATIVE — without comment stripping the same fixture yields 3 sites (RULE 1 reason 3)', () => {
    // The planted defect from the header: stripComments returns src unchanged.
    // Re-derived here so the header's "admitted 3 sites" is checkable, not trusted.
    const raw = (C1_FIXTURE.match(/\bexecuteCommand\s*\(/g) ?? []).length;
    expect(raw).toBe(4);
    const stripped = stripComments(C1_FIXTURE).stripped;
    expect(stripped).not.toContain('wall.deleteOld');   // // comment gone
    expect(stripped).not.toContain('room.legacy');      // /* */ comment gone
    expect(stripped).toContain('wall.create');          // the real call survives
    // and the un-stripped source still contains all three, which is the defect
    expect(C1_FIXTURE).toContain('wall.deleteOld');
  });

  it('preserves line numbers while stripping, so findings point at real lines', () => {
    expect(stripComments(C1_FIXTURE).stripped.split('\n')).toHaveLength(4);
  });
});

describe('CE-05 census · CONTROL C2 — the POSITIVE control (the gate is not stuck red)', () => {
  it('a literal dispatch from an imported surface is RESOLVED-ONLY, not a finding', () => {
    const c = classifySite(site(`'wall.create'`), facts(['a.ts', 'b.ts']));
    expect(c.verdict).toBe('RESOLVED-ONLY');
    expect(c.commandId).toBe('wall.create');
    expect(c.reason).toBeNull();
  });

  it('RESOLVED-ONLY is never EXECUTED-REACHED — this instrument executes nothing', () => {
    const c = classifySite(site(`'wall.create'`), facts(['a.ts']));
    expect(c.verdict).not.toBe('EXECUTED-REACHED');
  });
});

describe('CE-05 census · CONTROL C3 — the PLANTED UNREACHABLE GESTURE (the L-847 shape)', () => {
  it('a literal dispatch from a zero-importer surface is NOT-REACHED', () => {
    const c = classifySite(
      site(`'wall.create'`, 'fixture/planted/DeadWorkbench.ts'),
      facts([], true),
    );
    expect(c.verdict).toBe('NOT-REACHED');
    expect(c.commandId).toBe('wall.create');
    expect(c.reason).toContain('zero production importers');
    expect(c.reason).toContain('BINDS A GESTURE');
  });

  it('the SAME site with one importer flips clean — the arm keys on reachability, not on the file', () => {
    const c = classifySite(
      site(`'wall.create'`, 'fixture/planted/DeadWorkbench.ts'),
      facts(['apps/editor/src/ui/Host.ts'], true),
    );
    expect(c.verdict).toBe('RESOLVED-ONLY');
  });
});

describe('CE-05 census · CONTROL C4 — the PLANTED UNDETERMINED site', () => {
  it.each([
    ['cmd.type', 'non-literal-first-argument'],
    ['commandType', 'non-literal-first-argument'],
    ['def.commandType', 'non-literal-first-argument'],
    ['...spread', 'spread-first-argument'],
    ['', 'empty-or-unparsed-first-argument'],
    ['`view.${kind}`', 'interpolated-template-first-argument'],
  ])('%s is UNPROVEN with a reason, never silently covered', (arg, reasonKind) => {
    const c = classifySite(site(arg), facts(['a.ts']));
    expect(c.verdict).toBe('UNPROVEN');
    expect(c.commandId).toBeNull();
    expect(c.reason).toContain(reasonKind);
  });

  it('an UNPROVEN site is a FINDING — it is never folded into the covered count', () => {
    const undetermined = classifySite(site('cmd.type'), facts(['a.ts']));
    const determined = classifySite(site(`'wall.create'`), facts(['a.ts']));
    expect(undetermined.verdict).not.toBe(determined.verdict);
  });

  it('NEGATIVE — a greedy literalOf that returns the raw expression would invent an id', () => {
    // The planted defect from the header, re-derived: literalOf must return null,
    // not the expression, or `cmd.type` becomes a command id and the census
    // reports coverage it does not have.
    expect(literalOf('cmd.type')).toBeNull();
    expect(literalOf('commandType')).toBeNull();
    expect(literalOf(`'wall.create'`)).toBe('wall.create');
    expect(literalOf('`view.${kind}`')).toBeNull();
    expect(literalOf(`''`)).toBeNull();
  });
});

describe('CE-05 census · the first-argument scanner', () => {
  it('takes the FIRST argument, not the payload, across nesting and quotes', () => {
    const src = `bus.executeCommand('wall.create', { id: 'w,1', pts: [[0,0],[1,1]] });`;
    const r = extractSites('f.ts', src);
    expect(r.sites).toHaveLength(1);
    expect(literalOf(r.sites[0]!.firstArg)).toBe('wall.create');
  });

  it('handles a bare call with no receiver', () => {
    const r = extractSites('f.ts', `await executeCommand('room.update', {});`);
    expect(r.sites).toHaveLength(1);
    expect(literalOf(r.sites[0]!.firstArg)).toBe('room.update');
  });
});
