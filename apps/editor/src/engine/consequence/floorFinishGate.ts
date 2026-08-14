/**
 * floorFinishGate — §C83-S5, the seam where the FLOOR-FINISH overlap refusal
 * REACHES A PERSON.
 *
 * ── THE FOUNDER'S REPORT (build 46232e2d), and what their console proves ─────
 *
 *   "in an area with a floor finish already in place the user creates two
 *    internal partitions … then the user tries to create a different floor
 *    finish in the room - and creates an overlapping one - wrong!"
 *
 * Their log is unambiguous about which half is broken:
 *
 *   [WallPlanToolHandler] Wall dispatched — mode: ortho          ×2
 *   [RoomDetectionEngine] Detected 4 room(s) on level 'L0'       ← healthy
 *   [FloorTool] setDrawingMode → AUTO_FROM_ROOM
 *   EXECUTE: CREATE_FLOOR → [FloorTool] Floor created: 885eadf8… ← the rival
 *
 * Room detection worked. Nothing stopped the second finish, and nothing told
 * the user why it should have been stopped, because nothing asked.
 *
 * ── WHY A GATE MODULE AND NOT "just refuse in canExecute" ────────────────────
 * `CreateFloorCommand.canExecute` DOES refuse now — that arm is the backstop
 * for every creator that never passes a tool (import, paste, the four building
 * executors). But `CommandManagerImpl:217` renders `blockingIssues[0]` into
 * `CommandResult.info[0]`, and **L-884 measured that no tool renders
 * `result.info[0]`**: a refusal that stops there reaches devtools and nothing
 * else. Worse, `FloorTool._createFloor` calls `cmd.canExecute()` ITSELF and
 * `console.error`s the failure — so the command-seam refusal never even reaches
 * `CommandManagerImpl`. That is C11 §7.6's dead click, and it is exactly the
 * experience the founder reported: they act, nothing happens, no reason given.
 *
 * SPEC-49 §3 already wrote the sentence this module exists to obey:
 * **"The detection is not missing. The refusal is."**
 *
 * ── THE SURFACE, AND WHY IT IS THIS ONE ──────────────────────────────────────
 * C83 §4.1 names `ConsequencePlan → ConfirmationFlow → ConfirmationCard` as THE
 * canonical surface and warns that a fifth surface is the failure mode. This
 * module adds none. It reuses, verbatim, the two channels `wallPlacementGate`
 * already proved live in this session:
 *
 *   • the **CARD** (`ConfirmationCard.showSpatialRefusal`) — primary, because
 *     every one of its styles is INLINE (`el.style.cssText` / `innerHTML`), so
 *     unlike a class-based surface it cannot be silently defeated by a
 *     stylesheet that fails to inject (the failure that killed the "🏗 Data
 *     toolbar button", ISSUE-LOG L-870);
 *   • the **TOAST** (`showToast`) — peripheral, because a user whose eyes are
 *     on the cursor can miss a panel at the top of the screen.
 *
 * ⚠ `wireToolForConsequencePreview` has **zero callers repo-wide** and
 * `triggerConsequencePreview` has exactly one, gated to wall MOVE. The preview
 * overlay is therefore NOT used here — building on it would produce precisely
 * the dead click this module exists to remove.
 *
 * The card's per-rule wording is passed explicitly. Reusing the card with its
 * default sentence would have told a user drawing a floor that *"a wall and an
 * opening cannot share the same volume"* — a true panel carrying a false
 * account, which sends them looking for a wall. `SpatialRefusalWording` exists
 * for that reason and for no other.
 *
 * ── AND IT NEVER DEGRADES TO SILENCE ─────────────────────────────────────────
 * `surfaced` is returned as DATA, and a browser with no reachable surface
 * increments a counter a test can assert on. A gate that quietly stops
 * surfacing is indistinguishable from a gate that stopped firing.
 *
 * ── WHAT THIS FILE MAY NOT DO ────────────────────────────────────────────────
 * It does not mutate. C83 §4.3: an IMPOSSIBLE finding refuses (nothing is
 * created, nothing changes) and there is no auto-fix. The founder's own
 * alternative — *"but rather change the existing"* — is rendered as TEXT. The
 * user performs it, so the change travels the bus as one ordinary undoable
 * command (P6) instead of firing from a notification.
 *
 * @file apps/editor/src/engine/consequence/floorFinishGate.ts
 */

