// indicators/EMARainbowIndicator.js
import { BaseIndicator } from './BaseIndicator.js';
import { CONFIG } from '../config.js';

const LightweightCharts = window.LightweightCharts;

/**
 * Индикатор EMA Rainbow с RSI, ADX, ATR & SAR
 * Аналог Pine Script v6 индикатора
 */
export class EMARainbowIndicator extends BaseIndicator {
    constructor(params = {}, chartManager) {
        super('emaRainbow', params, chartManager);
        
        // Параметры EMA
        this.ema1Period = params.ema1Period || 6;
        this.ema2Period = params.ema2Period || 21;
        this.ema3Period = params.ema3Period || 34;
        
        // Параметры RSI
        this.rsiLength = params.rsiLength || 14;
        this.rsiOverbought = params.rsiOverbought || 70;
        this.rsiOversold = params.rsiOversold || 30;
        this.showRSI = params.showRSI !== false;
        
        // Параметры ADX
        this.adxLength = params.adxLength || 14;
        this.adxSmoothing = params.adxSmoothing || 14;
        this.adxThreshold = params.adxThreshold || 25;
        this.showADX = params.showADX !== false;
        this.showDI = params.showDI || false;
        
        // Параметры ATR
        this.atrLength = params.atrLength || 14;
        this.showATR = params.showATR !== false;
        
        // Параметры SAR
        this.sarStart = params.sarStart || 0.02;
        this.sarIncrement = params.sarIncrement || 0.02;
        this.sarMaximum = params.sarMaximum || 0.2;
        this.showSAR = params.showSAR !== false;
        
        // Цвета
        this.colors = {
            ema1: params.ema1Color || '#FF0000',
            ema2: params.ema2Color || '#00FF00',
            ema3: params.ema3Color || '#0000FF',
            rsi: params.rsiColor || '#FFA500',
            adx: params.adxColor || '#FF69B4',
            atr: params.atrColor || '#FFA500',
            sarUp: '#0ecb81',
            sarDown: '#f6465d'
        };
        
        this.series = [];
        this.infoTable = null;
        this.infoTableRows = 0;
        
        // Сохраняем предыдущие значения для SAR
        this.prevSar = null;
        this.sarTrend = null;
    }
    
    createSeries(chart) {
        this.chart = chart;
        
        // EMA линии (на основной шкале)
        this.ema1Series = chart.addLineSeries({
            color: this.colors.ema1,
            lineWidth: 2,
            priceScaleId: 'right',
            title: `EMA ${this.ema1Period}`,
            lastValueVisible: true
        });
        
        this.ema2Series = chart.addLineSeries({
            color: this.colors.ema2,
            lineWidth: 2,
            priceScaleId: 'right',
            title: `EMA ${this.ema2Period}`,
            lastValueVisible: true
        });
        
        this.ema3Series = chart.addLineSeries({
            color: this.colors.ema3,
            lineWidth: 2,
            priceScaleId: 'right',
            title: `EMA ${this.ema3Period}`,
            lastValueVisible: true
        });
        
        this.series.push(this.ema1Series, this.ema2Series, this.ema3Series);
        
        // SAR точки (на основной шкале)
        if (this.showSAR) {
            this.sarSeries = chart.addLineSeries({
                color: this.colors.sarUp,
                lineWidth: 2,
                priceScaleId: 'right',
                pointMarkersVisible: true,
                lastValueVisible: true
            });
            this.series.push(this.sarSeries);
        }
        
        // Создаём таблицу для отображения данных
        this.createInfoTable();
    }
    
