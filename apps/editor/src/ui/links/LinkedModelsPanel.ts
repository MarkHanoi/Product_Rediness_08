/**
 * LinkedModelsPanel — the surface where a user LINKS ANOTHER PROJECT (ADR-0346).
 *
 * ── WHERE THIS LIVES, AND WHY ────────────────────────────────────────────────
 *
 * Reached from the Project Browser's GIS/Site tab, beside "Site Inspector".
 * Two candidate homes were considered and this one satisfies both at once:
 *
 *   · The PARCEL is the anchor. Everything a link depends on — the site origin,
 *     the LTP-ENU frame, the shared datum — is authored in that tab, and the C83
 *     verdict this panel shows is a statement ABOUT that datum. A user who has
 *     just set the site is one click from linking against it.
 *   · The PROJECT BROWSER is where projects are. "Link another project" belongs
 *     next to the list of projects, not buried in a modelling ribbon.
 *
 * It is a plain button rather than a registry action for the reason recorded at
 * `ProjectBrowserPanel.ts` §GIS-ACTION-REGISTRY (L-1187): the registry resolves
 * `window.pryzm*` entry points, and this dispatch is a MODULE export. That
 * asymmetry is known residue, not a new invention.
 *
 * ⚠ The comment at that call site also records why reachability is not a detail
 * here: `openSiteInspectorPanel` had exactly one caller, in a class never
 * instantiated, so a fully-built panel was unreachable for months. This panel is
 * wired into a tab that renders today, and a test asserts the button exists —
 * [[authored-but-unwired-is-the-bottleneck]] and [[committed-is-not-reachable]].
 *
 * ── WHAT IT REFUSES TO DO ────────────────────────────────────────────────────
 *
 * · It writes NO store. Every mutation is `runtime.bus.executeCommand` on one of
 *   the four link verbs (P6). The store is written by the handler, never here.
 * · It touches NO THREE object and flips NO `.visible` (P7 / C25). Visibility is
 *   the persisted `display` INTENT on the ref, changed via `link.setDisplay`; the
 *   renderer mounts or unmounts in response. A hidden link is not an invisible
 *   subtree — it is no subtree, which is why hiding is a real performance answer.
 * · It computes NO placement of its own. `linkedModelsViewModel` renders the same
 *   `resolveLinkAnchor` the handler validates with, so this panel cannot offer a
 *   link the command will then refuse.
 *
 * ── AND WHAT HAPPENS WHEN YOU CLICK A LINKED MODEL ──────────────────────────
 *
 * Nothing — deliberately, at four independent doors (ADR-0346 D8, and the four
 * opt-outs enumerated in `LinkedModelSceneRenderer`'s header). The click passes
 * through to your own geometry behind it. That is stated in words in this panel
 * rather than left for the user to discover, because silent inaction is
 * indistinguishable from a broken tool.
 *
 * Contracts: C13 §3.13, C82 (panel capability surface), C83, C25/C09 (visibility
 * intent), C74. Issue-log L-3157.
 */

// The `/types` specifier, matching `ProjectBrowserPanel.ts:130` — the caller that
// hands this panel its runtime. Using the barrel here instead would make the two
// nominally different types and push a cast into the one call site that matters.
import type { PryzmRuntime } from '@pryzm/runtime-composer/types';
import type { LinkGeoOrigin, LinkPin, LinkedModelRef } from '@pryzm/schemas';
import { makeDraggable } from '../makeDraggable';
import { resolveActiveProjectId } from '../site/siteDispatch';
import {
    LINKED_MODELS_CHANGED_EVENT,
    linkedModelStore,
} from '../../engine/links/LinkedModelStore';
import { linkedModelController } from '../../engine/links/linkedModelController';
import {
    listLinkableProjects,
    listSourceVersions,
    probeLinkSource,
    type LinkableProject,
    type LinkableVersion,
    type LinkSourceProbe,
} from '../../engine/links/linkSourceGateway';
import {
    presentLinkAnchor,
    presentLinkBudget,
    presentLinkRow,
    type LinkAnchorPresentation,
} from './linkedModelsViewModel';

