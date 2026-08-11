// @pryzm/ai-host — PropertyVocabulary (RAC Phase U7.1)
// =============================================================================
//
// WHY THIS EXISTS. `element.updateParameters` can already route ~60 panel fields
// across eleven element kinds (`UpdateElementParameterCommand.resolveStore()`),
// and the chat spoke NINE properties: height, thickness, width, sill height,
// riser height, tread depth, room height offset, roof pitch, room number. Every
// one of those is a hand-written case arm in `applySemanticIntent` PLUS a
// hand-written regex in the matcher list — roughly 60 lines of resolver code per
// property. That is the U7 scaling wall, and it is the same wall U4 removed for
// batch-shaped capabilities: the answer is the same answer.
//
// A PROPERTY is now a TABLE ENTRY here — its noun and synonyms (the grammar),
// the element kinds that genuinely accept it, the live bus route per kind, and
// its bounds — plus its ChatCapabilityRegistry metadata. No new case arm, no new
// matcher. `applySemanticIntent` stays THE semantic authority: its switch routes
// every property-driven intent to the ONE generic arm below.
//
// ── HONESTY BAR: A KIND MAY ONLY BE CLAIMED IF THE ROUTE REALLY WRITES IT ────
//
// `packages/input-host/src/operations/ElementCapabilities.ts` advertises Mirror /
// Offset / Scale on seven families whose commands are wall-only. The registry
// exists so that never happens again, and a property table is exactly the shape
// that invites it: `resolveStore()` routing a kind to a store is NOT proof the
// property exists on that kind's record. Two things must both hold, and the
// registry's `commandProof` names the file for each:
//
//   1. the FIELD exists on the record and the builder reads it, and
//   2. the write triggers a REBUILD for that kind.
//
// The audit that produced this table found one live counter-example, which is
// now fixed: `set-height` claimed `beam`, but `BeamData` (core-app-model/src/
// stores/BeamTypes.ts) has width and depth and NO height, and
// `BeamFragmentBuilder` builds from `beam.width` × `beam.depth`. "Set the beam
// height to 500mm" wrote a field nothing reads and reported success — the
// ElementCapabilities lie, inside the chat. Beam is off `set-height` and its
// real property, DEPTH, is in this table instead.
//
// This module is PURE — no DOM, no stores, no I/O. The only import with a
// runtime value is `BEAM_CONSTRAINTS`, the published bound set (never re-typed:
// one policy, one place), exactly as CapabilityExecutionSpec imports the wall
// rake bounds.

import { BEAM_CONSTRAINTS } from '@pryzm/core-app-model/stores';
import {
  capabilityAppliesTo,
  normalizeElementKind,
  resolveChatCapability,
} from '../capabilities/ChatCapabilityRegistry.js';
import { describeCapabilitiesFor } from '../capabilities/CapabilityRefusal.js';
import type {
  BusCommandRef,
  ResolverContext,
  SemanticApplication,
  SemanticIntent,
} from './ZeroTokenResolver.js';

// ─── The property-driven intent universe ─────────────────────────────────────

/**
 * The intents executed by the generic property arm. Adding an id here plus its
 * table entry below plus its ChatCapabilityRegistry metadata is the WHOLE cost
 * of a new chat-drivable property: zero resolver code, zero new grammar.
 */
export type PropertyDrivenIntentId =
  | 'set-depth'
  | 'set-length'
  | 'set-base-offset'
  // RAC U7.3 — THE EXTENSION PROOF. These four were added as table entries and
  // registry metadata ONLY: `git show` for that commit contains zero changed
  // lines in ZeroTokenResolver.ts and zero in CapabilityExecutionSpec.ts.
  | 'set-mullion-size'
  | 'set-panel-thickness'
  | 'set-baluster-spacing'
  | 'set-baluster-width';

/** Every property intent carries exactly one measured value, in metres. */
export interface PropertyIntent {
  readonly intent: PropertyDrivenIntentId;
  readonly value: number;
}

// ─── The spec ────────────────────────────────────────────────────────────────

/**
 * One LIVE route: which kinds it serves, which bus command carries it, and the
 * payload it builds. A route is only listed once both halves of the honesty bar
 * are proven for every kind in `kinds` (see the header) — the registry's
 * `commandProof` entries are where that proof is recorded and gate-checked.
 */
