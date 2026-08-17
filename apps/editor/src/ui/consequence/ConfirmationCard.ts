/**
 * ConfirmationCard — R6 of docs/03-execution/plans/BIM30-REASONING-LOOP-PLAN.md.
 * The plan doc's R6 exit condition is two clauses and this file is the second one:
 * "G-REASON-05 green; **the card renders the plan**."
 *
 * R6 also says what the card BECOMES: *"The AI confirmation card upgrades from
 * proposal-text to consequence-set (including untouched count and undetermined items)."*
 * So this card never asks "Move this wall?" — it states WHAT WOULD HAPPEN, from the plan,
 * and asks about that.
 *
 * ── THE FOUR RULES THAT DECIDE WHAT APPEARS ───────────────────────────────────────────
 *
 * 1. THE CARD IS DOWNSTREAM OF THE PLAN. `show()` takes a `ConsequencePlan`; there is no
 *    entry point that raises a prompt without one. A confirmation UI that can appear before
 *    the consequences are known is the defect R6 point 1 names, and it is unreachable here
 *    by construction, not by discipline.
 *
 * 2. THE CARD RENDERS THE VERDICT; IT NEVER REACHES ONE. The `ConfirmationPolicy` arrives as
 *    a parameter, computed by `confirmationPolicy.ts` from the plan. This file contains no
 *    `if (plan.refused.length)` deciding whether to appear — that decision is data, made
 *    once, readable by AI and batch surfaces too (STR-06 §11's "one safety substrate").
 *
 * 3. REFUSALS CARRY BOTH NUMBERS, AND THE NUMBERS ARE THE PRODUCER'S. `blockingItems()`
 *    hands over the rule's own sentence — `"Kitchen — area 6.4m² is below minimum 7m²"` —
 *    and this file prints it verbatim, escaped. It never re-formats a quantity: a second
 *    formatter over a number the user acts on is a second source of truth that can round or
 *    unit differently from the rule that produced it.
 *
 * 4. UNDETERMINED IS SHOWN AS UNDETERMINED, AND `untouched` IS DERIVED. Same discipline as
 *    the R3 overlay and R5 report view: an honest blind spot is surfaced, and the
 *    "nothing else expected to change: N untouched" line STR-06 §10 asks for is computed
 *    here as `scope − changed − excluded` (ADR-0322 §6 requires it derived, never persisted).
 *
 * ── THE HASH IS ON THE BUTTON, NOT IN A CLOSURE OVER "CURRENT" STATE ──────────────────
 * The confirm button carries the `planHash` it was rendered with, and hands it to the
 * `onConfirm` callback. That is what makes the approval bind to the artefact the human read:
 * if a later plan replaces this card, a click on a stale button still reports the OLD hash,
 * and `ConfirmationFlow.confirm()` refuses it as `APPROVAL_UNKNOWN_PLAN`. A button that
 * resolved "the current plan" at click time would silently approve a substitution — the exact
 * failure this phase exists to make impossible.
 */

import type { ConfirmationPolicy, ConsequencePlan, UndeterminedImpact } from '@pryzm/command-bus';
import { escHtml } from '@pryzm/ui-base';
import type { ApprovalStaleRefusal, ApprovalUnknownRefusal } from './ConfirmationFlow.js';
import { blockingItems } from './confirmationPolicy.js';

/**
 * The TYPED refusal a `ConfirmationPrompt` is handed alongside the sentence. `import type`, so
 * this file still imports no behaviour from the flow and there is no module cycle at runtime.
 */
type ApprovalRefusalFact = ApprovalStaleRefusal | ApprovalUnknownRefusal;

const PANEL_ID = 'consequence-confirmation-card';

/** Called with the hash the card was RENDERED with — never with "whatever is current". */
export type ConfirmHandler = (approvedPlanHash: string) => void;
export type CancelHandler = () => void;

/**
 * §XSS-SINK-SCAN / MT-10 — THE SHARED ESCAPER, NOT A LOCAL COPY.
 *
 * This was a local `esc()` escaping `&`, `<`, `>` only. That was not merely
 * duplicated, it was WRONG: `planHash` is interpolated into an ATTRIBUTE at
 * `data-plan-hash="${esc(...)}"`, and a value containing `"` closed the
 * attribute and minted arbitrary new ones — including event handlers — on the
 * confirm button. `escHtml` escapes `"` and `'` as well, which closes that.
 * Proven by `__tests__/consequenceUiXssEscaping.test.ts`, whose quote-breakout
 * cases FAIL against the old local escaper.
 *
 * Kept as a one-line alias rather than rewriting ~30 call sites: the name `esc`
 * stays, the implementation is now the single shared one, so a future
 * tightening of `escHtml` reaches this file automatically.
 */