// ── Brand ────────────────────────────────────────────────────────────────────
//
// PRYZM is white + purple, never black. Every colour below is either the verified
// token or a tint of the one brand accent. ⚠ Only tokens CONFIRMED PRESENT in
// `styles/tokens.ts` are referenced — `--app-accent` (#6600FF), `--app-panel-bg`,
// `--app-border`, `--app-text`, `--app-text-muted`, `--app-font`, `--app-bg`.
// `--app-surface` does NOT exist and is deliberately not used: nine phantom
// tokens rendered as neon earlier today (L-3013), so each one here was grepped
// before it was written.
const VIOLET = '#6600FF';
const VIOLET_SOFT = '#f3eeff';
const VIOLET_EDGE = '#d9c8ff';
/** Warning tone for an INADVISABLE verdict — amber, never red-on-black. */
const WARN_BG = '#fff6e6';
const WARN_EDGE = '#f0c987';
const WARN_TEXT = '#8a5a00';
/** Refusal tone — a deep plum that reads as "stop" while staying in brand. */
const STOP_BG = '#fdeef4';
const STOP_EDGE = '#e9b7cc';
const STOP_TEXT = '#8c2350';

const PANEL_ID = 'pryzm-linked-models-panel';

type Runtime = PryzmRuntime | null;

let _panel: HTMLElement | null = null;
let _runtime: Runtime = null;
let _unsubStatus: (() => void) | null = null;
let _undrag: (() => void) | null = null;
let _onStoreChange: (() => void) | null = null;

/** Which view the panel body is showing. The create flow is a VIEW, not a modal. */
type View = { kind: 'list' } | { kind: 'create'; step: CreateStep };

interface CreateStep {
    projects: LinkableProject[] | null;
    chosen: LinkableProject | null;
    versions: LinkableVersion[] | null;
    /** `null` = follow latest. A version row = pinned. Default is PINNED (D5). */
    chosenVersion: LinkableVersion | null;
    probe: LinkSourceProbe | null;
    anchor: LinkAnchorPresentation | null;
    busy: boolean;
    error: string | null;
    /** Hand-placed offsets, used when the C83 verdict is IMPOSSIBLE or overridden. */
    manual: { east: number; north: number; elevation: number; rotationDeg: number };
    manualMode: boolean;
}

let _view: View = { kind: 'list' };

function freshCreateStep(): CreateStep {
    return {
        projects: null, chosen: null, versions: null, chosenVersion: null,
        probe: null, anchor: null, busy: false, error: null,
        manual: { east: 0, north: 0, elevation: 0, rotationDeg: 0 },
        manualMode: false,
    };
}

// ── Small DOM helpers (textContent everywhere — no innerHTML for data) ───────

function el(tag: string, css: string, text?: string): HTMLElement {
    const n = document.createElement(tag);
    n.style.cssText = css;
    // §XSS — every dynamic value in this panel is a project name, a version label
    // or a server sentence. All of them arrive as `textContent`, never as markup.
    if (text !== undefined) n.textContent = text;
    return n;
}

function button(label: string, kind: 'primary' | 'ghost' | 'quiet', onClick: () => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    const base = [
        'padding:7px 12px', 'border-radius:7px', 'cursor:pointer',
        'font-family:var(--app-font)', 'font-size:11.5px', 'font-weight:600',
        'transition:background .12s,border-color .12s,color .12s', 'white-space:nowrap',
    ];
    if (kind === 'primary') {
        b.style.cssText = [...base, `background:${VIOLET}`, 'color:#ffffff', `border:1px solid ${VIOLET}`].join(';');
        b.addEventListener('mouseenter', () => { b.style.background = '#5200cc'; });
        b.addEventListener('mouseleave', () => { b.style.background = VIOLET; });
    } else if (kind === 'ghost') {
        b.style.cssText = [...base, 'background:var(--app-panel-bg,#fff)', `color:${VIOLET}`, `border:1px solid ${VIOLET_EDGE}`].join(';');
        b.addEventListener('mouseenter', () => { b.style.background = VIOLET_SOFT; });
        b.addEventListener('mouseleave', () => { b.style.background = 'var(--app-panel-bg,#fff)'; });
    } else {
        b.style.cssText = [...base, 'background:transparent', 'color:var(--app-text-muted,#7a8aaa)', 'border:1px solid var(--app-border,#dde3f0)'].join(';');
        b.addEventListener('mouseenter', () => { b.style.color = VIOLET; b.style.borderColor = VIOLET_EDGE; });
        b.addEventListener('mouseleave', () => { b.style.color = 'var(--app-text-muted,#7a8aaa)'; b.style.borderColor = 'var(--app-border,#dde3f0)'; });
    }
    b.addEventListener('click', onClick);
    return b;
}

