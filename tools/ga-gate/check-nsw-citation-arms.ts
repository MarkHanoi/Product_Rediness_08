#!/usr/bin/env npx tsx
/**
 * @file tools/ga-gate/check-nsw-citation-arms.ts
 *
 * GA Gate — **NSW §1.2 / §13: "no value without a clause citation", DECOMPOSED.**
 * Lane ENVELOPE-NSW, 2026-09-04. Decision memo:
 * `docs/04-reference/jurisdictions/au/nsw/NSW-CITATION-DECISION.md`.
 *
 * ── WHY THIS GATE IS NOT THE ONE THE BRIEF ASKED FOR ─────────────────────────
 * `NSW-ENVELOPE-BUILD-PROMPT.md` §13 asks for CI asserting *"no value without a clause
 * citation"*, on the §1.2 premise that the layers serve `LEGIS_REF_CLAUSE`. **Measured live, that
 * premise is false for the layers that matter:** 94.8% populated on Principal/14 Height of
 * Buildings, and **0.0% on TEN of the twelve vertical overlay layers** — the overlays that COMPETE
 * with the base, i.e. exactly what precedence needs
 * (`docs/04-reference/jurisdictions/au/nsw/phase0-transcripts/PHASE0-REPORT.md` §M1.3).
 *
 * Read literally, that assertion is **unsatisfiable**: no amount of engineering populates a field
 * the government does not fill, so the gate could never go green and would become a red light
 * everyone learns to walk past. §UNSATISFIABLE-GATE-DECOMPOSITION-IS-THE-FIX (L-716) says the
 * remedy for an unsatisfiable gate is to DECOMPOSE it — never to relax it, and never to leave it
 * permanently red. Three arms:
 *
 *   ARM A — LEGAL ADDRESS · hard-0. Every emitted `RuleState` carries a `RuleSourceRef` with
 *           `country`/`authority`/`dataset` populated, **including every refusal** (C58 §1.3: a
 *           refusal with no citation is an unsourced claim about the law).
 *   ARM B — CITATION STATE · hard-0. Citation is a CLOSED ENUM, and **no control in state
 *           `absent` may contribute a number.** Survivable on day one because the citation gap
 *           and the ROLE gap are the same gap: an uncited overlay has no registry ruling, so its
 *           role is UNRESOLVED and it was already unapplied. This arm makes an EMERGENT property
 *           CHECKABLE — the difference between an invariant and a coincidence.
 *   ARM C — UNCITED COUNT · shrink-only ratchet. The number the founder wants at 0. It falls only
 *           when SIGNED clause-registry rows are added; no code change moves it.
 *           ⛔ §RATCHET-EXCEEDED-IS-NEVER-DEBT (R7 / L-836): a breach is fixed by CITING the
 *           control. Never by raising `ARM_C_CEILING`, never by a `gate-debt.json` line.
 *
 * ── ARM D — L-616, the half that could have gone wrong silently ──────────────
 * Refusing to apply an uncited CAP **overstates** the envelope: an UNKNOWN constraint rendered as
 * absent is an overstatement on real land. So Arm B alone is only half a correct answer, and
 * ARM D asserts the other half — a resolution carrying an unapplied top-constraint must set
 * `envelopeIsUpperBound` and must NOT be `publishable`.
 *
 * ── TEETH (why a green run means something) ──────────────────────────────────
 * Three tampers, run on every invocation. Each takes an HONEST resolution, forces it into the
 * shape the corresponding defect would produce, and re-audits. **If a tamper is NOT flagged, this
 * gate can no longer see the defect class it polices → exit 2 (UNPROVEN), never 0.**
 *   T-A  strip a `ref`'s authority        → Arm A must fire
 *   T-B  mark an applied cap as uncited   → Arm B must fire
 *   T-D  clear `envelopeIsUpperBound` on a resolution that has an unapplied top constraint
 *                                          → Arm D must fire
 *
 * ── HONESTY FLOORS (exit 2, never a silent pass) ─────────────────────────────
 *   • fewer than MIN_PARCELS fixture parcels walked, or fewer than MIN_CONTROLS controls read —
 *     "looked nowhere" and "found nothing wrong" are different verdicts (§CONTEXT-DATA-HONESTY);
 *   • the fixture no longer carries a control in state `absent` (then Arm B is vacuous and this
 *     gate is measuring nothing);
 *   • the production modules fail to import.
 *
 * ── EXIT CODES (standard run-all.ts contract) ────────────────────────────────
 *   0 — PASS: arms A/B/D clean at zero, Arm C within ceiling, all three tampers flagged.
 *   1 — FAIL: a real finding on arm A, B or D. Named: parcel, layer, arm.
 *   2 — UNPROVEN: an honesty floor breached, or a tamper not flagged. Never aliases with 1.
 *   3 — Arm C ratchet exceeded. ⛔ Fix by citing the control, not by moving the ceiling.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import {
    resolveNswVerticalPrecedence,
    type NswRawControlHit,
    type NswVerticalResolution,
} from '../../packages/site-parcel-data/src/rulepacks/au/nswVerticalPrecedence.js';
import { NSW_LAYER } from '../../packages/site-parcel-data/src/rulepacks/au/nswPortalLayers.js';
import { nswMayContributeValue } from '../../packages/site-parcel-data/src/rulepacks/au/nswCitationState.js';

// ──────────────────────────────────────────────────────────────────────────────────────────────
// ⛔ ARM C — THE RATCHET. SHRINK-ONLY.
//
// The count of NSW vertical controls, across the measured fixture corpus, that PRYZM can see and
// cannot cite. Baselined 2026-09-04 from the first run of this gate over the live-captured bags.
//
// It falls when a SIGNED row is added to `nswClauseRegistry.ts`. It does not fall by any code
// change, which is why it is a ratchet and not a hard-0: the remaining work is legal reading, not
// engineering. ⛔ RAISING THIS NUMBER IS THE ONE FORBIDDEN FIX.
// ──────────────────────────────────────────────────────────────────────────────────────────────
const ARM_C_CEILING = 4;

/** Honesty floors — below these the gate is not measuring, and says so rather than passing. */
const MIN_PARCELS = 6;
const MIN_CONTROLS = 8;

