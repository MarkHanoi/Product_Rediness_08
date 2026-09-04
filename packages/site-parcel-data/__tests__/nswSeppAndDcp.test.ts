/**
 * §NSW-ROUND-4 — the two acceptance criteria that read ⛔ NOT BUILT in `NSW-CITATION-DECISION.md`
 * §8, and the DCP's second axis.
 *
 * ⭐ EVERY FIXTURE HERE IS A CAPTURED ATTRIBUTE BAG, NOT A HAND-WRITTEN IDEAL. `nsw-sepp-2026-09-04.json`
 * holds raw ArcGIS `identify` responses taken at points chosen by `sepp-overlap2.mjs`, keys exactly
 * as served. §FAKE-MORE-CAPABLE-THAN-REAL: a fixture built from what the reader expects cannot
 * falsify the reader, and the two-spelling `EPI_TYPE` trap below is precisely the kind of thing a
 * hand-written bag would have smoothed away.
 */
import { describe, it, expect } from 'vitest';

import sepp from './fixtures/nsw-sepp-2026-09-04.json' assert { type: 'json' };
import {
    resolveNswVerticalPrecedence,
    nswReadControl,
    type NswRawControlHit,
} from '../src/rulepacks/au/nswVerticalPrecedence.js';
import {
    nswInstrumentClass,
    nswLookupPrecedence,
    nswResolveInstrumentContest,
    isNswPrecedenceSigned,
    NSW_PRECEDENCE_RULINGS,
} from '../src/rulepacks/au/nswInstrumentPrecedence.js';
import {
    nswSeppLayer,
    isNswSeppReplica,
    nswBandedValue,
    nswParseBand,
    nswReducedLevelConflict,
    NSW_SEPP_LAYER_FACTS,
} from '../src/rulepacks/au/nswSeppLayers.js';
import {
    nswReadStoreys,
    nswDualVerticalConstraint,
    nswReadSetbackType,
    NSW_SYDNEY_DCP_SETBACK_VOCABULARY,
    NSW_SYDNEY_DCP_STOREY_VOCABULARY,
} from '../src/rulepacks/au/nswDcpStoreys.js';
import { nswAdaptPlane, nswPlaneSide } from '../src/rulepacks/au/nswInclinedPlane.js';
import { nswLookupRuling } from '../src/rulepacks/au/nswClauseRegistry.js';

type Bag = Record<string, unknown>;
interface Point {
    id: string;
    why: string;
    hits: Array<{ service: string; layerId: number; layerName: string; attributes: Bag }>;
}
const POINTS = (sepp as unknown as { points: Record<string, Point> }).points;

/** Feed a captured point to the resolver, carrying the SERVICE each hit came from. */
function hitsFor(id: string, opts: { includeSepp: boolean }): NswRawControlHit[] {
    const p = POINTS[id];
    if (!p) throw new Error(`fixture point ${id} missing`);
    return p.hits
        .filter((h) => h.layerId !== 11) // FSR is not a vertical control.
        .filter((h) => opts.includeSepp || h.service !== 'SEPP')
        .map((h) => ({
            layerId: h.layerId,
            attributes: h.attributes,
            service: h.service === 'SEPP' ? ('SEPP' as const) : null,
        }));
}

describe('fixture integrity — the SEPP capture must still be the thing it claims to be', () => {
    it('carries the six measured points, including a real LEP+SEPP stack and the SOP reduced level', () => {
        expect(Object.keys(POINTS).sort()).toEqual([
            'gosford-regional-mrl-cited',
            'growth-centres-incentive-hob',
            'growth-centres-wpc-sepp-only',
            'hornsby-ehc-stack',
            'parramatta-north-ssp-stack',
            'sop-reduced-level',
        ]);
    });

    it('still carries the two traps a normalised fixture would have smoothed away', () => {
        // 1. `EPI_TYPE` in its identify spelling — the DESCRIPTION, not the domain CODE.
        const hornsby = POINTS['hornsby-ehc-stack']!.hits.filter((h) => h.layerId === 14);
        expect(hornsby).toHaveLength(2);
        expect(hornsby.map((h) => h.attributes['EPI Type'])).toContain(
            'State Environmental Planning Policy',
        );
        expect(hornsby.map((h) => h.attributes['EPI Type'])).toContain('Local Environment Plan');
        // 2. A symbology BAND in LAY_CLASS with the precise value hiding in LABEL.
        const incentive = POINTS['growth-centres-incentive-hob']!.hits.find((h) => h.layerId === 799)!;
        expect(incentive.attributes['LAY_CLASS']).toBe('80-99.9');
        expect(incentive.attributes['LABEL']).toBe('96');
    });
});

