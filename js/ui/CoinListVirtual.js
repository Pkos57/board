// ui/CoinListVirtual.js
import { Utils } from '../utils.js';

export class CoinListVirtual {
    constructor(container, state, onSelect) {
        this.container = container;
        this.state = state;
        this.onSelect = onSelect;
        this.items = [];
        this.rowHeight = 56;
        this.visibleRows = 20;
        this.scrollTop = 0;
        this.container.style.overflowY = 'auto';
        this.container.style.position = 'relative';
        this.container.innerHTML = '';
        this.content = document.createElement('div');
        this.content.style.position = 'relative';
        this.content.style.height = '0px';
        this.container.appendChild(this.content);
        this.container.addEventListener('scroll', () => this.onScroll());
        this.rafId = null;

        this.resizeObserver = new ResizeObserver(() => this.updateRowHeight());
        this.resizeObserver.observe(container);
    }

    updateRowHeight() {
        if (this.items.length > 0 && this.content.firstChild) {
            const firstRow = this.content.firstChild;
            this.rowHeight = firstRow.offsetHeight;
            this.content.style.height = (this.items.length * this.rowHeight) + 'px';
            this.render();
        }
    }

    setItems(items) {
        this.items = items;
        this.content.style.height = (items.length * this.rowHeight) + 'px';
        this.render();
    }

    onScroll() {
        this.scrollTop = this.container.scrollTop;
        if (this.rafId) cancelAnimationFrame(this.rafId);
        this.rafId = requestAnimationFrame(() => this.render());
    }

    render() {
        this.rafId = null;
        const startIndex = Math.max(0, Math.floor(this.scrollTop / this.rowHeight) - 5);
        const endIndex = Math.min(this.items.length, startIndex + this.visibleRows + 10);
        const fragment = document.createDocumentFragment();
        for (let i = startIndex; i < endIndex; i++) {
            const item = this.items[i];
            const row = document.createElement('div');
            row.style.position = 'absolute';
            row.style.top = (i * this.rowHeight) + 'px';
            row.style.height = this.rowHeight + 'px';
            row.style.width = '100%';
            row.style.cursor = 'pointer';
            row.className = `coin-item ${item.symbol === this.state.currentSymbol ? 'active' : ''}`;
            row.dataset.symbol = item.symbol;

            const isFav = this.state.isFavorite(item.symbol);
            const starStyle = isFav ? 'color: #ffd700; text-shadow: 0 0 8px #ffaa00; font-size: 18px;' : 'color: #3a4050; font-size: 16px;';
            const starTitle = isFav ? 'Убрать из избранного' : 'Добавить в избранное';

            row.innerHTML = `
                <div class="coin-info">
                    <span class="coin-symbol">${item.symbol}</span>
                    <span class="coin-volume">💧 ${Utils.formatQuoteVolume(item.quoteVolume)}</span>
                </div>
                <div class="coin-stats">
                    <div class="coin-price">${Utils.formatPrice(item.lastPrice)}</div>
                    <div class="coin-change ${item.priceChangePercent >= 0 ? 'positive' : 'negative'}">
                        ${item.priceChangePercent.toFixed(2)}%
                    </div>
                </div>
                <div class="favorite-star" data-symbol="${item.symbol}" style="cursor:pointer; margin-left:8px; ${starStyle};" title="${starTitle}">⭐</div>
            `;

            row.addEventListener('click', (e) => {
                if (e.target.classList.contains('favorite-star')) {
                    e.stopPropagation();
                    this.state.toggleFavorite(item.symbol);
                    this.setItems([...this.items]);
                } else {
                    this.onSelect(item.symbol);
                }
            });

            fragment.appendChild(row);
        }
        this.content.innerHTML = '';
        this.content.appendChild(fragment);
    }

    destroy() {
        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
            this.resizeObserver = null;
        }
    }
}