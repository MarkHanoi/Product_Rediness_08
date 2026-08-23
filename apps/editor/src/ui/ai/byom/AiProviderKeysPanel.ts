// §BYOM UI — "AI provider keys" (C103 §7, SPEC-BYOM-PROVIDER-KEYS §7).
//
// One card per provider, an obscured field with a Show toggle, and a link to
// that provider's own console. Ollama takes an address instead of a key.
//
// ⭐ THE STORAGE PROMISE IS STATED IN THE UI, IN THE SAME PLAIN WORDS AS THE
// IMPLEMENTATION — and only because the implementation actually keeps it. The
// key is written by `byomDeviceStorage.ts` to this browser and nowhere else;
// there is no server row, no project field, no Yjs map, no telemetry
// attribute; and `byomSecretContainment.test.ts` asserts the absent edge rather
// than trusting this comment. If any of that stopped being true, THIS COPY
// would have to change first.
//
// ⚠ The panel ALSO states the risk, not only the promise. localStorage is
// readable by any script on this origin, and a promise the user cannot evaluate
// is worse than no promise. C103 §4.2 carries the threat model; the sentence
// below is its user-facing form.
//
// BRAND: PRYZM purple #6600FF on white. No black.
//
// ⚠ No CSS comments inside template literals anywhere in this file — a backtick
// in one terminates the literal, and that has bitten three lanes this week.

import {
    BYOM_PROVIDERS,
    findProvider,
    resolveAiRoute,
    routeAttributionLine,
    type ByomProvider,
    type ByomStorageArea,
    type ByomVault,
} from '@pryzm/ai-host';
import { byomVaults } from './byomDeviceStorage';

const PURPLE = '#6600FF';
const INK = '#1b1b28';
const MUTED = '#5c5c72';
const LINE = '#e6e0ff';
const WASH = '#f7f4ff';

let openPanel: HTMLElement | null = null;

/** The one-line human rendering of a measured browser-direct verdict. */
function verdictBadge(provider: ByomProvider): { text: string; bg: string; fg: string } {
    switch (provider.browserDirect) {
        case 'supported-documented':
            return { text: 'Documented for browser use', bg: '#efe9ff', fg: PURPLE };
        case 'supported-opt-in':
            return { text: 'Works from the browser', bg: '#efe9ff', fg: PURPLE };
        case 'supported-undocumented':
            return { text: 'Works today, not documented', bg: '#fff6e6', fg: '#8a5a00' };
        case 'local-opt-in':
            return { text: 'Needs setup on your machine', bg: '#fff6e6', fg: '#8a5a00' };
    }
}

function el<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    css: string,
    text?: string,
): HTMLElementTagNameMap[K] {
    const node = document.createElement(tag);
    node.style.cssText = css;
    if (text !== undefined) node.textContent = text;
    return node;
}

/** Which vault the user's storage-area choice points at. */
function vaultFor(area: ByomStorageArea): ByomVault {
    const set = byomVaults();
    return area === 'session' ? set.session : set.device;
}

/**
 * Build (or re-focus) the panel. Idempotent: calling it twice returns the same
 * node rather than stacking modals.
 */
