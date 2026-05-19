// PR 4.A.5 (Wave 4 Track A) — `buildPickingSlot` tests.
//
// Verifies the full `PickingSlot` contract:
//   * D.6-prep posture: thunk returns null → pickAt / pickInRect return null / []
//   * warn-once breadcrumb fires only on the first null-thunk call
//   * once the thunk returns a real delegate, both methods delegate correctly
//   * swapping the delegate (thunk pointer changes) is transparent to callers

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildPickingSlot, type PickerDelegate } from '../src/buildPickingSlot.js';
import type { PickingSlot } from '../src/types.js';

// ─────────────────────────────────────────────────────────────────────────────

describe('buildPickingSlot — D.6-prep posture (thunk returns null)', () => {
  let slot: PickingSlot;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    slot = buildPickingSlot(() => null);
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('pickAt returns null when delegate is null', () => {
    expect(slot.pickAt(100, 200)).toBe(null);
  });

  it('pickInRect returns [] when delegate is null', () => {
    expect(slot.pickInRect({ x: 0, y: 0, w: 50, h: 50 })).toEqual([]);
  });

  it('warn-once fires on the first pickAt call', () => {
    slot.pickAt(0, 0);
    expect(warnSpy).toHaveBeenCalledOnce();
    expect(warnSpy.mock.calls[0]?.[0]).toContain('D.6-prep stub');
  });

  it('warn-once does NOT fire again on subsequent pickAt calls', () => {
    slot.pickAt(0, 0);
    slot.pickAt(10, 20);
    slot.pickAt(30, 40);
    expect(warnSpy).toHaveBeenCalledOnce();
  });

  it('warn-once does NOT fire again on pickInRect after pickAt already warned', () => {
    slot.pickAt(0, 0);   // fires the warning
    slot.pickInRect({ x: 0, y: 0, w: 10, h: 10 }); // should be silent
    expect(warnSpy).toHaveBeenCalledOnce();
  });

  it('warn-once fires on the first pickInRect call even if pickAt was never called', () => {
    slot.pickInRect({ x: 0, y: 0, w: 10, h: 10 });
    expect(warnSpy).toHaveBeenCalledOnce();
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('buildPickingSlot — wired delegate', () => {
  let delegate: PickerDelegate;
  let slot: PickingSlot;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    delegate = {
      pickAt: vi.fn().mockReturnValue('elem-001'),
      pickInRect: vi.fn().mockReturnValue(['elem-001', 'elem-002']),
    };
    slot = buildPickingSlot(() => delegate);
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('pickAt delegates to the real picker and returns its value', () => {
    expect(slot.pickAt(100, 200)).toBe('elem-001');
    expect(delegate.pickAt).toHaveBeenCalledWith(100, 200);
  });

  it('pickInRect delegates to the real picker and returns its values', () => {
    const rect = { x: 10, y: 20, w: 100, h: 50 };
    expect(slot.pickInRect(rect)).toEqual(['elem-001', 'elem-002']);
    expect(delegate.pickInRect).toHaveBeenCalledWith(rect);
  });

  it('no warn fires when the delegate is present', () => {
    slot.pickAt(0, 0);
    slot.pickInRect({ x: 0, y: 0, w: 10, h: 10 });
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('pickAt returns null when delegate.pickAt returns null', () => {
    (delegate.pickAt as ReturnType<typeof vi.fn>).mockReturnValue(null);
    expect(slot.pickAt(0, 0)).toBe(null);
  });

  it('pickInRect returns [] when delegate.pickInRect returns []', () => {
    (delegate.pickInRect as ReturnType<typeof vi.fn>).mockReturnValue([]);
    expect(slot.pickInRect({ x: 0, y: 0, w: 10, h: 10 })).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('buildPickingSlot — hot-swapping the delegate (D.6 transition)', () => {
  it('transitions from null to real delegate without re-creating the slot', () => {
    let delegate: PickerDelegate | null = null;
    const slot = buildPickingSlot(() => delegate);

    // Before D.6: null
    expect(slot.pickAt(0, 0)).toBe(null);

    // D.6 wires the real delegate
    delegate = {
      pickAt: vi.fn().mockReturnValue('elem-xyz'),
      pickInRect: vi.fn().mockReturnValue(['elem-xyz']),
    };

    // After D.6: real delegate takes over
    expect(slot.pickAt(50, 50)).toBe('elem-xyz');
    expect(delegate.pickAt).toHaveBeenCalledWith(50, 50);
  });

  it('pickInRect also works after hot-swap', () => {
    let delegate: PickerDelegate | null = null;
    const slot = buildPickingSlot(() => delegate);
    expect(slot.pickInRect({ x: 0, y: 0, w: 10, h: 10 })).toEqual([]);

    delegate = {
      pickAt: vi.fn().mockReturnValue(null),
      pickInRect: vi.fn().mockReturnValue(['elem-a', 'elem-b']),
    };

    const rect = { x: 5, y: 5, w: 20, h: 20 };
    expect(slot.pickInRect(rect)).toEqual(['elem-a', 'elem-b']);
    expect(delegate.pickInRect).toHaveBeenCalledWith(rect);
  });
});
