// §L-1054 / C87 §13.11 CW-Dec-1 — THE ONE ROUTE FOR "CHANGE THIS PANEL'S TYPE".
//
// ─── WHY THIS FILE EXISTS ─────────────────────────────────────────────────────
// Two property-panel surfaces let a user change a curtain-wall panel's type:
// `CurtainSubElementPanel` (click a panel mesh) and `CurtainPanelEditor` (the cell
// grid). Both dispatched the bus verb `curtain-wall.replacePanel`, and that verb
// CANNOT EXECUTE: it resolves its store as `ctx.stores['curtainPanelStore']`, a key
// that cannot exist on the bus context (L-1054 — `storesAsRecordView` is built from
// `ALL_PLUGINS` storeKeys, the panel store has no descriptor, and `CommandBus`
// never falls back to a global by design). `canExecute` refused on EVERY dispatch,
// `CommandBus` THROWS on a refusal, so the promise rejected and the button rendered
// "✗ Failed — check console" with a reason naming an internal variable.
//
// ⚠ THE FOUNDER REPORTS BEING ABLE TO SWAP PANELS. That account and this
// measurement cannot both describe the committed tree; the contradiction is
// recorded in C87 §12 and is theirs to settle. This module is safe under BOTH
// readings, which is why it was written before the answer arrived: routing a dead
// verb to a live command is correct whether the verb was dead or merely unreliable.
//
// ─── WHY THE L2 COMMAND AND NOT A BUS FIX ────────────────────────────────────
// C16 CA-17 says route the write. `ReplacePanelTypeCommand` already receives a REAL
// `context.stores.curtainPanelStore` (`command-registry/src/types.ts:467`), already
// drives the §MI-02 rebuild subscriber (`initUI.ts:2263-2287`, located in L-1055),
// and now snapshots correctly for rollback (L-1050 added the `curtainPanel` scope,
// without which its entire snapshot was `{}`). Making the BUS verb work instead
// would require `CurtainPanelStore` to become a plugin `Store<CurtainPanelData>`
// with its own `storeKey` — the migration `ReplacePanel.ts:62-65` names as its own
// TODO, and a far larger change than the founder's request needs.
//
// ⚠ ON THE `commandManager` RATCHET: `scripts/check/ci-check-no-commandmanager.mjs`
// scans `packages/` and `plugins/` ONLY — its header states `apps/` is excluded
// because it is the composition layer. This file is in `apps/`, so it does not move
// that counter. It is nonetheless the LEGACY path, and the retirement condition is
// named above rather than left implicit.
//
// ONE ROUTE PER USER INTENT (C84 EI-4a, generalised): two surfaces expressing the
// same intent MUST reach the store by the same route. That rule is why this is a
// module both panels call and not two copies of the same six lines — copying is
// exactly what produced the divergence EI-4a was written about.

import { ReplacePanelTypeCommand } from '@pryzm/command-registry';
import type { PanelType, CurtainPanelHostedDoor } from '@pryzm/geometry-curtain-wall';

/** The minimum of the legacy command manager this route needs. */
export interface PanelCommandManagerLike {
  execute(cmd: unknown): { success: boolean; error?: string } | undefined;
}

export interface ReplaceCurtainPanelTypeArgs {
  readonly panelId: string;
  readonly newPanelType: PanelType;
  /** Hex tint, or `null` to clear it. Omit to leave the override untouched. */
  readonly materialOverride?: string | null;
  /** §CW-2 — signed metres off the wall centreline. Omit to leave it untouched;
   *  pass 0 to return the panel to flush. */
  readonly offsetFromCentreline?: number;
  /** §CW-3 / C87 §13.5 — a PARTIAL door config, merged onto what the panel already
   *  has. Omit to leave the door untouched; `null` clears it. */
  readonly hostedDoor?: Partial<CurtainPanelHostedDoor> | null;
  readonly commandManager: PanelCommandManagerLike | null | undefined;
}

export type ReplaceCurtainPanelTypeResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: string };

/**
 * Change one curtain-wall panel's type (and optionally its colour override).
 *
 * Returns a result rather than throwing, and NEVER reports success it did not
 * achieve — the failure this replaces reported `success` nowhere but *looked*
 * finished, and the whole point of routing it is that the button now tells the
 * truth in both directions.
 */
export function replaceCurtainPanelType(
  args: ReplaceCurtainPanelTypeArgs,
): ReplaceCurtainPanelTypeResult {
  if (!args.panelId) return { ok: false, reason: 'no panel is selected' };
  if (!args.commandManager) {
    // Declared, not silent (C84 EI-2). A panel built without a command manager
    // cannot mutate anything, and the user must be told that rather than watching
    // a button do nothing.
    return {
      ok: false,
      reason: 'the property panel has no command manager wired, so the change cannot be applied',
    };
  }

  const cmd = new ReplacePanelTypeCommand({
    panelId: args.panelId,
    newPanelType: args.newPanelType,
    ...(args.materialOverride !== undefined ? { materialOverride: args.materialOverride } : {}),
    // Forwarded only when supplied, so the command's `touchedOffset` snapshot stays
    // honest and an undo cannot revert a field this dispatch never wrote.
    ...(args.offsetFromCentreline !== undefined
        ? { offsetFromCentreline: args.offsetFromCentreline } : {}),
    // §CW-3 — same rule: forwarded only when supplied, so the command's
    // `touchedHostedDoor` snapshot stays honest.
    ...(args.hostedDoor !== undefined ? { hostedDoor: args.hostedDoor } : {}),
  });

  try {
    const r = args.commandManager.execute(cmd);
    // `execute` returning nothing is not success. Treating a missing result as OK
    // is how a no-op reports "✓ Applied" — the exact shape this lane keeps finding.
    if (!r) return { ok: false, reason: 'the command manager returned no result' };
    return r.success ? { ok: true } : { ok: false, reason: r.error ?? 'the command was rejected' };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
}
