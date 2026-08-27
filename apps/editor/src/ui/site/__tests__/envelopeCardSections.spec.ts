// §GIS-ENVELOPE-FULL-SECTIONS (L-1650..L-1653) — the buildable-envelope card's RICH SECTIONS,
// as the GIS panel actually hosts them.
//
// Founder 2026-08-21: the GIS-hosted card shows the summary numbers but not the sections that
// were "fully wired" on the older surface — DESIGNED VS PERMITTED, How these were measured,
// Full site & massing data (ordinance limits · massing potential · per storey), Why these
// numbers?. "Wire them all with unfoldable sections."
//
// ROOT CAUSE (L-1650), pinned here at the RENDER-OUTPUT level, not by a source grep:
//   1. The full card nested the capacity comparison AND the full-site block behind ONE
//      "Site data & capacity" disclosure — the site block being a SECOND <details> inside it,
//      so the founder's sections sat two folds deep and never read as sections of the card.
//   2. `measureAuthoredDesign` legitimately returns `caveats: []` for a nothing-authored
//      project, and the ONLY "How these were measured" rendering lived behind
//      `caveats.length > 0` — so in the founder's exact repro (live commit, nothing authored)
//      that section was UNREACHABLE, not merely folded.
//   3. The card's measurement join swallowed failures as `''` — failure and emptiness rendered
//      as the same value, the §CONTEXT-DATA-HONESTY conflation.
//
// THE FIX (L-1651/L-1652): four FIRST-CLASS, default-collapsed <details> folds on the card —
// Designed vs permitted · How these were measured · Full site & massing data · Why these
// numbers? — built by the pure `envelopeCardSections.ts` (same extraction pattern that created
// `capacityPanelSection.ts`: ONE producer, testable renderer; C06 §13.3 intact). Every arm of
// every state renders what it CAN and names what it cannot: a failed measurement is
// distinguishable from an empty model, and an unfoldable section is never silently absent.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildCapacityComparison } from '@pryzm/site-parcel-data';
import type { BuildableEnvelope } from '@pryzm/schemas';
import { buildCapacitySectionHtml } from '../capacityPanelSection';
import {
    measureAuthoredDesign,
    HEIGHT_DATUM_CAVEAT,
    type AuthoredModelSnapshot,
    type DesignMeasurement,
} from '../designMeasurement';
import {
    buildDesignedVsPermittedFold,
    buildHowMeasuredFold,
    // §GIS-LEGACY-DETERMINATION-ESCAPE (L-1970..L-1974) — the reduced card's route out.
    buildLegacyDeterminationNoticeHtml,
    LEGACY_RECOMPUTE_BTN_TESTID,
    LEGACY_RECOMPUTE_LABEL,
    resolveBlockConstructedSourceText,
    // §MANUALENV159 (L-12640) — the context-derived/user-supplied study massing section + entry.
    buildContextStudySectionHtml,
    buildStudyHeightEntryHtml,
    CONTEXT_STUDY_SECTION_TESTID,
    STUDY_HEIGHT_INPUT_TESTID,
    STUDY_HEIGHT_SETBACK_INPUT_TESTID,
    STUDY_HEIGHT_SAVE_BTN_TESTID,
    STUDY_HEIGHT_STATUS_TESTID,
    // §OLDPROJ168 — the stored-determination notice moved here from GISAreaLayout, so the
    // hydrated-date pin below now asserts the producer + its exported id rather than a raw
    // literal in a file that no longer owns it.
    buildStoredDeterminationNoticeHtml,
    STORED_DETERMINATION_TESTID,
} from '../envelopeCardSections';
import { CONTEXT_STUDY_DEFAULT_MIN_SAMPLE_SIZE, type ContextDerivedStudyEnvelopeResult } from '@pryzm/site-parcel-data';
import type { UserSuppliedStudyHeightRecord } from '../userSuppliedStudyHeightState';

// ── Fixtures (mirroring capacityPanelSection.spec / designMeasurement.spec) ────────────────

function envelope(over: Partial<BuildableEnvelope> = {}): BuildableEnvelope {
    return {
        status: 'ok',
        confidence: 'estimated-ruleset',
        zoneCode: 'generic-urban',
        insetPolygon: [{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 10 }, { x: 0, z: 10 }],
        insetAreaM2: 100,
        maxHeight_m: 12,
        maxFAR: 2,
        maxVolumeM3: null,
        derivation: [],
        caveats: [],
        ...over,
    } as unknown as BuildableEnvelope;
}

const rect = (x0: number, z0: number, x1: number, z1: number) => [
    { x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 },
];

function house(): AuthoredModelSnapshot {
    return {
        levels: [
            { id: 'L0', name: 'Ground', elevation: 0, height: 3 },
            { id: 'L1', name: 'First', elevation: 3, height: 3 },
        ],
        floorPlates: [
            { levelId: 'L0', ring: rect(0, 0, 8, 8), holes: [] },
            { levelId: 'L1', ring: rect(0, 0, 8, 6), holes: [] },
        ],
        rooms: [{ levelId: 'L0', areaM2: 30 }],
        elementLevelIds: ['L0', 'L1'],
    };
}

/** The founder's exact repro: a live envelope determination, NOTHING authored yet. */
const NOTHING_AUTHORED: DesignMeasurement = measureAuthoredDesign({
    levels: [], floorPlates: [], rooms: [], elementLevelIds: [],
});
const HOUSE_MEASURED: DesignMeasurement = measureAuthoredDesign(house());

function mount(html: string): HTMLElement {
    const host = document.createElement('div');
    host.innerHTML = html;
    return host;
}

