// §L-456 — the COMPLIANCE COMPARISON SECTION, as the user actually reads it.
//
// The L2 model already pins the three honesty rules IN THE DATA. These pin them IN THE UI,
// which is a separate risk: a panel can consume a perfectly honest `CapacityComparison` and
// still manufacture permission by colouring `unknown` green, by collapsing `no-limit` into
// `unknown`, or by summarising four unknowns and one pass as a clean bill of health.
//
//   RULE 1 — `renders all five statuses distinguishably` + `no-limit is not unknown`.
//   RULE 2 — `only an authoritative, fully-judged comparison may read as clear`.
//   RULE 3 — `an unmeasured metric renders as — plus its reason, never as 0`.
//
// Runs in the root vitest suite (happy-dom), asserting against a real parsed DOM rather than a
// string match, so a change that keeps the words but drops the distinction still fails.

import { describe, it, expect } from 'vitest';
import { buildCapacityComparison, type MeasuredDesign } from '@pryzm/site-parcel-data';
import type { BuildableEnvelope } from '@pryzm/schemas';
import {
    buildCapacitySectionHtml,
    renderMeasurementCaveatLinesHtml,
    resolveCapacityVerdict,
    CAPACITY_STATUS_STYLE,
} from '../capacityPanelSection';
import { measureAuthoredDesign, type DesignMeasurement } from '../designMeasurement';

// ── Fixtures ────────────────────────────────────────────────────────────────────────────────

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

const NOTHING: MeasuredDesign = {
    footprintM2: null, grossFloorAreaM2: null, netFloorAreaM2: null, heightM: null, floors: null,
};

/** The measurement of an EMPTY project — every metric null, each with a stated reason. */
const EMPTY_MEASUREMENT: DesignMeasurement = measureAuthoredDesign({
    levels: [], floorPlates: [], rooms: [], elementLevelIds: [],
});

function render(
    design: MeasuredDesign,
    env: BuildableEnvelope = envelope(),
    measurement: DesignMeasurement | null = null,
    maxFloors: number | null = null,
): HTMLElement {
    const cmp = buildCapacityComparison(env, design, { maxFloors });
    const host = document.createElement('div');
    host.innerHTML = buildCapacitySectionHtml(cmp, measurement);
    return host;
}

const statusesIn = (host: HTMLElement): string[] =>
    [...host.querySelectorAll('[data-testid="capacity-row"]')]
        .map((el) => el.getAttribute('data-status') ?? '');

const rowByMetric = (host: HTMLElement, metric: string): HTMLElement =>
    host.querySelector(`[data-testid="capacity-row"][data-metric="${metric}"]`) as HTMLElement;

// ─────────────────────────────────────────────────────────────────────────────────────────────

describe('L-456 panel — the section renders the proyecto-de-ejecución line items', () => {
    it('renders one row per metric, in the order an architect reads a capacity table', () => {
        const host = render({ ...NOTHING, footprintM2: 60, grossFloorAreaM2: 150 });
        const metrics = [...host.querySelectorAll('[data-testid="capacity-row"]')]
            .map((el) => el.getAttribute('data-metric'));
        expect(metrics).toEqual(['footprint', 'grossFloorArea', 'netFloorArea', 'height', 'floors']);
        expect(host.querySelector('[data-testid="capacity-comparison"]')).not.toBeNull();
    });

    it('shows the local legal term next to the label so it matches the ordinance', () => {
        const host = render({ ...NOTHING, footprintM2: 60 });
        expect(rowByMetric(host, 'footprint').textContent).toContain('ocupación');
        expect(rowByMetric(host, 'grossFloorArea').textContent).toContain('superficie construida');
        expect(rowByMetric(host, 'netFloorArea').textContent).toContain('superficie útil');
    });

    it('shows remaining headroom and utilisation for a judged row', () => {
        const host = render({ ...NOTHING, footprintM2: 60 });
        const txt = rowByMetric(host, 'footprint').textContent ?? '';
        expect(txt).toMatch(/60% of the permitted/);
        expect(txt).toMatch(/left/);
    });

    it('renders nothing at all when there is no comparison to show', () => {
        const host = document.createElement('div');
        host.innerHTML = buildCapacitySectionHtml(null, null);
        expect(host.innerHTML).toBe('');
    });
});

