import { FurnitureCategory, FurnitureType } from '@pryzm/geometry-furniture';
import {
    getCategories,
    getItemsForCategory,
    FurnitureCategoryDescriptor,
    FurnitureTypeDescriptor,
} from './FurnitureCategoryRegistry';
import { FurnitureThumbnailService } from './FurnitureThumbnailService';

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

        if (item.thumbnailPath) {
            const img = document.createElement('img');
            img.src = item.thumbnailPath;
            img.alt = item.label;
            img.className = 'fsp-thumb-img';
            img.onerror = () => {
                thumbWrap.replaceChildren(this._buildIconForItem(item));
            };
            thumbWrap.appendChild(img);
        } else {
            // Parametric item — start with the SVG icon as a placeholder, then
            // replace it with a 3D-rendered thumbnail once the offscreen
            // renderer produces one. Per-card defaultColor is folded into the
            // cache key so colour variants render distinct previews.
            thumbWrap.appendChild(this._buildIconForItem(item));
            this._loadParametricThumbnail(item, thumbWrap);
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

    private _loadParametricThumbnail(item: FurnitureTypeDescriptor, thumbWrap: HTMLElement): void {
        const fabricHex = parseColorHex(item.defaultColor);
        const service = FurnitureThumbnailService.getInstance();
        service
            .requestThumbnail(item.type as FurnitureType, fabricHex)
            .then(dataUrl => {
                if (!dataUrl) return;
                if (!thumbWrap.isConnected) return;
                const img = document.createElement('img');
                img.src = dataUrl;
                img.alt = item.label;
                img.className = 'fsp-thumb-img';
                thumbWrap.replaceChildren(img);
            })
            .catch(err => {
                console.warn(`[FurnitureSidePanel] thumbnail render failed for ${item.type}:`, err);
            });
    }

    private _buildIconForItem(item: FurnitureTypeDescriptor): SVGSVGElement {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('width', '38');
        svg.setAttribute('height', '38');
        svg.setAttribute('fill', 'none');
        svg.setAttribute('stroke', 'currentColor');
        svg.setAttribute('stroke-width', '1.5');
        svg.setAttribute('stroke-linecap', 'round');
        svg.setAttribute('stroke-linejoin', 'round');
        svg.classList.add('fsp-fallback-icon');

        const text = `${item.type} ${item.label}`.toLowerCase();
        svg.innerHTML = this._iconMarkupForText(text);
        return svg;
    }

    private _iconMarkupForText(text: string): string {
        if (text.includes('bed')) {
            return '<path d="M4 11h16v7"/><path d="M4 18V7"/><path d="M8 11V8h5v3"/><path d="M4 14h16"/>';
        }
        if (text.includes('wardrobe') || text.includes('closet') || text.includes('dresser')) {
            return '<rect x="5" y="4" width="14" height="17" rx="1.5"/><path d="M12 4v17"/><path d="M9.5 13h.01"/><path d="M14.5 13h.01"/><path d="M7 7h10"/>';
        }
        if (text.includes('chair') || text.includes('stool')) {
            return '<path d="M8 11h8v5H8z"/><path d="M9 11V6h6v5"/><path d="M9 16v4"/><path d="M15 16v4"/><path d="M7 20h10"/>';
        }
        if (text.includes('sofa') || text.includes('couch') || text.includes('bean bag') || text.includes('lounge')) {
            return '<path d="M6 12V8a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v4"/><path d="M5 12h14a2 2 0 0 1 2 2v4H3v-4a2 2 0 0 1 2-2z"/><path d="M6 18v2"/><path d="M18 18v2"/>';
        }
        if (text.includes('table') || text.includes('desk')) {
            return '<path d="M4 9h16"/><path d="M6 9v10"/><path d="M18 9v10"/><path d="M8 19h8"/><rect x="5" y="5" width="14" height="4" rx="1"/>';
        }
        if (text.includes('kitchen') || text.includes('cabinet') || text.includes('stove') || text.includes('fridge') || text.includes('microwave')) {
            return '<rect x="4" y="7" width="16" height="12" rx="1.5"/><path d="M4 12h16"/><path d="M10 7v12"/><path d="M7 10h.01"/><path d="M14 15h3"/><path d="M14 17h3"/>';
        }
        if (text.includes('lamp') || text.includes('light')) {
            return '<path d="M9 4h6l2 7H7z"/><path d="M12 11v7"/><path d="M8 20h8"/><path d="M10 18h4"/>';
        }
        if (text.includes('plant') || text.includes('tree') || text.includes('cactus') || text.includes('bush')) {
            return '<path d="M12 13c-4-1-6-4-5-8 4 1 6 3 5 8z"/><path d="M12 13c4-1 6-4 5-8-4 1-6 3-5 8z"/><path d="M12 13v5"/><path d="M8 18h8l-1 3H9z"/>';
        }
        if (text.includes('shower') || text.includes('bath') || text.includes('toilet') || text.includes('radiator')) {
            return '<rect x="6" y="5" width="12" height="14" rx="1.5"/><path d="M9 8h6"/><path d="M9 11h6"/><path d="M9 14h6"/><path d="M8 21h8"/>';
        }
        if (text.includes('chimney') || text.includes('fireplace')) {
            return '<path d="M8 20h8"/><path d="M7 20V9h10v11"/><path d="M10 9V4h4v5"/><path d="M10 17c0-2 4-2 4-5 2 2 2 6-1 7"/>';
        }
        if (text.includes('mirror') || text.includes('picture') || text.includes('art')) {
            return '<rect x="6" y="4" width="12" height="16" rx="2"/><path d="M9 15l2-3 2 2 2-4"/>';
        }
        return '<rect x="5" y="8" width="14" height="10" rx="2"/><path d="M7 8V6h10v2"/><path d="M8 18v2"/><path d="M16 18v2"/>';
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

/** Parse a `#RRGGBB` colour string into a 0xRRGGBB hex number, or undefined. */
function parseColorHex(hex?: string): number | undefined {
    if (!hex) return undefined;
    const trimmed = hex.trim().replace('#', '');
    if (!/^[0-9a-f]{6}$/i.test(trimmed)) return undefined;
    return parseInt(trimmed, 16);
}
