// PlaceComponentHandler — `component.place`. §COMPONENT-PLACE (audit §12 Phase 4C).
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⭐⭐ THIS IS THE VERB THE WHOLE PROGRAMME WAS MISSING.
// ═══════════════════════════════════════════════════════════════════════════════
//
// `audit/universal-component-editor/2026-09-01/ARCHITECTURE-AND-CONTRACT-AUDIT.md`
// §3.1 — the headline gap, in the audit's own words: **there is no bus verb
// anywhere in this repository that places a component into a project.** Eight
// archaeology lanes, 8,557 lines, and the finding they converged on is that the
// definition side is real (author, pack, sign, migrate, unpack, resolve, evaluate)
// and the JOIN did not exist. This handler is that join, and ADR-0376 D9 is the
// ruling that makes it an ELEMENT rather than a parallel instance concept.
//
// ─── C16 PATH B, and every clause of it ───────────────────────────────────────
//   · a typed handler registered with `runtime.commandBus`               (§126)
//   · `affectedStores` — the UNDO ROUTING declaration (CA-6 / §U-B6)
//   · `canExecute` — a REASON, never a throw, for everything foreseeable (CA-3)
//   · `produceCommand()` → a REAL forward/inverse patch pair from Immer, so the
//     inverse is generated from the mutation that happened rather than asserted
//   · `withHandlerSpan` — CA-14 / C10 §2, merge-blocking
//
// ─── ⚠ ONE STORE, AND THE DECLARATION IS THE TRUTH ────────────────────────────
// `affectedStores = ['component']`. It is tempting to also declare `level` (the
// occurrence names one) — the balcony's header refuses the identical temptation for
// `wall` and the reasoning is the same twice over: `affectedStores` is the UNDO
// ROUTING declaration, so naming a store this command never writes makes the
// declaration untrue and hides a write the command forgot to make; and every key
// named must resolve at `CommandBus.buildContext` or the dispatch throws before any
// mutation. This command writes exactly one store, so it declares exactly one.
//
// ─── ⛔ THE ID IS PRE-MINTED BY THE CALLER, NEVER GENERATED HERE ───────────────
// CA-2. `execute()` RUNS AGAIN ON REDO. An id minted inside would differ on the
// second run, so redo would place a DIFFERENT component and undo would then fail to
// find it — the exact defect `StableCreatedId.ts` exists to memoise around on the
// legacy path. A pre-minted id cannot drift.
//
// ─── ⛔ WHAT THIS HANDLER DOES NOT DO — C84 §6.2c ─────────────────────────────
// It does not resolve the definition, load the `.pryzm-family` document, validate
// that `definitionId` names a document that exists, evaluate a parameter, produce
// geometry, cut a host, or render anything. It places an OCCURRENCE. The reference
// integrity question — *does this definition exist in this project?* — needs a
// project-level definition registry that does not exist at this commit, and
// inventing a lookup that silently returns "yes" would be strictly worse than the
// honest absence. Declared, not implied.

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { Component } from '@pryzm/plugin-sdk';
import { ComponentDefinitionRefError, ComponentTypeRefError } from '../errors.js';
import type { ComponentData, ComponentsState } from '../store.js';

/** ⚠ Restated from `packages/schemas/src/elements/Component.ts`; see its note. */
const DEFINITION_RE = /^fam_[0-9A-HJKMNP-TV-Z]{26}$/;
const TYPE_RE = /^typ_[0-9A-HJKMNP-TV-Z]{26}$/;
const PARAMETER_RE = /^par_[0-9A-HJKMNP-TV-Z]{26}$/;

/**
 * The payload. `componentId` is PRE-MINTED by the caller — see the header.
 *
 * ⚠ Every dimensional value here is in **metres** (ADR-0376 D3). A payload
 * carrying millimetres is a 1000× defect the schema cannot detect, which is why D3
 * was ruled before a line of Phase 4 was written and why the unit conversion
 * belongs in `@pryzm/family-runtime`'s typed literals, at parse, upstream of here.
 */
export interface PlaceComponentPayload {
  readonly componentId: string;
  readonly levelId: string;
  /** The `.pryzm-family` manifest id this occurrence instantiates (`fam_` + ULID). */
  readonly definitionId: string;
  /** The named type within that definition (`typ_` + ULID). */
  readonly typeId: string;
  /** The definition's semver at placement — PROVENANCE ONLY; it pins nothing. */
  readonly definitionVersion?: string;
  /** Insertion point, WORLD coordinates, metres. */
  readonly origin?: { readonly x: number; readonly y: number; readonly z: number };
  /** Rotation about +Y, radians. */
  readonly rotation?: number;
  /** What the gesture snapped to. ⛔ INERT — nothing resolves it (D11 is OPEN). */
  readonly hostId?: string;
  /** Instance overrides at placement, keyed by `par_` + ULID. */
  readonly instanceParameters?: Readonly<Record<string, number | string | boolean>>;
  readonly materialId?: string;
}

type Stores = Readonly<{ component: ComponentsState } & Record<string, unknown>>;

export class PlaceComponentHandler implements CommandHandler<PlaceComponentPayload, Stores> {
  readonly type = 'component.place';

  /** CA-6 / §U-B6 — one store, because the command writes exactly one. */
  readonly affectedStores = ['component'] as const;

