/**
 * hostedDualWriteGate.spec — the gate's OWN blind-spot test. (C86 WO-B-3.)
 *
 * A gate is an instrument, and an unverified instrument is worth less than no
 * instrument, because it converts "nobody looked" into "it's clean". This pins the
 * two properties of `check-hosted-dual-write.ts` that a plausible-looking rewrite
 * would quietly break.
 *
 * ⛔ THE ONE THAT ALREADY HAPPENED. The obvious pattern `\.updateDoor\s*\(` misses
 * `ctx.wallStore?.updateDoor?.(…)` — the optional-call form — and that is how ALL
 * NINE `PropertyInspectorApply` sites are written. The first draft of this gate used
 * the naive pattern and silently omitted the single file it had been written to
 * catch (L-1042). A scanner whose blind spot IS the defect it hunts reports a clean
 * repo, which is worse than reporting nothing.
 *
 * The regexes are restated here rather than imported because the gate is a top-level
 * script that scans the repo on import — importing it would run it. C84 EI-8a
 * requires a transcribed copy to be pinned to its master by an executed comparison,
 * so test C reads the gate's SOURCE and asserts the literals still match.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = (() => {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 12; i++) {
    if (fs.existsSync(path.join(dir, 'pnpm-workspace.yaml'))) return dir;
    dir = path.dirname(dir);
  }
  throw new Error('[hostedDualWriteGate] workspace root not found');
})();

const GATE = 'tools/ga-gate/check-hosted-dual-write.ts';

// Mirrors of the gate's literals — pinned to the source by test C.
const CALL = /\.(updateDoor|updateWindow)\s*(?:\?\.)?\s*\(/;
const PAIRED_DOOR = /\bdoorStore\s*(?:\?\.)?\s*\.?\s*update\s*\(/;

describe('check-hosted-dual-write — the gate cannot be blind to its own subject', () => {
  it('A — matches BOTH call forms, including the optional-call `?.(` that hid the property panel', () => {
    const plain = "        ws.updateDoor(state.elementId, { offset: slide.offset });";
    const optional = "                ctx.wallStore?.updateDoor?.(d.id, { width: updates.width });";
    const optionalWindow = "                ctx.wallStore?.updateWindow?.(d.id, { height: updates.height });";

    expect(CALL.test(plain), 'plain call form').toBe(true);
    expect(CALL.test(optional), 'OPTIONAL call form — this is the one that regressed').toBe(true);
    expect(CALL.test(optionalWindow)).toBe(true);

    // The naive pattern the first draft used, kept as the negative control: it
    // demonstrably misses the optional form, so test A is not vacuous.
    const NAIVE = /\.updateDoor\s*\(/;
    expect(NAIVE.test(plain)).toBe(true);
    expect(
      NAIVE.test(optional),
      'the naive pattern must still MISS the optional form — if it now matches, ' +
        'test A no longer distinguishes the two and proves nothing',
    ).toBe(false);
  });

  it('B — a `.has()` guard alone does NOT count as a paired write', () => {
    // C15 §8.1 asks for the write "guarded by windowStore.has(id)". A file that only
    // CHECKS the derived store has not written it, and must not read as compliant.
    expect(PAIRED_DOOR.test('if (doorStore.has(this.doorId)) {')).toBe(false);
    expect(PAIRED_DOOR.test('doorStore.update(this.doorId, { width: v });')).toBe(true);
  });

  it('C — these mirrors still match the gate source (C84 EI-8a: pinned, not commented)', () => {
    const src = fs.readFileSync(path.join(REPO, GATE), 'utf8');
    expect(src).toContain(String(CALL));
    expect(src).toContain(String(PAIRED_DOOR));
  });

  it('D — the gate declares an honesty floor and a shrink-only baseline', () => {
    const src = fs.readFileSync(path.join(REPO, GATE), 'utf8');

    // A walk that reaches nothing must not be able to report a pass.
    expect(src).toMatch(/const MIN_FILES = \d+;/);

    // The ratchet must exist and must be documented as shrink-only.
    const m = src.match(/const BASELINE = (\d+);/);
    expect(m, 'BASELINE must be a literal the gate can be ratcheted against').toBeTruthy();
    expect(Number(m![1])).toBeLessThanOrEqual(3);
    expect(src).toContain('SHRINK-ONLY');
  });
});
