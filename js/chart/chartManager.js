// chart/chartManager.js
const LightweightCharts = window.LightweightCharts;
import { CONFIG } from '../config.js';
import { Utils } from '../utils.js';
import { SMAIndicator } from '../indicators/SMAIndicator.js';
import { EMAIndicator } from '../indicators/EMAIndicator.js';
import { RSIIndicator } from '../indicators/RSIIndicator.js';
import { MACDIndicator } from '../indicators/MACDIndicator.js';
import { StochRSIIndicator } from '../indicators/StochRSIIndicator.js';
import { ATRIndicator } from '../indicators/ATRIndicator.js';
import { ADXIndicator } from '../indicators/ADXIndicator.js';
import { VolumeIndicator } from '../indicators/VolumeIndicator.js';
import { KlineDatabase } from '../db/KlineDatabase.js';
import { MadridRibbonIndicator } from '../indicators/MadridRibbonIndicator.js';
import { MadridBarIndicator } from '../indicators/MadridBarIndicator.js';
if (typeof LightweightCharts === 'undefined') {
    console.error('LightweightCharts library not loaded!');
    // Принудительно загружаем
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/lightweight-charts@5.1.0/dist/lightweight-charts.standalone.production.js';
    document.head.appendChild(script);
}

export class ChartManager {
    constructor(container, state, alertContainer, dataService) {
        this.state = state;
        this.alertContainer = alertContainer;
        this.container = container;
        this.dataService = dataService;
        this.uiController = null;
        this.drawingManager = null;
        this.indicatorMap = new Map();
        this.lastContainerWidth = container.clientWidth;
        this.lastContainerHeight = container.clientHeight;
        this.userChangedTimeScale = false;
        this.isLoadingHistory = false;
        
        this.setupResizeObserver();
        this.loadMoreDebounce = null;
        this.chart = LightweightCharts.createChart(container, {
            layout: { background: { color: '#0f1219' }, textColor: '#ccc' },
            grid: { vertLines: { color: '#40455a' }, horzLines: { color: '#202433' } },
            crosshair: { mode: 0 }, // 0 = Normal
            timeScale: { timeVisible: true, secondsVisible: false, barSpacing: 8 },
            rightPriceScale: { borderColor: '#2f3545' },
            handleScale: {
                mouseWheel: true,      // масштабирование колесиком
                pinch: true,           // на тачпаде
                axisPressedMouseMove: true // масштабирование при зажатой оси
    },
            handleScroll: {
                mouseWheel: true,      // скролл колесиком (горизонтальный)
                pressedMouseMove: true // скролл при зажатой мыши
    }
        });
        this.chart.applyOptions({
            layout: {
                panes: {
                    separatorColor: '#2a2f3f',
                    separatorHoverColor: '#ffd700',
                    enableResize: true,
        },
    },
});
        this.chart.timeScale().subscribeVisibleLogicalRangeChange((logicalRange) => {
            if (logicalRange) {
                this.userChangedTimeScale = true;
                this.checkLoadMoreHistory();
    }
});     this.createOverlayCanvas();
        this.chart.timeScale().subscribeVisibleTimeRangeChange(() => {
            if (this.overlaysVisible) this.redrawOverlay();
});
        this.subscribeToChartEvents();
        this.liquidityZoneSeries = [];
        this.densitySeries = [];
        this.markers = [];
        this.densityZonesCache = new Map();
        // this.loadDensityZonesFromStorage();
        this.cleanOldDensityZones(24);
        this.densityIdMap = new Map();
        this.densityZonesForCanvas = [];   // массив зон для отрисовки на canvas
        this.densityIdMapCanvas = new Map();
        this.isRebuilding = false;
        this.elliottWaveSeries = [];   // для хранения серий линий
        this.mainSeries = this.createMainSeries(this.state.currentChartType);
        try {
            this.markersManager = LightweightCharts.createSeriesMarkers(this.mainSeries, []);
        } catch (e) {
            console.warn('createSeriesMarkers not available in standalone build – markers disabled');
            this.markersManager = null;
        }
        // 🔹 IndexedDB для плотностей
        this.densityDB = null;
        this.densityDBReady = false;
    
        this.initDensityDB().then(() => {
            this.densityDBReady = true;
            this.loadDensitiesFromDB(); // Загружаем и применяем 8ч фильтр сразу
    });

    // Очищаем старые плотности при старте (8 часов)
        setTimeout(() => this.cleanOldDensityZones(8), 1000);
        // 8. WEB WORKER
        try {
            this.worker = new Worker(new URL('../indicators/worker.js', import.meta.url), { type: 'module' });
            this.worker.onmessage = (e) => this.onWorkerMessage(e);
            this.worker.onerror = (err) => console.error('Worker error:', err);
        } catch (e) {
            console.error('Failed to create Worker:', e);
            this.worker = null;
        }
        this.pendingWorkerRequests = new Map();
        this.currentWorkerRequestId = null;
        this.overlaysVisible = true; // новый флаг
        this.loadOverlaysVisibility(); // загружаем сохранённое состояние
        this.nextPaneIndex = 1
        this.db = new KlineDatabase(); // если ещё нет
        this.db.open().catch(console.error);

    }

    // chart/chartManager.js - метод createMainSeries

    createMainSeries(type) {
        if (this.mainSeries) this.chart.removeSeries(this.mainSeries);
        const options = { priceFormat: { type: 'price', minMove: 0.00000001, precision: 8 } };
        switch(type) {
            case 'bar':
                return this.chart.addSeries(LightweightCharts.BarSeries, { upColor: CONFIG.colors.bullish, downColor: CONFIG.colors.bearish, ...options });
            case 'line':
                return this.chart.addSeries(LightweightCharts.LineSeries, { color: CONFIG.colors.gold, lineWidth: 2, ...options });
            case 'area':
                return this.chart.addSeries(LightweightCharts.AreaSeries, { topColor: CONFIG.colors.bullish + '40', bottomColor: 'transparent', lineColor: CONFIG.colors.gold, lineWidth: 2, ...options });
            default:
                return this.chart.addSeries(LightweightCharts.CandlestickSeries, { upColor: CONFIG.colors.bullish, downColor: CONFIG.colors.bearish, borderVisible: false, wickUpColor: CONFIG.colors.bullish, wickDownColor: CONFIG.colors.bearish, ...options });
    }
}
    async checkLoadMoreHistory() {
        if (this.isLoadingHistory || !this.state.chartData.length) return;
        const timeScale = this.chart.timeScale();
        const visibleRange = timeScale.getVisibleRange();
        if (!visibleRange) return;
        const firstVisibleTime = visibleRange.from;
        const firstLoadedTime = this.state.chartData[0].time;
        const visibleDuration = visibleRange.to - visibleRange.from;
        const thresholdSeconds = visibleDuration * 0.2; // 20% от видимой области
    
    // Загружаем, если до края осталось менее порога
        if (firstVisibleTime <= firstLoadedTime + thresholdSeconds) {
            console.log(`✅ Загружаем историю: firstVisible=${firstVisibleTime}, firstLoaded=${firstLoadedTime}, threshold=${thresholdSeconds}`);
            this.isLoadingHistory = true;
            const loadFromTime = Math.max(0, firstVisibleTime - visibleDuration);
            const loadToTime = firstLoadedTime - 1;
            try {
                const olderData = await this.dataService.fetchKlinesRange(
                    this.state.currentSymbol,
                    this.state.currentInterval,
                    loadFromTime,
                    loadToTime
            );
                if (olderData && olderData.length) {
                    const combined = [...olderData, ...this.state.chartData];
                    const unique = [];
                    const seen = new Set();
                    for (const c of combined) {
                        if (!seen.has(c.time)) {
                            seen.add(c.time);
                            unique.push(c);
                    }
                }
                    unique.sort((a, b) => a.time - b.time);
                    const currentVisible = timeScale.getVisibleRange();
                    this.state.chartData = unique;
                    this.mainSeries.setData(unique);
                    if (this.loadMoreDebounce) clearTimeout(this.loadMoreDebounce);
                    this.loadMoreDebounce = setTimeout(() => {
                        this.rebuildIndicatorsFromState();
                    }, 300);
                    if (currentVisible) {
                        try {
                            timeScale.setVisibleRange(currentVisible);
                        } catch (e) {}
                }
            }
            } catch (e) {
                console.error('Ошибка загрузки истории:', e);
            } finally {
                this.isLoadingHistory = false;
        }
    }
}
    // Добавьте в класс ChartManager

