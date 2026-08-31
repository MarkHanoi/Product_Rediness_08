import fs from 'fs';
const B = 'audit/full-stack/2026-08-31/builders/';
const idx = JSON.parse(fs.readFileSync(B + '_raw/word-index.json', 'utf8'));
const schema = JSON.parse(fs.readFileSync(B + '_raw/schema-fields.json', 'utf8'));
const emits = JSON.parse(fs.readFileSync(B + '_raw/ceb-emit-fields.json', 'utf8'));

// channel -> union of emitted keys (all emit sites for that channel)
const byChannel = {};
for (const e of emits) {
  const k = e.channel;
  byChannel[k] = byChannel[k] || { sites: [], keys: new Set() };
  byChannel[k].sites.push(e.line_stripped);
  for (const key of e.keys) byChannel[k].keys.add(key.replace(/ \(.*\)$/, ''));
}

const CH = {
  wall: 'wall.created', slab: 'slab.created', roof: 'roof.created', column: 'column.created',
  beam: 'beam.created', ceiling: 'ceiling.created', floor: 'floor.created',
  curtainwall: 'curtain-wall.created', handrail: 'handrail.created', furniture: 'furniture.created',
  lighting: 'lighting.created', plumbing: 'plumbing.created', room: 'room.created',
  grid: 'grid.created', annotation: 'annotation.created', dimension: 'dimension.created',
  structural: 'structural.created', water: 'water.created', boundaryLine: 'boundaryLine.created',
};

const out = {};
for (const [kind, s] of Object.entries(schema)) {
  const ch = CH[kind] || null;
  const emitted = ch && byChannel[ch] ? [...byChannel[ch].keys] : null;
  const rows = s.fields.filter((f) => !f.startsWith('...')).map((f) => ({
    field: f,
    repo_mentions: idx.counts[f] || 0,
    example_files: (idx.files[f] || []).slice(0, 4),
    on_ceb_event: emitted ? emitted.includes(f) : null,
  }));
  out[kind] = {
    schema_file: s.file,
    authored_count: rows.length,
    ceb_channel: ch,
    ceb_emit_sites: ch && byChannel[ch] ? byChannel[ch].sites : [],
    ceb_emitted_keys: emitted,
    never_mentioned_outside_schemas: rows.filter((r) => r.repo_mentions === 0).map((r) => r.field),
    not_on_ceb_event: emitted ? rows.filter((r) => !r.on_ceb_event).map((r) => r.field) : null,
    fields: rows,
  };
}
fs.writeFileSync(B + '_raw/fidelity-matrix.json', JSON.stringify(out, null, 1));
for (const k of Object.keys(out).sort()) {
  const o = out[k];
  console.log(
    k.padEnd(20),
    'authored=' + String(o.authored_count).padEnd(3),
    'ch=' + (o.ceb_channel || 'NONE').padEnd(22),
    'notOnEvent=' + (o.not_on_ceb_event ? o.not_on_ceb_event.length : '-'),
    ' zeroMentions=[' + o.never_mentioned_outside_schemas.join(',') + ']'
  );
}
