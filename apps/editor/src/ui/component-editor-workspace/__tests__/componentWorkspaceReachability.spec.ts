/**
 * §U3-DEFINITION-WORKSPACE-REACHABILITY — the definition-editor workspace is
 * reachable from the Components browser, refuses honestly when its wires are
 * missing, and routes every document mutation through the family-migrations ops.
 *
 * Modelled on §U2-COMPONENT-SECTION-REACHABILITY one panel over — same defect
 * class ([[authored-but-unwired-is-the-bottleneck]]): a workspace with no
 * production opener is a feature with an interface attached, and a workspace
 * that mutates its draft outside the ops is a rival mutation path (C84 EI-9).
 *
 *   ARM A — HONEST STATES: an unloaded definition REFUSES BY NAME (the id and
 *           the catalogue count are in the sentence) and mounts nothing. This
 *           file deliberately builds no fake catalogue and no fake document —
 *           [[fake-more-capable-than-real]]; the behavioural acceptance (real
 *           composeRuntime, real packFamily fixture, real ops, real save →
 *           reload → place → resolve) lives in
 *           `apps/editor/__tests__/componentDefinitionWorkspaceThroughComposedRuntime.test.ts`.
 *   ARM B — SOURCE-LEVEL, and labelled as such: the browser carries the
 *           "Edit definition…" entry wired to the workspace opener, and the
 *           workspace's mutations are the five family-migrations op factories +
 *           the one packer — no direct document write.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { openComponentDefinitionWorkspace } from '../ComponentDefinitionWorkspace';

const WORKSPACE = resolve('apps/editor/src/ui/component-editor-workspace/ComponentDefinitionWorkspace.ts');
const BROWSER = resolve('apps/editor/src/ui/component-browser/ComponentBrowserPanel.ts');

const UNLOADED = 'fam_01ARZ3NDEKTSV4RRFFQ69G5U30';

describe('§U3-DEFINITION-WORKSPACE-REACHABILITY · ARM A — honest states', () => {
    it('⭐ an UNLOADED definition refuses BY NAME — naming the id and the catalogue count — and mounts nothing', () => {
        const before = document.querySelectorAll('[data-cdw-overlay]').length;
        const res = openComponentDefinitionWorkspace(UNLOADED);
        expect(res.ok, 'the opener must refuse, not open an empty editor').toBe(false);
        if (res.ok) return;
        expect(res.refusal).toContain(UNLOADED);
        expect(res.refusal).toContain('not loaded');
        expect(res.refusal, 'the count makes "empty" an answer, not an error').toMatch(/\d+ definition/);
        // Nothing mounted — a workspace over a document that is not there would be
        // the context-data-honesty defect with chrome on top.
        expect(document.querySelectorAll('[data-cdw-overlay]').length).toBe(before);
    });
});

describe('§U3-DEFINITION-WORKSPACE-REACHABILITY · ARM B — the browser carries the entry (source-level)', () => {
    // SOURCE-LEVEL, and named as such: it cannot tell you the workspace works —
    // only that the entry exists in the file that renders the browser. The
    // behavioural half is the composed-runtime acceptance named in the header.
    const browserSrc = readFileSync(BROWSER, 'utf8');

    it('imports the workspace opener from the U3 barrel', () => {
        expect(browserSrc).toMatch(
            /import\s*\{[^}]*\bopenComponentDefinitionWorkspace\b[^}]*\}\s*from\s*'\.\.\/component-editor-workspace\/index\.js'/,
        );
    });

    it('renders the "Edit definition…" affordance and routes its refusal into the panel status line', () => {
        expect(browserSrc).toContain("data-component-browser-edit");
        expect(browserSrc).toContain('openComponentDefinitionWorkspace(view.definitionId)');
        expect(browserSrc).toContain('this._status(res.refusal)');
    });
});

describe('§U3-DEFINITION-WORKSPACE-REACHABILITY · ARM B — ops-only mutation (source-level)', () => {
    const src = readFileSync(WORKSPACE, 'utf8');

    it('⭐ every draft mutation is a family-migrations op factory from @pryzm/file-format', () => {
        expect(src).toContain('makeAddParameterMigrator');
        expect(src).toContain('makeIntroduceExpressionMigrator');
        expect(src).toContain('makeRenameParameterMigrator');
        expect(src).toContain('makeChangeParameterTypeMigrator');
        expect(src).toContain('makeDeleteParameterMigrator');
        // ⭐ lane UCE-FAMILY — the two ops that closed U3's OWED O-1/O-2. Their
        //   presence HERE is what makes the profile surface's commit button and the
        //   "Remove formula" button real rather than chrome; the behavioural proof is
        //   ARM 9 / ARM 9B of the composed-runtime acceptance named in the header.
        expect(src).toContain('makeUpdateProfileMigrator');
        expect(src).toContain('makeDeleteExpressionMigrator');
        // The one gateway (the falsification seam) exists and is the ONLY value
        // import of the file-format barrel in this file.
        expect(src).toContain("import('@pryzm/file-format')");
        expect(src).toMatch(/import type \{[^}]*\} from '@pryzm\/file-format'/s);
        expect(src, 'no STATIC value import of the barrel (U0 §5-D2 pdfjs lesson)').not.toMatch(
            /^import \{[^}]*\} from '@pryzm\/file-format'/m,
        );
    });

    it('⭐ no direct document mutation rides beside the ops', () => {
        // The draft's arrays are never pushed/spliced/assigned in place — the ops
        // return new documents. A hit here is a rival mutation path (C84 EI-9).
        expect(src).not.toMatch(/document\.parameters\.(push|splice|pop|shift|unshift)/);
        expect(src).not.toMatch(/draft\.document\.parameters\s*=/);
        expect(src).not.toMatch(/draft\.document\.types\s*=/);
        // The profile write-back is an OP too — a `document.profiles` splice here
        // would be the rival path the whole gateway exists to prevent.
        expect(src).not.toMatch(/draft\.document\.profiles\s*=/);
        expect(src).not.toMatch(/document\.profiles\.(push|splice|pop|shift|unshift)/);
        expect(src).not.toMatch(/\(draft\.document as/);
    });

    it('save goes through packFamily and re-enters through the ONE catalogue loader', () => {
        expect(src).toContain('ff.packFamily(');
        expect(src).toContain('componentCatalog.loadFromBytes(packed.bytes');
        // A CALL site, not prose — the header legitimately names the forbidden
        // shape in order to forbid it.
        expect(src, 'no rival write path into the catalogue').not.toMatch(/entries\.set\(/);
    });
});
