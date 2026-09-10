/**
 * §XSS-SINK-SCAN — `setKeyLabelPills` is the ONE builder for the `wdh-key`/`wdh-lbl` pill pair.
 *
 * ⭐ THE ARM THAT MATTERS IS `does not parse a label as markup`. The three call sites
 * (WallDrawingHUD, DoorModePicker, WindowModePicker) previously wrote
 * `btn.innerHTML = \`<span class="wdh-key">${key}</span>…\`` and passed values that happen to be
 * author-written literals TODAY. A test that only checked the rendered classes would stay green
 * if someone reverted the builder to `innerHTML`, because inert input renders identically either
 * way. So the security property is asserted with input that DISTINGUISHES the two
 * implementations: markup in, markup NOT parsed out.
 *
 * SCRAMBLE CONTROL (L-586), run when this landed: `setKeyLabelPills` was reverted to
 * `btn.innerHTML = \`<span class="wdh-key">${key}</span><span class="wdh-lbl">${label}</span>\``
 * and the two "not parsed" arms went RED (an <img> element materialised and textContent lost the
 * raw string) while every class/text arm stayed GREEN — which is the proof that those arms, and
 * not the cosmetic ones, are what hold the fix in place.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { setKeyLabelPills } from '../hudPills.js';

const btn = (): HTMLButtonElement => document.createElement('button');

describe('setKeyLabelPills', () => {
    beforeEach(() => { document.body.replaceChildren(); });

    it('builds the key pill and the label pill as ELEMENTS with the wdh- classes', () => {
        const b = btn();
        setKeyLabelPills(b, 'L', 'Linear');
        const spans = b.querySelectorAll('span');
        expect(spans.length).toBe(2);
        expect(spans[0].className).toBe('wdh-key');
        expect(spans[0].textContent).toBe('L');
        expect(spans[1].className).toBe('wdh-lbl');
        expect(spans[1].textContent).toBe('Linear');
    });

    it('omits the key pill when the key is null — the profile rows print the shortcut once', () => {
        const b = btn();
        setKeyLabelPills(b, null, 'Round arch');
        const spans = b.querySelectorAll('span');
        expect(spans.length).toBe(1);
        expect(spans[0].className).toBe('wdh-lbl');
        expect(b.querySelector('.wdh-key')).toBeNull();
    });

    it('treats an empty-string key the same as null (the old code interpolated `` for it)', () => {
        const b = btn();
        setKeyLabelPills(b, '', 'Custom (from type)');
        expect(b.querySelectorAll('span').length).toBe(1);
        expect(b.querySelector('.wdh-key')).toBeNull();
    });

    it('⭐ does not parse a LABEL as markup — the property the innerHTML version could not hold', () => {
        const b = btn();
        const hostile = '<img src=x onerror="1">bad';
        setKeyLabelPills(b, 'A', hostile);
        // No element was created from the string …
        expect(b.querySelector('img')).toBeNull();
        // … and the characters survive verbatim as TEXT.
        const lbl = b.querySelector('.wdh-lbl');
        expect(lbl).not.toBeNull();
        expect(lbl!.textContent).toBe(hostile);
        expect(b.querySelectorAll('span').length).toBe(2);
    });

    it('⭐ does not parse a KEY as markup either', () => {
        const b = btn();
        const hostile = '<script>x</script>';
        setKeyLabelPills(b, hostile, 'Linear');
        expect(b.querySelector('script')).toBeNull();
        expect(b.querySelector('.wdh-key')!.textContent).toBe(hostile);
    });

    it('REPLACES previous children rather than appending — the bar re-renders in place', () => {
        const b = btn();
        setKeyLabelPills(b, 'L', 'Linear');
        setKeyLabelPills(b, 'O', 'Orthogonal');
        const spans = b.querySelectorAll('span');
        expect(spans.length).toBe(2);
        expect(spans[0].textContent).toBe('O');
        expect(spans[1].textContent).toBe('Orthogonal');
    });
});