   // chart/chartManager.js

    updateDataWithFullHistory(fullData) {
        if (!fullData?.length) return;
        const currentData = this.state.chartData;
        if (!currentData.length) return;
    // Проверяем, есть ли новые старые свечи
        const oldestCurrent = currentData[0]?.time;
        const oldestNew = fullData[0]?.time;
        if (!oldestCurrent || !oldestNew || oldestNew >= oldestCurrent) return;

        const savedRange = this.chart.timeScale().getVisibleRange();
        this.state.chartData = fullData;
        this.mainSeries.setData(fullData);

    // Полностью перестраиваем индикаторы
        this.rebuildIndicatorsFromState().catch(console.warn);

        if (savedRange) {
            try { this.chart.timeScale().setVisibleRange(savedRange); } 
            catch { this.chart.timeScale().fitContent(); }
        } else {
            this.chart.timeScale().fitContent();
    }
        console.log(`📈 График обновлён: теперь ${fullData.length} свечей, индикаторы перестроены`);
}
    createOverlayCanvas() {
        const container = document.getElementById('chart-container');
        if (!container) return;
        this.overlayCanvas = document.createElement('canvas');
        this.overlayCanvas.style.position = 'absolute';
        this.overlayCanvas.style.top = '0';
        this.overlayCanvas.style.left = '0';
        this.overlayCanvas.style.pointerEvents = 'none';
        this.overlayCanvas.style.zIndex = '9999';
        container.style.position = 'relative';
        container.appendChild(this.overlayCanvas);
        this.ctx = this.overlayCanvas.getContext('2d');
    
    // Устанавливаем физический размер canvas с учетом devicePixelRatio
        const resizeCanvas = () => {
            const rect = container.getBoundingClientRect();
            const dpr = window.devicePixelRatio || 1;
            this.overlayCanvas.width = rect.width * dpr;
            this.overlayCanvas.height = rect.height * dpr;
            this.overlayCanvas.style.width = `${rect.width}px`;
            this.overlayCanvas.style.height = `${rect.height}px`;
            this.ctx.setTransform(1, 0, 0, 1, 0, 0);
            this.ctx.scale(dpr, dpr);
            this.redrawOverlay();
    };
    
        const resizeObserver = new ResizeObserver(() => resizeCanvas());
        resizeObserver.observe(container);
        resizeCanvas(); // первый вызов
}
              // Преобразование цены в Y-координату на canvas
    priceToY(price) {
        if (!this.chart) return null;
        const priceScale = this.chart.priceScale();
        if (!priceScale) return null;
    // Прямой метод
        if (typeof priceScale.priceToCoordinate === 'function') {
            return priceScale.priceToCoordinate(price);
    }
    // Fallback через mainSeries
        if (this.mainSeries && typeof this.mainSeries.priceToCoordinate === 'function') {
            return this.mainSeries.priceToCoordinate(price);
    }
    // Второй fallback через coordinateToPrice (работает всегда)
        const height = this.overlayCanvas?.height;
        if (height) {
            const topPrice = priceScale.coordinateToPrice(0);
            const bottomPrice = priceScale.coordinateToPrice(height);
            if (topPrice !== null && bottomPrice !== null && bottomPrice !== topPrice) {
                return ((bottomPrice - price) / (bottomPrice - topPrice)) * height;
        }
    }
        console.warn(`priceToY failed for price ${price}`);
        return null;
}

    timeToX(time) {
        const timeScale = this.chart.timeScale();
        if (!timeScale) return null;
        if (typeof timeScale.timeToCoordinate === 'function') {
            return timeScale.timeToCoordinate(time);
    }
        const width = this.overlayCanvas?.width;
        if (width) {
            const leftTime = timeScale.coordinateToTime(0);
            const rightTime = timeScale.coordinateToTime(width);
            if (leftTime !== null && rightTime !== null && rightTime !== leftTime) {
                return ((time - leftTime) / (rightTime - leftTime)) * width;
        }
    }
        return null;
}
// saveDensityZonesToStorage() {
//     try {
//         const zonesToSave = {};
//         this.densityZonesCache.forEach((densities, symbol) => {
//             zonesToSave[symbol] = densities;
//         });
//         localStorage.setItem('density_zones', JSON.stringify(zonesToSave));
//         const totalCount = Array.from(this.densityZonesCache.values())
//             .reduce((sum, arr) => sum + (Array.isArray(arr) ? arr.length : 1), 0);
//         console.log(`💾 Плотности сохранены в localStorage: ${this.densityZonesCache.size} символов, ${totalCount} плотностей`);
//     } catch (e) {
//         console.error('Ошибка сохранения плотностей:', e);
//     }
// }
    storeDensityZone(symbol, density) {
        if (!density.id) density.id = `${symbol}_${density.direction}_${Date.now()}_${Math.random()}`;
        if (!density.savedAt) density.savedAt = Date.now();
        if (!density.symbol) density.symbol = symbol;

        let densities = this.densityZonesCache.get(symbol);
        if (densities && !Array.isArray(densities)) densities = [densities];
        if (!densities) densities = [];

        // Обновляем или добавляем в кэш
        const existingIndex = densities.findIndex(d => d.id === density.id);
        if (existingIndex !== -1) densities[existingIndex] = { ...densities[existingIndex], ...density };
        else densities.push(density);

        // Ограничиваем 20 на символ
        if (densities.length > 20) {
            densities.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
            densities = densities.slice(0, 20);
        }

        this.densityZonesCache.set(symbol, densities);
        
        // 🚀 Мгновенная синхронизация с IndexedDB (не блокирует UI)
        this.saveDensityToDB(density);

        if (symbol === this.state.currentSymbol && this.state.chartData?.length >= 2) {
            this.restoreDensityZonesAfterDataLoad();
        }
    }
        // 🔹 Инициализация IndexedDB для плотностей
    async initDensityDB() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open('TradingDensityDB', 1);
            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains('densities')) {
                    const store = db.createObjectStore('densities', { keyPath: 'id' });
                    store.createIndex('symbol', 'symbol', { unique: false });
                    store.createIndex('savedAt', 'savedAt', { unique: false });
                }
            };
            req.onsuccess = (e) => { this.densityDB = e.target.result; resolve(); };
            req.onerror = (e) => reject(e.target.error);
        });
    }

    // 🔹 Загрузка и применение 8-часового фильтра
    async loadDensitiesFromDB() {
        if (!this.densityDB) return;
        const tx = this.densityDB.transaction('densities', 'readonly');
        const req = tx.objectStore('densities').getAll();
        
        req.onsuccess = () => {
            this.densityZonesCache.clear();
            const allDensities = req.result || [];
            const now = Date.now();
            const maxAgeMs = 8 * 60 * 60 * 1000; // 8 часов
            
            allDensities.forEach(d => {
                if ((d.savedAt || 0) > now - maxAgeMs) {
                    // Сохраняем в кэш только актуальные
                    if (!this.densityZonesCache.has(d.symbol)) this.densityZonesCache.set(d.symbol, []);
                    this.densityZonesCache.get(d.symbol).push(d);
                } else {
                    // Удаляем просроченные из БД фоном
                    this.deleteDensityFromDB(d.id);
                }
            });
            console.log(`📦 Загружены плотности из IndexedDB: ${this.densityZonesCache.size} символов`);
            this.restoreDensityZonesAfterDataLoad();
        };
    }

    // 🔹 Сохранение/обновление одной плотности (fire-and-forget)
    async saveDensityToDB(density) {
        if (!this.densityDB || !this.densityDBReady) return;
        return new Promise(resolve => {
            const tx = this.densityDB.transaction('densities', 'readwrite');
            tx.objectStore('densities').put(density); // put = upsert (обновит если id совпадает)
            tx.oncomplete = resolve;
        });
    }

    // 🔹 Удаление плотности из БД
    async deleteDensityFromDB(id) {
        if (!this.densityDB || !this.densityDBReady) return;
        return new Promise(resolve => {
            const tx = this.densityDB.transaction('densities', 'readwrite');
            tx.objectStore('densities').delete(id);
            tx.oncomplete = resolve;
        });
    }
        drawElliottWaves(waveLines) {
       
        if (!waveLines || !waveLines.length) return;
        const chartData = this.state.chartData;
        if (!chartData || chartData.length === 0) {
            console.warn('Нет данных графика для отрисовки волн');
            return;
        }
        // Удаляем предыдущие волны
        this.clearElliottWaves();
        waveLines.forEach(wave => {
            // Теперь x1 и x2 уже временные метки (предполагаем, что они приходят в секундах)
            const lineSeries = this.chart.addSeries(LightweightCharts.LineSeries, {
                color: wave.color,
                lineWidth: wave.width || 2,
                priceLineVisible: false,
                lastValueVisible: false
            });
            lineSeries.setData([
                { time: wave.x1, value: wave.y1 },
                { time: wave.x2, value: wave.y2 }
            ]);
            this.elliottWaveSeries.push(lineSeries);

            // Добавляем текстовую метку (номер волны)
            if (wave.label) {
                const labelSeries = this.chart.addSeries(LightweightCharts.LineSeries, {
                    color: 'transparent',
                    priceLineVisible: true,
                    priceLineWidth: 1,
                    priceLineColor: wave.color,
                    priceLineStyle: LightweightCharts.LineStyle.Dotted,
                    lastValueVisible: false
                });
                labelSeries.setData([{ time: wave.x2, value: wave.y2 }]);
                labelSeries.createPriceLine({
                    price: wave.y2,
                    title: wave.label,
                    color: wave.color,
                    lineWidth: 1,
                    lineStyle: LightweightCharts.LineStyle.Solid,
                    axisLabelVisible: true
                });
                this.elliottWaveSeries.push(labelSeries);
            }
        });
    }

    clearElliottWaves() {
        if (this.elliottWaveSeries) {
            this.elliottWaveSeries.forEach(series => {
                try { this.chart.removeSeries(series); } catch (e) {}
            });
            this.elliottWaveSeries = [];
        }
    }
    
