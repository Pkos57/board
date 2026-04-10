// ui/uiController.js
import { DataService } from '../api/DataService.js';
import { Utils } from '../utils.js';
import { CONFIG } from '../config.js';
import { CoinListVirtual } from './CoinListVirtual.js';
import { IndicatorSettingsModal } from './IndicatorSettingsModal.js';

export class UIController {
    constructor(state, chartManager, drawingManager, wsManager, alertContainer) {
        this.state = state;
        this.chartManager = chartManager;
        this.drawingManager = drawingManager;
        this.wsManager = wsManager;
        this.alertContainer = alertContainer;
        this.dataService = new DataService(alertContainer);
        this.notifySignalsCheckbox = document.getElementById('notifySignalsCheckbox');
        // DOM элементы
        this.mouseCoordsSpan = document.getElementById('mouseCoords');
        this.lastPriceSpan = document.getElementById('lastPrice');
        this.volume24hSpan = document.getElementById('volume24h');
        this.tradeCountSpan = document.getElementById('tradeCount');
        this.high24hSpan = document.getElementById('high24h');
        this.low24hSpan = document.getElementById('low24h');
        this.currentSymbolDisplay = document.getElementById('currentSymbolDisplay');
        this.coinListEl = document.getElementById('coinList');
        this.coinSearch = document.getElementById('coinSearch');
        this.filterBtns = document.querySelectorAll('.filter-btn');
        this.intervalBtns = document.querySelectorAll('.interval-btn');
        this.loader = document.getElementById('loader');
        this.soundCheckbox = document.getElementById('soundCheckbox');
        this.chartTypeBtns = document.querySelectorAll('.chart-type-btn');
        this.signalsListEl = document.getElementById('signalsList');
        this.clearSignalsBtn = document.getElementById('clearSignalsBtn');
        this.collapseSignalsBtn = document.getElementById('collapseSignalsBtn');
        this.signalsPanel = document.getElementById('signalsPanel');
        this.signalSearch = document.getElementById('signalSearch');
        this.signalTypeFilter = document.getElementById('signalTypeFilter');
        this.signalStrategyFilter = document.getElementById('signalStrategyFilter');
       
        // Модальные окна
        this.indicatorSettingsModal = new IndicatorSettingsModal( chartManager, state,  alertContainer );
        this.indicatorModal = document.getElementById('indicatorModal');
        this.alertLogModal = document.getElementById('alertLogModal');
        this.activeIndicatorsModalList = document.getElementById('activeIndicatorsModalList');
        this.alertLogModalList = document.getElementById('alertLogModalList');
        this.clearAlertsModalBtn = document.getElementById('clearAlertsModalBtn');
        this.indicatorType = document.getElementById('indicatorType');
        this.indicatorParams = document.getElementById('indicatorParams');
        this.indicatorForm = document.getElementById('indicatorForm');
        this.saveWorkspaceBtn = document.getElementById('saveWorkspaceBtn');
        this.loadWorkspaceBtn = document.getElementById('loadWorkspaceBtn');

        // Для очистки
        this.statusBarInterval = null;
        this.mouseMoveRAF = null;
        this.pendingMouseEvent = null;
        this.containerRect = null;
        // Инициализация виртуального списка
        this.coinListVirtual = new CoinListVirtual(this.coinListEl, this.state, (symbol) => this.switchSymbol(symbol));

        this.initEventListeners();
        this.renderCoinListDebounced = Utils.debounce(this.renderCoinList.bind(this), 300);
        this.startStatusBarUpdater();

        const signalsCollapsed = this.state.loadFromStorage('signalsCollapsed', false);
        if (signalsCollapsed) {
            this.signalsPanel.classList.add('collapsed');
            this.collapseSignalsBtn.textContent = '►';
        }

        // Инициализация фильтров сигналов (будет вызвано после первой загрузки сигналов)
        setTimeout(() => this.updateStrategyFilterOptions(), 1000);
    }

