// FamilyCreatorPlaceholderScaffold.test.ts — the C74 §3.4 RETIRING ASSERTION for
// `apps/editor/src/familyCreatorPlaceholder.ts` (CO-06, 2026-08-15).
//
// WHY THIS SUITE EXISTS. `check-no-hidden-mock` M-B requires a scaffold header to
// carry date + owner + a RETIRING ASSERTION — an executable check that FAILS when
// the scaffold is replaced, so the header cannot rot into permanent architecture
// nobody chose. Before this file, that module's header had no such assertion; it
// would have been possible to satisfy the gate's regex with prose. This suite is
// the real thing: it pins the two facts that make the module a scaffold, and both
// stop being true the moment the Family Creator handoff actually lands.
//
// This is a SOURCE-SCAN suite, deliberately. `apps/editor/vitest.config.ts` runs
// `environment: 'node'` (its header forbids switching to a DOM environment — three
// suites assert `globalThis.window === undefined`), so the modal cannot be mounted
// here. Scanning the source is the honest way to assert the wiring under a node
// environment; `apps/component-editor/__tests__/sketch/SketchCanvas.test.ts` uses
// the same technique for the same reason.

import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PLACEHOLDER = join(HERE, '../src/familyCreatorPlaceholder.ts');
const CREATE_RAIL = join(HERE, '../src/ui/tools-panel/panels/CreateRailPanel.ts');

describe('Family Creator placeholder — C74 §3.4 scaffold retiring assertion', () => {
  it('THE SCAFFOLD: the create rail still routes Component to a placeholder, not an editor', async () => {
    const rail = await readFile(CREATE_RAIL, 'utf8');

    // The scaffold is LIVE precisely because this import exists. When the real
    // Family Creator lands, the create rail hands off to `apps/component-editor`
    // and this import disappears — at which point this assertion fails and the
    // header in familyCreatorPlaceholder.ts must be retired in the same change.
    expect(rail).toMatch(/import\(\s*['"]\.\.\/\.\.\/\.\.\/familyCreatorPlaceholder['"]\s*\)/);
    expect(rail).toMatch(/openFamilyCreatorPlaceholder\(\)/);
  });

  it('THE SCAFFOLD: the module still admits, in the UI itself, that it is not built', async () => {
    const src = await readFile(PLACEHOLDER, 'utf8');

    // The user-visible admission is the only thing this module really delivers.
    // A real Family Creator does not ship a title that says "under construction".
    expect(src).toContain('Family Creator — under construction');

    // And it authors nothing: no command dispatch, no persistence, no family
    // artefact. If any of these appear, the module has stopped being a placeholder
    // and the scaffold declaration is stale.
    //
    // Scan the CODE, not the prose: the module's own §3.4 header names
    // `.pryzm-family` while declaring that it produces none, so a raw scan would
    // match the declaration and fail on the honesty it is checking for.
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
    expect(code).not.toMatch(/commandBus|dispatch\(|\.pryzm-family/);
  });

  it('the DELETED third copy has not come back (two-copies anti-pattern, C74 §5.e)', async () => {
    // `src/familyCreatorPlaceholder.ts` was a byte-near-identical third copy with
    // ZERO importers repo-wide; it was deleted 2026-08-15. The two survivors are
    // this one and `src/ui/familyCreatorPlaceholder.ts` (a different, smaller
    // console.log stub reached from ui/layout/CreatePanelLayout.ts:350).
    const ROOT_SRC = join(HERE, '../../../src/familyCreatorPlaceholder.ts');
    await expect(readFile(ROOT_SRC, 'utf8')).rejects.toThrow();
  });
});
