// §PARCEL-LAW-MODEL (STR-RESIDENTIAL-DESIGN-ORCHESTRATOR §25.11 clauses 2–3 · C19 §5.6 ·
// C57 §1.5 · C58 §1.4 · C08 §3.1) — THE PARCEL LAW TAB'S RENDERING OF THE SHARED MODEL.
//
// Founder 2026-09-06: *"UNDER THE PARCEL PANEL ON THE LEFT HAND SIDE RAIL PANEL YOU HAVE
// ALREADY A LOT OF THE DATA FOR THE 'GENERATIVE ENGINE RESI' — THIS SHOULD MIGRATE AND
// EXTEND TO THE NEW PARCEL LAW TAB."*
//
// ═══════════════════════════════════════════════════════════════════════════════════════
// ⭐ WHY THIS EXISTS AT ALL, GIVEN THE TAB ALREADY HOSTS THE CARD
// ═══════════════════════════════════════════════════════════════════════════════════════
// The tab mounts `buildParcelRailPanel`, which CLAIMS the singleton buildable-envelope
// card. `parcelLawTab.ts`'s own header names the consequence and does not fix it:
//
//   *"⚠ TWO HOSTS OPEN AT ONCE is now possible — the rail PARCEL panel beside this tab,
//   which is precisely the founder's screenshot. The singleton has one parent; the last
//   claimer holds it, and the other host's slot shows neither the card nor a sentence."*
//
// That is the founder's actual screen: the rail panel open on the left, the Parcel Law tab
// on the right. In that arrangement ONE of the two shows the figures and the other shows
// nothing — on the tab §25.11 clause 2 names as the PRIMARY surface.
//
// This section is the answer, and it is the answer the contract prescribes rather than the
// one it forbids: C19 §5.7 clause 1 says the fix for a two-host mode is *"a host arbiter or
// a second card instance, never a copied renderer"*. This is not a copied renderer — it is
// a SECOND RENDERING OF THE ONE MODEL (`ParcelLawModel`), which is exactly what §25.11
// clause 1 extracted the model FOR. The figures cannot disagree with the card's, because
// `GISAreaLayout.buildSiteDataBlock` renders the same model object shape from the same two
// inputs. If a value here ever differs from the card's, the model is wrong in one place,
// not two.
//
// ⛔ WHAT THIS FILE MAY NOT DO, AND DOES NOT:
//   · it computes NOTHING — every number arrives on the model, already derived once;
//   · it substitutes NOTHING for a `null` — a null is "the rule pack did not derive this",
//     and it renders as the words `not derived` with the reason in the title, never as 0,
//     never as `—` alone, never as a blank row (C84 EI-1b · C58 §1.4 · L-616);
//   · it has NO HTML SINK — every runtime string reaches the DOM through `textContent`
//     (C08 §3.1 §XSS-SINK-SCAN), and provider-supplied planning strings (zone codes,
//     ordinance references, refusal text) are exactly the reason that rule exists;
//   · it carries NO COLOUR LITERAL — the L-1361 rule `parcelCard.ts` states for itself.
//     Only structural layout is inline; colour is inherited from the Analysis surface.
//
// P6 — this file writes no store and dispatches no command. P8 — one span on the exported
// builder.

import { trace } from '@opentelemetry/api';
import type {
    ParcelLawModel,
    ParcelLawStorey,
} from '../site/parcel/parcelLawModel.js';
// §ONE-PARCEL-BLOCK (L-13005) — the ROW SHAPE the ONE card producer typesets. Type-only, so
// nothing of `parcelCard.ts`'s DOM reaches this module at runtime: this file contributes the
// facts, the card contributes the typography, and there is exactly one of each.
import type { ParcelCardExtraFact } from '../site/parcel/parcelCard.js';
import type { ParcelSectionExtras } from '../site/parcel/parcelPanelSection.js';

const _tracer = trace.getTracer('pryzm.analysis.parcelLawFacts');

/** `data-testid` on the section root. */
export const PARCEL_LAW_FACTS_TESTID = 'analysis-parcel-law-facts';
/** `data-testid` prefix on every fact row: `parcel-law-fact-<key>`. */
export const PARCEL_LAW_FACT_PREFIX = 'parcel-law-fact-';
/** `data-testid` on the sentence shown when the committed ring could not be read. */
export const PARCEL_LAW_GEOMETRY_ABSENT_TESTID = 'parcel-law-geometry-absent';
/** `data-testid` on the sentence shown when there is no determination to state. */
export const PARCEL_LAW_ENVELOPE_ABSENT_TESTID = 'parcel-law-envelope-absent';
/** `data-testid` on the refusal block. */
export const PARCEL_LAW_REFUSAL_TESTID = 'parcel-law-refusal';
/** `data-testid` on the stored-determination date line. */
export const PARCEL_LAW_DETERMINED_AT_TESTID = 'parcel-law-determined-at';
/** Attribute recording WHICH half of the model a given rendering shows. */
export const PARCEL_LAW_FACTS_SCOPE_ATTR = 'data-facts-scope';
/**
 * §ONE-PARCEL-BLOCK (L-13005) — set to `'card'` on a `plot` rendering whose PARCEL rows were
 * handed to the cadastral card instead of drawn here.
 *
 * It exists so the merge is READABLE rather than inferable from an empty element: a reader (or
 * a spec) looking at question 1 and finding no PARCEL group can tell "the rows moved" apart
 * from "the rows are gone", which are opposite facts.
 */
