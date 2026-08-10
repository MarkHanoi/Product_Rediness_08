// @pryzm/ai-host — CapabilityExecutionSpec (RAC Phase U4, the §56 scaling fix).
// =============================================================================
//
// WHY THIS EXISTS. Five of applySemanticIntent's case arms were near-identical
// transcriptions of ONE template: resolve the scope ("all" / the selection
// filtered to one element kind / a spatial ScopeDescriptor through the injected
// resolver), resolve the value against its declared value source (refusing by
// LISTING the real options, never guessing — §CONTEXT-DATA-HONESTY), then emit
// exactly one batch bus command with an honest scope label. Every new batch
// capability meant hand-copying ~60 lines of that template, which is the
// scaling wall U4 removes: a capability of this shape is now a TABLE ENTRY
// here plus its ChatCapabilityRegistry metadata — no new case arm.
//
// `applySemanticIntent` remains the ONE semantic authority: its switch routes
// every spec-driven intent to the single generic arm (`applyExecutionSpec`),
// and the SemanticIntent IR stays the boundary. This module is PURE — no DOM,
// no stores, no I/O; value resolvers are either pure tables (colorRef /
// finishRef / geometry-wall's exported rake bounds) or functions the caller
// injects via ResolverContext (the wall/window/door type catalogues).
//
// ── DELIBERATELY NOT SPEC-DRIVEN (the irregular arms stay hand-written) ──────
//
// • create-windows-parametric — creation, not mutation: two-mode payload
//   (count/spacing), stated-default sizing, overlap maths, Confirm-card
//   destructive flag. Its scope stage overlaps the template but the value and
//   payload stages share nothing with the batch-mutation shape.
// • duplicate-level / go-to-level / add-level — level-query resolution against
//   ctx.levels with all-or-nothing target semantics; no element scope at all.
// • set-rhino-material — whole-model reference content; no scope, a nullable
//   colour meaning "reset", and a bridge-side existence check.
// • create-wall — coordinate entry, not scoped mutation.
// • set-height/-thickness/-width/-sill/-riser/-tread/-room-height-offset,
//   set-dimensions, set-roof-pitch, set-room-number, rename-room,
//   delete-selected — the SELECTION-fan-out family (per-kind routing through
//   capabilityTargetRefusal, one command per selected element, compound-form
//   coupling); a different template, and one a later tranche could spec out
//   separately if a third instance of its shape ever appears.
// • undo/redo/zoom — local actions / trivial single commands.

import {
  isScopeError,
  type Compass4,
  type ScopeDescriptor,
} from './ScopeDescriptor.js';
import { normalizeElementKind } from '../capabilities/ChatCapabilityRegistry.js';
import { exampleColorNames, resolveColorRef } from './colorRef.js';
import { exampleFinishNames, resolveFinishRef } from './finishRef.js';
// §FEAT-WALL-RAKE-BATCH — the rake bounds are the geometry package's exported
// constants, never re-typed (C65 §3.5: one policy, one place). Constants only;
// the purity note above still holds — no store instance is constructed here.
import { RAKE_MIN_DEG, RAKE_MAX_DEG } from '@pryzm/geometry-wall';
import type {
  BusCommandRef,
  ResolverContext,
  SemanticApplication,
  SemanticIntent,
} from './ZeroTokenResolver.js';

// ─── The spec-driven intent universe ─────────────────────────────────────────

/** Compass letter → the word the summaries/refusals speak. */
export const COMPASS_WORD: Readonly<Record<Compass4, string>> = {
  N: 'north', S: 'south', E: 'east', W: 'west',
};

/** The intents executed by the generic arm. Adding an id here (plus its table
 *  entry below and its ChatCapabilityRegistry metadata) is the WHOLE resolver
 *  cost of a new batch-shaped capability. */
export type SpecDrivenIntentId =
  | 'set-wall-type'
  | 'set-wall-color'
  | 'set-wall-rake'
  | 'set-window-type'
  | 'set-door-type'
  | 'add-wall-layer';