describe('§13 acceptance — a SEPP-covered parcel is never resolved LEP-alone', () => {
    it('reads EPI_TYPE in BOTH served spellings — /query gives the code, /identify the description', () => {
        // ⛔ THE SILENT-HALF-BLIND TRAP. A `=== "SEPP"` test passes on the query path and fails on
        // the identify path, and the identify path is the one every fixture here uses.
        expect(nswInstrumentClass('SEPP')).toBe('SEPP');
        expect(nswInstrumentClass('State Environmental Planning Policy')).toBe('SEPP');
        expect(nswInstrumentClass('LEP')).toBe('LEP');
        expect(nswInstrumentClass('Local Environment Plan')).toBe('LEP');
        // ⛔ And an unreadable value is `unknown`, never defaulted to LEP.
        expect(nswInstrumentClass('')).toBe('unknown');
        expect(nswInstrumentClass('Regional Environmental Plan')).toBe('unknown');
        expect(nswInstrumentClass(null)).toBe('unknown');
    });

    it('hornsby-ehc-stack: the SEPP governs over the LEP, and the answer is the LARGER number', () => {
        // Hornsby LEP 2013 8.5 m (cl 4.3) vs SEPP (Precincts—Eastern Harbour City) 2021 9.5 m.
        // ⭐ THE PROOF THAT PRECEDENCE IS NOT A MINIMUM. A "conservative" tie-break returns 8.5 and
        // is wrong by a metre; on `parramatta-north-ssp-stack` it is wrong by fourteen.
        const res = resolveNswVerticalPrecedence(hitsFor('hornsby-ehc-stack', { includeSepp: false }));
        expect(res.state.status).toBe('resolved');
        expect(res.state.status === 'resolved' && res.state.value).toBe(9.5);
        expect(res.baseControl!.instrumentClass).toBe('SEPP');
        expect(res.instrumentContest).toMatch(/prevails to the extent of the inconsistency/);
        expect(res.explanation.join(' ')).toMatch(/DISPLACED — .*Hornsby Local Environmental Plan 2013/);
        // ⛔ Unsigned precedence ruling ⇒ computes, does not ship.
        expect(res.publishable).toBe(false);
    });

    it('parramatta-north-ssp-stack: an UNREADABLE SEPP still stops the LEP resolving alone', () => {
        // Parramatta LEP 2023 20 m (cl 4.3) alongside SEPP (Precincts—Central River City) 2021
        // value 6 with **UNITS null**.
        //
        // ⭐ THE CASE THAT NEARLY PASSED FOR THE WRONG REASON. There is no precedence CONTEST here,
        // because the SEPP row serves no units and so never reaches the base partition at all. A
        // test asserting "the SEPP wins" would have been asserting a mechanism that does not fire.
        // What must be true is weaker and more important: the parcel is NOT answered on the local
        // plan alone. The 20 m is reported as an upper bound, the policy is named, and the answer
        // is unpublishable.
        const res = resolveNswVerticalPrecedence(
            hitsFor('parramatta-north-ssp-stack', { includeSepp: false }),
        );
        expect(res.state.status).toBe('resolved');
        expect(res.state.status === 'resolved' && res.state.value).toBe(20);
        expect(res.baseControl!.instrumentClass).toBe('LEP');
        // ⛔ …and every one of these is what stops that 20 being read as the answer.
        expect(res.envelopeIsUpperBound).toBe(true);
        expect(res.publishable).toBe(false);
        expect(res.explanation.join(' ')).toMatch(
            /A STATE ENVIRONMENTAL PLANNING POLICY APPLIES HERE AND COULD NOT BE EVALUATED/,
        );
        expect(res.explanation.join(' ')).toMatch(/Central River City/);
        expect(res.instrumentContest).toBeNull();
    });

    it('growth-centres-wpc-sepp-only: a SEPP-drawn control with no LEP at all still resolves', () => {
        const res = resolveNswVerticalPrecedence(
            hitsFor('growth-centres-wpc-sepp-only', { includeSepp: false }),
        );
        expect(res.state.status).toBe('resolved');
        expect(res.state.status === 'resolved' && res.state.value).toBe(9);
        expect(res.baseControl!.instrumentClass).toBe('SEPP');
        // No contest: one base control, so no precedence question arose.
        expect(res.instrumentContest).toBeNull();
    });

    it('refuses when a SEPP competes and NO precedence sentence has been read', () => {
        // ⛔ `EPI_TYPE === 'SEPP'` IS A LABEL, NOT A RULE. Each precinct SEPP says "THIS CHAPTER
        // prevails", chapter by chapter; a policy without such a clause displaces nothing.
        const contest = nswResolveInstrumentContest([
            { instrument: 'Some Local Environmental Plan 2020', epiType: 'Local Environment Plan' },
            {
                instrument: 'State Environmental Planning Policy (Housing) 2021',
                epiType: 'State Environmental Planning Policy',
            },
        ]);
        expect(contest.winnerIndex).toBeNull();
        expect(contest.explanation).toMatch(/EPI_TYPE=SEPP is a label, not a rule/);
    });

    it('refuses when TWO prevailing SEPPs apply — a partial order, not a hierarchy of two', () => {
        const contest = nswResolveInstrumentContest([
            {
                instrument: 'State Environmental Planning Policy (Precincts—Regional) 2021',
                epiType: 'SEPP',
            },
            {
                instrument: 'State Environmental Planning Policy (Precincts—Central River City) 2021',
                epiType: 'SEPP',
            },
        ]);
        expect(contest.winnerIndex).toBeNull();
        expect(contest.explanation).toMatch(/s 5\.9\(2\)/);
    });

    it('every precedence ruling carries verbatim text and NO signature', () => {
        expect(NSW_PRECEDENCE_RULINGS.length).toBeGreaterThanOrEqual(4);
        for (const r of NSW_PRECEDENCE_RULINGS) {
            expect(r.verbatim.length).toBeGreaterThan(80);
            expect(r.source).toMatch(/legislation\.nsw\.gov\.au epi-\d{4}-\d{4}/);
            // ⛔ A lane agent is not a signer. Zero signatures is the state of the world.
            expect(isNswPrecedenceSigned(r)).toBe(false);
        }
    });

    it('carries the carve-outs the sentences state, rather than flattening them', () => {
        const ehc = nswLookupPrecedence(
            'State Environmental Planning Policy (Precincts—Eastern Harbour City) 2021',
        )!;
        // ⚠ Its own precedence is "subject to section 36 (4) of the Act", and s 36(4) has not been
        // read. A ruling that hides its own subordination is worse than no ruling.
        expect(ehc.carveOuts.join(' ')).toMatch(/section 36 \(4\)/);
        const wpc = nswLookupPrecedence(
            'State Environmental Planning Policy (Precincts—Western Parkland City) 2021',
        )!;
        expect(wpc.effect).toBe('disapplies-lep');
        expect(wpc.carveOuts.join(' ')).toMatch(/Land Application Map/);
    });
});

