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
 *     toasts — and its `.plat-toast` rule is not merely PRESENT but INJECTED.
 *     The distinction is the whole subject of this file, so the chain is walked
 *     rather than asserted: the rule at
 *     `ui/styles/panels/platform-shell/platformToolbar.ts:328`
 *     (`position:fixed; bottom:24px; right:24px; z-index:99999`) lives in
 *     `PLATFORM_SHELL_STYLES` → re-exported by `panels/platformShell.ts:9` →
 *     concatenated into the assembled sheet at `styles/AppTheme.ts:121` →
 *     emitted by `injectAppTheme()` (`:95`), the SOLE runtime CSS injection
 *     point (§05 §2.1), idempotent and called from many live UI modules.
 *
 *     ⚠ Three probes were needed and TWO of them lied, in different ways.
 *     Grepping `*.css`/`*.html` found nothing — the rule is inside a TypeScript
 *     template string — and would have concluded the toast was unstyled. A
 *     follow-up `grep -rn` over every file type had its output eaten by
 *     `.git/lost-found` objects before `head` cut it, and ALSO missed the live
 *     source. Only a search that ignored VCS internals found it. "Probe can be
 *     wrong three ways" is not a slogan here; it cost two wrong answers about
 *     one CSS rule.
 *
 *     None of this is load-bearing for correctness, and that is by design: the
 *     CARD is the primary surface precisely because its styles are INLINE and
 *     therefore cannot be defeated by a stylesheet that fails to inject. The
 *     toast is the redundant second channel, not the guarantee.
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
// §C83-S1-MOVE-OFFER (L-904) — the chat half of the MOVE refusal. This file
// already imports two `@app/ui` surfaces (card + toast), so the edge is not new.
import { presentWallMoveClash, describeReweldRefusal } from '@app/ui/ai/WallMoveClashProposal';
// §L-921-ATOMIC-GESTURE — the re-weld's vote, taken BEFORE the wall moves.
import { previewMoveReweld, type MoveReweldPreflightResult } from '@pryzm/command-registry';
import { semanticGraphManager } from '@pryzm/core-app-model';
import { chatSay } from '@app/ui/ai/chatPromptHost';

/** Headline the founder reads. Short, and it states the verdict, not a severity. */
const HEADLINE = 'THIS WALL CANNOT GO HERE';

/** The minimum a caller must supply per endpoint; `y` carries level elevation. */
export interface PlanPointLike {
  readonly x: number;
  readonly y?: number;
  readonly z: number;
}

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

/**
 * §L-921-ONE-CHANNEL — the MOVE arm's evaluation, WITHOUT the card and toast.
 *
 * THE FOUNDER'S ASK 1, verbatim: *"WE HAVE RIGHTFULLY IMPLEMENTED THIS MESSAGE —
 * BUT I WANT THE MESSAGE ONLY ON THE AI CHAT — THE OTHER PANEL INFORMATION
 * SHOULD BE IN THE AI CHAT."*
 *
 * A blocked MOVE used to light up THREE surfaces for one refusal: the
 * ConfirmationCard (`showSpatialRefusal`, headline "THIS WALL CANNOT GO HERE"),
 * a toast, and then the chat offer. That is one finding told three times in
 * three wordings, and the user has to assemble them.
 *
 * So the move arm no longer calls `surfaceRefusal`. It evaluates and returns;
 * the chat is the single channel, and it now carries the CARD'S OWN SENTENCE —
 * `wallCrossesOpeningRefusalText`, the shared renderer — so nothing the panel
 * used to say is lost and `[OCC_CROSSES_HOSTED_OPENING]` survives the move to
 * the new sink (§REFUSAL-IDENTITY; the identity is inside the sentence, which
 * is what `check-refusal-identity` ARM B requires).
 *
 * ⚠ CREATE IS DELIBERATELY UNCHANGED. `gateWallPlacement` keeps its card and
 * toast: the founder asked about the move refusal they were looking at, a
 * create refusal has no chat offer flow behind it, and silently removing the
 * only surface a create refusal has would turn ask 1 into a dead click. One
 * gesture's surface policy is not evidence about another's.
 */
function evaluateMoveOnly(candidate: CandidateWall): WallPlacementVerdict | null {
  const walls = readAuthoritativeWalls();
  if (walls === null) return null;
  return evaluateWallPlacement(candidate, walls);
}

