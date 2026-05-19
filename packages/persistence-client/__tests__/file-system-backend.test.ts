// FileSystemBackend tests (W-09).
//
// Covers:
//   1. Round-trip: append N events, replay, get N back in order.
//   2. Replay filters by `fromSeq`.
//   3. Checkpoint persists across backend instances.
//   4. Non-monotonic seq is rejected.
//   5. Empty (never-appended) directory replays nothing.
//   6. Close() makes further calls throw EventLogClosedError.

import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
// `EventLogClosedError` lives in the browser-safe barrel; `FileSystemBackend`
// is only re-exported from the `/node` sub-entry to keep `node:fs/promises` +
// `node:path` out of the browser bundle (see ../src/node.ts header).
import { EventLogClosedError, type PersistedEvent } from '../src/index.js';
import { FileSystemBackend } from '../src/node.js';

function ev(seq: number, kind = 'noop'): PersistedEvent {
  return {
    seq,
    type: 'patch',
    payload: { kind, when: seq },
    schemaVersion: 1,
    createdAt: new Date(seq * 1000).toISOString(),
  };
}

async function collect(it: AsyncIterable<PersistedEvent>): Promise<PersistedEvent[]> {
  const out: PersistedEvent[] = [];
  for await (const e of it) out.push(e);
  return out;
}

describe('FileSystemBackend (W-09)', () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'pryzm-fs-backend-'));
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it('rejects construction without a projectPath', () => {
    expect(() => new FileSystemBackend({ projectPath: '' })).toThrow();
  });

  it('round-trips appended events through replay', async () => {
    const backend = new FileSystemBackend({ projectPath: tmp });
    for (let s = 1; s <= 20; s++) await backend.append(ev(s));
    const seen = await collect(backend.replay(0));
    expect(seen.map((e) => e.seq)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    expect(await backend.size()).toBe(20);
    expect(await backend.exists()).toBe(true);
    await backend.close();
  });

  it('replay(fromSeq) filters out earlier events', async () => {
    const backend = new FileSystemBackend({ projectPath: tmp });
    for (let s = 1; s <= 10; s++) await backend.append(ev(s));
    const seen = await collect(backend.replay(7));
    expect(seen.map((e) => e.seq)).toEqual([7, 8, 9, 10]);
    await backend.close();
  });

  it('persists checkpoint across backend instances', async () => {
    const a = new FileSystemBackend({ projectPath: tmp });
    for (let s = 1; s <= 5; s++) await a.append(ev(s));
    await a.checkpoint(4);
    expect(await a.lastCheckpoint()).toBe(4);
    expect(await a.highestSeq()).toBe(5);
    await a.close();

    const b = new FileSystemBackend({ projectPath: tmp });
    expect(await b.lastCheckpoint()).toBe(4);
    expect(await b.highestSeq()).toBe(5);
    const seen = await collect(b.replay(0));
    expect(seen).toHaveLength(5);
    await b.close();
  });

  it('rejects backwards checkpoint', async () => {
    const backend = new FileSystemBackend({ projectPath: tmp });
    await backend.append(ev(1));
    await backend.checkpoint(1);
    await expect(backend.checkpoint(0)).rejects.toThrow(/cannot go backwards/);
    await backend.close();
  });

  it('rejects non-monotonic seq', async () => {
    const backend = new FileSystemBackend({ projectPath: tmp });
    await backend.append(ev(5));
    await expect(backend.append(ev(5))).rejects.toThrow(/non-monotonic/);
    await expect(backend.append(ev(3))).rejects.toThrow(/non-monotonic/);
    await backend.close();
  });

  it('empty directory replays nothing and reports zero seqs', async () => {
    const backend = new FileSystemBackend({ projectPath: tmp });
    expect(await backend.exists()).toBe(false);
    expect(await backend.highestSeq()).toBe(0);
    expect(await backend.lastCheckpoint()).toBe(0);
    expect(await collect(backend.replay(0))).toEqual([]);
    await backend.close();
  });

  it('close() makes further calls throw EventLogClosedError', async () => {
    const backend = new FileSystemBackend({ projectPath: tmp });
    await backend.append(ev(1));
    await backend.close();
    await expect(backend.append(ev(2))).rejects.toThrow(EventLogClosedError);
    await expect(backend.highestSeq()).rejects.toThrow(EventLogClosedError);
  });

  it('stores one event per line as NDJSON', async () => {
    const backend = new FileSystemBackend({ projectPath: tmp });
    for (let s = 1; s <= 3; s++) await backend.append(ev(s));
    const raw = await readFile(backend.logFilePath, 'utf8');
    const lines = raw.split('\n').filter((l) => l.length > 0);
    expect(lines).toHaveLength(3);
    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
    await backend.close();
  });
});