describe('§SEPP-REPLICA — adding a service must not refuse a parcel that has one answer', () => {
    it('classifies the eight measured HOB replicas as REPLICA, with their evidence', () => {
        for (const id of [44, 118, 134, 614, 631, 648, 684, 715, 726]) {
            const f = nswSeppLayer(id)!;
            expect(f.classification).toBe('REPLICA');
            expect(f.replicaEvidence).toBeTruthy();
        }
        // ⭐ And the three that are NOT replicas — the ones worth fetching.
        expect(nswSeppLayer(799)!.classification).toBe('DIRECT');
        expect(nswSeppLayer(718)!.classification).toBe('DIRECT');
        expect(nswSeppLayer(278)!.classification).toBe('GEOMETRIC');
        // An unmeasured layer is a refusal, never a default.
        expect(nswSeppLayer(9999)).toBeNull();
        expect(isNswSeppReplica(9999)).toBe(false);
    });

    it('gosford: fetching the SEPP replica alongside Principal/14 still resolves to ONE answer', () => {
        // Both readings present. Without the replica guard this is two BASE controls and a
        // status-D refusal on a parcel the state answers plainly.
        const withSepp = resolveNswVerticalPrecedence(
            hitsFor('gosford-regional-mrl-cited', { includeSepp: true }),
        );
        const withoutSepp = resolveNswVerticalPrecedence(
            hitsFor('gosford-regional-mrl-cited', { includeSepp: false }),
        );
        expect(withSepp.state.status).toBe('resolved');
        expect(withSepp.state.status === 'resolved' && withSepp.state.value).toBe(55.7);
        expect(withSepp.state.status === 'resolved' && withSepp.state.unit).toBe('m AHD');
        // The two agree — which is the point: the extra service adds no information here.
        expect(withoutSepp.state).toEqual(withSepp.state);
        expect(withSepp.explanation.join(' ')).toMatch(/NOT COUNTED TWICE/);
    });

    it('the SEPP legacy schema is read through UNITS, not through the absent LAY_NAME', () => {
        // ⛔ Layers 44/118/134/614/631/648/684 serve NO `LAY_NAME` (null on 100% of features).
        // Reading them through the LAY_NAME vocabulary returns UNKNOWN and refuses a control the
        // service states plainly — the silent-false-refusal shape, in its SEPP costume.
        const gosford = POINTS['gosford-regional-mrl-cited']!.hits.find(
            (h) => h.service === 'SEPP' && h.layerId === 44,
        )!;
        expect(gosford.attributes['LAY_NAME']).toBeUndefined();
        const c = nswReadControl({ layerId: 44, attributes: gosford.attributes, service: 'SEPP' });
        expect(c.height.kind).toBe('absolute_level');
        expect(c.height.kind === 'absolute_level' && c.height.value_m_AHD).toBe(55.7);
        expect(c.instrumentClass).toBe('SEPP');
    });
});