export function openAiProviderKeysPanel(): HTMLElement {
    if (openPanel?.isConnected) {
        openPanel.focus();
        return openPanel;
    }

    const overlay = el(
        'div',
        'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;' +
            'justify-content:center;background:rgba(27,27,40,.28);backdrop-filter:blur(2px);',
    );

    const panel = el(
        'div',
        'width:min(680px,94vw);max-height:88vh;overflow:auto;background:#ffffff;' +
            `border:2px solid ${PURPLE};border-radius:14px;box-shadow:0 18px 48px rgba(27,27,40,.24);` +
            'font:14px/1.55 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;' +
            `color:${INK};padding:22px 24px 18px;`,
    );
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-label', 'AI provider keys');
    panel.tabIndex = -1;

    // ── Header ──────────────────────────────────────────────────────────────
    const head = el('div', 'display:flex;align-items:flex-start;gap:12px;margin-bottom:4px;');
    head.appendChild(el('div', `font-size:19px;font-weight:700;color:${PURPLE};flex:1;`, 'AI provider keys'));

    const close = el(
        'button',
        `border:1px solid ${LINE};background:#fff;color:${MUTED};border-radius:8px;` +
            'width:30px;height:30px;font-size:17px;cursor:pointer;line-height:1;',
        '×',
    );
    close.setAttribute('aria-label', 'Close');
    head.appendChild(close);
    panel.appendChild(head);

    panel.appendChild(
        el(
            'div',
            `color:${MUTED};margin-bottom:14px;`,
            'PRYZM answers most requests with its own built-in AI, and that does not change. ' +
                'If you would rather run on your own account, add a key below and pick it.',
        ),
    );

    // ── The promise, and the risk beside it ─────────────────────────────────
    const promise = el(
        'div',
        `background:${WASH};border-left:3px solid ${PURPLE};border-radius:8px;` +
            'padding:11px 13px;margin-bottom:8px;',
    );
    promise.appendChild(
        el(
            'div',
            `font-weight:600;color:${PURPLE};margin-bottom:3px;`,
            'Keys you enter below are stored only on this device, and leave it only to call the provider you choose.',
        ),
    );
    promise.appendChild(
        el(
            'div',
            `color:${MUTED};font-size:13px;`,
            'They are never sent to PRYZM, never written into a project file, and never shared with anyone ' +
                'you collaborate with.',
        ),
    );
    panel.appendChild(promise);

    const caution = el(
        'div',
        `color:${MUTED};font-size:12.5px;margin-bottom:14px;padding-left:2px;`,
        'Worth knowing: browser storage can be read by anything else running on this page, and by anyone ' +
            'using this computer. On a shared or borrowed machine, choose "until I close this tab" below. ' +
            'Signing out of PRYZM erases the keys either way.',
    );
    panel.appendChild(caution);

    // ── Current route ───────────────────────────────────────────────────────
    const routeBox = el(
        'div',
        `border:1px solid ${LINE};border-radius:10px;padding:10px 13px;margin-bottom:16px;background:#fff;`,
    );
    const routeLabel = el('div', `font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:${MUTED};`, 'Your next message');
    const routeValue = el('div', `font-weight:600;color:${PURPLE};margin-top:2px;`);
    routeBox.appendChild(routeLabel);
    routeBox.appendChild(routeValue);
    panel.appendChild(routeBox);

    // ── Storage-area choice ─────────────────────────────────────────────────
    let area: ByomStorageArea = byomVaults().session.configuredProviders().length > 0 ? 'session' : 'device';

    const areaRow = el('div', 'display:flex;gap:8px;margin-bottom:18px;align-items:center;flex-wrap:wrap;');
    areaRow.appendChild(el('div', `font-size:13px;color:${MUTED};margin-right:2px;`, 'Keep keys:'));

    const areaButtons: Array<{ value: ByomStorageArea; node: HTMLButtonElement }> = [];
    for (const opt of [
        { value: 'device' as const, label: 'On this device' },
        { value: 'session' as const, label: 'Until I close this tab' },
    ]) {
        const b = el('button', 'border-radius:999px;padding:5px 13px;font-size:13px;cursor:pointer;');
        b.textContent = opt.label;
        b.addEventListener('click', () => {
            area = opt.value;
            render();
        });
        areaButtons.push({ value: opt.value, node: b });
        areaRow.appendChild(b);
    }
    panel.appendChild(areaRow);

    // ── Provider cards ──────────────────────────────────────────────────────
    const list = el('div', 'display:flex;flex-direction:column;gap:12px;');
    panel.appendChild(list);

    const status = el('div', `margin-top:14px;min-height:19px;font-size:13px;color:${PURPLE};font-weight:600;`);
    panel.appendChild(status);

    function say(message: string): void {
        status.textContent = message;
    }

    // Draft input values survive a re-render so a half-typed key is not lost.
    const drafts = new Map<string, { secret: string; model: string; baseUrl: string; shown: boolean }>();
    function draftFor(p: ByomProvider) {
        let d = drafts.get(p.id);
        if (!d) {
            d = { secret: '', model: '', baseUrl: '', shown: false };
            drafts.set(p.id, d);
        }
        return d;
    }

    function renderCard(provider: ByomProvider): HTMLElement {
        const vaults = byomVaults();
        const stored =
            vaults.session.describe(provider.id) ?? vaults.device.describe(provider.id) ?? null;
        const active = vaults.activeProviderId() === provider.id;
        const draft = draftFor(provider);

        const card = el(
            'div',
            `border:1px solid ${active ? PURPLE : LINE};border-radius:12px;padding:13px 15px;` +
                `background:${active ? WASH : '#fff'};`,
        );

        const top = el('div', 'display:flex;align-items:center;gap:9px;flex-wrap:wrap;');
        top.appendChild(el('div', `font-weight:700;font-size:15px;color:${INK};`, provider.label));

        const badge = verdictBadge(provider);
        top.appendChild(
            el(
                'span',
                `font-size:11px;padding:2px 8px;border-radius:999px;background:${badge.bg};color:${badge.fg};font-weight:600;`,
                badge.text,
            ),
        );

        if (active) {
            top.appendChild(
                el(
                    'span',
                    `font-size:11px;padding:2px 8px;border-radius:999px;background:${PURPLE};color:#fff;font-weight:700;`,
                    'IN USE',
                ),
            );
        }
        card.appendChild(top);

        card.appendChild(el('div', `color:${MUTED};font-size:13px;margin:4px 0 2px;`, provider.blurb));
        card.appendChild(el('div', `color:${MUTED};font-size:12px;margin-bottom:9px;`, provider.browserDirectNote));

        // ⭐ The saved state as VISIBLE TEXT, not merely as the field's
        // placeholder. A placeholder vanishes the instant the user types, so it
        // cannot answer "is a key already saved, and is it the one I pasted?" —
        // which is the question they open this panel to ask. The mask shows the
        // TAIL and the length, exactly as the vendors' own consoles do, and
        // never the vendor prefix.
        if (stored) {
            const savedRow = el(
                'div',
                `display:flex;align-items:center;gap:7px;margin-bottom:8px;font-size:12.5px;color:${MUTED};`,
            );
            savedRow.appendChild(
                el(
                    'span',
                    `font-family:ui-monospace,SFMono-Regular,Menlo,monospace;color:${INK};`,
                    provider.auth === 'none' ? stored.baseUrl : `Saved: ${stored.maskedKey}`,
                ),
            );
            savedRow.appendChild(
                el(
                    'span',
                    `color:${MUTED};`,
                    stored.area === 'session' ? '· until this tab closes' : '· on this device',
                ),
            );
            card.appendChild(savedRow);
        }

        // Key (or, for a keyless provider, a note in its place)
        if (provider.auth === 'api-key') {
            const fieldRow = el('div', 'display:flex;gap:7px;align-items:center;margin-bottom:7px;');
            const input = document.createElement('input');
            input.type = draft.shown ? 'text' : 'password';
            input.value = draft.secret;
            input.placeholder = stored ? `Saved: ${stored.maskedKey}` : `Paste your ${provider.label} API key`;
            input.autocomplete = 'off';
            input.spellcheck = false;
            input.setAttribute('aria-label', `${provider.label} API key`);
            input.style.cssText =
                `flex:1;min-width:0;padding:8px 10px;border:1px solid ${LINE};border-radius:8px;` +
                `font:13px ui-monospace,SFMono-Regular,Menlo,monospace;color:${INK};background:#fff;`;
            input.addEventListener('input', () => { draft.secret = input.value; });
            fieldRow.appendChild(input);

            const toggle = el(
                'button',
                `border:1px solid ${LINE};background:#fff;color:${PURPLE};border-radius:8px;` +
                    'padding:7px 11px;font-size:12.5px;cursor:pointer;font-weight:600;',
                draft.shown ? 'Hide' : 'Show',
            );
            toggle.setAttribute('aria-label', draft.shown ? 'Hide the key' : 'Show the key');
            toggle.addEventListener('click', () => {
                draft.shown = !draft.shown;
                render();
            });
            fieldRow.appendChild(toggle);
            card.appendChild(fieldRow);

            if (provider.keyHint && draft.secret && !draft.secret.startsWith(provider.keyHint)) {
                // A WARNING, never a rejection: a vendor may change its prefix
                // at any time, and a client-side format assertion that is wrong
                // is worse than no assertion.
                card.appendChild(
                    el(
                        'div',
                        'color:#8a5a00;font-size:12px;margin-bottom:7px;',
                        `${provider.label} keys usually start with "${provider.keyHint}". You can still save this one.`,
                    ),
                );
            }
        } else {
            card.appendChild(
                el(
                    'div',
                    `color:${MUTED};font-size:12.5px;margin-bottom:7px;`,
                    'No key needed — this one runs on your own computer.',
                ),
            );
        }

        // Address (only where the provider permits one) and model.
        const optionsRow = el('div', 'display:flex;gap:7px;margin-bottom:9px;flex-wrap:wrap;');
        if (provider.allowsCustomBaseUrl) {
            const url = document.createElement('input');
            url.type = 'text';
            url.value = draft.baseUrl;
            url.placeholder = stored?.baseUrl ?? provider.defaultBaseUrl;
            url.setAttribute('aria-label', `${provider.label} address`);
            url.style.cssText =
                `flex:2;min-width:180px;padding:7px 10px;border:1px solid ${LINE};border-radius:8px;font-size:12.5px;`;
            url.addEventListener('input', () => { draft.baseUrl = url.value; });
            optionsRow.appendChild(url);
        }
        const model = document.createElement('input');
        model.type = 'text';
        model.value = draft.model;
        model.placeholder = stored?.model ?? provider.defaultModel;
        model.setAttribute('aria-label', `${provider.label} model`);
        model.style.cssText =
            `flex:1;min-width:150px;padding:7px 10px;border:1px solid ${LINE};border-radius:8px;font-size:12.5px;`;
        model.addEventListener('input', () => { draft.model = model.value; });
        optionsRow.appendChild(model);
        card.appendChild(optionsRow);

        // Actions
        const actions = el('div', 'display:flex;gap:7px;align-items:center;flex-wrap:wrap;');

        const save = el(
            'button',
            `background:${PURPLE};color:#fff;border:none;border-radius:8px;padding:8px 15px;` +
                'font-size:13px;font-weight:700;cursor:pointer;',
            stored ? 'Update' : 'Save',
        );
        save.addEventListener('click', () => {
            const result = vaultFor(area).save(provider, {
                secret: draft.secret || (stored && provider.auth === 'none' ? '' : draft.secret),
                ...(draft.model ? { model: draft.model } : {}),
                ...(draft.baseUrl ? { baseUrl: draft.baseUrl } : {}),
            });
            if (!result.ok) {
                say(result.reason);
                return;
            }
            draft.secret = '';
            draft.shown = false;
            say(`${provider.label} saved on this device. Press "Use this" to route your chat through it.`);
            render();
        });
        actions.appendChild(save);

        if (stored) {
            const use = el(
                'button',
                `border:1.5px solid ${PURPLE};background:#fff;color:${PURPLE};border-radius:8px;` +
                    'padding:8px 15px;font-size:13px;font-weight:700;cursor:pointer;',
                active ? 'Back to PRYZM AI' : 'Use this',
            );
            use.addEventListener('click', () => {
                const target = vaultFor(stored.area);
                target.setActiveProvider(active ? null : provider.id);
                say(
                    active
                        ? 'Back on PRYZM built-in AI.'
                        : `Your chat now runs on your own ${provider.label} key.`,
                );
                render();
            });
            actions.appendChild(use);

            const remove = el(
                'button',
                `border:1px solid ${LINE};background:#fff;color:${MUTED};border-radius:8px;` +
                    'padding:8px 13px;font-size:13px;cursor:pointer;',
                'Remove',
            );
            remove.addEventListener('click', () => {
                vaultFor(stored.area).clear(provider.id);
                say(`${provider.label} key removed from this device.`);
                render();
            });
            actions.appendChild(remove);
        }

        if (provider.consoleUrl) {
            const link = document.createElement('a');
            link.href = provider.consoleUrl;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            link.textContent = provider.auth === 'none' ? 'Install Ollama →' : `Get a ${provider.label} key →`;
            link.style.cssText = `margin-left:auto;color:${PURPLE};font-size:12.5px;font-weight:600;text-decoration:none;`;
            actions.appendChild(link);
        }

        card.appendChild(actions);
        return card;
    }

    function render(): void {
        const route = resolveAiRoute(byomVaults());
        routeValue.textContent = routeAttributionLine(route).replace(/^\(|\)$/g, '');

        for (const { value, node } of areaButtons) {
            const on = value === area;
            node.style.cssText =
                'border-radius:999px;padding:5px 13px;font-size:13px;cursor:pointer;font-weight:600;' +
                (on
                    ? `background:${PURPLE};color:#fff;border:1.5px solid ${PURPLE};`
                    : `background:#fff;color:${MUTED};border:1px solid ${LINE};`);
            node.setAttribute('aria-pressed', String(on));
        }

        list.replaceChildren(...BYOM_PROVIDERS.map(renderCard));
    }

    function dismiss(): void {
        overlay.remove();
        openPanel = null;
        document.removeEventListener('keydown', onKey);
    }
    function onKey(e: KeyboardEvent): void {
        if (e.key === 'Escape') dismiss();
    }

    close.addEventListener('click', dismiss);
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) dismiss();
    });
    document.addEventListener('keydown', onKey);

    render();
    overlay.appendChild(panel);
    document.body.appendChild(overlay);
    panel.focus();
    openPanel = panel;
    return panel;
}

/**
 * A one-line, non-secret summary for anywhere that wants to show BYOM state
 * without opening the panel. ⛔ It cannot return a key even by accident,
 * because `describeAll()` returns descriptors and a descriptor has no secret
 * field — see `assertDescriptorIsSafe` and `byomSecretContainment.test.ts`.
 */
export function summariseByomState(): string {
    const vaults = byomVaults();
    const configured = vaults.describeAll();
    if (configured.length === 0) return 'No provider keys stored on this device.';
    const active = vaults.activeProviderId();
    const names = configured
        .map((d) => findProvider(d.providerId)?.label ?? d.providerId)
        .join(', ');
    const activeLabel = active ? findProvider(active)?.label ?? active : null;
    return activeLabel
        ? `${names} stored on this device. Using ${activeLabel}.`
        : `${names} stored on this device. Using PRYZM built-in AI.`;
}