  canExecute(ctx: HandlerContext<Stores>, cmd: PlaceComponentPayload): ValidationResult {
    if (typeof cmd.componentId !== 'string' || cmd.componentId.length === 0) {
      return { valid: false, reason: 'componentId must be a non-empty string' };
    }
    if (ctx.stores.component[cmd.componentId]) {
      return { valid: false, reason: `duplicate component id: ${cmd.componentId}` };
    }
    // ⭐ THE TWO REFUSALS THAT MAKE THIS A JOIN RATHER THAN A PLACEHOLDER. An
    // occurrence with no definition and no type parses fine (the L0 defaults are
    // `''`), stores fine, saves fine and reloads fine — and refers to nothing. See
    // `ComponentDefinitionRefError` for why that is a refusal and not a warning.
    if (!DEFINITION_RE.test(cmd.definitionId ?? '')) {
      return {
        valid: false,
        reason:
          `component.place needs a definitionId of the form fam_<ULID> (C111 §1.1-a); got ` +
          `${JSON.stringify(cmd.definitionId)}. A placed occurrence of no definition is ` +
          `unresolvable — it would carry no parameters, no geometry and no meaning.`,
      };
    }
    if (!TYPE_RE.test(cmd.typeId ?? '')) {
      return {
        valid: false,
        reason:
          `component.place needs a typeId of the form typ_<ULID> (C111 §1.1-a); got ` +
          `${JSON.stringify(cmd.typeId)}. Every definition declares at least one type ` +
          `(FamilyDocumentSchema.types is .min(1)), so an occurrence always wears one.`,
      };
    }
    for (const key of Object.keys(cmd.instanceParameters ?? {})) {
      if (!PARAMETER_RE.test(key)) {
        return {
          valid: false,
          reason:
            `instanceParameters key ${JSON.stringify(key)} is not a par_<ULID>. Overrides are ` +
            `keyed by parameter ID, never by display name — a rename would silently orphan ` +
            `a name-keyed override.`,
        };
      }
    }
    // CA-3 — the schema is asked BEFORE the mutation, so a malformed record fails
    // with a `reason` rather than throwing mid-patch. Same shape as
    // `CreateBalconyHandler`, and it uses the SAME builder `execute()` does so the
    // two cannot disagree about what a valid placement is.
    const parsed = Component.safeParse(this._recordOf(cmd));
    if (!parsed.success) {
      return { valid: false, reason: parsed.error.issues[0]?.message ?? 'invalid component' };
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<Stores>, cmd: PlaceComponentPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
      // ⚠ RE-CHECKED, NOT ASSUMED. `canExecute` and `execute` are separate entry
      // points and a caller reaching the second without the first is a defect this
      // handler must fail loudly on, not paper over — CA-3's throw half.
      if (!DEFINITION_RE.test(cmd.definitionId ?? '')) {
        throw new ComponentDefinitionRefError(
          `component.place: definitionId ${JSON.stringify(cmd.definitionId)} is not a fam_<ULID>.`,
        );
      }
      if (!TYPE_RE.test(cmd.typeId ?? '')) {
        throw new ComponentTypeRefError(
          `component.place: typeId ${JSON.stringify(cmd.typeId)} is not a typ_<ULID>.`,
        );
      }
      const record = Component.parse(this._recordOf(cmd)) as ComponentData;

      // ── THE ONE PATCH PAIR ────────────────────────────────────────────────────
      // ONE dispatch → one `produceCommand` → one Immer patch pair → one ring entry
      // → ONE Ctrl+Z (C16 §8.6 B-6). ⛔ NOT a `runBatch`: `runBatch` is UNDO-NEUTRAL
      // and N dispatches inside one give the user N undo entries.
      const [next, forward, inverse] = produceCommand<ComponentsState>(
        ctx.stores.component,
        (draft) => {
          (draft as Record<string, unknown>)[cmd.componentId] = record;
        },
      );
      return { forward, inverse, nextStates: { component: next } };
    });
  }

  /**
   * The record as the L0 schema sees it — used by BOTH `canExecute` and `execute`
   * so the two cannot disagree about what a valid placement is.
   *
   * ⚠ ABSENT STAYS ABSENT (C79 §2.3). An optional field is spread in only when the
   * caller sent it; writing `hostId: undefined` would put the key in the record and
   * change its packed bytes, and writing a default would invent a fact the user did
   * not state.
   */
  private _recordOf(cmd: PlaceComponentPayload): unknown {
    return {
      id: cmd.componentId,
      type: 'component',
      levelId: cmd.levelId ?? '',
      definitionId: cmd.definitionId,
      typeId: cmd.typeId,
      ...(cmd.definitionVersion !== undefined ? { definitionVersion: cmd.definitionVersion } : {}),
      ...(cmd.origin !== undefined ? { origin: cmd.origin } : {}),
      ...(cmd.rotation !== undefined ? { rotation: cmd.rotation } : {}),
      ...(cmd.hostId !== undefined ? { hostId: cmd.hostId } : {}),
      ...(cmd.materialId !== undefined ? { materialId: cmd.materialId } : {}),
      instanceParameters: { ...(cmd.instanceParameters ?? {}) },
    };
  }
}
