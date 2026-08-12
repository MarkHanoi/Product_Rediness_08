// @vitest-environment happy-dom
//
// §FIX-SLAB-BATCH-REFUSAL-DISCARDED — the refusal must reach the BUS CALLER.
//
// ENVIRONMENT, per-file and deliberately NOT repo-wide: both bridges under test
// read `window.commandManager` and dispatch a `CustomEvent` on `window`, so a
// DOM-like global is required. The package's vitest.config.ts stays `node` — the
// existing store/handler suite needs no DOM and must not silently acquire one.
// (plugins/rooms hit this same wall and switched its WHOLE config; scoping it to
// the one file that needs it is the narrower move.)
//
// SUBJECT: check-authoritative-state arm S1's finding
// "S1 slab.updateSystemTypeBatch: dispatch reported ok=true and moved ZERO
//  authoritative paths … The handler DID emit a report event … so the refusal
//  exists but never reaches the bus caller."
//
// The COMMAND was always honest — it refuses and NAMES its rule. The BRIDGE
// discarded that verdict and returned `{forward:[],inverse:[]}`, which the bus
// reads as success. C16 §5.1 CA-18 names that exact shape as prohibited.
//
// WHAT EVERY ASSERTION HERE IS ON: the DISCRIMINANT (rejected vs resolved) and
// the RULE SENTENCE the command wrote. Never "it did not throw" — that is the
// assertion that let this defect live, because the old handler never threw and
// never succeeded either.
//
// THE HANDLERS ARE THE REAL EXPORTS, driven through a REAL CommandBus, exactly
// as certification/world.ts drives them. `window.commandManager` is the ONLY
// stand-in, and it stands in for the thing the defect is about — a sink that
// returns `{success:false, info:[reason]}` WITHOUT throwing, which is precisely
// what CommandManagerImpl.execute does (:172-185).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CommandBus } from '@pryzm/plugin-sdk';
import {
  UpdateSlabsSystemTypeBatchHandler,
  SLAB_TYPE_BATCH_REPORT_EVENT,
  type SlabTypeBatchReport,
} from '../src/handlers/UpdateSlabsSystemTypeBatch.js';
import { CreateSlabsOnAllFloorsHandler } from '../src/handlers/CreateSlabsOnAllFloors.js';

interface LegacyResult {
  success: boolean;
  affectedElementIds: string[];
  info?: string[];
}

/** The window facet both bridges reach through. */
interface TestWindow {
  commandManager?: { execute(cmd: unknown, options?: unknown): LegacyResult } | undefined;
}
const testWindow = (): TestWindow => globalThis.window as unknown as TestWindow;

function makeBus(): CommandBus {
  const bus = new CommandBus({
    audit: { actorId: 'test', projectId: 'p1', clientId: 't1' },
    storesProvider: () => ({ slab: {} }),
  });
  bus.register(UpdateSlabsSystemTypeBatchHandler as never);
  bus.register(new CreateSlabsOnAllFloorsHandler() as never);
  return bus;
}

/** Install a legacy sink that returns `verdict` and never throws — the shape
 *  CommandManagerImpl.execute really has for a refused command. */
function installCommandManager(verdict: LegacyResult): { calls: unknown[] } {
  const calls: unknown[] = [];
  testWindow().commandManager = {
    execute(cmd: unknown): LegacyResult {
      calls.push(cmd);
      return verdict;
    },
  };
  return { calls };
}

/** Every `pryzm-slab-type-batch-report` fired during `fn`. */
async function captureReports(fn: () => Promise<void>): Promise<SlabTypeBatchReport[]> {
  const seen: SlabTypeBatchReport[] = [];
  const listener = (e: Event): void => {
    seen.push((e as CustomEvent).detail as SlabTypeBatchReport);
  };
  window.addEventListener(SLAB_TYPE_BATCH_REPORT_EVENT, listener);
  try {
    await fn();
  } finally {
    window.removeEventListener(SLAB_TYPE_BATCH_REPORT_EVENT, listener);
  }
  return seen;
}

const PAYLOAD = { slabIds: ['cert-slab-1'], systemType: 'RC Slab – Monolithic 200mm' } as const;