/**
 * A DISABLED control that states why (C82 §1.2).
 *
 * A button that dispatches into nothing is what that clause forbids; a control
 * that is visibly unavailable and names its reason is the legal form of "not yet",
 * and it is how `link.setDisplay`'s own §LINK-DETAILED-NOT-BUILT refusal reaches
 * the user without anyone having to click it to find out.
 */
function disabledButton(label: string, why: string): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.disabled = true;
    b.textContent = label;
    b.title = why;
    b.style.cssText = [
        'padding:7px 12px', 'border-radius:7px', 'cursor:not-allowed',
        'font-family:var(--app-font)', 'font-size:11.5px', 'font-weight:600',
        'background:var(--app-bg,#e8edf6)', 'color:var(--app-text-muted,#7a8aaa)',
        'border:1px dashed var(--app-border,#dde3f0)', 'white-space:nowrap',
    ].join(';');
    return b;
}

function notice(text: string, tone: 'info' | 'warn' | 'stop'): HTMLElement {
    const bg = tone === 'warn' ? WARN_BG : tone === 'stop' ? STOP_BG : VIOLET_SOFT;
    const edge = tone === 'warn' ? WARN_EDGE : tone === 'stop' ? STOP_EDGE : VIOLET_EDGE;
    const fg = tone === 'warn' ? WARN_TEXT : tone === 'stop' ? STOP_TEXT : VIOLET;
    return el('div', [
        `background:${bg}`, `border:1px solid ${edge}`, `color:${fg}`,
        'border-radius:8px', 'padding:9px 11px', 'font-size:11.5px',
        'line-height:1.5', 'font-family:var(--app-font)',
    ].join(';'), text);
}

// ── Runtime reads ────────────────────────────────────────────────────────────

/** The host project's site origin, or null when it has none (a C83 input). */
function hostOrigin(): LinkGeoOrigin | null {
    try {
        const loc = _runtime?.siteModelStore?.getLocation?.() as
            { latitude?: unknown; longitude?: unknown; elevationAsl?: unknown; trueNorth?: unknown } | null | undefined;
        if (loc == null) return null;
        const lat = loc.latitude;
        const lon = loc.longitude;
        if (typeof lat !== 'number' || typeof lon !== 'number') return null;
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
        // §CONTEXT-DATA-HONESTY — a site that was never geocoded reads 0/0 by schema
        // default, and 0/0 is the Atlantic. Treating it as a real origin would make
        // every link INADVISABLE against a fiction. Absent is reported as absent.
        if (lat === 0 && lon === 0) return null;
        return {
            latitude: lat,
            longitude: lon,
            elevationAsl: typeof loc.elevationAsl === 'number' ? loc.elevationAsl : 0,
            trueNorth: typeof loc.trueNorth === 'number' ? loc.trueNorth : 0,
        };
    } catch {
        return null;
    }
}

function activeProjectId(): string | null {
    try { return _runtime ? resolveActiveProjectId(_runtime) : null; } catch { return null; }
}

/**
 * Dispatch a link verb and return the refusal sentence, or null on success.
 *
 * `CommandBus` throws `CommandBusError` with `"<type>: canExecute rejected — <reason>"`
 * when `canExecute` says no (`CommandBus.ts:429-430`). The reason is the C83
 * sentence the handler refused with, so it is unwrapped and shown VERBATIM rather
 * than replaced with a generic failure — the whole point of the three-way verdict
 * is that the user is told which one they hit.
 */
function dispatch(type: string, payload: Record<string, unknown>): string | null {
    const bus = _runtime?.bus;
    if (bus == null) return 'The editor runtime is not ready yet.';
    try {
        (bus as { executeCommand: (t: string, p: unknown) => unknown }).executeCommand(type, payload);
        return null;
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        const split = msg.split('canExecute rejected — ');
        return split.length > 1 ? split[1]! : msg;
    }
}

// ── Rendering ────────────────────────────────────────────────────────────────

function render(): void {
    if (_panel == null) return;
    const body = _panel.querySelector<HTMLElement>('[data-lm-body]');
    if (body == null) return;
    body.replaceChildren();
    if (_view.kind === 'list') renderList(body);
    else renderCreate(body, _view.step);
}

