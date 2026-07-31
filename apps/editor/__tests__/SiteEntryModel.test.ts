// §FEAT-SITE-ENTRY-GLOBE (L-593, C60) — unit tests for the PURE site-entry stage
// machine, its coverage verdicts, and the registry-derived coverage lookup.
//
// The live surface is the ONE Cesium viewer, which cannot run headless (the same
// argument as PaneViewModel.test.ts / GlobePlacementDecisions.test.ts), so the decisions
// are pinned here: which stage, what the camera is aimed at, whether a descent is
// permitted, what the user is TOLD when the answer is "not covered", and — the one that
// matters most — that no pre-site stage can produce a site hand-off.

import { describe, it, expect } from 'vitest';
import {
    INITIAL_SITE_ENTRY_STATE,
    SITE_ENTRY_ALTITUDE_M,
    SITE_ENTRY_STAGES,
    cameraForState,
    countryFramingPoint,
    describeSiteEntryPanel,
    extentCentre,
    jurisdictionAt,
    jurisdictionClaimAt,
    listCoveredCountries,
    reduceSiteEntry,
    siteEntryPaneIntent,
    type CoverageEntry,
    type SiteEntryContext,
    type SiteEntryIntent,
    type SiteEntryState,
} from '../src/engine/views/siteEntryModel';
import { siteEntryCoverageEntries } from '../src/engine/views/siteEntryCoverage';
import {
    listJurisdictionCoverage,
    isInBarcelona,
    BARCELONA_BBOX,
    registeredPackZoneCodes,
    BCN_JURISDICTION_ID,
    LHOSPITALET_JURISDICTION_ID,
    BADALONA_JURISDICTION_ID,
    SANT_BOI_JURISDICTION_ID,
    CORNELLA_JURISDICTION_ID,
} from '@pryzm/site-parcel-data';

// ── Fixtures ────────────────────────────────────────────────────────────────────────
// Two synthetic jurisdictions so the machine is exercised independently of how many
// cities happen to be registered today. The REAL registry is asserted separately below.

const ALPHA: CoverageEntry = {
    jurisdictionId: 'xx-alpha',
    displayName: 'Alphaville',
    countryCode: 'XX',
    countryName: 'Xanadu',
    extent: { minLat: 10, maxLat: 11, minLon: 20, maxLon: 21 },
    contains: (lat, lon) => lat >= 10 && lat <= 11 && lon >= 20 && lon <= 21,
    extentResolution: 'municipal',
    answerSummary: 'The Alpha ordinance.',
    packZoneCodes: ['a1', 'a2'],
};
const BETA: CoverageEntry = {
    jurisdictionId: 'xx-beta',
    displayName: 'Betatown',
    countryCode: 'XX',
    countryName: 'Xanadu',
    extent: { minLat: 12, maxLat: 13, minLon: 22, maxLon: 23 },
    contains: (lat, lon) => lat >= 12 && lat <= 13 && lon >= 22 && lon <= 23,
    extentResolution: 'municipal',
    answerSummary: 'The Beta ordinance.',
    packZoneCodes: ['b1'],
};

const GATED: SiteEntryContext = { entries: [ALPHA, BETA], mode: 'coverage-gated' };
const OPEN: SiteEntryContext = { entries: [ALPHA, BETA], mode: 'open' };
const EMPTY_CTX: SiteEntryContext = { entries: [], mode: 'coverage-gated' };

