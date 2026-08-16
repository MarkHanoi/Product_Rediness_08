// UpdateWallsHeightBatchHandler — `wall.updateHeightBatch` (VERBS-CMD, 2026-08-11).
//
// ─── WHY THIS VERB EXISTS ────────────────────────────────────────────────────
//
// The founder's own worked example — "Raise all exterior walls to 3.2 m" —
// could not be executed. Not because the answer was hard, but because the only
// height route on the bus was SELECTION-SCOPED: `wall.setDimensions` /
// `wall.updateDimensions` take a single `wallId`. "All walls" had no expression
// at the command layer, so the sentence had no route, and a chat can only
// decline a sentence it cannot dispatch.
//
// ─── WHY THERE IS NO NEW LEGACY COMMAND HERE (REUSE, NOT RIVAL) ──────────────
//
// The sibling batches (`UpdateWallsColorBatchCommand`, `…RakeBatchCommand`)
// each needed a NEW command in `@pryzm/command-registry`, because each had to
// fan out over N single-element commands and add a per-element refusal policy.
//
// HEIGHT DOES NOT. `UpdateWallHeightCommand` (command-registry/walls) ALREADY
// takes `wallIds: string[]` — it is already a multi-wall command, it already
// writes the AUTHORITATIVE geometry `wallStore` via `updateWall()`, it already
// captures a FULL per-wall snapshot and restores it in `undo()` (its §2.2/§2.3
// fix), and it already lands as ONE entry on the legacy history stack. Writing
// an `UpdateWallsHeightBatchCommand` beside it would be a rival implementation
// of a primitive that exists — precisely the fourth-pattern invention C16 and
// this task's brief forbid.
//
// So the ONLY thing genuinely missing was the SCOPE RESOLUTION and the bus
// door: turning `'all'` into an explicit id list, and exposing it as a verb.
// That is all this file does.
//
// ─── AUTHORITATIVE STATE (brief rule 1) ──────────────────────────────────────
//
// `window.commandManager → UpdateWallHeightCommand → wallStore.updateWall()`.
// That is the legacy GEOMETRY singleton the renderers, the 2-D projector, the
// IFC exporter and persistence all read (§FIX-DEAD-VERB-*, W3-3 / commit
// 5e74b178). This handler deliberately does NOT `produceCommand` against
// `ctx.stores.wall`: that is the FRESH plugin DTO store production `bootstrap`
// hands the bus, which nothing renders, persists or exports. `wall.setDimensions`
// and `wall.updateDimensions` are the cautionary tale — both wrote it, both
// reported success, and `wall.updateDimensions` had to be moved OUT of this
// plugin's handler set entirely (§FIX-DIMS-REACH-RECORD, L-815).
//
// ─── UNDO (brief rule 2) ─────────────────────────────────────────────────────
//
// `affectedStores` is `[]` and the patch pair is empty BY DESIGN: the legacy
// commandManager owns this undo step. Declaring `['wall']` here would arm a
// RingBuffer patch pair keyed to the geometry store for a write this handler
// did not itself make — the exact hazard named in the W3-3 residual note
// (`performUndoRedo.ts:269` maps `'wall'` → the geometry store). Undo is proven
// through `UpdateWallHeightCommand.undo()`'s full-snapshot restore, not here.
//
// ─── HONEST REPORTING (§CONTEXT-DATA-HONESTY) ────────────────────────────────
//
// Mirrors `UpdateWallsSystemTypeBatchHandler` exactly, including the
// §FIX-REPORT-PAYLOAD-DISCARD `'indeterminate'` outcome: the two paths on which
// a bridge emits NOTHING (no command sink; the bridge threw) used to be
// indistinguishable from a clean run at every layer above, and
// ZeroTokenChatBridge read "no report" as `{ ok: true }` and printed "Done"
// over a model nothing had touched (C68 §5.g).
//
// P8 — `withHandlerSpan` wraps the hot path (C10 §2).

