// @vitest-environment happy-dom
//
// §C83-S5 — THE SURFACING TEST. This is the half that decides whether the
// feature exists from the founder's side.
//
// ── WHY THIS FILE IS NOT OPTIONAL ─────────────────────────────────────────────
// A predicate that returns `{ valid: false, violations: [...] }` has proven
// nothing about what a person sees. The founder's report on build 46232e2d is
// the case in point: `CreateFloorCommand.canExecute` could have refused all day
// and they would still have seen a floor appear, because `FloorTool` swallows a
// failed `canExecute` into `console.error` and L-884 measured that no tool
// renders `CommandResult.info[0]` either.
//
// So these tests do NOT assert that the gate "returns a refusal". They assert
// that **the existing finish's identity is in the DOM**, that the panel is
// **visible**, that the **founder's own alternative** ("change the existing")
// is offered in words, and that there is **no Confirm button** — because an
// IMPOSSIBLE verdict has nothing to approve (C83 §5.4).
//
// happy-dom rather than the package default, set per-file, exactly as the
// sibling §C83-S1 suite does.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  gateFloorFinishPlacement,
  isFloorFinishGateSuppressed,
  floorFinishSurfaceFailures,
} from '@app/engine/consequence/floorFinishGate';

const LEVEL = 'L0';
const EXISTING_ID = 'floor_885eadf8-1d2c-4b3a-9f10-0c4e6a7b8d90';

function rect(x0: number, z0: number, x1: number, z1: number) {
  return [
    { x: x0, z: z0 },
    { x: x1, z: z0 },
    { x: x1, z: z1 },
    { x: x0, z: z1 },
  ];
}

/** The founder's fixture: one oak finish laid over the whole undivided area. */
function bigOakFinish() {
  return {
    id: EXISTING_ID,
    levelId: LEVEL,
    label: 'Oak plank',
    systemTypeId: 'ft_oak_plank',
    hostRoomId: 'room_original',
    boundary: { polygon: rect(0, 0, 6, 4) },
  };
}

function registerFloors(floors: readonly unknown[]): void {
  (globalThis as unknown as { floorStore?: unknown }).floorStore = {
    getAll: () => floors,
    getById: (id: string) => floors.find((f) => (f as { id: string }).id === id),
  };
}

/** The card mounts itself into document.body; this is what the user would see. */
function visiblePanelText(): string {
  const panels = Array.from(document.body.querySelectorAll('div')).filter(
    (el) => (el as HTMLElement).style.display === 'block',
  );
  return panels.map((p) => p.textContent ?? '').join('\n');
}

beforeEach(() => {
  // ⚠ Do NOT wipe document.body. The ConfirmationCard is a MODULE-LEVEL
  // SINGLETON that mounts its panel once — deliberately, because exactly one
  // confirmation may be outstanding at a time. Clearing the body detaches that
  // panel and every later render writes into an orphaned node, which is a defect
  // in the TEST. Reset the way the app does instead.
  for (const n of Array.from(document.body.querySelectorAll('div'))) {
    const el = n as HTMLElement;
    if (el.style.display === 'block') el.style.display = 'none';
  }
  for (const t of Array.from(document.body.querySelectorAll('.plat-toast'))) t.remove();
  registerFloors([bigOakFinish()]);
});

afterEach(() => {
  const g = globalThis as unknown as {
    __pryzmProjectLoadActive?: boolean;
    __pryzmBuildingGenActive?: boolean;
  };
  delete g.__pryzmProjectLoadActive;
  delete g.__pryzmBuildingGenActive;
});

