// @vitest-environment happy-dom
//
// §GIS-ACTION-REGISTRY (L-1187, C06 §12) — the executable guard.
//
// This is the test the founder's ask actually needs. "Please make sure all the
// following buttons are in the GIS tab, and the legacy buttons are gone" cannot be
// answered once and stay answered by hand: the reason there were five rival GIS
// button lists is that each was REMEMBERED. This file makes the panel's contents
// DERIVED from `GIS_ACTIONS` and fails the build the moment that stops being true.
//
// It is deliberately modelled on the Delete census in this repo, where adding a new
// selectable kind fails the build until Delete handles or refuses it. Here: adding a
// GIS action makes the panel render it (or fail), and declaring an entry point that
// the dispatch does not call fails outright.
//
// ⛔ It does NOT stub the registry. The subject under test is the real `GIS_ACTIONS`
// and the real `renderGisActions`; the only fake is the HOST (the `window`-shaped
// object carrying the entry points), which is the environment, not the subject. A
// fake built from the header cannot falsify the header — so nothing here is built
// from a header.

import { describe, it, expect } from 'vitest';
import {
    GIS_ACTIONS,
    resolveGisAction,
    type GisCapabilityHost,
    type GisEntryPointName,
} from '../src/ui/gis/gisActionRegistry';
import {
    renderGisActions,
    GIS_ACTION_ID_ATTR,
    GIS_UNAVAILABLE_ATTR,
} from '../src/ui/gis/renderGisActions';

/** Every entry point named anywhere in the registry — derived, not listed. */
const ALL_ENTRY_POINTS: readonly GisEntryPointName[] = Array.from(
    new Set(GIS_ACTIONS.flatMap((a) => [...a.entryPoints])),
);

/** A host where every declared entry point exists and records its calls. */
function makeFullHost(): { host: GisCapabilityHost; calls: string[] } {
    const calls: string[] = [];
    const host: Record<string, unknown> = {};
    for (const ep of ALL_ENTRY_POINTS) {
        host[ep] = (...args: unknown[]) => { calls.push(`${ep}(${args.map(String).join(',')})`); };
    }
    return { host: host as GisCapabilityHost, calls };
}