function renderList(body: HTMLElement): void {
    const refs = linkedModelStore.getAll();
    const rows = refs.map(r => presentLinkRow(r, linkedModelController.getStatus(r.id)));

    body.appendChild(el('div', [
        'font-size:11px', 'color:var(--app-text-muted,#7a8aaa)',
        'font-family:var(--app-font)', 'padding:0 0 2px',
    ].join(';'), presentLinkBudget(rows, linkedModelController.totalDrawCalls())));

    if (refs.length === 0) {
        body.appendChild(notice(
            'A linked model is another PRYZM project shown read-only inside this one, '
            + 'anchored on the shared site datum. Link the podium into the tower, a '
            + 'neighbouring block, or last week’s option — to see it, measure to it and '
            + 'coordinate against it, without owning or editing it.',
            'info',
        ));
    }

    for (let i = 0; i < refs.length; i++) {
        body.appendChild(renderRow(refs[i]!, rows[i]!));
    }

    const actions = el('div', 'display:flex;gap:8px;padding-top:4px;');
    actions.appendChild(button('＋  Link a project…', 'primary', () => { void openCreate(); }));
    body.appendChild(actions);

    // The read-only contract, said out loud. A user who clicks a linked model and
    // sees nothing happen must not have to guess whether it is broken.
    body.appendChild(el('div', [
        'font-size:10.5px', 'color:var(--app-text-muted,#7a8aaa)',
        'font-family:var(--app-font)', 'line-height:1.5',
        'border-top:1px solid var(--app-border,#dde3f0)', 'padding-top:8px', 'margin-top:2px',
    ].join(';'),
        'Linked models are reference geometry. They cannot be selected, edited, moved or '
        + 'scheduled here, and clicking one passes through to your own model behind it. '
        + 'Nothing from a linked project is ever saved into this one — only the reference is.',
    ));
}

function renderRow(ref: LinkedModelRef, row: ReturnType<typeof presentLinkRow>): HTMLElement {
    const card = el('div', [
        'border:1px solid var(--app-border,#dde3f0)', 'border-radius:9px',
        'padding:10px 11px', 'background:var(--app-panel-bg,#fff)',
        'display:flex', 'flex-direction:column', 'gap:6px',
    ].join(';'));
    // A shown link gets the brand edge, so the panel and the viewport agree about
    // which links are actually on screen.
    if (row.tone === 'shown') card.style.borderColor = VIOLET_EDGE;

    const head = el('div', 'display:flex;align-items:center;gap:8px;');
    head.appendChild(el('div', [
        'font-size:12.5px', 'font-weight:650', 'color:var(--app-text,#1a2035)',
        'font-family:var(--app-font)', 'flex:1', 'overflow:hidden',
        'text-overflow:ellipsis', 'white-space:nowrap',
    ].join(';'), row.title));

    const chipTone = row.tone === 'shown'
        ? [VIOLET_SOFT, VIOLET_EDGE, VIOLET]
        : row.tone === 'refused'
            ? [STOP_BG, STOP_EDGE, STOP_TEXT]
            : ['var(--app-bg,#e8edf6)', 'var(--app-border,#dde3f0)', 'var(--app-text-muted,#7a8aaa)'];
    head.appendChild(el('span', [
        `background:${chipTone[0]}`, `border:1px solid ${chipTone[1]}`, `color:${chipTone[2]}`,
        'border-radius:20px', 'padding:2px 9px', 'font-size:9.5px', 'font-weight:700',
        'letter-spacing:.05em', 'font-family:var(--app-font)',
    ].join(';'), row.statusChip));
    card.appendChild(head);

    const meta = el('div', [
        'font-size:10.5px', 'color:var(--app-text-muted,#7a8aaa)',
        'font-family:var(--app-font)', 'line-height:1.6',
    ].join(';'));
    meta.appendChild(el('div', '', row.versionLine));
    meta.appendChild(el('div', '', row.anchorLine));
    meta.appendChild(el('div', '', row.costLine));
    card.appendChild(meta);

    if (row.reason !== null) card.appendChild(notice(row.reason, 'stop'));

    const bar = el('div', 'display:flex;gap:6px;flex-wrap:wrap;padding-top:2px;');

    // Visibility — the persisted display INTENT, never a THREE `.visible` flip (P7).
    bar.appendChild(button(row.isHidden ? 'Show' : 'Hide', 'ghost', () => {
        const err = dispatch('link.setDisplay', {
            linkId: ref.id, display: row.isHidden ? 'massing' : 'hidden',
        });
        if (err !== null) flash(err);
    }));

    // Full detail: DISABLED and stating its cost + why it is unavailable.
    bar.appendChild(disabledButton('Full detail', row.detailedCostLine));

    // Pin ⇄ latest. The choice is one click and always visible, per D5's rule that
    // an undeclared version choice is not defensible.
    if (ref.pin.mode === 'pinned') {
        bar.appendChild(button('Follow latest', 'quiet', () => {
            const err = dispatch('link.setPin', {
                linkId: ref.id, pin: { mode: 'latest', lastResolvedVersionId: null },
            });
            if (err !== null) flash(err);
        }));
    } else {
        bar.appendChild(button('Pin this version', 'quiet', () => {
            const status = linkedModelController.getStatus(ref.id);
            const vid = ref.pin.lastResolvedVersionId;
            if (vid == null) {
                // Refuse with the reason rather than pinning to a guess. Pinning to
                // "whatever we happen to be showing" when we do not know what that is
                // would silently freeze the link to an unnamed version.
                flash('This link has not resolved a version yet, so there is nothing to pin to. '
                    + 'Wait for it to resolve, then pin.');
                return;
            }
            const err = dispatch('link.setPin', {
                linkId: ref.id,
                pin: {
                    mode: 'pinned', versionId: vid,
                    versionLabel: status?.versionLabel ?? null,
                    pinnedAt: new Date().toISOString(),
                },
            });
            if (err !== null) flash(err);
        }));
    }

    bar.appendChild(button('Unlink', 'quiet', () => {
        const err = dispatch('link.remove', { linkId: ref.id });
        if (err !== null) flash(err);
    }));

    card.appendChild(bar);
    return card;
}

