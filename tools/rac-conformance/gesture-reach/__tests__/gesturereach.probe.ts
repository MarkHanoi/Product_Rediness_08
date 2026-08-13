// ─── HARNESS 6 — GESTURE→COMMAND REACHABILITY (CE-05) ───────────────────────
//
// THE GAP THIS EXISTS FOR
// ─────────────────────────────────────────────────────────────────────────────
// H5 (`../certification/__tests__/graphruntime.cert.ts`) instrumented
// command→graph, and its own not-measured block says, verbatim: *"GESTURE
// reachability. This probe constructs the command itself. It does NOT prove
// any user gesture, tool, bus verb or panel can reach that command. L-847 (a
// whole workbench shipping unreachable) lives in this gap."* The harness suite
// started one link too late. This file is the missing first link: does a user
// GESTURE — a rendered button, clicked — actually produce a command dispatch,
// and does that dispatch name a command that exists?
//
// This is the defect class that produced the programme's two worst findings:
// L-847 (a whole Data workbench authored, reviewed, counted — and unreachable)
// and §C-B1 in `engineLauncher.ts` ("The MainToolbar buttons dispatched these
// bus commands, but no handler was registered anywhere → every click was a
// silent no-op"). Existence audits pass where reachability audits fail
// (C70 §4.2), and the repo's signature hazard is authored-but-unwired.
//
// ═════════════════════════════════════════════════════════════════════════════
// EXACTLY WHAT THIS PROBE DOES AND DOES **NOT** COVER — read before quoting it
// ═════════════════════════════════════════════════════════════════════════════
// SUBJECT (v1, deliberately narrow and REAL): the 30 toolbar surfaces in
// `apps/editor/src/ui/toolbar/*.ts`. Every one exports a `*_TOOLBAR_BUTTONS`
// array declaring "this button dispatches command X" and a `constructor(runtime)`
// class that renders `[data-command]` buttons. That declared pair set is the
// probe's row set — machine-read, never hand-copied.
//
// MEASURED, per declared gesture→command pair, in two SEPARATE classes that are
// never merged (C70 §0.1 — resolution is not execution):
//
//   EXECUTED   The real toolbar class is constructed in happy-dom against the
//              REAL CommandBus from the certification world; the real DOM
//              button is clicked; the probe observes whether `executeCommand`
//              was invoked with the DECLARED verb (a recording tap that still
//              delegates to the real bus — instrumentation, not substitution),
//              and whether the real bus held a registered handler for it at
//              dispatch time (`bus.registry.has`, an executed census).
//   RESOLVED   Where the harness bus has no handler (this world composes
//              initBusHandlers + 9 plugin verbs, NOT the full engineLauncher
//              boot), the verb is resolved STRUCTURALLY against the generated
//              API-VERB-REGISTER (docs/04-reference/API-VERB-REGISTER.md, the
//              C69 artefact) — the command exists and has a declared handler
//              site in production, but no execution has proven this pair.
//
// VERDICTS (UNPROVEN is neither pass nor fail — C70 §2.2):
//   EXECUTED-REACHED  click → dispatch observed → a REAL registered handler
//                     received it on the real bus, in this process.
//   RESOLVED-ONLY     click → dispatch observed (EXECUTED); the verb has no
//                     handler on the harness bus but HAS a register row.
//                     The gesture→dispatch link is proven; dispatch→handler is
//                     resolution only. Never promoted to EXECUTED-REACHED.
//   NOT-REACHED       click → dispatch observed → the verb has NO handler on
//                     the bus, NO register row, and NO occurrence anywhere
//                     outside the dispatching surface / type maps / tests —
//                     the §C-B1 silent-no-op class, live. ALSO: a click that
//                     produced no dispatch at all.
//   UNPROVEN          the surface could not be imported/constructed, the
//                     button was not rendered, or the verb occurs somewhere
//                     this probe cannot classify (the occurrences are NAMED in
//                     the row — a human must look; the probe does not guess).
//
// THE MOUNT COLUMN — the finding this file must not bury: a pair can be
// EXECUTED-REACHED here and still be USER-unreachable, because nothing in
// production ever CONSTRUCTS the toolbar. `surfaceMounted` is measured per
// surface (static import evidence: any non-test file citing `toolbar/<Name>`),
// printed per row, and never folded into the pair verdict. An unmounted
// surface is the L-847 shape itself: user→gesture is broken one link above
// gesture→command.
//
// NOT COVERED — still UNPROVEN; never cite this file as evidence for them:
//   (a) Keyboard shortcuts. The CREATE-rail map (creationToolShortcuts.ts)
//       activates TOOLS, not bus commands — the tool→command link is a
//       different instrument.
//   (b) The command palette, context menus, bottom action menu, and the ~120
//       panel files that call `executeCommand` — not driven in v1.
//   (c) The legacy `src/ui` toolbar (the transitional root users see today).
//   (d) Whether a REACHED handler's write is CORRECT (check-verb-liveness owns
//       that), or whether the handler's side effect is visible to the user.
//   (e) `surfaceMounted` is static import evidence, not a rendered-DOM proof.
//
// WHY GREEN IS REACHABLE (L-716) AND WHY RED IS REACHABLE (C70 §5.6):
// five PLANTED controls run every time — a positive that must read
// EXECUTED-REACHED (handler observed firing), a planted gesture naming a
// nonexistent command that must read NOT-REACHED by name, a planted gesture
// naming a register verb absent from the harness bus that must read
// RESOLVED-ONLY, an inert button that must read NOT-REACHED (no dispatch),
// and a declared-but-never-rendered button that must read UNPROVEN. If any
// control misreads, every other verdict in the file is void.
//
// STUB LEDGER: inherited whole from `../certification/world` (declared there).
// The recording bus facade is a TAP: it records (verb, handler-presence) and
// then calls the real `bus.executeCommand`, catching rejections so an
// unregistered verb cannot detonate the run. Nothing measured here reads a
// verdict from the facade alone — handler presence is read from the real
// bus registry, and the positive control's proof is the handler's own side
// effect, observed.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync, readdirSync, statSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';

