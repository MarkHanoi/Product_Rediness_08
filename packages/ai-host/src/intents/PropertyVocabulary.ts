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
  | 'set-baluster-width'
  // §PROP-OVERHANG (RAC VERBS-CAP) — the roof eave. See the entry for why this
  // is the ONE roof dimension the geometry proves, and why `ridgeOffset` and
  // `fascia` are deliberately absent.
  | 'set-overhang'
  // ⭐ §FEAT-WINDOW-REVEAL-RAC (L-3202 … L-3204) — the founder asked for the
  // window reveal by name. Five panel controls, five table entries, and the
  // FIRST entries in this vocabulary whose measure is an ANGLE rather than a
  // length — see `measure` on PropertyEntry.
  | 'set-reveal-projection'
  | 'set-reveal-splay'
  | 'set-reveal-splay-head'
  | 'set-reveal-splay-sill'
  | 'set-reveal-splay-jambs';

/**
 * Every property intent carries exactly one measured value.
 *
 * ⚠ THE UNIT IS THE ENTRY'S, NOT THIS TYPE'S. Until §FEAT-WINDOW-REVEAL-RAC every
 * member of this vocabulary was a length and this comment read "in metres"; the
 * reveal splays are DEGREES. The resolver converts per `PropertyEntry.measure`,
 * so a value here is always in the entry's own declared unit and never in an
 * assumed one.
 */
export interface PropertyIntent {
  readonly intent: PropertyDrivenIntentId;
  readonly value: number;
}

/**
 * ⭐ WHAT KIND OF QUANTITY A PROPERTY IS — and therefore how its digits are read
 * and how they are spoken back.
 *
 * `'length'` is the historical default and every pre-existing entry keeps it
 * implicitly, so no existing property's grammar or refusal copy moves.
 *
 * The distinction is not cosmetic. `toMeters('15', undefined)` is 15 METRES; a
 * splay of "15" is 15 DEGREES. Had the reveal entries been added without this
 * axis they would have arrived at the command as 15 m of angle — the same class
 * of defect as the roof-pitch query row that read `pitch`/radians off the L0
 * schema while the write lands `slope`/gradient on the geometry record.
 */
export type PropertyMeasure = 'length' | 'angle';

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
  /**
   * May the value be exactly ZERO? Distinct from `signed`, because the two
   * questions are genuinely different and conflating them mints a FALSE
   * REFUSAL. A roof overhang is `nonnegative()` in RoofDataSchema — 0 is a
   * flush eave, an ordinary thing to ask for ("set the overhang to 0") — while
   * a negative overhang is not a shape the eave offset can build. Every
   * pre-existing entry omits this and keeps the old `value <= 0` rule, so no
   * existing property's bound moves.
   */
  readonly zeroValid?: boolean;
  /**
   * The quantity this property is. Omitted means `'length'`, which is what every
   * entry written before §FEAT-WINDOW-REVEAL-RAC is — so the default is the
   * historical behaviour rather than a new assumption.
   */
  readonly measure?: PropertyMeasure;
  /** The routes, in order; the first route claiming a kind serves it. */
  readonly routes: readonly PropertyRoute[];
}