// ── The create flow ──────────────────────────────────────────────────────────

async function openCreate(): Promise<void> {
    const step = freshCreateStep();
    _view = { kind: 'create', step };
    render();
    step.projects = await listLinkableProjects(activeProjectId());
    render();
}

function renderCreate(body: HTMLElement, step: CreateStep): void {
    const back = el('div', 'display:flex;align-items:center;gap:8px;');
    back.appendChild(button('‹  Back', 'quiet', () => { _view = { kind: 'list' }; render(); }));
    back.appendChild(el('div', [
        'font-size:11.5px', 'font-weight:650', 'color:var(--app-text,#1a2035)',
        'font-family:var(--app-font)',
    ].join(';'), 'Link a project'));
    body.appendChild(back);

    if (step.error !== null) body.appendChild(notice(step.error, 'stop'));

    // ── Step 1 · which project ──────────────────────────────────────────────
    body.appendChild(sectionLabel('1 · Which project'));

    if (step.projects === null) {
        body.appendChild(el('div', mutedCss(), 'Loading your projects…'));
        return;
    }
    if (step.projects.length === 0) {
        body.appendChild(notice(
            'No other projects of yours were found to link. Linking currently works only for '
            + 'projects YOU own — the server’s project read routes scope to the owner and do not '
            + 'yet consult project membership (L-2901), so a colleague’s project cannot be linked '
            + 'yet. Save a second project of your own and it will appear here.',
            'warn',
        ));
        return;
    }

    const list = el('div', 'display:flex;flex-direction:column;gap:4px;max-height:150px;overflow-y:auto;');
    for (const p of step.projects) {
        const chosen = step.chosen?.id === p.id;
        const item = el('button', [
            'text-align:left', 'padding:7px 10px', 'border-radius:7px', 'cursor:pointer',
            'font-family:var(--app-font)', 'font-size:11.5px',
            `background:${chosen ? VIOLET_SOFT : 'var(--app-panel-bg,#fff)'}`,
            `border:1px solid ${chosen ? VIOLET : 'var(--app-border,#dde3f0)'}`,
            `color:${chosen ? VIOLET : 'var(--app-text,#1a2035)'}`,
            `font-weight:${chosen ? '650' : '500'}`,
        ].join(';'), p.name);
        item.addEventListener('click', () => { void chooseProject(step, p); });
        list.appendChild(item);
    }
    body.appendChild(list);

    if (step.chosen === null) return;

    // ── Step 2 · which version ──────────────────────────────────────────────
    body.appendChild(sectionLabel('2 · Which version'));
    body.appendChild(el('div', mutedCss(),
        'Pinned is the default. A linked model is a coordination datum: if it moves under you '
        + 'without your choosing, every dimension you drew to it is silently wrong.',
    ));

    const vwrap = el('div', 'display:flex;flex-direction:column;gap:4px;max-height:130px;overflow-y:auto;');
    const latestChosen = step.chosenVersion === null;
    const latestRow = el('button', pickCss(latestChosen),
        'Follow latest save  —  changes when the source is saved');
    latestRow.addEventListener('click', () => { void chooseVersion(step, null); });
    vwrap.appendChild(latestRow);

    for (const v of step.versions ?? []) {
        const on = step.chosenVersion?.id === v.id;
        const label = `Pin to “${v.label}”`
            + (v.createdAt !== null ? ` · ${new Date(v.createdAt).toLocaleDateString()}` : '')
            + (v.elementCount > 0 ? ` · ${v.elementCount} elements` : '');
        const r = el('button', pickCss(on), label);
        r.addEventListener('click', () => { void chooseVersion(step, v); });
        vwrap.appendChild(r);
    }
    body.appendChild(vwrap);

    // ── Step 3 · the C83 verdict ────────────────────────────────────────────
    body.appendChild(sectionLabel('3 · Placement'));

    if (step.busy) {
        body.appendChild(el('div', mutedCss(), 'Reading the linked project…'));
        return;
    }
    if (step.probe === null || step.anchor === null) {
        body.appendChild(el('div', mutedCss(), 'Choose a version to check the placement.'));
        return;
    }

    // The READ can fail independently of the PLACEMENT, and the two are reported
    // separately so the user is told which one refused.
    if (!step.probe.ok && step.probe.reason !== null) {
        body.appendChild(notice(step.probe.reason, 'stop'));
    } else {
        body.appendChild(el('div', mutedCss(),
            `Will draw ${step.probe.bandCount} level${step.probe.bandCount === 1 ? '' : 's'} `
            + `as massing · ${step.probe.drawCalls} draw call${step.probe.drawCalls === 1 ? '' : 's'} added`
            + (step.probe.elementCount > 0 ? ` · ${step.probe.elementCount} source elements read` : ''),
        ));
        if (step.probe.skippedLevels.length > 0) {
            body.appendChild(el('div', mutedCss(),
                `Levels with no massing volume: ${step.probe.skippedLevels.join(', ')}`));
        }
    }

    const a = step.anchor;
    body.appendChild(notice(
        `${a.headline}\n\n${a.detail}`,
        a.verdict === 'FINE' ? 'info' : a.verdict === 'INADVISABLE' ? 'warn' : 'stop',
    ));

    // Hand-placed offsets: the escape hatch. Always available, and the ONLY path
    // when the verdict is IMPOSSIBLE — a refusal whose "yes" branch leads nowhere
    // is a regression with a citation attached.
    if (a.affordance === 'place-by-hand-only' || step.manualMode) {
        body.appendChild(manualFields(step));
    }

    const bar = el('div', 'display:flex;gap:6px;flex-wrap:wrap;padding-top:4px;');
    const canDrawSomething = step.probe.bandCount > 0;

    if (a.affordance === 'place-by-hand-only' || step.manualMode) {
        bar.appendChild(button('Place by hand & link', 'primary', () => {
            commitLink(step, /* useManual */ true, /* confirmed */ true);
        }));
        if (a.affordance !== 'place-by-hand-only') {
            bar.appendChild(button('Use derived placement', 'quiet', () => {
                step.manualMode = false; render();
            }));
        }
    } else {
        const primary = button(a.primaryLabel, 'primary', () => {
            commitLink(step, /* useManual */ false, a.requiresConfirmation);
        });
        if (!canDrawSomething) {
            // Linking a source with no massing would add a row that can never show
            // anything. Refuse the primary action and say so, rather than creating a
            // link that is permanently "NOT SHOWN".
            primary.disabled = true;
            primary.style.cursor = 'not-allowed';
            primary.style.background = 'var(--app-bg,#e8edf6)';
            primary.style.color = 'var(--app-text-muted,#7a8aaa)';
            primary.style.border = '1px dashed var(--app-border,#dde3f0)';
            primary.title = 'This version has no massing volume to show.';
        }
        bar.appendChild(primary);
        bar.appendChild(button('Place by hand instead', 'quiet', () => {
            step.manualMode = true; render();
        }));
    }
    bar.appendChild(button('Cancel', 'quiet', () => { _view = { kind: 'list' }; render(); }));
    body.appendChild(bar);
}