// §JURISDICTION-SPECIFICITY fixtures (L-652). `METRO` is the shape of the real defect: a COARSER
// box that FULLY CONTAINS `ALPHA`'s, listed FIRST so that first-match would answer Alphaville's
// land with Metropolis's ordinance. `TWIN` is the shape the rule must REFUSE rather than decide:
// an equally-specific box overlapping `ALPHA`.
const METRO: CoverageEntry = {
    jurisdictionId: 'xx-metro',
    displayName: 'Metropolis',
    countryCode: 'XX',
    countryName: 'Xanadu',
    extent: { minLat: 9, maxLat: 12, minLon: 19, maxLon: 22 },
    contains: (lat, lon) => lat >= 9 && lat <= 12 && lon >= 19 && lon <= 22,
    extentResolution: 'metropolitan',
    answerSummary: 'The Metropolis proximity gate.',
    packZoneCodes: ['m1'],
};
const TWIN: CoverageEntry = {
    jurisdictionId: 'xx-twin',
    displayName: 'Twinville',
    countryCode: 'XX',
    countryName: 'Xanadu',
    extent: { minLat: 10.5, maxLat: 11.5, minLon: 20.5, maxLon: 21.5 },
    contains: (lat, lon) => lat >= 10.5 && lat <= 11.5 && lon >= 20.5 && lon <= 21.5,
    extentResolution: 'municipal',
    answerSummary: 'The Twin ordinance.',
    packZoneCodes: ['t1'],
};

/** Reduce a run of intents, asserting each succeeds. Returns the final state. */
function run(
    ctx: SiteEntryContext,
    intents: readonly SiteEntryIntent[],
    from: SiteEntryState = INITIAL_SITE_ENTRY_STATE,
): SiteEntryState {
    let s = from;
    for (const i of intents) {
        const r = reduceSiteEntry(s, i, ctx);
        if (!r.ok) throw new Error(`unexpected rejection for ${i.type}: ${r.rejected}`);
        s = r.next;
    }
    return s;
}

// ── The stage machine ───────────────────────────────────────────────────────────────

describe('site-entry stage machine', () => {
    it('starts at the world stage with nothing chosen', () => {
        expect(INITIAL_SITE_ENTRY_STATE.stage).toBe('world');
        expect(INITIAL_SITE_ENTRY_STATE.focus).toBeNull();
        expect(INITIAL_SITE_ENTRY_STATE.countryCode).toBeNull();
        expect(INITIAL_SITE_ENTRY_STATE.jurisdictionId).toBeNull();
    });

    it('descends exactly one stage per descend intent (world→country→city→parcel)', () => {
        let s = INITIAL_SITE_ENTRY_STATE;
        const seen = [s.stage];
        for (let i = 0; i < 3; i++) {
            const r = reduceSiteEntry(s, { type: 'site.entry.descend', lat: 10.5, lon: 20.5 }, GATED);
            expect(r.ok).toBe(true);
            if (!r.ok) return;
            s = r.next;
            seen.push(s.stage);
        }
        expect(seen).toEqual([...SITE_ENTRY_STAGES]);
    });

    it('is STABLE under repeated identical intents — it never flaps (the reducer property)', () => {
        const s = run(GATED, [{ type: 'site.entry.focus-jurisdiction', jurisdictionId: 'xx-alpha' }]);
        // The same intent 20 times yields the same stage every time. An altitude
        // listener at a band edge cannot make this promise.
        let cur = s;
        for (let i = 0; i < 20; i++) {
            cur = run(GATED, [{ type: 'site.entry.focus-jurisdiction', jurisdictionId: 'xx-alpha' }], cur);
            expect(cur.stage).toBe('city');
        }
        expect(cur).toEqual(s);
    });

    it('ascends back out and resets to the pristine world state at the top', () => {
        const deep = run(GATED, [
            { type: 'site.entry.focus-jurisdiction', jurisdictionId: 'xx-alpha' },
            { type: 'site.entry.descend', lat: 10.5, lon: 20.5 },
        ]);
        expect(deep.stage).toBe('parcel');
        const up1 = run(GATED, [{ type: 'site.entry.ascend' }], deep);
        expect(up1.stage).toBe('city');
        const up2 = run(GATED, [{ type: 'site.entry.ascend' }], up1);
        expect(up2.stage).toBe('country');
        const up3 = run(GATED, [{ type: 'site.entry.ascend' }], up2);
        expect(up3).toEqual(INITIAL_SITE_ENTRY_STATE);
        expect(reduceSiteEntry(up3, { type: 'site.entry.ascend' }, GATED).ok).toBe(false);
    });

    it('rejects a non-finite point rather than flying the camera to NaN', () => {
        const r = reduceSiteEntry(
            INITIAL_SITE_ENTRY_STATE,
            { type: 'site.entry.descend', lat: Number.NaN, lon: 20 },
            GATED,
        );
        expect(r.ok).toBe(false);
    });
});

