const fs = require('fs');
const p = 'audit/element-creation/2026-08-29/families/wall.json';
const j = JSON.parse(fs.readFileSync(p, 'utf8'));
j.B1_RECHECK_2026_08_29 = {
  by: 'BATCH B1 measurement agent — independent re-measurement, nothing inherited from the row above',
  spot_checks_that_HOLD: [
    "CEB case 'wall.create' at CommandEventBridge.ts:499 — grep -n \"case '\" packages/runtime-composer/src/CommandEventBridge.ts",
    'initTools §P2.1 bridge log at initTools.ts:1396 — grep -n "bridge registered" apps/editor/src/engine/initTools.ts',
    "PluginRegistry.ts:263 storeKey: 'wall' — grep -n storeKey apps/editor/src/PluginRegistry.ts",
    'ELEMENT_UPDATE_VERBS (CommandEventBridge.ts:241-292) = 8 rows across slab(5) / roof(2) / column(1); ZERO wall rows — read in full, sed -n 235,300p',
    'tools/ga-gate/mirror-debt.json carries exactly 15 wall verbs (8 UNMIRRORED, 6 refuses, 1 mirrored-elsewhere) — node count over the 156-row ledger',
  ],
  the_ONE_fact_that_makes_wall_UNIQUE_in_B1: {
    claim: 'wall is the ONLY B1 family immune to the no-id bridge drop, and the mechanism lives in the CEB, not in the tool.',
    evidence:
      'CommandEventBridge.ts:508-511 — `const committed = indexCommittedWalls(record.forward); const w = (p.id !== undefined ? committed.get(p.id) : undefined) ?? [...committed.values()][0] ?? p;` then :517 `wallId: p.id ?? w.id`. The COMMITTED Immer patch supplies the id when the request payload omits it.',
    contrast:
      'slab.create, ceiling.create and curtain-wall.create all read `id: p.id` off record.payload ONLY. MEASURED on the REAL composed bus (probe P-11): a create with no id in the payload emits `*.created` with `id=undefined` for all three, and every one of their bridges/mirrors guards on `!ev.id` (initTools.ts:2370 slab; ceilingCreatedMirror.ts:135; curtainWallCreatedMirror.ts:123).',
  },
  mirror_completeness_gate_D3:
    'npx tsx tools/ga-gate/check-mirror-completeness.ts -> RC=0, printed: "within the named ledger (156 uncovered / 156 listed)" · "verbs that WRITE a plugin DTO store: 200 — 44 with a bridge case, 156 without" · "109 kind=UNMIRRORED (the BACKLOG: these will not update on screen), 47 declared-exempt" · "census (initTools.ts): 19 *.created mirror(s) · 1 *.updated mirror(s)". RC=0 means WITHIN A NAMED LEDGER OF 156, not 0 uncovered verbs.',
  probe: 'audit/element-creation/2026-08-29/probe/b1Dispatch.probe.test.ts + probe/b1-run.txt (13 passed, RC=0)',
};
fs.writeFileSync(p, JSON.stringify(j, null, 2));
console.log('wall.json merged; top-level keys: ' + Object.keys(j).join(', '));
