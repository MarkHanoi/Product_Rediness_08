// GR-10 (`[]`-means-unknown ledger · C75 §1.4 · C78 §1.4/§8.1 · C71 §4.4) —
// the house-layout shell analysis stops reading an UNRECORDED opening set as
// "zero windows, no door".
//
// The old shape, twice in each analyseActiveShell twin (HouseLayoutController /
// HouseLayoutExecutor):
//   windowCountByWall[w.id] = (w.openings ?? []).filter(window).length  → 0
//   (w.openings ?? []).some(door)                                       → false
// so a wall nobody measured entered the generator as a blank façade, and a
// hand-placed front door on such a wall could not be seen by entrance
// detection. The differentiating assertions below fail against that shape:
// it had no null arm — absent and empty printed the same 0/false.

import { describe, it, expect, vi } from 'vitest';
import { readShellWallOpenings, warnShellOpeningsUnrecorded } from '../house-layout/shellOpeningsReading';

describe('readShellWallOpenings — unrecorded is null, never 0/false (GR-10)', () => {
  it('an ABSENT opening set yields null window count AND null door status', () => {
    const rd = readShellWallOpenings(undefined);
    // FAILS against the old `?? []` shape (0 and false).
    expect(rd.windowCount).toBeNull();
    expect(rd.hasDoor).toBeNull();
  });

  it('negative control: a PRESENT empty set is a real 0 / false', () => {
    const rd = readShellWallOpenings([]);
    expect(rd.windowCount).toBe(0);
    expect(rd.hasDoor).toBe(false);
  });

  it('a recorded set counts windows and sees the door', () => {
    const rd = readShellWallOpenings([
      { type: 'window' }, { type: 'window' }, { type: 'door' },
    ]);
    expect(rd.windowCount).toBe(2);
    expect(rd.hasDoor).toBe(true);
  });
});

describe('warnShellOpeningsUnrecorded — the unknown is NAMED, and silence means none (GR-10)', () => {
  it('names every unrecorded wall in one warn', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    warnShellOpeningsUnrecorded('[t]', ['w1', 'w9']);
    expect(spy).toHaveBeenCalledTimes(1);
    const msg = String(spy.mock.calls[0]![0]);
    expect(msg).toContain('w1');
    expect(msg).toContain('w9');
    expect(msg).toContain('RELATIONSHIP_NOT_RECORDED');
    spy.mockRestore();
  });

  it('negative control: nothing unrecorded warns nothing', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    warnShellOpeningsUnrecorded('[t]', []);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
