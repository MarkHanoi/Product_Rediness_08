/**
 * @vitest-environment happy-dom
 *
 * @file packages/ai-host/__tests__/storeReadDetermination.test.ts
 *
 * **The differentiating test for C78 U-INV-4 in `@pryzm/ai-host`.**
 * `WorldModelAdapter` reads its stores off `window`, so a DOM is required.
 *
 * ─── WHAT THIS FILE PROVES ──────────────────────────────────────────────────
 * `WorldModelAdapter` read six project stores as
 *
 *     try { return _store('wallStore')?.getAll?.() ?? []; } catch { return []; }
 *
 * — an ARM A catch-to-empty and an ARM B optional-called method, stacked. A
 * store absent from `window` and a store that threw both produced `[]`, which
 * the adapter counted into `wallCount` / `totalElements`, and which
 * `toPromptContext` then SERIALISED INTO AN LLM PROMPT. The model was told, in
 * JSON, that the building has no walls. That is the FacadeOrientationService
 * shape (C79 §5.2.0): an absence becoming a POSITIVE claim — and the
 * widest-travelling instance in the ledger, because the claim leaves the type
 * system and becomes English a user reads.
 *
 * Two sibling defects in the same file, closed here:
 *   · `getComplianceContext`'s outer catch returned `passRate: 1` with zero
 *     violations — an INFRASTRUCTURE FAILURE rendered as "fully compliant".
 *   · `(room.boundingWallIds ?? []).length` → `boundingWallCount: 0`, i.e.
 *     "this room is unbounded", about a room nobody measured (C79 §7.1).
 *
 * The centre is `describe('THE DIFFERENTIATOR')`: an empty project and an
 * unreadable store now produce DIFFERENT observable output. Before, both said
 * `wallCount: 0`.
 *
 * ─── THE NEGATIVE CONTROL (C70 §5.6) ────────────────────────────────────────
 * A fix that called every read unknown would be the same defect with the
 * opposite sign — it would make a genuinely empty project indistinguishable
 * from a broken one, in the other direction, and would poison every count in
 * the product. `describe('NEGATIVE CONTROL')` pins that a genuinely empty
 * project reports a real, determined `0`, and that a populated project reports
 * real numbers with no `couldNotDetermine` key at all.
 */

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  determineStoreRead,
  storeElementsOrUnknown,
  countOrUnknown,
  sumOrUnknown,
  renderCount,
  boundingWallCountOrUnknown,
} from '../src/storeReadDetermination.js';
import { worldModelAdapter } from '../src/WorldModelAdapter.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, '../../..');

// ── Fixtures ────────────────────────────────────────────────────────────────

const w = globalThis as unknown as Record<string, unknown>;
const STORE_KEYS = [
  'roomStore', 'wallStore', 'doorStore', 'windowStore', 'stairStore', 'bimManager',
];

function clearStores() {
  for (const k of STORE_KEYS) delete w[k];
}

/** A store that CAN answer, holding `items`. */
const readable = (items: unknown[]) => ({ getAll: () => items });

/** A store that THREW — "I could not look", by construction. */
const throwing = () => ({ getAll: () => { throw new Error('store not initialised'); } });

const room = (id: string, boundingWallIds?: string[]) => ({
  id, name: `Room ${id}`, levelId: 'L0', occupancyType: 'bedroom',
  computed: { area: 12 },
  ...(boundingWallIds !== undefined ? { boundingWallIds } : {}),
});

beforeEach(clearStores);
afterEach(clearStores);

// ═════════════════════════════════════════════════════════════════════════════
// THE DIFFERENTIATOR
// ═════════════════════════════════════════════════════════════════════════════

