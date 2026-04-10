// indicators/ATRIndicator.js
import { BaseIndicator } from './BaseIndicator.js';
import { Utils } from '../utils.js';
const LightweightCharts = window.LightweightCharts;

export class ATRIndicator extends BaseIndicator {
    constructor(params, chartManager) {
        super('atr', params, chartManager);
        this.period = params.period || 14;
        this.color = params.color || '#FFA500';
        this.lineWidth = params.lineWidth || 2;
        this.scale = params.scale || 'atr';
        this.highLevel = params.highLevel ?? null;
        this.lowLevel = params.lowLevel ?? null;
        this.highLevelColor = params.highLevelColor || '#2f00ff';
        this.lowLevelColor = params.lowLevelColor || '#2b00ff';
        
        this.trWindow = [];
        this.prevATR = null;
        this.prevClose = null;
        this.highLevelLine = null;
        this.lowLevelLine = null;
    }

    createSeries(chart, paneIndex = 0) {
        this.series = [chart.addSeries(LightweightCharts.LineSeries, {
            color: this.color,
            lineWidth: this.lineWidth,
            priceScaleId: this.scale,
            lastValueVisible: false,
            priceLineVisible: false,
        }, paneIndex)];
        
        // Добавляем уровни как ценовые линии
        if (this.highLevel !== null && this.highLevel !== undefined) {
            this.highLevelLine = this.series[0].createPriceLine({
                price: this.highLevel,
                color: this.highLevelColor,
                lineWidth: 1,
                lineStyle: LightweightCharts.LineStyle.Dotted,
                axisLabelVisible: true,
                title: `High ${this.highLevel}`
            });
        }
        if (this.lowLevel !== null && this.lowLevel !== undefined) {
            this.lowLevelLine = this.series[0].createPriceLine({
                price: this.lowLevel,
                color: this.lowLevelColor,
                lineWidth: 1,
                lineStyle: LightweightCharts.LineStyle.Dotted,
                axisLabelVisible: true,
                title: `Low ${this.lowLevel}`
            });
        }
    }
    computeFull(data) {
        const highs = data.map(d => d.high);
        const lows = data.map(d => d.low);
        const closes = data.map(d => d.close);
        const times = data.map(d => d.time);
        const atr = Utils.calculateATR(highs, lows, closes, this.period);
        const offset = data.length - atr.length;
        const atrData = atr.map((v, i) => ({ time: times[offset + i], value: v }));
        this.series[0].setData(atrData);
        
        if (atr.length) this.prevATR = atr[atr.length-1];
        if (data.length > 1) this.prevClose = closes[closes.length-2];
        return atrData;
    }

    updateLast(candle, allData, isNewCandle) {
        if (!isNewCandle) return;
        const high = candle.high;
        const low = candle.low;
        const close = candle.close;
        const prevClose = this.prevClose !== null ? this.prevClose : allData[allData.length-2]?.close;
        if (prevClose === undefined) return;
        
        const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
        this.trWindow.push(tr);
        if (this.trWindow.length > this.period) this.trWindow.shift();
        
        let atr;
        if (this.trWindow.length === this.period) {
            if (this.prevATR === null) {
                const sum = this.trWindow.reduce((a,b)=>a+b,0);
                atr = sum / this.period;
            } else {
                atr = (this.prevATR * (this.period - 1) + tr) / this.period;
            }
            this.prevATR = atr;
            if (!isNaN(atr) && this.series[0]) {
                this.series[0].update({ time: candle.time, value: atr });
            }
        }
        this.prevClose = close;
    }

    remove() {
        if (this.visibleRangeHandler && this.chartManager?.chart) {
            this.chartManager.chart.timeScale().unsubscribeVisibleTimeRangeChange(this.visibleRangeHandler);
        }
        super.remove();
    }
}