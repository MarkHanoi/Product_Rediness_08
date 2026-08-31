// UpdateOpeningProfileBatchHandler — `element.updateOpeningProfileBatch`
// (§CHAT-OPENING-SHAPE, L-10944).
//
// Bus surface for the founder's *"change all windows to segmental type"* — the
// sentence the product answered with *"There is no window type called
// 'segmental type' in this project"*. There is not: "segmental" is not a TYPE,
// it is an opening PROFILE, and the profile axis has been complete since
// L-1200/L-1250 with a live single-opening EDIT route since L-1252. What was
// missing is a batch verb, so a sentence could reach 85 windows the way the
// property panel reaches one.
//
// ⭐ IT IS THE SIBLING OF `element.updateDimensionsBatch`, NOT A FIELD ON IT.
// A profile is not a dimension: `UpdateElementParameterCommand` (that verb's
// child) routes by `elementType` and applies a parameter bag, and it has no
// profile arm — it would write `openingProfile` onto the window record and stop
// there, leaving the WALL still cutting a rectangle under a curved frame
// (C86 §11 #1, the frame and the void diverging). The hosted-opening commands
// carry the `updateOpening` hop that closes it. Folding this into the
// dimensions verb would have made one verb mean two writes with two different
// authoritative reaches, which is how a "Done" over a no-op gets minted.
//
// Payload contract:
//   • `elementIds: string[]` — an EXPLICIT list, always. There is deliberately
//     no `'all'` form: the chat resolves the scope to ids first so the Confirm
//     card can state the real COUNT before the user agrees to a mass reshape.
//   • `elementKind: 'window' | 'door'` — selects the child command AND the
//     legality table. ⛔ A DOOR MAY NOT BE CIRCULAR (§OPENING-PROFILE-BY-FAMILY,
//     L-1251) and this handler refuses it BY NAME, with the rule, rather than
//     letting N doors each refuse separately about their sills.
//   • `openingProfile` — one of geometry-wall's four `OpeningProfileKind`s.
//
// ── AUTHORITATIVE STATE ─────────────────────────────────────────────────────
//
// `window.commandManager → UpdateOpeningProfileBatchCommand →
// UpdateWindow/DoorParameterCommand → windowStore/doorStore AND wallStore`.
// This handler deliberately does NOT `produceCommand` against `ctx.stores`:
// that is the fresh plugin DTO store production `bootstrap` hands the bus, which
// nothing renders, persists or exports (§FIX-DIMS-REACH-RECORD, L-815).
//
// ── UNDO ────────────────────────────────────────────────────────────────────
//
// `affectedStores` is `[]` and the patch pair is empty BY DESIGN (C16 CA-19):
// the legacy commandManager owns this undo step. Declaring stores here would arm
// a RingBuffer patch pair for a write this handler did not itself make. Undo is
// proven through `UpdateOpeningProfileBatchCommand.undo()`, which replays each
// child's authored-field restore in reverse.
//
// ── HONEST REPORTING (§CONTEXT-DATA-HONESTY) ────────────────────────────────
//
// Partial-failure policy lives in the COMMAND: "Changed 38 of 42 windows to
// Segmental — 4 skipped · 4× curved host". The bridge re-broadcasts it as
// `pryzm-opening-profile-batch-report`, including the §FIX-REPORT-PAYLOAD-
// DISCARD `'indeterminate'` outcome: the two paths on which a bridge emits
// NOTHING (no command sink; the bridge threw) are otherwise indistinguishable
// from a clean run at every layer above, and ZeroTokenChatBridge read "no
// report" as `{ ok: true }` and printed "Done" over a model nothing had touched
// (C68 §5.g).
//
// ⚠ THE SEGMENTAL RISE STAYS DECLARED. `SEGMENTAL_RISE_RATIO` has no authored
// source (`WindowModePicker.ts:37-40` — NOT MEASURED, nobody has been asked).
// Nothing on this route computes or claims a rise; it sets the profile.
//
// P8 — `withHandlerSpan` wraps the hot path (C10 §2).

