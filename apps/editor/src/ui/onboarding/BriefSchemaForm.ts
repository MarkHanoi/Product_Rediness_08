// O.12.b (Onboarding · typology-declared brief) — DYNAMIC brief-control renderer.
//
// WHAT THIS IS
// ------------
// A small, self-contained vanilla-DOM renderer that takes a typology's L0
// `BriefSchema` (O.12.a — declared on the `TypologyManifest`) and renders each
// `BriefField` as the right on-brand control:
//
//   range       → slider with a live value label ("Bedrooms  3")
//   stepper     → −/＋ integer stepper
//   select      → segmented buttons (single choice)
//   multiselect → chip group (zero-or-more)
//   toggle      → switch
//   text        → free-text input ("anything else")
//
// The collected values form a structured `Brief` object keyed by field `id`
// (the SAME keys the live generator/picker consume — see the apartment manifest
// note). The host (RACChatbotPanel) reads `getValues()` on submit and dispatches
// one `capture-brief-field` per field so the captured brief is structured, not a
// prose blob. O.12.c binds the pipeline to these keys; O.12.b only owns the UI +
// the structured output.
//
// LAYER + STYLE
// -------------
// Layer:   UI — L5 (vanilla DOM, no React) — matches RACChatbotPanel.
// Brand:   white + #6600FF, compact (founder rule: NO black). All visuals live in
//          `onboardingStyles.ts` under `.rac-brief-*` (scoped to the
//          `.rac-onboarding-overlay` card so it inherits the glass chrome).
// Pure-ish: no module-load DOM access; the constructor is the only point that
//          builds elements, so happy-dom unit tests can drive the lifecycle.
//
// Design of record:
//   - docs/03-execution/specs/SPEC-TYPOLOGY-BRIEF-SCHEMA.md §4 (dynamic brief UI)
//   - packages/schemas/src/typology/briefSchema.ts (the L0 field shapes)

import {
    BriefSchemaSchema,
    type BriefField,
    type BriefSchema,
} from '@pryzm/schemas';

/** A structured brief value keyed by field id. JSON-safe primitives + arrays. */
export type BriefValues = Record<string, string | number | boolean | string[]>;

export interface BriefSchemaFormOptions {
    /** The typology-declared schema to render. Validated defensively on build. */
    readonly schema: BriefSchema;
    /** Fired on every control change with the full current value snapshot. */
    readonly onChange?: (values: BriefValues) => void;
}

/**
 * The default value for one field — drives the initial control state and the
 * structured brief before the user touches anything.
 */
function defaultFor(field: BriefField): string | number | boolean | string[] {
    switch (field.kind) {
        case 'range':
        case 'stepper':
            return field.default;
        case 'select':
            return field.default;
        case 'multiselect':
            return [...field.default];
        case 'toggle':
            return field.default;
        case 'text':
            return '';
    }
}

/**
 * Renders a `BriefSchema` as compact on-brand controls and captures a structured
 * `Brief` keyed by field id.
 *
 *   const form = new BriefSchemaForm({ schema, onChange });
 *   host.appendChild(form.build());
 *   const values = form.getValues();   // { bedrooms: 3, style: 'modern', … }
 *   form.dispose();
 */
export class BriefSchemaForm {
    private readonly schema: BriefSchema;
    private readonly onChange?: (values: BriefValues) => void;
    private readonly values: BriefValues = {};
    private root: HTMLElement | null = null;

    constructor(opts: BriefSchemaFormOptions) {
        // Defensive parse — if a pack ships a malformed schema we still want a
        // typed object (and the host can fall back to free-text on throw).
        this.schema = BriefSchemaSchema.parse(opts.schema);
        this.onChange = opts.onChange;
        for (const field of this.schema.fields) {
            this.values[field.id] = defaultFor(field);
        }
    }

    /** Build the form root and return it for mounting. Idempotent. */
    build(): HTMLElement {
        if (this.root) return this.root;
        const root = document.createElement('div');
        root.className = 'rac-brief-form';
        root.setAttribute('data-testid', 'rac-brief-form');
        this.root = root;

        for (const field of this.schema.fields) {
            root.appendChild(this.renderField(field));
        }
        return root;
    }

    /** Snapshot of the current structured brief, keyed by field id. */
    getValues(): BriefValues {
        return { ...this.values };
    }

