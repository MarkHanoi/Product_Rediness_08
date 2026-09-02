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
// It does not load the `.pryzm-family` document, evaluate a parameter, produce
// geometry, cut a host, or render anything. It places an OCCURRENCE.
//
// ─── ⭐ THE REFERENCE-INTEGRITY QUESTION IS NOW ASKED — lane U0 ────────────────
// This header used to close with: *"needs a project-level definition registry that
// does not exist at this commit."* The registry now exists — the ONE catalogue in
// `apps/editor/src/services/componentCatalog/`, injected here through the
// `ComponentDefinitionResolver` port (`../definitionResolver.ts`). With the port
// wired: a `definitionId` that names no LOADED definition is REFUSED BY NAME, a
// `typeId` the definition does not declare is refused naming BOTH ids, and an
// `instanceParameters` override must name a DECLARED parameter of kind
// `instance` whose `dataType` the value's shape can wear (C110 §3.5-a). Without
// the port (no catalogue in the host — e.g. the plugin's own unit suite) the
// Phase-4C behaviour is unchanged and the gap stays DECLARED, never faked —
// there is deliberately NO default resolver (see the port's header).

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { Component } from '@pryzm/plugin-sdk';
import {
  ComponentDefinitionRefError,
  ComponentParameterWriteError,
  ComponentTypeRefError,
} from '../errors.js';
import { valueShapeRefusal, type ComponentDefinitionResolver } from '../definitionResolver.js';
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

  /** ⭐ Lane U0 — the definition catalogue, injected by the composition seam
   *  (`PluginRegistry.ts`). Optional BY CONTRACT; absent means the Phase-4C
   *  format-only behaviour, never a fabricated "yes" — see `definitionResolver.ts`. */
  constructor(private readonly definitions?: ComponentDefinitionResolver) {}

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
    // ⭐ Lane U0 — the resolver checks, AFTER the format checks (so a malformed id
    // still gets the format refusal) and BEFORE the schema parse.
    const resolverRefusal = this._resolverRefusal(cmd);
    if (resolverRefusal !== null) {
      return { valid: false, reason: resolverRefusal.reason };
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
      // ⭐ Lane U0 — re-checked, not assumed (CA-3's throw half), through the SAME
      // method `canExecute` used so the two cannot disagree. ⚠ This runs again on
      // REDO: a definition unloaded between undo and redo makes the redo REFUSE
      // loudly rather than re-mint an occurrence of nothing.
      const resolverRefusal = this._resolverRefusal(cmd);
      if (resolverRefusal !== null) {
        switch (resolverRefusal.kind) {
          case 'definition': throw new ComponentDefinitionRefError(resolverRefusal.reason);
          case 'type': throw new ComponentTypeRefError(resolverRefusal.reason);
          case 'parameter': throw new ComponentParameterWriteError(resolverRefusal.reason);
        }
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
   * ⭐ Lane U0 — the four resolver checks, shared by `canExecute` (reason) and
   * `execute` (typed throw). Returns `null` when the placement resolves, when no
   * resolver is wired (the declared Phase-4C gap, unchanged), or — for the
   * override checks — everything the loaded definition can answer for.
   *
   * The order is deliberate: existence → membership → overrides, so the refusal
   * names the FIRST unresolvable rung of the reference and never a consequence
   * of it.
   */
  private _resolverRefusal(
    cmd: PlaceComponentPayload,
  ): { kind: 'definition' | 'type' | 'parameter'; reason: string } | null {
    if (this.definitions === undefined) return null;
    const view = this.definitions.view(cmd.definitionId);
    if (view === undefined) {
      const n = this.definitions.list().length;
      return {
        kind: 'definition',
        reason:
          `component.place: definitionId ${cmd.definitionId} names no definition loaded in ` +
          `this project's component catalogue (${n === 0 ? 'the catalogue is EMPTY' : `${n} definition(s) loaded`}). ` +
          `Load the definition (file-open or marketplace download) before placing — a placed ` +
          `occurrence of an unloaded definition would resolve to nothing.`,
      };
    }
    if (!view.types.some((t) => t.id === cmd.typeId)) {
      return {
        kind: 'type',
        reason:
          `component.place: typeId ${cmd.typeId} is not a type of definition ` +
          `${cmd.definitionId} (${view.name}); its types are [${view.types.map((t) => t.id).join(', ')}].`,
      };
    }
    for (const [key, value] of Object.entries(cmd.instanceParameters ?? {})) {
      const param = view.parameters.find((p) => p.id === key);
      if (param === undefined) {
        return {
          kind: 'parameter',
          reason:
            `component.place: instanceParameters key ${key} is not a parameter of definition ` +
            `${cmd.definitionId} (${view.name}); it declares [${view.parameters.map((p) => p.id).join(', ')}].`,
        };
      }
      if (param.kind !== 'instance') {
        return {
          kind: 'parameter',
          reason:
            `component.place: parameter ${key} (${param.name}) of definition ${cmd.definitionId} ` +
            `has kind '${param.kind}' — a TYPE parameter is not overridable per occurrence ` +
            `(C111); edit the type, or swap to one that carries the value you want.`,
        };
      }
      const shape = valueShapeRefusal(param.dataType, value);
      if (shape !== null) {
        return {
          kind: 'parameter',
          reason:
            `component.place: override for parameter ${key} (${param.name}) of definition ` +
            `${cmd.definitionId}: ${shape} (C110 §3.5-a).`,
        };
      }
    }
    return null;
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