// ── C19 §1.3/§1.4 — the one-shot boundary ───────────────────────────────────────────

describe('pre-site stages write no site state (C19 §1.3/§1.4)', () => {
    const everyIntentExceptSelect: SiteEntryIntent[] = [
        { type: 'site.entry.reset' },
        { type: 'site.entry.focus-country', countryCode: 'XX' },
        { type: 'site.entry.focus-jurisdiction', jurisdictionId: 'xx-alpha' },
        { type: 'site.entry.descend', lat: 10.5, lon: 20.5 },
        { type: 'site.entry.ascend' },
    ];

    it('NO intent other than select-parcel can ever emit a site-handoff, from ANY stage', () => {
        for (const stage of SITE_ENTRY_STAGES) {
            const base: SiteEntryState = {
                stage,
                focus: { lat: 10.5, lon: 20.5 },
                countryCode: 'XX',
                jurisdictionId: 'xx-alpha',
            };
            for (const intent of everyIntentExceptSelect) {
                for (const ctx of [GATED, OPEN]) {
                    const r = reduceSiteEntry(base, intent, ctx);
                    if (!r.ok) continue;
                    expect(r.effects.some((e) => e.kind === 'site-handoff')).toBe(false);
                }
            }
        }
    });

    it('select-parcel is REFUSED above the parcel stage (a city stage cannot burn the one-shot)', () => {
        for (const stage of ['world', 'country', 'city'] as const) {
            const r = reduceSiteEntry(
                { stage, focus: { lat: 10.5, lon: 20.5 }, countryCode: 'XX', jurisdictionId: 'xx-alpha' },
                { type: 'site.entry.select-parcel', lat: 10.5, lon: 20.5 },
                GATED,
            );
            expect(r.ok).toBe(false);
        }
    });

    it('select-parcel at the parcel stage emits exactly one hand-off, carrying the jurisdiction', () => {
        const s = run(GATED, [
            { type: 'site.entry.focus-jurisdiction', jurisdictionId: 'xx-alpha' },
            { type: 'site.entry.descend', lat: 10.5, lon: 20.5 },
        ]);
        const r = reduceSiteEntry(
            s,
            { type: 'site.entry.select-parcel', lat: 10.5, lon: 20.5, address: 'Somewhere 1' },
            GATED,
        );
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        const handoffs = r.effects.filter((e) => e.kind === 'site-handoff');
        expect(handoffs).toHaveLength(1);
        expect(handoffs[0]).toMatchObject({
            lat: 10.5,
            lon: 20.5,
            address: 'Somewhere 1',
            jurisdictionId: 'xx-alpha',
        });
    });
});

// ── (A) coverage gating vs (B) open ─────────────────────────────────────────────────