describe('§SEPP-BAND — a symbology band is not a value, and LABEL is only usable when it agrees', () => {
    it('parses a band and refuses a plain number as one', () => {
        expect(nswParseBand('80-99.9')).toEqual({ lo: 80, hi: 99.9, raw: '80-99.9' });
        // ⛔ "9-9.9" is a band and "9" is a value. One hyphen apart, two different facts.
        expect(nswParseBand('9-9.9')).toEqual({ lo: 9, hi: 9.9, raw: '9-9.9' });
        expect(nswParseBand('9')).toBeNull();
        expect(nswParseBand('E')).toBeNull();
    });

    it('recovers 96 from LABEL because the band corroborates it', () => {
        const v = nswBandedValue('80-99.9', '96');
        expect(v.kind).toBe('exact');
        expect(v.kind === 'exact' && v.value).toBe(96);
        // ⚠ The band alone would have said 80 (a 16 m understatement) or 99.9 (a 3.9 m overstatement).
    });

    it('refuses when LABEL is not a number — layer 718 serves "S" in the same field', () => {
        const v = nswBandedValue('80-99.9', 'S');
        expect(v.kind).toBe('band-only');
        expect(v.kind === 'band-only' && v.reason).toMatch(/on layer 718 the same field reads "S"/);
    });

    it('refuses when LABEL falls OUTSIDE its own band — two fields disagreeing is a warning', () => {
        const v = nswBandedValue('80-99.9', '120');
        expect(v.kind).toBe('band-only');
        expect(v.kind === 'band-only' && v.reason).toMatch(/OUTSIDE its own LAY_CLASS band/);
        // ⛔ Picking a winner would discard the warning. §PROBE-CAN-BE-WRONG-THREE-WAYS.
    });

    it('growth-centres-incentive-hob: the incentive resolves to 96 and is NEVER applied', () => {
        const res = resolveNswVerticalPrecedence(
            hitsFor('growth-centres-incentive-hob', { includeSepp: true }),
        );
        // The base is the Principal/14 SEPP-drawn 30 m; the incentive is a conditional uplift.
        expect(res.state.status).toBe('resolved');
        expect(res.state.status === 'resolved' && res.state.value).toBe(30);
        const uplift = res.conditionalUplifts.find((u) => u.control.layerId === 799);
        expect(uplift).toBeDefined();
        expect(uplift!.control.height.kind).toBe('height_above_ground');
        expect(
            uplift!.control.height.kind === 'height_above_ground' && uplift!.control.height.value_m,
        ).toBe(96);
        expect(uplift!.condition).toMatch(/INCENTIVISED DEVELOPMENT/);
        // ⛔ 96 must never reach the emitted value. "A conditional uplift presented as an
        // entitlement is the worst output this engine can produce."
        expect(res.state.status === 'resolved' && res.state.value).not.toBe(96);
    });
});

