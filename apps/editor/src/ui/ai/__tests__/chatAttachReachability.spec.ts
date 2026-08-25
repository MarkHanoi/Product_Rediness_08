/**
 * §CHAT-ATTACH-REACHABILITY (L-10909) — the founder can actually attach a photo,
 * and what he attaches actually reaches the generator.
 *
 * ── THE DEFECT THIS EXISTS TO PREVENT, WHICH WE SHIPPED TODAY ───────────────
 *
 * Earlier in this same session, "Facade from Photo" was authored into a rail the
 * founder's right panel does not render, and a BINDING TEST PASSED THE WHOLE TIME:
 * it constructed its OWN rail, put the item in it, and asserted the item was
 * there. It proved that an array literal contains what the same file put into it.
 * It could never have failed, and it certified a dead button as wired
 * (§FACADE-PANEL-REACHABILITY, L-10930).
 *
 * [[committed-is-not-reachable]] and [[authored-but-unwired-is-the-bottleneck]]:
 * prove it at the layer the USER experiences, never at a value the test itself
 * supplied. So NOTHING below builds its own panel, its own input row or its own
 * send path.
 *
 * ── FOUR ARMS, BECAUSE FOUR DIFFERENT THINGS CAN BREAK ──────────────────────
 *
 *   ARM A — ⭐ THE REAL PANEL, RENDERED. `createAIPanel()` is called and the
 *           resulting DOM is queried for the attach control and the file input.
 *           This is the arm the shipped defect would have failed: it asks the
 *           surface the founder opens, not a fixture.
 *   ARM B — the ATTACHMENT MODULE loads standalone and exports the exact five
 *           functions `AIPanel` imports. A REAL import: a module-load throw, a
 *           circular barrel or a renamed export fails here
 *           ([[scc-no-barrel-access-at-module-load]]) — the class of defect no
 *           source grep can see.
 *   ARM C — ⭐⭐ THE JOIN, and it is the arm that would catch the real bug. A
 *           button, a decoder and a resolver can each be perfectly correct while
 *           nothing carries the photograph BETWEEN them. This reads the source of
 *           the two files that must agree and pins the chain
 *           consume → tryHandleZeroToken(turn) → buildContext(turn) → photoFacade.
 *           Source-level, and deliberately labelled as such — a text guard can
 *           pass while the runtime is broken (L-3013). Arms A and B cover that
 *           gap; C covers what they cannot see, namely whether anything JOINS.
 *   ARM D — the REFUSALS reach the transcript. Every one of C74's four cases has
 *           a named message; this pins that they are wired to a `say`, not to a
 *           `console.warn` — a silent refusal and a dead feature are the same
 *           thing to the user.
 *
 * ⚠ WHAT THIS DOES NOT ASSERT, said plainly rather than implied away:
 *   • It does not decode a real JPEG. happy-dom has no `createImageBitmap` and no
 *     2-D canvas, so the decode leg is exercised only by its REFUSAL path here.
 *     The decode itself is the Façade Reconstruction panel's shipped code
 *     (`facadeRaster.ts`) and is not re-proven.
 *   • It does not run `reconstructFacade` on a photograph. L-11001 STANDS: the
 *     engine has never been pointed at a real photo, and no test in this repo
 *     changes that.
 *   • It does not build a building. The generation leg is the seam's, and it is
 *     proven where the seam is proven.
 *
 * ⚠ ARM A'S TIMEOUT IS A BUDGET, NOT FLAKE TOLERANCE. `createAIPanel` drags in the
 * command registry, the batch catalogue and twenty-odd triggers; a real import of
 * that graph in this harness is legitimately slower than vitest's 10 s default.
 * Named here so nobody later reads a bare number as permission to retry a hang.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const AI_PANEL = resolve('apps/editor/src/ui/ai/AIPanel.ts');
const CHAT_BRIDGE = resolve('apps/editor/src/ui/ai/ZeroTokenChatBridge.ts');

const ARM_A_TIMEOUT_MS = 180_000;

/**
 * Source with comments removed, for the NEGATIVE assertions in arm C.
 *
 * ⚠ THIS EXISTS BECAUSE THE FIRST VERSION OF THOSE ASSERTIONS FAILED ON THE
 * FILE'S OWN DOCUMENTATION. `chatFacadeAttachment.ts` explains at length why the
 * engine's PNG-only limit does not reach it — naming `createImageBitmap` and
 * `getImageData` to do so — and a `not.toContain` over the raw text therefore
 * reported a second decoder that does not exist.
 *
 * ⛔ THE WRONG FIX WAS AVAILABLE AND IS WORTH NAMING: delete the assertion, or
 * water it down until it passes. Both would have left a real guard weaker than it
 * looks. Asserting over CODE is what the guard always meant.
 */