const esc = escHtml;

function buildPanel(): HTMLElement {
    const el = document.createElement('div');
    el.id = PANEL_ID;
    el.style.cssText = [
        'position:fixed;left:50%;top:64px;transform:translateX(-50%);z-index:9500;',
        'max-width:460px;max-height:74vh;overflow-y:auto;',
        'background:#1a2035;color:#e5e7eb;',
        'border-radius:12px;padding:16px 18px;font-size:12px;',
        'box-shadow:0 12px 40px rgba(0,0,0,0.5);',
        'border:1.5px solid rgba(102,0,255,0.55);',
        'font-family:var(--app-font,-apple-system,sans-serif);',
        'line-height:1.55;display:none;',
    ].join('');
    document.body.appendChild(el);
    return el;
}

const head = (text: string, color: string): string =>
    `<div style="font-weight:700;color:${color};margin:8px 0 4px;">${text}</div>`;

const item = (text: string, color: string): string =>
    `<div style="color:${color};font-size:11px;margin-bottom:2px;">↳ ${text}</div>`;

function renderUndetermined(u: UndeterminedImpact): string {
    const detail = u.detail ? ` <span style="color:#a89a6a;">(${esc(u.detail)})</span>` : '';
    return item(`${esc(u.scope)} — <b>${esc(u.reason)}</b>${detail}`, '#fde68a');
}

/** Human wording for the requirement ladder. `none` never reaches the card. */
function requirementBanner(policy: ConfirmationPolicy): string {
    if (policy.requirement === 'required') {
        return `<div style="background:#3a1f24;border-left:3px solid #f87171;padding:7px 9px;border-radius:4px;margin-bottom:8px;">` +
            `<div style="font-weight:700;color:#fca5a5;">CONFIRMATION REQUIRED</div>` +
            `<div style="color:#fca5a5;font-size:11px;">${esc(policy.reasons.join(' · '))}</div></div>`;
    }
    return `<div style="background:#2a2438;border-left:3px solid #fbbf24;padding:7px 9px;border-radius:4px;margin-bottom:8px;">` +
        `<div style="font-weight:700;color:#fde68a;">PLEASE REVIEW</div>` +
        `<div style="color:#fde68a;font-size:11px;">${esc(policy.reasons.join(' · '))}</div></div>`;
}

/**
 * Render the plan + policy into `panel`. Exported so the certification gate and the unit
 * suite drive THE renderer rather than a copy — a gate that re-implements the thing it
 * certifies proves nothing about the thing that ships.
 */