    initEventListeners() {
        // Фильтры списка монет
        this.filterBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                this.filterBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.state.currentFilter = btn.dataset.filter;
                this.renderCoinList();
            });
        });

        this.coinSearch.addEventListener('input', () => this.renderCoinListDebounced());

        this.intervalBtns.forEach(btn => {
            btn.addEventListener('click', async () => {
                this.intervalBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const interval = btn.dataset.interval;
                this.state.setInterval(interval);
                await this.switchInterval(interval);
            });
        });

        // Кнопки рисования
        document.getElementById('cursorBtn')?.addEventListener('click', () => {
            this.drawingManager.setDrawingMode(null);
            this.setActiveDrawBtn(null);
        });
        document.getElementById('trendBtn')?.addEventListener('click', () => {
            this.drawingManager.setDrawingMode('trend');
            this.setActiveDrawBtn('trend');
        });
        document.getElementById('horizBtn')?.addEventListener('click', () => {
            this.drawingManager.setDrawingMode('horizontal');
            this.setActiveDrawBtn('horizontal');
        });
        document.getElementById('vertBtn')?.addEventListener('click', () => {
            this.drawingManager.setDrawingMode('vertical');
            this.setActiveDrawBtn('vertical');
        });
        document.getElementById('measureBtn')?.addEventListener('click', () => {
            this.drawingManager.setDrawingMode('measure');
            this.setActiveDrawBtn('measure');
        });
        document.getElementById('undoBtn')?.addEventListener('click', () => this.drawingManager.undo());
        document.getElementById('clearDrawBtn')?.addEventListener('click', () => this.drawingManager.clearAll());
        document.getElementById('drawingColor')?.addEventListener('input', (e) => {
            this.state.drawingColor = e.target.value;
        });
        document.getElementById('fullscreenBtn')?.addEventListener('click', () => this.toggleFullscreen());
        document.getElementById('menuDeleteLine')?.addEventListener('click', () => {
            this.drawingManager.deleteContextLine();
        });
        document.getElementById('menuChangeColor')?.addEventListener('click', () => {
            this.drawingManager.changeContextLineColor();
        });
        document.getElementById('resetViewBtn')?.addEventListener('click', () => {
            if (this.chartManager && this.chartManager.chart) {
                this.chartManager.chart.timeScale().fitContent();
                this.chartManager.userChangedTimeScale = false;
                console.log('🔄 Масштаб сброшен к началу графика');
    }
});
        // Типы графиков
        this.chartTypeBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                this.chartTypeBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const type = btn.dataset.type;
                this.chartManager.setChartType(type);
            });
        });

        this.soundCheckbox.addEventListener('change', (e) => {
            this.state.setSoundEnabled(e.target.checked);
        });

        // Сигналы: очистка и сворачивание
        if (this.clearSignalsBtn) {
            this.clearSignalsBtn.addEventListener('click', () => {
                this.state.clearSignals();
                this.renderSignals();
            });
        }

        this.collapseSignalsBtn.addEventListener('click', () => {
            this.signalsPanel.classList.toggle('collapsed');
            const collapsed = this.signalsPanel.classList.contains('collapsed');
            this.collapseSignalsBtn.textContent = collapsed ? '►' : '▼';
            this.state.saveToStorage('signalsCollapsed', collapsed);
        });
        const toggleOverlaysBtn = document.getElementById('toggleOverlaysBtn');
        if (toggleOverlaysBtn) {
            toggleOverlaysBtn.addEventListener('click', () => {
                this.chartManager.toggleOverlays();
                         // Меняем текст кнопки по желанию
                const isVisible = this.chartManager.overlaysVisible;
                toggleOverlaysBtn.textContent = isVisible ? '📌 Оверлеи' : '🚫 Оверлеи';
                toggleOverlaysBtn.title = isVisible ? 'Скрыть оверлеи' : 'Показать оверлеи';
    });
                                // Устанавливаем начальное состояние кнопки
            toggleOverlaysBtn.textContent = this.chartManager.overlaysVisible ? '📌 Оверлеи' : '🚫 Оверлеи';
            toggleOverlaysBtn.title = this.chartManager.overlaysVisible ? 'Скрыть оверлеи' : 'Показать оверлеи';
}
        // Фильтры сигналов
        if (this.signalSearch) {
            this.signalSearch.addEventListener('input', () => {
                console.log('Signal search input');
                this.renderSignals();
            });
        }
        if (this.signalTypeFilter) {
            this.signalTypeFilter.addEventListener('change', () => {
                console.log('Signal type filter changed');
                this.renderSignals();
            });
        }
        if (this.signalStrategyFilter) {
            this.signalStrategyFilter.addEventListener('change', () => {
                console.log('Signal strategy filter changed');
                this.renderSignals();
            });
        }
        // Обработчик для добавления в избранное из сигналов
        if (this.signalsListEl) {
            this.signalsListEl.addEventListener('click', (e) => {
                const star = e.target.closest('.favorite-star-signal');
                if (star) {
                    e.stopPropagation();
                    e.preventDefault();
                    const symbol = star.dataset.symbol;
                    this.state.toggleFavorite(symbol);
                    // Обновляем звёздочки в сигналах и в списке монет
                    this.renderSignals();
                    this.renderCoinList();
                }
            });
        }
        // Индикаторы и лог
        document.getElementById('indicatorsBtn').addEventListener('click', () => this.openIndicatorModal());
        document.getElementById('alertLogBtn').addEventListener('click', () => this.openAlertLogModal());

        // Закрытие модальных окон
        document.querySelector('#indicatorModal .modal-close').addEventListener('click', () => {
            this.indicatorModal.style.display = 'none';
        });
        document.querySelector('#alertLogModal .modal-close').addEventListener('click', () => {
            this.alertLogModal.style.display = 'none';
        });

        if (this.clearAlertsModalBtn) {
            this.clearAlertsModalBtn.addEventListener('click', () => {
                document.getElementById('alertLog').innerHTML = '';
                this.updateAlertLogModal();
            });
        }

        this.indicatorForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const type = this.indicatorType.value;
            const params = this.collectParams();
    
            console.log('📝 Форма отправлена, добавляем индикатор:', type);
    
    // Добавляем индикатор (без открытия настроек)
            this.addIndicatorHandler(type, params);
    
    // Очищаем форму
            this.generateParamFields(this.indicatorType.value, {});
    
    // НЕ ЗАКРЫВАЕМ ОКНО, чтобы можно было добавить еще индикаторов
    // this.indicatorModal.style.display = 'none'; // ← ЗАКОММЕНТИРОВАНО
});
        this.indicatorType.addEventListener('change', () => {
            this.generateParamFields(this.indicatorType.value, {});
        });

        window.addEventListener('click', (e) => {
            if (e.target === this.indicatorModal) this.indicatorModal.style.display = 'none';
            if (e.target === this.alertLogModal) this.alertLogModal.style.display = 'none';
        });
        if (this.notifySignalsCheckbox) {
            this.notifySignalsCheckbox.checked = this.state.notifySignals;
            this.notifySignalsCheckbox.addEventListener('change', (e) => {
                this.state.setNotifySignals(e.target.checked);
            });
        }
        // Обработка мыши на графике
        const container = document.getElementById('chart-container');
        // В initEventListeners():
        container.addEventListener('mousedown', (e) => {
    // ✅ Используем optional chaining на случай, если метод не загрузился
            const pos = this.getMousePosition?.(e);
            if (pos?.time && pos?.price) {
                this.drawingManager?.handleMouseDown(pos.time, pos.price);
    }
});

        container.addEventListener('mousemove', (e) => {
            const pos = this.getMousePosition?.(e);
            if (pos?.time && pos?.price) {
        // ✅ true = skipHeavy: пропустить ликвидности, тепловую карту, SMC
                this.drawingManager?.handleMouseMove(pos.time, pos.price, true);
                this.mouseCoordsSpan.textContent = `${Utils.formatPrice(pos.price)} @ ${new Date(pos.time * 1000).toLocaleTimeString()}`;
            } else {
                this.mouseCoordsSpan.textContent = '—';
    }
});
        container.addEventListener('contextmenu', (e) => this.drawingManager.showContextMenu(e));

        document.addEventListener('click', () => this.drawingManager.hideContextMenu());

        document.addEventListener('fullscreenchange', () => {
            const app = document.getElementById('app');
            if (!document.fullscreenElement) app.classList.remove('fullscreen');
        });

        if (this.saveWorkspaceBtn) {
            this.saveWorkspaceBtn.addEventListener('click', () => this.saveWorkspace());
        }
        if (this.loadWorkspaceBtn) {
            this.loadWorkspaceBtn.addEventListener('click', () => this.loadWorkspace());
        }
    }

    setActiveDrawBtn(mode) {
        document.querySelectorAll('.drawing-tool-btn').forEach(b => b.classList.remove('active'));
        if (mode === 'trend') document.getElementById('trendBtn').classList.add('active');
        else if (mode === 'horizontal') document.getElementById('horizBtn').classList.add('active');
        else if (mode === 'vertical') document.getElementById('vertBtn').classList.add('active');
        else if (mode === 'measure') document.getElementById('measureBtn').classList.add('active');
        else document.getElementById('cursorBtn').classList.add('active');
    }

    toggleFullscreen() {
        const app = document.getElementById('app');
        if (!document.fullscreenElement) {
            app.requestFullscreen()
                .then(() => app.classList.add('fullscreen'))
                .catch(err => console.log(`Ошибка: ${err.message}`));
        } else {
            document.exitFullscreen()
                .then(() => app.classList.remove('fullscreen'));
        }
    }

  
    _processMouseMove() {
        this.mouseMoveRAF = null;
        if (!this.pendingMouseEvent) return;
        
        const pos = this.getMousePositionFast(this.pendingMouseEvent);
        this.pendingMouseEvent = null;

        if (pos.time !== null && pos.price !== null) {
            // true = режим предпросмотра (пропускает тяжёлые оверлеи)
            this.drawingManager.handleMouseMove(pos.time, pos.price, true);
            this.mouseCoordsSpan.textContent = `${Utils.formatPrice(pos.price)} @ ${new Date(pos.time * 1000).toLocaleTimeString()}`;
        } else {
            this.mouseCoordsSpan.textContent = '—';
            this.drawingManager.handleMouseMove(null, null, true);
        }
    }

    getMousePosition(event) {
        const container = document.getElementById('chart-container');
        const rect = container.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
    
        const ts = this.chartManager.chart.timeScale();
        let time = ts.coordinateToTime(x);
    
        if (time === null) {
            const range = ts.getVisibleRange();
            if (range) {
                const lx = ts.timeToCoordinate(range.from);
                const rx = ts.timeToCoordinate(range.to);
                if (lx !== null && rx !== null && rx !== lx) {
                    let t = (x - lx) / (rx - lx);
                    t = Math.min(t, 1.2); // Лимит экстраполяции
                    time = range.from + t * (range.to - range.from);
            }
        }
    }
    
        if (time !== null) time = Math.floor(time);
        const price = this.chartManager.mainSeries?.coordinateToPrice(y) ?? null;
        return { time, price };
}

    async switchSymbol(symbol) {
        if (symbol === this.state.currentSymbol) return;
        this.chartManager.saveVisibleTimeRange();
        // this.state.saveDrawingsForCurrent();
        this.drawingManager.clearPreview();
        this.state.setSymbol(symbol);
        this.currentSymbolDisplay.textContent = symbol;
        if (this.wsManager) this.wsManager.close();
        this.loader.style.display = 'block';

    // Очищаем старые оверлеи перед загрузкой
        this.chartManager.clearOverlay?.();
        this.chartManager.clearDensityZones?.();

        const initialData = await this.dataService.fetchInitialFast(symbol, this.state.currentInterval, 1000);
        this.loader.style.display = 'none';

        if (initialData && initialData.length > 1) {
            this.chartManager.setData(initialData);
            this.drawingManager.refreshSubscriptions();
            this.chartManager.chart.timeScale().fitContent();
            this.chartManager.restoreVisibleTimeRange();

            // if (this.wsManager) this.wsManager.connect(symbol, this.state.currentInterval);
            if (this.signalManager) {
                this.signalManager.updateSymbol(symbol);
        }
            this.updateStatusBarFromTicker();
            initialData.forEach(candle => this.drawingManager.checkCrossingsForCandle(candle, this.state.soundEnabled, this.alertContainer, true));
            const savedWaves = this.state.getElliottWaves(symbol);
            if (savedWaves?.length) this.chartManager.drawElliottWaves(savedWaves);
            this.drawingManager.restoreDrawings();
            this.chartManager.applyGlobalIndicators();
            this.updateIndicatorsModal();
        } else {
            this.chartManager.setData([]);
            Utils.showAlert(`Нет данных для ${symbol}`, this.alertContainer, this.state.soundEnabled);
    }
        this.renderCoinList();
}

    async switchInterval(interval) {
        console.log('🔄 Переключаем интервал на', interval);
        this.chartManager.saveVisibleTimeRange();
        // this.state.saveDrawingsForCurrent();
        if (this.wsManager) this.wsManager.close();
        this.drawingManager.clearPreview();

    // Очищаем старые оверлеи
        this.chartManager.clearOverlay?.();
        this.chartManager.clearDensityZones?.();

        this.loader.style.display = 'block';
        const data = await this.dataService.fetchKlines(this.state.currentSymbol, interval);
        this.loader.style.display = 'none';

        if (data && data.length > 1) {
            this.chartManager.setData(data);
            this.drawingManager.refreshSubscriptions();
            // if (this.wsManager) this.wsManager.connect(this.state.currentSymbol, interval);
            if (this.signalManager) {
                this.signalManager.updateSymbol(this.state.currentSymbol);
        }
            this.updateStatusBarFromTicker();
            data.forEach(candle => this.drawingManager.checkCrossingsForCandle(candle, this.state.soundEnabled, this.alertContainer, true));
            this.drawingManager.restoreDrawings();
            this.chartManager.applyGlobalIndicators();
            this.updateIndicatorsModal();
            this.chartManager.chart.timeScale().fitContent();
            this.chartManager.userChangedTimeScale = false;

            const savedWaves = this.state.getElliottWaves(this.state.currentSymbol);
            if (savedWaves && savedWaves.length) {
                this.chartManager.drawElliottWaves(savedWaves);
        }
        // Дополнительный запрос данных (если нужно)
            setTimeout(() => {
                if (this.signalManager) {
                    this.signalManager.requestAdditionalData(this.state.currentSymbol);
            }
            }, 200);
        } else {
            this.chartManager.setData([]);
            this.lastPriceSpan.textContent = '—';
            Utils.showAlert(`Нет данных для ${this.state.currentSymbol} на ${interval}`, this.alertContainer, this.state.soundEnabled);
    }
}

    updateLastPrice(price) {
        this.lastPriceSpan.textContent = Utils.formatPrice(price);
    }

    updateStatusBarFromTicker() {
        const stat = this.state.allCoinStats.find(s => s.symbol === this.state.currentSymbol);
        if (stat) {
            this.volume24hSpan.textContent = Utils.formatQuoteVolume(stat.quoteVolume);
            this.tradeCountSpan.textContent = stat.count || '—';
            this.high24hSpan.textContent = Utils.formatPrice(stat.highPrice);
            this.low24hSpan.textContent = Utils.formatPrice(stat.lowPrice);
        } else {
            this.volume24hSpan.textContent = '—';
            this.tradeCountSpan.textContent = '—';
            this.high24hSpan.textContent = '—';
            this.low24hSpan.textContent = '—';
        }
    }

    startStatusBarUpdater() {
        this.statusBarInterval = setInterval(async () => {
            if (!this.state.currentSymbol) return;
            try {
                const res = await fetch(`https://fapi.binance.com/fapi/v1/ticker/24hr?symbol=${this.state.currentSymbol}`);
                if (res.ok) {
                    const data = await res.json();
                    this.volume24hSpan.textContent = Utils.formatQuoteVolume(parseFloat(data.quoteVolume));
                    this.tradeCountSpan.textContent = data.count || '—';
                    this.high24hSpan.textContent = Utils.formatPrice(parseFloat(data.highPrice));
                    this.low24hSpan.textContent = Utils.formatPrice(parseFloat(data.lowPrice));
                }
            } catch (e) {
                console.warn('Ошибка обновления 24hr ticker', e);
            }
        }, 10000);
    }

    renderCoinList() {
        if (!this.state.allCoinStats.length) return;
        const filterText = this.coinSearch.value.toLowerCase();
        let filtered = this.state.allCoinStats.filter(c => c.symbol.toLowerCase().includes(filterText));
        const sortBy = this.state.currentFilter;

        if (sortBy === 'favorites') {
            filtered = filtered.filter(c => this.state.isFavorite(c.symbol));
            filtered.sort((a, b) => b.quoteVolume - a.quoteVolume);
        } else if (sortBy === 'volume') {
            filtered.sort((a, b) => b.quoteVolume - a.quoteVolume);
        } else if (sortBy === 'gain') {
            filtered.sort((a, b) => b.priceChangePercent - a.priceChangePercent);
        } else if (sortBy === 'loss') {
            filtered.sort((a, b) => a.priceChangePercent - b.priceChangePercent);
        }

        const top = filtered.slice(0, 500);
        this.coinListVirtual.setItems(top);
    }

    // ========== Глобальные индикаторы ==========
    async addIndicatorHandler(type, params) {
        this.state.addGlobalIndicator({ type, params });
        await this.chartManager.rebuildIndicatorsFromState();
        this.updateIndicatorsModal();
}

    async removeIndicatorHandler(type) {
        this.state.removeGlobalIndicator(type);
        await this.chartManager.rebuildIndicatorsFromState();
        this.updateIndicatorsModal();
}
   