describe('§C83-S5 — the refusal reaches the DOM, not just the return value', () => {
  it('blocks the second finish AND surfaces it', () => {
    // The founder's gesture: two partitions have just split the area, they click
    // in the new left-hand room and ask for a different finish.
    const result = gateFloorFinishPlacement({ levelId: LEVEL, polygon: rect(0, 0, 2.5, 4) });

    expect(result.blocked).toBe(true);
    // The claim that matters. `blocked` without `surfaced` is the dead click.
    expect(result.surfaced).toBe(true);
    expect(floorFinishSurfaceFailures()).toBe(0);
  });

  it('the DOM NAMES the finish that is already there, and BOTH numbers', () => {
    gateFloorFinishPlacement({ levelId: LEVEL, polygon: rect(0, 0, 2.5, 4) });
    const text = visiblePanelText();

    expect(text).toContain('THIS FLOOR AREA ALREADY HAS A FINISH');
    expect(text).toContain('Oak plank');     // what the user called it
    expect(text).toContain(EXISTING_ID);     // the element they can go and edit
    expect(text).toContain('FIN_REGION_ALREADY_FINISHED'); // the identity survived to the DOM
    // Both numbers, in the text a human reads — not only in the typed result.
    expect(text).toContain('10.000 m²');     // the area claimed twice
    expect(text).toContain('100 %');         // …of the area asked for
  });

  it('the panel says why NO version of this can exist — in FLOOR terms, not wall terms', () => {
    gateFloorFinishPlacement({ levelId: LEVEL, polygon: rect(0, 0, 2.5, 4) });
    const text = visiblePanelText();

    expect(text).toContain('two floor finishes cannot cover the same floor area');
    // The regression this guards: the shared card shipped with a wall-specific
    // invariant. A true panel carrying a false account sends the user hunting
    // for a wall that has nothing to do with their problem.
    expect(text).not.toContain('a wall and an opening cannot share the same volume');
  });

  it("offers the founder's own alternative — CHANGE the existing — and no Confirm button", () => {
    gateFloorFinishPlacement({ levelId: LEVEL, polygon: rect(0, 0, 2.5, 4) });
    const text = visiblePanelText();

    expect(text).toContain('what to do instead');
    expect(text).toContain('hange the finish already there');
    expect(text).toContain('instead of laying a second one over it');

    // C83 §5.4 — an IMPOSSIBLE finding has nothing to approve, so a Confirm
    // control must not exist. If it offers a CONFIRM button, it was never a refusal.
    expect(document.querySelector('[data-role="confirm"]')).toBeNull();
    expect(document.querySelector('[data-role="cancel"]')).not.toBeNull();
  });

  it('also raises the peripheral toast, naming the finish', () => {
    gateFloorFinishPlacement({ levelId: LEVEL, polygon: rect(0, 0, 2.5, 4) });
    const toast = document.querySelector('.plat-toast');
    expect(toast).not.toBeNull();
    expect(toast?.textContent).toContain('Floor finish not created');
    expect(toast?.textContent).toContain('Oak plank');
    expect(toast?.className).toContain('error');
  });

  it('C83 §4.3 — nothing is mutated: the store is not written and no fix is applied', () => {
    const before = JSON.stringify((globalThis as any).floorStore.getAll());
    gateFloorFinishPlacement({ levelId: LEVEL, polygon: rect(0, 0, 2.5, 4) });
    expect(JSON.stringify((globalThis as any).floorStore.getAll())).toBe(before);
  });
});