export const PARCEL_LAW_MERGED_ATTR = 'data-parcel-rows-merged-into';

/**
 * §PL-IA-Q (STR §26.3) — WHICH OF THE SIX PERSONA QUESTIONS THIS RENDERING ANSWERS.
 *
 * The founder's complaint about this tab was never that a figure was missing; it was that the
 * figures arrive in the order a PROGRAMMER discovers them. Two of these groups answer
 * *"what is this plot?"* and four answer *"what may I build here, and who says so?"* — different
 * questions, asked at different moments, and until now welded into one flat block.
 *
 * ⛔ THIS IS A PLACEMENT SWITCH, NOT A FILTER ON TRUTH. Every group still renders, from the same
 * model, with the same source line and the same `not derived` discipline; the caller decides
 * which of its two question groups each one lands in. `all` is the default and is byte-identical
 * to the section this file has always produced, so the rail panel and every existing spec are
 * untouched.
 *
 *   · `plot` — the PARCEL group (area, perimeter, bounding box, boundary edges) and, when the
 *     ring could not be read, the sentence that says so.
 *   · `law`  — the shared-model lede, the stored-determination date, the refusal / absence arms
 *     and the ORDINANCE LIMITS · MASSING POTENTIAL · PER STOREY · CAPACITY groups.
 *   · `all`  — both, in the historic order.
 */
export type ParcelLawFactsScope = 'all' | 'plot' | 'law';

/** Options for `buildParcelLawFacts`. Optional in full, so every existing call is unchanged. */
export interface ParcelLawFactsOptions {
    readonly scope?: ParcelLawFactsScope;
}

/** The words a withheld value renders as. ONE spelling, so a spec can assert it verbatim. */
export const NOT_DERIVED_TEXT = 'not derived';
/** The title on every `not derived` value. States the rule, not an apology. */
export const NOT_DERIVED_TITLE =
    'The rule pack did not produce this value for this zone. PRYZM does not infer it — an '
    + 'inferred value would be indistinguishable from a derived one on this panel.';

/** Shown when no determination reached this panel. Names the route, not the absence alone. */
export const PARCEL_LAW_ENVELOPE_ABSENT_TEXT =
    'No buildable determination is held for this project yet. Commit a plot on the 2D map — '
    + 'the ordinance limits, the massing potential and the per-storey breakdown appear here as '
    + 'soon as one is solved. Nothing is estimated in the meantime.';

/** Shown when the ring itself could not be read. A missing READ, not a missing constraint. */
export const PARCEL_LAW_GEOMETRY_ABSENT_TEXT =
    'Parcel outline unavailable. The figures below were solved against the committed boundary, '
    + 'but this panel could not re-read it, so area, perimeter and footprint / parcel are '
    + 'withheld rather than guessed. This is a missing READ, not a missing constraint.';

/**
 * §ONE-PARCEL-BLOCK (L-13005) — the attribution line under the ring measurements.
 *
 * The merged block carries figures from THREE provenances: what the cadastre publishes
 * (`Area (registry)`), a shoelace over the ring it published (`Area (from ring)`), and these
 * — measured off the ring AS COMMITTED TO THIS PROJECT, in scene metres. Three provenances
 * in one block with only two of them stated would be the C57 §1.9 attribution loss the merge
 * was forbidden to cause, so the line is not decoration and is not optional.
 */
export const PARCEL_LAW_MEASURED_NOTE =
    'Perimeter, bounding box and boundary edges are measured from the ring as committed to '
    + 'this project, in scene metres — not published by the source.';

/**
 * §ONE-PARCEL-BLOCK — the words on the scene-measured area row, on the ONE arm that shows it.
 *
 * ⚠ IT IS A THIRD AREA AND IT IS LABELLED AS ONE. See `parcelRingMeasuredFacts` for when it
 * appears at all — it is withheld precisely when it would restate a number already on the card.
 */
export const PARCEL_LAW_SCENE_AREA_LABEL = 'Area (measured in scene)';

