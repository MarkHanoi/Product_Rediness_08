// Second pass: fold the dispatch-shaped reachability probe and the zero-subscriber
// channel census into every family row, and stamp the no-consequence verdict.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import * as path from 'node:path';
const ROOT = process.cwd();
const C = path.join(ROOT, 'audit/full-stack/2026-08-31/commands');
const R = path.join(C, '_raw');
const ds = new Map(JSON.parse(readFileSync(path.join(R, 'dispatch-sites.json'), 'utf8')).rows.map((r) => [r.verb, r]));
const ZERO_SUB_VERBS = {
  'structural.create': 'structural.created', 'slab.updateLayers': 'slab.layer-updated',
  'room.create': 'room.created', 'plumbing.create': 'plumbing.created', 'grid.create': 'grid.created',
  'floor.updateLayers': 'floor.layer-updated', 'dimension.create': 'dimension.created',
  'ceiling.updateLayers': 'ceiling.layer-updated', 'annotation.create': 'annotation.created',
};
const files = readdirSync(C).filter((f) => f.endsWith('.json') && !f.startsWith('_'));
let quad = 0;
for (const f of files) {
  const j = JSON.parse(readFileSync(path.join(C, f), 'utf8'));
  for (const r of j.rows) {
    const d = ds.get(r.verb);
    r.dispatch_reachability = {
      literal_dispatch_sites_outside_own_handler: d.dispatchSiteCount,
      sites: d.dispatchSites,
      method: 'verb literal inside a 400-char window around executeCommand( / dispatch( / .execute( / runBatch( across 5120 production .ts/.tsx files under apps/ packages/ plugins/ (node_modules, dist, __tests__/, *.test.*, *.spec.*, *.d.ts excluded).',
      NON_BLIND: 'This probe carries a POSITIVE CONTROL that fires: wall.batch.create = 5 sites. It also independently reproduces the two negatives asserted by DoorBatchCreateLiveness.probe.test.ts and WindowBatchCreateLiveness.probe.test.ts, both of which I EXECUTED at RC=0 (door.batch.create 0, window.batch.create 0). Evidence class (b) for this column.',
      CALIBRATED_FALSE_ZERO_RATE: 'A zero is NOT proof of unreachability. Table-driven and variable dispatch is invisible to a literal scan. MEASURED: 9 of the 22 verbs for which I hold a class-(c) POSITIVE read-back are in the zero set (bathroomPod.delete, door.batch.create, roof.setOverhang, roof.setPitch, roof.setShape, selection.deselect, slab.addHole, slab.setThickness, window.batch.create) = a 41% false-zero rate among verbs known to work. Read a zero as UNPROVEN-DISPATCH, never as ABSENT.',
    };
    if (ZERO_SUB_VERBS[r.verb]) {
      r.mirror.channel_subscriber_count = 0;
      r.mirror.zero_subscriber_channel = ZERO_SUB_VERBS[r.verb];
      r.mirror.note = 'THE MIRROR EXISTS AND REACHES NOBODY. This verb has a CommandEventBridge case that emits ' + ZERO_SUB_VERBS[r.verb] + ', and P1 measured that channel at ZERO subscribers. Counting it in "has a mirror channel" is true and misleading in the same breath.';
    }
    const mir = r.mirror.CEB_case_present || r.mirror.in_ELEMENT_UPDATE_VERBS || r.mirror.in_LEVEL_CHANGE_VERBS;
    const quadNeg = !mir && r.readback.proven !== 'YES-POSITIVE' && r.handler.liveness_per_register === 'UNKNOWN' && d.dispatchSiteCount === 0;
    if (quadNeg) quad++;
    r.consequence = {
      verdict: r.readback.proven === 'NO-MEASURED-NEGATIVE' ? 'NO CONSEQUENCE - MEASURED (class c)'
        : r.handler.liveness_per_register === 'SHADOWED' ? 'NO CONSEQUENCE - SHADOWED, this registration site never registers'
        : r.handler.liveness_per_register === 'REFUSES' ? 'BY DESIGN NO MUTATION - the verb refuses in the open (this is the honest form, not a defect)'
        : quadNeg ? 'CANDIDATE - QUADRUPLE-NEGATIVE (no mirror + no proven read-back + UNKNOWN liveness + zero literal dispatch site). Not a conviction: the false-zero calibration above applies.'
        : r.readback.proven === 'YES-POSITIVE' ? 'HAS A MEASURED CONSEQUENCE (class c store read-back)'
        : 'UNDETERMINED',
      undo_has_no_consequence: r.undo.backend === 'STRANDED' ? 'YES - the ring entry is declined all-or-nothing and commandManager has never heard of this verb, so Ctrl+Z is a no-op for it' : 'no (or undetermined)',
    };
  }
  const rws = j.rows;
  j.rollup.dispatch = { zero_literal_dispatch_site: rws.filter((x) => x.dispatch_reachability.literal_dispatch_sites_outside_own_handler === 0).length, of: rws.length };
  j.rollup.no_consequence = {
    measured_class_c: rws.filter((x) => x.consequence.verdict.startsWith('NO CONSEQUENCE - MEASURED')).length,
    shadowed: rws.filter((x) => x.consequence.verdict.startsWith('NO CONSEQUENCE - SHADOWED')).length,
    refuses_by_design: rws.filter((x) => x.consequence.verdict.startsWith('BY DESIGN')).length,
    quadruple_negative_candidates: rws.filter((x) => x.consequence.verdict.startsWith('CANDIDATE')).length,
    undo_stranded: rws.filter((x) => x.consequence.undo_has_no_consequence.startsWith('YES')).length,
    of: rws.length,
  };
  writeFileSync(path.join(C, f), JSON.stringify(j, null, 1));
}
console.log('enriched', files.length, 'family files; quadruple-negative total', quad);
