// UpdateElementDimensionsBatchHandler — `element.updateDimensionsBatch`
// (§FEAT-BULK-DIMENSIONS, L-949).
//
// Bus surface for the founder's ask: "I have requested the possibility to ask
// to bulk change any element (doors, windows, walls) dimensions (or multiple
// dims)." The sibling of `element.updateParameters`, and it exists for exactly
// one reason that verb cannot serve: N dispatches of `element.updateParameters`
// are N UNDO ENTRIES, so undoing "make all windows 2 meters height" on a
// forty-window project would mean forty Ctrl-Zs. This bridges to
// `UpdateElementDimensionsBatchCommand`, which composes the same
// `UpdateElementParameterCommand` children into ONE entry (C16 §8.6 B-6: one
// gesture = one undo entry is bought by dispatching ONE command, NEVER by
// holding a batch open).
//
// Payload contract:
//   • `elementIds: string[]` — an EXPLICIT list, always. There is deliberately
//     no `'all'` form: the chat resolves the scope to ids first so the Confirm
//     card can state the real COUNT before the user agrees to a mass resize.
//     A verb that promises to find out how much it changes afterwards is not a
//     verb this repository ships.
//   • `elementKind` — the kind every id is expected to be; it drives the child's
//     store routing and the report copy.
//   • `dimensions` — one or more of height / width / thickness / sillHeight, in
//     METRES. All of them ride ONE child dispatch per element, so a hosted
//     opening's id is re-minted once, after every value has landed
//     (§FIX-CHAT-COMPOUND-DIMENSIONS).
//
// ── AUTHORITATIVE STATE ─────────────────────────────────────────────────────
//
// `window.commandManager → UpdateElementDimensionsBatchCommand →
// UpdateElementParameterCommand → the GEOMETRY store its resolveStore() routes
// to`. This handler deliberately does NOT `produceCommand` against
// `ctx.stores`: that is the fresh plugin DTO store production `bootstrap` hands
// the bus, which nothing renders, persists or exports. `wall.setDimensions` and
// `wall.updateDimensions` are the cautionary tale — both wrote it, both reported
// success, and `wall.updateDimensions` had to be moved OUT of the wall plugin's
// handler set entirely (§FIX-DIMS-REACH-RECORD, L-815).
//
// ── UNDO ────────────────────────────────────────────────────────────────────
//
// `affectedStores` is `[]` and the patch pair is empty BY DESIGN (C16 CA-19):
// the legacy commandManager owns this undo step. Declaring `['wall']` here would
// arm a RingBuffer patch pair keyed to the geometry store for a write this
// handler did not itself make — and would be actively WRONG for a window/door/
// slab batch, whose writes land in other stores. Undo is proven through
// `UpdateElementDimensionsBatchCommand.undo()`, which replays each child's
// authored-field restore in reverse.
//
// ── HONEST REPORTING (§CONTEXT-DATA-HONESTY) ────────────────────────────────
//
// Partial-failure policy lives in the COMMAND: "Changed 38 of 42 windows
// (height 2 m) — 4 skipped · 4× window not found". The bridge re-broadcasts it
// as `pryzm-dimensions-batch-report`, the same shape every other batch uses,
// including the §FIX-REPORT-PAYLOAD-DISCARD `'indeterminate'` outcome: the two
// paths on which a bridge emits NOTHING (no command sink; the bridge threw) are
// otherwise indistinguishable from a clean run at every layer above, and
// ZeroTokenChatBridge read "no report" as `{ ok: true }` and printed "Done" over
// a model nothing had touched (C68 §5.g).
//
// P8 — `withHandlerSpan` wraps the hot path (C10 §2).