describe('the honest-coverage gate — (A) vs (B) is one config value', () => {
    const cityOutside: SiteEntryState = {
        stage: 'city',
        focus: { lat: 48.85, lon: 2.35 },
        countryCode: null,
        jurisdictionId: null,
    };

    it('(A) blocks the descent INTO the parcel stage where nothing is registered', () => {
        const r = reduceSiteEntry(cityOutside, { type: 'site.entry.descend', lat: 48.85, lon: 2.35 }, GATED);
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.rejected).toMatch(/cannot answer here yet/i);
        // …and it says so as a fact about PRYZM, not about the law.
        expect(r.rejected).toMatch(/no zoning rule pack is registered/i);
    });

    it('(A) blocks the parcel SELECTION too, so there is no back door', () => {
        const parcelOutside: SiteEntryState = { ...cityOutside, stage: 'parcel' };
        const r = reduceSiteEntry(
            parcelOutside,
            { type: 'site.entry.select-parcel', lat: 48.85, lon: 2.35 },
            GATED,
        );
        expect(r.ok).toBe(false);
    });

    it('(A) leaves world/country/city freely navigable — you may always LOOK', () => {
        const world = reduceSiteEntry(
            INITIAL_SITE_ENTRY_STATE,
            { type: 'site.entry.descend', lat: 48.85, lon: 2.35 },
            GATED,
        );
        expect(world.ok).toBe(true);
        if (!world.ok) return;
        expect(world.next.stage).toBe('country');
        const city = reduceSiteEntry(world.next, { type: 'site.entry.descend', lat: 48.85, lon: 2.35 }, GATED);
        expect(city.ok).toBe(true);
    });

    it('(B) is the SAME machine with the gate lifted — mode is the only difference', () => {
        const blocked = reduceSiteEntry(cityOutside, { type: 'site.entry.descend', lat: 48.85, lon: 2.35 }, GATED);
        const allowed = reduceSiteEntry(cityOutside, { type: 'site.entry.descend', lat: 48.85, lon: 2.35 }, OPEN);
        expect(blocked.ok).toBe(false);
        expect(allowed.ok).toBe(true);
        if (!allowed.ok) return;
        expect(allowed.next.stage).toBe('parcel');
        // …and (B) still hands off honestly, with a null jurisdiction the site path sees.
        const sel = reduceSiteEntry(
            allowed.next,
            { type: 'site.entry.select-parcel', lat: 48.85, lon: 2.35 },
            OPEN,
        );
        expect(sel.ok).toBe(true);
        if (!sel.ok) return;
        expect(sel.effects.filter((e) => e.kind === 'site-handoff')[0]).toMatchObject({
            jurisdictionId: null,
        });
    });
});

// ── Camera projection ───────────────────────────────────────────────────────────────

describe('camera is a projection of the stage, never its input', () => {
    it('altitude bands are declared per stage and strictly decrease inward', () => {
        const alts = SITE_ENTRY_STAGES.map((s) => SITE_ENTRY_ALTITUDE_M[s]);
        for (let i = 1; i < alts.length; i++) expect(alts[i]!).toBeLessThan(alts[i - 1]!);
    });

    it('the same state always frames identically (recoverable after a re-mount)', () => {
        const s = run(GATED, [{ type: 'site.entry.focus-jurisdiction', jurisdictionId: 'xx-beta' }]);
        expect(cameraForState(s)).toEqual(cameraForState(s));
        expect(cameraForState(s)).toMatchObject({
            stage: 'city',
            altitudeM: SITE_ENTRY_ALTITUDE_M.city,
            ...extentCentre(BETA.extent),
        });
    });

    it('the untouched world stage frames a neutral globe, not Barcelona', () => {
        const cam = cameraForState(INITIAL_SITE_ENTRY_STATE);
        expect(cam.altitudeM).toBe(SITE_ENTRY_ALTITUDE_M.world);
        expect(isInBarcelona(cam.lat, cam.lon)).toBe(false);
    });

    it('country framing is DERIVED from the union of its jurisdictions, not hand-typed', () => {
        const country = listCoveredCountries([ALPHA, BETA])[0]!;
        expect(countryFramingPoint(country)).toEqual({ lat: 11.5, lon: 21.5 });
    });
});

// ── Panel copy: the honest answer ───────────────────────────────────────────────────