// The exact sentence UpdateSlabsSystemTypeBatchCommand.ts:210 writes when
// ctx.stores.slabSystemTypeStore is absent — the S1 finding quotes it verbatim.
const CATALOGUE_ABSENT = 'The slab type catalogue is not available here.';

describe('§FIX-SLAB-BATCH-REFUSAL-DISCARDED · slab.updateSystemTypeBatch', () => {
  let bus: CommandBus;

  beforeEach(() => {
    bus = makeBus();
  });
  afterEach(() => {
    testWindow().commandManager = undefined;
    vi.restoreAllMocks();
  });

  it('THE DEFECT: catalogue absent → the dispatch REJECTS and carries the rule sentence', async () => {
    installCommandManager({ success: false, affectedElementIds: [], info: [CATALOGUE_ABSENT] });

    // The discriminant. Before the fix this resolved — indistinguishable, at the
    // dispatch site, from "every slab was retyped".
    await expect(bus.executeCommand('slab.updateSystemTypeBatch' as never, PAYLOAD as never))
      .rejects.toThrow(CATALOGUE_ABSENT);
  });

  it('the rejection NAMES the verb as well as the rule, so a caller can route it', async () => {
    installCommandManager({ success: false, affectedElementIds: [], info: [CATALOGUE_ABSENT] });

    const err = await bus
      .executeCommand('slab.updateSystemTypeBatch' as never, PAYLOAD as never)
      .then(() => null, (e: unknown) => e as Error);

    expect(err).toBeInstanceOf(Error);
    expect(err!.message).toContain('slab.updateSystemTypeBatch');
    expect(err!.message).toContain(CATALOGUE_ABSENT);
  });

  it('the CustomEvent still carries the refusal — the event was never the defect', async () => {
    installCommandManager({ success: false, affectedElementIds: [], info: [CATALOGUE_ABSENT] });

    const reports = await captureReports(async () => {
      await bus
        .executeCommand('slab.updateSystemTypeBatch' as never, PAYLOAD as never)
        .catch(() => undefined);
    });

    expect(reports).toHaveLength(1);
    expect(reports[0]!.success).toBe(false);
    expect(reports[0]!.info[0]).toBe(CATALOGUE_ABSENT);
  });

  it('an UNKNOWN TYPE refusal reaches the caller too — same channel, its own sentence', async () => {
    // The command lists the real catalogue names in this refusal (:216-218).
    const unknownType =
      'There is no slab type called "granite". The slab types here are: RC Slab – Monolithic 200mm.';
    installCommandManager({ success: false, affectedElementIds: [], info: [unknownType] });

    await expect(
      bus.executeCommand('slab.updateSystemTypeBatch' as never, {
        slabIds: 'all',
        systemType: 'granite',
      } as never),
    ).rejects.toThrow(/no slab type called "granite"/);
  });

  it('a refusal with an EMPTY info array still rejects — and says a reason was withheld', async () => {
    // Honesty over invention: the bridge must not manufacture refusal copy, and
    // must not fall back to success because the sentence is missing.
    installCommandManager({ success: false, affectedElementIds: [], info: [] });

    await expect(bus.executeCommand('slab.updateSystemTypeBatch' as never, PAYLOAD as never))
      .rejects.toThrow(/no reason was given/);
  });

  it('no command manager → REJECTS, and the indeterminate report still goes out', async () => {
    testWindow().commandManager = undefined;

    const reports = await captureReports(async () => {
      await expect(bus.executeCommand('slab.updateSystemTypeBatch' as never, PAYLOAD as never))
        .rejects.toThrow(/command manager is not available/);
    });

    // The W2-B indeterminate report is preserved verbatim: "did not run" is a
    // refusal to claim anything, not a failure claim.
    expect(reports).toHaveLength(1);
    expect(reports[0]!.outcome).toBe('indeterminate');
    expect(reports[0]!.success).toBe(false);
  });

  it('a THROWING sink → REJECTS, and the indeterminate report still goes out', async () => {
    testWindow().commandManager = {
      execute(): LegacyResult {
        throw new Error('legacy stack exploded');
      },
    };
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const reports = await captureReports(async () => {
      await expect(bus.executeCommand('slab.updateSystemTypeBatch' as never, PAYLOAD as never))
        .rejects.toThrow(/legacy stack exploded/);
    });

    expect(reports).toHaveLength(1);
    expect(reports[0]!.outcome).toBe('indeterminate');
  });

  // ── THE OTHER HALF OF THE PROOF: zero behaviour change on success ──────────

  it('SUCCESS PATH UNCHANGED — the dispatch RESOLVES, and the report is byte-identical', async () => {
    const applied: LegacyResult = {
      success: true,
      affectedElementIds: ['cert-slab-1'],
      info: ['Retyped 1 of 1 slab.'],
    };
    const { calls } = installCommandManager(applied);

    const reports = await captureReports(async () => {
      // Resolves. No throw, no rejection — exactly as before the fix.
      await bus.executeCommand('slab.updateSystemTypeBatch' as never, PAYLOAD as never);
    });

    expect(calls).toHaveLength(1);
    expect(reports).toEqual([
      {
        success: true,
        info: ['Retyped 1 of 1 slab.'],
        affectedElementIds: ['cert-slab-1'],
      },
    ]);
    // `outcome` is ABSENT on the ordinary applied path (it is derived from
    // `success` downstream) — asserted explicitly so a future edit that starts
    // stamping it is caught as the behaviour change it would be.
    expect('outcome' in reports[0]!).toBe(false);
  });

  it('SUCCESS PATH UNCHANGED — a PARTIAL result is still a success at the bus', async () => {
    // §CONTEXT-DATA-HONESTY: "Retyped 12 of 40 — 28 skipped" is a SUCCESS with a
    // caveat, and the caveat travels on the event. Turning it into a rejection
    // would be a new defect, so it is pinned here.
    installCommandManager({
      success: true,
      affectedElementIds: ['s1', 's2'],
      info: ['Retyped 2 of 40 slabs — 38 skipped: a raked slab cannot take a layered type'],
    });

    const reports = await captureReports(async () => {
      await bus.executeCommand('slab.updateSystemTypeBatch' as never, {
        slabIds: 'all',
        systemType: 'RC Slab – Monolithic 200mm',
      } as never);
    });

    expect(reports[0]!.success).toBe(true);
    expect(reports[0]!.info[0]).toMatch(/38 skipped/);
  });

  it('payload-shape refusals still come from canExecute, BEFORE the sink is touched', async () => {
    // The canExecute/execute split is unchanged: shape is a canExecute question,
    // catalogue availability is not (it is a legacy-context fact). Proven by the
    // sink never being called.
    const { calls } = installCommandManager({ success: true, affectedElementIds: [], info: [] });

    await expect(
      bus.executeCommand('slab.updateSystemTypeBatch' as never, {
        slabIds: ['s1'],
        systemType: '',
      } as never),
    ).rejects.toThrow(/systemType \(id or name\) is required/);

    expect(calls).toHaveLength(0);
  });
});