export interface PropertyRoute {
  readonly kinds: readonly string[];
  readonly busCommand: string;
  readonly payload: (
    elementId: string,
    elementType: string,
    value: number,
  ) => Readonly<Record<string, unknown>>;
  /** Bounds, ONLY where a published L2 authority exists to source them from.
   *  Absent means "the command/store is the gate" — inventing a plausible
   *  bound here would be a second source of truth for a rule we do not own. */
  readonly min?: number;
  readonly max?: number;
  /** Names the authority the bounds came from; quoted in the refusal. */
  readonly boundsAuthority?: string;
}

export interface PropertyEntry {
  readonly id: PropertyDrivenIntentId;
  /** The canonical noun, as the grammar says it ("base offset"). */
  readonly property: string;
  /** Other nouns meaning the same property ("section depth"). */
  readonly synonyms: readonly string[];
  /** Adjective forms: "make this 500mm deep". */
  readonly adjectives: readonly string[];
  /** The label spoken in summaries and refusals. */
  readonly label: string;
  /** May the value be negative? A base offset may; a depth may not. */
  readonly signed: boolean;
  /** The routes, in order; the first route claiming a kind serves it. */
  readonly routes: readonly PropertyRoute[];
}

// ─── The table ───────────────────────────────────────────────────────────────

/** The generic-parameter carrier every route below uses. One command, one
 *  dispatch, one rebuild — the route proven in production by
 *  §FIX-CHAT-COMPOUND-DIMENSIONS. */
const generic = (field: string) =>
  (elementId: string, elementType: string, value: number) => ({
    elementId,
    elementType,
    parameters: { [field]: value },
  });