/**
 * §ONE-PARCEL-BLOCK (L-13005) — ⭐ THE MERGE ITSELF: the PARCEL group's figures, projected
 * onto the row shape the ONE card producer typesets, so they land INSIDE the cadastral card
 * instead of in a second block headed PARCEL beside it.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * WHY THIS DIRECTION, AND NOT THE OTHER ONE
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * Founder 2026-09-06, red-boxing the second block: *"the data of the parcel is incorrect
 * format."* Q1 rendered the parcel twice — the labelled card (`Ref · Addr · Area (registry)
 * 801 m² · Area (from ring) 803 m² · Zone pack · Match · Source · Retrieved`), then
 * immediately a right-aligned figure list (`PARCEL / Area 803 m² / Perimeter 115.1 m /
 * Bounding box 25.2 × 34.3 m / Boundary edges 17 (5 street frontage)`). Two headings, two
 * typographies, two alignments, the area in both.
 *
 * The merge had exactly ONE sound direction. `parcelCard.ts` is the ONE producer of the
 * cadastral card and its header states the legal consequence of a second one (*"two GIS
 * surfaces that can disagree about whether a ring is a legal cadastral parcel"*), so
 * re-rendering `Ref / Addr / the two areas / Source / Retrieved` here would have minted
 * exactly that. The measurements travel the other way instead.
 *
 * ⛔ NOTHING IS DELETED BY THE MERGE. Perimeter, bounding box and boundary edges keep their
 * values, their hints and — deliberately — their `parcel-law-fact-*` testids, so no figure
 * loses the handle it had. The `not derived` discipline is unaffected: these four fields are
 * non-null on `ParcelLawGeometry` by construction, and when the ring cannot be read at all
 * there is no geometry, no extras, and the caller states the absence as a sentence instead.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * ⭐ THE AREA ROW — THE ONE JUDGEMENT IN THIS FUNCTION, STATED SO IT IS NOT RE-DECIDED
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * `801` and `803` are DIFFERENT FACTS and collapsing them is a C57 §1.9 / §2.4 attribution
 * loss — that is settled, and the card already carries both, each labelled with its basis.
 * The question this function answers is narrower: the model ALSO measures the committed
 * scene ring, which is a third measurement of (nominally) the same land.
 *
 *   · When it ROUNDS TO THE SAME PRINTED NUMBER as the card's `Area (from ring)`, one row
 *     states both, and a second identical row would be the duplication this lane removed.
 *   · When it PRINTS DIFFERENTLY, both are shown, each labelled with how it was measured —
 *     which is precisely the rule `parcelCard.ts` already applies to registry-vs-ring, one
 *     level further out. A disagreement between the published ring and the committed ring is
 *     information (the ring was re-projected, or edited), never noise to be tidied away.
 *
 * The comparison is on the PRINTED value (`Math.round`, the card's own `m2()` rounding), not
 * on a tolerance somebody chose: two figures that a reader cannot tell apart on screen are one
 * row, and two a reader CAN tell apart are two rows. No arbitrary epsilon is involved.
 *
 * Returns `null` — never an empty-but-present block — when there is no geometry to state.
 */
export function parcelRingMeasuredFacts(model: ParcelLawModel): ParcelSectionExtras | null {
    const geo = model.geometry;
    if (!geo) return null;
    const facts: ParcelCardExtraFact[] = [];

    // The area the CARD prints as its ring row: the provider's shoelace where one was
    // published, else the committed area the card falls back to. `null` means the card prints
    // no ring area at all, in which case the scene measurement is the only one there is.
    const cardRingAreaM2 = model.identity?.areaSigM2 ?? model.committedAreaM2 ?? null;
    const printsDifferently =
        cardRingAreaM2 === null || Math.round(cardRingAreaM2) !== Math.round(geo.areaM2);
    if (printsDifferently) {
        facts.push({
            testId: `${PARCEL_LAW_FACT_PREFIX}parcel-area`,
            label: PARCEL_LAW_SCENE_AREA_LABEL,
            value: `${Math.round(geo.areaM2).toLocaleString()} m²`,
            hint:
                cardRingAreaM2 === null
                    ? 'Measured from the ring as committed to this project. The source published '
                      + 'no area of its own for this parcel.'
                    : 'Measured from the ring as committed to this project, which prints '
                      + 'differently from the area computed over the ring the source published. '
                      + 'Both are shown — the disagreement is information, not noise.',
        });
    }

    facts.push({
        testId: `${PARCEL_LAW_FACT_PREFIX}parcel-perimeter`,
        label: 'Perimeter',
        value: `${geo.perimeterM.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} m`,
    });
    facts.push({
        testId: `${PARCEL_LAW_FACT_PREFIX}parcel-bbox`,
        label: 'Bounding box',
        value: `${geo.bboxWidthM.toFixed(1)} × ${geo.bboxDepthM.toFixed(1)} m`,
        hint:
            'Axis-aligned extent. A non-rectangular parcel has no single width × depth, '
            + 'so this is deliberately labelled a bounding box.',
    });
    facts.push({
        testId: `${PARCEL_LAW_FACT_PREFIX}parcel-edges`,
        label: 'Boundary edges',
        value: `${geo.edgeCount}${geo.frontageClause}`,
        hint:
            'Street frontage is the edge buildable depth insets FROM. "Not recorded" means '
            + 'nobody classified the edges of this parcel — it is NOT a finding that the plot '
            + 'has none.',
    });

    return { facts, note: PARCEL_LAW_MEASURED_NOTE };
}

/**
 * ⭐ §LAW-ROW-BASIS (L-13018 · C58 §1.4 · C57 §1.9) — THE THIRD REPORT OF ONE SHAPE, FIXED AS A
 * CLASS RATHER THAN AS A BLOCK.
 *
 * Founder 2026-09-06 on the ordinance / massing / per-storey / capacity stack: *"this data is
 * still not well formatted."* — after L-13005 and L-13009 said the same thing about two other
 * blocks. His diagnosis is the specification, and it is not about density:
 *
 *   *"every row has the same visual weight, so `Max height 22.4 m` (a hard legal ceiling) reads
 *   exactly like `Footprint perimeter 85.7 m` (a derived convenience), and the six PER STOREY
 *   rows repeat `452 m²` six times without conveying that they are an EQUAL DIVISION rather than
 *   six measured facts — the caption says so in small grey text under them, which is the right
 *   words in the wrong weight."*
 *
 * ⛔ SO THIS IS A TYPOGRAPHY PROBLEM WITH A PROVENANCE CAUSE, AND ONLY THE PROVENANCE FIX IS
 * DURABLE. Every figure on this tab already knows what KIND of claim it is — the module that
 * produced it knew whether it read a number off an ordinance, computed one, or divided one
 * evenly. That knowledge was simply never carried to the renderer, so the renderer drew all
 * three alike. `FactBasis` carries it, and the weight is DERIVED from it, which is what stops
 * the next row someone adds from silently defaulting to "looks legal".
 *
 * ⛔ NOTHING IS DELETED AND NOTHING IS COLLAPSED — the founder forbade both by name. `not derived`
 * stays visible on Max FAR and Max site coverage (C58 §1.4: unknown ≠ zero), and all six
 * per-storey rows stay listed, because the repetition is what makes the equal-division
 * assumption CHECKABLE. What changes is that the assumption is stated at the WEIGHT of a
 * governing fact instead of as a caption under the rows it governs.
 */
