/**
 * §U2-COMPONENT-SECTION-REACHABILITY — lane 4F's parameter table has a PRODUCTION
 * importer, the panel that mounts it is the panel the user opens, and every missing
 * wire STATES ITSELF instead of no-op'ing.
 *
 * Modelled on §OPENING-PROFILE-PANEL-REACHABILITY one directory over, because the
 * defect class is the same: lane 4F's own §7 measured its deliverables *"reachable on
 * three of the four axes and not on the build graph — zero production importers"*
 * ([[authored-but-unwired-is-the-bottleneck]]; C107 §0.1 counted fifteen of these in
 * one session). This spec is the regression floor under the mount lane U2 added.
 *
 *   ARM A — the HONEST-STATE arms: with no composed runtime published, the section
 *           renders the named missing-wire refusal — never an empty div, never stale
 *           numbers. (The full behavioural acceptance — real composeRuntime, real
 *           verbs, real store read-back — lives in
 *           `apps/editor/__tests__/componentPropertySectionThroughComposedRuntime.test.ts`;
 *           THIS file deliberately builds no fake bus and no fake store —
 *           [[fake-more-capable-than-real]].)
 *   ARM B — SOURCE-LEVEL, and labelled as such (the sibling spec's own caveat):
 *           `PropertyPanelBodyRenderer.ts` imports the section, mounts it for the
 *           `component` element type, and wires the profile-editor opener port at the
 *           mounting module — the §OUTLINE81 idiom, asserted the same way.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
    createComponentSection,
    setComponentProfileEditorOpener,
} from '../ComponentSection';

const BODY_RENDERER = resolve('apps/editor/src/ui/property-panel/PropertyPanelBodyRenderer.ts');

afterEach(() => {
    setComponentProfileEditorOpener(null);
    // The section reads the runtime slot at CALL time; leave the environment clean.
    window.runtime = undefined;
});

describe('§U2-COMPONENT-SECTION-REACHABILITY · ARM A — missing wires state themselves', () => {
    it('⭐ with NO composed runtime published, the section names the missing wire — and renders zero parameter rows', () => {
        window.runtime = undefined;
        const section = createComponentSection({ id: 'component_01ARZ3NDEKTSV4RRFFQ69G5FA0', type: 'component' });

        const refusal = section.root.querySelector('[data-cs-refusal="runtime-unavailable"]');
        expect(refusal, 'the runtime-unavailable refusal must render').not.toBeNull();
        expect(refusal?.textContent).toContain('window.runtime');
        expect(refusal?.textContent).toContain('component store');
        // ⛔ Never stale numbers: no table rows exist in this state.
        expect(section.root.querySelectorAll('tr[data-cpt-row]').length).toBe(0);
    });

    it('the dispatch paths refuse BY NAME rather than silently no-op when the runtime is missing', async () => {
        window.runtime = undefined;
        const section = createComponentSection({ id: 'component_01ARZ3NDEKTSV4RRFFQ69G5FA0', type: 'component' });

        const swap = await section.requestTypeSwap('typ_01ARZ3NDEKTSV4RRFFQ69G5FA1');
        expect(swap, 'requestTypeSwap must RETURN the refusal, not swallow it').not.toBeNull();
        expect(swap).toContain('composed runtime is not available');

        const edit = await section.submitEdit('par_01ARZ3NDEKTSV4RRFFQ69G5FA2', '100');
        expect(edit).not.toBeNull();
    });
});

describe('§U2-COMPONENT-SECTION-REACHABILITY · ARM B — the panel MOUNTS the section (source-level)', () => {
    // SOURCE-LEVEL, and named as such: it cannot tell you the panel works, only that
    // the mount point exists in the file that renders the founder's panel. The
    // behavioural half is the composed-runtime acceptance test named in the header.
    const src = readFileSync(BODY_RENDERER, 'utf8');

    it('imports the section builder and the opener port from ComponentSection', () => {
        expect(src).toMatch(
            /import\s*\{[^}]*\bbuildComponentSection\b[^}]*\}\s*from\s*'\.\/ComponentSection'/,
        );
        expect(src).toMatch(
            /import\s*\{[^}]*\bsetComponentProfileEditorOpener\b[^}]*\}\s*from\s*'\.\/ComponentSection'/,
        );
    });

    it('mounts the section for the component element type', () => {
        expect(src).toContain("elType === 'component'");
        expect(src).toContain('buildComponentSection(elementData)');
    });

    it('⭐ wires the profile-editor opener AT THE MOUNTING MODULE (the §OUTLINE81 idiom) — lane 4F O-1', () => {
        expect(src).toMatch(
            /import\s*\{[^}]*\bopenComponentProfileEditorDialog\b[^}]*\}\s*from\s*'\.\.\/ComponentProfileEditorDialog'/,
        );
        expect(src).toContain('setComponentProfileEditorOpener(openComponentProfileEditorDialog)');
    });
});
