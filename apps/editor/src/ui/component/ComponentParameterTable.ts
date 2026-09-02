/**
 * ComponentParameterTable — the `'parameters'` tab that has existed as a TYPE with nothing
 * behind it since S55 (`apps/component-editor/src/stores/viewTabStore.ts:14` declares
 * `'sketch' | '3d' | 'parameters'`; `AppShell.ts:45` renders its label; nothing renders its
 * body). This is the body, built in the CANONICAL editor rather than the rival runtime
 * ADR-0376 **D1** retires.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * §PARAM-SOURCE-IS-VISIBLE — the table's whole reason to exist
 * ═══════════════════════════════════════════════════════════════════════════════════════
 *
 * ⭐ **A parameter table that shows only NAME and VALUE is the D4 defect with a UI on top.**
 * C110 §2.2 makes the precedence `instance > type > expression > definition default`, and
 * §2.3 records what the inverted order cost: a formula *"written, persisted, validated,
 * dependency-sorted — and never evaluated, with `ok: true` and zero diagnostics."* The user-
 * visible symptom of every failure in that family is **a plausible number whose SOURCE is
 * invisible**. So every row here names its source, and the four sources are four visibly
 * different things.
 *
 * ⛔ **`§SUPERSEDED-DEFAULT` REACHES THE SCREEN.** C110 §2.4 makes the both-present case a
 * `warn`, deliberately not an `error` — which means it does **not** fail the pass and would be
 * discarded by any renderer that only draws values. §OPENING-PROFILE-PANEL-REACHABILITY
 * measured the identical shape one panel over: *"`dispatch()` returned `void` and sent every
 * refusal to `console.warn` … a user whose change was correctly refused saw a control that
 * appeared to do nothing."* Every diagnostic is rendered against its parameter, and the
 * unattached ones are rendered too.
 *
 * ⛔ **THE UNIT LABEL IS DERIVED FROM THE SEAM, NEVER TYPED.** C110 §3.1 rules metres
 * canonical; C110 §3.3 measures that **the code says millimetres today** and calls the delta
 * OWED. A table that printed "m" because the contract says metres would be asserting the
 * repository it wishes it had — the exact failure mode CLAUDE.md's correction boxes are made
 * of. The label is computed from `RUNTIME_LENGTH_UNITS_PER_METRE` (family-instance's
 * `§4D-ONE-LENGTH-SEAM`), so the day D3 flips that constant to 1 this table says `m` without
 * being edited, and until then it says `mm` because that is what the number IS.
 *
 * ⛔ NO STORE, NO COMMAND BUS (P6). The table renders a resolver input and reports edits
 * through a callback; the CALLER dispatches. It reads `resolveParameter` — the ONE expression
 * engine and the ONE resolver (audit R1) — and computes nothing the resolver computes.
 */

import {
    resolveParameter,
    type FamilyParameter,
    type ResolverDiagnostic,
    type ResolverInput,
    type ResolverResult,
} from '@pryzm/family-runtime';
import { RUNTIME_LENGTH_UNITS_PER_METRE } from '@pryzm/family-instance';

/** Which of C110 §2.2's four sources supplied this row's value — or none. */
export type ParameterValueSource =
    | 'instance'
    | 'type'
    | 'expression'
    | 'default'
    | 'unresolved';

export interface ParameterRowModel {
    readonly parameter: FamilyParameter;
    readonly source: ParameterValueSource;
    /** The resolver's own value for this parameter, or `undefined` when it produced none. */
    readonly value: number | string | undefined;
    /** Every diagnostic the resolver attributed to this parameter. */
    readonly diagnostics: readonly ResolverDiagnostic[];
    /** True when a dead `defaultValue` sits under a live expression (C110 §2.4). */
    readonly hasSupersededDefault: boolean;
}

export interface ParameterTableModel {
    readonly rows: readonly ParameterRowModel[];
    readonly result: ResolverResult;
    /** Diagnostics that name no parameter — they belong to the pass, not to a row. */
    readonly passDiagnostics: readonly ResolverDiagnostic[];
}

/**
 * The label for the unit a resolved number is actually IN.
 *
 * ⚠ `'length'` follows the seam constant (see the header). `'angle'` is radians on both
 * sides of the runtime boundary — `units.ts` records that declared absence — so it is not a
 * candidate for the same drift.
 */