// ─── locations ───────────────────────────────────────────────────────────────
const HERE = __dirname;                                   // gesture-reach/__tests__
const ROOT = path.resolve(HERE, '..', '..', '..', '..');  // repo root
const TOOLBAR_DIR = path.join(ROOT, 'apps', 'editor', 'src', 'ui', 'toolbar');
const REGISTER = path.join(ROOT, 'docs', '04-reference', 'API-VERB-REGISTER.md');
const RESULTS_DIR = path.join(HERE, '..', 'results');

// ─── honesty floors — MISCONFIGURATION detectors, not targets ────────────────
// Measured at first run (2026-08-13): 30 surfaces, 379 declared pairs. Set well
// below the reading; never raise to go green, never lower beneath the subject.
const MIN_SURFACES_DRIVEN = 25;
const MIN_PAIRS = 250;

// ─── row shapes ──────────────────────────────────────────────────────────────
type Verdict = 'EXECUTED-REACHED' | 'RESOLVED-ONLY' | 'NOT-REACHED' | 'UNPROVEN';

interface PairRow {
  surface: string;                 // e.g. 'SettingsToolbar'
  gesture: string;                 // e.g. 'click [data-command="settings-open"]'
  declaredCommand: string;
  /** EXECUTED evidence — the click produced a dispatch naming the declared verb. */
  dispatchObserved: boolean;
  /** EXECUTED evidence — the real bus held a handler for the verb at dispatch time. */
  busHandler: boolean;
  /** RESOLVED evidence — the verb has a row in the generated API-VERB-REGISTER. */
  registerRow: boolean;
  /** Files (outside this surface / type maps / tests) where the quoted verb occurs. */
  occurrences: string[];
  surfaceMounted: boolean;
  verdict: Verdict;
  detail: string;
}

interface SurfaceRow {
  surface: string;
  file: string;
  mountedBy: string[];             // non-test files citing `toolbar/<Name>`; [] = L-847-class
  declaredButtons: number;
  renderedButtons: number;
  status: 'DRIVEN' | 'IMPORT-FAILED' | 'CONSTRUCT-FAILED' | 'NO-BUTTONS-EXPORT';
  error?: string;
}