function codeOnly(src: string): string {
    return src
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .split('\n')
        .map((l) => l.replace(/(^|\s)\/\/.*$/, ''))
        .join('\n');
}

describe('§CHAT-ATTACH-REACHABILITY · ARM A — the REAL chat panel renders the attach control', () => {
    let panel: HTMLElement;

    beforeAll(async () => {
        // ⭐ THE REAL FACTORY. Not a fixture, not a rebuilt input row.
        const mod = await import('../AIPanel');
        panel = mod.createAIPanel(null);
    }, ARM_A_TIMEOUT_MS);

    it('renders a paperclip button the founder can click', () => {
        const btn = panel.querySelector('.ai-chat-attach-btn');
        expect(btn).not.toBeNull();
        expect(btn!.tagName.toLowerCase()).toBe('button');
        // It must be announceable — a bare 📎 glyph is not a name.
        expect(btn!.getAttribute('aria-label')).toBeTruthy();
    });

    it('renders a REAL file input that accepts images — including HEIC', () => {
        const input = panel.querySelector('input[type="file"]') as HTMLInputElement | null;
        expect(input).not.toBeNull();
        // ⚠ HEIC explicitly, not only `image/*`: several mobile browsers do not
        // match a camera-roll HEIC against the wildcard, and the founder would
        // open the picker and find his own photographs greyed out.
        expect(input!.accept).toContain('image/');
        expect(input!.accept.toLowerCase()).toContain('heic');
    });

    it('places the attach control in the SAME row as the input and Send', () => {
        // Not merely "somewhere in the panel" — beside the thing it affects.
        const row = panel.querySelector('.ai-chat-input-row');
        expect(row).not.toBeNull();
        expect(row!.querySelector('.ai-chat-attach-btn')).not.toBeNull();
        expect(row!.querySelector('.ai-chat-input')).not.toBeNull();
        expect(row!.querySelector('.ai-chat-send-btn')).not.toBeNull();
    });

    it('renders the pending-attachment strip ABOVE the input, hidden until used', () => {
        const strip = panel.querySelector('.ai-chat-attach-row') as HTMLElement | null;
        expect(strip).not.toBeNull();
        // ⛔ Hidden by default: the chat must look EXACTLY as it does today until a
        // file is picked. A permanently visible empty strip is a graphics change
        // nobody asked for.
        expect(strip!.style.display).toBe('none');
        // Ordering: the strip precedes the input row in document order.
        const kids = Array.from(panel.children);
        const stripIdx = kids.indexOf(strip!);
        const rowIdx = kids.indexOf(panel.querySelector('.ai-chat-input-row')!);
        expect(stripIdx).toBeGreaterThan(-1);
        expect(rowIdx).toBeGreaterThan(stripIdx);
    });
});