export function runtimeUnitLabel(dataType: FamilyParameter['dataType']): string {
    if (dataType === 'angle') return 'rad';
    if (dataType !== 'length') return '';
    // ⚠ WIDENED ON PURPOSE. `RUNTIME_LENGTH_UNITS_PER_METRE` is a `const` with no annotation,
    // so TypeScript infers the LITERAL type `1000` and rejects `=== 1` as *"types '1000' and
    // '1' have no overlap"* (root `tsc`, measured). That error is the compiler stating the
    // very fact C110 §3.3 records: the metre branch is unreachable TODAY. It becomes
    // reachable the day D3 flips the constant, and deleting the branch to satisfy the
    // compiler would delete the thing that makes this function survive that flip untouched.
    const perMetre: number = RUNTIME_LENGTH_UNITS_PER_METRE;
    if (perMetre === 1) return 'm';
    if (perMetre === 1000) return 'mm';
    return `1/${perMetre} m`;
}

function hasOwn(o: Readonly<Record<string, unknown>>, k: string): boolean {
    return Object.prototype.hasOwnProperty.call(o, k);
}

/**
 * ⭐ `§PARAM-SOURCE-DERIVED-THEN-VERIFIED`.
 *
 * The source is derived from the INPUT in C110 §2.2's order, and then **verified against the
 * resolver's own output**: if the resolver produced no value for the parameter, the row reads
 * `unresolved` no matter what the derivation said. That second step is what stops this table
 * becoming a rival implementation of the precedence — the derivation can only ever LABEL a
 * value the authoritative resolver actually produced, never assert one it did not.
 *
 * ⚠ **OWED, to `packages/family-runtime` (lane 4A's file, not this lane's).** `ResolverOk`
 * returns `values` and `order` but not the SOURCE, so this derivation exists at all only
 * because the resolver does not report it. Returning a per-parameter source would delete this
 * function and remove the one place the precedence is stated twice (C84 EI-9). Named in
 * `phase4/lane-4f-the-authoring-ui.md`.
 */
export function buildParameterTableModel(input: ResolverInput): ParameterTableModel {
    const result = resolveParameter(input);
    const values = result.ok ? result.values : {};
    const byParam = new Map<string, ResolverDiagnostic[]>();
    const passDiagnostics: ResolverDiagnostic[] = [];
    for (const d of result.diagnostics) {
        // `parameterId` is `string | null` — a null one belongs to the PASS, and rendering it
        // against an arbitrary row would attribute a fault to a parameter that has none.
        if (d.parameterId !== null) {
            const list = byParam.get(d.parameterId) ?? [];
            list.push(d);
            byParam.set(d.parameterId, list);
        } else {
            passDiagnostics.push(d);
        }
    }

    const rows = input.parameters.map((p): ParameterRowModel => {
        const diagnostics = byParam.get(p.id) ?? [];
        const value = hasOwn(values, p.name) ? values[p.name] : undefined;

        let source: ParameterValueSource;
        if (hasOwn(input.instanceOverrides, p.id)) source = 'instance';
        else if (input.type && hasOwn(input.type.values, p.id)) source = 'type';
        else if (diagnostics.some((d) => d.code === 'expression-parse')) {
            // An expression that did not PARSE never became a source: `resolveParameter`
            // compiles to `ast = null` and the parameter falls through to its default.
            source = p.defaultValue !== null ? 'default' : 'unresolved';
        } else if (
            p.expression !== null && p.expression.trim() !== '' && p.dataType !== 'string'
        ) source = 'expression';
        else if (p.defaultValue !== null) source = 'default';
        else source = 'unresolved';

        // THE VERIFICATION STEP. A label without a value is a claim about a number that does
        // not exist — C110 §2.5's *"a missing value is visibly missing; a substituted one is
        // not"*, applied to the label as well as the value.
        if (value === undefined) source = 'unresolved';

        return {
            parameter: p,
            source,
            value,
            diagnostics,
            hasSupersededDefault: diagnostics.some((d) => d.code === 'superseded-default'),
        };
    });

    return { rows, result, passDiagnostics };
}

/* ------------------------------------------------------------------ */
/* The DOM                                                             */
/* ------------------------------------------------------------------ */

const INK = '#1a1a1a';
const MUTED = '#6b6b76';
const LINE = '#d8dce3';
const PURPLE = '#6600FF';
const REFUSAL = '#b3261e';
const WARN = '#8a5a00';

const SOURCE_LABEL: Readonly<Record<ParameterValueSource, string>> = {
    instance: 'Instance',
    type: 'Type',
    expression: 'Formula',
    default: 'Default',
    unresolved: 'Not resolved',
};