function cmpFor(measurement: DesignMeasurement, env: BuildableEnvelope = envelope()) {
    return buildCapacityComparison(env, measurement.design, { maxFloors: null });
}

// ─────────────────────────────────────────────────────────────────────────────────────────────

describe('L-1650 RED evidence — why the sections were absent on the GIS-hosted card', () => {
    it('the capacity section ALONE renders no "How these were measured" for a nothing-authored project (caveats=[] made it unreachable, not folded)', () => {
        const html = buildCapacitySectionHtml(cmpFor(NOTHING_AUTHORED), NOTHING_AUTHORED);
        expect(html).not.toContain('How these were measured');
        // …and yet the same state HAS things to explain — five NOT CHECKED rows. The section the
        // founder asked for must exist in this state and say why there is nothing to explain.
    });
});

describe('L-1651 — Designed vs permitted as a FIRST-CLASS, default-collapsed fold', () => {
    it('renders a top-level <details> with a stable testid, default collapsed', () => {
        const host = mount(buildDesignedVsPermittedFold(
            cmpFor(NOTHING_AUTHORED), NOTHING_AUTHORED, { joinFailed: false }));
        const details = host.querySelector('details[data-testid="envelope-section-designed-vs-permitted"]');
        expect(details).not.toBeNull();
        expect(details!.hasAttribute('open')).toBe(false);
    });

    it('the summary line CARRIES THE FACT — the verdict headline, not a bare label', () => {
        const host = mount(buildDesignedVsPermittedFold(
            cmpFor(NOTHING_AUTHORED), NOTHING_AUTHORED, { joinFailed: false }));
        const summary = host.querySelector('summary');
        expect(summary?.textContent).toContain('Designed vs permitted');
        expect(summary?.textContent).toContain('Not enough to judge this design');
    });

    it('the body holds the full five-row comparison — chips, designed —, stated reasons', () => {
        const host = mount(buildDesignedVsPermittedFold(
            cmpFor(NOTHING_AUTHORED), NOTHING_AUTHORED, { joinFailed: false }));
        const rows = host.querySelectorAll('details [data-testid="capacity-row"]');
        expect(rows.length).toBe(5);
        // Designed side of an empty project is '—' with a reason — never 0 (honesty rule 3).
        expect(host.textContent).not.toMatch(/Designed\s+0/);
        expect(host.querySelectorAll('[data-testid="capacity-unmeasured-reason"]').length)
            .toBeGreaterThan(0);
    });

    it('an authored design reaches the judged arm with utilisation + headroom', () => {
        const host = mount(buildDesignedVsPermittedFold(
            cmpFor(HOUSE_MEASURED), HOUSE_MEASURED, { joinFailed: false }));
        expect(host.querySelector('summary')?.textContent)
            .toContain('Within the limits that could be checked');
        expect(host.textContent).toMatch(/of the permitted/);
    });

    it('does NOT duplicate "How these were measured" inside (promoted to its own fold)', () => {
        const html = buildDesignedVsPermittedFold(
            cmpFor(HOUSE_MEASURED), HOUSE_MEASURED, { joinFailed: false });
        expect(html).not.toContain('How these were measured');
    });

    it('does not repeat the section heading inside the fold body (the summary IS the heading)', () => {
        const host = mount(buildDesignedVsPermittedFold(
            cmpFor(HOUSE_MEASURED), HOUSE_MEASURED, { joinFailed: false }));
        const matches = (host.textContent ?? '').match(/Designed vs permitted/gi) ?? [];
        expect(matches.length).toBe(1);
    });
});

describe('L-1652 — HONEST ARMS: failure, emptiness and absence are three different values', () => {
    it('a measurement-join FAILURE renders a stated failure, never an absent section', () => {
        const html = buildDesignedVsPermittedFold(null, null, { joinFailed: true });
        expect(html).not.toBe('');
        const host = mount(html);
        const details = host.querySelector('details[data-testid="envelope-section-designed-vs-permitted"]');
        expect(details).not.toBeNull();
        expect(details!.getAttribute('data-state')).toBe('join-failed');
        expect(host.textContent).toMatch(/could not be computed/i);
        // Never rendered as zeros or as a pass.
        expect(host.querySelectorAll('[data-status="within"]').length).toBe(0);
    });

    it('a legitimately absent comparison (no envelope at all) stays an absent section', () => {
        expect(buildDesignedVsPermittedFold(null, null, { joinFailed: false })).toBe('');
    });

    it('How-measured: nothing authored → the section EXISTS and says why there is nothing to explain', () => {
        const host = mount(buildHowMeasuredFold(NOTHING_AUTHORED, { joinFailed: false }));
        const details = host.querySelector('details[data-testid="envelope-section-how-measured"]');
        expect(details).not.toBeNull();
        expect(details!.getAttribute('data-state')).toBe('nothing-authored');
        expect(host.textContent).toMatch(/[Nn]othing has been authored/);
    });

    it('How-measured: authored but nothing measurable → a DIFFERENT arm from nothing-authored', () => {
        // Levels exist and carry elements, but no plates/heights → caveats [] with storeys > 0.
        const m = measureAuthoredDesign({
            levels: [{ id: 'L0', name: 'Ground', elevation: 0, height: null }],
            floorPlates: [], rooms: [], elementLevelIds: ['L0'],
        });
        expect(m.caveats.length).toBe(0);
        expect(m.designedStoreyCount).toBeGreaterThan(0);
        const host = mount(buildHowMeasuredFold(m, { joinFailed: false }));
        const details = host.querySelector('details[data-testid="envelope-section-how-measured"]');
        expect(details!.getAttribute('data-state')).toBe('unmeasurable');
        expect(host.textContent).not.toMatch(/[Nn]othing has been authored/);
    });

    it('How-measured: measurement FAILURE is distinguishable from both empty arms', () => {
        const host = mount(buildHowMeasuredFold(null, { joinFailed: true }));
        const details = host.querySelector('details[data-testid="envelope-section-how-measured"]');
        expect(details).not.toBeNull();
        expect(details!.getAttribute('data-state')).toBe('measure-failed');
        expect(host.textContent).toMatch(/failed/i);
    });

    it('How-measured: a real measurement lists every caveat, including the rasant caveat (L-584)', () => {
        const host = mount(buildHowMeasuredFold(HOUSE_MEASURED, { joinFailed: false }));
        expect(host.querySelector('details')!.getAttribute('data-state')).toBe('measured');
        for (const caveat of HOUSE_MEASURED.caveats) {
            expect(host.textContent).toContain(caveat);
        }
        expect(HOUSE_MEASURED.caveats).toContain(HEIGHT_DATUM_CAVEAT);
    });
});

