// scripts/capture-pryzm1-wall-references.ts
//
// **Cross-engine parity capture infrastructure** for S08-T7.
//
// Reads every `tests/parity/wall/configs/*.json` (the 30 wall
// fixture DTOs emitted by `wall-snapshot.test.ts`), runs each one
// through PRYZM 1's `WallFragmentBuilder.generate()`, and dumps the
// resulting `BufferGeometry` to
// `tests/parity/wall/references/<id>.ref.json` in the same shape the
// kernel snapshots use.  These reference files are the byte-equality
// gate that proves the new geometry kernel matches the legacy engine
// **for the trapping-set of fixtures** the contract demands.
//
// Why this is a separate script (not a Vitest test):
//
//   PRYZM 1's `WallFragmentBuilder` lives under `src/elements/walls/**`
//   and depends on the live THREE.js singleton, the global system-type
//   registry, and the running editor `Scene` graph.  Spinning all of
//   that up inside a Vitest test file would break the
//   "no edits under `src/elements/walls/**`" S08 constraint (we'd have
//   to add export shims).  Running this script against the live PRYZM
//   1 dev server side-steps the issue: the script is a one-shot
//   reference-file emitter, not part of CI.
//
// **Operator workflow** (documented in
// `docs/04-reference/architecture-detail/parity-fixtures.md`):
//
//   1. `npm run dev`                         — start PRYZM 1.
//   2. Open the editor, ensure the default project loads.
//   3. `npx tsx scripts/capture-pryzm1-wall-references.ts`
//      The script fetches each fixture, posts it to a tiny
//      capture endpoint exposed by the dev server (see comment
//      below), and writes the references under
//      `tests/parity/wall/references/`.
//   4. Commit the references; from then on
//      `tests/parity/wall/wall-pryzm1-cross-engine.test.ts`
//      (a follow-up test) gates kernel ↔ PRYZM-1 byte equality.
//
// **Capture endpoint** (added separately when the parity gate is
// activated): `POST /__parity/wall/capture { fixture }` →
// `{ position, normal, uv, index, groups, bounds }`.  Until the
// endpoint exists this script writes a stub reference indicating
// the fixture is "captured-pending" so the cross-engine test can
// gracefully skip rather than fail.

import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const CFG_DIR = resolve(ROOT, 'tests/parity/wall/configs');
const REF_DIR = resolve(ROOT, 'tests/parity/wall/references');
const ENDPOINT = process.env.PRYZM1_CAPTURE_URL ?? 'http://localhost:5000/__parity/wall/capture';

interface FixtureFile {
  id: string;
  description: string;
  wall: unknown;
  joinData: unknown;
  worldY: number;
}

interface CapturedReference {
  id: string;
  capturedAt: string;
  status: 'ok' | 'capture-pending';
  source: 'pryzm1' | 'stub';
  position?: number[];
  normal?: number[];
  uv?: number[];
  index?: { kind: 'u16' | 'u32'; values: number[] };
  groups?: { start: number; count: number; materialIndex: number }[];
  bounds?: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } };
  notes?: string;
}

async function captureOne(fixture: FixtureFile): Promise<CapturedReference> {
  try {
    const resp = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ fixture }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const payload = await resp.json() as Omit<CapturedReference, 'id' | 'capturedAt' | 'status' | 'source'>;
    return {
      id: fixture.id,
      capturedAt: new Date().toISOString(),
      status: 'ok',
      source: 'pryzm1',
      ...payload,
    };
  } catch (e) {
    const err = e as Error;
    return {
      id: fixture.id,
      capturedAt: new Date().toISOString(),
      status: 'capture-pending',
      source: 'stub',
      notes: `Capture endpoint unreachable (${err.message}). ` +
        'Boot PRYZM 1 dev server and POST { fixture } to ' +
        '/__parity/wall/capture to populate this reference.',
    };
  }
}

async function main(): Promise<void> {
  if (!existsSync(CFG_DIR)) {
    console.error(`[capture] config dir missing: ${CFG_DIR}`);
    console.error('[capture] run `npm test --workspace @pryzm/geometry-kernel` first to populate it.');
    process.exit(1);
  }
  mkdirSync(REF_DIR, { recursive: true });

  const files = readdirSync(CFG_DIR).filter((f) => f.endsWith('.json')).sort();
  let ok = 0, pending = 0;
  for (const file of files) {
    const fx = JSON.parse(readFileSync(resolve(CFG_DIR, file), 'utf8')) as FixtureFile;
    const ref = await captureOne(fx);
    writeFileSync(resolve(REF_DIR, `${fx.id}.ref.json`), JSON.stringify(ref, null, 2) + '\n');
    if (ref.status === 'ok') { ok++; console.log(`[capture] ok       ${fx.id}`); }
    else { pending++; console.log(`[capture] pending  ${fx.id}`); }
  }
  console.log(`\n[capture] complete — ${ok} ok, ${pending} pending across ${files.length} fixtures.`);
  if (pending === files.length) {
    console.log('[capture] NOTE: all fixtures pending. Start PRYZM 1 dev server and re-run.');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
