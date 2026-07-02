import { FurnitureCategory, FurnitureType } from '@pryzm/geometry-furniture';
import {
    getCategories,
    getItemsForCategory,
    FurnitureCategoryDescriptor,
    FurnitureTypeDescriptor,
} from './FurnitureCategoryRegistry';
import { buildFurniturePlanIcon } from './furniturePlanIcon';

type SidePanelCategory = FurnitureCategory | 'all';

type FurnitureAccessWindow = Window & {
    toolManager?: {
        activateFurniture?: (type: string) => void | Promise<void>;
    };
    furnitureTool?: {
        setFurnitureType?: (type: FurnitureType) => void;
        activate?: () => void;
    };
    furnitureCarousel?: {
        setVisible?: (visible: boolean) => void;
    };
    _pryzmActiveFurnitureType?: string;
};

const CATEGORY_ABBREVIATIONS: Record<string, string> = {
    all: 'ALL',
    sofas: 'SOF',
    chairs: 'CHR',
    tables: 'TBL',
    bedroom: 'BED',
    outdoor: 'OUT',
    decor: 'DEC',
    soft_furnishings: 'SFT',
    lighting: 'LGT',
    kitchen: 'KIT',
    bathroom: 'BAT',
    storage: 'STR',
    kids: 'KID',
    teens: 'TEN',
    pets: 'PET',
    technical: 'TEC',
};

export class FurnitureSidePanel {
    private _categories: readonly FurnitureCategoryDescriptor[] = [];
    private _activeCategory: SidePanelCategory = 'all';
    private _query = '';
    private readonly _lockedCategory: FurnitureCategory | null = null;

    /** Phase B (S73-WIRE) — runtime threaded by parent. */
    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;

    constructor(options: { initialCategory?: FurnitureCategory } = {}, runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null) {
        this.runtime = runtime;
        this._categories = getCategories();
        if (options.initialCategory) {
            this._activeCategory = options.initialCategory;
            this._lockedCategory = options.initialCategory;
        }
    }

    build(): HTMLElement {
        const root = document.createElement('div');
        root.className = 'fsp-root';
        this._render(root);
        return root;
    }

    private _render(root: HTMLElement): void {
        root.replaceChildren(
            this._buildHeader(),
            ...(this._lockedCategory ? [] : [this._buildCategoryPills(root)]),
            this._buildGrid(),
        );
    }

    private _buildHeader(): HTMLElement {
        const header = document.createElement('div');
        header.className = 'fsp-header';

        const titleRow = document.createElement('div');
        titleRow.className = 'fsp-title-row';

        const title = document.createElement('div');
        title.className = 'fsp-title';
        title.textContent = this._lockedCategory ? `${this._getCategoryLabel(this._lockedCategory)} Library` : 'Furniture Library';

        const count = document.createElement('div');
        count.className = 'fsp-count';
        count.textContent = `${this._getVisibleItems().length} items`;

        titleRow.append(title, count);

        const input = document.createElement('input');
        input.className = 'fsp-search';
        input.type = 'search';
        input.placeholder = 'Search wardrobe, bed, table, chair...';
        input.value = this._query;
        input.addEventListener('input', () => {
            this._query = input.value;
            const root = input.closest('.fsp-root') as HTMLElement | null;
            if (root) this._render(root);
        });

        header.append(titleRow, input);
        return header;
    }

    private _buildCategoryPills(root: HTMLElement): HTMLElement {
        const strip = document.createElement('div');
        strip.className = 'fsp-category-strip';

        const allItems = this._getAllItems();
        strip.appendChild(this._buildPill(root, 'all', 'All', allItems.length));

        for (const cat of this._categories) {
            if (cat.items.length === 0) continue;
            strip.appendChild(this._buildPill(root, cat.id, cat.label, cat.items.length));
        }

        return strip;
    }

    private _buildPill(root: HTMLElement, id: SidePanelCategory, label: string, count: number): HTMLButtonElement {
        const pill = document.createElement('button');
        pill.type = 'button';
        pill.className = `fsp-pill${id === this._activeCategory ? ' fsp-pill-active' : ''}`;
        pill.title = `${label} (${count})`;
        pill.setAttribute('aria-pressed', id === this._activeCategory ? 'true' : 'false');

        const badge = document.createElement('span');
        badge.className = 'fsp-pill-badge';
        badge.textContent = CATEGORY_ABBREVIATIONS[id] ?? 'CAT';

        const text = document.createElement('span');
        text.className = 'fsp-pill-label';
        text.textContent = label;

        const total = document.createElement('span');
        total.className = 'fsp-pill-count';
        total.textContent = String(count);

        pill.append(badge, text, total);
        pill.addEventListener('click', () => {
            this._activeCategory = id;
            this._render(root);
        });

        return pill;
    }

    private _buildGrid(): HTMLElement {
        const wrapper = document.createElement('div');
        wrapper.className = 'fsp-grid-wrapper';

        const items = this._getVisibleItems();

        if (items.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'fsp-empty';
            empty.textContent = 'No furniture matches this search.';
            wrapper.appendChild(empty);
            return wrapper;
        }

        // Hierarchy: parametric (native fragment geometry) first, then GLB-imported.
        const parametricItems = items.filter(item => !item.glbPath);
        const glbItems        = items.filter(item =>  item.glbPath);

        const categoryNoun = this._getCategoryNoun();

        if (parametricItems.length > 0) {
            wrapper.appendChild(this._buildSectionHeader(`Parametric ${categoryNoun}`, parametricItems.length));
            wrapper.appendChild(this._buildSectionGrid(parametricItems));
        }
        if (glbItems.length > 0) {
            wrapper.appendChild(this._buildSectionHeader(`GLB ${categoryNoun}`, glbItems.length));
            wrapper.appendChild(this._buildSectionGrid(glbItems));
        }

        return wrapper;
    }