loadDensityZone(symbol) {
    console.log(`📦 Загружаем зону плотности для ${symbol}`);
    const densities = this.densityZonesCache.get(symbol);
    
    if (densities) {
        // Преобразуем в массив, если это не массив
        const densitiesArray = Array.isArray(densities) ? densities : [densities];
        console.log(`✅ Найдено ${densitiesArray.length} плотностей для ${symbol}`, densitiesArray);
        
        if (this.state.chartData && this.state.chartData.length >= 2) {
            // Очищаем старые
            this.clearDensityZones();
            // Отрисовываем каждую
            densitiesArray.forEach(density => {
                this.showDensityZone(density);
            });
        } else {
            console.warn(`Нет данных графика для ${symbol}, откладываем отрисовку`);
            setTimeout(() => {
                if (this.state.chartData && this.state.chartData.length >= 2) {
                    this.restoreDensityZonesAfterDataLoad();
                } else {
                    console.error(`Данные графика для ${symbol} так и не загрузились`);
                }
            }, 200);
        }
    } else {
        console.log(`ℹ️ Нет кэшированной зоны для ${symbol}`);
        this.clearDensityZones();
    }
}
// loadDensityZonesFromStorage() {
//     try {
//         const saved = localStorage.getItem('density_zones');
//         if (saved) {
//             const zones = JSON.parse(saved);
//             this.densityZonesCache.clear();
//             Object.keys(zones).forEach(symbol => {
//                 let densities = zones[symbol];
//                 // Убеждаемся, что это массив
//                 if (!Array.isArray(densities)) {
//                     densities = [densities];
//                 }
//                 this.densityZonesCache.set(symbol, densities);
//             });
//             const totalCount = Array.from(this.densityZonesCache.values())
//                 .reduce((sum, arr) => sum + arr.length, 0);
//             console.log(`📦 Загружены плотности из localStorage: ${this.densityZonesCache.size} символов, ${totalCount} плотностей`);
            
