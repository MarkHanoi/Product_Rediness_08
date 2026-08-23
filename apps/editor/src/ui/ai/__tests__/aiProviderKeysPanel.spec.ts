// §BYOM UI (C103 §6.5, §7) — the surface the founder actually clicks.
//
// ⭐ THE POINT OF THE LAST DESCRIBE BLOCK. The panel makes a promise in plain
// words — "stored only on this device… never sent to PRYZM". A UI test that
// only checked the copy was present would be checking that we WROTE the
// promise, not that we KEPT it. So `§PROMISE-IS-TRUE` asserts the copy AND
// asserts, after a real save, that the key is in this browser's storage and
// nowhere in the rendered DOM.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { openAiProviderKeysPanel, summariseByomState } from '../byom/AiProviderKeysPanel';
import { __resetByomVaultsForTest } from '../byom/byomDeviceStorage';

const KEY = 'sk-ant-api03-PANELCANARYPANELCANARYPANELCANARY';

function panel(): HTMLElement {
    return openAiProviderKeysPanel();
}

function buttonsIn(root: HTMLElement): HTMLButtonElement[] {
    return [...root.querySelectorAll('button')] as HTMLButtonElement[];
}

function byText(root: HTMLElement, text: string): HTMLButtonElement | null {
    return buttonsIn(root).find((b) => b.textContent?.trim() === text) ?? null;
}

/** The card for a provider, located by its heading text. */
function cardFor(root: HTMLElement, label: string): HTMLElement {
    const heading = [...root.querySelectorAll('div')].find((d) => d.textContent?.trim() === label);
    if (!heading) throw new Error(`no card heading for "${label}"`);
    // heading → top row → card
    return heading.parentElement!.parentElement as HTMLElement;
}

function closePanel(): void {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    document.querySelectorAll('[role="dialog"]').forEach((n) => n.parentElement?.remove());
}

beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    __resetByomVaultsForTest();
    document.body.replaceChildren();
});

afterEach(() => {
    closePanel();
    localStorage.clear();
    sessionStorage.clear();
    __resetByomVaultsForTest();
});

describe('§BYOM-UI — the six providers from the reference surface', () => {
    it('renders a card for each of the six, Ollama included', () => {
        const root = panel();
        for (const label of ['Claude', 'ChatGPT', 'Gemini', 'DeepSeek', 'OpenRouter', 'Ollama (fully local)']) {
            expect(root.textContent).toContain(label);
        }
    });

    it('offers a key field that is OBSCURED by default, with a Show toggle', () => {
        const root = panel();
        const input = cardFor(root, 'Claude').querySelector('input') as HTMLInputElement;
        expect(input.type).toBe('password');

        const show = byText(cardFor(root, 'Claude'), 'Show');
        expect(show).not.toBeNull();
        show!.click();

        const after = cardFor(panel(), 'Claude').querySelector('input') as HTMLInputElement;
        expect(after.type).toBe('text');
    });

    it('links to each provider own console', () => {
        const links = [...panel().querySelectorAll('a')] as HTMLAnchorElement[];
        const hrefs = links.map((a) => a.href);
        expect(hrefs.some((h) => h.includes('console.anthropic.com'))).toBe(true);
        expect(hrefs.some((h) => h.includes('platform.openai.com'))).toBe(true);
        expect(hrefs.some((h) => h.includes('aistudio.google.com'))).toBe(true);
        expect(hrefs.some((h) => h.includes('openrouter.ai'))).toBe(true);
        expect(hrefs.some((h) => h.includes('ollama.com'))).toBe(true);
        // Every outbound link must be safe to open.
        for (const a of links) expect(a.rel).toContain('noopener');
    });

    it('gives Ollama an ADDRESS field and no key field — it has no account', () => {
        const card = cardFor(panel(), 'Ollama (fully local)');
        expect(card.textContent).toContain('No key needed');
        const inputs = [...card.querySelectorAll('input')] as HTMLInputElement[];
        expect(inputs.some((i) => i.type === 'password')).toBe(false);
        expect(inputs.some((i) => i.placeholder.includes('11434'))).toBe(true);
    });

    it('states the MEASURED browser verdict per provider rather than one blanket claim', () => {
        const root = panel();
        // Anthropic measured as working; OpenAI measured as working but undocumented.
        expect(cardFor(root, 'Claude').textContent).toContain('Works from the browser');
        expect(cardFor(root, 'ChatGPT').textContent).toContain('Works today, not documented');
        expect(cardFor(root, 'Ollama (fully local)').textContent).toContain('Needs setup on your machine');
    });
});

