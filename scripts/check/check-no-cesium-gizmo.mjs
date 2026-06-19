#!/usr/bin/env node
/**
 * scripts/check/check-no-cesium-gizmo.mjs
 *
 * §CESIUM-GIZMO-REMOVED (founder 2026-06-19) — regression guard.
 *
 * The Cesium real-mode viewer used to attach a transform gizmo (RED/GREEN/BLUE
 * origin axis arrows) to the BIM model on selection. Those are the "green/purple
 * lines at a corner of the building" the founder repeatedly asked to remove. The
 * gizmo (TransformGizmo.ts) was deleted and its construction/attach sites removed.
 *
 * This gate fails (exit 1) if the gizmo is reintroduced — i.e. if any of these
 * appear in the editor source:
 *   • a TransformGizmo.ts file under the geospatial viewer
 *   • `new TransformGizmo(` construction
 *   • a `.gizmo.attach(` / `.gizmo.setMode(` call on the Cesium viewport
 * Comment lines (// or *) are ignored so the §CESIUM-GIZMO-REMOVED notes don't trip it.
 *
 * Usage: node scripts/check/check-no-cesium-gizmo.mjs  |  npm run check:cesium-gizmo
 * Exit: 0 OK · 1 regression · 2 internal error (grep unavailable).
 */

import { spawnSync } from 'node:child_process';
import { resolve, relative } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(__dirname, '..', '..');
const SCAN_DIR = resolve(ROOT, 'apps', 'editor', 'src', 'ui');
// Forbidden patterns (extended regex). A re-add must trip at least one.
// Covers the deleted TransformGizmo AND any future origin-axis indicator drawn
// directly — a coloured Cesium axis polyline or a THREE axis/arrow helper bridged
// into the Cesium scene (the "green + purple perpendicular lines at the building
// corner"). All confirmed zero-match in the current tree, so this is pure insurance.
const PATTERN = 'new TransformGizmo\\(|\\.gizmo\\.attach\\(|\\.gizmo\\.setMode\\('
    + '|Cesium\\.Color\\.(GREEN|MAGENTA|PURPLE)'
    + '|new THREE\\.(AxesHelper|ArrowHelper)\\('
    + '|new Cesium\\.DebugModelMatrixPrimitive\\(';

const BANNER = '-'.repeat(66);
console.log('\n' + BANNER);
console.log('  CI gate: no Cesium transform gizmo (origin axis lines)');
console.log('  §CESIUM-GIZMO-REMOVED — founder 2026-06-19');
console.log(BANNER);

if (!existsSync(SCAN_DIR)) {
    console.log('  scan dir missing (skipped): ' + relative(ROOT, SCAN_DIR) + '\n');
    process.exit(0);
}

const result = spawnSync('grep', [
    '-rnE', '--include=*.ts', '--include=*.tsx',
    '--exclude-dir=dist', '--exclude-dir=node_modules',
    PATTERN, SCAN_DIR,
], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, cwd: ROOT });

if (result.error) {
    if (result.error.code === 'ENOENT') {
        console.error('  FATAL — grep not found in PATH'); process.exit(2);
    }
    throw result.error;
}
if (result.status !== 0 && result.status !== 1) {
    console.error('  grep failed:', result.stderr); process.exit(2);
}

const violations = [];
for (const rawLine of (result.stdout || '').split('\n')) {
    if (!rawLine) continue;
    const a = rawLine.indexOf(':');
    const b = rawLine.indexOf(':', a + 1);
    if (a < 0 || b < 0) continue;
    const text = rawLine.slice(b + 1);
    const trimmed = text.trimStart();
    if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue;  // skip comments
    violations.push({ file: relative(ROOT, rawLine.slice(0, a)), lineNo: rawLine.slice(a + 1, b), text: trimmed });
}

// Also forbid the gizmo source file itself coming back.
const gizmoFile = resolve(SCAN_DIR, 'geospatial', 'TransformGizmo.ts');
if (existsSync(gizmoFile)) {
    violations.push({ file: relative(ROOT, gizmoFile), lineNo: '-', text: 'TransformGizmo.ts re-created (delete it)' });
}

if (violations.length === 0) {
    console.log('  PASS — no Cesium transform gizmo / origin axes present.\n' + BANNER + '\n');
    process.exit(0);
}

console.log('  FAIL — the Cesium origin-axis gizmo was reintroduced:\n');
for (const v of violations) console.log('    ' + v.file + ':' + v.lineNo + '  ' + v.text.slice(0, 90));
console.log('\n  The green/purple origin axis lines were removed by founder request.');
console.log('  Do NOT re-add TransformGizmo / .gizmo.attach to the Cesium viewer.\n' + BANNER + '\n');
process.exit(1);
