/**
 * GE-06 — proof that the twelve declared `clash-*` verbs REFUSE BY NAME, and
 * that a refusal is DISTINGUISHABLE from a clean result.
 *
 * The load-bearing test in this file is §3. Everything else supports it.
 *
 * The defect being closed is not "clash detection is missing" — it is that
 * clash detection's ABSENCE was unobservable. Twelve ids were declared in
 * `commands.ts`; none had a handler; invoking one produced no typed answer a
 * caller could report. "Nothing was found" and "nothing looked" were the same
 * observation (ADR-0322 §5). §3 asserts they are now different VALUES, not
 * merely different sentences.
 *
 * GE-06 ITSELF REMAINS OPEN — these tests assert the refusals are honest, and
 * §5 pins that ZERO detectors exist. No test here claims a clash engine works.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  CLASH_COMMAND_IDS,
  CLASH_PAIR_COVERAGE,
  REGISTERED_CLASH_PAIRS,
  UNCHECKED_CLASH_PAIRS,
  IMPLEMENTED_CLASH_COMMAND_IDS,
  UNIMPLEMENTED_CLASH_COMMAND_IDS,
  isClashCommandId,
  clashCommandStatus,
  clashRefusalText,
  clashCapabilityRefusal,
  createClashRefusalHandler,
  registerClashRefusalHandlers,
  CommandBus,
  type ClashCommandId,
  type ClashRunOutcome,
  type ClashRunReport,
} from '../src/index.js';

const baseAudit = { actorId: 'u', projectId: 'p', clientId: 'c' };

// ─── 1 · The enumeration is the REGISTRY's, re-measured independently ────────

describe('GE-06 §1 — the twelve ids come from the registry, not a hand list', () => {
  /**
   * An INDEPENDENT source for the id set: the `commands.ts` SOURCE TEXT, parsed
   * here, rather than the exported constant. The compile-time bijection in
   * `clashCapability.ts` is the real guarantee, but a type-level proof is
   * invisible to vitest (which strips types), so this re-derives the same fact
   * from a source the module under test does not control.
   *
   * "Probe can be wrong three ways" — asserting the constant against itself
   * would prove only that the constant equals the constant.
   */
  function idsDeclaredInCommandsSource(): string[] {
    const src = readFileSync(
      fileURLToPath(new URL('../src/commands.ts', import.meta.url)),
      'utf8',
    );
    const block = /export type ClashDetectionToolbarCommands = \{([\s\S]*?)\};/.exec(src);
    expect(block, 'ClashDetectionToolbarCommands must exist in commands.ts').not.toBeNull();
    return [...(block![1]!.matchAll(/'([^']+)'\s*:/g))].map((m) => m[1]!);
  }

  it('the exported list EQUALS the ids declared in commands.ts, in count and membership', () => {
    const fromSource = idsDeclaredInCommandsSource();
    expect(fromSource).toHaveLength(12);
    expect([...CLASH_COMMAND_IDS].sort()).toEqual([...fromSource].sort());
  });

  it('every id is distinct and every id is clash-namespaced', () => {
    expect(new Set(CLASH_COMMAND_IDS).size).toBe(CLASH_COMMAND_IDS.length);
    for (const id of CLASH_COMMAND_IDS) expect(id.startsWith('clash-')).toBe(true);
  });

  it('isClashCommandId accepts the twelve and rejects a plausible near-miss', () => {
    for (const id of CLASH_COMMAND_IDS) expect(isClashCommandId(id)).toBe(true);
    // `clash-select-a` is a ClashDetectionToolbar id — declared on the TOOLBAR,
    // never in the command registry. The two sets are famously not the same.
    expect(isClashCommandId('clash-select-a')).toBe(false);
    expect(isClashCommandId('wall.create')).toBe(false);
  });
});

// ─── 2 · Every unimplemented id refuses WITH ITS OWN IDENTITY ───────────────

