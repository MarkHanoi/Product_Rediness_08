/**
 * §26.6.2 (L-13046) — the setback register's RENDERER: a dropdown, one row per edge, and each
 * row's label the link that lights THAT edge through the ONE store (§26.6 rule 2).
 */

import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildParcelLawModel } from '../parcel/parcelLawModel';
import { buildSetbackRegister } from '../setbackRegisterModel';
import {
    buildSetbackRegisterSection,
    SETBACK_REGISTER_ABSENT_TESTID,
    SETBACK_REGISTER_ARM_ATTR,
    SETBACK_REGISTER_CLASS_ATTR,
    SETBACK_REGISTER_ROW_PREFIX,
    SETBACK_REGISTER_TESTID,
    SETBACK_REGISTER_UNKNOWN_NOTE_TESTID,
} from '../setbackRegisterSection';
import { __resetSiteHighlightForTests, getSiteHighlight, SITE_HIGHLIGHT_ATTR } from '../siteGeometryHighlight';
import { wireSiteHighlightRows } from '../siteHighlightRowControl';

afterEach(() => {
    __resetSiteHighlightForTests();
    document.body.replaceChildren();
});

const RECT = [{ x: 0, z: 0 }, { x: 40, z: 0 }, { x: 40, z: 20 }, { x: 0, z: 20 }];

function envelope(): never {
    return {
        insetPolygon: [{ x: 3, z: 3 }, { x: 37, z: 3 }, { x: 37, z: 17 }, { x: 3, z: 17 }],
        insetAreaM2: 476, maxHeight_m: 18, farLimitedHeight_m: null, maxFloors: 6, maxFAR: null,
        maxCoverage: null, maxVolumeM3: 8568, footprintIsUpperBound: false, confidence: 'structured',
        granularity: 'parcel', status: 'ok', refusal: null, zoneCode: 'R1',
        derivation: [
            { constraint: 'setback.front', value: 5, source: 'pack', ordinanceRef: 'Art. 12.1', fieldProvenance: 'published-structured' },
            { constraint: 'setback.side', value: 3, source: 'pack', ordinanceRef: null, fieldProvenance: 'estimated' },
        ],
        caveats: [], tiers: [], permittedUse: [],
    } as never;
}

const mount = (edgeClassifications: readonly string[] | undefined, open = false): HTMLDetailsElement => {
    const model = buildParcelLawModel({ parcelRing: RECT, edgeClassifications, identity: null, envelope: envelope() });
    const el = buildSetbackRegisterSection(buildSetbackRegister(model), { open });
    document.body.appendChild(el);
    return el;
};