//             // Если есть плотности для текущего символа, отрисовываем
//             if (this.state && this.state.currentSymbol) {
//                 setTimeout(() => {
//                     this.restoreDensityZonesAfterDataLoad();
//                 }, 200);
//             }
//         }
//     } catch (e) {
//         console.error('Ошибка загрузки плотностей:', e);
//     }
// }
    setupResizeObserver() {
        const container = document.getElementById('chart-container');
        if (!container) return;
        const resizeObserver = new ResizeObserver(() => {
            if (this.overlayCanvas) {
                this.overlayCanvas.width = container.clientWidth;
                this.overlayCanvas.height = container.clientHeight;
                this.redrawOverlay();
            }
        });
        resizeObserver.observe(container);
        this.resizeObserver = resizeObserver;
    }

    subscribeToChartEvents() {
        if (this.chart) {
            this.chart.timeScale().subscribeVisibleTimeRangeChange(() => this.redrawOverlay());
        // В LW 5.x нет подписки на изменение ценовой шкалы, перерисовка происходит при изменении времени
    }
}

    redrawOverlay(skipHeavy = false) {
       
        if (this.redrawScheduled) return;
        this.redrawScheduled = true;
        requestAnimationFrame(() => {
            if (!this.ctx) return;
            this.ctx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
        
            if (!skipHeavy && this.overlaysVisible) {
                if (this.liquidityZones?.length) this.drawLiquidityZonesOnCanvas(this.liquidityZones);
                if (this.densityHeatmap?.length) this.drawDensityHeatmapOnCanvas(this.densityHeatmap);
                if (this.smcPatterns && (this.smcPatterns.fvg?.length || this.smcPatterns.order_blocks?.length || this.smcPatterns.liquidity_sweeps?.length)) this.drawSMCPatternsOnCanvas(this.smcPatterns);
                if (this.densityZonesForCanvas?.length) this.drawDensityZonesOnCanvas(this.densityZonesForCanvas);
        }

        // 🎨 Canvas-рендер рисунков пользователя
            if (this.drawingManager) {
                this.drawingManager.renderOnCanvas(this.ctx, skipHeavy);
        }

            this.redrawScheduled = false;
    });
}
    drawLiquidityZonesOnCanvas(zones) {
       
        const timeScale = this.chart.timeScale();
        const visibleRange = timeScale.getVisibleRange();
        if (!visibleRange) return;
        const leftX = this.timeToX(visibleRange.from);
        const rightX = this.timeToX(visibleRange.to);
        if (leftX === null || rightX === null) return;
    
        zones.forEach(zone => {
            const y = this.priceToY(zone.price);
            if (y === null) return;
            this.ctx.beginPath();
            this.ctx.moveTo(leftX, y);
            this.ctx.lineTo(rightX, y);
            this.ctx.strokeStyle = zone.type === 'support' ? '#0cf10c' : '#f40cc6';
            this.ctx.lineWidth = 1;
            this.ctx.setLineDash([5, 5]);
            this.ctx.stroke();
    });
        this.ctx.setLineDash([]); // сброс
}
    drawDensityHeatmapOnCanvas(heatmap) {
       
        const timeScale = this.chart.timeScale();
        const visibleRange = timeScale.getVisibleRange();
        if (!visibleRange) return;
        const leftX = this.timeToX(visibleRange.from);
        const rightX = this.timeToX(visibleRange.to);
        if (leftX === null || rightX === null) return;
    
    // Берём топ-10 по total_volume
        const top = [...heatmap].sort((a,b) => b.total_volume - a.total_volume).slice(0, 10);
        top.forEach(zone => {
            const y = this.priceToY(zone.price);
            if (y === null) return;
            this.ctx.beginPath();
            this.ctx.moveTo(leftX, y);
            this.ctx.lineTo(rightX, y);
        // Интенсивность цвета зависит от объёма
            const intensity = Math.min(1, zone.total_volume / 1e7); // пример
            this.ctx.strokeStyle = `rgba(255, 170, 0, ${0.3 + intensity * 0.7})`;
            this.ctx.lineWidth = 2;
            this.ctx.setLineDash([]);
            this.ctx.stroke();
    });
}
    drawSMCPatternsOnCanvas(patterns) {
      
        if (!patterns || !this.ctx) return;
        const timeScale = this.chart.timeScale();
        const visibleRange = timeScale.getVisibleRange();
        if (!visibleRange) return;
    
    // FVG – квадратики
        if (patterns.fvg && patterns.fvg.length) {
            patterns.fvg.forEach(fvg => {
                const timeSec = fvg.timestamp / 1000;
                if (timeSec < visibleRange.from || timeSec > visibleRange.to) return;
                const x = this.timeToX(timeSec);
                if (x === null) return;
                const price = fvg.type === 'FVG_BULL' ? fvg.price_low : fvg.price_high;
                const y = this.priceToY(price);
                if (y === null) return;
                this.ctx.fillStyle = fvg.type === 'FVG_BULL' ? '#0ecb81' : '#f6465d';
                this.ctx.fillRect(x - 4, y - 4, 8, 8);
        });
    }
    
    // Order Blocks – кружки
        if (patterns.order_blocks && patterns.order_blocks.length) {
            patterns.order_blocks.forEach(ob => {
                const timeSec = ob.timestamp / 1000;
                if (timeSec < visibleRange.from || timeSec > visibleRange.to) return;
                const x = this.timeToX(timeSec);
                if (x === null) return;
                const price = ob.type === 'OB_BULL' ? ob.price_low : ob.price_high;
                const y = this.priceToY(price);
                if (y === null) return;
                this.ctx.beginPath();
                this.ctx.arc(x, y, 5, 0, 2 * Math.PI);
                this.ctx.fillStyle = ob.type === 'OB_BULL' ? '#0ecb81' : '#f6465d';
                this.ctx.fill();
        });
    }
    
    // Liquidity Sweeps – стрелки
        if (patterns.liquidity_sweeps && patterns.liquidity_sweeps.length) {
            patterns.liquidity_sweeps.forEach(sweep => {
                const timeSec = sweep.timestamp / 1000;
                if (timeSec < visibleRange.from || timeSec > visibleRange.to) return;
                const x = this.timeToX(timeSec);
                if (x === null) return;
                const y = this.priceToY(sweep.price);
                if (y === null) return;
                this.ctx.fillStyle = sweep.signal === 'bullish_rejection' ? '#0ecb81' : '#f6465d';
                if (sweep.signal === 'bullish_rejection') {
                // Стрелка вверх
                    this.ctx.beginPath();
                    this.ctx.moveTo(x, y - 8);
                    this.ctx.lineTo(x - 4, y - 2);
                    this.ctx.lineTo(x + 4, y - 2);
                    this.ctx.fill();
                } else if (sweep.signal === 'bearish_rejection') {
                // Стрелка вниз
                    this.ctx.beginPath();
                    this.ctx.moveTo(x, y + 8);
                    this.ctx.lineTo(x - 4, y + 2);
                    this.ctx.lineTo(x + 4, y + 2);
                    this.ctx.fill();
            }
        });
    }
}
    drawDensityZonesOnCanvas(zones) {
        if (!zones || !zones.length) return;
        const timeScale = this.chart.timeScale();
        if (!timeScale) return;
    
        const priceScale = this.chart.priceScale();
        const priceScaleWidth = priceScale.width() || 150; // ширина шкалы или дефолт
        const canvasWidth = this.overlayCanvas.width;
        const labelX = canvasWidth - priceScaleWidth - 10; // отступ 10px от шкалы
    
        const FIXED_WIDTH_PX = this.overlayCanvas.width * 0.10;
    
        zones.forEach(zone => {
            let zoneTime = zone.time;
            if (!zoneTime) {
                const lastCandle = this.state.chartData[this.state.chartData.length - 1];
                if (!lastCandle) return;
                zoneTime = lastCandle.time;
        }
            const centerX = this.timeToX(zoneTime);
            if (centerX === null) return;
            let leftX = centerX - FIXED_WIDTH_PX / 1;
            let rightX = centerX + FIXED_WIDTH_PX / 1;
            leftX = Math.max(0, leftX);
            rightX = Math.min(canvasWidth, rightX);
            if (leftX >= rightX) return;
            const width = rightX - leftX;
        
            const yStart = this.priceToY(zone.priceStart);
            const yEnd = this.priceToY(zone.priceEnd);
            if (yStart === null || yEnd === null) return;
            const y = Math.min(yStart, yEnd);
            const height = Math.abs(yEnd - yStart);
            if (height < 1) return;
        
            let fillColor, strokeColor;
            if (zone.direction === 'buy') {
                fillColor = 'rgba(71, 246, 138, 0.05)';
                strokeColor = '#a8f0c2';
            } else if (zone.direction === 'sell') {
                fillColor = 'rgba(245, 13, 44, 0.05)';
                strokeColor = '#e7495e00';
            } else {
                fillColor = 'rgba(255, 170, 0, 0.1)';
                strokeColor = '#ffaa00';
        }
        
            this.ctx.fillStyle = fillColor;
            this.ctx.fillRect(leftX, y, width, height);
            // this.ctx.strokeStyle = strokeColor;
            // this.ctx.lineWidth = 1;
            // this.ctx.strokeRect(leftX, y, width, height);
        
        /// ---- Подпись (размер и направление) ----
            this.ctx.save();
            this.ctx.shadowBlur = 0;
            this.ctx.font = 'bold 8px "Segoe UI", "Inter", monospace'; // увеличенный шрифт
            this.ctx.fillStyle = '#ffffff';
            this.ctx.strokeStyle = '#000000';
            this.ctx.lineWidth = 1;
            this.ctx.shadowColor = 'rgba(0,0,0,0.8)';
            this.ctx.shadowOffsetX = 1;
            this.ctx.shadowOffsetY = 1;

            let label = zone.direction === 'buy' ? 'BID' : (zone.direction === 'sell' ? 'ASK' : '');
            if (zone.size) {
                const formattedSize = this.formatDensitySize(zone.size);
                label += ` ${formattedSize}`;
}
           
// Размещаем текст справа от зоны (после цены)
            const labelX = rightX + 50; // отступ от правого края прямоугольника
            const labelY = y - 4;      // чуть выше верхней границы зоны

// Проверяем, не вылезает ли текст за правый край canvas
            const textWidth = this.ctx.measureText(label).width;
            const canvasWidthCSS = this.overlayCanvas.width / (window.devicePixelRatio || 1);
            if (labelX + textWidth > canvasWidthCSS - 10) {
    // Если не влезает, рисуем слева от зоны
                this.ctx.fillText(label, leftX - textWidth - 6, labelY);
            } else {
                this.ctx.fillText(label, labelX, labelY);
}
           
            this.ctx.restore();
    });
}
    clearOverlay() {
        this.liquidityZones = null;
        this.densityHeatmap = null;
        this.smcPatterns = null;
        this.densityZonesForCanvas = [];
        this.densityIdMapCanvas?.clear();
        this.redrawOverlay();
}
    drawLiquidityZones(zones, skipStore = false) {
        if (!skipStore) this.liquidityZones = zones;
        if (this.overlaysVisible) this.redrawOverlay();
}
    drawDensityHeatmap(heatmap, skipStore = false) {
        if (!skipStore) this.densityHeatmap = heatmap;
        if (this.overlaysVisible) this.redrawOverlay();
}
    drawSMCPatterns(patterns, skipStore = false) {
        if (!skipStore) this.smcPatterns = patterns;
        if (this.overlaysVisible) this.redrawOverlay();
}
    cleanOldDensityZones(maxAgeHours = 8) {
        const now = Date.now();
        const maxAgeMs = maxAgeHours * 60 * 60 * 1000;
        let removedCount = 0;

        this.densityZonesCache.forEach((densities, symbol) => {
            const densitiesArray = Array.isArray(densities) ? densities : [densities];
            const fresh = densitiesArray.filter(d => (d.savedAt || 0) > now - maxAgeMs);
            const removed = densitiesArray.length - fresh.length;

            if (removed > 0) {
                // 🗑️ Удаляем старые записи из IndexedDB
                densitiesArray.filter(d => (d.savedAt || 0) <= now - maxAgeMs)
                    .forEach(d => this.deleteDensityFromDB(d.id));
                
                removedCount += removed;
            }

            if (fresh.length > 0) this.densityZonesCache.set(symbol, fresh);
            else this.densityZonesCache.delete(symbol);
        });

        if (removedCount > 0) {
            console.log(`🧹 Удалено ${removedCount} старых плотностей (старше ${maxAgeHours}ч)`);
            if (this.state.currentSymbol) this.restoreDensityZonesAfterDataLoad();
        }
    }