openIndicatorModal(indicator = null) {
    console.log('📊 Открываем окно выбора индикатора');
    
    // Закрываем новое окно настроек
    if (this.indicatorSettingsModal && this.indicatorSettingsModal.modal) {
        this.indicatorSettingsModal.modal.style.display = 'none';
    }
    
    // Заполняем список доступных индикаторов
    if (this.indicatorType) {
        this.indicatorType.innerHTML = CONFIG.indicators.map(i => 
            `<option value="${i.type}">${i.label}</option>`
        ).join('');
    }
    
    // ВАЖНО: ВСЕГДА открываем в режиме добавления, НЕ в режиме редактирования
    this.indicatorType.disabled = false;
    this.generateParamFields(this.indicatorType.value, {});
    
    // Открываем старое окно
    if (this.indicatorModal) {
        this.indicatorModal.style.display = 'flex';
    }
}

    generateParamFields(type, currentParams) {
        const config = CONFIG.indicators.find(i => i.type === type);
        if (!config) return;
        const defaults = config.defaultParams || {};
        this.indicatorParams.innerHTML = '';
        Object.entries(defaults).forEach(([key, defaultValue]) => {
            const div = document.createElement('div');
            div.className = 'form-group';
            const value = currentParams[key] !== undefined ? currentParams[key] : defaultValue;
            if (typeof defaultValue === 'boolean') {
                div.innerHTML = `
                    <label style="display:flex; align-items:center; gap:8px;">
                        <input type="checkbox" name="${key}" ${value ? 'checked' : ''}>
                        ${key}
                    </label>
                `;
            } else if (typeof defaultValue === 'number') {
                div.innerHTML = `
                    <label>${key}</label>
                    <input type="number" name="${key}" value="${value}" step="any">
                `;
            } else {
                div.innerHTML = `
                    <label>${key}</label>
                    <input type="text" name="${key}" value="${value}">
                `;
            }
            this.indicatorParams.appendChild(div);
        });
    }
    getMousePositionFromEvent(event) {
        const rect = this.chartManager.container.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        const time = this.getTimeFromX(x);
        const price = this.mainSeries.coordinateToPrice(y);
        return { time, price };
}
    collectParams() {
        const inputs = this.indicatorParams.querySelectorAll('input, select');
        const params = {};
        inputs.forEach(input => {
            if (input.type === 'checkbox') {
                params[input.name] = input.checked;
            } else if (input.type === 'number') {
                params[input.name] = parseFloat(input.value);
            } else {
                params[input.name] = input.value;
            }
        });
        return params;
    }

