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
import { MadridRibbonIndicator } from '../indicators/MadridRibbonIndicator.js';
import { MadridBarIndicator } from '../indicators/MadridBarIndicator.js';

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
        this.createOverlayCanvas();
        this.setupResizeObserver();
        this.subscribeToChartEvents();
        this.liquidityZoneSeries = [];    // для линий зон
        this.densitySeries = [];          // для линий плотностей
        this.markers = [];                // для SMC-маркеров
       
        this.densityZonesCache = new Map();  // symbol -> { priceStart, priceEnd, direction, size }

        // Web Worker
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

        if (!container) {
            throw new Error('ChartManager: container element not found');
        }

        this.chart = LightweightCharts.createChart(container, {
            layout: { background: { color: '#0f1219' }, textColor: '#ccc' },
            grid: { vertLines: { color: '#202433' }, horzLines: { color: '#202433' } },
            crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
            timeScale: { timeVisible: true, secondsVisible: false, barSpacing: 8 },
            rightPriceScale: { borderColor: '#2f3545' },
        });

        this.chart.timeScale().subscribeVisibleTimeRangeChange(() => {
            console.log('📌 userChangedTimeScale = true (изменение видимого диапазона)');
            this.userChangedTimeScale = true;
            this.checkLoadMoreHistory();
        });
        
        // Пустые серии для шкал
        this.chart.addLineSeries({ color: 'transparent', priceScaleId: 'rsi', visible: false });
        this.chart.addHistogramSeries({ color: 'transparent', priceScaleId: 'volume', visible: false });
        this.chart.addLineSeries({ color: 'transparent', priceScaleId: 'macd', visible: false });
        this.chart.addLineSeries({ color: 'transparent', priceScaleId: 'stoch', visible: false });
        this.chart.addLineSeries({ color: 'transparent', priceScaleId: 'atr', visible: false });
        this.chart.addLineSeries({ color: 'transparent', priceScaleId: 'adx', visible: false });
        this.chart.addHistogramSeries({ color: 'transparent', priceScaleId: 'madridBar', visible: false });

        this.chart.priceScale('right').applyOptions({ scaleMargins: { top: 0.0, bottom: 0.3 } });
        this.chart.priceScale('rsi').applyOptions({ scaleMargins: { top: 0.65, bottom: 0.15 }, borderVisible: false });
        this.chart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.70, bottom: 0.10 }, borderVisible: false });
        this.chart.priceScale('macd').applyOptions({ scaleMargins: { top: 0.7, bottom: 0.15 }, borderVisible: false });
        this.chart.priceScale('stoch').applyOptions({ scaleMargins: { top: 0.7, bottom: 0.15 }, borderVisible: false });
        this.chart.priceScale('atr').applyOptions({ scaleMargins: { top: 0.65, bottom: 0.15 }, borderVisible: false });
        this.chart.priceScale('adx').applyOptions({ scaleMargins: { top: 0.7, bottom: 0.15 }, borderVisible: false });
        this.chart.priceScale('madridBar').applyOptions({
            scaleMargins: { top: 0.8, bottom: 0.0 },
            borderVisible: false,
            autoScale: false,
        });
       

        this.mainSeries = this.createMainSeries(this.state.currentChartType);
    }
 
    async checkLoadMoreHistory() {
        if (this.isLoadingHistory || !this.state.chartData.length) return;

        const timeScale = this.chart.timeScale();
        const visibleRange = timeScale.getVisibleRange();
        if (!visibleRange) return;

        const firstVisibleTime = visibleRange.from;
        const firstLoadedTime = this.state.chartData[0].time;

        if (firstVisibleTime < firstLoadedTime) {
            console.log('📥 Загрузка более старой истории...');
            this.isLoadingHistory = true;

            const visibleDuration = visibleRange.to - visibleRange.from;
            const loadFromTime = firstVisibleTime - visibleDuration;
            const loadToTime = firstLoadedTime - 1;

            try {
                const olderData = await this.dataService.fetchKlinesRange(
                    this.state.currentSymbol,
                    this.state.currentInterval,
                    loadFromTime,
                    loadToTime
                );

                if (olderData && olderData.length > 0) {
                    const combined = [...olderData, ...this.state.chartData];
                    this.state.chartData = combined;
                    this.mainSeries.setData(combined);
                    this.recalculateAllIndicators();
                }
            } catch (e) {
                console.error('Ошибка загрузки истории:', e);
            } finally {
                this.isLoadingHistory = false;
            }
        }
    }
    createOverlayCanvas() {
        const container = document.getElementById('chart-container');
        if (!container) return;
        this.overlayCanvas = document.createElement('canvas');
        this.overlayCanvas.style.position = 'absolute';
        this.overlayCanvas.style.top = '0';
        this.overlayCanvas.style.left = '0';
        this.overlayCanvas.style.pointerEvents = 'none';
        this.overlayCanvas.width = container.clientWidth;
        this.overlayCanvas.height = container.clientHeight;
        container.style.position = 'relative';
        container.appendChild(this.overlayCanvas);
        this.ctx = this.overlayCanvas.getContext('2d');
    }
              // Преобразование цены в Y-координату на canvas
    priceToY(price) {
        const priceScale = this.chart.priceScale();
        if (!priceScale) return null;

    // 1. Прямые методы (если есть)
        if (typeof priceScale.priceToCoordinate === 'function') {
            return priceScale.priceToCoordinate(price);
    }
        if (typeof priceScale.priceToY === 'function') {
            return priceScale.priceToY(price);
    }
        if (typeof priceScale.convertPriceToCoordinate === 'function') {
            return priceScale.convertPriceToCoordinate(price);
    }
                  // 2. Используем coordinateToPrice (есть в вашей версии)
        if (typeof priceScale.coordinateToPrice === 'function') {
            const height = this.overlayCanvas.height;
            if (!height) return null;
            const topPrice = priceScale.coordinateToPrice(0);
            const bottomPrice = priceScale.coordinateToPrice(height);
            if (topPrice === null || bottomPrice === null) return null;
            const priceRange = bottomPrice - topPrice;
            if (priceRange === 0) return null;
            const y = ((bottomPrice - price) / priceRange) * height;
            return y;
    }

        console.warn('No priceToY/coordinateToPrice method found');
        return null;
}

                 // Преобразование времени в X-координату на canvas
    timeToX(time) {
        const timeScale = this.chart.timeScale();
        if (!timeScale) return null;

    // 1. Прямые методы (если есть)
        if (typeof timeScale.timeToCoordinate === 'function') {
            return timeScale.timeToCoordinate(time);
    }
        if (typeof timeScale.timeToX === 'function') {
            return timeScale.timeToX(time);
    }

    // 2. Используем coordinateToTime (есть в вашей версии)
        if (typeof timeScale.coordinateToTime === 'function') {
            const width = this.overlayCanvas.width;
            if (!width) return null;
            const leftTime = timeScale.coordinateToTime(0);
            const rightTime = timeScale.coordinateToTime(width);
            if (leftTime === null || rightTime === null) return null;
            const timeRange = rightTime - leftTime;
            if (timeRange === 0) return null;
            const x = ((time - leftTime) / timeRange) * width;
            return x;
    }

      return null;
}   
    storeDensityZone(symbol, density) {
        console.log(`💾 Сохраняем зону плотности для ${symbol}`, density);
        this.densityZonesCache.set(symbol, density);
}

