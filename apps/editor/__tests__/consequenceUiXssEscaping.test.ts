// @vitest-environment happy-dom
/**
 * consequenceUiXssEscaping — MT-10 / §XSS-SINK-SCAN (C08 §3.1).
 *
 * The R5 report view and the R6 confirmation card both build their panel by
 * accumulating HTML strings into an `L` array and assigning `panel.innerHTML =
 * L.join('')`. `check-xss-guards.ts` cannot prove an accumulator's contents are
 * escaped, so it flags the sink. This suite supplies the proof the gate cannot:
 * it drives THE SHIPPING RENDERERS with model-derived strings carrying a live
 * XSS payload and asserts the payload arrives as TEXT, never as markup.
 *
 * WHY THIS IS NOT A LINT NIT. Element ids and names, room names, refusal
 * sentences, actor ids and rule messages are USER-CONTROLLED — a user may name
 * a wall `<img src=x onerror=alert(1)>`. Every one of those reaches innerHTML
 * here.
 *
 * TWO PAYLOADS, DELIBERATELY:
 *   • `ELEMENT_PAYLOAD` — tag injection, caught by escaping `<` and `>`.
 *   • `ATTR_PAYLOAD` — a QUOTE BREAKOUT (`" onload="alert(1)`). This is the one
 *     the previous local `esc()` (which escaped only `&`, `<`, `>`) could NOT
 *     stop: `data-plan-hash="${esc(hash)}"` interpolates into an ATTRIBUTE, so
 *     an unescaped `"` closes it and everything after becomes new attributes.
 *     The shared `escHtml` escapes `"` and `'` too, which is precisely why this
 *     file's renderers now use it instead of a local copy.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { ConfirmationPolicy, ConsequencePlan, ConsequenceReport } from '@pryzm/command-bus';
import { renderConsequenceReport, renderNoReport } from '@app/ui/canvas/ConsequenceReportView.js';
import { renderConfirmationCard, renderConfirmationRefusal } from '@app/ui/consequence/ConfirmationCard.js';

const ELEMENT_PAYLOAD = '<img src=x onerror=alert(1)>';
const ATTR_PAYLOAD = '" onload="alert(1)';

/**
 * The assertion that actually matters. `innerHTML` containing `&lt;img` proves
 * escaping happened, but the DOM is the authority: if the payload parsed, an
 * `<img>` ELEMENT exists in the tree. We assert BOTH — no injected element, and
 * the payload readable as literal text.
 */
function expectNoInjection(panel: HTMLElement): void {
    expect(panel.querySelector('img')).toBeNull();
    expect(panel.querySelector('script')).toBeNull();
    // No element in the subtree may carry an event handler attribute.
    for (const el of Array.from(panel.querySelectorAll('*'))) {
        for (const attr of Array.from(el.attributes)) {
            expect(attr.name.startsWith('on')).toBe(false);
        }
    }
}

function plan(overrides: Partial<ConsequencePlan> = {}): ConsequencePlan {
    return {
        planId: 'plan-1',
        planHash: 'hash-abc',
        stateHash: 'state-abc',
        command: { type: `wall.move${ELEMENT_PAYLOAD}` } as ConsequencePlan['command'],
        changed: [ELEMENT_PAYLOAD],
        excluded: [],
        direct: { kind: 'determined', elements: [ELEMENT_PAYLOAD] },
        indirect: { kind: 'determined', elements: [] },
        topology: { added: [], removed: [ELEMENT_PAYLOAD], modified: [] },
        undetermined: [
            { scope: ELEMENT_PAYLOAD, reason: ELEMENT_PAYLOAD, detail: ELEMENT_PAYLOAD },
        ],
        refused: [{ elementId: ELEMENT_PAYLOAD, reason: ELEMENT_PAYLOAD }],
        validation: {
            violationsCreated: [
                { ruleId: ELEMENT_PAYLOAD, elementId: ELEMENT_PAYLOAD, message: ELEMENT_PAYLOAD },
            ],
            violationsResolved: [],
        },
        metrics: [
            { elementId: ELEMENT_PAYLOAD, metric: ELEMENT_PAYLOAD, unit: 'm2', before: 6.4, after: 7.1 },
        ],
        ...overrides,
    } as ConsequencePlan;
}