/**
 * §L-921-ATOMIC-GESTURE — would this move's junction re-weld be refused?
 *
 * Reads the SAME wall store the gate judges against and the SAME `joinedTo`
 * graph `WallMoveReweldService` reads, so the pre-flight and the cascade cannot
 * disagree about who is joined to what. `null` ⇒ not evaluable, which is never
 * folded into "refused" (C83 §5.3: a question nobody answered refuses nothing).
 */
function previewReweldForMove(
  wallId: string,
  cur: readonly PlanPointLike[],
  newBaseLine: readonly [PlanPointLike, PlanPointLike],
): MoveReweldPreflightResult | null {
  const store = storeRegistry.getStoreForType('wall') as {
    getById?: (id: string) => unknown;
    getAll?: () => unknown[];
  } | undefined;
  if (!store || typeof store.getAll !== 'function' || typeof store.getById !== 'function') {
    return null;
  }
  let joined: readonly string[] | null | undefined;
  try {
    const q = semanticGraphManager.getJoinedWalls(wallId) as
      | { ok: true; joinedWallIds: readonly string[] }
      | { ok: false };
    joined = q.ok ? q.joinedWallIds : undefined;
  } catch {
    joined = undefined;
  }
  const p = (v: PlanPointLike) => ({ x: v.x, y: v.y ?? 0, z: v.z });
  return previewMoveReweld({
    wallStore: store as never,
    wallId,
    prevBaseLine: [p(cur[0]!), p(cur[1]!)],
    newBaseLine: [p(newBaseLine[0]), p(newBaseLine[1])],
    joinedWallIds: joined,
  });
}

/**
 * §C83-S1-MOVE (ISSUE-LOG L-885) — the MOVE arm of the same gate.
 *
 * ── WHY A MOVE NEEDED ITS OWN ENTRY POINT ────────────────────────────────────
 * The founder retested the shipped create fix and reported the defect again:
 * *"user can still place a wall in front of a door - without any notification"*.
 * Their console settles which gesture — `EXECUTE: UPDATE_WALL_BASELINE` →
 * `CASCADE_WALL_BASELINE` → `§MOVE-REWELD-DISPATCH` — a **move**, which the
 * create slice deliberately left uncovered and named as L-885.
 *
 * A caller moving a wall knows only `wallId` and the new baseline; the wall's
 * OWN thickness, level and curvature come off the record. Resolving them HERE
 * rather than at each of the four dispatch sites is the point — a tool that
 * must remember to look up three fields is a tool that will forget one, and
 * four copies of that lookup is four chances to drift.
 *
 * ⚠ `id: wallId` is load-bearing, not decorative. It excludes the subject from
 * its own host list, so a wall that HOSTS a door does not refuse its own move by
 * detecting its own opening. That is the wall-side form of `canPlace`'s
 * `excludeId` self-conflict defect, and it is covered by an executed silence
 * test ("a wall does not violate ITSELF when its own baseline is re-proposed").
 *
 * Returns `skipped: 'no-wall-store'` when the subject cannot be read — never a
 * clear verdict about a wall this function could not find.
 */
