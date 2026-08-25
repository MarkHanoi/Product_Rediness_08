/**
 * @file apps/editor/src/ui/ViewBrowser/panels/unified-browser/__tests__/categoryElementsDetermination.spec.ts
 *
 * **The differentiating test for C78 U-INV-4 in the unified browser.**
 *
 * ─── WHAT THIS FILE PROVES ──────────────────────────────────────────────────
 * `getCategoryElements` answered `[]` for three different facts: the project
 * genuinely holds no walls; the backing store is not yet on `window` (premature
 * access before engine init — the case its OWN `console.warn` documents); and
 * the read threw (`} catch { return []; }`, ARM A).
 *
 * `ElementsSummarySection` renders that `[]` as a COUNT in the ELEMENTS card, so
 * an unavailable store became the user-visible assertion **"0 walls in this
 * project"** — a positive claim about the model manufactured from absence, in a
 * panel an architect reads to check their model. The `console.warn` never
 * reached the UI, and did not fire on the `catch` path at all.
 *
 * The centre is `describe('THE DIFFERENTIATOR')`: an empty category and an
 * unavailable store now produce different determinations, and the row renders
 * "—" rather than "0".
 *
 * ─── THE NEGATIVE CONTROL (C70 §5.6) ────────────────────────────────────────
 * A fix that called every category undetermined would blank the whole panel —
 * the same defect with the opposite sign. The control pins that a real store
 * with real elements reports its real count, and a genuinely empty store
 * reports a determined `0`, not "—".
 */

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  determineCategoryElements,
  categoryCountOrUnknown,
  getCategoryElements,
  type UBPBag,
} from '../BrowserDataHelpers';

const w = globalThis as unknown as Record<string, unknown>;

const STORE_KEYS = [
  'wallStore', 'curtainWallStore', 'slabStore', 'floorStore', 'ceilingStore',
  'doorStore', 'windowStore', 'openingStore', 'furnitureStore', 'lightingStore',
  'stairStore', 'handrailStore', 'columnStore', 'beamStore', 'plumbingStore',
  'roomStore', 'projectOriginStore',
];

function clearStores() { for (const k of STORE_KEYS) delete w[k]; }

const withN = (n: number) => ({ getAll: () => Array.from({ length: n }, (_, i) => ({ id: `e${i}` })) });
const throwing = () => ({ getAll: () => { throw new Error('store not initialised'); } });

const bag = { roofStore: null } as unknown as UBPBag;

beforeEach(clearStores);
afterEach(clearStores);

// ═════════════════════════════════════════════════════════════════════════════
// THE DIFFERENTIATOR
// ═════════════════════════════════════════════════════════════════════════════