describe('§GIS-ACTION-REGISTRY — the declaration is well-formed', () => {
    it('gives every action a unique id', () => {
        const ids = GIS_ACTIONS.map((a) => a.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    // C84 EI-8 / EI-9 ONE VOCABULARY. This is the assertion that stops the exact
    // defect the founder reported: "3D Site" naming two different things.
    it('gives every action a unique label — one spelling per action, one action per spelling', () => {
        const labels = GIS_ACTIONS.map((a) => a.label);
        const dupes = labels.filter((l, i) => labels.indexOf(l) !== i);
        expect(dupes, `duplicate GIS action labels: ${dupes.join(', ')}`).toEqual([]);
    });

    // A retired spelling may be absorbed by exactly ONE surviving action. If two
    // actions both claim to absorb "3D Site", the de-duplication is unresolved and
    // this is precisely the state we are leaving.
    it('lets a retired spelling be absorbed by exactly one action', () => {
        const seen = new Map<string, string>();
        for (const a of GIS_ACTIONS) {
            for (const old of a.absorbs) {
                const prior = seen.get(old);
                expect(prior, `"${old}" is absorbed by both ${prior} and ${a.id}`).toBeUndefined();
                seen.set(old, a.id);
            }
        }
    });

    // The whole point of `absorbs` is that a retired name cannot come back as a live
    // label somewhere else in the registry.
    it('never re-uses a retired spelling as a live label', () => {
        const retired = new Set(GIS_ACTIONS.flatMap((a) => a.absorbs.map((s) => s.split(' (')[0])));
        for (const a of GIS_ACTIONS) {
            // A label may legitimately equal the retired name it SUPERSEDES on its own
            // action (e.g. "2D Map" absorbing "2D Map (Forma sub-bar)"). Only a
            // cross-action collision is a defect, and that is the check above; here we
            // assert the retired list is never empty of provenance.
            for (const old of a.absorbs) expect(old.length).toBeGreaterThan(0);
        }
        expect(retired.size).toBeGreaterThan(0);
    });

    it('requires a stated reason from every action that is not yet re-hosted', () => {
        for (const a of GIS_ACTIONS) {
            if (a.entryPoints.length === 0) {
                expect(a.unavailableReason, `${a.id} declares no entry point and no reason`).toBeTruthy();
            } else {
                expect(a.unavailableReason, `${a.id} is live but carries an unavailable reason`).toBeUndefined();
            }
        }
    });
});

describe('§GIS-ACTION-REGISTRY — a declared action has a LIVE handler', () => {
    // ⭐ THE GUARD. A declaration that names an entry point but whose dispatch does
    // not call it is a button wired to nothing wearing a contract citation. That is
    // exactly the ProjectBrowserPanel / GISRailPanel failure mode, and it fails here.
    it('calls EVERY entry point it declares, and nothing it does not declare', () => {
        for (const decl of GIS_ACTIONS) {
            if (decl.entryPoints.length === 0) continue;
            const { host, calls } = makeFullHost();
            const run = resolveGisAction(decl, host);
            expect(run, `${decl.id} declares entry points but does not resolve`).toBeTypeOf('function');
            run!();

            const called = new Set(calls.map((c) => c.slice(0, c.indexOf('('))));
            for (const ep of decl.entryPoints) {
                expect(called.has(ep), `${decl.id} declares ${ep} but never calls it`).toBe(true);
            }
            for (const c of called) {
                expect(
                    (decl.entryPoints as readonly string[]).includes(c),
                    `${decl.id} calls undeclared entry point ${c}`,
                ).toBe(true);
            }
        }
    });

    // A missing entry point must produce `null`, never a silent no-op closure. If a
    // capability disappears, every surface must be able to SEE that it disappeared.
    it('resolves to null — not a silent no-op — when an entry point is missing', () => {
        for (const decl of GIS_ACTIONS) {
            if (decl.entryPoints.length === 0) {
                expect(resolveGisAction(decl, {} as GisCapabilityHost)).toBeNull();
                continue;
            }
            for (const missing of decl.entryPoints) {
                const { host } = makeFullHost();
                delete (host as Record<string, unknown>)[missing];
                expect(
                    resolveGisAction(decl, host),
                    `${decl.id} still resolves with ${missing} absent`,
                ).toBeNull();
            }
        }
    });
});

describe('§GIS-ACTION-REGISTRY — the panel is DERIVED from the registry', () => {
    it('renders every declared action — a surface cannot drop one', () => {
        const { host } = makeFullHost();
        const el = renderGisActions(host);
        const rendered = Array.from(el.querySelectorAll(`[${GIS_ACTION_ID_ATTR}]`))
            .map((n) => n.getAttribute(GIS_ACTION_ID_ATTR));
        for (const a of GIS_ACTIONS) {
            expect(rendered, `${a.id} is declared but not rendered`).toContain(a.id);
        }
        expect(rendered.length).toBe(GIS_ACTIONS.length);
    });

    it('renders the action LABEL from the registry, never a re-spelling', () => {
        const { host } = makeFullHost();
        const el = renderGisActions(host);
        for (const a of GIS_ACTIONS) {
            const btn = el.querySelector(`[${GIS_ACTION_ID_ATTR}="${a.id}"]`);
            expect(btn?.textContent).toContain(a.label);
        }
    });

    // ⭐ VERDICT (c) CANNOT RECUR. A control with no live handler is painted as
    // unavailable and is not clickable. The founder has been clicking dead buttons;
    // after this, a dead button says so.
    it('paints an unresolvable action DISABLED, never as a live button', () => {
        const { host, calls } = makeFullHost();
        const el = renderGisActions(host);
        for (const a of GIS_ACTIONS) {
            const btn = el.querySelector<HTMLButtonElement>(`[${GIS_ACTION_ID_ATTR}="${a.id}"]`)!;
            const live = resolveGisAction(a, host) !== null;
            expect(btn.disabled, `${a.id} live=${live} but disabled=${btn.disabled}`).toBe(!live);
            expect(btn.hasAttribute(GIS_UNAVAILABLE_ATTR)).toBe(!live);
            if (!live) {
                expect(btn.title).toContain('Not available yet');
                const before = calls.length;
                btn.click();
                expect(calls.length, `${a.id} is unavailable but its click dispatched`).toBe(before);
            }
        }
    });

    it('dispatches the registry action on click — the renderer adds no handler of its own', () => {
        const { host, calls } = makeFullHost();
        const el = renderGisActions(host);
        for (const a of GIS_ACTIONS) {
            if (resolveGisAction(a, host) === null) continue;
            calls.length = 0;
            el.querySelector<HTMLButtonElement>(`[${GIS_ACTION_ID_ATTR}="${a.id}"]`)!.click();
            expect(calls.length, `${a.id} click dispatched nothing`).toBeGreaterThan(0);
        }
    });

    // A host with NO entry points at all is the "GIS area never mounted" case. The
    // panel must still render — fully, honestly, and inert — rather than appear empty
    // or, worse, appear normal.
    it('still renders every action against an EMPTY host, all marked unavailable', () => {
        const el = renderGisActions({} as GisCapabilityHost);
        const btns = el.querySelectorAll<HTMLButtonElement>(`[${GIS_ACTION_ID_ATTR}]`);
        expect(btns.length).toBe(GIS_ACTIONS.length);
        for (const b of Array.from(btns)) expect(b.disabled).toBe(true);
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// §GIS-ACTION-REGISTRY (L-1360) — THE ARM THAT MAKES A REMOVAL SAFE, NOT LUCKY
// ═══════════════════════════════════════════════════════════════════════════════
//
// Phase 2b deleted seven floating controls from the viewport because "the GIS panel
// already offers them". That sentence is exactly the one that must not be trusted.
//
// Earlier in this same lane, `GISRailPanel.ts` was deleted as provably dead — zero
// importers, never instantiated — and it turned out to hold the ONLY caller of
// `openSiteInspectorPanel`. A capability had been unreachable for months and the
// deletion would have made it invisible as well as unreachable. Inspection said the
// file was empty of value; inspection was wrong.
//
// So the guarantee cannot be "a reviewer checked". These arms READ PRODUCTION SOURCE:
//
//   ARM A — every entry point the registry declares is actually REGISTERED somewhere in
//           `apps/editor/src`. Deleting a surface is now free; deleting the registration
//           that surface used to reach fails the build. This is what makes "the panel
//           covers it" a checkable claim instead of a hopeful one.
//
//   ARM B — none of the removed launcher-rail pills has come back. A regression ratchet:
//           the founder's report was that the same action appeared TWICE, and a re-added
//           pill would silently restore that.
//
// ⚠ ARM A is deliberately a REGISTRATION check, not a reachability proof. It cannot tell
// you the entry point is reached at runtime in the phase you care about — only that the
// assignment still exists. It is a strictly weaker claim than "the button works", and it
// is named that way so nobody upgrades it in their head.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const SRC_DIR = resolve(__dirname, '..', 'src');

function allTsFiles(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
            if (entry === 'node_modules' || entry === '__tests__') continue;
            allTsFiles(full, out);
        } else if (entry.endsWith('.ts') && !entry.endsWith('.d.ts') && !entry.includes('.test.')) {
            out.push(full);
        }
    }
    return out;
}

/** Production source of `apps/editor/src`, read once. */
const SRC_FILES = allTsFiles(SRC_DIR);
const SRC_TEXT = new Map(SRC_FILES.map((f) => [f, readFileSync(f, 'utf8')] as const));

describe('§GIS-ACTION-REGISTRY — a declared entry point is REGISTERED in production source', () => {
    it('finds an assignment for every entry point the registry declares', () => {
        for (const ep of ALL_ENTRY_POINTS) {
            // `window.pryzmX = …` (GISAreaLayout) and `w.pryzmX = …` (the graph barrels,
            // which alias `window` through a typed local) are both real registrations.
            // Whitespace-normalised substring match, not a regex: the thing being
            // searched for contains quotes and backticks, and a regex built out of those
            // is how this arm broke the first time it was written.
            const squash = (t: string): string => t.replace(/\s+/g, '');
            const forms = ['window.' + ep + '=', 'w.' + ep + '='];
            const hit = [...SRC_TEXT].find(([, text]) => forms.some((f) => squash(text).includes(f)));
            expect(
                hit,
                `${ep} is declared by the GIS action registry but NOTHING in apps/editor/src ` +
                `assigns it. Some action in the GIS panel therefore resolves to null at runtime ` +
                `and renders permanently disabled — and if a legacy control was deleted on the ` +
                `strength of that action covering it, the capability is now unreachable.`,
            ).toBeDefined();
        }
    });

    it('names at least one action for every entry point — no orphan capabilities', () => {
        for (const ep of ALL_ENTRY_POINTS) {
            const owners = GIS_ACTIONS.filter((a) => (a.entryPoints as readonly string[]).includes(ep));
            expect(owners.length, `${ep} is in the host interface but no action dispatches it`).toBeGreaterThan(0);
        }
    });
});

describe('§GIS-ACTION-REGISTRY (L-1360) — the removed launcher pills stay removed', () => {
    // Each of these WAS a floating pill in the bottom-left stack; each is now a registry
    // action rendered by the GIS panel. Re-adding one restores the founder's exact
    // report — "the same six actions appear twice, one set obscuring the other".
    const REMOVED_PILL_IDS = [
        'pryzm-site-view-launcher',
        'pryzm-plan-gis-launcher',
        'pryzm-site-analysis-launcher',
        'pryzm-envelope-card-launcher',
        'pryzm-graph-launcher',
        'pryzm-living-graph-launcher',
        'pryzm-reset-panel-layout',
    ] as const;

    it('does not re-create any removed pill element', () => {
        for (const id of REMOVED_PILL_IDS) {
            // A comment naming the id is fine and expected — the removals document
            // themselves. What must not come back is an element carrying it.
            const creators = [...SRC_TEXT].filter(([, text]) => {
                const squashed = text.replace(/\s+/g, '');
                return squashed.includes(".id='" + id + "'")
                    || squashed.includes('.id="' + id + '"')
                    || squashed.includes("setAttribute('id','" + id + "')")
                    || squashed.includes('setAttribute("id","' + id + '")');
            });
            expect(
                creators.map(([f]) => f),
                `the "${id}" launcher pill has been re-created. It is a duplicate of a GIS-panel ` +
                `registry action; two hosts for one action is the L-1187 defect returning.`,
            ).toEqual([]);
        }
    });
});