    private _buildSectionHeader(label: string, count: number): HTMLElement {
        const header = document.createElement('div');
        header.className = 'fsp-section-header';

        const lbl = document.createElement('span');
        lbl.className = 'fsp-section-label';
        lbl.textContent = label;

        const cnt = document.createElement('span');
        cnt.className = 'fsp-section-count';
        cnt.textContent = String(count);

        header.append(lbl, cnt);
        return header;
    }

    private _buildSectionGrid(items: readonly FurnitureTypeDescriptor[]): HTMLElement {
        const grid = document.createElement('div');
        grid.className = 'fsp-grid';
        for (const item of items) {
            grid.appendChild(this._buildCard(item));
        }
        return grid;
    }

    /**
     * Pluralised category noun used in section headers
     * (e.g. "Parametric Sofas", "GLB Tables"). Falls back to "Items" when
     * the active view is "all" or the category is unknown.
     */
    private _getCategoryNoun(): string {
        if (this._activeCategory === 'all') return 'Items';
        const label = this._getCategoryLabel(this._activeCategory);
        return label || 'Items';
    }

    private _buildCard(item: FurnitureTypeDescriptor): HTMLElement {
        const card = document.createElement('button');
        card.type = 'button';
        card.title = item.label;
        card.className = 'fsp-card';
        card.draggable = true;
        card.dataset['furnitureType'] = item.glbPath ?? item.type;

        const thumbWrap = document.createElement('div');
        thumbWrap.className = 'fsp-thumb';

        // §FIX-LIBRARY-DIAGRAM-ICONS (founder L-22) — every card previews a clean,
        // diagrammatic TOP-VIEW plan symbol drawn in the PRYZM plan-symbol style
        // (single-ink PRYZM purple, no black), the SAME vocabulary the drawing uses.
        // This is the default AND the fallback, so cards read as one symbol family
        // whether or not the GLB/thumbnail catalog is hosted (tracker OBJECT-STORAGE-GLB
        // → /items/**/thumbnail.webp 404s in prod). If a real raster thumbnail IS
        // available it progressively upgrades over the symbol; on 404 the symbol stays.
        thumbWrap.appendChild(buildFurniturePlanIcon(item.type, item.label));

        if (item.thumbnailPath) {
            const img = document.createElement('img');
            img.src = item.thumbnailPath;
            img.alt = item.label;
            img.className = 'fsp-thumb-img';
            img.loading = 'lazy';
            img.onload = () => { thumbWrap.replaceChildren(img); };
            // On 404 the clean plan symbol already in place remains — no tacky fallback.
            img.onerror = () => { /* keep the diagrammatic plan symbol */ };
        }

        const lbl = document.createElement('span');
        lbl.className = 'fsp-card-label';
        lbl.textContent = item.label;

        const mode = document.createElement('span');
        mode.className = 'fsp-card-mode';
        mode.textContent = item.glbPath ? 'Model' : 'Parametric';

        card.append(thumbWrap, lbl, mode);

        card.addEventListener('click', () => this._activateItem(item));
        card.addEventListener('dragstart', (e: DragEvent) => this._handleDragStart(e, item, card));
        card.addEventListener('dragend', () => window.runtime?.events?.emit('fc-drag-end', {})); // F.events.12

        return card;
    }

    private _handleDragStart(e: DragEvent, item: FurnitureTypeDescriptor, card: HTMLElement): void {
        if (!e.dataTransfer) return;
        const payload = item.glbPath ?? item.type;
        e.dataTransfer.setData('text/plain', payload);
        e.dataTransfer.effectAllowed = 'copy';

        const rect = card.getBoundingClientRect();
        e.dataTransfer.setDragImage(card, rect.width / 2, rect.height / 2);

        window.runtime?.events?.emit('fc-drag-start', { furnitureType: payload }); // F.events.12
    }

    private _activateItem(item: FurnitureTypeDescriptor): void {
        if (item.glbPath) {
            const accessWindow = window as FurnitureAccessWindow;
            accessWindow._pryzmActiveFurnitureType = item.glbPath;
            window.runtime?.events?.emit('fc-place-glb-start', { path: item.glbPath, label: item.label }); // F.events.12
            accessWindow.furnitureCarousel?.setVisible?.(false);
            return;
        }

        const type = item.type as FurnitureType;
        const accessWindow = window as FurnitureAccessWindow;
        accessWindow._pryzmActiveFurnitureType = type;

        if (accessWindow.toolManager?.activateFurniture) {
            void accessWindow.toolManager.activateFurniture(type);
            accessWindow.furnitureCarousel?.setVisible?.(false);
            return;
        }

        const ft = accessWindow.furnitureTool;
        if (!ft) {
            console.error('[FurnitureSidePanel] furnitureTool not ready');
            return;
        }
        ft.setFurnitureType?.(type);
        ft.activate?.();
        accessWindow.furnitureCarousel?.setVisible?.(false);
    }

    private _getAllItems(): readonly FurnitureTypeDescriptor[] {
        return this._categories.flatMap(category => category.items);
    }

    private _getVisibleItems(): readonly FurnitureTypeDescriptor[] {
        const source = this._activeCategory === 'all'
            ? this._getAllItems()
            : getItemsForCategory(this._activeCategory);

        const normalizedQuery = this._query.trim().toLowerCase();
        if (!normalizedQuery) return source;

        return source.filter(item => {
            const text = `${item.label} ${item.type}`.toLowerCase();
            return text.includes(normalizedQuery);
        });
    }

    private _getCategoryLabel(category: FurnitureCategory): string {
        return this._categories.find(cat => cat.id === category)?.label ?? 'Furniture';
    }
}
