/**
 * wallPlacementGate — §C83-S1, the seam where the wall-side occupancy refusal
 * REACHES A PERSON.
 *
 * ── THE DEFECT THIS FILE EXISTS TO NOT REPEAT ─────────────────────────────────
 * The predicate (`@pryzm/geometry-wall/WallCrossesOpening`) is pure, tested and
 * correct. That is worth nothing on its own. This repository's recurring failure
 * is not missing detection — `SPEC-49` §3 already wrote the sentence:
 * **"The detection is not missing. The refusal is."** A rule that computes a
 * perfect verdict and speaks only to `console.warn` has not shipped; the founder
 * tests the feature, sees nothing, and reports it as absent. This module is the
 * carrying, and it is the reason the slice is not "done" at the predicate.
 *
 * ── THE SURFACE, AND WHY IT IS THIS ONE (measured, not assumed) ───────────────
 * C83 §4.1 names `ConsequencePlan → ConfirmationFlow → ConfirmationCard` as THE
 * canonical surface, and warns that a fifth surface is the failure mode. Three
 * things were MEASURED before building on it:
 *
 *  1. ⚠ **`wireToolForConsequencePreview` has ZERO callers repo-wide**, and
 *     `triggerConsequencePreview` has exactly ONE production caller
 *     (`MovePlanToolHandler.ts:256`), which returns early unless the drag target
 *     is a wall MOVE. So the *preview-overlay* delivery trigger is DEAD for
 *     `wall.create`. C11 §7.6 names what shipping onto it would produce: *"a
 *     rejection surfaces to the user as a DEAD CLICK BEHIND A PERFECT PREVIEW."*
 *     **This module therefore does not use that trigger at all.**
 *  2. The CARD itself is live and independent of that trigger:
 *     `MovePlanToolHandler.ts:540` calls `requestWallMoveConfirmation`, which
 *     composes `ConfirmationCard`, whose constructor mounts its own panel with
 *     `document.body.appendChild`. Every style is INLINE (`el.style.cssText`),
 *     so unlike a class-based surface it cannot be silently defeated by a
 *     missing stylesheet — the failure mode that killed the "🏗 Data toolbar
 *     button" (ISSUE-LOG L-870, `.plat-toolbar` never in the DOM).
 *  3. `showToast` is live — the founder already sees save/export/collaborator
 *     toasts — and its `.plat-toast` rule DOES exist, at
 *     `ui/styles/panels/platform-shell/platformToolbar.ts:328`
 *     (`position:fixed; bottom:24px; right:24px; z-index:99999`). A first probe
 *     that grepped only `*.css`/`*.html` found nothing and would have concluded
 *     the toast was unstyled; the rule lives in a TypeScript template string.
 *     Recorded because that near-miss is exactly the "probe can be wrong three
 *     ways" trap.
 *
 * So the refusal is delivered TWICE, both proven live, for different reasons:
 * the CARD carries the full sentence and the alternatives (it is the canonical
 * surface and it persists until dismissed), and the TOAST is the peripheral
 * signal, because a user whose eyes are on the cursor can miss a panel that
 * appears at the top of the screen.
 *
 * ── AND IT NEVER DEGRADES TO SILENCE ─────────────────────────────────────────
 * `surfaced` is returned as DATA. If a browser is present and neither surface
 * could be reached, that is a defect in this file, and it is reported as one —
 * loudly, and counted, so a test can assert it rather than a human noticing its
 * absence. A gate that quietly stops surfacing is indistinguishable from a gate
 * that stopped firing.
 *
 * ── WHAT THIS FILE MAY NOT DO ────────────────────────────────────────────────
 * It does not mutate. C83 §4.3: an IMPOSSIBLE finding refuses (the command does
 * not execute; nothing changes) and there is no auto-fix. The alternatives are
 * rendered as text, never applied.
 *
 * @file apps/editor/src/engine/consequence/wallPlacementGate.ts
 */

import { storeRegistry } from '@pryzm/core-app-model';
import {
  evaluateWallPlacement,
  wallCrossesOpeningRefusalText,
  type CandidateWall,
  type WallData,
  type WallPlacementVerdict,
} from '@pryzm/geometry-wall';
import { showToast } from '@app/ui/platform/PlatformToastSystem';
import { ConfirmationCard } from '@app/ui/consequence/ConfirmationCard';
import { getConfirmationCard } from '@app/ui/consequence/confirmationFlowComposition';

/** Headline the founder reads. Short, and it states the verdict, not a severity. */
const HEADLINE = 'THIS WALL CANNOT GO HERE';

/**
 * §C83-S3.1 — the two suppression flags, honoured because C83 §3.1 makes it a MUST.
 *
 * This is not a performance concession, it is a correctness one, and it has two
 * distinct halves:
 *
 *  • **Project restore.** Existing saved projects may ALREADY contain a wall
 *    crossing a door — the founder's build a75e8e1e created one, and it was
 *    saved. Enforcing on replay would make those projects fail to load, which
 *    would turn a cosmetic defect into data loss. A rule introduced today may
 *    not retroactively refuse yesterday's documents.
 *  • **Generation.** `ConstraintEngine._scheduleRun` is suppressed while
 *    `batchCoordinator.isBatching` for the reason stated in its own source:
 *    *"The model is in an incomplete state — validating now produces spurious
 *    compliance errors."* A generator that emits 400 commands must not produce
 *    400 refusals about intermediate states.
 *
 * Same two globals `WallOccupancyStore.__pryzmLoadActive()` already reads, so the
 * pre-flight decline and the store's own logging suppression cannot drift apart.
 */