export const PROPERTY_VOCABULARY: Readonly<Record<PropertyDrivenIntentId, PropertyEntry>> = {
  /**
   * §PROP-DEPTH — "set the beam depth to 500mm" / "set the column depth to
   * 400mm". The structural section dimension, and the property `set-height`
   * was lying about for beams (see the header).
   *
   * BEAM liveness: `BeamData.depth` is read by BeamFragmentBuilder for both the
   * proxy and the final section geometry, and `BeamStore.update()` emits on the
   * storeEventBus, which `beamStore.setBuilder(beamBuilder)` (initBuilders)
   * subscribes to → `updateBeam()`. COLUMN liveness: `ColumnData.depth` is the
   * rectangular-profile section depth, and the generic command's own column arm
   * calls `columnBuilder.buildColumn`.
   */
  'set-depth': {
    id: 'set-depth',
    property: 'depth',
    synonyms: ['section depth'],
    adjectives: ['deep'],
    label: 'depth',
    signed: false,
    routes: [
      {
        kinds: ['beam'],
        busCommand: 'element.updateParameters',
        payload: generic('depth'),
        // The published set, never re-typed (C65 §3.5: one policy, one place).
        min: BEAM_CONSTRAINTS.MIN_DEPTH,
        max: BEAM_CONSTRAINTS.MAX_DEPTH,
        boundsAuthority: 'BEAM_CONSTRAINTS',
      },
      {
        kinds: ['column'],
        busCommand: 'element.updateParameters',
        payload: generic('depth'),
        // No published COLUMN_CONSTRAINTS exists. Rather than transcribe the
        // property panel's hand-written 0.05–5 m (a second source of truth for
        // a rule this layer does not own), positivity is the only gate here and
        // the command's own validateParameters refuses the rest.
      },
    ],
  },

  /**
   * §PROP-LENGTH — "set the length to 2m". `FurnitureData.length` is the
   * long-axis dimension the fragment builders size from; the generic command
   * MERGES onto the existing record (FurnitureStore.update is a full replace)
   * and emits `bim-furniture-updated`, which initBuilders subscribes to.
   */
  'set-length': {
    id: 'set-length',
    property: 'length',
    synonyms: [],
    adjectives: ['long'],
    label: 'length',
    signed: false,
    routes: [
      {
        kinds: ['furniture'],
        busCommand: 'element.updateParameters',
        payload: generic('length'),
      },
    ],
  },

  /**
   * §PROP-BASE-OFFSET — "set the base offset to 150 mm", the RAC plan's own U7
   * test sentence. The vertical offset from the level datum, and the widest
   * property in the vocabulary: seven kinds carry the field AND rebuild on it.
   *
   * SIGNED — a base offset of −0.15 m (a dropped slab) is an ordinary ask, so
   * the positivity gate every other dimension uses would be wrong here. BEAM is
   * deliberately ABSENT: `BeamData` has no `baseOffset` field at all (the beam
   * property panel offers one anyway — a dead control this table must not
   * mirror into the chat).
   */
  'set-base-offset': {
    id: 'set-base-offset',
    property: 'base offset',
    synonyms: ['base elevation', 'offset from the level'],
    adjectives: [],
    label: 'base offset',
    signed: true,
    routes: [
      {
        kinds: ['wall', 'slab', 'column', 'roof', 'curtain-wall', 'furniture', 'handrail'],
        busCommand: 'element.updateParameters',
        payload: generic('baseOffset'),
      },
    ],
  },


  /**
   * §PROP-MULLION-SIZE (RAC U7.3) — "set the mullion size to 60mm".
   * `CurtainWallData.mullionSize` is the mullion section the CurtainWallBuilder
   * extrudes along every grid line; the generic command's curtain-wall arm
   * calls `curtainWallBuilder.buildCurtainWall` after the write, and the
   * property panel exposes the same field as an editable row.
   */
  'set-mullion-size': {
    id: 'set-mullion-size',
    property: 'mullion size',
    synonyms: ['mullion width'],
    adjectives: [],
    label: 'mullion size',
    signed: false,
    routes: [
      {
        kinds: ['curtain-wall'],
        busCommand: 'element.updateParameters',
        payload: generic('mullionSize'),
      },
    ],
  },

  /**
   * §PROP-PANEL-THICKNESS (RAC U7.3) — "set the panel thickness to 12mm".
   * `CurtainWallData.panelThickness` is the glazing/panel build thickness;
   * same store, same rebuild. Deliberately NOT folded into `set-thickness`:
   * that capability's routing is hand-written per kind and sends anything that
   * is not a slab or a roof to `wall.updateDimensions`, so a curtain wall
   * would have been addressed as a wall.
   */
  'set-panel-thickness': {
    id: 'set-panel-thickness',
    property: 'panel thickness',
    synonyms: ['glazing thickness'],
    adjectives: [],
    label: 'panel thickness',
    signed: false,
    routes: [
      {
        kinds: ['curtain-wall'],
        busCommand: 'element.updateParameters',
        payload: generic('panelThickness'),
      },
    ],
  },

  /**
   * §PROP-BALUSTER-SPACING (RAC U7.3) — "set the baluster spacing to 100mm".
   * `HandrailFragmentBuilder` reads `handrail.balusterSpacing` directly (line
   * ~250: `handrail.balusterSpacing ?? handrail.postSpacing ?? 0.11`) and
   * derives the baluster COUNT from it, so a write genuinely re-populates the
   * railing. The generic command routes `handrail` to the handrailStore (a
   * partial-merge `update`) and emits `bim-handrail-updated`, which the
   * handrail builder subscribes to — both halves of the honesty bar.
   */
  'set-baluster-spacing': {
    id: 'set-baluster-spacing',
    property: 'baluster spacing',
    synonyms: ['spacing between balusters'],
    adjectives: [],
    label: 'baluster spacing',
    signed: false,
    routes: [
      {
        kinds: ['handrail'],
        busCommand: 'element.updateParameters',
        payload: generic('balusterSpacing'),
      },
    ],
  },

  /**
   * §PROP-BALUSTER-WIDTH (RAC U7.3) — "set the baluster width to 40mm". Same
   * record, same rebuild; `HandrailFragmentBuilder` sizes each baluster from
   * `handrail.balusterWidth ?? 0.02`. Deliberately NOT folded into `set-width`
   * for the same reason `set-panel-thickness` is not `set-thickness`: that
   * capability's kind list is hand-written and handrail is not on it, so the
   * ask would have been refused rather than served.
   */
  'set-baluster-width': {
    id: 'set-baluster-width',
    property: 'baluster width',
    synonyms: ['baluster thickness'],
    adjectives: [],
    label: 'baluster width',
    signed: false,
    routes: [
      {
        kinds: ['handrail'],
        busCommand: 'element.updateParameters',
        payload: generic('balusterWidth'),
      },
    ],
  },

  // ── NOT ADDED, and the reason is the point of this table ──────────────────
  //
  // `gridXSpacing` / `gridYSpacing` were the obvious fifth and sixth entries —
  // both are editable NUMBER rows on the curtain-wall property panel, both are
  // on `CurtainWallData`, and `resolveStore()` routes curtain-wall. They fail
  // the honesty bar anyway: `CurtainWallBuilder` reads them ONLY when
  // `cw.gridSystem` is absent (`const grid = cw.gridSystem ?? migrateToGrid…`).
  // Any curtain wall whose grid has been edited by Add/RemoveCurtainGridLine
  // carries a `gridSystem`, and on those the write lands in the record, the
  // rebuild runs, and NOTHING moves — "Done" over a no-op, on exactly the walls
  // a user is most likely to be tuning. A property whose liveness is
  // conditional on other state is not a property this table may claim; it needs
  // a command that edits the grid system, which is U9+ work.
};