describe('§SEPP-718 — the datum the service contests with itself', () => {
    it('names the conflict instead of choosing a side', () => {
        const msg = nswReducedLevelConflict(
            'RDL',
            'SEPP (Precincts—Central River City) 2021 Sydney Olympic Park Reduced Level Map',
            'Maximum Building Height (m)',
            'm',
        );
        expect(msg).toMatch(/DATUM CONTESTED BY THE SERVICE ITSELF/);
        expect(msg).toMatch(/Three readings say AHD and two say metres/);
        // Not a reduced-level row ⇒ no conflict, and no noise.
        expect(nswReducedLevelConflict('HOB', 'Height of Buildings Map', 'Maximum Building Height (m)', 'm')).toBeNull();
    });

    it('sop-reduced-level resolves to nothing rather than to 23 metres of either kind', () => {
        const res = resolveNswVerticalPrecedence(hitsFor('sop-reduced-level', { includeSepp: true }));
        expect(res.state.status).not.toBe('resolved');
        const c = res.allControls.find((x) => x.layerId === 718)!;
        expect(c.height.kind).toBe('uninterpretable');
        expect(c.height.kind === 'uninterpretable' && c.height.reason).toMatch(/DATUM CONTESTED/);
        // ⛔ Neither 23 m above ground nor RL 23 AHD is emitted. At Sydney Olympic Park the
        // difference is the whole ground elevation.
        expect(JSON.stringify(res.state)).not.toMatch(/"value":\s*23\b/);
    });
});

