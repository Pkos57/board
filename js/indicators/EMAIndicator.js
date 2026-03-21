import { BaseIndicator } from './BaseIndicator.js';
import { Utils } from '../utils.js';

export class EMAIndicator extends BaseIndicator {
    constructor(params, chartManager) {
        super('ema', params, chartManager);
        this.period = params.period || 20;
        this.color = params.color || '#00E5FF';
        this.scaleId = params.scale || 'right';
    }

    createSeries(chart) {
        const series = chart.addLineSeries({ color: this.color, lineWidth: 2, priceScaleId: this.scaleId });
        this.series = [series];
        return series;
    }

    computeFull(data) {
        const closes = data.map(d => d.close);
        const ema = Utils.calculateEMA(closes, this.period);
        const times = data.map(d => d.time);
        return ema.map((val, i) => ({ time: times[i], value: val })).filter(d => d.value !== null);
    }

    updateLast(candle, allData) {
        if (allData.length < this.period) return null;
        const closes = allData.map(d => d.close);
        const ema = Utils.calculateEMA(closes, this.period);
        const value = ema[ema.length - 1];
        if (value !== null && !isNaN(value)) {
            this.series[0].update({ time: candle.time, value });
        }
        return value;
    }
}