export type FactBasis =
    /** Read off the governing document. A hard limit; the reader may not exceed it. */
    | 'ceiling'
    /** Computed by PRYZM from a ceiling and this parcel's geometry. True, and consequential. */
    | 'derived'
    /** Rests on an assumption PRYZM made and states — an equal division, a module size. */
    | 'assumed';

/** Attribute carrying the basis onto every row and group, so it is addressable, not inferred. */
export const PARCEL_LAW_BASIS_ATTR = 'data-basis';

/**
 * The badge a GROUP wears, in the reader's words rather than the type's.
 *
 * ⚠ On the group, never on every row. Six rows each wearing "ASSUMED" is the undifferentiated
 * density this lane was asked to remove, in a new costume; the group states the basis once and
 * the rows inside inherit it. A row whose basis DIFFERS from its group's is the exception, and
 * that is exactly when a per-row marker earns its place.
 */
export const PARCEL_LAW_BASIS_BADGE: Readonly<Record<FactBasis, string>> = Object.freeze({
    ceiling: 'legal ceiling',
    derived: 'derived by PRYZM',
    assumed: 'assumed',
});

/** What each badge MEANS, on hover, so the vocabulary teaches itself. */
export const PARCEL_LAW_BASIS_TITLE: Readonly<Record<FactBasis, string>> = Object.freeze({
    ceiling:
        'Read off the governing ordinance. A hard limit — a design may not exceed it, and PRYZM '
        + 'did not compute it.',
    derived:
        'Computed by PRYZM from the ceilings above and the geometry of this parcel. True of this '
        + 'plot, but not itself a legal limit.',
    assumed:
        'Rests on an assumption PRYZM made and states in the open — an equal division, a module '
        + 'size. Change the assumption and this figure changes with it.',
});

/**
 * §LAW-ROW-BASIS — the equal-division sentence, promoted from a caption UNDER the six rows to a
 * lede ABOVE them.
 *
 * ⛔ THE WORDS WERE ALREADY RIGHT; THE PLACEMENT AND THE WEIGHT WERE NOT. A reader who has taken
 * `452 m² · 452 m² · 452 m² · 452 m² · 452 m² · 452 m²` as six measured facts has already
 * misread the block by the time they reach a 9.5px grey line beneath it. It is the governing
 * statement of the group, so it goes first, at the weight of one.
 */
export const PARCEL_LAW_EQUAL_DIVISION_LEDE =
    'One plate, divided equally. These are the SAME footprint repeated once per storey — an '
    + 'assumption for study, not six measurements and not a regulated storey height.';

/** The lede. Says where these numbers come from, because that is the tab's whole claim. */
export const PARCEL_LAW_FACTS_NOTE =
    'The same parcel, ordinance and massing model the PARCEL rail panel renders — one source, '
    + 'two surfaces. Shown here as well as on the card so the figures stay on this tab when the '
    + 'card is claimed by another panel.';

// ── DOM helpers. `textContent` only; no interpolation into markup anywhere in this file. ──

function el<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    cls: string,
    text?: string,
): HTMLElementTagNameMap[K] {
    const n = document.createElement(tag);
    n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
}

/** One label/value row. `key` becomes the testid; `hint` becomes the label's title. */
function fact(
    key: string,
    label: string,
    value: string,
    opts?: { readonly hint?: string; readonly derived?: boolean; readonly basis?: FactBasis },
): HTMLDivElement {
    const row = el('div', 'anl-plaw-row');
    row.setAttribute('data-testid', `${PARCEL_LAW_FACT_PREFIX}${key}`);
    // §LAW-ROW-BASIS (L-13018) — the basis is on the ROW, so a reader, a spec and a future
    // stylesheet all address the same fact rather than three copies of a judgement.
    const basis: FactBasis = opts?.basis ?? 'derived';
    row.setAttribute(PARCEL_LAW_BASIS_ATTR, basis);
    row.style.display = 'flex';
    row.style.justifyContent = 'space-between';
    row.style.gap = '10px';
    // A ceiling gets AIR as well as weight. Six rows at one rhythm read as one list however
    // the type is set; the legal rows are the ones a reader must be able to find without
    // reading, so they are the ones given room.
    row.style.padding = basis === 'ceiling' ? '4px 0' : '2.5px 0';
    const k = el('span', 'anl-plaw-key', label);
    if (opts?.hint) k.title = opts.hint;
    // ⛔ NO COLOUR LITERAL — the separation is WEIGHT and OPACITY against the host's own text
    // colour, so it survives the panel's theme and the §UI-DENSITY-SCALE transform alike. A hex
    // here would be C84 EI-8 and would also have to be maintained per surface.
    k.style.opacity = basis === 'ceiling' ? '1' : '0.72';
    if (basis === 'ceiling') k.style.fontWeight = '600';
    const v = el('span', 'anl-plaw-val', value);
    v.style.fontWeight = basis === 'ceiling' ? '750' : basis === 'derived' ? '600' : '500';
    if (basis === 'ceiling') v.style.fontSize = '11.5px';
    v.style.textAlign = 'right';
    if (opts?.derived === false) {
        v.style.fontStyle = 'italic';
        v.title = NOT_DERIVED_TITLE;
        row.setAttribute('data-derived', 'false');
        // ⛔ AN UNKNOWN CEILING IS STILL A CEILING, AND IT MUST NOT SHRINK. `not derived` on Max
        // FAR is a C58 §1.4 honesty value the founder named and forbade removing; de-weighting
        // it would hide it just as effectively as deleting it, one step more deniably. It keeps
        // the row's air and loses only the numeric weight it has no number to carry.
        v.style.fontWeight = '500';
        v.style.fontSize = '';
    } else {
        row.setAttribute('data-derived', 'true');
    }
    row.appendChild(k);
    row.appendChild(v);
    return row;
}

