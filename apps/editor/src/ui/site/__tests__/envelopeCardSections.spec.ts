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
    resolveBlockConstructedSourceText,
} from '../envelopeCardSections';

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
        expect(src).toContain('data-testid="envelope-hydrated-at"');
        expect((src.match(/\$\{safeHydratedLine\}/g) ?? []).length).toBeGreaterThanOrEqual(2);
        expect(src).toContain('Stored determination');
    });

    it('the reduced card is now the LEGACY arm and says the project predates stored determinations', () => {
        expect(src).toContain('before PRYZM stored full');
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
