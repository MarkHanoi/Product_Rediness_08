import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
const R = (p) => JSON.parse(readFileSync(p, 'utf8'));
const A = R('audit/full-stack/2026-08-31/_p5/attribution.json');
const P4 = R('audit/full-stack/2026-08-31/_p5/p4-per-family.json');
const PR = R('audit/full-stack/2026-08-31/_p5/principles.json');
const FAM = R('audit/full-stack/2026-08-31/families.json').families;
const MANUAL = R('audit/full-stack/2026-08-31/_p5/manual.json');

function rowL6dead(m) {
  const r = m.l7_surface?.L6_tool_reachability ?? '';
  if (r.startsWith('NEVER NAMED')) return { id: 'F-P5-01', severity: 'CRITICAL', claim: `${m.l7_surface.tool_file_L6} is AUTHORED-BUT-UNREACHABLE — its class name appears nowhere in apps/, packages/ or src/. The family reaches the canvas through the L2 tool instead (${m.l7_surface.tool_file_L2_geometry ?? 'none measured'}).` };
  if (r.startsWith('NAMED OUTSIDE')) return { id: 'F-P5-01', severity: 'CRITICAL', claim: `${m.l7_surface.tool_file_L6} is named outside its plugin ONLY IN COMMENTS — no import, no construction. The comment reads as wiring and is not.` };
  return null;
}
const rows = {};
for (const fam of Object.keys(A.rows)) {
  const a = A.rows[fam]; const m = MANUAL.per_family[fam] ?? {};
  const f = FAM[fam] ?? {};
  rows[fam] = {
    packages_participating: a.packages_participating.map(p => ({ pkg: p.pkg, dir: p.dir, layer: p.layer, on_disk: p.exists })),
    upward_imports: a.upward_imports,
    upward_imports_INTO_this_family: a.upward_imports_INTO_family,
    sdk_bypasses: a.sdk_bypasses,
    banned_third_party: a.banned_third_party,
    extension_contract_layer: m.extension_contract_layer,
    l7_surface: m.l7_surface,
    principles: {
      P1_single_compose: 'REPO-WIDE (a): check-single-compose.ts rc=0 — 1 definition · 1 rival / MAX_RIVALS 1 · 2 production callers. Evidence class (b) for the gate itself: it prints a NEGATIVE CONTROL that FIRED (3 findings, arms C1/D1/R1) and a positive control at 0. Not attributable per family — no element family defines a runtime.',
      P2_single_three: `EXECUTED (c): 0 raw \`from 'three'\` specifiers in this family's ${PR[fam].files_scanned} non-test source files. All THREE arrives via @pryzm/renderer-three/three. cmd: audit/full-stack/2026-08-31/_p5/principles.mjs`,
      P3_single_raf: `EXECUTED (c): 0 requestAnimationFrame( call sites in this family's ${PR[fam].files_scanned} non-test source files.`,
      P4_no_window_any: {
        gate_counted_literal_window_as_any: P4[fam].gate_counted_window_as_any,
        NOT_counted_window_as_unknown_as: P4[fam].NOT_counted_window_as_unknown_as,
        sites_window_as_any: P4[fam].sitesA,
        sites_window_as_unknown_as: P4[fam].sitesU,
        note: 'check-cast-count.ts matches the LITERAL string "(window as any)" only. The second number is the same capability spelled differently and the ratchet does not see it. See findings F-P5-06.',
      },
      P5_schemas_pure: 'REPO-WIDE (a): check-domain-purity.ts rc=0 — 0 impurities across 192 files in packages/schemas/src. Hard-fail at zero. Per-family attribution not applicable: schemas is one package, not a per-family one.',
      P6_commands_only_mutation: 'REPO-WIDE (a): check-no-direct-store-writes.ts rc=0 at a BASELINE OF 37 tolerated direct writes (375 *Store method calls in 886 UI files, 37 classified as writes). NOT 0. The gate does not print a per-family breakdown, so this axis cannot attribute it; the 37 are named only by METHOD (remove 8, add 5, clear 3 ...), not by file, in the snapshot.',
      P7_visibility_intent: 'REPO-WIDE (a): check-visibility-intent-not-ui.ts rc=0 — ARM A hard-0 (20 files, 0 leaks); ARM B ratchet 40/43 across 872 UI files. The gate names its own top-15 by file; none of the top 3 is an element-family package (ProjectVisibilitySection 13, BottomActionMenu 5, SitePlanOverlay 3 — all apps/editor UI).',
      P8_spans_and_conflicts: 'REPO-WIDE (a): check-otel-spans.ts rc=0 — ZONE A 275/275; ZONE B 52 uninstrumented of 87 AT its 52 baseline (zero headroom); ZONE C census 2087 of 2400 files with an exported function have NO span and is NOT GATED. Conflict half: tools/rac-conformance/certification/gates/check-conflict-surfacing.ts. Neither prints a per-family breakdown.',
    },
    findings: (() => {
      const F = [];
      const L6dead = rowL6dead(m);
      if (L6dead) F.push(L6dead);
      for (const s of (m.l7_surface?.read_but_never_assigned_symbols ?? [])) F.push({ id: 'F-P5-02/03', severity: 'CRITICAL', claim: s });
      if (a.banned_third_party.count) F.push({ id: 'F-P5-05', severity: 'MEDIUM', claim: `${a.banned_third_party.count} banned third-party import(s) (@thatopen/components) — see banned_third_party.sites. ${a.banned_third_party.sites.filter(x => /Tool\.ts:/.test(x)).length} of them are in a *Tool.ts file, which is the misplacement, not the import.` });
      if (a.sdk_bypasses.count >= 5) F.push({ id: 'F-P5-BYPASS', severity: 'MEDIUM', claim: `${a.sdk_bypasses.count} L6->non-L5/L6 SDK-facade bypasses, by target ${JSON.stringify(a.sdk_bypasses.by_target)}. Kept as its OWN number: never folded into upward_imports or banned_third_party.` });
      if (a.upward_imports.count) F.push({ id: 'F-P5-UPWARD', severity: 'HIGH', claim: `${a.upward_imports.count} upward import(s) OUT of this family — an L2 package reaching an L6 plugin or an L4 package. Sites listed under upward_imports.` });
      if (a.upward_imports_INTO_family.count) F.push({ id: 'F-P5-04', severity: 'HIGH', claim: `${a.upward_imports_INTO_family.count} upward import(s) INTO this family: lower layers depend on this L6 plugin as if it were a contract layer. This is the ADR-0367 shape one level down.` });
      return F;
    })(),
    family_facts_carried_from_P1_P4: {
      in_ALL_PLUGINS: !!f.in_S2_ALL_PLUGINS, in_ELEMENT_PLUGIN_IDS: !!f.in_S4_ELEMENT_PLUGIN_IDS,
      in_GEOMETRY_ELEMENT_TYPES: !!f.in_S5_GEOMETRY_ELEMENT_TYPES, has_CEB_case: !!f.in_S6_CEB_case,
      has_initTools_bridge_flag: !!f.in_S7_initTools_bridge, has_schema: !!f.in_S8_schema,
      has_initStores_typekey: !!f.in_S9_initStores_typekey, verbs_total: f.verbs_total ?? null,
    },
  };
}
const out = {
  phase: 'P5 — AXIS 7 · LAYERS AND THE IMPORT MATRIX PER FAMILY',
  head_at_start: MANUAL.head_at_start,
  head_at_end: execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim(),
  measured_at: new Date().toISOString(),
  method: MANUAL.method,
  repo_wide_totals: A.totals,
  cross_check: MANUAL.cross_check,
  layer_table: MANUAL.layer_table,
  settlements: MANUAL.settlements,
  read_but_never_assigned: MANUAL.read_but_never_assigned,
  residual_not_attributable_to_any_element_family: A.residual,
  families: rows,
  findings: MANUAL.findings,
  incomplete: MANUAL.incomplete,
};
out.head_moved_mid_phase = out.head_at_start !== out.head_at_end;
out.head_move_disclosure = out.head_moved_mid_phase ? {
  statement: 'HEAD MOVED DURING THIS PHASE. Saying so, as briefed.',
  from: out.head_at_start,
  to: out.head_at_end,
  commits: '1 — `git log --oneline d91d30d4..HEAD` -> 6590ac1c "docs(audit/full-stack): SCOPE CHANGE — B, C, L and 7 must be audited AND FIXED"',
  does_it_invalidate_anything: 'NO. `git show --stat 6590ac1c` is docs-only; it touches no file this axis measured. Every number in this file was produced against the tree as it stands at 6590ac1c (scan.mjs re-reads the working tree; the docs commit changed no .ts). The layer-gate cross-check against gate-snapshot.json (taken at d91d30d4) still holds exactly — 102 / 171 / 124 / 13 — which is itself evidence the move was inert for this axis.',
  scope_change_noted: 'That commit supersedes the "measurement pass, no production code" clause with "each axis gets a measurement phase AND a remediation phase". This artefact IS the measurement phase for axis 7. NO production code was changed here; remediation is a separate phase and is not attempted in this file.',
  unrelated_working_tree_change_observed: '`git status --porcelain tools/` -> ` M tools/rac-conformance/certification/results/graphruntime.json`. NOT written by this lane — this lane executed nothing under tools/ and modified nothing there. Disclosed because a dirty tools/ tree could otherwise be attributed here.',
} : null;
writeFileSync('audit/full-stack/2026-08-31/layers.json', JSON.stringify(out, null, 1));
console.log('rows', Object.keys(rows).length, 'head_moved', out.head_moved_mid_phase);
