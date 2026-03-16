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
        this.currentWorkerRequestId = null;
        if (!this.userChangedTimeScale) {
            console.log('🔍 fitContent из setData (пользователь не менял масштаб)');
            this.chart.timeScale().fitContent();
        } else {
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