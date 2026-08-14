// @vitest-environment happy-dom
//
// §C83-S1 — THE SURFACING TEST. This is the half that decides whether the
// feature exists from the founder's side.
//
// ── WHY THIS FILE IS NOT OPTIONAL ─────────────────────────────────────────────
// A predicate that returns `{ valid: false, reason: "…" }` has proven nothing
// about what a person sees. This repository's recurring defect — named by
// SPEC-49 §3 as "the detection is not missing, the refusal is" — is a correct
// verdict that reaches only `console.warn`. A sibling lane is fixing exactly
// that failure right now: their detector fired, the message went to the
// console, and the founder tested the feature and reported it as absent.
//
// So these tests do NOT assert that the gate "returns a refusal". They assert
// that **the door's identity is in the DOM**, that the panel is **visible**,
// and that there is **no Confirm button** — the three claims that would have
// caught the defect above.
//
// happy-dom rather than this package's default `node` environment (set per-file,
// because the config's node default is deliberate and load-bearing for other
// suites that assert `globalThis.window === undefined`).

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { storeRegistry } from '@pryzm/core-app-model';
import type { WallData } from '@pryzm/geometry-wall';
import {
  gateWallPlacement,
  isWallPlacementGateSuppressed,
  wallPlacementSurfaceFailures,
} from '@app/engine/consequence/wallPlacementGate';

// The founder's own fixture (console, build a75e8e1e).
const HOST_ID = 'wall_01M0027RDCJAMTZRY3CFWZC2T8';
const DOOR_ELEMENT_ID = 'door_01M0027RDCJAMTZRY3CFWZC2TX';
const LEVEL = 'level-0';

function hostWallWithDoor(): WallData {
  return {
    id: HOST_ID,
    type: 'wall',
    levelId: LEVEL,
    baseLine: [
      { x: 0, y: 0, z: 0 },
      { x: 21, y: 0, z: 0 },
    ],
    height: 3,
    thickness: 0.3,
    childrenIds: [DOOR_ELEMENT_ID],
    openings: [
      {
        id: '254e1386-f641-4bf9-9623-be3054d47b35',
        type: 'door',
        offset: 3.005,
        width: 0.926,
        height: 2.1,
        sillHeight: 0,
        elementId: DOOR_ELEMENT_ID,
      },
    ],
  } as unknown as WallData;
}

function registerWalls(walls: readonly WallData[]): void {
  storeRegistry.register('wall', {
    getAll: () => walls as WallData[],
    getById: (id: string) => walls.find((w) => w.id === id),
  } as never);
}

/** The card mounts itself into document.body; this is what the user would see. */
function visiblePanelText(): string {
  const panels = Array.from(document.body.querySelectorAll('div')).filter(
    (el) => (el as HTMLElement).style.display === 'block',
  );
  return panels.map((p) => p.textContent ?? '').join('\n');
}

function crossingWall(centreX: number) {
  return {
    levelId: LEVEL,
    thickness: 0.2,
    baseLine: [
      { x: centreX, y: 0, z: -2 },
      { x: centreX, y: 0, z: 4 },
    ] as [{ x: number; y: number; z: number }, { x: number; y: number; z: number }],
  };
}

beforeEach(() => {
  // ⚠ Do NOT wipe document.body here. The ConfirmationCard is a MODULE-LEVEL
  // SINGLETON that mounts its panel once — deliberately, because the panel is a
  // property of the screen and exactly one confirmation may be outstanding at a
  // time (`confirmationFlowComposition.ts`: "The flow is a module-level
  // singleton because the CARD is"). Clearing the body detaches that panel, and
  // every later render then writes into an orphaned node — which is a defect in
  // the TEST, not in the card, and destroys production state that production
  // never destroys.
  //
  // Reset the way the app does instead: dismiss the panel, drop stale toasts.
  for (const n of Array.from(document.body.querySelectorAll('div'))) {
    const el = n as HTMLElement;
    if (el.style.display === 'block') el.style.display = 'none';
  }
  for (const t of Array.from(document.body.querySelectorAll('.plat-toast'))) t.remove();
  registerWalls([hostWallWithDoor()]);
});

afterEach(() => {
  const g = globalThis as unknown as {
    __pryzmProjectLoadActive?: boolean;
    __pryzmBuildingGenActive?: boolean;
  };
  delete g.__pryzmProjectLoadActive;
  delete g.__pryzmBuildingGenActive;
});