describe('L-456 UI — HONESTY RULE 1: unknown is not compliant, and no-limit is not unknown', () => {
    it('renders all five statuses distinguishably — distinct label AND colour AND attribute', () => {
        const styles = Object.values(CAPACITY_STATUS_STYLE);
        const labels = styles.map((s) => s.text);
        const colours = styles.map((s) => `${s.bg}|${s.fg}|${s.border}`);
        expect(new Set(labels).size).toBe(styles.length);
        expect(new Set(colours).size).toBe(styles.length);
        expect(new Set(Object.keys(CAPACITY_STATUS_STYLE)).size).toBe(5);
    });

    it('an UNKNOWN row never renders the within/pass treatment', () => {
        // No published height limit, but a 30 m design. The dangerous defect is a green "within".
        const host = render(
            { ...NOTHING, heightM: 30 },
            envelope({ maxHeight_m: null }),
        );
        const row = rowByMetric(host, 'height');
        expect(row.getAttribute('data-status')).toBe('unknown');
        const chip = row.querySelector('[data-testid="capacity-status"]') as HTMLElement;
        expect(chip.textContent).toContain('Not checked');
        expect(chip.textContent).not.toContain('Within');
        expect(chip.getAttribute('style')).not.toContain(CAPACITY_STATUS_STYLE.within.bg);
        // …and the tooltip says so in words, not only in colour.
        expect(chip.getAttribute('title')).toMatch(/not a pass/i);
    });

    it('NO-LIMIT and UNKNOWN render differently — the ordinance being silent is a finding', () => {
        // FAR absent ⇒ the ordinance sets no floor-area ceiling by that mechanism (`no-limit`).
        const noLimit = render({ ...NOTHING, grossFloorAreaM2: 500 }, envelope({ maxFAR: null }));
        const nlRow = rowByMetric(noLimit, 'grossFloorArea');
        expect(nlRow.getAttribute('data-status')).toBe('no-limit');
        const nlChip = nlRow.querySelector('[data-testid="capacity-status"]') as HTMLElement;
        expect(nlChip.textContent).toContain('No limit set');
        expect(nlRow.textContent).toContain('no limit');

        // Nothing measured against a real limit ⇒ genuinely `unknown`.
        const unknown = render(NOTHING, envelope());
        const uRow = rowByMetric(unknown, 'grossFloorArea');
        expect(uRow.getAttribute('data-status')).toBe('unknown');
        const uChip = uRow.querySelector('[data-testid="capacity-status"]') as HTMLElement;

        // Different words, different colours, different attribute. All three, not just one.
        expect(nlChip.textContent).not.toBe(uChip.textContent);
        expect(nlChip.getAttribute('style')).not.toBe(uChip.getAttribute('style'));
        expect(nlChip.getAttribute('title')).not.toBe(uChip.getAttribute('title'));
    });

    it('a storey cap PRYZM does not hold reads "Not checked", never "No limit set"', () => {
        // The envelope carries `maxFloors: null` both when a pack derived no cap and when the
        // ordinance sets none. Rendering "No limit set" would assert the law permits unlimited
        // storeys — a finding invented out of a gap in our own data.
        const host = render({ ...NOTHING, floors: 9 }, envelope(), null, null);
        const row = rowByMetric(host, 'floors');
        expect(row.getAttribute('data-status')).toBe('unknown');
        expect(row.textContent).not.toContain('No limit set');
        expect(row.textContent).toContain('Not checked');
    });

    it('an ALL-UNKNOWN comparison never reads as a pass', () => {
        const host = render(NOTHING, envelope({ maxHeight_m: null, maxFAR: null }), EMPTY_MEASUREMENT);
        const verdict = host.querySelector('[data-testid="capacity-verdict"]') as HTMLElement;
        expect(verdict.getAttribute('data-tone')).toBe('unjudged');
        expect(verdict.textContent).toMatch(/Not enough to judge/i);
        // No row may claim a pass, and the only green in the palette must be absent.
        expect(statusesIn(host)).not.toContain('within');
        expect(host.innerHTML).not.toContain(CAPACITY_STATUS_STYLE.within.bg);
    });

    it('never uses the word "compliant" except to disclaim a determination', () => {
        const host = render({ ...NOTHING, footprintM2: 10 }, envelope({ confidence: 'authoritative' } as Partial<BuildableEnvelope>));
        const text = host.textContent ?? '';
        for (const m of text.matchAll(/compl\w+/gi)) {
            expect(text.slice(Math.max(0, m.index - 30), m.index + 30)).toMatch(/not a compliance/i);
        }
    });
});

