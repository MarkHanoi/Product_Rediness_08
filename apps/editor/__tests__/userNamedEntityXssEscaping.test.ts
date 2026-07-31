// §USER-NAMED-ENTITY-XSS (L-407 / SEC-XSS) — regression lock for the
// user-named-entity stored-XSS sinks the repo-wide sink scan surfaced.
//
// Taint trace (this is what makes these DIFFERENT from the static enum labels
// that share the same `${x.label}` shape and were deliberately left alone):
//
//   • ROOM NAME / LEVEL NAME — renamed by the user, persisted in the project
//     snapshot, and in a shared CDE project rendered in every collaborator's
//     panels. `ConstraintEngine` embeds them verbatim in its compliance
//     `message` strings (`${room.name || room.occupancyType} — area …`,
//     `Level "${level.name}" — …`), so a room named
//     `<img src=x onerror=alert(1)>` reaches the compliance table, the physics
//     table, the spatial-query table and the discovery tooltip as MARKUP.
//   • VERSION LABEL — typed by the user in the save-version modal (the very
//     input batch-7 escaped) and then rendered raw in the version list, the
//     preview banner and two loading overlays.
//   • IMPORT FILE NAME / TEMPLATE NAME / DEPARTMENT — attacker-chosen or
//     user-typed strings that persist and re-render.
//
// The worst of these is `CompliancePanel._exportPdf`, which pushed the same
// unescaped `message` through `window.open('', '_blank').document.write(html)`.
// That popup is SAME-ORIGIN with the app, so script in it runs with the user's
// session — strictly worse than the in-panel table.
//
// This suite proves, environment-independently (no DOM required):
//   (1) `escHtml` actually neutralises the payloads these fields can carry; and
//   (2) each specific raw sink cannot silently reappear (scoped source scan).

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { describe, it, expect } from 'vitest';

import { escHtml } from '@pryzm/ui-base';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '../src');

/** Read a source file with line endings normalised (the repo mixes LF/CRLF). */
function read(rel: string): string {
  return readFileSync(resolve(SRC, rel), 'utf8').replace(/\r\n/g, '\n');
}