    createInfoTable() {
        // Удаляем старую таблицу, если есть
        if (this.infoTable && this.chart) {
            try {
                this.chart.removeSeries(this.infoTable);
            } catch(e) {}
        }
        
        // Создаём простую текстовую серию для отображения информации
        // В Lightweight Charts нет встроенной таблицы, используем маркеры или текстовые метки
        this.infoSeries = this.chart.addSeries(LightweightCharts.LineSeries, {
            color: 'transparent',
            lineWidth: 0,
            lastValueVisible: false,
            priceLineVisible: false
        });
        this.series.push(this.infoSeries);
        
        // Сохраняем текущие значения для обновления
        this.lastValues = {
            ema1: null,
            ema2: null,
            ema3: null,
            rsi: null,
            adx: null,
            plusDI: null,
            minusDI: null,
            atr: null,
            sar: null
        };
    }
    
    computeFull(data) {
        if (!data || data.length < Math.max(this.ema3Period, this.adxLength, this.atrLength, 100)) {
            console.warn('EMARainbowIndicator: недостаточно данных');
            return [];
        }
        
        const closes = data.map(d => d.close);
        const highs = data.map(d => d.high);
        const lows = data.map(d => d.low);
        
        // Рассчитываем EMA
        const ema1 = this.calculateEMA(closes, this.ema1Period);
        const ema2 = this.calculateEMA(closes, this.ema2Period);
        const ema3 = this.calculateEMA(closes, this.ema3Period);
        
        // Рассчитываем RSI
        const rsi = this.calculateRSI(closes, this.rsiLength);
        
        // Рассчитываем ADX и DI
        const { plusDI, minusDI, adx } = this.calculateADX(highs, lows, closes, this.adxLength, this.adxSmoothing);
        
        // Рассчитываем ATR
        const atr = this.calculateATR(highs, lows, closes, this.atrLength);
        
        // Рассчитываем SAR
        const sar = this.calculateSAR(highs, lows, this.sarStart, this.sarIncrement, this.sarMaximum);
        
        // Формируем данные для отображения
        const result = {
            ema1Data: [],
            ema2Data: [],
            ema3Data: [],
            sarData: [],
            info: {
                times: [],
                ema1: [],
                ema2: [],
                ema3: [],
                rsi: [],
                adx: [],
                plusDI: [],
                minusDI: [],
                atr: [],
                sar: []
            }
        };
        
        for (let i = 0; i < data.length; i++) {
            const time = data[i].time;
            const close = closes[i];
            
            // EMA данные
            if (ema1[i] !== null) {
                result.ema1Data.push({ time, value: ema1[i] });
                result.info.ema1.push(ema1[i]);
            }
            if (ema2[i] !== null) {
                result.ema2Data.push({ time, value: ema2[i] });
                result.info.ema2.push(ema2[i]);
            }
            if (ema3[i] !== null) {
                result.ema3Data.push({ time, value: ema3[i] });
                result.info.ema3.push(ema3[i]);
            }
            
            // SAR данные
            if (sar[i] !== null && this.showSAR) {
                result.sarData.push({ time, value: sar[i] });
                result.info.sar.push(sar[i]);
            }
            
            // Сохраняем все значения для таблицы
            result.info.times.push(time);
            result.info.rsi.push(rsi[i]);
            result.info.adx.push(adx[i]);
            result.info.plusDI.push(plusDI[i]);
            result.info.minusDI.push(minusDI[i]);
            result.info.atr.push(atr[i]);
        }
        
        return result;
    }
    
