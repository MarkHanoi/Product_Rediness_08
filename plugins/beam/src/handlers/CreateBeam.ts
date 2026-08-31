// CreateBeamHandler — mint a new beam (S12-T3).

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { Beam, createId } from '@pryzm/plugin-sdk';
import { BeamGeometryError, BeamSchemaError } from '../errors.js';
import type { BeamData, BeamsState } from '../store.js';
import { isFiniteVec3, isNonZeroBaseLine } from '../intent.js';

export interface CreateBeamPayload {
  readonly id?: string;
  readonly levelId?: string;
  readonly baseLine?: BeamData['baseLine'];
  /** §FIX-BEAM-PAYLOAD (C11 §7.0): the beam plan tool dispatches `startPoint` +
   *  `endPoint` rather than `baseLine`. Accepted here as an alias and folded into
   *  `baseLine` so the PRYZM3 Immer beam carries real geometry — mirrors the slab
   *  handler's `polygon`/`boundary` alias precedent (FT1-C11-SLAB-BOUNDARY). */
  readonly startPoint?: BeamData['baseLine'][0];
  readonly endPoint?: BeamData['baseLine'][1];
  readonly shape?: BeamData['shape'];
  /**
   * §FIX-BEAM-CEB-STEEL (L-974) — the LEGACY section vocabulary, accepted as an
   * alias for `shape`. `CopyPlanToolHandler.ts:452` sends it, and legacy
   * `BeamData.sectionType` is `'rectangular' | 'UB' | 'UC'` while L0 `shape` is
   * `'rectangular' | 'i-section' | 't-section'` — two vocabularies overlapping
   * in ONE member. Folded here, once, so the COMMITTED record speaks only L0's.
   */
  readonly sectionType?: 'rectangular' | 'UB' | 'UC';
  readonly width?: number;
  readonly depth?: number;
  readonly rotation?: number;
  readonly materialId?: string;
  /** §FIX-BEAM-CEB-STEEL (L-974) — legacy spelling of `materialId`
   *  (`CopyPlanToolHandler.ts:449` sends `material`). */
  readonly material?: string;
  readonly systemTypeId?: string;
  readonly loadBearing?: boolean;
  readonly fireRating?: string;
  readonly steelProfileName?: string;
}

/**
 * §FIX-BEAM-CEB-STEEL (L-974) — the legacy `sectionType` → L0 `shape` map.
 *
 * `UB` (Universal Beam) and `UC` (Universal Column used as a beam) are both
 * I-sections; the L0 vocabulary names the GEOMETRY, and which standard series
 * the section belongs to is recoverable from `steelProfileName` — so `UB` folds
 * to `i-section` without loss.
 *
 * `UC` is REFUSED rather than folded, and that is deliberate: folding it would
 * make it indistinguishable from `UB` on the way back out, and the legacy mirror
 * would hand `BeamFragmentBuilder` a `UB` for a section the author called `UC`
 * — a silent mislabel, which is the exact defect class this change closes. No
 * surface produces one today (`BeamTool.ts:239` offers `SteelProfileLibrary.UB`
 * only), so a refusal costs nothing and a fold would cost the truth. If UC beams
 * are ever wanted, the honest fix is a `shape` member or a series field, not a
 * quiet substitution.
 */
const LEGACY_SECTION_TO_SHAPE: Readonly<Record<string, BeamData['shape']>> = {
  rectangular: 'rectangular',
  UB: 'i-section',
};

type BeamHandlerStores = Readonly<{ beam: BeamsState } & Record<string, unknown>>;

export class CreateBeamHandler implements CommandHandler<CreateBeamPayload, BeamHandlerStores> {
  readonly type = 'beam.create';
  readonly affectedStores = ['beam'] as const;

  /** §FIX-BEAM-PAYLOAD: fold the `startPoint`/`endPoint` alias into a baseLine
   *  tuple. `baseLine` (when supplied) always wins. */
  private static resolveBaseLine(cmd: CreateBeamPayload): BeamData['baseLine'] | undefined {
    if (cmd.baseLine !== undefined) return cmd.baseLine;
    if (cmd.startPoint !== undefined && cmd.endPoint !== undefined) {
      return [cmd.startPoint, cmd.endPoint] as BeamData['baseLine'];
    }
    return undefined;
  }

  /** §FIX-BEAM-CEB-STEEL — `shape` (when supplied) always wins over the legacy
   *  `sectionType` alias, mirroring `resolveBaseLine`'s precedence rule. */
  private static resolveShape(cmd: CreateBeamPayload): BeamData['shape'] | undefined {
    if (cmd.shape !== undefined) return cmd.shape;
    if (cmd.sectionType === undefined) return undefined;
    return LEGACY_SECTION_TO_SHAPE[cmd.sectionType];
  }

