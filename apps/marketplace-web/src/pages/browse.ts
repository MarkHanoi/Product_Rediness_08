// browse.ts — list all published families.

import { api } from '../api/client.js';

export interface FamilySummary {
  readonly id: string;
  readonly name: string;
  readonly semver: string;
  readonly category: string;
  readonly ifcEntity: string;
  readonly author: { readonly id: string; readonly displayName: string };
  readonly publishedAt: string;
  readonly schemaHash: string;
  readonly availableSemvers: readonly string[];
}

export async function renderBrowse(root: HTMLElement): Promise<void> {
  root.innerHTML = '<div class="empty">Loading families…</div>';

  let payload: { families: FamilySummary[] };
  try {
    payload = await api.listFamilies();
  } catch (err) {
    root.innerHTML = `<div class="error" role="alert">Failed to load: ${escapeHtml((err as Error).message)}</div>`;
    return;
  }

  if (payload.families.length === 0) {
    root.innerHTML = `
      <section>
        <h1>Browse families</h1>
        <div class="empty">No families published yet. Use the Family Creator to publish one.</div>
      </section>`;
    return;
  }

  const cards = payload.families.map((f) => `
    <a class="card" href="#/family/${escapeHtml(f.id)}" tabindex="0" role="button"
       aria-label="Open ${escapeHtml(f.name)} ${escapeHtml(f.semver)} — ${escapeHtml(f.category)}">
      <h3>${escapeHtml(f.name)}</h3>
      <div class="meta">${escapeHtml(f.category)} · ${escapeHtml(f.ifcEntity)}</div>
      <div class="meta">v${escapeHtml(f.semver)} · ${escapeHtml(f.author.displayName)}</div>
    </a>
  `).join('');

  root.innerHTML = `
    <section>
      <h1>Browse families <span style="color:var(--muted);font-weight:400;font-size:0.9rem">(${payload.families.length})</span></h1>
      <div class="grid">${cards}</div>
    </section>`;
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      default: return '&#39;';
    }
  });
}