    updateLast(candle, allData) {
        if (!allData || allData.length === 0) return;
        
        const closes = allData.map(d => d.close);
        const highs = allData.map(d => d.high);
        const lows = allData.map(d => d.low);
        const lastIndex = allData.length - 1;
        
        // Обновляем EMA
        const ema1 = this.calculateEMALast(closes, this.ema1Period);
        const ema2 = this.calculateEMALast(closes, this.ema2Period);
        const ema3 = this.calculateEMALast(closes, this.ema3Period);
        
        // Обновляем RSI
        const rsi = this.calculateRSILast(closes, this.rsiLength);
        
        // Обновляем ADX
        const { plusDI, minusDI, adx } = this.calculateADXLast(highs, lows, closes, this.adxLength, this.adxSmoothing);
        
        // Обновляем ATR
        const atr = this.calculateATRLast(highs, lows, closes, this.atrLength);
        
        // Обновляем SAR
        const sar = this.calculateSARLast(highs, lows, this.sarStart, this.sarIncrement, this.sarMaximum);
        
        // Обновляем серии
        if (ema1 !== null) this.ema1Series.update({ time: candle.time, value: ema1 });
        if (ema2 !== null) this.ema2Series.update({ time: candle.time, value: ema2 });
        if (ema3 !== null) this.ema3Series.update({ time: candle.time, value: ema3 });
        
        if (this.showSAR && sar !== null) {
            const sarColor = sar < candle.close ? this.colors.sarUp : this.colors.sarDown;
            this.sarSeries.applyOptions({ color: sarColor });
            this.sarSeries.update({ time: candle.time, value: sar });
        }
        
        // Обновляем таблицу информации
        this.updateInfoTable(candle.time, {
            ema1, ema2, ema3,
            rsi, adx, plusDI, minusDI,
            atr, sar,
            close: candle.close
        });
    }
    
    updateInfoTable(time, values) {
        if (!this.infoSeries) return;
        
        // Формируем информационную строку
        let infoText = '';
        
        // EMA значения
        infoText += `EMA${this.ema1Period}: ${values.ema1?.toFixed(2) || '—'} | `;
        infoText += `EMA${this.ema2Period}: ${values.ema2?.toFixed(2) || '—'} | `;
        infoText += `EMA${this.ema3Period}: ${values.ema3?.toFixed(2) || '—'}\n`;
        
        // RSI
        if (this.showRSI && values.rsi !== null) {
            let rsiColor = '';
            if (values.rsi > this.rsiOverbought) rsiColor = '🔴';
            else if (values.rsi < this.rsiOversold) rsiColor = '🟢';
            else rsiColor = '🔵';
            infoText += `RSI(${this.rsiLength}): ${rsiColor} ${values.rsi.toFixed(2)}\n`;
        }
        
        // ADX
        if (this.showADX && values.adx !== null && values.plusDI !== null && values.minusDI !== null) {
            const direction = values.plusDI > values.minusDI ? '↑' : '↓';
            const strength = values.adx > this.adxThreshold ? 'Сильный' : 'Слабый';
            const trend = values.plusDI > values.minusDI ? 'Бычий' : 'Медвежий';
            infoText += `ADX(${this.adxLength}): ${values.adx.toFixed(2)} ${direction} | ${strength} ${trend}\n`;
            
            if (this.showDI) {
                infoText += `+DI: ${values.plusDI.toFixed(2)} | -DI: ${values.minusDI.toFixed(2)}\n`;
            }
        }
        
        // ATR
        if (this.showATR && values.atr !== null) {
            infoText += `ATR(${this.atrLength}): ${values.atr.toFixed(6)}\n`;
        }
        
        // SAR
        if (this.showSAR && values.sar !== null && values.close !== null) {
            const sarDirection = values.sar < values.close ? '↗ Бычий' : '↘ Медвежий';
            const sarColor = values.sar < values.close ? '🟢' : '🔴';
            infoText += `SAR: ${sarColor} ${values.sar.toFixed(6)} ${sarDirection}`;
        }
        
        // Обновляем информационную серию (используем последнюю точку для отображения)
        this.infoSeries.setData([{ time, value: 0 }]);
        
        // Добавляем ценовую линию с текстом
        const priceScale = this.chart.priceScale('right');
        const topY = 50; // Верхняя позиция для текста
        
        // Сохраняем текст для отрисовки (будет отображаться через маркеры)
        // В Lightweight Charts можно использовать priceLine для текста
        if (this.infoPriceLine) {
            this.infoSeries.removePriceLine(this.infoPriceLine);
        }
        
        this.infoPriceLine = this.infoSeries.createPriceLine({
            price: values.close || 0,
            color: 'rgba(255,215,0,0.3)',
            lineWidth: 0,
            title: infoText,
            axisLabelVisible: true,
            axisLabelColor: '#ffd700'
        });
    }
    