describe('panel copy — what the user sees when the answer is "not covered"', () => {
    it('the world stage lists only countries with a registered jurisdiction', () => {
        const p = describeSiteEntryPanel(INITIAL_SITE_ENTRY_STATE, GATED);
        expect(p.verdict).toBe('unknown');
        expect(p.actions.map((a) => a.label)).toEqual(['Xanadu — 2 covered areas']);
    });

    it('an empty registry produces an explicitly DARK globe, not a silent one', () => {
        const p = describeSiteEntryPanel(INITIAL_SITE_ENTRY_STATE, EMPTY_CTX);
        expect(p.actions).toHaveLength(0);
        expect(p.lines.join(' ')).toMatch(/no jurisdiction registered yet/i);
    });

    it('an uncovered country stage says NOT COVERED and does not NAME the country', () => {
        // We hold no country boundaries; naming one would be C58 §1.4 at the nav layer.
        const s: SiteEntryState = {
            stage: 'country',
            focus: { lat: 48.85, lon: 2.35 },
            countryCode: null,
            jurisdictionId: null,
        };
        const p = describeSiteEntryPanel(s, GATED);
        expect(p.verdict).toBe('not-covered');
        expect(p.title).toBe('Not covered yet');
        expect(p.lines.join(' ')).toMatch(/statement about PRYZM, not about the law/i);
        expect(p.lines.join(' ')).not.toMatch(/France|Paris/i);
    });

    it('an uncovered city stage explains the consequence, differently per mode', () => {
        const s: SiteEntryState = {
            stage: 'city',
            focus: { lat: 48.85, lon: 2.35 },
            countryCode: null,
            jurisdictionId: null,
        };
        expect(describeSiteEntryPanel(s, GATED).lines.join(' ')).toMatch(/cannot select a parcel here/i);
        expect(describeSiteEntryPanel(s, OPEN).lines.join(' ')).toMatch(/may still zoom in/i);
    });

    it('a covered stage states the pack count and NEVER invents a place statistic', () => {
        const s = run(GATED, [{ type: 'site.entry.focus-jurisdiction', jurisdictionId: 'xx-alpha' }]);
        const p = describeSiteEntryPanel(s, GATED);
        expect(p.verdict).toBe('covered');
        expect(p.title).toBe('Alphaville');
        expect(p.lines.join(' ')).toContain('2 zone codes have a curated rule pack');
        // Guard against the failure this design exists to prevent: a fabricated stat.
        expect(p.lines.join(' ')).not.toMatch(/population|inhabitants|GDP|average height/i);
    });

    it('the country panel refuses to imply NATIONAL coverage', () => {
        const s = run(GATED, [{ type: 'site.entry.focus-country', countryCode: 'XX' }]);
        expect(describeSiteEntryPanel(s, GATED).lines.join(' ')).toMatch(
            /does not cover the country as a whole/i,
        );
    });

    it('the "Zoom back out" action is disabled WITH a reason at the world stage', () => {
        const p = describeSiteEntryPanel(
            { stage: 'world', focus: null, countryCode: null, jurisdictionId: null },
            GATED,
        );
        // The world panel offers countries, not a back action — but where the action IS
        // offered it always carries a reason when disabled (disable-or-explain).
        const city = describeSiteEntryPanel(
            { stage: 'city', focus: { lat: 10.5, lon: 20.5 }, countryCode: 'XX', jurisdictionId: 'xx-alpha' },
            GATED,
        );
        const back = city.actions.find((a) => a.label === 'Zoom back out');
        expect(back).toBeDefined();
        expect(back!.unavailableReason).toBeUndefined();
        expect(p.actions.every((a) => a.unavailableReason == null)).toBe(true);
    });
});

// ── The coverage lookup is DERIVED FROM THE ENGINE (C60 §2) ─────────────────────────

