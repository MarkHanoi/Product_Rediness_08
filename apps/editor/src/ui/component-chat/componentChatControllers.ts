/**
 * componentChatControllers — bind the deterministic resolvers (`componentChatIntents`)
 * to a surface's EXISTING command path, producing the transcript a `ComponentChatStrip`
 * shows. Lane U6. §U6-AI-AUTHORING · UIUX-PLAN §U6 · C16 CA-18/CA-21 · C110 §2.4/§4.4.
 *
 * ⛔ A controller dispatches nothing itself — it calls the port the hosting surface
 * (the U2 property section, the U3 workspace) supplies, whose implementation carries
 * the ask to `component.setInstanceParameter` / `component.swapType` (the composed bus,
 * CA-21 read-back) or to the `introduce-expression` op on the draft. Every refusal the
 * port returns reaches the transcript verbatim — the bus/op is the ONE voice on a
 * doomed edit (the §OPENING-PROFILE-PANEL-REACHABILITY lesson: never a silent no-op).
 */

import type { ComponentDefinitionParameterView, ComponentDefinitionView } from '@pryzm/plugin-component';
import type { ComponentChatController, ComponentChatLine } from './ComponentChatStrip.js';
import {
    expressionExamples,
    instanceAuthorable,
    instanceExamples,
    resolveComponentExpressionAsk,
    resolveComponentInstanceAsk,
} from './componentChatIntents.js';

function plain(text: string): ComponentChatLine { return { text, tone: 'plain' }; }
function warn(text: string): ComponentChatLine { return { text, tone: 'warn' }; }
function withOptions(reason: string, options: readonly string[] | undefined): string {
    return options && options.length > 0 ? `${reason} Options: ${options.join(', ')}.` : reason;
}

/* ══════════════════════════════════════════════════════════════════════════════ */
/* Surface 1 — the placed-instance controller                                       */
/* ══════════════════════════════════════════════════════════════════════════════ */

/** What the property section must provide. Each mutating method returns the bus
 *  refusal text, or `null` on success (mirrors `ComponentSection`'s `dispatch`). */
export interface ComponentInstanceChatPort {
    /** The selected instance's LOADED definition, or `null` when it is not loaded. */
    view(): ComponentDefinitionView | null;
    /** For the honest not-loaded message. */
    definitionRef(): string;
    setParameter(parameterId: string, value: number | string | boolean): Promise<string | null>;
    clearParameter(parameterId: string): Promise<string | null>;
    swapType(typeId: string): Promise<string | null>;
}

export function makeComponentInstanceController(port: ComponentInstanceChatPort): ComponentChatController {
    const notLoaded = (): ComponentChatLine[] => [warn(
        `The definition ${port.definitionRef()} is not loaded in this project's component catalogue, ` +
        'so I cannot read its parameters or types. Load it, then ask again.',
    )];
    return {
        headline: 'Describe a change to this placed component and I will apply it.',
        placeholder: 'e.g. set width 1500, or swap to W-1500',
        examples: () => {
            const v = port.view();
            return v ? instanceExamples(v) : ['what can I change'];
        },
        async handle(text): Promise<readonly ComponentChatLine[]> {
            const view = port.view();
            if (view === null) return notLoaded();
            const res = resolveComponentInstanceAsk(text, view);
            switch (res.kind) {
                case 'describe': {
                    const lines = instanceAuthorable(view);
                    return [plain(lines.length > 0 ? `I can change — ${lines.join(' · ')}.` : 'This component has nothing chat-authorable.')];
                }
                case 'miss': return [warn(withOptions(res.reason, res.options))];
                case 'refusal': return [warn(withOptions(res.reason, res.options))];
                case 'set-parameter': {
                    const refusal = await port.setParameter(res.parameterId, res.value);
                    return refusal !== null ? [warn(refusal)] : [plain(`${res.said} — set.`)];
                }
                case 'clear-parameter': {
                    const refusal = await port.clearParameter(res.parameterId);
                    return refusal !== null ? [warn(refusal)] : [plain(res.said)];
                }
                case 'swap-type': {
                    const refusal = await port.swapType(res.typeId);
                    return refusal !== null ? [warn(refusal)] : [plain(`${res.said} — swapped.`)];
                }
            }
        },
    };
}

