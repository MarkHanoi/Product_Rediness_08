// ─── GATE · check-provenance-slice-persisted ─────────────────────────────────
//
// C70 I-INV-2 / I-INV-3 · C75 · PV-05 · C70 §5 exit-code contract.
//
// ─── WHY THIS FILE EXISTS, AND WHY IT IS NOT A WRAPPER ───────────────────────
// PV-05 — *"`ProvenanceStore` (C23 AI lineage) is not persisted at all —
// destroyed on every reload"* — is declared CLOSED with a reading of
// **NOT DETERMINED** and a deciding instrument that reads, in full:
// *"the serializer's `provenance` slice + suite"*. `bim30-status` prints it
// CARRIED, and correctly: two artefacts are named and no way to run them is.
//
// The cited suite (`packages/persistence-client/__tests__/provenanceSlice
// Persistence.test.ts`) is a good one — it executes the REAL serialise/hydrate
// pair and it source-pins the wiring. But read the two paths in its `beforeAll`:
//
//     packages/persistence-client/src/loader/ProjectSerializer.ts
//     packages/persistence-client/src/loader/ProjectLoader.ts
//
// ⭐ **There are TWO copies of each, and it pins only one.** The editor ships
// `apps/editor/src/engine/persistence/ProjectSerializer.ts` and its sibling
// `ProjectLoader.ts` — an L7 pair the L3 suite does not read — and the app copy
// is the one a real session executes. Delete the `provenance` key from the APP
// serializer and every assertion in that suite still passes, because the copy it
// pins is untouched. §PV-05-APP-COPY is written into the app loader's own
// docblock; nothing was checking it.
//
// A gate in `tools/` has no layer, so it can read both. That is S1/S2 below —
// filling a gap the cited evidence's own scope creates, exactly as
// `check-ubg-snapshot-derived` does for GR-17, rather than re-running what
// already runs.
//
// ─── THE ARMS ────────────────────────────────────────────────────────────────
//   S1 · BOTH serialisers WRITE the slice, and write it CONDITIONALLY. The
//        condition is not decoration: an unwired bootstrap that wrote an empty
//        slice would overwrite a real audit log with "this project has no
//        lineage", which is C70 I-INV-3's defect (a loss that renders as a fact)
//        and is worse than not persisting at all. So the arm demands the
//        `store ? store.serialize() : undefined` shape, not merely the word.
//   S2 · BOTH loaders RESTORE the slice — `provenanceStore.hydrate(
//        snapshot.provenance)`. PV-05's claim is *destroyed on every reload*;
//        a write with no read closes nothing. ⚠ This is the direction a
//        serialiser-only check gets wrong, and it is the direction that matters.
//   S3 · THE CITED SUITE IS NOT DARK — claimed by an `include` glob in its
//        package config (or by vitest's default when the config declares none:
//        absence of the key is NOT darkness).
//   S4 · THE CITED SUITE EXECUTES GREEN, spawned here rather than read from a
//        stale artefact, with a floor on the TEST COUNT so a run that matched no
//        files cannot pass as a clean one.
//
// ─── WHAT THIS GATE DOES **NOT** ESTABLISH ───────────────────────────────────
//   • That a real browser session saves and reloads a real project's lineage.
//     The suite states that limitation about itself and this gate inherits it:
//     neither `ProjectSerializer.serialize()` nor `ProjectLoader.load()` is
//     EXECUTED anywhere in this evidence chain. Both are source-pinned.
//   • That the app copy and the package copy AGREE beyond the two shapes below.
//     Two serialisers is itself a duplication finding — it belongs to C73 §3's
//     family, not to PV-05, and this gate does not raise it.
//   • Anything about provenance INVENTION at deserialisation (PV-01/PV-03 —
//     `check-provenance-not-invented` owns that and must not be conflated with
//     this row: inventing lineage and losing lineage are different defects).
//
// ─── EXECUTED CONTROLS, BOTH DIRECTIONS, EVERY RUN (C70 §5.6) ────────────────
// Every detector is driven over synthetics: the dropped key, the UNCONDITIONAL
// write (the I-INV-3 defect), the write-without-read, and the key surviving only
// in a comment — the live files quote their own history, so comment stripping is
// the arm, not a nicety. A failing control exits 2.