export function renderConfirmationCard(
    panel: HTMLElement,
    plan: ConsequencePlan,
    policy: ConfirmationPolicy,
): void {
    const L: string[] = [];

    L.push(`<div style="font-weight:700;color:#c4b5fd;margin-bottom:2px;">${esc(plan.command.type)} — confirm</div>`);
    L.push(`<div style="color:#7a8aaa;font-size:10px;margin-bottom:8px;">plan ${esc(plan.planHash)} · state ${esc(plan.stateHash)}</div>`);

    L.push(requirementBanner(policy));

    // ── BLOCKING ITEMS — refusals + created violations, WITH THEIR NUMBERS ─────
    // Printed FIRST and verbatim. These are the sentences the user must act on, and the
    // producing rule already put the measured and the required quantity in them.
    const blocking = blockingItems(plan);
    if (blocking.length > 0) {
        L.push(head(`✕ ${blocking.length} blocking item(s)`, '#f87171'));
        for (const b of blocking) {
            const who = b.elementId ? `${esc(b.elementId)}: ` : '';
            const rule = b.ruleId ? `<span style="color:#a89a6a;">[${esc(b.ruleId)}]</span> ` : '';
            L.push(item(`${rule}${who}${esc(b.sentence)}`, '#fca5a5'));
        }
    }

    // ── THE CONSEQUENCE SET — what R6 upgrades the card TO ─────────────────────
    L.push(head(`● ${plan.changed.length} element(s) would change`, '#a78bfa'));
    for (const id of plan.changed.slice(0, 6)) L.push(item(esc(id), '#ddd6fe'));
    if (plan.changed.length > 6) {
        L.push(`<div style="color:#7a8aaa;font-size:11px;">+ ${plan.changed.length - 6} more…</div>`);
    }

    if (plan.metrics && plan.metrics.length > 0) {
        L.push(head('◆ predicted metrics', '#a78bfa'));
        for (const m of plan.metrics.slice(0, 6)) {
            const u = m.unit === 'm2' ? ' m²' : m.unit === 'm3' ? ' m³' : m.unit === 'm' ? ' m' : '';
            const before = m.before === undefined ? 'not recorded' : `${m.before.toFixed(1)}${u}`;
            L.push(item(`${esc(m.elementId)} ${esc(m.metric)}: <b>${before} → ${m.after.toFixed(1)}${u}</b>`, '#ddd6fe'));
        }
    }

    if (plan.topology.removed.length > 0) {
        L.push(head(`⚠ ${plan.topology.removed.length} element(s) would be REMOVED`, '#f87171'));
        for (const id of plan.topology.removed.slice(0, 4)) L.push(item(esc(id), '#fca5a5'));
    }

    // ── UNDETERMINED — never rendered as "nothing else changes" ────────────────
    if (plan.undetermined.length > 0) {
        L.push(head(`? ${plan.undetermined.length} impact(s) CANNOT BE DETERMINED`, '#fbbf24'));
        L.push(item('these are blind spots, not assurances — the system does not know what happens here.', '#a89a6a'));
        for (const u of plan.undetermined.slice(0, 4)) L.push(renderUndetermined(u));
        if (plan.undetermined.length > 4) {
            L.push(`<div style="color:#7a8aaa;font-size:11px;">+ ${plan.undetermined.length - 4} more…</div>`);
        }
    }

    // ── "nothing else expected to change: N untouched" (STR-06 §10) ────────────
    // DERIVED here: scope − changed − excluded (ADR-0322 §6 — never persisted).
    const scope = new Set<string>([
        ...plan.changed, ...plan.excluded,
        ...(plan.direct.kind === 'determined' ? plan.direct.elements : []),
        ...(plan.indirect.kind === 'determined' ? plan.indirect.elements : []),
    ]);
    for (const id of plan.changed) scope.delete(id);
    for (const id of plan.excluded) scope.delete(id);
    L.push(
        `<div style="color:#8b93a8;font-size:10px;margin-top:8px;">` +
        `nothing else expected to change: ${plan.excluded.length} considered unchanged · ` +
        `${scope.size} untouched (derived, never stored)</div>`,
    );

    // ── The buttons. The hash rides ON the confirm button. ─────────────────────
    L.push(
        `<div style="display:flex;gap:8px;margin-top:12px;justify-content:flex-end;">` +
        `<button type="button" data-role="cancel" style="padding:6px 14px;border-radius:6px;border:1px solid #40465c;background:transparent;color:#c9cede;font-size:12px;cursor:pointer;">Cancel</button>` +
        `<button type="button" data-role="confirm" data-plan-hash="${esc(plan.planHash)}" style="padding:6px 14px;border-radius:6px;border:none;background:#6600FF;color:#fff;font-weight:600;font-size:12px;cursor:pointer;">Confirm</button>` +
        `</div>`,
    );

    // §XSS-SINK-SCAN — see `renderConfirmationRefusal` below and
    // `__tests__/consequenceUiXssEscaping.test.ts`: every runtime string pushed
    // into `L` went through `esc` (= the shared `escHtml`); the rest is markup
    // written here. `safeHtml` is the gate's convention for "escaped before
    // assignment", and the test is what discharges it.
    const safeHtml = L.join('');
    panel.innerHTML = safeHtml;
}

/**
 * ⭐ §B.4 / C78 §9.3 — the WORDING for one refusal, chosen from the TYPED fact.
 *
 * Rule 2 of this file says the card renders the verdict and never reaches one, and this
 * function is where that rule was being broken. The heading was the literal
 * "APPROVAL REFUSED — THE PLAN IS STALE", printed for every refusal the flow could produce —
 * including `APPROVAL_UNKNOWN_PLAN` (not staleness at all) and, once `ConfirmationFlow` could
 * express it, the arm where the confirm-time re-plan COULD NOT BE COMPUTED. For that last one
 * the sentence is not merely imprecise, it is the §9.3 defect surfacing in the DOM: it reports
 * a capability gap as a measurement of the world. The user reads "the model changed" and goes
 * looking for the collaborator who changed it.
 *
 * The replan CTA is chosen the same way and for the same reason. Under the unverifiable arm the
 * flow deliberately re-offers the plan the user ALREADY approved (it retains it as pending, so
 * the button works) — labelling that "the NEW plan" would be a second false claim on the same
 * panel.
 */