/** A numeric row that renders `not derived` — never 0, never blank — when the value is null. */
function numFact(
    key: string,
    label: string,
    value: number | null,
    unit: string,
    dp: number,
    hint?: string,
    basis: FactBasis = 'derived',
): HTMLDivElement {
    if (value === null) return fact(key, label, NOT_DERIVED_TEXT, { hint, derived: false, basis });
    const n = value.toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp });
    return fact(key, label, unit ? `${n} ${unit}` : n, { hint, basis });
}

/**
 * §LAW-ROW-BASIS (L-13018) — a titled block whose HEADING states what kind of claim the rows
 * inside are, and whose optional LEDE states a governing assumption BEFORE the figures it
 * governs rather than as a caption after them.
 *
 * ⛔ THE SOURCE LINE STAYS EXACTLY WHERE IT IS. `.anl-plaw-group-source` is a live confidence
 * PROBE for question 2 (`parcelLawQuestionGroup.ts` — `confidenceProbes`), so moving it or
 * renaming it would silently blank the collapsed summary's confidence, which is the C58 §1.2
 * failure a disclosure must never cause. The badge and the lede are ADDED beside it.
 */
function group(
    title: string,
    source: string,
    opts?: { readonly basis?: FactBasis; readonly lede?: string },
): { root: HTMLDivElement; body: HTMLDivElement } {
    const root = el('div', 'anl-plaw-group');
    root.style.marginTop = '9px';
    const basis = opts?.basis ?? null;
    if (basis) root.setAttribute(PARCEL_LAW_BASIS_ATTR, basis);
    const h = el('div', 'anl-plaw-group-title');
    h.style.display = 'flex';
    h.style.alignItems = 'baseline';
    h.style.justifyContent = 'space-between';
    h.style.gap = '8px';
    h.style.fontWeight = '700';
    h.style.fontSize = '10px';
    h.style.letterSpacing = '.04em';
    h.style.textTransform = 'uppercase';
    h.appendChild(el('span', 'anl-plaw-group-name', title));
    if (basis) {
        // The badge earns its place by being the ONE thing that differs between four blocks a
        // reader currently cannot tell apart, so it is set apart from the title rather than
        // appended to it — a title reading `PER STOREY ASSUMED` is one phrase, not two facts.
        const badge = el('span', 'anl-plaw-group-basis', PARCEL_LAW_BASIS_BADGE[basis]);
        badge.setAttribute('data-testid', `parcel-law-basis-${basis}`);
        badge.title = PARCEL_LAW_BASIS_TITLE[basis];
        badge.style.fontWeight = basis === 'ceiling' ? '700' : '600';
        badge.style.fontSize = '8.5px';
        badge.style.letterSpacing = '.08em';
        badge.style.opacity = basis === 'ceiling' ? '0.9' : '0.6';
        badge.style.whiteSpace = 'nowrap';
        h.appendChild(badge);
    }
    root.appendChild(h);
    const body = el('div', 'anl-plaw-group-body');
    if (opts?.lede) {
        // ⭐ ABOVE the rows, at reading weight. See `PARCEL_LAW_EQUAL_DIVISION_LEDE`: the founder's
        // report is precisely that the right words were in the wrong weight and the wrong place.
        const lede = el('div', 'anl-plaw-group-lede', opts.lede);
        lede.setAttribute('data-testid', 'parcel-law-group-lede');
        lede.style.fontSize = '10px';
        lede.style.lineHeight = '1.45';
        lede.style.margin = '2px 0 5px';
        lede.style.opacity = '0.85';
        body.appendChild(lede);
    }
    root.appendChild(body);
    const s = el('div', 'anl-plaw-group-source', source);
    s.style.fontSize = '9.5px';
    s.style.marginTop = '3px';
    s.style.opacity = '0.7';
    root.appendChild(s);
    return { root, body };
}

