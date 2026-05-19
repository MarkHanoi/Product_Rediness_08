// detail.ts — single-family detail page with download + verify badge.

import { unpackFamily } from '@pryzm/file-format';

import { api } from '../api/client.js';
import { escapeHtml } from './browse.js';

interface FamilyDetail {
  readonly id: string;
  readonly semver: string;
  readonly manifest: {
    readonly name: string;
    readonly description: string;
    readonly category: string;
    readonly ifcEntity: string;
    readonly tags: readonly string[];
    readonly author: { readonly displayName: string; readonly id: string };
    readonly createdAt: string;
    readonly lastModifiedAt: string;
  };
  readonly ifcMapping: { readonly bindings: readonly { parameterName: string; psetName: string; propertyName: string }[] };
  readonly schemaHash: string;
  readonly publishedAt: string;
  readonly availableSemvers: readonly string[];
  readonly downloadUrl: string;
}

export async function renderDetail(root: HTMLElement, id: string): Promise<void> {
  root.innerHTML = '<div class="empty">Loading family…</div>';

  let detail: FamilyDetail;
  try {
    detail = await api.getFamily(id);
  } catch (err) {
    root.innerHTML = `<div class="error" role="alert">Failed to load: ${escapeHtml((err as Error).message)}</div>`;
    return;
  }

  // Fetch the bytes and run an integrity check (schema-hash recompute).
  let integrityBadge = '<span style="color:var(--muted)">checking integrity…</span>';
  let downloadAvailable = true;
  try {
    const bytes = await api.downloadFamily(detail.downloadUrl);
    const verified = await unpackFamily({ bytes, verifySchemaHash: true });
    if (verified.ok && verified.schemaHash === detail.schemaHash) {
      integrityBadge = '<span style="color:#0a7d2c">✓ schema-hash verified</span>';
    } else if (!verified.ok) {
      integrityBadge = `<span class="error">✗ unpack failed: ${escapeHtml(verified.reason)}</span>`;
      downloadAvailable = false;
    } else {
      integrityBadge = '<span class="error">✗ schema-hash drift</span>';
      downloadAvailable = false;
    }
  } catch (err) {
    integrityBadge = `<span class="error">✗ integrity check failed: ${escapeHtml((err as Error).message)}</span>`;
  }

  const bindings = detail.ifcMapping.bindings.length > 0
    ? `<ul>${detail.ifcMapping.bindings.map((b) => `<li><code>${escapeHtml(b.parameterName)}</code> → ${escapeHtml(b.psetName)}.${escapeHtml(b.propertyName)}</li>`).join('')}</ul>`
    : '<em>(no IFC bindings declared)</em>';

  root.innerHTML = `
    <section class="detail">
      <a href="#/browse">&larr; Back to browse</a>
      <h1>${escapeHtml(detail.manifest.name)} <span style="color:var(--muted);font-weight:400">v${escapeHtml(detail.semver)}</span></h1>
      <p>${escapeHtml(detail.manifest.description || '(no description)')}</p>
      <dl>
        <dt>Category</dt><dd>${escapeHtml(detail.manifest.category)}</dd>
        <dt>IFC entity</dt><dd>${escapeHtml(detail.manifest.ifcEntity)}</dd>
        <dt>Author</dt><dd>${escapeHtml(detail.manifest.author.displayName)}</dd>
        <dt>Published</dt><dd>${escapeHtml(detail.publishedAt)}</dd>
        <dt>Schema hash</dt><dd><code style="font-size:0.8em">${escapeHtml(detail.schemaHash)}</code></dd>
        <dt>Integrity</dt><dd>${integrityBadge}</dd>
        <dt>Versions</dt><dd>${detail.availableSemvers.map((s) => escapeHtml(s)).join(', ')}</dd>
      </dl>

      <h2>IFC parameter bindings</h2>
      ${bindings}

      <div class="actions">
        ${downloadAvailable
          ? `<a class="btn" href="${escapeHtml(detail.downloadUrl)}" download>Download .pryzm-family</a>`
          : '<button disabled>Download disabled — failed integrity check</button>'}
      </div>
    </section>`;
}