describe('§FIX-SLAB-BATCH-REFUSAL-DISCARDED · slab.create-on-all-floors (sibling site)', () => {
  let bus: CommandBus;

  beforeEach(() => {
    bus = makeBus();
  });
  afterEach(() => {
    testWindow().commandManager = undefined;
    vi.restoreAllMocks();
  });

  it('a refused create REJECTS with the command\'s own sentence', async () => {
    installCommandManager({
      success: false,
      affectedElementIds: [],
      info: ['Reference slab slab-nope not found.'],
    });

    await expect(
      bus.executeCommand('slab.create-on-all-floors' as never, {
        referenceSlabId: 'slab-nope',
      } as never),
    ).rejects.toThrow(/Reference slab slab-nope not found\./);
  });

  it('no command manager → REJECTS rather than reporting a silent success', async () => {
    testWindow().commandManager = undefined;

    await expect(
      bus.executeCommand('slab.create-on-all-floors' as never, {
        referenceSlabId: 'slab-1',
      } as never),
    ).rejects.toThrow(/command manager is not available/);
  });

  it('SUCCESS PATH UNCHANGED — an applied create RESOLVES', async () => {
    const { calls } = installCommandManager({
      success: true,
      affectedElementIds: ['slab-2', 'slab-3'],
      info: [],
    });

    await bus.executeCommand('slab.create-on-all-floors' as never, {
      referenceSlabId: 'slab-1',
    } as never);

    expect(calls).toHaveLength(1);
  });
});