// ─── Lookup surface ──────────────────────────────────────────────────────────

const PROPERTY_IDS = Object.keys(PROPERTY_VOCABULARY) as readonly PropertyDrivenIntentId[];

/** Is this intent id served by the generic property arm? */
export function isPropertyIntentId(id: string): id is PropertyDrivenIntentId {
  return Object.prototype.hasOwnProperty.call(PROPERTY_VOCABULARY, id);
}

/** Every property entry — for the registry, the gate and the specs. */
export function allPropertyEntries(): readonly PropertyEntry[] {
  return PROPERTY_IDS.map((id) => PROPERTY_VOCABULARY[id]);
}

/**
 * The element kinds a property really applies to — the union of its routes'
 * kinds, in declaration order. The ChatCapabilityRegistry reads its `targets`
 * from HERE rather than restating them, so the table and the claim cannot
 * drift: a route removed is a target removed, in the same commit.
 */
export function propertyTargets(id: PropertyDrivenIntentId): readonly string[] {
  return PROPERTY_VOCABULARY[id].routes.flatMap((r) => r.kinds);
}

/** The route serving `kind`, or null when the property does not reach it. */
export function routeFor(entry: PropertyEntry, kind: string): PropertyRoute | null {
  const k = normalizeElementKind(kind);
  return entry.routes.find((r) => r.kinds.includes(k)) ?? null;
}

// ─── The ONE grammar ─────────────────────────────────────────────────────────
//
// Built FROM the table, so a new property's phrasings arrive with its entry.
// Two shapes, matching the hand-written dimension matchers exactly:
//   "set|change|make [the] [<kind>] <property> [of this|the selection] [to] <len>"
//   "make this|the selection <len> <adjective>"

/** The measurement source, byte-identical to the resolver's LEN_SRC — the unit
 *  rule itself stays in ONE place (`lengthToMeters`), which the caller applies
 *  to the captured groups. */
const LEN_SRC = String.raw`(-?\d+(?:[.,]\d+)?)\s*(millimet(?:er|re)s?|centimet(?:er|re)s?|met(?:er|re)s?|mm|cm|m)?\b`;

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

interface CompiledProperty {
  readonly id: PropertyDrivenIntentId;
  readonly named: RegExp;
  readonly adjectival: RegExp | null;
}

const COMPILED: readonly CompiledProperty[] = allPropertyEntries().map((entry) => {
  const nouns = [...new Set(entry.routes.flatMap((r) => r.kinds))]
    .map((k) => escapeRe(k.replace('-', ' ')))
    .concat(['selected']);
  const nounGroup = `(?:${nouns.map((n) => ` ${n}`).join('|')})?`;
  const propGroup = [entry.property, ...entry.synonyms].map(escapeRe).join('|');
  return {
    id: entry.id,
    named: new RegExp(
      `^(?:set|change|make)(?: the)?${nounGroup} (?:${propGroup})` +
      `(?: of (?:this|the selection))?(?: to)? ${LEN_SRC}$`,
    ),
    adjectival: entry.adjectives.length === 0
      ? null
      : new RegExp(
          `^make (?:this|the selection) ${LEN_SRC} ` +
          `(?:${entry.adjectives.map(escapeRe).join('|')})$`,
        ),
  };
});

/**
 * The ONE property matcher. Returns the captured measurement as `[value, unit]`
 * so the caller applies the resolver's single unit authority; null when no
 * property in the vocabulary claims the text.
 */
