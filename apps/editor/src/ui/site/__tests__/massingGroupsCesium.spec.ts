// ADR-0383 S8 (3D half) — the authored prisms carry their BLOCK, a click selects the whole block,
// and a non-member recedes without changing colour.
//
// ADR-0383 D6 · C59 §2.10 · C84 EI-9 · §L-616 · §CTX-ABS-SEAT.
//
// ⚠ THE INSTRUMENT, AND ITS LIMIT, STATED BEFORE THE FIRST ARM.
// `renderSpaceEnvelopes`, `clearSpaceEnvelopes` and the LEFT_CLICK handler are PRIVATE members of
// `CesiumViewport`, behind a live `Cesium.Viewer` that needs WebGL. This suite runs in happy-dom.
// So these arms read the SOURCE — the instrument `siteEnvelopeFaceDragCesium.spec.ts` already uses
// on this same class, for the same reason.
//
// ⛔ SOURCE ARMS ARE STRICTLY WEAKER THAN BEHAVIOURAL ONES, and this file does not pretend
// otherwise. They prove the wiring is PRESENT, in the RIGHT CHANNEL, and RELEASED on dispose. They
// do NOT prove that clicking a prism in a real scene selects a block. The behavioural half lives
// where it can execute: `massingGroupEmphasis.spec.ts` pins the composed alpha numerically and
// `massingGroupSection.spec.ts` drives the shared channel end to end in the DOM.
//
// ⭐ AND ONE ARM HERE IS GENUINELY BEHAVIOURAL: the emphasis this file's renderer applies is
// `composeMassingGroupEmphasis`, which IS executed below against the same inputs the renderer
// hands it. That is the part most likely to be silently wrong, and it is not asserted by grep.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { composeMassingGroupEmphasis } from '../massingGroupEmphasis';
import { SITE_HIGHLIGHT_RECEDE_FACTOR } from '../siteGeometryHighlight';

const RAW = readFileSync(
    resolve(__dirname, '../../geospatial/CesiumViewport.ts'), 'utf8');

/**
 * ⛔ COMMENTS STRIPPED — an absence arm a COMMENT can trip is one a comment can also SATISFY, and
 * it would go green the day someone deleted the code and left the note. This bit the 2D sibling of
 * this file on its first run (its header carries the story); it is not going to bite this one.
 */
const codeOnly = (t: string): string =>
    t.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
const SRC = codeOnly(RAW);

describe('⭐ it is wired into the SPACE-ENVELOPE channel, not the forma-massing one', () => {
    // ⚠ THE BRIEF FOR THIS STAGE POINTED AT THE WRONG CHANNEL. It described `renderFormaMassing` /
    // `clearFormaMassing` / `formaMassingEntities` as the place to work. The authored space
    // envelopes — the master-plan blocks — are drawn by a SEPARATE renderer with its own list and
    // its own subscription, and this file says so in its own words at the declaration of
    // `spaceEnvelopeEntities`: *"A SEPARATE LIST, DELIBERATELY … driven by the SPACE-ENVELOPE
    // STORE."* Wiring the group emphasis into the forma channel would have painted the wrong
    // entities and left the authored prisms untouched — a change that looks right in review and
    // does nothing on screen.
    it('the entity→group map is cleared by clearSpaceEnvelopes, not by clearFormaMassing', () => {
        const clear = SRC.slice(SRC.indexOf('private clearSpaceEnvelopes()'),
            SRC.indexOf('private renderSpaceEnvelopes()'));
        expect(clear).toContain('this.massingGroupByEntity.clear()');
    });

    it('the group emphasis is applied inside renderSpaceEnvelopes', () => {
        const render = SRC.slice(SRC.indexOf('private renderSpaceEnvelopes()'),
            SRC.indexOf('private renderSpaceEnvelopes()') + 6000);
        expect(render).toContain('composeMassingGroupEmphasis');
        expect(render).toContain('this.massingGroupByEntity.set(ent,');
    });

    it('⛔ and renderFormaMassing is NOT touched by this stage', () => {
        const forma = SRC.slice(SRC.indexOf('renderFormaMassing('),
            SRC.indexOf('renderFormaMassing(') + 8000);
        expect(forma).not.toContain('composeMassingGroupEmphasis');
        expect(forma).not.toContain('massingGroupByEntity');
    });
});

describe('the selection is read ONCE per pass, never per entity', () => {
    it('renderSpaceEnvelopes reads getSelectedMassingGroupId at the top of the pass', () => {
        // Same reason `getSiteHighlight()` is read once in the massing rasteriser: a store write
        // landing mid-pass would emphasise half the scene against one selection and half against
        // another, and the result would be a scene nobody can reproduce.
        const render = SRC.slice(SRC.indexOf('private renderSpaceEnvelopes()'),
            SRC.indexOf('private renderSpaceEnvelopes()') + 6000);
        const read = render.indexOf('getSelectedMassingGroupId()');
        const loop = render.indexOf('composeMassingGroupEmphasis');
        expect(read).toBeGreaterThan(-1);
        expect(loop).toBeGreaterThan(read);
        // exactly one read
        expect((render.match(/getSelectedMassingGroupId\(\)/g) ?? [])).toHaveLength(1);
    });
});

