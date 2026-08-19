/**
 * @vitest-environment happy-dom
 *
 * §PERF2-DIAG-ROOM-LOOP-COST (L-1156) — the "always-on room-loop-break audit" is
 * itself O(n²), and it ran on every detection pass.
 *
 * `_diagRoomLoop` nests `for host of segs × for guest of segs × 2 endpoints`, so
 * it performs 2n² distance computations EVERY pass, whether or not it logs
 * anything. The founder's 400-wall gesture drove ~400 passes; at 400 segments
 * that is ~320,000 iterations per pass, plus the ~800 formatted `console.warn`
 * writes that re-reported the SAME pair of walls at the SAME 788 mm every time.
 *
 * ⭐ THE POINT OF THESE TESTS IS THAT SILENCE IS NOT THE FIX. A reader who stops
 * seeing §DIAG-ROOM-LOOP BREAK lines must not conclude there are no loop breaks.
 * So the skip path is asserted to SAY it skipped, and to say WHY — "UNMEASURED,
 * not zero" is a different value from "0 breaks", and the log has to carry the
 * difference.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { RoomDetectionEngine } from '../RoomDetectionEngine';

type G = { __pryzmDiagRoomLoop?: boolean };

/** `_diagRoomLoop` reads only its arguments, so it can be exercised off the
 *  prototype — no engine construction, no stores, nothing to mis-fake. */
function runDiag(segCount: number, forced?: boolean) {
  if (forced === undefined) delete (globalThis as G).__pryzmDiagRoomLoop;
  else (globalThis as G).__pryzmDiagRoomLoop = forced;

  const segs = [];
  for (let i = 0; i < segCount; i++) {
    // A ladder of parallel walls crossing one spine, so genuine body-T
    // geometry exists and the audit has something real to report.
    segs.push({
      wallUUID: `wall_${i}`,
      start: new THREE.Vector3(i * 0.5, 0, 0),
      end: new THREE.Vector3(i * 0.5, 0, 4),
    });
  }
  const thickness = new Map<string, number>(segs.map(s => [s.wallUUID, 0.2]));

  const logs: string[] = [];
  const warns: string[] = [];
  vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => { logs.push(a.map(String).join(' ')); });
  vi.spyOn(console, 'warn').mockImplementation((...a: unknown[]) => { warns.push(a.map(String).join(' ')); });

  (RoomDetectionEngine.prototype as unknown as {
    _diagRoomLoop: (s: unknown, t: unknown, l: string, c: number) => void;
  })._diagRoomLoop.call({}, segs, thickness, 'L0', 1);

  return { logs, warns };
}

describe('§PERF2-DIAG-ROOM-LOOP-COST — the O(n^2) audit is bounded, and its silence is explicit', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete (globalThis as G).__pryzmDiagRoomLoop;
  });

  it('CONTROL — a small level still runs the audit and still reports (diagnostics unchanged)', () => {
    const { logs } = runDiag(20);
    const summary = logs.filter(l => l.includes('§DIAG-ROOM-LOOP') && l.includes('detectedRooms='));
    expect(summary.length).toBe(1);
    expect(summary[0]).toContain('unresolvedLoopBreaks=');
    expect(summary[0]).not.toContain('SKIPPED');
  });

  it('a large level SKIPS the O(n^2) walk', () => {
    const { logs } = runDiag(400);
    const summary = logs.filter(l => l.includes('§DIAG-ROOM-LOOP'));
    expect(summary.length).toBe(1);
    expect(summary[0]).toContain('loopBreakAudit=SKIPPED');
  });

  it('⭐ the skip line says UNMEASURED, names the threshold, and names its escape hatch', () => {
    // This is the assertion that stops the fix becoming a lie. A skipped audit
    // that printed "unresolvedLoopBreaks=0" would be strictly worse than the
    // 800 console writes it replaced.
    const { logs } = runDiag(400);
    const line = logs.find(l => l.includes('loopBreakAudit=SKIPPED'))!;
    expect(line).toContain('UNMEASURED, not zero');
    expect(line).toContain('segs=400');
    expect(line).toContain('150');
    expect(line).toContain('__pryzmDiagRoomLoop');
    // and it must NOT report a count it did not compute
    expect(line).not.toContain('unresolvedLoopBreaks=');
  });

  it('the flag forces the audit ON at any size (the wall-join lane keeps its tool)', () => {
    const { logs } = runDiag(400, true);
    const summary = logs.filter(l => l.includes('§DIAG-ROOM-LOOP') && l.includes('detectedRooms='));
    expect(summary.length).toBe(1);
    expect(summary[0]).toContain('unresolvedLoopBreaks=');
    expect(summary[0]).not.toContain('SKIPPED');
  });

  it('the flag forces the audit OFF even on a small level', () => {
    const { logs } = runDiag(20, false);
    const line = logs.find(l => l.includes('§DIAG-ROOM-LOOP'))!;
    expect(line).toContain('loopBreakAudit=SKIPPED');
  });
});