export function isWallPlacementGateSuppressed(): boolean {
  const g = globalThis as unknown as {
    __pryzmProjectLoadActive?: boolean;
    __pryzmBuildingGenActive?: boolean;
  };
  return g.__pryzmProjectLoadActive === true || g.__pryzmBuildingGenActive === true;
}

/**
 * The authoritative wall list — the ONE that carries openings from BOTH
 * placement paths, which is the whole reason it is read here and not from a
 * handler's Immer draft.
 *
 * MEASURED: 3D door placement writes `WallStore.addOpening` directly
 * (`CreateWallOpeningCommand.execute`), while the PLAN path dispatches
 * `wall.opening.create` into `CreateWallOpeningLegacyAdapter`, which writes the
 * Immer store AND is bridged into the same `WallStore` by
 * `initTools.ts:1162` (`runtime.events.on('wall.opening.created')`). So the
 * legacy `WallStore` — `storeRegistry.getStoreForType('wall')`, the ADR-0318
 * singleton `ProjectSerializer` reads — is a SUPERSET of both. The plugin's own
 * `ctx.stores.wall` is NOT: a door placed in 3D never appears in it, and a rule
 * reading that draft would be blind to exactly the case the founder reported.
 */
function readAuthoritativeWalls(): readonly WallData[] | null {
  const store = storeRegistry.getStoreForType('wall') as
    | { getAll?: () => unknown[] }
    | undefined;
  if (!store || typeof store.getAll !== 'function') return null;
  try {
    return store.getAll() as WallData[];
  } catch {
    return null;
  }
}

export interface WallPlacementGateResult {
  /** true ⇒ the caller MUST NOT dispatch. */
  readonly blocked: boolean;
  /** The verdict, for callers that want the typed violations rather than the prose. */
  readonly verdict: WallPlacementVerdict | null;
  /** false with `blocked: true` in a browser is a DEFECT in this module. */
  readonly surfaced: boolean;
  /** Why nothing was evaluated, when that is the case — never conflated with "clear". */
  readonly skipped?: 'suppressed' | 'no-wall-store';
}

// The card used when the confirmation FLOW has not been composed in this session
// (it is composed lazily, by the first wall MOVE). Same class, same renderer,
// same panel geometry — so this is one surface with two possible owners, not two
// surfaces. Module-level because the panel is: exactly one may be on screen.
let _fallbackCard: ConfirmationCard | null = null;

function acquireCard(): ConfirmationCard | null {
  if (typeof document === 'undefined') return null;
  const composed = getConfirmationCard();
  if (composed) return composed;
  if (!_fallbackCard) {
    _fallbackCard = new ConfirmationCard();
    // Nothing to confirm — an IMPOSSIBLE verdict has no approvable arm (C83 §5.4).
    // Cancel is the only control, and it means "I have read this".
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
export function wallPlacementSurfaceFailures(): number {
  const g = globalThis as unknown as { __pryzmC83SurfaceFailures?: number };
  return g.__pryzmC83SurfaceFailures ?? 0;
}

function surfaceRefusal(verdict: WallPlacementVerdict): boolean {
  // §REFUSAL-IDENTITY — through the SHARED renderer, never `verdict.reason ??
  // '<fallback>'`. A fallback fires exactly when the producer refused AND said
  // nothing, and is then indistinguishable from a real reason — which hides the
  // under-reporting arm rather than exposing it. The shared renderer always
  // carries `OCC_CROSSES_HOSTED_OPENING` into the text, so the identity survives
  // the trip to a DOM sink that takes only a string.
  const sentence = wallCrossesOpeningRefusalText(verdict.violations, verdict.offers);
  let surfaced = false;

  const card = acquireCard();
  if (card) {
    card.showSpatialRefusal(
      HEADLINE,
      sentence,
      verdict.offers.map((o) => `Move it ${o.label}.`),
    );
    surfaced = true;
  }

  try {
    if (typeof document !== 'undefined') {
      // Short, peripheral, and it names the thing — the full account is on the card.
      const first = verdict.violations[0];
      showToast(
        `Wall not placed — it would cut through a ${first?.openingType ?? 'opening'}.`,
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
    const g = globalThis as unknown as { __pryzmC83SurfaceFailures?: number };
    g.__pryzmC83SurfaceFailures = (g.__pryzmC83SurfaceFailures ?? 0) + 1;
    console.error(
      '[C83][SURFACE-UNAVAILABLE] a wall placement was REFUSED and the refusal reached NO ' +
      'user-visible surface. The wall was not created, so the model is correct — but from the ' +
      'user\'s side this is an unexplained dead click, which is the defect this gate exists to ' +
      'prevent. Refusal text follows:\n' + sentence,
    );
  }
  return surfaced;
}

/**
 * THE gate. Evaluate a proposed wall against the live model; when it crosses an
 * existing door or window, refuse it and TELL THE USER.
 *
 * Callers dispatch only when `blocked === false`. An UNDETERMINED verdict is not
 * blocked (C83 §5.3: a question nobody answered may not refuse anything), and a
 * suppressed or unreadable model is reported via `skipped` so a caller can never
 * mistake "not checked" for "checked and clear".
 */
export function gateWallPlacement(candidate: CandidateWall): WallPlacementGateResult {
  if (isWallPlacementGateSuppressed()) {
    return { blocked: false, verdict: null, surfaced: false, skipped: 'suppressed' };
  }
  const walls = readAuthoritativeWalls();
  if (walls === null) {
    return { blocked: false, verdict: null, surfaced: false, skipped: 'no-wall-store' };
  }

  const verdict = evaluateWallPlacement(candidate, walls);
  if (verdict.valid) return { blocked: false, verdict, surfaced: false };

  return { blocked: true, verdict, surfaced: surfaceRefusal(verdict) };
}