describe('coverage is derived from the rule-pack registry, and cannot drift', () => {
    it('the editor adapter forwards the registry verbatim — no literals of its own', () => {
        const fromRegistry = listJurisdictionCoverage();
        const fromAdapter = siteEntryCoverageEntries();
        expect(fromAdapter).toHaveLength(fromRegistry.length);
        for (let i = 0; i < fromRegistry.length; i++) {
            expect(fromAdapter[i]!.jurisdictionId).toBe(fromRegistry[i]!.jurisdictionId);
            expect(fromAdapter[i]!.extent).toBe(fromRegistry[i]!.extent); // same object
            expect(fromAdapter[i]!.contains).toBe(fromRegistry[i]!.contains); // same function
        }
    });

    it("Barcelona's declared extent IS the constant the dispatcher routes on", () => {
        const bcn = siteEntryCoverageEntries().find((e) => e.jurisdictionId === BCN_JURISDICTION_ID);
        expect(bcn).toBeDefined();
        // Identity, not equality: a copy could be edited and drift; this cannot.
        expect(bcn!.extent).toBe(BARCELONA_BBOX);
        expect(bcn!.contains).toBe(isInBarcelona);
    });

    it("Barcelona's pack list is read live from the registry, not restated", () => {
        const bcn = siteEntryCoverageEntries().find((e) => e.jurisdictionId === BCN_JURISDICTION_ID)!;
        expect([...bcn.packZoneCodes].sort()).toEqual(
            [...registeredPackZoneCodes(BCN_JURISDICTION_ID)].sort(),
        );
        expect(bcn.packZoneCodes.length).toBeGreaterThan(0);
    });

    it('every registered jurisdiction lights up exactly where its own predicate says', () => {
        for (const e of siteEntryCoverageEntries()) {
            const c = extentCentre(e.extent);
            expect(jurisdictionAt(siteEntryCoverageEntries(), c.lat, c.lon)?.jurisdictionId).toBe(
                e.jurisdictionId,
            );
        }
    });

    it('a real Barcelona point resolves to the covered verdict end-to-end', () => {
        const entries = siteEntryCoverageEntries();
        const ctx: SiteEntryContext = { entries, mode: 'coverage-gated' };
        const s = run(ctx, [
            { type: 'site.entry.focus-jurisdiction', jurisdictionId: BCN_JURISDICTION_ID },
            // Plaça de Catalunya-ish — inside the metropolitan gate.
            { type: 'site.entry.descend', lat: 41.387, lon: 2.17 },
        ]);
        expect(s.stage).toBe('parcel');
        expect(describeSiteEntryPanel(s, ctx).verdict).toBe('covered');
    });

    it('a point outside every registered jurisdiction is refused the parcel stage', () => {
        const entries = siteEntryCoverageEntries();
        const ctx: SiteEntryContext = { entries, mode: 'coverage-gated' };
        // ⚠ FIXTURE MOVED (L-652). This used to be MADRID — which was correct when it was written
        // and became FALSE the day `es-28079-madrid` registered (L-608): the assertion was then
        // pinning "Madrid is uncovered", the opposite of the truth, and it failed. The replacement
        // is LISBON: real city, real ordinances (PDM Lisboa), and PRYZM holds none of them —
        // Portugal appears in the PARCEL provider registry but has no zoning rule pack, which is
        // exactly the state this case is about. The guard below makes the coupling explicit, so
        // the day Lisbon registers this fails with a legible reason instead of a bare `ok`.
        const LISBON = { lat: 38.7223, lon: -9.1393 };
        expect(
            jurisdictionAt(entries, LISBON.lat, LISBON.lon),
            'Lisbon is now registered — move this fixture to a still-uncovered city',
        ).toBeNull();
        expect(jurisdictionClaimAt(entries, LISBON.lat, LISBON.lon).kind).toBe('none');
        const city: SiteEntryState = {
            stage: 'city',
            focus: LISBON,
            countryCode: null,
            jurisdictionId: null,
        };
        const r = reduceSiteEntry(city, { type: 'site.entry.descend', ...LISBON }, ctx);
        expect(r.ok).toBe(false);
    });
});