export type SpecDrivenIntent = Extract<SemanticIntent, { intent: SpecDrivenIntentId }>;

/** The scope forms a spec-driven intent may carry. Which forms a given
 *  capability's GRAMMAR can produce is that intent's business; the generic arm
 *  handles the superset with one implementation. */
export type SpecScope =
  | 'all'
  | 'selection'
  | { readonly kind: 'level'; readonly levelQuery: string }
  | { readonly kind: 'room'; readonly roomRef: string }
  | { readonly kind: 'orientation'; readonly orientation: Compass4 };

// ─── The spec ────────────────────────────────────────────────────────────────

/** The value stage's outcome: an honest refusal (listing real options), or the
 *  resolved payload fields plus the summary builder. */
export type SpecValueOutcome =
  | {
      readonly refusal: {
        readonly reason: string;
        readonly suggestions: readonly string[];
      };
    }
  | {
      /** Value fields merged into the bus payload AFTER the ids field. */
      readonly payload: Readonly<Record<string, unknown>>;
      /** Builds the honest summary from the resolved scope label ("every wall
       *  in the project" / "3 selected walls" / "all 3 walls on Level 2") and
       *  the skip-notes tail (" (2× curtain-wall skipped: …)" or ''). */
      readonly summary: (scopeLabel: string, notesTail: string) => string;
    };

/**
 * One batch-shaped capability, as data. Scope discipline, refusal copy and the
 * payload/summary construction are all pinned byte-for-byte by the acceptance
 * suite — the generic arm interprets this record instead of a hand-written arm
 * re-stating it.
 */
export interface CapabilityExecutionSpec<I extends SpecDrivenIntent = SpecDrivenIntent> {
  /** The element kind this capability scopes over ('wall' | 'window' | 'door').
   *  Also the noun the scope labels and empty-scope refusals speak. */
  readonly elementKind: string;
  /** The batch bus command the capability dispatches — exactly one. */
  readonly busCommand: string;
  /** The payload field carrying `'all'` or the resolved id list. */
  readonly idsField: string;
  /** Refusal copy when the selection scope finds an EMPTY selection. */
  readonly noSelectionReason: string;
  /** Sentence head for a selection of the wrong kind(s) — completed as
   *  `${mismatchPrefix}, and the selection is ${kinds}. Nothing was changed.` */
  readonly mismatchPrefix: string;
  /** Suggestions offered by every scope-stage refusal. */
  readonly suggestions: readonly string[];
  /** Present iff the intent's grammar can produce spatial scopes. The string
   *  completes "… spatial scoping isn't wired into this chat context.
   *  I can ${spatialAbility}." */
  readonly spatialAbility?: string;
  /** Binds the intent's value fields to their value source — a pure table or
   *  an injected catalogue lookup — and builds payload + summary. */
  readonly resolveValue: (si: I, ctx: ResolverContext) => SpecValueOutcome;
  /** All current spec capabilities are reversible one-undo batches; kept
   *  explicit so a future destructive spec is a visible decision. */
  readonly destructive: boolean;
}

// ─── The table ───────────────────────────────────────────────────────────────

type SpecTable = {
  readonly [K in SpecDrivenIntentId]: CapabilityExecutionSpec<
    Extract<SpecDrivenIntent, { intent: K }>
  >;
};