    /** Detach DOM + drop references. Idempotent. */
    dispose(): void {
        if (this.root?.parentNode) this.root.parentNode.removeChild(this.root);
        this.root = null;
    }

    // ── internals ────────────────────────────────────────────────────────────

    private emitChange(): void {
        try {
            this.onChange?.(this.getValues());
        } catch (err) {
            console.warn('[brief-form] onChange listener threw (swallowed):', err);
        }
    }

    private setValue(id: string, value: string | number | boolean | string[]): void {
        this.values[id] = value;
        this.emitChange();
    }

    /** A labelled <div> row wrapping a control. */
    private fieldRow(field: BriefField, control: HTMLElement, valueEl?: HTMLElement): HTMLElement {
        const row = document.createElement('div');
        row.className = `rac-brief-row rac-brief-row--${field.kind}`;
        row.setAttribute('data-testid', `rac-brief-row-${field.id}`);
        row.setAttribute('data-field-id', field.id);

        const head = document.createElement('div');
        head.className = 'rac-brief-head';
        const label = document.createElement('label');
        label.className = 'rac-brief-label';
        label.textContent = field.label;
        head.appendChild(label);
        if (valueEl) head.appendChild(valueEl);
        row.appendChild(head);
        row.appendChild(control);
        return row;
    }

    private renderField(field: BriefField): HTMLElement {
        switch (field.kind) {
            case 'range':
                return this.renderRange(field);
            case 'stepper':
                return this.renderStepper(field);
            case 'select':
                return this.renderSelect(field);
            case 'multiselect':
                return this.renderMultiselect(field);
            case 'toggle':
                return this.renderToggle(field);
            case 'text':
                return this.renderText(field);
        }
    }

    private formatNumber(value: number, unit?: string): string {
        const n = Number.isInteger(value) ? String(value) : value.toFixed(1);
        return unit ? `${n} ${unit}` : n;
    }

    // range → slider with a live value label.
    private renderRange(field: Extract<BriefField, { kind: 'range' }>): HTMLElement {
        const valueEl = document.createElement('span');
        valueEl.className = 'rac-brief-value';
        valueEl.setAttribute('data-testid', `rac-brief-value-${field.id}`);
        valueEl.textContent = this.formatNumber(field.default, field.unit);

        const input = document.createElement('input');
        input.type = 'range';
        input.className = 'rac-brief-range';
        input.setAttribute('data-testid', `rac-brief-input-${field.id}`);
        input.min = String(field.min);
        input.max = String(field.max);
        input.step = String(field.step);
        input.value = String(field.default);
        input.setAttribute('aria-label', field.label);
        input.addEventListener('input', () => {
            const v = Number(input.value);
            valueEl.textContent = this.formatNumber(v, field.unit);
            this.setValue(field.id, v);
        });
        return this.fieldRow(field, input, valueEl);
    }

    // stepper → −/＋ integer stepper.
    private renderStepper(field: Extract<BriefField, { kind: 'stepper' }>): HTMLElement {
        const valueEl = document.createElement('span');
        valueEl.className = 'rac-brief-value';
        valueEl.setAttribute('data-testid', `rac-brief-value-${field.id}`);
        valueEl.textContent = this.formatNumber(field.default, field.unit);

        const group = document.createElement('div');
        group.className = 'rac-brief-stepper';

        let current = field.default;
        const apply = (next: number): void => {
            current = Math.min(field.max, Math.max(field.min, next));
            valueEl.textContent = this.formatNumber(current, field.unit);
            this.setValue(field.id, current);
            minus.disabled = current <= field.min;
            plus.disabled = current >= field.max;
        };

        const minus = document.createElement('button');
        minus.type = 'button';
        minus.className = 'rac-brief-step-btn';
        minus.setAttribute('data-testid', `rac-brief-dec-${field.id}`);
        minus.setAttribute('aria-label', `Decrease ${field.label}`);
        minus.textContent = '−';
        minus.addEventListener('click', () => apply(current - 1));

        const plus = document.createElement('button');
        plus.type = 'button';
        plus.className = 'rac-brief-step-btn';
        plus.setAttribute('data-testid', `rac-brief-inc-${field.id}`);
        plus.setAttribute('aria-label', `Increase ${field.label}`);
        plus.textContent = '+';
        plus.addEventListener('click', () => apply(current + 1));

        // Initial disabled state at the bounds.
        minus.disabled = current <= field.min;
        plus.disabled = current >= field.max;

        group.appendChild(minus);
        group.appendChild(plus);
        return this.fieldRow(field, group, valueEl);
    }