/** The entry's measure, with the historical default applied in ONE place. */
export function measureOf(entry: PropertyEntry): PropertyMeasure {
  return entry.measure ?? 'length';
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

  /**
   * §PROP-OVERHANG (RAC VERBS-CAP) — "set the roof overhang to 300mm".
   *
   * THE MEASURED GAP THIS CLOSES. The RAC conformance exercise reached exactly
   * ONE of the roof verbs from language (`set-roof-pitch`), while the roof
   * geometry itself had just been proven correct to 0.000 mm — a 300 mm eave
   * delivers 300.00 mm on square, elongated, L and U plans. The geometry was
   * right and no sentence could reach it. This row is the sentence.
   *
   * THE CARRIER, and why it is NOT `roof.setOverhang`. `roof.setOverhang` is
   * classified D-DEAD in ChatCommandClassification (plugin DTO store nothing
   * renders), and its note said roof overhang "has no proven live carrier yet".
   * It has one, and it is the carrier `set-roof-pitch` already ships on:
   * `roof.update` → the initBusHandlers legacy bridge → `UpdateRoofCommand`,
   * which applies an arbitrary `Partial<RoofData>` to `context.stores.roofStore`
   * — the GEOMETRY roof store the builder reads. Pitch proved that route live in
   * production; overhang rides the identical command, store and rebuild, so the
   * liveness claim is not a new one.
   *
   * BOTH HALVES OF THE HONESTY BAR:
   *   1. FIELD EXISTS + WRITE LANDS — `RoofData.overhang` is required (not
   *      optional) in RoofDataSchema, and UpdateRoofCommand's `store.update`
   *      merges it onto the record.
   *   2. THE GEOMETRY READS IT — `RoofGeometryBuilder` consumes `data.overhang`
   *      in EVERY roof-type arm: `_applyOverhang(poly, data.overhang ?? 0)` for
   *      gable/hip/shed, the per-edge eave expansion for the rectangular
   *      decomposition, and `seg.overhang ?? data.overhang` for compound
   *      segments. It is not a field nothing reads.
   *
   * ZERO IS VALID — see `zeroValid`. A flush eave is an ordinary ask and the
   * schema says `nonnegative()`, so the blanket `value <= 0` rule every other
   * dimension uses would refuse a legal request.
   *
   * NO MAX. `RoofDataSchema` publishes only `nonnegative()`. There is no
   * ROOF_CONSTRAINTS to source an upper bound from, and transcribing a
   * plausible one here would mint a second source of truth for a rule this
   * layer does not own (C65 §3.5). The command's own validation is the gate.
   *
   * ── TWO ROOF DIMENSIONS DELIBERATELY NOT ADDED ────────────────────────────
   *
   * `ridgeOffset` and `fascia` are both on `RoofData`, both would have made
   * "set the ridge height to 2 m" and "set the fascia to 200mm" resolve, and
   * BOTH FAIL the honesty bar in the same way the beam-height lie did:
   * `RoofGeometryBuilder` never reads either one. Repo-wide, `ridgeOffset`
   * appears only in RoofTypes.ts and roofSnapshotUtils.ts (serialisation), and
   * `fascia` likewise — the only "fascia" hits in the builder are comments
   * naming a MATERIAL SLOT, not the number. Declaring them would write a field
   * nothing reads and report "Done" over a no-op, on precisely the two
   * properties a user tuning a roof reaches for next. They need a command that
   * actually drives the ridge line, which is VERBS-CMD work.
   */
  'set-overhang': {
    id: 'set-overhang',
    property: 'overhang',
    synonyms: ['eaves overhang', 'eave overhang', 'roof overhang', 'eaves'],
    adjectives: [],
    label: 'overhang',
    signed: false,
    zeroValid: true,
    routes: [
      {
        kinds: ['roof'],
        // NOT element.updateParameters: the generic command's roof arm writes
        // `(context.stores as any).roofStore`, and the §FIX-CHAT-DEAD-ROUTES
        // audit put the roof's proven live route on roof.update. Same command
        // as set-roof-pitch, deliberately — one live roof carrier, not two.
        busCommand: 'roof.update',
        payload: (elementId, _elementType, value) => ({
          id: elementId,
          updates: { overhang: value },
        }),
      },
    ],
  },

  // ── ⭐ §FEAT-WINDOW-REVEAL-RAC (L-3202 … L-3204) — THE WINDOW REVEAL ───────
  //
  // The founder's ask, relayed verbatim: the reveal fields are "not reachable by
  // RAC at all". They were panel-only, and lane WIN1 recorded WHY it would not
  // wire them (L-1923): `element.updateParameters` "would have silently dropped
  // it" through `WallStore.updateWindow`'s four-field whitelist.
  //
  // ⭐ THAT WAS RE-MEASURED BEFORE ANY OF THESE ROWS WERE WRITTEN, and it does
  // not hold. `WindowOpeningSchema` carries all five reveal fields, so
  // `windowStore.update` keeps them; the four-field list is the projection onto
  // `wall.openings[]`, and the reveal geometry is built from the WINDOW record,
  // which never travels through it. Probed against the real stores,
  // `{revealProjection: 0.25}` lands on `windowStore.getById(...)`. The
  // assertions are `paramDropIsARefusal.test.ts` §B.
  //
  // TWO REAL DEFECTS WERE FOUND IN ITS PLACE, and BOTH are fixed on the carrier
  // these rows use before any row was allowed to claim it (L-3200 / L-3202,
  // commit 0fb1e9f9) — which is the whole reason this table may name it:
  //   1. an unknown field was DROPPED BY ZOD and reported as success. There is
  //      now a read-back that counts records, not calls.
  //   2. `element.updateParameters` BYPASSED the C83 IMPOSSIBLE gate, so a
  //      degenerate splay stored happily and reported success. The gate is now
  //      on that path too.
  //
  // BOTH HALVES OF THE HONESTY BAR, for all five rows:
  //   1. FIELD EXISTS + WRITE LANDS — `WindowOpeningSchema` declares every one
  //      (`WindowTypes.ts:79` ff) and `windowStore.update` merges and re-parses.
  //   2. THE GEOMETRY READS IT — `WindowReveal.resolveWindowReveal` consumes all
  //      five, `isRevealAuthored` keys the whole feature on them, and
  //      `WindowRevealLeaf` builds the boxes and wedges from the result. It is
  //      not a field nothing reads.
  //
  // ⚠ NO `max` IS DECLARED, and that is deliberate rather than an omission.
  // `MAX_REVEAL_SPLAY_DEG` lives in `@pryzm/geometry-window`, which this package
  // does not depend on. Transcribing `85` here would mint a second source of
  // truth for a bound this layer does not own (C65 §3.5) — the exact fault
  // `set-overhang` records for the roof. The command's own C83 gate is the
  // authority, and it refuses with BOTH numbers.

  /**
   * §PROP-REVEAL-PROJECTION — "set the reveal projection to 100mm".
   *
   * SIGNED, and this is the one place the sign carries real meaning: positive
   * pushes the window's outer face proud of the authored EXTERIOR wall face,
   * negative RECESSES it into a deep-set reveal. `WindowTypes.ts:71` says so on
   * the field itself. A positivity gate here would refuse half the detail.
   *
   * ZERO IS VALID — a flush face is the default and an ordinary thing to ask
   * back for after trying a projection.
   */
  'set-reveal-projection': {
    id: 'set-reveal-projection',
    property: 'reveal projection',
    synonyms: ['projection', 'reveal depth', 'reveal offset', 'window projection'],
    adjectives: [],
    label: 'reveal projection',
    signed: true,
    zeroValid: true,
    measure: 'length',
    routes: [
      {
        kinds: ['window'],
        busCommand: 'element.updateParameters',
        payload: generic('revealProjection'),
      },
    ],
  },

  /**
   * §PROP-REVEAL-SPLAY — "set the reveal splay to 15 degrees". ALL FOUR SIDES in
   * ONE command, which is the panel's own "Splay all sides" control and
   * therefore one undo step rather than four.
   *
   * ⚠ THE SUMMARY SAYS "all four sides" IN AS MANY WORDS. A user who asked for
   * "the splay" and got four fields written must be able to see that from the
   * transcript; the per-side rows below exist so the narrower ask is not a miss.
   */
  'set-reveal-splay': {
    id: 'set-reveal-splay',
    property: 'reveal splay',
    synonyms: ['splay', 'splay angle', 'reveal splay angle'],
    adjectives: [],
    label: 'reveal splay (all four sides)',
    signed: false,
    zeroValid: true,
    measure: 'angle',
    routes: [
      {
        kinds: ['window'],
        busCommand: 'element.updateParameters',
        payload: (elementId, elementType, value) => ({
          elementId,
          elementType,
          parameters: {
            revealSplayHead: value,
            revealSplaySill: value,
            revealSplayJambLeft: value,
            revealSplayJambRight: value,
          },
        }),
      },
    ],
  },

  /** §PROP-REVEAL-SPLAY-HEAD — the top of the void, splayed alone. */
  'set-reveal-splay-head': {
    id: 'set-reveal-splay-head',
    property: 'head splay',
    synonyms: ['splay head', 'reveal splay head', 'head reveal splay'],
    adjectives: [],
    label: 'head splay',
    signed: false,
    zeroValid: true,
    measure: 'angle',
    routes: [
      {
        kinds: ['window'],
        busCommand: 'element.updateParameters',
        payload: generic('revealSplayHead'),
      },
    ],
  },

  /** §PROP-REVEAL-SPLAY-SILL — the bottom of the void, splayed alone. */
  'set-reveal-splay-sill': {
    id: 'set-reveal-splay-sill',
    property: 'sill splay',
    synonyms: ['splay sill', 'reveal splay sill', 'sill reveal splay'],
    adjectives: [],
    label: 'sill splay',
    signed: false,
    zeroValid: true,
    measure: 'angle',
    routes: [
      {
        kinds: ['window'],
        busCommand: 'element.updateParameters',
        payload: generic('revealSplaySill'),
      },
    ],
  },

  /**
   * §PROP-REVEAL-SPLAY-JAMBS — BOTH jambs, together.
   *
   * ⚠ A SYMMETRIC PAIR, and the asymmetric ask is NOT served. "Splay the left
   * jamb to 20 and leave the right" is a real detail (a window turning a
   * corner), and no row here reaches it: this one writes both. Stated rather
   * than quietly approximated — the panel offers the two independently, so this
   * is a genuine shortfall, recorded at L-3204 instead of implied.
   */
  'set-reveal-splay-jambs': {
    id: 'set-reveal-splay-jambs',
    property: 'jamb splay',
    synonyms: ['splay jambs', 'jamb reveal splay', 'reveal splay jambs', 'side splay'],
    adjectives: [],
    label: 'jamb splay (both jambs)',
    signed: false,
    zeroValid: true,
    measure: 'angle',
    routes: [
      {
        kinds: ['window'],
        busCommand: 'element.updateParameters',
        payload: (elementId, elementType, value) => ({
          elementId,
          elementType,
          parameters: {
            revealSplayJambLeft: value,
            revealSplayJambRight: value,
          },
        }),
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

/**
 * §FEAT-WINDOW-REVEAL-RAC — the ANGLE source, byte-compatible in SHAPE with
 * `LEN_SRC`: group 1 is the digits, group 2 the (here always undefined) unit, so
 * `matchPropertyUtterance` reads both measures through one pair of indices and
 * the caller never has to know which it got. The degree suffix is optional and
 * non-capturing, mirroring the resolver's own `DEG_SRC` for roof pitch — one
 * spelling of "how a chat says an angle", not two.
 */
const ANG_SRC = String.raw`(-?\d+(?:[.,]\d+)?)()\s*(?:°|deg|degs|degree|degrees)?`;

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
  // ⚠ LONGEST NOUN FIRST. "splay" is a suffix of "head splay", and alternation
  // is first-match-wins, so an unsorted group would let the generic `splay` row
  // claim the first half of "…head splay…" and then fail on the remainder —
  // turning a specific ask into a MISS rather than into the wrong property.
  // Sorting makes the specific spelling win outright. Same discipline
  // `PropertyQuery.COMPILED_BY_SPECIFICITY` applies across rows.
  const propGroup = [entry.property, ...entry.synonyms]
    .slice()
    .sort((a, b) => b.length - a.length)
    .map(escapeRe)
    .join('|');
  const SRC = measureOf(entry) === 'angle' ? ANG_SRC : LEN_SRC;
  return {
    id: entry.id,
    named: new RegExp(
      `^(?:set|change|make)(?: the)?${nounGroup} (?:${propGroup})` +
      `(?: of (?:this|the selection))?(?: to)? ${SRC}$`,
    ),
    adjectival: entry.adjectives.length === 0
      ? null
      : new RegExp(
          `^make (?:this|the selection) ${SRC} ` +
          `(?:${entry.adjectives.map(escapeRe).join('|')})$`,
        ),
  };
});

/**
 * ⚠ SPECIFICITY ORDER ACROSS ROWS, not just within one. `set-reveal-splay`'s
 * noun "reveal splay" and `set-reveal-splay-head`'s "reveal splay head" both
 * begin the same way; the patterns are `^…$`-anchored so a wrong claim is not
 * possible, but iterating longest-noun-first means the specific row is TRIED
 * first and the generic one never has to be excluded by luck. This is the same
 * guarantee `PropertyQuery` states for "sill height" vs "height".
 */
const COMPILED_BY_SPECIFICITY: readonly CompiledProperty[] = [...COMPILED].sort((a, b) => {
  const na = PROPERTY_VOCABULARY[a.id].property.length;
  const nb = PROPERTY_VOCABULARY[b.id].property.length;
  return nb - na;
});

/**
 * The ONE property matcher. Returns the captured measurement as `[value, unit]`
 * plus the entry's MEASURE, so the caller applies the resolver's single unit
 * authority for a length and reads degrees as degrees for an angle; null when no
 * property in the vocabulary claims the text.
 */
export function matchPropertyUtterance(
  text: string,
): {
  readonly id: PropertyDrivenIntentId;
  readonly raw: string;
  readonly unit: string | undefined;
  readonly measure: PropertyMeasure;
} | null {
  for (const c of COMPILED_BY_SPECIFICITY) {
    const m = c.named.exec(text) ?? c.adjectival?.exec(text) ?? null;
    if (m !== null) {
      return {
        id: c.id,
        raw: m[1]!,
        unit: m[2] === '' ? undefined : m[2],
        measure: measureOf(PROPERTY_VOCABULARY[c.id]),
      };
    }
  }
  return null;
}

// ─── The ONE generic arm ─────────────────────────────────────────────────────

type Refusal = Extract<SemanticApplication, { kind: 'refusal' }>;

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

/**
 * How a value is SPOKEN back, in the entry's own unit.
 *
 * ⚠ This took an `entry` argument in §FEAT-WINDOW-REVEAL-RAC because it used to
 * append " m" unconditionally. A refusal reading "a jamb splay of 85 m is above
 * the maximum" would have been a true refusal wearing a false unit — the kind of
 * sentence that sends a user to change the wrong number.
 */
function fmt(n: number, entry: PropertyEntry): string {
  return measureOf(entry) === 'angle' ? `${round3(n)}°` : `${round3(n)} m`;
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
  if (!entry.signed && (entry.zeroValid === true ? value < 0 : value <= 0)) {
    return refuse(
      entry.zeroValid === true
        ? `A ${entry.label} of ${fmt(value, entry)} is not valid — it cannot be negative.`
        : `A ${entry.label} of ${fmt(value, entry)} is not valid — it must be positive.`,
    );
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
        `A ${normalizeElementKind(s.elementType)} ${entry.label} of ${fmt(value, entry)} is below the ` +
        `${fmt(route.min, entry)} minimum${route.boundsAuthority !== undefined ? ` (${route.boundsAuthority})` : ''}.`,
      );
    }
    if (route.max !== undefined && value > route.max) {
      return refuse(
        `A ${normalizeElementKind(s.elementType)} ${entry.label} of ${fmt(value, entry)} is above the ` +
        `${fmt(route.max, entry)} maximum${route.boundsAuthority !== undefined ? ` (${route.boundsAuthority})` : ''}.`,
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
      ? `Set ${n} selected elements' ${entry.label} to ${fmt(value, entry)}`
      : `Set the selected ${normalizeElementKind(first.elementType)}'s ${entry.label} to ${fmt(value, entry)}`,
    commands,
    destructive: false,
  };
}

/** Narrowing helper for the resolver's default arm. */
export function asPropertyIntent(si: SemanticIntent): PropertyIntent | null {
  return isPropertyIntentId(si.intent) ? (si as PropertyIntent) : null;
}