export function matchPropertyUtterance(
  text: string,
): { readonly id: PropertyDrivenIntentId; readonly raw: string; readonly unit: string | undefined } | null {
  for (const c of COMPILED) {
    const m = c.named.exec(text) ?? c.adjectival?.exec(text) ?? null;
    if (m !== null) return { id: c.id, raw: m[1]!, unit: m[2] };
  }
  return null;
}

// ─── The ONE generic arm ─────────────────────────────────────────────────────

type Refusal = Extract<SemanticApplication, { kind: 'refusal' }>;

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

function fmt(n: number): string {
  return `${round3(n)} m`;
}

/**
 * The ONE executor for property-driven intents, called from
 * `applySemanticIntent`'s switch (which remains the single semantic authority).
 * Stage order mirrors the dimension family it generalises: selection guard →
 * per-element capability guard (ALL-OR-NOTHING, ADR-0314 §Selection batch) →
 * value bounds → one command per selected element.
 *
 * The kind guard is the registry's own `capabilityAppliesTo`, so a property
 * cannot advertise a target its resolver then refuses, and the refusal offers
 * what the kind CAN do — generated from the registry, never hand-listed.
 */
export function applyPropertyIntent(
  si: PropertyIntent,
  ctx: ResolverContext,
): SemanticApplication {
  const entry = PROPERTY_VOCABULARY[si.intent];
  const refuse = (reason: string, suggestions: readonly string[] = []): Refusal => ({
    kind: 'refusal',
    intent: si.intent,
    reason,
    suggestions,
  });

  const first = ctx.selection[0];
  if (first === undefined) {
    return refuse(`Nothing is selected — select an element first, then set its ${entry.label}.`);
  }

  // ── Kind stage — every selected element must pass, or nothing runs.
  const cap = resolveChatCapability(si.intent);
  for (const s of ctx.selection) {
    if (cap !== null && !capabilityAppliesTo(cap, s.elementType)) {
      return refuse(
        `I can't set the ${entry.label} of a ${normalizeElementKind(s.elementType)} from chat — ` +
        `the command behind it has no route for that element type, so it would look like it worked ` +
        `and change nothing. ${describeCapabilitiesFor(s.elementType)}`,
      );
    }
  }

  // ── Value stage — sign, then the route's published bounds (when it has any).
  const value = round3(si.value);
  if (!Number.isFinite(value)) {
    return refuse(`"${si.value}" is not a ${entry.label} I can read.`);
  }
  if (!entry.signed && value <= 0) {
    return refuse(`A ${entry.label} of ${fmt(value)} is not valid — it must be positive.`);
  }
  for (const s of ctx.selection) {
    const route = routeFor(entry, s.elementType);
    if (route === null) {
      // Unreachable while the registry targets are generated from this table;
      // kept because a hand-edited target list must fail loudly, not silently
      // dispatch a command with no route.
      return refuse(
        `I have no live route for the ${entry.label} of a ${normalizeElementKind(s.elementType)}.`,
      );
    }
    if (route.min !== undefined && value < route.min) {
      return refuse(
        `A ${normalizeElementKind(s.elementType)} ${entry.label} of ${fmt(value)} is below the ` +
        `${fmt(route.min)} minimum${route.boundsAuthority !== undefined ? ` (${route.boundsAuthority})` : ''}.`,
      );
    }
    if (route.max !== undefined && value > route.max) {
      return refuse(
        `A ${normalizeElementKind(s.elementType)} ${entry.label} of ${fmt(value)} is above the ` +
        `${fmt(route.max)} maximum${route.boundsAuthority !== undefined ? ` (${route.boundsAuthority})` : ''}.`,
      );
    }
  }

  // ── Commands — one per selected element, on its own kind's route.
  const commands: BusCommandRef[] = ctx.selection.map((s) => {
    const route = routeFor(entry, s.elementType)!;
    return { type: route.busCommand, payload: route.payload(s.elementId, s.elementType, value) };
  });
  const n = ctx.selection.length;
  return {
    kind: 'commands',
    intent: si.intent,
    summary: n > 1
      ? `Set ${n} selected elements' ${entry.label} to ${fmt(value)}`
      : `Set the selected ${normalizeElementKind(first.elementType)}'s ${entry.label} to ${fmt(value)}`,
    commands,
    destructive: false,
  };
}

/** Narrowing helper for the resolver's default arm. */
export function asPropertyIntent(si: SemanticIntent): PropertyIntent | null {
  return isPropertyIntentId(si.intent) ? (si as PropertyIntent) : null;
}