// ui/uiController.js - полностью обновленный метод

updateIndicatorsModal() {
    console.log('🔄 updateIndicatorsModal вызван');
    console.log('📊 indicatorSettingsModal существует?', !!this.indicatorSettingsModal);
    
    if (!this.activeIndicatorsModalList) return;
    const indicators = this.state.activeIndicators;
    
    // 1. Отрисовываем список индикаторов
    if (indicators.length === 0) {
        this.activeIndicatorsModalList.innerHTML = '<div style="text-align:center; padding:20px; color:#666;">Нет активных индикаторов</div>';
        const existingClearBtn = this.activeIndicatorsModalList.parentNode?.querySelector('.clear-all-indicators-btn');
        if (existingClearBtn) existingClearBtn.remove();
        return;
    }
    
    this.activeIndicatorsModalList.innerHTML = indicators.map(ind => `
        <div class="indicator-item">
            <span>${this.getIndicatorDisplayName(ind.type)}</span>
            <div class="indicator-actions">
                <button class="edit" data-type="${ind.type}" title="Настроить">⚙️</button>
                <button class="remove" data-type="${ind.type}" title="Удалить">✖</button>
            </div>
        </div>
    `).join('');
    
    // 2. Добавляем обработчики для кнопок редактирования - УЛУЧШЕННАЯ ВЕРСИЯ
    const editButtons = this.activeIndicatorsModalList.querySelectorAll('.edit');
    console.log(`📝 Найдено кнопок редактирования: ${editButtons.length}`);
    
    editButtons.forEach(btn => {
        // Удаляем старые обработчики, чтобы не было дублирования
        const newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);
        
        newBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const type = newBtn.dataset.type;
            console.log('🔧 Нажата кнопка настройки для индикатора:', type);
            
            const indicator = this.state.activeIndicators.find(i => i.type === type);
            if (indicator) {
                console.log('✅ Найден индикатор:', indicator);
                
                // СОЗДАЁМ ОБЪЕКТ ИНДИКАТОРА ДЛЯ НАСТРОЙКИ
                const indicatorObj = {
                    type: indicator.type,
                    params: { ...indicator.params }
                };
                
                console.log('📦 Объект для настройки:', indicatorObj);
                
                // ОТКРЫВАЕМ НОВОЕ МОДАЛЬНОЕ ОКНО
                if (this.indicatorSettingsModal) {
                    console.log('🚀 Вызываем indicatorSettingsModal.open()');
                    this.indicatorSettingsModal.open(indicatorObj);
                } else {
                    console.error('❌ indicatorSettingsModal НЕ СУЩЕСТВУЕТ!');
                    alert('Ошибка: настройки индикатора недоступны');
                }
            } else {
                console.error('❌ Индикатор не найден для типа:', type);
            }
        });
    });
    
    // 3. Добавляем обработчики для кнопок удаления
    this.activeIndicatorsModalList.querySelectorAll('.remove').forEach(btn => {
        const newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);
        
        newBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const type = newBtn.dataset.type;
            console.log('🗑️ Удаляем индикатор:', type);
            this.removeIndicatorHandler(type);
        });
    });
    
    // 4. Добавляем кнопку "Очистить все индикаторы"
    const existingClearBtn = this.activeIndicatorsModalList.parentNode?.querySelector('.clear-all-indicators-btn');
    if (!existingClearBtn && indicators.length > 0) {
        const clearAllBtn = document.createElement('button');
        clearAllBtn.className = 'clear-all-indicators-btn';
        clearAllBtn.textContent = '🗑️ Очистить все индикаторы';
        clearAllBtn.style.cssText = `
            background: #f6465d20;
            color: #f6465d;
            border: 1px solid #f6465d;
            padding: 8px;
            border-radius: 6px;
            width: 100%;
            margin-top: 10px;
            cursor: pointer;
            font-size: 12px;
            transition: all 0.2s;
        `;
        clearAllBtn.onmouseenter = () => {
            clearAllBtn.style.background = '#f6465d40';
        };
        clearAllBtn.onmouseleave = () => {
            clearAllBtn.style.background = '#f6465d20';
        };
        clearAllBtn.onclick = () => {
            if (confirm('Удалить все индикаторы?')) {
                indicators.forEach(ind => this.removeIndicatorHandler(ind.type));
            }
        };
        this.activeIndicatorsModalList.parentNode.appendChild(clearAllBtn);
    }
}