describe('§BYOM-UI — the route is visible before and after the choice', () => {
    it('opens saying PRYZM built-in AI will answer', () => {
        expect(panel().textContent).toContain("PRYZM's built-in AI");
    });

    it('saving a key does NOT by itself change who answers', () => {
        const root = panel();
        const card = cardFor(root, 'Claude');
        const input = card.querySelector('input') as HTMLInputElement;
        input.value = KEY;
        input.dispatchEvent(new Event('input'));
        byText(card, 'Save')!.click();

        // Stored…
        expect(summariseByomState()).toContain('Claude');
        // …but PRYZM still answers until the user presses "Use this".
        expect(summariseByomState()).toContain('Using PRYZM built-in AI');
    });

    it('pressing "Use this" switches the route, and it says so', () => {
        const root = panel();
        const card = cardFor(root, 'Claude');
        const input = card.querySelector('input') as HTMLInputElement;
        input.value = KEY;
        input.dispatchEvent(new Event('input'));
        byText(card, 'Save')!.click();

        byText(cardFor(root, 'Claude'), 'Use this')!.click();

        expect(summariseByomState()).toContain('Using Claude');
        expect(root.textContent).toContain('your own Claude key');
        expect(root.textContent).toContain('IN USE');
    });

    it('refuses an empty key with a reason, and stores nothing', () => {
        const root = panel();
        byText(cardFor(root, 'Claude'), 'Save')!.click();
        expect(root.textContent).toContain('needs an API key');
        expect(summariseByomState()).toContain('No provider keys stored');
    });
});

describe('§PROMISE-IS-TRUE — the copy and the behaviour are checked together', () => {
    it('states the promise in the founder own plain words', () => {
        const text = panel().textContent ?? '';
        expect(text).toContain('stored only on this device');
        expect(text).toContain('leave it only to call the provider you choose');
        expect(text).toContain('never sent to PRYZM');
    });

    it('states the RISK too — a promise the user cannot evaluate is worse than none', () => {
        const text = panel().textContent ?? '';
        expect(text).toContain('browser storage can be read');
        expect(text).toContain('Signing out of PRYZM erases the keys');
    });

    it('after saving, the key is in THIS browser storage under the purge prefix…', () => {
        const card = cardFor(panel(), 'Claude');
        const input = card.querySelector('input') as HTMLInputElement;
        input.value = KEY;
        input.dispatchEvent(new Event('input'));
        byText(card, 'Save')!.click();

        const written = Object.keys(localStorage).filter((k) => localStorage.getItem(k)?.includes(KEY));
        expect(written).toHaveLength(1);
        // ⛔ The purge prefix. `purgeUserScopedClientState()` keys off it, which
        // is what makes "signing out erases the keys" true rather than aspirational.
        expect(written[0]!.startsWith('pryzm-')).toBe(true);
    });

    it('…and NOWHERE in the rendered DOM, not even in the field that typed it', () => {
        const root = panel();
        const card = cardFor(root, 'Claude');
        const input = card.querySelector('input') as HTMLInputElement;
        input.value = KEY;
        input.dispatchEvent(new Event('input'));
        byText(card, 'Save')!.click();

        // The field is cleared on save and the saved state is shown MASKED.
        expect(root.textContent).not.toContain(KEY);
        expect(root.innerHTML).not.toContain(KEY);
        const inputs = [...root.querySelectorAll('input')] as HTMLInputElement[];
        expect(inputs.every((i) => i.value !== KEY)).toBe(true);
        expect(root.textContent).toContain('••••');
    });

    it('Remove takes the key off the device', () => {
        const root = panel();
        const card = cardFor(root, 'Claude');
        const input = card.querySelector('input') as HTMLInputElement;
        input.value = KEY;
        input.dispatchEvent(new Event('input'));
        byText(card, 'Save')!.click();

        byText(cardFor(root, 'Claude'), 'Remove')!.click();

        expect(Object.keys(localStorage).some((k) => localStorage.getItem(k)?.includes(KEY))).toBe(false);
        expect(summariseByomState()).toContain('No provider keys stored');
    });
});
