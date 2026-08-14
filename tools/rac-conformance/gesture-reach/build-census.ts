// ─── H6 PHASE 1 — the VERB BACKING CENSUS (L-MOUNT) ─────────────────────────
//
// WHY THIS FILE EXISTS
// ────────────────────────────────────────────────────────────────────────────
// H6 (`__tests__/gesturereach.probe.ts`) proved that all 30 toolbar surfaces in
// `apps/editor/src/ui/toolbar/*.ts` have ZERO production importers and that 267
// of 280 declared gesture→command pairs dispatch into nothing. The founder's
// decision is to MOUNT the family. Mounting alone converts 30 invisible
// surfaces into 30 VISIBLE surfaces whose buttons silently do nothing — the
// §C-B1 silent-no-op class, at 30× the scale that produced it.
//
// This census is the map that makes a SAFE mount possible: for every declared
// verb it answers, from measurement and never from memory:
//
//   registerRow          does the verb have a row in the generated C69
//                        API-VERB-REGISTER? (RESOLUTION — structural)
//   harnessBusHandler    did the REAL certification bus hold a handler for it
//                        at dispatch time? (EXECUTION — H6's own reading)
//   handlerTypeSites     production files declaring a CommandHandler whose
//                        `type` IS this verb — `type: 'v'` or `readonly type = 'v'`
//                        — outside the dispatching toolbar dir, the command-bus
//                        type maps, and tests. This is the PRODUCTION arm the
//                        harness world cannot see (the harness composes
//                        initBusHandlers + 9 plugin verbs, NOT engineLauncher's
//                        §C-B1 / §FIX-COPY-PASTE late registrations).
//   h6Verdict            H6's verdict for the pair, carried verbatim.
//   surfaceMounted       H6's static-import mount evidence, carried verbatim.
//
// BACKING (the one derived column, and the only thing Phase 2 may read):
//   BACKED         ≥1 production handlerTypeSite OR harnessBusHandler === true.
//                  A gesture wired to this verb reaches real code.
//   REGISTER-ONLY  a register row but no handler site anywhere. The verb is
//                  DECLARED, not implemented. A button for it is a lie.
//   UNBACKED       neither. The §C-B1 class, live.
//
// WHAT THIS FILE DOES NOT PROVE (never cite it for these):
//   • that a BACKED handler's write is CORRECT (check-verb-liveness owns that)
//   • that the handler is REGISTERED on the bus the mounted surface dispatches
//     to at the moment the user clicks — handlerTypeSites is a DECLARATION
//     census, not an executed one. H6 re-run after a mount is the executed arm.
//   • anything about keyboard / palette / panel gesture sites.
//
// Run: npx tsx tools/rac-conformance/gesture-reach/build-census.ts

