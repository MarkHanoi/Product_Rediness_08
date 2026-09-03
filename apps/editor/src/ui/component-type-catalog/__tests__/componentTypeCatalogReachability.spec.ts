/**
 * §U4-TYPE-CATALOG-REACHABILITY — the type catalog is reachable from the
 * Components browser, refuses honestly when its wires are missing, and routes every
 * document mutation through the split-type op (CREATE) or a re-validated document
 * transform (EDIT/DELETE) — never a bus verb, never a rival write path.
 *
 * Modelled on §U3-DEFINITION-WORKSPACE-REACHABILITY one surface over — same defect
 * class ([[authored-but-unwired-is-the-bottleneck]]): a catalog with no production
 * opener is a feature with an interface attached, and one that mutates its draft
 * outside the ops / a re-validated transform is a rival mutation path (C84 EI-9).
 *
 *   ARM A — HONEST STATES: an unloaded definition REFUSES BY NAME (the id and the
 *           catalogue count are in the sentence) and mounts nothing. No fake
 *           catalogue, no fake document ([[fake-more-capable-than-real]]); the
 *           behavioural acceptance (real composeRuntime, real packFamily fixture,
 *           real split-type op, real save → reload → place → resolve) lives in
 *           `apps/editor/__tests__/componentTypeCatalogThroughComposedRuntime.test.ts`.
 *   ARM B — SOURCE-LEVEL, and labelled as such: the browser carries the "Types…"
 *           entry wired to the catalog opener; CREATE rides `makeSplitTypeMigrator`;
 *           EDIT/DELETE go through `FamilyDocumentSchema` re-validation; SAVE is
 *           packFamily → the one loader; no mint of a bus verb; no in-place
 *           document mutation.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { openComponentTypeCatalog } from '../ComponentTypeCatalog';

const CATALOG = resolve('apps/editor/src/ui/component-type-catalog/ComponentTypeCatalog.ts');
const BROWSER = resolve('apps/editor/src/ui/component-browser/ComponentBrowserPanel.ts');

const UNLOADED = 'fam_01ARZ3NDEKTSV4RRFFQ69G5U40';

describe('§U4-TYPE-CATALOG-REACHABILITY · ARM A — honest states', () => {
    it('⭐ an UNLOADED definition refuses BY NAME — naming the id and the catalogue count — and mounts nothing', () => {
        const before = document.querySelectorAll('[data-ctc-overlay]').length;
        const res = openComponentTypeCatalog(UNLOADED);
        expect(res.ok, 'the opener must refuse, not open an empty catalog').toBe(false);
        if (res.ok) return;
        expect(res.refusal).toContain(UNLOADED);
        expect(res.refusal).toContain('not loaded');
        expect(res.refusal, 'the count makes "empty" an answer, not an error').toMatch(/\d+ definition/);
        // Nothing mounted — a catalog over a document that is not there would be the
        // context-data-honesty defect with chrome on top.
        expect(document.querySelectorAll('[data-ctc-overlay]').length).toBe(before);
    });
});

describe('§U4-TYPE-CATALOG-REACHABILITY · ARM B — the browser carries the entry (source-level)', () => {
    // SOURCE-LEVEL, and named as such: it cannot tell you the catalog works — only
    // that the entry exists in the file that renders the browser. The behavioural
    // half is the composed-runtime acceptance named in the header.
    const browserSrc = readFileSync(BROWSER, 'utf8');

    it('imports the type-catalog opener from the U4 barrel', () => {
        expect(browserSrc).toMatch(
            /import\s*\{[^}]*\bopenComponentTypeCatalog\b[^}]*\}\s*from\s*'\.\.\/component-type-catalog\/index\.js'/,
        );
    });

    it('renders the "Types…" affordance and routes its refusal into the panel status line', () => {
        expect(browserSrc).toContain('data-component-browser-types');
        expect(browserSrc).toContain('openComponentTypeCatalog(view.definitionId)');
        expect(browserSrc).toContain('this._status(res.refusal)');
    });
});

describe('§U4-TYPE-CATALOG-REACHABILITY · ARM B — ops/transform-only mutation (source-level)', () => {
    const src = readFileSync(CATALOG, 'utf8');

    it('⭐ CREATE rides the dedicated split-type migrator through the ONE lazy gateway', () => {
        expect(src).toContain('makeSplitTypeMigrator');
        // The one gateway (the falsification seam) exists and is the ONLY value import
        // of the file-format barrel in this file.
        expect(src).toContain("import('@pryzm/file-format')");
        expect(src).toMatch(/import type \{[^}]*\} from '@pryzm\/file-format'/s);
        expect(src, 'no STATIC value import of the barrel (U0 §5-D2 pdfjs lesson)').not.toMatch(
            /^import \{[^}]*\} from '@pryzm\/file-format'/m,
        );
    });

    it('⭐ EDIT/DELETE re-validate through FamilyDocumentSchema, and NO bus verb is minted', () => {
        expect(src).toContain('FamilyDocumentSchema.safeParse');
        // ⛔ No type-CRUD verbs (UIUX-PLAN §4 R-f) — the surface dispatches none.
        expect(src, 'no bus dispatch — types are document content, not project state').not.toMatch(
            /executeCommand\(|bus\./,
        );
    });

    it('⭐ no direct in-place document mutation rides beside the op/transform', () => {
        // Every next document is produced immutably (spread / map / filter); a hit
        // here is a rival mutation path (C84 EI-9).
        expect(src).not.toMatch(/draft\.document\.types\.(push|splice|pop|shift|unshift)/);
        expect(src).not.toMatch(/draft\.document\.types\s*=/);
        expect(src).not.toMatch(/\(draft\.document as/);
    });

    it('save goes through packFamily and re-enters through the ONE catalogue loader', () => {
        expect(src).toContain('ff.packFamily(');
        expect(src).toContain('componentCatalog.loadFromBytes(packed.bytes');
        expect(src, 'no rival write path into the catalogue').not.toMatch(/entries\.set\(/);
    });

    it('names each missing dedicated type migrator as OWED, never mints one', () => {
        // The gaps are stated by name (change-type-value / delete-type), so a reader
        // knows what the model lane owes — [[refusing-half-needs-its-escape-hatch]].
        expect(src).toContain('OWED');
        expect(src).toContain('change-type-value');
        expect(src).toContain('delete-type');
    });
});