type Bag = Record<string, unknown>;
interface Fixture {
    readonly parcels: Record<
        string,
        { why: string; hits: Array<{ layerId: number; layerName: string; attributes: Bag }> }
    >;
}

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.resolve(
    HERE,
    '../../packages/site-parcel-data/__tests__/fixtures/nsw-eplanning-2026-09-04.json',
);

interface Finding {
    readonly arm: 'A' | 'B' | 'D';
    readonly parcel: string;
    readonly detail: string;
}

function verticalHits(hits: Fixture['parcels'][string]['hits']): NswRawControlHit[] {
    return hits
        .filter((h) => h.layerId !== NSW_LAYER.FLOOR_SPACE_RATIO)
        .map((h) => ({ layerId: h.layerId, attributes: h.attributes }));
}

/** The audit, factored out so the TAMPERS can re-run the identical logic on a mutated input. */
function audit(parcel: string, res: NswVerticalResolution): Finding[] {
    const out: Finding[] = [];

    // ARM A — a legal address on every arm, refusals included.
    const ref = res.state.ref;
    if (!ref || !ref.country || !ref.authority || !ref.dataset) {
        out.push({
            arm: 'A',
            parcel,
            detail: `emitted state has an incomplete legal address: ${JSON.stringify({
                country: ref?.country ?? null,
                authority: ref?.authority ?? null,
                dataset: ref?.dataset ?? null,
            })}`,
        });
    }

    // ARM B — an uncited control never contributes a number.
    for (const cap of res.hardCaps) {
        if (!nswMayContributeValue(cap.control.citation.state) && cap.applied) {
            out.push({
                arm: 'B',
                parcel,
                detail:
                    `${cap.control.layerName} (layer ${cap.control.layerId}) was APPLIED with ` +
                    `citation.state='${cap.control.citation.state}'. An uncited cap asserts that ` +
                    'this land is more constrained than the base control says, with no clause behind it.',
            });
        }
    }
    if (res.state.status === 'resolved' && res.baseControl) {
        if (!nswMayContributeValue(res.baseControl.citation.state)) {
            out.push({
                arm: 'B',
                parcel,
                detail:
                    `a value (${String(res.state.value)} ${res.state.unit ?? ''}) was emitted from ` +
                    `${res.baseControl.layerName} whose citation.state is ` +
                    `'${res.baseControl.citation.state}'. This is §1.2 exactly: a number with no clause.`,
            });
        }
    }
    // `clause` and `citation.state` are two spellings of one fact and may never disagree.
    for (const c of res.allControls) {
        if ((c.clause === null) !== (c.citation.state === 'absent')) {
            out.push({
                arm: 'B',
                parcel,
                detail:
                    `${c.layerName}: clause=${JSON.stringify(c.clause)} disagrees with ` +
                    `citation.state='${c.citation.state}'. One fact, two spellings, drifted.`,
            });
        }
    }

    // ARM D — L-616. An unapplied top constraint must be VISIBLE and must block publication.
    const hasUnappliedTopConstraint = res.hardCaps.some((h) => !h.applied);
    if (hasUnappliedTopConstraint && !res.envelopeIsUpperBound) {
        out.push({
            arm: 'D',
            parcel,
            detail:
                'a constraint that could reduce this envelope was found and not applied, yet ' +
                'envelopeIsUpperBound is false. An UNKNOWN constraint rendered as absent is an ' +
                'OVERSTATEMENT on real land (L-616).',
        });
    }
    if (res.envelopeIsUpperBound && res.publishable) {
        out.push({
            arm: 'D',
            parcel,
            detail:
                'the envelope is an upper bound (status C) and is marked publishable. A bound ' +
                'shipped as a determination is the overstatement with a citation attached.',
        });
    }
    return out;
}