/**
 * Загрузить зону плотности из кэша и отрисовать
 * @param {string} symbol 
 */
    loadDensityZone(symbol) {
        const density = this.densityZonesCache.get(symbol);
        if (density) {
            console.log(`📦 Загружаем кэшированную зону плотности для ${symbol}`, density);
        // Проверяем, что данные графика уже загружены
            if (this.state.chartData && this.state.chartData.length >= 2) {
                this.showDensityZone(density);
            } else {
                console.warn(`Нет данных графика для ${symbol}, откладываем отрисовку`);
            // Если данных ещё нет, можно повторить попытку через небольшой интервал
                setTimeout(() => {
                    if (this.state.chartData && this.state.chartData.length >= 2) {
                        this.showDensityZone(density);
                    } else {
                        console.error(`Данные графика для ${symbol} так и не загрузились`);
                }
                }, 200);
        }
        } else {
            console.log(`Нет кэшированной зоны для ${symbol}`);
    }
}
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
            this.chart.priceScale().subscribeVisibleLogicalRangeChange(() => this.redrawOverlay());
        }
    }

    redrawOverlay() {
        if (!this.ctx) return;
        this.ctx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
        if (this.liquidityZones) this.drawLiquidityZones(this.liquidityZones, true);
        if (this.densityHeatmap) this.drawDensityHeatmap(this.densityHeatmap, true);
        if (this.smcPatterns) this.drawSMCPatterns(this.smcPatterns, true);
    }

    clearOverlay() {
    // Зоны ликвидности
        if (this.liquidityZoneSeries) {
            this.liquidityZoneSeries.forEach(series => this.chart.removeSeries(series));
            this.liquidityZoneSeries = [];
    }
    // Линии тепловой карты плотностей
        if (this.densitySeries) {
            this.densitySeries.forEach(series => this.chart.removeSeries(series));
            this.densitySeries = [];
    }
                  // Зоны плотности из сигналов
        if (this.densityZoneSeries) {
            this.densityZoneSeries.forEach(series => this.chart.removeSeries(series));
            this.densityZoneSeries = [];
    }
    // SMC-маркеры
        this.mainSeries.setMarkers([]);

        if (this.chart && this.chart.timeScale()) {
        // Небольшой трюк: изменяем размер, чтобы график обновился
            this.chart.resize(this.container.clientWidth, this.container.clientHeight);
    }
}    
    // ========== Отрисовка зон ликвидности ==========
    drawLiquidityZones(zones, skipStore = false) {
        if (!skipStore) this.liquidityZones = zones;

    // Удаляем старые линии
        this.liquidityZoneSeries.forEach(series => this.chart.removeSeries(series));
        this.liquidityZoneSeries = [];

        const data = this.state.chartData;
        if (!data || data.length < 2) return;

        zones.forEach(zone => {
            const lineSeries = this.chart.addLineSeries({
                color: zone.type === 'support' ? '#00ff00' : '#ff0000',
                lineWidth: 1,
                lineStyle: LightweightCharts.LineStyle.Dashed,
                priceLineVisible: false,
                lastValueVisible: false,
        });
        // Линия на весь видимый диапазон
            const startTime = data[0].time;
            const endTime = data[data.length - 1].time;
            lineSeries.setData([
                { time: startTime, value: zone.price },
                { time: endTime, value: zone.price }
        ]);
            this.liquidityZoneSeries.push(lineSeries);
    });
}

    // ========== Отрисовка тепловой карты плотностей ==========
    drawDensityHeatmap(heatmap) {
        console.log('🎨 drawDensityHeatmap вызван с данными:', heatmap);

    // Удаляем старые серии
        if (this.densitySeries) {
            this.densitySeries.forEach(series => this.chart.removeSeries(series));
    }
        this.densitySeries = [];

        const data = this.state.chartData;
        if (!data || data.length === 0) {
            console.warn('Нет данных графика');
            return;
    }

        const startTime = data[0].time;
        const endTime = data[data.length - 1].time;

    // Сортируем по объёму и берём топ‑10
        const top = [...heatmap].sort((a, b) => b.total_volume - a.total_volume).slice(0, 10);
        top.forEach(zone => {
        // Определяем толщину линии в зависимости от объёма
            let width = 1;
            if (zone.total_volume > 500000) width = 2;
            if (zone.total_volume > 1000000) width = 3;
            if (zone.total_volume > 2000000) width = 4;
            if (zone.total_volume > 5000000) width = 5;

            const lineSeries = this.chart.addLineSeries({
                color: '#ffaa00',
                lineWidth: width,
                priceLineVisible: false,
                lastValueVisible: false,
        });
            lineSeries.setData([
                { time: startTime, value: zone.price },
                { time: endTime, value: zone.price }
        ]);
            this.densitySeries.push(lineSeries);
            console.log(`Добавлена линия плотности: цена=${zone.price}, ширина=${width}, кол-во=${this.densitySeries.length}`);
    });
}
    drawSMCPatterns(patterns) {
        console.log('🎨 drawSMCPatterns called with', patterns);
        const markers = [];
    
    // FVG
        if (patterns.fvg && patterns.fvg.length) {
            patterns.fvg.forEach(fvg => {
                markers.push({
                    time: fvg.timestamp / 1000,
                    position: fvg.type === 'FVG_BULL' ? 'belowBar' : 'aboveBar',
                    color: fvg.type === 'FVG_BULL' ? '#00ff00' : '#ff0000',
                    shape: 'square',
                    text: 'FVG',
            });
        });
    }
    
    // Order Blocks (если есть)
        if (patterns.order_blocks && patterns.order_blocks.length) {
            patterns.order_blocks.forEach(ob => {
                markers.push({
                    time: ob.timestamp / 1000,
                    position: ob.type === 'OB_BULL' ? 'belowBar' : 'aboveBar',
                    color: ob.type === 'OB_BULL' ? '#00ff00' : '#ff0000',
                    shape: 'circle',
                    text: 'OB',
            });
        });
    }
    
    // Liquidity Sweeps
        if (patterns.liquidity_sweeps && patterns.liquidity_sweeps.length) {
            patterns.liquidity_sweeps.forEach(sweep => {
                markers.push({
                    time: sweep.timestamp / 1000,
                    position: sweep.signal === 'bullish_rejection' ? 'belowBar' : 'aboveBar',
                    color: sweep.signal === 'bullish_rejection' ? '#00ff00' : '#ff0000',
                    shape: 'arrowUp',
                    text: 'Sweep',
            });
        });
    }
       
    
               // Проверяем, что маркеры не пусты
        console.log('Добавляем маркеры:', markers);
    
                 // Устанавливаем маркеры на основную серию
        this.mainSeries.setMarkers(markers);
    
              // Проверяем, что маркеры установились
        console.log('Маркеры после установки:', this.mainSeries.markers());
}
    recalculateAllIndicators() {
        this.indicatorMap.forEach(ind => {
            const fullData = ind.computeFull(this.state.chartData);
            this._setIndicatorData(ind, fullData);
        });
    }

    createMainSeries(type) {
        if (this.mainSeries) this.chart.removeSeries(this.mainSeries);
        const options = { priceFormat: { type: 'price', minMove: 0.00000001, precision: 8 } };
        switch(type) {
            case 'bar':
                return this.chart.addBarSeries({ upColor: CONFIG.colors.bullish, downColor: CONFIG.colors.bearish, ...options });
            case 'line':
                return this.chart.addLineSeries({ color: CONFIG.colors.gold, lineWidth: 2, ...options });
            case 'area':
                return this.chart.addAreaSeries({ topColor: CONFIG.colors.bullish + '40', bottomColor: 'transparent', lineColor: CONFIG.colors.gold, lineWidth: 2, ...options });
            default:
                return this.chart.addCandlestickSeries({ upColor: CONFIG.colors.bullish, downColor: CONFIG.colors.bearish, borderVisible: false, wickUpColor: CONFIG.colors.bullish, wickDownColor: CONFIG.colors.bearish, ...options });
        }
    }

    setData(data) {
        console.log('📊 setData вызван, userChangedTimeScale =', this.userChangedTimeScale);
        this.state.chartData = data;
        this.mainSeries.setData(data);
        this.pendingWorkerRequests.clear();
        this.redrawOverlay();
        this.currentWorkerRequestId = null;

    // Принудительно сбрасываем масштаб, если пользователь не менял его вручную
        if (!this.userChangedTimeScale) {
            this.chart.timeScale().fitContent();
            this.userChangedTimeScale = false;
    }     else {
            console.log('⏭️ fitContent НЕ вызван (пользователь менял масштаб)');
    }

        this.indicatorMap.forEach(ind => {
            const fullData = ind.computeFull(data);
            this._setIndicatorData(ind, fullData);
    });
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
                    return { time, value: item.value, color: item.color };
                })
                .filter(item => item !== null);
        };
        if (Array.isArray(fullData[0])) {
            fullData.forEach((seriesData, idx) => {
                if (indicator.series[idx]) {
                    const prepared = prepareData(seriesData);
                    if (prepared.length) {
                        indicator.series[idx].setData(prepared);
                    }
                }
            });
        } else {
            const prepared = prepareData(fullData);
            if (prepared.length) {
                indicator.series[0].setData(prepared);
            }
        }
    }

    addIndicator(type, params = {}) {
        if (this.indicatorMap.has(type)) {
            Utils.showAlert('Индикатор уже добавлен', this.alertContainer, this.state.soundEnabled);
            return null;
        }
        const config = CONFIG.indicators.find(i => i.type === type);
        if (!config) return null;
        
        const mergedParams = { ...config.defaultParams, ...params, color: config.color, scale: config.scale };
        if (config.colors) {
            mergedParams.colors = config.colors;
        }
        
        const minDataRequired = this.getMinDataRequired(type);
        if (this.state.chartData.length < minDataRequired) {
            Utils.showAlert(`Недостаточно данных для ${type} (нужно минимум ${minDataRequired} свечей)`, this.alertContainer, this.state.soundEnabled);
            return null;
        }
        let indicator;
        switch(type) {
            case 'sma20':
            case 'sma50':
                indicator = new SMAIndicator(mergedParams, this);
                break;
            case 'ema20':
                indicator = new EMAIndicator(mergedParams, this);
                break;
            case 'rsi14':
                indicator = new RSIIndicator(mergedParams, this);
                break;
            case 'macd':
                indicator = new MACDIndicator(mergedParams, this);
                break;
            case 'stochrsi':
                indicator = new StochRSIIndicator(mergedParams, this);
                break;
            case 'atr':
                indicator = new ATRIndicator(mergedParams, this);
                break;
            case 'adx':
                indicator = new ADXIndicator(mergedParams, this);
                break;
            case 'volume':
                indicator = new VolumeIndicator(mergedParams, this);
                break;
            case 'madridRibbon':
                indicator = new MadridRibbonIndicator(mergedParams, this);
                break;
            case 'madridBar':
                indicator = new MadridBarIndicator(mergedParams, this);
                break;
            default:
                console.warn('Unknown indicator type', type);
                return null;
        }
        indicator.createSeries(this.chart);
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
        } else {
            const fullData = indicator.computeFull(this.state.chartData);
            this._setIndicatorData(indicator, fullData);
            this.indicatorMap.set(type, indicator);
        }
        return indicator;
    }

    isHeavyIndicator(type) {
        return ['madridRibbon', 'madridBar', 'macd', 'stochrsi', 'adx'].includes(type);
    }

    onWorkerMessage(e) {
        const { type, result, requestId, error, symbol, interval } = e.data;
        if (symbol !== this.state.currentSymbol || interval !== this.state.currentInterval) {
            console.log('Worker response ignored – symbol/interval changed');
            return;
        }
        const indicator = this.pendingWorkerRequests.get(requestId);
        if (!indicator) return;
        this.pendingWorkerRequests.delete(requestId);
        if (error) {
            console.error(`Worker error for ${type}:`, error);
            Utils.showAlert(`Ошибка расчёта индикатора ${type}`, this.alertContainer, this.state.soundEnabled);
            return;
        }
        this._setIndicatorData(indicator, result);
        this.indicatorMap.set(type, indicator);
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

    updateLastCandle(candle) {
        if (!candle) return;
        if (typeof candle.time !== 'number' || isNaN(candle.time)) {
            console.warn('updateLastCandle: invalid time', candle.time);
            return;
        }
        this.mainSeries.update(candle);
        this.indicatorMap.forEach(ind => ind.updateLast(candle, this.state.chartData));
        this.redrawOverlay(); 
    }

    clearAllIndicators() {
        this.indicatorMap.forEach(ind => ind.remove());
        this.indicatorMap.clear();
    }

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
   
    // chart/chartManager.js – метод showDensityZone
// Добавьте этот метод в класс ChartManager (например, после метода clearDensityZones)

showDensityZone(density) {
    console.log('🎨 showDensityZone вызван:', density);
    const data = this.state.chartData;
    if (!data || data.length < 2) {
        console.warn('showDensityZone: нет данных графика');
        return;
    }

    const startTime = data[0].time;
    const endTime = data[data.length - 1].time;

    let priceStart = density.priceStart;
    let priceEnd = density.priceEnd;

    // Если границы совпадают или разница меньше 0.1%, расширяем зону
    const diff = Math.abs(priceStart - priceEnd);
    if (diff < 0.0001) {
        const margin = Math.max(priceStart * 0.001, 0.001); // 0.1% от цены, но не менее 0.001
        priceStart = priceStart - margin;
        priceEnd = priceEnd + margin;
        console.log(`Расширяем зону: ${priceStart.toFixed(6)} – ${priceEnd.toFixed(6)}`);
    }

    const direction = density.direction; // 'buy' или 'sell'
    const baseColor = direction === 'buy' ? '#0ecb81' : '#f6465d';
    const topColor = direction === 'buy' ? 'rgba(14, 203, 129, 0.25)' : 'rgba(246, 70, 93, 0.25)';

    const series = this.chart.addAreaSeries({
        topColor: topColor,
        bottomColor: 'transparent',
        lineColor: baseColor,
        lineWidth: 1,
        priceScaleId: 'right',
        lastValueVisible: false,
        priceLineVisible: false,
    });

    // Данные для прямоугольной зоны (замкнутый контур)
    const zoneData = [
        { time: startTime, value: priceStart },
        { time: startTime, value: priceEnd },
        { time: endTime, value: priceEnd },
        { time: endTime, value: priceStart },
        { time: startTime, value: priceStart }, // замыкаем
    ];
    series.setData(zoneData);

    // Сохраняем серию для последующего удаления
    if (!this.densityZoneSeries) this.densityZoneSeries = [];
    this.densityZoneSeries.push(series);

    // Добавляем подпись с размером плотности
    const labelPrice = (priceStart + priceEnd) / 2;
    series.createPriceLine({
        price: labelPrice,
        title: `💰 ${Utils.formatQuoteVolume(density.size)}`,
        color: baseColor,
        lineWidth: 1,
        lineStyle: LightweightCharts.LineStyle.Dotted,
        axisLabelVisible: true,
    });

    return series;
}


    clearDensityZones() {
        if (this.densitySeries) {
            this.densitySeries.forEach(item => {
                try { this.chart.removeSeries(item.series); } catch (e) {}
        });
            this.densitySeries = [];
    }
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

    applyGlobalIndicators() {
        if (this.state.chartData.length === 0) {
            console.warn('applyGlobalIndicators: нет данных графика, пропускаем');
            return;
        }
        this.clearAllIndicators();
        const indicators = this.state.activeIndicators;
        indicators.forEach(item => {
            this.addIndicator(item.type, item.params);
        });
    }

    destroy() {
        if (this.worker) {
            this.worker.terminate();
            this.worker = null;
        }
    }
}