import {
  evaluateFloorFinishPlacement,
  floorRegionRefusalText,
  type CandidateFloorRegion,
  type ExistingFloorRegion,
  type FloorRegionVerdict,
} from '@pryzm/command-registry';
import { showToast } from '@app/ui/platform/PlatformToastSystem';
import { ConfirmationCard } from '@app/ui/consequence/ConfirmationCard';
import { getConfirmationCard } from '@app/ui/consequence/confirmationFlowComposition';

/** Headline the founder reads. It states the verdict, not a severity. */
const HEADLINE = 'THIS FLOOR AREA ALREADY HAS A FINISH';

/**
 * The rule-specific wording for the shared card. Every sentence here is about
 * FLOORS; none of it mentions walls or openings.
 */
const FLOOR_WORDING = {
  invariant:
    'Nothing was created. This is not a warning you can click past — two floor finishes cannot cover the same floor area, so there is no version of this that the model can hold: the meshes would fight, and the area would be counted twice in every schedule and export.',
  offersHeading: '◆ what to do instead',
  offersFootnote:
    'Changing the finish that is already there keeps ONE finish per area, which is the state the model can hold.',
  noOffersText:
    'No alternative could be computed and defended here, so none is suggested — a guessed one would be worse than none.',
} as const;

export interface FloorFinishGateResult {
  /** true ⇒ the caller MUST NOT dispatch. */
  readonly blocked: boolean;
  /** The verdict, for callers that want the typed violations rather than the prose. */
  readonly verdict: FloorRegionVerdict | null;
  /** false with `blocked: true` in a browser is a DEFECT in this module. */
  readonly surfaced: boolean;
  /** Why nothing was evaluated, when that is the case — never conflated with "clear". */
  readonly skipped?: 'suppressed' | 'no-floor-store';
}

/**
 * §C83-S5 — the two suppression flags, honoured because C83 §3.1 makes it a MUST.
 * Same two globals `WallOccupancyStore.__pryzmLoadActive()` and
 * `isWallPlacementGateSuppressed()` already read, so the three gates cannot
 * drift apart.
 *
 *  • **Project restore.** Projects saved by build 46232e2d may ALREADY contain
 *    overlapping finishes — the founder's own does. Enforcing on replay would
 *    turn a visual defect into data loss.
 *  • **Generation.** The residential and office executors lay dozens of finishes
 *    per storey inside one batch; refusing mid-batch would produce refusals
 *    about intermediate states, which is C83 §5's false-positive failure mode
 *    and the fastest route to the whole surface being muted.
 */
export function isFloorFinishGateSuppressed(): boolean {
  const g = globalThis as unknown as {
    __pryzmProjectLoadActive?: boolean;
    __pryzmBuildingGenActive?: boolean;
  };
  return g.__pryzmProjectLoadActive === true || g.__pryzmBuildingGenActive === true;
}

/**
 * The authoritative floor list.
 *
 * `window.floorStore` is the ADR-0318 singleton constructed at
 * `initBuilders.ts:418` and read by `ProjectSerializer`; BOTH creation paths land
 * in it — the 3D `FloorTool` through `CreateFloorCommand.execute` →
 * `floorStore.add`, and the plan path through the `floor.create` bus route,
 * whose plugin store is bridged back into it. A handler's own Immer draft is
 * NOT a superset and a rule reading one would be blind to finishes created by
 * the other gesture — which is exactly the case the founder hit.
 *
 * Returns `null` (not `[]`) when the store cannot be read, so "not checked"
 * can never be reported as "checked and clear".
 */
function readAuthoritativeFloors(): readonly ExistingFloorRegion[] | null {
  const store = (globalThis as unknown as { floorStore?: { getAll?: () => unknown[] } }).floorStore;
  if (!store || typeof store.getAll !== 'function') return null;
  try {
    const all = store.getAll() as Array<{
      id: string;
      levelId: string;
      label?: string;
      systemTypeId?: string;
      hostRoomId?: string;
      boundary?: { polygon?: Array<{ x: number; z: number }> };
    }>;
    return all.map((f) => ({
      id: f.id,
      levelId: f.levelId,
      polygon: f.boundary?.polygon ?? [],
      ...(f.label !== undefined ? { label: f.label } : {}),
      ...(f.systemTypeId !== undefined ? { systemTypeId: f.systemTypeId } : {}),
      ...(f.hostRoomId !== undefined ? { hostRoomId: f.hostRoomId } : {}),
    }));
  } catch {
    return null;
  }
}