loadOverlaysVisibility() {
    try {
        const saved = localStorage.getItem('overlays_visible');
        if (saved !== null) this.overlaysVisible = saved === 'true';
    } catch(e) {}
}

saveOverlaysVisibility() {
    localStorage.setItem('overlays_visible', this.overlaysVisible);
}

hideOverlays() {
    if (!this.overlaysVisible) return;
    this.overlaysVisible = false;
    this.saveOverlaysVisibility();
    
    // Удаляем все оверлейные серии
    this.clearOverlay();
}

showOverlays() {
    if (this.overlaysVisible) return;
    this.overlaysVisible = true;
    this.saveOverlaysVisibility();
    
    // Перерисовываем из сохранённых данных
    if (this.liquidityZones) this.drawLiquidityZones(this.liquidityZones, true);
    if (this.densityHeatmap) this.drawDensityHeatmap(this.densityHeatmap);
    if (this.smcPatterns) this.drawSMCPatterns(this.smcPatterns, true);
}

toggleOverlays() {
    if (this.overlaysVisible) {
        this.hideOverlays();
    } else {
        this.showOverlays();
    }
}
/**
 * Очистить плотности старше указанной даты
 * @param {number} olderThanTimestamp - временная метка (в секундах)
 */
cleanDensityZonesOlderThan(olderThanTimestamp) {
    const olderThanMs = olderThanTimestamp * 1000;
    let removedCount = 0;
    
    this.densityZonesCache.forEach((densities, symbol) => {
        const densitiesArray = Array.isArray(densities) ? densities : [densities];
        
        const filtered = densitiesArray.filter(density => {
            const densityTime = density.time ? density.time * 1000 : (density.savedAt || 0);
            return densityTime >= olderThanMs;
        });
        
        removedCount += densitiesArray.length - filtered.length;
        
        if (filtered.length > 0) {
            this.densityZonesCache.set(symbol, filtered);
        } else {
            this.densityZonesCache.delete(symbol);
        }
    });
    
    if (removedCount > 0) {
        this.saveDensityZonesToStorage();
        console.log(`🧹 Удалено ${removedCount} плотностей старше ${new Date(olderThanMs).toLocaleString()}`);
    }
}
    recalculateAllIndicators() {
        this.indicatorMap.forEach(ind => {
            const fullData = ind.computeFull(this.state.chartData);
            this._setIndicatorData(ind, fullData);
        });
    }

   
    saveVisibleTimeRange() {
        if (!this.chart) return null;
        const range = this.chart.timeScale().getVisibleRange();
        if (range && range.from && range.to) {
            this.savedTimeRange = { from: range.from, to: range.to };
            console.log('💾 Сохранён временной диапазон:', this.savedTimeRange);
            return this.savedTimeRange;
        }
        return null;
    }

    restoreVisibleTimeRange() {
        if (!this.savedTimeRange) {
            console.log('⏩ Нет сохранённого диапазона, выполняем fitContent');
            this.chart.timeScale().fitContent();
            return;
        }
        const { from, to } = this.savedTimeRange;
        const currentData = this.state.chartData;
        if (!currentData.length) {
            this.chart.timeScale().fitContent();
            return;
        }
        const firstTime = currentData[0].time;
        const lastTime = currentData[currentData.length - 1].time;
        
        // Корректируем границы, если диапазон выходит за пределы данных
        let newFrom = from;
        let newTo = to;
        if (to < firstTime || from > lastTime) {
            // Диапазон полностью вне новых данных – сбрасываем
            console.log('⚠️ Сохранённый диапазон вне новых данных, fitContent');
            this.chart.timeScale().fitContent();
            return;
        }
        if (from < firstTime) newFrom = firstTime;
        if (to > lastTime) newTo = lastTime;
        
        try {
            this.chart.timeScale().setVisibleRange({ from: newFrom, to: newTo });
            console.log('🔄 Восстановлен диапазон:', newFrom, newTo);
        } catch (e) {
            console.warn('Ошибка восстановления диапазона', e);
            this.chart.timeScale().fitContent();
        }
    }
    setData(data) {
        if (!data || !data.length) return;
        console.log('=== ПРОВЕРКА ВРЕМЕНИ В setData ===');
        console.log('Первая свеча:', data[0].time, new Date(data[0].time * 1000).toISOString());
        console.log('Последняя свеча:', data[data.length-1].time, new Date(data[data.length-1].time * 1000).toISOString());
        console.log('Интервал между последними двумя:', data[data.length-1].time - data[data.length-2].time, 'секунд');
        console.log('📊 setData вызван, userChangedTimeScale =', this.userChangedTimeScale);
        this.state.chartData = data;
        this.mainSeries.setData(data);
        this.pendingWorkerRequests.clear();
        this.redrawOverlay();
        this.currentWorkerRequestId = null;
        this.clearElliottWaves();
    // Принудительно сбрасываем масштаб, если пользователь не менял его вручную
    //     if (!this.userChangedTimeScale) {
    //         this.chart.timeScale().fitContent();
    //         this.userChangedTimeScale = false;
    // }     else {
    //         console.log('⏭️ fitContent НЕ вызван (пользователь менял масштаб)');
    // }

        this.indicatorMap.forEach(ind => {
            const fullData = ind.computeFull(data);
            this._setIndicatorData(ind, fullData);
    });
        this.restoreDensityZonesAfterDataLoad();
}

    _setIndicatorData(indicator, fullData) {
        if (!fullData || !fullData.length) {
            console.warn(`_setIndicatorData: нет данных для ${indicator.type}`);
            return;
    }
        const prepareData = (data) => {
            return data
                .map(item => {
                    if (!item || typeof item.time === 'undefined') return null;
                    let time = Number(item.time);
                    if (isNaN(time)) return null;
                    if (time > 1e12) time = Math.floor(time / 1000);
                    time = Math.floor(time);
                    const value = item.value;
                    if (value === null || value === undefined || isNaN(value)) return null;
                    return { time, value, color: item.color };
            })
                .filter(item => item !== null);
    };
        if (Array.isArray(fullData[0])) {
            fullData.forEach((seriesData, idx) => {
                if (indicator.series[idx]) {
                    const prepared = prepareData(seriesData);
                    if (prepared.length) {
                        try {
                            indicator.series[idx].setData(prepared);
                        } catch (e) {
                            console.error(`setData error for ${indicator.type} series ${idx}:`, e);
                    }
                }
            }
        });
        } else {
            const prepared = prepareData(fullData);
            if (prepared.length) {
                try {
                    indicator.series[0].setData(prepared);
                } catch (e) {
                    console.error(`setData error for ${indicator.type}:`, e);
            }
        }
    }
}
    async addIndicator(type, params = {}) {
        if (this.indicatorMap.has(type)) {
            Utils.showAlert('Индикатор уже добавлен', this.alertContainer, this.state.soundEnabled);
            return null;
    }
        const config = CONFIG.indicators.find(i => i.type === type);
        if (!config) return null;

        const mergedParams = { ...config.defaultParams, ...params, color: config.color, scale: config.scale };
        if (config.colors) mergedParams.colors = config.colors;

        const minDataRequired = this.getMinDataRequired(type);
        if (this.state.chartData.length < minDataRequired) {
            Utils.showAlert(`Недостаточно данных для ${type} (нужно минимум ${minDataRequired} свечей)`, this.alertContainer, this.state.soundEnabled);
            return null;
    }

    // Определяем панель
        const mainPaneTypes = new Set(['madridRibbon', 'sma20', 'sma50', 'ema20', 'ema9', 'ema50', 'ema100', 'ema200']);
        let paneIndex = 0;
        if (!mainPaneTypes.has(type)) {
        // Считаем, сколько уже есть не-основных индикаторов (игнорируем основные)
            const nonMainCount = Array.from(this.indicatorMap.values()).filter(ind => !mainPaneTypes.has(ind.type)).length;
            paneIndex = nonMainCount + 1;
    }

        let indicator;
        switch(type) {
            case 'sma20': case 'sma50': indicator = new SMAIndicator(mergedParams, this); break;
            case 'ema20': indicator = new EMAIndicator(mergedParams, this); break;
            case 'ema9': case 'ema50': case 'ema100': case 'ema200':
                indicator = new EMAIndicator(mergedParams, this); break;
            case 'rsi14': indicator = new RSIIndicator(mergedParams, this); break;
            case 'macd': indicator = new MACDIndicator(mergedParams, this); break;
            case 'stochrsi': indicator = new StochRSIIndicator(mergedParams, this); break;
            case 'atr': indicator = new ATRIndicator(mergedParams, this); break;
            case 'adx': indicator = new ADXIndicator(mergedParams, this); break;
            case 'volume': indicator = new VolumeIndicator(mergedParams, this); break;
            case 'madridRibbon': indicator = new MadridRibbonIndicator(mergedParams, this); break;
            case 'madridBar': indicator = new MadridBarIndicator(mergedParams, this); break;
            default: console.warn('Unknown indicator type', type); return null;
    }

        indicator.createSeries(this.chart, paneIndex);

    // ========== КЭШИРОВАНИЕ ==========
    // Пытаемся загрузить из IndexedDB
        const cachedData = await this.dataService.db.getIndicator(
            this.state.currentSymbol,
            this.state.currentInterval,
            type,
            mergedParams
    );
    
        if (cachedData) {
            this._setIndicatorData(indicator, cachedData);
            this.indicatorMap.set(type, indicator);
            console.log(`📦 Индикатор ${type} загружен из кэша`);
            return indicator;
    }

    // Нет в кэше – вычисляем
        if (this.isHeavyIndicator(type) && this.worker) {
            const requestId = `${type}_${Date.now()}_${Math.random()}`;
            this.currentWorkerRequestId = requestId;
            this.pendingWorkerRequests.set(requestId, indicator);
            this.worker.postMessage({
                type,
                data: this.state.chartData,
                params: mergedParams,
                requestId,
                symbol: this.state.currentSymbol,
                interval: this.state.currentInterval
        });
        // Сохранение в кэш произойдёт в onWorkerMessage
        } else {
            const fullData = indicator.computeFull(this.state.chartData);
            this._setIndicatorData(indicator, fullData);
            this.indicatorMap.set(type, indicator);
        // Сохраняем в кэш (асинхронно, не ждём)
            this.dataService.db.saveIndicator(
                this.state.currentSymbol,
                this.state.currentInterval,
                type,
                mergedParams,
                fullData
            ).catch(e => console.warn('Ошибка сохранения индикатора в кэш', e));
    }
        return indicator;
}
    isHeavyIndicator(type) {
        return ['madridRibbon', 'madridBar', 'macd', 'stochrsi', 'adx'].includes(type);
    }

    onWorkerMessage(e) {
        const { type, result, requestId, error, symbol, interval, params } = e.data;
        if (symbol !== this.state.currentSymbol || interval !== this.state.currentInterval) {
            return;
    }
        const indicator = this.pendingWorkerRequests.get(requestId);
        if (!indicator) return;
        this.pendingWorkerRequests.delete(requestId);
        if (error) {
            console.error(`Worker error for ${type}:`, error);
            return;
    }
        this._setIndicatorData(indicator, result);
        this.indicatorMap.set(type, indicator);
    // Сохраняем в кэш
        this.db.saveIndicator(symbol, interval, type, indicator.params, result)
            .catch(e => console.warn('Ошибка сохранения индикатора в кэш', e));
}

    getMinDataRequired(type) {
        switch(type) {
            case 'madridRibbon':
            case 'madridBar':
                return 100;
            case 'rsi14':
            case 'stochrsi':
            case 'adx':
            case 'atr':
                return 14;
            case 'macd':
                return 26;
            case 'sma20':
            case 'ema20':
                return 20;
            case 'sma50':
                return 50;
            default:
                return 1;
        }
    }

    removeIndicator(type) {
        const ind = this.indicatorMap.get(type);
        if (ind) {
            ind.remove();
            this.indicatorMap.delete(type);
        }
    }

    // chart/chartManager.js