describe('§CHAT-ATTACH-REACHABILITY · ARM B — the attachment module loads and exports its API', () => {
    it('exposes the exact functions AIPanel imports', async () => {
        const mod = await import('../chatFacadeAttachment');
        expect(typeof mod.setChatAttachment).toBe('function');
        expect(typeof mod.getChatAttachment).toBe('function');
        expect(typeof mod.clearChatAttachment).toBe('function');
        expect(typeof mod.consumeChatAttachment).toBe('function');
        expect(typeof mod.describeAttachment).toBe('function');
    }, ARM_A_TIMEOUT_MS);

    it('starts with nothing attached, and clearing nothing is a no-op', async () => {
        const mod = await import('../chatFacadeAttachment');
        expect(mod.getChatAttachment()).toBeNull();
        expect(() => mod.clearChatAttachment()).not.toThrow();
        expect(mod.getChatAttachment()).toBeNull();
    });

    it('consuming with nothing attached returns null — the pre-feature behaviour', async () => {
        // ⭐ This is what guarantees a typed-only sentence is untouched by any of
        // this: no attachment ⇒ no turn facts ⇒ byte-for-byte today's context.
        const mod = await import('../chatFacadeAttachment');
        await expect(mod.consumeChatAttachment()).resolves.toBeNull();
    });

    it('⛔ REFUSES a non-image BY NAME instead of throwing or returning empty', async () => {
        const mod = await import('../chatFacadeAttachment');
        const pdf = new File([new Uint8Array([1, 2, 3])], 'site-plan.pdf', { type: 'application/pdf' });
        const res = await mod.setChatAttachment(pdf);
        expect(res.ok).toBe(false);
        if (res.ok) throw new Error('unreachable');
        // C74 — the refusal NAMES the file, its type, and what to do instead.
        expect(res.reason).toContain('site-plan.pdf');
        expect(res.reason).toContain('application/pdf');
        expect(res.reason).toContain('JPEG');
        // ⛔ And nothing was attached, so the next message is unaffected.
        expect(mod.getChatAttachment()).toBeNull();
    });

    it('⭐ does NOT refuse a JPEG on format grounds — the browser decodes it', async () => {
        // THE SINGLE MOST LIKELY THING TO HAPPEN ON HIS FIRST TRY: he photographs a
        // building with a phone. The ENGINE's decoder is PNG-only, but that limit
        // never reaches this path — `createImageBitmap` handles JPEG/HEIC natively.
        // happy-dom has no `createImageBitmap`, so the decode fails HERE for a
        // DIFFERENT reason, and this asserts the distinction: whatever the reason
        // is, it must not be "JPEG is not supported".
        const mod = await import('../chatFacadeAttachment');
        const jpg = new File([new Uint8Array([0xff, 0xd8, 0xff])], 'facade.jpg', { type: 'image/jpeg' });
        const res = await mod.setChatAttachment(jpg);
        if (!res.ok) {
            expect(res.reason).not.toContain('is not an image file');
            expect(res.reason).not.toMatch(/png[- ]only/i);
        }
        mod.clearChatAttachment();
    });
});

