// indicators/StochRSIIndicator.js
import { BaseIndicator } from './BaseIndicator.js';
import { Utils } from '../utils.js';
const LightweightCharts = window.LightweightCharts;

export class StochRSIIndicator extends BaseIndicator {
    constructor(params, chartManager) {
        super('stochrsi', params, chartManager);
        this.rsiPeriod = params.period || 14;
        this.kPeriod = params.k || 3;
        this.dPeriod = params.d || 3;
        this.kColor = params.kColor || '#FFD700';
        this.dColor = params.dColor || '#FF69B4';
        this.lineWidth = params.lineWidth || 2;
        this.scale = params.scale || 'stoch';
        this.overboughtLevel = params.overboughtLevel ?? 80;
        this.oversoldLevel = params.oversoldLevel ?? 20;
        this.levelColor = params.levelColor || '#888888';
        
        this.overboughtLine = null;
        this.oversoldLine = null;
    }

    createSeries(chart, paneIndex = 0) {
        this.kSeries = chart.addSeries(LightweightCharts.LineSeries, {
            color: this.kColor,
            lineWidth: this.lineWidth,
            priceScaleId: this.scale,
            lastValueVisible: false,
            priceLineVisible: false,
        }, paneIndex);
        this.dSeries = chart.addSeries(LightweightCharts.LineSeries, {
            color: this.dColor,
            lineWidth: this.lineWidth,
            priceScaleId: this.scale,
            lastValueVisible: false,
            priceLineVisible: false,
        }, paneIndex);
        this.series = [this.kSeries, this.dSeries];
        
        // Добавляем уровни к основной серии %K (или к любой, но достаточно одной)
        this.overboughtLine = this.kSeries.createPriceLine({
            price: this.overboughtLevel,
            color: this.levelColor,
            lineWidth: 1,
            lineStyle: LightweightCharts.LineStyle.Dotted,
            axisLabelVisible: true,
            title: 'OB 80'
        });
        this.oversoldLine = this.kSeries.createPriceLine({
            price: this.oversoldLevel,
            color: this.levelColor,
            lineWidth: 1,
            lineStyle: LightweightCharts.LineStyle.Dotted,
            axisLabelVisible: true,
            title: 'OS 20'
        });
    }

    computeFull(data) {
        const closes = data.map(d => d.close);
        const times = data.map(d => d.time);
        const stoch = Utils.calculateStochRSI(closes, this.rsiPeriod, this.kPeriod, this.dPeriod);
        const offsetK = closes.length - stoch.k.length;
        const kData = stoch.k.map((v, i) => ({ time: times[offsetK + i], value: v }));
        const offsetD = closes.length - stoch.d.length;
        const dData = stoch.d.map((v, i) => ({ time: times[offsetD + i], value: v }));
        this.kSeries.setData(kData);
        this.dSeries.setData(dData);
        return [kData, dData];
    }

    updateLast(candle, allData, isNewCandle) {
        if (!isNewCandle) return;
        const needed = Math.min(allData.length, this.rsiPeriod + this.kPeriod + this.dPeriod + 10);
        const recent = allData.slice(-needed);
        const closes = recent.map(d => d.close);
        const stoch = Utils.calculateStochRSI(closes, this.rsiPeriod, this.kPeriod, this.dPeriod);
        if (stoch.k.length) {
            const lastK = stoch.k[stoch.k.length-1];
            const lastD = stoch.d[stoch.d.length-1];
            if (!isNaN(lastK) && this.kSeries) this.kSeries.update({ time: candle.time, value: lastK });
            if (!isNaN(lastD) && this.dSeries) this.dSeries.update({ time: candle.time, value: lastD });
        }
    }

    remove() {
        if (this.visibleRangeHandler && this.chartManager?.chart) {
            this.chartManager.chart.timeScale().unsubscribeVisibleTimeRangeChange(this.visibleRangeHandler);
        }
        super.remove();
    }
}