import {
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { UpdateElementDimensionsBatchCommand } from '@pryzm/command-registry';

/** The dimension fields the verb accepts, in METRES. */
export interface UpdateElementDimensionsBatchDims {
  readonly height?: number;
  readonly width?: number;
  readonly thickness?: number;
  readonly sillHeight?: number;
}

export interface UpdateElementDimensionsBatchPayload {
  /** The resolved ids to resize. Never 'all' — see the header. */
  readonly elementIds: readonly string[];
  /** The kind every id is expected to be ('window', 'door', …). */
  readonly elementKind: string;
  readonly dimensions: UpdateElementDimensionsBatchDims;
}

/** Detail shape of the `pryzm-dimensions-batch-report` CustomEvent — identical
 *  in shape to `DeleteBatchReport` so the chat layer reads one report type. */
export interface DimensionsBatchReport {
  readonly success: boolean;
  /** Human-readable lines: summary first, then grouped skip reasons. */
  readonly info: readonly string[];
  readonly affectedElementIds: readonly string[];
  /** `'indeterminate'` = THE COMMAND NEVER RAN and nothing about the model is
   *  confirmed. Absent ⇒ derived from `success`. See header. */
  readonly outcome?: 'applied' | 'refused' | 'indeterminate';
}

export const DIMENSIONS_BATCH_REPORT_EVENT = 'pryzm-dimensions-batch-report';

const DIMENSION_KEYS = ['height', 'width', 'thickness', 'sillHeight'] as const;

export const UpdateElementDimensionsBatchHandler: CommandHandler<
  UpdateElementDimensionsBatchPayload,
  Record<string, unknown>
> = {
  type: 'element.updateDimensionsBatch',
  // Bridges to the legacy command manager — mutates NO plugin store. See header.
  affectedStores: [] as const,

  canExecute(
    _ctx: HandlerContext<Record<string, unknown>>,
    cmd: UpdateElementDimensionsBatchPayload,
  ): ValidationResult {
    if (!Array.isArray(cmd?.elementIds)) {
      return { valid: false, reason: 'elementIds must be an array of element ids' };
    }
    if (cmd.elementIds.length === 0) {
      // §NO-EMPTY-MEANS-UNKNOWN — an empty target set is not a successful no-op.
      return { valid: false, reason: 'elementIds must not be empty' };
    }
    if (typeof cmd.elementKind !== 'string' || cmd.elementKind.trim().length === 0) {
      return { valid: false, reason: 'elementKind is required so the write reaches the right store' };
    }
    const dims = cmd.dimensions ?? {};
    const given = DIMENSION_KEYS.filter((k) => dims[k] !== undefined);
    if (given.length === 0) {
      return {
        valid: false,
        reason: 'dimensions must carry at least one of height / width / thickness / sillHeight',
      };
    }
    for (const k of given) {
      const v = dims[k];
      if (typeof v !== 'number' || !Number.isFinite(v)) {
        return { valid: false, reason: `${k} must be a finite number of metres` };
      }
      // Refuse OUT LOUD, with the number the caller sent, rather than clamping
      // silently — a clamped dimension and a requested one must never be the
      // same value. `sillHeight` may legitimately be 0 (a floor-level opening);
      // the others may not.
      if (k !== 'sillHeight' && v <= 0) {
        return { valid: false, reason: `A ${k} of ${v} m is not valid — it must be positive.` };
      }
      if (k === 'sillHeight' && v < 0) {
        return { valid: false, reason: `A sill height of ${v} m is not valid — it cannot be negative.` };
      }
    }
    return { valid: true };
  },

  execute(
    _ctx: HandlerContext<Record<string, unknown>>,
    cmd: UpdateElementDimensionsBatchPayload,
  ): HandlerResult {
    return withHandlerSpan(
      'element.updateDimensionsBatch.handler',
      { 'pryzm.command.type': 'element.updateDimensionsBatch' },
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

        // §FIX-REPORT-PAYLOAD-DISCARD (W2-B) — the two paths on which this
        // bridge would otherwise emit NOTHING. Silence is indistinguishable
        // from a clean run at every layer above, so both broadcast an
        // INDETERMINATE report. This is not a failure claim — it is a refusal
        // to claim anything.
        const sayNothingRan = (why: string): void => {
          const report: DimensionsBatchReport = {
            success: false,
            info: [
              `'element.updateDimensionsBatch' did not run — ${why}. Nothing was changed, and ` +
              `nothing about the model is confirmed.`,
            ],
            affectedElementIds: [],
            outcome: 'indeterminate',
          };
          try {
            window.dispatchEvent(new CustomEvent(DIMENSIONS_BATCH_REPORT_EVENT, { detail: report }));
          } catch (emitErr) {
            console.error('[element.updateDimensionsBatch.handler] indeterminate report emit failed:', emitErr);
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
            'element.updateDimensionsBatch: the command manager is not available in this session',
          );
        }

        // Set INSIDE the try, thrown AFTER it: throwing in place would be caught
        // by this block's own `catch` and re-labelled "the bridge threw", which
        // would attribute the command's refusal to a transport failure.
        let refusal: string | null = null;
        try {
          const batch = new UpdateElementDimensionsBatchCommand({
            elementIds: [...cmd.elementIds],
            elementKind: cmd.elementKind,
            dimensions: { ...cmd.dimensions },
          });
          const result = cm.execute(batch);
          // §BATCH-UNREADABLE-RESULT-IS-NOT-ZERO (C78 §20 · U-INV-4) — an
          // unreadable result is NOT "zero changed" and NOT a refusal. Minting
          // a refusal identity from a result nobody read carries neither the
          // reason nor the numbers a refusal owes, and is worse than silence.
          const readableIds =
            result && Array.isArray(result.affectedElementIds) ? result.affectedElementIds : undefined;
          const report: DimensionsBatchReport = result && readableIds
            ? {
                success: result.success ?? false,
                info: result.info ?? [],
                affectedElementIds: readableIds,
                outcome: result.success ? 'applied' : 'refused',
              }
            : {
                success: false,
                info: [
                  `'element.updateDimensionsBatch' RAN but the command manager returned no ` +
                  `readable result. WHICH ${cmd.elementKind}s changed is not known — this is NOT ` +
                  `a report that none did, and it is NOT a refusal.`,
                ],
                affectedElementIds: [],
                outcome: 'indeterminate',
              };
          window.dispatchEvent(new CustomEvent(DIMENSIONS_BATCH_REPORT_EVENT, { detail: report }));
          // CA-18. Quote the report's OWN sentence — this bridge never invents
          // refusal copy, and never guesses one when `info` is empty. `outcome`
          // still separates 'refused' from 'indeterminate' on the event.
          if (!report.success) {
            refusal = report.info[0] ?? 'the dimension change was refused, and no reason was given';
          }
        } catch (e) {
          console.error('[element.updateDimensionsBatch.handler] bridge failed:', e);
          sayNothingRan(`the bridge threw: ${String((e as Error)?.message ?? e)}`);
          refusal = `the bridge threw: ${String((e as Error)?.message ?? e)}`;
        }
        if (refusal !== null) {
          // Nothing was mutated on any of these paths, so throwing loses no work
          // — it only stops success and refusal being the same observable at the
          // dispatch site.
          throw new Error(`element.updateDimensionsBatch: ${refusal}`);
        }

        return empty;
      },
    ); // withHandlerSpan — C10 §2
  },
};