    // ========== Вспомогательные методы расчёта ==========
    
    calculateEMA(data, period) {
        if (data.length < period) return new Array(data.length).fill(null);
        const k = 2 / (period + 1);
        const ema = new Array(data.length).fill(null);
        let sum = 0;
        for (let i = 0; i < period; i++) sum += data[i];
        ema[period - 1] = sum / period;
        for (let i = period; i < data.length; i++) {
            ema[i] = data[i] * k + ema[i - 1] * (1 - k);
        }
        return ema;
    }
    
    calculateEMALast(data, period) {
        if (data.length < period) return null;
        const k = 2 / (period + 1);
        let ema = data[period - 1];
        for (let i = period; i < data.length; i++) {
            ema = data[i] * k + ema * (1 - k);
        }
        return ema;
    }
    
    calculateRSI(data, period = 14) {
        if (data.length < period + 1) return new Array(data.length).fill(null);
        const gains = [], losses = [];
        for (let i = 1; i < data.length; i++) {
            const diff = data[i] - data[i - 1];
            gains.push(diff > 0 ? diff : 0);
            losses.push(diff < 0 ? -diff : 0);
        }
        
        let avgG = 0, avgL = 0;
        for (let i = 0; i < period; i++) {
            avgG += gains[i];
            avgL += losses[i];
        }
        avgG /= period;
        avgL /= period;
        
        const rsi = new Array(data.length).fill(null);
        let rs = avgL === 0 ? 100 : avgG / avgL;
        rsi[period] = 100 - 100 / (1 + rs);
        
        for (let i = period; i < gains.length; i++) {
            avgG = (avgG * (period - 1) + gains[i]) / period;
            avgL = (avgL * (period - 1) + losses[i]) / period;
            rs = avgL === 0 ? 100 : avgG / avgL;
            rsi[i + 1] = 100 - 100 / (1 + rs);
        }
        
        return rsi;
    }
    
    calculateRSILast(data, period = 14) {
        if (data.length < period + 1) return null;
        
        // Полный пересчёт для последнего значения
        const rsiArray = this.calculateRSI(data, period);
        return rsiArray[rsiArray.length - 1];
    }
    
    calculateADX(highs, lows, closes, period = 14, smoothing = 14) {
        const plusDI = new Array(highs.length).fill(null);
        const minusDI = new Array(highs.length).fill(null);
        const adx = new Array(highs.length).fill(null);
        
        if (highs.length < period + 1) return { plusDI, minusDI, adx };
        
        const tr = [];
        const plusDM = [];
        const minusDM = [];
        
        for (let i = 1; i < highs.length; i++) {
            const high = highs[i], low = lows[i];
            const prevHigh = highs[i - 1], prevLow = lows[i - 1], prevClose = closes[i - 1];
            tr.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));
            