  canExecute(_ctx: HandlerContext<BeamHandlerStores>, cmd: CreateBeamPayload): ValidationResult {
    if (
      cmd.shape === undefined &&
      cmd.sectionType !== undefined &&
      LEGACY_SECTION_TO_SHAPE[cmd.sectionType] === undefined
    ) {
      return {
        valid: false,
        reason:
          `sectionType "${cmd.sectionType}" has no L0 Beam.shape member — 'UC' is an ` +
          `I-section indistinguishable from 'UB' once folded, so it is refused by name ` +
          `rather than silently downgraded (§FIX-BEAM-CEB-STEEL / L-974).`,
      };
    }
    const baseLine = CreateBeamHandler.resolveBaseLine(cmd);
    // §FIX-BEAM-PHANTOM-TELEMETRY (B2-BEAM, lane W4fg) — A BEAM THAT DESCRIBES NO
    // LINE IS NOT A BEAM. Refused by name, before anything commits.
    //
    // ⛔ THE DEFECT WAS NOT IN THE BRIDGE. `packages/input-host/src/BeamTool.ts:222`
    // — the live 3-D beam tool, constructed in `initTools.ts:3376` and registered
    // via `toolManager.setBeamTool` — draws the real beam through
    // `commandManager.execute(new CreateBeamCommand(...))` and additionally fires
    //
    //     window.runtime.bus.executeCommand('beam.create', {}).catch(() => {});
    //
    // as `[E.5.x]` fire-and-forget migration telemetry. That payload is EMPTY, and
    // every field of this command is optional, so `canExecute` returned valid,
    // `execute` minted an id, and `Beam.parse` applied the L0 schema's DEFAULT
    // baseLine (`Beam.ts:46` → (0,0,0)→(4,0,0)). Every 3-D beam placement therefore
    // COMMITTED A PHANTOM 4-METRE BEAM AT THE WORLD ORIGIN, on level '', into the
    // plugin store that `ProjectSerializer` persists.
    //
    // ⭐ AND THE BRIDGE WAS RIGHT TO IGNORE IT. `CommandEventBridge`'s `beam.create`
    // case refuses a payload with no resolvable endpoints, so the phantom never
    // reached a mesh — which is what "the command commits and the CEB does not
    // follow" actually was. Teaching the bridge to follow the commit would have
    // MATERIALISED the phantom beside the real beam the legacy path already draws:
    // a second producer on one ring, which is the opposite of a fix.
    //
    // ⭐ THIS DISPOSITION IS NOT NEW — IT IS THE STAIR FAMILY'S, REUSED. The same
    // `{}` telemetry shape minted phantom DTO stairs until §FIX-STAIR-CREATE-SHADOW
    // (MT-03) refused it at validate; `StairCreateReachesGeometryStore.test.ts:197`
    // pins that with `rejects.toThrow(/baseLevelId/)`. Stair was immune afterwards
    // only because `baseLevelId` is REQUIRED by its schema; beam's `baseLine` has a
    // DEFAULT, so the same empty dispatch produced a plausible object instead of an
    // error. A schema default is what turned one family's loud refusal into
    // another's silent phantom.
    //
    // The refusal is swallowed by the dispatch site's own `.catch(() => {})`, which
    // is what "fire-and-forget telemetry" is supposed to mean. `beam.batch.create`
    // is deliberately NOT changed here: no site dispatches it as telemetry, and its
    // per-member default is load-bearing for `duplicateToLevel`.
    if (baseLine === undefined) {
      return {
        valid: false,
        reason:
          'beam.create describes no baseline: neither `baseLine` (the L0 Beam schema field, ' +
          'dispatched by plugins/beam and by the copy/duplicate paths) nor the ' +
          '`startPoint`/`endPoint` legacy alias (dispatched by BeamPlanToolHandler) is present. ' +
          'Refused rather than defaulted, because Beam.baseLine has a schema default and ' +
          'accepting the command would commit a 4 m beam at the world origin on level "" — ' +
          'the phantom §FIX-STAIR-CREATE-SHADOW closed for stair (§FIX-BEAM-PHANTOM-TELEMETRY).',
      };
    }
    {
      const [a, b] = baseLine;
      if (!isFiniteVec3(a) || !isFiniteVec3(b)) {
        return { valid: false, reason: 'baseLine endpoints must be finite Vec3' };
      }
      if (!isNonZeroBaseLine(a, b)) {
        return { valid: false, reason: 'baseLine endpoints must differ' };
      }
    }
    if (cmd.width !== undefined && (!Number.isFinite(cmd.width) || cmd.width <= 0)) {
      return { valid: false, reason: 'width must be > 0' };
    }
    if (cmd.depth !== undefined && (!Number.isFinite(cmd.depth) || cmd.depth <= 0)) {
      return { valid: false, reason: 'depth must be > 0' };
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<BeamHandlerStores>, cmd: CreateBeamPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    const id = (cmd.id ?? createId('beam')) as BeamData['id'];
    const seed: Partial<BeamData> = {
      id,
      levelId: cmd.levelId ?? '',
      shape: CreateBeamHandler.resolveShape(cmd) ?? 'rectangular',
      width: cmd.width ?? 0.2,
      depth: cmd.depth ?? 0.4,
      rotation: cmd.rotation ?? 0,
      materialId: cmd.materialId ?? cmd.material ?? cmd.systemTypeId,
      // §FIX-BEAM-CEB-STEEL (L-974) — omitted rather than seeded with
      // `undefined` so the schema's own defaults own the unstated case
      // (`loadBearing` → true, matching `CreateBeamCommand.ts:190`).
      ...(cmd.loadBearing !== undefined ? { loadBearing: cmd.loadBearing } : {}),
      ...(cmd.fireRating !== undefined ? { fireRating: cmd.fireRating } : {}),
      ...(cmd.steelProfileName !== undefined ? { steelProfileName: cmd.steelProfileName } : {}),
    };
    const baseLine = CreateBeamHandler.resolveBaseLine(cmd);
    if (baseLine) seed.baseLine = baseLine;
    if (seed.baseLine && !isNonZeroBaseLine(seed.baseLine[0], seed.baseLine[1])) {
      throw new BeamGeometryError('baseLine endpoints must differ');
    }
    let beam: BeamData;
    try { beam = Beam.parse(seed); }
    catch (err) { throw new BeamSchemaError(err); }

    const [next, forward, inverse] = produceCommand<BeamsState>(ctx.stores.beam, (draft) => {
      draft[beam.id] = beam;
    });
    return { forward, inverse, nextStates: { beam: next } };
    }); // withHandlerSpan — C10 §2
  }
}
