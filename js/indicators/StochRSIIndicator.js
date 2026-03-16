import { BaseIndicator } from './BaseIndicator.js';
import { Utils } from '../utils.js';

export class StochRSIIndicator extends BaseIndicator {
    constructor(params, chartManager) {
        super('stochrsi', params, chartManager);
        this.period = params.period || 14;
        this.k = params.k || 3;
        this.d = params.d || 3;
        this.colors = params.colors || ['#FFD700', '#FF69B4'];
        this.scaleId = params.scale || 'stoch';
    }

    createSeries(chart) {
    const kSeries = chart.addLineSeries({ 
        color: this.colors[0], 
        lineWidth: 2, 
        priceScaleId: this.scaleId,
        lastValueVisible: false,
        priceLineVisible: false
    });
    const dSeries = chart.addLineSeries({ 
        color: this.colors[1], 
        lineWidth: 2, 
        priceScaleId: this.scaleId,
        lastValueVisible: false,
        priceLineVisible: false
    });
    this.series = [kSeries, dSeries];
    return this.series;
}

    computeFull(data) {
        const closes = data.map(d => d.close);
        const times = data.map(d => d.time);
        const { k, d } = Utils.calculateStochRSI(closes, this.period, this.k, this.d);
        const offset = closes.length - k.length;
        const kData = k.map((val, i) => ({ time: times[offset + i], value: val }));
        const dData = d.map((val, i) => ({ time: times[offset + i + this.k - 1], value: val }));
        return [kData, dData];
    }

    updateLast(candle, allData) {
        if (allData.length < this.period + this.k) return;
        const closes = allData.map(d => d.close);
        const { k, d } = Utils.calculateStochRSI(closes, this.period, this.k, this.d);
        if (k.length) {
            const kVal = k[k.length - 1];
            if (this.series[0]) this.series[0].update({ time: candle.time, value: kVal });
            if (d.length && this.series[1]) {
                const dVal = d[d.length - 1];
                this.series[1].update({ time: candle.time, value: dVal });
            }
        }
    }
}