const pairRows: PairRow[] = [];
const surfaceRows: SurfaceRow[] = [];
const controlRows: PairRow[] = [];
let registrationFailures: Array<{ verb: string; reason: string }> = [];
let registerVerbCount = 0;
let echoFired = 0;

// ─── helpers ─────────────────────────────────────────────────────────────────

/** The verb column of the generated register (same parse as check-verb-liveness). */
function parseRegisterVerbs(md: string): Set<string> {
  const out = new Set<string>();
  for (const line of md.split('\n')) {
    const m = /^\|\s*`([a-z][\w-]*(?:\.[\w-]+)*)`\s*\|/.exec(line);
    if (m?.[1]) out.add(m[1]);
  }
  return out;
}

function* walk(dir: string): Generator<string> {
  let entries: string[];
  try { entries = readdirSync(dir); } catch { return; }
  for (const e of entries) {
    if (e === 'node_modules' || e === 'dist' || e === '.git' || e === '__tests__'
      || e === '__mocks__' || e === 'coverage') continue;
    const abs = path.join(dir, e);
    let st; try { st = statSync(abs); } catch { continue; }
    if (st.isDirectory()) yield* walk(abs);
    else if (/\.tsx?$/.test(e) && !/\.d\.ts$/.test(e) && !/\.(spec|test)\.tsx?$/.test(e)) yield abs;
  }
}

const escRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ─── the world + the drive, all in beforeAll (rows asserted by the its) ──────
beforeAll(async () => {
  const { buildWorld } = await import('../../certification/world');
  const world = await buildWorld();
  registrationFailures = world.registrationFailures;
  const bus = world.bus as unknown as {
    executeCommand: (t: string, p: unknown) => Promise<unknown>;
    register: (h: unknown) => void;
    registry: Map<string, unknown>;
  };

  // ── the recording TAP — delegates to the REAL bus, never substitutes it ────
  const dispatches: Array<{ type: string; handler: boolean }> = [];
  const settled: Promise<unknown>[] = [];
  const facadeBus = {
    executeCommand: (type: string, payload: unknown): Promise<unknown> => {
      dispatches.push({ type, handler: bus.registry?.has?.(type) === true });
      const p = bus.executeCommand(type, payload).catch(() => undefined);
      settled.push(p);
      return p;
    },
  };
  const runtimeFacade = { bus: facadeBus } as never;

  // ── the positive-control handler, registered on the REAL bus ──────────────
  bus.register({
    type: 'gesture.probe.echo',
    affectedStores: [] as const,
    canExecute: () => ({ valid: true }),
    execute: () => { echoFired += 1; return { forward: [], inverse: [] }; },
  });

  // ── resolution source 1: the C69 register artefact ─────────────────────────
  if (!existsSync(REGISTER)) throw new Error('MISCONFIGURED — API-VERB-REGISTER.md not found; resolution has no source');
  const registerVerbs = parseRegisterVerbs(readFileSync(REGISTER, 'utf8'));
  registerVerbCount = registerVerbs.size;

  // ── discover + drive every toolbar surface ─────────────────────────────────
  const toolbarFiles = readdirSync(TOOLBAR_DIR)
    .filter((f) => /Toolbar\.ts$/.test(f))
    .sort();

  interface Driven {
    surface: string;
    declared: Array<{ commandType: string }>;
    element: HTMLElement | null;
  }
  const drivenSurfaces: Driven[] = [];

  for (const f of toolbarFiles) {
    const surface = f.replace(/\.ts$/, '');
    const row: SurfaceRow = {
      surface, file: `apps/editor/src/ui/toolbar/${f}`, mountedBy: [],
      declaredButtons: 0, renderedButtons: 0, status: 'DRIVEN',
    };
    let mod: Record<string, unknown>;
    // Relative specifier so vitest's module runner (not native ESM) loads the TS.
    try { mod = await import(`../../../../apps/editor/src/ui/toolbar/${surface}.ts`); }
    catch (e) {
      row.status = 'IMPORT-FAILED'; row.error = String(e).slice(0, 300);
      surfaceRows.push(row); continue;
    }
    const buttonsKey = Object.keys(mod).find((k) => /_TOOLBAR_BUTTONS$/.test(k) && Array.isArray(mod[k]));
    const clsKey = Object.keys(mod).find((k) => /Toolbar$/.test(k) && typeof mod[k] === 'function');
    if (!buttonsKey || !clsKey) {
      row.status = 'NO-BUTTONS-EXPORT';
      row.error = `buttons=${buttonsKey ?? 'MISSING'} class=${clsKey ?? 'MISSING'}`;
      surfaceRows.push(row); continue;
    }
    const declared = (mod[buttonsKey] as Array<{ commandType: string }>).filter((b) => typeof b?.commandType === 'string');
    row.declaredButtons = declared.length;
    let element: HTMLElement | null = null;
    try {
      const inst = new (mod[clsKey] as new (r: never) => { element: HTMLElement })(runtimeFacade);
      element = inst.element;
      row.renderedButtons = element.querySelectorAll('[data-command]').length;
    } catch (e) {
      row.status = 'CONSTRUCT-FAILED'; row.error = String(e).slice(0, 300);
    }
    surfaceRows.push(row);
    drivenSurfaces.push({ surface, declared, element });
  }

  // ── mount + occurrence scan — ONE pass over the plausible roots ────────────
  // Occurrence hunt exists to prevent a FALSE NOT-REACHED: a registration site
  // this probe did not model. Any hit downgrades the verdict to UNPROVEN with
  // the files named — the probe does not guess what a hit means.
  const allVerbs = new Set<string>();
  for (const d of drivenSurfaces) for (const b of d.declared) allVerbs.add(b.commandType);
  const verbList = [...allVerbs];
  const verbRe = verbList.length > 0
    ? new RegExp(`['"\`](${verbList.map(escRe).join('|')})['"\`]`, 'g')
    : null;
  const occurrences = new Map<string, string[]>();
  const mountedBy = new Map<string, string[]>();
  const scanRoots = ['apps/editor/src', 'src', 'plugins', 'packages'].map((r) => path.join(ROOT, r));
  const toolbarDirNorm = TOOLBAR_DIR.replace(/\\/g, '/');
  const commandBusPkg = path.join(ROOT, 'packages', 'command-bus').replace(/\\/g, '/');
  for (const root of scanRoots) {
    for (const abs of walk(root)) {
      const norm = abs.replace(/\\/g, '/');
      let src: string; try { src = readFileSync(abs, 'utf8'); } catch { continue; }
      const rel = path.relative(ROOT, abs).replace(/\\/g, '/');
      // mount evidence: any non-test file citing `toolbar/<Name>` outside the dir
      if (!norm.startsWith(toolbarDirNorm) && src.includes('toolbar/')) {
        for (const s of surfaceRows) {
          if (src.includes(`toolbar/${s.surface}`)) {
            const list = mountedBy.get(s.surface) ?? [];
            if (list.length < 10) list.push(rel);
            mountedBy.set(s.surface, list);
          }
        }
      }
      // occurrence evidence: skip the dispatching dir + the command-bus type maps
      if (norm.startsWith(toolbarDirNorm) || norm.startsWith(commandBusPkg)) continue;
      if (verbRe) {
        verbRe.lastIndex = 0;
        let m: RegExpExecArray | null;
        const seen = new Set<string>();
        while ((m = verbRe.exec(src)) !== null) {
          const v = m[1]!;
          if (seen.has(v)) continue;
          seen.add(v);
          const list = occurrences.get(v) ?? [];
          if (list.length < 10) list.push(rel);
          occurrences.set(v, list);
        }
      }
    }
  }
  for (const s of surfaceRows) s.mountedBy = mountedBy.get(s.surface) ?? [];

  // ── classify one pair from its evidence — the ONLY verdict path ────────────
  const classify = (
    declaredCommand: string,
    dispatched: Array<{ type: string; handler: boolean }>,
    rendered: boolean,
  ): { verdict: Verdict; dispatchObserved: boolean; busHandler: boolean; registerRow: boolean; occ: string[]; detail: string } => {
    const registerRow = registerVerbs.has(declaredCommand);
    const occ = occurrences.get(declaredCommand) ?? [];
    if (!rendered) {
      return { verdict: 'UNPROVEN', dispatchObserved: false, busHandler: false, registerRow, occ,
        detail: 'declared button was NOT RENDERED — the gesture could not be driven' };
    }
    const hit = dispatched.find((d) => d.type === declaredCommand);
    if (!hit) {
      const other = dispatched.map((d) => d.type).join(', ');
      return { verdict: 'NOT-REACHED', dispatchObserved: false, busHandler: false, registerRow, occ,
        detail: other.length > 0
          ? `click fired but dispatched [${other}] instead of the declared verb`
          : 'click fired and NO dispatch was observed — the wiring is broken at the gesture' };
    }
    if (hit.handler) {
      return { verdict: 'EXECUTED-REACHED', dispatchObserved: true, busHandler: true, registerRow, occ,
        detail: 'click → dispatch → registered handler on the REAL bus, in this process' };
    }
    if (registerRow) {
      return { verdict: 'RESOLVED-ONLY', dispatchObserved: true, busHandler: false, registerRow, occ,
        detail: 'dispatch EXECUTED; no handler on the harness bus; verb resolves in API-VERB-REGISTER (structural, not executed)' };
    }
    if (occ.length > 0) {
      return { verdict: 'UNPROVEN', dispatchObserved: true, busHandler: false, registerRow, occ,
        detail: `dispatch EXECUTED; verb has no register row but occurs in ${occ.length} file(s) this probe cannot classify: ${occ.slice(0, 3).join(', ')}` };
    }
    return { verdict: 'NOT-REACHED', dispatchObserved: true, busHandler: false, registerRow, occ,
      detail: 'dispatch EXECUTED into NOTHING — no bus handler, no register row, no occurrence anywhere outside the surface. The §C-B1 silent no-op class, live.' };
  };

  // ── drive every rendered button ────────────────────────────────────────────
  for (const d of drivenSurfaces) {
    const srow = surfaceRows.find((s) => s.surface === d.surface)!;
    const mounted = srow.mountedBy.length > 0;
    for (const b of d.declared) {
      const btn = d.element?.querySelector<HTMLButtonElement>(`[data-command="${b.commandType}"]`) ?? null;
      let delta: Array<{ type: string; handler: boolean }> = [];
      if (btn) {
        const before = dispatches.length;
        btn.click();
        delta = dispatches.slice(before);
      }
      const c = classify(b.commandType, delta, btn !== null);
      pairRows.push({
        surface: d.surface,
        gesture: `click [data-command="${b.commandType}"]`,
        declaredCommand: b.commandType,
        dispatchObserved: c.dispatchObserved, busHandler: c.busHandler,
        registerRow: c.registerRow, occurrences: c.occ,
        surfaceMounted: mounted, verdict: c.verdict, detail: c.detail,
      });
    }
  }

  // ── the five PLANTED controls (C70 §5.6 — every arm watched, both ways) ────
  const plant = (name: string, command: string, wire: 'dispatch' | 'inert' | 'unrendered'): void => {
    const host = document.createElement('div');
    const btn = document.createElement('button');
    btn.setAttribute('data-command', command);
    if (wire === 'dispatch') btn.addEventListener('click', () => { void facadeBus.executeCommand(command, {}); });
    if (wire !== 'unrendered') host.appendChild(btn);
    const target = wire === 'unrendered' ? null : host.querySelector<HTMLButtonElement>(`[data-command="${command}"]`);
    let delta: Array<{ type: string; handler: boolean }> = [];
    if (target) {
      const before = dispatches.length;
      target.click();
      delta = dispatches.slice(before);
    }
    const c = classify(command, delta, target !== null);
    controlRows.push({
      surface: name, gesture: `click [data-command="${command}"]`, declaredCommand: command,
      dispatchObserved: c.dispatchObserved, busHandler: c.busHandler, registerRow: c.registerRow,
      occurrences: c.occ, surfaceMounted: false, verdict: c.verdict, detail: c.detail,
    });
  };

  plant('CONTROL-POSITIVE', 'gesture.probe.echo', 'dispatch');           // must be EXECUTED-REACHED
  plant('CONTROL-PLANTED-NONEXISTENT', 'gesture.probe.planted-nonexistent', 'dispatch'); // must be NOT-REACHED
  // a register verb ABSENT from the harness bus → RESOLVED-ONLY must be reachable
  const resolvedOnlyVerb = [...registerVerbs].find((v) => bus.registry?.has?.(v) !== true);
  if (resolvedOnlyVerb) plant('CONTROL-RESOLVED-ONLY', resolvedOnlyVerb, 'dispatch');
  plant('CONTROL-INERT', 'gesture.probe.inert-button', 'inert');         // must be NOT-REACHED (no dispatch)
  plant('CONTROL-UNRENDERED', 'gesture.probe.never-rendered', 'unrendered'); // must be UNPROVEN

  await Promise.allSettled(settled);
}, 600_000);