/* ══════════════════════════════════════════════════════════════════════════════ */
/* Surface 2 — the definition-authoring (expression) controller                     */
/* ══════════════════════════════════════════════════════════════════════════════ */

/** One diagnostic, structurally matching `@pryzm/family-runtime`'s `ResolverDiagnostic`
 *  (kept structural to avoid dragging the runtime type across a UI boundary). */
export interface ExpressionDiagnosticLike {
    readonly code: string;
    readonly severity: 'error' | 'warning' | string;
    readonly message: string;
}

/** The live preview the workspace's `previewExpression` returns (structural mirror of
 *  `ComponentDefinitionWorkspaceHandle`'s `ExpressionPreview`). */
export interface ExpressionPreviewLike {
    readonly value: number | string | undefined;
    readonly unit: string;
    readonly diagnostics: readonly ExpressionDiagnosticLike[];
    readonly clean: boolean;
    readonly willClearDefault: number | string | null;
}

/** What the definition workspace must provide — its handle's own methods, verbatim. */
export interface ComponentExpressionChatPort {
    params(): readonly Pick<ComponentDefinitionParameterView, 'id' | 'name' | 'kind' | 'dataType'>[];
    /** Pure — renders the live diagnostics, mutates nothing. `null` when the parameter
     *  is unknown to the draft. */
    preview(parameterId: string, expression: string): ExpressionPreviewLike | null;
    /** Apply the `introduce-expression` op; returns the op/schema refusal, or `null`. */
    apply(parameterId: string, expression: string): Promise<string | null>;
}

export function makeComponentExpressionController(port: ComponentExpressionChatPort): ComponentChatController {
    return {
        headline: 'Describe a formula and I will author it on the parameter, gated by live diagnostics.',
        placeholder: 'e.g. make glass width the opening width minus twice the frame width',
        examples: () => expressionExamples(port.params()),
        async handle(text): Promise<readonly ComponentChatLine[]> {
            const res = resolveComponentExpressionAsk(text, port.params());
            switch (res.kind) {
                case 'describe': {
                    const names = port.params().map((p) => p.name);
                    return [plain(names.length > 0 ? `Parameters I can put a formula on — ${names.join(', ')}.` : 'This definition has no parameters yet.')];
                }
                case 'miss': return [warn(withOptions(res.reason, res.options))];
                case 'refusal': return [warn(withOptions(res.reason, res.options))];
                case 'expression': {
                    // ⭐ DIAGNOSTICS GATE — exactly as the U3 UI does when a user types the
                    // formula: a preview that is not clean is REFUSED here and never applied.
                    const pv = port.preview(res.parameterId, res.expression);
                    if (pv === null) {
                        return [warn(`I could not preview "${res.expression}" — the parameter is not in the current draft.`)];
                    }
                    if (!pv.clean) {
                        const errs = pv.diagnostics.map((d) => `${d.severity === 'error' ? '⛔' : '⚠'} ${d.code}: ${d.message}`);
                        return [warn(`I did not author "${res.said}" — the formula does not check out:\n${errs.join('\n')}`)];
                    }
                    const refusal = await port.apply(res.parameterId, res.expression);
                    if (refusal !== null) return [warn(refusal)];
                    const val = pv.value === undefined ? '' : ` It resolves to ${String(pv.value)}${pv.unit ? ' ' + pv.unit : ''} under the current scope.`;
                    const sup = pv.willClearDefault !== null
                        ? ` The previous default (${String(pv.willClearDefault)}) was cleared and recorded as supersededDefault (a formula beats a default — ADR-0376 D4).`
                        : '';
                    return [plain(`Authored ${res.said}.${val}${sup}`)];
                }
            }
        },
    };
}