    // select → segmented single-choice buttons.
    private renderSelect(field: Extract<BriefField, { kind: 'select' }>): HTMLElement {
        const group = document.createElement('div');
        group.className = 'rac-brief-segments';
        group.setAttribute('role', 'radiogroup');
        group.setAttribute('aria-label', field.label);

        const buttons: HTMLButtonElement[] = [];
        const select = (value: string): void => {
            this.setValue(field.id, value);
            for (const b of buttons) {
                const on = b.getAttribute('data-value') === value;
                b.classList.toggle('rac-brief-segment--on', on);
                b.setAttribute('aria-checked', on ? 'true' : 'false');
            }
        };

        for (const opt of field.options) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'rac-brief-segment';
            btn.setAttribute('role', 'radio');
            btn.setAttribute('data-value', opt.value);
            btn.setAttribute('data-testid', `rac-brief-opt-${field.id}-${opt.value}`);
            btn.textContent = opt.label;
            const on = opt.value === field.default;
            btn.classList.toggle('rac-brief-segment--on', on);
            btn.setAttribute('aria-checked', on ? 'true' : 'false');
            btn.addEventListener('click', () => select(opt.value));
            buttons.push(btn);
            group.appendChild(btn);
        }
        return this.fieldRow(field, group);
    }

    // multiselect → chip group (zero-or-more).
    private renderMultiselect(field: Extract<BriefField, { kind: 'multiselect' }>): HTMLElement {
        const group = document.createElement('div');
        group.className = 'rac-brief-segments';
        group.setAttribute('role', 'group');
        group.setAttribute('aria-label', field.label);

        const selected = new Set<string>(field.default);
        const toggle = (value: string, btn: HTMLButtonElement): void => {
            if (selected.has(value)) selected.delete(value);
            else selected.add(value);
            const on = selected.has(value);
            btn.classList.toggle('rac-brief-segment--on', on);
            btn.setAttribute('aria-checked', on ? 'true' : 'false');
            this.setValue(field.id, [...selected]);
        };

        for (const opt of field.options) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'rac-brief-segment';
            btn.setAttribute('role', 'checkbox');
            btn.setAttribute('data-value', opt.value);
            btn.setAttribute('data-testid', `rac-brief-opt-${field.id}-${opt.value}`);
            btn.textContent = opt.label;
            const on = selected.has(opt.value);
            btn.classList.toggle('rac-brief-segment--on', on);
            btn.setAttribute('aria-checked', on ? 'true' : 'false');
            btn.addEventListener('click', () => toggle(opt.value, btn));
            group.appendChild(btn);
        }
        return this.fieldRow(field, group);
    }

    // toggle → switch.
    private renderToggle(field: Extract<BriefField, { kind: 'toggle' }>): HTMLElement {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'rac-brief-switch';
        btn.setAttribute('role', 'switch');
        btn.setAttribute('data-testid', `rac-brief-input-${field.id}`);
        btn.setAttribute('aria-label', field.label);

        let on = field.default;
        const apply = (): void => {
            btn.classList.toggle('rac-brief-switch--on', on);
            btn.setAttribute('aria-checked', on ? 'true' : 'false');
        };
        apply();
        btn.addEventListener('click', () => {
            on = !on;
            apply();
            this.setValue(field.id, on);
        });

        const knob = document.createElement('span');
        knob.className = 'rac-brief-switch-knob';
        knob.setAttribute('aria-hidden', 'true');
        btn.appendChild(knob);
        return this.fieldRow(field, btn);
    }

    // text → free-text input ("anything else").
    private renderText(field: Extract<BriefField, { kind: 'text' }>): HTMLElement {
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'rac-brief-text';
        input.setAttribute('data-testid', `rac-brief-input-${field.id}`);
        input.autocomplete = 'off';
        input.setAttribute('aria-label', field.label);
        if (field.placeholder) input.placeholder = field.placeholder;
        input.addEventListener('input', () => this.setValue(field.id, input.value));
        return this.fieldRow(field, input);
    }
}
