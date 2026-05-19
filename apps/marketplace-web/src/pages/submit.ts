// submit.ts — Plugin submission form for PRYZM Marketplace (Phase F / C07 §4.1).
//
// POSTs to POST /marketplace/api/plugins/submit with:
//   { manifest: { id, name, version, description, publisher, category, permissions[], tags[] },
//     signature: "<Ed25519 hex signature>" }
//
// The endpoint requires an authenticated Bearer token (authMiddleware).
// Token is read from localStorage key 'pryzm_token', set by the main app
// after login (server/authStore.js).

import { api } from '../api/client.js';
import { escapeHtml } from './browse.js';

const CATEGORIES = [
  'modeling',
  'collaboration',
  'inspection',
  'analysis',
  'export',
  'import',
  'rendering',
  'automation',
  'other',
] as const;

const PERMISSION_OPTIONS = [
  { value: 'read:project',     label: 'Read project data' },
  { value: 'write:project',    label: 'Write project data' },
  { value: 'register:tool',   label: 'Register toolbar tool' },
  { value: 'register:panel',  label: 'Register side panel' },
  { value: 'register:command', label: 'Register command' },
  { value: 'network:fetch',   label: 'External network fetch' },
  { value: 'fs:read',         label: 'Local file read' },
  { value: 'fs:write',        label: 'Local file write' },
] as const;