describe('§C83-S5 SILENCE — a legal finish is created with NO interruption at all', () => {
  it('drawing a finish in a room that has NONE shows NOTHING', () => {
    // The headline silence case from the brief, asserted at the SURFACE rather
    // than at the predicate: a validator that interrupts a correct gesture gets
    // muted, and a muted validator is worse than none.
    registerFloors([]);
    const result = gateFloorFinishPlacement({ levelId: LEVEL, polygon: rect(0, 0, 6, 4) });

    expect(result.blocked).toBe(false);
    expect(result.surfaced).toBe(false);
    expect(document.querySelector('.plat-toast')).toBeNull();
    expect(visiblePanelText()).toBe('');
    expect(floorFinishSurfaceFailures()).toBe(0);
  });

  it('a finish in the ADJACENT room, sharing an edge, shows NOTHING', () => {
    // The normal result of two rooms either side of one partition. If this
    // fires, every correctly-drawn plan in the product screams.
    registerFloors([{ id: 'floor_left', levelId: LEVEL, boundary: { polygon: rect(0, 0, 3, 4) } }]);
    const result = gateFloorFinishPlacement({ levelId: LEVEL, polygon: rect(3, 0, 6, 4) });

    expect(result.blocked).toBe(false);
    expect(visiblePanelText()).toBe('');
    expect(document.querySelector('.plat-toast')).toBeNull();
  });

  it('a finish on ANOTHER LEVEL, at the same x/z, shows NOTHING', () => {
    registerFloors([{ ...bigOakFinish(), levelId: 'L1' }]);
    const result = gateFloorFinishPlacement({ levelId: LEVEL, polygon: rect(0, 0, 6, 4) });

    expect(result.blocked).toBe(false);
    expect(visiblePanelText()).toBe('');
  });

  it('a finish far away shows NOTHING', () => {
    const result = gateFloorFinishPlacement({
      levelId: LEVEL,
      polygon: rect(100, 100, 106, 104),
    });
    expect(result.blocked).toBe(false);
    expect(visiblePanelText()).toBe('');
  });

  it('re-proposing a finish\'s OWN boundary shows NOTHING (the §C79-5.2 re-projection path)', () => {
    // A wall move re-projects a finish onto a new ring through
    // `UpdateFloorBoundaryCommand`. If the gate refused a finish against ITSELF,
    // "floor follows wall" would break the moment this rule shipped.
    const result = gateFloorFinishPlacement({
      id: EXISTING_ID,
      levelId: LEVEL,
      polygon: rect(0, 0, 6, 4),
    });
    expect(result.blocked).toBe(false);
    expect(visiblePanelText()).toBe('');
  });
});

describe('§C83-S5 — "not checked" is never reported as "checked and clear"', () => {
  it('project restore SUPPRESSES the gate, and says so', () => {
    // A project saved by build 46232e2d may ALREADY hold overlapping finishes —
    // the founder's does. Refusing on replay would turn a visual defect into a
    // project that will not open.
    (globalThis as unknown as { __pryzmProjectLoadActive?: boolean }).__pryzmProjectLoadActive = true;
    expect(isFloorFinishGateSuppressed()).toBe(true);

    const result = gateFloorFinishPlacement({ levelId: LEVEL, polygon: rect(0, 0, 2.5, 4) });
    expect(result.blocked).toBe(false);
    expect(result.skipped).toBe('suppressed');   // NOT an affirmative "clear"
    expect(result.verdict).toBeNull();
    expect(visiblePanelText()).toBe('');
  });

  it('building generation SUPPRESSES the gate', () => {
    (globalThis as unknown as { __pryzmBuildingGenActive?: boolean }).__pryzmBuildingGenActive = true;
    const result = gateFloorFinishPlacement({ levelId: LEVEL, polygon: rect(0, 0, 2.5, 4) });
    expect(result.blocked).toBe(false);
    expect(result.skipped).toBe('suppressed');
    expect(visiblePanelText()).toBe('');
  });

  it('an unreadable floor store is reported as unreadable, not as clear', () => {
    (globalThis as unknown as { floorStore?: unknown }).floorStore = { getAll: undefined };
    const result = gateFloorFinishPlacement({ levelId: LEVEL, polygon: rect(0, 0, 2.5, 4) });
    expect(result.blocked).toBe(false);
    expect(result.skipped).toBe('no-floor-store');
    expect(result.verdict).toBeNull();
  });

  it('a self-intersecting EXISTING finish is UNDETERMINED — silent, and not a refusal', () => {
    // C83 §5.3: a question nobody answered may not refuse anything. The verdict
    // still carries the reason, so the gap is recorded rather than rendered as a pass.
    registerFloors([{
      id: 'floor_bowtie',
      levelId: LEVEL,
      boundary: {
        polygon: [{ x: 0, z: 0 }, { x: 4, z: 4 }, { x: 4, z: 0 }, { x: 0, z: 4 }],
      },
    }]);
    const result = gateFloorFinishPlacement({ levelId: LEVEL, polygon: rect(1, 1, 3, 3) });

    expect(result.blocked).toBe(false);
    expect(visiblePanelText()).toBe('');
    expect(result.verdict?.undetermined?.[0]?.reason).toBe('REGION_BOOLEAN_REFUSED');
  });
});