// ── §JURISDICTION-SPECIFICITY (L-652) — the wrong-jurisdiction defect and its rule ───────────
//
// THE DEFECT. `jurisdictionAt` was FIRST-MATCH over registration order, and `BARCELONA_BBOX` is a
// loose METROPOLITAN proximity gate that FULLY CONTAINS the municipal boxes of L'Hospitalet,
// Badalona, Sant Boi and Cornellà — all four registered LATER. So every point in those four
// municipalities resolved to `es-08019-barcelona`: another municipality's land answered with
// Barcelona's packed numbers and Barcelona's citations, which is precisely what each of those
// registrations exists to prevent (their `packsByZone` is EMPTY because no human has verified that
// any of their claus equals Barcelona's). These cases pin the rule that fixed it, and — the part
// that matters for the future — pin that any NEW overlapping registration fails CI.

describe('§JURISDICTION-SPECIFICITY — the finer claim governs, and a tie is refused', () => {
    it('a coarser box listed FIRST does not swallow the municipal claim inside it', () => {
        // The synthetic reproduction of the exact defect: METRO is listed first and contains ALPHA.
        const ctx: readonly CoverageEntry[] = [METRO, ALPHA];
        expect(jurisdictionAt(ctx, 10.5, 20.5)?.jurisdictionId).toBe('xx-alpha');
        // …and the coarse claim still governs its own remainder.
        expect(jurisdictionAt(ctx, 9.5, 19.5)?.jurisdictionId).toBe('xx-metro');
    });

    it('registration ORDER is not load-bearing — both orderings give the same verdict', () => {
        for (const entries of [[METRO, ALPHA], [ALPHA, METRO]] as const) {
            expect(jurisdictionAt(entries, 10.5, 20.5)?.jurisdictionId).toBe('xx-alpha');
        }
    });

    it('an EQUALLY specific overlap is AMBIGUOUS — never a coin flip, in either order', () => {
        for (const entries of [[ALPHA, TWIN], [TWIN, ALPHA]] as const) {
            const r = jurisdictionClaimAt(entries, 10.75, 20.75);
            expect(r.kind).toBe('ambiguous');
            if (r.kind !== 'ambiguous') continue;
            expect(r.candidates.map((c) => c.jurisdictionId).sort()).toEqual(['xx-alpha', 'xx-twin']);
        }
        // …and it does NOT silently become a covered verdict.
        expect(jurisdictionAt([ALPHA, TWIN], 10.75, 20.75)).toBeNull();
    });

    it('an ambiguity is explained as an OVERLAP, never as "no rule pack is registered"', () => {
        // A false explanation of a refusal is the same class of defect as a false answer.
        const ctx: SiteEntryContext = { entries: [ALPHA, TWIN], mode: 'coverage-gated' };
        const p = describeSiteEntryPanel(
            { stage: 'city', focus: { lat: 10.75, lon: 20.75 }, countryCode: null, jurisdictionId: null },
            ctx,
        );
        expect(p.verdict).toBe('not-covered');
        expect(p.title).toBe('Overlapping jurisdictions');
        const copy = p.lines.join(' ');
        expect(copy).toMatch(/Two registered jurisdictions claim this point/i);
        expect(copy).toMatch(/Alphaville and Twinville|Twinville and Alphaville/);
        expect(copy).not.toMatch(/has no zoning rule pack registered/i);
        // Still a statement about PRYZM, never about the law (C60 §3 copy rule 2).
        expect(copy).toMatch(/statement about PRYZM, not about the law/i);
    });

    it('an ambiguous point cannot descend to the parcel stage — no coin-flipped site', () => {
        const ctx: SiteEntryContext = { entries: [ALPHA, TWIN], mode: 'coverage-gated' };
        const city: SiteEntryState = {
            stage: 'city',
            focus: { lat: 10.75, lon: 20.75 },
            countryCode: null,
            jurisdictionId: null,
        };
        expect(reduceSiteEntry(city, { type: 'site.entry.descend', lat: 10.75, lon: 20.75 }, ctx).ok).toBe(
            false,
        );
    });

    it('THE REGRESSION: real AMB points resolve to their OWN municipality, never Barcelona', () => {
        // Real WGS84 points inside each municipality — the same reference points the routing tests
        // in `@pryzm/site-parcel-data` use. Before the fix every one of these answered
        // `es-08019-barcelona`, i.e. Barcelona's ordinance cited on another town's land.
        const entries = siteEntryCoverageEntries();
        const cases: ReadonlyArray<readonly [string, number, number]> = [
            [LHOSPITALET_JURISDICTION_ID, 41.3593, 2.1004],
            [BADALONA_JURISDICTION_ID, 41.4450, 2.2480],
            [SANT_BOI_JURISDICTION_ID, 41.3430, 2.0390],
            [CORNELLA_JURISDICTION_ID, 41.3585, 2.0710],
        ];
        for (const [id, lat, lon] of cases) {
            // Barcelona's metropolitan gate genuinely claims the point — the rule, not the geometry,
            // is what decides. (If this stops being true the peel-off has become geometric and this
            // case no longer tests what it says it does.)
            expect(isInBarcelona(lat, lon), id).toBe(true);
            expect(jurisdictionAt(entries, lat, lon)?.jurisdictionId, id).toBe(id);
            const claim = jurisdictionClaimAt(entries, lat, lon);
            expect(claim.kind, id).toBe('resolved');
            if (claim.kind !== 'resolved') continue;
            // …and Barcelona is recorded as OUTRANKED, not as absent — the honest description.
            expect(claim.outranked.map((c) => c.jurisdictionId), id).toContain(BCN_JURISDICTION_ID);
        }
    });

    it('Barcelona itself is UNCHANGED — the fix peels off neighbours, it does not shrink Barcelona', () => {
        const entries = siteEntryCoverageEntries();
        // Passeig de Gràcia (Eixample) + Sants, the district adjacent to L'Hospitalet.
        for (const [lat, lon] of [[41.3916, 2.165], [41.375, 2.138]] as const) {
            expect(jurisdictionAt(entries, lat, lon)?.jurisdictionId).toBe(BCN_JURISDICTION_ID);
        }
    });

    it('the covered panel states the resolution it actually has, per registration', () => {
        // C60 §2.2 — a bbox is a coarse claim and must be labelled as one. This line used to read
        // "metropolitan-area resolution" for EVERY jurisdiction, which is false for the national
        // registrations and overstated the precision of their claim.
        const entries = siteEntryCoverageEntries();
        const ctx: SiteEntryContext = { entries, mode: 'coverage-gated' };
        const panelFor = (jurisdictionId: string) =>
            describeSiteEntryPanel(
                { stage: 'city', focus: null, countryCode: null, jurisdictionId },
                ctx,
            ).lines.join(' ');
        expect(panelFor(BCN_JURISDICTION_ID)).toMatch(/metropolitan-area resolution/);
        expect(panelFor(LHOSPITALET_JURISDICTION_ID)).toMatch(/municipal resolution/);
        expect(panelFor('nl-bestemmingsplan')).toMatch(/national resolution/);
    });
});

// ── C59 §2 invariant 5 — no live BIM pane behind the globe ──────────────────────────

describe('pane placement (C59 §2 invariant 5)', () => {
    it('requests the 3D Site SOLO, as C59 pane intents — never a direct renderer call', () => {
        const { assign, solo } = siteEntryPaneIntent('left');
        expect(assign).toEqual({ type: 'view.pane.assign', paneId: 'left', viewType: 'site-3d' });
        expect(solo).toEqual({ type: 'view.pane.solo', paneId: 'left' });
    });
});
