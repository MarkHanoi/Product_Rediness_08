/**
 * EnvelopeTreeSection — the PROJECT card's "Envelopes" node for UnifiedBrowserPanel.
 *
 * ⭐ §BROWSER-LISTS-ENVELOPES (L-13311) — FOUNDER, 2026-09-11: *"Envelopes they dont appear on the
 * project browser."* Said AFTER L-13252 added two envelope categories to the ELEMENTS card.
 *
 * WHY HE STILL COULD NOT SEE THEM — three independent holes, each sufficient on its own:
 *   1. The PROJECT card (the card this panel opens with) files elements per storey from
 *      `getAllStores()`, a hand-written list of `window.*Store` globals. The envelope family has no
 *      window global by design (C114 §2a), so it sat in no storey and in no node.
 *   2. The ELEMENTS rows read `bag.runtime` — the NULL handle production constructs this panel with
 *      (`createMainLayout(props, null)`) — so they printed "—" and listed nothing (§L-12916).
 *   3. Nothing re-rendered the panel when the store changed: every other family is wired through a
 *      `bim-*-added` window event; this one publishes only `Store.subscribeDirty`.
 *
 * WHAT THIS NODE IS: Envelopes → one row per BUILDING (massing group, ADR-0383 D1) → one row per
 * envelope, labelled with the record's own `name` (unique `ENV_<LEVEL>_NNN` since L-13304), and each
 * room envelope nested under the level envelope its `withinId` names.
 *
 * ⛔ THIS FILE IS DOM ONLY. The model — which envelopes, which building each is filed under — is
 * `readEnvelopeTree` (`envelopeTreeModel.ts`), the SAME model the ELEMENTS card's envelope sub-types
 * read (§BROWSER-ONE-BUILDING-RULE), so the two cards cannot file one envelope under two buildings.
 *
 * Selection is `selectionBus.select(id, 'project-browser')` — Contract 27 §4, the SAME seam every other
 * row of this tree uses. The envelope's root group carries `userData.id` (SpaceEnvelopeMeshBuilder), so
 * `SelectionManager.selectById` resolves it with no envelope-specific code anywhere.
 *
 * Read-only UI: no store writes (P6); visibility goes through the same `applyElementVisibility` intent
 * path as every other row (C09 §4.7).
 */

import type { UBPBag } from './BrowserDataHelpers';
import { getLevels, getTypeIcon, resolveSpaceEnvelopeStore } from './BrowserDataHelpers';
import { applyElementVisibility, selectElements } from './ProjectVisibilitySection';
import { selectionBus } from '@pryzm/core-app-model';
import { readEnvelopeTree, type EnvelopeTreeGroup, type EnvelopeTreeRow } from './envelopeTreeModel';

/** The Envelopes node's own key — in `bag.envelopeNodeOpen` and as its isolate mode. */
export const ENVELOPE_TREE_ROOT = 'envelopes';

/**
 * The node keys that must be open for `elemId`'s row to be on screen — for auto-expand on a canvas
 * selection. Empty when the id is not an envelope this tree lists.
 */
export function envelopeTreeKeysFor(bag: UBPBag, elemId: string): readonly string[] {
    const model = readEnvelopeTree(resolveSpaceEnvelopeStore(bag), getLevels());
    if (!model.readable) return [];
    const g = model.buildingOf.get(elemId);
    return g === undefined ? [] : [ENVELOPE_TREE_ROOT, g.key];
}

// ── DOM ───────────────────────────────────────────────────────────────────────────────────────────

function _span(className: string, text?: string): HTMLSpanElement {
    const s = document.createElement('span');
    s.className = className;
    if (text !== undefined) s.textContent = text;
    return s;
}

function _icon(className: string): HTMLSpanElement {
    const s = _span(className);
    // §XSS-SINK-SCAN (C08 §3.1) — `getTypeIcon` returns authored SVG literals with no runtime value
    // interpolated into them, so this is markup by construction; `safe…` is the gate's declared name.
    const safeEnvelopeIconSvg = getTypeIcon('envelope');
    s.innerHTML = safeEnvelopeIconSvg;
    return s;
}

function _setVisibility(bag: UBPBag, ids: readonly string[], visible: boolean): void {
    for (const id of ids) {
        bag.elemVisible.set(id, visible);
        applyElementVisibility(bag, id, visible);
    }
}

/** True when the click landed on a row's own control rather than on the row. */
const _onControl = (e: Event): boolean => {
    const t = e.target as HTMLElement | null;
    return !!t?.closest('.pb-ubp-st-vis, .pb-ubp-st-iso, .pb-ubp-st-level-chevron');
};

