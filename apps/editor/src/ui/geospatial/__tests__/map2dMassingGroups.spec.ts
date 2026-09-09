// ─────────────────────────────────────────────────────────────────────────────────────────────
// ADR-0383 S8 (2D half) — the authored prisms carry their BLOCK, recede when another block is
// selected, and a click selects the whole block.
//
// ADR-0383 D4 / D6 · C59 §2.10 · C84 EI-9 · C58 §1.2 · §L-616.
//
// ⚠ THE INSTRUMENT, AND ITS LIMIT, STATED BEFORE THE FIRST ARM.
// Every subject here lives inside `mountSiteBoundaryMap2D`'s closure, behind MapLibre — a
// `queryRenderedFeatures` hit-test and a `setPaintProperty` call cannot be reached without a real
// GL context. So these arms read the SOURCE, which is the same instrument
// `map2dBuildableEnvelope.spec.ts` ARM B and `siteMap2DStyleV2.spec.ts` ARM 2 already use on this
// same file, and for the same reason.
//
// ⛔ A SOURCE ASSERTION IS STRICTLY WEAKER THAN A BEHAVIOURAL ONE and this file does not pretend
// otherwise: it proves the wiring is PRESENT and correctly ORDERED, never that a click on a real
// map selects a real block. The behavioural half of this stage lives where it CAN be executed —
// `massingGroupEmphasis.spec.ts` pins the composed alpha numerically, and
// `massingGroupSection.spec.ts` drives the shared channel end to end in the DOM. What remains
// unproven, and is named rather than implied: nobody has clicked a prism on this map.
//
//   npx vitest run apps/editor/src/ui/geospatial/__tests__/map2dMassingGroups.spec.ts
// ─────────────────────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const RAW = readFileSync(
    resolve(__dirname, '../SiteBoundaryMap2D.ts'), 'utf8');

/**
 * ⭐ COMMENTS STRIPPED, AND THAT IS NOT A CONVENIENCE — IT IS WHAT MAKES A "MUST NOT APPEAR" ARM
 * MEAN ANYTHING. Three arms here assert the ABSENCE of a pattern (`raw.group`, an inline recede
 * multiplication, a `fill-color` in the group branch). Run against the raw file, every one of them
 * is satisfiable — and was DEFEATED — by this file's own prose: the header comment that says *"a
 * second `raw.group` projection here is the dominant defect"* is itself a `raw.group` match.
 *
 * ⛔ An absence arm that a COMMENT can trip is an absence arm that a comment can also SATISFY, and
 * it would go green on the day someone deleted the code and left the note. Caught by this file's
 * own first run, which is the only reason it is written this way.
 */
const codeOnly = (t: string): string =>
    t.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
const SRC = codeOnly(RAW);

/** The whole body of `applySiteHighlightEmphasis`, to its closing brace — never a fixed window. */
const emphasisFn = (): string => {
    const a = SRC.indexOf('function applySiteHighlightEmphasis');
    const rest = SRC.slice(a + 10);
    const m = /\n {4}function /.exec(rest);
    return m === null ? SRC.slice(a) : SRC.slice(a, a + 10 + m.index);
};

describe('the feature carries its block, read through the ONE reader', () => {
    it('every space-envelope feature carries groupId and groupLabel', () => {
        expect(SRC).toMatch(/groupId:\s*readMassingGroupRef\(rec\)\?\.id\s*\?\?\s*null/);
        expect(SRC).toMatch(/groupLabel:\s*readMassingGroupRef\(rec\)\?\.label\s*\?\?\s*null/);
    });

    it('⛔ AND THIS FILE PARSES NO `group` OF ITS OWN — one reader, or the map and the panel drift', () => {
        // C84 EI-9. A second `raw.group` / `rec.group` projection here would be the dominant defect
        // in miniature: the map would decide membership one way and the roster another, and the
        // disagreement would only show on records the two validate differently.
        expect(SRC).not.toMatch(/rec\?\.group\b/);
        expect(SRC).not.toMatch(/raw\.group\b/);
        expect(SRC).toContain("import { readMassingGroupRef } from '../site/massingGroupRoster'");
    });
});

