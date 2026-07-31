// §PLATFORM-PROJECTNAME-XSS (L-407 / SEC-XSS) — regression lock for the
// user-controlled project-name stored-XSS sinks in the platform shell.
//
// A project name is USER-controlled (renamed via the toolbar input, line 127
// of PlatformProjectBrowser) and, in a shared CDE project, a name set by one
// collaborator renders in another collaborator's toolbar / save modal. Two
// sinks interpolated `this.ctx.projectName` into an `value="…"` attribute with
// NO escaping while every sibling interpolation in the same files already used
// `escHtml`. A name of `"><img src=x onerror=alert(1)>` therefore broke out of
// the attribute and injected markup.
//
// This suite proves two things, environment-independently (node env, no DOM):
//   (1) the `escHtml` helper the fix depends on actually neutralises an
//       attribute-breakout payload; and
//   (2) the specific raw, unescaped sink patterns cannot silently reappear
//       (a scoped source-scan — the CI sink-scan the pre-launch evidence
//       flagged as missing, tightened to the two known sinks).

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { describe, it, expect } from 'vitest';

import { escHtml } from '../src/ui/platform/ProjectHubTemplates';

const HERE = dirname(fileURLToPath(import.meta.url));
const PLATFORM = resolve(HERE, '../src/ui/platform');

function read(rel: string): string {
  return readFileSync(resolve(PLATFORM, rel), 'utf8');
}

describe('escHtml (project-name escaping contract)', () => {
  it('escapes the five HTML-significant characters', () => {
    expect(escHtml(`<script>&"'`)).toBe('&lt;script&gt;&amp;&quot;&#39;');
  });

  it('neutralises an attribute-breakout project name', () => {
    const evil = `"><img src=x onerror=alert(1)>`;
    const escaped = escHtml(evil);
    // Inside `value="${escHtml(name)}"` the payload must not close the quote or
    // open a new tag — no raw `"`, `<`, or `>` may survive.
    expect(escaped).not.toContain('"');
    expect(escaped).not.toContain('<');
    expect(escaped).not.toContain('>');
    expect(escaped).toBe('&quot;&gt;&lt;img src=x onerror=alert(1)&gt;');
  });

  it('leaves a benign project name untouched', () => {
    expect(escHtml('Ground Floor — Scheme A')).toBe('Ground Floor — Scheme A');
  });
});

describe('platform project-name sinks are escaped (source-scan regression lock)', () => {
  it('PlatformProjectBrowser toolbar input escapes projectName', () => {
    const src = read('PlatformProjectBrowser.ts');
    // The raw, unescaped sink must never reappear…
    expect(src).not.toMatch(/value="\$\{this\.ctx\.projectName\}"/);
    // …and the toolbar input must route it through escHtml.
    expect(src).toMatch(/value="\$\{this\.escHtml\(this\.ctx\.projectName\)\}"/);
  });

  it('PlatformSaveController save-modal input escapes projectName', () => {
    const src = read('PlatformSaveController.ts');
    expect(src).not.toMatch(/value="\$\{this\.ctx\.projectName\}"/);
    expect(src).toMatch(/value="\$\{escHtml\(this\.ctx\.projectName\)\}"/);
  });

  it('no platform file interpolates a bare `this.ctx.projectName` into an attribute', () => {
    for (const f of ['PlatformProjectBrowser.ts', 'PlatformSaveController.ts']) {
      const src = read(f);
      expect(src, `${f} has a raw projectName attribute sink`).not.toMatch(
        /="\$\{this\.ctx\.projectName\}"/,
      );
    }
  });
});
