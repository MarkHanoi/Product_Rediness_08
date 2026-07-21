// @thatopen/ui — node-test stub. §L-540-CI-GATE
//
// WHY
// ---
// `apps/editor/vitest.config.ts` runs `environment: 'node'` DELIBERATELY: suites
// here assert node-shaped behaviour, e.g. `bootstrap.data.test.ts:85`
// (`expect(globalThis.window).toBeUndefined()` — "does NOT install the dev handle
// in Node"). Switching the project to happy-dom would silently invert those
// assertions rather than fix anything, so that option was REJECTED.
//
// But three suites (bootstrap.data / bootstrap.everything / hello-12-elements)
// died at COLLECTION with `ReferenceError: HTMLElement is not defined` — and then,
// once HTMLElement was shimmed, `ReferenceError: document is not defined` — both
// thrown from `@thatopen/ui/dist/index.js` (Lit, evaluated at module scope). The
// import is reached transitively and unconditionally:
//
//     bootstrap.* -> @pryzm/geometry-slab/SlabTool.ts:3 -> import * as BUI from '@thatopen/ui'
//
// i.e. an L2 geometry package statically imports a browser-only custom-element
// library. Hand-shimming DOM globals one ReferenceError at a time was tried and
// REJECTED: it is unbounded (Lit touches HTMLElement, document, createTreeWalker,
// …) and every global added makes more `typeof window !== 'undefined'` branches
// start executing under test — a far larger behaviour change than the one needed.
//
// So we alias the library to this inert stub for the editor's node suites. This
// matches the pattern the repo already uses: `generateDocumentationViews.test.ts:9`
// mocks the barrels for exactly this reason ("the real ones pull in @thatopen/ui /
// THREE which the node test env lacks").
//
// WHAT THIS DOES NOT DO
// ---------------------
// It does not make UI testable. Any suite that needs real BUI must run under
// happy-dom (see `packages/geometry-slab/vitest.config.ts`, which chose that route
// because its subject genuinely is the DOM-touching builder). The three suites
// this unblocks are bus/store smoke tests that never render anything, so nothing
// they assert is weakened.
//
// The real defect is the static browser-UI import inside an L2 geometry package.
// Removing it is a separate, larger change — logged as L-541.
//
// Members stubbed = the complete set used anywhere in the tree
// (`grep -rho "BUI\.[A-Za-z_]*"` → Component, Manager, Table, html, ref).

const noop = (): void => { /* inert */ };

export const Component = {
    create<T>(factory: () => T): T | undefined {
        // Do NOT invoke the factory: it returns a lit TemplateResult built from
        // `html` tagged templates that expect a real document. Returning
        // undefined is honest — there is no component in a node process.
        void factory;
        return undefined;
    },
};

export const Manager = { init: noop };

export const Table = class {};

/** Inert tagged-template: records nothing, renders nothing. */
export const html = (strings: TemplateStringsArray, ...values: unknown[]): string => {
    void values;
    return strings.join('');
};

export const ref = () => noop;