export const EXECUTION_SPECS: SpecTable = {
  /**
   * §FEAT-CHAT-WALL-TYPE — "make all walls interior partition". The type
   * reference resolves through the INJECTED `ctx.resolveWallSystemType` (one
   * implementation: `resolveWallSystemTypeRef` in command-registry). Absent
   * injection forwards the raw string and the COMMAND does the resolution and
   * the refusing — never a silent mismatch.
   */
  'set-wall-type': {
    elementKind: 'wall',
    busCommand: 'wall.updateSystemTypeBatch',
    idsField: 'wallIds',
    noSelectionReason:
      'No walls are selected — select some walls, or say "change all walls to …" to retype the whole project.',
    mismatchPrefix: 'Wall types apply to walls',
    suggestions: ['change all walls to interior partition'],
    resolveValue: (si, ctx) => {
      let systemType = si.typeRef;
      let typeLabel = `"${si.typeRef}"`;
      if (ctx.resolveWallSystemType !== undefined) {
        const hit = ctx.resolveWallSystemType(si.typeRef);
        if (hit === null) {
          const names = ctx.wallSystemTypeNames ?? [];
          return {
            refusal: {
              reason: names.length === 0
                ? `I could not find a wall type called "${si.typeRef}" in this project.`
                : `There is no wall type called "${si.typeRef}" in this project. The wall types here are: ${names.join(', ')}.`,
              suggestions: names.slice(0, 2).map((n) => `change all walls to ${n.toLowerCase()}`),
            },
          };
        }
        systemType = hit.id;
        typeLabel = `"${hit.name}"`;
      }
      return {
        payload: { systemType },
        summary: (scopeLabel) => `Change ${scopeLabel} to ${typeLabel}`,
      };
    },
    // NOT destructive. A retype is one undo entry, it deletes nothing, and
    // the command already reports "Changed N of M — K skipped: <reason>"
    // per §CONTEXT-DATA-HONESTY. Gating it behind a Confirm card would put
    // a modal in front of the founder's exact sentence for no safety gain;
    // the reversible-and-reported path is the honest one.
    destructive: false,
  },

  /**
   * §FEAT-WALL-COLOR-BATCH (ADR-0314) — "make all walls white". ONE colour
   * table (colorRef.ts): a name or '#hex'; anything else refuses by LISTING
   * real options, never by guessing (§CONTEXT-DATA-HONESTY).
   */
  'set-wall-color': {
    elementKind: 'wall',
    busCommand: 'wall.updateColorBatch',
    idsField: 'wallIds',
    noSelectionReason:
      'No walls are selected — select some walls, or say "make all walls white" to recolour the whole project.',
    mismatchPrefix: 'Wall colour applies to walls',
    suggestions: ['make all walls white'],
    spatialAbility: 'change all walls or the selected walls',
    resolveValue: (si) => {
      const color = resolveColorRef(si.colorRef);
      if (color === null) {
        return {
          refusal: {
            reason:
              `I don't know the colour "${si.colorRef}". I understand names like ` +
              `${exampleColorNames().join(', ')} — or an exact hex value like #f4f1e8.`,
            suggestions: ['make all walls white', 'make all walls #f4f1e8'],
          },
        };
      }
      return {
        payload: { materialColor: color.hex },
        summary: (scopeLabel, notesTail) => `Paint ${scopeLabel} ${color.label}${notesTail}`,
      };
    },
    // NOT destructive — one undo entry, deletes nothing, and the command
    // reports "Recoloured N of M — K skipped" (same policy as set-wall-type).
    destructive: false,
  },

  /**
   * §FEAT-WALL-RAKE-BATCH — "make all walls angled by 70 degrees". Range
   * refusal with the geometry package's REAL bounds (never re-typed).
   * Per-wall shape refusals (curved / layered / hosting openings) belong to
   * the command's rakeAuthorability pass and arrive in its honest report.
   */
  'set-wall-rake': {
    elementKind: 'wall',
    busCommand: 'wall.updateRakeBatch',
    idsField: 'wallIds',
    noSelectionReason:
      'No walls are selected — select some walls, or say "make all walls angled by 70 degrees".',
    mismatchPrefix: 'The wall angle applies to walls',
    suggestions: ['make all walls angled by 70 degrees'],
    spatialAbility: 'angle all walls or the selected walls',
    resolveValue: (si) => {
      const deg = si.angleDeg;
      if (!Number.isFinite(deg) || deg < RAKE_MIN_DEG || deg > RAKE_MAX_DEG) {
        return {
          refusal: {
            reason:
              `A wall can lean between ${RAKE_MIN_DEG}° and ${RAKE_MAX_DEG}° ` +
              `(90° = vertical); ${deg}° is outside that range.`,
            suggestions: ['make all walls angled by 70 degrees', 'make all walls vertical'],
          },
        };
      }
      return {
        payload: { rakeAngleDeg: deg },
        summary: (scopeLabel, notesTail) =>
          `Lean ${scopeLabel} to ${deg}°${deg === 90 ? ' (vertical)' : ''}${notesTail}`,
      };
    },
    // NOT destructive — one undo entry, deletes nothing, and the command
    // reports "Raked N of M — K skipped" (same policy as the colour batch).
    destructive: false,
  },

  /**
   * §FEAT-WINDOW-TYPE-BATCH — the exact set-wall-type shape, window kind.
   * Resolves through the INJECTED lookup (one implementation —
   * `resolveWindowSystemTypeRef`). Absent injection forwards the raw string
   * and the command refuses with the same honesty; never a guess.
   */
  'set-window-type': {
    elementKind: 'window',
    busCommand: 'window.updateSystemTypeBatch',
    idsField: 'windowIds',
    noSelectionReason:
      'No windows are selected — select a window, or say "change all windows to …" to retype every window.',
    mismatchPrefix: 'Window types apply to windows',
    suggestions: ['change all windows to timber casement'],
    resolveValue: (si, ctx) => {
      let systemType = si.typeRef;
      let typeLabel = `"${si.typeRef}"`;
      if (ctx.resolveWindowSystemType !== undefined) {
        const hit = ctx.resolveWindowSystemType(si.typeRef);
        if (hit === null) {
          const names = ctx.windowSystemTypeNames ?? [];
          return {
            refusal: {
              reason: names.length === 0
                ? `I could not find a window type called "${si.typeRef}" in this project.`
                : `There is no window type called "${si.typeRef}" in this project. The window types here are: ${names.join(', ')}.`,
              suggestions: names.slice(0, 2).map((n) => `change all windows to ${n.toLowerCase()}`),
            },
          };
        }
        systemType = hit.id;
        typeLabel = `"${hit.name}"`;
      }
      return {
        payload: { systemType },
        summary: (scopeLabel) => `Change ${scopeLabel} to ${typeLabel}`,
      };
    },
    // NOT destructive — one undo entry, and the command reports
    // "Retyped N of M — K skipped" (same policy as the wall type batch).
    destructive: false,
  },

  /**
   * §FEAT-DOOR-TYPE-BATCH (RAC U4.3) — THE EXTENSION PROOF: this entry plus
   * its ChatCapabilityRegistry metadata is the ENTIRE resolver cost of the
   * capability — no case arm exists for it anywhere. The exact
   * set-window-type shape, door kind; resolves through the INJECTED
   * `ctx.resolveDoorSystemType` (one implementation —
   * `resolveDoorSystemTypeRef`, command-registry). Absent injection forwards
   * the raw string and the command refuses with the same honesty.
   */
  'set-door-type': {
    elementKind: 'door',
    busCommand: 'door.updateSystemTypeBatch',
    idsField: 'doorIds',
    noSelectionReason:
      'No doors are selected — select a door, or say "change all doors to …" to retype every door.',
    mismatchPrefix: 'Door types apply to doors',
    suggestions: ['change all doors to white primed softwood'],
    resolveValue: (si, ctx) => {
      let systemType = si.typeRef;
      let typeLabel = `"${si.typeRef}"`;
      if (ctx.resolveDoorSystemType !== undefined) {
        const hit = ctx.resolveDoorSystemType(si.typeRef);
        if (hit === null) {
          const names = ctx.doorSystemTypeNames ?? [];
          return {
            refusal: {
              reason: names.length === 0
                ? `I could not find a door type called "${si.typeRef}" in this project.`
                : `There is no door type called "${si.typeRef}" in this project. The door types here are: ${names.join(', ')}.`,
              suggestions: names.slice(0, 2).map((n) => `change all doors to ${n.toLowerCase()}`),
            },
          };
        }
        systemType = hit.id;
        typeLabel = `"${hit.name}"`;
      }
      return {
        payload: { systemType },
        summary: (scopeLabel) => `Change ${scopeLabel} to ${typeLabel}`,
      };
    },
    // NOT destructive — one undo entry, and the command reports
    // "Retyped N of M — K skipped" (same policy as the window type batch).
    destructive: false,
  },

  /**
   * §FEAT-WALL-LAYER-ADD-BATCH — "add a 10mm plaster layer to the inner side
   * of the selected wall". Honest completeness refusals: the intent is CLAIMED
   * even when thickness or finish is missing, so the answer is a concrete ask,
   * never an LLM guess. ONE finish table (finishRef.ts) — unknown names refuse
   * by LISTING real options, never by guessing (§CONTEXT-DATA-HONESTY).
   */
  'add-wall-layer': {
    elementKind: 'wall',
    busCommand: 'wall.addLayerBatch',
    idsField: 'wallIds',
    noSelectionReason:
      'No walls are selected — select a wall, or say "add a 10mm plaster layer to all walls".',
    mismatchPrefix: 'Finish layers apply to walls',
    suggestions: ['add a 10mm plaster layer to the inner side of the selected wall'],
    resolveValue: (si) => {
      if (si.thicknessM === null) {
        return {
          refusal: {
            reason: 'Tell me how thick the layer should be — e.g. "add a 10mm plaster layer to the inner side of the selected wall".',
            suggestions: ['add a 10mm plaster layer to the inner side of the selected wall'],
          },
        };
      }
      if (si.finishRef === null) {
        return {
          refusal: {
            reason: `Tell me which finish — I know ${exampleFinishNames().join(', ')}.`,
            suggestions: ['add a 10mm plaster layer to the inner side of the selected wall'],
          },
        };
      }
      const finish = resolveFinishRef(si.finishRef);
      if (finish === null) {
        return {
          refusal: {
            reason:
              `I don't know the finish "${si.finishRef}". I understand ` +
              `${exampleFinishNames().join(', ')}.`,
            suggestions: ['add a 10mm plaster layer to the inner side of the selected wall'],
          },
        };
      }
      const thicknessM = si.thicknessM;
      const mm = Number((thicknessM * 1000).toFixed(3));
      return {
        payload: {
          side: si.side,
          thickness: thicknessM,
          name: finish.name,
          materialColor: finish.materialColor,
          materialId: finish.materialId,
        },
        summary: (scopeLabel) => `Add a ${mm}mm ${finish.name} layer to the ${si.side} side of ${scopeLabel}`,
      };
    },
    // NOT destructive — one undo entry; the command reports "Added … to
    // N of M walls — K skipped" (raked walls skip with the gate's reason).
    destructive: false,
  },

};