describe('§DCP-TWO-AXES — storeys and metres both bind and are never converted', () => {
    it('reads the measured vocabulary, and ">15" is not 15', () => {
        expect(nswReadStoreys('3')).toEqual({ kind: 'count', maxStoreys: 3, raw: '3' });
        const open = nswReadStoreys('>15');
        expect(open.kind).toBe('open-ended');
        expect(open.kind === 'open-ended' && open.aboveStoreys).toBe(15);
        // ⛔ The three wrong readers: parseInt → NaN, Number → NaN, replace(/\D/g,'') → 15.
        // The last one is the dangerous one because it looks right.
        expect(String(Number.parseInt('>15', 10))).toBe('NaN');
        expect('>15'.replace(/\D/g, '')).toBe('15'); // what a careless reader would get
        expect(open.kind).not.toBe('count'); // what this reader gets instead
        expect(nswReadStoreys('Existing height').kind).toBe('existing');
        expect(nswReadStoreys(null).kind).toBe('not-stated');
        expect(nswReadStoreys('four').kind).toBe('not-stated');
    });

    it('covers every storey string the service was measured to serve', () => {
        for (const v of NSW_SYDNEY_DCP_STOREY_VOCABULARY) {
            const s = nswReadStoreys(v);
            if (v === null) expect(s.kind).toBe('not-stated');
            else expect(['count', 'open-ended', 'existing']).toContain(s.kind);
        }
    });

    it('reports both axes and refuses to reduce them to one', () => {
        const d = nswDualVerticalConstraint({
            metres: { value: 9, datum: 'existing_ground_level' },
            storeys: nswReadStoreys('2'),
            storeyCoverage: 'polygon-found',
            dcpName: 'Sydney DCP 2012',
        });
        expect(d.bothAxesBind).toBe(true);
        expect(d.explanation).toMatch(/TWO CONSTRAINTS, TWO UNITS, BOTH BINDING/);
        expect(d.explanation).toMatch(/NOT inter-convertible/);
        // ⛔ There is no derived number anywhere in the result.
        expect(Object.keys(d)).not.toContain('impliedFloorToFloor');
        expect(JSON.stringify(d)).not.toMatch(/3\.1|floorToFloor/);
    });

    it('keeps "did not look" apart from "looked and found none"', () => {
        const notQueried = nswDualVerticalConstraint({
            metres: { value: 9, datum: 'existing_ground_level' },
            storeys: null,
            storeyCoverage: 'not-queried',
        });
        expect(notQueried.explanation).toMatch(/NOT QUERIED/);
        const noPolygon = nswDualVerticalConstraint({
            metres: { value: 9, datum: 'existing_ground_level' },
            storeys: null,
            storeyCoverage: 'no-polygon-here',
        });
        expect(noPolygon.explanation).toMatch(/No development-control-plan storey polygon covers/);
        expect(noPolygon.explanation).not.toEqual(notQueried.explanation);
    });

    it('the module contains no floor-to-floor arithmetic — a structural guard, not a behavioural one', async () => {
        const fs = await import('node:fs/promises');
        const url = new URL('../src/rulepacks/au/nswDcpStoreys.ts', import.meta.url);
        const src = await fs.readFile(url, 'utf8');
        const code = src
            .split('\n')
            .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
            .join('\n');
        expect(code).not.toMatch(/storey\w*\s*[*/]\s*\d/i);
        expect(code).not.toMatch(/\d\s*[*/]\s*storey\w*/i);
        expect(code).not.toMatch(new RegExp('floor' + 'ToFloor', 'i'));
    });
});

describe('§DCP-SETBACKS — the value is inside the type string, and the types are different controls', () => {
    it('⛔ a build-to alignment is the INVERSE of a setback', () => {
        const b = nswReadSetbackType('4m Build to alignment');
        expect(b.kind).toBe('build-to-alignment');
        expect(b.distance_m).toBe(4);
        // Reading it as a minimum setback shrinks the footprint by 4 m on a site where the plan
        // requires the façade to sit ON the line.
        expect(b.barsBuildingAtGround).toBe(false);
        expect(b.note).toMatch(/inverts the control/);
    });

    it('separates footpath widening, landscape and upper-level setbacks', () => {
        expect(nswReadSetbackType('2.4m Setback - Footpath widening').kind).toBe('footpath-widening');
        expect(nswReadSetbackType('3m Landscape setback').kind).toBe('landscape-setback');
        const upper = nswReadSetbackType('4m Upper level setback');
        expect(upper.kind).toBe('upper-level-setback');
        // ⚠ It does NOT bar building at ground level, and the trigger level is not served.
        expect(upper.barsBuildingAtGround).toBe(false);
        expect(upper.note).toMatch(/does NOT state which/);
        expect(nswReadSetbackType('6m Minimum setback').kind).toBe('minimum-setback');
    });

    it('a varying width serves no number, and never a zero', () => {
        const v = nswReadSetbackType('Landscape setback varying width');
        expect(v.kind).toBe('varying-width');
        expect(v.distance_m).toBeNull();
        expect(v.distance_m).not.toBe(0);
    });

    it('refuses an unmeasured string even when it contains a plausible number', () => {
        const u = nswReadSetbackType('5m Rear boundary offset');
        expect(u.kind).toBe('unknown');
        expect(u.distance_m).toBeNull();
        expect(u.note).toMatch(/not in the measured City of Sydney SetbackType vocabulary/);
    });

    it('recognises every setback string the service was measured to serve', () => {
        const unrecognised = NSW_SYDNEY_DCP_SETBACK_VOCABULARY.filter(
            (s) => nswReadSetbackType(s).kind === 'unknown',
        );
        expect(unrecognised).toEqual([]);
    });
});