function storeyRow(st: ParcelLawStorey): HTMLDivElement {
    const row = el('div', 'anl-plaw-storey');
    row.setAttribute('data-testid', `parcel-law-storey-${st.index}`);
    // §LAW-ROW-BASIS (L-13018) — every storey row is an ASSUMPTION (one plate divided equally),
    // and it says so in the attribute as well as in the group's lede. ⛔ The list is NOT
    // collapsed: the founder forbade that by name, because the repetition is what lets a reader
    // check the equal division instead of taking it on trust.
    row.setAttribute(PARCEL_LAW_BASIS_ATTR, 'assumed');
    row.style.display = 'flex';
    row.style.justifyContent = 'space-between';
    row.style.gap = '8px';
    row.style.padding = '1.5px 0';
    const key = el('span', 'anl-plaw-key', st.label);
    key.style.opacity = '0.72';
    row.appendChild(key);
    // ⚠ A null band is a DASH here and the group's source line says WHY (no max height was
    // derived), rather than a fabricated floor-to-floor. The two must be read together.
    const band = st.bandFromM !== null && st.bandToM !== null
        ? `${st.bandFromM.toFixed(1)}–${st.bandToM.toFixed(1)} m`
        : '—';
    const b = el('span', 'anl-plaw-band', band);
    b.style.opacity = '0.75';
    row.appendChild(b);
    const a = el('span', 'anl-plaw-val', `${Math.round(st.areaM2).toLocaleString()} m²`);
    // The repeated figure is the LEAST informative thing in the row — it is the same plate six
    // times — so it does not carry the weight of a measurement. The BAND is what differs storey
    // to storey, and the group's lede is what governs both.
    a.style.fontWeight = '500';
    a.style.opacity = '0.85';
    row.appendChild(a);
    return row;
}

/**
 * §PARCEL-LAW-MODEL — render the model as the tab's fact section.
 *
 * Total over the model: every absence has a sentence, so this function returns an element
 * with content for every state a project can be in — including the two that are the common
 * ones (no plot committed, and a plot whose zone PRYZM has not encoded).
 */