describe('§CHAT-ATTACH-REACHABILITY · ARM C — ⭐⭐ THE JOIN: the photo reaches the resolver', () => {
    // SOURCE-LEVEL. This cannot tell you the feature works; it tells you the four
    // links in the chain exist and name the same things. Arms A and B cover the
    // runtime; this covers what they structurally cannot see.
    const panelSrc = readFileSync(AI_PANEL, 'utf8');
    const bridgeSrc = readFileSync(CHAT_BRIDGE, 'utf8');

    it('LINK 1 — the send path CONSUMES the attachment (so it cannot ride the next message)', () => {
        expect(panelSrc).toContain('consumeChatAttachment()');
        const send = panelSrc.slice(panelSrc.indexOf('const _executeSend'));
        expect(send).toContain('consumeChatAttachment');
    });

    it('LINK 2 — the consumed brief is passed to tryHandleZeroToken as turn facts', () => {
        const send = panelSrc.slice(panelSrc.indexOf('const _executeSend'));
        expect(send).toContain('turn = { photoFacade:');
        expect(send).toContain('}, turn);');
    });

    it('LINK 3 — the bridge threads turn facts into buildContext', () => {
        expect(bridgeSrc).toContain('async function buildContext(turn?: ChatTurnFacts)');
        expect(bridgeSrc).toContain('ctx = await buildContext(turn);');
    });

    it('LINK 4 — buildContext writes photoFacade onto the ResolverContext', () => {
        // ⭐ The last link. Without it the brief is carried the whole way and
        // dropped one line from its destination — the failure that looks most
        // like success in a code review.
        expect(bridgeSrc).toContain('turn?.photoFacade !== undefined ? { photoFacade: turn.photoFacade } : {}');
    });

    it('the brief is produced by the SHARED L2 mapper, not a second mapping', () => {
        // C108 §1.3 / L-11020: there is exactly ONE IR→brief mapping in the repo.
        // A copy in the UI would drift from the thresholds it declares.
        const attachSrc = readFileSync(resolve('apps/editor/src/ui/ai/chatFacadeAttachment.ts'), 'utf8');
        expect(attachSrc).toContain('mapFacadeIRToPhotoBrief');
        expect(attachSrc).toContain("from '@pryzm/ai-host'");
        // ⛔ And it declares no threshold of its own.
        expect(codeOnly(attachSrc)).not.toMatch(/CONFIDENCE_FLOOR\s*=/);
    });

    it('the decode is the SHARED browser decoder, not a second one', () => {
        const attachSrc = readFileSync(resolve('apps/editor/src/ui/ai/chatFacadeAttachment.ts'), 'utf8');
        const code = codeOnly(attachSrc);
        expect(code).toContain('decodeImageFile');
        expect(code).toContain("from '../facade/facadeRaster.js'");
        // ⛔ No SECOND decoder. Asserted on the two things a real decode CANNOT
        // avoid — a canvas and a `getImageData` — rather than on the word
        // `createImageBitmap`, which the header legitimately names when explaining
        // why the engine's PNG-only limit does not reach this path. Pinning the
        // WORD would have failed on its own documentation, which is how a guard
        // ends up being weakened instead of fixed.
        expect(code).not.toContain('getImageData');
        expect(code).not.toContain('createImageBitmap');
        expect(code).not.toContain("createElement('canvas')");
    });

    it('⛔ P2 — nothing in this path imports THREE', () => {
        const attachSrc = readFileSync(resolve('apps/editor/src/ui/ai/chatFacadeAttachment.ts'), 'utf8');
        expect(codeOnly(attachSrc)).not.toContain('import * as THREE');
    });
});

describe('§CHAT-ATTACH-REACHABILITY · ARM D — every refusal reaches the TRANSCRIPT', () => {
    const panelSrc = readFileSync(AI_PANEL, 'utf8');
    const send = panelSrc.slice(panelSrc.indexOf('const _executeSend'));

    it('an unreadable image says so and creates NOTHING', () => {
        expect(send).toContain('I could not read that image');
        expect(send).toContain('Nothing was created.');
        // On the transcript, not the console.
        expect(send).toMatch(/addMessage\(\s*\n?\s*'assistant',\s*\n?\s*`I could not read that image/);
    });

    it('a sentence naming an image with none attached ASKS instead of building', () => {
        expect(send).toContain('missingImageRefusal(ref.phrase)');
        expect(send).toContain("addMessage('assistant', missingImageRefusal(ref.phrase))");
        // And it returns — it must not fall through and generate a plain block.
        const idx = send.indexOf('missingImageRefusal(ref.phrase)');
        expect(send.slice(idx, idx + 200)).toContain('return;');
    });

    it('⭐ a photo that nothing used is SAID, not silently discarded', () => {
        // The turn falls through to the planner and the LLM, neither of which
        // carries the façade brief. Silence here consumes his photograph and
        // answers as though he never attached one.
        expect(send).toContain('I read that photo, but I did not understand this sentence');
    });

    it('a multi-file drop names which one was taken', () => {
        expect(panelSrc).toContain('I read one façade per message');
    });

    it('⛔ NO REFUSAL IS A BARE console.warn — the user must be able to see it', () => {
        // Each of the four cases above resolves to an `addMessage`. This pins the
        // count so a future edit cannot quietly downgrade one to a console line.
        const addMessages = (send.match(/addMessage\(/g) ?? []).length;
        expect(addMessages).toBeGreaterThanOrEqual(4);
    });
});