import { readFileSync, readdirSync, statSync, existsSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const ROOT = path.resolve(HERE, '..', '..', '..');
const PROBE_RESULTS = path.join(HERE, 'results', 'gesturereach.json');
const OUT = path.join(HERE, 'results', 'verb-census.json');
const TOOLBAR_DIR = path.join(ROOT, 'apps', 'editor', 'src', 'ui', 'toolbar').replace(/\\/g, '/');
const COMMAND_BUS_PKG = path.join(ROOT, 'packages', 'command-bus').replace(/\\/g, '/');

type Verdict = 'EXECUTED-REACHED' | 'RESOLVED-ONLY' | 'NOT-REACHED' | 'UNPROVEN';
type Backing = 'BACKED' | 'REGISTER-ONLY' | 'UNBACKED';

interface ProbeRow {
  surface: string;
  declaredCommand: string;
  busHandler: boolean;
  registerRow: boolean;
  occurrences: string[];
  surfaceMounted: boolean;
  verdict: Verdict;
}

interface CensusRow {
  verb: string;
  surfaces: string[];
  registerRow: boolean;
  harnessBusHandler: boolean;
  handlerTypeSites: string[];
  h6Verdict: Verdict;
  surfaceMounted: boolean;
  backing: Backing;
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

function main(): void {
  if (!existsSync(PROBE_RESULTS)) {
    throw new Error(`MISCONFIGURED — ${PROBE_RESULTS} not found; run the H6 probe first`);
  }
  const probe = JSON.parse(readFileSync(PROBE_RESULTS, 'utf8')) as {
    generatedAt: string; rows: ProbeRow[];
  };

  // ── group the 280 pairs by verb ───────────────────────────────────────────
  const byVerb = new Map<string, ProbeRow[]>();
  for (const r of probe.rows) {
    const list = byVerb.get(r.declaredCommand) ?? [];
    list.push(r);
    byVerb.set(r.declaredCommand, list);
  }
  const verbs = [...byVerb.keys()].sort();

  // ── ONE scan for production handler DECLARATION sites ─────────────────────
  // A CommandHandler declares its verb as `type: 'v'` (object literal) or
  // `readonly type = 'v'` (class field). Both forms, one regex.
  const handlerRe = new RegExp(
    `\\btype\\s*[:=]\\s*['"\`](${verbs.map(escRe).join('|')})['"\`]`, 'g',
  );
  const sites = new Map<string, string[]>();
  const roots = ['apps/editor/src', 'src', 'plugins', 'packages'].map((r) => path.join(ROOT, r));
  for (const root of roots) {
    for (const abs of walk(root)) {
      const norm = abs.replace(/\\/g, '/');
      if (norm.startsWith(TOOLBAR_DIR) || norm.startsWith(COMMAND_BUS_PKG)) continue;
      let src: string; try { src = readFileSync(abs, 'utf8'); } catch { continue; }
      const rel = path.relative(ROOT, abs).replace(/\\/g, '/');
      handlerRe.lastIndex = 0;
      let m: RegExpExecArray | null;
      const seen = new Set<string>();
      while ((m = handlerRe.exec(src)) !== null) {
        const v = m[1]!;
        if (seen.has(v)) continue;
        // DISCRIMINATOR — `type: 'x'` alone is not a handler. Every CommandHandler
        // declares `affectedStores` (the CommandBus interface requires it), and in
        // both authored forms it is the very next member. Without this window the
        // census counts descriptor literals (annotation KINDS, NL-intent rows) as
        // handlers — a false BACKED, which is the one error class that would let
        // Phase 2 mount a dead button.
        if (!/affectedStores/.test(src.slice(m.index, m.index + 400))) continue;
        seen.add(v);
        const list = sites.get(v) ?? [];
        if (list.length < 10) list.push(rel);
        sites.set(v, list);
      }
    }
  }

  // ── build the rows ────────────────────────────────────────────────────────
  const rows: CensusRow[] = verbs.map((verb) => {
    const pairs = byVerb.get(verb)!;
    const handlerTypeSites = sites.get(verb) ?? [];
    const harnessBusHandler = pairs.some((p) => p.busHandler);
    const registerRow = pairs.some((p) => p.registerRow);
    const backing: Backing = (handlerTypeSites.length > 0 || harnessBusHandler)
      ? 'BACKED'
      : registerRow ? 'REGISTER-ONLY' : 'UNBACKED';
    return {
      verb,
      surfaces: [...new Set(pairs.map((p) => p.surface))].sort(),
      registerRow,
      harnessBusHandler,
      handlerTypeSites,
      h6Verdict: pairs[0]!.verdict,
      surfaceMounted: pairs.some((p) => p.surfaceMounted),
      backing,
    };
  });

  // ── per-surface roll-up: the ONLY input Phase 2 may read ──────────────────
  const surfaces = new Map<string, { total: number; backed: number; registerOnly: number; unbacked: number }>();
  for (const r of rows) {
    for (const s of r.surfaces) {
      const acc = surfaces.get(s) ?? { total: 0, backed: 0, registerOnly: 0, unbacked: 0 };
      acc.total += 1;
      if (r.backing === 'BACKED') acc.backed += 1;
      else if (r.backing === 'REGISTER-ONLY') acc.registerOnly += 1;
      else acc.unbacked += 1;
      surfaces.set(s, acc);
    }
  }
  const surfaceRows = [...surfaces.entries()]
    .map(([surface, a]) => ({
      surface, ...a,
      mountVerdict: a.backed === a.total
        ? 'MOUNTABLE-WHOLE' as const
        : a.backed > 0 ? 'MOUNTABLE-PARTIAL' as const : 'NO-BACKED-VERB' as const,
    }))
    .sort((x, y) => x.surface.localeCompare(y.surface));

  const n = (b: Backing): number => rows.filter((r) => r.backing === b).length;
  const out = {
    census: 'H6-PHASE-1-verb-backing',
    generatedAt: new Date().toISOString(),
    sourceProbeGeneratedAt: probe.generatedAt,
    totals: {
      verbs: rows.length,
      pairs: probe.rows.length,
      backed: n('BACKED'),
      registerOnly: n('REGISTER-ONLY'),
      unbacked: n('UNBACKED'),
      surfaces: surfaceRows.length,
      surfacesMountableWhole: surfaceRows.filter((s) => s.mountVerdict === 'MOUNTABLE-WHOLE').length,
      surfacesMountablePartial: surfaceRows.filter((s) => s.mountVerdict === 'MOUNTABLE-PARTIAL').length,
      surfacesNoBackedVerb: surfaceRows.filter((s) => s.mountVerdict === 'NO-BACKED-VERB').length,
    },
    notMeasured: [
      'handler-write CORRECTNESS — check-verb-liveness owns it',
      'whether a BACKED handler is REGISTERED on the bus at click time — this is a DECLARATION census; H6 re-run is the executed arm',
      'keyboard shortcuts, command palette, context menus, panel executeCommand sites',
    ],
    surfaces: surfaceRows,
    rows,
  };
  writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.log(`[census] ${rows.length} verbs — BACKED ${n('BACKED')} · REGISTER-ONLY ${n('REGISTER-ONLY')} · UNBACKED ${n('UNBACKED')}`);
  console.log(`[census] surfaces — MOUNTABLE-WHOLE ${out.totals.surfacesMountableWhole} · `
    + `MOUNTABLE-PARTIAL ${out.totals.surfacesMountablePartial} · NO-BACKED-VERB ${out.totals.surfacesNoBackedVerb}`);
  for (const r of rows.filter((x) => x.backing === 'BACKED')) {
    console.log(`   BACKED · ${r.verb} — ${r.surfaces.join(', ')} — sites: ${r.handlerTypeSites.join(', ') || '(harness bus only)'}`);
  }
  console.log(`[census] written: ${OUT}`);
}

main();
