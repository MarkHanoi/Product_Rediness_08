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

/**
 * safeHref — neutralises dangerous URL schemes in an attacker-influenced URL
 * before it is placed in an `href`/`src` attribute (marketplace UGC surface).
 *
 * `escapeHtml` alone does NOT stop `javascript:` / `data:` / `vbscript:`
 * execution, because those payloads contain no HTML-special characters — the
 * quoting stays intact and the browser still runs the scheme on click. This is
 * a scheme ALLOWLIST: an explicit scheme is permitted only when it is http/https.
 * Relative, root-relative, protocol-relative (`//host`) and hash (`#…`) links
 * carry no scheme and pass through unchanged. Anything else collapses to the
 * inert placeholder `'#'`.
 *
 * Control characters are stripped before scheme detection because browsers
 * ignore them inside a scheme token (the classic `java\tscript:` / `java\nscript:`
 * bypasses). The returned value must STILL be passed through `escapeHtml` for
 * attribute-context quoting.
 */
export function safeHref(url: string): string {
  const raw = (url ?? '').trim();
  // Matching C0/C1 control characters IS the point of this line: it strips the
  // `java\tscript:` / `java\nscript:` scheme-splitting bypasses before the scheme
  // is parsed. The rule that forbids control characters in regexes cannot also
  // govern the sanitiser whose whole job is to find them.
  // eslint-disable-next-line no-control-regex
  const probe = raw.replace(/[\u0000-\u001F\u007F-\u009F]/g, '');
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(probe);
  if (scheme && !/^https?$/i.test(scheme[1] ?? '')) {
    return '#';
  }
  return raw;
}