// Вспомогательный метод для отображения красивого названия индикатора
getIndicatorDisplayName(type) {
    const names = {
        sma20: 'SMA (20)',
        sma50: 'SMA (50)',
        ema20: 'EMA (20)',
        rsi14: 'RSI (14)',
        macd: 'MACD',
        stochrsi: 'Stoch RSI',
        atr: 'ATR',
        adx: 'ADX',
        volume: 'Volume',
        madridRibbon: 'Madrid Ribbon',
        madridBar: 'Madrid Bar',
        emaRainbow: 'EMA Rainbow + RSI + ADX + ATR + SAR'
    };
    return names[type] || type.toUpperCase();
}

    // ========== Лог алертов ==========
    updateAlertLogModal() {
        const logContainer = document.getElementById('alertLog');
        if (!logContainer || !this.alertLogModalList) return;
        this.alertLogModalList.innerHTML = logContainer.innerHTML;
    }

    openAlertLogModal() {
        this.updateAlertLogModal();
        this.alertLogModal.style.display = 'flex';
    }

    // ========== Сигналы ==========
    updateStrategyFilterOptions() {
        if (!this.signalStrategyFilter) return;
        const strategies = new Set();
        this.state.signals.forEach(s => {
            if (s.strategy && s.strategy.trim() !== '') {
                strategies.add(s.strategy);
            } else {
                strategies.add('Без стратегии');
            }
        });
        const options = Array.from(strategies).map(strat => 
            `<option value="${strat}">${strat}</option>`
        ).join('');
        const currentValue = this.signalStrategyFilter.value;
        this.signalStrategyFilter.innerHTML = '<option value="all">Все стратегии</option>' + options;
        // Восстанавливаем выбранное значение, если оно ещё существует
        if (strategies.has(currentValue)) {
            this.signalStrategyFilter.value = currentValue;
        } else {
            this.signalStrategyFilter.value = 'all';
        }
    }

    getFilteredSignals() {
        let signals = this.state.signals;
        const searchTerm = (this.signalSearch?.value || '').toLowerCase().trim();
        const typeFilter = this.signalTypeFilter?.value || 'all';
        const strategyFilter = this.signalStrategyFilter?.value || 'all';

        console.log('=== Фильтрация сигналов ===');
        console.log('Всего сигналов:', signals.length);
        console.log('Поиск:', searchTerm);
        console.log('Тип фильтр:', typeFilter);
        console.log('Стратегия фильтр:', strategyFilter);
        if (signals.length > 0) {
            console.log('Пример сигнала:', signals[0]);
        }

        if (searchTerm) {
            signals = signals.filter(s => {
                const symbol = s.symbol.toLowerCase();
                const baseSymbol = symbol.replace('usdt', '');
                return symbol.includes(searchTerm) || baseSymbol.includes(searchTerm);
            });
            console.log('После фильтра по монете:', signals.length);
        }

        if (typeFilter !== 'all') {
            const isBullFilter = typeFilter === 'BUY' || typeFilter === 'BULL';
            signals = signals.filter(s => {
                   // Приоритет у direction
                if (s.direction === 'up') return isBullFilter;
                if (s.direction === 'down') return !isBullFilter;
                    // fallback
                const typeUpper = (s.type || '').toUpperCase();
                const isBull = typeUpper.includes('BULL') || typeUpper.includes('BUY');
                return isBullFilter ? isBull : !isBull;
    });
}
        if (strategyFilter !== 'all') {
            signals = signals.filter(s => {
                const sStrategy = s.strategy && s.strategy.trim() !== '' ? s.strategy : 'Без стратегии';
                return sStrategy === strategyFilter;
            });
            console.log('После фильтра по стратегии:', signals.length);
        }

        console.log('Итоговое количество сигналов:', signals.length);
        return signals;
    }

   // uiController.js - заменить метод renderSignals()

