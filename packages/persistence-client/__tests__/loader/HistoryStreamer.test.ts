// loader/HistoryStreamer.test.ts — history-on-demand (S23 exit #5).
//
// Spec source: `phases/PHASE-1D-Q4-M10-M12-BAKE-PRYZM-ALPHA.md`
//   • §S23 D7 (line 1241) — "loadHistorySegment(fromSeq, toSeq) —
//     fetches 500 events from sync server's `LoadEvents` handler"
//   • §S23 exit criterion #5 (line 1256) — "loadHistorySegment(0,
//     499) returns events correctly."
//
// Pagination semantics — fromSeq/toSeq are INCLUSIVE; matches
// sync-server's `events.load` frame (PHASE-1D §S22 lines 919-945).

import { describe, expect, it } from 'vitest';

import {
  HistoryStreamer,
  HistorySequenceGapError,
  MAX_HISTORY_PAGE_SIZE,
  type LinearisedHistoryEvent,
} from '../../src/loader/index.js';

function makeEvent(seq: number): LinearisedHistoryEvent {
  return {
    id: `ev-${seq}`,
    sequenceNumber: seq,
    projectId: 'p-test',
    timestamp: 1_700_000_000_000 + seq,
    userId: 'u-1',
    clientId: 'c-1',
    type: 'wall.create',
    payload: { idx: seq },
  };
}

describe('HistoryStreamer — pagination', () => {
  it('returns the requested inclusive range', async () => {
    const all = Array.from({ length: 1500 }, (_, i) => makeEvent(i));
    const fetcher = async ({
      fromSeq,
      limit,
    }: {
      projectId: string;
      fromSeq: number;
      limit: number;
    }) => all.slice(fromSeq, fromSeq + limit);

    const streamer = new HistoryStreamer(fetcher);
    const seg = await streamer.loadHistorySegment('p-test', 0, 499);
    expect(seg.events).toHaveLength(500);
    expect(seg.events[0]!.sequenceNumber).toBe(0);
    expect(seg.events[499]!.sequenceNumber).toBe(499);
    expect(seg.fromSeq).toBe(0);
    expect(seg.toSeq).toBe(499);
    expect(seg.nextFromSeq).toBe(500);
  });

  it('returns nextFromSeq=null when the tail is reached', async () => {
    const all = Array.from({ length: 50 }, (_, i) => makeEvent(i));
    const fetcher = async ({
      fromSeq,
      limit,
    }: {
      projectId: string;
      fromSeq: number;
      limit: number;
    }) => all.slice(fromSeq, fromSeq + limit);

    const streamer = new HistoryStreamer(fetcher);
    // Request 100 events but only 50 exist.
    const seg = await streamer.loadHistorySegment('p-test', 0, 99);
    expect(seg.events).toHaveLength(50);
    expect(seg.nextFromSeq).toBeNull();
  });

  it('returns an empty segment when toSeq < fromSeq', async () => {
    const streamer = new HistoryStreamer(async () => {
      throw new Error('fetcher should not be called');
    });
    const seg = await streamer.loadHistorySegment('p-test', 100, 50);
    expect(seg.events).toEqual([]);
    expect(seg.nextFromSeq).toBeNull();
  });

  it('rejects requests larger than MAX_HISTORY_PAGE_SIZE', async () => {
    const streamer = new HistoryStreamer(async () => []);
    await expect(
      streamer.loadHistorySegment('p-test', 0, MAX_HISTORY_PAGE_SIZE),
    ).rejects.toThrow(/max page is 1000/);
  });

  it('rejects negative fromSeq / toSeq', async () => {
    const streamer = new HistoryStreamer(async () => []);
    await expect(streamer.loadHistorySegment('p-test', -1, 10)).rejects.toThrow(
      /fromSeq must be a non-negative integer/,
    );
    await expect(streamer.loadHistorySegment('p-test', 0, -1)).rejects.toThrow(
      /toSeq must be a non-negative integer/,
    );
  });

  it('throws HistorySequenceGapError on non-contiguous server response', async () => {
    // Server returned [seq=0, seq=2] — sequence number 1 is missing.
    const streamer = new HistoryStreamer(async () => [makeEvent(0), makeEvent(2)]);
    await expect(streamer.loadHistorySegment('p-test', 0, 1)).rejects.toBeInstanceOf(
      HistorySequenceGapError,
    );
  });

  it('paginates correctly across multiple calls', async () => {
    const all = Array.from({ length: 1500 }, (_, i) => makeEvent(i));
    const fetcher = async ({
      fromSeq,
      limit,
    }: {
      projectId: string;
      fromSeq: number;
      limit: number;
    }) => all.slice(fromSeq, fromSeq + limit);

    const streamer = new HistoryStreamer(fetcher);
    const collected: LinearisedHistoryEvent[] = [];
    let next: number | null = 0;
    while (next !== null) {
      const seg = await streamer.loadHistorySegment('p-test', next, next + 499);
      collected.push(...seg.events);
      next = seg.nextFromSeq;
    }
    expect(collected).toHaveLength(1500);
    expect(collected[0]!.sequenceNumber).toBe(0);
    expect(collected[1499]!.sequenceNumber).toBe(1499);
  });
});
