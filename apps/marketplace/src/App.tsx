import React, { useState, useEffect, useCallback } from 'react';
import { api, type MarketplacePlugin, type PluginVersion, type InstallPluginResult, type PluginReview, type ReviewListResult } from './api/client';

// ── Auth helpers ───────────────────────────────────────────────────────────

interface AuthUser { userId: string; email: string | null; }

async function authSignIn(email: string, password: string): Promise<{ user: AuthUser; token: string }> {
  const res = await fetch('/api/auth/signin', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? `${res.status}`);
  }
  return res.json() as Promise<{ user: AuthUser; token: string }>;
}

async function authSignUp(
  email: string, password: string, name: string,
): Promise<{ user: AuthUser; token: string }> {
  const res = await fetch('/api/auth/signup', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password, name }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? `${res.status}`);
  }
  return res.json() as Promise<{ user: AuthUser; token: string }>;
}

async function authMe(token: string): Promise<AuthUser> {
  const res = await fetch('/api/auth/me', { headers: { authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error('Not authenticated');
  return res.json() as Promise<AuthUser>;
}

// ── Constants & helpers ────────────────────────────────────────────────────

type Page = { name: 'browse' } | { name: 'detail'; pluginId: string } | { name: 'submit' };

const TOKEN_KEY = 'pryzm_token';
const PAGE_SIZE = 24;

const CATEGORIES = ['', 'ai', 'element-family', 'format', 'auxiliary', 'view', 'annotation', 'discipline', 'demo', 'modeling', 'collaboration', 'inspection', 'documentation'];
const CAT_LABELS: Record<string, string> = {
  '': 'All categories',
  ai: 'AI',
  'element-family': 'Element Family',
  format: 'Format',
  auxiliary: 'Auxiliary',
  view: 'View',
  annotation: 'Annotation',
  discipline: 'Discipline',
  demo: 'Demo',
  modeling: 'Modeling',
  collaboration: 'Collaboration',
  inspection: 'Inspection',
  documentation: 'Documentation',
};

const SURFACE_EMOJI: Record<string, string> = {
  tool: '🔨', panel: '🗂', command: '⚡', 'element-type': '📦', 'view-template': '👁',
};

function categoryIcon(cat: string): string {
  const icons: Record<string, string> = {
    ai: '🤖', 'element-family': '🏗', format: '📄', auxiliary: '🔧',
    view: '👁', annotation: '📝', discipline: '📐', demo: '🧪',
    modeling: '🏛', collaboration: '🤝', inspection: '🔍', documentation: '📋',
  };
  return icons[cat] ?? '📦';
}

// ── AuthModal ──────────────────────────────────────────────────────────────

interface AuthModalProps {
  onSuccess: (token: string, user: AuthUser) => void;
  onClose: () => void;
}

function AuthModal({ onSuccess, onClose }: AuthModalProps) {
  const [tab, setTab]           = useState<'signin' | 'signup'>('signin');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [name, setName]         = useState('');
  const [busy, setBusy]         = useState(false);
  const [err, setErr]           = useState('');

  const switchTab = (t: 'signin' | 'signup') => { setTab(t); setErr(''); };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      const result = tab === 'signin'
        ? await authSignIn(email, password)
        : await authSignUp(email, password, name);
      localStorage.setItem(TOKEN_KEY, result.token);
      onSuccess(result.token, result.user);
    } catch (ex) {
      setErr((ex as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Sign in to PRYZM">
        <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        <div className="modal-title">PRYZM Account</div>
        <div className="modal-tabs">
          <button
            className={`modal-tab${tab === 'signin' ? ' active' : ''}`}
            type="button"
            onClick={() => switchTab('signin')}
          >
            Sign In
          </button>
          <button
            className={`modal-tab${tab === 'signup' ? ' active' : ''}`}
            type="button"
            onClick={() => switchTab('signup')}
          >
            Sign Up
          </button>
        </div>

        <form onSubmit={submit}>
          {tab === 'signup' && (
            <div className="field">
              <label>Name <span className="req">*</span></label>
              <input
                required
                placeholder="Your name"
                value={name}
                onChange={e => setName(e.target.value)}
                autoComplete="name"
              />
            </div>
          )}
          <div className="field">
            <label>Email <span className="req">*</span></label>
            <input
              required
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              autoComplete="email"
            />
          </div>
          <div className="field">
            <label>Password <span className="req">*</span></label>
            <input
              required
              type="password"
              placeholder={tab === 'signup' ? 'At least 8 characters' : 'Your password'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete={tab === 'signin' ? 'current-password' : 'new-password'}
            />
          </div>
          {err && <div className="result-error" style={{ marginBottom: 12 }}>{err}</div>}
          <button className="btn" type="submit" disabled={busy} style={{ width: '100%' }}>
            {busy ? '…' : tab === 'signin' ? 'Sign In' : 'Create Account'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── InstallPanel ───────────────────────────────────────────────────────────

type InstallState =
  | { phase: 'idle' }
  | { phase: 'working' }
  | { phase: 'done'; result: InstallPluginResult }
  | { phase: 'purchase_required' }
  | { phase: 'error'; message: string };

interface InstallPanelProps {
  plugin: MarketplacePlugin;
  token: string | null;
  onAuthRequired: () => void;
}

function InstallPanel({ plugin, token, onAuthRequired }: InstallPanelProps) {
  const [state, setState] = useState<InstallState>({ phase: 'idle' });
  const isFree = plugin.license === 'free' || plugin.license === '0' || plugin.isFirstParty;

  const doInstall = async () => {
    if (!token) { onAuthRequired(); return; }
    setState({ phase: 'working' });
    try {
      const result = await api.installPlugin(plugin.pluginId, token);
      setState({ phase: 'done', result });
    } catch (ex) {
      const msg = (ex as Error).message;
      if (msg.startsWith('402')) {
        setState({ phase: 'purchase_required' });
      } else {
        setState({ phase: 'error', message: msg });
      }
    }
  };

  const doPurchase = async () => {
    if (!token) { onAuthRequired(); return; }
    setState({ phase: 'working' });
    try {
      const base = window.location.origin + window.location.pathname;
      const result = await api.createPurchaseSession(
        plugin.pluginId,
        {
          successUrl: `${base}?installed=${encodeURIComponent(plugin.pluginId)}`,
          cancelUrl: base,
        },
        token,
      );
      window.location.href = result.sessionUrl;
    } catch (ex) {
      setState({ phase: 'error', message: (ex as Error).message });
    }
  };

  if (state.phase === 'done') {
    return (
      <div className="install-panel install-panel-success">
        <div className="install-panel-title">
          {state.result.isReference ? '✓ Bundled with PRYZM 3' : '✓ Ready to install'}
        </div>
        <div className="install-instructions">{state.result.installInstructions}</div>
        {state.result.bundleUrl && (
          <div className="install-meta">
            Bundle: <code>{state.result.bundleUrl}</code>
            {state.result.bundleSha256 && (
              <span> · SHA-256: <code>{state.result.bundleSha256.slice(0, 16)}…</code></span>
            )}
          </div>
        )}
        <button
          className="btn btn-ghost"
          style={{ marginTop: 12 }}
          onClick={() => setState({ phase: 'idle' })}
        >
          Dismiss
        </button>
      </div>
    );
  }

  const busy = state.phase === 'working';

  return (
    <div className="install-panel">
      <div className="install-panel-row">
        <div>
          <div className="install-price">{isFree ? 'Free' : plugin.license}</div>
          {!isFree && <div className="install-price-note">One-time purchase · 70% to developer</div>}
        </div>
        <div className="install-actions">
          {state.phase === 'error' && (
            <div className="result-error" style={{ marginBottom: 8, fontSize: 13 }}>
              {state.message}
            </div>
          )}
          {isFree || state.phase === 'idle' || state.phase === 'error' ? (
            <button
              className="btn"
              disabled={busy}
              onClick={isFree ? doInstall : doPurchase}
            >
              {busy ? 'Working…' : isFree ? 'Install Plugin' : `Buy — ${plugin.license}`}
            </button>
          ) : state.phase === 'purchase_required' ? (
            <button className="btn" onClick={doPurchase}>
              Purchase to Install
            </button>
          ) : (
            <button className="btn" disabled>Working…</button>
          )}
          {!token && (
            <div className="install-auth-hint">
              <button className="link-btn" onClick={onAuthRequired}>Sign in</button>{' '}
              to install plugins
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Star display ──────────────────────────────────────────────────────────

function Stars({ rating, max = 5 }: { rating: number; max?: number }) {
  const full = Math.round(rating);
  return (
    <span className="stars" aria-label={`${rating} out of ${max} stars`}>
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className={`star ${i < full ? 'star-on' : 'star-off'}`}>★</span>
      ))}
    </span>
  );
}

function StarPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hover, setHover] = useState(0);
  return (
    <span className="star-picker" role="group" aria-label="Select rating">
      {[1, 2, 3, 4, 5].map(n => (
        <button
          key={n}
          type="button"
          className={`star-pick ${n <= (hover || value) ? 'star-on' : 'star-off'}`}
          onMouseEnter={() => setHover(n)}
          onMouseLeave={() => setHover(0)}
          onClick={() => onChange(n)}
          aria-label={`${n} star${n > 1 ? 's' : ''}`}
          aria-pressed={n <= value}
        >
          ★
        </button>
      ))}
    </span>
  );
}

// ── ReviewsSection ─────────────────────────────────────────────────────────

interface ReviewsSectionProps {
  pluginId: string;
  token: string | null;
  onAuthRequired: () => void;
}

function ReviewsSection({ pluginId, token, onAuthRequired }: ReviewsSectionProps) {
  const [data, setData]           = useState<ReviewListResult | null>(null);
  const [loading, setLoading]     = useState(true);
  const [myRating, setMyRating]   = useState(0);
  const [myBody, setMyBody]       = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitErr, setSubmitErr] = useState('');
  const [submitOk, setSubmitOk]   = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.listReviews(pluginId, token ?? undefined);
      setData(result);
      const own = result.reviews.find((r: PluginReview) => r.isOwn);
      if (own) { setMyRating(own.rating); setMyBody(own.body); }
    } catch {
      setData({ reviews: [], total: 0, averageRating: 0, ratingCount: 0 });
    } finally {
      setLoading(false);
    }
  }, [pluginId, token]);

  useEffect(() => { void load(); }, [load]);

  const hasOwn = data?.reviews.some(r => r.isOwn) ?? false;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) { onAuthRequired(); return; }
    if (myRating < 1) { setSubmitErr('Please select a star rating.'); return; }
    setSubmitting(true);
    setSubmitErr('');
    setSubmitOk(false);
    try {
      await api.submitReview(pluginId, { rating: myRating, body: myBody }, token);
      setSubmitOk(true);
      await load();
    } catch (ex) {
      setSubmitErr((ex as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="detail-section">
      <h3>Reviews</h3>

      {loading && <div className="loading" style={{ padding: '16px 0' }}>Loading reviews…</div>}

      {!loading && data && (
        <>
          {data.ratingCount > 0 && (
            <div className="review-summary">
              <span className="review-avg">{data.averageRating.toFixed(1)}</span>
              <Stars rating={data.averageRating} />
              <span className="review-count">
                {data.ratingCount} review{data.ratingCount !== 1 ? 's' : ''}
              </span>
            </div>
          )}

          {data.reviews.length > 0 ? (
            <div className="review-list">
              {data.reviews.map(r => (
                <div key={r.id} className={`review-item${r.isOwn ? ' review-own' : ''}`}>
                  <div className="review-header">
                    <span className="review-author">{r.reviewerLabel}</span>
                    <Stars rating={r.rating} />
                    {r.isOwn && <span className="badge badge-own">Your review</span>}
                    <span className="review-date">
                      {new Date(r.updatedAt).toLocaleDateString()}
                    </span>
                  </div>
                  {r.body && <div className="review-body">{r.body}</div>}
                </div>
              ))}
            </div>
          ) : (
            <div className="review-empty">
              No reviews yet.{' '}
              {token
                ? 'Be the first to leave one below.'
                : <><button className="link-btn" onClick={onAuthRequired}>Sign in</button> to write the first review.</>}
            </div>
          )}

          <div className="review-form-wrap">
            <div className="review-form-title">
              {hasOwn ? 'Edit Your Review' : 'Write a Review'}
            </div>
            {!token ? (
              <div className="review-auth-hint">
                <button className="link-btn" onClick={onAuthRequired}>Sign in</button>{' '}
                to leave a review.
              </div>
            ) : (
              <form className="review-form" onSubmit={submit}>
                <div className="review-field">
                  <label>Rating <span className="req">*</span></label>
                  <StarPicker value={myRating} onChange={v => { setMyRating(v); setSubmitErr(''); }} />
                </div>
                <div className="review-field">
                  <label>Comment <span style={{ color: 'var(--muted)', fontWeight: 400 }}>(optional)</span></label>
                  <textarea
                    rows={3}
                    maxLength={2000}
                    placeholder="Share your experience with this plugin…"
                    value={myBody}
                    onChange={e => setMyBody(e.target.value)}
                  />
                  <div className="hint">{myBody.length}/2000 characters</div>
                </div>
                {submitErr && (
                  <div className="result-error" style={{ fontSize: 13 }}>{submitErr}</div>
                )}
                {submitOk && (
                  <div className="result-success" style={{ fontSize: 13 }}>
                    ✓ {hasOwn ? 'Review updated.' : 'Review submitted. Thank you!'}
                  </div>
                )}
                <div>
                  <button className="btn" type="submit" disabled={submitting || myRating < 1}>
                    {submitting ? 'Saving…' : hasOwn ? 'Update Review' : 'Submit Review'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ── Browse ─────────────────────────────────────────────────────────────────

function BrowsePage({ onDetail }: { onDetail: (id: string) => void }) {
  const [plugins, setPlugins]   = useState<MarketplacePlugin[]>([]);
  const [total, setTotal]       = useState(0);
  const [search, setSearch]     = useState('');
  const [category, setCategory] = useState('');
  const [offset, setOffset]     = useState(0);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');

  const load = useCallback(async (s: string, cat: string, off: number) => {
    setLoading(true);
    setError('');
    try {
      const res = await api.listPlugins({
        search: s || undefined,
        category: cat || undefined,
        limit: PAGE_SIZE,
        offset: off,
      });
      setPlugins(res.items);
      setTotal(res.total);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(search, category, offset); }, [load, search, category, offset]);

  const onSearch = (v: string) => { setSearch(v); setOffset(0); };
  const onCat    = (v: string) => { setCategory(v); setOffset(0); };

  return (
    <>
      <h1 className="page-title">Plugin Marketplace</h1>
      <p className="page-subtitle">Discover and install plugins for the PRYZM BIM platform.</p>

      <div className="filters">
        <input
          className="search-input"
          type="search"
          placeholder="Search plugins…"
          value={search}
          onChange={e => onSearch(e.target.value)}
        />
        <select className="cat-select" value={category} onChange={e => onCat(e.target.value)}>
          {CATEGORIES.map(c => <option key={c} value={c}>{CAT_LABELS[c]}</option>)}
        </select>
      </div>

      {error && <div className="error">{error}</div>}
      {loading && <div className="loading">Loading plugins…</div>}

      {!loading && !error && plugins.length === 0 && (
        <div className="empty">
          No plugins found{search ? ` matching "${search}"` : ''}.
        </div>
      )}

      {!loading && !error && plugins.length > 0 && (
        <>
          <div className="plugin-grid">
            {plugins.map(p => (
              <div
                key={p.pluginId}
                className="plugin-card"
                onClick={() => onDetail(p.pluginId)}
              >
                <div className="plugin-card-header">
                  <div className="plugin-icon">{categoryIcon(p.category)}</div>
                  <div>
                    <div className="plugin-name">{p.displayName}</div>
                    <div className="plugin-id">{p.pluginId}</div>
                  </div>
                </div>
                <div className="plugin-desc">{p.description}</div>
                <div className="plugin-meta">
                  <span className="badge badge-cat">{CAT_LABELS[p.category] ?? p.category}</span>
                  {p.isFirstParty && <span className="badge badge-first">First-party</span>}
                  {p.auditPassed  && <span className="badge badge-audited">✓ Audited</span>}
                  <span className="installs">{p.installCount.toLocaleString()} installs</span>
                </div>
              </div>
            ))}
          </div>

          <div className="pagination">
            <button
              className="btn btn-ghost"
              disabled={offset === 0}
              onClick={() => setOffset(o => Math.max(0, o - PAGE_SIZE))}
            >
              ← Prev
            </button>
            <span className="total-label">
              {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of {total}
            </span>
            <button
              className="btn btn-ghost"
              disabled={offset + PAGE_SIZE >= total}
              onClick={() => setOffset(o => o + PAGE_SIZE)}
            >
              Next →
            </button>
          </div>
        </>
      )}
    </>
  );
}

// ── Detail ─────────────────────────────────────────────────────────────────

interface DetailPageProps {
  pluginId: string;
  onBack: () => void;
  token: string | null;
  onAuthRequired: () => void;
}

function DetailPage({ pluginId, onBack, token, onAuthRequired }: DetailPageProps) {
  const [plugin, setPlugin]     = useState<MarketplacePlugin | null>(null);
  const [versions, setVersions] = useState<PluginVersion[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');

  useEffect(() => {
    setLoading(true);
    setError('');
    Promise.all([api.getPlugin(pluginId), api.listVersions(pluginId)])
      .then(([p, v]) => { setPlugin(p); setVersions(v); })
      .catch(e => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [pluginId]);

  if (loading) return <div className="loading">Loading…</div>;
  if (error) {
    return (
      <>
        <a className="back-link" onClick={onBack} style={{ cursor: 'pointer' }}>← Back</a>
        <div className="error">{error}</div>
      </>
    );
  }
  if (!plugin) return null;

  return (
    <>
      <a className="back-link" onClick={onBack} style={{ cursor: 'pointer' }}>← Back to catalog</a>

      <div className="detail-header">
        <div className="detail-icon">{categoryIcon(plugin.category)}</div>
        <div>
          <div className="detail-title">{plugin.displayName}</div>
          <div className="detail-sub">{plugin.pluginId}</div>
          <div className="detail-badges">
            <span className="badge badge-cat">{CAT_LABELS[plugin.category] ?? plugin.category}</span>
            {plugin.isFirstParty && <span className="badge badge-first">First-party</span>}
            {plugin.auditPassed  && <span className="badge badge-audited">✓ Audited</span>}
          </div>
        </div>
      </div>

      <InstallPanel plugin={plugin} token={token} onAuthRequired={onAuthRequired} />

      <div className="detail-desc">{plugin.description}</div>

      <div className="detail-section">
        <h3>Details</h3>
        <div className="detail-meta-grid">
          <div className="meta-item">
            <div className="meta-label">Publisher</div>
            <div className="meta-val">{plugin.publisherId}</div>
          </div>
          <div className="meta-item">
            <div className="meta-label">License</div>
            <div className="meta-val">{plugin.license}</div>
          </div>
          <div className="meta-item">
            <div className="meta-label">Installs</div>
            <div className="meta-val">{plugin.installCount.toLocaleString()}</div>
          </div>
          <div className="meta-item">
            <div className="meta-label">Added</div>
            <div className="meta-val">{new Date(plugin.createdAt).toLocaleDateString()}</div>
          </div>
        </div>
      </div>

      {plugin.surfaces.length > 0 && (
        <div className="detail-section">
          <h3>Surfaces</h3>
          <div>
            {plugin.surfaces.map(s => (
              <span key={s} className="surface-chip">{SURFACE_EMOJI[s] ?? '•'} {s}</span>
            ))}
          </div>
        </div>
      )}

      {versions.length > 0 && (
        <div className="detail-section">
          <h3>Versions</h3>
          <table className="versions-table">
            <thead>
              <tr>
                <th>Version</th>
                <th>Published</th>
                <th>SHA-256</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {versions.map(v => (
                <tr key={v.version}>
                  <td>{v.version}</td>
                  <td>{new Date(v.publishedAt).toLocaleDateString()}</td>
                  <td title={v.bundleSha256 ?? undefined}>
                    {v.bundleSha256?.slice(0, 12) ?? '—'}
                    {v.bundleSha256 ? '…' : ''}
                  </td>
                  <td className={v.revokedAt ? 'revoked' : ''}>
                    {v.revokedAt
                      ? `Revoked ${new Date(v.revokedAt).toLocaleDateString()}`
                      : '✓ Active'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {plugin.homepageUrl && (
        <div className="detail-section">
          <a href={plugin.homepageUrl} target="_blank" rel="noopener noreferrer">
            View homepage →
          </a>
        </div>
      )}

      <ReviewsSection pluginId={pluginId} token={token} onAuthRequired={onAuthRequired} />
    </>
  );
}

// ── Submit ─────────────────────────────────────────────────────────────────

type SubmitResult = { ok: true; versionId: string } | { ok: false; error: string } | null;

interface SubmitPageProps {
  token: string | null;
  onAuthRequired: () => void;
}

function SubmitPage({ token, onAuthRequired }: SubmitPageProps) {
  const [pluginId, setPluginId]         = useState('');
  const [version, setVersion]           = useState('');
  const [signature, setSignature]       = useState('');
  const [bundleUrl, setBundleUrl]       = useState('');
  const [bundleSha256, setBundleSha256] = useState('');
  const [keyid, setKeyid]               = useState('');
  const [submitting, setSubmitting]     = useState(false);
  const [result, setResult]             = useState<SubmitResult>(null);

  if (!token) {
    return (
      <>
        <h1 className="page-title">Submit a Plugin Version</h1>
        <div className="auth-gate">
          <div className="auth-gate-msg">
            Sign in to your PRYZM publisher account to submit plugin versions for review.
          </div>
          <button className="btn" onClick={onAuthRequired}>Sign In / Sign Up</button>
        </div>
      </>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setResult(null);
    try {
      const res = await api.submitVersion(
        pluginId, version,
        { signature, bundleUrl, bundleSha256, signedByKeyid: keyid },
        token,
      );
      setResult({ ok: true, versionId: res.versionId });
    } catch (err) {
      setResult({ ok: false, error: (err as Error).message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <h1 className="page-title">Submit a Plugin Version</h1>
      <p className="page-subtitle" style={{ marginBottom: 28 }}>
        Sign your bundle with <code>pryzm publish keygen</code> and submit it for review.
      </p>

      <form className="submit-form" onSubmit={handleSubmit}>
        <div className="form-section">
          <div className="form-section-title">Plugin identity</div>
          <div className="field-row">
            <div className="field">
              <label>Plugin ID <span className="req">*</span></label>
              <input
                required
                placeholder="pryzm/my-plugin"
                value={pluginId}
                onChange={e => setPluginId(e.target.value)}
              />
              <div className="hint">Format: &lt;publisher&gt;/&lt;slug&gt;</div>
            </div>
            <div className="field">
              <label>Version <span className="req">*</span></label>
              <input
                required
                placeholder="1.0.0"
                value={version}
                onChange={e => setVersion(e.target.value)}
              />
              <div className="hint">Strict semver: MAJOR.MINOR.PATCH</div>
            </div>
          </div>
        </div>

        <div className="form-section">
          <div className="form-section-title">Bundle</div>
          <div className="field">
            <label>Bundle URL <span className="req">*</span></label>
            <input
              required
              type="url"
              placeholder="https://cdn.example.com/my-plugin-1.0.0.tgz"
              value={bundleUrl}
              onChange={e => setBundleUrl(e.target.value)}
            />
          </div>
          <div className="field">
            <label>Bundle SHA-256 <span className="req">*</span></label>
            <input
              required
              placeholder="64 lowercase hex chars"
              pattern="[0-9a-f]{64}"
              value={bundleSha256}
              onChange={e => setBundleSha256(e.target.value)}
            />
            <div className="hint">Computed by <code>pryzm build --bundle dist/index.js</code></div>
          </div>
        </div>

        <div className="form-section">
          <div className="form-section-title">Ed25519 signature</div>
          <div className="field">
            <label>Signature (base64) <span className="req">*</span></label>
            <textarea
              required
              rows={3}
              placeholder="Base64-encoded Ed25519 signature from pryzm publish"
              value={signature}
              onChange={e => setSignature(e.target.value)}
            />
          </div>
          <div className="field">
            <label>Publisher public key ID <span className="req">*</span></label>
            <input
              required
              placeholder="Base64url-encoded Ed25519 public key"
              value={keyid}
              onChange={e => setKeyid(e.target.value)}
            />
            <div className="hint">The <code>publicKeyB64</code> from your publisher.jwk file</div>
          </div>
        </div>

        <button className="btn" type="submit" disabled={submitting}>
          {submitting ? 'Submitting…' : 'Submit for review'}
        </button>

        {result?.ok && (
          <div className="result-success">
            ✓ Submitted successfully. Version ID: <strong>{result.versionId}</strong>
          </div>
        )}
        {result && !result.ok && (
          <div className="result-error">✗ {result.error}</div>
        )}
      </form>
    </>
  );
}

// ── App shell ──────────────────────────────────────────────────────────────

export default function App() {
  const [page, setPage]         = useState<Page>({ name: 'browse' });
  const [token, setToken]       = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [user, setUser]         = useState<AuthUser | null>(null);
  const [showAuth, setShowAuth] = useState(false);

  useEffect(() => {
    if (!token) return;
    authMe(token)
      .then(u => setUser(u))
      .catch(() => { localStorage.removeItem(TOKEN_KEY); setToken(null); });
  }, [token]);

  const onAuthSuccess = (t: string, u: AuthUser) => {
    setToken(t);
    setUser(u);
    setShowAuth(false);
  };

  const signOut = () => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
  };

  const openAuth = () => setShowAuth(true);

  return (
    <div className="app">
      <nav className="nav">
        <span className="nav-brand">PRYZM Marketplace</span>
        <a
          className={page.name === 'browse' ? 'active' : ''}
          onClick={() => setPage({ name: 'browse' })}
          style={{ cursor: 'pointer' }}
        >
          Browse
        </a>
        <a
          className={page.name === 'submit' ? 'active' : ''}
          onClick={() => setPage({ name: 'submit' })}
          style={{ cursor: 'pointer' }}
        >
          Submit Plugin
        </a>
        <div className="nav-spacer" />
        <a
          href="https://docs.pryzm.app/plugin-sdk/getting-started"
          target="_blank"
          rel="noopener noreferrer"
        >
          Docs →
        </a>
        {user ? (
          <div className="nav-user">
            <span className="nav-user-email">{user.email ?? user.userId.slice(0, 8)}</span>
            <button className="btn btn-ghost btn-sm" onClick={signOut}>Sign Out</button>
          </div>
        ) : (
          <button className="btn btn-sm" onClick={openAuth}>Sign In</button>
        )}
      </nav>

      <main className="main">
        {page.name === 'browse' && (
          <BrowsePage onDetail={id => setPage({ name: 'detail', pluginId: id })} />
        )}
        {page.name === 'detail' && (
          <DetailPage
            pluginId={page.pluginId}
            onBack={() => setPage({ name: 'browse' })}
            token={token}
            onAuthRequired={openAuth}
          />
        )}
        {page.name === 'submit' && (
          <SubmitPage token={token} onAuthRequired={openAuth} />
        )}
      </main>

      <footer>
        PRYZM Marketplace ·{' '}
        <a href="https://pryzm.app" target="_blank" rel="noopener noreferrer">
          pryzm.app
        </a>
      </footer>

      {showAuth && (
        <AuthModal onSuccess={onAuthSuccess} onClose={() => setShowAuth(false)} />
      )}
    </div>
  );
}