describe('escHtml — user-named-entity escaping contract', () => {
  it('neutralises a markup-injection room name', () => {
    const evil = '<img src=x onerror=alert(1)>';
    const out = escHtml(evil);
    expect(out).not.toContain('<');
    expect(out).not.toContain('>');
    expect(out).toBe('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('neutralises an attribute-breakout version label', () => {
    const evil = '" onmouseover="alert(1)';
    const out = escHtml(evil);
    expect(out).not.toContain('"');
    expect(out).toBe('&quot; onmouseover=&quot;alert(1)');
  });

  it('survives a compliance message that embeds a hostile room name', () => {
    const roomName = '<script>alert(document.cookie)</script>';
    const message = `${roomName} — area 4.2m² is below minimum 6m²`;
    const out = escHtml(message);
    expect(out).not.toContain('<script');
    expect(out).toContain('&lt;script&gt;');
    // the human-readable remainder is preserved
    expect(out).toContain('area 4.2m² is below minimum 6m²');
  });

  it('leaves a benign name untouched', () => {
    expect(escHtml('Bedroom 2 (North)')).toBe('Bedroom 2 (North)');
  });
});

describe('source scan — the raw sinks cannot reappear', () => {
  const CASES: Array<[label: string, file: string, raw: string, guarded: string]> = [
    // CompliancePanel — screen table + same-origin print popup.
    ['compliance row message',    'ui/dataworkbench/CompliancePanel.ts', '${result.message}',   '${escHtml(result.message)}'],
    ['compliance row ruleId',     'ui/dataworkbench/CompliancePanel.ts', '${result.ruleId}',    '${escHtml(result.ruleId)}'],
    ['compliance print message',  'ui/dataworkbench/CompliancePanel.ts', '<td>${r.message}</td>', '<td>${escHtml(r.message)}</td>'],
    // Room / level names.
    ['validate bucket room name', 'ui/data/buckets/ValidateBucket.ts',   '${r.roomName}',       '${escHtml(r.roomName)}'],
    ['physics panel room name',   'ui/dataworkbench/PhysicsPanel.ts',    '${room.name ?? room.id}', '${escHtml(room.name ?? room.id)}'],
    ['spatial query room name',   'ui/dataworkbench/SpatialQueryPanel.ts', "${room.name || '—'}", "${escHtml(room.name || '—')}"],
    ['spatial query level name',  'ui/dataworkbench/SpatialQueryPanel.ts', '${levelName}',      '${escHtml(levelName)}'],
    ['discovery tooltip name',    'ui/inspect/audit/DiscoveryModeZone.ts', '${roomName}',       '${escHtml(roomName)}'],
    ['discovery attribute value', 'ui/inspect/audit/DiscoveryModeZone.ts', '${attrValStr}',     '${escHtml(attrValStr)}'],
    // Version labels (user-typed in the save modal). Matched WITH their markup
    // context — the same `${v.label}` also appears in `confirm(…)`, `showToast`
    // (textContent) and `console.log`, which are not HTML sinks and are
    // deliberately left alone.
    ['version list label',        'ui/platform/PlatformVersionController.ts', '"plat-version-label">\n                        ${v.label}', '"plat-version-label">\n                        ${escHtml(v.label)}'],
    ['version preview banner',    'ui/platform/PlatformVersionController.ts', 'PREVIEW MODE — "${version.label}"', 'PREVIEW MODE — "${escHtml(version.label)}"'],
    ['version preview overlay',   'ui/platform/PlatformVersionController.ts', 'Entering preview: "${version.label}"', 'Entering preview: "${escHtml(version.label)}"'],
    ['version loading overlay',   'ui/platform/PlatformVersionController.ts', 'Loading "${version.label}"', 'Loading "${escHtml(version.label)}"'],
    // Imported / user-authored names.
    ['import overlay file name',  'engine/initUI.ts',                    '${file.name}"',       '${escHtml(file.name)}"'],
    ['template library name',     'ui/dataworkbench/TemplateEditorPanel.ts', '${t.name}</div>',  '${escHtml(t.name)}</div>'],
    ['variant merge room name',   'ui/generative/VariantBrowserPanel.ts', '<span>${r.name}',     '<span>${escHtml(r.name)}'],
    ['render job name',           'ui/rendering/RenderQueuePanel.ts',     '${job.name}',         '${escHtml(job.name)}'],
    ['panorama entry name',       'ui/rendering/PanoramaPanel.ts',        '${entry.name}',       '${escHtml(entry.name)}'],
  ];

  for (const [label, file, raw, guarded] of CASES) {
    it(`${label} stays guarded (${file})`, () => {
      const src = read(file);
      // The guarded form must be present…
      expect(src, `expected guarded form ${guarded} in ${file}`).toContain(guarded);
      // …and the raw form must not survive anywhere outside it. Strip every
      // guarded occurrence, then assert the bare pattern is gone.
      const stripped = src.split(guarded).join('');
      expect(stripped, `raw sink ${raw} reappeared in ${file}`).not.toContain(raw);
    });
  }

  it('CompliancePanel still routes its print popup through the escaped rows', () => {
    const src = read('ui/dataworkbench/CompliancePanel.ts');
    // document.write is retained (it is a print popup), but every cell value
    // in the rows it writes must be escaped.
    expect(src).toContain('win.document.write(html)');
    for (const cell of ['r.ruleId', 'r.elementType ?? \'—\'', 'r.message', 'r.regulation ?? \'—\'', 'r.suggestion ?? \'—\'']) {
      expect(src, `print cell ${cell} unescaped`).toContain(`escHtml(${cell})`);
    }
  });
});