describe('the click resolves the picked entity to a block, mirroring the context-building path', () => {
    it('it sits in the LEFT_CLICK entity branch, beside contextFeatureByEntity', () => {
        const i = SRC.indexOf('this.contextFeatureByEntity.get(pickedEntity)');
        expect(i).toBeGreaterThan(-1);
        const nearby = SRC.slice(i, i + 1400);
        expect(nearby).toContain('this.massingGroupByEntity.get(pickedEntity)');
        expect(nearby).toMatch(/setMassingGroupSelection\(\{[\s\S]*?source: 'site-3d'/);
    });

    it('a context-building hit still wins — this branch is AFTER it and returns on a hit only', () => {
        const i = SRC.indexOf('this.contextFeatureByEntity.get(pickedEntity)');
        const j = SRC.indexOf('this.massingGroupByEntity.get(pickedEntity)');
        expect(j).toBeGreaterThan(i);
        const branch = SRC.slice(j, j + 500);
        expect(branch).toMatch(/if \(massingGroup\) \{[\s\S]*?return;\s*\}/);
    });
});

describe('⛔ ONE OWNER — this viewport keeps no selection of its own (C59 §2.10)', () => {
    it('it subscribes to the shared channel and releases it on dispose', () => {
        expect(SRC).toContain('subscribeMassingGroupSelection');
        expect(SRC).toContain('this.massingGroupSelectionSub = null;');
        // released in the SAME block as the store subscription, so one teardown cannot outlive the
        // other and leave a listener redrawing into a destroyed viewer.
        const disposeRegion = SRC.slice(SRC.indexOf('this.spaceEnvelopeSub = null;'),
            SRC.indexOf('this.spaceEnvelopeSub = null;') + 900);
        expect(disposeRegion).toContain('this.massingGroupSelectionSub');
    });

    it('⭐ it declares no rival selection slot — the six-writer defect, pre-empted', () => {
        // [[view-region-one-owner]]: the split-view "mixed up" report was six writers of one
        // property oscillating. This arm fails the moment this class grows its own slot.
        expect(SRC).not.toMatch(/private\s+selectedMassingGroup\s*[:=]/);
        expect(SRC).not.toMatch(/private\s+selectedGroupId\s*[:=]/);
    });

    it('⛔ and it caches no MEMBER LIST — only a per-entity label, rebuilt every pass', () => {
        // ADR-0383 D6: a member list captured at selection time is a cache of a store query. It
        // goes stale the instant `setStoreys` adds a storey, and this surface would emphasise four
        // prisms of a five-prism building while the panel beside it counted five (C84 EI-9).
        expect(SRC).not.toMatch(/memberIds/);
        expect(SRC).toContain('this.massingGroupByEntity.clear()');
    });
});

describe('⛔ EMPHASIS, NEVER HUE (§L-616) — and the composed alpha, executed', () => {
    it('the renderer multiplies the AUTHORED opacity, and never replaces the colour', () => {
        const render = SRC.slice(SRC.indexOf('private renderSpaceEnvelopes()'),
            SRC.indexOf('private renderSpaceEnvelopes()') + 6000);
        expect(render).toContain('colour.withAlpha(appearance.opacity * groupEmphasis.alphaFactor)');
        expect(render).toContain('outlineWidth: groupEmphasis.outlineWidth');
        // ⛔ `appearance.colour` is the CONFIDENCE signal; a per-group palette would launder a
        // study into a permit one colour at a time. No second colour source in this block.
        // §COMMITTED-ENVELOPE-ON-EVERY-VIEW (L-13310) — `appearance.ink` (the edge + name) comes
        // from the SAME resolver; what stays forbidden is a colour from anywhere else.
        expect(render).not.toMatch(/Cesium\.Color\.fromCssColorString\((?!appearance\.(?:colour|ink)\))/);
    });

    it('⛔ and it does NOT apply SITE_HIGHLIGHT_RECEDE_FACTOR itself', () => {
        // The composer owns that multiplication for both surfaces. An inline one here would make
        // the 3D scene able to dim a block differently from the 2D map.
        const render = SRC.slice(SRC.indexOf('private renderSpaceEnvelopes()'),
            SRC.indexOf('private renderSpaceEnvelopes()') + 6000);
        expect(render).not.toContain('SITE_HIGHLIGHT_RECEDE_FACTOR');
    });

    it('⭐ BEHAVIOURAL: the exact call the renderer makes yields authored alpha for a member', () => {
        // The renderer passes `1` as the highlight factor and multiplies the result into
        // `appearance.opacity`. A LEVEL envelope authors at 0.12, so:
        const authored = 0.12;
        const member = composeMassingGroupEmphasis(1, 'g-a', 'g-a');
        expect(authored * member.alphaFactor).toBeCloseTo(0.12, 10);   // untouched
        const other = composeMassingGroupEmphasis(1, 'g-a', 'g-b');
        expect(authored * other.alphaFactor).toBeCloseTo(0.12 * SITE_HIGHLIGHT_RECEDE_FACTOR, 10);
        // ⛔ AND THE NON-MEMBER IS STILL VISIBLE — receded, not erased.
        expect(authored * other.alphaFactor).toBeGreaterThan(0);
    });

    it('⭐ BEHAVIOURAL: with nothing selected every prism keeps EXACTLY its authored alpha', () => {
        for (const authored of [0.12, 0.35, 0.9]) {
            const e = composeMassingGroupEmphasis(1, null, 'g-a');
            expect(authored * e.alphaFactor).toBe(authored);
        }
    });
});