describe('§SEPP-CATALOGUE — the classification is measured, and it names what it excludes', () => {
    it('classifies every catalogued layer and carries evidence for every REPLICA', () => {
        // A FLOOR, NOT A CENSUS. The table is append-only from measurements, so an exact count is a
        // number that rots — and this assertion already got it wrong once (19 written, 21 on disk).
        // What must hold is that every row carries its reasoning and its evidence.
        expect(NSW_SEPP_LAYER_FACTS.length).toBeGreaterThanOrEqual(19);
        expect(new Set(NSW_SEPP_LAYER_FACTS.map((f) => f.layerId)).size).toBe(
            NSW_SEPP_LAYER_FACTS.length,
        );
        for (const f of NSW_SEPP_LAYER_FACTS) {
            expect(f.why.length).toBeGreaterThan(20);
            if (f.classification === 'REPLICA') expect(f.replicaEvidence).toBeTruthy();
            else expect(f.replicaEvidence).toBeNull();
        }
    });

    it('the minimum non-residential floor space map is IRRELEVANT to the top and says why', () => {
        const f = nswSeppLayer(798)!;
        expect(f.classification).toBe('IRRELEVANT');
        // ⚠ Irrelevant to the ENVELOPE TOP is not irrelevant to the brief — it binds the programme.
        expect(f.why).toMatch(/binds the programme/);
    });
});