async rebuildIndicatorsFromState() {
    if (this.isRebuilding) return;
    this.isRebuilding = true;
    try {
        // ... существующий код перестроения ...
    } finally {
        this.isRebuilding = false;
    }
}

    updateLastCandle(candle, isNewCandle = true) {
        if (this.isRebuilding || this.isLoadingHistory) return;
        if (!candle || !this.mainSeries) return;
    
    // Валидация свечи
        if (typeof candle.time !== 'number' || isNaN(candle.time) ||
            typeof candle.close !== 'number' || isNaN(candle.close) ||
            typeof candle.high !== 'number' || isNaN(candle.high) ||
            typeof candle.low !== 'number' || isNaN(candle.low) ||
            typeof candle.open !== 'number' || isNaN(candle.open)) {
            return;
    }
    
        try {
            this.mainSeries.update(candle);
        } catch (e) {
            console.error('updateLastCandle mainSeries error', e);
            return;
    }
    
    // Обновляем индикаторы с защитой от ошибок
        this.indicatorMap.forEach((ind, type) => {
            try {
                if (ind.series && ind.series.length && ind.series[0] && typeof ind.updateLast === 'function') {
                    ind.updateLast(candle, this.state.chartData, isNewCandle);
                } else {
                    this.indicatorMap.delete(type);
            }
            } catch (e) {
                console.error(`❌ Индикатор ${ind.type} вызвал ошибку и будет удалён:`, e);
                this.indicatorMap.delete(type); // Удаляем проблемный индикатор
        }
    });
    
        this.checkDensityZonesForBreak(candle);
}
    formatDensitySize(size) {
        if (!size) return '';
        const num = parseFloat(size);
        if (isNaN(num)) return '';
        if (num >= 1e9) return (num / 1e9).toFixed(1) + 'B';
        if (num >= 1e6) return (num / 1e6).toFixed(1) + 'M';
        if (num >= 1e3) return (num / 1e3).toFixed(1) + 'K';
        return num.toFixed(0);
}
    clearAllIndicators() {
        this.indicatorMap.forEach(ind => ind.remove());
        this.indicatorMap.clear();
        this.nextPaneIndex = 1;
        
    }
    async rebuildIndicatorsFromState() {
        if (this.isRebuilding) return;
        this.isRebuilding = true;
        try {
        // Сохраняем данные
            const currentData = this.state.chartData;
        
        // Удаляем все серии индикаторов
            this.indicatorMap.forEach(ind => ind.remove());
            this.indicatorMap.clear();

            const indicators = [...this.state.activeIndicators];
            console.log('🔄 Перестраиваем индикаторы в порядке:', indicators.map(i => i.type));

            const mainPaneTypes = new Set(['madridRibbon', 'sma20', 'sma50', 'ema20', 'ema9', 'ema50', 'ema100', 'ema200']);
            let nextPaneIndex = 1; // сбрасываем счётчик

            for (const item of indicators) {
                const { type, params } = item;
                let paneIndex = 0;
                if (!mainPaneTypes.has(type)) {
                    paneIndex = nextPaneIndex++;
            }
                console.log(`   ${type} -> панель ${paneIndex}`);
                await this.addIndicatorWithPane(type, params, paneIndex);
        }
            console.log('✅ Индикаторы перестроены, панели последовательны');
        } finally {
            this.isRebuilding = false;
    }
}
    async addIndicatorWithPane(type, params, paneIndex) {
        if (this.indicatorMap.has(type)) {
            console.warn(`Индикатор ${type} уже существует, пропускаем`);
            return null;
}
    
        const config = CONFIG.indicators.find(i => i.type === type);
        if (!config) return null;
    
        const mergedParams = { ...config.defaultParams, ...params, color: config.color, scale: config.scale };
        if (config.colors) mergedParams.colors = config.colors;
    
    // Создаём индикатор (как обычно)
        let indicator;
        switch(type) {
            case 'sma20': case 'sma50': indicator = new SMAIndicator(mergedParams, this); break;
            case 'ema20': indicator = new EMAIndicator(mergedParams, this); break;
            case 'ema9': case 'ema50': case 'ema100': case 'ema200': indicator = new EMAIndicator(mergedParams, this); break;
            case 'rsi14': indicator = new RSIIndicator(mergedParams, this); break;
            case 'macd': indicator = new MACDIndicator(mergedParams, this); break;
            case 'stochrsi': indicator = new StochRSIIndicator(mergedParams, this); break;
            case 'atr': indicator = new ATRIndicator(mergedParams, this); break;
            case 'adx': indicator = new ADXIndicator(mergedParams, this); break;
            case 'volume': indicator = new VolumeIndicator(mergedParams, this); break;
            case 'madridRibbon': indicator = new MadridRibbonIndicator(mergedParams, this); break;
            case 'madridBar': indicator = new MadridBarIndicator(mergedParams, this); break;
            default: return null;
    }
    
    // Создаём серию с переданным paneIndex
        indicator.createSeries(this.chart, paneIndex);
    
    // Загружаем данные (с кэшем или через worker)
        // Загружаем данные из кэша
//     const cachedData = await this.db.getIndicator(
//         this.state.currentSymbol,
//         this.state.currentInterval,
//         type,
//         mergedParams
// );
//     if (cachedData) {
//         this._setIndicatorData(indicator, cachedData);
//         this.indicatorMap.set(type, indicator);
//         console.log(`📦 Индикатор ${type} загружен из кэша`);
//         return indicator;
// }

// Нет в кэше – вычисляем
    if (this.isHeavyIndicator(type) && this.worker) {
        const requestId = `${type}_${Date.now()}_${Math.random()}`;
        this.pendingWorkerRequests.set(requestId, indicator);
        this.worker.postMessage({
            type, data: this.state.chartData, params: mergedParams, requestId,
            symbol: this.state.currentSymbol, interval: this.state.currentInterval
    });
    } else {
        const fullData = indicator.computeFull(this.state.chartData);
        this._setIndicatorData(indicator, fullData);
        this.indicatorMap.set(type, indicator);
        this.db.saveIndicator(
            this.state.currentSymbol, this.state.currentInterval,
            type, mergedParams, fullData
        ).catch(e => console.warn('Ошибка сохранения индикатора в кэш', e));
}
    return indicator;
        // Временно отключаем кэш индикаторов
        // const fullData = indicator.computeFull(this.state.chartData);
        // this._setIndicatorData(indicator, fullData);
        
        this.indicatorMap.set(type, indicator);
        return indicator;
}
//     async rebuildIndicators() {
//         if (this.state.chartData.length === 0) return;
    