export function gateWallMove(
  wallId: string,
  newBaseLine: readonly [PlanPointLike, PlanPointLike],
): WallPlacementGateResult {
  if (isWallPlacementGateSuppressed()) {
    return { blocked: false, verdict: null, surfaced: false, skipped: 'suppressed' };
  }
  const walls = readAuthoritativeWalls();
  if (walls === null) {
    return { blocked: false, verdict: null, surfaced: false, skipped: 'no-wall-store' };
  }
  const subject = walls.find((w) => w.id === wallId);
  if (!subject) {
    return { blocked: false, verdict: null, surfaced: false, skipped: 'no-wall-store' };
  }

  const cur = subject.baseLine as readonly PlanPointLike[] | undefined;
  const verdict = evaluateMoveOnly({
    id: wallId,
    levelId: subject.levelId,
    thickness: typeof subject.thickness === 'number' ? subject.thickness : 0,
    baseLine: [newBaseLine[0], newBaseLine[1]],
    // §PRE-WELD-TRANSIENT — neighbours joined to the wall's CURRENT pose are
    // re-welded by the cascade half of this same drag, so their present geometry
    // is not yet judgeable. Without this, moving any wall of a rectangular room
    // is refusable whenever a door sits near the moving corner.
    ...(cur?.[0] && cur?.[1] ? { currentBaseLine: [cur[0], cur[1]] as const } : {}),
    ...((subject as { curve?: unknown }).curve !== undefined
      ? { curve: (subject as { curve?: unknown }).curve }
      : {}),
  });

  // ── §C83-S1-MOVE-OFFER (ISSUE-LOG L-904) — the refusal is not the ASK ───────
  // §L-921-ONE-CHANNEL: there is no longer a card or a toast on this path — the
  // chat is the whole surface, and it carries the card's own sentence. The
  // founder's twice-repeated ask
  // is the step beyond: the chat OPENS and offers the two nearest CLEAR stations
  // (`verdict.offers`, each pre-validated by the full occupancy predicate before
  // it may be offered — C83 §4.2). Placed HERE, on the one seam both the 3D
  // gizmo and the plan drag funnel through, so neither gesture needs its own
  // wiring and the two cannot drift. Fire-and-forget: the gate's verdict is
  // already returned; the chat question is asynchronous by nature and NEVER
  // auto-applies (C83 §4.3) — an accepted candidate dispatches ONE ordinary
  // undoable `wall.updateBaseline` through the bus.
  if (verdict === null) {
    return { blocked: false, verdict: null, surfaced: false, skipped: 'no-wall-store' };
  }

  if (!verdict.valid && cur?.[0] && cur?.[1]) {
    console.log(
      `[wallPlacementGate] §C83-S1-MOVE-OFFER routing refusal to chat (ONE channel — ` +
      `§L-921-ONE-CHANNEL, no card, no toast) — ` +
      `${verdict.offers.length} pre-validated candidate(s) for wall ${wallId}`,
    );
    void presentWallMoveClash({
      wallId,
      prevBaseLine: [cur[0], cur[1]],
      attemptedBaseLine: [newBaseLine[0], newBaseLine[1]],
      verdict,
    }).catch((err) => {
      console.warn('[wallPlacementGate] §C83-S1-MOVE-OFFER failed (non-fatal):', err);
    });
    // The chat host carries its OWN §PROMPT-REACHES-A-HUMAN guarantee: it opens
    // the panel, waits for a transcript, and falls back to a VISIBLE card rather
    // than a console line. So in a document, routing to it IS surfacing.
    return { blocked: true, verdict, surfaced: typeof document !== 'undefined' };
  }
  if (!verdict.valid) {
    return { blocked: true, verdict, surfaced: surfaceRefusal(verdict) };
  }

  // ── §L-921-ATOMIC-GESTURE — the SECOND question, which nobody used to ask ───
  //
  // The move is clear of every opening. That is not the same as "this move can
  // be completed": the junction re-weld it depends on runs AFTERWARDS, as a
  // store subscriber, and when it refuses the wall has already moved and the
  // corner is left open (§MEASURED-HALF-EXECUTED pins that at 2096 mm). Under
  // C83 §10.2.2 a re-weld may also be forbidden outright, because closing the
  // joint would move an INCUMBENT — L-922's ~2.19 m perimeter shift.
  //
  // Asked HERE because this is the one chokepoint the 3D gizmo drag-end and the
  // plan drag both funnel through, so both gestures become atomic without
  // either growing its own wiring, and the two cannot drift apart.
  if (cur?.[0] && cur?.[1]) {
    const pre = previewReweldForMove(wallId, cur, newBaseLine);
    if (pre && !pre.allowed) {
      console.warn(
        `[wallPlacementGate] §L-921-ATOMIC-GESTURE blocking wall ${wallId}: the move is clear of ` +
        `every opening, but its junction re-weld cannot be done soundly ` +
        `(cascade ok=${pre.ok}, incumbentBreach=${pre.incumbentBreach}) — nothing dispatched.`,
        { reason: pre.reason, blockingIssues: pre.blockingIssues, incumbents: pre.incumbentWallIds },
      );
      chatSay(describeReweldRefusal(wallId, 'there', pre));
      return { blocked: true, verdict, surfaced: typeof document !== 'undefined' };
    }
  }

  return { blocked: false, verdict, surfaced: false };
}
