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
    opts?: { readonly hint?: string; readonly derived?: boolean },
): HTMLDivElement {
    const row = el('div', 'anl-plaw-row');
    row.setAttribute('data-testid', `${PARCEL_LAW_FACT_PREFIX}${key}`);
    row.style.display = 'flex';
    row.style.justifyContent = 'space-between';
    row.style.gap = '10px';
    row.style.padding = '2.5px 0';
    const k = el('span', 'anl-plaw-key', label);
    if (opts?.hint) k.title = opts.hint;
    const v = el('span', 'anl-plaw-val', value);
    v.style.fontWeight = '600';
    v.style.textAlign = 'right';
    if (opts?.derived === false) {
        v.style.fontStyle = 'italic';
        v.title = NOT_DERIVED_TITLE;
        row.setAttribute('data-derived', 'false');
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
): HTMLDivElement {
    if (value === null) return fact(key, label, NOT_DERIVED_TEXT, { hint, derived: false });
    const n = value.toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp });
    return fact(key, label, unit ? `${n} ${unit}` : n, { hint });
}

function group(title: string, source: string): { root: HTMLDivElement; body: HTMLDivElement } {
    const root = el('div', 'anl-plaw-group');
    root.style.marginTop = '9px';
    const h = el('div', 'anl-plaw-group-title', title);
    h.style.fontWeight = '700';
    h.style.fontSize = '10px';
    h.style.letterSpacing = '.04em';
    h.style.textTransform = 'uppercase';
    root.appendChild(h);
    const body = el('div', 'anl-plaw-group-body');
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
    row.style.display = 'flex';
    row.style.justifyContent = 'space-between';
    row.style.gap = '8px';
    row.style.padding = '1.5px 0';
    row.appendChild(el('span', 'anl-plaw-key', st.label));
    // ⚠ A null band is a DASH here and the group's source line says WHY (no max height was
    // derived), rather than a fabricated floor-to-floor. The two must be read together.
    const band = st.bandFromM !== null && st.bandToM !== null
        ? `${st.bandFromM.toFixed(1)}–${st.bandToM.toFixed(1)} m`
        : '—';
    const b = el('span', 'anl-plaw-band', band);
    b.style.opacity = '0.75';
    row.appendChild(b);
    const a = el('span', 'anl-plaw-val', `${Math.round(st.areaM2).toLocaleString()} m²`);
    a.style.fontWeight = '600';
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
export function buildParcelLawFacts(model: ParcelLawModel): HTMLElement {
    const span = _tracer.startSpan('pryzm.analysis.buildParcelLawFacts');
    const root = el('div', 'anl-plaw-facts');
    root.setAttribute('data-testid', PARCEL_LAW_FACTS_TESTID);
    root.setAttribute('data-envelope-state', model.envelopeState);
    root.setAttribute('data-identity-absence', model.identityAbsence);
    try {
        const note = el('p', 'anl-plaw-note', PARCEL_LAW_FACTS_NOTE);
        note.style.margin = '0 0 6px';
        note.style.fontSize = '10.5px';
        note.style.opacity = '0.8';
        root.appendChild(note);

        // ── The stored-determination date. A dated snapshot presented as freshly derived
        //    would fabricate recency, which is provenance (C58 §1.4). ─────────────────────
        if (model.determinedAtIso) {
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
        const g0 = group(
            'Parcel',
            'Cadastral boundary as committed to this project, measured in scene metres.',
        );
        if (model.geometry) {
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
        root.appendChild(g0.root);

        // ── The refusal / absence arms. A refusal has no numeric rows BY DESIGN (§L-550):
        //    three dashes would read as "not filled in yet", which is the ambiguity the
        //    refusal card exists to remove. ────────────────────────────────────────────────
        if (model.envelopeState === 'refused' && model.refusal) {
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
        if (model.envelopeState === 'absent') {
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
        if (ord) {
            const g1 = group(
                'Ordinance limits',
                ord.citation
                    ? `Zone ${ord.zoneCode ?? 'n/a'} · ${ord.citation}`
                    : `Zone ${ord.zoneCode ?? 'n/a'} · citation held per row on the card's "Why these numbers?"`,
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
                ));
                g1.body.appendChild(numFact(
                    'alignment-offset', 'Alignment offset', ord.alignmentOffsetM, 'm', 1,
                ));
            } else {
                g1.body.appendChild(numFact('setback-front', 'Setback (front)', ord.setbackFrontM, 'm', 1));
                g1.body.appendChild(numFact('setback-side', 'Setback (side)', ord.setbackSideM, 'm', 1));
                g1.body.appendChild(numFact('setback-rear', 'Setback (rear)', ord.setbackRearM, 'm', 1));
            }
            g1.body.appendChild(numFact('max-height', 'Max height', ord.maxHeightM, 'm', 1));
            g1.body.appendChild(fact(
                'storeys',
                'Storeys',
                ord.maxFloors !== null ? String(ord.maxFloors) : NOT_DERIVED_TEXT,
                {
                    hint:
                        'Shown only when the rule pack derived it. We do NOT back-compute storeys '
                        + 'from height ÷ a floor-to-floor guess.',
                    derived: ord.maxFloors !== null,
                },
            ));
            g1.body.appendChild(numFact('max-far', 'Max FAR', ord.maxFAR, '', 2));
            g1.body.appendChild(numFact('max-coverage', 'Max site coverage', ord.maxCoveragePct, '%', 0));
            root.appendChild(g1.root);
        }

        // ── MASSING POTENTIAL ─────────────────────────────────────────────────────────────
        const mass = model.massing;
        if (mass) {
            const g2 = group(
                'Massing potential',
                mass.footprintIsUpperBound
                    ? 'Footprint = the whole parcel because this ordinance publishes no setbacks — a '
                      + 'MAXIMUM extent, not a solved buildable area. A real building will be smaller.'
                    : 'Computed from the inset footprint this determination solved. A STUDY, not a permit.',
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
        if (ps) {
            const g3 = group(
                'Per storey',
                ps.floorToFloorM !== null
                    ? 'Even floor-to-floor from max height ÷ storeys — an EQUAL DIVISION for study, '
                      + 'not a regulated storey height.'
                    : 'No max height derived, so no vertical band is shown rather than an invented one.',
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
        if (cap) {
            const g4 = group(
                'Capacity',
                'A SEPARATE legal question from the envelope above — the geometry is complete, and '
                + 'this is not a defect in it.',
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