function manualFields(step: CreateStep): HTMLElement {
    const wrap = el('div', 'display:grid;grid-template-columns:1fr 1fr;gap:6px;');
    const mk = (label: string, key: 'east' | 'north' | 'elevation' | 'rotationDeg', unit: string) => {
        const f = el('label', 'display:flex;flex-direction:column;gap:3px;');
        f.appendChild(el('span', [
            'font-size:9.5px', 'font-weight:700', 'letter-spacing:.05em',
            'text-transform:uppercase', 'color:var(--app-text-muted,#7a8aaa)',
            'font-family:var(--app-font)',
        ].join(';'), `${label} (${unit})`));
        const inp = document.createElement('input');
        inp.type = 'number';
        inp.step = key === 'rotationDeg' ? '1' : '0.1';
        inp.value = String(step.manual[key]);
        inp.style.cssText = [
            'padding:6px 8px', 'border-radius:6px', 'font-size:11.5px',
            'border:1px solid var(--app-border,#dde3f0)', 'font-family:var(--app-font)',
            'background:var(--app-panel-bg,#fff)', 'color:var(--app-text,#1a2035)',
        ].join(';');
        inp.addEventListener('input', () => {
            const n = Number(inp.value);
            step.manual[key] = Number.isFinite(n) ? n : 0;
        });
        f.appendChild(inp);
        return f;
    };
    wrap.appendChild(mk('East', 'east', 'm'));
    wrap.appendChild(mk('North', 'north', 'm'));
    wrap.appendChild(mk('Elevation', 'elevation', 'm'));
    wrap.appendChild(mk('Rotation', 'rotationDeg', '°'));
    return wrap;
}