describe('⭐ the measured gap: the authored prisms now recede with everything else', () => {
    it('applySiteHighlightEmphasis paints BOTH space-envelope layers', () => {
        // ⚠ THIS WAS A REAL DEFECT INDEPENDENT OF MASSING GROUPS. Before ADR-0383 S8 this function
        // painted the committed parcel, the select cue, the drawn ring, the permitted envelope and
        // the proposed plate — and never `SPACE_ENVELOPE_*`. The authored blocks were the one thing
        // on this map that stayed at full weight over receded surfaces.
        const fn = emphasisFn();
        expect(fn).toContain('SPACE_ENVELOPE_FILL_LAYER');
        expect(fn).toContain('SPACE_ENVELOPE_LINE_LAYER');
        expect(fn).toMatch(/set\(SPACE_ENVELOPE_FILL_LAYER,\s*'fill-opacity'/);
        expect(fn).toMatch(/set\(SPACE_ENVELOPE_LINE_LAYER,\s*'line-opacity'/);
    });

    it('the envelope fill recedes as a MULTIPLIER on the authored alpha, never a flat target', () => {
        // A flat number would let a near-wireframe upper-bound shell come out DENSER while receding
        // than it was authored — the honesty regression the multiplier exists to make impossible.
        expect(SRC).toMatch(/\['\*',\s*\['get',\s*'fillAlpha'\],\s*envFill\]/);
    });
});

describe('⛔ ONE COMPOSITION POINT — the two dim channels must not multiply twice', () => {
    it('the 2D factors come from massingGroupAlphaFactors, not from an inline multiplication', () => {
        expect(SRC).toContain('massingGroupAlphaFactors(authored, selectedGroup)');
    });

    it('⭐ this file NEVER writes `* SITE_HIGHLIGHT_RECEDE_FACTOR` for the group channel', () => {
        // The composer owns that multiplication. An inline one here would be the second
        // implementation, and it would show up as a block at 0.0484 of its authored alpha.
        const fn = emphasisFn();
        expect(fn).not.toMatch(/authored\s*\*\s*SITE_HIGHLIGHT_RECEDE_FACTOR/);
        expect(fn).not.toMatch(/base\s*\*\s*SITE_HIGHLIGHT_RECEDE_FACTOR/);
    });
});

describe('⛔ EMPHASIS, NEVER HUE (§L-616)', () => {
    it('the group branch writes opacity and line-width — and no colour property', () => {
        const start = SRC.indexOf('const selectedGroup = getSelectedMassingGroupId()');
        expect(start).toBeGreaterThan(0);
        const block = SRC.slice(start, start + 2200);
        expect(block).toMatch(/'line-width'/);
        // ⛔ A per-group tint would overwrite `envelopeRenderStyle`'s CONFIDENCE palette and launder
        // a study into a permit one colour at a time. The brief for this stage said "per-group
        // tint"; `massingGroupSelectionState.ts:56-66` forbids it and this arm pins the resolution.
        expect(block).not.toMatch(/set\([^)]*,\s*'fill-color'/);
        expect(block).not.toMatch(/set\([^)]*,\s*'line-color'/);
    });
});

describe('the click hit-test — placement and precedence are the load-bearing part', () => {
    const onClick = SRC.slice(SRC.indexOf('function onClick(e: MapMouseEvent)'),
        SRC.indexOf("if (drawMode === 'rectangle')"));

    it('⭐ it sits AFTER the calibration yield and BEFORE the select branch', () => {
        // ⛔ ORDER IS THE WHOLE THING. After a commit the mode IS 'select', and `committed` returns
        // before every draw path — so a branch placed below the 'select' line could never run on
        // the surface where the authored prisms are actually visible. And placing it ABOVE the
        // calibration yield would eat one of the two clicks that gesture owns outright.
        const cal = onClick.indexOf('isCalibrating');
        const pick = onClick.indexOf('pickMassingGroupAt');
        const sel = onClick.indexOf("interactionMode === 'select'");
        expect(cal).toBeGreaterThan(0);
        expect(pick).toBeGreaterThan(cal);
        expect(sel).toBeGreaterThan(pick);
    });

    it('it YIELDS while the perimeter tool is armed', () => {
        // `SiteEnvelopeDrawMap2D` attaches its own handlers on arm() and drops them on disarm(),
        // out of band with this one. A click meant to place a vertex must never be eaten.
        expect(onClick).toMatch(/if \(!isEnvelopeDrawArmed\(\)\) \{/);
    });

    it('⛔ ON A MISS IT FALLS THROUGH — only a HIT returns', () => {
        // Parcel selection and every draw path must keep the exact behaviour they had. The `return`
        // is INSIDE the hit branch; a `return` after the `if` would silently kill parcel selection.
        const branch = onClick.slice(onClick.indexOf('if (!isEnvelopeDrawArmed())'),
            onClick.indexOf("interactionMode === 'select'"));
        // ⭐ EXACTLY ONE `return` in the whole hit-test region, and it is INSIDE the BRACES of
        // `if (hitGroup !== null)`. A `return` one brace out returns on every MISS too, which
        // silently kills parcel selection on every committed site — the founder-facing path this
        // branch sits in front of, and the single worst thing this stage could break.
        //
        // ⚠ THIS ARM IS BRACE-MATCHED RATHER THAN REGEXED, AND THAT IS NOT FASTIDIOUSNESS. The
        // first version of it asserted `/return;/` against the text FOLLOWING the `if` and counted
        // one `return` in the region — and the SCRAMBLE CONTROL (L-586) walked straight through it:
        // hoisting the return out of the inner block left both of those true and the arm GREEN
        // while parcel selection was dead. The scramble is the only reason this is written properly.
        expect(branch.match(/(?:^|[^\w.])return;/g) ?? []).toHaveLength(1);
        const ifAt = branch.indexOf('if (hitGroup !== null)');
        expect(ifAt).toBeGreaterThan(-1);
        const open = branch.indexOf('{', ifAt);
        let depth = 0;
        let close = -1;
        for (let i = open; i < branch.length; i += 1) {
            if (branch[i] === '{') depth += 1;
            else if (branch[i] === '}') { depth -= 1; if (depth === 0) { close = i; break; } }
        }
        expect(close).toBeGreaterThan(open);
        const insideIf = branch.slice(open, close);
        const afterIf = branch.slice(close);
        expect(insideIf).toMatch(/return;/);          // the HIT returns …
        expect(afterIf).not.toMatch(/return;/);       // … and the MISS does not
    });

    it('the picker queries the SPACE-ENVELOPE FILL LAYER ONLY', () => {
        // Widening it would let a click on the parcel fill select a block sitting behind it.
        expect(SRC).toMatch(/queryRenderedFeatures\(e\.point,\s*\{\s*layers:\s*\[SPACE_ENVELOPE_FILL_LAYER\]\s*\}\)/);
    });

    it('⛔ the UNGROUPED bucket is NOT selectable — a null id selects nothing anywhere', () => {
        // `setMassingGroupSelection` refuses a blank id at the other end of the channel; returning
        // null here lets the click fall through to parcel selection, which is what the user meant.
        const pick = SRC.slice(SRC.indexOf('function pickMassingGroupAt'),
            SRC.indexOf('function refreshSpaceEnvelopes'));
        expect(pick).toMatch(/typeof gid === 'string' && gid\.trim\(\)\.length > 0/);
    });

    it('a hit writes through the ONE channel, tagged with THIS surface', () => {
        expect(onClick).toMatch(/setMassingGroupSelection\(\{[\s\S]*?source: 'site-map-2d'/);
    });
});

describe('the map READS the shared selection and never owns one (C59 §2.10 / D6)', () => {
    it('it subscribes to the channel and repaints emphasis', () => {
        expect(SRC).toContain('massingGroupSelectionSub = subscribeMassingGroupSelection');
        const sub = SRC.slice(SRC.indexOf('massingGroupSelectionSub = subscribeMassingGroupSelection'),
            SRC.indexOf('massingGroupSelectionSub = subscribeMassingGroupSelection') + 400);
        expect(sub).toContain('applySiteHighlightEmphasis()');
        // ⛔ NOT `refreshSpaceEnvelopes()`: no geometry changed, and rebuilding the whole feature
        // collection to restyle it is a second, slower answer to a question emphasis already gives.
        expect(sub).not.toContain('refreshSpaceEnvelopes()');
    });

    it('⭐ it declares NO selection state of its own — the six-writer defect, pre-empted', () => {
        // [[view-region-one-owner]]: the split-view "mixed up" report was six writers of one
        // property oscillating. This arm fails the moment this file grows a rival slot.
        expect(SRC).not.toMatch(/let\s+selectedMassingGroup/);
        expect(SRC).not.toMatch(/let\s+selectedGroupId/);
        expect(SRC).toContain('getSelectedMassingGroupId');
    });

    it('and it releases the subscription on dispose', () => {
        expect(SRC).toMatch(/try \{ massingGroupSelectionSub\?\.\(\); \} catch/);
    });
});