            const upMove = high - prevHigh;
            const downMove = prevLow - low;
            plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
            minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
        }
        
        const atr = [];
        const plusSmooth = [];
        const minusSmooth = [];
        
        let sumTR = 0, sumPlus = 0, sumMinus = 0;
        for (let i = 0; i < period; i++) {
            sumTR += tr[i];
            sumPlus += plusDM[i];
            sumMinus += minusDM[i];
        }
        atr.push(sumTR / period);
        plusSmooth.push(sumPlus / period);
        minusSmooth.push(sumMinus / period);
        
        for (let i = period; i < tr.length; i++) {
            atr.push((atr[atr.length - 1] * (period - 1) + tr[i]) / period);
            plusSmooth.push((plusSmooth[plusSmooth.length - 1] * (period - 1) + plusDM[i]) / period);
            minusSmooth.push((minusSmooth[minusSmooth.length - 1] * (period - 1) + minusDM[i]) / period);
        }
        
        const dx = [];
        for (let i = 0; i < plusSmooth.length; i++) {
            const pdi = (plusSmooth[i] / atr[i]) * 100;
            const mdi = (minusSmooth[i] / atr[i]) * 100;
            const sum = pdi + mdi;
            if (sum === 0) dx.push(0);
            else dx.push(Math.abs(pdi - mdi) / sum * 100);
            
            // Сохраняем DI
            const idx = i + period;
            plusDI[idx] = pdi;
            minusDI[idx] = mdi;
        }
        
        // Сглаживаем ADX
        let sumDX = 0;
        for (let i = 0; i < smoothing && i < dx.length; i++) {
            sumDX += dx[i];
        }
        if (dx.length > 0) {
            adx[period + smoothing - 1] = sumDX / Math.min(smoothing, dx.length);
        }
        
        for (let i = smoothing; i < dx.length; i++) {
            const prevADX = adx[period + i - 1];
            adx[period + i] = (prevADX * (smoothing - 1) + dx[i]) / smoothing;
        }
        
        return { plusDI, minusDI, adx };
    }
    
    calculateADXLast(highs, lows, closes, period = 14, smoothing = 14) {
        // Полный пересчёт для последнего значения
        const result = this.calculateADX(highs, lows, closes, period, smoothing);
        const lastIdx = result.adx.length - 1;
        return {
            plusDI: result.plusDI[lastIdx],
            minusDI: result.minusDI[lastIdx],
            adx: result.adx[lastIdx]
        };
    }
    
    calculateATR(highs, lows, closes, period = 14) {
        const atr = new Array(highs.length).fill(null);
        if (highs.length < period + 1) return atr;
        
        const tr = [];
        for (let i = 1; i < highs.length; i++) {
            tr.push(Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1])));
        }
        
        let sum = 0;
        for (let i = 0; i < period; i++) sum += tr[i];
        atr[period] = sum / period;
        
        for (let i = period; i < tr.length; i++) {
            atr[i + 1] = (atr[i] * (period - 1) + tr[i]) / period;
        }
        
        return atr;
    }
    
    calculateATRLast(highs, lows, closes, period = 14) {
        const atr = this.calculateATR(highs, lows, closes, period);
        return atr[atr.length - 1];
    }
    
    calculateSAR(highs, lows, start = 0.02, increment = 0.02, maximum = 0.2) {
        const sar = new Array(highs.length).fill(null);
        if (highs.length < 2) return sar;
        
        let trend = 1; // 1 = uptrend, -1 = downtrend
        let acceleration = start;
        let extremePoint = highs[0];
        let sarValue = lows[0];
        
        for (let i = 1; i < highs.length; i++) {
            const high = highs[i];
            const low = lows[i];
            
            if (trend === 1) {
                sarValue = sarValue + acceleration * (extremePoint - sarValue);
                
                if (high > extremePoint) {
                    extremePoint = high;
                    acceleration = Math.min(acceleration + increment, maximum);
                }
                
                if (low < sarValue) {
                    trend = -1;
                    sarValue = extremePoint;
                    extremePoint = low;
                    acceleration = start;
                } else if (i > 1 && low < sar[i - 1]) {
                    sarValue = sar[i - 1];
                }
            } else {
                sarValue = sarValue + acceleration * (extremePoint - sarValue);
                
                if (low < extremePoint) {
                    extremePoint = low;
                    acceleration = Math.min(acceleration + increment, maximum);
                }
                
                if (high > sarValue) {
                    trend = 1;
                    sarValue = extremePoint;
                    extremePoint = high;
                    acceleration = start;
                } else if (i > 1 && high > sar[i - 1]) {
                    sarValue = sar[i - 1];
                }
            }
            
            sar[i] = sarValue;
        }
        
        return sar;
    }
    
    calculateSARLast(highs, lows, start = 0.02, increment = 0.02, maximum = 0.2) {
        const sar = this.calculateSAR(highs, lows, start, increment, maximum);
        return sar[sar.length - 1];
    }
    
    remove() {
        this.series.forEach(s => {
            try { this.chart.removeSeries(s); } catch (e) {}
        });
        this.series = [];
    }
}