function refusalWording(refusal: ApprovalRefusalFact | undefined): {
    headline: string;
    footnote: string;
    replanHeading: string;
    replanCta: string;
} {
    if (refusal?.kind === 'APPROVAL_UNKNOWN_PLAN') {
        return {
            headline: 'APPROVAL REFUSED — THAT IS NOT THE PLAN ON SCREEN',
            footnote: 'Nothing was executed. An approval is only ever honoured for the exact plan it was shown, so a decision naming a plan this card is not holding is refused rather than guessed at.',
            replanHeading: '◆ the plan currently awaiting a decision',
            replanCta: 'Review &amp; confirm',
        };
    }
    if (refusal?.kind === 'APPROVAL_STALE' && refusal.liveVerification.kind === 'unverifiable') {
        return {
            headline: 'APPROVAL REFUSED — THE PLAN COULD NOT BE RE-VERIFIED',
            footnote: 'Nothing was executed. PRYZM could not re-plan over the model as it is now, so it could not check that your approval still applies — and it will not act on an approval it cannot check. This is NOT a report that the model changed: that was never measured.',
            replanHeading: '◆ the plan you approved — unchanged, and still awaiting a decision',
            replanCta: 'Try confirming again',
        };
    }
    return {
        headline: 'APPROVAL REFUSED — THE PLAN IS STALE',
        footnote: 'Nothing was executed. The system will not run a plan you did not see, and will not run the plan you saw over a model that has since changed.',
        replanHeading: '◆ the NEW plan, over the model as it is now',
        replanCta: 'Review &amp; confirm the new plan',
    };
}

/**
 * Render a typed REFUSAL of an approval (R6 point 3). The user is TOLD why, and, when a plan
 * remains, is offered it immediately: a refusal that leaves nothing to approve is a dead end,
 * and dead ends teach people to click through warnings.
 *
 * `refusal` is OPTIONAL so the existing three-argument call sites (and the XSS suite, which
 * drives this renderer with hostile strings) are unchanged; omitted, the wording falls back to
 * the stale-approval case this renderer shipped with.
 */
export function renderConfirmationRefusal(
    panel: HTMLElement,
    message: string,
    replan: ConsequencePlan | null,
    refusal?: ApprovalRefusalFact,
): void {
    const W = refusalWording(refusal);
    const L: string[] = [
        `<div style="background:#3a1f24;border-left:3px solid #f87171;padding:8px 10px;border-radius:4px;margin-bottom:8px;">`,
        `<div style="font-weight:700;color:#fca5a5;">${esc(W.headline)}</div>`,
        `<div style="color:#fca5a5;font-size:11px;margin-top:3px;">${esc(message)}</div>`,
        `<div style="color:#a89a6a;font-size:10px;margin-top:5px;">${esc(W.footnote)}</div>`,
        `</div>`,
    ];
    if (replan) {
        L.push(head(esc(W.replanHeading), '#a78bfa'));
        L.push(item(`plan ${esc(replan.planHash)} · ${replan.changed.length} element(s) would change`, '#ddd6fe'));
        L.push(
            `<div style="display:flex;gap:8px;margin-top:12px;justify-content:flex-end;">` +
            `<button type="button" data-role="cancel" style="padding:6px 14px;border-radius:6px;border:1px solid #40465c;background:transparent;color:#c9cede;font-size:12px;cursor:pointer;">Cancel</button>` +
            `<button type="button" data-role="confirm" data-plan-hash="${esc(replan.planHash)}" style="padding:6px 14px;border-radius:6px;border:none;background:#6600FF;color:#fff;font-weight:600;font-size:12px;cursor:pointer;">${W.replanCta}</button>` +
            `</div>`,
        );
    } else {
        L.push(
            `<div style="display:flex;gap:8px;margin-top:12px;justify-content:flex-end;">` +
            `<button type="button" data-role="cancel" style="padding:6px 14px;border-radius:6px;border:1px solid #40465c;background:transparent;color:#c9cede;font-size:12px;cursor:pointer;">Dismiss</button>` +
            `</div>`,
        );
    }
    // §XSS-SINK-SCAN — as above: `L` holds only escaped values and locally
    // authored markup, and the injection suite proves it against the SHIPPING
    // renderer rather than a copy of it.
    const safeHtml = L.join('');
    panel.innerHTML = safeHtml;
}