// ─── The generic arm ─────────────────────────────────────────────────────────

type Refusal = Extract<SemanticApplication, { kind: 'refusal' }>;

/**
 * The ONE generic executor for spec-driven batch capabilities, called from
 * `applySemanticIntent`'s switch (which remains the single semantic
 * authority). Stage order is the template's: scope first ("the selected walls"
 * must never silently become "all walls"), then value, then one bus command
 * with the honest scope label.
 */
export function applyExecutionSpec(
  si: SpecDrivenIntent,
  ctx: ResolverContext,
): SemanticApplication {
  const spec = EXECUTION_SPECS[si.intent] as CapabilityExecutionSpec<SpecDrivenIntent>;
  const kind = spec.elementKind;
  const refuse = (reason: string, suggestions: readonly string[] = spec.suggestions): Refusal => ({
    kind: 'refusal',
    intent: si.intent,
    reason,
    suggestions,
  });

  // ── Scope stage ────────────────────────────────────────────────────────────
  // Widened to the full SpecScope union: which forms a given intent's grammar
  // can produce is that intent's business; the arm handles the superset once.
  const scope = si.scope as SpecScope;
  let ids: readonly string[] | 'all';
  let scopeLabelOverride: string | null = null;
  const scopeNotes: string[] = [];
  if (typeof scope === 'object') {
    // ADR-0315 U3 — spatially scoped sentences ("on level 2" / "in the
    // kitchen" / "facing south"). Resolution happens ONCE through the
    // injected resolver; its absence refuses honestly, never guesses.
    const phrase = scope.kind === 'level'
      ? `on level ${scope.levelQuery}`
      : scope.kind === 'room'
        ? `in the ${scope.roomRef}`
        : `facing ${COMPASS_WORD[scope.orientation]}`;
    if (ctx.resolveScope === undefined) {
      return refuse(
        `I can't resolve "${phrase}" here — spatial scoping isn't wired ` +
        `into this chat context. I can ${spec.spatialAbility ?? `change all ${kind}s or the selected ${kind}s`}.`,
      );
    }
    const descriptor: ScopeDescriptor = scope.kind === 'level'
      ? { kind: 'level', levelQuery: scope.levelQuery, elementKind: kind }
      : scope.kind === 'room'
        ? { kind: 'room', roomRef: scope.roomRef, elementKind: kind }
        : { kind: 'orientation', orientation: scope.orientation };
    const result = ctx.resolveScope(descriptor);
    if (isScopeError(result)) {
      return refuse(result.error);
    }
    if (result.ids.length === 0) {
      return refuse(`There are no ${kind}s ${phrase} — nothing was changed.`);
    }
    ids = result.ids;
    const where = result.diagnostics[0] ?? phrase.replace(/^on |^in the /, '');
    scopeLabelOverride = scope.kind === 'orientation'
      ? `all ${result.ids.length} ${where} ${kind}${result.ids.length === 1 ? '' : 's'}`
      : `all ${result.ids.length} ${kind}${result.ids.length === 1 ? '' : 's'} ${scope.kind === 'level' ? 'on' : 'bounding'} ${where}`;
    for (const s of result.skipped) {
      scopeNotes.push(`${s.count}× ${s.kind} skipped: ${s.reason}`);
    }
  } else if (scope === 'selection') {
    const matches = ctx.selection.filter((s) => normalizeElementKind(s.elementType) === kind);
    if (matches.length === 0) {
      const kinds = [...new Set(ctx.selection.map((s) => normalizeElementKind(s.elementType)))];
      return refuse(
        kinds.length === 0
          ? spec.noSelectionReason
          : `${spec.mismatchPrefix}, and the selection is ${kinds.join(' + ')}. Nothing was changed.`,
      );
    }
    ids = matches.map((s) => s.elementId);
  } else {
    ids = 'all';
  }

  // ── Value stage ────────────────────────────────────────────────────────────
  const value = spec.resolveValue(si, ctx);
  if ('refusal' in value) {
    return refuse(value.refusal.reason, value.refusal.suggestions);
  }

  // ── Command + honest summary ───────────────────────────────────────────────
  const scopeLabel = scopeLabelOverride !== null
    ? scopeLabelOverride
    : ids === 'all'
      ? `every ${kind} in the project`
      : `${ids.length} selected ${kind}${ids.length === 1 ? '' : 's'}`;
  const notesTail = scopeNotes.length > 0 ? ` (${scopeNotes.join(' · ')})` : '';
  const command: BusCommandRef = {
    type: spec.busCommand,
    payload: {
      [spec.idsField]: ids === 'all' ? 'all' : [...ids],
      ...value.payload,
    },
  };
  return {
    kind: 'commands',
    intent: si.intent,
    summary: value.summary(scopeLabel, notesTail),
    commands: [command],
    destructive: spec.destructive,
  };
}
