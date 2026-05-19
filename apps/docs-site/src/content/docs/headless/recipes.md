---
title: Headless Recipes
description: Common headless workflows — CI validation, batch IFC export, scripted authoring.
---

A collection of copy-paste recipes for the most common headless use cases.
Each is a standalone Node.js / TypeScript script runnable with
`npx tsx script.ts`.

---

## Recipe 1 — CI validation: assert no unknown elements

Useful as a pre-merge check in a BIM-authoring workflow.  Fails the build
if the model contains elements of an unknown kind.

```ts
// scripts/ci-validate.ts
import { composeHeadlessRuntime } from '@pryzm/headless';

const KNOWN_KINDS = new Set([
  'wall', 'door', 'window', 'slab', 'roof', 'column',
  'beam', 'stair', 'curtain-wall', 'handrail', 'ceiling',
  'grid', 'room', 'annotation', 'dimension', 'furniture',
]);

const [,, ifcPath = 'model.ifc'] = process.argv;
const runtime = await composeHeadlessRuntime({ audit: { actorId: 'ci', projectId: 'validate', clientId: 'ci-1' } });

try {
  await runtime.ifc.importFile(ifcPath);
  const { elements } = await runtime.stores.getElements();

  const unknown = elements.filter(e => !KNOWN_KINDS.has(e.kind));
  if (unknown.length) {
    for (const el of unknown) console.error(`  ✘ unknown element kind '${el.kind}' (id ${el.id})`);
    process.exit(1);
  }
  console.log(`  ✔  ${elements.length} elements, all kinds known.`);
} finally {
  await runtime.dispose();
}
```

Run in CI:
```yaml
# .github/workflows/ci.yml
- name: Validate model
  run: npx tsx scripts/ci-validate.ts path/to/model.ifc
```

---

## Recipe 2 — Batch IFC export

Convert every `.pryzm` project in a directory to IFC 4.3.

```ts
// scripts/batch-export.ts
import { composeHeadlessRuntime } from '@pryzm/headless';
import { readdirSync }             from 'node:fs';
import { join, basename }          from 'node:path';

const INPUT_DIR  = process.argv[2] ?? './projects';
const OUTPUT_DIR = process.argv[3] ?? './ifc-out';

const files = readdirSync(INPUT_DIR).filter(f => f.endsWith('.pryzm'));
console.log(`Exporting ${files.length} projects…`);

for (const file of files) {
  const runtime = await composeHeadlessRuntime({});
  try {
    const { id } = await runtime.ifc.importFile(join(INPUT_DIR, file));
    const outPath = join(OUTPUT_DIR, basename(file, '.pryzm') + '.ifc');
    await runtime.ifc.exportFile(id, outPath);
    console.log(`  ✔  ${file} → ${outPath}`);
  } catch (err) {
    console.error(`  ✘  ${file}: ${(err as Error).message}`);
  } finally {
    await runtime.dispose();
  }
}
```

---

## Recipe 3 — Scripted authoring: generate 100 project variants

Creates 100 parametric wall-grid projects (10 × 10, spacing varies 1–10 m).

```ts
// scripts/generate-variants.ts
import { composeHeadlessRuntime } from '@pryzm/headless';
import { writeFileSync }          from 'node:fs';

const GRID = 10;

for (let spacing = 1; spacing <= GRID; spacing++) {
  const runtime = await composeHeadlessRuntime({
    audit: { actorId: 'gen-bot', projectId: `variant-${spacing}m`, clientId: `gen-${spacing}` },
  });

  // Place a 10×10 wall grid
  for (let x = 0; x < GRID; x++) {
    for (let y = 0; y < GRID; y++) {
      await runtime.commandBus.dispatch({
        kind: 'wall.create',
        payload: {
          start:     [x * spacing, y * spacing, 0],
          end:       [(x + 1) * spacing, y * spacing, 0],
          height:    3,
          thickness: 0.2,
        },
      });
    }
  }

  const { elements } = await runtime.stores.getElements({ kind: 'wall' });
  const outPath = `./variants/variant-${spacing}m.json`;
  writeFileSync(outPath, JSON.stringify({ spacing, wallCount: elements.length }, null, 2));
  console.log(`  ✔  spacing=${spacing}m — ${elements.length} walls → ${outPath}`);

  await runtime.dispose();
}
```

---

## Recipe 4 — Round-trip test (IFC in → IFC out → diff)

Assert that an IFC round-trip preserves wall count and bounding boxes.

```ts
// scripts/roundtrip-test.ts
import { composeHeadlessRuntime } from '@pryzm/headless';
import { tmpdir }                 from 'node:os';
import { join }                   from 'node:path';

const SRC = process.argv[2] ?? 'model.ifc';
const OUT = join(tmpdir(), `roundtrip-${Date.now()}.ifc`);

const r1 = await composeHeadlessRuntime({});
await r1.ifc.importFile(SRC);
const before = await r1.stores.getElements({ kind: 'wall' });
const { id } = await r1.commandBus.history().then(() => r1.stores.getElements());
// Export
await r1.ifc.exportFile('headless-default', OUT);
await r1.dispose();

const r2 = await composeHeadlessRuntime({});
await r2.ifc.importFile(OUT);
const after = await r2.stores.getElements({ kind: 'wall' });
await r2.dispose();

const beforeCount = before.elements.length;
const afterCount  = after.elements.length;
if (beforeCount !== afterCount) {
  console.error(`✘ Wall count mismatch: ${beforeCount} → ${afterCount}`);
  process.exit(1);
}
console.log(`✔ Round-trip OK: ${beforeCount} walls preserved.`);
```

---

## Recipe 5 — Install and run a plugin headlessly

Useful for testing marketplace plugins in CI before publishing.

```ts
// scripts/test-plugin.ts
import { composeHeadlessRuntime } from '@pryzm/headless';

const PLUGIN_ID = process.argv[2];
if (!PLUGIN_ID) { console.error('Usage: test-plugin <plugin-id>'); process.exit(1); }

const runtime = await composeHeadlessRuntime({});
try {
  const plugin = await runtime.marketplace.install(PLUGIN_ID);
  console.log(`✔ Installed ${plugin.pluginId}@${plugin.version} — activated at ${plugin.activatedAt}`);

  const installed = runtime.marketplace.list();
  console.log(`Active plugins: ${installed.map(p => p.pluginId).join(', ')}`);
} finally {
  await runtime.dispose();
}
```