describe('L-1651 — narrow-rail containment: the folds must not blow out the GIS panel width', () => {
    const folds = () => [
        buildDesignedVsPermittedFold(cmpFor(HOUSE_MEASURED), HOUSE_MEASURED, { joinFailed: false }),
        buildHowMeasuredFold(HOUSE_MEASURED, { joinFailed: false }),
        buildDesignedVsPermittedFold(null, null, { joinFailed: true }),
        buildHowMeasuredFold(null, { joinFailed: true }),
    ];
    it('every fold declares max-width:100% + min-width:0 and no fixed pixel width', () => {
        for (const html of folds()) {
            const style = mount(html).querySelector('details')!.getAttribute('style') ?? '';
            expect(style).toContain('max-width:100%');
            expect(style).toContain('min-width:0');
            expect(style).not.toMatch(/(?<!max-|min-)width:\s*\d+px/);
        }
    });
});

describe('L-1653 wiring — GISAreaLayout hosts the four folds first-class (source pin)', () => {
    // Supplementary to the render-output tests above: proves the ONE producer actually
    // interpolates these builders into BOTH card templates and dropped the one-fold nesting.
    // `__dirname` is the house pattern for source pins under this config (panelDefaults.spec) —
    // happy-dom's `URL` is not a Node URL, so `fileURLToPath(import.meta.url)` throws here.
    const src = readFileSync(resolve(__dirname, '../../layout/GISAreaLayout.ts'), 'utf8');

    it('imports the pure fold builders (one producer, testable renderer — the capacityPanelSection pattern)', () => {
        expect(src).toContain("from '../site/envelopeCardSections'");
        expect(src).toContain('buildDesignedVsPermittedFold');
        expect(src).toContain('buildHowMeasuredFold');
    });

    it('the single "Site data & capacity" wrapper fold is GONE — sections are first-class', () => {
        expect(src).not.toContain('Site data &amp; capacity');
    });

    it('the full card interpolates all four sections + the measured fold reaches the refusal card too', () => {
        expect((src.match(/\$\{safeMeasuredSection\}/g) ?? []).length).toBeGreaterThanOrEqual(2);
        expect((src.match(/\$\{safeCapacitySection\}/g) ?? []).length).toBeGreaterThanOrEqual(2);
        expect(src).toContain('${safeSiteDataBlock}');
        expect(src).toContain('${safeWhyBlock}');
    });

    it('the site-data and why folds carry stable section testids', () => {
        expect(src).toContain('data-testid="envelope-section-site-data"');
        expect(src).toContain('data-testid="envelope-section-why"');
    });
});