// ─── the assertions — the probe fails only when the INSTRUMENT is broken ─────
// Real findings (NOT-REACHED pairs, unmounted surfaces) are REPORTED, loudly,
// in the results JSON and the console; the first reading sets no baseline.

describe('HARNESS 6 — gesture→command reachability (CE-05)', () => {
  it('MISCONFIGURED GUARD — floors: surfaces driven, pairs examined, register parsed', () => {
    const driven = surfaceRows.filter((s) => s.status === 'DRIVEN').length;
    console.log(`[H6] surfaces discovered=${surfaceRows.length} driven=${driven} pairs=${pairRows.length} registerVerbs=${registerVerbCount}`);
    console.log('[H6] world registrationFailures=' + JSON.stringify(registrationFailures));
    expect(driven, `only ${driven} surfaces driven; floor ${MIN_SURFACES_DRIVEN} — the probe did not establish its subject`)
      .toBeGreaterThanOrEqual(MIN_SURFACES_DRIVEN);
    expect(pairRows.length, `only ${pairRows.length} pairs; floor ${MIN_PAIRS}`)
      .toBeGreaterThanOrEqual(MIN_PAIRS);
    expect(registerVerbCount, 'the register parsed no verbs — resolution has no source').toBeGreaterThan(250);
  });

  it('CONTROL-POSITIVE — a planted known-good pair reads EXECUTED-REACHED and the handler FIRED', () => {
    const c = controlRows.find((r) => r.surface === 'CONTROL-POSITIVE');
    console.log('[H6 CONTROL-POSITIVE] ' + JSON.stringify(c));
    expect(c?.verdict).toBe('EXECUTED-REACHED');
    expect(echoFired, 'the handler side effect was never observed — REACHED would be manufactured').toBeGreaterThan(0);
  });

  it('CONTROL-PLANTED-NONEXISTENT — a gesture naming a nonexistent command reads NOT-REACHED by name', () => {
    const c = controlRows.find((r) => r.surface === 'CONTROL-PLANTED-NONEXISTENT');
    console.log('[H6 CONTROL-PLANTED] ' + JSON.stringify(c));
    expect(c?.verdict).toBe('NOT-REACHED');
    expect(c?.dispatchObserved).toBe(true);
  });

  it('CONTROL-RESOLVED-ONLY — a register verb absent from the harness bus reads RESOLVED-ONLY, never EXECUTED-REACHED', () => {
    const c = controlRows.find((r) => r.surface === 'CONTROL-RESOLVED-ONLY');
    console.log('[H6 CONTROL-RESOLVED-ONLY] ' + JSON.stringify(c));
    expect(c, 'no register verb was absent from the harness bus — control could not be planted').toBeTruthy();
    expect(c?.verdict).toBe('RESOLVED-ONLY');
  });

  it('CONTROL-INERT — a button with no listener reads NOT-REACHED (no dispatch)', () => {
    const c = controlRows.find((r) => r.surface === 'CONTROL-INERT');
    console.log('[H6 CONTROL-INERT] ' + JSON.stringify(c));
    expect(c?.verdict).toBe('NOT-REACHED');
    expect(c?.dispatchObserved).toBe(false);
  });

  it('CONTROL-UNRENDERED — a declared button that never renders reads UNPROVEN, not a pass and not a fail', () => {
    const c = controlRows.find((r) => r.surface === 'CONTROL-UNRENDERED');
    console.log('[H6 CONTROL-UNRENDERED] ' + JSON.stringify(c));
    expect(c?.verdict).toBe('UNPROVEN');
  });

  it('SUMMARY — every declared pair carries a verdict; both verdict polarities were demonstrated', () => {
    const n = (v: Verdict): number => pairRows.filter((r) => r.verdict === v).length;
    const unmounted = surfaceRows.filter((s) => s.mountedBy.length === 0);
    console.log(`[H6 SUMMARY] ${pairRows.length} pairs — EXECUTED-REACHED ${n('EXECUTED-REACHED')} · ` +
      `RESOLVED-ONLY ${n('RESOLVED-ONLY')} · NOT-REACHED ${n('NOT-REACHED')} · UNPROVEN ${n('UNPROVEN')}`);
    console.log(`[H6 MOUNT] ${unmounted.length} of ${surfaceRows.length} surfaces have ZERO production importers ` +
      `(L-847-class: authored, tested, never mounted): ${unmounted.map((s) => s.surface).join(', ') || 'none'}`);
    const notReached = pairRows.filter((r) => r.verdict === 'NOT-REACHED');
    if (notReached.length > 0) {
      console.log(`[H6 ⚠ NOT-REACHED FINDINGS] ${notReached.length} declared gesture→command pair(s) dispatch into NOTHING:`);
      for (const r of notReached.slice(0, 40)) console.log(`   · ${r.surface} — '${r.declaredCommand}' — ${r.detail}`);
      if (notReached.length > 40) console.log(`   … and ${notReached.length - 40} more (see results/gesturereach.json)`);
    }
    console.log('[H6 STILL UNPROVEN — NOT MEASURED BY THIS HARNESS] ' +
      'keyboard shortcuts (CREATE rail activates TOOLS, not commands) · command palette · ' +
      'context menus · panel executeCommand sites (~120 files) · the legacy src/ui toolbar · ' +
      'handler-write correctness (check-verb-liveness) · mount is static import evidence, not rendered DOM.');
    // both polarities must have been demonstrated somewhere (controls guarantee it)
    const all = [...pairRows, ...controlRows];
    expect(all.some((r) => r.verdict === 'EXECUTED-REACHED'), 'green is unreachable (L-716)').toBe(true);
    expect(all.some((r) => r.verdict === 'NOT-REACHED'), 'the probe cannot report absence').toBe(true);
    // every declared pair got exactly one row
    const declaredTotal = surfaceRows.filter((s) => s.status === 'DRIVEN')
      .reduce((a, s) => a + s.declaredButtons, 0);
    expect(pairRows.length, 'a declared pair was silently dropped').toBe(declaredTotal);
  });
});