async function chooseProject(step: CreateStep, p: LinkableProject): Promise<void> {
    step.chosen = p;
    step.versions = null;
    step.chosenVersion = null;
    step.probe = null;
    step.anchor = null;
    step.error = null;
    render();
    step.versions = await listSourceVersions(p.id);
    // Default to PINNED at the newest version when one exists (D5). "Follow latest"
    // stays one click away and is labelled in words.
    const newest = step.versions.length > 0 ? step.versions[0]! : null;
    await chooseVersion(step, newest);
}

async function chooseVersion(step: CreateStep, v: LinkableVersion | null): Promise<void> {
    step.chosenVersion = v;
    step.busy = true;
    step.probe = null;
    step.anchor = null;
    render();

    const pin = pinFor(v);
    const probe = await probeLinkSource(step.chosen!.id, pin, step.chosen!.name);
    step.probe = probe;
    // The SAME pure decision the handler validates with — so this dialog cannot
    // offer a placement `link.create` will then refuse.
    step.anchor = presentLinkAnchor(hostOrigin(), probe.origin, new Date().toISOString());
    step.busy = false;
    render();
}

function pinFor(v: LinkableVersion | null): LinkPin {
    return v === null
        ? { mode: 'latest', lastResolvedVersionId: null }
        : { mode: 'pinned', versionId: v.id, versionLabel: v.label, pinnedAt: new Date().toISOString() };
}

function commitLink(step: CreateStep, useManual: boolean, confirmed: boolean): void {
    const host = activeProjectId();
    if (host === null) {
        step.error = 'This project has no id yet, so a link cannot be attributed to it. '
            + 'Save the project once and try again.';
        render();
        return;
    }
    const payload: Record<string, unknown> = {
        sourceProjectId: step.chosen!.id,
        sourceProjectName: step.chosen!.name,
        hostProjectId: host,
        pin: pinFor(step.chosenVersion),
        hostOrigin: hostOrigin(),
        sourceOrigin: step.probe?.origin ?? null,
        display: 'massing',
        confirmedSeparation: confirmed,
    };
    if (useManual) {
        payload['explicitTransform'] = {
            east: step.manual.east,
            north: step.manual.north,
            elevation: step.manual.elevation,
            // The schema stores radians (C12); the field asks for degrees because
            // that is what a person types. One conversion, at the boundary.
            rotationY: (step.manual.rotationDeg * Math.PI) / 180,
        };
    }
    const err = dispatch('link.create', payload);
    if (err !== null) { step.error = err; render(); return; }
    _view = { kind: 'list' };
    render();
}

// ── Chrome ───────────────────────────────────────────────────────────────────

function sectionLabel(text: string): HTMLElement {
    return el('div', [
        'font-size:9.5px', 'font-weight:700', 'letter-spacing:.06em',
        'text-transform:uppercase', 'color:var(--app-text-muted,#7a8aaa)',
        'font-family:var(--app-font)', 'padding-top:4px',
    ].join(';'), text);
}

function mutedCss(): string {
    return [
        'font-size:10.5px', 'color:var(--app-text-muted,#7a8aaa)',
        'font-family:var(--app-font)', 'line-height:1.5',
    ].join(';');
}