/**
 * §C83-S1 — render an **IMPOSSIBLE** spatial refusal: a proposed element whose
 * geometry contradicts an element that already exists.
 *
 * ── WHY THIS IS A SIBLING OF `renderConfirmationRefusal`, NOT A NEW SURFACE ────
 * C83 §4.1 counts FOUR live propose→consent surfaces and says plainly that a
 * fifth is the failure mode. This adds none: it is a second RENDERER on the
 * SAME `ConfirmationCard`, the same panel element, the same delegated click
 * listener. `renderConfirmationRefusal` could not be reused as-is only because
 * its heading is hard-coded to the stale-approval case ("THE PLAN IS STALE"),
 * which is a different and false account of what happened here.
 *
 * ── WHY THERE IS NO CONFIRM BUTTON, AND WHY THAT IS THE WHOLE POINT ───────────
 * C83 §1.1 classifies this verdict IMPOSSIBLE: the proposed state is
 * self-contradictory as geometry, so no amount of context makes it right and no
 * user preference can license it. C83 §5.4 draws the consequence — *"an
 * IMPOSSIBLE finding CANNOT be dismissed … if a rule offers a dismiss button,
 * it was never IMPOSSIBLE"*. Nothing was executed and nothing is pending, so
 * there is no decision to take: the only control is an acknowledgement. A
 * Confirm button here would be an offer to build a contradiction.
 *
 * `offers` are the concrete alternatives (C83 §4) — the founder's *"do you want
 * to move the wall upwards or backwards?"*. They are rendered as INFORMATION,
 * not as buttons: applying one is a mutation, and a mutation must travel the
 * bus as an ordinary undoable command (P6), not fire from a notification. When
 * `offers` is empty the card says so explicitly rather than staying quiet,
 * because silence there reads as "there is no way to fix this" (C83 §4.2.1).
 */
/**
 * §C83-S5 — the per-rule wording, so a SECOND IMPOSSIBLE rule reuses this
 * renderer instead of minting a rival card (C83 §4.1: *"a fifth is the failure
 * mode"*).
 *
 * Every field defaults to the wall × opening wording this renderer shipped with,
 * so the existing caller and its executed surfacing suite are unchanged. Only
 * the three strings that are actually rule-specific are parameterised: a floor
 * refusal that told the user *"a wall and an opening cannot share the same
 * volume"* would be a true panel carrying a false sentence, which is worse than
 * no panel — the user would go looking for a wall.
 */
export interface SpatialRefusalWording {
    /** The invariant, in one sentence. Why NO version of this can be held. */
    readonly invariant?: string;
    /** Heading over the offers list. */
    readonly offersHeading?: string;
    /** Footnote under the offers list — how they were validated. */
    readonly offersFootnote?: string;
    /** The honest "nothing can be defended" text (C83 §4.2). */
    readonly noOffersText?: string;
}

const WALL_OPENING_WORDING: Required<SpatialRefusalWording> = {
    invariant:
        'Nothing was created. This is not a warning you can click past — a wall and an opening cannot share the same volume, so there is no version of this placement the model can hold.',
    offersHeading: '◆ positions that ARE clear',
    offersFootnote: 'Each was re-checked against every wall on this level before being offered.',
    noOffersText:
        'No clear position could be computed and defended for this wall, so none is suggested — a guessed position that landed on another opening would be worse than none.',
};