import {
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { UpdateWallHeightCommand, WALL_HEIGHT_CONSTRAINTS } from '@pryzm/command-registry';

export interface UpdateWallsHeightBatchPayload {
  /** `'all'` = every wall in the project, ALL levels — the DEFAULT scope for
   *  "raise all walls"; or an explicit id list (a selection, a level, or the
   *  "exterior walls" subset, all resolved by the CALLER's scope resolver: this
   *  command owns no adjective table). */
  readonly wallIds: readonly string[] | 'all';
  /** Target height in METRES. Range [0.3, 20] per WALL_HEIGHT_CONSTRAINTS. */
  readonly height: number;
}

/** Detail shape of the `pryzm-wall-height-batch-report` CustomEvent — identical
 *  in shape to `WallTypeBatchReport` so the chat layer reads one report type. */
export interface WallHeightBatchReport {
  readonly success: boolean;
  readonly info: readonly string[];
  readonly affectedElementIds: readonly string[];
  /** `'indeterminate'` = THE COMMAND NEVER RAN; nothing about the model is
   *  confirmed. Absent ⇒ derive from `success`. See header. */
  readonly outcome?: 'applied' | 'refused' | 'indeterminate';
}

export const WALL_HEIGHT_BATCH_REPORT_EVENT = 'pryzm-wall-height-batch-report';

interface WallRecordLike { readonly id: string }

interface LegacyWindow {
  __pryzmInitComplete?: boolean;
  commandManager?: {
    execute(cmd: unknown, options?: unknown): {
      success: boolean;
      affectedElementIds?: string[];
      info?: string[];
      error?: string;
    } | void;
  };
  wallStore?: {
    getAll(): readonly WallRecordLike[];
    getById?(id: string): WallRecordLike | undefined;
  };
}

export const UpdateWallsHeightBatchHandler: CommandHandler<
  UpdateWallsHeightBatchPayload,
  Record<string, unknown>
> = {
  type: 'wall.updateHeightBatch',
  // Bridges to the legacy command manager — mutates NO plugin store. See header.
  affectedStores: [] as const,

  canExecute(
    _ctx: HandlerContext<Record<string, unknown>>,
    cmd: UpdateWallsHeightBatchPayload,
  ): ValidationResult {
    if (cmd?.wallIds !== 'all' && !Array.isArray(cmd?.wallIds)) {
      return { valid: false, reason: "wallIds must be 'all' or an array of wall ids" };
    }
    if (typeof cmd.height !== 'number' || !Number.isFinite(cmd.height)) {
      return { valid: false, reason: 'height must be a finite number of metres' };
    }
    // Refuse OUT LOUD, with BOTH numbers, rather than clamping silently — a
    // clamped height and a requested height must never be the same value.
    if (cmd.height < WALL_HEIGHT_CONSTRAINTS.MIN_HEIGHT) {
      return {
        valid: false,
        reason:
          `A wall cannot be shorter than ${WALL_HEIGHT_CONSTRAINTS.MIN_HEIGHT} m; `
          + `${cmd.height} m was requested.`,
      };
    }
    if (cmd.height > WALL_HEIGHT_CONSTRAINTS.MAX_HEIGHT) {
      return {
        valid: false,
        reason:
          `A wall cannot be taller than ${WALL_HEIGHT_CONSTRAINTS.MAX_HEIGHT} m; `
          + `${cmd.height} m was requested.`,
      };
    }
    return { valid: true };
  },

  execute(
    _ctx: HandlerContext<Record<string, unknown>>,
    cmd: UpdateWallsHeightBatchPayload,
  ): HandlerResult {
    return withHandlerSpan(
      'wall.updateHeightBatch.handler',
      { 'pryzm.command.type': 'wall.updateHeightBatch' },
      () => {
        // The legacy singletons hang off `window`, not off the bare global. In a
        // browser `globalThis === window` so this resolves either way; under
        // Node/vitest it is the property the suite installs.
        const w = ((globalThis as unknown as { window?: LegacyWindow }).window ?? {}) as LegacyWindow;
        const empty: HandlerResult = { forward: [], inverse: [] };

        const sayNothingRan = (why: string): void => {
          const report: WallHeightBatchReport = {
            success: false,
            info: [
              `'wall.updateHeightBatch' did not run — ${why}. Nothing was changed, and `
              + `nothing about the model is confirmed.`,
            ],
            affectedElementIds: [],
            outcome: 'indeterminate',
          };
          try {
            window.dispatchEvent(new CustomEvent(WALL_HEIGHT_BATCH_REPORT_EVENT, { detail: report }));
          } catch (emitErr) {
            console.error('[wall.updateHeightBatch.handler] indeterminate report emit failed:', emitErr);
          }
        };

        const cm = w.commandManager;
        if (!cm) {
          sayNothingRan('the command manager is not available in this session');
          return empty;
        }

        // ── SCOPE RESOLUTION — the one thing that was actually missing ────────
        // Resolved HERE, against the authoritative geometry store, so the
        // downstream command receives an explicit id list. `UpdateWallHeightCommand`
        // hard-refuses the WHOLE batch on any unknown id (`WALL_NOT_FOUND`), so
        // ids are filtered to those the store actually holds and the dropped
        // ones are reported rather than silently swallowed.
        let resolved: string[];
        const missing: string[] = [];
        const store = w.wallStore;
        if (cmd.wallIds === 'all') {
          if (!store) {
            sayNothingRan('the wall store is not available, so "all walls" could not be resolved');
            return empty;
          }
          resolved = store.getAll().map((x) => x.id);
        } else {
          // De-dup so one wall is never counted twice.
          const requested = [...new Set(cmd.wallIds)];
          if (store?.getById) {
            resolved = [];
            for (const id of requested) {
              if (store.getById(id)) resolved.push(id);
              else missing.push(id);
            }
          } else {
            resolved = requested;
          }
        }

        if (resolved.length === 0) {
          // An empty scope is a VISIBLE decline, never a silent success.
          const report: WallHeightBatchReport = {
            success: false,
            info: [
              cmd.wallIds === 'all'
                ? 'There are no walls in this project to raise.'
                : `None of the ${missing.length} requested wall${missing.length === 1 ? '' : 's'} exist any more.`,
            ],
            affectedElementIds: [],
            outcome: 'refused',
          };
          try {
            window.dispatchEvent(new CustomEvent(WALL_HEIGHT_BATCH_REPORT_EVENT, { detail: report }));
          } catch { /* report emission is best-effort; the refusal is the value */ }
          return empty;
        }

        try {
          // ONE command over N walls ⇒ ONE undo entry, full per-wall snapshots.
          const result = cm.execute(
            new UpdateWallHeightCommand({ wallIds: resolved, newHeight: cmd.height }),
          );
          const changed = result?.affectedElementIds?.length ?? 0;
          const total = resolved.length + missing.length;
          const info: string[] = [
            `Raised ${changed} of ${total} wall${total === 1 ? '' : 's'} to ${cmd.height} m`
            + (missing.length > 0 ? ` — ${missing.length} skipped` : ''),
          ];
          if (missing.length > 0) {
            info.push(`${missing.length}× wall not found`);
          }
          if (result?.error) info.push(result.error);

          // §BATCH-UNREADABLE-RESULT-IS-NOT-ZERO (C78 §20 · U-INV-4).
          // The SHARPEST instance in this family, because this block did not
          // merely under-report — it MINTED A REFUSAL IDENTITY. With an
          // unreadable `result`, `?? []` claimed zero walls changed AND
          // `result?.success ? 'applied' : 'refused'` stamped the report
          // `outcome: 'refused'`, asserting that the system considered the
          // request and declined it. Nothing of the sort was determined. C73's
          // rule is that a refusal carries identity and BOTH numbers; a refusal
          // fabricated from an unread result carries neither and is worse than
          // silence. `'indeterminate'` — already in this file's vocabulary — is
          // the honest outcome.
          const readable = !!result && Array.isArray(result.affectedElementIds);
          const report: WallHeightBatchReport = readable
            ? {
                success: result.success ?? false,
                info: result.success ? info : (result.info ?? info),
                affectedElementIds: result.affectedElementIds,
                outcome: result.success ? 'applied' : 'refused',
              }
            : {
                success: false,
                info: [
                  `'wall.updateHeightBatch' RAN but the command manager returned no readable ` +
                  `result. WHICH walls changed is not known — this is NOT a report that none ` +
                  `did, and it is NOT a refusal.`,
                ],
                affectedElementIds: [],
                outcome: 'indeterminate',
              };
          window.dispatchEvent(new CustomEvent(WALL_HEIGHT_BATCH_REPORT_EVENT, { detail: report }));
        } catch (e) {
          console.error('[wall.updateHeightBatch.handler] bridge failed:', e);
          sayNothingRan(`the bridge threw: ${String((e as Error)?.message ?? e)}`);
        }

        return empty;
      },
    ); // withHandlerSpan — C10 §2
  },
};
