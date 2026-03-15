// indicators/SMAIndicator.js
import { BaseIndicator } from './BaseIndicator.js';
import { Utils } from '../utils.js';

export class SMAIndicator extends BaseIndicator {
    constructor(params, chartManager) {
        super('sma', params, chartManager);
        this.period = params.period || 20;
        this.color = params.color || '#FFD700';
        this.scaleId = params.scale || 'right';
    }

    createSeries(chart) {
        const series = chart.addLineSeries({ color: this.color, lineWidth: 2, priceScaleId: this.scaleId });
        this.series = [series];
        return series;
    }

    computeFull(data) {
        const closes = data.map(d => d.close);
        const sma = Utils.calculateSMA(closes, this.period);
        const times = data.map(d => d.time);
        const offset = this.period - 1;
        return sma.map((val, i) => ({ time: times[offset + i], value: val }));
    }

    updateLast(candle, allData) {
        const closes = allData.map(d => d.close);
        if (closes.length < this.period) return null;
        const sum = closes.slice(-this.period).reduce((a, b) => a + b, 0);
        const value = sum / this.period;
        this.series[0].update({ time: candle.time, value });
        return value;
    }
}