describe('§NSW-INCLINED-PLANE — the shared solver is consumed, and every refusal names a fact', () => {
    // ⭐ THIS SUITE ASSERTS AN ADAPTER, NOT A SOLVER. `geometry/inclinedTop.ts` predates this lane
    // and is line-anchored exactly as Burwood cl 4.3A describes; the correct amount of geometry to
    // write here was zero (§GREP-FOR-THE-EXISTING-SOLVER-FIRST).
    const burwoodD = nswLookupRuling('Burwood Local Environmental Plan 2012', 430, 'D')!;
    const cited = {
        state: 'registry-unsigned' as const,
        clause: burwoodD.clause,
        signedBy: null,
        absenceReason: null,
    };
    const uncited = {
        state: 'absent' as const,
        clause: null,
        signedBy: null,
        absenceReason: 'no clause',
    };
    // Class D: 1.0 m at the line, 33°, "North of BHP line". A line running WEST→EAST.
    const westToEast = { a: { x: 0, z: 0 }, b: { x: 100, z: 0 }, source: 'test fixture' };

    it('adapts the Burwood class-D plane and orients the line so the solver governs NORTH', () => {
        const r = nswAdaptPlane({ ruling: burwoodD, citation: cited, originLine: westToEast, id: 'bhp-D' });
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.spec.baseHeight_m).toBe(1.0);
        expect(r.spec.slopePerMeter).toBeCloseTo(Math.tan((33 * Math.PI) / 180), 10);
        // ⭐ THE FRAME IS SCENE-XZ AND NORTH IS −z (C12 §7 / §9), NOT +y. The first draft of the
        // adapter assumed +y and would have picked the OPPOSITE side for every north/south plane.
        // The solver's field rises along (−dz, dx); for "North of BHP line" that must point north.
        const dx = r.spec.anchorB.x - r.spec.anchorA.x;
        const dz = r.spec.anchorB.z - r.spec.anchorA.z;
        const rise = { x: -dz, z: dx };
        expect(rise.x * 0 + rise.z * -1).toBeGreaterThan(0); // rise · north(0,−1) > 0
        // A west→east line has its rise pointing SOUTH, so the adapter reverses it.
        expect(r.spec.anchorA).toEqual({ x: 100, z: 0 });
        expect(r.spec.anchorB).toEqual({ x: 0, z: 0 });
        expect(r.note).toMatch(/line reversed/);
    });

    it('KEEPS the line when the caller already supplies it the right way round', () => {
        // ⛔ THE COIN-FLIP THIS FUNCTION EXISTS TO REMOVE. The instrument names a compass side and
        // the solver names "left of A→B"; they agree for exactly one winding, and picking the wrong
        // one trims the other half of the site.
        const eastToWest = { a: { x: 100, z: 0 }, b: { x: 0, z: 0 }, source: 'test fixture' };
        const r = nswAdaptPlane({ ruling: burwoodD, citation: cited, originLine: eastToWest, id: 'bhp-D' });
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        // Already oriented so the rise points north — kept as supplied, and the note says so.
        expect(r.spec.anchorA).toEqual({ x: 100, z: 0 });
        expect(r.spec.anchorB).toEqual({ x: 0, z: 0 });
        expect(r.note).not.toMatch(/line reversed/);
    });

    it('refuses when the line runs parallel to the side the instrument names', () => {
        // "North of a line running north" names no half-plane. Either the line or the orientation
        // is not what this reader takes it to be, and choosing one discards the disagreement.
        const southToNorth = { a: { x: 0, z: 0 }, b: { x: 0, z: 100 }, source: 'test fixture' };
        const r = nswAdaptPlane({ ruling: burwoodD, citation: cited, originLine: southToNorth, id: 'bhp-D' });
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.reason).toBe('orientation-parallel-to-line');
    });

    it('refuses without an origin line, and does NOT derive one from the control polygon', () => {
        const r = nswAdaptPlane({ ruling: burwoodD, citation: cited, originLine: null, id: 'bhp-D' });
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.reason).toBe('no-origin-line');
        expect(r.detail).toMatch(/not derived from the control polygon/);
    });

    it('refuses an UNCITED plane before it looks at the geometry — ARM B on a cap', () => {
        const r = nswAdaptPlane({ ruling: burwoodD, citation: uncited, originLine: westToEast, id: 'bhp-D' });
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.reason).toBe('uncited');
    });

    it('reads the three measured orientation phrases and refuses a compound bearing', () => {
        expect(nswPlaneSide('East of BHP line')).toBe('east');
        expect(nswPlaneSide('West of BHP line')).toBe('west');
        expect(nswPlaneSide('North of BHP line')).toBe('north');
        // ⛔ `\b` matches at the hyphen, so a naive leading-word regex accepts "North-east" and
        // silently resolves it to north. A compound bearing names none of the four half-planes.
        expect(nswPlaneSide('North-east of BHP line')).toBeNull();
        expect(nswPlaneSide('North east of BHP line')).toBeNull();
        expect(nswPlaneSide('Toward the park')).toBeNull();
        expect(nswPlaneSide(null)).toBeNull();
    });

    it('passes governsExtent through, and says so when there is none', () => {
        const area = [
            { x: 0, z: 0 },
            { x: 50, z: 0 },
            { x: 50, z: 50 },
            { x: 0, z: 50 },
        ];
        const withArea = nswAdaptPlane({
            ruling: burwoodD,
            citation: cited,
            originLine: westToEast,
            governsExtent: area,
            id: 'bhp-D',
        });
        expect(withArea.ok && withArea.spec.governsExtent).toEqual(area);
        const without = nswAdaptPlane({
            ruling: burwoodD,
            citation: cited,
            originLine: westToEast,
            id: 'bhp-D',
        });
        // `null` is the solver's "governs everywhere" — correct only when the caller established it.
        expect(without.ok && without.spec.governsExtent).toBeNull();
        expect(without.ok && without.note).toMatch(/OVERSTATES the constraint/);
    });
});
