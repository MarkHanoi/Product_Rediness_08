// packages/sync-client/__tests__/_chaos/convergence.ts — W-04.
//
// Convergence checker for the chaos harness.  Polls every `pollMs` until
// every peer's events Y.Map has the same {id → payload} contents (deep
// equal by JSON serialisation) OR the timeout elapses.  Returns the
// elapsed wall-clock ms on success; throws a detailed diff on timeout.

import type { Peer } from './PeerHarness.js';
import { snapshotEventsMap } from './RandomEditGenerator.js';

export interface AwaitConvergenceOptions {
  readonly timeoutMs: number;
  readonly pollMs?: number;
}

export interface ConvergenceResult {
  readonly converged: true;
  readonly elapsedMs: number;
  readonly entryCount: number;
  readonly polls: number;
}

export async function awaitConvergence(
  peers: readonly Peer[],
  opts: AwaitConvergenceOptions,
): Promise<ConvergenceResult> {
  const t0 = Date.now();
  const pollMs = opts.pollMs ?? 25;
  let polls = 0;
  while (true) {
    polls += 1;
    const snaps = peers.map(p => snapshotEventsMap(p.doc));
    if (snapsAreEqual(snaps)) {
      return { converged: true, elapsedMs: Date.now() - t0, entryCount: snaps[0]!.size, polls };
    }
    if (Date.now() - t0 > opts.timeoutMs) {
      throw new Error(buildDivergenceReport(peers, snaps, opts.timeoutMs, polls));
    }
    await new Promise(r => setTimeout(r, pollMs));
  }
}

function snapsAreEqual(snaps: ReadonlyArray<ReadonlyMap<string, unknown>>): boolean {
  if (snaps.length === 0) return true;
  const ref = snaps[0]!;
  for (let i = 1; i < snaps.length; i++) {
    const cur = snaps[i]!;
    if (cur.size !== ref.size) return false;
    for (const [k, v] of ref) {
      if (!cur.has(k)) return false;
      if (JSON.stringify(cur.get(k)) !== JSON.stringify(v)) return false;
    }
  }
  return true;
}

function buildDivergenceReport(
  peers: readonly Peer[],
  snaps: ReadonlyArray<ReadonlyMap<string, unknown>>,
  timeoutMs: number,
  polls: number,
): string {
  const sizes = snaps.map((s, i) => `${peers[i]!.id}: ${s.size}`).join(', ');
  // Find a key that differs.
  const allKeys = new Set<string>();
  for (const s of snaps) for (const k of s.keys()) allKeys.add(k);
  const missing: string[] = [];
  for (const k of allKeys) {
    const presence = snaps.map((s, i) => `${peers[i]!.id}=${s.has(k) ? '✓' : '✗'}`).join(' ');
    if (snaps.some(s => !s.has(k))) missing.push(`  • ${k}: ${presence}`);
  }
  const head = missing.slice(0, 5).join('\n');
  return [
    `Chaos harness: peers did not converge within ${timeoutMs} ms (after ${polls} polls).`,
    `  Sizes: ${sizes}`,
    missing.length > 0 ? `  First ${Math.min(5, missing.length)} divergent keys:` : '',
    head,
  ].filter(Boolean).join('\n');
}