describe('L-456 UI — HONESTY RULE 2: a verdict inherits the weakest input', () => {
    const judged: MeasuredDesign = {
        footprintM2: 60, grossFloorAreaM2: 150, netFloorAreaM2: 120, heightM: 9, floors: 3,
    };

    it('an ESTIMATED basis can never reach the clear tone', () => {
        const v = resolveCapacityVerdict(buildCapacityComparison(envelope(), judged, { maxFloors: 4 })!);
        expect(v.tone).not.toBe('clear');
        expect(v.tone).toBe('indicative');
        expect(v.qualifier).toMatch(/indicative only, not a compliance determination/i);
    });

    it('a STRUCTURED basis is still indicative — published is not determined', () => {
        const cmp = buildCapacityComparison(
            envelope({ confidence: 'structured' } as Partial<BuildableEnvelope>), judged, { maxFloors: 4 },
        )!;
        const v = resolveCapacityVerdict(cmp);
        expect(cmp.isIndicativeOnly).toBe(true);
        expect(v.tone).toBe('indicative');
        expect(v.qualifier).toContain('structured');
    });

    it('ONLY an authoritative, fully-judged, nothing-unknown comparison reads as clear', () => {
        const cmp = buildCapacityComparison(
            envelope({ confidence: 'authoritative' } as Partial<BuildableEnvelope>), judged, { maxFloors: 4 },
        )!;
        const v = resolveCapacityVerdict(cmp);
        expect(cmp.unknownCount).toBe(0);
        expect(v.tone).toBe('clear');
        expect(v.qualifier).toBeNull();
        // …and even then the standing disclaimer is still rendered.
        const host = document.createElement('div');
        host.innerHTML = buildCapacitySectionHtml(cmp, null);
        expect((host.querySelector('[data-testid="capacity-footer"]')?.textContent ?? ''))
            .toMatch(/not a building-code review/i);
    });

    it('an unknown row downgrades an otherwise-clean authoritative result to partial', () => {
        const cmp = buildCapacityComparison(
            envelope({ confidence: 'authoritative', maxHeight_m: null } as Partial<BuildableEnvelope>),
            judged,
            { maxFloors: 4 },
        )!;
        const v = resolveCapacityVerdict(cmp);
        expect(v.tone).toBe('partial');
        expect(v.qualifier).toMatch(/could not be checked/i);
    });

    it('an exceedance outranks everything else in the headline', () => {
        const host = render({ ...judged, grossFloorAreaM2: 400 });
        const verdict = host.querySelector('[data-testid="capacity-verdict"]') as HTMLElement;
        expect(verdict.getAttribute('data-tone')).toBe('over');
        expect(verdict.textContent).toMatch(/Exceeds 1 limit/);
        expect(rowByMetric(host, 'grossFloorArea').getAttribute('data-status')).toBe('over');
    });
});