describe('GE-06 §2 — each unimplemented id refuses with identity', () => {
  it.each([...UNIMPLEMENTED_CLASH_COMMAND_IDS])(
    '%s refuses, naming itself and what is missing',
    (id) => {
      const r = clashCapabilityRefusal(id);
      expect(r.kind).toBe('refused');
      expect(r.reason).toBe('ENGINE_NOT_AVAILABLE');
      expect(r.commandType).toBe(id);
      // The refusal names the verb the user actually invoked — not a generic
      // "unavailable" that leaves them with no move to make (C80 §3.2).
      expect(r.detail).toContain(id);
      expect(r.detail).toContain('NOT IMPLEMENTED');
      expect(r.protects.length).toBeGreaterThan(0);
    },
  );

  it('the twelve refusal texts are DISTINCT — no vague shared default', () => {
    const texts = CLASH_COMMAND_IDS.map((id) => clashRefusalText(id));
    // Each verb names its own missing machinery. If a thirteenth id were added
    // and given a copy-paste sentence, this count drops and the test fails.
    expect(new Set(texts).size).toBe(CLASH_COMMAND_IDS.length);
  });

  it('every refusal NAMES the unchecked pairs rather than counting them', () => {
    const r = clashCapabilityRefusal('clash-run');
    for (const pair of UNCHECKED_CLASH_PAIRS) expect(r.detail).toContain(pair);
    expect(r.detail).toContain('NOT CHECKED');
  });

  it('both numbers are undefined, NOT zero (C80 §1.4 known-vs-unknown)', () => {
    const r = clashCapabilityRefusal('clash-run');
    // `0` here would assert "we looked and nothing was in the way" about a
    // model that nothing examined. `undefined` says the ask named no element
    // set. The distinction is the whole C80 §1.4 rule.
    expect(r.asked).toBeUndefined();
    expect(r.unaccountedFor).toBeUndefined();
    expect(r.asked).not.toBe(0);
    expect(r.unaccountedFor).not.toBe(0);
  });
});

// ─── 3 · THE DELIVERABLE — refusal ≠ empty result ───────────────────────────

describe('GE-06 §3 — "refused because unimplemented" is DISTINGUISHABLE from "ran, found none"', () => {
  /**
   * The counterfactual: what a clash run that ACTUALLY RAN and found nothing
   * would return. Nothing in the product constructs this yet — it exists here
   * precisely so the two outcomes can be held side by side and compared.
   */
  const ranAndFoundNothing: ClashRunReport = {
    kind: 'ran',
    findings: [],
    checkedPairs: ['roof×wall'],
    uncheckedPairs: [],
  };

  const refused = clashCapabilityRefusal('clash-run');

  it('the two outcomes carry DIFFERENT discriminants', () => {
    const a: ClashRunOutcome = ranAndFoundNothing;
    const b: ClashRunOutcome = refused;
    expect(a.kind).toBe('ran');
    expect(b.kind).toBe('refused');
    expect(a.kind).not.toBe(b.kind);
  });

  it('the refusal has NO findings field at all — there is no empty array to misread', () => {
    // This is the structural half of the deliverable. A stub returning
    // `{findings: []}` would be indistinguishable from a real clean run; a
    // refusal that simply HAS NO findings key cannot be mistaken for one, and
    // no caller can accidentally read `[]` out of it.
    expect('findings' in refused).toBe(false);
    expect('findings' in ranAndFoundNothing).toBe(true);
    expect(Object.values(refused).some((v) => Array.isArray(v) && v.length === 0)).toBe(false);
  });

  it('narrowing on kind is REQUIRED to reach findings — the compiler enforces it', () => {
    const outcome: ClashRunOutcome = refused;
    // @ts-expect-error — `findings` is not on the union; you must narrow first.
    void outcome.findings;

    // The legal read, and the reason the union is shaped this way: a caller
    // CANNOT report "0 clashes" without having proved it ran.
    function describe(o: ClashRunOutcome): string {
      return o.kind === 'ran'
        ? `checked ${o.checkedPairs.length} pair(s), ${o.findings.length} finding(s)`
        : `refused: ${o.reason}`;
    }
    expect(describe(ranAndFoundNothing)).toBe('checked 1 pair(s), 0 finding(s)');
    expect(describe(refused)).toBe('refused: ENGINE_NOT_AVAILABLE');
    expect(describe(ranAndFoundNothing)).not.toBe(describe(refused));
  });

  it('a clean run and a refusal never serialise to the same value', () => {
    expect(JSON.stringify(refused)).not.toBe(JSON.stringify(ranAndFoundNothing));
    expect(refused).not.toEqual(ranAndFoundNothing);
  });

  it('the refusal SAYS it is not a clean result, in words the user sees', () => {
    // The type-level proof protects callers. This protects the human reading
    // the sentence, who has no access to the union.
    expect(refused.detail).toContain('This is a REFUSAL, not a clean result');
    expect(refused.detail).toContain('no absence of');
    expect(refused.detail).toContain('GE-06');
  });
});

// ─── 4 · The handler, and the end-to-end path through the real bus ──────────