import {
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
// ⛔ The kind list and the per-family legality table come THROUGH
// @pryzm/command-registry, which re-exports geometry-wall's originals. This
// plugin does not depend on geometry-wall, and typing the four names in here
// would be a second vocabulary — the C84 EI-9 defect OpeningProfile.ts declares
// itself the one place against.
import {
  UpdateOpeningProfileBatchCommand,
  OPENING_PROFILE_KINDS,
  openingProfilesFor,
} from '@pryzm/command-registry';

export interface UpdateOpeningProfileBatchPayload {
  /** The resolved ids to reshape. Never 'all' — see the header. */
  readonly elementIds: readonly string[];
  readonly elementKind: 'window' | 'door';
  readonly openingProfile: string;
}

/** Detail shape of the `pryzm-opening-profile-batch-report` CustomEvent —
 *  identical in shape to the dimensions batch's, so one reader serves both. */
export interface OpeningProfileBatchReport {
  readonly success: boolean;
  readonly info: readonly string[];
  readonly affectedElementIds: readonly string[];
  /** 'applied' | 'refused' | 'indeterminate' — see §FIX-REPORT-PAYLOAD-DISCARD. */
  readonly outcome: 'applied' | 'refused' | 'indeterminate';
}

export const OPENING_PROFILE_BATCH_REPORT_EVENT = 'pryzm-opening-profile-batch-report';

const FAMILIES = ['window', 'door'] as const;

export const UpdateOpeningProfileBatchHandler: CommandHandler<
  UpdateOpeningProfileBatchPayload,
  Record<string, unknown>
> = {
  type: 'element.updateOpeningProfileBatch',
  // Bridges to the legacy command manager — mutates NO plugin store. See header.
  affectedStores: [] as const,

  canExecute(
    _ctx: HandlerContext<Record<string, unknown>>,
    cmd: UpdateOpeningProfileBatchPayload,
  ): ValidationResult {
    if (!Array.isArray(cmd?.elementIds)) {
      return { valid: false, reason: 'elementIds must be an array of element ids' };
    }
    if (cmd.elementIds.length === 0) {
      // §NO-EMPTY-MEANS-UNKNOWN — an empty target set is not a successful no-op.
      return { valid: false, reason: 'elementIds must not be empty' };
    }
    if (!(FAMILIES as readonly string[]).includes(cmd.elementKind)) {
      return {
        valid: false,
        reason: `elementKind must be one of ${FAMILIES.join(' / ')} — only hosted openings carry a profile`,
      };
    }
    if (!(OPENING_PROFILE_KINDS as readonly string[]).includes(cmd.openingProfile)) {
      return {
        valid: false,
        reason: `openingProfile must be one of ${OPENING_PROFILE_KINDS.join(' / ')}`,
      };
    }
    // ⛔ §OPENING-PROFILE-BY-FAMILY (L-1251) — refuse the illegal COMBINATION
    // here, out loud, with the rule. The command re-checks it (a validator that
    // only lives in one of two callers is a validator that will be bypassed),
    // but a bus caller deserves the reason at the gate.
    const legal = openingProfilesFor(cmd.elementKind);
    if (!(legal as readonly string[]).includes(cmd.openingProfile)) {
      return {
        valid: false,
        reason:
          `A ${cmd.elementKind} cannot be ${cmd.openingProfile}: a ${cmd.elementKind} reaches the ` +
          `floor, so its opening is a notch in the wall rather than a closed hole. ` +
          `A ${cmd.elementKind} can be ${legal.join(' / ')}.`,
      };
    }
    return { valid: true };
  },

  execute(
    _ctx: HandlerContext<Record<string, unknown>>,
    cmd: UpdateOpeningProfileBatchPayload,
  ): HandlerResult {
    return withHandlerSpan(
      'element.updateOpeningProfileBatch.handler',
      { 'pryzm.command.type': 'element.updateOpeningProfileBatch' },
      () => {
        const cm = window.commandManager as
          | {
              execute(
                cmd: unknown,
                options?: unknown,
              ): { success: boolean; affectedElementIds: string[]; info?: string[] } | undefined;
            }
          | undefined;
        const empty: HandlerResult = { forward: [], inverse: [] };

        // §FIX-REPORT-PAYLOAD-DISCARD (W2-B) — the two paths on which this bridge
        // would otherwise emit NOTHING. Silence is indistinguishable from a clean
        // run at every layer above, so both broadcast an INDETERMINATE report.
        // This is not a failure claim — it is a refusal to claim anything.
        const sayNothingRan = (why: string): void => {
          const report: OpeningProfileBatchReport = {
            success: false,
            info: [
              `'element.updateOpeningProfileBatch' did not run — ${why}. Nothing was changed, and ` +
              `nothing about the model is confirmed.`,
            ],
            affectedElementIds: [],
            outcome: 'indeterminate',
          };
          try {
            window.dispatchEvent(
              new CustomEvent(OPENING_PROFILE_BATCH_REPORT_EVENT, { detail: report }),
            );
          } catch (emitErr) {
            console.error('[element.updateOpeningProfileBatch.handler] indeterminate report emit failed:', emitErr);
          }
        };

        // §FIX-BATCH-REFUSAL-DISCARDED (L-1141, C16 §5.1 CA-18, C84 §4F.3) —
        // propagated from `plugins/slab/src/handlers/UpdateSlabsSystemTypeBatch.ts`
        // :186-209. Every path used to end in the same `{forward:[],inverse:[]}`,
        // so failure and emptiness were ONE VALUE at the bus boundary. Every
        // throw happens AFTER the CustomEvent, so listeners are unchanged.
        if (!cm) {
          sayNothingRan('the command manager is not available in this session');
          throw new Error(
            'element.updateOpeningProfileBatch: the command manager is not available in this session',
          );
        }

        // Set INSIDE the try, thrown AFTER it: throwing in place would be caught
        // by this block's own `catch` and re-labelled "the bridge threw", which
        // would attribute the command's refusal to a transport failure.
        let refusal: string | null = null;
        try {
          const batch = new UpdateOpeningProfileBatchCommand({
            elementIds: [...cmd.elementIds],
            elementKind: cmd.elementKind,
            openingProfile: cmd.openingProfile as never,
          });
          const result = cm.execute(batch);
          // §BATCH-UNREADABLE-RESULT-IS-NOT-ZERO (C78 §20 · U-INV-4) — an
          // unreadable result is NOT "zero changed" and NOT a refusal.
          const readableIds =
            result && Array.isArray(result.affectedElementIds) ? result.affectedElementIds : undefined;
          const report: OpeningProfileBatchReport = result && readableIds
            ? {
                success: result.success ?? false,
                info: result.info ?? [],
                affectedElementIds: readableIds,
                outcome: result.success ? 'applied' : 'refused',
              }
            : {
                success: false,
                info: [
                  `'element.updateOpeningProfileBatch' RAN but the command manager returned no ` +
                  `readable result. WHICH ${cmd.elementKind}s changed is not known — this is NOT ` +
                  `a report that none did, and it is NOT a refusal.`,
                ],
                affectedElementIds: [],
                outcome: 'indeterminate',
              };
          window.dispatchEvent(new CustomEvent(OPENING_PROFILE_BATCH_REPORT_EVENT, { detail: report }));
          // CA-18. Quote the report's OWN sentence — this bridge never invents
          // refusal copy, and never guesses one when `info` is empty. `outcome`
          // still separates 'refused' from 'indeterminate' on the event.
          if (!report.success) {
            refusal = report.info[0] ?? 'the opening profile change was refused, and no reason was given';
          }
        } catch (e) {
          console.error('[element.updateOpeningProfileBatch.handler] bridge failed:', e);
          sayNothingRan(`the bridge threw: ${String((e as Error)?.message ?? e)}`);
          refusal = `the bridge threw: ${String((e as Error)?.message ?? e)}`;
        }
        if (refusal !== null) {
          // Nothing was mutated on any of these paths, so throwing loses no work
          // — it only stops success and refusal being the same observable at the
          // dispatch site.
          throw new Error(`element.updateOpeningProfileBatch: ${refusal}`);
        }

        return empty;
      },
    ); // withHandlerSpan — C10 §2
  },
};