describe('THE DIFFERENTIATOR — an empty category vs an unavailable store', () => {
  it('an EMPTY but PRESENT store is DETERMINED, with a real count of 0', () => {
    w.wallStore = withN(0);
    const d = determineCategoryElements(bag, 'Walls');

    expect(d.kind).toBe('determined');
    if (d.kind === 'determined') expect(d.elements).toEqual([]);
    expect(categoryCountOrUnknown(bag, 'Walls')).toBe(0);
  });

  it('an ABSENT store is UNDETERMINED — the count is null, not 0', () => {
    // wallStore never assigned: premature access before engine init.
    const d = determineCategoryElements(bag, 'Walls');

    // ── THE OBSERVABLE DIFFERENCE ──────────────────────────────────────────
    expect(d.kind).toBe('undetermined');
    if (d.kind === 'undetermined') {
      expect(d.reason).toBe('RELATIONSHIP_NOT_READABLE');
      expect(d.scope).toContain('Walls');
      expect(d.detail).toContain('wallStore');
    }
    expect(categoryCountOrUnknown(bag, 'Walls')).toBeNull();   // was 0
  });

  it('the two cases produce DIFFERENT counts — 0 versus null', () => {
    w.wallStore = withN(0);
    const empty = categoryCountOrUnknown(bag, 'Walls');
    delete w.wallStore;
    const unavailable = categoryCountOrUnknown(bag, 'Walls');

    expect(empty).toBe(0);
    expect(unavailable).toBeNull();
    expect(empty).not.toBe(unavailable);
  });

  it('a THROWING store is UNDETERMINED (ARM A), carrying the message', () => {
    w.roomStore = throwing();
    const d = determineCategoryElements(bag, 'Rooms');

    expect(d.kind).toBe('undetermined');
    if (d.kind === 'undetermined') expect(d.detail).toContain('store not initialised');
  });

  it('an UNKNOWN category label is undetermined, not empty', () => {
    // The old `default: return []` said "this category is empty" about a label
    // that names no store at all.
    const d = determineCategoryElements(bag, 'Nonexistent Category');
    expect(d.kind).toBe('undetermined');
    if (d.kind === 'undetermined') expect(d.detail).toContain('does not name a known store');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// NEGATIVE CONTROL
// ═════════════════════════════════════════════════════════════════════════════

describe('NEGATIVE CONTROL — present stores never refuse', () => {
  it('a populated store reports its REAL count', () => {
    w.wallStore = withN(7);
    expect(categoryCountOrUnknown(bag, 'Walls')).toBe(7);
    expect(determineCategoryElements(bag, 'Walls').kind).toBe('determined');
  });

  it('EVERY category with a present store is determined', () => {
    for (const k of STORE_KEYS) w[k] = withN(1);
    for (const label of [
      'Walls', 'Slabs', 'Floors', 'Ceilings', 'Doors', 'Windows',
      'Openings', 'Furniture', 'Stairs', 'Columns', 'Beams', 'Rooms',
    ]) {
      expect(determineCategoryElements(bag, label).kind, `${label} must be determined`)
        .toBe('determined');
    }
  });

  it('getCategoryElements still returns a plain array for the benign callers', () => {
    // ProjectVisibilitySection uses this to select/hide; [] there means
    // "nothing to toggle" and is genuinely harmless.
    w.wallStore = withN(2);
    expect(getCategoryElements(bag, 'Walls')).toHaveLength(2);
    delete w.wallStore;
    expect(getCategoryElements(bag, 'Walls')).toEqual([]);
  });

  it('is TOTAL — never throws, whatever the store does', () => {
    w.wallStore = throwing();
    expect(() => determineCategoryElements(bag, 'Walls')).not.toThrow();
    expect(() => categoryCountOrUnknown(bag, 'Walls')).not.toThrow();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// §LIFT94 (L-11342) — THE LIFT IS IN THE MODEL-ELEMENTS CARD
// ═════════════════════════════════════════════════════════════════════════════
//
// THE FOUNDER: *"lift is not in the model elements within the project browser"*.
// Measured 2026-08-25: `grep -rln lift apps/editor/src/ui/ViewBrowser/` returned
// NOTHING. Not hidden, not filtered, not mis-counted — never declared.
//
// ⛔ THE TRAP THIS PINS. `window.liftStore` IS assigned (initBuilders.ts:983) and it
// is the LOD-200 MASSING lift, a DIFFERENT element (C104 §1). The obvious one-line
// "fix" — `case 'Lifts': return window.liftStore.getAll()` — would have shown the
// user rows that correspond to nothing the lift tool ever created, which is worse
// than the empty card they had. The last test below is the guard against that.

describe('§LIFT94 — the Lifts category reads the C104 COMPOUND store', () => {
  const liftBag = (records: Record<string, unknown>[] | null) => ({
    roofStore: null,
    runtime: records === null
      ? null
      : { stores: { lift: { getState: () => new Map(records.map((r, i) => [`l${i}`, r])) } } },
  } as unknown as UBPBag);

  it('"Lifts" is a KNOWN label — it must not be refused as naming no store', () => {
    // Before §LIFT94 this returned `undetermined / "does not name a known store"`,
    // because `_categoryStoreKey` has no `Lifts` row and never will: the compound
    // store is not a window global. `Roofs` established the precedent.
    const d = determineCategoryElements(liftBag([]), 'Lifts');
    expect(d.kind, 'Lifts must be a determined, readable category').toBe('determined');
  });

  it('a populated compound store reports its REAL count', () => {
    const d = determineCategoryElements(
      liftBag([{ id: 'a', enclosureType: 'wall-hosted' }, { id: 'b', enclosureType: 'standalone' }]),
      'Lifts',
    );
    expect(d.kind).toBe('determined');
    if (d.kind === 'determined') expect(d.elements).toHaveLength(2);
    expect(categoryCountOrUnknown(liftBag([{ id: 'a' }]), 'Lifts')).toBe(1);
  });

  it('an ABSENT runtime is UNDETERMINED, never a confident "0 Lifts"', () => {
    // The whole point of this file, applied to the new category: "the runtime is not
    // composed yet" and "this project has no lifts" must not be the same value.
    const d = determineCategoryElements(liftBag(null), 'Lifts');
    expect(d.kind).toBe('undetermined');
    if (d.kind === 'undetermined') expect(d.detail).toContain('runtime.stores.lift is not available yet');
    expect(categoryCountOrUnknown(liftBag(null), 'Lifts')).toBeNull();
  });

  it('a genuinely EMPTY compound store is a determined 0 — the negative control', () => {
    expect(categoryCountOrUnknown(liftBag([]), 'Lifts')).toBe(0);
  });

  it('⛔ it does NOT read `window.liftStore` — that is the LOD-200 MASSING lift', () => {
    // Plant the massing global with records that would be visibly wrong if read.
    w.liftStore = withN(99);
    try {
      expect(categoryCountOrUnknown(liftBag([{ id: 'only-one' }]), 'Lifts'),
        'the card must show the COMPOUND store, not the massing store (C104 §1)').toBe(1);
      expect(categoryCountOrUnknown(liftBag(null), 'Lifts'),
        'and it must still refuse when the compound store is unreachable, ' +
        'even though a same-named global happens to exist').toBeNull();
    } finally {
      delete w.liftStore;
    }
  });
});