describe('GE-06 §4 — the refusal survives a real dispatch', () => {
  it('the handler accepts the command and answers with a refusal VALUE', async () => {
    const h = createClashRefusalHandler('clash-run');
    expect(h.type).toBe('clash-run');
    expect(h.affectedStores).toEqual([]);
    // VALID on purpose: an invalid canExecute THROWS, and a throw is
    // swallowable by `catch {}` (C80 §10.f). A refusal must be a value.
    expect(h.canExecute({} as never, {} as never)).toEqual({ valid: true });

    const res = await h.execute({} as never, {} as never);
    expect(res.forward).toEqual([]);
    expect(res.inverse).toEqual([]);
    // Empty patches ALONGSIDE a populated refusal — which is exactly what makes
    // this a determined refusal and not the C16 CA-18(b) silent no-op.
    expect(res.refusal?.kind).toBe('refused');
    expect(res.refusal?.commandType).toBe('clash-run');
  });

  it('dispatching clash-run through CommandBus yields a record CARRYING the refusal', async () => {
    const bus = new CommandBus({ audit: baseAudit, storesProvider: () => ({}) });
    registerClashRefusalHandlers(bus);

    const evt = await bus.executeCommand('clash-run', {});
    // Before this lane, this dispatch threw `no handler registered for:
    // clash-run` — a message about the BUS, saying nothing about clash
    // detection. Now the command is accepted and answers for itself.
    expect(evt.refusal).toBeDefined();
    expect(evt.refusal?.reason).toBe('ENGINE_NOT_AVAILABLE');
    expect(evt.refusal?.commandType).toBe('clash-run');
    expect(evt.forward).toEqual([]);
  });

  it('registers all twelve, and each dispatches to its OWN refusal', async () => {
    const bus = new CommandBus({ audit: baseAudit, storesProvider: () => ({}) });
    const registered = registerClashRefusalHandlers(bus);
    expect(registered).toHaveLength(UNIMPLEMENTED_CLASH_COMMAND_IDS.length);

    for (const id of CLASH_COMMAND_IDS) {
      expect(bus.has(id)).toBe(true);
      const evt = await bus.executeCommand(id, {});
      expect(evt.refusal?.commandType).toBe(id);
    }
  });

  it('DEFERS to a real implementation — an already-registered id is skipped', () => {
    const bus = new CommandBus({ audit: baseAudit, storesProvider: () => ({}) });
    // The day a lane lands a genuine detector, it registers first and wins;
    // nobody has to remember to delete the refusal. Registration would THROW on
    // a duplicate, so skipping is also what keeps boot alive.
    bus.register({
      type: 'clash-run',
      affectedStores: [],
      canExecute: () => ({ valid: true as const }),
      execute: () => ({ forward: [], inverse: [] }),
    });
    const registered = registerClashRefusalHandlers(bus);
    expect(registered).not.toContain('clash-run');
    expect(registered).toHaveLength(UNIMPLEMENTED_CLASH_COMMAND_IDS.length - 1);
  });

  it('is idempotent — registering twice does not throw', () => {
    const bus = new CommandBus({ audit: baseAudit, storesProvider: () => ({}) });
    registerClashRefusalHandlers(bus);
    expect(() => registerClashRefusalHandlers(bus)).not.toThrow();
    expect(registerClashRefusalHandlers(bus)).toHaveLength(0);
  });
});

// ─── 5 · The honest state of GE-06, pinned ──────────────────────────────────

describe('GE-06 §5 — the row is OPEN, and the numbers say so', () => {
  it('ZERO of the twelve clash verbs are implemented', () => {
    expect(IMPLEMENTED_CLASH_COMMAND_IDS).toHaveLength(0);
    expect(UNIMPLEMENTED_CLASH_COMMAND_IDS).toHaveLength(12);
    for (const id of CLASH_COMMAND_IDS) expect(clashCommandStatus(id)).toBe('unimplemented');
  });

  it('ZERO element pairs have a REGISTERED detector', () => {
    expect(REGISTERED_CLASH_PAIRS).toHaveLength(0);
    expect(UNCHECKED_CLASH_PAIRS).toHaveLength(CLASH_PAIR_COVERAGE.length);
  });

  it('roof×wall is EXISTS_BUT_UNWIRED — a real detector that no run calls', () => {
    const roof = CLASH_PAIR_COVERAGE.find((p) => p.pair === 'roof×wall');
    // Kept distinct from REGISTERED on purpose. geometry-roof's detector is
    // real and oracle-tested; counting it as coverage because the code exists
    // is the authored-but-unwired mistake this repo keeps making.
    expect(roof?.state).toBe('EXISTS_BUT_UNWIRED');
    expect(REGISTERED_CLASH_PAIRS).not.toContain('roof×wall');
  });

  it('every pair in the manifest names what is missing', () => {
    for (const p of CLASH_PAIR_COVERAGE) expect(p.note.length).toBeGreaterThan(0);
  });

  it('the exit condition is stated in numbers a future lane can check', () => {
    // GE-06 closes when this flips: detectors registered > 0 and the
    // implemented set is non-empty. Today both are zero, and that is reported,
    // not hidden.
    const implemented: readonly ClashCommandId[] = IMPLEMENTED_CLASH_COMMAND_IDS;
    expect(implemented.length + REGISTERED_CLASH_PAIRS.length).toBe(0);
  });
});