import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { reportGate, type Floor } from '../contract.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, '../../../..');
const GATE = 'check-provenance-slice-persisted';

/** Both copies. The point of this gate is that the cited suite reads only one. */
const SERIALIZERS = [
  'apps/editor/src/engine/persistence/ProjectSerializer.ts',
  'packages/persistence-client/src/loader/ProjectSerializer.ts',
];
const LOADERS = [
  'apps/editor/src/engine/persistence/ProjectLoader.ts',
  'packages/persistence-client/src/loader/ProjectLoader.ts',
];

const PKG_DIR = 'packages/persistence-client';
const PKG_NAME = '@pryzm/persistence-client';
const SUITE = '__tests__/provenanceSlicePersistence.test.ts';
const SUITE_REL = `${PKG_DIR}/${SUITE}`;
const SUITE_TIMEOUT_MS = 180_000;

/** §R5 subject floors. A serialiser file below this is a stub or a bad read. */
const MIN_SERIALIZER_BYTES = 5000;
/** A suite process that reports fewer than this ran nothing worth believing. */
const MIN_SUITE_TESTS = 6;

/* ─────────────────────────── primitives ─────────────────────────── */

export function stripComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

export function globToRegExp(glob: string): RegExp {
  let out = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') {
      if (glob[i + 2] === '/') { out += '(?:[^/]+/)*'; i += 2; } else { out += '.*'; i += 1; }
    } else if (c === '*') out += '[^/]*';
    else if ('.+?^${}()|[]\\'.includes(c)) out += `\\${c}`;
    else out += c;
  }
  return new RegExp(`^${out}$`);
}

export function parseIncludes(src: string): string[] {
  const globs: string[] = [];
  const re = /include:\s*\[([\s\S]*?)\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    for (const s of m[1].match(/'([^']+)'|"([^"]+)"/g) ?? []) globs.push(s.slice(1, -1));
  }
  return globs;
}

export interface SerializerReading {
  /** the optional slice is DECLARED on the snapshot type */
  declaresSlice: boolean;
  /** the slice is written from the store's own serialise method */
  writesSlice: boolean;
  /**
   * …and only when a store is wired. An UNCONDITIONAL write is the C70 I-INV-3
   * defect: an unwired bootstrap silently replaces a real audit log with an
   * empty one, and "no lineage" then reads as a fact rather than as a loss.
   */
  conditional: boolean;
}

/**
 * ⚠ Both spellings are live and both are correct: the app copy destructures
 * (`provenance: provenanceStore ? …`), the package copy does not
 * (`provenance: stores.provenanceStore ? …`). A detector pinned to one spelling
 * would read the other as a missing slice.
 */