//     // Сохраняем текущий список индикаторов
//         const indicatorsToRebuild = [...this.state.activeIndicators];
    
//     // Удаляем все текущие индикаторы
//         this.clearAllIndicators();
    
//     // Добавляем заново в том же порядке
//         for (const item of indicatorsToRebuild) {
//             await this.addIndicator(item.type, item.params);
//     }
//         console.log('🔄 Индикаторы перестроены, панели последовательны');
// }
    setChartType(type) {
        this.state.setChartType(type);
        const data = this.state.chartData;
        this.mainSeries = this.createMainSeries(type);
        if (data.length) this.mainSeries.setData(data);
        console.log('🔍 fitContent из setChartType');
        this.chart.timeScale().fitContent();
    }

    refreshChartSize() {
        if (!this.chart) return;
        const newWidth = this.container.clientWidth;
        const newHeight = this.container.clientHeight;
        if (newWidth !== this.lastContainerWidth || newHeight !== this.lastContainerHeight) {
            console.log('🔄 refreshChartSize: ресайз с', this.lastContainerWidth, 'x', this.lastContainerHeight, 'на', newWidth, 'x', newHeight);
            this.lastContainerWidth = newWidth;
            this.lastContainerHeight = newHeight;
            this.chart.resize(newWidth, newHeight);
            // Важно: НЕ вызываем fitContent()
        }
    }
   
    showDensityZone(density) {
        console.log('🎨 showDensityZone вызван, overlaysVisible =', this.overlaysVisible);
    
        if (!this.overlaysVisible) {
            console.log('❌ Оверлеи выключены, плотность не будет добавлена');
            return false;
    }
    
        const data = this.state.chartData;
        if (!data || data.length < 2) {
            console.warn('❌ showDensityZone: нет данных графика');
            return false;
    }

    // Убедимся, что у плотности есть id
        if (!density.id) {
            density.id = `${density.symbol}_${density.direction}_${Date.now()}_${Math.random()}`;
    }
        if (!density.savedAt) density.savedAt = Date.now();

    // Нормализуем границы цены
        let priceStart = density.priceStart;
        let priceEnd = density.priceEnd;
        if (Math.abs(priceStart - priceEnd) < 0.0001) {
            const margin = Math.max(priceStart * 0.001, 0.001);
            priceStart = priceStart - margin;
            priceEnd = priceEnd + margin;
            density.priceStart = priceStart;
            density.priceEnd = priceEnd;
    }

    // Проверяем, нет ли уже такой зоны
        if (this.densityIdMapCanvas && this.densityIdMapCanvas.has(density.id)) {
            console.log('⚠️ Плотность уже существует, пропускаем', density.id);
            return false;
    }

    // Добавляем в массив
        if (!this.densityZonesForCanvas) this.densityZonesForCanvas = [];
        this.densityZonesForCanvas.push(density);
        if (!this.densityIdMapCanvas) this.densityIdMapCanvas = new Map();
        this.densityIdMapCanvas.set(density.id, density);
    
    // Ограничиваем количество (20)
        if (this.densityZonesForCanvas.length > 20) {
            const removed = this.densityZonesForCanvas.shift();
            this.densityIdMapCanvas.delete(removed.id);
    }
    
        console.log(`✅ Плотность добавлена в массив, теперь всего: ${this.densityZonesForCanvas.length}`);
    
    // Запускаем перерисовку canvas
        this.redrawOverlay();
        return true;
}
    restoreDensityZonesAfterDataLoad() {
        console.log('🔄 restoreDensityZonesAfterDataLoad вызван');
        if (!this.state.chartData || this.state.chartData.length < 2) {
            console.warn('Нет данных для восстановления плотностей');
            return;
    }
        const densities = this.densityZonesCache.get(this.state.currentSymbol);
        if (densities) {
            const densitiesArray = Array.isArray(densities) ? densities : [densities];
            console.log(`📦 Восстанавливаем ${densitiesArray.length} плотностей для ${this.state.currentSymbol}`);
            this.clearDensityZones();
            densitiesArray.forEach(density => {
                this.showDensityZone(density);
        });
            console.log(`📊 После восстановления в массиве ${this.densityZonesForCanvas.length} плотностей`);
        } else {
            console.log(`ℹ️ Нет сохранённых плотностей для ${this.state.currentSymbol}`);
            this.redrawOverlay();    
    }
}
//   restoreDensityZonesAfterDataLoad() {
//     if (!this.overlaysVisible) return;
//     console.log('🔄 Восстанавливаем плотности после загрузки данных');