describe('THE DIFFERENTIATOR — an empty project vs an unreadable store', () => {
  it('an EMPTY project reports a determined 0', () => {
    w.roomStore = readable([]);
    w.wallStore = readable([]);
    w.doorStore = readable([]);
    w.windowStore = readable([]);

    const ctx = worldModelAdapter.getFullBuildingContext('p1');
    expect(ctx.wallCount).toBe(0);
    expect(ctx.roomCount).toBe(0);
    expect(ctx.totalElements).toBe(0);
    expect(ctx.undeterminedReads).toHaveLength(0);
  });

  it('an ABSENT wallStore reports UNKNOWN — not 0', () => {
    w.roomStore = readable([]);
    // wallStore is simply not on `window` — the load-order race case.
    w.doorStore = readable([]);
    w.windowStore = readable([]);

    const ctx = worldModelAdapter.getFullBuildingContext('p1');
    // ── THE OBSERVABLE DIFFERENCE ──────────────────────────────────────────
    expect(ctx.wallCount).toBeNull();          // was 0
    expect(ctx.totalElements).toBeNull();      // a partial total is not a total
    expect(ctx.undeterminedReads.length).toBeGreaterThan(0);
    expect(ctx.undeterminedReads[0]!.reason).toBe('RELATIONSHIP_NOT_READABLE');
    expect(ctx.undeterminedReads[0]!.scope).toContain('wallStore');
  });

  it('a THROWING store reports UNKNOWN — not 0', () => {
    w.roomStore = readable([]);
    w.wallStore = throwing();
    w.doorStore = readable([]);
    w.windowStore = readable([]);

    const ctx = worldModelAdapter.getFullBuildingContext('p1');
    expect(ctx.wallCount).toBeNull();
    expect(ctx.undeterminedReads.some(u => u.detail?.includes('store not initialised'))).toBe(true);
  });

  it('the two cases produce DIFFERENT prompt text — the whole point', () => {
    w.roomStore = readable([]); w.doorStore = readable([]); w.windowStore = readable([]);

    w.wallStore = readable([]);
    const emptyPrompt = worldModelAdapter.toPromptContext('p1');

    delete w.wallStore;
    const unreadablePrompt = worldModelAdapter.toPromptContext('p1');

    expect(emptyPrompt).not.toBe(unreadablePrompt);
    // The empty project truthfully tells the model there are zero walls.
    expect(JSON.parse(emptyPrompt).wallCount).toBe(0);
    // The unreadable one says so IN WORDS the model cannot mistake for a count.
    expect(JSON.parse(unreadablePrompt).wallCount).toBe('unknown');
    expect(JSON.parse(unreadablePrompt).couldNotDetermine).toBeDefined();
    expect(emptyPrompt).not.toContain('couldNotDetermine');
  });

  it('boundingWallCount: a measured zero-wall room vs a room nobody measured', () => {
    w.wallStore = readable([]); w.doorStore = readable([]); w.windowStore = readable([]);
    w.roomStore = readable([
      room('r-measured', []),   // examined; bounds zero walls — a real answer
      room('r-unwritten'),      // boundingWallIds absent — C79 §7.1's writer
    ]);

    const ctx = worldModelAdapter.getFullBuildingContext('p1');
    const measured = ctx.rooms.find(r => r.id === 'r-measured')!;
    const unwritten = ctx.rooms.find(r => r.id === 'r-unwritten')!;

    expect(measured.boundingWallCount).toBe(0);      // determined
    expect(unwritten.boundingWallCount).toBeNull();  // was 0 — "unbounded"
    expect(measured.boundingWallCount).not.toBe(unwritten.boundingWallCount);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// COMPLIANCE — an infrastructure failure is not "fully compliant"
// ═════════════════════════════════════════════════════════════════════════════

describe('getComplianceContext — passRate 1 was a lie', () => {
  it('an UNREADABLE room store yields passRate null, not 1', () => {
    // No roomStore at all: there is no denominator.
    const ctx = worldModelAdapter.getComplianceContext();

    expect(ctx.passRate).toBeNull();          // was 1 — "100% compliant"
    expect(ctx.totalElements).toBeNull();     // was 0
    expect(ctx.undetermined).toBeDefined();
    expect(ctx.undetermined!.scope).toBe('project compliance');
  });

  it('a THROWING room store yields passRate null, not 1', () => {
    w.roomStore = throwing();
    const ctx = worldModelAdapter.getComplianceContext();
    expect(ctx.passRate).toBeNull();
    expect(ctx.undetermined).toBeDefined();
  });

  it('passRate is never 0 either — BOTH numbers are positive claims', () => {
    const ctx = worldModelAdapter.getComplianceContext();
    expect(ctx.passRate).not.toBe(0);
    expect(ctx.passRate).not.toBe(1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// NEGATIVE CONTROL — refusing EVERYWHERE is the same defect, opposite sign
// ═════════════════════════════════════════════════════════════════════════════

describe('NEGATIVE CONTROL — readable stores never refuse', () => {
  beforeEach(() => {
    w.roomStore = readable([room('r1', ['w1', 'w2'])]);
    w.wallStore = readable([{ id: 'w1' }, { id: 'w2' }]);
    w.doorStore = readable([{ id: 'd1' }]);
    w.windowStore = readable([{ id: 'win1' }]);
  });

  it('a populated project reports REAL numbers, and no refusal', () => {
    const ctx = worldModelAdapter.getFullBuildingContext('p1');
    expect(ctx.wallCount).toBe(2);
    expect(ctx.roomCount).toBe(1);
    expect(ctx.doorCount).toBe(1);
    expect(ctx.windowCount).toBe(1);
    expect(ctx.totalElements).toBe(5);
    expect(ctx.undeterminedReads).toHaveLength(0);
  });

  it('the prompt carries plain numbers, with no "unknown" anywhere', () => {
    const parsed = JSON.parse(worldModelAdapter.toPromptContext('p1'));
    expect(parsed.wallCount).toBe(2);
    expect(parsed.doorCount).toBe(1);
    expect(parsed.couldNotDetermine).toBeUndefined();
  });

  it('a room WITH boundingWallIds still reports its real count', () => {
    const ctx = worldModelAdapter.getFullBuildingContext('p1');
    expect(ctx.rooms[0]!.boundingWallCount).toBe(2);
  });

  it('compliance over a readable store produces a REAL rate, not null', () => {
    const ctx = worldModelAdapter.getComplianceContext();
    expect(ctx.passRate).not.toBeNull();
    expect(typeof ctx.passRate).toBe('number');
    expect(ctx.undetermined).toBeUndefined();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// The discriminator itself
// ═════════════════════════════════════════════════════════════════════════════

describe('determineStoreRead', () => {
  it('an EMPTY but readable store is DETERMINED', () => {
    const d = determineStoreRead(readable([]), 'wallStore');
    expect(d.kind).toBe('determined');
    if (d.kind === 'determined') expect(d.elements).toEqual([]);
  });

  it('an ABSENT store is UNDETERMINED + RELATIONSHIP_NOT_READABLE', () => {
    const d = determineStoreRead(null, 'wallStore');
    expect(d.kind).toBe('undetermined');
    if (d.kind === 'undetermined') expect(d.reason).toBe('RELATIONSHIP_NOT_READABLE');
  });

  it('a store lacking getAll is UNDETERMINED (ARM B)', () => {
    const d = determineStoreRead({}, 'wallStore');
    expect(d.kind).toBe('undetermined');
  });

  it('a THROWING getAll is UNDETERMINED (ARM A), carrying the message', () => {
    const d = determineStoreRead(throwing(), 'wallStore');
    expect(d.kind).toBe('undetermined');
    if (d.kind === 'undetermined') expect(d.detail).toContain('store not initialised');
  });

  it('is TOTAL — never throws', () => {
    expect(() => determineStoreRead(undefined, 'x')).not.toThrow();
    expect(() => determineStoreRead(throwing(), 'x')).not.toThrow();
  });

  it('storeElementsOrUnknown returns null, never [], when unreadable', () => {
    expect(storeElementsOrUnknown(null, 'x')).toBeNull();
    expect(storeElementsOrUnknown(readable([]), 'x')).toEqual([]);
  });
});

describe('count helpers', () => {
  it('countOrUnknown separates 0 from null', () => {
    expect(countOrUnknown(determineStoreRead(readable([]), 'x'))).toBe(0);
    expect(countOrUnknown(determineStoreRead(null, 'x'))).toBeNull();
  });

  it('sumOrUnknown propagates unknown, but sums real numbers', () => {
    expect(sumOrUnknown([1, 2, 3])).toBe(6);
    expect(sumOrUnknown([0, 0])).toBe(0);      // a real, determined zero
    expect(sumOrUnknown([1, null, 3])).toBeNull();
  });

  it('renderCount speaks the word "unknown", never a number', () => {
    expect(renderCount(0)).toBe(0);
    expect(renderCount(null)).toBe('unknown');
  });

  it('boundingWallCountOrUnknown: absent field is null, empty array is 0', () => {
    expect(boundingWallCountOrUnknown({ boundingWallIds: [] })).toBe(0);
    expect(boundingWallCountOrUnknown({})).toBeNull();
    expect(boundingWallCountOrUnknown({ boundingWallIds: ['a'] })).toBe(1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// UNION PIN — no rival vocabulary (C78 §8.1, closed at eleven)
// ═════════════════════════════════════════════════════════════════════════════

describe('the reasons are command-bus vocabulary, not a fork', () => {
  const src = () => readFileSync(
    resolve(REPO, 'packages/command-bus/src/consequence.ts'), 'utf8',
  );
  const union = () => {
    const s = src();
    const start = s.indexOf('export type UndeterminedReason');
    return s.slice(start, s.indexOf(';', start));
  };

  it('every reason this module produces is a member of the closed union', () => {
    for (const member of [
      'RELATIONSHIP_NOT_READABLE', 'RELATIONSHIP_NOT_RECORDED',
      'ENGINE_NOT_AVAILABLE', 'PLANNER_THREW',
    ]) {
      expect(union(), `${member} must exist in command-bus`).toContain(`'${member}'`);
    }
  });

  it('the union is still closed at ELEVEN — a fork fails here', () => {
    expect(union().match(/\|\s*'[A-Z_]+'/g)).toHaveLength(11);
  });
});