export function buildParcelLawFacts(
    model: ParcelLawModel,
    opts?: ParcelLawFactsOptions,
): HTMLElement {
    const span = _tracer.startSpan('pryzm.analysis.buildParcelLawFacts');
    // §PL-IA-Q (STR §26.3) — WHICH HALF OF THE MODEL THIS RENDERING SHOWS. Defaulting to `all`
    // is not politeness: it is what makes this an ADDITIVE change to a producer three surfaces
    // read. Every existing caller keeps the flat section it had, datum for datum.
    const scope: ParcelLawFactsScope = opts?.scope ?? 'all';
    const wantPlot = scope !== 'law';
    const wantLaw = scope !== 'plot';
    const root = el('div', 'anl-plaw-facts');
    root.setAttribute('data-testid', PARCEL_LAW_FACTS_TESTID);
    root.setAttribute('data-envelope-state', model.envelopeState);
    root.setAttribute('data-identity-absence', model.identityAbsence);
    root.setAttribute(PARCEL_LAW_FACTS_SCOPE_ATTR, scope);
    try {
        if (wantLaw) {
            const note = el('p', 'anl-plaw-note', PARCEL_LAW_FACTS_NOTE);
            note.style.margin = '0 0 6px';
            note.style.fontSize = '10.5px';
            note.style.opacity = '0.8';
            root.appendChild(note);
        }

        // ── The stored-determination date. A dated snapshot presented as freshly derived
        //    would fabricate recency, which is provenance (C58 §1.4). ─────────────────────
        if (wantLaw && model.determinedAtIso) {
            const d = el(
                'div',
                'anl-plaw-determined-at',
                `Stored determination — solved ${model.determinedAtIso}. Nothing has been re-derived to show it.`,
            );
            d.setAttribute('data-testid', PARCEL_LAW_DETERMINED_AT_TESTID);
            d.style.fontSize = '10px';
            d.style.opacity = '0.75';
            root.appendChild(d);
        }

        // ── PARCEL ────────────────────────────────────────────────────────────────────────
        //
        // ⭐ §ONE-PARCEL-BLOCK (L-13005) — IN `plot` SCOPE THIS GROUP NO LONGER RENDERS ITS
        // ROWS, AND THAT IS THE FOUNDER'S DECISION, NOT AN OMISSION.
        //
        // `plot` is the Parcel Law tab's question-1 rendering, and question 1 already hosts the
        // cadastral card. Rendering `Area / Perimeter / Bounding box / Boundary edges` here as
        // well produced the two blocks he red-boxed: two headings, two typographies, two
        // alignments, the area in both. The figures did not disappear — they are handed to the
        // card by `parcelRingMeasuredFacts` above and typeset in ITS rows, which is what makes
        // "one block, one typography" true by construction rather than by review.
        //
        // ⛔ THE ABSENCE SENTENCE STILL RENDERS HERE, on every scope. A card cannot state a
        // missing READ in a fact row — that is what the sentence is for (C58 §1.4 / L-616), and
        // `parcelLawFacts.spec.ts` pins it to question 1's slot. When the ring cannot be read
        // there are no extras to hand the card, so this is the only surface that says so.
        //
        // `all` is UNCHANGED and still renders the historic flat section, rows included: it is
        // the rendering a host with no card beside it gets, and collapsing it into `plot` would
        // silently drop four figures for such a host.
        const mergedIntoCard = scope === 'plot' && model.geometry !== null;
        const g0 = group(
            'Parcel',
            'Cadastral boundary as committed to this project, measured in scene metres.',
            { basis: 'derived' },
        );
        if (!wantPlot || mergedIntoCard) {
            // Nothing to build here — in `law` scope the plot half is rendered by the caller's
            // question 1 group; in `plot` scope the rows are on the card. Fall through.
        } else if (model.geometry) {
            const geo = model.geometry;
            g0.body.appendChild(numFact('parcel-area', 'Area', geo.areaM2, 'm²', 0));
            g0.body.appendChild(numFact('parcel-perimeter', 'Perimeter', geo.perimeterM, 'm', 1));
            g0.body.appendChild(fact(
                'parcel-bbox',
                'Bounding box',
                `${geo.bboxWidthM.toFixed(1)} × ${geo.bboxDepthM.toFixed(1)} m`,
                {
                    hint:
                        'Axis-aligned extent. A non-rectangular parcel has no single width × depth, '
                        + 'so this is deliberately labelled a bounding box.',
                },
            ));
            g0.body.appendChild(fact(
                'parcel-edges',
                'Boundary edges',
                `${geo.edgeCount}${geo.frontageClause}`,
                {
                    hint:
                        'Street frontage is the edge buildable depth insets FROM. "Not recorded" means '
                        + 'nobody classified this parcel\'s edges — it is NOT a finding that the plot has none.',
                },
            ));
        } else {
            const miss = el('div', 'anl-plaw-absent', PARCEL_LAW_GEOMETRY_ABSENT_TEXT);
            miss.setAttribute('data-testid', PARCEL_LAW_GEOMETRY_ABSENT_TESTID);
            miss.setAttribute('data-absence', model.geometryAbsence ?? 'ring-unreadable');
            miss.style.fontSize = '10px';
            miss.style.lineHeight = '1.5';
            g0.body.appendChild(miss);
        }
        if (wantPlot && !mergedIntoCard) root.appendChild(g0.root);
        if (mergedIntoCard) root.setAttribute(PARCEL_LAW_MERGED_ATTR, 'card');

        // ── The refusal / absence arms. A refusal has no numeric rows BY DESIGN (§L-550):
        //    three dashes would read as "not filled in yet", which is the ambiguity the
        //    refusal card exists to remove. ────────────────────────────────────────────────
        if (wantLaw && model.envelopeState === 'refused' && model.refusal) {
            const r = model.refusal;
            const box = el('div', 'anl-plaw-refusal');
            box.setAttribute('data-testid', PARCEL_LAW_REFUSAL_TESTID);
            box.setAttribute('data-refusal-code', r.code);
            box.setAttribute('data-legally-grounded', String(r.legallyGrounded));
            box.style.marginTop = '9px';
            box.style.fontSize = '10.5px';
            box.style.lineHeight = '1.5';
            const head = el('div', 'anl-plaw-refusal-headline', r.headline);
            head.style.fontWeight = '600';
            box.appendChild(head);
            box.appendChild(el('div', 'anl-plaw-refusal-detail', r.detail));
            for (const f of r.knownFacts) {
                box.appendChild(el('div', 'anl-plaw-refusal-fact', f));
            }
            // A coverage gap has NO ordinance citation by design — citing one would be an
            // authoritative-looking reference for a claim the document does not make (L-526).
            if (r.ordinanceRef) {
                box.appendChild(el('div', 'anl-plaw-refusal-cite', r.ordinanceRef));
            }
            root.appendChild(box);
            return root;
        }
        if (wantLaw && model.envelopeState === 'absent') {
            const miss = el('div', 'anl-plaw-absent', PARCEL_LAW_ENVELOPE_ABSENT_TEXT);
            miss.setAttribute('data-testid', PARCEL_LAW_ENVELOPE_ABSENT_TESTID);
            miss.style.marginTop = '9px';
            miss.style.fontSize = '10.5px';
            miss.style.lineHeight = '1.5';
            root.appendChild(miss);
            return root;
        }

        // ── ORDINANCE LIMITS ──────────────────────────────────────────────────────────────
        const ord = model.ordinance;
        if (wantLaw && ord) {
            // §LAW-ROW-BASIS (L-13018) — the ONLY block on this tab whose figures are LAW.
            // Founder: *"`Max height 22.4 m` (a hard legal ceiling) reads exactly like
            // `Footprint perimeter 85.7 m` (a derived convenience)"*. Every row below is read off
            // the governing document; none of them is computed here. That is what the badge says,
            // and what the extra weight and air are for.
            const g1 = group(
                'Ordinance limits',
                ord.citation
                    ? `Zone ${ord.zoneCode ?? 'n/a'} · ${ord.citation}`
                    : `Zone ${ord.zoneCode ?? 'n/a'} · citation held per row on the card's "Why these numbers?"`,
                { basis: 'ceiling' },
            );
            // An ALIGNMENT zone has null setbacks/height/FAR BY DESIGN — the depth IS the rule
            // (§L-518c). Surfacing the depth first is what stops the section reading as "empty".
            if (ord.buildableDepthM !== null) {
                g1.body.appendChild(numFact(
                    'buildable-depth', 'Buildable depth', ord.buildableDepthM, 'm', 1,
                    ord.depthIsBlockGranular
                        ? 'Block-granularity: the ordinance derives this from the whole block, so '
                          + 'neighbouring parcels on it share the figure.'
                        : 'Parcel-granularity: the ordinance states this depth directly for the zone.',
                    'ceiling',
                ));
                g1.body.appendChild(numFact(
                    'alignment-offset', 'Alignment offset', ord.alignmentOffsetM, 'm', 1,
                    undefined, 'ceiling',
                ));
            } else {
                g1.body.appendChild(numFact('setback-front', 'Setback (front)', ord.setbackFrontM, 'm', 1, undefined, 'ceiling'));
                g1.body.appendChild(numFact('setback-side', 'Setback (side)', ord.setbackSideM, 'm', 1, undefined, 'ceiling'));
                g1.body.appendChild(numFact('setback-rear', 'Setback (rear)', ord.setbackRearM, 'm', 1, undefined, 'ceiling'));
            }
            g1.body.appendChild(numFact('max-height', 'Max height', ord.maxHeightM, 'm', 1, undefined, 'ceiling'));
            g1.body.appendChild(fact(
                'storeys',
                'Storeys',
                ord.maxFloors !== null ? String(ord.maxFloors) : NOT_DERIVED_TEXT,
                {
                    hint:
                        'Shown only when the rule pack derived it. We do NOT back-compute storeys '
                        + 'from height ÷ a floor-to-floor guess.',
                    derived: ord.maxFloors !== null,
                    basis: 'ceiling',
                },
            ));
            g1.body.appendChild(numFact('max-far', 'Max FAR', ord.maxFAR, '', 2, undefined, 'ceiling'));
            g1.body.appendChild(numFact('max-coverage', 'Max site coverage', ord.maxCoveragePct, '%', 0, undefined, 'ceiling'));
            root.appendChild(g1.root);
        }

        // ── MASSING POTENTIAL ─────────────────────────────────────────────────────────────
        const mass = model.massing;
        if (wantLaw && mass) {
            const g2 = group(
                'Massing potential',
                mass.footprintIsUpperBound
                    ? 'Footprint = the whole parcel because this ordinance publishes no setbacks — a '
                      + 'MAXIMUM extent, not a solved buildable area. A real building will be smaller.'
                    : 'Computed from the inset footprint this determination solved. A STUDY, not a permit.',
                { basis: 'derived' },
            );
            g2.body.appendChild(numFact('footprint', 'Buildable footprint', mass.footprintM2, 'm²', 0));
            g2.body.appendChild(numFact('coverage', 'Footprint / parcel', mass.coveragePct, '%', 0));
            g2.body.appendChild(numFact(
                'footprint-perimeter', 'Footprint perimeter', mass.footprintPerimeterM, 'm', 1,
            ));
            g2.body.appendChild(numFact(
                'gfa', 'Max buildable area (GFA)', mass.gfaM2, 'm²', 0,
                'Footprint × storeys. Deliberately withheld when the storey count was not derived — '
                + 'a guessed storey count would become a guessed sellable area.',
            ));
            g2.body.appendChild(numFact(
                'study-volume', 'Study volume', mass.studyVolumeM3, 'm³', 0,
                'Footprint × max height. A massing study volume, not a permitted volume.',
            ));
            root.appendChild(g2.root);
        }

        // ── PER STOREY ────────────────────────────────────────────────────────────────────
        const ps = model.perStorey;
        if (wantLaw && ps) {
            // §LAW-ROW-BASIS (L-13018) — the SECOND half of the founder's report, verbatim:
            // *"the six PER STOREY rows repeat `452 m²` six times without conveying that they are
            // an EQUAL DIVISION rather than six measured facts — the caption says so in small
            // grey text under them, which is the right words in the wrong weight."*
            //
            // ⛔ NOT FIXED BY COLLAPSING THE LIST — he forbade that in the same breath, and he is
            // right: six printed rows are what let a reader CHECK the division. Fixed by moving
            // the statement in front of the figures it governs, at the weight of one, and by
            // marking the whole group `assumed` so it cannot be read as measurement.
            const g3 = group(
                'Per storey',
                ps.floorToFloorM !== null
                    ? 'Even floor-to-floor from max height ÷ storeys — an EQUAL DIVISION for study, '
                      + 'not a regulated storey height.'
                    : 'No max height derived, so no vertical band is shown rather than an invented one.',
                { basis: 'assumed', lede: PARCEL_LAW_EQUAL_DIVISION_LEDE },
            );
            for (const st of ps.storeys) g3.body.appendChild(storeyRow(st));
            if (ps.truncatedCount > 0) {
                const t = el(
                    'div',
                    'anl-plaw-truncated',
                    `…${ps.truncatedCount} further storeys not listed.`,
                );
                t.style.fontSize = '9.5px';
                t.style.opacity = '0.7';
                g3.body.appendChild(t);
            }
            root.appendChild(g3.root);
        }

        // ── CAPACITY — §L-588/§L-590. A SEPARATE legal question from the geometry above. ──
        const cap = model.capacity;
        if (wantLaw && cap) {
            const g4 = group(
                'Capacity',
                'A SEPARATE legal question from the envelope above — the geometry is complete, and '
                + 'this is not a defect in it.',
                { basis: 'assumed' },
            );
            g4.body.appendChild(fact('dwelling-module', 'Dwelling module', `${cap.moduleM2} m² per dwelling`));
            g4.body.appendChild(fact(
                'max-dwellings',
                'Max dwellings',
                cap.maxDwellings !== null ? `≈ ${cap.maxDwellings}` : NOT_DERIVED_TEXT,
                {
                    hint:
                        'Computed from the envelope GFA above, which APPROXIMATES the ordinance\'s '
                        + 'built-area definition rather than equalling it — an indication, not a '
                        + 'determination.',
                    derived: cap.maxDwellings !== null,
                },
            ));
            g4.body.appendChild(fact('capacity-source', 'Source', cap.citation));
            root.appendChild(g4.root);
        }

        span.setAttribute('pryzm.parcelLaw.facts.rows', root.querySelectorAll(`[data-testid^="${PARCEL_LAW_FACT_PREFIX}"]`).length);
    } catch (e) {
        console.warn('[analysis][parcel-law] facts render failed (non-fatal):', e);
    } finally {
        span.end();
    }
    return root;
}