/** Why this source won, in the author's words — C110 §2.2's four reasons, one each. */
const SOURCE_TITLE: Readonly<Record<ParameterValueSource, string>> = {
    instance: 'An override on THIS occurrence. Beats the type, the formula and the default (C110 §2.2).',
    type: 'A value from the selected type. Beats the formula and the default (C110 §2.2).',
    expression: 'Computed by this parameter’s formula from already-resolved inputs (C110 §2.2).',
    default: 'The definition default — what applies when nothing else does (C110 §2.2).',
    unresolved: 'No value was produced. The diagnostics below say why; nothing has been substituted (C110 §2.5).',
};

function el<K extends keyof HTMLElementTagNameMap>(
    tag: K, css: string, text?: string,
): HTMLElementTagNameMap[K] {
    const n = document.createElement(tag);
    n.style.cssText = css;
    if (text !== undefined) n.textContent = text;
    return n;
}

export interface ComponentParameterTableOptions {
    /** Prefix for the `data-*` read-back attributes. */
    readonly attrPrefix?: string;
}

export interface ComponentParameterTableHandle {
    readonly root: HTMLElement;
    /** Re-render against a new resolver input. Returns the model it rendered. */
    render(input: ResolverInput): ParameterTableModel;
    /** The model most recently rendered, or null before the first render. */
    readonly model: ParameterTableModel | null;
}

/**
 * Build the parameter table. Every fact a row asserts is stamped into `data-*` so it can be
 * read back **from the DOM** — the layer the user experiences (audit R14) — rather than from
 * the function that produced it.
 */
