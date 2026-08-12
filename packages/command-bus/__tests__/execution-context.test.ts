/**
 * BIM30 R1 — the invocation envelope through the REAL CommandBus
 * (ADR-0324 §1–2) and the G-REASON-04 normalize rule (ADR-0324 §3).
 *
 * Three properties pinned here:
 *   1. context in → context on the record, VERBATIM (same reference).
 *   2. context absent → the `context` PROPERTY is absent (not `undefined`) —
 *      legacy records stay byte-identical on the wire, so R1 is provably
 *      zero-behaviour-change for every existing caller.
 *   3. `normalizeForParity` strips EXACTLY actor / origin / timestamp /
 *      approval: two executions of the same command + payload that differ
 *      only in those (different bus actor identity, different envelope,
 *      different ULIDs/timestamps) normalize deep-equal — and a PAYLOAD
 *      difference still shows through (the rule must not over-strip).
 */

import { describe, expect, it } from 'vitest';
import {
  CommandBus,
  normalizeForParity,
  type CommandExecutionContext,
  type CommandHandler,
  type EventRecord,
  type ValidationResult,
} from '../src/index.js';

interface MovePayload {
  readonly id: string;
  readonly dx: number;
}

/** A handler that produces REAL patches so records have full shape. */
class MoveHandler implements CommandHandler<MovePayload> {
  readonly type = 'test.move';
  readonly affectedStores = ['wall'] as const;
  canExecute(): ValidationResult {
    return { valid: true };
  }
  execute(_ctx: unknown, cmd: MovePayload) {
    return {
      forward: [{ op: 'replace' as const, path: [cmd.id, 'x'], value: cmd.dx }],
      inverse: [{ op: 'replace' as const, path: [cmd.id, 'x'], value: 0 }],
    };
  }
}

function makeBus(actorId: string, clientId: string): CommandBus {
  const bus = new CommandBus({
    audit: { actorId, projectId: 'proj-1', clientId },
    storesProvider: () => ({ wall: {} }),
  });
  bus.register(new MoveHandler());
  return bus;
}

const aiContext: CommandExecutionContext = {
  actor: { kind: 'ai', id: 'agent-1' },
  origin: { surface: 'chat', proposalId: 'prop-9' },
  approval: { proposalId: 'prop-9', approvedBy: 'user-7', rationale: 'ok' },
};

describe('CommandExecutionContext envelope (ADR-0324 §1–2, R1)', () => {
  it('context in → context on the record, verbatim', async () => {
    const bus = makeBus('user-7', 'tab-a');
    const record = await bus.executeCommand(
      'test.move',
      { id: 'w1', dx: 0.3 },
      { context: aiContext },
    );
    expect(record.context).toBe(aiContext);
    expect(record.context?.actor.kind).toBe('ai');
    expect(record.context?.approval?.approvedBy).toBe('user-7');
  });

  it('context absent → the property is ABSENT, not undefined', async () => {
    const bus = makeBus('user-7', 'tab-a');
    const record = await bus.executeCommand('test.move', { id: 'w1', dx: 0.3 });
    expect('context' in record).toBe(false);
    // and the reserved consequence slot is likewise not materialised
    expect('consequence' in record).toBe(false);
  });

  it('the envelope changes nothing else about the record', async () => {
    const bus = makeBus('user-7', 'tab-a');
    const withCtx = await bus.executeCommand(
      'test.move',
      { id: 'w1', dx: 0.3 },
      { context: aiContext },
    );
    const withoutCtx = await bus.executeCommand('test.move', { id: 'w1', dx: 0.3 });
    const strip = (r: EventRecord<MovePayload>) => {
      const { id: _i, audit: _a, patches, context: _c, ...rest } = r;
      return { ...rest, patches: patches.map(({ capturedAt: _t, ...p }) => p) };
    };
    expect(strip(withCtx)).toEqual(strip(withoutCtx));
  });
});

describe('normalizeForParity (ADR-0324 §3 — authored in R1, gated in R7)', () => {
  it('records differing ONLY in actor/origin/timestamp/approval normalize equal', async () => {
    // Human path: different bus actor identity, no envelope.
    const humanBus = makeBus('user-7', 'tab-a');
    const humanRecord = await humanBus.executeCommand('test.move', { id: 'w1', dx: 0.3 });

    // AI path: different actorId + clientId, full AI envelope, later timestamps,
    // different ULID — identical command + payload.
    const aiBus = makeBus('svc-ai', 'tab-b');
    const aiRecord = await aiBus.executeCommand(
      'test.move',
      { id: 'w1', dx: 0.3 },
      { context: aiContext },
    );

    // Sanity: the raw records DO differ (otherwise the test proves nothing).
    expect(humanRecord.id).not.toBe(aiRecord.id);
    expect(humanRecord.audit.actorId).not.toBe(aiRecord.audit.actorId);
    expect('context' in humanRecord).toBe(false);
    expect(aiRecord.context).toBe(aiContext);

    expect(normalizeForParity(humanRecord)).toEqual(normalizeForParity(aiRecord));
  });

  it('does NOT over-strip: a payload difference survives normalization', async () => {
    const bus = makeBus('user-7', 'tab-a');
    const a = await bus.executeCommand('test.move', { id: 'w1', dx: 0.3 });
    const b = await bus.executeCommand('test.move', { id: 'w1', dx: 0.7 });
    expect(normalizeForParity(a)).not.toEqual(normalizeForParity(b));
  });

  it('keeps projectId — cross-project records never normalize equal', async () => {
    const bus = makeBus('user-7', 'tab-a');
    const record = await bus.executeCommand('test.move', { id: 'w1', dx: 0.3 });
    expect(normalizeForParity(record).projectId).toBe('proj-1');
  });

  it('is pure — the input record is not mutated', async () => {
    const bus = makeBus('user-7', 'tab-a');
    const record = await bus.executeCommand(
      'test.move',
      { id: 'w1', dx: 0.3 },
      { context: aiContext },
    );
    const before = JSON.stringify(record);
    normalizeForParity(record);
    expect(JSON.stringify(record)).toBe(before);
  });
});