export function renderSpatialRefusal(
    panel: HTMLElement,
    headline: string,
    sentence: string,
    offers: readonly string[],
    wording: SpatialRefusalWording = {},
): void {
    const W = { ...WALL_OPENING_WORDING, ...wording };
    const L: string[] = [
        `<div style="background:#3a1f24;border-left:3px solid #f87171;padding:8px 10px;border-radius:4px;margin-bottom:8px;">`,
        `<div style="font-weight:700;color:#fca5a5;">${esc(headline)}</div>`,
        `<div style="color:#fca5a5;font-size:11px;margin-top:3px;">${esc(sentence)}</div>`,
        `<div style="color:#a89a6a;font-size:10px;margin-top:5px;">${esc(W.invariant)}</div>`,
        `</div>`,
    ];

    if (offers.length > 0) {
        // §XSS-SINK-SCAN — the wording strings are `esc`'d too. They are authored
        // literals today, but they are now PARAMETERS, and a sink that is safe
        // only while every caller behaves is not a safe sink.
        L.push(head(esc(W.offersHeading), '#a78bfa'));
        for (const o of offers) L.push(item(esc(o), '#ddd6fe'));
        L.push(
            `<div style="color:#8b93a8;font-size:10px;margin-top:6px;">${esc(W.offersFootnote)}</div>`,
        );
    } else {
        // C83 §4.2's MUST NOT, rendered. An offer carries an implicit claim that
        // the alternative is valid; when none can be defended, the absence is
        // stated rather than filled with a nearest-fit guess.
        L.push(head('◆ no alternative is offered', '#fbbf24'));
        L.push(item(esc(W.noOffersText), '#fde68a'));
    }

    L.push(
        `<div style="display:flex;gap:8px;margin-top:12px;justify-content:flex-end;">` +
        `<button type="button" data-role="cancel" style="padding:6px 14px;border-radius:6px;border:1px solid #40465c;background:transparent;color:#c9cede;font-size:12px;cursor:pointer;">Dismiss</button>` +
        `</div>`,
    );

    // §XSS-SINK-SCAN — as in the two renderers above: every runtime string in `L`
    // went through `esc`, the rest is markup authored here, and the injection
    // suite drives the SHIPPING renderer rather than a copy of it.
    const safeHtml = L.join('');
    panel.innerHTML = safeHtml;
}

// ─── The card ──────────────────────────────────────────────────────────────────────────

export class ConfirmationCard {
    private readonly _panel: HTMLElement;
    private _visible = false;
    private _onConfirm: ConfirmHandler | null = null;
    private _onCancel: CancelHandler | null = null;

    constructor() {
        this._panel = buildPanel();
        // ONE delegated listener, installed once. It reads the hash from the BUTTON, so a
        // click always reports the plan that button was rendered with.
        this._panel.addEventListener('click', (ev: Event) => {
            const target = ev.target as HTMLElement | null;
            const role = target?.getAttribute?.('data-role');
            if (role === 'confirm') {
                const hash = target?.getAttribute('data-plan-hash') ?? '';
                this._onConfirm?.(hash);
            } else if (role === 'cancel') {
                this._onCancel?.();
            }
        });
    }

    /** The live panel element — exposed so tests and the gate read what SHIPPED. */
    get element(): HTMLElement {
        return this._panel;
    }

    get visible(): boolean {
        return this._visible;
    }

    /** Wire the decision handlers. `onConfirm` receives the hash the card was rendered with. */
    setHandlers(onConfirm: ConfirmHandler, onCancel: CancelHandler): void {
        this._onConfirm = onConfirm;
        this._onCancel = onCancel;
    }

    /** {@link ConfirmationPrompt.show} — render the plan and its policy verdict. */
    show(plan: ConsequencePlan, policy: ConfirmationPolicy): void {
        renderConfirmationCard(this._panel, plan, policy);
        this._reveal();
    }

    /**
     * {@link ConfirmationPrompt.showRefusal} — a typed refusal of an approval.
     *
     * `refusal` is forwarded so the renderer can pick wording from the FACT (§B.4 / C78 §9.3):
     * an unverifiable re-plan and a genuinely stale one must not print the same heading.
     */
    showRefusal(
        message: string,
        replan: ConsequencePlan | null,
        refusal?: ApprovalRefusalFact,
    ): void {
        renderConfirmationRefusal(this._panel, message, replan, refusal);
        this._reveal();
    }

    /**
     * §C83-S1 — an IMPOSSIBLE spatial refusal (a wall through a door/window).
     *
     * Deliberately NOT routed through `ConfirmationFlow`: the flow exists to bind
     * an APPROVAL to a plan hash, and there is nothing here to approve. The
     * command was refused before it executed, so no plan is pending, no hash is
     * outstanding, and inventing one to reuse the flow would put a fabricated
     * approval record on a mutation that never happened (ADR-0324's exact
     * prohibition). The CARD is the shared surface; the FLOW is not.
     */
    showSpatialRefusal(
        headline: string,
        sentence: string,
        offers: readonly string[],
        // §C83-S5 — optional per-rule wording. Omitted ⇒ the wall × opening
        // wording this card shipped with, so the §C83-S1 caller is untouched.
        wording?: SpatialRefusalWording,
    ): void {
        renderSpatialRefusal(this._panel, headline, sentence, offers, wording);
        this._reveal();
    }

    hide(): void {
        this._panel.style.display = 'none';
        this._visible = false;
    }

    private _reveal(): void {
        this._panel.style.display = 'block';
        this._visible = true;
    }
}