function report(): ConsequenceReport {
    const p = plan();
    return {
        commandId: ELEMENT_PAYLOAD,
        plan: p,
        actual: { changed: [ELEMENT_PAYLOAD], regenerated: [ELEMENT_PAYLOAD] },
        metrics: [
            { elementId: ELEMENT_PAYLOAD, metric: ELEMENT_PAYLOAD, unit: 'm2', before: 1, after: 2 },
        ],
        metricsUndetermined: { scope: ELEMENT_PAYLOAD, reason: ELEMENT_PAYLOAD, detail: ELEMENT_PAYLOAD },
        validationUndetermined: undefined,
        validation: {
            violationsCreated: [
                { ruleId: ELEMENT_PAYLOAD, elementId: ELEMENT_PAYLOAD, message: ELEMENT_PAYLOAD },
            ],
            violationsResolved: [{ ruleId: ELEMENT_PAYLOAD, elementId: ELEMENT_PAYLOAD }],
        },
        predictedVsActual: { undeterminedResolved: [ELEMENT_PAYLOAD] },
        undeterminedOutcomes: [
            {
                item: { scope: ELEMENT_PAYLOAD, reason: ELEMENT_PAYLOAD, detail: ELEMENT_PAYLOAD },
                actualChangedOutsidePrediction: [ELEMENT_PAYLOAD],
            },
        ],
        divergence: {
            kind: 'plan-fidelity-divergence',
            unexpected: [ELEMENT_PAYLOAD],
            missing: [ELEMENT_PAYLOAD],
        },
        provenance: {
            actor: { kind: 'human', id: ELEMENT_PAYLOAD },
            origin: { surface: ELEMENT_PAYLOAD, proposalId: ELEMENT_PAYLOAD },
            approval: { approvedBy: ELEMENT_PAYLOAD },
        },
    } as unknown as ConsequenceReport;
}

const policy: ConfirmationPolicy = {
    requirement: 'required',
    reasons: [ELEMENT_PAYLOAD],
} as ConfirmationPolicy;

describe('consequence UI — user-controlled strings never become markup', () => {
    let panel: HTMLElement;

    beforeEach(() => {
        panel = document.createElement('div');
        document.body.appendChild(panel);
    });

    describe('ConsequenceReportView', () => {
        it('renders an element name containing an XSS payload as literal TEXT', () => {
            renderConsequenceReport(panel, report());

            expectNoInjection(panel);
            // The payload is present — as text the user can read, not as a node.
            expect(panel.textContent).toContain(ELEMENT_PAYLOAD);
            expect(panel.innerHTML).toContain('&lt;img src=x onerror=alert(1)&gt;');
            expect(panel.innerHTML).not.toContain('<img src=x');
        });

        it('escapes the typed no-report detail', () => {
            renderNoReport(panel, ELEMENT_PAYLOAD);

            expectNoInjection(panel);
            expect(panel.textContent).toContain(ELEMENT_PAYLOAD);
        });
    });

    describe('ConfirmationCard', () => {
        it('renders an element name containing an XSS payload as literal TEXT', () => {
            renderConfirmationCard(panel, plan(), policy);

            expectNoInjection(panel);
            expect(panel.textContent).toContain(ELEMENT_PAYLOAD);
            expect(panel.innerHTML).toContain('&lt;img src=x onerror=alert(1)&gt;');
            expect(panel.innerHTML).not.toContain('<img src=x');
        });

        it('escapes the refusal message and the replan hash', () => {
            renderConfirmationRefusal(panel, ELEMENT_PAYLOAD, plan());

            expectNoInjection(panel);
            expect(panel.textContent).toContain(ELEMENT_PAYLOAD);
        });

        /**
         * THE QUOTE-BREAKOUT REGRESSION. `planHash` lands inside
         * `data-plan-hash="…"`. With the old local `esc()` — `&`, `<`, `>` only —
         * a hash containing `"` closed the attribute and minted an `onload`
         * handler on the confirm button. The shared `escHtml` escapes `"`.
         */
        it('a quote in planHash cannot break out of the data-plan-hash attribute', () => {
            renderConfirmationCard(panel, plan({ planHash: ATTR_PAYLOAD }), policy);

            expectNoInjection(panel);
            const confirm = panel.querySelector('[data-role="confirm"]');
            expect(confirm).not.toBeNull();
            expect(confirm?.getAttribute('onload')).toBeNull();
            // The hash round-trips intact — escaping must not corrupt the value
            // the approval binds to.
            expect(confirm?.getAttribute('data-plan-hash')).toBe(ATTR_PAYLOAD);
        });

        it('a quote in a replan hash cannot break out either', () => {
            renderConfirmationRefusal(panel, 'stale', plan({ planHash: ATTR_PAYLOAD }));

            expectNoInjection(panel);
            const confirm = panel.querySelector('[data-role="confirm"]');
            expect(confirm?.getAttribute('data-plan-hash')).toBe(ATTR_PAYLOAD);
        });
    });
});