describe('§C83-S1 — the refusal reaches the DOM, not just the return value', () => {
  it('blocks the wall AND surfaces it', () => {
    const result = gateWallPlacement(crossingWall(3.5));

    expect(result.blocked).toBe(true);
    // The claim that matters. `blocked` without `surfaced` is the dead click.
    expect(result.surfaced).toBe(true);
    // …and no surfacing failure was recorded while doing it.
    expect(wallPlacementSurfaceFailures()).toBe(0);
  });

  it('the DOM NAMES the door the wall would cut through', () => {
    gateWallPlacement(crossingWall(3.5));
    const text = visiblePanelText();

    expect(text).toContain('THIS WALL CANNOT GO HERE');
    expect(text).toContain(DOOR_ELEMENT_ID); // the element the user placed
    expect(text).toContain(HOST_ID); // the wall hosting it
    expect(text).toContain('door');
    // Both intervals, in the text a human reads — not only in the typed result.
    expect(text).toContain('3.005');
    expect(text).toContain('3.931');
    expect(text).toContain('3.400');
    expect(text).toContain('3.600');
  });

  it('offers the alternatives in the DOM, and offers NO Confirm button', () => {
    gateWallPlacement(crossingWall(3.5));
    const text = visiblePanelText();

    expect(text).toContain('positions that ARE clear');
    expect(text).toContain('back along the host wall');
    expect(text).toContain('further along the host wall');

    // C83 §5.4 — an IMPOSSIBLE finding cannot be dismissed INTO EXISTENCE: there
    // is nothing to approve, so a Confirm control must not exist. "If a rule
    // offers a dismiss button, it was never IMPOSSIBLE" — the inverse holds too:
    // if it offers a CONFIRM button, it was never a refusal.
    expect(document.querySelector('[data-role="confirm"]')).toBeNull();
    expect(document.querySelector('[data-role="cancel"]')).not.toBeNull();
  });

  it('also raises the peripheral toast', () => {
    gateWallPlacement(crossingWall(3.5));
    const toast = document.querySelector('.plat-toast');
    expect(toast).not.toBeNull();
    expect(toast?.textContent).toContain('Wall not placed');
    expect(toast?.className).toContain('error');
  });
});

describe('§C83-S1 SILENCE — a legal wall is created with NO interruption at all', () => {
  it('a wall crossing a CLEAR stretch is not blocked and shows NOTHING', () => {
    // The negative control C83 §5.1(2) marks as unskippable, asserted at the
    // surface rather than at the predicate: a validator that interrupts a
    // correct gesture gets muted, and a muted validator is worse than none.
    const result = gateWallPlacement(crossingWall(10));

    expect(result.blocked).toBe(false);
    expect(result.surfaced).toBe(false);
    expect(document.querySelector('.plat-toast')).toBeNull();
    expect(visiblePanelText()).toBe('');
    expect(wallPlacementSurfaceFailures()).toBe(0);
  });

  it('a wall touching nothing shows NOTHING', () => {
    const away = {
      levelId: LEVEL,
      thickness: 0.2,
      baseLine: [
        { x: 40, y: 0, z: 40 },
        { x: 45, y: 0, z: 40 },
      ] as [{ x: number; y: number; z: number }, { x: number; y: number; z: number }],
    };
    expect(gateWallPlacement(away).blocked).toBe(false);
    expect(visiblePanelText()).toBe('');
  });
});

describe('§C83-S1 — "not checked" is never reported as "checked and clear"', () => {
  it('project restore SUPPRESSES the gate, and says so', () => {
    // A project saved by build a75e8e1e may already contain this defect.
    // Refusing on replay would turn a visual bug into a project that will not
    // open, so restore is suppressed — and the reason is returned as data.
    (globalThis as unknown as { __pryzmProjectLoadActive?: boolean }).__pryzmProjectLoadActive =
      true;
    expect(isWallPlacementGateSuppressed()).toBe(true);

    const result = gateWallPlacement(crossingWall(3.5));
    expect(result.blocked).toBe(false);
    expect(result.skipped).toBe('suppressed'); // NOT an affirmative "clear"
    expect(result.verdict).toBeNull();
    expect(visiblePanelText()).toBe('');
  });

  it('building generation SUPPRESSES the gate', () => {
    (globalThis as unknown as { __pryzmBuildingGenActive?: boolean }).__pryzmBuildingGenActive =
      true;
    const result = gateWallPlacement(crossingWall(3.5));
    expect(result.blocked).toBe(false);
    expect(result.skipped).toBe('suppressed');
  });

  it('an unreadable wall store is reported as unreadable, not as clear', () => {
    storeRegistry.register('wall', { getAll: undefined } as never);
    const result = gateWallPlacement(crossingWall(3.5));
    expect(result.blocked).toBe(false);
    expect(result.skipped).toBe('no-wall-store');
    expect(result.verdict).toBeNull();
  });
});
