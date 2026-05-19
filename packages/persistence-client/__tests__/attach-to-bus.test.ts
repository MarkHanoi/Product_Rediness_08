// `attachEventLog` integration test — wires the L2 PatchEmitter to the
// L0 EventLog and proves end-to-end command → patches → event → log.
//
// Spec: `phases/PHASE-1A-Q1-M1-M3-SKELETON-RAILS.md` §S04-T3 (line 437):
//   "Wire `EventLog` into `command-bus.PatchEmitter` (D4, Agent A):
//    end-to-end: command → patches → event → log."

import { describe, expect, it } from 'vitest';
import {
  CommandBus,
  PatchEmitter,
  produceCommand,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/command-bus';
import { attachEventLog, EventLog, InMemoryBackend } from '../src/index.js';

interface CubeState {
  x: number;
  y: number;
  z: number;
}
type CubeStores = Readonly<{ cube: Record<string, CubeState> } & Record<string, unknown>>;

class MoveCube implements CommandHandler<{ id: string; dx: number; dy: number; dz: number }, CubeStores> {
  readonly type = 'cube.move';
  readonly affectedStores = ['cube'] as const;
  canExecute(): ValidationResult {
    return { valid: true };
  }
  execute(ctx: HandlerContext<CubeStores>, cmd: { id: string; dx: number; dy: number; dz: number }): HandlerResult {
    const [next, forward, inverse] = produceCommand<Record<string, CubeState>>(
      ctx.stores.cube,
      (draft) => {
        const c = draft[cmd.id] ?? { x: 0, y: 0, z: 0 };
        c.x += cmd.dx;
        c.y += cmd.dy;
        c.z += cmd.dz;
        draft[cmd.id] = c;
      },
    );
    return { forward, inverse, nextStates: { cube: next } };
  }
}

function makeBus(): CommandBus {
  const cubes: Record<string, CubeState> = {};
  const bus = new CommandBus({
    audit: { actorId: 'user-1', projectId: 'p-1', clientId: 'tab-1' },
    storesProvider: () => ({ cube: cubes }),
  });
  bus.register(new MoveCube());
  return bus;
}

describe('attachEventLog (S04-T3)', () => {
  it('persists every committed event to the EventLog', async () => {
    const bus = makeBus();
    const backend = new InMemoryBackend();
    const log = new EventLog(backend);
    const persisted: number[] = [];
    const att = attachEventLog(bus.patches, log, {
      onPersisted: (p) => persisted.push(p.seq),
    });
    for (let i = 0; i < 5; i++) {
      await bus.executeCommand('cube.move', { id: 'c-1', dx: 1, dy: 0, dz: 0 });
    }
    await att.flush();
    expect(await log.highestSeq()).toBe(5);
    expect(persisted).toEqual([1, 2, 3, 4, 5]);
    const seqs: number[] = [];
    for await (const ev of log.replay()) seqs.push(ev.seq);
    expect(seqs).toEqual([1, 2, 3, 4, 5]);
    att.unsubscribe();
    await log.close();
  });

  it('preserves commandId, audit and per-store patches end-to-end', async () => {
    const bus = makeBus();
    const backend = new InMemoryBackend();
    const log = new EventLog(backend);
    const att = attachEventLog(bus.patches, log);
    const record = await bus.executeCommand('cube.move', { id: 'c-2', dx: 2, dy: 3, dz: 0 });
    await att.flush();
    const all: Awaited<ReturnType<typeof log.replay>>[number] = await firstReplayed(log);
    // The persisted event MUST quote the L2 record verbatim.
    expect(all.event.id).toBe(record.id);
    expect(all.event.audit).toEqual(record.audit);
    expect(all.event.affectedStores).toEqual(['cube']);
    expect(all.event.patches).toHaveLength(1);
    expect(all.event.patches[0]!.storeKey).toBe('cube');
    expect(all.seq).toBe(1);
    att.unsubscribe();
    await log.close();
  });

  it('unsubscribes cleanly — no further events persisted after detach', async () => {
    const bus = makeBus();
    const backend = new InMemoryBackend();
    const log = new EventLog(backend);
    const att = attachEventLog(bus.patches, log);
    await bus.executeCommand('cube.move', { id: 'c-3', dx: 1, dy: 0, dz: 0 });
    await att.flush();
    expect(await log.highestSeq()).toBe(1);
    att.unsubscribe();
    // unsubscribe is idempotent
    att.unsubscribe();
    await bus.executeCommand('cube.move', { id: 'c-3', dx: 1, dy: 0, dz: 0 });
    await att.flush();
    expect(await log.highestSeq()).toBe(1);
    await log.close();
  });

  it('routes append rejections to onError without breaking the bus', async () => {
    const bus = makeBus();
    const backend = new InMemoryBackend();
    const log = new EventLog(backend);
    // Sabotage the next backend.append.
    const original = backend.append.bind(backend);
    let calls = 0;
    backend.append = async (ev) => {
      calls++;
      if (calls === 2) throw new Error('sabotage');
      return original(ev);
    };
    const errors: string[] = [];
    const att = attachEventLog(bus.patches, log, {
      onError: (err) => errors.push((err as Error).message),
    });
    await bus.executeCommand('cube.move', { id: 'c-4', dx: 1, dy: 0, dz: 0 });
    await bus.executeCommand('cube.move', { id: 'c-4', dx: 1, dy: 0, dz: 0 }); // sabotaged
    await bus.executeCommand('cube.move', { id: 'c-4', dx: 1, dy: 0, dz: 0 });
    await att.flush();
    expect(errors).toEqual(['sabotage']);
    // Two events landed (the sabotaged one was skipped at the backend layer).
    expect(await log.highestSeq()).toBe(3);
    expect(backend.size()).toBe(2);
    await log.close();
  });
});

async function firstReplayed(log: EventLog): Promise<Awaited<ReturnType<typeof log.replay>>[number]> {
  for await (const ev of log.replay()) return ev as never;
  throw new Error('expected at least one replayed event');
}
