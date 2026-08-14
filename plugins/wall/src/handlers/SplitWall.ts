// SplitWallHandler — the `wall.split` verb id.
//
// §FEAT-WALL-SPLIT-ID (GE-10, C70 §3)
//
// WHAT THIS IS NOT: a second cut implementation. The gap the register records is
// an **id**, not a capability — `plugins/wall/src/handlers/CutWall.ts` already
// implements the opening-aware behaviour in full (it refuses a cut whose openings
// straddle the cut point NAMING the offending opening ids, re-checks
// race-defensively at execute, partitions the surviving openings to left/right
// re-basing the right half's offsets, and round-trips on undo). What did not
// exist was a verb a caller could dispatch under the word users actually use for
// it. The register's own closing instruction is therefore "a `wall.split` id over
// the existing opening-aware handler; **do not rebuild the cut path**".
//
// So this file is a REGISTRATION, not an algorithm. It holds one `CutWallHandler`
// instance constructed with the verb `wall.split` — which is the only behavioural
// difference: refusals and OpenTelemetry spans name `wall.split` rather than
// `wall.cut`, so a refusal a user reads under the verb they typed is attributable
// to that verb. Store outcome, undo patches and refusal ARMS are byte-identical
// to `wall.cut` by construction, and `__tests__/wallSplitId.test.ts` pins exactly
// that equality — if the two ever diverge, a rival cut path has been minted and
// the test goes red.
//
// CHAT (C68): `wall.split` is declared in `CHAT_UNAVAILABLE` alongside `wall.cut`
// for the same honest reason — splitting needs a picked point, which a sentence
// does not carry. Declared, not silently undeclared.

import type {
  CommandHandler,
  HandlerContext,
  HandlerResult,
  ValidationResult,
} from '@pryzm/plugin-sdk';
import { CutWallHandler, type CutWallPayload } from './CutWall.js';
import type { WallsState } from '../store.js';

/** Identical to {@link CutWallPayload} — the same operation under a second id. */
export type SplitWallPayload = CutWallPayload;

type WallHandlerStores = Readonly<{ wall: WallsState } & Record<string, unknown>>;

export class SplitWallHandler
  implements CommandHandler<SplitWallPayload, WallHandlerStores>
{
  readonly type = 'wall.split';
  readonly affectedStores = ['wall'] as const;

  /** THE cut path. Not a copy of it — the same class, told its verb. */
  private readonly inner = new CutWallHandler('wall.split');

  canExecute(
    ctx: HandlerContext<WallHandlerStores>,
    cmd: SplitWallPayload,
  ): ValidationResult {
    return this.inner.canExecute(ctx, cmd);
  }

  execute(
    ctx: HandlerContext<WallHandlerStores>,
    cmd: SplitWallPayload,
  ): HandlerResult {
    return this.inner.execute(ctx, cmd);
  }
}