/** The PROJECT card's Envelopes node. Rebuilt on every panel refresh; state lives on the bag. */
export function buildEnvelopeTreeNode(bag: UBPBag): HTMLElement {
    const model = readEnvelopeTree(resolveSpaceEnvelopeStore(bag), getLevels());
    const ids = model.readable ? model.ids : [];
    const isOpen = bag.envelopeNodeOpen.get(ENVELOPE_TREE_ROOT) ?? true;

    const block = document.createElement('div');
    block.className = 'pb-ubp-st-level';
    block.setAttribute('data-envelope-tree', ENVELOPE_TREE_ROOT);

    const hdr = document.createElement('div');
    hdr.className = 'pb-ubp-st-level-hdr';

    const chevron = _span('pb-ubp-st-level-chevron' + (isOpen ? ' pb-ubp-st-level-chevron--open' : ''), '›');
    chevron.addEventListener('click', (e) => {
        e.stopPropagation();
        bag.envelopeNodeOpen.set(ENVELOPE_TREE_ROOT, !isOpen);
        bag.refresh();
    });

    const count = _span('pb-ubp-st-level-count', model.readable ? String(ids.length) : '—');
    count.setAttribute('data-envelope-count', '');
    if (!model.readable) count.title = `Envelopes: cannot determine — ${model.text}`;

    hdr.appendChild(chevron);
    hdr.appendChild(_icon('pb-ubp-st-level-icon'));
    hdr.appendChild(_span('pb-ubp-st-level-name', 'Envelopes'));
    hdr.appendChild(count);
    if (model.readable && ids.length > 0) {
        const visKey = `tree:${ENVELOPE_TREE_ROOT}`;
        hdr.appendChild(bag.makeVisBtn(bag.typeVisible.get(visKey) ?? true, (visible) => {
            bag.typeVisible.set(visKey, visible);
            _setVisibility(bag, ids, visible);
            bag.refresh();
        }));
        hdr.appendChild(bag.makeIsoBtn(ENVELOPE_TREE_ROOT, () => [...ids]));
    }
    hdr.addEventListener('click', (e) => {
        if (_onControl(e)) return;
        bag.envelopeNodeOpen.set(ENVELOPE_TREE_ROOT, true);
        selectElements([...ids]);
        bag.refresh();
    });
    block.appendChild(hdr);

    if (!isOpen) return block;

    const children = document.createElement('div');
    children.className = 'pb-ubp-st-level-children';
    if (!model.readable) {
        children.appendChild(_span('pb-ubp-st-empty', model.text));
    } else if (model.groups.length === 0) {
        children.appendChild(_span('pb-ubp-st-empty', 'No envelopes in this project yet'));
    } else {
        for (const g of model.groups) children.appendChild(_buildGroup(bag, g, model.groups.length));
    }
    block.appendChild(children);
    return block;
}

function _buildGroup(bag: UBPBag, group: EnvelopeTreeGroup, groupCount: number): HTMLElement {
    // A single building opens by itself (the single-building flow then shows its envelopes at once);
    // several stay folded to one line each — unless the selected envelope is inside.
    const isOpen = bag.envelopeNodeOpen.get(group.key)
        ?? (groupCount === 1 || (bag.selectedElemId !== null && group.memberIds.includes(bag.selectedElemId)));

    const wrap = document.createElement('div');
    wrap.className = 'pb-ubp-st-type';
    wrap.setAttribute('data-envelope-group', group.key);

    const hdr = document.createElement('div');
    hdr.className = 'pb-ubp-st-type-hdr';

    const label = _span('pb-ubp-st-type-name', group.label);
    label.title = group.label;

    hdr.appendChild(_span('pb-ubp-st-type-chevron' + (isOpen ? ' pb-ubp-st-type-chevron--open' : ''), '›'));
    hdr.appendChild(_icon('pb-ubp-st-type-icon'));
    hdr.appendChild(label);
    hdr.appendChild(_span('pb-ubp-st-type-count', String(group.memberIds.length)));
    const visKey = `tree:${ENVELOPE_TREE_ROOT}:${group.key}`;
    hdr.appendChild(bag.makeVisBtn(bag.typeVisible.get(visKey) ?? true, (visible) => {
        bag.typeVisible.set(visKey, visible);
        _setVisibility(bag, group.memberIds, visible);
        bag.refresh();
    }));
    hdr.appendChild(bag.makeIsoBtn(`${ENVELOPE_TREE_ROOT}:${group.key}`, () => [...group.memberIds]));
    hdr.addEventListener('click', (e) => {
        if (_onControl(e)) return;
        bag.envelopeNodeOpen.set(group.key, !isOpen);
        selectElements([...group.memberIds]);
        bag.refresh();
    });
    wrap.appendChild(hdr);

    if (isOpen) {
        const body = document.createElement('div');
        body.className = 'pb-ubp-st-type-body';
        for (const row of group.rows) {
            body.appendChild(_buildRow(bag, row, false));
            for (const room of row.rooms) body.appendChild(_buildRow(bag, room, true));
        }
        wrap.appendChild(body);
    }
    return wrap;
}

function _buildRow(bag: UBPBag, row: EnvelopeTreeRow, nested: boolean): HTMLElement {
    const isSel = bag.selectedElemId === row.id;
    const isVis = bag.elemVisible.get(row.id) ?? true;
    const base = nested ? 'pb-ubp-st-child-row' : 'pb-ubp-st-elem-row';

    const el = document.createElement('div');
    el.className = base + (isSel ? ` ${base}--sel` : '');
    el.setAttribute('data-elem-id', row.id);
    el.setAttribute('data-envelope-role', row.role);

    const storey = row.levelName ?? row.levelId;
    const name = _span('pb-ubp-st-elem-name', row.name);
    name.title = `${row.name} · ${row.role} envelope${storey ? ` · ${storey}` : ''}`;

    el.appendChild(_icon('pb-ubp-st-elem-icon'));
    el.appendChild(name);
    el.appendChild(_span('pb-ubp-ec-inst-level', storey));
    el.appendChild(bag.makeVisBtn(isVis, (visible) => {
        _setVisibility(bag, [row.id], visible);
        bag.refresh();
    }));
    el.appendChild(bag.makeIsoBtn(`elem:${row.id}`, () => [row.id]));

    el.addEventListener('click', (e) => {
        if (_onControl(e)) return;
        bag.selectedElemId = row.id;
        selectionBus.select(row.id, 'project-browser');
        bag.refresh();
    });
    return el;
}