describe('§26.6.2 — a DROPDOWN, collapsed by default, that still states its digest', () => {
    it('is a <details>, closed unless the host says open, with the digest in its summary', () => {
        const el = mount(['front', 'side', 'rear', 'side']);
        expect(el.tagName).toBe('DETAILS');
        expect(el.getAttribute('data-testid')).toBe(SETBACK_REGISTER_TESTID);
        expect(el.open).toBe(false);
        expect(el.querySelector('summary')!.textContent).toContain('Setbacks per edge');
        expect(el.querySelector('summary')!.textContent).toContain('4 edges');
        expect(mount(['front', 'side', 'rear', 'side'], true).open).toBe(true);
    });

    it('renders ONE row per edge, carrying the ARM and the CLASS as attributes a spec can read', () => {
        const el = mount(['front', 'side', 'rear', 'unclassified']);
        const rows = el.querySelectorAll(`[data-testid^="${SETBACK_REGISTER_ROW_PREFIX}"]`);
        expect(rows).toHaveLength(4);
        expect(rows[0]!.getAttribute(SETBACK_REGISTER_ARM_ATTR)).toBe('applied');
        expect(rows[0]!.getAttribute(SETBACK_REGISTER_CLASS_ATTR)).toBe('front');
        expect(rows[0]!.textContent).toContain('5.0 m setback applies');
        expect(rows[0]!.textContent).toContain('Art. 12.1');
        expect(rows[2]!.getAttribute(SETBACK_REGISTER_ARM_ATTR)).toBe('not-derived');
        expect(rows[3]!.getAttribute(SETBACK_REGISTER_ARM_ATTR)).toBe('class-unknown');
        expect(rows[3]!.getAttribute(SETBACK_REGISTER_CLASS_ATTR)).toBe('unclassified');
        // The §10.1 note appears exactly because one class is unknown.
        expect(el.querySelector(`[data-testid="${SETBACK_REGISTER_UNKNOWN_NOTE_TESTID}"]`)).not.toBeNull();
    });

    it('omits the §10.1 note when every edge is classified', () => {
        const el = mount(['front', 'side', 'rear', 'side']);
        expect(el.querySelector(`[data-testid="${SETBACK_REGISTER_UNKNOWN_NOTE_TESTID}"]`)).toBeNull();
    });

    it('with no parcel renders the missing-READ sentence and no rows', () => {
        const model = buildParcelLawModel({ parcelRing: null, edgeClassifications: undefined, identity: null, envelope: envelope() });
        const el = buildSetbackRegisterSection(buildSetbackRegister(model));
        expect(el.querySelector(`[data-testid="${SETBACK_REGISTER_ABSENT_TESTID}"]`)).not.toBeNull();
        expect(el.querySelectorAll(`[data-testid^="${SETBACK_REGISTER_ROW_PREFIX}"]`)).toHaveLength(0);
    });
});

describe('§26.6 rule 2 — each row\'s label is the link that lights THAT edge, through the ONE store', () => {
    it('every row label is a highlight control carrying edge:<index>, and clicking it writes the store', () => {
        const el = mount(['front', 'side', 'rear', 'side']);
        const buttons = [...el.querySelectorAll<HTMLButtonElement>(`button[${SITE_HIGHLIGHT_ATTR}]`)];
        expect(buttons.map((b) => b.getAttribute(SITE_HIGHLIGHT_ATTR))).toEqual(['edge:0', 'edge:1', 'edge:2', 'edge:3']);
        expect(wireSiteHighlightRows(el)).toBe(4);
        buttons[2]!.click();
        expect(getSiteHighlight()).toBe('edge:2');
        expect(buttons[2]!.getAttribute('aria-pressed')).toBe('true');
        expect(buttons[0]!.getAttribute('aria-pressed')).toBe('false');
        // The click does not toggle the <details> it sits in.
        expect(el.open).toBe(false);
    });

    it('a fresh render reads the store — the pressed edge stays pressed across a re-render', () => {
        const first = mount(['front', 'side', 'rear', 'side']);
        wireSiteHighlightRows(first);
        first.querySelector<HTMLButtonElement>(`button[${SITE_HIGHLIGHT_ATTR}="edge:1"]`)!.click();
        const again = mount(['front', 'side', 'rear', 'side']);
        expect(again.querySelector<HTMLButtonElement>(`button[${SITE_HIGHLIGHT_ATTR}="edge:1"]`)!.getAttribute('aria-pressed')).toBe('true');
    });
});

describe('§26.6.2 — the renderer decides nothing and has no HTML sink (source pins)', () => {
    const src = readFileSync(resolve(__dirname, '../setbackRegisterSection.ts'), 'utf8');
    const model = readFileSync(resolve(__dirname, '../setbackRegisterModel.ts'), 'utf8');

    it('renders through createElement + textContent only', () => {
        expect(src).not.toMatch(/innerHTML|insertAdjacentHTML|outerHTML\s*=/);
        expect(src).toContain('buildSiteHighlightLabelEl(');
    });

    it('the model is PURE and reads the classification through the ONE determination, never the raw array', () => {
        expect(model).not.toMatch(/document\.|innerHTML|createElement|window/);
        // The header may NAME the C19 field; the code never READS it — the determination is upstream.
        expect(model).not.toMatch(/model\.edgeClassifications|input\.edgeClassifications/);
        expect(model).toContain('edge.classification');
    });
});
