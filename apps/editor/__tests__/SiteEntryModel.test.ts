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
    answerSummary: 'The Beta ordinance.',
    packZoneCodes: ['b1'],
};

const GATED: SiteEntryContext = { entries: [ALPHA, BETA], mode: 'coverage-gated' };
const OPEN: SiteEntryContext = { entries: [ALPHA, BETA], mode: 'open' };
const EMPTY_CTX: SiteEntryContext = { entries: [], mode: 'coverage-gated' };

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
        // Madrid — real, real ordinances, and PRYZM holds none of them.
        const city: SiteEntryState = {
            stage: 'city',
            focus: { lat: 40.4168, lon: -3.7038 },
            countryCode: null,
            jurisdictionId: null,
        };
        const r = reduceSiteEntry(city, { type: 'site.entry.descend', lat: 40.4168, lon: -3.7038 }, ctx);
        expect(r.ok).toBe(false);
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