function pickCss(on: boolean): string {
    return [
        'text-align:left', 'padding:7px 10px', 'border-radius:7px', 'cursor:pointer',
        'font-family:var(--app-font)', 'font-size:11px',
        `background:${on ? VIOLET_SOFT : 'var(--app-panel-bg,#fff)'}`,
        `border:1px solid ${on ? VIOLET : 'var(--app-border,#dde3f0)'}`,
        `color:${on ? VIOLET : 'var(--app-text,#1a2035)'}`,
        `font-weight:${on ? '650' : '500'}`,
    ].join(';');
}

/** Surface a refusal that arrived from the bus rather than from the dialog. */
function flash(message: string): void {
    if (_panel == null) return;
    const slot = _panel.querySelector<HTMLElement>('[data-lm-flash]');
    if (slot == null) return;
    slot.replaceChildren(notice(message, 'stop'));
    window.setTimeout(() => { slot.replaceChildren(); }, 9000);
}

function build(): HTMLElement {
    const panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.style.cssText = [
        'position:fixed', 'top:96px', 'right:24px', 'width:352px',
        'max-height:74vh', 'overflow:auto', 'z-index:1400',
        'background:var(--app-panel-bg,#ffffff)',
        `border:1px solid ${VIOLET_EDGE}`, 'border-radius:12px',
        'box-shadow:0 10px 34px rgba(102,0,255,0.14)',
        'font-family:var(--app-font)', 'padding:0', 'resize:both',
    ].join(';');

    const header = el('div', [
        'display:flex', 'align-items:center', 'gap:8px',
        'padding:11px 13px', 'cursor:move',
        `background:${VIOLET_SOFT}`, `border-bottom:1px solid ${VIOLET_EDGE}`,
        'border-radius:12px 12px 0 0',
    ].join(';'));
    header.setAttribute('data-lm-header', '');
    header.appendChild(el('span', 'font-size:14px;', '🔗'));
    header.appendChild(el('div', [
        'flex:1', 'font-size:12.5px', 'font-weight:700',
        `color:${VIOLET}`, 'font-family:var(--app-font)',
    ].join(';'), 'Linked Models'));
    const close = button('✕', 'quiet', () => closeLinkedModelsPanel());
    close.style.padding = '3px 8px';
    close.setAttribute('data-lm-close', '');
    header.appendChild(close);
    panel.appendChild(header);

    panel.appendChild(el('div', 'padding:0 13px;', ''))
        .setAttribute('data-lm-flash', '');

    const body = el('div', 'display:flex;flex-direction:column;gap:9px;padding:12px 13px 14px;');
    body.setAttribute('data-lm-body', '');
    panel.appendChild(body);
    return panel;
}

// ── Public surface ───────────────────────────────────────────────────────────

/** Thread the composed runtime in. Called once from the editor bootstrap. */
export function wireLinkedModelsRuntime(rt: Runtime): void {
    _runtime = rt;
}

/** Open (or focus) the panel. Idempotent. */
export function openLinkedModelsPanel(runtime: Runtime = null): void {
    if (runtime != null) _runtime = runtime;
    if (_panel != null) { render(); return; }

    _view = { kind: 'list' };
    _panel = build();
    document.body.appendChild(_panel);
    _undrag = makeDraggable(_panel, '[data-lm-header]', ['button', 'input'], _runtime);

    // Two independent change sources, both subscribed: the STORE broadcasts when
    // the set of links or a display mode changes, and the CONTROLLER announces when
    // a resolution completes. Listening to only one would leave the panel showing
    // "RESOLVING" forever, or showing a link that was already removed.
    _unsubStatus = linkedModelController.subscribe(() => render());
    _onStoreChange = () => render();
    window.addEventListener(LINKED_MODELS_CHANGED_EVENT, _onStoreChange);

    render();
}

export function closeLinkedModelsPanel(): void {
    if (_panel == null) return;
    try { _undrag?.(); } catch { /* listener teardown must never throw */ }
    try { _unsubStatus?.(); } catch { /* ditto */ }
    if (_onStoreChange !== null) window.removeEventListener(LINKED_MODELS_CHANGED_EVENT, _onStoreChange);
    _panel.remove();
    _panel = null;
    _undrag = null;
    _unsubStatus = null;
    _onStoreChange = null;
}

export function toggleLinkedModelsPanel(runtime: Runtime = null): void {
    if (_panel != null) closeLinkedModelsPanel();
    else openLinkedModelsPanel(runtime);
}

export function isLinkedModelsPanelOpen(): boolean {
    return _panel != null;
}

/** Full teardown, for HMR and engine disposal. */
export function disposeLinkedModelsPanel(): void {
    closeLinkedModelsPanel();
    _runtime = null;
}