export function readSerializer(src: string): SerializerReading {
  const code = stripComments(src);
  return {
    declaresSlice: /provenance\?\s*:/.test(code),
    writesSlice: /provenance\s*:[\s\S]{0,120}?\.serialize\s*\(/.test(code),
    conditional: /provenance\s*:\s*(?:[\w$.]*\b)?provenanceStore\s*\?[\s\S]{0,120}?:\s*undefined/.test(code),
  };
}

/** The restore half — the direction PV-05 is actually about. */
export function readLoader(src: string): { hydrates: boolean; namesTheLoss: boolean } {
  const code = stripComments(src);
  return {
    hydrates: /provenanceStore\s*\.\s*hydrate\s*\(\s*[\w$.]*\bprovenance\b/.test(code),
    namesTheLoss: /\babsent\b/.test(code),
  };
}

/* ─────────────────────────── executed controls ─────────────────────────── */

interface Control { id: string; what: string; pass: boolean }

const APP_SPELLING = `
interface Snapshot { provenance?: import('@pryzm/stores').SerializedProvenance; }
const out = { provenance: provenanceStore ? provenanceStore.serialize() : undefined };
`;
const PKG_SPELLING = `
interface Snapshot { provenance?: import('@pryzm/stores').SerializedProvenance; }
const out = { provenance: stores.provenanceStore ? stores.provenanceStore.serialize() : undefined };
`;
const DROPPED = `interface Snapshot { walls: Wall[]; }\nconst out = { walls };`;
const UNCONDITIONAL = `
interface Snapshot { provenance?: import('@pryzm/stores').SerializedProvenance; }
const out = { provenance: provenanceStore.serialize() };
`;
const COMMENT_ONLY = `/* provenance: provenanceStore ? provenanceStore.serialize() : undefined */\nconst out = { walls };`;

function selfTest(): Control[] {
  return [
    { id: 'S1a', what: 'the APP spelling (bare provenanceStore) reads as declared · written · conditional', pass: (() => { const r = readSerializer(APP_SPELLING); return r.declaresSlice && r.writesSlice && r.conditional; })() },
    { id: 'S1b', what: 'the PACKAGE spelling (stores.provenanceStore) reads the same — a detector pinned to one spelling would call the other a missing slice', pass: (() => { const r = readSerializer(PKG_SPELLING); return r.declaresSlice && r.writesSlice && r.conditional; })() },
    { id: 'S1c', what: 'a serialiser that DROPPED the slice is detected', pass: (() => { const r = readSerializer(DROPPED); return !r.declaresSlice && !r.writesSlice; })() },
    { id: 'S1d', what: 'an UNCONDITIONAL write is detected — an unwired bootstrap must not overwrite a real audit log with an empty one (C70 I-INV-3)', pass: (() => { const r = readSerializer(UNCONDITIONAL); return r.writesSlice && !r.conditional; })() },
    { id: 'S1e', what: 'a slice surviving only inside a comment earns NO credit — these files quote their own history verbatim', pass: (() => { const r = readSerializer(COMMENT_ONLY); return !r.writesSlice && !r.conditional; })() },
    { id: 'S2a', what: 'a loader that hydrates the slice is credited', pass: readLoader(`const prov = this.provenanceStore.hydrate(snapshot.provenance);`).hydrates },
    { id: 'S2b', what: 'a WRITE-ONLY pair is detected — the direction PV-05 is about is the READ', pass: !readLoader(APP_SPELLING).hydrates },
    { id: 'S2c', what: 'a hydrate quoted in a comment earns no credit', pass: !readLoader(`// this.provenanceStore.hydrate(snapshot.provenance) — planned`).hydrates },
    { id: 'S3a', what: 'a `__tests__/**/*.test.ts` include claims the cited suite', pass: globToRegExp('__tests__/**/*.test.ts').test(SUITE) },
    { id: 'S3b', what: 'the same include does NOT claim a `.spec.ts` file', pass: !globToRegExp('__tests__/**/*.test.ts').test('__tests__/x.spec.ts') },
  ];
}

/* ─────────────────────────── main ─────────────────────────── */

function main(): void {
  const controls = selfTest();
  const controlsPassed = controls.filter((x) => x.pass).length;

  const findings: string[] = [];
  const lines: string[] = [];

  // S1 — both serialisers.
  let serialisersSeen = 0;
  let smallestSerializer = Number.MAX_SAFE_INTEGER;
  for (const rel of SERIALIZERS) {
    const p = resolve(REPO, rel);
    if (!existsSync(p)) { lines.push(`S1  ${rel} — NOT FOUND`); continue; }
    serialisersSeen++;
    const src = readFileSync(p, 'utf8');
    smallestSerializer = Math.min(smallestSerializer, src.length);
    const r = readSerializer(src);
    if (!r.declaresSlice) findings.push(`S1 ${rel} declares no optional \`provenance\` slice on its snapshot type`);
    if (!r.writesSlice) findings.push(`S1 ${rel} never WRITES the provenance slice — the C23 lineage is destroyed on every reload through this path (PV-05)`);
    else if (!r.conditional) findings.push(`S1 ${rel} writes the provenance slice UNCONDITIONALLY — an unwired bootstrap overwrites a real audit log with an empty one, and the loss then reads as the fact "this project has no lineage" (C70 I-INV-3)`);
    lines.push(`S1  ${rel} — declares ${r.declaresSlice ? 'YES' : 'NO'} · writes ${r.writesSlice ? 'YES' : 'NO'} · conditional ${r.conditional ? 'YES' : 'NO'}`);
  }

  // S2 — both loaders.
  let loadersSeen = 0;
  for (const rel of LOADERS) {
    const p = resolve(REPO, rel);
    if (!existsSync(p)) { lines.push(`S2  ${rel} — NOT FOUND`); continue; }
    loadersSeen++;
    const r = readLoader(readFileSync(p, 'utf8'));
    if (!r.hydrates) findings.push(`S2 ${rel} never HYDRATES snapshot.provenance — a slice written and never read closes nothing; PV-05's claim is *destroyed on every reload*`);
    lines.push(`S2  ${rel} — hydrates ${r.hydrates ? 'YES' : 'NO'} · names the loss ${r.namesTheLoss ? 'YES' : 'NO'}`);
  }

  // S3 — dark?
  const cfgPath = resolve(REPO, `${PKG_DIR}/vitest.config.ts`);
  const globs = existsSync(cfgPath) ? parseIncludes(readFileSync(cfgPath, 'utf8')) : [];
  const claims = globs.length === 0
    ? ['(vitest default include — config declares none)']
    : globs.filter((g) => globToRegExp(g).test(SUITE) || globToRegExp(g).test(SUITE_REL));
  const suiteExists = existsSync(resolve(REPO, SUITE_REL));
  if (suiteExists && claims.length === 0) {
    findings.push(`S3 ${SUITE_REL} is claimed by NO include glob — the cited evidence runs nowhere`);
  }
  lines.push(`S3  ${SUITE_REL} claimed by: ${claims.length ? claims.join(' · ') : 'NOTHING'}`);

  // S4 — execute. `pnpm --filter`, not `npx vitest`: see the note in
  // check-polygon-boolean-canonical — npx resolves a doubled node_modules path in
  // this workspace and dies MODULE_NOT_FOUND with exit 1 and zero tests, which is
  // "measured nothing" wearing a failure's clothes.
  const r = spawnSync('pnpm', ['--filter', PKG_NAME, 'exec', 'vitest', 'run', SUITE], {
    cwd: REPO, encoding: 'utf8', shell: true, timeout: SUITE_TIMEOUT_MS,
    maxBuffer: 64 * 1024 * 1024, env: process.env,
  });
  const ran = r.status !== null && !r.error ? 1 : 0;
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  const passed = Number(out.match(/Tests\s+(\d+) passed/)?.[1] ?? 0);
  if (ran && r.status !== 0) findings.push(`S4 the cited suite exited ${r.status} — PV-05's evidence no longer holds`);
  if (/No test files found/.test(out)) findings.push('S4 vitest matched NO test files — the run measured nothing');

  lines.push(
    `S4  vitest exited ${r.status === null ? 'NULL (spawn failure or timeout)' : r.status} · ${passed} test(s) passed`,
    '',
    `executed controls (C70 §5.6 — an arm never watched failing is UNPROVEN): ${controlsPassed}/${controls.length}`,
    ...controls.map((x) => `   ${x.pass ? '✓' : '❌'} ${x.id} ${x.what}`),
    '',
    'NOT MEASURED HERE: that a real browser session saves and reloads a real project’s',
    'lineage — neither serialize() nor load() is EXECUTED anywhere in this evidence chain,',
    'and the cited suite says so about itself · that the two serialiser copies AGREE beyond',
    'the shapes above (two copies is a C73 §3 duplication question, not a PV-05 one) ·',
    'provenance INVENTION at deserialisation, which is PV-01/PV-03 and a different defect.',
  );

  const floors: Floor[] = [
    { what: 'executed controls passed', measured: controlsPassed, min: controls.length },
    { what: 'ProjectSerializer copies located (of 2)', measured: serialisersSeen, min: 2 },
    { what: 'ProjectLoader copies located (of 2)', measured: loadersSeen, min: 2 },
    { what: 'smallest serialiser bytes (MIN_SERIALIZER_BYTES)', measured: serialisersSeen ? smallestSerializer : 0, min: MIN_SERIALIZER_BYTES },
    { what: 'cited suite located', measured: suiteExists ? 1 : 0, min: 1 },
    { what: 'suite process spawned and exited', measured: ran, min: 1 },
    { what: 'suite tests actually executed (MIN_SUITE_TESTS)', measured: passed, min: MIN_SUITE_TESTS },
  ];

  process.exit(reportGate({ gate: GATE, floors, lines, findings: findings.length, declared: 0, findingNames: findings }));
}

main();