// The card used when the confirmation FLOW has not been composed in this session.
// Same class, same renderer, same panel geometry — one surface with two possible
// owners, not two surfaces. Module-level because the panel is: exactly one may be
// on screen.
let _fallbackCard: ConfirmationCard | null = null;

function acquireCard(): ConfirmationCard | null {
  if (typeof document === 'undefined') return null;
  const composed = getConfirmationCard();
  if (composed) return composed;
  if (!_fallbackCard) {
    _fallbackCard = new ConfirmationCard();
    // Nothing to confirm — an IMPOSSIBLE verdict has no approvable arm (C83 §5.4).
    _fallbackCard.setHandlers(
      () => {
        /* no confirm arm exists on a spatial refusal */
      },
      () => _fallbackCard?.hide(),
    );
  }
  return _fallbackCard;
}

/** Counts surfacing failures so a test can assert on them. Never reset in production. */
export function floorFinishSurfaceFailures(): number {
  const g = globalThis as unknown as { __pryzmC83FloorSurfaceFailures?: number };
  return g.__pryzmC83FloorSurfaceFailures ?? 0;
}

function surfaceRefusal(verdict: FloorRegionVerdict): boolean {
  // §REFUSAL-IDENTITY — through the SHARED renderer, never
  // `verdict.reason ?? '<fallback>'`. A fallback fires exactly when the producer
  // refused AND said nothing, and is then indistinguishable from a real reason.
  // The shared renderer always carries `FIN_REGION_ALREADY_FINISHED` into the
  // text, so the identity survives the trip to a DOM sink that takes only a string.
  const sentence = floorRegionRefusalText(verdict.violations, verdict.offers);
  let surfaced = false;

  const card = acquireCard();
  if (card) {
    card.showSpatialRefusal(
      HEADLINE,
      sentence,
      verdict.offers.map((o) => `${o.label.charAt(0).toUpperCase()}${o.label.slice(1)}.`),
      FLOOR_WORDING,
    );
    surfaced = true;
  }

  try {
    if (typeof document !== 'undefined') {
      // Short, peripheral, and it names the thing — the full account is on the card.
      const first = verdict.violations[0];
      const named = (first?.existingLabel ?? '').trim();
      showToast(
        named.length > 0
          ? `Floor finish not created — "${named}" already covers this area.`
          : 'Floor finish not created — this area already has a finish.',
        'error',
        6000,
      );
      surfaced = true;
    }
  } catch {
    /* the card is the primary surface; a toast failure must not mask it */
  }

  if (!surfaced && typeof document !== 'undefined') {
    // A browser with no reachable surface. This is the failure this module was
    // written to make impossible, so it is reported as a defect rather than
    // absorbed — a silent gate looks exactly like a gate that never fired.
    const g = globalThis as unknown as { __pryzmC83FloorSurfaceFailures?: number };
    g.__pryzmC83FloorSurfaceFailures = (g.__pryzmC83FloorSurfaceFailures ?? 0) + 1;
    console.error(
      '[C83][SURFACE-UNAVAILABLE] a floor finish was REFUSED and the refusal reached NO ' +
      'user-visible surface. Nothing was created, so the model is correct — but from the ' +
      "user's side this is an unexplained dead click, which is the defect this gate exists to " +
      'prevent. Refusal text follows:\n' + sentence,
    );
  }
  return surfaced;
}

/**
 * THE gate. Evaluate a proposed floor finish against the live model; when it
 * would cover floor area an existing finish already covers, refuse it and TELL
 * THE USER — naming the finish that is already there, and offering the founder's
 * own alternative (change that one instead).
 *
 * Callers dispatch only when `blocked === false`. An UNDETERMINED verdict is not
 * blocked (C83 §5.3: a question nobody answered may not refuse anything), and a
 * suppressed or unreadable model is reported via `skipped` so a caller can never
 * mistake "not checked" for "checked and clear".
 */
export function gateFloorFinishPlacement(candidate: CandidateFloorRegion): FloorFinishGateResult {
  if (isFloorFinishGateSuppressed()) {
    return { blocked: false, verdict: null, surfaced: false, skipped: 'suppressed' };
  }
  const floors = readAuthoritativeFloors();
  if (floors === null) {
    return { blocked: false, verdict: null, surfaced: false, skipped: 'no-floor-store' };
  }

  const verdict = evaluateFloorFinishPlacement(candidate, floors);
  if (verdict.valid) return { blocked: false, verdict, surfaced: false };

  return { blocked: true, verdict, surfaced: surfaceRefusal(verdict) };
}