function main(): number {
    let fixture: Fixture;
    try {
        fixture = JSON.parse(readFileSync(FIXTURE, 'utf8')) as Fixture;
    } catch (e) {
        console.error(`[nsw-citation] UNPROVEN: cannot read the fixture at ${FIXTURE}: ${String(e)}`);
        return 2;
    }

    const parcels = Object.keys(fixture.parcels).sort();
    const findings: Finding[] = [];
    const resolutions = new Map<string, NswVerticalResolution>();
    let controlsRead = 0;
    let uncited = 0;
    const uncitedRows: string[] = [];

    for (const parcel of parcels) {
        const hits = verticalHits(fixture.parcels[parcel]!.hits);
        const res = resolveNswVerticalPrecedence(hits);
        resolutions.set(parcel, res);
        controlsRead += res.allControls.length;
        for (const c of res.allControls) {
            if (c.citation.state === 'absent') {
                uncited++;
                uncitedRows.push(`${parcel} · ${c.layerName} (layer ${c.layerId})`);
            }
        }
        findings.push(...audit(parcel, res));
    }

    // ── Honesty floors ────────────────────────────────────────────────────────────────────────
    if (parcels.length < MIN_PARCELS || controlsRead < MIN_CONTROLS) {
        console.error(
            `[nsw-citation] UNPROVEN: walked ${parcels.length} parcel(s) / ${controlsRead} control(s), ` +
                `floors are ${MIN_PARCELS} / ${MIN_CONTROLS}. "Looked nowhere" is not "found nothing wrong".`,
        );
        return 2;
    }
    if (uncited === 0) {
        console.error(
            '[nsw-citation] UNPROVEN: the fixture carries NO control in citation state `absent`, so ' +
                'ARM B is vacuous and this gate is measuring nothing. Measured live, 10 of the 12 NSW ' +
                'vertical overlay layers serve LEGIS_REF_CLAUSE on 0.0% of features — a fixture with ' +
                'no uncited control is not representative of NSW and must be re-captured.',
        );
        return 2;
    }

    // ── TEETH ─────────────────────────────────────────────────────────────────────────────────
    const teeth: string[] = [];
    const sample = resolutions.get(parcels[0]!)!;

    // T-A — strip the authority from an emitted legal address.
    const tA = { ...sample, state: { ...sample.state, ref: { ...sample.state.ref, authority: '' } } };
    if (!audit('T-A', tA as NswVerticalResolution).some((f) => f.arm === 'A')) {
        teeth.push('T-A: a stripped legal address was NOT flagged — ARM A is blind.');
    }

    // T-B — an uncited cap marked applied. Built from a REAL uncited control, never a stub.
    const uncitedControl = [...resolutions.values()]
        .flatMap((r) => r.allControls)
        .find((c) => c.citation.state === 'absent');
    if (!uncitedControl) {
        console.error('[nsw-citation] UNPROVEN: no uncited control available to build the ARM B tamper.');
        return 2;
    }
    const tB = {
        ...sample,
        hardCaps: [{ control: uncitedControl, applied: true, notAppliedBecause: null }],
    };
    if (!audit('T-B', tB as NswVerticalResolution).some((f) => f.arm === 'B')) {
        teeth.push('T-B: an APPLIED uncited cap was NOT flagged — ARM B is blind.');
    }

    // T-D — an unapplied cap with the upper-bound flag cleared: the pre-L-616 shape.
    const tD = {
        ...sample,
        hardCaps: [{ control: uncitedControl, applied: false, notAppliedBecause: 'tamper' }],
        envelopeIsUpperBound: false,
    };
    if (!audit('T-D', tD as NswVerticalResolution).some((f) => f.arm === 'D')) {
        teeth.push('T-D: an unapplied cap with envelopeIsUpperBound cleared was NOT flagged — ARM D is blind.');
    }

    if (teeth.length > 0) {
        console.error('[nsw-citation] UNPROVEN — the gate cannot see the defects it polices:');
        for (const t of teeth) console.error(`  ${t}`);
        return 2;
    }

    // ── Verdict ───────────────────────────────────────────────────────────────────────────────
    console.log(
        `[nsw-citation] walked ${parcels.length} parcels · ${controlsRead} vertical controls · ` +
            `teeth T-A/T-B/T-D all fired.`,
    );

    if (findings.length > 0) {
        console.error(`[nsw-citation] FAIL: ${findings.length} finding(s) on the hard-0 arms.`);
        for (const f of findings) console.error(`  ARM ${f.arm} · ${f.parcel} — ${f.detail}`);
        return 1;
    }
    console.log('[nsw-citation] ARM A (legal address) OK · ARM B (uncited never contributes) OK · ARM D (L-616 upper bound) OK.');

    if (uncited > ARM_C_CEILING) {
        console.error(
            `[nsw-citation] ARM C RATCHET EXCEEDED: ${uncited} uncited control(s) > ceiling ${ARM_C_CEILING}.`,
        );
        for (const r of uncitedRows) console.error(`  ${r}`);
        console.error(
            '  ⛔ Fix by adding a SIGNED row to packages/site-parcel-data/src/rulepacks/au/nswClauseRegistry.ts. ' +
                'Raising the ceiling, or absorbing this into gate-debt.json, is the one forbidden fix ' +
                '(§RATCHET-EXCEEDED-IS-NEVER-DEBT, R7 / L-836).',
        );
        return 3;
    }
    console.log(
        `[nsw-citation] ARM C: ${uncited} / ${ARM_C_CEILING} uncited controls (shrink-only). ` +
            `These are REPORTED and NOT APPLIED:`,
    );
    for (const r of uncitedRows) console.log(`  ${r}`);
    if (uncited < ARM_C_CEILING) {
        console.error(
            `[nsw-citation] NOTE: the ratchet has slack (${uncited} < ${ARM_C_CEILING}). Lower ` +
                'ARM_C_CEILING to ' + String(uncited) + ' in the same commit that cited the control — ' +
                'paid debt must leave the ledger, or the ceiling rots into a number nobody believes.',
        );
    }
    return 0;
}

process.exit(main());
