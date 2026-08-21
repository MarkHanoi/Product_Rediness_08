import { z } from 'zod';
import { defineElement } from '../base/BaseNode.js';
import { RetrofittedProvenanceSchema } from '../provenance/ValueOrigin.js';
import { RetrofittedConfidenceSchema } from '../provenance/ElementConfidence.js';
import { idRef } from '../base/refs.js';
import { createId } from '../factory/createId.js';

/**
 * Window — hosted by a wall opening.
 *
 * `wallId` is brand-typed via `idRef('wall')` so cross-store references are
 * compile-time-safe (cannot pass a `SlabId` where a `WallId` is required).
 */
export const Window = defineElement('window', {
  /**
   * PV-04 / C75 §2.4 — where this element's values came from: one of the five
   * (`ValueOrigin.ts`, which owns the vocabulary and is never restated here),
   * or an explicit unknown carrying its reason.
   *
   * ⚠ `RetrofittedProvenanceSchema`, spelled out at every kind rather than
   * spread from a shared constant or folded into `BaseNodeShape`, and that is
   * deliberate twice over. C75 §2.5 requires optional-with-an-UNKNOWN-default so
   * a snapshot written before this field existed parses unchanged and lands on
   * `predates-provenance` — never on a member of the five (§2.1 and §2.5 are the
   * same rule). And `check-provenance-coverage` measures the file that declares
   * `defineElement('<kind>')`: an indirection hides the field from the C3
   * retrofit-safety arm, so coverage you cannot see at the point of use is the
   * §4.d defect in a new place.
   */
  provenance: RetrofittedProvenanceSchema,
  /**
   * PV-06 / C75 §1.3 — how much this element's values can be TRUSTED. A
   * separate axis from `provenance`: that says where a value came from, this
   * says how sure we are of it, and C75 §1.2 forbids merging axes.
   *
   * ⚠ `RetrofittedConfidenceSchema`, spelled out at every kind rather than
   * spread from a shared constant or folded into `BaseNodeShape` — the same
   * instruction `RetrofittedProvenanceSchema` carries above, for the same
   * measured reason. Optional with an UNKNOWN-with-reason default, so a
   * record written before this field existed parses unchanged and lands on
   * `pending-implementation` — never on a tier, never on `score: 0`.
   *
   * The vocabulary is C62's (`site/metadata/DataConfidence.ts`, ADR-0280),
   * REUSED not reinvented: PV-06 says C62 owns confidence (§4.h).
   */
  confidence: RetrofittedConfidenceSchema,
  /** Host wall id — branded `WallId`, validated to the canonical `wall_<ulid>` shape. */
  wallId: idRef('wall').default(() => createId('wall')),
  openingId: z.string().default(''),
  windowType: z.enum(['single', 'double']).default('single'),
  width: z.number().positive().default(1.2),
  height: z.number().positive().default(1.2),
  sillHeight: z.number().nonnegative().default(0.9),
  offset: z.number().nonnegative().default(0),
  frameThickness: z.number().nonnegative().default(0.05),
  frameWidth: z.number().nonnegative().default(0.05),
  /**
   * ⭐ §FEAT-WINDOW-REVEAL (L-1920 … L-1929, founder 2026-08-21) — THE REVEAL AXIS.
   *
   * *"I want for all window types to have the possibility to extrude outside the
   * façade — a new attribute in the Properties panel, like frame width but offset
   * wide"* and, minutes later, *"another window type where the frame basically has
   * angles inwards — the angle, which will define the size of the glass; and the
   * side of the windows (top / bottom / left / right / all / multiple)"*.
   *
   * **ONE MODEL, TWO PARAMETERS.** Both asks answer "where does the reveal run
   * between the wall face and the glazing plane?". `packages/geometry-window/src/
   * WindowReveal.ts` is the ONE place that model is computed; these fields are its
   * only inputs, and nothing else in the codebase derives a glazing plane. Modelled
   * apart they would mint two rival answers to "where is the glass", which is the
   * defect shape C73/C84 keep recording.
   *
   * ⚠ `revealProjection` IS SIGNED, so it is deliberately **not** `.nonnegative()`
   * like `frameWidth` beside it. Positive extrudes past the wall's **exterior** face
   * (the box window / oriel); negative recesses inward (the deep-set window, equally
   * real and equally asked-for). "Exterior" here is the AUTHORED axis
   * `WallLayerFunction` already declares — the layer stack's `finish-exterior` end,
   * pinned to geometry once in `WindowReveal.EXTERIOR_LOCAL_Z` and never re-derived
   * from a normal, a winding order or a camera.
   *
   * ⚠ The four splay angles are **degrees**, one per side, in construction
   * vocabulary (head / sill / jamb) — the UI labels them top / bottom / left / right.
   * FOUR NAMED SCALARS rather than one scalar plus a mode enum, because the founder
   * asked for *"multiple"*: "head and left jamb only" is his photo, and a mode enum
   * cannot express it.
   *
   * ⛔ **EVERY DEFAULT IS 0, AND THAT IS THE BYTE-IDENTITY GUARANTEE (C84 EI-2).**
   * A window authored before this field existed resolves to no reveal at all and
   * every consumer short-circuits to literally its old code path — not a
   * reconstruction that happens to agree. `WindowReveal.isRevealAuthored()` is that
   * predicate, stated once.
   *
   * ⛔ A splay steep enough to make the two reveals MEET leaves the glazing with zero
   * area. That is IMPOSSIBLE, not merely inadvisable, and it is REFUSED naming both
   * the angle and the dimension that makes it degenerate (C83) — never silently
   * clamped, because a silently-clamped window looks exactly like a working one.
   * The refusal lives in `WindowReveal.windowRevealRefusal`, so the schema, the
   * command and the panel consult ONE gate.
   *
   * 🔴 NOT CHECKED, AND SAID SO RATHER THAN IMPLIED (L-1927): whether the projection
   * crosses a PROPERTY BOUNDARY, a balcony, or a neighbouring element. That needs
   * parcel geometry (C19/C57) and is not built.
   */
  revealProjection: z.number().default(0),
  revealSplayHead: z.number().min(0).max(85).default(0),
  revealSplaySill: z.number().min(0).max(85).default(0),
  revealSplayJambLeft: z.number().min(0).max(85).default(0),
  revealSplayJambRight: z.number().min(0).max(85).default(0),
  /**
   * ⭐ C100 §2.1 / S17 — THE WINDOW'S MATERIAL IDENTITY, one per material surface.
   *
   * The door's twin, deliberately the same shape rather than a window-flavoured
   * variation of it — see `Door.ts` for the full reasoning on why a hosted opening
   * takes one id PER SURFACE and not one plain `materialId`. C100 §9.1 named both
   * families in the same row (*"no `materialId` EXISTS to lose"*) and they are
   * closed together for the same reason: their runtime records already carry
   * `frameFinish.materialId` (`WindowTypes.ts`), written from the master library by
   * the panel, and only the L0 schema was silent.
   *
   * ⚠ `glassMaterialId` is separate from `frameMaterialId` because glazing is a
   * different product with different physical scalars — `MaterialRecord` carries
   * `opacity` and `transparent`, and collapsing the two would force a window to
   * choose between naming its frame and naming its glass.
   *
   * ⚠ **A measured caveat that belongs on the field, not in a commit message**:
   * `WindowBuilder._resolveFrameColor` treats `#e8e8e8` as a sentinel meaning
   * "no colour was authored" — and that hex is also the LEGITIMATE colour of the
   * `wt-single-pane` aluminium type. The builder's own header explains why that is
   * safe (the type resolves back to the same value); it is recorded here because an
   * id now resolves AHEAD of that sentinel and a future editor must not assume the
   * hex is meaningless.
   *
   * Per C73 §1 / C100 §2.1 these are **PERSIST-OR-LOSE**; `frameColor` beside them
   * is a **CACHE** except where it carries an explicit user override.
   */
  frameMaterialId: z.string().optional(),
  glassMaterialId: z.string().optional(),
  frameColor: z.string().optional(),
  fireRating: z.string().optional(),
}).refine(
  (w) => w.frameWidth * 2 <= w.width,
  { message: 'Window frameWidth must not exceed half the pane width.' },
);

export type Window = z.infer<typeof Window>;