describe('L-456 UI — HONESTY RULE 3: measure, never infer', () => {
    it('an unmeasured metric renders as — with the adapter REASON, never as 0', () => {
        const host = render(NOTHING, envelope(), EMPTY_MEASUREMENT);
        const row = rowByMetric(host, 'grossFloorArea');
        const txt = row.textContent ?? '';
        expect(txt).toContain('Designed —');
        expect(txt).not.toMatch(/Designed\s*0/);
        const reason = row.querySelector('[data-testid="capacity-unmeasured-reason"]');
        expect(reason).not.toBeNull();
        expect(reason!.textContent).toMatch(/Nothing has been authored/i);
    });

    it('states WHY a specific metric is missing, distinctly per metric', () => {
        const measurement = measureAuthoredDesign({
            levels: [{ id: 'L0', name: 'Ground', elevation: 0, height: 3 }],
            floorPlates: [],
            rooms: [],
            elementLevelIds: ['L0'],
        });
        const host = render(measurement.design, envelope(), measurement);
        expect(rowByMetric(host, 'grossFloorArea').textContent)
            .toMatch(/No floor slabs are authored/i);
        expect(rowByMetric(host, 'netFloorArea').textContent)
            .toMatch(/No rooms are defined/i);
        // …and the metrics it COULD measure carry no reason line.
        expect(rowByMetric(host, 'floors').querySelector('[data-testid="capacity-unmeasured-reason"]'))
            .toBeNull();
    });

    it('a reported height always carries the rasant divergence (L-584), never a bare number', () => {
        const measurement = measureAuthoredDesign({
            levels: [{ id: 'L0', name: 'Ground', elevation: 0, height: 3 }],
            floorPlates: [{ levelId: 'L0', ring: [{ x: 0, z: 0 }, { x: 5, z: 0 }, { x: 5, z: 4 }, { x: 0, z: 4 }], holes: [] }],
            rooms: [{ levelId: 'L0', areaM2: 18 }],
            elementLevelIds: ['L0'],
        });
        const host = render(measurement.design, envelope(), measurement);
        expect(rowByMetric(host, 'height').textContent)
            .toMatch(/not from the rasant at the fa/i);
        expect((host.textContent ?? '')).toMatch(/How these were measured/i);
    });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §GIS-ENVELOPE-FULL-SECTIONS (L-1651) — the embed options that let the card host this section
// inside a first-class fold WITHOUT a second producer. Defaults must stay byte-compatible.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe('L-1651 embed opts — hosting the section inside a card fold', () => {
    const measured = () => measureAuthoredDesign({
        levels: [{ id: 'L0', name: 'Ground', elevation: 0, height: 3 }],
        floorPlates: [{ levelId: 'L0', ring: [{ x: 0, z: 0 }, { x: 5, z: 0 }, { x: 5, z: 4 }, { x: 0, z: 4 }], holes: [] }],
        rooms: [{ levelId: 'L0', areaM2: 18 }],
        elementLevelIds: ['L0'],
    });

    it('default output is unchanged: internal title + internal caveats disclosure both render', () => {
        const m = measured();
        const cmp = buildCapacityComparison(envelope(), m.design, { maxFloors: null });
        const html = buildCapacitySectionHtml(cmp, m);
        expect(html).toContain('Designed vs permitted');
        expect(html).toContain('How these were measured');
    });

    it('omitTitle drops ONLY the internal heading (the fold summary is the heading)', () => {
        const m = measured();
        const cmp = buildCapacityComparison(envelope(), m.design, { maxFloors: null });
        const html = buildCapacitySectionHtml(cmp, m, { omitTitle: true });
        expect(html).not.toContain('Designed vs permitted');
        // The content survives: verdict + all five rows.
        const host = document.createElement('div');
        host.innerHTML = html;
        expect(host.querySelector('[data-testid="capacity-verdict"]')).not.toBeNull();
        expect(host.querySelectorAll('[data-testid="capacity-row"]').length).toBe(5);
    });

    it('omitMeasurementCaveats drops ONLY the internal caveats disclosure (promoted to its own fold)', () => {
        const m = measured();
        const cmp = buildCapacityComparison(envelope(), m.design, { maxFloors: null });
        const html = buildCapacitySectionHtml(cmp, m, { omitMeasurementCaveats: true });
        expect(html).not.toContain('How these were measured');
        // The per-row honesty is untouched: the height row still carries the rasant caveat.
        const host = document.createElement('div');
        host.innerHTML = html;
        expect(rowByMetric(host, 'height').textContent).toMatch(/not from the rasant at the fa/i);
        // …and the standing footer disclaimer still renders for every embedding.
        expect(host.querySelector('[data-testid="capacity-footer"]')).not.toBeNull();
    });

    it('renderMeasurementCaveatLinesHtml renders every caveat and escapes markup', () => {
        const html = renderMeasurementCaveatLinesHtml(['a & b', '<script>x</script>']);
        expect(html).toContain('a &amp; b');
        expect(html).not.toContain('<script>');
        expect(html).toContain('&lt;script&gt;');
    });
});