export function createComponentParameterTable(
    opts: ComponentParameterTableOptions = {},
): ComponentParameterTableHandle {
    const prefix = opts.attrPrefix ?? 'cpt';
    const root = el('div', 'font:13px/1.45 system-ui,sans-serif;color:' + INK + ';');
    root.setAttribute(`data-${prefix}-root`, '');

    let model: ParameterTableModel | null = null;

    const render = (input: ResolverInput): ParameterTableModel => {
        model = buildParameterTableModel(input);
        root.replaceChildren();

        const table = el('table', 'width:100%;border-collapse:collapse;');
        table.setAttribute(`data-${prefix}-table`, '');
        const thead = document.createElement('thead');
        const hr = document.createElement('tr');
        for (const h of ['Parameter', 'Scope', 'Value', 'Source', 'Formula']) {
            const th = el('th',
                'text-align:left;font-size:11px;font-weight:700;letter-spacing:.03em;' +
                'text-transform:uppercase;color:' + MUTED + ';padding:6px 8px;border-bottom:1px solid ' + LINE + ';',
                h);
            hr.appendChild(th);
        }
        thead.appendChild(hr);
        table.appendChild(thead);

        const tbody = document.createElement('tbody');
        for (const row of model.rows) {
            const p = row.parameter;
            const tr = document.createElement('tr');
            tr.setAttribute(`data-${prefix}-row`, p.id);
            tr.setAttribute(`data-${prefix}-source`, row.source);
            tr.setAttribute(`data-${prefix}-datatype`, p.dataType);

            const td = (css = ''): HTMLTableCellElement =>
                el('td', 'padding:6px 8px;border-bottom:1px solid #eef0f4;vertical-align:top;' + css);

            const nameCell = td();
            nameCell.appendChild(el('div', 'font-weight:600;', p.name));
            nameCell.appendChild(el('div', 'font-size:11px;color:' + MUTED + ';', p.dataType));
            tr.appendChild(nameCell);

            tr.appendChild(td('font-size:11.5px;color:' + MUTED + ';'))
                .appendChild(el('span', '', p.kind === 'instance' ? 'Instance' : 'Type'));

            // VALUE — and an unresolved parameter shows a dash, never a zero and never a
            // borrowed default (C110 §6.5: an invented value is worse than a missing one).
            const unit = runtimeUnitLabel(p.dataType);
            const valueText = row.value === undefined
                ? '—'
                : typeof row.value === 'number'
                    ? `${row.value}${unit ? ' ' + unit : ''}`
                    : String(row.value);
            const valueCell = td('font-variant-numeric:tabular-nums;');
            valueCell.setAttribute(`data-${prefix}-value`, row.value === undefined ? '' : String(row.value));
            if (unit) valueCell.setAttribute(`data-${prefix}-unit`, unit);
            valueCell.textContent = valueText;
            if (row.value === undefined) valueCell.style.color = REFUSAL;
            tr.appendChild(valueCell);

            const srcCell = td();
            const badge = el('span',
                'display:inline-block;padding:2px 7px;border-radius:999px;font-size:11px;font-weight:700;' +
                (row.source === 'unresolved'
                    ? `color:${REFUSAL};border:1px solid ${REFUSAL};`
                    : row.source === 'expression'
                        ? `color:#fff;background:${PURPLE};`
                        : `color:${INK};border:1px solid ${LINE};`),
                SOURCE_LABEL[row.source]);
            badge.title = SOURCE_TITLE[row.source];
            badge.setAttribute(`data-${prefix}-source-badge`, row.source);
            srcCell.appendChild(badge);
            tr.appendChild(srcCell);

            const fCell = td('font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11.5px;');
            fCell.setAttribute(`data-${prefix}-expression`, p.expression ?? '');
            fCell.textContent = p.expression ?? '';
            tr.appendChild(fCell);
            tbody.appendChild(tr);

            // ── the row's diagnostics, on their own row so long text does not squash the
            //    table. ⛔ RENDERED, not logged — including the WARN-severity ones, which is
            //    the whole §SUPERSEDED-DEFAULT point.
            // ⚠ The PROVENANCE field triggers this block on its own. `hasSupersededDefault`
            // is diagnostic-driven (a dead default still sitting under a live expression);
            // `supersededDefault` is the field `introduce-expression` writes AFTER clearing
            // it, so a correctly-migrated parameter has the provenance and NO diagnostic —
            // and would have rendered nothing had this condition read the diagnostics alone.
            if (row.diagnostics.length > 0 || p.supersededDefault !== undefined) {
                const dtr = document.createElement('tr');
                dtr.setAttribute(`data-${prefix}-diag-row`, p.id);
                const cell = el('td',
                    'padding:0 8px 8px;border-bottom:1px solid #eef0f4;font-size:11.5px;line-height:1.45;');
                cell.colSpan = 5;
                for (const d of row.diagnostics) {
                    const line = el('div',
                        'color:' + (d.severity === 'error' ? REFUSAL : WARN) + ';',
                        `${d.severity === 'error' ? '⛔' : '⚠'} ${d.code}: ${d.message}`);
                    line.setAttribute(`data-${prefix}-diag`, d.code);
                    line.setAttribute(`data-${prefix}-diag-severity`, d.severity);
                    cell.appendChild(line);
                }
                if (p.supersededDefault !== undefined) {
                    // Provenance, not a value (C110 §2.4-b). Shown so an author can see what
                    // the formula replaced instead of finding it only in the file.
                    const line = el('div', 'color:' + MUTED + ';',
                        `Superseded default: ${String(p.supersededDefault)} — kept as provenance, never resolved.`);
                    line.setAttribute(`data-${prefix}-superseded`, String(p.supersededDefault));
                    cell.appendChild(line);
                }
                dtr.appendChild(cell);
                tbody.appendChild(dtr);
            }
        }
        table.appendChild(tbody);
        root.appendChild(table);

        if (model.rows.length === 0) {
            const empty = el('div', 'padding:10px 8px;color:' + MUTED + ';',
                'This component declares no parameters.');
            empty.setAttribute(`data-${prefix}-empty`, '');
            root.appendChild(empty);
        }

        // Pass-level state. ⛔ `ok:false` is stated, because a table of dashes with no
        // explanation and a component that genuinely has no values look the same.
        const foot = el('div',
            'margin-top:8px;padding:7px 8px;border-radius:6px;font-size:11.5px;' +
            (model.result.ok
                ? `color:${MUTED};background:#f6f7fa;`
                : `color:${REFUSAL};border:1px solid ${REFUSAL};`));
        foot.setAttribute(`data-${prefix}-status`, model.result.ok ? 'ok' : 'error');
        const errs = model.result.diagnostics.filter((d) => d.severity === 'error').length;
        const warns = model.result.diagnostics.filter((d) => d.severity === 'warn').length;
        foot.textContent = model.result.ok
            ? `Resolved ${model.rows.filter((r) => r.source !== 'unresolved').length} of ${model.rows.length} parameters` +
              (warns > 0 ? ` · ${warns} warning${warns === 1 ? '' : 's'}` : '')
            : `Resolution FAILED — ${errs} error${errs === 1 ? '' : 's'}. No values were produced for this pass; ` +
              'nothing has been substituted.';
        root.appendChild(foot);

        for (const d of model.passDiagnostics) {
            const line = el('div',
                'margin-top:4px;font-size:11.5px;color:' + (d.severity === 'error' ? REFUSAL : WARN) + ';',
                `${d.severity === 'error' ? '⛔' : '⚠'} ${d.code}: ${d.message}`);
            line.setAttribute(`data-${prefix}-pass-diag`, d.code);
            root.appendChild(line);
        }

        return model;
    };

    return {
        root,
        render,
        get model(): ParameterTableModel | null { return model; },
    };
}