renderSignals() {
    if (!this.signalsListEl) return;
    const signals = this.getFilteredSignals();

    this.signalsListEl.innerHTML = signals.map(s => {
        // === Извлекаем символ ===
        let symbol = s.symbol;
        if (!symbol) {
            if (s.basic?.symbol) symbol = s.basic.symbol;
            else if (s.chart?.symbol) symbol = s.chart.symbol;
            else if (s.id) {
                const match = s.id.match(/^([A-Z0-9]+)_/);
                if (match) symbol = match[1];
            }
        }
        if (!symbol) {
            console.warn('⚠️ Сигнал без symbol:', s);
            return '';
        }
        symbol = String(symbol).toUpperCase().trim();
        const fullSymbol = symbol.endsWith('USDT') ? symbol : symbol + 'USDT';

        // === Определяем направление ===
        let isBullish = false;
        let icon = '🔻';
        if (s.direction === 'up') {
            isBullish = true;
            icon = '🚀';
        } else if (s.direction === 'down') {
            isBullish = false;
            icon = '🔻';
        } else {
            const type = s.type || 'UNKNOWN';
            isBullish = type.toUpperCase().includes('BULL') || type.toUpperCase().includes('BUY');
            icon = isBullish ? '🚀' : '🔻';
        }

        const typeClass = isBullish ? 'signal-buy' : 'signal-sell';
        const strategy = s.strategy ? `(${s.strategy})` : '';
        const timeStr = s.time ? new Date(s.time).toLocaleTimeString() : '--:--:--';
        const price = s.price ? Number(s.price) : null;
        const priceStr = price ? `@ $${price.toFixed(6)}` : '';

        // === Дополнительная информация по стратегии ===
        let extraInfo = '';
        const metrics = s.metrics || {};

        // CVD_SIGNAL
        if (s.strategy === 'CVD_SIGNAL') {
            const rawType = metrics.raw_type || s.raw_type || '';
            const cvdVal = metrics.cvd_value || s.cvd_value || 0;
            const cvdFormatted = Utils.formatQuoteVolume?.(cvdVal) || cvdVal;
            const typeText = rawType === 'CROSS_ZERO' ? 'Пересечение нуля'
                           : rawType === 'EXTREME' ? 'Экстремум'
                           : 'CVD сигнал';
            extraInfo = `<div class="signal-extra" style="font-size:10px; color:#aaa;">${typeText} | ΔCVD: ${cvdFormatted}</div>`;
        }
        // VOLUME_SPIKE
        else if (s.strategy === 'VOLUME_SPIKE') {
            const spike = metrics.spike_ratio || s.spike_ratio;
            const priceChange = metrics.price_change_5m || s.price_change_5m;
            if (spike && priceChange) {
                extraInfo = `<div class="signal-extra" style="font-size:10px; color:#aaa;">💥 Спайк: ${spike.toFixed(1)}x | Δ5м: ${priceChange.toFixed(2)}%</div>`;
            } else if (spike) {
                extraInfo = `<div class="signal-extra" style="font-size:10px; color:#aaa;">💥 Спайк: ${spike.toFixed(1)}x</div>`;
            }
        }
        // PRICE_GROWTH
        else if (s.strategy === 'PRICE_GROWTH') {
            const growth = metrics.price_growth_percent || s.price_growth_percent;
            const period = metrics.price_growth_period || s.price_growth_period;
            if (growth) {
                extraInfo = `<div class="signal-extra" style="font-size:10px; color:#aaa;">📈 Рост: ${growth.toFixed(2)}% за ${period || '?'} свечей</div>`;
            }
        }
        // OI_ANOMALY
        else if (s.strategy === 'OI_ANOMALY') {
            const oiChange = metrics.oi_change || s.oi_change;
            const oiValue = metrics.oi_value || s.oi_value;
            if (oiChange) {
                extraInfo = `<div class="signal-extra" style="font-size:10px; color:#aaa;">📊 OI: ${oiChange.toFixed(1)}% | ${Utils.formatQuoteVolume?.(oiValue) || oiValue}</div>`;
            }
        }
        // Уровни (LEVEL_BREAKOUT, LEVEL_FAKEOUT, LEVEL_APPROACH)
        else if (s.strategy && (s.strategy.startsWith('LEVEL') || s.strategy === 'LEVEL_BREAKOUT' || s.strategy === 'LEVEL_FAKEOUT' || s.strategy === 'LEVEL_APPROACH')) {
            const levelPrice = metrics.level_price || s.level_price;
            const distance = metrics.distance_percent || s.distance_percent;
            const strength = metrics.level_strength || s.level_strength;
            if (levelPrice) {
                extraInfo = `<div class="signal-extra" style="font-size:10px; color:#aaa;">🧱 Уровень: $${Number(levelPrice).toFixed(2)} | ${distance?.toFixed(2)}% | Сила: ${strength}</div>`;
            }
        }
        // Плотности (DENSITY)
        else if (s.strategy && s.strategy.includes('DENSITY')) {
            const volume = metrics.density?.volume_formatted || s.densitySize;
            const side = metrics.density?.side || s.densityDirection;
            if (volume) {
                extraInfo = `<div class="signal-extra" style="font-size:10px; color:#ffd700;">💰 Плотность: ${volume} ${side === 'bid' ? '🟢' : '🔴'} ${side?.toUpperCase() || ''}</div>`;
            }
        }

        // Проверка избранного
        const isFav = this.state.isFavorite(fullSymbol);
        const starStyle = isFav
            ? 'color: #ffd700; text-shadow: 0 0 8px #ffaa00; font-size: 18px;'
            : 'color: #3a4050; font-size: 16px;';
        const starTitle = isFav ? 'Убрать из избранного' : 'Добавить в избранное';

        return `
            <div class="signal-item ${typeClass}" data-symbol="${fullSymbol}" data-id="${s.id}">
                <span class="signal-icon">${icon}</span>
                <div class="signal-content">
                    <span class="signal-symbol">${symbol.replace('USDT', '')}${strategy}</span>
                    <span class="signal-time">${timeStr}</span>
                    <div style="font-size:11px; color:#aaa;">${priceStr}</div>
                    ${extraInfo}
                </div>
                <span class="favorite-star-signal"
                     data-symbol="${fullSymbol}"
                     style="cursor:pointer; margin-left:auto; margin-right:4px; ${starStyle};"
                     title="${starTitle}">⭐</span>
                <button class="signal-remove" style="background:none; border:none; color:#f00; cursor:pointer; font-size:14px;">✖</button>
            </div>
        `;
    }).filter(html => html !== '').join('');

    // Обработчики кликов (удаление сигнала, переключение символа)
    document.querySelectorAll('.signal-item').forEach(item => {
        item.addEventListener('click', (e) => {
            if (e.target.classList.contains('signal-remove')) {
                e.stopPropagation();
                const id = item.dataset.id;
                this.state.removeSignal(id);
                this.updateStrategyFilterOptions();
                this.renderSignals();
            } else {
                const symbol = item.dataset.symbol;
                if (symbol) this.switchSymbol(symbol);
            }
        });
    });

    this.updateStrategyFilterOptions();
}
    // ========== Шаблоны ==========
    saveWorkspace() {
        const name = prompt('Введите имя шаблона:');
        if (!name) return;
        this.state.saveWorkspace(name);
        Utils.showAlert(`Шаблон "${name}" сохранён`, this.alertContainer, this.state.soundEnabled);
    }

    loadWorkspace() {
        const names = this.state.getWorkspaceNames();
        if (names.length === 0) {
            Utils.showAlert('Нет сохранённых шаблонов', this.alertContainer, this.state.soundEnabled);
            return;
        }
        const name = prompt(`Введите имя шаблона из списка: ${names.join(', ')}`);
        if (!name) return;
        const workspace = this.state.loadWorkspace(name);
        if (!workspace) {
            Utils.showAlert('Шаблон не найден', this.alertContainer, this.state.soundEnabled);
            return;
        }
        this.applyWorkspace(workspace);
    }

    async applyWorkspace(ws) {
        
        if (ws.chartType && ws.chartType !== this.state.currentChartType) {
            this.chartManager.setChartType(ws.chartType);
            document.querySelectorAll('.chart-type-btn').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.type === ws.chartType);
            });
        }
        if (ws.indicators) {
            this.state.setGlobalIndicators(ws.indicators);
            this.chartManager.applyGlobalIndicators();
            this.updateIndicatorsModal();
        }
        if (ws.drawings && ws.drawings.length) {
            this.drawingManager.clearPreview();
            ws.drawings.forEach(d => {
                this.drawingManager.restoreDrawing(d);
            });
            // this.state.saveDrawingsForCurrent();
        }
        Utils.showAlert(`Шаблон загружен`, this.alertContainer, this.state.soundEnabled);
    }

    // Метод для очистки ресурсов
    destroy() {
        if (this.statusBarInterval) {
            clearInterval(this.statusBarInterval);
            this.statusBarInterval = null;
        }
        if (this.coinListVirtual) {
            this.coinListVirtual.destroy();
        }
        if (this.worker) {
            this.worker.terminate();
            this.worker = null;
    }
        
    }
}
    
