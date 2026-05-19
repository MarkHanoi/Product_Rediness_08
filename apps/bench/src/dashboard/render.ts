// Bench dashboard — static HTML renderer (W-1C-6).
//
// Emits a single self-contained HTML document with one row per
// `BenchEntry`, grouped by sprint.  Status pills are coloured green /
// amber / red.  No client-side JS, no external assets — the dashboard
// must render in a `file://` open as well as on a static host.

import type { BaselineReport, BenchEntry, BenchStatus } from './types.js';

const STATUS_COLOR: Record<BenchStatus, string> = {
  green: '#1b8a45',
  amber: '#c98a16',
  red: '#c0392b',
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtMs(n: number | undefined): string {
  if (n == null) return '—';
  if (n < 1) return `${n.toFixed(3)} ms`;
  return `${n.toFixed(2)} ms`;
}

function row(e: BenchEntry): string {
  const c = STATUS_COLOR[e.status];
  return `
    <tr>
      <td><code>${escapeHtml(e.name)}</code></td>
      <td>${escapeHtml(e.sprint)}</td>
      <td>${fmtMs(e.p50)}</td>
      <td>${fmtMs(e.p95)}</td>
      <td>${fmtMs(e.p99)}</td>
      <td>${escapeHtml(e.target ?? '')}</td>
      <td><span style="display:inline-block;padding:2px 8px;border-radius:10px;background:${c};color:white;font-weight:600;font-size:11px">${e.status.toUpperCase()}</span></td>
    </tr>`;
}

export function renderHtml(reports: readonly BaselineReport[]): string {
  const totalEntries = reports.reduce((acc, r) => acc + r.entries.length, 0);
  const sections = reports
    .filter((r) => r.entries.length > 0)
    .map(
      (r) => `
    <section style="margin:24px 0">
      <h2 style="font-size:18px;margin:0 0 8px">${escapeHtml(r.milestone)}
        <small style="color:#888;font-weight:400">— ${escapeHtml(r.capturedAt)} (${r.entries.length} entries)</small>
      </h2>
      <table style="border-collapse:collapse;width:100%;font-size:13px">
        <thead>
          <tr style="background:#f5f5f5;text-align:left">
            <th style="padding:8px">Bench</th>
            <th style="padding:8px">Sprint</th>
            <th style="padding:8px">p50</th>
            <th style="padding:8px">p95</th>
            <th style="padding:8px">p99</th>
            <th style="padding:8px">Target</th>
            <th style="padding:8px">Status</th>
          </tr>
        </thead>
        <tbody>${r.entries.map(row).join('')}</tbody>
      </table>
    </section>`,
    )
    .join('');
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>PRYZM 2 — bench dashboard</title>
  <style>
    body { font: 14px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 32px auto; max-width: 1100px; color:#222; }
    code { background:#f0f0f0; padding:1px 5px; border-radius:3px; font-size:90% }
    table th, table td { border-bottom:1px solid #eee }
  </style>
</head>
<body>
  <h1 style="margin:0 0 4px">PRYZM 2 — bench dashboard</h1>
  <p style="color:#666;margin:0 0 16px">${reports.length} baseline report(s) · ${totalEntries} total bench entries</p>
  ${sections}
</body>
</html>
`;
}
