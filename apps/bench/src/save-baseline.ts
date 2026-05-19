// Writes a BenchSample to the per-bench output file under `.run-output/`.
// The CI regression gate reads these files; the baseline updater promotes
// them into `baseline.json`.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BenchSample } from './timing.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RUN_OUTPUT_DIR = join(__dirname, '..', '.run-output');

export function writeBenchSample(sample: BenchSample): void {
  mkdirSync(RUN_OUTPUT_DIR, { recursive: true });
  const file = join(RUN_OUTPUT_DIR, `${sample.name}.json`);
  writeFileSync(file, JSON.stringify(sample, null, 2) + '\n', 'utf-8');
}