afterAll(() => {
  try {
    mkdirSync(RESULTS_DIR, { recursive: true });
    const p = path.join(RESULTS_DIR, 'gesturereach.json');
    const n = (v: Verdict): number => pairRows.filter((r) => r.verdict === v).length;
    writeFileSync(p, JSON.stringify({
      harness: 'H6-gesture-command-reachability',
      generatedAt: new Date().toISOString(),
      floors: { MIN_SURFACES_DRIVEN, MIN_PAIRS },
      totals: {
        surfaces: surfaceRows.length,
        surfacesDriven: surfaceRows.filter((s) => s.status === 'DRIVEN').length,
        surfacesUnmounted: surfaceRows.filter((s) => s.mountedBy.length === 0).length,
        pairs: pairRows.length,
        executedReached: n('EXECUTED-REACHED'),
        resolvedOnly: n('RESOLVED-ONLY'),
        notReached: n('NOT-REACHED'),
        unproven: n('UNPROVEN'),
      },
      registrationFailures,
      notMeasured: [
        'KEYBOARD shortcuts — the CREATE-rail map (creationToolShortcuts.ts) activates TOOLS, not bus commands; the tool→command link needs its own instrument',
        'COMMAND PALETTE, context menus, bottom action menu — not driven',
        'PANEL gesture sites — ~120 apps/editor/src/ui files call executeCommand; inventoried nowhere, driven nowhere yet',
        'the legacy src/ui toolbar (the transitional surface users see today)',
        'handler-write CORRECTNESS — check-verb-liveness owns it',
        'surfaceMounted is STATIC import evidence, not a rendered-DOM proof',
      ],
      controls: controlRows,
      surfaces: surfaceRows,
      rows: pairRows,
    }, null, 2));
    console.log('[H6] results written: ' + p);
  } catch (e) {
    console.log('[H6] results NOT written: ' + String(e).slice(0, 300));
  }
});