export function renderSubmit(root: HTMLElement): void {
  root.innerHTML = `
    <section class="submit-page">
      <a href="#/browse">&larr; Back to browse</a>
      <h1>Submit a Plugin</h1>
      <p class="submit-intro">
        Publish your plugin to the PRYZM Marketplace for review. Once approved it will
        appear in the catalog and can be installed by any PRYZM user via
        <code>runtime.marketplace.install()</code>.
        <br><br>
        Submissions require a valid <strong>Ed25519 signature</strong> over the canonical
        JSON of your plugin manifest (see <a href="https://github.com/pryzm-app/plugin-sdk" target="_blank" rel="noopener">@pryzm/sdk docs</a>).
      </p>

      <form id="submit-form" class="plugin-form" novalidate>
        <fieldset>
          <legend>Identity</legend>

          <div class="form-group">
            <label for="f-id">Plugin ID <span class="required">*</span></label>
            <input id="f-id" name="id" type="text" required
              placeholder="com.yourorg.plugin-name"
              pattern="[a-z0-9][a-z0-9._/-]*"
              title="Lowercase, numbers, dots, hyphens, slashes only. E.g. com.yourorg.my-plugin" />
            <div class="hint">Reverse-domain style: <code>com.yourorg.name</code></div>
          </div>

          <div class="form-group">
            <label for="f-name">Display Name <span class="required">*</span></label>
            <input id="f-name" name="name" type="text" required maxlength="80"
              placeholder="My Awesome Plugin" />
          </div>

          <div class="form-group">
            <label for="f-version">Version <span class="required">*</span></label>
            <input id="f-version" name="version" type="text" required
              placeholder="1.0.0" pattern="\\d+\\.\\d+\\.\\d+.*"
              title="Semver string, e.g. 1.0.0 or 1.0.0-beta.1" />
          </div>

          <div class="form-group">
            <label for="f-publisher">Publisher <span class="required">*</span></label>
            <input id="f-publisher" name="publisher" type="text" required maxlength="120"
              placeholder="Your Name or Organisation" />
          </div>
        </fieldset>

        <fieldset>
          <legend>Details</legend>

          <div class="form-group">
            <label for="f-description">Description</label>
            <textarea id="f-description" name="description" rows="4" maxlength="2000"
              placeholder="What does this plugin do? Mention IFC entities it handles, workflows it enables, or integrations it provides."></textarea>
          </div>

          <div class="form-group">
            <label for="f-category">Category <span class="required">*</span></label>
            <select id="f-category" name="category" required>
              <option value="">— select —</option>
              ${CATEGORIES.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('')}
            </select>
          </div>

          <div class="form-group">
            <label for="f-tags">Tags</label>
            <input id="f-tags" name="tags" type="text"
              placeholder="ifc, walls, geometry" />
            <div class="hint">Comma-separated. Helps with search.</div>
          </div>
        </fieldset>

        <fieldset>
          <legend>Permissions requested</legend>
          <div class="form-hint">
            Only request permissions your plugin actually needs. Reviewers will reject
            plugins that request excessive permissions.
          </div>
          <div class="checkbox-grid">
            ${PERMISSION_OPTIONS.map((p) => `
              <label class="checkbox-label">
                <input type="checkbox" name="permissions" value="${escapeHtml(p.value)}" />
                <span>${escapeHtml(p.label)}</span>
                <code class="perm-code">${escapeHtml(p.value)}</code>
              </label>
            `).join('')}
          </div>
        </fieldset>

        <fieldset>
          <legend>Signature</legend>
          <p class="form-hint">
            Generate this with the PRYZM SDK CLI:<br>
            <code>npx @pryzm/sdk sign-manifest --manifest manifest.json --key private.jwk</code>
          </p>
          <div class="form-group">
            <label for="f-signature">Ed25519 Signature (hex) <span class="required">*</span></label>
            <textarea id="f-signature" name="signature" rows="3" required
              placeholder="a1b2c3d4e5f6… (128 hex characters)"></textarea>
          </div>
        </fieldset>

        <fieldset>
          <legend>Authentication</legend>
          <p class="form-hint">
            Submission requires a PRYZM account Bearer token. Paste your token below, or
            <a href="/" target="_blank">log in to PRYZM</a> first — the token is stored in
            <code>localStorage</code> as <code>pryzm_token</code> and will be auto-filled.
          </p>
          <div class="form-group">
            <label for="f-token">Bearer Token <span class="required">*</span></label>
            <input id="f-token" name="token" type="password" required
              placeholder="eyJhbGci…" />
          </div>
        </fieldset>

        <div class="form-actions">
          <button type="submit" id="submit-btn" class="btn-primary">Submit for Review</button>
        </div>

        <div id="submit-result" role="alert" aria-live="polite"></div>
      </form>
    </section>`;

  // Auto-fill token from localStorage if available
  const tokenInput = root.querySelector<HTMLInputElement>('#f-token');
  if (tokenInput) {
    const stored = localStorage.getItem('pryzm_token') ?? '';
    if (stored) tokenInput.value = stored;
  }

  const form = root.querySelector<HTMLFormElement>('#submit-form')!;
  const resultEl = root.querySelector<HTMLElement>('#submit-result')!;
  const submitBtn = root.querySelector<HTMLButtonElement>('#submit-btn')!;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    resultEl.className = '';
    resultEl.textContent = '';

    const data = new FormData(form);

    const id          = (data.get('id')          as string).trim();
    const name        = (data.get('name')         as string).trim();
    const version     = (data.get('version')      as string).trim();
    const publisher   = (data.get('publisher')    as string).trim();
    const description = (data.get('description')  as string).trim();
    const category    = (data.get('category')     as string).trim();
    const tagsRaw     = (data.get('tags')         as string).trim();
    const signature   = (data.get('signature')    as string).trim();
    const token       = (data.get('token')        as string).trim();

    const permissions = (data.getAll('permissions') as string[]);
    const tags = tagsRaw ? tagsRaw.split(',').map((t) => t.trim()).filter(Boolean) : [];

    if (!id || !name || !version || !publisher || !category || !signature || !token) {
      resultEl.className = 'result-error';
      resultEl.textContent = 'Please fill in all required fields.';
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting…';

    try {
      const result = await api.submitPlugin(
        { id, name, version, description, publisher, category, permissions, tags },
        signature,
        token,
      );

      resultEl.className = 'result-success';
      resultEl.innerHTML = `
        <strong>Submission received!</strong><br>
        Review ID: <code>${escapeHtml(result.reviewId)}</code><br>
        ${escapeHtml(result.message)}<br>
        Estimated review time: ${escapeHtml(result.estimatedReviewTime)}`;

      form.reset();
      if (tokenInput && token) tokenInput.value = token;
    } catch (err) {
      resultEl.className = 'result-error';
      resultEl.textContent = `Submission failed: ${escapeHtml((err as Error).message)}`;
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit for Review';
    }
  });
}
