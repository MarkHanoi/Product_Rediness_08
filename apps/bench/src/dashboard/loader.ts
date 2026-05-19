// Bench dashboard — markdown report loader (W-1C-6).
//
// Reads every `apps/bench/reports/*-baseline.md` file and parses out
// the per-bench entries.  Two parsing modes:
//
//   1. Section-block mode (S08/S09/S10/M6-1B/per-family).  Each entry
//      is introduced by a `## bench: <name>` heading followed by
//      `- **field**: value` bullets.  This is the canonical shape.
//
//   2. Table-row mode (M9-1C / M12-alpha).  Numbered tables with
//      columns `# | Bench | … | p50 | p95 | p99 | Target | Status`.
//      Each non-header row becomes a `BenchEntry`.
//
// The loader is forgiving: malformed sections are skipped silently and
// reported only via the test suite.  No throw — the dashboard build is
// the consumer that gates on coverage / regression.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { BaselineReport, BenchEntry, BenchStatus } from './types.js';

const STATUS_MAP: Record<string, BenchStatus> = {
  green: 'green',
  pass: 'green',
  ok: 'green',
  amber: 'amber',
  warn: 'amber',
  red: 'red',
  fail: 'red',
};

function normaliseStatus(s: string | undefined): BenchStatus {
  if (!s) return 'green';
  const k = s.toLowerCase().replace(/[^a-z]/g, '');
  return STATUS_MAP[k] ?? 'green';
}

function parseMs(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const m = raw.match(/-?[\d.]+/);
  if (!m) return undefined;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : undefined;
}

function parseSectionBlocks(file: string, body: string): BenchEntry[] {
  const out: BenchEntry[] = [];
  const blocks = body.split(/^## bench:\s*/m).slice(1);
  for (const blk of blocks) {
    const nameMatch = blk.match(/^([A-Za-z0-9._-]+)/);
    if (!nameMatch) continue;
    const name = nameMatch[1];
    const sprint = (blk.match(/-\s*\*\*sprint\*\*:\s*([^\n]+)/i)?.[1] ?? '').trim();
    const p50 = parseMs(blk.match(/-\s*\*\*p50\*\*:\s*([^\n]+)/i)?.[1]);
    const p95 = parseMs(blk.match(/-\s*\*\*p95\*\*:\s*([^\n]+)/i)?.[1]);
    const p99 = parseMs(blk.match(/-\s*\*\*p99\*\*:\s*([^\n]+)/i)?.[1]);
    const target = (blk.match(/-\s*\*\*target\*\*:\s*([^\n]+)/i)?.[1] ?? '').trim() || undefined;
    const status = normaliseStatus(blk.match(/-\s*\*\*status\*\*:\s*([^\n]+)/i)?.[1]);
    out.push({ name, sprint, source: file, p50, p95, p99, target, status });
  }
  return out;
}

function parseTableRows(file: string, sprint: string, body: string): BenchEntry[] {
  const out: BenchEntry[] = [];
  // Tables of shape: | # | Bench | … | p50 | p95 | p99 | Target | Status |
  const lines = body.split('\n');
  let inTable = false;
  let cols: string[] = [];
  for (const line of lines) {
    if (line.startsWith('|')) {
      const cells = line.split('|').slice(1, -1).map((c) => c.trim());
      if (!inTable) {
        cols = cells.map((c) => c.toLowerCase());
        inTable = true;
        continue;
      }
      if (cells.every((c) => /^-+$/.test(c.replace(/:/g, '')))) continue;
      const get = (key: string) => {
        const i = cols.findIndex((c) => c === key);
        return i >= 0 ? cells[i] : undefined;
      };
      // Prefer an explicit "bench file" column (full path) when present; fall
      // back to "bench" / "gate" / "name" columns. Both branches funnel
      // through the same backtick-extractor so file paths work.
      const benchFileCell = get('bench file') ?? get('benchfile') ?? get('source');
      const benchCell = benchFileCell ?? get('bench') ?? get('gate') ?? get('name');
      if (!benchCell) continue;
      const name = (benchCell.match(/`([^`]+)`/)?.[1] ?? benchCell.replace(/[*_`]/g, '')).trim();
      if (!name || name.toLowerCase().startsWith('bench')) continue;
      out.push({
        name,
        sprint,
        source: file,
        p50: parseMs(get('p50')),
        p95: parseMs(get('p95') ?? get('actual (p95)') ?? get('actual')),
        p99: parseMs(get('p99')),
        target: get('target'),
        status: normaliseStatus(get('status')),
      });
    } else if (line.trim() === '') {
      inTable = false;
      cols = [];
    }
  }
  return out;
}

export function parseReport(file: string): BaselineReport {
  const body = readFileSync(file, 'utf-8');
  const milestone = (body.match(/^#\s*([^\n]+)/)?.[1] ?? '').trim();
  const capturedAt = (body.match(/Captured\*?\*?:\s*([0-9]{4}-[0-9]{2}-[0-9]{2})/)?.[1] ?? '').trim();
  const sprintHint = (body.match(/Milestone\*?\*?:\s*([^\n]+)/)?.[1] ?? '').trim().split(/\s+/)[0] ?? '';
  const sectionEntries = parseSectionBlocks(file, body);
  const tableEntries = sectionEntries.length === 0 ? parseTableRows(file, sprintHint, body) : [];
  return {
    file,
    milestone,
    capturedAt,
    entries: [...sectionEntries, ...tableEntries],
  };
}

export function loadAllReports(reportsDir: string): readonly BaselineReport[] {
  if (!existsSync(reportsDir)) return [];
  const files = readdirSync(reportsDir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => join(reportsDir, f))
    .sort();
  return files.map((f) => parseReport(f));
}
