// shipped-entry — the §L-12976 tripwire. IS THIS APP IN THE PRODUCT AT ALL?
//
// ═══════════════════════════════════════════════════════════════════════════
// WHY THIS FILE EXISTS
// ═══════════════════════════════════════════════════════════════════════════
// Every other gate in this directory asks whether the code is GOOD. None of
// them asked whether it SHIPS. On 2026-09-06 that gap cost a false report to
// the founder twice in one day: 418 passing tests, a type-clean tree, real
// NURBS curves, a real constraint command family — and a root
// `vite.config.ts` whose `rollupOptions.input` read
// `{ main: 'index.html', browser: 'browser.html' }`. Neither resolved here.
// The deployed image contained NOT ONE BYTE of this app (ISSUE-LOG L-12976).
//
// A green suite is not a user capability. This gate is the smallest honest
// statement of the difference: it reads the ROOT build config — the artefact
// that actually decides what ships — and follows the entry it names all the
// way to a file on disk in `src/`. It asserts a PATH, not a number, because
// the failure it exists to catch is a path that goes nowhere.
//
// ⚠ WHAT THIS GATE DOES **NOT** ESTABLISH, stated so nobody launders it:
//   • not that the page renders without throwing (no browser here);
//   • not that a sketch becomes a persisted `FamilyDocument` — L-12976
//     finding (b) is still OPEN: nothing here builds one, and `publishFamily`
//     has no caller outside its own spec;
//   • not that the solver is real — L-12976 finding (c), `MockSolver` is
//     still the only solver in the repo.
// REACHABLE is not PERSISTED and it is not SOLVED. This gate only closes the
// question "can a browser download this app".
//
// ⛔ IF THIS FAILS, DO NOT RELAX IT. Re-add the entry. Deleting the assertion
//    restores the exact defect it was written for, silently.
//
// @vitest-environment node

import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { PKG_ROOT } from './_walk.js';

/** Repo root — `apps/component-editor` → `../..`. */
const REPO_ROOT = path.resolve(PKG_ROOT, '../..');
const ROOT_VITE_CONFIG = path.join(REPO_ROOT, 'vite.config.ts');

/** `apps/component-editor/src` in the POSIX spelling an HTML `src=` uses. */
const OWN_SRC_PREFIX = '/apps/component-editor/src/';

/**
 * The `key: 'value.html'` pairs inside `rollupOptions.input { … }`.
 *
 * Deliberately a text scan and not an `import()` of the config: the root
 * config imports `vite-plugin-cesium` and calls `realpathSync` on
 * `node_modules/zod` at module scope, so evaluating it here would couple this
 * gate to an installed dependency graph. The thing under test is a literal
 * map of literal strings; reading it as text is the honest instrument.
 */
async function rollupHtmlInputs(): Promise<Record<string, string>> {
  const raw = await fs.readFile(ROOT_VITE_CONFIG, 'utf8');

  // ⚠ STRIP COMMENTS **BEFORE** LOCATING THE BLOCK, not after. The rationale
  // comment now sitting inside the input map quotes the old value —
  // `{ main, browser }` — and that literal `}` terminates a non-greedy
  // `[\s\S]*?\}` scan early, harvesting the two entries that were always
  // there and missing the one this gate exists to check. The gate would then
  // fail on a correct config, which is the worst kind: it teaches you to
  // delete the assertion. Order is load-bearing.
  const src = raw
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

  const block = /rollupOptions:\s*\{\s*input:\s*\{([\s\S]*?)\}/.exec(src);
  expect(
    block,
    'could not locate `rollupOptions.input` in the root vite.config.ts — the ' +
      'scan is broken, not the config. Fix the scan before trusting a pass.',
  ).not.toBeNull();

  const out: Record<string, string> = {};
  for (const m of block![1]!.matchAll(/([A-Za-z0-9_$]+)\s*:\s*'([^']+\.html)'/g)) {
    out[m[1]!] = m[2]!;
  }
  return out;
}

describe('§L-12976 — this app has a bundle entry in the SHIPPED build', () => {
  it('is named by the ROOT vite config, not only by its own', async () => {
    const inputs = await rollupHtmlInputs();
    expect(
      Object.keys(inputs).length,
      'no HTML inputs harvested — the scan is broken, not clean',
    ).toBeGreaterThan(1);

    // Follow every declared entry to its module script and keep the ones whose
    // script lives in THIS package. `apps/component-editor/vite.config.ts`
    // does not count: nothing in the deploy path runs it.
    const owners: string[] = [];
    for (const [name, htmlRel] of Object.entries(inputs)) {
      const htmlAbs = path.join(REPO_ROOT, htmlRel);
      let html: string;
      try {
        html = await fs.readFile(htmlAbs, 'utf8');
      } catch {
        expect.fail(
          `vite.config.ts declares input '${name}: ${htmlRel}' but that file ` +
            `does not exist. A build input that cannot be read is a broken ` +
            `deploy, not a missing feature.`,
        );
      }
      for (const m of html.matchAll(
        /<script[^>]*\btype=["']module["'][^>]*\bsrc=["']([^"']+)["']/g,
      )) {
        if (m[1]!.startsWith(OWN_SRC_PREFIX)) owners.push(`${name} → ${htmlRel} → ${m[1]!}`);
      }
    }

    expect(
      owners,
      'AUTHORED-BUT-UNWIRED (L-12976): no entry in the root build\'s ' +
        '`rollupOptions.input` loads a module from apps/component-editor/src/. ' +
        'Every test in this package can pass while no user can open the app.',
    ).not.toEqual([]);
  });

  it('resolves that entry to a real module that mounts the shell', async () => {
    const inputs = await rollupHtmlInputs();
    const scripts: string[] = [];
    for (const htmlRel of Object.values(inputs)) {
      const html = await fs.readFile(path.join(REPO_ROOT, htmlRel), 'utf8').catch(() => '');
      for (const m of html.matchAll(
        /<script[^>]*\btype=["']module["'][^>]*\bsrc=["']([^"']+)["']/g,
      )) {
        if (m[1]!.startsWith(OWN_SRC_PREFIX)) scripts.push(m[1]!);
      }
    }
    expect(scripts.length, 'previous test should have failed first').toBeGreaterThan(0);

    for (const s of scripts) {
      const abs = path.join(REPO_ROOT, s.replace(/^\//, ''));
      const stat = await fs.stat(abs).catch(() => null);
      expect(stat?.isFile(), `entry module ${s} does not exist on disk`).toBe(true);

      // …and the module must actually boot the app. An entry that resolves but
      // mounts nothing is the same defect wearing a filename.
      const mod = await fs.readFile(abs, 'utf8');
      expect(
        /mountAppShell\s*\(/.test(mod),
        `${s} is a declared entry but never calls mountAppShell() — it ` +
          `resolves without booting anything.`,
      ).toBe(true);
    }
  });

  it('keeps the entry OUT of the main editor bundle (ADR-0316 §5.4)', async () => {
    // ADR-0316 §5.4 retires the ADR if `apps/editor` embeds this app
    // in-process — two command buses and two undo stacks in one window make a
    // user's Ctrl-Z ambiguous. A SEPARATE rollup entry is the blessed shape;
    // `index.html` importing this app is the forbidden one.
    const indexHtml = await fs.readFile(path.join(REPO_ROOT, 'index.html'), 'utf8');
    expect(
      indexHtml.includes(OWN_SRC_PREFIX),
      'index.html (the main editor entry) must not load apps/component-editor ' +
        'directly — that is the in-process embed ADR-0316 §5.4 forbids.',
    ).toBe(false);
  });
});