describe('§L-1654 wiring — the card HYDRATES the persisted determination (source pin)', () => {
    // Render-output proof of the write/read halves lives in
    // packages/stores/__tests__/site-commands.zoning-footprint.test.ts (persist + schema
    // round-trip) and apps/editor/__tests__/envelopeDeterminationHydration.test.ts (the
    // accessor). This pins the CARD's use of them: hydrate-not-re-derive, the dated banner on
    // both templates, and the reduced card demoted to the legacy arm.
    const src = readFileSync(resolve(__dirname, '../../layout/GISAreaLayout.ts'), 'utf8');

    it('reads the stored determination through the ONE accessor, session-solved first', () => {
        expect(src).toContain('resolveStoredBuildableDetermination');
        // Hydration only fills the load-path gap — the live session envelope stays preferred.
        expect(src).toMatch(/hydrated \? hydrated\.envelope : live/);
    });

    it('a hydrated card wears its date: the banner renders on BOTH the full and refusal templates', () => {
        // ⚠ AMENDED (§OLDPROJ168) — this asserted the RAW LITERAL `data-testid="envelope-hydrated-at"`
        // appeared in GISAreaLayout.ts. The literal moved: the notice's PRODUCER is now the pure
        // module beside the other card sections, which owns the id as an exported constant. That is
        // the SAME move the neighbouring reduced-card test already documents ("the SENTENCE is
        // unchanged, its PRODUCER moved"), so this pin is updated to follow it rather than being
        // deleted — the invariant it defends (a hydrated card wears its date, on BOTH templates) is
        // unchanged and still asserted below.
        expect(STORED_DETERMINATION_TESTID).toBe('envelope-hydrated-at');
        expect(buildStoredDeterminationNoticeHtml('2026-08-25T16:52:26.016Z', { refreshAvailable: false }))
            .toContain(`data-testid="${STORED_DETERMINATION_TESTID}"`);
        // BOTH templates still emit the line — the half the original test was really protecting.
        expect((src.match(/\$\{safeHydratedLine\}/g) ?? []).length).toBeGreaterThanOrEqual(2);
        expect(src).toContain('Stored determination');
    });

    it('the reduced card is now the LEGACY arm and says the project predates stored determinations', () => {
        // §GIS-LEGACY-DETERMINATION-ESCAPE (L-1971) — the SENTENCE is unchanged, its PRODUCER
        // moved. It used to be inline markup in `renderReducedEnvelopePanel`; it is now built by
        // the pure module beside the other card sections so both of its arms are unit-pinned.
        // The pin therefore follows the fact rather than the file: the card must still render
        // the statement, and it must do so through the one builder.
        expect(src).toContain('buildLegacyDeterminationNoticeHtml({');
        expect(buildLegacyDeterminationNoticeHtml({ recomputeAvailable: true }))
            .toContain('before PRYZM stored full');
    });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §BCN-OV-CITATION (L-1656) — the card cites the article the ENGINE actually applied.
//
// Handoff from BCN1 (L-1660..L-1663): both Barcelona demo parcels now resolve a REAL
// `block-constructed` clau-18 OV determination, but the card hard-coded "PGM Art. 242.2" for
// every `block-constructed` envelope. Wrong article on a real determination = L-583 mis-citation
// on the one surface whose proposition is that it quotes the law correctly. BOTH arms are pinned
// so neither citation can silently swap into the other's case.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe('L-1656 — block-constructed cites the instrument the engine used', () => {
    const OV_ROW = { constraint: 'explicitArea.footprintBinding' };
    const DEPTH_ROW = { constraint: 'alignment.depth' };

    it('OV arm: an explicitArea.footprintBinding row cites the published per-site volumetric ordering', () => {
        const txt = resolveBlockConstructedSourceText([DEPTH_ROW, OV_ROW]);
        expect(txt).toContain('published per-site volumetric ordering');
        expect(txt).toContain('OV_Trames');
        expect(txt).toContain('Art. 306');
        expect(txt).toContain('Art. 327.2');
        // ⛔ The wrong article must not appear on this arm at all.
        expect(txt).not.toContain('242.2');
        // The honesty qualifier survives on BOTH arms — constructed is not certified.
        expect(txt).toContain('not an official municipal certificate');
    });

    it('Art. 242.2 arm: without that row the Catastro-block construction keeps its own citation', () => {
        const txt = resolveBlockConstructedSourceText([DEPTH_ROW]);
        expect(txt).toContain('PGM Art. 242.2');
        expect(txt).toContain('real Catastro block');
        expect(txt).not.toContain('OV_Trames');
        expect(txt).toContain('not an official municipal certificate');
    });

    it('the two arms are genuinely different sentences (neither may collapse into the other)', () => {
        expect(resolveBlockConstructedSourceText([OV_ROW]))
            .not.toBe(resolveBlockConstructedSourceText([]));
    });

    it('an absent/empty derivation falls back to Art. 242.2 and never throws', () => {
        expect(resolveBlockConstructedSourceText([])).toContain('242.2');
        expect(resolveBlockConstructedSourceText(null)).toContain('242.2');
        expect(resolveBlockConstructedSourceText(undefined)).toContain('242.2');
    });

    it('the card reads the resolver rather than a hard-coded article (source pin)', () => {
        const src = readFileSync(resolve(__dirname, '../../layout/GISAreaLayout.ts'), 'utf8');
        expect(src).toContain('resolveBlockConstructedSourceText(env.derivation)');
        // The literal that used to be hard-coded must no longer live in the card.
        expect(src).not.toContain('Constructed per PGM Art. 242.2 from the real Catastro block');
    });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
// §GIS-LEGACY-DETERMINATION-ESCAPE (L-1970..L-1974) — the REDUCED card's route OUT.
//
// Founder 2026-08-21 on production `071a7b2c`: *"I requested to have all the data of the
// selected parcel: many more data — why is it still not present on an OLD project?"*
//
// The feature IS in his build (`a54a49fd` is an ancestor of the live SHA). What is missing on
// an OLD project is the SOLVED DETERMINATION every rich section hangs off:
// `Parcel.buildableDetermination` is `null` for anything saved before L-1654, so
// `refreshEnvelopePanel` takes the L-445 REDUCED arm and the founder gets a max height and
// nothing else — including none of the "Full site & massing data" fold, which is where the
// parcel's depth/perimeter/bbox/per-storey figures (§L-586, the "many more data") live.
//
// L-1652 made that arm HONEST — it names every withheld section. It was still UNACTIONABLE:
// the only route it named was "re-commit the parcel", a GEOMETRY-touching action proposed as
// the fix for a PROVENANCE gap. Meanwhile the safe, geometry-free recompute built by §L-1587
// was wired to the SIBLING branch only (the one where no card renders at all).
//
// These pin the escape hatch and — more importantly — the honesty it must carry: the original
// solve is NOT recoverable, what the button produces is a NEW determination dated today, and it
// may legitimately refuse.
// ─────────────────────────────────────────────────────────────────────────────────────────

describe('§GIS-LEGACY-DETERMINATION-ESCAPE (L-1970..L-1974) — the reduced card can reach the full data', () => {
    const AVAILABLE = buildLegacyDeterminationNoticeHtml({ recomputeAvailable: true });
    const UNAVAILABLE = buildLegacyDeterminationNoticeHtml({
        recomputeAvailable: false,
        unavailableReason: 'No committed parcel boundary in this project.',
    });
    const FAILED = buildLegacyDeterminationNoticeHtml({
        recomputeAvailable: false,
        failedReason: 'The site context could not be resolved.',
    });

    it('THE DEFECT: the available arm carries a LIVE button, so an old project is no longer stuck', () => {
        expect(AVAILABLE).toContain('data-state="legacy-recompute-available"');
        expect(AVAILABLE).toContain(`data-testid="${LEGACY_RECOMPUTE_BTN_TESTID}"`);
        expect(AVAILABLE).toContain(LEGACY_RECOMPUTE_LABEL);
        // Live means NOT disabled — a disabled button here would be the defect, not the fix.
        expect(AVAILABLE).not.toContain('disabled');
    });

    it('the unavailable arm is DISABLED and states its reason — never live-and-inert (L-1187)', () => {
        expect(UNAVAILABLE).toContain('data-state="legacy-recompute-unavailable"');
        expect(UNAVAILABLE).toContain('disabled');
        expect(UNAVAILABLE).toContain('aria-disabled="true"');
        // The reason is shown in the BODY, not only hidden in a title attribute.
        expect(UNAVAILABLE).toContain('No committed parcel boundary in this project.');
    });

    it('a FAILED re-solve says so in words and does not re-offer a button that just failed', () => {
        expect(FAILED).toContain('data-state="legacy-recompute-failed"');
        expect(FAILED).toContain('The re-solve could not run.');
        expect(FAILED).toContain('The site context could not be resolved.');
        // ⭐ It must say the saved state is untouched: "I pressed it and now I do not know what
        // I have" is worse than the dead end this button replaced.
        expect(FAILED).toMatch(/untouched|Nothing was changed/);
        expect(FAILED).not.toContain(`data-testid="${LEGACY_RECOMPUTE_BTN_TESTID}"`);
    });

    it('⭐ C84 EI-1b — available, unavailable and failed are THREE different renderings', () => {
        const arms = new Set([AVAILABLE, UNAVAILABLE, FAILED]);
        expect(arms.size).toBe(3);
        const states = [AVAILABLE, UNAVAILABLE, FAILED]
            .map((h) => /data-state="([^"]+)"/.exec(h)?.[1] ?? null);
        expect(new Set(states).size).toBe(3);
        expect(states).not.toContain(null);
    });

    it('⭐ NEVER FABRICATE: the notice says the ORIGINAL solve is not recoverable', () => {
        // The whole hazard of a "refresh"-shaped button on a provenance gap is that the user
        // reads the result as the restored original. It is not, and cannot be.
        expect(AVAILABLE).toContain('not recoverable');
        expect(AVAILABLE).toContain('never written down');
        // "Restore"/"refresh" both imply the original comes back. It cannot.
        expect(AVAILABLE.toLowerCase()).not.toContain('restore');
        expect(AVAILABLE.toLowerCase()).not.toContain('refresh');
    });

    it('⭐ NEVER FABRICATE RECENCY, INVERTED: what the button produces is dated TODAY', () => {
        // L-1654's rule is that a STORED snapshot must not be presented as freshly derived.
        // The inverse binds equally: a FRESH re-solve must not be presented as the recovered
        // original — a rule pack that moved between the two dates makes them different answers.
        expect(AVAILABLE).toContain('new determination dated today');
        expect(AVAILABLE).toContain('rule pack');
        expect(AVAILABLE).toMatch(/not recover the original solve/);
        expect(AVAILABLE).toMatch(/the two could differ/);
    });

    it('⭐ C63 — the copy promises a DETERMINATION, never a positive answer', () => {
        // A refusal is a determination. A button that implies "press this and you get numbers"
        // sets up the founder to read a cited refusal as a failure of the button.
        expect(AVAILABLE).toContain('refusal');
        expect(AVAILABLE).toMatch(/that is a determination too/i);
    });

    it('it names the withheld sections INCLUDING the parcel data the founder asked for', () => {
        // The founder said "all the data of the SELECTED PARCEL: many more data". That data is
        // the "Full site & massing data" fold (§L-586: depth, perimeter, bbox, per-storey),
        // which is gated on the determination — so the notice must name it explicitly rather
        // than let him believe the parcel simply has no data.
        expect(AVAILABLE).toContain('Designed-vs-permitted');
        expect(AVAILABLE).toContain('ordinance limits');
        expect(AVAILABLE).toContain('massing potential');
        expect(AVAILABLE).toContain('per-storey table');
        expect(AVAILABLE).toContain('full site &amp; parcel data');
        expect(AVAILABLE).toContain('fabricate provenance');
    });

    it('it promises the fix is PERSISTENT — the full card returns on every future load', () => {
        // Otherwise the founder re-presses it on every reload, which is the same dead end with
        // extra steps.
        expect(AVAILABLE).toMatch(/on every future load/);
    });

    it('it states that the boundary is NOT touched (a provenance fix, not a geometry action)', () => {
        expect(AVAILABLE).toMatch(/does not move, redraw or re-derive/);
        expect(AVAILABLE).toContain('already committed here');
    });

    it('C08 §3.1 — an injected reason is escaped, not interpolated raw', () => {
        const evil = buildLegacyDeterminationNoticeHtml({
            recomputeAvailable: false,
            unavailableReason: '<script>alert(1)</script>',
        });
        expect(evil).not.toContain('<script>');
        expect(evil).toContain('&lt;script&gt;');
    });

    it('never throws on a missing reason and still renders the disabled arm with words', () => {
        const bare = buildLegacyDeterminationNoticeHtml({ recomputeAvailable: false });
        expect(bare).toContain('data-state="legacy-recompute-unavailable"');
        expect(bare).toContain('disabled');
        expect(bare.replace(/<[^>]*>/g, '').trim().length).toBeGreaterThan(0);
    });

    // ── SOURCE PINS — the wiring, not just the builder ────────────────────────────────────

    it('the reduced card RENDERS the builder and WIRES the button (not a second copy)', () => {
        const src = readFileSync(resolve(__dirname, '../../layout/GISAreaLayout.ts'), 'utf8');
        expect(src).toContain('buildLegacyDeterminationNoticeHtml({');
        expect(src).toContain('wireLegacyRecompute(panel)');
        // ⭐ The old DEAD END must be gone: it named a geometry-touching action as the only
        // route out of a provenance gap, and named no button at all.
        expect(src).not.toContain('Re-commit the parcel once to solve, store and');
    });

    it('⭐ C06 §13.3 — there is exactly ONE recompute producer, with two callers', () => {
        const src = readFileSync(resolve(__dirname, '../../layout/GISAreaLayout.ts'), 'utf8');
        // The re-solve itself is invoked in exactly one place. `window.pryzmRecomputeEnvelopeCard`
        // and the reduced card's button both route through `recomputeEnvelopeDetermination`.
        const callSites = src.match(/reapplyZoningForActiveSite\(ctx\)/g) ?? [];
        expect(callSites.length).toBe(1);
        expect(src).toContain('window.pryzmRecomputeEnvelopeCard = (): boolean => recomputeEnvelopeDetermination()');
    });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §MANUALENV159 (L-12640) — TASK A: the study/refusal that was computed but never rendered.
// ─────────────────────────────────────────────────────────────────────────────────────────────
//
// §ENVAMS148 + SIG-NL2 built `buildContextDerivedStudyEnvelope` and opened its gate, but the
// result — ok OR a typed refusal — was only ever written to `contextDerivedStudyEnvelopeState.ts`
// "for a future rail panel to read". No rail panel read it: the founder's console proved a SECOND
// refusal (`insufficient-neighbour-sample`) that was invisible on the card itself, which is why he
// asked four times. These tests are the RED evidence for that gap (a `null` renders nothing — the
// old, true behaviour) and the GREEN fix (a refused/ok result now reads off the card).

const STUDY_RING = rect(0, 0, 20, 10);

/** Mirrors the founder's own live-measured parcel (SIG-NL2): 43 neighbours, 36 real, median 16.2 m. */
function derivedOkResult(): ContextDerivedStudyEnvelopeResult {
    return {
        ok: true,
        study: {
            status: 'context-derived-study',
            footprintPolygon: STUDY_RING,
            footprintAreaM2: 200,
            setback_m: 0,
            maxHeight_m: 16.2,
            heightBasis: {
                method: 'median-neighbour-height',
                sourceLabel: 'OpenStreetMap context buildings (measured/derived heights only)',
                sampledCount: 36,
                excludedAssumedCount: 7,
                radius_m: 60,
                medianHeight_m: 16.2,
                minHeight_m: 3,
                maxHeight_m: 29.6,
                sampledAtIso: '2026-08-27T00:00:00.000Z',
            },
            disclaimer: 'INDICATIVE ONLY — not a compliance determination. Derived from real '
                + 'neighbouring-building heights as a study starting point, not from the applicable '
                + 'ordinance. PRYZM cannot judge compliance against it.',
        },
    };
}

/** The founder's own literal ask: 24.5 m, typed, not measured. */
function userSuppliedOkResult(): ContextDerivedStudyEnvelopeResult {
    return {
        ok: true,
        study: {
            status: 'context-derived-study',
            footprintPolygon: STUDY_RING,
            footprintAreaM2: 200,
            setback_m: 0,
            maxHeight_m: 24.5,
            heightBasis: {
                method: 'user-supplied',
                sourceLabel: 'Height supplied by you',
                suppliedHeight_m: 24.5,
                sampledAtIso: '2026-08-27T00:00:00.000Z',
            },
            disclaimer: 'INDICATIVE ONLY — not a compliance determination. No adopted plan '
                + 'published a buildable envelope at this point; this massing height was SUPPLIED '
                + 'BY YOU, not measured or derived by PRYZM from any source. PRYZM cannot judge '
                + 'compliance against it.',
        },
    };
}

// Not widened to `ContextDerivedStudyEnvelopeResult` — kept as the exact literal shape so
// `.realSampleCount` below is a direct (narrowed) read, not a re-guarded ternary.
const refusedInsufficientSample = {
    ok: false as const,
    reason: 'insufficient-neighbour-sample' as const,
    realSampleCount: 1,
    excludedAssumedCount: 2,
};

describe('§MANUALENV159 RED evidence — a computed study/refusal that was never rendered', () => {
    it('`study === null` renders NOTHING — the exact "computed but no rail panel reads it" state before this fix', () => {
        expect(buildContextStudySectionHtml(null)).toBe('');
    });
});

describe('§MANUALENV159 TASK A — buildContextStudySectionHtml surfaces the refusal', () => {
    it('a REFUSED study is a first-class, default-collapsed fold with a stable testid', () => {
        const host = mount(buildContextStudySectionHtml(refusedInsufficientSample));
        const details = host.querySelector(`details[data-testid="${CONTEXT_STUDY_SECTION_TESTID}"]`);
        expect(details).not.toBeNull();
        expect(details!.hasAttribute('open')).toBe(false);
        expect(details!.getAttribute('data-state')).toBe('refused-insufficient-neighbour-sample');
    });

    it('names how many neighbours were found, how many carried a REAL height, and the threshold — the exact numbers the founder could previously only see in a console line', () => {
        const host = mount(buildContextStudySectionHtml(refusedInsufficientSample));
        expect(host.textContent).toContain(String(refusedInsufficientSample.realSampleCount));
        expect(host.textContent).toContain(String(CONTEXT_STUDY_DEFAULT_MIN_SAMPLE_SIZE));
        expect(host.textContent).toMatch(/not enough/i);
        // The excluded-assumed count is also named, never silently dropped.
        expect(host.textContent).toContain('2');
        expect(host.textContent).toContain('fabricated placeholder');
    });

    it('a `degenerate-footprint` refusal reads a DIFFERENT body sentence — never the sample-size wording', () => {
        const host = mount(buildContextStudySectionHtml({ ok: false, reason: 'degenerate-footprint', realSampleCount: 5, excludedAssumedCount: 0 }));
        const details = host.querySelector(`details[data-testid="${CONTEXT_STUDY_SECTION_TESTID}"]`)!;
        expect(details.getAttribute('data-state')).toBe('refused-degenerate-footprint');
        // Shares the summary line with the sample-size refusal (both are "not enough data to build
        // a study"), but the BODY explanation must be the geometry reason, never the sample count
        // wording — a setback problem and a sparse-neighbourhood problem are different facts.
        expect(host.textContent).toMatch(/setback/i);
        expect(host.textContent).not.toContain('real, measured or tagged height');
        expect(host.textContent).not.toContain(String(CONTEXT_STUDY_DEFAULT_MIN_SAMPLE_SIZE));
    });
});

describe('§MANUALENV159 TASK A/B — the study renderer serves BOTH source arms, distinctly', () => {
    it('a DERIVED (median-of-neighbours) study badges "Context-derived study" — never "supplied by you"', () => {
        const host = mount(buildContextStudySectionHtml(derivedOkResult()));
        expect(host.textContent).toContain('Context-derived study');
        expect(host.textContent?.toLowerCase()).not.toContain('supplied by you');
        expect(host.textContent).toContain('16.2 m');
        expect(host.textContent).toContain('36'); // sampledCount
    });

    it('a USER-SUPPLIED study badges "Height supplied by you" — never "Context-derived study", never presented as measured', () => {
        const host = mount(buildContextStudySectionHtml(userSuppliedOkResult()));
        expect(host.textContent).toContain('Height supplied by you');
        expect(host.textContent).not.toContain('Context-derived study');
        expect(host.textContent).toContain('24.5 m');
        expect(host.textContent).toContain('SUPPLIED BY YOU');
    });

    it('PROVENANCE STAYS DISTINCT — the two arms never render the same `data-state`', () => {
        const derivedState = mount(buildContextStudySectionHtml(derivedOkResult()))
            .querySelector('details')!.getAttribute('data-state');
        const suppliedState = mount(buildContextStudySectionHtml(userSuppliedOkResult()))
            .querySelector('details')!.getAttribute('data-state');
        expect(derivedState).toBe('rendered-derived');
        expect(suppliedState).toBe('rendered-user-supplied');
        expect(derivedState).not.toBe(suppliedState);
    });

    it('NEVER satisfies a "Designed vs permitted" verdict or carries an ordinance citation — a study is not a determination', () => {
        const host = mount(buildContextStudySectionHtml(userSuppliedOkResult()));
        expect(host.textContent).not.toMatch(/designed vs permitted/i);
        expect(host.querySelector('a[href]')).toBeNull(); // no citation link of any kind
    });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §DVP170 (L-12820) — the study section's ONE new line: designed height vs the study's reference
// height. Never a `CapacityStatus` chip, never "compliant"/"exceeds", always basis-labelled.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe('§DVP170 — Designed vs this study (reference only)', () => {
    it('absent when no measurement is given — never renders "0 m designed"', () => {
        const host = mount(buildContextStudySectionHtml(derivedOkResult()));
        expect(host.querySelector('[data-testid="context-study-vs-designed"]')).toBeNull();
    });

    it('absent when the authored model measured no height (e.g. no storey-height recorded) — a stated absence, not a fabricated 0', () => {
        const noHeight: DesignMeasurement = measureAuthoredDesign({
            levels: [{ id: 'L0', name: 'Ground', elevation: 0, height: null }],
            floorPlates: [],
            rooms: [],
            elementLevelIds: ['L0'],
        });
        expect(noHeight.design.heightM).toBeNull();
        const host = mount(buildContextStudySectionHtml(derivedOkResult(), noHeight));
        expect(host.querySelector('[data-testid="context-study-vs-designed"]')).toBeNull();
    });

    it('renders both real numbers, labelled with the SAME basis words as the badge above it — never re-derived wording', () => {
        const measurement = measureAuthoredDesign(house()); // heightM = 6 (see fixture)
        const host = mount(buildContextStudySectionHtml(derivedOkResult(), measurement));
        const block = host.querySelector('[data-testid="context-study-vs-designed"]');
        expect(block).not.toBeNull();
        const txt = block!.textContent ?? '';
        expect(txt).toContain('6.0 m');     // designed height
        expect(txt).toContain('16.2 m');    // the study's median height (derivedOkResult fixture)
        expect(txt).toContain('Context-derived study'); // same label the badge above already uses
    });

    it('a user-supplied study labels the comparison "Height supplied by you" and states user-supplied basis explicitly', () => {
        const measurement = measureAuthoredDesign(house());
        const host = mount(buildContextStudySectionHtml(userSuppliedOkResult(), measurement));
        const block = host.querySelector('[data-testid="context-study-vs-designed"]');
        expect(block!.textContent).toContain('Height supplied by you');
        expect(block!.textContent).toContain('24.5 m');
        expect(block!.textContent).toMatch(/basis: user-supplied/i);
    });

    it('NEVER reuses the compliance vocabulary — no within/at-limit/over/no-limit chip, and says outright it is not a compliance check', () => {
        const measurement = measureAuthoredDesign(house());
        const host = mount(buildContextStudySectionHtml(derivedOkResult(), measurement));
        const block = host.querySelector('[data-testid="context-study-vs-designed"]')!;
        expect(block.querySelector('[data-testid="capacity-status"]')).toBeNull();
        expect(block.textContent).toMatch(/not a compliance check/i);
        expect(block.textContent).not.toMatch(/\bcompliant\b/i);
        // No colour drawn from the real compliance palette (green/red) — reference-only styling.
        expect(block.getAttribute('style') ?? '').not.toContain('#eef7ee'); // CAPACITY_STATUS_STYLE.within.bg
        expect(block.getAttribute('style') ?? '').not.toContain('#fdecea'); // .over.bg
    });

    it('states the numeric difference in neutral, non-verdict language ("below/above this study reference")', () => {
        const measurement = measureAuthoredDesign(house()); // designed heightM = 6
        const host = mount(buildContextStudySectionHtml(derivedOkResult(), measurement)); // study 16.2 m
        const txt = host.querySelector('[data-testid="context-study-vs-designed"]')!.textContent ?? '';
        expect(txt).toMatch(/10\.2 m below this study reference/);
        expect(txt).not.toMatch(/over|exceed/i);
    });
});

describe('§MANUALENV159 TASK B — buildStudyHeightEntryHtml, the manual height input', () => {
    it('renders an empty height field and a zeroed setback when nothing was ever saved', () => {
        const host = mount(buildStudyHeightEntryHtml(null));
        const heightInput = host.querySelector(`[data-testid="${STUDY_HEIGHT_INPUT_TESTID}"]`) as HTMLInputElement;
        const setbackInput = host.querySelector(`[data-testid="${STUDY_HEIGHT_SETBACK_INPUT_TESTID}"]`) as HTMLInputElement;
        expect(heightInput).not.toBeNull();
        expect(heightInput.value).toBe('');
        expect(setbackInput.value).toBe('0');
    });

    it('PREFILLS from a saved project decision — re-opening the card shows what was last typed, not a blank field', () => {
        const saved: UserSuppliedStudyHeightRecord = { heightM: 24.5, setbackM: 1.5, savedAtIso: '2026-08-27T00:00:00.000Z' };
        const host = mount(buildStudyHeightEntryHtml(saved));
        const heightInput = host.querySelector(`[data-testid="${STUDY_HEIGHT_INPUT_TESTID}"]`) as HTMLInputElement;
        const setbackInput = host.querySelector(`[data-testid="${STUDY_HEIGHT_SETBACK_INPUT_TESTID}"]`) as HTMLInputElement;
        expect(heightInput.value).toBe('24.5');
        expect(setbackInput.value).toBe('1.5');
    });

    it('the save button and status line carry stable testids for the wiring layer to find', () => {
        const host = mount(buildStudyHeightEntryHtml(null));
        expect(host.querySelector(`[data-testid="${STUDY_HEIGHT_SAVE_BTN_TESTID}"]`)).not.toBeNull();
        expect(host.querySelector(`[data-testid="${STUDY_HEIGHT_STATUS_TESTID}"]`)).not.toBeNull();
    });

    it('states plainly that this is the user\'s own number, not a measurement', () => {
        const host = mount(buildStudyHeightEntryHtml(null));
        expect(host.textContent?.toLowerCase()).toContain('not a measurement');
    });
});

describe('§MANUALENV159 — SOURCE PINS: the card actually calls these builders and wires the button', () => {
    it('the refusal-card branch in GISAreaLayout.ts RENDERS the study section + entry form and WIRES the save button (not a second copy)', () => {
        const src = readFileSync(resolve(__dirname, '../../layout/GISAreaLayout.ts'), 'utf8');
        // §DVP170 (L-12820) — the founder's own measured design now rides along so the study
        // section can add its "designed vs this study" reference line; NOT a second measurement
        // pass — it reuses `capacityJoin.measurement`, the exact object already computed above
        // for the "Designed vs permitted" fold.
        expect(src).toContain('buildContextStudySectionHtml(studyResult, capacityJoin.measurement)');
        expect(src).toContain('buildStudyHeightEntryHtml(savedStudyHeight)');
        expect(src).toContain('wireStudyHeightEntry(panel)');
        expect(src).toContain('getContextDerivedStudyEnvelope(');
        expect(src).toContain('applyUserSuppliedStudyHeight(');
    });

    it('the entry is offered on a genuine data-absence or coverage gap, never on the "no envelope applies" legal card', () => {
        const src = readFileSync(resolve(__dirname, '../../layout/GISAreaLayout.ts'), 'utf8');
        // The condition gating `safeStudyHeightEntry` must be `isAbsent || isGap` — not
        // unconditional (which would offer it on the settled "no envelope applies" card too) and
        // not `isGap` alone (which would drop the founder's own `no-plan-at-point` case).
        const match = src.match(/const safeStudyHeightEntry = \(([^)]+)\)/);
        expect(match).not.toBeNull();
        expect(match![1].replace(/\s+/g, ' ').trim()).toBe('isAbsent || isGap');
    });
});
