import { BaseIndicator } from './BaseIndicator.js';
import { Utils } from '../utils.js';

export class ATRIndicator extends BaseIndicator {
    constructor(params, chartManager) {
        super('atr', params, chartManager);
        this.period = params.period || 14;
        this.color = params.color || '#FFA500';
        this.scaleId = params.scale || 'atr';
    }

    createSeries(chart) {
        const series = chart.addLineSeries({ color: this.color, lineWidth: 2, priceScaleId: this.scaleId });
        this.series = [series];
        return series;
    }

    computeFull(data) {
        const highs = data.map(d => d.high);
        const lows = data.map(d => d.low);
        const closes = data.map(d => d.close);
        const times = data.map(d => d.time);
        const atr = Utils.calculateATR(highs, lows, closes, this.period);
        const offset = data.length - atr.length;
        return atr.map((val, i) => ({ time: times[offset + i], value: val }));
    }

    updateLast(candle, allData) {
        if (allData.length < this.period + 1) return;
        const highs = allData.map(d => d.high);
        const lows = allData.map(d => d.low);
        const closes = allData.map(d => d.close);
        const atr = Utils.calculateATR(highs, lows, closes, this.period);
        if (atr.length) {
            const value = atr[atr.length - 1];
            if (value !== undefined && !isNaN(value)) {
                this.series[0].update({ time: candle.time, value });
            }
        }
    }
}