//     if (!this.state.chartData || this.state.chartData.length < 2) {
//         console.warn('Нет данных для восстановления плотностей');
//         return;
//     }

//     const densities = this.densityZonesCache.get(this.state.currentSymbol);
//     if (densities) {
//         const densitiesArray = Array.isArray(densities) ? densities : [densities];
//         if (densitiesArray.length > 0) {
//             console.log(`📦 Восстанавливаем ${densitiesArray.length} плотностей для ${this.state.currentSymbol}`);

//             // Очищаем старые серии и карту id
//             this.clearDensityZones();
//             if (this.densityIdMap) this.densityIdMap.clear();

//             // Отрисовываем каждую
//             densitiesArray.forEach(density => {
//                 this.showDensityZone(density);
//             });
//         }
//     }
// }
/**
 * Проверить, не пересекла ли цена зоны плотности, и удалить пробитые
 * @param {Object} candle - текущая свеча { time, open, high, low, close }
 */
    checkDensityZonesForBreak(candle) {
        if (this.state.autoRemoveBrokenDensities === false) return;
        if (!candle || typeof candle.close !== 'number') return;
        
        const symbol = this.state.currentSymbol;
        let densities = this.densityZonesCache.get(symbol);
        if (!densities) return;
        const densitiesArray = Array.isArray(densities) ? densities : [densities];
        if (densitiesArray.length === 0) return;

        const close = candle.close;
        const toRemove = [];

        for (const density of densitiesArray) {
            const { direction, priceStart, priceEnd, id } = density;
            let broken = false;

            // ✅ УСЛОВИЕ ПРОБОЯ СОХРАНЕНО
            if (direction === 'buy' && close < priceStart) broken = true;
            else if (direction === 'sell' && close > priceEnd) broken = true;

            if (broken) toRemove.push(density);
        }

        if (toRemove.length === 0) return;

        const remaining = densitiesArray.filter(d => !toRemove.includes(d));
        this.densityZonesCache.set(symbol, remaining.length > 0 ? remaining : null);

        // 🗑️ Удаляем пробитые плотности из IndexedDB
        toRemove.forEach(d => this.deleteDensityFromDB(d.id));
        
        // Обновляем Canvas если это текущий символ
        if (symbol === this.state.currentSymbol) {
            this.clearDensityZones();
            if (remaining.length > 0) this.restoreDensityZonesAfterDataLoad();
        }

        console.log(`✅ Удалено ${toRemove.length} пробитых плотностей для ${symbol}`);
    }
/**
 * Удалить конкретную зону плотности с графика по её id
 * @param {Object} density - объект плотности (должен содержать id)
 */
removeDensityZoneFromChart(density) {
    if (!density.id) return;
    const series = this.densityIdMap?.get(density.id);
    if (series) {
        try {
            this.chart.removeSeries(series);
            this.densityIdMap.delete(density.id);
            // Удаляем из массива densityZoneSeries
            const idx = this.densityZoneSeries?.indexOf(series);
            if (idx !== -1) this.densityZoneSeries.splice(idx, 1);
        } catch (e) {
            console.warn('Ошибка удаления серии плотности:', e);
        }
    }
}
    clearDensityZones() {
        console.log('🧹 clearDensityZones: очищаем массив плотностей');
        if (this.densityZonesForCanvas) this.densityZonesForCanvas = [];
        if (this.densityIdMapCanvas) this.densityIdMapCanvas.clear();
        this.redrawOverlay();
}
/**
 * Обновить плотности при смене символа
 */
    updateDensityZonesForSymbol(symbol) {
           this.clearDensityZones();
    // Здесь можно загрузить сохранённые плотности для символа из state
    // Пока просто очищаем
}
    setDrawingManager(dm) { this.drawingManager = dm; }
    setUIController(ui) { this.uiController = ui; }

    async applyGlobalIndicators() {
        
        if (this.state.chartData.length === 0) {
            console.warn('applyGlobalIndicators: нет данных графика, пропускаем');
            return;
    }
        await this.rebuildIndicatorsFromState(); // используем единый метод
}
        
// Добавьте в конец класса ChartManager
debugDensityZones() {
    console.log('=== DEBUG DENSITY ZONES ===');
    console.log('Current symbol:', this.state.currentSymbol);
    console.log('Chart data loaded:', this.state.chartData?.length || 0);
    
    const densities = this.densityZonesCache.get(this.state.currentSymbol);
    if (densities) {
        const densitiesArray = Array.isArray(densities) ? densities : [densities];
        console.log(`Densities for ${this.state.currentSymbol}: ${densitiesArray.length}`);
        densitiesArray.forEach((d, i) => {
            console.log(`  ${i + 1}. ${d.direction}: ${d.priceStart} - ${d.priceEnd}, time: ${d.time}`);
        });
    } else {
        console.log(`No densities for ${this.state.currentSymbol}`);
    }
    
    console.log('All cached symbols:', Array.from(this.densityZonesCache.keys()));
    console.log('===========================');
}
    destroy() {
        if (this.worker) {
            this.worker.terminate();
            this.worker = null;
        }
    }
} 